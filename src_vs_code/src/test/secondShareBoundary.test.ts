import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeSecondValues, type SecondValues } from '../secondValues';
import { withheldNoteFor, withheldSentence } from '../shareWithheld';
import { exportSensitiveNote, paymentFieldsInExport } from '../paymentRedaction';
import { loadWithVscode } from './vscodeStub';

/**
 * S7 — what a share sends, asserted at the BOUNDARY rather than at an allowlist.
 *
 * <p>The distinction is the whole point of the story. A unit test over a list of permitted fields
 * passes for a payload a generic serializer picked the slot up into; this builds a REAL payload from
 * a vault that holds a second value of every kind and asserts against what would be sealed. If a
 * future change spreads the record into the payload, the allowlist test stays green and this one does
 * not.</p>
 */

const HELD: SecondValues = {
  password2: 'SECOND-PASSWORD',
  number2: '4242424242424242',
  cvv2: '737',
  pin2: '4821',
  iban2: 'DE02120300000000202051',
  accountNumber2: '12345678',
};

const DETAILS = { id: 'e1', name: 'prod-db', isSshEnabled: false } as const;

/** A vault holding an ordinary secret AND a second value of every kind. */
function vault(): Record<string, unknown> {
  const nothing = (): Promise<undefined> => Promise.resolve(undefined);
  return {
    getNotes: nothing,
    getTotp: nothing,
    getPassword: () => Promise.resolve('hunter2x'),
    getPrivateKey: nothing,
    getVpnConfig: nothing,
    getDbConnection: nothing,
    getConfigBody: nothing,
    getFieldsRaw: nothing,
    getPaymentRaw: nothing,
    getSecondRaw: () => Promise.resolve(serializeSecondValues(HELD)),
    getSecond: () => Promise.resolve(HELD),
  };
}

test('a real share payload carries NO second value of any kind', async () => {
  const mod = loadWithVscode<typeof import('../sharePayloadBuild')>('../sharePayloadBuild', {});
  const node = { id: 'e1', name: 'prod-db', type: 'entity', details: DETAILS } as never;

  const payload = await mod.buildSharePayload(vault() as never, 'a1', node, false);

  const sealed = JSON.stringify(payload);
  for (const value of Object.values(HELD)) {
    assert.ok(!sealed.includes(value), `${value} must not leave this vault`);
  }
  assert.equal(payload.secrets.password, 'hunter2x', 'and the share still carries what it is for');
  assert.ok(!('second' in payload.secrets), 'there is no field for one, which is why there is no value');
});

test('and the check would SEE a leak — the same assertion against a payload that carried one', () => {
  // The teeth. A guarantee test run only against correct code proves nothing about incorrect code,
  // and the honest way to find out here would be to write the leak. This runs the identical check
  // against a payload shaped exactly as that leak would shape it.
  const leaked = JSON.stringify({ secrets: { password: 'hunter2x', second: serializeSecondValues(HELD) } });

  assert.ok(leaked.includes(HELD.password2 ?? ''), 'the check is looking at the right thing');
});

test('the sender is TOLD, by name, what was not sent', async () => {
  const note = await withheldNoteFor(
    vault() as never,
    'a1',
    [{ node: { id: 'e1', details: { isPayment: false } } }],
  );

  assert.match(note, /Not sent, and they cannot be/);
  for (const label of ['Second password', 'Second CVV', 'Second PIN', 'Second IBAN']) {
    assert.ok(note.includes(label), `${label} is named`);
  }
  for (const value of Object.values(HELD)) {
    assert.ok(!note.includes(value), 'names, never values — this reaches a notification, and those are logged');
  }
});

test('an entry with nothing withheld produces no sentence at all', async () => {
  const empty = {
    getPaymentRaw: (): Promise<undefined> => Promise.resolve(undefined),
    getSecond: (): Promise<SecondValues> => Promise.resolve({}),
  };

  assert.equal(await withheldNoteFor(empty, 'a1', [{ node: { id: 'e1' } }]), '');
});

test('a folder share names each withheld kind ONCE, not once per entry', async () => {
  // Otherwise the sentence would be a list about how many entries were selected rather than about
  // what was withheld, and the person would read it as five different problems.
  const note = await withheldNoteFor(
    vault() as never,
    'a1',
    [{ node: { id: 'e1' } }, { node: { id: 'e2' } }, { node: { id: 'e3' } }],
  );

  assert.equal((note.match(/Second CVV/g) ?? []).length, 1);
});

test('a WOVEN field still travels exactly as it does today — the decided case', async () => {
  // Owner's decision 3, and the one this story could most easily break by over-applying the rule:
  // a woven value is ONE value, and its other half is inside it. Withholding it would mean
  // withholding the field, which is not what was decided and not what a colleague needs.
  const mod = loadWithVscode<typeof import('../sharePayloadBuild')>('../sharePayloadBuild', {});
  const woven = {
    ...vault(),
    getPaymentRaw: () => Promise.resolve('{"iban":"WOVEN-VALUE-HERE","shuffledFields":["iban"],"ownSecond":["iban"]}'),
  };
  const node = {
    id: 'e1',
    name: 'bank',
    type: 'entity',
    details: { ...DETAILS, isPayment: true, paymentForm: 'bank' },
  } as never;

  const payload = await mod.buildSharePayload(woven as never, 'a1', node, false);

  assert.match(String(payload.secrets.payment), /WOVEN-VALUE-HERE/, 'the woven value travels');
});

/**
 * The other direction: an export KEEPS what a share removes, and says how much.
 *
 * <p>The warning is the one sentence that must never understate the file. Counting a card's CVV and
 * PIN but not the second values beside them would do exactly that, by exactly the new kind.</p>
 */
test('the export warning counts second values beside a card’s withheld fields', () => {
  const counts = paymentFieldsInExport([
    { payment: '{"number":"4111111111111111","cvv":"481","pin":"9137"}', second: serializeSecondValues({ cvv2: '737' }) },
  ]);

  assert.deepEqual(counts, { records: 1, fields: 3 }, 'a CVV, a PIN and one second value');
  assert.match(exportSensitiveNote(counts), /3 values a share would remove, across 1 entry/);
});

test('an entry with ONLY second values still warns — it is not a payment at all', () => {
  // The case the old shape could not see: a credential has no payment record, so a counter that
  // started by parsing one would count nothing and the file would carry a secret nobody was warned
  // about.
  const counts = paymentFieldsInExport([{ second: serializeSecondValues({ password2: 'other' }) }]);

  assert.deepEqual(counts, { records: 1, fields: 1 });
  assert.match(exportSensitiveNote(counts), /1 value a share would remove, across 1 entry/);
});

test('a file with nothing to warn about produces no sentence', () => {
  assert.deepEqual(paymentFieldsInExport([{ payment: '{"number":"4111111111111111"}' }, {}]), { records: 0, fields: 0 });
  assert.equal(exportSensitiveNote({ records: 0, fields: 0 }), '');
});

/**
 * The names read as ONE alphabetical list, not as two.
 *
 * <p>Raised by the static analyser (typescript:S2871) and true for a reason worth the test: a default
 * `.sort()` orders by UTF-16 code unit, which puts every capital before every lower-case letter. The
 * sentence then reads "Second CVV, Second IBAN, Second PIN, Second account number, Second card
 * number, Second password" — the same six names, arranged as two lists a person has to read twice to
 * be sure nothing is missing.</p>
 *
 * <p>These are labels shown to somebody, so they sort the way somebody reads.</p>
 */
test('the withheld names are ordered as a person reads, not by code unit', () => {
  const sentence = withheldSentence([
    'Second password', 'Second CVV', 'Second account number', 'Second IBAN', 'Second card number', 'Second PIN',
  ]);

  assert.match(
    sentence,
    /Second account number, Second card number, Second CVV, Second IBAN, Second password, Second PIN/,
  );
});
