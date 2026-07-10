const { scrapeLocation } = require('./scrapers/bms');
const locations = require('./locations.config');

async function runTests() {
  // Test 1: Thane (High Volume) + Fake Cinema for Alert
  const thaneTarget = JSON.parse(JSON.stringify(locations.find(l => l.locationName === 'Thane')));
  // Inject fake cinema
  thaneTarget.cinemas.push({ cinemaName: 'Devgn Cinex Fake Cinema', bmsCode: 'FAKE', bmsRegion: 'mumbai', bmsSlug: 'fake-cinema', isOwned: true });
  
  console.log(`\n\n=== Starting Test for ${thaneTarget.locationName} (High Volume + Fake Alert) ===`);
  const thaneResult = await scrapeLocation(thaneTarget);
  console.log(`\nThane result success: ${thaneResult.success}, entries: ${thaneResult.entryCount}`);

  // Test 2: Bhuj (Low Volume)
  const bhujTarget = locations.find(l => l.locationName === 'Bhuj');
  console.log(`\n\n=== Starting Test for ${bhujTarget.locationName} (Low Volume) ===`);
  const bhujResult = await scrapeLocation(bhujTarget);
  console.log(`\nBhuj result success: ${bhujResult.success}, entries: ${bhujResult.entryCount}`);
  
  process.exit(0);
}

runTests();
