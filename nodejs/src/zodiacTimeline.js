/**
 * Zodiac Timeline Horoscope API client.
 *
 * Downloads the daily horoscopes from the Zodiac Timeline Horoscope API, parses the XML into plain
 * objects and keeps them in memory until the API's next daily update.
 *
 * Main exports:
 *   createZodiacTimelineClient()  cached client; call getHoroscopes() whenever you need the data
 *   filterHoroscopes()            pick horoscopes by sign and/or date
 *   CREDIT                        the attribution to show next to the horoscopes
 *   SIGNS                         the 12 signs with display name, glyph and date range
 *
 * The Horoscope API is free and needs no key; the only condition is a visible credit to Zodiac Timeline:
 *   <a href="https://zodiactimeline.com">Zodiac Timeline</a>
 * Details: https://zodiactimeline.com/horoscope-api/
 */
import { XMLParser } from 'fast-xml-parser';

// The API endpoint. Set ZT_API_URL to point the client somewhere else, for example a local test server.
export const API_URL = process.env.ZT_API_URL || 'https://zodiactimeline.com/feed.xml';

/** Attribution required by the API's terms. Show it wherever the horoscopes appear. */
export const CREDIT = Object.freeze({
  name: 'Zodiac Timeline',
  url: 'https://zodiactimeline.com',
  terms: 'https://zodiactimeline.com/horoscope-api/',
});

// Variation selector that asks browsers to draw a zodiac glyph as a text symbol instead of an emoji.
const TEXT_STYLE = '\uFE0E';

/** The 12 signs in zodiac order. The `key` matches the API's <zt:sign> value. */
export const SIGNS = Object.freeze([
  { key: 'aries', name: 'Aries', glyph: '♈' + TEXT_STYLE, dates: 'Mar 21 – Apr 19' },
  { key: 'taurus', name: 'Taurus', glyph: '♉' + TEXT_STYLE, dates: 'Apr 20 – May 20' },
  { key: 'gemini', name: 'Gemini', glyph: '♊' + TEXT_STYLE, dates: 'May 21 – Jun 20' },
  { key: 'cancer', name: 'Cancer', glyph: '♋' + TEXT_STYLE, dates: 'Jun 21 – Jul 22' },
  { key: 'leo', name: 'Leo', glyph: '♌' + TEXT_STYLE, dates: 'Jul 23 – Aug 22' },
  { key: 'virgo', name: 'Virgo', glyph: '♍' + TEXT_STYLE, dates: 'Aug 23 – Sep 22' },
  { key: 'libra', name: 'Libra', glyph: '♎' + TEXT_STYLE, dates: 'Sep 23 – Oct 22' },
  { key: 'scorpio', name: 'Scorpio', glyph: '♏' + TEXT_STYLE, dates: 'Oct 23 – Nov 21' },
  { key: 'sagittarius', name: 'Sagittarius', glyph: '♐' + TEXT_STYLE, dates: 'Nov 22 – Dec 21' },
  { key: 'capricorn', name: 'Capricorn', glyph: '♑' + TEXT_STYLE, dates: 'Dec 22 – Jan 19' },
  { key: 'aquarius', name: 'Aquarius', glyph: '♒' + TEXT_STYLE, dates: 'Jan 20 – Feb 18' },
  { key: 'pisces', name: 'Pisces', glyph: '♓' + TEXT_STYLE, dates: 'Feb 19 – Mar 20' },
]);

// Lookups built once from SIGNS: sign key -> sign details, and sign key -> position in the zodiac (0-11).
const SIGN_BY_KEY = new Map(SIGNS.map((sign) => [sign.key, sign]));
const SIGN_ORDER = new Map(SIGNS.map((sign, index) => [sign.key, index]));

/** True if `value` is one of the 12 sign keys, such as "leo". */
export function isSign(value) {
  return SIGN_BY_KEY.has(value);
}

/** The sign details (name, glyph, dates) for a sign key, or undefined. */
export function getSign(key) {
  return SIGN_BY_KEY.get(key);
}

// One shared parser. isArray keeps `item` an array even when the response holds a single item.
const parser = new XMLParser({
  ignoreAttributes: true, // every field we need is element text, not an attribute
  parseTagValue: false, // keep every value as a string; we convert the score ourselves
  isArray: (name) => name === 'item',
});

/**
 * Parse the API response XML into an array of horoscopes, sorted by date and then zodiac order.
 *
 * @param {string} xml
 * @returns {Array<{sign: string, signName: string, glyph: string, date: string, score: number | null,
 *   title: string, text: string, paragraphs: string[], link: string}>}
 */
export function parseResponse(xml) {
  const doc = parser.parse(xml);
  // Each <item> inside the document's <channel> is one horoscope: one sign on one day.
  const items = doc?.rss?.channel?.item;
  if (!Array.isArray(items)) {
    throw new Error('Unexpected Zodiac Timeline Horoscope API response: no <item> elements found');
  }

  // Position of a sign in the zodiac, used for sorting. Unknown keys go after the 12 known signs.
  const order = (key) => SIGN_ORDER.get(key) ?? SIGNS.length;

  return items
    .map((item) => {
      // zt:sign, zt:date and zt:score are Zodiac Timeline's own fields; title, description and link are standard.
      const sign = SIGN_BY_KEY.get(item['zt:sign']);
      const text = String(item.description ?? '').trim();
      return {
        sign: item['zt:sign'],
        signName: sign?.name ?? item['zt:sign'],
        glyph: sign?.glyph ?? '',
        date: item['zt:date'],
        score: parseScore(item['zt:score']),
        title: item.title,
        text,
        // The reading is plain text with paragraphs separated by newlines.
        paragraphs: text.split(/\n+/).map((p) => p.trim()).filter(Boolean),
        link: item.link,
      };
    })
    // YYYY-MM-DD strings sort correctly as text, so this orders by date first, then by zodiac position.
    .sort((a, b) => a.date.localeCompare(b.date) || order(a.sign) - order(b.sign));
}

/** The day score out of 10 as a number, or null if the item has no valid score. */
function parseScore(value) {
  const score = Number.parseFloat(value);
  return Number.isFinite(score) ? score : null;
}

/** Sorted list of the dates (YYYY-MM-DD) present in the API response. */
export function listDates(horoscopes) {
  return [...new Set(horoscopes.map((h) => h.date))].sort();
}

/** Keep only the horoscopes matching `sign` and/or `date` (both optional). */
export function filterHoroscopes(horoscopes, { sign, date } = {}) {
  return horoscopes.filter((h) => (!sign || h.sign === sign) && (!date || h.date === date));
}

/** Today's date in UTC as YYYY-MM-DD. The API's dates follow UTC. */
export function todayUtc(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Today (UTC) if the API response contains it, otherwise the middle of the 5-day window. */
export function defaultDate(dates, now = Date.now()) {
  const today = todayUtc(now);
  return dates.includes(today) ? today : dates[Math.floor(dates.length / 2)];
}

const MIN_CACHE_MS = 10 * 60 * 1000; // the API response is served with Cache-Control: max-age=600
const UPDATE_MINUTE_UTC = 10; // the API updates a few minutes after 00:00 UTC

/**
 * When the cached response should be refreshed: the next 00:10 UTC, but never sooner than
 * 10 minutes from now. The API response changes only once a day, so polling more often adds nothing.
 */
export function nextRefreshTime(now = Date.now()) {
  // Today at 00:10 UTC, or tomorrow at 00:10 UTC if that moment has already passed.
  const next = new Date(now);
  next.setUTCHours(0, UPDATE_MINUTE_UTC, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(next.getTime(), now + MIN_CACHE_MS);
}

/** Download the raw API response XML. Call this from a server; browsers are blocked by CORS. */
export async function fetchApiXml({ url = API_URL, fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/xml',
      // Name your app in the User-Agent: requests with some generic library defaults are refused.
      'User-Agent': 'free-horoscope-api-examples/1.0 (+https://github.com/zodiactimeline/free-horoscope-api-examples)',
    },
    signal: AbortSignal.timeout(timeoutMs), // give up instead of hanging if the API does not answer
  });
  if (!response.ok) {
    throw new Error(`Zodiac Timeline Horoscope API request failed: HTTP ${response.status}`);
  }
  return response.text();
}

/**
 * A cached Zodiac Timeline Horoscope API client. `getHoroscopes()` downloads the API response at most once per
 * daily update and falls back to the last good copy (marked `stale: true`) if a refresh fails.
 *
 * Create one client when your server starts and reuse it, so every request shares the same cache.
 * Tests can pass their own `fetchImpl` and `now` to avoid network calls and control the clock.
 *
 * @returns {{getHoroscopes: () => Promise<{horoscopes: object[], dates: string[], fetchedAt: number,
 *   expiresAt: number, stale: boolean}>}}
 */
export function createZodiacTimelineClient({ url = API_URL, fetchImpl = fetch, now = Date.now } = {}) {
  let cache = null; // { horoscopes, dates, fetchedAt, expiresAt, stale }
  let pending = null; // the refresh in progress, if any

  // Download and parse a fresh copy. If that fails, keep the previous copy when there is one.
  async function refresh() {
    try {
      const horoscopes = parseResponse(await fetchApiXml({ url, fetchImpl }));
      const fetchedAt = now();
      cache = {
        horoscopes,
        dates: listDates(horoscopes),
        fetchedAt,
        expiresAt: nextRefreshTime(fetchedAt),
        stale: false,
      };
    } catch (error) {
      if (!cache) throw error;
      // Keep serving the last good copy and wait a little before trying again.
      console.warn(`Zodiac Timeline Horoscope API refresh failed, serving cached copy: ${error.message}`);
      cache = { ...cache, expiresAt: now() + MIN_CACHE_MS, stale: true };
    }
    return cache;
  }

  return {
    async getHoroscopes() {
      // Still fresh: answer from memory without calling the API.
      if (cache && now() < cache.expiresAt) return cache;

      // Share one in-flight request between concurrent callers.
      pending ??= refresh().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}
