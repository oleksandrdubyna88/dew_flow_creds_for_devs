/**
 * The config section's two views, as the page runs them.
 *
 * <p><b>The raw textarea is the source of truth, and the only thing Save reads.</b> The Fields tab
 * does not hold a parallel model of the document — it asks the host for the rows, and a row edit
 * is sent back as "here is the whole text, splice this one value into it". What returns is the
 * new raw text, which the textarea then holds. So the Fields tab structurally CANNOT lose
 * formatting, comments or key order: it never assembles a document, it only ever asks for one
 * character range to be replaced.</p>
 *
 * <p>All of the knowledge is host-side, in `configFields.ts`, for the reason the highlighter
 * already established next door: one implementation that a unit test can reach, rather than a
 * second one living in a template string where nothing can check it.</p>
 *
 * <p>Its own module because `entityFormScript.ts` sits at 793 lines against an 800-line ceiling —
 * the same reason `formVisibilityScript`, `mcpSwitchScript` and `depPickerScript` are separate.
 * Like them it returns a FRAGMENT, running inside the page's one script beside the `val` and
 * `show` helpers it uses.</p>
 */
// eslint-disable-next-line max-lines-per-function
export function configTabsScript(): string {
  return `
  // ---- config: two views of one document ----
  function showConfigTab(which) {
    var raw = which === 'raw';
    show('configRawPane', raw);
    show('configFieldsPane', !raw);
    document.getElementById('configTabRaw').className = raw ? 'tab on' : 'tab';
    document.getElementById('configTabFields').className = raw ? 'tab' : 'tab on';
    if (!raw) { requestConfigFields(); }
  }

  function requestConfigFields() {
    vscode.postMessage({ type: 'configFields', text: val('configBody'), lang: val('configFormat') });
  }

  // Rows are BUILT, never interpolated: a config holds whatever somebody pasted, and a path or a
  // value assembled into innerHTML is the injection this page is otherwise careful about.
  function configFieldRow(field) {
    var row = document.createElement('div');
    row.className = 'fieldRow';
    var label = document.createElement('label');
    label.textContent = field.path;
    label.setAttribute('for', 'cf_' + field.path);
    var input = document.createElement('input');
    input.type = 'text';
    input.id = 'cf_' + field.path;
    input.value = field.value;
    input.addEventListener('change', function () {
      vscode.postMessage({
        type: 'configFieldEdit', text: val('configBody'), lang: val('configFormat'),
        path: field.path, value: input.value,
      });
    });
    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  function renderConfigFields(fields) {
    var host = document.getElementById('configFieldRows');
    var note = document.getElementById('configFieldsNote');
    host.textContent = '';
    if (fields === null) {
      note.textContent = 'No field view for this format — edit it in Raw. Building rows from a hand-written reader would rewrite your document the first time you used them.';
      return;
    }
    note.textContent = fields.length === 0
      ? 'Nothing to show yet. Type the document in Raw and its values appear here.'
      : 'Editing a row changes that one value in the document and nothing else — the formatting and the comments stay exactly as they are.';
    for (var i = 0; i < fields.length; i++) { host.appendChild(configFieldRow(fields[i])); }
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (msg.type === 'configFieldsResult') { renderConfigFields(msg.fields); }
    if (msg.type === 'configBody') {
      document.getElementById('configBody').value = msg.text;
      requestConfigFields();
    }
  });

  document.getElementById('configTabRaw').addEventListener('click', function () { showConfigTab('raw'); });
  document.getElementById('configTabFields').addEventListener('click', function () { showConfigTab('fields'); });
  showConfigTab('raw');
`;
}
