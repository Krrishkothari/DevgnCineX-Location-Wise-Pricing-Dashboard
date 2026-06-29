// MovieMax Cinemas scraper — Playwright + Stealth
// Scrapes cinema/venue/showtime data from MovieMax.
// Prices on MovieMax are only visible after selecting a showtime (seat layout),
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
 * MovieMax pricing data appears when the user clicks a showtime and the
 * seat-layout / pricing API is called.
 */
function setupXHRInterception(page, intercepted) {
  const URL_KEYWORDS = [
    'getSeatLayout', 'seatLayout', 'getPrice', 'ticketPrice',
    'schedules', 'pricing', 'seats', 'seatType',
    'showtime', 'booking', 'session', 'seatmap',
    'getSchedule', 'moviemax',
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
        body.data?.categories || body.data?.SeatCategories ||
        body.output?.categories || body.output?.seatLayout || [];

      if (Array.isArray(categories)) {
        for (const cat of categories) {
          const price = cat.CurPrice || cat.price || cat.amount || cat.MaxPrice || cat.ticketPrice || 0;
          const seatCat = cat.SeatType || cat.category || cat.name || cat.SeatTypeName || cat.areaDesc || '';
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
 * Step 1: Get movie links from the MovieMax page.
 */
async function getMovieLinks(page) {
  console.log('[MovieMax] Navigating to movies listing...');
  await page.goto('https://www.moviemaxcinemas.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await page.waitForTimeout(2000 + Math.random() * 3000);

  // Try to navigate to "Now Showing" or movies section if available
  try {
    const nowShowingLink = await page.$('a:has-text("Now Showing"), a:has-text("Movies"), a:has-text("NOW SHOWING")');
    if (nowShowingLink) {
      console.log('[MovieMax] Clicking "Now Showing" / "Movies" link...');
      await nowShowingLink.click();
      await page.waitForTimeout(2000 + Math.random() * 3000);
    }
  } catch (_) {
    // Link may not be present or page already shows movies
  }

  await page.waitForTimeout(3000);

  const movies = await page.evaluate(() => {
    const cards = document.querySelectorAll('a[href*="/movie/"], a[href*="/movies/"], a[href*="/film/"], a[href*="/now-showing/"]');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const href = card.getAttribute('href');
      if (!href || href.includes('/explore/') || href.includes('/genre/')) continue;
      if (seen.has(href)) continue;
      seen.add(href);

      let title = '';

      // Strategy 1: Get title from img alt text
      const img = card.querySelector('img');
      if (img && img.alt && img.alt.length > 1 && img.alt.length < 80) {
        title = img.alt.trim();
      }

      // Strategy 2: Extract from URL slug
      if (!title) {
        const segments = href.split('/').filter(Boolean);
        const moviesIdx = segments.findIndex((s) =>
          s === 'movies' || s === 'movie' || s === 'film' || s === 'now-showing'
        );
        if (moviesIdx >= 0) {
          for (let i = moviesIdx + 1; i < segments.length; i++) {
            const seg = segments[i];
            if (['mumbai', 'delhi', 'bengaluru', 'hyderabad', 'pune', 'chennai'].includes(seg.toLowerCase())) continue;
            title = seg
              .replace(/-/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase());
            break;
          }
        }
      }

      // Strategy 3: DOM text fallback
      if (!title) {
        const titleEl = card.querySelector('div, h2, h3, span, p');
        title = titleEl ? titleEl.textContent.trim().substring(0, 40) : '';
      }

      if (title) {
        results.push({ title, href });
      }
    }
    return results;
  });

  console.log(`[MovieMax] Found ${movies.length} movie links.`);
  return movies.slice(0, 3); // Limit to 3 movies to reduce detection risk
}

/**
 * Step 2: Navigate to the showtimes page for a movie.
 */
async function getShowtimesPage(page, movie) {
  try {
    const url = movie.href.startsWith('http')
      ? movie.href
      : `https://www.moviemaxcinemas.com${movie.href}`;

    console.log(`[MovieMax] Visiting movie: ${movie.title}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000 + Math.random() * 3000);

    // Click "Book tickets" / "Showtimes" button
    const bookBtn = await page.$('button:has-text("Book"), a:has-text("Book"), button:has-text("Showtimes"), a:has-text("Showtimes"), button:has-text("Buy"), a:has-text("Buy")');
    if (bookBtn) {
      console.log(`[MovieMax] Clicking "Book" / "Showtimes" for ${movie.title}...`);
      await bookBtn.click();
      await page.waitForTimeout(3000);
      return true;
    } else {
      console.log(`[MovieMax] No "Book" button found for ${movie.title}, staying on page.`);
      return true; // MovieMax may show showtimes inline
    }
  } catch (err) {
    console.log(`[MovieMax] Error navigating to ${movie.title}: ${err.message}`);
    return false;
  }
}

/**
 * Step 3: Scrape the showtimes listing page.
 */
async function scrapeShowtimesPage(page, movieTitle) {
  const results = [];

  try {
    const venueData = await page.evaluate(() => {
      const entries = [];

      // Strategy 1: Look for cinema/venue elements
      const cinemaAnchors = document.querySelectorAll('a[alt], [data-cinema-name], [class*="cinema"], [class*="venue"], [class*="theatre"]');
      for (const anchor of cinemaAnchors) {
        const alt = anchor.getAttribute('alt') || anchor.getAttribute('data-cinema-name') || '';
        const text = alt || anchor.textContent.trim();
        if (text && text.length < 100 && text.length > 2) {
          entries.push({
            cinema: text.split(',')[0].trim(),
            fullAddress: text,
          });
        }
      }

      // Strategy 2: Look for elements containing cinema-like names
      if (entries.length === 0) {
        const allSpans = document.querySelectorAll('span, div, h3, h4');
        for (const el of allSpans) {
          const text = el.textContent.trim();
          if (
            (text.startsWith('MovieMax') || text.startsWith('Movie Max') ||
              text.startsWith('PVR') || text.startsWith('INOX') ||
              text.startsWith('Cinepolis') || text.startsWith('Carnival')) &&
            text.length < 100 && text.length > 3
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

    for (const venue of venueData) {
      results.push({
        cinema: venue.cinema,
        location: extractMumbaiArea(venue.fullAddress),
        movie: movieTitle,
        format: detectFormat(movieTitle),
        price: 0,
        seat_category: '',
      });
    }
  } catch (err) {
    console.log(`[MovieMax] Error scraping showtimes page: ${err.message}`);
  }

  return results;
}

/**
 * Step 4: Click into a showtime to trigger the seat-layout API
 * and capture pricing via XHR interception.
 */
async function clickShowtimeForPricing(page, intercepted) {
  try {
    const timePattern = /^\s*\d{1,2}:\d{2}\s*(AM|PM)?\s*$/i;

    const allButtons = await page.$$('a, div[role="button"], button, div[data-showtime]');
    let showtimeButton = null;

    for (const btn of allButtons) {
      const text = (await btn.textContent()).trim();
      if (timePattern.test(text)) {
        showtimeButton = btn;
        break;
      }
    }

    if (!showtimeButton) {
      console.log('[MovieMax] No clickable showtime buttons with time pattern found.');
      return;
    }

    const showtimeText = (await showtimeButton.textContent()).trim();
    console.log(`[MovieMax] Clicking showtime: ${showtimeText}`);

    await showtimeButton.click();
    await page.waitForTimeout(4000);

    if (intercepted.length > 0) {
      console.log(`[MovieMax] Captured ${intercepted.length} price entries from seat-layout API.`);
    } else {
      console.log('[MovieMax] No pricing data captured from XHR after clicking showtime.');
    }

    await page.goBack();
    await page.waitForTimeout(2000);
  } catch (err) {
    console.log(`[MovieMax] Error clicking showtime: ${err.message}`);
  }
}

/**
 * Main scraper function for MovieMax Cinemas.
 *
 * @returns {Promise<Array>} Array of normalized price objects
 */
async function scrapeMovieMax() {
  let browser = null;

  try {
    console.log('[MovieMax] Launching browser...');
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
      console.log('[MovieMax] No movie links found.');
      return [];
    }

    const allVenueData = [];

    // Step 2-4: For each movie, get showtimes and attempt pricing capture
    for (const movie of movies) {
      const navigated = await getShowtimesPage(page, movie);
      if (!navigated) continue;

      // Scrape venue/cinema list from the showtimes page
      const venueData = await scrapeShowtimesPage(page, movie.title);
      console.log(`[MovieMax] Found ${venueData.length} venues for ${movie.title}`);

      // Attempt to click into a showtime for pricing data
      await clickShowtimeForPricing(page, intercepted);

      allVenueData.push(...venueData);

      // Random delay between movies
      await page.waitForTimeout(2000 + Math.random() * 3000);
    }

    // Merge XHR pricing data into venue data
    if (intercepted.length > 0) {
      console.log(`[MovieMax] Total XHR price entries: ${intercepted.length}`);
      for (const venue of allVenueData) {
        if (venue.price === 0 && intercepted.length > 0) {
          const priceEntry = intercepted[0];
          venue.price = priceEntry.price;
          venue.seat_category = priceEntry.seat_category || venue.seat_category;
        }
      }

      for (const xhr of intercepted) {
        allVenueData.push({
          cinema: 'MovieMax',
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
    const rawResults = withPrices.length > 0 ? withPrices : allVenueData;

    // Deduplicate
    const seen = new Set();
    const deduped = rawResults.filter((entry) => {
      const key = `${entry.cinema}-${entry.movie}-${entry.price}-${entry.seat_category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[MovieMax] Total raw results after dedup: ${deduped.length}`);

    // Normalize
    const normalized = [];
    for (const raw of deduped) {
      try {
        raw.format = detectFormat(raw.format || raw.movie);
        raw.location = raw.location || 'Mumbai';

        const entry = normalizePrice(raw, raw.cinema || 'MovieMax');
        validateSchema(entry);
        normalized.push(entry);
      } catch (err) {
        console.log(`[MovieMax] Skipping invalid entry: ${err.message}`);
      }
    }

    console.log(`[MovieMax] Final normalized results: ${normalized.length}`);
    return normalized;
  } catch (err) {
    console.error('[MovieMax] Scraper error:', err.message);
    return [];
  } finally {
    if (browser) {
      await browser.close();
      console.log('[MovieMax] Browser closed.');
    }
  }
}

module.exports = { scrapeMovieMax };

// Run directly for testing
if (require.main === module) {
  scrapeMovieMax().then((results) => {
    console.log('\n[MovieMax] Final Results:');
    console.log(JSON.stringify(results, null, 2));
    console.log(`\nTotal entries: ${results.length}`);
  });
}
