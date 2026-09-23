import { COPY_ICON, escapeHtml } from './webviewHtml';

/**
 * The viewer's URL row, with Copy AND Open in the browser (issue #104) — pure markup.
 *
 * <p>Its own module because `entityViewPage.ts` sits at its line ceiling, and because the row is the
 * one place in the page with two actions on one value. Copy stays FIRST: the page's "copied" tick
 * finds `button[data-field="url"]` by first match, so the order is load-bearing. Open posts
 * `{type: 'open', field: 'url'}`; the host opens the STORED value (`openSite.ts`), never text the
 * page sends.</p>
 */

/** An arrow out of a box — the conventional "opens elsewhere" glyph, drawn like `COPY_ICON`. */
export const OPEN_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">' +
  '<path d="M9.5 2.5h4v4"/><path d="M13.5 2.5 7.5 8.5"/>' +
  '<path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/></svg>';

export function urlRow(url: string | undefined): string {
  if (url === undefined || url.trim().length === 0) {
    return '';
  }
  return `<div class="row">
      <label>URL</label>
      <div class="line"><input readonly value="${escapeHtml(url)}">
        <button data-field="url" data-action="copy" class="icon" title="Copy URL" aria-label="Copy URL">${COPY_ICON}</button>
        <button data-field="url" data-action="open" class="icon" title="Open the site in the browser" aria-label="Open the site in the browser">${OPEN_ICON}</button>
      </div>
    </div>`;
}
