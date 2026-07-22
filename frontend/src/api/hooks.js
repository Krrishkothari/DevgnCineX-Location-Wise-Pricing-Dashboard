import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  fetchConfig,
  fetchDates,
  fetchHistory,
  fetchMovies,
  fetchPrices,
  fetchProgress,
  triggerScrape,
} from './index';

// @tanstack/react-query was already a dependency but entirely unused — data was
// fetched with hand-rolled effects plus a setInterval that fired two full
// requests every five seconds, forever, with no cancellation, no deduplication
// and no way to represent an error.

/** True while the tab is visible; used to stop polling in background tabs. */
function usePageVisible() {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden
  );
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

const LIVE_REFRESH_MS = 20000;

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
    staleTime: Infinity,
  });
}

export function useDates() {
  return useQuery({
    queryKey: ['dates'],
    queryFn: fetchDates,
    staleTime: 30 * 60 * 1000,
    select: (data) => data.dates || [],
  });
}

export function useMovies(date, location) {
  return useQuery({
    queryKey: ['movies', date, location || null],
    queryFn: () => fetchMovies(date, location),
    enabled: Boolean(date),
    staleTime: 60 * 1000,
    select: (data) => data.movies || [],
  });
}

/** Price rows for the selected day. Refreshes while the tab is in the foreground. */
export function usePrices(date, location) {
  const visible = usePageVisible();
  return useQuery({
    queryKey: ['prices', date, location || null],
    queryFn: () => fetchPrices(date, false, location),
    enabled: Boolean(date),
    // Poll only when the user can actually see the result.
    refetchInterval: visible ? LIVE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    // Keep the previous day's rows on screen while the new day loads instead of
    // collapsing the whole page back to skeletons.
    placeholderData: (previous) => previous,
    staleTime: 5000,
  });
}

/**
 * Owned-cinema rows across every date, used to derive the Devgn Cinex baseline.
 * This is the largest response in the app and barely changes, so it is fetched
 * far less often than the day view — the old code re-fetched it every 5s.
 */
export function useBaseline() {
  return useQuery({
    queryKey: ['prices', 'baseline'],
    queryFn: () => fetchPrices(null, true),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
}

export function useScrapeProgress() {
  const visible = usePageVisible();
  return useQuery({
    queryKey: ['progress'],
    queryFn: fetchProgress,
    refetchInterval: visible ? 5000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

export function usePriceHistory(params, enabled) {
  return useQuery({
    queryKey: ['history', params],
    queryFn: () =>
      fetchHistory(
        params.cinema,
        params.location,
        params.movie,
        params.seat_category,
        params.date,
        params.showtime
      ),
    enabled: Boolean(enabled && params?.cinema),
    staleTime: 60 * 1000,
    select: (data) => data.history || [],
  });
}

export function useTriggerScrape() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerScrape,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['progress'] }),
  });
}
