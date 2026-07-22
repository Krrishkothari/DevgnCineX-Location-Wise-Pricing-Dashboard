const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('showtimes_page_direct.html', 'utf8');
const $ = cheerio.load(html);

console.log("Filter labels:");
$('.filters-container').find('*').each((i, el) => {
  const text = $(el).text().trim();
  if (text && text.length < 30) console.log(el.tagName, text);
});
