"""Delivering codes, and holding the address they are delivered to.

Two jobs the rest of the system deliberately keeps at arm's length.

The address is the only direct identifier the platform stores. It is there to
send a six-digit code, and so that a full administrator can tell whose account
is whose in the panel. It is held under envelope encryption — a per-record data
key, itself encrypted under a master key that lives outside the database. A
dump of the database on its own yields nothing; the attacker also needs the
master key from the environment or the KMS.

Delivery is deliberately plain text with nothing to click: the code is read and
typed, in keeping with a programme that trains people to distrust unexpected
links.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ---------------------------------------------------------------------------
# Envelope encryption
# ---------------------------------------------------------------------------

_ENVELOPE_VERSION = b"\x01"
_NONCE_LEN = 12
_KEY_LEN = 32


class KeyUnavailable(RuntimeError):
    """Raised at startup, ahead of the first registration."""


def _master_key() -> bytes:
    """The key that never touches the database.

    In deployment this comes from the platform's secret store. Read on every
    call, so that a rotation takes effect without a restart and a missing key
    fails loudly at the point of use.
    """
    raw = os.environ.get("YAZEM_MASTER_KEY")
    if not raw:
        raise KeyUnavailable(
            "YAZEM_MASTER_KEY is not set; refusing to store addresses in the clear"
        )
    key = bytes.fromhex(raw) if len(raw) == 64 else raw.encode()
    if len(key) != _KEY_LEN:
        raise KeyUnavailable("YAZEM_MASTER_KEY must be 32 bytes (64 hex characters)")
    return key


def email_hash_key() -> bytes:
    """Key for the address lookup hash, derived from the master key.

    Kept apart from the session secret so that rotating the session secret
    signs people out and changes nothing else.
    """
    return hmac.new(_master_key(), b"yazem/email-hash/v1", hashlib.sha256).digest()


def key_fingerprint() -> str:
    """A short value that identifies the master key without revealing it."""
    return hmac.new(_master_key(), b"yazem/key-check/v1", hashlib.sha256).hexdigest()[:24]


def encrypt_email(email: str) -> bytes:
    """Wrap one address in its own data key.

    Layout: version | nonce | wrapped data key | ciphertext. A per-record key
    means that cracking one record does not read the rest, and that a single
    record can be destroyed by discarding its key.
    """
    master = _master_key()
    data_key = AESGCM.generate_key(bit_length=256)

    inner_nonce = os.urandom(_NONCE_LEN)
    ciphertext = AESGCM(data_key).encrypt(
        inner_nonce, email.strip().lower().encode("utf-8"), _ENVELOPE_VERSION
    )
    outer_nonce = os.urandom(_NONCE_LEN)
    wrapped = AESGCM(master).encrypt(outer_nonce, data_key, _ENVELOPE_VERSION)

    return (_ENVELOPE_VERSION + outer_nonce + len(wrapped).to_bytes(2, "big")
            + wrapped + inner_nonce + ciphertext)


def decrypt_email(blob: bytes) -> str:
    """Unwrap an address, for a full administrator's list of people."""
    if not blob or blob[:1] != _ENVELOPE_VERSION:
        raise ValueError("unrecognised envelope version")
    master = _master_key()
    pos = 1
    outer_nonce, pos = blob[pos:pos + _NONCE_LEN], pos + _NONCE_LEN
    wrapped_len, pos = int.from_bytes(blob[pos:pos + 2], "big"), pos + 2
    wrapped, pos = blob[pos:pos + wrapped_len], pos + wrapped_len
    inner_nonce, pos = blob[pos:pos + _NONCE_LEN], pos + _NONCE_LEN
    ciphertext = blob[pos:]

    data_key = AESGCM(master).decrypt(outer_nonce, wrapped, _ENVELOPE_VERSION)
    return AESGCM(data_key).decrypt(inner_nonce, ciphertext, _ENVELOPE_VERSION).decode()


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------

# This machine, as a process or a container sees it: where a trial's mail
# catcher listens, with nothing between the two to read a password.
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "host.docker.internal", "172.17.0.1"}


class PlaintextLogin(Exception):
    """The relay's password would travel unencrypted."""


class PinMismatch(Exception):
    """The relay showed a certificate other than the one it is trusted by."""


# For a relay that signs its side of the TLS handshake with SHA-1, as older
# Exchange servers do. OpenSSL refuses SHA-1 signatures above security level
# 0, and such a relay closes the connection without a word. TLS 1.2 stays the
# lowest version accepted, and only forward-secret ciphers are offered.
LEGACY_CIPHERS = "ECDHE+AESGCM:ECDHE+AES:!aNULL:!eNULL:@SECLEVEL=0"


@dataclass(frozen=True)
class MailConfig:
    host: str
    port: int
    username: str | None
    password: str | None
    sender: str
    sender_name: str
    starttls: bool
    tls_legacy: bool = False
    tls_pin: str | None = None       # SHA-256 of the relay's certificate, lower-case hex

    @property
    def plaintext_login(self) -> bool:
        """Whether logging in would send the password in the clear: a login
        with neither STARTTLS nor TLS from the start (port 465), to a host that
        is not this machine."""
        return (bool(self.username) and not self.starttls and self.port != 465
                and self.host.lower() not in LOCAL_HOSTS)

    @classmethod
    def from_env(cls) -> "MailConfig":
        host = os.environ.get("YAZEM_SMTP_HOST")
        if not host:
            raise KeyUnavailable("YAZEM_SMTP_HOST is not set")
        try:
            port = int(os.environ.get("YAZEM_SMTP_PORT", "587"))
        except ValueError:
            raise ValueError("YAZEM_SMTP_PORT must be a number") from None
        pin = os.environ.get("YAZEM_SMTP_TLS_PIN", "").replace(":", "").strip().lower()
        if pin and not re.fullmatch(r"[0-9a-f]{64}", pin):
            raise ValueError("YAZEM_SMTP_TLS_PIN must be the SHA-256 fingerprint of the "
                             "relay's certificate (64 hex characters)")
        return cls(
            host=host,
            port=port,
            username=os.environ.get("YAZEM_SMTP_USER"),
            password=os.environ.get("YAZEM_SMTP_PASSWORD"),
            sender=os.environ.get("YAZEM_SMTP_FROM", "yzokuryazarlik@sdu.edu.tr"),
            sender_name=os.environ.get("YAZEM_SMTP_FROM_NAME", "SDÜ YAZEM"),
            starttls=os.environ.get("YAZEM_SMTP_STARTTLS", "1") != "0",
            tls_legacy=os.environ.get("YAZEM_SMTP_TLS_LEGACY", "0") == "1",
            tls_pin=pin or None,
        )


BODY = {
    "tr": (
        "Merhaba,\n\n"
        "SDÜ Yapay Zeka Okuryazarlığı Platformu için giriş kodun:\n\n"
        "    {code}\n\n"
        "Kod {minutes} dakika geçerlidir. Kodu kimseyle paylaşma. "
        "YAZEM senden bu kodu hiçbir zaman istemez.\n\n"
        "Bu kodu sen istemediysen bir şey yapmana gerek yok. "
        "Kod kendiliğinden geçersiz olur.\n\n"
        "SDÜ Yapay Zeka Uygulama ve Araştırma Merkezi\n"
    ),
    "en": (
        "Hello,\n\n"
        "Your verification code for SDÜ AI Literacy:\n\n"
        "    {code}\n\n"
        "The code is valid for {minutes} minutes. Do not share it with anyone; "
        "YAZEM will never ask you for it.\n\n"
        "If you did not request this, there is nothing to do; the code will "
        "expire on its own.\n\n"
        "SDÜ Artificial Intelligence Application and Research Centre\n"
    ),
}

SUBJECT = {"tr": "Giriş kodun: {code}", "en": "Your verification code: {code}"}


def build_message(cfg: MailConfig, to: str, code: str, locale: str,
                  minutes: int) -> EmailMessage:
    """Plain text only, and the code is in the subject as well as the body.

    Putting it in the subject lets a phone show it on the lock screen, so the
    message never has to be opened.
    """
    lang = locale if locale in BODY else "tr"
    msg = EmailMessage()
    msg["Subject"] = SUBJECT[lang].format(code=code)
    msg["From"] = formataddr((cfg.sender_name, cfg.sender))
    msg["To"] = to
    msg["Message-ID"] = make_msgid(domain=cfg.sender.split("@")[-1])
    msg["Auto-Submitted"] = "auto-generated"
    msg["X-Entity-Ref-ID"] = "yazem-verification"
    msg.set_content(BODY[lang].format(code=code, minutes=minutes))
    return msg


def tls_context(cfg: MailConfig) -> ssl.SSLContext:
    """The TLS settings for the relay.

    With a pin the relay's certificate is not checked against the authorities
    but compared with the pin after the handshake, so a relay with a
    certificate of its own making can be trusted, and nothing else in its
    place.
    """
    context = ssl.create_default_context()
    # Said outright: at security level 0 OpenSSL would offer TLS 1.0 as well.
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    if cfg.tls_legacy:
        context.set_ciphers(LEGACY_CIPHERS)
    if cfg.tls_pin:
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    return context


def check_pin(cfg: MailConfig, sock: ssl.SSLSocket) -> None:
    """Stop before the password is sent if the relay is not the pinned one."""
    if not cfg.tls_pin:
        return
    seen = hashlib.sha256(sock.getpeercert(binary_form=True)).hexdigest()
    if not hmac.compare_digest(seen, cfg.tls_pin):
        raise PinMismatch(f"the relay's certificate is {seen}")


def send_code(to: str, code: str, locale: str = "tr", minutes: int = 15,
              cfg: MailConfig | None = None) -> None:
    """Hand one message to the institutional relay.

    Failures propagate, and the caller removes the code that was not sent.
    """
    cfg = cfg or MailConfig.from_env()
    if cfg.plaintext_login:
        raise PlaintextLogin("refusing to send the relay password unencrypted")
    msg = build_message(cfg, to, code, locale, minutes)

    context = tls_context(cfg)
    if cfg.port == 465:
        with smtplib.SMTP_SSL(cfg.host, cfg.port, context=context, timeout=20) as s:
            check_pin(cfg, s.sock)
            if cfg.username:
                s.login(cfg.username, cfg.password or "")
            s.send_message(msg)
        return

    with smtplib.SMTP(cfg.host, cfg.port, timeout=20) as s:
        s.ehlo()
        if cfg.starttls:
            s.starttls(context=context)
            check_pin(cfg, s.sock)
            s.ehlo()
        if cfg.username:
            s.login(cfg.username, cfg.password or "")
        s.send_message(msg)


def check_configuration() -> list[str]:
    """Called at startup, so problems surface before the first signup."""
    problems = []
    try:
        _master_key()
    except KeyUnavailable as exc:
        problems.append(str(exc))
    try:
        if MailConfig.from_env().plaintext_login:
            problems.append(PLAINTEXT_PROBLEM)
    except (KeyUnavailable, ValueError) as exc:
        problems.append(str(exc))
    return problems


PLAINTEXT_PROBLEM = ("YAZEM_SMTP_STARTTLS=0 with YAZEM_SMTP_USER set would send the mail "
                     "password unencrypted; keep STARTTLS on, or use port 465")
