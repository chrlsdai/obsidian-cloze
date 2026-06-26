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

export interface NoteConfig {
    deckName: string;
    modelName: string;
    firstFieldName: string;
    allowDuplicate?: boolean;
    duplicateScope?: string;
}

export const createNoteConverter = (config: NoteConfig) =>
    (card: ParsedCard): AnkiConnectNote => ({
        deckName: config.deckName,
        modelName: config.modelName,
        fields: (() => {
            if (card.cardFields[config.firstFieldName] !== undefined) {
                console.warn(
                    `cardFields contains key "${config.firstFieldName}" which conflicts with firstFieldName`
                );
            }
            return {
                ...card.cardFields,
                [config.firstFieldName]: card.text, // primary field always wins
            };
        })(),
        tags: [...card.tags],
        options: {
            allowDuplicate: config.allowDuplicate ?? false,
            duplicateScope: config.duplicateScope ?? "deck",
        },
    });


// Add a single note, returns its Anki note ID
export const addNote = (note: AnkiConnectNote) =>
    ankiRequest<number>("addNote", { note });

// Add multiple notes in one request
export const addNotes = (notes: AnkiConnectNote[]) =>
    ankiRequest<number[]>("addNotes", { notes });

export async function getConfig(
    deckName: string,
    modelName: string
): Promise<NoteConfig> {
    const [deckNames, modelNames] = await Promise.all([
        ankiRequest<string[]>("deckNames", {}),
        ankiRequest<string[]>("modelNames", {}),
    ]);

    if (!deckNames.includes(deckName)) {
        throw new Error(`Deck "${deckName}" not found`);
    }

    if (!modelNames.includes(modelName)) {
        throw new Error(`Model "${modelName}" not found`);
    }

    const fieldNames = await ankiRequest<string[]>(
        "modelFieldNames",
        { modelName }
    );

    if (!fieldNames.length) {
        throw new Error(`Model "${modelName}" has no fields`);
    }

    return {
        deckName: deckName,
        modelName: modelName,
        firstFieldName: fieldNames[0] ?? ''
    };
}

type SyncStatus = "created" | "updated" | "error";

interface CardSyncResult {
    id: number | null;
    status: SyncStatus;
    error?: string;
}

export async function syncNotes(
    cards: ParsedCard[],
    config: NoteConfig,
    chunkSize = 20
): Promise<CardSyncResult[]> {
    const toAnkiNote = createNoteConverter(config);

    // Pre-fill every slot with a safe error default so no index is ever undefined
    const results: CardSyncResult[] = Array.from(
        { length: cards.length },
        () => ({ id: null, status: "error" as SyncStatus })
    );

    // Check which IDs actually exist in Anki
    const existingIds = new Set<number>();
    const cardsWithIds = cards.filter(
        (c): c is ParsedCard & { id: number } => c.id !== undefined
    );

    if (cardsWithIds.length > 0) {
        const notesInfo = await ankiRequest<({ noteId?: number } | null)[]>(
            "notesInfo",
            { notes: cardsWithIds.map((c) => c.id) }
        );

        // Key by ID rather than relying on index alignment from AnkiConnect
        const idToInfo = new Map<number, { noteId?: number } | null>();
        notesInfo.forEach((info, i) => {
            const card = cardsWithIds[i];
            if (card) idToInfo.set(card.id, info);
        });

        cardsWithIds.forEach((card) => {
            if (idToInfo.get(card.id)?.noteId) existingIds.add(card.id);
        });
    }

    // Bucket cards into update/create while preserving original indices
    const toUpdate: { card: ParsedCard & { id: number }; index: number }[] = [];
    const toCreate: { card: ParsedCard; index: number }[] = [];

    cards.forEach((card, index) => {
        if (card.id !== undefined && existingIds.has(card.id)) {
            toUpdate.push({ card: card as ParsedCard & { id: number }, index });
        } else {
            toCreate.push({ card, index });
        }
    });

    await Promise.all([
        // No batch API for updateNote, so run in controlled parallel chunks
        batchRun(toUpdate, chunkSize, async ({ card, index }) => {
            try {
                const { fields, tags } = toAnkiNote(card);
                await ankiRequest<null>("updateNote", {
                    note: { id: card.id, fields, tags },
                });
                results[index] = { id: card.id, status: "updated" };
            } catch (e) {
                results[index] = {
                    id: card.id,
                    status: "error",
                    error: e instanceof Error ? e.message : String(e),
                };
            }
        }),

        // Create new notes in a single batch
        (async () => {
            if (toCreate.length === 0) return;
            try {
                const createdIds = await ankiRequest<(number | null)[]>(
                    "addNotes",
                    { notes: toCreate.map(({ card }) => toAnkiNote(card)) }
                );
                toCreate.forEach(({ index }, j) => {
                    const id = createdIds[j] ?? null;
                    results[index] = id !== null
                        ? { id, status: "created" }
                        : { id: null, status: "error", error: "addNotes returned null for this note" };
                });
            } catch (e) {
                toCreate.forEach(({ index }) => {
                    results[index] = {
                        id: null,
                        status: "error",
                        error: e instanceof Error ? e.message : String(e),
                    };
                });
            }
        })(),
    ]);

    return results;
}

// Chunk updates into batches of N
async function batchRun<T>(
    items: T[],
    chunkSize: number,
    fn: (item: T) => Promise<void>
): Promise<void> {
    for (let i = 0; i < items.length; i += chunkSize) {
        await Promise.all(items.slice(i, i + chunkSize).map(fn));
    }
}

export function generateUpdates(
    cards: ParsedCard[],
    results: CardSyncResult[]
): ReadonlyArray<{ card: ParsedCard; fields: Record<string, string> }> {
    return results
        .map((result, index) => ({ result, card: cards[index]! }))
        .filter(({ result, card }) => card !== undefined && result.status === "created" && result.id !== null)
        .map(({ result, card }) => ({
            card,
            fields: { id: String(result.id) },
        }));
}