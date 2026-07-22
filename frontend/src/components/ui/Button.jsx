import React from 'react';
import { cn } from '../../utils/cn';

const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-soft shadow-sm',
  secondary: 'bg-elevated text-ink hover:bg-strong/60 border border-line',
  ghost: 'text-ink-soft hover:bg-elevated hover:text-ink',
  danger: 'bg-below/15 text-below hover:bg-below/25 border border-below/30',
};

const SIZES = {
  default: 'h-9 gap-2 rounded-control px-4 text-sm',
  sm: 'h-8 gap-1.5 rounded-control px-3 text-xs',
  lg: 'h-11 gap-2 rounded-control px-6 text-sm',
  icon: 'h-9 w-9 rounded-control',
};

export const Button = React.forwardRef(function Button(
  { className, variant = 'primary', size = 'default', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-colors disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.default,
        className
      )}
      {...props}
    />
  );
});
