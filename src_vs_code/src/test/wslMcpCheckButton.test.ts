import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * Plan §5.8 / E4.S2 — "Check the WSL MCP install" is a PANEL button, and the palette only duplicates it.
 *
 * <p>The owner's rule (2026-10-09): every action of the extension is reachable by a button in its
 * panel; a palette-only action is invisible to a person who works through the panel. The button sits in
 * the view's *Install…* submenu beside *Install the MCP Server…*, and it is the SAME command id as the
 * palette entry — so the two cannot run different code.</p>
 */

const COMMAND = 'credSshManager.checkWslMcpInstall';

interface MenuItem {
  command?: string;
  submenu?: string;
  when?: string;
}

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  contributes: { commands: { command: string; title: string }[]; menus: Record<string, MenuItem[]> };
};

test('the check is a contributed command with a title a person recognises', () => {
  const contributed = manifest.contributes.commands.find((c) => c.command === COMMAND);

  assert.ok(contributed, `${COMMAND} is not contributed`);
  assert.equal(contributed.title, 'Check the WSL MCP install');
});

test('the panel carries it: the view\'s Install… submenu, beside Install the MCP Server…', () => {
  const install = manifest.contributes.menus['credSshManager.install'] ?? [];
  const ids = install.map((item) => item.command);

  assert.ok(ids.includes(COMMAND), 'the check has no panel button — the palette would be its only way in');
  assert.ok(ids.indexOf(COMMAND) > ids.indexOf('credSshManager.installMcpServer'), 'it belongs beside the MCP install');

  const title = manifest.contributes.menus['view/title'] ?? [];
  assert.ok(
    title.some((item) => item.submenu === 'credSshManager.install' && (item.when ?? '').includes('credSshManagerView')),
    'the Install… submenu is not on the view\'s title bar',
  );
});

test('the button and the palette run ONE handler — the id is registered exactly once', () => {
  const src = path.join(__dirname, '..', '..', 'src');
  const pattern = new RegExp(`register(?:Command)?\\(\\s*'${COMMAND}'`, 'g');
  const registrations = fs
    .readdirSync(src, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.includes('test'))
    .flatMap((file) => [...fs.readFileSync(path.join(src, file), 'utf8').matchAll(pattern)]);

  assert.equal(registrations.length, 1);
});

const entryIn = (menu: string): MenuItem | undefined =>
  (manifest.contributes.menus[menu] ?? []).find((item) => item.command === COMMAND);

test('it is offered only where WSL can exist — the button is Windows-only, and so is the palette entry', () => {
  assert.equal(entryIn('credSshManager.install')?.when, 'isWindows');
  assert.equal(entryIn('commandPalette')?.when, 'isWindows');
});
