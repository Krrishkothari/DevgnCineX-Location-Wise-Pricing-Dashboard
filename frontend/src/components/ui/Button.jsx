import React from 'react';
import { cn } from '../../utils/cn';

export const Button = React.forwardRef(({ className, variant = 'primary', size = 'default', children, ...props }, ref) => {
  const baseStyles = "inline-flex items-center justify-center whitespace-nowrap rounded-[12px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-op-accent disabled:pointer-events-none disabled:opacity-50";
  
  const variants = {
    primary: "bg-op-accent text-white hover:bg-op-accent/90",
    secondary: "bg-op-border text-op-textMain hover:bg-op-border/80",
    ghost: "hover:bg-op-border/50 text-op-textSecondary hover:text-op-textMain",
  };
  
  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-[10px] px-3 text-xs",
    lg: "h-10 rounded-[14px] px-8",
    icon: "h-9 w-9",
  };

  return (
    <button
      ref={ref}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
});
Button.displayName = "Button";
