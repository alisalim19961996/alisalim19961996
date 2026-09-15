import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { claimCartForCurrentUser } from '@/server/services/cart';
import { serverEnv } from '@/config/env';
import { safeInternalPath } from '@/lib/safe-redirect';

/**
 * Where an OAuth sign-in lands before the visitor sees a page.
 *
 * The email form can fold the visitor's anonymous cart into their account
 * itself, because it never leaves the page. An OAuth sign-in does: the browser
 * is handed to Google and comes back to whatever `callbackURL` said, with the
 * form's code long gone. This route is that callbackURL — it does the same
 * work, then forwards to where the visitor was going.
 *
 * Skipping it would not lose the cart (the cart service merges lazily on the
 * next read), but it would leave the cached cart and checkout pages rendering
 * the pre-merge state — a customer seeing an empty cart reads that as having
 * lost it, and does not wait around to find out otherwise.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  // `next` arrives from a query string, so it arrives from anyone. The string
  // check that used to live here — starts with "/" but not "//" — was bypassed
  // live: `/\evil.example` redirected to http://evil.example/, because the URL
  // parser reads a backslash as a slash. `safeInternalPath` asks that same
  // parser instead of trying to out-guess it (lib/safe-redirect.ts).
  const next = safeInternalPath(url.searchParams.get('next'));

  await claimCartForCurrentUser();
  revalidatePath('/', 'layout');

  return NextResponse.redirect(new URL(next, serverEnv.BETTER_AUTH_URL));
}
