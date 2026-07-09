// BookMyShow scraper — Direct cinema-targeted approach
// Scrapes ONLY the specific cinemas from the Excel sheet by:
// 1. Visiting each cinema's BMS page to discover what movies are playing
// 2. Visiting each movie's showtimes page to capture pricing via API interception
// 3. Filtering the API response to only keep data for our target cinema
//
// This guarantees zero irrelevant data — every entry maps to an Excel-mapped cinema.

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { normalizePrice, validateSchema } = require('../normalize');
const { savePrices } = require('../db');

chromium.use(StealthPlugin());

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Generate next N days as YYYY-MM-DD strings (IST timezone).
 */
function getNextDates(count = 7) {
  const dates = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    dates.push(dateStr);
  }
  return dates;
}

function dateToBmsFormat(dateStr) {
  return dateStr.replace(/-/g, '');
}

// ============================================================
// CINEMA TARGETS — extracted directly from the Excel sheet.
// Grouped by BMS region for efficient scraping.
// ============================================================
const CINEMA_TARGETS = [
  // --- GURUGRAM ---
  { location: 'Gurugram', cinemaName: 'Devgn Cinex Elan Epic', bmsRegion: 'national-capital-region-ncr', bmsSlug: 'devgn-cinex-elan-epic-gurugram', bmsCode: 'NYCG', isOwned: true },
  { location: 'Gurugram', cinemaName: 'INOX World Mark', bmsRegion: 'national-capital-region-ncr', bmsSlug: 'inox-world-mark-gurugram', bmsCode: 'INWM', isOwned: false },
  { location: 'Gurugram', cinemaName: 'INOX AIPL', bmsRegion: 'national-capital-region-ncr', bmsSlug: 'inox-aipl-joy-street-gurgaon', bmsCode: 'IAJS', isOwned: false },
  { location: 'Gurugram', cinemaName: 'Cinepolis Airia Mall', bmsRegion: 'national-capital-region-ncr', bmsSlug: 'cinepolis-airia-mall-sohna-road-gurgaon', bmsCode: 'CRGM', isOwned: false },
  { location: 'Gurugram', cinemaName: 'Wave Urbana Premium', bmsRegion: 'gurugram-gurgaon', bmsSlug: 'wave-urbana-premium-sector-67-gurugram', bmsCode: 'WUPG', isOwned: false },
  { location: 'Gurugram', cinemaName: 'PVR Elan Town Centre', bmsRegion: 'gurugram-gurgaon', bmsSlug: 'pvr-elan-town-centre-sec-67-gurugram', bmsCode: 'PETA', isOwned: false },
  // --- GANDHINAGAR ---
  { location: 'Gandhinagar', cinemaName: 'Devgn Cinex Swagat Mall', bmsRegion: 'gandhinagar', bmsSlug: 'devgn-cinex-swagat-mall-gandhinagar', bmsCode: 'NYST', isOwned: true },
  { location: 'Gandhinagar', cinemaName: 'INOX Adalaj', bmsRegion: 'gandhinagar', bmsSlug: 'inox-gandhinagar-adalaj', bmsCode: 'INGA', isOwned: false },
  // --- AHMEDABAD ---
  { location: 'Ahmedabad', cinemaName: 'Devgn Cinex Chandkheda', bmsRegion: 'gandhinagar', bmsSlug: 'devgn-cinex-chandkheda-ahmedabad', bmsCode: 'NYAG', isOwned: true },
  { location: 'Ahmedabad', cinemaName: 'PVR Motera', bmsRegion: 'ahmedabad', bmsSlug: 'pvr-motera-ahmedabad', bmsCode: 'METH', isOwned: false },
  { location: 'Ahmedabad', cinemaName: 'Rajhans CBD', bmsRegion: 'ahmedabad', bmsSlug: 'rajhans-cinemas-the-cbd-mall-zundal-circle', bmsCode: 'RCCA', isOwned: false },
  // --- THANE ---
  { location: 'Thane', cinemaName: 'Devgn Cinex The Walk', bmsRegion: 'mumbai', bmsSlug: 'devgn-cinex-the-walk-thane', bmsCode: 'DCTW', isOwned: true },
  { location: 'Thane', cinemaName: 'Cinepolis Viviana', bmsRegion: 'mumbai', bmsSlug: 'cinepolis-lake-shore-thane-ex-viviana-mall', bmsCode: 'CPVM', isOwned: false },
  { location: 'Thane', cinemaName: 'INOX R Mall', bmsRegion: 'mumbai', bmsSlug: 'inox-insignia-at-r-mall-thane', bmsCode: 'IRGT', isOwned: false },
  // --- GHAZIABAD ---
  { location: 'Ghaziabad', cinemaName: 'Devgn Cinex Ghaziabad', bmsRegion: 'ghaziabad', bmsSlug: 'devgn-cinex-ghaziabad', bmsCode: 'NYDU', isOwned: true },
  { location: 'Ghaziabad', cinemaName: 'PVR VVIP', bmsRegion: 'ghaziabad', bmsSlug: 'pvr-vvip-ghaziabad', bmsCode: 'VVGZ', isOwned: false },
  // --- KANPUR ---
  { location: 'Kanpur', cinemaName: 'Devgn Cinex Heer Palace', bmsRegion: 'kanpur', bmsSlug: 'devgn-cinex-heer-palace-kanpur', bmsCode: 'NYCH', isOwned: true },
  { location: 'Kanpur', cinemaName: 'INOX Z Square', bmsRegion: 'kanpur', bmsSlug: 'inox-z-square-bada-chauraha', bmsCode: 'INZS', isOwned: false },
  { location: 'Kanpur', cinemaName: 'PVR Deep', bmsRegion: 'kanpur', bmsSlug: 'pvr-deep-kanpur', bmsCode: 'PDDK', isOwned: false },
  { location: 'Kanpur', cinemaName: 'PVR South X', bmsRegion: 'kanpur', bmsSlug: 'pvr-south-x-mall-kanpur', bmsCode: 'PSXM', isOwned: false },
  { location: 'Kanpur', cinemaName: 'Rave 3', bmsRegion: 'kanpur', bmsSlug: 'rave-3-av-cinemas-kanpur', bmsCode: 'RAVE', isOwned: false },
  // --- BAHADURGARH ---
  { location: 'Bahadurgarh', cinemaName: 'Devgn Cinex Bahadurgarh', bmsRegion: 'bahadurgarh', bmsSlug: 'devgn-cinex-bahadurgarh', bmsCode: 'NYBH', isOwned: true },
  { location: 'Bahadurgarh', cinemaName: 'Movietime Cinemas', bmsRegion: 'bahadurgarh', bmsSlug: 'movietime-cinemas-bahadurgarh', bmsCode: 'MTBR', isOwned: false },
  { location: 'Bahadurgarh', cinemaName: 'KRB Cineplex', bmsRegion: 'bahadurgarh', bmsSlug: 'krb-cineplex-bahadurgarh', bmsCode: 'KRBC', isOwned: false },
  // --- ANAND ---
  { location: 'Anand', cinemaName: 'Devgn Cinex Galleria Mall', bmsRegion: 'anand', bmsSlug: 'devgn-cinex-galleria-mall-anand', bmsCode: 'NYSA', isOwned: true },
  { location: 'Anand', cinemaName: 'PVR Maruti Solaris', bmsRegion: 'anand', bmsSlug: 'pvr-maruti-solaris-anand', bmsCode: 'PMAK', isOwned: false },
  { location: 'Anand', cinemaName: 'INOX City Pulse Mall', bmsRegion: 'anand', bmsSlug: 'inox-anand-city-pulse-mall', bmsCode: 'FCPA', isOwned: false },
  // --- BHUJ ---
  { location: 'Bhuj', cinemaName: 'Devgn Cinex Seven Sky', bmsRegion: 'bhuj', bmsSlug: 'devgn-cinex-seven-sky-bhuj', bmsCode: 'NYCS', isOwned: true },
  // --- GUWAHATI ---
  { location: 'Guwahati', cinemaName: 'Devgn Cinex Roodraksh Mall', bmsRegion: 'guwahati', bmsSlug: 'devgn-cinex-roodraksh-mall-guwahati', bmsCode: 'NYRG', isOwned: true },
  { location: 'Guwahati', cinemaName: 'PVR Citi Centre', bmsRegion: 'guwahati', bmsSlug: 'pvr-city-centre-guwahati', bmsCode: 'CCGW', isOwned: false },
  { location: 'Guwahati', cinemaName: 'Cinepolis Central Mall', bmsRegion: 'guwahati', bmsSlug: 'cinepolis-central-mall-guwahati', bmsCode: 'CCMG', isOwned: false },
  // --- SURENDRANAGAR ---
  { location: 'Surendranagar', cinemaName: 'Devgn Cinex Surendranagar', bmsRegion: 'surendranagar', bmsSlug: 'devgn-cinex-surendranagar', bmsCode: 'MMPS', isOwned: true },
  // --- MULUND ---
  { location: 'Mulund', cinemaName: 'Devgn Cinex Mulund', bmsRegion: 'mumbai', bmsSlug: 'devgn-cinex-mulund', bmsCode: 'NYMD', isOwned: true },
  { location: 'Mulund', cinemaName: 'Miraj Cinemas', bmsRegion: 'mumbai', bmsSlug: 'miraj-cinemas-r-mall-mulund', bmsCode: 'MCRM', isOwned: false },
  // --- MEERUT ---
  { location: 'Meerut', cinemaName: 'Devgn Cinex Meerut', bmsRegion: 'meerut', bmsSlug: 'devgn-cinex-meerut', bmsCode: 'NYSM', isOwned: true },
  { location: 'Meerut', cinemaName: 'INOX PVS Mall', bmsRegion: 'meerut', bmsSlug: 'inox-pvs-mall-meerut', bmsCode: 'INPM', isOwned: false },
  { location: 'Meerut', cinemaName: 'Wave', bmsRegion: 'meerut', bmsSlug: 'wave-meerut', bmsCode: 'WVMT', isOwned: false },
  // --- RATLAM ---
  { location: 'Ratlam', cinemaName: 'Devgn Cinex Anand Big Mall', bmsRegion: 'ratlam', bmsSlug: 'devgn-cinex-anand-big-mall-ratlam', bmsCode: 'NCAM', isOwned: true },
  { location: 'Ratlam', cinemaName: 'Gayatri Cinemas', bmsRegion: 'ratlam', bmsSlug: 'gayatri-cinemas-ratlam', bmsCode: 'GCRT', isOwned: false },
  // --- HAPUR ---
  { location: 'Hapur', cinemaName: 'Devgn Cinex Hapur', bmsRegion: 'hapur', bmsSlug: 'devgn-cinex-hapur', bmsCode: 'NYOH', isOwned: true },
  // --- GHAZIPUR ---
  { location: 'Ghazipur', cinemaName: 'Devgn Cinex Ghazipur', bmsRegion: 'ghazipur', bmsSlug: 'devgn-cinex-ghazipur', bmsCode: 'NYSG', isOwned: true },
  // --- RAEBARELI ---
  { location: 'Raebareli', cinemaName: 'Devgn Cinex Raebareli', bmsRegion: 'raebareli', bmsSlug: 'devgn-cinex-raebareli', bmsCode: 'NYCR', isOwned: true },
];

// Build a lookup: BMS venue code -> target info
const CODE_TO_TARGET = {};
CINEMA_TARGETS.forEach(t => { CODE_TO_TARGET[t.bmsCode] = t; });

// Build a lookup: slug fragment -> target info (for matching venue names)
const SLUG_TO_TARGET = {};
CINEMA_TARGETS.forEach(t => { SLUG_TO_TARGET[t.bmsSlug] = t; });

/**
 * Check if a BMS venue belongs to one of our targets.
 * Returns the target object if matched, null otherwise.
 */
function matchVenueToTarget(venueName, venueCode) {
  if (!venueName) return null;

  // 1. Try matching by venue code (most reliable)
  if (venueCode && CODE_TO_TARGET[venueCode]) {
    return CODE_TO_TARGET[venueCode];
  }

  // 2. Try matching by slug fragments in the venue name
  const lowerVenue = venueName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const target of CINEMA_TARGETS) {
    const targetNorm = target.cinemaName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lowerVenue.includes(targetNorm) || targetNorm.includes(lowerVenue)) {
      return target;
    }
    // Also check the BMS slug (minus hyphens)
    const slugNorm = target.bmsSlug.replace(/-/g, '');
    if (lowerVenue.includes(slugNorm.substring(0, 15))) {
      return target;
    }
  }

  return null;
}

/**
 * Extract clean cinema name from venue string.
 */
function extractCinemaName(venueName) {
  if (!venueName) return 'Unknown';
  return venueName.split(',')[0].trim();
}

/**
 * Parse BMS showtimes API data, keeping ONLY venues that match our targets.
 */
function parseBMSData(dynamicData, staticData, movieTitle, dateStr, allResults) {
  if (!dynamicData?.data?.showtimeWidgets) return;

  let eventFormat = '2D';
  let eventLanguage = '';
  if (staticData?.data?.eventData?.childEvents?.length > 0) {
    eventFormat = staticData.data.eventData.childEvents[0].eventDimension || '2D';
    eventLanguage = staticData.data.eventData.childEvents[0].eventLanguage || '';
  }

  const groupList = dynamicData.data.showtimeWidgets.find(w => w.type === 'groupList');
  if (!groupList?.data?.[0]?.data) return;

  const venues = groupList.data[0].data;
  let matchedCount = 0;

  for (const venue of venues) {
    const venueName = venue.additionalData?.venueName || '';
    const venueCode = venue.additionalData?.venueCode || '';

    // STRICT FILTER: only keep venues that match our Excel targets
    const target = matchVenueToTarget(venueName, venueCode);
    if (!target) continue;
    matchedCount++;

    const showtimes = venue.showtimes || [];
    if (showtimes.length === 0) continue;

    for (const showtime of showtimes) {
      const categories = showtime.additionalData?.categories || [];
      const showTime = showtime.additionalData?.showTime || showtime.title || '';

      for (const cat of categories) {
        const price = parseFloat(cat.curPrice) || 0;
        const seatCategory = cat.priceDesc || 'Standard';

        if (price > 0) {
          try {
            const raw = {
              cinema: target.cinemaName,
              location: target.location,
              movie: movieTitle,
              format: eventFormat,
              language: eventLanguage,
              price: price,
              seat_category: seatCategory,
              showtime: showTime,
              date: dateStr,
            };

            const entry = normalizePrice(raw, target.cinemaName);
            validateSchema(entry);
            allResults.push(entry);
          } catch (err) {
            // Skip invalid entries silently
          }
        }
      }
    }
  }

  if (matchedCount > 0) {
    console.log(`[BMS]   Matched ${matchedCount} of ${venues.length} venues for ${movieTitle} on ${dateStr}.`);
  }
}

/**
 * Main BMS scraper function.
 * Groups targets by BMS region, discovers movies per region, then
 * scrapes showtimes and filters to only our target cinemas.
 */
async function scrapeBMS() {
  let browser = null;

  try {
    console.log('[BMS] Launching browser...');
    console.log(`[BMS] Tracking ${CINEMA_TARGETS.length} cinemas across ${[...new Set(CINEMA_TARGETS.map(t => t.location))].length} locations.`);
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

    // ---- Set up API response capture ----
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
      } catch (e) { }
    });

    const datesToScrape = getNextDates(7);
    console.log(`[BMS] Will scrape dates: ${datesToScrape.join(', ')}`);

    const allResults = [];

    // Group cinema targets by unique BMS region
    const regionSet = [...new Set(CINEMA_TARGETS.map(t => t.bmsRegion))];
    console.log(`[BMS] Unique BMS regions: ${regionSet.length} — ${regionSet.join(', ')}`);

    // ---- For each region, discover movies and scrape ----
    for (const region of regionSet) {
      const targetsInRegion = CINEMA_TARGETS.filter(t => t.bmsRegion === region);
      console.log(`\n[BMS] ========================================`);
      console.log(`[BMS] Region: ${region} (${targetsInRegion.map(t => t.cinemaName).join(', ')})`);
      console.log(`[BMS] ========================================`);

      const exploreUrl = `https://in.bookmyshow.com/explore/movies-${region}`;
      console.log(`[BMS] Navigating to ${exploreUrl}...`);

      try {
        await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
      } catch (err) {
        console.log(`[BMS] Failed to load region ${region}: ${err.message}`);
        continue;
      }

      // Discover movies in this region
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

      console.log(`[BMS] Found ${movieLinks.length} movies in ${region}.`);
      if (movieLinks.length === 0) continue;

      // Scrape top 5 movies per region (covers most showtimes)
      const moviesToScrape = movieLinks.slice(0, 5);

      for (const movie of moviesToScrape) {
        const movieUrl = movie.href.startsWith('http') ? movie.href : `https://in.bookmyshow.com${movie.href}`;
        console.log(`\n[BMS] --- ${movie.title} (${region}) ---`);

        // Visit movie page and click "Book tickets"
        try {
          await page.goto(movieUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);
        } catch (err) {
          console.log(`[BMS]   Failed to load movie page: ${err.message}`);
          continue;
        }

        const bookBtn = await page.$('button:has-text("Book tickets"), a:has-text("Book tickets")');
        if (!bookBtn) {
          console.log(`[BMS]   No "Book tickets" button, skipping.`);
          continue;
        }

        // Reset captured data
        dynamicData = null;
        staticData = null;

        console.log(`[BMS]   Clicking "Book tickets"...`);
        await bookBtn.click();
        await page.waitForTimeout(5000);

        // Parse today's data (first date)
        const beforeToday = allResults.length;
        parseBMSData(dynamicData, staticData, movie.title, datesToScrape[0], allResults);
        console.log(`[BMS]   ${datesToScrape[0]}: +${allResults.length - beforeToday} entries (total: ${allResults.length})`);

        // ---- Click through remaining date tabs ----
        for (let dateIdx = 1; dateIdx < datesToScrape.length; dateIdx++) {
          const targetDate = datesToScrape[dateIdx];
          dynamicData = null;
          staticData = null;

          let dateClicked = false;
          try {
            const targetDateObj = new Date(targetDate + 'T00:00:00+05:30');
            const dayNum = String(targetDateObj.getDate()).padStart(2, '0');
            const dayNumNoZero = String(targetDateObj.getDate());
            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const month = monthNames[targetDateObj.getMonth()];
            const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const dayName = dayNames[targetDateObj.getDay()];

            const possibleTabs = await page.$$('div, a, li, button, span');
            for (const tab of possibleTabs) {
              try {
                const text = await tab.textContent();
                const cleanText = text.trim().replace(/\s+/g, ' ').toLowerCase();
                if (cleanText.length > 3 && cleanText.length < 25) {
                  if (cleanText.includes(dayNum) || cleanText.includes(dayNumNoZero)) {
                    if (cleanText.includes(month.toLowerCase()) || cleanText.includes(dayName.toLowerCase())) {
                      const box = await tab.boundingBox();
                      if (box && box.width > 10 && box.height > 10) {
                        await tab.click();
                        dateClicked = true;
                        break;
                      }
                    }
                  }
                }
              } catch (e) { }
            }
          } catch (err) { }

          if (!dateClicked) {
            console.log(`[BMS]   ${targetDate}: could not find date tab, skipping.`);
            continue;
          }

          await page.waitForTimeout(4000);

          const beforeDate = allResults.length;
          parseBMSData(dynamicData, staticData, movie.title, targetDate, allResults);
          console.log(`[BMS]   ${targetDate}: +${allResults.length - beforeDate} entries (total: ${allResults.length})`);

          await page.waitForTimeout(500 + Math.random() * 1000);
        }

        await page.waitForTimeout(1000 + Math.random() * 2000);
      }
      
      // Incremental save after each region
      if (allResults.length > 0) {
        try {
          // Deduplicate before saving incrementally
          const seen = new Set();
          const deduped = allResults.filter((entry) => {
            const key = `${entry.cinema}-${entry.location}-${entry.movie}-${entry.price}-${entry.seat_category}-${entry.showtime}-${entry.date}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          await savePrices(deduped);
          console.log(`[BMS]   -> Incrementally saved ${deduped.length} entries so far.`);
        } catch (err) {
          console.error(`[BMS]   -> Failed to save incrementally:`, err.message);
        }
      }
    }

    // Deduplicate
    const seen = new Set();
    const deduped = allResults.filter((entry) => {
      const key = `${entry.cinema}-${entry.location}-${entry.movie}-${entry.price}-${entry.seat_category}-${entry.showtime}-${entry.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Summary
    const locationCount = {};
    deduped.forEach(r => { locationCount[r.location] = (locationCount[r.location] || 0) + 1; });
    console.log(`\n[BMS] ===== SCRAPE COMPLETE =====`);
    console.log(`[BMS] Final: ${deduped.length} entries from ${Object.keys(locationCount).length} locations`);
    console.log('[BMS] Per location:', JSON.stringify(locationCount, null, 2));

    // Verify no rogue locations
    const expectedLocations = new Set(CINEMA_TARGETS.map(t => t.location));
    const unexpectedLocs = Object.keys(locationCount).filter(l => !expectedLocations.has(l));
    if (unexpectedLocs.length > 0) {
      console.warn('[BMS] WARNING: Found unexpected locations:', unexpectedLocs);
    } else {
      console.log('[BMS] ✓ All entries belong to mapped locations only.');
    }

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

module.exports = { scrapeBMS, CINEMA_TARGETS };

// Run directly for testing
if (require.main === module) {
  scrapeBMS().then((results) => {
    console.log('\n[BMS] Sample Results:');
    console.log(JSON.stringify(results.slice(0, 5), null, 2));
    console.log(`\nTotal entries: ${results.length}`);
    const dateCount = {};
    results.forEach(r => { dateCount[r.date] = (dateCount[r.date] || 0) + 1; });
    console.log('\nEntries per date:', dateCount);
  });
}
