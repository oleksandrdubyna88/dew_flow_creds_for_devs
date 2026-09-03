import { DEFAULT_PAYMENT_FORM, PAYMENT_FORMS, PAYMENT_FORM_LABELS } from './paymentForm';
import { methodLabel } from './shuffle';
import { CARD_BRANDS } from './cardBrand';
import { PAYMENT_BRAND_LABELS, brandMarksMarkup } from './cardBrandIcons';
import { methodOrder } from './phraseLayout';
import { Random } from './decoyDigits';
import { phraseMarkup } from './phraseFormMarkup';

/**
 * The payment kind's three fieldsets: the form selector, the card, and the bank details.
 *
 * <p>Its own module because `entityFormPage.ts` reached the repository's 800-line ceiling, and this
 * is the seam that leaves cleanly — one kind's markup, taking the same `openSection` the page uses so
 * the fieldsets are still opened through the catalog (which throws on an id nothing declares).</p>
 *
 * <p><b>No stored value appears here</b>, and that is the one rule this markup has. Every other kind
 * writes its stored value into the page (a db connection string, a config body); a CVV and a PIN are
 * delivered by message instead, because the HTML is a string that gets built, concatenated and — the
 * moment anything goes wrong — logged. The only thing below that comes from the entry is which FORM
 * is selected.</p>
 */
export function paymentMarkup(
  openSection: (id: string) => string,
  form: string | undefined,
  random: Random = Math.random,
): string {
  return [
    selectorMarkup(openSection, form),
    cardMarkup(openSection, random),
    bankMarkup(openSection),
    phraseMarkup(openSection),
  ].join('\n');
}

/** Which of the three forms this entry is — the only thing here that comes from the entry. */
function selectorMarkup(openSection: (id: string) => string, form: string | undefined): string {
  return `
  ${openSection('paymentSection')}
    <label for="paymentForm">Form</label>
    <select id="paymentForm">${paymentFormOptions(form)}</select>
    <p class="hint">A card, a set of bank details, or a phrase you must not lose. All three are stored the same way — one encrypted record under one key — and the form decides which fields you are asked for.</p>
    <p class="hint" id="paymentNotice"></p>
  </fieldset>
`;
}

/** The card fields. Shown only when the selector says `card` — see `formSections.ts`. */
function cardMarkup(openSection: (id: string) => string, random: Random): string {
  return `  ${openSection('cardSection')}
    <label for="cardNumber">Card number</label>
    <input id="cardNumber" type="text" inputmode="numeric" autocomplete="off" spellcheck="false"
           placeholder="4111 1111 1111 1111">
    <p class="hint" id="cardBrandHint"></p>

    <label for="cardBrand">Payment system</label>
    <div class="line"><select id="cardBrand">${brandOptions()}</select>${brandMarksMarkup()}</div>
    <p class="hint">Read from the number, and yours to correct. A number stored woven with a decoy has no first digits left to read it from — which is why this is a field you confirm rather than one the build works out again on every save.</p>

    <div class="row">
      <div>
        <label for="cardExpiry">Expires</label>
        <input id="cardExpiry" type="text" autocomplete="off" spellcheck="false" placeholder="12/29">
      </div>
      <div>
        <label for="cardHolder">Name on the card</label>
        <input id="cardHolder" type="text" autocomplete="off" spellcheck="false">
      </div>
    </div>

    <div class="row">
      <div>
        <label for="cardCvv">CVV</label>
        <input id="cardCvv" type="password" autocomplete="off" spellcheck="false">
      </div>
      <div>
        <label for="cardPin">PIN</label>
        <input id="cardPin" type="password" autocomplete="off" spellcheck="false">
      </div>
    </div>
    <p class="hint">The CVV and the PIN are hidden as you type and stay hidden when you come back. They are the two values that turn a number somebody saw into a payment somebody made — which is why a share never carries them, and why an export says so out loud before it writes them to a file.</p>

    ${mixMarkup(random)}

    <label for="cardAddress">Billing address</label>
    <textarea id="cardAddress" rows="2" spellcheck="false" autocomplete="off"></textarea>

    <div class="row">
      <div>
        <label for="cardPhone">Phone on file</label>
        <input id="cardPhone" type="text" autocomplete="off" spellcheck="false">
      </div>
      <div>
        <label for="cardCountry">Country</label>
        <input id="cardCountry" type="text" autocomplete="off" spellcheck="false">
      </div>
    </div>
    <p class="hint">The address, phone and country are what a payment form asks for beside the number — kept here so the whole answer is in one place rather than half of it.</p>
  </fieldset>
`;
}

/** The bank fields. Shown only when the selector says `bank`. */
function bankMarkup(openSection: (id: string) => string): string {
  return `  ${openSection('bankSection')}
    <div class="row">
      <div>
        <label for="bankBeneficiary">Beneficiary</label>
        <input id="bankBeneficiary" type="text" autocomplete="off" spellcheck="false">
      </div>
      <div>
        <label for="bankName">Bank</label>
        <input id="bankName" type="text" autocomplete="off" spellcheck="false">
      </div>
    </div>

    <div class="row">
      <div>
        <label for="bankIban">IBAN</label>
        <input id="bankIban" type="text" autocomplete="off" spellcheck="false">
      </div>
      <div>
        <label for="bankAccountNumber">Account number</label>
        <input id="bankAccountNumber" type="text" autocomplete="off" spellcheck="false">
      </div>
    </div>
    <p class="hint">Whichever your bank uses. Both are here because an international transfer asks for one and a domestic one asks for the other, and nobody remembers which at the moment they need it.</p>

    <div class="row">
      <div>
        <label for="bankSwift">SWIFT / BIC</label>
        <input id="bankSwift" type="text" autocomplete="off" spellcheck="false">
      </div>
      <div>
        <label for="bankIntermediary">Intermediary bank</label>
        <input id="bankIntermediary" type="text" autocomplete="off" spellcheck="false">
      </div>
    </div>

    <div class="check"><input id="mixBankIban" type="checkbox" class="mixMark" data-field="iban">
      <label for="mixBankIban">Store the IBAN woven with a decoy</label></div>
    <div class="check"><input id="mixBankAccount" type="checkbox" class="mixMark" data-field="accountNumber">
      <label for="mixBankAccount">Store the account number woven with a decoy</label></div>

    <label for="bankAddress">Bank address</label>
    <textarea id="bankAddress" rows="2" spellcheck="false" autocomplete="off"></textarea>
  </fieldset>
`;
}


/** The three forms a payment instrument can take, as options — labels from the model, never here. */
function paymentFormOptions(current: string | undefined): string {
  return PAYMENT_FORMS.map(
    (form) =>
      // `.label`, not the record: a template literal will happily stringify the object and put
      // "[object Object]" in the dropdown, which no type check catches and no test would have either
      // until somebody opened the form.
      `<option value="${form}" ${form === (current ?? DEFAULT_PAYMENT_FORM) ? 'selected' : ''}>${
        PAYMENT_FORM_LABELS[form].label
      }</option>`,
  ).join('');
}

/** "Detected automatically" first, because it is right for almost every card almost every time. */
function brandOptions(): string {
  return [
    '<option value="">Detected automatically</option>',
    ...CARD_BRANDS.map((brand) => `<option value="${brand}">${PAYMENT_BRAND_LABELS[brand]}</option>`),
  ].join('');
}

/**
 * The twelve weaving methods: a fresh ORDER every time the form is drawn, and a NAME that never
 * moves.
 *
 * <p>The order is drawn for the reason the card draws its own — so that "the third one" never
 * becomes a habit worth forming, because a position is something a later release can silently
 * change. The name is bound to the code (`methodLabel`) so that the shuffling costs nobody the one
 * thing they have to remember.</p>
 */
function methodOptions(random: Random): string {
  return methodOrder(random)
    .map((code) => `<option value="${code}">${methodLabel(code)}</option>`)
    .join('');
}

/**
 * The weaving controls: one checkbox per weavable card field, the method, and the honest sentence.
 *
 * <p>Its own function so `cardMarkup` stays under the 50-line ceiling — and because this block is
 * about a different decision from the fields above it. The paragraph is deliberately in the FORM
 * rather than only in the help: somebody about to make a value unrecoverable should read what they
 * are buying at the moment they choose it, not in a document they will not open.</p>
 */
function mixMarkup(random: Random): string {
  return `    <div class="check"><input id="mixCardNumber" type="checkbox" class="mixMark" data-field="number">
      <label for="mixCardNumber">Store the number woven with a decoy</label></div>
    <div class="check"><input id="mixCardCvv" type="checkbox" class="mixMark" data-field="cvv">
      <label for="mixCardCvv">Store the CVV woven with a decoy</label></div>
    <div class="check"><input id="mixCardPin" type="checkbox" class="mixMark" data-field="pin">
      <label for="mixCardPin">Store the PIN woven with a decoy</label></div>

    <div id="mixControls" style="display:none">
      <label for="mixMethod">Weaving method</label>
      <select id="mixMethod">${methodOptions(random)}</select>
      <p class="hint" id="mixWarning"></p>
      <p class="hint"><b>What this does and does not do.</b> A woven field is stored as your value and a decoy shuffled together, and the method is <b>never stored</b> — not here, not in a backup, not in the sync. Nobody can unweave it but you, from memory, so a forgotten method is a lost value.<br>
      It protects against somebody <b>reading</b> an open vault: a shoulder, a screen share, a backup file on a laptop. It does <b>not</b> protect against somebody who can try every possibility — a CVV is a thousand values, and weaving costs them nothing.</p>
      <button type="button" id="mixExpand">Give each field its own method…</button>
      <div id="mixPerField" style="display:none"></div>
      <p class="hint">What the method does, on two values made up for the picture. Your own value is never drawn here — showing it beside the decoy it is woven with, under the method that wove them, would put the answer on screen next to the question.</p>
      <div id="mixExample"></div>
    </div>
`;
}
