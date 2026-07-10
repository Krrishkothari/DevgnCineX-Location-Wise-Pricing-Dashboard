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
      // Initialize history if missing from older data
      if (!item.history) item.history = [{ price: item.price, scraped_at: item.scraped_at }];
      mergedDataMap.set(key, item);
    });

    // Overwrite with new scraped records, but append to history
    newResults.forEach(item => {
      const key = `${item.cinema}-${item.location}-${item.movie}-${item.format}-${item.seat_category}-${item.showtime || ''}-${item.date || ''}`;
      
      const existing = mergedDataMap.get(key);
      if (existing) {
        let history = existing.history || [{ price: existing.price, scraped_at: existing.scraped_at }];
        
        // Append current scrape
        history.push({ price: item.price, scraped_at: item.scraped_at });
        
        // Optional: Deduplicate history by scraped_at day to avoid bloating if scraped very frequently,
        // or just rely on a sliding 30-day window. Here we prune anything older than 30 days.
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        history = history.filter(h => new Date(h.scraped_at).getTime() > thirtyDaysAgo);
        
        item.history = history;
      } else {
        item.history = [{ price: item.price, scraped_at: item.scraped_at }];
      }
      
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
