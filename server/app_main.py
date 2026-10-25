"""The service, assembled.

One entry point, so there is one place that knows which routers exist and one
place that decides whether this process is fit to serve.

Everything checked here is checked before the first request, so a
misconfigured deployment refuses to start and says why in its logs.
"""

from __future__ import annotations

import mimetypes
import os
import sys
from pathlib import Path

import psycopg
from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

REQUIRED_ENV = {
    "DATABASE_URL": "the database to serve from",
    "SESSION_SECRET": "signs session cookies; rotating it signs everyone out",
    "YAZEM_MASTER_KEY": "encrypts addresses and keys the address lookup; never rotated",
    "YAZEM_SMTP_HOST": "the relay verification codes are sent through",
}

# Migrations this build expects to find applied, read from the folder.
ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = ROOT / "deploy" / "migrations"

# What a page of the interface may load: its own files, fonts included, and
# nothing from another host. React and the screens write styles inline, so
# inline styles are allowed; scripts are not.
PAGE_POLICY = ("default-src 'self'; script-src 'self'; "
               "style-src 'self' 'unsafe-inline'; "
               "font-src 'self'; img-src 'self' data:; "
               "connect-src 'self'; object-src 'none'; base-uri 'self'; "
               "form-action 'self'; frame-ancestors 'none'")
# Anything else opened on its own (an answer from the API, a picture or a text
# file attached to a case) runs nothing. A PDF is left to the browser's reader,
# which a policy would stop from opening.
OTHER_POLICY = "default-src 'none'; frame-ancestors 'none'; sandbox"

# Request bodies. Case files are uploaded through two routes, and pictures for
# cases and for marks and medals through two more; everything else is a form
# or a case body.
BODY_LIMIT = 1_000_000
UPLOAD_LIMIT = 16 * 1024 * 1024
UPLOAD_ROUTES = ("/api/authoring/import",)
IMAGE_LIMIT = 4 * 1024 * 1024


def body_limit(method: str | None, path: str) -> int:
    if method == "POST" and (path.endswith("/files") or path in UPLOAD_ROUTES):
        return UPLOAD_LIMIT
    if method == "POST" and ("/admin/cases/" in path or "/admin/awards/" in path) \
            and path.endswith("/image"):
        return IMAGE_LIMIT
    return BODY_LIMIT


class _BodyTooLarge(HTTPException):
    """Raised while a body without a declared length is read. FastAPI passes an
    HTTPException on unchanged, so the client gets a 413 either way."""

    def __init__(self):
        super().__init__(413, "request too large")


class LimitBody:
    """Refuses a request body over its route's limit before reading it all."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = body_limit(scope.get("method"), scope.get("path", ""))
        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            return await self._refuse(send)
        received = 0

        async def counted():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _BodyTooLarge()
            return message

        try:
            await self.app(scope, counted, send)
        except _BodyTooLarge:
            await self._refuse(send)

    @staticmethod
    async def _refuse(send):
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": b'{"detail":"request too large"}'})


class SecurityHeaders:
    """Headers every response carries."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        https = scope.get("scheme") == "https"

        async def with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                kind = dict(headers).get(b"content-type", b"").split(b";")[0].strip()
                extra = [(b"x-content-type-options", b"nosniff"),
                         (b"x-frame-options", b"DENY"),
                         (b"referrer-policy", b"same-origin")]
                # A response without a type carries no policy. That covers a 304:
                # the browser copies its headers onto the page it already holds,
                # so a policy here would replace the page's own.
                if kind == b"text/html":
                    extra.append((b"content-security-policy", PAGE_POLICY.encode()))
                elif kind and kind != b"application/pdf":
                    extra.append((b"content-security-policy", OTHER_POLICY.encode()))
                if https:
                    extra.append((b"strict-transport-security", b"max-age=31536000"))
                present = {k.lower() for k, _ in headers}
                headers += [(k, v) for k, v in extra if k not in present]
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, with_headers)


def expected_migrations() -> list[str]:
    if not MIGRATIONS_DIR.is_dir():
        return []
    return sorted(p.name for p in MIGRATIONS_DIR.glob("*.sql"))


def preflight() -> list[str]:
    """Everything that would make this process unfit to serve."""
    problems: list[str] = []

    for name, why in REQUIRED_ENV.items():
        if not os.environ.get(name):
            problems.append(f"{name} is not set — {why}")

    key = os.environ.get("YAZEM_MASTER_KEY", "")
    try:
        raw = bytes.fromhex(key) if len(key) == 64 else key.encode()
    except ValueError:
        raw = b""
    if key and len(raw) != 32:
        problems.append("YAZEM_MASTER_KEY must be 32 bytes (64 hex characters)")

    if os.environ.get("YAZEM_SMTP_HOST"):
        import mailer
        try:
            if mailer.MailConfig.from_env().plaintext_login:
                problems.append(mailer.PLAINTEXT_PROBLEM)
        except ValueError as exc:
            problems.append(str(exc))

    dsn = os.environ.get("DATABASE_URL")
    if dsn:
        try:
            with psycopg.connect(dsn, connect_timeout=5) as conn:
                rows = conn.execute(
                    "SELECT filename FROM public.schema_migration"
                ).fetchall()
                have = {r[0] for r in rows}
                missing = [m for m in expected_migrations() if m not in have]
                if missing:
                    problems.append(
                        "database is behind this build; run deploy/migrate.py "
                        f"(missing: {', '.join(missing)})"
                    )
                elif not problems:
                    problems.extend(check_key(conn))
        except psycopg.errors.UndefinedTable:
            problems.append("database has never been migrated; run deploy/migrate.py")
        except psycopg.Error as exc:
            problems.append(f"cannot reach the database: {str(exc).strip().splitlines()[0]}")

    return problems


def check_key(conn: psycopg.Connection) -> list[str]:
    """Compare YAZEM_MASTER_KEY with the key this database was first served with.

    The first start records the key's fingerprint. Addresses are looked up by a
    hash derived from the key, so a database served with a different key would
    not recognise anyone and would open a second account for every person.
    """
    import mailer

    current = mailer.key_fingerprint()
    row = conn.execute("SELECT fingerprint FROM app.deployment_key WHERE id = 1").fetchone()
    if row is None:
        conn.execute("INSERT INTO app.deployment_key (id, fingerprint) VALUES (1, %s)"
                     " ON CONFLICT (id) DO NOTHING", (current,))
        conn.commit()
        return []
    if row[0] != current:
        return ["YAZEM_MASTER_KEY is not the key this database was created with; "
                "restore the original key (see docs/TASINMA.md)"]
    return []


def build_app():
    """Assemble the system: the API under /api, the built interface at /.

    One origin, so there is no CORS to configure and the session cookie works
    without SameSite tuning.

    Imported after preflight so that a misconfigured process fails on the
    configuration check itself.
    """
    import admin_api
    import authoring_api
    from api import app as api, db

    api.include_router(admin_api.router)
    api.include_router(authoring_api.router)

    @api.get("/readyz", include_in_schema=False)
    def readyz(conn: psycopg.Connection = Depends(db)) -> dict:
        """Readiness touches the database, because a process that cannot reach
        it should not be sent traffic."""
        conn.execute("SELECT 1")
        return {"status": "ready"}

    shell = FastAPI(title="SDÜ Yapay Zeka Okuryazarlığı", docs_url=None, redoc_url=None,
                    openapi_url=None)
    shell.add_middleware(SecurityHeaders)
    shell.add_middleware(LimitBody)

    @shell.get("/healthz", include_in_schema=False)
    def healthz() -> dict:
        """Liveness only, independent of the database, so the service stays in
        rotation through a brief database outage."""
        return {"status": "ok"}

    shell.mount("/api", api)

    ui = Path(os.environ.get("YAZEM_UI_DIR", str(ROOT / "dist" / "app")))
    # Not every system's type table knows the font format.
    mimetypes.add_type("font/woff2", ".woff2")

    # The demo: the same interface and API again under /demo/, where every
    # request runs on the demo's database and the demo's cookie (demo.py).
    import demo
    from starlette.applications import Starlette
    from starlette.routing import Mount
    routes = [Mount("/api", app=api)]
    if ui.is_dir():
        routes.append(Mount("/", app=StaticFiles(directory=str(ui), html=True)))
    # /demo without its slash would load the page with the platform's own
    # API as its base, so it is sent to /demo/ first.
    from starlette.responses import RedirectResponse
    shell.add_route("/demo", lambda request: RedirectResponse("demo/", status_code=308),
                    include_in_schema=False)
    shell.mount("/demo", demo.Mount(Starlette(routes=routes)), name="demo")

    if ui.is_dir():
        # html=True serves index.html for the root; the application is a single
        # page and keeps its own state, so there are no other paths to route.
        shell.mount("/", StaticFiles(directory=str(ui), html=True), name="ui")
    else:
        print(f"! no interface built at {ui} — serving the API only. "
              f"Run: npm run build", file=sys.stderr)

    return shell


def warnings() -> list[str]:
    """Things worth saying out loud that are not reasons to refuse.

    SESSION_COOKIE_INSECURE is the right setting for a local trial over plain
    http, so it is reported as a warning.
    """
    import demo
    out: list[str] = list(demo.problems())
    if os.environ.get("SESSION_COOKIE_INSECURE") == "1":
        out.append(
            "SESSION_COOKIE_INSECURE=1 — session cookies will travel over plain "
            "http. Right for a local trial; remove it the day a certificate lands."
        )
    return out


def sync_case_languages() -> None:
    """Offer each published case in every language version the repository now
    holds. A case given its English version in a new release is offered in
    English from the first start. A failure here is reported, and the service
    starts anyway with the languages it had."""
    try:
        import admin_api
        with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=5) as conn:
            out = admin_api.sync_case_languages(conn)
            conn.commit()
    except Exception as exc:  # noqa: BLE001 - starting matters more than this step
        print(f"warning: case languages were not brought up to date: {exc}", file=sys.stderr)
        return
    if out["changed"]:
        print(f"case languages updated for {len(out['changed'])} cases: "
              + ", ".join(f"{c['key']} ({'/'.join(c['locales'])})" for c in out["changed"]),
              file=sys.stderr)
    for h in out["held"]:
        print(f"warning: the {h['locale']} version of {h['key']} does not match the case's"
              " other versions and is not offered", file=sys.stderr)


def main() -> int:
    problems = preflight()
    if problems:
        print("refusing to start:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 2

    for w in warnings():
        print(f"warning: {w}", file=sys.stderr)

    sync_case_languages()

    # Marks and medals whose conditions people already meet are recorded in the
    # background, so one that comes with a new release reaches them at once.
    import awards
    awards.sweep_in_background(os.environ["DATABASE_URL"])

    # The demo database is prepared and kept current in the background, so the
    # platform starts at once whatever state the demo is in.
    import demo
    if demo.enabled() and os.environ.get("YAZEM_DEMO_REFRESH", "1") == "1":
        demo.keep_fresh()

    import uvicorn
    # The address a request came from is taken from X-Forwarded-For only when
    # the request comes from a proxy listed here. Behind nginx on the same
    # machine the request reaches the container from Docker's own network;
    # reached directly, the client's own address is used and the header is not
    # believed.
    uvicorn.run(build_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "8000")),
                proxy_headers=True,
                forwarded_allow_ips=os.environ.get("YAZEM_TRUSTED_PROXIES",
                                                   "127.0.0.1,172.16.0.0/12"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
else:
    # Imported by a process manager: assemble but do not serve.
    app = build_app()
