/**
 * @jest-environment jsdom
 */
import {
    CardFile,
    CardFileMismatchError,
    CardFileInvalidCardError,
    type CardSourceLocation,
    locateCards,
    applyCardFieldUpdates,
    filterValidCards,
} from '../src/obsidian-card';
import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import { parseCards } from '../src/parser';
import type { ParsedCard } from '../src/parser';

// ─── Typed aliases for mocked values ─────────────────────────────────────────

// Delegates to __mocks__/obsidian.ts automatically.
jest.mock('obsidian');
jest.mock('../src/parser');

const mockParseCards = parseCards as jest.MockedFunction<typeof parseCards>;
const mockRender = MarkdownRenderer.render as jest.MockedFunction<
    typeof MarkdownRenderer.render
>;


// ─── Factory helpers ──────────────────────────────────────────────────────────

/** Minimal ParsedCard stub. */
function makeCard(valid = true): ParsedCard {
    return { valid, text: ['Test question'] } as unknown as ParsedCard;
}

/**
 * Builds a fresh App-like object with controllable vault methods.
 * Each call returns an independent instance.
 */
function makeApp(markdown = ''): App {
    return {
        vault: {
            read: jest.fn().mockResolvedValue(markdown),
            modify: jest.fn().mockResolvedValue(undefined),
            getName: jest.fn().mockReturnValue('test-vault'),
        },
    } as unknown as App;
}

/** Minimal TFile stub. */
function makeFile(path = 'test.md'): TFile {
    return { path } as unknown as TFile;
}

// ─── Markdown fixtures ────────────────────────────────────────────────────────

/** Single card, no metadata sub-block. */
const SINGLE_CARD_MD = '> [!card]\n> Question text';

/** Two cards separated by a blank line, no metadata. */
const TWO_CARDS_MD = '> [!card]\n> First\n\n> [!card]\n> Second';

/** Single card with an existing two-line metadata block. */
const CARD_WITH_META_MD = '> [!card]\n> Question\n>> [!card-metadata]-\n>> id: existing-id';

// ─── Global hooks ─────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
    mockRender.mockResolvedValue(undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// locateCards
// ═════════════════════════════════════════════════════════════════════════════

describe('locateCards', () => {
    it('returns an empty array for an empty string', () => {
        expect(locateCards('')).toEqual([]);
    });

    it('returns an empty array when no [!card] callouts exist', () => {
        expect(locateCards('# Heading\n\nJust prose.')).toEqual([]);
    });

    it('does NOT treat a level-2 >> line as a card header', () => {
        expect(locateCards('>> [!card]\n>> nested')).toHaveLength(0);
    });

    it('does NOT treat "> > [!card]" (spaced level-2) as a card header', () => {
        expect(locateCards('> > [!card]\n> > content')).toHaveLength(0);
    });

    it('locates a single card with no metadata sub-block', () => {
        expect(locateCards(SINGLE_CARD_MD)).toEqual<CardSourceLocation[]>([
            { cardStart: 0, cardEnd: 1, metaStart: -1, metaEnd: -1 },
        ]);
    });

    it('sets metaStart and metaEnd to -1 when no metadata block exists', () => {
        const [loc] = locateCards(SINGLE_CARD_MD);
        expect(loc!.metaStart).toBe(-1);
        expect(loc!.metaEnd).toBe(-1);
    });

    it('matches the collapsible [!card]- variant', () => {
        const locs = locateCards('> [!card]-\n> Question');
        expect(locs).toHaveLength(1);
        expect(locs[0]!.cardStart).toBe(0);
    });

    it('matches [!card] case-insensitively', () => {
        expect(locateCards('> [!CARD]\n> Q')).toHaveLength(1);
        expect(locateCards('> [!Card]-\n> Q')).toHaveLength(1);
    });

    it('locates a card whose metadata block immediately follows the header', () => {
        const md = '> [!card]\n>> [!card-metadata]-\n>> id: 1\n>> due: 2024';
        expect(locateCards(md)).toEqual<CardSourceLocation[]>([
            { cardStart: 0, cardEnd: 3, metaStart: 1, metaEnd: 3 },
        ]);
    });

    it('locates a card whose metadata block follows body content', () => {
        expect(locateCards(CARD_WITH_META_MD)).toEqual<CardSourceLocation[]>([
            { cardStart: 0, cardEnd: 3, metaStart: 2, metaEnd: 3 },
        ]);
    });

    it('records the last field line as metaEnd for a multi-field metadata block', () => {
        const md = [
            '> [!card]',
            '> Q',
            '>> [!card-metadata]-',
            '>> id: 1',
            '>> due: tomorrow',
            '>> ease: 2.5',
        ].join('\n');
        const [loc] = locateCards(md);
        expect(loc!.metaStart).toBe(2);
        expect(loc!.metaEnd).toBe(5);
        expect(loc!.cardEnd).toBe(5);
    });

    it('locates two cards in document order', () => {
        const locs = locateCards(TWO_CARDS_MD);
        expect(locs).toHaveLength(2);
        expect(locs[0]).toEqual<CardSourceLocation>({
            cardStart: 0, cardEnd: 1, metaStart: -1, metaEnd: -1,
        });
        expect(locs[1]).toEqual<CardSourceLocation>({
            cardStart: 3, cardEnd: 4, metaStart: -1, metaEnd: -1,
        });
    });

    it('handles cards separated by non-callout prose', () => {
        const md = '> [!card]\n> A\n\nSome prose.\n\n> [!card]\n> B';
        const locs = locateCards(md);
        expect(locs).toHaveLength(2);
        expect(locs[0]).toMatchObject({ cardStart: 0, cardEnd: 1 });
        expect(locs[1]).toMatchObject({ cardStart: 5, cardEnd: 6 });
    });

    it('ignores leading non-card content when computing cardStart', () => {
        const locs = locateCards('# Title\n\n> [!card]\n> Q');
        expect(locs).toHaveLength(1);
        expect(locs[0]!.cardStart).toBe(2);
    });

    it('handles Windows-style CRLF line endings', () => {
        const locs = locateCards('> [!card]\r\n> Content');
        expect(locs).toHaveLength(1);
        expect(locs[0]).toMatchObject({ cardStart: 0, cardEnd: 1 });
    });

    it('produces the correct count for three consecutive cards', () => {
        const md = [
            '> [!card]',
            '> Q1',
            '',
            '> [!card]',
            '> Q2',
            '',
            '> [!card]',
            '> Q3',
        ].join('\n');
        expect(locateCards(md)).toHaveLength(3);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// applyCardFieldUpdates
// ═════════════════════════════════════════════════════════════════════════════

describe('applyCardFieldUpdates', () => {
    const noMetaLoc: CardSourceLocation = {
        cardStart: 0, cardEnd: 1, metaStart: -1, metaEnd: -1,
    };

    // ── Empty fields ──────────────────────────────────────────────────────────

    it('returns the original string unchanged when fields is empty', () => {
        expect(applyCardFieldUpdates(SINGLE_CARD_MD, noMetaLoc, {})).toBe(SINGLE_CARD_MD);
    });

    // ── No existing metadata block ────────────────────────────────────────────

    it('inserts a metadata header directly after the card header', () => {
        const lines = applyCardFieldUpdates(SINGLE_CARD_MD, noMetaLoc, { id: '42' }).split('\n');
        expect(lines[0]).toBe('> [!card]');
        expect(lines[1]).toBe('>> [!card-metadata]-');
        expect(lines[2]).toBe('>> id: 42');
        expect(lines[3]).toBe('> Question text');
    });

    it('writes all provided fields when creating the block from scratch', () => {
        const lines = applyCardFieldUpdates(SINGLE_CARD_MD, noMetaLoc, {
            id: '1', due: '2024-01-01',
        }).split('\n');
        expect(lines[1]).toBe('>> [!card-metadata]-');
        expect(lines[2]).toBe('>> id: 1');
        expect(lines[3]).toBe('>> due: 2024-01-01');
        expect(lines[4]).toBe('> Question text');
    });

    it('only modifies the targeted card when multiple cards are present', () => {
        const secondLoc: CardSourceLocation = {
            cardStart: 3, cardEnd: 4, metaStart: -1, metaEnd: -1,
        };
        const lines = applyCardFieldUpdates(TWO_CARDS_MD, secondLoc, { id: 'B' }).split('\n');
        // First card is untouched
        expect(lines[0]).toBe('> [!card]');
        expect(lines[1]).toBe('> First');
        expect(lines[2]).toBe('');
        // Second card gains metadata
        expect(lines[3]).toBe('> [!card]');
        expect(lines[4]).toBe('>> [!card-metadata]-');
        expect(lines[5]).toBe('>> id: B');
        expect(lines[6]).toBe('> Second');
    });

    // ── Existing metadata block ───────────────────────────────────────────────

    describe('when a metadata block already exists', () => {
        const metaLoc: CardSourceLocation = {
            cardStart: 0, cardEnd: 3, metaStart: 2, metaEnd: 3,
        };

        it('replaces an existing field value in-place without changing line count', () => {
            const lines = applyCardFieldUpdates(CARD_WITH_META_MD, metaLoc, { id: 'new-id' }).split('\n');
            expect(lines[3]).toBe('>> id: new-id');
            expect(lines).toHaveLength(4);
        });

        it('preserves card body lines and the metadata header line', () => {
            const lines = applyCardFieldUpdates(CARD_WITH_META_MD, metaLoc, { id: 'x' }).split('\n');
            expect(lines[0]).toBe('> [!card]');
            expect(lines[1]).toBe('> Question');
            expect(lines[2]).toBe('>> [!card-metadata]-');
        });

        it('appends a new field after the last existing metadata line', () => {
            const lines = applyCardFieldUpdates(CARD_WITH_META_MD, metaLoc, { due: '2024-06-01' }).split('\n');
            expect(lines[3]).toBe('>> id: existing-id');
            expect(lines[4]).toBe('>> due: 2024-06-01');
        });

        it('updates an existing field AND appends a new field in one call', () => {
            const lines = applyCardFieldUpdates(CARD_WITH_META_MD, metaLoc, {
                id: 'updated', due: '2024-06-01',
            }).split('\n');
            expect(lines[3]).toBe('>> id: updated');
            expect(lines[4]).toBe('>> due: 2024-06-01');
        });

        it('appends multiple new fields preserving document order of Object.entries', () => {
            const lines = applyCardFieldUpdates(CARD_WITH_META_MD, metaLoc, {
                ease: '2.5', interval: '10',
            }).split('\n');
            expect(lines[4]).toBe('>> ease: 2.5');
            expect(lines[5]).toBe('>> interval: 10');
        });

        it('handles flexible >> whitespace when matching existing field lines', () => {
            const md = '> [!card]\n> Q\n>> [!card-metadata]-\n> > id: old';
            const loc: CardSourceLocation = { cardStart: 0, cardEnd: 3, metaStart: 2, metaEnd: 3 };
            const result = applyCardFieldUpdates(md, loc, { id: 'new' });
            expect(result).toContain('>> id: new');
            expect(result).not.toContain('> > id: old');
        });
    });

    it('does not mutate the input markdown string', () => {
        const snapshot = SINGLE_CARD_MD;
        applyCardFieldUpdates(SINGLE_CARD_MD, noMetaLoc, { id: '1' });
        expect(SINGLE_CARD_MD).toBe(snapshot);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// filterValidCards
// ═════════════════════════════════════════════════════════════════════════════

describe('filterValidCards', () => {
    it('returns an empty array for empty input', () => {
        expect(filterValidCards([])).toEqual([]);
    });

    it('returns all cards when every card is valid', () => {
        const cards = [makeCard(true), makeCard(true)] as unknown as ParsedCard[];
        expect(filterValidCards(cards)).toHaveLength(2);
    });

    it('excludes cards whose valid property is false', () => {
        const valid = makeCard(true) as unknown as ParsedCard;
        const invalid = makeCard(false) as unknown as ParsedCard;
        expect(filterValidCards([valid, invalid])).toEqual([valid]);
    });

    it('returns an empty array when all cards are invalid', () => {
        const cards = [makeCard(false), makeCard(false)] as unknown as ParsedCard[];
        expect(filterValidCards(cards)).toEqual([]);
    });

    it('does not mutate the source array', () => {
        const cards = [makeCard(true), makeCard(false)] as unknown as ParsedCard[];
        const snapshot = [...cards];
        filterValidCards(cards);
        expect(cards).toEqual(snapshot);
    });

    it('returns a new array reference, not the original', () => {
        const cards = [makeCard(true)] as unknown as ParsedCard[];
        expect(filterValidCards(cards)).not.toBe(cards);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Error classes
// ═════════════════════════════════════════════════════════════════════════════

describe('CardFileMismatchError', () => {
    it('is an instance of Error', () => {
        expect(new CardFileMismatchError('f.md', 1, 2)).toBeInstanceOf(Error);
    });

    it('has name "CardFileMismatchError"', () => {
        expect(new CardFileMismatchError('f.md', 1, 2).name).toBe('CardFileMismatchError');
    });

    it('includes the file path, located count, and parsed count in the message', () => {
        const err = new CardFileMismatchError('notes/deck.md', 4, 7);
        expect(err.message).toContain('notes/deck.md');
        expect(err.message).toContain('4');
        expect(err.message).toContain('7');
    });
});

describe('CardFileInvalidCardError', () => {
    it('is an instance of Error', () => {
        expect(new CardFileInvalidCardError('f.md', '0')).toBeInstanceOf(Error);
    });

    it('has name "CardFileInvalidCardError"', () => {
        expect(new CardFileInvalidCardError('f.md', '0').name).toBe('CardFileInvalidCardError');
    });

    it('includes file path and failing indices in the message', () => {
        const err = new CardFileInvalidCardError('notes/deck.md', '1, 3');
        expect(err.message).toContain('notes/deck.md');
        expect(err.message).toContain('1, 3');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// CardFile
// ═════════════════════════════════════════════════════════════════════════════

describe('CardFile', () => {

    // ── load ──────────────────────────────────────────────────────────────────

    describe('load', () => {
        it('reads the file from the vault', async () => {
            const app = makeApp(SINGLE_CARD_MD);
            const file = makeFile();
            mockParseCards.mockReturnValue([makeCard()] as any);

            await CardFile.load(app, file);

            expect(app.vault.read).toHaveBeenCalledWith(file);
        });

        it('calls MarkdownRenderer.render with the raw markdown and file path', async () => {
            const app = makeApp(SINGLE_CARD_MD);
            const file = makeFile('notes/deck.md');
            mockParseCards.mockReturnValue([makeCard()] as any);

            await CardFile.load(app, file);

            expect(mockRender).toHaveBeenCalledWith(
                app,
                SINGLE_CARD_MD,
                expect.any(HTMLElement),
                'notes/deck.md',
                expect.any(Object),
            );
        });

        it('passes the vault name to parseCards', async () => {
            const app = makeApp(SINGLE_CARD_MD);
            (app.vault.getName as jest.Mock).mockReturnValue('my-vault');
            const file = makeFile();
            mockParseCards.mockReturnValue([makeCard()] as any);

            await CardFile.load(app, file);

            expect(mockParseCards).toHaveBeenCalledWith(
                expect.any(HTMLElement),
                'my-vault',
            );
        });

        it('calls load() then unload() on the Component', async () => {
            const load = jest.spyOn(Component.prototype, 'load').mockImplementation(() => undefined);
            const unload = jest.spyOn(Component.prototype, 'unload').mockImplementation(() => undefined);
            mockParseCards.mockReturnValue([makeCard()] as any);

            await CardFile.load(makeApp(SINGLE_CARD_MD), makeFile());

            expect(load).toHaveBeenCalledTimes(1);
            expect(unload).toHaveBeenCalledTimes(1);
        });

        it('unloads the Component even when MarkdownRenderer.render rejects', async () => {
            const unload = jest.spyOn(Component.prototype, 'unload').mockImplementation(() => undefined);
            mockRender.mockRejectedValueOnce(new Error('render failed'));

            await expect(
                CardFile.load(makeApp(SINGLE_CARD_MD), makeFile()),
            ).rejects.toThrow('render failed');

            expect(unload).toHaveBeenCalledTimes(1);
        });

        it('exposes the TFile via the file property', async () => {
            const file = makeFile('special.md');
            mockParseCards.mockReturnValue([makeCard()] as any);

            const cf = await CardFile.load(makeApp(SINGLE_CARD_MD), file);

            expect(cf.file).toBe(file);
        });

        it('populates cards with the result of parseCards', async () => {
            const card = makeCard();
            mockParseCards.mockReturnValue([card] as any);

            const cf = await CardFile.load(makeApp(SINGLE_CARD_MD), makeFile());

            expect(cf.cards).toHaveLength(1);
            expect(cf.cards[0]).toBe(card);
        });

        it('sets needsReload to false after a successful load', async () => {
            mockParseCards.mockReturnValue([makeCard()] as any);

            const cf = await CardFile.load(makeApp(SINGLE_CARD_MD), makeFile());

            expect(cf.needsReload).toBe(false);
        });

        it('throws CardFileMismatchError when locateCards finds more cards than parseCards returns', async () => {
            // SINGLE_CARD_MD → locateCards finds 1; mock returns 2
            mockParseCards.mockReturnValue([makeCard(), makeCard()] as any);

            await expect(
                CardFile.load(makeApp(SINGLE_CARD_MD), makeFile()),
            ).rejects.toThrow(CardFileMismatchError);
        });

        it('throws CardFileMismatchError when locateCards finds fewer cards than parseCards returns', async () => {
            // TWO_CARDS_MD → locateCards finds 2; mock returns 1
            mockParseCards.mockReturnValue([makeCard()] as any);

            await expect(
                CardFile.load(makeApp(TWO_CARDS_MD), makeFile()),
            ).rejects.toThrow(CardFileMismatchError);
        });

        it('throws CardFileInvalidCardError when any parsed card fails validation', async () => {
            mockParseCards.mockReturnValue([makeCard(false)] as any);

            await expect(
                CardFile.load(makeApp(SINGLE_CARD_MD), makeFile('bad.md')),
            ).rejects.toThrow(CardFileInvalidCardError);
        });

        it('CardFileInvalidCardError message includes the file path', async () => {
            mockParseCards.mockReturnValue([makeCard(false)] as any);

            await expect(
                CardFile.load(makeApp(SINGLE_CARD_MD), makeFile('notes/deck.md')),
            ).rejects.toThrow(/notes\/deck\.md/);
        });

        it('CardFileMismatchError message includes the file path', async () => {
            mockParseCards.mockReturnValue([makeCard(), makeCard()] as any);

            await expect(
                CardFile.load(makeApp(SINGLE_CARD_MD), makeFile('vault/cards.md')),
            ).rejects.toThrow(/vault\/cards\.md/);
        });

        it('throws CardFileInvalidCardError and reports the correct failing index', async () => {
            // Two valid cards in markup, second one invalid.
            mockParseCards.mockReturnValue([makeCard(true), makeCard(false)] as any);

            const err = await CardFile.load(makeApp(TWO_CARDS_MD), makeFile()).catch(e => e);

            expect(err).toBeInstanceOf(CardFileInvalidCardError);
            expect((err as CardFileInvalidCardError).message).toContain('1');
        });
    });

    // ── writeCard ─────────────────────────────────────────────────────────────

    describe('writeCard', () => {
        async function setupOne() {
            const card = makeCard();
            const app = makeApp(SINGLE_CARD_MD);
            const file = makeFile();
            mockParseCards.mockReturnValue([card] as any);
            const cf = await CardFile.load(app, file);
            return { card, app, file, cf };
        }

        it('calls vault.modify exactly once', async () => {
            const { card, app, cf } = await setupOne();
            await cf.writeCard(card as unknown as ParsedCard, { id: '99' });
            expect(app.vault.modify).toHaveBeenCalledTimes(1);
        });

        it('passes the TFile as the first argument to vault.modify', async () => {
            const { card, app, file, cf } = await setupOne();
            await cf.writeCard(card as unknown as ParsedCard, { id: '1' });
            expect(app.vault.modify).toHaveBeenCalledWith(file, expect.any(String));
        });

        it('written markdown contains the new metadata header', async () => {
            const { card, app, cf } = await setupOne();
            await cf.writeCard(card as unknown as ParsedCard, { id: '1' });
            const written = (app.vault.modify as jest.Mock).mock.calls[0][1] as string;
            expect(written).toContain('>> [!card-metadata]-');
        });

        it('written markdown contains the new field value', async () => {
            const { card, app, cf } = await setupOne();
            await cf.writeCard(card as unknown as ParsedCard, { id: '99' });
            const written = (app.vault.modify as jest.Mock).mock.calls[0][1] as string;
            expect(written).toContain('>> id: 99');
        });

        it('sets needsReload to true after a successful write', async () => {
            const { card, cf } = await setupOne();
            await cf.writeCard(card as unknown as ParsedCard, { id: '1' });
            expect(cf.needsReload).toBe(true);
        });

        it('still calls vault.modify (no-op content write) when fields is empty', async () => {
            // The only early-exit is updates.length === 0; empty fields still reach vault.modify.
            const { card, app, cf } = await setupOne();
            await cf.writeCard(card as unknown as ParsedCard, {});
            expect(app.vault.modify).toHaveBeenCalledTimes(1);
            const written = (app.vault.modify as jest.Mock).mock.calls[0][1] as string;
            expect(written).toBe(SINGLE_CARD_MD);
        });
    });

    // ── writeCards ────────────────────────────────────────────────────────────

    describe('writeCards', () => {
        it('short-circuits and skips vault.modify when updates array is empty', async () => {
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([makeCard()] as any);
            const cf = await CardFile.load(app, makeFile());

            await cf.writeCards([]);

            expect(app.vault.modify).not.toHaveBeenCalled();
            expect(cf.needsReload).toBe(false);
        });

        it('throws "Card does not belong to this CardFile" for an alien card reference', async () => {
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([makeCard()] as any);
            const cf = await CardFile.load(app, makeFile());
            const alien = makeCard() as unknown as ParsedCard;

            await expect(
                cf.writeCards([{ card: alien, fields: { id: '1' } }]),
            ).rejects.toThrow('Card does not belong to this CardFile.');
        });

        it('throws out-of-sync error when needsReload is already true', async () => {
            const card = makeCard();
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([card] as any);
            const cf = await CardFile.load(app, makeFile());

            await cf.writeCard(card as unknown as ParsedCard, { id: '1' });
            // needsReload is now true

            await expect(
                cf.writeCard(card as unknown as ParsedCard, { id: '2' }),
            ).rejects.toThrow('CardFile is out of sync');
        });

        it('merges fields when the same card appears multiple times in one batch', async () => {
            const card = makeCard();
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([card] as any);
            const cf = await CardFile.load(app, makeFile());

            await cf.writeCards([
                { card: card as unknown as ParsedCard, fields: { id: '1' } },
                { card: card as unknown as ParsedCard, fields: { due: 'tomorrow' } },
            ]);

            const written = (app.vault.modify as jest.Mock).mock.calls[0][1] as string;
            expect(written).toContain('>> id: 1');
            expect(written).toContain('>> due: tomorrow');
        });

        it('writes updates for multiple distinct cards in a single vault.modify call', async () => {
            const card1 = makeCard();
            const card2 = makeCard();
            const app = makeApp(TWO_CARDS_MD);
            mockParseCards.mockReturnValue([card1, card2] as any);
            const cf = await CardFile.load(app, makeFile());

            await cf.writeCards([
                { card: card1 as unknown as ParsedCard, fields: { id: 'A' } },
                { card: card2 as unknown as ParsedCard, fields: { id: 'B' } },
            ]);

            expect(app.vault.modify).toHaveBeenCalledTimes(1);
            const written = (app.vault.modify as jest.Mock).mock.calls[0][1] as string;
            expect(written).toContain('>> id: A');
            expect(written).toContain('>> id: B');
        });

        it('queues writes serially and rejects the second when the first set needsReload', async () => {
            const card1 = makeCard();
            const card2 = makeCard();
            const app = makeApp(TWO_CARDS_MD);
            mockParseCards.mockReturnValue([card1, card2] as any);
            const cf = await CardFile.load(app, makeFile());

            // Dispatch both without awaiting between them.
            const p1 = cf.writeCard(card1 as unknown as ParsedCard, { id: '1' });
            const p2 = cf.writeCard(card2 as unknown as ParsedCard, { id: '2' });

            await p1;
            await expect(p2).rejects.toThrow('CardFile is out of sync');
        });

        it('later field value wins when the same key appears in both batched entries', async () => {
            const card = makeCard();
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([card] as any);
            const cf = await CardFile.load(app, makeFile());

            await cf.writeCards([
                { card: card as unknown as ParsedCard, fields: { id: 'first' } },
                { card: card as unknown as ParsedCard, fields: { id: 'second' } },
            ]);

            const written = (app.vault.modify as jest.Mock).mock.calls[0][1] as string;
            expect(written).toContain('>> id: second');
            expect(written).not.toContain('>> id: first');
        });
    });

    // ── reload ────────────────────────────────────────────────────────────────

    describe('reload', () => {
        it('calls vault.read a second time', async () => {
            const card = makeCard();
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([card] as any);
            const cf = await CardFile.load(app, makeFile());

            mockParseCards.mockReturnValue([makeCard()] as any);
            await cf.reload();

            expect(app.vault.read).toHaveBeenCalledTimes(2);
        });

        it('clears needsReload back to false', async () => {
            const card = makeCard();
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([card] as any);
            const cf = await CardFile.load(app, makeFile());

            await cf.writeCard(card as unknown as ParsedCard, { id: '1' });
            expect(cf.needsReload).toBe(true);

            mockParseCards.mockReturnValue([makeCard()] as any);
            await cf.reload();

            expect(cf.needsReload).toBe(false);
        });

        it('replaces the in-memory cards with freshly parsed ones', async () => {
            const oldCard = makeCard();
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([oldCard] as any);
            const cf = await CardFile.load(app, makeFile());

            const newCard = makeCard();
            mockParseCards.mockReturnValue([newCard] as any);
            await cf.reload();

            expect(cf.cards[0]).toBe(newCard);
            expect(cf.cards[0]).not.toBe(oldCard);
        });

        it('enables a subsequent write after clearing needsReload', async () => {
            const card = makeCard();
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([card] as any);
            const cf = await CardFile.load(app, makeFile());

            await cf.writeCard(card as unknown as ParsedCard, { id: '1' });

            // Reload with the same card reference so indexOf succeeds on next write.
            (app.vault.read as jest.Mock).mockResolvedValue(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([card] as any);
            await cf.reload();

            await expect(
                cf.writeCard(card as unknown as ParsedCard, { id: '2' }),
            ).resolves.toBeUndefined();
        });

        it('throws if the reloaded file has a card count mismatch', async () => {
            const card = makeCard();
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([card] as any);
            const cf = await CardFile.load(app, makeFile());

            // Reload returns two cards for a single-card file
            mockParseCards.mockReturnValue([makeCard(), makeCard()] as any);

            await expect(cf.reload()).rejects.toThrow(CardFileMismatchError);
        });
    });

    // ── needsReload ───────────────────────────────────────────────────────────

    describe('needsReload', () => {
        it('is false immediately after load', async () => {
            mockParseCards.mockReturnValue([makeCard()] as any);
            const cf = await CardFile.load(makeApp(SINGLE_CARD_MD), makeFile());
            expect(cf.needsReload).toBe(false);
        });

        it('becomes true after a successful writeCard', async () => {
            const card = makeCard();
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([card] as any);
            const cf = await CardFile.load(app, makeFile());

            await cf.writeCard(card as unknown as ParsedCard, { id: '1' });

            expect(cf.needsReload).toBe(true);
        });

        it('stays false after writeCards([])', async () => {
            mockParseCards.mockReturnValue([makeCard()] as any);
            const cf = await CardFile.load(makeApp(SINGLE_CARD_MD), makeFile());

            await cf.writeCards([]);

            expect(cf.needsReload).toBe(false);
        });

        it('returns to false after reload()', async () => {
            const card = makeCard();
            const app = makeApp(SINGLE_CARD_MD);
            mockParseCards.mockReturnValue([card] as any);
            const cf = await CardFile.load(app, makeFile());

            await cf.writeCard(card as unknown as ParsedCard, { id: '1' });
            mockParseCards.mockReturnValue([makeCard()] as any);
            await cf.reload();

            expect(cf.needsReload).toBe(false);
        });
    });
});