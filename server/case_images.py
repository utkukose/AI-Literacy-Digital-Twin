"""The picture a case is shown with.

A case's picture is either one uploaded in the panel, kept in the file store,
or one that comes with the case bank as cases/images/<key>.webp. An uploaded
picture is shown in the bank's place, and removing it brings the bank's back.

A picture is judged by its bytes, never by the name or type a browser sends:
it has to be a PNG, JPEG or WebP whose header gives sensible dimensions. The
server reads the header only and never decodes the picture itself.
"""

from __future__ import annotations

import hashlib
import re
import struct
import threading
from pathlib import Path

import psycopg

import storage

KEY_SHAPE = re.compile(r"^[a-z0-9][A-Za-z0-9-]{4,60}$")
MAX_BYTES = 3 * 1024 * 1024
MAX_SIDE = 4000
MIN_WIDTH, MIN_HEIGHT = 300, 200

BANK_DIR = "images"
BANK_SUFFIXES = (".webp", ".jpg", ".jpeg", ".png")
EXTENSION = {"image/webp": "webp", "image/png": "png", "image/jpeg": "jpg"}

# Markers that start a JPEG frame and carry its size. C4, C8 and CC share the
# range but are tables, not frames.
_JPEG_FRAMES = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE,
                0xCF}


class Refused(ValueError):
    """Bytes that are not an acceptable picture, with the reason in the panel's
    words, in Turkish and in English."""

    def __init__(self, tr: str, en: str):
        super().__init__(tr)
        self.en = en

    def text(self, locale: str) -> str:
        return self.en if locale == "en" else str(self)


def _not_a_picture() -> Refused:
    return Refused("Yalnızca PNG, JPEG ya da WebP biçiminde bir görsel yüklenebilir.",
                   "Only a PNG, JPEG or WebP picture can be uploaded.")


def sniff(data: bytes) -> tuple[str, int, int]:
    """The media type, width and height that the header declares."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        if len(data) < 24 or data[12:16] != b"IHDR":
            raise _not_a_picture()
        width, height = struct.unpack(">II", data[16:24])
        return "image/png", width, height

    if data[:3] == b"\xff\xd8\xff":
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                raise _not_a_picture()
            marker = data[i + 1]
            if marker == 0xFF:
                i += 1
                continue
            if marker == 0x01 or 0xD0 <= marker <= 0xD8:
                i += 2
                continue
            length = struct.unpack(">H", data[i + 2:i + 4])[0]
            if marker in _JPEG_FRAMES:
                height, width = struct.unpack(">HH", data[i + 5:i + 9])
                return "image/jpeg", width, height
            if length < 2:
                raise _not_a_picture()
            i += 2 + length
        raise _not_a_picture()

    if data[:4] == b"RIFF" and data[8:12] == b"WEBP" and len(data) >= 30:
        chunk = data[12:16]
        if chunk == b"VP8 ":
            if data[23:26] != b"\x9d\x01\x2a":
                raise _not_a_picture()
            width, height = struct.unpack("<HH", data[26:30])
            return "image/webp", width & 0x3FFF, height & 0x3FFF
        if chunk == b"VP8L":
            if data[20] != 0x2F:
                raise _not_a_picture()
            bits = int.from_bytes(data[21:25], "little")
            return "image/webp", (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
        if chunk == b"VP8X":
            width = int.from_bytes(data[24:27], "little") + 1
            height = int.from_bytes(data[27:30], "little") + 1
            return "image/webp", width, height
    raise _not_a_picture()


def check(data: bytes) -> tuple[str, int, int]:
    """sniff, plus the limits a case picture has to keep to."""
    if not data:
        raise Refused("Dosya boş.", "The file is empty.")
    if len(data) > MAX_BYTES:
        raise Refused("Görsel en çok 3 MB olabilir.", "A picture can be at most 3 MB.")
    media_type, width, height = sniff(data)
    if width > MAX_SIDE or height > MAX_SIDE:
        raise Refused(f"Görselin kenarları en çok {MAX_SIDE} piksel olabilir.",
                      f"A picture's sides can be at most {MAX_SIDE} pixels.")
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        raise Refused(f"Görsel en az {MIN_WIDTH} × {MIN_HEIGHT} piksel olmalı.",
                      f"A picture must be at least {MIN_WIDTH} × {MIN_HEIGHT} pixels.")
    return media_type, width, height


def strip_metadata(data: bytes, media_type: str) -> bytes:
    """The picture without what a camera or an editor writes alongside it:
    location, device, dates, comments. The picture itself is not touched.

    The panel already sends a picture redrawn in the browser, which carries
    none of this; the server removes it anyway, whatever sent the file."""
    if media_type == "image/jpeg":
        out, i = bytearray(data[:2]), 2
        while i + 4 <= len(data):
            if data[i] != 0xFF:
                raise _not_a_picture()
            marker = data[i + 1]
            if marker == 0xFF:
                i += 1
                continue
            if marker == 0xDA:                       # the image data starts here
                out += data[i:]
                return bytes(out)
            if marker == 0x01 or 0xD0 <= marker <= 0xD8:
                out += data[i:i + 2]
                i += 2
                continue
            length = struct.unpack(">H", data[i + 2:i + 4])[0]
            segment = data[i:i + 2 + length]
            # APP1 (Exif, XMP), APP13 (IPTC) and comments go.
            if marker not in (0xE1, 0xED, 0xFE):
                out += segment
            i += 2 + length
        raise _not_a_picture()

    if media_type == "image/png":
        out, i = bytearray(data[:8]), 8
        while i + 12 <= len(data):
            length = struct.unpack(">I", data[i:i + 4])[0]
            kind = data[i + 4:i + 8]
            chunk = data[i:i + 12 + length]
            if kind not in (b"eXIf", b"tEXt", b"zTXt", b"iTXt", b"tIME"):
                out += chunk
            i += 12 + length
            if kind == b"IEND":
                return bytes(out)
        raise _not_a_picture()

    if media_type == "image/webp":
        if data[12:16] != b"VP8X":
            return data
        body, i = bytearray(), 12
        while i + 8 <= len(data):
            kind = data[i:i + 4]
            length = struct.unpack("<I", data[i + 4:i + 8])[0]
            chunk = data[i:i + 8 + length + (length & 1)]
            if kind not in (b"EXIF", b"XMP "):
                body += chunk
            i += 8 + length + (length & 1)
        body[8] &= ~0x0C & 0xFF                      # the Exif and XMP flags
        return b"RIFF" + struct.pack("<I", 4 + len(body)) + b"WEBP" + bytes(body)

    return data


def version_of(digest: bytes) -> str:
    """The token a picture's address carries, so a new picture is a new address."""
    return digest.hex()[:12]


# ---------------------------------------------------------------------------
# The bank's own pictures
# ---------------------------------------------------------------------------

_DIGESTS: dict[str, tuple[int, int, bytes]] = {}
_DIGESTS_LOCK = threading.Lock()


def bank_file(root: Path, key: str) -> Path | None:
    if not KEY_SHAPE.match(key):
        return None
    folder = Path(root) / BANK_DIR
    for suffix in BANK_SUFFIXES:
        path = folder / f"{key}{suffix}"
        if path.is_file():
            return path
    return None


def _bank_digest(path: Path) -> bytes:
    stat = path.stat()
    with _DIGESTS_LOCK:
        hit = _DIGESTS.get(str(path))
    if hit and hit[0] == stat.st_mtime_ns and hit[1] == stat.st_size:
        return hit[2]
    digest = hashlib.sha256(path.read_bytes()).digest()
    with _DIGESTS_LOCK:
        _DIGESTS[str(path)] = (stat.st_mtime_ns, stat.st_size, digest)
    return digest


def _bank_versions(root: Path) -> dict[str, str]:
    folder = Path(root) / BANK_DIR
    if not folder.is_dir():
        return {}
    out: dict[str, str] = {}
    for path in sorted(folder.iterdir()):
        if path.suffix.lower() not in BANK_SUFFIXES or not KEY_SHAPE.match(path.stem):
            continue
        if path.stem in out or not path.is_file():
            continue
        out[path.stem] = version_of(_bank_digest(path))
    return out


# ---------------------------------------------------------------------------
# What a case is shown with
# ---------------------------------------------------------------------------

def described(conn: psycopg.Connection, root: Path, keys=None) -> dict[str, dict]:
    """For each case that has a picture: its version and where it comes from."""
    bank = _bank_versions(root)
    uploaded = conn.execute(
        "SELECT case_key, sha256, width, height, byte_size, uploaded_at"
        " FROM app.case_image").fetchall()
    out = {key: {"version": v, "source": "bank", "bank": True} for key, v in bank.items()}
    for key, digest, width, height, size, at in uploaded:
        out[key] = {"version": version_of(bytes(digest)), "source": "upload",
                    "bank": key in bank, "width": width, "height": height,
                    "bytes": size, "uploaded_at": at.isoformat()}
    if keys is not None:
        wanted = set(keys)
        out = {k: v for k, v in out.items() if k in wanted}
    return out


def versions(conn: psycopg.Connection, root: Path, keys) -> dict[str, str]:
    return {k: v["version"] for k, v in described(conn, root, keys).items()}


def picture(conn: psycopg.Connection, root: Path, key: str):
    """(bytes, media type, version) for a case, or None."""
    if not KEY_SHAPE.match(key):
        return None
    row = conn.execute(
        "SELECT storage_key, media_type, sha256 FROM app.case_image WHERE case_key = %s",
        (key,)).fetchone()
    if row is not None:
        try:
            return storage.fetch(row[0]), row[1], version_of(bytes(row[2]))
        except storage.NotStored:
            pass
    path = bank_file(root, key)
    if path is None:
        return None
    data = path.read_bytes()
    try:
        media_type, _, _ = sniff(data)
    except Refused:
        return None
    return data, media_type, version_of(_bank_digest(path))


def store(conn: psycopg.Connection, key: str, data: bytes, admin_user_id: int) -> dict:
    """Keep a picture for a case. Returns what was stored and the storage key of
    the picture it replaces, which the caller drops once the change is
    committed."""
    media_type, width, height = check(data)
    data = strip_metadata(data, media_type)
    if sniff(data) != (media_type, width, height):
        raise _not_a_picture()
    digest = hashlib.sha256(data).digest()
    storage_key = f"case-images/{key}-{digest.hex()[:16]}.{EXTENSION[media_type]}"
    old = conn.execute("SELECT storage_key FROM app.case_image WHERE case_key = %s",
                       (key,)).fetchone()
    storage.put(storage_key, data)
    try:
        conn.execute(
            "INSERT INTO app.case_image (case_key, storage_key, media_type, byte_size, width,"
            "                            height, sha256, uploaded_by)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
            " ON CONFLICT (case_key) DO UPDATE SET storage_key = EXCLUDED.storage_key,"
            "   media_type = EXCLUDED.media_type, byte_size = EXCLUDED.byte_size,"
            "   width = EXCLUDED.width, height = EXCLUDED.height, sha256 = EXCLUDED.sha256,"
            "   uploaded_by = EXCLUDED.uploaded_by, uploaded_at = now()",
            (key, storage_key, media_type, len(data), width, height, digest, admin_user_id))
    except psycopg.Error:
        if not old or old[0] != storage_key:
            storage.drop(storage_key)
        raise
    replaced = old[0] if old and old[0] != storage_key else None
    return {"version": version_of(digest), "media_type": media_type, "width": width,
            "height": height, "bytes": len(data), "sha256": digest.hex(),
            "replaced": replaced}


def remove(conn: psycopg.Connection, key: str) -> str | None:
    """Forget the uploaded picture of a case. Returns its storage key for the
    caller to drop once the change is committed, or None if there was none."""
    row = conn.execute("DELETE FROM app.case_image WHERE case_key = %s RETURNING storage_key",
                       (key,)).fetchone()
    return row[0] if row else None
