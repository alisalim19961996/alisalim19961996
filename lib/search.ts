/**
 * Arabic search normalisation.
 *
 * Arabic is written with variants that a customer does not think of as
 * different: ايفون / آيفون / أيفون are the same word to them, and a plain LIKE
 * would match none of the others. This folds those variants to one canonical
 * form so the trigram index can do its job.
 */

const DIACRITICS = /[ً-ْٰـ]/g; // harakat + tatweel

export function normalizeArabic(input: string): string {
  return input
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
}

/** Canonical form used for both indexing and querying. */
export function normalizeSearchTerm(input: string): string {
  return normalizeArabic(input)
    .toLowerCase()
    .replace(/[٠-٩]/g, (char) =>
      String(char.charCodeAt(0) - 0x0660),
    )
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Common Arabic spellings of brand and device names, mapped to the Latin term
 * actually stored in the catalogue. Extended from real SearchEvent data rather
 * than guessed at once and forgotten.
 */
const TRANSLITERATIONS: Record<string, string> = {
  ايفون: 'iphone',
  ايفن: 'iphone',
  ابل: 'apple',
  سامسونج: 'samsung',
  سامسونغ: 'samsung',
  جالكسي: 'galaxy',
  كالكسي: 'galaxy',
  شاومي: 'xiaomi',
  شياومي: 'xiaomi',
  ريدمي: 'redmi',
  ريلمي: 'realme',
  ريلمي_: 'realme',
  انفنكس: 'infinix',
  انفينكس: 'infinix',
  تكنو: 'tecno',
  هونر: 'honor',
  هواوي: 'huawei',
  اوبو: 'oppo',
  فيفو: 'vivo',
  نوكيا: 'nokia',
  موتورولا: 'motorola',
};

/**
 * Expand a query into the terms worth matching: the normalised query itself
 * plus any Latin equivalent of an Arabic token.
 */
export function expandSearchTerms(query: string): string[] {
  const normalized = normalizeSearchTerm(query);
  if (!normalized) return [];

  const terms = new Set<string>([normalized]);

  for (const token of normalized.split(' ')) {
    const latin = TRANSLITERATIONS[token];
    if (latin) terms.add(latin);
  }

  return [...terms];
}
