import 'server-only';

import { ReviewStatus } from '@prisma/client';
import { db } from '@/server/db/client';
import { requireStaff } from '@/server/auth/guards';

/**
 * Reading reviews, for moderation.
 *
 * A separate module from `server/queries/review.ts` rather than a flag on it,
 * for the same reason `admin-blog` is separate from `blog`: a shared function
 * with an `includeUnmoderated` parameter is one wrong argument away from
 * putting text nobody has read onto a product page.
 *
 * Every export guards. The rows carry a customer's name and their own words
 * about a purchase.
 */

/**
 * The three tabs, as they appear in the URL.
 *
 * The page cannot name `ReviewStatus` itself: a UI file may import types from
 * `@prisma/client` but not values, and an ESLint rule enforces it — data comes
 * through this layer, and so does the vocabulary. Mapping here also means the
 * query string stays readable rather than shouting PENDING.
 */
export type ReviewTab = 'pending' | 'approved' | 'rejected';

const TAB_STATUS: Record<ReviewTab, ReviewStatus> = {
  pending: ReviewStatus.PENDING,
  approved: ReviewStatus.APPROVED,
  rejected: ReviewStatus.REJECTED,
};

const STATUS_TAB: Record<ReviewStatus, ReviewTab> = {
  [ReviewStatus.PENDING]: 'pending',
  [ReviewStatus.APPROVED]: 'approved',
  [ReviewStatus.REJECTED]: 'rejected',
};

export interface AdminReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  status: ReviewTab;
  isVerifiedPurchase: boolean;
  createdAt: Date;
  moderatedAt: Date | null;
  authorName: string;
  product: { id: string; slug: string; nameAr: string; nameEn: string };
}

export interface AdminReviewPage {
  rows: AdminReviewRow[];
  total: number;
  page: number;
  pageCount: number;
  /** How many are waiting, whichever tab is open — the dashboard tile reads it. */
  pendingCount: number;
}

const PER_PAGE = 20;

export async function getAdminReviews(
  tab: ReviewTab,
  page: number,
): Promise<AdminReviewPage> {
  await requireStaff();

  const where = { status: TAB_STATUS[tab] };
  const current = Math.max(1, page);

  const [rows, total, pendingCount] = await Promise.all([
    db.review.findMany({
      where,
      select: {
        id: true,
        rating: true,
        titleAr: true,
        body: true,
        status: true,
        isVerifiedPurchase: true,
        createdAt: true,
        moderatedAt: true,
        user: { select: { name: true } },
        product: { select: { id: true, slugEn: true, nameAr: true, nameEn: true } },
      },
      // Oldest first, because this is a queue: the customer who has been
      // waiting longest is the one to answer next.
      orderBy: { createdAt: 'asc' },
      skip: (current - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    db.review.count({ where }),
    db.review.count({ where: { status: ReviewStatus.PENDING } }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      title: row.titleAr,
      body: row.body,
      status: STATUS_TAB[row.status],
      isVerifiedPurchase: row.isVerifiedPurchase,
      createdAt: row.createdAt,
      moderatedAt: row.moderatedAt,
      authorName: row.user.name,
      product: {
        id: row.product.id,
        slug: row.product.slugEn,
        nameAr: row.product.nameAr,
        nameEn: row.product.nameEn,
      },
    })),
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / PER_PAGE)),
    pendingCount,
  };
}
