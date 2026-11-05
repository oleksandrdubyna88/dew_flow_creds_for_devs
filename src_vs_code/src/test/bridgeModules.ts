import * as assert from 'node:assert/strict';
import * as nodePath from 'node:path';
import { SerialQueue } from '../serialQueue';
import { loadEachWithVscode } from './vscodeStub';

/**
 * The bridge's pure modules, loaded for a test.
 *
 * <p>Pure by the rule that counts (no module here imports the editor), but `brokerRequests.ts` reaches
 * `grantLimits.ts` for the sentence of an expired grant, and that one reads a setting. So a test loads them in ONE
 * graph under a stub that answers nothing: the modules it needs never ask. Not a test file: `node:test` is
 * pointed at `*.test.js` only.</p>
 */

export interface BridgeModules {
  readonly scope: typeof import('../bridgeScope');
  readonly requests: typeof import('../brokerRequests');
  readonly secretRef: typeof import('../secretRef');
  readonly runPlan: typeof import('../runPlan');
  readonly entries: typeof import('../mcpEntries');
  readonly grants: typeof import('../grantRegistry');
}

export function loadBridgeModules(): BridgeModules {
  const [scope, requests, secretRef, runPlan, entries, grants] = loadEachWithVscode(
    ['../bridgeScope', '../brokerRequests', '../secretRef', '../runPlan', '../mcpEntries', '../grantRegistry'],
    { window: {}, workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) } },
  ) as [BridgeModules['scope'], BridgeModules['requests'], BridgeModules['secretRef'], BridgeModules['runPlan'], BridgeModules['entries'], BridgeModules['grants']];
  return { scope, requests, secretRef, runPlan, entries, grants };
}

/** A `Memento` subset that holds what it was given; `defer` makes `update` land a tick later, as a real one may. */
export function memento(defer = false): { get<T>(key: string): T | undefined; update(key: string, value: unknown): Thenable<void> } {
  const held = new Map<string, unknown>();
  return {
    get: <T,>(key: string): T | undefined => held.get(key) as T | undefined,
    update: (key: string, value: unknown): Thenable<void> =>
      defer
        ? new Promise<void>((resolve) => {
            setImmediate(() => {
              held.set(key, value);
              resolve();
            });
          })
        : Promise.resolve(void held.set(key, value)),
  };
}

/** A value a test needs to be there: it fails with `what` when it is not, and hands the value on without a branch at the call site. */
export function present<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new assert.AssertionError({ message: `expected ${what} to be there` });
  }
  return value;
}

/** The scope directory a test that needs no real disk uses. */
export const SCOPES_TEST_DIR = '/scopes';

/** `ScopeFs` over a map: what a `.json` holds, by full path. `slow` makes a write land a tick later, as a real disk does. */
export function memoryScopeFs(slow = false, held: Map<string, string> = new Map()): ScopeFsWithMap {
  return {
    held,
    readSync: (file) => held.get(file),
    list: async (dir) => [...held.keys()].filter((file) => nodePath.dirname(file) === dir && file.endsWith('.json')).map((file) => nodePath.basename(file)),
    write: async (file, text) => {
      if (slow) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      held.set(file, text);
    },
    remove: async (file) => void held.delete(file),
  };
}
type ScopeFsWithMap = import('../bridgeScope').ScopeFs & { readonly held: Map<string, string> };

/** A `BridgeScopes` over a fake disk and a serial queue (a `LeasedQueue` with no lock is one). */
export function memoryScopes(M: BridgeModules, now: () => number = () => 1_000, io: ScopeFsWithMap = memoryScopeFs()): import('../bridgeScope').BridgeScopes {
  return new M.scope.BridgeScopes(SCOPES_TEST_DIR, io, new SerialQueue(), now);
}

/** Set a scope from what is there now: the revision a picker that had just looked would hand back. */
export async function put(
  scopes: import('../bridgeScope').BridgeScopes,
  accountId: string,
  serverEntityId: string,
  entries: readonly string[],
  quiet = false,
): Promise<number> {
  return scopes.set(accountId, serverEntityId, entries, quiet, scopes.read(accountId, serverEntityId).revision);
}

/** The wall's per-account suppliers for a test that does not look at them: nothing listed, no config, nothing refused. */
export const NO_SUPPLIERS = {
  listEntriesOf: (): Promise<readonly never[]> => Promise.resolve([]),
  visibleConfigOf: (): undefined => undefined,
  entryRefusal: (): undefined => undefined,
} as const;
