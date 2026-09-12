import { CARD_INPUT_IDS } from './cardFormFields';
import { jsonForScript } from './webviewHtml';
import { PAYMENT_FIELD_LABELS } from './paymentFields';

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
  var sharedMethod = document.getElementById('mixMethod');
  if (sharedMethod) { sharedMethod.addEventListener('change', askExamplesSoon); }
  var brandPick = document.getElementById('cardBrand');
  if (brandPick) {
    brandPick.addEventListener('change', function () { showMark(brandPick.value || lastDetected); });
  }
  // What the NUMBER says, remembered so that "Detected automatically" can show a mark too.
  var lastDetected = '';
`;
}

/**
 * Which weave boxes count as ticked — and why a hidden one does not.
 *
 * <p>A box in a fieldset the chosen form HIDES is not a choice anybody is making. Ticking <i>store
 * the number woven</i> on a card and then switching the entry to bank details leaves that box ticked
 * in a hidden fieldset, and counting it put the shared controls on a bank form with no bank box
 * ticked — offering a method for a field the record is about to drop. The SAVE was already safe
 * (`paymentSaveGate` clears what the chosen form does not own before weaving), so this is about the
 * question rather than the answer: do not ask it about a field nobody can see.</p>
 *
 * <p>(No backticks in this file: it IS a template literal.)</p>
 */
function markCollectorScript(): string {
  return `  // Whether this form owns a field at all — it does iff it has a weave box for it. The card's
  // three and the bank's two answer yes; a password or a seed phrase answers no, and so would any
  // field a form added later, with nothing here to remember to update.
  function ownMark(field) {
    return document.querySelector('.mixMark[data-field="' + field + '"]') !== null;
  }

  function visibleMark(mark) {
    var section = mark.closest ? mark.closest('fieldset') : null;
    return section === null || section.style.display !== 'none';
  }

  function markedFields() {
    var marks = document.querySelectorAll('.mixMark');
    var picked = [];
    for (var i = 0; i < marks.length; i++) {
      if (marks[i].checked && visibleMark(marks[i])) { picked.push(marks[i].getAttribute('data-field')); }
    }
    return picked;
  }
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
${markCollectorScript()}
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
    var expand = document.getElementById('mixExpand');
    // Opened by itself once a SECOND field is marked: one shared method is the obvious answer for
    // one field and a question for several, and a question behind a button reads as no question.
    if (per && picked.length > 1 && per.style.display === 'none') {
      per.style.display = '';
      if (expand) { expand.textContent = 'Use one method for all of them'; }
    }
    if (per && per.style.display !== 'none') { renderPerField(picked); }
    askExamplesSoon();
  }

  ${mixRenderScript()}
${addressScript()}
${exampleScript()}
`;
}

/**
 * The worked example: ask for one per marked field, and paint the three columns.
 *
 * <p>Painted with DOM APIs rather than `innerHTML`, like everything else on this page that shows a
 * value. Nothing here is a secret — both columns were made up by the host — but the page has one
 * way of putting text on screen and a second one would be the exception somebody copies.</p>
 *
 * <p>The block is keyed by FIELD, so answers that arrive in a different order than they were asked
 * for land in their own places rather than overwriting each other. (No backticks in this file.)</p>
 */
function exampleScript(): string {
  return `  // One repaint per BURST of control changes, not one per keystroke: five marked fields under ten
  // quick changes is fifty host draws, most of them obsolete before they are painted.
  var exampleTimer = 0;
  function askExamplesSoon() {
    if (exampleTimer) { clearTimeout(exampleTimer); }
    exampleTimer = setTimeout(askExamples, 120);
  }

  // What THIS field's method is right now — its own, or the shared one.
  function methodNow(field) {
    var own = collectMixMethods();
    var shared = document.getElementById('mixMethod');
    return own[field] || (shared ? shared.value : '');
  }

  function askExamples() {
    var host = document.getElementById('mixExample');
    if (!host) { return; }
    var picked = markedFields();
    var own = collectMixMethods();
    var shared = document.getElementById('mixMethod');
    // A block per marked field, in the order they are ticked. Removing the ones no longer marked
    // here rather than on the answer keeps an unticked field from lingering while its answer flies.
    var keep = {};
    for (var i = 0; i < picked.length; i++) { keep[picked[i]] = true; }
    var blocks = host.querySelectorAll('.weaveEx');
    for (var b = 0; b < blocks.length; b++) {
      if (!keep[blocks[b].dataset.field]) { blocks[b].remove(); }
    }
    for (var j = 0; j < picked.length; j++) {
      vscode.postMessage({
        type: 'weaveExample',
        field: picked[j],
        code: own[picked[j]] || (shared ? shared.value : ''),
      });
    }
  }

${examplePaintScript()}`;
}

/**
 * Taking one answer to the shared painter.
 *
 * <p>The painter itself lives in `weaveExampleScript.ts` and is inlined once, ahead of this script.
 * It used to live here, and the password form had a near-verbatim copy that forgot to create the
 * `.weaveEx` block every colour rule is scoped under — three grey unboxed lines (issue #51). One
 * painter is how that cannot recur. (No backticks.)</p>
 */
function examplePaintScript(): string {
  return `  window.addEventListener('message', function (event) {
    var answer = event.data;
    if (!answer || answer.type !== 'weaveExampleResult' || !answer.field) { return; }
    // MINE, asked positively. Every listener in this composite script hears every answer, and a
    // list of the other forms' fields to skip is a list somebody must remember to extend: a fourth
    // weaving form would have its picture painted into #mixExample as well as its own host, or lost
    // into a host this page does not have. A field is this form's iff this form has a box for it.
    if (!ownMark(answer.field)) { return; }
    // Two changes are two requests, and their answers can arrive in either order. An answer for a
    // method the controls no longer show would leave somebody choosing from a picture of a
    // different algorithm with nothing saying so — the same guard the reassembly answers carry.
    if (answer.method !== methodNow(answer.field)) { return; }
    paintExample(
      'mixExample',
      answer.field,
      (FIELD_LABELS[answer.field] || answer.field) + ' — ' + answer.method,
      answer
    );
  });
`;
}

/** The per-field pickers: rendering them, and remembering what was already chosen. */
function mixRenderScript(): string {
  return `  var FIELD_LABELS = ${jsonForScript(PAYMENT_FIELD_LABELS)};
  function renderPerField(picked) {
    var per = document.getElementById('mixPerField');
    var shared = document.getElementById('mixMethod');
    if (!per || !shared) { return; }
    var existing = collectMixMethods();
    var html = '';
    for (var i = 0; i < picked.length; i++) {
      var field = picked[i];
      html += '<label>' + (FIELD_LABELS[field] || field) + '</label>' +
        '<select class="mixMethodRow" data-field="' + field + '">' +
        shared.innerHTML.split('selected').join('') + '</select>';
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

/**
 * The billing address: paste a line, get cells, watch the block assemble underneath.
 *
 * <p>Both round trips go to the host, which is where a parser can be unit tested — the page's job
 * is to hand over what is in the boxes and put back what comes home. (No backticks in this file.)</p>
 */
export function addressScript(): string {
  return `  var ADDRESS_IDS = ['cardAddressLine1', 'cardAddressLine2', 'cardAddressCity',
                     'cardAddressRegion', 'cardAddressPostal', 'cardCountry'];

  function addressData() {
    var data = {};
    for (var i = 0; i < ADDRESS_IDS.length; i++) {
      var box = document.getElementById(ADDRESS_IDS[i]);
      data[ADDRESS_IDS[i]] = box ? box.value : '';
    }
    return data;
  }

  function refreshAddress() {
    vscode.postMessage({ type: 'addressChanged', data: addressData() });
  }

  for (var a = 0; a < ADDRESS_IDS.length; a++) {
    var cell = document.getElementById(ADDRESS_IDS[a]);
    if (cell) { cell.addEventListener('input', refreshAddress); }
  }

  var addressPaste = document.getElementById('addressPaste');
  var splitAddress = document.getElementById('splitAddress');
  function askSplitAddress() {
    if (addressPaste && addressPaste.value.trim().length > 0) {
      vscode.postMessage({ type: 'splitAddress', text: addressPaste.value });
    }
  }
  if (splitAddress) { splitAddress.addEventListener('click', askSplitAddress); }
  // Pasting is the ordinary way in, so it splits by itself — the button is for a line typed by hand
  // and for trying again after an edit.
  if (addressPaste) { addressPaste.addEventListener('change', askSplitAddress); }

  window.addEventListener('message', function (event) {
    var answer = event.data;
    if (!answer) { return; }
    if (answer.type === 'addressSplit') {
      for (var i = 0; i < ADDRESS_IDS.length; i++) {
        var box = document.getElementById(ADDRESS_IDS[i]);
        // EVERY cell, empty ones included: pressing Split is REPLACING this address, not adding to
        // it. Keeping a cell the parse did not fill leaves the old postcode under the new street,
        // and the preview and the save then carry a place nobody lives. (Review finding, twice.)
        if (box) { box.value = answer[ADDRESS_IDS[i]] || ''; }
      }
      refreshAddress();
    }
    if (answer.type === 'addressPreview') {
      var preview = document.getElementById('addressPreview');
      if (preview) { preview.value = answer.text; }
    }
  });
`;
}
