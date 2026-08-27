import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * The listing cannot drift again (tails T4).
 *
 * <p>The Marketplace listing was brought complete once (2026-08-24) by a plan that recorded
 * incompleteness as the real defect — 6 of 13 settings, 29 of 47 commands. Three release lines
 * later it had drifted again: 13 of 23 settings, a command section written for 47 of 94, zero
 * mentions of MCP or config entities. It recurs because nothing connects a shipped feature to
 * the document that advertises it: the manifest is data, the README is prose, and prose does
 * not fail a build. This test is the connection.</p>
 *
 * <p><b>By TITLE, not id — a recorded deviation from the plan's wording.</b> Command ids appear
 * nowhere user-facing; the title is what a reader sees in the palette and searches the README
 * for. Setting KEYS are what the README's settings table already uses, so those match by
 * key.</p>
 */

const ROOT = path.join(__dirname, '..', '..');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  contributes: {
    commands: Array<{ command: string; title: string }>;
    configuration: { properties: Record<string, unknown> };
  };
};

test('every command title appears in the README — the failure names exactly what is missing', () => {
  const missing = manifest.contributes.commands
    .filter((command) => !readme.includes(command.title.replace(/…$/, '')))
    .map((command) => `${command.title}  (${command.command})`);
  assert.deepEqual(
    missing,
    [],
    `commands shipped past the listing:\n  ${missing.join('\n  ')}`,
  );
});

test('every setting key appears in the README settings table', () => {
  // The README's tables write keys WITHOUT the section prefix (`nasBackupPath`), which is how
  // a reader sees them in the Settings UI search — accept either spelling.
  const missing = Object.keys(manifest.contributes.configuration.properties).filter(
    (key) => !readme.includes(key) && !readme.includes(`\`${key.replace('credSshManager.', '')}\``),
  );
  assert.deepEqual(missing, [], `settings shipped past the listing:\n  ${missing.join('\n  ')}`);
});

test('the features the drift buried are named: MCP, config entities, the CLI', () => {
  for (const term of ['MCP', 'creds-mcp', 'onfig file entit', 'creds ', 'Enable Code Access']) {
    assert.ok(readme.includes(term), `the README never says "${term}"`);
  }
});
