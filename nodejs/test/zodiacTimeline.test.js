import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIGNS,
  createZodiacTimelineClient,
  defaultDate,
  filterHoroscopes,
  listDates,
  nextRefreshTime,
  parseResponse,
} from '../src/zodiacTimeline.js';
import { createApp } from '../src/server.js';
import { escapeHtml } from '../src/render.js';

// A saved Horoscope API response, so the tests never hit the network.
const SAMPLE_XML = readFileSync(new URL('../../fixtures/api-response.sample.xml', import.meta.url), 'utf8');

const fakeFetch = (body, status = 200) => async () => new Response(body, { status });

describe('parseResponse', () => {
  const horoscopes = parseResponse(SAMPLE_XML);

  it('returns 60 horoscopes: 12 signs × 5 days', () => {
    assert.equal(horoscopes.length, 60);
    assert.equal(listDates(horoscopes).length, 5);
    assert.deepEqual(new Set(horoscopes.map((h) => h.sign)), new Set(SIGNS.map((s) => s.key)));
  });

  it('parses every field', () => {
    for (const h of horoscopes) {
      assert.match(h.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(h.score >= 0 && h.score <= 10, `score ${h.score} out of range`);
      assert.ok(h.paragraphs.length > 0);
      assert.ok(h.link.startsWith(`https://zodiactimeline.com/${h.sign}/${h.date}`));
      assert.ok(h.title.startsWith(h.signName));
    }
  });

  it('sorts by date, then zodiac order', () => {
    const first = listDates(horoscopes)[0];
    assert.deepEqual(
      horoscopes.slice(0, 12).map((h) => [h.date, h.sign]),
      SIGNS.map((s) => [first, s.key]),
    );
  });

  it('returns a null score when an item has no valid score', () => {
    const xml = SAMPLE_XML.replace(/<zt:score>[^<]*<\/zt:score>/, '<zt:score></zt:score>');
    assert.equal(parseResponse(xml).filter((h) => h.score === null).length, 1);
  });

  it('rejects XML that is not the API response', () => {
    assert.throws(() => parseResponse('<html></html>'), /no <item> elements/);
  });
});

describe('helpers', () => {
  const horoscopes = parseResponse(SAMPLE_XML);
  const dates = listDates(horoscopes);

  it('filters by sign and date', () => {
    assert.equal(filterHoroscopes(horoscopes, { sign: 'leo' }).length, 5);
    assert.equal(filterHoroscopes(horoscopes, { date: dates[0] }).length, 12);
    assert.equal(filterHoroscopes(horoscopes, { sign: 'leo', date: dates[0] }).length, 1);
  });

  it('defaults to today (UTC) when the API response has it, else the middle day', () => {
    assert.equal(defaultDate(dates, Date.parse(`${dates[1]}T23:00:00Z`)), dates[1]);
    assert.equal(defaultDate(dates, Date.parse('2000-01-01T00:00:00Z')), dates[2]);
  });

  it('refreshes after the next 00:10 UTC, but not within 10 minutes', () => {
    assert.equal(nextRefreshTime(Date.parse('2026-10-13T15:00:00Z')), Date.parse('2026-10-14T00:10:00Z'));
    assert.equal(nextRefreshTime(Date.parse('2026-10-13T00:05:00Z')), Date.parse('2026-10-13T00:15:00Z'));
  });

  it('escapes HTML', () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('createZodiacTimelineClient', () => {
  it('caches until the next daily update', async () => {
    let calls = 0;
    let now = Date.parse('2026-10-13T15:00:00Z');
    const client = createZodiacTimelineClient({
      fetchImpl: async () => {
        calls += 1;
        return new Response(SAMPLE_XML);
      },
      now: () => now,
    });

    await client.getHoroscopes();
    now += 60 * 60 * 1000;
    await client.getHoroscopes();
    assert.equal(calls, 1);

    now = Date.parse('2026-10-14T00:11:00Z');
    await client.getHoroscopes();
    assert.equal(calls, 2);
  });

  it('serves the last good copy when a refresh fails', async (t) => {
    t.mock.method(console, 'warn', () => {});
    let fail = false;
    let now = Date.parse('2026-10-13T15:00:00Z');
    const client = createZodiacTimelineClient({
      fetchImpl: async () => (fail ? new Response('down', { status: 503 }) : new Response(SAMPLE_XML)),
      now: () => now,
    });
    await client.getHoroscopes();

    fail = true;
    now = Date.parse('2026-10-14T01:00:00Z');
    const result = await client.getHoroscopes();
    assert.equal(result.stale, true);
    assert.equal(result.horoscopes.length, 60);
  });

  it('throws when the first request fails', async () => {
    const client = createZodiacTimelineClient({ fetchImpl: fakeFetch('down', 503) });
    await assert.rejects(client.getHoroscopes(), /HTTP 503/);
  });
});

describe('server', () => {
  let server;
  let baseUrl;
  const dates = listDates(parseResponse(SAMPLE_XML));

  before(async () => {
    const app = createApp({ client: createZodiacTimelineClient({ fetchImpl: fakeFetch(SAMPLE_XML) }) });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  it('renders the HTML page with the Zodiac Timeline credit', async () => {
    const response = await fetch(`${baseUrl}/?date=${dates[0]}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.ok(html.includes('<a href="https://zodiactimeline.com">Zodiac Timeline</a>'));
    assert.equal(html.match(/class="card"/g).length, 12);
  });

  it('filters the page by sign', async () => {
    const html = await (await fetch(`${baseUrl}/?sign=leo&date=${dates[0]}`)).text();
    assert.equal(html.match(/class="card"/g).length, 1);
    assert.ok(html.includes(`https://zodiactimeline.com/leo/${dates[0]}/`));
  });

  it('returns JSON with credit', async () => {
    const response = await fetch(`${baseUrl}/api/horoscopes?sign=leo`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.credit.name, 'Zodiac Timeline');
    assert.equal(body.count, 5);
  });

  it('rejects unknown signs and dates in the JSON endpoint', async () => {
    assert.equal((await fetch(`${baseUrl}/api/horoscopes?sign=dragon`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/horoscopes?date=1999-01-01`)).status, 400);
  });

  it('serves the stylesheet', async () => {
    const response = await fetch(`${baseUrl}/styles.css`);
    assert.equal(response.status, 200);
  });
});

describe('server when the API is unreachable', () => {
  it('shows a friendly error page and a JSON error', async (t) => {
    t.mock.method(console, 'error', () => {});
    const app = createApp({ client: createZodiacTimelineClient({ fetchImpl: fakeFetch('down', 503) }) });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const page = await fetch(`${baseUrl}/`);
      assert.equal(page.status, 502);
      assert.ok((await page.text()).includes('zodiactimeline.com'));

      const api = await fetch(`${baseUrl}/api/horoscopes`);
      assert.equal(api.status, 502);
      assert.ok((await api.json()).error);
    } finally {
      server.close();
    }
  });
});
