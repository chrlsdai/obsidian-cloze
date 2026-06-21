import { Plugin } from "obsidian";
import { } from './settings';
import { parseFileWithLocations } from './parser';
import { createNoteConverter, NoteModelConfig } from "./anki-note";


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
			id: 'sync-notes',
			name: "Sync Notes",
			callback: async() => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return;
				console.log(parseFileWithLocations(this.app, activeFile));
			}
		})
		this.registerMarkdownPostProcessor((el: HTMLElement) => {
			this.renderCardClozes(el);
		});
	}

	// private syncCards() {
	// 	const config = getConfig();
	// 	const files = getChangedFiles(this.app);
	// 	for (const file of files) {
	// 		const notes: ankiNotes[] = parseFile(file, config);
	// 		const result = syncNotestoAnki(notes);
	// 		updateNoteData(notes, result);
	// 	}
	// }

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