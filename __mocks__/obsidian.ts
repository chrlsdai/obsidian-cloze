// __mocks__/obsidian.ts

// ─── Core Classes ────────────────────────────────────────────────────────────

export class App {
  vault = new Vault();
  metadataCache = new MetadataCache();
  workspace = new Workspace();
}

export class Plugin {
  app: App;
  manifest: PluginManifest;

  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }

  loadData       = jest.fn().mockResolvedValue({});
  saveData       = jest.fn().mockResolvedValue(undefined);
  addCommand     = jest.fn().mockReturnThis();
  addSettingTab  = jest.fn();
  addRibbonIcon  = jest.fn().mockReturnValue(document.createElement('div'));
  addStatusBarItem = jest.fn().mockReturnValue(document.createElement('div'));
  registerEvent  = jest.fn();
  registerInterval = jest.fn();
  unload         = jest.fn();
  onload         = jest.fn();
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement = document.createElement('div');

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
  }

  display = jest.fn();
  hide    = jest.fn();
}

// ─── UI ──────────────────────────────────────────────────────────────────────

export class Modal {
  app: App;
  contentEl: HTMLElement = document.createElement('div');
  titleEl: HTMLElement   = document.createElement('div');
  modalEl: HTMLElement   = document.createElement('div');

  constructor(app: App) {
    this.app = app;
  }

  open    = jest.fn();
  close   = jest.fn();
  onOpen  = jest.fn();
  onClose = jest.fn();
}

export class Notice {
  constructor(message: string, timeout?: number) {}
  hide  = jest.fn();
  setMessage = jest.fn().mockReturnThis();
}

export class Setting {
  settingEl: HTMLElement    = document.createElement('div');
  infoEl: HTMLElement       = document.createElement('div');
  controlEl: HTMLElement    = document.createElement('div');
  nameEl: HTMLElement       = document.createElement('div');
  descEl: HTMLElement       = document.createElement('div');

  setName        = jest.fn().mockReturnThis();
  setDesc        = jest.fn().mockReturnThis();
  setClass       = jest.fn().mockReturnThis();
  setTooltip     = jest.fn().mockReturnThis();
  setHeading     = jest.fn().mockReturnThis();
  addText        = jest.fn().mockReturnThis();
  addTextArea    = jest.fn().mockReturnThis();
  addToggle      = jest.fn().mockReturnThis();
  addDropdown    = jest.fn().mockReturnThis();
  addSlider      = jest.fn().mockReturnThis();
  addButton      = jest.fn().mockReturnThis();
  addMomentFormat = jest.fn().mockReturnThis();
  addColorPicker  = jest.fn().mockReturnThis();
  addExtraButton  = jest.fn().mockReturnThis();
  then           = jest.fn().mockReturnThis();
  clear          = jest.fn().mockReturnThis();

  constructor(containerEl: HTMLElement) {}
}

// ─── File System ─────────────────────────────────────────────────────────────

export class TAbstractFile {
  path: string = '';
  name: string = '';
  vault!: Vault;
  parent!: TFolder;
}

export class TFile extends TAbstractFile {
  stat     = { mtime: Date.now(), ctime: Date.now(), size: 0 };
  basename = '';
  extension = 'md';
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  isRoot = jest.fn().mockReturnValue(false);
}

// ─── Vault ───────────────────────────────────────────────────────────────────

export class Vault {
  adapter = {
    exists: jest.fn().mockResolvedValue(false),
    read:   jest.fn().mockResolvedValue(''),
    write:  jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    rename: jest.fn().mockResolvedValue(undefined),
    mkdir:  jest.fn().mockResolvedValue(undefined),
    list:   jest.fn().mockResolvedValue({ files: [], folders: [] }),
    getBasePath: jest.fn().mockReturnValue('/'),
  };

  getName        = jest.fn().mockReturnValue('test-vault');
  getRoot        = jest.fn().mockReturnValue(new TFolder());
  getAbstractFileByPath = jest.fn().mockReturnValue(null);
  getFileByPath  = jest.fn().mockReturnValue(null);
  getFolderByPath = jest.fn().mockReturnValue(null);
  getFiles       = jest.fn().mockReturnValue([]);
  getAllLoadedFiles = jest.fn().mockReturnValue([]);
  getMarkdownFiles = jest.fn().mockReturnValue([]);

  read    = jest.fn().mockResolvedValue('');
  cachedRead = jest.fn().mockResolvedValue('');
  readBinary  = jest.fn().mockResolvedValue(new ArrayBuffer(0));
  create      = jest.fn().mockResolvedValue(new TFile());
  createBinary = jest.fn().mockResolvedValue(new TFile());
  createFolder = jest.fn().mockResolvedValue(new TFolder());
  modify      = jest.fn().mockResolvedValue(undefined);
  modifyBinary = jest.fn().mockResolvedValue(undefined);
  append      = jest.fn().mockResolvedValue(undefined);
  copy        = jest.fn().mockResolvedValue(new TFile());
  rename      = jest.fn().mockResolvedValue(undefined);
  delete      = jest.fn().mockResolvedValue(undefined);
  trash       = jest.fn().mockResolvedValue(undefined);

  on   = jest.fn().mockReturnValue({ id: 'mock-event' });
  off  = jest.fn();
  trigger = jest.fn();
}

// ─── MetadataCache ───────────────────────────────────────────────────────────

export class MetadataCache {
  getCache            = jest.fn().mockReturnValue(null);
  getFileCache        = jest.fn().mockReturnValue(null);
  getFirstLinkpathDest = jest.fn().mockReturnValue(null);
  fileToLinktext      = jest.fn().mockReturnValue('');
  resolvedLinks       = {};
  unresolvedLinks     = {};

  on      = jest.fn().mockReturnValue({ id: 'mock-event' });
  off     = jest.fn();
  trigger = jest.fn();
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export class Workspace {
  activeLeaf: any = null;
  activeEditor: any = null;

  getActiveFile        = jest.fn().mockReturnValue(null);
  getActiveViewOfType  = jest.fn().mockReturnValue(null);
  getLeaf              = jest.fn().mockReturnValue(null);
  getLeftLeaf          = jest.fn().mockReturnValue(null);
  getRightLeaf         = jest.fn().mockReturnValue(null);
  openLinkText         = jest.fn().mockResolvedValue(undefined);
  getLastOpenFiles      = jest.fn().mockReturnValue([]);
  iterateAllLeaves     = jest.fn();
  getLeavesOfType      = jest.fn().mockReturnValue([]);
  revealLeaf           = jest.fn().mockResolvedValue(undefined);

  on      = jest.fn().mockReturnValue({ id: 'mock-event' });
  off     = jest.fn();
  trigger = jest.fn();
}

// ─── Editor ──────────────────────────────────────────────────────────────────

export class Editor {
  getValue        = jest.fn().mockReturnValue('');
  setValue        = jest.fn();
  getLine         = jest.fn().mockReturnValue('');
  setLine         = jest.fn();
  lineCount       = jest.fn().mockReturnValue(1);
  getCursor       = jest.fn().mockReturnValue({ line: 0, ch: 0 });
  setCursor       = jest.fn();
  getSelection    = jest.fn().mockReturnValue('');
  replaceSelection = jest.fn();
  replaceRange    = jest.fn();
  getRange        = jest.fn().mockReturnValue('');
  somethingSelected = jest.fn().mockReturnValue(false);
  exec            = jest.fn();
  focus           = jest.fn();
  blur            = jest.fn();
  hasFocus        = jest.fn().mockReturnValue(false);
  posToOffset     = jest.fn().mockReturnValue(0);
  offsetToPos     = jest.fn().mockReturnValue({ line: 0, ch: 0 });
  scrollIntoView  = jest.fn();
  undo            = jest.fn();
  redo            = jest.fn();
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export const normalizePath = jest.fn((path: string) => path);
export const sanitizeHTMLToDom = jest.fn((html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
});
export const requestUrl = jest.fn().mockResolvedValue({
  status: 200,
  text: '',
  json: {},
  arrayBuffer: new ArrayBuffer(0),
});
export const moment = jest.fn(() => ({
  format: jest.fn().mockReturnValue(''),
  fromNow: jest.fn().mockReturnValue(''),
}));

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  authorUrl?: string;
  isDesktopOnly?: boolean;
}

export interface Command {
  id: string;
  name: string;
  callback?: () => void;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: (editor: Editor) => void;
}

export const Platform = {
  isDesktop:  true,
  isMobile:   false,
  isLinux:    false,
  isMacOS:    false,
  isWin:      false,
  isIosApp:   false,
  isAndroidApp: false,
};


// ─── Component ────────────────────────────────────────────────────────────────

export class Component {
  private _loaded     = false;
  private _children: Component[]      = [];
  private _callbacks: Array<() => any> = [];
  private _domListeners: Array<{
    el:       HTMLElement | Document | Window;
    type:     string;
    callback: EventListenerOrEventListenerObject;
    options?: boolean | AddEventListenerOptions;
  }> = [];

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  load(): void {
    this._loaded = true;
    this.onload();
    this._children.forEach((child) => child.load());
  }

  /** Override in subclasses or spy on in tests */
  onload = jest.fn().mockImplementation(() => {});

  unload(): void {
    // Unload children first
    [...this._children].forEach((child) => child.unload());
    this._children = [];

    // Remove all DOM listeners
    this._domListeners.forEach(({ el, type, callback, options }) => {
      el.removeEventListener(type, callback, options);
    });
    this._domListeners = [];

    // Run registered cleanup callbacks
    this._callbacks.forEach((cb) => cb());
    this._callbacks = [];

    this._loaded = false;
    this.onunload();
  }

  /** Override in subclasses or spy on in tests */
  onunload = jest.fn().mockImplementation(() => {});

  // ── Child Management ────────────────────────────────────────────────────────

  addChild<T extends Component>(component: T): T {
    this._children.push(component);
    if (this._loaded) component.load();
    return component;
  }

  removeChild<T extends Component>(component: T): T {
    const idx = this._children.indexOf(component);
    if (idx !== -1) {
      this._children.splice(idx, 1);
      component.unload();
    }
    return component;
  }

  // ── Registration Helpers ────────────────────────────────────────────────────

  /** Registers a cleanup callback run on unload */
  register(cb: () => any): void {
    this._callbacks.push(cb);
  }

  /** Registers an Obsidian EventRef to be detached on unload */
  registerEvent = jest.fn().mockImplementation((eventRef: { id: string }) => {
    this.register(() => {
      // In real Obsidian this calls Events.offref(eventRef)
    });
  });

  /** Registers a setInterval id — cleared automatically on unload */
  registerInterval(id: number): number {
    this.register(() => window.clearInterval(id));
    return id;
  }

  /** Registers a DOM event listener — removed automatically on unload */
  registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  registerDomEvent<K extends keyof DocumentEventMap>(
    el: Document,
    type: K,
    callback: (this: Document, ev: DocumentEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  registerDomEvent<K extends keyof WindowEventMap>(
    el: Window,
    type: K,
    callback: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  registerDomEvent(
    el:       HTMLElement | Document | Window,
    type:     string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    el.addEventListener(type, callback, options);
    this._domListeners.push({ el, type, callback, options });
    this.register(() => el.removeEventListener(type, callback, options));
  }

  // ── Introspection (test helpers) ────────────────────────────────────────────

  /** @testonly */
  _getChildren()  { return [...this._children]; }
  /** @testonly */
  _isLoaded()     { return this._loaded; }
  /** @testonly */
  _callbackCount() { return this._callbacks.length; }
}

// ─── MarkdownRenderer ─────────────────────────────────────────────────────────

function minimalMarkdownToHtml(markdown: string): string {
  const lines  = markdown.split('\n');
  const output: string[] = [];
  let inUl     = false;
  let inOl     = false;
  let inCode   = false;
  let codeLines: string[] = [];

  const closeList = () => {
    if (inUl) { output.push('</ul>'); inUl = false; }
    if (inOl) { output.push('</ol>'); inOl = false; }
  };

  const inlineFormat = (text: string) =>
    text
      .replace(/`([^`]+)`/g,          '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g,  '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,      '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,          '<em>$1</em>')
      .replace(/~~(.+?)~~/g,          '<del>$1</del>')
      .replace(/==(.+?)==/g,          '<mark>$1</mark>')
      .replace(/\[\[(.+?)\]\]/g,      '<a class="internal-link" href="$1">$1</a>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  for (const raw of lines) {
    const line = raw.trimEnd();

    // ── Fenced code blocks ──────────────────────────────────────────────────
    if (line.startsWith('```')) {
      if (!inCode) {
        closeList();
        inCode    = true;
        codeLines = [];
        const lang = line.slice(3).trim();
        output.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>`);
      } else {
        output.push(codeLines.join('\n'));
        output.push('</code></pre>');
        codeLines = [];
        inCode    = false;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(
        line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      );
      continue;
    }

    // ── Headings ────────────────────────────────────────────────────────────
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`);
      continue;
    }

    // ── Horizontal rule ─────────────────────────────────────────────────────
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      closeList();
      output.push('<hr>');
      continue;
    }

    // ── Blockquote ──────────────────────────────────────────────────────────
    const quote = line.match(/^>\s*(.*)/);
    if (quote) {
      closeList();
      output.push(`<blockquote><p>${inlineFormat(quote[1])}</p></blockquote>`);
      continue;
    }

    // ── Unordered list ──────────────────────────────────────────────────────
    const ulItem = line.match(/^[-*+]\s+(.*)/);
    if (ulItem) {
      if (!inUl) { if (inOl) { output.push('</ol>'); inOl = false; } output.push('<ul>'); inUl = true; }
      output.push(`<li>${inlineFormat(ulItem[1])}</li>`);
      continue;
    }

    // ── Ordered list ────────────────────────────────────────────────────────
    const olItem = line.match(/^\d+\.\s+(.*)/);
    if (olItem) {
      if (!inOl) { if (inUl) { output.push('</ul>'); inUl = false; } output.push('<ol>'); inOl = true; }
      output.push(`<li>${inlineFormat(olItem[1])}</li>`);
      continue;
    }

    // ── Blank line ──────────────────────────────────────────────────────────
    if (line.trim() === '') {
      closeList();
      continue;
    }

    // ── Paragraph ───────────────────────────────────────────────────────────
    closeList();
    output.push(`<p>${inlineFormat(line)}</p>`);
  }

  closeList();
  if (inCode) output.push('</code></pre>'); // unclosed fence fallback

  return output.join('\n');
}

export class MarkdownRenderer {
  /**
   * Obsidian 1.x API
   * render(app, markdown, el, sourcePath, component)
   */
  static render = jest.fn().mockImplementation(
    async (
      app:        App,
      markdown:   string,
      el:         HTMLElement,
      sourcePath: string,
      component:  Component,
    ): Promise<void> => {
      const wrapper = document.createElement('div');
      wrapper.className     = 'markdown-rendered';
      wrapper.dataset.source = sourcePath;
      wrapper.innerHTML     = minimalMarkdownToHtml(markdown);
      el.appendChild(wrapper);
    },
  );

  /**
   * Legacy API (pre-1.x) — kept for backwards compatibility
   * renderMarkdown(markdown, el, sourcePath, component)
   */
  static renderMarkdown = jest.fn().mockImplementation(
    async (
      markdown:   string,
      el:         HTMLElement,
      sourcePath: string,
      component:  Component | null,
    ): Promise<void> => {
      const wrapper = document.createElement('div');
      wrapper.className     = 'markdown-rendered';
      wrapper.dataset.source = sourcePath;
      wrapper.innerHTML     = minimalMarkdownToHtml(markdown);
      el.appendChild(wrapper);
    },
  );
}