"""Suspended accounts.

A suspension stops a person from using the platform for a set number of days
or until an administrator lifts it. Their data stays as it is; while the
suspension lasts they are left out of every count made over active people. The
reason is shown to them, after they have proved with a code that the address
is theirs, so the sign-in screen never tells anyone else who is suspended.
"""

from __future__ import annotations

from datetime import datetime

import psycopg

DURATIONS = (1, 7, 30)        # days; no duration means until lifted


def in_force(conn: psycopg.Connection, person_id: int) -> dict | None:
    """The suspension that applies now, after ending this person's if its time
    is up.

    Locks the person's row first, as starting and lifting a suspension do, so
    the answer holds until the caller's transaction ends.
    """
    conn.execute("SELECT 1 FROM app.person WHERE id = %s FOR UPDATE", (person_id,))
    conn.execute("SELECT app.lift_expired_suspensions(%s)", (person_id,))
    row = conn.execute(
        "SELECT s.id, s.starts_at, s.ends_at, s.reason, s.note"
        " FROM app.suspension s"
        " WHERE s.person_id = %s AND s.lifted_at IS NULL",
        (person_id,),
    ).fetchone()
    if row is None:
        return None
    return {"id": row[0], "starts_at": row[1], "ends_at": row[2], "reason": row[3],
            "note": row[4]}


def notice(suspension: dict) -> dict:
    """What the person is told: that the account is suspended, until when, and why."""
    until = suspension["ends_at"]
    return {"code": "suspended",
            "until": until.isoformat() if isinstance(until, datetime) else None,
            "reason": suspension["reason"]}


def suspend(conn: psycopg.Connection, person_id: int, days: int | None, reason: str,
            note: str | None, admin_user_id: int) -> dict:
    """Start a suspension and end every session the person has open. The caller
    holds the person's row."""
    row = conn.execute(
        "INSERT INTO app.suspension (person_id, ends_at, reason, note, created_by)"
        " VALUES (%s, CASE WHEN %s::integer IS NULL THEN NULL"
        "                  ELSE now() + make_interval(days => %s::integer) END,"
        "         %s, %s, %s)"
        " RETURNING id, starts_at, ends_at, reason, note",
        (person_id, days, days, reason, note, admin_user_id),
    ).fetchone()
    # To the millisecond, as the session cookie records its time.
    conn.execute(
        "UPDATE app.person SET status = 'suspended',"
        " sessions_from = greatest(sessions_from, date_trunc('milliseconds', now()))"
        " WHERE id = %s",
        (person_id,),
    )
    return {"id": row[0], "starts_at": row[1], "ends_at": row[2], "reason": row[3],
            "note": row[4]}


def lift(conn: psycopg.Connection, person_id: int, admin_user_id: int,
         note: str | None) -> bool:
    """End a suspension before its time. The caller holds the person's row."""
    lifted = conn.execute(
        "UPDATE app.suspension SET lifted_at = now(), lifted_by = %s, lift_note = %s"
        " WHERE person_id = %s AND lifted_at IS NULL RETURNING id",
        (admin_user_id, note, person_id),
    ).fetchone()
    if lifted is None:
        return False
    conn.execute(
        "UPDATE app.person SET status = 'active' WHERE id = %s AND status = 'suspended'",
        (person_id,),
    )
    return True
