import React from 'react';
import { Calendar, Clock, Film, ChevronDown, RefreshCw, MapPin } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useFilters } from './MainLayout';
import { triggerScrape } from '../api';

const TIME_SLOTS = [
  { value: 'all', label: 'All Slots' },
  { value: 'morning', label: '🌅  Morning' },
  { value: 'afternoon', label: '☀️  Afternoon' },
  { value: 'evening', label: '🌇  Evening' },
  { value: 'night', label: '🌙  Night' },
];

const TARGET_LOCATIONS = [
  'Ahmedabad', 'Anand', 'Bahadurgarh', 'Bhuj', 'Gandhinagar', 'Ghaziabad', 
  'Ghazipur', 'Gurugram', 'Guwahati', 'Hapur', 'Kanpur', 'Meerut', 
  'Mulund', 'Raebareli', 'Ratlam', 'Surendranagar', 'Thane'
];

export function TopHeader() {
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await triggerScrape();
      alert('Scrape triggered successfully! The data is updating in the background and will refresh automatically.');
    } catch (err) {
      alert('Failed to trigger scrape. Please ensure the backend is running.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const {
    movies,
    dates,
    selectedMovie,
    selectedLocation,
    selectedDate,
    selectedTimeSlot,
    setSelectedMovie,
    setSelectedLocation,
    setSelectedDate,
    setSelectedTimeSlot,
  } = useFilters();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-op-border bg-op-bg/80 px-6 backdrop-blur-md">
      
      {/* Filter Controls */}
      <div className="flex items-center gap-3">
        {/* Movie Selector */}
        <div className="relative group">
          <Film size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-op-muted pointer-events-none group-hover:text-op-accent transition-colors" />
          <select
            value={selectedMovie}
            onChange={(e) => setSelectedMovie(e.target.value)}
            className="h-10 cursor-pointer appearance-none rounded-[12px] border border-op-border bg-op-card pl-10 pr-10 text-sm font-medium text-op-textMain outline-none transition-all hover:border-op-accent/50 focus:border-op-accent focus:ring-1 focus:ring-op-accent/30 min-w-[200px]"
          >
            <option value="all">All Movies</option>
            {movies.map((movie) => (
              <option key={movie} value={movie}>
                {movie}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-op-muted pointer-events-none" />
        </div>

        {/* Location Selector */}
        <div className="relative group">
          <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-op-muted pointer-events-none group-hover:text-op-accent transition-colors" />
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="h-10 cursor-pointer appearance-none rounded-[12px] border border-op-border bg-op-card pl-10 pr-10 text-sm font-medium text-op-textMain outline-none transition-all hover:border-op-accent/50 focus:border-op-accent focus:ring-1 focus:ring-op-accent/30 min-w-[180px]"
          >
            <option value="">Select Location</option>
            {TARGET_LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-op-muted pointer-events-none" />
        </div>

        {/* Date Selector */}
        <div className="relative group">
          <Calendar size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-op-muted pointer-events-none group-hover:text-op-accent transition-colors" />
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-10 cursor-pointer appearance-none rounded-[12px] border border-op-border bg-op-card pl-10 pr-10 text-sm font-medium text-op-textMain outline-none transition-all hover:border-op-accent/50 focus:border-op-accent focus:ring-1 focus:ring-op-accent/30 min-w-[180px]"
          >
            {dates.map((date) => (
              <option key={date.value} value={date.value}>
                {date.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-op-muted pointer-events-none" />
        </div>

        {/* Time Slot Selector */}
        <div className="relative group">
          <Clock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-op-muted pointer-events-none group-hover:text-op-accent transition-colors" />
          <select
            value={selectedTimeSlot}
            onChange={(e) => setSelectedTimeSlot(e.target.value)}
            className="h-10 cursor-pointer appearance-none rounded-[12px] border border-op-border bg-op-card pl-10 pr-10 text-sm font-medium text-op-textMain outline-none transition-all hover:border-op-accent/50 focus:border-op-accent focus:ring-1 focus:ring-op-accent/30 min-w-[170px]"
          >
            {TIME_SLOTS.map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-op-muted pointer-events-none" />
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
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={`group rounded-full border border-op-border ${isRefreshing ? 'bg-op-border text-op-muted' : 'bg-op-card hover:bg-op-border'}`}
        >
          <RefreshCw size={16} className={`text-op-textMain transition-transform duration-500 ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
        </Button>
      </div>

    </header>
  );
}
