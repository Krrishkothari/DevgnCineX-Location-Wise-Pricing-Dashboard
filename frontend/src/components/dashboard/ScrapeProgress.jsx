import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useScrapeProgress } from '../../api/hooks';
import { formatDuration } from '../../lib/format';

const STALE_RUN_MS = 2 * 60 * 60 * 1000;

/**
 * Live scraper progress. Previously this used a raw fetch('/api/progress'),
 * bypassing the configured API base URL and breaking any deployment where the
 * API isn't same-origin; it also relied on two Tailwind animations that were
 * never defined.
 */
export function ScrapeProgress() {
  const { data: progress } = useScrapeProgress();
  const [now, setNow] = useState(() => Date.now());

  const running =
    progress &&
    progress.total > 0 &&
    progress.current < progress.total &&
    now - progress.startTime < STALE_RUN_MS;

  // Only tick while something is actually running.
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!running) return null;

  const percent = Math.min(100, Math.round((progress.current / progress.total) * 100));
  const completed = progress.completed ?? Math.max(0, progress.current - 1);
  const elapsed = now - progress.startTime;
  const eta = completed > 0 ? (elapsed / completed) * (progress.total - completed) : null;

  return (
    <AnimatePresence>
      <motion.section
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="panel overflow-hidden p-4"
        aria-label="Scraper progress"
      >
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-pill bg-brand opacity-60 motion-safe:animate-pulse-slow" />
              <span className="relative inline-flex h-2 w-2 rounded-pill bg-brand" />
            </span>
            Scrape in progress
          </h2>
          <span className="tabular text-sm font-semibold text-brand-soft">{percent}%</span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Scraping: ${progress.current} of ${progress.total} movies`}
          className="h-2 w-full overflow-hidden rounded-pill bg-elevated"
        >
          <motion.div
            className="h-full rounded-pill bg-brand"
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ ease: 'easeOut', duration: 0.6 }}
          />
        </div>

        {/* Announced politely so the running count reaches assistive tech. */}
        <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-soft" aria-live="polite">
          <span>
            Processing <strong className="font-medium text-ink">{progress.movie}</strong>
          </span>
          <span className="tabular text-ink-muted">
            {progress.current} / {progress.total}
          </span>
          <span className="tabular text-ink-muted">elapsed {formatDuration(elapsed)}</span>
          {eta !== null && <span className="tabular text-ink-muted">~{formatDuration(eta)} left</span>}
        </p>
      </motion.section>
    </AnimatePresence>
  );
}
