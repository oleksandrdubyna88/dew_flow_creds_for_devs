import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAYMENT_FORMS, PaymentForm } from '../paymentForm';
import { PaymentFields, clearForForm, keysForForm } from '../paymentFields';
import { keysClearedBy, switchWarning } from '../paymentFormSwitch';

/**
 * Retyping a card as bank details must not leave the card inside the record.
 *
 * <p>Three forms in one JSON record is deliberate (parent plan §2.1) — and that is exactly why this
 * story exists. A card re-typed as bank details leaves `number`, `cvv` and `pin` in the record:
 * invisible in the form, and very much present in a sync, a backup and an export. The person believes
 * they replaced the contents; the vault disagrees.</p>
 *
 * <p>S1.2 shipped `clearForForm` with <b>no caller</b>. This is the caller, and the reason the plan
 * recorded it as an inherited obligation rather than a nicety.</p>
 */

const CARD: PaymentFields = {
  number: '4111111111111111',
  expiry: '12/29',
  holder: 'A Person',
  cvv: '123',
  pin: '4321',
  address: 'Somewhere',
};

const BANK: PaymentFields = {
  beneficiary: 'A Person',
  bank: 'Some Bank',
  iban: 'NL91ABNA0417164300',
  swift: 'ABNANL2A',
};

test('every ordered pair of forms has an answer, so no switch is the one nobody thought about', () => {
  // The combinatorial check the plan asked for by name. `bank → phrase` is the one a hand-written
  // list forgets, because nobody pictures it.
  for (const from of PAYMENT_FORMS) {
    for (const to of PAYMENT_FORMS) {
      const cleared = keysClearedBy(from, to);
      assert.ok(Array.isArray(cleared), `${from} → ${to} has no answer`);
      if (from === to) {
        assert.deepEqual(cleared, [], `${from} → ${from} clears nothing`);
      }
    }
  }
});

test('switching a card to bank details clears the card’s own fields, and nothing else', () => {
  const cleared = keysClearedBy('card', 'bank');

  assert.ok(cleared.includes('number'), 'the number goes');
  assert.ok(cleared.includes('cvv'), 'the CVV goes');
  assert.ok(cleared.includes('pin'), 'the PIN goes');
  assert.ok(!cleared.includes('iban'), 'a field the NEW form uses is never cleared');
});

test('what is cleared is exactly what the new form has no room for', () => {
  // Derived from the two field lists rather than written out, so a field added to a form is handled
  // here the day it is added — the drift this whole feature keeps having to defend against.
  for (const from of PAYMENT_FORMS) {
    for (const to of PAYMENT_FORMS) {
      assertClearedIsTheDifference(from, to);
    }
  }
});

/** One pair, both directions of the claim: nothing extra cleared, nothing owed left behind. */
function assertClearedIsTheDifference(from: PaymentForm, to: PaymentForm): void {
  const keptByTarget = new Set<string>(keysForForm(to));
  const cleared = keysClearedBy(from, to);

  for (const key of cleared) {
    assert.ok(!keptByTarget.has(key), `${from} → ${to} would clear ${key}, which ${to} still uses`);
  }
  const owed = keysForForm(from).filter((key) => !keptByTarget.has(key));
  assert.deepEqual([...cleared].sort(), [...owed].sort(), `${from} → ${to} does not clear exactly the difference`);
}

test('the record after a switch holds not one field of the form it left', () => {
  const afterSwitch = clearForForm(CARD, 'bank');

  for (const key of ['number', 'expiry', 'holder', 'cvv', 'pin']) {
    assert.equal(
      (afterSwitch as Record<string, unknown>)[key],
      undefined,
      `${key} survived into a bank record — it would sync, back up and export`,
    );
  }
});

test('a field BOTH forms use survives the switch', () => {
  // `address` is a card's billing address and part of a bank's details. Clearing it would be data
  // loss dressed up as tidiness, and the derivation above is what prevents it.
  const kept = clearForForm({ ...CARD, address: 'Keep me' }, 'bank');
  const bankKeeps = new Set<string>(keysForForm('bank'));

  if (bankKeeps.has('address')) {
    assert.equal(kept.address, 'Keep me');
  }
});

test('the warning names FIELDS, never values', () => {
  // The one rule this dialog has. A confirmation that quotes the number back at the person puts it on
  // screen, in a modal, in a screenshot — to tell them it is about to be deleted.
  const text = switchWarning('card', 'bank', CARD);

  assert.ok(!text.includes('4111'), 'the number reached the dialog');
  assert.ok(!text.includes('123'), 'the CVV reached the dialog');
  assert.ok(!text.includes('4321'), 'the PIN reached the dialog');
  assert.match(text, /card number/i, 'and the person is told WHAT goes');
});

test('a switch that would erase nothing asks nothing', () => {
  // An empty card record retyped as bank details has nothing to lose, and a modal that fires anyway
  // is the modal people learn to dismiss without reading.
  assert.equal(switchWarning('card', 'bank', {}), '');
  assert.equal(switchWarning('card', 'card', CARD), '', 'and the same form is not a switch at all');
});

test('only fields that are actually STORED are named', () => {
  // Listing the whole form's vocabulary would tell somebody they are about to lose a PIN they never
  // set — which teaches them the warning is noise.
  const text = switchWarning('card', 'bank', { number: '4111111111111111' } as PaymentFields);

  assert.match(text, /card number/i);
  assert.ok(!/CVV/i.test(text), 'a field that was never filled in is not a loss');
});

test('bank details retyped as a phrase lose the bank fields', () => {
  const cleared = keysClearedBy('bank', 'phrase');
  for (const key of ['iban', 'swift', 'beneficiary'] as const) {
    assert.ok(cleared.includes(key), `${key} must not survive into a phrase`);
  }
  assert.deepEqual(clearForForm(BANK, 'phrase'), {}, 'and the record is emptied of them');
});

test('a form is never asked to clear a field it does not know', () => {
  const known = new Set<string>(PAYMENT_FORMS.flatMap((form: PaymentForm) => [...keysForForm(form)]));
  for (const from of PAYMENT_FORMS) {
    for (const to of PAYMENT_FORMS) {
      for (const key of keysClearedBy(from, to)) {
        assert.ok(known.has(key), `${key} belongs to no form at all`);
      }
    }
  }
});
