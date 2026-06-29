const fs = require('fs');
const path = require('path');

const { scrapeBMS } = require('./scrapers/bms');
const { scrapePVR } = require('./scrapers/pvr');
const { scrapeINOX } = require('./scrapers/inox');
const { scrapeCinepolis } = require('./scrapers/cinepolis');
const { scrapeMovieMax } = require('./scrapers/moviemax');

const DATA_DIR = path.join(__dirname, '../backend/data');
const DATA_FILE = path.join(DATA_DIR, 'prices.json');

async function runAllScrapers() {
  console.log('[Queue] Starting full scraper run...');
  const allResults = [];

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Run sequentially to prevent high RAM usage / detection from headless browsers
  const scrapers = [
    { name: 'BMS', fn: scrapeBMS },
    { name: 'PVR', fn: scrapePVR },
    { name: 'INOX', fn: scrapeINOX },
    { name: 'Cinepolis', fn: scrapeCinepolis },
    { name: 'MovieMax', fn: scrapeMovieMax }
  ];

  for (const scraper of scrapers) {
    try {
      console.log(`\n[Queue] Running ${scraper.name} scraper...`);
      const results = await scraper.fn();
      console.log(`[Queue] ${scraper.name} completed. Found ${results.length} valid entries.`);
      allResults.push(...results);
    } catch (err) {
      console.error(`[Queue] Error running ${scraper.name}:`, err.message);
    }
  }

  console.log(`\n[Queue] Full run completed. Total entries aggregated: ${allResults.length}`);
  
  // Write output
  const outputData = {
    last_updated: new Date().toISOString(),
    total_entries: allResults.length,
    data: allResults
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`[Queue] Saved aggregated data to ${DATA_FILE}`);
  
  return allResults;
}

module.exports = { runAllScrapers };

// Run if called directly
if (require.main === module) {
  runAllScrapers().then(() => {
    console.log('[Queue] Queue test execution finished.');
    process.exit(0);
  });
}
