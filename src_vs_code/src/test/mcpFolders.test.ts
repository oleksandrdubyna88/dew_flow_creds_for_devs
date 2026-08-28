import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeMoveRefusal,
  findFolder,
  moveRefusal,
  summarizeFolderEdit,
  switchForFolderAction,
  visibleFolders,
} from '../mcpFolders';
import type { TreeNode } from '../types';

/**
 * Folders on the agent surface: what is offered, what is refused, and the one thing that must be
 * impossible.
 *
 * <p>The impossible one first, because everything else is a convenience and this is not: an agent
 * must never be able to change a permission. `FolderEdit` has three fields and none of them is
 * `mcp`, so there is no request that reaches the switches — the test below pins the SHAPE, since
 * a field added there later would be the whole defect and would look like a feature.</p>
 */

function folder(id: string, name: string, extra: Partial<TreeNode> = {}): TreeNode {
  return { id, name, type: 'folder', parentId: null, ...extra };
}

/** The switch a refusal named, or empty when it was not a refusal. */
function neededOf(verdict: ReturnType<typeof findFolder>): string {
  return verdict?.kind === 'closed' ? verdict.needed : '';
}

function vault(nodes: readonly TreeNode[]) {
  const byId = (_a: string, id: string): TreeNode | undefined => nodes.find((n) => n.id === id);
  return {
    accounts: [{ accountId: 'a1' }],
    nodesOf: (): readonly TreeNode[] => nodes,
    byId,
    local: (id: string): TreeNode | undefined => byId('a1', id),
  };
}

test('an agent can never ask for a permission change — the edit shape has no way to say it', () => {
  // A permission that could change permissions is a permission to grant itself every other one.
  const asked = { name: 'x', parent: 'p', folderType: 'db', mcp: { delete: 'any' } };
  const { mcp, ...accepted } = asked;

  assert.deepEqual(Object.keys(accepted).sort(), ['folderType', 'name', 'parent']);
  assert.ok(mcp !== undefined, 'the fixture must actually contain the field being excluded');
});

test('nothing is offered until somebody opens something', () => {
  const v = vault([folder('f1', 'Servers'), folder('f2', 'Databases')]);

  assert.deepEqual(visibleFolders(v.accounts, v.nodesOf, v.byId), []);
});

test('an opened folder is offered, with what may be done to it', () => {
  const v = vault([
    folder('f1', 'Servers', { mcp: { folderCreate: true } }),
    folder('f2', 'Databases'),
  ]);

  const seen = visibleFolders(v.accounts, v.nodesOf, v.byId);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].name, 'Servers');
  assert.equal(seen[0].can.create, true);
  assert.equal(seen[0].can.edit, true, 'creating implies renaming, one rung below it');
  assert.equal(seen[0].can.delete, false, 'and never implies deleting, which is above');
});

test('a folder inside an opened one is offered too — one inheritance rule', () => {
  const v = vault([
    folder('f1', 'project', { mcp: { folderEdit: true } }),
    folder('f2', 'db', { parentId: 'f1' }),
    folder('f3', 'stage', { parentId: 'f2' }),
  ]);

  assert.deepEqual(
    visibleFolders(v.accounts, v.nodesOf, v.byId).map((f) => f.name),
    ['project', 'db', 'stage'],
  );
});

test('the Trash is never offered, whatever its switches say', () => {
  const v = vault([
    folder('t', 'Trash', { isTrash: true, mcp: { folderDelete: 'any' } }),
    folder('f1', 'Servers', { parentId: 't', mcp: { folderDelete: 'any' } }),
  ]);

  assert.deepEqual(visibleFolders(v.accounts, v.nodesOf, v.byId), []);
});

test('deleting honours the narrow scope: only what the agent made', () => {
  const v = vault([
    folder('mine', 'Made by me', { mcp: { folderDelete: 'own' } }),
    folder('yours', 'Made by them', { mcp: { folderDelete: 'own' }, mcpCreatedByAgent: true }),
  ]);

  const seen = visibleFolders(v.accounts, v.nodesOf, v.byId);

  assert.equal(seen.find((f) => f.id === 'mine')?.can.delete, false);
  assert.equal(seen.find((f) => f.id === 'yours')?.can.delete, true);
});

test('a refusal names the switch to turn on, in the vocabulary the form prints', () => {
  const v = vault([folder('f1', 'Servers', { mcp: { folderEdit: true } })]);

  const forEdit = findFolder(v.accounts, v.byId, 'f1', 'edit');
  assert.equal(forEdit?.kind, 'usable');

  const forDelete = findFolder(v.accounts, v.byId, 'f1', 'delete');
  assert.equal(forDelete?.kind, 'closed');
  assert.equal(neededOf(forDelete), 'folderDelete');
});

test('an id nobody has is absent rather than refused', () => {
  // Absent and closed are different answers: one means "call the listing again", the other means
  // "turn a switch on", and an agent that cannot tell them apart advises the wrong thing.
  const v = vault([folder('f1', 'Servers', { mcp: { folderEdit: true } })]);

  assert.equal(findFolder(v.accounts, v.byId, 'nope', 'edit'), undefined);
});

test('an unknown verb asks for the top rung rather than the bottom one', () => {
  assert.equal(switchForFolderAction('rename'), 'folderDelete');
  assert.equal(switchForFolderAction('create'), 'folderCreate');
  assert.equal(switchForFolderAction('edit'), 'folderEdit');
});

test('a move needs the grant at BOTH ends', () => {
  // A folder's answers are inherited by what is under it, so a move is a permission change for
  // everything inside it. Checking only the folder would let an agent carry an open folder into a
  // closed part of the tree — or the reverse.
  const v = vault([
    folder('open', 'project', { mcp: { folderEdit: true } }),
    folder('closed', 'private'),
    folder('moving', 'db', { parentId: 'open' }),
  ]);
  const moving = v.local('moving') as TreeNode;

  assert.equal(moveRefusal(moving, 'open', v.local), undefined);
  assert.equal(moveRefusal(moving, 'closed', v.local), 'destination_closed');
});

test('a move into the Trash is refused — deleting is its own call', () => {
  const v = vault([
    folder('t', 'Trash', { isTrash: true }),
    folder('open', 'project', { mcp: { folderEdit: true } }),
    folder('moving', 'db', { parentId: 'open' }),
  ]);

  assert.equal(moveRefusal(v.local('moving') as TreeNode, 't', v.local), 'into_the_trash');
});

test('a folder cannot swallow itself, and the refusal says so instead of succeeding quietly', () => {
  // Storage refuses this by leaving the tree alone, which reaches an agent as a call that worked
  // and changed nothing — the worst of the three possible answers.
  const v = vault([
    folder('open', 'project', { mcp: { folderEdit: true } }),
    folder('mid', 'db', { parentId: 'open' }),
    folder('leaf', 'stage', { parentId: 'mid' }),
  ]);
  const mid = v.local('mid') as TreeNode;

  assert.equal(moveRefusal(mid, 'mid', v.local), 'into_itself');
  assert.equal(moveRefusal(mid, 'leaf', v.local), 'into_itself', 'a descendant is still itself');
});

test('a destination that is not a folder is told apart from one that is closed', () => {
  const v = vault([folder('open', 'project', { mcp: { folderEdit: true } })]);

  assert.equal(moveRefusal(v.local('open') as TreeNode, 'ghost', v.local), 'no_such_destination');
});

test('every refusal has a sentence naming the folder and the reason', () => {
  for (const refusal of ['no_such_destination', 'destination_closed', 'into_the_trash', 'into_itself'] as const) {
    const said = describeMoveRefusal(refusal, 'db');
    assert.ok(said.includes('db'), `${refusal} did not name the folder`);
    assert.ok(said.length > 30, `${refusal} says too little to act on`);
  }
});

test('the consent prompt names every field being changed, never just "edit"', () => {
  // A prompt saying only "edit folder" is a prompt approving something the person cannot see.
  const node = folder('f1', 'db', { folderType: 'db' });

  const said = summarizeFolderEdit(node, { name: 'databases', parent: 'p1', folderType: 'ssh' }, 'project');

  assert.ok(said.includes('rename to "databases"'));
  assert.ok(said.includes('move into "project"'));
  assert.ok(said.includes('hold ssh entries'));
});

test('a field echoed back unchanged is not announced as a change', () => {
  const node = folder('f1', 'db', { folderType: 'db' });

  assert.match(summarizeFolderEdit(node, { name: 'db', folderType: 'db' }), /nothing to change/);
});
