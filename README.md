# Free Horoscope API Examples · Zodiac Timeline

**Daily horoscopes for all 12 zodiac signs, in your own app or website, for free.**
Working Node.js and Python examples for the [Zodiac Timeline](https://zodiactimeline.com) free horoscope API.
You don't need an API key, an account or a sign-up.

```
GET https://zodiactimeline.com/feed.xml
```

[Zodiac Timeline](https://zodiactimeline.com) ·
[Free API documentation](https://zodiactimeline.com/horoscope-rss-feed/) ·
[API reference (this repo)](docs/API.md) ·
[Node.js example](nodejs/) ·
[Python example](python/)

---

## About Zodiac Timeline

Most horoscope sites stop at yesterday, today and tomorrow. **[Zodiac Timeline](https://zodiactimeline.com)**
shows you **15 days of horoscopes, like a weather forecast**: any day, any sign, one tap away.

Every reading on [zodiactimeline.com](https://zodiactimeline.com) comes from Zodiac Timeline's own astronomy
and astrology engine, which uses Western astrology. Part of that work is open to everyone through the
**Zodiac Timeline free API**, so you can put daily horoscopes in your own website, app, newsletter or chatbot.

## The free API at a glance

| | |
|---|---|
| **Endpoint** | `GET https://zodiactimeline.com/feed.xml` |
| **Format** | XML (RSS 2.0 with a few extra `zt:` fields) |
| **Contents** | 60 horoscopes: all 12 signs × 5 days (2 days back, today, 2 days ahead) |
| **Fields** | sign, date, reading, score out of 10, title, link to the full page on zodiactimeline.com |
| **Updates** | Once a day, a few minutes after midnight UTC |
| **Cost** | Free |
| **Authentication** | None: no key, no account, no sign-up |
| **Condition** | A visible credit linking to [Zodiac Timeline](https://zodiactimeline.com) (see [Credit](#credit-zodiac-timeline)) |

One horoscope in the response looks like this (reading shortened):

```xml
<item>
  <title>Leo · October 13, 2026</title>
  <link>https://zodiactimeline.com/leo/2026-10-13/</link>
  <guid isPermaLink="true">https://zodiactimeline.com/leo/2026-10-13/</guid>
  <pubDate>Tue, 13 Oct 2026 00:00:00 +0000</pubDate>
  <description>This is a good time to ask what makes you feel safe and how much of it you actually have. …</description>
  <zt:sign>leo</zt:sign>
  <zt:date>2026-10-13</zt:date>
  <zt:score>3.5</zt:score>
</item>
```

### What each field means

Every `<item>` is one horoscope: one sign on one day. The response has 60 items (12 signs × 5 days).

| Field | Example | What it means |
|---|---|---|
| `title` | `Leo · October 13, 2026` | The sign name and the date, ready to use as a heading. |
| `link` | `https://zodiactimeline.com/leo/2026-10-13/` | The page for this sign and day on Zodiac Timeline. Use it for a "Read more" link. |
| `guid` | `https://zodiactimeline.com/leo/2026-10-13/` | A unique, permanent ID for this horoscope (the same as `link`). Use it to spot items you have already stored. |
| `pubDate` | `Tue, 13 Oct 2026 00:00:00 +0000` | The horoscope's date as a standard RSS date: midnight UTC of the day it is for. |
| `description` | `This is a good time to ask …` | The full horoscope reading as plain text with no HTML. It has several paragraphs separated by newlines. Escape it before you put it in a web page. |
| `zt:sign` | `leo` | The zodiac sign in lowercase: `aries`, `taurus`, `gemini`, `cancer`, `leo`, `virgo`, `libra`, `scorpio`, `sagittarius`, `capricorn`, `aquarius` or `pisces`. Use it to filter by sign. |
| `zt:date` | `2026-10-13` | The date the horoscope is for, as `YYYY-MM-DD` in UTC. Use it to filter by day. |
| `zt:score` | `3.5` | The overall score for the day for this sign, **out of 10**. `3.5` means 3.5 out of 10. Higher is a better day. Show it as a number, bar or stars. |

The `zt:` fields are Zodiac Timeline's own additions to RSS. They live in the XML namespace
`https://zodiactimeline.com/feed`. Use `zt:sign` and `zt:date` to find a horoscope instead of parsing `title`.

See [docs/API.md](docs/API.md) for the channel fields, the update schedule, caching advice and error handling.

## What's in this repo

Each example is a small web server that calls the Zodiac Timeline free API **on the server**, caches the
response until the next daily update, and serves:

- **`/`**: a responsive page with all 12 signs, five day tabs, a sign filter, the day score as a bar out of 10,
  and a link to each full reading on zodiactimeline.com
- **`/api/horoscopes`**: the same data as JSON, filterable with `?sign=leo` and `?date=YYYY-MM-DD`
- **`/healthz`**: a simple health check

| Folder | Stack | Run |
|---|---|---|
| [`nodejs/`](nodejs/) | Node.js 22+, Express, fast-xml-parser | `npm install && npm start` → http://localhost:3000 |
| [`python/`](python/) | Python 3.12+, Flask, standard-library XML parser | `pip install -r requirements.txt && python app.py` → http://localhost:8000 |

Both examples look and behave the same, so you can compare them side by side. Each one has a saved copy of
the API response in [`fixtures/feed.sample.xml`](fixtures/feed.sample.xml) and a small test suite that runs offline.

## Quick start

**Node.js**

```bash
cd nodejs
npm install
npm start          # http://localhost:3000
```

**Python**

```bash
cd python
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py                  # http://localhost:8000
```

## Call it from your server, not the browser

The Zodiac Timeline free API is meant to be called **server-side**. A `fetch()` from JavaScript running in a
visitor's browser is blocked by the browser's CORS rules. Call it from your backend (Node.js, Python, PHP, Go,
a serverless function and so on), store the result, and send your pages or your frontend the data you need.
That is exactly what both examples do.

## Minimal code

If you only need the data, these snippets are enough.

**Node.js 22+** (`npm install fast-xml-parser`)

```js
import { XMLParser } from 'fast-xml-parser';

const xml = await (await fetch('https://zodiactimeline.com/feed.xml')).text();
const items = new XMLParser({ parseTagValue: false }).parse(xml).rss.channel.item;

const today = new Date().toISOString().slice(0, 10); // dates are in UTC
const leo = items.find((item) => item['zt:sign'] === 'leo' && item['zt:date'] === today);

console.log(`${leo.title} (score ${leo['zt:score']}/10)\n${leo.description}`);
console.log('Horoscopes by Zodiac Timeline: https://zodiactimeline.com');
```

**Python 3.12+** (standard library only)

```python
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

NS = {"zt": "https://zodiactimeline.com/feed"}

# Send your own User-Agent: Python's default one ("Python-urllib/…") is rejected with HTTP 403.
request = urllib.request.Request(
    "https://zodiactimeline.com/feed.xml",
    headers={"User-Agent": "my-horoscope-app/1.0 (+https://example.com)"},
)
with urllib.request.urlopen(request, timeout=10) as response:
    root = ET.fromstring(response.read())

today = datetime.now(timezone.utc).date().isoformat()  # dates are in UTC
for item in root.iter("item"):
    if item.findtext("zt:sign", namespaces=NS) == "leo" and item.findtext("zt:date", namespaces=NS) == today:
        print(f"{item.findtext('title')} (score {item.findtext('zt:score', namespaces=NS)}/10)")
        print(item.findtext("description"))

print("Horoscopes by Zodiac Timeline: https://zodiactimeline.com")
```

## Credit Zodiac Timeline

The free API has one condition: show the name **Zodiac Timeline** near the horoscopes, where your readers can
see it, as a link to **https://zodiactimeline.com**:

```html
<a href="https://zodiactimeline.com">Zodiac Timeline</a>
```

For example: *Horoscopes by <a href="https://zodiactimeline.com">Zodiac Timeline</a>.*

Both examples show this credit in the page header and footer and add a "Read on Zodiac Timeline" link to every
reading. The JSON endpoint includes a `credit` object, so any frontend that uses it can show the credit too.
The full terms are on the official [Zodiac Timeline free API page](https://zodiactimeline.com/horoscope-rss-feed/).

## Be kind to the API: cache it

The response changes **once a day**, a few minutes after midnight UTC, so fetching it more often adds nothing.
Fetch it once, keep it in memory, a file, a database or a cache, and refresh it after the daily update. Both
examples refresh after 00:10 UTC (never more than once every 10 minutes) and keep serving the last good copy
if a refresh fails.

## FAQ

**Is it really free?**
Yes. You can show the horoscopes on your website, app or newsletter at no cost. The only condition is a visible
credit linking to [Zodiac Timeline](https://zodiactimeline.com).

**Do I need an API key?**
No. Send a plain `GET` request. No key, no account.

**Can I show just one sign?**
Yes. Filter the items by the `zt:sign` field, for example `leo`. Try `/?sign=leo` in either example.

**Which day is "today"?**
Dates follow UTC. The five dates are the two days before the current UTC date, the current UTC date, and the two
days after it.

**Where can I see more than five days?**
[zodiactimeline.com](https://zodiactimeline.com) shows 15 days of horoscopes for every sign.

**Can I use it in a language that isn't covered here?**
Yes. Any language that can make an HTTP request and parse XML works. The two examples here are a starting point.

## Contributing

Bug reports and improvements to these examples are welcome. Please open an issue or a pull request.

## License

The example code in this repository is released under the [MIT License](LICENSE).
The horoscope content returned by the API belongs to Zodiac Timeline. You may use it under the terms of the
[Zodiac Timeline free API](https://zodiactimeline.com/horoscope-rss-feed/), which require a visible credit.

---

Made by [Zodiac Timeline](https://zodiactimeline.com): horoscopes past, present and future.
