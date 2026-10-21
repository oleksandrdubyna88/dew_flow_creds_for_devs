import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Reading this repository's own files from a test — the one place the repository root is derived.
 *
 * <p>Two suites read documents that are not code: `readmeClaims.test.ts` (the READMEs' numbers) and
 * `sshAgentHelp.test.ts` (what the help and the menus promise about the signing prompt). A second
 * derivation of the root would be a second place to count levels wrong, so both import it from here.</p>
 */

/**
 * The repository root, from THIS file rather than from the working directory.
 *
 * <p>Three levels up lands on the root from both layouts — `src_vs_code/src/test` at authoring time
 * and `src_vs_code/out/test` at run time — because the two are the same depth. That coincidence is
 * load-bearing enough to assert rather than trust: four reviewers read the line and counted it
 * wrong, which is a fair sign that a future reader will too. So `assertRepoRoot` names the directory
 * it resolved and what it failed to find there, instead of letting an `ENOENT` arrive from
 * somewhere else.</p>
 */
export const REPO = path.resolve(__dirname, '..', '..', '..');

/** Fails, naming the resolved root, when any of these files is not where the root says it is. */
export function assertRepoRoot(files: readonly string[]): void {
  for (const file of files) {
    assert.equal(
      fs.existsSync(file),
      true,
      `resolved the repository root to ${REPO}, where ${path.relative(REPO, file)} is not — ` +
        'every assertion below would be reading the wrong document',
    );
  }
}

/** Read once. Each of these is read by four or five assertions, and none of them mutates it. */
const cache = new Map<string, string>();

export function read(file: string): string {
  const held = cache.get(file);
  if (held !== undefined) {
    return held;
  }
  const text = fs.readFileSync(file, 'utf8');
  cache.set(file, text);
  return text;
}
