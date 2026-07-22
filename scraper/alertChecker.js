// Alert checker — only considers cinemas in the tracked list.
//
// The allow-list used to be a hardcoded copy of locations.config.js. Two copies
// of the same 17 locations meant adding a cinema in one place silently excluded
// it here, so it is now derived from the config directly.

const locations = require('./locations.config');

const TRACKED_CINEMAS = new Set();
for (const location of locations) {
  for (const cinema of location.cinemas) {
    TRACKED_CINEMAS.add(cinema.cinemaName.toLowerCase());
  }
}

function isTrackedCinema(cinemaName) {
  if (!cinemaName) return false;
  const lower = cinemaName.toLowerCase();
  for (const tracked of TRACKED_CINEMAS) {
    if (lower.includes(tracked) || tracked.includes(lower)) return true;
  }
  return false;
}

async function checkAlerts(data) {
  const relevant = data.filter((entry) => isTrackedCinema(entry.cinema));
  console.log(`[Alerts] ${relevant.length}/${data.length} entries are from tracked cinemas.`);
  if (relevant.length === 0) return;

  // No alert transport is wired up yet; this is the hook point for one.
  console.log('[Alerts] Alert check complete for tracked cinemas.');
}

module.exports = { checkAlerts, isTrackedCinema, TRACKED_CINEMAS };
