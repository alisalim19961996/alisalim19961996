/**
 * Iraqi mobile numbers.
 *
 * Accepted input shapes (people type all of these):
 *   07701234567      local, 11 digits
 *   +9647701234567   E.164
 *   009647701234567  international prefix
 *   0770 123 4567    spaced or dashed
 *   ٠٧٧٠١٢٣٤٥٦٧      Arabic-Indic digits
 *
 * Everything is normalised to E.164 (+964...) for storage, so a customer is
 * never duplicated just because they typed their number differently.
 */

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Convert Arabic-Indic and Persian digits to Latin digits. */
export function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (char) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(char);
    if (arabicIndex !== -1) return String(arabicIndex);
    return String(EXTENDED_ARABIC_INDIC_DIGITS.indexOf(char));
  });
}

/**
 * Valid Iraqi mobile prefixes after the country code.
 * 75/76/77/78/79 cover Zain, Asiacell and Korek allocations.
 */
const IRAQI_MOBILE_PREFIX = /^7[5-9]\d{8}$/;

/** Normalise to E.164, or null when the number is not a valid Iraqi mobile. */
export function normalizeIraqiPhone(input: string): string | null {
  if (!input) return null;

  // Strip everything that is not a digit or a leading plus.
  let digits = toLatinDigits(input).replace(/[^\d+]/g, '');

  if (digits.startsWith('+964')) digits = digits.slice(4);
  else if (digits.startsWith('00964')) digits = digits.slice(5);
  else if (digits.startsWith('964')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  digits = digits.replace(/\D/g, '');

  if (!IRAQI_MOBILE_PREFIX.test(digits)) return null;
  return `+964${digits}`;
}

export function isValidIraqiPhone(input: string): boolean {
  return normalizeIraqiPhone(input) !== null;
}

/** Render a stored E.164 number in the local form people recognise. */
export function formatIraqiPhone(e164: string): string {
  const normalized = normalizeIraqiPhone(e164);
  if (!normalized) return e164;
  const national = normalized.slice(4);
  return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/** Build a wa.me link. Digits only, no plus. */
export function toWhatsappNumber(e164: string): string | null {
  const normalized = normalizeIraqiPhone(e164);
  return normalized ? normalized.replace('+', '') : null;
}
