// Cached, indexed view over backend/data/prices.json.
//
// Every endpoint used to readFileSync + JSON.parse the whole ~10MB file on each
// request, which blocked the event loop for a few hundred milliseconds — in the
// same process that runs the Playwright worker. With the dashboard polling every
// few seconds that was the dominant source of both API latency and scraper
// stalls.
//
// The file is now parsed once and re-read only when its mtime changes, so a
// scrape flush is picked up automatically but idle requests cost nothing.

const fsp = require('fs/promises');
const path = require('path');

const DATA_FILE = process.env.PRICES_FILE
  ? path.resolve(process.env.PRICES_FILE)
  : path.join(__dirname, '../data/prices.json');

const EMPTY = Object.freeze({
  last_updated: null,
  rows: Object.freeze([]),
  lite: Object.freeze([]),
  byKey: new Map(),
  locations: Object.freeze([]),
  mtimeMs: 0,
});

let cache = EMPTY;
let inFlight = null;

function historyKey(q) {
  return [q.cinema, q.location, q.movie, q.seat_category, q.date, q.showtime].join(' ');
}

function isOwned(cinema) {
  if (typeof cinema !== 'string') return false;
  const lower = cinema.toLowerCase();
  return lower.includes('devgn') || lower.includes('owned');
}

async function build(mtimeMs) {
  const raw = await fsp.readFile(DATA_FILE, 'utf-8');
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed.data) ? parsed.data : [];

  const byKey = new Map();
  const locations = new Set();
  // The dashboard never needs `history`, and it's the bulk of the payload, so
  // strip it once here instead of re-mapping the array on every request.
  const lite = new Array(rows.length);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const { history, ...rest } = row;
    rest.owned = isOwned(row.cinema);
    lite[i] = rest;
    byKey.set(historyKey(row), history || [{ price: row.price, scraped_at: row.scraped_at }]);
    if (row.location) locations.add(row.location);
  }

  return {
    last_updated: parsed.last_updated || null,
    rows,
    lite,
    byKey,
    locations: [...locations].sort(),
    mtimeMs,
  };
}

/**
 * Current parsed dataset, reloading only if prices.json changed on disk.
 * Concurrent callers share a single in-flight reload.
 */
async function getSnapshot() {
  let stat;
  try {
    stat = await fsp.stat(DATA_FILE);
  } catch (err) {
    if (err.code === 'ENOENT') return EMPTY;
    throw err;
  }

  if (cache.mtimeMs === stat.mtimeMs) return cache;
  if (inFlight) return inFlight;

  inFlight = build(stat.mtimeMs)
    .then((next) => {
      cache = next;
      inFlight = null;
      console.log(`[PriceStore] Loaded ${next.lite.length} rows (updated ${next.last_updated}).`);
      return next;
    })
    .catch((err) => {
      inFlight = null;
      // Keep serving the last good snapshot rather than 500ing the dashboard
      // because a flush was caught mid-write.
      console.error('[PriceStore] Reload failed, serving previous snapshot:', err.message);
      return cache;
    });

  return inFlight;
}

/** Price rows matching the given filters, with `history` already stripped. */
async function queryPrices({ date, location, owned } = {}) {
  const snap = await getSnapshot();
  let rows = snap.lite;

  if (date) rows = rows.filter((r) => r.date === date);
  if (location) rows = rows.filter((r) => r.location === location);
  if (owned) rows = rows.filter((r) => r.owned);

  return { last_updated: snap.last_updated, total_entries: rows.length, data: rows };
}

async function queryMovies({ date, location } = {}) {
  const snap = await getSnapshot();
  const movies = new Set();
  for (const row of snap.lite) {
    if (date && row.date !== date) continue;
    if (location && row.location !== location) continue;
    if (row.movie) movies.add(row.movie);
  }
  return [...movies].sort();
}

async function queryLocations() {
  return (await getSnapshot()).locations;
}

async function queryHistory(q) {
  const snap = await getSnapshot();
  return snap.byKey.get(historyKey(q)) || [];
}

async function getStatus() {
  const snap = await getSnapshot();
  return { last_updated: snap.last_updated, total_entries: snap.lite.length };
}

module.exports = {
  getSnapshot,
  queryPrices,
  queryMovies,
  queryLocations,
  queryHistory,
  getStatus,
  DATA_FILE,
};
