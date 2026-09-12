'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, ShoppingBag } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { addToCartAction } from '../actions';
import { announceCartChanged } from '../cart-events';

/**
 * The only "add to cart" control in the storefront.
 *
 * One component rather than one per surface (product page, mobile bar, a
 * future rail) so the pending state, the error handling and the confirmation
 * all behave identically wherever a customer taps.
 *
 * It shows a confirmation in place instead of navigating to the cart: on a
 * phone, being thrown out of the product page after adding an accessory is how
 * a two-item order becomes a one-item order.
 */
export function AddToCartButton({
  variantId,
  disabled,
  label,
  size = 'lg',
  variant = 'primary',
  block = true,
  className,
  /**
   * Where to go once the line is added. Omitted, the customer stays put and
   * sees a confirmation — that is what "add to cart" means. Set to /cart, the
   * same component becomes "buy now": it still adds the line, so a shopper who
   * taps it never loses what was already in their cart.
   */
  redirectTo,
}: {
  variantId: string | null;
  disabled?: boolean;
  label: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  block?: boolean;
  className?: string;
  redirectTo?: '/cart' | '/checkout';
}) {
  const t = useTranslations('cart');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const add = () => {
    if (!variantId) return;
    setErrorKey(null);

    startTransition(async () => {
      const result = await addToCartAction({ variantId, quantity: 1 });
      if (!result.ok) {
        setErrorKey(result.errorKey ?? 'actionFailed');
        return;
      }
      announceCartChanged();
      if (redirectTo) {
        router.push(redirectTo);
        return;
      }
      setAdded(true);
      // Revert after a few seconds so the button is ready for the next add
      // rather than stuck on a stale "added" state.
      setTimeout(() => setAdded(false), 4000);
    });
  };

  return (
    <div className={block ? 'w-full' : undefined}>
      <Button
        type="button"
        size={size}
        variant={added ? 'secondary' : variant}
        block={block}
        className={className}
        disabled={disabled || pending || !variantId}
        onClick={add}
        // Screen readers get the outcome, not just a visual tick.
        aria-live="polite"
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : added ? (
          <Check aria-hidden />
        ) : (
          <ShoppingBag aria-hidden />
        )}
        {added ? t('itemAdded') : label}
      </Button>

      {added && (
        <Link
          href="/cart"
          className="mt-2 block text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('viewCart')}
        </Link>
      )}

      {errorKey && (
        <p role="alert" className="mt-2 text-center text-sm text-danger">
          {t(errorKey)}
        </p>
      )}
    </div>
  );
}
