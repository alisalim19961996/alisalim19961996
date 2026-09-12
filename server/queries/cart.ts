import 'server-only';

import { db } from '@/server/db/client';
import { cartTotals } from '@/lib/domain/cart';
import { getAvailability } from '@/lib/domain/availability';
import type { Availability } from '@/lib/domain/availability';
import type { Locale } from '@/i18n/routing';

/**
 * Cart reads, shaped for the two screens that need them: the cart page and the
 * header's item count.
 *
 * Prices come from the variant row on every read rather than from anything
 * stored on the cart line. A cart is a list of intentions, not a quote — if the
 * price moved while the tab was open, the customer sees the new one before
 * they commit, not a surprise at checkout.
 */

export interface CartLine {
  variantId: string;
  productSlug: string;
  name: string;
  brandName: string;
  variantLabel: string;
  imageUrl: string | null;
  isDemoImage: boolean;
  unitPriceIqd: number;
  comparePriceIqd: number | null;
  quantity: number;
  lineTotalIqd: number;
  availability: Availability;
}

export interface CartView {
  lines: CartLine[];
  subtotalIqd: number;
  itemCount: number;
  /** True when any line can no longer be bought, so checkout must be blocked. */
  hasBlockedLine: boolean;
}

const EMPTY_CART: CartView = {
  lines: [],
  subtotalIqd: 0,
  itemCount: 0,
  hasBlockedLine: false,
};

export async function getCartView(
  cartId: string | null,
  locale: Locale,
): Promise<CartView> {
  if (!cartId) return EMPTY_CART;

  const items = await db.cartItem.findMany({
    where: { cartId },
    orderBy: { createdAt: 'asc' },
    select: {
      quantity: true,
      variant: {
        select: {
          id: true,
          labelAr: true,
          labelEn: true,
          priceIqd: true,
          comparePriceIqd: true,
          imageUrl: true,
          isActive: true,
          inventory: {
            select: {
              trackQuantity: true,
              status: true,
              onHand: true,
              reserved: true,
            },
          },
          product: {
            select: {
              slugAr: true,
              slugEn: true,
              nameAr: true,
              nameEn: true,
              isPublished: true,
              brand: { select: { nameAr: true, nameEn: true } },
              images: {
                select: { url: true, isDemo: true },
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  const isArabic = locale === 'ar';

  const lines: CartLine[] = items.map((item) => {
    const { variant } = item;
    const image = variant.product.images[0];

    // A variant that was unpublished or deactivated while it sat in the cart
    // is reported as discontinued rather than crashing the page — the customer
    // gets a clear line to remove instead of an error.
    const availability: Availability =
      !variant.isActive || !variant.product.isPublished || !variant.inventory
        ? { kind: 'discontinued' }
        : getAvailability(variant.inventory, item.quantity);

    return {
      variantId: variant.id,
      productSlug: isArabic ? variant.product.slugAr : variant.product.slugEn,
      name: isArabic ? variant.product.nameAr : variant.product.nameEn,
      brandName: isArabic ? variant.product.brand.nameAr : variant.product.brand.nameEn,
      variantLabel: isArabic ? variant.labelAr : variant.labelEn,
      imageUrl: variant.imageUrl ?? image?.url ?? null,
      isDemoImage: image?.isDemo ?? false,
      unitPriceIqd: variant.priceIqd,
      comparePriceIqd: variant.comparePriceIqd,
      quantity: item.quantity,
      lineTotalIqd: variant.priceIqd * item.quantity,
      availability,
    };
  });

  const totals = cartTotals(
    lines.map((line) => ({
      unitPriceIqd: line.unitPriceIqd,
      quantity: line.quantity,
    })),
  );

  return {
    lines,
    subtotalIqd: totals.subtotalIqd,
    itemCount: totals.itemCount,
    hasBlockedLine: lines.some(
      (line) =>
        line.availability.kind !== 'available' && line.availability.kind !== 'preorder',
    ),
  };
}

/**
 * Item count for the header badge.
 *
 * Its own query because the header renders on every page and has no use for
 * images, prices or availability — fetching the whole cart to render a number
 * would put a dozen joins on the critical path of the homepage.
 */
export async function getCartItemCount(cartId: string | null): Promise<number> {
  if (!cartId) return 0;
  const result = await db.cartItem.aggregate({
    where: { cartId },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}
