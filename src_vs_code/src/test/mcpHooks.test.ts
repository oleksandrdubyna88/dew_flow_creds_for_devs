import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { ASK_WINDOW_MS, ConsentStamp, ConsentStampStore, STAMPS_KEY, stampKey } from '../mcpConsentPolicy';
import type { McpUseLookup } from '../brokerRequests';
import type { McpVaultSource } from '../mcpEntries';
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
 * WRITES one must mean the same store.</b> Two `ConsentStamps` over one `Memento` are two
 * `SerialQueue`s, and the queue is the whole of what stops the second of two concurrent writes
 * composing onto a map read before the first one ran. So the factory builds both hooks over one
 * instance, memoized on the `Memento` itself — which is also how S4.1's Forget command reaches it
 * without a handle threaded through `extension.ts`.</p>
 */

const NOW = 1_700_000_000_000;

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
 * <p>`loadWithVscode` evicts the whole graph, so every call here is a NEW module with a new memo —
 * which is why the memo test below takes the module once and calls the factory twice, rather than
 * calling this twice. Production loads it once, for the window's life.</p>
 */
function factory(): Factory {
  return loadWithVscode<Factory>('../mcpHooks', { window: {} });
}

/** A `Memento` that holds what it was given, and lets a test read it back by the real key. */
function memento(): ConsentStampStore & { held: Map<string, unknown> } {
  const held = new Map<string, unknown>();
  return {
    held,
    get: <T,>(key: string): T | undefined => held.get(key) as T | undefined,
    update: (key: string, value: unknown): Thenable<void> => Promise.resolve(void held.set(key, value)),
  };
}

/** One folder, one entry. `ask` is the folder's, because that is where a person will set it. */
function vault(ask?: string): Pick<McpVaultSource, 'getAccounts' | 'getNode'> {
  const nodes: TreeNode[] = [
    { id: 'f1', name: 'Agents', type: 'folder', parentId: null, mcp: { use: true, ...(ask === undefined ? {} : { ask }) } } as TreeNode,
    {
      id: 'e1',
      name: 'prod',
      type: 'entity',
      parentId: 'f1',
      details: { id: 'e1', name: 'prod', kind: 'ssh', isSshEnabled: true },
    } as TreeNode,
  ];
  return {
    getAccounts: () => [{ accountId: 'a1' }],
    getNode: (_accountId: string, id: string) => nodes.find((node) => node.id === id),
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
function rungsOf(hooks: Hooks): string {
  return usable(hooks.resolveMcpUse('e1', 'exec')).rungs ?? '';
}

function stampsIn(state: { held: Map<string, unknown> }): Record<string, ConsentStamp> {
  return (state.held.get(STAMPS_KEY) as Record<string, ConsentStamp> | undefined) ?? {};
}

test('the factory hands the broker both hooks, and a consent remembered through one is what the other reads', async () => {
  // The round trip, which is the entire point of one store: a call asks, the person answers, the
  // next call inside the window does not ask. Split across two stores this passes nothing.
  const state = memento();
  const hooks = factory().mcpUseHooks(vault('every12h'), state, () => NOW);
  const first = hooks.resolveMcpUse('e1', 'exec');

  assert.equal(usable(first).preConsented, false, 'nothing is remembered yet, so the first call asks');

  await hooks.rememberMcpConsent('a1', 'e1', usable(first).rungs ?? '');

  assert.equal(
    usable(hooks.resolveMcpUse('e1', 'exec')).preConsented,
    true,
    'what the person answered is what the next call reads',
  );
});

test('two calls for the same state share one stamp store, and a different state gets its own', async () => {
  // Asserted through BEHAVIOUR rather than object identity, so it still holds if the memo is ever
  // built differently — and with a DIFFERENT vault object each time, because the key is the
  // `Memento`: what two hooks must share is the store, not the tree they read beside it.
  const mod = factory();
  const state = memento();
  const writer = mod.mcpUseHooks(vault('every12h'), state, () => NOW);
  const reader = mod.mcpUseHooks(vault('every12h'), state, () => NOW);

  await writer.rememberMcpConsent('a1', 'e1', rungsOf(writer));

  assert.equal(
    usable(reader.resolveMcpUse('e1', 'exec')).preConsented,
    true,
    'the same Memento is the same store, whatever storage it was built beside',
  );
  const elsewhere = mod.mcpUseHooks(vault('every12h'), memento(), () => NOW);
  assert.equal(
    usable(elsewhere.resolveMcpUse('e1', 'exec')).preConsented,
    false,
    'and another state remembers nothing of this one',
  );
});

test('a remembered consent lands under the real key, credSshManager.mcpConsentStamps', async () => {
  // The key is every already-installed machine's record. A rename here is a silent forget for
  // everybody, so it is asserted against the exported constant AND the exported name function.
  const state = memento();
  const hooks = factory().mcpUseHooks(vault('every12h'), state, () => NOW);

  await hooks.rememberMcpConsent('a1', 'e1', rungsOf(hooks));

  assert.equal(STAMPS_KEY, 'credSshManager.mcpConsentStamps');
  assert.deepEqual(
    Object.keys(stampsIn(state)),
    [stampKey('a1', 'e1')],
    `the store holds: ${[...state.held.keys()].join(', ')}`,
  );
});

test('the clock the factory was given is the one BOTH halves answer to', async () => {
  // The write is stamped with it, and the read is measured from it. A hook that reached for the
  // wall clock on either side would pass every test with a frozen clock except this one.
  const state = memento();
  const hooks = factory().mcpUseHooks(vault('every12h'), state, () => NOW);
  await hooks.rememberMcpConsent('a1', 'e1', rungsOf(hooks));

  assert.equal(stampsIn(state)[stampKey('a1', 'e1')]?.at, NOW, 'the write carries the injected time');

  const inside = factory().mcpUseHooks(vault('every12h'), state, () => NOW + ASK_WINDOW_MS - 1);
  const past = factory().mcpUseHooks(vault('every12h'), state, () => NOW + ASK_WINDOW_MS + 1);

  assert.equal(usable(inside.resolveMcpUse('e1', 'exec')).preConsented, true, 'a millisecond inside twelve hours');
  assert.equal(usable(past.resolveMcpUse('e1', 'exec')).preConsented, false, 'and a millisecond past it asks again');
});

test('an entry whose folder sets no policy still asks, however recently somebody answered', async () => {
  // Every entry in every vault today, because no control can write `ask` until S3.1. The wiring
  // must change nothing for them — which is what makes this story safe to land before the controls.
  const state = memento();
  const hooks = factory().mcpUseHooks(vault(), state, () => NOW);

  await hooks.rememberMcpConsent('a1', 'e1', rungsOf(hooks));

  assert.equal(usable(hooks.resolveMcpUse('e1', 'exec')).preConsented, false, 'absent means ask every time');
  assert.deepEqual(stampsIn(state), {}, 'and a policy that never consults a stamp does not write one');
});

/**
 * The wiring itself, read out of `extension.ts`.
 *
 * <p>A scan rather than a behavioural test because there is no VS Code to activate here — and
 * because the defect this guards is not a wrong answer from a function but a call site: every
 * other test in this file calls the factory directly, so a broker still handed the store-less
 * resolver would leave the whole suite green while no real window ever remembered anything.
 * That is not hypothetical here — `brokerWorld` spreads `options.hooks` FIRST and overwrites it
 * with shaped collaborators, which silently swallowed a hook earlier in this same feature.</p>
 */
test('the window wires BOTH hooks into the live broker, from the one factory', () => {
  const source = withoutComments(read('extension.ts'));

  assert.match(
    source,
    /\.\.\.mcpUseHooks\(storage, context\.globalState\),/,
    'the broker hooks are built by the factory, over the window’s own globalState',
  );
  assert.doesNotMatch(source, /\bresolveMcpUse\s*:/, 'a later key of its own would silently win over the spread');
  assert.doesNotMatch(source, /\brememberMcpConsent\s*:/, 'and a second one here would mean a second store');
  assert.doesNotMatch(source, /\bmcpUseLookup\b/, 'the store-less lookup is no longer what the window uses');
});

function read(file: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', file), 'utf8');
}

/** Prose mentions the names too; a scan that reads comments is a scan that reads opinions. */
function withoutComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}
