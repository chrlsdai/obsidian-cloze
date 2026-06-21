/**
 * Polyfills the Obsidian global helpers that are normally injected at
 * runtime but are absent in the jsdom test environment.
 */
(globalThis as Record<string, unknown>).createEl = <
  K extends keyof HTMLElementTagNameMap,
>(
  tag: K,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
  }
  return el;
};