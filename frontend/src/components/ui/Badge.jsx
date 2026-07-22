import { cn } from '../../utils/cn';

// Variants now reference theme tokens rather than re-typing the palette as
// arbitrary hex values (`bg-[#00D26A]/20`), so they follow the active theme.
const VARIANTS = {
  default: 'bg-elevated text-ink-soft border-line',
  outline: 'bg-transparent text-ink-soft border-line',
  above: 'bg-above/15 text-above border-above/25',
  below: 'bg-below/15 text-below border-below/25',
  brand: 'bg-brand/15 text-brand-soft border-brand/30',
  warn: 'bg-warn/15 text-warn border-warn/25',
  solid: 'bg-brand text-white border-brand',
};

/**
 * Non-interactive status pill. For anything clickable use a real <button>
 * (see Chip) — the old code attached onClick to this div, producing controls
 * that keyboard users could not reach.
 */
export function Badge({ className, variant = 'default', ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5',
        'text-[11px] font-semibold leading-tight',
        VARIANTS[variant] ?? VARIANTS.default,
        className
      )}
      {...props}
    />
  );
}

/**
 * Selectable pill. A real button: focusable, keyboard-operable, and exposing
 * its selected state via aria-pressed.
 */
export function Chip({ className, selected = false, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2.5 py-1',
        'text-xs font-semibold leading-tight transition-colors',
        selected
          ? 'border-brand bg-brand text-white'
          : 'border-line bg-elevated text-ink-soft hover:border-strong hover:text-ink',
        className
      )}
      {...props}
    />
  );
}
