import { Notice, Plugin, TFile, TFolder } from "obsidian";
import { ClozeSettingTab, DEFAULT_SETTINGS, PluginSettings } from './settings/tab';
import { renderCardClozes } from "./postprocessing";

import { NoteFile } from "./note/file";
import { resolveConfig, pushNotes } from "./anki/pusher";
import { AnkiConnectClient } from "./anki/connect-client";
import { AnkiConfig } from "./anki/payload-factory";

interface PluginData {
    lastRun: number | null;
    settings: PluginSettings;
}

const DEFAULT_DATA: PluginData = {
    lastRun: null,
    settings: DEFAULT_SETTINGS,
}

export default class ClozePlugin extends Plugin {
    settings: PluginSettings = DEFAULT_SETTINGS;
    private lastRun: number | null = null;

    // Populated asynchronously by loadAnkiSuggestions(); read by ClozeSettingTab.
    deckSuggestions: string[] = [];
    modelSuggestions: string[] = [];

    async onload() {
        console.clear()
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
            callback: async () => void this.resetLastRun()
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
        this.lastRun = saved?.lastRun ?? DEFAULT_DATA.lastRun;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved.settings ?? {})
    }

    async saveSettings(): Promise<void> {
        const data: PluginData = {
            lastRun: this.lastRun,
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
                client
            );
        } catch (error: unknown) {
            new Notice(String(error))
            return;
        }

        new Notice('Connected. Now processing.');
        const allSucceeded = await this.syncFiles(
            files,
            configResult,
            client,
            statusBar,
        );
        if (allSucceeded) await this.updateLastRun();
    }

    private async syncFiles(
        files: TFile[],
        config: AnkiConfig,
        client: AnkiConnectClient,
        statusBar: HTMLElement,
    ): Promise<boolean> {
        let allSucceeded = true;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file) continue;

            statusBar.setText(`⚙️ Processing: ${i + 1} / ${files.length}`);

            try {
                await this.processFile(file, config, client);
            } catch(error: unknown) {
                allSucceeded = false;
                new Notice(`Error processing "${file.name}". Check the console for details.`);
                console.error(`${file.path}: ${String(error)}`);
            }
        }

        statusBar.setText('✅ Done!');
        new Notice(`Finished processing ${files.length} files.`);
        setTimeout(() => statusBar.setText(''), 5_000);
        return allSucceeded;
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
        if (!this.settings.scanFolder) {
            return this.getFilesModifiedSince(this.lastRun);
        }

        const folder = this.app.vault.getAbstractFileByPath(
            this.settings.scanFolder,
        );
        if (!(folder instanceof TFolder)) return null;

        return this.getFilesModifiedSince(this.lastRun, folder);
    }

    private getFilesModifiedSince(since: number | null, folder?: TFolder): TFile[] {
        const all = folder ? this.walkFolder(folder) : this.app.vault.getFiles();
        return since === null ? all : all.filter(f => f.stat.mtime > since);
    }

    /** Recursively collects every TFile within a TFolder. */
    private walkFolder(folder: TFolder): TFile[] {
        const files: TFile[] = [];
        for (const child of folder.children) {
            if (child instanceof TFile)        files.push(child);
            else if (child instanceof TFolder) files.push(...this.walkFolder(child));
        }
        return files;
    }

    // ── Data persistence ────────────────────────────────────────────────────
    private async updateLastRun(): Promise<void> {
        this.lastRun = Date.now();
        await this.saveSettings();
    }

    private async resetLastRun(): Promise<void> {
        this.lastRun = null;
        await this.saveSettings();
        new Notice("Last run timestamp reset. Next run will return all files.");
    }
}