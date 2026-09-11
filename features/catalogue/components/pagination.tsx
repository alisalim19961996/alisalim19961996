import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buildCatalogueQuery } from '@/schemas/catalogue';
import { cn } from '@/lib/utils';

/**
 * Pagination.
 *
 * Real <Link> elements, not buttons: each page is a distinct URL a crawler can
 * follow and a shopper can share, which is the whole reason catalogue state
 * lives in the query string.
 *
 * Direction icons are mirrored in RTL — "next" points left in Arabic.
 */
export async function Pagination({
  page,
  pageCount,
  searchParams,
}: {
  page: number;
  pageCount: number;
  searchParams: URLSearchParams;
}) {
  if (pageCount <= 1) return null;

  const t = await getTranslations('common');

  const href = (target: number) =>
    `/products${buildCatalogueQuery(searchParams, { page: String(target) })}`;

  return (
    <nav
      aria-label={t('pagination')}
      className="mt-10 flex items-center justify-center gap-1"
    >
      <PageArrow
        href={href(page - 1)}
        disabled={page <= 1}
        label={t('previous')}
        direction="prev"
      />

      {pageWindow(page, pageCount).map((entry, index) =>
        entry === 'gap' ? (
          <span key={`gap-${index}`} className="px-2 text-subtle">
            …
          </span>
        ) : (
          <Link
            key={entry}
            href={href(entry)}
            aria-current={entry === page ? 'page' : undefined}
            className={cn(
              'grid h-9 min-w-9 place-items-center rounded-[--radius-control] px-2 text-sm numeric transition-colors',
              entry === page
                ? 'bg-ink font-semibold text-white'
                : 'text-ink hover:bg-canvas',
            )}
          >
            {entry}
          </Link>
        ),
      )}

      <PageArrow
        href={href(page + 1)}
        disabled={page >= pageCount}
        label={t('next')}
        direction="next"
      />
    </nav>
  );
}

function PageArrow({
  href,
  disabled,
  label,
  direction,
}: {
  href: string;
  disabled: boolean;
  label: string;
  direction: 'prev' | 'next';
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  const className = cn(
    'grid size-9 place-items-center rounded-[--radius-control] transition-colors',
    disabled ? 'pointer-events-none text-border-strong' : 'text-ink hover:bg-canvas',
  );

  if (disabled) {
    return (
      <span className={className} aria-hidden="true">
        <Icon className="size-4 flip-rtl" />
      </span>
    );
  }

  return (
    <Link href={href} aria-label={label} className={className}>
      <Icon className="size-4 flip-rtl" />
    </Link>
  );
}

/**
 * Page numbers to render: always the first and last, the current page and its
 * neighbours, with gaps between. Rendering all 40 pages of a large catalogue
 * would push the grid off screen on a phone.
 */
function pageWindow(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, pageCount, page]);
  if (page - 1 > 1) pages.add(page - 1);
  if (page + 1 < pageCount) pages.add(page + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const output: Array<number | 'gap'> = [];

  for (const [index, value] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous != null && value - previous > 1) output.push('gap');
    output.push(value);
  }

  return output;
}
