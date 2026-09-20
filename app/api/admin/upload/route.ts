import { NextResponse } from 'next/server';
import { serverEnv } from '@/config/env';
import { StorageError, uploadProductImage } from '@/server/services/admin-storage';
import {
  ForbiddenError,
  requireStaff,
  UnauthenticatedError,
} from '@/server/auth/guards';
import { MAX_IMAGE_BYTES } from '@/lib/domain/image-file';

/**
 * Upload one product photograph.
 *
 * A route handler rather than a Server Action, because an action's request
 * body is capped well below a photograph's size and raising that cap raises it
 * for every action in the app.
 *
 * Authorisation happens TWICE and the order matters. `requireStaff()` inside
 * the service is the rule that protects the data (CLAUDE.md §7) — but it only
 * ran after `formData()` had read the whole request into memory and
 * `arrayBuffer()` had copied it again. So an anonymous caller could make the
 * server buffer eight megabytes per request, as many times a second as it
 * could send them, and be refused only afterwards. The guard runs here first
 * now, before a byte of the body is touched; the service still re-checks,
 * because a route guard alone is bypassed the moment something else calls it.
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
  // It is a defence, never the authorisation: `Origin` is absent on plenty of
  // legitimate requests and is not a credential on any of them.
  const origin = request.headers.get('origin');
  if (origin && origin !== serverEnv.BETTER_AUTH_URL) {
    return fail('notAllowed', 403);
  }

  // WHO, before any of the body is read. Everything below this line costs
  // memory, and an anonymous caller must not be able to spend it.
  try {
    await requireStaff();
  } catch {
    return fail('notAllowed', 403);
  }

  // Then HOW BIG, still before buffering. `Content-Length` is a claim the
  // client makes and a lying or absent header proves nothing — which is why
  // `file.size` is checked again below, from the parsed body, and why the
  // service checks the bytes it is actually handed.
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

  // The real size, from the parsed part rather than from a header the caller
  // wrote. `arrayBuffer()` below copies the whole file again, so this is the
  // last point at which an oversized upload is still cheap to refuse.
  if (file.size > MAX_IMAGE_BYTES) {
    return fail('uploadTooLarge', 413);
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
