import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_INPUT_IDS, cardFieldsFrom, cardInputsFrom, withBrand } from '../cardFormFields';
import { PAYMENT_FIELD_KEYS } from '../paymentFields';

/**
 * Where the card form's input ids meet the record's field names.
 *
 * <p>The reason this is a table with a test rather than eight lines of assignment: the record is a
 * JSON blob, so a wrong key does not fail to compile and does not fail to save. It quietly stores
 * something nothing reads, and the form comes back empty next time — with the value still sitting in
 * the keychain under a name nobody looks for.</p>
 *
 * <p>This test was written after exactly that mistake: the first version of the mapper invented
 * `billingAddress` and `note`, neither of which is in `PaymentFields`. The compiler caught it because
 * the table is typed against `keyof PaymentFields` — which is the whole argument for the table.</p>
 */

test('every field the mapper writes is a real field of the record', () => {
  const written = Object.keys(cardFieldsFrom(Object.fromEntries(CARD_INPUT_IDS.map((id) => [id, 'x']))));

  for (const field of written) {
    assert.ok(
      (PAYMENT_FIELD_KEYS as readonly string[]).includes(field),
      `"${field}" is not a payment field — it would be stored where nothing reads it`,
    );
  }
});

test('a filled form becomes the record, under the record’s own names', () => {
  const fields = cardFieldsFrom({
    cardNumber: '4111 1111 1111 1111',
    cardExpiry: '12/29',
    cardHolder: 'A Person',
    cardCvv: '123',
    cardPin: '4321',
    cardAddressLine1: '1 Somewhere Road',
    cardPhone: '+31 6 1234 5678',
    cardCountry: 'NL',
  });

  assert.deepEqual(fields, {
    // Digits, though the box was typed with spaces: grouping is presentation and the record keeps
    // what can be woven. A stored space would be permuted in among the digits by shuffleTokens and
    // the original could never be rebuilt. See cardNumberFormat.ts.
    number: '4111111111111111',
    expiry: '12/29',
    holder: 'A Person',
    cvv: '123',
    pin: '4321',
    addressLine1: '1 Somewhere Road',
    // Derived from the cells, in the country's own order — the block a courier reads. Every seam
    // that already carried a billing address goes on seeing this one field.
    address: '1 Somewhere Road\nNL',
    phone: '+31 6 1234 5678',
    country: 'NL',
  });
});

test('empty boxes are dropped, so an untouched form stores nothing at all', () => {
  // S1.2's rule reaching the form: an empty record deletes, so a payment stripped bare holds no key.
  assert.deepEqual(cardFieldsFrom({}), {});
  assert.deepEqual(cardFieldsFrom({ cardNumber: '', cardCvv: '' }), {});
  assert.deepEqual(cardFieldsFrom({ cardNumber: '4111', cardCvv: '' }), { number: '4111' });
});

test('a payload can carry anything across postMessage, and only a string is a value', () => {
  // It crosses a `postMessage` boundary: a number, a null or an object can arrive where a string was
  // expected, and `String(null)` would store the word "null" in somebody's card.
  const fields = cardFieldsFrom({ cardNumber: 42, cardCvv: null, cardHolder: { toString: () => 'x' } });
  assert.deepEqual(fields, {});
});

test('the two directions agree — what the form writes, the form can be given back', () => {
  const typed = {
    cardNumber: '4111111111111111',
    cardExpiry: '12/29',
    cardHolder: 'A Person',
    cardCvv: '123',
    cardPin: '4321',
    cardAddressLine1: 'Somewhere',
    cardPhone: '+1 555',
    cardCountry: 'US',
  };

  const back = cardInputsFrom(cardFieldsFrom(typed));

  for (const [id, value] of Object.entries(typed)) {
    // The number is the ONE field whose displayed form differs from its stored form: it goes back
    // to the box in the groups the card is printed in, and `cardFieldsFrom` strips them again. So
    // the round trip is asserted where it is actually required to hold — on the RECORD.
    const expected = id === 'cardNumber' ? '4111 1111 1111 1111' : value;
    assert.equal(back[id], expected, `${id} did not survive the round trip`);
  }
  assert.deepEqual(
    cardFieldsFrom(back),
    cardFieldsFrom(typed),
    'form -> record -> form -> record is stable, which is what "the two directions agree" means',
  );
  // Every id is answered, card and bank alike, because one record holds both forms and the boxes
  // that are not on screen have to be blanked rather than left as they were — plus the payment
  // system, which is a CHOICE offered as a list rather than a typed box, and has to come back so a
  // card corrected once stays corrected.
  assert.equal(Object.keys(back).length, CARD_INPUT_IDS.length + 1);
  assert.equal(back.cardBrand, '', 'nothing was chosen and nothing was detectable from the record');
});

test('a stored card with only some fields fills only those boxes, and blanks the rest', () => {
  // Never `undefined` into a DOM value: the box would read "undefined" to the person looking at it.
  const boxes = cardInputsFrom({ number: '4111', cvv: '123' });

  assert.equal(boxes.cardNumber, '4111', 'four digits are one group, and never padded');
  assert.equal(boxes.cardCvv, '123');
  assert.equal(boxes.cardHolder, '', 'an absent field is an empty box');
  assert.equal(Object.keys(boxes).length, CARD_INPUT_IDS.length + 1, 'every box, plus the system');
});

test('the brand is derived on save, and an unknown number stores no brand at all', () => {
  assert.deepEqual(withBrand({ number: '4111' }, 'visa'), { number: '4111', brand: 'visa' });
  assert.deepEqual(withBrand({ number: '9999' }, ''), { number: '9999' }, 'no guess is recorded');
});
