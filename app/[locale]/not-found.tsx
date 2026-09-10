import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export default async function LocaleNotFound() {
  const t = await getTranslations('error');

  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-20 text-center">
      <div className="max-w-md">
        <p className="text-5xl font-bold text-primary numeric">404</p>
        <h1 className="mt-4 text-2xl font-bold text-ink">{t('notFoundTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t('notFoundMessage')}
        </p>
        <Button className="mt-8" asChild>
          <Link href="/">{t('backHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
