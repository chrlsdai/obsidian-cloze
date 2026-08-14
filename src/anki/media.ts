import { createHash } from "crypto";
import type { App, FileSystemAdapter, TFile } from "obsidian";
import { NoteContext } from "../note/schema";
import { AnkiConnectClient } from "./connect-client";

/** Image extensions eligible for upload; other embed types (audio/video/PDF) are left untouched. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp"]);

/**
 * Two-level, content-addressed cache persisted alongside the plugin's other
 * data so identical image content is never re-hashed or re-uploaded twice.
 */
export interface MediaCache {
    /** Vault path -> last-hashed mtime/hash, so an unchanged file skips a re-read. */
    fileHashes: Record<string, { mtime: number; hash: string }>;
    /** Content hash -> Anki upload record, so identical content is uploaded once. */
    uploads: Record<string, { filename: string; uploadedAt: number }>;
}

export function createEmptyMediaCache(): MediaCache {
    return { fileHashes: {}, uploads: {} };
}

/** A dependency bundle threaded through the payload-building pipeline. */
export interface MediaResolutionContext {
    app: App;
    client: AnkiConnectClient;
    cache: MediaCache;
}

/**
 * Resolves every image embed in `el` to an Anki media filename, uploading
 * any not-yet-seen content to Anki. Mutates `el` in place, replacing each
 * resolved embed wrapper with a plain `<img src="...">`. Embeds that don't
 * resolve to a vault file, or whose extension isn't an image type, are left
 * untouched.
 */
export async function resolveNoteMedia(
    el: HTMLElement,
    ctx: NoteContext,
    { app, client, cache }: MediaResolutionContext,
): Promise<void> {
    const embeds = [...el.querySelectorAll<HTMLElement>(".internal-embed[src]")];

    for (const embed of embeds) {
        const link = embed.getAttribute("src");
        if (!link) continue;

        const file = app.metadataCache.getFirstLinkpathDest(link, ctx.filePath);
        if (!file || !IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) continue;

        const filename = await resolveUpload(file, app, client, cache);

        const img = createEl("img");
        img.setAttribute("src", filename);
        const alt = embed.getAttribute("alt");
        if (alt) img.setAttribute("alt", alt);
        embed.replaceWith(img);
    }
}

/** Returns the Anki media filename for `file`'s current content, uploading it if needed. */
async function resolveUpload(
    file: TFile,
    app: App,
    client: AnkiConnectClient,
    cache: MediaCache,
): Promise<string> {
    const hash = await hashVaultFile(file, app, cache);

    const existing = cache.uploads[hash];
    if (existing) return existing.filename;

    const filename = `${hash}.${file.extension.toLowerCase()}`;
    const absolutePath = (app.vault.adapter as FileSystemAdapter).getFullPath(file.path);
    await client.storeMediaFile(filename, absolutePath);
    cache.uploads[hash] = { filename, uploadedAt: Date.now() };
    return filename;
}

/** Returns the content hash of `file`, reusing the cached hash when the file's mtime is unchanged. */
async function hashVaultFile(file: TFile, app: App, cache: MediaCache): Promise<string> {
    const cached = cache.fileHashes[file.path];
    if (cached && cached.mtime === file.stat.mtime) return cached.hash;

    const buffer = await app.vault.readBinary(file);
    const hash = createHash("sha256").update(Buffer.from(buffer)).digest("hex");
    cache.fileHashes[file.path] = { mtime: file.stat.mtime, hash };
    return hash;
}
