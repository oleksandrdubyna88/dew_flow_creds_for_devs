import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCommandLine, describeCommand, normalizeArgs } from '../commandLine';

/**
 * CLI commands as first-class entries.
 *
 * The case this exists for: `aws sso login --sso-session OD-org` is impossible to find in
 * shell history a week later, and the part nobody remembers is not the verb — it is which
 * `--sso-session` value belongs to which organisation, and why. So an argument is a ROW
 * with its own note, not a blob of text.
 */

test('a command with no arguments is just the command', () => {
  assert.equal(buildCommandLine('aws sso login', []), 'aws sso login');
});

test('arguments join onto one line in the order they are listed', () => {
  const line = buildCommandLine('aws sso login', [
    { value: '--sso-session OD-org' },
    { value: '--no-browser' },
  ]);

  assert.equal(line, 'aws sso login --sso-session OD-org --no-browser');
});

test('a disabled argument is kept but left out of the line', () => {
  // The point of keeping it: `--debug` is the flag you want back next week, and
  // deleting it means retyping it from memory — which is the problem being solved.
  const line = buildCommandLine('kubectl get pods', [
    { value: '-n prod' },
    { value: '--v=8', disabled: true },
  ]);

  assert.equal(line, 'kubectl get pods -n prod');
});

test('surrounding whitespace never leaks into the line', () => {
  const line = buildCommandLine('  aws sso login  ', [{ value: '  --sso-session OD-org ' }]);

  assert.equal(line, 'aws sso login --sso-session OD-org');
});

test('an empty argument row contributes nothing', () => {
  // Rows are added by clicking "+", so a blank one is the normal in-between state.
  const line = buildCommandLine('terraform apply', [
    { value: '' },
    { value: '   ' },
    { value: '-auto-approve' },
  ]);

  assert.equal(line, 'terraform apply -auto-approve');
});

test('a command with nothing in it produces nothing to run', () => {
  assert.equal(buildCommandLine('', [{ value: '--flag' }]), '');
  assert.equal(buildCommandLine('   ', []), '');
});

test('normalizing drops blank rows but keeps notes and order', () => {
  const rows = normalizeArgs([
    { value: '--sso-session OD-org', note: 'the profile in ~/.aws/config' },
    { value: '' },
    { value: '--no-browser', note: 'headless box: print the URL instead of opening one' },
  ]);

  assert.deepEqual(rows, [
    { value: '--sso-session OD-org', note: 'the profile in ~/.aws/config' },
    { value: '--no-browser', note: 'headless box: print the URL instead of opening one' },
  ]);
});

test('a note kept on a blank row is dropped with it', () => {
  assert.deepEqual(normalizeArgs([{ value: '  ', note: 'orphaned explanation' }]), []);
});

test('an empty note is omitted rather than stored as an empty string', () => {
  assert.deepEqual(normalizeArgs([{ value: '-x', note: '   ' }]), [{ value: '-x' }]);
});

test('a disabled row survives normalization, because it is deliberate', () => {
  assert.deepEqual(normalizeArgs([{ value: '--v=8', disabled: true }]), [
    { value: '--v=8', disabled: true },
  ]);
});

test('the description reads as the command plus what each argument means', () => {
  const text = describeCommand(
    'aws sso login',
    [
      { value: '--sso-session OD-org', note: 'the SSO profile from ~/.aws/config' },
      { value: '--no-browser' },
    ],
    'Refresh the AWS session before running terraform.',
  );

  assert.match(text, /aws sso login --sso-session OD-org --no-browser/);
  assert.match(text, /Refresh the AWS session/);
  assert.match(text, /--sso-session OD-org\s+—\s+the SSO profile/);
  // An argument with no note must not produce a dangling dash.
  assert.doesNotMatch(text, /--no-browser\s+—\s*$/m);
});

test('a command with no notes at all still describes itself', () => {
  const text = describeCommand('ls -la', [], undefined);

  assert.equal(text.trim(), 'ls -la');
});
