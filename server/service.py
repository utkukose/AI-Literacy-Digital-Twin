"""Transactional scoring service.

One submitted step must move five things together or none of them: the step
result, the person's ability in that dimension, the step's difficulty, their
points, and their calibration. A partial write leaves a twin that disagrees with
its own history, so all of it happens inside a single transaction under row
locks.

Locks are always taken in the same order, twin_state then step_difficulty. The
difficulty row is shared by everyone answering that step, and the fixed order
keeps simultaneous submissions of the same step free of deadlock.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row

import scoring
from grading import GRADERS, Grade, normalise_submission

log = logging.getLogger(__name__)


class AlreadySubmitted(Exception):
    """The step has a recorded result; submissions are not replayable."""


class CaseUnavailable(Exception):
    """The case is not published to this person, or its window has closed."""


class AttemptVoided(Exception):
    """The attempt was set aside by an administrator and takes no answers."""


@dataclass(frozen=True)
class StepOutcome:
    outcome: float
    p_predicted: float
    theta_before: float
    theta_after: float
    points: float
    detail: dict


# ---------------------------------------------------------------------------
# Starting an attempt
# ---------------------------------------------------------------------------

START_ATTEMPT_SQL = """
INSERT INTO app.attempt (
    person_id, case_id, variant_key, unit_id_snap, role_snap, point_ratio, session_issued,
    locale
)
SELECT p.id, %(case_id)s, %(variant_key)s, p.unit_id, p.role, %(point_ratio)s,
       %(session_issued)s, %(locale)s::app.locale
FROM app.person p
WHERE p.id = %(person_id)s AND p.status = 'active'
ON CONFLICT (person_id, case_id) DO NOTHING
RETURNING id, variant_key, point_ratio, locale::text
"""

LOAD_CASE_SQL = """
SELECT id, case_key, type, status, audience, publish_at, close_at
FROM app.case_registry
WHERE case_key = %(case_key)s
"""


def start_attempt(conn: psycopg.Connection, person_id: int, pseudonym: str,
                  case_key: str, variant_keys: list[str], role: str,
                  session_issued=None, locale: str = "tr") -> dict:
    """Open or resume an attempt, fixing the variant on first entry.

    The variant is derived from the pseudonym and the case key, so a resumed
    session cannot be used to shop for an easier one. `session_issued` names
    the solving session a new attempt is counted under, and `locale` the
    language it is solved in.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        # Cheap and idempotent: a deployment with no cron still opens cases on
        # time, because the read path does it.
        cur.execute("SELECT app.refresh_case_status()")
        cur.execute(LOAD_CASE_SQL, {"case_key": case_key})
        case = cur.fetchone()
        if case is None:
            raise CaseUnavailable(f"{case_key} is not published")
        cur.execute("SELECT app.case_open_for(%s, %s)", (case["id"], person_id))
        if not cur.fetchone()["case_open_for"]:
            raise CaseUnavailable(f"{case_key} is not open for this person")

        ratio = 1.0 if case["status"] == "live" else scoring.ARCHIVE_POINT_RATIO
        variant = scoring.assign_variant(pseudonym, case_key, variant_keys)

        cur.execute(START_ATTEMPT_SQL, {
            "person_id": person_id, "case_id": case["id"],
            "variant_key": variant, "point_ratio": ratio,
            "session_issued": session_issued, "locale": locale,
        })
        row = cur.fetchone()
        if row is None:
            # Conflict: an attempt exists. Its stored variant wins over a
            # recomputed one, so that a case edited mid-week cannot move a
            # person onto different material halfway through.
            cur.execute(
                "SELECT id, variant_key, point_ratio, locale::text AS locale FROM app.attempt"
                " WHERE person_id = %s AND case_id = %s",
                (person_id, case["id"]),
            )
            row = cur.fetchone()

        # How far this person already got, so a half-finished case resumes at
        # the first unanswered step.
        cur.execute(
            "SELECT count(*) AS done FROM app.step_result WHERE attempt_id = %s",
            (row["id"],),
        )
        answered = cur.fetchone()["done"]

    return {"attempt_id": row["id"], "variant_key": row["variant_key"],
            "answered": answered, "locale": row["locale"],
            "point_ratio": float(row["point_ratio"]), "case_id": case["id"]}


# ---------------------------------------------------------------------------
# Submitting a step
# ---------------------------------------------------------------------------

LOCK_TWIN_SQL = """
INSERT INTO app.twin_state (person_id, dimension)
VALUES (%(person_id)s, %(dimension)s)
ON CONFLICT (person_id, dimension) DO NOTHING
"""

SELECT_TWIN_SQL = """
SELECT theta, attempts FROM app.twin_state
WHERE person_id = %(person_id)s AND dimension = %(dimension)s
FOR UPDATE
"""

LOCK_DIFFICULTY_SQL = """
INSERT INTO app.step_difficulty (case_step_id, variant_key)
VALUES (%(case_step_id)s, %(variant_key)s)
ON CONFLICT (case_step_id, variant_key) DO NOTHING
"""

SELECT_DIFFICULTY_SQL = """
SELECT b, n FROM app.step_difficulty
WHERE case_step_id = %(case_step_id)s AND variant_key = %(variant_key)s
FOR UPDATE
"""

INSERT_RESULT_SQL = """
INSERT INTO app.step_result (
    attempt_id, case_step_id, dimension, outcome_x, confidence_c,
    points_awarded, theta_before, theta_after, p_predicted, difficulty_shift
) VALUES (
    %(attempt_id)s, %(case_step_id)s, %(dimension)s, %(outcome)s, %(confidence)s,
    %(points)s, %(theta_before)s, %(theta_after)s, %(p_predicted)s, %(difficulty_shift)s
)
ON CONFLICT (attempt_id, case_step_id) DO NOTHING
RETURNING id
"""

UPDATE_TWIN_SQL = """
UPDATE app.twin_state
SET theta = %(theta)s, attempts = attempts + 1, updated_at = now()
WHERE person_id = %(person_id)s AND dimension = %(dimension)s
"""

UPDATE_DIFFICULTY_SQL = """
UPDATE app.step_difficulty
SET b = %(b)s, n = n + 1, updated_at = now()
WHERE case_step_id = %(case_step_id)s AND variant_key = %(variant_key)s
"""

RECENT_BRIERS_SQL = """
SELECT sr.outcome_x, sr.confidence_c
FROM app.step_result sr
JOIN app.attempt a ON a.id = sr.attempt_id
WHERE a.person_id = %(person_id)s AND sr.confidence_c IS NOT NULL
ORDER BY sr.answered_at DESC
LIMIT %(window)s
"""

UPSERT_CALIBRATION_SQL = """
INSERT INTO app.calibration (person_id, brier_mean, n)
VALUES (%(person_id)s, %(brier_mean)s, %(n)s)
ON CONFLICT (person_id) DO UPDATE
SET brier_mean = EXCLUDED.brier_mean, n = EXCLUDED.n, updated_at = now()
"""


def submit_step(
    conn: psycopg.Connection,
    *,
    person_id: int,
    attempt_id: int,
    case_step_id: int,
    variant_key: str,
    dimension: str,
    base_points: int,
    point_ratio: float,
    kind: str,
    submission: dict,
    answer_key: dict,
    confidence: float | None,
    expected: float | None = None,
) -> StepOutcome:
    """Grade one step and commit every consequence of it atomically.

    `expected` is the twin's sealed prediction for the step, used as the
    expected score so the update moves by the surprise the person was shown.
    """
    grader = GRADERS.get(kind)
    if grader is None:
        raise ValueError(f"unknown step kind: {kind}")

    grade: Grade = grader(**normalise_submission(kind, submission), **answer_key)

    with conn.transaction():
        with conn.cursor(row_factory=dict_row) as cur:
            # The attempt is held while its answer is recorded, in the order
            # setting it aside takes its rows: the attempt, the twin, the step.
            # Whether it was set aside is asked only once it is held: the
            # statement that waited for it would not see a decision made
            # while it waited.
            cur.execute("SELECT 1 FROM app.attempt WHERE id = %(attempt_id)s FOR UPDATE",
                        {"attempt_id": attempt_id})
            held = cur.fetchone() is not None
            cur.execute("SELECT EXISTS (SELECT 1 FROM app.attempt_void"
                        "               WHERE attempt_id = %(attempt_id)s) AS voided",
                        {"attempt_id": attempt_id})
            if not held or cur.fetchone()["voided"]:
                raise AttemptVoided(f"attempt {attempt_id} takes no answers")

            twin_args = {"person_id": person_id, "dimension": dimension}
            cur.execute(LOCK_TWIN_SQL, twin_args)
            cur.execute(SELECT_TWIN_SQL, twin_args)
            twin = cur.fetchone()

            diff_args = {"case_step_id": case_step_id, "variant_key": variant_key}
            cur.execute(LOCK_DIFFICULTY_SQL, diff_args)
            cur.execute(SELECT_DIFFICULTY_SQL, diff_args)
            diff = cur.fetchone()

            update = scoring.elo_update(
                theta=twin["theta"],
                difficulty=diff["b"],
                outcome=grade.outcome,
                attempts=twin["attempts"],
                observations=diff["n"],
                expected=expected,
            )
            points = scoring.points_awarded(
                base_points, grade.outcome, confidence, point_ratio
            )

            cur.execute(INSERT_RESULT_SQL, {
                "attempt_id": attempt_id, "case_step_id": case_step_id,
                "dimension": dimension, "outcome": grade.outcome,
                "confidence": confidence, "points": points,
                "theta_before": update.theta_before,
                "theta_after": update.theta_after,
                "p_predicted": update.p_predicted,
                # Kept so that setting the attempt aside can move it back.
                "difficulty_shift": update.difficulty_after - update.difficulty_before,
            })
            if cur.fetchone() is None:
                raise AlreadySubmitted(
                    f"step {case_step_id} already recorded for attempt {attempt_id}"
                )

            cur.execute(UPDATE_TWIN_SQL, {**twin_args, "theta": update.theta_after})
            cur.execute(UPDATE_DIFFICULTY_SQL, {**diff_args, "b": update.difficulty_after})
            schedule_review(cur, person_id, dimension, grade.outcome)

            if confidence is not None:
                cur.execute(RECENT_BRIERS_SQL, {
                    "person_id": person_id, "window": scoring.CALIBRATION_WINDOW,
                })
                briers = [
                    scoring.brier(r["outcome_x"], r["confidence_c"]) for r in cur.fetchall()
                ]
                cur.execute(UPSERT_CALIBRATION_SQL, {
                    "person_id": person_id,
                    "brier_mean": scoring.calibration_index(briers),
                    "n": len(briers),
                })

    return StepOutcome(
        outcome=grade.outcome,
        p_predicted=update.p_predicted,
        theta_before=update.theta_before,
        theta_after=update.theta_after,
        points=points,
        detail=grade.detail,
    )


# ---------------------------------------------------------------------------
# Spaced review
# ---------------------------------------------------------------------------

# Days until an area comes back after a miss, and after each later success in
# it. Past the last interval the area leaves the review list.
REVIEW_INTERVALS = (1, 3, 7, 21)


def schedule_review(cur, person_id: int, dimension: str, outcome: float) -> None:
    """A miss brings the area back tomorrow; a success at a due review pushes
    the next return further out."""
    if outcome < scoring.SUCCESS_THRESHOLD:
        cur.execute(
            "INSERT INTO app.review_due (person_id, dimension, due_at, interval_days)"
            " VALUES (%s, %s, now() + interval '1 day', 1)"
            " ON CONFLICT (person_id, dimension) DO UPDATE"
            "   SET due_at = EXCLUDED.due_at, interval_days = 1",
            (person_id, dimension))
        return
    cur.execute(
        "SELECT interval_days FROM app.review_due"
        " WHERE person_id = %s AND dimension = %s AND due_at <= now() FOR UPDATE",
        (person_id, dimension))
    row = cur.fetchone()
    if row is None:
        return
    current = row["interval_days"] if isinstance(row, dict) else row[0]
    later = [d for d in REVIEW_INTERVALS if d > current]
    if not later:
        cur.execute("DELETE FROM app.review_due WHERE person_id = %s AND dimension = %s",
                    (person_id, dimension))
    else:
        cur.execute(
            "UPDATE app.review_due SET interval_days = %s,"
            " due_at = now() + make_interval(days => %s)"
            " WHERE person_id = %s AND dimension = %s",
            (later[0], later[0], person_id, dimension))


# ---------------------------------------------------------------------------
# Case selection
# ---------------------------------------------------------------------------

CANDIDATE_CASES_SQL = """
SELECT cr.id, cr.case_key, cr.title_tr, cr.locales::text[] AS locales, cs.dimension,
       avg(sd.b) AS difficulty, sum(sd.n) AS observations
FROM app.case_registry cr
JOIN app.case_step cs ON cs.case_id = cr.id
LEFT JOIN app.step_difficulty sd ON sd.case_step_id = cs.id
-- Targeting decides who a case is for; the role check lives inside
-- case_targets_person, so it is not repeated here and cannot drift from it.
WHERE app.case_open_for(cr.id, %(person_id)s)
  AND cr.locales && %(locales)s::app.locale[]
  AND NOT EXISTS (
      SELECT 1 FROM app.attempt a
      WHERE a.person_id = %(person_id)s AND a.case_id = cr.id
  )
GROUP BY cr.id, cr.case_key, cr.title_tr, cr.locales, cs.dimension
-- A fixed order, so that among cases that fit equally well the same one is
-- chosen every time.
ORDER BY cr.id, cs.dimension
"""


DIMENSIONS = ("prompt_design", "verification", "integrity", "privacy",
              "manipulation", "op_security", "boundaries")


def next_case(conn: psycopg.Connection, person_id: int, role: str,
              dimension: str | None = None, locales: list[str] | None = None,
              prefer: str = "tr") -> dict | None:
    """Pick the case that tells the twin the most about what it knows least.

    Weakest-known dimension first, then the case sitting closest to the target
    success probability within it. An unseen step carries difficulty zero, which
    places it near the middle of the scale — the right default for material with
    no evidence behind it yet.

    Only cases in `locales` are considered, and within an area a case in the
    `prefer` language comes before one that is not.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT dimension, theta, attempts FROM app.twin_state WHERE person_id = %s",
            (person_id,),
        )
        twin = {r["dimension"]: (r["theta"], r["attempts"]) for r in cur.fetchall()}
        for dim in DIMENSIONS:
            twin.setdefault(dim, (0.0, 0))

        cur.execute("SELECT app.refresh_case_status()")
        cur.execute(CANDIDATE_CASES_SQL, {"person_id": person_id, "role": role,
                                          "locales": locales or ["tr", "en"]})
        rows = cur.fetchall()
        offered = {r["dimension"] for r in rows}

        # In order: the area asked for; an area due for review; the area the
        # campus is focusing on, unless this person is already strong in it;
        # and otherwise the area the twin knows least.
        #
        # A review leads every other case at most: only when the person has
        # begun an even number of cases. Cases are chosen near a 65% chance of
        # success, so a miss, and with it a review, follows most of them; left
        # to itself the review list would choose almost every case, and the
        # areas the twin knows least would wait.
        reason, target_dim = None, None
        if dimension is not None:
            reason, target_dim = "requested", dimension
        cur.execute("SELECT count(*) AS n FROM app.attempt WHERE person_id = %s", (person_id,))
        review_turn = cur.fetchone()["n"] % 2 == 0
        if target_dim is None and review_turn:
            cur.execute(
                "SELECT dimension::text FROM app.review_due"
                " WHERE person_id = %s AND due_at <= now() ORDER BY due_at", (person_id,))
            due = next((r["dimension"] for r in cur.fetchall() if r["dimension"] in offered), None)
            if due:
                reason, target_dim = "review", due
        if target_dim is None:
            focus = campus_focus(conn)
            if (focus and focus["dimension"] in offered
                    and twin[focus["dimension"]][0] < FOCUS_SKIP_THETA):
                reason, target_dim = "focus", focus["dimension"]
        if target_dim is None:
            reason, target_dim = "least_known", scoring.select_next_dimension(twin)
        theta = twin[target_dim][0]

    # A person who asked for one area gets a case in that area or none; with a
    # small case bank the chosen area may have nothing left, so the selection
    # falls back to any open case.
    candidates = [r for r in rows if r["dimension"] == target_dim]
    if not candidates and dimension is None:
        candidates = rows
        if candidates:
            target_dim = candidates[0]["dimension"]
            theta = twin[target_dim][0]
            reason = "least_known"

    if not candidates:
        return None

    best = min(candidates, key=lambda r: (prefer not in r["locales"],
                                          scoring.case_fit(theta, r["difficulty"] or 0.0)))
    return {"case_id": best["id"], "case_key": best["case_key"],
            "title": best["title_tr"], "locales": best["locales"],
            "dimension": target_dim, "reason": reason}


# Above this ability an area the campus is focusing on is not pushed on a person.
FOCUS_SKIP_THETA = 1.0


def campus_focus(conn: psycopg.Connection) -> dict | None:
    """The area the administrators asked to bring forward, while it lasts."""
    row = conn.execute(
        "SELECT value FROM app.platform_setting WHERE key = 'campus_focus'").fetchone()
    focus = row[0] if row else None
    if not isinstance(focus, dict) or focus.get("dimension") not in DIMENSIONS:
        return None
    until = conn.execute("SELECT %s::timestamptz > now()", (focus.get("until"),)).fetchone()[0]
    return focus if until else None
