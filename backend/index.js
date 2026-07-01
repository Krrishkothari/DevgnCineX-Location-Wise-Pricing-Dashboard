const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data/prices.json');

app.get('/api/prices', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.status(200).json({ last_updated: null, total_entries: 0, data: [] });
    }
    
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsedData = JSON.parse(rawData);
    res.status(200).json(parsedData);
  } catch (error) {
    console.error('[API] Error reading prices data:', error);
    res.status(500).json({ error: 'Failed to load pricing data.' });
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
    const movies = [...new Set(parsedData.data.map((entry) => entry.movie))].filter(Boolean).sort();
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

const { Queue } = require('bullmq');
const Redis = require('ioredis');

// Connect to Redis and BullMQ Queue
const connection = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });

const scraperQueue = new Queue('scraper-jobs', { connection });

app.post('/api/scrape/trigger', async (req, res) => {
  try {
    console.log('[API] Manual scrape triggered');
    await scraperQueue.add('scrape-bms', {});
    await scraperQueue.add('scrape-pvr', {});
    await scraperQueue.add('scrape-inox', {});
    await scraperQueue.add('scrape-cinepolis', {});
    await scraperQueue.add('scrape-moviemax', {});
    res.status(200).json({ message: 'Scrape jobs successfully added to queue.' });
  } catch (error) {
    console.error('[API] Error triggering scrape:', error);
    res.status(500).json({ error: 'Failed to trigger scrape.' });
  }
});

app.listen(PORT, () => {
  console.log(`[Backend] API Server running on http://localhost:${PORT}`);
});
