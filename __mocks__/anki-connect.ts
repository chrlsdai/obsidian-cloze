// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnkiConnectResponse<T> {
  result: T;
  error: string | null;
}

export interface NoteFields {
  [fieldName: string]: string;
}

export interface AnkiNote {
  noteId: number;
  modelName: string;
  deckName: string;
  fields: Record<string, { value: string; order: number }>;
  tags: string[];
  cards: number[];
}

export interface AnkiCard {
  cardId: number;
  fields: Record<string, { value: string; order: number }>;
  fieldOrder: number;
  question: string;
  answer: string;
  modelName: string;
  ord: number;
  deckName: string;
  css: string;
  factor: number;
  interval: number;
  note: number;
  type: number;
  queue: number;
  due: number;
  reps: number;
  lapses: number;
  left: number;
  mod: number;
}

export interface NoteToAdd {
  deckName: string;
  modelName: string;
  fields: NoteFields;
  tags?: string[];
  audio?: MediaFile[];
  video?: MediaFile[];
  picture?: MediaFile[];
  options?: {
    allowDuplicate?: boolean;
    duplicateScope?: string;
    duplicateScopeOptions?: {
      deckName?: string;
      checkChildren?: boolean;
      checkAllModels?: boolean;
    };
  };
}

export interface MediaFile {
  url?: string;
  path?: string;
  data?: string;
  filename: string;
  skipHash?: string;
  fields: string[];
}

export interface DeckStats {
  deck_id: number;
  name: string;
  update_sequence_num: number;
  learn_count: number;
  review_count: number;
  new_count: number;
  total_in_deck: number;
}

export interface ModelTemplate {
  Front: string;
  Back: string;
}

export interface AnkiModel {
  id: string;
  name: string;
  fields: string[];
  templates: Record<string, ModelTemplate>;
  css: string;
  isCloze: boolean;
}

// ─── Mock Data Factories ─────────────────────────────────────────────────────

let nextNoteId = 1000000000;
let nextCardId = 1000000001;
let nextDeckId = 1;
let nextModelId = 1;

export const createMockNote = (overrides: Partial<AnkiNote> = {}): AnkiNote => ({
  noteId:    nextNoteId++,
  modelName: 'Basic',
  deckName:  'Default',
  fields: {
    Front: { value: 'Mock Front', order: 0 },
    Back:  { value: 'Mock Back',  order: 1 },
  },
  tags:  [],
  cards: [nextCardId++],
  ...overrides,
});

export const createMockCard = (overrides: Partial<AnkiCard> = {}): AnkiCard => ({
  cardId:     nextCardId++,
  fields: {
    Front: { value: 'Mock Front', order: 0 },
    Back:  { value: 'Mock Back',  order: 1 },
  },
  fieldOrder: 0,
  question:   'Mock Question',
  answer:     'Mock Answer',
  modelName:  'Basic',
  ord:        0,
  deckName:   'Default',
  css:        '.card { font-family: arial; }',
  factor:     2500,
  interval:   1,
  note:       nextNoteId - 1,
  type:       0,
  queue:      0,
  due:        0,
  reps:       0,
  lapses:     0,
  left:       0,
  mod:        Date.now(),
  ...overrides,
});

// ─── Mock State (in-memory store) ────────────────────────────────────────────

export const mockAnkiState = {
  decks: ['Default', 'Test Deck', 'My::Nested::Deck'] as string[],
  models: ['Basic', 'Basic (and reversed card)', 'Cloze'] as string[],
  notes: [] as AnkiNote[],
  cards: [] as AnkiCard[],
  tags: ['important', 'review', 'marked'] as string[],
  version: 6,
  connected: true,

  reset() {
    this.decks   = ['Default', 'Test Deck', 'My::Nested::Deck'];
    this.models  = ['Basic', 'Basic (and reversed card)', 'Cloze'];
    this.notes   = [];
    this.cards   = [];
    this.tags    = ['important', 'review', 'marked'];
    this.connected = true;
    nextNoteId   = 1000000000;
    nextCardId   = 1000000001;
    nextDeckId   = 1;
    nextModelId  = 1;
  },
};

// ─── Helper: build a successful response ─────────────────────────────────────

const success = <T>(result: T): AnkiConnectResponse<T> => ({
  result,
  error: null,
});

const failure = <T>(error: string): AnkiConnectResponse<T> => ({
  result: null as unknown as T,
  error,
});

// ─── AnkiConnect Mock Class ───────────────────────────────────────────────────

export class AnkiConnect {
  private baseUrl: string;
  private apiVersion: number;

  constructor(baseUrl = 'http://localhost:8765', apiVersion = 6) {
    this.baseUrl    = baseUrl;
    this.apiVersion = apiVersion;
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  version = jest.fn().mockImplementation(
    async (): Promise<AnkiConnectResponse<number>> =>
      mockAnkiState.connected
        ? success(mockAnkiState.version)
        : failure('failed to issue request'),
  );

  requestPermission = jest.fn().mockResolvedValue(
    success({ permission: 'granted', requireApikey: false, version: 6 }),
  );

  // ── Decks ──────────────────────────────────────────────────────────────────

  deckNames = jest.fn().mockImplementation(
    async (): Promise<AnkiConnectResponse<string[]>> =>
      success([...mockAnkiState.decks]),
  );

  deckNamesAndIds = jest.fn().mockImplementation(
    async (): Promise<AnkiConnectResponse<Record<string, number>>> => {
      const result: Record<string, number> = {};
      mockAnkiState.decks.forEach((name, i) => { result[name] = i + 1; });
      return success(result);
    },
  );

  createDeck = jest.fn().mockImplementation(
    async (params: { deck: string }): Promise<AnkiConnectResponse<number>> => {
      if (!mockAnkiState.decks.includes(params.deck)) {
        mockAnkiState.decks.push(params.deck);
      }
      return success(nextDeckId++);
    },
  );

  deleteDecks = jest.fn().mockImplementation(
    async (params: {
      decks: string[];
      cardsToo: boolean;
    }): Promise<AnkiConnectResponse<null>> => {
      mockAnkiState.decks = mockAnkiState.decks.filter(
        (d) => !params.decks.includes(d),
      );
      if (params.cardsToo) {
        mockAnkiState.notes = mockAnkiState.notes.filter(
          (n) => !params.decks.includes(n.deckName),
        );
      }
      return success(null);
    },
  );

  getDeckStats = jest.fn().mockImplementation(
    async (params: {
      decks: string[];
    }): Promise<AnkiConnectResponse<Record<string, DeckStats>>> => {
      const result: Record<string, DeckStats> = {};
      params.decks.forEach((name, i) => {
        result[String(i + 1)] = {
          deck_id: i + 1,
          name,
          update_sequence_num: 0,
          learn_count:  0,
          review_count: 0,
          new_count:    0,
          total_in_deck: mockAnkiState.notes.filter(
            (n) => n.deckName === name,
          ).length,
        };
      });
      return success(result);
    },
  );

  changeDeck = jest.fn().mockImplementation(
    async (params: {
      cards: number[];
      deck: string;
    }): Promise<AnkiConnectResponse<null>> => {
      mockAnkiState.notes.forEach((note) => {
        if (note.cards.some((c) => params.cards.includes(c))) {
          note.deckName = params.deck;
        }
      });
      return success(null);
    },
  );

  // ── Models ─────────────────────────────────────────────────────────────────

  modelNames = jest.fn().mockImplementation(
    async (): Promise<AnkiConnectResponse<string[]>> =>
      success([...mockAnkiState.models]),
  );

  modelNamesAndIds = jest.fn().mockImplementation(
    async (): Promise<AnkiConnectResponse<Record<string, number>>> => {
      const result: Record<string, number> = {};
      mockAnkiState.models.forEach((name, i) => { result[name] = i + 1; });
      return success(result);
    },
  );

  modelFieldNames = jest.fn().mockImplementation(
    async (params: {
      modelName: string;
    }): Promise<AnkiConnectResponse<string[]>> => {
      const fieldMap: Record<string, string[]> = {
        'Basic':                        ['Front', 'Back'],
        'Basic (and reversed card)':    ['Front', 'Back'],
        'Cloze':                        ['Text', 'Back Extra'],
      };
      const fields = fieldMap[params.modelName];
      return fields
        ? success(fields)
        : failure(`Model '${params.modelName}' not found`);
    },
  );

  modelTemplates = jest.fn().mockImplementation(
    async (params: {
      modelName: string;
    }): Promise<AnkiConnectResponse<Record<string, ModelTemplate>>> =>
      success({
        Card1: {
          Front: '{{Front}}',
          Back:  '{{FrontSide}}<hr id="answer">{{Back}}',
        },
      }),
  );

  modelStyling = jest.fn().mockResolvedValue(
    success({ css: '.card { font-family: arial; font-size: 20px; }' }),
  );

  createModel = jest.fn().mockImplementation(
    async (params: {
      modelName: string;
      inOrderFields: string[];
      css?: string;
      isCloze?: boolean;
      cardTemplates: Array<{ Name: string; Front: string; Back: string }>;
    }): Promise<AnkiConnectResponse<AnkiModel>> => {
      mockAnkiState.models.push(params.modelName);
      return success({
        id:        String(nextModelId++),
        name:      params.modelName,
        fields:    params.inOrderFields,
        templates: {},
        css:       params.css ?? '',
        isCloze:   params.isCloze ?? false,
      });
    },
  );

  // ── Notes ──────────────────────────────────────────────────────────────────

  addNote = jest.fn().mockImplementation(
    async (params: { note: NoteToAdd }): Promise<AnkiConnectResponse<number>> => {
      const { note } = params;

      if (!mockAnkiState.decks.includes(note.deckName)) {
        return failure(`Deck '${note.deckName}' not found`);
      }

      const noteId   = nextNoteId++;
      const cardId   = nextCardId++;
      const fields: AnkiNote['fields'] = {};

      Object.entries(note.fields).forEach(([key, val], i) => {
        fields[key] = { value: val, order: i };
      });

      const newNote: AnkiNote = {
        noteId,
        modelName: note.modelName,
        deckName:  note.deckName,
        fields,
        tags:  note.tags  ?? [],
        cards: [cardId],
      };

      mockAnkiState.notes.push(newNote);
      return success(noteId);
    },
  );

  addNotes = jest.fn().mockImplementation(
    async (params: {
      notes: NoteToAdd[];
    }): Promise<AnkiConnectResponse<(number | null)[]>> => {
      const results: (number | null)[] = [];
      for (const note of params.notes) {
        if (!mockAnkiState.decks.includes(note.deckName)) {
          results.push(null);
          continue;
        }
        const noteId = nextNoteId++;
        const cardId = nextCardId++;
        const fields: AnkiNote['fields'] = {};

        Object.entries(note.fields).forEach(([key, val], i) => {
          fields[key] = { value: val, order: i };
        });

        mockAnkiState.notes.push({
          noteId,
          modelName: note.modelName,
          deckName:  note.deckName,
          fields,
          tags:  note.tags  ?? [],
          cards: [cardId],
        });
        results.push(noteId);
      }
      return success(results);
    },
  );

  canAddNotes = jest.fn().mockImplementation(
    async (params: {
      notes: NoteToAdd[];
    }): Promise<AnkiConnectResponse<boolean[]>> =>
      success(params.notes.map(() => true)),
  );

  canAddNotesWithErrorDetail = jest.fn().mockImplementation(
    async (params: { notes: NoteToAdd[] }) =>
      success(
        params.notes.map(() => ({
          canAdd: true,
          error:  null,
        })),
      ),
  );

  updateNoteFields = jest.fn().mockImplementation(
    async (params: {
      note: { id: number; fields: NoteFields };
    }): Promise<AnkiConnectResponse<null>> => {
      const note = mockAnkiState.notes.find(
        (n) => n.noteId === params.note.id,
      );
      if (!note) return failure(`Note ${params.note.id} not found`);

      Object.entries(params.note.fields).forEach(([key, val]) => {
        if (note.fields[key]) {
          note.fields[key].value = val;
        } else {
          note.fields[key] = { value: val, order: Object.keys(note.fields).length };
        }
      });

      return success(null);
    },
  );

  updateNote = jest.fn().mockImplementation(
    async (params: {
      note: {
        id: number;
        fields?: NoteFields;
        tags?: string[];
      };
    }): Promise<AnkiConnectResponse<null>> => {
      const note = mockAnkiState.notes.find(
        (n) => n.noteId === params.note.id,
      );
      if (!note) return failure(`Note ${params.note.id} not found`);

      if (params.note.fields) {
        Object.entries(params.note.fields).forEach(([key, val]) => {
          note.fields[key] = {
            value: val,
            order: note.fields[key]?.order ?? Object.keys(note.fields).length,
          };
        });
      }

      if (params.note.tags) {
        note.tags = params.note.tags;
      }

      return success(null);
    },
  );

  deleteNotes = jest.fn().mockImplementation(
    async (params: {
      notes: number[];
    }): Promise<AnkiConnectResponse<null>> => {
      mockAnkiState.notes = mockAnkiState.notes.filter(
        (n) => !params.notes.includes(n.noteId),
      );
      return success(null);
    },
  );

  notesInfo = jest.fn().mockImplementation(
    async (params: {
      notes: number[];
    }): Promise<AnkiConnectResponse<AnkiNote[]>> => {
      const found = params.notes.map(
        (id) =>
          mockAnkiState.notes.find((n) => n.noteId === id) ??
          ({ noteId: id, error: 'not found' } as unknown as AnkiNote),
      );
      return success(found);
    },
  );

  findNotes = jest.fn().mockImplementation(
    async (params: {
      query: string;
    }): Promise<AnkiConnectResponse<number[]>> => {
      // Minimal query parsing: supports 'deck:X' and 'tag:X'
      let results = [...mockAnkiState.notes];

      const deckMatch = params.query.match(/deck:"?([^"]+)"?/);
      if (deckMatch) {
        results = results.filter((n) => n.deckName === deckMatch[1]);
      }

      const tagMatch = params.query.match(/tag:"?([^"]+)"?/);
      if (tagMatch) {
        results = results.filter((n) => n.tags.includes(tagMatch[1]));
      }

      if (params.query === '*' || params.query === '') {
        results = [...mockAnkiState.notes];
      }

      return success(results.map((n) => n.noteId));
    },
  );

  // ── Cards ──────────────────────────────────────────────────────────────────

  findCards = jest.fn().mockImplementation(
    async (params: {
      query: string;
    }): Promise<AnkiConnectResponse<number[]>> => {
      const cardIds = mockAnkiState.notes.flatMap((n) => n.cards);
      return success(cardIds);
    },
  );

  cardsInfo = jest.fn().mockImplementation(
    async (params: {
      cards: number[];
    }): Promise<AnkiConnectResponse<AnkiCard[]>> =>
      success(params.cards.map((id) => createMockCard({ cardId: id }))),
  );

  cardsToNotes = jest.fn().mockImplementation(
    async (params: {
      cards: number[];
    }): Promise<AnkiConnectResponse<number[]>> => {
      const noteIds = mockAnkiState.notes
        .filter((n) => n.cards.some((c) => params.cards.includes(c)))
        .map((n) => n.noteId);
      return success(noteIds);
    },
  );

  suspend = jest.fn().mockImplementation(
    async (params: {
      cards: number[];
    }): Promise<AnkiConnectResponse<boolean>> => success(true),
  );

  unsuspend = jest.fn().mockImplementation(
    async (params: {
      cards: number[];
    }): Promise<AnkiConnectResponse<boolean>> => success(true),
  );

  areSuspended = jest.fn().mockImplementation(
    async (params: {
      cards: number[];
    }): Promise<AnkiConnectResponse<(boolean | null)[]>> =>
      success(params.cards.map(() => false)),
  );

  areDue = jest.fn().mockImplementation(
    async (params: {
      cards: number[];
    }): Promise<AnkiConnectResponse<boolean[]>> =>
      success(params.cards.map(() => true)),
  );

  getEaseFactors = jest.fn().mockImplementation(
    async (params: {
      cards: number[];
    }): Promise<AnkiConnectResponse<number[]>> =>
      success(params.cards.map(() => 2500)),
  );

  setEaseFactors = jest.fn().mockImplementation(
    async (params: {
      cards: number[];
      easeFactors: number[];
    }): Promise<AnkiConnectResponse<boolean[]>> =>
      success(params.cards.map(() => true)),
  );

  // ── Tags ───────────────────────────────────────────────────────────────────

  getTags = jest.fn().mockImplementation(
    async (): Promise<AnkiConnectResponse<string[]>> =>
      success([...mockAnkiState.tags]),
  );

  addTags = jest.fn().mockImplementation(
    async (params: {
      notes: number[];
      tags: string;
    }): Promise<AnkiConnectResponse<null>> => {
      const newTags = params.tags.split(' ').filter(Boolean);

      mockAnkiState.notes.forEach((note) => {
        if (params.notes.includes(note.noteId)) {
          newTags.forEach((tag) => {
            if (!note.tags.includes(tag)) note.tags.push(tag);
            if (!mockAnkiState.tags.includes(tag)) mockAnkiState.tags.push(tag);
          });
        }
      });

      return success(null);
    },
  );

  removeTags = jest.fn().mockImplementation(
    async (params: {
      notes: number[];
      tags: string;
    }): Promise<AnkiConnectResponse<null>> => {
      const removedTags = params.tags.split(' ').filter(Boolean);

      mockAnkiState.notes.forEach((note) => {
        if (params.notes.includes(note.noteId)) {
          note.tags = note.tags.filter((t) => !removedTags.includes(t));
        }
      });

      return success(null);
    },
  );

  clearUnusedTags = jest.fn().mockImplementation(
    async (): Promise<AnkiConnectResponse<null>> => {
      const usedTags = new Set(mockAnkiState.notes.flatMap((n) => n.tags));
      mockAnkiState.tags = mockAnkiState.tags.filter((t) => usedTags.has(t));
      return success(null);
    },
  );

  // ── Media ──────────────────────────────────────────────────────────────────

  storeMediaFile = jest.fn().mockImplementation(
    async (params: {
      filename: string;
      data?: string;
      url?: string;
      path?: string;
      deleteExisting?: boolean;
    }): Promise<AnkiConnectResponse<string>> => success(params.filename),
  );

  retrieveMediaFile = jest.fn().mockImplementation(
    async (params: {
      filename: string;
    }): Promise<AnkiConnectResponse<string | false>> => success(false),
  );

  getMediaFilesNames = jest.fn().mockImplementation(
    async (params: {
      pattern: string;
    }): Promise<AnkiConnectResponse<string[]>> => success([]),
  );

  deleteMediaFile = jest.fn().mockImplementation(
    async (params: {
      filename: string;
    }): Promise<AnkiConnectResponse<null>> => success(null),
  );

  // ── GUI ────────────────────────────────────────────────────────────────────

  guiBrowse = jest.fn().mockImplementation(
    async (params: {
      query: string;
    }): Promise<AnkiConnectResponse<number[]>> =>
      success(mockAnkiState.notes.map((n) => n.noteId)),
  );

  guiCurrentCard = jest.fn().mockResolvedValue(
    success(createMockCard()),
  );

  guiStartCardTimer = jest.fn().mockResolvedValue(success(true));

  guiShowQuestion = jest.fn().mockResolvedValue(success(true));

  guiShowAnswer = jest.fn().mockResolvedValue(success(true));

  guiAnswerCard = jest.fn().mockImplementation(
    async (params: { ease: 1 | 2 | 3 | 4 }): Promise<AnkiConnectResponse<boolean>> =>
      success(true),
  );

  guiDeckOverview = jest.fn().mockImplementation(
    async (params: { name: string }): Promise<AnkiConnectResponse<boolean>> =>
      success(true),
  );

  guiDeckBrowser = jest.fn().mockResolvedValue(success(null));

  guiSelectNote = jest.fn().mockImplementation(
    async (params: { note: number }): Promise<AnkiConnectResponse<boolean>> =>
      success(true),
  );

  guiEditNote = jest.fn().mockImplementation(
    async (params: { note: number }): Promise<AnkiConnectResponse<null>> =>
      success(null),
  );

  // ── Sync ───────────────────────────────────────────────────────────────────

  sync = jest.fn().mockResolvedValue(success(null));

  getProfiles = jest.fn().mockResolvedValue(
    success(['User 1', 'Test Profile']),
  );

  loadProfile = jest.fn().mockImplementation(
    async (params: { name: string }): Promise<AnkiConnectResponse<boolean>> =>
      success(true),
  );
}

// ─── Standalone Mock Fetch Handler ───────────────────────────────────────────
// Use this if your code calls fetch() directly instead of a class method.

export const createAnkiConnectFetchMock = () => {
  const instance = new AnkiConnect();

  return jest.fn().mockImplementation(
    async (url: string, options: RequestInit): Promise<Response> => {
      const body = JSON.parse(options.body as string) as {
        action: string;
        version: number;
        params?: Record<string, unknown>;
      };

      const actionMap: Record<string, (p: any) => Promise<AnkiConnectResponse<unknown>>> = {
        version:                   () => instance.version(),
        deckNames:                 () => instance.deckNames(),
        deckNamesAndIds:           () => instance.deckNamesAndIds(),
        createDeck:                (p) => instance.createDeck(p),
        deleteDecks:               (p) => instance.deleteDecks(p),
        getDeckStats:              (p) => instance.getDeckStats(p),
        changeDeck:                (p) => instance.changeDeck(p),
        modelNames:                () => instance.modelNames(),
        modelNamesAndIds:          () => instance.modelNamesAndIds(),
        modelFieldNames:           (p) => instance.modelFieldNames(p),
        createModel:               (p) => instance.createModel(p),
        addNote:                   (p) => instance.addNote(p),
        addNotes:                  (p) => instance.addNotes(p),
        canAddNotes:               (p) => instance.canAddNotes(p),
        updateNoteFields:          (p) => instance.updateNoteFields(p),
        updateNote:                (p) => instance.updateNote(p),
        deleteNotes:               (p) => instance.deleteNotes(p),
        notesInfo:                 (p) => instance.notesInfo(p),
        findNotes:                 (p) => instance.findNotes(p),
        findCards:                 (p) => instance.findCards(p),
        cardsInfo:                 (p) => instance.cardsInfo(p),
        cardsToNotes:              (p) => instance.cardsToNotes(p),
        suspend:                   (p) => instance.suspend(p),
        unsuspend:                 (p) => instance.unsuspend(p),
        getTags:                   () => instance.getTags(),
        addTags:                   (p) => instance.addTags(p),
        removeTags:                (p) => instance.removeTags(p),
        clearUnusedTags:           () => instance.clearUnusedTags(),
        storeMediaFile:            (p) => instance.storeMediaFile(p),
        retrieveMediaFile:         (p) => instance.retrieveMediaFile(p),
        deleteMediaFile:           (p) => instance.deleteMediaFile(p),
        sync:                      () => instance.sync(),
        guiBrowse:                 (p) => instance.guiBrowse(p),
        guiCurrentCard:            () => instance.guiCurrentCard(),
        guiAnswerCard:             (p) => instance.guiAnswerCard(p),
      };

      const handler = actionMap[body.action];
      const response = handler
        ? await handler(body.params ?? {})
        : failure(`Unknown action: ${body.action}`);

      return new Response(JSON.stringify(response), {
        status:  200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  );
};

// ─── Default Export ───────────────────────────────────────────────────────────

export default AnkiConnect;