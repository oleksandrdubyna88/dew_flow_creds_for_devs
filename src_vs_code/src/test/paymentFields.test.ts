import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PAYMENT_FIELD_KEYS,
  PAYMENT_FIELD_LABELS,
  PaymentFields,
  SHUFFLEABLE_KEYS,
  clearForForm,
  keysForForm,
  parsePaymentFields,
  pickPaymentFields,
  serializePaymentFields,
} from '../paymentFields';
import { PAYMENT_FORMS } from '../paymentForm';

/**
 * S1.2 — the payment values as ONE JSON record under one keychain key.
 *
 * <p>Modelled on `entityFields.ts`, whose header states the reason: the record travels as one
 * JSON string under one key, so a field added later is a key in this object rather than another
 * pass through every seam a secret kind touches. `entityFields.test.ts` is the shape to match.</p>
 *
 * <p>The two rules worth naming, because both are easy to get backwards and neither is obvious
 * from a signature: a string that does not parse is NO fields rather than a throw, and an empty
 * record serializes to `undefined` — meaning DELETE the key, not store `{}`.</p>
 */

test('unparseable, empty and absent input are all no fields, and none of them throws', () => {
  assert.deepEqual(parsePaymentFields(undefined), {});
  assert.deepEqual(parsePaymentFields(''), {});
  assert.deepEqual(parsePaymentFields('{not json'), {});
  assert.deepEqual(parsePaymentFields('null'), {});
  assert.deepEqual(parsePaymentFields('"a string"'), {});
  assert.deepEqual(parsePaymentFields('42'), {});
});

test('a round trip preserves every key the record can hold', () => {
  const full: PaymentFields = {
    number: '4111111111111111',
    expiry: '12/29',
    holder: 'A Person',
    cvv: '123',
    pin: '4321',
    address: '1 Somewhere',
    phone: '+100000000',
    country: 'PL',
    brand: 'visa',
    beneficiary: 'A Person',
    bank: 'A Bank',
    iban: 'PL61109010140000071219812874',
    accountNumber: '123456789',
    swift: 'AAAAPLPX',
    intermediary: 'Another Bank',
    bankAddress: '2 Elsewhere',
    wordlistFirst: 'bip39-en',
    wordlistSecond: 'bip39-en',
    layout: 'vertical',
    ownWords: true,
    mixed: ['alpha', 'mike', 'bravo', 'november'],
    shuffledFields: ['cvv', 'pin'],
  };
  assert.deepEqual(parsePaymentFields(serializePaymentFields(full)), full);
});

test('every key is labelled, and every label belongs to a key', () => {
  for (const key of PAYMENT_FIELD_KEYS) {
    assert.ok(PAYMENT_FIELD_LABELS[key], `${key} has no label, so a form cannot draw it`);
  }
  assert.equal(Object.keys(PAYMENT_FIELD_LABELS).length, PAYMENT_FIELD_KEYS.length);
});

test('unknown keys are dropped rather than carried', () => {
  const picked = pickPaymentFields({ number: '4111', notAKey: 'x', __proto__: 'y' });
  assert.deepEqual(picked, { number: '4111' });
});

test('blank and whitespace-only values are dropped, and kept values are trimmed', () => {
  assert.deepEqual(pickPaymentFields({ number: '   ', cvv: '  123  ' }), { cvv: '123' });
});

test('an all-empty record serializes to undefined, because that DELETES the keychain key', () => {
  assert.equal(serializePaymentFields({}), undefined);
  assert.equal(serializePaymentFields(undefined), undefined);
  assert.equal(serializePaymentFields({ number: '  ' }), undefined, 'nothing survives the clean, so nothing is stored');
});

test('a wrong-typed value is dropped, never coerced', () => {
  // A record can arrive from an import, a sync or a share written by another build. Coercing
  // `123` into `"123"` would invent a card number; dropping it loses a field that was already
  // unusable.
  const picked = pickPaymentFields({ number: 4111, cvv: null, pin: {}, ownWords: 'yes', mixed: 'alpha bravo' });
  assert.deepEqual(picked, {});
});

test('the token lists survive as arrays of non-empty strings, and are cleaned member by member', () => {
  const picked = pickPaymentFields({ mixed: ['alpha', '', '  bravo  ', 7], shuffledFields: ['cvv', null] });
  assert.deepEqual(picked, { mixed: ['alpha', 'bravo'], shuffledFields: ['cvv'] });
});

test('an empty token list is dropped like an empty string', () => {
  assert.deepEqual(pickPaymentFields({ mixed: [], shuffledFields: [] }), {});
});

test('shuffledFields keeps only names of fields that can ACTUALLY be woven', () => {
  // It drives the viewer: a name in here means "draw a method picker for this field". A name that
  // is not a weavable field would draw a picker over nothing.
  const picked = pickPaymentFields({ shuffledFields: ['cvv', 'notAField', 'iban'] });
  assert.deepEqual(picked, { shuffledFields: ['cvv', 'iban'] });
});

test('shuffledFields cannot name itself, nor a field with no decoy generator', () => {
  // The review's Minor finding: filtering against all 22 keys admitted `shuffledFields` itself — a
  // method picker drawn over the metadata property — and every label-ish key besides. §3a names a
  // CLOSED list of five, because each of those five has a decoy generator written for its structure
  // and nothing else does.
  assert.deepEqual(pickPaymentFields({ shuffledFields: ['shuffledFields'] }), {});
  assert.deepEqual(pickPaymentFields({ shuffledFields: ['holder', 'bank', 'layout', 'mixed'] }), {});
  assert.deepEqual(
    pickPaymentFields({ shuffledFields: [...SHUFFLEABLE_KEYS] }).shuffledFields,
    [...SHUFFLEABLE_KEYS],
    'and all five real ones survive, or the feature is unreachable',
  );
});

test('a record left holding only shuffledFields serializes to undefined instead of orphaning a key', () => {
  // The review's finding, walked as a real sequence: clear every field of a card whose CVV was
  // woven, and the record is `{ shuffledFields: ['cvv'] }` — not an empty object, so it used to
  // serialize and leave a keychain entry behind holding nothing but the name of a field that no
  // longer exists. Nobody would ever look for it again.
  assert.equal(serializePaymentFields({ shuffledFields: ['cvv'] }), undefined);
  assert.notEqual(
    serializePaymentFields({ cvv: '123', shuffledFields: ['cvv'] }),
    undefined,
    'but a record with a real value still stores, mark included',
  );
});

test('switching form drops the old form’s fields AND the mixed-field names that went with them', () => {
  // A card with a woven number and CVV, re-typed as bank details. Both names must go with the
  // fields; keeping them would draw pickers over two fields the bank form does not have.
  const card: PaymentFields = { number: '4111111111111111', cvv: '123', shuffledFields: ['number', 'cvv'] };
  const asBank = clearForForm(card, 'bank');
  assert.deepEqual(asBank, {}, 'no card key and no card name survives');

  // And the other direction: a woven IBAN is a bank field, so switching bank -> bank keeps it.
  const bank: PaymentFields = { iban: 'PL61109010140000071219812874', shuffledFields: ['iban'] };
  assert.deepEqual(clearForForm(bank, 'bank'), bank, 'a field the target form owns is untouched');
  assert.deepEqual(clearForForm(bank, 'card'), {}, 'and gone when the target form does not own it');
});

test('switching form keeps the mixed-field names that survive the switch', () => {
  // Partial survival is the case a whole-or-nothing implementation gets wrong: only the names whose
  // fields still exist may stay.
  const mixedBag: PaymentFields = {
    iban: 'PL61109010140000071219812874',
    accountNumber: '123456789',
    shuffledFields: ['iban', 'accountNumber', 'cvv'],
  };
  const asBank = clearForForm(mixedBag, 'bank');
  assert.deepEqual(asBank.shuffledFields, ['iban', 'accountNumber'], 'cvv is a card field and does not survive');
  assert.equal(asBank.iban, 'PL61109010140000071219812874');
});

test('ownWords survives as a boolean and only as a boolean', () => {
  assert.deepEqual(pickPaymentFields({ ownWords: true }), { ownWords: true });
  assert.deepEqual(pickPaymentFields({ ownWords: false }), { ownWords: false }, 'false is a value, not an absence');
});

test('each form claims its own keys, and the three claims together cover every key but the shared ones', () => {
  // The switch in S2.4 erases the previous form's fields, and it reads this. A key claimed by no
  // form would survive every switch invisibly; a key claimed by two would be erased by the wrong
  // one.
  const claimed = PAYMENT_FORMS.flatMap((form) => [...keysForForm(form)]);
  assert.equal(new Set(claimed).size, claimed.length, 'no key may be claimed by two forms');
  for (const key of PAYMENT_FIELD_KEYS) {
    const owners = PAYMENT_FORMS.filter((form) => keysForForm(form).includes(key));
    assert.ok(owners.length <= 1, `${key} is claimed by ${owners.join(' and ')}`);
  }
});

test('shuffledFields belongs to no form, because it describes the record', () => {
  for (const form of PAYMENT_FORMS) {
    assert.equal(
      keysForForm(form).includes('shuffledFields'),
      false,
      'switching form must never silently drop the record’s own mixed-field list',
    );
  }
});
