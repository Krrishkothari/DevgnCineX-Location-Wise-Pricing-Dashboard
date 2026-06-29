import React from 'react';
import { cn } from '../../utils/cn';

export function Badge({ className, variant = 'default', children, ...props }) {
  const variants = {
    default: "bg-op-border text-op-textSecondary",
    success: "bg-[#00D26A]/20 text-[#00D26A]", // Glowy green
    danger: "bg-[#FF4D67]/20 text-[#FF4D67]", // Glowy red
    accent: "bg-op-accent/20 text-op-accent", // Glowy purple
    owned: "bg-op-accent text-white border-op-accent", // Solid purple for OWNED
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-op-accent focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
