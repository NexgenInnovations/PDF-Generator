import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors border',
  {
    variants: {
      variant: {
        default:
          'border-[rgba(0,207,255,0.35)] bg-[rgba(0,207,255,0.10)] text-[#00CFFF]',
        secondary:
          'border-[rgba(160,180,204,0.25)] bg-[rgba(160,180,204,0.08)] text-[#A0B4CC]',
        destructive:
          'border-red-500/40 bg-red-500/10 text-red-400',
        outline:
          'border-[rgba(0,207,255,0.30)] text-[#A0B4CC] bg-transparent',
        success:
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
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
