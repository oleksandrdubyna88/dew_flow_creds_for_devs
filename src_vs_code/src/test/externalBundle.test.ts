import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildExternalBundle,
  isExternalBundle,
  remapExternalIds,
} from '../externalBundle';
import { TreeNode } from '../types';

/**
 * Handing entities to someone OUTSIDE the organisation: a self-contained file with the
 * nodes and their secrets, either password-sealed or — explicitly — plain JSON. The
 * import side gives everything NEW ids, because the sender's ids belong to the sender's
 * tree and colliding with the recipient's own nodes would corrupt a merge.
 */

const folder: TreeNode = { id: 'f1', name: 'client x', type: 'folder', parentId: null, folderType: 'any' };
const child: TreeNode = { id: 'e1', name: 'prod ssh', type: 'entity', parentId: 'f1',
  details: { id: 'e1', name: 'prod ssh', isSshEnabled: true, host: 'h' } };

test('a bundle carries nodes and their secrets, self-contained', () => {
  const b = buildExternalBundle([folder, child], { e1: { password: 'pw', notes: 'careful' } });

  assert.equal(b.format, 'creds-for-devs-external');
  assert.equal(b.version, 1);
  assert.equal(b.nodes.length, 2);
  assert.equal(b.secrets.e1.password, 'pw');
  assert.equal(isExternalBundle(b), true);
});

test('validation refuses foreign shapes rather than importing garbage', () => {
  assert.equal(isExternalBundle({ format: 'something-else', version: 1, nodes: [], secrets: {} }), false);
  assert.equal(isExternalBundle({ format: 'creds-for-devs-external', version: 99, nodes: [], secrets: {} }), false);
  assert.equal(isExternalBundle({ format: 'creds-for-devs-external', version: 1, nodes: [{ bad: true }], secrets: {} }), false);
  assert.equal(isExternalBundle(null), false);
});

test('remapping renames every id, keeps the structure, and re-keys the secrets', () => {
  const b = buildExternalBundle([folder, child], { e1: { password: 'pw' } });
  let n = 0;
  const out = remapExternalIds(b, () => `new-${n++}`, 'target-folder');

  const f = out.nodes.find((x) => x.type === 'folder')!;
  const e = out.nodes.find((x) => x.type === 'entity')!;
  assert.notEqual(f.id, 'f1');
  assert.equal(f.parentId, 'target-folder');
  assert.equal(e.parentId, f.id);
  // The entity's details.id must follow, or secrets stored under the node id and the
  // details id would point at two different things.
  assert.equal(e.details?.id, e.id);
  assert.equal(out.secrets[e.id].password, 'pw');
  assert.equal('e1' in out.secrets, false);
});

test('a root entity with no parent lands in the chosen destination', () => {
  const lone: TreeNode = { ...child, parentId: null };
  const out = remapExternalIds(buildExternalBundle([lone], {}), () => 'x1', null);

  assert.equal(out.nodes[0].parentId, null);
});
