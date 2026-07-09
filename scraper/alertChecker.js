// Alert checker — only triggers alerts for cinemas within the Excel-mapped list.

const ALLOWED_CINEMAS = {
  "Gurugram": ["Devgn Cinex Elan Epic", "INOX World Mark", "INOX AIPL", "Cinepolis Airia Mall", "Wave Urbana Premium", "PVR Elan Town Centre"],
  "Gandhinagar": ["Devgn Cinex Swagat Mall", "INOX Adalaj"],
  "Ahmedabad": ["Devgn Cinex Chandkheda", "PVR Motera", "Rajhans CBD"],
  "Thane": ["Devgn Cinex The Walk", "Cinepolis Viviana", "INOX R Mall"],
  "Ghaziabad": ["Devgn Cinex Ghaziabad", "PVR VVIP"],
  "Kanpur": ["Devgn Cinex Heer Palace", "INOX Z Square", "PVR Deep", "PVR South X", "Rave 3"],
  "Bahadurgarh": ["Devgn Cinex Bahadurgarh", "Movietime Cinemas", "KRB Cineplex"],
  "Anand": ["Devgn Cinex Galleria Mall", "PVR Maruti Solaris", "INOX City Pulse Mall"],
  "Bhuj": ["Devgn Cinex Seven Sky"],
  "Guwahati": ["Devgn Cinex Roodraksh Mall", "PVR Citi Centre", "Cinepolis Central Mall"],
  "Surendranagar": ["Devgn Cinex Surendranagar"],
  "Mulund": ["Devgn Cinex Mulund", "Miraj Cinemas"],
  "Meerut": ["Devgn Cinex Meerut", "INOX PVS Mall", "Wave"],
  "Ratlam": ["Devgn Cinex Anand Big Mall", "Gayatri Cinemas"],
  "Hapur": ["Devgn Cinex Hapur"],
  "Ghazipur": ["Devgn Cinex Ghazipur"],
  "Raebareli": ["Devgn Cinex Raebareli"]
};

// Flatten allowed cinemas into a Set for quick lookup
const ALL_ALLOWED = new Set();
Object.values(ALLOWED_CINEMAS).forEach(list => list.forEach(c => ALL_ALLOWED.add(c.toLowerCase())));

function isAllowedCinema(cinemaName) {
  if (!cinemaName) return false;
  const lower = cinemaName.toLowerCase();
  for (const allowed of ALL_ALLOWED) {
    if (lower.includes(allowed) || allowed.includes(lower)) return true;
  }
  return false;
}

async function checkAlerts(data) {
  // Filter to only allowed cinemas
  const relevant = data.filter(entry => isAllowedCinema(entry.cinema));
  console.log(`[Alerts] ${relevant.length}/${data.length} entries are from tracked cinemas.`);
  
  if (relevant.length === 0) return;

  // TODO: Implement actual Telegram alert logic here
  // For now, just log price changes
  console.log('[Alerts] Alert check complete for tracked cinemas.');
}

module.exports = { checkAlerts };
