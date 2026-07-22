const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Go to movie details page (Dhamaal 4 in Gurugram)
  await page.goto('https://in.bookmyshow.com/gurugram/movies/dhamaal-4/ET00424564', { waitUntil: 'domcontentloaded' });
  
  // Wait for book tickets
  try {
    const bookBtn = await page.waitForSelector('button:has-text("Book tickets"), a:has-text("Book tickets")', {timeout: 10000});
    await bookBtn.click();
    
    // Pick 2D
    await page.waitForSelector('span:text-is("2D")', {timeout: 3000});
    await page.click('span:text-is("2D")');
    
    // Wait for showtimes page
    await page.waitForResponse(r => r.url().includes('primary-dynamic') || r.url().includes('buytickets'), {timeout: 10000}).catch(() => {});
    await page.waitForTimeout(3000);
    
    // Check if there is a format pill
    console.log("Looking for format dropdown...");
    const formatFilter = await page.$('div:has-text("Hindi - 2D")');
    if (formatFilter) {
      console.log("Found Hindi - 2D. Clicking it...");
      await formatFilter.click();
      await page.waitForTimeout(1000);
      
      // Look for other formats like 3D, 4DX, etc.
      const texts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('span, div, li')).map(e => e.innerText).filter(t => t && t.includes('Hindi - '));
      });
      console.log("Texts containing 'Hindi - ':", [...new Set(texts)]);
    } else {
      console.log("Format filter not found.");
    }
  } catch (e) {
    console.error(e);
  }
  
  await browser.close();
})();
