import { Note, NoteContext } from "../note/schema";
import { AddNotesPayload, UpdateNotesPayload } from "./connect-client";
import { convertHTML, buildObsidianOpenUrl } from "./html-processing";


export interface NoteModel {
    name: string;
    fields: readonly string[];
}

export interface AnkiConfig {
    deckName: string;
    noteModel: NoteModel;
    sourceField: string;
}

export class AnkiPayloadFactory {
    constructor(
        private readonly config: AnkiConfig,
        private readonly context: NoteContext,
    ) { }

    // ── public API ───────────────────────────────────────────────

    buildAddNotesPayload(notes: Note[]): AddNotesPayload {
        return {
            notes: notes.map((note) => ({
                deckName: this.config.deckName,
                modelName: this.config.noteModel.name,
                fields: this.buildFields(note),
                tags: transformTags(note.tags),
            })),
        };
    }

    buildUpdateNotesPayload(notes: Note[]): UpdateNotesPayload {
        return {
            notes: notes.map((note) => {
                if (note.id === undefined) {
                    throw new Error('Cannot build an update payload: note has no id.');
                }
                return {
                    id: note.id,
                    fields: this.buildFields(note),
                };
            }),
        };
    }

    private buildFields(note: Note): Record<string, string> {
        const [firstField] = this.config.noteModel.fields;

        if (!firstField) {
            throw new Error('NoteModel must define at least one field.');
        }

        const { sourceField } = this.config;

        return {
            [firstField]: convertHTML(note.textElement, this.context),
            ...note.noteFields,
            ...(sourceField ? {
                [sourceField]: `<a href="${buildObsidianOpenUrl(
                    this.context.vaultName,
                    this.context.filePath
                )}">` + `${this.context.fileName}</a>`,
            } : {}),
        };
    }
}

/**
 * Converts obsidian to Anki-readable tags, e.g. `#foo/bar` to `foo::bar`.
 */
function transformTags(tags: string[]): string[] {
    return tags.map(
        token => token.replace(/^#/, '').replace(/\//g, '::')
    )
}