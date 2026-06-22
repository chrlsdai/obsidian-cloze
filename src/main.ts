import { Plugin } from "obsidian";
import { } from './settings';
import { parseCards, ParsedCard } from './parser';
import { getActiveHTML } from "./helpers";
import { CardFile, filterValidCards } from "./obsidian-card";
import { generateUpdates, getConfig, syncNotes } from "./anki-note";
// import { createNoteConverter, NoteModelConfig } from "./anki-note";

const deckName = "Default";
const modelName = "Cloze";
const CLOZE_REGEX = /\{(?:\d+:)?([^:}]+)(?:::[^}]*?)?\}/g;

/*
main.ts
|--> markdown postprocessing (clozes to spans)
|--> 

*/

export default class ClozePlugin extends Plugin {
	async onload() {
		console.clear()
		this.addCommand({
			id: 'parse-notes',
			name: "Parse Notes",
			callback: async() => {
				const activeHTML = await getActiveHTML(this.app);
				if (!activeHTML) return;
				console.log(parseCards(activeHTML, this.app.vault.getName()));
			}
		})
		this.addCommand({
			id: 'parse-file',
			name: "Parse File",
			callback: async() => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return;
				const cards = await CardFile.load(this.app, activeFile)
				if (!cards.cards[0] || !cards.cards[1]) return;
				cards.writeCards([{card: cards.cards[0], fields: {"id": "123"}}, {card: cards.cards[1], fields: {"suspended": "false", "id": "45"}}])
				console.log(await CardFile.load(this.app, activeFile))
			}
		})
		this.addCommand({
			id: 'sync-vault',
			name: 'Sync Vault',
			callback: async() => {
				this.syncCards()
			}
		})
		this.registerMarkdownPostProcessor((el: HTMLElement) => {
			this.renderCardClozes(el);
		});
	}

	private async syncCards() {
		const config = await getConfig(deckName, modelName);
		// const files = getChangedFiles(this.app);
		const files = [this.app.workspace.getActiveFile()]
		for (const file of files) {
			if (!file) continue;
			const cardFile = await CardFile.load(this.app, file);
			const cardsToSync = filterValidCards(cardFile.cards);
			const results = await syncNotes(cardsToSync, config);
			const updates = generateUpdates(cardsToSync, results);
			await cardFile.writeCards(updates);
		}
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