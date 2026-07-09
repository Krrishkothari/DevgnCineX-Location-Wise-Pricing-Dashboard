const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../backend/data');
const DATA_FILE = path.join(DATA_DIR, 'prices.json');

// ---- Write mutex ----
// Serializes concurrent savePrices() calls so parallel location scrapers
// don't clobber each other's read-modify-write cycle on prices.json.
let _writeLock = Promise.resolve();

function withWriteLock(fn) {
  const queued = _writeLock.then(fn, fn); // run fn even if previous write errored
  _writeLock = queued.catch(() => {});     // swallow so the chain never rejects
  return queued;
}

async function savePrices(newResults) {
  if (!newResults || newResults.length === 0) return;

  return withWriteLock(async () => {
    console.log(`[DB] Saving ${newResults.length} new records to JSON...`);

    // Ensure directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    let existingData = { last_updated: null, total_entries: 0, data: [] };

    // Read existing data if file exists
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        existingData = JSON.parse(raw);
      } catch (err) {
        console.error('[DB] Failed to parse existing JSON, starting fresh.', err.message);
      }
    }

    // Deduplicate and merge data based on cinema, location, movie, format, seat category, AND showtime
    const mergedDataMap = new Map();
    
    // Load existing records into Map
    existingData.data.forEach(item => {
      const key = `${item.cinema}-${item.location}-${item.movie}-${item.format}-${item.seat_category}-${item.showtime || ''}-${item.date || ''}`;
      mergedDataMap.set(key, item);
    });

    // Overwrite with new scraped records
    newResults.forEach(item => {
      const key = `${item.cinema}-${item.location}-${item.movie}-${item.format}-${item.seat_category}-${item.showtime || ''}-${item.date || ''}`;
      mergedDataMap.set(key, item);
    });

    const finalArray = Array.from(mergedDataMap.values());

    const outputData = {
      last_updated: new Date().toISOString(),
      total_entries: finalArray.length,
      data: finalArray
    };

    // Write back to file synchronously to avoid race conditions between quick BullMQ jobs
    fs.writeFileSync(DATA_FILE, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`[DB] Successfully merged and saved. Total records: ${finalArray.length}`);
  });
}

module.exports = { savePrices };
