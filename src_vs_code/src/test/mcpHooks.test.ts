import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { ASK_WINDOW_MS, ConsentStamp, ConsentStampStore, ConsentStamps, STAMPS_KEY, stampKey } from '../mcpConsentPolicy';
import type { McpUseLookup } from '../brokerRequests';
import type { McpVaultSource } from '../mcpEntries';
import type { McpAskPolicy } from '../mcpAccess';
import type { TreeNode } from '../types';

/**
 * Where issue #95 becomes true in a real window (S2.4).
 *
 * <p>Everything before this story is reachable only from a test: the door reads `preConsented`,
 * the ceiling bounds the quiet path, the stamp store knows how to remember — and the window hands
 * the broker a lookup with no store and no clock, so `preConsented` is always false and a person's
 * answer is never written down. One factory closes that, and these are the properties it has to
 * have.</p>
 *
 * <p>The one that matters most is the round trip: <b>the side that READS a stamp and the side that
 * WRITES one must mean the same store.</b> The second is subtler and is why the store is memoized
 * rather than constructed per caller: two `ConsentStamps` over one `Memento` are two `SerialQueue`s,
 * and a queue each is how two concurrent writes both compose onto the map they read before either
 * ran, so one of them is lost. Reading a store and sharing a queue are different guarantees and
 * they get different tests — a test that only reads back would pass with the memo deleted.</p>
 */

const NOW = 1_700_000_000_000;
const A1 = 'a1';
const E1 = 'e1';
const E2 = 'e2';

interface Hooks {
  resolveMcpUse: (entryId: string, action: string) => McpUseLookup;
  rememberMcpConsent: (accountId: string, entityId: string, rungs: string) => Promise<void>;
}

interface Factory {
  mcpUseHooks: (
    storage: Pick<McpVaultSource, 'getAccounts' | 'getNode'>,
    state: ConsentStampStore,
    now?: () => number,
  ) => Hooks;
}

/**
 * The module, freshly loaded.
 *
 * <p>`loadWithVscode` evicts the whole graph, so every call here is a NEW module — and a new memo
 * with it, since the memo is module state in `mcpConsentPolicy.ts`. That is why the two tests about
 * sharing take the module ONCE and call the factory twice. Production loads it once, for the
 * window's life.</p>
 */
function factory(): Factory {
  return loadWithVscode<Factory>('../mcpHooks', { window: {} });
}

/** A `Memento` that holds what it was given, and reports which keys were actually written. */
function memento(defer = false): ConsentStampStore & { keys: () => string[] } {
  const held = new Map<string, unknown>();
  return {
    keys: () => [...held.keys()],
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

/** One folder and two entries, built as `TreeNode`s rather than cast into them. */
function vault(ask?: McpAskPolicy): Pick<McpVaultSource, 'getAccounts' | 'getNode'> {
  const folder: TreeNode = {
    id: 'f1',
    name: 'Agents',
    type: 'folder',
    parentId: null,
    mcp: ask === undefined ? { use: true } : { use: true, ask },
  };
  const nodes: TreeNode[] = [folder, entry(E1, 'prod'), entry(E2, 'staging')];
  return {
    getAccounts: () => [{ accountId: A1 }],
    getNode: (_accountId: string, id: string) => nodes.find((node) => node.id === id),
  };
}

function entry(id: string, name: string): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    parentId: 'f1',
    details: { id, name, kind: 'ssh', isSshEnabled: true },
  };
}

/** The usable verdict, or a failure that says what came back instead — so no assertion reads a union. */
function usable(lookup: McpUseLookup): { preConsented?: boolean; rungs?: string } {
  if (lookup !== undefined && lookup.kind === 'usable') {
    return lookup;
  }
  return assert.fail(`the lookup answered ${kindOf(lookup)}`);
}

function kindOf(lookup: McpUseLookup): string {
  return lookup === undefined ? 'nothing' : lookup.kind;
}

/** The ladder this window resolved, which is what a stamp has to be recorded against. */
function rungsOf(hooks: Hooks, entryId = E1): string {
  return usable(hooks.resolveMcpUse(entryId, 'exec')).rungs ?? '';
}

/** What is on record for one entry — read through the real reader, so no cast stands in for it. */
function stampFor(state: ConsentStampStore, entryId: string, at = NOW): ConsentStamp | undefined {
  return new ConsentStamps(state).get(stampKey(A1, entryId), at);
}

test('the factory hands the broker both hooks, and a consent remembered through one is what the other reads', async () => {
  // The round trip, which is the entire point of one store: a call asks, the person answers, the
  // next call inside the window does not ask. Split across two stores this passes nothing.
  const state = memento();
  const hooks = factory().mcpUseHooks(vault('every12h'), state, () => NOW);
  const first = hooks.resolveMcpUse(E1, 'exec');

  assert.equal(usable(first).preConsented, false, 'nothing is remembered yet, so the first call asks');

  await hooks.rememberMcpConsent(A1, E1, usable(first).rungs ?? '');

  assert.equal(
    usable(hooks.resolveMcpUse(E1, 'exec')).preConsented,
    true,
    'what the person answered is what the next call reads',
  );
});

test('two hook sets over one state read the same store, and a different state reads its own', async () => {
  // With a DIFFERENT vault object each time, because the key is the `Memento`: what two hooks must
  // share is the store, not the tree they read beside it.
  const mod = factory();
  const state = memento();
  const writer = mod.mcpUseHooks(vault('every12h'), state, () => NOW);
  const reader = mod.mcpUseHooks(vault('every12h'), state, () => NOW);

  await writer.rememberMcpConsent(A1, E1, rungsOf(writer));

  assert.equal(
    usable(reader.resolveMcpUse(E1, 'exec')).preConsented,
    true,
    'the same Memento is the same store, whatever storage it was built beside',
  );
  const elsewhere = mod.mcpUseHooks(vault('every12h'), memento(), () => NOW);
  assert.equal(
    usable(elsewhere.resolveMcpUse(E1, 'exec')).preConsented,
    false,
    'and another state remembers nothing of this one',
  );
});

test('two hook sets over one state write through ONE queue, so a concurrent remember is not lost', async () => {
  // This is what the memo is FOR, and the test above cannot see it: `ConsentStamps` caches nothing,
  // so two instances over one store still read each other's writes once they have landed. What a
  // queue each costs is a write that has NOT landed yet — both compose onto the map they read
  // before either ran, and the second overwrites the first. The store below defers its write by a
  // tick, which is what every real `Memento` does.
  const mod = factory();
  const state = memento(true);
  const a = mod.mcpUseHooks(vault('every12h'), state, () => NOW);
  const b = mod.mcpUseHooks(vault('every12h'), state, () => NOW);

  await Promise.all([a.rememberMcpConsent(A1, E1, rungsOf(a)), b.rememberMcpConsent(A1, E2, rungsOf(b, E2))]);

  assert.notEqual(stampFor(state, E1), undefined, 'the first consent was overwritten by the second');
  assert.notEqual(stampFor(state, E2), undefined, 'the second consent never landed');
});

test('a remembered consent lands under the real key, credSshManager.mcpConsentStamps', async () => {
  // The key is every already-installed machine's record. A rename here is a silent forget for
  // everybody, so both halves are asserted: the literal, and that the write went nowhere else.
  const state = memento();
  const hooks = factory().mcpUseHooks(vault('every12h'), state, () => NOW);

  await hooks.rememberMcpConsent(A1, E1, rungsOf(hooks));

  assert.equal(STAMPS_KEY, 'credSshManager.mcpConsentStamps');
  assert.deepEqual(state.keys(), [STAMPS_KEY], 'the write went to exactly one key, and that one');
  assert.notEqual(stampFor(state, E1), undefined, 'under the name the reader looks for');
});

test('the clock the factory was given is the one BOTH halves answer to', async () => {
  // The write is stamped with it, and the read is measured from it. A hook that reached for the
  // wall clock on either side would pass every test with a frozen clock except this one.
  const state = memento();
  const hooks = factory().mcpUseHooks(vault('every12h'), state, () => NOW);
  await hooks.rememberMcpConsent(A1, E1, rungsOf(hooks));

  assert.equal(stampFor(state, E1)?.at, NOW, 'the write carries the injected time');

  const inside = factory().mcpUseHooks(vault('every12h'), state, () => NOW + ASK_WINDOW_MS - 1);
  const past = factory().mcpUseHooks(vault('every12h'), state, () => NOW + ASK_WINDOW_MS + 1);

  assert.equal(usable(inside.resolveMcpUse(E1, 'exec')).preConsented, true, 'a millisecond inside twelve hours');
  assert.equal(usable(past.resolveMcpUse(E1, 'exec')).preConsented, false, 'and a millisecond past it asks again');
});

test('an entry whose folder sets no policy still asks, however recently somebody answered', async () => {
  // Every entry in every vault today, because no control can write `ask` until S3.1. The wiring
  // must change nothing for them — which is what makes this story safe to land before the controls.
  const state = memento();
  const hooks = factory().mcpUseHooks(vault(), state, () => NOW);

  await hooks.rememberMcpConsent(A1, E1, rungsOf(hooks));

  assert.equal(usable(hooks.resolveMcpUse(E1, 'exec')).preConsented, false, 'absent means ask every time');
  assert.deepEqual(state.keys(), [], 'and a policy that never consults a stamp does not write one');
});

/**
 * The wiring itself, read out of `extension.ts`.
 *
 * <p>A scan rather than a behavioural test because there is no VS Code to activate here — and
 * because the defect it guards is not a wrong answer from a function but a call site: every other
 * test in this file calls the factory directly, so a broker still handed the store-less resolver
 * would leave the whole suite green while no real window ever remembered anything. The flow itself
 * is driven for real in `brokerMcpRoutes.test.ts`, over loopback, with these hooks.</p>
 *
 * <p>Two tests, because a scan needs both halves: one that the sanctioned instance is still FOUND —
 * otherwise a reformatting turns the prohibition into a check that passes by matching nothing — and
 * one for the prohibition itself.</p>
 */
test('the scan still finds the line it is about', () => {
  assert.deepEqual(
    found(WIRED).length,
    1,
    `the factory call was not found in extension.ts; the MCP hooks there read: ${found(/mcpUse/).join(' | ')}`,
  );
});

test('the window wires BOTH hooks into the live broker, from the one factory', () => {
  // A later key of its own would silently win over the spread — which is exactly the trap
  // `brokerWorld` sprang earlier in this feature, where `options.hooks` is spread first and then
  // overwritten, and a hook passed there vanished without a word.
  assert.deepEqual(found(/\bresolveMcpUse\s*:/), [], 'a key of its own would silently win over the spread');
  assert.deepEqual(found(/\brememberMcpConsent\s*:/), [], 'and a second one here would mean a second store');
  assert.deepEqual(found(/\bmcpUseLookup\b/), [], 'the store-less lookup is no longer what the window uses');
});

/** Whitespace-tolerant: a formatter may break the call across lines without breaking the wiring. */
const WIRED = /\.\.\.\s*mcpUseHooks\s*\(\s*storage\s*,\s*context\.globalState\s*\)/;

/** Every hit, as `file:line: text` — a scan that fails without a location is a control, not a fix. */
function found(pattern: RegExp): string[] {
  return codeOf('extension.ts').flatMap((line, index) =>
    pattern.test(line) ? [`extension.ts:${index + 1}: ${line.trim()}`] : [],
  );
}

/**
 * The file's lines with comment lines BLANKED rather than removed — prose mentions these names too,
 * and a scan that reads comments is a scan that reads opinions. Blanked, so a reported line number
 * is the real one.
 */
function codeOf(file: string): string[] {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', file), 'utf8');
  return source.split('\n').map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? '' : line));
}
