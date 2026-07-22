import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useDates, useMovies } from '../api/hooks';

const FilterContext = createContext(null);

export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) throw new Error('useFilters must be used within a FilterProvider');
  return context;
}

const DEFAULTS = {
  movie: 'all',
  location: '',
  timeSlot: 'all',
  language: 'all',
  format: 'all',
  segment: 'all',
};

export function FilterProvider({ children }) {
  const [filters, setFilters] = useState(DEFAULTS);
  const [date, setDate] = useState('');

  // Language and format options depend on what the current result set actually
  // contains, so the dashboard publishes them back up here.
  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [availableFormats, setAvailableFormats] = useState([]);

  const datesQuery = useDates();
  const moviesQuery = useMovies(date, filters.location);

  const dates = datesQuery.data ?? [];
  const movies = moviesQuery.data ?? [];

  // Default to the first available date once they load.
  useEffect(() => {
    if (!date && dates.length > 0) setDate(dates[0].value);
  }, [date, dates]);

  // Drop selections that the new option set no longer offers, instead of
  // leaving a filter active that silently matches nothing.
  useEffect(() => {
    if (filters.movie !== 'all' && movies.length > 0 && !movies.includes(filters.movie)) {
      setFilters((f) => ({ ...f, movie: 'all' }));
    }
  }, [movies, filters.movie]);

  useEffect(() => {
    setFilters((f) => ({
      ...f,
      language: f.language !== 'all' && !availableLanguages.includes(f.language) ? 'all' : f.language,
      format: f.format !== 'all' && !availableFormats.includes(f.format) ? 'all' : f.format,
    }));
  }, [availableLanguages, availableFormats]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const activeCount = useMemo(
    () =>
      Object.entries(filters).filter(([key, value]) => value !== DEFAULTS[key]).length,
    [filters]
  );

  const value = {
    ...filters,
    date,
    dates,
    movies,
    availableLanguages,
    availableFormats,
    activeCount,
    datesQuery,
    moviesQuery,
    setDate,
    setFilter,
    setAvailableLanguages,
    setAvailableFormats,
    reset: () => setFilters(DEFAULTS),
  };

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}
