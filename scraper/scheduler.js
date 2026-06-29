const cron = require('node-cron');
const { runAllScrapers } = require('./queue');

console.log('[Scheduler] Initializing OP-INTEL Scraper Scheduler...');

// Run every 6 hours (0 */6 * * *)
// For testing purposes, you can change this to '* * * * *' (every minute)
cron.schedule('0 */6 * * *', async () => {
  console.log(`\n[Scheduler] Triggering scheduled run at ${new Date().toISOString()}`);
  try {
    await runAllScrapers();
    console.log(`[Scheduler] Scheduled run completed successfully.`);
  } catch (err) {
    console.error(`[Scheduler] Scheduled run failed:`, err.message);
  }
});

console.log('[Scheduler] Cron jobs registered. Waiting for next trigger.');

// To run an initial ingestion on startup:
// runAllScrapers();
