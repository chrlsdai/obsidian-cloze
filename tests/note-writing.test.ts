/**
 * Comprehensive test suite for locateNotes and applyNoteUpdates.
 *
 * Imports from "./note" are used directly so the tests remain valid
 * regardless of the exact string values of METADATA_HEADER / the regexes.
 *
 * Adjust the first import path to match your project's file layout.
 */

import { locateNotes, applyNoteUpdates } from '../src/note/writing';
import { NOTE_HEADER, METADATA_HEADER, NoteLocation } from '../src/note/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Joins its arguments with LF newlines to form a multi-line document. */
const doc = (...lines: string[]): string => lines.join('\n');

/** A minimal valid two-line document for use in applyCardFieldUpdates tests. */
const simpleMd = doc(NOTE_HEADER, '> Content');

/** A fully valid NoteLocation for simpleMd (no metadata block). */
const validLoc = (): NoteLocation => ({
  noteStart: 0,
  noteEnd: 1,
  metaStart: -1,
  metaEnd: -1,
});

/** A fully valid NoteLocation for a document that already has a metadata block. */
const metaMd = doc(NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01');
const validMetaLoc = (): NoteLocation => ({
  noteStart: 0,
  noteEnd: 2,
  metaStart: 1,
  metaEnd: 2,
});

// ---------------------------------------------------------------------------
// locateNotes
// ---------------------------------------------------------------------------

describe('locateNotes', () => {

  // ── empty / trivial input ─────────────────────────────────────────────────

  describe('empty and trivial inputs', () => {
    it('returns [] for an empty string', () => {
      expect(locateNotes('')).toEqual([]);
    });

    it('returns [] for a string that contains only whitespace and newlines', () => {
      expect(locateNotes('   \n \n\n')).toEqual([]);
    });

    it('returns [] for plain text with no blockquote characters', () => {
      expect(locateNotes('Hello\nWorld')).toEqual([]);
    });

    it('returns [] for a plain blockquote that is not a note-header', () => {
      expect(locateNotes('> just a regular blockquote')).toEqual([]);
    });

    it('returns [] for a non-note callout such as [!warning]', () => {
      expect(locateNotes(doc('> [!warning]', '> Be careful'))).toEqual([]);
    });

    it('returns [] when only a metadata header appears with no preceding note header', () => {
      expect(locateNotes(doc(METADATA_HEADER, '>> field: value'))).toEqual([]);
    });
  });

  // ── single note, no metadata ──────────────────────────────────────────────

  describe('single note without metadata', () => {
    it('locates a one-line note that is also the end of the document', () => {
      const result = locateNotes(NOTE_HEADER);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        noteStart: 0, noteEnd: 0, metaStart: -1, metaEnd: -1,
      });
    });

    it('locates a note terminated by a blank line', () => {
      const md = doc(NOTE_HEADER, '> Content', '');
      const result = locateNotes(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        noteStart: 0, noteEnd: 1, metaStart: -1, metaEnd: -1,
      });
    });

    it('locates a note with several content lines terminated by a blank line', () => {
      const md = doc(NOTE_HEADER, '> L1', '> L2', '> L3', '');
      const result = locateNotes(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        noteStart: 0, noteEnd: 3, metaStart: -1, metaEnd: -1,
      });
    });

    it('locates a note with no trailing blank line (terminated by EOF)', () => {
      const md = doc(NOTE_HEADER, '> Content');
      const result = locateNotes(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        noteStart: 0, noteEnd: 1, metaStart: -1, metaEnd: -1,
      });
    });

    it('assigns the correct noteStart when the note is preceded by non-note content', () => {
      const md = doc('# Heading', 'Paragraph', '', NOTE_HEADER, '> Content', '');
      const result = locateNotes(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ noteStart: 3, noteEnd: 4 });
    });

    it('closes the note when it hits a non-empty, non-blockquote line', () => {
      const md = doc(NOTE_HEADER, '> Content', 'Paragraph after');
      const result = locateNotes(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ noteStart: 0, noteEnd: 1 });
    });

    it('handles a bare `>` (no space or text) as valid note content', () => {
      const md = doc(NOTE_HEADER, '>');
      const result = locateNotes(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ noteEnd: 1 });
    });
  });

  // ── single note with metadata ─────────────────────────────────────────────

  describe('single note with metadata', () => {
    it('sets metaStart to the line index of the metadata header', () => {
      // lines: 0=NOTE_HEADER  1='> Front'  2=METADATA_HEADER  3='>> due…'
      const md = doc(NOTE_HEADER, '> Front', METADATA_HEADER, '>> due: 2024-01-01');
      expect(locateNotes(md)[0]!.metaStart).toBe(2);
    });

    it('sets metaEnd to the index of the last metadata field line', () => {
      const md = doc(NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01', '>> interval: 7');
      expect(locateNotes(md)[0]!.metaEnd).toBe(3);
    });

    it('returns a fully correct NoteLocation for a standard note + metadata block', () => {
      const md = doc(NOTE_HEADER, '> Front', METADATA_HEADER, '>> due: 2024-01-01', '');
      const result = locateNotes(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        noteStart: 0, noteEnd: 3, metaStart: 2, metaEnd: 3,
      });
    });

    it('handles a metadata block with multiple fields', () => {
      const md = doc(
        NOTE_HEADER,
        METADATA_HEADER,
        '>> due: 2024-01-01',
        '>> interval: 7',
        '>> ease: 2.5',
        '',
      );
      const result = locateNotes(md);
      expect(result[0]).toEqual({
        noteStart: 0, noteEnd: 4, metaStart: 1, metaEnd: 4,
      });
    });

    it('records metaEnd === metaStart when the metadata block has only its header line', () => {
      // The metadata block is opened but contains no field lines before the note closes.
      const md = doc(NOTE_HEADER, METADATA_HEADER, '');
      const result = locateNotes(md);
      expect(result[0]).toMatchObject({ metaStart: 1, metaEnd: 1 });
    });

    it('works correctly when there is no blank-line terminator (EOF ends the note)', () => {
      const md = doc(NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01');
      const result = locateNotes(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 2,
      });
    });

    it('includes note-content lines before the metadata block in the note span', () => {
      const md = doc(
        NOTE_HEADER,              // 0
        '> Front',                // 1
        '> Back',                 // 2
        METADATA_HEADER,          // 3
        '>> due: 2024-01-01',     // 4
        '',
      );
      const result = locateNotes(md);
      expect(result[0]).toMatchObject({ noteStart: 0, noteEnd: 4, metaStart: 3, metaEnd: 4 });
    });

    it('includes note-content lines that follow the metadata block in the note span', () => {
      const md = doc(
        NOTE_HEADER,              // 0
        METADATA_HEADER,          // 1
        '>> due: 2024-01-01',     // 2
        '> Back side',            // 3  exits metadata; still inside the note
        '',                       // 4  closes note → noteEnd = 3
      );
      const result = locateNotes(md);
      expect(result[0]).toMatchObject({ noteEnd: 3, metaStart: 1, metaEnd: 2 });
    });
  });

  // ── second metadata block handling ────────────────────────────────────────

  describe('second metadata block', () => {
    it('records only the first metadata block; a later one is treated as note content', () => {
      const md = doc(
        NOTE_HEADER,              // 0
        '> Front',                // 1
        METADATA_HEADER,          // 2 ← first metadata: metaStart
        '>> due: 2024-01-01',     // 3 ← first metadata: metaEnd
        '> More content',         // 4  exits metadata; stays in note
        METADATA_HEADER,          // 5  second header — metaStart !== -1, so ignored
        '>> other: val',          // 6  treated as ordinary > content
        '',                       // 7  closes note  (noteEnd = 6)
      );
      const result = locateNotes(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        noteStart: 0, noteEnd: 6, metaStart: 2, metaEnd: 3,
      });
    });
  });

  // ── multiple notes ────────────────────────────────────────────────────────

  describe('multiple notes', () => {
    it('locates two consecutive notes separated by a blank line', () => {
      const md = doc(NOTE_HEADER, '> A', '', NOTE_HEADER, '> B', '');
      const result = locateNotes(md);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ noteStart: 0, noteEnd: 1 });
      expect(result[1]).toMatchObject({ noteStart: 3, noteEnd: 4 });
    });

    it('locates two notes when both have metadata', () => {
      const md = doc(
        NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01', '',
        NOTE_HEADER, METADATA_HEADER, '>> due: 2024-06-01', '',
      );
      const result = locateNotes(md);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ metaStart: 1, metaEnd: 2 });
      expect(result[1]).toMatchObject({ metaStart: 5, metaEnd: 6 });
    });

    it('locates correctly when only the first note has metadata', () => {
      const md = doc(
        NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01', '',
        NOTE_HEADER, '> Content', '',
      );
      const result = locateNotes(md);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ metaStart: 1, metaEnd: 2 });
      expect(result[1]).toMatchObject({ metaStart: -1, metaEnd: -1 });
    });

    it('locates correctly when only the second note has metadata', () => {
      const md = doc(
        NOTE_HEADER, '> Content', '',
        NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01', '',
      );
      const result = locateNotes(md);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ metaStart: -1, metaEnd: -1 });
      expect(result[1]).toMatchObject({ metaStart: 4, metaEnd: 5 });
    });

    it('returns three notes in document order', () => {
      const md = doc(
        NOTE_HEADER, '> A', '',
        NOTE_HEADER, '> B', '',
        NOTE_HEADER, '> C', '',
      );
      const result = locateNotes(md);
      expect(result).toHaveLength(3);
      expect(result[0]!.noteStart).toBeLessThan(result[1]!.noteStart);
      expect(result[1]!.noteStart).toBeLessThan(result[2]!.noteStart);
    });

    it('closes the last note at EOF when no trailing blank line is present', () => {
      const md = doc(NOTE_HEADER, '> A', '', NOTE_HEADER, '> B');
      const result = locateNotes(md);
      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({ noteStart: 3, noteEnd: 4 });
    });

    it('does not start a new note from a note-header line appearing inside a note', () => {
      const md = doc(NOTE_HEADER, NOTE_HEADER, '> Content', '');
      const result = locateNotes(md);
      // Only one note is expected; the inner note-header is treated as content
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ noteStart: 0, noteEnd: 2 });
    });
  });

  // ── CRLF (Windows) line endings ───────────────────────────────────────────

  describe('CRLF line endings', () => {
    it('handles CRLF for a simple note', () => {
      const md = [NOTE_HEADER, '> Content', ''].join('\r\n');
      const result = locateNotes(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ noteStart: 0, noteEnd: 1 });
    });

    it('handles CRLF for a note with a metadata block', () => {
      const md = [NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01', ''].join('\r\n');
      const result = locateNotes(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ metaStart: 1, metaEnd: 2 });
    });

    it('locates multiple notes with CRLF line endings', () => {
      const md = [NOTE_HEADER, '> A', '', NOTE_HEADER, '> B', ''].join('\r\n');
      expect(locateNotes(md)).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// applyNoteUpdates
// ---------------------------------------------------------------------------

describe('applyNoteUpdates', () => {

  // ── empty fields map ──────────────────────────────────────────────────────

  describe('empty fields map', () => {
    it('returns the exact same string reference when fields is {}', () => {
      const md = doc(NOTE_HEADER, '> Content');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 1, metaStart: -1, metaEnd: -1 };
      expect(applyNoteUpdates(md, loc, {})).toBe(md);
    });

    it('returns the original string even when the note already has metadata', () => {
      const md = doc(NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 2 };
      expect(applyNoteUpdates(md, loc, {})).toBe(md);
    });
  });

  // ── inserting a new metadata block (metaStart === -1) ─────────────────────

  describe('inserting a new metadata block (metaStart === -1)', () => {
    it('inserts METADATA_HEADER immediately after the note-header line', () => {
      const md = doc(NOTE_HEADER, '> Front', '> Back');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: -1, metaEnd: -1 };
      const ls = applyNoteUpdates(md, loc, { due: '2024-06-01' }).split('\n');
      expect(ls[1]).toBe(METADATA_HEADER);
    });

    it('places a single field line immediately after the metadata header', () => {
      const md = doc(NOTE_HEADER, '> Content');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 1, metaStart: -1, metaEnd: -1 };
      const ls = applyNoteUpdates(md, loc, { due: '2024-06-01' }).split('\n');
      expect(ls[2]).toBe('>> due: 2024-06-01');
    });

    it('places all field lines after the metadata header', () => {
      const md = doc(NOTE_HEADER);
      const loc: NoteLocation = { noteStart: 0, noteEnd: 0, metaStart: -1, metaEnd: -1 };
      const ls = applyNoteUpdates(md, loc, { due: '2024-06-01', interval: '7' }).split('\n');
      expect(ls[1]).toBe(METADATA_HEADER);
      expect(ls.slice(2)).toContain('>> due: 2024-06-01');
      expect(ls.slice(2)).toContain('>> interval: 7');
    });

    it('increases the total line count by 1 (header) + number of fields', () => {
      const md = doc(NOTE_HEADER, '> Content');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 1, metaStart: -1, metaEnd: -1 };
      const fields = { due: '2024-06-01', interval: '7', ease: '2.5' };
      const result = applyNoteUpdates(md, loc, fields);
      expect(result.split('\n').length).toBe(md.split('\n').length + 1 + 3);
    });

    it('preserves all lines that precede the note', () => {
      const md = doc('# Heading', '', NOTE_HEADER, '> Content');
      const loc: NoteLocation = { noteStart: 2, noteEnd: 3, metaStart: -1, metaEnd: -1 };
      const ls = applyNoteUpdates(md, loc, { due: '2024-06-01' }).split('\n');
      expect(ls[0]).toBe('# Heading');
      expect(ls[1]).toBe('');
      expect(ls[2]).toBe(NOTE_HEADER);
    });

    it('preserves all lines that follow the note', () => {
      const md = doc(NOTE_HEADER, '> Content', '', '# After');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 1, metaStart: -1, metaEnd: -1 };
      const result = applyNoteUpdates(md, loc, { due: '2024-06-01' });
      expect(result.split('\n').pop()).toBe('# After');
    });

    it('preserves original note content lines after the insertion', () => {
      const md = doc(NOTE_HEADER, '> Front', '> Back');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: -1, metaEnd: -1 };
      const result = applyNoteUpdates(md, loc, { due: '2024-06-01' });
      expect(result).toContain('> Front');
      expect(result).toContain('> Back');
    });

    it('inserts at the correct position when noteStart > 0', () => {
      const md = doc('# H', '', NOTE_HEADER, '> Content');
      const loc: NoteLocation = { noteStart: 2, noteEnd: 3, metaStart: -1, metaEnd: -1 };
      const ls = applyNoteUpdates(md, loc, { due: '2024-06-01' }).split('\n');
      expect(ls[3]).toBe(METADATA_HEADER);
      expect(ls[4]).toBe('>> due: 2024-06-01');
      expect(ls[5]).toBe('> Content');
    });
  });

  // ── updating existing metadata (metaStart !== -1) ─────────────────────────

  describe('updating existing metadata (metaStart !== -1)', () => {
    it('updates an existing field in place; line count stays the same', () => {
      const md = doc(NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 2 };
      const result = applyNoteUpdates(md, loc, { due: '2024-12-31' });
      const ls = result.split('\n');
      expect(ls[2]).toBe('>> due: 2024-12-31');
      expect(ls).toHaveLength(3);
    });

    it('updates multiple existing fields in place without changing line count', () => {
      const md = doc(
        NOTE_HEADER, METADATA_HEADER,
        '>> due: 2024-01-01',
        '>> interval: 3',
        '>> ease: 2.0',
      );
      const loc: NoteLocation = { noteStart: 0, noteEnd: 4, metaStart: 1, metaEnd: 4 };
      const result = applyNoteUpdates(md, loc, {
        due: '2024-12-31', interval: '10', ease: '2.5',
      });
      const ls = result.split('\n');
      expect(ls[2]).toBe('>> due: 2024-12-31');
      expect(ls[3]).toBe('>> interval: 10');
      expect(ls[4]).toBe('>> ease: 2.5');
      expect(ls).toHaveLength(5);
    });

    it('appends a new field after the last metadata line when the key is absent', () => {
      const md = doc(NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 2 };
      const result = applyNoteUpdates(md, loc, { interval: '7' });
      const ls = result.split('\n');
      expect(ls[2]).toBe('>> due: 2024-01-01');
      expect(ls[3]).toBe('>> interval: 7');
    });

    it('updates an existing field AND appends a new one in the same call', () => {
      const md = doc(NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 2 };
      const result = applyNoteUpdates(md, loc, { due: '2024-12-31', interval: '14' });
      const ls = result.split('\n');
      expect(ls[2]).toBe('>> due: 2024-12-31');
      expect(ls[3]).toBe('>> interval: 14');
    });

    it('appends all fields when none of the keys exist in the existing metadata', () => {
      const md = doc(NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 2 };
      const result = applyNoteUpdates(md, loc, { a: '1', b: '2' });
      const ls = result.split('\n');
      expect(ls[2]).toBe('>> due: 2024-01-01');
      expect(ls.slice(3)).toContain('>> a: 1');
      expect(ls.slice(3)).toContain('>> b: 2');
    });

    it('does not modify the METADATA_HEADER line itself', () => {
      const md = doc(NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 2 };
      const result = applyNoteUpdates(md, loc, { due: '2024-12-31' });
      expect(result.split('\n')[1]).toBe(METADATA_HEADER);
    });

    it('does not modify the note-header line', () => {
      const md = doc(NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 2 };
      const result = applyNoteUpdates(md, loc, { due: '2024-12-31' });
      expect(result.split('\n')[0]).toBe(NOTE_HEADER);
    });

    it('preserves metadata lines that do not match the key-value pattern', () => {
      const md = doc(
        NOTE_HEADER,
        METADATA_HEADER,
        '>> not-a-key-value-line',
        '>> due: 2024-01-01',
      );
      const loc: NoteLocation = { noteStart: 0, noteEnd: 3, metaStart: 1, metaEnd: 3 };
      const result = applyNoteUpdates(md, loc, { due: '2024-12-31' });
      const ls = result.split('\n');
      expect(ls[2]).toBe('>> not-a-key-value-line');
      expect(ls[3]).toBe('>> due: 2024-12-31');
    });

    it('updates only the first occurrence when a key is duplicated in metadata', () => {
      const md = doc(
        NOTE_HEADER,
        METADATA_HEADER,
        '>> due: 2024-01-01',  // first occurrence
        '>> due: 2024-02-02',  // duplicate
      );
      const loc: NoteLocation = { noteStart: 0, noteEnd: 3, metaStart: 1, metaEnd: 3 };
      const result = applyNoteUpdates(md, loc, { due: '2024-12-31' });
      const ls = result.split('\n');
      expect(ls[2]).toBe('>> due: 2024-12-31');
      expect(ls[3]).toBe('>> due: 2024-02-02');
    });

    it('preserves note-content lines that follow the metadata block', () => {
      const md = doc(
        NOTE_HEADER,
        METADATA_HEADER,
        '>> due: 2024-01-01',
        '> Back side of the card',
        '',
      );
      const loc: NoteLocation = { noteStart: 0, noteEnd: 3, metaStart: 1, metaEnd: 2 };
      const result = applyNoteUpdates(md, loc, { due: '2024-12-31' });
      expect(result.split('\n')[3]).toBe('> Back side of the card');
    });

    it('inserts appended fields between the last metadata line and subsequent document lines', () => {
      const md = doc(
        NOTE_HEADER,
        METADATA_HEADER,
        '>> due: 2024-01-01',
        '',
        'Extra line',
      );
      const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 2 };
      const result = applyNoteUpdates(md, loc, { interval: '7' });
      const ls = result.split('\n');
      expect(ls[3]).toBe('>> interval: 7');
      expect(ls[4]).toBe('');
      expect(ls[5]).toBe('Extra line');
    });

    it('appends all fields when the metadata block contains only its header (metaStart === metaEnd)', () => {
      const md = doc(NOTE_HEADER, METADATA_HEADER, '> Back');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 1 };
      const result = applyNoteUpdates(md, loc, { due: '2024-06-01' });
      const ls = result.split('\n');
      expect(ls[2]).toBe('>> due: 2024-06-01');
      expect(ls[3]).toBe('> Back');
    });
  });

  // ── field-line format ─────────────────────────────────────────────────────

  describe('field line format', () => {
    const loc: NoteLocation = { noteStart: 0, noteEnd: 0, metaStart: -1, metaEnd: -1 };

    it('formats field lines as ">> <key>: <value>"', () => {
      const result = applyNoteUpdates(NOTE_HEADER, loc, { myKey: 'myValue' });
      expect(result).toContain('>> myKey: myValue');
    });

    it('preserves values that contain colons', () => {
      const result = applyNoteUpdates(NOTE_HEADER, loc, {
        url: 'https://example.com/path',
      });
      expect(result).toContain('>> url: https://example.com/path');
    });

    it('preserves values that contain spaces', () => {
      const result = applyNoteUpdates(NOTE_HEADER, loc, { tag: 'hello world' });
      expect(result).toContain('>> tag: hello world');
    });

    it('preserves numeric string values exactly', () => {
      const result = applyNoteUpdates(NOTE_HEADER, loc, { interval: '42' });
      expect(result).toContain('>> interval: 42');
    });

    it('preserves an empty string value', () => {
      const result = applyNoteUpdates(NOTE_HEADER, loc, { cleared: '' });
      expect(result).toContain('>> cleared: ');
    });
  });

  // ── integration / round-trip ──────────────────────────────────────────────

  describe('integration and round-trip', () => {
    it('locateNotes finds the newly inserted metadata block in the updated string', () => {
      const md = doc(NOTE_HEADER, '> Content');
      const loc: NoteLocation = { noteStart: 0, noteEnd: 1, metaStart: -1, metaEnd: -1 };
      const updated = applyNoteUpdates(md, loc, { due: '2024-06-01' });
      const newLocs = locateNotes(updated);
      expect(newLocs).toHaveLength(1);
      expect(newLocs[0]!.metaStart).toBeGreaterThan(-1);
      expect(newLocs[0]!.metaEnd).toBeGreaterThan(-1);
    });

    it('a second call using re-located positions updates fields correctly', () => {
      // First pass: insert metadata
      const md = doc(NOTE_HEADER, '> Content');
      const loc1 = locateNotes(md)[0]!;
      const step1 = applyNoteUpdates(md, loc1, { due: '2024-06-01' });

      // Second pass: update due, append interval
      const loc2 = locateNotes(step1)[0]!;
      const step2 = applyNoteUpdates(step1, loc2, { due: '2024-12-31', interval: '7' });

      const finalLoc = locateNotes(step2)[0]!;
      const ls = step2.split('\n');
      // The due field was updated in place (metaStart + 1)
      expect(ls[finalLoc.metaStart + 1]).toBe('>> due: 2024-12-31');
      // The interval field was appended at metaEnd
      expect(ls[finalLoc.metaEnd]).toBe('>> interval: 7');
    });

    it('sequentially updating two notes preserves both in the final document', () => {
      const md = doc(NOTE_HEADER, '> Q1', '', NOTE_HEADER, '> Q2', '');
      const locs = locateNotes(md);

      const step1 = applyNoteUpdates(md, locs[0]!, { due: '2024-01-01' });
      const locsStep1 = locateNotes(step1);
      const step2 = applyNoteUpdates(step1, locsStep1[1]!, { due: '2024-06-01' });

      const finalLocs = locateNotes(step2);
      expect(finalLocs).toHaveLength(2);
      expect(finalLocs[0]!.metaStart).toBeGreaterThan(-1);
      expect(finalLocs[1]!.metaStart).toBeGreaterThan(-1);
    });

    it('output of applyNoteUpdates is parseable by locateNotes for a multi-field insert', () => {
      const md = doc(NOTE_HEADER, '> Q', '> A', '');
      const [loc] = locateNotes(md);
      const updated = applyNoteUpdates(md, loc!, {
        due: '2024-06-01',
        interval: '4',
        ease: '2.5',
      });

      const [newLoc] = locateNotes(updated);
      expect(newLoc).toBeDefined();
      expect(newLoc!.metaEnd - newLoc!.metaStart).toBe(3); // header + 3 field lines
    });
  });
});

describe('applyNoteUpdates – noteStart out of bounds', () => {
  it('throws RangeError when noteStart is -1 (no-note sentinel used as an index)', () => {
    const loc: NoteLocation = { noteStart: -1, noteEnd: 0, metaStart: -1, metaEnd: -1 };
    expect(() =>
      applyNoteUpdates(simpleMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });

  it('throws RangeError when noteStart is less than -1', () => {
    const loc: NoteLocation = { noteStart: -5, noteEnd: 0, metaStart: -1, metaEnd: -1 };
    expect(() =>
      applyNoteUpdates(simpleMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });

  it('throws RangeError when noteStart equals the number of lines in the document', () => {
    // simpleMd has 2 lines (indices 0–1); index 2 is out of bounds
    const loc: NoteLocation = { noteStart: 2, noteEnd: 2, metaStart: -1, metaEnd: -1 };
    expect(() =>
      applyNoteUpdates(simpleMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });

  it('throws RangeError when noteStart is far beyond the document length', () => {
    const loc: NoteLocation = { noteStart: 9999, noteEnd: 9999, metaStart: -1, metaEnd: -1 };
    expect(() =>
      applyNoteUpdates(simpleMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// applyNoteUpdates – noteEnd out of bounds or before noteStart
// ---------------------------------------------------------------------------

describe('applyNoteUpdates – noteEnd invalid', () => {
  it('throws RangeError when noteEnd is less than noteStart', () => {
    const loc: NoteLocation = { noteStart: 1, noteEnd: 0, metaStart: -1, metaEnd: -1 };
    expect(() =>
      applyNoteUpdates(simpleMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });

  it('throws RangeError when noteEnd equals noteStart minus 1', () => {
    const loc: NoteLocation = { noteStart: 0, noteEnd: -1, metaStart: -1, metaEnd: -1 };
    expect(() =>
      applyNoteUpdates(simpleMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });

  it('throws RangeError when noteEnd equals the number of lines in the document', () => {
    // simpleMd has 2 lines; valid indices are 0–1
    const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: -1, metaEnd: -1 };
    expect(() =>
      applyNoteUpdates(simpleMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });

  it('throws RangeError when noteEnd is far beyond the document length', () => {
    const loc: NoteLocation = { noteStart: 0, noteEnd: 9999, metaStart: -1, metaEnd: -1 };
    expect(() =>
      applyNoteUpdates(simpleMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// applyNoteUpdates – inconsistent metaStart / metaEnd sentinel pair
// ---------------------------------------------------------------------------

describe('applyNoteUpdates – inconsistent metaStart / metaEnd sentinels', () => {
  it('throws Error when metaStart is a valid index but metaEnd is the -1 sentinel', () => {
    // One sentinel is set and the other is not — structurally incoherent.
    const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: -1 };
    expect(() =>
      applyNoteUpdates(metaMd, loc, { due: '2024-01-01' })
    ).toThrow(Error);
  });

  it('throws Error when metaEnd is a valid index but metaStart is the -1 sentinel', () => {
    const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: -1, metaEnd: 2 };
    expect(() =>
      applyNoteUpdates(metaMd, loc, { due: '2024-01-01' })
    ).toThrow(Error);
  });
});

// ---------------------------------------------------------------------------
// applyNoteUpdates – metaStart > metaEnd (neither sentinel)
// ---------------------------------------------------------------------------

describe('applyNoteUpdates – metaStart > metaEnd', () => {
  it('throws RangeError when metaStart is greater than metaEnd', () => {
    const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 2, metaEnd: 1 };
    expect(() =>
      applyNoteUpdates(metaMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });

  it('throws RangeError when metaStart is far beyond metaEnd', () => {
    const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 10, metaEnd: 2 };
    expect(() =>
      applyNoteUpdates(metaMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// applyNoteUpdates – metaEnd beyond document length (currently hard crash)
// ---------------------------------------------------------------------------

describe('applyNoteUpdates – metaEnd out of bounds (currently a hard crash)', () => {
  it('throws RangeError when metaEnd equals the number of lines in the document', () => {
    // metaMd has 3 lines (indices 0–2); metaEnd: 3 is out of bounds.
    // Currently this crashes with a TypeError because lines[3]! is undefined.
    const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 3 };
    expect(() =>
      applyNoteUpdates(metaMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });

  it('throws RangeError when metaEnd is far beyond the document length', () => {
    const loc: NoteLocation = { noteStart: 0, noteEnd: 2, metaStart: 1, metaEnd: 9999 };
    expect(() =>
      applyNoteUpdates(metaMd, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// applyNoteUpdates – metadata range falls outside the note range
// ---------------------------------------------------------------------------

describe('applyNoteUpdates – metadata range outside note range', () => {
  it('throws RangeError when metaStart is less than noteStart', () => {
    // Metadata cannot start before its own note.
    const md = doc('# Heading', NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01');
    const loc: NoteLocation = { noteStart: 1, noteEnd: 3, metaStart: 0, metaEnd: 3 };
    expect(() =>
      applyNoteUpdates(md, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });

  it('throws RangeError when metaEnd is greater than noteEnd', () => {
    // Metadata cannot extend beyond the end of its own note.
    const md = doc(NOTE_HEADER, METADATA_HEADER, '>> due: 2024-01-01', '# Outside');
    const loc: NoteLocation = { noteStart: 0, noteEnd: 1, metaStart: 1, metaEnd: 2 };
    expect(() =>
      applyNoteUpdates(md, loc, { due: '2024-01-01' })
    ).toThrow(RangeError);
  });
});