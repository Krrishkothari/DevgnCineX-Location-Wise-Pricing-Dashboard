// BookMyShow scraper — Parallel per-location architecture
// Exports scrapeLocation(locationConfig) for use by the concurrency-limited runner.
// Each location gets its own browser context for full error isolation.

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

function envInt(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Every wait in this file used to be an inline magic number. They're collected
// here so a slow run can be tuned without editing logic.
const NAV_TIMEOUT_MS = envInt('NAV_TIMEOUT_MS', 30000);
const SELECTOR_TIMEOUT_MS = envInt('SELECTOR_TIMEOUT_MS', 15000);
const RESPONSE_TIMEOUT_MS = envInt('RESPONSE_TIMEOUT_MS', 8000);
const SETTLE_MS = envInt('SETTLE_MS', 3000);
const MAX_DISCOVERY_SCROLLS = envInt('MAX_DISCOVERY_SCROLLS', 8);
// Ceilings that stop one bad page from consuming the whole scrape window.
const REGION_LOCK_TIMEOUT_MS = envInt('REGION_LOCK_TIMEOUT_MS', 120000);
const MOVIE_TIMEOUT_MS = envInt('MOVIE_TIMEOUT_MS', 180000);
const LOCATION_TIMEOUT_MS = envInt('LOCATION_TIMEOUT_MS', 900000);

/**
 * Reject if `promise` hasn't settled within `ms`. The underlying work is not
 * cancelled, but the caller stops waiting on it.
 */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Serialise access to a BMS region across locations that share it, so parallel
 * requests to the same region don't trip Cloudflare.
 *
 * The lock is released in a `finally`, so a throw anywhere inside `fn` can no
 * longer strand every other location waiting on that region — and waiting on a
 * predecessor is itself bounded, so a leaked lock degrades to a warning rather
 * than a permanent deadlock.
 */
async function withRegionLock(regionLocks, region, label, fn) {
  if (!regionLocks) return fn();

  const previous = regionLocks.get(region) || Promise.resolve();
  let release;
  const mine = new Promise((resolve) => { release = resolve; });
  regionLocks.set(region, previous.then(() => mine, () => mine));

  try {
    await withTimeout(previous, REGION_LOCK_TIMEOUT_MS, `${label} waiting for region lock '${region}'`);
  } catch (err) {
    console.warn(`${label} ${err.message} — proceeding without it.`);
  }

  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Generate next N days as YYYY-MM-DD strings (IST timezone).
 * ISSUE 3 FIX: Reduced to 4 days.
 */
function getNextDates(count = 4) {
  const dates = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    dates.push(dateStr);
  }
  return dates;
}

function extractCinemaName(venueName) {
  if (!venueName) return 'Unknown';
  return venueName.split(',')[0].trim();
}

// ============================================================
// In-page element search
//
// Locating a date tab or format pill means scanning thousands of candidate
// elements. Doing that with page.$$() + await el.textContent() costs one CDP
// round trip *per element*, which was taking 10-20s per lookup — repeated for
// every date, format and movie. These helpers run the whole scan inside the
// page in a single call and tag the winner with an attribute so Playwright can
// click it directly.
// ============================================================

const CLICK_TAG = 'data-scraper-target';
const CLICK_SELECTOR = `[${CLICK_TAG}]`;

/**
 * Scan the page for the first visible element whose trimmed text satisfies the
 * given criteria, and mark it for clicking. Returns true if one was found.
 *
 * @param {import('playwright').Page} page
 * @param {Object} criteria
 * @param {string[]} [criteria.includesAll] text must contain every one of these
 * @param {string[][]} [criteria.includesAnyGroups] text must satisfy every
 *        group, where a group is satisfied by any one of its members
 * @param {number} [criteria.minLength] text length must be strictly greater
 * @param {number} [criteria.maxLength] text length must be strictly less
 * @param {string} [criteria.containerClassRegex] restrict search to the first
 *        element whose className matches, falling back to the whole document
 */
function markElementByText(page, criteria) {
  return page.evaluate(({ attr, includesAll, includesAnyGroups, minLength, maxLength, containerClassRegex }) => {
    document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));

    let container = null;
    if (containerClassRegex) {
      const regex = new RegExp(containerClassRegex, 'i');
      for (const el of document.querySelectorAll('*')) {
        if (typeof el.className === 'string' && regex.test(el.className)) { container = el; break; }
      }
    }

    const search = (scope) => {
      for (const el of scope.querySelectorAll('div, a, li, button, span')) {
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        if (minLength !== undefined && text.length <= minLength) continue;
        if (maxLength !== undefined && text.length >= maxLength) continue;
        const lower = text.toLowerCase();
        if (includesAll && !includesAll.every((t) => lower.includes(t.toLowerCase()))) continue;
        if (includesAnyGroups && !includesAnyGroups.every(
          (group) => group.some((t) => lower.includes(t.toLowerCase()))
        )) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 10 || rect.height <= 10) continue;
        el.setAttribute(attr, '1');
        return true;
      }
      return false;
    };

    // Prefer the scoped container, but fall back to the full document the way
    // the original per-element scan did.
    if (container && search(container)) return true;
    return search(document);
  }, { attr: CLICK_TAG, ...criteria });
}

/** Click the element previously marked by markElementByText. */
async function clickMarkedElement(page, timeout = 5000) {
  await page.click(CLICK_SELECTOR, { timeout });
}

// ============================================================
// Lookup helpers — parameterized per-location
// ============================================================

function buildLookups(cinemaTargets) {
  const codeToTarget = {};
  cinemaTargets.forEach(t => { codeToTarget[t.bmsCode] = t; });
  return { codeToTarget, cinemaTargets };
}

function matchVenueToTarget(venueName, venueCode, lookups) {
  if (!venueName) return null;
  if (venueCode) {
    const cleanCode = venueCode.trim().toUpperCase();
    if (lookups.codeToTarget[cleanCode]) return lookups.codeToTarget[cleanCode];
  }
  const lowerVenue = venueName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const target of lookups.cinemaTargets) {
    const targetNorm = target.cinemaName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lowerVenue.includes(targetNorm) || targetNorm.includes(lowerVenue)) return target;
    const slugNorm = target.bmsSlug.replace(/-/g, '');
    if (lowerVenue.includes(slugNorm.substring(0, 15))) return target;
  }
  return null;
}



// ============================================================
// scrapeLocation — Core function: scrapes one business location
// ============================================================

async function scrapeLocation(locationConfig, regionLocks, sharedBrowser = null, handle = null) {
  const { locationName, cinemas } = locationConfig;
  const logPrefix = `[BMS:${locationName}]`;
  let browser = sharedBrowser;
  let context = null;

  const cinemaTargets = cinemas.map(c => ({
    location: locationName, cinemaName: c.cinemaName, bmsRegion: c.bmsRegion, bmsSlug: c.bmsSlug, bmsCode: c.bmsCode, isOwned: c.isOwned
  }));
  const lookups = buildLookups(cinemaTargets);

  try {
    console.log(`${logPrefix} Tracking ${cinemaTargets.length} cinema(s)`);

    if (!browser) {
      console.log(`${logPrefix} Launching dedicated browser...`);
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
    } else {
      console.log(`${logPrefix} Using shared browser instance.`);
    }

    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1'
      }
    });
    // Published so the timeout wrapper can tear this down. A timeout only stops
    // the caller waiting — without this the abandoned location kept driving
    // pages on the shared browser for the rest of the run.
    if (handle) handle.context = context;

    const datesToScrape = getNextDates(4);
    const regionSet = [...new Set(cinemaTargets.map(t => t.bmsRegion))];

    const regionPromises = regionSet.map(async (region) => {
      const regionLogPrefix = `${logPrefix}[${region}]`;
      const targetsInRegion = cinemaTargets.filter(t => t.bmsRegion === region);
      const regionEntryCounts = {};
      targetsInRegion.forEach(t => regionEntryCounts[t.cinemaName] = 0);
      const regionEntries = [];

      const page = await context.newPage();
      const movieLinks = [];
      const seenEventCodes = new Set();

      const addMovie = (href, title, { requireCitySegment = false } = {}) => {
        if (!href || href.includes('/explore/') || href.includes('/genre/')) return;

        // Every real movie URL carries an ET event code.
        const eventCode = href.match(/\/(ET\d+)/)?.[1];
        if (!eventCode) return;

        // A cinema page mixes two kinds of link:
        //   /movies/<city>/<slug>/ET…  → actually showing at this venue
        //   /movies/<slug>/ET…         → a "recommended for you" carousel
        // The old code queued both. At Devgn Cinex Bhuj that meant 3 real
        // movies and 30 recommendations, each costing a full page load, format
        // modal and four date clicks before yielding no matching venue.
        if (requireCitySegment && !/^\/movies\/[^/]+\/[^/]+\/ET\d+/.test(href)) return;

        // Dedupe on the event code: the same film can appear under several URL
        // forms, while genuinely distinct versions (e.g. a Hindi dub) carry
        // their own code and are correctly kept.
        if (seenEventCodes.has(eventCode)) return;
        seenEventCodes.add(eventCode);

        if (!title) {
          const parts = href.split('/').filter(Boolean);
          const slug = parts[parts.length - 2] || parts[parts.length - 1] || '';
          title = slug.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        }
        movieLinks.push({ title, href });
      };

      try {
        // ---- Primary discovery: only the cinemas we actually track ----
        // The region /explore/ page lists every film showing in the city, and
        // the old code queued all of them. In a region like NCR that meant 60+
        // movies, most playing at none of our venues — each still cost a page
        // load, a format modal and four date clicks to yield nothing. Asking
        // each tracked cinema what it is showing cuts the work several-fold and
        // skips the slow infinite-scroll entirely.
        for (const target of targetsInRegion) {
          if (!target.bmsSlug || !target.bmsCode) continue;
          const cinemaUrl = `https://in.bookmyshow.com/buytickets/${target.bmsSlug}/cinema-${target.bmsRegion}-${target.bmsCode}-MT/`;
          try {
            await page.goto(cinemaUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
            await page.waitForTimeout(SETTLE_MS);
            const cinemaMovies = await page.evaluate(() =>
              Array.from(document.querySelectorAll('a[href*="/movies/"]')).map((a) => ({
                href: a.getAttribute('href'),
                title: a.querySelector('img')?.alt?.trim() || '',
              }))
            );
            const before = movieLinks.length;
            for (const m of cinemaMovies) {
              addMovie(m.href, m.title && m.title.length < 80 ? m.title : '', { requireCitySegment: true });
            }
            console.log(
              `${regionLogPrefix} ${target.cinemaName}: ${movieLinks.length - before} showing ` +
              `(from ${cinemaMovies.length} links on page)`
            );
          } catch (err) {
            console.warn(`${regionLogPrefix} Cinema discovery failed for ${target.cinemaName}: ${err.message}`);
          }
        }
        console.log(`${regionLogPrefix} Discovered ${movieLinks.length} movie(s) across ${targetsInRegion.length} tracked cinema(s).`);

        // ---- Fallback: region-wide explore page ----
        // Only used when no cinema page yielded anything, so the expensive
        // scroll is off the normal path.
        if (movieLinks.length === 0) {
          console.log(`${regionLogPrefix} No movies from cinema pages; falling back to the region explore page.`);
          const exploreUrl = `https://in.bookmyshow.com/explore/movies-${region}`;
          const exploreLinks = await withRegionLock(regionLocks, region, regionLogPrefix, async () => {
            await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
            try {
              await page.waitForSelector('a[href*="/movies/"]', { timeout: SELECTOR_TIMEOUT_MS });
            } catch (err) {
              console.warn(`${regionLogPrefix} Explore page never rendered movie cards: ${err.message}`);
            }
            await page.waitForTimeout(SETTLE_MS);

            return page.evaluate(async (maxScrolls) => {
              const getCards = () => Array.from(document.querySelectorAll('a[href*="/movies/"]'));
              let previousCount = 0;
              let stableAttempts = 0;
              for (let i = 0; i < maxScrolls; i++) {
                window.scrollBy(0, document.body.scrollHeight);
                await new Promise((r) => setTimeout(r, 1200));
                const currentCount = getCards().length;
                if (currentCount === previousCount) {
                  stableAttempts++;
                  if (stableAttempts >= 2) break;
                } else {
                  stableAttempts = 0;
                }
                previousCount = currentCount;
              }
              return getCards().map((card) => ({
                href: card.getAttribute('href'),
                title: card.querySelector('img')?.alt?.trim() || '',
              }));
            }, MAX_DISCOVERY_SCROLLS);
          }).catch((err) => {
            console.error(`${regionLogPrefix} Explore fallback failed: ${err.message}`);
            return [];
          });

          for (const m of exploreLinks) addMovie(m.href, m.title && m.title.length < 80 ? m.title : '');
        }
      } finally {
        // Always release the discovery page, including on the error paths that
        // previously leaked it.
        await page.close().catch(() => {});
      }

      if (movieLinks.length === 0) {
        console.error(`${regionLogPrefix} No movies discovered at all — skipping region.`);
        return { entries: [], counts: regionEntryCounts };
      }

      const moviesToScrape = movieLinks;
      const scrapeStartTime = Date.now();

      // MOVIE-LEVEL CONCURRENCY: Chunk into batches of 3
      const movieChunks = [];
      const CHUNK_SIZE = 3;
      for (let i = 0; i < moviesToScrape.length; i += CHUNK_SIZE) {
        movieChunks.push(moviesToScrape.slice(i, i + CHUNK_SIZE));
      }

      const emptyCounts = () => {
        const counts = {};
        targetsInRegion.forEach((t) => { counts[t.cinemaName] = 0; });
        return counts;
      };

      /**
       * Build the dated showtimes URL for a movie.
       * `/movies/<city>/<slug>/ET123` -> `/movies/<city>/<slug>/buytickets/ET123/YYYYMMDD`
       */
      function buildShowtimesUrl(href, dateStr) {
        const match = href.match(/^(.*)\/(ET\d+)\/?$/);
        if (!match) return null;
        const path = match[1].startsWith('http') ? match[1] : `https://in.bookmyshow.com${match[1]}`;
        return `${path}/buytickets/${match[2]}/${dateStr.replace(/-/g, '')}`;
      }

      /**
       * Scrape one movie across every target date.
       *
       * BookMyShow server-renders the showtimes payload into
       * window.__INITIAL_STATE__.showtimesByEvent for a dated URL — the exact
       * shape parseBMSData already consumes. Reading it directly replaces the
       * old flow of: load movie page, click "Book tickets", dismiss the age
       * gate, pick a format from a modal, then hunt the DOM for each date tab
       * and race an XHR. That dance was slow, and two of its steps were also
       * unreliable — the date tabs were not clickable at all, so days 3 and 4
       * silently returned nothing.
       */
      async function scrapeMovie(movie, movieIdx, localEntryCounts) {
        const movieResults = [];

        if (saveProgress) {
          saveProgress({
            current: movieIdx + 1,
            completed: movieIdx,
            total: moviesToScrape.length,
            movie: movie.title,
            startTime: scrapeStartTime,
          });
        }

        console.log(`${regionLogPrefix} --- ${movie.title} ---`);

        const mPage = await context.newPage();
        try {
          // Only the HTML carries the state we need.
          await mPage.route('**/*', (route) =>
            ['image', 'font', 'stylesheet', 'media'].includes(route.request().resourceType())
              ? route.abort()
              : route.continue()
          );

          for (let dateIdx = 0; dateIdx < datesToScrape.length; dateIdx++) {
            const targetDate = datesToScrape[dateIdx];
            const isFirstDate = dateIdx === 0;

            const url = buildShowtimesUrl(movie.href, targetDate);
            if (!url) {
              console.warn(`${regionLogPrefix}   Could not build URL for ${movie.title} (${movie.href})`);
              break;
            }

            const wantCode = targetDate.replace(/-/g, '');
            let apiResults = null;

            const maxAttempts = isFirstDate ? 2 : 1;

            for (let attempt = 1; attempt <= maxAttempts && !apiResults; attempt++) {
              try {
                if (attempt === 2) {
                  await mPage.goto('about:blank', { timeout: NAV_TIMEOUT_MS });
                }
                await mPage.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

                const eventCode = url.match(/\/buytickets\/(ET\d+)\//)?.[1] || movie.href.match(/\/(ET\d+)\/?$/)?.[1];
                if (!eventCode) throw new Error("Could not extract eventCode");

                apiResults = await mPage.evaluate(async ({ eventCode, dateCode, cinemas }) => {
                  const results = [];
                  for (const cinema of cinemas) {
                    const apiUrl = `/api/movies-data/seatlayout/v1/primary?eventCode=${eventCode}&dateCode=${dateCode}&venueCode=${cinema.bmsCode}`;
                    try {
                      const resp = await fetch(apiUrl);
                      if (resp.ok) {
                        const data = await resp.json();
                        if (data && data.data && data.data.showTimes && data.data.showTimes.length > 0) {
                          results.push({ target: cinema, data: data.data });
                        }
                      }
                    } catch (e) {}
                  }
                  return results.length > 0 ? results : null;
                }, { eventCode, dateCode: wantCode, cinemas: targetsInRegion });

                if (!apiResults && attempt < maxAttempts) await mPage.waitForTimeout(SETTLE_MS);
              } catch (err) {
                if (attempt === maxAttempts) {
                  console.warn(`${regionLogPrefix}   ${movie.title} ${targetDate}: ${err.message}`);
                }
              }
            }

            if (!apiResults) {
              console.log(
                `${regionLogPrefix}   ${movie.title}: no showtimes from ${targetDate} — skipping remaining dates.`
              );
              break;
            }

            const before = movieResults.length;
            
            for (const { target, data } of apiResults) {
               const eventFormat = data.eventData?.eventDimension || '2D';
               const eventLanguage = data.eventData?.eventLang || '';
               
               for (const st of data.showTimes) {
                  const showTime = st.showTime || st.title || '';
                  const categories = st.categories || [];
                  for (const cat of categories) {
                    const price = parseFloat(cat.curPrice) || 0;
                    const seatCategory = cat.priceDesc || 'Standard';
                    if (price > 0) {
                      try {
                        const raw = { cinema: target.cinemaName, location: target.location, movie: movie.title, format: eventFormat, language: eventLanguage, price: price, seat_category: seatCategory, showtime: showTime, date: targetDate };
                        const entry = normalizePrice(raw, target.cinemaName);
                        validateSchema(entry);
                        movieResults.push(entry);
                        if (localEntryCounts[target.cinemaName] !== undefined) localEntryCounts[target.cinemaName]++;
                      } catch (err) {}
                    }
                  }
               }
            }
            
            console.log(`${regionLogPrefix}   ${movie.title} ${targetDate}: +${movieResults.length - before} entries`);

            // Small pause between requests to stay polite to BMS.
            await mPage.waitForTimeout(800 + Math.random() * 1200);
          }

          let deduped = [];
          if (movieResults.length > 0) {
            const seen = new Set();
            deduped = movieResults.filter((entry) => {
              const key = `${entry.cinema}-${entry.location}-${entry.movie}-${entry.price}-${entry.seat_category}-${entry.showtime}-${entry.date}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            try {
              // Merges in memory and schedules a batched flush; this no longer
              // re-serialises the whole dataset on every movie.
              await savePrices(deduped);
              console.log(`${regionLogPrefix}   -> Merged ${deduped.length} entries for ${movie.title}.`);
            } catch (err) {
              // Previously swallowed, so a failing write looked like a success.
              console.error(`${regionLogPrefix}   Failed to store entries for ${movie.title}: ${err.message}`);
            }
          }

          return { entries: deduped, counts: localEntryCounts };
        } finally {
          await mPage.close().catch(() => {});
        }
      }

      let globalMovieIdx = 0;
      for (const chunk of movieChunks) {
        const chunkPromises = chunk.map((movie, localIdx) => {
          // A single movie can no longer consume the entire scrape window: if it
          // overruns we abandon it and move on, rather than letting one hung
          // page hold up the location (and, with the hourly cron, the next run).
          return withTimeout(
            scrapeMovie(movie, globalMovieIdx + localIdx, emptyCounts()),
            MOVIE_TIMEOUT_MS,
            `${regionLogPrefix} ${movie.title}`
          ).catch((err) => {
            console.error(`${regionLogPrefix} Abandoning ${movie.title}: ${err.message}`);
            return { entries: [], counts: emptyCounts() };
          });
        });

        // Wait for batch to finish
        const chunkResults = await Promise.allSettled(chunkPromises);
        for (const res of chunkResults) {
          if (res.status === 'fulfilled') {
            regionEntries.push(...res.value.entries);
            for (const [cName, cCount] of Object.entries(res.value.counts)) {
              regionEntryCounts[cName] += cCount;
            }
          }
        }
        globalMovieIdx += chunk.length;
      }
      return { entries: regionEntries, counts: regionEntryCounts };
    });

    const allRegionResults = await Promise.allSettled(regionPromises);

    let locationTotalEntries = 0;
    const allLocationEntries = [];
    const failedRegions = [];
    const cinemaEntryCounts = {};
    cinemaTargets.forEach(t => cinemaEntryCounts[t.cinemaName] = 0);

    for (let i = 0; i < allRegionResults.length; i++) {
      const result = allRegionResults[i];
      if (result.status === 'fulfilled') {
        const { entries, counts } = result.value;
        allLocationEntries.push(...entries);
        locationTotalEntries += entries.length;
        for (const [cinemaName, count] of Object.entries(counts)) {
          if (cinemaEntryCounts[cinemaName] !== undefined) cinemaEntryCounts[cinemaName] += count;
        }
      } else {
        // A rejected region used to be dropped silently and the location still
        // reported success, so a region-wide outage looked like "0 entries".
        const region = regionSet[i];
        failedRegions.push(region);
        console.error(`${logPrefix} Region '${region}' failed: ${result.reason?.message || result.reason}`);
      }
    }

    console.log(`\n${logPrefix} ===== LOCATION SCRAPE COMPLETE =====`);
    console.log(`${logPrefix} Final: ${locationTotalEntries} entries from ${locationName}`);
    for (const [cinemaName, count] of Object.entries(cinemaEntryCounts)) {
      console.log(`${logPrefix}   -> ${cinemaName}: ${count} prices scraped`);
      if (count === 0) console.error(`${logPrefix} [ALERT] ZERO MOVIES scraped for cinema: ${cinemaName}`);
    }

    // A location that scraped nothing is a failure, not a success. Reporting
    // it as OK hid real outages: a Cloudflare block looks exactly like a quiet
    // day in the summary otherwise.
    const scrapedNothing = allLocationEntries.length === 0;
    const regionsAllFailed = failedRegions.length >= regionSet.length;

    let error;
    if (failedRegions.length) error = `Regions failed: ${failedRegions.join(', ')}`;
    else if (scrapedNothing) error = 'No entries scraped (site block or no listings)';

    return {
      locationName,
      success: !regionsAllFailed && !scrapedNothing,
      entryCount: allLocationEntries.length,
      entries: allLocationEntries,
      failedRegions,
      error,
    };

  } catch (err) {
    console.error(`${logPrefix} Scraper error:`, err);
    return { locationName, success: false, entryCount: 0, entries: [], error: err.message };
  } finally {
    // Explicitly close the context safely for this location
    if (context) {
      try {
        await context.close();
        console.log(`${logPrefix} Context closed.`);
      } catch(e) {
        console.error(`${logPrefix} Error closing context:`, e.message);
      }
    }
    // Only close browser if we launched it ourselves (i.e. not shared)
    if (browser && !sharedBrowser) {
      try {
        await browser.close();
        console.log(`${logPrefix} Browser closed.`);
      } catch(e) {}
    }
  }
}

/**
 * Public entry point. Bounds the whole location so that a pathological run
 * can't outlive the hourly scrape window and collide with the next one.
 */
async function scrapeLocationWithTimeout(locationConfig, regionLocks, sharedBrowser = null) {
  const { locationName } = locationConfig;
  const handle = { context: null };

  try {
    return await withTimeout(
      scrapeLocation(locationConfig, regionLocks, sharedBrowser, handle),
      LOCATION_TIMEOUT_MS,
      `[BMS:${locationName}] location scrape`
    );
  } catch (err) {
    console.error(`[BMS:${locationName}] ${err.message}`);
    // Actually cancel the abandoned work. Closing the context fails every
    // in-flight page operation, so the orphaned location stops competing for
    // the shared browser instead of running on until the process exits.
    if (handle.context) {
      await handle.context.close().catch(() => {});
      console.error(`[BMS:${locationName}] Context force-closed after timeout.`);
    }
    return { locationName, success: false, entryCount: 0, entries: [], error: err.message };
  }
}

module.exports = { scrapeLocation: scrapeLocationWithTimeout, scrapeLocationUnbounded: scrapeLocation };
