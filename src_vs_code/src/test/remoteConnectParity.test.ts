import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * Both ways of opening an SSH terminal must decide about the window in the SAME place.
 *
 * <p>There are two: the tree's Connect button (`commands/agentCommands.ts`) and the broker's
 * terminal action (`sshUseActions.ts`), and they already diverged once — the broker never passed
 * `agentServesKey`, which was invisible while it only meant materialising a key the agent could
 * have served, and is not invisible in a WSL window, where the route refuses as `agent-has-no-key`
 * while the agent is holding the key. A code round asked for the parity to be checked rather than
 * intended.</p>
 *
 * <p>This reads the SOURCE, because what it is about is which function is called, and there is no
 * runtime seam to observe it through without standing up two command hosts. It pins the whole
 * condition rather than a fragment: both must call the shared builder, and NEITHER may build a
 * window side of its own — a source test that only checks the first half survives its own break.</p>
 */

/**
 * The source tree, found by walking up until `sshConnect.ts` is under it.
 *
 * <p>A fixed `../../src` is one `outDir` change away from pointing at nothing, and a source scan
 * aimed at nothing PASSES — every loop below would run zero times. The first test asserts the
 * result is non-empty for the same reason.</p>
 */
const SRC = ((): string => {
  for (let dir = __dirname; path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'src');
    if (fs.existsSync(path.join(candidate, 'sshConnect.ts'))) {
      return candidate;
    }
  }
  throw new Error('the source tree was not found from ' + __dirname);
})();

const read = (file: string): string => fs.readFileSync(path.join(SRC, file), 'utf8');

/**
 * Every file that opens a connection — FOUND, not listed.
 *
 * <p>A hardcoded pair is a guard a third call site walks straight past, which a code round said
 * plainly. `sshConnect.ts` itself is excluded: it is the callee, and its own recursive retry is not
 * a call site that has to decide about the window.</p>
 */
function callSites(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'test') {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'sshConnect.ts') {
        if (/[^a-zA-Z]connectEntity\(/.test(fs.readFileSync(full, 'utf8'))) {
          found.push(path.relative(SRC, full).split(path.sep).join('/'));
        }
      }
    }
  };
  walk(SRC);
  return found;
}

const CALL_SITES = callSites();

test('the call sites are FOUND, and the two known ones are among them', () => {
  // The loop below proves nothing if it runs over nothing, and a new third file must join it
  // automatically rather than when somebody remembers.
  assert.ok(CALL_SITES.includes('commands/agentCommands.ts'), `found: ${CALL_SITES.join(', ')}`);
  assert.ok(CALL_SITES.includes('sshUseActions.ts'), `found: ${CALL_SITES.join(', ')}`);
});

test('both call sites get the window from the ONE shared builder', () => {
  for (const file of CALL_SITES) {
    assert.match(
      read(file),
      /remoteWindowDeps\(/,
      `${file} decides about the window without the shared builder`,
    );
  }
});

/** Every read that belongs to the shared builder and nowhere else. */
const FORBIDDEN_AT_CALL_SITES = [
  /vscode\.env\.remoteName/,
  /workspaceFolders/,
  /wslRelayDistros/,
  /wslAgentRelay/,
  /socketPathFor/,
];

test('no call site builds a window side or relay readiness of its own', () => {
  // The half that gives the test teeth. Calling the builder AND hand-rolling a side beside it is
  // exactly the divergence this is here to prevent, and the first assertion would not see it.
  for (const file of CALL_SITES) {
    const source = read(file);

    for (const pattern of FORBIDDEN_AT_CALL_SITES) {
      assert.doesNotMatch(source, pattern, `${file} reads ${String(pattern)} itself`);
    }
  }
});

test('the shared builder is the only place that reads what a window IS', () => {
  // This is also what gives the test above its teeth: every pattern forbidden at a call site is
  // asserted to MATCH here, so a typo that made one of them match nothing would fail rather than
  // pass forever. A code round asked for exactly this companion.
  const host = read('remoteConnectHost.ts');

  for (const pattern of FORBIDDEN_AT_CALL_SITES) {
    assert.match(host, pattern, `${String(pattern)} matches nothing — the guard above is asleep`);
  }
});
