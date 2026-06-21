import { parseCard, parseFile } from "../src/parser";
import { buildCardElement, buildDocument } from "./helpers";

const VAULT = "TestVault";

describe("parseCard", () => {

    // ── id field ─────────────────────────────────────────────────────────────
    describe("id field", () => {
        it("parses a valid positive integer id", () => {
            expect(parseCard(buildCardElement({ metadata: { id: "12345" } }), VAULT).id)
                .toBe(12345);
        });

        it("is undefined when no metadata block exists", () => {
            expect(parseCard(buildCardElement({}), VAULT).id).toBeUndefined();
        });

        it("is undefined when no id key is present in metadata", () => {
            expect(
                parseCard(buildCardElement({ metadata: { deck: "Science" } }), VAULT).id
            ).toBeUndefined();
        });

        it.each([
            ["non-numeric string", "abc"],
            ["float", "1.5"],
            ["zero", "0"],
            ["negative integer", "-1"],
            ["number with suffix", "123abc"],
        ])("throws for an invalid id value: %s", (_label, value) => {
            expect(() =>
                parseCard(buildCardElement({ metadata: { id: value } }), VAULT)
            ).toThrow(/Invalid "id" field/);
        });
    });

    // ── suspended field ───────────────────────────────────────────────────────
    describe("suspended field", () => {
        it("parses suspended: true", () => {
            expect(
                parseCard(buildCardElement({ metadata: { suspended: "true" } }), VAULT).suspended
            ).toBe(true);
        });

        it("parses suspended: false", () => {
            expect(
                parseCard(buildCardElement({ metadata: { suspended: "false" } }), VAULT).suspended
            ).toBe(false);
        });

        it("is case-insensitive (True → true, FALSE → false)", () => {
            expect(
                parseCard(buildCardElement({ metadata: { suspended: "True" } }), VAULT).suspended
            ).toBe(true);
            expect(
                parseCard(buildCardElement({ metadata: { suspended: "FALSE" } }), VAULT).suspended
            ).toBe(false);
        });

        it("treats any non-'true' value as false", () => {
            expect(
                parseCard(buildCardElement({ metadata: { suspended: "yes" } }), VAULT).suspended
            ).toBe(false);
        });

        it("is undefined when not present in metadata", () => {
            expect(
                parseCard(buildCardElement({ metadata: { id: "1" } }), VAULT).suspended
            ).toBeUndefined();
        });

        it("is undefined when no metadata block exists at all", () => {
            expect(parseCard(buildCardElement({}), VAULT).suspended).toBeUndefined();
        });
    });

    // ── tags field ────────────────────────────────────────────────────────────
    describe("tags field", () => {
        it("returns an empty Set when there are no tags", () => {
            expect(parseCard(buildCardElement({}), VAULT).tags.size).toBe(0);
        });

        it("parses a space-separated list of hash-prefixed tags", () => {
            const { tags } = parseCard(
                buildCardElement({ metadata: { tags: "#biology #chemistry" } }),
                VAULT,
            );
            expect(tags).toContain("biology");
            expect(tags).toContain("chemistry");
        });

        it("converts slash hierarchy to Anki double-colon notation", () => {
            const { tags } = parseCard(
                buildCardElement({ metadata: { tags: "#science/biology" } }),
                VAULT,
            );
            expect(tags).toContain("science::biology");
        });
    });

    // ── cardFields ────────────────────────────────────────────────────────────
    describe("cardFields", () => {
        it("stores unknown keys in cardFields", () => {
            const { cardFields } = parseCard(
                buildCardElement({ metadata: { deck: "Science", model: "Basic" } }),
                VAULT,
            );
            expect(cardFields.deck).toBe("Science");
            expect(cardFields.model).toBe("Basic");
        });

        it.each(["id", "tags", "suspended"])(
            "does not place the reserved key '%s' in cardFields",
            (reservedKey) => {
                const el = buildCardElement({
                    metadata: { [reservedKey]: "anything", deck: "X" },
                });
                const { cardFields } = parseCard(el, VAULT);
                expect(reservedKey in cardFields).toBe(false);
                expect(cardFields.deck).toBe("X");
            },
        );

        it("returns an empty object when no extra fields are present", () => {
            expect(
                parseCard(buildCardElement({ metadata: { id: "1" } }), VAULT).cardFields
            ).toEqual({});
        });
    });

    // ── text extraction ───────────────────────────────────────────────────────
    describe("text extraction", () => {
        it("returns the body HTML as a string", () => {
            const { text } = parseCard(
                buildCardElement({ bodyHtml: "<p>Hello world</p>" }),
                VAULT,
            );
            expect(text).toContain("Hello world");
        });

        it("excludes the metadata callout from the extracted text", () => {
            const { text } = parseCard(
                buildCardElement({ bodyHtml: "<p>Body text</p>", metadata: { id: "1" } }),
                VAULT,
            );
            expect(text).toContain("Body text");
            expect(text).not.toContain("card-metadata");
            expect(text).not.toContain("id: 1");
        });

        it("returns an empty string when the card has no content element", () => {
            const bare = document.createElement("div");
            bare.className = "callout";
            bare.setAttribute("data-callout", "card");
            expect(parseCard(bare, VAULT).text).toBe("");
        });
    });

    // ── cloze conversion ──────────────────────────────────────────────────────
    describe("cloze conversion", () => {
        it("converts a bare cloze span to {{c1::…}} syntax", () => {
            const { text } = parseCard(
                buildCardElement({
                    bodyHtml: "<p>Capital: <span class='cloze'>Paris</span>.</p>",
                }),
                VAULT,
            );
            expect(text).toContain("{{c1::Paris}}");
        });

        it("respects an explicit numeric id attribute on a cloze span", () => {
            const { text } = parseCard(
                buildCardElement({
                    bodyHtml: "<p><span class='cloze' id='3'>thing</span></p>",
                }),
                VAULT,
            );
            expect(text).toContain("{{c3::thing}}");
        });

        it("includes a hint in the Anki token", () => {
            const { text } = parseCard(
                buildCardElement({
                    bodyHtml: "<p><span class='cloze' hint='clue'>thing</span></p>",
                }),
                VAULT,
            );
            expect(text).toContain("{{c1::thing::clue}}");
        });

        it("auto-increments IDs for consecutive unmarked spans", () => {
            const { text } = parseCard(
                buildCardElement({
                    bodyHtml:
                        "<p><span class='cloze'>A</span> and <span class='cloze'>B</span></p>",
                }),
                VAULT,
            );
            expect(text).toContain("{{c1::A}}");
            expect(text).toContain("{{c2::B}}");
        });

        it("auto-increment skips IDs reserved by explicit spans", () => {
            // Span with id=2 is explicit; the unmarked span should get id=1 (first free).
            const { text } = parseCard(
                buildCardElement({
                    bodyHtml:
                        "<p><span class='cloze' id='2'>reserved</span>" +
                        " <span class='cloze'>auto</span></p>",
                }),
                VAULT,
            );
            expect(text).toContain("{{c2::reserved}}");
            expect(text).toContain("{{c1::auto}}");
        });
    });

    // ── error handling ────────────────────────────────────────────────────────
    describe("error handling", () => {
        it("throws when a card contains more than one metadata block", () => {
            const card = document.createElement("div");
            card.className = "callout";
            card.setAttribute("data-callout", "card");

            const content = document.createElement("div");
            content.className = "callout-content";

            for (let i = 0; i < 2; i++) {
                const meta = document.createElement("div");
                meta.className = "callout";
                meta.setAttribute("data-callout", "card-metadata");
                const mc = document.createElement("div");
                mc.className = "callout-content";
                meta.appendChild(mc);
                content.appendChild(meta);
            }
            card.appendChild(content);

            expect(() => parseCard(card, VAULT)).toThrow(/2 metadata blocks/);
        });
    });
});

// ── parseFile ─────────────────────────────────────────────────────────────────
describe("parseFile", () => {
    it("returns [] for a document with no card callouts", () => {
        const doc = document.createElement("div");
        doc.innerHTML = "<p>No cards here.</p>";
        expect(parseFile(doc, VAULT)).toEqual([]);
    });

    it("parses multiple cards in document order", () => {
        const doc = buildDocument(
            buildCardElement({ metadata: { id: "1" } }),
            buildCardElement({ metadata: { id: "2" } }),
            buildCardElement({ metadata: { id: "3" } }),
        );
        expect(parseFile(doc, VAULT).map((c) => c.id)).toEqual([1, 2, 3]);
    });

    it("skips a malformed card with a console.warn, leaving valid cards intact", () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => { });

        const doc = buildDocument(
            buildCardElement({ metadata: { id: "1" } }),
            buildCardElement({ metadata: { id: "INVALID" } }), // will throw inside parseCard
            buildCardElement({ metadata: { id: "3" } }),
        );

        const cards = parseFile(doc, VAULT);
        expect(cards.map((c) => c.id)).toEqual([1, 3]);
        expect(warnSpy).toHaveBeenCalledWith(
            "Skipping malformed card:",
            expect.any(Error),
        );

        warnSpy.mockRestore();
    });
});