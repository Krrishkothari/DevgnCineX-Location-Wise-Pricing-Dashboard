import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { fetchPrices, triggerScrape } from '../api';
import { useFilters } from '../layout/MainLayout';

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

export function DashboardScreen() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);

  const { selectedMovie, selectedLocation, selectedDate, selectedTimeSlot } = useFilters();

  const loadData = async () => {
    setLoading(true);
    const res = await fetchPrices(selectedDate);
    setRawData(res.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (selectedDate) {
      loadData();
    }
    
    // Auto-poll every 5 seconds to show incremental scraper updates
    const interval = setInterval(async () => {
      if (selectedDate) {
        const res = await fetchPrices(selectedDate);
        setRawData(res.data || []);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedDate]);

  // Apply filters and group data
  const data = useMemo(() => {
    // Step 1: Filter by selected movie
    let filtered = rawData;
    if (selectedMovie !== 'all') {
      filtered = filtered.filter((entry) => entry.movie === selectedMovie);
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

    // Step 4: Calculate Devgn Cinex baseline averages per bucket
    const baselines = {};
    filtered.forEach(entry => {
      const isOwned = entry.cinema.toLowerCase().includes('devgn') || entry.cinema.toLowerCase().includes('owned');
      if (isOwned && entry.showtime && entry.price) {
        if (!baselines[entry.movie]) baselines[entry.movie] = {};
        
        const bucket = getTimeBucket(entry.showtime);
        if (!baselines[entry.movie][bucket]) baselines[entry.movie][bucket] = {};
        
        const catName = entry.seat_category && entry.seat_category !== 'N/A' ? entry.seat_category : 'Standard';
        if (!baselines[entry.movie][bucket][catName]) {
          baselines[entry.movie][bucket][catName] = { sum: 0, count: 0, avg: 0 };
        }
        
        baselines[entry.movie][bucket][catName].sum += entry.price;
        baselines[entry.movie][bucket][catName].count += 1;
        baselines[entry.movie][bucket][catName].avg = baselines[entry.movie][bucket][catName].sum / baselines[entry.movie][bucket][catName].count;
      }
    });

    // Step 5: Group into cards and calculate diffs
    const grouped = {};

    filtered.forEach((entry) => {
      const key = `${entry.cinema}-${entry.location}-${entry.movie}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          theatre: `${entry.cinema}: ${entry.location}`,
          subtitle: entry.movie,
          showtimes: new Set(),
          format: entry.format || '2D',
          language: entry.language || '',
          owned: entry.cinema.toLowerCase().includes('devgn') || entry.cinema.toLowerCase().includes('owned'),
          pricingByShowtime: {}
        };
      }

      // Collect all unique showtimes for this venue (also apply time filter)
      if (entry.showtime) {
        if (selectedTimeSlot === 'all' || isInTimeSlot(entry.showtime, selectedTimeSlot)) {
          grouped[key].showtimes.add(entry.showtime);
          
          if (!grouped[key].pricingByShowtime[entry.showtime]) {
            grouped[key].pricingByShowtime[entry.showtime] = [];
          }
          
          const catName = entry.seat_category && entry.seat_category !== 'N/A' ? entry.seat_category : 'Standard';
          
          let diff = 0;
          let hasBaseline = false;
          const bucket = getTimeBucket(entry.showtime);
          
          if (!grouped[key].owned && baselines[entry.movie] && baselines[entry.movie][bucket] && baselines[entry.movie][bucket][catName]) {
            const baselineAvg = baselines[entry.movie][bucket][catName].avg;
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

    console.log("DashboardScreen Debug:", { 
      raw: rawData.length, 
      selectedDate, 
      selectedLocation, 
      filtered: filtered.length, 
      result: result.length 
    });

    return result;
  }, [rawData, selectedMovie, selectedLocation, selectedTimeSlot]);

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
            <h3 className="text-xl font-semibold text-op-textMain mb-2">No results found</h3>
            <p>
              {selectedLocation
                ? 'No movie listings available for the selected location.'
                : selectedMovie !== 'all' || selectedTimeSlot !== 'all'
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
              <span className="ml-2 text-op-accent font-medium">• Location: {selectedLocation}</span>
            )}
            {selectedMovie !== 'all' && (
              <span className="ml-2 text-op-accent font-medium">• Showing: {selectedMovie}</span>
            )}
            {selectedTimeSlot !== 'all' && (
              <span className="ml-2 text-op-accent font-medium">• {selectedTimeSlot.charAt(0).toUpperCase() + selectedTimeSlot.slice(1)} shows</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-op-muted font-medium">{data.length} results</span>
        </div>
      </div>

      {/* Responsive Grid Layout for Theatre Cards */}
      <motion.div 
        className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="show"
        key={`${selectedMovie}-${selectedDate}-${selectedTimeSlot}`}
      >
        {data.map((theatreData) => (
          <CinemaCard key={theatreData.id} theatreData={theatreData} />
        ))}
      </motion.div>
    </div>
  );
}

function CinemaCard({ theatreData }) {
  const [selectedShowtime, setSelectedShowtime] = useState(
    theatreData.showtimes.length > 0 ? theatreData.showtimes[0] : null
  );

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
          {theatreData.owned && (
            <Badge variant="owned" className="absolute right-6 top-6 bg-op-accent text-white shadow-sm">
              OWNED
            </Badge>
          )}
          <CardTitle className="text-lg pr-16 line-clamp-1">{theatreData.theatre}</CardTitle>
          <p className="text-sm text-op-muted line-clamp-1 mt-1">{theatreData.subtitle}</p>
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
                <div key={`${tier.category}-${idx}`} className="flex items-center justify-between group">
                  <span className="text-sm font-medium text-op-textSecondary transition-colors group-hover:text-op-textMain line-clamp-1 mr-4">
                    {tier.category}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
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

