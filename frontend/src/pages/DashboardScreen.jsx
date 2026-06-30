import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { fetchPrices } from '../api';

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

export function DashboardScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const res = await fetchPrices();
      
      const grouped = {};

      res.data.forEach((entry) => {
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

        // Collect all unique showtimes for this venue
        if (entry.showtime) {
          grouped[key].showtimes.add(entry.showtime);
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
          // Sort by time: convert "12:05 PM" to comparable values
          const toMinutes = (t) => {
            const match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (!match) return 0;
            let h = parseInt(match[1]);
            const m = parseInt(match[2]);
            const period = match[3].toUpperCase();
            if (period === 'PM' && h !== 12) h += 12;
            if (period === 'AM' && h === 12) h = 0;
            return h * 60 + m;
          };
          return toMinutes(a) - toMinutes(b);
        }),
      }));

      setData(result);
      setLoading(false);
    }

    loadData();
  }, []);

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
      <div className="flex h-[600px] w-full items-center justify-center rounded-[24px] border border-dashed border-op-border bg-op-card/30 backdrop-blur-md">
        <div className="text-center text-op-muted">
           <h3 className="text-xl font-semibold text-op-textMain mb-2">No pricing data available</h3>
           <p>Run the scrapers via the Operations screen to populate the dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Responsive Grid Layout for Theatre Cards */}
      <motion.div 
        className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="show"
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
