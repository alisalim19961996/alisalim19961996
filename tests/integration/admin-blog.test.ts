import 'dotenv/config';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

/**
 * Buying guides, against a real database.
 *
 * What needs Postgres here is not the parsing — that is pure and unit-tested.
 * It is everything about **when an article is visible**: a unique index on two
 * slug columns, a timestamp compared against `now()` inside the query, and a
 * public read that must be incapable of returning a draft. The last one is the
 * point of the file: `server/queries/blog.ts` has no parameter that could let
 * a draft out, and these tests are what say so.
 */

const STAFF = { id: '', name: 'Guide Staff', role: Role.ADMIN };

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
const { BlogError, deleteBlogPost, saveBlogPost, setBlogPostPublished } =
  await import('@/server/services/admin-blog');
const { getGuide, getGuides, getGuideSlugs } = await import('@/server/queries/blog');

STAFF.id = 'guide-staff';

const created: string[] = [];

function draft(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    slug,
    titleAr: `دليل ${slug}`,
    titleEn: `Guide ${slug}`,
    excerptAr: null,
    excerptEn: null,
    bodyAr: '## المقدمة\n\nأول فقرة بالعربي.\n\n- نقطة',
    bodyEn: '## Intro\n\nThe first paragraph.\n\n- a point',
    authorName: null,
    metaTitleAr: null,
    metaTitleEn: null,
    metaDescriptionAr: null,
    metaDescriptionEn: null,
    isPublished: false,
    publishedAt: null,
    ...overrides,
  };
}

async function make(slug: string, overrides: Record<string, unknown> = {}) {
  const { id } = await saveBlogPost(draft(slug, overrides) as never);
  created.push(id);
  return id;
}

afterAll(async () => {
  // Deleted here rather than left behind: these rows are visible on a public
  // page, and a test article on the owner's dev storefront is a bug report
  // waiting to be filed.
  await db.blogPost.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

describe('saving a guide', () => {
  it('writes one slug into both locale columns', async () => {
    // /ar/guides/<slug> and /en/guides/<slug> have to be the same URL or
    // hreflang has nothing to pair (§6).
    const id = await make(`blogtest-slug-${Date.now()}`);
    const row = await db.blogPost.findUniqueOrThrow({
      where: { id },
      select: { slugAr: true, slugEn: true },
    });

    expect(row.slugAr).toBe(row.slugEn);
  });

  it('refuses a slug another guide already has', async () => {
    const slug = `blogtest-dup-${Date.now()}`;
    await make(slug);

    await expect(make(slug)).rejects.toMatchObject({
      code: 'slugTaken',
      field: 'slug',
    });
  });

  it('stamps the publication date on first publish and keeps it afterwards', async () => {
    const id = await make(`blogtest-date-${Date.now()}`, { isPublished: true });

    const first = await db.blogPost.findUniqueOrThrow({
      where: { id },
      select: { publishedAt: true },
    });
    expect(first.publishedAt).not.toBeNull();

    // Withdrawing and re-publishing must not move it: an edit would otherwise
    // throw the article back to the top of the list every time.
    await setBlogPostPublished(id, false);
    await setBlogPostPublished(id, true);

    const again = await db.blogPost.findUniqueOrThrow({
      where: { id },
      select: { publishedAt: true },
    });
    expect(again.publishedAt?.getTime()).toBe(first.publishedAt?.getTime());
  });

  it('refuses to edit an id that does not exist', async () => {
    await expect(
      saveBlogPost(draft('blogtest-missing') as never, 'no-such-id'),
    ).rejects.toBeInstanceOf(BlogError);
  });
});

describe('what a customer can read', () => {
  it('never returns a draft', async () => {
    const slug = `blogtest-draft-${Date.now()}`;
    await make(slug);

    expect(await getGuide(slug, 'ar')).toBeNull();
    expect((await getGuides('ar')).some((guide) => guide.slug === slug)).toBe(false);
    expect(await getGuideSlugs()).not.toContain(slug);
  });

  it('never returns one dated in the future', async () => {
    // What lets the owner write three guides on a Sunday and release them one
    // at a time — and the half of "published" a boolean alone cannot express.
    const slug = `blogtest-future-${Date.now()}`;
    await make(slug, {
      isPublished: true,
      publishedAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    expect(await getGuide(slug, 'ar')).toBeNull();
    expect(await getGuideSlugs()).not.toContain(slug);
  });

  it('returns a live one, parsed and in the reader’s language', async () => {
    const slug = `blogtest-live-${Date.now()}`;
    await make(slug, { isPublished: true, publishedAt: new Date(Date.now() - 1000) });

    const arabic = await getGuide(slug, 'ar');
    expect(arabic?.title).toBe(`دليل ${slug}`);
    expect(arabic?.blocks).toEqual([
      { kind: 'heading', text: 'المقدمة' },
      { kind: 'paragraph', text: 'أول فقرة بالعربي.' },
      { kind: 'list', items: ['نقطة'] },
    ]);

    const english = await getGuide(slug, 'en');
    expect(english?.title).toBe(`Guide ${slug}`);
    // The excerpt was left empty, so it comes from the opening paragraph.
    expect(english?.excerpt).toBe('The first paragraph.');
  });
});

describe('deleting a guide', () => {
  it('removes it, because nothing points at it', async () => {
    const slug = `blogtest-delete-${Date.now()}`;
    const id = await make(slug, { isPublished: true, publishedAt: new Date(0) });

    await deleteBlogPost(id);

    expect(await db.blogPost.findUnique({ where: { id } })).toBeNull();
    expect(await getGuideSlugs()).not.toContain(slug);
  });

  it('refuses an id that does not exist', async () => {
    await expect(deleteBlogPost('no-such-id')).rejects.toMatchObject({
      code: 'notFound',
    });
  });
});
