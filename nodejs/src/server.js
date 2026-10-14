/**
 * Example web server: calls the Zodiac Timeline Horoscope API on the server (browsers are blocked by CORS)
 * and serves it as an HTML page and as JSON.
 *
 * Routes:
 *   GET /                 HTML page with day tabs, a sign filter and one card per horoscope
 *   GET /api/horoscopes   the same data as JSON, for your own frontend
 *   GET /healthz          health check for uptime monitors and load balancers
 *
 *   npm start  ->  http://localhost:3000
 */
import { fileURLToPath } from 'node:url';
import express from 'express';
import { API_URL, CREDIT, createZodiacTimelineClient, defaultDate, filterHoroscopes, isSign } from './zodiacTimeline.js';
import { renderErrorPage, renderPage } from './render.js';

/**
 * Build the Express app. Tests pass in a client with a fake fetch so they never call the real API.
 */
export function createApp({ client = createZodiacTimelineClient() } = {}) {
  const app = express();
  app.disable('x-powered-by'); // don't advertise the framework in response headers
  // Serve styles.css and any other static files from ../public.
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

  // HTML page. Unknown ?sign or ?date values fall back to the defaults.
  app.get('/', async (req, res) => {
    let data;
    try {
      data = await client.getHoroscopes();
    } catch (error) {
      console.error(`Could not load the Zodiac Timeline Horoscope API: ${error.message}`);
      res.status(502).send(renderErrorPage({ message: 'We could not reach the Zodiac Timeline Horoscope API. Please try again in a few minutes.' }));
      return;
    }

    // null means "All signs". Dates are limited to the five days in the API response.
    const selectedSign = isSign(req.query.sign) ? req.query.sign : null;
    const selectedDate = data.dates.includes(req.query.date) ? req.query.date : defaultDate(data.dates);
    const horoscopes = filterHoroscopes(data.horoscopes, { sign: selectedSign, date: selectedDate });

    res.send(renderPage({ horoscopes, dates: data.dates, selectedDate, selectedSign, stale: data.stale }));
  });

  // JSON endpoint. Optional filters: ?sign=leo&date=2026-10-13
  app.get('/api/horoscopes', async (req, res) => {
    const { sign, date } = req.query;
    // Validate the sign before loading data so a typo gets a quick, clear 400.
    if (sign !== undefined && !isSign(sign)) {
      res.status(400).json({ error: `Unknown sign "${sign}". Use a lowercase sign name such as "leo".` });
      return;
    }

    let data;
    try {
      data = await client.getHoroscopes();
    } catch (error) {
      console.error(`Could not load the Zodiac Timeline Horoscope API: ${error.message}`);
      res.status(502).json({ error: 'Could not load the Zodiac Timeline Horoscope API. Please try again in a few minutes.' });
      return;
    }

    if (date !== undefined && !data.dates.includes(date)) {
      res.status(400).json({ error: `Date "${date}" is not in the Zodiac Timeline Horoscope API response. Available dates: ${data.dates.join(', ')}.` });
      return;
    }

    const horoscopes = filterHoroscopes(data.horoscopes, { sign, date });
    res.json({
      credit: CREDIT, // lets any frontend using this JSON show the required credit
      source: API_URL,
      fetchedAt: new Date(data.fetchedAt).toISOString(),
      stale: data.stale, // true when the API could not be reached and this is the last saved copy
      dates: data.dates,
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
