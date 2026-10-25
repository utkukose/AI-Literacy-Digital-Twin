"""What the campus page shows to someone who has not signed in.

The campus map with its sky, weather and time bar, the counts for the campus
and for its buildings, the cases set on the campus and the announcements meant
for everyone are open to visitors while an administrator leaves the page open.
Three parts have switches of their own:

  * the campus twin: the rose and its areas, the forecast of the day and how
    sure the campus is of itself (open unless switched off);
  * each unit's areas against the campus (closed unless switched on);
  * the ranking (closed unless switched on), and even then it lists only the
    people who agreed to be seen from outside the platform as well.

Nothing a visitor is shown belongs to one person, apart from those ranking
rows. The demo is never open to visitors: its password is the point of it.

Visitors are served from memory. Each answer is worked out at most once in a
while, by one request at a time, so a link shared widely cannot bring the
database down; a switch turned in the panel reaches visitors at once.
"""

from __future__ import annotations

import threading
import time
from typing import Callable

# The switches and how a new installation has them.
SWITCHES: dict[str, bool] = {
    "public_campus": True,
    "public_campus_twin": True,
    "public_unit_awareness": False,
    "public_board": False,
}

# How long the switches are read from memory before the database is asked again.
SWITCH_TTL = 30.0

_lock = threading.Lock()
_held: dict[tuple, tuple[float, object]] = {}
_making: dict[tuple, threading.Lock] = {}
# Counts the times something was forgotten, so an answer that was being made
# while it happened is not kept: it may hold what was just changed.
_generation = 0


def held(key: tuple, ttl: float, make: Callable[[], object]):
    """What make() returns, kept for ttl seconds. While it is being made, other
    requests for the same answer wait for it instead of making it again."""
    with _lock:
        hit = _held.get(key)
        if hit is not None and time.monotonic() - hit[0] < ttl:
            return hit[1]
        gate = _making.setdefault(key, threading.Lock())
    with gate:
        with _lock:
            hit = _held.get(key)
            if hit is not None and time.monotonic() - hit[0] < ttl:
                return hit[1]
            started = _generation
        value = make()
        with _lock:
            if _generation == started:
                _held[key] = (time.monotonic(), value)
        return value


def read_switches(conn) -> dict[str, bool]:
    stored = dict(conn.execute(
        "SELECT key, value FROM app.platform_setting WHERE key = ANY(%s)",
        (list(SWITCHES),)).fetchall())
    return {k: stored[k] if isinstance(stored.get(k), bool) else default
            for k, default in SWITCHES.items()}


def switches(connect) -> dict[str, bool]:
    """The switches as they stand. `connect` opens a connection and is called
    only when what is held has grown old."""
    def read():
        with connect() as conn:
            return read_switches(conn)
    return held(("switches",), SWITCH_TTL, read)


def shown(state: dict[str, bool]) -> dict[str, bool]:
    """What a visitor may see, part by part. Every part needs the page itself."""
    page = state["public_campus"]
    return {"campus": page, "twin": page and state["public_campus_twin"],
            "units": page and state["public_unit_awareness"],
            "board": page and state["public_board"]}


def forget(kind: str | None = None) -> None:
    """Drop what is held, after a switch is turned or the data behind an
    answer changes in a way visitors should see at once: everything, or the
    answers of one kind ("board")."""
    global _generation
    with _lock:
        _generation += 1
        for key in [k for k in _held if kind is None or k[0] == kind]:
            del _held[key]
