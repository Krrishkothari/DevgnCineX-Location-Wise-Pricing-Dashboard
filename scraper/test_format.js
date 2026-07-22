const { chromium } = require('playwright-extra');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://in.bookmyshow.com/gurugram/movies/dhamaal-4/ET00424564', { waitUntil: 'domcontentloaded' });
  
  const bookBtn = await page.waitForSelector('button:has-text("Book tickets"), a:has-text("Book tickets")');
  await bookBtn.click();
  
  try {
    await page.waitForSelector('span:text-is("2D")', {timeout: 3000});
    await page.click('span:text-is("2D")');
  } catch(e) {}
  
  await page.waitForResponse(r => r.url().includes('primary-dynamic') || r.url().includes('buytickets'), {timeout: 10000}).catch(() => {});
  
  await page.waitForTimeout(2000);
  
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('showtimes_page.html', html);
  console.log("Saved showtimes_page.html");
  
  await browser.close();
})();
