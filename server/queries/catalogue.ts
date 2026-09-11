import 'server-only';
import { StockStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { db } from '@/server/db/client';
import { expandSearchTerms } from '@/lib/search';
import type { Locale } from '@/i18n/routing';

/**
 * Catalogue reads.
 *
 * Everything the storefront needs to list products lives here. The rules:
 *
 *  - Only published products are ever returned. There is no `includeUnpublished`
 *    escape hatch, because one forgotten flag is how a draft reaches a customer.
 *  - Every query names its columns. `include: { everything }` on a product with
 *    22 variants and 25 attribute values is a payload nobody asked for.
 *  - Filtering happens in SQL, never in JavaScript after the fact — a filter
 *    applied after fetching is a filter that stops working at 500 products.
 */

// ---------------------------------------------------------------- selections

/** The exact shape a product card needs — nothing more. */
const cardSelect = {
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
} satisfies Prisma.ProductSelect;

export type ProductCardData = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

// ------------------------------------------------------------------- filters

export interface CatalogueFilters {
  productType?: string;
  brands?: string[];
  categories?: string[];
  ram?: number[];
  storage?: number[];
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  onOfferOnly?: boolean;
  query?: string;
}

export type CatalogueSort = 'newest' | 'price_asc' | 'price_desc' | 'best_selling';

const SORT_ORDER: Record<CatalogueSort, Prisma.ProductOrderByWithRelationInput[]> = {
  // A stable secondary key keeps pagination from shuffling equal rows between
  // pages, which looks like products randomly disappearing.
  newest: [{ publishedAt: 'desc' }, { id: 'asc' }],
  price_asc: [{ minPriceIqd: 'asc' }, { id: 'asc' }],
  price_desc: [{ minPriceIqd: 'desc' }, { id: 'asc' }],
  best_selling: [{ isBestSeller: 'desc' }, { publishedAt: 'desc' }, { id: 'asc' }],
};

/**
 * Attribute filters are stored one row per (product, attribute), so each one is
 * its own `some` clause. Expressing them as separate clauses — rather than one
 * `some` with an OR — is what makes "8GB RAM *and* 256GB storage" mean both,
 * instead of either.
 */
function attributeClause(key: string, values: number[]): Prisma.ProductWhereInput {
  return {
    attributeValues: {
      some: {
        definition: { key },
        valueInt: { in: values },
      },
    },
  };
}

function buildWhere(filters: CatalogueFilters): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [{ isPublished: true }];

  if (filters.productType) {
    and.push({ productType: { key: filters.productType } });
  }
  if (filters.brands?.length) {
    and.push({ brand: { slug: { in: filters.brands } } });
  }
  if (filters.categories?.length) {
    and.push({ category: { slug: { in: filters.categories } } });
  }
  if (filters.ram?.length) {
    and.push(attributeClause('ram_gb', filters.ram));
  }
  if (filters.storage?.length) {
    and.push(attributeClause('storage_gb', filters.storage));
  }
  if (filters.minPrice != null) {
    and.push({ minPriceIqd: { gte: filters.minPrice } });
  }
  if (filters.maxPrice != null) {
    and.push({ minPriceIqd: { lte: filters.maxPrice } });
  }
  if (filters.inStockOnly) {
    and.push({
      variants: {
        some: { isActive: true, inventory: { status: StockStatus.IN_STOCK } },
      },
    });
  }
  if (filters.onOfferOnly) {
    and.push({
      variants: { some: { isActive: true, comparePriceIqd: { not: null } } },
    });
  }

  const term = filters.query?.trim();
  if (term) {
    // Arabic spellings are folded to a canonical form and expanded to their
    // Latin equivalent, so "آيفون" can reach a product stored as "iPhone".
    const terms = expandSearchTerms(term);
    if (terms.length > 0) {
      and.push({
        OR: terms.flatMap((value) => [
          { nameAr: { contains: value, mode: 'insensitive' as const } },
          { nameEn: { contains: value, mode: 'insensitive' as const } },
          { brand: { nameAr: { contains: value, mode: 'insensitive' as const } } },
          { brand: { nameEn: { contains: value, mode: 'insensitive' as const } } },
          {
            variants: {
              some: { sku: { contains: value, mode: 'insensitive' as const } },
            },
          },
        ]),
      });
    }
  }

  return { AND: and };
}

// -------------------------------------------------------------------- reads

export interface CatalogueResult {
  products: ProductCardData[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

export async function getCatalogue(
  filters: CatalogueFilters,
  sort: CatalogueSort,
  page: number,
  perPage: number,
): Promise<CatalogueResult> {
  const where = buildWhere(filters);

  // One round trip for both: the count is needed for pagination, and running it
  // after the rows would double the latency for no reason.
  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      select: cardSelect,
      orderBy: SORT_ORDER[sort],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.product.count({ where }),
  ]);

  return {
    products,
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Products for a homepage rail. Small, fixed size, no pagination. */
export async function getProductRail(
  flag: 'isFeatured' | 'isNewArrival' | 'isBestSeller',
  take = 8,
): Promise<ProductCardData[]> {
  return db.product.findMany({
    where: { isPublished: true, [flag]: true },
    select: cardSelect,
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    take,
  });
}

/**
 * The filter options a shopper can actually pick, with the number of products
 * behind each. Counts are computed against the *other* active filters, so a
 * facet never offers a choice that would return nothing.
 */
export interface FacetOption {
  value: string;
  labelAr: string;
  labelEn: string;
  count: number;
}

export interface CatalogueFacets {
  brands: FacetOption[];
  categories: FacetOption[];
  ram: FacetOption[];
  storage: FacetOption[];
  priceRange: { min: number; max: number };
}

async function attributeFacet(
  key: string,
  baseWhere: Prisma.ProductWhereInput,
  unit: string,
): Promise<FacetOption[]> {
  const rows = await db.productAttributeValue.groupBy({
    by: ['valueInt'],
    where: { definition: { key }, valueInt: { not: null }, product: baseWhere },
    _count: { _all: true },
    orderBy: { valueInt: 'asc' },
  });

  return rows
    .filter((row): row is typeof row & { valueInt: number } => row.valueInt != null)
    .map((row) => ({
      value: String(row.valueInt),
      labelAr: `${row.valueInt} ${unit}`,
      labelEn: `${row.valueInt}${unit === 'جيجا' ? 'GB' : ''}`,
      count: row._count._all,
    }));
}

export async function getCatalogueFacets(
  filters: CatalogueFilters,
): Promise<CatalogueFacets> {
  // Facet counts ignore the facet's own filter — otherwise selecting one brand
  // would show every other brand as having zero products.
  const withoutBrand = buildWhere({ ...filters, brands: undefined });
  const withoutCategory = buildWhere({ ...filters, categories: undefined });
  const withoutRam = buildWhere({ ...filters, ram: undefined });
  const withoutStorage = buildWhere({ ...filters, storage: undefined });
  const withoutPrice = buildWhere({
    ...filters,
    minPrice: undefined,
    maxPrice: undefined,
  });

  const [brandRows, categoryRows, ram, storage, priceBounds] = await Promise.all([
    db.brand.findMany({
      where: { isActive: true, products: { some: withoutBrand } },
      select: {
        slug: true,
        nameAr: true,
        nameEn: true,
        _count: { select: { products: { where: withoutBrand } } },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    db.category.findMany({
      where: { isActive: true, products: { some: withoutCategory } },
      select: {
        slug: true,
        nameAr: true,
        nameEn: true,
        _count: { select: { products: { where: withoutCategory } } },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    attributeFacet('ram_gb', withoutRam, 'جيجا'),
    attributeFacet('storage_gb', withoutStorage, 'جيجا'),
    db.product.aggregate({
      where: withoutPrice,
      _min: { minPriceIqd: true },
      _max: { minPriceIqd: true },
    }),
  ]);

  return {
    brands: brandRows.map((brand) => ({
      value: brand.slug,
      labelAr: brand.nameAr,
      labelEn: brand.nameEn,
      count: brand._count.products,
    })),
    categories: categoryRows.map((category) => ({
      value: category.slug,
      labelAr: category.nameAr,
      labelEn: category.nameEn,
      count: category._count.products,
    })),
    ram,
    storage,
    priceRange: {
      min: priceBounds._min.minPriceIqd ?? 0,
      max: priceBounds._max.minPriceIqd ?? 0,
    },
  };
}

/** Brands for the homepage rail and the brands page. */
export async function getBrands() {
  return db.brand.findMany({
    where: { isActive: true },
    select: {
      slug: true,
      nameAr: true,
      nameEn: true,
      accentColor: true,
      _count: { select: { products: { where: { isPublished: true } } } },
    },
    orderBy: { sortOrder: 'asc' },
  });
}

/** Top-level product types, used for the "shop by type" entry points. */
export async function getProductTypes() {
  return db.productType.findMany({
    where: { isActive: true },
    select: {
      key: true,
      nameAr: true,
      nameEn: true,
      icon: true,
      _count: { select: { products: { where: { isPublished: true } } } },
    },
    orderBy: { sortOrder: 'asc' },
  });
}

/** Localised accessor kept next to the data it reads, so callers stay tidy. */
export function localised<T extends Record<string, unknown>>(
  row: T,
  field: string,
  locale: Locale,
): string {
  const key = `${field}${locale === 'ar' ? 'Ar' : 'En'}`;
  const value = row[key];
  return typeof value === 'string' ? value : '';
}
