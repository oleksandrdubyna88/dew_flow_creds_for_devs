import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePaymentFields, serializePaymentFields } from '../paymentFields';
import {
  PaymentRecordUnreadableError,
  paymentFieldsInExport,
  redactArrivedPayment,
  redactPaymentForShare,
} from '../paymentRedaction';

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

test('an ABSENT record shares as nothing, and an UNREADABLE one refuses loudly', () => {
  // This test asserted the opposite until the code review overturned it, and the distinction is the
  // whole finding: "no card stored" and "a card is stored and cannot be read" are different facts,
  // and collapsing them means a person is told the entry was shared while the card was quietly left
  // out — with a retry indistinguishable from a first success.
  assert.equal(redactPaymentForShare(undefined), undefined, 'nothing stored, nothing to send');
  assert.equal(redactPaymentForShare(''), undefined);

  assert.throws(
    () => redactPaymentForShare('{not json'),
    PaymentRecordUnreadableError,
    'a record that exists and yields nothing must not pass silently as an empty card',
  );
  assert.throws(() => redactPaymentForShare('{"cvv":123}'), PaymentRecordUnreadableError, 'wrong types too');
});

test('an ARRIVING record is redacted again, because a share is a trust boundary', () => {
  // Overturns my own decision, on the reviewer's argument: everything reaching the accept path was
  // written by somebody else's process, so "a share cannot carry a CVV" has to be true of what
  // ARRIVES. One function called at both ends is one opinion applied twice, not two opinions.
  const crafted = '{"number":"4111111111111111","cvv":"123","pin":"4321"}';
  const stored = parsePaymentFields(redactArrivedPayment(crafted));
  assert.equal(stored.number, '4111111111111111', 'the card still arrives');
  assert.equal(stored.cvv, undefined, 'a crafted or replayed payload cannot put a CVV in my vault');
  assert.equal(stored.pin, undefined);
});

test('an unreadable ARRIVAL yields nothing instead of refusing the whole share', () => {
  // Deliberately unlike the sending side. A share that reached a person is theirs, and refusing to
  // store the readable half of it would lose more than it protects.
  assert.equal(redactArrivedPayment('{not json'), undefined);
  assert.equal(redactArrivedPayment(undefined), undefined);
});

test('the export warning counts the records whose CVV or PIN is going with them', () => {
  // Counted, never printed: the warning must name the risk without putting a CVV into a
  // notification, which several UI layers log.
  const withCvv = { payment: serializePaymentFields({ number: '4111', cvv: '123' }) };
  const withPin = { payment: serializePaymentFields({ number: '5555', pin: '4321' }) };
  const plain = { payment: serializePaymentFields({ number: '6666' }) };
  const none = {};

  assert.equal(paymentFieldsInExport([withCvv, withPin, plain, none]), 2);
  assert.equal(paymentFieldsInExport([plain, none]), 0, 'no warning when there is nothing to warn about');
  assert.equal(paymentFieldsInExport([]), 0);
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
