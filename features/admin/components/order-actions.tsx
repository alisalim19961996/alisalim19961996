'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { advanceOrderAction } from '../actions';

/**
 * The buttons that move an order along.
 *
 * `nextStatuses` is computed on the server from the state machine, so this
 * component cannot offer an illegal move — and the service re-validates the
 * transition anyway, because these buttons are not what makes it safe.
 *
 * Cancelling asks for a reason before it will submit. A cancelled order with
 * no explanation is a support call three days later, and the reason is written
 * into the timeline where the next person to open the order will see it.
 */
export function OrderActions({
  orderNumber,
  nextStatuses,
}: {
  orderNumber: string;
  nextStatuses: readonly string[];
}) {
  const t = useTranslations('admin');
  const tOrder = useTranslations('order');

  const [pending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState('');

  if (nextStatuses.length === 0) {
    return <p className="text-sm text-muted">{t('orderClosed')}</p>;
  }

  const submit = (toStatus: string, reason?: string) => {
    setErrorKey(null);
    startTransition(async () => {
      const result = await advanceOrderAction({
        orderNumber,
        toStatus,
        note: reason?.trim() || undefined,
      });
      if (result.ok) {
        setConfirming(null);
        setNote('');
      } else {
        setErrorKey(result.errorKey ?? 'actionFailed');
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((status) => {
          const destructive = status === 'CANCELLED' || status === 'RETURNED';
          return (
            <Button
              key={status}
              type="button"
              size="sm"
              variant={destructive ? 'outline' : 'primary'}
              disabled={pending}
              className={cn(destructive && 'text-danger')}
              onClick={() => (destructive ? setConfirming(status) : submit(status))}
            >
              {pending && !destructive && (
                <Loader2 className="animate-spin" aria-hidden />
              )}
              {tOrder(`status${status}`)}
            </Button>
          );
        })}
      </div>

      {confirming && (
        <div className="rounded-[--radius-card] border border-danger-soft bg-danger-soft p-4">
          <label htmlFor="cancel-note" className="text-sm font-medium text-ink">
            {t('reasonRequired')}
          </label>
          <textarea
            id="cancel-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-2 w-full rounded-[--radius-control] border border-border bg-surface px-3 py-2 text-sm text-ink"
          />
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={pending || note.trim().length === 0}
              onClick={() => submit(confirming, note)}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {t('confirm')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setConfirming(null);
                setNote('');
              }}
            >
              {t('back')}
            </Button>
          </div>
        </div>
      )}

      {errorKey && (
        <p role="alert" className="text-sm text-danger">
          {t(errorKey)}
        </p>
      )}
    </div>
  );
}
