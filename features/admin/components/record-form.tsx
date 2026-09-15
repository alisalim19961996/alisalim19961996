'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Save, Trash2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { AdminActionResult } from '../actions';

/**
 * The frame every single-record admin form sits in: submit, save state,
 * errors, delete.
 *
 * Six forms — brand, category, product type, attribute, buying guide, coupon —
 * all save the same way and fail the same way, and writing that six times is
 * how one of them ends up swallowing an error or leaving the button spinning. The
 * forms supply their fields and their values; this owns everything around
 * them.
 *
 * It was called `TaxonomyForm` while the four it framed were all taxonomy. The
 * guide editor is not, so the name moved rather than the meaning quietly
 * widening underneath it.
 *
 * `errorKey` rather than a sentence, always: the message is looked up in
 * `messages/*.json` so the owner reads it in their own language (§11).
 */

export interface AdminRecordFormProps {
  title: string;
  /** Absent when creating. Present enables the delete control. */
  id?: string;
  /** What the row is called, for the delete confirmation. */
  name?: string;
  listHref:
    | '/admin/brands'
    | '/admin/categories'
    | '/admin/product-types'
    | '/admin/attributes'
    | '/admin/blog'
    | '/admin/coupons';
  save: () => Promise<AdminActionResult>;
  remove?: () => Promise<AdminActionResult>;
  /** Shown instead of the delete button when the row cannot be removed. */
  deleteBlockedReason?: string;
  children: ReactNode;
}

export function AdminRecordForm({
  title,
  id,
  name,
  listHref,
  save,
  remove,
  deleteBlockedReason,
  children,
}: AdminRecordFormProps) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorKey(null);
    setSaved(false);

    startTransition(async () => {
      const result = await save();
      if (!result.ok) {
        setErrorKey(result.errorKey ?? 'actionFailed');
        setErrorField(result.field);
        return;
      }
      setSaved(true);
      // Back to the list on create, stay put on edit: after adding a brand the
      // next thing is almost always adding another, and after correcting one
      // it is checking the correction.
      if (id) router.refresh();
      else router.push(listHref);
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.push(listHref)}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : saved ? (
              <Check aria-hidden />
            ) : (
              <Save aria-hidden />
            )}
            {t('save')}
          </Button>
        </div>
      </div>

      {errorKey && (
        <p
          role="alert"
          className="rounded-[--radius-control] bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {t(errorKey)}
          {errorField && <span className="ms-1 opacity-80">({errorField})</span>}
        </p>
      )}

      {children}

      {id && remove && (
        <section className="rounded-[--radius-card] border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">{t('dangerZone')}</h2>
          {deleteBlockedReason ? (
            /*
              The reason, not a missing button. A control that is simply absent
              reads as a feature nobody built; one that explains itself tells
              the owner what to do instead — here, deactivate.
            */
            <p className="mt-2 text-xs text-muted">{deleteBlockedReason}</p>
          ) : (
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="mt-3"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t('confirmDelete', { name: name ?? '' }))) return;
                setErrorKey(null);
                startTransition(async () => {
                  const result = await remove();
                  if (result.ok) {
                    router.push(listHref);
                    return;
                  }
                  setErrorKey(result.errorKey ?? 'actionFailed');
                  setErrorField(result.field);
                });
              }}
            >
              <Trash2 aria-hidden />
              {t('delete')}
            </Button>
          )}
        </section>
      )}
    </form>
  );
}
