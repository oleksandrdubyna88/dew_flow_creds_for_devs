import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * Every command the manifest advertises must have a handler somewhere in the source.
 *
 * <p>VS Code does not check this. A command contributed in `package.json` with nothing
 * calling `registerCommand` for it appears in the palette like any other, and fails with
 * "command not found" when someone runs it — the failure lands on the user, at the moment
 * they trust the tool. This repository has shipped unreachable features twice already for
 * neighbouring reasons (a kind missing from a picker, a command with no menu entry), and both
 * times the fix was a test that made the gap impossible to miss.</p>
 *
 * <p>It scans the whole `src/` tree rather than one file on purpose: handlers are being moved
 * out of `extension.ts` into their own modules, and a check that knew where they live today
 * would fail for the wrong reason tomorrow.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Command ids passed to anything that registers them, however the call is spelled. */
function registeredCommands(): Set<string> {
  const found = new Set<string>();
  const pattern = /(?:registerCommand|register)\(\s*'([^']+)'/g;
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(pattern)) {
      found.add(match[1]);
    }
  }
  return found;
}

test('every contributed command has a handler in the source', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
  ) as { contributes: { commands: { command: string }[] } };

  const registered = registeredCommands();
  const orphans = manifest.contributes.commands
    .map((c) => c.command)
    .filter((id) => !registered.has(id));

  assert.deepEqual(
    orphans,
    [],
    'contributed in package.json but never registered — these appear in the palette and fail when run',
  );
});
