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
  // fresh + never seeded + nothing remote to inherit -> seed
  assert.equal(shouldSeedDefaults(0, false, 'empty'), true);
  // has data already (e.g. a returning user pulled from NAS, or renamed a
  // default) -> never touch
  assert.equal(shouldSeedDefaults(3, false, 'empty'), false);
  assert.equal(shouldSeedDefaults(1, false, 'empty'), false);
  // already seeded once -> don't respawn after the user deletes them
  assert.equal(shouldSeedDefaults(0, true, 'empty'), false);
  assert.equal(shouldSeedDefaults(3, true, 'empty'), false);
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

test('an account whose remote vault could not be read is NOT seeded', () => {
  // The duplicate-folder bug. Sign-in pulls first, quietly, and a fresh machine has no
  // sync PIN yet — so the pull cannot open the vault and reports nothing. The local tree
  // is empty, which is indistinguishable from "brand new", so the defaults were created.
  // The next real sync then pulled the account's ACTUAL folders, whose ids differ, and
  // the merge kept both: two `db`, two `vpn`, two of everything.
  assert.equal(shouldSeedDefaults(0, false, 'unknown'), false);
});

test('an account confirmed to have nothing remote is seeded', () => {
  assert.equal(shouldSeedDefaults(0, false, 'empty'), true);
});

test('an account with no sync location at all is seeded — there is nothing to wait for', () => {
  assert.equal(shouldSeedDefaults(0, false, 'no-location'), true);
});

test('the old guards still hold whatever the remote says', () => {
  assert.equal(shouldSeedDefaults(3, false, 'empty'), false, 'already has nodes');
  assert.equal(shouldSeedDefaults(0, true, 'empty'), false, 'seeded once already');
  assert.equal(shouldSeedDefaults(0, true, 'no-location'), false);
});

test('a project folder seeds the same set, parented under the project', () => {
  let n = 0;
  const nodes = buildDefaultFolders(() => `id-${n++}`, 'project-1');

  assert.equal(nodes.length, DEFAULT_FOLDERS.length);
  assert.ok(nodes.every((f) => f.parentId === 'project-1'));
  // The same names and types as an account's default set — that is the feature: a
  // project is the account's structure in miniature.
  assert.deepEqual(
    nodes.map((f) => f.folderType),
    DEFAULT_FOLDERS.map((d) => d.folderType),
  );
});

test('without a parent the seed stays at the root, as before', () => {
  let n = 0;
  assert.ok(buildDefaultFolders(() => `x${n++}`).every((f) => f.parentId === null));
});

test('a project dictates nothing to entities — like any, unlike a typed folder', () => {
  // `project` is a FOLDER type, not an entity kind. Forcing entities inside to kind
  // "project" would invent an entity kind that does not exist.
  assert.equal(inheritedFolderType('project'), undefined);
});
