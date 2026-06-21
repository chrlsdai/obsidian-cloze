import { App, Component, Notice, MarkdownRenderer, MarkdownView, TFile } from "obsidian";

/**
 * Reads `file`, parses all `[!card]` callouts, and returns both the parsed
 * cards and their write-back locations from the **same snapshot** of the file.
 *
 * The nth entry in `cards` corresponds directly to the nth entry in `locations`.
 *
 * @param app  - The Obsidian App instance.
 * @param file - The vault file to read and parse.
 */
export async function parseFileWithLocations(
    app: App,
    file: TFile,
): Promise<{
    cards: ParsedCard[];
    locations: CardSourceLocation[];
}> {
    const markdown = await app.vault.cachedRead(file);

    // Source-level locations (raw text).
    const locations = locateCardsInMarkdown(markdown);

    // Rendered parse (HTML; handles callouts, embeds, etc.).
    const container = createEl("div");
    const component = new Component();
    component.load();
    try {
        await MarkdownRenderer.render(
            app,
            markdown,
            container,
            file.path,
            component,
        );
    } finally {
        component.unload();
    }
    const cards = parseFile(container, app.vault.getName());

    if (cards.length !== locations.length) {
        console.warn(
            `Card count mismatch: HTML found ${cards.length}, ` +
            `Markdown found ${locations.length}. Index alignment may be wrong.`,
        );
    }

    return { cards, locations };
}

/**
 * Finds every `card` callout in `documentEl` and parses each one into a
 * {@link ParsedCard}.  Cards that fail to parse are skipped with a
 * `console.warn` rather than aborting the whole batch.
 *
 * @param documentEl - A rendered HTML element, e.g. from {@link getActiveHTML}.
 * @param vaultName  - Vault name used to build `obsidian://` URIs for internal links.
 * @returns Array of successfully parsed cards (may be empty).
 */
export function parseFile(documentEl: HTMLElement, vaultName: string): ParsedCard[] {
    const cardEls = documentEl.querySelectorAll<HTMLElement>(
        '.callout[data-callout="card"]',
    );

    const results: ParsedCard[] = [];
    for (const el of Array.from(cardEls)) {
        try {
            results.push(parseCard(el, vaultName));
        } catch (err) {
            console.warn("Skipping malformed card:", err);
        }
    }
    return results;
}

/** Key-value pairs extracted from the `card-metadata` sub-callout. */
export type CardFields = Record<string, string>;

/** A fully parsed Anki card derived from a `[!card]` callout. */
export interface ParsedCard {
    /** Numeric Anki note ID, taken from the `id` metadata field if present. */
    id?: number;
    /** Whether or not the note is suspended, taken from `suspended` metadata field if present. */
    suspended?: boolean;
    /** Anki tags derived from the `tags` metadata field (e.g. `["foo::bar"]`). */
    tags: Set<string>;
    /**
     * Remaining key-value metadata fields.
     * `id`, `suspended`, and `tags` are consumed and will not appear here.
     */
    cardFields: CardFields;
    /** Card body serialised as HTML with cloze spans converted to Anki `{{cN::…}}` syntax. */
    text: string;
}

/**
 * Parses a single `.callout[data-callout="card"]` element into a {@link ParsedCard}.
 *
 * @param cardElement - The card callout DOM element to parse.
 * @param vaultName   - Vault name used to build `obsidian://` URIs for internal links.
 */
export function parseCard(cardElement: HTMLElement, vaultName: string): ParsedCard {
    const { cardFields, id, tags, suspended } = extractMetadata(cardElement);
    return { id, suspended, tags, cardFields, text: extractText(cardElement, vaultName) };
}

// ─── Metadata extraction ──────────────────────────────────────────────────────

/**
 * Extracts `id`, `tags`, `suspended`, and additional key-value fields from the
 * `card-metadata` sub-callout nested inside `card`.
 *
 * Plain `textContent` splitting is used to generate fields. All fields
 * must be a 
 *
 * @throws {Error} If more than one `card-metadata` block is found inside `card`.
 */
function extractMetadata(
    card: HTMLElement,
): Pick<ParsedCard, 'cardFields' | 'id' | 'tags' | 'suspended'> {
    const cardFields: CardFields = {};
    let id: number | undefined;
    let tags: Set<string> = new Set();
    let suspended: boolean | undefined;              // ← new

    const metadataEls = card.querySelectorAll<HTMLElement>(
        '.callout-content .callout[data-callout="card-metadata"]',
    );
    if (metadataEls.length > 1) {
        throw new Error(
            `Card contains ${metadataEls.length} metadata blocks; expected at most 1.`,
        );
    }

    const contentEl = metadataEls[0]?.querySelector<HTMLElement>('.callout-content');
    if (!contentEl) return { cardFields, id, tags, suspended };

    const lines: Array<{ text: string; el: HTMLElement | null }> =
        (contentEl.textContent ?? '').split('\n').map(text => ({ text, el: null }));

    for (const { text, el } of lines) {
        const line = text.trim();
        if (!line) continue;

        const sep = line.indexOf(':');
        if (sep <= 0) continue;

        const key = line.slice(0, sep).trim();
        const value = line.slice(sep + 1).trim();
        if (!key) continue;

        if (key === 'id') {
            const n = parseStrictInt(value);
            if (n === null || n <= 0) {
                throw new Error(`Invalid "id" field: "${value}" is not a positive integer.`);
            }
            id = n;
        } else if (key === 'tags') {
            tags = el ? extractTagsFromEl(el) : extractTagsFromText(value);
        } else if (key === 'suspended') {                  // ← new
            suspended = value.toLowerCase() === 'true';
        } else {
            cardFields[key] = value;
        }
    }

    return { cardFields, id, tags, suspended };
}

// ─── Text + cloze extraction ──────────────────────────────────────────────────

/**
 * Returns the card body as a trimmed HTML string.  The nested
 * `card-metadata` callout is removed, and cloze spans are converted to
 * Anki syntax via {@link serializeWithClozes}.
 *
 * @param card      - The card callout DOM element.
 * @param vaultName - Vault name used to build `obsidian://` URIs.
 */
function extractText(card: HTMLElement, vaultName: string): string {
    const contentEl = card.querySelector<HTMLElement>('.callout-content');
    if (!contentEl) return '';

    // Clone before mutating so the original document element is unchanged.
    const clone = contentEl.cloneNode(true) as HTMLElement;
    clone.querySelector('.callout[data-callout="card-metadata"]')?.remove();
    return serializeWithClozes(clone, vaultName).trim();
}

// ─── DOM → HTML serialiser with Anki cloze conversion ────────────────────────

/** HTML tag names that must be written as void (self-closing) elements. */
const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Serialises `root`'s children to an HTML string with two transformations:
 *
 * 1. **Cloze spans** — every `<span class="cloze">` becomes an Anki
 *    `{{cN::body}}` or `{{cN::body::hint}}` token.
 *    - A span with a valid positive integer `id` attribute uses that number.
 *    - All other spans receive the next available auto-incremented integer,
 *      skipping IDs already claimed by explicit spans.
 *
 * 2. **Internal links** — every `<a class="internal-link">` is rewritten to
 *    an `obsidian://open?vault=…&file=…` URI so that links work inside Anki.
 *    Obsidian-specific attributes (`data-href`, CSS classes, etc.) are stripped.
 *
 * @param root      - Element whose children are serialised (not mutated).
 * @param vaultName - Vault name used when building Obsidian URIs.
 */
function serializeWithClozes(root: HTMLElement, vaultName: string): string {
    // Pass 1 – collect all explicitly assigned cloze IDs so the auto-counter
    // can avoid collisions.
    const reservedIds = new Set<number>();
    root.querySelectorAll('span.cloze[id]').forEach(el => {
        const n = parseInt(el.getAttribute('id')!, 10);
        if (Number.isFinite(n) && n > 0) reservedIds.add(n);
    });

    let cursor = 1;

    /** Returns the next positive integer not already in `reservedIds`. */
    function nextId(): number {
        while (reservedIds.has(cursor)) cursor++;
        const id = cursor++;
        reservedIds.add(id);
        return id;
    }

    /** Recursively serialises a single DOM node to an HTML string. */
    function serialize(node: Node): string {
        if (node.nodeType === Node.TEXT_NODE) {
            return (node.textContent ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const children = () => Array.from(el.childNodes, serialize).join('');

        // ── Cloze span ──────────────────────────────────────────────────────────
        if (tag === 'span' && el.classList.contains('cloze')) {
            const rawId = el.getAttribute('id');
            const hint = el.getAttribute('hint');
            const id = resolveClozeId(rawId, nextId);
            const body = children();

            if (body.includes('::') || hint?.includes('::')) {
                console.warn(
                    `Cloze content contains "::" which may break Anki syntax: "${body}"`,
                );
            }

            return hint
                ? `{{c${id}::${body}::${hint}}}`
                : `{{c${id}::${body}}}`;
        }

        // ── Internal link → Obsidian URI ────────────────────────────────────────
        // Prefer data-href (raw wikilink target) over href (vault-relative path).
        if (tag === 'a' && el.classList.contains('internal-link')) {
            const target = el.getAttribute('data-href') ?? el.getAttribute('href') ?? '';
            const uri = buildObsidianUri(vaultName, target);
            return `<a href="${uri}">${children()}</a>`;
        }

        // ── Void / self-closing element ─────────────────────────────────────────
        if (VOID_ELEMENTS.has(tag)) {
            return `<${tag}${attrsOf(el)}>`;
        }

        // ── Generic element ─────────────────────────────────────────────────────
        return `<${tag}${attrsOf(el)}>${children()}</${tag}>`;
    }

    return Array.from(root.childNodes, serialize).join('');
}

// ─── Write-back: source location ─────────────────────────────────────────────

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
 * callout in document order — matching the order of {@link parseFile}.
 *
 * Assumes standard Obsidian callout syntax:
 * - `> [!card]`           — level-1 card header
 * - `> > [!card-metadata]` — level-2 metadata sub-block
 * - A blank (non-`>`) line terminates the current block.
 */
export function locateCardsInMarkdown(markdown: string): CardSourceLocation[] {
    const lines: string[] = markdown.split('\n');
    const locations: CardSourceLocation[] = [];
    let i = 0;

    while (i < lines.length) {
        if (!isCardHeader(lines[i])) { i++; continue; }

        const cardStart = i;
        let metaStart = -1;
        let metaEnd = -1;
        let j = i + 1;

        // Consume all lines that belong to this card (any line starting with `>`).
        while (j < lines.length && /^>/.test(lines[j]!)) {
            if (metaStart === -1 && isMetadataHeader(lines[j])) {
                metaStart = j;
                // Consume level-2 metadata content lines.
                let k = j + 1;
                while (k < lines.length && /^>\s*>/.test(lines[k]!)) k++;
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
function isCardHeader(line: string | undefined): boolean {
    if (line === undefined) return false;
    return /^>(?!\s*>)\s*\[!card\]/i.test(line);
}

/** Matches a level-2 `[!card-metadata]` header. */
function isMetadataHeader(line: string | undefined): boolean {
    if (line === undefined) return false;
    return /^>\s*>\s*\[!card-metadata\]/i.test(line);
}

// ─── Write-back: field editing ────────────────────────────────────────────────

/**
 * Returns an updated copy of `markdown` with `fields` written into the card
 * at `location`.
 *
 * - **Existing field** — replaced in-place on its original line.
 * - **New field** — appended at the end of the existing metadata block.
 * - **No metadata block** — a `> > [!card-metadata]` sub-block is created
 *   immediately after the card's last line.
 *
 * > ⚠️ `location` becomes stale after this call because line numbers shift.
 * > Re-call {@link locateCardsInMarkdown} before making further edits.
 *
 * @param markdown - Raw Markdown source string.
 * @param location - Card location from {@link locateCardsInMarkdown}.
 * @param fields   - Key-value pairs to write; all values must be pre-serialised
 *                   strings (e.g. `{ id: "12345", suspended: "false" }`).
 */
export function applyCardFieldUpdates(
    markdown: string,
    location: CardSourceLocation,
    fields: Record<string, string>,
): string {
    if (Object.keys(fields).length === 0) return markdown;

    const lines: string[] = markdown.split('\n');

    if (location.metaStart === -1) {
        // ── No metadata block: create one right after the card ─────────────────
        const block = [
            '>> [!card-metadata]',
            ...Object.entries(fields).map(([k, v]) => `>> ${k}: ${v}`),
        ];
        lines.splice(location.cardEnd + 1, 0, ...block);
    } else {
        // ── Metadata block exists: update in-place, then append new keys ───────
        const pending = { ...fields };

        for (let ln = location.metaStart + 1; ln <= location.metaEnd; ln++) {
            // Match "> > key: value" with flexible whitespace around the prefix.
            const m = lines[ln]!.match(/^(>\s*>)\s*([^:\s][^:]*?):(.*)/);
            if (!m) continue;
            const key = m[1]!.trim();
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

/**
 * Updates the card at `cardIndex` (0-based, document order) and writes the
 * result back to `file` in a single vault operation.
 *
 * Prefer {@link writeMultipleCardFields} when updating several cards at once.
 */
export async function writeCardFields(
    app: App,
    file: TFile,
    cardIndex: number,
    fields: Record<string, string>,
): Promise<void> {
    const markdown = await app.vault.read(file);   // disk read to avoid stale cache
    const locations = locateCardsInMarkdown(markdown);

    if (cardIndex < 0 || cardIndex >= locations.length) {
        throw new RangeError(
            `cardIndex ${cardIndex} is out of range; ` +
            `file contains ${locations.length} card(s).`,
        );
    }

    await app.vault.modify(
        file,
        applyCardFieldUpdates(markdown, locations[cardIndex]!, fields),
    );
}

/**
 * Applies field updates to multiple cards in a **single** `vault.modify` call,
 * which is more efficient and avoids interleaved writes.
 *
 * Edits are applied in reverse document order so that line-number shifts from
 * later cards do not invalidate the locations of earlier cards.
 * Duplicate card indices are merged before writing (last value wins per key).
 *
 * @param updates - Array of `{ cardIndex, fields }` pairs.
 */
export async function writeMultipleCardFields(
    app: App,
    file: TFile,
    updates: ReadonlyArray<{ cardIndex: number; fields: Record<string, string> }>,
): Promise<void> {
    if (updates.length === 0) return;

    const markdown = await app.vault.read(file);
    const locations = locateCardsInMarkdown(markdown);

    // Validate all indices up-front so we fail atomically before touching the file.
    for (const { cardIndex } of updates) {
        if (cardIndex < 0 || cardIndex >= locations.length) {
            throw new RangeError(
                `cardIndex ${cardIndex} is out of range; ` +
                `file contains ${locations.length} card(s).`,
            );
        }
    }

    // Merge updates per card; last write wins for each key.
    const byCard = new Map<number, Record<string, string>>();
    for (const { cardIndex, fields } of updates) {
        byCard.set(cardIndex, { ...(byCard.get(cardIndex) ?? {}), ...fields });
    }

    // Process highest-index first: edits at position N don't shift lines for positions < N.
    let result = markdown;
    for (const idx of [...byCard.keys()].sort((a, b) => b - a)) {
        result = applyCardFieldUpdates(result, locations[idx]!, byCard.get(idx)!);
    }

    await app.vault.modify(file, result);
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds an `obsidian://open` URI that opens `filePath` inside `vaultName`.
 * Both parameters are percent-encoded.
 *
 * @param vaultName - The target Obsidian vault name.
 * @param filePath  - File path or wikilink target within the vault.
 */
function buildObsidianUri(vaultName: string, filePath: string): string {
    return (
        `obsidian://open?` +
        `vault=${encodeURIComponent(vaultName)}&` +
        `file=${encodeURIComponent(filePath)}`
    );
}

/**
 * Resolves a cloze span's numeric ID from its raw `id` attribute string.
 * Falls back to `autoId()` when the value is absent or not a valid positive
 * integer.
 *
 * @param rawId  - Raw string value of the element's `id` attribute, or `null`.
 * @param autoId - Generator that returns the next available auto-assigned ID.
 */
function resolveClozeId(rawId: string | null, autoId: () => number): number {
    if (rawId === null) return autoId();
    const n = parseInt(rawId, 10);
    return Number.isFinite(n) && n > 0 ? n : autoId();
}

/**
 * Parses a string as a strict decimal integer (digits only, no surrounding
 * non-numeric characters).  Returns `null` for any invalid input, avoiding
 * the silent truncation behaviour of `parseInt` (e.g. `"123abc"` → `123`).
 *
 * @param value - The string to parse.
 */
function parseStrictInt(value: string): number | null {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
}

/**
 * Attribute names preserved when serialising a generic element.
 * All other attributes (including Obsidian-internal `data-*` attributes)
 * are intentionally dropped to keep Anki output clean.
 */
const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'class', 'id']);

/**
 * Returns the allowed attributes of `el` as a single HTML attribute string
 * (leading space included) ready to embed in an opening tag.
 * Attribute values are escaped (`&` → `&amp;`, `"` → `&quot;`).
 *
 * @param el - The element whose attributes are serialised.
 */
function attrsOf(el: HTMLElement): string {
    return Array.from(el.attributes)
        .filter(({ name }) => ALLOWED_ATTRS.has(name))
        .map(({ name, value }) => {
            const safe = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            return ` ${name}="${safe}"`;
        })
        .join('');
}

/**
 * Extracts Anki-style tags from a rendered metadata line element.
 * Obsidian renders `#foo/bar` as `<a class="tag" href="#foo/bar">`;
 * each `href` is converted by stripping the leading `#` and replacing
 * `/` separators with `::`.
 *
 * @param lineEl - A `<p>` or `<li>` element from the rendered metadata callout.
 */
function extractTagsFromEl(lineEl: HTMLElement): Set<string> {
    return new Set(
        Array.from(
            lineEl.querySelectorAll<HTMLAnchorElement>('a.tag'),
            a => (a.getAttribute('href') ?? '').replace(/^#/, '').replace(/\//g, '::'),
        ).filter(Boolean)
    );
}

/**
 * Fallback tag parser used when no DOM element is available for a metadata
 * line.  Splits space- or comma-separated tokens and converts each
 * `#foo/bar` token to `foo::bar`.
 *
 * @param text - The raw text value after the `tags:` key.
 */
function extractTagsFromText(text: string): Set<string> {
    return new Set(
        text
            .split(/[\s,]+/)
            .map(token => token.replace(/^#/, '').replace(/\//g, '::'))
            .filter(Boolean)
    );
}