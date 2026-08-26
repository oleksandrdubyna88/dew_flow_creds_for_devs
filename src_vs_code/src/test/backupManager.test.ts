import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { configStub, loadWithVscode } from './vscodeStub';
import { StoredAccount } from '../types';

/**
 * "Backup to NAS" (audit A3).
 *
 * <p>This command writes the SAME file automatic sync reads, which is what makes its failure
 * modes expensive rather than annoying. The one recorded here in the code's own comments: it
 * used to ask for a PIN up front and write a PIN-only envelope over that file, so a vault with
 * a security key registered came back as a vault without one — the key silently removed by a
 * backup. `backupPlan.ts` decides which mode a file may be written in and is tested there;
 * what is only true HERE is that the decision is obeyed, that a locked vault leaves the file
 * untouched, and that the PIN is never asked for when it is not needed.</p>
 *
 * <p>The other property is per-account isolation: one unreachable folder must cost that
 * account its backup and no other. A loop that threw would leave the accounts after the
 * failure silently unbacked, which looks identical to success from the outside.</p>
 */

type Backup = typeof import('../backupManager');

const A: StoredAccount = { accountId: 'a1', email: 'me@corp.com', provider: 'google' };
const B: StoredAccount = { accountId: 'a2', email: 'work@corp.com', provider: 'microsoft' };

// The names `planBackupFileNames` actually plans — read from it rather than guessed, because the
// provider suffix appears ONLY when two accounts share an email, and a guessed name would make
// every "existing file" here invisible and quietly test the empty-file path instead.
const MY_VAULT = 'vault_me_at_corp_com.enc';
const THEIR_VAULT = 'vault_work_at_corp_com.enc';
const MY_VAULT_GOOGLE = 'vault_me_at_corp_com_google.enc';
const MY_VAULT_MS = 'vault_me_at_corp_com_microsoft.enc';

/**
 * An envelope carrying a SECURITY-KEY wrap — the shape that must never be overwritten.
 *
 * <p>The discriminant is `kind`, not `type`. Getting it wrong does not fail loudly: an
 * unrecognised wrap simply is not a webauthn wrap, so `backupWriteMode` answers `pin` and the
 * test silently exercises the very path it was written to prove is NOT taken.</p>
 */
function wrappedEnvelope(): string {
  return JSON.stringify({
    format: 'cred-ssh-manager-backup',
    version: 4,
    kdf: 'hkdf',
    account: A,
    salt: 's',
    iv: 'i',
    tag: 't',
    data: 'd',
    wraps: [{ kind: 'webauthn', id: 'k1', salt: 's', iv: 'i', tag: 't', data: 'd' }],
    // A COMPLETE share item: `sharesFromEnvelope` validates the shape, and a thin stub is
    // silently dropped — which would make the test below pass for the wrong reason.
    shares: [
      {
        id: 'pending-1',
        fromEmail: 'peer@corp.com',
        entityName: 'prod',
        entityKind: 'ssh',
        createdAt: 1,
        salt: 's',
        iv: 'i',
        tag: 't',
        data: 'd',
      },
    ],
  });
}

interface World {
  mod: Backup;
  files: Map<string, string>;
  writes: { name: string; content: string }[];
  infos: string[];
  errors: string[];
  /** Answers for the PIN input boxes, in order. */
  pins: (string | undefined)[];
  prompts: string[];
  unlocks: number;
}

function world(options: { settings?: Record<string, unknown>; pins?: (string | undefined)[]; existing?: Record<string, string> }): World {
  const w: World = {
    mod: undefined as never,
    files: new Map(Object.entries(options.existing ?? {})),
    writes: [],
    infos: [],
    errors: [],
    pins: [...(options.pins ?? [])],
    prompts: [],
    unlocks: 0,
  };
  const config = configStub(options.settings ?? { nasBackupPath: '/mnt/nas' });
  const nameOf = (uri: { fsPath: string }): string => uri.fsPath.split('/').pop() ?? '';
  w.mod = loadWithVscode<Backup>('../backupManager', {
    workspace: {
      getConfiguration: config.workspace.getConfiguration,
      fs: {
        readFile: (uri: { fsPath: string }): Promise<Uint8Array> => {
          const found = w.files.get(nameOf(uri));
          return found === undefined
            ? Promise.reject(new Error('ENOENT'))
            : Promise.resolve(Buffer.from(found, 'utf8'));
        },
        writeFile: (uri: { fsPath: string }, data: Uint8Array): Promise<void> => {
          w.files.set(nameOf(uri), Buffer.from(data).toString('utf8'));
          return Promise.resolve();
        },
        rename: (from: { fsPath: string }, to: { fsPath: string }): Promise<void> => {
          const content = w.files.get(nameOf(from)) ?? '';
          w.files.delete(nameOf(from));
          w.files.set(nameOf(to), content);
          w.writes.push({ name: nameOf(to), content });
          return Promise.resolve();
        },
        delete: (): Promise<void> => Promise.resolve(),
        createDirectory: (): Promise<void> => Promise.resolve(),
        stat: (): Promise<{ type: number }> => Promise.resolve({ type: 2 }),
      },
    },
    Uri: {
      file: (p: string): { fsPath: string } => ({ fsPath: p }),
      joinPath: (b: { fsPath: string }, n: string): { fsPath: string } => ({ fsPath: `${b.fsPath}/${n}` }),
    },
    FileType: { File: 1, Directory: 2 },
    ConfigurationTarget: { Global: 1 },
    window: {
      showInputBox: (o: { prompt?: string }): Promise<string | undefined> => {
        w.prompts.push(o.prompt ?? '');
        return Promise.resolve(w.pins.shift());
      },
      showInformationMessage: (m: string): Promise<undefined> => {
        w.infos.push(m);
        return Promise.resolve(undefined);
      },
      showErrorMessage: (m: string): Promise<undefined> => {
        w.errors.push(m);
        return Promise.resolve(undefined);
      },
      showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined),
      showOpenDialog: (): Promise<undefined> => Promise.resolve(undefined),
    },
  });
  return w;
}

function storageOf(accounts: StoredAccount[]): unknown {
  return {
    getAccounts: (): StoredAccount[] => accounts,
    exportBundle: (id: string): Promise<unknown> =>
      Promise.resolve({ version: 1, accountId: id, nodes: [], secrets: {} }),
  };
}

/** A VaultKeys that can unlock, or one that cannot. */
function vaultKeys(w: World, options: { unlocks?: boolean } = {}): unknown {
  return {
    unlock: (): Promise<Buffer | undefined> => {
      w.unlocks += 1;
      return Promise.resolve(options.unlocks === false ? undefined : Buffer.alloc(32, 7));
    },
    encrypt: (_b: unknown, _k: unknown, _a: unknown, shares: unknown[]): Promise<string> =>
      Promise.resolve(JSON.stringify({ version: 4, wraps: ['carried'], shares })),
  };
}

test('with no accounts it says so and writes nothing', async () => {
  const w = world({});

  await w.mod.backupToNas(storageOf([]) as never, vaultKeys(w) as never);

  assert.deepEqual(w.writes, []);
  assert.match(w.infos[0], /add an account profile/);
});

test('a vault with a SECURITY KEY is unlocked through its own keys, never overwritten with a PIN file', async () => {
  // The recorded defect. Writing the PIN-only envelope over this file removed the ability to
  // open the vault with the registered key — a backup that destroyed a credential.
  const w = world({ existing: { [MY_VAULT]: wrappedEnvelope() }, pins: ['never-asked'] });

  await w.mod.backupToNas(storageOf([A]) as never, vaultKeys(w) as never);

  assert.equal(w.unlocks, 1, 'it went through the vault keys');
  assert.deepEqual(w.prompts, [], 'and never asked for a backup PIN');
  const written = JSON.parse(w.writes[0].content) as { wraps: string[] };
  assert.deepEqual(written.wraps, ['carried'], 'the key slots are carried into what is written');
});

test('a vault that stays LOCKED leaves the file exactly as it was', async () => {
  // "Nothing was written, so its keys are intact" — the only safe outcome when the person
  // cancels the security-key touch.
  const before = wrappedEnvelope();
  const w = world({ existing: { [MY_VAULT]: before } });

  await w.mod.backupToNas(storageOf([A]) as never, vaultKeys(w, { unlocks: false }) as never);

  assert.deepEqual(w.writes, []);
  assert.equal(w.files.get(MY_VAULT), before);
  assert.match(w.errors[0], /failed/, 'and it is reported rather than counted as written');
});

test('pending shares in the existing file survive the rewrite', async () => {
  // A colleague delivered a share a moment ago; a backup that dropped it would tell the
  // sender it had been delivered while the recipient never sees it.
  const w = world({ existing: { [MY_VAULT]: wrappedEnvelope() } });

  await w.mod.backupToNas(storageOf([A]) as never, vaultKeys(w) as never);

  const written = JSON.parse(w.writes[0].content) as { shares: { id: string }[] };
  assert.deepEqual(written.shares.map((s) => s.id), ['pending-1']);
});

test('the file is written atomically — a dropped NAS connection leaves the previous good one', async () => {
  // This writes the same file automatic sync treats as authoritative, so a truncated write
  // is not a lost backup but a lost vault.
  const w = world({ existing: { [MY_VAULT]: wrappedEnvelope() } });

  await w.mod.backupToNas(storageOf([A]) as never, vaultKeys(w) as never);

  assert.equal(w.writes.length, 1, 'the rename is what publishes it');
  assert.equal(w.writes[0].name, MY_VAULT);
});

test('two accounts get two DIFFERENT files, even sharing an email', async () => {
  // One email under two providers overwriting each other's backup is a silent loss.
  const sameEmail: StoredAccount = { accountId: 'a3', email: 'me@corp.com', provider: 'microsoft' };
  const w = world({
    existing: {
      [MY_VAULT_GOOGLE]: wrappedEnvelope(),
      [MY_VAULT_MS]: wrappedEnvelope(),
    },
  });

  await w.mod.backupToNas(storageOf([A, sameEmail]) as never, vaultKeys(w) as never);

  assert.equal(new Set(w.writes.map((x) => x.name)).size, 2, w.writes.map((x) => x.name).join());
});

test('one account failing does not stop the others', async () => {
  // An unplugged NAS for one account must not leave every account after it in the loop
  // silently unbacked — which looks identical to success from the outside.
  const w = world({
    existing: { [MY_VAULT]: wrappedEnvelope(), [THEIR_VAULT]: wrappedEnvelope() },
  });
  let attempts = 0;
  const keys = {
    unlock: (): Promise<Buffer> => {
      attempts += 1;
      return Promise.resolve(Buffer.alloc(32, 7));
    },
    encrypt: (_b: unknown, _k: unknown, account: StoredAccount): Promise<string> =>
      account.accountId === A.accountId
        ? Promise.reject(new Error('folder unreachable'))
        : Promise.resolve(JSON.stringify({ version: 4, wraps: [], shares: [] })),
  };

  await w.mod.backupToNas(storageOf([A, B]) as never, keys as never);

  assert.equal(attempts, 2, 'both accounts were attempted');
  assert.deepEqual(w.writes.map((x) => x.name), [THEIR_VAULT], 'the reachable one still got its backup');
  assert.match(w.errors[0], /me@corp\.com/, 'and the failure names the account that lost one');
});

test('the error summary reports how many succeeded, not just that something broke', async () => {
  const w = world({ existing: { [MY_VAULT]: wrappedEnvelope() } });

  await w.mod.backupToNas(storageOf([A]) as never, vaultKeys(w, { unlocks: false }) as never);

  assert.match(w.errors[0], /written: 0/);
});

test('a successful run says how many profiles were backed up', async () => {
  const w = world({ existing: { [MY_VAULT]: wrappedEnvelope() } });

  await w.mod.backupToNas(storageOf([A]) as never, vaultKeys(w) as never);

  assert.match(w.infos[0], /Backed up 1 account profile/);
});

test('cancelling the restore file picker does nothing at all', async () => {
  const w = world({});
  let restored = 0;

  await w.mod.restoreFromBackup(storageOf([A]) as never, vaultKeys(w) as never, () => {
    restored += 1;
  });

  assert.equal(restored, 0);
  assert.deepEqual(w.errors, [], 'cancelling is not a failure');
});
