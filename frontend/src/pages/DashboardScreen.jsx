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
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export function DashboardScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const res = await fetchPrices();
      
      // Transform raw scraper data into grouped theatre cards
      const grouped = {};

      res.data.forEach((entry) => {
        // Group by unique theatre + movie combo
        const key = `${entry.cinema}-${entry.location}-${entry.movie}`;
        
        if (!grouped[key]) {
          grouped[key] = {
            id: key,
            theatre: `${entry.cinema}: ${entry.location}`,
            subtitle: entry.movie,
            time: '10:00 AM', // Mocking time since scraper only scrapes base format
            format: entry.format || '2D',
            owned: entry.cinema.toLowerCase().includes('devgn') || entry.cinema.toLowerCase().includes('owned'), // Replace with actual logic
            pricing: []
          };
        }

        // Add pricing tiers
        grouped[key].pricing.push({
          category: entry.seat_category || 'Standard',
          price: entry.price,
          diff: 0, // Mock difference for now unless calculating historical data
        });
      });

      // Convert grouped object to array
      setData(Object.values(grouped));
      setLoading(false);
    }

    loadData();
  }, []);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="text-op-muted">Loading pricing data...</div></div>;
  }

  if (data.length === 0) {
    return <div className="flex h-full items-center justify-center"><div className="text-op-muted">No pricing data found. Please run the scrapers via the Operations screen.</div></div>;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Horizontally scrolling theatre cards */}
      <div className="w-full overflow-x-auto pb-6">
        <motion.div 
          className="flex w-max gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {data.map((theatreData) => (
            <motion.div key={theatreData.id} variants={itemVariants}>
              <Card className={`w-[340px] shrink-0 ${theatreData.owned ? 'border-op-accent shadow-[0_0_15px_rgba(109,93,246,0.15)]' : ''}`}>
                <CardHeader className="relative pb-4">
                  {theatreData.owned && (
                    <Badge variant="owned" className="absolute right-6 top-6">
                      OWNED
                    </Badge>
                  )}
                  <CardTitle className="text-xl pr-16">{theatreData.theatre}</CardTitle>
                  <p className="text-sm text-op-muted">{theatreData.subtitle}</p>
                </CardHeader>
                
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{theatreData.time}</Badge>
                    <Badge variant="default">Exact</Badge>
                    <Badge variant="default">{theatreData.format}</Badge>
                  </div>
                  
                  <div className="h-px w-full bg-op-border my-2" />
                  
                  <div className="flex flex-col gap-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-op-muted mb-1">Ticket Categories</h4>
                    
                    {theatreData.pricing.map((tier, idx) => (
                      <div key={`${tier.category}-${idx}`} className="flex items-center justify-between">
                        <span className="text-sm font-medium text-op-textSecondary">{tier.category}</span>
                        <div className="flex items-center gap-3">
                          {!theatreData.owned && tier.diff !== 0 && (
                            <span className={`text-xs font-semibold ${tier.diff > 0 ? 'text-op-danger' : 'text-op-success'}`}>
                              {tier.diff > 0 ? `↑${tier.diff}` : `↓${Math.abs(tier.diff)}`}
                            </span>
                          )}
                          {!theatreData.owned && tier.diff === 0 && (
                            <span className="text-xs font-semibold text-op-muted">-</span>
                          )}
                          <span className="text-sm font-mono text-op-textMain w-12 text-right">₹{tier.price}</span>
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
    </div>
  );
}
