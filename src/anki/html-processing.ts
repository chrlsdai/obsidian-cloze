import { NoteContext } from "../note/schema";
import { MediaResolutionContext, resolveNoteMedia } from "./media";

/** Converts a rendered note body into Anki-ready HTML, uploading any image embeds to Anki. */
export async function convertHtml(
    el: HTMLElement,
    ctx: NoteContext,
    mediaCtx: MediaResolutionContext,
): Promise<string> {
    const clone = el.cloneNode(true) as HTMLElement;

    await resolveNoteMedia(clone, ctx, mediaCtx);
    transformClozes(clone);
    transformInternalLinks(clone, ctx);
    stripAttributes(clone);
    return clone.innerHTML;
}

/**
 * Replaces every `span.cloze` in `el` with Anki's `{{cN::body}}` syntax,
 * transforming inner clozes before outer ones so nested clozes stay valid.
 */
export function transformClozes(el: HTMLElement): void {
    const isValidId = (n: number): boolean => Number.isInteger(n) && n > 0;

    // first pass to collect all used ids
    const reservedIds = new Set(
        [...el.querySelectorAll('span.cloze[id]')]
            .map(span => parseInt(span.id, 10))
            .filter(isValidId)
    );

    // returns the next positive integer not already used
    let counter = 1;
    function nextId(): number {
        while (reservedIds.has(counter)) counter++;
        const id = counter++;
        reservedIds.add(id);
        return id;
    }

    const transformNode = (node: Element): void => {
        // post-order recursion to transform inner clozes before outer clozes
        for (const child of [...node.children]) transformNode(child);

        // actual replacement of text
        if (node !== el && node.matches('span.cloze')) {
            const num = parseInt(node.getAttribute('id') ?? '', 10);
            const id = (Number.isInteger(num) && num > 0) ? num : nextId();
            const body = node.innerHTML; // inner spans already replaced by recursion
            const hint = node.getAttribute('hint');

            node.replaceWith(
                hint
                    ? `{{c${id}::${body}::${hint}}}`
                    : `{{c${id}::${body}}}`
            );
        }
    };

    transformNode(el);
}

/** Rewrites Obsidian internal-link hrefs in `el` to `obsidian://open` URLs. */
export function transformInternalLinks(
    el: HTMLElement,
    ctx: NoteContext
): void {
    for (const link of el.querySelectorAll<HTMLAnchorElement>('a.internal-link[data-href]')) {
        const target = link.dataset.href;
        if (target) link.href = buildObsidianOpenUrl(ctx.vaultName, target)
    };
}

/** Builds an `obsidian://open` URL for `fileName` in `vaultName`. */
export function buildObsidianOpenUrl(
    vaultName: string,
    fileName: string,
    baseUrl = 'obsidian://open'
): string {
    return `${baseUrl}?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(fileName)}`;
}

const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'class', 'id']);

/** Strips every attribute from `el` and its descendants except `ALLOWED_ATTRS`. */
export function stripAttributes(el: HTMLElement): void {
    for (const node of el.querySelectorAll('*')) {
        for (const { name } of [...node.attributes]) {
            if (!ALLOWED_ATTRS.has(name)) node.removeAttribute(name);
        }
    }
}
