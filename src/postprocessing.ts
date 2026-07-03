import { NOTE_SELECTOR } from "./note/schema";

const CLOZE_REGEX = /\{(?:(\d+):)?([^:}]+)(?:::([^}]*?))?\}/g;

/** Render all cloze spans within flashcard elements in the given block. */
export function renderCardClozes(el: HTMLElement): void {
    el.querySelectorAll(NOTE_SELECTOR).forEach(renderClozeSpans);
}

function getTextNodes(root: Element): Text[] {
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
    const frag = document.createDocumentFragment();
    let cursor = 0;

    for (const match of matches) {
        const [full, id, answer, hint] = match;
        const start = match.index!;
        if (start > cursor) frag.append(text.slice(cursor, start));
        frag.createSpan({ text: answer, cls: "cloze", attr: { ...(id && { id }), ...(hint && { hint }) } });
        cursor = start + full.length;
    }

    if (cursor < text.length) frag.append(text.slice(cursor));
    return frag;
}

function renderClozeSpans(el: Element): void {
    for (const textNode of getTextNodes(el)) {
        const text = textNode.textContent ?? "";
        const matches = [...text.matchAll(CLOZE_REGEX)];
        if (matches.length) textNode.replaceWith(buildClozeFragment(text, matches));
    }
}