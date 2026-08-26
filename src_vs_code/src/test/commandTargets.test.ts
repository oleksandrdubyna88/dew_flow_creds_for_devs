import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  asElement,
  collectJumpCandidates,
  folderKindOf,
  resolveBulkTargets,
} from '../commandTargets';
import { TreeNode } from '../types';

/**
 * Turning what a command was invoked with into what it may act on (audit A3).
 *
 * <p>These four lived unexported inside `extension.ts` — 3,500 lines nobody can load in a unit
 * test — and were the reason that file was recorded as an open gap rather than as covered. None
 * of them touches `vscode`, so moving them out made them plain functions with plain inputs.</p>
 *
 * <p><b>`asElement` is the gate every command passes through.</b> VS Code hands a command
 * whatever the invocation carried: a tree element from a context menu, `undefined` from the
 * palette, and for a multi-select action a second array that may hold rows of any kind. Every
 * shape is checked for the fields the commands will actually read, so a malformed argument
 * becomes `undefined` here instead of a property access on nothing several frames later.</p>
 *
 * <p>Two of its answers are decisions rather than validation, and both are pinned below: a
 * shadow row is NARROWED to the plain node element, so every command reachable on the real row
 * works on it with no second code path; and the account-root group of the dependents sub-tree
 * is deliberately refused, because the command bound to a folder group has nowhere to go from
 * there.</p>
 */

function entity(id: string, name: string, details: Record<string, unknown> = {}): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    parentId: null,
    details: { id, name, kind: 'ssh', isSshEnabled: false, ...details },
  } as unknown as TreeNode;
}

function folder(id: string, name: string, folderType?: string): TreeNode {
  return { id, name, type: 'folder', parentId: null, folderType } as unknown as TreeNode;
}

function storageOf(nodes: TreeNode[]): never {
  return {
    getNodes: (): readonly TreeNode[] => nodes,
    getNode: (_a: string, id: string): TreeNode | undefined => nodes.find((n) => n.id === id),
  } as never;
}

const nodeElement = (id = 'e1'): unknown => ({
  kind: 'node',
  accountId: 'a1',
  node: entity(id, id),
});

test('a non-object argument is refused — the palette invokes with nothing at all', () => {
  // Every command can be run from the palette, where there is no row and no argument.
  for (const value of [undefined, null, 'a string', 42, true]) {
    assert.equal(asElement(value), undefined, String(value));
  }
});

test('an element whose kind is unknown is refused', () => {
  assert.equal(asElement({ kind: 'something-new', accountId: 'a1' }), undefined);
});

test('each row kind is accepted only with the fields its commands will read', () => {
  // The check is per shape rather than "has a kind", because the failure it prevents is a
  // command reading `.node.id` off a row that has no node.
  assert.ok(asElement({ kind: 'account', account: { accountId: 'a1' } }) !== undefined);
  assert.ok(asElement(nodeElement()) !== undefined);
  assert.ok(asElement({ kind: 'sharedRoot' }) !== undefined);
  assert.ok(asElement({ kind: 'sharedSender', email: 'peer@corp.com' }) !== undefined);

  assert.equal(asElement({ kind: 'account' }), undefined, 'an account row with no account');
  assert.equal(asElement({ kind: 'node', accountId: 'a1' }), undefined, 'a node row with no node');
  assert.equal(asElement({ kind: 'sharedSender' }), undefined, 'a sender row with no email');
});

test('a revision row needs its INDEX — without one there is no version to open', () => {
  const withIndex = { kind: 'revision', accountId: 'a1', node: entity('e1', 'e1'), index: 0 };
  const without = { kind: 'revision', accountId: 'a1', node: entity('e1', 'e1') };

  assert.ok(asElement(withIndex) !== undefined);
  assert.equal(asElement(without), undefined);
});

test('index 0 is a valid revision — a falsy check would hide the newest version', () => {
  // `typeof v.index === 'number'` rather than a truthiness test, and this is what holds it
  // there: 0 is the first row under the twisty.
  assert.ok(asElement({ kind: 'revision', accountId: 'a1', node: entity('e1', 'e1'), index: 0 }) !== undefined);
});

test('a SHADOW row is narrowed to the plain node it stands for', () => {
  // The sub-tree is a place to act, not a picture: every command already reachable on the real
  // row works here, with no second code path and no second contextValue to keep in step.
  const shadow = { kind: 'dependentEntity', accountId: 'a1', node: entity('e1', 'api') };

  const resolved = asElement(shadow);

  assert.equal(resolved?.kind, 'node', 'it arrives as an ordinary node row');
  assert.equal((resolved as { node: TreeNode }).node.id, 'e1');
});

test('a dependents FOLDER group is kept as itself — it has its own command', () => {
  const group = { kind: 'dependentsFolder', accountId: 'a1', targetId: 't1', folderId: 'f1' };

  assert.equal(asElement(group)?.kind, 'dependentsFolder');
});

test('the ACCOUNT-ROOT group is refused, because "go to the folder" has nowhere to go', () => {
  // Its folderId is null and its contextValue is `dependentsRoot`, which no command binds to.
  // Accepting it here would be a command that runs and does nothing.
  const root = { kind: 'dependentsFolder', accountId: 'a1', targetId: 't1', folderId: null };

  assert.equal(asElement(root), undefined);
});

test('a new entity inherits the kind of the folder it is created in', () => {
  const storage = storageOf([folder('f1', 'Databases', 'db')]);

  assert.equal(folderKindOf(storage, 'a1', 'f1'), 'db');
});

test('at the account root nothing is inherited — and null and undefined both mean root', () => {
  // A root parent arrives as `null` from a tree element and as `undefined` from the palette.
  const storage = storageOf([folder('f1', 'Databases', 'db')]);

  assert.equal(folderKindOf(storage, 'a1', null), undefined);
  assert.equal(folderKindOf(storage, 'a1', undefined), undefined);
});

test('an "any" or "project" folder dictates no kind', () => {
  // `project` is a folder-only type: forcing its entities to kind "project" would invent an
  // entity kind that does not exist.
  const storage = storageOf([folder('f1', 'Mixed', 'any'), folder('f2', 'Client', 'project')]);

  assert.equal(folderKindOf(storage, 'a1', 'f1'), undefined);
  assert.equal(folderKindOf(storage, 'a1', 'f2'), undefined);
});

test('a parent that no longer exists inherits nothing rather than throwing', () => {
  const storage = storageOf([]);

  assert.equal(folderKindOf(storage, 'a1', 'deleted-folder'), undefined);
});

test('a bulk action invoked on something that is not a node acts on NOTHING', () => {
  // A delete command reaching a shared item or a folder group must do nothing, not something
  // surprising.
  const storage = storageOf([entity('e1', 'prod')]);

  for (const anchor of [{ kind: 'sharedRoot' }, { kind: 'account', account: { accountId: 'a1' } }, undefined]) {
    assert.deepEqual(resolveBulkTargets(storage, anchor, []), { targets: [], skippedNote: '' });
  }
});

test('a bulk action on a single row acts on that row', () => {
  const node = entity('e1', 'prod');
  const storage = storageOf([node]);

  const resolved = resolveBulkTargets(storage, { kind: 'node', accountId: 'a1', node }, undefined);

  assert.deepEqual(resolved.targets.map((t) => t.node.id), ['e1']);
});

test('rows of another kind inside a selection are dropped, and the drop is REPORTED', () => {
  // Silently acting on three of five selected rows is the version of this that gets noticed
  // after the fact.
  const first = entity('e1', 'prod');
  const second = entity('e2', 'staging');
  const storage = storageOf([first, second]);

  const resolved = resolveBulkTargets(
    storage,
    { kind: 'node', accountId: 'a1', node: first },
    [
      { kind: 'node', accountId: 'a1', node: first },
      { kind: 'node', accountId: 'a1', node: second },
      { kind: 'sharedRoot' },
    ],
  );

  assert.deepEqual(resolved.targets.map((t) => t.node.id).sort(), ['e1', 'e2']);
  assert.ok(resolved.skippedNote.length > 0, 'the skipped row is mentioned');
});

test('a selection that is not an array at all is treated as a single click', () => {
  const node = entity('e1', 'prod');
  const storage = storageOf([node]);

  const resolved = resolveBulkTargets(storage, { kind: 'node', accountId: 'a1', node }, 'not an array');

  assert.deepEqual(resolved.targets.map((t) => t.node.id), ['e1']);
});

test('a jump host must be SSH-enabled AND have a host', () => {
  // Offering anything else produces a chain that fails at connect time with an error about the
  // wrong hop — which is the hardest kind of connection problem to read.
  const storage = storageOf([
    entity('good', 'bastion', { isSshEnabled: true, host: 'bastion.corp.com' }),
    entity('no-host', 'ssh but no host', { isSshEnabled: true }),
    entity('not-ssh', 'a password', { host: 'db.corp.com' }),
    folder('f1', 'a folder'),
  ]);

  assert.deepEqual(collectJumpCandidates(storage, 'a1', 'me').map((c) => c.id), ['good']);
});

test('an entity is never offered as its OWN jump host', () => {
  // A chain through itself is a loop `ssh` cannot resolve.
  const storage = storageOf([entity('me', 'prod', { isSshEnabled: true, host: 'prod.corp.com' })]);

  assert.deepEqual(collectJumpCandidates(storage, 'a1', 'me'), []);
});

test('a candidate carries the name a person will recognise, not just its id', () => {
  const storage = storageOf([entity('b1', 'Bastion (EU)', { isSshEnabled: true, host: 'h' })]);

  assert.deepEqual(collectJumpCandidates(storage, 'a1', 'me'), [{ id: 'b1', name: 'Bastion (EU)' }]);
});
