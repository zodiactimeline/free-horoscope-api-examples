# Python example · Zodiac Timeline Horoscope API

A small [Flask](https://flask.palletsprojects.com) app that calls the free
[Zodiac Timeline Horoscope API](https://zodiactimeline.com/horoscope-api/) on the server and serves daily
horoscopes for all 12 zodiac signs as an HTML page and as JSON.
The XML is parsed with Python's standard library.

← Back to the [main README](../README.md) · [API reference](../docs/API.md)

## Requirements

- Python **3.12 or newer**

## Run it

```bash
cd python
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open **http://localhost:8000**. To use another port, run `PORT=9000 python app.py`.

| Route | What it returns |
|---|---|
| `GET /` | HTML page: 5 day tabs, a sign filter and 12 horoscope cards. Optional `?date=YYYY-MM-DD` and `?sign=leo`. |
| `GET /api/horoscopes` | JSON. Optional filters `?sign=leo` and `?date=YYYY-MM-DD`. Unknown values return `400`. |
| `GET /healthz` | `{"status": "ok"}` |

The JSON has the same shape as the [Node.js example](../nodejs/README.md#run-it): a `credit` object, `source`,
`fetchedAt`, `stale`, `dates`, `count` and `horoscopes`.

> `python app.py` starts Flask's development server. In production, run the app with a WSGI server, for example
> `pip install gunicorn && gunicorn "app:create_app()"`.

## How it works

```
zodiac_timeline.py    Zodiac Timeline Horoscope API client: fetch, parse, cache, helpers
app.py                Flask routes (HTML page, JSON, health check)
templates/index.html  Jinja2 template (auto-escaped)
static/styles.css     Page styles (light and dark mode)
tests/                Offline tests against ../fixtures/api-response.sample.xml
pyproject.toml        Project metadata and pytest settings
```

1. **Fetch.** `fetch_api_xml()` sends a `GET` to the Horoscope API endpoint with `urllib`, a 10-second
   timeout and a descriptive `User-Agent`.
2. **Parse.** `parse_response()` uses `xml.etree.ElementTree` to turn the 60 `<item>` elements into dicts. It reads the
   `zt:` fields through their XML namespace and splits the reading into paragraphs.
3. **Cache.** `ZodiacTimelineClient` keeps the result in memory until the next daily update (00:10 UTC). If a refresh fails,
   it keeps serving the last good copy and marks it `stale`. A lock makes it safe under a threaded server.
4. **Render.** `app.py` filters by date and sign, and Jinja2 renders the page with auto-escaping.
5. **Credit.** The header and footer link to [Zodiac Timeline](https://zodiactimeline.com), as the Horoscope API
   requires, and each card links to its full reading on zodiactimeline.com.

## Use the client in your own app

`zodiac_timeline.py` uses only the standard library. Copy it into your project and call it from any server code
(Django, FastAPI, a cron job, a bot and so on):

```python
from zodiac_timeline import CREDIT, ZodiacTimelineClient, filter_horoscopes, today_utc

zodiac_timeline = ZodiacTimelineClient()  # create once and reuse, so the cache works

data = zodiac_timeline.get_horoscopes()
leo_today = filter_horoscopes(data["horoscopes"], sign="leo", date=today_utc())[0]

print(leo_today["title"], f"{leo_today['score']}/10")
print(leo_today["text"])
print(f"Horoscopes by {CREDIT['name']}: {CREDIT['url']}")  # credit required by the Horoscope API
```

Remember to show the credit `<a href="https://zodiactimeline.com">Zodiac Timeline</a>` wherever the horoscopes
appear.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

The tests use the saved response in `../fixtures/api-response.sample.xml` and a stubbed fetch function, so they never
call the real API.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8000` | Port for the web server |
| `ZT_API_URL` | `https://zodiactimeline.com/feed.xml` | Override the API URL, for example to test error handling |
