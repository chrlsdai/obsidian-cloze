DEST := /Users/charlesdai/Documents/HMS/Medical Learning/.obsidian/plugins/o2a
SRC  := .

transfer:
	npm run build && cp $(SRC)/main.js $(SRC)/manifest.json $(SRC)/styles.css "$(DEST)/"

build:
	npm run build

dev:
	npm run dev

test:
	npm test