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
  return `
  // A stored card arrives HERE rather than in the page's HTML. Every other kind's stored value is
  // rendered into the markup (a db connection string, a config body), and for a CVV and a PIN that
  // is one place too many: the HTML is a string that is built, concatenated, and — the moment
  // anything goes wrong — logged. The message goes straight to the fields, and is never a string
  // anybody else holds. (No backticks in this file: it IS a template literal.)
  window.addEventListener('message', function (event) {
    var card = event.data;
    if (!card || card.type !== 'paymentValues') { return; }
    var fields = card.fields || {};
    var ids = ['cardNumber', 'cardExpiry', 'cardHolder', 'cardCvv', 'cardPin', 'cardAddress', 'cardPhone', 'cardCountry'];
    for (var i = 0; i < ids.length; i++) {
      var box = document.getElementById(ids[i]);
      if (box) { box.value = fields[ids[i]] || ''; }
    }
    showBrand();
  });

  // The mark beside the number, updated as it is typed: brandOf answers as soon as the prefix
  // decides, which is what makes this worth doing on every keystroke rather than on blur.
  function showBrand() {
    var number = document.getElementById('cardNumber');
    var hint = document.getElementById('cardBrandHint');
    if (!number || !hint) { return; }
    vscode.postMessage({ type: 'cardTyped', number: number.value });
  }
  var cardNumberBox = document.getElementById('cardNumber');
  if (cardNumberBox) {
    cardNumberBox.addEventListener('input', showBrand);
    // Asked for now that the listener above exists — the host answers, and nothing was posted at a
    // page that was not yet listening.
    vscode.postMessage({ type: 'cardValues' });
  }

  window.addEventListener('message', function (event) {
    var brand = event.data;
    if (!brand || brand.type !== 'cardBrand') { return; }
    var hint = document.getElementById('cardBrandHint');
    if (hint) { hint.textContent = brand.text; }
  });
`;
}
