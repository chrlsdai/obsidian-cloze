// @vitest-environment jsdom
/**
 * Test suite for the card-parsing module.
 *
 * Requires a DOM environment. Vitest picks this up from the
 * @vitest-environment annotation above, or set globally in vitest.config.ts:
 *   { test: { environment: 'jsdom' } }
 */

import { describe, it, expect } from '@jest/globals';
import { parseCards, parseCard, type ParsedCard } from '../src/parser';

// ─── DOM Builder Helpers ──────────────────────────────────────────────────────

/**
 * Creates a `.callout[data-callout="card"]` element.
 *
 * @param bodyHTML     - HTML placed inside `.callout-content`.
 * @param metadataText - Newline-separated `key: value` pairs. When supplied,
 *                       a `card-metadata` sub-callout is appended to the
 *                       content element.
 */
function makeCardEl(bodyHTML = '', metadataText?: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'callout';
  card.setAttribute('data-callout', 'card');

  const content = document.createElement('div');
  content.className = 'callout-content';
  content.innerHTML = bodyHTML;

  if (metadataText !== undefined) {
    content.appendChild(makeMetadataEl(metadataText));
  }

  card.appendChild(content);
  return card;
}

/**
 * Creates a `.callout[data-callout="card-metadata"]` element whose
 * `.callout-content` holds the given text verbatim.
 */
function makeMetadataEl(text: string): HTMLElement {
  const meta = document.createElement('div');
  meta.className = 'callout';
  meta.setAttribute('data-callout', 'card-metadata');

  const metaContent = document.createElement('div');
  metaContent.className = 'callout-content';
  metaContent.textContent = text;
  meta.appendChild(metaContent);
  return meta;
}

/** Wraps card elements in a container `<div>` suitable for `parseCards`. */
function wrapInDoc(...cards: HTMLElement[]): HTMLElement {
  const container = document.createElement('div');
  cards.forEach(c => container.appendChild(c));
  return container;
}

// ─── parseCards ──────────────────────────────────────────────────────────────

describe('parseCards', () => {
  // ── input validation ────────────────────────────────────────────────────────

  describe('input validation', () => {
    it('throws TypeError when documentEl is null', () => {
      expect(() => parseCards(null as any, 'Vault')).toThrow(TypeError);
    });

    it('throws TypeError when documentEl is a plain object', () => {
      expect(() => parseCards({} as any, 'Vault')).toThrow(TypeError);
    });

    it('throws TypeError when documentEl is a primitive', () => {
      expect(() => parseCards(42 as any, 'Vault')).toThrow(TypeError);
      expect(() => parseCards('div' as any, 'Vault')).toThrow(TypeError);
    });

    it('TypeError message identifies the bad argument', () => {
      expect(() => parseCards(42 as any, 'Vault'))
        .toThrow(/documentEl must be an HTMLElement/);
    });

    it('throws TypeError when vaultName is an empty string', () => {
      expect(() => parseCards(document.createElement('div'), ''))
        .toThrow(TypeError);
    });

    it('throws TypeError when vaultName is all whitespace', () => {
      expect(() => parseCards(document.createElement('div'), '   '))
        .toThrow(TypeError);
    });

    it('throws TypeError when vaultName is not a string at all', () => {
      const doc = document.createElement('div');
      expect(() => parseCards(doc, null as any)).toThrow(TypeError);
      expect(() => parseCards(doc, undefined as any)).toThrow(TypeError);
      expect(() => parseCards(doc, 42 as any)).toThrow(TypeError);
    });

    it('vaultName TypeError message mentions non-empty string', () => {
      expect(() => parseCards(document.createElement('div'), ''))
        .toThrow(/non-empty string/);
    });
  });

  // ── element discovery ───────────────────────────────────────────────────────

  describe('element discovery', () => {
    it('returns an empty array for an empty container', () => {
      expect(parseCards(document.createElement('div'), 'v')).toEqual([]);
    });

    it('ignores ordinary HTML elements (no card callouts)', () => {
      const doc = document.createElement('div');
      doc.innerHTML = '<p>text</p><section></section>';
      expect(parseCards(doc, 'v')).toHaveLength(0);
    });

    it('ignores callouts whose data-callout is not "card"', () => {
      const doc = document.createElement('div');
      doc.innerHTML = `
        <div class="callout" data-callout="note">
          <div class="callout-content"></div>
        </div>
        <div class="callout" data-callout="warning">
          <div class="callout-content"></div>
        </div>
        <div class="callout" data-callout="card-metadata">
          <div class="callout-content"></div>
        </div>
      `;
      expect(parseCards(doc, 'v')).toHaveLength(0);
    });

    it('finds a single card callout', () => {
      expect(parseCards(wrapInDoc(makeCardEl('<p>Hi</p>')), 'v')).toHaveLength(1);
    });

    it('finds multiple card callouts', () => {
      const doc = wrapInDoc(makeCardEl(), makeCardEl(), makeCardEl());
      expect(parseCards(doc, 'v')).toHaveLength(3);
    });

    it('preserves document order in the returned array', () => {
      const doc = wrapInDoc(
        makeCardEl('', 'id: 10'),
        makeCardEl('', 'id: 20'),
        makeCardEl('', 'id: 30'),
      );
      expect(parseCards(doc, 'v').map(c => c.id)).toEqual([10, 20, 30]);
    });

    it('finds card callouts nested inside other DOM elements', () => {
      const doc = document.createElement('div');
      const section = document.createElement('section');
      section.appendChild(makeCardEl('<p>nested</p>'));
      doc.appendChild(section);
      expect(parseCards(doc, 'v')).toHaveLength(1);
    });

    it('returns ParsedCard objects with the expected shape', () => {
      const [card] = parseCards(wrapInDoc(makeCardEl('<p>body</p>')), 'v');
      expect(card).toHaveProperty('valid');
      expect(card).toHaveProperty('tags');
      expect(card).toHaveProperty('cardFields');
      expect(card).toHaveProperty('text');
    });

    it('includes invalid cards in the result — does not silently drop them', () => {
      const doc = wrapInDoc(makeCardEl('', 'id: not-a-number'));
      const results = parseCards(doc, 'v');
      expect(results).toHaveLength(1);
      expect(results[0].valid).toBe(false);
    });
  });
});

// ─── parseCard ───────────────────────────────────────────────────────────────

describe('parseCard', () => {
  // ── input validation ────────────────────────────────────────────────────────

  describe('input validation', () => {
    it('throws TypeError when cardElement is null', () => {
      expect(() => parseCard(null as any, 'v')).toThrow(TypeError);
    });

    it('throws TypeError when cardElement is not an HTMLElement', () => {
      expect(() => parseCard(42 as any, 'v')).toThrow(TypeError);
      expect(() => parseCard({} as any, 'v')).toThrow(TypeError);
    });

    it('TypeError message identifies cardElement', () => {
      expect(() => parseCard(null as any, 'v')).toThrow(/cardElement/);
    });

    it('throws TypeError when vaultName is an empty string', () => {
      expect(() => parseCard(makeCardEl(), '')).toThrow(TypeError);
    });

    it('throws TypeError when vaultName is all whitespace', () => {
      expect(() => parseCard(makeCardEl(), '   ')).toThrow(TypeError);
    });

    it('vaultName TypeError message mentions non-empty string', () => {
      expect(() => parseCard(makeCardEl(), '')).toThrow(/non-empty string/);
    });
  });

  // ── structural contract ──────────────────────────────────────────────────────

  it('returns a value containing every ParsedCard key', () => {
    const result = parseCard(makeCardEl(), 'v');
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('tags');
    expect(result).toHaveProperty('cardFields');
    expect(result).toHaveProperty('text');
  });

  it('does not mutate the original DOM element', () => {
    const card = makeCardEl('<p>Body</p>', 'id: 1\ntags: foo');
    const snapshot = card.outerHTML;
    parseCard(card, 'v');
    expect(card.outerHTML).toBe(snapshot);
  });

  // ── valid flag ───────────────────────────────────────────────────────────────

  describe('valid', () => {
    it('is true when there is no metadata sub-callout', () => {
      expect(parseCard(makeCardEl('<p>text</p>'), 'v').valid).toBe(true);
    });

    it('is true for a completely well-formed metadata block', () => {
      const card = makeCardEl(
        '<p>x</p>',
        'id: 99\ntags: foo\ndeck: Default',
      );
      expect(parseCard(card, 'v').valid).toBe(true);
    });

    it('is false when there are two card-metadata sub-callouts', () => {
      const card = makeCardEl();
      const content = card.querySelector('.callout-content')!;
      content.appendChild(makeMetadataEl('id: 1'));
      content.appendChild(makeMetadataEl('id: 2'));
      expect(parseCard(card as HTMLElement, 'v').valid).toBe(false);
    });

    it('is false when id is non-numeric', () => {
      expect(parseCard(makeCardEl('', 'id: abc'), 'v').valid).toBe(false);
    });

    it('is false when id is zero', () => {
      expect(parseCard(makeCardEl('', 'id: 0'), 'v').valid).toBe(false);
    });

    it('is false when id is negative', () => {
      expect(parseCard(makeCardEl('', 'id: -1'), 'v').valid).toBe(false);
    });

    it('is false when id has a decimal point', () => {
      expect(parseCard(makeCardEl('', 'id: 3.14'), 'v').valid).toBe(false);
    });

    it('is false when id has trailing non-digit characters', () => {
      expect(parseCard(makeCardEl('', 'id: 123abc'), 'v').valid).toBe(false);
    });

    it('handles a metadata callout whose .callout-content is absent', () => {
      const card = document.createElement('div');
      card.className = 'callout';
      card.setAttribute('data-callout', 'card');
      const content = document.createElement('div');
      content.className = 'callout-content';
      // card-metadata callout with NO inner .callout-content
      const meta = document.createElement('div');
      meta.className = 'callout';
      meta.setAttribute('data-callout', 'card-metadata');
      content.appendChild(meta);
      card.appendChild(content);
      const result = parseCard(card as HTMLElement, 'v');
      expect(result.valid).toBe(true);
      expect(result.id).toBeUndefined();
    });
  });

  // ── id ───────────────────────────────────────────────────────────────────────

  describe('id', () => {
    it('is undefined when there is no metadata sub-callout', () => {
      expect(parseCard(makeCardEl(), 'v').id).toBeUndefined();
    });

    it('is undefined when the metadata block contains no id field', () => {
      expect(parseCard(makeCardEl('', 'tags: foo'), 'v').id).toBeUndefined();
    });

    it('parses the smallest valid positive integer', () => {
      expect(parseCard(makeCardEl('', 'id: 1'), 'v').id).toBe(1);
    });

    it('parses a large Anki-style epoch note ID', () => {
      expect(parseCard(makeCardEl('', 'id: 1702218000000'), 'v').id)
        .toBe(1702218000000);
    });

    it('is undefined (and valid false) when the id value is invalid', () => {
      const result = parseCard(makeCardEl('', 'id: bad'), 'v');
      expect(result.id).toBeUndefined();
      expect(result.valid).toBe(false);
    });

    it('trims surrounding whitespace from the id value', () => {
      expect(parseCard(makeCardEl('', 'id:   42  '), 'v').id).toBe(42);
    });
  });

  // ── tags ─────────────────────────────────────────────────────────────────────

  describe('tags', () => {
    it('is an empty Set when there is no metadata', () => {
      expect(parseCard(makeCardEl(), 'v').tags).toEqual(new Set());
    });

    it('is an empty Set when the metadata block has no tags field', () => {
      expect(parseCard(makeCardEl('', 'id: 1'), 'v').tags).toEqual(new Set());
    });

    it('parses a single tag', () => {
      expect(parseCard(makeCardEl('', 'tags: foo'), 'v').tags)
        .toEqual(new Set(['foo']));
    });

    it('splits on whitespace', () => {
      expect(parseCard(makeCardEl('', 'tags: foo bar baz'), 'v').tags)
        .toEqual(new Set(['foo', 'bar', 'baz']));
    });

    it('splits on commas', () => {
      expect(parseCard(makeCardEl('', 'tags: foo,bar,baz'), 'v').tags)
        .toEqual(new Set(['foo', 'bar', 'baz']));
    });

    it('splits on mixed comma-and-space delimiters', () => {
      expect(parseCard(makeCardEl('', 'tags: foo, bar, baz'), 'v').tags)
        .toEqual(new Set(['foo', 'bar', 'baz']));
    });

    it('strips a leading # from each tag token', () => {
      expect(parseCard(makeCardEl('', 'tags: #foo #bar'), 'v').tags)
        .toEqual(new Set(['foo', 'bar']));
    });

    it('converts / to :: for Anki-style hierarchical tags', () => {
      expect(parseCard(makeCardEl('', 'tags: language/japanese'), 'v').tags)
        .toEqual(new Set(['language::japanese']));
    });

    it('converts multi-level slash separators', () => {
      expect(parseCard(makeCardEl('', 'tags: a/b/c'), 'v').tags)
        .toEqual(new Set(['a::b::c']));
    });

    it('handles # prefix combined with / hierarchy', () => {
      expect(parseCard(makeCardEl('', 'tags: #lang/jp'), 'v').tags)
        .toEqual(new Set(['lang::jp']));
    });

    it('deduplicates identical tags via Set semantics', () => {
      expect(parseCard(makeCardEl('', 'tags: foo foo bar'), 'v').tags)
        .toEqual(new Set(['foo', 'bar']));
    });
  });

  // ── cardFields ───────────────────────────────────────────────────────────────

  describe('cardFields', () => {
    it('is an empty object when there is no metadata', () => {
      expect(parseCard(makeCardEl(), 'v').cardFields).toEqual({});
    });

    it('captures an arbitrary key-value pair', () => {
      expect(parseCard(makeCardEl('', 'deck: MyDeck'), 'v').cardFields)
        .toEqual({ deck: 'MyDeck' });
    });

    it('captures multiple arbitrary fields', () => {
      const { cardFields } = parseCard(
        makeCardEl('', 'deck: MyDeck\nnote-type: Basic'),
        'v',
      );
      expect(cardFields.deck).toBe('MyDeck');
      expect(cardFields['note-type']).toBe('Basic');
    });

    it('does not include the reserved "id" key', () => {
      expect(parseCard(makeCardEl('', 'id: 1\ndeck: D'), 'v').cardFields)
        .not.toHaveProperty('id');
    });

    it('does not include the reserved "tags" key', () => {
      expect(parseCard(makeCardEl('', 'tags: foo\ndeck: D'), 'v').cardFields)
        .not.toHaveProperty('tags');
    });

    it('preserves colons that appear inside a value', () => {
      expect(
        parseCard(makeCardEl('', 'url: http://example.com'), 'v').cardFields.url,
      ).toBe('http://example.com');
    });

    it('ignores lines that contain no colon', () => {
      expect(parseCard(makeCardEl('', 'nodivider'), 'v').cardFields).toEqual({});
    });

    it('ignores lines where the colon is the first character (empty key)', () => {
      expect(parseCard(makeCardEl('', ': orphanvalue'), 'v').cardFields)
        .toEqual({});
    });

    it('ignores blank lines in the metadata block', () => {
      expect(parseCard(makeCardEl('', '\n\ndeck: D\n\n'), 'v').cardFields)
        .toEqual({ deck: 'D' });
    });
  });

  // ── text ─────────────────────────────────────────────────────────────────────

  describe('text', () => {
    it('is an empty string when the element has no .callout-content', () => {
      const bare = document.createElement('div');
      bare.className = 'callout';
      bare.setAttribute('data-callout', 'card');
      expect(parseCard(bare as HTMLElement, 'v').text).toBe('');
    });

    it('is an empty string when .callout-content is empty', () => {
      expect(parseCard(makeCardEl(''), 'v').text).toBe('');
    });

    it('serialises a simple paragraph', () => {
      expect(parseCard(makeCardEl('<p>Hello world</p>'), 'v').text)
        .toBe('<p>Hello world</p>');
    });

    it('removes the card-metadata sub-callout from the output', () => {
      const card = makeCardEl('<p>body</p>', 'id: 1\ntags: foo');
      const { text } = parseCard(card, 'v');
      expect(text).not.toContain('card-metadata');
      expect(text).toContain('<p>body</p>');
    });

    it('does not include the callout-title element', () => {
      const card = document.createElement('div');
      card.className = 'callout';
      card.setAttribute('data-callout', 'card');
      const title = document.createElement('div');
      title.className = 'callout-title';
      title.textContent = 'Should be excluded';
      const content = document.createElement('div');
      content.className = 'callout-content';
      content.innerHTML = '<p>body</p>';
      card.appendChild(title);
      card.appendChild(content);

      const { text } = parseCard(card as HTMLElement, 'v');
      expect(text).not.toContain('Should be excluded');
      expect(text).toContain('<p>body</p>');
    });

    it('trims leading and trailing whitespace from the result', () => {
      const { text } = parseCard(makeCardEl('<p>x</p>'), 'v');
      expect(text).toBe(text.trim());
    });

    it('does not parse metadata callouts that are not direct children of .callout-content', () => {
      // Metadata is inside a wrapper <div> — not a direct child of .callout-content
      const card = makeCardEl(`
        <div>
          <div class="callout" data-callout="card-metadata">
            <div class="callout-content">id: 99</div>
          </div>
        </div>
      `);
      expect(parseCard(card, 'v').id).toBeUndefined();
    });

    // ── cloze conversion ────────────────────────────────────────────────────────

    describe('cloze conversion', () => {
      /** Parses a card whose body is `html` and returns its text field. */
      const textOf = (html: string) => parseCard(makeCardEl(html), 'v').text;

      it('wraps a basic cloze span in {{c1::…}} when id is absent', () => {
        expect(textOf('<span class="cloze">answer</span>'))
          .toContain('{{c1::answer}}');
      });

      it('uses the explicit positive integer id attribute', () => {
        expect(textOf('<span class="cloze" id="3">word</span>'))
          .toContain('{{c3::word}}');
      });

      it('auto-increments ids for consecutive id-less cloze spans', () => {
        const text = textOf(
          '<span class="cloze">a</span>' +
          '<span class="cloze">b</span>' +
          '<span class="cloze">c</span>',
        );
        expect(text).toContain('{{c1::a}}');
        expect(text).toContain('{{c2::b}}');
        expect(text).toContain('{{c3::c}}');
      });

      it('auto-counter skips ids already claimed by explicit spans', () => {
        // id=2 is reserved → auto should yield 1, then 3
        const text = textOf(
          '<span class="cloze">first</span>' +
          '<span class="cloze" id="2">second</span>' +
          '<span class="cloze">third</span>',
        );
        expect(text).toContain('{{c1::first}}');
        expect(text).toContain('{{c2::second}}');
        expect(text).toContain('{{c3::third}}');
      });

      it('auto-counter fills the lowest available gap around a high explicit id', () => {
        // id=3 is reserved → auto gives c1 first, then c2 for the remaining span
        const text = textOf(
          '<span class="cloze">first</span>' +
          '<span class="cloze" id="3">second</span>' +
          '<span class="cloze">third</span>',
        );
        expect(text).toContain('{{c1::first}}');
        expect(text).toContain('{{c3::second}}');
        expect(text).toContain('{{c2::third}}');
      });

      it('appends a hint as {{cN::body::hint}}', () => {
        expect(textOf('<span class="cloze" hint="clue">answer</span>'))
          .toContain('{{c1::answer::clue}}');
      });

      it('combines an explicit id with a hint', () => {
        expect(textOf('<span class="cloze" id="5" hint="tip">answer</span>'))
          .toContain('{{c5::answer::tip}}');
      });

      it('falls back to auto-id when the id attribute is non-numeric', () => {
        expect(textOf('<span class="cloze" id="abc">word</span>'))
          .toContain('{{c1::word}}');
      });

      it('falls back to auto-id when the id attribute is zero', () => {
        expect(textOf('<span class="cloze" id="0">word</span>'))
          .toContain('{{c1::word}}');
      });

      it('falls back to auto-id when the id attribute is negative', () => {
        expect(textOf('<span class="cloze" id="-1">word</span>'))
          .toContain('{{c1::word}}');
      });

      it('serialises nested markup inside the cloze body', () => {
        expect(textOf('<span class="cloze"><strong>bold</strong></span>'))
          .toContain('{{c1::<strong>bold</strong>}}');
      });

      it('does not convert spans that lack the "cloze" class', () => {
        const text = textOf('<span class="highlight">word</span>');
        expect(text).not.toContain('{{');
        expect(text).toContain('<span class="highlight">word</span>');
      });
    });

    // ── internal link rewriting ─────────────────────────────────────────────────

    describe('internal link rewriting', () => {
      it('rewrites an internal link to an obsidian:// URI', () => {
        const card = makeCardEl(
          '<a class="internal-link" data-href="My Note" href="/file">text</a>',
        );
        expect(parseCard(card, 'MyVault').text).toContain(
          'href="obsidian://open?vault=MyVault&file=My%20Note"',
        );
      });

      it('prefers data-href over href as the file target', () => {
        const card = makeCardEl(
          '<a class="internal-link" data-href="NoteA" href="NoteB">text</a>',
        );
        const { text } = parseCard(card, 'v');
        expect(text).toContain('file=NoteA');
        expect(text).not.toContain('file=NoteB');
      });

      it('falls back to href when data-href is absent', () => {
        const card = makeCardEl(
          '<a class="internal-link" href="fallback-note">text</a>',
        );
        expect(parseCard(card, 'v').text).toContain('file=fallback-note');
      });

      it('percent-encodes spaces in the vault name', () => {
        const card = makeCardEl(
          '<a class="internal-link" data-href="Note">text</a>',
        );
        expect(parseCard(card, 'My Vault').text).toContain('vault=My%20Vault');
      });

      it('percent-encodes spaces and slashes in the file path', () => {
        const card = makeCardEl(
          '<a class="internal-link" data-href="My Note/Sub">text</a>',
        );
        expect(parseCard(card, 'v').text).toContain('file=My%20Note%2FSub');
      });

      it('strips Obsidian-specific data-* attributes from the rewritten anchor', () => {
        const card = makeCardEl(
          '<a class="internal-link" data-href="Note" data-path="x" href="/Note">text</a>',
        );
        const { text } = parseCard(card, 'v');
        expect(text).not.toContain('data-href');
        expect(text).not.toContain('data-path');
      });

      it('preserves the visible link text', () => {
        const card = makeCardEl(
          '<a class="internal-link" data-href="Note">Visible Text</a>',
        );
        expect(parseCard(card, 'v').text).toContain('>Visible Text<');
      });

      it('does not rewrite anchors that lack the internal-link class', () => {
        const card = makeCardEl('<a href="https://example.com">external</a>');
        const { text } = parseCard(card, 'v');
        expect(text).toContain('href="https://example.com"');
        expect(text).not.toContain('obsidian://');
      });
    });

    // ── HTML serialisation ──────────────────────────────────────────────────────

    describe('HTML serialisation', () => {
      it('re-escapes & in text nodes as &amp;', () => {
        // innerHTML decodes &amp; → '&'; serialiser must re-encode it
        const { text } = parseCard(makeCardEl('<p>a &amp; b</p>'), 'v');
        expect(text).toContain('a &amp; b');
      });

      it('re-escapes < in text nodes as &lt;', () => {
        const { text } = parseCard(makeCardEl('<p>1 &lt; 2</p>'), 'v');
        expect(text).toContain('1 &lt; 2');
      });

      it('re-escapes > in text nodes as &gt;', () => {
        const { text } = parseCard(makeCardEl('<p>2 &gt; 1</p>'), 'v');
        expect(text).toContain('2 &gt; 1');
      });

      it('serialises <br> as a void element with no closing tag', () => {
        const { text } = parseCard(makeCardEl('before<br>after'), 'v');
        expect(text).toContain('<br>');
        expect(text).not.toContain('</br>');
      });

      it('serialises <img> as a void element', () => {
        const { text } = parseCard(makeCardEl('<img src="x.png" alt="img">'), 'v');
        expect(text).toContain('<img');
        expect(text).not.toContain('</img>');
      });

      it('serialises <hr> as a void element', () => {
        const { text } = parseCard(makeCardEl('<hr>'), 'v');
        expect(text).toContain('<hr>');
        expect(text).not.toContain('</hr>');
      });

      it('preserves all allowed attributes: class, id, href, src, alt, title', () => {
        const card = makeCardEl(
          '<a href="https://x.com" title="T" class="lnk" id="a1">x</a>',
        );
        const { text } = parseCard(card, 'v');
        expect(text).toContain('href="https://x.com"');
        expect(text).toContain('title="T"');
        expect(text).toContain('class="lnk"');
        expect(text).toContain('id="a1"');
      });

      it('strips data-* attributes from generic elements', () => {
        const { text } = parseCard(makeCardEl('<p data-foo="bar">text</p>'), 'v');
        expect(text).not.toContain('data-foo');
      });

      it('strips aria-* attributes from generic elements', () => {
        const { text } = parseCard(
          makeCardEl('<p aria-label="test">text</p>'),
          'v',
        );
        expect(text).not.toContain('aria-label');
      });

      it('escapes " in attribute values as &quot;', () => {
        // Set alt programmatically so it contains a literal " character
        const img = document.createElement('img');
        img.src = 'x.png';
        img.alt = 'say "hi"';
        const card = makeCardEl('');
        card.querySelector('.callout-content')!.appendChild(img);
        expect(parseCard(card, 'v').text).toContain('&quot;');
      });

      it('silently ignores comment nodes', () => {
        const content = document.createElement('div');
        content.className = 'callout-content';
        content.appendChild(document.createComment('ignored'));
        const p = document.createElement('p');
        p.textContent = 'visible';
        content.appendChild(p);
        const card = document.createElement('div');
        card.className = 'callout';
        card.setAttribute('data-callout', 'card');
        card.appendChild(content);
        expect(parseCard(card as HTMLElement, 'v').text).toBe('<p>visible</p>');
      });

      it('handles deeply nested elements', () => {
        const { text } = parseCard(
          makeCardEl('<div><ul><li><strong>item</strong></li></ul></div>'),
          'v',
        );
        expect(text).toBe('<div><ul><li><strong>item</strong></li></ul></div>');
      });
    });
  });
});

// ─── Integration ─────────────────────────────────────────────────────────────

describe('integration', () => {
  it('parses a two-card document end-to-end', () => {
    const card1 = makeCardEl(
      '<p>What is 2 + 2?</p><p><span class="cloze">4</span></p>',
      'id: 1001\ntags: math',
    );
    const card2 = makeCardEl(
      '<p>Capital of France?</p><p><span class="cloze" id="2">Paris</span></p>',
      'id: 1002\ntags: #geography/europe\ndeck: Geography',
    );

    const [r1, r2] = parseCards(wrapInDoc(card1, card2), 'MyVault');

    expect(r1.valid).toBe(true);
    expect(r1.id).toBe(1001);
    expect(r1.tags).toEqual(new Set(['math']));
    expect(r1.text).toContain('{{c1::4}}');
    expect(r1.text).not.toContain('card-metadata');

    expect(r2.valid).toBe(true);
    expect(r2.id).toBe(1002);
    expect(r2.tags).toEqual(new Set(['geography::europe']));
    expect(r2.cardFields).toEqual({ deck: 'Geography' });
    expect(r2.text).toContain('{{c2::Paris}}');
  });

  it('handles a card that combines internal links with cloze spans', () => {
    const card = makeCardEl(
      '<p>See <a class="internal-link" data-href="My Note">My Note</a> for ' +
      '<span class="cloze">details</span>.</p>',
      'id: 55',
    );
    const { text } = parseCard(card, 'TestVault');
    expect(text).toContain('obsidian://open?vault=TestVault&file=My%20Note');
    expect(text).toContain('{{c1::details}}');
  });

  it('returns a fully empty ParsedCard for a card with no metadata and no body', () => {
    const result = parseCard(makeCardEl(''), 'v');
    expect(result.valid).toBe(true);
    expect(result.id).toBeUndefined();
    expect(result.tags).toEqual(new Set());
    expect(result.cardFields).toEqual({});
    expect(result.text).toBe('');
  });

  it('returns an empty array for a document that contains no card callouts', () => {
    const doc = document.createElement('div');
    doc.innerHTML = '<p>Just a paragraph</p>';
    expect(parseCards(doc, 'v')).toEqual([]);
  });
});