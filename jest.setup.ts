import { mockAnkiState } from './__mocks__/anki-connect';

beforeEach(() => {
  jest.clearAllMocks();
  mockAnkiState.reset(); // wipe all notes/decks between tests
});