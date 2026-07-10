import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { fetchPrices, triggerScrape } from '../api';
import { useFilters } from '../layout/MainLayout';
import { AlertTriangle, Clock } from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 20 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

/**
 * Convert a 12h time string like "11:25 AM" to minutes since midnight
 */
function timeToMinutes(timeStr) {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return -1;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

/**
 * Bucket showtimes into time-of-day groups for baseline comparisons
 */
function getTimeBucket(timeStr) {
  const mins = timeToMinutes(timeStr);
  if (mins < 0) return 'unknown';
  if (mins < 720) return 'morning';    // before 12:00 PM
  if (mins < 1020) return 'afternoon'; // 12:00 PM - 4:59 PM (17:00)
  if (mins < 1260) return 'evening';   // 5:00 PM - 8:59 PM (21:00)
  return 'night';                      // 9:00 PM and after
}

/**
 * Check if a showtime falls within a time slot
 * Morning: 6 AM – 12 PM
 * Afternoon: 12 PM – 4 PM
 * Evening: 4 PM – 8 PM
 * Night: 8 PM – 6 AM (next day)
 */
function isInTimeSlot(timeStr, slot) {
  if (slot === 'all') return true;
  const mins = timeToMinutes(timeStr);
  if (mins < 0) return true; // can't parse, include it
  switch (slot) {
    case 'morning':
      return mins >= 360 && mins < 720;   // 6:00 AM – 11:59 AM
    case 'afternoon':
      return mins >= 720 && mins < 960;   // 12:00 PM – 3:59 PM
    case 'evening':
      return mins >= 960 && mins < 1200;  // 4:00 PM – 7:59 PM
    case 'night':
      return mins >= 1200 || mins < 360;  // 8:00 PM – 5:59 AM
    default:
      return true;
  }
}

const ALLOWED_CINEMAS = {
  "Gurugram": ["DEVGN CINEX", "INOX WORLD MARK", "INOX AIPL", "CINEPOLIS AIRIA MALL", "WAVE URBANA PREMIUM", "PVR ELAN TOWN CENTRE"],
  "Gandhinagar": ["DEVGN CINEX", "INOX ADALAJ"],
  "Ahmedabad": ["DEVGN CINEX", "PVR MOTERA", "RAJHANS CBD"],
  "Thane": ["DEVGN CINEX", "CINEPOLIS VIVIANA", "INOX R MALL"],
  "Ghaziabad": ["DEVGN CINEX", "PVR VVIP"],
  "Kanpur": ["DEVGN CINEX", "INOX Z SQUARE", "PVR DEEP", "PVR SOUTH X", "RAVE 3"],
  "Bahadurgarh": ["DEVGN CINEX", "MOVIETIME CINEMAS", "KRB CINEPLEX"],
  "Anand": ["DEVGN CINEX", "PVR MARUTI SOLARIS", "INOX CITY PULSE MALL"],
  "Bhuj": ["DEVGN CINEX"],
  "Guwahati": ["DEVGN CINEX", "PVR CITI CENTRE", "CINEPOLIS CENTRAL MALL"],
  "Surendranagar": ["DEVGN CINEX"],
  "Mulund": ["DEVGN CINEX", "MIRAJ CINEMAS"],
  "Meerut": ["DEVGN CINEX", "INOX PVS MALL", "WAVE"],
  "Ratlam": ["DEVGN CINEX", "GAYATRI CINEMA"],
  "Hapur": ["DEVGN CINEX"],
  "Ghazipur": ["DEVGN CINEX"],
  "Raebareli": ["DEVGN CINEX"]
};

// Map Excel names to BookMyShow's actual weirdly formatted names if direct match fails
const CINEMA_ALIASES = {
  "CINEPOLIS VIVIANA": "Lake Shore",
  "INOX R MALL": "Insignia at R Mall",
  "PVR CITI CENTRE": "City Centre"
};

function isAllowedCinema(scrapedCinemaName, location) {
  const allowedList = ALLOWED_CINEMAS[location];
  if (!allowedList) return true; // If location is unknown/not mapped, allow it to be safe

  const normalize = (str) => str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const scrapedNormalized = normalize(scrapedCinemaName);

  for (const allowed of allowedList) {
    if (scrapedNormalized.includes(normalize(allowed))) {
      return true;
    }
    if (CINEMA_ALIASES[allowed] && scrapedNormalized.includes(normalize(CINEMA_ALIASES[allowed]))) {
      return true;
    }
  }
  return false;
}

function normalizeCategory(rawCat) {
  if (!rawCat || rawCat === 'N/A') return 'TIER_1';
  const upper = rawCat.toUpperCase();
  
  // TIER 3: Luxury / Premium
  if (
    upper.includes('RECLINER') || 
    upper.includes('EBONY') || 
    upper.includes('PLATINUM') || 
    upper.includes('VIP') || 
    upper.includes('DIAMOND') || 
    upper.includes('LOUNGE') ||
    upper.includes('SIGNATURE') ||
    upper.includes('INSIGNIA') ||
    upper.includes('IMAX')
  ) {
    return 'TIER_3';
  }
  
  // TIER 2: Mid-range / Upgraded
  if (
    upper.includes('PRIME') || 
    upper.includes('COMFORT') || 
    upper.includes('PREMIUM') || 
    upper.includes('GOLD') || 
    upper.includes('SUPER') ||
    upper.includes('CLUB') ||
    upper.includes('ROYAL') ||
    upper.includes('EXTRA LEGROOM')
  ) {
    return 'TIER_2';
  }
  
  // TIER 1: Base / Standard
  if (
    upper.includes('CLASSIC') || 
    upper.includes('EXECUTIVE') || 
    upper.includes('EXEC') || 
    upper.includes('SILVER') || 
    upper.includes('STANDARD') || 
    upper.includes('NORMAL') ||
    upper.includes('ECONOMY') ||
    upper.includes('REGULAR')
  ) {
    return 'TIER_1';
  }
  
  // Fallback to TIER_1 if completely unknown
  return 'TIER_1';
}

import { TrendChart } from '../components/TrendChart';
import * as XLSX from 'xlsx-js-style';

export function DashboardScreen() {
  const [rawData, setRawData] = useState([]);
  const [baselineData, setBaselineData] = useState([]);
  const [loading, setLoading] = useState(true);

  const {
    selectedMovie,
    searchQuery,
    selectedLocation,
    selectedDate,
    selectedTimeSlot,
  } = useFilters();

  const loadData = async () => {
    setLoading(true);
    const [mainRes, baseRes] = await Promise.all([
      fetchPrices(selectedDate),
      fetchPrices(null, true)
    ]);
    setRawData(mainRes.data || []);
    setBaselineData(baseRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (selectedDate) {
      loadData();
    }
    
    // Auto-poll every 5 seconds to show incremental scraper updates
    const interval = setInterval(async () => {
      if (selectedDate) {
        const [mainRes, baseRes] = await Promise.all([
          fetchPrices(selectedDate),
          fetchPrices(null, true)
        ]);
        setRawData(mainRes.data || []);
        setBaselineData(baseRes.data || []);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedDate]);

  // Apply filters and group data
  const { cards: data, summary, isSelectedWeekend } = useMemo(() => {
    // Step 1: Filter by selected movie & search query
    let filtered = rawData;
    if (selectedMovie !== 'all') {
      filtered = filtered.filter((entry) => entry.movie === selectedMovie);
    }
    if (searchQuery && searchQuery.trim() !== '') {
      filtered = filtered.filter((entry) => 
        entry.movie.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Step 2: Filter by location and strictly allowed cinemas for that location
    if (selectedLocation) {
      filtered = filtered.filter((entry) => 
        entry.location === selectedLocation && isAllowedCinema(entry.cinema, selectedLocation)
      );
    }

    // Step 3: Filter by time slot (check showtime against slot ranges)
    if (selectedTimeSlot !== 'all') {
      filtered = filtered.filter((entry) => {
        if (!entry.showtime) return false;
        return isInTimeSlot(entry.showtime, selectedTimeSlot);
      });
    }

    // Step 4: Calculate Devgn Cinex baseline averages per bucket using historical baselineData filtered by Day Type
    const baselines = {};
    
    let isSelectedWeekend = false;
    if (selectedDate) {
      const [yyyy, mm, dd] = selectedDate.split('-');
      const dayOfWeek = new Date(yyyy, mm - 1, dd).getDay();
      isSelectedWeekend = [0, 5, 6].includes(dayOfWeek); // Sun, Fri, Sat
    }

    const relevantBaselineData = baselineData.filter(entry => {
       if (!entry.date) return false;
       const [y, m, d] = entry.date.split('-');
       const dW = new Date(y, m - 1, d).getDay();
       const isWknd = [0, 5, 6].includes(dW);
       return isWknd === isSelectedWeekend;
    });

    relevantBaselineData.forEach(entry => {
      if (entry.showtime && entry.price) {
        if (!baselines[entry.movie]) baselines[entry.movie] = {};
        
        const bucket = getTimeBucket(entry.showtime);
        if (!baselines[entry.movie][bucket]) baselines[entry.movie][bucket] = {};
        
        const catName = entry.seat_category && entry.seat_category !== 'N/A' ? entry.seat_category : 'Standard';
        const normCat = normalizeCategory(catName);

        if (!baselines[entry.movie][bucket][normCat]) {
          baselines[entry.movie][bucket][normCat] = { sum: 0, count: 0, avg: 0 };
        }
        
        baselines[entry.movie][bucket][normCat].sum += entry.price;
        baselines[entry.movie][bucket][normCat].count += 1;
        baselines[entry.movie][bucket][normCat].avg = baselines[entry.movie][bucket][normCat].sum / baselines[entry.movie][bucket][normCat].count;
      }
    });

    // Step 5: Group into cards and calculate diffs
    const grouped = {};

    filtered.forEach((entry) => {
      const key = `${entry.cinema}-${entry.location}-${entry.movie}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          cinema: entry.cinema,
          location: entry.location,
          date: entry.date,
          theatre: `${entry.cinema}: ${entry.location}`,
          subtitle: entry.movie,
          showtimes: new Set(),
          format: entry.format || '2D',
          language: entry.language || '',
          owned: entry.cinema.toLowerCase().includes('devgn') || entry.cinema.toLowerCase().includes('owned'),
          scraped_at: entry.scraped_at,
          pricingByShowtime: {}
        };
      } else if (entry.scraped_at) {
        // Keep the most recent scrape time
        if (!grouped[key].scraped_at || new Date(entry.scraped_at) > new Date(grouped[key].scraped_at)) {
          grouped[key].scraped_at = entry.scraped_at;
        }
      }

      // Collect all unique showtimes for this venue (also apply time filter)
      if (entry.showtime) {
        if (selectedTimeSlot === 'all' || isInTimeSlot(entry.showtime, selectedTimeSlot)) {
          grouped[key].showtimes.add(entry.showtime);
          
          if (!grouped[key].pricingByShowtime[entry.showtime]) {
            grouped[key].pricingByShowtime[entry.showtime] = [];
          }
          
          const catName = entry.seat_category && entry.seat_category !== 'N/A' ? entry.seat_category : 'Standard';
          const normCat = normalizeCategory(catName);
          
          let diff = 0;
          let hasBaseline = false;
          const bucket = getTimeBucket(entry.showtime);
          
          if (!grouped[key].owned && baselines[entry.movie] && baselines[entry.movie][bucket] && baselines[entry.movie][bucket][normCat]) {
            const baselineAvg = baselines[entry.movie][bucket][normCat].avg;
            diff = Math.round(entry.price - baselineAvg);
            hasBaseline = true;
          }

          grouped[key].pricingByShowtime[entry.showtime].push({
            category: catName,
            price: entry.price,
            diff: diff,
            hasBaseline: hasBaseline,
          });
        }
      }
    });

    // Convert showtime Sets to sorted arrays
    const result = Object.values(grouped).map(item => ({
      ...item,
      showtimes: Array.from(item.showtimes).sort((a, b) => {
        return timeToMinutes(a) - timeToMinutes(b);
      }),
    }));

    result.sort((a, b) => {
      // 1. Owned cinemas always on the left
      if (a.owned && !b.owned) return -1;
      if (!a.owned && b.owned) return 1;
      // 2. Alphabetical secondary sort
      return a.theatre.localeCompare(b.theatre);
    });

    let summary = {
      higherCount: 0,
      lowerCount: 0,
      equalCount: 0,
      totalCount: 0,
      ownedAvgPrice: 0,
      competitorAvgPrice: 0,
      ownedPriceSum: 0,
      ownedPriceCount: 0,
      compPriceSum: 0,
      compPriceCount: 0
    };

    result.forEach(item => {
      Object.values(item.pricingByShowtime).forEach(tiers => {
        tiers.forEach(tier => {
           if (item.owned) {
             summary.ownedPriceSum += tier.price;
             summary.ownedPriceCount++;
           } else {
             summary.compPriceSum += tier.price;
             summary.compPriceCount++;
             if (tier.hasBaseline) {
               summary.totalCount++;
               if (tier.diff > 0) summary.higherCount++;
               else if (tier.diff < 0) summary.lowerCount++;
               else summary.equalCount++;
             }
           }
        });
      });
    });

    if (summary.ownedPriceCount > 0) summary.ownedAvgPrice = Math.round(summary.ownedPriceSum / summary.ownedPriceCount);
    if (summary.compPriceCount > 0) summary.competitorAvgPrice = Math.round(summary.compPriceSum / summary.compPriceCount);

    return { cards: result, summary, isSelectedWeekend };
  }, [rawData, baselineData, selectedMovie, searchQuery, selectedLocation, selectedTimeSlot, selectedDate]);

  const handleExport = () => {
    if (data.length === 0) return;

    // Group data by location
    const dataByLocation = {};
    data.forEach((theatreData) => {
      const loc = theatreData.location || 'Unknown';
      if (!dataByLocation[loc]) dataByLocation[loc] = [];
      dataByLocation[loc].push(theatreData);
    });

    const workbook = XLSX.utils.book_new();

    Object.keys(dataByLocation).forEach((location) => {
      const exportData = [];

      dataByLocation[location].forEach((theatreData) => {
        theatreData.showtimes.forEach((showtime) => {
          const pricing = theatreData.pricingByShowtime[showtime] || [];
          pricing.forEach((tier) => {
            let position = 'Equal';
            let baselineStr = 'N/A';
            let diffStr = 'N/A';
            
            if (theatreData.owned) {
               position = 'Baseline (Owned)';
               baselineStr = '-';
               diffStr = '-';
            } else if (!tier.hasBaseline) {
               position = 'No Baseline';
            } else {
               baselineStr = tier.price - tier.diff;
               diffStr = tier.diff > 0 ? `+${tier.diff}` : tier.diff;
               if (tier.diff > 0) {
                 position = 'Priced Higher';
               } else if (tier.diff < 0) {
                 position = 'Priced Lower';
               } else {
                 position = 'Equal';
               }
            }

            exportData.push({
              'Cinema Name': theatreData.cinema,
              'Type': theatreData.owned ? 'Devgn Cinex' : 'Competitor',
              'Movie': theatreData.subtitle,
              'Format': theatreData.format,
              'Language': theatreData.language,
              'Showtime': showtime,
              'Seat Category': tier.category,
              'Devgn Baseline (₹)': baselineStr,
              'Price (₹)': tier.price,
              'Diff vs Baseline': diffStr,
              'Market Position': position
            });
          });
        });
      });

      if (exportData.length === 0) return;

      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // Apply Styles
      const range = XLSX.utils.decode_range(worksheet['!ref'] || "A1:A1");
      for (let C = range.s.c; C <= range.e.c; ++C) {
        // Header styles
        const headerAddress = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!worksheet[headerAddress]) continue;
        worksheet[headerAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "4F46E5" } },
          alignment: { horizontal: "center", vertical: "center" }
        };
      }

      // Body styles
      for (let R = 1; R <= range.e.r; ++R) {
        const typeCell = worksheet[XLSX.utils.encode_cell({ r: R, c: 1 })]; // Type column
        const diffCell = worksheet[XLSX.utils.encode_cell({ r: R, c: 9 })]; // Diff column is now index 9
        const posCell = worksheet[XLSX.utils.encode_cell({ r: R, c: 10 })]; // Position column is now index 10

        if (typeCell && typeCell.v === 'Devgn Cinex') {
          typeCell.s = { font: { bold: true, color: { rgb: "6D5DF6" } } };
        }

        if (posCell) {
          let color = "6B7280"; // Gray
          if (posCell.v === 'Priced Higher') color = "EF4444"; // Red
          else if (posCell.v === 'Priced Lower') color = "10B981"; // Green
          else if (posCell.v === 'Baseline (Owned)') color = "6D5DF6"; // Purple

          posCell.s = { font: { bold: true, color: { rgb: color } } };
          if (diffCell) diffCell.s = { font: { bold: true, color: { rgb: color } } };
        }
      }
      
      const colWidths = [
        { wch: 30 }, // Cinema
        { wch: 15 }, // Type
        { wch: 25 }, // Movie
        { wch: 10 }, // Format
        { wch: 10 }, // Language
        { wch: 15 }, // Showtime
        { wch: 20 }, // Category
        { wch: 18 }, // Baseline
        { wch: 10 }, // Price
        { wch: 15 }, // Diff
        { wch: 20 }, // Position
      ];
      worksheet['!cols'] = colWidths;

      // Excel sheet names can only be 31 characters
      const sheetName = location.substring(0, 31);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    XLSX.writeFile(workbook, `Pricing_Dashboard_Export_${selectedDate}.xlsx`);
  };

  if (loading) {
    return (
      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[280px] w-full animate-pulse rounded-[16px] bg-op-card/50 border border-op-border">
             <div className="p-6 h-full flex flex-col justify-between">
                <div>
                   <div className="h-6 w-3/4 rounded-md bg-op-border mb-2" />
                   <div className="h-4 w-1/2 rounded-md bg-op-border" />
                </div>
                <div className="space-y-3">
                   <div className="h-8 w-full rounded-md bg-op-border" />
                   <div className="h-8 w-full rounded-md bg-op-border" />
                </div>
             </div>
          </div>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        {/* Header section with Manual Refresh button */}
        <div className="flex justify-between items-center bg-op-card/50 p-6 rounded-[16px] border border-op-border">
          <div>
            <h2 className="text-2xl font-bold text-op-textMain">Pricing Dashboard</h2>
            <p className="text-sm text-op-muted mt-1">Real-time overview of movie ticket prices</p>
          </div>
        </div>

        <div className="flex h-[400px] w-full items-center justify-center rounded-[24px] border border-dashed border-op-border bg-op-card/30 backdrop-blur-md">
          <div className="text-center text-op-muted">
            <div className="text-5xl mb-4">🎬</div>
            <h3 className="text-xl font-semibold text-op-textMain mb-2">
              {data.length === 0 
                ? searchQuery !== '' || selectedTimeSlot !== 'all' || selectedMovie !== 'all'
                  ? 'No Matches Found' : 'No Data Available'
                : 'Market Overview'}
            </h3>
            <p>
              {selectedLocation
                ? 'No movie listings available for the selected location.'
                : searchQuery !== '' || selectedTimeSlot !== 'all' || selectedMovie !== 'all'
                  ? 'Try adjusting your filters to see pricing data.'
                  : 'Run the scrapers via the Operations screen to populate the dashboard.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header section with Manual Refresh button */}
      <div className="flex justify-between items-center bg-op-card/50 p-6 rounded-[16px] border border-op-border">
        <div>
          <h2 className="text-2xl font-bold text-op-textMain">Pricing Dashboard</h2>
          <p className="text-sm text-op-muted mt-1">
            Real-time overview of movie ticket prices
            {selectedLocation && (
              <span className="text-op-muted">• {data.length} Cinemas</span>
            )}
            {selectedMovie !== 'all' && (
              <span className="ml-2 text-op-accent font-medium">• Showing: {selectedMovie}</span>
            )}
            {searchQuery !== '' && (
              <span className="ml-2 text-op-accent font-medium">• Search: "{searchQuery}"</span>
            )}
            {selectedTimeSlot !== 'all' && (
              <span className="ml-2 text-op-accent font-medium">• {selectedTimeSlot.charAt(0).toUpperCase() + selectedTimeSlot.slice(1)} shows</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-op-muted font-medium">{data.length} results</span>
          <button 
            onClick={handleExport}
            disabled={data.length === 0}
            className="flex items-center gap-2 bg-op-card hover:bg-op-border text-op-textMain text-sm font-medium py-2 px-4 rounded-lg border border-op-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>📊</span> Export to Excel
          </button>
        </div>
      </div>

      {/* Aggregate Summary */}
      {selectedLocation && summary && (summary.ownedPriceCount > 0 || summary.compPriceCount > 0) && (
        <LocationSummaryCard summary={summary} isWeekend={isSelectedWeekend} />
      )}

      {/* Responsive Grid Layout for Theatre Cards */}
      <motion.div 
        className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="show"
        key={`${searchQuery}-${selectedDate}-${selectedTimeSlot}`}
      >
        {data.map((theatreData) => (
          <CinemaCard key={theatreData.id} theatreData={theatreData} />
        ))}
      </motion.div>
    </div>
  );
}

function LocationSummaryCard({ summary, isWeekend }) {
  const higherPct = summary.totalCount > 0 ? Math.round((summary.higherCount / summary.totalCount) * 100) : 0;
  const lowerPct = summary.totalCount > 0 ? Math.round((summary.lowerCount / summary.totalCount) * 100) : 0;
  const equalPct = summary.totalCount > 0 ? Math.round((summary.equalCount / summary.totalCount) * 100) : 0;

  let positionText = "No direct comparisons available";
  let positionColor = "text-op-muted";
  
  if (summary.totalCount > 0) {
    positionText = "At par with market";
    if (higherPct > 50) {
      positionText = "Competitors priced above us";
      positionColor = "text-op-success";
    } else if (lowerPct > 50) {
      positionText = "Competitors priced below us";
      positionColor = "text-op-danger";
    }
  }

  return (
    <Card className="w-full bg-op-card/40 border-op-border backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-op-border/50">
          
          <div className="flex flex-col justify-center">
            <h4 className="text-xs font-bold uppercase tracking-widest text-op-muted mb-2">Overall Average</h4>
            <div className="flex items-end gap-4">
              <div>
                <div className="text-sm text-op-muted">Devgn Cinex</div>
                <div className="text-2xl font-bold text-op-textMain">
                  {summary.ownedAvgPrice > 0 ? `₹${summary.ownedAvgPrice}` : 'N/A'}
                </div>
              </div>
              <div className="pb-1 text-op-muted/50 text-xl font-light">vs</div>
              <div>
                <div className="text-sm text-op-muted">Competitors</div>
                <div className="text-2xl font-bold text-op-textSecondary">
                  {summary.competitorAvgPrice > 0 ? `₹${summary.competitorAvgPrice}` : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center pt-4 md:pt-0 md:pl-6 opacity-100 transition-opacity">
            <h4 className="text-xs font-bold uppercase tracking-widest text-op-muted mb-2">Comparison Split</h4>
            <div className={`flex gap-4 ${summary.totalCount === 0 ? 'opacity-30' : ''}`}>
              <div className="text-center">
                <div className="text-xl font-bold text-op-danger">{higherPct}%</div>
                <div className="text-[10px] text-op-muted uppercase mt-1">Higher</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-op-muted">{equalPct}%</div>
                <div className="text-[10px] text-op-muted uppercase mt-1">Equal</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-op-success">{lowerPct}%</div>
                <div className="text-[10px] text-op-muted uppercase mt-1">Lower</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center pt-4 md:pt-0 md:pl-6">
            <h4 className="text-xs font-bold uppercase tracking-widest text-op-muted mb-2">Market Position</h4>
            <div className={`text-xl font-bold ${positionColor}`}>
              {positionText}
            </div>
            <div className="text-xs text-op-muted mt-1">Based on {summary.totalCount} direct showtime comparisons</div>
            <div className="text-[10px] text-op-accent/80 uppercase font-bold mt-2">
              {isWeekend ? "Weekend Baseline (Fri-Sun)" : "Weekday Baseline (Mon-Thu)"}
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}

function CinemaCard({ theatreData }) {
  const [selectedShowtime, setSelectedShowtime] = useState(
    theatreData.showtimes.length > 0 ? theatreData.showtimes[0] : null
  );
  const [expandedCategory, setExpandedCategory] = useState(null);

  let hasScrapeTime = false;
  let formattedStaleTime = '';
  let timeAgoToDisplay = '';
  
  if (theatreData.scraped_at) {
    const scrapeTime = new Date(theatreData.scraped_at);
    const now = new Date();
    const minutesDiff = (now - scrapeTime) / (1000 * 60);
    
    hasScrapeTime = true;
    formattedStaleTime = scrapeTime.toLocaleString();
    
    if (minutesDiff < 60) {
      timeAgoToDisplay = `${Math.max(0, Math.floor(minutesDiff))}M AGO`;
    } else {
      const hoursDiff = minutesDiff / 60;
      timeAgoToDisplay = `${Math.floor(hoursDiff)}H AGO`;
    }
  }

  // If filters change and old showtime disappears, fallback to the first available
  useEffect(() => {
    if (theatreData.showtimes.length > 0) {
      if (!theatreData.showtimes.includes(selectedShowtime)) {
        setSelectedShowtime(theatreData.showtimes[0]);
      }
    } else {
      setSelectedShowtime(null);
    }
  }, [theatreData.showtimes, selectedShowtime]);

  const pricingToDisplay = selectedShowtime && theatreData.pricingByShowtime[selectedShowtime]
    ? theatreData.pricingByShowtime[selectedShowtime]
    : [];

  return (
    <motion.div variants={itemVariants} className="h-full">
      <Card className={`h-full flex flex-col ${theatreData.owned ? 'border-op-accent shadow-[0_0_20px_rgba(109,93,246,0.15)] ring-1 ring-op-accent' : 'hover:border-op-textSecondary/30'}`}>
        <CardHeader className="relative pb-4 flex-none">
          <CardTitle className="text-lg">{theatreData.theatre}</CardTitle>
          <p className="text-sm text-op-muted line-clamp-1 mt-1">{theatreData.subtitle}</p>
          
          <div className="flex items-center gap-2 mt-3">
            {hasScrapeTime && (
              <div className="group relative flex items-center justify-center">
                <Badge className="bg-op-card/80 text-op-muted hover:bg-op-border border border-op-border cursor-help gap-1 px-2 py-0.5 transition-colors">
                  <Clock size={10} className="stroke-[2.5px]" />
                  <span className="text-[10px] font-bold tracking-wider">{timeAgoToDisplay}</span>
                </Badge>
                {/* Custom Tooltip */}
                <div className="pointer-events-none absolute bottom-full left-0 mb-2 w-48 opacity-0 transition-opacity group-hover:opacity-100 z-50">
                  <div className="rounded-md bg-op-card/95 border border-op-border px-3 py-2 text-xs text-op-textMain shadow-lg backdrop-blur-md whitespace-normal">
                    <span className="text-op-muted font-bold">Heads up:</span> Last updated at {formattedStaleTime}
                  </div>
                </div>
              </div>
            )}
            {theatreData.owned && (
              <Badge variant="owned" className="bg-op-accent text-white shadow-sm px-2 py-0.5 text-[10px] font-bold tracking-wider">
                OWNED
              </Badge>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="flex flex-col gap-4 flex-1">
          <div className="flex flex-wrap items-center gap-2 max-h-[52px] overflow-y-auto pb-1">
            {theatreData.showtimes.length > 0 ? (
              theatreData.showtimes.map((st, i) => {
                const isSelected = st === selectedShowtime;
                return (
                  <Badge 
                    key={i} 
                    variant="default" 
                    onClick={() => setSelectedShowtime(st)}
                    className={`text-xs shrink-0 cursor-pointer transition-colors select-none ${
                      isSelected 
                      ? 'bg-op-accent text-white hover:bg-op-accent/90' 
                      : 'bg-op-bg/50 border-op-border hover:bg-op-border hover:text-op-textMain'
                    }`}
                  >
                    {st}
                  </Badge>
                );
              })
            ) : (
              <Badge variant="default" className="bg-op-bg/50 border-op-border text-xs">N/A</Badge>
            )}
            
            {/* Format and Language tags */}
            <div className="flex gap-2 ml-auto">
              <Badge variant="default" className="bg-op-accent/15 border-op-accent/30 text-op-accent text-xs shrink-0">{theatreData.format}</Badge>
              {theatreData.language && (
                <Badge variant="default" className="bg-emerald-500/15 border-emerald-500/30 text-emerald-400 text-xs shrink-0">{theatreData.language}</Badge>
              )}
            </div>
          </div>
          
          <div className="h-px w-full bg-op-border/50 my-1" />
          
          <div className="flex flex-col gap-3 flex-1 justify-start">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-op-muted mb-1">
              Ticket Categories {selectedShowtime ? `(${selectedShowtime})` : ''}
            </h4>
            
            {pricingToDisplay.length > 0 ? (
              pricingToDisplay.map((tier, idx) => (
                <div key={`${tier.category}-${idx}`} className="flex flex-col">
                  <div className="flex items-center justify-between group">
                    <span className="text-sm font-medium text-op-textSecondary transition-colors group-hover:text-op-textMain line-clamp-1 mr-4">
                      {tier.category}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button 
                        onClick={() => setExpandedCategory(expandedCategory === tier.category ? null : tier.category)}
                        className="text-op-muted hover:text-op-accent text-xs p-1"
                        title="View Price Trend"
                      >
                        📈
                      </button>
                      {!theatreData.owned && tier.hasBaseline && tier.diff !== 0 && (
                        <span className={`text-xs font-semibold ${tier.diff > 0 ? 'text-op-danger' : 'text-op-success'}`}>
                          {tier.diff > 0 ? `↑${tier.diff}` : `↓${Math.abs(tier.diff)}`}
                        </span>
                      )}
                      {!theatreData.owned && (!tier.hasBaseline || tier.diff === 0) && (
                        <span className="text-xs font-semibold text-op-muted">-</span>
                      )}
                      <span className="text-sm font-mono font-medium text-op-textMain w-12 text-right">₹{tier.price}</span>
                    </div>
                  </div>
                  {expandedCategory === tier.category && (
                    <div className="mt-2 mb-2 p-2 bg-op-bg/30 rounded-lg border border-op-border/50">
                      <TrendChart 
                        cinema={theatreData.cinema}
                        location={theatreData.location}
                        movie={theatreData.subtitle}
                        seat_category={tier.category}
                        date={theatreData.date}
                        showtime={selectedShowtime}
                      />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-op-muted italic mt-2">No pricing available</div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

