const ANKI_PORT: number = 8765
const ANKI_CONNECT_URL = `http://127.0.0.1:${ANKI_PORT}`;
const ANKI_CONNECT_VERSION = 6;

export class AnkiConnectError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AnkiConnectError";
    }
}

export class AnkiConnectClient {
    constructor(private readonly url = ANKI_CONNECT_URL) { }

    private async _ankiRequest<T>(action: string, params: object): Promise<T> {
        const response = await fetch(this.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: action,
                version: ANKI_CONNECT_VERSION,
                params: params
            }),
        });

        const { result, error } = await response.json();
        if (error) throw new AnkiConnectError(error);
        return result as T;
    }

    async fetchDeckNames(): Promise<string[]> {
        return this._ankiRequest("deckNames", {})
    }

    async fetchModelNames(): Promise<string[]> {
        return this._ankiRequest("modelNames", {})
    }

    async fetchModelFields(modelName: string): Promise<string[]> {
        return this._ankiRequest("modelFieldNames", { modelName })
    }

    async addNotes(notes: AddNotesPayload): Promise<number[]> {
        return this._ankiRequest("addNotes", notes)
    }
    async updateNote(note: UpdateNotePayload): Promise<void> {
        return this._ankiRequest("updateNote", note)
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

export interface UpdateNotePayload {
    note: {
        id: number;
        fields: Record<string, string>;
    }
}