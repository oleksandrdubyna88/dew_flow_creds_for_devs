import { CARD_INPUT_IDS } from './cardFormFields';
import { jsonForScript } from './webviewHtml';

/**
 * The card form's own script: deliver a stored card, and name the system as it is typed.
 *
 * <p>Its own module for the reason `qrPasteScript.ts` is — `entityFormScript.ts` is at the
 * repository's 800-line ceiling, and a self-contained block of page script is exactly what leaves
 * cleanly. Same shape too: a function returning the text, spliced in with `${cardFormScript()}`.</p>
 *
 * <p><b>No backticks anywhere below.</b> This is a template literal producing JavaScript, and one
 * backtick in a comment ends the string — which is not a subtle failure, but it is a confusing one:
 * the error lands on the line after the comment.</p>
 */
export function cardFormScript(): string {
  // Interpolated from the one table rather than written out again. The hand-written copy listed only
  // the eight CARD ids, so a stored bank record crossed `postMessage` and was dropped on the floor —
  // and would have been wiped on the next save. Found by an audit, not by a test.
  return `
  // A stored card arrives HERE rather than in the page's HTML. Every other kind's stored value is
  // rendered into the markup (a db connection string, a config body), and for a CVV and a PIN that
  // is one place too many: the HTML is a string that is built, concatenated, and — the moment
  // anything goes wrong — logged. The message goes straight to the fields, and is never a string
  // anybody else holds. (No backticks in this file: it IS a template literal.)
  ${mixScript()}
${markScript()}

  window.addEventListener('message', function (event) {
    var card = event.data;
    if (!card || card.type !== 'paymentValues') { return; }
    var fields = card.fields || {};
    var ids = ${jsonForScript(CARD_INPUT_IDS)};
    for (var i = 0; i < ids.length; i++) {
      var box = document.getElementById(ids[i]);
      if (box) { box.value = fields[ids[i]] || ''; }
    }
    showBrand();
    showMark(val2('cardBrand'));
  });

  // The mark beside the number, updated as it is typed: brandOf answers as soon as the prefix
  // decides, which is what makes this worth doing on every keystroke rather than on blur.
  function showBrand() {
    var number = document.getElementById('cardNumber');
    var hint = document.getElementById('cardBrandHint');
    if (!number || !hint) { return; }
    // How many DIGITS stand before the caret, not how many characters: the spaces are about to
    // move, and a caret counted in characters lands somewhere nobody meant.
    var upTo = number.value.slice(0, number.selectionStart || 0);
    vscode.postMessage({
      type: 'cardTyped',
      number: number.value,
      caretDigits: upTo.replace(/[^0-9]/g, '').length,
    });
  }
  var cardNumberBox = document.getElementById('cardNumber');
  if (cardNumberBox) {
    cardNumberBox.addEventListener('input', showBrand);
    // Asked for now that the listener above exists — the host answers, and nothing was posted at a
    // page that was not yet listening.
    vscode.postMessage({ type: 'cardValues' });
  }

  ${brandAnswerScript()}
`;
}

/**
 * What the page does with the host's answer: name the system, and re-group the number.
 *
 * <p>Its own block for the fifty-line ceiling, and because it is the one place this page WRITES the
 * number box rather than reading it. (No backticks in this file: it IS a template literal.)</p>
 */
function brandAnswerScript(): string {
  return `  window.addEventListener('message', function (event) {
    var brand = event.data;
    if (!brand || brand.type !== 'cardBrand') { return; }
    var hint = document.getElementById('cardBrandHint');
    if (hint) { hint.textContent = brand.text; }
    lastDetected = brand.brand || '';
    if (brandPick && brandPick.value === '') { showMark(lastDetected); }
    var box = document.getElementById('cardNumber');
    // Applied only if the box still holds what was SENT. Two keystrokes are two round trips and
    // their answers can arrive in either order; the older one must not overwrite the newer text.
    if (box && box.value === brand.was && brand.grouped !== brand.was) {
      box.value = brand.grouped;
      if (document.activeElement === box) { box.setSelectionRange(brand.caret, brand.caret); }
    }
  });
`;
}

/**
 * Which of the nine marks is on screen.
 *
 * <p>All nine were drawn into the page as constants of this build and are hidden; this reveals the
 * one the value names. That is how a glyph appears for a STORED system without that system ever
 * being interpolated into the page's HTML — the rule this whole form is built around.</p>
 *
 * <p>(No backticks in this file: it IS a template literal.)</p>
 */
function markScript(): string {
  return `  // The mark for a system, or none at all. All nine are already in the page; this reveals one.
  function showMark(brand) {
    var marks = document.querySelectorAll('#cardSection .brandMark');
    for (var i = 0; i < marks.length; i++) {
      marks[i].hidden = marks[i].dataset.brand !== brand;
    }
  }
  function val2(id) {
    var box = document.getElementById(id);
    return box ? box.value : '';
  }
  var brandPick = document.getElementById('cardBrand');
  if (brandPick) {
    brandPick.addEventListener('change', function () { showMark(brandPick.value || lastDetected); });
  }
  // What the NUMBER says, remembered so that "Detected automatically" can show a mark too.
  var lastDetected = '';
`;
}

/**
 * The weaving controls' own script: which fields are marked, which method each gets, and when the
 * controls are on screen at all.
 *
 * <p>Split from the block above only for the 50-line ceiling — but the seam is a real one: everything
 * here is about a CHOICE the person makes, and nothing here ever holds a stored value.</p>
 */
function mixScript(): string {
  return `  // ---- weaving: the marks, the method, and the per-field override -----------------------------
  // Collected here and read by the save payload. The CODE never comes back from the host and is never
  // stored — see paymentWeaving.ts. What the page owns is the choice; what it must never own is a
  // memory of it.
  function markedFields() {
    var marks = document.querySelectorAll('.mixMark');
    var picked = [];
    for (var i = 0; i < marks.length; i++) {
      if (marks[i].checked) { picked.push(marks[i].getAttribute('data-field')); }
    }
    return picked;
  }

  function collectMixFields() { return markedFields(); }

  function collectMixMethods() {
    var rows = document.querySelectorAll('.mixMethodRow');
    var own = {};
    for (var i = 0; i < rows.length; i++) {
      own[rows[i].getAttribute('data-field')] = rows[i].value;
    }
    return own;
  }

  // The controls appear only once something is marked: a method picker above three unticked boxes is
  // a question nobody was asked.
  function refreshMix() {
    var picked = markedFields();
    var controls = document.getElementById('mixControls');
    if (controls) { controls.style.display = picked.length > 0 ? '' : 'none'; }
    var warning = document.getElementById('mixWarning');
    if (warning) {
      warning.textContent = picked.length === 0 ? '' :
        'You will need this method to read ' + (picked.length === 1 ? 'this field' : 'these ' + picked.length + ' fields') +
        ' again. It is stored nowhere.';
    }
    var per = document.getElementById('mixPerField');
    if (per && per.style.display !== 'none') { renderPerField(picked); }
  }

  ${mixRenderScript()}
`;
}

/** The per-field pickers: rendering them, and remembering what was already chosen. */
function mixRenderScript(): string {
  return `  function renderPerField(picked) {
    var per = document.getElementById('mixPerField');
    var shared = document.getElementById('mixMethod');
    if (!per || !shared) { return; }
    var existing = collectMixMethods();
    var html = '';
    for (var i = 0; i < picked.length; i++) {
      var field = picked[i];
      var chosen = existing[field] || shared.value;
      html += '<label>' + field + '</label><select class="mixMethodRow" data-field="' + field + '">' +
        shared.innerHTML.split('selected').join('') + '</select>';
      html += '<span data-chosen="' + chosen + '"></span>';
    }
    per.innerHTML = html;
    var rows = per.querySelectorAll('.mixMethodRow');
    for (var j = 0; j < rows.length; j++) {
      rows[j].value = existing[rows[j].getAttribute('data-field')] || shared.value;
    }
  }

  var marks = document.querySelectorAll('.mixMark');
  for (var m = 0; m < marks.length; m++) { marks[m].addEventListener('change', refreshMix); }
  var expand = document.getElementById('mixExpand');
  if (expand) {
    expand.addEventListener('click', function () {
      var per = document.getElementById('mixPerField');
      if (!per) { return; }
      var opening = per.style.display === 'none';
      per.style.display = opening ? '' : 'none';
      expand.textContent = opening ? 'Use one method for all of them' : 'Give each field its own method…';
      if (opening) { renderPerField(markedFields()); }
    });
  }
  refreshMix();
`;
}
