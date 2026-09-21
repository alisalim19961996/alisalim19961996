import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buildAlternates, jsonLdScript } from '@/lib/seo';
import { publicEnv } from '@/config/env';
import { getGuide, getGuideSlugs } from '@/server/queries/blog';
import { routing, type Locale } from '@/i18n/routing';
import { dateFormatter } from '@/lib/datetime';

/**
 * One buying guide.
 *
 * The body arrives as blocks, already parsed on the server
 * (`lib/domain/blog.ts`), and is rendered as React elements. There is no
 * `dangerouslySetInnerHTML` anywhere on this page and no Markdown library
 * behind it: what the owner typed is text, so a pasted `<script>` is a
 * sentence rather than something the Content-Security-Policy has to argue
 * about (§18).
 */

export async function generateStaticParams() {
  const slugs = await getGuideSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const guide = await getGuide(slug, locale);

  if (!guide) return { title: slug };

  return {
    title: guide.metaTitle ?? guide.title,
    description: guide.metaDescription ?? guide.excerpt,
    alternates: buildAlternates(`/guides/${slug}`, locale),
    openGraph: {
      title: guide.metaTitle ?? guide.title,
      description: guide.metaDescription ?? guide.excerpt,
      type: 'article',
      publishedTime: guide.publishedAt.toISOString(),
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [guide, t] = await Promise.all([
    getGuide(slug, locale),
    getTranslations('guides'),
  ]);

  // A draft, a future publication date, or a slug that never existed all land
  // here — and all answer the same way. Distinguishing them would tell a
  // visitor which articles the owner has not finished yet.
  if (!guide) notFound();

  const dateFormat = dateFormatter(locale, 'long');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.excerpt,
    datePublished: guide.publishedAt.toISOString(),
    ...(guide.authorName
      ? { author: { '@type': 'Person', name: guide.authorName } }
      : {}),
    mainEntityOfPage: `${publicEnv.NEXT_PUBLIC_APP_URL}/${locale}/guides/${guide.slug}`,
  };

  return (
    <div className="container-page py-8 sm:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <Link
        href="/guides"
        className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
      >
        <ChevronLeft className="size-3 flip-rtl" aria-hidden />
        {t('title')}
      </Link>

      <article className="mt-4 max-w-prose">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{guide.title}</h1>

        <p className="mt-2 text-xs text-muted">
          <span className="numeric">{dateFormat.format(guide.publishedAt)}</span>
          {guide.authorName && <span className="ms-2">· {guide.authorName}</span>}
        </p>

        <div className="mt-8 space-y-5">
          {guide.blocks.map((block, index) => {
            if (block.kind === 'heading') {
              return (
                <h2 key={index} className="pt-3 text-lg font-semibold text-ink">
                  {block.text}
                </h2>
              );
            }

            if (block.kind === 'list') {
              return (
                <ul key={index} className="list-disc space-y-1.5 ps-5 text-ink-soft">
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              );
            }

            return (
              <p key={index} className="leading-relaxed text-ink-soft">
                {block.text}
              </p>
            );
          })}
        </div>
      </article>
    </div>
  );
}
