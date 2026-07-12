import {
    App,
    PluginSettingTab,
    Setting,
} from "obsidian";
import type ClozePlugin from "../main";
import { FolderSuggest, StringSuggest } from "./suggest";

export interface PluginSettings {
    deckName: string;
    modelName: string;
    scanFolder: string;
    sourceField: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    deckName: "Default",
    modelName: "Cloze",
    scanFolder: "",
    sourceField: "",
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
            .addText((text) => {
                text
                    .setPlaceholder("Default")
                    .setValue(this.plugin.settings.deckName)
                    .onChange(async (value) => {
                        this.plugin.settings.deckName = value.trim();
                        await this.plugin.saveSettings();
                    });
                new StringSuggest(
                    this.app,
                    text.inputEl,
                    () => this.plugin.deckSuggestions,
                    async (selected) => {
                        this.plugin.settings.deckName = selected;
                        await this.plugin.saveSettings();
                    },
                );
            });

        new Setting(containerEl)
            .setName("Model name")
            .setDesc("The Anki note type to use.")
            .addText((text) => {
                text
                    .setPlaceholder("Cloze")
                    .setValue(this.plugin.settings.modelName)
                    .onChange(async (value) => {
                        this.plugin.settings.modelName = value.trim();
                        await this.plugin.saveSettings();
                    });
                new StringSuggest(
                    this.app,
                    text.inputEl,
                    () => this.plugin.modelSuggestions,
                    async (selected) => {
                        this.plugin.settings.modelName = selected;
                        await this.plugin.saveSettings();
                    },
                );
            });

        new Setting(containerEl)
            .setName("Scan folder")
            .setDesc(
                "Vault folder to scan for cards. Leave empty to scan the entire vault."
            )
            .addText((text) => {
                text
                    .setPlaceholder("/")
                    .setValue(this.plugin.settings.scanFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.scanFolder = value.trim();
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(
                    this.app,
                    text.inputEl,
                    async (selected) => {
                        this.plugin.settings.scanFolder = selected;
                        await this.plugin.saveSettings();
                    },
                );
            });

        new Setting(containerEl)
            .setName("Source field")
            .setDesc("Optional. The name of an Anki field to populate with a link back to the Obsidian file containing the card. Leave empty to disable.")
            .addText(e => {
                e.setPlaceholder("e.g. Source")
                    .setValue(this.plugin.settings.sourceField)
                    .onChange(async n => {
                        this.plugin.settings.sourceField = n.trim(),
                            await this.plugin.saveSettings()
                    }
                )
            })
    }
}