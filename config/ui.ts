/**
 * UI constants that are tuned rather than derived.
 *
 * These were magic numbers scattered across components. Collected here so a
 * change is one edit with one reason, not a hunt through files — and so the
 * reasoning survives the person who chose the number.
 *
 * Colours, spacing and radii are NOT here: those are design tokens and live in
 * `app/globals.css` under `@theme`.
 */

/** Products per catalogue page. Four full rows of the 4-column desktop grid. */
export const PRODUCTS_PER_PAGE = 24;

/** Products in a homepage rail. One row at every breakpoint. */
export const RAIL_SIZE = 4;

/** Related products under a product page. */
export const RELATED_SIZE = 4;

/**
 * Scroll distance before the mobile buy bar appears, in pixels. Roughly past
 * the gallery and the variant picker on a phone, so the bar never duplicates
 * controls that are still on screen.
 */
export const MOBILE_BUY_BAR_OFFSET = 520;

/**
 * How far a related-product price may sit from the current one, as a fraction.
 * 0.4 means "within 40% either way" — close enough to be a genuine alternative.
 */
export const RELATED_PRICE_SPREAD = 0.4;
