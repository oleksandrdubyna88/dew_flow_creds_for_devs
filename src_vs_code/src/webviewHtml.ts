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
