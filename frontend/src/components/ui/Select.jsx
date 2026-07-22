import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Labelled select. The dashboard previously hand-rolled this markup six times
 * with an identical class string, and none of those selects had a label or
 * aria-label — meaning is conveyed by a decorative icon alone, which screen
 * readers ignore.
 */
export function Select({
  label,
  value,
  onChange,
  options,
  icon: Icon,
  className,
  hideLabel = false,
  disabled = false,
  placeholder,
}) {
  const id = useId();

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className={cn('label-micro', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
        )}
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-10 w-full cursor-pointer appearance-none rounded-control border border-line',
            'bg-elevated pr-9 text-sm font-medium text-ink transition-colors',
            'hover:border-strong disabled:cursor-not-allowed disabled:opacity-50',
            Icon ? 'pl-9' : 'pl-3'
          )}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
      </div>
    </div>
  );
}

/** Horizontal radio-style control for small, always-visible option sets. */
export function SegmentedControl({ label, value, onChange, options, className }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-control border border-line bg-elevated p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-[8px] px-3 py-1.5 text-xs font-semibold transition-colors',
              selected ? 'bg-brand text-white shadow-sm' : 'text-ink-muted hover:text-ink'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
