// BookMyShow scraper — Playwright + Stealth
// Scrapes cinema/venue/showtime data from BMS Mumbai.
// Prices on BMS are only visible after selecting a showtime (seat layout),
// so this scraper collects venue + movie + format data from the showtimes
// listing page, and attempts to click into showtimes to capture prices
// via XHR interception.

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { normalizePrice, validateSchema } = require('../normalize');

// Register stealth plugin
chromium.use(StealthPlugin());

// User-agent rotation pool
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Detect format from text
 */
function detectFormat(text) {
  if (!text) return '2D';
  const upper = text.toUpperCase();
  if (upper.includes('IMAX')) return 'IMAX';
  if (upper.includes('4DX')) return '4DX';
  if (upper.includes('3D')) return '3D';
  return '2D';
}

/**
 * Extract Mumbai area from venue name/address string.
 */
function extractMumbaiArea(address) {
  if (!address) return 'Mumbai';
  const areas = [
    'Andheri', 'Bandra', 'Juhu', 'Goregaon', 'Malad', 'Borivali',
    'Thane', 'Mulund', 'Powai', 'Kurla', 'Dadar', 'Lower Parel',
    'Worli', 'Colaba', 'Chembur', 'Ghatkopar', 'Vile Parle',
    'Kandivali', 'Dahisar', 'Versova', 'Santacruz', 'Khar',
    'Wadala', 'Sion', 'Matunga', 'Parel', 'Navi Mumbai',
    'Airoli', 'Vashi', 'Nerul', 'Panvel', 'Belapur',
    'Seawoods', 'Kharghar', 'Kalyan', 'Dombivli',
  ];
  for (const area of areas) {
    if (address.toLowerCase().includes(area.toLowerCase())) return area;
  }
  return 'Mumbai';
}

/**
 * Set up XHR interception on a page to capture pricing responses.
 * BMS pricing data appears when the user clicks a showtime and the
 * seat-layout / pricing API is called.
 */
function setupXHRInterception(page, intercepted) {
  const URL_KEYWORDS = [
    'getSeatLayout', 'seatLayout', 'getPrice', 'ticketPrice',
    'schedules', 'pricing', 'companySeats', 'BookMyShow',
    'seatlayoutdetails', 'SeatLayout',
  ];

  page.on('response', async (response) => {
    try {
      const url = response.url();
      const matchesURL = URL_KEYWORDS.some((kw) =>
        url.toLowerCase().includes(kw.toLowerCase())
      );
      if (!matchesURL) return;

      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('json')) return;

      const body = await response.json();

      // Try to extract seat categories and prices from the layout response
      const categories =
        body.SeatCategories || body.categories || body.seatTypes ||
        body.data?.categories || body.data?.SeatCategories || [];

      if (Array.isArray(categories)) {
        for (const cat of categories) {
          const price = cat.CurPrice || cat.price || cat.amount || cat.MaxPrice || 0;
          const seatCat = cat.SeatType || cat.category || cat.name || cat.SeatTypeName || '';
          if (price) {
            intercepted.push({
              price,
              seat_category: seatCat,
              _source: 'xhr',
            });
          }
        }
      }
    } catch (_) {
      // Silently ignore
    }
  });
}

/**
 * Step 1: Get movie links from the explore page.
 */
async function getMovieLinks(page) {
  console.log('[BMS] Navigating to movies listing...');
  await page.goto('https://in.bookmyshow.com/explore/movies-mumbai', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await page.waitForTimeout(2000 + Math.random() * 3000);
  await page.waitForTimeout(3000);

  const movies = await page.evaluate(() => {
    const cards = document.querySelectorAll('a[href*="/movies/"]');
    const results = [];
    const seen = new Set();

    // Known city slugs to skip when extracting movie name from URL
    const citySlugs = ['mumbai', 'delhi-ncr', 'bengaluru', 'hyderabad', 'pune', 'chennai', 'kolkata', 'ahmedabad', 'kochi'];

    for (const card of cards) {
      const href = card.getAttribute('href');
      if (!href || href.includes('/explore/') || href.includes('/genre/')) continue;
      if (seen.has(href)) continue;
      seen.add(href);

      let title = '';

      // Strategy 1: Get title from img alt text (cleanest source)
      const img = card.querySelector('img');
      if (img && img.alt && img.alt.length > 1 && img.alt.length < 80) {
        title = img.alt.trim();
      }

      // Strategy 2: Extract from URL slug, skipping city and event code
      if (!title) {
        const segments = href.split('/').filter(Boolean);
        // Find segments after 'movies', skip city slugs and event codes (ET00...)
        const moviesIdx = segments.indexOf('movies');
        if (moviesIdx >= 0) {
          for (let i = moviesIdx + 1; i < segments.length; i++) {
            const seg = segments[i];
            if (citySlugs.includes(seg.toLowerCase())) continue;
            if (/^ET\d+$/i.test(seg)) continue;
            // This should be the movie slug
            title = seg
              .replace(/-/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase());
            break;
          }
        }
      }

      // Strategy 3: DOM text fallback
      if (!title) {
        const titleEl = card.querySelector('div, h2, h3, span');
        title = titleEl ? titleEl.textContent.trim().substring(0, 40) : '';
      }

      if (title) {
        results.push({ title, href });
      }
    }
    return results;
  });

  console.log(`[BMS] Found ${movies.length} movie links.`);
  return movies.slice(0, 3); // Limit to 3 movies to reduce detection risk
}

/**
 * Step 2: Navigate to the "Buy Tickets" / showtimes page for a movie.
 * BMS URL pattern: /buytickets/{slug}/movie-mum-{eventCode}-MT/YYYYMMDD
 * But we can also click the "Book tickets" button from the movie detail page.
 */
async function getShowtimesPage(page, movie) {
  try {
    const url = movie.href.startsWith('http')
      ? movie.href
      : `https://in.bookmyshow.com${movie.href}`;

    console.log(`[BMS] Visiting movie: ${movie.title}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000 + Math.random() * 3000);

    // Click "Book tickets" button to go to showtimes page
    const bookBtn = await page.$('button:has-text("Book tickets"), button:has-text("Book Tickets"), a:has-text("Book tickets")');
    if (bookBtn) {
      console.log(`[BMS] Clicking "Book tickets" for ${movie.title}...`);
      await bookBtn.click();
      await page.waitForTimeout(3000);
      return true;
    } else {
      console.log(`[BMS] No "Book tickets" button found for ${movie.title}.`);
      return false;
    }
  } catch (err) {
    console.log(`[BMS] Error navigating to ${movie.title}: ${err.message}`);
    return false;
  }
}

/**
 * Step 3: Scrape the showtimes listing page.
 * On this page, cinemas are listed with their showtimes.
 * BMS class patterns (discovered via inspection):
 *   - Cinema row anchor: a[class*="sc-1qdowf4"] with alt="Cinema Name, Area"
 *   - Cinema name span inside the anchor
 *   - Movie title: a[class*="sc-5v6xxo"]
 */
async function scrapeShowtimesPage(page, movieTitle) {
  const results = [];

  try {
    // Extract venue/cinema data from the showtimes page DOM
    const venueData = await page.evaluate(() => {
      const entries = [];

      // Strategy 1: Look for cinema row anchors with alt attributes
      // BMS uses <a alt="Cinema Name, Area, City">
      const cinemaAnchors = document.querySelectorAll('a[alt]');
      for (const anchor of cinemaAnchors) {
        const alt = anchor.getAttribute('alt') || '';
        // Cinema alts look like "PVR: Phoenix Palladium, Lower Parel, Mumbai"
        if (alt && (alt.includes('Mumbai') || alt.includes('Navi Mumbai') || alt.includes('Thane'))) {
          entries.push({
            cinema: alt.split(',')[0].trim(),
            fullAddress: alt,
          });
        }
      }

      // Strategy 2: Look for elements containing cinema-like names
      if (entries.length === 0) {
        const allSpans = document.querySelectorAll('span, div');
        for (const el of allSpans) {
          const text = el.textContent.trim();
          // Match common cinema chains
          if (
            (text.startsWith('PVR') || text.startsWith('INOX') ||
             text.startsWith('Cinepolis') || text.startsWith('MovieMax') ||
             text.startsWith('Carnival') || text.startsWith('Miraj') ||
             text.startsWith('Citiplex') || text.startsWith('Gold')) &&
            text.length < 100
          ) {
            entries.push({
              cinema: text.split(',')[0].trim(),
              fullAddress: text,
            });
          }
        }
      }

      return entries;
    });

    // Build result objects with detected format from the movie title
    for (const venue of venueData) {
      results.push({
        cinema: venue.cinema,
        location: extractMumbaiArea(venue.fullAddress),
        movie: movieTitle,
        format: detectFormat(movieTitle),
        price: 0, // Price TBD — need to click a showtime
        seat_category: '',
      });
    }
  } catch (err) {
    console.log(`[BMS] Error scraping showtimes page: ${err.message}`);
  }

  return results;
}

/**
 * Step 4: Click into a showtime to trigger the seat-layout API
 * and capture pricing via XHR interception.
 */
async function clickShowtimeForPricing(page, intercepted) {
  try {
    // Find showtime buttons by matching time-pattern text (e.g. "01:00 PM", "9:30 AM")
    // This avoids accidentally clicking the search bar or other elements
    const timePattern = /^\s*\d{1,2}:\d{2}\s*(AM|PM)\s*$/i;

    const allButtons = await page.$$('a, div[role="button"], button, div[data-online]');
    let showtimeButton = null;

    for (const btn of allButtons) {
      const text = (await btn.textContent()).trim();
      if (timePattern.test(text)) {
        showtimeButton = btn;
        break;
      }
    }

    if (!showtimeButton) {
      console.log('[BMS] No clickable showtime buttons with time pattern found.');
      return;
    }

    const showtimeText = (await showtimeButton.textContent()).trim();
    console.log(`[BMS] Clicking showtime: ${showtimeText}`);

    await showtimeButton.click();
    // Wait for the seat-layout / pricing API to respond
    await page.waitForTimeout(4000);

    // Check if we got pricing data via XHR
    if (intercepted.length > 0) {
      console.log(`[BMS] Captured ${intercepted.length} price entries from seat-layout API.`);
    } else {
      console.log('[BMS] No pricing data captured from XHR after clicking showtime.');
    }

    // Navigate back to the showtimes page
    await page.goBack();
    await page.waitForTimeout(2000);
  } catch (err) {
    console.log(`[BMS] Error clicking showtime: ${err.message}`);
  }
}

/**
 * Main scraper function for BookMyShow Mumbai.
 *
 * @returns {Promise<Array>} Array of normalized price objects
 */
async function scrapeBMS() {
  let browser = null;

  try {
    console.log('[BMS] Launching browser...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const context = await browser.newContext({
      userAgent: getRandomUA(),
      viewport: { width: 1366, height: 768 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    });

    const page = await context.newPage();

    // Shared array for XHR-intercepted pricing data
    const intercepted = [];
    setupXHRInterception(page, intercepted);

    // Step 1: Get movie links from listing page
    const movies = await getMovieLinks(page);
    if (movies.length === 0) {
      console.log('[BMS] No movie links found.');
      return [];
    }

    const allVenueData = [];

    // Step 2-4: For each movie, get showtimes and attempt pricing capture
    for (const movie of movies) {
      const navigated = await getShowtimesPage(page, movie);
      if (!navigated) continue;

      // Scrape venue/cinema list from the showtimes page
      const venueData = await scrapeShowtimesPage(page, movie.title);
      console.log(`[BMS] Found ${venueData.length} venues for ${movie.title}`);

      // Attempt to click into a showtime for pricing data
      await clickShowtimeForPricing(page, intercepted);

      allVenueData.push(...venueData);

      // Random delay between movies
      await page.waitForTimeout(2000 + Math.random() * 3000);
    }

    // Merge XHR pricing data into venue data
    if (intercepted.length > 0) {
      console.log(`[BMS] Total XHR price entries: ${intercepted.length}`);
      // If we have both venue data and XHR prices, combine them
      for (const venue of allVenueData) {
        if (venue.price === 0 && intercepted.length > 0) {
          // Assign the first available price (best effort matching)
          const priceEntry = intercepted[0];
          venue.price = priceEntry.price;
          venue.seat_category = priceEntry.seat_category || venue.seat_category;
        }
      }

      // Also add standalone XHR entries that weren't matched
      for (const xhr of intercepted) {
        allVenueData.push({
          cinema: 'BMS',
          location: 'Mumbai',
          movie: movies[0]?.title || 'N/A',
          format: '2D',
          price: xhr.price,
          seat_category: xhr.seat_category,
        });
      }
    }

    // Filter out entries with zero price
    const withPrices = allVenueData.filter((e) => Number(e.price) > 0);
    // Keep venue-only entries if no prices were found at all
    const rawResults = withPrices.length > 0 ? withPrices : allVenueData;

    // Deduplicate
    const seen = new Set();
    const deduped = rawResults.filter((entry) => {
      const key = `${entry.cinema}-${entry.movie}-${entry.price}-${entry.seat_category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[BMS] Total raw results after dedup: ${deduped.length}`);

    // Normalize
    const normalized = [];
    for (const raw of deduped) {
      try {
        raw.format = detectFormat(raw.format || raw.movie);
        raw.location = raw.location || 'Mumbai';

        const entry = normalizePrice(raw, raw.cinema || 'BMS');
        validateSchema(entry);
        normalized.push(entry);
      } catch (err) {
        console.log(`[BMS] Skipping invalid entry: ${err.message}`);
      }
    }

    console.log(`[BMS] Final normalized results: ${normalized.length}`);
    return normalized;
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
