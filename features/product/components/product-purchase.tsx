'use client';

import { DeliveryEstimate } from './delivery-estimate';
import { MobileBuyBar } from './mobile-buy-bar';
import {
  useVariantSelection,
  VariantPicker,
  type PickerOption,
  type PickerVariant,
} from './variant-picker';

/**
 * The one client island on the product page, and the only thing that knows
 * which variant is selected.
 *
 * The picker and the mobile buy bar are two controls for one decision, and
 * they used to hold it separately: the picker kept its own state, and the page
 * handed the bar `product.variants[0]` — a value it called `cheapest` even
 * though that query orders by `sortOrder`. So a shopper who chose 256GB in Blue
 * scrolled down and added 128GB in Black at a different price, and a product
 * whose first variant happened to be sold out showed a permanently disabled bar
 * under a page that was selling perfectly well.
 *
 * The page stays a Server Component and stays prerendered: this component takes
 * plain serialisable props and the bar is `fixed`, so where it sits in the
 * markup does not matter.
 */
export function ProductPurchase({
  options,
  variants,
  name,
  governorates,
  warranty,
}: {
  options: PickerOption[];
  variants: PickerVariant[];
  /** For the bar's one line of context, since it scrolls past the heading. */
  name: string;
  governorates: readonly string[];
  /** Rendered here so warranty and delivery sit together, beside the price. */
  warranty: React.ReactNode;
}) {
  const selection = useVariantSelection(options, variants);
  const { selected, purchasable } = selection;

  return (
    <>
      <VariantPicker options={options} variants={variants} selection={selection} />

      {/*
        Warranty and delivery in one box, under the buttons. The box used to
        hold the warranty and the product's CATEGORY, which the breadcrumb
        already says two lines above and which nobody decides a purchase on.
        The estimate needs the selected variant's price, which only this
        component knows — which is why it renders here rather than in the page.
      */}
      <dl className="mt-2 grid gap-3 rounded-card border border-border bg-surface p-4 text-sm sm:grid-cols-2">
        {warranty}
        <DeliveryEstimate
          governorates={governorates}
          subtotalIqd={selected?.priceIqd ?? 0}
        />
      </dl>

      {selected && (
        <MobileBuyBar
          variantId={selected.id}
          priceIqd={selected.priceIqd}
          comparePriceIqd={selected.comparePriceIqd}
          name={name}
          // The same answer the buttons above it are using — one selection, one
          // availability, so the bar can never offer what the page refuses.
          purchasable={purchasable}
        />
      )}
    </>
  );
}
