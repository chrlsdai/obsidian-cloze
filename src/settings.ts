import {
    AbstractInputSuggest,
    App,
    PluginSettingTab,
    Setting,
    TFolder,
} from "obsidian";
import type ClozePlugin from "./main";

export interface PluginSettings {
    deckName: string;
    modelName: string;
    scanFolder: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    deckName: "All Cards",
    modelName: "Cloze",
    scanFolder: "notes",
};

export class ClozeSettingTab extends PluginSettingTab {
    plugin: ClozePlugin;

    constructor(app: App, plugin: ClozePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Cloze Plugin Settings" });

        new Setting(containerEl)
            .setName("Deck name")
            .setDesc("The Anki deck to sync cards into.")
            .addText((text) =>
                text
                    .setPlaceholder("Default")
                    .setValue(this.plugin.settings.deckName)
                    .onChange(async (value) => {
                        this.plugin.settings.deckName = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Model name")
            .setDesc("The Anki note type to use.")
            .addText((text) =>
                text
                    .setPlaceholder("Cloze")
                    .setValue(this.plugin.settings.modelName)
                    .onChange(async (value) => {
                        this.plugin.settings.modelName = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Scan folder")
            .setDesc(
                "Vault folder to scan for cards. Leave empty to scan the entire vault."
            )
            .addText((text) =>
                text
                    .setPlaceholder("")
                    .setValue(this.plugin.settings.scanFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.scanFolder = value.trim();
                        await this.plugin.saveSettings();
                    })
            );
    }
}

/**
 * Suggests vault folder paths. "/" represents the root and is stored as "".
 */
export class FolderSuggest extends AbstractInputSuggest<string> {
    private readonly onSelectCb: (value: string) => void;

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        onSelect: (value: string) => void
    ) {
        super(app, inputEl);
        this.onSelectCb = onSelect;
    }

    getSuggestions(inputStr: string): string[] {
        const lower = inputStr.toLowerCase();
        return this.collectFolderPaths().filter((p) =>
            p.toLowerCase().includes(lower)
        );
    }

    private collectFolderPaths(): string[] {
        const paths: string[] = ["/"];
        const recurse = (folder: TFolder) => {
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

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    selectSuggestion(value: string, _evt: MouseEvent | KeyboardEvent): void {
        // "/" means scan the entire vault → stored as empty string
        const stored = value === "/" ? "" : value;
        this.setValue(stored);
        this.onSelectCb(stored);
        this.close();
    }
}

/**
 * Suggests strings from a list provided via a getter function.
 * Using a getter (rather than a static array) means the list can be
 * populated asynchronously after construction and the suggest will always
 * see the latest values.
 */
export class StringSuggest extends AbstractInputSuggest<string> {
    private readonly getList: () => string[];
    private readonly onSelectCb: (value: string) => void;

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        getList: () => string[],
        onSelect: (value: string) => void
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