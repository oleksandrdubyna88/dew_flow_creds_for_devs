import { NAME_PATTERNS, NAME_REFUSAL } from './commandName';
import { jsonForScript } from './webviewHtml';

/**
 * The form's "Full command" preview, with `{name}` filled in the way `resolveCommand` fills it (parent
 * `PLAN_terminal_folder_run.md` §1) — the same three patterns, handed over as data, never retyped.
 *
 * <p>FUNCTION DECLARATIONS only: `renderArgs()` runs during the page's first pass, and a `var` here would not have
 * its value yet in other orders. It reads the page's own `argRows` and `val`. The refusal goes to `textContent`,
 * never `innerHTML`. The name is trimmed as the save trims it (`str(data, 'name').trim()`).</p>
 *
 * <p>No backtick, `$` followed by a brace, or script end tag may appear in the fragment, comments included:
 * it sits inside a template literal that becomes a script (`typescript/doctrine.md` §1 and §2).</p>
 */
export function commandPreviewScript(): string {
  return `function previewNameAccepted(name) {
    return new RegExp(${jsonForScript(NAME_PATTERNS.shape)}, 'u').test(name)
      && !new RegExp(${jsonForScript(NAME_PATTERNS.ignorable)}, 'u').test(name)
      && name === name.normalize('NFC');
  }

  function resolvedPreview(template, name) {
    var token = new RegExp(${jsonForScript(NAME_PATTERNS.token)}, 'gu');
    if (template.search(token) === -1) { return { line: template, refusal: '' }; }
    if (!previewNameAccepted(name)) { return { line: template, refusal: ${jsonForScript(NAME_REFUSAL)} }; }
    return { line: template.replace(token, function () { return name; }), refusal: '' };
  }

  function updatePreview() {
    var base = (val('command') || '').trim();
    var parts = argRows
      .filter(function (r) { return r.disabled !== true; })
      .map(function (r) { return (r.value || '').trim(); })
      .filter(function (r) { return r.length > 0; });
    var template = base.length > 0 ? [base].concat(parts).join(' ') : '';
    var resolved = resolvedPreview(template, (val('name') || '').trim());
    var preview = document.getElementById('commandPreview');
    if (preview) { preview.value = resolved.line; }
    var note = document.getElementById('commandPreviewRefusal');
    if (note) {
      note.textContent = resolved.refusal === '' ? '' : 'Will not run: ' + resolved.refusal;
      note.hidden = resolved.refusal === '';
    }
  }

  function wirePreviewName() {
    var name = document.getElementById('name');
    if (name) { name.addEventListener('input', updatePreview); }
  }
`;
}
