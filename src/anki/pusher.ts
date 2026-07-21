import { Note, NoteContext, NoteUpdate } from "../note/schema";
import { AnkiConnectClient } from "./connect-client";
import { AnkiConfig, AnkiPayloadFactory } from "./payload-factory";

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

export async function resolveConfig(
    deckName: string,
    modelName: string,
    sourceField: string,
    client: AnkiConnectClient
): Promise<AnkiConfig> {
    const [deckNames, modelNames, modelFields] = await Promise.all([
        client.fetchDeckNames(),
        client.fetchModelNames(),
        client.fetchModelFields(modelName),
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
        );
    }

    if (!modelFields.length) {
        throw new AnkiConfigError(
            `Note type "${modelName}" has no fields defined in Anki. ` +
            `A note type needs at least one field to create cards. ` +
            `Edit the note type in Anki under Tools > Manage Note Types.`
        );
    }

    if (sourceField && !modelFields.includes(sourceField)) {
        throw new AnkiConfigError(
            `Field "${sourceField}" not found in note type "${modelName}". ` +
            `Either unset "Source Field" in settings to disable this feature ` +
            `or edit the note type in Anki under Tools > Manage Note Types.`
        );
    }

    return {
        deckName,
        noteModel: { name: modelName, fields: modelFields },
        sourceField,
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

    const toAdd    = indexed.filter(({ note }) => !note.id);
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
    console.log(payload);
    const newIds = await client.addNotes(payload);

    const rejectedCount = newIds.filter(id => id == null).length;
    if (rejectedCount > 0) {
        throw new AnkiNoteRejectedError(rejectedCount, items.length);
    }

    items.forEach(({ index }, i) => {
        if (newIds[i] != null) updates[index] = { id: String(newIds[i]) };
    });
}

async function updateNotes(
    items: IndexedNote[],
    factory: AnkiPayloadFactory,
    client: AnkiConnectClient,
): Promise<void> {
    if (!items.length) return;

    const payload = factory.buildUpdateNotesPayload(items.map(({ note }) => note));
    await client.updateNotes(payload);
}