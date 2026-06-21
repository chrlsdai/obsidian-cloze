import { ParsedCard } from "./parser";
import { ankiRequest } from "./anki-connect"

export type NoteFields = Record<string, string>;

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

export interface NoteModelConfig {
    deckName: string;
    modelName: string;
    firstFieldName: string; // e.g. "Front", "Word", etc.
}

export const createNoteConverter = (config: NoteModelConfig) =>
    (card: ParsedCard): AnkiConnectNote => ({
        deckName: config.deckName,
        modelName: config.modelName,
        fields: {
            [config.firstFieldName]: card.text,
            ...card.cardFields,
        },
        tags: [...card.tags],
        options: {
            allowDuplicate: false,
            duplicateScope: "deck",
        },
    });


// Add a single note, returns its Anki note ID
export const addNote = (note: AnkiConnectNote) =>
    ankiRequest<number>("addNote", { note });

// Add multiple notes in one request
export const addNotes = (notes: AnkiConnectNote[]) =>
    ankiRequest<number[]>("addNotes", { notes });

type ValidationResult =
    | { success: true; firstFieldName: string }
    | { success: false; error: string };

async function validateAndGetFirstField(
    deckName: string,
    modelName: string
): Promise<ValidationResult> {
    const [deckNames, modelNames] = await Promise.all([
        ankiRequest<string[]>("deckNames", {}),
        ankiRequest<string[]>("modelNames", {}),
    ]);

    if (!deckNames.includes(deckName)) {
        return { success: false, error: `Deck "${deckName}" not found` };
    }

    if (!modelNames.includes(modelName)) {
        return { success: false, error: `Model "${modelName}" not found` };
    }

    const fieldNames = await ankiRequest<string[]>("modelFieldNames", {
        modelName,
    });

    if (!fieldNames.length) {
        return { success: false, error: `Model "${modelName}" has no fields` };
    }

    return { success: true, firstFieldName: fieldNames[0] ?? '' };
}

interface SyncResult {
    created: number[];
    updated: number[];
}

async function syncNotes(
    cards: ParsedCard[],
    config: NoteModelConfig
): Promise<SyncResult> {
    const toAnkiNote = createNoteConverter(config);

    const cardsWithIds = cards.filter(
        (c): c is ParsedCard & { id: number } => c.id !== undefined
    );
    const cardsWithoutIds = cards.filter((c) => c.id === undefined);

    // Check which IDs actually exist in Anki
    const existingIds = new Set<number>();
    if (cardsWithIds.length > 0) {
        const notesInfo = await ankiRequest<({ noteId?: number } | null)[]>(
            "notesInfo",
            { notes: cardsWithIds.map((c) => c.id) }
        );
        notesInfo.forEach((info, i) => {
            if (info?.noteId) existingIds.add(cardsWithIds[i].id);
        });
    }

    const toUpdate = cardsWithIds.filter((c) => existingIds.has(c.id));
    const toCreate = [
        ...cardsWithoutIds,
        ...cardsWithIds.filter((c) => !existingIds.has(c.id)),
    ];

    // No batch API for updateNote, so run in parallel
    await Promise.all(
        toUpdate.map((card) => {
            const { fields, tags } = toAnkiNote(card);
            return ankiRequest<null>("updateNote", {
                note: { id: card.id, fields, tags },
            });
        })
    );

    const createdIds =
        toCreate.length > 0
            ? await ankiRequest<number[]>("addNotes", {
                notes: toCreate.map(toAnkiNote),
            })
            : [];

    return {
        created: createdIds,
        updated: toUpdate.map((c) => c.id),
    };
}

const result = await validateAndGetFirstField("Default", "Cloze");
if (result.success) {
    const config: NoteModelConfig = {
        deckName: "Japanese",
        modelName: "Basic",
        firstFieldName: result.firstFieldName,
    };
    const noteConverter = createNoteConverter(config);
    const cards = parsedCards.map(noteConverter))
    syncNotes(cards, config)
} else {
    console.error(result.error);
}