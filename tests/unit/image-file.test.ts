import { describe, expect, it } from 'vitest';
import {
  inspectImageBytes,
  MAX_IMAGE_BYTES,
  storageFolderFor,
  storageObjectPath,
} from '@/lib/domain/image-file';

/**
 * The security-relevant half of image upload.
 *
 * CLAUDE.md §18: `dangerouslyAllowSVG` is off because an SVG is a script
 * delivered as a picture. An upload endpoint that trusts the filename or the
 * browser-supplied Content-Type undoes that in one line — renaming the file is
 * the whole attack — so every case here feeds bytes, never names.
 */

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
/** Pad so a signature test is not accidentally passing on length alone. */
const padded = (head: Uint8Array) => concat(head, new Uint8Array(64));

/*
  Fixtures with real HEADERS, not just signatures.

  The four format tests below used to hand over three or eight bytes and a run
  of zeros, and they passed — which is exactly the hole the audit found: `FF D8
  FF` alone was accepted as a JPEG, stored in the bucket, and rendered on a
  product page as a broken image. So the fixtures now carry the part of the
  header that says how big the picture is, because that is what the module
  reads. A test that asserts the old behaviour is a test that defends the bug.
*/

/** SOI, a JFIF APP0 segment, then an SOF0 frame declaring the size. */
function jpegBytes(width = 1200, height = 1500): Uint8Array {
  return concat(
    bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10),
    new Uint8Array(14),
    bytes(
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      (height >> 8) & 0xff,
      height & 0xff,
      (width >> 8) & 0xff,
      width & 0xff,
    ),
    new Uint8Array(200),
  );
}

/** The 8-byte signature, then an IHDR chunk carrying the dimensions. */
function pngBytes(width = 800, height = 600): Uint8Array {
  return concat(
    bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d),
    ascii('IHDR'),
    bytes(
      (width >>> 24) & 0xff,
      (width >>> 16) & 0xff,
      (width >>> 8) & 0xff,
      width & 0xff,
      (height >>> 24) & 0xff,
      (height >>> 16) & 0xff,
      (height >>> 8) & 0xff,
      height & 0xff,
    ),
    new Uint8Array(100),
  );
}

/** A RIFF/WEBP container holding a lossy VP8 frame of a stated size. */
function webpBytes(width = 640, height = 480): Uint8Array {
  return concat(
    ascii('RIFF'),
    bytes(0, 0, 0, 0),
    ascii('WEBP'),
    ascii('VP8 '),
    bytes(0, 0, 0, 0),
    // Frame tag and the start code, then the two 14-bit size fields.
    bytes(0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a),
    bytes(width & 0xff, (width >> 8) & 0x3f, height & 0xff, (height >> 8) & 0x3f),
    new Uint8Array(64),
  );
}

/** AVIF's dimensions live in a nested box this module deliberately does not
 *  walk, so the fixture only has to be long enough to be a real file. */
const avifBytes = () =>
  concat(bytes(0, 0, 0, 0x20), ascii('ftyp'), ascii('avif'), new Uint8Array(200));

describe('inspectImageBytes', () => {
  it('accepts a JPEG by its SOI marker', () => {
    const result = inspectImageBytes(jpegBytes());
    expect(result).toMatchObject({ ok: true, format: 'jpeg', extension: 'jpg' });
  });

  it('accepts a PNG by its full signature', () => {
    expect(inspectImageBytes(pngBytes())).toMatchObject({ ok: true, format: 'png' });
  });

  it('accepts a WebP by its RIFF form type, not just by RIFF', () => {
    expect(inspectImageBytes(webpBytes())).toMatchObject({ ok: true, format: 'webp' });

    // A RIFF container that is not WebP (a WAV, say) must not sneak through.
    const wav = padded(concat(ascii('RIFF'), bytes(0, 0, 0, 0), ascii('WAVE')));
    expect(inspectImageBytes(wav)).toMatchObject({
      ok: false,
      reason: 'uploadUnsupportedFormat',
    });
  });

  it('accepts AVIF by its ftyp brand', () => {
    expect(inspectImageBytes(avifBytes())).toMatchObject({ ok: true, format: 'avif' });

    // Another ISO-BMFF brand — an MP4 — is not an image.
    const mp4 = padded(concat(bytes(0, 0, 0, 0x20), ascii('ftyp'), ascii('isom')));
    expect(inspectImageBytes(mp4)).toMatchObject({
      ok: false,
      reason: 'uploadUnsupportedFormat',
    });
  });

  describe('SVG', () => {
    it('refuses a plain SVG', () => {
      const svg = ascii('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
      expect(inspectImageBytes(svg)).toEqual({ ok: false, reason: 'imageSvgRefused' });
    });

    it('refuses an SVG behind an XML declaration', () => {
      const svg = ascii('<?xml version="1.0"?>\n<svg xmlns="x"><script/></svg>');
      expect(inspectImageBytes(svg)).toEqual({ ok: false, reason: 'imageSvgRefused' });
    });

    it('refuses an SVG behind a BOM and whitespace', () => {
      // The two cheapest ways to dodge a naive startsWith check.
      const svg = concat(bytes(0xef, 0xbb, 0xbf), ascii('\n\t  <SVG><script/></SVG>'));
      expect(inspectImageBytes(svg)).toEqual({ ok: false, reason: 'imageSvgRefused' });
    });

    it('refuses an SVG no matter what it claims to be called', () => {
      // The filename never reaches this function, which is the point: renaming
      // an SVG to .jpg is the entire attack, and there is nothing here to fool.
      const svg = ascii('<svg onload="fetch(`/api/auth/session`)"/>');
      expect(inspectImageBytes(svg).ok).toBe(false);
    });
  });

  it('refuses an empty file before anything else', () => {
    expect(inspectImageBytes(new Uint8Array(0))).toEqual({
      ok: false,
      reason: 'uploadEmptyFile',
    });
  });

  it('refuses an oversized file by size, not by format', () => {
    // A valid JPEG header, so only the size can be the complaint.
    const huge = concat(bytes(0xff, 0xd8, 0xff), new Uint8Array(MAX_IMAGE_BYTES));
    expect(inspectImageBytes(huge)).toEqual({ ok: false, reason: 'uploadTooLarge' });
  });

  it('refuses anything unrecognised rather than storing it', () => {
    expect(inspectImageBytes(ascii('GIF89a....'))).toMatchObject({
      ok: false,
      reason: 'uploadUnsupportedFormat',
    });
    expect(inspectImageBytes(ascii('%PDF-1.7'))).toMatchObject({
      ok: false,
      reason: 'uploadUnsupportedFormat',
    });
    expect(inspectImageBytes(bytes(0x00, 0x01, 0x02, 0x03))).toMatchObject({
      ok: false,
      reason: 'uploadUnsupportedFormat',
    });
  });
});

describe('storageObjectPath', () => {
  it('keeps only the slug and a random name', () => {
    expect(
      storageObjectPath({ slug: 'galaxy-s24', extension: 'jpg', random: 'a1b2c3' }),
    ).toBe('galaxy-s24/a1b2c3.jpg');
  });

  it('strips anything that could climb out of the folder', () => {
    // The uploader chooses the filename; it never becomes a path.
    expect(
      storageObjectPath({ slug: '../../etc', extension: 'png', random: 'x/y..z' }),
    ).toBe('etc/xyz.png');
  });

  it('falls back to a safe folder when the slug survives as nothing', () => {
    expect(storageObjectPath({ slug: '؟؟؟', extension: 'webp', random: 'q1' })).toBe(
      'product/q1.webp',
    );
  });
});

/**
 * The upload and the sweep have to name the same folder.
 *
 * Deleting a product now removes its objects from the bucket, and a sweep that
 * sanitised the slug even slightly differently from the upload would look at
 * an empty folder, delete nothing, and report success while the objects stayed
 * on the bill. So the folder is one function and this asserts the agreement
 * rather than trusting two copies to stay in step.
 */
describe('the upload folder and the sweep folder are the same folder', () => {
  const SLUGS = ['galaxy-s24', '../../etc', '؟؟؟', 'Galaxy_S24!!', 'a-b-c'];

  it.each(SLUGS)('agree for %s', (slug) => {
    const path = storageObjectPath({ slug, extension: 'jpg', random: 'abc' });
    expect(path.startsWith(`${storageFolderFor(slug)}/`)).toBe(true);
  });

  it('never returns an empty folder, whatever the slug was', () => {
    for (const slug of [...SLUGS, '', '   ', '/././']) {
      expect(storageFolderFor(slug)).not.toBe('');
      expect(storageFolderFor(slug)).not.toContain('/');
    }
  });

  it('gives two products with similar slugs two different folders', () => {
    // A sweep that matched on a bare prefix would take `samsung-a55` with it.
    expect(storageFolderFor('samsung')).not.toBe(storageFolderFor('samsung-a55'));
  });
});

/**
 * A signature is three bytes, and three bytes was all it took.
 *
 * A file containing exactly `FF D8 FF` was accepted as a JPEG, stored in the
 * bucket and attached to a product, where it rendered as a broken image. The
 * signature says what a file CLAIMS to be; the header's dimensions say whether
 * there is a picture in it.
 */
describe('a signature is not a picture', () => {
  it('refuses three bytes that merely start like a JPEG', () => {
    // The exact case the audit found.
    const result = inspectImageBytes(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('uploadCorruptImage');
  });

  it('refuses a JPEG signature followed by padding and no frame', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, ...new Array(500).fill(0)]);
    const result = inspectImageBytes(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('uploadCorruptImage');
  });

  it('refuses a PNG signature with no IHDR behind it', () => {
    const bytes = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...new Array(100).fill(0),
    ]);
    const result = inspectImageBytes(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('uploadCorruptImage');
  });

  it('accepts a real JPEG header and reports its size', () => {
    const result = inspectImageBytes(jpegBytes(1200, 1500));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.format).toBe('jpeg');
      expect(result.dimensions).toEqual({ width: 1200, height: 1500 });
    }
  });

  it('accepts a real PNG header and reports its size', () => {
    const result = inspectImageBytes(pngBytes(800, 600));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dimensions).toEqual({ width: 800, height: 600 });
  });

  it('refuses a picture too small to be a photograph', () => {
    // A 1×1 tracking pixel is a valid PNG and not a product photograph.
    const result = inspectImageBytes(pngBytes(1, 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('uploadCorruptImage');
  });

  it('refuses a decompression bomb by its declared pixel count', () => {
    // 60,000 × 60,000 is 3.6 gigapixels in a header of twenty-odd bytes.
    const result = inspectImageBytes(pngBytes(60_000, 60_000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('uploadTooLarge');
  });

  it('still refuses a renamed SVG before any of this', () => {
    // The original rule, unchanged: the reason must stay specific, because
    // "unsupported file" sends the owner back with the same file.
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const result = inspectImageBytes(svg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('imageSvgRefused');
  });
});
