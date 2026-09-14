import 'server-only';

import { AttributeDataType } from '@prisma/client';
import { db, type DbTransaction } from '@/server/db/client';
import { uniqueConstraintName } from '@/server/db/diagnose';
import { requireStaff } from '@/server/auth/guards';
import {
  collidingField,
  descendantIds,
  normaliseOptions,
  normaliseSortOrder,
} from '@/lib/domain/taxonomy';
import type {
  AttributeFormInput,
  BrandFormInput,
  CategoryFormInput,
  ProductTypeFormInput,
} from '@/schemas/taxonomy';

/**
 * Writing the shape of the catalogue.
 *
 * CLAUDE.md §6 says a new product type is "one `ProductType` row and some
 * attribute rows — no code". That was true and useless: it needed a database
 * client. This service is what makes it reachable from the dashboard, and it
 * is deliberately the same shape as `admin-products.ts` — one transaction per
 * save, guards on every export, unique violations translated into the field
 * that caused them.
 *
 * The rule that governs every delete here: **a row that something points at is
 * never removed, it is deactivated.** Brands, categories and product types are
 * referenced by products, and products are referenced by orders. `SetNull` on
 * a live catalogue is a silent data loss that only shows up on a customer's
 * screen, and `Cascade` on an attribute definition would take every stored
 * specification with it.
 */

export type TaxonomyErrorCode =
  | 'notFound'
  | 'slugTaken'
  | 'keyTaken'
  | 'optionValueInvalid'
  | 'optionValueDuplicate'
  | 'categoryOwnParent'
  | 'categoryHasChildren'
  | 'inUseByProducts'
  | 'attributeInUse'
  | 'attributeTypeLocked'
  | 'unknownAttribute';

export class TaxonomyError extends Error {
  constructor(
    message: string,
    /** Key under the `admin` namespace in messages/, so the UI can translate it. */
    readonly code: TaxonomyErrorCode,
    /** Names the offending row where one applies — an option value, a count. */
    readonly field?: string,
  ) {
    super(message);
    this.name = 'TaxonomyError';
  }
}

export interface SaveTaxonomyResult {
  id: string;
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export async function saveBrand(
  input: BrandFormInput,
  id?: string,
): Promise<SaveTaxonomyResult> {
  await requireStaff();

  const data = {
    slug: input.slug,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    descriptionAr: input.descriptionAr,
    descriptionEn: input.descriptionEn,
    logoUrl: input.logoUrl,
    accentColor: input.accentColor,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };

  try {
    if (!id) {
      const created = await db.brand.create({ data, select: { id: true } });
      return { id: created.id };
    }

    const existing = await db.brand.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new TaxonomyError('brand not found', 'notFound');

    await db.brand.update({ where: { id }, data });
    return { id };
  } catch (error) {
    throw translateWriteError(error);
  }
}

export async function deleteBrand(id: string): Promise<void> {
  await requireStaff();

  const brand = await db.brand.findUnique({
    where: { id },
    select: { _count: { select: { products: true } } },
  });
  if (!brand) throw new TaxonomyError('brand not found', 'notFound');

  /*
    `Brand.products` is a required relation, so Postgres would refuse this
    anyway — but it would refuse it as a foreign-key error the owner cannot
    read. Counting first turns it into a sentence naming how many products
    stand in the way, and points at deactivating instead.
  */
  if (brand._count.products > 0) {
    throw new TaxonomyError(
      'brand still has products',
      'inUseByProducts',
      String(brand._count.products),
    );
  }

  await db.brand.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function saveCategory(
  input: CategoryFormInput,
  id?: string,
): Promise<SaveTaxonomyResult> {
  await requireStaff();

  if (id && input.parentId) {
    /*
      A category cannot be its own ancestor. Left alone this is not a crash
      but something worse: the loop detaches from every root, so the whole
      branch disappears from the tree and from the storefront's navigation,
      with the products still attached to it and no screen showing them.
    */
    const all = await db.category.findMany({ select: { id: true, parentId: true } });
    if (descendantIds(all, id).has(input.parentId)) {
      throw new TaxonomyError(
        'category cannot descend from itself',
        'categoryOwnParent',
      );
    }
  }

  const data = {
    slug: input.slug,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    descriptionAr: input.descriptionAr,
    descriptionEn: input.descriptionEn,
    imageUrl: input.imageUrl,
    parentId: input.parentId,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };

  try {
    if (!id) {
      const created = await db.category.create({ data, select: { id: true } });
      return { id: created.id };
    }

    const existing = await db.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new TaxonomyError('category not found', 'notFound');

    await db.category.update({ where: { id }, data });
    return { id };
  } catch (error) {
    throw translateWriteError(error);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  await requireStaff();

  const category = await db.category.findUnique({
    where: { id },
    select: { _count: { select: { products: true, children: true } } },
  });
  if (!category) throw new TaxonomyError('category not found', 'notFound');

  if (category._count.products > 0) {
    throw new TaxonomyError(
      'category still has products',
      'inUseByProducts',
      String(category._count.products),
    );
  }

  /*
    `CategoryTree` is `onDelete: SetNull`, so deleting a parent would silently
    promote its children to the top level. That reads as data loss to the
    owner — the grouping is gone and nothing said so.
  */
  if (category._count.children > 0) {
    throw new TaxonomyError(
      'category still has children',
      'categoryHasChildren',
      String(category._count.children),
    );
  }

  await db.category.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Product types
// ---------------------------------------------------------------------------

export async function saveProductType(
  input: ProductTypeFormInput,
  id?: string,
): Promise<SaveTaxonomyResult> {
  await requireStaff();

  const links = input.attributes;
  if (links.length > 0) {
    const known = await db.attributeDefinition.findMany({
      where: { id: { in: links.map((link) => link.definitionId) } },
      select: { id: true },
    });
    const knownIds = new Set(known.map((row) => row.id));
    const missing = links.find((link) => !knownIds.has(link.definitionId));
    if (missing) {
      throw new TaxonomyError(
        'unknown attribute definition',
        'unknownAttribute',
        missing.definitionId,
      );
    }
  }

  // Ties in sortOrder come back in whatever order Postgres chooses, so the
  // specification fields would reorder themselves between visits.
  const order = normaliseSortOrder(links, (link) => link.sortOrder);

  const data = {
    key: input.key,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    icon: input.icon,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };

  try {
    return await db.$transaction(async (tx) => {
      const typeId = id
        ? (await tx.productType.update({ where: { id }, data, select: { id: true } }))
            .id
        : (await tx.productType.create({ data, select: { id: true } })).id;

      /*
        Links are replaced wholesale, unlike variants in `admin-products.ts`.
        They can be: a `ProductTypeAttribute` row carries no history — the
        stored specification lives on `ProductAttributeValue`, which points at
        the DEFINITION, not at the link. Unlinking an attribute hides the field
        and keeps the data, so re-linking it later brings the values back.
      */
      await tx.productTypeAttribute.deleteMany({ where: { productTypeId: typeId } });

      if (links.length > 0) {
        await tx.productTypeAttribute.createMany({
          data: links.map((link, index) => ({
            productTypeId: typeId,
            definitionId: link.definitionId,
            isRequired: link.isRequired,
            sortOrder: order[index] ?? index,
          })),
        });
      }

      return { id: typeId };
    });
  } catch (error) {
    throw translateWriteError(error);
  }
}

export async function deleteProductType(id: string): Promise<void> {
  await requireStaff();

  const type = await db.productType.findUnique({
    where: { id },
    select: { _count: { select: { products: true } } },
  });
  if (!type) throw new TaxonomyError('product type not found', 'notFound');

  if (type._count.products > 0) {
    throw new TaxonomyError(
      'product type still has products',
      'inUseByProducts',
      String(type._count.products),
    );
  }

  // The attribute links cascade, which is right: they describe this type only.
  await db.productType.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Attribute definitions
// ---------------------------------------------------------------------------

export async function saveAttribute(
  input: AttributeFormInput,
  id?: string,
): Promise<SaveTaxonomyResult> {
  await requireStaff();

  const normalised = normaliseOptions(input.options);
  if (!normalised.ok) {
    throw new TaxonomyError('invalid option', normalised.error, normalised.field);
  }
  const options = input.type === AttributeDataType.ENUM ? normalised.options : [];

  let existingValueCount = 0;
  if (id) {
    const existing = await db.attributeDefinition.findUnique({
      where: { id },
      select: { type: true, _count: { select: { values: true } } },
    });
    if (!existing) throw new TaxonomyError('attribute not found', 'notFound');
    existingValueCount = existing._count.values;

    /*
      `parseAttributeValue` routes a value into one of five typed columns from
      this `type` (§6). Changing it would leave every stored value in the wrong
      column — present in the database, invisible on the product page, and
      surviving every later edit unseen. Refused while any value exists; the
      answer is a new attribute.
    */
    if (existing.type !== input.type && existingValueCount > 0) {
      throw new TaxonomyError(
        'attribute type is locked once values exist',
        'attributeTypeLocked',
        String(existingValueCount),
      );
    }
  }

  const data = {
    key: input.key,
    labelAr: input.labelAr,
    labelEn: input.labelEn,
    type: input.type,
    unit: input.unit,
    groupId: input.groupId,
    isFilterable: input.isFilterable,
    isComparable: input.isComparable,
    sortOrder: input.sortOrder,
  };

  try {
    return await db.$transaction(async (tx) => {
      const definitionId = id
        ? (
            await tx.attributeDefinition.update({
              where: { id },
              data,
              select: { id: true },
            })
          ).id
        : (await tx.attributeDefinition.create({ data, select: { id: true } })).id;

      await syncOptions(tx, definitionId, options);
      return { id: definitionId };
    });
  } catch (error) {
    throw translateWriteError(error);
  }
}

/**
 * Match option rows by their value and update in place.
 *
 * Not `deleteMany` + `createMany`, which is what the links above do: an
 * `AttributeOption` IS pointed at, by `ProductAttributeValue.optionId`. Delete
 * and recreate and every product storing "AMOLED" loses its screen type, with
 * the spec row rendering blank and nothing saying why.
 *
 * An option the owner removed that is still in use is left alone rather than
 * deleted — `Cascade` would take the stored values with it.
 */
async function syncOptions(
  tx: DbTransaction,
  definitionId: string,
  options: readonly { value: string; labelAr: string; labelEn: string }[],
): Promise<void> {
  const existing = await tx.attributeOption.findMany({
    where: { definitionId },
    select: { id: true, value: true, _count: { select: { usedBy: true } } },
  });
  const byValue = new Map(existing.map((option) => [option.value, option]));

  for (const [index, option] of options.entries()) {
    const match = byValue.get(option.value);
    if (match) {
      await tx.attributeOption.update({
        where: { id: match.id },
        data: { labelAr: option.labelAr, labelEn: option.labelEn, sortOrder: index },
      });
    } else {
      await tx.attributeOption.create({
        data: { definitionId, sortOrder: index, ...option },
      });
    }
  }

  const keep = new Set(options.map((option) => option.value));
  const removable = existing
    .filter((option) => !keep.has(option.value) && option._count.usedBy === 0)
    .map((option) => option.id);

  if (removable.length > 0) {
    await tx.attributeOption.deleteMany({ where: { id: { in: removable } } });
  }
}

export async function deleteAttribute(id: string): Promise<void> {
  await requireStaff();

  const definition = await db.attributeDefinition.findUnique({
    where: { id },
    select: { _count: { select: { values: true, typeLinks: true } } },
  });
  if (!definition) throw new TaxonomyError('attribute not found', 'notFound');

  /*
    `ProductAttributeValue` cascades from the definition, so this delete would
    take every stored specification for it across the whole catalogue — the
    exact damage §12 refuses for products, applied to a field instead of a row.
  */
  if (definition._count.values > 0) {
    throw new TaxonomyError(
      'attribute is used by products',
      'attributeInUse',
      String(definition._count.values),
    );
  }

  if (definition._count.typeLinks > 0) {
    throw new TaxonomyError(
      'attribute is linked to product types',
      'attributeInUse',
      String(definition._count.typeLinks),
    );
  }

  await db.attributeDefinition.delete({ where: { id } });
}

// ---------------------------------------------------------------------------

/**
 * Turn a unique-constraint violation into the field that caused it.
 *
 * Which field is the whole message. The constraint's name is the only thing
 * that distinguishes a slug from a key, and reading it correctly under the pg
 * driver adapter is `server/db/diagnose.ts`'s job (§12) — `meta.target` is
 * undefined there, which is how this class of bug stays invisible until it
 * meets a real database.
 */
function translateWriteError(error: unknown): unknown {
  if (error instanceof TaxonomyError) return error;

  const constraint = uniqueConstraintName(error);
  if (!constraint) return error;

  switch (collidingField(constraint)) {
    case 'slug':
      return new TaxonomyError('slug already exists', 'slugTaken');
    case 'key':
      return new TaxonomyError('key already exists', 'keyTaken');
    default:
      return error;
  }
}
