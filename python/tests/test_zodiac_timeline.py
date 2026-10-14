import re
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app import create_app
from zodiac_timeline import (
    SIGNS,
    ZodiacTimelineClient,
    default_date,
    filter_horoscopes,
    list_dates,
    next_refresh_time,
    parse_response,
)

# A saved Horoscope API response, so the tests never hit the network.
SAMPLE_XML = (Path(__file__).resolve().parents[2] / "fixtures" / "api-response.sample.xml").read_bytes()


def ts(value: str) -> float:
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp()


@pytest.fixture(scope="module")
def horoscopes():
    return parse_response(SAMPLE_XML)


@pytest.fixture(scope="module")
def dates(horoscopes):
    return list_dates(horoscopes)


# parse_response


def test_returns_60_horoscopes_12_signs_by_5_days(horoscopes, dates):
    assert len(horoscopes) == 60
    assert len(dates) == 5
    assert {h["sign"] for h in horoscopes} == {s["key"] for s in SIGNS}


def test_parses_every_field(horoscopes):
    for h in horoscopes:
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", h["date"])
        assert 0 <= h["score"] <= 10
        assert h["paragraphs"]
        assert h["link"].startswith(f"https://zodiactimeline.com/{h['sign']}/{h['date']}")
        assert h["title"].startswith(h["signName"])


def test_sorts_by_date_then_zodiac_order(horoscopes, dates):
    assert [(h["date"], h["sign"]) for h in horoscopes[:12]] == [(dates[0], s["key"]) for s in SIGNS]


def test_returns_none_score_when_an_item_has_no_valid_score():
    xml = re.sub(rb"<zt:score>[^<]*</zt:score>", b"<zt:score></zt:score>", SAMPLE_XML, count=1)
    assert sum(h["score"] is None for h in parse_response(xml)) == 1


def test_rejects_xml_that_is_not_the_api_response():
    with pytest.raises(ValueError, match="no <item> elements"):
        parse_response("<html></html>")


# helpers


def test_filters_by_sign_and_date(horoscopes, dates):
    assert len(filter_horoscopes(horoscopes, sign="leo")) == 5
    assert len(filter_horoscopes(horoscopes, date=dates[0])) == 12
    assert len(filter_horoscopes(horoscopes, sign="leo", date=dates[0])) == 1


def test_default_date_is_today_utc_or_middle_day(dates):
    assert default_date(dates, ts(f"{dates[1]}T23:00:00")) == dates[1]
    assert default_date(dates, ts("2000-01-01T00:00:00")) == dates[2]


def test_refreshes_after_next_0010_utc_but_not_within_10_minutes():
    assert next_refresh_time(ts("2026-10-13T15:00:00")) == ts("2026-10-14T00:10:00")
    assert next_refresh_time(ts("2026-10-13T00:05:00")) == ts("2026-10-13T00:15:00")


# ZodiacTimelineClient


def test_caches_until_the_next_daily_update():
    calls = []
    clock = {"now": ts("2026-10-13T15:00:00")}

    def fetch(url):
        calls.append(url)
        return SAMPLE_XML

    client = ZodiacTimelineClient(fetch=fetch, now=lambda: clock["now"])

    client.get_horoscopes()
    clock["now"] += 3600
    client.get_horoscopes()
    assert len(calls) == 1

    clock["now"] = ts("2026-10-14T00:11:00")
    client.get_horoscopes()
    assert len(calls) == 2


def test_serves_last_good_copy_when_refresh_fails():
    state = {"fail": False, "now": ts("2026-10-13T15:00:00")}

    def fetch(url):
        if state["fail"]:
            raise urllib.error.URLError("down")
        return SAMPLE_XML

    client = ZodiacTimelineClient(fetch=fetch, now=lambda: state["now"])
    client.get_horoscopes()

    state.update(fail=True, now=ts("2026-10-14T01:00:00"))
    result = client.get_horoscopes()
    assert result["stale"] is True
    assert len(result["horoscopes"]) == 60


def test_raises_when_first_request_fails():
    def fetch(url):
        raise urllib.error.URLError("down")

    with pytest.raises(urllib.error.URLError):
        ZodiacTimelineClient(fetch=fetch).get_horoscopes()


# Flask app


@pytest.fixture
def http():
    app = create_app(ZodiacTimelineClient(fetch=lambda url: SAMPLE_XML))
    return app.test_client()


def test_renders_html_page_with_zodiac_timeline_credit(http, dates):
    response = http.get(f"/?date={dates[0]}")
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert '<a href="https://zodiactimeline.com">Zodiac Timeline</a>' in html
    assert html.count('class="card"') == 12


def test_filters_page_by_sign(http, dates):
    html = http.get(f"/?sign=leo&date={dates[0]}").get_data(as_text=True)
    assert html.count('class="card"') == 1
    assert f"https://zodiactimeline.com/leo/{dates[0]}/" in html


def test_returns_json_with_credit(http):
    response = http.get("/api/horoscopes?sign=leo")
    body = response.get_json()
    assert response.status_code == 200
    assert body["credit"]["name"] == "Zodiac Timeline"
    assert body["count"] == 5


def test_rejects_unknown_signs_and_dates(http):
    assert http.get("/api/horoscopes?sign=dragon").status_code == 400
    assert http.get("/api/horoscopes?date=1999-01-01").status_code == 400


def test_shows_error_page_when_api_is_unreachable():
    def fetch(url):
        raise urllib.error.URLError("down")

    http = create_app(ZodiacTimelineClient(fetch=fetch)).test_client()

    page = http.get("/")
    assert page.status_code == 502
    assert "zodiactimeline.com" in page.get_data(as_text=True)

    api = http.get("/api/horoscopes")
    assert api.status_code == 502
    assert api.get_json()["error"]


def test_serves_the_stylesheet(http):
    assert http.get("/static/styles.css").status_code == 200
