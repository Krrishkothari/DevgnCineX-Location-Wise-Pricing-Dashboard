// run-all-scrapers.js — Single entry-point for parallel, concurrency-limited scraping.
// Usage: node run-all-scrapers.js   or   npm run scrape:all
//
// Scrapes all 17 locations (42 cinemas total) in parallel, capped at CONCURRENCY
// simultaneous locations. Each location is fully error-isolated — a failure in one
// does not crash or delay the others.

const pLimit = require('p-limit').default;
const locations = require('./locations.config');
const { scrapeLocation } = require('./scrapers/bms');
const { checkAlerts } = require('./alertChecker');

// ---- Configuration ----
const CONCURRENCY = 4;        // Max simultaneous locations (recommended for BMS rate limits)
const MIN_DELAY_MS = 1000;    // Minimum random delay before a location starts (ms)
const MAX_DELAY_MS = 3000;    // Maximum random delay before a location starts (ms)

/**
 * Sleep for a random duration between min and max milliseconds.
 */
function randomDelay(min, max) {
  const ms = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const startTime = Date.now();
  const totalCinemas = locations.reduce((sum, loc) => sum + loc.cinemas.length, 0);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           BookMyShow Parallel Scraper — Starting            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Locations: ${locations.length}`);
  console.log(`  Total cinemas: ${totalCinemas}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Delay range: ${MIN_DELAY_MS}ms–${MAX_DELAY_MS}ms`);
  console.log('');

  const limit = pLimit(CONCURRENCY);

  // Shared region lock: prevents two locations from hitting the same BMS region
  // explore page simultaneously (which triggers Cloudflare blocks).
  const regionLocks = new Map();

  const tasks = locations.map((loc) =>
    limit(async () => {
      // Random delay to stagger requests within the concurrency pool
      await randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);

      try {
        const result = await scrapeLocation(loc, regionLocks);
        return result;
      } catch (err) {
        // This catch should rarely fire since scrapeLocation has its own try/catch,
        // but it's here for complete safety.
        console.error(`[Runner] UNEXPECTED error for ${loc.locationName}: ${err.message}`);
        return {
          locationName: loc.locationName,
          success: false,
          entryCount: 0,
          entries: [],
          error: err.message,
        };
      }
    })
  );

  // Wait for ALL locations to finish (or fail). Promise.all is safe here because
  // every task resolves (errors are caught and returned as result objects).
  const results = await Promise.all(tasks);

  // ---- Summary ----
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalEntries = results.reduce((sum, r) => sum + r.entryCount, 0);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    SCRAPE SUMMARY                           ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  // Pad location names for alignment
  const maxNameLen = Math.max(...results.map(r => r.locationName.length));
  for (const r of results) {
    const icon = r.success ? '✓' : '✗';
    const name = r.locationName.padEnd(maxNameLen);
    const entries = String(r.entryCount).padStart(5);
    const status = r.success ? 'OK' : `FAILED: ${r.error || 'unknown'}`;
    console.log(`║  ${icon} ${name}  ${entries} entries  ${status}`);
  }

  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total: ${totalEntries} entries from ${succeeded.length}/${results.length} locations in ${elapsed}s`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (failed.length > 0) {
    console.log('\n⚠ Failed locations:');
    for (const r of failed) {
      console.log(`  - ${r.locationName}: ${r.error || 'unknown error'}`);
    }
  }

  // ---- Aggregate alerts check ----
  const allEntries = results.flatMap(r => r.entries || []);
  if (allEntries.length > 0) {
    try {
      await checkAlerts(allEntries);
    } catch (err) {
      console.error('[Runner] Alert check failed:', err.message);
    }
  }

  // Exit code: 0 if at least one location succeeded, 1 if all failed
  const exitCode = succeeded.length > 0 ? 0 : 1;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[Runner] Fatal error:', err);
  process.exit(1);
});
