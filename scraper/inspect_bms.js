const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  const page = await context.newPage();

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('showtimes-by-event/primary-dynamic')) {
      try {
        const dynamicData = await response.json();
        const groupList = dynamicData.data.showtimeWidgets.find(w => w.type === 'groupList');
        if (groupList?.data) {
          for (const group of groupList.data) {
            if (group.type !== 'venue' && group.type !== 'venueGroup') continue;
            for (const venue of group.data || []) {
              if (venue.showtimes && venue.showtimes.length > 0) {
                 const capturedShowtime = venue.showtimes[0];
                 fs.writeFileSync('bms_showtime_sample.json', JSON.stringify(capturedShowtime, null, 2));
                 console.log("Found showtime data! Wrote to bms_showtime_sample.json");
                 process.exit(0);
              }
            }
          }
        }
      } catch (e) { }
    }
  });

  console.log("Navigating...");
  await page.goto('https://in.bookmyshow.com/movies/mumbai/dhamaal-4/ET00452553', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Close modals
  try {
    await page.evaluate(() => {
      const closeBtn = document.querySelector('#bottomSheet-model-close') || document.querySelector('[data-testid="modalClose"]');
      if (closeBtn) closeBtn.click();
    });
  } catch(e) {}
  await page.waitForTimeout(1000);

  const bookBtn = await page.$('button:has-text("Book tickets"), a:has-text("Book tickets")');
  if (bookBtn) {
    console.log("Clicking Book Tickets");
    await bookBtn.click({ force: true });
  }

  await page.waitForTimeout(10000);
  console.log("Timeout.");
  await browser.close();
})();
