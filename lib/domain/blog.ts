/**
 * Buying guides: the rules, and the little format the owner writes them in.
 *
 * The store needed articles and had nowhere to put them — `BlogPost` has been
 * in the schema since Phase 1 with no screen to write into it, which is why
 * `/guides` was built from live data instead (§12). This is the missing half.
 *
 * **The body is parsed into blocks, never into HTML.** A Markdown library
 * would be a dependency to pin, an XSS surface to argue about, and a second
 * thing for the Content-Security-Policy to accommodate — for a page whose
 * whole requirement is "headings, paragraphs and bullet points". Parsing to
 * data and rendering React elements means a pasted `<script>` is text, by
 * construction rather than by escaping: there is no code path that turns this
 * output into markup.
 */

export type ArticleBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

/**
 * What the owner types at the start of a line to mean each thing.
 *
 * The marker must be followed by a space or nothing at all, so a sentence that
 * happens to open with `##something` stays a sentence. A marker with no text
 * after it produces no block: a stray `##` on its own line is a slip, and
 * rendering an empty heading would push the article apart for no reason.
 */
const HEADING = /^##(\s+(?<text>.*))?$/;
const LIST_PREFIX = '- ';

/**
 * Turn the body into blocks.
 *
 * Deliberately forgiving: this is a text box, not a compiler. A line that is
 * none of the known shapes is a paragraph, consecutive `- ` lines gather into
 * one list, and a blank line ends whatever was open. Nothing here can fail —
 * an owner mid-sentence must never see an error where their article should be.
 */
export function parseArticleBody(body: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list });
      list = [];
    }
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  // Split on all three line endings: the owner is on Windows, and §18 has
  // already paid twice for code that assumed \n.
  for (const raw of body.split(/\r\n|\r|\n/)) {
    const line = raw.trim();

    if (line === '') {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const text = heading.groups?.['text']?.trim() ?? '';
      if (text) blocks.push({ kind: 'heading', text });
      continue;
    }

    if (line.startsWith(LIST_PREFIX)) {
      // A list interrupts a paragraph, but a paragraph does not interrupt a
      // list mid-flow — the next non-list line closes it.
      if (paragraph.length > 0) {
        blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
        paragraph = [];
      }
      const text = line.slice(LIST_PREFIX.length).trim();
      if (text) list.push(text);
      continue;
    }

    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list });
      list = [];
    }
    paragraph.push(line);
  }

  flush();
  return blocks;
}

/**
 * The first paragraph, trimmed to a length that fits a card.
 *
 * Used only when the owner leaves the excerpt empty. Cutting at a word
 * boundary rather than mid-word, because the alternative reads as a bug —
 * and never adding an ellipsis to something that was already short enough.
 */
export function excerptFromBody(body: string, limit = 160): string {
  const firstParagraph = parseArticleBody(body).find(
    (block) => block.kind === 'paragraph',
  );
  const text = firstParagraph?.text ?? '';

  if (text.length <= limit) return text;

  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Whether an article is ready to be shown to a customer.
 *
 * Both halves matter and they are separate columns: `isPublished` is the
 * owner's decision, `publishedAt` is when it took effect. A post published
 * with a future date stays hidden — which is what lets the owner write three
 * guides on a Sunday and let them out one at a time.
 */
export function isLiveArticle(
  post: { isPublished: boolean; publishedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (!post.isPublished) return false;
  if (!post.publishedAt) return false;
  return post.publishedAt.getTime() <= now.getTime();
}
