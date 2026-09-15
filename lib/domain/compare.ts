/**
 * Turning products into a comparison table.
 *
 * Pure, and deliberately ignorant of phones: a row exists because some product
 * has a value for that specification, and the specifications come from the
 * product type's own `ProductTypeAttribute` links (§6). Adding laptops adds
 * laptop rows here with no code changing, which is the same property the
 * product page and the admin form have.
 *
 * It lives in lib/domain rather than beside the query because this is the part
 * worth unit-testing — the alignment of values to columns, and which rows
 * survive — and anything under `server/` carries `import 'server-only'` and
 * cannot be imported by a unit test (§17).
 */

export interface ComparableProduct {
  slug: string;
  /** Specification key → what this product's value reads as. */
  specs: ReadonlyMap<string, { label: string; value: string }>;
  /** Specification key → where its product type puts it. */
  order: ReadonlyMap<string, number>;
}

export interface ComparisonRow {
  key: string;
  label: string;
  /**
   * One entry per product, in the same order as the products given — `null`
   * where that product has no value.
   *
   * Aligned by position rather than keyed by slug because the table renders
   * columns in that order, and a lookup per cell is one place for the columns
   * and the values to disagree.
   */
  values: (string | null)[];
  /**
   * Whether the products actually differ here.
   *
   * A row where every product says 5000 mAh is worth showing — a shopper wants
   * to know they match — but it is not worth drawing the eye to. Products with
   * no value do not count as disagreement: a missing spec is missing
   * information, not a difference.
   */
  differs: boolean;
}

export function buildComparisonRows(
  products: readonly ComparableProduct[],
): ComparisonRow[] {
  if (products.length === 0) return [];

  /*
    The union, not the intersection. An intersection would hide everything the
    moment two products of different types were compared, which reads as a
    broken page rather than as an answer; the union shows what each one has and
    a dash where the other has nothing, which is the honest version.
  */
  const labels = new Map<string, string>();
  const rank = new Map<string, number>();

  for (const product of products) {
    for (const [key, spec] of product.specs) {
      if (!labels.has(key)) labels.set(key, spec.label);

      // The earliest position any product's type gives this specification, so
      // a phone's ordering still holds when it is compared with a tablet.
      const order = product.order.get(key) ?? Number.MAX_SAFE_INTEGER;
      const existing = rank.get(key);
      if (existing === undefined || order < existing) rank.set(key, order);
    }
  }

  const rows: ComparisonRow[] = [];

  for (const [key, label] of labels) {
    const values = products.map((product) => product.specs.get(key)?.value ?? null);
    const present = values.filter((value): value is string => value !== null);
    rows.push({
      key,
      label,
      values,
      differs: new Set(present).size > 1,
    });
  }

  return rows.sort((a, b) => {
    const byRank =
      (rank.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.key) ?? Number.MAX_SAFE_INTEGER);
    // A stable tiebreak, so two specifications sharing a position do not swap
    // between renders and make the table look like it is shuffling.
    return byRank !== 0 ? byRank : a.key.localeCompare(b.key);
  });
}
