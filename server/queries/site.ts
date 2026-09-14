import 'server-only';

import { db } from '@/server/db/client';

/**
 * The store's own details, as a customer may see them.
 *
 * Separate from `getSiteSettings()` in `admin-settings.ts`, which calls
 * `requireAdmin()` and returns the whole row. This one is public and therefore
 * names its columns deliberately: a storefront page reaching for the admin
 * read would either need the guard relaxed — the wrong direction entirely — or
 * would quietly ship whatever column is added to that table next.
 *
 * Everything here is nullable because it genuinely is: a shop that has not
 * filled in its WhatsApp number yet must render a page that says so, not a
 * link to nothing (§13.13 — commercial details live in the database, never in
 * the code).
 */
export interface PublicSiteSettings {
  storeNameAr: string;
  storeNameEn: string;
  contactPhone: string | null;
  whatsappNumber: string | null;
  contactEmail: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  warrantyNoteAr: string | null;
  warrantyNoteEn: string | null;
}

export async function getPublicSiteSettings(): Promise<PublicSiteSettings | null> {
  return db.siteSetting.findFirst({
    select: {
      storeNameAr: true,
      storeNameEn: true,
      contactPhone: true,
      whatsappNumber: true,
      contactEmail: true,
      facebookUrl: true,
      instagramUrl: true,
      tiktokUrl: true,
      warrantyNoteAr: true,
      warrantyNoteEn: true,
    },
  });
}

/** The lowest and highest published price, for the buying guide's bands. */
export async function getPriceRange(): Promise<{ min: number; max: number } | null> {
  const result = await db.product.aggregate({
    where: { isPublished: true, minPriceIqd: { not: null } },
    _min: { minPriceIqd: true },
    _max: { minPriceIqd: true },
  });

  const min = result._min.minPriceIqd;
  const max = result._max.minPriceIqd;
  if (min === null || max === null) return null;

  return { min, max };
}
