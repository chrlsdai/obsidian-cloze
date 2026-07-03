/**
 * @file parseNotes.test.ts
 *
 * Comprehensive tests for parseNotes.ts.
 *
 */

import { parseNotesFromElement, MalformedNoteError, InvalidMetadataError } from '../src/note/parsing';
import { NOTE_SELECTOR, METADATA_SELECTOR } from '../src/note/schema';

// ─────────────────────────────────────────────────────────────────────────────
// DOM helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a `.callout[data-callout="note"]` element with an inner
 * `.callout-content` child.
 *
 * If the sanity-check suite fails it means NOTE_SELECTOR no longer matches
 * this structure and the helpers need updating.
 */
function makeNoteEl(contentHTML = ''): HTMLElement {
    const note = document.createElement('div');
    note.classList.add('callout');
    note.setAttribute('data-callout', 'note');
    const content = document.createElement('div');
    content.classList.add('callout-content');
    content.innerHTML = contentHTML;
    note.appendChild(content);
    return note;
}

/**
 * Builds a `.callout[data-callout="note-metadata"]` element.
 *
 * Text is set via `textContent` (not `innerHTML`) so that no HTML encoding
 * edge-cases are introduced — the string is used as literal text.
 */
function makeMetaEl(text: string): HTMLElement {
    const meta = document.createElement('div');
    meta.classList.add('callout');
    meta.setAttribute('data-callout', 'note-metadata');
    const content = document.createElement('div');
    content.classList.add('callout-content');
    content.textContent = text;
    meta.appendChild(content);
    return meta;
}

/**
 * Builds a note element that already contains a metadata sub-callout
 * prepended to its `.callout-content`, plus optional extra body HTML.
 */
function makeNoteWithMeta(metaText: string, bodyHTML = ''): HTMLElement {
    const note = makeNoteEl(bodyHTML);
    note.querySelector('.callout-content')!.prepend(makeMetaEl(metaText));
    return note;
}

/**
 * Wraps the supplied elements in a container `<div>` and calls
 * `parseNotesFromElement` on it.
 */
function parseFrom(...noteEls: HTMLElement[]) {
    const root = document.createElement('div');
    for (const el of noteEls) root.appendChild(el);
    return parseNotesFromElement(root);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper sanity-checks
// (If these fail the helper shapes diverge from the real selectors.)
// ─────────────────────────────────────────────────────────────────────────────

describe('helper sanity-checks', () => {
    it('makeNoteEl() matches NOTE_SELECTOR', () => {
        const root = document.createElement('div');
        root.appendChild(makeNoteEl());
        expect(root.querySelectorAll(NOTE_SELECTOR)).toHaveLength(1);
    });

    it('makeMetaEl() matches METADATA_SELECTOR', () => {
        const root = document.createElement('div');
        root.appendChild(makeMetaEl(''));
        expect(root.querySelectorAll(METADATA_SELECTOR)).toHaveLength(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

describe('parseNotesFromElement › input validation', () => {
    it('throws TypeError for null', () =>
        expect(() => parseNotesFromElement(null as any)).toThrow(TypeError));

    it('throws TypeError for undefined', () =>
        expect(() => parseNotesFromElement(undefined as any)).toThrow(TypeError));

    it('throws TypeError for a string', () =>
        expect(() => parseNotesFromElement('hello' as any)).toThrow(TypeError));

    it('throws TypeError for a number', () =>
        expect(() => parseNotesFromElement(42 as any)).toThrow(TypeError));

    it('throws TypeError for a boolean', () =>
        expect(() => parseNotesFromElement(true as any)).toThrow(TypeError));

    it('throws TypeError for a plain object', () =>
        expect(() => parseNotesFromElement({} as any)).toThrow(TypeError));

    it('throws TypeError for an array', () =>
        expect(() => parseNotesFromElement([] as any)).toThrow(TypeError));

    it('TypeError message includes the actual typeof the bad value', () => {
        expect(() => parseNotesFromElement('x' as any)).toThrow(/string/);
        expect(() => parseNotesFromElement(42 as any)).toThrow(/number/);
    });

    it('does not throw for an HTMLDivElement', () =>
        expect(() =>
            parseNotesFromElement(document.createElement('div'))
        ).not.toThrow());

    it('does not throw for document.body', () =>
        expect(() => parseNotesFromElement(document.body)).not.toThrow());

    it('does not throw for other HTMLElement subtypes (e.g. <section>)', () =>
        expect(() =>
            parseNotesFromElement(document.createElement('section'))
        ).not.toThrow());
});

// ─────────────────────────────────────────────────────────────────────────────
// No notes found
// ─────────────────────────────────────────────────────────────────────────────

describe('parseNotesFromElement › no note callouts present', () => {
    it('returns [] for an empty element', () =>
        expect(parseNotesFromElement(document.createElement('div'))).toEqual([]));

    it('returns [] for plain paragraph content', () => {
        const el = document.createElement('div');
        el.innerHTML = '<p>hello</p><ul><li>item</li></ul>';
        expect(parseNotesFromElement(el)).toEqual([]);
    });

    it('returns [] for a callout of a different type', () => {
        const el = document.createElement('div');
        el.innerHTML =
            '<div class="callout" data-callout="tip">' +
            '<div class="callout-content">!</div></div>';
        expect(parseNotesFromElement(el)).toEqual([]);
    });

    it('does not match the root element itself (querySelectorAll is descendants-only)', () => {
        // Even if the root IS a note callout it will not be returned —
        // querySelectorAll never matches the element it is called on.
        expect(parseNotesFromElement(makeNoteEl('<p>hi</p>'))).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Single note — no metadata
// ─────────────────────────────────────────────────────────────────────────────

describe('single note without metadata', () => {
    it('returns an array of length 1', () =>
        expect(parseFrom(makeNoteEl())).toHaveLength(1));

    it('result is a true Array', () =>
        expect(Array.isArray(parseFrom(makeNoteEl()))).toBe(true));

    it('Note.id is undefined', () =>
        expect(parseFrom(makeNoteEl())[0]!.id).toBeUndefined());

    it('Note.cardFields is {}', () =>
        expect(parseFrom(makeNoteEl())[0]!.noteFields).toEqual({}));

    it('Note.tags is an empty array', () => {
        const { tags } = parseFrom(makeNoteEl())[0]!;
        expect(tags).toBeInstanceOf(Array<string>);
        expect(tags.length).toBe(0);
    });

    it('Note.textElement is an HTMLElement', () =>
        expect(
            parseFrom(makeNoteEl('<p>hi</p>'))[0]!.textElement
        ).toBeInstanceOf(HTMLElement));

    it('Note.textElement contains the body HTML', () => {
        const [n] = parseFrom(makeNoteEl('<p id="body">content</p>'));
        expect(n!.textElement.querySelector('#body')).not.toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multiple notes
// ─────────────────────────────────────────────────────────────────────────────

describe('multiple notes', () => {
    it('returns the correct number of Notes', () =>
        expect(parseFrom(makeNoteEl(), makeNoteEl(), makeNoteEl())).toHaveLength(3));

    it('preserves DOM order', () => {
        const ids = parseFrom(
            makeNoteWithMeta('id: 10'),
            makeNoteWithMeta('id: 20'),
            makeNoteWithMeta('id: 30'),
        ).map((n) => n.id);
        expect(ids).toEqual([10, 20, 30]);
    });

    it('each Note is a distinct object', () => {
        const [a, b] = parseFrom(makeNoteEl(), makeNoteEl());
        expect(a).not.toBe(b);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Malformed: missing .callout-content
// ─────────────────────────────────────────────────────────────────────────────

describe('malformed note — missing .callout-content', () => {
    const makeNoContentNote = (): HTMLElement => {
        const el = document.createElement('div');
        el.classList.add('callout');
        el.setAttribute('data-callout', 'note');
        return el; // intentionally no .callout-content child
    };

    it('throws MalformedNoteError', () =>
        expect(() => parseFrom(makeNoContentNote())).toThrow(MalformedNoteError));

    it('error message mentions "callout-content"', () =>
        expect(() => parseFrom(makeNoContentNote())).toThrow(/callout-content/i));
});

// ─────────────────────────────────────────────────────────────────────────────
// Malformed: multiple metadata blocks
// ─────────────────────────────────────────────────────────────────────────────

describe('malformed note — multiple metadata blocks', () => {
    const makeNoteWithNMeta = (n: number): HTMLElement => {
        const note = document.createElement('div');
        note.classList.add('callout');
        note.setAttribute('data-callout', 'note');
        const content = document.createElement('div');
        content.classList.add('callout-content');
        for (let i = 0; i < n; i++) {
            content.appendChild(makeMetaEl(`id: ${i + 1}`));
        }
        note.appendChild(content);
        return note;
    };

    it('0 metadata blocks → no error', () =>
        expect(() => parseFrom(makeNoteEl())).not.toThrow());

    it('1 metadata block → no error', () =>
        expect(() => parseFrom(makeNoteWithNMeta(1))).not.toThrow());

    it('2 metadata blocks → throws MalformedNoteError', () =>
        expect(() => parseFrom(makeNoteWithNMeta(2))).toThrow(MalformedNoteError));

    it('3 metadata blocks → throws MalformedNoteError', () =>
        expect(() => parseFrom(makeNoteWithNMeta(3))).toThrow(MalformedNoteError));

    it('error message includes the count found (2)', () =>
        expect(() => parseFrom(makeNoteWithNMeta(2))).toThrow(/2/));
});

// ─────────────────────────────────────────────────────────────────────────────
// Metadata — id field
// ─────────────────────────────────────────────────────────────────────────────

describe('metadata › id field', () => {
    const parseId = (raw: string) =>
        parseFrom(makeNoteWithMeta(`id: ${raw}`))[0]!.id;

    const throwsForMeta = (meta: string) =>
        expect(() => parseFrom(makeNoteWithMeta(meta))).toThrow(InvalidMetadataError);

    // ── Happy path ─────────────────────────────────────────────────────────────

    it('parses "1" as 1', () => expect(parseId('1')).toBe(1));
    it('parses "42" as 42', () => expect(parseId('42')).toBe(42));
    it('parses Number.MAX_SAFE_INTEGER', () =>
        expect(parseId(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER));

    // ── Duplicate id ───────────────────────────────────────────────────────────

    it('throws NoteParseError for duplicate id fields', () =>
        throwsForMeta('id: 1\nid: 2'));

    it('duplicate-id error message mentions "duplicate"', () =>
        expect(() =>
            parseFrom(makeNoteWithMeta('id: 1\nid: 2'))
        ).toThrow(/[Dd]uplicate/i));

    // ── Rejected values ────────────────────────────────────────────────────────

    it('throws for alphabetic id "abc"', () =>
        throwsForMeta('id: abc'));

    it('throws for float id "1.5"', () =>
        throwsForMeta('id: 1.5'));

    it('throws for negative id "-1"', () =>
        throwsForMeta('id: -1'));

    it('throws for id with trailing non-digit "123abc"', () =>
        throwsForMeta('id: 123abc'));

    it('throws for id with leading non-digit "abc123"', () =>
        throwsForMeta('id: abc123'));

    it('throws for hex literal "0xFF"', () =>
        throwsForMeta('id: 0xFF'));

    it('throws for scientific notation "1e5"', () =>
        throwsForMeta('id: 1e5'));

    it('throws for an unsafe large integer', () =>
        throwsForMeta('id: 99999999999999999999'));

    it('throws for empty id value ("id:")', () =>
        throwsForMeta('id:'));

    it('throws for a whitespace-only id value ("id:   ")', () =>
        throwsForMeta('id:   '));

    it('error message includes the invalid value', () =>
        expect(() =>
            parseFrom(makeNoteWithMeta('id: totally-wrong'))
        ).toThrow(/totally-wrong/));

    // ── Absent field ───────────────────────────────────────────────────────────

    it('id is undefined when the id field is absent', () =>
        expect(parseFrom(makeNoteWithMeta('tags: foo'))[0]!.id).toBeUndefined());
});

// ─────────────────────────────────────────────────────────────────────────────
// Metadata — tags field
// ─────────────────────────────────────────────────────────────────────────────

describe('metadata › tags field', () => {
    const parseTags = (meta: string) =>
        parseFrom(makeNoteWithMeta(meta))[0]!.tags;

    it('single tag', () =>
        expect(parseTags('tags: foo')).toEqual(['foo']));

    it('comma-separated tags', () =>
        expect(parseTags('tags: a, b, c')).toEqual(['a', 'b', 'c']));

    it('space-separated tags', () =>
        expect(parseTags('tags: a b c')).toEqual(['a', 'b', 'c']));

    it('mixed comma+space separated', () =>
        expect(parseTags('tags: a, b c')).toEqual(['a', 'b', 'c']));

    it('consecutive separators (e.g. "a,,, b")', () =>
        expect(parseTags('tags: a,,, b')).toEqual(['a', 'b']));

    it('no empty-string entries from leading/trailing separators', () => {
        expect(parseTags('tags: ,foo,').includes('')).toBe(false);
    });

    it('empty tags value ("tags:") → empty list', () =>
        expect(parseTags('tags:')).toEqual([]));

    it('absent tags field → empty list', () =>
        expect(parseTags('id: 1')).toEqual([]));

    it('result is an Array instance', () =>
        expect(parseTags('tags: x')).toBeInstanceOf(Array<string>));

    it('second tags line silently replaces the first (first value is lost)', () => {
        const [n] = parseFrom(makeNoteWithMeta('tags: foo\ntags: bar'));
        expect(n!.tags).toEqual(['bar']);
        expect(n!.tags.includes('foo')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Metadata — cardFields
// ─────────────────────────────────────────────────────────────────────────────

describe('metadata › cardFields', () => {
    const parseFields = (meta: string) =>
        parseFrom(makeNoteWithMeta(meta))[0]!.noteFields;

    it('single key-value pair', () =>
        expect(parseFields('front: hello')).toEqual({ front: 'hello' }));

    it('multiple pairs', () =>
        expect(parseFields('front: q\nback: a')).toEqual({ front: 'q', back: 'a' }));

    it('"id" is not included in cardFields', () =>
        expect(parseFields('id: 1\nfront: x')).not.toHaveProperty('id'));

    it('"tags" is not included in cardFields', () =>
        expect(parseFields('tags: foo\nfront: x')).not.toHaveProperty('tags'));

    it('colons inside the value are preserved (e.g. URLs)', () =>
        expect(parseFields('url: https://example.com:443/path'))
            .toEqual({ url: 'https://example.com:443/path' }));

    it('empty value after colon stores empty string', () =>
        expect(parseFields('k:')).toEqual({ k: '' }));

    it('key whitespace is trimmed', () =>
        expect(parseFields('  key  : value')).toEqual({ key: 'value' }));

    it('value whitespace is trimmed', () =>
        expect(parseFields('key:   value   ')).toEqual({ key: 'value' }));

    it('lines without a colon are skipped', () =>
        expect(parseFields('no-colon-here')).toEqual({}));

    it('lines that begin with a colon (empty key) are skipped', () =>
        expect(parseFields(': orphan-value')).toEqual({}));

    it('blank and whitespace-only lines are skipped', () =>
        expect(parseFields('\n   \nk: v\n\n')).toEqual({ k: 'v' }));

    it('returns {} when all lines are unparseable', () =>
        expect(parseFields('lorem ipsum dolor')).toEqual({}));
});

// ─────────────────────────────────────────────────────────────────────────────
// Note.textElement
// ─────────────────────────────────────────────────────────────────────────────

describe('Note.textElement', () => {
    // ── Shape and identity ─────────────────────────────────────────────────

    it('is an HTMLElement', () =>
        expect(parseFrom(makeNoteEl('<p>x</p>'))[0]!.textElement)
            .toBeInstanceOf(HTMLElement));

    it('is the cloned .callout-content element — carries that class', () => {
        const [n] = parseFrom(makeNoteEl('<p>x</p>'));
        expect(n!.textElement.classList.contains('callout-content')).toBe(true);
    });

    it('is a distinct node — not the same reference as the original .callout-content', () => {
        const noteEl = makeNoteWithMeta('id: 1', '<p>body</p>');
        const root = document.createElement('div');
        root.appendChild(noteEl);

        const [n] = parseNotesFromElement(root);

        expect(n!.textElement).not.toBe(noteEl.querySelector('.callout-content'));
    });

    // ── Deep-clone guarantee ───────────────────────────────────────────────

    it('original .callout-content still contains the metadata element after parsing', () => {
        const noteEl = makeNoteWithMeta('id: 1', '<p>body</p>');
        const root = document.createElement('div');
        root.appendChild(noteEl);

        parseNotesFromElement(root);

        const originalContentEl = noteEl.querySelector('.callout-content')!;
        expect(originalContentEl.querySelector(METADATA_SELECTOR)).not.toBeNull();
    });

    it('mutating textElement does not affect the original source DOM', () => {
        const noteEl = makeNoteWithMeta('id: 1', '<p id="t">original</p>');
        const root = document.createElement('div');
        root.appendChild(noteEl);

        const [n] = parseNotesFromElement(root);
        n!.textElement.querySelector<HTMLElement>('#t')!.textContent = 'mutated';

        expect(noteEl.querySelector<HTMLElement>('#t')!.textContent).toBe('original');
    });

    it('mutating the original source DOM does not affect textElement', () => {
        const noteEl = makeNoteWithMeta('id: 1', '<p id="t">original</p>');
        const root = document.createElement('div');
        root.appendChild(noteEl);

        const [n] = parseNotesFromElement(root);
        noteEl.querySelector<HTMLElement>('#t')!.textContent = 'mutated';

        expect(n!.textElement.querySelector<HTMLElement>('#t')!.textContent).toBe('original');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration
// ─────────────────────────────────────────────────────────────────────────────

describe('integration', () => {
    it('full note: id + tags + cardFields + body all parsed correctly', () => {
        const [n] = parseFrom(
            makeNoteWithMeta(
                'id: 99\ntags: math, science\nfront: 2 + 2?\nback: 4',
                '<p class="body">Context.</p>',
            ),
        );

        expect(n!.id).toBe(99);
        expect(n!.tags).toEqual(['math', 'science']);
        expect(n!.noteFields).toEqual({ front: '2 + 2?', back: '4' });
        expect(n!.textElement.querySelector('.body')).not.toBeNull();
        expect(n!.textElement.querySelector(METADATA_SELECTOR)).toBeNull();
    });

    it('two notes are parsed independently', () => {
        const [a, b] = parseFrom(
            makeNoteWithMeta('id: 1\nfront: Question A'),
            makeNoteWithMeta('id: 2\nfront: Question B'),
        );

        expect(a!.id).toBe(1);
        expect(a!.noteFields.front).toBe('Question A');
        expect(b!.id).toBe(2);
        expect(b!.noteFields.front).toBe('Question B');
    });

    it('a NoteParseError in one note aborts the entire call', () => {
        const noContent = document.createElement('div');
        noContent.classList.add('callout');
        noContent.setAttribute('data-callout', 'note');
        // no .callout-content → throws MalformedNoteError mid-iteration

        expect(() =>
            parseFrom(
                makeNoteWithMeta('id: 1'),
                noContent,
                makeNoteWithMeta('id: 3'),
            )
        ).toThrow(MalformedNoteError);
    });

    it('a note with only metadata (no body HTML) parses without error', () => {
        const [n] = parseFrom(makeNoteWithMeta('id: 5\ntags: review'));
        expect(n!.id).toBe(5);
        expect(n!.tags).toEqual(['review']);
    });

    it('a note with only body content (no metadata) has default field values', () => {
        const [n] = parseFrom(makeNoteEl('<p>body only</p>'));
        expect(n!.id).toBeUndefined();
        expect(n!.noteFields).toEqual({});
        expect(n!.tags.length).toBe(0);
    });
});