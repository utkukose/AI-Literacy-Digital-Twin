"""The campus map's own figures.

The places cases and events are set in, the campus twin's daily forecast and
the campus twin day by day for the time bar, the week's hardest step and a
person's own light. Each figure is counted either
for the whole campus or for the person asking, and nothing about one person
reaches anyone else.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import date, timedelta

import psycopg

from validate_case import place_of

# The spots the printed map marks without a number, in Turkish and English.
SPOT_NAMES = {
    "amphi": ("Amfi Tiyatro", "Amphitheatre"),
    "bus": ("Otobüs Durağı", "Bus Stop"),
    "cafe": ("Kafeterya", "Cafeteria"),
    "dorm": ("Öğrenci Yurtları", "Dormitories"),
    "gate": ("Yerleşke Girişi", "Campus Gate"),
    "print": ("Matbaa", "Printery"),
    "sport": ("Spor Alanı", "Sports Ground"),
}


# ---------------------------------------------------------------------------
# Places
# ---------------------------------------------------------------------------

def place_names(conn: psycopg.Connection) -> dict[str, tuple[str, str]]:
    """Every place on the map with its Turkish and English name."""
    names = {str(no): (tr, en or tr) for no, tr, en in conn.execute(
        "SELECT map_no, name_tr, name_en FROM app.location").fetchall()}
    names.update(SPOT_NAMES)
    return names


def places(conn: psycopg.Connection, locale: str) -> list[dict]:
    """The places a case or an event can be set in, buildings first by number."""
    rows = conn.execute(
        "SELECT map_no, name_tr, name_en, campus::text FROM app.location ORDER BY map_no"
    ).fetchall()
    out = [{"place": str(no), "name": en if locale == "en" and en else tr, "campus": campus}
           for no, tr, en, campus in rows]
    out += [{"place": key, "name": en if locale == "en" else tr, "campus": None}
            for key, (tr, en) in SPOT_NAMES.items()]
    return out


def clean_place(conn: psycopg.Connection, raw) -> str | None:
    """The place an announcement names, as the map names it, or None when it
    names none. Raises ValueError for a place the map does not have."""
    if raw is None or not str(raw).strip():
        return None
    value = place_of(str(raw).strip())
    if value is None:
        raise ValueError(str(raw))
    if value.isdigit() and conn.execute(
            "SELECT 1 FROM app.location WHERE map_no = %s", (int(value),)).fetchone() is None:
        raise ValueError(str(raw))
    return value


# ---------------------------------------------------------------------------
# The campus twin's daily forecast
# ---------------------------------------------------------------------------

FORECAST_WEEKS = 4
FORECAST_DAYS = 7

# Answers per local day, from accounts in use, between two local dates.
DAY_COUNTS_SQL = """
SELECT (sr.answered_at AT TIME ZONE %(tz)s)::date AS day, count(*)
FROM app.step_result sr
JOIN app.attempt a ON a.id = sr.attempt_id
JOIN app.person p ON p.id = a.person_id AND p.status = 'active'
WHERE sr.answered_at >= (%(since)s::date)::timestamp AT TIME ZONE %(tz)s
  AND sr.answered_at < (%(until)s::date)::timestamp AT TIME ZONE %(tz)s
GROUP BY 1
"""


def commitment(day: date, value: int, salt: str) -> str:
    """The text a forecast's seal is made from."""
    return f"{day.isoformat()}:{value}:{salt}"


def forecast_from(history: dict[date, int], first: date | None, day: date) -> tuple[int, str]:
    """How many answers to expect on `day`, from the days before it only.

    Two plain averages: the last seven days, and the same weekday over the
    last four weeks. Once four weeks of history exist the forecast is the mean
    of the two; before that it is the recent week's average, and before the
    first answer it is zero. A day nobody answered on counts as zero once the
    campus has begun.
    """
    if first is None or first >= day:
        return 0, "none"
    recent = [history.get(d, 0) for d in (day - timedelta(days=k)
                                          for k in range(1, FORECAST_DAYS + 1)) if d >= first]
    weekday = [history.get(d, 0) for d in (day - timedelta(weeks=k)
                                           for k in range(1, FORECAST_WEEKS + 1)) if d >= first]
    recent_mean = sum(recent) / len(recent)
    if len(weekday) == FORECAST_WEEKS:
        return int((sum(weekday) / FORECAST_WEEKS + recent_mean) / 2 + 0.5), "both"
    return int(recent_mean + 0.5), "recent"


def _local_today(conn: psycopg.Connection, tz: str) -> date:
    return conn.execute("SELECT (now() AT TIME ZONE %s)::date", (tz,)).fetchone()[0]


def _answers_between(conn: psycopg.Connection, tz: str, since: date, until: date) -> dict:
    return dict(conn.execute(DAY_COUNTS_SQL, {"tz": tz, "since": since, "until": until}).fetchall())


def todays_forecast(conn: psycopg.Connection, tz: str) -> dict:
    """Today's forecast as it may be shown today: its seal only.

    Made the first time anyone asks on a given day, from the days before it,
    so the answers already given today play no part in it.
    """
    today = _local_today(conn, tz)
    query = "SELECT digest, sealed_at FROM app.campus_forecast WHERE day = %s"
    row = conn.execute(query, (today,)).fetchone()
    if row is None:
        first = conn.execute(
            "SELECT min((answered_at AT TIME ZONE %s)::date) FROM app.step_result",
            (tz,)).fetchone()[0]
        history = _answers_between(conn, tz, today - timedelta(weeks=FORECAST_WEEKS), today)
        value, basis = forecast_from(history, first, today)
        salt = secrets.token_hex(16)
        digest = hashlib.sha256(commitment(today, value, salt).encode()).hexdigest()
        conn.execute(
            "INSERT INTO app.campus_forecast (day, forecast, basis, salt, digest)"
            " VALUES (%s, %s, %s, %s, %s) ON CONFLICT (day) DO NOTHING",
            (today, value, basis, salt, digest))
        conn.commit()
        row = conn.execute(query, (today,)).fetchone()
    return {"day": today.isoformat(), "digest": row[0], "sealed_at": row[1].isoformat()}


def opened_forecasts(conn: psycopg.Connection, tz: str, limit: int = 7) -> list[dict]:
    """The forecasts of days that are over, newest first, each with its number,
    its salt, the text that was sealed and the day's actual count."""
    today = _local_today(conn, tz)
    rows = conn.execute(
        "SELECT day, forecast, basis, salt, digest, actual FROM app.campus_forecast"
        " WHERE day < %s ORDER BY day DESC LIMIT %s", (today, limit)).fetchall()
    out = []
    for day, value, basis, salt, digest, actual in rows:
        if actual is None:
            actual = sum(_answers_between(conn, tz, day, day + timedelta(days=1)).values())
            conn.execute(
                "UPDATE app.campus_forecast SET actual = %s, opened_at = now()"
                " WHERE day = %s AND actual IS NULL", (actual, day))
        out.append({"day": day.isoformat(), "forecast": value, "basis": basis,
                    "salt": salt, "digest": digest,
                    "commitment": commitment(day, value, salt), "actual": actual})
    conn.commit()
    return out


# ---------------------------------------------------------------------------
# The campus twin day by day
# ---------------------------------------------------------------------------

# Each person's estimate in each area at the end of each day they answered in
# it: the estimate after their last answer of that day.
TWIN_PATH_SQL = """
SELECT * FROM (
    SELECT DISTINCT ON (a.person_id, sr.dimension, (sr.answered_at AT TIME ZONE %(tz)s)::date)
           a.person_id, sr.dimension::text,
           (sr.answered_at AT TIME ZONE %(tz)s)::date AS day, sr.theta_after
    FROM app.step_result sr
    JOIN app.attempt a ON a.id = sr.attempt_id
    JOIN app.person p ON p.id = a.person_id AND p.status = 'active'
    ORDER BY a.person_id, sr.dimension, (sr.answered_at AT TIME ZONE %(tz)s)::date,
             sr.answered_at DESC, sr.id DESC
) path ORDER BY day
"""

# Confidence beside the outcome, per area and day, over the answers that came
# with a confidence.
CONFIDENCE_DAYS_SQL = """
SELECT sr.dimension::text, (sr.answered_at AT TIME ZONE %(tz)s)::date AS day, count(*),
       sum(sr.confidence_c), sum((sr.outcome_x >= %(success)s)::int)
FROM app.step_result sr
JOIN app.attempt a ON a.id = sr.attempt_id
JOIN app.person p ON p.id = a.person_id AND p.status = 'active'
WHERE sr.confidence_c IS NOT NULL
GROUP BY 1, 2 ORDER BY 2
"""

# The day each person first gave a confidence in each area.
CONFIDENCE_FIRST_SQL = """
SELECT sr.dimension::text, min((sr.answered_at AT TIME ZONE %(tz)s)::date) AS day
FROM app.step_result sr
JOIN app.attempt a ON a.id = sr.attempt_id
JOIN app.person p ON p.id = a.person_id AND p.status = 'active'
WHERE sr.confidence_c IS NOT NULL
GROUP BY a.person_id, sr.dimension ORDER BY 2
"""


def twin_history(conn: psycopg.Connection, tz: str, start: date, days: int,
                 floor_n: int, success: float) -> dict:
    """The campus twin as it stood at the end of each day, for the time bar.

    For each area: the mean of everyone's estimate, as the campus twin shows
    it today, and how sure the campus was against how often it was right,
    counted up to that day. An area resting on fewer people than the
    threshold has no figure that day, only its number of people. With them,
    the forecast of each day that is over, which was opened when the day ended.
    """
    dims = [r[0] for r in conn.execute(
        "SELECT unnest(enum_range(NULL::app.dimension))::text").fetchall()]
    day_of = [start + timedelta(days=k) for k in range(days)]

    level = {d: [None] * days for d in dims}
    people = {d: [0] * days for d in dims}
    anyone = [0] * days
    estimate: dict[tuple[int, str], float] = {}
    total = dict.fromkeys(dims, 0.0)
    count = dict.fromkeys(dims, 0)
    seen: set[int] = set()
    rows = conn.execute(TWIN_PATH_SQL, {"tz": tz}).fetchall()
    i = 0
    for k, day in enumerate(day_of):
        while i < len(rows) and rows[i][2] <= day:
            person, dim, _, value = rows[i]
            before = estimate.get((person, dim))
            if before is None:
                count[dim] += 1
                total[dim] += value
            else:
                total[dim] += value - before
            estimate[(person, dim)] = value
            seen.add(person)
            i += 1
        anyone[k] = len(seen)
        for d in dims:
            people[d][k] = count[d]
            if count[d] >= floor_n:
                level[d][k] = round(total[d] / count[d], 2)

    confidence = {d: [None] * days for d in dims}
    hit = {d: [None] * days for d in dims}
    answers = dict.fromkeys(dims, 0)
    sure = dict.fromkeys(dims, 0.0)
    right = dict.fromkeys(dims, 0)
    sayers = dict.fromkeys(dims, 0)
    sums = conn.execute(CONFIDENCE_DAYS_SQL, {"tz": tz, "success": success}).fetchall()
    firsts = conn.execute(CONFIDENCE_FIRST_SQL, {"tz": tz}).fetchall()
    i = j = 0
    for k, day in enumerate(day_of):
        while i < len(sums) and sums[i][1] <= day:
            dim, _, n, c, h = sums[i]
            answers[dim] += n
            sure[dim] += float(c)
            right[dim] += h
            i += 1
        while j < len(firsts) and firsts[j][1] <= day:
            sayers[firsts[j][0]] += 1
            j += 1
        for d in dims:
            if sayers[d] >= floor_n and answers[d]:
                confidence[d][k] = round(sure[d] / answers[d], 3)
                hit[d][k] = round(right[d] / answers[d], 3)

    forecast = [None] * days
    for day, value in conn.execute(
            "SELECT day, forecast FROM app.campus_forecast WHERE day >= %s AND day < %s",
            (start, day_of[-1])).fetchall():
        forecast[(day - start).days] = value

    return {
        "people": anyone, "forecast": forecast,
        "areas": {d: {"level": level[d], "people": people[d],
                      "confidence": confidence[d], "hit": hit[d]} for d in dims},
    }


# ---------------------------------------------------------------------------
# The week's trap
# ---------------------------------------------------------------------------

# Steps of cases whose correct answers are open, by the share of answers that
# fell short, among steps enough people answered in the window.
TRAP_SQL = """
SELECT cr.case_key, cs.step_key, cs.dimension::text,
       count(DISTINCT a.person_id) AS people,
       avg((sr.outcome_x < %(success)s)::int)::float8 AS wrong
FROM app.step_result sr
JOIN app.attempt a ON a.id = sr.attempt_id
JOIN app.person p ON p.id = a.person_id AND p.status = 'active'
JOIN app.case_step cs ON cs.id = sr.case_step_id
JOIN app.case_registry cr ON cr.id = a.case_id
WHERE sr.answered_at > now() - make_interval(days => %(days)s)
  AND EXISTS (SELECT 1 FROM app.case_reveal r
              WHERE r.case_id = cr.id AND r.reason <> 'held')
GROUP BY cr.case_key, cs.step_key, cs.dimension
HAVING count(DISTINCT a.person_id) >= %(floor)s
ORDER BY wrong DESC, people DESC, cr.case_key, cs.step_key
LIMIT 25
"""

# The week first; when no step qualifies, the month.
TRAP_WINDOWS = (7, 30)


def trap_candidates(conn: psycopg.Connection, success: float, floor_n: int):
    """The hardest steps of open cases and the window they were found in."""
    for days in TRAP_WINDOWS:
        rows = conn.execute(TRAP_SQL, {"success": success, "floor": floor_n,
                                       "days": days}).fetchall()
        if rows:
            return days, rows
    return None, []


# ---------------------------------------------------------------------------
# A person's own light
# ---------------------------------------------------------------------------

# The building of the person's unit, or of the nearest unit above it that has
# one.
LIGHT_PLACE_SQL = """
SELECT l.map_no
FROM app.person p
JOIN app.unit u ON u.id = p.unit_id
JOIN app.unit anc ON u.path <@ anc.path AND anc.valid_to IS NULL
JOIN app.unit_location ul ON ul.unit_id = anc.id AND ul.is_primary
JOIN app.location l ON l.id = ul.location_id
WHERE p.id = %s
ORDER BY nlevel(anc.path) DESC
LIMIT 1
"""


def light_of(conn: psycopg.Connection, person_id: int, tz: str) -> dict:
    """Where the person's light is and what lit it today. For the person only."""
    place = conn.execute(LIGHT_PLACE_SQL, (person_id,)).fetchone()
    midnight = "date_trunc('day', now() AT TIME ZONE %(tz)s) AT TIME ZONE %(tz)s"
    steps = conn.execute(
        "SELECT count(*) FROM app.step_result sr JOIN app.attempt a ON a.id = sr.attempt_id"
        f" WHERE a.person_id = %(p)s AND sr.answered_at >= {midnight}",
        {"p": person_id, "tz": tz}).fetchone()[0]
    cases = conn.execute(
        f"SELECT count(*) FROM app.attempt WHERE person_id = %(p)s AND finished_at >= {midnight}",
        {"p": person_id, "tz": tz}).fetchone()[0]
    return {"place": str(place[0]) if place else None,
            "steps_today": steps, "cases_today": cases}


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

EVENTS_SQL = """
SELECT id, title, body, link_url, place, event_at
FROM app.announcement
WHERE place IS NOT NULL AND audience = ANY(%(aud)s)
  AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
  AND (event_at IS NULL OR event_at > now() - interval '3 hours')
ORDER BY event_at NULLS LAST, starts_at DESC, id DESC
LIMIT 12
"""


def events_for(conn: psycopg.Connection, audiences: list[str]) -> list[dict]:
    """Announcements in force that name a place, for these audiences. An event
    stays on the map for three hours after it starts."""
    return [{"id": r[0], "title": r[1], "body": r[2], "link": r[3], "place": r[4],
             "event_at": r[5].isoformat() if r[5] else None}
            for r in conn.execute(EVENTS_SQL, {"aud": audiences}).fetchall()]
