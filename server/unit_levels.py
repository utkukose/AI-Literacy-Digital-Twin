"""A unit's level in an area, read from all of its answers at once.

The mean of a unit's twins is a poor guide to how the unit compares with the
campus. A twin starts at zero and moves towards its person a step at a time,
so after the few answers most people give in an area it has come only part of
the way; the means of whole units then sit much closer together than the
people behind them, and a real difference rarely shows.

Instead, for a unit U and an area, the level theta_U solves

    sum (x - sigmoid(theta_U - b)) = RIDGE * (theta_U - theta_C)

over every answer the unit's people gave in the area. x is the graded
outcome and b the difficulty the step had when its prediction was sealed,
b = theta_before - logit(P), which is known for every answer and already
reflects how hard each step turned out to be. theta_C, the campus level, is
found the same way from everyone's answers without the ridge. The ridge,
worth about four answers, keeps a unit with few answers near the campus. The
standard error is the sandwich one with people as clusters, since one
person's answers are not independent of each other.

A unit is above the campus in an area when theta_U - theta_C exceeds MARGIN
and its 95% interval lies above zero, below the other way round, and level
with the campus otherwise. Only units with at least competence_threshold()
people in the area are worked out; app.v_unit_awareness publishes the bands,
never the levels.

Answers are grouped by difficulty in steps of 1/BIN, so that the estimate is
found from a few hundred numbers rather than every answer. The levels are kept
in app.unit_level and worked out again when they are older than MAX_AGE
seconds.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from typing import TYPE_CHECKING

if TYPE_CHECKING:          # the simulation imports solve and band without a database
    import psycopg

RIDGE = 1.0
MARGIN = 0.1
BIN = 20
MAX_AGE = 300
CLAMP = 6.0

# The difficulty each answer was sealed against, as a bin.
_B = "(sr.theta_before - ln(sr.p_predicted / (1 - sr.p_predicted)))"

BINS_SQL = f"""
SELECT p.unit_id, sr.dimension::text, round({_B} * {BIN})::int AS bin,
       count(*) AS n, sum(sr.outcome_x) AS sx
FROM app.step_result sr
JOIN app.attempt a ON a.id = sr.attempt_id
JOIN app.person p ON p.id = a.person_id AND p.status = 'active'
WHERE sr.p_predicted > 0 AND sr.p_predicted < 1 AND sr.theta_before IS NOT NULL
GROUP BY 1, 2, 3
"""

# Per person, the sum of the residuals against their unit's level.
RESIDUALS_SQL = f"""
WITH lv AS (
    SELECT * FROM jsonb_to_recordset(%s::jsonb) AS lv(unit_id bigint, dim text, theta float8)
)
SELECT r.unit_id, r.dim, sum(r.res * r.res)
FROM (
    SELECT p.unit_id, lv.dim, a.person_id,
           sum(sr.outcome_x - 1 / (1 + exp(-(lv.theta - {_B})))) AS res
    FROM app.step_result sr
    JOIN app.attempt a ON a.id = sr.attempt_id
    JOIN app.person p ON p.id = a.person_id AND p.status = 'active'
    JOIN lv ON lv.unit_id = p.unit_id AND lv.dim = sr.dimension::text
    WHERE sr.p_predicted > 0 AND sr.p_predicted < 1 AND sr.theta_before IS NOT NULL
    GROUP BY 1, 2, 3
) r
GROUP BY 1, 2
"""


def _sigmoid(z: float) -> float:
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    e = math.exp(z)
    return e / (1.0 + e)


def solve(bins: list[tuple[float, int, float]], center: float = 0.0,
          ridge: float = RIDGE) -> tuple[float, float]:
    """The level from (b, answers, sum of outcomes) bins, and the information
    at it (with the ridge)."""
    theta = center
    for _ in range(50):
        g = -ridge * (theta - center)
        h = ridge
        for b, n, sx in bins:
            p = _sigmoid(theta - b)
            g += sx - n * p
            h += n * p * (1 - p)
        if h <= 0:
            break
        step = max(-2.0, min(2.0, g / h))
        theta = max(-CLAMP, min(CLAMP, theta + step))
        if abs(step) < 1e-9:
            break
    h = ridge + sum(n * _sigmoid(theta - b) * (1 - _sigmoid(theta - b)) for b, n, _ in bins)
    return theta, h


def band(diff: float, se: float) -> str:
    """app.competence_band's rule, from the level's difference and its error."""
    if diff > MARGIN and diff - 1.96 * se > 0:
        return "above"
    if diff < -MARGIN and diff + 1.96 * se < 0:
        return "below"
    return "around"


def compute(conn: psycopg.Connection) -> list[dict]:
    """Every published unit's level, error and band in every area."""
    k = conn.execute("SELECT app.competence_threshold()").fetchone()[0]
    reporting = {(u, d) for u, d in conn.execute(
        "SELECT unit_id, dimension::text FROM app.v_unit_competence WHERE n_people >= %s",
        (k,)).fetchall()}
    by_unit: dict = defaultdict(list)
    campus: dict = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    for unit, dim, b, n, sx in conn.execute(BINS_SQL).fetchall():
        by_unit[(unit, dim)].append((b / BIN, n, float(sx)))
        cell = campus[dim][b]
        cell[0] += n
        cell[1] += float(sx)
    campus_level = {dim: solve([(b / BIN, n, sx) for b, (n, sx) in cells.items()], ridge=0.0)[0]
                    for dim, cells in campus.items()}
    levels = {}
    for (unit, dim), bins in by_unit.items():
        if (unit, dim) not in reporting:
            continue
        theta, info = solve(bins, center=campus_level[dim])
        levels[(unit, dim)] = (theta, info)
    if not levels:
        return []
    payload = json.dumps([{"unit_id": u, "dim": d, "theta": t}
                          for (u, d), (t, _) in levels.items()])
    spread = {(u, d): s for u, d, s in conn.execute(RESIDUALS_SQL, (payload,)).fetchall()}
    out = []
    for (unit, dim), (theta, info) in levels.items():
        se = math.sqrt(float(spread.get((unit, dim), 0.0))) / info
        out.append({"unit_id": unit, "dimension": dim, "theta": theta, "se": se,
                    "campus": campus_level[dim],
                    "band": band(theta - campus_level[dim], se)})
    return out


def refresh(conn: psycopg.Connection, max_age: float = MAX_AGE) -> bool:
    """Work the levels out again when they are older than max_age seconds.
    One process does it at a time; the others read what is there. Called
    before anything else on the connection, so that the work is a transaction
    of its own."""
    stale = conn.execute(
        "SELECT coalesce((SELECT computed_at < now() - make_interval(secs => %s)"
        "                 FROM app.unit_level_run), true)", (float(max_age),)).fetchone()[0]
    if not stale:
        return False
    with conn.transaction():
        if not conn.execute("SELECT pg_try_advisory_xact_lock(hashtext('app.unit_level'))"
                            ).fetchone()[0]:
            return False
        rows = compute(conn)
        conn.execute("DELETE FROM app.unit_level")
        for r in rows:
            conn.execute(
                "INSERT INTO app.unit_level (unit_id, dimension, theta, se, campus, band)"
                " VALUES (%s, %s::app.dimension, %s, %s, %s, %s)",
                (r["unit_id"], r["dimension"], r["theta"], r["se"], r["campus"], r["band"]))
        conn.execute("INSERT INTO app.unit_level_run (one, computed_at) VALUES (true, now())"
                     " ON CONFLICT (one) DO UPDATE SET computed_at = now()")
    return True
