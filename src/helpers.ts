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
