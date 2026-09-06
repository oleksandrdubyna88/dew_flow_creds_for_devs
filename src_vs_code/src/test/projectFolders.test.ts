import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PendingFolderRemovalFact,
  ProjectAssignmentFact,
  nothingToDo,
  projectFolderNodeId,
  reconcileProjectFolders,
} from '../projectFolders';
import { TreeNode } from '../types';

const ACCOUNT = 'acct-1';
const ATLAS = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOREALIS = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function folder(over: Partial<TreeNode> = {}): TreeNode {
  return { id: 'node-1', name: 'Atlas', type: 'folder', ...over };
}

function assigned(projectId: string, name: string): ProjectAssignmentFact {
  return { projectId, name };
}

function removal(projectId: string, deleteFolder = true): PendingFolderRemovalFact {
  return { projectId, deleteFolder };
}

function reconcile(
  nodes: readonly TreeNode[],
  assignments: readonly ProjectAssignmentFact[],
  removals: readonly PendingFolderRemovalFact[] = [],
) {
  return reconcileProjectFolders(nodes, assignments, removals, ACCOUNT);
}

test('nothing assigned and nothing present is nothing to do', () => {
  assert.equal(nothingToDo(reconcile([], [])), true);
});

test('an assignment with no folder creates one, named as the server names it', () => {
  const plan = reconcile([], [assigned(ATLAS, 'Atlas')]);

  assert.deepEqual(plan.toCreate, [
    { nodeId: projectFolderNodeId(ACCOUNT, ATLAS), projectId: ATLAS, name: 'Atlas' },
  ]);
  assert.equal(plan.toRename.length, 0);
  assert.equal(plan.toDelete.length, 0);
});

test('the same assignment on the next cycle creates nothing — idempotent by projectId, not by name', () => {
  const here = folder({ id: projectFolderNodeId(ACCOUNT, ATLAS), projectId: ATLAS, name: 'Atlas' });

  assert.equal(nothingToDo(reconcile([here], [assigned(ATLAS, 'Atlas')])), true);
});

test('two machines derive the same node id, which is the whole reason it is derived', () => {
  assert.equal(projectFolderNodeId(ACCOUNT, ATLAS), projectFolderNodeId(ACCOUNT, ATLAS));
  assert.notEqual(projectFolderNodeId(ACCOUNT, ATLAS), projectFolderNodeId(ACCOUNT, BOREALIS));
  assert.notEqual(projectFolderNodeId('acct-2', ATLAS), projectFolderNodeId(ACCOUNT, ATLAS));
  assert.match(projectFolderNodeId(ACCOUNT, ATLAS), /^[0-9a-f]{32}$/);
});

test("a project renamed on the server renames the folder, and a local rename does not survive it", () => {
  const renamedHere = folder({ id: 'node-1', projectId: ATLAS, name: 'my stuff' });

  const plan = reconcile([renamedHere], [assigned(ATLAS, 'Atlas II')]);

  assert.deepEqual(plan.toRename, [{ nodeId: 'node-1', name: 'Atlas II' }]);
  assert.equal(plan.toCreate.length, 0);
});

test('an assignment that quietly ended deletes nothing and unlocks the folder', () => {
  // What ?deleteFolder=false means: the copy stays with the person. Left locked it would be a folder
  // they can never rename or move again, on behalf of a relationship that is over.
  const kept = folder({ id: 'node-1', projectId: ATLAS });

  const plan = reconcile([kept], []);

  assert.deepEqual(plan.toUnlock, [{ nodeId: 'node-1' }]);
  assert.equal(plan.toDelete.length, 0);
  assert.equal(plan.toAck.length, 0);
});

test('a removal instruction deletes the folder and is acknowledged', () => {
  const here = folder({ id: 'node-1', projectId: ATLAS });

  const plan = reconcile([here], [], [removal(ATLAS)]);

  assert.deepEqual(plan.toDelete, [{ nodeId: 'node-1', projectId: ATLAS }]);
  assert.deepEqual(plan.toAck, [ATLAS]);
  assert.equal(plan.toUnlock.length, 0, 'a folder that is going does not need unlocking first');
});

test('a removal for a folder this machine does not hold still deletes the derived id', () => {
  // The plan round's case: a machine that has just merged a peer's vault holds the folder, but one
  // that has not must still push a tombstone — or acking would clear the instruction for everyone
  // while the peer keeps the folder forever.
  const plan = reconcile([], [], [removal(ATLAS)]);

  assert.deepEqual(plan.toDelete, [
    { nodeId: projectFolderNodeId(ACCOUNT, ATLAS), projectId: ATLAS },
  ]);
  assert.deepEqual(plan.toAck, [ATLAS]);
});

test('a removal that says to keep the folder deletes nothing and is still acknowledged', () => {
  // This server never writes one, but a record it cannot act on must not be unacknowledgeable
  // forever — that would re-send the same instruction on every cycle for the life of the account.
  const here = folder({ id: 'node-1', projectId: ATLAS });

  const plan = reconcile([here], [], [removal(ATLAS, false)]);

  assert.equal(plan.toDelete.length, 0);
  assert.deepEqual(plan.toAck, [ATLAS]);
});

test('a removal wins over an assignment for the same project, and creates nothing', () => {
  // The order an admin can produce: unassign with the folder removed, then re-assign, both before
  // this machine syncs. The instruction is the newer fact about the folder; the next cycle sees the
  // assignment with the instruction gone and creates it again.
  const plan = reconcile([], [assigned(ATLAS, 'Atlas')], [removal(ATLAS)]);

  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.toDelete.length, 1);
});

test('a folder somebody made themselves is never touched', () => {
  const mine = folder({ id: 'node-9', name: 'My keys', projectId: undefined });

  assert.equal(nothingToDo(reconcile([mine], [])), true);
});

test('an assignment the server could not name still gets a readable folder', () => {
  const plan = reconcile([], [assigned(ATLAS, '   ')]);

  assert.equal(plan.toCreate[0].name, 'Project ' + ATLAS.slice(0, 8));
});

test('an assignment with no project id at all is ignored rather than creating a nameless folder', () => {
  assert.equal(nothingToDo(reconcile([], [assigned('', 'Nothing')])), true);
});

test('several projects at once are each their own node', () => {
  const plan = reconcile([], [assigned(ATLAS, 'Atlas'), assigned(BOREALIS, 'Borealis')]);

  assert.equal(plan.toCreate.length, 2);
  assert.notEqual(plan.toCreate[0].nodeId, plan.toCreate[1].nodeId);
});
