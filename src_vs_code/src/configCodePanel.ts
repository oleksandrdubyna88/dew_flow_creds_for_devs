import { Snippet, SNIPPET_LANGUAGES, snippetLanguage } from './configSnippet';
import { highlightScript } from './scriptRender';
import { escapeHtml } from './webviewHtml';

/**
 * The viewer's second column: "how do I read this from code?", answered per language.
 *
 * <p>Pure markup from data, so what the panel says is a unit test rather than twenty things to
 * click through. The snippet itself comes from `configSnippet.ts`; this decides only how it is
 * laid out and what is said around it.</p>
 *
 * <p><b>Shown even when nobody has opened this config to code yet</b>, with a line saying so.
 * Hiding it until a key exists would hide the feature from exactly the people who have not met
 * it — and seeing what the code will look like is most of how somebody decides whether to turn
 * it on.</p>
 */

export interface CodePanelOptions {
  readonly snippet: Snippet;
  readonly languageId: string;
  readonly variantId: string;
  /** False until somebody runs *Enable Code Access* on this entry. */
  readonly hasKey: boolean;
  readonly envVar: string;
}

export function configCodePanel(options: CodePanelOptions): string {
  return `<div class="codePanel">
  <h3>Read this from code</h3>
  ${accessLine(options)}
  <div class="row">
    <label for="snippetLanguage">Language</label>
    <select id="snippetLanguage">${languageOptions(options.languageId)}</select>
  </div>
  ${variantRow(options)}
  <p class="hint" id="snippetWhere">${escapeHtml(options.snippet.where)}</p>
  <p class="hint" id="snippetDoes">${escapeHtml(options.snippet.does)}</p>
  <div class="line">
    <pre class="code" id="snippetCode">${highlightSnippet(options.snippet)}</pre>
    <button data-field="snippet" data-action="copy" class="icon" title="Copy snippet" aria-label="Copy snippet">${COPY}</button>
  </div>
  <p class="hint">${depthNote(options.snippet)}</p>
</div>`;
}

/** Reuses the viewer's own icon so the two copy buttons are the same button. */
const COPY =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
  '<path d="M4 2h7l3 3v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" opacity=".85"/></svg>';

/**
 * Whether this config is reachable from code at all, said before the code that assumes it is.
 *
 * <p>The order matters: somebody reading a snippet that cannot work yet, and only finding out
 * afterwards, has been given a puzzle rather than an instruction.</p>
 */
function accessLine(options: CodePanelOptions): string {
  if (options.hasKey) {
    return `<p class="hint">Open to code. The key lives in <code>${escapeHtml(options.envVar)}</code> — it was shown once when you enabled access, and the vault keeps only a hash of it.</p>`;
  }
  return `<p class="hint bad">Not open to code yet. Right-click this entry and choose <b>Enable Code Access…</b>; a key is minted, copied to your clipboard, and shown once.</p>`;
}

/** Only where the language has more than one, because a picker with one entry is furniture. */
function variantRow(options: CodePanelOptions): string {
  const language = snippetLanguage(options.languageId);
  if (language === undefined || language.variants.length < 2) {
    return '';
  }
  const chosen = language.variants.map(
    (variant) =>
      `<option value="${escapeHtml(variant.id)}" ${variant.id === options.variantId ? 'selected' : ''}>${escapeHtml(variant.label)}</option>`,
  );
  return `<div class="row" id="snippetVariantRow">
    <label for="snippetVariant">Version</label>
    <select id="snippetVariant">${chosen.join('')}</select>
  </div>`;
}

function languageOptions(selected: string): string {
  return SNIPPET_LANGUAGES.map(
    (language) =>
      `<option value="${escapeHtml(language.id)}" ${language.id === selected ? 'selected' : ''}>${escapeHtml(language.label)}</option>`,
  ).join('');
}

/**
 * What this snippet actually gets you, in one line under it.
 *
 * <p>Said out loud because twenty entries that all looked equally deep would be the dishonest
 * version of this panel: three of them really do plug into the platform's configuration system,
 * and the rest hand you a parsed document, which is useful and is not the same thing.</p>
 */
function depthNote(snippet: Snippet): string {
  return snippet.depth === 'framework'
    ? 'This one plugs into the platform’s own configuration system — everything that already reads configuration picks it up.'
    : 'This one hands you the parsed document. What you do with it is yours; there is no configuration system here to plug into.';
}

/** The snippet, highlighted by the grammar nearest to its language. */
export function highlightSnippet(snippet: Snippet): string {
  return highlightScript(snippet.code, snippet.highlightAs);
}
