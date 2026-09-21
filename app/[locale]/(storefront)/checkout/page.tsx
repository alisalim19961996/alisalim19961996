import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { CheckoutForm } from '@/features/checkout/components/checkout-form';
import { findCart } from '@/server/services/cart';
import { getCartView } from '@/server/queries/cart';
import { getCurrentUser } from '@/server/auth/guards';
import { getMyDeliveryAddress } from '@/server/queries/account';
import { quoteDeliveryFor } from '@/server/services/order';
import { formatIraqiPhone } from '@/lib/phone';
import { GOVERNORATE_VALUES } from '@/schemas/checkout';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'checkout' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('checkout');

  const cart = await findCart();
  const { lines, subtotalIqd, hasBlockedLine } = await getCartView(
    cart?.id ?? null,
    locale,
  );

  // Nothing to buy, or something in the cart can no longer be bought: send the
  // customer back rather than letting them fill in six fields and fail at the
  // end. The order service refuses these cases too — this is the courteous
  // half of the same rule.
  if (lines.length === 0 || hasBlockedLine) {
    redirect({ href: '/cart', locale });
  }

  /*
    A signed-in customer's saved address fills the form in. The quote for it is
    computed here, on the server, rather than fetched after hydration: without
    it the submit button would stay disabled until the customer touched a
    governorate select that was already correct. A guest has neither, and the
    page is dynamic for the cart anyway, so this costs no static page.
  */
  const user = await getCurrentUser();
  const saved = user ? await getMyDeliveryAddress() : null;
  const initialQuote = saved
    ? await quoteDeliveryFor(saved.governorate, subtotalIqd)
    : null;

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>

      <div className="mt-8">
        <CheckoutForm
          governorates={GOVERNORATE_VALUES}
          subtotalIqd={subtotalIqd}
          defaults={
            saved
              ? {
                  fullName: saved.fullName,
                  phone: formatIraqiPhone(saved.phone),
                  governorate: saved.governorate,
                  city: saved.city,
                  addressLine: saved.addressLine,
                  notes: saved.notes ?? '',
                }
              : null
          }
          initialQuote={initialQuote}
        />
      </div>
    </div>
  );
}
