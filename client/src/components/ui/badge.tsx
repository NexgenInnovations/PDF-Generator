import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center rounded-[var(--nx-radius-sm)] px-2 py-0.5 text-xs font-medium transition-colors border',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--nx-accent-tint)] text-[var(--nx-accent)]',
        secondary:
          'border-[var(--nx-hairline)] bg-[var(--nx-surface)] text-[var(--nx-ink-secondary)]',
        destructive:
          'border-transparent bg-[var(--nx-destructive-tint)] text-[var(--nx-destructive)]',
        outline:
          'border-[var(--nx-hairline)] text-[var(--nx-ink-secondary)] bg-transparent',
        success:
          'border-transparent bg-[var(--nx-success-tint)] text-[var(--nx-success)]',
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
