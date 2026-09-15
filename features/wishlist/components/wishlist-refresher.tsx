'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { WISHLIST_CHANGED_EVENT } from '../wishlist-store';

/**
 * Re-reads the wishlist page when a heart on it is pressed.
 *
 * The heart updates itself optimistically, but the CARD is server-rendered:
 * without this, unsaving a product on this page leaves its card sitting there
 * with an empty heart, and the customer has to reload to believe it went.
 *
 * It lives on this page rather than inside the button because a refresh is
 * only right here. On the catalogue the same toggle would re-render a grid of
 * twenty-four cards to change one icon that has already changed.
 */
export function WishlistRefresher() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener(WISHLIST_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(WISHLIST_CHANGED_EVENT, refresh);
  }, [router]);

  return null;
}
