import type * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({
  className,
  type = 'text',
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-11 w-full rounded-[--radius-control] border border-border bg-surface px-3',
        'text-sm text-ink placeholder:text-subtle',
        'transition-colors hover:border-border-strong',
        'focus-visible:border-primary',
        'disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-60',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}
