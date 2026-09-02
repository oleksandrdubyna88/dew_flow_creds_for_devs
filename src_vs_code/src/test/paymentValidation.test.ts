import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PaymentFields } from '../paymentFields';
import { validatePayment } from '../paymentValidation';

/**
 * Checked before saving, because saving destroys the original.
 *
 * <p>A real hole, not a formality. A field marked <b>mix</b> is stored woven with a decoy under a code
 * that is kept nowhere — so after the save there IS no original to compare against. A typo in a mixed
 * field can never be noticed: not in the viewer, not in a backup, not next year. That is what makes the
 * split below the whole story:</p>
 *
 * <ul>
 *   <li><b>plain</b> field with a failing checksum → a <b>hint</b>. Said, and saved. People hold cards
 *       and accounts this build has never heard of.</li>
 *   <li><b>mixed</b> field with a failing checksum → a <b>confirm</b>. The last moment anybody can
 *       catch it.</li>
 * </ul>
 *
 * <p>Nothing here refuses a save. `validatePayment` returns warnings; the form decides.</p>
 */

const CARD_OK = '4111111111111111';
const CARD_TYPO = '4111111111111112';
const IBAN_OK = 'NL91ABNA0417164300';
const IBAN_TYPO = 'NL92ABNA0417164300';

function warningsFor(fields: PaymentFields, mixed: readonly string[] = []) {
  return validatePayment(fields, mixed);
}

test('a good card says nothing at all', () => {
  assert.deepEqual(warningsFor({ number: CARD_OK }), []);
});

test('a mistyped card is a HINT when it is stored plainly', () => {
  const [warning, ...rest] = warningsFor({ number: CARD_TYPO });

  assert.deepEqual(rest, [], 'one warning, not a lecture');
  assert.equal(warning.field, 'number');
  assert.equal(warning.severity, 'hint');
  assert.match(warning.text, /check/i);
});

test('the SAME card is a CONFIRM when it is marked to be mixed', () => {
  // Remove this distinction and the test above still passes — which is why it is asserted as a pair.
  const [warning] = warningsFor({ number: CARD_TYPO }, ['number']);

  assert.equal(warning.severity, 'confirm');
  assert.match(warning.text, /woven|mixed|no way back|cannot be checked/i, 'and it says WHY it is different');
});

test('a mistyped IBAN follows the same split', () => {
  assert.equal(warningsFor({ iban: IBAN_TYPO })[0].severity, 'hint');
  assert.equal(warningsFor({ iban: IBAN_TYPO }, ['iban'])[0].severity, 'confirm');
  assert.deepEqual(warningsFor({ iban: IBAN_OK }), [], 'a good IBAN is silent either way');
  assert.deepEqual(warningsFor({ iban: IBAN_OK }, ['iban']), []);
});

test('an internal account number is never checked, and that is not an omission', () => {
  // §3a: there is nothing to check. Inventing a rule for it would reject real account numbers, and a
  // vault that refuses a real value is a vault somebody keeps a photo of instead.
  assert.deepEqual(warningsFor({ accountNumber: 'ACC-0099-XZ' }), []);
  assert.deepEqual(warningsFor({ accountNumber: 'ACC-0099-XZ' }, ['accountNumber']), []);
  assert.deepEqual(warningsFor({ accountNumber: '!!!' }, ['accountNumber']), []);
});

test('a CVV and a PIN are never checked either — all digits are equal', () => {
  assert.deepEqual(warningsFor({ cvv: '123', pin: '4321' }), []);
  assert.deepEqual(warningsFor({ cvv: '000', pin: '0000' }, ['cvv', 'pin']), []);
});

test('several bad fields each get their own warning, in field order', () => {
  const warnings = warningsFor({ number: CARD_TYPO, iban: IBAN_TYPO }, ['iban']);

  assert.equal(warnings.length, 2);
  assert.deepEqual(warnings.map((w) => w.field).sort(), ['iban', 'number']);
  assert.equal(warnings.find((w) => w.field === 'number')?.severity, 'hint', 'plain stays a hint');
  assert.equal(warnings.find((w) => w.field === 'iban')?.severity, 'confirm', 'mixed becomes a confirm');
});

test('an empty field is not a mistake', () => {
  // A card being filled in one box at a time must not shout on every keystroke of the OTHER boxes.
  assert.deepEqual(warningsFor({}), []);
  assert.deepEqual(warningsFor({ number: '' }), []);
  assert.deepEqual(warningsFor({ number: '', iban: '' }, ['number', 'iban']), []);
});

test('a partly typed card is not yet wrong', () => {
  // Luhn on four digits is meaningless, and a warning there teaches people to ignore the warning.
  assert.deepEqual(warningsFor({ number: '4111' }), []);
});

test('no warning ever contains the value it is about', () => {
  // The rule every message in this feature follows: a warning that quotes the number puts it on
  // screen, in a log, and in whatever screenshot the person sends to ask what it means.
  for (const warning of warningsFor({ number: CARD_TYPO, iban: IBAN_TYPO }, ['number', 'iban'])) {
    assert.ok(!warning.text.includes(CARD_TYPO), 'the card number reached the warning');
    assert.ok(!warning.text.includes(IBAN_TYPO), 'the IBAN reached the warning');
    assert.ok(!warning.text.includes('4111'), 'nor did part of it');
  }
});

test('a field marked to be mixed but never filled in warns about nothing', () => {
  assert.deepEqual(warningsFor({ cvv: '' }, ['cvv']), []);
});
