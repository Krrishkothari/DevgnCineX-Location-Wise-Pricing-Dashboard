require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const app = express();
const PORT = process.env.PORT || 3000;

// Security and performance middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for simplicity unless strictly needed
}));
app.use(compression());
app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data/prices.json');

// --- API ROUTES ---

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/prices', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.status(200).json({ last_updated: null, total_entries: 0, data: [] });
    }
    
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsedData = JSON.parse(rawData);
    if (!parsedData.data) parsedData.data = [];

    // Optional date filtering
    const dateFilter = req.query.date;
    if (dateFilter) {
      parsedData.data = parsedData.data.filter((entry) => entry.date === dateFilter);
    }
    
    // Optional owned filtering
    if (req.query.owned === 'true') {
      parsedData.data = parsedData.data.filter((entry) => {
        const cinema = entry.cinema.toLowerCase();
        return cinema.includes('devgn') || cinema.includes('owned');
      });
    }

    // Strip history array from main dashboard response to save bandwidth
    parsedData.data = parsedData.data.map(({ history, ...rest }) => rest);

    // Optional location filtering
    const locationFilter = req.query.location;
    if (locationFilter) {
      parsedData.data = parsedData.data.filter((entry) => entry.location === locationFilter);
    }

    parsedData.total_entries = parsedData.data.length;

    res.status(200).json(parsedData);
  } catch (error) {
    console.error('[API] Error reading prices data:', error);
    res.status(500).json({ error: 'Failed to load pricing data.' });
  }
});

const PROGRESS_FILE = path.join(process.cwd(), 'data/progress.json');

// Returns current scraper progress
app.get('/api/progress', (req, res) => {
  try {
    if (!fs.existsSync(PROGRESS_FILE)) {
      return res.status(200).json(null);
    }
    const rawData = fs.readFileSync(PROGRESS_FILE, 'utf-8');
    const parsedData = JSON.parse(rawData);
    res.status(200).json(parsedData);
  } catch (error) {
    console.error('[API] Error reading progress data:', error);
    res.status(500).json({ error: 'Failed to load progress data.' });
  }
});

// Returns price history for a specific movie + cinema + category + date + showtime
app.get('/api/history', (req, res) => {
  try {
    const { cinema, location, movie, seat_category, date, showtime } = req.query;
    if (!cinema || !location || !movie || !seat_category || !date || !showtime) {
      return res.status(400).json({ error: 'Missing required query parameters.' });
    }

    if (!fs.existsSync(DATA_FILE)) {
      return res.status(200).json({ history: [] });
    }

    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsedData = JSON.parse(rawData);
    if (!parsedData.data) parsedData.data = [];

    const match = parsedData.data.find(entry => 
      entry.cinema === cinema &&
      entry.location === location &&
      entry.movie === movie &&
      entry.seat_category === seat_category &&
      entry.date === date &&
      entry.showtime === showtime
    );

    if (match && match.history) {
      res.status(200).json({ history: match.history });
    } else {
      res.status(200).json({ history: match ? [{ price: match.price, scraped_at: match.scraped_at }] : [] });
    }
  } catch (error) {
    console.error('[API] Error reading history:', error);
    res.status(500).json({ error: 'Failed to load history data.' });
  }
});

// Returns unique movie names from the scraped data
app.get('/api/movies', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.status(200).json({ movies: [] });
    }

    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsedData = JSON.parse(rawData);
    if (!parsedData.data) parsedData.data = [];
    
    let entries = parsedData.data;
    if (req.query.date) {
      entries = entries.filter(entry => entry.date === req.query.date);
    }
    if (req.query.location) {
      entries = entries.filter(entry => entry.location === req.query.location);
    }
    
    const movies = [...new Set(entries.map((entry) => entry.movie))].filter(Boolean).sort();
    res.status(200).json({ movies });
  } catch (error) {
    console.error('[API] Error reading movies:', error);
    res.status(500).json({ error: 'Failed to load movies.' });
  }
});

// Returns the next 7 days as selectable dates
app.get('/api/dates', (req, res) => {
  try {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const monthName = d.toLocaleDateString('en-US', { month: 'short' });
      dates.push({
        value: `${yyyy}-${mm}-${dd}`,
        label: i === 0 ? `Today, ${dd} ${monthName}` : i === 1 ? `Tomorrow, ${dd} ${monthName}` : `${dayName}, ${dd} ${monthName}`,
      });
    }
    res.status(200).json({ dates });
  } catch (error) {
    console.error('[API] Error generating dates:', error);
    res.status(500).json({ error: 'Failed to generate dates.' });
  }
});

app.post('/api/scrape/trigger', async (req, res) => {
  try {
    console.log('[API] Manual scrape triggered');
    await scraperQueue.add('scrape-bms', {});
    res.status(200).json({ message: 'Scrape job successfully added to queue.' });
  } catch (error) {
    console.error('[API] Error triggering scrape:', error);
    res.status(500).json({ error: 'Failed to trigger scrape.' });
  }
});


// --- REDIS / BULLMQ SETUP ---
const connection = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });

connection.on('error', (err) => {
  console.error('[Redis] Error:', err.message);
});

const scraperQueue = new Queue('scraper-jobs', { connection });

// Schedule the repeatable job to run every 1 hour automatically
const scraperCron = process.env.SCRAPER_CRON || '0 * * * *';
scraperQueue.add(
  'scrape-bms-hourly',
  {},
  { repeat: { pattern: scraperCron } }
).then(() => {
  console.log(`[API] Scraper job scheduled successfully with pattern: ${scraperCron}`);
}).catch(err => {
  console.error('[API] Failed to schedule repeatable job:', err);
});

// Initialize the scraper worker directly within the backend process
require('../scraper/queue.js');
console.log('[API] Scraper worker initialized within the backend process.');


// --- STATIC FRONTEND SERVING (PRODUCTION) ---
const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  console.log('[Backend] Serving static frontend files');
  app.use(express.static(frontendDistPath));
  
  // SPA fallback
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  console.log('[Backend] Frontend dist not found. Skipping static file serving.');
}

// --- SERVER & GRACEFUL SHUTDOWN ---
const server = app.listen(PORT, () => {
  console.log(`[Backend] API Server running on http://localhost:${PORT}`);
});

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  console.log('\n[Backend] Shutdown signal received. Closing HTTP server...');
  server.close(async () => {
    console.log('[Backend] HTTP server closed.');
    try {
      await scraperQueue.close();
      connection.quit();
      console.log('[Backend] Redis connections closed.');
    } catch (err) {
      console.error('[Backend] Error during shutdown:', err.message);
    }
    process.exit(0);
  });
  
  // Force exit if taking too long
  setTimeout(() => {
    console.error('[Backend] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}
