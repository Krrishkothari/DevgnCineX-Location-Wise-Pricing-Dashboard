// locations.config.js — All 17 Devgn Cinex locations and their tracked cinemas.
// Each location contains its cinema list with BMS metadata for scraping.
// Single-cinema locations (Bhuj, Surendranagar, Hapur, Ghazipur, Raebareli)
// are intentional — they only track the Devgn Cinex screen with no competitors.

module.exports = [
  // ─── 1. Gurugram (6 cinemas) ──────────────────────────────────────
  {
    locationName: 'Gurugram',
    cinemas: [
      { cinemaName: 'Devgn Cinex Elan Epic', bmsCode: 'NYCG', bmsRegion: 'national-capital-region-ncr', bmsSlug: 'devgn-cinex-elan-epic-gurugram', isOwned: true },
      { cinemaName: 'INOX World Mark', bmsCode: 'INWM', bmsRegion: 'national-capital-region-ncr', bmsSlug: 'inox-world-mark-gurugram', isOwned: false },
      { cinemaName: 'INOX AIPL', bmsCode: 'IAJS', bmsRegion: 'national-capital-region-ncr', bmsSlug: 'inox-aipl-joy-street-gurgaon', isOwned: false },
      { cinemaName: 'Cinepolis Airia Mall', bmsCode: 'CRGM', bmsRegion: 'national-capital-region-ncr', bmsSlug: 'cinepolis-airia-mall-sohna-road-gurgaon', isOwned: false },
      { cinemaName: 'Wave Urbana Premium', bmsCode: 'WUPG', bmsRegion: 'gurugram-gurgaon', bmsSlug: 'wave-urbana-premium-sector-67-gurugram', isOwned: false },
      { cinemaName: 'PVR Elan Town Centre', bmsCode: 'PETA', bmsRegion: 'gurugram-gurgaon', bmsSlug: 'pvr-elan-town-centre-sec-67-gurugram', isOwned: false },
    ],
  },

  // ─── 2. Gandhinagar (2 cinemas) ───────────────────────────────────
  {
    locationName: 'Gandhinagar',
    cinemas: [
      { cinemaName: 'Devgn Cinex Swagat Mall', bmsCode: 'NYST', bmsRegion: 'gandhinagar', bmsSlug: 'devgn-cinex-swagat-mall-gandhinagar', isOwned: true },
      { cinemaName: 'INOX Adalaj', bmsCode: 'INGA', bmsRegion: 'gandhinagar', bmsSlug: 'inox-gandhinagar-adalaj', isOwned: false },
    ],
  },

  // ─── 3. Ahmedabad (3 cinemas) ─────────────────────────────────────
  {
    locationName: 'Ahmedabad',
    cinemas: [
      { cinemaName: 'Devgn Cinex Chandkheda', bmsCode: 'NYAG', bmsRegion: 'gandhinagar', bmsSlug: 'devgn-cinex-chandkheda-ahmedabad', isOwned: true },
      { cinemaName: 'PVR Motera', bmsCode: 'METH', bmsRegion: 'ahmedabad', bmsSlug: 'pvr-motera-ahmedabad', isOwned: false },
      { cinemaName: 'Rajhans CBD', bmsCode: 'RCCA', bmsRegion: 'ahmedabad', bmsSlug: 'rajhans-cinemas-the-cbd-mall-zundal-circle', isOwned: false },
    ],
  },

  // ─── 4. Thane (3 cinemas) ─────────────────────────────────────────
  {
    locationName: 'Thane',
    cinemas: [
      { cinemaName: 'Devgn Cinex The Walk', bmsCode: 'DCTW', bmsRegion: 'mumbai', bmsSlug: 'devgn-cinex-the-walk-thane', isOwned: true },
      { cinemaName: 'Cinepolis Viviana', bmsCode: 'CPVM', bmsRegion: 'mumbai', bmsSlug: 'cinepolis-lake-shore-thane-ex-viviana-mall', isOwned: false },
      { cinemaName: 'INOX R Mall', bmsCode: 'IRGT', bmsRegion: 'mumbai', bmsSlug: 'inox-insignia-at-r-mall-thane', isOwned: false },
    ],
  },

  // ─── 5. Ghaziabad (2 cinemas) ─────────────────────────────────────
  {
    locationName: 'Ghaziabad',
    cinemas: [
      { cinemaName: 'Devgn Cinex Ghaziabad', bmsCode: 'NYDU', bmsRegion: 'ghaziabad', bmsSlug: 'devgn-cinex-ghaziabad', isOwned: true },
      { cinemaName: 'PVR VVIP', bmsCode: 'VVGZ', bmsRegion: 'ghaziabad', bmsSlug: 'pvr-vvip-ghaziabad', isOwned: false },
    ],
  },

  // ─── 6. Kanpur (5 cinemas) ────────────────────────────────────────
  {
    locationName: 'Kanpur',
    cinemas: [
      { cinemaName: 'Devgn Cinex Heer Palace', bmsCode: 'NYCH', bmsRegion: 'kanpur', bmsSlug: 'devgn-cinex-heer-palace-kanpur', isOwned: true },
      { cinemaName: 'INOX Z Square', bmsCode: 'INZS', bmsRegion: 'kanpur', bmsSlug: 'inox-z-square-bada-chauraha', isOwned: false },
      { cinemaName: 'PVR Deep', bmsCode: 'PDDK', bmsRegion: 'kanpur', bmsSlug: 'pvr-deep-kanpur', isOwned: false },
      { cinemaName: 'PVR South X', bmsCode: 'PSXM', bmsRegion: 'kanpur', bmsSlug: 'pvr-south-x-mall-kanpur', isOwned: false },
      { cinemaName: 'Rave 3', bmsCode: 'RAVE', bmsRegion: 'kanpur', bmsSlug: 'rave-3-av-cinemas-kanpur', isOwned: false },
    ],
  },

  // ─── 7. Bahadurgarh (3 cinemas) ───────────────────────────────────
  {
    locationName: 'Bahadurgarh',
    cinemas: [
      { cinemaName: 'Devgn Cinex Bahadurgarh', bmsCode: 'NYBH', bmsRegion: 'bahadurgarh', bmsSlug: 'devgn-cinex-bahadurgarh', isOwned: true },
      { cinemaName: 'Movietime Cinemas', bmsCode: 'MTBR', bmsRegion: 'bahadurgarh', bmsSlug: 'movietime-cinemas-bahadurgarh', isOwned: false },
      { cinemaName: 'KRB Cineplex', bmsCode: 'KRBC', bmsRegion: 'bahadurgarh', bmsSlug: 'krb-cineplex-bahadurgarh', isOwned: false },
    ],
  },

  // ─── 8. Anand (3 cinemas) ─────────────────────────────────────────
  {
    locationName: 'Anand',
    cinemas: [
      { cinemaName: 'Devgn Cinex Galleria Mall', bmsCode: 'NYSA', bmsRegion: 'anand', bmsSlug: 'devgn-cinex-galleria-mall-anand', isOwned: true },
      { cinemaName: 'PVR Maruti Solaris', bmsCode: 'PMAK', bmsRegion: 'anand', bmsSlug: 'pvr-maruti-solaris-anand', isOwned: false },
      { cinemaName: 'INOX City Pulse Mall', bmsCode: 'FCPA', bmsRegion: 'anand', bmsSlug: 'inox-anand-city-pulse-mall', isOwned: false },
    ],
  },

  // ─── 9. Bhuj (1 cinema — Devgn Cinex only, no competitors) ───────
  {
    locationName: 'Bhuj',
    cinemas: [
      { cinemaName: 'Devgn Cinex Seven Sky', bmsCode: 'NYCS', bmsRegion: 'bhuj', bmsSlug: 'devgn-cinex-seven-sky-bhuj', isOwned: true },
    ],
  },

  // ─── 10. Guwahati (3 cinemas) ─────────────────────────────────────
  {
    locationName: 'Guwahati',
    cinemas: [
      { cinemaName: 'Devgn Cinex Roodraksh Mall', bmsCode: 'NYRG', bmsRegion: 'guwahati', bmsSlug: 'devgn-cinex-roodraksh-mall-guwahati', isOwned: true },
      { cinemaName: 'PVR Citi Centre', bmsCode: 'CCGW', bmsRegion: 'guwahati', bmsSlug: 'pvr-city-centre-guwahati', isOwned: false },
      { cinemaName: 'Cinepolis Central Mall', bmsCode: 'CCMG', bmsRegion: 'guwahati', bmsSlug: 'cinepolis-central-mall-guwahati', isOwned: false },
    ],
  },

  // ─── 11. Surendranagar (1 cinema — Devgn Cinex only, no competitors)
  {
    locationName: 'Surendranagar',
    cinemas: [
      { cinemaName: 'Devgn Cinex Surendranagar', bmsCode: 'MMPS', bmsRegion: 'surendranagar', bmsSlug: 'devgn-cinex-surendranagar', isOwned: true },
    ],
  },

  // ─── 12. Mulund (2 cinemas) ───────────────────────────────────────
  {
    locationName: 'Mulund',
    cinemas: [
      { cinemaName: 'Devgn Cinex Mulund', bmsCode: 'NYMD', bmsRegion: 'mumbai', bmsSlug: 'devgn-cinex-mulund', isOwned: true },
      { cinemaName: 'Miraj Cinemas', bmsCode: 'MCRM', bmsRegion: 'mumbai', bmsSlug: 'miraj-cinemas-r-mall-mulund', isOwned: false },
    ],
  },

  // ─── 13. Meerut (3 cinemas) ───────────────────────────────────────
  {
    locationName: 'Meerut',
    cinemas: [
      { cinemaName: 'Devgn Cinex Meerut', bmsCode: 'NYSM', bmsRegion: 'meerut', bmsSlug: 'devgn-cinex-meerut', isOwned: true },
      { cinemaName: 'INOX PVS Mall', bmsCode: 'INPM', bmsRegion: 'meerut', bmsSlug: 'inox-pvs-mall-meerut', isOwned: false },
      { cinemaName: 'Wave', bmsCode: 'WVMT', bmsRegion: 'meerut', bmsSlug: 'wave-meerut', isOwned: false },
    ],
  },

  // ─── 14. Ratlam (2 cinemas) ───────────────────────────────────────
  {
    locationName: 'Ratlam',
    cinemas: [
      { cinemaName: 'Devgn Cinex Anand Big Mall', bmsCode: 'NCAM', bmsRegion: 'ratlam', bmsSlug: 'devgn-cinex-anand-big-mall-ratlam', isOwned: true },
      { cinemaName: 'Gayatri Cinemas', bmsCode: 'GCRT', bmsRegion: 'ratlam', bmsSlug: 'gayatri-cinemas-ratlam', isOwned: false },
    ],
  },

  // ─── 15. Hapur (1 cinema — Devgn Cinex only, no competitors) ─────
  {
    locationName: 'Hapur',
    cinemas: [
      { cinemaName: 'Devgn Cinex Hapur', bmsCode: 'NYOH', bmsRegion: 'hapur', bmsSlug: 'devgn-cinex-hapur', isOwned: true },
    ],
  },

  // ─── 16. Ghazipur (1 cinema — Devgn Cinex only, no competitors) ──
  {
    locationName: 'Ghazipur',
    cinemas: [
      { cinemaName: 'Devgn Cinex Ghazipur', bmsCode: 'NYSG', bmsRegion: 'ghazipur', bmsSlug: 'devgn-cinex-ghazipur', isOwned: true },
    ],
  },

  // ─── 17. Raebareli (1 cinema — Devgn Cinex only, no competitors) ─
  {
    locationName: 'Raebareli',
    cinemas: [
      { cinemaName: 'Devgn Cinex Raebareli', bmsCode: 'NYCR', bmsRegion: 'raebareli', bmsSlug: 'devgn-cinex-raebareli', isOwned: true },
    ],
  },
];
