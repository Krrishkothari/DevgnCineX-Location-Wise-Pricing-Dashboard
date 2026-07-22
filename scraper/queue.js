require('dotenv').config();
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const { flushNow } = require('./db');
const { runScrape, CONCURRENCY } = require('./runScrape');

function envInt(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Hard ceiling on a whole run. Kept under the default hourly cron so a slow run
// is abandoned rather than overlapping the next one.
const JOB_TIMEOUT_MS = envInt('SCRAPER_JOB_TIMEOUT_MS', 45 * 60 * 1000);

const connection = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });

connection.on('error', (err) => {
  console.error('[Worker Redis] Error:', err.message);
});

const scraperQueue = new Queue('scraper-jobs', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 20,
    removeOnFail: 50,
  }
});

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const worker = new Worker('scraper-jobs', async (job) => {
  console.log(`[Worker] Starting job ${job.id} of type ${job.name} (concurrency ${CONCURRENCY})...`);

  switch (job.name) {
    case 'scrape-bms':
    case 'scrape-bms-hourly': {
      const summary = await withTimeout(runScrape(), JOB_TIMEOUT_MS, `job ${job.id}`);
      return {
        success: true,
        count: summary.totalEntries,
        durationMinutes: summary.durationMinutes,
        locationResults: summary.results.map(r => ({
          location: r.locationName,
          success: r.success,
          entries: r.entryCount,
        })),
      };
    }
    default:
      throw new Error(`Unknown job name: ${job.name}`);
  }
}, {
  connection,
  // Only ever one scrape at a time. Combined with the job timeout below this is
  // what stops an overrunning run from having the next hourly job pile on top.
  concurrency: 1,
  lockDuration: envInt('SCRAPER_LOCK_DURATION_MS', 50 * 60 * 1000),
});

worker.on('completed', (job, returnvalue) => {
  console.log(`[Worker] Successfully finished job ${job.id} with ${returnvalue?.count ?? 0} results.`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[Worker] Worker error:', err.message);
});

async function addAllJobs() {
  console.log('[Queue] Adding BMS scraper job to the queue...');
  await scraperQueue.add('scrape-bms', {});
  console.log('[Queue] BMS job successfully enqueued.');
}

/**
 * True if a scrape is already running or waiting, so the API can refuse to pile
 * another one on rather than queueing work that will never keep up.
 */
async function isScrapeInFlight() {
  const counts = await scraperQueue.getJobCounts('active', 'waiting', 'delayed');
  return (counts.active || 0) + (counts.waiting || 0) > 0;
}

async function gracefulShutdown() {
  console.log('\n[Worker] Shutdown signal received. Closing worker...');
  try {
    await worker.close();
    await flushNow();
    connection.quit();
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err.message);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { scraperQueue, addAllJobs, worker, isScrapeInFlight };

if (require.main === module) {
  addAllJobs().then(() => {
    console.log('[Queue Test] Jobs added. Worker is listening...');
  }).catch(err => {
    console.error('[Queue Test] Failed to enqueue:', err.message);
    process.exit(1);
  });
}
