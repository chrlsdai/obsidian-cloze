/**
 * Tests for postprocessing.ts's cloze-parsing logic.
 *
 * renderCardClozes() / buildClozeFragment() themselves call Obsidian's
 * runtime `createSpan()` prototype extension, which isn't polyfilled in
 * this jsdom test environment, so they aren't exercised directly here.
 * These tests cover CLOZE_REGEX and parseClozeBody — the parts that decide
 * *what* gets rendered — which are plain functions with no DOM dependency.
 */

// Side-effect import only: pulls in obsidian's ambient type declarations
// (e.g. createSpan() on Node) that src/postprocessing.ts relies on but
// doesn't itself import — without this, ts-jest type-checks this test
// file's isolated import graph and doesn't see those global augmentations.
import 'obsidian';
import { CLOZE_REGEX, parseClozeBody } from '../src/postprocessing';

// ─────────────────────────────────────────────────────────────────────────────
// CLOZE_REGEX — finding cloze spans in text
// ─────────────────────────────────────────────────────────────────────────────

describe('CLOZE_REGEX', () => {
    it('matches a simple cloze', () => {
        const matches = [...'The capital of France is {Paris}.'.matchAll(CLOZE_REGEX)];
        expect(matches).toHaveLength(1);
        expect(matches[0]![1]).toBe('Paris');
    });

    it('matches a cloze whose answer contains a single colon', () => {
        // Regression case: this previously failed to match at all, leaving
        // the literal "{...}" text unrendered.
        const matches = [...'{The ratio is 3:4}'.matchAll(CLOZE_REGEX)];
        expect(matches).toHaveLength(1);
        expect(matches[0]![1]).toBe('The ratio is 3:4');
    });

    it('matches multiple clozes in the same string', () => {
        const matches = [...'{one} and {two}'.matchAll(CLOZE_REGEX)];
        expect(matches.map(m => m[1])).toEqual(['one', 'two']);
    });

    it('does not match empty braces', () => {
        expect([...'{}'.matchAll(CLOZE_REGEX)]).toHaveLength(0);
    });

    it('does not match unterminated braces', () => {
        expect([...'{unterminated'.matchAll(CLOZE_REGEX)]).toHaveLength(0);
    });

    it('does not match plain text with no braces', () => {
        expect([...'no clozes here'.matchAll(CLOZE_REGEX)]).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseClozeBody — the four documented syntaxes
// ─────────────────────────────────────────────────────────────────────────────

describe('parseClozeBody › documented syntax', () => {
    it('{text} — auto-numbered cloze', () => {
        expect(parseClozeBody('Paris')).toEqual({
            id: undefined, answer: 'Paris', hint: undefined,
        });
    });

    it('{1:text} — explicitly numbered cloze', () => {
        expect(parseClozeBody('1:Paris')).toEqual({
            id: '1', answer: 'Paris', hint: undefined,
        });
    });

    it('{text::hint} — cloze with a hint', () => {
        expect(parseClozeBody('Paris::European capital')).toEqual({
            id: undefined, answer: 'Paris', hint: 'European capital',
        });
    });

    it('{1:text::hint} — numbered cloze with a hint', () => {
        expect(parseClozeBody('1:Paris::European capital')).toEqual({
            id: '1', answer: 'Paris', hint: 'European capital',
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseClozeBody › colons within the answer text
// ─────────────────────────────────────────────────────────────────────────────

describe('parseClozeBody › colons within the answer text', () => {
    it('preserves a single colon in an unnumbered answer', () => {
        expect(parseClozeBody('The ratio is 3:4')).toEqual({
            id: undefined, answer: 'The ratio is 3:4', hint: undefined,
        });
    });

    it('preserves a single colon in the answer alongside a hint', () => {
        expect(parseClozeBody('The ratio is 3:4::simplify')).toEqual({
            id: undefined, answer: 'The ratio is 3:4', hint: 'simplify',
        });
    });

    it('preserves a single colon in a numbered answer', () => {
        expect(parseClozeBody('1:The ratio is 3:4')).toEqual({
            id: '1', answer: 'The ratio is 3:4', hint: undefined,
        });
    });

    it('preserves multiple colons in the answer', () => {
        expect(parseClozeBody('The time is 3:04:05')).toEqual({
            id: undefined, answer: 'The time is 3:04:05', hint: undefined,
        });
    });

    it('does not treat a colon as a number separator unless preceded by digits at the start', () => {
        expect(parseClozeBody('not:a:number')).toEqual({
            id: undefined, answer: 'not:a:number', hint: undefined,
        });
    });

    it('does not treat digits followed by a space (no colon) as a note number', () => {
        expect(parseClozeBody('42 is the answer')).toEqual({
            id: undefined, answer: '42 is the answer', hint: undefined,
        });
    });
});
