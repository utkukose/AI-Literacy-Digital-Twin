"""Announcements: short notices from the centre.

An announcement is plain text with at most one link. Nothing in it is read as
markup: the interface shows it as text, and the link must be an https address,
so a notice cannot carry a script or send people to a javascript: or data:
address.

Who sees an announcement is decided here and nowhere else:

    public   the sign-in page, and everyone signed in
    members  everyone signed in
    student  people signed in as students
    staff    people signed in as academic or administrative staff
"""

from __future__ import annotations

import re
import threading
import time
import unicodedata
from datetime import datetime
from urllib.parse import urlsplit

import psycopg

import campus

AUDIENCES = ("public", "members", "student", "staff")
TITLE_MAX = 120
BODY_MAX = 600
LINK_MAX = 300

# How many are shown at once, newest first. A signed-in person may have closed
# some, so their screen is sent a few more to choose from.
SHOWN = 3
SHOWN_SIGNED_IN = 10

# Characters that change the direction of text or hide it. A notice written
# with them can show one thing and say another.
_HIDDEN = {"‎", "‏", "‪", "‫", "‬", "‭", "‮",
           "⁦", "⁧", "⁨", "⁩", "​", "﻿"}


class Refused(ValueError):
    """A field that cannot be stored, with the reason in the panel's words, in
    Turkish and in English."""

    def __init__(self, tr: str, en: str):
        super().__init__(tr)
        self.en = en

    def text(self, locale: str) -> str:
        return self.en if locale == "en" else str(self)


def audiences_for(role: str) -> list[str]:
    """The audiences a person signed in with this role belongs to."""
    return ["public", "members", "student" if role == "student" else "staff"]


def _unsafe(text: str, newlines: bool) -> bool:
    for ch in text:
        if ch == "\n" and newlines:
            continue
        if ch in _HIDDEN or unicodedata.category(ch) == "Cc":
            return True
    return False


def clean_title(raw: str) -> str:
    title = " ".join((raw or "").split())
    if _unsafe(title, newlines=False):
        raise Refused("Başlıkta görünmeyen ya da yazı yönünü değiştiren bir karakter var.",
                      "The title holds a hidden character or one that changes the direction of text.")
    if len(title) < 3:
        raise Refused("Başlık en az 3 karakter olmalı.",
                      "The title must be at least 3 characters long.")
    if len(title) > TITLE_MAX:
        raise Refused(f"Başlık en çok {TITLE_MAX} karakter olabilir.",
                      f"The title can be at most {TITLE_MAX} characters long.")
    return title


def clean_body(raw: str) -> str:
    lines = [" ".join(line.split()) for line in (raw or "").replace("\r\n", "\n")
             .replace("\r", "\n").split("\n")]
    body = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    if _unsafe(body, newlines=True):
        raise Refused("Metinde görünmeyen ya da yazı yönünü değiştiren bir karakter var.",
                      "The text holds a hidden character or one that changes the direction of text.")
    if not body:
        raise Refused("Duyuru metni boş olamaz.", "The announcement needs a text.")
    if len(body) > BODY_MAX:
        raise Refused(f"Metin en çok {BODY_MAX} karakter olabilir.",
                      f"The text can be at most {BODY_MAX} characters long.")
    return body


def clean_link(raw: str | None) -> str | None:
    link = (raw or "").strip()
    if not link:
        return None
    if len(link) > LINK_MAX:
        raise Refused(f"Bağlantı en çok {LINK_MAX} karakter olabilir.",
                      f"The link can be at most {LINK_MAX} characters long.")
    if any(ch.isspace() for ch in link) or _unsafe(link, newlines=False):
        raise Refused("Bağlantıda boşluk ya da görünmeyen bir karakter olmamalı.",
                      "The link must not hold spaces or hidden characters.")
    try:
        parts = urlsplit(link)
        host = parts.hostname or ""
    except ValueError:
        raise Refused("Bağlantı okunamadı. Tarayıcının adres çubuğundaki adresi yapıştır.",
                      "The link could not be read. Paste the address from the browser's address bar.")
    if parts.scheme.lower() != "https":
        raise Refused("Bağlantı https:// ile başlamalı.", "The link must start with https://.")
    if not host or "." not in host:
        raise Refused("Bağlantıda bir alan adı olmalı, örneğin https://www.sdu.edu.tr.",
                      "The link needs a domain, for example https://www.sdu.edu.tr.")
    if parts.username or parts.password:
        raise Refused("Bağlantıda kullanıcı adı ya da parola olmamalı.",
                      "The link cannot carry a user name or a password.")
    return "https://" + link[len(parts.scheme) + 3:]


def state_of(starts_at: datetime, ends_at: datetime | None, now: datetime) -> str:
    if starts_at > now:
        return "scheduled"
    if ends_at is not None and ends_at <= now:
        return "ended"
    return "live"


def _row(r, names: dict) -> dict:
    place = r[7]
    return {"id": r[0], "title": r[1], "body": r[2], "link": r[3],
            "audience": r[4], "starts_at": r[5].isoformat(),
            "ends_at": r[6].isoformat() if r[6] else None,
            # Where and when the event it announces takes place, when it says.
            "place": place,
            "place_name": ({"tr": names[place][0], "en": names[place][1]}
                           if place in names else None),
            "event_at": r[8].isoformat() if r[8] else None}


def shown_to(conn: psycopg.Connection, audiences: list[str], limit: int = SHOWN) -> list[dict]:
    """The announcements in force for these audiences, newest first."""
    rows = conn.execute(
        "SELECT id, title, body, link_url, audience, starts_at, ends_at, place, event_at"
        " FROM app.announcement"
        " WHERE starts_at <= now() AND (ends_at IS NULL OR ends_at > now())"
        "   AND audience = ANY(%s)"
        " ORDER BY starts_at DESC, id DESC LIMIT %s",
        (audiences, limit)).fetchall()
    names = campus.place_names(conn) if any(r[7] for r in rows) else {}
    return [_row(r, names) for r in rows]


# The sign-in page is open to anyone, so what it shows is read from the
# database at most once in this many seconds. A change in the panel clears it.
PUBLIC_TTL = 30.0
_public: tuple[float, list[dict]] | None = None
_lock = threading.Lock()


def public(connect) -> list[dict]:
    """The announcements for everyone. `connect` opens a connection and is
    called only when what is held has grown old."""
    global _public
    with _lock:
        if _public is not None and time.monotonic() - _public[0] < PUBLIC_TTL:
            return _public[1]
    with connect() as conn:
        fresh = shown_to(conn, ["public"])
    with _lock:
        _public = (time.monotonic(), fresh)
    return fresh


def forget() -> None:
    global _public
    with _lock:
        _public = None
