'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { toggleWishlistAction } from '../actions';
import {
  announceWishlistChanged,
  loadWishlist,
  WISHLIST_CHANGED_EVENT,
} from '../wishlist-store';

/**
 * The heart.
 *
 * It renders in three states and the order of them is the whole design:
 *
 *  - **unknown** while the shared read is in flight. The outline heart is
 *    drawn, not a spinner or a gap — a control that appears a moment after the
 *    card does is worse than one that is briefly non-committal, and the card's
 *    geometry must not change (§10).
 *  - **signed out**, where it is a LINK to sign in rather than a button that
 *    fails. A wishlist belongs to an account, and a heart that quietly does
 *    nothing is the worst version of that fact.
 *  - **signed in**, where it toggles.
 *
 * The signed-out link does not carry the product in `?next=`: the sign-in page
 * compares `next` against the literal "admin" and never uses it as a redirect
 * target, which is exactly what stops a crafted value bouncing a visitor
 * off-site. Making it a real destination to save one navigation is not a trade
 * worth taking.
 */
export function WishlistButton({
  productId,
  variant = 'icon',
  className,
}: {
  productId: string;
  /** `icon` sits on a product card; `labelled` sits beside add-to-cart. */
  variant?: 'icon' | 'labelled';
  className?: string;
}) {
  const t = useTranslations('wishlist');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    void loadWishlist().then((snapshot) => {
      setSignedIn(snapshot.signedIn);
      setSaved(snapshot.ids.has(productId));
    });
  }, [productId]);

  useEffect(() => {
    refresh();
    window.addEventListener(WISHLIST_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(WISHLIST_CHANGED_EVENT, refresh);
  }, [refresh]);

  const label = saved ? t('remove') : t('save');

  const shell = cn(
    'inline-flex items-center justify-center gap-2 rounded-full transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    variant === 'icon'
      ? // 44px is the touch floor the design system sets for every control.
        'size-11 bg-surface/85 text-ink backdrop-blur-[2px] hover:bg-surface'
      : 'h-11 border border-border-strong bg-surface px-5 text-sm font-medium text-ink hover:bg-canvas',
    className,
  );

  const icon = (
    <Heart className={cn('size-5', saved && 'fill-primary text-primary')} aria-hidden />
  );

  if (signedIn === false) {
    return (
      <Link href="/sign-in" className={shell} title={t('signInToSave')}>
        {icon}
        {variant === 'labelled' ? <span>{t('signInToSave')}</span> : null}
        {variant === 'icon' ? (
          <span className="sr-only">{t('signInToSave')}</span>
        ) : null}
      </Link>
    );
  }

  return (
    <button
      type="button"
      // `aria-pressed` rather than two different labels: a screen reader then
      // announces the state AND the action, instead of the customer having to
      // infer which one the current wording refers to.
      aria-pressed={saved}
      disabled={pending}
      title={label}
      className={cn(shell, 'disabled:opacity-60')}
      onClick={() => {
        // Optimistic, because a heart that waits for a round trip before
        // filling in reads as a broken button. The refresh below is what makes
        // it honest again if the server disagreed.
        setSaved((previous) => !previous);

        startTransition(async () => {
          const result = await toggleWishlistAction({ productId });
          if (result.ok && result.saved !== undefined) setSaved(result.saved);
          announceWishlistChanged();
        });
      }}
    >
      {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : icon}
      {variant === 'labelled' ? <span>{label}</span> : null}
      {variant === 'icon' ? <span className="sr-only">{label}</span> : null}
    </button>
  );
}
