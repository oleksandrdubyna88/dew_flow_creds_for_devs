import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePaymentFields, serializePaymentFields } from '../paymentFields';
import {
  PaymentRecordUnreadableError,
  exportSensitiveNote,
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
  const arrived = redactArrivedPayment(crafted);
  const stored = parsePaymentFields(arrived.raw);
  assert.equal(stored.number, '4111111111111111', 'the card still arrives');
  assert.equal(stored.cvv, undefined, 'a crafted or replayed payload cannot put a CVV in my vault');
  assert.equal(stored.pin, undefined);
  assert.equal(arrived.unreadable, false);
});

test('an unreadable ARRIVAL is REPORTED, not silently dropped', () => {
  // I had this side keep the readable half in silence, arguing that a share which reached a person is
  // theirs. Both reviewers rejected that independently and were right about the half I had wrong: the
  // argument justifies keeping the ENTRY, and nothing about it justifies being silent. Somebody told
  // the entry arrived would act on it believing it complete, with no way to know a re-send is worth
  // asking for.
  const bad = redactArrivedPayment('{not json');
  assert.equal(bad.raw, undefined, 'nothing unreadable is stored');
  assert.equal(bad.unreadable, true, 'and the caller is told, so it can say so');

  const absent = redactArrivedPayment(undefined);
  assert.equal(absent.raw, undefined);
  assert.equal(absent.unreadable, false, 'no record is not a broken record — the distinction is the point');
});

test('a share that carries ONLY withheld fields arrives as nothing, and is not called unreadable', () => {
  const onlyCvv = redactArrivedPayment('{"cvv":"123","pin":"4321"}');
  assert.equal(onlyCvv.raw, undefined);
  assert.equal(onlyCvv.unreadable, false, 'it parsed fine; there was simply nothing left to keep');
});

test('a NEW sensitive field is withheld by default, because the list is an allowlist', () => {
  // The finding that mattered most in this round, and it is the same defect class that bit S1.1 three
  // times: an exclusion list leaks BY DEFAULT. The next sensitive field added to PaymentFields would
  // have travelled to somebody else's vault because nobody remembered to exclude it.
  //
  // `mixed` is the case that already exists: a woven phrase in someone else's vault is tokens they
  // cannot unweave, because the method is a code the person remembers and nothing transmits.
  const withPhrase = serializePaymentFields({
    number: '4111111111111111',
    mixed: ['alpha', 'mike', 'bravo', 'november'],
    wordlistFirst: 'bip39-en',
    layout: 'vertical',
    ownWords: true,
  });
  const shared = parsePaymentFields(redactPaymentForShare(withPhrase));
  assert.equal(shared.number, '4111111111111111', 'the allowlisted field still travels');
  assert.equal(shared.mixed, undefined, 'a woven phrase is useless to a recipient and may be two real keys');
  assert.equal(shared.wordlistFirst, undefined);
  assert.equal(shared.layout, undefined);
  assert.equal(shared.ownWords, undefined);
});

test('the export warning says how many FIELDS across how many RECORDS, because either alone misleads', () => {
  // Both reviewers raised this and asked for DIFFERENT metrics, which is what made the ambiguity
  // visible: "the CVV and PIN of 2 records" implies both values exist in each, and "2 fields" hides
  // how many cards are involved. Counted, never printed — a CVV must not reach a notification, which
  // several UI layers log.
  const both = { payment: serializePaymentFields({ number: '4111', cvv: '123', pin: '4321' }) };
  const cvvOnly = { payment: serializePaymentFields({ number: '5555', cvv: '999' }) };
  const plain = { payment: serializePaymentFields({ number: '6666' }) };
  const none = {};

  assert.deepEqual(paymentFieldsInExport([both, cvvOnly, plain, none]), { records: 2, fields: 3 });
  assert.deepEqual(paymentFieldsInExport([plain, none]), { records: 0, fields: 0 });
  assert.deepEqual(paymentFieldsInExport([]), { records: 0, fields: 0 });
});

test('the export note is silent when there is nothing to warn about, and precise when there is', () => {
  assert.equal(exportSensitiveNote({ records: 0, fields: 0 }), '', 'no sentence at all rather than a reassuring one');
  assert.match(exportSensitiveNote({ records: 1, fields: 1 }), /1 CVV or PIN across 1 payment record\b/);
  assert.match(exportSensitiveNote({ records: 2, fields: 3 }), /3 CVV\/PIN values across 2 payment records/);
  assert.match(
    exportSensitiveNote({ records: 1, fields: 1 }),
    /a share removes those, an export does not/,
    'the asymmetry is the whole reason the sentence exists',
  );
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
