import { AbstractInputSuggest, App, TFolder } from "obsidian";

/**
 * Generic autocomplete over a lazily-evaluated string list.
 *
 * Accepting a getter rather than a static array means the source list can
 * be populated asynchronously after construction — for example, deck / model
 * names fetched from Anki on plugin load — and suggestions will always reflect
 * the latest values without needing to reconstruct the widget.
 */
export class StringSuggest extends AbstractInputSuggest<string> {
    private readonly getList: () => string[];
    private readonly onSelectCb: (value: string) => void;

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        getList: () => string[],
        onSelect: (value: string) => void,
    ) {
        super(app, inputEl);
        this.getList = getList;
        this.onSelectCb = onSelect;
    }

    getSuggestions(inputStr: string): string[] {
        const lower = inputStr.toLowerCase();
        return this.getList().filter((s) => s.toLowerCase().includes(lower));
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    selectSuggestion(value: string, _evt: MouseEvent | KeyboardEvent): void {
        this.setValue(value);
        this.onSelectCb(value);
        this.close();
    }
}

/**
 * Autocomplete for vault folder paths attached to a text input element.
 *
 * The sentinel value "/" represents the vault root.  It is shown to the user
 * as "/" but stored as an empty string (meaning "scan the entire vault") so
 * that the setting value stays consistent with the rest of the codebase.
 */
export class FolderSuggest extends AbstractInputSuggest<string> {
    private readonly onSelectCb: (value: string) => void;

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        onSelect: (value: string) => void,
    ) {
        super(app, inputEl);
        this.onSelectCb = onSelect;
    }

    getSuggestions(inputStr: string): string[] {
        const lower = inputStr.toLowerCase();
        return this.collectFolderPaths().filter((p) =>
            p.toLowerCase().includes(lower),
        );
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    /**
     * Converts the display sentinel "/" back to "" before persisting,
     * then notifies the caller and closes the popup.
     */
    selectSuggestion(value: string, _evt: MouseEvent | KeyboardEvent): void {
        const stored = value === "/" ? "" : value;
        this.setValue(stored);
        this.onSelectCb(stored);
        this.close();
    }

    // ── private ────────────────────────────────────────────────────────────

    private collectFolderPaths(): string[] {
        const paths: string[] = ["/"];

        const recurse = (folder: TFolder): void => {
            for (const child of folder.children) {
                if (child instanceof TFolder) {
                    paths.push(child.path);
                    recurse(child);
                }
            }
        };

        recurse(this.app.vault.getRoot());
        return paths;
    }
}