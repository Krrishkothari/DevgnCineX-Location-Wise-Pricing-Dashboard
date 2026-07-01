// BookMyShow scraper — API-based approach with multi-date support
// Intercepts the internal BMS showtimes API to extract real pricing data
// for today + the next 6 days (7 days total).

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
 * Generate next N days as YYYY-MM-DD strings (IST timezone).
 */
function getNextDates(count = 7) {
  const dates = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    // Format as YYYY-MM-DD in IST
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    dates.push(dateStr);
  }
  return dates;
}

/**
 * Extract location from venue name like "Cinepolis: Nexus Seawoods, Nerul, Navi Mumbai"
 */
function extractLocation(venueName) {
  if (!venueName) return 'Mumbai';
  const parts = venueName.split(',');
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
 * Parse the BMS API data for a specific date and add results to allResults array.
 * @param {Object} dynamicData - Captured dynamic API response
 * @param {Object} staticData - Captured static API response
 * @param {String} movieTitle - Movie title
 * @param {String} dateStr - Date string YYYY-MM-DD
 * @param {Array} allResults - Array to push results into
 */
function parseBMSData(dynamicData, staticData, movieTitle, dateStr, allResults) {
  if (!dynamicData?.data?.showtimeWidgets) {
    console.log(`[BMS] No showtime API data captured for ${movieTitle} on ${dateStr}.`);
    return;
  }

  // Extract the real format and language from the static API
  let eventFormat = '2D';
  let eventLanguage = '';
  if (staticData?.data?.eventData?.childEvents?.length > 0) {
    eventFormat = staticData.data.eventData.childEvents[0].eventDimension || '2D';
    eventLanguage = staticData.data.eventData.childEvents[0].eventLanguage || '';
  }

  const groupList = dynamicData.data.showtimeWidgets.find(w => w.type === 'groupList');
  if (!groupList?.data?.[0]?.data) {
    console.log(`[BMS] No venue groups found for ${movieTitle} on ${dateStr}.`);
    return;
  }

  const venues = groupList.data[0].data;
  console.log(`[BMS] Found ${venues.length} venues for ${movieTitle} on ${dateStr}.`);

  for (const venue of venues) {
    const venueName = venue.additionalData?.venueName || '';
    const cinemaName = extractCinemaName(venueName);
    const location = extractLocation(venueName);
    const showtimes = venue.showtimes || [];

    if (showtimes.length === 0) continue;

    // Extract pricing from ALL showtimes (not just the first)
    for (const showtime of showtimes) {
      const categories = showtime.additionalData?.categories || [];
      const showTime = showtime.additionalData?.showTime || showtime.title || '';

      for (const cat of categories) {
        const price = parseFloat(cat.curPrice) || 0;
        const seatCategory = cat.priceDesc || 'Standard';

        if (price > 0) {
          try {
            const raw = {
              cinema: cinemaName,
              location: location,
              movie: movieTitle,
              format: eventFormat,
              language: eventLanguage,
              price: price,
              seat_category: seatCategory,
              showtime: showTime,
              date: dateStr,
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
  }
}

/**
 * Main BMS scraper function.
 * Uses the internal BMS showtimes API to get real pricing data
 * across multiple dates.
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

    // ---- Step 1: Set up API response capture ----
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

    // ---- Step 2: Navigate to BMS and get movie links ----
    console.log('[BMS] Navigating to movies listing...');
    await page.goto('https://in.bookmyshow.com/explore/movies-mumbai', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

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
    const datesToScrape = getNextDates(7);
    console.log(`[BMS] Will scrape dates: ${datesToScrape.join(', ')}`);

    const allResults = [];

    // ---- Step 3: For each movie, scrape each date ----
    for (const movie of moviesToScrape) {
      const movieUrl = movie.href.startsWith('http') ? movie.href : `https://in.bookmyshow.com${movie.href}`;
      console.log(`\n[BMS] === Scraping movie: ${movie.title} ===`);

      // Visit movie page and click "Book tickets" to get to showtimes
      await page.goto(movieUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      const bookBtn = await page.$('button:has-text("Book tickets"), a:has-text("Book tickets")');
      if (!bookBtn) {
        console.log(`[BMS] No "Book tickets" button for ${movie.title}, skipping.`);
        continue;
      }

      // Reset captured data for the first date
      dynamicData = null;
      staticData = null;

      console.log(`[BMS] Clicking "Book tickets" for ${movie.title}...`);
      await bookBtn.click();
      await page.waitForTimeout(5000);

      // Parse data for the first date (today — default when page loads)
      parseBMSData(dynamicData, staticData, movie.title, datesToScrape[0], allResults);
      console.log(`[BMS] Running total after ${datesToScrape[0]}: ${allResults.length} entries.`);

      // ---- Step 4: Click through date tabs for remaining dates ----
      for (let dateIdx = 1; dateIdx < datesToScrape.length; dateIdx++) {
        const targetDate = datesToScrape[dateIdx];
        console.log(`[BMS] Switching to date: ${targetDate}`);

        // Reset captured data before clicking
        dynamicData = null;
        staticData = null;

        // BMS date tabs: look for clickable date elements in the showtimes panel.
        // BMS renders date chips as scrollable buttons/divs with date text.
        let dateClicked = false;

        try {
          // Parse target date
          const targetDateObj = new Date(targetDate + 'T00:00:00+05:30');
          const dayNum = String(targetDateObj.getDate()).padStart(2, '0'); // '02'
          const dayNumNoZero = String(targetDateObj.getDate()); // '2'
          const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const month = monthNames[targetDateObj.getMonth()];
          const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          const dayName = dayNames[targetDateObj.getDay()];

          // Look for all elements that could be a date tab container or date tab
          // BMS date tabs usually contain the day number, month, and day name
          // We will find all elements, filter for ones that have small text content, and match our date
          const possibleTabs = await page.$$('div, a, li, button, span');
          
          for (const tab of possibleTabs) {
            try {
              const text = await tab.textContent();
              const cleanText = text.trim().replace(/\s+/g, ' ').toLowerCase();
              
              // Only consider elements with very short text (a date tab shouldn't have much text)
              if (cleanText.length > 3 && cleanText.length < 25) {
                // Must contain the day number (either with or without leading zero)
                if (cleanText.includes(dayNum) || cleanText.includes(dayNumNoZero)) {
                  // Must also contain either the month name or day name
                  if (cleanText.includes(month.toLowerCase()) || cleanText.includes(dayName.toLowerCase())) {
                    // Check if element is visible and clickable
                    const box = await tab.boundingBox();
                    if (box && box.width > 10 && box.height > 10) {
                      await tab.click();
                      dateClicked = true;
                      console.log(`[BMS] Clicked date tab for ${targetDate}: "${cleanText}"`);
                      break;
                    }
                  }
                }
              }
            } catch (e) {
              // Ignore elements that disappeared or threw error
            }
          }
        } catch (err) {
          console.log(`[BMS] Error trying to click date tab: ${err.message}`);
        }

        if (!dateClicked) {
          console.log(`[BMS] Could not find date tab for ${targetDate}, skipping this date.`);
          continue;
        }

        // Wait for the new API response after clicking the date
        await page.waitForTimeout(4000);

        // Parse the captured data for this date
        parseBMSData(dynamicData, staticData, movie.title, targetDate, allResults);
        console.log(`[BMS] Running total after ${targetDate}: ${allResults.length} entries.`);

        // Small delay between date switches
        await page.waitForTimeout(500 + Math.random() * 1000);
      }

      // Random delay between movies
      await page.waitForTimeout(1000 + Math.random() * 2000);
    }

    // Deduplicate (include date in key)
    const seen = new Set();
    const deduped = allResults.filter((entry) => {
      const key = `${entry.cinema}-${entry.movie}-${entry.price}-${entry.seat_category}-${entry.showtime}-${entry.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`\n[BMS] Final results after dedup: ${deduped.length} entries across ${datesToScrape.length} dates.`);
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
    // Show date distribution
    const dateCount = {};
    results.forEach(r => { dateCount[r.date] = (dateCount[r.date] || 0) + 1; });
    console.log('\nEntries per date:', dateCount);
  });
}
