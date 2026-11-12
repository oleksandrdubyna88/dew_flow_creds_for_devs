import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEP_COLOR_KEYS, DepColorKey } from '../depColors';
import { folderColorKeyOf, folderColorUsage, pickFolderColor } from '../folderColors';
import { TreeNode, isTreeNode } from '../types';

/**
 * Which colour a folder wears, how many folders wear each, and which one a new folder gets.
 *
 * <p>All three are pure: no storage, no `vscode`. Folders count among folders only, so the
 * fixtures put dependency colours (`details.depColor`, another meaning altogether) on entities
 * and assert they move nothing.</p>
 */

/** A fixture that is a real node: it passes the same guard storage reads through. */
function node(fields: Partial<TreeNode> & Pick<TreeNode, 'id' | 'type'>): TreeNode {
  const built: TreeNode = { name: fields.id, parentId: null, ...fields };
  assert.ok(isTreeNode(built), `the fixture ${fields.id} is not a valid node`);
  return built;
}

function folder(id: string, folderColor?: string, extra: Partial<TreeNode> = {}): TreeNode {
  return node({ id, type: 'folder', ...(folderColor === undefined ? {} : { folderColor }), ...extra });
}

function entity(id: string, depColor?: string, folderColor?: string): TreeNode {
  return node({
    id,
    type: 'entity',
    ...(folderColor === undefined ? {} : { folderColor }),
    details: { id, name: id, isSshEnabled: false, depColor },
  });
}

/** One folder per given key, in the order given. */
function wearing(...keys: DepColorKey[]): TreeNode[] {
  return keys.map((key, i) => folder(`f${i}`, key));
}

test('the_key_of_a_coloured_folder', () => {
  for (const key of DEP_COLOR_KEYS) {
    assert.equal(folderColorKeyOf(folder(`f-${key}`, key)), key);
  }
});

test('no_key_for_an_unknown_value_a_non_folder_or_the_trash', () => {
  assert.equal(folderColorKeyOf(folder('newer', 'depColor99')), undefined, 'a key of a newer build');
  assert.equal(folderColorKeyOf(entity('e', undefined, DEP_COLOR_KEYS[1])), undefined, 'an entity');
  assert.equal(
    folderColorKeyOf(folder('trash', DEP_COLOR_KEYS[1], { isTrash: true })),
    undefined,
    'the trash',
  );
  assert.equal(folderColorKeyOf(folder('plain')), undefined, 'a folder with no field');
  assert.equal(folderColorKeyOf(undefined), undefined, 'no node at all');
});

test('usage_counts_the_folders_that_wear_a_key', () => {
  const usage = folderColorUsage([
    folder('a', DEP_COLOR_KEYS[1]),
    folder('b', DEP_COLOR_KEYS[1]),
    folder('c', DEP_COLOR_KEYS[4]),
    folder('trash', DEP_COLOR_KEYS[4], { isTrash: true }),
    folder('newer', 'depColor99'),
    entity('e', DEP_COLOR_KEYS[0]),
  ]);
  assert.deepEqual(
    usage,
    new Map<DepColorKey, number>([
      [DEP_COLOR_KEYS[1], 2],
      [DEP_COLOR_KEYS[4], 1],
    ]),
  );
});

test('the_pick_is_the_first_unused_then_the_least_used_in_palette_order', () => {
  assert.equal(pickFolderColor([]), DEP_COLOR_KEYS[0], 'no coloured folder');
  const last = DEP_COLOR_KEYS[DEP_COLOR_KEYS.length - 1];
  assert.equal(pickFolderColor(wearing(...DEP_COLOR_KEYS.slice(0, -1))), last, 'only the last is free');
  const twice = [...wearing(...DEP_COLOR_KEYS), folder('x0', DEP_COLOR_KEYS[0]), folder('x1', DEP_COLOR_KEYS[1])];
  assert.equal(pickFolderColor(twice), DEP_COLOR_KEYS[2], 'every key once, the first two twice');
});

test('dependency_colours_do_not_move_the_folder_pick', () => {
  const nodes = [
    folder('f', DEP_COLOR_KEYS[0]),
    entity('e1', DEP_COLOR_KEYS[1]),
    entity('e2', DEP_COLOR_KEYS[1]),
    entity('e3', DEP_COLOR_KEYS[1]),
  ];
  assert.equal(pickFolderColor(nodes), DEP_COLOR_KEYS[1]);
});
