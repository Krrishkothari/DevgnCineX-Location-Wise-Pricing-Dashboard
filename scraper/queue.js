const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

// Scraper functions
const { scrapeBMS } = require('./scrapers/bms');
const { scrapePVR } = require('./scrapers/pvr');
const { scrapeINOX } = require('./scrapers/inox');
const { scrapeCinepolis } = require('./scrapers/cinepolis');
const { scrapeMovieMax } = require('./scrapers/moviemax');

// DB and Alert functions
const { savePrices } = require('./db');
const { checkAlerts } = require('./alertChecker');

// 6. Use Redis connection: { host: 'localhost', port: 6379 } (read from process.env.REDIS_URL if available)
const connection = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });

// 1. Create a BullMQ Queue named 'scraper-jobs'
const scraperQueue = new Queue('scraper-jobs', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  }
});

// 2. Create a BullMQ Worker that processes jobs from the queue
const worker = new Worker('scraper-jobs', async (job) => {
  console.log(`[Worker] Starting job ${job.id} of type ${job.name}...`);
  let results = [];

  // 3. The worker should handle these job names
  switch (job.name) {
    case 'scrape-bms':
      results = await scrapeBMS();
      break;
    case 'scrape-pvr':
      results = await scrapePVR();
      break;
    case 'scrape-inox':
      results = await scrapeINOX();
      break;
    case 'scrape-cinepolis':
      results = await scrapeCinepolis();
      break;
    case 'scrape-moviemax':
      results = await scrapeMovieMax();
      break;
    default:
      throw new Error(`Unknown job name: ${job.name}`);
  }

  // 4a. Log how many results were returned
  console.log(`[Worker] Job ${job.name} completed. Returned ${results.length} results.`);

  if (results && results.length > 0) {
    // 4b. Call savePrices(results)
    await savePrices(results);

    // 4c. Call checkAlerts(results)
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

// 8. Export a function addAllJobs() that adds all 5 cinema jobs to the queue
async function addAllJobs() {
  console.log('[Queue] Adding all scraper jobs to the queue...');

  // Base job options (attempts and backoff are inherited from defaultJobOptions)
  await scraperQueue.add('scrape-bms', {});
  await scraperQueue.add('scrape-pvr', {});
  await scraperQueue.add('scrape-inox', {});
  await scraperQueue.add('scrape-cinepolis', {});
  await scraperQueue.add('scrape-moviemax', {});

  console.log('[Queue] All 5 jobs successfully enqueued.');
}

// 7. Export the Queue instance as scraperQueue
module.exports = {
  scraperQueue,
  addAllJobs,
  worker // exporting for testing/graceful shutdown if needed
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
