import * as React from 'react';
import { cn } from '@/lib/utils';

const glassFrame =
    'rounded-xl border border-white/70 bg-white/82 shadow-sm shadow-slate-900/5 backdrop-blur-md backdrop-saturate-150';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
    return <div className={cn(glassFrame, className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return <div className={cn('border-b border-white/50 p-4 backdrop-blur-[2px]', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
    return <h3 className={cn('font-bold', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
    return <p className={cn('text-sm text-slate-600', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
    return <div className={cn('p-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
    return <div className={cn('border-t border-white/50 p-4', className)} {...props} />;
}
