import { Notice, Plugin, TFile, TFolder } from "obsidian";
import { ClozeSettingTab, DEFAULT_SETTINGS, PluginSettings } from './settings/tab';
import { renderCardClozes } from "./postprocessing";

import { NoteFile } from "./note/file";
import { resolveConfig, pushNotes } from "./anki/pusher";
import { AnkiConnectClient } from "./anki/connect-client";
import { AnkiConfig } from "./anki/payload-factory";
import { tagFloatingNotes as applyFloatingTag, FLOATING_TAG } from "./anki/tagger";

interface PluginData {
    fileSyncTimes: Record<string, number>;
    settings: PluginSettings;
}

export default class ClozePlugin extends Plugin {
    settings: PluginSettings = DEFAULT_SETTINGS;
    private fileSyncTimes: Record<string, number> = {};

    // Populated asynchronously by loadAnkiSuggestions(); read by ClozeSettingTab.
    deckSuggestions: string[] = [];
    modelSuggestions: string[] = [];

    /** Registers commands, the settings tab, and the cloze post-processor. */
    async onload() {
        console.clear();
        await this.loadSettings();
        this.addSettingTab(new ClozeSettingTab(this.app, this));

        const statusBar = this.addStatusBarItem();

        this.addCommand({
            id: 'sync-vault',
            name: 'Sync Vault',
            callback: async () => void this.syncVault(statusBar)
        });

        this.addCommand({
            id: "reset-cache",
            name: "Reset Cache",
            callback: async () => void this.resetCache()
        });

        this.addCommand({
            id: "tag-floating-notes",
            name: "Tag Floating Notes",
            callback: async () => void this.tagFloatingNotes()
        });

        this.registerMarkdownPostProcessor((el: HTMLElement) => {
            renderCardClozes(el);
        });

        // Fetch Anki deck/model names in the background.
        // Intentionally not awaited so onload() returns immediately.
        this.loadAnkiSuggestions();
    }

    // ── Settings ─────────────────────────────────────────────────────────────────

    /** Loads plugin data from disk, falling back to defaults for anything missing. */
    async loadSettings() {
        const saved = (await this.loadData())
        this.fileSyncTimes = saved?.fileSyncTimes ?? {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved?.settings ?? {})
    }

    /** Persists settings and file-sync timestamps to disk. */
    async saveSettings(): Promise<void> {
        const data: PluginData = {
            fileSyncTimes: this.fileSyncTimes,
            settings: this.settings,
        }
        await this.saveData(data);
    }

    // ── Anki suggestions ─────────────────────────────────────────────────────────

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

    // ── Sync ─────────────────────────────────────────────────────────────────────

    /** Resolves Anki config, then syncs every file that needs it. */
    private async syncVault(statusBar: HTMLElement): Promise<void> {
        const files = this.collectFilesNeedingSync();
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

    /** Pushes each file to Anki in order, reporting progress on `statusBar`. */
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
     *
     * IDs are persisted before any push error is thrown, so a partial
     * failure (e.g. one duplicate note rejected by Anki) doesn't cause the
     * successfully-added notes in the same file to lose their IDs and get
     * duplicated on the next sync.
     */
    private async processFile(
        file: TFile,
        config: AnkiConfig,
        client: AnkiConnectClient,
    ): Promise<void> {
        const noteFile = await NoteFile.load(this.app, file);

        const { updates, errors } = await pushNotes(
            noteFile.notes,
            config,
            noteFile.context,
            client,
        );
        await noteFile.updateNotes(updates);

        if (errors.length > 0) {
            throw errors.length === 1
                ? errors[0]!
                : new Error(errors.map(e => e.message).join('\n'));
        }
    }

    // ── Tag floating notes ───────────────────────────────────────────────────────

    /**
     * Scans the entire vault (respecting scanFolder), collects every Anki note
     * ID that still exists in Obsidian, then tags any Anki note in the
     * configured deck whose ID is absent from that set.
     */
    private async tagFloatingNotes(): Promise<void> {
        const allFiles = this.collectScopedFiles();
        if (allFiles === null) {
            new Notice('Scan folder is set but does not point to a valid folder.');
            return;
        }

        new Notice('Scanning vault for note IDs…');
        const vaultNoteIds = await this.collectVaultNoteIds(allFiles);

        new Notice('Connecting to Anki…');
        const client = new AnkiConnectClient();

        try {
            const count = await applyFloatingTag(
                this.settings.deckName,
                vaultNoteIds,
                client,
            );
            if (count === 0) {
                new Notice('No floating notes found.');
            } else {
                new Notice(`Tagged ${count} floating note(s) with "${FLOATING_TAG}".`);
            }
        } catch (error: unknown) {
            new Notice(`Failed to tag floating notes: ${String(error)}`);
        }
    }

    /**
     * Loads every file in `files` and accumulates the Anki IDs of all notes
     * found within them.  Files that fail to parse are skipped with a console
     * warning so that one bad file cannot abort the entire scan.
     */
    private async collectVaultNoteIds(files: TFile[]): Promise<Set<number>> {
        const ids = new Set<number>();
        for (const file of files) {
            try {
                const noteFile = await NoteFile.load(this.app, file);
                for (const note of noteFile.notes) {
                    if (note.id !== undefined) ids.add(note.id);
                }
            } catch (error: unknown) {
                console.warn(
                    `Skipping "${file.path}" while collecting note IDs: ${String(error)}`
                );
            }
        }
        return ids;
    }

    // ── File collection ──────────────────────────────────────────────────────────

    /**
     * Returns every TFile within the configured scan scope:
     * the whole vault when scanFolder is empty, or the named folder's tree
     * otherwise. Returns null when scanFolder is set but does not resolve to
     * a valid TFolder.
     */
    private collectScopedFiles(): TFile[] | null {
        if (!this.settings.scanFolder) return this.app.vault.getFiles();
        const folder = this.app.vault.getAbstractFileByPath(
            this.settings.scanFolder,
        );
        return folder instanceof TFolder ? this.collectFilesInFolder(folder) : null;
    }

    /**
     * Returns only those scoped files that have been modified since their last
     * sync. Returns null when the scan scope itself cannot be resolved.
     */
    private collectFilesNeedingSync(): TFile[] | null {
        return this.collectScopedFiles()?.filter(file => {
            const lastSync = this.fileSyncTimes[file.path];
            return lastSync === undefined || file.stat.mtime > lastSync;
        }) ?? null;
    }

    /** Recursively collects every TFile within a TFolder. */
    private collectFilesInFolder(folder: TFolder): TFile[] {
        const files: TFile[] = [];
        for (const child of folder.children) {
            if (child instanceof TFile) files.push(child);
            else if (child instanceof TFolder) files.push(...this.collectFilesInFolder(child));
        }
        return files;
    }

    // ── Data persistence ─────────────────────────────────────────────────────────

    /** Clears file-sync timestamps so the next sync re-processes every file. */
    private async resetCache(): Promise<void> {
        this.fileSyncTimes = {};
        await this.saveSettings();
        new Notice("Last run timestamp reset. Next run will return all files.");
    }
}