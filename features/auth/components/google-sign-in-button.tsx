'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signIn } from '../auth-client';

/**
 * Continue with Google.
 *
 * Rendered only when the store has Google credentials configured — a button
 * that always ends on an error page is worse than no button at all.
 *
 * `lucide-react` ships no brand logos, so Google's mark lives in
 * `public/brand/google.svg` rather than inline. Its four colours belong to
 * Google and may not be restyled, which makes them neither design tokens nor
 * something to paste into a component — `tests/architecture.test.ts` refuses a
 * hex literal in a .tsx file, and it is right to. A brand asset is an asset.
 *
 * A plain `<img>`, not `next/image`: `dangerouslyAllowSVG` is off (CLAUDE.md
 * §18), and this file is ours, 1 KB, and needs no optimisation.
 */
export function GoogleSignInButton({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const start = () => {
    setErrorKey(null);
    startTransition(async () => {
      // Where the visitor ends up once Google hands them back. It goes through
      // the cart-claim route rather than straight to the page, so an OAuth
      // sign-in and a password sign-in leave the cart in the same state.
      const destination = redirectTo === 'admin' ? `/${locale}/admin` : `/${locale}`;
      const callbackURL = `/api/session/claim-cart?next=${encodeURIComponent(destination)}`;

      const { error } = await signIn.social({
        provider: 'google',
        callbackURL,
        // Failures come back here as ?error=<code> instead of better-auth's
        // own bare error page, so the customer reads an explanation in their
        // own language on the page they started from.
        errorCallbackURL: `/${locale}/sign-in`,
      });

      // Only reached when the redirect could not even be started.
      if (error) setErrorKey('googleUnavailable');
    });
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        block
        disabled={pending}
        onClick={start}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          // A brand asset, not product imagery: `next/image` refuses SVG here
          // by design (dangerouslyAllowSVG is off, CLAUDE.md §18), and there
          // is nothing to optimise in a 1 KB file we ship ourselves.
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/brand/google.svg" alt="" width={20} height={20} aria-hidden />
        )}
        {t('continueWithGoogle')}
      </Button>

      {errorKey && (
        <p role="alert" className="text-center text-sm text-danger">
          {t(errorKey)}
        </p>
      )}
    </div>
  );
}
