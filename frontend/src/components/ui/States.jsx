import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../utils/cn';

export function Skeleton({ className }) {
  return <div className={cn('skeleton', className)} />;
}

/** Placeholder grid shown on first load, shaped like the real cards. */
export function CardGridSkeleton({ count = 8 }) {
  return (
    <div
      className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      aria-busy="true"
      aria-label="Loading pricing data"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel flex h-[19rem] flex-col gap-4 p-5">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-pill" />
            <Skeleton className="h-6 w-16 rounded-pill" />
            <Skeleton className="h-6 w-16 rounded-pill" />
          </div>
          <div className="mt-auto flex flex-col gap-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="panel flex min-h-[22rem] flex-col items-center justify-center gap-3 border-dashed p-8 text-center">
      <div className="rounded-pill bg-elevated p-3 text-ink-muted">
        <Inbox size={22} aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="max-w-md text-sm text-ink-soft">{description}</p>}
      {action}
    </div>
  );
}

/**
 * Failure state. The old API layer swallowed every error and returned an empty
 * payload, so a dead backend was indistinguishable from a day with no shows —
 * this is the state that could never previously be reached.
 */
export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  const message = error?.friendlyMessage || error?.message || 'An unexpected error occurred.';
  return (
    <div className="panel flex min-h-[22rem] flex-col items-center justify-center gap-3 border-below/30 p-8 text-center">
      <div className="rounded-pill bg-below/10 p-3 text-below">
        <AlertTriangle size={22} aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="max-w-md text-sm text-ink-soft">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-1">
          <RefreshCw size={14} aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}
