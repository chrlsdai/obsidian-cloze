import { Plugin } from 'obsidian';
import { } from './settings';

const CLOZE_REGEX = /\{(?:\d+:)?([^:}]+)(?:::[^}]*?)?\}/g;

export default class ClozePlugin extends Plugin {
	async onload() {
		console.clear()
		this.registerMarkdownPostProcessor((el: HTMLElement) => {
			this.labelEmptyCardLines(el);
			this.renderCardClozes(el);
		});
	}

	/* Check if a node is either empty or only contains a linebreak */
	private isEffectivelyEmpty(node: Node): boolean {
		if (node.nodeType === Node.TEXT_NODE) {
			return node.textContent?.trim() === '';
		}
		if (node.nodeType === Node.ELEMENT_NODE) {
			return node.nodeName === 'BR';
		}
		return false;
	}
	/*
	Label paragraphs within callout blocks as empty, for css to pick up on.
	Essentially to hide property data in the beginning of flashcards.
	*/
	private labelEmptyCardLines(el: HTMLElement) {
		const paragraphs = el.querySelectorAll(
			'.callout[data-callout="card"] .callout-content p'
		);

		paragraphs.forEach(p => {
			const effectivelyEmpty =
				p.childNodes.length === 0 ||
				[...p.childNodes].every(node => this.isEffectivelyEmpty(node));

			if (effectivelyEmpty) {
				p.setAttr('data-card-empty', 'true');
			}
		});
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