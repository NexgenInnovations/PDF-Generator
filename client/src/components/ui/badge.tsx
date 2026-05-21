import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center px-2.5 py-0.5 text-xs font-semibold transition-colors border',
  {
    variants: {
      variant: {
        default:
          'rounded-full border-black/20 bg-black text-white',
        secondary:
          'rounded-full border-[#e6e6e6] bg-[#f7f7f5] text-black/50',
        destructive:
          'rounded-full border-red-200 bg-red-50 text-red-600',
        outline:
          'rounded-full border-[#e6e6e6] text-black/60 bg-transparent',
        success:
          'rounded-full border-[#c8e6cd] bg-[#c8e6cd] text-[#1ea64a]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
