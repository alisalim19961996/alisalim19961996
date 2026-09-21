'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatIqd } from '@/lib/money';
import type { Locale } from '@/i18n/routing';
import { updateDeliveryRateAction } from '../actions';

export interface DeliveryRateRow {
  governorate: string;
  feeIqd: number;
  etaMinDays: number;
  etaMaxDays: number;
  isActive: boolean;
}

/**
 * Delivery pricing for all 19 governorates.
 *
 * Each row saves on its own. A single "save everything" button would make
 * changing one fee a nineteen-row write, and one validation error would block
 * the other eighteen — on the screen the owner will touch most often.
 *
 * A governorate with no row is not an error: checkout falls back to the
 * default fee. That is why the server upserts.
 *
 * The tick used to be labelled "active", which reads as "we deliver here".
 * It has never meant that: `quoteDeliveryFor` looks for an ACTIVE rate and
 * falls back to the default fee when it finds none, so unticking a governorate
 * changes its price and nothing else. The label says that now, and the default
 * it falls back to is shown rather than left to be discovered on an order.
 * Switching a governorate off entirely would be a new column and a new refusal
 * at checkout — a business decision, not a rename.
 *
 * A row that has been edited and not saved says so. Nineteen rows that all
 * look identical whether or not they hold unsaved work is how a fee gets
 * changed, forgotten, and discovered on an order.
 */
export function DeliveryRatesTable({
  governorates,
  rates,
  defaultDeliveryIqd,
}: {
  governorates: readonly string[];
  rates: readonly DeliveryRateRow[];
  /** What an unticked governorate is actually charged. */
  defaultDeliveryIqd: number;
}) {
  const t = useTranslations('admin');
  const tGov = useTranslations('governorate');
  const locale = useLocale() as Locale;

  const byGovernorate = new Map(rates.map((rate) => [rate.governorate, rate]));

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="border-b border-border">
          <tr className="text-xs text-muted">
            <th scope="col" className="px-4 py-2.5 text-start font-medium">
              {t('governorate')}
            </th>
            <th scope="col" className="px-4 py-2.5 text-start font-medium">
              {t('deliveryFee')}
            </th>
            <th scope="col" className="px-4 py-2.5 text-start font-medium">
              {t('etaDays')}
            </th>
            <th scope="col" className="px-4 py-2.5 text-start font-medium">
              <span
                title={t('deliveryCustomRateHint', {
                  fee: formatIqd(defaultDeliveryIqd, locale),
                })}
              >
                {t('deliveryCustomRate')}
              </span>
            </th>
            <th scope="col" className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {governorates.map((governorate) => (
            <RateRow
              key={governorate}
              governorate={governorate}
              label={tGov(governorate)}
              rate={byGovernorate.get(governorate)}
              defaultDeliveryIqd={defaultDeliveryIqd}
              locale={locale}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RateRow({
  governorate,
  label,
  rate,
  defaultDeliveryIqd,
  locale,
}: {
  governorate: string;
  label: string;
  rate?: DeliveryRateRow;
  defaultDeliveryIqd: number;
  locale: Locale;
}) {
  const t = useTranslations('admin');

  const [feeIqd, setFeeIqd] = useState(String(rate?.feeIqd ?? ''));
  const [etaMinDays, setEtaMinDays] = useState(String(rate?.etaMinDays ?? 1));
  const [etaMaxDays, setEtaMaxDays] = useState(String(rate?.etaMaxDays ?? 3));
  const [isActive, setIsActive] = useState(rate?.isActive ?? true);

  /**
   * What is on screen against what is in the database.
   *
   * Compared as strings because that is what the inputs hold; the saved values
   * are stringified the same way they were when the state was seeded, so a row
   * nobody touched is never dirty and a row edited back to its original value
   * correctly stops being.
   */
  const dirty =
    feeIqd !== String(rate?.feeIqd ?? '') ||
    etaMinDays !== String(rate?.etaMinDays ?? 1) ||
    etaMaxDays !== String(rate?.etaMaxDays ?? 3) ||
    isActive !== (rate?.isActive ?? true);

  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const save = () => {
    setErrorKey(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateDeliveryRateAction({
        governorate,
        feeIqd,
        etaMinDays,
        etaMaxDays,
        isActive,
      });
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setErrorKey(result.errorKey ?? 'actionFailed');
      }
    });
  };

  return (
    <tr className={rate ? undefined : 'bg-canvas/50'}>
      <td className="px-4 py-2.5">
        <span className="text-ink">{label}</span>
        {!rate && <p className="text-xs text-subtle">{t('usesDefaultFee')}</p>}
        {dirty && <p className="text-xs font-medium text-warning">{t('unsavedRow')}</p>}
      </td>
      <td className="px-4 py-2.5">
        <Input
          value={feeIqd}
          onChange={(event) => setFeeIqd(event.target.value)}
          inputMode="numeric"
          /*
            The default is the placeholder, not the value: an empty box is
            refused by the server rather than saved as free delivery, and
            showing what the row falls back to is what makes the refusal
            obvious instead of mysterious.
          */
          placeholder={formatIqd(defaultDeliveryIqd, locale)}
          aria-label={`${t('deliveryFee')} — ${label}`}
          className="h-9 w-28 numeric"
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1">
          <Input
            value={etaMinDays}
            onChange={(event) => setEtaMinDays(event.target.value)}
            inputMode="numeric"
            aria-label={`${t('etaMin')} — ${label}`}
            className="h-9 w-14 numeric"
          />
          <span className="text-subtle">–</span>
          <Input
            value={etaMaxDays}
            onChange={(event) => setEtaMaxDays(event.target.value)}
            inputMode="numeric"
            aria-label={`${t('etaMax')} — ${label}`}
            className="h-9 w-14 numeric"
          />
        </div>
      </td>
      <td className="px-4 py-2.5">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          aria-label={`${t('deliveryCustomRate')} — ${label}`}
          className="size-4 accent-primary"
        />
      </td>
      <td className="px-4 py-2.5 text-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || !dirty}
          onClick={save}
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : saved ? (
            <Check className="text-success" aria-hidden />
          ) : null}
          {saved ? t('saved') : t('save')}
        </Button>
        {errorKey && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {t(errorKey)}
          </p>
        )}
      </td>
    </tr>
  );
}
