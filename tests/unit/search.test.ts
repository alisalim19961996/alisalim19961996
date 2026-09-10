import { describe, expect, it } from 'vitest';
import { expandSearchTerms, normalizeArabic, normalizeSearchTerm } from '@/lib/search';

describe('normalizeArabic', () => {
  it('folds alef variants a customer does not distinguish', () => {
    expect(normalizeArabic('ايفون')).toBe('ايفون');
    expect(normalizeArabic('آيفون')).toBe('ايفون');
    expect(normalizeArabic('أيفون')).toBe('ايفون');
    expect(normalizeArabic('إيفون')).toBe('ايفون');
  });

  it('strips diacritics and tatweel', () => {
    expect(normalizeArabic('سَامْسُونْج')).toBe('سامسونج');
    expect(normalizeArabic('ســامسونج')).toBe('سامسونج');
  });

  it('folds taa marbuta and alef maqsura', () => {
    expect(normalizeArabic('شاشة')).toBe('شاشه');
    expect(normalizeArabic('مصطفى')).toBe('مصطفي');
  });
});

describe('normalizeSearchTerm', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeSearchTerm('  Galaxy   S24!! ')).toBe('galaxy s24');
  });

  it('converts Arabic-Indic digits so "١٢" matches "12"', () => {
    expect(normalizeSearchTerm('نوت ١٢')).toBe('نوت 12');
  });
});

describe('expandSearchTerms', () => {
  it('reaches the Latin catalogue entry from an Arabic spelling', () => {
    expect(expandSearchTerms('ايفون')).toContain('iphone');
    expect(expandSearchTerms('آيفون')).toContain('iphone');
    expect(expandSearchTerms('سامسونج')).toContain('samsung');
    expect(expandSearchTerms('سامسونغ')).toContain('samsung');
  });

  it('keeps the original normalised query alongside the expansion', () => {
    const terms = expandSearchTerms('تكنو كامون');
    expect(terms).toContain('تكنو كامون');
    expect(terms).toContain('tecno');
  });

  it('returns nothing for an empty query', () => {
    expect(expandSearchTerms('   ')).toEqual([]);
  });
});
