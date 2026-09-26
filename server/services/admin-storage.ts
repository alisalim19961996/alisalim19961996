import 'server-only';

import { randomBytes } from 'node:crypto';
import { requireStaff } from '@/server/auth/guards';
import { isUploadConfigured, storageEnv } from '@/config/env';
import {
  inspectImageBytes,
  storageFolderFor,
  storageObjectPath,
  type ImageRejection,
} from '@/lib/domain/image-file';

/**
 * Product photography, stored in Supabase Storage.
 *
 * Talking to the storage REST API with `fetch` rather than adding
 * `@supabase/supabase-js`: the two calls this needs are a PUT and a DELETE,
 * and a dependency brought in for that would also have to satisfy the
 * `minimumReleaseAge` policy and be kept pinned (CLAUDE.md §13.9–13.11) for as
 * long as the store lives.
 *
 * The service role key used here **bypasses every row-level policy in the
 * project**. That is why this module is `server-only`, why every export starts
 * with `requireStaff()`, and why the key is never handed to the browser: the
 * upload is proxied through the app so the browser only ever talks to MPS.
 */

export type StorageErrorCode = ImageRejection | 'uploadNotConfigured' | 'uploadFailed';

export class StorageError extends Error {
  constructor(
    message: string,
    /** Key under the `admin` namespace in messages/, so the UI can translate it. */
    readonly code: StorageErrorCode,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * How the privileged key is presented to Supabase.
 *
 * Supabase has two generations of key. The legacy `service_role` key is a JWT
 * and authenticates through `Authorization: Bearer`. The current
 * `sb_secret_...` key is not a JWT, and the gateway reads it from `apikey`.
 * Sending both is what Supabase's own client does, and it means a project on
 * either generation works without the owner having to know which they have —
 * a distinction the dashboard itself only hints at with a tab.
 */
function storageAuthHeaders(): Record<string, string> {
  const key = storageEnv.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return { Authorization: `Bearer ${key}`, apikey: key };
}

/** Supabase serves a public bucket's objects from this path, unauthenticated. */
function publicUrlFor(objectPath: string): string {
  const bucket = storageEnv.SUPABASE_STORAGE_BUCKET;
  return `${storageEnv.SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
}

export interface UploadedImage {
  url: string;
  /** The format actually detected, which may not be what the file was called. */
  format: string;
  bytes: number;
}

/**
 * Store one product photograph and return the URL to save on the product.
 *
 * The filename the browser sent is used for nothing. The format comes from the
 * file's own bytes, the object name from the product's slug plus 16 random
 * bytes, and the Content-Type from what was detected — so a renamed SVG is
 * refused, and a file that slipped through could still never be served as
 * anything but the raster type it actually is.
 */
export async function uploadProductImage(input: {
  bytes: Uint8Array;
  /** Only used to group objects into a readable folder. */
  slug: string;
}): Promise<UploadedImage> {
  await requireStaff();

  if (!isUploadConfigured) {
    throw new StorageError('supabase storage is not configured', 'uploadNotConfigured');
  }

  const inspection = inspectImageBytes(input.bytes);
  if (!inspection.ok) {
    throw new StorageError(`rejected: ${inspection.reason}`, inspection.reason);
  }

  const objectPath = storageObjectPath({
    slug: input.slug,
    extension: inspection.extension,
    random: randomBytes(16).toString('hex'),
  });

  const bucket = storageEnv.SUPABASE_STORAGE_BUCKET;
  const response = await fetch(
    `${storageEnv.SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`,
    {
      method: 'POST',
      headers: {
        ...storageAuthHeaders(),
        'Content-Type': inspection.contentType,
        // The object name carries 16 random bytes, so a collision means
        // something is wrong; overwriting silently would hide it.
        'x-upsert': 'false',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: new Uint8Array(input.bytes),
    },
  );

  if (!response.ok) {
    // The response body can quote the key back in an error; it is read for the
    // server log only and never returned to the browser.
    const detail = await response.text().catch(() => '');
    console.error('[storage] upload failed', response.status, detail.slice(0, 300));
    throw new StorageError(`storage responded ${response.status}`, 'uploadFailed');
  }

  return {
    url: publicUrlFor(objectPath),
    format: inspection.format,
    bytes: input.bytes.length,
  };
}

export interface StoredObject {
  /** The key inside the bucket, which is what a delete takes. */
  path: string;
  /** The public URL, which is what a `ProductImage` row holds. */
  url: string;
}

/**
 * How many objects one list request asks for.
 *
 * Supabase caps a listing; paging rather than assuming one page is the
 * difference between sweeping a folder and sweeping the first hundred objects
 * in it and calling the rest deleted.
 */
const LIST_PAGE = 100;

/**
 * Everything stored under one product's folder.
 *
 * Returns an empty list when storage is not configured, because then there is
 * nothing of ours out there: the form asks for a path under `public/` instead,
 * and those are files the owner put in the repository by hand. MPS must never
 * delete one.
 *
 * A listing failure is reported by throwing. The caller decides what that
 * means — for a product delete it means "leave the objects", which is exactly
 * where they were already.
 */
export async function listProductObjects(slug: string): Promise<StoredObject[]> {
  await requireStaff();
  if (!isUploadConfigured) return [];

  const folder = storageFolderFor(slug);
  const bucket = storageEnv.SUPABASE_STORAGE_BUCKET;
  const found: StoredObject[] = [];

  for (let offset = 0; ; offset += LIST_PAGE) {
    const response = await fetch(
      `${storageEnv.SUPABASE_URL}/storage/v1/object/list/${bucket}`,
      {
        method: 'POST',
        headers: { ...storageAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: folder, limit: LIST_PAGE, offset }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[storage] list failed', response.status, detail.slice(0, 300));
      throw new StorageError(`storage responded ${response.status}`, 'uploadFailed');
    }

    const page: unknown = await response.json();
    if (!Array.isArray(page)) return found;

    for (const entry of page) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { name, id } = entry as { name?: unknown; id?: unknown };
      // Supabase returns a nested folder as a row whose `id` is null, and our
      // uploads are always flat inside the folder — so anything with an id and
      // no separator in its name is one of ours, and anything else is not.
      if (typeof name !== 'string' || id === null || name.includes('/')) continue;
      const path = `${folder}/${name}`;
      found.push({ path, url: publicUrlFor(path) });
    }

    if (page.length < LIST_PAGE) return found;
  }
}

/**
 * Remove objects from the bucket, by exact key.
 *
 * By key and never by prefix: Supabase will happily take a prefix here, and a
 * prefix is one truncated string away from emptying the bucket. The caller
 * lists first, decides, and passes the paths it decided on.
 */
export async function deleteStorageObjects(paths: readonly string[]): Promise<number> {
  await requireStaff();
  if (!isUploadConfigured || paths.length === 0) return 0;

  const bucket = storageEnv.SUPABASE_STORAGE_BUCKET;
  const response = await fetch(
    `${storageEnv.SUPABASE_URL}/storage/v1/object/${bucket}`,
    {
      method: 'DELETE',
      headers: { ...storageAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [...paths] }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('[storage] delete failed', response.status, detail.slice(0, 300));
    throw new StorageError(`storage responded ${response.status}`, 'uploadFailed');
  }

  return paths.length;
}
