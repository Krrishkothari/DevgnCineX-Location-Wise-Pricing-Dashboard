import React, { useState, useEffect, createContext, useContext } from 'react';
import { Outlet } from 'react-router-dom';
import { TopHeader } from './TopHeader';
import { fetchMovies, fetchDates } from '../api';

// Create a context for filters so any page can access them
export const FilterContext = createContext();

export function useFilters() {
  return useContext(FilterContext);
}

export function MainLayout() {
  const [movies, setMovies] = useState([]);
  const [dates, setDates] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('all');

  // Fetch dates on mount
  useEffect(() => {
    async function loadDates() {
      const datesRes = await fetchDates();
      setDates(datesRes.dates || []);
      if (datesRes.dates && datesRes.dates.length > 0) {
        setSelectedDate(datesRes.dates[0].value);
      }
    }
    loadDates();
  }, []);

  // Fetch movies when selectedDate or selectedLocation changes
  useEffect(() => {
    async function loadMovies() {
      if (selectedDate) {
        const moviesRes = await fetchMovies(selectedDate, selectedLocation);
        setMovies(moviesRes.movies || []);
        setSelectedMovie('all');
      }
    }
    loadMovies();
  }, [selectedDate, selectedLocation]);

  const filterValues = {
    movies,
    dates,
    selectedMovie,
    searchQuery,
    selectedLocation,
    selectedDate,
    selectedTimeSlot,
    setSelectedMovie,
    setSearchQuery,
    setSelectedLocation,
    setSelectedDate,
    setSelectedTimeSlot,
  };

  return (
    <FilterContext.Provider value={filterValues}>
      <div className="flex min-h-screen w-full bg-op-bg/50 text-op-textMain selection:bg-op-accent/30">
        <div className="flex flex-1 flex-col">
          <TopHeader />
          <main className="flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 md:p-8 lg:p-10">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </FilterContext.Provider>
  );
}
