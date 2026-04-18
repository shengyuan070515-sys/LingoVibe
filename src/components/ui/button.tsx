import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variants = {
      default: 'bg-blue-600 text-white hover:bg-blue-700',
      ghost: 'hover:bg-gray-100 text-gray-700',
      outline: 'border border-gray-200 bg-transparent hover:bg-gray-50 text-gray-700',
      secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    };

    const sizes = {
      default: 'h-11 px-4 py-2',
      sm: 'h-9 px-3 text-xs',
      lg: 'h-12 px-8 text-base',
      icon: 'h-11 w-11',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50',
          'leading-none', // Ensure text doesn't have extra vertical space
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export const buttonVariants = () => '';
