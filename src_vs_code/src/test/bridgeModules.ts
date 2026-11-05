import * as assert from 'node:assert/strict';
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
