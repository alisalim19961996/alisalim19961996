import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AttributeDataType, Role, StockStatus } from '@prisma/client';

/**
 * Shaping the catalogue, against a real database.
 *
 * `admin-products.test.ts` proves that a product type nobody wrote code for
 * can hold a product. This file proves the step before it: that the owner can
 * **create that type from the dashboard**, with its own specifications, and
 * that the product form then asks for them.
 *
 * Everything here needs a real Postgres. The refusals are the reason: they are
 * counts of rows in other tables (`_count`), foreign keys, and a unique index
 * — none of which a fake can be wrong about in the way the database is right.
 */

const STAFF = { id: '', name: 'Taxonomy Staff', role: Role.ADMIN };

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
const {
  deleteAttribute,
  deleteBrand,
  deleteCategory,
  deleteProductType,
  saveAttribute,
  saveBrand,
  saveCategory,
  saveProductType,
  TaxonomyError,
} = await import('@/server/services/admin-taxonomy');
const { getProductFormReference } = await import('@/server/queries/admin-products');
const { getAdminCategories } = await import('@/server/queries/admin-taxonomy');
const { createProduct } = await import('@/server/services/admin-products');
const {
  attributeFormSchema,
  brandFormSchema,
  categoryFormSchema,
  productTypeFormSchema,
} = await import('@/schemas/taxonomy');
const { productFormSchema } = await import('@/schemas/product');

const SUFFIX = Math.random().toString(36).slice(2, 8);
const ns = (name: string) => `taxrig-${name}-${SUFFIX}`;
/** Keys allow `_` but not `-`, so they get their own spelling. */
const nsKey = (name: string) => `taxrig_${name}_${SUFFIX.replace(/[^a-z0-9]/g, '')}`;

const made = {
  brands: new Set<string>(),
  categories: new Set<string>(),
  types: new Set<string>(),
  attributes: new Set<string>(),
  products: new Set<string>(),
};

/** Parse through the real schema, so a test exercises what the action does. */
const brand = (input: Record<string, unknown>) => brandFormSchema.parse(input);
const category = (input: Record<string, unknown>) => categoryFormSchema.parse(input);
const productType = (input: Record<string, unknown>) =>
  productTypeFormSchema.parse(input);
const attribute = (input: Record<string, unknown>) => attributeFormSchema.parse(input);

beforeAll(async () => {
  const staff = await db.user.upsert({
    where: { email: 'integration-taxonomy@mps.local' },
    create: {
      email: 'integration-taxonomy@mps.local',
      name: STAFF.name,
      role: Role.ADMIN,
      emailVerified: false,
    },
    update: {},
    select: { id: true },
  });
  STAFF.id = staff.id;
});

afterAll(async () => {
  await db.product.deleteMany({ where: { id: { in: [...made.products] } } });
  await db.productType.deleteMany({ where: { id: { in: [...made.types] } } });
  await db.attributeDefinition.deleteMany({
    where: { id: { in: [...made.attributes] } },
  });
  // Children first: the tree is `SetNull`, so a surviving child would be
  // silently promoted instead of removed with its parent.
  await db.category.deleteMany({ where: { id: { in: [...made.categories] } } });
  await db.brand.deleteMany({ where: { id: { in: [...made.brands] } } });
  await db.user.deleteMany({ where: { email: 'integration-taxonomy@mps.local' } });
  await db.$disconnect();
});

// ---------------------------------------------------------------------------

describe('brands', () => {
  it('creates, edits and deletes one', async () => {
    const created = await saveBrand(
      brand({
        slug: ns('acme'),
        nameAr: 'أكمي',
        nameEn: 'Acme',
        accentColor: '#1428A0',
        sortOrder: 3,
      }),
    );
    made.brands.add(created.id);

    const row = await db.brand.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.nameEn).toBe('Acme');
    expect(row.accentColor).toBe('#1428A0');
    expect(row.sortOrder).toBe(3);

    await saveBrand(
      brand({ slug: ns('acme'), nameAr: 'أكمي', nameEn: 'Acme Corp', isActive: false }),
      created.id,
    );
    const edited = await db.brand.findUniqueOrThrow({ where: { id: created.id } });
    expect(edited.nameEn).toBe('Acme Corp');
    expect(edited.isActive).toBe(false);

    await deleteBrand(created.id);
    made.brands.delete(created.id);
    expect(await db.brand.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it('refuses a slug another brand already has', async () => {
    const first = await saveBrand(
      brand({ slug: ns('dup'), nameAr: 'أول', nameEn: 'First' }),
    );
    made.brands.add(first.id);

    // The pg driver adapter leaves `meta.target` undefined (§12), so this is
    // also the assertion that `diagnose.ts` reads the constraint name the
    // other way. A wrong reader degrades to "something went wrong" here.
    await expect(
      saveBrand(brand({ slug: ns('dup'), nameAr: 'ثاني', nameEn: 'Second' })),
    ).rejects.toMatchObject({ code: 'slugTaken' });
  });
});

// ---------------------------------------------------------------------------

describe('categories', () => {
  it('refuses to delete one that still has children', async () => {
    const parent = await saveCategory(
      category({ slug: ns('parent'), nameAr: 'أب', nameEn: 'Parent' }),
    );
    made.categories.add(parent.id);
    const child = await saveCategory(
      category({
        slug: ns('child'),
        nameAr: 'ابن',
        nameEn: 'Child',
        parentId: parent.id,
      }),
    );
    made.categories.add(child.id);

    /*
      `CategoryTree` is `onDelete: SetNull`. Without this check Postgres would
      accept the delete and quietly promote the child to the top level — the
      grouping gone, nothing said, and the products still attached.
    */
    await expect(deleteCategory(parent.id)).rejects.toMatchObject({
      code: 'categoryHasChildren',
    });

    await deleteCategory(child.id);
    made.categories.delete(child.id);
    await deleteCategory(parent.id);
    made.categories.delete(parent.id);
  });

  it('refuses to make a category descend from itself', async () => {
    const root = await saveCategory(
      category({ slug: ns('root'), nameAr: 'جذر', nameEn: 'Root' }),
    );
    made.categories.add(root.id);
    const mid = await saveCategory(
      category({ slug: ns('mid'), nameAr: 'وسط', nameEn: 'Mid', parentId: root.id }),
    );
    made.categories.add(mid.id);

    // Not a crash if allowed — the branch simply detaches from every root and
    // disappears from the tree with its products still in it.
    await expect(
      saveCategory(
        category({ slug: ns('root'), nameAr: 'جذر', nameEn: 'Root', parentId: mid.id }),
        root.id,
      ),
    ).rejects.toMatchObject({ code: 'categoryOwnParent' });

    await expect(
      saveCategory(
        category({
          slug: ns('root'),
          nameAr: 'جذر',
          nameEn: 'Root',
          parentId: root.id,
        }),
        root.id,
      ),
    ).rejects.toMatchObject({ code: 'categoryOwnParent' });
  });

  it('reads back depth-first with a depth per row', async () => {
    const rows = await getAdminCategories();
    const root = rows.find((row) => row.slug === ns('root'));
    const mid = rows.find((row) => row.slug === ns('mid'));
    expect(root?.depth).toBe(0);
    expect(mid?.depth).toBe(1);
    expect(rows.indexOf(root!)).toBeLessThan(rows.indexOf(mid!));
  });
});

// ---------------------------------------------------------------------------

describe('a product type invented from the dashboard', () => {
  const LAPTOP_KEY = nsKey('laptop');
  const SCREEN_KEY = nsKey('screen');
  const PANEL_KEY = nsKey('panel');

  let screenId = '';
  let panelId = '';
  let typeId = '';

  it('creates the specifications it will need', async () => {
    const screen = await saveAttribute(
      attribute({
        key: SCREEN_KEY,
        labelAr: 'حجم الشاشة',
        labelEn: 'Screen size',
        type: AttributeDataType.DECIMAL,
        unit: 'inch',
        isFilterable: true,
      }),
    );
    screenId = screen.id;
    made.attributes.add(screenId);

    const panel = await saveAttribute(
      attribute({
        key: PANEL_KEY,
        labelAr: 'نوع اللوحة',
        labelEn: 'Panel',
        type: AttributeDataType.ENUM,
        options: [
          { value: 'ips', labelAr: 'آي بي إس', labelEn: 'IPS' },
          { value: 'oled', labelAr: 'أوليد', labelEn: 'OLED' },
          // The editor's spare blank row; dropped rather than rejected.
          { value: '', labelAr: '', labelEn: '' },
        ],
      }),
    );
    panelId = panel.id;
    made.attributes.add(panelId);

    const options = await db.attributeOption.findMany({
      where: { definitionId: panelId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(options.map((option) => option.value)).toEqual(['ips', 'oled']);
  });

  it('refuses an ENUM with no options', async () => {
    expect(() =>
      attribute({
        key: nsKey('empty'),
        labelAr: 'فارغ',
        labelEn: 'Empty',
        type: AttributeDataType.ENUM,
        options: [],
      }),
    ).toThrow();
  });

  it('creates the type and links them in order', async () => {
    const created = await saveProductType(
      productType({
        key: LAPTOP_KEY,
        nameAr: 'لابتوب',
        nameEn: 'Laptop',
        attributes: [
          { definitionId: panelId, isRequired: false, sortOrder: 0 },
          { definitionId: screenId, isRequired: true, sortOrder: 1 },
        ],
      }),
    );
    typeId = created.id;
    made.types.add(typeId);

    const links = await db.productTypeAttribute.findMany({
      where: { productTypeId: typeId },
      orderBy: { sortOrder: 'asc' },
      select: { definitionId: true, isRequired: true, sortOrder: true },
    });
    expect(links).toEqual([
      { definitionId: panelId, isRequired: false, sortOrder: 0 },
      { definitionId: screenId, isRequired: true, sortOrder: 1 },
    ]);
  });

  it('makes the product form ask for them — no code written', async () => {
    /*
      The whole claim of CLAUDE.md §6, end to end and from the dashboard's
      side: nothing in `admin-products.ts` or in the product form knows the
      word "laptop", and both now offer its two specifications.
    */
    const reference = await getProductFormReference();
    const laptop = reference.productTypes.find((type) => type.key === LAPTOP_KEY);

    expect(laptop).toBeDefined();
    expect(laptop?.attributes.map((a) => a.key)).toEqual([PANEL_KEY, SCREEN_KEY]);
    expect(laptop?.attributes.find((a) => a.key === SCREEN_KEY)?.isRequired).toBe(true);
    expect(
      laptop?.attributes.find((a) => a.key === PANEL_KEY)?.options?.map((o) => o.value),
    ).toEqual(['ips', 'oled']);
  });

  it('saves a product of that type through the ordinary service', async () => {
    const brandRow = await saveBrand(
      brand({ slug: ns('lenovo'), nameAr: 'لينوفو', nameEn: 'Lenovo' }),
    );
    made.brands.add(brandRow.id);
    const categoryRow = await saveCategory(
      category({ slug: ns('laptops'), nameAr: 'لابتوبات', nameEn: 'Laptops' }),
    );
    made.categories.add(categoryRow.id);

    const slug = ns('thinkpad');
    const product = await createProduct(
      productFormSchema.parse({
        slug,
        nameAr: 'ثينك باد',
        nameEn: 'ThinkPad',
        productTypeId: typeId,
        brandId: brandRow.id,
        categoryId: categoryRow.id,
        isPublished: true,
        warrantyMonths: 12,
        attributes: { [SCREEN_KEY]: '14.5', [PANEL_KEY]: 'oled' },
        options: [],
        variants: [
          {
            sku: `${slug.toUpperCase()}-1`,
            priceIqd: 1_500_000,
            labelAr: 'قياسي',
            labelEn: 'Standard',
            status: StockStatus.IN_STOCK,
            isActive: true,
          },
        ],
        images: [],
        videos: [],
      }),
    );
    made.products.add(product.id);

    const values = await db.productAttributeValue.findMany({
      where: { productId: product.id },
      select: {
        definition: { select: { key: true } },
        valueDecimal: true,
        optionId: true,
      },
    });

    const screen = values.find((value) => value.definition.key === SCREEN_KEY);
    const panel = values.find((value) => value.definition.key === PANEL_KEY);

    // A decimal lands in `valueDecimal` and an enum resolves to an option row:
    // routed entirely by `AttributeDefinition.type`, which the owner chose in
    // a dropdown a moment ago.
    expect(Number(screen?.valueDecimal)).toBe(14.5);
    expect(panel?.optionId).toBeTruthy();
  });

  it('refuses to change the value type once values are stored', async () => {
    /*
      `parseAttributeValue` routes a value into one of five typed columns from
      this `type`. Changing it strands every stored value in the wrong column —
      present in the database, invisible on the page, surviving every later
      edit unseen.
    */
    await expect(
      saveAttribute(
        attribute({
          key: SCREEN_KEY,
          labelAr: 'حجم الشاشة',
          labelEn: 'Screen size',
          type: AttributeDataType.TEXT,
        }),
        screenId,
      ),
    ).rejects.toMatchObject({ code: 'attributeTypeLocked' });
  });

  it('refuses to delete a specification that products use', async () => {
    await expect(deleteAttribute(screenId)).rejects.toMatchObject({
      code: 'attributeInUse',
    });
  });

  it('refuses to delete the type, the brand and the category while a product uses them', async () => {
    await expect(deleteProductType(typeId)).rejects.toMatchObject({
      code: 'inUseByProducts',
    });

    const lenovo = await db.brand.findFirstOrThrow({ where: { slug: ns('lenovo') } });
    await expect(deleteBrand(lenovo.id)).rejects.toMatchObject({
      code: 'inUseByProducts',
    });

    const laptops = await db.category.findFirstOrThrow({
      where: { slug: ns('laptops') },
    });
    await expect(deleteCategory(laptops.id)).rejects.toMatchObject({
      code: 'inUseByProducts',
    });
  });

  it('keeps stored values when a specification is unlinked, and brings them back', async () => {
    /*
      Links are replaced wholesale on save, which is safe precisely because a
      `ProductTypeAttribute` carries no history: the value lives on
      `ProductAttributeValue`, pointing at the DEFINITION. Unlinking hides the
      field; it does not delete the data. Worth proving, because the opposite
      would be silent.
    */
    await saveProductType(
      productType({
        key: LAPTOP_KEY,
        nameAr: 'لابتوب',
        nameEn: 'Laptop',
        attributes: [{ definitionId: panelId, isRequired: false, sortOrder: 0 }],
      }),
      typeId,
    );

    const stillThere = await db.productAttributeValue.count({
      where: { definitionId: screenId },
    });
    expect(stillThere).toBeGreaterThan(0);

    await saveProductType(
      productType({
        key: LAPTOP_KEY,
        nameAr: 'لابتوب',
        nameEn: 'Laptop',
        attributes: [
          { definitionId: panelId, isRequired: false, sortOrder: 0 },
          { definitionId: screenId, isRequired: true, sortOrder: 1 },
        ],
      }),
      typeId,
    );

    const reference = await getProductFormReference();
    const laptop = reference.productTypes.find((type) => type.key === LAPTOP_KEY);
    expect(laptop?.attributes.map((a) => a.key)).toEqual([PANEL_KEY, SCREEN_KEY]);
  });

  it('keeps an option row that products point at, and its id', async () => {
    const before = await db.attributeOption.findFirstOrThrow({
      where: { definitionId: panelId, value: 'oled' },
    });

    // Renaming the label must not recreate the row: `ProductAttributeValue`
    // points at its id, and delete-and-recreate would blank the spec on every
    // product using it.
    await saveAttribute(
      attribute({
        key: PANEL_KEY,
        labelAr: 'نوع اللوحة',
        labelEn: 'Panel type',
        type: AttributeDataType.ENUM,
        options: [
          { value: 'ips', labelAr: 'آي بي إس', labelEn: 'IPS' },
          { value: 'oled', labelAr: 'أوليد', labelEn: 'OLED display' },
        ],
      }),
      panelId,
    );

    const after = await db.attributeOption.findFirstOrThrow({
      where: { definitionId: panelId, value: 'oled' },
    });
    expect(after.id).toBe(before.id);
    expect(after.labelEn).toBe('OLED display');
  });

  it('leaves an option in use alone when it is removed from the form', async () => {
    await saveAttribute(
      attribute({
        key: PANEL_KEY,
        labelAr: 'نوع اللوحة',
        labelEn: 'Panel type',
        type: AttributeDataType.ENUM,
        options: [{ value: 'ips', labelAr: 'آي بي إس', labelEn: 'IPS' }],
      }),
      panelId,
    );

    // 'oled' is stored against the ThinkPad. Deleting it would cascade the
    // stored value away and blank the spec row with nothing to say why.
    const survivor = await db.attributeOption.findFirst({
      where: { definitionId: panelId, value: 'oled' },
    });
    expect(survivor).not.toBeNull();
  });

  it('rejects a link to an attribute that does not exist', async () => {
    await expect(
      saveProductType(
        productType({
          key: LAPTOP_KEY,
          nameAr: 'لابتوب',
          nameEn: 'Laptop',
          attributes: [
            { definitionId: 'not-a-real-id', isRequired: false, sortOrder: 0 },
          ],
        }),
        typeId,
      ),
    ).rejects.toBeInstanceOf(TaxonomyError);
  });
});
