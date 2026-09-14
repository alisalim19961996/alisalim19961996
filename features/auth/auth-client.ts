import { createAuthClient } from 'better-auth/react';

/**
 * The browser's half of authentication, isolated here.
 *
 * This is the client-side twin of `server/auth/auth.ts`: the one module that
 * knows which auth provider MPS uses. Components import `signIn` / `signOut`
 * from here and never from `better-auth` itself, so swapping the provider is a
 * change to two files rather than a hunt through the UI.
 *
 * It talks to `/api/auth/*`, which is what keeps the rate limits real — see
 * the route handler for why that matters.
 *
 * It lives in features/auth/ rather than lib/ because it pulls in React:
 * lib/ is the framework-free half of the codebase, testable in plain Node.
 */
const client = createAuthClient();

export const signIn = client.signIn;
/*
  Registration goes through the same client, which means the same
  `/api/auth/*` route — and therefore the same rate limit. better-auth applies
  those in the router's `onRequest`, so a Server Action calling `auth.api`
  directly would leave the documented 3 sign-ups per 5 minutes unenforced
  (§7).
*/
export const signUp = client.signUp;
export const signOut = client.signOut;
export const useSession = client.useSession;
