// Pricing domain logic, extracted from the dashboard component so it can be
// reasoned about (and tested) independently of rendering.

/** Minutes since midnight for a 12-hour time string like "11:25 AM". */
export function timeToMinutes(timeStr) {
  if (typeof timeStr !== 'string') return -1;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return -1;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (match[3].toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (match[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

/*
 * There were previously two different definitions of these windows: the
 * baseline bucketer ended "afternoon" at 17:00 while the user-facing filter
 * ended it at 16:00, so a 4:30 PM show was compared against the afternoon
 * baseline but hidden by the afternoon filter. One definition now drives both.
 */
export const TIME_SLOTS = [
  { value: 'all', label: 'All day', short: 'All' },
  { value: 'morning', label: 'Morning', short: 'AM', from: 360, to: 720 },
  { value: 'afternoon', label: 'Afternoon', short: 'Noon', from: 720, to: 960 },
  { value: 'evening', label: 'Evening', short: 'Eve', from: 960, to: 1200 },
  { value: 'night', label: 'Night', short: 'Night', from: 1200, to: 360 },
];

const SLOT_BY_VALUE = new Map(TIME_SLOTS.map((slot) => [slot.value, slot]));

/** Which slot a showtime belongs to. Returns 'unknown' if unparseable. */
export function getTimeBucket(timeStr) {
  const minutes = timeToMinutes(timeStr);
  if (minutes < 0) return 'unknown';
  for (const slot of TIME_SLOTS) {
    if (slot.value === 'all') continue;
    // The night window wraps past midnight.
    const inSlot = slot.from > slot.to
      ? minutes >= slot.from || minutes < slot.to
      : minutes >= slot.from && minutes < slot.to;
    if (inSlot) return slot.value;
  }
  return 'unknown';
}

export function isInTimeSlot(timeStr, slotValue) {
  if (slotValue === 'all') return true;
  const minutes = timeToMinutes(timeStr);
  if (minutes < 0) return true; // unparseable — don't hide it
  const slot = SLOT_BY_VALUE.get(slotValue);
  if (!slot || slot.from === undefined) return true;
  return slot.from > slot.to
    ? minutes >= slot.from || minutes < slot.to
    : minutes >= slot.from && minutes < slot.to;
}

// Seat categories vary wildly between chains, so they're folded into three
// comparable tiers before any baseline maths happens.
const TIER_KEYWORDS = [
  { tier: 'TIER_3', label: 'Premium', words: ['RECLINER', 'EBONY', 'PLATINUM', 'VIP', 'DIAMOND', 'LOUNGE', 'SIGNATURE', 'INSIGNIA', 'IMAX'] },
  { tier: 'TIER_2', label: 'Enhanced', words: ['PRIME', 'COMFORT', 'PREMIUM', 'GOLD', 'SUPER', 'CLUB', 'ROYAL', 'EXTRA LEGROOM'] },
  { tier: 'TIER_1', label: 'Standard', words: ['CLASSIC', 'EXECUTIVE', 'EXEC', 'SILVER', 'STANDARD', 'NORMAL', 'ECONOMY', 'REGULAR'] },
];

export const TIER_LABELS = { TIER_1: 'Standard', TIER_2: 'Enhanced', TIER_3: 'Premium' };

/**
 * Fold a raw seat-category string into a comparable tier.
 * Unrecognised categories fall back to TIER_1; `recognised` reports whether the
 * match was real, so callers can avoid comparing an unknown premium format
 * against standard-seat pricing.
 */
export function normalizeCategory(rawCategory) {
  if (!rawCategory || rawCategory === 'N/A') return { tier: 'TIER_1', recognised: false };
  const upper = String(rawCategory).toUpperCase();
  for (const { tier, words } of TIER_KEYWORDS) {
    if (words.some((word) => upper.includes(word))) return { tier, recognised: true };
  }
  return { tier: 'TIER_1', recognised: false };
}

export function isOwnedCinema(cinema) {
  if (typeof cinema !== 'string') return false;
  const lower = cinema.toLowerCase();
  return lower.includes('devgn') || lower.includes('owned');
}

/**
 * Cinema-industry weekend: Friday through Sunday. Pricing behaves differently
 * across that boundary, so baselines are only compared like-for-like.
 */
export function isWeekend(dateStr) {
  if (!dateStr) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return false;
  return [0, 5, 6].includes(new Date(year, month - 1, day).getDay());
}

/**
 * Average Devgn Cinex price per movie / time bucket / seat tier, restricted to
 * days of the same type (weekend vs weekday) as the one being viewed.
 */
export function buildBaselines(baselineRows, targetDate) {
  const targetIsWeekend = isWeekend(targetDate);
  const totals = new Map();

  for (const row of baselineRows) {
    if (!row.date || !row.showtime || !row.price) continue;
    if (isWeekend(row.date) !== targetIsWeekend) continue;

    const { tier } = normalizeCategory(row.seat_category);
    const key = `${row.movie}|${getTimeBucket(row.showtime)}|${tier}`;
    const entry = totals.get(key) || { sum: 0, count: 0 };
    entry.sum += row.price;
    entry.count += 1;
    totals.set(key, entry);
  }

  const averages = new Map();
  for (const [key, { sum, count }] of totals) averages.set(key, sum / count);
  return averages;
}

function baselineFor(baselines, movie, showtime, tier) {
  return baselines.get(`${movie}|${getTimeBucket(showtime)}|${tier}`);
}

/**
 * Group filtered price rows into one card per cinema+movie, attaching the
 * baseline comparison for competitor venues.
 */
export function buildCinemaCards(rows, baselines) {
  const grouped = new Map();

  for (const row of rows) {
    if (!row.cinema || !row.showtime) continue;

    const id = `${row.cinema}|${row.location}|${row.movie}`;
    let card = grouped.get(id);

    if (!card) {
      card = {
        id,
        cinema: row.cinema,
        location: row.location,
        movie: row.movie,
        date: row.date,
        format: row.format || '2D',
        language: row.language || '',
        owned: row.owned ?? isOwnedCinema(row.cinema),
        scrapedAt: row.scraped_at,
        showtimes: [],
        pricingByShowtime: new Map(),
      };
      grouped.set(id, card);
    } else if (row.scraped_at && (!card.scrapedAt || row.scraped_at > card.scrapedAt)) {
      card.scrapedAt = row.scraped_at;
    }

    if (!card.pricingByShowtime.has(row.showtime)) {
      card.pricingByShowtime.set(row.showtime, []);
      card.showtimes.push(row.showtime);
    }

    const category = row.seat_category && row.seat_category !== 'N/A' ? row.seat_category : 'Standard';
    const { tier, recognised } = normalizeCategory(category);

    let diff = 0;
    let hasBaseline = false;
    if (!card.owned) {
      const average = baselineFor(baselines, row.movie, row.showtime, tier);
      if (average !== undefined) {
        diff = Math.round(row.price - average);
        hasBaseline = true;
      }
    }

    card.pricingByShowtime.get(row.showtime).push({
      category,
      tier,
      tierRecognised: recognised,
      price: row.price,
      diff,
      hasBaseline,
      baseline: hasBaseline ? row.price - diff : null,
    });
  }

  const cards = [...grouped.values()];
  for (const card of cards) {
    card.showtimes.sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    for (const tiers of card.pricingByShowtime.values()) {
      tiers.sort((a, b) => a.price - b.price);
    }
  }

  // Owned venues first, then alphabetical — they're the reference point.
  cards.sort((a, b) => {
    if (a.owned !== b.owned) return a.owned ? -1 : 1;
    return `${a.cinema} ${a.location}`.localeCompare(`${b.cinema} ${b.location}`);
  });

  return cards;
}

/** Headline numbers for the KPI strip. */
export function summarise(cards) {
  let owned = 0;
  let competitors = 0;
  let above = 0;
  let below = 0;
  let level = 0;
  let comparablePrices = 0;
  let priceSum = 0;
  let showCount = 0;

  for (const card of cards) {
    if (card.owned) owned += 1;
    else competitors += 1;
    showCount += card.showtimes.length;

    for (const tiers of card.pricingByShowtime.values()) {
      for (const tier of tiers) {
        priceSum += tier.price;
        comparablePrices += 1;
        if (card.owned || !tier.hasBaseline) continue;
        if (tier.diff > 0) above += 1;
        else if (tier.diff < 0) below += 1;
        else level += 1;
      }
    }
  }

  const compared = above + below + level;
  return {
    owned,
    competitors,
    showCount,
    above,
    below,
    level,
    compared,
    // Share of comparable competitor prices sitting above our baseline.
    premiumShare: compared ? above / compared : null,
    averagePrice: comparablePrices ? Math.round(priceSum / comparablePrices) : null,
  };
}
