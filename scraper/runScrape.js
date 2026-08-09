// Shared scrape orchestration.
//
// This used to exist twice — once inline in the BullMQ worker and once in
// run-all-scrapers.js — with the two copies already drifting apart. Both now
// call this, so a fix lands in one place. Deliberately free of any Redis or
// BullMQ dependency so the CLI runner doesn't need a broker.

const pLimit = require('p-limit').default;
const locations = require('./locations.config');
const { flushNow, clearProgress } = require('./db');
const { checkAlerts } = require('./alertChecker');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

function envInt(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Honours SCRAPER_CONCURRENCY from .env, which the previous
// hardcoded `10` silently ignored.
const CONCURRENCY = envInt('SCRAPER_CONCURRENCY', 1);
const MIN_DELAY_MS = envInt('SCRAPER_MIN_DELAY_MS', 3000);
const MAX_DELAY_MS = envInt('SCRAPER_MAX_DELAY_MS', 6000);
// Locations that come back empty are retried once, serially. Running in
// parallel occasionally trips BookMyShow's bot protection and a location
// returns nothing; a full run now takes minutes rather than the best part of an
// hour, so there is ample budget to pick those up.
const RETRY_EMPTY = process.env.SCRAPER_RETRY_EMPTY !== 'false';

function randomDelay(min, max) {
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scrape every configured location once.
 * Always closes the browser and flushes pending writes, including on failure.
 */
async function runScrape({ log = console.log } = {}) {
  const startedAt = Date.now();
  log(`[Scrape] Launching shared browser (concurrency ${CONCURRENCY}, ${locations.length} locations)...`);

  const sharedBrowser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  let results = [];
  try {
    const regionLocks = new Map();

    const runOne = async (loc) => {
      try {
        const locationScraper = require(`./scrapers/locations/${loc.locationName.toLowerCase()}.js`);
        return await locationScraper(regionLocks, sharedBrowser);
      } catch (err) {
        console.error(`[Scrape] Location ${loc.locationName} failed: ${err.message}`);
        return { locationName: loc.locationName, success: false, entryCount: 0, entries: [], error: err.message };
      }
    };

    const runPass = async (batch, concurrency) => {
      const limit = pLimit(concurrency);
      const settled = await Promise.allSettled(
        batch.map((loc) =>
          limit(async () => {
            await randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
            return runOne(loc);
          })
        )
      );
      return settled.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : {
              locationName: batch[i]?.locationName || 'Unknown',
              success: false,
              entryCount: 0,
              entries: [],
              error: r.reason?.message || String(r.reason),
            }
      );
    };

    results = await runPass(locations, CONCURRENCY);

    if (RETRY_EMPTY) {
      const failedNames = new Set(results.filter((r) => !r.success).map((r) => r.locationName));
      const retryTargets = locations.filter((l) => failedNames.has(l.locationName));

      if (retryTargets.length > 0) {
        log(`[Scrape] Retrying ${retryTargets.length} empty/failed location(s) serially: ${[...failedNames].join(', ')}`);
        // Serially, so the retry isn't defeated by the same contention that
        // caused the original failure.
        const retried = await runPass(retryTargets, 1);
        const byName = new Map(retried.map((r) => [r.locationName, r]));
        results = results.map((r) => {
          const second = byName.get(r.locationName);
          if (!second) return r;
          if (second.entryCount > r.entryCount) {
            log(`[Scrape] Retry recovered ${r.locationName}: ${second.entryCount} entries.`);
            return second;
          }
          return r;
        });
      }
    }
  } finally {
    log('[Scrape] Closing shared browser...');
    await sharedBrowser.close().catch((err) => console.error('[Scrape] Browser close failed:', err.message));
    // Writes are batched, so a run must force a final flush before reporting
    // completion or the last few minutes of data would sit only in memory.
    await flushNow().catch((err) => console.error('[Scrape] Final flush failed:', err.message));
    clearProgress();
  }

  const allEntries = results.flatMap((r) => r.entries || []);
  const succeeded = results.filter((r) => r.success);
  const durationMinutes = Number(((Date.now() - startedAt) / 60000).toFixed(1));

  log(`[Scrape] Done in ${durationMinutes} min: ${succeeded.length}/${results.length} locations, ${allEntries.length} entries.`);
  for (const r of results.filter((r) => !r.success)) {
    console.error(`[Scrape]   ✗ ${r.locationName}: ${r.error || 'unknown error'}`);
  }

  if (allEntries.length > 0) {
    try {
      await checkAlerts(allEntries);
    } catch (err) {
      console.error('[Scrape] Alert check failed:', err.message);
    }
  }

  return { results, totalEntries: allEntries.length, succeeded: succeeded.length, durationMinutes };
}

module.exports = { runScrape, CONCURRENCY };
