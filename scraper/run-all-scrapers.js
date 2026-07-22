// CLI entry point: `npm run scrape:all`
// Runs one full scrape without needing Redis or BullMQ. The orchestration logic
// lives in runScrape.js so this and the queue worker can't drift apart.

require('dotenv').config();
const locations = require('./locations.config');
const { runScrape, CONCURRENCY } = require('./runScrape');

async function main() {
  const totalCinemas = locations.reduce((sum, loc) => sum + loc.cinemas.length, 0);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           BookMyShow Parallel Scraper — Starting             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Locations: ${locations.length}`);
  console.log(`  Total cinemas: ${totalCinemas}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);

  const { results, totalEntries, succeeded, durationMinutes } = await runScrape();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                       SCRAPE SUMMARY                         ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  const maxNameLen = Math.max(...results.map((r) => r.locationName.length));
  for (const r of results) {
    const icon = r.success ? '✓' : '✗';
    const name = r.locationName.padEnd(maxNameLen);
    const entries = String(r.entryCount).padStart(5);
    const status = r.success ? 'OK' : `FAILED: ${r.error || 'unknown'}`;
    console.log(`║  ${icon} ${name}  ${entries} entries  ${status}`);
  }

  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total: ${totalEntries} entries from ${succeeded}/${results.length} locations in ${durationMinutes} min`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    console.log('\n⚠ Failed locations:');
    for (const r of failed) {
      console.log(`  - ${r.locationName}: ${r.error || 'unknown error'}`);
    }
  }

  process.exit(succeeded > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[Runner] Fatal error:', err);
  process.exit(1);
});
