import 'server-only';

import { VideoProvider } from '@prisma/client';
import { db, type DbTransaction } from '@/server/db/client';
import { uniqueConstraintName } from '@/server/db/diagnose';
import { requireAdmin, requireStaff } from '@/server/auth/guards';
import {
  buildVariantLabel,
  cheapestActivePrice,
  parseAttributeValue,
  publishBlockers,
} from '@/lib/domain/product';
import { extractYoutubeId } from '@/lib/video';
import type { ProductFormInput } from '@/schemas/product';

/**
 * Writing the catalogue.
 *
 * This is the service CLAUDE.md §6 was designed for: specifications are rows,
 * not columns, so saving a laptop and saving a phone run the *same* code and
 * differ only in which `AttributeDefinition` rows the type links to. Nothing
 * here knows what a phone is.
 *
 * Everything happens in one transaction. A product whose variants were written
 * but whose specifications were not is a product that renders with an empty
 * spec table and no way to tell that it failed.
 */

export type ProductAdminErrorCode =
  | 'notFound'
  | 'slugTaken'
  | 'skuTaken'
  | 'unknownType'
  | 'unknownAttribute'
  | 'invalidAttribute'
  | 'invalidVideoUrl'
  | 'productHasOrders'
  /** Publishing was refused; `field` carries the first blocker's key. */
  | 'notPublishable';

export class ProductAdminError extends Error {
  constructor(
    message: string,
    /** Key under the `admin` namespace in messages/, so the UI can translate it. */
    readonly code: ProductAdminErrorCode,
    /** Names the offending field where one applies, e.g. an attribute key. */
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ProductAdminError';
  }
}

export interface SaveProductResult {
  id: string;
  slug: string;
  /**
   * The slug this product was reachable at before this save, when it changed.
   *
   * The caller needs it to invalidate the OLD url: a rename otherwise leaves
   * the previous page cached and serving the product under its previous name,
   * which is the case nobody notices because the new URL looks right.
   */
  previousSlug: string | null;
  /**
   * Variants the owner removed from the form that had already been sold. They
   * are deactivated rather than deleted, so the UI can say so plainly.
   */
  deactivatedVariantCount: number;
}

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

/**
 * The product row itself.
 *
 * One latin slug goes into both `slugAr` and `slugEn` (CLAUDE.md §6) so the
 * Arabic and English URLs stay parallel for hreflang.
 */
function productScalars(input: ProductFormInput) {
  return {
    slugAr: input.slug,
    slugEn: input.slug,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    taglineAr: input.taglineAr,
    taglineEn: input.taglineEn,
    productTypeId: input.productTypeId,
    brandId: input.brandId,
    categoryId: input.categoryId,
    isPublished: input.isPublished,
    isFeatured: input.isFeatured,
    isNewArrival: input.isNewArrival,
    isBestSeller: input.isBestSeller,
    warrantyMonths: input.warrantyMonths,
    warrantyNoteAr: input.warrantyNoteAr,
    warrantyNoteEn: input.warrantyNoteEn,
    overviewAr: input.overviewAr,
    overviewEn: input.overviewEn,
    keyFeaturesAr: input.keyFeaturesAr,
    keyFeaturesEn: input.keyFeaturesEn,
    prosAr: input.prosAr,
    prosEn: input.prosEn,
    consAr: input.consAr,
    consEn: input.consEn,
    whoIsItForAr: input.whoIsItForAr,
    whoIsItForEn: input.whoIsItForEn,
    thingsToKnowAr: input.thingsToKnowAr,
    thingsToKnowEn: input.thingsToKnowEn,
    metaTitleAr: input.metaTitleAr,
    metaTitleEn: input.metaTitleEn,
    metaDescriptionAr: input.metaDescriptionAr,
    metaDescriptionEn: input.metaDescriptionEn,
  };
}

// ---------------------------------------------------------------------------
// Specifications
// ---------------------------------------------------------------------------

/**
 * Write the product's specifications.
 *
 * The type decides which attributes exist; a key the type does not declare is
 * rejected rather than stored, because a stray row would never render (the
 * product page reads through `ProductTypeAttribute`) and would silently
 * survive every future edit.
 */
async function writeAttributes(
  tx: DbTransaction,
  productId: string,
  productTypeId: string,
  raw: Record<string, string>,
): Promise<void> {
  const links = await tx.productTypeAttribute.findMany({
    where: { productTypeId },
    select: {
      isRequired: true,
      definition: {
        select: {
          id: true,
          key: true,
          type: true,
          options: { select: { id: true, value: true } },
        },
      },
    },
  });

  const declared = new Map(links.map((link) => [link.definition.key, link]));

  for (const key of Object.keys(raw)) {
    if (!declared.has(key)) {
      throw new ProductAdminError(
        `attribute "${key}" is not on this type`,
        'unknownAttribute',
        key,
      );
    }
  }

  // Replaced wholesale: an attribute the owner cleared has to lose its row, or
  // the product page keeps showing last week's value.
  await tx.productAttributeValue.deleteMany({ where: { productId } });

  for (const [key, link] of declared) {
    const parsed = parseAttributeValue({
      type: link.definition.type,
      raw: raw[key] ?? '',
      isRequired: link.isRequired,
      allowedOptions: link.definition.options.map((option) => option.value),
    });

    if (!parsed.ok) {
      throw new ProductAdminError(
        `attribute "${key}": ${parsed.errorKey}`,
        'invalidAttribute',
        key,
      );
    }
    if (!parsed.columns) continue;

    const optionId = parsed.columns.optionValue
      ? (link.definition.options.find(
          (option) => option.value === parsed.columns?.optionValue,
        )?.id ?? null)
      : null;

    await tx.productAttributeValue.create({
      data: {
        productId,
        definitionId: link.definition.id,
        valueInt: parsed.columns.valueInt,
        valueDecimal: parsed.columns.valueDecimal,
        valueText: parsed.columns.valueText,
        valueBool: parsed.columns.valueBool,
        optionId,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Rewrite the option columns and return, PER OPTION, a lookup from `valueEn` to
 * its row id.
 *
 * Per option, because a single flat map keyed on `valueEn` was wrong and the
 * schema is what says so: two options may legitimately hold the same value —
 * "Standard" as a warranty AND as an edition, "Black" as a colour AND as a
 * strap. Flattened, the second overwrote the first, and every variant that
 * referenced the first was linked to the second option's row. The product then
 * rendered a picker whose combinations did not exist, and the variant a
 * customer chose was not the one they saw.
 *
 * The form guarantees `variant.optionValues[i]` belongs to `options[i]`
 * (schemas/product.ts refuses anything else), so the index IS the option's
 * identity here. Forbidding duplicate names instead would be solving a bug by
 * banning something the schema allows on purpose.
 *
 * Deleting and recreating is safe here and nowhere else in this file: options
 * carry no history, and the `VariantOptionValue` links they cascade away are
 * rebuilt from the form moments later. Variants are *not* treated this way —
 * see `reconcileVariants`.
 */
async function writeOptions(
  tx: DbTransaction,
  productId: string,
  options: ProductFormInput['options'],
): Promise<Map<string, string>[]> {
  await tx.productOption.deleteMany({ where: { productId } });

  const valueIdsByOption: Map<string, string>[] = [];

  for (const [index, option] of options.entries()) {
    const valueIdByName = new Map<string, string>();
    valueIdsByOption.push(valueIdByName);

    const created = await tx.productOption.create({
      data: {
        productId,
        nameAr: option.nameAr,
        nameEn: option.nameEn,
        isColor: option.isColor,
        sortOrder: index,
      },
      select: { id: true },
    });

    for (const [valueIndex, value] of option.values.entries()) {
      const optionValue = await tx.productOptionValue.create({
        data: {
          optionId: created.id,
          valueAr: value.valueAr,
          valueEn: value.valueEn,
          hex: value.hex,
          sortOrder: valueIndex,
        },
        select: { id: true },
      });
      valueIdByName.set(value.valueEn, optionValue.id);
    }
  }

  return valueIdsByOption;
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/**
 * Bring the variant rows in line with the form without destroying history.
 *
 * A variant is referenced by `CartItem` (cascade) and `OrderItem` (set null),
 * so recreating them on every save would empty live carts and cut last month's
 * invoices loose from the row they were sold from. Instead:
 *
 *  - matched by id, then by SKU, and updated in place;
 *  - new rows created;
 *  - a removed variant that was never ordered is deleted;
 *  - a removed variant that **was** ordered is deactivated instead, and the
 *    count is reported so the owner is told rather than left guessing.
 */
async function reconcileVariants(
  tx: DbTransaction,
  productId: string,
  input: ProductFormInput,
  /** One map per option, in the same order the form declared them. */
  optionValueIds: Map<string, string>[],
): Promise<{ deactivated: number }> {
  const existing = await tx.productVariant.findMany({
    where: { productId },
    select: { id: true, sku: true, _count: { select: { orderItems: true } } },
  });

  const byId = new Map(existing.map((variant) => [variant.id, variant]));
  const bySku = new Map(existing.map((variant) => [variant.sku, variant]));
  const keptIds = new Set<string>();

  for (const [index, variant] of input.variants.entries()) {
    const match =
      (variant.id ? byId.get(variant.id) : undefined) ?? bySku.get(variant.sku);

    // With options, the label is derived so it can never drift from the
    // selection; without them it is whatever the owner typed. Either way it is
    // non-empty, which the database CHECK also insists on.
    const derivedAr = buildVariantLabel(
      variant.optionValues.map((value) => arabicValueFor(input, value)),
    );
    const derivedEn = buildVariantLabel(variant.optionValues);
    const labelAr = derivedAr || variant.labelAr || variant.sku;
    const labelEn = derivedEn || variant.labelEn || variant.sku;

    const data = {
      sku: variant.sku,
      labelAr,
      labelEn,
      priceIqd: variant.priceIqd,
      comparePriceIqd: variant.comparePriceIqd,
      imageUrl: variant.imageUrl,
      isActive: variant.isActive,
      sortOrder: index,
    };

    const id = match
      ? (
          await tx.productVariant.update({
            where: { id: match.id },
            data,
            select: { id: true },
          })
        ).id
      : (
          await tx.productVariant.create({
            data: { productId, ...data },
            select: { id: true },
          })
        ).id;

    keptIds.add(id);

    // Availability is a status, never a count (CLAUDE.md §13.2). onHand and
    // trackQuantity are left exactly as they are: switching a variant onto
    // counted stock is a separate, deliberate act, not a side effect of
    // editing its price.
    await tx.inventory.upsert({
      where: { variantId: id },
      create: { variantId: id, status: variant.status, trackQuantity: false },
      update: { status: variant.status },
    });

    await tx.variantOptionValue.deleteMany({ where: { variantId: id } });
    // Looked up in the map for the option at THIS position, so "Standard" under
    // warranty and "Standard" under edition resolve to two different rows.
    for (const [optionIndex, value] of variant.optionValues.entries()) {
      const optionValueId = optionValueIds[optionIndex]?.get(value);
      if (!optionValueId) continue;
      await tx.variantOptionValue.create({ data: { variantId: id, optionValueId } });
    }
  }

  const removed = existing.filter((variant) => !keptIds.has(variant.id));
  const sold = removed.filter((variant) => variant._count.orderItems > 0);
  const unsold = removed.filter((variant) => variant._count.orderItems === 0);

  if (unsold.length > 0) {
    await tx.productVariant.deleteMany({
      where: { id: { in: unsold.map((variant) => variant.id) } },
    });
  }
  if (sold.length > 0) {
    await tx.productVariant.updateMany({
      where: { id: { in: sold.map((variant) => variant.id) } },
      data: { isActive: false },
    });
  }

  return { deactivated: sold.length };
}

/** The Arabic twin of a chosen `valueEn`, for the Arabic variant label. */
function arabicValueFor(input: ProductFormInput, valueEn: string): string {
  for (const option of input.options) {
    const match = option.values.find((value) => value.valueEn === valueEn);
    if (match) return match.valueAr;
  }
  return valueEn;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

async function writeMedia(
  tx: DbTransaction,
  productId: string,
  input: ProductFormInput,
): Promise<void> {
  await tx.productImage.deleteMany({ where: { productId } });
  if (input.images.length > 0) {
    await tx.productImage.createMany({
      data: input.images.map((image, index) => ({
        productId,
        url: image.url,
        altAr: image.altAr,
        altEn: image.altEn,
        sortOrder: index,
        // Anything the owner adds is real photography by definition; only the
        // generated silhouettes from the seed carry the demo badge (§13.12).
        isDemo: false,
      })),
    });
  }

  await tx.productVideo.deleteMany({ where: { productId } });
  for (const [index, video] of input.videos.entries()) {
    // The id is extracted at save time from whatever the owner pasted — a
    // watch URL, a share link, an embed — so the player never has to guess.
    const videoId = extractYoutubeId(video.url);
    if (!videoId) {
      throw new ProductAdminError(
        `unparseable video url`,
        'invalidVideoUrl',
        video.url,
      );
    }
    await tx.productVideo.create({
      data: {
        productId,
        provider: VideoProvider.YOUTUBE,
        videoId,
        url: video.url,
        titleAr: video.titleAr,
        titleEn: video.titleEn,
        sortOrder: index,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// The shared write path
// ---------------------------------------------------------------------------

async function saveProduct(
  input: ProductFormInput,
  existingId: string | null,
): Promise<SaveProductResult> {
  return db
    .$transaction(async (tx) => {
      const type = await tx.productType.findUnique({
        where: { id: input.productTypeId },
        select: { id: true },
      });
      if (!type) throw new ProductAdminError('no such product type', 'unknownType');

      let productId = existingId;
      let previousSlug: string | null = null;

      if (productId) {
        const found = await tx.product.findUnique({
          where: { id: productId },
          select: { isPublished: true, slugEn: true },
        });
        if (!found) throw new ProductAdminError('no such product', 'notFound');
        previousSlug = found.slugEn;

        await tx.product.update({
          where: { id: productId },
          data: {
            ...productScalars(input),
            // Stamped the first time it goes live and never rewritten, so
            // "new arrival" ordering does not reshuffle on every edit.
            ...(input.isPublished && !found.isPublished
              ? { publishedAt: new Date() }
              : {}),
          },
        });
      } else {
        const created = await tx.product.create({
          data: {
            ...productScalars(input),
            publishedAt: input.isPublished ? new Date() : null,
          },
          select: { id: true },
        });
        productId = created.id;
      }

      await writeAttributes(tx, productId, input.productTypeId, input.attributes);
      const optionValueIds = await writeOptions(tx, productId, input.options);
      const { deactivated } = await reconcileVariants(
        tx,
        productId,
        input,
        optionValueIds,
      );
      await writeMedia(tx, productId, input);

      // Denormalised for catalogue sorting and price filtering, so it has to be
      // recomputed from what was actually written — not from what the form
      // claimed, and not from the rows as they were before this save.
      const variants = await tx.productVariant.findMany({
        where: { productId },
        select: { priceIqd: true, isActive: true },
      });
      await tx.product.update({
        where: { id: productId },
        data: { minPriceIqd: cheapestActivePrice(variants) },
      });

      return {
        id: productId,
        slug: input.slug,
        previousSlug,
        deactivatedVariantCount: deactivated,
      };
    })
    .catch((error: unknown) => {
      throw translateWriteError(error);
    });
}

/**
 * Turn a unique-constraint violation into the field that caused it.
 *
 * Which field is the whole message: sending the owner to edit a slug that was
 * never the problem costs more than saying nothing. The constraint's name is
 * the only thing that distinguishes them, and reading it correctly under the
 * pg driver adapter is `server/db/diagnose.ts`'s job, not this file's.
 */
function translateWriteError(error: unknown): unknown {
  const constraint = uniqueConstraintName(error);
  if (!constraint) return error;

  if (constraint.includes('sku')) {
    return new ProductAdminError('sku already exists', 'skuTaken');
  }
  if (constraint.includes('slug')) {
    return new ProductAdminError('slug already exists', 'slugTaken');
  }
  return error;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createProduct(
  input: ProductFormInput,
): Promise<SaveProductResult> {
  await requireStaff();
  return saveProduct(input, null);
}

export async function updateProduct(
  id: string,
  input: ProductFormInput,
): Promise<SaveProductResult> {
  await requireStaff();
  return saveProduct(input, id);
}

/**
 * Publish or unpublish without opening the form.
 *
 * The list page's fastest action, and the safe half of "delete": taking a
 * product off sale is reversible, and is what the owner usually means.
 */
export async function setProductPublished(
  id: string,
  isPublished: boolean,
): Promise<void> {
  await requireStaff();

  const product = await db.product.findUnique({
    where: { id },
    select: {
      publishedAt: true,
      nameAr: true,
      nameEn: true,
      slugEn: true,
      productTypeId: true,
      variants: { select: { isActive: true } },
    },
  });
  if (!product) throw new ProductAdminError('no such product', 'notFound');

  /*
    Publishing asks more of a product than saving a draft does, and this path
    asked nothing: it flipped the boolean. A product with no active variant has
    nothing to add to a cart and no price to print, so the catalogue rendered a
    card whose button did nothing.

    Unpublishing is never blocked — taking something off the shop floor has to
    work whatever state it is in.
  */
  if (isPublished) {
    const blockers = publishBlockers({
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      slug: product.slugEn,
      productTypeId: product.productTypeId,
      variants: product.variants,
    });
    if (blockers.length > 0) {
      throw new ProductAdminError(
        `cannot publish: ${blockers.join(', ')}`,
        'notPublishable',
        blockers[0],
      );
    }
  }

  await db.product.update({
    where: { id },
    data: {
      isPublished,
      ...(isPublished && !product.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });
}

/**
 * Delete a product outright.
 *
 * ADMIN only, and refused once anything has been sold: `OrderItem.variantId`
 * is `SetNull`, so deleting would quietly cut every past invoice loose from
 * the row it was sold from. The order keeps its snapshotted name and price and
 * still renders — which is exactly what makes the damage invisible. Unpublish
 * is the reversible answer, and the error says so.
 */
export async function deleteProduct(id: string): Promise<void> {
  await requireAdmin();

  const product = await db.product.findUnique({
    where: { id },
    select: {
      id: true,
      variants: { select: { _count: { select: { orderItems: true } } } },
    },
  });
  if (!product) throw new ProductAdminError('no such product', 'notFound');

  const sold = product.variants.some((variant) => variant._count.orderItems > 0);
  if (sold) {
    throw new ProductAdminError('product appears in orders', 'productHasOrders');
  }

  // Images, videos, options, variants and inventory all cascade from here.
  await db.product.delete({ where: { id } });
}
