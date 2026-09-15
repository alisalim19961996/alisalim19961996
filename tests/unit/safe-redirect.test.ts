import { describe, expect, it } from 'vitest';
import { safeInternalPath } from '@/lib/safe-redirect';

describe('safeInternalPath', () => {
  it('keeps an ordinary in-site path', () => {
    expect(safeInternalPath('/ar')).toBe('/ar');
    expect(safeInternalPath('/ar/admin')).toBe('/ar/admin');
  });

  it('keeps the query and the fragment', () => {
    expect(safeInternalPath('/ar/products?q=%D8%B3&page=2#top')).toBe(
      '/ar/products?q=%D8%B3&page=2#top',
    );
  });

  it.each([
    // The case that was live: a backslash is a forward slash to the URL
    // parser, so this used to redirect to http://evil.example/.
    ['/\\evil.example', 'backslash'],
    ['/\\\\evil.example', 'double backslash'],
    ['//evil.example', 'protocol-relative'],
    ['/\\/evil.example', 'mixed slashes'],
    ['https://evil.example', 'absolute url'],
    ['http://evil.example', 'absolute url, http'],
    ['//evil.example/ar', 'protocol-relative with a believable path'],
    ['javascript:alert(1)', 'a scheme that is not a location at all'],
    ['', 'empty'],
    ['ar', 'relative, which would resolve against the current page'],
  ])('refuses %s (%s)', (raw) => {
    expect(safeInternalPath(raw)).toBe('/');
  });

  it('refuses null and undefined', () => {
    expect(safeInternalPath(null)).toBe('/');
    expect(safeInternalPath(undefined)).toBe('/');
  });

  it('uses the fallback it is given', () => {
    expect(safeInternalPath('//evil.example', '/ar')).toBe('/ar');
  });

  /**
   * The property that matters, stated as one assertion: whatever comes back,
   * resolving it against any origin must land on that origin. A future parser
   * change cannot quietly break this without failing here.
   */
  it('never returns something that resolves to another host', () => {
    const hostile = [
      '/\\evil.example',
      '//evil.example',
      '/\t/evil.example',
      '/\n//evil.example',
      '/\r\\evil.example',
      '/ //evil.example',
    ];

    for (const raw of hostile) {
      const resolved = new URL(safeInternalPath(raw), 'https://mps.example');
      expect(resolved.origin, `${JSON.stringify(raw)} escaped the origin`).toBe(
        'https://mps.example',
      );
    }
  });
});
