require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');

const priceStore = require('./lib/priceStore');

const app = express();
const PORT = process.env.PORT || 3000;

// How many days ahead the dashboard offers. Must match the scraper's horizon —
// exported so there's a single source of truth instead of a 4 hardcoded here
// and another one in scrapeLocation.js.
const FORECAST_DAYS = Number(process.env.FORECAST_DAYS) || 4;
const TIMEZONE = process.env.TZ_DISPLAY || 'Asia/Kolkata';

// A crash in the in-process scraper worker would otherwise take the API down
// with it, silently, on an unhandled rejection.
process.on('unhandledRejection', (reason) => {
  console.error('[Backend] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Backend] Uncaught exception:', err);
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

// Wide-open CORS was the default. Keep that only when no allowlist is set, so
// existing deployments don't break, but let production lock it down.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));

app.use(express.json({ limit: '64kb' }));

// --- HELPERS ---

/**
 * Express 5 turns `?date[]=x` into an array. Coerce to a string or undefined so
 * filters compare like with like instead of silently matching nothing.
 */
function queryString(value) {
  if (typeof value === 'string') return value.trim() || undefined;
  return undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayInTz() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/** Wrap an async route so a rejection reaches the error handler, not the void. */
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- API ROUTES ---

app.get('/api/health', asyncRoute(async (req, res) => {
  const status = await priceStore.getStatus();
  const scrapeQueue = getScraperQueue();

  let redis = 'disabled';
  if (scrapeQueue) {
    try {
      await scrapeQueue.client.then((c) => c.ping());
      redis = 'ok';
    } catch (err) {
      redis = `error: ${err.message}`;
    }
  }

  // Report degraded rather than a flat "ok" so an orchestrator can actually
  // tell that the data has gone stale or the queue is unreachable.
  const healthy = redis !== 'disabled' ? redis === 'ok' : true;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    redis,
    last_updated: status.last_updated,
    total_entries: status.total_entries,
    timestamp: new Date().toISOString(),
  });
}));

app.get('/api/prices', asyncRoute(async (req, res) => {
  const date = queryString(req.query.date);
  if (date && !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'Invalid `date`; expected YYYY-MM-DD.' });
  }

  const result = await priceStore.queryPrices({
    date,
    location: queryString(req.query.location),
    owned: queryString(req.query.owned) === 'true',
  });

  res.status(200).json(result);
}));

// Progress is written by the scraper next to the price data. Resolved from
// __dirname rather than process.cwd(), which previously made this endpoint
// return null whenever the server was started from anywhere but backend/.
const PROGRESS_FILE = path.join(__dirname, 'data/progress.json');

// Any progress file left behind by a killed run is stale by definition.
try {
  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
} catch (err) {
  console.warn('[Backend] Could not clear stale progress file:', err.message);
}

app.get('/api/progress', asyncRoute(async (req, res) => {
  try {
    const raw = await fsp.readFile(PROGRESS_FILE, 'utf-8');
    res.status(200).json(JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(200).json(null);
    // A half-written progress file is not worth a 500 — it's advisory data.
    console.warn('[API] Could not read progress:', err.message);
    res.status(200).json(null);
  }
}));

app.get('/api/history', asyncRoute(async (req, res) => {
  const params = {
    cinema: queryString(req.query.cinema),
    location: queryString(req.query.location),
    movie: queryString(req.query.movie),
    seat_category: queryString(req.query.seat_category),
    date: queryString(req.query.date),
    showtime: queryString(req.query.showtime),
  };

  const missing = Object.entries(params).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    return res.status(400).json({ error: `Missing or invalid query parameters: ${missing.join(', ')}` });
  }

  res.status(200).json({ history: await priceStore.queryHistory(params) });
}));

app.get('/api/movies', asyncRoute(async (req, res) => {
  const movies = await priceStore.queryMovies({
    date: queryString(req.query.date),
    location: queryString(req.query.location),
  });
  res.status(200).json({ movies });
}));

app.get('/api/locations', asyncRoute(async (req, res) => {
  res.status(200).json({ locations: await priceStore.queryLocations() });
}));

// The tracked-cinema list was hardcoded in three places (locations.config.js,
// alertChecker.js and the dashboard component) and had already started to
// drift. Serving it from the scraper config makes that file the single source
// of truth for every consumer.
let cachedConfig = null;
app.get('/api/config', (req, res) => {
  if (!cachedConfig) {
    try {
      const locations = require('../scraper/locations.config.js');
      cachedConfig = {
        forecast_days: FORECAST_DAYS,
        timezone: TIMEZONE,
        locations: locations.map((loc) => ({
          name: loc.locationName,
          cinemas: loc.cinemas.map((c) => ({ name: c.cinemaName, owned: !!c.isOwned })),
        })),
      };
    } catch (err) {
      console.error('[API] Could not load locations.config.js:', err.message);
      return res.status(500).json({ error: 'Configuration unavailable.' });
    }
  }
  res.status(200).json(cachedConfig);
});

app.get('/api/dates', (req, res) => {
  // Built in the display timezone. Using the server's local time here meant a
  // non-IST host offered a different set of days than the scraper collected.
  const dates = [];
  const today = new Date(`${todayInTz()}T00:00:00`);

  for (let i = 0; i < FORECAST_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const monthName = d.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = String(d.getDate()).padStart(2, '0');
    dates.push({
      value,
      label: i === 0 ? `Today, ${dayNum} ${monthName}`
        : i === 1 ? `Tomorrow, ${dayNum} ${monthName}`
        : `${dayName}, ${dayNum} ${monthName}`,
    });
  }

  res.status(200).json({ dates });
});

// --- SCRAPE TRIGGER ---
// Each job spawns a headless Chromium that hits 40+ cinema pages, so this is
// deliberately throttled and refuses to stack runs. Previously it was unbounded
// and unauthenticated.
const TRIGGER_COOLDOWN_MS = Number(process.env.TRIGGER_COOLDOWN_MS) || 60000;
const TRIGGER_TOKEN = process.env.TRIGGER_TOKEN || '';
let lastTriggerAt = 0;

app.post('/api/scrape/trigger', asyncRoute(async (req, res) => {
  if (TRIGGER_TOKEN && req.get('x-trigger-token') !== TRIGGER_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const queue = getScraperQueue();
  if (!queue) {
    return res.status(503).json({ error: 'Scraper queue is not available.' });
  }

  const now = Date.now();
  const sinceLast = now - lastTriggerAt;
  if (sinceLast < TRIGGER_COOLDOWN_MS) {
    return res.status(429).json({
      error: 'A scrape was triggered very recently.',
      retry_after_seconds: Math.ceil((TRIGGER_COOLDOWN_MS - sinceLast) / 1000),
    });
  }

  try {
    if (scraperModule && await scraperModule.isScrapeInFlight()) {
      return res.status(409).json({ error: 'A scrape is already running.' });
    }
  } catch (err) {
    console.warn('[API] Could not check queue state:', err.message);
  }

  lastTriggerAt = now;
  console.log('[API] Manual scrape triggered');
  await queue.add('scrape-bms', {});
  res.status(202).json({ message: 'Scrape job queued.' });
}));

// --- SCRAPER WORKER ---
// The worker owns the queue (including its retry/backoff defaults). The backend
// previously built a second Queue instance with no defaultJobOptions, so the
// configured retries never applied to anything it enqueued.
let scraperModule = null;

function getScraperQueue() {
  return scraperModule ? scraperModule.scraperQueue : null;
}

if (process.env.DISABLE_SCRAPER === 'true') {
  console.log('[Backend] DISABLE_SCRAPER=true — running as API only.');
} else {
  try {
    scraperModule = require('../scraper/queue.js');
    console.log('[API] Scraper worker initialized within the backend process.');

    const scraperCron = process.env.SCRAPER_CRON || '0 * * * *';
    scraperModule.scraperQueue
      .add('scrape-bms-hourly', {}, {
        repeat: { pattern: scraperCron },
        // A stable id keeps repeated restarts from registering duplicate
        // schedules, which would run several scrapes per hour.
        jobId: 'scrape-bms-hourly',
      })
      .then(() => console.log(`[API] Scraper scheduled with pattern: ${scraperCron}`))
      .catch((err) => console.error('[API] Failed to schedule repeatable job:', err.message));
  } catch (err) {
    console.error('[Backend] Scraper worker failed to initialize:', err.message);
  }
}

// --- STATIC FRONTEND SERVING (PRODUCTION) ---
const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  console.log('[Backend] Serving static frontend files');
  app.use(express.static(frontendDistPath, {
    setHeaders: (res, filePath) => {
      // Hashed asset filenames can be cached hard; index.html must not be.
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  console.log('[Backend] Frontend dist not found. Skipping static file serving.');
}

// Unknown API paths previously fell through to Express's default HTML 404,
// which is confusing for a JSON client.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error(`[API] ${req.method} ${req.originalUrl} failed:`, err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error.' });
});

// --- SERVER & GRACEFUL SHUTDOWN ---
const server = app.listen(PORT, () => {
  console.log(`[Backend] API Server running on http://localhost:${PORT}`);
  // Warm the cache so the first dashboard request isn't the one paying for the
  // initial parse.
  priceStore.getSnapshot().catch((err) => console.error('[Backend] Initial load failed:', err.message));
});

let shuttingDown = false;

async function gracefulShutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[Backend] Shutdown signal received. Closing HTTP server...');

  const forceExit = setTimeout(() => {
    console.error('[Backend] Could not close connections in time, forcing exit.');
    process.exit(1);
  }, 15000);
  forceExit.unref();

  server.close(async () => {
    console.log('[Backend] HTTP server closed.');
    try {
      if (scraperModule) {
        await scraperModule.worker.close();
        await scraperModule.scraperQueue.close();
      }
      console.log('[Backend] Scraper shut down cleanly.');
    } catch (err) {
      console.error('[Backend] Error during shutdown:', err.message);
    }
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;
