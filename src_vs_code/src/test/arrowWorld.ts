import { FieldReading } from '../fieldReading';
import { EntityMetadata, TreeNode } from '../types';
import { World, WorldOptions, memoryTrust, seedTrusted, world } from './vpnWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * The green arrow under the `vscode` stub: the REAL `credSshManager.runCommand` handler of
 * `registerRunCommands`, registered against a fake host, in the world of `vpnWorld.ts`.
 *
 * <p>The one module stood in for is `../extension` (`runCommands` imports `maskingBanner` from it, which would
 * otherwise load the whole extension). Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */
export interface ArrowWorld extends World {
  /** Invoke the green arrow's handler on `entry`, exactly as a click does. `nodeName` is the tree node's own name. */
  run(entry: EntityMetadata, nodeName?: string): Promise<void>;
  /** Invoke `credSshManager.runScript` on `entry`. */
  runScript(entry: EntityMetadata, nodeName?: string): Promise<void>;
  /** Invoke `credSshManager.runWithSecrets` on `entry`. */
  runWithSecrets(entry: EntityMetadata, nodeName?: string): Promise<void>;
  /** The trust store the handlers read and write, so a test can ask `isCommandTrusted`. */
  trust: ReturnType<typeof memoryTrust>;
  /** What `runInMaskedTerminal` was asked to run: the line and the environment of each child. */
  masked: { name: string; commandLine: string; env: Record<string, string> }[];
  /** What `registerRunCommands` pushed into `context.subscriptions`. */
  subscriptions: unknown[];
  /** Invoke the green arrow's handler on version `index` of `entry`, as a click on a history row does. */
  runRevision(entry: EntityMetadata, revision: { name: string; details: EntityMetadata }, index?: number): Promise<void>;
}

export type Handler = (target: unknown) => Promise<void>;

export interface RunWorldHost {
  /** The trust store `context.globalState` is. */
  store: ReturnType<typeof memoryTrust>;
  /** What the handlers read nodes and history from. */
  storage: Record<string, unknown>;
  /** Modules to stand in for besides `../extension`, by the request string their importer writes. */
  mocks?: Record<string, unknown>;
  /** What `creds://` references are read from: nothing, unless a test gives one. */
  refSource?: unknown;
  /** What `registerRunCommands` pushes into `context.subscriptions`. */
  subscriptions?: unknown[];
  /** Called once per `noteUserActivity`. */
  onActivity?: () => void;
  /** Where scripts are written; a test that runs one gives an owned directory. Default `/storage`. */
  storageDir?: string;
}

/**
 * The REAL `registerRunCommands` registered against a fake host in world `w`; every handler it registers, by command.
 * The one module always stood in for is `../extension` (it would otherwise load the whole extension).
 */
export function registerRunWorld(w: World, host: RunWorldHost): Record<string, Handler> {
  const mod = loadWithVscode<{ registerRunCommands(host: unknown): void }>('../commands/runCommands', w.vscode, {
    '../extension': { maskingBanner: () => '' },
    ...host.mocks,
  });
  const handlers: Record<string, Handler> = {};
  mod.registerRunCommands({
    context: { globalState: host.store, subscriptions: host.subscriptions ?? [] },
    refSource: host.refSource ?? {},
    register: (command: string, handler: Handler) => {
      handlers[command] = handler;
    },
    storage: host.storage,
    storageDir: host.storageDir ?? '/storage',
    vaultKeys: { noteUserActivity: () => host.onActivity?.() },
  });
  return handlers;
}

/** What an arrow world is built from: where the entry is stored, what the element claims, where a script is written. */
export interface ArrowOptions extends WorldOptions {
  /** The tree folder the entry is stored in. Absent: the entry is at the root. */
  parent?: TreeNode;
  /** The `parentId` the ELEMENT handed to the handler carries (a menu draws it before a move); default: the stored one. */
  elementParentId?: string;
  /** Where a script run writes its file. */
  storageDir?: string;
}

/** The tree element a click hands over: the node as the menu drew it, its `parentId` possibly old. */
function elementOf(opts: ArrowOptions, entry: EntityMetadata, nodeName: string): Record<string, unknown> {
  const parentId = opts.elementParentId ?? opts.parent?.id;
  return { id: entry.id, name: nodeName, details: entry, parentId };
}

/**
 * The world with `runCommands` registered against a fake host; `trusted` are [entityId, line] pairs already vouched for,
 * and `refSource` is what `creds://` references are read from (nothing, unless a test gives one).
 */
export function arrowWorld(opts: ArrowOptions = {}, trusted: readonly (readonly [string, string])[] = [], refSource: unknown = {}): ArrowWorld {
  const w = world({}, opts);
  const masked: ArrowWorld['masked'] = [];
  const store = memoryTrust();
  seedTrusted(store, trusted);
  const nodes: Record<string, unknown> = {};
  const history: { name: string; details: EntityMetadata }[] = [];
  const subscriptions: unknown[] = [];
  const handlers = registerRunWorld(w, {
    store,
    storage: { getNode: (_account: string, id: string) => nodes[id], getHistory: () => Promise.resolve(history) },
    mocks: { '../maskedTerminal': { runInMaskedTerminal: (o: { name: string; commandLine: string; env: Record<string, string> }) => void masked.push(o) } },
    refSource,
    subscriptions,
    storageDir: opts.storageDir,
  });
  /** Storage holds the entry (and its folder) as the tree has them NOW. */
  const seed = (entry: EntityMetadata, nodeName: string): void => {
    if (opts.parent !== undefined) {
      nodes[opts.parent.id] = opts.parent;
    }
    nodes[entry.id] = { id: entry.id, type: 'entity', name: nodeName, details: entry, parentId: opts.parent?.id };
  };
  const invoke = (command: string) => (entry: EntityMetadata, nodeName: string = entry.name): Promise<void> => {
    seed(entry, nodeName);
    return handlers[command]({ kind: 'node', accountId: 'a1', node: elementOf(opts, entry, nodeName) });
  };
  const runRevision: ArrowWorld['runRevision'] = (entry, revision, index = 0) => {
    seed(entry, entry.name);
    history[index] = revision;
    return handlers['credSshManager.runCommand']({ kind: 'revision', accountId: 'a1', index, node: { id: entry.id, name: entry.name, details: entry } });
  };
  return { ...w, run: invoke('credSshManager.runCommand'), runScript: invoke('credSshManager.runScript'), runWithSecrets: invoke('credSshManager.runWithSecrets'), trust: store, masked, subscriptions, runRevision };
}

/** A vault of one account `me` holding the entities named, each with the one password: the `refSource` of `arrowWorld`, and the ids it was asked to read. */
export function vaultOf(names: readonly string[], reading: () => FieldReading = () => ({ kind: 'value', value: 'correct-horse-battery' })) {
  const calls: string[] = [];
  const source = {
    accounts: () => [{ accountId: 'acc', email: 'me' }],
    entities: () => names.map((name) => ({ id: `id-${name}`, name, path: [name] })),
    fieldReading: (_account: string, entityId: string) => {
      calls.push(entityId);
      return Promise.resolve(reading());
    },
  };
  return { source, calls };
}
