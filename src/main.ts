import { MarkdownRenderer, Plugin } from 'obsidian';
import { } from './settings';

const CLOZE_REGEX = /\{(?:\d+:)?([^:}]+)(?:::[^}]*?)?\}/g;
const BLOCK_TAGS_INCLUDED = ["p", "li", "table"];
const BLOCK_TAGS_EXCLUDED = ["code", "blockquote"];

export default class ClozePlugin extends Plugin {
	async onload() {
		console.clear()
		this.registerMarkdownPostProcessor((el: HTMLElement) => {
			this.labelEmptyFlashcardLines(el);
			this.processClozes(el);
		});
	}


	private labelEmptyFlashcardLines(el: HTMLElement) {
		el.querySelectorAll('.callout[data-callout="card"] .callout-content p')
			.forEach(p => {
				console.log(p.nodeName)
				const effectivelyEmpty = [...p.childNodes].every(node => {
					if (!node) return true;
					if (node.nodeType === Node.TEXT_NODE) {
						return node.textContent?.trim() === '';
					}
					if (node.nodeType === Node.ELEMENT_NODE) {
						return node.nodeName === 'BR';
					}
					return false;
				});

				if (effectivelyEmpty) {
					p.setAttr('data-card-empty', true);
				}
			});
	}

	private isValidTextNode(node: Node) {
		return (node.parentElement?.closest(BLOCK_TAGS_INCLUDED.join(", ")) !== null)
			&& (node.parentElement?.closest(BLOCK_TAGS_EXCLUDED.join(", ")) === null)
			&& !!node.textContent?.trim();
	}

	private processClozes(el: HTMLElement) {
		const walker = document.createTreeWalker(
			el,
			NodeFilter.SHOW_TEXT,
			{
				acceptNode: (node: Node) => {
					return this.isValidTextNode(node)
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

		const re = new RegExp(CLOZE_REGEX.source, CLOZE_REGEX.flags)
		blocks.forEach((textblock) => {
			if (!textblock) return;

			const text = textblock?.textContent ?? "";

			// build new text to put into the block
			let hasCloze = false;
			const fragment = document.createDocumentFragment();
			let lastIndex = 0;
			for (const match of text.matchAll(re)) {
				hasCloze = true;
				fragment.append(text.slice(lastIndex, match.index));
				fragment.createSpan({ text: match[1] });
				lastIndex = (match.index ?? 0) + match[0].length;
			}
			if (!hasCloze) return;

			// add tail end of text
			fragment.append(text.slice(lastIndex));
			textblock.replaceWith(fragment);
		});
	}

}