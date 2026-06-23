import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import { ParsedCard, parseCards } from "./parser";

/**
 * Represents a vault file as a collection of parsed flashcards.
 *
 * Construct via {@link CardFile.load}, which reads the file and parses all
 * `[!card]` callouts in one shot. The resulting {@link cards} array is
 * document-ordered and held in memory for fast repeated access.
 *
 * ### Writing
 * {@link writeCard} and {@link writeCards} locate the relevant callout blocks at
 * write time by re-scanning the file, so stored cards never carry positional
 * data. Both methods mark the instance as needing a reload afterwards, because
 * the in-memory cards no longer reflect what is on disk.
 */
export class CardFile {
    private _cards: ParsedCard[] = [];
    private _needsReload = false;
    private _markdown: string = '';
    private _locations: CardSourceLocation[] = [];

    private _writeInFlight: Promise<void> = Promise.resolve();

    private constructor(
        private readonly app: App,
        public readonly file: TFile,
    ) { }

    // ── Construction ──────────────────────────────────────────────────────────

    static async load(app: App, file: TFile): Promise<CardFile> {
        const instance = new CardFile(app, file);
        await instance._parse();
        return instance;
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    get cards(): ReadonlyArray<ParsedCard> {
        return this._cards;
    }

    /**
     * True after any write. In-memory cards no longer reflect what is on disk.
     * Call {@link reload} to re-sync before writing again.
     */
    get needsReload(): boolean {
        return this._needsReload;
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    async writeCard(card: ParsedCard, fields: Record<string, string>): Promise<void> {
        await this.writeCards([{ card, fields }]);
    }

    async writeCards(
        updates: ReadonlyArray<{ card: ParsedCard; fields: Record<string, string> }>,
    ): Promise<void> {
        const doWrite = async (): Promise<void> => {
            if (updates.length === 0) return;
            this._assertSynced();

            const byIndex = new Map<number, Record<string, string>>();
            for (const { card, fields } of updates) {
                const index = this._cards.indexOf(card);
                if (index === -1) throw new Error("Card does not belong to this CardFile.");
                if (index >= this._locations.length)
                    throw new RangeError(`Card at index ${index} no longer exists in the file.`);
                byIndex.set(index, { ...byIndex.get(index), ...fields });
            }

            let result = this._markdown;
            for (const idx of [...byIndex.keys()].sort((a, b) => b - a)) {
                const location = this._locations[idx];
                if (!location) throw new TypeError(`Missing location at card index ${idx}`);
                result = applyCardFieldUpdates(result, location, byIndex.get(idx)!);
            }

            await this.app.vault.modify(this.file, result);
            this._needsReload = true;
        };

        const thisWrite = (this._writeInFlight = this._writeInFlight.then(doWrite));
        return thisWrite;
    }

    async reload(): Promise<void> {
        await this._parse();
        this._needsReload = false;
    }


    private _assertSynced(): void {
        if (this._needsReload) {
            throw new Error(
                "CardFile is out of sync: a write has occurred since the last load or reload. " +
                "Call reload() before writing again.",
            );
        }
    }

    private async _parse(): Promise<void> {
        const markdown = await this.app.vault.read(this.file);
        const locations = locateCards(markdown);

        const container = document.createElement('div');
        const component = new Component();
        component.load();
        try {
            await MarkdownRenderer.render(
                this.app, markdown, container, this.file.path, component,
            );
        } finally {
            component.unload();
        }

        const rawCards = parseCards(container, this.app.vault.getName());

        // ── Guard 1: every card must be individually valid ────────────────────
        const invalid = rawCards
            .map((card, i) => ({ card, i }))
            .filter(({ card }) => !card.valid);

        if (invalid.length > 0) {
            const indices = invalid.map(({ i }) => i).join(", ");
            throw new CardFileInvalidCardError(this.file.path, indices);
        }
        // ── Guard 2: the two independent parsers must agree on card count ─────
        if (rawCards.length !== locations.length) {
            throw new CardFileMismatchError(
                this.file.path,
                locations.length,
                rawCards.length,
            );
        }

        this._markdown = markdown;
        this._locations = locations;
        this._cards = rawCards;
    }
}

export class CardFileMismatchError extends Error {
    constructor(path: string, located: number, parsed: number) {
        super(
            `${path}: locateCardsInMarkdown found ${located} location(s) ` +
            `but parseCards produced ${parsed} card(s). ` +
            `The file may be malformed.`,
        );
        this.name = "CardFileMismatchError";
    }
}

export class CardFileInvalidCardError extends Error {
    constructor(path: string, indices: string) {
        super(
            `${path}: card(s) at index [${indices}] failed validation after parsing. ` +
            `Check the [!card] callout syntax at those positions.`,
        );
        this.name = "CardFileInvalidCardError";
    }
}

// ─── Write-back –––––––––––––––––─────────────────────────────────────────────

/**
 * The position of a `[!card]` callout block within a raw Markdown string,
 * expressed as 0-based, inclusive line indices.
 */
export interface CardSourceLocation {
    /** The `> [!card]` header line. */
    cardStart: number;
    /** Last line of the card block. */
    cardEnd: number;
    /**
     * The `> > [!card-metadata]` header line inside the card,
     * or -1 if no metadata sub-block exists yet.
     */
    metaStart: number;
    /**
     * Last line of the metadata sub-block (inclusive),
     * or -1 if no metadata sub-block exists yet.
     */
    metaEnd: number;
}

/**
 * Scans `markdown` and returns the source location of every `[!card]`
 * callout in document order — matching the order of {@link parseCards}.
 *
 * Assumes standard Obsidian callout syntax:
 * - `> [!card]`           — level-1 card header
 * - `>> [!card-metadata]` — level-2 metadata sub-block
 * - A blank (non-`>`) line terminates the current block.
 */
export function locateCards(markdown: string): CardSourceLocation[] {
    const lines: string[] = markdown.split(/\r?\n/);
    const locations: CardSourceLocation[] = [];
    let i = 0;

    while (i < lines.length) {
        let line;
        if (!(line = lines[i]) || !isCardHeader(line)) { i++; continue; }

        const cardStart = i;
        let metaStart = -1;
        let metaEnd = -1;
        let j = i + 1;

        // Consume all lines that belong to this card (any line starting with `>`).
        let cardLine;
        while (j < lines.length && (cardLine = lines[j]) && /^>/.test(cardLine)) {
            if (metaStart === -1 && (line = lines[j]) && isMetadataHeader(line)) {
                metaStart = j;
                // Consume level-2 metadata content lines.
                let k = j + 1;
                let metadataLine;
                while (k < lines.length && (metadataLine = lines[k]) && /^>\s*>/.test(metadataLine)) k++;
                metaEnd = k - 1;
                j = k; // resume scanning card body after the metadata block
            } else {
                j++;
            }
        }

        locations.push({ cardStart, cardEnd: j - 1, metaStart, metaEnd });
        i = j;
    }

    return locations;
}

/** Matches a level-1 `[!card]` header; rejects level-2+ lines via lookahead. */
function isCardHeader(line: string): boolean {
    return /^>(?!\s*>)\s*\[!card\]-?/i.test(line);
}

/** Matches a level-2 `[!card-metadata]` header. */
function isMetadataHeader(line: string): boolean {
    return /^>\s*>\s*\[!card-metadata\]-?/i.test(line);
}

/**
 * Returns an updated copy of `markdown` with `fields` written into the card
 * at `location`.
 *
 * - **Existing field** — replaced in-place on its original line.
 * - **New field** — appended at the end of the existing metadata block.
 * - **No metadata block** — a `> > [!card-metadata]` sub-block is created
 *   immediately after the card's first line.
 *
 * > ⚠️ `location` becomes stale after this call because line numbers shift.
 * > Re-call {@link locateCards} before making further edits.
 *
 * @param markdown - Raw Markdown source string.
 * @param location - Card location from {@link locateCards}.
 * @param fields   - Key-value pairs to write; all values must be pre-serialised
 *                   strings (e.g. `{ id: "12345" }`).
 */
export function applyCardFieldUpdates(
    markdown: string,
    location: CardSourceLocation,
    fields: Record<string, string>,
): string {
    if (Object.keys(fields).length === 0) return markdown;

    const lines: string[] = markdown.split(/\r?\n/);

    if (location.metaStart === -1) {
        // ── No metadata block: create one at the beginning of the card ─────────────────
        const block = [
            '>> [!card-metadata]-',
            ...Object.entries(fields).map(([k, v]) => `>> ${k}: ${v}`),
        ];
        lines.splice(location.cardStart + 1, 0, ...block);
    } else {
        // ── Metadata block exists: update in-place, then append new keys ───────
        const pending = { ...fields };

        for (let ln = location.metaStart + 1; ln <= location.metaEnd; ln++) {
            // Match "> > key: value" with flexible whitespace around the prefix.
            const m = lines[ln]!.match(/^(>\s*>)\s*([^:\s][^:]*?):(.*)/);
            if (!m) continue;
            const key = m[2]!.trim();
            if (key in pending) {
                lines[ln] = `>> ${key}: ${pending[key]}`;
                delete pending[key];
            }
        }

        // Append any fields that were not already present.
        const extra = Object.entries(pending).map(([k, v]) => `>> ${k}: ${v}`);
        if (extra.length > 0) {
            lines.splice(location.metaEnd + 1, 0, ...extra);
        }
    }

    return lines.join('\n');
}

export function filterValidCards(cards: ReadonlyArray<ParsedCard>): ParsedCard[] {
    return cards.filter((card) => card.valid);
}