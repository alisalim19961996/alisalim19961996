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
export const signOut = client.signOut;
export const useSession = client.useSession;
