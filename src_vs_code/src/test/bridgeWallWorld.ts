import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import type { BridgeContext } from '../bridgeContext';
import type { BridgeScopes, BridgeWallSource } from '../bridgeScope';
import { LeasedQueue } from '../leasedQueue';
import { WindowLock, nodeLockFs } from '../windowLock';
import type { BridgeListener } from '../brokerBridgeListeners';
import type { McpFolderHooks } from '../brokerFolderDoor';
import type { McpVaultSource } from '../mcpEntries';
import type { EntityMetadata, TreeNode } from '../types';
import { AGENT_FORWARD_REFUSED } from '../bridgeScope';
import { accountOnlyVault } from '../mcpAccountVault';
import { visibleConfigDetails, visibleMcpEntries } from '../mcpEntries';
import { keyed, raw, Reply } from './bridgeDoorHarness';
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

interface Flavour {
  readonly collide: boolean;
  /** Whether a1's `e1` is a config. Off, with `collide`, only a2's `e1` is: the snippet must not be served from there. */
  readonly a1Config: boolean;
  readonly agentForward: boolean;
}

function nodesOf(x: 'usable' | 'closed' | 'absent', flavour: Flavour): Record<string, TreeNode[]> {
  const folder = (id: string, mcp: TreeNode['mcp']): TreeNode => ({ id, name: id === 'f1' ? 'Agents' : 'Closed', type: 'folder', parentId: null, mcp });
  const e1 = entity('e1', 'prod', 'f1', { dependsOn: ['e-out', 'e2'], ...e1Extras(flavour) });
  const a1: TreeNode[] = [
    folder('f1', EVERYTHING),
    folder('f-closed', { view: true }),
    e1,
    entity('e-out', 'leak-target', 'f1', config('leak-target')),
    entity('e2', 'second', 'f1'),
    entity('dup1', 'dup', 'f1'),
    entity('dup2', 'dup', 'f1'),
    ...xNodes(x),
  ];
  const a2: TreeNode[] = [folder('f1', EVERYTHING), entity('only-a2', 'only-a2-entry', 'f1')];
  // The same id as an entry of a1, in an account that is searched FIRST: what an unnarrowed lookup would find.
  return { a2: flavour.collide ? [...a2, entity('e1', 'foreign', 'f1', config('foreign'))] : a2, a1 };
}

/** What `e1` has beyond its name: a config of its own (unless the world says a1's is not), and the agent forwarding some scenarios turn on. */
function e1Extras(flavour: Flavour): Partial<EntityMetadata> {
  return { ...(flavour.a1Config ? config('prod') : {}), ...(flavour.agentForward ? { agentForward: true } : {}) };
}

/** The entry called `x`: open to agents, or in a folder whose use is off, or not there. */
function xNodes(x: 'usable' | 'closed' | 'absent'): TreeNode[] {
  return x === 'absent' ? [] : [entity('x', 'hidden-x', x === 'usable' ? 'f1' : 'f-closed', config('hidden-x'))];
}

/** The vault as the broker's collaborators see it, recording which accounts were asked about. */
function vaultOf(x: 'usable' | 'closed' | 'absent', flavour: Flavour, asked: string[]): McpVaultSource {
  const nodes = nodesOf(x, flavour);
  const none = (): Thenable<undefined> => Promise.resolve(undefined);
  return {
    getAccounts: () => [{ accountId: 'a2' }, { accountId: ACCOUNT }],
    getNodes: (accountId) => nodes[accountId] ?? [],
    getNode: (accountId, id) => {
      asked.push(accountId);
      return (nodes[accountId] ?? []).find((node) => node.id === id);
    },
    getPassword: none, getPrivateKey: none, getNotes: none, getTotp: none, getDbConnection: none,
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
  /** The entries in the scope of `server1`. Default: `e1`. */
  scope?: string[];
  quiet?: boolean;
  /** An entry called `x` in the vault: open to agents, or with its use switched off, or not there. */
  x?: 'usable' | 'closed' | 'absent';
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
  /** The hook the broker calls before it reads the mask table (S27). */
  releaseWaiting?: (accountId: string, entityId: string) => Promise<unknown>;
  /** How many `Allow` answers a dialog gets before it is dismissed. Default 60. */
  allows?: number;
  oneUse?: boolean;
  maxCalls?: number;
  holdDialogs?: boolean;
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

const DEFAULTS = { scope: ['e1'], quiet: false, x: 'absent', collide: false, a1Config: true, agentForward: false, entryRefusal: 'wired', holdListing: false, allows: 60, storedTexts: NO_TEXTS } as const;

/** The alias names the world knows, each to its target. `xalias` is there only when `x` is. */
function aliasesFor(x: 'usable' | 'closed' | 'absent'): Record<string, Target> {
  const known: Record<string, Target> = { one: E1, leaky: E_OUT, second: E2, foreign: FOREIGN };
  return x === 'absent' ? known : { ...known, xalias: X };
}

export async function wallWorld(options: WallOptions = {}): Promise<WallWorld> {
  const o = { ...DEFAULTS, ...options };
  const modules = loadBridgeModules();
  const { mcpUseLookup } = loadWithVscode<{ mcpUseLookup: typeof import('../mcpHooks').mcpUseLookup }>('../mcpHooks', { window: {} });
  const nodesAsked: string[] = [];
  const lookups: unknown[][] = [];
  const forbidden: string[] = [];
  const listed: string[] = [];
  const configsAsked: string[][] = [];
  const refusalsAsked: string[][] = [];
  const vault = vaultOf(o.x, { collide: o.collide, a1Config: o.a1Config, agentForward: o.agentForward }, nodesAsked);
  let askedListing = false;
  let releaseListing: () => void = () => undefined;
  const listingGate = new Promise<void>((resolve) => {
    releaseListing = resolve;
  });
  // A real directory and a real lock, as production has them: the scope is a file, and a test that narrows it narrows a file.
  const storage = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'creds-wall-'));
  const scopes = new modules.scope.BridgeScopes(
    nodePath.join(storage, modules.scope.SCOPES_DIR),
    modules.scope.nodeScopeFs(),
    new LeasedQueue(new WindowLock(nodePath.join(storage, modules.scope.SCOPES_LOCK_DIR), nodeLockFs())),
    () => 1_000,
  );
  await put(scopes, ACCOUNT, SERVER, o.scope, o.quiet);
  const texts = { current: o.storedTexts };
  const wall: BridgeWallSource = {
    scopes,
    storedTexts: () => texts.current,
    refSource: refSourceOf(vault),
    // The per-account suppliers, built as E2.2 builds them: the real listing and the real snippet lookup over ONE account's vault.
    listEntriesOf: async (accountId) => {
      listed.push(accountId);
      askedListing = true;
      const rows = await visibleMcpEntries(accountOnlyVault(vault, accountId));
      await (o.holdListing ? listingGate : Promise.resolve());
      return rows;
    },
    visibleConfigOf: (accountId, entityId) => {
      configsAsked.push([accountId, entityId]);
      return visibleConfigDetails(accountOnlyVault(vault, accountId), entityId);
    },
    entryRefusal: (accountId, entityId) => {
      refusalsAsked.push([accountId, entityId]);
      return o.entryRefusal === 'wired' ? agentForwardRefusal(vault.getNode(accountId, entityId)?.details) : undefined;
    },
  };
  const aliases = aliasesFor(o.x);
  const w = world({
    supports: ['exec', 'query'],
    answers: Array.from({ length: o.allows }, () => 'Allow'),
    aliasMap: aliases,
    aliasList: Object.keys(aliases).map((name) => ({ name, kind: 'ssh' })),
    mcpEntries: [...(await visibleMcpEntries(vault))] as unknown as Record<string, unknown>[],
    mcpResolve: (id, action, server) => {
      lookups.push([id, action, server]);
      return mcpUseLookup(vault, id, action, undefined, Date.now(), server);
    },
    visibleConfig: (id) => (['e1', 'e-out', 'x'].includes(id) ? configOf(id) : undefined),
    oneUse: options.oneUse,
    maxCalls: options.maxCalls,
    holdDialogs: options.holdDialogs,
    trash: true,
    create: 'open',
    realActions: options.exec === undefined ? undefined : { exec: options.exec },
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
      fs.rmSync(storage, { recursive: true, force: true });
    },
  };
}

/** What E2 wires as the wall's `entryRefusal`: an entry that forwards the laptop's SSH agent is refused, with its sentence. */
function agentForwardRefusal(details: EntityMetadata | undefined): { code: 'denied'; message: string } | undefined {
  return details?.agentForward === true ? { code: 'denied', message: AGENT_FORWARD_REFUSED(details.name) } : undefined;
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

/** The parts of an answer a scenario compares: the status and the body without the one field that is a clock. */
export function normalised(reply: Reply): { status: number; body: string } {
  return { status: reply.status, body: reply.body.replace(/"durationMs":\d+/g, '"durationMs":0') };
}

/** Poll until `done` is true, or fail with `what`; the broker answers on its own schedule and a fixed sleep guesses it. */
export async function until(done: () => boolean, what: string, ms = 3_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!done()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
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
