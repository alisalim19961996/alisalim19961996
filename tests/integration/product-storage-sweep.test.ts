import 'dotenv/config';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

/**
 * Deleting a product takes its photographs off the storage bill.
 *
 * Until this existed the row cascaded and every uploaded object stayed in the
 * bucket — invisible, permanent, and paid for every month. The sweep is a
 * DELETE against somebody else's storage, so the claim worth proving is not
 * that it deletes, but that it **refuses to delete an object another product
 * still points at**. A slug freed by a rename can be taken by a new product,
 * so the folder is not proof of ownership.
 *
 * `fetch` is replaced, so nothing here reaches Supabase. The database is real,
 * because "still referenced" is a query and mocking it would test the mock.
 */

// Set before the modules are imported: `config/env` reads process.env once, at
// import. A test host and a fake key, so even a bug that got past the stubbed
// fetch could only address a domain that does not exist.
process.env.SUPABASE_URL = 'https://sweep.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_key_for_the_sweep';
process.env.SUPABASE_STORAGE_BUCKET = 'product-images';

const STAFF = {
  id: 'staff',
  name: 'Staff',
  email: 'staff@mps.local',
  role: Role.ADMIN,
};

vi.mock('@/server/auth/guards', () => ({
  getCurrentUser: async () => STAFF,
  requireUser: async () => STAFF,
  requireStaff: async () => STAFF,
  requireAdmin: async () => STAFF,
}));

const { db } = await import('@/server/db/client');
const { deleteProduct } = await import('@/server/services/admin-products');

const SUFFIX = Math.random().toString(36).slice(2, 8);
const made: string[] = [];

/** What the stubbed bucket holds, keyed by folder. */
const bucket = new Map<string, string[]>();
/** Every path the code asked to delete, in order. */
let deleted: string[] = [];

const publicUrl = (path: string) =>
  `https://sweep.test/storage/v1/object/public/product-images/${path}`;

function stubStorage() {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);

    if (url.includes('/storage/v1/object/list/')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        prefix?: string;
        offset?: number;
      };
      const names = bucket.get(body.prefix ?? '') ?? [];
      // Only the first page is ever non-empty here; the paging loop stops on a
      // short page, which is what the second call proves.
      const page = (body.offset ?? 0) === 0 ? names : [];
      return new Response(
        JSON.stringify(page.map((name) => ({ name, id: `id-${name}` }))),
        { status: 200 },
      );
    }

    if (url.includes('/storage/v1/object/product-images')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { prefixes?: string[] };
      deleted.push(...(body.prefixes ?? []));
      return new Response('{}', { status: 200 });
    }

    throw new Error(`unexpected request in a storage test: ${url}`);
  });
}

async function makeProduct(slug: string, imageUrls: string[]) {
  const [productType, brand, category] = await Promise.all([
    db.productType.findFirstOrThrow({ select: { id: true } }),
    db.brand.findFirstOrThrow({ select: { id: true } }),
    db.category.findFirstOrThrow({ select: { id: true } }),
  ]);

  const product = await db.product.create({
    data: {
      slugAr: slug,
      slugEn: slug,
      nameAr: `منتج ${slug}`,
      nameEn: `Product ${slug}`,
      productTypeId: productType.id,
      brandId: brand.id,
      categoryId: category.id,
      isPublished: false,
      minPriceIqd: 100_000,
      images: {
        create: imageUrls.map((url, index) => ({
          url,
          altAr: 'صورة',
          altEn: 'image',
          sortOrder: index,
        })),
      },
    },
    select: { id: true },
  });
  made.push(product.id);
  return product;
}

beforeAll(() => {
  stubStorage();
});

afterEach(() => {
  bucket.clear();
  deleted = [];
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await db.product.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
});

describe('deleting a product sweeps its folder', () => {
  it('removes every object under the folder, by exact key', async () => {
    const slug = `sweep-basic-${SUFFIX}`;
    bucket.set(slug, ['one.jpg', 'two.webp']);
    const product = await makeProduct(slug, [publicUrl(`${slug}/one.jpg`)]);

    await deleteProduct(product.id);

    // Both: the one the product referenced, and the one it did not — an image
    // uploaded and then removed from the form before saving is the commoner
    // leak, and it was never a row at all.
    expect(deleted.sort()).toEqual([`${slug}/one.jpg`, `${slug}/two.webp`]);
  });

  it('leaves alone an object another product still points at', async () => {
    const slug = `sweep-shared-${SUFFIX}`;
    const borrowed = `${slug}/kept.jpg`;
    bucket.set(slug, ['kept.jpg', 'orphan.jpg']);

    // A product that took the folder's slug after a rename, still using one of
    // the objects in it. Its row survives the delete below.
    const neighbour = await makeProduct(`sweep-neighbour-${SUFFIX}`, [
      publicUrl(borrowed),
    ]);
    const product = await makeProduct(slug, []);

    await deleteProduct(product.id);

    expect(deleted).toEqual([`${slug}/orphan.jpg`]);
    // And the neighbour's image row is untouched, which is what makes the
    // check above meaningful rather than a coincidence of ordering.
    await expect(
      db.productImage.count({ where: { productId: neighbour.id } }),
    ).resolves.toBe(1);
  });

  it('deletes nothing when the folder is empty', async () => {
    const slug = `sweep-empty-${SUFFIX}`;
    const product = await makeProduct(slug, []);

    await deleteProduct(product.id);

    expect(deleted).toEqual([]);
  });

  it('still deletes the product when storage refuses', async () => {
    const slug = `sweep-broken-${SUFFIX}`;
    bucket.set(slug, ['one.jpg']);
    const product = await makeProduct(slug, []);

    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }));
    // The row is gone either way. Turning a storage hiccup into a failed
    // delete would leave the owner pressing a button that half worked.
    await expect(deleteProduct(product.id)).resolves.toBeUndefined();
    stubStorage();

    await expect(db.product.count({ where: { id: product.id } })).resolves.toBe(0);
  });

  it('refuses to delete a sold product, and sweeps nothing', async () => {
    // The refusal came first and still does: the sweep must not run for a
    // product that is still there.
    const slug = `sweep-sold-${SUFFIX}`;
    bucket.set(slug, ['one.jpg']);
    const product = await makeProduct(slug, []);

    const variant = await db.productVariant.create({
      data: {
        productId: product.id,
        sku: `SWEEP-${SUFFIX}`,
        labelAr: 'نسخة',
        labelEn: 'Variant',
        priceIqd: 100_000,
        inventory: { create: { status: 'IN_STOCK' } },
      },
      select: { id: true },
    });

    const order = await db.order.findFirst({ select: { id: true } });
    if (!order) {
      // No order in this database to borrow; the refusal is covered by
      // admin-products.test.ts against one it creates itself.
      return;
    }

    await db.orderItem.create({
      data: {
        orderId: order.id,
        variantId: variant.id,
        productNameAr: 'منتج',
        productNameEn: 'Product',
        brandName: 'Test',
        variantLabelAr: 'نسخة',
        variantLabelEn: 'Variant',
        sku: `SWEEP-${SUFFIX}`,
        unitPriceIqd: 100_000,
        quantity: 1,
        lineTotalIqd: 100_000,
      },
    });

    await expect(deleteProduct(product.id)).rejects.toThrow();
    expect(deleted).toEqual([]);
  });
});
