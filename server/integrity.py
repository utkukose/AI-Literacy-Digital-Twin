"""Attempts set aside by an administrator, and finishes too quick to have been read.

Points, the twin, calibration, the shared difficulty of steps and every campus
count are built from step results. Setting an attempt aside takes its step
results out of all of them and keeps them, with the reason, beside the attempt:

  * the points the attempt earned leave the person's total and the ranking;
  * the twin and the steps' difficulty move back by what each answer moved
    them, and calibration and the spaced review of each area are worked out
    again from the answers left;
  * the attempt is no longer finished, so it leaves every count of people who
    finished, and it keeps its place, so the case cannot be solved again;
  * a rare mark or a medal it earned is taken back, and the conditions are
    checked again without it (awards.attempt_set_aside).

Undoing it puts everything back as it was. The person is shown the reason on
the case.

Nothing here decides on its own: a finish that looks too quick is only put on
the review list, where an administrator looks at it.
"""

from __future__ import annotations

import json
from datetime import timedelta

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

import awards
import scoring
from service import REVIEW_INTERVALS

FAST_SETTING = "fast_finish_percent"
FAST_DEFAULT = 20


class AlreadyVoided(Exception):
    pass


class NotVoided(Exception):
    pass


# The columns of a step result kept when the attempt is set aside, in the order
# they are put back.
RESULT_COLUMNS = ("id", "case_step_id", "dimension", "outcome_x", "confidence_c",
                  "points_awarded", "theta_before", "theta_after", "p_predicted",
                  "answered_at", "difficulty_shift")


def recalibrate(cur, person_id: int) -> None:
    """Work calibration out again from the answers the person has now."""
    cur.execute(
        "SELECT sr.outcome_x, sr.confidence_c FROM app.step_result sr"
        " JOIN app.attempt a ON a.id = sr.attempt_id"
        " WHERE a.person_id = %s AND sr.confidence_c IS NOT NULL"
        " ORDER BY sr.answered_at DESC LIMIT %s",
        (person_id, scoring.CALIBRATION_WINDOW))
    rows = cur.fetchall()
    if not rows:
        cur.execute("DELETE FROM app.calibration WHERE person_id = %s", (person_id,))
        return
    briers = [scoring.brier(r["outcome_x"], r["confidence_c"]) for r in rows]
    cur.execute(
        "INSERT INTO app.calibration (person_id, brier_mean, n) VALUES (%s, %s, %s)"
        " ON CONFLICT (person_id) DO UPDATE"
        " SET brier_mean = EXCLUDED.brier_mean, n = EXCLUDED.n, updated_at = now()",
        (person_id, scoring.calibration_index(briers), len(briers)))


def reschedule(cur, person_id: int, dimensions) -> None:
    """Work out again when each of these areas comes back for review, from
    the answers the person has now, answer by answer as they were graded: a
    miss brings the area back a day later, a success once it is due pushes it
    further out, and past the last interval it leaves the list."""
    for dimension in sorted(set(dimensions)):
        cur.execute(
            "SELECT sr.outcome_x, sr.answered_at FROM app.step_result sr"
            " JOIN app.attempt a ON a.id = sr.attempt_id"
            " WHERE a.person_id = %s AND sr.dimension = %s"
            " ORDER BY sr.answered_at, sr.id", (person_id, dimension))
        due = None                      # (when, interval in days)
        for r in cur.fetchall():
            at = r["answered_at"]
            if r["outcome_x"] < scoring.SUCCESS_THRESHOLD:
                due = (at + timedelta(days=1), 1)
            elif due is not None and due[0] <= at:
                later = [d for d in REVIEW_INTERVALS if d > due[1]]
                due = (at + timedelta(days=later[0]), later[0]) if later else None
        if due is None:
            cur.execute("DELETE FROM app.review_due WHERE person_id = %s AND dimension = %s",
                        (person_id, dimension))
        else:
            cur.execute(
                "INSERT INTO app.review_due (person_id, dimension, due_at, interval_days)"
                " VALUES (%s, %s, %s, %s)"
                " ON CONFLICT (person_id, dimension) DO UPDATE"
                "   SET due_at = EXCLUDED.due_at, interval_days = EXCLUDED.interval_days",
                (person_id, dimension, due[0], due[1]))


def _move_twin_and_steps(cur, person_id: int, variant_key: str, results: list[dict],
                         sign: int) -> None:
    """Move the twin and the steps' difficulty by what these answers moved them,
    back (sign -1) or forward again (sign +1).

    Rows are locked in a fixed order, the twin before the steps, as an answer
    being graded locks them, so the two cannot wait on each other."""
    by_dimension: dict[str, tuple[float, int]] = {}
    for r in results:
        delta, count = by_dimension.get(r["dimension"], (0.0, 0))
        by_dimension[r["dimension"]] = (delta + r["theta_after"] - r["theta_before"], count + 1)
    for dimension in sorted(by_dimension):
        delta, count = by_dimension[dimension]
        cur.execute(
            "INSERT INTO app.twin_state (person_id, dimension) VALUES (%s, %s)"
            " ON CONFLICT (person_id, dimension) DO NOTHING", (person_id, dimension))
        cur.execute(
            "UPDATE app.twin_state SET theta = theta + %s,"
            "       attempts = greatest(attempts + %s, 0), updated_at = now()"
            " WHERE person_id = %s AND dimension = %s",
            (sign * delta, sign * count, person_id, dimension))
    for r in sorted(results, key=lambda r: r["case_step_id"]):
        cur.execute(
            "UPDATE app.step_difficulty SET b = b + %s, n = greatest(n + %s, 0),"
            "       updated_at = now()"
            " WHERE case_step_id = %s AND variant_key = %s",
            (sign * r["difficulty_shift"], sign, r["case_step_id"], variant_key))


def void(conn: psycopg.Connection, attempt_id: int, admin_user_id: int, reason: str) -> dict:
    """Set an attempt aside. The caller commits."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT id, person_id, variant_key, finished_at FROM app.attempt"
            " WHERE id = %s FOR UPDATE", (attempt_id,))
        attempt = cur.fetchone()
        if attempt is None:
            raise LookupError("no such attempt")
        # Asked once the attempt is held, so a decision made while this one
        # waited for it is seen.
        cur.execute("SELECT 1 FROM app.attempt_void WHERE attempt_id = %s", (attempt_id,))
        if cur.fetchone() is not None:
            raise AlreadyVoided()
        cur.execute(
            "SELECT " + ", ".join(f"sr.{c}" for c in RESULT_COLUMNS[:-1])
            + ", sr.difficulty_shift, sd.n AS observations"
            " FROM app.step_result sr"
            " LEFT JOIN app.step_difficulty sd"
            "   ON sd.case_step_id = sr.case_step_id AND sd.variant_key = %s"
            " WHERE sr.attempt_id = %s ORDER BY sr.answered_at, sr.id",
            (attempt["variant_key"], attempt_id))
        results = []
        for r in cur.fetchall():
            shift = r["difficulty_shift"]
            if shift is None:
                # Recorded before the shift was kept: the same surprise at the
                # step's rate now, a little lower than it was then, so the
                # estimate errs on moving it back too little.
                shift = -scoring.difficulty_rate(max((r["observations"] or 1) - 1, 0)) \
                    * (r["outcome_x"] - r["p_predicted"])
            results.append({**{c: r[c] for c in RESULT_COLUMNS[:-1]}, "difficulty_shift": shift})

        _move_twin_and_steps(cur, attempt["person_id"], attempt["variant_key"], results, -1)
        cur.execute("DELETE FROM app.step_result WHERE attempt_id = %s", (attempt_id,))
        cur.execute("UPDATE app.attempt SET finished_at = NULL WHERE id = %s", (attempt_id,))
        points = sum(r["points_awarded"] for r in results)
        cur.execute(
            "INSERT INTO app.attempt_void (attempt_id, voided_by, reason, finished_at, points,"
            "  results) VALUES (%s, %s, %s, %s, %s, %s)",
            (attempt_id, admin_user_id, reason, attempt["finished_at"], points,
             Json(json.loads(json.dumps(results, default=str)))))
        recalibrate(cur, attempt["person_id"])
        reschedule(cur, attempt["person_id"], [r["dimension"] for r in results])
        # Whatever was waiting on the list about this attempt is settled by it.
        cur.execute(
            "UPDATE app.review_item SET state = 'resolved', resolved_at = now(),"
            "       resolved_by = %s, note = %s"
            " WHERE attempt_id = %s AND state = 'open'",
            (admin_user_id, reason, attempt_id))
    taken = awards.attempt_set_aside(conn, attempt_id, attempt["person_id"])
    return {"attempt_id": attempt_id, "person_id": attempt["person_id"],
            "points": round(points, 1), "steps": len(results), "awards_taken": taken}


def restore(conn: psycopg.Connection, attempt_id: int) -> dict:
    """Undo setting an attempt aside: its answers count again, as they did.
    The caller commits."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT person_id, variant_key FROM app.attempt WHERE id = %s FOR UPDATE",
                    (attempt_id,))
        attempt = cur.fetchone()
        cur.execute("SELECT finished_at, points, results FROM app.attempt_void"
                    " WHERE attempt_id = %s FOR UPDATE", (attempt_id,))
        kept = cur.fetchone()
        if attempt is None or kept is None:
            raise NotVoided()
        results = kept["results"]
        for r in results:
            cur.execute(
                "INSERT INTO app.step_result (attempt_id, " + ", ".join(RESULT_COLUMNS) + ")"
                " VALUES (%s, " + ", ".join(["%s"] * len(RESULT_COLUMNS)) + ")",
                (attempt_id, *[r[c] for c in RESULT_COLUMNS]))
        _move_twin_and_steps(cur, attempt["person_id"], attempt["variant_key"], results, +1)
        cur.execute("UPDATE app.attempt SET finished_at = %s WHERE id = %s",
                    (kept["finished_at"], attempt_id))
        cur.execute("DELETE FROM app.attempt_void WHERE attempt_id = %s", (attempt_id,))
        recalibrate(cur, attempt["person_id"])
        reschedule(cur, attempt["person_id"], [r["dimension"] for r in results])
    earned = awards.attempt_restored(conn, attempt["person_id"])
    return {"attempt_id": attempt_id, "person_id": attempt["person_id"],
            "points": round(kept["points"], 1), "steps": len(results), "awards_earned": earned}


def voided(conn: psycopg.Connection, attempt_id: int) -> dict | None:
    """Whether an attempt was set aside, and why."""
    row = conn.execute("SELECT voided_at, reason FROM app.attempt_void WHERE attempt_id = %s",
                       (attempt_id,)).fetchone()
    return {"at": row[0].isoformat(), "reason": row[1]} if row else None


def fast_percent(conn: psycopg.Connection) -> int:
    row = conn.execute("SELECT value FROM app.platform_setting WHERE key = %s",
                       (FAST_SETTING,)).fetchone()
    try:
        return int(row[0]) if row is not None else FAST_DEFAULT
    except (TypeError, ValueError):
        return FAST_DEFAULT


def check_fast_finish(conn: psycopg.Connection, attempt_id: int,
                      estimated_minutes: float | None) -> bool:
    """Put a finish on the review list when it came far sooner than the case
    can be read and was nearly all right.

    Fast and wrong is clicking through, not a reason to look. Authors and
    administrators know the answers and are left out. The caller commits.
    """
    percent = fast_percent(conn)
    if percent <= 0 or not estimated_minutes:
        return False
    row = conn.execute(
        "SELECT a.person_id, cr.case_key,"
        "       extract(epoch FROM a.finished_at - a.started_at)::float8,"
        "       count(sr.id), avg(sr.outcome_x)::float8,"
        "       count(*) FILTER (WHERE sr.outcome_x >= %s)"
        " FROM app.attempt a JOIN app.case_registry cr ON cr.id = a.case_id"
        " JOIN app.step_result sr ON sr.attempt_id = a.id"
        " WHERE a.id = %s AND a.finished_at IS NOT NULL"
        "   AND NOT EXISTS (SELECT 1 FROM app.admin_user au"
        "                   WHERE au.person_id = a.person_id AND au.revoked_at IS NULL)"
        "   AND NOT EXISTS (SELECT 1 FROM app.case_author ca"
        "                   WHERE ca.person_id = a.person_id AND ca.revoked_at IS NULL)"
        " GROUP BY a.person_id, cr.case_key, a.finished_at, a.started_at",
        (scoring.SUCCESS_THRESHOLD, attempt_id)).fetchone()
    if row is None:
        return False
    person_id, case_key, seconds, steps, mean_outcome, right = row
    expected = float(estimated_minutes) * 60
    if seconds >= expected * percent / 100 or mean_outcome < scoring.SUCCESS_THRESHOLD:
        return False
    detail = {"case": case_key, "seconds": round(seconds), "expected": round(expected),
              "steps": steps, "right": right}
    conn.execute(
        "INSERT INTO app.review_item (person_id, reason, detail, attempt_id)"
        " VALUES (%s, 'fast_finish', %s, %s) ON CONFLICT DO NOTHING",
        (person_id, json.dumps(detail), attempt_id))
    return True
