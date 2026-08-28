/**
 * The one HTML escaper the three webview renderers share.
 *
 * <p>It existed three times — byte-identical private copies in `entityFormPanel`,
 * `entityViewPanel` and `scriptRender` — which is the worst place for triplication: the day
 * one of them is hardened, the other two keep the old behaviour and nobody notices, because
 * each file looks self-consistent. `webviewHtml.test.ts` had even been named after the shared
 * module before it existed.</p>
 *
 * <p>Pure and free of `vscode`, so what it escapes is a unit test rather than a claim.</p>
 */

/**
 * The copy glyph every webview surface shares.
 *
 * <p>It was declared twice — here-shaped in the viewer and re-drawn, differently, in the
 * snippet panel under a comment claiming it reused the viewer's. Two icons for one action is
 * how the owner read the snippet button as "not a copy button"; one constant is the fix that
 * cannot regress.</p>
 */
export const COPY_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">' +
  '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/>' +
  '<path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>';

/**
 * How wide a two-column webview page may get, and where it splits.
 *
 * <p>Here rather than in each page because they must agree, and for four months they did not:
 * the viewer copied the form's `TWO_COLUMN_AT` rule when it grew its code panel in 0.77.0 and
 * kept its own 640px cap from when it had one column. It then split into two columns at a
 * WINDOW width its own CONTAINER could never reach, so every column rendered at ~308px — half
 * what the single column had been — and a config body wrapped mid-word.</p>
 *
 * <p>The invariant is one line: `PAGE_MAX_WIDTH_PX` must be at least `TWO_COLUMN_AT`, or the
 * layout splits where it has no room. Sharing the numbers is what makes that checkable once
 * instead of per page.</p>
 */
export const PAGE_MAX_WIDTH_PX = 1280;

/** The window width at which a two-column page stops stacking. */
export const TWO_COLUMN_AT = 1000;

/** The gap between group columns, and the page's side padding — the grid arithmetic below. */
export const GROUP_GAP_PX = 24;
export const PAGE_PADDING_PX = 24;

/** What one column measures on a full-width two-column page: the width a column always keeps. */
export const COLUMN_MAX_PX = (PAGE_MAX_WIDTH_PX - GROUP_GAP_PX) / 2;

/**
 * The page's cap once it has three columns — three FULL columns, not three squeezed into the
 * two-column cap. The owner's first look at the three-column form was "far too narrow — you
 * ran three into the same width" (2026-08-28): a column must measure what it measured before
 * the third one came, so the page grows by exactly one column and one gap.
 */
export const THREE_COLUMN_PAGE_MAX_PX = COLUMN_MAX_PX * 3 + GROUP_GAP_PX * 2;

/**
 * Where a page grows its THIRD column — the Agent access group (tails T24a). Derived, not
 * chosen: the window must hold three full columns plus the page padding, or the third column
 * would be paid for by the other two. Below this the agent group sits under Additional.
 */
export const THREE_COLUMN_AT = THREE_COLUMN_PAGE_MAX_PX + PAGE_PADDING_PX * 2;

/**
 * The group grid both two-column pages share (form and viewer): one column stacks
 * main → additional → agent; two columns put the agent group under Additional; a window wide
 * enough for three FULL columns gives Agent access its own. CSS order + grid placement, so the
 * markup stays one source order — and the body widens with the third column (see
 * `THREE_COLUMN_PAGE_MAX_PX`).
 */
export function groupsGridCss(className: string): string {
  return `
  .${className} { display: grid; grid-template-columns: 1fr; gap: 0 ${GROUP_GAP_PX}px; align-items: start; }
  #agentGroup { order: 3; }
  @media (min-width: ${TWO_COLUMN_AT}px) {
    .${className} { grid-template-columns: 1fr 1fr; }
    #mainGroup { grid-column: 1; grid-row: 1 / span 2; }
    #additionalGroup { grid-column: 2; grid-row: 1; }
    #agentGroup { grid-column: 2; grid-row: 2; order: 0; }
  }
  @media (min-width: ${THREE_COLUMN_AT}px) {
    body { max-width: ${THREE_COLUMN_PAGE_MAX_PX}px; }
    .${className} { grid-template-columns: 1fr 1fr 1fr; }
    #mainGroup { grid-row: 1; }
    #additionalGroup { grid-row: 1; }
    #agentGroup { grid-column: 3; grid-row: 1; }
  }`;
}

/**
 * Escape a value for interpolation into HTML **text or a double-quoted attribute**.
 *
 * <p>The single quote is escaped as well as the double, which the three copies did not do.
 * None of today's templates interpolates into a single-quoted attribute — but "none of them
 * does today" is precisely the assumption that a later edit breaks silently, and the cost of
 * being right in advance is one `replace`.</p>
 *
 * <p>What this is NOT for: a value going into a `<script>` body, a URL, or an unquoted
 * attribute. Those need their own encodings, and reaching for this one there is the mistake
 * an escaper named `escapeHtml` invites — hence this paragraph.</p>
 */
export function escapeHtml(value: string): string {
  return escapeHtmlForHighlighting(value).replace(/'/g, '&#39;');
}

/**
 * The same escape, with the **apostrophe left as data** — for text that is TOKENIZED after
 * escaping rather than simply inserted.
 *
 * <p>`scriptRender` highlights a script by escaping it and then matching tokens in the escaped
 * string: a double quote survives as `&quot;` and it matches on that, while a single quote has
 * to stay `'` because that is what it recognises a single-quoted string BY. Escaping it turned
 * `'v'` into `&#39;v&#39;`, whose `#` the tokenizer then read as the start of a comment — which
 * is exactly what the highlighter's own test caught when the two escapers were first unified.</p>
 *
 * <p>So this is not a weaker `escapeHtml` to reach for when the full one feels inconvenient. It
 * is a different operation with one caller and a reason; anything merely INSERTED into markup
 * wants `escapeHtml`.</p>
 */
export function escapeHtmlForHighlighting(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * JSON for interpolation INSIDE a `<script>` element.
 *
 * <p>`JSON.stringify` escapes quotes and backslashes and leaves `<` exactly as it found it. An
 * HTML parser ends a script element at `</script>` wherever that sequence appears — inside a
 * string literal included — so a value carrying it closes the script early and the remainder
 * of the page's own code is parsed as markup. That was a live defect in the entity form, whose
 * lists come from a SYNCED vault (a colleague's entity, a restored backup), so "our user typed
 * it" was never the argument.</p>
 *
 * <p>It lives beside `escapeHtml` for the reason that module's own note gives. There were three
 * interpolation sites and the escape existed at ONE of them: `webauthnPrf.ts` did it inline,
 * the form did not, and `entityViewPanel` was safe only because the value it passes is a
 * constant icon nobody has yet made dynamic. Safe by content is not safe by construction, and
 * the edit that makes an icon vary by kind has no reason to look at how it reaches the page.</p>
 *
 * <p><b>If you are reading this with a value in front of you, that is the trap.</b> The third
 * site was cleared during the sweep for the first two by checking what the value happened to
 * be — which answers the wrong question. Ask whether the SITE is safe whatever it is handed;
 * a value is somebody's next edit away from being different.</p>
 *
 * <p>Escaping `<` as `\u003c` keeps the text valid JSON for `JSON.parse`, and closes `<!--`
 * at the same time.</p>
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
