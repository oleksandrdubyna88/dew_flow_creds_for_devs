import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  configFileNameFor,
  ignoredArgv,
  trackedArgv,
  trackedCopyWarning,
  writeVerdict,
} from '../configFile';

/**
 * Putting a config on disk, and the git question that comes with it.
 *
 * <p>The whole point of the vault is that this content is not in the repository. Writing it back
 * into one undoes that in a single step, and nobody notices until the push — so the check is not
 * whether the file exists but what git thinks of the path.</p>
 */

test('a tracked path is refused, and the message says what to do about it', () => {
  const verdict = writeVerdict('appsettings.Development.json', true, false);

  assert.equal(verdict.kind, 'refuse');
  assert.match(verdict.kind === 'refuse' ? verdict.message : '', /\.gitignore/);
});

test('a tracked path is refused even when git also ignores it', () => {
  // Both can be true: a file added before the ignore rule stays tracked, and git goes on
  // tracking it. "Ignored" would be the reassuring answer and the wrong one.
  const verdict = writeVerdict('appsettings.Development.json', true, true);

  assert.equal(verdict.kind, 'refuse');
});

test('an ignored path is written without a question', () => {
  assert.deepEqual(writeVerdict('appsettings.Development.json', false, true), { kind: 'ok' });
});

test('a path that is neither tracked nor ignored asks first', () => {
  // Not a refusal: a folder outside any repository answers exactly this way, and writing there
  // is what most people are doing. The risk is real but it is the caller's to take.
  const verdict = writeVerdict('appsettings.Development.json', false, false);

  assert.equal(verdict.kind, 'confirm');
  assert.match(verdict.kind === 'confirm' ? verdict.message : '', /git add/);
});

test('the argv is git\u2019s own, and both use `--` so a file named like a flag is still a file', () => {
  assert.deepEqual(trackedArgv('-rf'), ['ls-files', '--error-unmatch', '--', '-rf']);
  assert.deepEqual(ignoredArgv('-rf'), ['check-ignore', '-q', '--', '-rf']);
});

test('the declared file name wins', () => {
  assert.equal(
    configFileNameFor('appsettings.Development.json', 'json', 'dev config'),
    'appsettings.Development.json',
  );
});

test('with nothing declared it falls back to the entity name, then to a word', () => {
  assert.equal(configFileNameFor(undefined, 'json', 'appsettings.json'), 'appsettings.json');
  assert.equal(configFileNameFor('   ', 'json', 'appsettings.json'), 'appsettings.json');
  assert.equal(configFileNameFor(undefined, 'json', '  '), 'config.json');
});

test('an extension is appended only when there is none', () => {
  assert.equal(configFileNameFor(undefined, 'json', 'settings'), 'settings.json');
  assert.equal(configFileNameFor(undefined, 'yaml', 'compose'), 'compose.yaml');
});

test('`.env` stays `.env` and does not become `.env.env`', () => {
  // The case a naive `name + ext` gets wrong, and the one people use most.
  assert.equal(configFileNameFor('.env', 'env', 'local env'), '.env');
  assert.equal(configFileNameFor(undefined, 'env', '.env.local'), '.env.local');
});

test('a name cannot climb out of the folder it was given', () => {
  // An entity name is free text arriving by sync, import and accepted share — untrusted at
  // exactly the moment it becomes part of a path.
  assert.equal(configFileNameFor('../../etc/passwd', 'json', 'x'), '.._.._etc_passwd');
  // Flattened to `a_b_c`, which then has no extension, so one is appended exactly as it is for
  // any other dotless name. The traversal is gone either way, which is what this asserts.
  assert.equal(configFileNameFor('a/b\\c', 'json', 'x'), 'a_b_c.json');
  assert.equal(configFileNameFor(undefined, 'json', 'C:\\temp\\evil.json'), 'C__temp_evil.json');
});

test('a name that is only dots names a directory, so it is replaced', () => {
  assert.equal(configFileNameFor('..', 'json', 'x'), 'config.json');
  assert.equal(configFileNameFor('.', 'json', 'x'), 'config.json');
});

test('the tracked-copy warning names the file and says what to do', () => {
  // The quiet failure: somebody puts the config in the vault, feels safer, and leaves the tracked
  // copy where it was. Nothing breaks, nothing warns, and the secrets are still one push away —
  // the vault has become a SECOND place to keep them rather than the place.
  const warning = trackedCopyWarning('appsettings.Development.json');

  assert.match(warning, /appsettings\.Development\.json/);
  assert.match(warning, /\.gitignore/);
  assert.match(warning, /does not remove it/, 'the warning must correct the false sense of safety');
});
