import { requestUrl } from "obsidian";

const ANKI_PORT: number = 8765
const ANKI_CONNECT_URL = `http://127.0.0.1:${ANKI_PORT}`;
const ANKI_CONNECT_VERSION = 6;

export class AnkiConnectError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AnkiConnectError";
    }
}

export class AnkiNoteUpdateError extends Error {
    readonly failures: Array<{ id: number; error: string }>;

    constructor(failures: Array<{ id: number; error: string }>) {
        const summary = failures
            .map(f => `  Note ${f.id}: ${f.error}`)
            .join('\n');
        super(
            `${failures.length} note update(s) failed:\n${summary}\n` +
            `Affected notes may have been manually deleted from Anki. ` +
            `Remove their IDs in Obsidian to re-add them as new cards.`
        );
        this.name = "AnkiNoteUpdateError";
        this.failures = failures;
    }
}

interface MultiResult {
    result: unknown;
    error: string | null;
}

interface AnkiConnectResponse<T> {
    result: T;
    error: string | null;
}

/** Thin wrapper over the AnkiConnect HTTP API. */
export class AnkiConnectClient {
    constructor(private readonly url = ANKI_CONNECT_URL) { }

    private async ankiRequest<T>(action: string, params: object): Promise<T> {
        const response = await requestUrl({
            url: this.url,
            method: "POST",
            contentType: "application/json",
            body: JSON.stringify({
                action,
                version: ANKI_CONNECT_VERSION,
                params,
            }),
        });

        const { result, error } = response.json as AnkiConnectResponse<T>;
        if (error) throw new AnkiConnectError(error);
        return result;
    }

    // ── Fetch metadata ───────────────────────────────────────────────────────────

    /** Returns the names of all decks in Anki. */
    async fetchDeckNames(): Promise<string[]> {
        return this.ankiRequest("deckNames", {});
    }

    /** Returns the names of all note types (models) in Anki. */
    async fetchModelNames(): Promise<string[]> {
        return this.ankiRequest("modelNames", {});
    }

    /** Returns the field names defined on the `modelName` note type. */
    async fetchModelFields(modelName: string): Promise<string[]> {
        return this.ankiRequest("modelFieldNames", { modelName });
    }

    // ── Note CRUD ────────────────────────────────────────────────────────────────

    /** Adds `notes` to Anki, returning the new ID for each (or `null` if rejected). */
    async addNotes(notes: AddNotesPayload): Promise<number[]> {
        return this.ankiRequest("addNotes", notes);
    }

    /**
     * Returns the IDs of all Anki notes matching `query` (AnkiConnect
     * search syntax, e.g. `deck:"Default"`).
     */
    async findNotes(query: string): Promise<number[]> {
        return this.ankiRequest<number[]>("findNotes", { query });
    }

    /**
     * Adds one or more space-separated `tags` to every note in `notes`.
     */
    async addTags(notes: number[], tags: string): Promise<void> {
        await this.ankiRequest<null>("addTags", { notes, tags });
    }

    /**
     * Sends all note updates in a single `multi` request.
     * @throws {AnkiNoteUpdateError} If any individual update is rejected by Anki.
     */
    async updateNotes(payload: UpdateNotesPayload): Promise<void> {
        const actions = payload.notes.map(note => ({
            action: 'updateNote',
            params: { note },
        }));
        const results = await this.ankiRequest<MultiResult[]>("multi", { actions });

        const failures = results.flatMap((r, i) =>
            r !== null && r.error !== null ? [{ id: payload.notes[i]!.id, error: r.error }] : []
        );

        if (failures.length > 0) {
            throw new AnkiNoteUpdateError(failures);
        }
    }

    // ── Media ────────────────────────────────────────────────────────────────────

    /**
     * Stores a local file in Anki's media collection under `filename`,
     * overwriting any existing file of the same name.
     * @param path Absolute filesystem path to the file (Anki reads it directly).
     */
    async storeMediaFile(filename: string, path: string): Promise<string> {
        return this.ankiRequest("storeMediaFile", { filename, path, deleteExisting: true });
    }
}

export interface AddNotesPayload {
    notes: Array<{
        deckName: string;
        modelName: string;
        fields: Record<string, string>;
        tags: string[];
    }>;
}

export interface UpdateNotesPayload {
    notes: Array<{
        id: number;
        fields: Record<string, string>;
    }>;
}