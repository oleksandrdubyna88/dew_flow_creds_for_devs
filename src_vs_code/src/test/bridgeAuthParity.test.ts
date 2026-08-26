import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * Nothing that spawns a NON-INTERACTIVE `ssh` may resolve the credential by hand.
 *
 * <p>The bridge did, and handled one credential kind in four. The symptom was not an error: the
 * spawned `ssh` sat at a password prompt on a pipe forever, so the window announced an open
 * bridge, the socket check found nothing, and the finding went to an info log. Four separate
 * mistakes, one of which — the hand-rolled `kind === 'storedKey'` derivation — is mechanical
 * enough to be caught by looking.</p>
 *
 * <p>A structural test that matches nothing passes forever, so this asserts BOTH halves: that
 * the pattern is absent where it must not be, and that the very same pattern still finds the one
 * place it legitimately lives. Without the second assertion, a rename of the credential union
 * would silently retire the guard.</p>
 */

const SRC = path.resolve(__dirname, '..', '..', 'src');

/** The hand-rolled derivation: a credential union narrowed to the stored-key case alone. */
const HAND_ROLLED = /\bkind === 'storedKey'/g;

function read(name: string): string {
  return fs.readFileSync(path.join(SRC, name), 'utf8');
}

test('the exec/bridge paths in extension.ts derive no credential of their own', () => {
  // Both the bridge and its socket check used to carry a copy of this. They now call
  // `resolveExecAuth`, which is the single place that knows all four kinds.
  const source = read('extension.ts');

  assert.deepEqual(source.match(HAND_ROLLED) ?? [], []);
});

test('the guard still matches the one place that legitimately narrows a credential', () => {
  // `sshConnect.ts` opens a HUMAN terminal, where the stored-key case really is special: the
  // agent may serve the key instead of it being written out at all. If this stops matching, the
  // pattern above has gone stale and the assertion before it is checking nothing.
  const source = read('sshConnect.ts');

  assert.ok((source.match(HAND_ROLLED) ?? []).length > 0, 'the pattern no longer matches real code');
});

test('every non-interactive ssh spawn goes through the shared resolver', () => {
  // `runSshExec` is the one runner for a spawned ssh. Any file that calls it must get its
  // environment from `resolveExecAuth`, because a password lives in that environment and
  // nowhere else — `process.env` would silently drop it.
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.ts'));
  const callers = files.filter((f) => read(f).includes('runSshExec('));

  assert.ok(callers.length >= 2, 'expected the bridge and the use-actions path at least');
  for (const file of callers) {
    const source = read(file);
    if (file === 'sshExecRunner.ts') {
      continue; // the runner itself takes an env; it does not choose one
    }
    assert.ok(
      source.includes('resolveExecAuth'),
      `${file} spawns ssh but never resolves a credential through the shared path`,
    );
  }
});
