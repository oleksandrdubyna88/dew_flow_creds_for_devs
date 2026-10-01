import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_SLOTS } from '../entitySlots';
import {
  DamagedSlots,
  isProtected,
  lockedSlotCount,
  siblingsOpened,
  protectEntity,
  sealValue,
  unprotectEntity,
} from '../entityPin';
import { isLockedSecret, isWovenSecret, lockSecret, plainSecret, readSecret, unlockSecret } from '../secretEnvelope';
import { FREE_TRIES, forgetAllAttempts, noteWrong } from '../pinAttempts';
import { forgetAllPins, forgetPin, grantCount, grantPin, grantedPin } from '../pinSession';
import type { Revision } from '../revisionHistory';
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

/**
 * A vault with the ten slots and a kept-version list — enough for everything `entityPin` touches.
 * *Remove PIN Protection…* opens the kept versions too (§5.7), so the list is part of the fake.
 */
function vault(initial: Record<string, string> = {}, kept: Revision[] = []): StorageManager {
  const held = new Map<string, string>(Object.entries(initial));
  let history = kept;
  const get = (label: string) => Promise.resolve(held.get(label));
  const set = (label: string, value: string): Promise<void> => {
    held.set(label, value);
    return Promise.resolve();
  };
  const store = {
    held,
    // The lease Protect's seal is written under (the E2 security review, finding 3) — a fake runs it inline.
    writes: { run: <T>(work: () => Promise<T>): Promise<T> => work() },
    getNotes: () => get('notes'),
    setNotes: (_a: string, _e: string, v: string) => set('notes', v),
    getFieldsRaw: () => get('login and URL'),
    setFieldsRaw: (_a: string, _e: string, v: string) => set('login and URL', v),
    getSecondRaw: () => get('second values'),
    setSecondRaw: (_a: string, _e: string, v: string) => set('second values', v),
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
    getHistory: () => Promise.resolve(history),
    replaceHistory: (_a: string, _e: string, revise: (list: Revision[]) => Revision[]) => {
      history = revise(history);
      return Promise.resolve();
    },
  };
  return store as unknown as StorageManager;
}

const held = (storage: StorageManager): Map<string, string> =>
  (storage as unknown as { held: Map<string, string> }).held;

test('every slot that holds something is wrapped, and the plaintext is gone from all of them', async () => {
  // The probes are LONG on purpose, and one of them was not. `KEY` is three characters drawn from
  // base64's own alphabet, and what it was searched in is base64 of random bytes: measured over
  // 200,000 samples, a 250-character envelope contains "KEY" by chance 0.09% of the time and a
  // 400-character one 0.15%. Three slots are checked on every run, so roughly one CI run in several
  // hundred went red here for a reason that had nothing to do with wrapping — the kind of failure
  // that gets re-run rather than read. A probe long enough to be impossible by accident asserts the
  // same thing and only that thing. ("hunter2" and "the note" never collided in 200,000 samples;
  // the second cannot, since base64 has no space.)
  const KEY_MATERIAL = 'BEGIN-OPENSSH-PRIVATE-KEY-MATERIAL';
  const storage = vault({ password: 'hunter2', notes: 'the note', 'private key': KEY_MATERIAL });

  const result = await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  assert.deepEqual([...result.changed].sort(), ['notes', 'password', 'private key']);
  for (const [label, value] of held(storage)) {
    assert.ok(isLockedSecret(value), `${label} was left readable`);
    for (const plaintext of ['hunter2', 'the note', KEY_MATERIAL]) {
      assert.ok(!value.includes(plaintext), `${label} still carries ${plaintext}`);
    }
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

  assert.deepEqual(before, { locked: 0, total: 3, plain: 3 });
  assert.deepEqual(after, { locked: 3, total: 3, plain: 0 }, 'and none of it is left in the clear');
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

test('siblingsOpened answers the folder question without throwing', async () => {
  // A wrong PIN is an ANSWER here, not a failure: this is what the "use the PIN a sibling already
  // uses" box is checked with, one value per sibling.
  const storage = vault({ password: 'hunter2' });
  await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  assert.equal(await siblingsOpened(storage, ACCOUNT, [ENTITY], PIN), 1);
  assert.equal(await siblingsOpened(storage, ACCOUNT, [ENTITY], 'a-different-one'), 0);
  assert.equal(await siblingsOpened(vault({ password: 'plain' }), ACCOUNT, [ENTITY], PIN), 0, 'an unprotected sibling opens nothing');
});

/**
 * The session grant: what a person typed, held for as long as this window lives and nowhere else.
 */
test('a grant is per entry, and forgetting one leaves the others', () => {
  forgetAllPins();
  grantPin(ACCOUNT, 'a', 'pin-a');
  grantPin(ACCOUNT, 'b', 'pin-b');

  forgetPin(ACCOUNT, 'a');

  assert.equal(grantedPin(ACCOUNT, 'a'), undefined, 'and undefined means ASK, never "it failed"');
  assert.equal(grantedPin(ACCOUNT, 'b'), 'pin-b');
  assert.equal(grantCount(), 1);
});

test('the vault lock forgets everything at once', () => {
  forgetAllPins();
  grantPin(ACCOUNT, 'a', 'pin-a');
  grantPin(ACCOUNT, 'b', 'pin-b');

  forgetAllPins();

  assert.equal(grantCount(), 0);
});

/**
 * `sealValue` — one value about to be WRITTEN into a protected entry, sealed the way `protectEntity`
 * seals a stored one. Extracted from `lockOne` so every writer into a protected entry (Edit, a
 * restore, a share update) seals identically, rather than each spelling `lockSecret` with its own
 * idea about the woven mark. Rule R3 of the entry-PIN plan: sealed in memory first, then written.
 */
test('sealValue locks a plain value so that only the PIN opens it', async () => {
  const sealed = await sealValue('hunter2', ACCOUNT, PIN);

  assert.equal(readSecret(sealed).kind, 'locked');
  assert.ok(!sealed.includes('hunter2'), 'the plaintext is not in the envelope');
  assert.equal(await unlockSecret(JSON.parse(sealed) as never, ACCOUNT, PIN), 'hunter2');
});

test('sealValue keeps the woven mark of a woven plain value — a seal must not turn a pair into a string', async () => {
  const wovenPlain = plainSecret('abXcdYef', true);

  const sealed = await sealValue(wovenPlain, ACCOUNT, PIN);

  assert.equal(readSecret(sealed).kind, 'locked');
  assert.equal(isWovenSecret(sealed), true, 'the mark rides inside the lock, as lockOne always kept it');
  assert.equal(await unlockSecret(JSON.parse(sealed) as never, ACCOUNT, PIN), 'abXcdYef');
});

test('sealValue leaves an already-locked value exactly as it is — re-running is the resume, never a double wrap', async () => {
  const once = await sealValue('hunter2', ACCOUNT, PIN);

  const twice = await sealValue(once, ACCOUNT, PIN);

  assert.equal(twice, once, 'byte-identical: a second wrap would need the first opened, and nothing here has the PIN for that');
});

test('sealValue seals envelope-shaped text somebody TYPED as the text it is, rather than refusing the save', async () => {
  // `readSecret` calls this `corrupt` when it is STORED, because a stored one is a damaged write. A
  // person can type it into a notes box, and then it is their note.
  const typed = '{"v":1,"lock":{"wrap":{}}}';

  const sealed = await sealValue(typed, ACCOUNT, PIN);

  assert.equal(readSecret(sealed).kind, 'locked');
  assert.equal(await unlockSecret(JSON.parse(sealed) as never, ACCOUNT, PIN), typed);
});

test('Remove PIN refuses while the entry is cooling down, and changes nothing', async () => {
  forgetAllAttempts();
  const storage = vault({ password: await lockSecret('hunter2', ACCOUNT, PIN) });
  const before = new Map(held(storage));
  for (let i = 0; i < FREE_TRIES; i += 1) {
    noteWrong(ACCOUNT, ENTITY, Date.now());
  }

  await assert.rejects(() => unprotectEntity(storage, ACCOUNT, ENTITY, PIN), /Too many wrong PINs/);

  assert.deepEqual(held(storage), before, 'byte-identical — nothing was touched');
  forgetAllAttempts();
});

const DAMAGED = '{"v":1,"lock":{"wrap":{}}}';

test('Remove PIN keeps a woven password woven — the pair comes back a pair, not one string (D13)', async () => {
  // The lock side kept the mark (`lockSecret(..., woven)`); the unwrap wrote the bare value, so the
  // viewer offered no Unweave and showed the pair as one string.
  const woven = plainSecret('w0Ov3Enn', true);
  const storage = vault({ password: woven });
  await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  await unprotectEntity(storage, ACCOUNT, ENTITY, PIN);

  assert.equal(held(storage).get('password'), woven);
  assert.equal(isWovenSecret(held(storage).get('password')), true);
});

test('Remove PIN over a DAMAGED slot changes nothing and names the value (D14)', async () => {
  // `openedSlots` opened only the locked slots, so a corrupt one was skipped and the mark cleared:
  // an entry with an unreadable value stopped claiming a PIN.
  const storage = vault({ password: 'hunter2', notes: DAMAGED });
  await protectEntity(storage, ACCOUNT, ENTITY, PIN);
  const before = new Map(held(storage));

  await assert.rejects(unprotectEntity(storage, ACCOUNT, ENTITY, PIN), (error: unknown) => {
    assert.ok(error instanceof DamagedSlots, `not a DamagedSlots: ${String(error)}`);
    assert.deepEqual(error.labels, ['notes']);
    return true;
  });
  assert.deepEqual([...held(storage)], [...before], 'nothing was written');
});

test('"Remove the PIN from the rest" unwraps the rest and leaves the damaged slot byte-identical', async () => {
  const storage = vault({ password: 'hunter2', notes: DAMAGED });
  await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  const result = await unprotectEntity(storage, ACCOUNT, ENTITY, PIN, { keepDamaged: true });

  assert.equal(held(storage).get('password'), 'hunter2');
  assert.equal(held(storage).get('notes'), DAMAGED, 'the only copy of whatever it was');
  assert.deepEqual(result.damaged, ['notes']);
});

function keptWith(secrets: Revision['secrets']): Revision {
  return { at: 1, name: 'as it was', details: { id: ENTITY, name: 'as it was', isSshEnabled: false } as Revision['details'], secrets };
}

test('Remove PIN opens the kept versions too, and leaves one under another PIN sealed and counted', async () => {
  const foreign = await lockSecret('other machine', ACCOUNT, 'another-pin');
  const storage = vault({ password: 'hunter2' }, [keptWith({ password: await lockSecret('old pw', ACCOUNT, PIN), notes: foreign })]);
  await protectEntity(storage, ACCOUNT, ENTITY, PIN);

  const result = await unprotectEntity(storage, ACCOUNT, ENTITY, PIN);

  const [kept] = await storage.getHistory(ACCOUNT, ENTITY);
  assert.equal(kept.secrets.password, 'old pw', 'the kept password opened with the PIN coming off');
  assert.equal(kept.secrets.notes, foreign, 'a value this PIN does not open is left as it was');
  assert.equal(result.foreignKept, 1);
});

test('an entry whose only sealed values are its KEPT versions checks the PIN on them before writing anything', async () => {
  // Plan gate, finding 3: unprotected on another machine, synced here; this machine's history is
  // still sealed, and Remove PIN is the way to open it — so a wrong PIN must be refused here too.
  forgetAllAttempts();
  const sealed = await lockSecret('old pw', ACCOUNT, PIN);
  const storage = vault({ password: 'hunter2' }, [keptWith({ password: sealed })]);

  await assert.rejects(unprotectEntity(storage, ACCOUNT, ENTITY, 'not-the-pin-at-all'), /The PIN was refused/);
  assert.equal((await storage.getHistory(ACCOUNT, ENTITY))[0].secrets.password, sealed, 'untouched');

  await unprotectEntity(storage, ACCOUNT, ENTITY, PIN);
  assert.equal((await storage.getHistory(ACCOUNT, ENTITY))[0].secrets.password, 'old pw');
});
