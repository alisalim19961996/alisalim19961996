import 'server-only';

import type { Prisma } from '@prisma/client';
import { db } from '@/server/db/client';
import { formatAttributeValue } from './product';
import { buildComparisonRows, type ComparisonRow } from '@/lib/domain/compare';
import { getAvailability } from '@/lib/domain/availability';
import type { Locale } from '@/i18n/routing';

/**
 * The comparison read.
 *
 * Only published products, like every other storefront query, and no
 * `includeDrafts` parameter to forget: a comparison is a page anyone can open
 * with a hand-typed URL.
 *
 * The specifications come from each product's own attribute values, which are
 * reached through its product type's `ProductTypeAttribute` links — so this
 * module knows nothing about phones, and a product type invented from the
 * dashboard compares on its own specifications with no code changing (§6).
 */

const compareSelect = {
  id: true,
  slugAr: true,
  slugEn: true,
  nameAr: true,
  nameEn: true,
  taglineAr: true,
  taglineEn: true,
  warrantyMonths: true,
  brand: { select: { nameAr: true, nameEn: true } },
  productType: { select: { key: true, nameAr: true, nameEn: true } },
  images: {
    select: { url: true, altAr: true, altEn: true, isDemo: true },
    orderBy: { sortOrder: 'asc' },
    take: 1,
  },
  variants: {
    where: { isActive: true },
    select: {
      priceIqd: true,
      comparePriceIqd: true,
      inventory: {
        select: { status: true, trackQuantity: true, onHand: true, reserved: true },
      },
    },
    orderBy: { priceIqd: 'asc' },
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
          group: { select: { key: true, nameAr: true, nameEn: true, sortOrder: true } },
        },
      },
      option: { select: { labelAr: true, labelEn: true } },
    },
  },
} satisfies Prisma.ProductSelect;

export interface ComparisonColumn {
  slug: string;
  name: string;
  tagline: string | null;
  brandName: string;
  productTypeKey: string;
  productTypeName: string;
  image: { url: string; alt: string; isDemo: boolean } | null;
  priceIqd: number | null;
  comparePriceIqd: number | null;
  purchasable: boolean;
  warrantyMonths: number;
}

export interface Comparison {
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  /** Slugs that were asked for and are not on sale — so the page can say so. */
  missing: string[];
  /** True when the columns are not all the same kind of product. */
  mixedTypes: boolean;
}

export async function getComparison(
  slugs: readonly string[],
  locale: Locale,
): Promise<Comparison> {
  if (slugs.length === 0) {
    return { columns: [], rows: [], missing: [], mixedTypes: false };
  }

  const products = await db.product.findMany({
    where: {
      isPublished: true,
      // Both locale columns hold the same latin slug today; matching either is
      // what keeps a link working if a localised slug is ever introduced (§6).
      OR: [{ slugEn: { in: [...slugs] } }, { slugAr: { in: [...slugs] } }],
    },
    select: compareSelect,
  });

  const bySlug = new Map(products.map((product) => [product.slugEn, product]));
  for (const product of products) bySlug.set(product.slugAr, product);

  /*
    Ordered in JavaScript, and this is not the rule in §5 being bent. That rule
    is about filtering and sorting a DATA SET in the database rather than after
    fetching it. Here the order is the one the customer put in the URL — it is
    not expressible as an ORDER BY at all — and the set is at most four rows.
  */
  const ordered = slugs
    .map((slug) => bySlug.get(slug))
    .filter((product): product is (typeof products)[number] => product !== undefined);

  const isAr = locale === 'ar';

  const columns: ComparisonColumn[] = ordered.map((product) => {
    const cheapest = product.variants[0];
    const image = product.images[0];

    return {
      slug: product.slugEn,
      name: isAr ? product.nameAr : product.nameEn,
      tagline: (isAr ? product.taglineAr : product.taglineEn) ?? null,
      brandName: isAr ? product.brand.nameAr : product.brand.nameEn,
      productTypeKey: product.productType.key,
      productTypeName: isAr ? product.productType.nameAr : product.productType.nameEn,
      image: image
        ? {
            url: image.url,
            alt:
              (isAr ? image.altAr : image.altEn) ??
              (isAr ? product.nameAr : product.nameEn),
            isDemo: image.isDemo,
          }
        : null,
      priceIqd: cheapest?.priceIqd ?? null,
      comparePriceIqd: cheapest?.comparePriceIqd ?? null,
      // The same answer the card gives: buyable if ANY variant is (§12).
      purchasable: product.variants.some((variant) =>
        variant.inventory
          ? ['available', 'preorder'].includes(getAvailability(variant.inventory).kind)
          : false,
      ),
      warrantyMonths: product.warrantyMonths,
    };
  });

  const rows = buildComparisonRows(
    ordered.map((product) => {
      const specs = new Map<string, { label: string; value: string }>();
      const order = new Map<string, number>();

      for (const row of product.attributeValues) {
        const value = formatAttributeValue(row, locale);
        // An empty value is no value: a blank cell beside real ones reads as
        // "this product has none", which is a claim nobody made.
        if (!value) continue;

        specs.set(row.definition.key, {
          label: isAr ? row.definition.labelAr : row.definition.labelEn,
          value,
        });
        // Grouped first, then positioned inside the group, so the table runs
        // in the same order as the product page's specification panel.
        order.set(
          row.definition.key,
          (row.definition.group?.sortOrder ?? 99) * 1000 + row.definition.sortOrder,
        );
      }

      return { slug: product.slugEn, specs, order };
    }),
  );

  const found = new Set(ordered.map((product) => product.slugEn));
  const alsoFound = new Set(ordered.map((product) => product.slugAr));

  return {
    columns,
    rows,
    missing: slugs.filter((slug) => !found.has(slug) && !alsoFound.has(slug)),
    mixedTypes: new Set(columns.map((column) => column.productTypeKey)).size > 1,
  };
}
