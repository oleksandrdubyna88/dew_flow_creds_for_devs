import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FOLDERS,
  buildDefaultFolders,
  shouldSeedDefaults,
  inheritedFolderType,
} from '../defaultFolders';

test('the default set is the six requested folders, each with its own type', () => {
  assert.deepEqual(
    DEFAULT_FOLDERS.map((f) => [f.name, f.folderType]),
    [
      ['db', 'db'],
      ['vpn', 'vpn'],
      ['ssh keys', 'sshkey'],
      ['ssh connections', 'ssh'],
      ['passwords', 'credential'],
      ['terminal', 'terminal'],
    ],
  );
});

test('buildDefaultFolders produces root folders in display order with unique ids', () => {
  let n = 0;
  const nodes = buildDefaultFolders(() => `id-${n++}`);

  assert.equal(nodes.length, DEFAULT_FOLDERS.length);
  for (const [index, node] of nodes.entries()) {
    assert.equal(node.type, 'folder');
    assert.equal(node.parentId, null);
    assert.equal(node.sortOrder, index, 'sortOrder preserves display order');
    assert.equal(node.folderType, DEFAULT_FOLDERS[index].folderType);
    assert.equal(node.name, DEFAULT_FOLDERS[index].name);
  }
  const ids = new Set(nodes.map((node) => node.id));
  assert.equal(ids.size, nodes.length, 'ids are unique');
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

test('a subfolder of a typed folder is of that type — it is not asked about', () => {
  // A folder with a type fixes the type of the entities in it. A subfolder is where
  // some of those entities live, so asking again offers an answer that would be wrong:
  // a `ssh` folder inside `passwords` is a folder whose contents the parent already
  // refuses.
  assert.equal(inheritedFolderType('credential'), 'credential');
  assert.equal(inheritedFolderType('terminal'), 'terminal');
  assert.equal(inheritedFolderType('vpn'), 'vpn');
});

test('an untyped parent dictates nothing, so the question is a real one', () => {
  assert.equal(inheritedFolderType('any'), undefined);
  assert.equal(inheritedFolderType(undefined), undefined);
});
