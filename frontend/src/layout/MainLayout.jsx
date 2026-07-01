import React, { useState, useEffect, createContext, useContext } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
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
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('all');

  useEffect(() => {
    async function loadFilterData() {
      const [moviesRes, datesRes] = await Promise.all([fetchMovies(), fetchDates()]);
      setMovies(moviesRes.movies || []);
      setDates(datesRes.dates || []);
      // Default to today's date
      if (datesRes.dates && datesRes.dates.length > 0) {
        setSelectedDate(datesRes.dates[0].value);
      }
    }
    loadFilterData();
  }, []);

  const filterValues = {
    movies,
    dates,
    selectedMovie,
    selectedDate,
    selectedTimeSlot,
    setSelectedMovie,
    setSelectedDate,
    setSelectedTimeSlot,
  };

  return (
    <FilterContext.Provider value={filterValues}>
      <div className="flex min-h-screen w-full bg-op-bg/50 text-op-textMain selection:bg-op-accent/30">
        <Sidebar />
        <div className="flex flex-1 flex-col md:pl-[72px]">
          <TopHeader />
          <main className="flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-[1600px] p-6 md:p-8 lg:p-10">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </FilterContext.Provider>
  );
}
