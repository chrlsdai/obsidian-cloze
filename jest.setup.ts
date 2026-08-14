/**
 * Polyfills the DOM helpers (createEl, createDiv, createSpan, createFragment,
 * Node#instanceOf, Element#empty/setText, …) that the real Obsidian app injects
 * onto Node/Element/window at boot time. The `obsidian` npm package is types-only
 * (see its package.json `main: ""`) and jsdom doesn't provide these either, so
 * without this file any source code exercising them fails with e.g.
 * `ReferenceError: createDiv is not defined` under Jest.
 */

// Side-effect import only: pulls in obsidian's ambient global type
// augmentations (Node#createEl, Node#instanceOf, etc.) so the assignments
// below type-check. Resolves to __mocks__/obsidian.ts at runtime, but that
// mock is never used here — only the real package's ambient types matter.
import 'obsidian';

function applyDomElementInfo(el: HTMLElement, o?: DomElementInfo | string): void {
    if (o === undefined) return;
    if (typeof o === 'string') {
        el.className = o;
        return;
    }
    if (o.cls) {
        for (const cls of Array.isArray(o.cls) ? o.cls : [o.cls]) el.classList.add(cls);
    }
    if (o.text !== undefined) {
        if (o.text instanceof DocumentFragment) el.appendChild(o.text);
        else el.textContent = o.text;
    }
    if (o.attr) {
        for (const [name, value] of Object.entries(o.attr)) {
            if (value === null || value === false) el.removeAttribute(name);
            else el.setAttribute(name, String(value));
        }
    }
    if (o.title) el.setAttribute('title', o.title);
    if (o.placeholder && el instanceof HTMLInputElement) el.placeholder = o.placeholder;
    if (o.value !== undefined && el instanceof HTMLInputElement) el.value = o.value;
    if (o.parent) {
        if (o.prepend) o.parent.insertBefore(el, o.parent.firstChild);
        else o.parent.appendChild(el);
    }
}

function createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: DomElementInfo | string,
    callback?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    applyDomElementInfo(el, o);
    callback?.(el);
    return el;
}

function createDiv(o?: DomElementInfo | string, callback?: (el: HTMLDivElement) => void): HTMLDivElement {
    return createEl('div', o, callback);
}

function createSpan(o?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement {
    return createEl('span', o, callback);
}

function createFragment(callback?: (el: DocumentFragment) => void): DocumentFragment {
    const frag = document.createDocumentFragment();
    callback?.(frag);
    return frag;
}

Object.assign(globalThis, { createEl, createDiv, createSpan, createFragment });

Node.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
    this: Node,
    tag: K,
    o?: DomElementInfo | string,
    callback?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K] {
    const el = createEl(tag, o, callback);
    this.appendChild(el);
    return el;
};

Node.prototype.createDiv = function (
    this: Node,
    o?: DomElementInfo | string,
    callback?: (el: HTMLDivElement) => void,
): HTMLDivElement {
    return this.createEl('div', o, callback);
};

Node.prototype.createSpan = function (
    this: Node,
    o?: DomElementInfo | string,
    callback?: (el: HTMLSpanElement) => void,
): HTMLSpanElement {
    return this.createEl('span', o, callback);
};

Node.prototype.instanceOf = function <T>(this: Node, type: new () => T): this is T {
    return this instanceof (type as unknown as new (...args: unknown[]) => unknown);
};

Element.prototype.empty = function (this: Element): void {
    while (this.firstChild) this.removeChild(this.firstChild);
};

Element.prototype.setText = function (this: Element, val: string | DocumentFragment): void {
    this.empty();
    if (val instanceof DocumentFragment) this.appendChild(val);
    else this.textContent = val;
};
