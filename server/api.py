"""HTTP layer for the SDU AI Literacy Platform.

Shaped around one constraint: a person on a phone, between classes, should be
able to open the app and finish a step without waiting on more than one round
trip. Every endpoint returns everything the next screen needs, and submitting a
step returns the following step in the same response.

Nothing here decides a score. Grading and twin updates live in service.py, which
holds the transaction; this module authenticates, resolves locale and projects
the client view.
"""

from __future__ import annotations

import contextlib
import hashlib
import hmac
import json
import logging
import math
import os
import secrets
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import psycopg
from psycopg.rows import dict_row
from fastapi import (BackgroundTasks, Cookie, Depends, FastAPI, Header, HTTPException,
                     Request, Response)
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, EmailStr, Field

import announcements
import awards
import calibration as calib
import campus
import case_images
import case_loader as cl
import demo
import integrity
import limits
import mailer
import profile_check
import profiles
import public_campus
import storage
import scoring
import service
import success_map
import unit_levels
import suspensions
import tips
import validate_case
import weather

CASE_ROOT = Path(os.environ.get("CASE_ROOT", "cases"))
I18N_ROOT = Path(os.environ.get("I18N_ROOT", "i18n"))
SESSION_SECRET = os.environ["SESSION_SECRET"].encode()
DATABASE_URL = os.environ["DATABASE_URL"]

# A session lasts a week. Signing out ends every session of the person, on
# every device, so a copied cookie stops working with it.
SESSION_TTL = timedelta(days=7)

# Days on the campus counts are the campus's own days.
LOCAL_TZ = "Europe/Istanbul"
CODE_TTL = timedelta(minutes=15)
CODE_MAX_ATTEMPTS = 5
UNIT_CHANGE_INTERVAL = timedelta(days=120)

# A username someone else holds is refused one try at a time, so the refusals
# are counted: plenty for finding a free name, too few for listing who has an
# account.
USERNAME_REFUSALS_PER_HOUR = 20

# The longest text a pattern step takes.
PATTERN_TEXT_MAX = 2000

# Codes are e-mails, and the relay sends only so many a day. Requests are
# counted per network address, and the day's mail is budgeted so that codes for
# addresses without an account never use up more than half of it: someone
# asking for codes on behalf of made-up addresses cannot keep people who
# already have an account from signing in. The count per address is a panel
# setting; this is its value until the panel sets one.
CODE_REQUESTS_PER_IP_DEFAULT = 5
MAIL_DAILY_LIMIT = int(os.environ.get("YAZEM_MAIL_DAILY_LIMIT", "450"))

log = logging.getLogger("yazem")

# The board's totals are worked out for the whole campus at once and reused for
# this many seconds.
BOARD_TOTALS_TTL = float(os.environ.get("BOARD_TOTALS_TTL", "60"))

# A Secure cookie is never sent over plain http, so local development against
# http://localhost needs SESSION_COOKIE_INSECURE=1 to keep a session. The flag
# stays on everywhere else.
COOKIE_SECURE = os.environ.get("SESSION_COOKIE_INSECURE", "0") != "1"

MESSAGES = {
    loc: json.loads((I18N_ROOT / f"{loc}.json").read_text(encoding="utf-8"))
    for loc in cl.SUPPORTED_LOCALES
}

# The interactive documentation and the schema would list every endpoint,
# the administrative ones included, to anyone who asked.
app = FastAPI(title="SDU AI Literacy Platform", docs_url=None, redoc_url=None,
              openapi_url=None)
app.add_middleware(GZipMiddleware, minimum_size=512)


# ---------------------------------------------------------------------------
# Infrastructure
# ---------------------------------------------------------------------------

def db() -> psycopg.Connection:
    """The platform's database, or the demo's for a request made under /demo/."""
    if demo.active():
        if not demo.enabled():
            raise HTTPException(404, "demo_off")
        target = demo.dsn()
    else:
        target = DATABASE_URL
    with psycopg.connect(target) as conn:
        yield conn


def current_dsn() -> str:
    """The address of the database this request works on, for work that goes
    on after the answer has been sent."""
    return demo.dsn() if demo.active() else DATABASE_URL


def email_hash(email: str) -> bytes:
    """Keyed hash, so a stolen table cannot be reversed with a wordlist.

    Addresses at a known university follow a predictable format, which makes
    them easy to enumerate. The key comes from the master key, which is never
    rotated, so the same address always finds the same account.
    """
    return hmac.new(mailer.email_hash_key(), email.strip().lower().encode(),
                    hashlib.sha256).digest()


def resolve_locale(accept_language: str | None, stored: str | None) -> str:
    """Stored preference wins; otherwise fall back to the browser, then Turkish."""
    if stored in cl.SUPPORTED_LOCALES:
        return stored
    for part in (accept_language or "").split(","):
        tag = part.split(";")[0].strip().lower()[:2]
        if tag in cl.SUPPORTED_LOCALES:
            return tag
    return cl.DEFAULT_LOCALE


def say(locale: str, tr: str, en: str) -> str:
    """One sentence, in the language on the person's screen."""
    return en if locale == "en" else tr


def case_locales_of(stored: list[str] | None, locale: str) -> list[str]:
    """The languages a person is offered cases in.

    Until they say, a Turkish interface offers Turkish cases and an English one
    offers both, since the English cases are few and a case in Turkish is
    better than none.
    """
    if stored:
        return [loc for loc in cl.SUPPORTED_LOCALES if loc in stored]
    return ["tr"] if locale == "tr" else list(cl.SUPPORTED_LOCALES)


def english_names(conn: psycopg.Connection, locale: str, table: str = "unit") -> dict[str, str]:
    """For the English interface: the Turkish names of units (or of buildings,
    with table="location") and the English names to show in their place. A
    name with no English form is shown as it is."""
    if locale != "en":
        return {}
    return dict(conn.execute(
        f"SELECT name_tr, name_en FROM app.{table} WHERE name_en IS NOT NULL").fetchall())


def renamed_choices(choices: list, names: dict[str, str]) -> list:
    """app.unit_choices with each name in the language on screen."""
    if not names:
        return choices
    return [{**f, "name": names.get(f["name"], f["name"]),
             "children": [{**d, "name": names.get(d["name"], d["name"])}
                          for d in f.get("children") or []]}
            for f in choices]


def case_language(available: list[str], offered: list[str], locale: str) -> str:
    """The language to open a case in: one the person is offered, the
    interface's own first, and otherwise whichever the case has."""
    for loc in [*sorted(offered, key=lambda loc: loc != locale), *available]:
        if loc in available:
            return loc
    return cl.DEFAULT_LOCALE


EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
MILLISECOND = timedelta(milliseconds=1)


def _session_secret(in_demo: bool) -> bytes:
    return demo.session_key(SESSION_SECRET) if in_demo else SESSION_SECRET


def sign_session(person_id: int, issued: datetime, in_demo: bool = False) -> str:
    # The time is kept to the millisecond, so signing out also ends a session
    # opened a moment before.
    raw = f"{person_id}.{(issued - EPOCH) // MILLISECOND}"
    mac = hmac.new(_session_secret(in_demo), raw.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{raw}.{mac}"


def read_session(token: str | None, in_demo: bool = False) -> tuple[int, datetime]:
    """The person a session cookie names, and when its code was verified."""
    if not token:
        raise HTTPException(401, "no session")
    try:
        person_id, issued, mac = token.rsplit(".", 2)
        expected = hmac.new(
            _session_secret(in_demo), f"{person_id}.{issued}".encode(), hashlib.sha256
        ).hexdigest()[:32]
        if not hmac.compare_digest(mac, expected):
            raise ValueError("bad signature")
        signed_in = EPOCH + int(issued) * MILLISECOND
        if datetime.now(timezone.utc) - signed_in > (demo.TTL if in_demo else SESSION_TTL):
            raise ValueError("expired")
        return int(person_id), signed_in
    except (ValueError, AttributeError, OverflowError):
        raise HTTPException(401, "invalid session")


def set_session_cookie(response: Response, person_id: int, in_demo: bool = False) -> None:
    response.set_cookie(
        demo.COOKIE if in_demo else "session",
        sign_session(person_id, datetime.now(timezone.utc), in_demo),
        max_age=int((demo.TTL if in_demo else SESSION_TTL).total_seconds()),
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        path="/",
    )


class Principal(BaseModel):
    person_id: int
    pseudonym: str
    role: str
    # The language on the person's screen: what the request says, otherwise
    # what the account holds.
    locale: str
    # What the account holds, and whether the person picked it.
    account_locale: str = "tr"
    locale_chosen: bool = False
    # What the person said about the language of cases; None when they have
    # not, and case_locales_of decides.
    case_locales: list[str] | None = None
    unit_id: int | None
    # When the code behind this session was verified: the sign-in a solving
    # session belongs to.
    signed_in: datetime


PERSON_SQL = (
    "SELECT id, pseudonym::text, role::text, unit_id, locale, status::text,"
    "       sessions_from, locale_chosen, case_locales::text[]"
    " FROM app.person WHERE id = %s")


def current_user(
    request: Request,
    accept_language: str | None = Header(default=None),
    # The interface sends the language it is showing, so whatever the server
    # words itself arrives in that language, even in the moment between a
    # switch and the account hearing of it.
    x_yazem_lang: str | None = Header(default=None),
    conn: psycopg.Connection = Depends(db),
) -> Principal:
    # Each side reads only its own cookie: a demo cookie means nothing to the
    # platform, and a platform session means nothing to the demo.
    in_demo = demo.active()
    person_id, signed_in = read_session(
        request.cookies.get(demo.COOKIE if in_demo else "session"), in_demo)
    row = conn.execute(PERSON_SQL, (person_id,)).fetchone()
    if row is None:
        raise HTTPException(401, "account is not active")
    # A suspension ends every session opened before it. Whoever holds such a
    # cookie signs in again, and only the code tells them why they cannot go on.
    if row[6] is not None and signed_in < row[6]:
        raise HTTPException(401, "session ended")
    if row[5] == "suspended":
        suspension = suspensions.in_force(conn, person_id)
        conn.commit()
        if suspension is not None:
            raise HTTPException(403, suspensions.notice(suspension))
        row = conn.execute(PERSON_SQL, (person_id,)).fetchone()
    if row[5] != "active":
        raise HTTPException(401, "account is not active")
    shown = x_yazem_lang if x_yazem_lang in cl.SUPPORTED_LOCALES else None
    return Principal(
        person_id=row[0], pseudonym=row[1], role=row[2], unit_id=row[3],
        locale=shown or resolve_locale(accept_language, row[4]),
        account_locale=row[4], locale_chosen=row[7], case_locales=row[8], signed_in=signed_in,
    )


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

class CodeRequest(BaseModel):
    email: EmailStr
    # The language of the sign-in page, which the mail is written in.
    locale: Literal["tr", "en"] | None = None


class CodeVerify(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    # The language on screen, and whether the person picked it themselves on
    # the sign-in page rather than it being guessed from the browser.
    locale: Literal["tr", "en"] | None = None
    locale_chosen: bool = False
    # The code only opens the session. The profile follows through /me/profile,
    # where it is checked and goes to the approval queue, and a fifteen-minute
    # code does not run out while somebody types their surname.


@app.post("/auth/request-code", status_code=202)
def request_code(body: CodeRequest, request: Request, background: BackgroundTasks,
                 conn: psycopg.Connection = Depends(db)) -> dict:
    """Issue a one-time code to an institutional address.

    The response is identical whether or not the domain is accepted and whether
    or not an account exists, so the endpoint never confirms who works here.
    The mail goes out after the response, so the time taken does not tell
    either.
    """
    if demo.active():
        raise HTTPException(403, "demo")
    client = request.client.host if request.client else "?"
    per_ip = int(_setting(conn, "code_requests_per_ip", CODE_REQUESTS_PER_IP_DEFAULT))
    if _code_requests(client, add=True) > per_ip:
        raise HTTPException(429, "too_many_codes")
    mailed, strangers = _mailed_today(conn)
    if mailed >= MAIL_DAILY_LIMIT:
        raise HTTPException(429, "too_many_codes")

    domain = body.email.split("@")[-1].lower()
    rule = conn.execute(
        "SELECT assigns_role::text FROM app.email_domain_rule"
        " WHERE domain = %s AND is_active",
        (domain,),
    ).fetchone()
    if rule is None or not _within_rate_limit(conn, body.email):
        return {"status": "accepted"}

    digest = email_hash(body.email)
    known = conn.execute("SELECT 1 FROM identity.person_email WHERE email_hash = %s",
                         (digest,)).fetchone() is not None
    if not known and strangers >= MAIL_DAILY_LIMIT // 2:
        # Answered like any other request that sends nothing, so that the
        # answer does not tell which addresses have an account.
        log.warning("code mail held back: the day's share for new addresses is used")
        return {"status": "accepted"}

    code = f"{secrets.randbelow(10**6):06d}"
    row_id = conn.execute(
        "INSERT INTO identity.verification_code"
        " (email_hash, code_hash, purpose, expires_at) VALUES (%s, %s, %s, %s)"
        " RETURNING id",
        (digest, _hash_code(code), "login", datetime.now(timezone.utc) + CODE_TTL),
    ).fetchone()[0]
    conn.commit()
    background.add_task(_deliver_code, body.email, code, row_id,
                        body.locale or cl.DEFAULT_LOCALE)
    return {"status": "accepted"}


# What an administrator reading the log should look at next.
MAIL_HINTS = {
    "SSLEOFError": "the relay closed the TLS handshake, see YAZEM_SMTP_TLS_LEGACY",
    "SSLCertVerificationError": "the relay's certificate is not trusted, see YAZEM_SMTP_TLS_PIN",
    "SMTPAuthenticationError": "the relay refused the user name or password",
}


def _deliver_code(email: str, code: str, row_id: int, locale: str = "tr") -> None:
    """Send a code after the response has gone. A code that could not be sent
    is removed, so no row says it was."""
    try:
        _send_code(email, code, locale)
    except Exception as exc:                 # noqa: BLE001 - any relay failure
        # Only the kind of failure is logged: a relay's own message can carry
        # the address. A changed certificate says which one it now is.
        name = type(exc).__name__
        note = str(exc) if isinstance(exc, mailer.PinMismatch) else MAIL_HINTS.get(name)
        log.warning("code mail not sent: %s%s", name, f" ({note})" if note else "")
        try:
            with psycopg.connect(DATABASE_URL) as conn:
                conn.execute("DELETE FROM identity.verification_code WHERE id = %s",
                             (row_id,))
        except psycopg.Error as db_exc:
            log.warning("unsent code not removed: %s", type(db_exc).__name__)


def _mailed_today(conn: psycopg.Connection) -> tuple[int, int]:
    """Codes mailed over the last day: all of them, and those that went to an
    address without an account."""
    return conn.execute(
        "SELECT count(*), count(*) FILTER (WHERE NOT EXISTS ("
        "    SELECT 1 FROM identity.person_email e WHERE e.email_hash = vc.email_hash))"
        " FROM identity.verification_code vc"
        " WHERE vc.created_at > now() - interval '1 day'").fetchone()


@app.post("/auth/verify")
def verify_code(body: CodeVerify, response: Response,
                accept_language: str | None = Header(default=None),
                conn: psycopg.Connection = Depends(db)) -> dict:
    """Consume a code and open a session, creating the account on first use."""
    if demo.active():
        raise HTTPException(403, "demo")
    digest = email_hash(body.email)
    domain = body.email.split("@")[-1].lower()

    row = conn.execute(
        "SELECT id, attempts FROM identity.verification_code"
        " WHERE email_hash = %s AND consumed_at IS NULL AND expires_at > now()"
        "   AND code_hash = %s"
        " ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        (digest, _hash_code(body.code)),
    ).fetchone()

    if row is None or row[1] >= CODE_MAX_ATTEMPTS:
        conn.execute(
            "UPDATE identity.verification_code SET attempts = attempts + 1"
            " WHERE email_hash = %s AND consumed_at IS NULL",
            (digest,),
        )
        conn.commit()
        raise HTTPException(401, "code_invalid")

    conn.execute(
        "UPDATE identity.verification_code SET consumed_at = now() WHERE id = %s",
        (row[0],),
    )

    # A domain closed after the code was sent lets nobody in with it.
    rule = conn.execute(
        "SELECT assigns_role::text FROM app.email_domain_rule"
        " WHERE domain = %s AND is_active", (domain,)).fetchone()
    if rule is None:
        conn.commit()
        raise HTTPException(401, "code_invalid")

    person = conn.execute(
        "SELECT p.id FROM app.person p"
        " JOIN identity.person_email e ON e.person_id = p.id"
        " WHERE e.email_hash = %s",
        (digest,),
    ).fetchone()

    if person is None:
        role = rule[0]
        person_id = conn.execute(
            "INSERT INTO app.person (role, verified_at, locale, locale_chosen)"
            " VALUES (%s, now(), %s, %s) RETURNING id",
            (role, body.locale or resolve_locale(accept_language, None),
             bool(body.locale and body.locale_chosen)),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO identity.person_email"
            " (person_id, email_hash, email_enc, domain) VALUES (%s, %s, %s, %s)",
            (person_id, digest, _encrypt_email(body.email), domain),
        )
    else:
        person_id = person[0]
        # Told only now, after the code has proved the address is theirs. The
        # check holds the person's row until the session is issued, so no
        # suspension can start in between.
        suspension = suspensions.in_force(conn, person_id)
        if suspension is not None:
            conn.commit()
            raise HTTPException(403, suspensions.notice(suspension))
        conn.execute(
            "UPDATE app.person SET reverified_at = now(), last_seen_at = now(),"
            " status = 'active' WHERE id = %s",
            (person_id,),
        )
        # A language picked on the sign-in page is the person's choice; one
        # guessed from the browser leaves the account as it was.
        if body.locale and body.locale_chosen:
            conn.execute("UPDATE app.person SET locale = %s, locale_chosen = true"
                         " WHERE id = %s", (body.locale, person_id))

    conn.commit()
    set_session_cookie(response, person_id)
    return {"person_id": person_id}


@app.post("/auth/sign-out")
def sign_out(request: Request, response: Response,
             session: str | None = Cookie(default=None)) -> dict:
    if demo.active():
        # The four made-up people are shared by every visitor, so leaving the
        # demo ends this browser's visit and nobody else's.
        response.delete_cookie(demo.COOKIE, path="/")
        return {"status": "ok"}
    try:
        person_id, _ = read_session(session)
    except HTTPException:
        person_id = None
    if person_id is not None:
        with psycopg.connect(DATABASE_URL) as conn:
            conn.execute(
                "UPDATE app.person SET sessions_from = greatest(sessions_from,"
                " date_trunc('milliseconds', now())) WHERE id = %s", (person_id,))
    response.delete_cookie("session", path="/")
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Profile and twin
# ---------------------------------------------------------------------------

@app.get("/me")
def get_me(user: Principal = Depends(current_user),
           conn: psycopg.Connection = Depends(db)) -> dict:
    """Everything the home screen needs, in one request.

    The twin, the points, the calibration figure and the unit all render
    together, so they arrive in a single round trip.
    """
    twin = conn.execute(
        "SELECT dimension::text, theta, attempts FROM app.twin_state WHERE person_id = %s",
        (user.person_id,),
    ).fetchall()
    totals = conn.execute(
        "SELECT coalesce(sum(sr.points_awarded), 0), count(DISTINCT a.id)"
        " FROM app.attempt a LEFT JOIN app.step_result sr ON sr.attempt_id = a.id"
        " WHERE a.person_id = %s AND a.finished_at IS NOT NULL",
        (user.person_id,),
    ).fetchone()
    calibration = conn.execute(
        "SELECT brier_mean, n FROM app.calibration WHERE person_id = %s",
        (user.person_id,),
    ).fetchone()
    unit = conn.execute(
        "SELECT name_tr, name_en FROM app.unit WHERE id = %s", (user.unit_id,)
    ).fetchone() if user.unit_id else None
    profile = conn.execute(
        "SELECT pp.username::text, pp.given_name, pp.family_name, p.avatar,"
        "       pp.approved_at IS NOT NULL, p.board_opt_in,"
        "       EXISTS (SELECT 1 FROM identity.profile_change c"
        "                WHERE c.person_id = p.id AND c.state = 'pending')"
        " FROM app.person p LEFT JOIN identity.person_profile pp ON pp.person_id = p.id"
        " WHERE p.id = %s",
        (user.person_id,),
    ).fetchone()

    labels = MESSAGES[user.locale]["dimension"]
    return {
        "role": user.role,
        "locale": user.locale,
        # The account's own language, which the interface opens in on any
        # device once the person has picked it.
        "account_locale": user.account_locale,
        "locale_chosen": user.locale_chosen,
        # The languages cases are offered in, and whether the person said so
        # or it follows the interface.
        "case_locales": case_locales_of(user.case_locales, user.locale),
        "case_locales_set": user.case_locales is not None,
        "limits": _limits(conn, user),
        "unit": {"id": user.unit_id,
                 "name": (unit[1] if user.locale == "en" and unit[1] else unit[0])
                         if unit else None},
        "profile": {"username": profile[0], "given_name": profile[1],
                    "family_name": profile[2], "avatar": profile[3],
                    "approved": profile[4], "board_opt_in": profile[5],
                    "waiting": profile[6]},
        "twin": [
            {"dimension": d, "label": labels[d], "theta": theta, "attempts": n}
            for d, theta, n in twin
        ],
        # The stored total can go below zero after overconfident answers; only
        # the displayed figure is floored.
        "points": max(0.0, float(totals[0])),
        "cases_completed": totals[1],
        "calibration": {
            "brier_mean": calibration[0] if calibration else None,
            "n": calibration[1] if calibration else 0,
        },
    }


@app.get("/me/limits")
def my_limits(user: Principal = Depends(current_user),
              conn: psycopg.Connection = Depends(db)) -> dict:
    """Whether a new case may begin now, and how much of the session and week is left."""
    return _limits(conn, user)


@app.get("/me/twin/history")
def twin_history(user: Principal = Depends(current_user),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    """Every graded step of this person, oldest first.

    Enough to redraw the twin at any moment in its history, to measure how
    certain each area is, and to compare stated confidence with outcomes.
    """
    rows = conn.execute(
        "SELECT sr.dimension::text, sr.answered_at, sr.theta_after, sr.outcome_x,"
        "       sr.confidence_c, sr.p_predicted, cr.case_key, cs.step_key, cr.title_tr,"
        "       a.locale::text"
        " FROM app.step_result sr JOIN app.attempt a ON a.id = sr.attempt_id"
        " JOIN app.case_step cs ON cs.id = sr.case_step_id"
        " JOIN app.case_registry cr ON cr.id = a.case_id"
        " WHERE a.person_id = %s ORDER BY sr.answered_at, sr.id",
        (user.person_id,),
    ).fetchall()
    # Each case is named in the language it was solved in.
    titles = {}
    for key, title, locale in {(r[6], r[8], r[9]) for r in rows}:
        titles[key] = title
        if locale != cl.DEFAULT_LOCALE:
            try:
                titles[key] = cl.load_case(CASE_ROOT, key, locale, conn,
                                           exact=True).body["title"]
            except (cl.CaseNotFound, KeyError):
                pass
    # The twin's prediction is of the graded outcome; beside it, the chance of
    # a success the campus record gives it, the event a confidence is about.
    cells, kinds = success_map.current(conn, CASE_ROOT)
    missing = {r[6] for r in rows if (r[6], r[7]) not in kinds}
    if missing:
        kinds = {**kinds, **success_map.step_kinds(conn, CASE_ROOT, missing)}
    return {"steps": [
        {"dimension": r[0], "at": r[1].isoformat(), "theta": r[2], "outcome": r[3],
         "confidence": r[4], "predicted": r[5], "case": r[6], "step": r[7],
         "title": titles[r[6]],
         "success_chance": (None if r[5] is None else
                            round(success_map.chance(cells, kinds.get((r[6], r[7])), r[5]), 4))}
        for r in rows
    ]}


class LocalePreference(BaseModel):
    locale: str
    # true: the person picked it. false: the interface guessed it from the
    # browser, and a language the person picked earlier stays.
    chosen: bool = True


@app.put("/me/locale")
def set_locale(body: LocalePreference, user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    if body.locale not in cl.SUPPORTED_LOCALES:
        raise HTTPException(400, "unsupported locale")
    row = conn.execute(
        "UPDATE app.person SET locale = CASE WHEN %(chosen)s OR NOT locale_chosen"
        "                                   THEN %(locale)s::app.locale ELSE locale END,"
        "                      locale_chosen = locale_chosen OR %(chosen)s"
        " WHERE id = %(id)s RETURNING locale::text, locale_chosen",
        {"locale": body.locale, "chosen": body.chosen, "id": user.person_id}).fetchone()
    conn.commit()
    return {"locale": row[0], "chosen": row[1]}


class CaseLocales(BaseModel):
    # None: follow the interface language again.
    locales: list[Literal["tr", "en"]] | None = Field(default=None, max_length=2)


@app.put("/me/case-locales")
def set_case_locales(body: CaseLocales, user: Principal = Depends(current_user),
                     conn: psycopg.Connection = Depends(db)) -> dict:
    """The languages to be offered cases in. A case already started stays in
    the language it was started in."""
    chosen = None
    if body.locales is not None:
        chosen = [loc for loc in cl.SUPPORTED_LOCALES if loc in body.locales]
        if not chosen:
            raise HTTPException(400, say(user.locale, "En az bir dil seç.",
                                         "Choose at least one language."))
    conn.execute("UPDATE app.person SET case_locales = %s::app.locale[] WHERE id = %s",
                 (chosen, user.person_id))
    conn.commit()
    return {"case_locales": case_locales_of(chosen, user.locale),
            "case_locales_set": chosen is not None}


class Declaration(BaseModel):
    # Lengths and shapes are checked by profile_check, which answers in words
    # the form can show; these limits only keep the request small.
    given_name: str = Field(max_length=200)
    family_name: str = Field(max_length=200)
    username: str = Field(max_length=100)
    unit_id: int
    # A code from app.academic_title, and only meaningful for staff. A title
    # sent by a student is ignored.
    title: str | None = Field(default=None, max_length=40)
    # Checked against its own limit once spaces have been tidied.
    bio: str | None = Field(default=None, max_length=400)
    # Staff say whether they are academic or administrative staff. Students
    # are students by their address.
    staff_role: Literal["academic", "admin_staff"] | None = None


@app.get("/me/profile")
def read_profile(user: Principal = Depends(current_user),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    """What this person has told us, whether it is complete, and what is
    waiting for approval.

    The sign-in screen reads this on a return visit so the fields come back
    filled in.
    """
    row = conn.execute("SELECT app.person_profile_view(%s)",
                       (user.person_id,)).fetchone()[0]
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT code, label_tr, label_en FROM app.academic_title"
            " WHERE is_active ORDER BY ordinal")
        titles = cur.fetchall()
        cur.execute(
            "SELECT id, name_tr AS name FROM app.unit"
            " WHERE is_selectable AND valid_to IS NULL ORDER BY path")
        units = cur.fetchall()
    names = english_names(conn, user.locale)
    for u in units:
        u["name"] = names.get(u["name"], u["name"])
    choices = renamed_choices(conn.execute("SELECT app.unit_choices()").fetchone()[0], names)
    public = conn.execute("SELECT board_public FROM app.person WHERE id = %s",
                          (user.person_id,)).fetchone()[0]
    # Students are not asked for a title, so they are not sent the list either.
    return {**row, "titles": [] if row["role"] == "student" else titles,
            "units": units, "unit_choices": choices, "bio_max": profile_check.BIO_MAX,
            # Whether the person agreed to be seen on the ranking from outside
            # the platform, and whether visitors can see the ranking now.
            "board_public": public, "board_public_open": _visitors_see("board", conn)}


@app.put("/me/profile")
def declare_profile(body: Declaration, user: Principal = Depends(current_user),
                    conn: psycopg.Connection = Depends(db)) -> dict:
    """Record or correct what a person declares about themselves.

    Used when an address is verified for the first time and again for any
    later change, so the rules live in one place. A profile that has never been
    approved is used at once and goes to the approval queue to become public.
    A change to an approved profile waits in the queue while the approved
    profile stays in place.
    """
    given = profile_check.clean(body.given_name)
    family = profile_check.clean(body.family_name)
    username = body.username.strip().lower()
    bio = profile_check.clean(body.bio) or None

    blocks, warnings = profile_check.check_profile(given, family, username, bio)
    # A field sent back as it already is was accepted before, perhaps by an
    # administrator who read it. It does not stop a change to another field.
    now = profiles.current(conn, user.person_id)["values"]
    sent = {"given_name": given, "family_name": family, "username": username, "bio": bio}
    blocks = [b for b in blocks
              if not profiles.same_value(b.field, now.get(b.field), sent.get(b.field))]
    if blocks:
        first = blocks[0]
        raise HTTPException(400, {
            "code": "profile_blocked", "field": first.field, "reason": first.code,
            "message": profile_check.MESSAGES_TR.get(first.code, "Bu alan kabul edilmedi."),
            "problems": [b.as_dict() for b in blocks]})

    if profiles.sent_today(conn, user.person_id) >= profiles.SUBMISSIONS_PER_DAY:
        raise HTTPException(429, say(user.locale,
                                     "Bugün çok sayıda değişiklik gönderdin. Yarın yeniden dene.",
                                     "You have sent many changes today. Try again tomorrow."))

    if _username_refusals(user.person_id) >= USERNAME_REFUSALS_PER_HOUR:
        raise HTTPException(429, say(user.locale,
                                     "Kısa sürede çok sayıda alınmış kullanıcı adı denedin. "
                                     "Bir saat sonra yeniden dene.",
                                     "You have tried many usernames that are taken in a short"
                                     " time. Try again in an hour."))
    free = conn.execute("SELECT app.username_available(%s, %s)",
                        (user.person_id, username)).fetchone()[0]
    if not free:
        _username_refusals(user.person_id, add=True)
        raise HTTPException(409, say(user.locale, "Bu kullanıcı adı alınmış.",
                                     "This username is taken."))

    # Reports show a title as though the institution had granted it, so a title
    # on a student account is dropped.
    title = None if user.role == "student" else (body.title or None)
    if title is not None:
        known = conn.execute(
            "SELECT 1 FROM app.academic_title WHERE code = %s AND is_active",
            (title,)).fetchone()
        if known is None:
            raise HTTPException(400, "unknown title")

    unit_ok = conn.execute(
        "SELECT 1 FROM app.unit WHERE id = %s AND is_selectable AND valid_to IS NULL",
        (body.unit_id,)).fetchone()
    if unit_ok is None:
        raise HTTPException(400, {"code": "unit_invalid", "field": "unit_id",
                                  "message": say(user.locale, "Bu birim seçilemiyor.",
                                                 "This unit cannot be chosen.")})

    if user.role == "student":
        role = "student"
    elif title == "idari":
        role = "admin_staff"
    else:
        role = body.staff_role or (user.role if user.role in profiles.STAFF_ROLES
                                   else "academic")

    values = {"given_name": given, "family_name": family, "title": title,
              "username": username, "unit_id": body.unit_id, "role": role, "bio": bio}
    notes = [w.as_dict() for w in warnings] + _profile_notes(conn, user.person_id, values)
    outcome = profiles.submit(conn, user.person_id, values, notes)

    domain = conn.execute(
        "SELECT domain::text FROM identity.person_email WHERE person_id = %s",
        (user.person_id,),
    ).fetchone()
    if domain and conn.execute("SELECT 1 FROM app.email_domain_rule WHERE domain = %s",
                               (domain[0],)).fetchone() is None:
        _flag(conn, user.person_id, "unknown_domain", domain[0])
    conn.commit()
    view = conn.execute("SELECT app.person_profile_view(%s)",
                        (user.person_id,)).fetchone()[0]
    return {**view, "outcome": outcome}


class _HourlyCount:
    """Events per key over the last hour, kept in this process only."""

    def __init__(self, max_keys: int = 20_000):
        self._seen: dict = {}
        self._lock = threading.Lock()
        self._max_keys = max_keys

    def __call__(self, key, add: bool = False) -> int:
        now = time.monotonic()
        with self._lock:
            if add and key not in self._seen and len(self._seen) >= self._max_keys:
                self._prune(now)
            seen = self._seen.setdefault(key, deque())
            while seen and seen[0] < now - 3600:
                seen.popleft()
            if add:
                seen.append(now)
            if not seen:
                del self._seen[key]
                return 0
            return len(seen)

    def _prune(self, now: float) -> None:
        for key in [k for k, v in self._seen.items() if not v or v[-1] < now - 3600]:
            del self._seen[key]


_username_refusals = _HourlyCount()
_code_requests = _HourlyCount()


def _profile_notes(conn: psycopg.Connection, person_id: int, values: dict) -> list[dict]:
    """What the reviewer should know that the text alone does not show."""
    notes = []
    full = f"{values['given_name']} {values['family_name']}"
    if not _plausible_name(full):
        notes.append({"field": "given_name", "code": "implausible_name", "detail": full})
    twin = conn.execute(
        "SELECT 1 FROM identity.person_profile pp JOIN app.person p ON p.id = pp.person_id"
        " WHERE lower(pp.full_name) = lower(%s) AND p.unit_id = %s AND p.id <> %s",
        (full, values["unit_id"], person_id),
    ).fetchone()
    if twin is not None:
        notes.append({"field": "family_name", "code": "duplicate_name", "detail": full})
    now = profiles.current(conn, person_id)
    if profiles.role_change(now, values):
        # Academic or administrative staff decides which cases a person is
        # offered, so the reviewer is told plainly that it is changing.
        notes.append({"field": "role", "code": "role_change",
                      "detail": f"{now['values']['role']}>{values['role']}"})
    if (now["approved"] and now["values"]["unit_id"] != values["unit_id"]
            and now["unit_changed_at"] is not None
            and datetime.now(timezone.utc) - now["unit_changed_at"] < UNIT_CHANGE_INTERVAL):
        notes.append({"field": "unit_id", "code": "unit_recent",
                      "detail": now["unit_changed_at"].date().isoformat()})
    return notes


@app.delete("/me/profile/pending")
def withdraw_profile_change(user: Principal = Depends(current_user),
                            conn: psycopg.Connection = Depends(db)) -> dict:
    """Take back a change that is waiting for approval."""
    if not profiles.withdraw(conn, user.person_id):
        raise HTTPException(409, say(user.locale, "Geri çekilecek bir değişiklik yok.",
                                     "There is no change to withdraw."))
    conn.commit()
    return conn.execute("SELECT app.person_profile_view(%s)",
                        (user.person_id,)).fetchone()[0]


class AvatarChoice(BaseModel):
    avatar: str | None = Field(default=None, pattern=r"^av-[0-9]{2,3}$")


@app.put("/me/avatar")
def set_avatar(body: AvatarChoice, user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """The avatar comes from a fixed set of pictures, so it changes at once."""
    conn.execute("UPDATE app.person SET avatar = %s WHERE id = %s",
                 (body.avatar, user.person_id))
    conn.commit()
    return {"avatar": body.avatar}


class BoardChoice(BaseModel):
    opt_in: bool
    # Whether the person may also be seen on the ranking from outside the
    # platform, once an administrator opens it to visitors. Left out, it stays
    # as it was; leaving the ranking ends it either way.
    public: bool | None = None


@app.put("/me/board")
def set_board(body: BoardChoice, user: Principal = Depends(current_user),
              conn: psycopg.Connection = Depends(db)) -> dict:
    """Whether this person appears on the board. They appear once their profile
    has been approved as well."""
    was = conn.execute("SELECT board_public FROM app.person WHERE id = %s",
                       (user.person_id,)).fetchone()[0]
    public = body.opt_in and (was if body.public is None else body.public)
    conn.execute("UPDATE app.person SET board_opt_in = %s, board_public = %s WHERE id = %s",
                 (body.opt_in, public, user.person_id))
    conn.commit()
    if public != was:
        # Visitors see the change with the next ranking made for them.
        public_campus.forget("board")
    approved, excluded = conn.execute(
        "SELECT EXISTS (SELECT 1 FROM identity.person_profile"
        "               WHERE person_id = %s AND approved_at IS NOT NULL),"
        "       app.board_excluded(%s)",
        (user.person_id, user.person_id)).fetchone()
    return {"board_opt_in": body.opt_in, "public": public,
            "visible": body.opt_in and approved and not excluded}


BOARD_ROLES = {"all": None, "student": "student", "academic": "academic",
               "admin_staff": "admin_staff"}

# One set of totals for the platform and one for the demo.
_board_totals: dict[bool, dict] = {False: {"at": 0.0, "cells": None},
                                   True: {"at": 0.0, "cells": None}}
_board_totals_lock = threading.Lock()


def _board_cells(conn: psycopg.Connection) -> dict[str, dict]:
    """The board's totals per role, reused while they are fresh. Working them
    out again also ends the suspensions whose time is up, so a person whose
    suspension ran out is back on the list and in the totals."""
    held = _board_totals[demo.active()]
    with _board_totals_lock:
        at, cells = held["at"], held["cells"]
    if cells is not None and time.monotonic() - at < BOARD_TOTALS_TTL:
        return cells
    conn.execute("SELECT app.lift_expired_suspensions()")
    conn.commit()
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT role, people, participants, hidden, cases_finished, levels,"
                    "       areas, even_hand FROM app.board_cells()")
        cells = {r["role"]: r for r in cur.fetchall()}
    with _board_totals_lock:
        held.update(at=time.monotonic(), cells=cells)
    return cells


def _add_cells(cells: list[dict]) -> dict:
    total = {"people": 0, "participants": 0, "hidden": 0, "cases_finished": 0,
             "levels": {}, "areas": {}, "even_hand": 0}
    for c in cells:
        for k in ("people", "participants", "hidden", "cases_finished", "even_hand"):
            total[k] += c[k]
        for k in ("levels", "areas"):
            for key, n in c[k].items():
                total[k][key] = total[k].get(key, 0) + n
    return total


def _board_summary(cells: dict[str, dict], role: str | None, unit_id: int | None,
                   floor_n: int) -> dict:
    """The totals for a selection, or why they are withheld.

    A total over people who are on the list repeats what the list shows. Take
    the listed rows away from it, though, and the rest describes the people who
    chose not to appear, so a total is shown only when that rest is nobody or
    at least the reporting threshold. The role totals add up to the campus
    total, so they are shown only while every role passes, or the one that does
    not could be worked out from the others. A unit is too small a group for
    any of this, so a selection with a unit has no totals.
    """
    def safe(n: int) -> bool:
        return n == 0 or n >= floor_n

    withheld = {"enough": False, "threshold": floor_n}
    if unit_id is not None:
        return {**withheld, "reason": "unit"}
    total = _add_cells(list(cells.values()) if role is None else [cells[role]])
    if total["participants"] < floor_n:
        return {**withheld, "reason": "few"}
    if role is None:
        ok = safe(total["hidden"])
    else:
        ok = all(safe(c["participants"]) and safe(c["hidden"]) for c in cells.values())
    if not ok:
        return {**withheld, "reason": "small"}
    shown = {k: v for k, v in total.items() if k != "hidden"}
    return {**shown, "enough": True, "threshold": floor_n}


@app.get("/board")
def board(response: Response, role: str = "all", unit_id: int | None = None,
          limit: int = 100, user: Principal = Depends(current_user),
          conn: psycopg.Connection = Depends(db)) -> dict:
    """The public board and how the campus looks as a whole.

    The list holds only people who chose to appear and whose profile has been
    approved, by username, ranked on points. The totals count everyone active,
    listed or not, for the campus or for one role, and are withheld whenever
    they could single anyone out (see _board_summary).
    """
    if role not in BOARD_ROLES:
        raise HTTPException(400, "unknown role")
    who = BOARD_ROLES[role]
    cells = _board_cells(conn)
    rows = conn.execute(
        "SELECT person_id, username, avatar, role, faculty, department, bio, points, rank"
        " FROM app.board(%s, %s) ORDER BY rank, username",
        (who, unit_id),
    ).fetchall()
    limit = max(1, min(limit, 200))
    shown = rows[:limit]
    mine = next((r for r in rows if r[0] == user.person_id), None)
    if mine is not None and mine not in shown:
        shown = shown + [mine]
    badges = dict(conn.execute(
        "SELECT id, app.badge(id) FROM unnest(%s::bigint[]) AS id",
        ([r[0] for r in shown],),
    ).fetchall()) if shown else {}

    me_row = conn.execute(
        "SELECT p.board_opt_in, pp.approved_at IS NOT NULL,"
        "       EXISTS (SELECT 1 FROM identity.profile_change c"
        "                WHERE c.person_id = p.id AND c.state = 'pending'),"
        "       app.board_excluded(p.id), p.board_public"
        " FROM app.person p LEFT JOIN identity.person_profile pp ON pp.person_id = p.id"
        " WHERE p.id = %s",
        (user.person_id,),
    ).fetchone()

    floor_n = conn.execute("SELECT app.competence_threshold()").fetchone()[0]
    summary = _board_summary(cells, who, unit_id, floor_n)
    names = english_names(conn, user.locale)

    # The person's own row and switch change with what they just did, so the
    # answer is never served from a cache.
    response.headers["Cache-Control"] = "no-store"
    return {
        "role": role, "unit_id": unit_id, "total": len(rows),
        "people": [
            {"rank": r[8], "username": r[1], "avatar": r[2], "role": r[3],
             "faculty": names.get(r[4], r[4]), "department": names.get(r[5], r[5]),
             "bio": r[6], "points": float(r[7]),
             "level": badges[r[0]]["level"], "tiers": badges[r[0]]["tiers"],
             "marks": badges[r[0]]["marks"], "medals": badges[r[0]].get("medals", []),
             "me": r[0] == user.person_id}
            for r in shown
        ],
        # rank is within this selection, and None when the person is not in it.
        "me": {"opted_in": me_row[0], "approved": bool(me_row[1]), "waiting": me_row[2],
               "excluded": me_row[3],
               "visible": bool(me_row[0] and me_row[1] and not me_row[3]),
               "rank": mine[8] if mine else None,
               # Whether the person agreed to be seen from outside the platform too.
               "public": me_row[4]},
        # Whether visitors can see the ranking now, with those who agreed.
        "public_open": _visitors_see("board", conn),
        "summary": summary,
        "units": renamed_choices(conn.execute("SELECT app.unit_choices()").fetchone()[0], names),
    }


def _public_board(conn: psycopg.Connection, role: str, unit_id: int | None,
                  locale: str, limit: int = 100) -> dict:
    """The ranking as a visitor sees it.

    Only people who agreed to be seen from outside the platform are listed,
    ranked among themselves, with what the platform's list shows of them. The
    totals beside it are held back by the same rule as the platform's, over
    this shorter list. Nobody is "me" here.
    """
    who = BOARD_ROLES[role]
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT role, people, participants, hidden, cases_finished, levels,"
                    "       areas, even_hand FROM app.board_cells(true)")
        cells = {r["role"]: r for r in cur.fetchall()}
    rows = conn.execute(
        "SELECT b.person_id, b.username, b.avatar, b.role, b.faculty, b.department, b.bio,"
        "       b.points"
        " FROM app.board(%s, %s) b JOIN app.person p ON p.id = b.person_id"
        " WHERE p.board_public ORDER BY b.points DESC, b.username",
        (who, unit_id)).fetchall()
    # Equal points share a place, as on the platform's list.
    ranked, place, last = [], 0, None
    for i, r in enumerate(rows):
        if r[7] != last:
            place, last = i + 1, r[7]
        ranked.append((*r, place))
    shown = ranked[:max(1, min(limit, 200))]
    badges = dict(conn.execute(
        "SELECT id, app.badge(id) FROM unnest(%s::bigint[]) AS id",
        ([r[0] for r in shown],),
    ).fetchall()) if shown else {}
    floor_n = conn.execute("SELECT app.competence_threshold()").fetchone()[0]
    names = english_names(conn, locale)
    return {
        "role": role, "unit_id": unit_id, "total": len(rows),
        "people": [
            {"rank": r[8], "username": r[1], "avatar": r[2], "role": r[3],
             "faculty": names.get(r[4], r[4]), "department": names.get(r[5], r[5]),
             "bio": r[6], "points": float(r[7]),
             "level": badges[r[0]]["level"], "tiers": badges[r[0]]["tiers"],
             "marks": badges[r[0]]["marks"], "medals": badges[r[0]].get("medals", []),
             "me": False}
            for r in shown
        ],
        "me": None,
        "public_open": True,
        "summary": _board_summary(cells, who, unit_id, floor_n),
        "units": renamed_choices(conn.execute("SELECT app.unit_choices()").fetchone()[0], names),
    }


@app.get("/units")
def search_units(q: str = "", limit: int = 20,
                 conn: psycopg.Connection = Depends(db)) -> list[dict]:
    """Type-ahead over selectable units, each shown with its full path.

    One search field: on a phone it fits on one screen.
    """
    rows = conn.execute(
        "SELECT u.id, u.name_tr, coalesce(parent.name_tr, '') AS parent_name"
        " FROM app.unit u"
        " LEFT JOIN app.unit parent ON parent.id = u.parent_id"
        " WHERE u.is_selectable AND u.valid_to IS NULL"
        "   AND (%s = '' OR u.name_tr ILIKE '%%' || %s || '%%')"
        " ORDER BY u.name_tr LIMIT %s",
        (q, q, min(limit, 50)),
    ).fetchall()
    return [{"id": r[0], "name": r[1], "parent": r[2]} for r in rows]


# ---------------------------------------------------------------------------
# Cases
# ---------------------------------------------------------------------------

@app.get("/cases/open")
def open_cases(user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """Everything this person may open.

    next_case answers "what should I do first" and gives the recommendation.
    This answers "what else is there".

    Unfinished work comes first, since a case stopped halfway through is easy
    to lose track of.
    """
    conn.execute("SELECT app.refresh_case_status()")
    rows = conn.execute(
        "SELECT case_key, title_tr, type, status, close_at, attempted, finished"
        " FROM app.open_cases(%s)", (user.person_id,)
    ).fetchall()
    revealed = {r[0] for r in conn.execute(
        "SELECT cr.case_key FROM app.case_reveal r"
        " JOIN app.case_registry cr ON cr.id = r.case_id WHERE r.reason <> 'held'").fetchall()}
    started = {r[0]: (r[1], r[2]) for r in conn.execute(
        "SELECT cr.case_key, a.variant_key, a.locale::text FROM app.attempt a"
        " JOIN app.case_registry cr ON cr.id = a.case_id WHERE a.person_id = %s",
        (user.person_id,)).fetchall()}
    set_aside = {r[0]: {"at": r[1].isoformat(), "reason": r[2]} for r in conn.execute(
        "SELECT cr.case_key, v.voided_at, v.reason FROM app.attempt_void v"
        " JOIN app.attempt a ON a.id = v.attempt_id"
        " JOIN app.case_registry cr ON cr.id = a.case_id WHERE a.person_id = %s",
        (user.person_id,)).fetchall()}
    variants = {key: v for key, (v, _) in started.items()}
    languages = dict(conn.execute(
        "SELECT case_key, locales::text[] FROM app.case_registry").fetchall())
    offered = case_locales_of(user.case_locales, user.locale)

    out = []
    for key, title, kind, status, close_at, attempted, finished in rows:
        available = languages.get(key) or [cl.DEFAULT_LOCALE]
        if key in started:
            # A case already begun stays in its language, whatever the person
            # is offered now.
            locale = started[key][1]
        elif not set(available) & set(offered):
            continue
        else:
            locale = case_language(available, offered, user.locale)
        try:
            case = cl.load_case(CASE_ROOT, key, locale, conn)
        except cl.CaseNotFound:
            # Registered but with no body in any locale: a partial import. It
            # is left out because it cannot be opened.
            continue
        values = _values_for(case, user, variants.get(key))
        out.append({
            "key": key,
            "title": cl.substitute_all(case.body.get("title", title), values),
            # The opening text, so a client can show the case without having a
            # copy of it. Steps still arrive one at a time from the server.
            "context": cl.substitute_all(case.body.get("context"), values),
            "type": kind,
            "status": status,
            "minutes": case.body.get("estimated_minutes"),
            "steps": len(case.body.get("steps", [])),
            "dimensions": list(dict.fromkeys(
                st["dimension"] for st in case.body.get("steps", []))),
            "close_at": close_at.isoformat() if close_at else None,
            "attempted": attempted,
            "finished": finished,
            # The correct answers are open; a finisher can read them.
            "revealed": key in revealed,
            # The attempt was set aside by an administrator, when and why.
            "voided": set_aside.get(key),
            "locale": case.locale,
            "locales": available,
            # Where on the campus map the case is set, when it is set there.
            "place": validate_case.place_of(case.body.get("place")),
        })
    pictures = case_images.versions(conn, CASE_ROOT, [c["key"] for c in out])
    for c in out:
        c["image"] = pictures.get(c["key"])
    return {"cases": out}


@app.get("/cases/next")
def next_case(dimension: str | None = None,
              user: Principal = Depends(current_user),
              conn: psycopg.Connection = Depends(db)) -> dict:
    """The case to do next: in the given area, or in the area the twin knows least."""
    if dimension is not None and dimension not in service.DIMENSIONS:
        raise HTTPException(400, "unknown dimension")
    offered = case_locales_of(user.case_locales, user.locale)
    chosen = service.next_case(conn, user.person_id, user.role, dimension,
                               locales=offered, prefer=user.locale)
    if chosen is None:
        return {"case": None, "message": MESSAGES[user.locale]["case"]["none_available"]}

    case = cl.load_case(CASE_ROOT, chosen["case_key"],
                        case_language(chosen["locales"], offered, user.locale), conn)
    values = _values_for(case, user)
    return {
        "case": {
            "key": case.key,
            "title": cl.substitute_all(case.body["title"], values),
            "context": cl.substitute_all(case.body["context"], values),
            "estimated_minutes": case.body["estimated_minutes"],
            "step_count": len(case.body["steps"]),
            "locale": case.locale,
            "locales": chosen["locales"],
            "translated": case.locale == user.locale,
            "dimension": chosen["dimension"],
            # Why the twin chose it: requested, review, focus or least_known.
            "reason": chosen.get("reason"),
            "image": case_images.versions(conn, CASE_ROOT, [case.key]).get(case.key),
        }
    }


@app.get("/cases/{case_key}/solution")
def solution(case_key: str, user: Principal = Depends(current_user),
             conn: psycopg.Connection = Depends(db)) -> dict:
    """The correct answers of a finished case, or how far the case is from opening.

    Each step comes as the person saw it (their variant) with its answer and the
    person's own result, so the screen can show the passage with its targets
    marked, the references with their verdicts, and the best path through a
    decision.
    """
    row = conn.execute(
        "SELECT a.variant_key, cr.id, a.id, a.locale::text FROM app.attempt a"
        " JOIN app.case_registry cr ON cr.id = a.case_id"
        " WHERE cr.case_key = %s AND a.person_id = %s AND a.finished_at IS NOT NULL",
        (case_key, user.person_id),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "not_finished")
    variant_key, case_id, attempt_id, attempt_locale = row
    if not _reveal_open(conn, case_id, check=True):
        held = conn.execute(
            "SELECT EXISTS (SELECT 1 FROM app.case_reveal"
            " WHERE case_id = %s AND reason = 'held')", (case_id,)).fetchone()[0]
        return {"key": case_key, "open": False, "held": held,
                "progress": None if held else _reveal_share(conn, case_id)}
    case = cl.load_case(CASE_ROOT, case_key, attempt_locale, conn, exact=True)
    outcomes = dict(conn.execute(
        "SELECT cs.step_key, sr.outcome_x FROM app.step_result sr"
        " JOIN app.case_step cs ON cs.id = sr.case_step_id WHERE sr.attempt_id = %s",
        (attempt_id,)).fetchall())
    # The answers are for someone who answered every step.
    if any(s["id"] not in outcomes for s in case.body["steps"]):
        raise HTTPException(404, "not_finished")
    values = case.variant_values(variant_key)
    return {
        "key": case_key,
        "open": True,
        "title": cl.substitute_all(case.body["title"], values),
        "debrief": cl.substitute_all(case.body.get("debrief"), values),
        "steps": [
            {"step": cl.client_step(case, s["id"], variant_key, user.pseudonym),
             "reveal": cl.reveal(case, s["id"], variant_key),
             "outcome": outcomes.get(s["id"])}
            for s in case.body["steps"]
        ],
    }


@app.get("/cases/{case_key}/intro")
def case_intro(case_key: str, locale: Literal["tr", "en"],
               user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """The opening of a case in one of its languages, for choosing which
    version to solve.

    The versions are one case: the same variant, steps and areas, so the
    choice changes only the language it is read in, and solving either one
    solves the case.
    """
    row = conn.execute(
        "SELECT cr.locales::text[], a.variant_key FROM app.case_registry cr"
        " LEFT JOIN app.attempt a ON a.case_id = cr.id AND a.person_id = %s"
        " WHERE cr.case_key = %s", (user.person_id, case_key)).fetchone()
    if row is None or (row[1] is None and conn.execute(
            "SELECT 1 FROM app.open_cases(%s) WHERE case_key = %s",
            (user.person_id, case_key)).fetchone() is None):
        raise HTTPException(404, "no such case")
    available = row[0] or [cl.DEFAULT_LOCALE]
    if locale not in available:
        raise HTTPException(404, "no such version")
    try:
        case = cl.load_case(CASE_ROOT, case_key, locale, conn, exact=True)
    except cl.CaseNotFound:
        raise HTTPException(404, "no such version")
    values = _values_for(case, user, row[1])
    return {
        "key": case_key,
        "locale": case.locale,
        "locales": available,
        "title": cl.substitute_all(case.body.get("title"), values),
        "context": cl.substitute_all(case.body.get("context"), values),
        "minutes": case.body.get("estimated_minutes"),
        "steps": len(case.body.get("steps", [])),
    }


class StartIn(BaseModel):
    # The language version the person chose. It decides only a new attempt:
    # one already begun stays in the language it began in.
    locale: Literal["tr", "en"] | None = None


@app.post("/cases/{case_key}/start")
def start_case(case_key: str, body: StartIn | None = None,
               user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """Open the attempt and return the step this person is actually on.

    This is the first unanswered step: somebody who answered two steps, went to
    look at the map and came back carries on at the third.
    """
    # One person's starts are taken one at a time, so two quick requests cannot
    # both slip under the session limit.
    conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                 (f"start:{user.person_id}",))
    resuming = conn.execute(
        "SELECT a.locale::text, v.voided_at, v.reason FROM app.attempt a"
        " JOIN app.case_registry cr ON cr.id = a.case_id"
        " LEFT JOIN app.attempt_void v ON v.attempt_id = a.id"
        " WHERE cr.case_key = %s AND a.person_id = %s", (case_key, user.person_id)).fetchone()
    if resuming is not None and resuming[1] is not None:
        # Set aside by an administrator: the case is not solved again, and the
        # person is told why.
        raise HTTPException(403, {"code": "voided", "at": resuming[1].isoformat(),
                                  "reason": resuming[2]})
    # An attempt keeps the language it began in. A new one opens in the
    # version the person chose when the case has it; otherwise in a language
    # they are offered, and a case they reached some other way in whatever
    # language it has. A case has one attempt per person in any language.
    exact = True
    if resuming is not None:
        locale = resuming[0]
    else:
        row = conn.execute(
            "SELECT locales::text[] FROM app.case_registry WHERE case_key = %s",
            (case_key,)).fetchone()
        available = (row[0] if row else None) or [cl.DEFAULT_LOCALE]
        chosen = body.locale if body is not None else None
        if chosen in available:
            locale = chosen
        else:
            locale = case_language(available, case_locales_of(user.case_locales, user.locale),
                                   user.locale)
            exact = False
    try:
        case = cl.load_case(CASE_ROOT, case_key, locale, conn, exact=exact)
    except cl.CaseNotFound:
        raise HTTPException(404, "no such case")
    session_key = None
    if resuming is None:
        state = limits.state(conn, user.person_id, user.signed_in,
                             exempt=_is_admin(conn, user.person_id))
        if not state["can_start"]:
            conn.rollback()
            raise HTTPException(429, {"code": "limit", **_public_limits(state)})
        session_key = state["session_key"]
    try:
        attempt = service.start_attempt(
            conn, user.person_id, user.pseudonym, case_key,
            case.variant_keys, user.role, session_key, locale=case.locale,
        )
    except service.CaseUnavailable as exc:
        raise HTTPException(403, str(exc))
    conn.commit()

    steps = case.body["steps"]
    done = min(attempt.get("answered", 0), len(steps))

    if done >= len(steps):
        # Every step is answered: the person goes to the solution note.
        return {
            "attempt_id": attempt["attempt_id"],
            "locale": case.locale,
            "step_index": len(steps) + 1,
            "step_count": len(steps),
            "finished": True,
            "step": None,
            "debrief": _debrief(case, attempt["variant_key"],
                                _reveal_open(conn, attempt["case_id"], check=True)),
        }

    return {
        "attempt_id": attempt["attempt_id"],
        "locale": case.locale,
        "step_index": done + 1,
        "step_count": len(steps),
        "finished": False,
        "step": _with_seal(conn, cl.client_step(case, steps[done]["id"],
                                                attempt["variant_key"], user.pseudonym),
                           attempt["attempt_id"], user),
    }


# ---------------------------------------------------------------------------
# The twin's sealed prediction
# ---------------------------------------------------------------------------

def _commitment(attempt_id: int, step_key: str, p: float, salt: str) -> str:
    return f"{attempt_id}:{step_key}:{p:.4f}:{salt}"


def _seal(conn: psycopg.Connection, attempt_id: int, step_key: str, person_id: int,
          shown: bool = True) -> dict | None:
    """The twin's prediction for one step of an attempt, sealed the first time.

    Later calls return the same seal, so reloading a step or walking a decision
    one node at a time never changes it. `shown` records whether the seal was
    created as the step went to the person.
    """
    row = conn.execute(
        "SELECT cs.id, cs.dimension::text, a.variant_key FROM app.attempt a"
        " JOIN app.case_step cs ON cs.case_id = a.case_id AND cs.step_key = %s"
        " WHERE a.id = %s AND a.person_id = %s",
        (step_key, attempt_id, person_id)).fetchone()
    if row is None:
        return None
    case_step_id, dimension, variant_key = row
    query = ("SELECT p_sealed, salt, digest, sealed_at, shown FROM app.step_seal"
             " WHERE attempt_id = %s AND case_step_id = %s")
    sealed = conn.execute(query, (attempt_id, case_step_id)).fetchone()
    if sealed is None:
        theta = conn.execute(
            "SELECT theta FROM app.twin_state WHERE person_id = %s AND dimension::text = %s",
            (person_id, dimension)).fetchone()
        difficulty = conn.execute(
            "SELECT b FROM app.step_difficulty WHERE case_step_id = %s AND variant_key = %s",
            (case_step_id, variant_key)).fetchone()
        p = round(scoring.predict(theta[0] if theta else 0.0,
                                  difficulty[0] if difficulty else 0.0), 4)
        salt = secrets.token_hex(16)
        digest = hashlib.sha256(
            _commitment(attempt_id, step_key, p, salt).encode()).hexdigest()
        conn.execute(
            "INSERT INTO app.step_seal (attempt_id, case_step_id, p_sealed, salt, digest, shown)"
            " VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
            (attempt_id, case_step_id, p, salt, digest, shown))
        conn.commit()
        sealed = conn.execute(query, (attempt_id, case_step_id)).fetchone()
    p, salt, digest, sealed_at, was_shown = sealed
    return {"p": p, "salt": salt, "digest": digest, "sealed_at": sealed_at,
            "shown": was_shown}


def _with_seal(conn: psycopg.Connection, step: dict, attempt_id: int,
               user: "Principal", with_tip: bool = True) -> dict:
    """A step as it goes to the person, carrying only the digest of its seal,
    and a strategy tip when the sealed prediction is low. A decision step gets
    its tip once, at its first node."""
    seal = _seal(conn, attempt_id, step["step_key"], user.person_id)
    if seal:
        step["seal"] = {"digest": seal["digest"],
                        "sealed_at": seal["sealed_at"].isoformat()}
        text = _tip_for(conn, step, attempt_id, user, seal["p"]) if with_tip else None
        if text:
            step["tip"] = text
    return step


def _hint_arm(conn: psycopg.Connection) -> str:
    """Hints for everyone, or, while the experiment runs, a coin for each
    eligible step. The same person meets both conditions, so whatever a tip does
    to their twin afterwards falls on both alike."""
    if not _setting(conn, "hint_experiment", True):
        return "open"
    return "hint" if secrets.randbelow(2) == 0 else "control"


def _tip_for(conn: psycopg.Connection, step: dict, attempt_id: int,
             user: "Principal", p: float) -> str | None:
    if p >= float(_setting(conn, "hint_threshold", 0.45)):
        return None
    row = conn.execute(
        "SELECT cs.id, cs.dimension::text FROM app.attempt a"
        " JOIN app.case_step cs ON cs.case_id = a.case_id AND cs.step_key = %s"
        " WHERE a.id = %s", (step["step_key"], attempt_id)).fetchone()
    if row is None:
        return None
    # The coin is tossed once; a reload or a second device reads it back.
    conn.execute(
        "INSERT INTO app.hint_exposure (attempt_id, case_step_id, arm, p_sealed)"
        " VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (attempt_id, row[0], _hint_arm(conn), p))
    conn.commit()
    arm = conn.execute(
        "SELECT arm FROM app.hint_exposure WHERE attempt_id = %s AND case_step_id = %s",
        (attempt_id, row[0])).fetchone()[0]
    return tips.tip(user.locale, step["kind"], row[1]) if arm != "control" else None


def _seal_opened(seal: dict, attempt_id: int, step_key: str) -> dict:
    """Everything needed to check the seal: the number, the salt, the string hashed."""
    return {"p": seal["p"], "salt": seal["salt"], "digest": seal["digest"],
            "commitment": _commitment(attempt_id, step_key, seal["p"], seal["salt"]),
            "sealed_at": seal["sealed_at"].isoformat(), "shown": seal["shown"]}


class StepSubmission(BaseModel):
    step_key: str
    confidence: float | None = None
    # Shape depends on the step kind; validated by the grader, which raises on
    # anything it cannot interpret.
    submission: dict
    node_id: str | None = None


@app.post("/attempts/{attempt_id}/submit")
def submit(attempt_id: int, body: StepSubmission,
           user: Principal = Depends(current_user),
           conn: psycopg.Connection = Depends(db)) -> dict:
    """Grade one step and hand back the next one.

    Returning the next step here keeps a case to one request per step.
    """
    # A first look. Whether the attempt was set aside is asked again, with the
    # attempt held, when the answer is recorded (service.submit_step).
    row = conn.execute(
        "SELECT a.variant_key, a.point_ratio, cr.case_key, cs.id, cs.dimension::text,"
        "       cs.points, cr.id, a.finished_at, a.locale::text,"
        "       EXISTS (SELECT 1 FROM app.attempt_void v WHERE v.attempt_id = a.id)"
        " FROM app.attempt a"
        " JOIN app.case_registry cr ON cr.id = a.case_id"
        " JOIN app.case_step cs ON cs.case_id = cr.id AND cs.step_key = %s"
        " WHERE a.id = %s AND a.person_id = %s FOR UPDATE OF a",
        (body.step_key, attempt_id, user.person_id),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "attempt or step not found")

    (variant_key, point_ratio, case_key, case_step_id, dimension, points, case_id,
     finished_at, attempt_locale, set_aside) = row
    if set_aside:
        raise HTTPException(409, "attempt_voided")
    # The answer key of the language the attempt is in.
    case = cl.load_case(CASE_ROOT, case_key, attempt_locale, conn, exact=True)
    step = case.step(body.step_key)

    # Steps are answered in their order, one at a time. The only step accepted
    # is the first one this attempt has not answered, so no step can be skipped
    # to finish a case early, and nothing is accepted once it is finished.
    answered = {r[0] for r in conn.execute(
        "SELECT cs.step_key FROM app.step_result sr"
        " JOIN app.case_step cs ON cs.id = sr.case_step_id WHERE sr.attempt_id = %s",
        (attempt_id,)).fetchall()}
    if body.step_key in answered:
        raise HTTPException(409, "step already submitted")
    current = next((s["id"] for s in case.body["steps"] if s["id"] not in answered), None)
    if finished_at is not None or current is None:
        raise HTTPException(409, "attempt_finished")
    if body.step_key != current:
        raise HTTPException(409, "step_out_of_order")

    # A step that asks for confidence is scored with it, so it cannot be left
    # out; a step that does not ask has none recorded. A branching step never
    # asks, because its path is walked one decision at a time.
    asks_confidence = bool(step.get("confidence")) and step["kind"] != "branching"
    confidence = body.confidence if asks_confidence else None
    if asks_confidence and confidence is None:
        raise HTTPException(400, "confidence_required")

    submission = dict(body.submission)
    written = submission.get("text") if step["kind"] == "pattern_check" else None
    # The case's patterns run over the text, so its length is bounded whatever
    # the step allows; the longest the cases ask for is well under this.
    if isinstance(written, str) and len(written) > PATTERN_TEXT_MAX:
        raise HTTPException(400, "text_too_long")
    key = cl.answer_key(case, body.step_key, variant_key)
    ending = None
    if step["kind"] == "branching":
        # Only option_ids is accepted, so a malformed submission surfaces as an
        # error.
        unknown = set(submission) - {"option_ids"}
        if unknown or "option_ids" not in submission:
            raise HTTPException(
                400, f"branching takes ['option_ids']; got {sorted(submission)}")
        # The whole path is resent each time and only a completed one is scored,
        # so the client never holds a cursor the server has to trust.
        try:
            option_ids = submission.get("option_ids", [])
            submission = {"path_outcomes": cl.branching_outcome(
                case, body.step_key, option_ids)}
            ending = cl.branching_ending(case, body.step_key, option_ids, variant_key)
        except cl.UnfinishedPath:
            # The person is mid-path: hand back the node they are standing on
            # and score nothing yet.
            step_ids = [x["id"] for x in case.body["steps"]]
            node = cl.client_step(
                case, body.step_key, variant_key, user.pseudonym,
                node_id=_node_after(case, body.step_key,
                                    submission.get("option_ids", [])))
            return {"step_index": step_ids.index(body.step_key) + 1,
                    "step_count": len(step_ids),
                    "step": _with_seal(conn, node, attempt_id, user, with_tip=False),
                    "path_complete": False}
        except KeyError:
            raise HTTPException(400, cl.INVALID_PATH)

    seal = _seal(conn, attempt_id, body.step_key, user.person_id, shown=False)
    try:
        outcome = service.submit_step(
            conn,
            person_id=user.person_id, attempt_id=attempt_id,
            case_step_id=case_step_id, variant_key=variant_key,
            dimension=dimension, base_points=points, point_ratio=float(point_ratio),
            kind=step["kind"], submission=submission, answer_key=key,
            confidence=confidence, expected=seal["p"] if seal else None,
        )
    except service.AlreadySubmitted:
        raise HTTPException(409, "step already submitted")
    except service.AttemptVoided:
        raise HTTPException(409, "attempt_voided")
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, str(exc))
    except TypeError:
        # A submission whose fields are named right but shaped wrong.
        raise HTTPException(400, "invalid_submission")

    step_ids = [s["id"] for s in case.body["steps"]]
    index = step_ids.index(body.step_key)
    has_next = index + 1 < len(step_ids)
    earned: list[dict] = []

    if not has_next:
        # Held before it is marked finished, so that an attempt set aside in
        # the meantime stays as it was left.
        conn.execute("SELECT 1 FROM app.attempt WHERE id = %s FOR UPDATE", (attempt_id,))
        conn.execute(
            "UPDATE app.attempt SET finished_at = now()"
            " WHERE id = %s AND finished_at IS NULL"
            "   AND NOT EXISTS (SELECT 1 FROM app.attempt_void v WHERE v.attempt_id = %s)",
            (attempt_id, attempt_id),
        )
        # A finish far quicker than the case can be read goes on the review
        # list; an administrator decides what, if anything, follows.
        integrity.check_fast_finish(conn, attempt_id, case.body.get("estimated_minutes"))
        conn.commit()
        earned = _earned_at_finish(conn, user)

    calibration = conn.execute(
        "SELECT brier_mean, n FROM app.calibration WHERE person_id = %s",
        (user.person_id,),
    ).fetchone()

    # Finishing an attempt is what moves a case toward its opening point, so
    # the full check runs then; other steps only read the recorded state.
    opened = _reveal_open(conn, case_id, check=not has_next)

    verdict = ("correct" if outcome.outcome >= scoring.SUCCESS_THRESHOLD
               else "incorrect" if outcome.outcome == 0 else "partial")
    return {
        "outcome": outcome.outcome,
        "verdict": verdict,
        "points": round(outcome.points, 1),
        "feedback": cl.substitute(
            step["feedback"]["correct" if verdict == "correct" else "incorrect"],
            case.variant_values(variant_key)),
        "ending": ending,
        "reveal": cl.reveal(case, body.step_key, variant_key,
                            {"submission": written} if written is not None else None)
                  if opened else None,
        "reveal_pending": not opened,
        "calibration": {"brier_mean": calibration[0] if calibration else None,
                        "n": calibration[1] if calibration else 0},
        "twin": {"dimension": dimension,
                 "before": outcome.theta_before, "after": outcome.theta_after,
                 "predicted": outcome.p_predicted},
        "seal": _seal_opened(seal, attempt_id, body.step_key) if seal else None,
        "step_index": index + 2 if has_next else index + 1,
        "step_count": len(step_ids),
        "step": _with_seal(conn, cl.client_step(case, step_ids[index + 1], variant_key,
                                                user.pseudonym), attempt_id, user)
                if has_next else None,
        "debrief": _debrief(case, variant_key, opened) if not has_next else None,
        # Rare marks and medals this finish earned.
        "awards": earned,
    }


def _earned_at_finish(conn: psycopg.Connection, user: Principal) -> list[dict]:
    """The rare marks and medals that finishing a case earned, recorded. A
    fault here never stands in the way of the finish, which is already kept."""
    try:
        with conn.transaction():
            codes = awards.evaluate(conn, user.person_id)
        return awards.described(conn, codes, user.locale)
    except psycopg.Error as exc:
        log.warning("awards not checked at a finish: %s", type(exc).__name__)
        conn.rollback()
        return []


# ---------------------------------------------------------------------------
# Campus map
# ---------------------------------------------------------------------------

@app.get("/map/activity")
def map_activity(response: Response, user: Principal = Depends(current_user),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    """Participation per building.

    Counts, plus the unit each building belongs to so the client can ask for
    that unit's awareness separately. No competence figure is returned here,
    and per-unit results never carry a number, so units cannot be ranked.
    """
    # The map is read far more often than it changes; a short cache keeps a
    # lecture hall full of people opening it at once off the database. Only
    # the browser keeps it, and once per language.
    response.headers["Cache-Control"] = "private, max-age=120"
    response.headers["Vary"] = "X-Yazem-Lang"
    return _activity(conn, user.locale)


def _activity(conn: psycopg.Connection, locale: str) -> dict:
    # Buildings with a pin, and the district schools, which the map draws in
    # a row of their own and finds by their district.
    rows = conn.execute(
        "SELECT la.location_id, la.map_no, la.name_tr, la.campus::text,"
        "       la.x_norm, la.y_norm, la.registered, la.active_7d,"
        "       (SELECT ul.unit_id FROM app.unit_location ul"
        "         WHERE ul.location_id = la.location_id AND ul.is_primary"
        "         LIMIT 1) AS unit_id,"
        "       (SELECT l.district_name FROM app.location l WHERE l.id = la.location_id)"
        " FROM app.v_location_activity la"
        " WHERE la.x_norm IS NOT NULL OR la.campus = 'district'"
    ).fetchall()

    # People who finished a case, per building, in each of the last eight
    # 7-day windows (the newest is the same window as active_7d), and per local
    # day over the last week. Both series are kept to buildings above the
    # anonymity threshold, where a week's or a day's count is not one person's
    # diary.
    weeks: dict[int, list[int]] = {}
    for loc, ago, n in conn.execute(
            "SELECT ul.location_id,"
            "       floor(extract(epoch FROM now() - a.finished_at) / 604800)::int, "
            "       count(DISTINCT a.person_id)"
            " FROM app.attempt a"
            " JOIN app.person p ON p.id = a.person_id AND p.status = 'active'"
            " JOIN app.unit_location ul ON ul.unit_id = p.unit_id AND ul.is_primary"
            " WHERE a.finished_at > now() - interval '56 days'"
            " GROUP BY 1, 2").fetchall():
        weeks.setdefault(loc, [0] * 8)[7 - ago] = n
    days: dict[int, list[int]] = {}
    for loc, ago, n in conn.execute(
            "SELECT ul.location_id,"
            "       (now() AT TIME ZONE %(tz)s)::date - (a.finished_at AT TIME ZONE %(tz)s)::date,"
            "       count(DISTINCT a.person_id)"
            " FROM app.attempt a"
            " JOIN app.person p ON p.id = a.person_id AND p.status = 'active'"
            " JOIN app.unit_location ul ON ul.unit_id = p.unit_id AND ul.is_primary"
            " WHERE a.finished_at > now() - interval '8 days'"
            " GROUP BY 1, 2", {"tz": LOCAL_TZ}).fetchall():
        if 0 <= ago <= 6:
            days.setdefault(loc, [0] * 7)[6 - ago] = n
    floor_n = conn.execute("SELECT app.competence_threshold()").fetchone()[0]

    places = english_names(conn, locale, "location")
    payload = [
        {"id": r[0], "map_no": r[1], "name": places.get(r[2], r[2]), "campus": r[3],
         "district": r[9],
         "x": float(r[4]) if r[4] is not None else None,
         "y": float(r[5]) if r[5] is not None else None,
         "registered": r[6], "active_7d": r[7],
         # Which unit to ask about when this building is selected. The awareness
         # figure itself is a separate request, so nothing competence-shaped
         # travels with the map.
         "unit_id": r[8],
         "weeks": (weeks.get(r[0], [0] * 8) if r[6] >= floor_n else None),
         "days": (days.get(r[0], [0] * 7) if r[6] >= floor_n else None)}
        for r in rows
    ]
    return {"locations": payload, "note": MESSAGES[locale]["map"]["note"]}


# How far back the time bar goes at most, and how far at least, so that the
# sky can be played back on a platform that opened yesterday.
HISTORY_MAX_DAYS = 730
HISTORY_MIN_DAYS = 14
HISTORY_TTL = 300.0
_history: dict[bool, tuple[float, dict]] = {}
_history_lock = threading.Lock()


@app.get("/map/history")
def map_history(response: Response, user: Principal = Depends(current_user),
                conn: psycopg.Connection = Depends(db)) -> dict:
    """The campus day by day, for the map's time bar.

    For each building above the anonymity threshold, as for the weekly series:
    the people registered by the end of each day, and the people who finished
    a case in the seven days up to and including it. For the campus as a
    whole: registered and active people, answers, and people answering, per
    day, and the campus twin as it stood at the end of each day. Days are
    campus days, from the first sign-up to today.

    Everything here is counted for the whole campus or for a building, and is
    the same for everyone, so it is worked out once in a while and shared.
    """
    response.headers["Cache-Control"] = "private, max-age=300"
    key = demo.active()
    with _history_lock:
        held = _history.get(key)
    if held is not None and time.monotonic() - held[0] < HISTORY_TTL:
        return held[1]
    out = _campus_history(conn)
    with _history_lock:
        _history[key] = (time.monotonic(), out)
    return out


def _campus_history(conn: psycopg.Connection, twin: bool = True) -> dict:
    """The history the time bar plays, with the campus twin's own unless the
    twin is closed to whoever asks."""
    tz = LOCAL_TZ
    today = conn.execute("SELECT (now() AT TIME ZONE %s)::date", (tz,)).fetchone()[0]
    first = conn.execute(
        "SELECT min((created_at AT TIME ZONE %s)::date) FROM app.person WHERE status = 'active'",
        (tz,)).fetchone()[0]
    start = min(first or today, today - timedelta(days=HISTORY_MIN_DAYS - 1))
    start = max(start, today - timedelta(days=HISTORY_MAX_DAYS - 1))
    days = (today - start).days + 1
    since = conn.execute("SELECT (%s::date)::timestamp AT TIME ZONE %s",
                         (start - timedelta(days=7), tz)).fetchone()[0]
    floor_n = conn.execute("SELECT app.competence_threshold()").fetchone()[0]

    def index(d) -> int:
        return (d - start).days

    places = conn.execute(
        "SELECT la.location_id, la.map_no, l.district_name, la.registered"
        " FROM app.v_location_activity la JOIN app.location l ON l.id = la.location_id"
        " WHERE la.x_norm IS NOT NULL OR la.campus = 'district'").fetchall()
    shown = {r[0]: r for r in places if r[3] >= floor_n}

    joined: dict[int, list[int]] = {loc: [0] * days for loc in shown}
    everyone = [0] * days
    for loc, day, n in conn.execute(
            "SELECT ul.location_id, (p.created_at AT TIME ZONE %s)::date, count(*)"
            " FROM app.person p"
            " LEFT JOIN app.unit_location ul ON ul.unit_id = p.unit_id AND ul.is_primary"
            " WHERE p.status = 'active' GROUP BY 1, 2", (tz,)).fetchall():
        i = max(0, index(day))
        if i >= days:
            continue
        everyone[i] += n
        if loc in joined:
            joined[loc][i] += n

    # People who finished a case in the seven days up to each day, per building
    # and for the campus: each finish lights its own day and the six after it,
    # and a person counts once a day however many of their finishes do.
    lit: dict[int, list[set]] = {loc: [set() for _ in range(days)] for loc in shown}
    lit_campus: list[set] = [set() for _ in range(days)]
    for loc, person, day in conn.execute(
            "SELECT DISTINCT ul.location_id, a.person_id, (a.finished_at AT TIME ZONE %s)::date"
            " FROM app.attempt a"
            " JOIN app.person p ON p.id = a.person_id AND p.status = 'active'"
            " LEFT JOIN app.unit_location ul ON ul.unit_id = p.unit_id AND ul.is_primary"
            " WHERE a.finished_at >= %s", (tz, since)).fetchall():
        first_i = index(day)
        for i in range(max(0, first_i), min(days, first_i + 7)):
            lit_campus[i].add(person)
            if loc in lit:
                lit[loc][i].add(person)
    active = {loc: [len(people) for people in sets] for loc, sets in lit.items()}
    campus_active = [len(people) for people in lit_campus]

    answers, answering = [0] * days, [0] * days
    for day, n, people in conn.execute(
            "SELECT (sr.answered_at AT TIME ZONE %s)::date, count(*), count(DISTINCT a.person_id)"
            " FROM app.step_result sr JOIN app.attempt a ON a.id = sr.attempt_id"
            " JOIN app.person p ON p.id = a.person_id AND p.status = 'active'"
            " WHERE sr.answered_at >= %s GROUP BY 1", (tz, since)).fetchall():
        i = index(day)
        if 0 <= i < days:
            answers[i], answering[i] = n, people

    def running(values: list[int]) -> list[int]:
        total, out = 0, []
        for v in values:
            total += v
            out.append(total)
        return out

    out = {
        "start": start.isoformat(), "today": today.isoformat(), "days": days,
        "threshold": floor_n,
        "campus": {"registered": running(everyone), "active": campus_active,
                   "answers": answers, "people": answering},
        "locations": [
            {"map_no": r[1], "district": r[2], "reg": running(joined[loc]), "act": active[loc]}
            for loc, r in shown.items()
        ],
    }
    if twin:
        out["twin"] = campus.twin_history(conn, tz, start, days, floor_n,
                                          scoring.SUCCESS_THRESHOLD)
    return out


@app.get("/map/pulse")
def map_pulse(response: Response, user: Principal = Depends(current_user),
              conn: psycopg.Connection = Depends(db)) -> dict:
    """What the campus is doing now, counted for the whole campus.

    Answers in the last hour and today, people this week, answers per day for
    two weeks, and the cases most finished this week. The only per-building
    figure is which buildings had at least two people answering in the last
    hour, and only for buildings above the anonymity threshold, so no one's
    hour can be read off the map.
    """
    response.headers["Cache-Control"] = "private, max-age=30"
    response.headers["Vary"] = "X-Yazem-Lang"
    return _pulse(conn, user.locale)


def _pulse(conn: psycopg.Connection, locale: str) -> dict:
    # Every count is over active accounts, so a suspended or closed one drops out.
    hour, today, people_today = conn.execute(
        "SELECT count(*) FILTER (WHERE sr.answered_at > now() - interval '1 hour'),"
        "       count(*) FILTER (WHERE sr.answered_at >= %(midnight)s),"
        "       count(DISTINCT a.person_id) FILTER (WHERE sr.answered_at >= %(midnight)s)"
        " FROM app.step_result sr JOIN app.attempt a ON a.id = sr.attempt_id"
        " JOIN app.person p ON p.id = a.person_id AND p.status = 'active'"
        " WHERE sr.answered_at > now() - interval '1 day'",
        {"midnight": _local_midnight(conn)}).fetchone()
    people_week = conn.execute(
        "SELECT count(DISTINCT a.person_id) FROM app.attempt a"
        " JOIN app.person p ON p.id = a.person_id AND p.status = 'active'"
        " WHERE a.finished_at > now() - interval '7 days'").fetchone()[0]
    per_day = [0] * 14
    for ago, n in conn.execute(
            "SELECT (now() AT TIME ZONE %(tz)s)::date - (sr.answered_at AT TIME ZONE %(tz)s)::date,"
            "       count(*)"
            " FROM app.step_result sr JOIN app.attempt a ON a.id = sr.attempt_id"
            " JOIN app.person p ON p.id = a.person_id AND p.status = 'active'"
            " WHERE sr.answered_at > now() - interval '15 days'"
            " GROUP BY 1", {"tz": LOCAL_TZ}).fetchall():
        if 0 <= ago <= 13:
            per_day[13 - ago] = n
    top = conn.execute(
        "SELECT cr.case_key, cr.title_tr, cr.locales::text[],"
        "       count(*) FILTER (WHERE a.finished_at > now() - interval '1 day'), count(*)"
        " FROM app.attempt a JOIN app.case_registry cr ON cr.id = a.case_id"
        " JOIN app.person p ON p.id = a.person_id AND p.status = 'active'"
        " WHERE a.finished_at > now() - interval '7 days'"
        " GROUP BY cr.id ORDER BY count(*) DESC, cr.case_key LIMIT 6").fetchall()
    live = conn.execute(
        "SELECT l.map_no, count(DISTINCT a.person_id)"
        " FROM app.step_result sr JOIN app.attempt a ON a.id = sr.attempt_id"
        " JOIN app.person p ON p.id = a.person_id AND p.status = 'active'"
        " JOIN app.unit_location ul ON ul.unit_id = p.unit_id AND ul.is_primary"
        " JOIN app.location l ON l.id = ul.location_id"
        " JOIN app.v_location_activity la ON la.location_id = l.id"
        " WHERE sr.answered_at > now() - interval '1 hour'"
        "   AND la.registered >= app.competence_threshold()"
        " GROUP BY l.map_no HAVING count(DISTINCT a.person_id) >= 2").fetchall()

    def title(key, title_tr, locales):
        """A case's title in the language on screen when the case has it, and
        otherwise in the language it was registered in, with that language."""
        registered = "tr" if "tr" in locales else locales[0]
        if locale in locales and locale != registered:
            try:
                return (cl.load_case(CASE_ROOT, key, locale, conn, exact=True).body["title"],
                        locale)
            except (cl.CaseNotFound, KeyError):
                pass
        return title_tr, registered

    return {
        "answers_hour": hour, "answers_today": today, "people_today": people_today,
        "people_week": people_week, "answers_per_day": per_day,
        "cases": [{"key": k, "title": shown, "locale": locale,
                   "finished_day": d, "finished_week": w}
                  for k, t, langs, d, w in top
                  for shown, locale in [title(k, t, langs or [cl.DEFAULT_LOCALE])]],
        "live": [{"map_no": m, "people": n} for m, n in live],
    }


def _local_midnight(conn: psycopg.Connection):
    return conn.execute(
        "SELECT date_trunc('day', now() AT TIME ZONE %s) AT TIME ZONE %s",
        (LOCAL_TZ, LOCAL_TZ)).fetchone()[0]


@app.get("/map/places")
def map_places(user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """The places a case or an event can be set in, in the language on screen."""
    return {"places": campus.places(conn, user.locale)}


@app.get("/map/weather")
def map_weather(response: Response, user: Principal = Depends(current_user)) -> dict:
    """The weather over the campus, as the map draws it. The server asks the
    weather service; the browser never does."""
    response.headers["Cache-Control"] = "private, max-age=300"
    return weather.current()


@app.get("/map/forecast")
def map_forecast(response: Response, user: Principal = Depends(current_user),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    """The campus twin's forecast of today's answers, and the days already over.

    While the day lasts only the seal of today's number is sent. Once the day
    is over its number, its salt and the day's actual count are sent with it,
    so the browser can check the seal itself and set the forecast against what
    happened. Every figure is a count for the whole campus.
    """
    response.headers["Cache-Control"] = "private, max-age=60"
    return _forecast(conn)


def _forecast(conn: psycopg.Connection) -> dict:
    return {"today": campus.todays_forecast(conn, LOCAL_TZ),
            "past": campus.opened_forecasts(conn, LOCAL_TZ)}


@app.get("/map/trap")
def map_trap(user: Principal = Depends(current_user),
             conn: psycopg.Connection = Depends(db)) -> dict:
    """The step the campus most often got wrong lately, in a case whose
    correct answers are open.

    The share is the campus's, over at least the reporting threshold of people,
    and only a case this person could open is named. The step's note explains
    its answer, so it goes only to someone who finished the case, as the
    solution does; anyone else is told which step it is and invited to try.
    """
    floor_n = conn.execute("SELECT app.competence_threshold()").fetchone()[0]
    days, rows = campus.trap_candidates(conn, scoring.SUCCESS_THRESHOLD, floor_n)
    if not rows:
        return {"trap": None, "threshold": floor_n}
    visible = {r[0] for r in conn.execute(
        "SELECT case_key FROM app.open_cases(%s)", (user.person_id,)).fetchall()}
    offered = case_locales_of(user.case_locales, user.locale)
    languages = dict(conn.execute(
        "SELECT case_key, locales::text[] FROM app.case_registry").fetchall())
    for key, step_key, dimension, people, wrong in rows:
        if key not in visible:
            continue
        attempt = conn.execute(
            "SELECT a.variant_key, a.locale::text, a.finished_at IS NOT NULL,"
            "       EXISTS (SELECT 1 FROM app.attempt_void v WHERE v.attempt_id = a.id)"
            " FROM app.attempt a JOIN app.case_registry cr ON cr.id = a.case_id"
            " WHERE cr.case_key = %s AND a.person_id = %s", (key, user.person_id)).fetchone()
        available = languages.get(key) or [cl.DEFAULT_LOCALE]
        if attempt and attempt[3]:
            # Set aside: the case cannot be tried again, so it is not offered.
            continue
        if attempt:
            locale = attempt[1]
        elif not set(available) & set(offered):
            continue
        else:
            locale = case_language(available, offered, user.locale)
        try:
            case = cl.load_case(CASE_ROOT, key, locale, conn)
        except cl.CaseNotFound:
            continue
        ids = [s["id"] for s in case.body.get("steps", [])]
        if step_key not in ids:
            continue
        values = _values_for(case, user, attempt[0] if attempt else None)
        finished = bool(attempt and attempt[2])
        notes = (case.body.get("debrief") or {}).get("per_step") or {}
        return {"threshold": floor_n, "trap": {
            "key": key, "title": cl.substitute_all(case.body.get("title"), values),
            "locale": case.locale, "step": ids.index(step_key) + 1, "steps": len(ids),
            "dimension": dimension, "people": people, "wrong": round(float(wrong), 3),
            "days": days, "finished": finished,
            "note": cl.substitute_all(notes.get(step_key), values) if finished else None}}
    return {"trap": None, "threshold": floor_n}


@app.get("/map/events")
def map_events(user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """Announcements in force for this person that name a place on the map."""
    return {"events": campus.events_for(conn, announcements.audiences_for(user.role))}


@app.get("/me/light")
def my_light(response: Response, user: Principal = Depends(current_user),
             conn: psycopg.Connection = Depends(db)) -> dict:
    """The person's own light on the map: the building of their unit and how
    much they answered today. Only the person is told."""
    response.headers["Cache-Control"] = "private, no-store"
    return campus.light_of(conn, user.person_id, LOCAL_TZ)


# ---------------------------------------------------------------------------
# The campus for visitors
# ---------------------------------------------------------------------------
#
# The same campus, for someone who has not signed in, as far as the
# administrators leave it open (public_campus.py). These answers hold nothing
# about any one person apart from the ranking rows of people who agreed to be
# seen from outside, and they are made at most once in a while and served from
# memory, so they never wait on a session and never open a connection per
# request.

def _connect() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL, connect_timeout=5)


def _visitor_locale(x_yazem_lang: str | None, accept_language: str | None) -> str:
    """The language on a visitor's screen as the interface says it, otherwise
    the browser's."""
    if x_yazem_lang in cl.SUPPORTED_LOCALES:
        return x_yazem_lang
    return resolve_locale(accept_language, None)


def _visitors_see(part: str, conn: psycopg.Connection | None = None) -> bool:
    """Whether visitors may see one part of the campus now: campus, twin,
    units or board. Never in the demo, whose password is the point of it."""
    if demo.active():
        return False
    connect = (lambda: contextlib.nullcontext(conn)) if conn is not None else _connect
    return public_campus.shown(public_campus.switches(connect))[part]


def _open_part(part: str) -> None:
    """404 while a part is closed to visitors."""
    try:
        open_ = _visitors_see(part)
    except psycopg.Error as exc:
        log.warning("visitor switches not read: %s", type(exc).__name__)
        raise HTTPException(503, "unavailable")
    if not open_:
        raise HTTPException(404, "not_public")


def _for_visitors(part: str, key: tuple, ttl: float, make, response: Response):
    """An answer for visitors, from memory while it is fresh, or 404 while the
    part is closed to them."""
    _open_part(part)

    def build():
        with _connect() as conn:
            return make(conn)

    try:
        out = public_campus.held(key, ttl, build)
    except psycopg.Error as exc:
        log.warning("visitor answer not made: %s", type(exc).__name__)
        raise HTTPException(503, "unavailable")
    # The same for every visitor, in their language.
    response.headers["Cache-Control"] = f"public, max-age={min(int(ttl), 120)}"
    response.headers["Vary"] = "X-Yazem-Lang, Accept-Language"
    return out


# How long each answer is kept for visitors, in seconds.
VISITOR_TTL = {"activity": 120.0, "pulse": 30.0, "forecast": 60.0, "events": 60.0,
               "cases": 120.0, "awareness": 60.0, "accuracy": 60.0, "unit": 120.0,
               "board": 60.0, "known": 600.0}


@app.get("/public/campus")
def visitor_parts(response: Response) -> dict:
    """Which parts of the campus someone who has not signed in may see."""
    response.headers["Cache-Control"] = "no-store"
    closed = {"campus": False, "twin": False, "units": False, "board": False}
    if demo.active():
        return closed
    try:
        return public_campus.shown(public_campus.switches(_connect))
    except psycopg.Error as exc:
        log.warning("visitor switches not read: %s", type(exc).__name__)
        return closed


@app.get("/public/map/activity")
def visitor_activity(response: Response, x_yazem_lang: str | None = Header(default=None),
                     accept_language: str | None = Header(default=None)) -> dict:
    locale = _visitor_locale(x_yazem_lang, accept_language)
    return _for_visitors("campus", ("activity", locale), VISITOR_TTL["activity"],
                         lambda conn: _activity(conn, locale), response)


@app.get("/public/map/pulse")
def visitor_pulse(response: Response, x_yazem_lang: str | None = Header(default=None),
                  accept_language: str | None = Header(default=None)) -> dict:
    locale = _visitor_locale(x_yazem_lang, accept_language)
    return _for_visitors("campus", ("pulse", locale), VISITOR_TTL["pulse"],
                         lambda conn: _pulse(conn, locale), response)


@app.get("/public/map/history")
def visitor_history(response: Response) -> dict:
    # The campus twin's part goes only while the twin is open to visitors.
    try:
        twin = _visitors_see("twin")
    except psycopg.Error:
        twin = False
    return _for_visitors("campus", ("history", twin), HISTORY_TTL,
                         lambda conn: _campus_history(conn, twin), response)


@app.get("/public/map/weather")
def visitor_weather(response: Response) -> dict:
    # Asked of the weather service by the server, which keeps it a while.
    _open_part("campus")
    response.headers["Cache-Control"] = "public, max-age=300"
    return weather.current()


@app.get("/public/map/forecast")
def visitor_forecast(response: Response) -> dict:
    return _for_visitors("twin", ("forecast",), VISITOR_TTL["forecast"], _forecast, response)


@app.get("/public/map/events")
def visitor_events(response: Response) -> dict:
    """Announcements meant for everyone that name a place on the map."""
    return _for_visitors("campus", ("events",), VISITOR_TTL["events"],
                         lambda conn: {"events": campus.events_for(conn, ["public"])}, response)


@app.get("/public/map/cases")
def visitor_cases(response: Response, x_yazem_lang: str | None = Header(default=None),
                  accept_language: str | None = Header(default=None)) -> dict:
    locale = _visitor_locale(x_yazem_lang, accept_language)
    return _for_visitors("campus", ("cases", locale), VISITOR_TTL["cases"],
                         lambda conn: {"cases": _visitor_cases(conn, locale)}, response)


def _visitor_cases(conn: psycopg.Connection, locale: str) -> list[dict]:
    """The cases set somewhere on the campus that are open to the whole campus,
    as the map's pins show them to a visitor: the title, in the visitor's
    language where the case has it, and the place. What a case asks stays
    behind signing in."""
    conn.execute("SELECT app.refresh_case_status()")
    rows = conn.execute(
        "SELECT cr.case_key, cr.type::text, cr.status::text, cr.locales::text[]"
        " FROM app.case_registry cr"
        " WHERE cr.publish_at <= now() AND cr.status <> 'scheduled'"
        "   AND NOT EXISTS (SELECT 1 FROM app.case_target ct WHERE ct.case_id = cr.id)"
        " ORDER BY cr.type = 'weekly' DESC, cr.publish_at DESC").fetchall()
    out = []
    for key, kind, status, languages in rows:
        available = languages or [cl.DEFAULT_LOCALE]
        try:
            case = cl.load_case(CASE_ROOT, key, case_language(available, [locale], locale), conn)
        except cl.CaseNotFound:
            continue
        place = validate_case.place_of(case.body.get("place"))
        if not place:
            continue
        variants = case.body.get("variants") or []
        values = case.variant_values(variants[0]["key"]) if variants else {}
        out.append({"key": key, "title": cl.substitute_all(case.body.get("title"), values),
                    "type": kind, "status": status, "place": place, "locale": case.locale})
    return out


@app.get("/public/awareness")
def visitor_awareness(response: Response, x_yazem_lang: str | None = Header(default=None),
                      accept_language: str | None = Header(default=None)) -> dict:
    locale = _visitor_locale(x_yazem_lang, accept_language)
    return _for_visitors("twin", ("awareness", locale), VISITOR_TTL["awareness"],
                         lambda conn: _awareness(conn, locale), response)


@app.get("/public/twin/accuracy")
def visitor_accuracy(response: Response) -> dict:
    """As a signed-in person sees it: the twin's own accuracy only while an
    administrator shows it to everyone."""
    return _for_visitors("twin", ("accuracy",), VISITOR_TTL["accuracy"],
                         lambda conn: _twin_accuracy(conn, False), response)


def _known_units(response: Response) -> tuple[set[int], set[int]]:
    """The units with a building on the map, and every unit in use, so that a
    visitor asking about a unit that is not there is told so from memory."""
    def make(conn):
        on_map = {r[0] for r in conn.execute(
            "SELECT DISTINCT unit_id FROM app.unit_location WHERE is_primary").fetchall()}
        in_use = {r[0] for r in conn.execute(
            "SELECT id FROM app.unit WHERE valid_to IS NULL").fetchall()}
        return on_map, in_use
    return _for_visitors("campus", ("known",), VISITOR_TTL["known"], make, response)


@app.get("/public/awareness/unit/{unit_id}")
def visitor_unit_awareness(unit_id: int, response: Response) -> dict:
    if unit_id not in _known_units(response)[0]:
        raise HTTPException(404, "no such unit on the map")
    return _for_visitors("units", ("unit", unit_id), VISITOR_TTL["unit"],
                         lambda conn: _unit_awareness(conn, unit_id), response)


@app.get("/public/board")
def visitor_board(response: Response, role: str = "all", unit_id: int | None = None,
                  x_yazem_lang: str | None = Header(default=None),
                  accept_language: str | None = Header(default=None)) -> dict:
    """The ranking for visitors, while it is open to them: only the people who
    agreed to be seen from outside the platform."""
    if role not in BOARD_ROLES:
        raise HTTPException(400, "unknown role")
    if unit_id is not None and unit_id not in _known_units(response)[1]:
        raise HTTPException(404, "no such unit")
    locale = _visitor_locale(x_yazem_lang, accept_language)
    return _for_visitors("board", ("board", role, unit_id, locale), VISITOR_TTL["board"],
                         lambda conn: _public_board(conn, role, unit_id, locale), response)


# ---------------------------------------------------------------------------
# Rare marks and medals
# ---------------------------------------------------------------------------

@app.get("/awards")
def my_awards(response: Response, user: Principal = Depends(current_user),
              conn: psycopg.Connection = Depends(db)) -> dict:
    """What there is to earn besides the level and the area levels, in its
    groups, and what this person holds and since when."""
    response.headers["Cache-Control"] = "no-store"
    return awards.catalogue(conn, user.locale, user.person_id)


@app.get("/awards/{code}/image")
def award_image(code: str, v: str | None = None, user: Principal = Depends(current_user),
                conn: psycopg.Connection = Depends(db)):
    """The picture an administrator uploaded for a mark or a medal."""
    return _award_picture(conn, code, v, "private")


@app.get("/public/awards")
def visitor_awards(response: Response, x_yazem_lang: str | None = Header(default=None),
                   accept_language: str | None = Header(default=None),
                   conn: psycopg.Connection = Depends(db)) -> dict:
    """The same list for someone who has not signed in, as the page on how the
    platform works shows it. Nobody's awards are in it. Not in the demo, where
    whatever is added is a visitor's doing."""
    if demo.active():
        raise HTTPException(404, "not_public")
    response.headers["Cache-Control"] = "public, max-age=300"
    response.headers["Vary"] = "X-Yazem-Lang, Accept-Language"
    return awards.catalogue(conn, _visitor_locale(x_yazem_lang, accept_language))


@app.get("/public/awards/{code}/image")
def visitor_award_image(code: str, v: str | None = None,
                        conn: psycopg.Connection = Depends(db)):
    if demo.active():
        raise HTTPException(404, "not_public")
    return _award_picture(conn, code, v, "public")


def _award_picture(conn: psycopg.Connection, code: str, v: str | None, scope: str) -> Response:
    found = awards.image_of(conn, code)
    if found is None:
        raise HTTPException(404, "image_not_available")
    data, media_type, version = found
    # The address carries the picture's version, so a browser may keep it for
    # good: a new picture comes with a new address.
    return Response(content=data, media_type=media_type, headers={
        "Cache-Control": (f"{scope}, max-age=31536000, immutable" if v == version
                          else f"{scope}, no-cache"),
        "ETag": f'"{version}"', "Content-Disposition": "inline"})


# ---------------------------------------------------------------------------
# Problem reports
# ---------------------------------------------------------------------------

REPORTS_PER_DAY = 5
REPORT_KINDS = ("answer_key", "source", "wording", "technical", "other")


class ReportIn(BaseModel):
    step_key: str | None = Field(default=None, max_length=40)
    kind: str = Field(pattern="^(" + "|".join(REPORT_KINDS) + ")$")
    body: str = Field(min_length=5, max_length=1000)


@app.post("/cases/{case_key}/report", status_code=201)
def report_problem(case_key: str, body: ReportIn, user: Principal = Depends(current_user),
                   conn: psycopg.Connection = Depends(db)) -> dict:
    """A person tells the administrators that something in a case is wrong.

    The report carries what was on the person's screen: the step, their variant
    and the version of the case that was live. The person is kept as their
    pseudonymous id; the panel shows only whether a student or staff member
    wrote it.
    """
    row = conn.execute(
        "SELECT id FROM app.case_registry WHERE case_key = %s", (case_key,)).fetchone()
    if row is None:
        raise HTTPException(404, "no such case")
    case_id = row[0]
    attempt = conn.execute(
        "SELECT id, variant_key, locale::text FROM app.attempt"
        " WHERE person_id = %s AND case_id = %s",
        (user.person_id, case_id)).fetchone()
    if attempt is None and not conn.execute(
            "SELECT app.case_open_for(%s, %s)", (case_id, user.person_id)).fetchone()[0]:
        raise HTTPException(403, "case not open for this person")
    case = cl.load_case(CASE_ROOT, case_key, user.locale, conn)
    step_ids = [s["id"] for s in case.body["steps"]]
    if body.step_key is not None and body.step_key not in step_ids:
        raise HTTPException(400, "unknown step")

    today = conn.execute(
        "SELECT count(*) FROM app.case_report WHERE person_id = %s AND created_at >= %s",
        (user.person_id, _local_midnight(conn))).fetchone()[0]
    if today >= REPORTS_PER_DAY:
        raise HTTPException(429, {"code": "report_limit", "limit": REPORTS_PER_DAY})
    if conn.execute(
            "SELECT 1 FROM app.case_report WHERE person_id = %s AND case_id = %s"
            " AND step_key IS NOT DISTINCT FROM %s AND state = 'open'",
            (user.person_id, case_id, body.step_key)).fetchone():
        raise HTTPException(409, {"code": "report_exists"})

    # The version on the person's screen: the one in the language they solve
    # the case in, when the case has versions in two.
    solved_in = attempt[2] if attempt else None
    version = conn.execute(
        "SELECT version FROM app.case_draft WHERE case_key = %s AND state = 'published'"
        " ORDER BY locale::text = %s DESC NULLS LAST, version DESC LIMIT 1",
        (case_key, solved_in)).fetchone()
    variant = attempt[1] if attempt else scoring.assign_variant(
        user.pseudonym, case_key, case.variant_keys)
    report_id = conn.execute(
        "INSERT INTO app.case_report (case_id, step_key, variant_key, case_version,"
        "  attempt_id, person_id, role_snap, kind, body)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s::app.person_role, %s::app.report_kind, %s)"
        " RETURNING id",
        (case_id, body.step_key, variant, version[0] if version else None,
         attempt[0] if attempt else None, user.person_id, user.role, body.kind,
         body.body.strip())).fetchone()[0]
    conn.commit()
    return {"id": report_id, "state": "open"}


@app.get("/me/reports")
def my_reports(user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """The person's own reports and what became of them."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT r.id, cr.case_key, cr.title_tr AS title, r.step_key, r.kind::text,"
            "       r.state::text, r.created_at, r.closed_at, r.close_note"
            " FROM app.case_report r JOIN app.case_registry cr ON cr.id = r.case_id"
            " WHERE r.person_id = %s ORDER BY r.created_at DESC LIMIT 50",
            (user.person_id,))
        rows = cur.fetchall()
    for r in rows:
        r["created_at"] = r["created_at"].isoformat()
        r["closed_at"] = r["closed_at"].isoformat() if r["closed_at"] else None
    return {"reports": rows, "per_day": REPORTS_PER_DAY}


# ---------------------------------------------------------------------------
# Case files
# ---------------------------------------------------------------------------

@app.get("/cases/{case_key}/files")
def case_files(case_key: str, user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """List the files this person may see right now.

    The database decides, through the same function the download uses, so a
    file cannot be listed here and refused there. Files not yet released are
    left out, since a withheld title is itself a hint about the answer.
    """
    rows = conn.execute(
        "SELECT id, step_key, title_tr, caption_tr, media_type, byte_size,"
        "       release_at::text"
        " FROM app.attachments_for(%s, %s)",
        (case_key, user.person_id),
    ).fetchall()
    return {"files": [
        {"id": r[0], "step": r[1], "title": r[2], "caption": r[3],
         "type": r[4], "bytes": r[5], "release": r[6]}
        for r in rows
    ]}


@app.get("/files/{file_id}")
def download_file(file_id: int, user: Principal = Depends(current_user),
                  conn: psycopg.Connection = Depends(db)):
    """Hand over one file, if this person has reached the point of seeing it.

    Every fetch is recorded. If a file that carried the answer turns out to have
    been released a step too early, "who saw it" has to be answerable.
    """
    visible = conn.execute(
        "SELECT app.attachment_visible(%s, %s)", (file_id, user.person_id)
    ).fetchone()[0]
    if not visible:
        # The same answer whether the file does not exist or is not yet
        # released, so probing ids tells a reader nothing.
        raise HTTPException(404, "file_not_available")

    row = conn.execute(
        "SELECT storage_key, media_type, title_tr FROM app.case_attachment WHERE id = %s",
        (file_id,),
    ).fetchone()

    conn.execute(
        "INSERT INTO audit.attachment_access (attachment_id, person_id) VALUES (%s, %s)",
        (file_id, user.person_id),
    )
    conn.commit()

    data = storage.fetch(row[0])
    return Response(
        content=data,
        media_type=row[1],
        headers={
            # inline: a PDF opens in the reader.
            "Content-Disposition": f'inline; filename="{file_id}"',
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


# ---------------------------------------------------------------------------
# Case pictures
# ---------------------------------------------------------------------------

@app.get("/cases/{case_key}/image")
def case_image(case_key: str, v: str | None = None,
               user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)):
    """The picture a case is shown with, for someone the case is open to.

    A weekly case is not shown before its week, so neither is its picture.
    Administrators see every picture, since they choose them.

    The address carries the picture's version, so the browser may keep it for
    good: a new picture comes with a new address.
    """
    if not case_images.KEY_SHAPE.match(case_key):
        raise HTTPException(404, "image_not_available")
    # As app.case_open_for, without waiting for the status to be refreshed: a
    # case whose time has come is open even if no list has been read since.
    allowed = conn.execute(
        "SELECT EXISTS (SELECT 1 FROM app.case_registry cr"
        "                WHERE cr.case_key = %s AND cr.publish_at <= now()"
        "                  AND app.case_targets_person(cr.id, %s))"
        "    OR EXISTS (SELECT 1 FROM app.admin_user"
        "                WHERE person_id = %s AND revoked_at IS NULL)",
        (case_key, user.person_id, user.person_id)).fetchone()[0]
    found = case_images.picture(conn, CASE_ROOT, case_key) if allowed else None
    if found is None:
        # The same answer whether there is no picture or it is not this
        # person's to see.
        raise HTTPException(404, "image_not_available")
    data, media_type, version = found
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Cache-Control": ("private, max-age=31536000, immutable" if v == version
                              else "private, no-cache"),
            "ETag": f'"{version}"',
            "Content-Disposition": "inline",
        },
    )


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------

@app.get("/landing")
def landing(response: Response) -> dict:
    """What the sign-in page shows before anyone has signed in: the
    announcements meant for everyone, and nothing else.

    Anyone can ask for this, so the database is asked at most once in a while
    and every other request is answered from memory. It also says whether the
    demo is open and which parts of the campus can be seen without signing
    in, so the page can offer them."""
    closed = {"campus": False, "twin": False, "units": False, "board": False}
    if demo.active():
        return {"announcements": [], "demo": demo.enabled(), "visitors": closed}
    try:
        shown = announcements.public(_connect)
        visitors = public_campus.shown(public_campus.switches(_connect))
    except psycopg.Error as exc:
        # The page still opens and people can still sign in; it shows no
        # announcements until the database answers again.
        log.warning("announcements not read: %s", type(exc).__name__)
        response.headers["Cache-Control"] = "no-store"
        return {"announcements": [], "demo": demo.enabled(), "visitors": closed}
    # Kept briefly, so a switch turned in the panel shows here soon after.
    response.headers["Cache-Control"] = "public, max-age=30"
    return {"announcements": shown, "demo": demo.enabled(), "visitors": visitors}


# ---------------------------------------------------------------------------
# The demo
# ---------------------------------------------------------------------------

class DemoEntry(BaseModel):
    password: str = Field(max_length=200)
    persona: Literal["student", "academic", "admin_staff", "admin"]


_demo_tries = _HourlyCount()


@app.get("/demo/status")
def demo_status(response: Response) -> dict:
    """Whether there is a demo. Asked inside the demo, also how far it is
    and whom a visitor can be."""
    response.headers["Cache-Control"] = "no-store"
    if not demo.active():
        return {"demo": False, "available": demo.enabled()}
    if not demo.enabled():
        return {"demo": True, "available": False, "ready": False, "personas": []}
    import demo_data
    state = demo.status()
    meta, personas = None, []
    try:
        with psycopg.connect(demo.dsn(), connect_timeout=5) as conn:
            meta = demo_data.meta(conn)
            if meta:
                ids = meta["personas"]
                rows = {r[0]: r for r in conn.execute(
                    "SELECT p.id, pp.given_name, pp.family_name, p.role::text, u.name_tr,"
                    "       coalesce(u.name_en, u.name_tr), p.avatar, t.label_tr, t.label_en"
                    " FROM app.person p JOIN identity.person_profile pp ON pp.person_id = p.id"
                    " LEFT JOIN app.unit u ON u.id = p.unit_id"
                    " LEFT JOIN app.academic_title t ON t.code = pp.title"
                    " WHERE p.id = ANY(%s)", (list(ids.values()),)).fetchall()}
                for key in demo.PERSONAS:
                    r = rows.get(ids.get(key))
                    if r is None:
                        continue
                    personas.append({"key": key, "given_name": r[1], "family_name": r[2],
                                     "role": r[3], "unit": {"tr": r[4], "en": r[5]},
                                     "avatar": r[6],
                                     "title": {"tr": r[7], "en": r[8]} if r[7] else None})
    except psycopg.Error as exc:
        # While the demo is first being made its database is not there yet.
        if state["status"] not in ("idle", "making"):
            log.warning("demo status not read: %s", type(exc).__name__)
    return {"demo": True, "available": True, "ready": bool(meta and personas),
            "status": state["status"], "error": state["error"] is not None,
            "made_at": meta.get("made_at") if meta else None,
            "launch": meta.get("launch") if meta else None,
            "people": meta.get("people") if meta else None,
            "personas": personas}


@app.post("/demo/enter")
def demo_enter(body: DemoEntry, request: Request, response: Response) -> dict:
    """The demo password, and the made-up person to be. Opens a demo visit."""
    if not demo.active():
        raise HTTPException(404, "not found")
    if not demo.enabled():
        raise HTTPException(404, "demo_off")
    client = request.client.host if request.client else "?"
    if _demo_tries(client) >= demo.TRIES_PER_HOUR:
        raise HTTPException(429, "too_many_tries")
    if not demo.password_ok(body.password):
        _demo_tries(client, add=True)
        raise HTTPException(401, "wrong_password")
    import demo_data
    with psycopg.connect(demo.dsn(), connect_timeout=5) as conn:
        meta = demo_data.meta(conn)
        person_id = (meta or {}).get("personas", {}).get(body.persona)
        if person_id is not None:
            # Visitors share the demo. Whatever another one did to this made-up
            # person from the panel, the next visitor to choose them can go on.
            conn.execute("UPDATE app.suspension SET lifted_at = now(), lift_note = 'demo'"
                         " WHERE person_id = %s AND lifted_at IS NULL", (person_id,))
            conn.execute("UPDATE app.person SET status = 'active'"
                         " WHERE id = %s AND status::text <> 'active'", (person_id,))
            conn.commit()
    if person_id is None:
        raise HTTPException(503, "demo_not_ready")
    set_session_cookie(response, person_id, in_demo=True)
    return {"status": "ok", "persona": body.persona}


@app.get("/announcements")
def my_announcements(response: Response, user: Principal = Depends(current_user),
                     conn: psycopg.Connection = Depends(db)) -> dict:
    """The announcements in force for this person. Not kept by the browser:
    the next person to sign in on the same computer may see different ones."""
    response.headers["Cache-Control"] = "no-store"
    return {"announcements": announcements.shown_to(
        conn, announcements.audiences_for(user.role), announcements.SHOWN_SIGNED_IN)}


@app.get("/awareness")
def campus_awareness(user: Principal = Depends(current_user),
                     conn: psycopg.Connection = Depends(db)) -> dict:
    """Where the campus stands, area by area.

    Published to everyone signed in, because the point of the programme is
    knowing where the institution is weak.

    Areas come back weakest first; that ordering is the finding.
    """
    return _awareness(conn, user.locale)


def _awareness(conn: psycopg.Connection, locale: str) -> dict:
    row = conn.execute("SELECT app.campus_awareness()").fetchone()[0]
    # An area answered by fewer people than the threshold is one or two
    # people's result, so its level is withheld until more people answer.
    floor_n = conn.execute("SELECT app.competence_threshold()").fetchone()[0]
    row["areas"] = row.get("areas") or []
    for area in row["areas"]:
        area["enough"] = area["people"] >= floor_n
        if not area["enough"]:
            area["level"] = None
    return {**row, "threshold": floor_n,
            "note": MESSAGES[locale]["map"]["no_unit_scores"]}


@app.get("/awareness/unit/{unit_id}")
def unit_awareness(unit_id: int, user: Principal = Depends(current_user),
                   conn: psycopg.Connection = Depends(db)) -> dict:
    """One unit, as a band against the campus and as its own weakest area.

    No number and no rank. Two units in the same band cannot be put in an
    order, which is the whole reason the band has three values.
    """
    return _unit_awareness(conn, unit_id)


def _unit_awareness(conn: psycopg.Connection, unit_id: int) -> dict:
    """The bands rest on the units' levels, worked out again first when they
    are older than a few minutes (unit_levels)."""
    unit_levels.refresh(conn)
    return conn.execute("SELECT app.unit_awareness(%s)", (unit_id,)).fetchone()[0]


# Per step and tenth of the sealed prediction, the sums the twin's accuracy is
# put together from once each prediction is read as a chance of success.
TWIN_ACCURACY_SQL = """
SELECT cr.case_key, cs.step_key, least(floor(sr.p_predicted * 10)::int, 9) AS tenth,
       count(*) AS n, sum(sr.p_predicted) AS sp, sum(sr.p_predicted ^ 2) AS spp,
       sum((sr.outcome_x >= %(success)s)::int) AS ss,
       sum(sr.p_predicted * (sr.outcome_x >= %(success)s)::int) AS sps
FROM app.step_result sr
JOIN app.case_step cs ON cs.id = sr.case_step_id
JOIN app.case_registry cr ON cr.id = cs.case_id
JOIN app.attempt a ON a.id = sr.attempt_id
JOIN app.person p ON p.id = a.person_id AND p.status = 'active'
WHERE sr.p_predicted IS NOT NULL
GROUP BY 1, 2, 3
"""

# Confidence against success per area, over every statement and over those
# above 50%, which say more than "I don't know" (calibration.floor_aware).
OVERCONFIDENCE_SQL = """
SELECT sr.dimension::text AS dimension, count(DISTINCT a.person_id) AS people,
       count(*) AS n, sum(sr.confidence_c) AS conf,
       sum((sr.outcome_x >= %(success)s)::int) AS hits,
       count(*) FILTER (WHERE sr.confidence_c > 0.5) AS n_above,
       coalesce(sum(sr.confidence_c) FILTER (WHERE sr.confidence_c > 0.5), 0) AS conf_above,
       coalesce(sum((sr.outcome_x >= %(success)s)::int)
                FILTER (WHERE sr.confidence_c > 0.5), 0) AS hits_above
FROM app.step_result sr JOIN app.attempt a ON a.id = sr.attempt_id
JOIN app.person p ON p.id = a.person_id AND p.status = 'active'
WHERE sr.confidence_c IS NOT NULL
GROUP BY 1
"""


def _mapped_accuracy(conn: psycopg.Connection, args: dict) -> dict | None:
    """The twin's accuracy on success, each prediction P read through the
    campus success map as q = A + B P; the sums per step and tenth give the
    sum of q and of (q - s)^2 without fetching every answer. The bins are
    tenths of q, each group of answers placed by its mean q, so that the
    reliability diagram and the decomposition describe q itself."""
    cells, kinds = success_map.current(conn, CASE_ROOT)
    bins: dict[int, list[float]] = {}
    squared = 0.0
    for case_key, step_key, tenth, n, sp, spp, ss, sps in conn.execute(
            TWIN_ACCURACY_SQL, args).fetchall():
        big_n, big_k = cells.get((kinds.get((case_key, step_key)), tenth), (0, 0))
        a = big_k / (big_n + success_map.PRIOR)
        b = success_map.PRIOR / (big_n + success_map.PRIOR)
        sp, spp, ss, sps = float(sp), float(spp), float(ss), float(sps)
        squared += (n * a * a + b * b * spp + ss + 2 * a * b * sp
                    - 2 * a * ss - 2 * b * sps)
        row = bins.setdefault(min(int((a + b * sp / n) * 10), 9), [0, 0.0, 0.0])
        row[0] += n
        row[1] += n * a + b * sp
        row[2] += ss
    if not bins:
        return None
    return calib.from_bins([calib.Bin(low=k / 10, high=(k + 1) / 10, n=v[0],
                                      forecast=v[1] / v[0], hit_rate=v[2] / v[0])
                            for k, v in sorted(bins.items())], squared)


@app.get("/twin/accuracy")
def twin_accuracy(response: Response, user: Principal = Depends(current_user),
                  conn: psycopg.Connection = Depends(db)) -> dict:
    """How well the twins predict the campus, and how sure the campus is of itself.

    The twin's accuracy is shown to everyone only while an administrator has
    switched it on; administrators always see it. Both parts wait for the
    reporting threshold of people.
    """
    response.headers["Cache-Control"] = "private, max-age=60"
    return _twin_accuracy(conn, _is_admin(conn, user.person_id))


def _twin_accuracy(conn: psycopg.Connection, is_admin: bool) -> dict:
    floor_n = conn.execute("SELECT app.competence_threshold()").fetchone()[0]
    public = _setting(conn, "twin_accuracy_public", False)
    people = conn.execute(
        "SELECT count(DISTINCT a.person_id) FROM app.step_result sr"
        " JOIN app.attempt a ON a.id = sr.attempt_id"
        " JOIN app.person p ON p.id = a.person_id AND p.status = 'active'").fetchone()[0]
    args = {"success": scoring.SUCCESS_THRESHOLD}

    twin = None
    if (public or is_admin) and people >= floor_n:
        twin = _mapped_accuracy(conn, args)

    areas = []
    for dimension, area_people, n, conf, hits, n_above, conf_above, hits_above in conn.execute(
            OVERCONFIDENCE_SQL, args).fetchall():
        basis = calib.floor_aware((n, float(conf), hits),
                                  (n_above, float(conf_above), hits_above))
        enough = area_people >= floor_n and basis is not None
        mean_conf, hit, used = basis if enough else (None, None, None)
        areas.append({"dimension": dimension, "people": area_people, "enough": enough,
                      "gap": mean_conf - hit if enough else None,
                      "confidence": round(mean_conf, 3) if enough else None,
                      "hit": round(hit, 3) if enough else None,
                      "n": used})
    return {"public": public, "threshold": floor_n, "people": people,
            "twin": twin, "areas": areas}


@app.get("/i18n/{locale}")
def messages(locale: str, response: Response) -> dict:
    if locale not in cl.SUPPORTED_LOCALES:
        raise HTTPException(404, "unsupported locale")
    response.headers["Cache-Control"] = "public, max-age=3600"
    return MESSAGES[locale]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_admin(conn: psycopg.Connection, person_id: int) -> bool:
    return conn.execute(
        "SELECT EXISTS (SELECT 1 FROM app.admin_user"
        " WHERE person_id = %s AND revoked_at IS NULL)", (person_id,)).fetchone()[0]


def _public_limits(state: dict) -> dict:
    return {k: v for k, v in state.items() if k != "session_key"}


def _limits(conn: psycopg.Connection, user: "Principal") -> dict:
    """The limits as the person sees them. Administrators are not limited, so
    they can try any case while preparing it."""
    return _public_limits(limits.state(conn, user.person_id, user.signed_in,
                                       exempt=_is_admin(conn, user.person_id)))


def _setting(conn: psycopg.Connection, key: str, default):
    row = conn.execute("SELECT value FROM app.platform_setting WHERE key = %s",
                       (key,)).fetchone()
    return default if row is None else row[0]


def _hash_code(code: str) -> bytes:
    return hmac.new(SESSION_SECRET, code.encode(), hashlib.sha256).digest()


def _within_rate_limit(conn: psycopg.Connection, email: str) -> bool:
    recent = conn.execute(
        "SELECT count(*) FROM identity.verification_code"
        " WHERE email_hash = %s AND created_at > now() - interval '1 hour'",
        (email_hash(email),),
    ).fetchone()[0]
    return recent < CODE_MAX_ATTEMPTS


def _debrief(case: cl.Case, variant_key: str, opened: bool) -> dict | None:
    """The solution note for a finisher, in their variant.

    The summary, the takeaway and the sources come right after the last step,
    when the explanation is most useful. The note for each step names that
    step's answer, so it comes with the correct answers, once the case is open.
    """
    debrief = case.body.get("debrief")
    if not debrief:
        return None
    if not opened:
        debrief = {k: v for k, v in debrief.items() if k != "per_step"}
    return cl.substitute_all(debrief, case.variant_values(variant_key))


def _values_for(case: cl.Case, user: "Principal", stored: str | None = None) -> dict:
    """The variant values a person sees in a case: the variant their attempt
    holds, or the one start_attempt will give them."""
    key = stored or scoring.assign_variant(user.pseudonym, case.key, case.variant_keys)
    try:
        return case.variant_values(key)
    except KeyError:
        return case.variant_values(case.variant_keys[0])


def _reveal_share(conn: psycopg.Connection, case_id: int) -> float:
    """How far a case is toward opening, from 0 to 1."""
    p = conn.execute("SELECT app.reveal_progress(%s)", (case_id,)).fetchone()[0]
    needed = max(int(p["min_answers"]),
                 math.ceil(float(p["min_share"]) * int(p["reach"])))
    return round(min(1.0, int(p["finished"]) / needed), 3) if needed else 1.0


def _reveal_open(conn: psycopg.Connection, case_id: int, check: bool = True) -> bool:
    """Whether the correct answers of a case may be shown.

    With check, the opening conditions are evaluated (and the opening recorded
    when one is met); without it only the recorded state is read.
    """
    if check:
        opened = conn.execute("SELECT app.reveal_open(%s)", (case_id,)).fetchone()[0]
        conn.commit()
        return bool(opened)
    return conn.execute("SELECT EXISTS (SELECT 1 FROM app.case_reveal"
                        " WHERE case_id = %s AND reason <> 'held')",
                        (case_id,)).fetchone()[0]


def _node_after(case, step_key: str, option_ids: list[str]) -> str:
    """Where a partly-walked path currently stands."""
    payload = case.step(step_key)["payload"]
    node = payload["start"]
    for option_id in option_ids:
        options = cl._find_node(payload, node).get("options") or []
        match = next((o for o in options if o["id"] == option_id), None)
        if match is None:
            raise HTTPException(400, cl.INVALID_PATH)
        node = match["next"]
    return node


def _plausible_name(name: str) -> bool:
    """A cheap check that only catches obvious filler."""
    if len(name) < 5 or " " not in name.strip():
        return False
    letters = [c for c in name.lower() if c.isalpha()]
    if not letters:
        return False
    # "aaa aaa" and friends
    return len(set(letters)) >= 3


def _flag(conn: psycopg.Connection, person_id: int, reason: str, detail: str) -> None:
    conn.execute(
        "INSERT INTO app.review_item (person_id, reason, detail)"
        " VALUES (%s, %s::app.review_reason, %s) ON CONFLICT DO NOTHING",
        (person_id, reason, detail),
    )


def _send_code(email: str, code: str, locale: str = "tr") -> None:
    mailer.send_code(email, code, locale, minutes=int(CODE_TTL.total_seconds() // 60))


def _encrypt_email(email: str) -> bytes:
    return mailer.encrypt_email(email)
