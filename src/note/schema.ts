/**
 * Matches only *top-level* `[!note]` callouts — i.e. callouts with no
 * ancestor callout of their own. Mirrors the single-level restriction
 * NOTE_HEADER_REGEX enforces on the raw-Markdown side, so the DOM-based
 * and line-based note counts (see NoteFile._parse) never disagree over
 * whether a nested `[!note]` counts as a card.
 */
export const NOTE_SELECTOR = `.callout[data-callout="note"]:not(.callout .callout[data-callout="note"])`;
export const METADATA_SELECTOR = `:scope > .callout[data-callout="note-metadata"]`;

/** Matches only a top-level `[!note]` header; mirrors NOTE_SELECTOR on the DOM side. */
export const NOTE_HEADER_REGEX = /^>(?!\s*>)\s*\[!note\]-?/i
export const METADATA_HEADER_REGEX = /^>\s*>\s*\[!note-metadata\]-?/i

export const NOTE_HEADER = '> [!note]'
export const METADATA_HEADER = '>> [!note-metadata]-'

export type NoteField = Record<string, string>;
export type NoteUpdate = Record<string, string>;

/** A fully parsed note derived from a `[!note]` callout. */
export interface Note {
    id?: number;
    tags: string[];
    noteFields: NoteField;
    textElement: HTMLElement;
}

/**
 * The line-index boundaries of a flashcard note and its optional metadata
 * block within a raw Markdown string.  All indices are 0-based and inclusive.
 * 
 * `metaStart` and `metaEnd` are both `-1` when the note contains no metadata
 * block.
 */
export interface NoteLocation {
    noteStart: number;
    noteEnd: number;
    metaStart: number;
    metaEnd: number;
}

export interface NoteContext {
    vaultName: string;
    fileName: string;
    filePath: string;
}
