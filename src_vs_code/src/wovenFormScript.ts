/**
 * The weaving controls' own page script: when they are on screen, and what the picture shows.
 *
 * <p>Its own module for the reason `cardFormScript.ts` and `phraseFormScript.ts` are —
 * `entityFormScript.ts` sits one line under the 800-line ceiling, and a self-contained block of
 * page script is exactly what leaves cleanly.</p>
 *
 * <p><b>No backticks anywhere below.</b> This is a template literal producing JavaScript, and one
 * backtick in a comment ends the string — the error then lands on the line after the comment.</p>
 */
export function wovenFormScript(): string {
  return `
  // ---- storing a password woven with a decoy ---------------------------------------------------
  // The controls appear only once the box is ticked: a method picker above an unticked box is a
  // question nobody was asked.
  var weaveBox = document.getElementById('weavePassword');
  var weaveWrap = document.getElementById('weaveControls');
  var weaveMethodPick = document.getElementById('weaveMethod');

  function askWeaveExample() {
    if (!weaveBox || !weaveBox.checked || !weaveMethodPick) { return; }
    vscode.postMessage({ type: 'weaveExample', field: 'password', code: weaveMethodPick.value });
  }

  function refreshWeave() {
    if (!weaveWrap || !weaveBox) { return; }
    weaveWrap.style.display = weaveBox.checked ? '' : 'none';
    askWeaveExample();
  }

  if (weaveBox) { weaveBox.addEventListener('change', refreshWeave); }
  if (weaveMethodPick) { weaveMethodPick.addEventListener('change', askWeaveExample); }

  window.addEventListener('message', function (event) {
    var answer = event.data;
    if (!answer || answer.type !== 'weaveExampleResult' || answer.field !== 'password') { return; }
    // Dropped when the picker has moved on: two changes are two requests and their answers can
    // arrive in either order, and a picture of a method nobody chose is worse than none.
    if (!weaveMethodPick || answer.method !== weaveMethodPick.value) { return; }
    var host = document.getElementById('weaveExampleHost');
    if (!host) { return; }
    host.textContent = '';
    host.appendChild(weaveColumn('Your password (made up here)', answer.first, 'first'));
    host.appendChild(weaveColumn('The decoy it is woven with', answer.second, 'second'));
    host.appendChild(weaveColumn('What gets stored', answer.woven, ''));
  });

${weaveColumnScript()}`;
}

/**
 * One column of the picture, painted with DOM APIs.
 *
 * <p>Its own block for the fifty-line ceiling, and because it is the one part of this script that
 * writes to the page rather than deciding when to ask. (No backticks in this file.)</p>
 */
function weaveColumnScript(): string {
  return `  function weaveColumn(label, tokens, side) {
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
  }

  refreshWeave();
`;
}
