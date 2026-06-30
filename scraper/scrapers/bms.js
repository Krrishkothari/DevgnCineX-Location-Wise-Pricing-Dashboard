// BookMyShow scraper — API-based approach
// Intercepts the internal BMS showtimes API to extract real pricing data
// instead of trying to scrape the DOM (which returns garbage).

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { normalizePrice, validateSchema } = require('../normalize');

chromium.use(StealthPlugin());

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Extract location from venue name like "Cinepolis: Nexus Seawoods, Nerul, Navi Mumbai"
 */
function extractLocation(venueName) {
  if (!venueName) return 'Mumbai';
  const parts = venueName.split(',');
  // Last part is usually the city/area
  if (parts.length >= 2) {
    return parts[parts.length - 1].trim();
  }
  return 'Mumbai';
}

/**
 * Extract clean cinema name from venue name
 * e.g. "Cinepolis: Nexus Seawoods, Nerul, Navi Mumbai" -> "Cinepolis: Nexus Seawoods"
 */
function extractCinemaName(venueName) {
  if (!venueName) return 'Unknown';
  const parts = venueName.split(',');
  return parts[0].trim();
}

/**
 * Main BMS scraper function.
 * Uses the internal BMS showtimes API to get real pricing data.
 */
async function scrapeBMS() {
  let browser = null;

  try {
    console.log('[BMS] Launching browser...');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext({
      userAgent: getRandomUA(),
      viewport: { width: 1366, height: 768 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    });

    const page = await context.newPage();

    // ---- Step 1: Capture the showtimes API response ----
    let dynamicData = null;
    let staticData = null;

    page.on('response', async (response) => {
      const url = response.url();
      try {
        if (url.includes('showtimes-by-event/primary-dynamic')) {
          dynamicData = await response.json();
        } else if (url.includes('showtimes-by-event/primary-static')) {
          staticData = await response.json();
        }
      } catch (e) {}
    });

    // ---- Step 2: Navigate to BMS and trigger the API ----
    console.log('[BMS] Navigating to movies listing...');
    await page.goto('https://in.bookmyshow.com/explore/movies-mumbai', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Get first few movie links
    const movieLinks = await page.evaluate(() => {
      const cards = document.querySelectorAll('a[href*="/movies/"]');
      const results = [];
      const seen = new Set();
      for (const card of cards) {
        const href = card.getAttribute('href');
        if (!href || href.includes('/explore/') || href.includes('/genre/')) continue;
        if (seen.has(href)) continue;
        seen.add(href);
        const img = card.querySelector('img');
        const title = img?.alt?.trim() || '';
        if (title && title.length < 80) {
          results.push({ title, href });
        }
      }
      return results;
    });

    console.log(`[BMS] Found ${movieLinks.length} movie links.`);
    const moviesToScrape = movieLinks.slice(0, 3);

    const allResults = [];

    for (const movie of moviesToScrape) {
      dynamicData = null;
      staticData = null;

      const url = movie.href.startsWith('http') ? movie.href : `https://in.bookmyshow.com${movie.href}`;
      console.log(`[BMS] Visiting movie: ${movie.title}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Click "Book tickets" to trigger the showtimes API
      const bookBtn = await page.$('button:has-text("Book tickets"), a:has-text("Book tickets")');
      if (bookBtn) {
        console.log(`[BMS] Clicking "Book tickets" for ${movie.title}...`);
        await bookBtn.click();
        await page.waitForTimeout(5000);
      } else {
        console.log(`[BMS] No "Book tickets" button for ${movie.title}, skipping.`);
        continue;
      }

      // ---- Step 3: Parse the captured API data ----
      if (!dynamicData?.data?.showtimeWidgets) {
        console.log(`[BMS] No showtime API data captured for ${movie.title}.`);
        continue;
      }

      // Extract the real format (2D, 3D, IMAX, 4DX etc.) and language from the static API
      let eventFormat = '2D';
      let eventLanguage = '';
      if (staticData?.data?.eventData?.childEvents?.length > 0) {
        eventFormat = staticData.data.eventData.childEvents[0].eventDimension || '2D';
        eventLanguage = staticData.data.eventData.childEvents[0].eventLanguage || '';
      }
      console.log(`[BMS] Movie format for ${movie.title}: ${eventFormat}, Language: ${eventLanguage}`);

      const groupList = dynamicData.data.showtimeWidgets.find(w => w.type === 'groupList');
      if (!groupList?.data?.[0]?.data) {
        console.log(`[BMS] No venue groups found for ${movie.title}.`);
        continue;
      }

      const venues = groupList.data[0].data;
      console.log(`[BMS] Found ${venues.length} venues for ${movie.title} via API.`);

      // Extract pricing for each venue
      for (const venue of venues) {
        const venueName = venue.additionalData?.venueName || '';
        const cinemaName = extractCinemaName(venueName);
        const location = extractLocation(venueName);
        const showtimes = venue.showtimes || [];

        if (showtimes.length === 0) continue;

        // Use the first showtime's categories for pricing
        const firstShowtime = showtimes[0];
        const categories = firstShowtime.additionalData?.categories || [];
        const showTime = firstShowtime.additionalData?.showTime || firstShowtime.title || '';

        for (const cat of categories) {
          const price = parseFloat(cat.curPrice) || 0;
          const seatCategory = cat.priceDesc || 'Standard';

          if (price > 0) {
            try {
              const raw = {
                cinema: cinemaName,
                location: location,
                movie: movie.title,
                format: eventFormat,
                language: eventLanguage,
                price: price,
                seat_category: seatCategory,
                showtime: showTime,
              };

              const entry = normalizePrice(raw, cinemaName);
              validateSchema(entry);
              allResults.push(entry);
            } catch (err) {
              console.log(`[BMS] Skipping invalid entry: ${err.message}`);
            }
          }
        }
      }

      console.log(`[BMS] Running total: ${allResults.length} price entries.`);
      await page.waitForTimeout(1000 + Math.random() * 2000);
    }

    // Deduplicate
    const seen = new Set();
    const deduped = allResults.filter((entry) => {
      const key = `${entry.cinema}-${entry.movie}-${entry.price}-${entry.seat_category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[BMS] Final results after dedup: ${deduped.length}`);
    return deduped;
  } catch (err) {
    console.error('[BMS] Scraper error:', err.message);
    return [];
  } finally {
    if (browser) {
      await browser.close();
      console.log('[BMS] Browser closed.');
    }
  }
}

module.exports = { scrapeBMS };

// Run directly for testing
if (require.main === module) {
  scrapeBMS().then((results) => {
    console.log('\n[BMS] Final Results:');
    console.log(JSON.stringify(results, null, 2));
    console.log(`\nTotal entries: ${results.length}`);
  });
}
