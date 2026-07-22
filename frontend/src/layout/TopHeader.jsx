import { Moon, RefreshCw, Sun } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { usePrices, useTriggerScrape } from '../api/hooks';
import { useFilters } from '../lib/filters';
import { useTheme } from '../lib/theme';
import { formatTimestamp, timeAgo } from '../lib/format';
import { cn } from '../utils/cn';

export function TopHeader() {
  const { theme, toggle } = useTheme();
  const { toast } = useToast();
  const trigger = useTriggerScrape();

  // Subscribes to the same cache entry the dashboard uses (React Query dedupes
  // by key), so freshness re-renders when the data actually changes. Reading
  // the cache imperatively here meant it never updated after first paint.
  const { date, location } = useFilters();
  const pricesQuery = usePrices(date, location);
  const lastUpdated = pricesQuery.data?.last_updated;
  const isFetching = pricesQuery.isFetching;

  const handleRefresh = () => {
    trigger.mutate(undefined, {
      // Feedback now goes through toasts; this used to be a blocking
      // window.alert() for both the success and failure paths.
      onSuccess: () =>
        toast({
          variant: 'success',
          title: 'Scrape queued',
          description: 'Prices will update here as each location completes.',
        }),
      onError: (error) =>
        toast({
          variant: 'error',
          title: 'Could not start a scrape',
          description: error?.friendlyMessage ?? 'Please try again.',
        }),
    });
  };

  const updatedAgo = timeAgo(lastUpdated);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1700px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-brand text-sm font-bold text-white"
          >
            DC
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight text-ink">
              Devgn CineX · Pricing Intelligence
            </h1>
            <p className="truncate text-xs text-ink-muted" title={formatTimestamp(lastUpdated)}>
              {isFetching ? 'Refreshing…' : updatedAgo ? `Updated ${updatedAgo}` : 'Awaiting first scrape'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          </Button>

          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={trigger.isPending}
            aria-label="Trigger a new scrape"
          >
            <RefreshCw
              size={15}
              aria-hidden="true"
              className={cn(trigger.isPending && 'motion-safe:animate-spin')}
            />
            <span className="hidden sm:inline">{trigger.isPending ? 'Starting…' : 'Scrape now'}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
