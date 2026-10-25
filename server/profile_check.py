"""Checks on what a person writes about themselves: name, username and biography.

Two outcomes. A block is shown to the person at once and has to be fixed before
the change can be sent: a link, an e-mail address, a phone number, a word that
is offensive whatever the context, a username that could pass for the
institution. A warning travels with the change to the administrator who
approves it: a word that is rude or ambiguous, a social media handle, a name
that looks made up.

Words are compared after the text is lowercased the Turkish way (I to ı, İ to i),
digits and symbols used for letters are read as letters ("s1kt1r") and repeated
letters are squeezed ("siiiktir"). The dotless ı is kept apart from i, so "sık"
is never read as "sik". When the text holds no Turkish letter, nothing says
which keyboard wrote it: a capital I is then read both ways, and a word that is
offensive only in the Turkish reading is flagged rather than blocked. The same
holds for "sik", which is also how "sık" is typed without a Turkish keyboard.

The lists cannot be complete, and are not meant to be: every change is read by
an administrator before anyone else sees it. They catch the obvious cases early
and point the reviewer at the rest.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass

BIO_MAX = 160
NAME_MAX = 60
USERNAME_SHAPE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,23}$")


@dataclass(frozen=True)
class Finding:
    field: str
    code: str
    detail: str | None = None

    def as_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Words
# ---------------------------------------------------------------------------

# Offensive in any context. Compared with the whole word, squeezed.
BLOCK_EXACT = {
    "göt", "götü", "götün", "oç", "piç", "amk", "amq", "puşt",
    "cunt", "cunts", "slut", "sluts", "sluty", "whore", "whores",
}

# Offensive as the start of a word, in the spellings listed. A spelling that is
# also an innocent word is left out ("got", "pic", "oc").
BLOCK_PREFIX = (
    "orospu", "orosbu",
    "siktir", "sikeyim", "sikerim", "sikiyim", "siktiğim", "siktigim", "siktimin",
    "sikiş",
    "yarak", "yarağ", "dalyarak",
    "amcık", "amcik", "amına", "aminakoy", "amınakoy", "amnakoy",
    "götvere", "gotvere", "götlek", "götoş", "piçkurusu", "pickurusu",
    "pezeven", "kahpe", "gavat", "ibne", "kaltak",
    "fahişe", "fahise", "şerefsiz", "serefsiz", "yavşak", "yavsak", "sürtük", "surtuk",
    "fuck", "ashole", "onlyfans",
)

# Stretched or run together inside one word. Matched before squeezing. Only
# forms that no ordinary word contains belong here: "siktir" does not, since
# "eksiktir" and "kesiktir" contain it.
BLOCK_INSIDE = tuple(re.compile(p) for p in (
    r"o+r+o+s+[pb]+u+",
    r"p+e+z+e+v+e+n+k+",
    r"y+a+r{2,}a+[kğ]+",
    r"a+m+[iı]+n+a+k+o+y+",
    r"f+u+c+k+",
    r"n+i+g{2,}(?:e+r+|a+)",
    r"f+a+g{2,}o+t+",
))

# Offensive when the text was written on a Turkish keyboard, ambiguous
# otherwise.
BLOCK_EXACT_TR_KEYBOARD = {"sik", "sikik", "sikim"}

# Rude, insulting or ambiguous: flagged for the reviewer, not blocked.
WARN_EXACT = {
    "sikis", "amina", "mk", "sg", "aq",
    "salak", "aptal", "mal", "dangalak", "ahmak", "lavuk", "ezik", "keko", "yobaz",
    "kıro", "kiro", "gavur", "zenci", "manyak", "beyinsiz", "pust",
    "kancık", "kancik", "taşak", "tasak", "bok", "boktan",
    "dick", "cock", "pussy", "sex", "seks",
    "nazi", "hitler", "pkk", "fetö", "feto", "işid", "isid", "isis", "deaş", "deas",
}
WARN_PREFIX = (
    "gerizekal", "haysiyetsiz", "shit", "bitch", "bastard", "retard", "porn",
    "terörist", "terorist",
)

# Usernames that could pass for the platform or the institution.
RESERVED_EXACT = {
    "admin", "administrator", "root", "sistem", "system", "moderator", "mod",
    "yonetici", "yönetici", "yonetim", "yönetim", "yazem", "aiarc",
    "rektor", "rektör", "rektorluk", "rektörlük", "destek", "support",
    "resmi", "official", "anonim", "anonymous", "null", "undefined",
}
RESERVED_PREFIX = ("admin", "yazem", "yonetici", "yönetici", "rektor", "rektör",
                   "moderator", "official")
INSTITUTIONAL = ("sdu", "bidb", "dekan", "mudur", "müdür", "baskan", "başkan")

TITLE_WORDS = {"prof", "doç", "doc", "dr", "arş", "ars", "gör", "gor", "öğr", "ogr", "uzm"}

SOCIAL = ("instagram", "insta", "twitter", "tiktok", "telegram", "whatsapp",
          "discord", "snapchat", "youtube", "twitch", "facebook", "linkedin", "github")

TLDS = ("com|net|org|edu|gov|info|biz|io|co|me|tv|ly|gl|to|app|dev|xyz|site|online|"
        "link|tr|ru|de|uk|us|ai|gg|ee|cc|fm|sh|tk|ws")


# ---------------------------------------------------------------------------
# Reading the text
# ---------------------------------------------------------------------------

_TR_UPPER = str.maketrans({"I": "ı", "İ": "i"})
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
                       "@": "a", "$": "s", "€": "e", "!": "i"})
_INVISIBLE = re.compile(r"[\u200b-\u200f\u2060\ufeff\u00ad]")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
_TR_LETTERS = set("çğıöşüÇĞİÖŞÜ")
_SPLIT = re.compile(r"[\s.,;:/\\|()\[\]{}\"'’`<>«»?*+=_~^&#%-]+")


def clean(text: str | None) -> str:
    """One line, single spaces, no invisible characters."""
    text = unicodedata.normalize("NFC", text or "")
    text = _INVISIBLE.sub("", text)
    text = _CONTROL.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def lower_tr(text: str) -> str:
    """Lowercase the Turkish way: I is ı and İ is i."""
    return text.translate(_TR_UPPER).lower()


def lower_plain(text: str) -> str:
    """Lowercase the way an English keyboard means it: I is i."""
    return text.replace("İ", "i").lower()


def _letters(word: str) -> str:
    return "".join(c for c in word if c.isalpha())


def _squeeze(word: str) -> str:
    return re.sub(r"(.)\1+", r"\1", word)


def _turkish_keyboard(text: str) -> bool:
    return any(c in _TR_LETTERS for c in text)


def words(reading: str) -> list[tuple[str, str]]:
    """Each word of an already lowercased text as (unsqueezed, squeezed),
    de-leeted.

    A word is split off at spaces and punctuation; digits and the symbols used
    for letters stay inside it so that "s1kt1r" is read as one word. Single
    letters in a row ("s.i.k", "f u c k") are also read as one word.
    """
    out = []

    def add(word):
        if word and (word, _squeeze(word)) not in out:
            out.append((word, _squeeze(word)))

    spelled = []
    for raw in _SPLIT.split(reading):
        raw = raw.lstrip("@").rstrip("!")
        word = _letters(raw.translate(_LEET)) if any(c.isalpha() for c in raw) else ""
        if len(word) == 1:
            spelled.append(word)
            continue
        if len(spelled) >= 3:
            add("".join(spelled))
        spelled = []
        add(word)
    if len(spelled) >= 3:
        add("".join(spelled))
    return out


def _offensive(word: str, sq: str) -> bool:
    return (sq in BLOCK_EXACT or sq.startswith(BLOCK_PREFIX)
            or any(p.search(word) for p in BLOCK_INSIDE))


def _rude(sq: str) -> bool:
    return sq in WARN_EXACT or sq.startswith(WARN_PREFIX)


def _word_findings(field: str, text: str, keyboard: bool | None = None) -> tuple[list, list]:
    """Blocks and warnings for the words of a text.

    keyboard says whether the text was typed on a Turkish keyboard. Left out,
    it is read off the text: a Turkish letter means yes, none means unknown.
    """
    known = _turkish_keyboard(text) if keyboard is None else keyboard
    blocks, warns = [], []

    if known:
        for word, sq in words(lower_tr(text)):
            if _offensive(word, sq) or sq in BLOCK_EXACT_TR_KEYBOARD:
                blocks.append(Finding(field, "profanity", sq))
            elif _rude(sq):
                warns.append(Finding(field, "word", sq))
        return blocks, warns

    # Unknown keyboard: the plain reading decides a block, the Turkish one can
    # only raise a warning, and only for a word the plain reading reads
    # differently.
    plain = words(lower_plain(text))
    for word, sq in plain:
        if _offensive(word, sq):
            blocks.append(Finding(field, "profanity", sq))
        elif _rude(sq) or sq in BLOCK_EXACT_TR_KEYBOARD:
            warns.append(Finding(field, "word", sq))
    read = {sq for _, sq in plain}
    for word, sq in words(lower_tr(text)):
        if sq not in read and (_offensive(word, sq) or _rude(sq)
                               or sq in BLOCK_EXACT_TR_KEYBOARD):
            warns.append(Finding(field, "word", sq))
    return blocks, warns


def _all_words(text: str) -> set[str]:
    readings = {lower_tr(text), lower_plain(text)}
    return {sq for r in readings for _, sq in words(r)}


# ---------------------------------------------------------------------------
# Contact details
# ---------------------------------------------------------------------------

_URL = re.compile(
    r"(?i)(?:https?://|www\.)\S+"
    r"|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:" + TLDS + r")\b(?:/\S*)?")
_URL_SPELLED = re.compile(r"(?i)\b(?:nokta|dot)\s*(?:com|net|org|tr)\b")
_EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}")
_HANDLE = re.compile(r"(?<![\w@])@[A-Za-z0-9_.]{2,}")
_DIGIT_RUN = re.compile(r"\+?\d[\d\s().-]*\d")
# Names of technologies that are written like a web address.
_TECH_NAMES = re.compile(
    r"(?i)\b(?:asp|vb|ado|ml)\.net\b|\b[a-z0-9]+\.js\b|\bsocket\.io\b")


def _phone(run: str) -> bool:
    """A Turkish number, mobile or fixed line, with or without 0 or +90 in
    front, or any number written with a + in front. An ORCID iD, an ISBN or a
    list of years is none of these."""
    digits = "".join(c for c in run if c.isdigit())
    if run.startswith("+"):
        return 11 <= len(digits) <= 15
    if len(digits) == 12 and digits.startswith("90"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return len(digits) == 10 and digits[0] in "2345"


def _contact_findings(field: str, text: str) -> tuple[list, list]:
    blocks, warns = [], []
    plain = _TECH_NAMES.sub(" ", text)
    if _EMAIL.search(plain):
        blocks.append(Finding(field, "email"))
    elif _URL.search(plain):
        blocks.append(Finding(field, "link"))
    elif _URL_SPELLED.search(plain):
        warns.append(Finding(field, "link_like"))
    if any(_phone(run) for run in _DIGIT_RUN.findall(text)):
        blocks.append(Finding(field, "phone"))
    if _HANDLE.search(text) and not _EMAIL.search(text):
        warns.append(Finding(field, "handle"))
    low = lower_plain(text)
    social = [s for s in SOCIAL if re.search(rf"\b{s}\b", low)]
    if social:
        warns.append(Finding(field, "social", social[0]))
    return blocks, warns


# ---------------------------------------------------------------------------
# The fields
# ---------------------------------------------------------------------------

def check_name(field: str, value: str) -> tuple[list, list]:
    blocks, warns = [], []
    if any(not (c.isalpha() or c in " '’-.") for c in value):
        blocks.append(Finding(field, "characters"))
    elif sum(c.isalpha() for c in value) < 2:
        blocks.append(Finding(field, "too_short"))
    elif len(value) > NAME_MAX:
        blocks.append(Finding(field, "name_too_long"))
    b, w = _word_findings(field, value)
    blocks += b
    warns += w
    if _all_words(value) & TITLE_WORDS:
        warns.append(Finding(field, "title_in_name"))
    return _unique(blocks), _unique(warns)


def check_username(value: str) -> tuple[list, list]:
    """A username is lowercase ASCII by its shape, so nothing in it tells which
    keyboard wrote it."""
    blocks, warns = [], []
    if not USERNAME_SHAPE.match(value):
        return [Finding("username", "shape")], []
    parts = [p for p in re.split(r"[._-]+", value) if p]
    compact = "".join(parts)
    if (set(parts) & RESERVED_EXACT or compact in RESERVED_EXACT
            or compact.startswith(RESERVED_PREFIX)):
        blocks.append(Finding("username", "reserved"))
    if "." in value and re.fullmatch(TLDS, value.rsplit(".", 1)[1]):
        blocks.append(Finding("username", "domain_like"))
    b, w = _word_findings("username", " ".join(parts), keyboard=False)
    blocks += b
    warns += w
    # Run together, the parts can spell what none of them does alone. Only the
    # short forms are certain enough to block: a name and a surname can run
    # into one of the longer ones by accident.
    letters = _letters(compact.translate(_LEET))
    if not b and _squeeze(letters) in BLOCK_EXACT:
        blocks.append(Finding("username", "profanity", letters))
    elif not b and any(p.search(letters) for p in BLOCK_INSIDE):
        warns.append(Finding("username", "word", letters))
    if any(p in INSTITUTIONAL for p in parts) or compact.startswith(INSTITUTIONAL):
        warns.append(Finding("username", "institutional"))
    return _unique(blocks), _unique(warns)


def check_bio(value: str) -> tuple[list, list]:
    blocks, warns = [], []
    if len(value) > BIO_MAX:
        blocks.append(Finding("bio", "too_long", str(len(value))))
    b, w = _contact_findings("bio", value)
    blocks += b
    warns += w
    b, w = _word_findings("bio", value)
    blocks += b
    warns += w
    if re.search(r"(.)\1{4,}", value):
        warns.append(Finding("bio", "repeated"))
    letters = [c for c in value if c.isalpha()]
    if len(letters) >= 12 and sum(c.isupper() for c in letters) / len(letters) >= 0.8:
        warns.append(Finding("bio", "caps"))
    return _unique(blocks), _unique(warns)


def check_profile(given_name: str, family_name: str, username: str,
                  bio: str | None) -> tuple[list[Finding], list[Finding]]:
    """Every block and warning for one profile, fields in form order."""
    blocks, warns = [], []
    for b, w in (check_name("given_name", given_name),
                 check_name("family_name", family_name),
                 check_username(username),
                 check_bio(bio) if bio else ([], [])):
        blocks += b
        warns += w
    return _unique(blocks), _unique(warns)


def _unique(findings: list[Finding]) -> list[Finding]:
    seen, out = set(), []
    for f in findings:
        key = (f.field, f.code)
        if key not in seen:
            seen.add(key)
            out.append(f)
    return out


# What the person reads when something is blocked. The interface has its own
# wording per code and falls back to these.
MESSAGES_TR = {
    "characters": "Bu alanda yalnızca harf, boşluk, nokta, kesme işareti ve kısa çizgi "
                  "kullanılabilir.",
    "too_short": "Bu alan en az iki harf olmalı.",
    "name_too_long": f"Bu alan en çok {NAME_MAX} karakter olabilir.",
    "profanity": "Bu alanda uygun olmayan bir ifade var.",
    "email": "E-posta adresi eklenemez.",
    "link": "Bağlantı ya da web adresi eklenemez.",
    "phone": "Telefon numarası eklenemez.",
    "too_long": f"Biyografi en çok {BIO_MAX} karakter olabilir.",
    "shape": "Kullanıcı adı 3 ile 24 karakter arasında olmalı ve harf ya da rakamla "
             "başlamalı. Harf, rakam, nokta, alt çizgi ve kısa çizgi kullanılabilir. Türkçeye "
             "özgü harfler (ç, ğ, ı, ö, ş, ü) kullanılamaz.",
    "reserved": "Bu kullanıcı adı kullanılamaz.",
    "domain_like": "Kullanıcı adı bir web adresine benzememeli.",
}
