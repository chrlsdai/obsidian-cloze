/**
 * Tests for anki-pusher.ts
 */

import {
    resolveConfig,
    pushNotes,
    AnkiConfigError,
    AnkiNoteRejectedError,
} from '../src/anki/pusher';
import { AnkiNoteUpdateError } from '../src/anki/connect-client';
import type { Note, NoteContext } from '../src/note/schema';

// ── Module mocks ──────────────────────────────────────────────────────────────

// AnkiPayloadFactory is constructed inside pushNotes; mock the whole module so
// the factory's methods return stable payloads and we can focus on client calls.
jest.mock('../src/anki/payload-factory', () => ({
    AnkiPayloadFactory: jest.fn().mockImplementation(() => ({
        buildAddNotesPayload: jest.fn().mockReturnValue({ notes: [] }),
        buildUpdateNotesPayload: jest.fn().mockReturnValue({ notes: [] }),
    })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type MockClient = {
    fetchDeckNames: jest.Mock;
    fetchModelNames: jest.Mock;
    fetchModelFields: jest.Mock;
    addNotes: jest.Mock;
    updateNotes: jest.Mock;
};

/** Builds a fully-functional mock client with valid defaults for every method. */
function makeClient(overrides: Partial<MockClient> = {}): MockClient {
    return {
        fetchDeckNames: jest.fn().mockResolvedValue(['My Deck', 'Default']),
        fetchModelNames: jest.fn().mockResolvedValue(['Basic', 'Cloze']),
        fetchModelFields: jest.fn().mockResolvedValue(['Front', 'Back']),
        addNotes: jest.fn().mockResolvedValue([]),
        updateNotes: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

/** A note without an id has never been sent to Anki; with an id it already exists. */
function makeNote(id?: number): Note {
    return { id } as unknown as Note;
}

const CONTEXT = {} as NoteContext;

const VALID_CONFIG = {
    deckName: 'My Deck',
    noteModel: { name: 'Basic', fields: ['Front', 'Back'] },
    sourceField: '',
};

// ── resolveConfig ─────────────────────────────────────────────────────────────

describe('resolveConfig — user configures deck and note type in plugin settings', () => {
    it('returns the full config when the deck and note type both exist in Anki', async () => {
        const client = makeClient();

        const config = await resolveConfig('My Deck', 'Basic', '', client as any);

        expect(config).toEqual({
            deckName: 'My Deck',
            noteModel: { name: 'Basic', fields: ['Front', 'Back'] },
            sourceField: '',
        });
    });

    it('includes the exact fields fetched from Anki for the chosen note type', async () => {
        const client = makeClient({
            fetchModelFields: jest.fn().mockResolvedValue(['Front', 'Back', 'Source']),
        });

        const config = await resolveConfig('My Deck', 'Basic', '', client as any);

        expect(config.noteModel.fields).toEqual(['Front', 'Back', 'Source']);
    });

    it('fetches deck names, model names, and model fields concurrently in a single round trip', async () => {
        // All three API calls are issued together via Promise.all before any
        // validation runs — this keeps latency to one network round-trip.
        const client = makeClient();

        await resolveConfig('My Deck', 'Basic', '', client as any);

        expect(client.fetchDeckNames).toHaveBeenCalledTimes(1);
        expect(client.fetchModelNames).toHaveBeenCalledTimes(1);
        expect(client.fetchModelFields).toHaveBeenCalledWith('Basic');
    });

    // ── Missing deck ──────────────────────────────────────────────────────────

    it('throws AnkiConfigError when the configured deck is not found in Anki', async () => {
        const client = makeClient({
            fetchDeckNames: jest.fn().mockResolvedValue(['Default']),
        });

        await expect(resolveConfig('Missing Deck', 'Basic', '', client as any))
            .rejects.toThrow(AnkiConfigError);
    });

    it('includes the available deck names in the error so the user can fix the setting', async () => {
        const client = makeClient({
            fetchDeckNames: jest.fn().mockResolvedValue(['Default', 'Spanish']),
        });

        await expect(resolveConfig('Wrong Deck', 'Basic', '', client as any))
            .rejects.toThrow(/Available decks: Default, Spanish/);
    });

    it('shows "none" in the deck-not-found error when Anki has no decks at all', async () => {
        // LIKELY MISS: careless implementation skips the empty-array fallback branch
        const client = makeClient({
            fetchDeckNames: jest.fn().mockResolvedValue([]),
        });

        await expect(resolveConfig('Any Deck', 'Basic', '', client as any))
            .rejects.toThrow(/Available decks: none/);
    });

    // ── Missing note type ─────────────────────────────────────────────────────

    it('throws AnkiConfigError when the configured note type is not found in Anki', async () => {
        const client = makeClient({
            fetchModelNames: jest.fn().mockResolvedValue(['Basic', 'Cloze']),
        });

        await expect(resolveConfig('My Deck', 'Missing Model', '', client as any))
            .rejects.toThrow(AnkiConfigError);
    });

    it('includes the available note types in the error so the user knows what to pick', async () => {
        const client = makeClient({
            fetchModelNames: jest.fn().mockResolvedValue(['Basic', 'Cloze']),
        });

        await expect(resolveConfig('My Deck', 'Missing Model', '', client as any))
            .rejects.toThrow(/Available note types: Basic, Cloze/);
    });

    it('shows "none" in the note-type-not-found error when Anki has no note types', async () => {
        // LIKELY MISS: same empty-array fallback; easy to omit for model names
        const client = makeClient({
            fetchModelNames: jest.fn().mockResolvedValue([]),
        });

        await expect(resolveConfig('My Deck', 'Basic', '', client as any))
            .rejects.toThrow(/Available note types: none/);
    });

    // ── Note type has no fields ───────────────────────────────────────────────

    it('throws AnkiConfigError when the note type exists but has zero fields', async () => {
        const client = makeClient({
            fetchModelFields: jest.fn().mockResolvedValue([]),
        });

        await expect(resolveConfig('My Deck', 'Basic', '', client as any))
            .rejects.toThrow(AnkiConfigError);
    });

    it('tells the user to edit the note type in Anki when it has no fields', async () => {
        const client = makeClient({
            fetchModelFields: jest.fn().mockResolvedValue([]),
        });

        await expect(resolveConfig('My Deck', 'Basic', '', client as any))
            .rejects.toThrow(/Edit the note type in Anki/);
    });

    // ── Source field validation ───────────────────────────────────────────────

    it('throws AnkiConfigError when sourceField is set but is not present in the model', async () => {
        const client = makeClient();
        // Default model fields are ['Front', 'Back']; 'Source' is not among them.
        await expect(resolveConfig('My Deck', 'Basic', 'Source', client as any))
            .rejects.toThrow(AnkiConfigError);
    });

    it('does not throw when sourceField is empty (the feature is disabled)', async () => {
        const client = makeClient();

        await expect(resolveConfig('My Deck', 'Basic', '', client as any))
            .resolves.toBeDefined();
    });

    it('succeeds and includes sourceField in the config when it matches a model field', async () => {
        const client = makeClient({
            fetchModelFields: jest.fn().mockResolvedValue(['Front', 'Back', 'Source']),
        });

        const config = await resolveConfig('My Deck', 'Basic', 'Source', client as any);

        expect(config.sourceField).toBe('Source');
    });
});

// ── pushNotes ─────────────────────────────────────────────────────────────────

describe('pushNotes — user triggers a sync from Obsidian to Anki', () => {

    describe('nothing to sync', () => {
        it('returns an empty array when the note list is empty', async () => {
            const client = makeClient();

            const result = await pushNotes([], VALID_CONFIG, CONTEXT, client as any);

            expect(result).toEqual([]);
        });

        it('makes no API calls when there are no notes', async () => {
            const client = makeClient();

            await pushNotes([], VALID_CONFIG, CONTEXT, client as any);

            expect(client.addNotes).not.toHaveBeenCalled();
            expect(client.updateNotes).not.toHaveBeenCalled();
        });
    });

    describe('adding new notes for the first time', () => {
        it('returns one update entry per new note containing the Anki-assigned ID', async () => {
            const client = makeClient({
                addNotes: jest.fn().mockResolvedValue([111, 222]),
            });

            const result = await pushNotes(
                [makeNote(), makeNote()],
                VALID_CONFIG,
                CONTEXT,
                client as any,
            );

            expect(result[0]).toEqual({ id: '111' });
            expect(result[1]).toEqual({ id: '222' });
        });

        it('stores the Anki ID as a string, not a number', async () => {
            // LIKELY MISS: Anki returns numeric IDs (large integers); skipping String()
            // conversion would break the downstream serialisation into the Obsidian note file.
            const client = makeClient({
                addNotes: jest.fn().mockResolvedValue([1700000001234]),
            });

            const result = await pushNotes([makeNote()], VALID_CONFIG, CONTEXT, client as any);

            expect(typeof result[0]!.id).toBe('string');
            expect(result[0]!.id).toBe('1700000001234');
        });

        it('batches all new notes into a single addNotes call', async () => {
            const client = makeClient({
                addNotes: jest.fn().mockResolvedValue([1, 2, 3]),
            });

            await pushNotes(
                [makeNote(), makeNote(), makeNote()],
                VALID_CONFIG,
                CONTEXT,
                client as any,
            );

            expect(client.addNotes).toHaveBeenCalledTimes(1);
        });

        it('throws AnkiNoteRejectedError when Anki returns null for any note ID', async () => {
            // When Anki rejects a note (e.g. duplicate) it returns null in the ID array.
            // The pusher surfaces this as a hard error so the user can investigate.
            const client = makeClient({
                addNotes: jest.fn().mockResolvedValue([111, null, 333]),
            });

            await expect(
                pushNotes(
                    [makeNote(), makeNote(), makeNote()],
                    VALID_CONFIG,
                    CONTEXT,
                    client as any,
                )
            ).rejects.toThrow(AnkiNoteRejectedError);
        });

        it('includes the rejected and total counts in the AnkiNoteRejectedError message', async () => {
            const client = makeClient({
                addNotes: jest.fn().mockResolvedValue([null, null, 333]),
            });

            await expect(
                pushNotes(
                    [makeNote(), makeNote(), makeNote()],
                    VALID_CONFIG,
                    CONTEXT,
                    client as any,
                )
            ).rejects.toThrow(/2 of 3/);
        });
    });

    describe('updating notes that already exist in Anki', () => {
        it('sends all existing-note updates in a single batched updateNotes call', async () => {
            const client = makeClient();

            await pushNotes(
                [makeNote(101), makeNote(102), makeNote(103)],
                VALID_CONFIG,
                CONTEXT,
                client as any,
            );

            expect(client.updateNotes).toHaveBeenCalledTimes(1);
        });

        it('returns an empty update object for each existing note (the ID does not change)', async () => {
            // LIKELY MISS: a wrong implementation might write a new id field into these entries
            const client = makeClient();

            const result = await pushNotes(
                [makeNote(101), makeNote(102)],
                VALID_CONFIG,
                CONTEXT,
                client as any,
            );

            expect(result[0]).toEqual({});
            expect(result[1]).toEqual({});
        });

        it('does not call addNotes when every note already has an Anki ID', async () => {
            const client = makeClient();

            await pushNotes(
                [makeNote(101), makeNote(102)],
                VALID_CONFIG,
                CONTEXT,
                client as any,
            );

            expect(client.addNotes).not.toHaveBeenCalled();
        });
    });

    describe('syncing a vault that has both new and existing notes', () => {
        it('adds new notes and updates existing ones in the same operation', async () => {
            const client = makeClient({
                addNotes: jest.fn().mockResolvedValue([999]),
            });
            // Position 0: existing, 1: new, 2: existing
            const notes = [makeNote(101), makeNote(), makeNote(103)];

            await pushNotes(notes, VALID_CONFIG, CONTEXT, client as any);

            expect(client.addNotes).toHaveBeenCalledTimes(1);
            expect(client.updateNotes).toHaveBeenCalledTimes(1);
        });

        it('writes the new Anki ID back to the correct position in the result array', async () => {
            // LIKELY MISS: the toAdd sub-array has different indices than the original notes array;
            // mapping them back incorrectly would store the ID on the wrong Obsidian note.
            const client = makeClient({
                addNotes: jest.fn().mockResolvedValue([555, 666]),
            });
            // Position 0: existing, positions 1–2: new
            const notes = [makeNote(1), makeNote(), makeNote()];

            const result = await pushNotes(notes, VALID_CONFIG, CONTEXT, client as any);

            expect(result[0]).toEqual({});          // existing — no new ID
            expect(result[1]).toEqual({ id: '555' });
            expect(result[2]).toEqual({ id: '666' });
        });

        it('always returns exactly as many update entries as input notes', async () => {
            const client = makeClient({
                addNotes: jest.fn().mockResolvedValue([888]),
            });
            const notes = [makeNote(101), makeNote(), makeNote(103)];

            const result = await pushNotes(notes, VALID_CONFIG, CONTEXT, client as any);

            expect(result).toHaveLength(3);
        });
    });

    describe('large batches — all updates sent in a single request', () => {
        it('sends all existing-note updates in one updateNotes call regardless of count', async () => {
            const client = makeClient();
            const notes = Array.from({ length: 25 }, (_, i) => makeNote(i + 1));

            await pushNotes(notes, VALID_CONFIG, CONTEXT, client as any);

            expect(client.updateNotes).toHaveBeenCalledTimes(1);
        });

        it('returns the correct number of update entries for a large batch of existing notes', async () => {
            const client = makeClient();
            const notes = Array.from({ length: 25 }, (_, i) => makeNote(i + 1));

            const result = await pushNotes(notes, VALID_CONFIG, CONTEXT, client as any);

            expect(result).toHaveLength(25);
            result.forEach(entry => expect(entry).toEqual({}));
        });

        it('sends all new notes in one addNotes call regardless of count', async () => {
            const ids = Array.from({ length: 25 }, (_, i) => i + 1);
            const client = makeClient({
                addNotes: jest.fn().mockResolvedValue(ids),
            });
            const notes = Array.from({ length: 25 }, () => makeNote());

            await pushNotes(notes, VALID_CONFIG, CONTEXT, client as any);

            expect(client.addNotes).toHaveBeenCalledTimes(1);
        });
    });
});

// ── Error classes ─────────────────────────────────────────────────────────────

describe('exported error classes — messages guide the user toward a fix', () => {
    describe('AnkiConfigError', () => {
        it('is an instance of Error with name AnkiConfigError', () => {
            const err = new AnkiConfigError('deck not found');
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('AnkiConfigError');
        });

        it('preserves the message passed to the constructor', () => {
            const err = new AnkiConfigError('some config issue');
            expect(err.message).toBe('some config issue');
        });
    });

    describe('AnkiNoteRejectedError', () => {
        it('is an instance of Error with name AnkiNoteRejectedError', () => {
            const err = new AnkiNoteRejectedError(1, 5);
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('AnkiNoteRejectedError');
        });

        it('includes both the rejected count and the total in the message', async () => {
            // LIKELY MISS: swapping the two constructor arguments would produce a misleading ratio
            const err = new AnkiNoteRejectedError(3, 10);
            expect(err.message).toMatch(/3 of 10/);
        });
    });

    describe('AnkiNoteUpdateError', () => {
        it('is an instance of Error with name AnkiNoteUpdateError', () => {
            const err = new AnkiNoteUpdateError([{ id: 42, error: 'not found' }]);
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('AnkiNoteUpdateError');
        });

        it('includes the failing note ID so the user can find the affected card', () => {
            const err = new AnkiNoteUpdateError([{ id: 1700000001234, error: 'not found' }]);
            expect(err.message).toContain('1700000001234');
        });

        it('advises the user to remove the IDs from Obsidian to re-add as fresh cards', () => {
            const err = new AnkiNoteUpdateError([{ id: 42, error: 'some error' }]);
            expect(err.message).toMatch(/Remove their IDs in Obsidian/);
        });

        it('exposes the structured failures array for programmatic inspection', () => {
            const failures = [
                { id: 101, error: 'note not found' },
                { id: 202, error: 'permission denied' },
            ];
            const err = new AnkiNoteUpdateError(failures);
            expect(err.failures).toEqual(failures);
        });
    });
});