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

export function DashboardScreen() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { selectedMovie, selectedDate, selectedTimeSlot } = useFilters();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await triggerScrape();
      alert('Scrape triggered successfully! The data will update in the background. Please wait a minute and refresh the page manually.');
    } catch (err) {
      alert('Failed to trigger scrape. Please ensure the backend is running.');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const res = await fetchPrices(selectedDate);
      setRawData(res.data || []);
      setLoading(false);
    }

    if (selectedDate) {
      loadData();
    }
  }, [selectedDate]);

  // Apply filters and group data
  const data = useMemo(() => {
    // Step 1: Filter by selected movie
    let filtered = rawData;
    if (selectedMovie !== 'all') {
      filtered = filtered.filter((entry) => entry.movie === selectedMovie);
    }

    // Step 2: Filter by time slot (check showtime against slot ranges)
    if (selectedTimeSlot !== 'all') {
      filtered = filtered.filter((entry) => {
        if (!entry.showtime) return false;
        return isInTimeSlot(entry.showtime, selectedTimeSlot);
      });
    }

    // Step 3: Group into cards
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
          pricing: []
        };
      }

      // Collect all unique showtimes for this venue (also apply time filter)
      if (entry.showtime) {
        if (selectedTimeSlot === 'all' || isInTimeSlot(entry.showtime, selectedTimeSlot)) {
          grouped[key].showtimes.add(entry.showtime);
        }
      }

      grouped[key].pricing.push({
        category: entry.seat_category && entry.seat_category !== 'N/A' ? entry.seat_category : 'Standard',
        price: entry.price,
        diff: 0,
      });
    });

    // Convert showtime Sets to sorted arrays
    const result = Object.values(grouped).map(item => ({
      ...item,
      showtimes: Array.from(item.showtimes).sort((a, b) => {
        return timeToMinutes(a) - timeToMinutes(b);
      }),
    }));

    return result;
  }, [rawData, selectedMovie, selectedTimeSlot]);

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
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium shadow-sm transition-all ${
              isRefreshing 
              ? 'bg-op-border text-op-muted cursor-not-allowed' 
              : 'bg-op-accent text-white hover:bg-op-accent/90 hover:shadow-md hover:-translate-y-0.5'
            }`}
          >
            Manual Refresh
          </button>
        </div>

        <div className="flex h-[400px] w-full items-center justify-center rounded-[24px] border border-dashed border-op-border bg-op-card/30 backdrop-blur-md">
          <div className="text-center text-op-muted">
            <div className="text-5xl mb-4">🎬</div>
            <h3 className="text-xl font-semibold text-op-textMain mb-2">No results found</h3>
            <p>
              {selectedMovie !== 'all' || selectedTimeSlot !== 'all'
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
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium shadow-sm transition-all ${
              isRefreshing 
              ? 'bg-op-border text-op-muted cursor-not-allowed' 
              : 'bg-op-accent text-white hover:bg-op-accent/90 hover:shadow-md hover:-translate-y-0.5'
            }`}
          >
            {isRefreshing ? (
              <>
                <svg className="animate-spin h-5 w-5 mr-2 text-op-muted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Triggering Scrape...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Manual Refresh
              </>
            )}
          </button>
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
          <motion.div key={theatreData.id} variants={itemVariants} className="h-full">
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
                <div className="flex flex-wrap items-center gap-2 max-h-[52px] overflow-y-auto">
                  {theatreData.showtimes.length > 0 ? (
                    theatreData.showtimes.map((st, i) => (
                      <Badge key={i} variant="default" className="bg-op-bg/50 border-op-border text-xs shrink-0">{st}</Badge>
                    ))
                  ) : (
                    <Badge variant="default" className="bg-op-bg/50 border-op-border text-xs">N/A</Badge>
                  )}
                  <Badge variant="default" className="bg-op-accent/15 border-op-accent/30 text-op-accent text-xs shrink-0">{theatreData.format}</Badge>
                  {theatreData.language && (
                    <Badge variant="default" className="bg-emerald-500/15 border-emerald-500/30 text-emerald-400 text-xs shrink-0">{theatreData.language}</Badge>
                  )}
                </div>
                
                <div className="h-px w-full bg-op-border/50 my-2" />
                
                <div className="flex flex-col gap-3 flex-1 justify-end">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-op-muted mb-1">Ticket Categories</h4>
                  
                  {theatreData.pricing.map((tier, idx) => (
                    <div key={`${tier.category}-${idx}`} className="flex items-center justify-between group">
                      <span className="text-sm font-medium text-op-textSecondary transition-colors group-hover:text-op-textMain line-clamp-1 mr-4">
                        {tier.category}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        {!theatreData.owned && tier.diff !== 0 && (
                          <span className={`text-xs font-semibold ${tier.diff > 0 ? 'text-op-danger' : 'text-op-success'}`}>
                            {tier.diff > 0 ? `↑${tier.diff}` : `↓${Math.abs(tier.diff)}`}
                          </span>
                        )}
                        {!theatreData.owned && tier.diff === 0 && (
                          <span className="text-xs font-semibold text-op-muted">-</span>
                        )}
                        <span className="text-sm font-mono font-medium text-op-textMain w-12 text-right">₹{tier.price}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
