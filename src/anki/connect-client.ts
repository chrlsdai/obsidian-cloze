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

export class AnkiConnectClient {
    constructor(private readonly url = ANKI_CONNECT_URL) { }

    private async _ankiRequest<T>(action: string, params: object): Promise<T> {
        const response = await fetch(this.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action,
                version: ANKI_CONNECT_VERSION,
                params,
            }),
        });

        const { result, error } = await response.json();
        if (error) throw new AnkiConnectError(error);
        return result as T;
    }

    async fetchDeckNames(): Promise<string[]> {
        return this._ankiRequest("deckNames", {});
    }

    async fetchModelNames(): Promise<string[]> {
        return this._ankiRequest("modelNames", {});
    }

    async fetchModelFields(modelName: string): Promise<string[]> {
        return this._ankiRequest("modelFieldNames", { modelName });
    }

    async addNotes(notes: AddNotesPayload): Promise<number[]> {
        return this._ankiRequest("addNotes", notes);
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
        const results = await this._ankiRequest<MultiResult[]>("multi", { actions });

        const failures = results.flatMap((r, i) =>
            r.error !== null ? [{ id: payload.notes[i]!.id, error: r.error }] : []
        );

        if (failures.length > 0) {
            throw new AnkiNoteUpdateError(failures);
        }
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