import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { entityContextValue } from '../treeRowText';

/**
 * Issue #122 — a row marked *Not for export* is not OFFERED *Share with…* or *Export / Share
 * Externally…*. The handlers refuse on their own (see the two handler tests); this is the menu half.
 */

const base = { id: 'e1', name: 'e1', isSshEnabled: false };

test('a marked entry wears :noexport; an unmarked one does not', () => {
  assert.match(entityContextValue({ ...base, notForExport: true }, false), /:noexport(:|$)/);
  assert.doesNotMatch(entityContextValue(base, false), /:noexport/);
  assert.doesNotMatch(entityContextValue({ ...base, notForExport: false }, false), /:noexport/);
});

interface MenuItem {
  readonly command: string;
  readonly when?: string;
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  contributes: { menus: Record<string, MenuItem[]> };
};

const treeItem = (command: string): MenuItem => {
  const found = manifest.contributes.menus['view/item/context'].filter((m) => m.command === command);
  assert.equal(found.length, 1, `${command} must have exactly one tree-row menu item`);
  return found[0];
};

for (const command of ['credSshManager.shareEntity', 'credSshManager.exportExternal']) {
  test(`${command} is hidden on a :noexport row and kept on folders and other entries`, () => {
    // The WHOLE clause, so a later edit that drops the row-kind half or the negation goes red.
    assert.equal(
      treeItem(command).when,
      'view == credSshManagerView && viewItem =~ /^(folder|entity)/ && !(viewItem =~ /:noexport/)',
    );
  });
}
