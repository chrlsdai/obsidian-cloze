import { AnkiNote } from "./anki-note";
import { invoke } from "./anki-connect";


// try {
//     const result = await invoke('deckNames');
//     console.log(`got list of decks: ${result}`);
// } catch (error) {
//     console.error(error)
// }

const cloze = AnkiNote.createCloze(
    "Default",
    "The French Revolution began in {{c1::1789}}.",
    "Caused by economic hardship and social inequality.",
    ["history", "europe"]
);

try {
    const result = await invoke('addNote', { "note": cloze.toAnkiConnect() });
} catch (e) {
    console.error(e);
}

// console.log(cloze.toAnkiConnect())