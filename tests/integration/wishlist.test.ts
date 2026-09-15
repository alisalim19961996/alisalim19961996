import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

/**
 * The wishlist, against a real database.
 *
 * Nothing here holds money, so the claims worth proving are the ones about
 * whose list is being read and written, plus the two the schema now enforces:
 * a saved product must exist, and an unpublished one must not reach a page
 * that cannot link to it.
 *
 * The negatives are the point. A wrong `where` here does not throw — it
 * returns somebody else's saved products, or deletes a row out of their list,
 * and both look like success.
 */

const VIEWER = { id: '', name: 'Viewer', email: '', role: Role.CUSTOMER };

vi.mock('@/server/auth/guards', () => ({
  getCurrentUser: async () => (VIEWER.id ? VIEWER : null),
  requireUser: async () => {
    if (!VIEWER.id) throw new Error('not signed in');
    return VIEWER;
  },
  requireStaff: async () => VIEWER,
  requireAdmin: async () => VIEWER,
}));

const { db } = await import('@/server/db/client');
const { getWishlist, getWishlistProductIds } =
  await import('@/server/queries/wishlist');
const { toggleWishlistItem, removeWishlistItem, WishlistError } =
  await import('@/server/services/wishlist');

const SUFFIX = Math.random().toString(36).slice(2, 8);
const made = { users: [] as string[], products: [] as string[] };

async function makeUser(label: string) {
  const user = await db.user.create({
    data: {
      email: `wish-${label}-${SUFFIX}@mps.local`,
      name: `Wishlist ${label}`,
      role: Role.CUSTOMER,
      emailVerified: false,
    },
    select: { id: true },
  });
  made.users.push(user.id);
  return user;
}

/**
 * A product row written directly.
 *
 * It borrows the seed's taxonomy rather than inventing one: `admin-products`
 * already covers creating products through the service, and a second copy of
 * that setup here would test the product path all over again instead of the
 * list.
 */
async function makeProduct(label: string, isPublished: boolean) {
  const [productType, brand, category] = await Promise.all([
    db.productType.findFirstOrThrow({ select: { id: true } }),
    db.brand.findFirstOrThrow({ select: { id: true } }),
    db.category.findFirstOrThrow({ select: { id: true } }),
  ]);

  const product = await db.product.create({
    data: {
      slugAr: `wish-${label}-${SUFFIX}`,
      slugEn: `wish-${label}-${SUFFIX}`,
      nameAr: `منتج ${label}`,
      nameEn: `Wishlist ${label}`,
      productTypeId: productType.id,
      brandId: brand.id,
      categoryId: category.id,
      isPublished,
      publishedAt: isPublished ? new Date() : null,
      minPriceIqd: 100_000,
    },
    select: { id: true },
  });
  made.products.push(product.id);
  return product;
}

beforeAll(async () => {
  const viewer = await makeUser('viewer');
  VIEWER.id = viewer.id;
});

afterAll(async () => {
  // Wishlist rows cascade from the user, and wishlist items now cascade from
  // the product as well — which is the relation this feature added.
  await db.product.deleteMany({ where: { id: { in: made.products } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
  await db.$disconnect();
});

describe('saving and unsaving', () => {
  it('creates the list on first use and toggles both ways', async () => {
    const product = await makeProduct('toggle', true);

    expect(await toggleWishlistItem(product.id)).toEqual({ saved: true });
    expect(await getWishlistProductIds()).toContain(product.id);

    expect(await toggleWishlistItem(product.id)).toEqual({ saved: false });
    expect(await getWishlistProductIds()).not.toContain(product.id);
  });

  it('refuses a product that does not exist', async () => {
    // The foreign key added with this feature would refuse it too, but as a
    // constraint error nobody can read — and only after a row was attempted.
    await expect(toggleWishlistItem('doesnotexist')).rejects.toBeInstanceOf(
      WishlistError,
    );
  });

  it('refuses a product that is not published', async () => {
    const draft = await makeProduct('draft', false);

    // A draft is not public. The id is real, so the foreign key is satisfied
    // and nothing below the service would notice.
    await expect(toggleWishlistItem(draft.id)).rejects.toBeInstanceOf(WishlistError);
    expect(await getWishlistProductIds()).not.toContain(draft.id);
  });

  it('deletes the item when the product is deleted', async () => {
    const product = await makeProduct('cascade', true);
    await toggleWishlistItem(product.id);
    expect(await getWishlistProductIds()).toContain(product.id);

    await db.product.delete({ where: { id: product.id } });
    made.products.splice(made.products.indexOf(product.id), 1);

    // The column carried no foreign key at all before this feature, so this
    // row would have survived its product and pointed at nothing.
    expect(await getWishlistProductIds()).not.toContain(product.id);
  });
});

describe('what the page shows', () => {
  it('hides a product that was unpublished, and counts it instead', async () => {
    const product = await makeProduct('unpublished-later', true);
    await toggleWishlistItem(product.id);

    const before = await getWishlist();
    expect(before.products.map((row) => row.id)).toContain(product.id);
    const countedBefore = before.unavailable;

    await db.product.update({
      where: { id: product.id },
      data: { isPublished: false },
    });

    const after = await getWishlist();
    // Not rendered — its page is off the shop floor, so its card would be a
    // dead link — but not dropped in silence either.
    expect(after.products.map((row) => row.id)).not.toContain(product.id);
    expect(after.unavailable).toBe(countedBefore + 1);

    // And the row is still there, so republishing brings the card back.
    await db.product.update({
      where: { id: product.id },
      data: { isPublished: true },
    });
    expect((await getWishlist()).products.map((row) => row.id)).toContain(product.id);
  });
});

describe('one account cannot reach another', () => {
  it('reads only its own list', async () => {
    const stranger = await makeUser('stranger');
    const mine = await makeProduct('mine', true);
    const theirs = await makeProduct('theirs', true);

    await toggleWishlistItem(mine.id);

    // Written directly, because the service only ever acts on the session's
    // own list — which is the property under test.
    const strangerList = await db.wishlist.create({
      data: { userId: stranger.id },
      select: { id: true },
    });
    await db.wishlistItem.create({
      data: { wishlistId: strangerList.id, productId: theirs.id },
    });

    const ids = await getWishlistProductIds();
    expect(ids).toContain(mine.id);
    expect(ids, "another account's saved product was returned").not.toContain(
      theirs.id,
    );

    const view = await getWishlist();
    expect(view.products.map((row) => row.id)).not.toContain(theirs.id);
  });

  it('cannot remove an item from somebody else’s list', async () => {
    const stranger = await makeUser('victim');
    const product = await makeProduct('victims-item', true);

    const strangerList = await db.wishlist.upsert({
      where: { userId: stranger.id },
      update: {},
      create: { userId: stranger.id },
      select: { id: true },
    });
    await db.wishlistItem.create({
      data: { wishlistId: strangerList.id, productId: product.id },
    });

    // The id is real and the caller knows it. The delete is scoped by the
    // session's own wishlist, so it matches nothing rather than reaching in.
    await removeWishlistItem(product.id);

    const survived = await db.wishlistItem.count({
      where: { wishlistId: strangerList.id, productId: product.id },
    });
    expect(survived, "one account deleted another account's saved product").toBe(1);
  });

  it('returns nothing at all when nobody is signed in', async () => {
    const product = await makeProduct('signed-out', true);
    await toggleWishlistItem(product.id);

    const signedIn = VIEWER.id;
    VIEWER.id = '';
    try {
      expect(await getWishlistProductIds()).toEqual([]);
      expect(await getWishlist()).toEqual({ products: [], unavailable: 0 });
      await expect(toggleWishlistItem(product.id)).rejects.toThrow();
    } finally {
      // Restored here rather than in an afterAll: an interrupted run would
      // otherwise leave every later test in this file signed out (§17).
      VIEWER.id = signedIn;
    }
  });
});
