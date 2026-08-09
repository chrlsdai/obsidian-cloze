import type { App } from "obsidian";
import { Note, NoteContext, NoteUpdate } from "../note/schema";
import { AnkiConnectClient } from "./connect-client";
import { MediaCache } from "./media";
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

// ── Config resolution ────────────────────────────────────────────────────────

/**
 * Resolves and validates deck/model/field settings against what actually
 * exists in Anki.
 * @throws {AnkiConfigError} If the deck, model, or source field doesn't exist.
 */
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

// ── Push orchestration ───────────────────────────────────────────────────────

/**
 * The outcome of a {@link pushNotes} call. `updates` always reflects every
 * Anki ID that was successfully obtained, even when `errors` is non-empty —
 * callers should persist `updates` unconditionally before surfacing `errors`,
 * so a failure on one side (e.g. a rejected duplicate) never discards IDs
 * that were legitimately assigned on the other side.
 */
export interface PushResult {
    updates: NoteUpdate[];
    errors: Error[];
}

/** Pushes `notes` to Anki, adding new ones and updating existing ones. */
export async function pushNotes(
    notes: ReadonlyArray<Note>,
    config: AnkiConfig,
    ctx: NoteContext,
    client: AnkiConnectClient,
    app: App,
    mediaCache: MediaCache,
): Promise<PushResult> {
    const factory = new AnkiPayloadFactory(config, ctx, { app, client, cache: mediaCache });
    const updates: NoteUpdate[] = notes.map(() => ({}));

    const indexed = notes.map((note, index) => ({ note, index }));

    const toAdd    = indexed.filter(({ note }) => !note.id);
    const toUpdate = indexed.filter(({ note }) => !!note.id);

    // Run independently rather than via a single Promise.all: addNotes writes
    // successful IDs into `updates` before it can throw, but a shared
    // all-or-nothing await would still let a rejection from either side
    // short-circuit before the caller ever sees `updates`. Promise.allSettled
    // guarantees both finish and lets us report failures without losing the
    // successes recorded on the other side.
    const results = await Promise.allSettled([
        addNotes(toAdd, factory, client, updates),
        updateNotes(toUpdate, factory, client),
    ]);

    const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => r.reason as Error);

    return { updates, errors };
}

async function addNotes(
    items: IndexedNote[],
    factory: AnkiPayloadFactory,
    client: AnkiConnectClient,
    updates: NoteUpdate[]
): Promise<void> {
    if (!items.length) return;

    const payload = await factory.buildAddNotesPayload(items.map(({ note }) => note));
    const newIds = await client.addNotes(payload);

    // Anki adds each note independently, so IDs for the notes that succeeded
    // must be recorded even if others in the same batch were rejected —
    // otherwise a single duplicate would cause every other note in this
    // batch to be re-added (and duplicated) on the next sync.
    items.forEach(({ index }, i) => {
        if (newIds[i] != null) updates[index] = { id: String(newIds[i]) };
    });

    const rejectedCount = newIds.filter(id => id == null).length;
    if (rejectedCount > 0) {
        throw new AnkiNoteRejectedError(rejectedCount, items.length);
    }
}

async function updateNotes(
    items: IndexedNote[],
    factory: AnkiPayloadFactory,
    client: AnkiConnectClient,
): Promise<void> {
    if (!items.length) return;

    const payload = await factory.buildUpdateNotesPayload(items.map(({ note }) => note));
    await client.updateNotes(payload);
}