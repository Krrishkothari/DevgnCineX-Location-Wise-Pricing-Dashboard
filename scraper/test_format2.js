const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Go to a known movie showtimes page directly. We can just use the BMS URL for showtimes
  await page.goto('https://in.bookmyshow.com/buytickets/dhamaal-4-national-capital-region-ncr/movie-ncr-ET00424564-MT/20260714', { waitUntil: 'domcontentloaded' });
  
  // Wait a bit
  await page.waitForTimeout(5000);
  
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('showtimes_page_direct.html', html);
  console.log("Saved showtimes_page_direct.html");
  
  await browser.close();
})();
