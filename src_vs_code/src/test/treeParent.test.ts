import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parentOf } from '../treeParent';
import { StoredAccount, TreeNode } from '../types';

/**
 * The walk `TreeView.reveal` needs.
 *
 * <p>Worth its own file because `getParent` has never existed in this extension — Quick Open
 * opens the viewer instead of selecting a row precisely because it could not walk to one. The
 * cases below are the ones a reveal fails on silently: a parent that no longer resolves, an
 * account that is gone, and the synthetic rows that have no walkable parent at all.</p>
 */

const ACCOUNT: StoredAccount = {
  accountId: 'a1',
  email: 'one@example.com',
  provider: 'microsoft',
};

const FOLDER: TreeNode = { id: 'f1', name: 'ssh connections', type: 'folder', parentId: null };
const ENTITY: TreeNode = {
  id: 'e1',
  name: 'access-server',
  type: 'entity',
  parentId: 'f1',
  details: { id: 'e1', name: 'access-server', isSshEnabled: true },
};

const source = {
  getNode: (_a: string, id: string): TreeNode | undefined =>
    [FOLDER, ENTITY].find((n) => n.id === id),
  getAccount: (): StoredAccount | undefined => ACCOUNT,
};

test('an entity walks up to its folder', () => {
  const parent = parentOf({ kind: 'node', accountId: 'a1', node: ENTITY }, source);
  assert.deepEqual(parent, { kind: 'node', accountId: 'a1', node: FOLDER });
});

test('a root folder walks up to its account', () => {
  const parent = parentOf({ kind: 'node', accountId: 'a1', node: FOLDER }, source);
  assert.deepEqual(parent, { kind: 'account', account: ACCOUNT });
});

test('a parent that no longer resolves reads as the account root, never as a throw', () => {
  // `parentId` arrives by sync and by import — it is data, not an invariant. A reveal that
  // threw in here would fail inside VS Code with nothing to look at.
  const orphan: TreeNode = { id: 'e9', name: 'orphan', type: 'entity', parentId: 'gone' };
  const parent = parentOf({ kind: 'node', accountId: 'a1', node: orphan }, source);
  assert.deepEqual(parent, { kind: 'account', account: ACCOUNT });
});

test('an account that is gone ends the walk instead of naming nothing', () => {
  const noAccount = { ...source, getAccount: (): StoredAccount | undefined => undefined };
  assert.equal(parentOf({ kind: 'node', accountId: 'a1', node: FOLDER }, noAccount), undefined);
});

test('a revision row and the dependents header both hang under their entity', () => {
  const owner = { kind: 'node', accountId: 'a1', node: ENTITY };
  assert.deepEqual(
    parentOf({ kind: 'revision', accountId: 'a1', node: ENTITY, index: 0 }, source),
    owner,
  );
  assert.deepEqual(parentOf({ kind: 'dependents', accountId: 'a1', node: ENTITY }, source), owner);
});

test('a folder inside the sub-tree hangs under the dependents header of its target', () => {
  const parent = parentOf(
    {
      kind: 'dependentsFolder',
      accountId: 'a1',
      targetId: 'e1',
      folderId: 'f1',
      name: 'ssh connections',
      entities: [],
    },
    source,
  );
  assert.deepEqual(parent, { kind: 'dependents', accountId: 'a1', node: ENTITY });
});

test('a shadow row answers nothing, because nothing reveals one', () => {
  // The button navigates to the REAL folder, which is a plain node. Rebuilding this row's
  // parent would mean rebuilding the whole folder grouping to get at its entity list.
  assert.equal(
    parentOf({ kind: 'dependentEntity', accountId: 'a1', targetId: 'v1', node: ENTITY }, source),
    undefined,
  );
});

test('the filter row has no parent', () => {
  assert.equal(parentOf({ kind: 'search' }, source), undefined);
});
