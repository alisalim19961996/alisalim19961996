import { describe, expect, it } from 'vitest';
import { excerptFromBody, isLiveArticle, parseArticleBody } from '@/lib/domain/blog';

describe('parseArticleBody', () => {
  it('reads headings, paragraphs and lists', () => {
    const body = [
      '## كيف تختار',
      '',
      'أول شي فكّر بالميزانية.',
      '',
      '- الشاشة',
      '- البطارية',
      '',
      'وبعدين قرر.',
    ].join('\n');

    expect(parseArticleBody(body)).toEqual([
      { kind: 'heading', text: 'كيف تختار' },
      { kind: 'paragraph', text: 'أول شي فكّر بالميزانية.' },
      { kind: 'list', items: ['الشاشة', 'البطارية'] },
      { kind: 'paragraph', text: 'وبعدين قرر.' },
    ]);
  });

  it('joins wrapped lines into one paragraph', () => {
    // A text box wraps where the window ends, not where the sentence does.
    expect(parseArticleBody('one\ntwo\nthree')).toEqual([
      { kind: 'paragraph', text: 'one two three' },
    ]);
  });

  it('reads the same on Windows line endings', () => {
    // The owner is on Windows; §18 has paid for this assumption twice already.
    expect(parseArticleBody('## A\r\n\r\n- x\r\n- y')).toEqual([
      { kind: 'heading', text: 'A' },
      { kind: 'list', items: ['x', 'y'] },
    ]);
  });

  it('closes a list when ordinary text follows it', () => {
    expect(parseArticleBody('- a\n- b\nafter')).toEqual([
      { kind: 'list', items: ['a', 'b'] },
      { kind: 'paragraph', text: 'after' },
    ]);
  });

  it('never fails, whatever is in the box', () => {
    // Mid-sentence is the normal state of a draft. An owner must never meet a
    // parser error where their article should be.
    for (const body of ['', '   ', '##', '## ', '-', '- ', '\n\n\n', '## a\n- ']) {
      expect(() => parseArticleBody(body)).not.toThrow();
    }
    // A marker with nothing after it is a slip, not a heading: it produces no
    // block rather than an empty one that pushes the article apart.
    expect(parseArticleBody('##')).toEqual([]);
    expect(parseArticleBody('## ')).toEqual([]);
    // But a sentence that merely opens with the characters stays a sentence.
    expect(parseArticleBody('##hashtag')).toEqual([
      { kind: 'paragraph', text: '##hashtag' },
    ]);
  });

  it('treats markup as text, because that is all it can produce', () => {
    // The whole reason this returns blocks instead of HTML: there is no code
    // path from here to markup, so a pasted script tag is a sentence.
    const [block] = parseArticleBody('<script>alert(1)</script> buy phones');
    expect(block).toEqual({
      kind: 'paragraph',
      text: '<script>alert(1)</script> buy phones',
    });
  });
});

describe('excerptFromBody', () => {
  it('takes the first paragraph, not the heading', () => {
    expect(excerptFromBody('## Title\n\nThe opening line.')).toBe('The opening line.');
  });

  it('leaves a short paragraph alone', () => {
    expect(excerptFromBody('Short.')).toBe('Short.');
  });

  it('cuts at a word boundary and marks the cut', () => {
    const excerpt = excerptFromBody('alpha bravo charlie delta echo foxtrot', 20);
    expect(excerpt).toBe('alpha bravo charlie…');
    expect(excerpt.length).toBeLessThanOrEqual(21);
  });

  it('is empty when there is no prose to take', () => {
    expect(excerptFromBody('## Only a heading')).toBe('');
    expect(excerptFromBody('')).toBe('');
  });
});

describe('isLiveArticle', () => {
  const now = new Date('2026-09-15T12:00:00Z');

  it('needs both the decision and the date', () => {
    expect(
      isLiveArticle({ isPublished: true, publishedAt: new Date('2026-09-01') }, now),
    ).toBe(true);
    expect(
      isLiveArticle({ isPublished: false, publishedAt: new Date('2026-09-01') }, now),
    ).toBe(false);
    expect(isLiveArticle({ isPublished: true, publishedAt: null }, now)).toBe(false);
  });

  it('keeps a future date hidden', () => {
    // What lets the owner write three guides on a Sunday and release them one
    // at a time.
    expect(
      isLiveArticle({ isPublished: true, publishedAt: new Date('2026-09-20') }, now),
    ).toBe(false);
  });
});
