import 'server-only';
import { AttributeDataType } from '@prisma/client';
import { db } from '@/server/db/client';
import type { Locale } from '@/i18n/routing';

/**
 * Product detail reads.
 *
 * The specification table is the interesting part: which rows a product shows
 * is decided by its ProductType, not by this file. A tablet renders "stylus
 * support" and no NFC row; a cable renders neither. Adding a product type later
 * changes nothing here.
 */

export async function getProductBySlug(slug: string) {
  return db.product.findFirst({
    where: {
      isPublished: true,
      // Both locales resolve the same latin slug today; matching either keeps
      // old links working if a localised slug is introduced later.
      OR: [{ slugEn: slug }, { slugAr: slug }],
    },
    select: {
      id: true,
      slugAr: true,
      slugEn: true,
      nameAr: true,
      nameEn: true,
      taglineAr: true,
      taglineEn: true,
      overviewAr: true,
      overviewEn: true,
      prosAr: true,
      prosEn: true,
      consAr: true,
      consEn: true,
      whoIsItForAr: true,
      whoIsItForEn: true,
      thingsToKnowAr: true,
      thingsToKnowEn: true,
      warrantyMonths: true,
      warrantyNoteAr: true,
      warrantyNoteEn: true,
      metaTitleAr: true,
      metaTitleEn: true,
      metaDescriptionAr: true,
      metaDescriptionEn: true,
      minPriceIqd: true,
      publishedAt: true,
      brand: {
        select: { slug: true, nameAr: true, nameEn: true, accentColor: true },
      },
      category: { select: { slug: true, nameAr: true, nameEn: true } },
      productType: { select: { key: true, nameAr: true, nameEn: true } },
      images: {
        select: { id: true, url: true, altAr: true, altEn: true, isDemo: true },
        orderBy: { sortOrder: 'asc' },
      },
      videos: {
        select: {
          id: true,
          provider: true,
          videoId: true,
          titleAr: true,
          titleEn: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
      options: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          isColor: true,
          values: {
            select: { id: true, valueAr: true, valueEn: true, hex: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          labelAr: true,
          labelEn: true,
          priceIqd: true,
          comparePriceIqd: true,
          imageUrl: true,
          optionValues: { select: { optionValueId: true } },
          inventory: {
            select: {
              status: true,
              trackQuantity: true,
              onHand: true,
              reserved: true,
              lowStockThreshold: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      attributeValues: {
        select: {
          valueInt: true,
          valueDecimal: true,
          valueText: true,
          valueBool: true,
          definition: {
            select: {
              key: true,
              labelAr: true,
              labelEn: true,
              type: true,
              unit: true,
              sortOrder: true,
              group: {
                select: { key: true, nameAr: true, nameEn: true, sortOrder: true },
              },
            },
          },
          option: { select: { labelAr: true, labelEn: true } },
        },
      },
    },
  });
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;
type AttributeValueRow = ProductDetail['attributeValues'][number];

export interface SpecRow {
  key: string;
  label: string;
  value: string;
}

export interface SpecGroup {
  key: string;
  name: string;
  rows: SpecRow[];
}

/** Render one stored attribute value as the string a shopper reads. */
function formatAttributeValue(row: AttributeValueRow, locale: Locale): string | null {
  const { definition } = row;
  const unit = definition.unit ? ` ${definition.unit}` : '';

  switch (definition.type) {
    case AttributeDataType.INT:
      return row.valueInt == null ? null : `${row.valueInt}${unit}`;
    case AttributeDataType.DECIMAL:
      // Decimal comes back as a Prisma Decimal; Number() is safe here because
      // these are measurements, never money.
      return row.valueDecimal == null ? null : `${Number(row.valueDecimal)}${unit}`;
    case AttributeDataType.BOOLEAN:
      if (row.valueBool == null) return null;
      if (locale === 'ar') return row.valueBool ? 'نعم' : 'لا';
      return row.valueBool ? 'Yes' : 'No';
    case AttributeDataType.ENUM:
      if (!row.option) return null;
      return locale === 'ar' ? row.option.labelAr : row.option.labelEn;
    default:
      return row.valueText ? `${row.valueText}${unit}` : null;
  }
}

/**
 * Group a product's attribute values into the sections the page renders.
 * Empty values are dropped rather than shown as blank rows, and empty groups
 * disappear with them.
 */
export function buildSpecGroups(
  product: Pick<ProductDetail, 'attributeValues'>,
  locale: Locale,
): SpecGroup[] {
  const groups = new Map<string, SpecGroup & { order: number; rowOrder: number[] }>();

  for (const row of product.attributeValues) {
    const value = formatAttributeValue(row, locale);
    if (!value) continue;

    const group = row.definition.group;
    const groupKey = group?.key ?? 'other';
    const groupName = group
      ? locale === 'ar'
        ? group.nameAr
        : group.nameEn
      : locale === 'ar'
        ? 'أخرى'
        : 'Other';

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        name: groupName,
        rows: [],
        order: group?.sortOrder ?? 99,
        rowOrder: [],
      });
    }

    const entry = groups.get(groupKey)!;
    entry.rows.push({
      key: row.definition.key,
      label: locale === 'ar' ? row.definition.labelAr : row.definition.labelEn,
      value,
    });
    entry.rowOrder.push(row.definition.sortOrder);
  }

  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((group) => {
      const rows = group.rows
        .map((row, index) => ({ row, order: group.rowOrder[index] ?? 99 }))
        .sort((a, b) => a.order - b.order)
        .map(({ row }) => row);
      return { key: group.key, name: group.name, rows };
    });
}

/** A short spec strip for the product card and the top of the detail page. */
export function buildHighlights(
  product: Pick<ProductDetail, 'attributeValues'>,
  locale: Locale,
  keys: readonly string[] = [
    'ram_gb',
    'storage_gb',
    'battery_mah',
    'display_size_inch',
  ],
): SpecRow[] {
  const byKey = new Map(
    product.attributeValues.map((row) => [row.definition.key, row] as const),
  );

  return keys.flatMap((key) => {
    const row = byKey.get(key);
    if (!row) return [];
    const value = formatAttributeValue(row, locale);
    if (!value) return [];
    return [
      {
        key,
        label: locale === 'ar' ? row.definition.labelAr : row.definition.labelEn,
        value,
      },
    ];
  });
}

/** Products a shopper might consider instead: same type, similar price. */
export async function getRelatedProducts(
  productId: string,
  productTypeKey: string,
  minPriceIqd: number | null,
  take = 4,
) {
  const spread = minPriceIqd ? Math.round(minPriceIqd * 0.4) : null;

  return db.product.findMany({
    where: {
      isPublished: true,
      id: { not: productId },
      productType: { key: productTypeKey },
      ...(minPriceIqd && spread
        ? {
            minPriceIqd: {
              gte: Math.max(0, minPriceIqd - spread),
              lte: minPriceIqd + spread,
            },
          }
        : {}),
    },
    select: {
      id: true,
      slugAr: true,
      slugEn: true,
      nameAr: true,
      nameEn: true,
      taglineAr: true,
      taglineEn: true,
      minPriceIqd: true,
      isNewArrival: true,
      isBestSeller: true,
      brand: { select: { slug: true, nameAr: true, nameEn: true, accentColor: true } },
      productType: { select: { key: true } },
      images: {
        select: { url: true, altAr: true, altEn: true, isDemo: true },
        orderBy: { sortOrder: 'asc' },
        take: 1,
      },
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          priceIqd: true,
          comparePriceIqd: true,
          inventory: {
            select: { status: true, trackQuantity: true, onHand: true, reserved: true },
          },
        },
        orderBy: { priceIqd: 'asc' },
      },
    },
    orderBy: [{ isBestSeller: 'desc' }, { publishedAt: 'desc' }],
    take,
  });
}

/** Slugs for the sitemap and for static generation of product pages. */
export async function getAllProductSlugs() {
  return db.product.findMany({
    where: { isPublished: true },
    select: { slugEn: true, updatedAt: true },
    orderBy: { publishedAt: 'desc' },
  });
}
