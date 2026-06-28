import { App, Component, MarkdownRenderer, MarkdownView, Notice } from "obsidian";

/**
 * Reads the currently active Markdown file from the Obsidian workspace, renders
 * it to a detached DOM element via {@link MarkdownRenderer} (which resolves
 * callouts, embeds, and relative links), and returns that element.
 *
 * @returns The rendered container `<div>`, or `null` if no Markdown file is active.
 */
export async function getActiveHTML(app: App): Promise<HTMLElement | null> {
    const view = app.workspace.getActiveViewOfType(MarkdownView);

    if (!view?.file) {
        new Notice("No active Markdown file found.");
        return null;
    }

    const container = createEl("div");
    const markdown = await app.vault.cachedRead(view.file);

    // A Component is required to manage the lifecycle of any rendered widgets
    // (e.g. embeds, live-preview blocks).
    const component = new Component();
    component.load();

    try {
        await MarkdownRenderer.render(
            app,
            markdown,
            container,
            view.file.path,   // required for resolving relative links and embeds
            component,
        );
    } finally {
        component.unload();
    }

    return container;
}

const CLOZE_REGEX = /\{(?:(\d+):)?([^:}]+)(?:::([^}]*?))?\}/g;

/*
Given a flashcard, replace all clozes in the form {1:foo::bar} with 
span containing the answer text. 
*/
export function renderClozeSpans(el: Element) {
    const clozeRe = new RegExp(CLOZE_REGEX.source, CLOZE_REGEX.flags);
    const walker = document.createTreeWalker(
        el,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node: Node) => {
                return !!node.textContent?.trim()
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_SKIP;
            }
        }
    );

    const blocks: Text[] = [];
    let current = walker.nextNode() as Text | null;
    while (current) {
        blocks.push(current)
        current = walker.nextNode() as Text | null;
    }

    blocks.forEach((textblock) => {
        const text = textblock?.textContent;

        clozeRe.lastIndex = 0;
        if (!clozeRe.test(text)) return;
        clozeRe.lastIndex = 0;

        // build new text to put into the block
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        for (const match of text.matchAll(clozeRe)) {
            const slice = text.slice(lastIndex, match.index)
            if (slice) fragment.append(slice);
            fragment.createSpan({
                text: match[2],
                cls: 'cloze',
                ...((match[1] || match[3]) && {
                    attr: {
                        ...(match[1] && { id: match[1] }),
                        ...(match[3] && { hint: match[3] })
                    }
                })
            });
            lastIndex = (match.index ?? 0) + match[0].length;
        }
        // add tail end of text
        const posttext = text.slice(lastIndex);
        if (posttext) fragment.append(posttext);

        textblock.replaceWith(fragment);
    });
}