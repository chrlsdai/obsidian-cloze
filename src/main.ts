import { Notice, Plugin, TFile, TFolder } from "obsidian";
import { } from './settings';
import { parseCards, ParsedCard } from './parser';
import { getActiveHTML } from "./helpers";
import { CardFile, filterValidCards } from "./obsidian-card";
import { generateUpdates, getConfig, syncNotes } from "./anki-note";
// import { createNoteConverter, NoteModelConfig } from "./anki-note";

const deckName = "Default";
const modelName = "Cloze";
const scanFolder = "notes";
const CLOZE_REGEX = /\{(?:\d+:)?([^:}]+)(?:::[^}]*?)?\}/g;

interface PluginData {
	lastRun: number | null;
}

const DEFAULT_DATA: PluginData = {
	lastRun: null,
};

export default class ClozePlugin extends Plugin {
	data: PluginData = DEFAULT_DATA;

	async onload() {
		this.data = Object.assign({}, DEFAULT_DATA, await this.loadData());
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
				const folder = this.app.vault.getAbstractFileByPath(scanFolder)
				let files;
				if (!scanFolder) {
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
	}

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

	private async syncCards(files: TFile[], statusBar: HTMLElement): Promise<boolean> {
		new Notice("Connecting...");

		let config;
		try {
			config = await getConfig(deckName, modelName);
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
			statusBar.setText(`⚙️ Processing: ${i + 1} / ${files.length} — ${file.name}`);
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

	/*
	Find and render all clozes in flashcards in given block.
	*/
	private renderCardClozes(el: HTMLElement) {
		const cards = el.querySelectorAll('.callout[data-callout="card"]')
		cards.forEach(card => this.renderClozeSpans(card));
	}

	private readonly clozeRe = new RegExp(CLOZE_REGEX.source, CLOZE_REGEX.flags);

	/*
	Given a flashcard, replace all clozes in the form {1:foo::bar} with 
	span containing the answer text. 
	*/
	private renderClozeSpans(el: Element) {
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

			this.clozeRe.lastIndex = 0;
			if (!this.clozeRe.test(text)) return;
			this.clozeRe.lastIndex = 0;

			// build new text to put into the block
			const fragment = document.createDocumentFragment();
			let lastIndex = 0;
			for (const match of text.matchAll(this.clozeRe)) {
				const slice = text.slice(lastIndex, match.index)
				if (slice) fragment.append(slice);
				fragment.createSpan({
					text: match[1],
					cls: 'cloze',
				});
				lastIndex = (match.index ?? 0) + match[0].length;
			}
			// add tail end of text
			const posttext = text.slice(lastIndex);
			if (posttext) fragment.append(posttext);

			textblock.replaceWith(fragment);
		});
	}
}