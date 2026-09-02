import { PAYMENT_FIELD_LABELS, PaymentFieldKey } from './paymentFields';
import { COPY_ICON, escapeHtml } from './webviewHtml';
import { PaymentCardView } from './paymentViewMessages';
import { needsReveal } from './revealGate';

/**
 * The read-only payment card: the one surface on which a stored card, a set of bank details or a
 * woven value can be read at all.
 *
 * <p>Its own module rather than another section of `entityViewPage.ts`, which sits at 785 of this
 * repository's 800-line ceiling — the same reason `paymentFormMarkup.ts` left the form page, and the
 * same shape: pure markup, no `vscode`, so what it draws is a unit test rather than something only a
 * person opening a panel could check.</p>
 *
 * <h3>The rule this card is built around</h3>
 *
 * <p><b>Nothing from the record is interpolated into this markup.</b> Not a masked value, not a
 * length, not a first digit — only the NAMES of the keys the record holds and which of them are
 * woven. Every value arrives afterwards by message and is set as a DOM property, never as an
 * attribute. The page is a string that gets built, concatenated and, the moment anything goes wrong,
 * logged; a CVV must not be able to reach a log through it. The form established this rule for the
 * write side (S2.3) and this is the read side of the same rule.</p>
 *
 * <h3>And the rule the woven rows are built around</h3>
 *
 * <p>A reassembly <b>hints at nothing</b>. Both rows are drawn identically, neither is marked, and
 * the order is the arithmetic's rather than a guess at which is likelier. A "valid BIP-39" tick here
 * would turn twelve methods into one second of enumeration for exactly the person the scheme defends
 * against — which is the trap the parent plan names in its own §4.5.</p>
 */

/** What a Show button asks for — one name, so the panel's switch has one shape to match. */
export const REVEAL_ACTION = 'reveal';

/** What a method picker's Show asks for: a woven field rebuilt under the chosen method. */
export const REASSEMBLE_ACTION = 'reassemble';

/**
 * The card, or nothing at all for an entry that is not a payment.
 *
 * <p>An empty string is what `viewFrame` reads as "draw no frame", so a non-payment entry's viewer is
 * byte-for-byte what it was before this feature — which is the property its test asserts.</p>
 */
export function paymentCardMarkup(view: PaymentCardView | undefined): string {
  if (view === undefined || view.present.length === 0) {
    return '';
  }
  const woven = new Set<string>(view.woven);
  return `<div id="payCard" data-entity="${escapeHtml(view.entityId)}">
${view.present.map((key) => (woven.has(key) ? wovenRow(key, view) : plainRow(key))).join('\n')}
</div>`;
}

/**
 * A field the card can simply show — filled by message on load.
 *
 * <p>A gated one (a CVV, a PIN) is the same row with its input left masked and a Show beside it:
 * `revealGate` decides which, so the card and the host cannot disagree about what asks twice.</p>
 */
function plainRow(key: PaymentFieldKey): string {
  const label = escapeHtml(PAYMENT_FIELD_LABELS[key]);
  const gated = needsReveal(key);
  const show = gated
    ? `<button data-field="${key}" data-action="${REVEAL_ACTION}" class="icon" title="Show the ${label} — this asks first" aria-label="Show ${label}">Show</button>`
    : '';
  return `<div class="row">
      <label>${label}</label>
      <div class="line"><input readonly id="pay_${key}"${gated ? ' value="••••••••" class="gated"' : ''}>
        ${show}<button data-field="pay_${key}" data-action="copy" class="icon" title="Copy ${label}" aria-label="Copy ${label}">${COPY_ICON}</button>
      </div>
    </div>`;
}

/**
 * A woven field: the methods, a Show, and two rows that start empty.
 *
 * <p>The method list is in a different order every time the card opens (`methodOrder`), so that "the
 * third one" never becomes a habit worth forming — a method remembered by POSITION is one a later
 * release could silently move, and a value woven under a method nobody can name again is gone.</p>
 *
 * <p>The layout is not offered, because it is stored: a phrase record carries `layout`, so a picker
 * would offer twenty-four readings while the record already says which twelve are meaningful.</p>
 */
function wovenRow(key: PaymentFieldKey, view: PaymentCardView): string {
  const label = escapeHtml(PAYMENT_FIELD_LABELS[key]);
  const options = view.methods
    .map((code, index) => `<option value="${code}">Method ${index + 1}</option>`)
    .join('');
  return `<div class="row wovenRow" data-key="${key}">
      <label>${label} — stored woven with a decoy</label>
      <div class="line">
        <select class="mixPick" data-key="${key}" aria-label="Method for ${label}">${options}</select>
        <button data-field="${key}" data-action="${REASSEMBLE_ACTION}" class="icon" title="Rebuild ${label} under the chosen method" aria-label="Show ${label}">Show</button>
      </div>
      <div class="note payNote" id="payNote_${key}">${escapeHtml(hint(key, view.wordCount))}</div>
      <div class="readingRows" id="payRows_${key}" hidden>
        ${readingRow(key, 'a', label)}
        ${readingRow(key, 'b', label)}
      </div>
    </div>`;
}

/**
 * One of the two rows. They are deliberately identical in every respect a reader could use.
 *
 * <p>They are numbered rather than named — "First" and "Second" — and the ids the page uses are `a`
 * and `b` rather than `real` and `decoy`. Which column the arithmetic calls which is the host's
 * business: a DOM that says `decoy` out loud is a hint sitting one inspector away from the person
 * this design defends against, and it costs nothing to not write it.</p>
 */
function readingRow(key: PaymentFieldKey, which: 'a' | 'b', label: string): string {
  const ordinal = which === 'a' ? 'First' : 'Second';
  return `<div class="line readingLine">
          <div class="reading" id="payReading_${key}_${which}" aria-label="${ordinal} row for ${label}"></div>
          <button data-field="${key}|${which}" data-action="copyReading" class="icon" title="Copy the ${ordinal.toLowerCase()} row" aria-label="Copy the ${ordinal.toLowerCase()} row">${COPY_ICON}</button>
        </div>`;
}

/** What the row says before anything is rebuilt — and what it must never say afterwards. */
function hint(key: PaymentFieldKey, wordCount: number): string {
  const shared =
    'Pick a method and press Show. Both rows come back the same way whichever method you pick — '
    + 'nothing here can tell you which one is yours, and that is deliberate.';
  return key === 'mixed'
    ? `${wordCount} words. ${shared} The assembled phrase closes itself shortly after it opens.`
    : shared;
}

/**
 * The card's own half of the page script.
 *
 * <p>Three things it does and nothing else: fill what the host sends, ask before a gated value or a
 * reassembly, and drop an assembled phrase when its time is up. Words are written into the page one
 * text node at a time through DOM APIs (measure 5.1) — never joined into a string, and never through
 * `innerHTML`, which would be both a string and an injection surface.</p>
 *
 * <p><b>Every answer is checked against the entity the card belongs to.</b> The preview tab is REUSED
 * for another entry, so an answer can arrive for an entry this card no longer shows; the stamp makes
 * that droppable rather than a card quietly showing another entry's number.</p>
 */
export function paymentCardScript(): string {
  return `
  var payCard = document.getElementById('payCard');
  if (payCard) {
${payHelpers()}
${payReadingFn()}
${payListeners()}
    vscode.postMessage({ type: 'payment', field: 'values' });
  }
`;
}

/** Filling a box, drawing a row, and closing one — the three things the card does to itself. */
function payHelpers(): string {
  return `    var payTimer = 0;
    var payMine = function (msg) { return msg && msg.entityId === payCard.dataset.entity; };
    var payFill = function (values) {
      for (var key in values) {
        var box = document.getElementById('pay_' + key);
        // A PROPERTY, not an attribute: nothing set here appears in a serialisation of the page.
        if (box) { box.value = values[key]; box.classList.remove('gated'); }
      }
    };
    // Words go in one text node each and are never joined (measure 5.1). Digits are not a phrase and
    // are joined, because a card number written as separated characters is unreadable.
    var payRow = function (target, tokens, asWords) {
      if (!target) { return; }
      target.textContent = '';
      if (!asWords) { target.textContent = tokens.join(''); return; }
      for (var i = 0; i < tokens.length; i++) {
        var node = document.createElement('span');
        node.className = 'word';
        node.textContent = tokens[i];
        target.appendChild(node);
      }
    };
    var payClose = function (key, silent) {
      var rows = document.getElementById('payRows_' + key);
      if (!rows) { return; }
      // The rows are hidden FIRST and emptied after (measure 5.5), so the freshest thing the
      // renderer holds is the closed card rather than the value that was on screen.
      rows.hidden = true;
      payRow(document.getElementById('payReading_' + key + '_a'), [], false);
      payRow(document.getElementById('payReading_' + key + '_b'), [], false);
      if (payTimer) { clearTimeout(payTimer); payTimer = 0; }
      if (!silent) { vscode.postMessage({ type: 'paymentClose', field: key }); }
    };
`;
}

/** Showing a reading — the one place a rebuilt value reaches the page. */
function payReadingFn(): string {
  return `    var payReading = function (msg) {
      var note = document.getElementById('payNote_' + msg.key);
      if (!msg.ok) { if (note) { note.textContent = msg.why; } return; }
      // Two clicks are two reads, and their answers can arrive in the other order. An answer for a
      // method the picker no longer shows is dropped rather than displayed under the wrong label.
      var picked = payCard.querySelector('select.mixPick[data-key="' + msg.key + '"]');
      if (picked && msg.code && picked.value !== msg.code) { return; }
      payRow(document.getElementById('payReading_' + msg.key + '_a'), msg.first, msg.words);
      payRow(document.getElementById('payReading_' + msg.key + '_b'), msg.second, msg.words);
      document.getElementById('payRows_' + msg.key).hidden = false;
      if (msg.visibleMs) {
        if (payTimer) { clearTimeout(payTimer); }
        payTimer = setTimeout(function () { payClose(msg.key, false); }, msg.visibleMs);
      }
    };
`;
}

/** The two listeners: what the host says back, and what a button here means. */
function payListeners(): string {
  return `    window.addEventListener('message', function (event) {
      var msg = event.data;
      if (!payMine(msg)) { return; }
      if (msg.type === 'paymentValues') { payFill(msg.values); }
      if (msg.type === 'paymentReading') { payReading(msg); }
      if (msg.type === 'paymentClosed') { payClose(msg.key, true); }
    });
    // CAPTURE, and it is not a detail: the page's generic button handler is bound to each button
    // itself, so an ancestor listener in the bubble phase would run AFTER it and the host would get
    // the same click twice - once without the method. Capturing here and stopping propagation means
    // exactly one message leaves for these two actions, and every other button is untouched.
    payCard.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('button[data-action]') : null;
      if (!button) { return; }
      var action = button.dataset.action;
      if (action !== 'reassemble' && action !== 'copyReading') { return; }
      var key = button.dataset.field.split('|')[0];
      var pick = payCard.querySelector('select.mixPick[data-key="' + key + '"]');
      // The method rides with the request, exactly as the snippet button carries its language: the
      // host re-derives what the page is showing rather than trusting the page to send a value.
      vscode.postMessage({ type: action, field: button.dataset.field + '|' + (pick ? pick.value : '') });
      event.stopPropagation();
    }, true);
`;
}

/** The card's styles: the two rows read as one pair, and a word is a word. */
export function paymentCardStyles(): string {
  return `
  .wovenRow .readingLine { margin-top: 4px; align-items: center; }
  .reading { flex: 1; padding: 5px 7px; min-height: 1.4em; border-radius: 3px;
             background: var(--vscode-input-background); color: var(--vscode-input-foreground);
             border: 1px solid var(--vscode-input-border, transparent);
             font-family: var(--vscode-editor-font-family, monospace); word-break: break-all; }
  .reading .word { display: inline-block; margin-right: .5em; }
  .payNote { margin: 3px 0; }
  input.gated { letter-spacing: .2em; }`;
}
