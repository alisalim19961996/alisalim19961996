import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { ProductPrice } from './product-price';
import { getAvailability } from '@/lib/domain/availability';
import type { ProductCardData } from '@/server/queries/catalogue';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The product card.
 *
 * A Server Component: a catalogue page renders 24 of these, and shipping a
 * client component per card would mean 24 hydration roots for a card that has
 * no interactive state at all.
 *
 * Deliberately restrained — image, brand, name, one spec line, price, status.
 * Every extra control here (quick view, compare, wishlist) is one more thing to
 * scan before deciding, on an element the shopper scans in under a second.
 */
export async function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: ProductCardData;
  /** Set on the first row so the largest visible image is not lazy-loaded. */
  priority?: boolean;
  className?: string;
}) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('product');
  const isAr = locale === 'ar';

  const name = isAr ? product.nameAr : product.nameEn;
  const tagline = isAr ? product.taglineAr : product.taglineEn;
  const brandName = isAr ? product.brand.nameAr : product.brand.nameEn;
  const slug = product.slugEn;

  const image = product.images[0];
  // The cheapest active variant sets the card's price, which is also what
  // minPriceIqd is denormalised from.
  const cheapest = product.variants[0];

  // A product is buyable if any of its variants is. Showing "out of stock" on a
  // card whose blue model is available would lose a sale that was there.
  const purchasable = product.variants.some((variant) =>
    variant.inventory
      ? ['available', 'preorder'].includes(getAvailability(variant.inventory).kind)
      : false,
  );

  return (
    <Link
      href={`/products/${slug}`}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-[--radius-card] border border-border bg-surface',
        'transition-[border-color,box-shadow] duration-200 hover:border-border-strong hover:shadow-[--shadow-card]',
        className,
      )}
    >
      <div className="relative aspect-product overflow-hidden bg-canvas">
        {image ? (
          <Image
            src={image.url}
            alt={(isAr ? image.altAr : image.altEn) ?? name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center text-xs text-subtle">
            {brandName}
          </div>
        )}

        {product.isNewArrival && (
          <Badge variant="neutral" className="absolute start-3 top-3">
            {t('new')}
          </Badge>
        )}

        {/*
          Demo imagery has to be labelled, but it is a note to us, not a selling
          point — so it sits quietly in the far corner instead of competing with
          the product.
        */}
        {image?.isDemo && (
          <span className="absolute end-2 bottom-2 rounded bg-ink/55 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-white/90">
            DEMO
          </span>
        )}

        {!purchasable && (
          <div className="absolute inset-0 grid place-items-center bg-surface/70 backdrop-blur-[1px]">
            <span className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">
              {t('outOfStock')}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-[11px] font-medium tracking-wide text-subtle uppercase">
          {brandName}
        </span>

        <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-ink">
          {name}
        </h3>

        {tagline && <p className="line-clamp-1 text-xs text-muted">{tagline}</p>}

        {cheapest && (
          <ProductPrice
            priceIqd={cheapest.priceIqd}
            comparePriceIqd={cheapest.comparePriceIqd}
            size="sm"
            className="mt-auto pt-1"
          />
        )}
      </div>
    </Link>
  );
}
