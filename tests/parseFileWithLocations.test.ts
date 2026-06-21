import { parseFileWithLocations } from "../src/parser";
import { MarkdownRenderer } from "obsidian";
import { buildCardElement } from "./helpers";

// ── Mock factory ──────────────────────────────────────────────────────────────

/**
 * Builds a minimal App-shaped mock.
 * `cachedRead` returns `markdown`; `getName` returns `vaultName`.
 */
function makeMockApp(markdown: string, vaultName = "TestVault") {
    const cachedReadMock = jest.fn().mockResolvedValue(markdown);
    const getNameMock = jest.fn().mockReturnValue(vaultName);
    const app = {
        vault: { cachedRead: cachedReadMock, getName: getNameMock },
    } as any;
    return { app, cachedReadMock, getNameMock };
}

/**
 * Overrides the shared MarkdownRenderer.render mock so that it populates the
 * container argument with the supplied card elements instead of doing nothing.
 */
function mockRenderWith(...cardEls: HTMLElement[]) {
    (MarkdownRenderer.render as jest.Mock).mockImplementation(
        async (_app: unknown, _md: unknown, container: HTMLElement) => {
            for (const el of cardEls) container.appendChild(el);
        },
    );
}

/** Renders nothing (empty document). */
function mockRenderEmpty() {
    (MarkdownRenderer.render as jest.Mock).mockImplementation(
        async (_app: unknown, _md: unknown, container: HTMLElement) => {
            container.innerHTML = "";
        },
    );
}

const FILE = { path: "deck.md" } as any;
const DEEP_FILE = { path: "subdir/deck.md" } as any;

// ─────────────────────────────────────────────────────────────────────────────

describe("parseFileWithLocations", () => {
    beforeEach(() => jest.clearAllMocks());

    // ── Vault I/O ─────────────────────────────────────────────────────────────
    describe("vault I/O", () => {
        it("reads the file via vault.cachedRead", async () => {
            const md = "> [!card]\n> body";
            const { app, cachedReadMock } = makeMockApp(md);
            mockRenderEmpty();

            await parseFileWithLocations(app, FILE);

            expect(cachedReadMock).toHaveBeenCalledTimes(1);
            expect(cachedReadMock).toHaveBeenCalledWith(FILE);
        });

        it("passes the correct file path to MarkdownRenderer.render", async () => {
            const md = "> [!card]\n> body";
            const { app } = makeMockApp(md);
            mockRenderEmpty();

            await parseFileWithLocations(app, DEEP_FILE);

            expect(MarkdownRenderer.render).toHaveBeenCalledWith(
                app,
                md,
                expect.any(HTMLElement),
                "subdir/deck.md",
                expect.anything(),
            );
        });

        it("uses vault.getName() as the vault name for internal-link rewriting", async () => {
            const md = "> [!card]\n> body";
            const { app, getNameMock } = makeMockApp(md, "MyVault");
            mockRenderWith(buildCardElement({ bodyHtml: "<p>body</p>" }));

            await parseFileWithLocations(app, FILE);

            expect(getNameMock).toHaveBeenCalledTimes(1);
        });
    });

    // ── Empty / card-free files ───────────────────────────────────────────────
    describe("empty and card-free files", () => {
        it("returns empty arrays for a file with no cards", async () => {
            const { app } = makeMockApp("# Heading\n\nJust a paragraph.");
            mockRenderEmpty();

            const { cards, locations } = await parseFileWithLocations(app, FILE);
            expect(cards).toEqual([]);
            expect(locations).toEqual([]);
        });

        it("returns empty arrays for a completely empty file", async () => {
            const { app } = makeMockApp("");
            mockRenderEmpty();

            const { cards, locations } = await parseFileWithLocations(app, FILE);
            expect(cards).toEqual([]);
            expect(locations).toEqual([]);
        });
    });

    // ── Single card ───────────────────────────────────────────────────────────
    describe("single card", () => {
        it("returns one card and one location for a card without metadata", async () => {
            const md = "> [!card]\n> body";
            const { app } = makeMockApp(md);
            mockRenderWith(buildCardElement({ bodyHtml: "<p>body</p>" }));

            const { cards, locations } = await parseFileWithLocations(app, FILE);
            expect(cards).toHaveLength(1);
            expect(locations).toHaveLength(1);
        });

        it("parses the card's id from the rendered HTML", async () => {
            const md = [
                "> [!card]",
                "> body",
                "> > [!card-metadata]",
                "> > id: 42",
            ].join("\n");
            const { app } = makeMockApp(md);
            mockRenderWith(
                buildCardElement({ bodyHtml: "<p>body</p>", metadata: { id: "42" } }),
            );

            const { cards } = await parseFileWithLocations(app, FILE);
            expect(cards[0].id).toBe(42);
        });

        it("resolves the metadata block location from the raw Markdown", async () => {
            const md = [
                "> [!card]",            // 0
                "> body",               // 1
                "> > [!card-metadata]", // 2  ← metaStart
                "> > id: 42",           // 3  ← metaEnd
            ].join("\n");
            const { app } = makeMockApp(md);
            mockRenderWith(buildCardElement({ metadata: { id: "42" } }));

            const { locations } = await parseFileWithLocations(app, FILE);
            expect(locations[0]).toEqual({
                cardStart: 0,
                cardEnd: 3,
                metaStart: 2,
                metaEnd: 3,
            });
        });

        it("reports metaStart as -1 when the card has no metadata block", async () => {
            const md = "> [!card]\n> body";
            const { app } = makeMockApp(md);
            mockRenderWith(buildCardElement({ bodyHtml: "<p>body</p>" }));

            const { locations } = await parseFileWithLocations(app, FILE);
            expect(locations[0].metaStart).toBe(-1);
            expect(locations[0].metaEnd).toBe(-1);
        });
    });

    // ── Multiple cards ────────────────────────────────────────────────────────
    describe("multiple cards", () => {
        const threeCardMd = [
            "> [!card]",
            "> > [!card-metadata]",
            "> > id: 1",
            "",
            "> [!card]",
            "> > [!card-metadata]",
            "> > id: 2",
            "",
            "> [!card]",
            "> > [!card-metadata]",
            "> > id: 3",
        ].join("\n");

        it("preserves document order across cards and locations", async () => {
            const { app } = makeMockApp(threeCardMd);
            mockRenderWith(
                buildCardElement({ metadata: { id: "1" } }),
                buildCardElement({ metadata: { id: "2" } }),
                buildCardElement({ metadata: { id: "3" } }),
            );

            const { cards, locations } = await parseFileWithLocations(app, FILE);
            expect(cards.map(c => c.id)).toEqual([1, 2, 3]);
            // Locations must also be in ascending order.
            expect(locations[0].cardStart).toBeLessThan(locations[1].cardStart);
            expect(locations[1].cardStart).toBeLessThan(locations[2].cardStart);
        });

        it("returns arrays of the same length", async () => {
            const { app } = makeMockApp(threeCardMd);
            mockRenderWith(
                buildCardElement({ metadata: { id: "1" } }),
                buildCardElement({ metadata: { id: "2" } }),
                buildCardElement({ metadata: { id: "3" } }),
            );

            const { cards, locations } = await parseFileWithLocations(app, FILE);
            expect(cards.length).toBe(locations.length);
        });

        it("index N in cards aligns with index N in locations", async () => {
            // Verify alignment: the id parsed from HTML card N matches the id
            // found at the source location N in the raw Markdown.
            const md = [
                "> [!card]",
                "> > [!card-metadata]",
                "> > id: 100",
                "",
                "> [!card]",
                "> > [!card-metadata]",
                "> > id: 200",
            ].join("\n");

            const { app } = makeMockApp(md);
            mockRenderWith(
                buildCardElement({ metadata: { id: "100" } }),
                buildCardElement({ metadata: { id: "200" } }),
            );

            const { cards, locations } = await parseFileWithLocations(app, FILE);

            for (let i = 0; i < cards.length; i++) {
                // Extract the id line from the source range for this card.
                const sourceLines = md.split("\n").slice(
                    locations[i].metaStart,
                    locations[i].metaEnd + 1,
                );
                const idLine = sourceLines.find(l => l.includes("id:"));
                const sourceId = Number(idLine?.split(":")[1].trim());
                expect(cards[i].id).toBe(sourceId);
            }
        });
    });

    // ── Mismatch warning ──────────────────────────────────────────────────────
    describe("card count mismatch warning", () => {
        it("emits a console.warn when HTML and Markdown card counts differ", async () => {
            // Markdown has 2 cards; the renderer only produces 1 (simulating a
            // discrepancy such as a malformed callout that the renderer silently drops).
            const md = [
                "> [!card]",
                "> First",
                "",
                "> [!card]",
                "> Second",
            ].join("\n");

            const { app } = makeMockApp(md);
            // Only render one card.
            mockRenderWith(buildCardElement({ bodyHtml: "<p>First</p>" }));

            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => { });
            await parseFileWithLocations(app, FILE);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("Card count mismatch"),
            );
            warnSpy.mockRestore();
        });

        it("does not warn when card counts match", async () => {
            const md = "> [!card]\n> body";
            const { app } = makeMockApp(md);
            mockRenderWith(buildCardElement({ bodyHtml: "<p>body</p>" }));

            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => { });
            await parseFileWithLocations(app, FILE);

            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });
    });

    // ── Integration: parse → write roundtrip ──────────────────────────────────
    describe("roundtrip with writeMultipleCardFields", () => {
        it("location indices from parseFileWithLocations correctly target vault writes", async () => {
            // This test wires parseFileWithLocations → writeMultipleCardFields together
            // to confirm the index contract holds end-to-end.
            const { writeMultipleCardFields } = await import("../src/parser");

            const md = [
                "> [!card]",
                "> First",
                "",
                "> [!card]",
                "> Second",
            ].join("\n");

            const modifyMock = jest.fn().mockResolvedValue(undefined);
            const cachedReadMock = jest.fn().mockResolvedValue(md);
            const readMock = jest.fn().mockResolvedValue(md);
            const app = {
                vault: {
                    cachedRead: cachedReadMock,
                    read: readMock,
                    modify: modifyMock,
                    getName: () => "TestVault",
                },
            } as any;

            mockRenderWith(
                buildCardElement({ bodyHtml: "<p>First</p>" }),
                buildCardElement({ bodyHtml: "<p>Second</p>" }),
            );

            const { cards } = await parseFileWithLocations(app, FILE);
            expect(cards).toHaveLength(2);

            await writeMultipleCardFields(app, FILE, [
                { cardIndex: 0, fields: { id: "111" } },
                { cardIndex: 1, fields: { id: "222" } },
            ]);

            const written: string = modifyMock.mock.calls[0][1];
            expect(written).toContain("> > id: 111");
            expect(written).toContain("> > id: 222");
        });
    });
});