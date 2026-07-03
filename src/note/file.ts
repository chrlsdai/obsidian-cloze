import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import { Note, NoteContext, NoteLocation, NoteUpdate } from "./schema";
import { parseNotesFromElement } from "./parsing";
import { locateNotes, applyNoteUpdates } from "./writing";

/**
 * Represents a single Obsidian markdown file containing flashcard notes.
 * Constructed exclusively via {@link NoteFile.load}. Write access is
 * single-use — after one successful write the instance becomes stale and
 * refuses further writes.
 */
export class NoteFile {
    private _notes: Note[] = [];
    private _locations: NoteLocation[] = [];
    private _isStale = false;
    private _markdown: string = '';

    private constructor(
        private readonly _context: NoteContext,
        private readonly _write: (content: string) => Promise<void>,
    ) { }

    // ── Construction ──────────────────────────────────────────────────────────

    /**
     * Reads the file, renders its markdown to HTML, and cross-references
     * located note positions with parsed notes.
     *
     * @param app  - The Obsidian app instance.
     * @param file - The vault file to load.
     * @returns A fully initialised `NoteFile` instance.
     * @throws {NoteFileMismatchError} If the number of note locations found in
     *   raw markdown differs from the number of notes parsed from rendered HTML.
     */
    static async load(app: App, file: TFile): Promise<NoteFile> {
        const context: NoteContext = {
            vaultName: app.vault.getName(),
            fileName: file.name,
            filePath: file.path
        }
        const instance = new NoteFile(
            context,
            (content) => app.vault.modify(file, content),
        );
        await instance._parse(app, file);
        return instance;
    }

    // ── Accessors ────────────────────────────────────────────────────────────

    get notes(): ReadonlyArray<Note> {
        return this._notes;
    }

    get context(): NoteContext {
        return this._context;
    }

    get needsReload(): boolean {
        return this._isStale;
    }

    // ── Read ─────────────────────────────────────────────────────────────────

    /**
     * Reads and parses the file, populating `_markdown`, `_locations`,
     * and `_notes`.
     *
     * @param app  - The Obsidian app instance.
     * @param file - The vault file to parse.
     * @throws {NoteFileMismatchError} If located and parsed note counts differ.
     */
    private async _parse(app: App, file: TFile): Promise<void> {
        const markdown = await app.vault.read(file);
        const locations = locateNotes(markdown);
        const container = await this._renderToElement(app, markdown, file.path);
        const rawNotes = parseNotesFromElement(container);

        if (rawNotes.length !== locations.length) {
            throw new NoteFileMismatchError(locations.length, rawNotes.length);
        }

        this._markdown = markdown;
        this._locations = locations;
        this._notes = rawNotes;
    }

    /**
     * Renders markdown to an offscreen HTML element via Obsidian's renderer.
     *
     * @param app      - The Obsidian app instance.
     * @param markdown - Raw markdown string to render.
     * @param filePath - Path of the source file, used for resolving links.
     * @returns A `div` element containing the rendered output.
     */
    private async _renderToElement(
        app: App,
        markdown: string,
        filePath: string,
    ): Promise<HTMLElement> {
        const container = document.createElement('div');
        const component = new Component();
        component.load();
        try {
            await MarkdownRenderer.render(app, markdown, container, filePath, component);
        } finally {
            component.unload();
        }
        return container;
    }

    // ── Write ────────────────────────────────────────────────────────────────

    /**
     * Applies field updates to notes and writes the result back to disk.
     * Marks the instance stale after a successful write.
     *
     * @param updates - One record per note in document order. Each record maps
     *   field names to their new values; an empty record skips that note.
     *   Must have the same length as {@link notes}.
     * @throws {NoteFileStaleError} If the instance has already written to disk.
     * @throws {RangeError} If `updates.length` does not match `notes.length`.
     */
    async updateNotes(updates: Array<NoteUpdate>): Promise<void> {
        this._assertFresh();

        if (updates.length !== this._notes.length) {
            throw new RangeError(
                `updates length ${updates.length} does not match note count ${this._notes.length}.`,
            );
        }

        let result = this._markdown;
        for (const idx of [...updates.keys()].sort((a, b) => b - a)) {
            const fields = updates[idx];
            if (fields === undefined) continue;
            if (Object.keys(fields).length === 0) continue;
            const location = this._locations[idx];
            if (!location) {
                throw new Error(`Internal error: missing location at note index ${idx}. This is a bug in NoteFile.`);
            }
            result = applyNoteUpdates(result, location, fields);
        }

        if (result === this._markdown) return;

        await this._write(result);
        this._isStale = true;
    }

    // ── Guard ────────────────────────────────────────────────────────────────

    private _assertFresh(): void {
        if (this._isStale) {
            throw new NoteFileStaleError();
        }
    }
}

export class NoteFileMismatchError extends Error {
    constructor(located: number, parsed: number) {
        super(
            `NoteFile found ${located} note location(s) in markdown ` +
            `but ${parsed} note(s) parsed from rendered HTML. ` +
            `The file may be malformed.`,
        );
        this.name = "NoteFileMismatchError";
    }
}

export class NoteFileStaleError extends Error {
    constructor() {
        super(
            `This NoteFile instance is stale. ` +
            `Call NoteFile.load() to get a fresh instance before writing again.`,
        );
        this.name = "NoteFileStaleError";
    }
}