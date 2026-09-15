import 'server-only';

import { db } from '@/server/db/client';
import type { Locale } from '@/i18n/routing';
import {
  excerptFromBody,
  parseArticleBody,
  type ArticleBlock,
} from '@/lib/domain/blog';

/**
 * The public read for buying guides.
 *
 * Deliberately a different module from `admin-blog.ts` and with no way to ask
 * for a draft: the filter below is not a parameter, it is the definition of
 * this file. A shared function with an `includeDrafts` flag is one wrong
 * argument away from putting an unfinished article on the shop floor.
 *
 * `publishedAt: { lte: now }` is the other half — an article dated next Friday
 * is published, and still not live.
 */

function liveWhere() {
  return { isPublished: true, publishedAt: { not: null, lte: new Date() } };
}

export interface GuideCard {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: Date;
}

export async function getGuides(locale: Locale, limit = 24): Promise<GuideCard[]> {
  const isAr = locale === 'ar';

  const rows = await db.blogPost.findMany({
    where: liveWhere(),
    select: {
      slugAr: true,
      titleAr: true,
      titleEn: true,
      excerptAr: true,
      excerptEn: true,
      bodyAr: true,
      bodyEn: true,
      publishedAt: true,
    },
    orderBy: [{ publishedAt: 'desc' }],
    take: limit,
  });

  return rows.map((row) => {
    const body = isAr ? row.bodyAr : row.bodyEn;
    const excerpt = isAr ? row.excerptAr : row.excerptEn;

    return {
      slug: row.slugAr,
      title: isAr ? row.titleAr : row.titleEn,
      // Falling back to the opening paragraph rather than showing a bare
      // title: an excerpt is optional in the form because insisting on one is
      // how articles stop getting written.
      excerpt: excerpt ?? excerptFromBody(body),
      publishedAt: row.publishedAt ?? new Date(),
    };
  });
}

export interface Guide {
  slug: string;
  title: string;
  excerpt: string;
  blocks: ArticleBlock[];
  authorName: string | null;
  publishedAt: Date;
  metaTitle: string | null;
  metaDescription: string | null;
}

export async function getGuide(slug: string, locale: Locale): Promise<Guide | null> {
  const isAr = locale === 'ar';

  const row = await db.blogPost.findFirst({
    where: { ...liveWhere(), slugAr: slug },
    select: {
      slugAr: true,
      titleAr: true,
      titleEn: true,
      excerptAr: true,
      excerptEn: true,
      bodyAr: true,
      bodyEn: true,
      authorName: true,
      publishedAt: true,
      metaTitleAr: true,
      metaTitleEn: true,
      metaDescriptionAr: true,
      metaDescriptionEn: true,
    },
  });

  if (!row) return null;

  const body = isAr ? row.bodyAr : row.bodyEn;
  const excerpt = isAr ? row.excerptAr : row.excerptEn;

  return {
    slug: row.slugAr,
    title: isAr ? row.titleAr : row.titleEn,
    excerpt: excerpt ?? excerptFromBody(body),
    // Parsed on the server into blocks. Nothing downstream turns these into
    // markup, which is what makes a pasted script tag a sentence.
    blocks: parseArticleBody(body),
    authorName: row.authorName,
    publishedAt: row.publishedAt ?? new Date(),
    metaTitle: isAr ? row.metaTitleAr : row.metaTitleEn,
    metaDescription: isAr ? row.metaDescriptionAr : row.metaDescriptionEn,
  };
}

/** Every live article's slug, for the sitemap and for pre-rendering. */
export async function getGuideSlugs(): Promise<string[]> {
  const rows = await db.blogPost.findMany({
    where: liveWhere(),
    select: { slugAr: true },
    orderBy: [{ publishedAt: 'desc' }],
  });

  return rows.map((row) => row.slugAr);
}
