import { MAX_COMPARE, toggleCompareSlug } from '@/lib/domain/compare-url';

/**
 * Which products are ticked for comparison, in this browser.
 *
 * `localStorage`, deliberately, and it is the one piece of state in this store
 * that belongs there. The comparison itself lives in the URL — that is the
 * thing worth sharing (§8) — but the SELECTION being built up across the
 * catalogue, a rail on the homepage and the wishlist is a per-viewer
 * convenience with nothing to share and nothing to keep. It has no business in
 * the database, where it would need an account, and none in the URL, where
 * every filter change would have to carry it.
 *
 * Exposed as an **external store** rather than as a function components call
 * in an effect. That is not ceremony: `localStorage` cannot be read during
 * render without a hydration mismatch, and reading it in an effect to call
 * `setState` is the pattern `react-hooks/set-state-in-effect` exists to stop.
 * `useSyncExternalStore` is what this shape is for — subscribe, snapshot, and
 * a server snapshot that is simply empty.
 *
 * Every access is wrapped: in a private window, or with site data blocked, the
 * accessor throws rather than returning null, and an unhandled throw here
 * would take the product card down with it.
 */

const KEY = 'mps.compare';

/** The signal that the selection changed, so the tray and every tick re-read. */
export const COMPARE_CHANGED_EVENT = 'mps:compare-changed';

/**
 * One frozen empty array, returned by identity.
 *
 * `useSyncExternalStore` compares snapshots by reference and re-renders when
 * they differ, so a fresh `[]` on every call is an infinite loop.
 */
const EMPTY: readonly string[] = Object.freeze([]);

let snapshot: readonly string[] = EMPTY;
let loaded = false;

function readStorage(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;

    const slugs = parsed
      .filter((entry): entry is string => typeof entry === 'string')
      // Re-clamped on the way out, not only on the way in: this value survives
      // deploys, so a list written by an older build with a different ceiling
      // must not put a fifth column on the page.
      .slice(0, MAX_COMPARE);

    return slugs.length === 0 ? EMPTY : slugs;
  } catch {
    return EMPTY;
  }
}

export function getCompareSnapshot(): readonly string[] {
  if (typeof window === 'undefined') return EMPTY;
  if (!loaded) {
    snapshot = readStorage();
    loaded = true;
  }
  return snapshot;
}

/** Stable across calls, so hydration renders the same thing the server sent. */
export function getCompareServerSnapshot(): readonly string[] {
  return EMPTY;
}

export function subscribeCompare(listener: () => void): () => void {
  const onChange = () => {
    loaded = false;
    listener();
  };

  window.addEventListener(COMPARE_CHANGED_EVENT, onChange);
  // A second tab writing the same key has to reach this one, or two open tabs
  // disagree about what is ticked and the tray contradicts the cards.
  window.addEventListener('storage', onChange);

  return () => {
    window.removeEventListener(COMPARE_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function write(slugs: readonly string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(slugs));
  } catch {
    // Storage blocked or full. The tick still works for this page, which is
    // the degradation worth having — the alternative is a control that throws.
  }
  loaded = false;
  window.dispatchEvent(new Event(COMPARE_CHANGED_EVENT));
}

/**
 * Tick or untick a product. Returns whether it is now selected, and whether
 * the attempt was refused because the list is full — the caller needs the
 * second to say so, rather than letting the fifth tick do nothing in silence.
 */
export function toggleCompare(slug: string): { selected: boolean; full: boolean } {
  const current = getCompareSnapshot();
  const next = toggleCompareSlug(current, slug);

  const refused = next.length === current.length && !current.includes(slug);
  if (!refused) write(next);

  return { selected: next.includes(slug), full: refused };
}

export function removeFromCompare(slug: string): void {
  write(getCompareSnapshot().filter((entry) => entry !== slug));
}

export function clearCompare(): void {
  write([]);
}
