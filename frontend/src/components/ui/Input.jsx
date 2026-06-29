import React from 'react';
import { cn } from '../../utils/cn';

export const Input = React.forwardRef(({ className, type, icon: Icon, ...props }, ref) => {
  return (
    <div className="relative flex items-center w-full">
      {Icon && (
        <div className="absolute left-3 text-op-muted">
          <Icon size={16} />
        </div>
      )}
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-[12px] border border-op-border bg-op-card px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-op-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-op-accent disabled:cursor-not-allowed disabled:opacity-50 text-op-textMain",
          Icon && "pl-9",
          className
        )}
        ref={ref}
        {...props}
      />
    </div>
  );
});
Input.displayName = "Input";
