"""Admin endpoints for YAZEM.

Every capability here belongs to YAZEM, which keeps the permission surface to
three roles.

Two rules are enforced server-side:

  * A case cannot go live without a reach preview having been computable. The
    same function the runtime uses decides who a rule set reaches, so the number
    an admin sees before publishing is the number that will receive it.
  * A unit is never deleted. It is closed with valid_to, because attempts carry
    a snapshot of the unit id that past reporting relies on.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Literal

import psycopg
from psycopg.types.json import Json
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

import announcements
import awards
import campus
import case_images
import case_loader as cl
import integrity
import limits
import mailer
import profile_check
import profiles
import public_campus
import scoring
import service
import storage
import suspensions
from api import (CASE_ROOT, LOCAL_TZ, Principal, current_dsn, current_user, db, email_hash,
                 english_names, renamed_choices, say)

router = APIRouter(prefix="/admin", tags=["admin"])

WRITE_ROLES = {"yazem_admin", "yazem_editor"}
# Who may use the platform at all is decided by full administrators only:
# suspending or closing an account, and the addresses that may sign in. They
# alone see a person's address and correct a person's profile.
FULL_ROLES = {"yazem_admin"}


class Admin(BaseModel):
    person_id: int
    admin_role: str
    locale: str


def current_admin(user: Principal = Depends(current_user),
                  conn: psycopg.Connection = Depends(db)) -> Admin:
    row = conn.execute(
        "SELECT admin_role::text FROM app.admin_user"
        " WHERE person_id = %s AND revoked_at IS NULL",
        (user.person_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(403, "not an administrator")
    return Admin(person_id=user.person_id, admin_role=row[0], locale=user.locale)


def require_write(admin: Admin) -> None:
    if admin.admin_role not in WRITE_ROLES:
        raise HTTPException(403, "read-only role")


def admin_user_id(conn: psycopg.Connection, admin: Admin) -> int:
    return conn.execute(
        "SELECT id FROM app.admin_user WHERE person_id = %s AND revoked_at IS NULL",
        (admin.person_id,)).fetchone()[0]


def log(conn: psycopg.Connection, admin: Admin, action: str,
        table: str, target: str | None, before=None, after=None) -> None:
    conn.execute(
        "INSERT INTO audit.admin_action"
        " (admin_user_id, action, target_table, target_id, before_state, after_state)"
        " SELECT au.id, %s, %s, %s, %s, %s FROM app.admin_user au"
        " WHERE au.person_id = %s AND au.revoked_at IS NULL",
        # before/after are jsonb columns; psycopg will not adapt a bare dict.
        (action, table, target,
         None if before is None else Json(before),
         None if after is None else Json(after),
         admin.person_id),
    )


# ---------------------------------------------------------------------------
# Cases: what exists, who it reaches, when it goes out
# ---------------------------------------------------------------------------

@router.get("/cases")
def list_cases(admin: Admin = Depends(current_admin),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """Registered cases plus any body in the repository not yet registered.

    The two are shown together so an author can see that a file they committed
    has not been picked up.
    """
    rows = conn.execute(
        "SELECT cr.id, cr.case_key, cr.title_tr, cr.type::text, cr.status::text,"
        "       cr.audience::text[], cr.publish_at, cr.close_at,"
        "       (SELECT count(*) FROM app.case_target ct WHERE ct.case_id = cr.id) AS rules,"
        "       (SELECT count(*) FROM app.attempt a WHERE a.case_id = cr.id) AS attempts,"
        "       cr.locales::text[]"
        " FROM app.case_registry cr ORDER BY cr.publish_at DESC NULLS LAST, cr.case_key"
    ).fetchall()
    known = {r[1] for r in rows}
    on_disk = sorted({p.stem.rsplit(".", 1)[0] for p in Path(CASE_ROOT).rglob("*.yaml")})

    return {
        "registered": [
            {"id": r[0], "key": r[1], "title": r[2], "type": r[3], "status": r[4],
             "audience": r[5], "publish_at": r[6], "close_at": r[7],
             "rules": r[8], "attempts": r[9], "locales": r[10]}
            for r in rows
        ],
        "unregistered": [k for k in on_disk if k not in known],
        # The picture each case is shown with, by key.
        "images": case_images.described(conn, CASE_ROOT),
    }


# ---------------------------------------------------------------------------
# The picture a case is shown with
# ---------------------------------------------------------------------------

def _case_exists(conn: psycopg.Connection, case_key: str) -> bool:
    if not case_images.KEY_SHAPE.match(case_key):
        return False
    try:
        cl.load_case(Path(CASE_ROOT), case_key, "tr", conn)
    except (cl.CaseNotFound, ValueError):
        return False
    return True


def _picture_state(conn: psycopg.Connection, case_key: str) -> dict:
    return {"key": case_key,
            "image": case_images.described(conn, CASE_ROOT, [case_key]).get(case_key)}


@router.post("/cases/{case_key}/image")
async def put_case_image(case_key: str, image: UploadFile = File(...),
                         admin: Admin = Depends(current_admin),
                         conn: psycopg.Connection = Depends(db)) -> dict:
    """Show a case with this picture, in place of any it had.

    The bytes decide what the file is; its name and declared type are ignored.
    """
    require_write(admin)
    if not _case_exists(conn, case_key):
        raise HTTPException(404, say(admin.locale, "Bu kimlikle kayıtlı bir vaka yok.",
                                     "There is no case with this key."))
    data = await image.read(case_images.MAX_BYTES + 1)
    try:
        stored = case_images.store(conn, case_key, data, admin_user_id(conn, admin))
    except case_images.Refused as exc:
        raise HTTPException(400, exc.text(admin.locale))
    log(conn, admin, "case_image_set", "app.case_image", case_key, None,
        {"sha256": stored["sha256"], "bytes": stored["bytes"],
         "width": stored["width"], "height": stored["height"]})
    conn.commit()
    if stored["replaced"]:
        storage.drop(stored["replaced"])
    return _picture_state(conn, case_key)


@router.delete("/cases/{case_key}/image")
def remove_case_image(case_key: str, admin: Admin = Depends(current_admin),
                      conn: psycopg.Connection = Depends(db)) -> dict:
    """Remove the uploaded picture of a case. A case whose bank carries a
    picture is shown with that one again."""
    require_write(admin)
    none_here = say(admin.locale, "Bu vakaya yüklenmiş bir görsel yok.",
                    "No picture has been uploaded for this case.")
    if not case_images.KEY_SHAPE.match(case_key):
        raise HTTPException(404, none_here)
    dropped = case_images.remove(conn, case_key)
    if dropped is None:
        raise HTTPException(404, none_here)
    log(conn, admin, "case_image_remove", "app.case_image", case_key, None, None)
    conn.commit()
    storage.drop(dropped)
    return _picture_state(conn, case_key)


class TargetRule(BaseModel):
    unit_id: int
    mode: str = Field(pattern="^(include|exclude)$")
    subtree: bool = True


class Targeting(BaseModel):
    audience: list[str]
    rules: list[TargetRule] = []


@router.post("/cases/{case_key}/reach")
def preview_reach(case_key: str, body: Targeting,
                  admin: Admin = Depends(current_admin),
                  conn: psycopg.Connection = Depends(db)) -> dict:
    """How many people a rule set would reach, without saving it.

    Evaluated in a transaction that is rolled back, so the preview uses the
    real targeting function.
    """
    case = conn.execute(
        "SELECT id FROM app.case_registry WHERE case_key = %s", (case_key,)
    ).fetchone()
    if case is None:
        raise HTTPException(404, "unknown case")
    case_id = case[0]

    with conn.transaction(force_rollback=True):
        conn.execute("UPDATE app.case_registry SET audience = %s::app.person_role[]"
                     " WHERE id = %s", (body.audience, case_id))
        conn.execute("DELETE FROM app.case_target WHERE case_id = %s", (case_id,))
        for r in body.rules:
            conn.execute(
                "INSERT INTO app.case_target (case_id, unit_id, mode, subtree)"
                " VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (case_id, r.unit_id, r.mode, r.subtree),
            )
        rows = conn.execute(
            "SELECT p.role::text, count(*) FROM app.person p"
            " WHERE p.status = 'active' AND app.case_targets_person(%s, p.id)"
            " GROUP BY p.role", (case_id,)
        ).fetchall()
        by_unit = conn.execute(
            "SELECT u.name_tr, count(*) FROM app.person p"
            " JOIN app.unit u ON u.id = p.unit_id"
            " WHERE p.status = 'active' AND app.case_targets_person(%s, p.id)"
            " GROUP BY u.name_tr ORDER BY count(*) DESC LIMIT 12", (case_id,)
        ).fetchall()

    names = english_names(conn, admin.locale)
    return {"by_role": {r[0]: r[1] for r in rows},
            "total": sum(r[1] for r in rows),
            "top_units": [{"name": names.get(u[0], u[0]), "people": u[1]} for u in by_unit]}


@router.put("/cases/{case_key}/targeting")
def save_targeting(case_key: str, body: Targeting,
                   admin: Admin = Depends(current_admin),
                   conn: psycopg.Connection = Depends(db)) -> dict:
    require_write(admin)
    case = conn.execute(
        "SELECT id, status::text FROM app.case_registry WHERE case_key = %s", (case_key,)
    ).fetchone()
    if case is None:
        raise HTTPException(404, "unknown case")
    if case[1] == "archived":
        raise HTTPException(409, "an archived case no longer takes targeting")

    conn.execute("UPDATE app.case_registry SET audience = %s::app.person_role[]"
                 " WHERE id = %s", (body.audience, case[0]))
    conn.execute("DELETE FROM app.case_target WHERE case_id = %s", (case[0],))
    for r in body.rules:
        conn.execute(
            "INSERT INTO app.case_target (case_id, unit_id, mode, subtree)"
            " VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
            (case[0], r.unit_id, r.mode, r.subtree),
        )
    log(conn, admin, "targeting", "app.case_target", case_key, None,
        {"audience": body.audience, "rules": [r.model_dump() for r in body.rules]})
    conn.commit()
    return {"saved": True}


class Schedule(BaseModel):
    publish_at: datetime
    close_at: datetime | None = None


@router.post("/cases/{case_key}/publish")
def publish(case_key: str, body: Schedule,
            admin: Admin = Depends(current_admin),
            conn: psycopg.Connection = Depends(db)) -> dict:
    """Import a case that lives as a file in the repository and schedule it.

    Cases written in the editor are published through /authoring, which reads the
    body from the database. This path handles case files in the repository,
    including anything a maintainer commits by hand.

    The hash is stored so that an edit to a case that is already live can be
    detected, since everyone answering a case shares one difficulty estimate.
    """
    require_write(admin)
    if body.close_at and body.close_at <= body.publish_at:
        raise HTTPException(400, "close_at must follow publish_at")
    out = _register(conn, case_key, body.publish_at, body.close_at)
    log(conn, admin, "publish", "app.case_registry", case_key, None,
        {"publish_at": body.publish_at.isoformat(), "steps": out["steps"]})
    conn.commit()
    return out


@router.post("/cases/publish-all")
def publish_all(admin: Admin = Depends(current_admin),
                conn: psycopg.Connection = Depends(db)) -> dict:
    """Publish every case file in the repository that is not registered yet.

    Each one goes live now with no closing date, for the audience its file names
    (everyone when it names none). Targeting and dates can be changed per case
    afterwards.
    """
    require_write(admin)
    cl.forget_files()
    known = {r[0] for r in conn.execute("SELECT case_key FROM app.case_registry").fetchall()}
    on_disk = sorted({p.stem.rsplit(".", 1)[0] for p in Path(CASE_ROOT).rglob("*.yaml")})
    now = conn.execute("SELECT now()").fetchone()[0]
    published, failed = [], []
    for key in on_disk:
        if key in known:
            continue
        try:
            with conn.transaction():
                _register(conn, key, now, None)
            published.append(key)
        except (HTTPException, cl.CaseNotFound, cl.LocaleMismatch, KeyError, ValueError,
                psycopg.Error) as exc:
            detail = getattr(exc, "detail", None) or str(exc)
            failed.append({"key": key, "error": str(detail).splitlines()[0][:160]})
    # A case already published may have gained a version in another language.
    languages = sync_case_languages(conn)
    log(conn, admin, "publish_all", "app.case_registry", None, None,
        {"published": len(published), "failed": len(failed),
         "languages": len(languages["changed"])})
    conn.commit()
    return {"published": published, "failed": failed, "languages": languages}


def sync_case_languages(conn: psycopg.Connection) -> dict:
    """Offer each registered case in every language it has a matching version in.

    A version in another language is the same case: it is added to the case
    rather than registered as a new one, so solving either version solves the
    case. A version whose structure departs from the case's is held back and
    named, to be corrected. Nothing is committed here.
    """
    changed, held = [], []
    cl.forget_files()
    rows = conn.execute("SELECT id, case_key, locales::text[] FROM app.case_registry"
                        " ORDER BY case_key").fetchall()
    for case_id, key, have in rows:
        offered, departing = cl.matching_locales(Path(CASE_ROOT), key, conn)
        held += [{"key": key, "locale": loc} for loc in departing]
        if not offered or offered == sorted(have or []):
            continue
        # The registry keeps the Turkish title, which the panel's lists show.
        title = None
        if "tr" in offered and "tr" not in (have or []):
            title = cl.load_case(Path(CASE_ROOT), key, "tr", conn, exact=True).body.get("title")
        conn.execute(
            "UPDATE app.case_registry SET locales = %s::app.locale[],"
            "       title_tr = coalesce(%s, title_tr) WHERE id = %s",
            (offered, title, case_id))
        changed.append({"key": key, "locales": offered, "was": sorted(have or [])})
    return {"changed": changed, "held": held}


def _register(conn: psycopg.Connection, case_key: str, publish_at, close_at) -> dict:
    try:
        case = cl.load_case(Path(CASE_ROOT), case_key, "tr")
    except cl.CaseNotFound:
        raise HTTPException(404, "no case body with that key")
    cl.assert_locale_parity(Path(CASE_ROOT), case_key)

    body_bytes = b"".join(
        sorted(p.read_bytes() for p in Path(CASE_ROOT).rglob(f"{case_key}.*.yaml"))
    )
    digest = hashlib.sha256(body_bytes).digest()

    steps = case.body["steps"]
    row = conn.execute(
        "INSERT INTO app.case_registry"
        " (case_key, title_tr, type, status, audience, locales, publish_at, close_at, file_hash)"
        " VALUES (%s, %s, %s::app.case_type, 'scheduled', %s::app.person_role[],"
        "         %s::app.locale[], %s, %s, %s)"
        " ON CONFLICT (case_key) DO UPDATE"
        "   SET title_tr = EXCLUDED.title_tr, publish_at = EXCLUDED.publish_at,"
        "       close_at = EXCLUDED.close_at, file_hash = EXCLUDED.file_hash,"
        "       locales = EXCLUDED.locales"
        " RETURNING id",
        (case_key, case.body["title"], case.body["type"],
         case.body.get("audience") or ["student", "academic", "admin_staff"],
         cl.available_locales(Path(CASE_ROOT), case_key, conn),
         publish_at, close_at, digest),
    ).fetchone()
    case_id = row[0]

    for s in steps:
        conn.execute(
            "INSERT INTO app.case_step (case_id, step_key, dimension, points)"
            " VALUES (%s, %s, %s::app.dimension, %s)"
            " ON CONFLICT (case_id, step_key) DO UPDATE"
            "   SET dimension = EXCLUDED.dimension, points = EXCLUDED.points",
            (case_id, s["id"], s["dimension"], s["points"]),
        )
    return {"case_id": case_id, "steps": len(steps),
            "locales": cl.available_locales(Path(CASE_ROOT), case_key, conn)}


# ---------------------------------------------------------------------------
# When the correct answers are shown
# ---------------------------------------------------------------------------

class RevealRule(BaseModel):
    min_answers: int = Field(ge=1, le=100000)
    min_share: float = Field(gt=0, le=1)


# ---------------------------------------------------------------------------
# Platform settings
# ---------------------------------------------------------------------------

# Every setting the panel may switch, with the type its value must have.
SETTINGS = {
    "twin_accuracy_public": bool,
    # What the campus shows to someone who has not signed in (public_campus.py).
    **{key: bool for key in public_campus.SWITCHES},
    "limits_enabled": bool,
    "session_case_limit": int,
    "session_minutes": int,
    "cooldown_hours": int,
    "weekly_case_limit": int,
    "hint_experiment": bool,
    "code_requests_per_ip": int,
    "fast_finish_percent": int,
}

# The range each number may take in the panel.
BOUNDS = {**limits.BOUNDS, "code_requests_per_ip": (1, 1000), "fast_finish_percent": (0, 90)}


@router.get("/settings")
def get_settings(admin: Admin = Depends(current_admin),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    stored = dict(conn.execute("SELECT key, value FROM app.platform_setting").fetchall())
    stored.setdefault(integrity.FAST_SETTING, integrity.FAST_DEFAULT)
    for key, default in public_campus.SWITCHES.items():
        stored.setdefault(key, default)
    return {key: stored.get(key) for key in SETTINGS}


class SettingValue(BaseModel):
    value: bool | int | float | str


@router.put("/settings/{key}")
def put_setting(key: str, body: SettingValue, admin: Admin = Depends(current_admin),
                conn: psycopg.Connection = Depends(db)) -> dict:
    require_write(admin)
    kind = SETTINGS.get(key)
    if kind is None:
        raise HTTPException(404, "unknown setting")
    if type(body.value) is not kind:
        raise HTTPException(400, f"{key} takes a {kind.__name__}")
    low, high = BOUNDS.get(key, (None, None))
    if low is not None and not low <= body.value <= high:
        raise HTTPException(400, f"{key} must be between {low} and {high}")
    conn.execute(
        "INSERT INTO app.platform_setting (key, value, updated_at) VALUES (%s, %s, now())"
        " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
        (key, Json(body.value)))
    log(conn, admin, "setting", "app.platform_setting", key, None, {"value": body.value})
    conn.commit()
    if key in public_campus.SWITCHES:
        # Visitors see the change with their next request.
        public_campus.forget()
    return {key: body.value}


@router.get("/visitors")
def visitor_view(admin: Admin = Depends(current_admin),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    """What the campus shows to someone who has not signed in, and how many
    people on the ranking agreed to be seen there."""
    state = public_campus.read_switches(conn)
    on_board, seen_outside = conn.execute(
        "SELECT count(*) FILTER (WHERE board_opt_in), count(*) FILTER (WHERE board_public)"
        " FROM app.person WHERE status = 'active'").fetchone()
    return {"switches": state, "shown": public_campus.shown(state),
            "board_people": on_board, "board_public_people": seen_outside}

@router.get("/reveal")
def reveal_state(admin: Admin = Depends(current_admin),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    """The opening rule, and where each registered case stands against it."""
    rule = conn.execute(
        "SELECT min_answers, min_share FROM app.reveal_rule WHERE id = 1").fetchone()
    rows = conn.execute(
        "SELECT cr.case_key, cr.title_tr, cv.reason, cv.opened_at,"
        "       app.reveal_progress(cr.id)"
        " FROM app.case_registry cr LEFT JOIN app.case_reveal cv ON cv.case_id = cr.id"
        " ORDER BY cr.case_key").fetchall()
    return {
        "rule": {"min_answers": rule[0], "min_share": float(rule[1])},
        "cases": [
            {"key": r[0], "title": r[1], "open": r[2] is not None and r[2] != "held",
             "reason": r[2],
             "opened_at": r[3], "finished": r[4]["finished"], "reach": r[4]["reach"],
             "share": float(r[4]["share"]) if r[4]["share"] is not None else None}
            for r in rows
        ],
    }


@router.put("/reveal/rule")
def set_reveal_rule(body: RevealRule, admin: Admin = Depends(current_admin),
                    conn: psycopg.Connection = Depends(db)) -> dict:
    require_write(admin)
    before = conn.execute(
        "SELECT min_answers, min_share FROM app.reveal_rule WHERE id = 1").fetchone()
    conn.execute(
        "UPDATE app.reveal_rule SET min_answers = %s, min_share = %s, updated_at = now()"
        " WHERE id = 1", (body.min_answers, body.min_share))
    log(conn, admin, "reveal_rule", "app.reveal_rule", "1",
        {"min_answers": before[0], "min_share": float(before[1])}, body.model_dump())
    conn.commit()
    return body.model_dump()


class RevealSwitch(BaseModel):
    # True opens the answers, False keeps them closed, None hands the case back
    # to the opening rule.
    open: bool | None


@router.post("/cases/{case_key}/reveal")
def switch_reveal(case_key: str, body: RevealSwitch,
                  admin: Admin = Depends(current_admin),
                  conn: psycopg.Connection = Depends(db)) -> dict:
    """Open a case's correct answers by hand, keep them closed, or let the rule decide.

    A case kept closed stays closed whatever the automatic conditions say,
    until it is opened here or handed back to the rule.
    """
    require_write(admin)
    case = conn.execute("SELECT id FROM app.case_registry WHERE case_key = %s",
                        (case_key,)).fetchone()
    if case is None:
        raise HTTPException(404, "unknown case")
    if body.open is None:
        conn.execute("DELETE FROM app.case_reveal WHERE case_id = %s", (case[0],))
        opened = conn.execute("SELECT app.reveal_open(%s)", (case[0],)).fetchone()[0]
    else:
        conn.execute(
            "INSERT INTO app.case_reveal (case_id, reason, opened_by, opened_at)"
            " SELECT %s, %s, au.id, now() FROM app.admin_user au"
            " WHERE au.person_id = %s AND au.revoked_at IS NULL"
            " ON CONFLICT (case_id) DO UPDATE SET reason = EXCLUDED.reason,"
            "   opened_by = EXCLUDED.opened_by, opened_at = EXCLUDED.opened_at",
            (case[0], "manual" if body.open else "held", admin.person_id))
        opened = body.open
    reason = conn.execute("SELECT reason FROM app.case_reveal WHERE case_id = %s",
                          (case[0],)).fetchone()
    log(conn, admin, "reveal", "app.case_reveal", case_key, None, {"open": body.open})
    conn.commit()
    return {"key": case_key, "open": bool(opened), "reason": reason[0] if reason else None}


# ---------------------------------------------------------------------------
# Review queue: non-blocking
# ---------------------------------------------------------------------------

@router.get("/review")
def review_queue(state: str = "open",
                 admin: Admin = Depends(current_admin),
                 conn: psycopg.Connection = Depends(db)) -> list[dict]:
    rows = conn.execute(
        "SELECT ri.id, ri.reason::text, ri.detail, ri.opened_at,"
        "       pp.full_name, u.name_tr AS unit, p.role::text, p.status::text,"
        "       ri.attempt_id, p.id"
        " FROM app.review_item ri"
        " JOIN app.person p ON p.id = ri.person_id"
        " LEFT JOIN identity.person_profile pp ON pp.person_id = p.id"
        " LEFT JOIN app.unit u ON u.id = p.unit_id"
        " WHERE ri.state = %s::app.review_state"
        " ORDER BY ri.opened_at",
        (state,),
    ).fetchall()
    names = english_names(conn, admin.locale)
    titles = dict(conn.execute("SELECT case_key, title_tr FROM app.case_registry").fetchall())
    return [
        {"id": r[0], "reason": r[1], "detail": None if r[1] == "fast_finish" else r[2],
         "opened_at": r[3], "name": r[4], "unit": names.get(r[5], r[5]), "role": r[6],
         "person_status": r[7], "attempt_id": r[8], "person_id": r[9],
         "fast": _fast_detail(r[2], titles) if r[1] == "fast_finish" else None}
        for r in rows
    ]


def _fast_detail(detail: str | None, titles: dict) -> dict | None:
    """A quick finish as the review list shows it: which case, how fast, how
    many steps were right."""
    try:
        found = json.loads(detail or "")
    except ValueError:
        return None
    return {**found, "title": titles.get(found.get("case"), found.get("case"))}


class Resolution(BaseModel):
    action: str = Field(pattern="^(resolve|dismiss|close_account|void)$")
    note: str | None = Field(default=None, max_length=500)
    unit_id: int | None = None


@router.post("/review/{item_id}")
def resolve_review(item_id: int, body: Resolution,
                   admin: Admin = Depends(current_admin),
                   conn: psycopg.Connection = Depends(db)) -> dict:
    require_write(admin)
    # Setting the attempt aside holds the attempt before the items about it, as
    # it does from a person's record, so the item is not held here first.
    row = conn.execute(
        "SELECT person_id, reason::text, attempt_id FROM app.review_item"
        " WHERE id = %s AND state = 'open'" + ("" if body.action == "void" else " FOR UPDATE"),
        (item_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "no open item with that id")
    person_id, reason, attempt_id = row
    if person_id == admin.person_id:
        raise HTTPException(403, say(admin.locale,
                                     "Seninle ilgili bir kaydı başka bir yönetici sonuçlandırmalı.",
                                     "An item about you must be settled by another administrator."))
    if body.action == "void":
        # Setting the attempt aside settles the item with the same reason.
        if attempt_id is None:
            raise HTTPException(400, say(admin.locale, "Bu kayıt bir vaka denemesiyle ilgili değil.",
                                         "This item is not about an attempt at a case."))
        out = _void(conn, admin, attempt_id, body.note)
        conn.commit()
        return {"resolved": True, **out}

    if body.unit_id is not None:
        conn.execute(
            "UPDATE app.person SET unit_id = %s, unit_changed_at = now()"
            " WHERE id = %s AND EXISTS (SELECT 1 FROM app.unit u"
            "   WHERE u.id = %s AND u.is_selectable AND u.valid_to IS NULL)",
            (body.unit_id, person_id, body.unit_id),
        )
    if body.action == "close_account":
        # The only destructive outcome, and it keeps the pseudonymous record so
        # past reporting does not change under anyone. Like a suspension, it is
        # for a full administrator and never applies to an administrator.
        if admin.admin_role not in FULL_ROLES:
            raise HTTPException(403, say(admin.locale,
                                         "Hesap kapatmak tam yetkili yöneticilere açık.",
                                         "Only full administrators can close an account."))
        if conn.execute("SELECT 1 FROM app.admin_user WHERE person_id = %s"
                        " AND revoked_at IS NULL", (person_id,)).fetchone() is not None:
            raise HTTPException(403, say(admin.locale, "Yöneticilerin hesabı kapatılamaz.",
                                         "An administrator's account cannot be closed."))
        conn.execute("UPDATE app.person SET status = 'closed' WHERE id = %s", (person_id,))

    conn.execute(
        "UPDATE app.review_item SET state = %s::app.review_state, resolved_at = now(),"
        "  note = %s, resolved_by = (SELECT id FROM app.admin_user"
        "     WHERE person_id = %s AND revoked_at IS NULL)"
        " WHERE id = %s",
        ("dismissed" if body.action == "dismiss" else "resolved",
         body.note, admin.person_id, item_id),
    )
    log(conn, admin, body.action, "app.review_item", str(item_id), {"reason": reason}, None)
    conn.commit()
    return {"resolved": True}


# ---------------------------------------------------------------------------
# People: profile approvals and suspensions
# ---------------------------------------------------------------------------

# Turkish letters to their plain counterparts, so a search for "sule" finds
# "Şule" and "ISIK" finds "Işık" whatever the database collation.
_FOLD_SQL = "lower(translate({}, 'ÇĞİIÖŞÜçğıöşü', 'cgiiosucgiosu'))"


@router.get("/me")
def admin_me(admin: Admin = Depends(current_admin)) -> dict:
    """What this administrator may do, so the panel offers only that."""
    return {"admin_role": admin.admin_role, "person_id": admin.person_id,
            "can_write": admin.admin_role in WRITE_ROLES,
            "can_suspend": admin.admin_role in FULL_ROLES,
            "can_manage_access": admin.admin_role in FULL_ROLES,
            "can_manage_people": admin.admin_role in FULL_ROLES}


def _profile_shown(conn: psycopg.Connection, values: dict | None,
                   locale: str = "tr") -> dict | None:
    """A profile as the reviewer reads it: labels rather than codes."""
    if values is None:
        return None
    names = profiles.unit_names(conn, values.get("unit_id"), locale)
    title = values.get("title")
    if title:
        row = conn.execute("SELECT label_tr, label_en FROM app.academic_title WHERE code = %s",
                           (title,)).fetchone()
        title = (row[1] if locale == "en" else row[0]) if row else title
    return {"given_name": values.get("given_name"), "family_name": values.get("family_name"),
            "title": title, "username": values.get("username"),
            "faculty": names["faculty"], "department": names["department"],
            "role": values.get("role"), "bio": values.get("bio")}


@router.get("/profile-changes")
def profile_changes(state: str = "pending", admin: Admin = Depends(current_admin),
                    conn: psycopg.Connection = Depends(db)) -> dict:
    """Profile changes waiting for a decision, oldest first, or the latest
    decisions. A waiting change comes with the approved profile it would
    replace, the fields that differ and what the automatic checks noticed. A
    full administrator also sees the person's address, to tell whether the
    name and title fit the account."""
    if state not in ("pending", "decided"):
        raise HTTPException(400, "state is pending or decided")
    where = ("c.state = 'pending' ORDER BY c.submitted_at" if state == "pending"
             else "c.state IN ('approved', 'rejected') ORDER BY c.decided_at DESC LIMIT 50")
    rows = conn.execute(
        "SELECT c.id, c.person_id, c.first, c.fields, c.warnings, c.submitted_at,"
        "       c.state::text, c.decided_at, c.reason,"
        "       c.given_name, c.family_name, c.title, c.username::text, c.unit_id,"
        "       c.role::text, c.bio,"
        "       p.status::text, p.created_at,"
        "       (SELECT count(*) FROM identity.profile_change r"
        "         WHERE r.person_id = c.person_id AND r.state = 'rejected'),"
        "       dpp.full_name, e.email_enc"
        " FROM identity.profile_change c"
        " JOIN app.person p ON p.id = c.person_id"
        " LEFT JOIN identity.person_email e ON e.person_id = c.person_id"
        " LEFT JOIN app.admin_user au ON au.id = c.decided_by"
        " LEFT JOIN identity.person_profile dpp ON dpp.person_id = au.person_id"
        " WHERE " + where
    ).fetchall()
    items = []
    addresses = admin.admin_role in FULL_ROLES
    for r in rows:
        after = dict(zip(profiles.FIELDS, r[9:16]))
        before = None
        if r[6] == "pending" and not r[2]:
            before = profiles.current(conn, r[1])["values"]
        items.append({
            "id": r[0], "person_id": r[1], "first": r[2], "fields": r[3],
            "warnings": r[4], "submitted_at": r[5], "state": r[6], "decided_at": r[7],
            "reason": r[8], "decided_by": r[19], "own": r[1] == admin.person_id,
            "person": {"status": r[16], "since": r[17], "rejected_before": r[18]},
            "before": _profile_shown(conn, before, admin.locale),
            "after": _profile_shown(conn, after, admin.locale),
            **({"email": _address(r[20])} if addresses else {}),
        })
    waiting = conn.execute(
        "SELECT count(*) FROM identity.profile_change WHERE state = 'pending'").fetchone()[0]
    return {"items": items, "waiting": waiting}


class ProfileDecision(BaseModel):
    action: Literal["approve", "reject"]
    # Shown to the person, so it is required for a rejection.
    reason: str | None = Field(default=None, max_length=500)


@router.post("/profile-changes/{change_id}")
def decide_profile_change(change_id: int, body: ProfileDecision,
                          admin: Admin = Depends(current_admin),
                          conn: psycopg.Connection = Depends(db)) -> dict:
    require_write(admin)
    try:
        if body.action == "approve":
            done = profiles.approve(conn, change_id, admin.person_id)
            changed = profiles.differs(done["before"], done["after"])
            log(conn, admin, "approve_profile", "identity.profile_change", str(change_id),
                {"first": done["first"]}, {"state": "approved", "fields": changed})
        else:
            reason = " ".join((body.reason or "").split())
            if len(reason) < 5:
                raise HTTPException(400, say(
                    admin.locale, "Reddetme gerekçesini yaz. Kişi bu gerekçeyi görecek.",
                    "Write the reason for turning it down. The person will see it."))
            done = profiles.reject(conn, change_id, admin.person_id, reason)
            log(conn, admin, "reject_profile", "identity.profile_change", str(change_id),
                {"first": done["first"]}, {"state": "rejected", "reason": reason})
    except profiles.ChangeError as exc:
        conn.rollback()
        raise HTTPException(exc.status, exc.text(admin.locale))
    conn.commit()
    return {"decided": True, "state": "approved" if body.action == "approve" else "rejected"}


_PEOPLE_FROM = """
FROM app.person p
LEFT JOIN identity.person_profile pp ON pp.person_id = p.id
LEFT JOIN identity.person_email e ON e.person_id = p.id
LEFT JOIN app.suspension s ON s.person_id = p.id AND s.lifted_at IS NULL
"""

_PEOPLE_SQL = """
SELECT p.id, pp.full_name, pp.username::text, p.role::text, p.unit_id, p.status::text,
       pp.approved_at IS NOT NULL,
       EXISTS (SELECT 1 FROM app.admin_user au
                WHERE au.person_id = p.id AND au.revoked_at IS NULL),
       EXISTS (SELECT 1 FROM identity.profile_change c
                WHERE c.person_id = p.id AND c.state = 'pending'),
       s.starts_at, s.ends_at, s.reason, s.note, p.avatar,
       pp.given_name, pp.family_name, pp.title, pp.bio, e.email_enc
""" + _PEOPLE_FROM


def _title_labels(conn: psycopg.Connection, locale: str = "tr") -> dict[str, str]:
    column = "label_en" if locale == "en" else "label_tr"
    return dict(conn.execute(f"SELECT code, {column} FROM app.academic_title").fetchall())


def _address(blob) -> str | None:
    """A person's address, unwrapped for a full administrator. None when there
    is none to read, as for a closed account whose address has been deleted."""
    if blob is None:
        return None
    try:
        return mailer.decrypt_email(bytes(blob))
    except Exception:
        return None


def _person_row(conn: psycopg.Connection, r, locale: str = "tr",
                titles: dict | None = None, addresses: bool = False) -> dict:
    """What the people list shows: enough to tell people apart, to act and to
    correct a profile, nothing about when or how they use the platform. The
    address is shown to full administrators only."""
    names = profiles.unit_names(conn, r[4], locale)
    title = None if r[3] == "student" else r[16]
    if titles is None:
        titles = _title_labels(conn, locale)
    row = {
        "person_id": r[0], "name": r[1], "username": r[2], "role": r[3],
        "faculty": names["faculty"], "department": names["department"],
        "status": r[5], "approved": r[6], "admin": r[7], "waiting": r[8],
        "suspension": ({"starts_at": r[9], "ends_at": r[10], "reason": r[11], "note": r[12]}
                       if r[9] is not None else None),
        "avatar": r[13],
        "given_name": r[14], "family_name": r[15], "unit_id": r[4], "bio": r[17],
        "title": title, "title_label": titles.get(title) if title else None,
    }
    if addresses:
        row["email"] = _address(r[18])
    return row


def _rows(conn: psycopg.Connection, admin: Admin, rows) -> list[dict]:
    titles = _title_labels(conn, admin.locale)
    return [_person_row(conn, r, admin.locale, titles, admin.admin_role in FULL_ROLES)
            for r in rows]


# What the list can be narrowed to, as conditions over _PEOPLE_FROM.
_PEOPLE_STATES = {
    "approved": "pp.approved_at IS NOT NULL",
    "unapproved": "pp.username IS NOT NULL AND pp.approved_at IS NULL",
    "incomplete": "pp.username IS NULL",
    "waiting": ("EXISTS (SELECT 1 FROM identity.profile_change c"
                " WHERE c.person_id = p.id AND c.state = 'pending')"),
    "suspended": "s.id IS NOT NULL",
}
_PEOPLE_ROLES = ("student", "academic", "admin_staff")


@router.get("/people")
def people_list(q: str = "", role: str = "", title: str = "", state: str = "",
                offset: int = 0, limit: int = 25, admin: Admin = Depends(current_admin),
                conn: psycopg.Connection = Depends(db)) -> dict:
    """Everyone with an account, the newest first, a page at a time.

    A search finds a person by e-mail address, username or name. An address is
    matched whole through its keyed hash, since addresses are stored
    encrypted. A username is matched from its start and a name anywhere in it,
    with or without Turkish letters, and the results come in the order of the
    names. The filters narrow the list by role, by title ("none" for staff
    without one) and by the state of the profile.
    """
    if role and role not in _PEOPLE_ROLES:
        raise HTTPException(400, "role is student, academic or admin_staff")
    if state and state not in _PEOPLE_STATES:
        raise HTTPException(400, "state is " + ", ".join(_PEOPLE_STATES))
    conn.execute("SELECT app.lift_expired_suspensions()")
    conn.commit()
    where, params = [], {}
    q = " ".join(q.split())
    if "@" in q:
        where.append("e.email_hash = %(hash)s")
        params["hash"] = email_hash(q)
    elif q:
        params["q"] = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("(" + _FOLD_SQL.format("pp.username::text") + " LIKE "
                     + _FOLD_SQL.format("%(q)s") + " || '%%' OR "
                     + _FOLD_SQL.format("pp.full_name") + " LIKE '%%' || "
                     + _FOLD_SQL.format("%(q)s") + " || '%%')")
    if role:
        where.append("p.role = %(role)s::app.person_role")
        params["role"] = role
    if title == "none":
        where.append("p.role <> 'student' AND pp.title IS NULL")
    elif title:
        where.append("p.role <> 'student' AND pp.title = %(title)s")
        params["title"] = title
    if state:
        where.append(_PEOPLE_STATES[state])
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    total = conn.execute("SELECT count(*)" + _PEOPLE_FROM + clause, params).fetchone()[0]
    order = (" ORDER BY pp.full_name NULLS LAST, p.id" if q
             else " ORDER BY p.created_at DESC, p.id DESC")
    page = {"limit": max(1, min(limit, 100)), "offset": max(0, offset)}
    rows = conn.execute(_PEOPLE_SQL + clause + order + " LIMIT %(limit)s OFFSET %(offset)s",
                        {**params, **page}).fetchall()
    return {"items": _rows(conn, admin, rows), "total": total, **page}


@router.get("/people/{person_id}")
def person_detail(person_id: int, admin: Admin = Depends(current_admin),
                  conn: psycopg.Connection = Depends(db)) -> dict:
    """One person with their suspensions and recent profile changes."""
    conn.execute("SELECT app.lift_expired_suspensions()")
    conn.commit()
    row = conn.execute(_PEOPLE_SQL + " WHERE p.id = %s", (person_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "no such person")
    history = conn.execute(
        "SELECT s.starts_at, s.ends_at, s.reason, s.note, s.lifted_at, s.lift_note,"
        "       cp.full_name, lp.full_name"
        " FROM app.suspension s"
        " LEFT JOIN app.admin_user ca ON ca.id = s.created_by"
        " LEFT JOIN identity.person_profile cp ON cp.person_id = ca.person_id"
        " LEFT JOIN app.admin_user la ON la.id = s.lifted_by"
        " LEFT JOIN identity.person_profile lp ON lp.person_id = la.person_id"
        " WHERE s.person_id = %s ORDER BY s.starts_at DESC",
        (person_id,),
    ).fetchall()
    changes = conn.execute(
        "SELECT c.id, c.state::text, c.first, c.fields, c.submitted_at, c.decided_at,"
        "       c.reason, c.by_admin, dp.full_name"
        " FROM identity.profile_change c"
        " LEFT JOIN app.admin_user au ON au.id = c.decided_by"
        " LEFT JOIN identity.person_profile dp ON dp.person_id = au.person_id"
        " WHERE c.person_id = %s ORDER BY c.submitted_at DESC, c.id DESC LIMIT 10",
        (person_id,),
    ).fetchall()
    # Attempts an administrator set aside are decisions about the person, so
    # they are listed here; the attempts themselves are not.
    voids = conn.execute(
        "SELECT cr.case_key, cr.title_tr, v.voided_at, v.reason, round(v.points::numeric, 1),"
        "       jsonb_array_length(v.results), pp.full_name"
        " FROM app.attempt_void v JOIN app.attempt a ON a.id = v.attempt_id"
        " JOIN app.case_registry cr ON cr.id = a.case_id"
        " LEFT JOIN app.admin_user au ON au.id = v.voided_by"
        " LEFT JOIN identity.person_profile pp ON pp.person_id = au.person_id"
        " WHERE a.person_id = %s ORDER BY v.voided_at DESC",
        (person_id,),
    ).fetchall()
    return {
        "voids": [
            {"case_key": v[0], "title": v[1], "at": v[2], "reason": v[3],
             "points": float(v[4]), "steps": v[5], "by": v[6]}
            for v in voids],
        **_rows(conn, admin, [row])[0],
        "suspensions": [
            {"starts_at": h[0], "ends_at": h[1], "reason": h[2], "note": h[3],
             "lifted_at": h[4], "lift_note": h[5], "by": h[6], "lifted_by": h[7]}
            for h in history],
        "changes": [
            {"id": c[0], "state": c[1], "first": c[2], "fields": c[3],
             "submitted_at": c[4], "decided_at": c[5], "reason": c[6],
             "by_admin": c[7], "by": c[8] if c[7] else None}
            for c in changes],
    }


@router.get("/suspensions")
def suspension_list(admin: Admin = Depends(current_admin),
                    conn: psycopg.Connection = Depends(db)) -> list[dict]:
    """Every suspension in force, the one ending soonest first."""
    conn.execute("SELECT app.lift_expired_suspensions()")
    conn.commit()
    rows = conn.execute(
        _PEOPLE_SQL + " WHERE s.id IS NOT NULL ORDER BY s.ends_at NULLS LAST, s.starts_at"
    ).fetchall()
    return _rows(conn, admin, rows)


class SuspensionIn(BaseModel):
    # 1, 7 or 30 days; none means until an administrator lifts it.
    days: int | None = None
    reason: str = Field(min_length=5, max_length=500)
    note: str | None = Field(default=None, max_length=1000)


@router.post("/people/{person_id}/suspend")
def suspend_person(person_id: int, body: SuspensionIn,
                   admin: Admin = Depends(current_admin),
                   conn: psycopg.Connection = Depends(db)) -> dict:
    """Suspend an account. Sessions end at once, the reason is shown to the
    person when they next sign in, and the data stays as it is."""
    if admin.admin_role not in FULL_ROLES:
        raise HTTPException(403, say(admin.locale,
                                     "Hesabı askıya almak yalnızca tam yetkili yöneticilere açık.",
                                     "Only full administrators can suspend an account."))
    if body.days is not None and body.days not in suspensions.DURATIONS:
        raise HTTPException(400, say(admin.locale,
                                     "Süre için 1, 7, 30 gün ya da süresiz seçilebilir.",
                                     "The length can be 1, 7 or 30 days, or open-ended."))
    reason = " ".join(body.reason.split())
    if len(reason) < 5:
        raise HTTPException(400, say(admin.locale, "Gerekçe en az beş karakter olmalı.",
                                     "The reason must be at least five characters long."))
    row = conn.execute("SELECT status::text FROM app.person WHERE id = %s FOR UPDATE",
                       (person_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "no such person")
    is_admin = conn.execute(
        "SELECT 1 FROM app.admin_user WHERE person_id = %s AND revoked_at IS NULL",
        (person_id,)).fetchone()
    if is_admin is not None:
        raise HTTPException(403, say(admin.locale, "Yöneticiler askıya alınamaz.",
                                     "Administrators cannot be suspended."))
    if row[0] == "closed":
        raise HTTPException(409, say(admin.locale, "Bu hesap kapatılmış.",
                                     "This account is closed."))
    if suspensions.in_force(conn, person_id) is not None:
        raise HTTPException(409, say(admin.locale, "Bu hesap zaten askıda.",
                                     "This account is already suspended."))
    admin_user_id = conn.execute(
        "SELECT id FROM app.admin_user WHERE person_id = %s AND revoked_at IS NULL",
        (admin.person_id,)).fetchone()[0]
    done = suspensions.suspend(conn, person_id, body.days, reason,
                               (body.note or "").strip() or None, admin_user_id)
    log(conn, admin, "suspend", "app.person", str(person_id), {"status": row[0]},
        {"status": "suspended", "days": body.days, "reason": reason})
    conn.commit()
    return {"suspended": True, "until": done["ends_at"]}


class LiftIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


@router.post("/people/{person_id}/lift")
def lift_suspension(person_id: int, body: LiftIn, admin: Admin = Depends(current_admin),
                    conn: psycopg.Connection = Depends(db)) -> dict:
    if admin.admin_role not in FULL_ROLES:
        raise HTTPException(403, say(admin.locale,
                                     "Askıdan çıkarma yalnızca tam yetkili yöneticilere açık.",
                                     "Only full administrators can lift a suspension."))
    not_suspended = say(admin.locale, "Bu hesap askıda değil.", "This account is not suspended.")
    # A suspension whose time is already up ended on its own and is recorded so.
    if suspensions.in_force(conn, person_id) is None:
        conn.commit()
        raise HTTPException(409, not_suspended)
    admin_user_id = conn.execute(
        "SELECT id FROM app.admin_user WHERE person_id = %s AND revoked_at IS NULL",
        (admin.person_id,)).fetchone()[0]
    if not suspensions.lift(conn, person_id, admin_user_id, (body.note or "").strip() or None):
        raise HTTPException(409, not_suspended)
    log(conn, admin, "lift_suspension", "app.person", str(person_id), {"status": "suspended"},
        {"status": "active", "note": (body.note or "").strip() or None})
    conn.commit()
    return {"lifted": True}


# ---------------------------------------------------------------------------
# Correcting a profile
# ---------------------------------------------------------------------------

@router.get("/profile-options")
def profile_options(admin: Admin = Depends(current_admin),
                    conn: psycopg.Connection = Depends(db)) -> dict:
    """The titles and units a profile can hold, for the list's filters and for
    correcting a profile, named in the language on screen."""
    titles = conn.execute(
        "SELECT code, label_tr, label_en, is_active FROM app.academic_title"
        " ORDER BY ordinal").fetchall()
    names = english_names(conn, admin.locale)
    return {
        "titles": [{"code": t[0], "label": t[2] if admin.locale == "en" else t[1],
                    "active": t[3]} for t in titles],
        "units": renamed_choices(conn.execute("SELECT app.unit_choices()").fetchone()[0], names),
        "bio_max": profile_check.BIO_MAX,
    }


class Correction(BaseModel):
    given_name: str = Field(max_length=200)
    family_name: str = Field(max_length=200)
    username: str = Field(max_length=100)
    unit_id: int
    role: Literal["student", "academic", "admin_staff"]
    # A code from app.academic_title. A student has none.
    title: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=400)
    # Shown to the person on their profile screen.
    reason: str = Field(max_length=500)


@router.put("/people/{person_id}/profile")
def correct_profile(person_id: int, body: Correction, admin: Admin = Depends(current_admin),
                    conn: psycopg.Connection = Depends(db)) -> dict:
    """Correct what a person declared about themselves, for instance a title or
    a role chosen wrongly, or something approved by mistake.

    The correction is in use at once and counts as approved. A change the
    person was waiting on is closed. The reason is shown to the person on their
    profile screen and the correction is written to the audit log. Nobody
    corrects their own profile here: their change goes through approval like
    anyone else's.
    """
    if admin.admin_role not in FULL_ROLES:
        raise HTTPException(403, say(admin.locale,
                                     "Profil düzeltmek yalnızca tam yetkili yöneticilere açık.",
                                     "Only full administrators can correct a profile."))
    if person_id == admin.person_id:
        raise HTTPException(403, say(admin.locale,
                                     "Kendi profilini profil ekranından değiştir. Değişikliğine"
                                     " başka bir yönetici karar verir.",
                                     "Change your own profile on the profile screen. Another"
                                     " administrator decides on it."))
    reason = " ".join(body.reason.split())
    if len(reason) < 5:
        raise HTTPException(400, say(admin.locale,
                                     "Düzeltmenin gerekçesini yaz. Kişi bu gerekçeyi görecek.",
                                     "Write the reason for the correction. The person will see it."))
    status = conn.execute("SELECT status::text FROM app.person WHERE id = %s",
                          (person_id,)).fetchone()
    if status is None:
        raise HTTPException(404, "no such person")
    if status[0] == "closed":
        raise HTTPException(409, say(admin.locale, "Bu hesap kapatılmış.",
                                     "This account is closed."))
    profiles.lock(conn, person_id)
    now = profiles.current(conn, person_id)
    was = now["values"]
    if was["username"] is None:
        raise HTTPException(409, say(admin.locale, "Bu kişi profilini henüz doldurmamış.",
                                     "This person has not filled in their profile yet."))

    given = profile_check.clean(body.given_name)
    family = profile_check.clean(body.family_name)
    username = body.username.strip().lower()
    bio = profile_check.clean(body.bio) or None
    blocks, _ = profile_check.check_profile(given, family, username, bio)
    # What is kept as it was was accepted before.
    sent = {"given_name": given, "family_name": family, "username": username, "bio": bio}
    blocks = [b for b in blocks if not profiles.same_value(b.field, was.get(b.field),
                                                           sent.get(b.field))]
    if blocks:
        # The panel words each reason in the language on screen and falls back
        # to the message.
        first = blocks[0]
        raise HTTPException(400, {
            "code": "profile_blocked", "field": first.field, "reason": first.code,
            "message": profile_check.MESSAGES_TR.get(first.code, "Bu alan kabul edilmedi.")})
    free = conn.execute("SELECT app.username_available(%s, %s)",
                        (person_id, username)).fetchone()[0]
    if not free:
        raise HTTPException(409, say(admin.locale, "Bu kullanıcı adı başka birinde.",
                                     "Someone else has this username."))

    role = body.role
    title = None if role == "student" else (body.title or None)
    if title == "idari" and role != "admin_staff":
        raise HTTPException(400, say(admin.locale,
                                     "İdari Personel unvanı yalnızca idari personel için seçilir.",
                                     "The Administrative Staff title goes with administrative"
                                     " staff only."))
    if title is not None and title != was["title"]:
        known = conn.execute("SELECT 1 FROM app.academic_title WHERE code = %s AND is_active",
                             (title,)).fetchone()
        if known is None:
            raise HTTPException(400, say(admin.locale, "Bu unvan seçilemiyor.",
                                         "This title cannot be chosen."))
    if body.unit_id != was["unit_id"]:
        unit_ok = conn.execute(
            "SELECT 1 FROM app.unit WHERE id = %s AND is_selectable AND valid_to IS NULL",
            (body.unit_id,)).fetchone()
        if unit_ok is None:
            raise HTTPException(400, say(admin.locale, "Bu birim seçilemiyor.",
                                         "This unit cannot be chosen."))

    values = {"given_name": given, "family_name": family, "title": title,
              "username": username, "unit_id": body.unit_id, "role": role, "bio": bio}
    changed = profiles.differs(was, values)
    if not changed:
        raise HTTPException(400, say(admin.locale, "Değişen bir bilgi yok.",
                                     "Nothing has changed."))
    closed = profiles.correct(conn, person_id, values, changed, reason, admin.person_id)
    log(conn, admin, "correct_profile", "identity.person_profile", str(person_id),
        {"approved": now["approved"], "waiting_closed": closed},
        {"fields": changed, "reason": reason})
    conn.commit()
    # Visitors may see the person on the ranking.
    public_campus.forget("board")
    row = conn.execute(_PEOPLE_SQL + " WHERE p.id = %s", (person_id,)).fetchone()
    return {"corrected": changed, "waiting_closed": closed, "person": _rows(conn, admin, [row])[0]}


# ---------------------------------------------------------------------------
# Attempts set aside
# ---------------------------------------------------------------------------

class VoidIn(BaseModel):
    case_key: str = Field(min_length=1, max_length=80)
    # Shown to the person on the case.
    reason: str = Field(min_length=5, max_length=500)


class RestoreIn(BaseModel):
    case_key: str = Field(min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=500)


def _may_judge(conn: psycopg.Connection, admin: Admin, person_id: int) -> None:
    """Setting an attempt aside is for a full administrator, and never about
    their own attempts."""
    if admin.admin_role not in FULL_ROLES:
        raise HTTPException(403, say(admin.locale,
                                     "Bir denemeyi geçersiz saymak tam yetkili yöneticilere açık.",
                                     "Only full administrators can set an attempt aside."))
    if person_id == admin.person_id:
        raise HTTPException(403, say(admin.locale,
                                     "Kendi denemeni başka bir yönetici geçersiz sayabilir.",
                                     "Another administrator has to decide about your own attempt."))


def _void(conn: psycopg.Connection, admin: Admin, attempt_id: int, reason: str | None) -> dict:
    reason = " ".join((reason or "").split())
    if len(reason) < 5:
        raise HTTPException(400, say(admin.locale, "Gerekçe en az beş karakter olmalı.",
                                     "The reason must be at least five characters long."))
    person_id = conn.execute("SELECT person_id FROM app.attempt WHERE id = %s",
                             (attempt_id,)).fetchone()
    if person_id is None:
        raise HTTPException(404, "no such attempt")
    _may_judge(conn, admin, person_id[0])
    try:
        out = integrity.void(conn, attempt_id, admin_user_id(conn, admin), reason)
    except integrity.AlreadyVoided:
        raise HTTPException(409, say(admin.locale, "Bu deneme zaten geçersiz sayılmış.",
                                     "This attempt has already been set aside."))
    case_key = conn.execute(
        "SELECT cr.case_key FROM app.attempt a JOIN app.case_registry cr ON cr.id = a.case_id"
        " WHERE a.id = %s", (attempt_id,)).fetchone()[0]
    log(conn, admin, "void_attempt", "app.attempt", str(attempt_id), None,
        {"person_id": out["person_id"], "case": case_key, "points": out["points"],
         "steps": out["steps"], "reason": reason})
    return {"points": out["points"], "steps": out["steps"], "case_key": case_key}


def _attempt_of(conn: psycopg.Connection, admin: Admin, person_id: int, case_key: str) -> int:
    row = conn.execute(
        "SELECT a.id FROM app.attempt a JOIN app.case_registry cr ON cr.id = a.case_id"
        " WHERE a.person_id = %s AND cr.case_key = %s", (person_id, case_key)).fetchone()
    if row is None:
        raise HTTPException(404, say(admin.locale, "Bu kişinin bu vakada bir denemesi yok.",
                                     "This person has no attempt at this case."))
    return row[0]


@router.post("/people/{person_id}/void")
def void_attempt(person_id: int, body: VoidIn, admin: Admin = Depends(current_admin),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    """Set a person's attempt at a case aside: its points and its effect on the
    twin are taken back, the case cannot be solved again, and the reason is
    shown to the person on the case."""
    _may_judge(conn, admin, person_id)
    out = _void(conn, admin, _attempt_of(conn, admin, person_id, body.case_key), body.reason)
    conn.commit()
    return {"voided": True, **out}


@router.post("/people/{person_id}/restore")
def restore_attempt(person_id: int, body: RestoreIn, admin: Admin = Depends(current_admin),
                    conn: psycopg.Connection = Depends(db)) -> dict:
    """Undo setting an attempt aside: it counts again as it did."""
    _may_judge(conn, admin, person_id)
    attempt_id = _attempt_of(conn, admin, person_id, body.case_key)
    try:
        out = integrity.restore(conn, attempt_id)
    except integrity.NotVoided:
        raise HTTPException(409, say(admin.locale, "Bu deneme geçersiz sayılmamış.",
                                     "This attempt has not been set aside."))
    log(conn, admin, "restore_attempt", "app.attempt", str(attempt_id), None,
        {"person_id": person_id, "case": body.case_key, "points": out["points"],
         "note": (body.note or "").strip() or None})
    conn.commit()
    return {"restored": True, "points": out["points"], "steps": out["steps"]}


# ---------------------------------------------------------------------------
# Drafts waiting for an administrator
# ---------------------------------------------------------------------------

@router.get("/drafts")
def drafts_to_publish(admin: Admin = Depends(current_admin),
                      conn: psycopg.Connection = Depends(db)) -> dict:
    """Approved drafts, which an administrator publishes, and how many are
    still in review. Reviewing is the authors' work and happens in the editor,
    so an administrator who is not an author still sees what is waiting."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT id, case_key, version, title, type, steps, author_name, reviewer_name,"
            "       updated_at, origin, base_version, locale::text"
            " FROM app.v_case_draft_list WHERE state = 'approved' ORDER BY updated_at")
        approved = cur.fetchall()
    for d in approved:
        d["updated_at"] = d["updated_at"].isoformat()
    waiting = conn.execute(
        "SELECT count(*) FROM app.case_draft WHERE state = 'in_review'").fetchone()[0]
    return {"approved": approved, "in_review": waiting}


# ---------------------------------------------------------------------------
# Problem reports about cases
# ---------------------------------------------------------------------------

@router.get("/reports")
def case_reports(state: str = "open", admin: Admin = Depends(current_admin),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    """Reports grouped by case, the case with the most open reports first.

    The person behind a report is not named; the role is enough to read it.
    """
    if state not in ("open", "closed", "all"):
        raise HTTPException(400, "state is open, closed or all")
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT r.id, cr.case_key, cr.title_tr AS title, cr.locales::text[] AS locales,"
            "       r.step_key, r.variant_key,"
            "       r.case_version, r.kind::text, r.body, r.role_snap::text AS role,"
            "       r.state::text, r.created_at, r.closed_at, r.close_note,"
            # The language the case was solved in, while the attempt is kept.
            "       a.locale::text AS locale"
            " FROM app.case_report r JOIN app.case_registry cr ON cr.id = r.case_id"
            " LEFT JOIN app.attempt a ON a.id = r.attempt_id"
            " WHERE %(state)s = 'all' OR (%(state)s = 'open') = (r.state = 'open')"
            " ORDER BY r.created_at DESC",
            {"state": state})
        rows = cur.fetchall()
    cases: dict[str, dict] = {}
    for r in rows:
        group = cases.setdefault(r["case_key"], {
            "case_key": r["case_key"], "title": r["title"], "locales": r["locales"],
            "open": 0, "reports": []})
        group["open"] += r["state"] == "open"
        r["created_at"] = r["created_at"].isoformat()
        r["closed_at"] = r["closed_at"].isoformat() if r["closed_at"] else None
        group["reports"].append({k: v for k, v in r.items()
                                 if k not in ("case_key", "title", "locales")})
    for group in cases.values():
        steps = _step_order(conn, group["case_key"])
        for r in group["reports"]:
            r["step_index"] = steps.index(r["step_key"]) + 1 if r["step_key"] in steps else None
    ordered = sorted(cases.values(), key=lambda g: (-g["open"], g["title"] or ""))
    total = conn.execute("SELECT count(*) FROM app.case_report WHERE state = 'open'").fetchone()[0]
    return {"cases": ordered, "open_total": total}


def _step_order(conn: psycopg.Connection, case_key: str) -> list[str]:
    try:
        return [s["id"] for s in cl.load_case(Path(CASE_ROOT), case_key, "tr", conn).body["steps"]]
    except cl.CaseNotFound:
        return []


class ReportClose(BaseModel):
    action: str = Field(pattern="^(fixed|dismissed|reopen)$")
    # Shown to the person who wrote the report.
    note: str | None = Field(default=None, max_length=500)


def _close_reports(conn: psycopg.Connection, admin: Admin, where: str, args: tuple,
                   body: ReportClose) -> int:
    if body.action == "reopen":
        n = conn.execute(
            "UPDATE app.case_report SET state = 'open', closed_at = NULL, closed_by = NULL,"
            " close_note = NULL WHERE " + where + " AND state <> 'open'", args).rowcount
    else:
        # A fix is tied to the version that was live when the report closed.
        n = conn.execute(
            "UPDATE app.case_report SET state = %s::app.report_state, closed_at = now(),"
            " close_note = %s, closed_by = (SELECT id FROM app.admin_user"
            "   WHERE person_id = %s AND revoked_at IS NULL),"
            " fixed_in_draft = CASE WHEN %s = 'fixed' THEN (SELECT d.id FROM app.case_draft d"
            "   JOIN app.case_registry cr ON cr.case_key = d.case_key"
            "   WHERE cr.id = case_report.case_id AND d.state = 'published'"
            # With a version in each language, the one the report was sent from.
            "   ORDER BY d.locale = (SELECT a.locale FROM app.attempt a"
            "                         WHERE a.id = case_report.attempt_id) DESC NULLS LAST,"
            "            d.locale = 'tr' DESC LIMIT 1) END"
            " WHERE " + where + " AND state = 'open'",
            (body.action, (body.note or "").strip() or None, admin.person_id, body.action,
             *args)).rowcount
    return n


@router.post("/reports/{report_id}")
def close_report(report_id: int, body: ReportClose, admin: Admin = Depends(current_admin),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    require_write(admin)
    n = _close_reports(conn, admin, "id = %s", (report_id,), body)
    if n == 0:
        raise HTTPException(404, "no report in a state that allows this")
    log(conn, admin, "report_" + body.action, "app.case_report", str(report_id), None,
        {"note": body.note})
    conn.commit()
    return {"changed": n}


@router.post("/cases/{case_key}/reports/close")
def close_case_reports(case_key: str, body: ReportClose,
                       admin: Admin = Depends(current_admin),
                       conn: psycopg.Connection = Depends(db)) -> dict:
    """Close every open report of a case at once, typically after a fix."""
    require_write(admin)
    if body.action == "reopen":
        raise HTTPException(400, "reports are reopened one at a time")
    n = _close_reports(
        conn, admin,
        "case_id = (SELECT id FROM app.case_registry WHERE case_key = %s)", (case_key,), body)
    log(conn, admin, "reports_" + body.action, "app.case_report", case_key, None,
        {"note": body.note, "count": n})
    conn.commit()
    return {"changed": n}


# ---------------------------------------------------------------------------
# The twin's loop: suggestions, campus focus, the hint experiment
# ---------------------------------------------------------------------------

# An area counts as overconfident when stated confidence runs this far above
# the share of fully right answers.
OVERCONFIDENT_GAP = 0.08
# Fewer live cases than this in an area is too few to keep people supplied.
FEW_CASES = 5


@router.get("/interventions")
def interventions(admin: Admin = Depends(current_admin),
                  conn: psycopg.Connection = Depends(db)) -> dict:
    """What the campus twin suggests doing next, as data for the panel's cards.

    Every figure follows the campus rule: an area enters only when at least the
    threshold number of people stand behind it.
    """
    k = conn.execute("SELECT app.competence_threshold()").fetchone()[0]
    ability = conn.execute(
        "SELECT ts.dimension::text, avg(ts.theta)::float8,"
        "       count(*) FILTER (WHERE ts.attempts > 0)"
        " FROM app.twin_state ts JOIN app.person p ON p.id = ts.person_id AND p.status = 'active'"
        " GROUP BY 1").fetchall()
    confidence = conn.execute(
        "SELECT sr.dimension::text, count(DISTINCT a.person_id),"
        "       avg(sr.confidence_c)::float8, avg((sr.outcome_x >= %s)::int)::float8"
        " FROM app.step_result sr JOIN app.attempt a ON a.id = sr.attempt_id"
        " WHERE sr.confidence_c IS NOT NULL GROUP BY 1",
        (scoring.SUCCESS_THRESHOLD,)).fetchall()
    supply = dict(conn.execute(
        "SELECT cs.dimension::text, count(DISTINCT cr.id) FROM app.case_registry cr"
        " JOIN app.case_step cs ON cs.case_id = cr.id"
        " WHERE cr.status = 'live' GROUP BY 1").fetchall())
    waiting = dict(conn.execute(
        "SELECT dimension::text, count(*) FROM app.review_due"
        " WHERE due_at <= now() GROUP BY 1").fetchall())

    cards = []
    known = [(d, theta, n) for d, theta, n in ability if n >= k]
    if known:
        d, theta, n = min(known, key=lambda r: r[1])
        cards.append({"kind": "weakest", "dimension": d, "chance": scoring.predict(theta, 0.0),
                      "people": n})
    for d, people, mean_conf, hit in confidence:
        if people >= k and mean_conf - hit > OVERCONFIDENT_GAP:
            cards.append({"kind": "overconfident", "dimension": d, "people": people,
                          "confidence": mean_conf, "hit_rate": hit})
    for d in service.DIMENSIONS:
        if waiting.get(d, 0) >= k:
            cards.append({"kind": "review_wave", "dimension": d, "people": waiting[d]})
    for d in service.DIMENSIONS:
        if supply.get(d, 0) < FEW_CASES:
            cards.append({"kind": "few_cases", "dimension": d, "cases": supply.get(d, 0)})
    return {"cards": cards, "focus": service.campus_focus(conn), "threshold": k,
            "cases": {d: supply.get(d, 0) for d in service.DIMENSIONS}}


class FocusIn(BaseModel):
    dimension: str | None = None
    days: int = Field(default=7, ge=1, le=60)


@router.put("/focus")
def set_focus(body: FocusIn, admin: Admin = Depends(current_admin),
              conn: psycopg.Connection = Depends(db)) -> dict:
    """Bring one area forward in everyone's next case for a number of days, or
    stop doing so. A person who is already strong in the area is not pushed."""
    require_write(admin)
    if body.dimension is not None and body.dimension not in service.DIMENSIONS:
        raise HTTPException(400, "unknown dimension")
    value = None
    if body.dimension is not None:
        until = conn.execute("SELECT now() + make_interval(days => %s)",
                             (body.days,)).fetchone()[0]
        value = {"dimension": body.dimension, "until": until.isoformat()}
    conn.execute(
        "INSERT INTO app.platform_setting (key, value, updated_at) VALUES ('campus_focus', %s, now())"
        " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
        (Json(value),))
    log(conn, admin, "campus_focus", "app.platform_setting", "campus_focus", None, value)
    conn.commit()
    return {"focus": value}


# People per arm before the difference is reported with an interval.
EXPERIMENT_MIN_PEOPLE = 20


@router.get("/hint-experiment")
def hint_experiment(admin: Admin = Depends(current_admin),
                    conn: psycopg.Connection = Depends(db)) -> dict:
    """Whether tips before hard steps help.

    Each person is in one arm for good, decided at random, and every eligible
    step is recorded in both arms. How much better than expected a person did
    is the result minus the sealed prediction, averaged over that person's
    eligible steps; the arms are compared on these per-person means, since the
    person is what was randomised.
    """
    rows = conn.execute(
        "SELECT he.arm, a.person_id, avg(sr.outcome_x - he.p_sealed)::float8,"
        "       avg((sr.outcome_x >= %s)::int)::float8, count(*)"
        " FROM app.hint_exposure he"
        " JOIN app.attempt a ON a.id = he.attempt_id"
        " JOIN app.step_result sr ON sr.attempt_id = he.attempt_id"
        "  AND sr.case_step_id = he.case_step_id"
        " GROUP BY he.arm, a.person_id", (scoring.SUCCESS_THRESHOLD,)).fetchall()
    arms: dict[str, dict] = {}
    for arm, _person, residual, hit, steps in rows:
        a = arms.setdefault(arm, {"people": 0, "steps": 0, "residuals": [], "hits": []})
        a["people"] += 1
        a["steps"] += steps
        a["residuals"].append(residual)
        a["hits"].append(hit)

    def summary(a: dict) -> dict:
        n = len(a["residuals"])
        mean = sum(a["residuals"]) / n
        var = sum((x - mean) ** 2 for x in a["residuals"]) / (n - 1) if n > 1 else 0.0
        return {"people": a["people"], "steps": a["steps"], "gain": mean, "var": var,
                "hit_rate": sum(a["hits"]) / n}

    out = {name: summary(a) for name, a in arms.items()}
    difference = None
    h, c = out.get("hint"), out.get("control")
    if h and c and min(h["people"], c["people"]) >= EXPERIMENT_MIN_PEOPLE:
        diff = h["gain"] - c["gain"]
        se = (h["var"] / h["people"] + c["var"] / c["people"]) ** 0.5
        difference = {"value": diff, "low": diff - 1.96 * se, "high": diff + 1.96 * se}
    for a in out.values():
        a.pop("var")
    return {"running": bool(_setting_value(conn, "hint_experiment", True)),
            "threshold": float(_setting_value(conn, "hint_threshold", 0.45)),
            "arms": out, "difference": difference, "min_people": EXPERIMENT_MIN_PEOPLE}


def _setting_value(conn: psycopg.Connection, key: str, default):
    row = conn.execute("SELECT value FROM app.platform_setting WHERE key = %s", (key,)).fetchone()
    return default if row is None else row[0]


# ---------------------------------------------------------------------------
# Units — retire, never delete
# ---------------------------------------------------------------------------

@router.get("/units/tree")
def unit_tree(include_closed: bool = False,
              admin: Admin = Depends(current_admin),
              conn: psycopg.Connection = Depends(db)) -> list[dict]:
    rows = conn.execute(
        "SELECT u.id, u.code, u.name_tr, u.kind::text, u.path::text, u.parent_id,"
        "       u.is_selectable, u.valid_to,"
        "       (SELECT count(*) FROM app.person p"
        "         WHERE p.unit_id = u.id AND p.status = 'active') AS people,"
        "       u.name_en"
        " FROM app.unit u"
        " WHERE (%s OR u.valid_to IS NULL)"
        " ORDER BY u.path",
        (include_closed,),
    ).fetchall()
    return [
        {"id": r[0], "code": r[1],
         "name": r[9] if admin.locale == "en" and r[9] else r[2],
         "name_tr": r[2], "name_en": r[9], "kind": r[3], "path": r[4],
         "parent_id": r[5], "selectable": r[6], "closed": r[7] is not None,
         "people": r[8], "depth": r[4].count(".")}
        for r in rows
    ]


class UnitInput(BaseModel):
    code: str
    name_tr: str
    # Shown in the English interface; the Turkish name stands in without it.
    name_en: str | None = Field(default=None, max_length=200)
    kind: str
    parent_id: int


@router.post("/units")
def add_unit(body: UnitInput, admin: Admin = Depends(current_admin),
             conn: psycopg.Connection = Depends(db)) -> dict:
    require_write(admin)
    parent = conn.execute(
        "SELECT path::text FROM app.unit WHERE id = %s AND valid_to IS NULL",
        (body.parent_id,),
    ).fetchone()
    if parent is None:
        raise HTTPException(400, "unknown parent")
    if parent[0].count(".") >= 2:
        # Depth is capped because anything deeper never clears the reporting
        # threshold.
        raise HTTPException(400, "the tree is two selectable levels deep by design")

    row = conn.execute(
        "INSERT INTO app.unit (code, name_tr, name_en, kind, path, parent_id, is_selectable)"
        " VALUES (%s, %s, %s, %s::app.unit_kind, (%s || '.' || %s)::ltree, %s, true)"
        " RETURNING id",
        (body.code, body.name_tr, (body.name_en or "").strip() or None, body.kind,
         parent[0], body.code, body.parent_id),
    ).fetchone()
    conn.execute("UPDATE app.unit SET is_selectable = false WHERE id = %s", (body.parent_id,))
    log(conn, admin, "add_unit", "app.unit", body.code, None, body.model_dump())
    conn.commit()
    return {"unit_id": row[0]}


@router.post("/units/{unit_id}/close")
def close_unit(unit_id: int, admin: Admin = Depends(current_admin),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """Close a unit for new registrations without touching its history."""
    require_write(admin)
    people = conn.execute(
        "SELECT count(*) FROM app.person WHERE unit_id = %s AND status = 'active'",
        (unit_id,),
    ).fetchone()[0]
    conn.execute(
        "UPDATE app.unit SET valid_to = CURRENT_DATE, is_selectable = false"
        " WHERE id = %s AND valid_to IS NULL", (unit_id,)
    )
    log(conn, admin, "close_unit", "app.unit", str(unit_id), {"active_people": people}, None)
    conn.commit()
    return {"closed": True, "people_to_move": people}


# ---------------------------------------------------------------------------
# Accepted email domains
# ---------------------------------------------------------------------------

# This table is the entire identity check. A missing row shuts a faculty out of
# the programme; a wrong role hands staff privileges to students. Every guard
# below prevents a failure that is silent from the outside: a person simply
# cannot register and nobody hears about it.

@router.get("/domains")
def list_domains(admin: Admin = Depends(current_admin),
                 conn: psycopg.Connection = Depends(db)) -> list[dict]:
    """Every rule, with how many people came in through it.

    The count is what makes a removal safe to judge.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT r.domain::text, r.assigns_role::text AS role, r.is_active, r.note,"
            "       (SELECT count(*) FROM identity.person_email e"
            "         WHERE e.domain = r.domain) AS people"
            " FROM app.email_domain_rule r"
            " ORDER BY r.assigns_role, r.domain")
        return cur.fetchall()


class DomainIn(BaseModel):
    # Loose here so that _normalise can explain what is wrong in plain words.
    domain: str = Field(min_length=1, max_length=120)
    role: str = Field(pattern="^(student|academic|admin_staff)$")
    note: str | None = Field(default=None, max_length=200)


# A host name in lower-case ASCII: labels of letters, digits and hyphens, at
# least two of them, ending in a top-level domain of letters.
DOMAIN_SHAPE = re.compile(
    r"^(?=.{4,120}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")

# Mail services where anybody can open an address. A domain of theirs would let
# everyone in, so none of them is ever accepted.
PUBLIC_MAIL = {
    "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.tr", "hotmail.co.uk",
    "outlook.com", "outlook.com.tr", "live.com", "msn.com", "windowslive.com",
    "yahoo.com", "yahoo.com.tr", "yahoo.co.uk", "ymail.com", "rocketmail.com",
    "icloud.com", "me.com", "mac.com", "aol.com", "aim.com",
    "yandex.com", "yandex.com.tr", "yandex.ru", "ya.ru", "mail.ru", "inbox.ru", "list.ru",
    "bk.ru", "proton.me", "protonmail.com", "pm.me", "tutanota.com", "tuta.io",
    "gmx.com", "gmx.de", "gmx.net", "gmx.at", "web.de", "t-online.de", "zoho.com",
    "zohomail.com", "mail.com", "fastmail.com", "hushmail.com", "qq.com", "163.com",
    "126.com", "naver.com", "orange.fr", "libero.it", "mynet.com", "superonline.com",
    "ttmail.com", "turk.net", "e-kolay.net", "yopmail.com", "mailinator.com",
    "guerrillamail.com", "10minutemail.com", "temp-mail.org",
}


def _clean(domain: str) -> str:
    """A domain as it is stored: trimmed, lower-case, without a leading @."""
    return domain.strip().lower().lstrip("@")


def _normalise(domain: str, locale: str = "tr") -> str:
    """A domain that may be added, or why not."""
    d = _clean(domain)
    if d.startswith("http"):
        raise HTTPException(400, say(locale, "Web adresi değil, yalnızca alan adını yaz.",
                                     "Enter a domain, not an address."))
    if "@" in d or "/" in d or " " in d:
        raise HTTPException(400, say(locale,
                                     "Alan adı yalnızca nokta ile ayrılmış parçalardan oluşur.",
                                     "A domain is made only of parts separated by dots."))
    if "." not in d:
        raise HTTPException(400, say(locale, "Alan adı en az bir nokta içermeli.",
                                     "A domain must contain at least one dot."))
    if not DOMAIN_SHAPE.match(d):
        raise HTTPException(400, say(
            locale,
            "Alan adı yalnızca küçük harf, rakam, tire ve noktadan oluşur, örneğin"
            " ogr.sdu.edu.tr.",
            "A domain is made only of lowercase letters, digits, hyphens and dots, for"
            " example ogr.sdu.edu.tr."))
    if any(d == p or d.endswith("." + p) for p in PUBLIC_MAIL):
        raise HTTPException(400, say(locale,
                                     "Herkesin adres açabildiği bir e-posta hizmeti eklenemez.",
                                     "A mail service where anyone can open an address cannot"
                                     " be added."))
    return d


def _admin_uses(conn: psycopg.Connection, domain: str) -> bool:
    return conn.execute(
        "SELECT EXISTS (SELECT 1 FROM identity.person_email e"
        " JOIN app.admin_user au ON au.person_id = e.person_id AND au.revoked_at IS NULL"
        " WHERE e.domain = %s)", (domain,)).fetchone()[0]


def require_full(admin: Admin) -> None:
    if admin.admin_role not in FULL_ROLES:
        raise HTTPException(403, say(admin.locale,
                                     "Kabul edilen alan adlarını tam yetkili yöneticiler"
                                     " değiştirebilir.",
                                     "Only full administrators can change the accepted"
                                     " domains."))


@router.post("/domains", status_code=201)
def add_domain(body: DomainIn, admin: Admin = Depends(current_admin),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """Accept a new domain. One already in the list is changed only by closing
    or opening it, so its role never changes under the people who have it."""
    require_full(admin)
    domain = _normalise(body.domain, admin.locale)
    added = conn.execute(
        "INSERT INTO app.email_domain_rule (domain, assigns_role, is_active, note)"
        " VALUES (%s, %s::app.person_role, true, %s)"
        " ON CONFLICT (domain) DO NOTHING RETURNING domain",
        (domain, body.role, body.note)).fetchone()
    if added is None:
        raise HTTPException(409, say(admin.locale,
                                     "Bu alan adı zaten listede. Kapalıysa listeden aç.",
                                     "This domain is already listed. If it is closed, open it"
                                     " in the list."))
    log(conn, admin, "add_domain", "app.email_domain_rule", domain, None,
        {"role": body.role})
    conn.commit()
    return {"domain": domain, "role": body.role, "is_active": True}


class DomainState(BaseModel):
    is_active: bool


@router.put("/domains/{domain}")
def set_domain_state(domain: str, body: DomainState,
                     admin: Admin = Depends(current_admin),
                     conn: psycopg.Connection = Depends(db)) -> dict:
    """Close a domain, or open it again.

    A closed domain gets no codes, and the sessions of the people registered
    through it end at once. Never a delete: the row is referenced by their
    address records, and they keep their accounts and their history.
    """
    require_full(admin)
    d = _clean(domain)
    ended = 0
    unknown = say(admin.locale, "Böyle bir alan adı yok.", "There is no such domain.")

    if not body.is_active:
        # A role with no live domain is a role nobody can ever register as.
        others = conn.execute(
            "SELECT count(*) FROM app.email_domain_rule r"
            " WHERE r.is_active AND r.domain <> %s"
            "   AND r.assigns_role = (SELECT assigns_role FROM app.email_domain_rule"
            "                          WHERE domain = %s)",
            (d, d)).fetchone()
        if others is None:
            raise HTTPException(404, unknown)
        if others[0] == 0:
            raise HTTPException(409, say(
                admin.locale,
                "Bu rol için açık başka alan adı yok. Kapatırsan o rolde kimse kayıt olamaz.",
                "No other domain is open for this role. If you close it, nobody can sign up"
                " in that role."))
        if _admin_uses(conn, d):
            raise HTTPException(409, say(
                admin.locale,
                "Bu alan adını kullanan bir yönetici var. Kapatırsan o yönetici panele giremez.",
                "An administrator uses this domain. If you close it, that administrator"
                " cannot reach the panel."))

    row = conn.execute(
        "UPDATE app.email_domain_rule SET is_active = %s WHERE domain = %s"
        " RETURNING domain::text, assigns_role::text, is_active",
        (body.is_active, d)).fetchone()
    if row is None:
        raise HTTPException(404, unknown)
    if not body.is_active:
        ended = conn.execute(
            "UPDATE app.person SET sessions_from = greatest(sessions_from,"
            "  date_trunc('milliseconds', now()))"
            " WHERE id IN (SELECT person_id FROM identity.person_email WHERE domain = %s)",
            (d,)).rowcount

    log(conn, admin, "set_domain_state", "app.email_domain_rule", d,
        None, {"is_active": body.is_active, "sessions_ended_for": ended})
    conn.commit()
    return {"domain": row[0], "role": row[1], "is_active": row[2], "sessions_ended_for": ended}


@router.delete("/domains/{domain}", status_code=204)
def remove_domain(domain: str, admin: Admin = Depends(current_admin),
                  conn: psycopg.Connection = Depends(db)) -> None:
    """Remove a rule that nobody has ever used.

    A domain with people behind it is refused, since their address records
    point at it.
    """
    require_full(admin)
    d = _clean(domain)
    used = conn.execute(
        "SELECT count(*) FROM identity.person_email WHERE domain = %s", (d,)
    ).fetchone()[0]
    if used:
        raise HTTPException(409, say(
            admin.locale, f"{used} kişi bu alan adıyla kayıtlı. Silmek yerine kapat.",
            f"{used} people are registered with this domain. Close it instead of removing it."))

    conn.execute("DELETE FROM app.email_domain_rule WHERE domain = %s", (d,))
    log(conn, admin, "remove_domain", "app.email_domain_rule", d, None, None)
    conn.commit()


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------

class AnnouncementIn(BaseModel):
    # Loose here so that the checks in announcements.py can say what is wrong
    # in plain words.
    title: str = Field(max_length=1000)
    body: str = Field(max_length=5000)
    link: str | None = Field(default=None, max_length=2000)
    audience: Literal["public", "members", "student", "staff"] = "public"
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    # Where and when the event takes place, for the campus map. Both optional.
    place: str | None = Field(default=None, max_length=20)
    event_at: datetime | None = None


def _aware(moment: datetime | None) -> datetime | None:
    """A time without a zone is the campus's own time."""
    if moment is None or moment.tzinfo is not None:
        return moment
    from zoneinfo import ZoneInfo
    return moment.replace(tzinfo=ZoneInfo(LOCAL_TZ))


def _announcement_fields(conn: psycopg.Connection, body: AnnouncementIn,
                         locale: str = "tr") -> dict:
    try:
        fields = {"title": announcements.clean_title(body.title),
                  "body": announcements.clean_body(body.body),
                  "link_url": announcements.clean_link(body.link),
                  "audience": body.audience}
    except announcements.Refused as exc:
        raise HTTPException(400, exc.text(locale))
    now = conn.execute("SELECT now()").fetchone()[0]
    starts = _aware(body.starts_at) or now
    ends = _aware(body.ends_at)
    if ends is not None and ends <= now:
        raise HTTPException(400, say(
            locale, "Bitiş zamanı geçmişte kalıyor. Duyuruyu hemen kaldırmak için sil.",
            "The end is in the past. To take the announcement down now, remove it."))
    if ends is not None and ends <= starts:
        raise HTTPException(400, say(locale, "Bitiş zamanı başlangıçtan sonra olmalı.",
                                     "The end must come after the start."))
    try:
        place = campus.clean_place(conn, body.place)
    except ValueError:
        raise HTTPException(400, say(locale, "Seçilen yer haritada yok. Listeden bir yer seç.",
                                     "That place is not on the map. Pick one from the list."))
    event_at = _aware(body.event_at)
    if event_at is not None and place is None:
        raise HTTPException(400, say(
            locale, "Etkinliğin zamanı yeriyle birlikte haritada gösterilir. Önce bir yer seç.",
            "An event's time is shown on the map with its place. Pick a place first."))
    fields.update(starts_at=starts, ends_at=ends, place=place, event_at=event_at)
    return fields


def _announcement_out(r, now: datetime) -> dict:
    return {"id": r[0], "title": r[1], "body": r[2], "link": r[3], "audience": r[4],
            "starts_at": r[5].isoformat(), "ends_at": r[6].isoformat() if r[6] else None,
            "created_at": r[7].isoformat(),
            "updated_at": r[8].isoformat() if r[8] else None,
            "place": r[9], "event_at": r[10].isoformat() if r[10] else None,
            "state": announcements.state_of(r[5], r[6], now)}


_ANNOUNCEMENT_COLUMNS = ("id, title, body, link_url, audience, starts_at, ends_at,"
                         " created_at, updated_at, place, event_at")


@router.get("/announcements")
def list_announcements(admin: Admin = Depends(current_admin),
                       conn: psycopg.Connection = Depends(db)) -> dict:
    """Every announcement, the ones still to come and the ended ones too."""
    now = conn.execute("SELECT now()").fetchone()[0]
    rows = conn.execute(
        f"SELECT {_ANNOUNCEMENT_COLUMNS} FROM app.announcement"
        " ORDER BY (ends_at IS NOT NULL AND ends_at <= now()), starts_at DESC, id DESC"
        " LIMIT 200").fetchall()
    return {"announcements": [_announcement_out(r, now) for r in rows]}


@router.post("/announcements", status_code=201)
def add_announcement(body: AnnouncementIn, admin: Admin = Depends(current_admin),
                     conn: psycopg.Connection = Depends(db)) -> dict:
    require_write(admin)
    f = _announcement_fields(conn, body, admin.locale)
    row = conn.execute(
        "INSERT INTO app.announcement (title, body, link_url, audience, starts_at, ends_at,"
        "                              place, event_at, created_by)"
        " VALUES (%(title)s, %(body)s, %(link_url)s, %(audience)s, %(starts_at)s,"
        "         %(ends_at)s, %(place)s, %(event_at)s, %(by)s)"
        f" RETURNING {_ANNOUNCEMENT_COLUMNS}",
        {**f, "by": admin_user_id(conn, admin)}).fetchone()
    log(conn, admin, "announcement_add", "app.announcement", str(row[0]), None,
        {"title": f["title"], "audience": f["audience"],
         "starts_at": f["starts_at"].isoformat(),
         "ends_at": f["ends_at"].isoformat() if f["ends_at"] else None,
         "place": f["place"],
         "event_at": f["event_at"].isoformat() if f["event_at"] else None})
    conn.commit()
    announcements.forget()
    return _announcement_out(row, conn.execute("SELECT now()").fetchone()[0])


@router.put("/announcements/{announcement_id}")
def edit_announcement(announcement_id: int, body: AnnouncementIn,
                      admin: Admin = Depends(current_admin),
                      conn: psycopg.Connection = Depends(db)) -> dict:
    require_write(admin)
    before = conn.execute(
        "SELECT title, body, link_url, audience, starts_at, ends_at, place, event_at"
        " FROM app.announcement WHERE id = %s FOR UPDATE", (announcement_id,)).fetchone()
    if before is None:
        raise HTTPException(404, say(admin.locale, "Böyle bir duyuru yok.",
                                     "There is no such announcement."))
    f = _announcement_fields(conn, body, admin.locale)
    row = conn.execute(
        "UPDATE app.announcement SET title = %(title)s, body = %(body)s,"
        "       link_url = %(link_url)s, audience = %(audience)s,"
        "       starts_at = %(starts_at)s, ends_at = %(ends_at)s,"
        "       place = %(place)s, event_at = %(event_at)s,"
        "       updated_by = %(by)s, updated_at = now()"
        " WHERE id = %(id)s"
        f" RETURNING {_ANNOUNCEMENT_COLUMNS}",
        {**f, "by": admin_user_id(conn, admin), "id": announcement_id}).fetchone()
    log(conn, admin, "announcement_edit", "app.announcement", str(announcement_id),
        {"title": before[0], "body": before[1], "link": before[2], "audience": before[3],
         "starts_at": before[4].isoformat(),
         "ends_at": before[5].isoformat() if before[5] else None,
         "place": before[6], "event_at": before[7].isoformat() if before[7] else None},
        {"title": f["title"], "body": f["body"], "link": f["link_url"],
         "audience": f["audience"], "starts_at": f["starts_at"].isoformat(),
         "ends_at": f["ends_at"].isoformat() if f["ends_at"] else None,
         "place": f["place"],
         "event_at": f["event_at"].isoformat() if f["event_at"] else None})
    conn.commit()
    announcements.forget()
    return _announcement_out(row, conn.execute("SELECT now()").fetchone()[0])


@router.delete("/announcements/{announcement_id}", status_code=204)
def remove_announcement(announcement_id: int, admin: Admin = Depends(current_admin),
                        conn: psycopg.Connection = Depends(db)) -> None:
    """Take an announcement down for good. The administrative log keeps what
    it said."""
    require_write(admin)
    row = conn.execute(
        "DELETE FROM app.announcement WHERE id = %s"
        " RETURNING title, body, link_url, audience, starts_at, ends_at, place, event_at",
        (announcement_id,)).fetchone()
    if row is None:
        raise HTTPException(404, say(admin.locale, "Böyle bir duyuru yok.",
                                     "There is no such announcement."))
    log(conn, admin, "announcement_remove", "app.announcement", str(announcement_id),
        {"title": row[0], "body": row[1], "link": row[2], "audience": row[3],
         "starts_at": row[4].isoformat(), "ends_at": row[5].isoformat() if row[5] else None,
         "place": row[6], "event_at": row[7].isoformat() if row[7] else None},
        None)
    conn.commit()
    announcements.forget()


# ---------------------------------------------------------------------------
# Rare marks and medals
# ---------------------------------------------------------------------------

class AwardIn(BaseModel):
    category: Literal["marks", "super", "mega", "ultra"]
    # Loose here so that the checks below can say what is wrong in plain words.
    name_tr: str = Field(max_length=500)
    name_en: str | None = Field(default=None, max_length=500)
    what_tr: str = Field(max_length=2000)
    what_en: str | None = Field(default=None, max_length=2000)
    rule: dict
    active: bool = True
    position: int = Field(default=0, ge=0, le=999)


class GrantIn(BaseModel):
    person_id: int
    note: str | None = Field(default=None, max_length=300)


AWARD_COLUMNS = ("a.id, a.code, a.category, a.name_tr, a.name_en, a.what_tr, a.what_en, a.rule,"
                 " a.built_in, a.active, a.position, a.image_sha256, a.created_at, a.updated_at,"
                 " (SELECT count(*) FROM app.person_award pa WHERE pa.award_id = a.id),"
                 " (SELECT count(*) FROM app.person_award pa"
                 "   WHERE pa.award_id = a.id AND pa.granted_by IS NOT NULL)")


def _award_out(r) -> dict:
    return {"id": r[0], "code": r[1], "category": r[2], "name_tr": r[3], "name_en": r[4],
            "what_tr": r[5], "what_en": r[6], "rule": r[7], "built_in": r[8], "active": r[9],
            "position": r[10],
            "image": case_images.version_of(bytes(r[11])) if r[11] else None,
            "created_at": r[12].isoformat(), "updated_at": r[13].isoformat(),
            "holders": r[14], "by_hand": r[15]}


def _award(conn: psycopg.Connection, admin: Admin, award_id: int) -> dict:
    row = conn.execute(f"SELECT {AWARD_COLUMNS} FROM app.award a WHERE a.id = %s",
                       (award_id,)).fetchone()
    if row is None:
        raise HTTPException(404, say(admin.locale, "Böyle bir işaret ya da madalya yok.",
                                     "There is no such mark or medal."))
    return _award_out(row)


def _own_award(conn: psycopg.Connection, admin: Admin, award_id: int) -> dict:
    """An award an administrator added: the ones that come with the platform
    are checked by the platform and keep their own pictures."""
    award = _award(conn, admin, award_id)
    if award["built_in"]:
        raise HTTPException(403, say(
            admin.locale, "Platformla gelen nadir işaretler değiştirilemez.",
            "The rare marks that come with the platform cannot be changed."))
    return award


def _tidy(text: str | None) -> str | None:
    text = " ".join((text or "").split())
    return text or None


def _award_fields(conn: psycopg.Connection, admin: Admin, body: AwardIn,
                  award_id: int | None) -> dict:
    loc = admin.locale
    name_tr, name_en = _tidy(body.name_tr), _tidy(body.name_en)
    what_tr, what_en = _tidy(body.what_tr), _tidy(body.what_en)
    if not name_tr or not 2 <= len(name_tr) <= 60 \
            or (name_en is not None and not 2 <= len(name_en) <= 60):
        raise HTTPException(400, say(loc, "Ad 2 ile 60 karakter arasında olmalı.",
                                     "A name must be 2 to 60 characters long."))
    if not what_tr or not 5 <= len(what_tr) <= 300 \
            or (what_en is not None and not 5 <= len(what_en) <= 300):
        raise HTTPException(400, say(loc, "Açıklama 5 ile 300 karakter arasında olmalı.",
                                     "A description must be 5 to 300 characters long."))
    taken = conn.execute(
        "SELECT 1 FROM app.award WHERE lower(name_tr) = lower(%s) AND id IS DISTINCT FROM %s",
        (name_tr, award_id)).fetchone()
    if taken:
        raise HTTPException(409, say(loc, "Bu adla başka bir işaret ya da madalya var.",
                                     "Another mark or medal already has this name."))
    try:
        rule = awards.clean_rule(conn, body.rule)
    except awards.Refused as exc:
        raise HTTPException(400, exc.text(loc))
    return {"category": body.category, "name_tr": name_tr, "name_en": name_en,
            "what_tr": what_tr, "what_en": what_en, "rule": rule, "active": body.active,
            "position": body.position}


def _check_later(fields: dict, award_id: int) -> bool:
    """Look for those who already meet a condition, without holding up the
    answer. Returns whether a check was started."""
    if not fields["active"] or fields["rule"]["kind"] == "manual":
        return False
    awards.sweep_in_background(current_dsn(), [award_id])
    return True


@router.get("/awards")
def list_awards(admin: Admin = Depends(current_admin),
                conn: psycopg.Connection = Depends(db)) -> dict:
    """Every mark and medal, those switched off too, with how many hold each."""
    rows = conn.execute(
        f"SELECT {AWARD_COLUMNS} FROM app.award a"
        " JOIN app.award_category c ON c.code = a.category"
        " ORDER BY c.position, a.position, a.id").fetchall()
    categories = [{"code": c, "name_tr": tr, "name_en": en} for c, tr, en in conn.execute(
        "SELECT code, name_tr, name_en FROM app.award_category ORDER BY position").fetchall()]
    return {"categories": categories, "awards": [_award_out(r) for r in rows],
            "kinds": list(awards.RULE_KINDS), "dimensions": list(awards.DIMENSIONS),
            "can_write": admin.admin_role in WRITE_ROLES,
            "can_grant": admin.admin_role in FULL_ROLES}


@router.post("/awards", status_code=201)
def add_award(body: AwardIn, admin: Admin = Depends(current_admin),
              conn: psycopg.Connection = Depends(db)) -> dict:
    """A new mark or medal. One with a condition is given to those who
    already meet it, in the background, and to the others when they do."""
    require_write(admin)
    fields = _award_fields(conn, admin, body, None)
    award_id = conn.execute(
        "WITH n AS (SELECT nextval(pg_get_serial_sequence('app.award', 'id')) AS id)"
        " INSERT INTO app.award (id, code, category, name_tr, name_en, what_tr, what_en, rule,"
        "                        active, position, created_by)"
        " SELECT n.id, 'award-' || n.id, %(category)s, %(name_tr)s, %(name_en)s, %(what_tr)s,"
        "        %(what_en)s, %(rule)s, %(active)s, %(position)s, %(by)s FROM n RETURNING id",
        {**fields, "rule": Json(fields["rule"]), "by": admin_user_id(conn, admin)}).fetchone()[0]
    log(conn, admin, "award_add", "app.award", str(award_id), None, fields)
    conn.commit()
    checking = _check_later(fields, award_id)
    return {**_award(conn, admin, award_id), "checking": checking}


@router.put("/awards/{award_id}")
def edit_award(award_id: int, body: AwardIn, admin: Admin = Depends(current_admin),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """Change a mark or medal. Those who hold it keep it, whatever changes."""
    require_write(admin)
    before = _own_award(conn, admin, award_id)
    fields = _award_fields(conn, admin, body, award_id)
    conn.execute(
        "UPDATE app.award SET category = %(category)s, name_tr = %(name_tr)s,"
        "       name_en = %(name_en)s, what_tr = %(what_tr)s, what_en = %(what_en)s,"
        "       rule = %(rule)s, active = %(active)s, position = %(position)s,"
        "       updated_at = now() WHERE id = %(id)s",
        {**fields, "rule": Json(fields["rule"]), "id": award_id})
    log(conn, admin, "award_edit", "app.award", str(award_id),
        {k: before[k] for k in fields}, fields)
    conn.commit()
    changed = fields["rule"] != before["rule"] or (fields["active"] and not before["active"])
    checking = _check_later(fields, award_id) if changed else False
    return {**_award(conn, admin, award_id), "checking": checking}


@router.delete("/awards/{award_id}", status_code=204)
def remove_award(award_id: int, admin: Admin = Depends(current_admin),
                 conn: psycopg.Connection = Depends(db)) -> None:
    """Remove a mark or medal nobody holds. One that somebody holds is switched
    off instead, so they keep it."""
    require_write(admin)
    award = _own_award(conn, admin, award_id)
    if award["holders"]:
        raise HTTPException(409, say(
            admin.locale,
            "Bunu kazanmış kişiler var, bu yüzden silinemez. Kapatabilirsin: Kazananlar korur,"
            " başka kimse kazanamaz.",
            "Some people hold it, so it cannot be removed. You can switch it off: those who"
            " hold it keep it, and nobody else can earn it."))
    key = conn.execute("DELETE FROM app.award WHERE id = %s RETURNING image_key",
                       (award_id,)).fetchone()[0]
    log(conn, admin, "award_remove", "app.award", str(award_id),
        {k: award[k] for k in ("code", "category", "name_tr", "what_tr", "rule")}, None)
    conn.commit()
    if key:
        storage.drop(key)


@router.post("/awards/{award_id}/image")
async def put_award_image(award_id: int, image: UploadFile = File(...),
                          admin: Admin = Depends(current_admin),
                          conn: psycopg.Connection = Depends(db)) -> dict:
    """Show a mark or medal with this picture, in place of any it had. The
    bytes decide what the file is; its name and declared type are ignored."""
    require_write(admin)
    _own_award(conn, admin, award_id)
    data = await image.read(awards.IMAGE_MAX_BYTES + 1)
    try:
        stored = awards.store_image(conn, award_id, data)
    except awards.Refused as exc:
        raise HTTPException(400, exc.text(admin.locale))
    log(conn, admin, "award_image_set", "app.award", str(award_id), None,
        {k: stored[k] for k in ("sha256", "bytes", "width", "height")})
    conn.commit()
    if stored["replaced"]:
        storage.drop(stored["replaced"])
    return _award(conn, admin, award_id)


@router.delete("/awards/{award_id}/image")
def remove_award_image(award_id: int, admin: Admin = Depends(current_admin),
                       conn: psycopg.Connection = Depends(db)) -> dict:
    """Take the uploaded picture away; the award is drawn in its group's
    colours again."""
    require_write(admin)
    _own_award(conn, admin, award_id)
    dropped = awards.remove_image(conn, award_id)
    if dropped is None:
        raise HTTPException(404, say(admin.locale, "Yüklenmiş bir görsel yok.",
                                     "No picture has been uploaded."))
    log(conn, admin, "award_image_remove", "app.award", str(award_id), None, None)
    conn.commit()
    storage.drop(dropped)
    return _award(conn, admin, award_id)


@router.get("/awards/{award_id}/holders")
def award_holders(award_id: int, admin: Admin = Depends(current_admin),
                  conn: psycopg.Connection = Depends(db)) -> dict:
    """Who holds a mark or medal, newest first, and whether it was given by hand."""
    _award(conn, admin, award_id)
    rows = conn.execute(
        "SELECT pa.person_id, pp.username::text,"
        "       nullif(concat_ws(' ', pp.given_name, pp.family_name), ''), p.avatar,"
        "       p.role::text, pa.earned_at, pa.granted_by IS NOT NULL, cr.case_key"
        " FROM app.person_award pa JOIN app.person p ON p.id = pa.person_id"
        " LEFT JOIN identity.person_profile pp ON pp.person_id = p.id"
        " LEFT JOIN app.attempt a ON a.id = pa.attempt_id"
        " LEFT JOIN app.case_registry cr ON cr.id = a.case_id"
        " WHERE pa.award_id = %s ORDER BY pa.earned_at DESC, pa.person_id LIMIT 200",
        (award_id,)).fetchall()
    total = conn.execute("SELECT count(*) FROM app.person_award WHERE award_id = %s",
                         (award_id,)).fetchone()[0]
    return {"total": total, "holders": [
        {"person_id": r[0], "username": r[1], "name": r[2], "avatar": r[3], "role": r[4],
         "earned_at": r[5].isoformat(), "by_hand": r[6], "case_key": r[7]} for r in rows]}


def _may_grant(admin: Admin, person_id: int) -> None:
    """Giving and taking back by hand is for a full administrator, and never
    to themselves."""
    if admin.admin_role not in FULL_ROLES:
        raise HTTPException(403, say(
            admin.locale, "Elle vermek ve geri almak tam yetkili yöneticilere açık.",
            "Only full administrators can give or take back by hand."))
    if person_id == admin.person_id:
        raise HTTPException(403, say(
            admin.locale, "Kendine bir işaret ya da madalya veremezsin.",
            "You cannot give a mark or a medal to yourself."))


@router.post("/awards/{award_id}/grant")
def grant_award(award_id: int, body: GrantIn, admin: Admin = Depends(current_admin),
                conn: psycopg.Connection = Depends(db)) -> dict:
    """Give a mark or medal to a person by hand."""
    _may_grant(admin, body.person_id)
    award = _own_award(conn, admin, award_id)
    if not award["active"]:
        raise HTTPException(409, say(admin.locale, "Kapalı bir işaret ya da madalya verilemez.",
                                     "A mark or medal that is switched off cannot be given."))
    if not conn.execute("SELECT 1 FROM app.person WHERE id = %s AND status <> 'closed'",
                        (body.person_id,)).fetchone():
        raise HTTPException(404, say(admin.locale, "Böyle bir kişi yok.",
                                     "There is no such person."))
    added = conn.execute(
        "INSERT INTO app.person_award (person_id, award_id, granted_by)"
        " VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING earned_at",
        (body.person_id, award_id, admin_user_id(conn, admin))).fetchone()
    if added is None:
        raise HTTPException(409, say(admin.locale, "Bu kişi bunu zaten almış.",
                                     "This person already holds it."))
    log(conn, admin, "award_grant", "app.person_award", f"{award_id}:{body.person_id}", None,
        {"award": award["code"], "person_id": body.person_id,
         "note": _tidy(body.note)})
    conn.commit()
    return {"granted": True, "earned_at": added[0].isoformat()}


@router.delete("/awards/{award_id}/holders/{person_id}", status_code=204)
def revoke_award(award_id: int, person_id: int, admin: Admin = Depends(current_admin),
                 conn: psycopg.Connection = Depends(db)) -> None:
    """Take back what was given by hand. What a condition gave is taken back
    only with the case that met it, when that case is set aside."""
    _may_grant(admin, person_id)
    award = _award(conn, admin, award_id)
    row = conn.execute(
        "DELETE FROM app.person_award WHERE award_id = %s AND person_id = %s"
        "   AND granted_by IS NOT NULL RETURNING earned_at", (award_id, person_id)).fetchone()
    if row is None:
        held = conn.execute("SELECT 1 FROM app.person_award WHERE award_id = %s"
                            " AND person_id = %s", (award_id, person_id)).fetchone()
        if held:
            raise HTTPException(409, say(
                admin.locale,
                "Bu, koşulu karşılanarak kazanıldı ve elle geri alınamaz. Kazandıran vaka"
                " geçersiz sayılırsa kendiliğinden geri alınır.",
                "This was earned by meeting its condition and cannot be taken back by hand."
                " It is taken back on its own if the case that earned it is set aside."))
        raise HTTPException(404, say(admin.locale, "Bu kişi bunu almamış.",
                                     "This person does not hold it."))
    log(conn, admin, "award_revoke", "app.person_award", f"{award_id}:{person_id}",
        {"award": award["code"], "person_id": person_id,
         "earned_at": row[0].isoformat()}, None)
    conn.commit()


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@router.get("/reports/participation")
def participation(case_key: str | None = None,
                  admin: Admin = Depends(current_admin),
                  conn: psycopg.Connection = Depends(db)) -> dict:
    """Participation by unit, plus a count of units held back by the threshold.

    One row per unit: the share of its active people who finished the case
    named, or who finished any case when none is named. The held-back count
    shows an admin that a missing number is missing on purpose.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        if case_key is None:
            cur.execute(
                "SELECT u.id AS unit_id, u.name_tr, NULL::text AS case_key,"
                "       count(DISTINCT p.id) AS eligible,"
                "       count(DISTINCT a.person_id) AS finished"
                " FROM app.unit u"
                " JOIN app.person p ON p.unit_id = u.id AND p.status = 'active'"
                " LEFT JOIN app.attempt a ON a.person_id = p.id AND a.finished_at IS NOT NULL"
                " WHERE u.valid_to IS NULL"
                " GROUP BY u.id, u.name_tr"
                " HAVING count(DISTINCT p.id) >= app.competence_threshold()")
        else:
            cur.execute(
                "SELECT unit_id, name_tr, case_key, eligible, finished"
                " FROM app.v_unit_participation WHERE case_key = %s", (case_key,))
        rows = cur.fetchall()
        cur.execute(
            "SELECT count(*) AS n FROM ("
            "  SELECT u.id FROM app.unit u"
            "  JOIN app.person p ON p.unit_id = u.id AND p.status = 'active'"
            "  WHERE u.valid_to IS NULL GROUP BY u.id HAVING count(*) < 10) s"
        )
        held = cur.fetchone()["n"]
    # Worked out here rather than read from the view, so the share travels as
    # a number: a database numeric would reach the browser as text.
    for r in rows:
        r["pct"] = round(100.0 * r["finished"] / r["eligible"], 1) if r["eligible"] else 0.0
    rows.sort(key=lambda r: (-r["pct"], r["name_tr"]))
    # The rows keep their key; in the English interface the name is the English one.
    names = english_names(conn, admin.locale)
    for r in rows:
        r["name_tr"] = names.get(r["name_tr"], r["name_tr"])
    return {"units": rows, "below_threshold": held, "threshold": 10}


@router.get("/reports/dimensions")
def dimensions(admin: Admin = Depends(current_admin),
               conn: psycopg.Connection = Depends(db)) -> list[dict]:
    """Where the campus is weakest, which is what decides next week's case."""
    rows = conn.execute(
        "SELECT ts.dimension::text, round(avg(ts.theta)::numeric, 2),"
        "       count(*) FILTER (WHERE ts.attempts > 0)"
        " FROM app.twin_state ts"
        " JOIN app.person p ON p.id = ts.person_id AND p.status = 'active'"
        " GROUP BY ts.dimension ORDER BY avg(ts.theta)"
    ).fetchall()
    return [{"dimension": r[0], "theta_mean": float(r[1]), "people": r[2]} for r in rows]
