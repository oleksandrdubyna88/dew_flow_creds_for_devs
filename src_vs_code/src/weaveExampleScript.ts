/**
 * The one painter for every "woven with a decoy" example, as page script.
 *
 * <p>Three forms draw the same picture — the card fields, the password, and now the seed phrase —
 * and two of them had their own copy of it. That is how the password example came to be drawn
 * WITHOUT the `.weaveEx` block the colours hang on (issue #51): every colour rule in
 * `entityFormStyles.ts` is scoped under `.weaveEx`, the card painter creates that block and the
 * password painter appended three bare columns into a host with no class. Same picture, same
 * markup, no selector reaching it — three grey unboxed lines under the controls.</p>
 *
 * <p>So the block is created by CONSTRUCTION here, and the two copies are gone. The fragment is
 * inlined ONCE, in front of the three sub-scripts in `entityFormScript.ts`, and each of them calls
 * `paintExample` and defines nothing. A sub-script that forgot the painter would throw at the first
 * method pick, which is why a test asserts both halves: the fragment appears exactly once, and all
 * three sub-scripts reference it.</p>
 *
 * <p><b>No backticks anywhere below.</b> This is a template literal producing JavaScript, and one
 * backtick — in a comment included — ends the string, with the error landing on a later line.</p>
 */

/** The default label over the column holding the value the host made up for the picture. */
export const OWN_COLUMN_LABEL = 'Your value (made up here)';

/**
 * `exampleBlock` / `exampleColumn` / `paintExample`, for the composite page script.
 *
 * <p>`paintExample(hostId, field, title, answer, ownLabel)` is the whole job: find the host, find
 * or make this field's `.weaveEx` block, and fill it with a title and the three columns. A missing
 * host is silence rather than a throw — the password host is on one form and the card host on
 * another, and the composite script runs on both.</p>
 */
export function weaveExamplePainterScript(): string {
  return `  function exampleBlock(hostId, field) {
    var host = document.getElementById(hostId);
    if (!host) { return null; }
    var found = host.querySelector('.weaveEx[data-field="' + field + '"]');
    if (found) { return found; }
    var block = document.createElement('div');
    // The class is the whole point: every colour rule on this page is scoped under .weaveEx, and
    // the copy that did not set it painted three grey lines nobody could read (issue #51).
    block.className = 'weaveEx';
    block.dataset.field = field;
    host.appendChild(block);
    return block;
  }

${exampleColumnScript()}
${paintExampleScript()}`;
}

/**
 * One column of the picture, painted with DOM APIs.
 *
 * <p>Never `innerHTML`. Nothing here is a secret — both halves were made up by the host for the
 * picture — but this page has one way of putting a value on screen and a second would be the
 * exception somebody copies.</p>
 */
function exampleColumnScript(): string {
  return `  function exampleColumn(label, tokens, side) {
    var column = document.createElement('div');
    column.className = 'exCol';
    var name = document.createElement('div');
    name.className = 'exName';
    name.textContent = label;
    column.appendChild(name);
    var row = document.createElement('div');
    row.className = 'exRow';
    for (var i = 0; i < tokens.length; i++) {
      var cell = document.createElement('span');
      cell.className = 'exTok ' + (side || tokens[i].side);
      cell.textContent = side ? tokens[i] : tokens[i].text;
      row.appendChild(cell);
    }
    column.appendChild(row);
    return column;
  }`;
}

/** The title and the three columns, which is the same three lines in all three forms. */
function paintExampleScript(): string {
  return `  function paintExample(hostId, field, title, answer, ownLabel) {
    var block = exampleBlock(hostId, field);
    if (!block) { return; }
    block.textContent = '';
    var head = document.createElement('div');
    head.className = 'exTitle';
    head.textContent = title;
    block.appendChild(head);
    block.appendChild(exampleColumn(ownLabel || '${OWN_COLUMN_LABEL}', answer.first, 'first'));
    block.appendChild(exampleColumn('The decoy it is woven with', answer.second, 'second'));
    block.appendChild(exampleColumn('What gets stored', answer.woven, ''));
  }`;
}
