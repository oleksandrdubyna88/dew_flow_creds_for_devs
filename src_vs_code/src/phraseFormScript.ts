import { LAYOUT_REFUSAL, horizontalCounts } from './phraseLayout';
import { jsonForScript } from './webviewHtml';

/**
 * The phrase form's own script: counting words, offering the layouts the count allows, and showing
 * the second column only when there is one to fill in.
 *
 * <p><b>The layout rule is not re-implemented here.</b> The page cannot call `layoutsFor` — it is a
 * page — so it is handed that function's own answers (`horizontalCounts()`) and its own sentence
 * (`LAYOUT_REFUSAL`). A parity check written into this script would be a second copy of a rule that
 * decides whether a phrase can be saved at all, and the two would drift the first time the range
 * changed.</p>
 *
 * <p>Interpolated through `jsonForScript`, never `JSON.stringify` — the repository's first
 * TypeScript rule, and it has been broken three times by three different people here.</p>
 *
 * <p>Why the layout is OFFERED rather than refused: a refusal after a filled-in form is exactly the
 * failure S4.4 was written to prevent. At 25 words the halves are 13 and 12, the columns are unequal,
 * and a save would die at the last step with everything already typed.</p>
 */
export function phraseFormScript(): string {
  return `
${phraseGenerateScript()}
  // ---- the phrase form: words, layouts, and the second column --------------------------------
  var phraseWords = document.getElementById('phraseWords');
  if (phraseWords) {
    var PHRASE_EVEN = ${jsonForScript(horizontalCounts())};
    var PHRASE_REFUSAL = ${jsonForScript(LAYOUT_REFUSAL)};
    var phraseCountOf = function (id) {
      var box = document.getElementById(id);
      if (!box || !box.value) { return 0; }
      var words = box.value.split(/\\s+/).filter(function (w) { return w.length > 0; });
      return words.length;
    };
${phraseRefresh()}
${phraseListeners()}
    refreshPhrase();
  }
`;
}

/** What the form says about what has been typed so far. */
function phraseRefresh(): string {
  return `    function refreshPhrase() {
      var count = phraseCountOf('phraseWords');
      var own = document.getElementById('phraseSecondMode').value === 'own';
      var second = own ? phraseCountOf('phraseSecond') : count;
      document.getElementById('phraseCount').textContent =
        count === 0 ? '' : count + (count === 1 ? ' word' : ' words');
      document.getElementById('phraseSecondCount').textContent =
        !own || second === 0 ? '' : second + (second === 1 ? ' word' : ' words') +
          (second === count ? '' : ' — both columns must be the same length, and the phrase has ' + count);
      document.getElementById('phraseSecondNote').textContent = own
        ? 'A second real key here means one assembled view reveals BOTH. That is the trade, and it is yours to make.'
        : 'Drawn to look exactly like your phrase: same length, same list, and the same checksum state, so neither half stands out.';
      document.getElementById('phraseOwnBox').style.display = own ? '' : 'none';
      refreshLayout(count);
    }

    // The side-by-side option is REMOVED rather than shown and then refused, and the sentence
    // saying why is the host's own — see LAYOUT_REFUSAL.
    function refreshLayout(count) {
      var select = document.getElementById('phraseLayout');
      var allowed = count === 0 || PHRASE_EVEN.indexOf(count) >= 0;
      var horizontal = select.querySelector('option[value="horizontal"]');
      if (horizontal) { horizontal.disabled = !allowed; }
      if (!allowed && select.value === 'horizontal') { select.value = 'vertical'; }
      document.getElementById('phraseLayoutNote').textContent =
        count === 0 || allowed ? '' : PHRASE_REFUSAL.split('{count}').join(String(count));
    }
`;
}

/** Every control that changes what the paragraphs above say. */
function phraseListeners(): string {
  return `    var phraseInputs = ['phraseWords', 'phraseSecond', 'phraseSecondMode'];
    for (var i = 0; i < phraseInputs.length; i++) {
      var control = document.getElementById(phraseInputs[i]);
      if (control) {
        control.addEventListener('input', refreshPhrase);
        control.addEventListener('change', refreshPhrase);
      }
    }
`;
}

/**
 * Drawing a phrase: the count and the list go to the host, the words come back.
 *
 * <p>The host draws it — `crypto.randomInt` is a Node API, and a page reaching for `Math.random()`
 * would produce a seed that merely looks random. The page's whole part is naming the choices and
 * putting the answer in the box. (No backticks in this file: it IS a template literal.)</p>
 */
export function phraseGenerateScript(): string {
  return `
  var generatePhraseButton = document.getElementById('generatePhrase');
  if (generatePhraseButton) {
    generatePhraseButton.addEventListener('click', function () {
      var count = document.getElementById('phraseGenWords');
      var list = document.getElementById('phraseListFirst');
      vscode.postMessage({
        type: 'generatePhrase',
        genWords: count ? Number(count.value) : undefined,
        genWordlist: list ? list.value : undefined,
      });
    });
  }

  window.addEventListener('message', function (event) {
    var drawn = event.data;
    if (!drawn || drawn.type !== 'phraseGenerated') { return; }
    var note = document.getElementById('phraseGenNote');
    if (!drawn.ok) {
      if (note) { note.textContent = drawn.why; }
      return;
    }
    var box = document.getElementById('phraseWords');
    if (box) {
      box.value = drawn.words;
      // The count under the box is computed from what is in it, so it has to be told.
      box.dispatchEvent(new Event('input'));
    }
    if (note) { note.textContent = drawn.note; }
  });
`;
}
