import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatIqd } from '@/lib/money';
import { getAdminCoupons } from '@/server/queries/admin-coupons';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('coupons'), robots: { index: false, follow: false } };
}

/**
 * The discount codes, with their use against their limit.
 *
 * "43" tells the owner nothing. "43 / 50" tells them the campaign is nearly
 * over, which is the only question this screen exists to answer at a glance.
 */
export default async function AdminCouponsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const coupons = await getAdminCoupons();

  const dateFormat = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ' : 'en-GB', {
    dateStyle: 'medium',
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t('coupons')}</h1>
          <p className="text-sm text-muted numeric">{coupons.length}</p>
        </div>
        <Button asChild>
          <Link href="/admin/coupons/new">
            <Plus aria-hidden />
            {t('newCoupon')}
          </Link>
        </Button>
      </div>

      <p className="max-w-prose text-sm text-muted">{t('couponsHint')}</p>

      {coupons.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted">
          {t('noCoupons')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[42rem] text-start text-sm">
            <thead className="border-b border-border">
              <tr className="text-xs text-muted">
                <th className="px-4 py-3 text-start font-medium">{t('couponCode')}</th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('couponDiscountType')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('couponUsageCount')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('couponEndsAt')}
                </th>
                <th className="px-4 py-3 text-end font-medium">{t('status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/coupons/${coupon.id}`}
                      className="font-medium text-ink numeric hover:text-primary"
                    >
                      {coupon.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted numeric">
                    {coupon.discountType === 'PERCENTAGE'
                      ? `${coupon.discountValue}%`
                      : formatIqd(coupon.discountValue, locale)}
                  </td>
                  <td className="px-4 py-3 text-muted numeric">
                    {coupon.usageLimit == null
                      ? coupon.usageCount
                      : `${coupon.usageCount} / ${coupon.usageLimit}`}
                  </td>
                  <td className="px-4 py-3 text-muted numeric">
                    {dateFormat.format(coupon.endsAt)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Badge variant={coupon.isActive ? 'success' : 'neutral'}>
                      {coupon.isActive ? t('couponActive') : t('couponInactive')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
