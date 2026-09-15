import 'server-only';

import { db } from '@/server/db/client';
import { getCurrentUser } from '@/server/auth/guards';
import { cardSelect, type ProductCardData } from './catalogue';

/**
 * Wishlist reads.
 *
 * A wishlist belongs to an account and to nothing else: `Wishlist.userId` is
 * required and unique, so there is no anonymous list and no token to guess.
 * Every read here starts from the session, which is also why none of them takes
 * a user id as an argument — a parameter is one wrong call away from returning
 * somebody else's saved products.
 */

export interface WishlistView {
  products: ProductCardData[];
  /**
   * Saved products that are no longer on the shop floor.
   *
   * Counted rather than listed. An unpublished product has no page to link to,
   * so rendering its card would hand the customer a dead link; dropping it
   * silently is worse, because they saved it and would conclude the list lost
   * it. The row stays either way, and republishing brings the card back.
   */
  unavailable: number;
}

export async function getWishlist(): Promise<WishlistView> {
  const user = await getCurrentUser();
  if (!user) return { products: [], unavailable: 0 };

  const [items, unavailable] = await Promise.all([
    db.wishlistItem.findMany({
      where: { wishlist: { userId: user.id }, product: { isPublished: true } },
      select: { product: { select: cardSelect } },
      // Most recently saved first: a wishlist is a queue of intentions, and the
      // one just added is the one being looked for.
      orderBy: { createdAt: 'desc' },
    }),
    db.wishlistItem.count({
      where: { wishlist: { userId: user.id }, product: { isPublished: false } },
    }),
  ]);

  return { products: items.map((item) => item.product), unavailable };
}

/**
 * The ids the signed-in customer has saved, for rendering the heart.
 *
 * Ids only, and read through a Server Action rather than during render: the
 * homepage and all 32 product pages are prerendered, and a `cookies()` read
 * inside them would opt every one into dynamic rendering (§8). The same reason
 * `CartCountBadge` loads after hydration.
 *
 * Returns an empty list for a signed-out visitor rather than throwing — not
 * being signed in is the ordinary case, not an error.
 */
export async function getWishlistProductIds(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const items = await db.wishlistItem.findMany({
    where: { wishlist: { userId: user.id } },
    select: { productId: true },
  });

  return items.map((item) => item.productId);
}
