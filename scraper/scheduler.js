const cron = require('node-cron');
const { addAllJobs } = require('./queue');

// 3. On startup, also call addAllJobs() immediately once
console.log(`[CRON] Initial scrape triggered at ${new Date().toISOString()}`);
addAllJobs().catch(err => console.error('[CRON] Error on initial scrape:', err));

// 2. Use node-cron to schedule addAllJobs() to run every 1 hour
const job = cron.schedule('0 * * * *', () => {
  // 4. Log a message every time the cron fires
  console.log(`[CRON] Scrape triggered at ${new Date().toISOString()}`);
  addAllJobs().catch(err => console.error('[CRON] Error on scheduled scrape:', err));
});

// 5. Export the cron job instance
module.exports = job;
