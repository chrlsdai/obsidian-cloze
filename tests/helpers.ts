/**
 * Shared DOM-building helpers that replicate the HTML structure that Obsidian's
 * MarkdownRenderer produces for `[!card]` callouts, so that `parseCard` and
 * `parseFile` can be exercised without running the real renderer.
 *
 * Key structural invariant:
 *   div.callout[data-callout="card"]
 *     div.callout-content
 *       …body nodes…
 *       div.callout[data-callout="card-metadata"]   ← optional
 *         div.callout-title
 *         div.callout-content                        ← metadata text here
 */
export function buildCardElement(options: {
    bodyHtml?: string;
    metadata?: Record<string, string>;
}): HTMLElement {
    const card = document.createElement("div");
    card.className = "callout";
    card.setAttribute("data-callout", "card");

    const contentEl = document.createElement("div");
    contentEl.className = "callout-content";

    // ── Body ──────────────────────────────────────────────────────────────────
    if (options.bodyHtml) {
        const tmp = document.createElement("div");
        tmp.innerHTML = options.bodyHtml;
        while (tmp.firstChild) contentEl.appendChild(tmp.firstChild);
    }

    // ── Metadata sub-callout ──────────────────────────────────────────────────
    if (options.metadata && Object.keys(options.metadata).length > 0) {
        const metaCallout = document.createElement("div");
        metaCallout.className = "callout";
        metaCallout.setAttribute("data-callout", "card-metadata");

        const metaTitle = document.createElement("div");
        metaTitle.className = "callout-title";
        metaTitle.textContent = "card-metadata";
        metaCallout.appendChild(metaTitle);

        const metaContent = document.createElement("div");
        metaContent.className = "callout-content";
        // Join with "\n" so that extractMetadata's textContent.split("\n") works.
        metaContent.textContent = Object.entries(options.metadata)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n");

        metaCallout.appendChild(metaContent);
        contentEl.appendChild(metaCallout);
    }

    card.appendChild(contentEl);
    return card;
}

/** Wraps multiple card elements in a top-level container for `parseFile`. */
export function buildDocument(...cards: HTMLElement[]): HTMLElement {
    const doc = document.createElement("div");
    for (const card of cards) doc.appendChild(card);
    return doc;
}