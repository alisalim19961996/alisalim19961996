'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * The customer sees a plain sentence; the stack trace goes to the server log.
 * Technical detail is never rendered to a shopper (§47).
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error');

  useEffect(() => {
    console.error('[mps] unhandled route error', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-20 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('generic')}</p>
        <Button className="mt-8" onClick={reset}>
          {t('tryAgain')}
        </Button>
      </div>
    </div>
  );
}
