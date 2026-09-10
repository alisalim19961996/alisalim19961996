import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // IQD has no fractional unit in practice, so money is always whole dinars.
    formats: {
      number: {
        currency: {
          style: 'currency',
          currency: 'IQD',
          maximumFractionDigits: 0,
        },
      },
    },
  };
});
