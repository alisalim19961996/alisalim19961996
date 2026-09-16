import 'server-only';

import { db } from '@/server/db/client';
import { uniqueConstraintName } from '@/server/db/diagnose';
import { requireStaff } from '@/server/auth/guards';
import type { BlogPostFormInput } from '@/schemas/blog';

/**
 * Writing the buying guides.
 *
 * The same shape as `admin-taxonomy.ts`: a guard on every export, one write
 * per save, and a unique violation translated into the field that caused it
 * rather than surfacing as "something went wrong".
 *
 * Unlike the catalogue, nothing points at a `BlogPost` — no order, no cart, no
 * product — so deleting one is a real delete rather than a deactivation. That
 * is the whole reason this service is short: there is no history to protect.
 */

export type BlogErrorCode = 'notFound' | 'slugTaken' | 'saveFailed';

export class BlogError extends Error {
  constructor(
    message: string,
    /** Key under the `admin` namespace in messages/, so the UI can translate it. */
    readonly code: BlogErrorCode,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'BlogError';
  }
}

function translateWriteError(error: unknown): Error {
  const constraint = uniqueConstraintName(error);
  if (constraint) {
    // Both slug columns carry the same value, so either index naming it means
    // the same thing to the owner: that address is taken.
    return new BlogError('slug already taken', 'slugTaken', 'slug');
  }
  return error instanceof Error ? error : new BlogError('save failed', 'saveFailed');
}

/**
 * The moment an article becomes visible.
 *
 * Decided here rather than in the schema, because a schema that reads the
 * clock answers differently every time it parses — two saves of the same form
 * would disagree, and no test could pin it. The rules:
 *
 *  - publishing with no date chosen means now;
 *  - a date the owner chose is kept, including a future one, which is what
 *    lets three guides be written on a Sunday and let out one at a time;
 *  - unpublishing keeps the date, so re-publishing does not silently move the
 *    article to the top of the list.
 */
function resolvePublishedAt(
  input: BlogPostFormInput,
  existing: Date | null,
): Date | null {
  if (input.publishedAt) return input.publishedAt;
  if (!input.isPublished) return existing;
  return existing ?? new Date();
}

export interface SaveBlogPostResult {
  id: string;
  slug: string;
  /** The slug before this save, when it changed — see SaveProductResult. */
  previousSlug: string | null;
}

export async function saveBlogPost(
  input: BlogPostFormInput,
  id?: string,
): Promise<SaveBlogPostResult> {
  await requireStaff();

  const existing = id
    ? await db.blogPost.findUnique({
        where: { id },
        select: { id: true, publishedAt: true, slugEn: true },
      })
    : null;

  if (id && !existing) throw new BlogError('post not found', 'notFound');

  const data = {
    // One slug in both columns, so /ar/guides/<slug> and /en/guides/<slug>
    // stay the same URL and hreflang has something to pair (§6).
    slugAr: input.slug,
    slugEn: input.slug,
    titleAr: input.titleAr,
    titleEn: input.titleEn,
    excerptAr: input.excerptAr,
    excerptEn: input.excerptEn,
    bodyAr: input.bodyAr,
    bodyEn: input.bodyEn,
    authorName: input.authorName,
    metaTitleAr: input.metaTitleAr,
    metaTitleEn: input.metaTitleEn,
    metaDescriptionAr: input.metaDescriptionAr,
    metaDescriptionEn: input.metaDescriptionEn,
    isPublished: input.isPublished,
    publishedAt: resolvePublishedAt(input, existing?.publishedAt ?? null),
  };

  try {
    if (!existing) {
      const created = await db.blogPost.create({ data, select: { id: true } });
      return { id: created.id, slug: input.slug, previousSlug: null };
    }

    await db.blogPost.update({ where: { id: existing.id }, data });
    return {
      id: existing.id,
      slug: input.slug,
      previousSlug: existing.slugEn === input.slug ? null : existing.slugEn,
    };
  } catch (error) {
    throw translateWriteError(error);
  }
}

/** The list's one-click control, so publishing does not need the whole form. */
export async function setBlogPostPublished(
  id: string,
  isPublished: boolean,
): Promise<void> {
  await requireStaff();

  const post = await db.blogPost.findUnique({
    where: { id },
    select: { publishedAt: true },
  });
  if (!post) throw new BlogError('post not found', 'notFound');

  await db.blogPost.update({
    where: { id },
    data: {
      isPublished,
      // First publication stamps the date; later ones keep the original, so an
      // article does not jump to the top of the list every time it is edited.
      publishedAt: isPublished ? (post.publishedAt ?? new Date()) : post.publishedAt,
    },
  });
}

export async function deleteBlogPost(id: string): Promise<void> {
  await requireStaff();

  const post = await db.blogPost.findUnique({ where: { id }, select: { id: true } });
  if (!post) throw new BlogError('post not found', 'notFound');

  await db.blogPost.delete({ where: { id } });
}
