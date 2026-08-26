import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { readHelpText } from '../helpLookup';

/**
 * Asking a CLI to describe its own flags (audit A3).
 *
 * <p>`helpText.ts` owns the parsing and is tested there. What is only true HERE is the part
 * that runs somebody else's binary, and it carries three promises worth pinning: it never
 * runs a command the safety check rejects, it never throws — a tool that is not installed is
 * the ordinary case — and it tells help text apart from an error message, because a shell
 * printing "command not found" would otherwise be offered to the user as documentation.</p>
 *
 * <p>`node` is the probe target on purpose: it is the process running this suite, so it is
 * installed by definition and the test cannot go flaky on someone else's machine.</p>
 */

test('a real tool answers with its own flag list', async () => {
  const text = await readHelpText('node');

  assert.ok(text.length > 40, 'help text came back');
  assert.match(text, /^\s*-\s*-?[a-zA-Z]/m, 'and it has the flag column that makes it help');
});

test('a command that is not installed returns EMPTY rather than throwing', async () => {
  // The common case: the form asks about `terraform` on a machine without it. A rejected
  // promise here would surface as an error in a panel the user did not ask a question in.
  const text = await readHelpText('definitely-not-a-real-binary-xyz');

  assert.equal(text, '');
});

test('a command with shell metacharacters is never run', async () => {
  // On Windows these probes run with `shell: true` (npm and terraform are .cmd shims), so
  // the safety check is the only thing between a command string and a shell. An empty probe
  // list is what refusal looks like from out here.
  for (const dangerous of ['node --help & calc', 'node; rm -rf /', 'node $(whoami)', 'node `id`']) {
    assert.equal(await readHelpText(dangerous), '', `refused: ${dangerous}`);
  }
});

test('an empty command asks nothing', async () => {
  assert.equal(await readHelpText('   '), '');
});

test('output that is not help — an error line — is not offered as documentation', async () => {
  // `node --badflag` prints a short error and exits non-zero. The exit code is ignored on
  // purpose (plenty of tools print help to stderr and exit 1), so the TEXT has to decide.
  const text = await readHelpText('node --definitely-not-a-flag');

  assert.equal(text, '', 'a two-line complaint is not a flag column');
});
