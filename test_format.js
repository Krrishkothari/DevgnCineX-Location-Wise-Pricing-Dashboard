const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Navigate to Dhamaal 4 or a generic movie in gurugram
  await page.goto('https://in.bookmyshow.com/gurugram/movies/dhamaal-4/ET00424564', { waitUntil: 'domcontentloaded' });
  
  // Wait for book tickets
  const bookBtn = await page.waitForSelector('button:has-text("Book tickets"), a:has-text("Book tickets")');
  await bookBtn.click();
  
  // Wait for format modal and pick 2D
  await page.waitForSelector('span:text-is("2D")');
  await page.click('span:text-is("2D")');
  
  // Wait for primary-dynamic or navigation
  await page.waitForResponse(r => r.url().includes('primary-dynamic') || r.url().includes('buytickets'), {timeout: 10000}).catch(() => {});
  
  // Now we are on the showtimes page. Let's dump all text that might be a format dropdown.
  // BookMyShow usually has a format pill near the title, like "2D, Hindi".
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('showtimes_page.html', html);
  console.log("Saved showtimes_page.html");
  
  await browser.close();
})();
