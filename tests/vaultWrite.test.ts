import { writeCardFields, writeMultipleCardFields } from "../src/parser";

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeMockApp(initialMarkdown: string) {
    const readMock = jest.fn().mockResolvedValue(initialMarkdown);
    const modifyMock = jest.fn().mockResolvedValue(undefined);
    // Cast to `any` — only vault.read and vault.modify are exercised by the SUT.
    const app = { vault: { read: readMock, modify: modifyMock } } as any;
    return { app, readMock, modifyMock };
}

// Plain object is fine: the file is only passed through to the mocked vault methods.
const FILE = { path: "deck.md" } as any;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ONE_CARD = "> [!card]\n> body";

const ONE_CARD_WITH_META = [
    "> [!card]",
    "> body",
    "> > [!card-metadata]",
    "> > id: 11111",
].join("\n");

const TWO_CARDS = [
    "> [!card]",  // card 0
    "> First",
    "",
    "> [!card]",  // card 1
    "> Second",
].join("\n");

// ─── writeCardFields ──────────────────────────────────────────────────────────
describe("writeCardFields", () => {
    it("creates a metadata block for a card that has none", async () => {
        const { app, modifyMock } = makeMockApp(ONE_CARD);
        await writeCardFields(app, FILE, 0, { id: "42" });

        const written: string = modifyMock.mock.calls[0][1];
        expect(written).toContain("> > [!card-metadata]");
        expect(written).toContain("> > id: 42");
    });

    it("updates an existing field in the metadata block", async () => {
        const { app, modifyMock } = makeMockApp(ONE_CARD_WITH_META);
        await writeCardFields(app, FILE, 0, { id: "99999" });

        const written: string = modifyMock.mock.calls[0][1];
        expect(written).toContain("> > id: 99999");
        expect(written).not.toContain("> > id: 11111");
    });

    it("appends a new field to an existing metadata block", async () => {
        const { app, modifyMock } = makeMockApp(ONE_CARD_WITH_META);
        await writeCardFields(app, FILE, 0, { suspended: "false" });

        const written: string = modifyMock.mock.calls[0][1];
        expect(written).toContain("> > id: 11111");      // preserved
        expect(written).toContain("> > suspended: false"); // new
    });

    it("calls vault.read exactly once and vault.modify exactly once", async () => {
        const { app, readMock, modifyMock } = makeMockApp(ONE_CARD);
        await writeCardFields(app, FILE, 0, { id: "1" });
        expect(readMock).toHaveBeenCalledTimes(1);
        expect(modifyMock).toHaveBeenCalledTimes(1);
    });

    it("passes the file object as the first argument to vault.modify", async () => {
        const { app, modifyMock } = makeMockApp(ONE_CARD);
        await writeCardFields(app, FILE, 0, { id: "1" });
        expect(modifyMock.mock.calls[0][0]).toBe(FILE);
    });

    it("throws RangeError for a cardIndex beyond the card count", async () => {
        const { app } = makeMockApp(ONE_CARD);
        await expect(writeCardFields(app, FILE, 99, { id: "1" }))
            .rejects.toThrow(RangeError);
    });

    it("throws RangeError for a negative cardIndex", async () => {
        const { app } = makeMockApp(ONE_CARD);
        await expect(writeCardFields(app, FILE, -1, { id: "1" }))
            .rejects.toThrow(RangeError);
    });

    it("does NOT call vault.modify when a RangeError is thrown", async () => {
        const { app, modifyMock } = makeMockApp(ONE_CARD);
        await expect(writeCardFields(app, FILE, 99, { id: "1" })).rejects.toThrow();
        expect(modifyMock).not.toHaveBeenCalled();
    });
});

// ─── writeMultipleCardFields ──────────────────────────────────────────────────
describe("writeMultipleCardFields", () => {
    it("performs no read and no modify when the updates array is empty", async () => {
        const { app, readMock, modifyMock } = makeMockApp(TWO_CARDS);
        await writeMultipleCardFields(app, FILE, []);
        expect(readMock).not.toHaveBeenCalled();
        expect(modifyMock).not.toHaveBeenCalled();
    });

    it("writes updates for both cards in a single vault.modify call", async () => {
        const { app, modifyMock } = makeMockApp(TWO_CARDS);
        await writeMultipleCardFields(app, FILE, [
            { cardIndex: 0, fields: { id: "111" } },
            { cardIndex: 1, fields: { id: "222" } },
        ]);

        expect(modifyMock).toHaveBeenCalledTimes(1);
        const written: string = modifyMock.mock.calls[0][1];
        expect(written).toContain("> > id: 111");
        expect(written).toContain("> > id: 222");
    });

    it("merges duplicate card indices — last value wins per key", async () => {
        const { app, modifyMock } = makeMockApp(TWO_CARDS);
        await writeMultipleCardFields(app, FILE, [
            { cardIndex: 0, fields: { id: "111" } },
            { cardIndex: 0, fields: { id: "999" } }, // overrides the first
        ]);

        const written: string = modifyMock.mock.calls[0][1];
        expect(written).toContain("> > id: 999");
        expect(written).not.toContain("> > id: 111");
    });

    it("merges different keys from separate updates to the same card", async () => {
        const { app, modifyMock } = makeMockApp(TWO_CARDS);
        await writeMultipleCardFields(app, FILE, [
            { cardIndex: 0, fields: { id: "1" } },
            { cardIndex: 0, fields: { suspended: "true" } },
        ]);

        const written: string = modifyMock.mock.calls[0][1];
        expect(written).toContain("> > id: 1");
        expect(written).toContain("> > suspended: true");
    });

    it("correctly targets only the second card when cardIndex is 1", async () => {
        const { app, modifyMock } = makeMockApp(TWO_CARDS);
        await writeMultipleCardFields(app, FILE, [
            { cardIndex: 1, fields: { id: "500" } },
        ]);

        const written: string = modifyMock.mock.calls[0][1];
        expect(written).toContain("> > id: 500");
        // Only one metadata block should have been created
        const metaHeaders = written.split("\n").filter((l) => l.includes("[!card-metadata]"));
        expect(metaHeaders).toHaveLength(1);
    });

    it("fails atomically: throws RangeError and never calls vault.modify", async () => {
        const { app, modifyMock } = makeMockApp(TWO_CARDS);
        await expect(
            writeMultipleCardFields(app, FILE, [
                { cardIndex: 0, fields: { id: "1" } },
                { cardIndex: 99, fields: { id: "2" } }, // out of range
            ])
        ).rejects.toThrow(RangeError);

        expect(modifyMock).not.toHaveBeenCalled();
    });
});