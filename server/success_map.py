"""From the twin's sealed prediction to the chance of a success.

The twin's prediction P = sigmoid(theta - b) is the expected graded outcome of
a step, partial credit included. A person's confidence is a bet on something
else: that the outcome reaches the success threshold. On a step graded all or
nothing the two are the same; on a step with partial credit an expected
outcome of 0.6 is mostly made of answers below 0.8, so P overstates the chance
of a success there.

To set the twin beside the person on the same event, each prediction is read
through the campus record: among the steps of the same kind whose prediction
fell in the same tenth, the share that were successes. A cell with few
answers is pulled towards P itself by PRIOR pseudo-answers, so the map starts
as the identity and moves only as answers come in:

    q = (k + PRIOR * P) / (n + PRIOR)

where n answers fell in the cell and k of them were successes.

Step kinds live in the case bodies rather than in the database, so the map is
built in Python and kept for TTL seconds.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from pathlib import Path

import psycopg

import case_loader as cl
import scoring

PRIOR = 20
TTL = 600.0

CELLS_SQL = """
SELECT cr.case_key, cs.step_key, least(floor(sr.p_predicted * 10)::int, 9) AS tenth,
       count(*) AS n, sum((sr.outcome_x >= %(success)s)::int) AS k
FROM app.step_result sr
JOIN app.case_step cs ON cs.id = sr.case_step_id
JOIN app.case_registry cr ON cr.id = cs.case_id
JOIN app.attempt a ON a.id = sr.attempt_id
JOIN app.person p ON p.id = a.person_id AND p.status = 'active'
WHERE sr.p_predicted IS NOT NULL
GROUP BY 1, 2, 3
"""

_lock = threading.Lock()
_cache: dict = {}


def tenth(p: float) -> int:
    return min(max(int(p * 10), 0), 9)


def step_kinds(conn: psycopg.Connection, root: Path, case_keys) -> dict:
    """(case key, step key) -> kind, from the case bodies."""
    kinds = {}
    for key in sorted(set(case_keys)):
        try:
            body = cl.load_case(root, key, cl.DEFAULT_LOCALE, conn).body
        except (cl.CaseNotFound, ValueError):
            continue
        for s in body.get("steps", []):
            kinds[(key, s["id"])] = s.get("kind")
    return kinds


def build(conn: psycopg.Connection, root: Path) -> tuple[dict, dict]:
    """The campus cells, (kind, tenth) -> [n, k], and the kind of each step."""
    rows = conn.execute(CELLS_SQL, {"success": scoring.SUCCESS_THRESHOLD}).fetchall()
    kinds = step_kinds(conn, root, [r[0] for r in rows])
    cells: dict = defaultdict(lambda: [0, 0])
    for case_key, step_key, t, n, k in rows:
        cell = cells[(kinds.get((case_key, step_key)), t)]
        cell[0] += n
        cell[1] += k
    return dict(cells), kinds


def current(conn: psycopg.Connection, root: Path) -> tuple[dict, dict]:
    """The map, built at most once per TTL seconds."""
    now = time.monotonic()
    with _lock:
        hit = _cache.get(str(root))
        if hit is not None and now - hit[0] < TTL:
            return hit[1], hit[2]
    cells, kinds = build(conn, root)
    with _lock:
        _cache[str(root)] = (now, cells, kinds)
    return cells, kinds


def forget() -> None:
    with _lock:
        _cache.clear()


def chance(cells: dict, kind: str | None, p: float) -> float:
    """The chance of a success for a step of this kind sealed at P."""
    n, k = cells.get((kind, tenth(p)), (0, 0))
    return (k + PRIOR * p) / (n + PRIOR)
