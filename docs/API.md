# Zodiac Timeline Free API Reference

The Zodiac Timeline free API gives you daily Western astrology horoscopes for all 12 zodiac signs from
[Zodiac Timeline](https://zodiactimeline.com). It is free for anyone to use in a website, app, newsletter or
other product, on one condition: a visible credit to Zodiac Timeline.

Official page: **https://zodiactimeline.com/horoscope-rss-feed/**

- [Endpoint](#endpoint)
- [Response](#response)
- [Fields](#fields)
- [Dates and the update schedule](#dates-and-the-update-schedule)
- [Caching and polling](#caching-and-polling)
- [Calling the API from a browser (CORS)](#calling-the-api-from-a-browser-cors)
- [Error handling](#error-handling)
- [Credit and terms](#credit-and-terms)
- [FAQ](#faq)

## Endpoint

```
GET https://zodiactimeline.com/feed.xml
```

| | |
|---|---|
| Method | `GET` |
| Authentication | None. No API key, account or sign-up. |
| Query parameters | None. Every request returns the full 60-item response. |
| Response type | `application/xml` (RSS 2.0), UTF-8 |
| Response size | About 55 KB |

The same address also works as an ordinary RSS feed. You can paste it into any feed reader, website builder
feed block or feed plugin.

```bash
curl https://zodiactimeline.com/feed.xml
```

## Response

The response is an RSS 2.0 document. It has one `<channel>` holding **60 `<item>` elements: 12 signs × 5 days**.
Zodiac Timeline adds three fields in its own XML namespace:

```xml
xmlns:zt="https://zodiactimeline.com/feed"
```

Shortened example:

```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:zt="https://zodiactimeline.com/feed">
  <channel>
    <title>Zodiac Timeline: Daily Horoscopes</title>
    <link>https://zodiactimeline.com</link>
    <atom:link href="https://zodiactimeline.com/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Zodiac Timeline RSS feed: daily horoscopes for all 12 signs over a 5-day timeline …</description>
    <language>en</language>
    <lastBuildDate>Tue, 13 Oct 2026 19:10:37 +0000</lastBuildDate>

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

    <!-- … 59 more items … -->
  </channel>
</rss>
```

A complete real response is saved in [`fixtures/feed.sample.xml`](../fixtures/feed.sample.xml).

## Fields

### Channel

| Element | Description |
|---|---|
| `title` | `Zodiac Timeline: Daily Horoscopes` |
| `link` | `https://zodiactimeline.com` |
| `description` | A short description of the content and the license |
| `language` | `en` |
| `lastBuildDate` | When the response was last generated (RFC 822) |

### Item (one horoscope)

| Element | Type | Example | Description |
|---|---|---|---|
| `title` | text | `Leo · October 13, 2026` | Sign name and date, ready to show as a heading |
| `link` | URL | `https://zodiactimeline.com/leo/2026-10-13/` | The page for this sign and day on Zodiac Timeline. Use it for "Read more" links. |
| `guid` | URL | same as `link` | Stable unique ID for the item |
| `pubDate` | RFC 822 date | `Tue, 13 Oct 2026 00:00:00 +0000` | Midnight UTC of the horoscope's date |
| `description` | plain text | `This is a good time to …` | The full reading. Plain text without HTML, made of several paragraphs separated by newlines (`\n`). |
| `zt:sign` | text | `leo` | The sign in lowercase. One of `aries`, `taurus`, `gemini`, `cancer`, `leo`, `virgo`, `libra`, `scorpio`, `sagittarius`, `capricorn`, `aquarius`, `pisces`. |
| `zt:date` | `YYYY-MM-DD` | `2026-10-13` | The date the horoscope is for (UTC) |
| `zt:score` | decimal | `3.5` | The overall score for the day, **out of 10** |

Tips:

- Use `zt:sign` and `zt:date` to find a horoscope. Don't parse the `title`.
- The `description` is plain text, so **escape it** before you insert it into HTML, as you would any outside
  data. To show paragraphs, split it on newlines.
- `zt:score` works well as a bar, stars or a "good day / tough day" label. The examples show it as `7.4 / 10`
  with a bar.
- Look the `zt:` elements up through their namespace (`https://zodiactimeline.com/feed`) rather than relying on
  the `zt` prefix, if your XML library supports it.

## Dates and the update schedule

- The response always holds **five dates**: two days back, today, and two days ahead.
- "Today" is the current date in **UTC**.
- The API is updated **once a day, a few minutes after midnight UTC**. The oldest day then drops out and a
  new day is added at the end.

Users in other time zones can still be on "yesterday" or already on "tomorrow" in UTC terms. Because the response
covers two days on each side, you can pick the date that matches your user's local date. For example:

```js
// The user's local date as YYYY-MM-DD (the 'en-CA' locale formats dates that way)
const userTimeZone = 'America/New_York';
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: userTimeZone }).format(new Date());
```

## Caching and polling

The data changes only once a day, so **fetching it more often adds nothing**. Please:

1. Fetch the API from your server and **cache** the response in memory, a file, a database, Redis or a CDN.
2. **Refresh it once a day** after the update, for example at 00:10 UTC.
3. If a refresh fails, **keep serving your last good copy** and try again a few minutes later.

The HTTP response is also served with `Cache-Control: max-age=600` and an `ETag`, so standard HTTP caches will
behave correctly.

Both examples in this repository follow these rules. See `nextRefreshTime()` in
[`nodejs/src/zodiacTimeline.js`](../nodejs/src/zodiacTimeline.js) and `next_refresh_time()` in
[`python/zodiac_timeline.py`](../python/zodiac_timeline.py).

## Calling the API from a browser (CORS)

The API does not send CORS headers for other websites, so calling it with `fetch()` or `XMLHttpRequest` from
JavaScript in a visitor's browser **will be blocked**. Call it from your own server instead:

```
Browser  ──►  your server  ──►  https://zodiactimeline.com/feed.xml
                  │
                  └── cache, parse, filter, then return HTML or JSON to the browser
```

The `/api/horoscopes` route in both examples shows this pattern. Your frontend calls your own JSON endpoint,
and only your server talks to Zodiac Timeline.

## Error handling

Treat the API like any network dependency:

- Set a **timeout** (the examples use 10 seconds).
- Treat any non-`2xx` HTTP status as a failure.
- Catch XML parse errors, and check that items are present before you use them.
- On failure, serve your **cached copy** if you have one. Otherwise show a friendly message, ideally with a link
  to [zodiactimeline.com](https://zodiactimeline.com) so readers can still find their horoscope.
- Send a descriptive `User-Agent` that names your app. Requests with some generic library defaults are
  refused. For example, Python's `urllib` default (`Python-urllib/3.x`) gets `HTTP 403 Forbidden`.

## Credit and terms

The free API has one condition: show the name **Zodiac Timeline** near the horoscopes, where your readers can
see it, as a link to **https://zodiactimeline.com**:

```html
<a href="https://zodiactimeline.com">Zodiac Timeline</a>
```

Good places for it: under the horoscope heading, next to each reading, or in a "Horoscopes by …" line near the
horoscopes. Linking each reading to its `link` page on Zodiac Timeline is a nice extra for your readers.

This permission is part of Zodiac Timeline's Terms of Use. The authoritative terms are on the official page:
https://zodiactimeline.com/horoscope-rss-feed/

## FAQ

**Is the API really free?**
Yes. There is no cost. The only condition is the visible credit described above.

**Do I need a key or an account?**
No. Send a `GET` request to `https://zodiactimeline.com/feed.xml`.

**Can I show only one sign?**
Yes. Filter the items by `zt:sign`.

**Can I get more than five days?**
The free API holds five days. [zodiactimeline.com](https://zodiactimeline.com) shows 15 days of horoscopes,
like a weather forecast, for every sign.

**Which astrology system is used?**
Western astrology, computed by Zodiac Timeline's own astronomy and astrology engine.

**Can I use it in a newsletter or a website builder without code?**
Yes. Paste `https://zodiactimeline.com/feed.xml` into any RSS feed block or plugin, and keep the credit visible.
