/**
 * Example web server: calls the Zodiac Timeline free API on the server (browsers are blocked by CORS)
 * and serves it as an HTML page and as JSON.
 *
 *   npm start  ->  http://localhost:3000
 */
import { fileURLToPath } from 'node:url';
import express from 'express';
import { CREDIT, FEED_URL, createZodiacTimelineClient, defaultDate, filterHoroscopes, isSign } from './zodiacTimeline.js';
import { renderErrorPage, renderPage } from './render.js';

export function createApp({ client = createZodiacTimelineClient() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

  // HTML page. Unknown ?sign or ?date values fall back to the defaults.
  app.get('/', async (req, res) => {
    let feed;
    try {
      feed = await client.getHoroscopes();
    } catch (error) {
      console.error(`Could not load the Zodiac Timeline free API: ${error.message}`);
      res.status(502).send(renderErrorPage({ message: 'We could not reach the Zodiac Timeline free API. Please try again in a few minutes.' }));
      return;
    }

    const selectedSign = isSign(req.query.sign) ? req.query.sign : null;
    const selectedDate = feed.dates.includes(req.query.date) ? req.query.date : defaultDate(feed.dates);
    const horoscopes = filterHoroscopes(feed.horoscopes, { sign: selectedSign, date: selectedDate });

    res.send(renderPage({ horoscopes, dates: feed.dates, selectedDate, selectedSign, stale: feed.stale }));
  });

  // JSON endpoint. Optional filters: ?sign=leo&date=2026-10-13
  app.get('/api/horoscopes', async (req, res) => {
    const { sign, date } = req.query;
    if (sign !== undefined && !isSign(sign)) {
      res.status(400).json({ error: `Unknown sign "${sign}". Use a lowercase sign name such as "leo".` });
      return;
    }

    let feed;
    try {
      feed = await client.getHoroscopes();
    } catch (error) {
      console.error(`Could not load the Zodiac Timeline free API: ${error.message}`);
      res.status(502).json({ error: 'Could not load the Zodiac Timeline free API. Please try again in a few minutes.' });
      return;
    }

    if (date !== undefined && !feed.dates.includes(date)) {
      res.status(400).json({ error: `Date "${date}" is not in the Zodiac Timeline free API response. Available dates: ${feed.dates.join(', ')}.` });
      return;
    }

    const horoscopes = filterHoroscopes(feed.horoscopes, { sign, date });
    res.json({
      credit: CREDIT,
      source: FEED_URL,
      fetchedAt: new Date(feed.fetchedAt).toISOString(),
      stale: feed.stale,
      dates: feed.dates,
      count: horoscopes.length,
      horoscopes,
    });
  });

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  return app;
}

// Start the server when run directly (`node src/server.js`), not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`Zodiac Timeline example running at http://localhost:${port}`);
  });
}
