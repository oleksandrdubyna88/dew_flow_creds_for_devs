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
    // Through the SHARED painter, which creates the .weaveEx block. The copy that used to live here
    // appended three bare columns straight into the host, and every colour rule on this page is
    // scoped under .weaveEx — so the password picture was three grey unboxed lines (issue #51).
    paintExample(
      'weaveExampleHost',
      'password',
      'Password — ' + answer.method,
      answer,
      'Your password (made up here)'
    );
  });

  refreshWeave();
`;
}
