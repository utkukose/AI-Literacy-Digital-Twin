"""How many cases a person may start, and when.

A solving session opens with the first case a person starts and lasts a fixed
number of minutes; within it only so many new cases may be started. A session
belongs to the sign-in that opened it, the moment an e-mailed code was verified,
which the signed session cookie carries. While it is open, the person may go on
from any device they are signed in on. When it ends a cooling-off period
follows, and the next session needs a sign-in made after the last one ended, so
every session starts with a new code. Separately, a weekly cap counts the cases
started since Monday, campus time.

A case already started can always be finished and reopened, so none of these
rules ever stops an answer. They decide only whether a new attempt may begin.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import psycopg

DEFAULTS = {
    "limits_enabled": True,
    "session_case_limit": 3,
    "session_minutes": 45,
    "cooldown_hours": 12,
    "weekly_case_limit": 10,
}

# The range each number may take in the panel.
BOUNDS = {
    "session_case_limit": (1, 20),
    "session_minutes": (10, 240),
    "cooldown_hours": (0, 168),
    "weekly_case_limit": (1, 100),
}


def settings(conn: psycopg.Connection) -> dict:
    rows = dict(conn.execute(
        "SELECT key, value FROM app.platform_setting WHERE key = ANY(%s)",
        (list(DEFAULTS),)).fetchall())
    return {key: rows.get(key, default) for key, default in DEFAULTS.items()}


def _iso(t: datetime | None) -> str | None:
    return t.isoformat() if t else None


def state(conn: psycopg.Connection, person_id: int, signed_in: datetime,
          exempt: bool = False) -> dict:
    """Where this person stands, and whether a new case may begin now.

    `session_key` is the sign-in a new attempt is counted under: the open
    session's, or this sign-in's when a new session would open.
    """
    cfg = settings(conn)
    limit = int(cfg["session_case_limit"])
    length = timedelta(minutes=int(cfg["session_minutes"]))
    cooldown = timedelta(hours=int(cfg["cooldown_hours"]))
    weekly = int(cfg["weekly_case_limit"])

    now, week_start = conn.execute(
        "SELECT now(), date_trunc('week', now() AT TIME ZONE 'Europe/Istanbul')"
        "              AT TIME ZONE 'Europe/Istanbul'").fetchone()
    week_used = conn.execute(
        "SELECT count(*) FROM app.attempt WHERE person_id = %s AND started_at >= %s",
        (person_id, week_start)).fetchone()[0]
    latest = conn.execute(
        "SELECT session_issued, min(started_at) AS opened, count(*) FROM app.attempt"
        " WHERE person_id = %s AND session_issued IS NOT NULL"
        " GROUP BY session_issued ORDER BY opened DESC LIMIT 1",
        (person_id,)).fetchone()

    is_open = latest is not None and now < latest[1] + length
    started = latest[2] if is_open else 0
    out = {
        "enabled": bool(cfg["limits_enabled"]),
        "exempt": exempt,
        "can_start": True,
        "reason": None,
        "until": None,
        "session_key": latest[0] if is_open else signed_in,
        "session": {
            "open": is_open,
            "opened_at": _iso(latest[1]) if is_open else None,
            "ends_at": _iso(latest[1] + length) if is_open else None,
            "started": started,
            "limit": limit,
            "left": max(0, limit - started),
            "minutes": int(cfg["session_minutes"]),
        },
        "week": {"used": week_used, "limit": weekly,
                 "resets_at": _iso(week_start + timedelta(days=7))},
        "cooldown_hours": int(cfg["cooldown_hours"]),
    }
    if not out["enabled"] or exempt:
        return out

    def block(reason: str, until: datetime | None) -> dict:
        out.update(can_start=False, reason=reason, until=_iso(until))
        return out

    if week_used >= weekly:
        return block("weekly", week_start + timedelta(days=7))
    if is_open:
        if started >= limit:
            return block("session_full", latest[1] + length + cooldown)
        return out
    if latest is not None:
        ended = latest[1] + length
        if now < ended + cooldown:
            return block("cooldown", ended + cooldown)
        if signed_in <= ended:
            return block("new_sign_in", None)
    return out
