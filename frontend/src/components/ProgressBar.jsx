import { useState, useEffect } from 'react';

export function ProgressBar() {
  const [progress, setProgress] = useState(null);
  const [etaStr, setEtaStr] = useState('');

  useEffect(() => {
    // Poll the backend progress endpoint
    const fetchProgress = async () => {
      try {
        const response = await fetch('/api/progress');
        if (response.ok) {
          const data = await response.json();
          setProgress(data);
        }
      } catch (error) {
        console.error('Failed to fetch progress:', error);
      }
    };

    fetchProgress();
    const interval = setInterval(fetchProgress, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!progress || progress.current === progress.total) {
      setEtaStr('');
      return;
    }

    // Calculate the fixed ETA in milliseconds based on the time this progress snapshot was taken
    const elapsedMs = Date.now() - progress.startTime;
    const completedItems = progress.completed !== undefined ? progress.completed : (progress.current - 1);
    
    if (completedItems <= 0 || elapsedMs <= 0) {
      setEtaStr('Calculating...');
      return;
    }
    
    const timePerItemMs = elapsedMs / completedItems;
    const remainingItems = progress.total - completedItems;
    let currentEtaMs = remainingItems * timePerItemMs;

    const updateEtaString = () => {
      if (currentEtaMs < 0) currentEtaMs = 0;
      const totalSeconds = Math.max(0, Math.floor(currentEtaMs / 1000));
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      setEtaStr(`${m}m ${s}s`);
      currentEtaMs -= 1000; // Decrement by 1 second for the next tick
    };

    updateEtaString();
    const interval = setInterval(updateEtaString, 1000);
    return () => clearInterval(interval);
  }, [progress]);

  // Hide if no progress, or if done, or if the data is stale (e.g. older than 2 hours)
  if (!progress || progress.current === progress.total) return null;
  const isStale = (Date.now() - progress.startTime) > 2 * 60 * 60 * 1000;
  if (isStale) return null;

  const percentage = Math.min(100, Math.round((progress.current / progress.total) * 100));

  return (
    <div className="bg-op-card border border-op-border rounded-xl p-4 shadow-sm mb-6 animate-pulse-slow">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold text-op-textMain flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-op-accent animate-ping inline-block"></span>
          Live Scraper Progress
        </h3>
        <span className="text-sm font-mono text-op-accent">{percentage}%</span>
      </div>
      
      <div className="w-full bg-op-bg rounded-full h-2.5 mb-2 overflow-hidden border border-op-border/50">
        <div 
          className="bg-op-accent h-2.5 rounded-full transition-all duration-1000 ease-out relative overflow-hidden" 
          style={{ width: `${percentage}%` }}
        >
          <div className="absolute inset-0 bg-white/20 animate-shimmer" style={{ width: '200%' }}></div>
        </div>
      </div>
      
      <div className="flex justify-between items-center text-xs text-op-textSecondary">
        <span>Processing: <strong className="text-op-textMain">{progress.movie}</strong> ({progress.current}/{progress.total})</span>
        <span className="font-mono">ETA: {etaStr}</span>
      </div>
    </div>
  );
}
