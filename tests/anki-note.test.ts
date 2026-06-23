/**
 * @file cardParser.test.ts
 *
 * Unit tests for parseCards() and parseCard().
 * Environment: Jest + jsdom (TypeScript).
 */

import { parseCards, parseCard, type ParsedCard } from '../src/parser';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VAULT = 'TestVault';

/**
 * Creates a `.callout[data-callout="card"]` element whose single child is a
 * `.callout-content` wrapper holding the supplied HTML.
 */
function makeCard(contentHTML = ''): HTMLElement {
    const el = document.createElement('div');
    el.classList.add('callout');
    el.setAttribute('data-callout', 'card');
    el.innerHTML = `<div class="callout-content">${contentHTML}</div>`;
    return el;
}

/**
 * Returns an HTML string for a `card-metadata` callout whose inner
 * `.callout-content` holds `lines` as a plain text node.
 */
function metaHTML(lines: string): string {
    return (
        `<div class="callout" data-callout="card-metadata">` +
        `<div class="callout-content">${lines}</div>` +
        `</div>`
    );
}

/** Wraps card elements in a container `<div>` for use with parseCards(). */
function wrapCards(...cards: HTMLElement[]): HTMLElement {
    const root = document.createElement('div');
    for (const c of cards) root.appendChild(c);
    return root;
}

// ═════════════════════════════════════════════════════════════════════════════
// parseCards()
// ═════════════════════════════════════════════════════════════════════════════

describe('parseCards()', () => {
    // ── Input validation ──────────────────────────────────────────────────────

    describe('input validation', () => {
        it.each([null, undefined, 42, 'string', {}])(
            'throws TypeError when documentEl is %p',
            (bad) => expect(() => parseCards(bad as any, VAULT)).toThrow(TypeError),
        );

        it.each([null, undefined, '', '   ', 0])(
            'throws TypeError when vaultName is %p',
            (bad) => {
                const el = document.createElement('div');
                expect(() => parseCards(el, bad as any)).toThrow(TypeError);
            },
        );
    });

    // ── Core behaviour ────────────────────────────────────────────────────────

    it('returns [] when no card callouts are present', () => {
        const el = document.createElement('div');
        el.innerHTML =
            '<p>text</p>' +
            '<div class="callout" data-callout="note"><div class="callout-content">n</div></div>';
        expect(parseCards(el, VAULT)).toEqual([]);
    });

    it('returns one ParsedCard per [!card] callout', () => {
        const result = parseCards(
            wrapCards(makeCard('<p>A</p>'), makeCard('<p>B</p>'), makeCard('<p>C</p>')),
            VAULT,
        );
        expect(result).toHaveLength(3);
    });

    it('ignores callouts with a different data-callout type', () => {
        const el = document.createElement('div');
        el.innerHTML = `
            <div class="callout" data-callout="info"><div class="callout-content">x</div></div>
            <div class="callout" data-callout="card"><div class="callout-content">y</div></div>
            <div class="callout" data-callout="warning"><div class="callout-content">z</div></div>
        `;
        expect(parseCards(el, VAULT)).toHaveLength(1);
    });

    it('finds card callouts nested deep in the document tree', () => {
        const root = document.createElement('div');
        root.innerHTML = `
            <section><article>
                <div class="callout" data-callout="card">
                    <div class="callout-content"><p>deep</p></div>
                </div>
            </article></section>
        `;
        expect(parseCards(root, VAULT)).toHaveLength(1);
    });

    it('passes vaultName through to Obsidian URI generation', () => {
        const card = makeCard('<a class="internal-link" data-href="Note">N</a>');
        const [result] = parseCards(wrapCards(card), 'My Vault');
        expect(result.text).toContain('vault=My%20Vault');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// parseCard()
// ═════════════════════════════════════════════════════════════════════════════

describe('parseCard()', () => {
    // ── Input validation ──────────────────────────────────────────────────────

    describe('input validation', () => {
        it.each([null, undefined, 'div', 42, {}])(
            'throws TypeError when cardElement is %p',
            (bad) => expect(() => parseCard(bad as any, VAULT)).toThrow(TypeError),
        );

        it.each([null, undefined, '', '   ', 0])(
            'throws TypeError when vaultName is %p',
            (bad) => expect(() => parseCard(makeCard(), bad as any)).toThrow(TypeError),
        );
    });

    // ── Return shape ──────────────────────────────────────────────────────────

    it('always returns an object with valid (boolean), tags (Set), cardFields (object), text (string)', () => {
        const r = parseCard(makeCard(), VAULT);
        expect(typeof r.valid).toBe('boolean');
        expect(r.tags).toBeInstanceOf(Set);
        expect(typeof r.cardFields).toBe('object');
        expect(typeof r.text).toBe('string');
    });

    // ── Card with no card-metadata callout ────────────────────────────────────

    describe('card with no card-metadata callout', () => {
        let r: ParsedCard;
        beforeEach(() => { r = parseCard(makeCard('<p>Body</p>'), VAULT); });

        it('valid is true',                  () => expect(r.valid).toBe(true));
        it('id is undefined',                () => expect(r.id).toBeUndefined());
        it('tags is an empty Set',           () => expect(r.tags.size).toBe(0));
        it('cardFields is {}',               () => expect(r.cardFields).toEqual({}));
        it('text is the serialised body',    () => expect(r.text).toBe('<p>Body</p>'));
    });

    it('returns text="" when the card element has no .callout-content child', () => {
        const el = document.createElement('div');
        el.classList.add('callout');
        el.setAttribute('data-callout', 'card');
        expect(parseCard(el, VAULT).text).toBe('');
    });

    // ── Metadata: id ─────────────────────────────────────────────────────────

    describe('metadata – id field', () => {
        it('parses a valid positive integer', () => {
            const r = parseCard(makeCard(metaHTML('id: 42')), VAULT);
            expect(r.id).toBe(42);
            expect(r.valid).toBe(true);
        });

        it('parses a large safe integer', () => {
            expect(parseCard(makeCard(metaHTML('id: 1700000000000')), VAULT).id).toBe(1700000000000);
        });

        it('sets valid:false and id:undefined for id = 0', () => {
            const r = parseCard(makeCard(metaHTML('id: 0')), VAULT);
            expect(r.valid).toBe(false);
            expect(r.id).toBeUndefined();
        });

        it('sets valid:false for a negative id', () => {
            const r = parseCard(makeCard(metaHTML('id: -5')), VAULT);
            expect(r.valid).toBe(false);
            expect(r.id).toBeUndefined();
        });

        it('sets valid:false for an empty id value', () => {
            expect(parseCard(makeCard(metaHTML('id: ')), VAULT).valid).toBe(false);
        });

        it('sets valid:false for a non-numeric id string', () => {
            expect(parseCard(makeCard(metaHTML('id: abc')), VAULT).valid).toBe(false);
        });

        it('sets valid:false for a string with trailing letters ("123abc")', () => {
            expect(parseCard(makeCard(metaHTML('id: 123abc')), VAULT).valid).toBe(false);
        });

        it('sets valid:false for a floating-point id string ("1.5")', () => {
            expect(parseCard(makeCard(metaHTML('id: 1.5')), VAULT).valid).toBe(false);
        });

        it('id remains undefined when the value is invalid', () => {
            expect(parseCard(makeCard(metaHTML('id: bad')), VAULT).id).toBeUndefined();
        });
    });

    // ── Metadata: tags ────────────────────────────────────────────────────────

    describe('metadata – tags field', () => {
        /** Convenience: extract only the tags from a single metadata line. */
        const parseTags = (line: string) =>
            parseCard(makeCard(metaHTML(line)), VAULT).tags;

        it('parses space-separated tags',
            () => expect(parseTags('tags: #a #b')).toEqual(new Set(['a', 'b'])));

        it('parses comma-separated tags',
            () => expect(parseTags('tags: #a,#b')).toEqual(new Set(['a', 'b'])));

        it('parses comma-and-space-separated tags',
            () => expect(parseTags('tags: #a, #b')).toEqual(new Set(['a', 'b'])));

        it('strips the leading # character', () => {
            const tags = parseTags('tags: #x');
            expect(tags).toContain('x');
            expect(tags).not.toContain('#x');
        });

        it('converts "/" to "::" for nested-tag hierarchies',
            () => expect(parseTags('tags: #deck/sub')).toContain('deck::sub'));

        it('handles tags without a # prefix',
            () => expect(parseTags('tags: plain')).toContain('plain'));

        it('returns an empty Set when the value is blank',
            () => expect(parseTags('tags: ').size).toBe(0));
    });

    // ── Metadata: custom fields ───────────────────────────────────────────────

    describe('metadata – custom fields', () => {
        it('extracts a single field', () => {
            expect(parseCard(makeCard(metaHTML('Front: Q')), VAULT).cardFields)
                .toEqual({ Front: 'Q' });
        });

        it('extracts multiple fields from separate lines', () => {
            expect(
                parseCard(makeCard(metaHTML('Front: Question\nBack: Answer')), VAULT).cardFields,
            ).toEqual({ Front: 'Question', Back: 'Answer' });
        });

        it('preserves values that themselves contain a colon', () => {
            expect(
                parseCard(makeCard(metaHTML('Extra: http://example.com')), VAULT).cardFields['Extra'],
            ).toBe('http://example.com');
        });

        it('ignores lines with no colon separator', () => {
            expect(parseCard(makeCard(metaHTML('no separator')), VAULT).cardFields).toEqual({});
        });

        it('ignores blank lines', () => {
            expect(
                parseCard(makeCard(metaHTML('\n\nFront: Q\n\n')), VAULT).cardFields,
            ).toEqual({ Front: 'Q' });
        });
    });

    // ── Metadata: duplicate callouts ──────────────────────────────────────────

    it('sets valid:false when more than one card-metadata callout is present', () => {
        const card = makeCard(metaHTML('id: 1') + metaHTML('id: 2'));
        expect(parseCard(card, VAULT).valid).toBe(false);
    });

    // ── Metadata: full combination ────────────────────────────────────────────

    it('correctly parses id, tags, custom fields, and body text together', () => {
        const card = makeCard(
            `<p>Body</p>${metaHTML('id: 7\ntags: #deck/sub\nFront: Q\nBack: A')}`,
        );
        const r = parseCard(card, VAULT);

        expect(r.valid).toBe(true);
        expect(r.id).toBe(7);
        expect(r.tags).toEqual(new Set(['deck::sub']));
        expect(r.cardFields).toEqual({ Front: 'Q', Back: 'A' });
        expect(r.text).toContain('Body');
        expect(r.text).not.toContain('card-metadata');
    });

    // ── Text extraction ───────────────────────────────────────────────────────

    describe('text extraction', () => {
        it('serialises the card body as HTML', () => {
            expect(parseCard(makeCard('<p>Hello</p>'), VAULT).text).toBe('<p>Hello</p>');
        });

        it('excludes the card-metadata callout from the serialised output', () => {
            const card = makeCard(`<p>Body</p>${metaHTML('id: 1')}`);
            const text = parseCard(card, VAULT).text;
            expect(text).not.toContain('card-metadata');
            expect(text).toContain('Body');
        });

        it('does not mutate the original card element', () => {
            const card = makeCard(`<p>Body</p>${metaHTML('id: 1')}`);
            const snapshot = card.innerHTML;
            parseCard(card, VAULT);
            expect(card.innerHTML).toBe(snapshot);
        });

        it('trims leading and trailing whitespace from the result', () => {
            const text = parseCard(makeCard('  <p>Trimmed</p>  '), VAULT).text;
            expect(text[0]).not.toBe(' ');
            expect(text[text.length - 1]).not.toBe(' ');
        });

        it('serialises nested elements correctly', () => {
            expect(
                parseCard(makeCard('<p><strong>b</strong> and <em>i</em></p>'), VAULT).text,
            ).toBe('<p><strong>b</strong> and <em>i</em></p>');
        });

        it('escapes & in text nodes (re-encodes what jsdom decoded)', () => {
            // jsdom parses &amp; → & in the DOM; the serialiser must re-escape it
            expect(parseCard(makeCard('<p>a &amp; b</p>'), VAULT).text).toBe('<p>a &amp; b</p>');
        });

        it('escapes < and > in text nodes', () => {
            const text = parseCard(makeCard('<p>1 &lt; 2 &gt; 0</p>'), VAULT).text;
            expect(text).toContain('&lt;');
            expect(text).toContain('&gt;');
        });

        it('serialises void elements without a closing tag', () => {
            expect(parseCard(makeCard('<br>'), VAULT).text).toBe('<br>');
        });

        it('<hr> has no closing tag', () => {
            const text = parseCard(makeCard('<p>a</p><hr><p>b</p>'), VAULT).text;
            expect(text).toContain('<hr>');
            expect(text).not.toContain('</hr>');
        });
    });

    // ── Attribute filtering ───────────────────────────────────────────────────

    describe('attribute filtering', () => {
        it('preserves allowed attributes: src, alt, title, class, id, href', () => {
            const card = makeCard(
                '<img src="img.png" alt="a" title="t" class="c" id="i">',
            );
            const text = parseCard(card, VAULT).text;
            expect(text).toContain('src="img.png"');
            expect(text).toContain('alt="a"');
            expect(text).toContain('title="t"');
            expect(text).toContain('class="c"');
            expect(text).toContain('id="i"');
        });

        it('drops style and data-* attributes', () => {
            const card = makeCard('<p style="color:red" data-foo="bar">Hi</p>');
            expect(parseCard(card, VAULT).text).toBe('<p>Hi</p>');
        });

        it('escapes double-quotes inside attribute values', () => {
            const card = makeCard('');
            const img = document.createElement('img');
            img.setAttribute('alt', 'say "hello"');
            card.querySelector('.callout-content')!.appendChild(img);
            expect(parseCard(card, VAULT).text).toContain('&quot;');
        });

        it('escapes & inside attribute values', () => {
            const card = makeCard('');
            const img = document.createElement('img');
            img.setAttribute('alt', 'cats & dogs');
            card.querySelector('.callout-content')!.appendChild(img);
            expect(parseCard(card, VAULT).text).toContain('alt="cats &amp; dogs"');
        });
    });

    // ── Cloze conversion ──────────────────────────────────────────────────────

    describe('cloze conversion', () => {
        it('converts <span class="cloze"> (no id) to {{c1::body}}', () => {
            expect(parseCard(makeCard('<span class="cloze">ans</span>'), VAULT).text)
                .toBe('{{c1::ans}}');
        });

        it('uses an explicit positive-integer id attribute', () => {
            expect(parseCard(makeCard('<span class="cloze" id="5">ans</span>'), VAULT).text)
                .toBe('{{c5::ans}}');
        });

        it('appends ::hint when the hint attribute is set', () => {
            expect(parseCard(makeCard('<span class="cloze" hint="h">ans</span>'), VAULT).text)
                .toBe('{{c1::ans::h}}');
        });

        it('combines an explicit id with a hint', () => {
            expect(parseCard(makeCard('<span class="cloze" id="3" hint="h">ans</span>'), VAULT).text)
                .toBe('{{c3::ans::h}}');
        });

        it('auto-increments IDs across consecutive cloze spans', () => {
            const card = makeCard(
                '<span class="cloze">x</span>' +
                '<span class="cloze">y</span>' +
                '<span class="cloze">z</span>',
            );
            expect(parseCard(card, VAULT).text).toBe('{{c1::x}}{{c2::y}}{{c3::z}}');
        });

        it('auto-IDs skip IDs already reserved by explicit spans', () => {
            // id=1 is reserved → first auto gets id=2
            const card = makeCard(
                '<span class="cloze" id="1">A</span>' +
                '<span class="cloze">B</span>',
            );
            expect(parseCard(card, VAULT).text).toBe('{{c1::A}}{{c2::B}}');
        });

        it('auto-IDs skip several consecutive reserved IDs', () => {
            const card = makeCard(
                '<span class="cloze" id="1">a</span>' +
                '<span class="cloze" id="2">b</span>' +
                '<span class="cloze">c</span>',
            );
            expect(parseCard(card, VAULT).text).toBe('{{c1::a}}{{c2::b}}{{c3::c}}');
        });

        it('auto-assigns the lowest available ID even when higher IDs are reserved', () => {
            // id=2 reserved; first auto span should claim id=1
            const card = makeCard(
                '<span class="cloze">auto</span>' +
                '<span class="cloze" id="2">exp</span>',
            );
            expect(parseCard(card, VAULT).text).toBe('{{c1::auto}}{{c2::exp}}');
        });

        it('falls back to auto-ID for a non-numeric id attribute', () => {
            expect(parseCard(makeCard('<span class="cloze" id="xyz">ans</span>'), VAULT).text)
                .toBe('{{c1::ans}}');
        });

        it('falls back to auto-ID when the id attribute is 0 (not > 0)', () => {
            expect(parseCard(makeCard('<span class="cloze" id="0">ans</span>'), VAULT).text)
                .toBe('{{c1::ans}}');
        });

        it('serialises nested HTML inside the cloze body', () => {
            expect(
                parseCard(makeCard('<span class="cloze"><em>em</em> text</span>'), VAULT).text,
            ).toBe('{{c1::<em>em</em> text}}');
        });

        it('does not treat a plain <span> (no cloze class) as a cloze deletion', () => {
            const text = parseCard(makeCard('<span>plain</span>'), VAULT).text;
            expect(text).not.toContain('{{');
            expect(text).toBe('<span>plain</span>');
        });
    });

    // ── Internal-link conversion ──────────────────────────────────────────────

    describe('internal-link conversion', () => {
        /** Builds the expected obsidian:// URI for assertions. */
        const obsUri = (vault: string, file: string) =>
            `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;

        it('rewrites an internal-link anchor to an obsidian:// URI', () => {
            const card = makeCard(
                '<a class="internal-link" data-href="My Note" href="/My Note.md">My Note</a>',
            );
            expect(parseCard(card, VAULT).text).toBe(
                `<a href="${obsUri(VAULT, 'My Note')}">My Note</a>`,
            );
        });

        it('prefers data-href over href for the target file path', () => {
            const card = makeCard(
                '<a class="internal-link" data-href="Correct" href="Wrong">L</a>',
            );
            const text = parseCard(card, VAULT).text;
            expect(text).toContain(`file=${encodeURIComponent('Correct')}`);
            expect(text).not.toContain('Wrong');
        });

        it('falls back to href when data-href is absent', () => {
            const card = makeCard('<a class="internal-link" href="Target">L</a>');
            expect(parseCard(card, VAULT).text).toContain(
                `file=${encodeURIComponent('Target')}`,
            );
        });

        it('percent-encodes spaces in the vault name', () => {
            const card = makeCard('<a class="internal-link" data-href="N">L</a>');
            expect(parseCard(card, 'My Vault').text).toContain('vault=My%20Vault');
        });

        it('percent-encodes special characters in the file path', () => {
            const card = makeCard(
                '<a class="internal-link" data-href="Folder/Sub Note">L</a>',
            );
            expect(parseCard(card, VAULT).text).toContain(
                `file=${encodeURIComponent('Folder/Sub Note')}`,
            );
        });

        it('strips Obsidian-specific attributes from the rewritten anchor', () => {
            const card = makeCard(
                '<a class="internal-link" data-href="N" data-type="wikilink" href="/N.md">L</a>',
            );
            const text = parseCard(card, VAULT).text;
            expect(text).not.toContain('data-href');
            expect(text).not.toContain('data-type');
        });

        it('preserves the anchor\'s child nodes in the rewritten output', () => {
            const card = makeCard(
                '<a class="internal-link" data-href="N">Click <em>here</em></a>',
            );
            expect(parseCard(card, VAULT).text).toContain('Click <em>here</em>');
        });

        it('does not rewrite regular (external) anchors', () => {
            const card = makeCard('<a href="https://example.com">External</a>');
            const text = parseCard(card, VAULT).text;
            expect(text).not.toContain('obsidian://');
            expect(text).toContain('https://example.com');
        });
    });

    // ── Integration: realistic card ───────────────────────────────────────────

    describe('integration: full realistic card', () => {
        it('parses body text, cloze deletion, internal link, and metadata together', () => {
            const card = makeCard(
                '<p>The capital of France is ' +
                '<span class="cloze" id="1">Paris</span>.</p>' +
                '<p>See: <a class="internal-link" data-href="France">France</a></p>' +
                metaHTML('id: 1234567890\ntags: #geo #europe\nDeck: Geography::Europe'),
            );

            const r = parseCard(card, 'MyVault');

            expect(r.valid).toBe(true);
            expect(r.id).toBe(1234567890);
            expect(r.tags).toEqual(new Set(['geo', 'europe']));
            expect(r.cardFields).toEqual({ Deck: 'Geography::Europe' });
            expect(r.text).toContain('{{c1::Paris}}');
            expect(r.text).toContain(
                `obsidian://open?vault=MyVault&file=France`,
            );
            expect(r.text).not.toContain('card-metadata');
        });
    });
});