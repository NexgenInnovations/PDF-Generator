import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00CFFF] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-[#0057FF] to-[#00CFFF] text-white shadow-[0_0_18px_rgba(0,207,255,0.45),0_0_6px_rgba(0,87,255,0.30)] hover:shadow-[0_0_24px_rgba(0,207,255,0.65)] hover:brightness-110 active:scale-[0.97]',
        destructive:
          'bg-red-600/90 text-white hover:bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.3)]',
        outline:
          'border border-[rgba(0,207,255,0.30)] bg-transparent text-[#A0B4CC] hover:border-[#00CFFF] hover:text-white hover:bg-[rgba(0,207,255,0.06)]',
        secondary:
          'bg-[rgba(255,255,255,0.06)] text-[#A0B4CC] hover:bg-[rgba(0,207,255,0.08)] hover:text-white border border-[rgba(0,207,255,0.12)]',
        ghost:
          'text-[#A0B4CC] hover:bg-[rgba(0,207,255,0.06)] hover:text-white',
        link:
          'text-[#00CFFF] underline-offset-4 hover:underline hover:text-white p-0 h-auto',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-6 text-base',
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
