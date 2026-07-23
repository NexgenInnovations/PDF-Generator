import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--nx-radius-sm)] text-sm font-semibold ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nx-accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--nx-accent)] text-white hover:brightness-110 active:scale-[0.98]',
        destructive:
          'bg-[var(--nx-destructive)] text-white hover:brightness-110',
        outline:
          'border border-[var(--nx-hairline)] bg-transparent text-[var(--nx-ink-secondary)] hover:bg-[var(--nx-surface)]',
        secondary:
          'bg-white text-[var(--nx-ink)] border border-[var(--nx-hairline)] hover:bg-[var(--nx-surface)]',
        ghost:
          'text-[var(--nx-ink-secondary)] hover:bg-[var(--nx-surface)] hover:text-[var(--nx-ink)]',
        link:
          'text-[var(--nx-accent)] underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-[var(--nx-radius-sm)] px-3 text-xs',
        lg: 'h-11 rounded-[var(--nx-radius-sm)] px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
