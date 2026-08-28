import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { plain, underlined } from '../treeDescriptions';
import { nodeHaystack } from '../treeSearch';
import { TreeNode } from '../types';

/** T30 — the folder description underline is written into the text; search must never see it. */

test('every character gets a combining low line, and plain() is the exact inverse', () => {
  const marked = underlined('sshkey');
  assert.equal([...marked].length, 12, 'one mark per character');
  assert.notEqual(marked, 'sshkey');
  assert.equal(plain(marked), 'sshkey');
  assert.equal(plain(underlined('дб')), 'дб');
});

test('the haystack a filter searches is the raw folder type — the marks never reach it', () => {
  const folder: TreeNode = { id: 'f', name: 'db', type: 'folder', parentId: null, folderType: 'sshkey' } as never;
  assert.ok(nodeHaystack(folder).includes('sshkey'));
  assert.ok(!nodeHaystack(folder).includes('̲'), 'a combining mark in the haystack would break `sshkey` as a search term');
});
