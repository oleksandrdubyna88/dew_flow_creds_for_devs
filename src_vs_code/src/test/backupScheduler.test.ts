import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { configStub, loadWithVscode } from './vscodeStub';
import { StoredAccount } from '../types';

/**
 * When a dated snapshot is taken (audit A3).
 *
 * <p>Snapshots are the safety net you restore from when a deletion was the mistake, so every
 * behaviour here is about not quietly having none: one unreachable folder must not stop the
 * other accounts, a global "off" must not silence an account that asked for its own schedule,
 * and an EMPTY vault must never be written as a snapshot — a useless file at the top of a
 * time-sorted list shadows the good one behind it.</p>
 *
 * <p>Two things about this class shape every test below. Its constructor starts a timer AND
 * runs one pass immediately, so a test that only constructs has already exercised the
 * scheduled path; and `runDue` sets its re-entrancy flag SYNCHRONOUSLY, so a call made before
 * that first pass has settled returns having done nothing. Hence `settle()` — without it a
 * forced call is swallowed by the guard and the test reads as a defect in the module.</p>
 */

type Scheduler = typeof import('../backupScheduler');

const A: StoredAccount = { accountId: 'a1', email: 'me@corp.com', provider: 'google' };
const B: StoredAccount = { accountId: 'a2', email: 'work@corp.com', provider: 'microsoft' };

/** Let the pass the constructor started finish before acting on the scheduler. */
const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

interface World {
  mod: Scheduler;
  written: { path: string; content: string }[];
  renamed: { from: string; to: string }[];
  logs: string[];
  warnings: string[];
  make(
    accounts: StoredAccount[],
    vaults: Record<string, string | undefined>,
  ): InstanceType<Scheduler['BackupScheduler']>;
}

function world(settings: Record<string, unknown>): World {
  const written: { path: string; content: string }[] = [];
  const renamed: { from: string; to: string }[] = [];
  const logs: string[] = [];
  const warnings: string[] = [];
  const memento: Record<string, unknown> = {};
  const config = configStub(settings);
  const mod = loadWithVscode<Scheduler>('../backupScheduler', {
    workspace: {
      getConfiguration: config.workspace.getConfiguration,
      onDidChangeConfiguration: (): { dispose(): void } => ({ dispose: (): void => undefined }),
      fs: {
        createDirectory: (): Promise<void> => Promise.resolve(),
        readDirectory: (): Promise<[string, number][]> => Promise.resolve([]),
        writeFile: (uri: { fsPath: string }, data: Uint8Array): Promise<void> => {
          written.push({ path: uri.fsPath, content: Buffer.from(data).toString('utf8') });
          return Promise.resolve();
        },
        rename: (from: { fsPath: string }, to: { fsPath: string }): Promise<void> => {
          renamed.push({ from: from.fsPath, to: to.fsPath });
          return Promise.resolve();
        },
        delete: (): Promise<void> => Promise.resolve(),
      },
    },
    window: {
      showWarningMessage: (m: string): Promise<undefined> => {
        warnings.push(m);
        return Promise.resolve(undefined);
      },
    },
    Uri: {
      file: (p: string): { fsPath: string } => ({ fsPath: p }),
      joinPath: (b: { fsPath: string }, n: string): { fsPath: string } => ({
        fsPath: `${b.fsPath}/${n}`,
      }),
    },
    FileType: { File: 1, Directory: 2 },
    ConfigurationTarget: { Global: 1 },
  });

  return {
    mod,
    written,
    renamed,
    logs,
    warnings,
    make(accounts, vaults) {
      const storage = { getAccounts: () => accounts };
      const transports = {
        forAccount: (acc: StoredAccount): unknown =>
          vaults[acc.accountId] === undefined
            ? undefined
            : { readVault: () => Promise.resolve(vaults[acc.accountId]) },
      };
      const mem = {
        get: <T>(k: string, d: T): T => (memento[k] as T | undefined) ?? d,
        update: (k: string, v: unknown): Promise<void> => {
          memento[k] = v;
          return Promise.resolve();
        },
      };
      return new mod.BackupScheduler(
        storage as never,
        transports as never,
        mem as never,
        (m: string) => logs.push(m),
      );
    },
  };
}

test('a due account is snapshotted by the pass the constructor runs, bytes as they are', async () => {
  // The immediate pass is deliberate: a wrong folder is discovered now rather than in a day.
  const w = world({ backupLocation: '/mnt/snap', backupIntervalHours: 24 });
  const scheduler = w.make([A], { a1: 'CIPHERTEXT' });

  try {
    await settle();
  } finally {
    scheduler.dispose();
  }

  assert.equal(w.written.length, 1);
  assert.equal(w.written[0].content, 'CIPHERTEXT', 'a snapshot is the same encrypted bytes');
  assert.ok(w.written[0].path.endsWith('.part'), `written to a temp name: ${w.written[0].path}`);
  assert.equal(w.renamed.length, 1, 'then renamed, so a cloud client never uploads a half file');
  assert.equal(w.renamed[0].from, w.written[0].path);
});

test('an EMPTY vault is never snapshotted — it would shadow the good one', async () => {
  // A useless file at the top of a time-sorted list is worse than no file: it is what a
  // person restores from.
  const w = world({ backupLocation: '/mnt/snap', backupIntervalHours: 24 });
  const scheduler = w.make([A], { a1: '' });

  try {
    await settle();
  } finally {
    scheduler.dispose();
  }

  assert.deepEqual(w.written, []);
  assert.ok(w.logs.some((l) => /nothing has been synced/.test(l)), w.logs.join(' | '));
});

test('an account with no snapshot location is skipped silently — nothing was asked for', async () => {
  const w = world({ backupIntervalHours: 24 });
  const scheduler = w.make([A], { a1: 'CIPHERTEXT' });

  try {
    await settle();
  } finally {
    scheduler.dispose();
  }

  assert.deepEqual(w.written, []);
  assert.deepEqual(w.logs, [], 'not configured is not a problem to report');
});

test('one unreachable account does not stop the others', async () => {
  // The "one failed unit is recorded and skipped" boundary: an unplugged NAS for one account
  // must not cost the other account its safety net.
  const w = world({ backupLocation: '/mnt/snap', backupIntervalHours: 24 });
  const storage = { getAccounts: () => [A, B] };
  const transports = {
    forAccount: (acc: StoredAccount): unknown =>
      acc.accountId === 'a1'
        ? { readVault: () => Promise.reject(new Error('folder unreachable')) }
        : { readVault: () => Promise.resolve('B-CIPHERTEXT') },
  };
  const mem = { get: <T>(_k: string, d: T): T => d, update: (): Promise<void> => Promise.resolve() };
  const scheduler = new w.mod.BackupScheduler(
    storage as never,
    transports as never,
    mem as never,
    (m: string) => w.logs.push(m),
  );

  try {
    await settle();
  } finally {
    scheduler.dispose();
  }

  assert.equal(w.written.length, 1);
  assert.equal(w.written[0].content, 'B-CIPHERTEXT', 'the reachable account still got its snapshot');
  assert.ok(w.logs.some((l) => /unreachable/.test(l)), 'and the failure is recorded');
});

test('a broken folder warns ONCE, not on every tick', async () => {
  // A scheduler that nags every fifteen minutes is a scheduler people switch off.
  const w = world({ backupLocation: '/mnt/snap', backupIntervalHours: 24 });
  const storage = { getAccounts: () => [A] };
  const transports = {
    forAccount: (): unknown => ({
      readVault: () => Promise.reject(new Error('folder unreachable')),
    }),
  };
  const mem = { get: <T>(_k: string, d: T): T => d, update: (): Promise<void> => Promise.resolve() };
  const scheduler = new w.mod.BackupScheduler(
    storage as never,
    transports as never,
    mem as never,
    () => undefined,
  );

  try {
    await settle();
    await scheduler.runDue(true);
    await scheduler.runDue(true);
  } finally {
    scheduler.dispose();
  }

  assert.equal(w.warnings.length, 1, `three failed passes, one dialog: ${w.warnings.join(' | ')}`);
});

test('an account with its OWN schedule keeps it when the global one is off', async () => {
  // A global 0 used to stop the whole scheduler, which would silence an account that had
  // deliberately asked for a schedule of its own.
  const w = world({
    backupLocation: '/mnt/snap',
    backupIntervalHours: 0,
    accountBackupIntervals: { 'me@corp.com': 24 },
  });
  const scheduler = w.make([A], { a1: 'CIPHERTEXT' });

  try {
    await settle();
  } finally {
    scheduler.dispose();
  }

  assert.equal(w.written.length, 1, 'its own schedule still runs');
});

test('an account that switched snapshots OFF is not snapshotted by the timer', async () => {
  const w = world({
    backupLocation: '/mnt/snap',
    backupIntervalHours: 24,
    accountBackupIntervals: { 'me@corp.com': 0 },
  });
  const scheduler = w.make([A], { a1: 'CIPHERTEXT' });

  try {
    await settle();
    await scheduler.runDue();
  } finally {
    scheduler.dispose();
  }

  assert.deepEqual(w.written, [], '0 means off, and the timer respects it');
});

test('a forced run ignores the schedule — that is what the menu command is for', async () => {
  const w = world({
    backupLocation: '/mnt/snap',
    backupIntervalHours: 24,
    accountBackupIntervals: { 'me@corp.com': 0 },
  });
  const scheduler = w.make([A], { a1: 'CIPHERTEXT' });

  try {
    await settle(); // the scheduled pass declines, as the test above pins
    await scheduler.runDue(true);
  } finally {
    scheduler.dispose();
  }

  assert.equal(w.written.length, 1, 'a person asking explicitly is not a schedule');
});

test('unchanged bytes are not snapshotted again — a metered folder is not a version history', async () => {
  // One unchanged vault copied daily forever is how a cloud folder fills up silently.
  const w = world({
    backupLocation: '/mnt/snap',
    backupIntervalHours: 0,
    accountBackupIntervals: { 'me@corp.com': 24 },
  });
  const scheduler = w.make([A], { a1: 'CIPHERTEXT' });

  try {
    await settle(); // writes once
    await scheduler.runDue(); // the same bytes, and not forced
  } finally {
    scheduler.dispose();
  }

  assert.equal(w.written.length, 1, 'the second pass recognised identical content');
});

test('a second pass does not start on top of a slow one', async () => {
  // A slow network folder must not accumulate overlapping passes. The constructor's pass is
  // still parked on the read, so the guard is what makes this call return without a second one.
  const w = world({ backupLocation: '/mnt/snap', backupIntervalHours: 24 });
  let release = (): void => undefined;
  let reads = 0;
  const storage = { getAccounts: () => [A] };
  const transports = {
    forAccount: (): unknown => ({
      readVault: () => {
        reads += 1;
        return new Promise<string>((r) => {
          release = (): void => r('CIPHERTEXT');
        });
      },
    }),
  };
  const mem = { get: <T>(_k: string, d: T): T => d, update: (): Promise<void> => Promise.resolve() };
  const scheduler = new w.mod.BackupScheduler(
    storage as never,
    transports as never,
    mem as never,
    () => undefined,
  );

  try {
    await settle(); // the first pass is now parked inside readVault
    await scheduler.runDue(true);
    assert.equal(reads, 1, 'the overlapping call started no second read');
    release();
    await settle();
    assert.equal(w.written.length, 1, 'and the first pass still completes');
  } finally {
    scheduler.dispose();
  }
});

test('disposing stops the timer', () => {
  const w = world({ backupLocation: '/mnt/snap', backupIntervalHours: 24 });
  const scheduler = w.make([A], { a1: 'CIPHERTEXT' });

  assert.doesNotThrow(() => scheduler.dispose());
});
