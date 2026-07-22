const { scrapeLocation } = require('./scraper/scrapers/core/scrapeLocation');
const locations = require('./scraper/locations.config');
const ratlam = locations.find(l => l.locationName === 'Ratlam');
scrapeLocation(ratlam).then(res => {
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
