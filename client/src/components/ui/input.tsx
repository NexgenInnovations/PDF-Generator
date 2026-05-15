import * as React from 'react';
import { cn } from '../../lib/utils.js';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-[rgba(0,207,255,0.20)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-white placeholder:text-[#A0B4CC]/60 ring-offset-black transition-all duration-200',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'focus-visible:outline-none focus-visible:border-[#00CFFF] focus-visible:ring-2 focus-visible:ring-[rgba(0,207,255,0.25)] focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_rgba(0,207,255,0.12)]',
          'disabled:cursor-not-allowed disabled:opacity-40',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
