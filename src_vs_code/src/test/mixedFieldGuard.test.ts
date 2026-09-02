import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { hasMixedField, mixedEditRefusal, rawHasMixedField } from '../mixedFieldGuard';

/**
 * The gate that stops a woven value being woven a second time.
 *
 * <p>Without it, a card with a mixed PIN opens for editing, the form puts the 8 stored digits where 4
 * belong, and saving weaves them again — 16 digits under two unknown codes, then 32, then 64.
 * Irreversibly destroyed, one save at a time, with no error at any step.</p>
 */

test('a record with a woven field is refused', () => {
  assert.equal(hasMixedField({ pin: 'woven', shuffledFields: ['pin'] }), true);
});

test('a record with NOTHING woven edits normally — this is the case that stops the gate being a wall', () => {
  // The second half of the requirement, and the one a careless implementation breaks: gating on
  // "is a payment" instead of "has a mixed field" would lock every card anybody ever saved.
  assert.equal(hasMixedField({ number: '4111111111111111', cvv: '123' }), false);
  assert.equal(hasMixedField({}), false);
  assert.equal(hasMixedField({ shuffledFields: [] }), false, 'an empty list is not a mixed field');
});

test('the condition is "has a mixed field", never "is a phrase"', () => {
  // A phrase is the case people picture. A card with a woven PIN is the same state and the same
  // destruction, and it is the one nobody pictures.
  const cardWithWovenPin = { number: '4111111111111111', pin: 'woven', shuffledFields: ['pin'] };
  const phraseWithNothingWoven = { wordlistFirst: 'bip39', mixed: ['a', 'b', 'c', 'd'] };

  assert.equal(hasMixedField(cardWithWovenPin), true, 'a card can be as unsafe to edit as a phrase');
  assert.equal(hasMixedField(phraseWithNothingWoven), false, 'and a phrase is not automatically unsafe');
});

test('the same question can be asked of the raw stored JSON', () => {
  assert.equal(rawHasMixedField('{"pin":"woven","shuffledFields":["pin"]}'), true);
  assert.equal(rawHasMixedField('{"number":"4111111111111111"}'), false);
});

test('a record that does not parse is not treated as mixed', () => {
  // A corrupt record is a different problem with a different message. Answering "mixed" here would
  // lock the entry for a reason that is not true, and hide the reason that is.
  assert.equal(rawHasMixedField('not json'), false);
  assert.equal(rawHasMixedField(undefined), false);
  assert.equal(rawHasMixedField(''), false);
});

test('the refusal names the fields and never their values', () => {
  const text = mixedEditRefusal({ pin: '12345678', cvv: '123456', shuffledFields: ['pin', 'cvv'] });

  assert.match(text, /pin/);
  assert.match(text, /cvv/);
  assert.ok(!text.includes('12345678'), 'the woven value reached the message');
  assert.ok(!text.includes('123456'), 'the other one did too');
});

test('the refusal says what to do next', () => {
  // A refusal with no way forward is a bug report waiting to be filed.
  const text = mixedEditRefusal({ pin: 'woven', shuffledFields: ['pin'] });
  assert.match(text, /delete|unweave|view/i);
});

test('the refusal reads correctly for one field and for several', () => {
  assert.match(mixedEditRefusal({ shuffledFields: ['pin'] }), /a field/);
  assert.match(mixedEditRefusal({ shuffledFields: ['pin', 'cvv'] }), /fields/);
});

/**
 * `editNode` hands the form the stored record — the line whose absence was the epic's worst bug.
 *
 * <p>Both reviewers found it independently: `initialPayment` was declared, read in two places, and set
 * by nobody. Editing a payment entry opened a blank form over a real card, and saving it deleted the
 * record — `{}` serialises to nothing, and nothing DELETES. It is the exact "helper with no caller"
 * defect this codebase warns about in `paymentFields.ts` and `shareInbox.ts`, which is why it gets a
 * test that reads the source rather than trusting a comment.</p>
 */
test('editNode passes the stored payment record into the form', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'entityEditCommands.ts'), 'utf8');

  assert.match(source, /getPaymentRaw\(/, 'the stored record is read');
  assert.match(source, /initialPayment:/, 'and handed to the form — without this the form opens blank');
  assert.ok(
    source.indexOf('getPaymentRaw(') < source.indexOf('initialPayment:'),
    'read before it is passed, or it is passed a promise',
  );
});

test('editNode refuses a record with a woven field before it opens anything', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'entityEditCommands.ts'), 'utf8');

  assert.match(source, /hasMixedField\(/, 'the guard is called');
  assert.ok(
    source.indexOf('hasMixedField(') < source.indexOf('showEntityForm('),
    'and called BEFORE the form is shown — after it, the damage is already on screen',
  );
});
