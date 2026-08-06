import { METADATA_HEADER, METADATA_HEADER_REGEX, NOTE_HEADER_REGEX, NoteLocation, NoteUpdate } from "./schema";

/**
 * Scans a Markdown string and returns the line-index boundaries of every
 * blockquote-style flashcard note and its optional metadata block.
 *
 * Each note is a contiguous block of blockquote lines.  A metadata block is
 * an optional nested blockquote that appears within a note.  If a note
 * contains more than one metadata block, only the first is recorded; all
 * subsequent ones are treated as ordinary note content.
 *
 * @param markdown - The raw Markdown source to scan
 *
 * @returns An array of {@link NoteLocation} objects, one per note found, in
 *          document order. 
 */
export function locateNotes(markdown: string): NoteLocation[] {
    const lines: string[] = markdown.split(/\r?\n/);
    const locations: NoteLocation[] = [];

    let inNote = false;
    let inMetadata = false;
    let noteStart = -1;
    let metaStart = -1;
    let metaEnd = -1;

    let i = 0;
    while (i < lines.length) {
        const line = lines[i]!;

        if (!inNote) {
            // Looking for the start of a new card.
            if (line && isCardHeader(line)) {
                inNote = true;
                noteStart = i;
                metaStart = -1;
                metaEnd = -1;
            }
            i++;
            continue;
        }

        if (inMetadata) {
            if (/^>\s*>/.test(line)) {
                metaEnd = i;
                i++;
            } else {
                inMetadata = false; // fall through to the !inMetadata check below
            }
        }

        if (!inMetadata) {
            if (/^>/.test(line)) {
                if (metaStart === -1 && isMetadataHeader(line)) {
                    // Enter the metadata block for this card.
                    inMetadata = true;
                    metaStart = i;
                    metaEnd = i;
                }
                i++;
            } else {
                // Non-">" line closes the current note
                locations.push({ noteStart, noteEnd: i - 1, metaStart, metaEnd });
                inNote = false;
                i++;
            }
        }
    }
    if (inNote) {
        locations.push({ noteStart, noteEnd: lines.length - 1, metaStart, metaEnd });
    }

    return locations;
}

/** Matches a level-1 `[!note]` header; rejects level-2+ lines via lookahead. */
function isCardHeader(line: string): boolean {
    return NOTE_HEADER_REGEX.test(line);
}
/** Matches a level-2 `[!note-metadata]` header. */
function isMetadataHeader(line: string): boolean {
    return METADATA_HEADER_REGEX.test(line);
}


/**
 * Updates the metadata fields of a flashcard note within a Markdown string,
 * adding the metadata block if one does not already exist.  Existing fields
 * are updated in place; fields not yet present are appended.
 *
 * @param markdown - The raw Markdown source containing the note.
 * @param location - The line-index boundaries of the note to update.
 * @param fields   - A map of field names to their new values.  An empty map
 *                   returns the original string unchanged.
 *
 * @returns A new Markdown string with the specified fields applied.
 * @throws {RangeError} If any line index in `location` is out of bounds, negative,
 *                     inverted relative to its pair, or outside the note's own range.
 */
export function applyNoteUpdates(
    markdown: string,
    location: NoteLocation,
    fields: NoteUpdate,
): string {
    if (Object.keys(fields).length === 0) return markdown;

    const lines = markdown.split(/\r?\n/);
    const lastIndex = lines.length - 1;
    const { noteStart, noteEnd, metaStart, metaEnd } = location;

    if (noteStart < 0) {
        throw new RangeError(
            `noteStart (${noteStart}) must be a valid line index (>= 0)`
        );
    }
    if (noteStart > lastIndex) {
        throw new RangeError(
            `noteStart (${noteStart}) exceeds the last line index (${lastIndex})`
        );
    }

    if (noteEnd < noteStart) {
        throw new RangeError(
            `noteEnd (${noteEnd}) must be >= noteStart (${noteStart})`
        );
    }
    if (noteEnd > lastIndex) {
        throw new RangeError(
            `noteEnd (${noteEnd}) exceeds the last line index (${lastIndex})`
        );
    }

    const hasMetaStart = metaStart !== -1;
    const hasMetaEnd = metaEnd !== -1;

    if (hasMetaStart !== hasMetaEnd) {
        throw new RangeError(
            `metaStart and metaEnd must both be -1 (no metadata block) or both be ` +
            `valid line indices; got metaStart=${metaStart}, metaEnd=${metaEnd}`
        );
    }

    if (hasMetaStart) {
        if (metaStart > metaEnd) {
            throw new RangeError(
                `metaStart (${metaStart}) must be <= metaEnd (${metaEnd})`
            );
        }
        if (metaEnd > lastIndex) {
            throw new RangeError(
                `metaEnd (${metaEnd}) exceeds the last line index (${lastIndex})`
            );
        }
        if (metaStart < noteStart) {
            throw new RangeError(
                `metaStart (${metaStart}) must be >= noteStart (${noteStart})`
            );
        }
        if (metaEnd > noteEnd) {
            throw new RangeError(
                `metaEnd (${metaEnd}) must be <= noteEnd (${noteEnd})`
            );
        }
    }

    if (metaStart === -1) {
        lines.splice(noteStart + 1, 0, METADATA_HEADER, ...entriesToLines(fields));
    } else {
        const pending = { ...fields };

        for (let ln = metaStart + 1; ln <= metaEnd; ln++) {
            const m = lines[ln]!.match(/^>\s*>\s*([^:\s][^:]*?):(.*)/);
            if (!m) continue;
            const key = m[1]!.trim();
            if (key in pending) {
                lines[ln] = toFieldLine(key, pending[key]!);
                delete pending[key];
            }
        }
        lines.splice(metaEnd + 1, 0, ...entriesToLines(pending));
    }
    return lines.join('\n');
}

const toFieldLine = (key: string, value: string) => `>> ${key}: ${value}`;
const entriesToLines = (record: Record<string, string>) =>
    Object.entries(record).map(([k, v]) => toFieldLine(k, v));