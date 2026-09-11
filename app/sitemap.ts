import type { MetadataRoute } from 'next';
import { getAllProductSlugs } from '@/server/queries/product';
import { getBrands } from '@/server/queries/catalogue';
import { publicEnv } from '@/config/env';
import { routing } from '@/i18n/routing';

/**
 * Sitemap.
 *
 * Every URL is listed once per locale with `alternates.languages` pointing at
 * its counterpart, which is what tells a crawler the Arabic and English pages
 * are translations rather than duplicates.
 *
 * Filtered catalogue URLs are deliberately absent: they are permutations of one
 * page, and listing them trades crawl budget for nothing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.NEXT_PUBLIC_APP_URL;

  const [products, brands] = await Promise.all([getAllProductSlugs(), getBrands()]);

  const alternates = (path: string) => ({
    languages: Object.fromEntries(
      routing.locales.map((locale) => [locale, `${base}/${locale}${path}`]),
    ),
  });

  const entry = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
    lastModified?: Date,
  ) =>
    routing.locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      lastModified,
      changeFrequency,
      priority,
      alternates: alternates(path),
    }));

  return [
    ...entry('', 1, 'daily'),
    ...entry('/products', 0.9, 'daily'),
    ...entry('/brands', 0.6, 'weekly'),
    ...entry('/offers', 0.7, 'daily'),
    ...brands.flatMap((brand) => entry(`/products?brand=${brand.slug}`, 0.5, 'weekly')),
    ...products.flatMap((product) =>
      entry(`/products/${product.slugEn}`, 0.8, 'weekly', product.updatedAt),
    ),
  ];
}
