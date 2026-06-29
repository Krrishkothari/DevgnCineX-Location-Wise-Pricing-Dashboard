import React from 'react';
import { motion } from 'framer-motion';
import { Settings2 } from 'lucide-react';

export function TheatreManagementScreen() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-[600px] flex-col"
    >
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-op-textMain">Theatre Management</h1>
      
      <div className="flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-op-border bg-op-card/50">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-op-border/50 text-op-muted">
            <Settings2 size={40} />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-op-textMain">Theatre Configuration</h2>
          <p className="text-sm text-op-muted">
            Manage tracked theatres, competitor mappings and grouping tags. Connect new cinema chains to your monitoring network.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
