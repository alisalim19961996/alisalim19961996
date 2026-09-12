'use client';

import { useTransition } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { MAX_LINE_QUANTITY } from '@/lib/domain/cart';
import { ProductPrice } from '@/features/product/components/product-price';
import type { CartLine } from '@/server/queries/cart';
import { removeCartItemAction, updateCartItemAction } from '../actions';
import { announceCartChanged } from '../cart-events';

/**
 * The cart's line items.
 *
 * A client component because quantity is the one thing a customer fiddles
 * with, and a full page reload per tap would make the cart feel broken. The
 * server still owns the outcome: each tap calls an action, the action
 * re-validates against stock, and the page re-renders from the database.
 *
 * Quantities are never edited optimistically. Showing 3 when the server
 * accepted 2 would mean the customer reads one total and pays another.
 */
export function CartLines({ lines }: { lines: readonly CartLine[] }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {lines.map((line) => (
        <CartLineRow key={line.variantId} line={line} />
      ))}
    </ul>
  );
}

function CartLineRow({ line }: { line: CartLine }) {
  const t = useTranslations('cart');
  const [pending, startTransition] = useTransition();

  const blocked =
    line.availability.kind !== 'available' && line.availability.kind !== 'preorder';

  const setQuantity = (quantity: number) => {
    if (quantity < 1 || quantity > MAX_LINE_QUANTITY) return;
    startTransition(async () => {
      await updateCartItemAction({ variantId: line.variantId, quantity });
      announceCartChanged();
    });
  };

  const remove = () => {
    startTransition(async () => {
      await removeCartItemAction({ variantId: line.variantId });
      announceCartChanged();
    });
  };

  return (
    <li className={cn('flex gap-4 py-5', pending && 'opacity-60')}>
      <Link
        href={`/products/${line.productSlug}`}
        className="relative aspect-product w-20 shrink-0 overflow-hidden rounded-[--radius-card] bg-canvas sm:w-24"
      >
        {line.imageUrl && (
          <Image
            src={line.imageUrl}
            alt={line.name}
            fill
            sizes="96px"
            className="object-cover"
          />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">{line.brandName}</p>
            <Link
              href={`/products/${line.productSlug}`}
              className="block truncate text-sm font-semibold text-ink hover:text-primary"
            >
              {line.name}
            </Link>
            <p className="mt-0.5 text-xs text-muted numeric">{line.variantLabel}</p>
          </div>

          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label={t('remove')}
            className="grid size-9 shrink-0 place-items-center rounded-[--radius-control] text-muted transition-colors hover:bg-canvas hover:text-danger"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
          </button>
        </div>

        {blocked && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {t('lineUnavailable')}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex items-center rounded-[--radius-control] border border-border"
            role="group"
            aria-label={t('quantity')}
          >
            <QuantityButton
              onClick={() => setQuantity(line.quantity - 1)}
              disabled={pending || line.quantity <= 1}
              label={t('decrease')}
            >
              <Minus className="size-4" aria-hidden />
            </QuantityButton>

            <span className="min-w-10 text-center text-sm font-semibold text-ink numeric">
              {line.quantity}
            </span>

            <QuantityButton
              onClick={() => setQuantity(line.quantity + 1)}
              disabled={pending || line.quantity >= MAX_LINE_QUANTITY || blocked}
              label={t('increase')}
            >
              <Plus className="size-4" aria-hidden />
            </QuantityButton>
          </div>

          {/*
            The line total, not the unit price: the stepper immediately to its
            left already says how many, and showing both invites the customer
            to work out which number they are about to be charged.
          */}
          <ProductPrice priceIqd={line.lineTotalIqd} comparePriceIqd={null} size="sm" />
        </div>
      </div>
    </li>
  );
}

function QuantityButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-10 place-items-center text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
