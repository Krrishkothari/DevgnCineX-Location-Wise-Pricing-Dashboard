import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

const mockData = [
  {
    id: 1,
    theatre: 'Devgn CineX: Juhu',
    subtitle: 'Dune: Part Two',
    time: '10:00 AM',
    format: 'IMAX 2D',
    owned: true,
    pricing: [
      { category: 'Classic', price: 250, diff: 0 },
      { category: 'Prime', price: 350, diff: 0 },
      { category: 'Prime Plus', price: 500, diff: 0 },
    ]
  },
  {
    id: 2,
    theatre: 'PVR: Phoenix Palladium',
    subtitle: 'Dune: Part Two',
    time: '10:15 AM',
    format: 'IMAX 2D',
    owned: false,
    pricing: [
      { category: 'Classic', price: 280, diff: 30 },
      { category: 'Prime', price: 380, diff: 30 },
      { category: 'Prime Plus', price: 550, diff: 50 },
    ]
  },
  {
    id: 3,
    theatre: 'INOX: R-City Ghatkopar',
    subtitle: 'Dune: Part Two',
    time: '10:00 AM',
    format: 'IMAX 2D',
    owned: false,
    pricing: [
      { category: 'Classic', price: 230, diff: -20 },
      { category: 'Prime', price: 340, diff: -10 },
      { category: 'Prime Plus', price: 480, diff: -20 },
    ]
  },
  {
    id: 4,
    theatre: 'Cinepolis: Andheri West',
    subtitle: 'Dune: Part Two',
    time: '09:45 AM',
    format: 'IMAX 2D',
    owned: false,
    pricing: [
      { category: 'Classic', price: 250, diff: 0 },
      { category: 'Prime', price: 360, diff: 10 },
      { category: 'Prime Plus', price: 520, diff: 20 },
    ]
  }
];

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
          {mockData.map((data) => (
            <motion.div key={data.id} variants={itemVariants}>
              <Card className={`w-[340px] shrink-0 ${data.owned ? 'border-op-accent shadow-[0_0_15px_rgba(109,93,246,0.15)]' : ''}`}>
                <CardHeader className="relative pb-4">
                  {data.owned && (
                    <Badge variant="owned" className="absolute right-6 top-6">
                      OWNED
                    </Badge>
                  )}
                  <CardTitle className="text-xl pr-16">{data.theatre}</CardTitle>
                  <p className="text-sm text-op-muted">{data.subtitle}</p>
                </CardHeader>
                
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{data.time}</Badge>
                    <Badge variant="default">Exact</Badge>
                    <Badge variant="default">{data.format}</Badge>
                  </div>
                  
                  <div className="h-px w-full bg-op-border my-2" />
                  
                  <div className="flex flex-col gap-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-op-muted mb-1">Ticket Categories</h4>
                    
                    {data.pricing.map((tier) => (
                      <div key={tier.category} className="flex items-center justify-between">
                        <span className="text-sm font-medium text-op-textSecondary">{tier.category}</span>
                        <div className="flex items-center gap-3">
                          {!data.owned && tier.diff !== 0 && (
                            <span className={`text-xs font-semibold ${tier.diff > 0 ? 'text-op-danger' : 'text-op-success'}`}>
                              {tier.diff > 0 ? `↑${tier.diff}` : `↓${Math.abs(tier.diff)}`}
                            </span>
                          )}
                          {!data.owned && tier.diff === 0 && (
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
