'use client';

import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { clearCompare } from '../compare-store';

/**
 * Empty the comparison, from the comparison itself.
 *
 * Two things have to happen and neither is enough alone: the ticks live in
 * `localStorage`, and the table lives in the URL. Clearing only the first
 * leaves the same table on screen; navigating away only from the second leaves
 * every tick still on, so the tray reappears on the next page with the
 * products the shopper just said they were done with.
 */
export function CompareClearLink({ label }: { label: string }) {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        clearCompare();
        router.push('/products');
      }}
    >
      {label}
    </Button>
  );
}
