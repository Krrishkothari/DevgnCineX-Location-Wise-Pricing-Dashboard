import React from 'react';
import { motion } from 'framer-motion';
import { CloudSun } from 'lucide-react';

export function AlertsScreen() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-[700px] flex-col"
    >
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-op-textMain">Pricing Alerts</h1>
          <p className="text-sm text-op-muted">Monitor significant competitor price changes.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <select className="h-9 cursor-pointer appearance-none rounded-[12px] border border-op-border bg-op-card px-4 pr-8 text-sm font-medium text-op-textMain outline-none transition-colors hover:border-op-muted focus:border-op-accent">
            <option>Mumbai</option>
            <option>Delhi NCR</option>
          </select>
          <select className="h-9 cursor-pointer appearance-none rounded-[12px] border border-op-border bg-op-card px-4 pr-8 text-sm font-medium text-op-textMain outline-none transition-colors hover:border-op-muted focus:border-op-accent">
            <option>All Alert Types</option>
            <option>Price Drop</option>
            <option>Price Hike</option>
          </select>
        </div>
      </div>
      
      <div className="flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-op-border bg-op-card/50">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-[#00D26A]/10 text-[#00D26A] shadow-[0_0_30px_rgba(0,210,106,0.15)]">
            <CloudSun size={48} strokeWidth={1.5} />
          </div>
          <h2 className="mb-2 text-2xl font-semibold text-op-textMain">Clear skies</h2>
          <p className="text-sm text-op-muted">
            No active alerts matching your criteria. Competitor pricing remains stable within defined tolerances.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
