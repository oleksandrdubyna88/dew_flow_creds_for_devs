import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { escapeControl } from '../transitSecretReport';
import {
  chainTerminalTitle,
  entryTerminalKey,
  entryTerminalKeyOf,
  entryTerminalTitle,
  maskedRunTitle,
  sshTerminalTitle,
  vpnTerminalTitle,
} from '../terminalTitles';
import { TreeNode } from '../types';

function folder(id: string, name: string, parentId: string | null = null): TreeNode {
  return { id, name, type: 'folder', folderType: 'terminal', parentId };
}

function entry(id: string, parentId: string | null | undefined): TreeNode {
  return { id, name: id, type: 'entity', parentId };
}

/** A source that knows exactly the nodes it is given, by id. */
function sourceOf(...nodes: TreeNode[]): { getNode: (accountId: string, id: string) => TreeNode | undefined } {
  return { getNode: (_accountId, id) => nodes.find((node) => node.id === id) };
}

test('a_parent_folder_goes_before_the_entry', () => {
  assert.equal(entryTerminalTitle(entryTerminalKey('x', folder('o', 'ops'))), 'Creds: ops / x');
});

test('no_parent_gives_the_bare_title', () => {
  assert.equal(entryTerminalTitle(entryTerminalKey('x', undefined)), 'Creds: x');
  for (const parentId of [undefined, null, 'gone']) {
    const source = sourceOf(entry('e', parentId));
    assert.equal(entryTerminalTitle(entryTerminalKeyOf(source, 'acc', 'e', 'x')), 'Creds: x', String(parentId));
  }
});

test('the_trash_is_a_normal_parent', () => {
  assert.equal(entryTerminalTitle(entryTerminalKey('x', folder('trash', 'Trash'))), 'Creds: Trash / x');
});

test('only_the_direct_parent_is_named', () => {
  const outer = folder('outer', 'outer');
  const inner = folder('inner', 'inner', 'outer');
  const source = sourceOf(outer, inner, entry('e', 'inner'));

  assert.equal(entryTerminalTitle(entryTerminalKeyOf(source, 'acc', 'e', 'x')), 'Creds: inner / x');
});

test('a_control_character_in_the_folder_name_is_escaped', () => {
  const tab = entryTerminalTitle(entryTerminalKey('x', folder('t', 'a\tb')));
  const newline = entryTerminalTitle(entryTerminalKey('x', folder('n', 'a\nb')));

  assert.equal(tab, 'Creds: a\\u0009b / x');
  assert.equal(newline, 'Creds: a\\u000ab / x');
  assert.equal(tab, `Creds: ${escapeControl('a\tb')} / x`);
  assert.equal(entryTerminalTitle(entryTerminalKey('x\ty', undefined)), 'Creds: x\ty', 'the entry half is not escaped');
});

test('the_three_fixed_titles', () => {
  assert.equal(chainTerminalTitle('o'), 'Creds: before o');
  assert.equal(maskedRunTitle('n'), 'Creds run: n');
  assert.equal(vpnTerminalTitle('n'), 'Creds VPN: n');
});

test('the_key_reads_the_stored_parent', () => {
  const source = sourceOf(folder('now', 'now'), entry('e', 'now'));
  const key = entryTerminalKeyOf(source, 'acc', 'e', 'x');

  assert.deepEqual(key, { entryName: 'x', folderName: 'now' });
  assert.equal(entryTerminalTitle(key), 'Creds: now / x');
});

test('an_entry_not_in_storage_has_no_folder', () => {
  const key = entryTerminalKeyOf({ getNode: () => undefined }, 'acc', 'e', 'x');

  assert.equal(key.folderName, undefined);
  assert.equal(entryTerminalTitle(key), 'Creds: x');
});

test('the_module_imports_no_vscode', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'terminalTitles.ts'), 'utf8');

  assert.doesNotMatch(text, /from\s+['"]vscode['"]/);
});

// The owner, 2026-11-10: an SSH Connect tab said `SSH: root@82.165.44.219`, not which entry it was.
test('an_ssh_terminal_names_its_folder_and_entry_under_its_own_prefix', () => {
  assert.equal(sshTerminalTitle(entryTerminalKey('ionos server', folder('f', 'ssh connections'))), 'Creds SSH: ssh connections / ionos server');
  assert.equal(sshTerminalTitle(entryTerminalKey('ionos server', undefined)), 'Creds SSH: ionos server');
  assert.equal(sshTerminalTitle(entryTerminalKey('x', folder('f', 'a\tb'))), `Creds SSH: ${escapeControl('a\tb')} / x`);
});

test('an_ssh_title_never_equals_the_entry_terminal_title_of_the_same_entry', () => {
  // Both are lookup keys: a linked Terminal entry's arrow (entryTerminalTitle) must never find an SSH Connect session.
  for (const key of [entryTerminalKey('x', folder('f', 'ops')), entryTerminalKey('x', undefined)]) {
    assert.notEqual(sshTerminalTitle(key), entryTerminalTitle(key));
  }
});
