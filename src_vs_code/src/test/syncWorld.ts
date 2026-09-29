import { configStub, loadWithVscode } from './vscodeStub';
import { resignEnvelopeWraps } from '../cryptoUtils';
import { emptySnapshot } from '../syncMerge';
import { StoredAccount, TreeNode } from '../types';

/**
 * The sync cycle's test world — a `SyncManager` over a fake storage, keys and transport, with every
 * warning, write and applied snapshot recorded. Moved out of `syncManager.test.ts` when that file
 * reached the 800-line ceiling (entry-PIN plan P8 added the protection-conflict tests), so
 * `syncProtection`'s order test and the cycle's own tests share one harness rather than two copies.
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

export type Sync = typeof import('../syncManager');

export const A: StoredAccount = { accountId: 'a1', email: 'me@corp.com', provider: 'google' };

/**
 * A node the real validators accept.
 *
 * <p>`isSshEnabled` is REQUIRED by `isEntityMetadata`, and leaving it out is not a small
 * inaccuracy: `isBackupBundle` then rejects the decrypted payload, `syncProfile` throws
 * `corrupted` before it ever reaches the merge, and every test asserting "nothing was
 * written" passes without exercising the guard it names. Three of the tests below did
 * exactly that until this was fixed.</p>
 */
export function node(id: string, name: string): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    parentId: null,
    details: { id, name, kind: 'credential', isSshEnabled: false },
  } as unknown as TreeNode;
}

/**
 * A real envelope, SIGNED the way every writer of a v3+ file signs it.
 *
 * <p>It used to be built unsigned, and that was a fixture no production path can produce:
 * `encryptJsonWrapped` and `resignEnvelopeWraps` both write a `mac`, and since the 2026-09-09
 * audit's finding #2 an absent signature on a v3+ file is `bad` rather than "legacy, carry on".
 * Three enrolment tests were passing against a file that could not exist.</p>
 *
 * <p>Signed with {@link SIGNING_MASTER}, which is also what `WRAPPED_KEY` carries — so the tests
 * that exercise the MAC branch (`key.version === 2`) hold a file whose signature actually matches
 * their key. `mac` given explicitly still wins: that is how the tamper test presents a WRONG
 * signature, which is a different thing from an absent one.</p>
 */
export const SIGNING_MASTER = Buffer.alloc(32, 7);

export function envelope(options: { version?: number; mac?: string } = {}): string {
  const version = options.version ?? 3;
  const body = JSON.stringify({
    format: 'cred-ssh-manager-backup',
    version,
    kdf: 'hkdf',
    account: A,
    salt: 's',
    iv: 'i',
    tag: 't',
    data: 'd',
  });
  return signed(body, version, options.mac);
}

/** An explicit `mac` wins; v1 and v2 were legitimately written unsigned; v3+ is signed for real. */
export function signed(body: string, version: number, mac: string | undefined): string {
  if (mac !== undefined) {
    return JSON.stringify({ ...(JSON.parse(body) as object), mac });
  }
  return version < 3 ? body : resignEnvelopeWraps(body, [], SIGNING_MASTER);
}

export interface World {
  mod: Sync;
  writes: string[];
  applied: number;
  warnings: string[];
  errors: string[];
  logs: string[];
  /**
   * Every warning WITH the buttons it offered. `warnings` keeps only the text, and the
   * buttons are the whole question for a locked vault: what the person is invited to do
   * about it is a different fact from what they were told.
   */
  prompts: { message: string; buttons: string[] }[];
  /** The wrap list `encrypt` was handed, when the cycle passed one. Undefined = it did not. */
  escrowWraps?: unknown[];
  /** What the cycle wrote back into local storage, when it applied anything. */
  appliedSnapshot?: unknown;
  /** Revisions recorded and snapshots applied, in the order the cycle did them. */
  order: string[];
  /** The revisions the cycle recorded, by entity id. */
  recorded: Record<string, unknown>;
}

export interface Parts {
  raw?: string;
  /** undefined = the vault stays locked. */
  key?: { masterKey: Buffer; version: number };
  remoteNodes?: TreeNode[];
  localNodes?: TreeNode[];
  metadataFault?: string;
  embedsShares?: boolean;
  changeToken?: string;
  /** entityId -> login/URL JSON, as the SLOT the 0.82 fields feature writes. */
  remoteFields?: Record<string, string>;
  localFields?: Record<string, string>;
  /** Any other LOCAL secret slot, by name. */
  localExtra?: Record<string, unknown>;
  /** Any other secret slot, by name — what the per-slot guard below varies. */
  remoteExtra?: Record<string, unknown>;
  /** What `vaultKeys.storedPin` answers. undefined = this machine has no Sync PIN stored. */
  storedPin?: string;
  /** The keychain REFUSES to answer — a third state, and not the same as "no PIN stored". */
  storedPinThrows?: boolean;
}

export function world(): World {
  const w: World = {
    mod: undefined as never,
    writes: [],
    applied: 0,
    warnings: [],
    errors: [],
    logs: [],
    prompts: [],
    order: [],
    recorded: {},
  };
  const config = configStub({ autoSync: false });
  w.mod = loadWithVscode<Sync>('../syncManager', {
    workspace: {
      getConfiguration: config.workspace.getConfiguration,
      onDidChangeConfiguration: (): { dispose(): void } => ({ dispose: (): void => undefined }),
    },
    window: {
      showWarningMessage: (m: string, ...buttons: string[]): Promise<undefined> => {
        w.warnings.push(m);
        w.prompts.push({ message: m, buttons });
        return Promise.resolve(undefined);
      },
      showErrorMessage: (m: string): Promise<undefined> => {
        w.errors.push(m);
        return Promise.resolve(undefined);
      },
      showInformationMessage: (m: string): Promise<undefined> => {
        w.warnings.push(m);
        return Promise.resolve(undefined);
      },
    },
    ConfigurationTarget: { Global: 1 },
  });
  return w;
}

export function manager(w: World, parts: Parts): InstanceType<Sync['SyncManager']> {
  const localSnapshot = {
    ...emptySnapshot(),
    nodes: parts.localNodes ?? [],
    fields: parts.localFields ?? {},
    ...parts.localExtra,
  };
  const storage = {
    getAccounts: (): StoredAccount[] => [A],
    changeToken: (): string => parts.changeToken ?? 'token-1',
    getSnapshot: (): Promise<unknown> => Promise.resolve(localSnapshot),
    applySnapshot: (_id: string, snapshot: unknown): Promise<void> => {
      w.applied += 1;
      w.appliedSnapshot = snapshot;
      w.order.push('apply');
      return Promise.resolve();
    },
    recordRevision: (_a: string, id: string, revision: unknown): Promise<void> => {
      w.order.push(`record ${id}`);
      w.recorded[id] = revision;
      return Promise.resolve();
    },
    get metadataFault(): string | undefined {
      return parts.metadataFault;
    },
  };
  const keys = {
    unlock: (): Promise<unknown> => Promise.resolve(parts.key),
    storedPin: (): Promise<string | undefined> =>
      parts.storedPinThrows === true
        ? Promise.reject(new Error('the keychain refused'))
        : Promise.resolve(parts.storedPin),
    decrypt: (): Promise<unknown> =>
      Promise.resolve({
        ...emptySnapshot(),
        nodes: parts.remoteNodes ?? [],
        fields: parts.remoteFields ?? {},
        ...(parts.remoteExtra ?? {}),
        version: 1,
        accountId: 'a1',
      }),
    encrypt: (bundle: unknown, _k: unknown, _a: unknown, _s: unknown, wraps?: unknown[]): Promise<string> => {
      // Recorded rather than ignored: whether a cycle changed the wrap list is the whole
      // question the corporate-escrow tests below ask, and it is invisible in the ciphertext.
      w.escrowWraps = wraps === undefined ? w.escrowWraps : [...wraps];
      return Promise.resolve(JSON.stringify(bundle));
    },
  };
  const transport = {
    location: '/mnt/nas',
    kind: 'folder' as const,
    embedsShares: parts.embedsShares ?? false,
    readVault: (): Promise<string | undefined> => Promise.resolve(parts.raw),
    writeVault: (_a: unknown, content: string): Promise<void> => {
      w.writes.push(content);
      return Promise.resolve();
    },
    listTeam: (): Promise<unknown[]> => Promise.resolve([]),
    listShares: (): Promise<unknown[]> => Promise.resolve([]),
    appendShares: (): Promise<void> => Promise.resolve(),
    removeShare: (): Promise<void> => Promise.resolve(),
    deleteVault: (): Promise<void> => Promise.resolve(),
  };
  const transports = { forAccount: (): unknown => transport };
  return new w.mod.SyncManager(
    storage as never,
    keys as never,
    transports as never,
    () => undefined,
    undefined,
    undefined,
    {
      info: (_s: string, m: string): void => {
        w.logs.push(m);
      },
      error: (_s: string, m: string): void => {
        w.logs.push(m);
      },
    },
  );
}

export const KEY = { masterKey: Buffer.alloc(32, 1), version: 3 };
