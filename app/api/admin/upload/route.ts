import { NextResponse } from 'next/server';
import { serverEnv } from '@/config/env';
import { StorageError, uploadProductImage } from '@/server/services/admin-storage';
import { ForbiddenError, UnauthenticatedError } from '@/server/auth/guards';
import { MAX_IMAGE_BYTES } from '@/lib/domain/image-file';

/**
 * Upload one product photograph.
 *
 * A route handler rather than a Server Action, because an action's request
 * body is capped well below a photograph's size and raising that cap raises it
 * for every action in the app.
 *
 * Authorisation is `requireStaff()` inside the service, not here: this route is
 * one caller, and the rule belongs with the thing it protects (CLAUDE.md §7).
 *
 * `proxy.ts` excludes /api from locale rewriting, so this path is not
 * locale-prefixed.
 */

/** Errors are keys under the `admin` namespace, never ready-made sentences. */
function fail(errorKey: string, status: number) {
  return NextResponse.json({ ok: false, errorKey }, { status });
}

export async function POST(request: Request) {
  // A state-changing endpoint. The session cookie is sameSite=lax, so a
  // cross-site POST never carries it — this check is the second lock, and it
  // is the one that also covers a same-site page that should not be posting.
  const origin = request.headers.get('origin');
  if (origin && origin !== serverEnv.BETTER_AUTH_URL) {
    return fail('notAllowed', 403);
  }

  // Refuse an oversized body before buffering it. `formData()` reads the whole
  // request into memory, so checking afterwards means the damage is already
  // done.
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES * 1.1) {
    return fail('uploadTooLarge', 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('invalidRequest', 400);
  }

  const file = form.get('file');
  const slug = form.get('slug');
  if (!(file instanceof File) || typeof slug !== 'string') {
    return fail('invalidRequest', 400);
  }

  try {
    const result = await uploadProductImage({
      bytes: new Uint8Array(await file.arrayBuffer()),
      slug,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
      // The same generic answer an unauthorised caller gets everywhere else:
      // naming the missing role confirms the endpoint and says what to phish.
      return fail('notAllowed', 403);
    }
    if (error instanceof StorageError) {
      return fail(error.code, error.code === 'uploadFailed' ? 502 : 400);
    }
    console.error('[upload] unexpected failure', error);
    return fail('actionFailed', 500);
  }
}
