import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { GitRunner, GitTransport } from '../gitTransport';
import { cloneDirName } from '../gitRemote';
import { SerialQueue } from '../serialQueue';
import { StoredAccount } from '../types';

/**
 * Two callers, one working directory.
 *
 * <p>`TransportFactory` caches ONE transport per location, and twelve call sites reach it
 * independently — the sync cycle, Share with team, accept-share, Add/Remove Security Key,
 * the backup scheduler. Only the sync cycle guards against itself. Every read hard-resets
 * the working directory onto the remote, so a read that starts while a write sits between
 * `fs.writeFileSync` and `git commit` discards that write — and the write then finds a clean
 * `git status`, concludes there was nothing to commit, and reports success.</p>
 *
 * <p>The fake git below models the four commands that matter well enough for the loss to be
 * observable: `reset` restores the file from the remote, `add` snapshots whatever is in the
 * working tree, `status` compares, `commit`/`push` publish. So the assertion is what actually
 * reached the remote, not the order the arguments happened to arrive in.</p>
 */

const ACCOUNT: StoredAccount = {
  accountId: 'acct-1',
  email: 'alice@example.com',
  provider: 'microsoft',
} as StoredAccount;

const REMOTE = { url: 'git@github.com:me/vault.git', scheme: 'ssh' as const };
const VAULT_FILE = 'vault_alice_at_example_com.enc';
/** What the remote holds, and therefore what a hard reset restores. */
const REMOTE_CONTENT = '{"remote":true}';

interface Model {
  transport: GitTransport;
  /** Resolves once the transport has reached `token` and is waiting there. */
  reached(token: string): Promise<void>;
  release(): void;
  /** The content that actually made it to the remote. */
  pushed(): string | undefined;
}

function gitModel(): Model {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-gitserial-'));
  const dir = path.join(root, cloneDirName(REMOTE));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  const file = path.join(dir, VAULT_FILE);
  fs.writeFileSync(file, REMOTE_CONTENT);

  let index: string | undefined;
  let committed = REMOTE_CONTENT;
  let pushed: string | undefined;

  let gate: string | undefined = 'add';
  let onReached: (() => void) | undefined;
  let released: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    released = resolve;
  });

  const read = (): string => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch {
      return '';
    }
  };

  /** The five commands that decide whether a write survives. Everything else is a no-op. */
  const commands: Record<string, () => string> = {
    reset: () => {
      fs.writeFileSync(file, committed); // reset --hard: the working tree is discarded
      return '';
    },
    add: () => {
      index = read();
      return '';
    },
    status: () => (index === committed ? '' : ' M ' + VAULT_FILE),
    commit: () => {
      committed = index ?? committed;
      return '';
    },
    push: () => {
      pushed = committed;
      return '';
    },
  };

  const apply = (args: readonly string[]): string => {
    const name = Object.keys(commands).find((command) => args.includes(command));
    return name === undefined ? '' : commands[name]();
  };

  const run: GitRunner = async (args) => {
    if (gate !== undefined && args.includes(gate)) {
      gate = undefined; // pause the FIRST arrival only
      onReached?.();
      await hold;
    }
    return { exitCode: 0, stdout: apply(args), stderr: '' };
  };

  const transport = new GitTransport(
    REMOTE.url,
    REMOTE,
    root,
    run,
    () => Promise.resolve({ kind: 'inherit' as const }),
    () => [ACCOUNT],
  );

  return {
    transport,
    reached: () => new Promise<void>((resolve) => {
      onReached = resolve;
    }),
    release: () => released?.(),
    pushed: () => pushed,
  };
}

/** Let anything already runnable run, without ordering assumptions about how many turns it needs. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('a read starting mid-write cannot discard the write, silently or otherwise', async () => {
  const g = gitModel();
  const waiting = g.reached('add');

  const writing = g.transport.writeVault(ACCOUNT, '{"new":true}');
  await waiting; // the write has produced its file and is about to `git add`

  const reading = g.transport.readVault(ACCOUNT); // would fetch + reset --hard
  await settle();

  g.release();
  await Promise.all([writing, reading]);

  assert.equal(g.pushed(), '{"new":true}', 'the write reached the remote instead of being reset away');
});

test('the first two syncs cannot both decide the clone is missing', async () => {
  // Two callers arriving together on a fresh location: `cloned` is false for both, so both
  // run ensureClone and two `git clone` processes race into the same target directory.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-gitclone-'));
  const calls: string[][] = [];
  const run: GitRunner = async (args) => {
    calls.push([...args]);
    await new Promise((resolve) => setImmediate(resolve)); // a subprocess is not instant
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const transport = new GitTransport(REMOTE.url, REMOTE, root, run, () => Promise.resolve({ kind: 'inherit' }), () => [ACCOUNT]);

  await Promise.all([transport.readVault(ACCOUNT), transport.readVault(ACCOUNT)]);

  const clones = calls.filter((c) => c.includes('clone')).length;
  assert.equal(clones, 1, 'one clone, not two into the same directory');
});

test('a failed operation does not wedge the queue behind it', async () => {
  const queue = new SerialQueue();
  const failing = queue.run(() => Promise.reject(new Error('boom')));

  await assert.rejects(() => failing, /boom/);
  assert.equal(await queue.run(() => Promise.resolve('next')), 'next');
});

test('the queue preserves submission order', async () => {
  const queue = new SerialQueue();
  const order: number[] = [];
  const slow = (n: number, turns: number) => queue.run(async () => {
    for (let i = 0; i < turns; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    order.push(n);
  });

  await Promise.all([slow(1, 5), slow(2, 1), slow(3, 0)]);

  assert.deepEqual(order, [1, 2, 3], 'a fast third caller cannot overtake a slow first');
});
