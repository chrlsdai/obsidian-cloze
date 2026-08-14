import { NOTE_SELECTOR } from "./note/schema";

export const CLOZE_REGEX = /\{([^{}]+)\}/g;

export interface ParsedCloze {
    id?: string;
    answer: string;
    hint?: string;
}

/**
 * Splits the inside of a `{...}` cloze span into its optional leading `N:`
 * note number, the answer text, and an optional trailing `::hint`.
 *
 * The answer may itself contain single colons (e.g. `{The ratio is 3:4}`) —
 * only a literal `::` is treated as the hint delimiter, and only a digit run
 * immediately followed by `:` at the very start is treated as a note number.
 */
export function parseClozeBody(body: string): ParsedCloze {
    const idMatch = body.match(/^(\d+):/);
    const rest = idMatch ? body.slice(idMatch[0].length) : body;

    const hintSep = rest.lastIndexOf('::');
    const answer = hintSep === -1 ? rest : rest.slice(0, hintSep);
    const hint = hintSep === -1 ? undefined : rest.slice(hintSep + 2);

    return { id: idMatch?.[1], answer, hint };
}

/** Render all cloze spans within flashcard elements in the given block. */
export function renderCardClozes(el: HTMLElement): void {
    el.querySelectorAll(NOTE_SELECTOR).forEach(renderClozeSpans);
}

function collectTextNodes(root: Element): Text[] {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: ({ textContent }: Node) =>
            textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
    });
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node as Text);
    return nodes;
}

function buildClozeFragment(text: string, matches: RegExpMatchArray[]): DocumentFragment {
    const frag = createFragment();
    let cursor = 0;

    for (const match of matches) {
        const [full, body] = match;
        const { id, answer, hint } = parseClozeBody(body!);
        const start = match.index!;
        if (start > cursor) frag.append(text.slice(cursor, start));
        frag.createSpan({ text: answer, cls: "cloze", attr: { ...(id && { id }), ...(hint && { hint }) } });
        cursor = start + full.length;
    }

    if (cursor < text.length) frag.append(text.slice(cursor));
    return frag;
}

function renderClozeSpans(el: Element): void {
    for (const textNode of collectTextNodes(el)) {
        const text = textNode.textContent ?? "";
        const matches = [...text.matchAll(CLOZE_REGEX)];
        if (matches.length) textNode.replaceWith(buildClozeFragment(text, matches));
    }
}