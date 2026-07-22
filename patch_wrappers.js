const fs = require('fs');
const path = require('path');

const dir = 'scraper/scrapers/locations';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  content = content.replace(/async function run\(sharedRegionLocks = null\) \{/, 'async function run(sharedRegionLocks = null, sharedBrowser = null) {');
  content = content.replace(/await scrapeLocation\(config, sharedRegionLocks\)/, 'await scrapeLocation(config, sharedRegionLocks, sharedBrowser)');
  
  fs.writeFileSync(filePath, content);
}
console.log('Patched all wrappers.');
