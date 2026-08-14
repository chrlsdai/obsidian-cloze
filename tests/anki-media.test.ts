/**
 * Tests for src/anki/media.ts — resolving image embeds to Anki media
 * uploads, with content-hash caching so identical images are never
 * re-read or re-uploaded twice.
 */

import { resolveNoteMedia, createEmptyMediaCache, MediaCache } from '../src/anki/media';

const CTX = { vaultName: 'MyVault', fileName: 'Note.md', filePath: 'Note.md' };

/** Wraps HTML in a container, mirroring how Obsidian renders note content. */
function makeEl(html: string): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
}

function embedHtml(link: string, alt?: string): string {
    return `<span class="internal-embed image-embed" src="${link}" alt="${alt ?? link}">` +
        `<img src="app://mock-resource/${link}" alt="${alt ?? link}"></span>`;
}

interface FakeFile {
    path: string;
    extension: string;
    stat: { mtime: number };
}

function makeFile(path: string, mtime = 1): FakeFile {
    const extension = path.split('.').pop()!;
    return { path, extension, stat: { mtime } };
}

/** Builds a fake `app` whose vault serves `content` for whichever file is resolved. */
function makeApp(
    files: Record<string, FakeFile>,
    content: Record<string, string>,
) {
    const readBinary = jest.fn(async (file: FakeFile) => {
        const text = content[file.path] ?? '';
        // Buffer.from(text).buffer would return Node's shared pool ArrayBuffer
        // (not sliced to this string), making identical content hash
        // differently by coincidence — build an exactly-sized buffer instead.
        return Uint8Array.from(text, (c) => c.charCodeAt(0)).buffer;
    });
    return {
        metadataCache: {
            getFirstLinkpathDest: jest.fn((link: string) => files[link] ?? null),
        },
        vault: {
            readBinary,
            adapter: {
                getFullPath: jest.fn((path: string) => `/vault/${path}`),
            },
        },
    };
}

function makeClient() {
    return { storeMediaFile: jest.fn().mockResolvedValue('ok') };
}

describe('resolveNoteMedia — user embeds an image in a flashcard note', () => {
    it('uploads a new image and rewrites the embed to a plain <img> with the Anki filename', async () => {
        const el = makeEl(embedHtml('diagram.png'));
        const app = makeApp({ 'diagram.png': makeFile('diagram.png') }, { 'diagram.png': 'bytes-a' });
        const client = makeClient();
        const cache = createEmptyMediaCache();

        await resolveNoteMedia(el, CTX, { app: app as any, client: client as any, cache });

        expect(el.querySelector('.internal-embed')).toBeNull();
        const img = el.querySelector('img')!;
        expect(img.getAttribute('src')).toMatch(/^[0-9a-f]{64}\.png$/);
    });

    it('uploads to the absolute filesystem path resolved via the vault adapter', async () => {
        const el = makeEl(embedHtml('diagram.png'));
        const app = makeApp({ 'diagram.png': makeFile('diagram.png') }, { 'diagram.png': 'bytes-a' });
        const client = makeClient();

        await resolveNoteMedia(el, CTX, { app: app as any, client: client as any, cache: createEmptyMediaCache() });

        expect(client.storeMediaFile).toHaveBeenCalledWith(
            expect.stringMatching(/^[0-9a-f]{64}\.png$/),
            '/vault/diagram.png',
        );
    });

    it('carries the alt attribute over onto the new <img>', async () => {
        const el = makeEl(embedHtml('diagram.png', 'A labelled diagram'));
        const app = makeApp({ 'diagram.png': makeFile('diagram.png') }, { 'diagram.png': 'bytes-a' });

        await resolveNoteMedia(el, CTX, { app: app as any, client: makeClient() as any, cache: createEmptyMediaCache() });

        expect(el.querySelector('img')!.getAttribute('alt')).toBe('A labelled diagram');
    });

    it('resolves multiple distinct embeds in the same note independently', async () => {
        const el = makeEl(embedHtml('a.png') + embedHtml('b.jpg'));
        const app = makeApp(
            { 'a.png': makeFile('a.png'), 'b.jpg': makeFile('b.jpg') },
            { 'a.png': 'content-a', 'b.jpg': 'content-b' },
        );
        const client = makeClient();

        await resolveNoteMedia(el, CTX, { app: app as any, client: client as any, cache: createEmptyMediaCache() });

        const imgs = [...el.querySelectorAll('img')];
        expect(imgs).toHaveLength(2);
        expect(imgs[0].getAttribute('src')).toMatch(/\.png$/);
        expect(imgs[1].getAttribute('src')).toMatch(/\.jpg$/);
        expect(imgs[0].getAttribute('src')).not.toBe(imgs[1].getAttribute('src'));
        expect(client.storeMediaFile).toHaveBeenCalledTimes(2);
    });

    // ── Content-addressed dedup ──────────────────────────────────────────────

    describe('when identical image content is embedded more than once', () => {
        it('skips the second storeMediaFile call and reuses the same filename', async () => {
            // Two different vault paths, byte-identical content.
            const el = makeEl(embedHtml('copy1.png') + embedHtml('copy2.png'));
            const app = makeApp(
                { 'copy1.png': makeFile('copy1.png'), 'copy2.png': makeFile('copy2.png') },
                { 'copy1.png': 'same bytes', 'copy2.png': 'same bytes' },
            );
            const client = makeClient();

            await resolveNoteMedia(el, CTX, { app: app as any, client: client as any, cache: createEmptyMediaCache() });

            expect(client.storeMediaFile).toHaveBeenCalledTimes(1);
            const imgs = [...el.querySelectorAll('img')];
            expect(imgs[0].getAttribute('src')).toBe(imgs[1].getAttribute('src'));
        });

        it('skips re-upload across separate calls when the cache is reused', async () => {
            const cache = createEmptyMediaCache();
            const client = makeClient();

            const first = makeEl(embedHtml('v1/diagram.png'));
            const app1 = makeApp({ 'v1/diagram.png': makeFile('v1/diagram.png') }, { 'v1/diagram.png': 'same bytes' });
            await resolveNoteMedia(first, CTX, { app: app1 as any, client: client as any, cache });

            const second = makeEl(embedHtml('v2/diagram.png'));
            const app2 = makeApp({ 'v2/diagram.png': makeFile('v2/diagram.png') }, { 'v2/diagram.png': 'same bytes' });
            await resolveNoteMedia(second, CTX, { app: app2 as any, client: client as any, cache });

            expect(client.storeMediaFile).toHaveBeenCalledTimes(1);
        });
    });

    // ── mtime-gated re-hash ───────────────────────────────────────────────────

    describe('re-syncing a file whose image embed is unchanged', () => {
        it('does not re-read the file when its mtime matches the cached entry', async () => {
            const cache = createEmptyMediaCache();
            const client = makeClient();
            const file = makeFile('diagram.png', 100);

            const first = makeEl(embedHtml('diagram.png'));
            const app = makeApp({ 'diagram.png': file }, { 'diagram.png': 'bytes-a' });
            await resolveNoteMedia(first, CTX, { app: app as any, client: client as any, cache });
            expect(app.vault.readBinary).toHaveBeenCalledTimes(1);

            const second = makeEl(embedHtml('diagram.png'));
            await resolveNoteMedia(second, CTX, { app: app as any, client: client as any, cache });

            expect(app.vault.readBinary).toHaveBeenCalledTimes(1);
            expect(client.storeMediaFile).toHaveBeenCalledTimes(1);
        });

        it('re-hashes and re-uploads when the file mtime changes with new content', async () => {
            const cache = createEmptyMediaCache();
            const client = makeClient();
            const file = makeFile('diagram.png', 100);
            const content: Record<string, string> = { 'diagram.png': 'bytes-a' };
            const app = makeApp({ 'diagram.png': file }, content);

            await resolveNoteMedia(makeEl(embedHtml('diagram.png')), CTX, { app: app as any, client: client as any, cache });

            file.stat.mtime = 200;
            content['diagram.png'] = 'bytes-b';
            const el = makeEl(embedHtml('diagram.png'));
            await resolveNoteMedia(el, CTX, { app: app as any, client: client as any, cache });

            expect(app.vault.readBinary).toHaveBeenCalledTimes(2);
            expect(client.storeMediaFile).toHaveBeenCalledTimes(2);
            expect(el.querySelector('img')!.getAttribute('src')).toMatch(/^[0-9a-f]{64}\.png$/);
        });
    });

    // ── Tolerant skipping ─────────────────────────────────────────────────────

    describe('embeds that should be left untouched', () => {
        it('leaves an embed unresolved (no vault file) exactly as rendered', async () => {
            const el = makeEl(embedHtml('missing.png'));
            const before = el.innerHTML;
            const app = makeApp({}, {});

            await resolveNoteMedia(el, CTX, { app: app as any, client: makeClient() as any, cache: createEmptyMediaCache() });

            expect(el.innerHTML).toBe(before);
        });

        it('leaves a non-image embed (e.g. audio) untouched and never uploads it', async () => {
            const el = makeEl(embedHtml('clip.mp3'));
            const before = el.innerHTML;
            const app = makeApp({ 'clip.mp3': makeFile('clip.mp3') }, { 'clip.mp3': 'audio bytes' });
            const client = makeClient();

            await resolveNoteMedia(el, CTX, { app: app as any, client: client as any, cache: createEmptyMediaCache() });

            expect(el.innerHTML).toBe(before);
            expect(client.storeMediaFile).not.toHaveBeenCalled();
        });

        it('does nothing when the note contains no embeds at all', async () => {
            const el = makeEl('<p>Just text, no images.</p>');
            const before = el.innerHTML;
            const client = makeClient();

            await resolveNoteMedia(el, CTX, { app: makeApp({}, {}) as any, client: client as any, cache: createEmptyMediaCache() });

            expect(el.innerHTML).toBe(before);
            expect(client.storeMediaFile).not.toHaveBeenCalled();
        });
    });
});

describe('createEmptyMediaCache', () => {
    it('returns a fresh cache with empty fileHashes and uploads maps', () => {
        const cache: MediaCache = createEmptyMediaCache();
        expect(cache.fileHashes).toEqual({});
        expect(cache.uploads).toEqual({});
    });
});
