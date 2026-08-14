/**
 * Tests for html-conversion utilities (convert.ts).
 *
 * Written from the user's perspective: a user edits Obsidian notes that contain
 * cloze deletions and internal links, then exports them to Anki. We assert on
 * the HTML the exported card would contain — not on internal implementation details.
 *
 * Test environment: jsdom (configured in jest.config)
 */

import {
    convertHtml,
    transformClozes,
    transformInternalLinks,
    stripAttributes,
} from '../src/anki/html-processing';

// NoteContext is a structural type. We supply a compatible plain object and
// cast to `any` to avoid importing the real module in tests.
const ctx = { vaultName: 'MyVault' } as any;

/** Wrap HTML in a <div> container, mirroring how Obsidian renders note content. */
function makeEl(html: string): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: User marks words for cloze deletion
// ─────────────────────────────────────────────────────────────────────────────

describe('user marks words as cloze deletions in a note', () => {
    it('converts a single cloze span into Anki cloze syntax', () => {
        const el = makeEl(
            '<p>The capital of France is <span class="cloze">Paris</span>.</p>'
        );
        transformClozes(el);
        expect(el.innerHTML).toBe(
            '<p>The capital of France is {{c1::Paris}}.</p>'
        );
    });

    it('assigns sequential IDs when multiple spans carry no explicit ID', () => {
        const el = makeEl(
            '<p><span class="cloze">one</span> and <span class="cloze">two</span></p>'
        );
        transformClozes(el);
        expect(el.innerHTML).toBe('<p>{{c1::one}} and {{c2::two}}</p>');
    });

    it('honours a user-specified positive-integer ID on a cloze span', () => {
        const el = makeEl('<p><span class="cloze" id="5">answer</span></p>');
        transformClozes(el);
        expect(el.innerHTML).toBe('<p>{{c5::answer}}</p>');
    });

    it('appends the hint text when the span carries a hint attribute', () => {
        const el = makeEl(
            '<p><span class="cloze" hint="European capital">Paris</span></p>'
        );
        transformClozes(el);
        expect(el.innerHTML).toBe('<p>{{c1::Paris::European capital}}</p>');
    });

    it('processes inner cloze spans before outer ones so the nested Anki syntax is well-formed', () => {
        // LIKELY MISS: pre-order traversal converts the outer span first, leaving a raw
        // <span> element inside the Anki cloze string rather than valid nested syntax.
        const el = makeEl(
            '<p><span class="cloze">outer and <span class="cloze">inner</span></span></p>'
        );
        transformClozes(el);
        // Post-order: inner receives c1 first, then the outer wraps it as c2
        expect(el.innerHTML).toBe(
            '<p>{{c2::outer and {{c1::inner}}}}</p>'
        );
    });

    it('auto-assigns IDs that skip over every explicitly reserved ID', () => {
        // LIKELY MISS: a plain counter starting at 1 would collide with id="1" and id="3".
        const el = makeEl(
            '<p>' +
            '<span class="cloze" id="1">first</span> ' +
            '<span class="cloze" id="3">third</span> ' +
            '<span class="cloze">auto</span>' +
            '</p>'
        );
        transformClozes(el);
        // The auto-assigned span must land on 2, the only available integer
        expect(el.innerHTML).toBe(
            '<p>{{c1::first}} {{c3::third}} {{c2::auto}}</p>'
        );
    });

    it('treats id="0" as invalid and falls back to auto-assignment', () => {
        const el = makeEl('<p><span class="cloze" id="0">word</span></p>');
        transformClozes(el);
        expect(el.innerHTML).toBe('<p>{{c1::word}}</p>');
    });

    it('treats a negative id as invalid and falls back to auto-assignment', () => {
        const el = makeEl('<p><span class="cloze" id="-2">word</span></p>');
        transformClozes(el);
        expect(el.innerHTML).toBe('<p>{{c1::word}}</p>');
    });

    it('treats a non-numeric id string as invalid and falls back to auto-assignment', () => {
        const el = makeEl('<p><span class="cloze" id="my-label">word</span></p>');
        transformClozes(el);
        expect(el.innerHTML).toBe('<p>{{c1::word}}</p>');
    });

    it('leaves non-cloze spans completely unchanged', () => {
        // LIKELY MISS: a broad selector matching all <span> elements mutates unrelated markup.
        const el = makeEl(
            '<p>Text with a <span class="tag">label</span> and a <span>plain span</span>.</p>'
        );
        const before = el.innerHTML;
        transformClozes(el);
        expect(el.innerHTML).toBe(before);
    });

    it('does nothing when the note contains no cloze spans', () => {
        const el = makeEl('<p>An ordinary paragraph with <strong>bold</strong> text.</p>');
        const before = el.innerHTML;
        transformClozes(el);
        expect(el.innerHTML).toBe(before);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: User's note contains internal Obsidian wiki-links
// ─────────────────────────────────────────────────────────────────────────────

describe("user's note contains internal links that should open inside Obsidian", () => {
    it('rewrites an internal link href to an obsidian:// URL containing vault and file params', () => {
        const el = makeEl(
            '<a class="internal-link" data-href="My Note">My Note</a>'
        );
        transformInternalLinks(el, ctx);
        const link = el.querySelector<HTMLAnchorElement>('a')!;
        expect(link.href).toContain('obsidian://open');
        expect(link.href).toContain('vault=MyVault');
        expect(link.href).toContain('file=My%20Note');
    });

    it('uses the vault name from the note context, not a hard-coded default', () => {
        const el = makeEl('<a class="internal-link" data-href="SomeFile">link</a>');
        transformInternalLinks(el, { vaultName: 'WorkVault' } as any);
        expect(el.querySelector<HTMLAnchorElement>('a')!.href).toContain('vault=WorkVault');
    });

    it('rewrites every internal link in the note, not just the first one', () => {
        const el = makeEl(
            '<a class="internal-link" data-href="NoteA">A</a> ' +
            '<a class="internal-link" data-href="NoteB">B</a>'
        );
        transformInternalLinks(el, ctx);
        const links = el.querySelectorAll<HTMLAnchorElement>('a');
        expect(links[0].href).toContain('file=NoteA');
        expect(links[1].href).toContain('file=NoteB');
    });

    it('leaves regular external links untouched', () => {
        // LIKELY MISS: a selector matching all <a> elements would overwrite external hrefs too.
        const el = makeEl('<a href="https://example.com">External</a>');
        transformInternalLinks(el, ctx);
        const href = el.querySelector<HTMLAnchorElement>('a')!.href;
        expect(href).not.toContain('obsidian://');
        expect(href).toContain('example.com');
    });

    it('ignores internal-link anchors that have no data-href attribute', () => {
        // The selector a.internal-link[data-href] should exclude these;
        // verify no error is thrown and the element is unchanged.
        const el = makeEl('<a class="internal-link">Orphan link</a>');
        const before = el.innerHTML;
        expect(() => transformInternalLinks(el, ctx)).not.toThrow();
        expect(el.innerHTML).toBe(before);
    });

    it('percent-encodes spaces in the linked file name using %20', () => {
        // encodeURIComponent encodes spaces as %20 (not + as URLSearchParams would).
        const el = makeEl(
            '<a class="internal-link" data-href="Long Note Title">link</a>'
        );
        transformInternalLinks(el, ctx);
        const href = el.querySelector<HTMLAnchorElement>('a')!.href;
        expect(href).toContain('file=Long%20Note%20Title');
        expect(href).not.toContain('file=Long Note Title');
    });

    it('does nothing when the note contains no internal links', () => {
        const el = makeEl('<p>No links here at all.</p>');
        const before = el.innerHTML;
        transformInternalLinks(el, ctx);
        expect(el.innerHTML).toBe(before);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: Cleaning up Obsidian-injected attributes before export
// ─────────────────────────────────────────────────────────────────────────────

describe('stripping non-standard HTML attributes before export to Anki', () => {
    it('removes data-* attributes that Obsidian injects into the rendered HTML', () => {
        // LIKELY MISS: only stripping style would leave data-href visible inside exported cards.
        const el = makeEl('<span class="internal-link" data-href="Target">text</span>');
        stripAttributes(el);
        const span = el.querySelector('span')!;
        expect(span.hasAttribute('data-href')).toBe(false);
        expect(span.getAttribute('class')).toBe('internal-link'); // class is on the allow-list
    });

    it('removes inline style attributes', () => {
        const el = makeEl(
            '<p style="color:red"><strong style="font-weight:bold">text</strong></p>'
        );
        stripAttributes(el);
        expect(el.querySelector('p')!.hasAttribute('style')).toBe(false);
        expect(el.querySelector('strong')!.hasAttribute('style')).toBe(false);
    });

    it('preserves every attribute on the allow-list: href, src, alt, title, class, id', () => {
        const el = makeEl(
            '<a href="https://example.com" title="Visit" class="link" id="a1">click</a>'
        );
        stripAttributes(el);
        const a = el.querySelector('a')!;
        expect(a.getAttribute('href')).toBe('https://example.com');
        expect(a.getAttribute('title')).toBe('Visit');
        expect(a.getAttribute('class')).toBe('link');
        expect(a.getAttribute('id')).toBe('a1');
    });

    it('preserves src and alt on images while removing custom data attributes', () => {
        const el = makeEl('<img src="diagram.png" alt="A diagram" data-caption="Fig 1">');
        stripAttributes(el);
        const img = el.querySelector('img')!;
        expect(img.getAttribute('src')).toBe('diagram.png');
        expect(img.getAttribute('alt')).toBe('A diagram');
        expect(img.hasAttribute('data-caption')).toBe(false);
    });

    it('strips disallowed attributes from deeply nested elements, not only direct children', () => {
        // LIKELY MISS: a shallow traversal of direct children misses deeply nested nodes.
        const el = makeEl(
            '<div><section><p>' +
            '<span data-id="x42" class="highlight">text</span>' +
            '</p></section></div>'
        );
        stripAttributes(el);
        const span = el.querySelector('span')!;
        expect(span.hasAttribute('data-id')).toBe(false);
        expect(span.getAttribute('class')).toBe('highlight'); // class survives
    });

    it('strips disallowed attributes from multiple sibling elements in one pass', () => {
        const el = makeEl(
            '<p style="margin:0">first</p><p style="color:blue">second</p>'
        );
        stripAttributes(el);
        const paras = el.querySelectorAll('p');
        expect(paras[0].hasAttribute('style')).toBe(false);
        expect(paras[1].hasAttribute('style')).toBe(false);
    });

    it('does nothing when every present attribute is already on the allow-list', () => {
        const el = makeEl('<img src="photo.png" alt="Photo" title="hover text">');
        stripAttributes(el);
        const img = el.querySelector('img')!;
        expect(img.getAttribute('src')).toBe('photo.png');
        expect(img.getAttribute('alt')).toBe('Photo');
        expect(img.getAttribute('title')).toBe('hover text');
        expect(img.attributes.length).toBe(3); // nothing added, nothing removed
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: Full export pipeline — as triggered by the user exporting a note
// ─────────────────────────────────────────────────────────────────────────────

describe('user exports a note through the full conversion pipeline', () => {
    // None of the fixtures below contain an image embed, so convertHtml's
    // media-resolution step never touches app/client/cache — this stub is
    // never dereferenced.
    const stubMediaCtx = {} as any;

    it('applies cloze conversion, link rewriting, and attribute stripping in one call', async () => {
        const el = makeEl(
            '<p style="margin:0">' +
            'Capital: <span class="cloze">Paris</span>. ' +
            'Read <a class="internal-link" data-href="France">France</a>.' +
            '</p>'
        );
        const result = await convertHtml(el, ctx, stubMediaCtx);

        expect(result).toContain('{{c1::Paris}}');
        expect(result).toContain('obsidian://open');
        expect(result).toContain('vault=MyVault');
        // Both style and data-href must be stripped by the pipeline
        expect(result).not.toContain('style=');
        expect(result).not.toContain('data-href=');
    });

    it('does not mutate the original DOM element so the Obsidian note view stays intact', async () => {
        // LIKELY MISS: omitting cloneNode transforms the live DOM, breaking the editor view.
        const el = makeEl(
            '<p><span class="cloze" data-keep="yes">word</span></p>'
        );
        const snapshotBefore = el.innerHTML;
        await convertHtml(el, ctx, stubMediaCtx);
        expect(el.innerHTML).toBe(snapshotBefore);
    });

    it('returns the inner HTML of the root container, not a new wrapping element', async () => {
        const el = makeEl('<p>Hello world</p>');
        const result = await convertHtml(el, ctx, stubMediaCtx);
        expect(result).toBe('<p>Hello world</p>');
        expect(result.startsWith('<div')).toBe(false);
    });

    it('handles a realistic flashcard with explicit cloze IDs, a hint, and an internal link', async () => {
        const el = makeEl(
            '<p>' +
            '<span class="cloze" id="2" hint="European capital">Paris</span>' +
            ' is the capital of ' +
            '<span class="cloze" id="1">France</span>. ' +
            'More: <a class="internal-link" data-href="European Geography">link</a>.' +
            '</p>'
        );
        const result = await convertHtml(el, ctx, stubMediaCtx);

        expect(result).toContain('{{c2::Paris::European capital}}');
        expect(result).toContain('{{c1::France}}');
        expect(result).toContain('vault=MyVault');
        expect(result).toContain('file=European%20Geography');
        expect(result).not.toContain('data-href=');
    });

    it('correctly converts a note where some clozes have hints and others do not', async () => {
        const el = makeEl(
            '<p>' +
            '<span class="cloze" hint="a number">42</span>' +
            ' is the answer to <span class="cloze">everything</span>.' +
            '</p>'
        );
        const result = await convertHtml(el, ctx, stubMediaCtx);
        expect(result).toContain('{{c1::42::a number}}');
        expect(result).toContain('{{c2::everything}}');
    });

    it('passes a note with only standard HTML through without altering any content', async () => {
        const el = makeEl(
            '<p>A paragraph with <strong>bold</strong> and <em>italic</em> text.</p>'
        );
        const result = await convertHtml(el, ctx, stubMediaCtx);
        expect(result).toBe(
            '<p>A paragraph with <strong>bold</strong> and <em>italic</em> text.</p>'
        );
    });

    it('returns an empty string for an empty note without throwing', async () => {
        const el = makeEl('');
        await expect(convertHtml(el, ctx, stubMediaCtx)).resolves.toBe('');
    });

    it('resolves an image embed to the uploaded Anki media filename', async () => {
        const el = makeEl(
            '<span class="internal-embed image-embed" src="diagram.png" alt="diagram.png">' +
            '<img src="app://mock-resource/diagram.png" alt="diagram.png"></span>'
        );
        const file = { path: 'diagram.png', extension: 'png', stat: { mtime: 1 } };
        const mediaCtx = {
            app: {
                metadataCache: { getFirstLinkpathDest: () => file },
                vault: {
                    readBinary: async () => Buffer.from('fake image bytes').buffer,
                    adapter: { getFullPath: (p: string) => `/vault/${p}` },
                },
            },
            client: { storeMediaFile: jest.fn().mockResolvedValue('uploaded') },
            cache: { fileHashes: {}, uploads: {} },
        } as any;

        const result = await convertHtml(el, ctx, mediaCtx);

        expect(mediaCtx.client.storeMediaFile).toHaveBeenCalledTimes(1);
        expect(result).toMatch(/^<img src="[0-9a-f]{64}\.png" alt="diagram\.png">$/);
        expect(result).not.toContain('internal-embed');
    });
});