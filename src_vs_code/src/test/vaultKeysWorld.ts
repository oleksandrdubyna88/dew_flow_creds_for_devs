import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';
import { loadWithVscode, StubEventEmitter } from './vscodeStub';
import { encryptJsonWrapped } from '../cryptoUtils';
import { wrapWithPin } from '../keyWrap';
import type { StoredAccount } from '../types';

/**
 * A real `VaultKeys` over a Map-backed `SecretStorage` — the pieces `vaultKeysTamper.test.ts` built for
 * itself, shared since E2.1 with `vaultKeysLock.test.ts` (a lock is only worth testing on the real class).
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

export type VaultKeysModule = typeof import('../vaultKeys');

export const ACCOUNT: StoredAccount = { accountId: 'acct-1', email: 'me@corp.com', provider: 'google' };
export const PIN = 'correct horse battery staple';

/**
 * A `vscode.SecretStorage` backed by a Map.
 *
 * <p>Typed as the real interface rather than cast in at the call site: a cast there would let a
 * change to `SecretStorage` pass compilation and fail at runtime, which is the trap the TypeScript
 * rule names. The one `as never` that remains is on the event, which no test subscribes to.</p>
 */
export function secretStorage(stored: Map<string, string>): vscode.SecretStorage {
  return {
    get: (key: string): Thenable<string | undefined> => Promise.resolve(stored.get(key)),
    store: (key: string, value: string): Thenable<void> => {
      stored.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string): Thenable<void> => {
      stored.delete(key);
      return Promise.resolve();
    },
    onDidChange: (() => ({ dispose: (): void => undefined })) as never,
    keys: () => Promise.resolve([...stored.keys()]),
  } as vscode.SecretStorage;
}

/**
 * Store a PIN for ACCOUNT through the instance — the key it files a PIN under is its own business — so the
 * silent route (the one background sync takes) can open a vault without asking anybody anything.
 */
export async function storePin(keys: InstanceType<VaultKeysModule['VaultKeys']>, pin: string): Promise<void> {
  await (keys as unknown as { savePin(a: StoredAccount, p: string): Promise<void> }).savePin(ACCOUNT, pin);
}

/** `VaultKeys` holding one stored PIN, and a window onto the cache the refusal must leave empty. */
export async function keysHolding(pin: string | undefined, typed?: string): Promise<{
  keys: InstanceType<VaultKeysModule['VaultKeys']>;
  cache: Map<string, unknown>;
  stored: Map<string, string>;
}> {
  const stored = new Map<string, string>();
  const mod = loadWithVscode<VaultKeysModule>('../vaultKeys', {
    // The real class builds its lock event the way VS Code does (E2.1).
    EventEmitter: StubEventEmitter,
    window: {
      showWarningMessage: (): undefined => undefined,
      showErrorMessage: (): undefined => undefined,
      // What the person types when the vault asks. Present so the INTERACTIVE PIN route — the one
      // that persists what it was given — can be driven at all.
      showInputBox: (): Promise<string | undefined> => Promise.resolve(typed),
    },
    workspace: { getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }) },
  });
  const keys = new mod.VaultKeys(secretStorage(stored));
  if (pin !== undefined) {
    await storePin(keys, pin);
  }
  // The cache is private, and what the tamper file asserts about is precisely that it stays empty. One
  // reach-in, named, rather than an exported accessor that exists only for a test.
  const cache = (keys as unknown as { cache: Map<string, unknown> }).cache;
  return { keys, cache, stored };
}

/** A v4 vault openable by `PIN`, carrying a PIN wrap and a second wrap worth stripping. */
export function vaultWithTwoWraps(): { content: string; master: Buffer } {
  const master = randomBytes(32);
  const pinWrap = wrapWithPin(master, ACCOUNT.accountId, PIN, Date.now());
  const decoy = { ...pinWrap, kind: 'recovery' as const, id: 'recovery' };
  return { content: encryptJsonWrapped({ nodes: [] }, master, [pinWrap, decoy]), master };
}
