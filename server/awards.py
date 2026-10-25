"""Rare marks and medals: what there is to earn, and who has earned what.

The badge has four parts. The level and the area levels are read off the twin
whenever they are shown (app.badge). Rare marks and medals are recorded once
earned (app.person_award, migration 022) and kept: a weaker week later on does
not take one back. Only an attempt set aside by an administrator takes back
what it earned (attempt_set_aside), and the conditions are then checked again
without it.

Six rare marks come with the platform and are checked by the rules below.
Administrators add marks and medals of their own (Super, Mega and Ultra) in
the panel, each with a picture and a condition of one of RULE_KINDS, or with
none ("manual"), in which case an administrator gives it to a person by hand.

Conditions are checked
  * for one person, when they finish a case (the submit endpoint);
  * for everyone, in the background, when an administrator adds an award or
    changes its condition;
  * for everyone, once at each start, so that a mark that comes with a new
    release reaches those who already meet it.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import threading
import time
from datetime import date, datetime, timedelta
from functools import cached_property
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg

import case_images
import case_loader as cl
import scoring
import storage

log = logging.getLogger("yazem.awards")

CASE_ROOT = Path(os.environ.get("CASE_ROOT", "cases"))
TZ = ZoneInfo("Europe/Istanbul")

CATEGORIES = ("marks", "super", "mega", "ultra")
DIMENSIONS = ("prompt_design", "verification", "integrity", "privacy", "manipulation",
              "op_security", "boundaries")
BUILT_IN = ("blind_spot", "even_hand", "honest_doubt", "first_sight", "unshaken", "held_line")
# The conditions an administrator chooses from, in the order the panel offers them.
RULE_KINDS = ("manual", "cases", "case", "area", "level", "streak", "calibration", "points")

SUCCESS = scoring.SUCCESS_THRESHOLD
EPS = 1e-6

# A picture uploaded for a mark or a medal. The panel sends a square one,
# redrawn in the browser; the server judges the bytes again whatever sent them.
IMAGE_MAX_BYTES = 2 * 1024 * 1024
IMAGE_MIN_SIDE, IMAGE_MAX_SIDE = 96, 2000

# One refusal, in the panel's words, in Turkish and in English.
Refused = case_images.Refused

# What an award's code looks like, as app.award checks it.
CODE_SHAPE = re.compile(r"^[a-z][a-z0-9_-]{1,40}$")


# ---------------------------------------------------------------------------
# What a person has done, read once per check
# ---------------------------------------------------------------------------

class Facts:
    """The finished cases and answers of one person, read when a rule first
    asks for them. Answers of a case still in progress count once it is
    finished."""

    def __init__(self, conn: psycopg.Connection, person_id: int, memo: dict):
        self.conn = conn
        self.person_id = person_id
        # Shared across people in a sweep: the best paths of decision steps.
        self.memo = memo

    @cached_property
    def attempts(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT a.id, cr.case_key, a.locale::text, a.finished_at"
            " FROM app.attempt a JOIN app.case_registry cr ON cr.id = a.case_id"
            " WHERE a.person_id = %s AND a.finished_at IS NOT NULL"
            " ORDER BY a.finished_at, a.id", (self.person_id,)).fetchall()
        return [{"id": r[0], "case_key": r[1], "locale": r[2], "finished_at": r[3]}
                for r in rows]

    @cached_property
    def results(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT sr.attempt_id, sr.dimension::text, sr.outcome_x, sr.confidence_c,"
            "       sr.answered_at, sr.theta_after, cs.step_key, sr.points_awarded"
            " FROM app.step_result sr JOIN app.attempt a ON a.id = sr.attempt_id"
            " JOIN app.case_step cs ON cs.id = sr.case_step_id"
            " WHERE a.person_id = %s AND a.finished_at IS NOT NULL"
            " ORDER BY sr.answered_at, sr.id", (self.person_id,)).fetchall()
        return [{"attempt_id": r[0], "dimension": r[1], "outcome": r[2], "confidence": r[3],
                 "at": r[4], "theta": r[5], "step_key": r[6], "points": r[7]} for r in rows]

    @cached_property
    def by_attempt(self) -> dict[int, list[dict]]:
        out: dict[int, list[dict]] = {}
        for r in self.results:
            out.setdefault(r["attempt_id"], []).append(r)
        return out

    @cached_property
    def finished_at(self) -> dict[int, datetime]:
        return {a["id"]: a["finished_at"] for a in self.attempts}

    @cached_property
    def badge(self) -> dict:
        return self.conn.execute("SELECT app.badge(%s)", (self.person_id,)).fetchone()[0]

    @cached_property
    def twin(self) -> dict[str, tuple[float, int]]:
        return {d: (theta, n) for d, theta, n in self.conn.execute(
            "SELECT dimension::text, theta, attempts FROM app.twin_state WHERE person_id = %s",
            (self.person_id,)).fetchall()}

    @cached_property
    def calibration(self) -> tuple[float | None, int]:
        row = self.conn.execute(
            "SELECT brier_mean, n FROM app.calibration WHERE person_id = %s",
            (self.person_id,)).fetchone()
        return (row[0], row[1]) if row else (None, 0)

    @property
    def last(self) -> int | None:
        """The case finished last, which a condition read off the present
        state is put down to."""
        return self.attempts[-1]["id"] if self.attempts else None

    def last_in(self, dimension: str) -> int | None:
        found = None
        for r in self.results:
            if r["dimension"] == dimension:
                found = r["attempt_id"]
        return found

    def branching_best(self, case_key: str, locale: str) -> dict[str, float]:
        """The highest mark each decision step of a case can give, as the
        grader gives it."""
        key = (case_key, locale)
        if key not in self.memo:
            # The platform and the demo each have their own cases.
            kept = (self.conn.info.dbname, case_key, locale)
            held = _BEST.get(kept)
            if held is not None and time.monotonic() - held[0] < BEST_TTL:
                self.memo[key] = held[1]
                return held[1]
            best: dict[str, float] = {}
            try:
                case = cl.load_case(CASE_ROOT, case_key, locale, self.conn)
                for step in case.body.get("steps") or []:
                    if step.get("kind") != "branching":
                        continue
                    payload = step.get("payload") or {}
                    nodes = {n["id"]: n for n in payload.get("nodes") or []}
                    mode = (step.get("answer") or {}).get("scoring", "path_mean")
                    best[step["id"]] = cl.best_path(nodes, payload["start"], mode)[0]
            except (cl.CaseNotFound, KeyError, ValueError) as exc:
                log.warning("decision steps of %s not read: %s", case_key, type(exc).__name__)
            self.memo[key] = best
            _BEST[kept] = (time.monotonic(), best)
        return self.memo[key]


# The best paths of decision steps, kept a while across checks: finishing a
# case checks a person's every case again, and a case changes rarely.
_BEST: dict[tuple[str, str, str], tuple[float, dict[str, float]]] = {}
BEST_TTL = 600.0


# ---------------------------------------------------------------------------
# The conditions: each returns the finished case that met it, or None
# ---------------------------------------------------------------------------

def _even_hand(f: Facts, rule: dict) -> int | None:
    """All seven areas at once at 1.0 or above, none more than 0.5 apart."""
    values = [f.twin.get(d, (0.0, 0))[0] for d in DIMENSIONS]
    if all(v >= 1.0 for v in values) and max(values) - min(values) <= 0.5:
        return f.last
    return None


def _blind_spot(f: Facts, rule: dict) -> int | None:
    """An area that was once the weakest of three or more, below zero, now at
    the Basic level or higher."""
    theta: dict[str, float] = {}
    weakest: set[str] = set()
    for r in f.results:
        theta[r["dimension"]] = r["theta"]
        if len(theta) >= 3:
            low = min(theta, key=lambda d: (theta[d], d))
            if theta[low] < 0:
                weakest.add(low)
    tiers = f.badge.get("tiers") or {}
    for dimension in sorted(weakest):
        if (tiers.get(dimension) or 0) >= 1:
            return f.last_in(dimension) or f.last
    return None


def _honest_doubt(f: Facts, rule: dict) -> int | None:
    """Ten answers that went wrong, each given with 50% or 60% confidence."""
    n = 0
    for r in f.results:
        c = r["confidence"]
        if c is not None and c <= 0.6 + EPS and r["outcome"] < SUCCESS:
            n += 1
            if n >= 10:
                return r["attempt_id"]
    return None


def _first_sight(f: Facts, rule: dict) -> int | None:
    """Three cases with every step right and 90% confidence, the highest there
    is, on every step that asked for it."""
    n = 0
    for a in f.attempts:
        rs = f.by_attempt.get(a["id"]) or []
        asked = [r for r in rs if r["confidence"] is not None]
        if asked and all(r["outcome"] >= SUCCESS for r in rs) \
                and all(r["confidence"] >= 0.9 - EPS for r in asked):
            n += 1
            if n >= 3:
                return a["id"]
    return None


def _unshaken(f: Facts, rule: dict) -> int | None:
    """Ten cases in which every decision step was walked along its best path."""
    n = 0
    for a in f.attempts:
        best = f.branching_best(a["case_key"], a["locale"])
        rs = [r for r in f.by_attempt.get(a["id"]) or [] if r["step_key"] in best]
        if rs and all(r["outcome"] >= best[r["step_key"]] - EPS for r in rs):
            n += 1
            if n >= 10:
                return a["id"]
    return None


def _next_month(month: tuple[int, int]) -> tuple[int, int]:
    return (month[0] + 1, 1) if month[1] == 12 else (month[0], month[1] + 1)


def _held_line(f: Facts, rule: dict) -> int | None:
    """Six months in a row, each with five answers or more given with a
    confidence, whose mean confidence is within ten points of how often they
    were right."""
    months: dict[tuple[int, int], list] = {}
    for r in f.results:
        if r["confidence"] is None:
            continue
        at = r["at"].astimezone(TZ)
        m = months.setdefault((at.year, at.month), [0.0, 0.0, 0, None])
        m[0] += r["confidence"]
        m[1] += 1.0 if r["outcome"] >= SUCCESS else 0.0
        m[2] += 1
        m[3] = r["attempt_id"]
    run, previous = 0, None
    for month in sorted(months):
        c, hit, n, attempt_id = months[month]
        if n >= 5 and abs(c / n - hit / n) <= 0.10 + EPS:
            run = run + 1 if previous is not None and _next_month(previous) == month else 1
            previous = month
            if run >= 6:
                return attempt_id
        else:
            run, previous = 0, None
    return None


def _cases(f: Facts, rule: dict) -> int | None:
    count = int(rule["count"])
    return f.attempts[count - 1]["id"] if len(f.attempts) >= count else None


def _case(f: Facts, rule: dict) -> int | None:
    for a in f.attempts:
        if a["case_key"] != rule["case_key"]:
            continue
        rs = f.by_attempt.get(a["id"]) or []
        if not rule.get("perfect") or (rs and all(r["outcome"] >= SUCCESS for r in rs)):
            return a["id"]
    return None


def _area(f: Facts, rule: dict) -> int | None:
    tiers = f.badge.get("tiers") or {}
    tier = int(rule["tier"])
    if rule["dimension"] == "any":
        reached = sum(1 for d in DIMENSIONS if (tiers.get(d) or 0) >= tier)
        return f.last if reached >= int(rule.get("count", 1)) else None
    if (tiers.get(rule["dimension"]) or 0) >= tier:
        return f.last_in(rule["dimension"]) or f.last
    return None


def _level(f: Facts, rule: dict) -> int | None:
    return f.last if (f.badge.get("level") or 1) >= int(rule["level"]) else None


def _week_of(moment: datetime) -> date:
    day = moment.astimezone(TZ).date()
    return day - timedelta(days=day.weekday())


def _streak(f: Facts, rule: dict) -> int | None:
    """A case finished in each of so many weeks in a row, Monday to Sunday."""
    weeks: dict[date, int] = {}
    for a in f.attempts:
        weeks.setdefault(_week_of(a["finished_at"]), a["id"])
    run, previous = 0, None
    for week in sorted(weeks):
        run = run + 1 if previous is not None and week - previous == timedelta(days=7) else 1
        previous = week
        if run >= int(rule["weeks"]):
            return weeks[week]
    return None


def _calibration(f: Facts, rule: dict) -> int | None:
    brier, n = f.calibration
    if brier is not None and n >= int(rule["min_answers"]) \
            and brier <= float(rule["max_brier"]) + EPS:
        return f.last
    return None


def _points(f: Facts, rule: dict) -> int | None:
    total = 0.0
    for a in f.attempts:
        total += sum(r["points"] for r in f.by_attempt.get(a["id"]) or [])
        if total >= float(rule["points"]):
            return a["id"]
    return None


CHECKS = {
    "even_hand": _even_hand, "blind_spot": _blind_spot, "honest_doubt": _honest_doubt,
    "first_sight": _first_sight, "unshaken": _unshaken, "held_line": _held_line,
    "cases": _cases, "case": _case, "area": _area, "level": _level, "streak": _streak,
    "calibration": _calibration, "points": _points,
}


# ---------------------------------------------------------------------------
# Recording what is earned
# ---------------------------------------------------------------------------

def evaluate(conn: psycopg.Connection, person_id: int, *, award_ids: list[int] | None = None,
             backdate: bool = False, memo: dict | None = None) -> list[str]:
    """Check the conditions this person does not hold yet and record the ones
    now met. Returns the codes recorded. The caller commits.

    With backdate, an award is dated by the finished case that met it, as the
    demo writes its past; otherwise by now, the moment it was given."""
    rows = conn.execute(
        "SELECT a.id, a.code, a.rule FROM app.award a"
        " WHERE a.active AND a.rule->>'kind' <> 'manual'"
        "   AND (%(ids)s::bigint[] IS NULL OR a.id = ANY(%(ids)s::bigint[]))"
        "   AND NOT EXISTS (SELECT 1 FROM app.person_award pa"
        "                    WHERE pa.award_id = a.id AND pa.person_id = %(person)s)"
        " ORDER BY a.position, a.id",
        {"ids": award_ids, "person": person_id}).fetchall()
    if not rows:
        return []
    facts = Facts(conn, person_id, memo if memo is not None else {})
    if not facts.attempts:
        return []
    earned = []
    for award_id, code, rule in rows:
        check = CHECKS.get((rule or {}).get("kind"))
        if check is None:
            continue
        try:
            attempt_id = check(facts, rule)
        except (KeyError, TypeError, ValueError) as exc:
            # A condition that cannot be read stops only itself.
            log.warning("award %s not checked: %s", code, type(exc).__name__)
            continue
        if attempt_id is None:
            continue
        when = facts.finished_at.get(attempt_id) if backdate else None
        added = conn.execute(
            "INSERT INTO app.person_award (person_id, award_id, earned_at, attempt_id)"
            " VALUES (%s, %s, coalesce(%s, now()), %s)"
            " ON CONFLICT DO NOTHING RETURNING award_id",
            (person_id, award_id, when, attempt_id)).fetchone()
        if added:
            earned.append(code)
    return earned


def people_to_check(conn: psycopg.Connection) -> list[int]:
    return [r[0] for r in conn.execute(
        "SELECT DISTINCT person_id FROM app.attempt WHERE finished_at IS NOT NULL"
        " ORDER BY person_id").fetchall()]


def sweep(conn: psycopg.Connection, award_ids: list[int] | None = None,
          backdate: bool = False, each: bool = True) -> int:
    """Check everyone who has finished a case. Returns how many awards were
    recorded.

    With each, every person is checked and committed on their own, so a long
    sweep holds nothing for long and one person's trouble stops nobody else's
    check. Without it everything happens in the caller's transaction."""
    people = people_to_check(conn)
    memo: dict = {}
    total = 0
    if not each:
        for person_id in people:
            total += len(evaluate(conn, person_id, award_ids=award_ids, backdate=backdate,
                                  memo=memo))
        return total
    conn.commit()
    for person_id in people:
        try:
            with conn.transaction():
                total += len(evaluate(conn, person_id, award_ids=award_ids,
                                      backdate=backdate, memo=memo))
        except psycopg.Error as exc:
            log.warning("awards not checked for one person: %s", type(exc).__name__)
    return total


def sweep_in_background(dsn: str, award_ids: list[int] | None = None) -> threading.Thread:
    """sweep, on a connection of its own, without holding up the request that
    asked for it."""
    def run():
        try:
            with psycopg.connect(dsn, connect_timeout=5) as conn:
                n = sweep(conn, award_ids)
            if n:
                log.info("%d awards recorded", n)
        except psycopg.Error as exc:
            log.warning("awards not checked: %s", type(exc).__name__)

    thread = threading.Thread(target=run, name="yazem-awards", daemon=True)
    thread.start()
    return thread


def attempt_set_aside(conn: psycopg.Connection, attempt_id: int, person_id: int) -> list[str]:
    """Take back what an attempt set aside had earned, then check the
    conditions again without it: what is still met is recorded again, put
    down to another case. What was given by hand stays. The caller commits."""
    taken = [r[0] for r in conn.execute(
        "DELETE FROM app.person_award pa USING app.award a"
        " WHERE a.id = pa.award_id AND pa.attempt_id = %s AND pa.granted_by IS NULL"
        " RETURNING a.code", (attempt_id,)).fetchall()]
    if taken:
        evaluate(conn, person_id)
    return taken


def attempt_restored(conn: psycopg.Connection, person_id: int) -> list[str]:
    """An attempt counts again: what it meets is recorded again."""
    return evaluate(conn, person_id)


# ---------------------------------------------------------------------------
# Conditions as an administrator writes them
# ---------------------------------------------------------------------------

def _whole(value, low: int, high: int, tr: str, en: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) \
            or int(value) != value or not low <= value <= high:
        raise Refused(f"{tr} {low} ile {high} arasında bir tam sayı olmalı.",
                      f"{en} must be a whole number from {low} to {high}.")
    return int(value)


def clean_rule(conn: psycopg.Connection, raw) -> dict:
    """The condition, checked and with only its own settings kept."""
    if not isinstance(raw, dict) or raw.get("kind") not in RULE_KINDS:
        raise Refused("Koşul türü tanınmadı.", "The kind of condition is not recognised.")
    kind = raw["kind"]
    if kind == "manual":
        return {"kind": kind}
    if kind == "cases":
        return {"kind": kind, "count": _whole(raw.get("count"), 1, 1000,
                                              "Vaka sayısı", "The number of cases")}
    if kind == "case":
        key = raw.get("case_key")
        if not isinstance(key, str) or not conn.execute(
                "SELECT 1 FROM app.case_registry WHERE case_key = %s", (key,)).fetchone():
            raise Refused("Seçilen vaka platformda kayıtlı değil.",
                          "The chosen case is not registered on the platform.")
        return {"kind": kind, "case_key": key, "perfect": bool(raw.get("perfect"))}
    if kind == "area":
        dimension = raw.get("dimension")
        if dimension != "any" and dimension not in DIMENSIONS:
            raise Refused("Alan tanınmadı.", "The area is not recognised.")
        tier = _whole(raw.get("tier"), 1, 3, "Alan seviyesi", "The area level")
        if dimension == "any":
            count = _whole(raw.get("count"), 1, 7, "Alan sayısı", "The number of areas")
            return {"kind": kind, "dimension": dimension, "tier": tier, "count": count}
        return {"kind": kind, "dimension": dimension, "tier": tier}
    if kind == "level":
        return {"kind": kind, "level": _whole(raw.get("level"), 2, 5, "Seviye", "The level")}
    if kind == "streak":
        return {"kind": kind, "weeks": _whole(raw.get("weeks"), 2, 52,
                                              "Hafta sayısı", "The number of weeks")}
    if kind == "calibration":
        brier = raw.get("max_brier")
        if isinstance(brier, bool) or not isinstance(brier, (int, float)) \
                or not 0.01 <= brier <= 0.25:
            raise Refused("Kendini tanıma sınırı 0,01 ile 0,25 arasında olmalı.",
                          "The self-knowledge limit must be from 0.01 to 0.25.")
        answers = _whole(raw.get("min_answers"), 10, 500, "Cevap sayısı",
                         "The number of answers")
        return {"kind": kind, "max_brier": round(float(brier), 3), "min_answers": answers}
    return {"kind": kind, "points": _whole(raw.get("points"), 10, 100000,
                                           "Puan", "The number of points")}


# ---------------------------------------------------------------------------
# Pictures
# ---------------------------------------------------------------------------

def check_image(data: bytes) -> tuple[str, int, int]:
    if not data:
        raise Refused("Dosya boş.", "The file is empty.")
    if len(data) > IMAGE_MAX_BYTES:
        raise Refused("Görsel en çok 2 MB olabilir.", "A picture can be at most 2 MB.")
    media_type, width, height = case_images.sniff(data)
    if max(width, height) > IMAGE_MAX_SIDE:
        raise Refused(f"Görselin kenarları en çok {IMAGE_MAX_SIDE} piksel olabilir.",
                      f"A picture's sides can be at most {IMAGE_MAX_SIDE} pixels.")
    if min(width, height) < IMAGE_MIN_SIDE:
        raise Refused(f"Görsel en az {IMAGE_MIN_SIDE} × {IMAGE_MIN_SIDE} piksel olmalı.",
                      f"A picture must be at least {IMAGE_MIN_SIDE} × {IMAGE_MIN_SIDE} pixels.")
    return media_type, width, height


def store_image(conn: psycopg.Connection, award_id: int, data: bytes) -> dict:
    """Keep a picture for a mark or a medal, in place of any it had. Returns
    the storage key of the one it replaces, which the caller drops once the
    change is committed."""
    media_type, width, height = check_image(data)
    data = case_images.strip_metadata(data, media_type)
    if case_images.sniff(data) != (media_type, width, height):
        raise Refused("Yalnızca PNG, JPEG ya da WebP biçiminde bir görsel yüklenebilir.",
                      "Only a PNG, JPEG or WebP picture can be uploaded.")
    digest = hashlib.sha256(data).digest()
    key = f"award-images/{award_id}-{digest.hex()[:16]}.{case_images.EXTENSION[media_type]}"
    old = conn.execute("SELECT image_key FROM app.award WHERE id = %s", (award_id,)).fetchone()
    storage.put(key, data)
    try:
        conn.execute(
            "UPDATE app.award SET image_key = %s, image_type = %s, image_sha256 = %s,"
            "       updated_at = now() WHERE id = %s",
            (key, media_type, digest, award_id))
    except psycopg.Error:
        if not old or old[0] != key:
            storage.drop(key)
        raise
    return {"version": case_images.version_of(digest), "bytes": len(data), "width": width,
            "height": height, "sha256": digest.hex(),
            "replaced": old[0] if old and old[0] and old[0] != key else None}


def remove_image(conn: psycopg.Connection, award_id: int) -> str | None:
    row = conn.execute(
        "UPDATE app.award a SET image_key = NULL, image_type = NULL, image_sha256 = NULL,"
        "       updated_at = now()"
        " FROM (SELECT image_key FROM app.award WHERE id = %s) old"
        " WHERE a.id = %s AND old.image_key IS NOT NULL RETURNING old.image_key",
        (award_id, award_id)).fetchone()
    return row[0] if row else None


def image_of(conn: psycopg.Connection, code: str):
    """(bytes, media type, version) of an award's uploaded picture, or None."""
    if not CODE_SHAPE.match(code or ""):
        return None
    row = conn.execute("SELECT image_key, image_type, image_sha256 FROM app.award"
                       " WHERE code = %s AND image_key IS NOT NULL", (code,)).fetchone()
    if row is None:
        return None
    try:
        return storage.fetch(row[0]), row[1], case_images.version_of(bytes(row[2]))
    except storage.NotStored:
        return None



# ---------------------------------------------------------------------------
# What a person is shown
# ---------------------------------------------------------------------------

def _shown(row, locale: str) -> dict:
    (code, category, name_tr, name_en, what_tr, what_en, built_in, active, sha, kind) = row
    english = locale == "en"
    return {"code": code, "category": category,
            "name": (name_en or name_tr) if english else name_tr,
            "what": (what_en or what_tr) if english else what_tr,
            "built_in": built_in, "active": active, "manual": kind == "manual",
            "image": case_images.version_of(bytes(sha)) if sha else None}


AWARD_COLUMNS = ("a.code, a.category, a.name_tr, a.name_en, a.what_tr, a.what_en,"
                 " a.built_in, a.active, a.image_sha256, a.rule->>'kind'")


def catalogue(conn: psycopg.Connection, locale: str, person_id: int | None = None) -> dict:
    """The groups and what there is to earn in them: everything switched on,
    and what is switched off but still held by someone, so a badge never
    shows a mark nobody can name. With a person, what they hold, and when."""
    categories = [{"code": c, "name": en if locale == "en" else tr}
                  for c, tr, en in conn.execute(
                      "SELECT code, name_tr, name_en FROM app.award_category"
                      " ORDER BY position").fetchall()]
    rows = conn.execute(
        f"SELECT {AWARD_COLUMNS} FROM app.award a"
        " JOIN app.award_category c ON c.code = a.category"
        " WHERE a.active OR EXISTS (SELECT 1 FROM app.person_award pa WHERE pa.award_id = a.id)"
        " ORDER BY c.position, a.position, a.id").fetchall()
    out = {"categories": categories, "awards": [_shown(r, locale) for r in rows]}
    if person_id is not None:
        out["mine"] = [{"code": code, "earned_at": at.isoformat(), "by_hand": by_hand}
                       for code, at, by_hand in conn.execute(
                           "SELECT a.code, pa.earned_at, pa.granted_by IS NOT NULL"
                           " FROM app.person_award pa JOIN app.award a ON a.id = pa.award_id"
                           " WHERE pa.person_id = %s ORDER BY pa.earned_at, a.id",
                           (person_id,)).fetchall()]
    return out


def described(conn: psycopg.Connection, codes: list[str], locale: str) -> list[dict]:
    """These awards as the person who just earned them is shown them."""
    if not codes:
        return []
    rows = conn.execute(
        f"SELECT {AWARD_COLUMNS} FROM app.award a"
        " JOIN app.award_category c ON c.code = a.category"
        " WHERE a.code = ANY(%s) ORDER BY c.position, a.position, a.id", (codes,)).fetchall()
    return [_shown(r, locale) for r in rows]
