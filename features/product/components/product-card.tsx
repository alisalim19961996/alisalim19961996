import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { ProductPrice } from './product-price';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';
import { CompareToggle } from '@/features/compare/components/compare-toggle';
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
 * Every extra control here is one more thing to scan before deciding, on an
 * element the shopper scans in under a second. The heart is the one exception,
 * and it earned it: a wishlist you can only fill from the detail page is a
 * wishlist nobody fills, because saving is something you do WHILE browsing.
 * It is drawn quietly, in the image's corner, where it competes with nothing.
 *
 * That control is why the card is no longer a `<Link>` wrapping everything. A
 * `<button>` inside an `<a>` is invalid HTML and breaks keyboard navigation, so
 * the link moved to the product name and stretches over the card with
 * `after:absolute after:inset-0`. The whole card is still one click; the heart
 * sits above it on `z-10`; and the accessible name of the link is still the
 * product's name rather than an aria-label standing in for it.
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

  /*
    The cheapest variant somebody can actually BUY sets the card's price — not
    simply the cheapest active one. A 128GB model that is out of stock beside
    a 256GB that is not would otherwise advertise a price the shopper cannot
    have, which is the same bait the `minPriceIqd` recompute refuses (§12).
    Falls back to the cheapest active variant when none is purchasable, where
    the card is already showing "out of stock" anyway.
  */
  const buyable = product.variants.filter((variant) =>
    variant.inventory
      ? ['available', 'preorder'].includes(getAvailability(variant.inventory).kind)
      : false,
  );
  const cheapest = buyable[0] ?? product.variants[0];

  /*
    "From" only when the variants genuinely differ in price. A product whose
    two colours cost the same is one price, and saying "from" about it reads as
    a shop hedging.
  */
  const priced = (buyable.length > 0 ? buyable : product.variants).map(
    (variant) => variant.priceIqd,
  );
  const startsFrom = priced.length > 1 && Math.min(...priced) !== Math.max(...priced);

  // A product is buyable if any of its variants is. Showing "out of stock" on a
  // card whose blue model is available would lose a sale that was there.
  const purchasable = buyable.length > 0;

  return (
    <article
      className={cn(
        // `w-full` is not decoration: the card sits inside `<li className="flex">`,
        // where a flex item defaults to `flex: 0 1 auto` and therefore sizes to
        // its own content. Without it every card was as wide as its product
        // name was long — and since the image box is `aspect-product`, a wider
        // card meant a taller image. Four cards in one row measured 209, 219,
        // 161 and 155 pixels across, with four different image heights, while
        // the grid columns underneath were a uniform 292px each.
        'group relative flex h-full w-full flex-col overflow-hidden rounded-[--radius-card] border border-border bg-surface',
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
            /*
              `contain`, not `cover`. A phone photographed upright in a 4:5
              frame is close to that ratio already, but a boxed accessory or a
              wide product is not, and `cover` was cutting the ends off the
              thing being sold. The padding keeps the device off the card's
              edge so it reads as a photograph rather than a crop.
            */
            className="object-contain p-3 transition-transform duration-300 group-hover:scale-[1.03]"
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

      {/*
        Tight on purpose. At five columns a card is 230px across, so an Arabic
        product name wraps to two lines and the text block was taller than it
        needed to be — 184px of a 469px card. The clamps and the smaller
        spacing keep every card the same height whatever the name's length,
        which is the property the grid depends on.
      */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-[10px] font-medium tracking-wide text-subtle uppercase">
          {brandName}
        </span>

        <h3 className="line-clamp-2 text-sm leading-tight font-semibold text-ink">
          {/*
            The link is here and stretches over the whole card. `after:z-0`
            keeps it under the heart, which carries z-10 — without an explicit
            layer the two overlap in DOM order and the heart stops being
            clickable on the half the link covers last.
          */}
          <Link
            href={`/products/${slug}`}
            className="after:absolute after:inset-0 after:z-0 after:content-['']"
          >
            {name}
          </Link>
        </h3>

        {tagline && <p className="line-clamp-1 text-xs text-muted">{tagline}</p>}

        {/*
          `mt-auto` pins the price to the bottom of the card through flex
          rather than by giving the card a fixed height — so a two-line Arabic
          name and a one-line English one still end their prices on the same
          baseline across a row.
        */}
        {cheapest && (
          <div className="mt-auto pt-1.5">
            {startsFrom && (
              <span className="block text-[10px] leading-none text-muted">
                {t('startingFrom')}
              </span>
            )}
            <ProductPrice
              priceIqd={cheapest.priceIqd}
              comparePriceIqd={cheapest.comparePriceIqd}
              size="sm"
              className={startsFrom ? 'mt-0.5' : undefined}
            />
          </div>
        )}
      </div>

      {/*
        Outside the text block and above the stretched link, so pressing either
        acts on the product instead of opening it. Stacked in one column in the
        image's corner: side by side they read as a pair of unrelated icons,
        and at 171px wide on a phone they would crowd the "new" badge.
      */}
      <div className="absolute end-2 top-2 z-10 flex flex-col gap-1.5">
        <WishlistButton productId={product.id} className="size-9" />
        <CompareToggle slug={slug} />
      </div>
    </article>
  );
}
