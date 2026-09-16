import 'server-only';

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies, toNextJsHandler } from 'better-auth/next-js';
import { db } from '@/server/db/client';
import { googleEnv, isGoogleSignInConfigured, serverEnv } from '@/config/env';
import { getMailProvider } from '@/server/mail/provider';
import { passwordResetMail } from '@/lib/domain/mail-templates';

/**
 * Authentication is deliberately isolated behind this module and the guards in
 * ./guards.ts. Application code never imports better-auth directly, so the
 * provider can be replaced without touching feature code.
 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  secret: serverEnv.BETTER_AUTH_SECRET,
  baseURL: serverEnv.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Verification is switched on once an email provider is configured.
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 3600,

    /**
     * Send the reset link — when there is anything to send it with.
     *
     * better-auth calls this from `/request-password-reset`. Returning without
     * sending is deliberate when no provider is configured: the endpoint
     * answers the same either way, and the FORM is what tells the customer
     * that reset is unavailable (it asks `isMailConfigured` before promising
     * an inbox). Throwing here would turn a known, documented gap into a 500.
     *
     * Failures are logged and swallowed for the same reason the endpoint
     * always answers the same: a provider outage must not become an oracle
     * for which addresses have accounts here.
     */
    async sendResetPassword({ user, url }) {
      const provider = getMailProvider();
      if (!provider) {
        console.warn('[auth] password reset requested with no mail provider set');
        return;
      }

      /*
        Arabic, because the store is Arabic-first (§1) and there is no locale
        to read: `sendResetPassword` runs inside better-auth's handler, which
        has no request context, and reaching for next-intl there would give
        whichever locale the server booted in. Writing the customer's language
        needs a column on `User` first — a schema change, not a guess here.
      */
      const mail = passwordResetMail({ name: user.name, url, locale: 'ar' });

      try {
        await provider.send({ to: user.email, ...mail });
      } catch (error) {
        console.error('[auth] reset email failed to send', error);
      }
    },
  },

  /**
   * Google, when it is configured — and email + password either way.
   *
   * Spread rather than declared, so a store with no Google credentials offers
   * no Google button at all instead of one that fails at the redirect.
   */
  socialProviders: isGoogleSignInConfigured
    ? {
        google: {
          clientId: googleEnv.GOOGLE_CLIENT_ID ?? '',
          clientSecret: googleEnv.GOOGLE_CLIENT_SECRET ?? '',
        },
      }
    : {},

  account: {
    /**
     * What happens when a Google address already has a password account here.
     *
     * Linking them is the behaviour a customer expects — one person, one
     * order history — but linking the wrong two accounts merges one
     * customer's orders into another's, so both halves have to be proven:
     *
     *  - `trustedProviders: ['google']` says Google's word that the address is
     *    verified can be believed. It can: Google will not issue an id token
     *    for an address the signer has not proven.
     *  - `requireLocalEmailVerified` says the *existing local* account must
     *    itself have a verified address. This is the half that matters here
     *    and the reason it is written out rather than left to its default:
     *    MPS has `requireEmailVerification: false` until a mail provider is
     *    configured, so anyone could register `victim@gmail.com` with a
     *    password they choose. Without this flag, the real owner of that
     *    address signing in with Google would be dropped straight into the
     *    attacker's account — and would see nothing unusual. With it, the
     *    unverified local account is never linked, and better-auth answers
     *    `account_not_linked`, which the sign-in page explains.
     *
     * Do not "simplify" this line away when email verification is switched
     * on: it stays correct either way, and it is the only thing standing
     * between a pre-registered address and somebody else's order history.
     */
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      requireLocalEmailVerified: true,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh at most once a day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  user: {
    additionalFields: {
      // Role lives on the user row and is never accepted from the client.
      role: {
        type: 'string',
        required: false,
        defaultValue: 'CUSTOMER',
        input: false,
      },
      phone: {
        type: 'string',
        required: false,
        input: true,
      },
      isActive: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },

  advanced: {
    cookiePrefix: 'mps',
    /**
     * Derived from the URL the site is actually served from, not from
     * NODE_ENV.
     *
     * Secure cookies carry the `__Secure-` prefix, which browsers accept ONLY
     * over https. Keying this off NODE_ENV meant `pnpm build && pnpm start`
     * on http://localhost issued cookies Chrome silently refused to store:
     * sign-in appeared to succeed, no session existed, and every guarded page
     * bounced back to the sign-in form. curl stores them regardless, so the
     * API looked healthy while the browser was broken.
     *
     * The scheme is the thing that actually decides whether a secure cookie
     * can work, so the scheme is what this reads. A real deployment serves
     * https and gets secure cookies; it cannot be weakened by NODE_ENV alone,
     * only by pointing BETTER_AUTH_URL at http — which would itself be the
     * misconfiguration.
     */
    useSecureCookies: serverEnv.BETTER_AUTH_URL.startsWith('https://'),
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
    },
  },

  // Blunt but effective protection against credential stuffing.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 300, max: 3 },
      /*
        The endpoint is `/request-password-reset`. `/forget-password` was the
        old name and better-auth 1.7 does not serve it, so this rule matched
        nothing and the documented "3 resets / 5 minutes" was never applied —
        the library's own default of 3/60s was doing the work. Named rules are
        matched by exact path (or a wildcard), so a stale name fails silently,
        which is the worst way for a rate limit to fail.
      */
      '/request-password-reset': { window: 300, max: 3 },
      // Starting an OAuth redirect is cheap for us and costly for Google, so
      // the limit exists to stop a script using the store as a redirect mill,
      // not to protect a password.
      '/sign-in/social': { window: 60, max: 10 },
    },
  },

  plugins: [nextCookies()],
});

export type Auth = typeof auth;

/**
 * The HTTP endpoints, mounted by app/api/auth/[...all]/route.ts.
 *
 * Built here rather than in the route file so this module stays the single
 * place that knows which auth provider MPS uses — a rule enforced by
 * tests/architecture.test.ts.
 *
 * Sign-in must go over HTTP rather than through a direct `auth.api.signInEmail()`
 * call in a Server Action: better-auth applies its rate limits in the router's
 * `onRequest`, which only runs for requests through this handler. A direct call
 * bypasses them, so the "5 sign-ins per minute" in §7 would be a documented
 * protection that does not exist. Over HTTP the limiter also sees the real
 * client IP, so one attacker cannot lock every customer out of the store.
 */
export const authHandlers = toNextJsHandler(auth.handler);
