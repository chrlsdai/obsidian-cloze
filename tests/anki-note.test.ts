import {
  createNoteConverter,
  addNote,
  addNotes,
  getConfig,
  syncNotes,
  generateUpdates,
  type NoteConfig,
  type AnkiConnectNote,
} from '../src/anki-note';

import { ankiRequest } from '../src/anki-connect';
import type { ParsedCard } from '../src/parser';

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../src/anki-connect', () => ({
  ankiRequest: jest.fn(),
}));

const mockAnkiRequest = ankiRequest as jest.MockedFunction<typeof ankiRequest>;

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<ParsedCard> = {}): ParsedCard {
  return {
    text: 'Default text',
    cardFields: {},
    tags: new Set(),
    ...overrides,
  } as ParsedCard;
}

function makeConfig(overrides: Partial<NoteConfig> = {}): NoteConfig {
  return {
    deckName: 'TestDeck',
    modelName: 'TestModel',
    firstFieldName: 'Front',
    ...overrides,
  };
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── createNoteConverter ──────────────────────────────────────────────────────

describe('createNoteConverter', () => {
  it('returns a function', () => {
    expect(typeof createNoteConverter(makeConfig())).toBe('function');
  });

  it('produces an AnkiConnectNote with the correct shape', () => {
    const converter = createNoteConverter(makeConfig());
    const card = makeCard({
      text: 'Question',
      cardFields: { Back: 'Answer' },
      tags: ['tag1', 'tag2'],
    });

    expect(converter(card)).toEqual<AnkiConnectNote>({
      deckName: 'TestDeck',
      modelName: 'TestModel',
      fields: { Front: 'Question', Back: 'Answer' },
      tags: ['tag1', 'tag2'],
      options: { allowDuplicate: false, duplicateScope: 'deck' },
    });
  });

  it('sets deckName and modelName from config', () => {
    const converter = createNoteConverter(
      makeConfig({ deckName: 'MyDeck', modelName: 'MyModel' })
    );
    const { deckName, modelName } = converter(makeCard());

    expect(deckName).toBe('MyDeck');
    expect(modelName).toBe('MyModel');
  });

  it('puts card.text under the firstFieldName key', () => {
    const converter = createNoteConverter(makeConfig({ firstFieldName: 'Front' }));
    const { fields } = converter(makeCard({ text: 'Hello' }));

    expect(fields['Front']).toBe('Hello');
  });

  it('merges all cardFields into the fields object', () => {
    const converter = createNoteConverter(makeConfig({ firstFieldName: 'Front' }));
    const { fields } = converter(
      makeCard({ text: 'Q', cardFields: { Back: 'A', Extra: 'E' } })
    );

    expect(fields).toEqual({ Front: 'Q', Back: 'A', Extra: 'E' });
  });

  it('card.text (primary field) always overwrites a conflicting cardFields key', () => {
    const converter = createNoteConverter(makeConfig({ firstFieldName: 'Front' }));
    const { fields } = converter(
      makeCard({ text: 'Wins', cardFields: { Front: 'Loses' } })
    );

    expect(fields['Front']).toBe('Wins');
  });

  it('emits console.warn when cardFields contains the firstFieldName key', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const converter = createNoteConverter(makeConfig({ firstFieldName: 'Front' }));

    converter(makeCard({ cardFields: { Front: 'conflict' } }));

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"Front"'));
  });

  it('does NOT warn when there is no key conflict', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const converter = createNoteConverter(makeConfig({ firstFieldName: 'Front' }));

    converter(makeCard({ cardFields: { Back: 'safe' } }));

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('defaults allowDuplicate to false and duplicateScope to "deck"', () => {
    const { options } = createNoteConverter(makeConfig())(makeCard());

    expect(options).toEqual({ allowDuplicate: false, duplicateScope: 'deck' });
  });

  it('forwards custom allowDuplicate and duplicateScope from config', () => {
    const converter = createNoteConverter(
      makeConfig({ allowDuplicate: true, duplicateScope: 'collection' })
    );

    expect(converter(makeCard()).options).toEqual({
      allowDuplicate: true,
      duplicateScope: 'collection',
    });
  });

  it('spreads tags into a new array (not the same reference)', () => {
    const originalTags = ['a', 'b'];
    const { tags } = createNoteConverter(makeConfig())(makeCard({ tags: originalTags }));

    expect(tags).toEqual(originalTags);
    expect(tags).not.toBe(originalTags);
  });

  it('handles an empty cardFields object', () => {
    const converter = createNoteConverter(makeConfig({ firstFieldName: 'Q' }));
    const { fields } = converter(makeCard({ text: 'Only primary', cardFields: {} }));

    expect(fields).toEqual({ Q: 'Only primary' });
  });
});

// ─── addNote ──────────────────────────────────────────────────────────────────

describe('addNote', () => {
  const note: AnkiConnectNote = {
    deckName: 'Deck',
    modelName: 'Model',
    fields: { Front: 'Q' },
    tags: [],
    options: { allowDuplicate: false, duplicateScope: 'deck' },
  };

  it('calls ankiRequest with action "addNote" and the note payload', async () => {
    mockAnkiRequest.mockResolvedValueOnce(42);

    await addNote(note);

    expect(mockAnkiRequest).toHaveBeenCalledWith('addNote', { note });
  });

  it('returns the ID resolved by ankiRequest', async () => {
    mockAnkiRequest.mockResolvedValueOnce(42);

    await expect(addNote(note)).resolves.toBe(42);
  });
});

// ─── addNotes ─────────────────────────────────────────────────────────────────

describe('addNotes', () => {
  const notes: AnkiConnectNote[] = [
    {
      deckName: 'Deck',
      modelName: 'Model',
      fields: { Front: 'Q1' },
      tags: [],
      options: { allowDuplicate: false, duplicateScope: 'deck' },
    },
    {
      deckName: 'Deck',
      modelName: 'Model',
      fields: { Front: 'Q2' },
      tags: [],
      options: { allowDuplicate: false, duplicateScope: 'deck' },
    },
  ];

  it('calls ankiRequest with action "addNotes" and the notes array payload', async () => {
    mockAnkiRequest.mockResolvedValueOnce([1, 2]);

    await addNotes(notes);

    expect(mockAnkiRequest).toHaveBeenCalledWith('addNotes', { notes });
  });

  it('returns the array of IDs resolved by ankiRequest', async () => {
    mockAnkiRequest.mockResolvedValueOnce([100, 200]);

    await expect(addNotes(notes)).resolves.toEqual([100, 200]);
  });
});

// ─── getConfig ────────────────────────────────────────────────────────────────

describe('getConfig', () => {
  function setupValidMocks(
    decks = ['TestDeck'],
    models = ['TestModel'],
    fields = ['Front', 'Back']
  ) {
    mockAnkiRequest
      .mockResolvedValueOnce(decks)
      .mockResolvedValueOnce(models)
      .mockResolvedValueOnce(fields);
  }

  it('returns a complete NoteConfig on the happy path', async () => {
    setupValidMocks();

    await expect(getConfig('TestDeck', 'TestModel')).resolves.toEqual({
      deckName: 'TestDeck',
      modelName: 'TestModel',
      firstFieldName: 'Front',
    });
  });

  it('uses the first element of modelFieldNames as firstFieldName', async () => {
    setupValidMocks(['TestDeck'], ['TestModel'], ['Primary', 'Secondary', 'Extra']);

    const { firstFieldName } = await getConfig('TestDeck', 'TestModel');

    expect(firstFieldName).toBe('Primary');
  });

  it('calls deckNames then modelNames (parallel pair), then modelFieldNames', async () => {
    setupValidMocks();

    await getConfig('TestDeck', 'TestModel');

    expect(mockAnkiRequest).toHaveBeenNthCalledWith(1, 'deckNames', {});
    expect(mockAnkiRequest).toHaveBeenNthCalledWith(2, 'modelNames', {});
    expect(mockAnkiRequest).toHaveBeenNthCalledWith(3, 'modelFieldNames', {
      modelName: 'TestModel',
    });
  });

  it('throws with a descriptive message when the deck is not found', async () => {
    mockAnkiRequest
      .mockResolvedValueOnce(['SomeDeck'])
      .mockResolvedValueOnce(['TestModel']);

    await expect(getConfig('TestDeck', 'TestModel')).rejects.toThrow(
      'Deck "TestDeck" not found'
    );
  });

  it('does not call modelFieldNames when the deck check fails', async () => {
    mockAnkiRequest
      .mockResolvedValueOnce(['SomeDeck'])
      .mockResolvedValueOnce(['TestModel']);

    await getConfig('TestDeck', 'TestModel').catch(() => {});

    expect(mockAnkiRequest).toHaveBeenCalledTimes(2);
  });

  it('throws with a descriptive message when the model is not found', async () => {
    mockAnkiRequest
      .mockResolvedValueOnce(['TestDeck'])
      .mockResolvedValueOnce(['SomeModel']);

    await expect(getConfig('TestDeck', 'TestModel')).rejects.toThrow(
      'Model "TestModel" not found'
    );
  });

  it('throws when the model has no fields', async () => {
    mockAnkiRequest
      .mockResolvedValueOnce(['TestDeck'])
      .mockResolvedValueOnce(['TestModel'])
      .mockResolvedValueOnce([]);

    await expect(getConfig('TestDeck', 'TestModel')).rejects.toThrow(
      'Model "TestModel" has no fields'
    );
  });
});

// ─── syncNotes ────────────────────────────────────────────────────────────────

describe('syncNotes', () => {
  const config = makeConfig({ firstFieldName: 'Front' });

  // ── All-new cards (no IDs) ─────────────────────────────────────────────────

  describe('when all cards are new (no IDs)', () => {
    it('returns "created" results indexed by position', async () => {
      const cards = [makeCard({ text: 'A' }), makeCard({ text: 'B' })];
      mockAnkiRequest.mockResolvedValueOnce([101, 102]);

      const results = await syncNotes(cards, config);

      expect(results).toEqual([
        { id: 101, status: 'created' },
        { id: 102, status: 'created' },
      ]);
    });

    it('never calls notesInfo', async () => {
      mockAnkiRequest.mockResolvedValueOnce([1]);

      await syncNotes([makeCard()], config);

      expect(mockAnkiRequest).not.toHaveBeenCalledWith('notesInfo', expect.anything());
    });

    it('passes correctly converted AnkiConnectNotes to addNotes', async () => {
      const card = makeCard({ text: 'Q', cardFields: { Back: 'A' }, tags: ['study'] });
      mockAnkiRequest.mockResolvedValueOnce([200]);

      await syncNotes([card], config);

      expect(mockAnkiRequest).toHaveBeenCalledWith('addNotes', {
        notes: [
          {
            deckName: 'TestDeck',
            modelName: 'TestModel',
            fields: { Front: 'Q', Back: 'A' },
            tags: ['study'],
            options: { allowDuplicate: false, duplicateScope: 'deck' },
          },
        ],
      });
    });

    it('marks a slot as error when addNotes returns null for that position', async () => {
      const cards = [makeCard(), makeCard()];
      mockAnkiRequest.mockResolvedValueOnce([300, null]);

      const results = await syncNotes(cards, config);

      expect(results[0]).toEqual({ id: 300, status: 'created' });
      expect(results[1]).toEqual({
        id: null,
        status: 'error',
        error: 'addNotes returned null for this note',
      });
    });

    it('marks ALL new slots as error when addNotes rejects', async () => {
      const cards = [makeCard(), makeCard()];
      mockAnkiRequest.mockRejectedValueOnce(new Error('Network error'));

      const results = await syncNotes(cards, config);

      expect(results).toEqual([
        { id: null, status: 'error', error: 'Network error' },
        { id: null, status: 'error', error: 'Network error' },
      ]);
    });

    it('stringifies non-Error rejections from addNotes', async () => {
      mockAnkiRequest.mockRejectedValueOnce('plain string error');

      const [result] = await syncNotes([makeCard()], config);

      expect(result).toEqual({ id: null, status: 'error', error: 'plain string error' });
    });
  });

  // ── Existing cards (IDs present in Anki) ──────────────────────────────────

  describe('when cards have IDs that exist in Anki', () => {
    it('calls updateNote for each card and returns "updated" results', async () => {
      const cards = [makeCard({ id: 1001 }), makeCard({ id: 1002 })];
      mockAnkiRequest
        .mockResolvedValueOnce([{ noteId: 1001 }, { noteId: 1002 }]) // notesInfo
        .mockResolvedValueOnce(null)  // updateNote 1001
        .mockResolvedValueOnce(null); // updateNote 1002

      const results = await syncNotes(cards, config);

      expect(results).toEqual([
        { id: 1001, status: 'updated' },
        { id: 1002, status: 'updated' },
      ]);
    });

    it('passes the card IDs to notesInfo', async () => {
      const cards = [makeCard({ id: 1001 }), makeCard({ id: 1002 })];
      mockAnkiRequest
        .mockResolvedValueOnce([{ noteId: 1001 }, { noteId: 1002 }])
        .mockResolvedValue(null);

      await syncNotes(cards, config);

      expect(mockAnkiRequest).toHaveBeenCalledWith('notesInfo', {
        notes: [1001, 1002],
      });
    });

    it('sends the correct fields, tags, and id to updateNote', async () => {
      const card = makeCard({
        text: 'Question',
        cardFields: { Back: 'Answer' },
        tags: ['t1'],
        id: 5001,
      });
      mockAnkiRequest
        .mockResolvedValueOnce([{ noteId: 5001 }])
        .mockResolvedValueOnce(null);

      await syncNotes([card], config);

      expect(mockAnkiRequest).toHaveBeenCalledWith('updateNote', {
        note: {
          id: 5001,
          fields: { Front: 'Question', Back: 'Answer' },
          tags: ['t1'],
        },
      });
    });

    it('marks a card as error when updateNote rejects with an Error', async () => {
      const card = makeCard({ id: 7777 });
      mockAnkiRequest
        .mockResolvedValueOnce([{ noteId: 7777 }])
        .mockRejectedValueOnce(new Error('Update failed'));

      const [result] = await syncNotes([card], config);

      expect(result).toEqual({ id: 7777, status: 'error', error: 'Update failed' });
    });

    it('stringifies non-Error rejections from updateNote', async () => {
      const card = makeCard({ id: 6666 });
      mockAnkiRequest
        .mockResolvedValueOnce([{ noteId: 6666 }])
        .mockRejectedValueOnce('oops');

      const [result] = await syncNotes([card], config);

      expect(result).toEqual({ id: 6666, status: 'error', error: 'oops' });
    });
  });

  // ── Cards with IDs not found in Anki ──────────────────────────────────────

  describe('when a card has an ID not found in Anki', () => {
    it('treats the card as new when notesInfo returns null for its slot', async () => {
      const card = makeCard({ id: 9999 });
      mockAnkiRequest
        .mockResolvedValueOnce([null]) // Anki has no record for this ID
        .mockResolvedValueOnce([401]);

      const [result] = await syncNotes([card], config);

      expect(result).toEqual({ id: 401, status: 'created' });
    });

    it('treats the card as new when notesInfo entry has no noteId property', async () => {
      const card = makeCard({ id: 8888 });
      mockAnkiRequest
        .mockResolvedValueOnce([{}]) // entry exists but noteId is absent
        .mockResolvedValueOnce([501]);

      const [result] = await syncNotes([card], config);

      expect(result).toEqual({ id: 501, status: 'created' });
    });
  });

  // ── Mixed new + existing ───────────────────────────────────────────────────

  describe('when the batch contains both new and existing cards', () => {
    it('creates new cards and updates existing ones, preserving index order', async () => {
      // index 0 → new (no id), index 1 → existing
      const cards = [
        makeCard({ text: 'New',      id: undefined }),
        makeCard({ text: 'Existing', id: 2001 }),
      ];

      // Call order: notesInfo → updateNote (runs first in Promise.all) → addNotes
      mockAnkiRequest
        .mockResolvedValueOnce([{ noteId: 2001 }]) // notesInfo
        .mockResolvedValueOnce(null)                // updateNote 2001
        .mockResolvedValueOnce([301]);              // addNotes for new card

      const results = await syncNotes(cards, config);

      expect(results[0]).toEqual({ id: 301,  status: 'created' });
      expect(results[1]).toEqual({ id: 2001, status: 'updated' });
    });
  });

  // ── Empty input ────────────────────────────────────────────────────────────

  describe('when the cards array is empty', () => {
    it('returns an empty array without making any requests', async () => {
      const results = await syncNotes([], config);

      expect(results).toEqual([]);
      expect(mockAnkiRequest).not.toHaveBeenCalled();
    });
  });

  // ── Chunking ───────────────────────────────────────────────────────────────

  describe('chunk-size handling for updates', () => {
    it('processes all N cards and returns "updated" for each', async () => {
      const N = 5;
      const cards = Array.from({ length: N }, (_, i) =>
        makeCard({ text: `Card ${i}`, id: 1000 + i })
      );

      mockAnkiRequest
        .mockResolvedValueOnce(cards.map((c) => ({ noteId: c.id }))) // notesInfo
        .mockResolvedValue(null);                                      // all updateNote calls

      const results = await syncNotes(cards, config, 2);

      expect(results).toHaveLength(N);
      expect(results.every((r) => r.status === 'updated')).toBe(true);
      results.forEach((r, i) => expect(r.id).toBe(1000 + i));
    });

    it('makes exactly 1 notesInfo call + N updateNote calls', async () => {
      const N = 5;
      const cards = Array.from({ length: N }, (_, i) =>
        makeCard({ id: 2000 + i })
      );

      mockAnkiRequest
        .mockResolvedValueOnce(cards.map((c) => ({ noteId: c.id })))
        .mockResolvedValue(null);

      await syncNotes(cards, config, 2);

      expect(mockAnkiRequest).toHaveBeenCalledTimes(N + 1);
    });
  });
});

// ─── generateUpdates ─────────────────────────────────────────────────────────

describe('generateUpdates', () => {
  it('returns an update entry for every "created" result with a non-null id', () => {
    const cards = [makeCard({ text: 'A' }), makeCard({ text: 'B' })];
    const results = [
      { id: 11, status: 'created' as const },
      { id: 22, status: 'created' as const },
    ];

    expect(generateUpdates(cards, results)).toEqual([
      { card: cards[0], fields: { id: '11' } },
      { card: cards[1], fields: { id: '22' } },
    ]);
  });

  it('converts the numeric id to a string in fields.id', () => {
    const cards = [makeCard()];
    const results = [{ id: 99999, status: 'created' as const }];

    const [update] = generateUpdates(cards, results);

    expect(typeof update?.fields.id).toBe('string');
    expect(update?.fields.id).toBe('99999');
  });

  it('references the original card object (identity)', () => {
    const card = makeCard({ text: 'My card' });
    const [update] = generateUpdates([card], [{ id: 1, status: 'created' as const }]);

    expect(update?.card).toBe(card);
  });

  it('excludes results with status "updated"', () => {
    const cards = [makeCard()];
    const results = [{ id: 1, status: 'updated' as const }];

    expect(generateUpdates(cards, results)).toHaveLength(0);
  });

  it('excludes results with status "error"', () => {
    const cards = [makeCard()];
    const results = [{ id: null, status: 'error' as const, error: 'Oops' }];

    expect(generateUpdates(cards, results)).toHaveLength(0);
  });

  it('excludes "created" results whose id is null', () => {
    const cards = [makeCard()];
    const results = [{ id: null, status: 'created' as const }];

    expect(generateUpdates(cards, results)).toHaveLength(0);
  });

  it('handles a realistic mix of created / updated / error results', () => {
    const cards = [
      makeCard({ text: 'Created' }),
      makeCard({ text: 'Updated' }),
      makeCard({ text: 'Error' }),
      makeCard({ text: 'Created null id' }),
    ];
    const results = [
      { id: 111,  status: 'created' as const },
      { id: 222,  status: 'updated' as const },
      { id: null, status: 'error'   as const, error: 'bad' },
      { id: null, status: 'created' as const },
    ];

    const updates = generateUpdates(cards, results);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ card: cards[0], fields: { id: '111' } });
  });

  it('returns an empty array for empty inputs', () => {
    expect(generateUpdates([], [])).toEqual([]);
  });
});