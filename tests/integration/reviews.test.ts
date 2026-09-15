import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Governorate,
  OrderStatus,
  ReviewStatus,
  Role,
  StockStatus,
} from '@prisma/client';

/**
 * Reviews, against a real database.
 *
 * Two things here cannot be tested with a fake, and both are the feature:
 *
 * 1. **Who may write one.** The rule is "this account has a DELIVERED order
 *    containing this product", which is three joins — order to item to variant
 *    to product — and `OrderItem` carries no productId of its own. A wrong
 *    join does not throw; it lets a stranger review a phone they never bought.
 *
 * 2. **The rating columns.** They are denormalised, recomputed inside the
 *    transaction that moderates a review, and constrained by Postgres. A
 *    recompute that counted PENDING rows would show an average nobody had
 *    approved, and nothing in the application would notice.
 */

const VIEWER = { id: '', name: 'Reviewer', email: '', role: Role.CUSTOMER };
const STAFF = { id: '', name: 'Staff', email: '', role: Role.ADMIN };

vi.mock('@/server/auth/guards', () => ({
  getCurrentUser: async () => (VIEWER.id ? VIEWER : null),
  requireUser: async () => {
    if (!VIEWER.id) throw new Error('not signed in');
    return VIEWER;
  },
  requireStaff: async () => STAFF,
  requireAdmin: async () => STAFF,
}));

const { db } = await import('@/server/db/client');
const { submitReview, ReviewError } = await import('@/server/services/review');
const { moderateReview, deleteReview } =
  await import('@/server/services/admin-reviews');
const { getProductReviews, getReviewSummary, getReviewEligibility } =
  await import('@/server/queries/review');

const SUFFIX = Math.random().toString(36).slice(2, 8);
const made = {
  users: [] as string[],
  products: [] as string[],
  orders: [] as string[],
};

async function makeUser(label: string) {
  const user = await db.user.create({
    data: {
      email: `rev-${label}-${SUFFIX}@mps.local`,
      name: `Review ${label}`,
      role: Role.CUSTOMER,
      emailVerified: false,
    },
    select: { id: true },
  });
  made.users.push(user.id);
  return user;
}

/** A published product with one buyable variant, which is what an order needs. */
async function makeProduct(label: string) {
  const [productType, brand, category] = await Promise.all([
    db.productType.findFirstOrThrow({ select: { id: true } }),
    db.brand.findFirstOrThrow({ select: { id: true } }),
    db.category.findFirstOrThrow({ select: { id: true } }),
  ]);

  const product = await db.product.create({
    data: {
      slugAr: `rev-${label}-${SUFFIX}`,
      slugEn: `rev-${label}-${SUFFIX}`,
      nameAr: `منتج ${label}`,
      nameEn: `Review ${label}`,
      productTypeId: productType.id,
      brandId: brand.id,
      categoryId: category.id,
      isPublished: true,
      publishedAt: new Date(),
      minPriceIqd: 100_000,
      variants: {
        create: {
          sku: `REV-${SUFFIX}-${label}`.toUpperCase(),
          labelAr: 'قياس',
          labelEn: 'One size',
          priceIqd: 100_000,
          isActive: true,
          inventory: { create: { status: StockStatus.IN_STOCK } },
        },
      },
    },
    select: { id: true, variants: { select: { id: true } } },
  });

  made.products.push(product.id);
  return product;
}

/**
 * An order written directly, at a chosen status.
 *
 * `placeOrder` is covered thoroughly in `order.test.ts`; going through it here
 * would need a cart and a delivery rate per case and would test checkout all
 * over again rather than the thing under test, which is whether an order makes
 * somebody eligible.
 */
async function makeOrder(
  userId: string | null,
  variantId: string,
  status: OrderStatus,
  label: string,
) {
  const order = await db.order.create({
    data: {
      orderNumber: `MPS-REV${SUFFIX.toUpperCase()}-${label}`,
      userId,
      fullName: 'Review Integration',
      phone: '+9647701234567',
      governorate: Governorate.BAGHDAD,
      city: 'Baghdad',
      addressLine: 'Somewhere',
      status,
      subtotalIqd: 100_000,
      discountIqd: 0,
      deliveryIqd: 5_000,
      totalIqd: 105_000,
      items: {
        create: {
          variantId,
          productNameAr: 'منتج',
          productNameEn: 'Product',
          brandName: 'Brand',
          sku: `REV-${SUFFIX}-${label}`.toUpperCase(),
          variantLabelAr: 'قياس',
          variantLabelEn: 'One size',
          unitPriceIqd: 100_000,
          quantity: 1,
          lineTotalIqd: 100_000,
        },
      },
    },
    select: { id: true },
  });
  made.orders.push(order.id);
  return order;
}

beforeAll(async () => {
  const [viewer, staff] = await Promise.all([makeUser('viewer'), makeUser('staff')]);
  VIEWER.id = viewer.id;
  STAFF.id = staff.id;
});

afterAll(async () => {
  await db.order.deleteMany({ where: { id: { in: made.orders } } });
  await db.product.deleteMany({ where: { id: { in: made.products } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
  await db.$disconnect();
});

describe('who may write a review', () => {
  it('refuses somebody who never bought it', async () => {
    const product = await makeProduct('unbought');

    expect(await getReviewEligibility(product.id)).toEqual({
      can: false,
      reason: 'notPurchased',
    });

    await expect(
      submitReview({
        productId: product.id,
        rating: 5,
        title: null,
        body: 'x'.repeat(20),
      }),
    ).rejects.toBeInstanceOf(ReviewError);
  });

  it('refuses an order that has not been delivered yet', async () => {
    const product = await makeProduct('pending-order');
    const variant = product.variants[0]!;
    await makeOrder(VIEWER.id, variant.id, OrderStatus.OUT_FOR_DELIVERY, 'OFD');

    // Bought is not received. A review written before the courier arrives is
    // a review of a photograph.
    expect(await getReviewEligibility(product.id)).toEqual({
      can: false,
      reason: 'notPurchased',
    });
  });

  it('allows a customer whose order was delivered', async () => {
    const product = await makeProduct('delivered');
    const variant = product.variants[0]!;
    await makeOrder(VIEWER.id, variant.id, OrderStatus.DELIVERED, 'DEL');

    expect(await getReviewEligibility(product.id)).toEqual({ can: true });

    await submitReview({
      productId: product.id,
      rating: 4,
      title: 'Good',
      body: 'It arrived and it works.',
    });

    const review = await db.review.findFirstOrThrow({
      where: { productId: product.id, userId: VIEWER.id },
      select: { status: true, isVerifiedPurchase: true },
    });

    // PENDING, always: nothing a customer types reaches a product page before
    // somebody has read it.
    expect(review.status).toBe(ReviewStatus.PENDING);
    expect(review.isVerifiedPurchase).toBe(true);
  });

  it("does not count somebody else's delivered order", async () => {
    const product = await makeProduct('someone-elses');
    const variant = product.variants[0]!;
    const stranger = await makeUser('stranger');
    await makeOrder(stranger.id, variant.id, OrderStatus.DELIVERED, 'STR');

    // The order exists and the product was delivered — to another account.
    expect(await getReviewEligibility(product.id)).toEqual({
      can: false,
      reason: 'notPurchased',
    });
  });

  it('does not count a guest order at all', async () => {
    const product = await makeProduct('guest-order');
    const variant = product.variants[0]!;
    await makeOrder(null, variant.id, OrderStatus.DELIVERED, 'GST');

    // A guest order has no account on it, and a phone number is not an
    // identity MPS verifies anywhere (§12).
    expect(await getReviewEligibility(product.id)).toEqual({
      can: false,
      reason: 'notPurchased',
    });
  });

  it('refuses a second review of the same product', async () => {
    const product = await makeProduct('twice');
    const variant = product.variants[0]!;
    await makeOrder(VIEWER.id, variant.id, OrderStatus.DELIVERED, 'TWC');

    const write = () =>
      submitReview({
        productId: product.id,
        rating: 5,
        title: null,
        body: 'Written once, then again.',
      });

    await write();
    // The unique index is the real guard: the eligibility read that renders
    // the form is a different request, and two tabs both pass it.
    await expect(write()).rejects.toBeInstanceOf(ReviewError);
  });
});

describe('the rating columns', () => {
  it('stay at zero while a review is only pending', async () => {
    const product = await makeProduct('still-pending');
    const variant = product.variants[0]!;
    await makeOrder(VIEWER.id, variant.id, OrderStatus.DELIVERED, 'PND');

    await submitReview({
      productId: product.id,
      rating: 5,
      title: null,
      body: 'Five stars, not yet approved.',
    });

    const summary = await getReviewSummary(product.id);
    expect(summary.count).toBe(0);
    // Null, never 0.0 — a product nobody has reviewed has no rating, and 0 is
    // a rating nobody can give.
    expect(summary.average).toBeNull();
    expect(await getProductReviews(product.id)).toEqual([]);
  });

  it('move when a review is approved, and back when it is rejected', async () => {
    const product = await makeProduct('approve-reject');
    const variant = product.variants[0]!;
    await makeOrder(VIEWER.id, variant.id, OrderStatus.DELIVERED, 'APR');

    await submitReview({
      productId: product.id,
      rating: 4,
      title: null,
      body: 'Four stars from a real order.',
    });

    const review = await db.review.findFirstOrThrow({
      where: { productId: product.id },
      select: { id: true },
    });

    await moderateReview(review.id, true);

    const approved = await getReviewSummary(product.id);
    expect(approved.count).toBe(1);
    expect(approved.average).toBe(4);
    expect(approved.buckets.find((bucket) => bucket.rating === 4)?.count).toBe(1);
    expect(await getProductReviews(product.id)).toHaveLength(1);

    // Rejecting one that was approved has to take its stars back out.
    await moderateReview(review.id, false);

    const rejected = await getReviewSummary(product.id);
    expect(rejected.count).toBe(0);
    expect(rejected.average).toBeNull();
    expect(await getProductReviews(product.id)).toEqual([]);
  });

  it('averages several approved reviews', async () => {
    const product = await makeProduct('average');
    const variant = product.variants[0]!;

    for (const [index, rating] of [5, 4, 3].entries()) {
      const author = await makeUser(`author-${index}`);
      await makeOrder(author.id, variant.id, OrderStatus.DELIVERED, `AVG${index}`);

      const signedIn = VIEWER.id;
      VIEWER.id = author.id;
      try {
        await submitReview({
          productId: product.id,
          rating,
          title: null,
          body: `Rated ${rating} out of five.`,
        });
      } finally {
        // Restored per iteration, not at the end: an interrupted run would
        // otherwise leave every later test acting as the wrong person (§17).
        VIEWER.id = signedIn;
      }
    }

    const pending = await db.review.findMany({
      where: { productId: product.id },
      select: { id: true },
    });
    for (const review of pending) await moderateReview(review.id, true);

    const summary = await getReviewSummary(product.id);
    expect(summary.count).toBe(3);
    expect(summary.average).toBe(4);

    const stored = await db.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { ratingSum: true, ratingCount: true },
    });
    // The columns themselves, not just what the query derived from them: the
    // CHECK constraints refuse a sum outside [count, count × 5], so a broken
    // recompute fails here rather than rendering a seven-star product.
    expect(stored).toEqual({ ratingSum: 12, ratingCount: 3 });
  });

  it('recomputes when an approved review is deleted outright', async () => {
    const product = await makeProduct('deleted');
    const variant = product.variants[0]!;
    await makeOrder(VIEWER.id, variant.id, OrderStatus.DELIVERED, 'DLT');

    await submitReview({
      productId: product.id,
      rating: 5,
      title: null,
      body: 'To be removed entirely.',
    });

    const review = await db.review.findFirstOrThrow({
      where: { productId: product.id },
      select: { id: true },
    });
    await moderateReview(review.id, true);
    expect((await getReviewSummary(product.id)).count).toBe(1);

    await deleteReview(review.id);

    const after = await getReviewSummary(product.id);
    expect(after.count).toBe(0);
    expect(after.average).toBeNull();
  });
});

describe('what the storefront can see', () => {
  it('never returns a pending or rejected review', async () => {
    const product = await makeProduct('visibility');
    const variant = product.variants[0]!;

    const approvedAuthor = await makeUser('approved-author');
    const rejectedAuthor = await makeUser('rejected-author');

    for (const [index, author] of [approvedAuthor, rejectedAuthor].entries()) {
      await makeOrder(author.id, variant.id, OrderStatus.DELIVERED, `VIS${index}`);
      const signedIn = VIEWER.id;
      VIEWER.id = author.id;
      try {
        await submitReview({
          productId: product.id,
          rating: 5,
          title: null,
          body: `Review number ${index} of this product.`,
        });
      } finally {
        VIEWER.id = signedIn;
      }
    }

    const [first, second] = await db.review.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    await moderateReview(first!.id, true);
    await moderateReview(second!.id, false);

    const visible = await getProductReviews(product.id);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.id).toBe(first!.id);
  });

  it('never returns the reviewer’s email', async () => {
    const product = await makeProduct('privacy');
    const variant = product.variants[0]!;
    await makeOrder(VIEWER.id, variant.id, OrderStatus.DELIVERED, 'PRV');

    await submitReview({
      productId: product.id,
      rating: 5,
      title: null,
      body: 'The page this appears on is public.',
    });
    const review = await db.review.findFirstOrThrow({
      where: { productId: product.id },
      select: { id: true },
    });
    await moderateReview(review.id, true);

    const [visible] = await getProductReviews(product.id);
    expect(visible).toBeDefined();
    expect(JSON.stringify(visible)).not.toContain('@mps.local');
  });
});
