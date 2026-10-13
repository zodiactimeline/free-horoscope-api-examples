/**
 * Server-side HTML for the example page, built with plain template literals so no template engine
 * is needed. Every value that comes from the API goes through escapeHtml().
 */
import { CREDIT, SIGNS, getSign, todayUtc } from './zodiacTimeline.js';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const dayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const longFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const asUtcDate = (isoDate) => new Date(`${isoDate}T00:00:00Z`);

function pageUrl({ date, sign }) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (sign) params.set('sign', sign);
  const query = params.toString();
  return query ? `/?${query}` : '/';
}

function layout({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="Free daily horoscopes for all 12 zodiac signs, powered by the Zodiac Timeline free API.">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="site-header">
    <div class="container">
      <h1>Daily Horoscopes</h1>
      <p class="tagline">All 12 signs, 5 days. Horoscopes by <a href="${CREDIT.url}">${CREDIT.name}</a>.</p>
    </div>
  </header>
  <main class="container">
${body}
  </main>
  <footer class="site-footer">
    <div class="container">
      <p>Horoscopes provided by <a href="${CREDIT.url}">${CREDIT.name}</a>, free for anyone to use with credit.
        See the <a href="${CREDIT.terms}">Zodiac Timeline free API</a> page for details.</p>
      <p class="muted">Example app from <a href="https://github.com/zodiactimeline/free-horoscope-api-examples">free-horoscope-api-examples</a> (Node.js).</p>
    </div>
  </footer>
</body>
</html>
`;
}

function dayTabs({ dates, selectedDate, selectedSign }) {
  const today = todayUtc();
  const tabs = dates
    .map((date) => {
      const current = date === selectedDate ? ' aria-current="page"' : '';
      const label = date === today ? 'Today' : dayFormat.format(asUtcDate(date));
      return `<a class="tab" href="${escapeHtml(pageUrl({ date, sign: selectedSign }))}"${current}>${escapeHtml(label)}</a>`;
    })
    .join('\n        ');
  return `<nav class="tabs" aria-label="Choose a day">
        ${tabs}
      </nav>`;
}

function signFilter({ selectedDate, selectedSign }) {
  const chip = (key, label) => {
    const current = (key ?? '') === (selectedSign ?? '') ? ' aria-current="page"' : '';
    return `<a class="chip" href="${escapeHtml(pageUrl({ date: selectedDate, sign: key }))}"${current}>${escapeHtml(label)}</a>`;
  };
  const chips = [chip(null, 'All signs'), ...SIGNS.map((s) => chip(s.key, `${s.glyph} ${s.name}`))];
  return `<nav class="chips" aria-label="Choose a sign">
        ${chips.join('\n        ')}
      </nav>`;
}

function scoreBar(score) {
  if (score === null) return '';
  return `<div class="score" role="img" aria-label="Day score ${score.toFixed(1)} out of 10">
          <div class="score-bar"><span style="width: ${Math.round(score * 10)}%"></span></div>
          <span class="score-value">${score.toFixed(1)} / 10</span>
        </div>`;
}

function card(h) {
  const paragraphs = h.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n          ');
  return `<article class="card">
        <header class="card-header">
          <span class="glyph" aria-hidden="true">${escapeHtml(h.glyph)}</span>
          <div>
            <h2>${escapeHtml(h.signName)}</h2>
            <p class="muted">${escapeHtml(getSign(h.sign)?.dates ?? '')}</p>
          </div>
        </header>
        ${scoreBar(h.score)}
        <div class="reading">
          ${paragraphs}
        </div>
        <a class="read-more" href="${escapeHtml(h.link)}">Read on Zodiac Timeline →</a>
      </article>`;
}

export function renderPage({ horoscopes, dates, selectedDate, selectedSign, stale }) {
  const notice = stale
    ? `<p class="notice">Showing the last saved copy because the Zodiac Timeline free API could not be reached just now.</p>\n`
    : '';
  const heading = longFormat.format(asUtcDate(selectedDate));
  const body = `    <section class="controls">
      ${dayTabs({ dates, selectedDate, selectedSign })}
      ${signFilter({ selectedDate, selectedSign })}
    </section>
    ${notice}<h2 class="date-heading">${escapeHtml(heading)}</h2>
    <section class="grid">
      ${horoscopes.map(card).join('\n      ')}
    </section>`;
  return layout({ title: `Daily Horoscopes for ${heading} · Zodiac Timeline`, body });
}

export function renderErrorPage({ message }) {
  const body = `    <section class="error">
      <h2>Horoscopes are unavailable right now</h2>
      <p>${escapeHtml(message)}</p>
      <p>You can still read today's horoscopes at <a href="${CREDIT.url}">zodiactimeline.com</a>.</p>
    </section>`;
  return layout({ title: 'Horoscopes unavailable · Zodiac Timeline', body });
}
