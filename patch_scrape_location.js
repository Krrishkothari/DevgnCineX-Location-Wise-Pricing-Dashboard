const fs = require('fs');
const path = require('path');

const file = 'scraper/scrapers/core/scrapeLocation.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove page.route from discovery page.
// We find the block:
// const page = await context.newPage();
// await page.route('**/*', (route) => {
//   if (['image', 'font', 'stylesheet', 'media'].includes(route.request().resourceType())) route.abort();
//   else route.continue();
// });
content = content.replace(/const page = await context\.newPage\(\);\s*await page\.route\('\*\*\/\*', \(route\) => \{\s*if \(\['image', 'font', 'stylesheet', 'media'\]\.includes\(route\.request\(\)\.resourceType\(\)\)\) route\.abort\(\);\s*else route\.continue\(\);\s*\}\);/, 'const page = await context.newPage();\n      // [FIX] Removed resource blocking here to allow explore page infinite scroll');

// 2. Fix the date loop to start from index 0 if it was skipped.
// Look for: for (let dateIdx = 1; dateIdx < datesToScrape.length; dateIdx++)
// Replace with:
// let startingDateIdx = 1;
// if (!scrapedDates.has(datesToScrape[0])) {
//   console.log(`${regionLogPrefix}   [Default loaded tab was NOT ${datesToScrape[0]}. Will explicitly click it.]`);
//   startingDateIdx = 0;
// }
// for (let dateIdx = startingDateIdx; dateIdx < datesToScrape.length; dateIdx++) {
//   const targetDate = datesToScrape[dateIdx];
//   if (scrapedDates.has(targetDate)) continue;

content = content.replace(/for \(let dateIdx = 1; dateIdx < datesToScrape\.length; dateIdx\+\+\) \{/, 
`let startingDateIdx = 1;
            if (!scrapedDates.has(datesToScrape[0])) {
              console.log(\`\${regionLogPrefix}   [Default loaded tab was NOT \${datesToScrape[0]}. explicitly fetching it]\`);
              startingDateIdx = 0;
            }
            for (let dateIdx = startingDateIdx; dateIdx < datesToScrape.length; dateIdx++) {`);

fs.writeFileSync(file, content);
console.log('Patched scrapeLocation.js');
