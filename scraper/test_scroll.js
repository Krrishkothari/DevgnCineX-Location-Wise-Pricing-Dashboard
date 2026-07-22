const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Notice: NOT blocking images/css here
  const exploreUrl = "https://in.bookmyshow.com/explore/movies-national-capital-region-ncr";
  console.log(`Navigating to ${exploreUrl}`);
  
  try {
    await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    let previousCount = 0, stableAttempts = 0, finalScrollCount = 0;
    const getCards = () => Array.from(document.querySelectorAll('a[href*="/movies/"]'));
    
    for (let i = 0; i < 20; i++) {
      finalScrollCount = i + 1;
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      const currentCount = await page.evaluate(() => Array.from(document.querySelectorAll('a[href*="/movies/"]')).length);
      console.log(`Scroll ${i+1}: ${currentCount} movies`);
      if (currentCount === previousCount) {
        stableAttempts++;
        if (stableAttempts >= 3) break; 
      } else stableAttempts = 0; 
      previousCount = currentCount;
    }
  } catch (err) {
    console.error("Error:", err);
  }
  
  await browser.close();
})();
