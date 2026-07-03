import { Note, NoteContext, NoteUpdate } from "../note/schema";
import { AnkiConnectClient } from "./connect-client"
import { AnkiConfig, AnkiPayloadFactory } from "./payload-factory";

const DEFAULT_CHUNK_SIZE = 10;

interface IndexedNote {
    note: Note;
    index: number;
}

export class AnkiConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AnkiConfigError";
    }
}

export class AnkiNoteRejectedError extends Error {
    constructor(rejectedCount: number, totalCount: number) {
        super(
            `${rejectedCount} of ${totalCount} notes were rejected by Anki. ` +
            `This is usually caused by duplicate notes already existing in Anki. ` +
            `Open the Anki browser and search for existing cards with the same content.`
        );
        this.name = "AnkiNoteRejectedError";
    }
}

export class AnkiNoteUpdateError extends Error {
    constructor(noteId: string) {
        super(
            `Failed to update note ${noteId} in Anki. ` +
            `The note may have been manually deleted from Anki. ` +
            `Remove the ID from this note in Obsidian to re-add it as a new card.`
        );
        this.name = "AnkiNoteUpdateError";
    }
}

export async function resolveConfig(
    deckName: string,
    modelName: string,
    client: AnkiConnectClient
): Promise<AnkiConfig> {
    const [deckNames, modelNames] = await Promise.all([
        client.fetchDeckNames(),
        client.fetchModelNames(),
    ]);

    if (!deckNames.includes(deckName)) {
        throw new AnkiConfigError(
            `Deck "${deckName}" not found in Anki. ` +
            `Available decks: ${deckNames.length ? deckNames.join(", ") : "none"}. ` +
            `Check your plugin settings or create the deck in Anki first.`
        );
    }

    if (!modelNames.includes(modelName)) {
        throw new AnkiConfigError(
            `Note type "${modelName}" not found in Anki. ` +
            `Available note types: ${modelNames.length ? modelNames.join(", ") : "none"}. ` +
            `Check your plugin settings or create the note type in Anki first.`
        )
    }

    const modelFields = await client.fetchModelFields(modelName);

    if (!modelFields.length) {
        throw new AnkiConfigError(
            `Note type "${modelName}" has no fields defined in Anki. ` +
            `A note type needs at least one field to create cards. ` +
            `Edit the note type in Anki under Tools > Manage Note Types.`
        )
    }

    return {
        deckName: deckName,
        noteModel: { name: modelName, fields: modelFields },
    };
}


export async function pushNotes(
    notes: ReadonlyArray<Note>,
    config: AnkiConfig,
    context: NoteContext,
    client: AnkiConnectClient
): Promise<Array<NoteUpdate>> {
    const factory = new AnkiPayloadFactory(config, context);
    const updates: NoteUpdate[] = notes.map(() => ({}));

    const indexed = notes.map((note, index) => ({ note, index }));

    const toAdd = indexed.filter(({ note }) => !note.id);
    const toUpdate = indexed.filter(({ note }) => !!note.id);

    await Promise.all([
        addNotes(toAdd, factory, client, updates),
        updateNotes(toUpdate, factory, client),
    ]);

    return updates;
}

async function addNotes(
    items: IndexedNote[],
    factory: AnkiPayloadFactory,
    client: AnkiConnectClient,
    updates: NoteUpdate[]
): Promise<void> {
    if (!items.length) return;

    const payload = factory.buildAddNotesPayload(items.map(({ note }) => note));
    console.log(payload)
    const newIds = await client.addNotes(payload);

    items.forEach(({ index }, i) => {
        if (newIds[i] != null) updates[index] = { id: String(newIds[i]) };
    });
}

async function updateNotes(
    items: IndexedNote[],
    factory: AnkiPayloadFactory,
    client: AnkiConnectClient,
    chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<void> {
    await processInChunks(
        items,
        ({ note }) => client.updateNote(factory.buildUpdateNotePayload(note)),
        chunkSize
    );
}

/**
 * Processes items in sequential batches, with concurrency within each batch.
 */
async function processInChunks<T>(
    items: T[],
    process: (item: T) => Promise<void>,
    chunkSize = DEFAULT_CHUNK_SIZE
): Promise<void> {
    for (let i = 0; i < items.length; i += chunkSize) {
        await Promise.all(items.slice(i, i + chunkSize).map(process));
    }
}
