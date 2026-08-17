# DevgnCineX — Location-Wise Pricing Dashboard

A real-time competitive pricing intelligence dashboard for **Devgn Cinex** cinemas across India. The system automatically scrapes ticket prices from [BookMyShow](https://in.bookmyshow.com) every hour, compares Devgn Cinex pricing against local competitors (PVR, INOX, Cinepolis, Wave, etc.), and presents everything in a filterable, exportable dashboard.

---

## Features

- **Automated Hourly Scraping** — Headless Chromium (Playwright) scrapes live ticket prices from BookMyShow every hour via an in-process cron scheduler.
- **17 Locations, 42 Cinemas** — Tracks all Devgn Cinex screens and their local competitors across India.
- **4-Day Forecast** — Scrapes prices for today + 3 future dates so pricing teams can see advance-booking trends.
- **Competitive Comparison** — Side-by-side view of Devgn Cinex vs competitor pricing per showtime and seat category.
- **Smart Filters** — Filter by location, movie, date, format (2D/3D/IMAX), language, and time slot.
- **Excel Export** — One-click export of filtered data to `.xlsx` for offline analysis.
- **Price History Tracking** — Tracks price changes over time with historical data retention (30 days default).
- **Live Scrape Progress** — Real-time progress indicator in the dashboard when a scrape is running.
- **Manual Scrape Trigger** — API endpoint to trigger an on-demand scrape outside the hourly schedule.

---

## Tracked Locations & Cinemas

| # | Location | Devgn Cinex Screen | Competitors |
|---|---|---|---|
| 1 | **Gurugram** | Devgn Cinex Elan Epic | INOX World Mark, INOX AIPL, Cinepolis Airia Mall, Wave Urbana Premium, PVR Elan Town Centre |
| 2 | **Gandhinagar** | Devgn Cinex Swagat Mall | INOX Adalaj |
| 3 | **Ahmedabad** | Devgn Cinex Chandkheda | PVR Motera, Rajhans CBD |
| 4 | **Thane** | Devgn Cinex The Walk | Cinepolis Viviana, INOX R Mall |
| 5 | **Ghaziabad** | Devgn Cinex Ghaziabad | PVR VVIP |
| 6 | **Kanpur** | Devgn Cinex Heer Palace | INOX Z Square, PVR Deep, PVR South X, Rave 3 |
| 7 | **Bahadurgarh** | Devgn Cinex Bahadurgarh | Movietime Cinemas, KRB Cineplex |
| 8 | **Anand** | Devgn Cinex Galleria Mall | PVR Maruti Solaris, INOX City Pulse Mall |
| 9 | **Bhuj** | Devgn Cinex Seven Sky | — |
| 10 | **Guwahati** | Devgn Cinex Roodraksh Mall | PVR Citi Centre, Cinepolis Central Mall |
| 11 | **Surendranagar** | Devgn Cinex Surendranagar | — |
| 12 | **Mulund** | Devgn Cinex Mulund | Miraj Cinemas |
| 13 | **Meerut** | Devgn Cinex Meerut | INOX PVS Mall, Wave |
| 14 | **Ratlam** | Devgn Cinex Anand Big Mall | Gayatri Cinemas |
| 15 | **Hapur** | Devgn Cinex Hapur | — |
| 16 | **Ghazipur** | Devgn Cinex Ghazipur | — |
| 17 | **Raebareli** | Devgn Cinex Raebareli | — |

> Locations with no competitors (Bhuj, Surendranagar, Hapur, Ghazipur, Raebareli) track only the Devgn Cinex screen for internal pricing analysis.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React, Vite, Tailwind CSS, Recharts, SheetJS (xlsx export) |
| **Backend** | Node.js, Express 5 |
| **Scraper** | Playwright (headless Chromium), playwright-extra + stealth plugin |
| **Scheduling** | node-cron (in-process hourly cron) |
| **Storage** | JSON file-based (prices.json with buffered writes) |
| **Deployment** | Docker (Playwright base image) |

---

## Project Structure

```
├── backend/
│   ├── index.js              # Express API server + static frontend serving
│   ├── lib/priceStore.js     # JSON-based price data store with history tracking
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/DashboardScreen.jsx   # Main dashboard view
│   │   ├── components/                 # UI components (CinemaCard, FilterBar, etc.)
│   │   ├── api/                        # API hooks and client
│   │   └── lib/                        # Utilities (export, pricing, formatting)
│   ├── vite.config.js
│   └── package.json
├── scraper/
│   ├── scrapers/core/scrapeLocation.js # Core BMS scraping logic
│   ├── scrapers/locations/             # Per-location scraper wrappers (17 files)
│   ├── runScrape.js                    # Orchestrator with concurrency control
│   ├── inProcessScraper.js             # In-process cron scheduler
│   ├── run-all-scrapers.js             # CLI entry point for manual scrapes
│   ├── locations.config.js             # All 17 locations & 42 cinemas config
│   ├── normalize.js                    # Price data normalization & validation
│   ├── db.js                           # Buffered file I/O for prices.json
│   ├── alertChecker.js                 # Post-scrape alert checks
│   └── package.json
├── Dockerfile                          # Production Docker image (Playwright base)
├── railway.json                        # Railway deployment config
├── package.json                        # Root orchestration scripts
└── .env.example                        # Environment variable reference
```

---

## Getting Started

### Prerequisites

- **Node.js** 20.x or later
- **npm** (comes with Node.js)

### 1. Clone the Repository

```bash
git clone https://github.com/Krrishkothari/DevgnCineX-Location-Wise-Pricing-Dashboard.git
cd DevgnCineX-Location-Wise-Pricing-Dashboard
```

### 2. Install Dependencies

```bash
# Install root, backend, and scraper dependencies
npm install

# Install frontend dependencies
npm --prefix frontend ci --include=dev

# Install Playwright Chromium browser
cd scraper && PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium && cd ..
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env if you need to change any defaults (port, concurrency, etc.)
```

### 4. Build the Frontend

```bash
npm run build
```

### 5. Start the Server

```bash
npm start
```

The dashboard will be available at **http://localhost:3000**.

The in-process scraper will automatically:
- Run an initial scrape 10 seconds after startup
- Schedule hourly scrapes via cron (`0 * * * *`)

---

## Development Mode

For active development with hot-reloading:

**Terminal 1 — Backend:**
```bash
node backend/index.js
```

**Terminal 2 — Frontend (Vite Dev Server):**
```bash
npm --prefix frontend run dev
```

The Vite dev server runs on `http://localhost:5173` and proxies `/api` requests to the backend on port 3000.

---

## Manual Scrape (CLI)

Run a one-time scrape from the command line without starting the server:

```bash
npm run scrape:all
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Server health check and scraper status |
| `GET` | `/api/prices?date=YYYY-MM-DD&location=X` | Query price data with optional filters |
| `GET` | `/api/movies?date=YYYY-MM-DD&location=X` | List movies with active showtimes |
| `GET` | `/api/locations` | List all tracked locations |
| `GET` | `/api/dates` | Available dates for the forecast window |
| `GET` | `/api/config` | Full location/cinema configuration |
| `GET` | `/api/progress` | Live scraper progress (when running) |
| `GET` | `/api/history?cinema=X&movie=X&...` | Price change history for a specific showtime |
| `POST` | `/api/scrape/trigger` | Manually trigger a scrape (requires `x-trigger-token` header if configured) |

---

## Docker Deployment

```bash
# Build the Docker image
docker build -t devgn-cinex-pricing .

# Run the container
docker run -p 3000:3000 devgn-cinex-pricing
```

The Docker image uses the official Playwright base image (`mcr.microsoft.com/playwright:v1.61.1-noble`) which includes all Chromium system dependencies.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `production` | Runtime environment |
| `DATA_DIR` | `./backend/data` | Directory for prices.json storage |
| `SCRAPER_CRON` | `0 * * * *` | Cron schedule for automatic scrapes |
| `SCRAPER_CONCURRENCY` | `3` | Number of locations scraped in parallel |
| `FORECAST_DAYS` | `4` | Number of days ahead to scrape |
| `PRICE_RETENTION_DAYS` | `30` | Days of historical data to retain |
| `TRIGGER_TOKEN` | *(empty)* | Optional auth token for manual scrape API |
| `TRIGGER_COOLDOWN_MS` | `60000` | Minimum gap between manual triggers |
| `DISABLE_SCRAPER` | `false` | Set `true` to run API-only without scraper |
| `TZ_DISPLAY` | `Asia/Kolkata` | Timezone for date display |

See `.env.example` for the complete list with descriptions.

---

## License

Private — Internal use only.
