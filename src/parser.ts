/** Key-value pairs extracted from the `card-metadata` sub-callout. */
export type CardFields = Record<string, string>;

/** A fully parsed Anki card derived from a `[!card]` callout. */
export interface ParsedCard {
    valid: boolean;
    id?: number;
    tags: Set<string>;
    cardFields: CardFields;
    text: string;
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
export function parseCards(documentEl: HTMLElement, vaultName: string): ParsedCard[] {
    if (!(documentEl instanceof HTMLElement)) {
        throw new TypeError(`documentEl must be an HTMLElement, got ${typeof documentEl}`);
    }
    if (typeof vaultName !== 'string' || vaultName.trim() === '') {
        throw new TypeError('vaultName must be a non-empty string');
    }
    const cardEls = documentEl.querySelectorAll<HTMLElement>(
        '.callout[data-callout="card"]',
    );

    const results: ParsedCard[] = [];
    for (const el of Array.from(cardEls)) {
        results.push(parseCard(el, vaultName));
    }
    return results;
}

/**
 * Parses a single `.callout[data-callout="card"]` element into a {@link ParsedCard}.
 *
 * @param cardElement - The card callout DOM element to parse.
 * @param vaultName   - Vault name used to build `obsidian://` URIs for internal links.
 */
export function parseCard(cardElement: HTMLElement, vaultName: string): ParsedCard {
    if (!(cardElement instanceof HTMLElement)) {
        throw new TypeError(`cardElement must be an HTMLElement, got ${typeof cardElement}`);
    }
    if (typeof vaultName !== 'string' || vaultName.trim() === '') {
        throw new TypeError('vaultName must be a non-empty string');
    }
    const { valid, cardFields, id, tags } = extractMetadata(cardElement);
    return { valid, id, tags, cardFields, text: extractText(cardElement, vaultName) };
}

// ─── Metadata extraction ──────────────────────────────────────────────────────

/**
 * Extracts `id`, `tags`, and additional key-value fields from the
 * `card-metadata` sub-callout nested inside `card`.
 *
 * Plain `textContent` splitting is used to generate fields. All fields
 * must be a single line.
 * 
 * Metadata `valid` is true if the metadata is correctly formed.
 */
function extractMetadata(
    card: HTMLElement,
): Pick<ParsedCard, 'valid' | 'cardFields' | 'id' | 'tags' > {
    const cardFields: CardFields = {};
    let valid: boolean = true;
    let id: number | undefined;
    let tags: Set<string> = new Set();

    const metadataEls = card.querySelectorAll<HTMLElement>(
        '.callout-content > .callout[data-callout="card-metadata"]',
    );
    if (metadataEls.length > 1) {
        valid = false;
    }

    const contentEl = metadataEls[0]?.querySelector<HTMLElement>('.callout-content');
    if (!contentEl) return { valid, cardFields, id, tags };

    for (const line of (contentEl.textContent ?? '').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const sep = trimmed.indexOf(':');
        if (sep <= 0) continue;
        const key = trimmed.slice(0, sep).trim();
        const value = trimmed.slice(sep + 1).trim();
        if (!key) continue;

        if (key === 'id') {
            const n = parseStrictInt(value);
            if (n === null || n <= 0) {
                valid = false;
            } else {
                id = n;
            }
        }
        else if (key === 'tags') { tags = extractTags(value); }
        else { cardFields[key] = value; }
    }

    return { valid, cardFields, id, tags };
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
    clone.querySelector(':scope > .callout[data-callout="card-metadata"]')?.remove();
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
    return Number.isSafeInteger(n) ? n : null;
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
            const safe = value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
            return ` ${name}="${safe}"`;
        })
        .join('');
}
/**
 * Fallback tag parser used when no DOM element is available for a metadata
 * line.  Splits space- or comma-separated tokens and converts each
 * `#foo/bar` token to `foo::bar`.
 *
 * @param text - The raw text value after the `tags:` key.
 */
function extractTags(text: string): Set<string> {
    return new Set(
        text
            .split(/[\s,]+/)
            .map(token => token.replace(/^#/, '').replace(/\//g, '::'))
            .filter(Boolean)
    );
}