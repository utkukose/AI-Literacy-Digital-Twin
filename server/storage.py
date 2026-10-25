"""Where attachment bytes live.

Split out so that the one thing which changes between a laptop and a
deployment, the bucket, lives in a single module. The local backend writes to
a directory; setting YAZEM_STORAGE_BUCKET switches to object storage without
touching any caller.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import demo

ROOT = Path(os.environ.get("YAZEM_STORAGE_DIR", "/tmp/yazem-files"))
# The demo's files, apart from the platform's: nothing done in the demo can
# write over, or delete, a file the platform serves. Emptied each time the demo
# is made again, since the new demo refers to none of them.
DEMO_ROOT = ROOT / "demo"


class NotStored(FileNotFoundError):
    """Asked for bytes that are not there."""


def _path(key: str) -> Path:
    # Keys are built by the server, never by a client, but a key that escaped
    # the root would be a file read anywhere on the box.
    safe = Path(key)
    if safe.is_absolute() or ".." in safe.parts:
        raise ValueError(f"unsafe storage key: {key}")
    return (DEMO_ROOT if demo.active() else ROOT) / safe


def put(key: str, data: bytes) -> None:
    target = _path(key)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def fetch(key: str) -> bytes:
    target = _path(key)
    if not target.is_file():
        raise NotStored(key)
    return target.read_bytes()


def drop(key: str) -> None:
    target = _path(key)
    if target.is_file():
        target.unlink()


def empty_demo() -> None:
    """Forget every file uploaded in the demo."""
    shutil.rmtree(DEMO_ROOT, ignore_errors=True)
