import { useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Download } from 'lucide-react';

import { useBaseline, useConfig, usePrices } from '../api/hooks';
import { useFilters } from '../lib/filters';
import { buildBaselines, buildCinemaCards, isInTimeSlot, summarise } from '../lib/pricing';
import { exportCardsToExcel } from '../lib/exportExcel';

import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/Select';
import { useToast } from '../components/ui/Toast';
import { CardGridSkeleton, EmptyState, ErrorState } from '../components/ui/States';
import { CinemaCard } from '../components/dashboard/CinemaCard';
import { FilterBar } from '../components/dashboard/FilterBar';
import { KpiRow } from '../components/dashboard/KpiRow';
import { ScrapeProgress } from '../components/dashboard/ScrapeProgress';

const SEGMENTS = [
  { value: 'all', label: 'All' },
  { value: 'owned', label: 'Devgn CineX' },
  { value: 'competitors', label: 'Competitors' },
];

export function DashboardScreen() {
  const { toast } = useToast();
  const {
    date, movie, location, timeSlot, language, format, segment,
    setFilter, setAvailableLanguages, setAvailableFormats, reset, activeCount,
  } = useFilters();

  const configQuery = useConfig();
  const pricesQuery = usePrices(date, location);
  const baselineQuery = useBaseline();

  const rows = pricesQuery.data?.data ?? [];
  const baselineRows = baselineQuery.data?.data ?? [];

  // Locations come from the scraper config rather than a list hardcoded in the
  // frontend — there were previously two independent copies of the same 17
  // cities that could drift apart.
  const locations = useMemo(
    () => (configQuery.data?.locations ?? []).map((l) => l.name).sort(),
    [configQuery.data]
  );

  // Language and format options depend on the selected movie.
  const { languages, formats } = useMemo(() => {
    const relevant = movie === 'all' ? rows : rows.filter((r) => r.movie === movie);
    const languageSet = new Set();
    const formatSet = new Set();
    for (const row of relevant) {
      if (row.language) languageSet.add(row.language);
      if (row.format) formatSet.add(row.format);
    }
    return { languages: [...languageSet].sort(), formats: [...formatSet].sort() };
  }, [rows, movie]);

  useEffect(() => setAvailableLanguages(languages), [languages, setAvailableLanguages]);
  useEffect(() => setAvailableFormats(formats), [formats, setAvailableFormats]);

  const cards = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (movie !== 'all' && row.movie !== movie) return false;
      if (location && row.location !== location) return false;
      if (language !== 'all' && row.language !== language) return false;
      if (format !== 'all' && row.format !== format) return false;
      if (!isInTimeSlot(row.showtime, timeSlot)) return false;
      return true;
    });

    return buildCinemaCards(filtered, buildBaselines(baselineRows, date));
  }, [rows, baselineRows, movie, location, language, format, timeSlot, date]);

  const visibleCards = useMemo(
    () =>
      cards.filter((card) =>
        segment === 'all' ? true : segment === 'owned' ? card.owned : !card.owned
      ),
    [cards, segment]
  );

  const summary = useMemo(() => summarise(visibleCards), [visibleCards]);

  const handleExport = async () => {
    try {
      const count = await exportCardsToExcel(visibleCards, date);
      toast(
        count > 0
          ? { variant: 'success', title: 'Export ready', description: `${count} price rows downloaded.` }
          : { variant: 'error', title: 'Nothing to export', description: 'No rows match the current filters.' }
      );
    } catch (error) {
      console.error('[UI] Export failed:', error);
      toast({ variant: 'error', title: 'Export failed', description: error.message });
    }
  };

  // Only a genuine failure with nothing cached is fatal; a failed background
  // refresh keeps showing the last good data.
  if (pricesQuery.isError && rows.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <FilterBar locations={locations} />
        <ErrorState
          error={pricesQuery.error}
          onRetry={() => pricesQuery.refetch()}
          title="Couldn't load pricing data"
        />
      </div>
    );
  }

  const loading = pricesQuery.isPending || (configQuery.isPending && locations.length === 0);

  return (
    <div className="flex flex-col gap-5">
      <ScrapeProgress />

      <div className="flex flex-col gap-4">
        <FilterBar locations={locations} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            label="Venue type"
            value={segment}
            onChange={(value) => setFilter('segment', value)}
            options={SEGMENTS}
          />

          <div className="flex items-center gap-3">
            <span className="tabular text-sm text-ink-muted">
              {visibleCards.length} {visibleCards.length === 1 ? 'venue' : 'venues'}
            </span>
            <Button variant="secondary" onClick={handleExport} disabled={visibleCards.length === 0}>
              <Download size={15} aria-hidden="true" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <CardGridSkeleton />
      ) : visibleCards.length === 0 ? (
        <EmptyState
          title={activeCount > 0 ? 'No venues match these filters' : 'No pricing data yet'}
          description={
            activeCount > 0
              ? 'Try widening the date, location or showtime filters.'
              : 'Once a scrape completes, competitor pricing will appear here.'
          }
          action={
            activeCount > 0 && (
              <Button variant="secondary" onClick={reset} className="mt-1">
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <>
          <KpiRow summary={summary} />

          {baselineQuery.isError && (
            <p className="text-xs text-warn">
              Baseline data is unavailable, so competitor comparisons are hidden.
            </p>
          )}

          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {visibleCards.map((card) => (
                <CinemaCard key={card.id} card={card} />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
