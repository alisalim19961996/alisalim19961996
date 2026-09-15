import 'server-only';

import { Prisma } from '@prisma/client';
import { db } from '@/server/db/client';
import { requireUser } from '@/server/auth/guards';

/**
 * Wishlist writes.
 *
 * Small on purpose. A wishlist holds no money, no stock and no promise — it is
 * a list of product ids belonging to one account — so the rules worth having
 * are the two that are not obvious:
 *
 * 1. **Signing in is required, and that is the schema's decision, not a
 *    policy invented here.** `Wishlist.userId` is required and unique: there
 *    is no anonymous list to merge on sign-in the way the cart has one. The
 *    button therefore sends a signed-out visitor to sign in rather than
 *    pretending to save something.
 *
 * 2. **Only a published product can be saved.** The id arrives from a form, so
 *    it arrives from anyone, and a draft is not public. The foreign key added
 *    with this feature guarantees the product exists; this guarantees it is one
 *    the customer was allowed to see.
 */

export class WishlistError extends Error {
  constructor(
    message: string,
    /** Key under the `wishlist` namespace in messages/, so the UI can translate it. */
    readonly code: 'productNotFound',
  ) {
    super(message);
    this.name = 'WishlistError';
  }
}

/**
 * The account's wishlist row, created on first use.
 *
 * `upsert` rather than find-then-create: two tabs saving at the same moment
 * both find nothing and both insert, and `userId` is unique, so one of them
 * would meet a constraint error while doing something entirely ordinary.
 */
async function wishlistIdFor(userId: string): Promise<string> {
  const wishlist = await db.wishlist.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: { id: true },
  });

  return wishlist.id;
}

/**
 * Save the product, or unsave it if it was already saved.
 *
 * One action for both directions, because the button is one control: sending
 * "add" for something already in the list is how a double click ends up
 * meaning nothing at all. The return value is what the button should now show.
 */
export async function toggleWishlistItem(
  productId: string,
): Promise<{ saved: boolean }> {
  const user = await requireUser();

  const product = await db.product.findFirst({
    where: { id: productId, isPublished: true },
    select: { id: true },
  });

  if (!product) {
    throw new WishlistError(`no published product ${productId}`, 'productNotFound');
  }

  const wishlistId = await wishlistIdFor(user.id);

  // Delete first and read the count, rather than reading and then deciding:
  // the read-then-write has a window in which the other tab already removed
  // the row, and this has none.
  const removed = await db.wishlistItem.deleteMany({
    where: { wishlistId, productId },
  });
  if (removed.count > 0) return { saved: false };

  try {
    await db.wishlistItem.create({ data: { wishlistId, productId } });
  } catch (error) {
    // The other tab added it between the delete and the insert. The customer
    // asked for it to be saved and it is saved; reporting an error here would
    // describe a race they cannot see and did not cause.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { saved: true };
    }
    throw error;
  }

  return { saved: true };
}

/**
 * Remove one product from the list.
 *
 * Separate from the toggle because the wishlist page's control means "remove",
 * not "flip": on a page that only shows saved products, a toggle would silently
 * re-add anything the customer double-clicked.
 */
export async function removeWishlistItem(productId: string): Promise<void> {
  const user = await requireUser();

  // Scoped by the session's own wishlist, so an id belonging to somebody else's
  // list matches nothing rather than deleting their row.
  await db.wishlistItem.deleteMany({
    where: { productId, wishlist: { userId: user.id } },
  });
}
