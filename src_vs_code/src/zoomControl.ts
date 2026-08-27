import { escapeHtml } from './webviewHtml';

/**
 * The ± text zoom every webview page carries (tails T28).
 *
 * <p>"С плохим зрением в студии в принципе беда": two magnifier buttons in the page header scale
 * the page's text a step at a time, up to five steps from the base either way, with the current
 * offset shown beside them (`+5`, `−3`). The value lives in the setting
 * `credSshManager.uiScale` — a setting rather than local state because settings sync, and a
 * vision preference should follow the person to their next machine. The HOST clamps and writes;
 * every open page is pushed the new value, so two pages never show two sizes.</p>
 *
 * <p>Each step is ×1.1 — five steps ≈ ×1.61 up or ÷1.61 down, which brackets the useful range
 * without breaking the layouts. Everything sized in `em`/`%` follows the root for free; the page
 * modules keep their own px fonts off the text for exactly that reason.</p>
 */

export const UI_SCALE_MIN = -5;
export const UI_SCALE_MAX = 5;
const STEP = 1.1;
const BASE_PX = 13;

/** The setting's value, made safe: clamped to the range, floored to an integer, 0 for junk. */
export function clampScale(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, n));
}

/** The root font size for an offset, in px (base 13, ×1.1 per step). */
export function scalePx(offset: number): number {
  return Number((BASE_PX * Math.pow(STEP, clampScale(offset))).toFixed(2));
}

/** `+3` / `−3`, and empty at the base — the number is feedback, not decoration. */
export function offsetLabel(offset: number): string {
  const clamped = clampScale(offset);
  if (clamped === 0) {
    return '';
  }
  return clamped > 0 ? `+${clamped}` : `−${-clamped}`;
}

/** The header control: minus, the offset, plus. One shape for every page. */
export function zoomControlHtml(offset: number): string {
  return `<span class="zoomCtl" title="Text size (applies to every CredsForDevs page)">
    <button type="button" class="icon" data-zoom="-1" aria-label="Smaller text">−</button>
    <span id="zoomOffset" class="zoomOffset">${escapeHtml(offsetLabel(offset))}</span>
    <button type="button" class="icon" data-zoom="1" aria-label="Larger text">+</button>
  </span>`;
}

/** The CSS the page roots its text size in. On `body`, so every `em` follows. */
export function zoomStyle(offset: number): string {
  return `font-size: ${scalePx(offset)}px;`;
}

/**
 * The webview-side wiring, as a script fragment: post the delta, apply pushed values live.
 * `vscode` here is the page's own `acquireVsCodeApi()` handle, not the extension host API.
 */
export function zoomScript(): string {
  return `
  for (const zoomButton of document.querySelectorAll('button[data-zoom]')) {
    zoomButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'zoom', delta: Number(zoomButton.dataset.zoom), field: '' });
    });
  }
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'uiScale') { return; }
    document.body.style.fontSize = event.data.px + 'px';
    const offsetLabelNode = document.getElementById('zoomOffset');
    if (offsetLabelNode) { offsetLabelNode.textContent = event.data.label; }
  });`;
}

/** Shared look for the control; pages inline it beside their own styles. */
export const ZOOM_CSS = `
  .zoomCtl { display: inline-flex; align-items: center; gap: 2px; margin-left: 8px; }
  .zoomCtl button { min-width: 24px; padding: 2px 6px; }
  .zoomOffset { min-width: 2em; text-align: center; opacity: .75; font-size: .85em; }`;
