import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EXPANSION_KEY,
  ExpansionMemory,
  ExpansionStore,
  MAX_REMEMBERED,
  expansionKey,
} from '../treeExpansion';
import { StoredAccount, TreeNode } from '../types';

/**
 * The tree remembering what was open.
 *
 * <p>It did not, in two opposite ways at once: an account row was drawn `Expanded`
 * unconditionally, so collapsing one re-opened it on the next repaint, and a folder was drawn
 * `Collapsed` unconditionally, so opening one closed it again. Both are defaults now, and a
 * default is only used for a row nobody has touched — which is the single behaviour every test
 * below is circling.</p>
 */

function fakeStore(initial: Record<string, unknown> = {}): ExpansionStore & { written: number } {
  const held: Record<string, unknown> = { ...initial };
  return {
    written: 0,
    get<T>(key: string, fallback: T): T {
      return (held[key] as T) ?? fallback;
    },
    async update(key: string, value: unknown): Promise<void> {
      held[key] = value;
      this.written += 1;
    },
  };
}

const ACCOUNT: StoredAccount = { accountId: 'a1', email: 'one@example.com', provider: 'microsoft' };
const FOLDER: TreeNode = { id: 'f1', name: 'vpn', type: 'folder', parentId: null };

test('an untouched account is open and an untouched folder is closed', () => {
  const memory = new ExpansionMemory(fakeStore());
  assert.equal(memory.isOpen('account:a1', true), true);
  assert.equal(memory.isOpen('node:a1:f1', false), false);
});

test('a collapsed account STAYS collapsed — the defect this was written for', async () => {
  // `Expanded` was hard-coded, so a repaint re-opened it. A repaint happens on every edit, every
  // pulled sync and every keystroke in the filter, which is why it read as "it never closes".
  const memory = new ExpansionMemory(fakeStore());
  await memory.set('account:a1', false);
  assert.equal(memory.isOpen('account:a1', true), false);
});

test('an opened folder stays open, which it never did', async () => {
  const memory = new ExpansionMemory(fakeStore());
  await memory.set('node:a1:f1', true);
  assert.equal(memory.isOpen('node:a1:f1', false), true);
});

test('what was open survives a reload — a second memory over the same store agrees', async () => {
  // The actual requirement: not a reload, not a reboot. Modelled by building a fresh memory over
  // the store the first one wrote, which is exactly what activation does.
  const store = fakeStore();
  const before = new ExpansionMemory(store);
  await before.set('node:a1:f1', true);
  await before.set('account:a1', false);

  const after = new ExpansionMemory(store);
  assert.equal(after.isOpen('node:a1:f1', false), true);
  assert.equal(after.isOpen('account:a1', true), false);
});

test('setting what is already held writes nothing', async () => {
  // Expansion events arrive in bursts while a tree paints; a memento write per row would be a
  // cross-process call per row.
  const store = fakeStore();
  const memory = new ExpansionMemory(store);
  await memory.set('node:a1:f1', true);
  const afterFirst = store.written;
  await memory.set('node:a1:f1', true);
  assert.equal(store.written, afterFirst);
});

test('a row with no key is ignored rather than stored under undefined', async () => {
  const store = fakeStore();
  const memory = new ExpansionMemory(store);
  await memory.set(undefined, true);
  assert.equal(store.written, 0);
  assert.equal(memory.isOpen(undefined, true), true);
  assert.equal(memory.isOpen(undefined, false), false);
});

test('the memory is bounded, oldest first', async () => {
  // Loaded full in one go rather than by MAX_REMEMBERED separate writes: each write copies the
  // map, so driving the bound through the front door made this test alone take seven seconds —
  // which says nothing about the bound and a lot about how a test can quietly become the
  // slowest thing in a suite.
  const full = Object.fromEntries(
    Array.from({ length: MAX_REMEMBERED }, (_, i) => [`node:a1:e${i}`, true]),
  );
  const store = fakeStore({ [EXPANSION_KEY]: full });
  const memory = new ExpansionMemory(store);

  await memory.set('node:a1:one-too-many', true);

  const held = store.get<Record<string, boolean>>(EXPANSION_KEY, {});
  assert.equal(Object.keys(held).length, MAX_REMEMBERED);
  assert.equal(held['node:a1:e0'], undefined, 'the oldest entry should have been dropped');
  assert.equal(held['node:a1:one-too-many'], true);
});

test('every expandable row kind has a key, and every leaf has none', () => {
  const entity: TreeNode = { id: 'e1', name: 'box', type: 'entity', parentId: 'f1' };

  assert.equal(expansionKey({ kind: 'account', account: ACCOUNT }), 'account:a1');
  assert.equal(expansionKey({ kind: 'node', accountId: 'a1', node: FOLDER }), 'node:a1:f1');
  assert.equal(
    expansionKey({ kind: 'dependents', accountId: 'a1', node: entity }),
    'dependents:a1:e1',
  );
  assert.equal(expansionKey({ kind: 'teamScope', account: ACCOUNT }), 'teamScope:a1');
  assert.equal(expansionKey({ kind: 'sharedRoot' }), 'sharedRoot');
  assert.equal(expansionKey({ kind: 'sharedSender', email: 'b@x.com' }), 'sharedSender:b@x.com');

  // Leaves answer nothing, so a caller cannot remember a row that has no twisty.
  assert.equal(expansionKey({ kind: 'search' }), undefined);
  assert.equal(
    expansionKey({ kind: 'revision', accountId: 'a1', node: entity, index: 0 }),
    undefined,
  );
  assert.equal(
    expansionKey({ kind: 'dependentEntity', accountId: 'a1', targetId: 'v1', node: entity }),
    undefined,
  );
});

test('the account-root group in a dependents sub-tree has its own key, not a null one', () => {
  assert.equal(
    expansionKey({
      kind: 'dependentsFolder',
      accountId: 'a1',
      targetId: 'v1',
      folderId: null,
      name: '(account root)',
      entities: [],
    }),
    'depfolder:a1:v1:root',
  );
});

test('the key never carries the filter term, whatever the row id does', () => {
  // A folder's TreeItem.id embeds the live query, because VS Code remembers expansion per id and
  // a stable id would refuse to open on a hit. Keying the memory on that would file one folder
  // under a different name for every term ever typed.
  const key = expansionKey({ kind: 'node', accountId: 'a1', node: FOLDER });
  assert.equal(key, 'node:a1:f1');
  assert.ok(!(key ?? '').includes('q'), 'the key must not depend on the search term');
});
