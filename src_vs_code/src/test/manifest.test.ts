import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * The manifest is code — it decides what the user can actually reach — but nothing
 * compiles it, so a mistake in it fails silently at runtime rather than loudly at build.
 *
 * Both rules below come from a real one. `Set Backup Location…` was contributed with the
 * group `3_manage@0b`, VS Code expects a NUMBER after the `@`, and the item simply did not
 * appear in the menu. Nothing errored; the feature was just invisible.
 */

interface Manifest {
  contributes: {
    commands: { command: string; title: string; category?: string }[];
    menus: Record<string, { command: string; when?: string; group?: string }[]>;
    configuration: { properties: Record<string, unknown> };
  };
}

const manifest: Manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
);

/**
 * Commands that are deliberately reachable ONLY from the command palette.
 *
 * An allow-list rather than a blanket exemption: a command that is in no menu and not
 * named here is far more likely to be an oversight than a decision, and that is exactly
 * how a feature ships invisible.
 */
const PALETTE_ONLY = new Set([
  // Troubleshooting, used about once per machine.
  'credSshManager.resetGoogleOAuth',
  // Older aliases of backupToNas / restoreBackup, kept so muscle memory and any
  // keybindings people already have keep working.
  'extension.exportSecrets',
  'extension.importSecrets',
  // Reached by clicking the filter row itself (the row's own `command`), which is a
  // TreeItem property and therefore invisible to a manifest check. A menu entry for it
  // would be a second door to the thing the row already is.
  'credSshManager.search',
  // Asked for, not offered. Both scans answer "is a vault secret in this text" about something
  // outside the tree — the clipboard, or the open editor — so there is no row to hang them on,
  // and putting them in the editor's context menu would advertise a scan on every right-click
  // in every file.
  'credSshManager.scanClipboard',
  'credSshManager.scanDocument',
  // Reached when something has already gone wrong and the toast that said so has scrolled
  // away. There is no row it belongs to — the diagnostics are the window's, not an entity's.
  'credSshManager.showDiagnostics',
  // Deliberately keyboard-and-palette: it acts on NO row, so there is no context menu it
  // could belong to. Bound to Ctrl+Alt+P, which is the way it is meant to be reached.
  'credSshManager.quickOpen',
  // Same shape: a generated secret has no entity to hang off — the entity FORM has its own
  // Generate buttons, and this is for the passwords that are not stored here at all.
  'credSshManager.generateSecret',
  // Scans everything at once, so it belongs to no row either. Deliberately not on the account
  // menu: it reads `~/.ssh` and the workspace, which are not an account's property.
  'credSshManager.healthReport',
]);

// eslint-disable-next-line complexity
test('every menu group order is a number, or the item silently does not render', () => {
  const offenders: string[] = [];

  for (const [menu, items] of Object.entries(manifest.contributes.menus)) {
    for (const item of items) {
      if (item.group === undefined || !item.group.includes('@')) {
        continue;
      }
      const order = item.group.slice(item.group.indexOf('@') + 1);
      if (!/^\d+$/.test(order)) {
        offenders.push(`${menu}: ${item.command} has group "${item.group}"`);
      }
    }
  }

  assert.deepEqual(offenders, [], 'the part after @ must be a plain integer');
});

test('every contributed command is reachable from a menu, or is listed as palette-only', () => {
  const inMenus = new Set(
    Object.values(manifest.contributes.menus)
      .flat()
      .map((item) => item.command),
  );

  const unreachable = manifest.contributes.commands
    .map((c) => c.command)
    .filter((command) => !inMenus.has(command) && !PALETTE_ONLY.has(command));

  assert.deepEqual(unreachable, [], 'add it to a menu, or to PALETTE_ONLY with the reason');
});

test('every menu entry points at a command that exists', () => {
  const declared = new Set(manifest.contributes.commands.map((c) => c.command));
  const dangling: string[] = [];

  for (const [menu, items] of Object.entries(manifest.contributes.menus)) {
    for (const item of items) {
      if (!declared.has(item.command)) {
        dangling.push(`${menu}: ${item.command}`);
      }
    }
  }

  assert.deepEqual(dangling, []);
});

test('locking is offered wherever unlocking is', () => {
  // They are a pair. Unlock sat in the account menu while Lock was palette-only, so the
  // obvious way to test a security key — lock, then unlock — could not be found.
  const account = manifest.contributes.menus['view/item/context'].filter((m) =>
    /viewItem == account/.test(m.when ?? ''),
  );
  const commands = account.map((m) => m.command);

  assert.ok(commands.includes('credSshManager.unlockWithSecurityKey'));
  assert.ok(
    commands.includes('credSshManager.lockVaults'),
    'unlock is in the account menu, so lock must be too',
  );
});

test('the product name is consistent across every command category', () => {
  const categories = new Set(
    manifest.contributes.commands.map((c) => c.category).filter((c) => c !== undefined),
  );

  assert.deepEqual([...categories], ['CredsForDevs']);
});

// eslint-disable-next-line complexity
test('no two menu items compete for the same slot', () => {
  // The sibling of the `3_manage@0b` bug: a valid number that another item already uses.
  // Nothing errors, VS Code picks an order, and the menu you get is not the menu you
  // wrote — which is invisible until somebody notices an item moved.
  const menus = manifest.contributes.menus;
  const clashes: string[] = [];

  for (const menu of Object.keys(menus)) {
    const items = menus[menu];
    const seen = new Map<string, string[]>();
    for (const item of items) {
      if (item.group === undefined) {
        continue;
      }
      const slot = `${item.when ?? ''}::${item.group}`;
      const at = seen.get(slot) ?? [];
      at.push(item.command);
      seen.set(slot, at);
    }
    for (const [slot, commands] of seen) {
      if (commands.length > 1) {
        clashes.push(`${menu} ${slot} -> ${commands.join(', ')}`);
      }
    }
  }

  assert.deepEqual(clashes, []);
});

test('the product name lives in `category`, never inside a title', () => {
  // VS Code shows "category: title" in the palette and only the TITLE in a context menu.
  // Bake the prefix into the title instead and the palette is unchanged while the menu
  // grows one item shouting its own product name at somebody already inside it.
  const offenders = manifest.contributes.commands
    .filter((c) => /CredsForDevs/i.test(c.title))
    .map((c) => `${c.command}: ${c.title}`);

  assert.deepEqual(offenders, []);
});

test('every command is filed under the one category, so the palette groups them', () => {
  const missing = manifest.contributes.commands
    .filter((c) => c.category !== 'CredsForDevs')
    .map((c) => `${c.command} (category: ${String(c.category)})`);

  assert.deepEqual(missing, []);
});
