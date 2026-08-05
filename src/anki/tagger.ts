import { AnkiConnectClient } from "./connect-client";

/**
 * Tag applied in Anki to notes that can no longer be found anywhere in the
 * Obsidian vault.  Uses a hyphenated name so it sorts cleanly in the Anki
 * browser without introducing a `::` namespace hierarchy.
 */
export const FLOATING_TAG = "obsidian-floating";

/**
 * Identifies every note in `deckName` whose ID is absent from `vaultNoteIds`
 * and applies `tag` to those notes via AnkiConnect.
 *
 * A note is considered "floating" when it was originally created by this
 * plugin (and therefore has a numeric ID that was written back to Obsidian)
 * but the corresponding `[!note]` block can no longer be found in the vault —
 * either because the file was deleted, the callout was removed, or the scan
 * folder was changed.
 *
 * @param deckName     - The Anki deck to inspect.
 * @param vaultNoteIds - Every Anki note ID found across all vault files.
 * @param client       - An active AnkiConnect client.
 * @param tag          - Tag to apply; defaults to {@link FLOATING_TAG}.
 * @returns The number of notes that were tagged.
 */
export async function tagFloatingNotes(
    deckName: string,
    vaultNoteIds: ReadonlySet<number>,
    client: AnkiConnectClient,
    tag = FLOATING_TAG,
): Promise<number> {
    const ankiIds = await client.findNotes(`deck:"${deckName}"`);
    const floatingIds = ankiIds.filter(id => !vaultNoteIds.has(id));

    if (floatingIds.length === 0) return 0;

    await client.addTags(floatingIds, tag);
    return floatingIds.length;
}