import { describe, expect, it } from 'vitest';
import {
  formatIraqiPhone,
  isValidIraqiPhone,
  normalizeIraqiPhone,
  toWhatsappNumber,
} from '@/lib/phone';

describe('normalizeIraqiPhone', () => {
  it('normalises every shape a customer might type to one stored value', () => {
    const expected = '+9647701234567';
    expect(normalizeIraqiPhone('07701234567')).toBe(expected);
    expect(normalizeIraqiPhone('+9647701234567')).toBe(expected);
    expect(normalizeIraqiPhone('009647701234567')).toBe(expected);
    expect(normalizeIraqiPhone('9647701234567')).toBe(expected);
    expect(normalizeIraqiPhone('0770 123 4567')).toBe(expected);
    expect(normalizeIraqiPhone('0770-123-4567')).toBe(expected);
  });

  it('accepts Arabic-Indic digits', () => {
    expect(normalizeIraqiPhone('٠٧٧٠١٢٣٤٥٦٧')).toBe('+9647701234567');
  });

  it('accepts every live Iraqi mobile prefix', () => {
    for (const prefix of ['75', '76', '77', '78', '79']) {
      expect(isValidIraqiPhone(`0${prefix}01234567`)).toBe(true);
    }
  });

  it('rejects numbers that are not Iraqi mobiles', () => {
    expect(normalizeIraqiPhone('07401234567')).toBeNull(); // invalid prefix
    expect(normalizeIraqiPhone('0770123456')).toBeNull(); // too short
    expect(normalizeIraqiPhone('077012345678')).toBeNull(); // too long
    expect(normalizeIraqiPhone('+15551234567')).toBeNull(); // wrong country
    expect(normalizeIraqiPhone('')).toBeNull();
    expect(normalizeIraqiPhone('not a phone')).toBeNull();
  });
});

describe('formatIraqiPhone', () => {
  it('renders the local form people recognise', () => {
    expect(formatIraqiPhone('+9647701234567')).toBe('0770 123 4567');
  });
});

describe('toWhatsappNumber', () => {
  it('strips the plus for wa.me links', () => {
    expect(toWhatsappNumber('07701234567')).toBe('9647701234567');
    expect(toWhatsappNumber('invalid')).toBeNull();
  });
});
