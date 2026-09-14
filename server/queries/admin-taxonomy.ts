import 'server-only';

import type { AttributeDataType } from '@prisma/client';
import { db } from '@/server/db/client';
import { requireStaff } from '@/server/auth/guards';
import { flattenTree } from '@/lib/domain/taxonomy';

/**
 * Reads behind the screens that shape the catalogue.
 *
 * `requireStaff()` on every export (CLAUDE.md §7): a brand name is public, but
 * an inactive brand, a draft category and the count of products behind each
 * are not — and a query with no guard is one refactor away from being called
 * where one was needed.
 *
 * Each row carries `productCount`, because the only question the owner asks
 * before deleting something is "is anything using this?". Answering it in the
 * list means the delete control can explain itself instead of failing.
 */

export interface BrandRow {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  logoUrl: string | null;
  accentColor: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
}

export async function getAdminBrands(): Promise<BrandRow[]> {
  await requireStaff();

  const brands = await db.brand.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    select: {
      id: true,
      slug: true,
      nameAr: true,
      nameEn: true,
      logoUrl: true,
      accentColor: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { products: true } },
    },
  });

  return brands.map(({ _count, ...brand }) => ({
    ...brand,
    productCount: _count.products,
  }));
}

export interface BrandFormValues {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  isActive: boolean;
  sortOrder: number;
}

export async function getAdminBrand(id: string): Promise<BrandFormValues | null> {
  await requireStaff();

  return db.brand.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      descriptionEn: true,
      logoUrl: true,
      accentColor: true,
      isActive: true,
      sortOrder: true,
    },
  });
}

// ---------------------------------------------------------------------------

export interface CategoryRow {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  childCount: number;
  /** How deep in the tree, so the table can indent without recursing. */
  depth: number;
}

/**
 * Every category, depth-first, with its depth.
 *
 * The tree is flattened in `lib/domain/taxonomy.ts` rather than in SQL because
 * it is a recursive structure over a handful of rows and because a cycle —
 * which `parentId` coming from a form makes possible — has to terminate
 * somewhere that a unit test can reach.
 */
export async function getAdminCategories(): Promise<CategoryRow[]> {
  await requireStaff();

  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    select: {
      id: true,
      slug: true,
      nameAr: true,
      nameEn: true,
      parentId: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { products: true, children: true } },
    },
  });

  return flattenTree(categories).map(({ node, depth }) => {
    const { _count, ...category } = node;
    return {
      ...category,
      depth,
      productCount: _count.products,
      childCount: _count.children,
    };
  });
}

export interface CategoryFormValues {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  imageUrl: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
}

export async function getAdminCategory(id: string): Promise<CategoryFormValues | null> {
  await requireStaff();

  return db.category.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      descriptionEn: true,
      imageUrl: true,
      parentId: true,
      isActive: true,
      sortOrder: true,
    },
  });
}

// ---------------------------------------------------------------------------

export interface ProductTypeRow {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  attributeCount: number;
}

export async function getAdminProductTypes(): Promise<ProductTypeRow[]> {
  await requireStaff();

  const types = await db.productType.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    select: {
      id: true,
      key: true,
      nameAr: true,
      nameEn: true,
      icon: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { products: true, attributes: true } },
    },
  });

  return types.map(({ _count, ...type }) => ({
    ...type,
    productCount: _count.products,
    attributeCount: _count.attributes,
  }));
}

export interface ProductTypeFormValues {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
  attributes: { definitionId: string; isRequired: boolean; sortOrder: number }[];
}

export async function getAdminProductType(
  id: string,
): Promise<ProductTypeFormValues | null> {
  await requireStaff();

  const type = await db.productType.findUnique({
    where: { id },
    select: {
      id: true,
      key: true,
      nameAr: true,
      nameEn: true,
      icon: true,
      isActive: true,
      sortOrder: true,
      attributes: {
        orderBy: { sortOrder: 'asc' },
        select: { definitionId: true, isRequired: true, sortOrder: true },
      },
    },
  });

  return type;
}

// ---------------------------------------------------------------------------

export interface AttributeRow {
  id: string;
  key: string;
  labelAr: string;
  labelEn: string;
  type: AttributeDataType;
  unit: string | null;
  groupId: string | null;
  groupNameAr: string | null;
  groupNameEn: string | null;
  isFilterable: boolean;
  isComparable: boolean;
  sortOrder: number;
  optionCount: number;
  /** Product types linking it, and values already stored against it. */
  typeCount: number;
  valueCount: number;
}

export async function getAdminAttributes(): Promise<AttributeRow[]> {
  await requireStaff();

  const definitions = await db.attributeDefinition.findMany({
    orderBy: [{ sortOrder: 'asc' }, { labelEn: 'asc' }],
    select: {
      id: true,
      key: true,
      labelAr: true,
      labelEn: true,
      type: true,
      unit: true,
      groupId: true,
      isFilterable: true,
      isComparable: true,
      sortOrder: true,
      group: { select: { nameAr: true, nameEn: true } },
      _count: { select: { options: true, typeLinks: true, values: true } },
    },
  });

  return definitions.map(({ _count, group, ...definition }) => ({
    ...definition,
    groupNameAr: group?.nameAr ?? null,
    groupNameEn: group?.nameEn ?? null,
    optionCount: _count.options,
    typeCount: _count.typeLinks,
    valueCount: _count.values,
  }));
}

export interface AttributeFormValues {
  id: string;
  key: string;
  labelAr: string;
  labelEn: string;
  type: AttributeDataType;
  unit: string | null;
  groupId: string | null;
  isFilterable: boolean;
  isComparable: boolean;
  sortOrder: number;
  options: { value: string; labelAr: string; labelEn: string }[];
  /** Values already stored. Changing `type` with any is refused (§6). */
  valueCount: number;
}

export async function getAdminAttribute(
  id: string,
): Promise<AttributeFormValues | null> {
  await requireStaff();

  const definition = await db.attributeDefinition.findUnique({
    where: { id },
    select: {
      id: true,
      key: true,
      labelAr: true,
      labelEn: true,
      type: true,
      unit: true,
      groupId: true,
      isFilterable: true,
      isComparable: true,
      sortOrder: true,
      options: {
        orderBy: { sortOrder: 'asc' },
        select: { value: true, labelAr: true, labelEn: true },
      },
      _count: { select: { values: true } },
    },
  });

  if (!definition) return null;

  const { _count, ...values } = definition;
  return { ...values, valueCount: _count.values };
}

// ---------------------------------------------------------------------------

export interface TaxonomyReference {
  attributes: {
    id: string;
    key: string;
    labelAr: string;
    labelEn: string;
    type: AttributeDataType;
    unit: string | null;
  }[];
  groups: { id: string; nameAr: string; nameEn: string }[];
  categories: { id: string; nameAr: string; nameEn: string; parentId: string | null }[];
}

/** The choices the taxonomy forms offer: attributes to link, groups, parents. */
export async function getTaxonomyReference(): Promise<TaxonomyReference> {
  await requireStaff();

  const [attributes, groups, categories] = await Promise.all([
    db.attributeDefinition.findMany({
      orderBy: [{ sortOrder: 'asc' }, { labelEn: 'asc' }],
      select: {
        id: true,
        key: true,
        labelAr: true,
        labelEn: true,
        type: true,
        unit: true,
      },
    }),
    db.attributeGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, nameAr: true, nameEn: true },
    }),
    db.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      select: { id: true, nameAr: true, nameEn: true, parentId: true },
    }),
  ]);

  return { attributes, groups, categories };
}
