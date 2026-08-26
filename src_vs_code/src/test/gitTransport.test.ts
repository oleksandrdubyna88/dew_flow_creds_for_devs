import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { GitError, GitRunner, GitTransport } from '../gitTransport';
import { GIT_BASE_ARGS, VAULT_BRANCH, cloneDirName, fetchArgv, initArgv, resetArgv } from '../gitRemote';
import { CURRENT_WRAPPED_VERSION } from '../cryptoUtils';
import { StoredAccount } from '../types';

/**
 * The transport driven by a fake git, so the paths a real repository cannot be made to take
 * on demand are still covered: a push rejected by a concurrent writer, an auth failure, and
 * the exact argv that reaches the binary.
 *
 * <p>The integration test (`scripts/git-transport-itest.cjs`) proves the argv works against
 * real git; this proves the transport reacts correctly to what git can answer. Neither
 * replaces the other — a mock that agrees with itself would have missed the line-ending
 * defect entirely, and a live repository cannot be made to reject a push on cue without
 * racing.</p>
 */

const ACCOUNT: StoredAccount = {
  accountId: 'acct-1',
  email: 'alice@example.com',
  provider: 'microsoft',
} as StoredAccount;

const REMOTE = { url: 'git@github.com:me/vault.git', scheme: 'ssh' as const };

interface Fake {
  transport: GitTransport;
  calls: string[][];
  dir: string;
  /** Make the next command whose argv contains `token` fail with `stderr`. */
  failNext(token: string, stderr: string): void;
}

function fake(root?: string): Fake {
  const cloneRoot = root ?? fs.mkdtempSync(path.join(os.tmpdir(), 'creds-gitunit-'));
  const calls: string[][] = [];
  const failures: { token: string; stderr: string }[] = [];

  const run: GitRunner = (args) => {
    calls.push([...args]);
    const failure = failures.findIndex((f) => args.includes(f.token));
    if (failure !== -1) {
      const [{ stderr }] = failures.splice(failure, 1);
      return Promise.resolve({ exitCode: 1, stdout: '', stderr });
    }
    // `status --porcelain` must report a change, or commitAndPush short-circuits.
    const stdout = args.includes('status') ? ' M vault_alice_at_example_com.enc\n' : '';
    return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
  };

  const transport = new GitTransport(
    REMOTE.url,
    REMOTE,
    cloneRoot,
    run,
    () => Promise.resolve({ kind: 'inherit' as const }),
    () => [ACCOUNT],
  );
  return {
    transport,
    calls,
    dir: cloneRoot,
    failNext: (token, stderr) => failures.push({ token, stderr }),
  };
}

/**
 * A clone directory that already looks cloned, so `ensureClone` takes the fetch path — and a
 * real directory to write into, since the fake runner does no filesystem work of its own.
 */
function prepared(): Fake {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-gitunit-'));
  fs.mkdirSync(path.join(root, cloneDirName(REMOTE), '.git'), { recursive: true });
  return fake(root);
}

test('every git invocation forces the line-ending settings', async () => {
  // The defect this guards is not hypothetical: without these, git rewrites line endings on
  // checkout and a vault written on one machine reads back as different bytes on another.
  const f = fake();
  await f.transport.readVault(ACCOUNT);

  assert.ok(f.calls.length > 0, 'something ran');
  for (const call of f.calls) {
    assert.deepEqual(call.slice(0, GIT_BASE_ARGS.length), [...GIT_BASE_ARGS], call.join(' '));
  }
});

test('a repository with no branch yet is initialised locally, not treated as an error', async () => {
  const f = fake();
  f.failNext('clone', 'fatal: Remote branch creds-vault not found in upstream origin');

  const content = await f.transport.readVault(ACCOUNT);

  assert.equal(content, undefined, 'nothing stored yet');
  const ran = f.calls.map((c) => c.join(' '));
  assert.ok(ran.some((c) => c.includes(initArgv(REMOTE)[0].join(' '))), ran.join(' | '));
  assert.ok(ran.some((c) => c.includes('remote add origin')), 'the origin is wired up');
});

test('a rejected push surfaces as a GitError the caller can act on', async () => {
  const f = prepared();
  f.failNext('push', '! [rejected]  creds-vault -> creds-vault (non-fast-forward)');

  await assert.rejects(
    () => f.transport.writeVault(ACCOUNT, '{"format":"cred-ssh-manager-backup"}'),
    (error: unknown) => error instanceof GitError && error.failure === 'rejected',
  );
});

test('a rejection reads as "we will retry", never as something the person must fix', async () => {
  const f = prepared();
  f.failNext('push', '! [rejected] (fetch first)');
  try {
    await f.transport.writeVault(ACCOUNT, '{}');
    assert.fail('should have thrown');
  } catch (error) {
    assert.match((error as GitError).message, /next sync will merge/i);
  }
});

test('an auth failure is classified as auth, not as an unreachable network', async () => {
  // The two lead to opposite advice: check your key, versus check your connection.
  const f = prepared();
  f.failNext('fetch', 'fatal: Authentication failed for https://github.com/me/vault.git');

  await assert.rejects(
    () => f.transport.readVault(ACCOUNT),
    (error: unknown) => error instanceof GitError && error.failure === 'auth',
  );
});

test('a read fetches and hard-resets — the clone is a cache, never a source of truth', async () => {
  const f = prepared();
  await f.transport.readVault(ACCOUNT);

  const ran = f.calls.map((c) => c.join(' '));
  assert.ok(ran.some((c) => c.endsWith(fetchArgv().join(' '))), ran.join(' | '));
  assert.ok(ran.some((c) => c.endsWith(resetArgv().join(' '))), 'the working copy is discarded');
});

test('an unchanged file is not committed, so an idle cycle grows no history', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-gitunit-'));
  fs.mkdirSync(path.join(root, cloneDirName(REMOTE), '.git'), { recursive: true });
  const calls: string[][] = [];
  const run: GitRunner = (args) => {
    calls.push([...args]);
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }); // status: clean
  };
  const transport = new GitTransport(REMOTE.url, REMOTE, root, run, () => Promise.resolve({ kind: 'inherit' }), () => [ACCOUNT]);

  await transport.writeVault(ACCOUNT, '{}');

  const ran = calls.map((c) => c.join(' '));
  assert.equal(ran.some((c) => c.includes('commit')), false, ran.join(' | '));
  assert.equal(ran.some((c) => c.includes('push')), false, 'nothing to push either');
});

test('the branch is never main', () => {
  // A vault repository is not one people read; putting it on the default branch invites a
  // clone that lands on a wall of ciphertext.
  assert.equal(VAULT_BRANCH, 'creds-vault');
  assert.ok(initArgv(REMOTE)[0].includes(VAULT_BRANCH));
  assert.equal(initArgv(REMOTE)[0].includes('main'), false);
});

/** A prepared clone whose vault file already holds a valid, share-less envelope. */
function withVault(): Fake {
  const f = prepared();
  const dir = path.join(f.dir, cloneDirName(REMOTE));
  fs.writeFileSync(
    path.join(dir, 'vault_alice_at_example_com.enc'),
    JSON.stringify({
      format: 'cred-ssh-manager-backup',
      // The CURRENT version, never a literal: this fixture exists to be a *valid* envelope,
      // not a v3 one. Pinned to 3 it would keep passing forever while quietly testing only
      // the legacy read path, and the share-append behaviour on the format actually being
      // written would have no coverage at all.
      version: CURRENT_WRAPPED_VERSION,
      kdf: 'hkdf',
      account: ACCOUNT,
      salt: 'c2FsdA==',
      iv: 'aXY=',
      tag: 'dGFn',
      data: 'eA==',
    }),
  );
  return f;
}

const SHARE = {
  id: 'share-1',
  fromEmail: 'bob@example.com',
  entityName: 'prod-db',
  entityKind: 'ssh',
  createdAt: 1,
  salt: 's',
  iv: 'i',
  tag: 't',
  data: 'd',
};

test('a share append that loses a push race re-reads and succeeds on the next attempt', async () => {
  // The owner's concurrency story, and the one path a live repository cannot be made to take
  // on demand: two people writing the same recipient's envelope at once. The change is a set
  // operation, so replaying it on fresher content is always correct.
  const f = withVault();
  f.failNext('push', '! [rejected] (non-fast-forward)');

  await f.transport.appendShares(ACCOUNT, { account: ACCOUNT } as never, [SHARE as never]);

  const pushes = f.calls.filter((c) => c.includes('push')).length;
  assert.equal(pushes, 2, 'one rejected, one that landed');
});

test('a share append gives up after three losses, saying nothing was lost', async () => {
  const f = withVault();
  for (let i = 0; i < 3; i += 1) {
    f.failNext('push', '! [rejected] (non-fast-forward)');
  }

  await assert.rejects(
    () => f.transport.appendShares(ACCOUNT, { account: ACCOUNT } as never, [SHARE as never]),
    (error: unknown) => /kept changing/.test((error as Error).message) && /Nothing was lost/.test((error as Error).message),
  );
});
