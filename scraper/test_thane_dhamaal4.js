const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://in.bookmyshow.com/explore/movies-mumbai', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  const cards = await page.$$('a[href*="/movies/"]');
  let dhamaalUrl = null;
  for (const card of cards) {
    const href = await card.getAttribute('href');
    if (href.includes('dhamaal-4') && !href.includes('/explore/')) {
      dhamaalUrl = href;
      break;
    }
  }
  
  if (!dhamaalUrl) {
    console.log("Dhamaal 4 not found on explore page.");
    await browser.close();
    return;
  }
  
  const fullUrl = dhamaalUrl.startsWith('http') ? dhamaalUrl : `https://in.bookmyshow.com${dhamaalUrl}`;
  console.log("Navigating to", fullUrl);
  await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });
  
  try {
    const bookBtn = await page.waitForSelector('button:has-text("Book tickets"), a:has-text("Book tickets")', {timeout: 10000});
    await bookBtn.click();
    
    let selectedFormat = '2D';
    try {
      const allFormats = await page.$$('span:text-is("2D"), div:text-is("2D"), span:text-is("3D"), div:text-is("3D")');
      for (const el of allFormats) {
        if (await el.isVisible()) {
          selectedFormat = await el.innerText();
          await el.click();
          break;
        }
      }
    } catch(e) {}
    
    console.log("Clicked format:", selectedFormat);
    
    await page.waitForResponse(r => r.url().includes('primary-dynamic') || r.url().includes('buytickets'), {timeout: 10000}).catch(() => {});
    await page.waitForTimeout(3000);
    
    console.log("Looking for format dropdown on showtimes page...");
    const formatPills = await page.$$(`div, span, button, li`);
    let dropdownClicked = false;
    for (const pill of formatPills) {
      const text = await pill.textContent();
      if (text && (text.includes(` - 2D`) || text.includes(` - 3D`)) && text.length < 20) {
        const box = await pill.boundingBox();
        if (box && box.height > 5) {
          console.log("Found likely format dropdown:", text.trim());
          await pill.click();
          dropdownClicked = true;
          break;
        }
      }
    }
    
    if (dropdownClicked) {
      await page.waitForTimeout(1000);
      const options = await page.$$(`li, span, div`);
      for (const opt of options) {
        const text = await opt.textContent();
        if (text && text.includes('4DX') && text.length < 20) {
          const box = await opt.boundingBox();
          if (box && box.height > 5) {
            console.log("Found 4DX option in dropdown! Clicking it...");
            const responsePromise = page.waitForResponse(r => r.url().includes('primary-dynamic'), { timeout: 10000 });
            await opt.click();
            await responsePromise;
            console.log("Successfully fetched primary-dynamic without reload!");
            break;
          }
        }
      }
    } else {
      console.log("Format dropdown not found.");
    }
  } catch(e) {
    console.error(e);
  }
  await browser.close();
})();
