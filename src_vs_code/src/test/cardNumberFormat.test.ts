import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAfterFormat, digitsBefore, digitsOnly, groupDigits } from '../cardNumberFormat';
import { PaymentFields } from '../paymentFields';
import { cardFieldsFrom } from '../cardFormFields';

/**
 * A card number as it is read, and as it is stored — and the line between them, which is the whole
 * point of this module. The placeholder always promised groups of four; the box never delivered
 * them, and the viewer showed an undivided run of sixteen digits nobody can check against the card
 * in their hand.
 */

test('a number is shown in the groups the card itself is printed in', () => {
  assert.equal(groupDigits('5293660594910479'), '5293 6605 9491 0479');
  assert.equal(groupDigits('4111111111111111'), '4111 1111 1111 1111');
});

test('American Express is 4-6-5, because that is how an Amex card is printed', () => {
  assert.equal(groupDigits('378282246310005'), '3782 822463 10005');
});

test('a half-typed number groups as far as it goes, and never pads', () => {
  assert.equal(groupDigits(''), '');
  assert.equal(groupDigits('4'), '4');
  assert.equal(groupDigits('41111'), '4111 1');
});

test('whatever is already in the box is accepted — spaces, dashes, a pasted line break', () => {
  assert.equal(groupDigits('4111 1111 1111 1111'), '4111 1111 1111 1111', 'formatting is idempotent');
  assert.equal(groupDigits('4111-1111-1111-1111'), '4111 1111 1111 1111');
  assert.equal(groupDigits('4111\n1111 1111 1111'), '4111 1111 1111 1111');
  assert.equal(groupDigits('not a card'), '', 'and nothing that is not a digit survives');
});

test('an over-long number is still shown grouped rather than refused', () => {
  // The form stores what it is given — brandHint says "worth checking", never "fix this" — so the
  // display must not be the thing that refuses a card this table has never heard of.
  assert.equal(groupDigits('12345678901234567890'), '1234 5678 9012 3456 7890');
});

test('what reaches the RECORD is digits and nothing else', () => {
  // Not a preference. A woven number is permuted per character, so a stored space would be woven in
  // among the digits and the original could never be rebuilt.
  assert.equal(digitsOnly('4111 1111 1111 1111'), '4111111111111111');
  assert.equal(digitsOnly('  4111-1111 1111 1111  '), '4111111111111111');
});

test('the form strips the grouping on the way to the record', () => {
  const fields: PaymentFields = cardFieldsFrom({ cardNumber: '5293 6605 9491 0479' });

  assert.equal(fields.number, '5293660594910479', 'a stored space would be woven into the value');
});

test('the caret keeps its place in the NUMBER, not its place in the string', () => {
  // Typing a digit into the middle of a saved number used to throw the cursor to the far right,
  // because reformatting an input resets it. Counting digits is what survives the spaces moving.
  const formatted = '4111 1111 1111 1111';

  assert.equal(caretAfterFormat(formatted, 4), 4, 'after the fourth digit, before the space');
  assert.equal(caretAfterFormat(formatted, 5), 6, 'the fifth digit sits past the space');
  assert.equal(caretAfterFormat(formatted, 0), 0, 'the start of the box stays the start');
  assert.equal(caretAfterFormat(formatted, 99), formatted.length, 'past the end is the end');
});

test('digitsBefore counts through whatever punctuation the box holds', () => {
  assert.equal(digitsBefore('4111 1111', 6), 5, 'the space before the caret is not a digit');
  assert.equal(digitsBefore('4111 1111', 0), 0);
  assert.equal(digitsBefore('', 3), 0, 'an empty box has nothing before anything');
});
