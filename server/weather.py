"""The weather over the campus, for the map.

The map draws rain, snow, fog or cloud as it is outside. The reading comes
from Open-Meteo, a free service that needs no key. The server asks for the
campus's coordinates and nothing else, and the browser never contacts the
service, so no visitor's address leaves the platform.

A reading is kept for half an hour. When the service cannot be reached the
last reading stands for up to three hours; after that the map shows no
weather until the service answers again. Setting YAZEM_WEATHER=0 turns the
whole thing off.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.request

log = logging.getLogger("yazem.weather")

ENABLED = os.environ.get("YAZEM_WEATHER", "1") != "0"

# The East and West Campuses, north of the city centre.
LATITUDE, LONGITUDE = 37.83, 30.53
URL = ("https://api.open-meteo.com/v1/forecast"
       f"?latitude={LATITUDE}&longitude={LONGITUDE}"
       "&current=temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,is_day"
       "&timezone=Europe%2FIstanbul")
TIMEOUT = 4.0
FRESH = 30 * 60          # a reading younger than this is used as it is
STALE = 3 * 60 * 60      # an older one stands in while the service is away
RETRY = 5 * 60           # after a failure, wait this long before asking again


def kind_of(code: int) -> tuple[str, str]:
    """A WMO weather code as what the map draws and how strongly."""
    if code in (0, 1):
        return "clear", "light"
    if code == 2:
        return "partly", "light"
    if code == 3:
        return "overcast", "moderate"
    if code in (45, 48):
        return "fog", "moderate"
    if code in (51, 53, 55, 56, 57):
        return "drizzle", {51: "light", 53: "moderate"}.get(code, "heavy")
    if code in (61, 63, 65, 66, 67, 80, 81, 82):
        return "rain", {61: "light", 80: "light", 63: "moderate", 81: "moderate",
                        66: "light"}.get(code, "heavy")
    if code in (71, 73, 75, 77, 85, 86):
        return "snow", {71: "light", 77: "light", 85: "light", 73: "moderate"}.get(code, "heavy")
    if code in (95, 96, 99):
        return "storm", "heavy"
    return "partly", "light"


def reading_from(raw: dict) -> dict:
    """The parts of an Open-Meteo answer the map uses."""
    now = raw["current"]
    code = int(now["weather_code"])
    kind, strength = kind_of(code)
    return {"available": True, "kind": kind, "strength": strength, "code": code,
            "temperature": round(float(now["temperature_2m"]), 1),
            "cloud": int(now.get("cloud_cover") or 0),
            "precipitation": float(now.get("precipitation") or 0.0),
            "wind": round(float(now.get("wind_speed_10m") or 0.0), 1),
            "is_day": bool(now.get("is_day", 1)),
            "observed_at": now.get("time")}


def fetch() -> dict:
    request = urllib.request.Request(URL, headers={"User-Agent": "YAZEM-Okuryazarlik/1.0"})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as answer:
        return reading_from(json.loads(answer.read().decode("utf-8")))


_lock = threading.Lock()
_held: tuple[float, dict] | None = None
_next_try = 0.0


def current(clock=time.monotonic) -> dict:
    """The reading to show now, or {"available": False}."""
    global _held, _next_try
    if not ENABLED:
        return {"available": False}
    with _lock:
        now = clock()
        if _held and now - _held[0] < FRESH:
            return _held[1]
        if now >= _next_try:
            try:
                _held = (now, fetch())
                return _held[1]
            except Exception as exc:              # noqa: BLE001 - any failure leaves the map without weather
                log.warning("weather not read: %s", type(exc).__name__)
                _next_try = now + RETRY
        if _held and now - _held[0] < STALE:
            return _held[1]
        return {"available": False}


def forget() -> None:
    """Drop what is held, for tests."""
    global _held, _next_try
    with _lock:
        _held, _next_try = None, 0.0
