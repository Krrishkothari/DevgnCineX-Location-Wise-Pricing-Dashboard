const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://in.bookmyshow.com/explore/movies-gurugram', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // click the first movie card
  const cards = await page.$$('a[href*="/movies/"]');
  for (const card of cards) {
    const href = await card.getAttribute('href');
    if (!href.includes('/explore/') && !href.includes('/genre/')) {
      await card.click();
      break;
    }
  }
  
  try {
    const bookBtn = await page.waitForSelector('button:has-text("Book tickets"), a:has-text("Book tickets")', {timeout: 10000});
    await bookBtn.click();
    
    // Pick first format if modal
    try {
      const allFormats = await page.$$('span:text-is("2D"), div:text-is("2D"), span:text-is("3D"), div:text-is("3D")');
      for (const el of allFormats) {
        if (await el.isVisible()) {
          await el.click();
          break;
        }
      }
    } catch(e) {}
    
    await page.waitForResponse(r => r.url().includes('primary-dynamic') || r.url().includes('buytickets'), {timeout: 10000}).catch(() => {});
    await page.waitForTimeout(3000);
    
    const html = await page.content();
    require('fs').writeFileSync('first_movie.html', html);
    
    // Evaluate format filters
    const filterTexts = await page.evaluate(() => {
      // Typically there is a .filters-container or similar on top of the date row
      // We can grab text from all elements that might be dropdowns
      const elements = Array.from(document.querySelectorAll('div, span, li, button'));
      return elements.map(e => e.innerText).filter(t => typeof t === 'string' && t.includes(' - '));
    });
    
    console.log("Possible format dropdowns:", [...new Set(filterTexts)].slice(0,10));
  } catch(e) {
    console.error(e);
  }
  await browser.close();
})();
