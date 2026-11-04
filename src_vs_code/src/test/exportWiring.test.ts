import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * E1.1 — the window hands its REAL remote name to both places that decide by it
 * (`PLAN_remote_bridge_scoped_E1.md`).
 *
 * <p>`extension.ts` imports `vscode` and cannot be loaded here, so the wiring is read from its
 * source, the way `mcpHooks.test.ts` reads the MCP hooks' wiring. It matters because every other
 * test passes the remote name by hand: `credentialExportEnvAction` is built with `remoteName` in
 * `agentUseActions.test.ts`, and `setEnvCollection` is called with one in `envSaveNotice.test.ts`.
 * Delete the argument in `activate` and all of them stay green, while the window quietly reads as
 * local: an agent's export is served in a Remote-SSH window and the warning is never said.</p>
 */

/** The collection is registered with the name of the window it belongs to. */
const ENV_COLLECTION_WIRED =
  /\bsetEnvCollection\s*\(\s*context\.environmentVariableCollection\s*,\s*vscode\.env\.remoteName\s*,?\s*\)/g;

/** The export action is built with the same name, beside the deps every other action gets. */
const EXPORT_ACTION_WIRED =
  /\bcredentialExportEnvAction\s*\(\s*\{\s*\.\.\.agentDeps\s*,\s*remoteName\s*:\s*vscode\.env\.remoteName\s*,?\s*\}\s*,?\s*\)/g;

/** Any call at all, wired or not: the strict pattern must find exactly the calls that exist. */
const ENV_COLLECTION_CALL = /\bsetEnvCollection\s*\(/g;
const EXPORT_ACTION_CALL = /\bcredentialExportEnvAction\s*\(/g;

test('the window registers the env collection with vscode.env.remoteName', () => {
  assert.deepEqual(
    hits(ENV_COLLECTION_WIRED).length,
    1,
    `setEnvCollection is not given vscode.env.remoteName in extension.ts; its calls read: ${hits(ENV_COLLECTION_CALL).join(' | ')}`,
  );
});

test('the window builds the agent export action with vscode.env.remoteName', () => {
  assert.deepEqual(
    hits(EXPORT_ACTION_WIRED).length,
    1,
    `credentialExportEnvAction is not given vscode.env.remoteName in extension.ts; its calls read: ${hits(EXPORT_ACTION_CALL).join(' | ')}`,
  );
});

test('the scans are not vacuous: each call that exists is a wired call, and an unwired one does not match', () => {
  // The companion. A pattern that matches nothing makes the two tests above fail loudly, but a
  // pattern that matches too much would pass for an unwired call. So: the loose pattern finds the
  // same calls the strict one does (no second, unwired call), and the strict one refuses the
  // argument-less forms it exists to catch.
  assert.equal(hits(ENV_COLLECTION_CALL).length, hits(ENV_COLLECTION_WIRED).length, 'a setEnvCollection call without the name');
  assert.equal(hits(EXPORT_ACTION_CALL).length, hits(EXPORT_ACTION_WIRED).length, 'a credentialExportEnvAction call without the name');

  for (const unwired of [
    'setEnvCollection(context.environmentVariableCollection);',
    'setEnvCollection(context.environmentVariableCollection, undefined);',
    'setEnvCollection(context.environmentVariableCollection, "ssh-remote");',
  ]) {
    assert.equal(matches(ENV_COLLECTION_WIRED, unwired), 0, unwired);
  }
  for (const unwired of [
    'credentialExportEnvAction(agentDeps)',
    'credentialExportEnvAction({ ...agentDeps })',
    'credentialExportEnvAction({ ...agentDeps, remoteName: undefined })',
  ]) {
    assert.equal(matches(EXPORT_ACTION_WIRED, unwired), 0, unwired);
  }
  // And it reads through a formatter breaking the call across lines.
  assert.equal(
    matches(EXPORT_ACTION_WIRED, 'credentialExportEnvAction({\n  ...agentDeps,\n  remoteName: vscode.env.remoteName,\n})'),
    1,
  );
  assert.equal(
    matches(ENV_COLLECTION_WIRED, 'setEnvCollection(\n  context.environmentVariableCollection,\n  vscode.env.remoteName,\n)'),
    1,
  );
});

function matches(pattern: RegExp, text: string): number {
  return [...text.matchAll(pattern)].length;
}

/** Every hit as `extension.ts:line: text`, so a failure points at the place. */
function hits(pattern: RegExp): string[] {
  const source = codeOf('extension.ts');
  return [...source.matchAll(pattern)].map((m) => {
    const line = source.slice(0, m.index).split('\n').length;
    return `extension.ts:${line}: ${m[0].replace(/\s+/g, ' ')}`;
  });
}

/** The file with comment lines BLANKED, so prose that quotes these calls is not read as a call. */
function codeOf(file: string): string {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', file), 'utf8');
  return source
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? '' : line))
    .join('\n');
}
