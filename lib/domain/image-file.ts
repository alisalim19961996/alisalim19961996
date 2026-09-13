/**
 * What counts as a product photograph.
 *
 * The rule that matters here is CLAUDE.md §18: **SVG is refused**, because an
 * SVG is a script delivered as a picture — it can carry `<script>`, and
 * `dangerouslyAllowSVG` is deliberately off for exactly that reason.
 *
 * The check is on the file's own bytes, never on its name. A filename is
 * chosen by whoever uploads it, so `photo.jpg` proves nothing; renaming an SVG
 * is the entire attack. Formats are therefore an **allowlist by signature**:
 * anything whose first bytes do not match a known raster format is refused,
 * which means a new disguise is refused by default rather than by a rule
 * somebody remembered to add.
 */

/** Raster formats a storefront actually needs. */
export const ACCEPTED_IMAGE_FORMATS = ['jpeg', 'png', 'webp', 'avif'] as const;

export type ImageFormat = (typeof ACCEPTED_IMAGE_FORMATS)[number];

/**
 * 8 MB. Large enough for a real photograph straight off a phone, small enough
 * that a mistaken upload of a video does not sit in storage being paid for.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ImageRejection =
  'uploadEmptyFile' | 'uploadTooLarge' | 'imageSvgRefused' | 'uploadUnsupportedFormat';

export type ImageInspection =
  | { ok: true; format: ImageFormat; extension: string; contentType: string }
  | { ok: false; reason: ImageRejection };

const EXTENSIONS: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
};

const CONTENT_TYPES: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

/** Compare a run of bytes against a signature, ignoring positions given as -1. */
function matches(
  bytes: Uint8Array,
  offset: number,
  signature: readonly number[],
): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every(
    (byte, index) => byte === -1 || bytes[offset + index] === byte,
  );
}

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

/**
 * Does this look like SVG?
 *
 * SVG is XML, so it has no magic number — which is precisely why it needs its
 * own check rather than falling through to "unknown format". Saying "SVG is
 * refused for security reasons" tells the owner what to do; "unsupported file"
 * sends them trying again with the same file.
 */
function looksLikeSvg(bytes: Uint8Array): boolean {
  // A UTF-8 BOM and leading whitespace are both common and both harmless.
  let start = 0;
  if (matches(bytes, 0, [0xef, 0xbb, 0xbf])) start = 3;
  while (start < bytes.length && (bytes[start] ?? 0) <= 0x20) start += 1;

  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(start, start + 512))
    .toLowerCase();

  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}

function detectFormat(bytes: Uint8Array): ImageFormat | null {
  // JPEG: SOI marker.
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg';

  // PNG: the 8-byte signature, including the CRLF/EOF trap bytes.
  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';

  // WebP is a RIFF container whose form type is "WEBP" at offset 8.
  if (matches(bytes, 0, ascii('RIFF')) && matches(bytes, 8, ascii('WEBP'))) {
    return 'webp';
  }

  // AVIF is ISO-BMFF: a "ftyp" box at offset 4, brand at offset 8. `avis` is
  // the image-sequence brand and decodes in the same browsers.
  if (matches(bytes, 4, ascii('ftyp'))) {
    if (matches(bytes, 8, ascii('avif')) || matches(bytes, 8, ascii('avis'))) {
      return 'avif';
    }
  }

  return null;
}

/**
 * Decide whether these bytes may be stored as a product photograph.
 *
 * Order matters: an empty file and an oversized one are answered before the
 * format check, so the owner is told the actual problem rather than
 * "unsupported format" for a file that was simply too big.
 */
export function inspectImageBytes(bytes: Uint8Array): ImageInspection {
  if (bytes.length === 0) return { ok: false, reason: 'uploadEmptyFile' };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: 'uploadTooLarge' };

  if (looksLikeSvg(bytes)) return { ok: false, reason: 'imageSvgRefused' };

  const format = detectFormat(bytes);
  if (!format) return { ok: false, reason: 'uploadUnsupportedFormat' };

  return {
    ok: true,
    format,
    extension: EXTENSIONS[format],
    contentType: CONTENT_TYPES[format],
  };
}

/**
 * Where the file is stored.
 *
 * The uploader's filename is never reused: it can contain path separators,
 * control characters, a name that collides with somebody else's photo, or the
 * customer's own name. Only the product's slug (already latin and validated)
 * and a random suffix survive, and the extension comes from the *detected*
 * format rather than the one that was claimed.
 */
export function storageObjectPath(input: {
  slug: string;
  extension: string;
  random: string;
}): string {
  const slug = input.slug.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'product';
  const random = input.random.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return `${slug}/${random}.${input.extension}`;
}
