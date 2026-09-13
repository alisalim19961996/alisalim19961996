import { describe, expect, it } from 'vitest';
import {
  inspectImageBytes,
  MAX_IMAGE_BYTES,
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

describe('inspectImageBytes', () => {
  it('accepts a JPEG by its SOI marker', () => {
    const result = inspectImageBytes(padded(bytes(0xff, 0xd8, 0xff, 0xe0)));
    expect(result).toMatchObject({ ok: true, format: 'jpeg', extension: 'jpg' });
  });

  it('accepts a PNG by its full signature', () => {
    const png = padded(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
    expect(inspectImageBytes(png)).toMatchObject({ ok: true, format: 'png' });
  });

  it('accepts a WebP by its RIFF form type, not just by RIFF', () => {
    const webp = padded(concat(ascii('RIFF'), bytes(0, 0, 0, 0), ascii('WEBP')));
    expect(inspectImageBytes(webp)).toMatchObject({ ok: true, format: 'webp' });

    // A RIFF container that is not WebP (a WAV, say) must not sneak through.
    const wav = padded(concat(ascii('RIFF'), bytes(0, 0, 0, 0), ascii('WAVE')));
    expect(inspectImageBytes(wav)).toMatchObject({
      ok: false,
      reason: 'uploadUnsupportedFormat',
    });
  });

  it('accepts AVIF by its ftyp brand', () => {
    const avif = padded(concat(bytes(0, 0, 0, 0x20), ascii('ftyp'), ascii('avif')));
    expect(inspectImageBytes(avif)).toMatchObject({ ok: true, format: 'avif' });

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
