import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FOLDERS,
  buildDefaultFolders,
  shouldSeedDefaults,
} from '../defaultFolders';

test('the default set is the five requested folders, each with its own type', () => {
  assert.deepEqual(
    DEFAULT_FOLDERS.map((f) => [f.name, f.folderType]),
    [
      ['db', 'db'],
      ['vpn', 'vpn'],
      ['ssh keys', 'sshkey'],
      ['ssh connections', 'ssh'],
      ['passwords', 'credential'],
    ],
  );
});

test('buildDefaultFolders produces root folders in display order with unique ids', () => {
  let n = 0;
  const nodes = buildDefaultFolders(() => `id-${n++}`);

  assert.equal(nodes.length, 5);
  for (const [index, node] of nodes.entries()) {
    assert.equal(node.type, 'folder');
    assert.equal(node.parentId, null);
    assert.equal(node.sortOrder, index, 'sortOrder preserves display order');
    assert.equal(node.folderType, DEFAULT_FOLDERS[index].folderType);
    assert.equal(node.name, DEFAULT_FOLDERS[index].name);
  }
  const ids = new Set(nodes.map((node) => node.id));
  assert.equal(ids.size, 5, 'ids are unique');
});

test('seed only a brand-new, never-seeded account', () => {
  // fresh + never seeded -> seed
  assert.equal(shouldSeedDefaults(0, false), true);
  // has data already (e.g. a returning user pulled from NAS, or renamed a
  // default) -> never touch
  assert.equal(shouldSeedDefaults(3, false), false);
  assert.equal(shouldSeedDefaults(1, false), false);
  // already seeded once -> don't respawn after the user deletes them
  assert.equal(shouldSeedDefaults(0, true), false);
  assert.equal(shouldSeedDefaults(3, true), false);
});
