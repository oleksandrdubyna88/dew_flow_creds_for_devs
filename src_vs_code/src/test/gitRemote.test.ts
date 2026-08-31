import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VAULT_BRANCH,
  classifyGitError,
  cloneArgv,
  cloneDirName,
  commitArgv,
  describeGitFailure,
  gitEnv,
  isGitLocation,
  parseGitRemote,
  pushArgv,
} from '../gitRemote';
import { isServerLocation } from '../vaultTransport';

/**
 * Everything decidable about git without running it. Two things here are security
 * properties rather than conveniences: a token must never reach argv or the environment,
 * and a commit message must not describe what is inside the vault.
 */

test('a git location is recognised only when it is unambiguous', () => {
  // https://host/path is indistinguishable from a Cred Vault Server URL. Guessing wrong
  // would point an account at the wrong transport and sync it nowhere, silently.
  for (const yes of [
    'git@github.com:me/vault.git',
    'ssh://git@gitlab.com/me/vault',
    'https://github.com/me/vault.git',
    'git+https://gitea.example.com/me/vault',
  ]) {
    assert.equal(isGitLocation(yes), true, yes);
  }
  for (const no of ['https://vault.example.com', 'http://127.0.0.1:5113', '/mnt/nas/vaults', '']) {
    assert.equal(isGitLocation(no), false, no);
  }
});

test('the scheme decides how authentication will work', () => {
  assert.equal(parseGitRemote('git@github.com:me/vault.git')?.scheme, 'ssh');
  assert.equal(parseGitRemote('ssh://git@host/me/vault')?.scheme, 'ssh');
  assert.equal(parseGitRemote('https://github.com/me/vault.git')?.scheme, 'https');
  assert.equal(parseGitRemote('/mnt/nas'), undefined);
});

test('the git+ prefix is stripped from the URL git is actually given', () => {
  assert.equal(parseGitRemote('git+https://host/me/vault')?.url, 'https://host/me/vault');
});

test('two accounts on one repository share one clone directory', () => {
  const a = cloneDirName(parseGitRemote('git@github.com:me/vault.git')!);
  const b = cloneDirName(parseGitRemote('git@github.com:me/vault.git')!);
  assert.equal(a, b);
  assert.notEqual(a, cloneDirName(parseGitRemote('git@github.com:me/other.git')!));
  assert.match(a, /^[a-z0-9-]+$/, 'legal directory name on every platform');
});

test('a token never reaches the environment of a git child', () => {
  // The environment of a child is readable by anything running as the same user — the exact
  // leak the SSH askpass path exists to avoid. A token goes over stdin to a helper instead.
  const env = gitEnv({ kind: 'token', token: 'ghp_supersecret' }, { PATH: '/usr/bin' });

  assert.equal(JSON.stringify(env).includes('ghp_supersecret'), false);
  assert.equal(env.GIT_TERMINAL_PROMPT, '0', 'a child must never block on a prompt nobody sees');
});

test('an ssh key is passed by path, with the agent and host-key prompts ruled out', () => {
  const env = gitEnv({ kind: 'ssh', keyPath: '/tmp/keys/1/deploy.key' }, {});

  assert.match(env.GIT_SSH_COMMAND ?? '', /-i "\/tmp\/keys\/1\/deploy\.key"/);
  assert.match(env.GIT_SSH_COMMAND ?? '', /IdentitiesOnly=yes/);
  assert.match(env.GIT_SSH_COMMAND ?? '', /StrictHostKeyChecking=accept-new/);
});

test('clone is shallow, single-branch, and passes the URL after --', () => {
  const argv = cloneArgv(parseGitRemote('git@github.com:me/vault.git')!, '/tmp/clone');

  assert.deepEqual(argv.slice(0, 6), ['clone', '--depth', '1', '--single-branch', '--branch', VAULT_BRANCH]);
  assert.equal(argv[argv.length - 3], '--', 'a URL beginning with - can never be read as an option');
  assert.equal(argv[argv.length - 1], '/tmp/clone');
});

test('the commit message says nothing about what is in the vault', () => {
  // The log is readable by anyone who can read the repository. "renamed prod-db" in a subject
  // line is metadata the encryption was supposed to cover.
  const argv = commitArgv('a1b2c3d4', '2026-08-25T19:00:00.000Z');
  const message = argv[argv.indexOf('--message') + 1];

  assert.equal(message, 'vault: a1b2c3d4 2026-08-25T19:00:00.000Z');
  assert.equal(/entries|renamed|password|added|removed/i.test(message), false);
  assert.ok(argv.includes('user.name=CredsForDevs'), 'not the developer’s own identity');
});

test('a normal push is never a force push', () => {
  assert.deepEqual(pushArgv(), ['push', 'origin', VAULT_BRANCH]);
  // Retention rewrites history deliberately, and even then only with a lease.
  assert.ok(pushArgv(true).includes('--force-with-lease'));
  assert.equal(pushArgv(true).includes('--force'), false);
});

test('git failures are classified by what the person should do about them', () => {
  assert.equal(classifyGitError('! [rejected]  creds-vault -> creds-vault (non-fast-forward)'), 'rejected');
  assert.equal(classifyGitError("fatal: couldn't find remote ref creds-vault"), 'empty');
  assert.equal(classifyGitError('fatal: Authentication failed for https://host/x.git'), 'auth');
  assert.equal(classifyGitError('ssh: Could not resolve hostname host'), 'unreachable');
  assert.equal(classifyGitError('fatal: something else entirely'), 'other');
});

test('a rejected push reads as "we will retry", not as an error the person must fix', () => {
  const message = describeGitFailure('rejected', 'git@host:me/vault.git', '');
  assert.match(message, /next sync will merge/i);
  assert.match(message, /nothing was lost/i);
});

test('an unknown failure carries git own first line, bounded', () => {
  const long = 'fatal: ' + 'x'.repeat(500);
  const message = describeGitFailure('other', 'r', long);
  assert.ok(message.length < 300, `message was ${message.length} chars`);
});

test('an https git remote also satisfies isServerLocation — which is why trust is asked of the transport', () => {
  // Not a defect in either predicate: `isServerLocation` tests for http(s), and a git remote
  // over https is http(s). It is the reason nothing security-bearing may ask the URL. A share's
  // sender is stamped only by a vault SERVER, and a git remote is written verbatim by whoever
  // can push — so answering "was this stamped?" from the location would hand a git share the one
  // transport's trust it must never inherit. `SharingManager.serverStamped` asks the factory,
  // which (see TransportFactory.build) resolves git FIRST.
  const remote = 'https://git.example.com/team/vault.git';

  assert.equal(parseGitRemote(remote)?.scheme, 'https', 'the factory routes this to GitTransport');
  assert.equal(isServerLocation(remote), true, 'and the location predicate cannot tell');

  // The server locations the two predicates do agree about.
  assert.equal(parseGitRemote('https://vault.example.com'), undefined);
  assert.equal(isServerLocation('https://vault.example.com'), true);
});
