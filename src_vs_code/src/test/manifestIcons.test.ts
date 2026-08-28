import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * T33 — the obvious-verb commands carry codicon icons. Dropdown menus do not render them (a
 * recorded VS Code limit); the palette and title bars do, and a typo in an icon id renders a
 * missing glyph silently — so the id list is checked here rather than in a screenshot.
 */
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  contributes: { commands: Array<{ command: string; icon?: CommandIcon }> };
};

const OBVIOUS_VERBS = [
  'credSshManager.backupToNas',
  'credSshManager.restoreBackup',
  'credSshManager.lockVaults',
  'credSshManager.unlockWithSecurityKey',
  'credSshManager.unlockWithRecoveryCode',
  'credSshManager.importExternal',
  'credSshManager.exportExternal',
  'credSshManager.setAutoLock',
  'credSshManager.showMcpLog',
  'credSshManager.help',
];

type CommandIcon = string | { light: string; dark: string };

/**
 * A codicon, or — for a coloured mark (the yellow help question, the green Connect/DB) — an
 * SVG pair whose files exist. A codicon cannot be coloured in a title bar or a menu.
 */
function assertIcon(id: string, icon: CommandIcon | undefined): void {
  if (typeof icon === 'object') {
    for (const file of [icon.light, icon.dark]) {
      assert.ok(fs.existsSync(path.join(__dirname, '..', '..', file)), `${id}: icon file ${file} is missing`);
    }
    return;
  }
  assert.match(icon ?? '', /^\$\([a-z0-9-]+\)$/, `${id} has no codicon icon`);
}

test('every obvious-verb command carries a codicon, and the id is well-formed', () => {
  for (const id of OBVIOUS_VERBS) {
    const command = manifest.contributes.commands.find((c) => c.command === id);
    assert.ok(command !== undefined, `${id} is not contributed`);
    assertIcon(id, command.icon);
  }
});
