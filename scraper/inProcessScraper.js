/**
 * In-process scraper scheduler — replaces BullMQ + Redis.
 *
 * Uses node-cron to trigger scrapes on a configurable pattern and tracks
 * whether a run is already in progress so the API can refuse to pile on.
 * No external broker required.
 */

require('dotenv').config();
const cron = require('node-cron');
const { runScrape } = require('./runScrape');
const { flushNow } = require('./db');

const SCRAPER_CRON = process.env.SCRAPER_CRON || '0 * * * *';

let running = false;
let lastRunAt = 0;
let cronTask = null;

/**
 * Execute a single scrape run, guarding against concurrent execution.
 * Returns the summary object from runScrape, or null if skipped.
 */
async function doScrape(source = 'cron') {
  if (running) {
    console.log(`[InProcessScraper] Skipping ${source} trigger — a scrape is already running.`);
    return null;
  }

  running = true;
  console.log(`[InProcessScraper] Starting scrape (source: ${source})...`);
  const startedAt = Date.now();

  try {
    const summary = await runScrape();
    lastRunAt = Date.now();
    console.log(
      `[InProcessScraper] Scrape complete: ${summary.totalEntries} entries in ${summary.durationMinutes} min.`
    );
    return summary;
  } catch (err) {
    console.error(`[InProcessScraper] Scrape failed after ${((Date.now() - startedAt) / 1000).toFixed(1)}s:`, err.message);
    return null;
  } finally {
    running = false;
  }
}

/**
 * Start the scraper module (manual mode only — no auto-cron schedule).
 */
function start() {
  console.log('[InProcessScraper] Initialized in MANUAL mode (auto-cron disabled).');
}

/**
 * Trigger a manual scrape (from the API). Runs in the background — the
 * returned promise resolves once the scrape finishes or is skipped.
 */
async function triggerScrape() {
  if (running) {
    return { triggered: false, reason: 'A scrape is already running.' };
  }

  // Fire-and-forget so the HTTP response isn't held open for 10+ minutes.
  doScrape('manual').catch((err) =>
    console.error('[InProcessScraper] Manual scrape error:', err.message)
  );

  return { triggered: true };
}

/** Whether a scrape is currently in progress. */
function isScrapeRunning() {
  return running;
}

/** Timestamp of the last completed scrape (epoch ms), or 0. */
function getLastRunAt() {
  return lastRunAt;
}

/** Stop the cron schedule and flush pending writes. */
async function stop() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log('[InProcessScraper] Cron stopped.');
  }
  await flushNow().catch((err) =>
    console.error('[InProcessScraper] Final flush failed:', err.message)
  );
}

module.exports = {
  start,
  stop,
  triggerScrape,
  isScrapeRunning,
  getLastRunAt,
  doScrape,
};
