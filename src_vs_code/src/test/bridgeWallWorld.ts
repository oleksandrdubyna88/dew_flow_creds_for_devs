import * as http from 'node:http';
import * as nodePath from 'node:path';
import type { BridgeContext } from '../bridgeContext';
import type { BridgeScopes, BridgeWallSource, ResolveUse } from '../bridgeScope';
import { LeasedQueue } from '../leasedQueue';
import { WindowLock, nodeLockFs } from '../windowLock';
import type { BridgeListener } from '../brokerBridgeListeners';
import type { McpFolderHooks } from '../brokerFolderDoor';
import type { McpVaultSource } from '../mcpEntries';
import type { McpAskPolicy } from '../mcpAccess';
import type { ConsentStampStore } from '../mcpConsentPolicy';
import type { EntityMetadata, TreeNode } from '../types';
import { stored, type StoredSecret } from '../storedSecret';
import { wallSuppliersOf } from '../bridgeWallSource';
import { visibleMcpEntries } from '../mcpEntries';
import * as assert from 'node:assert/strict';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { keyed, pause, raw, Reply } from './bridgeDoorHarness';
import { loadBridgeModules, put } from './bridgeModules';
import { World, world } from './brokerWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * The real broker, a real bridge listener and a vault with one entry that is in scope and one that is not (E1.3).
 *
 * <p>The walk of `bridgeScopeWalk.test.ts` and the transitive scenarios of `bridgeTransitive.test.ts` need the same
 * world, and a copy of it would be the first thing to drift. It is built to answer what the scenarios ask:
 * `e1` ("prod") is in scope, `e-out` ("leak-target") is in the same vault, open to agents, and is not, and every
 * way of naming either (by id, by alias, by token) leads to the real lookup over a real tree. Two accounts hold an
 * entry called `e1`, and the other account comes FIRST, so a lookup that is not narrowed to the bridge's account
 * finds the wrong one. Not a test file: `node:test` is pointed at `*.test.js` only.</p>
 */

export const ACCOUNT = 'a1';
export const SERVER = 'server1';
export const CONTEXT_1: BridgeContext = { bridgeId: 'bridge-1', accountId: ACCOUNT, serverEntityId: SERVER, serverName: 'prod server', target: 'me@host:22', remoteOs: 'linux' };

/** What must never reach a bridge scoped to `e1`: the id, the name and the alias of the entry that is not. */
export const LEAKS = ['e-out', 'leak-target', 'leaky'] as const;

/** What `storedTexts` answers until a scenario changes it. */
export const NO_TEXTS: readonly string[] = [];

/** Where the entry `x` stands in a world: see `X_FOLDER`. */
export type XState = 'usable' | 'closed' | 'absent' | 'unseen';

export type Target = { accountId: string; entityId: string; entityName: string; kind: string };
const target = (accountId: string, entityId: string, entityName: string): Target => ({ accountId, entityId, entityName, kind: 'ssh' });

export const E1 = target(ACCOUNT, 'e1', 'prod');
export const E_OUT = target(ACCOUNT, 'e-out', 'leak-target');
export const E2 = target(ACCOUNT, 'e2', 'second');
export const X = target(ACCOUNT, 'x', 'hidden-x');
const FOREIGN = target('a2', 'e1', 'foreign');

/** An agent-visible entry of every permission, and one where only the view is open (`closed` for a use). */
const EVERYTHING = { view: true, use: true, edit: true, create: true, delete: 'any' } as const;

function entity(id: string, name: string, parentId: string, extra: Partial<EntityMetadata> = {}): TreeNode {
  return { id, name, type: 'entity', parentId, details: { id, name, kind: 'ssh', isSshEnabled: true, ...extra } as EntityMetadata };
}

/** What makes an entry a config an agent may be told how to read: the snippet route serves only these. */
const config = (name: string): Partial<EntityMetadata> => ({ isConfig: true, configFormat: 'json', configFileName: `${name}.json` } as Partial<EntityMetadata>);

/**
 * The words `fullVault` plants (Amendment 6, F.3): a sentinel for each part of the four connection-string dialects the parent's D12
 * measured, a folder's name, and a `creds://` reference to an entry that is in no scope. Test words, no shape of a real password.
 */
export const PLANTED = {
  S1: 'zq-planted-s1', S2: 'zq-planted-s2', S3a: 'zq-planted-s3a', S3b: 'zq-planted-s3b', S4a: 'zq-planted-s4a', S4b: 'zq-planted-s4b',
  FOLDER: 'zq-planted-folder', REFERENCE: 'creds://acct@example.test/outside/db/password',
} as const;

/** What `getDbConnection` answers for each entry `fullVault` adds, as the keychain would hold it. */
const PLANTED_CONNECTIONS: Readonly<Record<string, string>> = {
  'db-kv': `Server=db,1433;Database=d;User Id=u;Password=${PLANTED.S1}`,
  'db-qs': `postgresql://u@h/d?password=${PLANTED.S2}`,
  'db-slash': `postgresql://u:${PLANTED.S3a}/${PLANTED.S3b}@h/d`,
  'db-at': `postgresql://u:${PLANTED.S4a}@${PLANTED.S4b}@h/d`,
  'full-row': 'postgresql://u@h/d',
};

/** `fullVault`'s entries (all in a1): four db rows, a row with every optional field set, a terminal whose command names an entry out of scope, and one inside a named folder. */
function plantedNodes(): TreeNode[] {
  const db = (id: string): TreeNode => entity(id, id, 'f1', { kind: 'db', dbType: 'mssql', host: 'db.example.test' });
  return [
    { id: 'f-planted', name: PLANTED.FOLDER, type: 'folder', parentId: null, mcp: EVERYTHING },
    db('db-kv'), db('db-qs'), db('db-slash'), db('db-at'),
    entity('full-row', 'full row', 'f1', {
      kind: 'db', host: 'full.example.test', port: 5432, user: 'u', dbType: 'postgres', vpnType: 'openvpn', scriptLanguage: 'bash',
      command: 'run it', isConfig: true, configKeyHash: 'hash', dependsOn: ['db-kv', 'e-out'],
    }),
    entity('tm-ref', 'tm-ref', 'f1', { kind: 'terminal', command: `deploy ${PLANTED.REFERENCE}` }),
    entity('in-folder', 'in-folder', 'f-planted'),
    ...Object.keys(SECRET_SLOTS).map((id) => entity(id, id, 'f1')),
  ];
}

/** One entry for each slot, holding that slot alone: each `has*` flag is true on exactly one row, so a flag read from another field cannot pass. */
export const SECRET_SLOTS: Readonly<Record<string, 'hasPassword' | 'hasPrivateKey' | 'hasNotes' | 'hasTotp'>> = {
  'only-password': 'hasPassword', 'only-key': 'hasPrivateKey', 'only-notes': 'hasNotes', 'only-totp': 'hasTotp',
};

/** Every entry `fullVault` adds, for a scope that takes them all. */
export const PLANTED_IDS: readonly string[] = ['db-kv', 'db-qs', 'db-slash', 'db-at', 'full-row', 'tm-ref', 'in-folder', ...Object.keys(SECRET_SLOTS)];


interface Flavour {
  /** No node at all in either account (RS4's empty vault). */
  readonly emptyVault: boolean;
  readonly fullVault: boolean;
  readonly collide: boolean;
  /** Whether a1's `e1` is a config. Off, with `collide`, only a2's `e1` is: the snippet must not be served from there. */
  readonly a1Config: boolean;
  readonly agentForward: boolean;
  /** What `e1` is called (default `prod`): a test of the dialog gives it a hostile name. */
  readonly entryName: string;
  /** The consent policy of the folder `e1` and its neighbours live in: absent leaves the folder setting none (every call asks). */
  readonly ask?: McpAskPolicy;
}

function nodesOf(x: XState, flavour: Flavour): Record<string, TreeNode[]> {
  if (flavour.emptyVault) {
    return {};
  }
  const folder = (id: string, mcp: TreeNode['mcp']): TreeNode => ({ id, name: id === 'f1' ? 'Agents' : 'Closed', type: 'folder', parentId: null, mcp });
  const e1 = entity('e1', flavour.entryName, 'f1', { dependsOn: ['e-out', 'e2'], ...e1Extras(flavour) });
  const a1: TreeNode[] = [
    folder('f1', agentsFolderPolicy(flavour)),
    folder('f-closed', { view: true }),
    e1,
    entity('e-out', 'leak-target', 'f1', config('leak-target')),
    entity('e2', 'second', 'f1'),
    entity('dup1', 'dup', 'f1'),
    entity('dup2', 'dup', 'f1'),
    ...xNodes(x),
    ...(flavour.fullVault ? plantedNodes() : []),
  ];
  const a2: TreeNode[] = [folder('f1', EVERYTHING), entity('only-a2', 'only-a2-entry', 'f1')];
  // The same id as an entry of a1, in an account that is searched FIRST: what an unnarrowed lookup would find.
  return { a2: flavour.collide ? [...a2, entity('e1', 'foreign', 'f1', config('foreign'))] : a2, a1 };
}

/** The consent policy of the folder `e1` lives in: everything open, asking `flavour.ask` when the world has a consent store. */
function agentsFolderPolicy(flavour: Flavour): NonNullable<TreeNode['mcp']> {
  return flavour.ask === undefined ? EVERYTHING : { ...EVERYTHING, ask: flavour.ask };
}

/** What `e1` has beyond its name: a config of its own (unless the world says a1's is not), and the agent forwarding some scenarios turn on. */
function e1Extras(flavour: Flavour): Partial<EntityMetadata> {
  return { ...(flavour.a1Config ? config('prod') : {}), ...(flavour.agentForward ? { agentForward: true } : {}) };
}

/** The folder of the `unseen` entry `x`: no switch of its own, and none above it. */
const UNSEEN_FOLDER: TreeNode = { id: 'f-unseen', name: 'Unseen', type: 'folder', parentId: null };

/** Where the entry `x` lives: open to agents (`usable`), in a folder with `view` only (`closed`), or in a folder with no switch at all (`unseen`, a node the agent may not view). */
const X_FOLDER: Readonly<Record<Exclude<XState, 'absent'>, string>> = { usable: 'f1', closed: 'f-closed', unseen: 'f-unseen' };

/** The entry called `x`: open to agents, or in a folder whose use is off, or in a folder nobody opened, or not there. */
function xNodes(x: XState): TreeNode[] {
  if (x === 'absent') {
    return [];
  }
  return [...(x === 'unseen' ? [UNSEEN_FOLDER] : []), entity('x', 'hidden-x', X_FOLDER[x], config('hidden-x'))];
}

/**
 * The world's vault, for a test that exercises the production suppliers over it (W1): `e1` ("prod") in a1 and a colliding
 * `e1` ("foreign") in a2, which is listed first.
 */
export function collideVault(asked: string[] = []): McpVaultSource {
  return vaultOf('absent', { emptyVault: false, fullVault: false, collide: true, a1Config: true, agentForward: false, entryName: 'prod' }, asked);
}

/** A slot's read: a value for the `fullVault` entry that holds that slot, nothing for any other. */
function heldBy(flavour: Flavour, slot: (typeof SECRET_SLOTS)[string], value: string): (accountId: string, id: string) => Thenable<StoredSecret | undefined> {
  return (accountId, id) => Promise.resolve(flavour.fullVault && accountId === ACCOUNT && SECRET_SLOTS[id] === slot ? stored(value) : undefined);
}

/** The vault as the broker's collaborators see it, recording which accounts were asked about. */
function vaultOf(x: XState, flavour: Flavour, asked: string[]): McpVaultSource {
  const nodes = nodesOf(x, flavour);
  return {
    getAccounts: () => [{ accountId: 'a2' }, { accountId: ACCOUNT }],
    getNodes: (accountId) => nodes[accountId] ?? [],
    getNode: (accountId, id) => {
      asked.push(accountId);
      return (nodes[accountId] ?? []).find((node) => node.id === id);
    },
    getPassword: heldBy(flavour, 'hasPassword', 'a password'), getPrivateKey: heldBy(flavour, 'hasPrivateKey', 'a key'), getNotes: heldBy(flavour, 'hasNotes', 'notes'), getTotp: heldBy(flavour, 'hasTotp', 'a totp'),
    getDbConnection: (accountId, id) => Promise.resolve(flavour.fullVault && accountId === ACCOUNT ? stored(PLANTED_CONNECTIONS[id]) : undefined),
  };
}

/**
 * What a scenario edits to change the stored command of `e1`: the entry's own `command` and `commandArgs`, which the
 * production `storedTexts` reads back. Written to the vault's node, so the scenario and the wall see one thing.
 */
function storedTextsOf(vault: McpVaultSource, initial: readonly string[]): { current: readonly string[] } {
  const holder = { current: initial };
  const write = (texts: readonly string[]): void => {
    const details = vault.getNode(ACCOUNT, 'e1')?.details;
    if (details !== undefined) {
      details.command = texts[0] ?? '';
      details.commandArgs = texts.slice(1).map((value) => ({ value }));
    }
  };
  write(initial);
  return {
    get current() {
      return holder.current;
    },
    set current(texts: readonly string[]) {
      holder.current = texts;
      write(texts);
    },
  };
}

/** The person's own `RefSource` over the same tree: emails by account, a path of folder names then the entity's. */
function refSourceOf(vault: McpVaultSource): BridgeWallSource['refSource'] {
  const emails: Record<string, string> = { a1: 'a@x.test', a2: 'b@x.test' };
  return {
    accounts: () => vault.getAccounts().map(({ accountId }) => ({ accountId, email: emails[accountId] })),
    entities: (accountId) =>
      vault.getNodes(accountId).filter((node) => node.type === 'entity').map((node) => ({
        id: node.id,
        name: node.name,
        path: [vault.getNode(accountId, node.parentId ?? '')?.name ?? '', node.name],
      })),
  };
}

export interface WallOptions {
  /** What `e1` is called, in the vault and so in every dialog about it (default `prod`). */
  entryName?: string;
  /** The actions the scripted entry serves (default `exec` and `query`): a local-door test of `terminal` needs the route to exist. */
  supports?: string[];
  /** The vault holds no node at all (Amendment 6 review, RS4): the product's own reads must read the same over it. */
  emptyVault?: true;
  /** a1 also holds the entries of `PLANTED_IDS`: connection strings in four dialects, a terminal command with a reference out of scope, an entry in a named folder (Amendment 6, F.3). */
  fullVault?: true;
  /** The entries in the scope of `server1`. Default: `e1`. */
  scope?: string[];
  quiet?: boolean;
  /** An entry called `x` in the vault: open to agents, or with its use switched off, or in a folder with no switch (`unseen`: the agent may not view it), or not there. */
  x?: XState;
  /**
   * Account a2, searched first, holds an entry with the id `e1` of its own (named `foreign`, a config of its own). The
   * listing, the snippet and every use path must keep to a1 (S20, S22, S23).
   */
  collide?: boolean;
  /** Whether a1's `e1` is a config (default true). Off with `collide`, the only config called `e1` is a2's. */
  a1Config?: boolean;
  /** a1's `e1` forwards the laptop's SSH agent (L4). */
  agentForward?: boolean;
  /** The wall's `entryRefusal` as E2 wires it (default), or one that never refuses (L4's second leg: the action must refuse alone). */
  entryRefusal?: 'wired' | 'none';
  /** `listEntriesOf` answers a promise the test holds until `listing.release()` (S24). */
  holdListing?: boolean;
  /** The `exec` action the world runs for real, in place of the script (L1-L5). */
  exec?: unknown;
  /** The `query` action the world runs for real, in place of the script (change 6.2: the launch is observed beside the words). */
  query?: unknown;
  /** The hook the broker calls before it reads the mask table (S27). */
  releaseWaiting?: (accountId: string, entityId: string) => Promise<unknown>;
  /** How many `Allow` answers a dialog gets before it is dismissed. Default 60. */
  allows?: number;
  oneUse?: boolean;
  maxCalls?: number;
  holdDialogs?: boolean;
  /** The first n modals throw synchronously and record nothing (E1.5 F3). */
  throwDialogs?: number;
  /**
   * The REAL consent hooks, over the real vault: the folder's policy is `ask`, the stamps live in `state`, and the stamp
   * clock is `now` (E1.4). The local MCP door and every bridge read and write the same store, as in a window. Without it the
   * lookup is the real one with no store, so every call asks.
   */
  consent?: { ask: McpAskPolicy; state: ConsentStampStore; now: () => number };
  /** The scripted actions may put a prompt of their own on screen after the Allow (Amendment 3, K8). */
  asksAfterConsent?: boolean;
  /** The local MCP door's calls are pre-consented (a `never` consent policy): they raise no dialog and mint a grant allowed at once (Q1). A bridge's calls are not touched. */
  quietLocal?: boolean;
  /** The consent gate's wait, in place of five minutes (P3). */
  consentTimeoutMs?: number;
  storedTexts?: readonly string[];
}

export interface WallWorld {
  readonly w: World;
  readonly main: number;
  readonly bridge: BridgeListener;
  readonly scopes: BridgeScopes;
  readonly wall: BridgeWallSource;
  readonly vault: McpVaultSource;
  /** What `storedTexts` answers; a scenario edits `.current` to edit the stored line. */
  readonly texts: { current: readonly string[] };
  /** Every call of the real `resolveMcpUse`, as the broker made it. */
  readonly lookups: unknown[][];
  /** Every account `getNode` was asked about, in order. */
  readonly nodesAsked: string[];
  /** Every account `listEntriesOf` was called with, in order. */
  readonly listed: string[];
  /** `holdListing`: whether the listing has been asked for, and the key that lets it answer. */
  readonly listing: { readonly asked: () => boolean; release(): void };
  /** Every `[accountId, entityId]` `visibleConfigOf` was asked about. */
  readonly configsAsked: string[][];
  /** Every `[accountId, entityId]` `entryRefusal` was asked about. */
  readonly refusalsAsked: string[][];
  /** Calls to the hooks a bridge must never reach: the config read, the folder verbs. */
  readonly forbidden: string[];
  /** A token for an entry, as the person's Share would hand it to an agent. */
  tokenFor(account: string, entityId: string, entityName: string): Promise<string>;
  /** Another bridge on the same broker, with its own scope. */
  openOther(context: BridgeContext, scope: string[]): Promise<BridgeListener>;
  dispose(): void;
}

const DEFAULTS = { scope: ['e1'], quiet: false, x: 'absent', collide: false, a1Config: true, agentForward: false, entryRefusal: 'wired', holdListing: false, allows: 60, storedTexts: NO_TEXTS, supports: ['exec', 'query'] } as const;

/** The alias list the hook answers: `second` is of another kind than `ssh`, so a list that fixes the kind is told apart. */
function aliasRows(aliases: Record<string, Target>): Array<{ name: string; kind: string }> {
  return Object.keys(aliases).map((name) => ({ name, kind: name === 'second' ? 'db' : 'ssh' }));
}

/** The alias names the world knows, each to its target. `xalias` is there only when `x` is. */
function aliasesFor(x: XState): Record<string, Target> {
  const known: Record<string, Target> = { one: E1, leaky: E_OUT, second: E2, foreign: FOREIGN };
  return x === 'absent' ? known : { ...known, xalias: X };
}

export async function wallWorld(options: WallOptions = {}): Promise<WallWorld> {
  const o = { ...DEFAULTS, ...options };
  const modules = loadBridgeModules();
  const nodesAsked: string[] = [];
  const lookups: unknown[][] = [];
  const forbidden: string[] = [];
  const listed: string[] = [];
  const configsAsked: string[][] = [];
  const refusalsAsked: string[][] = [];
  const vault = vaultOf(o.x, flavourOf(options, o), nodesAsked);
  const mcpHooks = mcpHooksOf(options, vault);
  let askedListing = false;
  let releaseListing: () => void = () => undefined;
  const listingGate = new Promise<void>((resolve) => {
    releaseListing = resolve;
  });
  // A real directory and a real lock, as production has them: the scope is a file, and a test that narrows it narrows a file.
  const owned = cleanupScope();
  const storage = ownedDir(owned, 'wall');
  const scopes = new modules.scope.BridgeScopes(
    nodePath.join(storage, modules.scope.SCOPES_DIR),
    modules.scope.nodeScopeFs(),
    new LeasedQueue(new WindowLock(nodePath.join(storage, modules.scope.SCOPES_LOCK_DIR), nodeLockFs())),
    () => 1_000,
  );
  await put(scopes, ACCOUNT, SERVER, o.scope, o.quiet);
  const texts = storedTextsOf(vault, o.storedTexts);
  // The suppliers are PRODUCTION's (`bridgeWallSource.ts`), over this vault. The spies only record what they were asked,
  // hold the listing when a scenario asks them to, and switch the refusal off for the one scenario that needs the action
  // to refuse alone; none of the four is defined here.
  const real = wallSuppliersOf(vault);
  const wall: BridgeWallSource = {
    scopes,
    refSource: refSourceOf(vault),
    storedTexts: real.storedTexts,
    listEntriesOf: async (accountId) => {
      listed.push(accountId);
      askedListing = true;
      const rows = await real.listEntriesOf(accountId);
      await (o.holdListing ? listingGate : Promise.resolve());
      return rows;
    },
    visibleConfigOf: (accountId, entityId) => {
      configsAsked.push([accountId, entityId]);
      return real.visibleConfigOf(accountId, entityId);
    },
    entryRefusal: (accountId, entityId) => {
      refusalsAsked.push([accountId, entityId]);
      return o.entryRefusal === 'wired' ? real.entryRefusal(accountId, entityId) : undefined;
    },
  };
  const aliases = aliasesFor(o.x);
  const w = world({
    supports: [...o.supports],
    answers: Array.from({ length: o.allows }, () => 'Allow'),
    aliasMap: aliases,
    aliasList: aliasRows(aliases),
    mcpEntries: await visibleMcpEntries(vault),
    mcpResolve: (id, action, server) => {
      lookups.push([id, action, server]);
      return mcpHooks.resolve(id, action, server);
    },
    mcpRemember: mcpHooks.remember,
    visibleConfig: (id) => (['e1', 'e-out', 'x'].includes(id) ? configOf(id) : undefined),
    oneUse: options.oneUse,
    maxCalls: options.maxCalls,
    holdDialogs: options.holdDialogs,
    throwDialogs: options.throwDialogs,
    asksAfterConsent: options.asksAfterConsent,
    consentTimeoutMs: options.consentTimeoutMs,
    trash: true,
    create: 'open',
    realActions: realActionsOf(options),
    hooks: { bridgeWall: wall, configRoute: configSpy(forbidden), ...(options.releaseWaiting === undefined ? {} : { releaseWaiting: options.releaseWaiting }) },
  });
  w.server.setFolderHooks(folderSpy(forbidden));
  const token = await w.server.share(ACCOUNT, 'e1', 'prod', 'ssh');
  const bridge = await w.server.openBridgeListener(CONTEXT_1);
  return {
    w, bridge, scopes, wall, vault, texts, lookups, nodesAsked, forbidden, listed, configsAsked, refusalsAsked,
    listing: { asked: () => askedListing, release: () => releaseListing() },
    main: Number(token.slice(0, token.indexOf('.'))),
    tokenFor: async (account, entityId, entityName) => {
      const shared = await w.server.share(account, entityId, entityName, 'ssh');
      return shared.slice(shared.indexOf('.') + 1);
    },
    openOther: async (context, scope) => {
      await put(scopes, context.accountId, context.serverEntityId, scope);
      return w.server.openBridgeListener(context);
    },
    dispose: () => {
      w.server.dispose();
      void owned.close(); // the folder is owned and claimed: closing the scope removes it
    },
  };
}

/** The actions a test runs for real, by name; every other action is the script. */
function realActionsOf(o: WallOptions): Record<string, unknown> | undefined {
  const real = { ...(o.exec === undefined ? {} : { exec: o.exec }), ...(o.query === undefined ? {} : { query: o.query }) };
  return Object.keys(real).length === 0 ? undefined : real;
}

/** What the world's vault is built from: the options that change its nodes, and the folder's consent policy when the world has a store. */
function flavourOf(options: WallOptions, o: { collide: boolean; a1Config: boolean; agentForward: boolean }): Flavour {
  return { emptyVault: options.emptyVault === true, fullVault: options.fullVault === true, collide: o.collide, a1Config: o.a1Config, agentForward: o.agentForward, ask: options.consent?.ask, entryName: options.entryName ?? 'prod' };
}

/**
 * The MCP door's lookup and its write. With a consent store, production's own `mcpUseHooks` over `vault` (the local door and
 * every bridge share the store, as in a window); without one, the real lookup with no store, so every call asks, and with
 * `quietLocal` the local door's answers are already given.
 */
function mcpHooksOf(o: WallOptions, vault: McpVaultSource): { resolve: ResolveUse; remember?: (accountId: string, entityId: string, rungs: string, serverEntityId?: string) => Promise<void> } {
  const { mcpUseLookup, mcpUseHooks } = loadWithVscode<{ mcpUseLookup: typeof import('../mcpHooks').mcpUseLookup; mcpUseHooks: typeof import('../mcpHooks').mcpUseHooks }>('../mcpHooks', { window: {} });
  if (o.consent !== undefined) {
    const hooks = mcpUseHooks(vault, o.consent.state, o.consent.now);
    return { resolve: hooks.resolveMcpUse, remember: hooks.rememberMcpConsent };
  }
  return { resolve: (id, action, server) => quietened(mcpUseLookup(vault, id, action, undefined, Date.now(), server), o.quietLocal === true && server === undefined) };
}

/** A usable lookup, said to be answered already by the entry's policy when `quiet`: the call asks nobody. */
function quietened(found: ReturnType<typeof import('../mcpHooks').mcpUseLookup>, quiet: boolean): ReturnType<typeof import('../mcpHooks').mcpUseLookup> {
  return quiet && found?.kind === 'usable' ? { ...found, preConsented: true } : found;
}

function configOf(id: string): EntityMetadata {
  return { id, name: id === 'e-out' ? 'leak-target' : id, kind: 'config', isConfig: true, configFormat: 'json', configFileName: `${id === 'e-out' ? 'leak-target' : id}.json` } as EntityMetadata;
}

function configSpy(forbidden: string[]): Record<string, unknown> {
  return {
    holders: () => { forbidden.push('configRoute.holders'); return []; },
    body: () => { forbidden.push('configRoute.body'); return Promise.resolve({ kind: 'absent' }); },
  };
}

function folderSpy(forbidden: string[]): McpFolderHooks {
  const stop = (name: string) => (): never => {
    forbidden.push(`folders.${name}`);
    throw new Error(`${name} must not be reached through a bridge`);
  };
  return { list: () => [{ id: 'f1', name: 'Agents', parent: null, holds: 'any', can: { create: true, edit: true, delete: true } }], choose: stop('choose'), create: stop('create'), edit: stop('edit'), remove: stop('remove') };
}

/** A door as a test addresses it: a port and the headers that make the request one of that door. */
export interface Door {
  readonly port: number;
  readonly headers: http.OutgoingHttpHeaders;
}

export const viaBridge = (listener: BridgeListener, extra: http.OutgoingHttpHeaders = {}): Door => ({ port: listener.port, headers: keyed(listener, extra) });
export const viaMain = (ww: WallWorld): Door => ({ port: ww.main, headers: { Host: `127.0.0.1:${ww.main}` } });

export interface Ask {
  readonly method?: 'GET' | 'POST';
  readonly path: string;
  readonly body?: Record<string, unknown>;
  readonly token?: string;
}

/** One request through one door; the body is sent as JSON and the answer comes back as text. */
export function send(door: Door, ask: Ask): Promise<Reply> {
  const headers: http.OutgoingHttpHeaders = { ...door.headers };
  if (ask.token !== undefined) {
    headers.Authorization = `Bearer ${ask.token}`;
  }
  const method = ask.method ?? 'POST';
  return raw(door.port, ask.path, headers, { method, body: ask.body === undefined ? undefined : JSON.stringify(ask.body) });
}

/**
 * A request the test can hang up on (Amendment 2, P1): the client that posts and goes away while the person is
 * still being asked. `reply` rejects when the hang-up is the answer.
 */
export function sendAbortable(door: Door, ask: Ask): { reply: Promise<Reply>; abort(): void } {
  const headers: http.OutgoingHttpHeaders = { ...door.headers };
  if (ask.token !== undefined) {
    headers.Authorization = `Bearer ${ask.token}`;
  }
  const body = ask.body === undefined ? undefined : JSON.stringify(ask.body);
  let request: http.ClientRequest | undefined;
  const reply = new Promise<Reply>((resolve, reject) => {
    request = http.request({ host: '127.0.0.1', port: door.port, path: ask.path, method: ask.method ?? 'POST', headers }, (response) => {
      let text = '';
      response.on('data', (chunk) => {
        text += String(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text, connection: response.headers.connection }));
    });
    request.on('error', reject);
    request.end(body);
  });
  return { reply, abort: () => request?.destroy(new Error('the client hung up')) };
}

/**
 * A request whose headers arrive now and whose body arrives when `bodyAfter` settles (Amendment 2, T1): the window in
 * which the broker has looked at the token and has not yet read what it is asked to do.
 */
export function sendSlow(door: Door, ask: Ask, bodyAfter: Promise<void>): Promise<Reply> {
  const headers: http.OutgoingHttpHeaders = { ...door.headers };
  if (ask.token !== undefined) {
    headers.Authorization = `Bearer ${ask.token}`;
  }
  const body = ask.body === undefined ? '' : JSON.stringify(ask.body);
  headers['Content-Length'] = Buffer.byteLength(body);
  return new Promise<Reply>((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: door.port, path: ask.path, method: ask.method ?? 'POST', headers }, (response) => {
      let text = '';
      response.on('data', (chunk) => {
        text += String(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text, connection: response.headers.connection }));
    });
    request.on('error', reject);
    request.flushHeaders();
    void bodyAfter.then(() => request.end(body), reject);
  });
}

/** The parts of an answer a scenario compares: the status and the body without the one field that is a clock. */
export function normalised(reply: Reply): { status: number; body: string } {
  return { status: reply.status, body: reply.body.replace(/"durationMs":\d+/g, '"durationMs":0') };
}

/** The real timer, taken at load: a test that mocks `setTimeout` or `Date` must not stop `until` from timing out. */
const realSetTimeout = setTimeout;

/**
 * Poll until `done` is true, or fail with `what`; the broker answers on its own schedule and a fixed sleep guesses it.
 * The deadline is on the REAL clock (`performance.now`) and the poll on the real timer: a test that mocks `Date` or `setTimeout` (the throttle's clock, the
 * consent wait) and whose condition never comes fails here in `ms`, instead of waiting for the runner's 60-minute limit.
 */
export async function until(done: () => boolean, what: string, ms = 3_000): Promise<void> {
  const deadline = performance.now() + ms;
  while (!done()) {
    if (performance.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise<void>((resolve) => realSetTimeout(resolve, 5));
  }
}

/** The broker's grant registry, for the scenarios that ask what became of a grant. Reached through the private field, as `world` is. */
export interface RegistryView {
  readonly grants: Map<string, { secret: string; status: string; scope: string; uses: number; lastUsedAt: number; bridge?: { context: BridgeContext; quiet: boolean } }>;
  get(secret: string): { status: string; scope: string; uses: number; lastUsedAt: number; bridge?: unknown } | undefined;
  /** The person's Deny, recorded on a grant. */
  deny(secret: string): void;
}
export const registryOf = (ww: WallWorld): RegistryView => (ww.w.server as unknown as { grants: RegistryView }).grants;

/** Answer every dialog still open, so a failed scenario does not leave a request hanging on the broker it is about to dispose. */
export const settleAll = (ww: WallWorld): void => {
  for (const answer of ww.w.openDialogs) {
    answer('Deny');
  }
};

/** The reply, or the sentence that says the call did not answer in time (a dialog raised behind another, or a place held). */
export async function answeredAtOnce(reply: Promise<Reply>, what: string): Promise<Reply> {
  const raced = await Promise.race([reply, pause(400).then(() => what)]);
  assert.notEqual(typeof raced, 'string', typeof raced === 'string' ? raced : '');
  return raced as Reply;
}
