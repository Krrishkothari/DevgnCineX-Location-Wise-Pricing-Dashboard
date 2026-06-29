import React from 'react';
import { Calendar, Clock, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function TopHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-op-border bg-op-bg/80 px-6 backdrop-blur-md">
      
      {/* Filter Controls */}
      <div className="flex items-center gap-4">
        {/* Movie Selector */}
        <select className="h-10 cursor-pointer appearance-none rounded-[12px] border border-op-border bg-op-card px-4 pr-8 text-sm font-medium text-op-textMain outline-none transition-colors hover:border-op-muted focus:border-op-accent">
          <option>Dune: Part Two</option>
          <option>Oppenheimer</option>
          <option>Deadpool & Wolverine</option>
        </select>

        {/* Date Picker (Mock) */}
        <div className="flex h-10 items-center gap-2 rounded-[12px] border border-op-border bg-op-card px-4 text-sm font-medium text-op-textMain">
          <Calendar size={16} className="text-op-muted" />
          <span>2026-05-24</span>
        </div>

        {/* Time Selector (Mock) */}
        <div className="flex h-10 items-center gap-2 rounded-[12px] border border-op-border bg-op-card px-4 text-sm font-medium text-op-textMain">
          <Clock size={16} className="text-op-muted" />
          <span>10:00 Standard</span>
        </div>
      </div>

      {/* Status & Actions */}
      <div className="flex items-center gap-6">
        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          <div className="relative flex h-2 w-2 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-op-success opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-op-success"></span>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-op-success">Live</span>
        </div>

        {/* Refresh Button */}
        <Button variant="ghost" size="icon" className="group rounded-full bg-op-card border border-op-border hover:bg-op-border">
          <RefreshCw size={16} className="text-op-textMain transition-transform duration-500 group-hover:rotate-180" />
        </Button>
      </div>

    </header>
  );
}
