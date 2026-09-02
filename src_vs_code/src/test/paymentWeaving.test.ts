import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHUFFLE_CODES, unshuffleTokens } from '../shuffle';
import { PaymentFields } from '../paymentFields';
import { luhn } from '../cardBrand';
import { ibanConverges } from '../decoyDigits';
import { decoyKindFor, weavePaymentFields } from '../paymentWeaving';

/**
 * Weaving, where the marks become woven values — and the code is stored NOWHERE.
 *
 * <p>That last part is the invariant of the whole feature, and it is what makes every other rule
 * here matter: nothing can unweave a field except the person, from memory. So the value that goes in
 * has to be right the first time (S3.2 checks it), the decoy has to be indistinguishable (S3.1 makes
 * it), and the entry must never be opened in the edit form again (S3.4 refuses it).</p>
 */

const RANDOM = (): number => 0.42;

/** A source that walks a fixed cycle, so a decoy differs from the original without being random. */
function cycling(): () => number {
  let at = 0;
  return () => ((at++ % 9) + 1) / 10;
}

const CARD: PaymentFields = {
  number: '4111111111111111',
  cvv: '123',
  pin: '4321',
  holder: 'A Person',
};

test('a field that is NOT marked is stored exactly as typed', () => {
  const woven = weavePaymentFields(CARD, ['cvv'], { cvv: 'f1' }, cycling());

  assert.equal(woven.number, '4111111111111111', 'the number was not marked');
  assert.equal(woven.pin, '4321');
  assert.equal(woven.holder, 'A Person', 'and a field that cannot be woven at all is untouched');
});

test('a marked field is stored woven, at twice its length', () => {
  const woven = weavePaymentFields(CARD, ['cvv'], { cvv: 'f1' }, cycling());

  assert.notEqual(woven.cvv, '123', 'the stored value is not the typed one');
  assert.equal(woven.cvv?.length, 6, 'three digits woven with three digits');
  assert.match(woven.cvv ?? '', /^\d{6}$/);
});

test('the woven value unweaves back to the original — with the code, and only with it', () => {
  const woven = weavePaymentFields(CARD, ['cvv'], { cvv: 'f3' }, cycling());
  const halves = unshuffleTokens([...(woven.cvv ?? '')], 'f3');

  assert.equal(halves.first.join(''), '123', 'the right code gives the value back');
  assert.notEqual(unshuffleTokens([...(woven.cvv ?? '')], 'f1').first.join(''), '123', 'the wrong one does not');
});

test('the marks are recorded, so the viewer knows which fields need a code', () => {
  const woven = weavePaymentFields(CARD, ['cvv', 'pin'], { cvv: 'f1', pin: 'f2' }, cycling());
  assert.deepEqual([...(woven.shuffledFields ?? [])].sort(), ['cvv', 'pin']);
});

test('the CODE is stored nowhere — the invariant the whole feature rests on', () => {
  // Not a nicety: a stored code turns a woven field into an obfuscated one, and the person would be
  // relying on protection that anybody reading the vault can undo.
  const woven = weavePaymentFields(CARD, ['cvv', 'pin'], { cvv: 'f7', pin: 'f12' }, cycling());
  const serialised = JSON.stringify(woven);

  for (const code of SHUFFLE_CODES) {
    assert.ok(
      !new RegExp(`"${code}"`).test(serialised),
      `the method ${code} was written into the record — it must live only in the person's memory`,
    );
  }
});

test('a woven card number still passes Luhn, and so does its decoy half', () => {
  // Both halves have to be plausible cards, or the woven value sorts itself for a reader.
  const woven = weavePaymentFields(CARD, ['number'], { number: 'f1' }, cycling());
  const halves = unshuffleTokens([...(woven.number ?? '')], 'f1');

  assert.equal(halves.first.join(''), '4111111111111111', 'the real one comes back');
  assert.equal(luhn(halves.second.join('')), true, 'and the decoy is a plausible card too');
});

test('a woven IBAN keeps a converging decoy of the same country', () => {
  const woven = weavePaymentFields({ iban: 'NL91ABNA0417164300' }, ['iban'], { iban: 'f2' }, cycling());
  const halves = unshuffleTokens([...(woven.iban ?? '')], 'f2');

  assert.equal(halves.first.join(''), 'NL91ABNA0417164300');
  assert.equal(ibanConverges(halves.second.join('')), true, 'the decoy converges');
  assert.equal(halves.second.join('').slice(0, 2), 'NL', 'and shares the country');
});

test('ONE method applied to every marked field is the default, and each field may still differ', () => {
  const together = weavePaymentFields(CARD, ['cvv', 'pin'], { cvv: 'f1', pin: 'f1' }, cycling());
  const apart = weavePaymentFields(CARD, ['cvv', 'pin'], { cvv: 'f1', pin: 'f5' }, cycling());

  assert.equal(unshuffleTokens([...(together.pin ?? '')], 'f1').first.join(''), '4321');
  assert.equal(unshuffleTokens([...(apart.pin ?? '')], 'f5').first.join(''), '4321', 'its own method works');
  assert.notEqual(apart.pin, together.pin, 'and produces a different stored value');
});

test('a marked field with nothing in it is not recorded as woven', () => {
  // Otherwise the entry would claim a woven field, refuse to be edited (S3.4), and hold nothing.
  //
  // Written first as "…is left alone AND absent", which failed — and the failure was right: this
  // function echoes the record it is given, and dropping empty fields is `pickPaymentFields`' job,
  // which the caller has already done. What this can promise is the half that is its own: no MARK.
  const woven = weavePaymentFields({ cvv: '' }, ['cvv'], { cvv: 'f1' }, cycling());

  assert.deepEqual(woven.shuffledFields, undefined, 'no mark for a field that was never filled in');
});

test('a field too short to weave is left plain rather than half-woven', () => {
  // `shuffleTokens` needs at least two tokens a side. A one-digit value cannot be woven, and storing
  // it as if it were would be a claim the viewer could not honour.
  const woven = weavePaymentFields({ pin: '7' }, ['pin'], { pin: 'f1' }, cycling());

  assert.equal(woven.pin, '7', 'stored as typed');
  assert.deepEqual(woven.shuffledFields, undefined);
});

test('every shuffleable field maps to a decoy kind that suits it', () => {
  // The mapping is what makes a decoy plausible per field; a wrong entry here is the silent failure
  // S3.1 exists to prevent, one level up.
  assert.equal(decoyKindFor('number'), 'card');
  assert.equal(decoyKindFor('iban'), 'iban');
  assert.equal(decoyKindFor('accountNumber'), 'account');
  assert.equal(decoyKindFor('cvv'), 'digits');
  assert.equal(decoyKindFor('pin'), 'digits');
});

test('weaving nothing changes nothing', () => {
  assert.deepEqual(weavePaymentFields(CARD, [], {}, RANDOM), CARD);
});

test('an already-woven record is not woven a second time', () => {
  // The destruction S3.4 refuses at the form; asserted here too, because the form is not the only
  // caller a record can reach and this is where the damage would actually be done.
  const once = weavePaymentFields(CARD, ['cvv'], { cvv: 'f1' }, cycling());
  const twice = weavePaymentFields(once, ['cvv'], { cvv: 'f1' }, cycling());

  assert.equal(twice.cvv, once.cvv, 'the second pass left it alone');
});
