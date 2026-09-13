import 'server-only';

import { randomBytes } from 'node:crypto';
import { requireStaff } from '@/server/auth/guards';
import { isUploadConfigured, storageEnv } from '@/config/env';
import {
  inspectImageBytes,
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
        Authorization: `Bearer ${storageEnv.SUPABASE_SERVICE_ROLE_KEY}`,
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
