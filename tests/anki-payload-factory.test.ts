/**
 * anki-payload-factory.test.ts
 *
 * Tests for AnkiPayloadFactory — the component that converts Obsidian notes
 * into Anki-Connect API payloads so users can sync their vault to Anki.
 */

import { AnkiPayloadFactory, AnkiConfig } from '../src/anki/payload-factory';
import { Note, NoteContext } from '../src/note/schema';
import { convertHTML } from '../src/anki/html-processing';

// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../src/anki/html-processing');
jest.mock('../src/note/schema', () => ({}));

// ── Typed mock handle ────────────────────────────────────────────────────────

const mockConvertHTML = convertHTML as jest.MockedFunction<typeof convertHTML>;

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal Note object that satisfies the interface.
 * Tests override only the properties they care about.
 */
function makeNote(
    overrides: {
        textElement?: Element;
        tags?: string[];
        id?: number;
        noteFields?: Record<string, string>;
    } = {},
): Note {
    return {
        textElement: document.createElement('div'),
        tags: [],
        noteFields: {},
        ...overrides,
    } as unknown as Note;
}

function makeConfig(overrides: Partial<AnkiConfig> = {}): AnkiConfig {
    return {
        deckName: 'My Deck',
        noteModel: {
            name: 'Basic',
            fields: ['Front', 'Back'] as readonly string[],
        },
        sourceField: '',
        ...overrides,
    };
}

/** Minimal context — the factory forwards it to convertHTML unchanged. */
const stubContext = {} as NoteContext;

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AnkiPayloadFactory', () => {

    beforeEach(() => {
        // Default: HTML converter returns something predictable.
        mockConvertHTML.mockReturnValue('<p>converted content</p>');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ── Scenario: User adds a single note to Anki for the first time ──────────

    describe('when the user syncs a note to Anki for the first time', () => {

        it('places the card in the deck the user configured', () => {
            const factory = new AnkiPayloadFactory(
                makeConfig({ deckName: 'Japanese::N2' }),
                stubContext,
            );

            const payload = factory.buildAddNotesPayload([makeNote()]);

            expect(payload.notes[0]!.deckName).toBe('Japanese::N2');
        });

        it('uses the model name from the user\'s config', () => {
            const factory = new AnkiPayloadFactory(
                makeConfig({ noteModel: { name: 'Cloze', fields: ['Text'] as readonly string[] } }),
                stubContext,
            );

            const payload = factory.buildAddNotesPayload([makeNote()]);

            expect(payload.notes[0]!.modelName).toBe('Cloze');
        });

        it('puts the HTML-converted note content into the first model field', () => {
            mockConvertHTML.mockReturnValue('<p><b>What is JSX?</b></p>');
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);

            const payload = factory.buildAddNotesPayload([makeNote()]);

            expect(payload.notes[0]!.fields['Front']).toBe('<p><b>What is JSX?</b></p>');
        });

        it('passes the exact DOM element and context object to the HTML converter', () => {
            const element = document.createElement('p');
            element.textContent = 'My question';
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);

            factory.buildAddNotesPayload([makeNote({ textElement: element })]);

            // The converter must receive the real element, not a clone or string.
            expect(mockConvertHTML).toHaveBeenCalledWith(element, stubContext);
        });

        it('attaches the note\'s tags to the card in Anki format', () => {
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);
            const note = makeNote({ tags: ['#flashcard', '#language/japanese'] });

            const payload = factory.buildAddNotesPayload([note]);

            expect(payload.notes[0]!.tags).toEqual(['flashcard', 'language::japanese']);
        });

    });

    // ── Scenario: User syncs a batch of notes at once ────────────────────────

    describe('when the user syncs multiple notes in one go', () => {

        it('creates one Anki card entry for every note', () => {
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);

            const payload = factory.buildAddNotesPayload([
                makeNote(), makeNote(), makeNote(),
            ]);

            expect(payload.notes).toHaveLength(3);
        });

        it('applies the same deck and model to every card', () => {
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);

            const payload = factory.buildAddNotesPayload([makeNote(), makeNote()]);

            for (const card of payload.notes) {
                expect(card.deckName).toBe('My Deck');
                expect(card.modelName).toBe('Basic');
            }
        });

        it('converts each note\'s content independently', () => {
            // LIKELY MISS: a careless implementation might cache/re-use the
            // first convertHTML result for all notes.
            mockConvertHTML
                .mockReturnValueOnce('<p>Question one</p>')
                .mockReturnValueOnce('<p>Question two</p>');

            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);
            const payload = factory.buildAddNotesPayload([makeNote(), makeNote()]);

            expect(payload.notes[0]!.fields['Front']).toBe('<p>Question one</p>');
            expect(payload.notes[1]!.fields['Front']).toBe('<p>Question two</p>');
            expect(mockConvertHTML).toHaveBeenCalledTimes(2);
        });

    });

    // ── Scenario: User re-syncs an edited note that already exists in Anki ───

    describe('when the user updates a note that was previously synced to Anki', () => {

        it('produces an update payload that carries the original Anki card ID', () => {
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);
            const note = makeNote({ id: 1_705_000_000_000 });

            const payload = factory.buildUpdateNotesPayload([note]);

            expect(payload.notes[0]!.id).toBe(1_705_000_000_000);
        });

        it('includes the freshly converted HTML content so edits reach Anki', () => {
            mockConvertHTML.mockReturnValue('<p>Updated explanation</p>');
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);
            const note = makeNote({ id: 42 });

            const payload = factory.buildUpdateNotesPayload([note]);

            expect(payload.notes[0]!.fields['Front']).toBe('<p>Updated explanation</p>');
        });

        it('also includes any extra noteFields so no field is lost on update', () => {
            const config = makeConfig({
                noteModel: { name: 'Basic', fields: ['Front', 'Back'] as readonly string[] },
            });
            const factory = new AnkiPayloadFactory(config, stubContext);
            const note = makeNote({ id: 7, noteFields: { Back: 'The answer' } });

            const payload = factory.buildUpdateNotesPayload([note]);

            expect(payload.notes[0]!.fields['Back']).toBe('The answer');
        });

        it('batches multiple notes into a single payload', () => {
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);
            const notes = [makeNote({ id: 1 }), makeNote({ id: 2 }), makeNote({ id: 3 })];

            const payload = factory.buildUpdateNotesPayload(notes);

            expect(payload.notes).toHaveLength(3);
            expect(payload.notes[0]!.id).toBe(1);
            expect(payload.notes[1]!.id).toBe(2);
            expect(payload.notes[2]!.id).toBe(3);
        });

    });

    // ── Scenario: User tries to update a note that was never synced ──────────

    describe('when the user tries to update a note that has no Anki ID yet', () => {

        it('throws a clear error instead of sending a malformed payload', () => {
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);
            const unsyncedNote = makeNote({ id: undefined });

            expect(() => factory.buildUpdateNotesPayload([unsyncedNote])).toThrow(
                'Cannot build an update payload: note has no id.',
            );
        });

    });

    // ── Scenario: Note model with multiple fields ────────────────────────────

    describe('when the note model has more than one field', () => {

        it('puts the converted HTML in the first field only', () => {
            mockConvertHTML.mockReturnValue('<p>Front side</p>');
            const config = makeConfig({
                noteModel: {
                    name: 'Basic + reversed',
                    fields: ['Front', 'Back', 'Source'] as readonly string[],
                },
            });
            const factory = new AnkiPayloadFactory(config, stubContext);
            const note = makeNote({ noteFields: { Back: 'Back side', Source: 'p.42' } });

            const payload = factory.buildAddNotesPayload([note]);

            // LIKELY MISS: a naive implementation might put the HTML in every
            // field or only build the first field and discard noteFields.
            expect(payload.notes[0]!.fields['Front']).toBe('<p>Front side</p>');
            expect(payload.notes[0]!.fields['Back']).toBe('Back side');
            expect(payload.notes[0]!.fields['Source']).toBe('p.42');
        });

        it('only calls convertHTML once per note, not once per field', () => {
            const config = makeConfig({
                noteModel: {
                    name: 'Big model',
                    fields: ['F1', 'F2', 'F3'] as readonly string[],
                },
            });
            const factory = new AnkiPayloadFactory(config, stubContext);

            factory.buildAddNotesPayload([makeNote({ noteFields: { F2: 'x', F3: 'y' } })]);

            expect(mockConvertHTML).toHaveBeenCalledTimes(1);
        });

    });

    // ── Scenario: Tag format variations ─────────────────────────────────────

    describe('when the user has different tag styles in their vault', () => {

        it('strips the leading # from a simple tag', () => {
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);

            const payload = factory.buildAddNotesPayload([makeNote({ tags: ['#review'] })]);

            expect(payload.notes[0]!.tags).toContain('review');
            expect(payload.notes[0]!.tags).not.toContain('#review');
        });

        it('converts a single-level nested Obsidian tag to double-colon notation', () => {
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);

            const payload = factory.buildAddNotesPayload([
                makeNote({ tags: ['#language/japanese'] }),
            ]);

            expect(payload.notes[0]!.tags).toContain('language::japanese');
        });

        it('converts deeply nested tags at every level of the hierarchy', () => {
            // LIKELY MISS: a regex that only replaces the first `/` would leave
            // intermediate slashes unconverted.
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);

            const payload = factory.buildAddNotesPayload([
                makeNote({ tags: ['#grammar/n2/verb/godan'] }),
            ]);

            expect(payload.notes[0]!.tags).toContain('grammar::n2::verb::godan');
        });

        it('handles a realistic mix of simple and nested tags on the same note', () => {
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);

            const payload = factory.buildAddNotesPayload([
                makeNote({ tags: ['#review', '#language/japanese', '#grammar/n2/verb'] }),
            ]);

            expect(payload.notes[0]!.tags).toEqual([
                'review',
                'language::japanese',
                'grammar::n2::verb',
            ]);
        });

        it('produces an empty tags array when the note carries no tags', () => {
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);

            const payload = factory.buildAddNotesPayload([makeNote({ tags: [] })]);

            expect(payload.notes[0]!.tags).toEqual([]);
        });

    });

    // ── Scenario: Nothing to sync (empty state) ───────────────────────────────

    describe('when the user triggers sync but there are no matching notes', () => {

        it('returns a payload with an empty notes array rather than failing', () => {
            const factory = new AnkiPayloadFactory(makeConfig(), stubContext);

            const payload = factory.buildAddNotesPayload([]);

            expect(payload.notes).toEqual([]);
            expect(mockConvertHTML).not.toHaveBeenCalled();
        });

    });

    // ── Scenario: Plugin misconfigured with an empty note model ──────────────

    describe('when the plugin configuration has a note model with no fields defined', () => {

        it('throws an informative error when trying to add notes', () => {
            const config = makeConfig({
                noteModel: { name: 'Broken Model', fields: [] as readonly string[] },
            });
            const factory = new AnkiPayloadFactory(config, stubContext);

            expect(() => factory.buildAddNotesPayload([makeNote()])).toThrow(
                'NoteModel must define at least one field.',
            );
        });

        it('throws the same error when trying to update a note', () => {
            const config = makeConfig({
                noteModel: { name: 'Broken Model', fields: [] as readonly string[] },
            });
            const factory = new AnkiPayloadFactory(config, stubContext);

            expect(() => factory.buildUpdateNotesPayload([makeNote({ id: 1 })])).toThrow(
                'NoteModel must define at least one field.',
            );
        });

    });

});