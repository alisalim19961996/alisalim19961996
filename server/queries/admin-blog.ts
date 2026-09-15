import 'server-only';

import { db } from '@/server/db/client';
import { requireStaff } from '@/server/auth/guards';
import type { BlogPostFormInput } from '@/schemas/blog';

/** Its own constant, like every other admin list — see admin-products.ts. */
export const POSTS_PER_PAGE = 20;

/**
 * Reading the buying guides, for the dashboard.
 *
 * Separate from `server/queries/blog.ts`, which is the public read: this one
 * sees drafts and future dates, that one must not. Two functions rather than a
 * flag, because a flag is one wrong argument away from putting a draft on the
 * shop floor.
 */

export interface BlogPostRow {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  isPublished: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
}

export interface AdminBlogList {
  rows: BlogPostRow[];
  total: number;
  page: number;
  pageCount: number;
}

export async function getAdminBlogPosts(filters: {
  status?: 'published' | 'draft';
  q?: string;
  page?: number;
}): Promise<AdminBlogList> {
  await requireStaff();

  const page = Math.max(1, filters.page ?? 1);
  const where = {
    ...(filters.status ? { isPublished: filters.status === 'published' } : {}),
    ...(filters.q
      ? {
          OR: [
            { titleAr: { contains: filters.q, mode: 'insensitive' as const } },
            { titleEn: { contains: filters.q, mode: 'insensitive' as const } },
            { slugAr: { contains: filters.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  // Paged in SQL, never in JavaScript after fetching (§5).
  const [rows, total] = await Promise.all([
    db.blogPost.findMany({
      where,
      select: {
        id: true,
        slugAr: true,
        titleAr: true,
        titleEn: true,
        isPublished: true,
        publishedAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * POSTS_PER_PAGE,
      take: POSTS_PER_PAGE,
    }),
    db.blogPost.count({ where }),
  ]);

  return {
    rows: rows.map(({ slugAr, ...rest }) => ({ ...rest, slug: slugAr })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / POSTS_PER_PAGE)),
  };
}

/** The form's values, or null when the id does not exist. */
export async function getBlogPostForEdit(
  id: string,
): Promise<(BlogPostFormInput & { id: string }) | null> {
  await requireStaff();

  const post = await db.blogPost.findUnique({
    where: { id },
    select: {
      id: true,
      slugAr: true,
      titleAr: true,
      titleEn: true,
      excerptAr: true,
      excerptEn: true,
      bodyAr: true,
      bodyEn: true,
      authorName: true,
      metaTitleAr: true,
      metaTitleEn: true,
      metaDescriptionAr: true,
      metaDescriptionEn: true,
      isPublished: true,
      publishedAt: true,
    },
  });

  if (!post) return null;

  const { slugAr, ...rest } = post;
  return { ...rest, slug: slugAr };
}
