// Standalone scheduler — ONLY for running the scraper as its own process.
//
// The backend registers its own hourly BullMQ repeatable job (see
// backend/index.js). Running this at the same time previously meant two
// independent hourly schedules enqueuing against the same queue, i.e. double
// the scrapes. Set DISABLE_SCRAPER=true on the backend before using this.

require('dotenv').config();
const cron = require('node-cron');
const { addAllJobs } = require('./queue');

const SCRAPER_CRON = process.env.SCRAPER_CRON || '0 * * * *';

if (process.env.DISABLE_SCRAPER !== 'true') {
  console.warn(
    '[CRON] WARNING: the backend schedules its own hourly scrape. Running this ' +
    'scheduler as well will enqueue two jobs per hour. Set DISABLE_SCRAPER=true ' +
    'on the backend if you want this process to own the schedule.'
  );
}

console.log(`[CRON] Initial scrape triggered at ${new Date().toISOString()}`);
addAllJobs().catch((err) => console.error('[CRON] Error on initial scrape:', err.message));

const job = cron.schedule(SCRAPER_CRON, () => {
  console.log(`[CRON] Scrape triggered at ${new Date().toISOString()}`);
  addAllJobs().catch((err) => console.error('[CRON] Error on scheduled scrape:', err.message));
});

module.exports = job;
