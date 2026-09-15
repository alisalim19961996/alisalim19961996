'use client';

import { useState, useSyncExternalStore } from 'react';
import { Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { MAX_COMPARE } from '@/lib/domain/compare-url';
import {
  getCompareServerSnapshot,
  getCompareSnapshot,
  subscribeCompare,
  toggleCompare,
} from '../compare-store';

/**
 * The compare tick on a product card.
 *
 * Quiet by design. It shares the image's corner with the heart, on a card the
 * shopper scans in under a second (§9), so it is an icon that fills in when
 * ticked rather than a labelled control competing with the price.
 *
 * It says so when the list is full instead of doing nothing: four is the
 * ceiling because a fifth column leaves 78 pixels per product at 390px, and a
 * tick that silently refuses is indistinguishable from one that is broken.
 */
export function CompareToggle({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const t = useTranslations('compare');
  const [refused, setRefused] = useState(false);

  /*
    Subscribed rather than read in an effect. `localStorage` cannot be touched
    during render without a hydration mismatch, and reading it in an effect to
    call setState is what `react-hooks/set-state-in-effect` exists to stop —
    it renders twice and the second render is the correct one. This renders
    unticked on the server, ticked on the client, and every other tick for the
    same product on the page moves with it.
  */
  const selection = useSyncExternalStore(
    subscribeCompare,
    getCompareSnapshot,
    getCompareServerSnapshot,
  );
  const selected = selection.includes(slug);

  const label = refused
    ? t('full', { max: MAX_COMPARE })
    : selected
      ? t('remove')
      : t('add');

  return (
    <button
      type="button"
      aria-pressed={selected}
      title={label}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-full transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        selected
          ? 'bg-ink text-white'
          : 'bg-surface/85 text-ink backdrop-blur-[2px] hover:bg-surface',
        refused && 'bg-warning-soft text-warning',
        className,
      )}
      onClick={() => {
        const result = toggleCompare(slug);
        setRefused(result.full);
        // Long enough to read, short enough that the next tick is not still
        // wearing the previous refusal.
        if (result.full) window.setTimeout(() => setRefused(false), 2500);
      }}
    >
      <Scale className="size-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </button>
  );
}
