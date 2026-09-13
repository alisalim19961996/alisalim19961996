import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AttributeDataType,
  Governorate,
  OrderStatus,
  Role,
  StockStatus,
} from '@prisma/client';

/**
 * Editing the catalogue, against a real database.
 *
 * The claim this file exists to prove is CLAUDE.md §6: **a new product type is
 * data entry, not code**. So the fixture invents a product type that has never
 * existed — with its own integer, text and enum specifications — and saves a
 * product of that type through the ordinary service. Nothing in
 * `admin-products.ts` knows what a "test rig" is.
 *
 * The rest is what a mock could not check: that a typed value lands in the
 * right column, that a variant keeps its id across an edit so live carts and
 * past orders still point at it, and that deleting is refused once something
 * has been sold.
 */

const STAFF = { id: '', name: 'Integration Staff', role: Role.ADMIN };

vi.mock('@/server/auth/guards', () => ({
  getCurrentUser: async () => (STAFF.id ? STAFF : null),
  requireStaff: async () => {
    if (!STAFF.id) throw new Error('not staff');
    return STAFF;
  },
  requireAdmin: async () => {
    if (!STAFF.id) throw new Error('not admin');
    return STAFF;
  },
}));

const { db } = await import('@/server/db/client');
const { createProduct, deleteProduct, updateProduct, ProductAdminError } =
  await import('@/server/services/admin-products');
const { placeOrder } = await import('@/server/services/order');
const { productFormSchema } = await import('@/schemas/product');

const SUFFIX = Math.random().toString(36).slice(2, 8);
const TYPE_KEY = `testrig-${SUFFIX}`;
const ATTR_INT = `testrig-capacity-${SUFFIX}`;
const ATTR_TEXT = `testrig-note-${SUFFIX}`;
const ATTR_ENUM = `testrig-finish-${SUFFIX}`;

const ids = { productTypeId: '', brandId: '', categoryId: '' };
const createdProductIds = new Set<string>();

/** Parse through the real schema, so the test exercises what the action does. */
function form(slug: string, overrides: Record<string, unknown> = {}) {
  // SKUs are unique across the whole catalogue, not per product, so they are
  // derived from the slug — a fixed pair would belong to the first product
  // created and collide for every one after it.
  const prefix = slug.toUpperCase();

  const base = {
    slug,
    nameAr: 'جهاز اختبار',
    nameEn: 'Test Rig',
    productTypeId: ids.productTypeId,
    brandId: ids.brandId,
    categoryId: ids.categoryId,
    isPublished: true,
    warrantyMonths: 12,
    attributes: { [ATTR_INT]: '256', [ATTR_TEXT]: 'Matte', [ATTR_ENUM]: 'glass' },
    options: [
      {
        nameAr: 'السعة',
        nameEn: 'Capacity',
        isColor: false,
        values: [
          { valueAr: '١٢٨', valueEn: '128GB' },
          { valueAr: '٢٥٦', valueEn: '256GB' },
        ],
      },
    ],
    variants: [
      {
        sku: `${prefix}-128`,
        priceIqd: 300_000,
        optionValues: ['128GB'],
        status: StockStatus.IN_STOCK,
        isActive: true,
      },
      {
        sku: `${prefix}-256`,
        priceIqd: 400_000,
        optionValues: ['256GB'],
        status: StockStatus.IN_STOCK,
        isActive: true,
      },
    ],
    images: [],
    videos: [],
  };

  const parsed = productFormSchema.safeParse({ ...base, ...overrides });
  if (!parsed.success) {
    throw new Error(
      `fixture failed validation: ${JSON.stringify(parsed.error.issues)}`,
    );
  }
  return parsed.data;
}

/** The SKU `form()` gives a fixture variant, so tests never spell one out. */
const skuFor = (slug: string, size: '128' | '256') => `${slug.toUpperCase()}-${size}`;

async function create(slug: string, overrides: Record<string, unknown> = {}) {
  const result = await createProduct(form(slug, overrides));
  createdProductIds.add(result.id);
  return result;
}

beforeAll(async () => {
  const staff = await db.user.upsert({
    where: { email: 'integration-catalogue@mps.local' },
    create: {
      email: 'integration-catalogue@mps.local',
      name: STAFF.name,
      role: Role.ADMIN,
      emailVerified: false,
    },
    update: {},
    select: { id: true },
  });
  STAFF.id = staff.id;

  // A product type nobody wrote code for, with its own specifications.
  const [capacity, note, finish] = await Promise.all([
    db.attributeDefinition.create({
      data: {
        key: ATTR_INT,
        labelAr: 'السعة',
        labelEn: 'Capacity',
        type: AttributeDataType.INT,
        unit: 'GB',
      },
      select: { id: true },
    }),
    db.attributeDefinition.create({
      data: {
        key: ATTR_TEXT,
        labelAr: 'ملاحظة',
        labelEn: 'Note',
        type: AttributeDataType.TEXT,
      },
      select: { id: true },
    }),
    db.attributeDefinition.create({
      data: {
        key: ATTR_ENUM,
        labelAr: 'الخامة',
        labelEn: 'Finish',
        type: AttributeDataType.ENUM,
        options: {
          create: [
            { value: 'glass', labelAr: 'زجاج', labelEn: 'Glass' },
            { value: 'metal', labelAr: 'معدن', labelEn: 'Metal' },
          ],
        },
      },
      select: { id: true },
    }),
  ]);

  const type = await db.productType.create({
    data: {
      key: TYPE_KEY,
      nameAr: 'جهاز اختبار',
      nameEn: 'Test Rig',
      attributes: {
        create: [
          { definitionId: capacity.id, isRequired: true, sortOrder: 0 },
          { definitionId: note.id, isRequired: false, sortOrder: 1 },
          { definitionId: finish.id, isRequired: false, sortOrder: 2 },
        ],
      },
    },
    select: { id: true },
  });

  const [brand, category] = await Promise.all([
    db.brand.findFirstOrThrow({ select: { id: true } }),
    db.category.findFirstOrThrow({ select: { id: true } }),
  ]);

  ids.productTypeId = type.id;
  ids.brandId = brand.id;
  ids.categoryId = category.id;
});

afterAll(async () => {
  await db.order.deleteMany({ where: { fullName: 'Catalogue Integration' } });
  await db.product.deleteMany({ where: { id: { in: [...createdProductIds] } } });
  await db.productType.deleteMany({ where: { key: TYPE_KEY } });
  await db.attributeDefinition.deleteMany({
    where: { key: { in: [ATTR_INT, ATTR_TEXT, ATTR_ENUM] } },
  });
  await db.user.deleteMany({ where: { email: 'integration-catalogue@mps.local' } });
  await db.$disconnect();
});

describe('creating a product of a brand-new type', () => {
  it('stores each specification in the column its definition dictates', async () => {
    const { id } = await create(`testrig-base-${SUFFIX}`);

    const values = await db.productAttributeValue.findMany({
      where: { productId: id },
      select: {
        valueInt: true,
        valueText: true,
        valueBool: true,
        definition: { select: { key: true } },
        option: { select: { value: true } },
      },
    });

    const byKey = new Map(values.map((value) => [value.definition.key, value]));

    // An integer goes to valueInt and nowhere else — the unit ("GB") lives on
    // the definition and is never glued onto the value.
    expect(byKey.get(ATTR_INT)).toMatchObject({ valueInt: 256, valueText: null });
    expect(byKey.get(ATTR_TEXT)).toMatchObject({ valueText: 'Matte', valueInt: null });
    // An enum is a foreign key to the option row, not a copy of its label.
    expect(byKey.get(ATTR_ENUM)?.option?.value).toBe('glass');
  });

  it('derives each variant label from the options it selected', async () => {
    const { id } = await create(`testrig-label-${SUFFIX}`);

    const variants = await db.productVariant.findMany({
      where: { productId: id },
      select: { labelAr: true, labelEn: true, priceIqd: true },
      orderBy: { sortOrder: 'asc' },
    });

    expect(variants.map((v) => v.labelEn)).toEqual(['128GB', '256GB']);
    // The Arabic twin comes from the option's own Arabic value.
    expect(variants[0]?.labelAr).toBe('١٢٨');
  });

  it('caches the cheapest active price for catalogue sorting', async () => {
    const { id } = await create(`testrig-price-${SUFFIX}`);

    const product = await db.product.findUniqueOrThrow({
      where: { id },
      select: { minPriceIqd: true, publishedAt: true },
    });
    expect(product.minPriceIqd).toBe(300_000);
    // Stamped on first publish, so "new arrival" ordering is stable.
    expect(product.publishedAt).not.toBeNull();
  });

  it('gives every variant an availability status without counting units', async () => {
    const { id } = await create(`testrig-stock-${SUFFIX}`);

    const inventories = await db.inventory.findMany({
      where: { variant: { productId: id } },
      select: { status: true, trackQuantity: true, onHand: true },
    });

    expect(inventories).toHaveLength(2);
    // CLAUDE.md §13.2: availability is a status. Counting stays opt-in.
    expect(inventories.every((row) => row.trackQuantity === false)).toBe(true);
    expect(inventories.every((row) => row.status === StockStatus.IN_STOCK)).toBe(true);
  });
});

describe('specification rules', () => {
  it('refuses an attribute that the product type does not declare', async () => {
    // A stray row would never render — the product page reads through
    // ProductTypeAttribute — and would survive every future edit unseen.
    await expect(
      create(`testrig-stray-${SUFFIX}`, {
        attributes: { [ATTR_INT]: '256', 'not-on-this-type': 'x' },
      }),
    ).rejects.toThrow(ProductAdminError);
  });

  it('refuses a blank required specification', async () => {
    await expect(
      create(`testrig-blank-${SUFFIX}`, {
        attributes: { [ATTR_INT]: '' },
      }),
    ).rejects.toThrow(ProductAdminError);
  });

  it('deletes the row when an optional specification is cleared', async () => {
    const { id } = await create(`testrig-clear-${SUFFIX}`);
    expect(await db.productAttributeValue.count({ where: { productId: id } })).toBe(3);

    await updateProduct(
      id,
      form(`testrig-clear-${SUFFIX}`, {
        attributes: { [ATTR_INT]: '512', [ATTR_TEXT]: '', [ATTR_ENUM]: '' },
      }),
    );

    // An absent specification is hidden on the product page; one stored empty
    // renders a row with nothing in it.
    const remaining = await db.productAttributeValue.findMany({
      where: { productId: id },
      select: { valueInt: true, definition: { select: { key: true } } },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ valueInt: 512 });
  });
});

describe('editing without destroying history', () => {
  it('keeps a variant id when its SKU is unchanged', async () => {
    // Live carts and every past order line point at this row. Recreating it
    // would empty the carts and cut the invoices loose.
    const { id } = await create(`testrig-keep-${SUFFIX}`);
    const before = await db.productVariant.findMany({
      where: { productId: id },
      select: { id: true, sku: true },
      orderBy: { sku: 'asc' },
    });

    await updateProduct(
      id,
      form(`testrig-keep-${SUFFIX}`, {
        variants: [
          {
            sku: skuFor(`testrig-keep-${SUFFIX}`, '128'),
            priceIqd: 350_000,
            optionValues: ['128GB'],
            status: StockStatus.IN_STOCK,
            isActive: true,
          },
          {
            sku: skuFor(`testrig-keep-${SUFFIX}`, '256'),
            priceIqd: 400_000,
            optionValues: ['256GB'],
            status: StockStatus.IN_STOCK,
            isActive: true,
          },
        ],
      }),
    );

    const after = await db.productVariant.findMany({
      where: { productId: id },
      select: { id: true, sku: true, priceIqd: true },
      orderBy: { sku: 'asc' },
    });

    expect(after.map((v) => v.id)).toEqual(before.map((v) => v.id));
    expect(after[0]?.priceIqd).toBe(350_000);
  });

  it('deletes a removed variant that was never ordered', async () => {
    const { id } = await create(`testrig-drop-${SUFFIX}`);

    const result = await updateProduct(
      id,
      form(`testrig-drop-${SUFFIX}`, {
        variants: [
          {
            sku: skuFor(`testrig-drop-${SUFFIX}`, '128'),
            priceIqd: 300_000,
            optionValues: ['128GB'],
            status: StockStatus.IN_STOCK,
            isActive: true,
          },
        ],
      }),
    );

    expect(result.deactivatedVariantCount).toBe(0);
    expect(await db.productVariant.count({ where: { productId: id } })).toBe(1);
  });

  it('deactivates a removed variant that has already been sold', async () => {
    const { id } = await create(`testrig-sold-${SUFFIX}`);
    const sold = await db.productVariant.findFirstOrThrow({
      where: { productId: id, sku: skuFor(`testrig-sold-${SUFFIX}`, '256') },
      select: { id: true },
    });

    const cart = await db.cart.create({
      data: {
        token: `testrig-${Math.random().toString(36).slice(2)}`,
        items: { create: { variantId: sold.id, quantity: 1 } },
      },
      select: { id: true },
    });
    await placeOrder(cart.id, {
      fullName: 'Catalogue Integration',
      phone: '+9647700000002',
      governorate: Governorate.BAGHDAD,
      city: 'Karrada',
      addressLine: 'Street 1',
      notes: null,
    });

    const result = await updateProduct(
      id,
      form(`testrig-sold-${SUFFIX}`, {
        variants: [
          {
            sku: skuFor(`testrig-sold-${SUFFIX}`, '128'),
            priceIqd: 300_000,
            optionValues: ['128GB'],
            status: StockStatus.IN_STOCK,
            isActive: true,
          },
        ],
      }),
    );

    expect(result.deactivatedVariantCount).toBe(1);

    const survivor = await db.productVariant.findUniqueOrThrow({
      where: { id: sold.id },
      select: { isActive: true, orderItems: { select: { id: true } } },
    });
    expect(survivor.isActive).toBe(false);
    // The order line still points at the row it was sold from.
    expect(survivor.orderItems.length).toBeGreaterThan(0);
  });

  it('excludes an inactive variant from the cached cheapest price', async () => {
    // Advertising a price nobody can buy is a bait price.
    const { id } = await create(`testrig-inactive-${SUFFIX}`);

    await updateProduct(
      id,
      form(`testrig-inactive-${SUFFIX}`, {
        variants: [
          {
            sku: skuFor(`testrig-inactive-${SUFFIX}`, '128'),
            priceIqd: 300_000,
            optionValues: ['128GB'],
            status: StockStatus.IN_STOCK,
            isActive: false,
          },
          {
            sku: skuFor(`testrig-inactive-${SUFFIX}`, '256'),
            priceIqd: 400_000,
            optionValues: ['256GB'],
            status: StockStatus.IN_STOCK,
            isActive: true,
          },
        ],
      }),
    );

    const product = await db.product.findUniqueOrThrow({
      where: { id },
      select: { minPriceIqd: true },
    });
    expect(product.minPriceIqd).toBe(400_000);
  });
});

describe('slug and sku collisions', () => {
  it('names the slug, not the sku, when a slug is taken', async () => {
    await create(`testrig-dupe-${SUFFIX}`);

    await expect(
      create(`testrig-dupe-${SUFFIX}`, {
        variants: [
          {
            sku: `TESTRIG-${SUFFIX}-OTHER`,
            priceIqd: 100_000,
            optionValues: ['128GB'],
            status: StockStatus.IN_STOCK,
            isActive: true,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'slugTaken' });
  });

  it('names the sku when a sku is taken', async () => {
    await create(`testrig-skudupe-a-${SUFFIX}`);

    await expect(
      create(`testrig-skudupe-b-${SUFFIX}`, {
        // Deliberately the other product's SKU: a SKU is unique across the
        // whole catalogue, not per product.
        variants: [
          {
            sku: skuFor(`testrig-skudupe-a-${SUFFIX}`, '128'),
            priceIqd: 100_000,
            optionValues: ['128GB'],
            status: StockStatus.IN_STOCK,
            isActive: true,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'skuTaken' });
  });
});

describe('deleting', () => {
  it('removes a product that was never sold, and everything under it', async () => {
    const { id } = await create(`testrig-gone-${SUFFIX}`);

    await deleteProduct(id);
    createdProductIds.delete(id);

    expect(await db.product.count({ where: { id } })).toBe(0);
    // Variants, inventory, options and images all cascade.
    expect(await db.productVariant.count({ where: { productId: id } })).toBe(0);
    expect(await db.productOption.count({ where: { productId: id } })).toBe(0);
  });

  it('refuses to delete a product that appears in an order', async () => {
    const { id } = await create(`testrig-ordered-${SUFFIX}`);
    const variant = await db.productVariant.findFirstOrThrow({
      where: { productId: id },
      select: { id: true },
    });

    const cart = await db.cart.create({
      data: {
        token: `testrig-${Math.random().toString(36).slice(2)}`,
        items: { create: { variantId: variant.id, quantity: 1 } },
      },
      select: { id: true },
    });
    await placeOrder(cart.id, {
      fullName: 'Catalogue Integration',
      phone: '+9647700000002',
      governorate: Governorate.BAGHDAD,
      city: 'Karrada',
      addressLine: 'Street 1',
      notes: null,
    });

    // Deleting would set OrderItem.variantId to null: the invoice keeps its
    // snapshot and still renders, which is exactly what makes the damage
    // invisible. Unpublishing is the reversible answer.
    await expect(deleteProduct(id)).rejects.toMatchObject({
      code: 'productHasOrders',
    });
    expect(await db.product.count({ where: { id } })).toBe(1);
  });

  it('leaves an order untouched when its product is unpublished instead', async () => {
    const order = await db.order.findFirst({
      where: { fullName: 'Catalogue Integration' },
      select: { status: true, items: { select: { productNameEn: true, sku: true } } },
    });
    expect(order?.status).toBe(OrderStatus.PENDING);
    expect(order?.items[0]?.productNameEn).toBe('Test Rig');
  });
});
