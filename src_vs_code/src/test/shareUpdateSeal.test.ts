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
 */

const ENTRY_PIN = '2468';
const NEW_PASSWORD = 'pw-of-prod api v2';

/** Accept `prod api`, then protect the local copy with its own PIN, the way Protect does. */
async function protectedCopy(): Promise<{ w: World; id: string; written: string[] }> {
  const w = world();
  ui.inputs = [PIN];
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 'sender-side-id'), PIN));
  const [mine] = w.storage.getNodes(RECIPIENT.accountId);
  await protectEntity(w.storage, RECIPIENT.accountId, mine.id, ENTRY_PIN);
  await w.storage.updateDetailsFields(RECIPIENT.accountId, mine.id, { pinProtected: true });
  // Every value the update hands the keychain, in order — rule R3 is about the moment between two
  // writes, which the final state cannot show.
  const written: string[] = [];
  const setPassword = w.storage.setPassword.bind(w.storage);
  w.storage.setPassword = (a, e, value) => {
    written.push(String(value));
    return setPassword(a, e, value);
  };
  return { w, id: mine.id, written };
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
