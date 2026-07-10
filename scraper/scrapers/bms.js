// BookMyShow scraper — Parallel per-location architecture
// Exports scrapeLocation(locationConfig) for use by the concurrency-limited runner.
// Each location gets its own browser instance for full error isolation.
//
// Scraping approach (unchanged from original):
// 1. Groups the location's cinemas by BMS region
// 2. Visits each region's explore page to discover currently-playing movies
// 3. Visits each movie's showtimes page to capture pricing via API interception
// 4. Filters the API response to only keep data for this location's target cinemas

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

/**
 * Extract clean cinema name from venue string.
 */
function extractCinemaName(venueName) {
  if (!venueName) return 'Unknown';
  return venueName.split(',')[0].trim();
}

// ============================================================
// Lookup helpers — parameterized per-location (not global)
// ============================================================

/**
 * Build lookup maps from a cinema targets array.
 * Returns { codeToTarget, cinemaTargets } scoped to one location.
 */
function buildLookups(cinemaTargets) {
  const codeToTarget = {};
  cinemaTargets.forEach(t => { codeToTarget[t.bmsCode] = t; });
  return { codeToTarget, cinemaTargets };
}

/**
 * Check if a BMS venue belongs to one of the provided targets.
 * Returns the target object if matched, null otherwise.
 */
function matchVenueToTarget(venueName, venueCode, lookups) {
  if (!venueName) return null;

  // 1. Try matching by venue code (most reliable)
  if (venueCode && lookups.codeToTarget[venueCode]) {
    return lookups.codeToTarget[venueCode];
  }

  // 2. Try matching by name / slug fragments
  const lowerVenue = venueName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const target of lookups.cinemaTargets) {
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
 * Parse BMS showtimes API data, keeping ONLY venues that match the provided targets.
 */
function parseBMSData(dynamicData, staticData, movieTitle, dateStr, allResults, lookups, logPrefix) {
  if (!dynamicData?.data?.showtimeWidgets) return;

  // Extract actual selected date from the API response to avoid false positives
  const returnedDateCode = dynamicData.data?.additionalData?.dateCode;
  let effectiveDateStr = dateStr;
  if (returnedDateCode) {
    const code = String(returnedDateCode);
    const parsedDate = `${code.substring(0,4)}-${code.substring(4,6)}-${code.substring(6,8)}`;
    if (parsedDate !== dateStr) {
      console.log(`${logPrefix}   BMS returned date ${parsedDate} instead of ${dateStr}. Using actual date.`);
      effectiveDateStr = parsedDate;
    }
  }

  let eventFormat = '2D';
  let eventLanguage = '';
  if (staticData?.data?.eventData?.childEvents?.length > 0) {
    eventFormat = staticData.data.eventData.childEvents[0].eventDimension || '2D';
    eventLanguage = staticData.data.eventData.childEvents[0].eventLanguage || '';
  }

  const groupList = dynamicData.data.showtimeWidgets.find(w => w.type === 'groupList');
  if (!groupList?.data) return;

  let matchedCount = 0;

  for (const group of groupList.data) {
    if (group.type !== 'venue' && group.type !== 'venueGroup') continue;
    const venues = group.data || [];
    for (const venue of venues) {
    const venueName = venue.additionalData?.venueName || '';
    const venueCode = venue.additionalData?.venueCode || '';

    // STRICT FILTER: only keep venues that match this location's targets
    const target = matchVenueToTarget(venueName, venueCode, lookups);
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
              date: effectiveDateStr,
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
  }

  if (matchedCount > 0) {
    console.log(`${logPrefix}   Matched ${matchedCount} venues for ${movieTitle} on ${effectiveDateStr}.`);
  }
  return effectiveDateStr;
}

// ============================================================
// scrapeLocation — Core function: scrapes one business location
// ============================================================

/**
 * Scrape a single location's cinemas from BookMyShow.
 * Launches its own browser for full error isolation.
 *
 * @param {Object} locationConfig — { locationName: string, cinemas: Array }
 * @param {Map}    [regionLocks]  — Optional shared Map used to serialize access
 *                                  to the same BMS region explore page across
 *                                  parallel location scrapers (prevents Cloudflare blocks).
 * @returns {Object} { locationName, success, entryCount, entries, error? }
 */
async function scrapeLocation(locationConfig, regionLocks) {
  const { locationName, cinemas } = locationConfig;
  const logPrefix = `[BMS:${locationName}]`;
  let browser = null;

  // Transform config cinemas into the internal target shape
  const cinemaTargets = cinemas.map(c => ({
    location: locationName,
    cinemaName: c.cinemaName,
    bmsRegion: c.bmsRegion,
    bmsSlug: c.bmsSlug,
    bmsCode: c.bmsCode,
    isOwned: c.isOwned,
  }));

  const lookups = buildLookups(cinemaTargets);

  try {
    console.log(`${logPrefix} Launching browser...`);
    console.log(`${logPrefix} Tracking ${cinemaTargets.length} cinema(s): ${cinemaTargets.map(t => t.cinemaName).join(', ')}`);

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
    console.log(`${logPrefix} Will scrape dates: ${datesToScrape.join(', ')}`);

    const allResults = [];

    // Group this location's cinemas by unique BMS region
    const regionSet = [...new Set(cinemaTargets.map(t => t.bmsRegion))];
    console.log(`${logPrefix} BMS regions: ${regionSet.join(', ')}`);

    // ---- For each region, discover movies and scrape ----
    for (const region of regionSet) {
      const targetsInRegion = cinemaTargets.filter(t => t.bmsRegion === region);
      console.log(`\n${logPrefix} ========================================`);
      console.log(`${logPrefix} Region: ${region} (${targetsInRegion.map(t => t.cinemaName).join(', ')})`);
      console.log(`${logPrefix} ========================================`);

      const exploreUrl = `https://in.bookmyshow.com/explore/movies-${region}`;

      // ---- Region lock: serialize access to the same explore page across parallel scrapers ----
      // Without this, e.g. Gandhinagar and Ahmedabad both hitting movies-gandhinagar
      // simultaneously causes Cloudflare to block one of them.
      if (regionLocks) {
        const existing = regionLocks.get(region) || Promise.resolve();
        let releaseLock;
        const myLock = new Promise(resolve => { releaseLock = resolve; });
        regionLocks.set(region, existing.then(() => myLock));
        await existing; // wait for any prior location using this region to finish navigating
        console.log(`${logPrefix} Acquired region lock for '${region}', navigating to ${exploreUrl}...`);

        try {
          await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          try {
            await page.waitForSelector('a[href*="/movies/"]', { timeout: 15000 });
          } catch (e) {
            console.log(`${logPrefix}   No movie cards appeared within 15s, page might be blocked or empty.`);
          }
          await page.waitForTimeout(2000);
        } catch (err) {
          console.log(`${logPrefix} Failed to load region ${region}: ${err.message}`);
          releaseLock(); // release even on failure
          continue;
        }
        releaseLock(); // release after page has loaded
      } else {
        // No lock (solo run) — navigate directly
        console.log(`${logPrefix} Navigating to ${exploreUrl}...`);
        try {
          await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          try {
            await page.waitForSelector('a[href*="/movies/"]', { timeout: 15000 });
          } catch (e) {
            console.log(`${logPrefix}   No movie cards appeared within 15s, page might be blocked or empty.`);
          }
          await page.waitForTimeout(2000);
        } catch (err) {
          console.log(`${logPrefix} Failed to load region ${region}: ${err.message}`);
          continue;
        }
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

      console.log(`${logPrefix} Found ${movieLinks.length} movies in ${region}.`);
      if (movieLinks.length === 0) continue;

      // Scrape top 5 movies per region (covers most showtimes)
      const moviesToScrape = movieLinks.slice(0, 5);

      for (const movie of moviesToScrape) {
        const movieUrl = movie.href.startsWith('http') ? movie.href : `https://in.bookmyshow.com${movie.href}`;
        console.log(`\n${logPrefix} --- ${movie.title} (${region}) ---`);

        // Visit movie page and wait dynamically for "Book tickets"
        try {
          await page.goto(movieUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector('button:has-text("Book tickets"), a:has-text("Book tickets")', { timeout: 15000 });
        } catch (err) {
          console.log(`${logPrefix}   Failed to load movie page or find book button: ${err.message}`);
          continue;
        }

        const bookBtn = await page.$('button:has-text("Book tickets"), a:has-text("Book tickets")');
        if (!bookBtn) {
          console.log(`${logPrefix}   No "Book tickets" button, skipping.`);
          continue;
        }

        // Reset captured data
        dynamicData = null;
        staticData = null;

        console.log(`${logPrefix}   Clicking "Book tickets"...`);
        await bookBtn.click();
        await page.waitForTimeout(5000);

        // Parse today's data (first date)
        const scrapedDates = new Set();
        const beforeToday = allResults.length;
        const effectiveDate = parseBMSData(dynamicData, staticData, movie.title, datesToScrape[0], allResults, lookups, logPrefix);
        if (effectiveDate) scrapedDates.add(effectiveDate);
        console.log(`${logPrefix}   ${datesToScrape[0]}: +${allResults.length - beforeToday} entries (total: ${allResults.length})`);

        // ---- Click through remaining date tabs ----
        for (let dateIdx = 1; dateIdx < datesToScrape.length; dateIdx++) {
          const targetDate = datesToScrape[dateIdx];

          // Skip if this date was already scraped via a BMS redirect
          if (scrapedDates.has(targetDate)) {
            console.log(`${logPrefix}   ${targetDate}: already scraped via redirect, skipping.`);
            continue;
          }

          dynamicData = null;
          staticData = null;

          await page.waitForTimeout(1000);
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
            console.log(`${logPrefix}   ${targetDate}: could not find date tab, skipping.`);
            continue;
          }

          await page.waitForTimeout(4000);

          const beforeDate = allResults.length;
          const effectiveDateLoop = parseBMSData(dynamicData, staticData, movie.title, targetDate, allResults, lookups, logPrefix);
          if (effectiveDateLoop) scrapedDates.add(effectiveDateLoop);
          console.log(`${logPrefix}   ${targetDate}: +${allResults.length - beforeDate} entries (total: ${allResults.length})`);

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
          console.log(`${logPrefix}   -> Incrementally saved ${deduped.length} entries so far.`);
        } catch (err) {
          console.error(`${logPrefix}   -> Failed to save incrementally:`, err.message);
        }
      }
    }

    // Final deduplication
    const seen = new Set();
    const deduped = allResults.filter((entry) => {
      const key = `${entry.cinema}-${entry.location}-${entry.movie}-${entry.price}-${entry.seat_category}-${entry.showtime}-${entry.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`\n${logPrefix} ===== LOCATION SCRAPE COMPLETE =====`);
    console.log(`${logPrefix} Final: ${deduped.length} entries from ${locationName}`);

    return {
      locationName,
      success: true,
      entryCount: deduped.length,
      entries: deduped,
    };

  } catch (err) {
    console.error(`${logPrefix} Scraper error:`, err);
    return {
      locationName,
      success: false,
      entryCount: 0,
      entries: [],
      error: err.message,
    };
  } finally {
    if (browser) {
      await browser.close();
      console.log(`${logPrefix} Browser closed.`);
    }
  }
}

module.exports = { scrapeLocation };
