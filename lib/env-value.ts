/**
 * What an empty environment variable means.
 *
 * It means "not set". That sounds obvious and is not how a schema reads it by
 * default: `z.string().min(10).optional()` accepts a *missing* variable and
 * rejects an empty one, so `GOOGLE_CLIENT_ID=""` — exactly how `.env.example`
 * ships every optional key — fails validation and takes the whole site down at
 * boot with a message about a value nobody was trying to use.
 *
 * That is not a hypothetical. It happened: a store with no Google credentials
 * could not render a single page, and the error named a feature the owner had
 * not asked for.
 *
 * So every optional variable is preprocessed through this. Whitespace counts
 * as empty, because a trailing space after `=` is invisible in an editor and
 * would otherwise be a value.
 */
export function blankToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.trim() === '' ? undefined : value;
}
