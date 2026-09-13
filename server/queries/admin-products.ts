import 'server-only';

import type { AttributeDataType, Prisma, StockStatus } from '@prisma/client';
import { db } from '@/server/db/client';
import { requireStaff } from '@/server/auth/guards';
import { expandSearchTerms } from '@/lib/search';
import { attributeValueToFormString } from '@/lib/domain/product';
import type { AdminProductFilter } from '@/schemas/product';

/**
 * Reads behind the catalogue screens of the dashboard.
 *
 * `requireStaff()` on every export, not because a product name is a secret,
 * but because an unpublished draft, a cost-side SKU and a not-yet-announced
 * price are — and because a query with no guard is one refactor away from
 * being called somewhere that needed one (CLAUDE.md §7).
 */

export const PRODUCTS_PER_PAGE = 20;

export interface AdminProductRow {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  brandName: string;
  typeNameAr: string;
  typeNameEn: string;
  isPublished: boolean;
  minPriceIqd: number | null;
  variantCount: number;
  imageUrl: string | null;
  updatedAt: Date;
}

export interface AdminProductListResult {
  rows: AdminProductRow[];
  total: number;
  page: number;
  pageCount: number;
  counts: { all: number; published: number; draft: number };
}

/**
 * The catalogue list.
 *
 * Filtering and paging happen in SQL (CLAUDE.md §5) — fetching every product
 * and slicing in JavaScript works fine on the 32 demo rows and falls over on
 * the day the store has three thousand.
 */
export async function getAdminProducts(
  filter: AdminProductFilter,
): Promise<AdminProductListResult> {
  await requireStaff();

  const where: Prisma.ProductWhereInput = {};

  if (filter.status === 'published') where.isPublished = true;
  if (filter.status === 'draft') where.isPublished = false;
  if (filter.type) where.productType = { key: filter.type };

  if (filter.q) {
    // The same Arabic folding the storefront search uses, so staff searching
    // "سامسونج" find what a customer searching it would.
    const terms = expandSearchTerms(filter.q);
    if (terms.length > 0) {
      where.OR = terms.flatMap((value) => [
        { nameAr: { contains: value, mode: 'insensitive' as const } },
        { nameEn: { contains: value, mode: 'insensitive' as const } },
        { slugEn: { contains: value, mode: 'insensitive' as const } },
        { brand: { nameEn: { contains: value, mode: 'insensitive' as const } } },
        {
          variants: {
            some: { sku: { contains: value, mode: 'insensitive' as const } },
          },
        },
      ]);
    }
  }

  const page = filter.page;

  const [total, published, all, products] = await Promise.all([
    db.product.count({ where }),
    db.product.count({ where: { isPublished: true } }),
    db.product.count(),
    db.product.findMany({
      where,
      select: {
        id: true,
        slugEn: true,
        nameAr: true,
        nameEn: true,
        isPublished: true,
        minPriceIqd: true,
        updatedAt: true,
        brand: { select: { nameEn: true } },
        productType: { select: { nameAr: true, nameEn: true } },
        images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
        _count: { select: { variants: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * PRODUCTS_PER_PAGE,
      take: PRODUCTS_PER_PAGE,
    }),
  ]);

  return {
    rows: products.map((product) => ({
      id: product.id,
      slug: product.slugEn,
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      brandName: product.brand.nameEn,
      typeNameAr: product.productType.nameAr,
      typeNameEn: product.productType.nameEn,
      isPublished: product.isPublished,
      minPriceIqd: product.minPriceIqd,
      variantCount: product._count.variants,
      imageUrl: product.images[0]?.url ?? null,
      updatedAt: product.updatedAt,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE)),
    counts: { all, published, draft: all - published },
  };
}

// ---------------------------------------------------------------------------
// The form's reference data
// ---------------------------------------------------------------------------

export interface AttributeFieldDefinition {
  key: string;
  labelAr: string;
  labelEn: string;
  type: AttributeDataType;
  unit: string | null;
  isRequired: boolean;
  /** Present for ENUM attributes; empty for every other type. */
  options: { value: string; labelAr: string; labelEn: string }[];
}

export interface ProductTypeChoice {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  /** The specification fields this type's form renders. */
  attributes: AttributeFieldDefinition[];
}

export interface ProductFormReference {
  productTypes: ProductTypeChoice[];
  brands: { id: string; nameAr: string; nameEn: string }[];
  categories: { id: string; nameAr: string; nameEn: string }[];
}

/**
 * Everything the product form needs to draw itself.
 *
 * The specification fields come from `ProductTypeAttribute`, which is the
 * entire point of the schema in CLAUDE.md §6: adding "laptops" is a
 * `ProductType` row plus attribute rows, and this form grows the new fields
 * without a line of code changing.
 */
export async function getProductFormReference(): Promise<ProductFormReference> {
  await requireStaff();

  const [productTypes, brands, categories] = await Promise.all([
    db.productType.findMany({
      where: { isActive: true },
      select: {
        id: true,
        key: true,
        nameAr: true,
        nameEn: true,
        attributes: {
          select: {
            isRequired: true,
            definition: {
              select: {
                key: true,
                labelAr: true,
                labelEn: true,
                type: true,
                unit: true,
                options: {
                  select: { value: true, labelAr: true, labelEn: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    db.brand.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true, nameEn: true },
      orderBy: { sortOrder: 'asc' },
    }),
    db.category.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true, nameEn: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  return {
    productTypes: productTypes.map((type) => ({
      id: type.id,
      key: type.key,
      nameAr: type.nameAr,
      nameEn: type.nameEn,
      attributes: type.attributes.map((link) => ({
        key: link.definition.key,
        labelAr: link.definition.labelAr,
        labelEn: link.definition.labelEn,
        type: link.definition.type,
        unit: link.definition.unit,
        isRequired: link.isRequired,
        options: link.definition.options,
      })),
    })),
    brands,
    categories,
  };
}

// ---------------------------------------------------------------------------
// One product, shaped for the form
// ---------------------------------------------------------------------------

export interface ProductFormValues {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  taglineAr: string;
  taglineEn: string;
  productTypeId: string;
  brandId: string;
  categoryId: string;
  isPublished: boolean;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  warrantyMonths: number;
  warrantyNoteAr: string;
  warrantyNoteEn: string;
  overviewAr: string;
  overviewEn: string;
  keyFeaturesAr: string[];
  keyFeaturesEn: string[];
  prosAr: string[];
  prosEn: string[];
  consAr: string[];
  consEn: string[];
  whoIsItForAr: string;
  whoIsItForEn: string;
  thingsToKnowAr: string;
  thingsToKnowEn: string;
  metaTitleAr: string;
  metaTitleEn: string;
  metaDescriptionAr: string;
  metaDescriptionEn: string;
  attributes: Record<string, string>;
  options: {
    nameAr: string;
    nameEn: string;
    isColor: boolean;
    values: { valueAr: string; valueEn: string; hex: string }[];
  }[];
  variants: {
    id: string;
    sku: string;
    priceIqd: number;
    comparePriceIqd: string;
    optionValues: string[];
    labelAr: string;
    labelEn: string;
    imageUrl: string;
    status: StockStatus;
    isActive: boolean;
  }[];
  images: { url: string; altAr: string; altEn: string }[];
  videos: { url: string; titleAr: string; titleEn: string }[];
  /** Order lines already reference these variants, so deleting is destructive. */
  soldVariantIds: string[];
}

/**
 * Load a product in exactly the shape the form posts back.
 *
 * Nulls become empty strings here rather than in the component: a controlled
 * React input handed `null` switches to uncontrolled and warns, and the
 * warning appears on a field nobody touched.
 */
export async function getProductForEdit(id: string): Promise<ProductFormValues | null> {
  await requireStaff();

  const product = await db.product.findUnique({
    where: { id },
    select: {
      id: true,
      slugEn: true,
      nameAr: true,
      nameEn: true,
      taglineAr: true,
      taglineEn: true,
      productTypeId: true,
      brandId: true,
      categoryId: true,
      isPublished: true,
      isFeatured: true,
      isNewArrival: true,
      isBestSeller: true,
      warrantyMonths: true,
      warrantyNoteAr: true,
      warrantyNoteEn: true,
      overviewAr: true,
      overviewEn: true,
      keyFeaturesAr: true,
      keyFeaturesEn: true,
      prosAr: true,
      prosEn: true,
      consAr: true,
      consEn: true,
      whoIsItForAr: true,
      whoIsItForEn: true,
      thingsToKnowAr: true,
      thingsToKnowEn: true,
      metaTitleAr: true,
      metaTitleEn: true,
      metaDescriptionAr: true,
      metaDescriptionEn: true,
      attributeValues: {
        select: {
          valueInt: true,
          valueDecimal: true,
          valueText: true,
          valueBool: true,
          definition: { select: { key: true, type: true } },
          option: { select: { value: true } },
        },
      },
      options: {
        select: {
          nameAr: true,
          nameEn: true,
          isColor: true,
          values: {
            select: { valueAr: true, valueEn: true, hex: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      variants: {
        select: {
          id: true,
          sku: true,
          priceIqd: true,
          comparePriceIqd: true,
          labelAr: true,
          labelEn: true,
          imageUrl: true,
          isActive: true,
          inventory: { select: { status: true } },
          optionValues: { select: { optionValue: { select: { valueEn: true } } } },
          _count: { select: { orderItems: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      images: {
        select: { url: true, altAr: true, altEn: true },
        orderBy: { sortOrder: 'asc' },
      },
      videos: {
        select: { url: true, titleAr: true, titleEn: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!product) return null;

  const optionOrder = product.options.map((option) =>
    option.values.map((value) => value.valueEn),
  );

  const attributes: Record<string, string> = {};
  for (const value of product.attributeValues) {
    attributes[value.definition.key] = attributeValueToFormString(
      value.definition.type,
      {
        valueInt: value.valueInt,
        // Prisma hands Decimal back as its own object; the form wants a string.
        valueDecimal: value.valueDecimal === null ? null : Number(value.valueDecimal),
        valueText: value.valueText,
        valueBool: value.valueBool,
        optionValue: value.option?.value ?? null,
      },
    );
  }

  return {
    id: product.id,
    slug: product.slugEn,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    taglineAr: product.taglineAr ?? '',
    taglineEn: product.taglineEn ?? '',
    productTypeId: product.productTypeId,
    brandId: product.brandId,
    categoryId: product.categoryId,
    isPublished: product.isPublished,
    isFeatured: product.isFeatured,
    isNewArrival: product.isNewArrival,
    isBestSeller: product.isBestSeller,
    warrantyMonths: product.warrantyMonths,
    warrantyNoteAr: product.warrantyNoteAr ?? '',
    warrantyNoteEn: product.warrantyNoteEn ?? '',
    overviewAr: product.overviewAr ?? '',
    overviewEn: product.overviewEn ?? '',
    keyFeaturesAr: product.keyFeaturesAr,
    keyFeaturesEn: product.keyFeaturesEn,
    prosAr: product.prosAr,
    prosEn: product.prosEn,
    consAr: product.consAr,
    consEn: product.consEn,
    whoIsItForAr: product.whoIsItForAr ?? '',
    whoIsItForEn: product.whoIsItForEn ?? '',
    thingsToKnowAr: product.thingsToKnowAr ?? '',
    thingsToKnowEn: product.thingsToKnowEn ?? '',
    metaTitleAr: product.metaTitleAr ?? '',
    metaTitleEn: product.metaTitleEn ?? '',
    metaDescriptionAr: product.metaDescriptionAr ?? '',
    metaDescriptionEn: product.metaDescriptionEn ?? '',
    attributes,
    options: product.options.map((option) => ({
      nameAr: option.nameAr,
      nameEn: option.nameEn,
      isColor: option.isColor,
      values: option.values.map((value) => ({
        valueAr: value.valueAr,
        valueEn: value.valueEn,
        hex: value.hex ?? '',
      })),
    })),
    variants: product.variants.map((variant) => {
      const chosen = variant.optionValues.map((link) => link.optionValue.valueEn);
      return {
        id: variant.id,
        sku: variant.sku,
        priceIqd: variant.priceIqd,
        comparePriceIqd: variant.comparePriceIqd?.toString() ?? '',
        // Re-ordered to match the option columns the form renders, so a
        // variant's colour never lands in the storage select.
        optionValues: optionOrder.map(
          (values) => chosen.find((value) => values.includes(value)) ?? '',
        ),
        labelAr: variant.labelAr,
        labelEn: variant.labelEn,
        imageUrl: variant.imageUrl ?? '',
        status: variant.inventory?.status ?? 'IN_STOCK',
        isActive: variant.isActive,
      };
    }),
    images: product.images.map((image) => ({
      url: image.url,
      altAr: image.altAr ?? '',
      altEn: image.altEn ?? '',
    })),
    videos: product.videos.map((video) => ({
      url: video.url,
      titleAr: video.titleAr ?? '',
      titleEn: video.titleEn ?? '',
    })),
    soldVariantIds: product.variants
      .filter((variant) => variant._count.orderItems > 0)
      .map((variant) => variant.id),
  };
}
