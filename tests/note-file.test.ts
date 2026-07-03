/**
 * @jest-environment jsdom
 *
 * Tests for NoteFile — represents a single Obsidian markdown file containing
 * flashcard notes. Constructed exclusively via NoteFile.load; write access is
 * single-use — after one successful write the instance becomes stale.
 */

import { NoteFile, NoteFileMismatchError, NoteFileStaleError } from '../src/note/file';
import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import { parseNotesFromElement } from '../src/note/parsing';
import { locateNotes, applyNoteUpdates } from '../src/note/writing';
import type { Note, NoteLocation } from '../src/note/schema';

jest.mock('obsidian');
jest.mock('../src/note/parsing');
jest.mock('../src/note/writing');

// ── Typed mock references ──────────────────────────────────────────────────────

const mockLocateNotes = locateNotes as jest.MockedFunction<typeof locateNotes>;
const mockParseNotesFromElement = parseNotesFromElement as jest.MockedFunction<
    typeof parseNotesFromElement
>;
const mockApplyNoteUpdates = applyNoteUpdates as jest.MockedFunction<typeof applyNoteUpdates>;

/** The Component constructor, cast so Jest mock methods are accessible. */
const MockComponentConstructor = Component as unknown as jest.Mock;

/** The MarkdownRenderer.render static, cast so Jest mock methods are accessible. */
const mockRender = MarkdownRenderer.render as jest.Mock;

// ── Test-data factories ────────────────────────────────────────────────────────

const makeNote = (id = 'note-1'): Note => ({ id } as unknown as Note);

const makeLocation = (start: number, end: number): NoteLocation =>
    ({ start, end } as unknown as NoteLocation);

interface AppFixture {
    app: App;
    vaultRead: jest.Mock;
    vaultModify: jest.Mock;
}

function makeApp(content = '', vaultName = 'test-vault'): AppFixture {
    const vaultRead = jest.fn().mockResolvedValue(content);
    const vaultModify = jest.fn().mockResolvedValue(undefined);
    const app = {
        vault: {
            read: vaultRead,
            modify: vaultModify,
            getName: jest.fn().mockReturnValue(vaultName),
        },
    } as unknown as App;
    return { app, vaultRead, vaultModify };
}

function makeFile(name = 'notes.md', path = 'folder/notes.md'): TFile {
    return { name, path } as unknown as TFile;
}

interface LoadedFixture {
    noteFile: NoteFile;
    notes: Note[];
    locations: NoteLocation[];
    vaultModify: jest.Mock;
    file: TFile;
}

/**
 * Load a NoteFile pre-configured with {@link n} matching notes and locations,
 * using {@link content} as the markdown returned by vault.read.
 */
async function loadWithNotes(n: number, content = '## markdown'): Promise<LoadedFixture> {
    const notes = Array.from({ length: n }, (_, i) => makeNote(`note-${i}`));
    const locations = Array.from({ length: n }, (_, i) =>
        makeLocation(i * 100, (i + 1) * 100 - 1),
    );
    mockLocateNotes.mockReturnValue(locations);
    mockParseNotesFromElement.mockReturnValue(notes);

    const { app, vaultModify } = makeApp(content);
    const file = makeFile();
    const noteFile = await NoteFile.load(app, file);

    return { noteFile, notes, locations, vaultModify, file };
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('NoteFile', () => {
    /** Stub component instance returned by every `new Component()` call. */
    let mockComponent: { load: jest.Mock; unload: jest.Mock };

    beforeEach(() => {
        jest.resetAllMocks();

        mockComponent = { load: jest.fn(), unload: jest.fn() };
        MockComponentConstructor.mockImplementation(() => mockComponent);
        mockRender.mockResolvedValue(undefined);

        // Sensible defaults that individual tests override as needed
        mockLocateNotes.mockReturnValue([]);
        mockParseNotesFromElement.mockReturnValue([]);
        mockApplyNoteUpdates.mockImplementation((md: string) => `${md} [modified]`);
    });

    // ── NoteFile.load ──────────────────────────────────────────────────────────

    describe('NoteFile.load', () => {
        it('returns a NoteFile instance', async () => {
            const { app } = makeApp();
            await expect(NoteFile.load(app, makeFile())).resolves.toBeInstanceOf(NoteFile);
        });

        it('reads the file via app.vault.read', async () => {
            const { app, vaultRead } = makeApp();
            const file = makeFile();
            await NoteFile.load(app, file);
            expect(vaultRead).toHaveBeenCalledTimes(1);
            expect(vaultRead).toHaveBeenCalledWith(file);
        });

        it('passes the file content to locateNotes', async () => {
            const markdown = '> [!note]\n> front: Q\n> back: A';
            const { app } = makeApp(markdown);
            await NoteFile.load(app, makeFile());
            expect(mockLocateNotes).toHaveBeenCalledWith(markdown);
        });

        it('calls MarkdownRenderer.render with app, markdown, a div, the file path, and the component', async () => {
            const markdown = '> [!note] Example';
            const { app } = makeApp(markdown);
            const file = makeFile('test.md', 'vault/test.md');
            await NoteFile.load(app, file);
            expect(mockRender).toHaveBeenCalledWith(
                app,
                markdown,
                expect.any(HTMLDivElement),
                'vault/test.md',
                mockComponent,
            );
        });

        it('passes the same container element to MarkdownRenderer.render and parseNotesFromElement', async () => {
            let capturedContainer: HTMLElement | undefined;
            mockRender.mockImplementation(
                (_a: unknown, _b: unknown, container: HTMLElement) => {
                    capturedContainer = container;
                    return Promise.resolve();
                },
            );
            const { app } = makeApp();
            await NoteFile.load(app, makeFile());
            expect(mockParseNotesFromElement).toHaveBeenCalledWith(capturedContainer);
        });

        it('exposes the notes returned by parseNotesFromElement via notes', async () => {
            const notes = [makeNote('alpha'), makeNote('beta')];
            const locations = [makeLocation(0, 10), makeLocation(11, 20)];
            mockLocateNotes.mockReturnValue(locations);
            mockParseNotesFromElement.mockReturnValue(notes);
            const { app } = makeApp();
            const noteFile = await NoteFile.load(app, makeFile());
            expect(noteFile.notes).toEqual(notes);
        });

        it('sets context.vaultName from app.vault.getName()', async () => {
            const { app } = makeApp('', 'my-vault');
            const noteFile = await NoteFile.load(app, makeFile());
            expect(noteFile.context.vaultName).toBe('my-vault');
        });

        it('sets context.fileName from TFile.name', async () => {
            const { app } = makeApp();
            const noteFile = await NoteFile.load(app, makeFile('bio.md', 'sci/bio.md'));
            expect(noteFile.context.fileName).toBe('bio.md');
        });

        it('sets context.filePath from TFile.path', async () => {
            const { app } = makeApp();
            const noteFile = await NoteFile.load(app, makeFile('bio.md', 'sci/bio.md'));
            expect(noteFile.context.filePath).toBe('sci/bio.md');
        });

        it('needsReload is false immediately after construction', async () => {
            const { app } = makeApp();
            const noteFile = await NoteFile.load(app, makeFile());
            expect(noteFile.needsReload).toBe(false);
        });

        it('throws NoteFileMismatchError when locateNotes and parseNotesFromElement return different counts', async () => {
            mockLocateNotes.mockReturnValue([makeLocation(0, 10), makeLocation(11, 20)]);
            mockParseNotesFromElement.mockReturnValue([makeNote()]);
            const { app } = makeApp();
            await expect(NoteFile.load(app, makeFile())).rejects.toBeInstanceOf(
                NoteFileMismatchError,
            );
        });

        it('NoteFileMismatchError message contains the located count and parsed count', async () => {
            mockLocateNotes.mockReturnValue([makeLocation(0, 10), makeLocation(11, 20)]);
            mockParseNotesFromElement.mockReturnValue([makeNote()]);
            const { app } = makeApp();
            const error = await NoteFile.load(app, makeFile('quiz.md', 'decks/quiz.md')).catch(
                (e: Error) => e,
            );
            expect(error).toBeInstanceOf(NoteFileMismatchError)
            expect(error).toHaveProperty('message', expect.stringContaining('2'));
            expect(error).toHaveProperty('message', expect.stringContaining('1'));
        });

        it('loads with an empty notes array when both locate and parse return zero items', async () => {
            const { app } = makeApp();
            const noteFile = await NoteFile.load(app, makeFile());
            expect(noteFile.notes).toHaveLength(0);
        });

        it('propagates rejections from app.vault.read', async () => {
            const { app, vaultRead } = makeApp();
            vaultRead.mockRejectedValue(new Error('disk read failed'));
            await expect(NoteFile.load(app, makeFile())).rejects.toThrow('disk read failed');
        });

        it('propagates rejections from MarkdownRenderer.render', async () => {
            mockRender.mockRejectedValue(new Error('render crashed'));
            const { app } = makeApp();
            await expect(NoteFile.load(app, makeFile())).rejects.toThrow('render crashed');
        });
    });

    // ── notes getter ───────────────────────────────────────────────────────────

    describe('notes', () => {
        it('is empty when the file has no notes', async () => {
            const { app } = makeApp();
            const noteFile = await NoteFile.load(app, makeFile());
            expect(noteFile.notes).toHaveLength(0);
        });

        it('contains all parsed notes in document order', async () => {
            const { noteFile, notes } = await loadWithNotes(3);
            expect(noteFile.notes).toHaveLength(3);
            notes.forEach((note, i) => expect(noteFile.notes[i]).toBe(note));
        });

        it('returns the same array reference on every access', async () => {
            const { noteFile } = await loadWithNotes(2);
            expect(noteFile.notes).toBe(noteFile.notes);
        });
    });

    // ── context getter ─────────────────────────────────────────────────────────

    describe('context', () => {
        it('returns an object with the correct vaultName, fileName, and filePath', async () => {
            const { app } = makeApp('', 'vault-x');
            const noteFile = await NoteFile.load(app, makeFile('notes.md', 'root/notes.md'));
            expect(noteFile.context).toEqual({
                vaultName: 'vault-x',
                fileName: 'notes.md',
                filePath: 'root/notes.md',
            });
        });

        it('returns the same reference on every access', async () => {
            const { app } = makeApp();
            const noteFile = await NoteFile.load(app, makeFile());
            expect(noteFile.context).toBe(noteFile.context);
        });
    });

    // ── needsReload getter ─────────────────────────────────────────────────────

    describe('needsReload', () => {
        it('is false before any write', async () => {
            const { noteFile } = await loadWithNotes(1);
            expect(noteFile.needsReload).toBe(false);
        });

        it('is true after a successful updateNotes write', async () => {
            const { noteFile } = await loadWithNotes(1, 'original');
            mockApplyNoteUpdates.mockReturnValue('modified');
            await noteFile.updateNotes([{ front: 'Q' }]);
            expect(noteFile.needsReload).toBe(true);
        });

        it('remains false when all update entries are empty objects (no write issued)', async () => {
            const { noteFile } = await loadWithNotes(2);
            await noteFile.updateNotes([{}, {}]);
            expect(noteFile.needsReload).toBe(false);
        });

        it('remains false when applyNoteUpdates produces no net change (no write issued)', async () => {
            const content = 'static content';
            const { noteFile } = await loadWithNotes(1, content);
            mockApplyNoteUpdates.mockReturnValue(content);
            await noteFile.updateNotes([{ front: 'same' }]);
            expect(noteFile.needsReload).toBe(false);
        });

        it('remains false when vault.modify rejects (write did not complete)', async () => {
            const { noteFile, vaultModify } = await loadWithNotes(1, 'original');
            mockApplyNoteUpdates.mockReturnValue('changed');
            vaultModify.mockRejectedValue(new Error('write error'));
            await noteFile.updateNotes([{ front: 'Q' }]).catch(() => {});
            expect(noteFile.needsReload).toBe(false);
        });
    });

    // ── updateNoets ────────────────────────────────────────────────────────────

    describe('updateNotes', () => {

        // ── stale instance guard ───────────────────────────────────────────────

        describe('stale instance guard', () => {
            it('throws NoteFileStaleError when called on an already-written instance', async () => {
                const { noteFile } = await loadWithNotes(1, 'original');
                mockApplyNoteUpdates.mockReturnValue('changed');
                await noteFile.updateNotes([{ front: 'first' }]);
                await expect(
                    noteFile.updateNotes([{ front: 'second' }]),
                ).rejects.toBeInstanceOf(NoteFileStaleError);
            });

            it('does not call vault.modify on subsequent calls to a stale instance', async () => {
                const { noteFile, vaultModify } = await loadWithNotes(1, 'original');
                mockApplyNoteUpdates.mockReturnValue('changed');
                await noteFile.updateNotes([{ front: 'first' }]);
                await noteFile.updateNotes([{ front: 'second' }]).catch(() => {});
                expect(vaultModify).toHaveBeenCalledTimes(1);
            });

            it('a failed write leaves the instance fresh so the call can be retried', async () => {
                const { noteFile, vaultModify } = await loadWithNotes(1, 'original');
                mockApplyNoteUpdates.mockReturnValue('changed');
                vaultModify.mockRejectedValueOnce(new Error('transient'));
                await noteFile.updateNotes([{ front: 'Q' }]).catch(() => {});
                expect(noteFile.needsReload).toBe(false);
                // Second attempt should succeed
                vaultModify.mockResolvedValue(undefined);
                await expect(noteFile.updateNotes([{ front: 'Q' }])).resolves.toBeUndefined();
                expect(noteFile.needsReload).toBe(true);
            });
        });

        // ── length mismatch guard ──────────────────────────────────────────────

        describe('length mismatch guard', () => {
            it('throws RangeError when the updates array is shorter than the note count', async () => {
                const { noteFile } = await loadWithNotes(3);
                await expect(noteFile.updateNotes([{}, {}])).rejects.toBeInstanceOf(RangeError);
            });

            it('throws RangeError when the updates array is longer than the note count', async () => {
                const { noteFile } = await loadWithNotes(2);
                await expect(noteFile.updateNotes([{}, {}, {}])).rejects.toBeInstanceOf(RangeError);
            });

            it('RangeError message includes the supplied length and the expected count', async () => {
                const { noteFile } = await loadWithNotes(3);
                const err = await noteFile.updateNotes([{}]).catch((e: Error) => e);
                expect(err).toBeInstanceOf(RangeError)
                expect(err).toHaveProperty('message', expect.stringContaining('1'))
                expect(err).toHaveProperty('message', expect.stringContaining('3'))
            });

            it('does not call vault.modify when the length check fails', async () => {
                const { noteFile, vaultModify } = await loadWithNotes(2);
                await noteFile.updateNotes([{}]).catch(() => {});
                expect(vaultModify).not.toHaveBeenCalled();
            });

            it('does not mark the instance stale when the length check fails', async () => {
                const { noteFile } = await loadWithNotes(2);
                await noteFile.updateNotes([{}]).catch(() => {});
                expect(noteFile.needsReload).toBe(false);
            });

            it('accepts an empty updates array when there are zero notes', async () => {
                const { noteFile } = await loadWithNotes(0);
                await expect(noteFile.updateNotes([])).resolves.toBeUndefined();
            });
        });

        // ── no-op behaviour ────────────────────────────────────────────────────

        describe('no-op behaviour', () => {
            it('does not call applyNoteUpdates when every entry is an empty object', async () => {
                const { noteFile } = await loadWithNotes(3);
                await noteFile.updateNotes([{}, {}, {}]);
                expect(mockApplyNoteUpdates).not.toHaveBeenCalled();
            });

            it('does not call vault.modify when every entry is an empty object', async () => {
                const { noteFile, vaultModify } = await loadWithNotes(3);
                await noteFile.updateNotes([{}, {}, {}]);
                expect(vaultModify).not.toHaveBeenCalled();
            });

            it('does not call vault.modify when applyNoteUpdates returns the original content', async () => {
                const content = '## original';
                const { noteFile, vaultModify } = await loadWithNotes(1, content);
                mockApplyNoteUpdates.mockReturnValue(content); // net-zero change
                await noteFile.updateNotes([{ front: 'same' }]);
                expect(vaultModify).not.toHaveBeenCalled();
            });

            it('resolves with undefined when no write occurs', async () => {
                const { noteFile } = await loadWithNotes(2);
                await expect(noteFile.updateNotes([{}, {}])).resolves.toBeUndefined();
            });
        });

        // ── update application ─────────────────────────────────────────────────

        describe('update application', () => {
            it('calls applyNoteUpdates once per non-empty entry', async () => {
                const { noteFile } = await loadWithNotes(3, 'md');
                mockApplyNoteUpdates
                    .mockReturnValueOnce('step-1')
                    .mockReturnValueOnce('step-2')
                    .mockReturnValueOnce('step-3');
                await noteFile.updateNotes([{ a: '1' }, { b: '2' }, { c: '3' }]);
                expect(mockApplyNoteUpdates).toHaveBeenCalledTimes(3);
            });

            it('skips entries with an empty fields object', async () => {
                const { noteFile } = await loadWithNotes(3, 'md');
                mockApplyNoteUpdates.mockReturnValue('changed');
                await noteFile.updateNotes([{ a: '1' }, {}, { c: '3' }]);
                expect(mockApplyNoteUpdates).toHaveBeenCalledTimes(2);
            });

            it('processes non-empty entries in descending index order (back-to-front)', async () => {
                const { noteFile, locations } = await loadWithNotes(3, 'v0');
                const locationOrder: NoteLocation[] = [];
                mockApplyNoteUpdates.mockImplementation((md: string, loc: unknown) => {
                    locationOrder.push(loc as NoteLocation);
                    return `${md}+`;
                });
                await noteFile.updateNotes([{ a: '1' }, { b: '2' }, { c: '3' }]);
                expect(locationOrder).toEqual([locations[2], locations[1], locations[0]]);
            });

            it('passes the location corresponding to each note index to applyNoteUpdates', async () => {
                const { noteFile, locations } = await loadWithNotes(2, 'md');
                mockApplyNoteUpdates.mockReturnValue('changed');
                await noteFile.updateNotes([{ x: 'a' }, { y: 'b' }]);
                const usedLocations = mockApplyNoteUpdates.mock.calls.map((c) => c[1]);
                expect(usedLocations).toContain(locations[0]);
                expect(usedLocations).toContain(locations[1]);
            });

            it('passes the exact fields object to applyNoteUpdates', async () => {
                const { noteFile } = await loadWithNotes(1, 'original');
                mockApplyNoteUpdates.mockReturnValue('updated');
                const fields = { front: 'new Q', back: 'new A' };
                await noteFile.updateNotes([fields]);
                expect(mockApplyNoteUpdates).toHaveBeenCalledWith(
                    'original',
                    expect.anything(),
                    fields,
                );
            });

            it('chains calls: each invocation receives the output of the previous one', async () => {
                // 2 notes → descending order: index 1 first, then index 0
                const { noteFile } = await loadWithNotes(2, 'v0');
                mockApplyNoteUpdates
                    .mockReturnValueOnce('v1') // called for index 1
                    .mockReturnValueOnce('v2'); // called for index 0
                await noteFile.updateNotes([{ a: '1' }, { b: '2' }]);
                expect(mockApplyNoteUpdates.mock.calls[0]![0]).toBe('v0');
                expect(mockApplyNoteUpdates.mock.calls[1]![0]).toBe('v1');
            });

            it('writes the final accumulated content to the vault', async () => {
                const { noteFile, vaultModify, file } = await loadWithNotes(1, '## original');
                mockApplyNoteUpdates.mockReturnValue('## final');
                await noteFile.updateNotes([{ front: 'Q' }]);
                expect(vaultModify).toHaveBeenCalledWith(file, '## final');
            });

            it('calls vault.modify exactly once per updateNotes invocation', async () => {
                const { noteFile, vaultModify } = await loadWithNotes(2, 'original');
                mockApplyNoteUpdates.mockReturnValue('changed');
                await noteFile.updateNotes([{ a: '1' }, { b: '2' }]);
                expect(vaultModify).toHaveBeenCalledTimes(1);
            });

            it('marks the instance stale after the write completes', async () => {
                const { noteFile } = await loadWithNotes(1, 'original');
                mockApplyNoteUpdates.mockReturnValue('changed');
                await noteFile.updateNotes([{ front: 'Q' }]);
                expect(noteFile.needsReload).toBe(true);
            });

            it('handles a mix of empty and non-empty entries correctly', async () => {
                // entries 0 and 3 carry data; entries 1 and 2 are empty
                const { noteFile, locations } = await loadWithNotes(4, 'md');
                mockApplyNoteUpdates.mockReturnValue('changed');
                await noteFile.updateNotes([{ a: '1' }, {}, {}, { d: '4' }]);
                const usedLocations = mockApplyNoteUpdates.mock.calls.map((c) => c[1]);
                expect(usedLocations).toHaveLength(2);
                expect(usedLocations).toContain(locations[0]);
                expect(usedLocations).toContain(locations[3]);
                expect(usedLocations).not.toContain(locations[1]);
                expect(usedLocations).not.toContain(locations[2]);
            });

            it('resolves with undefined on a successful write', async () => {
                const { noteFile } = await loadWithNotes(1, 'original');
                mockApplyNoteUpdates.mockReturnValue('changed');
                await expect(noteFile.updateNotes([{ front: 'Q' }])).resolves.toBeUndefined();
            });
        });
    });

    // ── Component lifecycle ────────────────────────────────────────────────────

    describe('Component lifecycle during rendering', () => {
        it('instantiates exactly one Component per load', async () => {
            const { app } = makeApp();
            await NoteFile.load(app, makeFile());
            expect(MockComponentConstructor).toHaveBeenCalledTimes(1);
        });

        it('calls component.load() before rendering', async () => {
            const { app } = makeApp();
            await NoteFile.load(app, makeFile());
            expect(mockComponent.load).toHaveBeenCalledTimes(1);
        });

        it('calls component.unload() after a successful render', async () => {
            const { app } = makeApp();
            await NoteFile.load(app, makeFile());
            expect(mockComponent.unload).toHaveBeenCalledTimes(1);
        });

        it('calls component.unload() even when MarkdownRenderer.render rejects', async () => {
            mockRender.mockRejectedValue(new Error('render failed'));
            const { app } = makeApp();
            await NoteFile.load(app, makeFile()).catch(() => {});
            expect(mockComponent.unload).toHaveBeenCalledTimes(1);
        });

        it('component.load() is invoked strictly before MarkdownRenderer.render', async () => {
            const order: string[] = [];
            mockComponent.load.mockImplementation(() => order.push('load'));
            mockRender.mockImplementation(() => {
                order.push('render');
                return Promise.resolve();
            });
            const { app } = makeApp();
            await NoteFile.load(app, makeFile());
            expect(order.indexOf('load')).toBeLessThan(order.indexOf('render'));
        });
    });

    // ── NoteFileMismatchError ──────────────────────────────────────────────────

    describe('NoteFileMismatchError', () => {
        it('is an instance of Error', () => {
            expect(new NoteFileMismatchError(2, 3)).toBeInstanceOf(Error);
        });

        it('has name "NoteFileMismatchError"', () => {
            expect(new NoteFileMismatchError(2, 3).name).toBe('NoteFileMismatchError');
        });

        it('message includes the number of located notes', () => {
            const err = new NoteFileMismatchError(5, 3);
            expect(err.message).toContain('5');
        });

        it('message includes the number of parsed notes', () => {
            const err = new NoteFileMismatchError(5, 3);
            expect(err.message).toContain('3');
        });

        it('is thrown by NoteFile.load on a count mismatch', async () => {
            mockLocateNotes.mockReturnValue([makeLocation(0, 10)]);
            mockParseNotesFromElement.mockReturnValue([makeNote(), makeNote()]);
            const { app } = makeApp();
            await expect(NoteFile.load(app, makeFile())).rejects.toBeInstanceOf(
                NoteFileMismatchError,
            );
        });
    });

    // ── NoteFileStaleError ─────────────────────────────────────────────────────

    describe('NoteFileStaleError', () => {
        it('is an instance of Error', () => {
            expect(new NoteFileStaleError()).toBeInstanceOf(Error);
        });

        it('has name "NoteFileStaleError"', () => {
            expect(new NoteFileStaleError().name).toBe('NoteFileStaleError');
        });

        it('is thrown by updateNotes when the instance is stale', async () => {
            const { noteFile } = await loadWithNotes(1, 'original');
            mockApplyNoteUpdates.mockReturnValue('changed');
            await noteFile.updateNotes([{ front: 'Q1' }]);
            await expect(
                noteFile.updateNotes([{ front: 'Q2' }]),
            ).rejects.toBeInstanceOf(NoteFileStaleError);
        });
    });
});