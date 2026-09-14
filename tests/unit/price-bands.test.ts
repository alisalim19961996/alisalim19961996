import { describe, expect, it } from 'vitest';
import { niceCeil, priceBands } from '@/lib/domain/price-bands';

describe('niceCeil', () => {
  it.each([
    [137_000, 150_000],
    [640_000, 750_000],
    [300_000, 300_000],
    [1_213_000, 1_500_000],
    [1, 1],
    [0, 0],
  ])('rounds %i up to %i', (value, expected) => {
    expect(niceCeil(value)).toBe(expected);
  });

  it('leaves a value that is already 1, 2 or 5 × a power of ten alone', () => {
    for (const value of [100_000, 200_000, 500_000, 1_000_000]) {
      expect(niceCeil(value), String(value)).toBe(value);
    }
  });

  it('never rounds down, which would put products below the first band', () => {
    for (const value of [1, 7, 99, 101, 249_999, 750_001]) {
      expect(niceCeil(value)).toBeGreaterThanOrEqual(value);
    }
  });
});

describe('priceBands', () => {
  it('covers the whole range with no gap and no overlap', () => {
    const bands = priceBands(150_000, 2_000_000, 3);
    expect(bands[0]?.min).toBe(0);
    expect(bands[bands.length - 1]?.max).toBeNull();

    for (let i = 1; i < bands.length; i++) {
      expect(bands[i]?.min).toBe(bands[i - 1]?.max);
    }
  });

  it('gives round numbers a person would say out loud', () => {
    // Raw cuts land at 766,666 and 1,383,333, which round to a million and
    // to one and a half — both below the most expensive product, so all three
    // brackets hold something.
    expect(priceBands(150_000, 2_000_000, 3)).toEqual([
      { min: 0, max: 1_000_000 },
      { min: 1_000_000, max: 1_500_000 },
      { min: 1_500_000, max: null },
    ]);
  });

  it('never puts a boundary at or above the highest price', () => {
    for (const [min, max] of [
      [150_000, 2_000_000],
      [90_000, 500_000],
      [1_000_000, 1_200_000],
    ] as const) {
      for (const band of priceBands(min, max, 4)) {
        if (band.max !== null) expect(band.max, `${min}..${max}`).toBeLessThan(max);
      }
    }
  });

  it('falls back to one band when the shop sells a single price', () => {
    // Three bands around one product would be two links that match nothing.
    expect(priceBands(500_000, 500_000)).toEqual([{ min: 0, max: null }]);
  });

  it('drops a boundary that rounding collapsed onto the previous one', () => {
    // A narrow range rounds several cuts to the same number; keeping them
    // would produce a band whose min equals its max.
    const bands = priceBands(95_000, 105_000, 4);
    const edges = bands.map((b) => b.max).filter((m) => m !== null);
    expect(new Set(edges).size).toBe(edges.length);
    for (const band of bands) {
      if (band.max !== null) expect(band.max).toBeGreaterThan(band.min);
    }
  });

  it('refuses nonsense rather than inventing a range', () => {
    expect(priceBands(Number.NaN, 100)).toEqual([]);
    expect(priceBands(0, 100, 0)).toEqual([]);
  });
});
