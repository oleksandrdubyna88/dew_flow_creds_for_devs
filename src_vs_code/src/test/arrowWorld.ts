import { FieldReading } from '../fieldReading';
import type { EnvDrop } from '../sshProgram';
import { EntityMetadata, TreeNode } from '../types';
import { DiagnosticWriter } from '../diagnosticWriter';
import { WrittenChange } from './folderColorStorage';
import { LogLine, colouringStorage, recordingLog } from './liveColourStorage';
import { World, WorldOptions, memoryTrust, seedTrusted, world } from './vpnWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * The green arrow under the `vscode` stub: the REAL `credSshManager.runCommand` handler of
 * `registerRunCommands`, registered against a fake host, in the world of `vpnWorld.ts`.
 *
 * <p>The one module stood in for is `../extension` (`runCommands` imports `maskingBanner` from it, which would
 * otherwise load the whole extension). Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */
/** What `runInMaskedTerminal` was asked to run (the mock records the whole options): the shell variant has `commandLine`, the argv variant has `argv` and `cwd`. */
export interface MaskedRecord {
  name: string;
  commandLine?: string;
  argv?: readonly string[];
  cwd?: string;
  env: Record<string, string>;
  withoutEnv?: EnvDrop;
  stdinText?: string;
  secrets: readonly { value: string; label: string }[];
  banner: string;
  onEnded?: () => void;
}

export interface ArrowWorld extends World {
  /** Invoke the green arrow's handler on `entry`, exactly as a click does. `nodeName` is the tree node's own name. */
  run(entry: EntityMetadata, nodeName?: string): Promise<void>;
  /** Invoke `credSshManager.runScript` on `entry`. */
  runScript(entry: EntityMetadata, nodeName?: string): Promise<void>;
  /** Invoke `credSshManager.runWithSecrets` on `entry`. */
  runWithSecrets(entry: EntityMetadata, nodeName?: string): Promise<void>;
  /** The trust store the handlers read and write, so a test can ask `isCommandTrusted`. */
  trust: ReturnType<typeof memoryTrust>;
  /** What `runInMaskedTerminal` was asked to run, in order. */
  masked: MaskedRecord[];
  /** What `registerRunCommands` pushed into `context.subscriptions`. */
  subscriptions: unknown[];
  /** Invoke the green arrow's handler on version `index` of `entry`, as a click on a history row does. */
  runRevision(entry: EntityMetadata, revision: { name: string; details: EntityMetadata }, index?: number): Promise<void>;
  /** What storage holds, by node id: a test REPLACES a node here to model a sync that wrote a new record (E2.S1 N1). */
  nodes: Record<string, unknown>;
  /** How many times storage's `getNode` was called with `id`, from the start of the world. */
  reads(id: string): number;
  /** Every folder-colour write storage was asked for, in order (E1.S3). */
  colourWrites: WrittenChange[];
  /** What the diagnostic log was given, in order (E1.S3). */
  logged: LogLine[];
  /** How many times the host's tree repaint (`onMutated`) was called. */
  refreshed: { count: number };
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
  /** The person's road host (`SshRoad`) `registerRunCommands` is given. Default `NO_ROAD`: a test that reaches it fails loudly. */
  sshRoad?: unknown;
  /** The diagnostic log `registerRunCommands` is given. Default: one that keeps nothing. */
  log?: DiagnosticWriter;
  /** The tree repaint `registerRunCommands` is given. Default: one that does nothing. */
  onMutated?: () => void;
}

/** The road host of a world that has none: reaching it is the test's failure, not a silent pass. */
const NO_ROAD = {
  prepare: (): Promise<never> => Promise.reject(new Error('this world has no SSH road')),
  sayRefused: (): Promise<never> => Promise.reject(new Error('this world has no SSH road')),
};

const roadOf = (host: RunWorldHost): unknown => host.sshRoad ?? NO_ROAD;

/** The tree repaint of a world that was given none does nothing. */
const repaintOf = (host: RunWorldHost): (() => void) => host.onMutated ?? ((): void => undefined);

/** The diagnostic log of a world that was given none keeps nothing. */
const logOf = (host: RunWorldHost): DiagnosticWriter => host.log ?? recordingLog().log;

/** The nodes storage holds from the start, by id. */
function seededNodes(others: readonly TreeNode[] | undefined): Record<string, unknown> {
  return Object.fromEntries((others ?? []).map((other) => [other.id, other]));
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
    sshRoad: roadOf(host),
    log: logOf(host),
    onMutated: repaintOf(host),
  });
  return handlers;
}

/** The colour-write half of storage over the world's nodes; `fails` makes its first write reject. */
function colouringOver(nodes: Record<string, unknown>, fails: Error | undefined): ReturnType<typeof colouringStorage> {
  const colouring = colouringStorage({
    all: () => Object.values(nodes) as TreeNode[],
    replace: (node) => {
      nodes[node.id] = node;
    },
  });
  if (fails !== undefined) {
    colouring.failNextWrite(fails);
  }
  return colouring;
}

/** What an arrow world is built from: where the entry is stored, what the element claims, where a script is written. */
export interface ArrowOptions extends WorldOptions {
  /** The tree folder the entry is stored in. Absent: the entry is at the root. */
  parent?: TreeNode;
  /** The `parentId` the ELEMENT handed to the handler carries (a menu draws it before a move); default: the stored one. */
  elementParentId?: string;
  /** Where a script run writes its file. */
  storageDir?: string;
  /** The person's road host (`SshRoad`), as `registerRunCommands` receives it. */
  sshRoad?: unknown;
  /** Other nodes storage holds from the start (an SSH entry, a dependency): seeded once, by id. */
  others?: TreeNode[];
  /** `vscode.env.remoteName`: absent is a local window. */
  remoteName?: string;
  /** The mock of `runInMaskedTerminal` pushes `'spawn'` here when the test passes one, so a test can read the order of a road's steps. */
  events?: string[];
  /** Called by the mock AFTER it records a run: a test throws from it (a failed terminal creation) or calls `options.onEnded?.()` in it (a run that ended while being created). */
  onMasked?: (options: MaskedRecord) => void;
  /** Storage's first folder-colour write rejects with this error (a storage that cannot save). */
  colourWriteFails?: Error;
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
  (w.vscode.env as { remoteName?: string }).remoteName = opts.remoteName;
  const masked: ArrowWorld['masked'] = [];
  const store = memoryTrust();
  seedTrusted(store, trusted);
  const nodes = seededNodes(opts.others);
  const readsOf: Record<string, number> = {};
  const history: { name: string; details: EntityMetadata }[] = [];
  const subscriptions: unknown[] = [];
  const colouring = colouringOver(nodes, opts.colourWriteFails);
  const { log, lines: logged } = recordingLog();
  const refreshed = { count: 0 };
  const handlers = registerRunWorld(w, {
    log,
    onMutated: () => {
      refreshed.count += 1;
    },
    store,
    storage: {
      getNode: (_account: string, id: string) => {
        readsOf[id] = (readsOf[id] ?? 0) + 1;
        return nodes[id];
      },
      getHistory: () => Promise.resolve(history),
      getNodes: colouring.getNodes,
      updateNodeFields: colouring.updateNodeFields,
    },
    mocks: {
      '../maskedTerminal': {
        runInMaskedTerminal: (o: MaskedRecord): void => {
          masked.push(o);
          opts.events?.push('spawn');
          opts.onMasked?.(o);
        },
      },
    },
    refSource,
    subscriptions,
    storageDir: opts.storageDir,
    sshRoad: opts.sshRoad,
  });
  /** Storage holds the entry (and its folder) as the tree has them NOW. */
  const seed = (entry: EntityMetadata, nodeName: string): void => {
    // The folder is seeded ONCE: a colour a run wrote into it must survive the next click.
    if (opts.parent !== undefined) {
      nodes[opts.parent.id] ??= opts.parent;
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
  return { ...w, run: invoke('credSshManager.runCommand'), runScript: invoke('credSshManager.runScript'), runWithSecrets: invoke('credSshManager.runWithSecrets'), trust: store, masked, subscriptions, runRevision, nodes, reads: (id) => readsOf[id] ?? 0, colourWrites: colouring.written, logged, refreshed };
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

/** The module `registerRunWorld` loads, for a test that compares with one of its exports (`NO_REFERENCE`). */
export function runCommandsModule(): { NO_REFERENCE(name: string): string } {
  return loadWithVscode<{ NO_REFERENCE(name: string): string }>('../commands/runCommands', world({}).vscode, { '../extension': { maskingBanner: () => '' } });
}
