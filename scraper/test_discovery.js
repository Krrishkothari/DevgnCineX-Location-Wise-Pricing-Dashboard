const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.route('**/*', (route) => {
    if (['image', 'font', 'stylesheet', 'media'].includes(route.request().resourceType())) route.abort();
    else route.continue();
  });
  
  const cinemaUrl = "https://in.bookmyshow.com/buytickets/inox-aipl-joy-street-gurgaon-gurugram/cinema-national-capital-region-ncr-IAJS-MT/";
  console.log(`Navigating to ${cinemaUrl}`);
  
  try {
    await page.goto(cinemaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const cinemaMovies = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/movies/"]'))
        .map(a => a.getAttribute('href'))
        .filter(h => h && !h.includes('/explore/') && !h.includes('/genre/'));
    });
    console.log("Movies found at INOX AIPL:", cinemaMovies);
  } catch (err) {
    console.error("Error:", err);
  }
  
  await browser.close();
})();
