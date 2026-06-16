export type NoteFields = Record<string, string>;

export interface AnkiNoteOptions {
    id?: number;
    deckName: string;
    modelName: string;
    fields: NoteFields;
    tags?: string[];
    cards?: number[];
}

export interface AnkiConnectNote {
    deckName: string;
    modelName: string;
    fields: NoteFields;
    tags: string[];
    options: {
        allowDuplicate: boolean;
        duplicateScope: string;
    };
}

export class AnkiNote {
    private readonly _id: number | null;
    private readonly _deckName: string;
    private readonly _modelName: string;
    private readonly _fields: NoteFields;
    private readonly _tags: Set<string>;
    private readonly _cards: number[];
    private readonly _createdAt: Date;

    constructor(options: AnkiNoteOptions) {
        this._id = options.id ?? null;
        this._deckName = this.validateNotEmpty(options.deckName, "Deck name");
        this._modelName = this.validateNotEmpty(options.modelName, "Model name");
        this._fields = { ...options.fields };
        this._tags = new Set(options.tags ?? []);
        this._cards = [...(options.cards ?? [])];
        this._createdAt = new Date();
    }

    // ─── Getters ────────────────────────────────────────────────────────────────

    get id(): number | null {
        return this._id;
    }

    get deckName(): string {
        return this._deckName;
    }

    get modelName(): string {
        return this._modelName;
    }

    get fields(): Readonly<NoteFields> {
        return { ...this._fields };
    }

    get tags(): string[] {
        return Array.from(this._tags);
    }

    // ─── Field Methods ───────────────────────────────────────────────────────────

    getField(name: string): string | undefined {
        return this._fields[name];
    }

    hasField(name: string): boolean {
        return Object.prototype.hasOwnProperty.call(this._fields, name);
    }

    getFieldNames(): string[] {
        return Object.keys(this._fields);
    }

    // ─── Serialization ───────────────────────────────────────────────────────────

    toJSON(): AnkiNoteOptions & { createdAt: string } {
        return {
            id: this._id ?? undefined,
            deckName: this._deckName,
            modelName: this._modelName,
            fields: { ...this._fields },
            tags: this.tags,
            cards: this._cards,
            createdAt: this._createdAt.toISOString(),
        };
    }

    /** Formats the note for use with the AnkiConnect API */
    toAnkiConnect(allowDuplicate = false): AnkiConnectNote {
        return {
            deckName: this._deckName,
            modelName: this._modelName,
            fields: { ...this._fields },
            tags: this.tags,
            options: {
                allowDuplicate,
                duplicateScope: "deck",
            },
        };
    }

    toString(): string {
        return (
            `AnkiNote { id: ${this._id}, deck: "${this._deckName}", ` +
            `model: "${this._modelName}", tags: [${this.tags.join(", ")}] }`
        );
    }

    private validateNotEmpty(value: string, label: string): string {
        if (!value?.trim()) {
            throw new Error(`${label} cannot be empty.`);
        }
        return value.trim();
    }

    // ─── Static Factory Methods ──────────────────────────────────────────────────

    /** Creates a Basic (front/back) note */
    static createBasic(
        deckName: string,
        front: string,
        back: string,
        tags?: string[]
    ): AnkiNote {
        return new AnkiNote({
            deckName,
            modelName: "Basic",
            fields: { Front: front, Back: back },
            tags,
        });
    }

    /** Creates a Basic note with a reversed card */
    static createBasicReversed(
        deckName: string,
        front: string,
        back: string,
        tags?: string[]
    ): AnkiNote {
        return new AnkiNote({
            deckName,
            modelName: "Basic (and reversed card)",
            fields: { Front: front, Back: back },
            tags,
        });
    }

    /**
     * Creates a Cloze deletion note.
     * @example AnkiNote.createCloze("Deck", "The capital of France is {{c1::Paris}}.")
     */
    static createCloze(
        deckName: string,
        text: string,
        extra = "",
        tags?: string[]
    ): AnkiNote {
        return new AnkiNote({
            deckName,
            modelName: "Cloze",
            fields: { Text: text, Extra: extra },
            tags,
        });
    }

    /** Deserializes a plain object back into an AnkiNote */
    static fromJSON(data: AnkiNoteOptions): AnkiNote {
        return new AnkiNote(data);
    }
}