"""The demo: a second copy of the platform, on made-up people, behind a password.

The real platform is served at / and its API at /api. The demo is the same
interface and the same API served again under /demo/, and every request that
arrives there runs in demo mode:

  * it reads and writes the demo database (DEMO_DATABASE_URL, or the platform's
    own database name with "_demo" added), never the platform's;
  * nobody signs in with an e-mailed code there. A visitor who knows the demo
    password (YAZEM_DEMO_PASSWORD) picks one of four made-up people and is
    signed in as them with a cookie of the demo's own, signed with a key of
    its own, so a demo cookie opens nothing on the real platform and a real
    session cookie opens nothing in the demo;
  * nothing is mailed.

The demo database is created, brought up to date and filled by this process
(demo_data.py makes the campus), and made again after midnight so its "last
seven days" are always the last seven days. Each time it is made in a new
database that then takes the old one's place, so nothing a visitor changed
outlasts the day. With either setting missing the demo is off: the button is
not shown and /demo/ says so.
"""

from __future__ import annotations

import contextvars
import hashlib
import hmac
import logging
import os
import sys
import threading
import time
from datetime import timedelta
from pathlib import Path

import psycopg
from psycopg import conninfo

log = logging.getLogger("yazem.demo")

ACTIVE: contextvars.ContextVar[bool] = contextvars.ContextVar("yazem_demo", default=False)

COOKIE = "demo_session"
# Long enough to show the platform to a room, short enough that a cookie left
# on a shared computer does not stay useful.
TTL = timedelta(hours=8)
PERSONAS = ("student", "academic", "admin_staff", "admin")
# Wrong passwords allowed from one address in an hour.
TRIES_PER_HOUR = 10

ROOT = Path(__file__).resolve().parent.parent


def active() -> bool:
    """Whether the request being served came in through /demo/."""
    return ACTIVE.get()


def password() -> str | None:
    return os.environ.get("YAZEM_DEMO_PASSWORD") or None


def dsn() -> str | None:
    """The demo database: DEMO_DATABASE_URL, or the platform's own database
    on the same server with "_demo" added to its name."""
    explicit = os.environ.get("DEMO_DATABASE_URL")
    if explicit:
        return explicit
    main = os.environ.get("DATABASE_URL")
    if not main:
        return None
    try:
        parts = conninfo.conninfo_to_dict(main)
    except psycopg.ProgrammingError:
        return None
    parts["dbname"] = f"{parts.get('dbname') or 'yazem'}_demo"
    return conninfo.make_conninfo(**parts)


def enabled() -> bool:
    return bool(password() and dsn())


def password_ok(given: str) -> bool:
    """Compared through digests, so the time taken says nothing about the
    password's length or how much of it was right."""
    wanted = password()
    if not wanted:
        return False
    return hmac.compare_digest(hashlib.sha256(given.encode()).digest(),
                               hashlib.sha256(wanted.encode()).digest())


def session_key(secret: bytes) -> bytes:
    """The demo signs its cookies with a key of its own, made from the
    platform's, so the two kinds of cookie can never stand in for each other."""
    return hmac.new(secret, b"yazem-demo-session", hashlib.sha256).digest()


class Mount:
    """Everything served under this wrapper runs in demo mode."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        token = ACTIVE.set(True)
        try:
            await self.app(scope, receive, send)
        finally:
            ACTIVE.reset(token)


# ---------------------------------------------------------------------------
# Keeping the demo database ready
# ---------------------------------------------------------------------------

_state = {"status": "idle", "error": None, "made_at": None}
_state_lock = threading.Lock()
# One making at a time: the background check and anything else that asks.
_making = threading.Lock()
# Whether this process has brought the demo database's schema up to date. A
# new release arrives with a restart, so once per process is enough, and the
# check every ten minutes after that is a single query.
_prepared = threading.Event()


def status() -> dict:
    with _state_lock:
        return dict(_state)


def _set(**kw) -> None:
    with _state_lock:
        _state.update(kw)


def _name() -> str:
    return conninfo.conninfo_to_dict(dsn()).get("dbname") or "yazem_demo"


def _server() -> psycopg.Connection:
    """A connection for creating, renaming and dropping databases: the
    platform's own database, or the server's "postgres" one."""
    main = os.environ.get("DATABASE_URL") or conninfo.make_conninfo(dsn(), dbname="postgres")
    return psycopg.connect(main, autocommit=True, connect_timeout=5)


def _found() -> dict | None:
    """What the demo database says about itself; None when there is no
    database yet or nothing in it."""
    import demo_data
    with _server() as server:
        there = server.execute("SELECT 1 FROM pg_database WHERE datname = %s",
                               (_name(),)).fetchone()
    if there is None:
        return None
    with psycopg.connect(dsn(), connect_timeout=5) as conn:
        return demo_data.meta(conn)


def migrate(target: str | None = None) -> None:
    """Apply the platform's migrations and seeds to a demo database."""
    sys.path.insert(0, str(ROOT / "deploy"))
    import migrate as runner                 # deploy/migrate.py
    code = runner.migrate(target or dsn(), seed=True, quiet=True)
    if code != 0:
        raise RuntimeError(f"demo database migration stopped with code {code}")


def _rebuild() -> dict:
    """Make today's demo in a new database, then put it in place of the old one.

    Visitors keep using the old demo until the moment the names are swapped.
    A new database each time also means that every setting and every list the
    panel can change (units, e-mail domains, the rule for showing answers)
    starts the day as a new installation has it, whatever a visitor did to it
    the day before.
    """
    import demo_data
    from psycopg import sql

    name = _name()
    fresh, old = f"{name}_next", f"{name}_old"
    ident = sql.Identifier
    with _server() as server:
        for leftover in (fresh, old):
            server.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(ident(leftover)))
        server.execute(sql.SQL("CREATE DATABASE {}").format(ident(fresh)))
    target = conninfo.make_conninfo(dsn(), dbname=fresh)
    migrate(target)
    with psycopg.connect(target) as conn:
        out = demo_data.generate(conn)
    with _server() as server:
        for _ in range(50):
            try:
                if server.execute("SELECT 1 FROM pg_database WHERE datname = %s",
                                  (name,)).fetchone():
                    # Requests open a connection each, so ending the open ones
                    # frees the name; one that slips in between is tried again.
                    server.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity"
                                   " WHERE datname = %s AND pid <> pg_backend_pid()", (name,))
                    server.execute(sql.SQL("ALTER DATABASE {} RENAME TO {}")
                                   .format(ident(name), ident(old)))
                server.execute(sql.SQL("ALTER DATABASE {} RENAME TO {}")
                               .format(ident(fresh), ident(name)))
                break
            except psycopg.errors.ObjectInUse:
                time.sleep(0.1)
        else:
            raise RuntimeError(f"the demo database {name} stayed in use")
        server.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(ident(old)))
    return out


def refresh(force: bool = False) -> dict | None:
    """Make the demo again when it is missing, out of date or from another day.

    On a server (YAZEM_DEMO_PREPARE=1, the default) the demo is made in a new
    database that then takes the old one's place. With YAZEM_DEMO_PREPARE=0 the
    database is someone else's to make, and the demo is written into it as it
    is."""
    import demo_data

    prepare = os.environ.get("YAZEM_DEMO_PREPARE", "1") == "1"
    with _making:
        found = _found()
        if prepare and found is not None and not _prepared.is_set():
            # A new release may bring migrations. The demo's database takes
            # them as the platform's does, so it never runs behind the code.
            migrate()
        if prepare:
            _prepared.set()
        if not force and not demo_data.stale(found):
            _set(status="ready", made_at=found.get("made_at"), error=None)
            return found
        _set(status="making" if found is None else "remaking", error=None)
        if prepare:
            out = _rebuild()
        else:
            with psycopg.connect(dsn(), connect_timeout=5) as conn:
                out = demo_data.generate(conn)
        # Pictures and attachments uploaded in yesterday's demo belong to nothing now.
        import storage
        storage.empty_demo()
    _set(status="ready", made_at=out["made_at"], error=None)
    log.warning("demo made: %s people, %s answers, %ss", out["people"], out["answers"],
                out["seconds"])
    return out


def keep_fresh(every: float = 600.0) -> threading.Thread:
    """Check the demo now and every ten minutes after, in the background. A
    new day finds the demo stale and it is made again."""
    def run():
        while True:
            try:
                refresh()
            except Exception as exc:          # noqa: BLE001 - the platform keeps running
                # Prepared again on the next try: the database may be what failed.
                _prepared.clear()
                _set(status="failed", error=(str(exc).splitlines() or [type(exc).__name__])[0][:200])
                print(f"warning: the demo could not be prepared: {exc}", file=sys.stderr)
            time.sleep(every)

    thread = threading.Thread(target=run, name="demo", daemon=True)
    thread.start()
    return thread


def problems() -> list[str]:
    """Settings that look like a mistake, said at start-up. An empty password
    is not one: it is how the demo is kept off."""
    pw = password()
    if pw and len(pw) < 8:
        return ["YAZEM_DEMO_PASSWORD is shorter than 8 characters; anyone could guess it"]
    return []

