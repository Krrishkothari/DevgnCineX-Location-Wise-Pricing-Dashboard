const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const pLimit = require('p-limit').default;

// Scraper functions
const { scrapeLocation } = require('./scrapers/bms');
const locations = require('./locations.config');

// DB and Alert functions
const { savePrices } = require('./db');
const { checkAlerts } = require('./alertChecker');

// ---- Concurrency settings (same as run-all-scrapers.js) ----
const CONCURRENCY = 4;
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 3000;

function randomDelay(min, max) {
  const ms = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Use Redis connection: { host: 'localhost', port: 6379 } (read from process.env.REDIS_URL if available)
const connection = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });

// Create a BullMQ Queue named 'scraper-jobs'
const scraperQueue = new Queue('scraper-jobs', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  }
});

// Create a BullMQ Worker that processes jobs from the queue
const worker = new Worker('scraper-jobs', async (job) => {
  console.log(`[Worker] Starting job ${job.id} of type ${job.name}...`);

  switch (job.name) {
    case 'scrape-bms':
    case 'scrape-bms-hourly': {
      // Parallel scrape of all locations (same pattern as run-all-scrapers.js)
      const limit = pLimit(CONCURRENCY);
      const regionLocks = new Map(); // Prevent Cloudflare blocks on shared regions
      const tasks = locations.map((loc) =>
        limit(async () => {
          await randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
          try {
            return await scrapeLocation(loc, regionLocks);
          } catch (err) {
            console.error(`[Worker] Location ${loc.locationName} failed: ${err.message}`);
            return { locationName: loc.locationName, success: false, entryCount: 0, entries: [], error: err.message };
          }
        })
      );

      const results = await Promise.all(tasks);
      const allEntries = results.flatMap(r => r.entries || []);
      const succeeded = results.filter(r => r.success);

      console.log(`[Worker] Parallel scrape done: ${succeeded.length}/${results.length} locations succeeded, ${allEntries.length} total entries.`);

      if (allEntries.length > 0) {
        await savePrices(allEntries);
        await checkAlerts(allEntries);
      }

      return { success: true, count: allEntries.length, locationResults: results.map(r => ({ location: r.locationName, success: r.success, entries: r.entryCount })) };
    }
    default:
      throw new Error(`Unknown job name: ${job.name}`);
  }
}, { 
  connection,
  lockDuration: 5400000 // 90 minutes (parallel scrape of all 17 locations)
});

worker.on('completed', (job, returnvalue) => {
  console.log(`[Worker] Successfully finished job ${job.id} with ${returnvalue.count} results.`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job.id} failed:`, err.message);
});

// Export a function addAllJobs() that adds BMS job to the queue
async function addAllJobs() {
  console.log('[Queue] Adding BMS scraper job to the queue...');
  await scraperQueue.add('scrape-bms', {});
  console.log('[Queue] BMS job successfully enqueued.');
}

module.exports = {
  scraperQueue,
  addAllJobs,
  worker
};

// If run directly, just test adding jobs
if (require.main === module) {
  addAllJobs().then(() => {
    console.log('[Queue Test] Jobs added. Worker is listening...');
  }).catch(err => {
    console.error('[Queue Test] Error:', err);
    process.exit(1);
  });
}
