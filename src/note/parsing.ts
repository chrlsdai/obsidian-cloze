import { Note, NOTE_SELECTOR, METADATA_SELECTOR } from "./schema";

/**
 * Thrown when a note callout's DOM structure is not what the parser expects.
 * Usually indicates malformed callout syntax in the source note.
 */
export class MalformedNoteError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MalformedNoteError";
    }
}

/**
 * Thrown when a note-metadata block contains invalid or inconsistent values.
 * Always points to something the user needs to fix in their note content.
 */
export class InvalidMetadataError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidMetadataError";
    }
}

/**
 * Finds every `note` callout in `documentEl` and parses each into a {@link Note}.
 *
 * @param documentEl - A rendered HTML element, e.g. from {@link getActiveHTML}.
 * @returns Array of parsed {@link Note} objects (may be empty).
 */
export function parseNotesFromElement(documentEl: HTMLElement): Note[] {
    if (!(documentEl instanceof HTMLElement)) {
        throw new TypeError(`documentEl must be an HTMLElement, got ${typeof documentEl}`);
    }
    return Array.from(
        documentEl.querySelectorAll<HTMLElement>(NOTE_SELECTOR),
        el => parseNoteFromElement(el)
    );
}

/**
 * Parses a single `.callout[data-callout="note"]` element into a {@link Note}.
 *
 * @param cardElement - The card callout DOM element to parse.
 * @returns A parsed {@link Note}.
 *
 * @throws {MalformedNoteError} if the callout-content block is missing,
 *         if multiple metadata blocks are found, or if metadata contains an
 *         invalid or duplicate `id`.
 */
function parseNoteFromElement(cardElement: HTMLElement): Note {
    const contentEl = cardElement.querySelector<HTMLElement>('.callout-content');
    if (!contentEl) {
        throw new MalformedNoteError(
            `Note is missing a callout-content block. `
        );
    }

    const metadataEls = contentEl.querySelectorAll<HTMLElement>(METADATA_SELECTOR);
    if (metadataEls.length > 1) {
        throw new MalformedNoteError(
            `Note contains ${metadataEls.length} metadata blocks, expected at most 1. `
        );
    }

    const metadata = metadataEls[0]
        ? parseMetadata(metadataEls[0])
        : { id: undefined, noteFields: {}, tags: [] };

    // Clone and strip the metadata block to isolate note body content.
    const textElement = contentEl.cloneNode(true) as HTMLElement;
    textElement.querySelector(METADATA_SELECTOR)?.remove();

    return { ...metadata, textElement };
}

/**
 * Extracts `id`, `tags`, and additional key-value fields from a
 * `note-metadata` sub-callout. Fields must be in `key: value` format,
 * one per line.
 *
 * @param metadataEl - The `note-metadata` callout element to parse.
 * @throws {NoteParseError} if `id` appears more than once, or if its
 *         value is not a valid integer.
 */
function parseMetadata(metadataEl: HTMLElement): Pick<Note, 'id' | 'noteFields' | 'tags'> {
    const noteFields: Record<string, string> = {};
    let id: number | undefined;
    let tags: string[] = [];

    for (const line of (metadataEl.textContent ?? '').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const sep = trimmed.indexOf(':');
        if (sep <= 0) continue;

        const key = trimmed.slice(0, sep).trim();
        const value = trimmed.slice(sep + 1).trim();
        if (!key) continue;

        if (key === 'id') {
            if (id !== undefined) {
                throw new InvalidMetadataError(
                    `Note has a duplicate "id" field in its metadata.`
                );
            }
            const parsed = parseStrictInt(value);
            if (parsed === null) {
                throw new InvalidMetadataError(
                    `Note has an invalid id value: "${value}". Expected a non-negative integer. ` +
                    `If this was assigned by Anki, restore the original numeric value.`
                );
            }
            id = parsed;
        } else if (key === 'tags') {
            tags = extractTags(value);
        } else {
            noteFields[key] = value;
        }
    }

    return { id, noteFields, tags };
}

/**
 * Parses a string as a strict non-negative decimal integer (digits only).
 * Returns `null` for any invalid input, avoiding `parseInt`'s silent
 * truncation (e.g. `"123abc"` → `123`).
 */
function parseStrictInt(value: string): number | null {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isSafeInteger(n) ? n : null;
}

/**
 * Parses a whitespace- and/or comma-separated string of tags into a
 * deduplicated set.
 */
function extractTags(text: string): string[] {
    return text.split(/[\s,]+/).filter(Boolean);
}