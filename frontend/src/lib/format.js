const rupee = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export const formatPrice = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? rupee.format(value) : '—';

export const formatDiff = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`
    : '—';

export const formatPercent = (ratio) =>
  typeof ratio === 'number' && Number.isFinite(ratio) ? `${Math.round(ratio * 100)}%` : '—';

/** Compact "12m ago" / "3h ago" / "2d ago" for a timestamp. */
export function timeAgo(isoString) {
  if (!isoString) return null;
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return null;

  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Data older than this is called out as stale in the UI. */
export const STALE_AFTER_MINUTES = 180;

export function isStale(isoString) {
  if (!isoString) return false;
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return false;
  return (Date.now() - then) / 60000 > STALE_AFTER_MINUTES;
}

export function formatTimestamp(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
