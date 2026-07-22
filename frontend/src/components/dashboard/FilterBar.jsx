import { useState } from 'react';
import { Calendar, Clock, Film, Languages, MapPin, Monitor, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { useFilters } from '../../lib/filters';
import { TIME_SLOTS } from '../../lib/pricing';
import { cn } from '../../utils/cn';

const toOptions = (values, allLabel) => [
  ...(allLabel ? [{ value: 'all', label: allLabel }] : []),
  ...values.map((value) => ({ value, label: value })),
];

/**
 * Filter controls. On mobile these collapse behind a single button — six
 * always-visible dropdowns previously stacked into a sticky tower that could
 * consume the entire viewport on a phone.
 */
export function FilterBar({ locations }) {
  const [open, setOpen] = useState(false);
  const {
    date, dates, movie, movies, location, timeSlot, language, format,
    availableLanguages, availableFormats, activeCount,
    setDate, setFilter, reset,
  } = useFilters();

  const controls = (
    <>
      <Select
        label="Date"
        icon={Calendar}
        value={date}
        onChange={setDate}
        options={dates.map((d) => ({ value: d.value, label: d.label }))}
        className="sm:w-48"
      />
      <Select
        label="Location"
        icon={MapPin}
        value={location}
        onChange={(value) => setFilter('location', value)}
        options={locations.map((l) => ({ value: l, label: l }))}
        placeholder="All locations"
        className="sm:w-44"
      />
      <Select
        label="Movie"
        icon={Film}
        value={movie}
        onChange={(value) => setFilter('movie', value)}
        options={toOptions(movies, 'All movies')}
        className="sm:w-52"
      />
      <Select
        label="Showtime"
        icon={Clock}
        value={timeSlot}
        onChange={(value) => setFilter('timeSlot', value)}
        options={TIME_SLOTS.map((s) => ({ value: s.value, label: s.label }))}
        className="sm:w-40"
      />
      <Select
        label="Language"
        icon={Languages}
        value={language}
        onChange={(value) => setFilter('language', value)}
        options={toOptions(availableLanguages, 'All languages')}
        disabled={availableLanguages.length === 0}
        className="sm:w-40"
      />
      <Select
        label="Format"
        icon={Monitor}
        value={format}
        onChange={(value) => setFilter('format', value)}
        options={toOptions(availableFormats, 'All formats')}
        disabled={availableFormats.length === 0}
        className="sm:w-36"
      />
    </>
  );

  return (
    <>
      {/* Mobile: one button, expandable panel */}
      <div className="flex items-center gap-2 sm:hidden">
        <Button
          variant="secondary"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="filter-panel"
          className="flex-1"
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 rounded-pill bg-brand px-1.5 text-[11px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" size="icon" onClick={reset} aria-label="Clear all filters">
            <X size={16} aria-hidden="true" />
          </Button>
        )}
      </div>

      <div
        id="filter-panel"
        className={cn(
          'grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end',
          open ? 'grid' : 'hidden sm:flex'
        )}
      >
        {controls}
        {activeCount > 0 && (
          <Button variant="ghost" onClick={reset} className="hidden sm:inline-flex sm:h-10">
            <X size={14} aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>
    </>
  );
}
