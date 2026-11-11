import assert from 'node:assert/strict';
import { BurnStorage, burnedByAgentUse } from '../burnOnUse';
import { commandFingerprint } from '../commandTrust';
import { oneUseIn } from '../entityExpiry';
import { findUsableEntry, switchForAction } from '../mcpEntries';
import { isLinkTarget, trustLineFor } from '../remoteLaunch';
import type { AgentUseDeps } from '../agentUseActions';
import type { OverSsh, OverSshCall, UseAction, UseActionContext } from '../useActions';
import type { EntityMetadata, TreeNode } from '../types';
import { sshNode } from './sshRoadWorld';
import { FAKE_STORAGE_DIR } from './fakePaths';

/**
 * The world of the agent's run over SSH (E3.S2 security spec §12): the SSH entry the gate reads, a storage that answers per account and
 * records every `getNode`, and the deps of `terminalRunAction` with a recording `overSsh`. Not named `*.test.ts`, so the runner never treats
 * it as a suite. Built against the REAL validators (testing.md: a fixture the code rejects proves nothing), once, at load.
 */

/** An SSH entry open to agents for use: `sshNode` (the real link target) with the one switch the gate reads. */
export function usableSsh(id: string, extra: Partial<EntityMetadata> = {}): TreeNode {
  return sshNode(id, { mcp: { view: true, use: true }, ...extra });
}

/** The folder of the Trash, which makes everything under it refused (`isInTrash`). */
export function trashFolder(id = 'trash'): TreeNode {
  return { id, name: 'Trash', type: 'folder', parentId: null, isTrash: true } as TreeNode;
}

/** The storage the gate reads: one or more accounts, nodes by account; records every `getNode` as `[account, id]`. */
export interface AgentStorage {
  getAccounts(): readonly { accountId: string }[];
  getNode(accountId: string, id: string): TreeNode | undefined;
  getDbConnection(accountId: string, entityId: string): Promise<string>;
  readonly calls: [string, string][];
}

export function agentStorage(byAccount: Readonly<Record<string, readonly TreeNode[]>>): AgentStorage {
  const calls: [string, string][] = [];
  return {
    calls,
    getAccounts: () => Object.keys(byAccount).map((accountId) => ({ accountId })),
    getNode: (accountId, id) => {
      calls.push([accountId, id]);
      return (byAccount[accountId] ?? []).find((node) => node.id === id);
    },
    getDbConnection: async () => '',
  };
}

// ---- load-time proofs --------------------------------------------------------------------------------------------------------
assert.equal(findUsableEntry(agentStorage({ 'acct-1': [usableSsh('s1')] }), 's1', 'exec')?.kind, 'usable', 'usableSsh() is not usable: every gate test would run on a refused fixture');
assert.equal(isLinkTarget(usableSsh('s1'), () => undefined), true, 'usableSsh() is not a link target');
assert.equal(switchForAction('exec'), 'use');
assert.equal(switchForAction('run'), 'use');

/**
 * `agentStorage` that can also DELETE (the third amendment, A1): `deleteNodeRecursive` removes the node, or throws while `failDelete` is set. It is
 * what `burnOneUseIn` burns an entry through, so a one-use SSH entry really goes (or really stays) in the world of the broker tests.
 */
export type OneUseStorage = AgentStorage & BurnStorage & { failDelete: boolean };

export function oneUseStorage(byAccount: Readonly<Record<string, readonly TreeNode[]>>): OneUseStorage {
  const live: Record<string, TreeNode[]> = Object.fromEntries(Object.entries(byAccount).map(([accountId, nodes]) => [accountId, [...nodes]]));
  const storage = Object.assign(agentStorage(live), {
    failDelete: false,
    deleteNodeRecursive: async (accountId: string, id: string): Promise<string[]> => {
      if (storage.failDelete) {
        throw new Error('the vault would not delete it');
      }
      const nodes = live[accountId] ?? [];
      const at = nodes.findIndex((node) => node.id === id);
      if (at >= 0) {
        nodes.splice(at, 1);
      }
      return [id];
    },
  });
  return storage;
}

// Load-time proofs: the real predicates see the fixture as the product does, and a one-use SSH entry passes the gate (decision B, not A).
const ONCE = usableSsh('s1', { burnPolicy: 'oneUse' });
assert.equal(oneUseIn(oneUseStorage({ 'acct-1': [ONCE] }))('acct-1', 's1'), true, 'a burnPolicy of oneUse is not one-use to the product');
assert.equal(burnedByAgentUse(ONCE), true, 'the burn would not fire on the fixture');
assert.equal(findUsableEntry(agentStorage({ 'acct-1': [ONCE] }), 's1', 'exec')?.kind, 'usable', 'a one-use SSH entry must pass the gate');

/**
 * The context of a run as the BROKER hands it: the shown summary and the used entry, read in ONE step (spec §2.2, §2.3 step 3). Every test world that
 * calls `run` of a linked entry goes through it, so it runs with what a real call carries, read from the REAL `summarize` and `uses`.
 */
export function asBroker(action: UseAction, ctx: UseActionContext): UseActionContext {
  return { ...ctx, summary: action.summarize({}, ctx), uses: action.uses?.(ctx) };
}

/** The Terminal entry of every gate test: `LINKED` of the spec. */
export const LINKED: EntityMetadata = { id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo linked', sshEntityId: 's1' };

export function terminalNode(over: Partial<EntityMetadata> = {}): TreeNode {
  const details: EntityMetadata = { ...LINKED, ...over };
  return { id: details.id, name: details.name, type: 'entity', details, parentId: null };
}

export const ACCOUNT_1 = 'acct-1';
export const ACCOUNT_2 = 'acct-2';

export const OK_BODY = { exitCode: 0, stdout: 'ok', stderr: '', stdoutTruncated: false, stderrTruncated: false, timedOut: false, durationMs: 1 };

export type RecordingOverSsh = OverSsh & { readonly calls: { ctx: UseActionContext; call: OverSshCall }[] };

/** A recording `overSsh`: answers `OK_BODY`, or rejects when told to. */
export function recordingOverSsh(rejects = false): RecordingOverSsh {
  const calls: { ctx: UseActionContext; call: OverSshCall }[] = [];
  const run: OverSsh = async (ctx, call) => {
    calls.push({ ctx, call });
    if (rejects) {
      throw new Error('ssh fell over');
    }
    return { status: 200, body: OK_BODY };
  };
  return Object.assign(run, { calls });
}

export interface GateOptions {
  /** The nodes of `acct-1` besides the Terminal entry (default: one usable SSH entry `s1`). */
  readonly acct1?: readonly TreeNode[];
  /** The nodes of `acct-2`, when the world has a second account. */
  readonly acct2?: readonly TreeNode[];
  /** The Terminal entry's details over `LINKED` (a key set to `undefined` removes it). */
  readonly terminal?: Partial<EntityMetadata>;
  /** The Terminal node IS NOT in the storage (the entity is gone). */
  readonly noTerminal?: boolean;
  /** The agent socket, when a test says so; absent: the deps carry no `agentSocket` at all. */
  readonly agentSocket?: string | undefined;
  readonly withSocketFn?: boolean;
  /** `acquireExecSlot` answers nothing. */
  readonly busy?: boolean;
  readonly overSshRejects?: boolean;
  /** A storage of the test's own (the one-use broker tests' `oneUseStorage`) in place of the world's: `acct1` and `acct2` are then not read. */
  readonly storage?: AgentStorage;
}

export interface GateWorld {
  readonly deps: AgentUseDeps & { overSsh: OverSsh; onPath: () => boolean };
  readonly ctx: UseActionContext;
  readonly storage: AgentStorage;
  readonly overSsh: RecordingOverSsh;
  readonly notes: string[];
  readonly slots: { taken: number; released: number };
  /** The fingerprints a person has vouched for on this machine; `trust()` adds one. */
  readonly trusted: string[];
  /** How many times the trust store was asked: "never" is a number. */
  readonly trustReads: { count: number };
  /** The node of the Terminal entry (mutable details), and of every other node by id. */
  readonly nodes: Map<string, TreeNode>;
  /** Vouch for the line a person would have run over `ssh` (default `echo linked`). */
  trust(ssh: EntityMetadata, line?: string): void;
}

/** The trust line of the world's default SSH entry running `line`: `trustLineFor(s1.details, undefined, line)`. */
export function trustLineOf(ssh: EntityMetadata, line = 'echo linked'): string {
  return trustLineFor(ssh, undefined, line);
}

/** The slots of the world: `busy` answers none; otherwise each take and release is counted. */
function slotsOf(busy: boolean, slots: { taken: number; released: number }): () => (() => void) | undefined {
  return () => {
    if (busy) {
      return undefined;
    }
    slots.taken += 1;
    return () => {
      slots.released += 1;
    };
  };
}

/** The trust store of the world: the fingerprints in `trusted`, and every read counted. */
function trustStoreOf(trusted: string[], reads: { count: number }): AgentUseDeps['trustStore'] {
  return {
    get: () => {
      reads.count += 1;
      return trusted;
    },
    update: async () => undefined,
  };
}

/** `agentSocket` where a test says so: a function when it names a socket (or asks for one that answers nothing), absent otherwise. */
function socketOf(options: GateOptions): Pick<AgentUseDeps, 'agentSocket'> {
  return options.withSocketFn === true || options.agentSocket !== undefined ? { agentSocket: () => options.agentSocket } : {};
}

/** The nodes of the world's second account, when it has one. */
function secondAccount(options: GateOptions): Record<string, readonly TreeNode[]> {
  return options.acct2 === undefined ? {} : { [ACCOUNT_2]: options.acct2 };
}

function storageOf(options: GateOptions, terminal: TreeNode): { storage: AgentStorage; acct1: readonly TreeNode[] } {
  const acct1 = [...(options.noTerminal === true ? [] : [terminal]), ...(options.acct1 ?? [usableSsh('s1')])];
  return { storage: options.storage ?? agentStorage({ ...secondAccount(options), [ACCOUNT_1]: acct1 }), acct1 };
}

export function gateWorld(options: GateOptions = {}): GateWorld {
  const terminal = terminalNode(options.terminal);
  const { storage, acct1 } = storageOf(options, terminal);
  const notes: string[] = [];
  const slots = { taken: 0, released: 0 };
  const trusted: string[] = [];
  const trustReads = { count: 0 };
  const overSsh = recordingOverSsh(options.overSshRejects === true);
  const deps = {
    storage,
    storageDir: FAKE_STORAGE_DIR,
    signal: new AbortController().signal,
    acquireExecSlot: slotsOf(options.busy === true, slots),
    note: (message: string) => {
      notes.push(message);
    },
    trustStore: trustStoreOf(trusted, trustReads),
    applyEnv: async () => ({ written: [] as string[], withheld: [] }),
    onPath: () => false,
    overSsh,
    ...socketOf(options),
  };
  return {
    // The one cast of this world: a `StorageManager` is a class of forty members and the gate reads three of them (the same cast every
    // `fakeDeps` of this repository makes).
    deps: deps as never,
    ctx: { accountId: ACCOUNT_1, entityId: 'e1', entityName: terminal.name, signal: new AbortController().signal },
    storage,
    overSsh,
    notes,
    slots,
    trusted,
    trustReads,
    nodes: new Map(acct1.map((node) => [node.id, node])),
    trust: (ssh, line = 'echo linked') => {
      trusted.push(commandFingerprint('e1', trustLineOf(ssh, line)));
    },
  };
}

/** The details of an SSH node of the world, for a test that changes it after `validate` (the dialog is open). */
export function detailsOf(world: GateWorld, id: string): EntityMetadata {
  const details = world.nodes.get(id)?.details;
  assert.ok(details !== undefined, `the world holds no entity ${id}`);
  return details;
}
