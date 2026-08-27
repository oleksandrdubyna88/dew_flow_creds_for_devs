/**
 * The webview-side wiring of the Generate controls (T14), as a script fragment.
 *
 * <p>Split from `entityFormScript.ts` when the option controls pushed that file over the
 * 800-line ceiling. Same contract: the page asks, the HOST draws — `crypto.randomInt` lives in
 * Node, and a webview reaching for `Math.random()` would produce something that only looks
 * random. What travels is the choices, never a value.</p>
 */
export function generateWiring(): string {
  return `
  var genChecked = function (id) {
    var box = document.getElementById(id);
    return !box || box.checked;
  };
  var askFor = function (kind) {
    return function () {
      var lengthSel = document.getElementById('genLength');
      var typeSel = document.getElementById('genKeyType');
      vscode.postMessage({
        type: 'generate',
        kind: kind,
        genLength: lengthSel ? Number(lengthSel.value) : undefined,
        genLower: genChecked('genLower'),
        genUpper: genChecked('genUpper'),
        genDigits: genChecked('genDigits'),
        genSymbols: genChecked('genSymbols'),
        genKeyType: typeSel ? typeSel.value : undefined,
        genWords: (function () {
          var wordsSel = document.getElementById('genWords');
          return wordsSel ? Number(wordsSel.value) : undefined;
        })(),
      });
    };
  };
  var genPassword = document.getElementById('genPassword');
  if (genPassword) { genPassword.addEventListener('click', askFor('password')); }
  var genPassphrase = document.getElementById('genPassphrase');
  if (genPassphrase) { genPassphrase.addEventListener('click', askFor('passphrase')); }
  var genKey = document.getElementById('genKey');
  if (genKey) { genKey.addEventListener('click', askFor('key')); }
`;
}
