/**
 * Pure rules for the catalogue's shape: brands, categories, product types and
 * the attribute definitions a product type is built from.
 *
 * This is what makes CLAUDE.md §6 true in practice rather than on paper.
 * "Adding laptops is one `ProductType` row and some attribute rows — no code"
 * was only true for someone holding a database client. Everything here exists
 * so the owner can do it from the dashboard instead.
 *
 * Framework-free on purpose (§17): a category tree with a cycle in it, or a
 * key that collides with an existing one, are exactly the cases worth a unit
 * test, and a test cannot import anything that carries `server-only`.
 */

/**
 * Keys are the stable identity of a product type or an attribute.
 *
 * Stricter than a slug: a key is written into `ProductTypeAttribute` links and
 * read by `parseAttributeValue` to decide which column a value lands in, so it
 * is code-shaped, not URL-shaped. Underscores are allowed because the seeded
 * keys use them (`screen_size`); dashes are not, so one spelling exists.
 */
export function isValidKey(key: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(key) && key.length <= 60;
}

/** Turn a name into a key candidate. Returns '' when there is nothing latin. */
export function keyify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/g, '');
}

/**
 * What `<input type="color">` shows before a brand has a colour.
 *
 * A colour input has no empty state — it must be given a valid hex — so this
 * is the one it falls back to, and it is here rather than in the component
 * because the no-hex-in-UI guardrail is right about it: it is not a design
 * token (it never paints anything) and it is not per-row data either.
 */
export const EMPTY_ACCENT_INPUT = '#000000';

/** An example in the accent-colour field's placeholder. Samsung's blue. */
export const ACCENT_COLOR_EXAMPLE = '#1428A0';

/**
 * A brand's accent colour.
 *
 * The one place a hex value legitimately lives outside `@theme` (§10): it is
 * per-row data, it differs for every brand, and it is only ever painted as a
 * small identity dot. Six digits, because three-digit shorthand would give two
 * spellings of the same colour and the comparison is done as a string.
 */
export function isValidAccentColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

// ---------------------------------------------------------------------------
// The category tree
// ---------------------------------------------------------------------------

export interface CategoryNode {
  id: string;
  parentId: string | null;
}

export interface FlatCategory<T extends CategoryNode> {
  node: T;
  depth: number;
}

/**
 * Depth-first order with a depth for each row, so a `<select>` can indent and
 * a table can show the tree without a recursive component.
 *
 * A node whose parent is missing — deleted in another tab, or filtered out —
 * is treated as a root rather than dropped. A category that vanishes from the
 * screen while still owning products is the worse failure: the owner cannot
 * see it to fix it.
 */
export function flattenTree<T extends CategoryNode>(
  nodes: readonly T[],
  compare: (a: T, b: T) => number = () => 0,
): FlatCategory<T>[] {
  const ids = new Set(nodes.map((node) => node.id));
  const byParent = new Map<string | null, T[]>();

  for (const node of nodes) {
    const parent = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    const siblings = byParent.get(parent) ?? [];
    siblings.push(node);
    byParent.set(parent, siblings);
  }

  const out: FlatCategory<T>[] = [];
  // `seen` is not belt-and-braces: `parentId` comes from a form, and a cycle
  // would otherwise recurse until the stack gives out — on the server.
  const seen = new Set<string>();

  const walk = (parentId: string | null, depth: number) => {
    for (const node of (byParent.get(parentId) ?? []).sort(compare)) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      out.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };

  walk(null, 0);

  // Anything left is inside a cycle and would never be reachable from a root.
  for (const node of nodes) {
    if (!seen.has(node.id)) out.push({ node, depth: 0 });
  }

  return out;
}

/**
 * Every category that cannot be this one's parent: itself and its descendants.
 *
 * Offering them would let the owner build a loop with one click, and the loop
 * is not visible afterwards — the branch simply disappears from the tree.
 */
export function descendantIds(
  nodes: readonly CategoryNode[],
  rootId: string,
): Set<string> {
  const out = new Set<string>([rootId]);
  let grew = true;

  // Repeated passes rather than recursion: the input may already contain a
  // cycle, and this must terminate on one.
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (node.parentId && out.has(node.parentId) && !out.has(node.id)) {
        out.add(node.id);
        grew = true;
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Attribute options
// ---------------------------------------------------------------------------

export interface AttributeOptionDraft {
  value: string;
  labelAr: string;
  labelEn: string;
}

export type OptionsErrorKey = 'optionValueInvalid' | 'optionValueDuplicate';

export type OptionsResult =
  | { ok: true; options: AttributeOptionDraft[] }
  | { ok: false; error: OptionsErrorKey; field: string };

/**
 * Clean up the option rows of an ENUM attribute.
 *
 * `AttributeOption.value` is what a `ProductAttributeValue` row points at and
 * what a catalogue filter puts in the URL, so it is key-shaped and unique
 * within its definition — the database says so too (`@@unique`). Catching a
 * duplicate here names the offending row; letting Postgres catch it produces a
 * constraint name and no idea which of six rows to look at.
 *
 * Blank rows are dropped rather than rejected: the editor renders a spare row
 * at the bottom, and submitting the form untouched must not be an error.
 */
export function normaliseOptions(
  drafts: readonly AttributeOptionDraft[],
): OptionsResult {
  const options: AttributeOptionDraft[] = [];
  const seen = new Set<string>();

  for (const draft of drafts) {
    const value = draft.value.trim();
    const labelAr = draft.labelAr.trim();
    const labelEn = draft.labelEn.trim();

    if (!value && !labelAr && !labelEn) continue;

    if (!isValidKey(value)) {
      return { ok: false, error: 'optionValueInvalid', field: value || labelEn };
    }
    if (seen.has(value)) {
      return { ok: false, error: 'optionValueDuplicate', field: value };
    }

    seen.add(value);
    // A missing label falls back to the other language rather than to the key:
    // a spec table reading "128" is worse than one reading "128 GB" twice.
    options.push({
      value,
      labelAr: labelAr || labelEn || value,
      labelEn: labelEn || labelAr || value,
    });
  }

  return { ok: true, options };
}

/**
 * Sort orders as consecutive integers.
 *
 * The forms let the owner drag or renumber rows, which produces gaps and ties.
 * Ties are the problem: two rows with `sortOrder: 0` come back in whatever
 * order Postgres feels like, so the list reorders itself between visits.
 */
export function normaliseSortOrder<T>(
  rows: readonly T[],
  read: (row: T) => number,
): number[] {
  return rows
    .map((row, index) => ({ index, sort: read(row) }))
    .sort((a, b) => a.sort - b.sort || a.index - b.index)
    .map((entry, position) => ({ index: entry.index, position }))
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.position);
}

// ---------------------------------------------------------------------------
// Unique-constraint violations
// ---------------------------------------------------------------------------

/**
 * Which field a unique violation is about: the slug, or the key.
 *
 * Naming the wrong one is worse than saying nothing — it sends the owner to
 * edit a field that was never the problem. And the naive check is a trap that
 * has already been sprung here: Postgres names a unique index
 * `<table>_<column>_key`, so `brand_slug_key` **contains the word "key"**, and
 * a `constraint.includes('key')` test reported every duplicate slug as a
 * duplicate key. An integration test against a real database caught it; no
 * unit test could, because the name only exists once Postgres has refused the
 * write.
 *
 * The input is whatever `server/db/diagnose.ts` could recover — a column name
 * from `meta.target`, an index name from the driver adapter, or both joined —
 * so each part is examined and the trailing `_key` is stripped as the suffix
 * convention it is before anything is matched.
 */
export function collidingField(constraint: string): 'slug' | 'key' | null {
  for (const raw of constraint.split(',')) {
    const part = raw.trim();
    const column = part.endsWith('_key') ? part.slice(0, -'_key'.length) : part;

    if (column === 'slug' || column.endsWith('_slug')) return 'slug';
    if (column === 'key' || column.endsWith('_key')) return 'key';
  }
  return null;
}

/**
 * The five specification data types, as plain strings.
 *
 * Here rather than beside the Zod schema for the same reason the catalogue's
 * URL helpers moved to `lib/domain/catalogue-url.ts`: the attribute form is a
 * client component and needs only this list to draw a `<select>`, but
 * importing it from `schemas/taxonomy.ts` dragged the whole Zod runtime into
 * the dashboard's bundle. `schemas/taxonomy.ts` proves at compile time that
 * these match Prisma's `AttributeDataType`, so the list cannot drift from the
 * column it writes to.
 *
 * Ordered as the owner meets them, not as the enum declares them.
 */
export const ATTRIBUTE_TYPE_VALUES = [
  'TEXT',
  'INT',
  'DECIMAL',
  'BOOLEAN',
  'ENUM',
] as const;

export type AttributeTypeValue = (typeof ATTRIBUTE_TYPE_VALUES)[number];
