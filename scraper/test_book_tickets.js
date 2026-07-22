const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  let dynamicFired = false;
  page.on('response', async (response) => {
    if (response.url().includes('primary-dynamic')) {
      dynamicFired = true;
      console.log("primary-dynamic fired on load without clicking Book Tickets!");
    }
  });
  
  console.log("Navigating to Dhamaal 4 movie page...");
  await page.goto('https://in.bookmyshow.com/movies/gurugram-gurgaon/dhamaal-4/ET00452553', { waitUntil: 'domcontentloaded' });
  
  console.log("Waiting 5 seconds to see if API fires automatically...");
  await page.waitForTimeout(5000);
  
  if (!dynamicFired) {
    console.log("primary-dynamic did NOT fire automatically. We must click Book Tickets.");
  }
  
  await browser.close();
})();
