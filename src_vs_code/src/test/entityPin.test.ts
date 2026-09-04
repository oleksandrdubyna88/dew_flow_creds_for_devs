import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_SLOTS } from '../entitySlots';
import {
  isProtected,
  lockedSlotCount,
  pinOpens,
  protectEntity,
  unprotectEntity,
} from '../entityPin';
import { isLockedSecret, readSecret } from '../secretEnvelope';
import { forgetAllPins, forgetPin, grantCount, grantPin, grantedPin } from '../pinSession';
import { StorageManager } from '../storageManager';

/**
 * Putting one entry's secrets under a PIN, and taking them back out.
 *
 * <p>The property this file exists for is the one three reviewers made the plan admit: this is
 * IDEMPOTENT and SELF-DESCRIBING, not atomic. `SecretStorage` has no transaction, so a process
 * killed between two slot writes leaves a mixture — and what makes that survivable is that the mark
 * is inside each value, so the mixture is readable and a second run finishes the job.</p>
 */

const ACCOUNT = 'acct-1';
const ENTITY = 'e1';
const PIN = 'correct-horse-battery';

/** A vault with the nine slots and nothing else — enough for everything `entityPin` touches. */
function vault(initial: Record<string, string> = {}): StorageManager {
  const held = new Map<string, string>(Object.entries(initial));
  const get = (label: string) => Promise.resolve(held.get(label));
  const set = (label: string, value: string): Promise<void> => {
    held.set(label, value);
    return Promise.resolve();
  };
  const store = {
    held,
    getNotes: () => get('notes'),
    setNotes: (_a: string, _e: string, v: string) => set('notes', v),
    getFieldsRaw: () => get('login and URL'),
    setFieldsRaw: (_a: string, _e: string, v: string) => set('login and URL', v),
    getPaymentRaw: () => get('payment details'),
    setPaymentRaw: (_a: string, _e: string, v: string) => set('payment details', v),
    getConfigBody: () => get('config body'),
    setConfigBody: (_a: string, _e: string, v: string) => set('config body', v),
    getDbConnection: () => get('database connection'),
    setDbConnection: (_a: string, _e: string, v: string) => set('database connection', v),
    getVpnConfig: () => get('VPN configuration'),
    setVpnConfig: (_a: string, _e: string, v: string) => set('VPN configuration', v),
    getTotp: () => get('one-time-code seed'),
    setTotp: (_a: string, _e: string, v: string) => set('one-time-code seed', v),
    getPrivateKey: () => get('private key'),
    setPrivateKey: (_a: string, _e: string, v: string) => set('private key', v),
    getPassword: () => get('password'),
    setPassword: (_a: string, _e: string, v: string) => set('password', v),
  };
  return store as unknown as StorageManager;
}

const held = (storage: StorageManager): Map<string, string> =>
  (storage as unknown as { held: Map<string, string> }).held;

test('every slot that holds something is wrapped, and the plaintext is gone from all of them', async () => {
  const storage = vault({ password: 'hunter2', notes: 'the note', 'private key': 'KEY' });

  const result = await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  assert.deepEqual([...result.changed].sort(), ['notes', 'password', 'private key']);
  for (const [label, value] of held(storage)) {
    assert.ok(isLockedSecret(value), `${label} was left readable`);
    assert.ok(!value.includes('hunter2') && !value.includes('the note') && !value.includes('KEY'));
  }
});

test('the password is wrapped LAST, so an interruption leaves it as the person last chose it', async () => {
  // Not a preference: `SecretStorage` has no transaction, so the order decides what a killed
  // process leaves behind. The most-wanted value is the one that must not be caught mid-change.
  assert.equal(SECRET_SLOTS[SECRET_SLOTS.length - 1].label, 'password');
});

test('attachments and images are deliberately NOT slots', async () => {
  // They are base64 blobs a viewer streams, sometimes megabytes; sealing one holds it in memory
  // twice, and a PIN on the attachment of an entry whose password is locked buys nothing.
  const labels = SECRET_SLOTS.map((s) => s.label);
  assert.ok(!labels.some((l) => /attachment|image/i.test(l)), labels.join(', '));
});

test('a second run finishes an interrupted one, and does not re-wrap what is done', async () => {
  // The whole answer to "there is no transaction": re-running IS the resume. A slot already locked
  // is left exactly as it is — including one locked under a PIN this run does not know.
  const storage = vault({ password: 'hunter2', notes: 'the note' });
  await protectEntity(storage, ACCOUNT, ENTITY, PIN);
  const wrapped = held(storage).get('password');
  held(storage).set('database connection', 'postgres://u:p@h/db'); // arrived after the first run

  const second = await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  assert.deepEqual(second.changed, ['database connection'], 'only the new one is touched');
  assert.deepEqual([...second.skipped].sort(), ['notes', 'password'], 'and the done ones are named');
  assert.equal(held(storage).get('password'), wrapped, 'byte-identical — not re-wrapped');
});

test('an entry says how much of itself is locked, so a half-run is SEEN', async () => {
  const storage = vault({ password: 'hunter2', notes: 'the note', 'config body': '{}' });
  const before = await lockedSlotCount(storage, ACCOUNT, ENTITY);
  await protectEntity(storage, ACCOUNT, ENTITY, PIN);
  const after = await lockedSlotCount(storage, ACCOUNT, ENTITY);

  assert.deepEqual(before, { locked: 0, total: 3 });
  assert.deepEqual(after, { locked: 3, total: 3 });
  assert.equal(await isProtected(storage, ACCOUNT, ENTITY), true);
});

test('the values come back, byte for byte, under the right PIN', async () => {
  const storage = vault({ password: 'hunter2', notes: 'a note\nwith lines', 'database connection': 'postgres://u:p@h/db' });
  await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  await unprotectEntity(storage, ACCOUNT, ENTITY, PIN);

  assert.equal(held(storage).get('password'), 'hunter2');
  assert.equal(held(storage).get('notes'), 'a note\nwith lines');
  assert.equal(held(storage).get('database connection'), 'postgres://u:p@h/db');
  assert.equal(await isProtected(storage, ACCOUNT, ENTITY), false);
});

test('a WRONG pin fails before anything is written — never half an entry', async () => {
  // The reviewers' "wrong PIN, half the entry re-wrapped" case. Every slot is opened before the
  // first write, so the failure costs a message.
  const storage = vault({ password: 'hunter2', notes: 'the note' });
  await protectEntity(storage, ACCOUNT, ENTITY, PIN);
  const before = new Map(held(storage));

  await assert.rejects(() => unprotectEntity(storage, ACCOUNT, ENTITY, 'not-the-pin-at-all'));

  assert.deepEqual([...held(storage)], [...before], 'the entry is untouched');
});

test('a slot that is CORRUPT is skipped rather than overwritten', async () => {
  // Overwriting damaged ciphertext destroys the only copy of the evidence, and the envelope's own
  // contract already separates "mine and damaged" from "not mine".
  const storage = vault({ password: 'hunter2', notes: '{"v":1,"lock":{"wrap":{}}}' });

  const result = await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  assert.equal(readSecret(held(storage).get('notes')).kind, 'corrupt');
  assert.equal(held(storage).get('notes'), '{"v":1,"lock":{"wrap":{}}}', 'byte-identical');
  assert.ok(result.skipped.includes('notes'), 'and it is reported, not silent');
});

test('an empty slot is neither wrapped nor reported — there is nothing there', async () => {
  const storage = vault({ password: 'hunter2' });

  const result = await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  assert.deepEqual(result.changed, ['password']);
  assert.deepEqual(result.skipped, [], 'eight empty slots are not eight lines of noise');
});

test('a woven password keeps its mark through the wrap and back', async () => {
  // §2.6: weave first, wrap second. The envelope's ciphertext IS the woven string, and the entry's
  // own `passwordWoven` field is untouched by any of this.
  const storage = vault({ password: 'w0Ov3Enn' });
  await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  await unprotectEntity(storage, ACCOUNT, ENTITY, PIN);

  assert.equal(held(storage).get('password'), 'w0Ov3Enn', 'the woven string is what comes back');
});

test('pinOpens answers the folder question without throwing', async () => {
  // A wrong PIN is an ANSWER here, not a failure: this is what the "use the PIN a sibling already
  // uses" box is checked with, and it is asked once per sibling.
  const storage = vault({ password: 'hunter2' });
  await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  assert.equal(await pinOpens(storage, ACCOUNT, ENTITY, PIN), true);
  assert.equal(await pinOpens(storage, ACCOUNT, ENTITY, 'a-different-one'), false);
  assert.equal(await pinOpens(vault({ password: 'plain' }), ACCOUNT, ENTITY, PIN), false, 'an unprotected sibling opens nothing');
});

/**
 * The session grant: what a person typed, held for as long as this window lives and nowhere else.
 */
test('a grant is per entry, and forgetting one leaves the others', () => {
  forgetAllPins();
  grantPin('a', 'pin-a');
  grantPin('b', 'pin-b');

  forgetPin('a');

  assert.equal(grantedPin('a'), undefined, 'and undefined means ASK, never "it failed"');
  assert.equal(grantedPin('b'), 'pin-b');
  assert.equal(grantCount(), 1);
});

test('the vault lock forgets everything at once', () => {
  forgetAllPins();
  grantPin('a', 'pin-a');
  grantPin('b', 'pin-b');

  forgetAllPins();

  assert.equal(grantCount(), 0);
});
