import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_SLOTS } from '../entitySlots';
import { lockSecret } from '../secretEnvelope';
import { emptySnapshot, ProfileSnapshot } from '../syncMerge';
import { SEALABLE_MAPS, protectionDecision, sealedIn } from '../syncPinRule';
import { conflictNotice, protectionConflicts, revisionFromSnapshot } from '../syncProtection';
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

  assert.deepEqual(conflicts, [{ id: 'x', name: 'orest payoneer', protectedNow: true }]);
  assert.deepEqual(revisionFromSnapshot(local, 'x', 7)?.secrets, { password: 'typed here', payment: '{"cvv":"123"}' });
  assert.match(conflictNotice(conflicts[0]), /^"orest payoneer" is protected with its own PIN again: another machine changed it under that PIN while this one held it unprotected\./);
});

test('a concurrent Remove PIN that won is a conflict the other way round, with the mirror sentence', async () => {
  const local = snap({ nodes: [node({ A: 1, B: 2 }, { pinEpoch: 1 })], passwords: { x: await sealed() } });
  const remote = snap({ nodes: [node({ A: 2, B: 1 }, { pinEpoch: 2 })], passwords: { x: 'unwrapped there' } });
  const merged = snap({ nodes: [node({ A: 2, B: 2 }, { pinEpoch: 2 })], passwords: { x: 'unwrapped there' } });

  const [conflict] = protectionConflicts(local, remote, merged);

  assert.equal(conflict?.protectedNow, false);
  assert.match(conflictNotice(conflict), /is no longer protected with its own PIN: another machine removed the PIN while this one changed it under that PIN\./);
});
