// xlsx-js-style is ~800kB and only needed when someone actually exports, so it
// is loaded on demand rather than shipped in the initial bundle.

const HEADER_FILL = '5C4AE2';
const OWNED_COLOUR = '7C6AF7';
const ABOVE_COLOUR = '0D946C';
const BELOW_COLOUR = 'D63A58';
const NEUTRAL_COLOUR = '6B7280';

const COLUMNS = [
  { key: 'Cinema', width: 30 },
  { key: 'Type', width: 15 },
  { key: 'Movie', width: 26 },
  { key: 'Format', width: 10 },
  { key: 'Language', width: 12 },
  { key: 'Showtime', width: 12 },
  { key: 'Seat Category', width: 20 },
  { key: 'Tier', width: 12 },
  { key: 'Devgn Baseline', width: 16 },
  { key: 'Price', width: 10 },
  { key: 'Diff', width: 10 },
  { key: 'Market Position', width: 20 },
];

const POSITION_COLOURS = {
  'Priced higher': ABOVE_COLOUR,
  'Priced lower': BELOW_COLOUR,
  'Baseline (owned)': OWNED_COLOUR,
};

function rowsForCard(card) {
  const rows = [];
  for (const showtime of card.showtimes) {
    for (const tier of card.pricingByShowtime.get(showtime) || []) {
      let position = 'Level';
      let baseline = '—';
      let diff = '—';

      if (card.owned) {
        position = 'Baseline (owned)';
      } else if (!tier.hasBaseline) {
        position = 'No baseline';
      } else {
        baseline = tier.baseline;
        diff = tier.diff;
        if (tier.diff > 0) position = 'Priced higher';
        else if (tier.diff < 0) position = 'Priced lower';
      }

      rows.push({
        Cinema: card.cinema,
        Type: card.owned ? 'Devgn Cinex' : 'Competitor',
        Movie: card.movie,
        Format: card.format,
        Language: card.language,
        Showtime: showtime,
        'Seat Category': tier.category,
        Tier: tier.tier.replace('TIER_', 'T'),
        'Devgn Baseline': baseline,
        Price: tier.price,
        Diff: diff,
        'Market Position': position,
      });
    }
  }
  return rows;
}

/** One worksheet per location, styled. Returns the number of rows exported. */
export async function exportCardsToExcel(cards, date) {
  const XLSX = await import('xlsx-js-style');

  const byLocation = new Map();
  for (const card of cards) {
    const location = card.location || 'Unknown';
    if (!byLocation.has(location)) byLocation.set(location, []);
    byLocation.get(location).push(...rowsForCard(card));
  }

  const workbook = XLSX.utils.book_new();
  let total = 0;

  for (const [location, rows] of byLocation) {
    if (rows.length === 0) continue;
    total += rows.length;

    const sheet = XLSX.utils.json_to_sheet(rows, { header: COLUMNS.map((c) => c.key) });
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      if (!cell) continue;
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: HEADER_FILL } },
        alignment: { horizontal: 'center', vertical: 'center' },
      };
    }

    const typeCol = COLUMNS.findIndex((c) => c.key === 'Type');
    const diffCol = COLUMNS.findIndex((c) => c.key === 'Diff');
    const positionCol = COLUMNS.findIndex((c) => c.key === 'Market Position');

    for (let row = 1; row <= range.e.r; row++) {
      const typeCell = sheet[XLSX.utils.encode_cell({ r: row, c: typeCol })];
      if (typeCell?.v === 'Devgn Cinex') {
        typeCell.s = { font: { bold: true, color: { rgb: OWNED_COLOUR } } };
      }

      const positionCell = sheet[XLSX.utils.encode_cell({ r: row, c: positionCol })];
      if (!positionCell) continue;
      const colour = POSITION_COLOURS[positionCell.v] ?? NEUTRAL_COLOUR;
      positionCell.s = { font: { bold: true, color: { rgb: colour } } };
      const diffCell = sheet[XLSX.utils.encode_cell({ r: row, c: diffCol })];
      if (diffCell) diffCell.s = { font: { bold: true, color: { rgb: colour } } };
    }

    sheet['!cols'] = COLUMNS.map((c) => ({ wch: c.width }));
    // Excel caps sheet names at 31 characters.
    XLSX.utils.book_append_sheet(workbook, sheet, location.substring(0, 31));
  }

  if (total === 0) return 0;
  XLSX.writeFile(workbook, `Devgn-Pricing-${date || 'export'}.xlsx`);
  return total;
}
