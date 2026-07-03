# Obsidian Cloze

Author Anki cloze flashcards as `[!note]` callout blocks in Obsidian, preview them with visual highlights, and sync to Anki via AnkiConnect.

---

## Requirements

- [Anki](https://apps.ankiweb.net/) with the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on installed and running

---

## Writing Cards

Cards are written as `[!note]` callouts. Wrap cloze deletions in curly braces:

```markdown
> [!note]-
> The capital of France is {Paris}.
```

### Cloze syntax

| Syntax | Result |
|---|---|
| `{text}` | Auto-numbered cloze |
| `{1:text}` | Explicitly numbered cloze |
| `{text::hint}` | Cloze with a hint |
| `{1:text::hint}` | Numbered cloze with a hint |

### Metadata block

Attach an optional nested `[!note-metadata]` callout to store the Anki note ID, tags, and extra fields:

```markdown
> [!note]-
> The powerhouse of the cell is the {mitochondria}.
>
>> [!note-metadata]-
>> id: 1234567890
>> tags: biology, cell
```

> **Note:** The `id` field is written automatically by the plugin after the first sync. Do not edit it manually.

---

## Syncing

1. Open the Command Palette (`Ctrl/Cmd + P`).
2. Run **Obsidian Cloze: Sync Vault**.

The plugin scans for files modified since the last sync, adds new cards to Anki, and updates existing ones. A status bar item shows live progress.

To force a full re-scan of all files, run **Obsidian Cloze: Reset Cache**.

---

## Settings

| Setting | Description | Default |
|---|---|---|
| **Deck name** | Anki deck to sync cards into | `Default` |
| **Model name** | Anki note type to use | `Cloze` |
| **Scan folder** | Vault folder to scan (empty = entire vault) | *(empty)* |

---

## License

MIT