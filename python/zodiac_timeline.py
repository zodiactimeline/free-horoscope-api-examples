"""Zodiac Timeline free API client.

Calls the Zodiac Timeline free horoscope API (https://zodiactimeline.com/feed.xml),
parses it into plain dicts and keeps it in memory until the feed's next daily update.

The free API needs no key; the only condition is a visible credit to Zodiac Timeline:
    <a href="https://zodiactimeline.com">Zodiac Timeline</a>
Details: https://zodiactimeline.com/horoscope-rss-feed/
"""

import logging
import math
import os
import re
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

log = logging.getLogger(__name__)

FEED_URL = os.environ.get("ZT_FEED_URL") or "https://zodiactimeline.com/feed.xml"

# Attribution required by the feed's terms. Show it wherever the horoscopes appear.
CREDIT = {
    "name": "Zodiac Timeline",
    "url": "https://zodiactimeline.com",
    "terms": "https://zodiactimeline.com/horoscope-rss-feed/",
}

# Variation selector that asks browsers to draw a zodiac glyph as a text symbol instead of an emoji.
TEXT_STYLE = "\ufe0e"

# The 12 signs in zodiac order. The "key" matches the feed's <zt:sign> value.
SIGNS = [
    {"key": "aries", "name": "Aries", "glyph": "♈" + TEXT_STYLE, "dates": "Mar 21 – Apr 19"},
    {"key": "taurus", "name": "Taurus", "glyph": "♉" + TEXT_STYLE, "dates": "Apr 20 – May 20"},
    {"key": "gemini", "name": "Gemini", "glyph": "♊" + TEXT_STYLE, "dates": "May 21 – Jun 20"},
    {"key": "cancer", "name": "Cancer", "glyph": "♋" + TEXT_STYLE, "dates": "Jun 21 – Jul 22"},
    {"key": "leo", "name": "Leo", "glyph": "♌" + TEXT_STYLE, "dates": "Jul 23 – Aug 22"},
    {"key": "virgo", "name": "Virgo", "glyph": "♍" + TEXT_STYLE, "dates": "Aug 23 – Sep 22"},
    {"key": "libra", "name": "Libra", "glyph": "♎" + TEXT_STYLE, "dates": "Sep 23 – Oct 22"},
    {"key": "scorpio", "name": "Scorpio", "glyph": "♏" + TEXT_STYLE, "dates": "Oct 23 – Nov 21"},
    {"key": "sagittarius", "name": "Sagittarius", "glyph": "♐" + TEXT_STYLE, "dates": "Nov 22 – Dec 21"},
    {"key": "capricorn", "name": "Capricorn", "glyph": "♑" + TEXT_STYLE, "dates": "Dec 22 – Jan 19"},
    {"key": "aquarius", "name": "Aquarius", "glyph": "♒" + TEXT_STYLE, "dates": "Jan 20 – Feb 18"},
    {"key": "pisces", "name": "Pisces", "glyph": "♓" + TEXT_STYLE, "dates": "Feb 19 – Mar 20"},
]

SIGN_BY_KEY = {sign["key"]: sign for sign in SIGNS}
SIGN_ORDER = {sign["key"]: index for index, sign in enumerate(SIGNS)}

# Custom fields such as <zt:score> live in this XML namespace.
NS = {"zt": "https://zodiactimeline.com/feed"}

USER_AGENT = "free-horoscope-api-examples/1.0 (+https://github.com/zodiactimeline/free-horoscope-api-examples)"

MIN_CACHE_SECONDS = 10 * 60  # the feed is served with Cache-Control: max-age=600
UPDATE_MINUTE_UTC = 10  # the feed updates a few minutes after 00:00 UTC


def is_sign(value: str | None) -> bool:
    """True if value is one of the 12 sign keys, such as "leo"."""
    return value in SIGN_BY_KEY


def parse_score(value: str | None) -> float | None:
    """The day score out of 10 as a number, or None if the item has no valid score."""
    try:
        score = float(value)
    except (TypeError, ValueError):
        return None
    return score if math.isfinite(score) else None


def parse_feed(xml: str | bytes) -> list[dict]:
    """Parse the feed XML into a list of horoscopes, sorted by date and then zodiac order.

    The dict keys are camelCase so the JSON output matches the Node.js example exactly.
    """
    root = ET.fromstring(xml)
    items = root.findall("./channel/item")
    if not items:
        raise ValueError("Unexpected Zodiac Timeline free API response: no <item> elements found")

    horoscopes = []
    for item in items:
        key = item.findtext("zt:sign", default="", namespaces=NS)
        sign = SIGN_BY_KEY.get(key, {})
        text = (item.findtext("description") or "").strip()
        horoscopes.append(
            {
                "sign": key,
                "signName": sign.get("name", key),
                "glyph": sign.get("glyph", ""),
                "date": item.findtext("zt:date", default="", namespaces=NS),
                "score": parse_score(item.findtext("zt:score", namespaces=NS)),
                "title": item.findtext("title", default=""),
                "text": text,
                "paragraphs": [p.strip() for p in re.split(r"\n+", text) if p.strip()],
                "link": item.findtext("link", default=""),
            }
        )

    horoscopes.sort(key=lambda h: (h["date"], SIGN_ORDER.get(h["sign"], len(SIGNS))))
    return horoscopes


def list_dates(horoscopes: list[dict]) -> list[str]:
    """Sorted list of the dates (YYYY-MM-DD) present in the feed."""
    return sorted({h["date"] for h in horoscopes})


def filter_horoscopes(horoscopes: list[dict], sign: str | None = None, date: str | None = None) -> list[dict]:
    """Keep only the horoscopes matching sign and/or date (both optional)."""
    return [h for h in horoscopes if (not sign or h["sign"] == sign) and (not date or h["date"] == date)]


def today_utc(now: float | None = None) -> str:
    """Today's date in UTC as YYYY-MM-DD. The feed's dates follow UTC."""
    moment = datetime.fromtimestamp(time.time() if now is None else now, tz=timezone.utc)
    return moment.date().isoformat()


def default_date(dates: list[str], now: float | None = None) -> str:
    """Today (UTC) if the feed contains it, otherwise the middle of the 5-day window."""
    today = today_utc(now)
    return today if today in dates else dates[len(dates) // 2]


def next_refresh_time(now: float) -> float:
    """When the cached feed should be refreshed: the next 00:10 UTC, but never sooner than
    10 minutes from now. The feed changes only once a day, so polling more often adds nothing."""
    moment = datetime.fromtimestamp(now, tz=timezone.utc)
    nxt = moment.replace(hour=0, minute=UPDATE_MINUTE_UTC, second=0, microsecond=0)
    if nxt.timestamp() <= now:
        nxt += timedelta(days=1)
    return max(nxt.timestamp(), now + MIN_CACHE_SECONDS)


def fetch_feed_xml(url: str = FEED_URL, timeout: float = 10.0) -> bytes:
    """Download the raw feed XML. Call this from a server; browsers are blocked by CORS."""
    # A descriptive User-Agent is required: urllib's default ("Python-urllib/3.x") is refused with HTTP 403.
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/rss+xml, application/xml", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # raises HTTPError on 4xx/5xx
        return response.read()


class ZodiacTimelineClient:
    """A cached Zodiac Timeline free API client.

    get_horoscopes() downloads the feed at most once per daily update and falls back to the
    last good copy (marked stale=True) if a refresh fails.
    """

    def __init__(
        self,
        url: str = FEED_URL,
        fetch: Callable[[str], bytes | str] = fetch_feed_xml,
        now: Callable[[], float] = time.time,
    ):
        self._url = url
        self._fetch = fetch
        self._now = now
        self._cache: dict | None = None
        self._lock = threading.Lock()

    def get_horoscopes(self) -> dict:
        """Return {"horoscopes", "dates", "fetchedAt", "expiresAt", "stale"}."""
        with self._lock:  # one request at a time, even with a threaded server
            if self._cache and self._now() < self._cache["expiresAt"]:
                return self._cache
            return self._refresh()

    def _refresh(self) -> dict:
        try:
            horoscopes = parse_feed(self._fetch(self._url))
        except Exception as error:
            if not self._cache:
                raise
            # Keep serving the last good copy and wait a little before trying again.
            log.warning("Zodiac Timeline free API refresh failed, serving cached copy: %s", error)
            self._cache = {**self._cache, "expiresAt": self._now() + MIN_CACHE_SECONDS, "stale": True}
            return self._cache

        fetched_at = self._now()
        self._cache = {
            "horoscopes": horoscopes,
            "dates": list_dates(horoscopes),
            "fetchedAt": fetched_at,
            "expiresAt": next_refresh_time(fetched_at),
            "stale": False,
        }
        return self._cache
