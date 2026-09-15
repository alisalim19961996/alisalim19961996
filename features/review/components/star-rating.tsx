import { Star } from 'lucide-react';
import { MAX_RATING, starFill } from '@/lib/domain/review';
import { cn } from '@/lib/utils';

/**
 * Five stars, filled to an average.
 *
 * A server component: it has no interaction at all, and a product page shows
 * one of these per review. The partial star is a clipped overlay rather than a
 * half-star glyph, so 4.2 looks like 4.2 instead of rounding itself to 4.5 on
 * the way to the screen — the arithmetic is `starFill`, which is unit-tested.
 *
 * `start-0` and a logical inset, so the fill grows from the correct edge in
 * Arabic (§11). A `left: 0` here would fill every star from the wrong side.
 */
export function StarRating({
  average,
  size = 'md',
  className,
}: {
  average: number | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const fills = starFill(average);
  const star = size === 'sm' ? 'size-3.5' : 'size-4';

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-hidden>
      {fills.map((fill, index) => (
        <span key={index} className={cn('relative inline-block', star)}>
          <Star className={cn(star, 'absolute inset-0 text-border-strong')} />
          {fill > 0 && (
            <span
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${fill}%` }}
            >
              <Star className={cn(star, 'fill-warning text-warning')} />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/** The accessible half: "4.2 out of 5", read once instead of five star icons. */
export function ratingLabel(average: number | null, template: string): string {
  return average === null
    ? ''
    : template
        .replace('{rating}', String(average))
        .replace('{max}', String(MAX_RATING));
}
