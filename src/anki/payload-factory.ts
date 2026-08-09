import { Note, NoteContext } from "../note/schema";
import { AddNotesPayload, UpdateNotesPayload } from "./connect-client";
import { convertHtml, buildObsidianOpenUrl } from "./html-processing";
import { MediaResolutionContext } from "./media";


export interface NoteModel {
    name: string;
    fields: readonly string[];
}

export interface AnkiConfig {
    deckName: string;
    noteModel: NoteModel;
    sourceField: string;
}

/** Builds AnkiConnect request payloads from parsed notes. */
export class AnkiPayloadFactory {
    constructor(
        private readonly config: AnkiConfig,
        private readonly ctx: NoteContext,
        private readonly mediaCtx: MediaResolutionContext,
    ) { }

    // ── Public API ───────────────────────────────────────────────────────────────

    /** Builds the payload for adding brand-new notes to Anki. */
    async buildAddNotesPayload(notes: Note[]): Promise<AddNotesPayload> {
        return {
            notes: await Promise.all(notes.map(async (note) => ({
                deckName: this.config.deckName,
                modelName: this.config.noteModel.name,
                fields: await this.buildFields(note),
                tags: transformTags(note.tags),
            }))),
        };
    }

    /**
     * Builds the payload for updating existing Anki notes.
     * @throws {Error} If any `note` is missing an `id`.
     */
    async buildUpdateNotesPayload(notes: Note[]): Promise<UpdateNotesPayload> {
        return {
            notes: await Promise.all(notes.map(async (note) => {
                if (note.id === undefined) {
                    throw new Error('Cannot build an update payload: note has no id.');
                }
                return {
                    id: note.id,
                    fields: await this.buildFields(note),
                };
            })),
        };
    }

    private async buildFields(note: Note): Promise<Record<string, string>> {
        const [firstField] = this.config.noteModel.fields;

        if (!firstField) {
            throw new Error('NoteModel must define at least one field.');
        }

        const { sourceField } = this.config;

        return {
            [firstField]: await convertHtml(note.textElement, this.ctx, this.mediaCtx),
            ...note.noteFields,
            ...(sourceField ? {
                [sourceField]: `<a href="${buildObsidianOpenUrl(
                    this.ctx.vaultName,
                    this.ctx.filePath
                )}">` + `${this.ctx.fileName}</a>`,
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