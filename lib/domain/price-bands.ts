/**
 * Budget brackets for the buying guide, derived from what the shop actually
 * sells.
 *
 * Hard-coding "under 300,000" would be a commercial claim written in code
 * (§13.13) and would quietly become wrong the day the catalogue moves upmarket
 * — a bracket nobody can buy anything in, with no error to notice. These come
 * from the real minimum and maximum published price instead, so they cannot
 * describe a shop that does not exist.
 *
 * The boundaries are rounded to something a person would say out loud. An
 * honest band of "217,400 – 634,800" is worse than a slightly loose one of
 * "200,000 – 600,000": the numbers are navigation, not a price list, and the
 * catalogue re-filters on the real values anyway.
 */

export interface PriceBand {
  /** Inclusive. */
  min: number;
  /** Exclusive, or null for the open-ended top band. */
  max: number | null;
}

/**
 * The multipliers of a power of ten that read as round numbers.
 *
 * Wider than the usual 1-2-5 set, which was tried first and proved too coarse
 * for dinars: it rounded 1,213,000 up to two million, which then sat above the
 * most expensive phone in the shop and collapsed three budget brackets into
 * two. These land on 250,000 / 750,000 / 1,500,000 — figures an Iraqi shopper
 * says out loud — without ever inventing a precision the data does not have.
 */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10] as const;

/** Round up to the nearest nice multiple of a power of ten. */
export function niceCeil(value: number): number {
  if (value <= 0) return 0;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;

  const step = NICE_STEPS.find((candidate) => normalised <= candidate) ?? 10;
  return step * magnitude;
}

/**
 * Split a price range into bands.
 *
 * The first is open at the bottom (min 0) and the last open at the top, so
 * every product in the catalogue falls into exactly one — including anything
 * added after this was computed.
 */
export function priceBands(min: number, max: number, count = 3): PriceBand[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count < 1) return [];
  // One price, or nonsense input: a single "everything" band is honest, and
  // three bands around one product would be two dead links.
  if (max <= min) return [{ min: 0, max: null }];

  const cuts: number[] = [];
  for (let i = 1; i < count; i++) {
    const raw = min + ((max - min) * i) / count;
    const cut = niceCeil(raw);

    // Two guards, both about bands nobody can use:
    //   - a rounding that collapsed onto the previous boundary leaves a band
    //     whose min equals its max, which can never match anything;
    //   - a cut at or above the highest price leaves a top band holding only
    //     the single most expensive product, which reads as a broken link.
    if (cut <= (cuts[cuts.length - 1] ?? 0)) continue;
    if (cut >= max) continue;
    cuts.push(cut);
  }

  const bands: PriceBand[] = [];
  let lower = 0;
  for (const cut of cuts) {
    bands.push({ min: lower, max: cut });
    lower = cut;
  }
  bands.push({ min: lower, max: null });

  return bands;
}
