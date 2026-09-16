import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SettingsForm } from '@/features/admin/components/settings-form';
import { getSiteSettings } from '@/server/services/admin-settings';
import { isAdmin } from '@/server/auth/guards';
import { getCurrentUser } from '@/server/auth/guards';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('settings'), robots: { index: false, follow: false } };
}

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const [user, settings] = await Promise.all([getCurrentUser(), getSiteSettings()]);

  // STAFF can read these, only ADMIN can change them — the service enforces it,
  // so this is only about not showing a form that will be refused.
  if (!isAdmin(user)) {
    return (
      <div className="rounded-card border border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted">{t('adminOnly')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">{t('settings')}</h1>
        <p className="mt-1 text-sm text-muted">{t('settingsHint')}</p>
      </div>

      <SettingsForm
        values={{
          storeNameAr: settings?.storeNameAr ?? '',
          storeNameEn: settings?.storeNameEn ?? '',
          contactPhone: settings?.contactPhone ?? '',
          whatsappNumber: settings?.whatsappNumber ?? '',
          contactEmail: settings?.contactEmail ?? '',
          defaultDeliveryIqd: settings?.defaultDeliveryIqd ?? 5000,
          freeDeliveryOverIqd: settings?.freeDeliveryOverIqd ?? null,
          warrantyNoteAr: settings?.warrantyNoteAr ?? '',
          warrantyNoteEn: settings?.warrantyNoteEn ?? '',
        }}
      />
    </div>
  );
}
