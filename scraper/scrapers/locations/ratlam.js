const locations = require('../../locations.config');
const { scrapeLocation } = require('../core/scrapeLocation');
const { savePrices } = require('../../db');

async function run(sharedRegionLocks = null) {
  const config = locations.find(l => l.locationName === 'Ratlam');
  if (!config) {
    console.error('[Runner] Config not found for Ratlam');
    return { success: false, entryCount: 0, entries: [], error: 'Config not found' };
  }
  
  const result = await scrapeLocation(config, sharedRegionLocks);
  
  // Call savePrices when run directly for solo debugging
  if (require.main === module && result.success && result.entries.length > 0) {
    try {
      await savePrices(result.entries);
      console.log(`[BMS:${config.locationName}] Solo run finished and saved ${result.entries.length} entries.`);
    } catch (err) {
      console.error(`[BMS:${config.locationName}] Solo run failed to save prices:`, err);
    }
  }
  
  return result;
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = run;
