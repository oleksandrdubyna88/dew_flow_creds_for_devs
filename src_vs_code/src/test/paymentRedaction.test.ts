import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePaymentFields, serializePaymentFields } from '../paymentFields';
import { redactPaymentForShare } from '../paymentRedaction';

/**
 * S1.3 — where a payment record's CVV and PIN go, direction by direction.
 *
 * <p>The parent plan's §2.5 exists because the promise "they do not leave" stood in three places and
 * was covered by ONE test, against the agent filter. The directions have no common answer, and that
 * is the whole point of testing each:</p>
 *
 * <table>
 *   <tr><td>backup, sync, revision history, external export</td><td>CARRY them</td></tr>
 *   <tr><td>a share to another person</td><td>STRIP them</td></tr>
 *   <tr><td>the agent surface</td><td>carries no payment field at all</td></tr>
 * </table>
 *
 * <p><b>Both sides of every assertion.</b> A test that only checks the stripping is half a test: the
 * one that matters more in a year is the export test, because it protects the decision from a later
 * reader who "helpfully" adds a scrub and quietly makes every restored card useless.</p>
 *
 * <p>The asymmetry is a decision, not an oversight. A shared copy LIVES ON in someone else's vault
 * and travels to their machines; an export is a file a person made once, deliberately, with a
 * warning, and it already carries passwords, private keys and VPN configs.</p>
 */

const CARD = {
  number: '4111111111111111',
  expiry: '12/29',
  holder: 'A Person',
  cvv: '123',
  pin: '4321',
  country: 'PL',
};

test('a share carries the card and drops the CVV and the PIN', () => {
  const shared = parsePaymentFields(redactPaymentForShare(serializePaymentFields(CARD)));
  assert.equal(shared.number, CARD.number, 'the number travels — sharing a card is the feature');
  assert.equal(shared.expiry, CARD.expiry);
  assert.equal(shared.holder, CARD.holder);
  assert.equal(shared.country, CARD.country);
  assert.equal(shared.cvv, undefined, 'the CVV stays in the vault it was typed into');
  assert.equal(shared.pin, undefined, 'and so does the PIN');
});

test('the stripped names go with the values, so the recipient draws no picker over nothing', () => {
  // A card whose CVV and PIN were stored woven. `shuffledFields` drives the recipient's card: a name
  // left in it with no value behind it means a method picker over a field that is not there.
  const woven = serializePaymentFields({ ...CARD, shuffledFields: ['cvv', 'pin', 'number'] });
  const shared = parsePaymentFields(redactPaymentForShare(woven));
  assert.deepEqual(
    shared.shuffledFields,
    ['number'],
    'the woven number keeps its mark; the stripped fields lose theirs',
  );
});

test('a card that was ONLY a CVV and a PIN shares as nothing at all', () => {
  // Not a curiosity: it is the case where redaction must delete the keychain key rather than store an
  // empty object, exactly as `serializePaymentFields` does everywhere else.
  assert.equal(redactPaymentForShare(serializePaymentFields({ cvv: '123', pin: '4321' })), undefined);
});

test('bank details share whole, because nothing in them is a CVV', () => {
  // Reciprocity for the account is what bank details are FOR — they exist to be told to people.
  const bank = {
    beneficiary: 'A Person',
    bank: 'A Bank',
    iban: 'PL61109010140000071219812874',
    swift: 'AAAAPLPX',
    accountNumber: '123456789',
  };
  assert.deepEqual(parsePaymentFields(redactPaymentForShare(serializePaymentFields(bank))), bank);
});

test('an absent or unreadable record redacts to nothing rather than throwing', () => {
  assert.equal(redactPaymentForShare(undefined), undefined);
  assert.equal(redactPaymentForShare(''), undefined);
  assert.equal(redactPaymentForShare('{not json'), undefined);
});

test('redaction is idempotent, so a re-share cannot restore what a share removed', () => {
  const once = redactPaymentForShare(serializePaymentFields(CARD));
  assert.equal(redactPaymentForShare(once), once);
});

test('the redacted record is still a valid payment record', () => {
  // It goes into somebody else's vault and is read by the same parser. A redaction that produced
  // something `parsePaymentFields` rejects would deliver an empty card rather than a partial one.
  const shared = redactPaymentForShare(serializePaymentFields(CARD));
  assert.notEqual(shared, undefined);
  assert.equal(parsePaymentFields(shared).number, CARD.number);
  assert.equal(serializePaymentFields(parsePaymentFields(shared)), shared, 'and it round-trips unchanged');
});
