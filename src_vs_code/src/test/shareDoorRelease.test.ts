import { KEY_ID, RECIPIENT, TEAM_MEMBER, World, loaded, ui, world } from './shareWorld';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { fingerprintOf, holdRotated } from '../rotationQuarantine';
import { lockSecret } from '../secretEnvelope';
import { forgetAllPins } from '../pinSession';
import { stored } from '../storedSecret';
import type { TreeNode } from '../types';

/**
 * The share door goes past the door like every other (`research/PLAN_waiting_rotation_visible.md` W2, §3.2).
 *
 * <p>`payloadsFor` asked `admit` itself and dropped what it answered: a rotated value that waited beside the entry
 * went in at the share without a word, and one that could not go in — the slot changed after the rotation — was
 * never asked about, so the share carried the value the far side no longer accepts while the hold waited on. Every
 * other door says the first and asks the second (`pinPrompt.admitted` → `rotationWaiting.settleRelease`).</p>
 *
 * <p>Driven through the real `ShareInbox` over the real `StorageManager` (`shareWorld.ts`), and the payload is read
 * the way the recipient reads it — opened with the transit PIN.</p>
 */

const ENTRY_PIN = 'correct-horse-battery';
// The same string as the entry's PIN, as in `pinGateHoles.test.ts`: the input queue is the entry's box, then the
// share PIN twice, and an equal string keeps a missing box from shifting the queue into a different failure.
const TRANSIT_PIN = ENTRY_PIN;
const OLD = 'old-Password-3d9a';
const NEW = 'NEW-rotated-Password-7c1e';
const OTHER = 'CHANGED-elsewhere-Password-5e0f';
const STORE_ROTATED = 'Store the rotated one';

const FOLDER: TreeNode = { id: 'sd-f1', name: 'Production', type: 'folder', parentId: null };
const ENTRY: TreeNode = {
  id: 'sd-e1',
  name: 'portal',
  type: 'entity',
  parentId: FOLDER.id,
  details: { id: 'sd-e1', name: 'portal', isSshEnabled: false },
};

beforeEach(() => forgetAllPins());

interface Plant {
  /** What the slot holds, in the clear. */
  readonly live: string;
  /** Whether the entry is protected with its own PIN — its slot sealed and the entry marked. */
  readonly pinned: boolean;
}

/** One folder, the entry inside it, and a rotated password held beside the entry that replaced `OLD`. */
async function plant(w: World, given: Plant): Promise<void> {
  const details = { ...ENTRY.details!, ...(given.pinned ? { pinProtected: true } : {}) };
  await w.storage.addNode(RECIPIENT.accountId, FOLDER);
  await w.storage.addNode(RECIPIENT.accountId, { ...ENTRY, details });
  const value = given.pinned ? await lockSecret(given.live, RECIPIENT.accountId, ENTRY_PIN) : given.live;
  await w.storage.setPassword(RECIPIENT.accountId, ENTRY.id, stored(value));
  await holdRotated(w.storage, RECIPIENT.accountId, ENTRY.id, 'password', NEW, await fingerprintOf(OLD));
}

/** Share `node` to the one colleague; `pinned` puts the entry's own PIN first in the input queue. */
async function share(w: World, node: TreeNode, pinned: boolean): Promise<void> {
  ui.inputs = [...(pinned ? [ENTRY_PIN] : []), TRANSIT_PIN, TRANSIT_PIN];
  ui.quickPickAnswers = [[{ member: TEAM_MEMBER }]];
  await w.inbox.shareNodes(RECIPIENT.accountId, [node]);
}

/** The password the recipient reads out of what was delivered. */
function sentPassword(w: World): string | undefined {
  assert.equal(w.delivered.length, 1, `nothing, or more than one item, was delivered: ${ui.infos.concat(ui.errors, ui.modals).join(' | ')}`);
  return (loaded.openShare(w.delivered[0] as never, KEY_ID, TRANSIT_PIN) as { secrets: { password?: string } }).secrets.password;
}

const stillHeld = async (w: World): Promise<boolean> =>
  (await w.storage.heldRotations.read(RECIPIENT.accountId, ENTRY.id)).password !== undefined;

test('sharing a PROTECTED entry with a rotated password waiting sends the new one and says it is now stored, sealed', async () => {
  const w = world();
  await plant(w, { live: OLD, pinned: true });

  await share(w, ENTRY, true);

  assert.equal(sentPassword(w), NEW, 'the share carried the password the rotation replaced');
  assert.match(ui.infos.join('\n'), /The new password of "portal" from .* is now stored, sealed under its PIN\./, 'the share door stored the waiting password without a word');
  assert.equal(await stillHeld(w), false, 'the held value survived its release');
});

test('sharing an UNPROTECTED entry with a rotated password waiting says it is now stored — and not "sealed"', async () => {
  const w = world();
  await plant(w, { live: OLD, pinned: false });

  await share(w, ENTRY, false);

  assert.equal(sentPassword(w), NEW);
  const said = ui.infos.join('\n');
  assert.match(said, /The new password of "portal" from .* is now stored\./, 'the share door stored the waiting password without a word');
  assert.doesNotMatch(said, /sealed/, `a plain slot was said to be sealed: ${said}`);
});

test('a share whose entry changed after the rotation ASKS — and "Store the rotated one" is what the share carries', async () => {
  const w = world();
  await plant(w, { live: OTHER, pinned: true });
  ui.warningAnswer = STORE_ROTATED;

  await share(w, ENTRY, true);

  assert.match(ui.modals.join('\n') || '(nothing asked)', /changed after it/, 'the conflict between the waiting password and the stored one was never asked');
  assert.equal(sentPassword(w), NEW, 'the share carried the password the person had just chosen to replace');
  assert.equal(await stillHeld(w), false);
});

test('a conflict at the share that is dismissed sends the stored value and leaves the rotated one waiting', async () => {
  const w = world();
  await plant(w, { live: OTHER, pinned: true });

  await share(w, ENTRY, true);

  assert.match(ui.modals.join('\n') || '(nothing asked)', /changed after it/);
  assert.equal(sentPassword(w), OTHER);
  assert.equal(await stillHeld(w), true, 'a dismissed question dropped the only copy of the rotated value');
});

test('a FOLDER share releases and says the waiting value of the entry inside it', async () => {
  const w = world();
  await plant(w, { live: OLD, pinned: true });

  await share(w, FOLDER, true);

  assert.equal(sentPassword(w), NEW);
  assert.match(ui.infos.join('\n'), /The new password of "portal" from .* is now stored, sealed under its PIN\./);
});

test('a declined entry PIN at the share still says the share\'s own sentence, sends nothing, and the rotated value keeps waiting', async () => {
  const w = world();
  await plant(w, { live: OLD, pinned: true });
  ui.inputs = [undefined];

  await w.inbox.shareNodes(RECIPIENT.accountId, [ENTRY]);

  assert.deepEqual(w.delivered, []);
  assert.equal(ui.warningsAsked, 1, 'the share\'s own "nothing was shared" was not said, or something else was asked');
  assert.equal(await stillHeld(w), true);
  assert.doesNotMatch(ui.infos.join('\n'), /is now stored/);
});
