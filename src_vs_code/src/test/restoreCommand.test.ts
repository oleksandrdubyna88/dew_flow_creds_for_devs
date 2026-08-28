import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreEntries } from '../restoreCommand';
import { TreeNode } from '../types';

/** Restore, end to end but for storage: what is restored, in what order, and what is said. */

const node = (id: string, name: string): TreeNode => ({ id, name, type: 'entity', parentId: 't' });
const el = (n: TreeNode): { accountId: string; node: TreeNode } => ({ accountId: 'a1', node: n });

test('every selected entry is restored in order, the last one is revealed, and the sentence names the folders', async () => {
  const restored: string[] = [];
  const announced: string[] = [];
  const said = await restoreEntries(
    {
      restore: (_a, id) => {
        restored.push(id);
        return Promise.resolve(id === 'e1' ? { id: 'f', name: 'ssh', type: 'folder', parentId: null } : null);
      },
      announce: (_a, id) => {
        announced.push(id);
        return Promise.resolve();
      },
    },
    [el(node('e1', 'www')), el(node('e2', 'old'))],
  );
  assert.deepEqual(restored, ['e1', 'e2']);
  assert.deepEqual(announced, ['e2']);
  assert.equal(said, 'Restored "www" → "ssh", "old" → the account root.');
});

test('nothing to restore, nothing said — and nothing revealed', async () => {
  let announced = 0;
  const said = await restoreEntries(
    { restore: () => Promise.resolve(undefined), announce: () => { announced++; return Promise.resolve(); } },
    [el(node('e1', 'www'))],
  );
  assert.equal(said, '');
  assert.equal(announced, 0);
});
