'use client';

import { useSyncExternalStore } from 'react';
import { Scale, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { MAX_COMPARE, compareHref } from '@/lib/domain/compare-url';
import {
  clearCompare,
  getCompareServerSnapshot,
  getCompareSnapshot,
  removeFromCompare,
  subscribeCompare,
} from '../compare-store';

/**
 * What is ticked, and the way to the comparison.
 *
 * Without it the selection is invisible: a shopper ticks two products on the
 * homepage, navigates, and has no way to know anything is held or to reach the
 * table. It lives in the storefront layout for that reason — the ticks are on
 * cards, and cards are on the homepage, the catalogue, the offers page and the
 * wishlist.
 *
 * It renders NOTHING at all when nothing is ticked, which is almost always, so
 * the common page is unchanged.
 *
 * **Sticky, not fixed, and that is the whole clearance story.** The footer's
 * gap under the mobile buy bar was a real bug that shipped and went unmeasured
 * for a phase (§15), and a second fixed bar would be a second chance at it —
 * with a spacer whose height has to be kept in step with content that wraps.
 * Sitting in normal flow between `main` and the footer, it sticks to the
 * bottom of the viewport while there is page left and comes to rest above the
 * footer when there is not. It cannot cover anything, and there is no number
 * to keep in step.
 *
 * It is not rendered on a product page, where `MobileBuyBar` owns the bottom
 * of the screen. There is no compare tick there to use it, and two bars
 * stacked on a phone is how the buy button stops being the obvious one.
 */
export function CompareTray() {
  const t = useTranslations('compare');
  const pathname = usePathname();

  // The server snapshot is empty, so this renders nothing on the server and
  // nothing on the first client paint — which is also what it should render
  // for the large majority of visits, where nothing is ticked.
  const slugs = useSyncExternalStore(
    subscribeCompare,
    getCompareSnapshot,
    getCompareServerSnapshot,
  );

  // Hidden on the comparison itself — the table already lists what is in it —
  // and on a product page, where the mobile buy bar is already at the bottom.
  // The trailing slash matters: `/products` is the catalogue, which has ticks.
  const onProductPage = pathname.startsWith('/products/');
  if (slugs.length === 0 || pathname.startsWith('/compare') || onProductPage) {
    return null;
  }

  return (
    <div
      className="sticky bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="container-page flex flex-wrap items-center gap-3 py-3">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <Scale className="size-4 text-muted" aria-hidden />
          {t('selected', { count: slugs.length, max: MAX_COMPARE })}
        </span>

        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {slugs.map((slug) => (
            <li key={slug}>
              <button
                type="button"
                onClick={() => removeFromCompare(slug)}
                className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border border-border bg-canvas py-1 ps-3 pe-2 text-xs text-ink hover:border-border-strong"
              >
                {/*
                    The slug, not the product's name: the tray holds slugs and
                    nothing else, and fetching four names to label four chips
                    would be a round trip on every page in the store for a
                    label the shopper just chose.
                  */}
                <span className="truncate numeric" dir="ltr">
                  {slug}
                </span>
                <X className="size-3.5 shrink-0" aria-hidden />
                <span className="sr-only">{t('remove')}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={clearCompare}>
            {t('clear')}
          </Button>
          {/*
              One product is not a comparison. It stays visible and disabled so
              the shopper can see what the second tick is for — but as a real
              <button>, because `disabled` on an anchor is decoration: it greys
              out and still navigates.
            */}
          {slugs.length < 2 ? (
            <Button size="sm" disabled>
              {t('compare')}
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href={compareHref(slugs)}>{t('compare')}</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
