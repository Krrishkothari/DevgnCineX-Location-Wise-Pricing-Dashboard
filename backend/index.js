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

app.listen(PORT, () => {
  console.log(`[Backend] API Server running on http://localhost:${PORT}`);
});
