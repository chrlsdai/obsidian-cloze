import { Notice, Plugin, TFile, TFolder } from "obsidian";
import { ClozeSettingTab, DEFAULT_SETTINGS, PluginSettings } from './settings/tab';
import { renderCardClozes } from "./postprocessing";

import { NoteFile } from "./note/file";
import { resolveConfig, pushNotes } from "./anki/pusher";
import { AnkiConnectClient } from "./anki/connect-client";
import { AnkiConfig } from "./anki/payload-factory";

interface PluginData {
    fileSyncTimes: Record<string, number>;
    settings: PluginSettings;
}

const DEFAULT_DATA: PluginData = {
    fileSyncTimes: {},
    settings: DEFAULT_SETTINGS,
}

export default class ClozePlugin extends Plugin {
    settings: PluginSettings = DEFAULT_SETTINGS;
    private fileSyncTimes: Record<string, number> = {};

    // Populated asynchronously by loadAnkiSuggestions(); read by ClozeSettingTab.
    deckSuggestions: string[] = [];
    modelSuggestions: string[] = [];

    async onload() {
        // console.clear()
        await this.loadSettings()
        this.addSettingTab(new ClozeSettingTab(this.app, this));

        const statusBar = this.addStatusBarItem();

        this.addCommand({
            id: 'sync-vault',
            name: 'Sync Vault',
            callback: async () => void this.runSync(statusBar)
        })

        this.addCommand({
            id: "reset-cache",
            name: "Reset Cache",
            callback: async () => void this.resetCache()
        });

        this.registerMarkdownPostProcessor((el: HTMLElement) => {
            renderCardClozes(el);
        });

        // Fetch Anki deck/model names in the background.
        // Intentionally not awaited so onload() returns immediately.
        this.loadAnkiSuggestions();
    }

    // ── Settings ─────────────────────────────────────────────────────────────

    async loadSettings() {
        const saved = (await this.loadData())
        this.fileSyncTimes = saved?.fileSyncTimes ?? {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved?.settings ?? {})
    }

    async saveSettings(): Promise<void> {
        const data: PluginData = {
            fileSyncTimes: this.fileSyncTimes,
            settings: this.settings,
        }
        await this.saveData(data);
    }

    // ── Anki suggestions ─────────────────────────────────────────────────────

    private async loadAnkiSuggestions(): Promise<void> {
        try {
            const client = new AnkiConnectClient()
            const [decks, models] = await Promise.all([
                client.fetchDeckNames(),
                client.fetchModelNames(),
            ]);
            this.deckSuggestions = decks;
            this.modelSuggestions = models;
        } catch { }
    }

    // ── Sync ──────────────────────────────────────────────────────────────

    private async runSync(statusBar: HTMLElement): Promise<void> {
        const files = this.collectFiles();
        if (files === null) {
            new Notice('Scan folder is set but does not point to a valid folder.');
            return;
        }
        if (files.length === 0) {
            new Notice('No files to process. Everything is up to date!');
            return;
        }

        new Notice('Connecting…');
        const client = new AnkiConnectClient();

        let configResult;
        try {
            configResult = await resolveConfig(
                this.settings.deckName,
                this.settings.modelName,
                this.settings.sourceField,
                client
            );
        } catch (error: unknown) {
            new Notice(String(error))
            return;
        }
        new Notice('Connected. Now processing.');

        await this.syncFiles(
            files,
            configResult,
            client,
            statusBar,
        );
    }

    private async syncFiles(
        files: TFile[],
        config: AnkiConfig,
        client: AnkiConnectClient,
        statusBar: HTMLElement,
    ): Promise<void> {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file) continue;

            statusBar.setText(`⚙️ Processing: ${i + 1} / ${files.length}`);

            try {
                await this.processFile(file, config, client);
                this.fileSyncTimes[file.path] = Date.now();
            } catch (error: unknown) {
                new Notice(`Error processing "${file.name}". Check the console for details.`);
                console.error(`${file.path}: ${String(error)}`);
            }
        }

        await this.saveSettings();
        statusBar.setText('✅ Done!');
        new Notice(`Finished processing ${files.length} files.`);
        setTimeout(() => statusBar.setText(''), 5_000);
    }

    /**
 * Loads one file, pushes its cards to Anki, and writes new IDs back.
 * All fallible steps return Result — no try/catch needed here.
 */
    private async processFile(
        file: TFile,
        config: AnkiConfig,
        client: AnkiConnectClient,
    ): Promise<void> {
        const noteFile = await NoteFile.load(this.app, file);

        const updates = await pushNotes(
            noteFile.notes,
            config,
            noteFile.context,
            client,
        );
        noteFile.updateNotes(updates);
    }

    // ── File collection ───────────────────────────────────────────────────────

    /**
     * Returns files to process filtered by the lastRun timestamp.
     * Returns null when scanFolder is configured but is not a valid TFolder.
     */
    private collectFiles(): TFile[] | null {
        if (!this.settings.scanFolder) return this.getFilesNeedingSync();
        const folder = this.app.vault.getAbstractFileByPath(
            this.settings.scanFolder,
        );
        return folder instanceof TFolder ? this.getFilesNeedingSync(folder) : null;
    }

    private getFilesNeedingSync(folder?: TFolder): TFile[] {
        const files = folder ? this.walkFolder(folder) : this.app.vault.getFiles();
        return files.filter(file => {
            const lastSync = this.fileSyncTimes[file.path];
            return lastSync === undefined || file.stat.mtime > lastSync;
        });
    }

    /** Recursively collects every TFile within a TFolder. */
    private walkFolder(folder: TFolder): TFile[] {
        const files: TFile[] = [];
        for (const child of folder.children) {
            if (child instanceof TFile) files.push(child);
            else if (child instanceof TFolder) files.push(...this.walkFolder(child));
        }
        return files;
    }

    // ── Data persistence ────────────────────────────────────────────────────
    private async resetCache(): Promise<void> {
        this.fileSyncTimes = {};
        await this.saveSettings();
        new Notice("Last run timestamp reset. Next run will return all files.");
    }
}