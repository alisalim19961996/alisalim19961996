import { z } from 'zod';

/**
 * An empty input is MISSING, not zero.
 *
 * `z.coerce.number()` runs `Number(value)`, and `Number('')` is 0. Every
 * number box in the dashboard therefore has a silent second meaning: clearing
 * a price made a variant free, clearing the warranty box made it a zero-month
 * warranty, and — the one that cost real money on every order — clearing or
 * never filling the delivery fee made delivery to that governorate free. All
 * of them save without complaint, because zero is a perfectly valid number.
 *
 * Turning blank into `undefined` first lets `.default()` apply where there is
 * one and `required` fire where there is not. Whitespace counts as blank,
 * because a space is what a half-cleared input leaves behind.
 *
 * It lives here rather than beside one schema because the mistake is not
 * specific to products: it is what `z.coerce.number()` does, everywhere.
 */
export function blankIsMissing<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema,
  );
}
