import { PAYMENT_FIELD_LABELS, PaymentFieldKey } from './paymentFields';
import { COPY_ICON, escapeHtml } from './webviewHtml';
import { PaymentCardView } from './paymentViewMessages';
import { needsReveal } from './revealGate';
import { REASSEMBLE_ACTION, WOVEN_ROW_NOTE, WOVEN_ROW_STYLES, wovenRowMarkup } from './wovenRow';
import { BRAND_MARK_STYLES, brandMarksMarkup } from './cardBrandIcons';

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

/**
 * What a masked box shows instead of a value.
 *
 * <p>Shared by the markup that writes it and the script that puts it back, so the two cannot
 * disagree about what "masked" looks like — it used to be a literal in the markup only.</p>
 */
export const MASK = '••••••••';

/** What a Show button asks for — one name, so the panel's switch has one shape to match. */
export const REVEAL_ACTION = 'reveal';

/**
 * Putting a revealed value back. Answered by the PAGE and never sent to the host.
 *
 * <p>There is nothing host-side to release for a plain gated field — `held` carries woven readings
 * only — so a message would be a round trip that changes nothing and one more thing to get wrong.</p>
 */
export const HIDE_ACTION = 'hide';

export { REASSEMBLE_ACTION };

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
  return `<div id="payCard" data-woven-host="" data-entity="${escapeHtml(view.entityId)}">
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
    ? `<button data-field="${key}" data-action="${REVEAL_ACTION}" data-label="${label}" class="icon" aria-pressed="false" title="Show the ${label} — this asks first" aria-label="Show ${label}">Show</button>`
    : '';
  return `<div class="row">
      <label>${label}</label>
      <div class="line">${valueBox(key, gated)}
        ${brandMark(key)}${show}<button data-field="pay_${key}" data-action="copy" class="icon" title="Copy ${label}${key === 'number' ? ' as digits, with no spaces' : ''}" aria-label="Copy ${label}">${COPY_ICON}</button>${spacedCopy(key, label)}
      </div>
    </div>`;
}

/**
 * The card number's second clipboard button: the same value, in the groups it is printed in.
 *
 * <p>Only the number has two right answers — a payment form usually refuses spaces, and a person
 * reading a number aloud wants them. Two identical icons side by side would be a coin toss, so this
 * one is marked and both say in their titles which is which.</p>
 */
/**
 * The box a value is shown in: one line, or several for the assembled address.
 *
 * <p>Empty in both cases — every value arrives by message and is set as a DOM property, which is the
 * rule this whole card is built around.</p>
 */
function valueBox(key: PaymentFieldKey, gated: boolean): string {
  return key === 'address'
    ? `<textarea readonly rows="4" id="pay_${key}" class="addressBlock"></textarea>`
    : `<input readonly id="pay_${key}"${gated ? ` value="${MASK}" class="gated"` : ''}>`;
}

/** The nine marks, hidden, beside the system row. The page reveals the one the value names. */
function brandMark(key: PaymentFieldKey): string {
  return key === 'brand' ? brandMarksMarkup() : '';
}

function spacedCopy(key: PaymentFieldKey, label: string): string {
  return key !== 'number'
    ? ''
    : `<button data-field="pay_number|spaced" data-action="copy" class="icon spaced" title="Copy ${label} in groups of four" aria-label="Copy ${label} with spaces">${COPY_ICON}<span aria-hidden="true">␣</span></button>`;
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
  return wovenRowMarkup({
    key,
    label: PAYMENT_FIELD_LABELS[key],
    methods: view.methods,
    note: hint(key, view.wordCount),
  });
}

/**
 * What the row says before anything is rebuilt — and what it must never say afterwards.
 *
 * <p>A phrase gets one more sentence than a card field, because a phrase is the one reading that
 * takes itself off the screen again.</p>
 */
function hint(key: PaymentFieldKey, wordCount: number): string {
  return key === 'mixed'
    ? `${wordCount} words. ${WOVEN_ROW_NOTE} The assembled phrase closes itself shortly after it opens.`
    : WOVEN_ROW_NOTE;
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
  // Found by ATTRIBUTE, not by the payment card's id: a credential's woven password lives in its
  // own block and reads through this same script. Exactly one host exists per entry — a payment has
  // no password and a credential has no card — so there is nothing to disambiguate.
  var payCard = document.querySelector('[data-woven-host]');
  if (payCard) {
${payHelpers()}
${payGateFns()}
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
    // Reveal the mark the value names, and hide the other eight. Nothing is built here: all nine
    // were drawn into the page as constants of this build, so a glyph appears for a stored value
    // without that value ever having been interpolated into this page's HTML.
    var payMark = function (brand) {
      var marks = payCard.querySelectorAll('.brandMark');
      for (var i = 0; i < marks.length; i++) {
        marks[i].hidden = marks[i].dataset.brand !== brand;
      }
    };
    var payFill = function (values) {
      if (values.brand !== undefined) { payMark(values.brand); }
      for (var key in values) {
        var box = document.getElementById('pay_' + key);
        // A PROPERTY, not an attribute: nothing set here appears in a serialisation of the page.
        // The button flips HERE, on arrival, and never on the click: a declined confirmation posts
        // nothing at all, and a button reading Hide over a masked box would state the opposite of
        // what is on screen.
        if (box) { box.value = values[key]; box.classList.remove('gated'); payToggle(key, true); }
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

/**
 * The gated row's two states, and the move between them.
 *
 * <p>Its own block rather than more of `payHelpers`, which is about filling a box, drawing a row
 * and closing one. This is about a single question — is this value on screen — and it is the only
 * part of the card that writes a button rather than a value.</p>
 */
function payGateFns(): string {
  return `    // The reveal button of a gated row, or nothing at all for a row that has none.
    var payGate = function (key) {
      return payCard.querySelector('button[data-label][data-field="' + key + '"]');
    };
    // Show <-> Hide. The label comes off the button's own dataset, so nothing new is interpolated
    // into this page and the two states cannot drift apart in wording.
    var payToggle = function (key, shown) {
      var button = payGate(key);
      if (!button) { return; }
      var name = button.dataset.label;
      button.dataset.action = shown ? '${HIDE_ACTION}' : '${REVEAL_ACTION}';
      button.textContent = shown ? 'Hide' : 'Show';
      button.title = shown ? 'Hide the ' + name : 'Show the ' + name + ' — this asks first';
      button.setAttribute('aria-label', (shown ? 'Hide ' : 'Show ') + name);
      button.setAttribute('aria-pressed', shown ? 'true' : 'false');
    };
    var payHide = function (key) {
      var box = document.getElementById('pay_' + key);
      if (!box) { return; }
      box.value = '${MASK}';
      box.classList.add('gated');
      payToggle(key, false);
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
      // Hiding never leaves the page. Stopped here so the page's generic button handler does not
      // also post it to a host that has no answer for it.
      if (action === '${HIDE_ACTION}') { payHide(button.dataset.field); event.stopPropagation(); return; }
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
${WOVEN_ROW_STYLES}
  input.gated { letter-spacing: .2em; }
  /* The assembled address: as many lines as the country's own order gives it. */
  textarea.addressBlock { flex: 1; resize: vertical; font-family: inherit; }
  /* The spaced copy carries a visible mark, because two identical icons are a coin toss. */
  button.spaced span { font-size: .8em; margin-left: 1px; opacity: .8; }${BRAND_MARK_STYLES}`;
}
