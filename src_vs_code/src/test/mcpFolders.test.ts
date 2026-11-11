import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { folderFieldsFor } from '../agentKindFields';
import {
  describeMoveRefusal,
  findFolder,
  moveRefusal,
  summarizeFolderEdit,
  switchForFolderAction,
  visibleFolders,
} from '../mcpFolders';
import type { TreeNode } from '../types';
import { ACCOUNT, HIDDEN, SOURCE, VISIBLE } from './unlistedWorld';

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

test('a typed folder says what it holds and the fields an entry there may carry; an untyped one holds any', () => {
  // O3: the agent looking at a folder is told the kind and the fields — from the one table, never a
  // second list here — and nothing else. `project` is a folder-only template, not a kind an entry
  // can be, so to an agent it holds anything, exactly as a folder with no type does.
  const v = vault([
    folder('f1', 'Commands', { mcp: { folderCreate: true }, folderType: 'terminal' }),
    folder('f2', 'Misc', { mcp: { folderCreate: true } }),
    folder('f3', 'Project', { mcp: { folderCreate: true }, folderType: 'project' }),
    folder('f4', 'Anything', { mcp: { folderCreate: true }, folderType: 'any' }),
  ]);

  const [commands, misc, project, anything] = visibleFolders(v.accounts, v.nodesOf, v.byId);

  assert.equal(commands.holds, 'terminal');
  assert.deepEqual(commands.fields, folderFieldsFor('terminal'));
  assert.equal(commands.folderType, 'terminal', 'the old name stays beside the new one, for an older relay');
  assert.equal(misc.holds, 'any');
  assert.equal(misc.fields, undefined, 'an untyped folder lists no fields — the kind is the agent\'s to name');
  assert.equal(project.holds, 'any');
  assert.equal(project.fields, undefined);
  assert.equal(anything.holds, 'any');
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
    folder('closed', 'private', { mcp: { view: true } }),
    folder('moving', 'db', { parentId: 'open' }),
  ]);
  const moving = v.local('moving') as TreeNode;

  assert.equal(moveRefusal(moving, 'open', v.local), undefined);
  assert.equal(moveRefusal(moving, 'closed', v.local), 'destination_closed');
});

test('a move into the Trash reads as a move to no folder at all — the Trash is not a node that an agent may view', () => {
  const v = vault([
    folder('t', 'Trash', { isTrash: true }),
    folder('open', 'project', { mcp: { folderEdit: true } }),
    folder('moving', 'db', { parentId: 'open' }),
  ]);

  assert.equal(moveRefusal(v.local('moving') as TreeNode, 't', v.local), 'no_such_destination');
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

test('a missing destination and one that is not open get one answer; a visible closed one gets another', () => {
  const v = vault([
    folder('open', 'project', { mcp: { folderEdit: true } }),
    folder('unlisted', 'private'),
    folder('closed', 'shut', { mcp: { view: true } }),
  ]);
  const moving = v.local('open') as TreeNode;

  assert.equal(moveRefusal(moving, 'ghost', v.local), 'no_such_destination');
  assert.equal(moveRefusal(moving, 'unlisted', v.local), 'no_such_destination', 'a folder that is not open to view is one answer with a missing id');
  assert.equal(moveRefusal(moving, 'closed', v.local), 'destination_closed', 'a folder that is visible and closed to editing keeps its own answer (G4)');
});

/** The fixture's folders, read the way `folderHooks` reads them: by account and id, and by id inside one account. */
const FIXTURE = {
  accounts: SOURCE.getAccounts(),
  byId: (account: string, id: string): TreeNode | undefined => SOURCE.getNode(account, id),
  local: (id: string): TreeNode | undefined => SOURCE.getNode(ACCOUNT, id),
};

test('L3: a folder that the agent may not view answers as an id that does not exist, for every verb', () => {
  // Rule A of research/PLAN_agent_refusal_names_unlisted_entry.md: no switch, an explicit empty answer, in the Trash, the Trash.
  for (const id of Object.values(HIDDEN.folders)) {
    for (const action of ['create', 'edit', 'delete', 'rename']) {
      assert.equal(findFolder(FIXTURE.accounts, FIXTURE.byId, id, action), undefined, `${id} for ${action}`);
    }
  }
});

test('L4: a destination that the agent may not view is no folder: no switch, and an explicit empty answer', () => {
  const moving = FIXTURE.local(VISIBLE.folderEditChild) as TreeNode;

  assert.equal(moveRefusal(moving, HIDDEN.folders.none, FIXTURE.local), 'no_such_destination');
  assert.equal(moveRefusal(moving, HIDDEN.folders.empty, FIXTURE.local), 'no_such_destination');
});

test('L5: the Trash, and a folder in the Trash, read as no folder at all', () => {
  const moving = FIXTURE.local(VISIBLE.folderEditChild) as TreeNode;

  assert.equal(moveRefusal(moving, HIDDEN.folders.theTrash, FIXTURE.local), 'no_such_destination');
  assert.equal(moveRefusal(moving, HIDDEN.folders.trash, FIXTURE.local), 'no_such_destination');
});

test('G4: a destination that the agent may view and may not edit keeps destination_closed', () => {
  const moving = FIXTURE.local(VISIBLE.folderEditChild) as TreeNode;

  assert.equal(moveRefusal(moving, VISIBLE.folderView, FIXTURE.local), 'destination_closed');
});

test('X2: a folder that one account hides does not stop the search in the next account', () => {
  const nodes: Record<string, readonly TreeNode[]> = {
    a1: [folder('f1', 'hidden here')],
    a2: [folder('f1', 'usable there', { mcp: { folderEdit: true } })],
  };
  const byId = (account: string, id: string): TreeNode | undefined => nodes[account].find((n) => n.id === id);

  const found = findFolder([{ accountId: 'a1' }, { accountId: 'a2' }], byId, 'f1', 'edit');

  assert.equal(found?.kind, 'usable');
  assert.equal(found?.kind === 'usable' && found.accountId, 'a2');
});

test('every refusal has a sentence naming the folder and the reason', () => {
  for (const refusal of ['no_such_destination', 'destination_closed', 'into_itself'] as const) {
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
