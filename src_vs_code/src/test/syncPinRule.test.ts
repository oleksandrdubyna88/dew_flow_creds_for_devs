import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_SLOTS } from '../entitySlots';
import { lockSecret } from '../secretEnvelope';
import { emptySnapshot, mergeProfiles, ProfileSnapshot } from '../syncMerge';
import { SEALABLE_MAPS, protectionDecision, sealedIn } from '../syncPinRule';
import { conflictNotice, keepProtectionLosers, protectionConflicts, revisionFromSnapshot } from '../syncProtection';
import { TreeNode } from '../types';

/**
 * The pure halves of D12 (entry-PIN plan §5.9): what "sealed" means to the merge, the protection
 * decision as one node patch, and which ids count as a LOST local edit worth keeping.
 */

let sealedValue: Promise<string> | undefined;
const sealed = (): Promise<string> => (sealedValue ??= lockSecret('the card', 'a1', '1234'));

function node(v: Record<string, number>, over: Partial<TreeNode> = {}): TreeNode {
  return { id: 'x', name: 'orest payoneer', type: 'entity', updatedAt: 1, v, details: { id: 'x', name: 'orest payoneer', isSshEnabled: false }, ...over } as TreeNode;
}

function snap(partial: Partial<ProfileSnapshot>): ProfileSnapshot {
  return { ...emptySnapshot(), ...partial };
}

test('the merge judges exactly the slots the PIN wraps — every slot of the table, no attachment, no image', () => {
  assert.equal(SEALABLE_MAPS.length, SECRET_SLOTS.length, 'a slot the merge cannot see sealed is a slot it can unwrap');
  assert.ok(!SEALABLE_MAPS.includes('attachments') && !SEALABLE_MAPS.includes('images'));
});

test('"sealed" is read from the envelopes, never from the mark', async () => {
  const markOnly = snap({ nodes: [node({ A: 1 }, { details: { id: 'x', name: 'n', isSshEnabled: false, pinProtected: true } as never })], passwords: { x: 'plain' } });
  const envelopeOnly = snap({ nodes: [node({ A: 1 })], notes: { x: await sealed() } });

  assert.equal(sealedIn(markOnly, 'x'), false, 'a mark over plaintext is a mirror that lies');
  assert.equal(sealedIn(envelopeOnly, 'x'), true, 'an envelope with no mark is the truth');
});

test('a protection decision is the mark and one more count, in one patch', () => {
  const protectedOnce = { ...node({ A: 1 }), ...protectionDecision(true)(node({ A: 1 })) } as TreeNode;
  const removed = { ...protectedOnce, ...protectionDecision(false)(protectedOnce) } as TreeNode;

  assert.deepEqual([protectedOnce.details?.pinProtected, protectedOnce.pinEpoch], [true, 1]);
  assert.deepEqual([removed.details?.pinProtected, removed.pinEpoch], [undefined, 2]);
});

test('a remote Protect that DOMINATES this machine is not a conflict — nothing was lost here', async () => {
  const local = snap({ nodes: [node({ A: 1 })], passwords: { x: 'plain' } });
  const remote = snap({ nodes: [node({ A: 2 }, { pinEpoch: 1 })], passwords: { x: await sealed() } });

  assert.deepEqual(protectionConflicts(local, remote, remote), []);
});

test('a concurrent Protect that won IS a conflict, and this machine’s copy becomes a revision with every value it held', async () => {
  const local = snap({ nodes: [node({ A: 1, B: 2 })], passwords: { x: 'typed here' }, payments: { x: '{"cvv":"123"}' } });
  const remote = snap({ nodes: [node({ A: 2, B: 1 }, { pinEpoch: 1 })], passwords: { x: await sealed() } });
  const merged = snap({ nodes: [node({ A: 2, B: 2 }, { pinEpoch: 1 })], passwords: { x: await sealed() } });

  const conflicts = protectionConflicts(local, remote, merged);

  assert.deepEqual(conflicts, [{ id: 'x', name: 'orest payoneer', won: 'protect' }]);
  assert.deepEqual(revisionFromSnapshot(local, 'x', 7)?.secrets, { password: 'typed here', payment: '{"cvv":"123"}' });
  assert.match(conflictNotice(conflicts[0]), /^"orest payoneer" is protected with its own PIN again: another machine changed it under that PIN while this one held it unprotected\./);
});

test('a concurrent Remove PIN that won is a conflict the other way round, with the mirror sentence', async () => {
  const local = snap({ nodes: [node({ A: 1, B: 2 }, { pinEpoch: 1 })], passwords: { x: await sealed() } });
  const remote = snap({ nodes: [node({ A: 2, B: 1 }, { pinEpoch: 2 })], passwords: { x: 'unwrapped there' } });
  const merged = snap({ nodes: [node({ A: 2, B: 2 }, { pinEpoch: 2 })], passwords: { x: 'unwrapped there' } });

  const [conflict] = protectionConflicts(local, remote, merged);

  assert.equal(conflict?.won, 'unprotect');
  assert.match(conflictNotice(conflict), /is no longer protected with its own PIN: another machine removed the PIN while this one changed it under that PIN\./);
});

let otherPinValue: Promise<string> | undefined;
const sealedUnderOtherPin = (): Promise<string> => (otherPinValue ??= lockSecret('the card, changed there', 'a1', '9999'));

/** Both machines edited the entry under a PIN, concurrently; the second is newer and wins the node. */
async function sealedRace(): Promise<{ loser: ProfileSnapshot; winner: ProfileSnapshot }> {
  const loser = snap({ nodes: [node({ A: 2, B: 1 }, { pinEpoch: 1, updatedAt: 100 })], passwords: { x: await sealed() }, notes: { x: await sealed() } });
  const winner = snap({ nodes: [node({ A: 1, B: 2 }, { pinEpoch: 1, updatedAt: 200 })], passwords: { x: await sealedUnderOtherPin() } });
  return { loser, winner };
}

test('two concurrent SEALED edits: the machine whose values lost keeps them — the sealed state never changed, the values did', async () => {
  const { loser, winner } = await sealedRace();
  const merged = mergeProfiles(loser, winner, 1).merged;

  const conflicts = protectionConflicts(loser, winner, merged);

  assert.deepEqual(conflicts.map((one) => [one.id, one.won]), [['x', 'other-sealed-edit']], 'a sealed edit that lost must be kept, not dropped in silence');
  assert.deepEqual(revisionFromSnapshot(loser, 'x', 7)?.secrets, { password: await sealed(), notes: await sealed() });
  assert.match(conflictNotice(conflicts[0]), /^"orest payoneer" was changed under its PIN on another machine while this one changed it too, and the other machine’s version was kept\./);
});

test('two concurrent SEALED edits, the other way round: the machine whose values WON records nothing', async () => {
  const { loser, winner } = await sealedRace();
  const merged = mergeProfiles(winner, loser, 1).merged;

  assert.deepEqual(protectionConflicts(winner, loser, merged), [], 'nothing of this machine was discarded');
});

test('keepProtectionLosers records the losing sealed edit before the merge is applied, once per entry', async () => {
  const { loser, winner } = await sealedRace();
  const recorded: string[] = [];
  const storage = { recordRevision: async (_a: string, id: string): Promise<void> => { recorded.push(id); } };

  const conflicts = await keepProtectionLosers(storage, 'a1', loser, winner, mergeProfiles(loser, winner, 1).merged, 7);

  assert.deepEqual([recorded, conflicts.length], [['x'], 1]);
});

test('the review’s case, in both argument orders: a newer sealed winner from a build with no `seconds` map — the second value stays, and only the loser records a conflict', async () => {
  const { loser, winner } = await sealedRace();
  const oldBuild: Partial<ProfileSnapshot> = { ...winner };
  delete oldBuild.seconds;
  const holdsSecond = { ...loser, seconds: { x: await sealed() } };

  const onLoser = mergeProfiles(holdsSecond, oldBuild as ProfileSnapshot, 1).merged;
  const onWinner = mergeProfiles(oldBuild as ProfileSnapshot, holdsSecond, 1).merged;

  assert.deepEqual([onLoser.seconds?.x, onWinner.seconds?.x], [await sealed(), await sealed()], 'an absent map is not a deletion');
  assert.deepEqual(protectionConflicts(holdsSecond, oldBuild as ProfileSnapshot, onLoser).map((one) => one.id), ['x'], 'the losing sealed password is kept');
  assert.deepEqual(protectionConflicts(oldBuild as ProfileSnapshot, holdsSecond, onWinner), [], 'the winner lost nothing');
});
