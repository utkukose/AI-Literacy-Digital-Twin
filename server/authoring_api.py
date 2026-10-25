"""Authoring endpoints: the case editor's back half.

The rules that decide whether a case is publishable are the ones in
validate_case.py, imported here so there is a single validator. The browser's
live checks are a convenience; this module is the gate.

The workflow itself lives in SQL (schema_003): who may submit, who may review,
and the rule that nobody reviews their own draft. Those are enforced by the
database whatever an interface does, and this module only reports what it is
told when a transition is refused.
"""

from __future__ import annotations

import copy
import hashlib
import io
import json
import re
import secrets
import zipfile
from pathlib import Path
from typing import Literal

import psycopg
import yaml
import case_check
import case_loader as cl
import messages_tr
import storage
import validate_case as vc
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from psycopg.rows import dict_row
from psycopg.types.json import Json
from pydantic import BaseModel, Field

from admin_api import WRITE_ROLES, Admin, current_admin, log, require_write
from api import CASE_ROOT, Principal, current_user, db, say

router = APIRouter(prefix="/authoring", tags=["authoring"])

MAX_UPLOAD = 15 * 1024 * 1024


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def check_body(body: dict, live: dict | None = None, locale: str | None = None,
               others: dict[str, list[dict]] | None = None) -> tuple[bool, list[dict]]:
    """Run the repository validator over a case held as JSON.

    validate_case works on a parsed mapping, so the editor's body goes through
    the identical checks a file would — including the one that refuses a case
    whose answer key has leaked into the payload sent to browsers. With `live`,
    the body is a new version of a case people are already solving, and the
    parts their attempts rely on must stay as they are. With `locale`, the body
    belongs to a draft in that language and must say so. With `others`, the
    case also exists in those languages: the two versions are one case with
    one difficulty estimate, so this one must keep their structure (see
    other_versions for what it is compared with).

    A body with a value of the wrong type somewhere raises
    validate_case.Unreadable: it is refused rather than saved.
    """
    rep = vc.Report("draft")
    if not isinstance(body, dict):
        return False, [{"level": "error", "where": "Vaka", "msg": "Vaka bir nesne olmalı.",
                        "where_en": "Case", "msg_en": "The case must be a mapping."}]
    vc.check_case(body, rep)
    errors = (revision_problems(body, live) if live is not None else []) + rep.errors
    if locale is not None and body.get("language") != locale:
        errors.append(f"language '{body.get('language')}' does not match the draft's"
                      f" language '{locale}'")
    warnings = list(rep.warnings)
    if others:
        errors += version_problems(body, others)
        warnings += untranslated(body, others)

    ids = step_ids_of(body)
    problems = [messages_tr.finding(m, ids, "error") for m in errors]
    problems += [messages_tr.finding(m, ids, "warn") for m in warnings]
    return not errors, problems


def checked(body: dict, live: dict | None = None, locale: str | None = None,
            ui: str = "tr", others: dict[str, list[dict]] | None = None) -> tuple[bool, list[dict]]:
    """check_body for a request: a body that cannot be read is answered with 400."""
    try:
        return check_body(body, live, locale, others)
    except vc.Unreadable as exc:
        raise HTTPException(400, say(ui, "Vaka kaydedilmedi. ", "The case was not saved. ")
                            + messages_tr.unreadable(exc.part, ui))


LANGUAGE_NAMES = {"tr": "Turkish", "en": "English"}


def version_problems(body: dict, others: dict[str, list[dict]]) -> list[str]:
    """Where a language version departs from the case's other versions.

    Wording may differ freely; what a person's answer is graded against may
    not: the steps, their kinds, areas and points, the variants, the place,
    and how many passages, items, options, reasons and rules each step has.
    A version agrees with another language when it matches either its live
    body or the new version of it being prepared.
    """
    out = []
    mine = vc._structure(body)
    for loc, candidates in sorted(others.items()):
        found = []
        for other in candidates:
            theirs = vc._structure(other)
            ids = list(dict.fromkeys([*step_ids_of(body), *step_ids_of(other)]))
            found.append([f"step {ids.index(k) + 1}" if k in ids else str(k)
                          for k in dict.fromkeys([*mine, *theirs])
                          if mine.get(k) != theirs.get(k)])
        if found and all(found):
            out.append(f"structure differs from the {LANGUAGE_NAMES.get(loc, loc)} version"
                       f" at: {', '.join(found[0])}")
    return out


def _texts(node, path: str = "") -> dict[str, str]:
    """The sentences of a case body that a translation rewrites, by their place.

    Names, addresses and other short values stay the same in every language,
    and so do references, which are cited as published; they are left out.
    The title is short but always written anew.
    """
    out: dict[str, str] = {}
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("id", "key", "kind", "dimension", "subtopics", "language", "type",
                     "status", "author", "reviewed_by", "sources", "scoring", "pattern",
                     "citation"):
                continue
            out.update(_texts(v, f"{path}.{k}" if path else str(k)))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out.update(_texts(v, f"{path}[{i}]"))
    elif isinstance(node, str) and (len(node.split()) >= 4 or path == "title"):
        out[path] = node.strip()
    return out


def _part(path: str) -> str:
    """The part of a case a text sits in: the title, the context, the
    variants, a step or the solution note."""
    step = re.match(r"steps\[(\d+)\]", path)
    if step:
        return f"step {int(step[1]) + 1}"
    head = re.split(r"[.\[]", path)[0]
    return {"debrief": "solution note"}.get(head, head)


def untranslated(body: dict, others: dict[str, list[dict]]) -> list[str]:
    """Texts still word for word as another language version has them: a
    translation begun from a copy of the case and not yet finished."""
    out = []
    mine = _texts(body)
    for loc, candidates in sorted(others.items()):
        theirs = _texts(candidates[0])
        same = [p for p, text in mine.items() if theirs.get(p) == text]
        if same:
            parts = list(dict.fromkeys(_part(p) for p in same))
            out.append(f"{len(same)} texts are the same as in the {LANGUAGE_NAMES.get(loc, loc)}"
                       f" version, in: {', '.join(parts)}")
    return out


def step_ids_of(body: dict) -> list[str]:
    steps = body.get("steps")
    return [s.get("id") for s in steps if isinstance(s, dict)] if isinstance(steps, list) else []


def revision_problems(body: dict, live: dict) -> list[str]:
    """What a new version of a live case may not change.

    An attempt in progress holds its variant and the number of steps answered,
    and a decision step is walked node by node, so the variant keys and the
    steps, in order and by kind, stay as they are. Wording, answer keys, sources
    and the solution note may change.
    """
    def items(case: dict, part: str) -> list[dict]:
        found = case.get(part)
        return [x for x in found if isinstance(x, dict)] if isinstance(found, list) else []

    out = []
    if body.get("id") != live.get("id"):
        out.append(f"the case id cannot change: {live.get('id')}")
    steps = [(s.get("id"), s.get("kind")) for s in items(body, "steps")]
    was = [(s.get("id"), s.get("kind")) for s in items(live, "steps")]
    if steps != was:
        out.append("the steps of a live case must keep their order and kind: "
                   + ", ".join(f"{i} ({k})" for i, k in was))
    keys = sorted(str(v.get("key")) for v in items(body, "variants"))
    had = sorted(str(v.get("key")) for v in items(live, "variants"))
    if keys != had:
        out.append("variant keys cannot change: " + ", ".join(had))
    return out


def live_body(conn: psycopg.Connection, case_key: str,
              locale: str | None = None) -> tuple[dict | None, int | None, int | None]:
    """The body people solve now, its draft version and draft id.

    A case published from the editor lives as a draft; the others are files,
    which have no version. Without `locale`, the case's Turkish version when
    it has one; with it, the version in that language only.
    """
    row = conn.execute(
        "SELECT body, version, id FROM app.case_draft"
        " WHERE case_key = %s AND state = 'published'"
        "   AND (%s::text IS NULL OR locale = %s::app.locale)"
        " ORDER BY locale = 'tr' DESC LIMIT 1", (case_key, locale, locale)).fetchone()
    if row is not None:
        return row[0], row[1], row[2]
    try:
        if locale is None:
            return cl.load_case(Path(CASE_ROOT), case_key, "tr").body, None, None
        return cl.load_case(Path(CASE_ROOT), case_key, locale, exact=True).body, None, None
    except cl.CaseNotFound:
        return None, None, None


def other_versions(conn: psycopg.Connection, case_key: str,
                   locale: str) -> dict[str, list[dict]]:
    """The case in its other live languages: for each, the live body and,
    when one is being prepared, the new version of it.

    A change to what answers are graded against is made in both languages,
    one draft at a time. Comparing with the other language's draft as well as
    its live body lets the second draft follow the first.
    """
    out = {}
    for other in cl.SUPPORTED_LOCALES:
        if other == locale:
            continue
        body, _, _ = live_body(conn, case_key, other)
        if body is None:
            continue
        out[other] = [body]
        pending = _open_draft(conn, case_key, other)
        if pending is not None:
            row = conn.execute("SELECT body FROM app.case_draft WHERE id = %s",
                               (pending["id"],)).fetchone()
            if row is not None and row[0] != body:
                out[other].append(row[0])
    return out


def language_of(body: dict | None) -> str:
    """The language a case body is written in."""
    found = (body or {}).get("language")
    return found if found in cl.SUPPORTED_LOCALES else cl.DEFAULT_LOCALE


def _next_version(conn: psycopg.Connection, case_key: str) -> int:
    return conn.execute(
        "SELECT coalesce(max(version), 0) + 1 FROM app.case_draft"
        " WHERE case_key = %s", (case_key,)).fetchone()[0]


def _open_draft(conn: psycopg.Connection, case_key: str,
                locale: str | None = None) -> dict | None:
    """The unfinished version of a case, in one language when `locale` is
    given. Each language version is corrected on its own, one at a time."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT d.id, d.created_by, d.state::text, d.locale::text,"
            "       app.public_name(d.created_by) AS author"
            " FROM app.case_draft d"
            " WHERE d.case_key = %s AND (%s::text IS NULL OR d.locale = %s::app.locale)"
            "   AND d.state IN ('draft', 'in_review', 'changes_requested', 'approved')"
            " ORDER BY d.id DESC LIMIT 1", (case_key, locale, locale))
        return cur.fetchone()


def _no_draft(locale: str) -> HTTPException:
    return HTTPException(404, say(locale, "Böyle bir taslak yok.", "There is no such draft."))


def _load(conn: psycopg.Connection, draft_id: int, locale: str = "tr") -> dict:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT id, case_key, locale::text, version, state::text, body, problems,"
            "       valid, created_by, reviewed_by, review_note, origin, base_version"
            " FROM app.case_draft WHERE id = %s", (draft_id,))
        row = cur.fetchone()
    if row is None:
        raise _no_draft(locale)
    return row


def _readable(draft: dict, user: Principal) -> dict:
    """A draft is its author's until it is sent for review; after that the
    whole team reads it, as the list shows it."""
    if draft["created_by"] != user.person_id and draft["state"] == "draft":
        raise _no_draft(user.locale)
    return draft


def _author(conn: psycopg.Connection, user: Principal) -> str:
    row = conn.execute(
        "SELECT role::text FROM app.case_author"
        " WHERE person_id = %s AND revoked_at IS NULL", (user.person_id,)).fetchone()
    if row is None:
        raise HTTPException(403, say(user.locale, "Vaka yazarı olarak kayıtlı değilsin.",
                                     "You are not registered as a case author."))
    return row[0]


# ---------------------------------------------------------------------------
# Drafts
# ---------------------------------------------------------------------------

@router.get("/drafts")
def list_drafts(mine: bool = False, state: str | None = None,
                user: Principal = Depends(current_user),
                conn: psycopg.Connection = Depends(db)) -> list[dict]:
    """A contributor sees their own work and anything waiting to be reviewed.

    A case in review is the whole team's problem, so everyone sees it.
    """
    role = _author(conn, user)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT id, case_key, locale::text, version, state::text, valid, title, type,"
            "       steps, problems, author_name, reviewer_name, updated_at, review_note,"
            "       origin, base_version, created_by = %(me)s AS mine"
            " FROM app.v_case_draft_list"
            " WHERE (%(mine)s::boolean IS NOT TRUE OR created_by = %(me)s)"
            "   AND (%(state)s::text IS NULL OR state = %(state)s::app.draft_state)"
            "   AND (created_by = %(me)s OR state <> 'draft')"
            " ORDER BY updated_at DESC",
            {"mine": mine, "me": user.person_id, "state": state})
        rows = cur.fetchall()
    return [dict(r, can_review=(role == "reviewer" and r["state"] == "in_review")) for r in rows]


class DraftIn(BaseModel):
    # A key names a case and may encode a week (2026-W38-...); validate_case
    # requires core cases to use the core-NN-... form.
    case_key: str = Field(pattern=r"^[a-z0-9][A-Za-z0-9-]{4,60}$")
    locale: str = Field(default="tr", pattern="^(tr|en)$")
    body: dict


@router.post("/drafts", status_code=201)
def create_draft(payload: DraftIn, user: Principal = Depends(current_user),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    """Start a new case. A key that names a case already in the bank is refused:
    a live case is changed through a revision, which keeps its attempts intact."""
    _author(conn, user)
    live, _, _ = live_body(conn, payload.case_key)
    if live is not None or conn.execute(
            "SELECT 1 FROM app.case_draft WHERE case_key = %s", (payload.case_key,)).fetchone():
        raise HTTPException(409, say(
            user.locale,
            "Bu kimlikle bir vaka zaten var. Var olan bir vakayı değiştirmek için onu"
            " düzenlemeye aç.",
            "A case with this key already exists. To change an existing case, open it"
            " for editing."))
    valid, problems = checked(payload.body, locale=payload.locale, ui=user.locale)
    row = conn.execute(
        "INSERT INTO app.case_draft (case_key, locale, body, problems, valid, created_by)"
        " VALUES (%s, %s::app.locale, %s, %s, %s, %s)"
        " RETURNING id, version",
        (payload.case_key, payload.locale, Json(payload.body), Json(problems),
         valid, user.person_id)).fetchone()
    conn.commit()
    return {"id": row[0], "version": row[1], "valid": valid, "problems": problems}


@router.get("/drafts/{draft_id}")
def read_draft(draft_id: int, user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """A draft with its files, and for a new version of a live case, the live
    body it would replace, so the two can be compared."""
    role = _author(conn, user)
    draft = _readable(_load(conn, draft_id, user.locale), user)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT id, step_key, release_at::text, ordinal, title_tr, caption_tr,"
            "       media_type, byte_size, scan_state::text"
            " FROM app.case_attachment WHERE draft_id = %s ORDER BY ordinal, id",
            (draft_id,))
        draft["files"] = cur.fetchall()
        cur.execute(
            "SELECT app.public_name(%s) AS author, app.public_name(%s) AS reviewer",
            (draft["created_by"], draft["reviewed_by"]))
        names = cur.fetchone()
        # What people reported about the case, so a correction can answer it.
        # The reports carry no names.
        cur.execute(
            "SELECT r.id, r.step_key, r.variant_key, r.kind::text, r.body, r.created_at::text"
            " FROM app.case_report r JOIN app.case_registry cr ON cr.id = r.case_id"
            " WHERE cr.case_key = %s AND r.state = 'open' ORDER BY r.created_at",
            (draft["case_key"],))
        draft["reports"] = cur.fetchall()
    draft["author_name"] = names["author"]
    draft["reviewer_name"] = names["reviewer"]
    draft["mine"] = draft["created_by"] == user.person_id
    draft["can_review"] = (role == "reviewer" and draft["state"] == "in_review"
                           and not draft["mine"])
    live, live_version, _ = live_body(conn, draft["case_key"], draft["locale"])
    draft["live"] = live if draft["state"] not in ("published", "retired") else None
    draft["live_version"] = live_version
    # The same case in its other language, shown beside each text so a
    # translation can be written, and both versions kept saying the same.
    others = other_versions(conn, draft["case_key"], draft["locale"])
    pick = "tr" if "tr" in others else next(iter(others), None)
    draft["counterpart"] = {"locale": pick, "body": others[pick][0]} if pick else None
    # A version in a language the case is not yet published in.
    draft["translation"] = live is None and bool(others)
    return draft


def _save_body(conn: psycopg.Connection, draft: dict, body: dict, user: Principal) -> dict:
    """Save whatever is on screen, valid or not.

    A draft with problems is saved so the work is not lost; it simply cannot be
    submitted.
    """
    if draft["created_by"] != user.person_id:
        raise HTTPException(403, say(user.locale, "Taslağı yalnızca yazarı değiştirebilir.",
                                     "Only its author can change a draft."))
    if draft["state"] in ("published", "retired"):
        raise HTTPException(409, say(
            user.locale,
            "Yayımlanmış bir sürüm değiştirilemez. Değiştirmek için vakanın yeni bir sürümünü aç.",
            "A published version cannot be changed. Open a new version of the case to change it."))
    if draft["state"] in ("in_review", "approved"):
        raise HTTPException(409, say(
            user.locale, "İncelemedeki ya da onaylanmış bir taslak değiştirilemez.",
            "A draft in review or approved cannot be changed."))
    live, _, _ = live_body(conn, draft["case_key"], draft["locale"])
    others = other_versions(conn, draft["case_key"], draft["locale"])
    valid, problems = checked(body, live, draft["locale"], user.locale, others)
    conn.execute(
        "UPDATE app.case_draft SET body = %s, problems = %s, valid = %s,"
        "  state = CASE WHEN state = 'changes_requested' THEN 'draft'::app.draft_state"
        "               ELSE state END"
        " WHERE id = %s",
        (Json(body), Json(problems), valid, draft["id"]))
    conn.commit()
    return {"valid": valid, "problems": problems}


@router.put("/drafts/{draft_id}")
def save_draft(draft_id: int, payload: dict, user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    _author(conn, user)
    return _save_body(conn, _load(conn, draft_id, user.locale), payload, user)


class _CaseDumper(yaml.SafeDumper):
    """Writes a case the way the repository's files are written: a text that
    runs over several lines as a block, so it reads and edits as written."""


def _text(dumper: yaml.SafeDumper, data: str):
    # The emitter falls back to a quoted string when a block cannot hold the
    # text exactly, for instance with spaces at the end of a line.
    style = "|" if "\n" in data else None
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)


_CaseDumper.add_representer(str, _text)


def as_yaml(body: dict) -> str:
    return yaml.dump(body, Dumper=_CaseDumper, allow_unicode=True, sort_keys=False, width=100)


@router.get("/drafts/{draft_id}/yaml")
def draft_yaml(draft_id: int, user: Principal = Depends(current_user),
               conn: psycopg.Connection = Depends(db)) -> dict:
    """The draft as the YAML a case file holds, for editing every field directly."""
    _author(conn, user)
    return {"text": as_yaml(_readable(_load(conn, draft_id, user.locale), user)["body"])}


class YamlText(BaseModel):
    text: str = Field(max_length=200_000)


@router.put("/drafts/{draft_id}/yaml")
def save_draft_yaml(draft_id: int, payload: YamlText, user: Principal = Depends(current_user),
                    conn: psycopg.Connection = Depends(db)) -> dict:
    _author(conn, user)
    try:
        body = yaml.load(payload.text, Loader=NoAliases)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        where = say(user.locale, f" (satır {mark.line + 1})",
                    f" (line {mark.line + 1})") if mark else ""
        problem = getattr(exc, "problem", exc)
        if problem == ALIASES_REFUSED:
            problem = say(user.locale, "YAML takma adları (alias) kullanılamaz", problem)
        raise HTTPException(400, say(user.locale, "YAML okunamadı", "The YAML could not be read")
                            + f"{where}: {problem}")
    if not isinstance(body, dict):
        raise HTTPException(400, say(user.locale, "YAML bir vaka nesnesi olmalı.",
                                     "The YAML must describe a case."))
    return _save_body(conn, _load(conn, draft_id, user.locale), body, user)


@router.post("/cases/{case_key}/revise", status_code=201)
def revise_case(case_key: str, locale: Literal["tr", "en"] | None = None,
                user: Principal = Depends(current_user),
                conn: psycopg.Connection = Depends(db)) -> dict:
    """Open a live case for correction, as a new version of it.

    The new version goes through the same review and publishing as a new case;
    until then people keep solving the live one. Only one unfinished version of
    a case exists at a time in each language, so a second request returns the
    one already open. With `locale`, the version in that language is opened;
    without it, the Turkish one when the case has it.
    """
    role = _author(conn, user)
    live, version, live_draft = live_body(conn, case_key, locale)
    if live is None:
        raise HTTPException(404, "no such case")
    locale = locale or language_of(live)
    open_draft = _open_draft(conn, case_key, locale)
    if open_draft is not None:
        return {"id": open_draft["id"], "existing": True, "state": open_draft["state"],
                "mine": open_draft["created_by"] == user.person_id,
                "author": open_draft["author"]}
    _may_open(conn, case_key, role, user)
    valid, problems = checked(live, live, locale, user.locale,
                              other_versions(conn, case_key, locale))
    draft_id = conn.execute(
        "INSERT INTO app.case_draft (case_key, locale, version, body, problems, valid,"
        "  created_by, origin, base_version)"
        " VALUES (%s, %s::app.locale, %s, %s, %s, %s, %s, 'revision', %s) RETURNING id",
        (case_key, locale, _next_version(conn, case_key), Json(live), Json(problems), valid,
         user.person_id, version or 0)).fetchone()[0]
    if live_draft is not None:
        _copy_files(conn, live_draft, draft_id)
    conn.commit()
    return {"id": draft_id, "existing": False, "state": "draft", "mine": True}


def _may_open(conn: psycopg.Connection, case_key: str, role: str, user: Principal) -> None:
    """A new version starts from the live body, answers included, so it is
    opened by a reviewer or by someone who has written a version of this case."""
    if role != "reviewer" and conn.execute(
            "SELECT 1 FROM app.case_draft WHERE case_key = %s AND created_by = %s LIMIT 1",
            (case_key, user.person_id)).fetchone() is None:
        raise HTTPException(403, say(
            user.locale,
            "Yayındaki bir vakayı inceleyenler ya da vakanın yazarı düzeltmeye açabilir.",
            "A live case can be opened for correction by a reviewer or by its author."))


class Translation(BaseModel):
    locale: Literal["tr", "en"]


@router.post("/cases/{case_key}/translate", status_code=201)
def translate_case(case_key: str, payload: Translation,
                   user: Principal = Depends(current_user),
                   conn: psycopg.Connection = Depends(db)) -> dict:
    """Open a version of a case in another language, as a draft of the same case.

    The draft begins as a copy of the case in the language it has, so every
    step, answer and number is already in place and only the texts are to be
    written in the new language. It is reviewed and published like any other
    version. Once published the case is offered in both languages and is still
    one case: whoever solves either version has solved it.
    """
    role = _author(conn, user)
    locale = payload.locale
    open_draft = _open_draft(conn, case_key, locale)
    if open_draft is not None:
        return {"id": open_draft["id"], "existing": True, "state": open_draft["state"],
                "mine": open_draft["created_by"] == user.person_id,
                "author": open_draft["author"]}
    if live_body(conn, case_key, locale)[0] is not None:
        raise HTTPException(409, say(
            user.locale,
            "Bu vakanın bu dildeki sürümü zaten var. Değiştirmek için o sürümü düzenlemeye aç.",
            "This case already has a version in that language. To change it, open that"
            " version for editing."))
    others = other_versions(conn, case_key, locale)
    if not others:
        raise HTTPException(404, "no such case")
    _may_open(conn, case_key, role, user)
    source_locale = "tr" if "tr" in others else next(iter(others))
    body = copy.deepcopy(others[source_locale][0])
    body["language"] = locale
    valid, problems = checked(body, None, locale, user.locale, others)
    draft_id = conn.execute(
        "INSERT INTO app.case_draft (case_key, locale, version, body, problems, valid,"
        "  created_by, origin)"
        " VALUES (%s, %s::app.locale, %s, %s, %s, %s, %s, 'translation') RETURNING id",
        (case_key, locale, _next_version(conn, case_key), Json(body), Json(problems), valid,
         user.person_id)).fetchone()[0]
    source_draft = live_body(conn, case_key, source_locale)[2]
    if source_draft is not None:
        _copy_files(conn, source_draft, draft_id)
    conn.commit()
    return {"id": draft_id, "existing": False, "state": "draft", "mine": True,
            "source_locale": source_locale}


def _copy_files(conn: psycopg.Connection, source: int, target: int) -> None:
    """Give a new version its own copy of the live version's files, so deleting
    one from the draft cannot take the bytes the live case still serves."""
    rows = conn.execute(
        "SELECT step_key, release_at, ordinal, title_tr, caption_tr, storage_key,"
        "       media_type, byte_size, sha256, scan_state, scanned_at, uploaded_by"
        " FROM app.case_attachment WHERE draft_id = %s ORDER BY ordinal, id",
        (source,)).fetchall()
    for (step_key, release_at, ordinal, title, caption, key, media, size, digest,
         scan, scanned, uploader) in rows:
        new_key = f"drafts/{target}/{digest.hex()[:12]}-{secrets.token_hex(4)}"
        storage.put(new_key, storage.fetch(key))
        conn.execute(
            "INSERT INTO app.case_attachment (draft_id, step_key, release_at, ordinal,"
            "  title_tr, caption_tr, storage_key, media_type, byte_size, sha256,"
            "  scan_state, scanned_at, uploaded_by)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (target, step_key, release_at, ordinal, title, caption, new_key, media, size,
             digest, scan, scanned, uploader))


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

ALIASES_REFUSED = "aliases cannot be used"


class NoAliases(yaml.SafeLoader):
    """YAML without anchors and aliases. A case never needs them, and a few
    lines of them can expand into more text than the server can hold."""

    def compose_node(self, parent, index):
        if self.check_event(yaml.events.AliasEvent):
            event = self.peek_event()
            raise yaml.composer.ComposerError(
                None, None, ALIASES_REFUSED, event.start_mark)
        return super().compose_node(parent, index)


MAX_IMPORT = 5 * 1024 * 1024
MAX_IMPORT_CASES = 200
KEY_SHAPE = re.compile(r"^[a-z0-9][A-Za-z0-9-]{4,60}$")


def _case_files(name: str, data: bytes, ui: str = "tr") -> list[tuple[str, bytes]]:
    """The case files in one upload: the file itself, or the members of a zip."""
    lower = name.lower()
    if lower.endswith(".zip"):
        try:
            archive = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile:
            raise ValueError(say(ui, "Zip dosyası açılamadı.", "The zip file could not be opened."))
        members = [m for m in archive.infolist() if not m.is_dir()
                   and m.filename.lower().endswith((".yaml", ".yml", ".json"))
                   and not Path(m.filename).name.startswith(".")]
        if sum(m.file_size for m in members) > MAX_IMPORT:
            raise ValueError(say(ui, "Zip dosyasının içi 5 MB'ı aşıyor.",
                                 "The zip file holds more than 5 MB."))
        try:
            return [(m.filename, archive.read(m)) for m in members]
        except (zipfile.BadZipFile, RuntimeError, NotImplementedError, OSError):
            raise ValueError(say(ui, "Zip dosyasındaki bir dosya okunamadı.",
                                 "A file in the zip could not be read."))
    if lower.endswith((".yaml", ".yml", ".json")):
        return [(name, data)]
    raise ValueError(say(ui, "Yalnızca .yaml, .yml, .json ya da .zip dosyası alınır.",
                         "Only .yaml, .yml, .json or .zip files are accepted."))


def _parse(name: str, data: bytes, ui: str = "tr") -> dict:
    text = data.decode("utf-8")
    if name.lower().endswith(".json"):
        body = json.loads(text)
    else:
        body = yaml.load(text, Loader=NoAliases)
    if not isinstance(body, dict):
        raise ValueError(say(ui, "Dosyada bir vaka nesnesi yok.", "The file holds no case."))
    return body


@router.post("/import")
async def import_cases(uploads: list[UploadFile] = File(...),
                       admin: Admin = Depends(current_admin),
                       user: Principal = Depends(current_user),
                       conn: psycopg.Connection = Depends(db)) -> dict:
    """Bring case files written outside the platform in as drafts.

    Each file is checked by the same validator as the editor and answered once
    in every variant, as the repository's checks do. A file that passes goes
    straight to review; one that does not is kept as a draft with its problems
    listed, to be corrected in the editor. A file whose key names a live case
    becomes a new version of it. Nothing is published here: a second person
    reviews, an administrator publishes.
    """
    require_write(admin)
    _author(conn, user)
    results = []
    count = 0
    ui = user.locale
    for upload in uploads:
        data = await upload.read(MAX_IMPORT + 1)
        name = upload.filename or say(ui, "dosya", "file")
        try:
            if len(data) > MAX_IMPORT:
                raise ValueError(say(ui, "Dosya 5 MB'ı aşıyor.", "The file is larger than 5 MB."))
            files = _case_files(name, data, ui)
        except ValueError as exc:
            results.append({"file": name, "status": "rejected", "problems": [str(exc)]})
            continue
        for member, raw in files:
            count += 1
            if count > MAX_IMPORT_CASES:
                results.append({"file": member, "status": "rejected", "problems": [say(
                    ui, f"Bir seferde en çok {MAX_IMPORT_CASES} vaka alınır.",
                    f"At most {MAX_IMPORT_CASES} cases are taken at a time.")]})
                continue
            results.append(_import_one(conn, member, raw, user))
    log(conn, admin, "import_cases", "app.case_draft", None, None,
        {"files": len(results),
         "in_review": sum(r["status"] == "in_review" for r in results),
         "draft": sum(r["status"] == "draft" for r in results),
         "rejected": sum(r["status"] == "rejected" for r in results)})
    conn.commit()
    return {"results": results}


def _import_one(conn: psycopg.Connection, name: str, raw: bytes, user: Principal) -> dict:
    ui = user.locale
    try:
        body = _parse(name, raw, ui)
    except (ValueError, UnicodeDecodeError, yaml.YAMLError, json.JSONDecodeError) as exc:
        return {"file": name, "status": "rejected",
                "problems": [say(ui, "Dosya okunamadı: ", "The file could not be read: ")
                             + str(exc)]}
    key = body.get("id")
    if not isinstance(key, str) or not KEY_SHAPE.match(key):
        return {"file": name, "status": "rejected", "problems": [say(
            ui, "Vakanın kimliği (id) küçük harf ya da rakamla başlamalı ve yalnızca harf, rakam"
                " ve tire içermeli.",
            "The case's id must start with a lowercase letter or a digit and contain only"
            " letters, digits and hyphens.")]}
    locale = body.get("language", "tr")
    if locale not in cl.SUPPORTED_LOCALES:
        return {"file": name, "key": key, "status": "rejected", "problems": [say(
            ui, "Vakanın dili (language) tr ya da en olmalı.",
            "The case's language must be tr or en.")]}
    open_draft = _open_draft(conn, key, locale)
    if open_draft is not None:
        return {"file": name, "key": key, "status": "rejected", "problems": [say(
            ui, f"Bu vakanın bu dilde açık bir taslağı var (#{open_draft['id']}). Önce o"
                " taslak yayımlanmalı ya da kaldırılmalı.",
            f"This case has an open draft in this language (#{open_draft['id']}). That"
            " draft must be published or set aside first.")]}

    # A file in a language the case already has is a new version of that
    # language's text. A file in a language it does not have yet becomes the
    # case's version in that language: the same case, which must keep the
    # structure of the versions it already has.
    live, version, _ = live_body(conn, key, locale)
    others = other_versions(conn, key, locale)
    try:
        valid, problems = check_body(body, live, locale, others)
    except vc.Unreadable as exc:
        return {"file": name, "key": key, "status": "rejected",
                "problems": [messages_tr.unreadable(exc.part, ui)]}
    if valid:
        ids = step_ids_of(body)
        try:
            problems += [messages_tr.finding(m, ids) for m in case_check.problems(body)]
        except (KeyError, ValueError, TypeError, IndexError) as exc:
            problems.append(messages_tr.finding(f"the case could not be answered: {exc}", ids))
        valid = not any(p["level"] == "error" for p in problems)

    with conn.transaction():
        draft_id = conn.execute(
            "INSERT INTO app.case_draft (case_key, locale, version, body, problems, valid,"
            "  created_by, origin, base_version)"
            " VALUES (%s, %s::app.locale, %s, %s, %s, %s, %s, 'import', %s) RETURNING id",
            (key, locale, _next_version(conn, key), Json(body), Json(problems), valid,
             user.person_id, (version or 0) if live is not None else None)).fetchone()[0]
        if valid:
            conn.execute("SELECT app.submit_draft(%s, %s)", (draft_id, user.person_id))
    return {"file": name, "key": key, "title": body.get("title"), "draft_id": draft_id,
            "status": "in_review" if valid else "draft", "revision": live is not None,
            "translation": live is None and bool(others),
            "locale": locale, "problems": [messages_tr.line(p, ui) for p in problems]}


class Note(BaseModel):
    note: str | None = None


# The workflow functions refuse in English; a person using the Turkish
# interface reads Turkish.
WORKFLOW_TR = {
    "no such draft": "Böyle bir taslak yok.",
    "only the author submits a draft": "Taslağı yalnızca yazarı incelemeye gönderebilir.",
    "draft is not in a submittable state": "Bu taslak şu an incelemeye gönderilemez.",
    "draft has unresolved problems": "Taslakta düzeltilmesi gereken hatalar var.",
    "draft is not in review": "Bu taslak incelemede değil.",
    "a draft cannot be reviewed by its author": "Kendi yazdığın taslağı inceleyemezsin.",
    "not a reviewer": "İnceleme yetkin yok.",
    "changes requested must carry a note": "Düzeltme isterken neyin düzeltileceğini yaz.",
    "only an approved draft publishes": "Yalnızca onaylanmış bir taslak yayımlanabilir.",
}


def _refusal(exc: Exception, locale: str = "tr") -> str:
    text = str(exc).splitlines()[0]
    if locale == "en":
        return text[:1].upper() + text[1:] + ("" if text.endswith(".") else ".")
    return WORKFLOW_TR.get(text, text)


@router.post("/drafts/{draft_id}/submit")
def submit_draft(draft_id: int, user: Principal = Depends(current_user),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    _author(conn, user)

    # Files still being scanned are a reason to wait; the message tells the
    # writer how many are pending and how many were rejected.
    ready = conn.execute("SELECT * FROM app.attachments_ready(%s)", (draft_id,)).fetchone()
    if ready and not ready[0]:
        raise HTTPException(409, say(
            user.locale, f"{ready[1]} dosya taranıyor, {ready[2]} dosya reddedildi.",
            f"{ready[1]} files are being scanned, {ready[2]} were rejected."))

    try:
        conn.execute("SELECT app.submit_draft(%s, %s)", (draft_id, user.person_id))
    except psycopg.errors.RaiseException as exc:
        conn.rollback()
        raise HTTPException(409, _refusal(exc, user.locale))
    conn.commit()
    return {"state": "in_review"}


class Review(BaseModel):
    approve: bool
    note: str | None = None


@router.post("/drafts/{draft_id}/review")
def review_draft(draft_id: int, body: Review, user: Principal = Depends(current_user),
                 conn: psycopg.Connection = Depends(db)) -> dict:
    _author(conn, user)
    try:
        conn.execute("SELECT app.review_draft(%s, %s, %s, %s)",
                     (draft_id, user.person_id, body.approve, body.note))
    except psycopg.errors.RaiseException as exc:
        conn.rollback()
        raise HTTPException(409, _refusal(exc, user.locale))
    conn.commit()
    return {"state": "approved" if body.approve else "changes_requested"}


@router.post("/drafts/{draft_id}/discard")
def discard_draft(draft_id: int, user: Principal = Depends(current_user),
                  conn: psycopg.Connection = Depends(db)) -> dict:
    """Set aside a draft that will not be finished.

    Only one unfinished version of a case is open at a time, so a forgotten one
    would keep the case from being corrected. Its author may set it aside while
    it is still theirs to edit; an administrator may do so at any point before
    it is published. The draft is kept, marked retired, with the event logged.
    """
    draft = _load(conn, draft_id, user.locale)
    admin_role = conn.execute(
        "SELECT admin_role::text FROM app.admin_user WHERE person_id = %s AND revoked_at IS NULL",
        (user.person_id,)).fetchone()
    is_admin = admin_role is not None and admin_role[0] in WRITE_ROLES
    own = (draft["created_by"] == user.person_id
           and draft["state"] in ("draft", "changes_requested"))
    open_states = ("draft", "in_review", "changes_requested", "approved")
    if not own and not (is_admin and draft["state"] in open_states):
        raise HTTPException(403, say(
            user.locale,
            "Bu taslağı incelemeye gönderilmeden önce yazarı, yayımlanmadan önce de bir"
            " yönetici kaldırabilir.",
            "Its author can set this draft aside before it goes to review, and an"
            " administrator before it is published."))
    conn.execute("UPDATE app.case_draft SET state = 'retired' WHERE id = %s", (draft_id,))
    conn.execute(
        "INSERT INTO app.case_draft_event (draft_id, from_state, to_state, actor_id, note)"
        " VALUES (%s, %s::app.draft_state, 'retired', %s, 'kaldırıldı')",
        (draft_id, draft["state"], user.person_id))
    conn.commit()
    return {"state": "retired"}


@router.post("/drafts/{draft_id}/publish")
def publish_draft(draft_id: int, admin: Admin = Depends(current_admin),
                  conn: psycopg.Connection = Depends(db)) -> dict:
    """Publishing is an administrator's act.

    Approval says the case is sound; publishing says the programme wants it out
    this week, to these people. Two different decisions, two different people.
    """
    require_write(admin)
    try:
        row = conn.execute("SELECT app.publish_draft(%s, %s)",
                           (draft_id, admin.person_id)).fetchone()
    except psycopg.errors.RaiseException as exc:
        conn.rollback()
        raise HTTPException(409, _refusal(exc, admin.locale))
    conn.commit()
    return {"case_id": row[0]}


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

@router.post("/drafts/{draft_id}/files", status_code=201)
async def upload_file(draft_id: int,
                      title: str = Form(...),
                      release_at: str = Form("with_case"),
                      step_key: str | None = Form(None),
                      caption: str | None = Form(None),
                      upload: UploadFile = File(...),
                      user: Principal = Depends(current_user),
                      conn: psycopg.Connection = Depends(db)) -> dict:
    """Take a file, hash it, and hold it pending a scan.

    The declared content type is not trusted: it is checked against the table of
    accepted types and against the file's own leading bytes.
    """
    _author(conn, user)
    ui = user.locale
    draft = _load(conn, draft_id, ui)
    if draft["created_by"] != user.person_id:
        raise HTTPException(403, say(ui, "Taslağa yalnızca yazarı dosya ekleyebilir.",
                                     "Only its author can add files to a draft."))
    # A file added after review would reach students unread.
    if draft["state"] not in EDITABLE:
        raise HTTPException(409, say(ui, "Dosya yalnızca taslak düzenlenirken eklenebilir.",
                                     "Files can be added only while the draft is being edited."))
    if release_at not in RELEASES:
        raise HTTPException(400, say(ui, "Dosyanın ne zaman gösterileceği anlaşılamadı.",
                                     "The file's release time was not recognised."))

    allowed = conn.execute(
        "SELECT max_bytes FROM app.attachment_type WHERE media_type = %s",
        (upload.content_type,)).fetchone()
    if allowed is None:
        raise HTTPException(415, say(ui, f"{upload.content_type} kabul edilmiyor.",
                                     f"{upload.content_type} is not accepted."))

    data = await upload.read(MAX_UPLOAD + 1)
    if len(data) > allowed[0]:
        raise HTTPException(413, say(ui, "Dosya bu tür için fazla büyük.",
                                     "The file is too large for its type."))
    if not data:
        raise HTTPException(400, say(ui, "Dosya boş.", "The file is empty."))

    if not _looks_like(upload.content_type, data):
        raise HTTPException(415, say(ui, "Dosyanın içeriği belirtilen türe uymuyor.",
                                     "The file's content does not match its type."))

    digest = hashlib.sha256(data).digest()
    # One key per attachment: a case can attach the same file twice, released
    # at two different moments, and deleting one row leaves the other's bytes
    # in place.
    key = f"drafts/{draft_id}/{digest.hex()[:12]}-{secrets.token_hex(4)}"
    storage.put(key, data)

    row = conn.execute(
        "INSERT INTO app.case_attachment"
        " (draft_id, step_key, release_at, ordinal, title_tr, caption_tr,"
        "  storage_key, media_type, byte_size, sha256, uploaded_by)"
        " VALUES (%s, %s, %s::app.attachment_release,"
        "   (SELECT coalesce(max(ordinal), 0) + 1 FROM app.case_attachment WHERE draft_id = %s),"
        "   %s, %s, %s, %s, %s, %s, %s)"
        " RETURNING id",
        (draft_id, step_key, release_at, draft_id, title, caption,
         key, upload.content_type, len(data), digest, user.person_id)).fetchone()
    conn.commit()
    return {"id": row[0], "bytes": len(data), "scan_state": "pending"}


# The states in which a draft is still its author's to change.
EDITABLE = ("draft", "changes_requested")
RELEASES = ("with_case", "with_step", "after_step", "debrief_only")

MAGIC = {
    "application/pdf": (b"%PDF-",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/webp": (b"RIFF",),
}


def _looks_like(media_type: str, data: bytes) -> bool:
    """Check the file's own first bytes against what it claims to be."""
    magic = MAGIC.get(media_type)
    if magic is None:                        # text/plain, text/csv
        try:
            data[:4096].decode("utf-8")
        except UnicodeDecodeError:
            return False
        return b"\x00" not in data[:4096]
    return any(data.startswith(m) for m in magic)


@router.post("/files/{file_id}/scan")
def record_scan(file_id: int, clean: bool = True,
                admin: Admin = Depends(current_admin),
                conn: psycopg.Connection = Depends(db)) -> dict:
    """Record the result of a virus scan, which runs outside this process."""
    require_write(admin)
    conn.execute(
        "UPDATE app.case_attachment SET scan_state = %s::app.scan_state, scanned_at = now()"
        " WHERE id = %s AND scan_state = 'pending'",
        ("clean" if clean else "rejected", file_id))
    conn.commit()
    return {"scan_state": "clean" if clean else "rejected"}


@router.delete("/files/{file_id}", status_code=204)
def remove_file(file_id: int, user: Principal = Depends(current_user),
                conn: psycopg.Connection = Depends(db)) -> None:
    _author(conn, user)
    row = conn.execute(
        "SELECT ca.storage_key FROM app.case_attachment ca"
        " JOIN app.case_draft d ON d.id = ca.draft_id"
        " WHERE ca.id = %s AND d.created_by = %s"
        "   AND d.state IN ('draft', 'changes_requested')",
        (file_id, user.person_id)).fetchone()
    if row is None:
        raise HTTPException(404, "no such file on an editable draft")
    conn.execute("DELETE FROM app.case_attachment WHERE id = %s", (file_id,))
    storage.drop(row[0])
    conn.commit()
