import { cn } from '../../utils/cn';

/**
 * Surface container. `interactive` opts into the hover lift — the previous
 * version applied it to every card, so static content jittered on mouseover.
 */
export function Card({ className, interactive = false, accent = false, ...props }) {
  return (
    <div
      className={cn(
        'panel shadow-card transition-[transform,box-shadow,border-color] duration-200',
        interactive && 'hover:-translate-y-0.5 hover:border-strong hover:shadow-lift',
        accent && 'border-brand/50 shadow-glow',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />;
}

export function CardTitle({ className, as: Tag = 'h3', ...props }) {
  return (
    <Tag className={cn('text-base font-semibold leading-tight text-ink', className)} {...props} />
  );
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-ink-soft', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('flex flex-col gap-4 px-5 pb-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn('mt-auto border-t border-line px-5 py-3', className)} {...props} />;
}
