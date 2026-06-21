import { locateCardsInMarkdown } from "../src/parser";

describe("locateCardsInMarkdown", () => {

    // ── Empty / card-free input ─────────────────────────────────────────────────
    describe("empty and card-free input", () => {
        it("returns [] for an empty string", () => {
            expect(locateCardsInMarkdown("")).toEqual([]);
        });

        it("returns [] for plain paragraph text", () => {
            expect(locateCardsInMarkdown("Hello\n\nWorld")).toEqual([]);
        });

        it("returns [] for a non-card callout", () => {
            expect(locateCardsInMarkdown("> [!note]\n> Not a card.")).toEqual([]);
        });
    });

    // ── Single card, no metadata ────────────────────────────────────────────────
    describe("single card without metadata", () => {
        it("detects a minimal two-line card", () => {
            const md = "> [!card]\n> body";
            expect(locateCardsInMarkdown(md)).toEqual([
                { cardStart: 0, cardEnd: 1, metaStart: -1, metaEnd: -1 },
            ]);
        });

        it("is case-insensitive for [!card]", () => {
            expect(locateCardsInMarkdown("> [!Card]\n> body")).toHaveLength(1);
            expect(locateCardsInMarkdown("> [!CARD]\n> body")).toHaveLength(1);
        });

        it("handles a single-header card with no body lines", () => {
            const [loc] = locateCardsInMarkdown("> [!card]");
            expect(loc).toEqual({ cardStart: 0, cardEnd: 0, metaStart: -1, metaEnd: -1 });
        });

        it("tracks the last body line correctly for a multi-line card", () => {
            const md = [
                "> [!card]",
                "> line 1",
                "> line 2",
                "> line 3",
                "",
                "Normal paragraph",
            ].join("\n");
            expect(locateCardsInMarkdown(md)[0].cardEnd).toBe(3);
        });

        it("handles a card at the very end of the file without a trailing newline", () => {
            const [loc] = locateCardsInMarkdown("> [!card]\n> body");
            expect(loc.cardEnd).toBe(1);
        });
    });

    // ── Card with metadata ──────────────────────────────────────────────────────
    describe("card with metadata block", () => {
        it("locates a single-field trailing metadata block", () => {
            const md = [
                "> [!card]",             // 0
                "> body",                // 1
                "> > [!card-metadata]",  // 2  metaStart
                "> > id: 12345",         // 3  metaEnd
            ].join("\n");

            expect(locateCardsInMarkdown(md)).toEqual([
                { cardStart: 0, cardEnd: 3, metaStart: 2, metaEnd: 3 },
            ]);
        });

        it("extends metaEnd over multiple metadata field lines", () => {
            const md = [
                "> [!card]",             // 0
                "> body",                // 1
                "> > [!card-metadata]",  // 2
                "> > id: 1",             // 3
                "> > suspended: false",  // 4  metaEnd
            ].join("\n");

            const [loc] = locateCardsInMarkdown(md);
            expect(loc.metaEnd).toBe(4);
            expect(loc.cardEnd).toBe(4);
        });

        it("handles metadata that precedes the card body", () => {
            const md = [
                "> [!card]",             // 0
                "> > [!card-metadata]",  // 1  metaStart
                "> > id: 42",            // 2  metaEnd
                "> body",                // 3  cardEnd
            ].join("\n");

            const [loc] = locateCardsInMarkdown(md);
            expect(loc.metaStart).toBe(1);
            expect(loc.metaEnd).toBe(2);
            expect(loc.cardEnd).toBe(3);
        });
    });

    // ── Multiple cards ──────────────────────────────────────────────────────────
    describe("multiple cards", () => {
        it("detects two cards separated by a blank line", () => {
            const md = [
                "> [!card]",  // 0
                "> First",    // 1
                "",            // 2
                "> [!card]",  // 3
                "> Second",   // 4
            ].join("\n");

            expect(locateCardsInMarkdown(md)).toEqual([
                { cardStart: 0, cardEnd: 1, metaStart: -1, metaEnd: -1 },
                { cardStart: 3, cardEnd: 4, metaStart: -1, metaEnd: -1 },
            ]);
        });

        it("preserves document order when cards are interspersed with headings", () => {
            const md = [
                "# Section",           // 0
                "",                     // 1
                "> [!card]",            // 2
                "> Q1",                 // 3
                "",                     // 4
                "## Sub",               // 5
                "",                     // 6
                "> [!card]",            // 7
                "> Q2",                 // 8
                "> > [!card-metadata]", // 9
                "> > id: 99",           // 10
            ].join("\n");

            const locs = locateCardsInMarkdown(md);
            expect(locs).toHaveLength(2);
            expect(locs[0].cardStart).toBe(2);
            expect(locs[1].cardStart).toBe(7);
            expect(locs[1].metaStart).toBe(9);
        });

        it("handles a file containing only consecutive cards", () => {
            const md = [
                "> [!card]", "> A", "",
                "> [!card]", "> B", "",
                "> [!card]", "> C",
            ].join("\n");
            expect(locateCardsInMarkdown(md)).toHaveLength(3);
        });
    });

    // ── Edge cases ──────────────────────────────────────────────────────────────
    describe("edge cases", () => {
        it("does not treat a nested level-2 [!card] as an independent card", () => {
            const md = [
                "> [!card]",
                "> > [!card]",  // level-2: must not create a new top-level entry
                "> body",
            ].join("\n");
            expect(locateCardsInMarkdown(md)).toHaveLength(1);
        });

        it("does not treat [!card] inside normal blockquote content as a card", () => {
            const md = "> Some text > [!card] inline";
            expect(locateCardsInMarkdown(md)).toHaveLength(0);
        });
    });
});