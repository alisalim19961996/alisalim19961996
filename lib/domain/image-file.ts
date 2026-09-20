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
  | 'uploadEmptyFile'
  | 'uploadTooLarge'
  | 'imageSvgRefused'
  | 'uploadUnsupportedFormat'
  /** The signature matched but the file is not a usable picture. */
  | 'uploadCorruptImage';

/**
 * Bounds on the picture itself.
 *
 * A signature is three bytes, and three bytes was all it took: a file
 * containing exactly `FF D8 FF` was accepted as a JPEG, stored in the bucket
 * and attached to a product, where it rendered as a broken image. The
 * signature says what a file CLAIMS to be; the dimensions say whether there is
 * a picture in it.
 *
 * Reading them is done here rather than by decoding, because a decoder is a
 * dependency that must satisfy `minimumReleaseAge` and stay pinned for the life
 * of the store (§18) — and it would be answering a question the header already
 * answers. This is not a claim to have decoded the pixels: a file with a valid
 * header and corrupt image data still gets through, and `next/image` is what
 * will notice. It closes the case the audit actually found.
 */
export const MIN_IMAGE_DIMENSION = 16;

/** 100 megapixels. Well past any phone; short of a decompression bomb. */
export const MAX_IMAGE_PIXELS = 100_000_000;

export type ImageInspection =
  | {
      ok: true;
      format: ImageFormat;
      extension: string;
      contentType: string;
      /** Null when the format's header is one this module cannot measure. */
      dimensions: { width: number; height: number } | null;
    }
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

/** Big-endian unsigned integer of `size` bytes, or null past the end. */
function uint(bytes: Uint8Array, offset: number, size: number): number | null {
  if (bytes.length < offset + size) return null;
  let value = 0;
  for (let index = 0; index < size; index += 1) {
    value = value * 256 + (bytes[offset + index] ?? 0);
  }
  return value;
}

/**
 * Width and height from the file's own header.
 *
 * `null` means "not measurable here", which is not the same as invalid: AVIF
 * puts its dimensions inside a nested `ispe` box that would take a real
 * ISO-BMFF walk to reach, and guessing at it is worse than admitting the gap.
 * Those files are held to the minimum-length check instead.
 */
export function readImageDimensions(
  bytes: Uint8Array,
  format: ImageFormat,
): { width: number; height: number } | null {
  if (format === 'png') {
    // IHDR is always the first chunk: length, type, then width and height.
    if (!matches(bytes, 12, ascii('IHDR'))) return null;
    const width = uint(bytes, 16, 4);
    const height = uint(bytes, 20, 4);
    return width && height ? { width, height } : null;
  }

  if (format === 'jpeg') {
    // Walk the marker segments to a Start Of Frame, which is where a JPEG
    // finally says how big it is. A truncated file simply runs out and returns
    // null, which is exactly the three-byte case.
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1] ?? 0;
      // SOF0..SOF15, excluding the non-frame markers that share the range.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        const height = uint(bytes, offset + 5, 2);
        const width = uint(bytes, offset + 7, 2);
        return width && height ? { width, height } : null;
      }
      const length = uint(bytes, offset + 2, 2);
      if (length === null || length < 2) return null;
      offset += 2 + length;
    }
    return null;
  }

  if (format === 'webp') {
    // Three encodings share the container and each states its size differently.
    if (matches(bytes, 12, ascii('VP8X'))) {
      const width = uint(bytes, 24, 3);
      const height = uint(bytes, 27, 3);
      // VP8X stores canvas size minus one.
      return width !== null && height !== null
        ? { width: width + 1, height: height + 1 }
        : null;
    }
    if (matches(bytes, 12, ascii('VP8L'))) {
      const bits = uint(bytes, 21, 4);
      if (bits === null) return null;
      // 14 bits each, little-endian within the field, also minus one.
      const packed =
        (bytes[21] ?? 0) |
        ((bytes[22] ?? 0) << 8) |
        ((bytes[23] ?? 0) << 16) |
        ((bytes[24] ?? 0) << 24);
      return {
        width: (packed & 0x3fff) + 1,
        height: ((packed >> 14) & 0x3fff) + 1,
      };
    }
    if (matches(bytes, 12, ascii('VP8 '))) {
      if (bytes.length < 30) return null;
      return {
        width: ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff,
        height: ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff,
      };
    }
    return null;
  }

  return null;
}

/**
 * The shortest a real file of each format can be.
 *
 * Only used where the dimensions cannot be read — today that is AVIF alone. It
 * is a floor, not a validation: it exists so "signature matched" can never on
 * its own mean "stored".
 */
const MIN_BYTES_BY_FORMAT: Record<ImageFormat, number> = {
  jpeg: 128,
  png: 67,
  webp: 30,
  avif: 128,
};

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

  if (bytes.length < MIN_BYTES_BY_FORMAT[format]) {
    return { ok: false, reason: 'uploadCorruptImage' };
  }

  // A signature is three bytes. `FF D8 FF` alone was accepted as a JPEG and
  // stored, so the header has to actually contain a picture's size.
  const dimensions = readImageDimensions(bytes, format);
  if (dimensions) {
    const { width, height } = dimensions;
    if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
      return { ok: false, reason: 'uploadCorruptImage' };
    }
    if (width * height > MAX_IMAGE_PIXELS) {
      return { ok: false, reason: 'uploadTooLarge' };
    }
  } else if (format !== 'avif') {
    // Every format but AVIF is measurable here, so failing to measure one means
    // the header is not what it claims — not that this module fell short.
    return { ok: false, reason: 'uploadCorruptImage' };
  }

  return {
    ok: true,
    format,
    extension: EXTENSIONS[format],
    contentType: CONTENT_TYPES[format],
    dimensions,
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
