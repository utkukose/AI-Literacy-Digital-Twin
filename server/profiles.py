"""Profiles: what a person sends, what is shown, and what waits for approval.

A profile that has never been approved belongs to the person alone. What they
send is used at once, and it goes to the approval queue to become public. Once
a profile has been approved, a change waits in the queue and the approved
profile stays in place until an administrator decides.

A member of staff says once whether they are academic or administrative staff,
when they first fill in their profile. Any later change of that, approved
profile or not, waits for an administrator, together with the title that goes
with it: the role decides which cases a person is offered and where they stand
on the ranking.

The queue holds at most one change per person. A newer change replaces the one
waiting, and going back to the approved profile withdraws it.

A full administrator can also correct a profile directly, for instance a title
or a role declared wrongly. The correction is in use at once, counts as
approved and closes a change the person was waiting on. The person reads its
reason on their profile screen.
"""

from __future__ import annotations

import psycopg
from psycopg.types.json import Json

FIELDS = ("given_name", "family_name", "title", "username", "unit_id", "role", "bio")
STAFF_ROLES = ("academic", "admin_staff")

# More than this many changes sent in a day is not someone correcting a typo.
SUBMISSIONS_PER_DAY = 10


class ChangeError(Exception):
    """A change that cannot be decided as asked. The message is for the
    reviewer, in Turkish and in English."""

    def __init__(self, status: int, message: str, english: str):
        super().__init__(message)
        self.status = status
        self.message = message
        self.english = english

    def text(self, locale: str) -> str:
        return self.english if locale == "en" else self.message


def lock(conn: psycopg.Connection, person_id: int) -> None:
    """Sending a change and deciding one both start here, so the two never
    interleave for the same person."""
    conn.execute("SELECT 1 FROM app.person WHERE id = %s FOR UPDATE", (person_id,))


def current(conn: psycopg.Connection, person_id: int) -> dict:
    """The profile in use: approved, or the person's own while it never was."""
    row = conn.execute(
        "SELECT pp.given_name, pp.family_name, pp.title, pp.username::text, p.unit_id,"
        "       p.role::text, pp.bio, pp.approved_at, p.unit_changed_at"
        " FROM app.person p"
        " LEFT JOIN identity.person_profile pp ON pp.person_id = p.id"
        " WHERE p.id = %s",
        (person_id,),
    ).fetchone()
    return {"values": dict(zip(FIELDS, row[:7])), "approved": row[7] is not None,
            "unit_changed_at": row[8]}


def waiting(conn: psycopg.Connection, person_id: int) -> dict | None:
    row = conn.execute(
        "SELECT id, first, given_name, family_name, title, username::text, unit_id,"
        "       role::text, bio"
        " FROM identity.profile_change WHERE person_id = %s AND state = 'pending'",
        (person_id,),
    ).fetchone()
    if row is None:
        return None
    return {"id": row[0], "first": row[1], "values": dict(zip(FIELDS, row[2:]))}


def _last_decision(conn: psycopg.Connection, person_id: int) -> str | None:
    row = conn.execute(
        "SELECT state::text FROM identity.profile_change"
        " WHERE person_id = %s AND state IN ('approved', 'rejected')"
        " ORDER BY decided_at DESC, id DESC LIMIT 1",
        (person_id,),
    ).fetchone()
    return row[0] if row else None


def same_value(field: str, now, sent) -> bool:
    """Whether a field is sent back as it already is. Usernames compare in
    lower case."""
    if now is None:
        return False
    if field == "username":
        return now.lower() == (sent or "").lower()
    return now == sent


def differs(a: dict, b: dict) -> list[str]:
    """The fields in which two profiles differ. Usernames compare in lower case."""
    out = []
    for f in FIELDS:
        x, y = a.get(f), b.get(f)
        if f == "username":
            x, y = (x or "").lower(), (y or "").lower()
        if x != y:
            out.append(f)
    return out


def sent_today(conn: psycopg.Connection, person_id: int) -> int:
    return conn.execute(
        "SELECT count(*) FROM identity.profile_change"
        " WHERE person_id = %s AND submitted_at > now() - interval '1 day'",
        (person_id,),
    ).fetchone()[0]


def write(conn: psycopg.Connection, person_id: int, values: dict) -> None:
    """Put a profile in use. full_name follows the parts through a trigger."""
    conn.execute(
        "INSERT INTO identity.person_profile"
        " (person_id, full_name, given_name, family_name, title, username, bio)"
        " VALUES (%(id)s, %(full)s, %(given_name)s, %(family_name)s, %(title)s,"
        "         %(username)s, %(bio)s)"
        " ON CONFLICT (person_id) DO UPDATE SET"
        "   given_name = EXCLUDED.given_name, family_name = EXCLUDED.family_name,"
        "   title = EXCLUDED.title, username = EXCLUDED.username, bio = EXCLUDED.bio",
        {**values, "id": person_id,
         "full": f"{values['given_name']} {values['family_name']}"},
    )
    conn.execute(
        "UPDATE app.person SET"
        "   unit_changed_at = CASE WHEN unit_id IS NOT NULL"
        "                           AND unit_id IS DISTINCT FROM %(unit_id)s"
        "                          THEN now() ELSE unit_changed_at END,"
        "   unit_id = %(unit_id)s,"
        "   role = %(role)s::app.person_role"
        " WHERE id = %(id)s",
        {"unit_id": values["unit_id"], "role": values["role"], "id": person_id},
    )


def _close(conn: psycopg.Connection, change_id: int, state: str) -> None:
    conn.execute(
        "UPDATE identity.profile_change SET state = %s::app.profile_change_state,"
        " decided_at = now() WHERE id = %s AND state = 'pending'",
        (state, change_id),
    )


def _queue(conn: psycopg.Connection, person_id: int, values: dict, first: bool,
           fields: list[str], warnings: list[dict], replacing: dict | None) -> None:
    if replacing:
        _close(conn, replacing["id"], "replaced")
    conn.execute(
        "INSERT INTO identity.profile_change"
        " (person_id, first, given_name, family_name, title, username, unit_id, role,"
        "  bio, fields, warnings)"
        " VALUES (%(id)s, %(first)s, %(given_name)s, %(family_name)s, %(title)s,"
        "         %(username)s, %(unit_id)s, %(role)s::app.person_role, %(bio)s,"
        "         %(fields)s, %(warnings)s)",
        {**values, "id": person_id, "first": first, "fields": fields,
         "warnings": Json(warnings)},
    )


def role_change(now: dict, values: dict) -> bool:
    """Whether a profile already filled in is sent back with another role."""
    before = now["values"]
    return before["username"] is not None and before["role"] != values["role"]


def submit(conn: psycopg.Connection, person_id: int, values: dict,
           warnings: list[dict]) -> str:
    """Record what the person sent. Returns what happened to it:

      applied     in use now, and waiting for the approval that makes it public
      role_waits  in use now apart from the change of role, which waits for
                  approval with its title
      pending     waiting for approval, the approved profile still in place
      waiting     the same change was already waiting
      withdrawn   the person went back to the approved profile
      unchanged   nothing to do
    """
    lock(conn, person_id)
    now = current(conn, person_id)
    wait = waiting(conn, person_id)

    if not now["approved"]:
        role_waits = role_change(now, values)
        in_use = values
        if role_waits:
            # The role and its title stay as they are until an administrator
            # decides; everything else is the person's own and is used at once.
            in_use = {**values, "role": now["values"]["role"], "title": now["values"]["title"]}
        write(conn, person_id, in_use)
        done = "role_waits" if role_waits else "applied"
        if wait and not differs(wait["values"], values):
            return done
        # A profile turned down and sent back unchanged is not asked about twice.
        if (not wait and not differs(now["values"], values)
                and _last_decision(conn, person_id) == "rejected"):
            return "unchanged"
        _queue(conn, person_id, values, True,
               [f for f in FIELDS if values.get(f) not in (None, "")], warnings, wait)
        return done

    changed = differs(now["values"], values)
    if not changed:
        if wait:
            _close(conn, wait["id"], "withdrawn")
            return "withdrawn"
        return "unchanged"
    if wait and not differs(wait["values"], values):
        return "waiting"
    _queue(conn, person_id, values, False, changed, warnings, wait)
    return "pending"


def withdraw(conn: psycopg.Connection, person_id: int) -> bool:
    """Take back a change that is waiting. A first profile is already in use and
    stays in the queue until it is decided."""
    lock(conn, person_id)
    wait = waiting(conn, person_id)
    if wait is None or wait["first"]:
        return False
    _close(conn, wait["id"], "withdrawn")
    return True


def _admin_id(conn: psycopg.Connection, admin_person_id: int) -> int:
    return conn.execute(
        "SELECT id FROM app.admin_user WHERE person_id = %s AND revoked_at IS NULL",
        (admin_person_id,),
    ).fetchone()[0]


def _change(conn: psycopg.Connection, change_id: int) -> dict:
    row = conn.execute(
        "SELECT person_id, state::text, first, given_name, family_name, title,"
        "       username::text, unit_id, role::text, bio, decided_by"
        " FROM identity.profile_change WHERE id = %s",
        (change_id,),
    ).fetchone()
    if row is None:
        raise ChangeError(404, "Böyle bir değişiklik yok.", "There is no such change.")
    return {"person_id": row[0], "state": row[1], "first": row[2],
            "values": dict(zip(FIELDS, row[3:10])), "decided_by": row[10]}


def _decidable(conn: psycopg.Connection, change: dict, admin_person_id: int) -> None:
    if change["person_id"] == admin_person_id:
        raise ChangeError(403, "Kendi profil değişikliğine başka bir yönetici karar vermeli.",
                          "Another administrator must decide on your own profile change.")
    if change["state"] == "replaced" and change["decided_by"] is not None:
        raise ChangeError(409, "Bu değişiklik, bir yöneticinin profil düzenlemesiyle kapandı.",
                          "This change was closed when an administrator edited the profile.")
    if change["state"] == "replaced":
        raise ChangeError(409, "Kişi bu değişikliğin yerine yenisini gönderdi.",
                          "The person has sent a newer change in place of this one.")
    if change["state"] == "withdrawn":
        raise ChangeError(409, "Kişi bu değişikliği geri çekti.",
                          "The person has withdrawn this change.")
    if change["state"] != "pending":
        raise ChangeError(409, "Bu değişikliğe zaten karar verildi.",
                          "This change has already been decided.")


def approve(conn: psycopg.Connection, change_id: int, admin_person_id: int) -> dict:
    """Put an approved change in use and make the profile public."""
    change = _change(conn, change_id)
    lock(conn, change["person_id"])
    change = _change(conn, change_id)
    _decidable(conn, change, admin_person_id)
    values = change["values"]

    unit_ok = conn.execute(
        "SELECT 1 FROM app.unit WHERE id = %s AND valid_to IS NULL AND is_selectable",
        (values["unit_id"],),
    ).fetchone()
    if unit_ok is None:
        raise ChangeError(409, "Seçilen birim artık seçilemiyor. Değişikliği gerekçesiyle"
                               " reddedebilirsin.",
                          "The chosen unit can no longer be chosen. You can turn the change"
                          " down with a reason.")
    free = conn.execute("SELECT app.username_available(%s, %s)",
                        (change["person_id"], values["username"])).fetchone()[0]
    if not free:
        raise ChangeError(409, "Bu kullanıcı adı artık başka birinde. Değişikliği gerekçesiyle"
                               " reddedebilirsin.",
                          "Someone else now holds this username. You can turn the change down"
                          " with a reason.")

    before = current(conn, change["person_id"])
    write(conn, change["person_id"], values)
    conn.execute("UPDATE identity.person_profile SET approved_at = now() WHERE person_id = %s",
                 (change["person_id"],))
    conn.execute(
        "UPDATE identity.profile_change SET state = 'approved', decided_at = now(),"
        " decided_by = %s WHERE id = %s",
        (_admin_id(conn, admin_person_id), change_id),
    )
    return {"person_id": change["person_id"], "first": change["first"],
            "before": before["values"], "after": values}


def reject(conn: psycopg.Connection, change_id: int, admin_person_id: int,
           reason: str) -> dict:
    """Turn a change down with a reason the person will read."""
    change = _change(conn, change_id)
    lock(conn, change["person_id"])
    change = _change(conn, change_id)
    _decidable(conn, change, admin_person_id)
    conn.execute(
        "UPDATE identity.profile_change SET state = 'rejected', decided_at = now(),"
        " decided_by = %s, reason = %s WHERE id = %s",
        (_admin_id(conn, admin_person_id), reason, change_id),
    )
    return {"person_id": change["person_id"], "first": change["first"]}


def correct(conn: psycopg.Connection, person_id: int, values: dict, fields: list[str],
            reason: str, admin_person_id: int) -> bool:
    """An administrator's correction, in use at once and approved.

    A change the person was waiting on is closed, since deciding it later
    would undo the correction. The correction is kept among the person's
    changes with the reason they read. Returns whether a waiting change was
    closed. The caller holds the lock on the person.
    """
    admin_id = _admin_id(conn, admin_person_id)
    wait = waiting(conn, person_id)
    if wait:
        conn.execute(
            "UPDATE identity.profile_change SET state = 'replaced', decided_at = now(),"
            " decided_by = %s WHERE id = %s AND state = 'pending'",
            (admin_id, wait["id"]),
        )
    write(conn, person_id, values)
    conn.execute("UPDATE identity.person_profile SET approved_at = now() WHERE person_id = %s",
                 (person_id,))
    conn.execute(
        "INSERT INTO identity.profile_change"
        " (person_id, first, given_name, family_name, title, username, unit_id, role, bio,"
        "  fields, state, decided_at, decided_by, reason, by_admin)"
        " VALUES (%(id)s, false, %(given_name)s, %(family_name)s, %(title)s, %(username)s,"
        "         %(unit_id)s, %(role)s::app.person_role, %(bio)s, %(fields)s, 'approved',"
        "         now(), %(admin)s, %(reason)s, true)",
        {**values, "id": person_id, "fields": fields, "admin": admin_id, "reason": reason},
    )
    return wait is not None


def unit_names(conn: psycopg.Connection, unit_id: int | None, locale: str = "tr") -> dict:
    """A unit as the person chose it: the faculty or directorate, and the
    department under it when there is one, named in the language on screen."""
    if unit_id is None:
        return {"faculty": None, "department": None}
    name = "coalesce({0}.name_en, {0}.name_tr)" if locale == "en" else "{0}.name_tr"
    row = conn.execute(
        f"SELECT {name.format('u')}, {name.format('f')}, nlevel(u.path) FROM app.unit u"
        " LEFT JOIN app.unit f ON f.id = u.parent_id WHERE u.id = %s",
        (unit_id,),
    ).fetchone()
    if row is None:
        return {"faculty": None, "department": None}
    if row[2] >= 3:
        return {"faculty": row[1], "department": row[0]}
    return {"faculty": row[0], "department": None}
