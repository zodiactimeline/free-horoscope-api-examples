# Node.js example · Zodiac Timeline Horoscope API

A small [Express](https://expressjs.com) server that calls the free
[Zodiac Timeline Horoscope API](https://zodiactimeline.com/horoscope-api/) on the server and serves daily
horoscopes for all 12 zodiac signs as an HTML page and as JSON.

← Back to the [main README](../README.md) · [API reference](../docs/API.md)

## Requirements

- Node.js **22 or newer**. The example uses the built-in `fetch` and `node:test`.

## Run it

```bash
cd nodejs
npm install
npm start
```

Open **http://localhost:3000**. To use another port, run `PORT=4000 npm start`.

| Route | What it returns |
|---|---|
| `GET /` | HTML page: 5 day tabs, a sign filter and 12 horoscope cards. Optional `?date=YYYY-MM-DD` and `?sign=leo`. |
| `GET /api/horoscopes` | JSON. Optional filters `?sign=leo` and `?date=YYYY-MM-DD`. Unknown values return `400`. |
| `GET /healthz` | `{ "status": "ok" }` |

Example JSON response (`/api/horoscopes?sign=leo`, shortened):

```json
{
  "credit": {
    "name": "Zodiac Timeline",
    "url": "https://zodiactimeline.com",
    "terms": "https://zodiactimeline.com/horoscope-api/"
  },
  "source": "https://zodiactimeline.com/feed.xml",
  "fetchedAt": "2026-10-13T21:15:52.000Z",
  "stale": false,
  "dates": ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"],
  "count": 5,
  "horoscopes": [
    {
      "sign": "leo",
      "signName": "Leo",
      "glyph": "♌\ufe0e",
      "date": "2026-10-11",
      "score": 4.9,
      "title": "Leo · October 11, 2026",
      "text": "…",
      "paragraphs": ["…", "…"],
      "link": "https://zodiactimeline.com/leo/2026-10-11/"
    }
  ]
}
```

`score` is the day score out of 10. It is `null` in the rare case an item has no valid score, and the page then
leaves out the score bar.

## How it works

```
src/
  zodiacTimeline.js   Zodiac Timeline Horoscope API client: fetch, parse, cache, helpers
  server.js           Express routes (HTML page, JSON, health check)
  render.js           HTML templates (template literals with HTML escaping)
public/styles.css     Page styles (light and dark mode)
test/                 Offline tests against ../fixtures/api-response.sample.xml
```

1. **Fetch.** `fetchApiXml()` sends a `GET` to the Horoscope API endpoint with a 10-second timeout
   and a descriptive `User-Agent`.
2. **Parse.** `parseResponse()` uses [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) to turn
   the 60 `<item>` elements into plain objects. It reads `zt:sign`, `zt:date` and `zt:score`, and splits the
   reading into paragraphs.
3. **Cache.** `createZodiacTimelineClient()` keeps the result in memory until the next daily update (00:10 UTC). If a
   refresh fails, it keeps serving the last good copy and marks it `stale`.
4. **Render.** `server.js` filters by date and sign, and `render.js` builds the page. Every value from the API is
   escaped with `escapeHtml()`.
5. **Credit.** The header and footer link to [Zodiac Timeline](https://zodiactimeline.com), as the Horoscope API
   requires, and each card links to its full reading on zodiactimeline.com.

## Use the client in your own app

Copy `src/zodiacTimeline.js` into your project (`npm install fast-xml-parser`) and call it from any server code:

```js
import { createZodiacTimelineClient, filterHoroscopes, todayUtc, CREDIT } from './zodiacTimeline.js';

const zodiacTimeline = createZodiacTimelineClient(); // create once and reuse, so the cache works

const { horoscopes } = await zodiacTimeline.getHoroscopes();
const [leoToday] = filterHoroscopes(horoscopes, { sign: 'leo', date: todayUtc() });

console.log(leoToday.title, `${leoToday.score}/10`);
console.log(leoToday.text);
console.log(`Horoscopes by ${CREDIT.name}: ${CREDIT.url}`); // credit required by the Horoscope API
```

Remember to show the credit `<a href="https://zodiactimeline.com">Zodiac Timeline</a>` wherever the horoscopes
appear.

## Tests

```bash
npm test
```

The tests use the saved response in `../fixtures/api-response.sample.xml` and a stubbed `fetch`, so they never call the
real API.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port for the web server |
| `ZT_API_URL` | `https://zodiactimeline.com/feed.xml` | Override the API URL, for example to test error handling |
