import { Notice, Plugin, TFile, TFolder } from "obsidian";
import { ClozeSettingTab, PluginSettings } from './settings';
import { CardFile, filterValidCards } from "./obsidian-card";
import { generateUpdates, getConfig, syncNotes } from "./anki-note";
import { getDeckNames, getModelNames } from "./anki-connect";
import { renderClozeSpans } from "./helpers";

interface PluginData {
	lastRun: number | null;
}

const DEFAULT_DATA: PluginData = {
	lastRun: null,
};

const DEFAULT_SETTINGS: PluginSettings = {
	deckName: 'Default',
	modelName: 'Cloze',
	scanFolder: '',
}

export default class ClozePlugin extends Plugin {
	data: PluginData = DEFAULT_DATA;
	settings: PluginSettings = DEFAULT_SETTINGS;

	// Populated asynchronously by loadAnkiSuggestions().
	// StringSuggest holds a getter that reads these, so it always sees the
	// latest values without needing to be reconstructed.
	deckSuggestions: string[] = [];
	modelSuggestions: string[] = [];

	async onload() {
		await this.loadSettings()

		const statusBar = this.addStatusBarItem();

		this.addCommand({
			id: 'parse-file',
			name: "Parse File",
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return;
				this.syncCards([activeFile], statusBar);
			}
		})
		this.addCommand({
			id: 'sync-vault',
			name: 'Sync Vault',
			callback: async () => {
				const folder = this.app.vault.getAbstractFileByPath(this.settings.scanFolder)
				let files;
				if (!this.settings.scanFolder) {
					files = await this.getFilesSinceLastRun();
				}
				else if (folder instanceof TFolder) {
					files = await this.getFilesSinceLastRun(folder);
				} else {
					throw Error("Folder is set, but does not point to a valid folder.")
				}
				if (files.length === 0) {
					new Notice("No files to process. Everything is up to date!");
					return;
				}
				if (await this.syncCards(files, statusBar)) {
					this.updateLastRun();
				}
			}
		})
		this.addCommand({
			id: "reset-cache",
			name: "Reset Cache",
			callback: async () => {
				await this.resetLastRun();
			},
		});
		this.registerMarkdownPostProcessor((el: HTMLElement) => {
			this.renderCardClozes(el);
		});

		// Fetch Anki deck/model names in the background.
		// Intentionally not awaited so onload() returns immediately.
		this.loadAnkiSuggestions();
	}

	// ── Settings ─────────────────────────────────────────────────────────────

	async loadSettings() {
		const saved = (await this.loadData())
		this.data = Object.assign({}, DEFAULT_DATA, { lastRun: saved.lastRun ?? null });
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved.settings ?? {})
		this.addSettingTab(new ClozeSettingTab(this.app, this));
	}

	async saveSettings(): Promise<void> {
		await this.saveData({
			lastRun: this.data.lastRun,
			settings: this.settings,
		});
	}

	// ── Anki suggestions ─────────────────────────────────────────────────────

	private async loadAnkiSuggestions(): Promise<void> {
		try {
			const [decks, models] = await Promise.all([
				getDeckNames(),
				getModelNames(),
			]);
			this.deckSuggestions = decks;
			this.modelSuggestions = models;
		} catch {
			// Anki not reachable at startup; suggestions remain empty.
			// The user can still type values manually.
		}
	}

	// ── Files search for sync ────────────────────────────────────────────────────

	async getFilesSinceLastRun(folder?: TFolder): Promise<TFile[]> {
		const { lastRun } = this.data;

		// Get files from folder (recursive) or entire vault
		const files = folder
			? this.getFilesInFolder(folder)
			: this.app.vault.getFiles();

		if (lastRun === null) {
			return files;
		}

		return files.filter((file) => file.stat.mtime > lastRun);
	}

	// Recursively get all TFiles within a TFolder
	getFilesInFolder(folder: TFolder): TFile[] {
		const files: TFile[] = [];

		for (const child of folder.children) {
			if (child instanceof TFile) {
				files.push(child);
			} else if (child instanceof TFolder) {
				files.push(...this.getFilesInFolder(child));
			}
		}

		return files;
	}

	private async updateLastRun(): Promise<void> {
		this.data.lastRun = Date.now();
		await this.saveData(this.data);
	}

	private async resetLastRun(): Promise<void> {
		this.data.lastRun = null;
		await this.saveData(this.data);
		new Notice("Last run timestamp reset. Next run will return all files.");
	}

	// ── Sync ─────────────────────────────────────────────────────────────
	private async syncCards(files: TFile[], statusBar: HTMLElement): Promise<boolean> {
		new Notice("Connecting...");

		let config;
		try {
			config = await getConfig(this.settings.deckName, this.settings.modelName);
			if (!config) {
				throw new Error("No config returned");
			}
		} catch (err) {
			new Notice("Was not able to connect to Anki! Try again.");
			statusBar.setText("");
			return false;
		}
		new Notice("Connected. Now processing.");

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (!file) continue;
			statusBar.setText(`⚙️ Processing: ${i + 1} / ${files.length}`);
			const cardFile = await CardFile.load(this.app, file);
			const cardsToSync = filterValidCards(cardFile.cards);
			const results = await syncNotes(cardsToSync, config);
			const updates = generateUpdates(cardsToSync, results);
			await cardFile.writeCards(updates);
		}

		statusBar.setText("✅ Done!");
		new Notice(`Finished processing ${files.length} files.`);
		setTimeout(() => statusBar.setText(""), 5000);
		return true;
	}


	// ── Rendering ─────────────────────────────────────────────────────────────

	// Find and render all clozes in flashcards in given block.
	private renderCardClozes(el: HTMLElement) {
		const cards = el.querySelectorAll('.callout[data-callout="card"]')
		cards.forEach(card => renderClozeSpans(card));
	}
}