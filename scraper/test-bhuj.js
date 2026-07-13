const { scrapeLocation } = require('./scrapers/bms');
const locations = require('./locations.config');
async function runTests() {
  const bhujTarget = locations.find(l => l.locationName === 'Bhuj');
  const res = await scrapeLocation(bhujTarget);
  console.log(JSON.stringify(res.entries.slice(0, 2), null, 2));
  process.exit(0);
}
runTests();
