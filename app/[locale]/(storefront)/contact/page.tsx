import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buildAlternates } from '@/lib/seo';
import { formatIraqiPhone, toWhatsappNumber } from '@/lib/phone';
import { getPublicSiteSettings } from '@/server/queries/site';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
  return {
    title: t('title'),
    description: t('intro'),
    alternates: buildAlternates('/contact', locale),
  };
}

/**
 * How to reach the shop — read from `SiteSetting`, never written here.
 *
 * Every channel is optional because the row genuinely starts empty, and a
 * `tel:` link to nothing is worse than a line saying the number is not
 * published yet: the first wastes a customer's time and looks broken, the
 * second sends them to the one channel that always works — the order tracking
 * page, which needs no phone call at all.
 *
 * Contact details are commercial data (§13.13). Hard-coding one here would put
 * it beyond the owner's reach and make the settings screen a lie.
 */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('contact');
  const settings = await getPublicSiteSettings();

  /*
    A number the owner typed as "07701234567" has to become wa.me/964770...
    and display as "0770 123 4567". `toWhatsappNumber` returns null for
    anything that is not a real Iraqi number, so a typo in the settings
    screen renders no link rather than a dead one.
  */
  const whatsappDigits = settings?.whatsappNumber
    ? toWhatsappNumber(settings.whatsappNumber)
    : null;

  const channels = [
    settings?.contactPhone && {
      key: 'phone',
      icon: <Phone aria-hidden />,
      label: t('phone'),
      value: formatIraqiPhone(settings.contactPhone),
      href: `tel:${settings.contactPhone}`,
    },
    whatsappDigits && {
      key: 'whatsapp',
      icon: <MessageCircle aria-hidden />,
      label: t('whatsapp'),
      value: formatIraqiPhone(settings?.whatsappNumber ?? ''),
      href: `https://wa.me/${whatsappDigits}`,
    },
    settings?.contactEmail && {
      key: 'email',
      icon: <Mail aria-hidden />,
      label: t('email'),
      value: settings.contactEmail,
      href: `mailto:${settings.contactEmail}`,
    },
  ].filter((channel) => channel !== null && channel !== undefined && channel !== '');

  const warranty =
    locale === 'ar' ? settings?.warrantyNoteAr : settings?.warrantyNoteEn;

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        {t('intro')}
      </p>

      {channels.length > 0 ? (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <li key={channel.key} className="flex">
              <a
                href={channel.href}
                className="flex w-full items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                {...(channel.key === 'whatsapp'
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary [&_svg]:size-5">
                  {channel.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted">{channel.label}</span>
                  <span className="block truncate text-sm font-medium text-ink numeric">
                    {channel.value}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-card border border-border bg-surface p-6 text-sm text-muted">
          {t('noChannels')}
        </p>
      )}

      <section className="mt-10 rounded-card border border-border bg-surface p-6">
        <h2 className="text-lg font-bold text-ink">{t('orderQuestion')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('orderAnswer')}</p>
        <Link
          href="/track"
          className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
        >
          {t('trackCta')}
        </Link>
      </section>

      {warranty && (
        <section className="mt-6 rounded-card border border-border bg-surface p-6">
          <h2 className="text-lg font-bold text-ink">{t('warranty')}</h2>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-muted">
            {warranty}
          </p>
        </section>
      )}
    </div>
  );
}
