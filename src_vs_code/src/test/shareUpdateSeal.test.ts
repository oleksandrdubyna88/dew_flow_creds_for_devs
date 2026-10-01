import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectEntity } from '../entityPin';
import { readSecret, unlockSecret } from '../secretEnvelope';
import { ui, RECIPIENT, PIN, payloadFor, sealedShare, world } from './shareWorld';
import type { World } from './shareWorld';

/**
 * Accepting a share's UPDATE into an entry the recipient protected with its own PIN — D9 of the
 * entry-PIN plan, through the real `ShareInbox`.
 *
 * <p><i>Update it</i> rebuilt the node from the sender's payload, which never carries the recipient's
 * mark, and wrote the arriving values raw: the entry stopped claiming a PIN (so its row lost
 * <i>Remove PIN Protection…</i> and agents saw it again) and held the new password in the clear. Now
 * the update goes through the live entry's door, every arriving value is sealed under that PIN in
 * memory before it is written (rule R3), and `keepingMark` carries the PIN mark with the
 * Not-for-export one.</p>
 *
 * <p>And the entry protected while EMPTY (review of 2026-09-30; `PLAN_typed_stored_secrets.md` §2.7,
 * fixed 2026-10-01): *Protect with a PIN…* on an entry that holds nothing writes the mark alone, and the
 * update's writer asked only the slots — no sealed slot, so the storage itself — and wrote the arriving
 * values in the clear under the mark. Now a marked entry that holds nothing takes the first-PIN road Edit
 * and Restore take: the person chooses the PIN its first value is sealed under, and a decline keeps the
 * share.</p>
 */

const ENTRY_PIN = '2468';
const NEW_PASSWORD = 'pw-of-prod api v2';

/** Accept `prod api`, so the recipient holds a copy of it with the sender's own password. */
async function acceptedCopy(): Promise<{ w: World; id: string }> {
  const w = world();
  ui.inputs = [PIN];
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 'sender-side-id'), PIN));
  const [mine] = w.storage.getNodes(RECIPIENT.accountId);
  return { w, id: mine.id };
}

/**
 * Every value the update hands the keychain's password slot, in order — rule R3 is about the moment
 * between two writes, which the final state cannot show.
 */
function loggingWrites(w: World): string[] {
  const written: string[] = [];
  const setPassword = w.storage.setPassword.bind(w.storage);
  w.storage.setPassword = (a, e, value) => {
    written.push(String(value));
    return setPassword(a, e, value);
  };
  return written;
}

/** Accept `prod api`, then protect the local copy with its own PIN, the way Protect does. */
async function protectedCopy(): Promise<{ w: World; id: string; written: string[] }> {
  const { w, id } = await acceptedCopy();
  await protectEntity(w.storage, RECIPIENT.accountId, id, ENTRY_PIN);
  await w.storage.updateDetailsFields(RECIPIENT.accountId, id, { pinProtected: true });
  return { w, id, written: loggingWrites(w) };
}

test('updating a PROTECTED entry from a share keeps its PIN and stores the arriving values sealed — never in the clear', async () => {
  const { w, id, written } = await protectedCopy();

  ui.inputs = [PIN, ENTRY_PIN];
  ui.warningAnswer = 'Update it';
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api v2', 'sender-side-id'), PIN));

  const updated = w.storage.getNode(RECIPIENT.accountId, id);
  assert.ok(updated !== undefined, 'the entry vanished');
  assert.equal(updated.name, 'prod api v2', 'the update itself landed');
  assert.equal(updated.details?.pinProtected, true, 'the update took the PIN mark off the recipient\'s entry');
  const read = readSecret(await w.storage.getPassword(RECIPIENT.accountId, id));
  assert.equal(read.kind, 'locked', 'the arriving password is stored in the clear in a protected entry');
  assert.equal(read.kind === 'locked' ? await unlockSecret(read.envelope, RECIPIENT.accountId, ENTRY_PIN) : '', NEW_PASSWORD);
  assert.deepEqual(written.filter((value) => value.includes(NEW_PASSWORD)), [], 'the new password reached the keychain in the clear (R3)');
});

test('a declined entry PIN updates nothing, and the share stays to be accepted again', async () => {
  const { w, id } = await protectedCopy();
  const before = await w.storage.getPassword(RECIPIENT.accountId, id);
  const consumed = w.removed.length;

  ui.inputs = [PIN, undefined];
  ui.warningAnswer = 'Update it';
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api v2', 'sender-side-id'), PIN));

  assert.equal(w.storage.getNode(RECIPIENT.accountId, id)?.name, 'prod api', 'the entry was updated without its PIN');
  assert.equal(await w.storage.getPassword(RECIPIENT.accountId, id), before, 'byte-identical');
  assert.equal(w.removed.length, consumed, 'the share was consumed, and with it the only copy of the update');
});

test('updating a protected entry from a share keeps its protection-decision count — the payload never carries one', async () => {
  const { w, id } = await protectedCopy();
  await w.storage.updateNodeFields(RECIPIENT.accountId, id, { pinEpoch: 3 });

  ui.inputs = [PIN, ENTRY_PIN];
  ui.warningAnswer = 'Update it';
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api v2', 'sender-side-id'), PIN));

  const updated = w.storage.getNode(RECIPIENT.accountId, id);
  assert.equal(updated?.name, 'prod api v2', 'precondition: the update landed');
  assert.equal(updated?.pinEpoch, 3, 'the recipient\'s decisions are the recipient\'s');
});

// ---------------------------------------------------------------------------------------------
// An entry protected while EMPTY.
// ---------------------------------------------------------------------------------------------

const FIRST_PIN = '1357';

/**
 * Accept `prod api`, empty the local copy, and mark it — *Protect with a PIN…* on an entry that holds
 * nothing writes the mark alone. Nothing is sealed, so nothing can check a PIN: the entry's FIRST value
 * is what chooses it.
 */
async function protectedWhileEmptyCopy(): Promise<{ w: World; id: string; written: string[] }> {
  const { w, id } = await acceptedCopy();
  await w.storage.deletePassword(RECIPIENT.accountId, id);
  await w.storage.updateDetailsFields(RECIPIENT.accountId, id, { pinProtected: true });
  return { w, id, written: loggingWrites(w) };
}

test('a share update into an entry protected while empty asks for its first PIN and stores every arriving value sealed', async () => {
  const { w, id, written } = await protectedWhileEmptyCopy();

  // The share's PIN, then the entry's first PIN — typed twice, because nothing can check it.
  ui.inputs = [PIN, FIRST_PIN, FIRST_PIN];
  ui.warningAnswer = 'Update it';
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api v2', 'sender-side-id'), PIN));

  const updated = w.storage.getNode(RECIPIENT.accountId, id);
  assert.ok(updated !== undefined, 'the entry vanished');
  assert.equal(updated.name, 'prod api v2', 'the update itself landed');
  const read = readSecret(await w.storage.getPassword(RECIPIENT.accountId, id));
  assert.equal(read.kind, 'locked', 'the arriving password is stored in the clear in an entry protected while empty');
  assert.equal(read.kind === 'locked' ? await unlockSecret(read.envelope, RECIPIENT.accountId, FIRST_PIN) : '', NEW_PASSWORD, 'sealed under the first PIN');
  assert.deepEqual(written.filter((value) => value.includes(NEW_PASSWORD)), [], 'the new password reached the keychain in the clear (R3)');
  assert.deepEqual(ui.inputs, [], 'the first PIN was not asked for, typed twice');
  assert.equal(updated.details?.pinProtected, true, 'the mark stays');
});

test('a declined first PIN updates nothing — the entry protected while empty keeps its mark, and the share stays', async () => {
  const { w, id } = await protectedWhileEmptyCopy();
  const consumed = w.removed.length;

  ui.inputs = [PIN, undefined];
  ui.warningAnswer = 'Update it';
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api v2', 'sender-side-id'), PIN));

  const kept = w.storage.getNode(RECIPIENT.accountId, id);
  assert.equal(kept?.name, 'prod api', 'the entry was updated without its first PIN');
  assert.equal(await w.storage.getPassword(RECIPIENT.accountId, id), undefined, 'a value was written into the entry');
  assert.equal(kept?.details?.pinProtected, true, 'the mark went');
  assert.equal(w.removed.length, consumed, 'the share was consumed, and with it the only copy of the update');
});

test('an update into an entry with no sealed slot and no mark asks for no entry PIN and writes as before', async () => {
  const { w, id } = await acceptedCopy();

  ui.inputs = [PIN];
  ui.warningAnswer = 'Update it';
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api v2', 'sender-side-id'), PIN));

  assert.deepEqual(ui.inputs, [], 'precondition: the share PIN was taken');
  assert.equal(w.storage.getNode(RECIPIENT.accountId, id)?.name, 'prod api v2', 'the update landed');
  assert.equal(await w.storage.getPassword(RECIPIENT.accountId, id), NEW_PASSWORD, 'an unprotected entry is written as it always was — under the vault alone');
  assert.equal(w.storage.getNode(RECIPIENT.accountId, id)?.details?.pinProtected, undefined, 'no mark was invented');
});
