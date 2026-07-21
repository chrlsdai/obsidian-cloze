DEST := /Users/charlesdai/Documents/HMS/Medical Learning/.obsidian/plugins/obsidian-cloze
SRC  := .

transfer:
	npm run build && cp $(SRC)/main.js $(SRC)/manifest.json $(SRC)/styles.css "$(DEST)/"

build:
	npm run build

dev:
	npm run dev

test:
	npm test

code-text:
	find src -type f | xargs tail -n +1 > code-text.txt