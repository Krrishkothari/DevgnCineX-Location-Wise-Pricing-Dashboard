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
const { normalizePrice, validateSchema } = require('../../normalize');
const { savePrices, saveProgress } = require('../../db');

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
 * ISSUE 3 FIX: Reduced from 7 to 5 days. BMS generally doesn't show pricing beyond 4-5 days 
 * and requires sliding arrows for further dates. Capping at 5 prevents 8-second timeout wastes.
 */
function getNextDates(count = 5) {
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
  if (venueCode) {
    const cleanCode = venueCode.trim().toUpperCase();
    if (lookups.codeToTarget[cleanCode]) {
      return lookups.codeToTarget[cleanCode];
    }
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
function parseBMSData(dynamicData, staticData, movieTitle, dateStr, allResults, lookups, logPrefix, cinemaEntryCounts, selectedFormat = null) {
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

  let eventFormat = selectedFormat || '2D';
  let eventLanguage = '';
  if (staticData?.data?.eventData?.childEvents?.length > 0) {
    if (!selectedFormat) {
      eventFormat = staticData.data.eventData.childEvents[0].eventDimension || '2D';
    }
    eventLanguage = staticData.data.eventData.childEvents[0].eventLanguage || '';
  }

  const groupList = dynamicData.data.showtimeWidgets.find(w => w.type === 'groupList');
  if (!groupList?.data) return;

  let matchedCount = 0;
  const seenVenues = [];

  for (const group of groupList.data) {
    if (group.type !== 'venue' && group.type !== 'venueGroup') continue;
    const venues = group.data || [];
    for (const venue of venues) {
      const venueName = venue.additionalData?.venueName || '';
      const venueCode = venue.additionalData?.venueCode || '';
      
      if (venueName) seenVenues.push(venueName);

      // STRICT FILTER: only keep venues that match this location's targets
      const target = matchVenueToTarget(venueName, venueCode, lookups);
      if (!target) {
        // Venue is not in our target list, safely ignore it.
        continue;
      }
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
              // FIX 4 — Track per-cinema entry counts incrementally
              if (cinemaEntryCounts[target.cinemaName] !== undefined) {
                cinemaEntryCounts[target.cinemaName]++;
              }
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
  } else if (seenVenues.length > 0) {
    console.log(`${logPrefix}   [API DEBUG] ${movieTitle} returned ${seenVenues.length} venues, but none matched our targets. Sample: ${seenVenues.slice(0, 3).join(', ')}`);
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
  
  // FIX 4 — Track per-cinema entry counts incrementally
  const cinemaEntryCounts = {};
  cinemaTargets.forEach(t => cinemaEntryCounts[t.cinemaName] = 0);

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
        // ISSUE 1 FIX: Removed primary-dynamic listener to prevent race condition
        if (url.includes('showtimes-by-event/primary-static')) {
          staticData = await response.json();
        }
      } catch (e) { }
    });

    // ISSUE 3 FIX: We now request 5 days instead of 7 to avoid timeouts on unlisted dates
    const datesToScrape = getNextDates(5);
    console.log(`${logPrefix} Will scrape ${datesToScrape.length} dates (intentional platform limit): ${datesToScrape.join(', ')}`);

    let locationTotalEntries = 0;

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
      const discoverResult = await page.evaluate(async () => {
        const getCards = () => Array.from(document.querySelectorAll('a[href*="/movies/"]'));
        
        let previousCount = 0;
        let stableAttempts = 0;
        const maxScrolls = 20; // Hard limit to avoid infinite loops
        let finalScrollCount = 0;
        
        for (let i = 0; i < maxScrolls; i++) {
          finalScrollCount = i + 1;
          window.scrollBy(0, document.body.scrollHeight);
          
          // Wait for lazy loading
          await new Promise(r => setTimeout(r, 2000));
          
          const currentCount = getCards().length;
          
          if (currentCount === previousCount) {
            stableAttempts++;
            if (stableAttempts >= 3) {
              break; // Stabilized across 3 attempts
            }
          } else {
            stableAttempts = 0; // Reset if we found new movies
          }
          previousCount = currentCount;
        }

        const cards = getCards();
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
        return { links: results, finalScrollCount, stableAttempts };
      });

      console.log(`${logPrefix} Region explore scroll finished: ${discoverResult.finalScrollCount} scrolls, ${discoverResult.stableAttempts} stable attempts.`);
      let movieLinks = discoverResult.links;
      console.log(`${logPrefix} Found ${movieLinks.length} movies on region explore page.`);

      // ---- FALLBACK DISCOVERY: Check each cinema page directly ----
      console.log(`${logPrefix} Starting fallback discovery on individual cinema pages...`);
      for (const target of targetsInRegion) {
        if (!target.bmsSlug || !target.bmsCode) continue;
        const cinemaUrl = `https://in.bookmyshow.com/buytickets/${target.bmsSlug}-${target.location.toLowerCase()}/cinema-${target.bmsRegion}-${target.bmsCode}-MT/`;
        console.log(`${logPrefix}   Checking ${target.cinemaName} at ${cinemaUrl}`);
        
        try {
          await page.goto(cinemaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);
          
          const cinemaMovies = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href*="/movies/"]'))
              .map(a => a.getAttribute('href'))
              .filter(h => h && !h.includes('/explore/') && !h.includes('/genre/'));
          });
          
          let added = 0;
          for (const href of cinemaMovies) {
            if (!movieLinks.some(m => m.href === href)) {
              // Extract title from URL as fallback
              const urlParts = href.split('/');
              const slugTitle = urlParts[urlParts.length - 2] || urlParts[urlParts.length - 1];
              const title = slugTitle.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              movieLinks.push({ title, href });
              added++;
            }
          }
          if (added > 0) console.log(`${logPrefix}   -> Added ${added} new movies from ${target.cinemaName} page.`);
        } catch(err) {
          console.log(`${logPrefix}   Failed to load cinema page for ${target.cinemaName}: ${err.message}`);
        }
      }
      
      console.log(`${logPrefix} Total unique movies to scrape after fallback: ${movieLinks.length}`);
      if (movieLinks.length === 0) continue;

      // Scrape all discovered movies
      const moviesToScrape = movieLinks;
      let firstMovieFirstDateChecked = false;
      const scrapeStartTime = Date.now();

      for (let movieIdx = 0; movieIdx < moviesToScrape.length; movieIdx++) {
        const movie = moviesToScrape[movieIdx];
        const movieResults = [];
        if (saveProgress) {
          saveProgress({
            current: movieIdx + 1,
            completed: movieIdx,
            total: moviesToScrape.length,
            movie: movie.title,
            startTime: scrapeStartTime
          });
        }
        
        const movieUrl = movie.href.startsWith('http') ? movie.href : `https://in.bookmyshow.com${movie.href}`;
        console.log(`\n${logPrefix} --- ${movie.title} (${region}) ---`);

        
        let formatsToScrape = [null]; // Default if no modal
        let formatDiscoveryDone = false;

        // Visit movie page and wait dynamically for "Book tickets" with a single retry loop
        for (let attempt = 1; attempt <= 2; attempt++) {
          if (attempt === 2) console.log(`${logPrefix}   [RETRY] Attempt 2 for ${movie.title}. Reloading...`);

          try {
            await page.goto(movieUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForSelector('button:has-text("Book tickets"):visible, a:has-text("Book tickets"):visible', { timeout: 15000 });
          } catch (err) {
            console.log(`${logPrefix}   Failed to load movie page or find book button: ${err.message}`);
            if (attempt === 1) continue; else break;
          }

          const bookBtns = await page.$$('button:has-text("Book tickets"):visible, a:has-text("Book tickets"):visible');
          if (bookBtns.length === 0) {
            console.log(`${logPrefix}   No "Book tickets" button, skipping.`);
            if (attempt === 1) continue; else break;
          }

          console.log(`${logPrefix}   Clicking "Book tickets" (Format Discovery)...`);
          await page.waitForTimeout(1500); 

          try {
            for (const btn of bookBtns) {
              try { await btn.click({ delay: 50, timeout: 3000 }); break; } catch (e) {}
            }
            
            // Wait for potential modal
            try {
              await page.waitForSelector('h5:has-text("Select language and format"), h4:has-text("Select language and format"), [role="dialog"], section:has-text("Select language")', { timeout: 3000, state: 'visible' });
              
              // Extract all formats
              const formatLocators = await page.$$('ul li section div[role="button"] span');
              if (formatLocators.length > 0) {
                const detectedFormats = [];
                for (const loc of formatLocators) {
                  const text = await loc.innerText();
                  if (text && text.trim().length > 0) detectedFormats.push(text.trim());
                }
                const uniqueFormats = [...new Set(detectedFormats)];
                if (uniqueFormats.length > 0) {
                  formatsToScrape = uniqueFormats;
                  console.log(`${logPrefix}   Found ${formatsToScrape.length} formats for ${movie.title}: [${formatsToScrape.join(', ')}]`);
                }
              }
            } catch (modalErr) {
              // No modal found
            }
            
            formatDiscoveryDone = true;
            break;
          } catch (e) {
            console.log(`${logPrefix}   ${movie.title} Error during format discovery: ${e.message}`);
          }
        }

        if (!formatDiscoveryDone) {
          console.log(`${logPrefix}   Giving up on ${movie.title} after 2 attempts.`);
          continue; 
        }

        // Now iterate through all discovered formats
        for (let formatIdx = 0; formatIdx < formatsToScrape.length; formatIdx++) {
          const currentFormat = formatsToScrape[formatIdx];
          
          if (formatsToScrape.length > 1) {
            console.log(`\n${logPrefix}   --- Scraping format: ${currentFormat} ---`);
          }

          // If it's not the first format, we need to reload the movie page and re-click "Book tickets" to bring up the modal again
          if (formatIdx > 0) {
            try {
              await page.goto(movieUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await page.waitForSelector('button:has-text("Book tickets"):visible, a:has-text("Book tickets"):visible', { timeout: 15000 });
              const bookBtns = await page.$$('button:has-text("Book tickets"):visible, a:has-text("Book tickets"):visible');
              if (bookBtns.length > 0) {
                await page.waitForTimeout(1500);
                for (const btn of bookBtns) {
                  try { await btn.click({ delay: 50, timeout: 3000 }); break; } catch (e) {}
                }
              }
            } catch (e) {
              console.log(`${logPrefix}   Failed to reload for format ${currentFormat}: ${e.message}`);
              continue;
            }
          }

          dynamicData = null;
          staticData = null;

          try {
            const responsePromise = page.waitForResponse(response => response.url().includes('primary-dynamic'), { timeout: 15000 });
            
            // Age verification modal handling
            try {
              const continueBtn = await page.waitForSelector('button:has-text("Accept"), button:has-text("Continue"), [role="button"]:has-text("Accept"), [role="button"]:has-text("Continue"), [aria-label="Continue"]', { timeout: 2000, state: 'visible' });
              if (continueBtn) {
                console.log(`${logPrefix}   Age verification modal detected. Clicking Continue...`);
                await continueBtn.click();
              }
            } catch (ageErr) {}

            // Click the specific format pill if one is defined
            if (currentFormat) {
              try {
                // Find exact format pill
                const formatBtn = await page.waitForSelector(`ul li section div[role="button"]:has(span:text-is("${currentFormat}")), span:text-is("${currentFormat}"), div:text-is("${currentFormat}")`, { timeout: 3000, state: 'visible' });
                if (formatBtn) {
                  await formatBtn.click();
                }
              } catch (modalErr) {
                console.log(`${logPrefix}   Could not find/click format pill for ${currentFormat}`);
              }
            } else {
              // Fallback logic for single format (just click the first available if a modal happens to exist)
              try {
                const allFormats = await page.$$('span:text-is("2D"), div:text-is("2D"), span:text-is("3D"), div:text-is("3D")');
                for (const el of allFormats) {
                  if (await el.isVisible()) {
                    await el.click();
                    break;
                  }
                }
              } catch (e) {}
            }

            const dynResponse = await responsePromise;
            dynamicData = await dynResponse.json();
          } catch (e) {
            console.log(`${logPrefix}   ${movie.title} [${currentFormat || 'Default'}] No dynamic data response within 15s (error: ${e.message})`);
            continue; // Move on to next format
          }

          if (!dynamicData) continue;

          // Parse today's data (first date)
          const scrapedDates = new Set();
          const beforeToday = movieResults.length;
          const effectiveDate = parseBMSData(dynamicData, staticData, movie.title, datesToScrape[0], movieResults, lookups, logPrefix, cinemaEntryCounts, currentFormat);
          if (effectiveDate) scrapedDates.add(effectiveDate);
          console.log(`${logPrefix}   [${currentFormat || 'Default'}] ${datesToScrape[0]}: +${movieResults.length - beforeToday} entries`);

          // ---- Click through remaining date tabs ----
          for (let dateIdx = 1; dateIdx < datesToScrape.length; dateIdx++) {
            const targetDate = datesToScrape[dateIdx];

            if (scrapedDates.has(targetDate)) {
              console.log(`${logPrefix}   [${currentFormat || 'Default'}] ${targetDate}: already scraped via redirect, skipping.`);
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

              let possibleTabs = [];
              
              const containerHandle = await page.evaluateHandle(() => {
                const regex = /(^|[\s_-])date([\s_-]|[A-Z]|$)/i;
                const elements = document.querySelectorAll('*');
                for (const el of elements) {
                  if (typeof el.className === 'string' && regex.test(el.className)) {
                    return el;
                  }
                }
                return null;
              });
              const container = containerHandle.asElement();
              
              if (container) {
                possibleTabs = await container.$$('div, a, li, button, span');
                if (possibleTabs.length === 0) {
                  possibleTabs = await page.$$('div, a, li, button, span');
                }
              } else {
                possibleTabs = await page.$$('div, a, li, button, span');
              }

              for (const tab of possibleTabs) {
                try {
                  const text = await tab.textContent();
                  const cleanText = text.trim().replace(/\s+/g, ' ').toLowerCase();
                  if (cleanText.length > 3 && cleanText.length < 25) {
                    if (cleanText.includes(dayNum) || cleanText.includes(dayNumNoZero)) {
                      if (cleanText.includes(month.toLowerCase()) || cleanText.includes(dayName.toLowerCase())) {
                        const box = await tab.boundingBox();
                        if (box && box.width > 10 && box.height > 10) {
                          const responsePromise = page.waitForResponse(response => response.url().includes('primary-dynamic'), { timeout: 8000 });
                          await tab.click();
                          try {
                            const dynResponse = await responsePromise;
                            dynamicData = await dynResponse.json();
                          } catch(e) {
                            console.log(`${logPrefix}   ${movie.title} [${currentFormat || 'Default'}] No dynamic data response within 8s`);
                          }
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
              console.log(`${logPrefix}   [${currentFormat || 'Default'}] ${targetDate}: could not find date tab, skipping.`);
              continue;
            }

            const beforeDate = movieResults.length;
            const effectiveDateLoop = parseBMSData(dynamicData, staticData, movie.title, targetDate, movieResults, lookups, logPrefix, cinemaEntryCounts, currentFormat);
            if (effectiveDateLoop) scrapedDates.add(effectiveDateLoop);
            console.log(`${logPrefix}   [${currentFormat || 'Default'}] ${targetDate}: +${movieResults.length - beforeDate} entries`);

            await page.waitForTimeout(500 + Math.random() * 1000);
          }
        } // End format loop

        if (movieResults.length > 0) {
          try {
            // Deduplicate before saving incrementally
            const seen = new Set();
            const deduped = movieResults.filter((entry) => {
              const key = `${entry.cinema}-${entry.location}-${entry.movie}-${entry.price}-${entry.seat_category}-${entry.showtime}-${entry.date}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            await savePrices(deduped);
            locationTotalEntries += deduped.length;
            console.log(`${logPrefix}   -> Saved ${deduped.length} entries for ${movie.title}.`);
          } catch (err) {
            console.error(`${logPrefix}   -> Failed to save for ${movie.title}:`, err.message);
          }
        }

        await page.waitForTimeout(1000 + Math.random() * 2000);
      }
      
    }

    console.log(`\n${logPrefix} ===== LOCATION SCRAPE COMPLETE =====`);
    console.log(`${logPrefix} Final: ${locationTotalEntries} entries from ${locationName}`);

    // Check for zero-movie cinemas using the running tally
    for (const [cinemaName, count] of Object.entries(cinemaEntryCounts)) {
      console.log(`${logPrefix}   -> ${cinemaName}: ${count} prices scraped`);
      if (count === 0) {
        console.error(`${logPrefix} [ALERT] ZERO MOVIES scraped for cinema: ${cinemaName}`);
      }
    }

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
