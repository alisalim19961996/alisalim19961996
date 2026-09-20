import { Check, Minus } from 'lucide-react';
import { KEY_FEATURES_SHOWN } from '@/config/ui';
import { cn } from '@/lib/utils';

/**
 * The product page's own content blocks.
 *
 * They lived at the bottom of `products/[slug]/page.tsx` until the page crossed
 * the 420-line guardrail — which is that rule doing its job: a route file that
 * long is holding presentation belonging beside the other product components.
 * Nothing here knows what a phone is; it renders whatever the owner typed.
 */

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function PointList({
  title,
  points,
  tone,
}: {
  title: string;
  points: string[];
  tone: 'pro' | 'con';
}) {
  if (points.length === 0) return null;
  const Icon = tone === 'pro' ? Check : Minus;

  return (
    <div>
      <h3 className="mb-2.5 text-sm font-semibold text-ink">{title}</h3>
      <ul className="space-y-2">
        {points.map((point) => (
          <li key={point} className="flex gap-2.5 text-sm leading-relaxed text-muted">
            <Icon
              className={cn(
                'mt-0.5 size-4 shrink-0',
                tone === 'pro' ? 'text-success' : 'text-warning',
              )}
              aria-hidden="true"
            />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The first few key features, beside the buy controls.
 *
 * The dashboard has always saved these and the page never showed them. Only
 * `KEY_FEATURES_SHOWN` of them: this sits above the fold on a phone, and the
 * rest of the decision — price, picker, button — has to stay reachable.
 */
export function KeyFeatureList({ features }: { features: readonly string[] }) {
  if (features.length === 0) return null;

  return (
    <ul className="mt-6 space-y-1.5">
      {features.slice(0, KEY_FEATURES_SHOWN).map((feature) => (
        <li key={feature} className="flex gap-2 text-sm text-ink-soft">
          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}
