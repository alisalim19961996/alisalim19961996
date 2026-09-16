'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { deleteProductAction, setProductPublishedAction } from '../actions';

/**
 * The two destructive-ish controls, kept apart on purpose.
 *
 * Publishing is the reversible one and lives on every row, one click away.
 * Deleting is not reversible, is refused outright once a product has been
 * sold, and therefore lives only inside the product it would delete — behind a
 * confirmation that names what is about to go.
 */

export function ProductPublishToggle({
  id,
  isPublished,
}: {
  id: string;
  isPublished: boolean;
}) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      title={isPublished ? t('unpublish') : t('publish')}
      onClick={() =>
        startTransition(async () => {
          await setProductPublishedAction({ id, isPublished: !isPublished });
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : isPublished ? (
        <EyeOff aria-hidden />
      ) : (
        <Eye aria-hidden />
      )}
      <span className="sr-only sm:not-sr-only">
        {isPublished ? t('unpublish') : t('publish')}
      </span>
    </Button>
  );
}

export function ProductDeleteButton({
  id,
  productName,
  /** True once any variant appears on an order, which makes deletion refusable. */
  hasOrders,
}: {
  id: string;
  productName: string;
  hasOrders: boolean;
}) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  if (hasOrders) {
    // Stated up front rather than after a failed click: the owner needs to
    // know that unpublishing is the move, not that the button is broken.
    return <p className="text-xs text-muted">{t('productHasOrders')}</p>;
  }

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t('confirmDelete', { name: productName }))) return;
          startTransition(async () => {
            const result = await deleteProductAction(id);
            if (result.ok) {
              router.push('/admin/products');
              return;
            }
            setErrorKey(result.errorKey ?? 'actionFailed');
          });
        }}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Trash2 aria-hidden />
        )}
        {t('deleteProduct')}
      </Button>
      {errorKey && (
        <p role="alert" className="text-xs text-danger">
          {t(errorKey)}
        </p>
      )}
    </div>
  );
}

/**
 * Delete straight from the list.
 *
 * The same rule as the full control on the edit page — a sold product is never
 * deletable — but stated as a disabled button with a reason rather than an
 * absent one, so a row that cannot be deleted does not read as a missing
 * feature. The service refuses it again regardless; this is manners, not
 * protection (CLAUDE.md §7).
 */
export function ProductRowDelete({
  id,
  productName,
  hasOrders,
}: {
  id: string;
  productName: string;
  hasOrders: boolean;
}) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  if (hasOrders) {
    return (
      <span
        title={t('productHasOrders')}
        aria-label={t('productHasOrders')}
        className="grid size-9 cursor-not-allowed place-items-center text-subtle"
      >
        <Trash2 className="size-4" aria-hidden />
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      title={errorKey ? t(errorKey) : t('deleteProduct')}
      aria-label={t('deleteProduct')}
      className={cn(
        'grid size-9 place-items-center rounded-control transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50',
        // A failed delete stays visible on the row rather than vanishing with
        // the click: the title carries the reason, the colour carries that
        // there is one. `aria-invalid` is not valid on a button.
        errorKey ? 'text-danger' : 'text-muted',
      )}
      onClick={() => {
        if (!window.confirm(t('confirmDelete', { name: productName }))) return;
        setErrorKey(null);
        startTransition(async () => {
          const result = await deleteProductAction(id);
          if (result.ok) {
            router.refresh();
            return;
          }
          setErrorKey(result.errorKey ?? 'actionFailed');
        });
      }}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="size-4" aria-hidden />
      )}
    </button>
  );
}
