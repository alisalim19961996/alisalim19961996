import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Loading placeholder. Shape it like the content it replaces, not a grey box. */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-[--radius-control] bg-border/60', className)}
      aria-hidden="true"
      {...props}
    />
  );
}
