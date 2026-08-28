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
  // T24b: the agent-doors footer's "manage…" links ask the host for the named command.
  for (const doorLink of document.querySelectorAll('a.doorLink')) {
    doorLink.addEventListener('click', function () {
      vscode.postMessage({ type: 'command', command: this.dataset.command });
    });
  }

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

/**
 * The overlay-highlighted editors (T17) — the script body and the config body — as a script
 * fragment, for the same reason as the generator wiring above: the page script crossed the
 * 800-line ceiling. One wiring for both boxes; answers are routed by hlTarget.
 */
// One template literal, so it is one "function" only in the way TypeScript counts.
// eslint-disable-next-line max-lines-per-function
export function overlayEditorWiring(): string {
  return `
  // ---- overlay-highlighted editors: the script body and the config body (T17) ----
  // One wiring for both: the highlighter runs in the extension host, answers are routed by
  // hlTarget, and the textarea keeps painting its own glyphs until the overlay demonstrably
  // holds the same content (the lit class + watchdog below).
  function wireOverlayEditor(bodyId, hlId, langOf) {
    var body = document.getElementById(bodyId);
    var hl = document.getElementById(hlId);
    if (!body || !hl) { return; }
    var wrap = body.parentElement;
    var timer;
    var watchdog;
    // The highlighter runs in the extension host, so the overlay is always one round trip
    // behind what was just typed. One frame of debounce keeps that imperceptible; the old
    // 120 ms was long enough to see, because the textarea's own text is hidden while the
    // overlay is the thing being read.
    function ask() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        vscode.postMessage({ type: 'highlight', text: body.value, lang: langOf(), hlTarget: hlId });
        // If nothing answers — a handler that threw, a host that went away — stop hiding
        // the textarea's glyphs. An editor showing nothing is worse than an unhighlighted
        // one, and this is the state the user actually hit.
        clearTimeout(watchdog);
        watchdog = setTimeout(function () {
          if (wrap) { wrap.classList.remove('lit'); }
        }, 400);
      }, 16);
    }
    body.addEventListener('input', ask);
    body.addEventListener('scroll', function () {
      hl.scrollTop = body.scrollTop; hl.scrollLeft = body.scrollLeft;
    });
    window.addEventListener('message', function (event) {
      var msg = event.data || {};
      if (msg.type === 'highlighted' && msg.hlTarget === hlId) {
        clearTimeout(watchdog);
        hl.innerHTML = msg.html + String.fromCharCode(10);
        hl.scrollTop = body.scrollTop;
        // Only now is it safe for the textarea to stop painting its own text: the overlay
        // demonstrably holds the same content.
        if (wrap) { wrap.classList.add('lit'); }
      }
    });
    ask();
    return ask;
  }
  (function wireScript() {
    var langSel = document.getElementById('scriptLanguage');
    if (!langSel) { return; }
    var ask = wireOverlayEditor('scriptBody', 'scriptHl', function () { return langSel.value; });
    if (ask) { langSel.addEventListener('change', ask); }
  })();
  (function wireConfig() {
    var formatSel = document.getElementById('configFormat');
    if (!formatSel) { return; }
    // The FORMAT is the language — json/yaml/toml/ini/env all have highlighter grammars.
    var ask = wireOverlayEditor('configBody', 'configHl', function () { return formatSel.value; });
    if (ask) { formatSel.addEventListener('change', ask); }
  })();


`;
}
