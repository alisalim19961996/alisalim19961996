import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CouponForm } from '@/features/admin/components/coupon-form';
import { getCouponForEdit } from '@/server/queries/admin-coupons';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('editCoupon'), robots: { index: false, follow: false } };
}

export default async function EditCouponPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const coupon = await getCouponForEdit(id);
  if (!coupon) notFound();

  return <CouponForm coupon={coupon} />;
}
