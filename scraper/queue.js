const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

// Scraper functions
const { scrapeBMS } = require('./scrapers/bms');

// DB and Alert functions
const { savePrices } = require('./db');
const { checkAlerts } = require('./alertChecker');

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
  let results = [];

  switch (job.name) {
    case 'scrape-bms':
      results = await scrapeBMS();
      break;
    default:
      throw new Error(`Unknown job name: ${job.name}`);
  }

  console.log(`[Worker] Job ${job.name} completed. Returned ${results.length} results.`);

  if (results && results.length > 0) {
    await savePrices(results);
    await checkAlerts(results);
  }

  return { success: true, count: results.length };
}, { connection });

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
