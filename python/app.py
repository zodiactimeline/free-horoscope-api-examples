"""Example web server: calls the Zodiac Timeline Horoscope API on the server (browsers are blocked by CORS)
and serves it as an HTML page and as JSON.

Routes:
    GET /                 HTML page with day tabs, a sign filter and one card per horoscope
    GET /api/horoscopes   the same data as JSON, for your own frontend
    GET /healthz          health check for uptime monitors and load balancers

    python app.py  ->  http://localhost:8000
"""

import logging
import os
from datetime import datetime, timezone

from flask import Flask, jsonify, render_template, request

from zodiac_timeline import (
    API_URL,
    CREDIT,
    SIGN_BY_KEY,
    SIGNS,
    ZodiacTimelineClient,
    default_date,
    filter_horoscopes,
    is_sign,
    today_utc,
)

log = logging.getLogger(__name__)


def _utc_date(iso_date: str) -> datetime:
    """Turn a YYYY-MM-DD string into a datetime at midnight UTC on that day."""
    return datetime.fromisoformat(iso_date).replace(tzinfo=timezone.utc)


def _iso_timestamp(seconds: float) -> str:
    """UTC timestamp such as 2026-10-13T21:15:52.123Z, the same format as JavaScript's toISOString()."""
    moment = datetime.fromtimestamp(seconds, tz=timezone.utc)
    return moment.isoformat(timespec="milliseconds").removesuffix("+00:00") + "Z"


def create_app(client: ZodiacTimelineClient | None = None) -> Flask:
    """Build the Flask app. Tests pass in a client with a fake fetch so they never call the real API."""
    app = Flask(__name__)
    client = client or ZodiacTimelineClient()

    @app.template_filter("tab_label")
    def tab_label(iso_date: str) -> str:
        """Day tab text, such as "Wed, Oct 14". The current UTC date is shown as "Today"."""
        if iso_date == today_utc():
            return "Today"
        d = _utc_date(iso_date)
        return f"{d:%a}, {d:%b} {d.day}"

    @app.template_filter("long_date")
    def long_date(iso_date: str) -> str:
        """Page heading date, such as "Wednesday, October 14, 2026"."""
        d = _utc_date(iso_date)
        return f"{d:%A}, {d:%B} {d.day}, {d.year}"

    @app.get("/")
    def index():
        """HTML page. Unknown ?sign or ?date values fall back to the defaults."""
        try:
            data = client.get_horoscopes()
        except Exception as error:
            log.error("Could not load the Zodiac Timeline Horoscope API: %s", error)
            return render_template("index.html", error=True, credit=CREDIT), 502

        # None means "All signs". Dates are limited to the five days in the API response.
        sign = request.args.get("sign")
        selected_sign = sign if is_sign(sign) else None
        date = request.args.get("date")
        selected_date = date if date in data["dates"] else default_date(data["dates"])

        return render_template(
            "index.html",
            error=False,
            credit=CREDIT,
            signs=SIGNS,
            sign_by_key=SIGN_BY_KEY,
            dates=data["dates"],
            selected_date=selected_date,
            selected_sign=selected_sign,
            stale=data["stale"],
            horoscopes=filter_horoscopes(data["horoscopes"], sign=selected_sign, date=selected_date),
        )

    @app.get("/api/horoscopes")
    def api_horoscopes():
        """JSON endpoint. Optional filters: ?sign=leo&date=2026-10-13"""
        sign = request.args.get("sign")
        date = request.args.get("date")
        # Validate the sign before loading data so a typo gets a quick, clear 400.
        if sign is not None and not is_sign(sign):
            return jsonify(error=f'Unknown sign "{sign}". Use a lowercase sign name such as "leo".'), 400

        try:
            data = client.get_horoscopes()
        except Exception as error:
            log.error("Could not load the Zodiac Timeline Horoscope API: %s", error)
            return jsonify(error="Could not load the Zodiac Timeline Horoscope API. Please try again in a few minutes."), 502

        if date is not None and date not in data["dates"]:
            available = ", ".join(data["dates"])
            return jsonify(
                error=f'Date "{date}" is not in the Zodiac Timeline Horoscope API response. Available dates: {available}.'
            ), 400

        horoscopes = filter_horoscopes(data["horoscopes"], sign=sign, date=date)
        return jsonify(
            credit=CREDIT,  # lets any frontend using this JSON show the required credit
            source=API_URL,
            fetchedAt=_iso_timestamp(data["fetchedAt"]),
            stale=data["stale"],  # true when the API could not be reached and this is the last saved copy
            dates=data["dates"],
            count=len(horoscopes),
            horoscopes=horoscopes,
        )

    @app.get("/healthz")
    def healthz():
        """Health check for uptime monitors and load balancers."""
        return jsonify(status="ok")

    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    create_app().run(port=int(os.environ.get("PORT", "8000")))
