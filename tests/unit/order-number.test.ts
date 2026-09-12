import { describe, expect, it } from 'vitest';
import {
  dayOfYear,
  formatOrderNumber,
  normalizeOrderNumber,
  orderNumberDayKey,
} from '@/lib/domain/order-number';

const at = (iso: string) => new Date(iso);

describe('dayOfYear', () => {
  it('counts from 1 on the first of January', () => {
    expect(dayOfYear(at('2026-01-01T00:00:00Z'))).toBe(1);
  });

  it('handles the end of a common year', () => {
    expect(dayOfYear(at('2026-12-31T23:59:59Z'))).toBe(365);
  });

  it('handles a leap year', () => {
    expect(dayOfYear(at('2028-12-31T00:00:00Z'))).toBe(366);
    expect(dayOfYear(at('2028-03-01T00:00:00Z'))).toBe(61);
  });
});

describe('formatOrderNumber', () => {
  it('produces the documented shape', () => {
    // 2026-04-01 is day 91 of the year.
    expect(formatOrderNumber(at('2026-04-01T10:00:00Z'), 42)).toBe('MPS-26091-0042');
  });

  it('pads the day and the sequence', () => {
    expect(formatOrderNumber(at('2026-01-01T00:00:00Z'), 1)).toBe('MPS-26001-0001');
  });

  it('grows past four digits rather than wrapping into a collision', () => {
    expect(formatOrderNumber(at('2026-01-01T00:00:00Z'), 12_345)).toBe(
      'MPS-26001-12345',
    );
  });

  it('rejects a non-positive sequence', () => {
    expect(() => formatOrderNumber(at('2026-01-01T00:00:00Z'), 0)).toThrow();
  });
});

describe('orderNumberDayKey', () => {
  it('is stable for every order placed on the same UTC day', () => {
    expect(orderNumberDayKey(at('2026-04-01T00:00:01Z'))).toBe(
      orderNumberDayKey(at('2026-04-01T23:59:59Z')),
    );
  });
});

describe('normalizeOrderNumber', () => {
  it('accepts the number exactly as printed', () => {
    expect(normalizeOrderNumber('MPS-26091-0042')).toBe('MPS-26091-0042');
  });

  it('accepts lowercase and surrounding whitespace', () => {
    expect(normalizeOrderNumber('  mps-26091-0042 ')).toBe('MPS-26091-0042');
  });

  it('accepts it typed without the prefix', () => {
    // The confirmation page shows the number in large type; people retype the
    // digits and drop the "MPS-".
    expect(normalizeOrderNumber('26091-0042')).toBe('MPS-26091-0042');
  });

  it('accepts Arabic-Indic digits', () => {
    expect(normalizeOrderNumber('MPS-٢٦٠٩١-٠٠٤٢')).toBe('MPS-26091-0042');
    expect(normalizeOrderNumber('MPS-۲۶۰۹۱-۰۰۴۲')).toBe('MPS-26091-0042');
  });

  it('accepts an en dash or em dash pasted by a phone keyboard', () => {
    expect(normalizeOrderNumber('MPS–26091–0042')).toBe('MPS-26091-0042');
  });

  it('rejects anything that is not an order number', () => {
    expect(normalizeOrderNumber('')).toBeNull();
    expect(normalizeOrderNumber('hello')).toBeNull();
    expect(normalizeOrderNumber('MPS-1-1')).toBeNull();
    expect(normalizeOrderNumber("MPS-26091-0042'; DROP TABLE order; --")).toBeNull();
  });
});
