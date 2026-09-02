import { DEFAULT_PAYMENT_FORM, PAYMENT_FORMS, PAYMENT_FORM_LABELS } from './paymentForm';

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
export function paymentMarkup(openSection: (id: string) => string, form: string | undefined): string {
  return [selectorMarkup(openSection, form), cardMarkup(openSection), bankMarkup(openSection)].join('\n');
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
function cardMarkup(openSection: (id: string) => string): string {
  return `  ${openSection('cardSection')}
    <label for="cardNumber">Card number</label>
    <input id="cardNumber" type="text" inputmode="numeric" autocomplete="off" spellcheck="false"
           placeholder="4111 1111 1111 1111">
    <p class="hint" id="cardBrandHint"></p>

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
