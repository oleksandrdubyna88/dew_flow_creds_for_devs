import { siblingOrder } from '../stateKeys';
import { EntityMetadata, TreeNode } from '../types';
import { registerRunWorld } from './arrowWorld';
import { WrittenChange } from './folderColorStorage';
import { LogLine, colouringStorage, recordingLog } from './liveColourStorage';
import { FakeTerminal, HeldDialog, World, WorldOptions, hostOs, memoryTrust, seedTrusted, titleIn, until, world } from './vpnWorld';

/**
 * The folder run under the `vscode` stub: the REAL `credSshManager.runFolder` handler of `registerRunCommands`, registered
 * against a fake host, in the world of `vpnWorld.ts`, over a real display order (`siblingOrder`).
 * Not named `*.test.ts`, so the runner never treats it as a suite.
 */
export const FOLDER = 'claude sessions';

/** The folder node the world's entries are direct children of (a test may override parts of it through `folder`). */
export const FOLDER_NODE: TreeNode = { id: 'f', name: FOLDER, type: 'folder', folderType: 'terminal', parentId: null };

/** The terminal an entry named `name` runs in: the real title of a direct child of the folder. */
export const T = (name: string): string => titleIn(FOLDER_NODE, name);

/** A Terminal entry whose line is `tmux attach -t <name>`, its id being its name. */
export function session(name: string, extra: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: name, name, isSshEnabled: false, isTerminal: true, command: 'tmux attach', commandArgs: [{ value: '-t {name}' }], ...extra };
}

export const L = (name: string): string => `tmux attach -t ${name}`;

export const FOLDER_MODAL = /^Run the entries of /;

/** A Terminal entry outside the folder, a chain step: exits with code 0 unless `exitCodes` says otherwise. */
export function step(name: string, command = `do-${name}`): EntityMetadata {
  return { id: name, name, isSshEnabled: false, isTerminal: true, command, terminalOs: hostOs };
}

export interface FolderWorldOptions extends WorldOptions {
  /** [entityId, line] pairs already vouched for. */
  trusted?: readonly (readonly [string, string])[];
  /** Overrides on the folder node. */
  folder?: Partial<TreeNode>;
  /** Direct subfolders' names. */
  subfolders?: readonly string[];
  /** Entries outside the folder, for `dependsOn`. */
  outside?: readonly EntityMetadata[];
  exitCodes?: Record<string, number>;
  /** A Trash folder exists, id `trash`. */
  trash?: boolean;
  /** The store's write lands a tick later, as a real Memento's does: a second write started meanwhile would lose the first. */
  slowTrust?: boolean;
  /** Every write to the store rejects. */
  failTrust?: boolean;
  /** Modules to stand in for, by the request string their importer writes. */
  mocks?: Record<string, unknown>;
  /** The person's road host (`SshRoad`), as `registerRunCommands` receives it (E2.S2). */
  sshRoad?: unknown;
  /** Storage's first folder-colour write rejects with this error (a storage that cannot save). */
  colourWriteFails?: Error;
}

export interface FolderWorld extends World {
  /** Invoke the handler, as a click on the folder's arrow does; `target` overrides what the click hands over. */
  click(target?: unknown): Promise<void>;
  /** Invoke the green arrow's handler on the direct entry `id`, as a click on its row does: the same world, the same tracker. */
  arrow(id: string): Promise<void>;
  /** What a click on the folder's row hands over. */
  folderTarget: unknown;
  trust: ReturnType<typeof memoryTrust>;
  activity(): number;
  /** The tree the handler reads: a test edits an entry's record in place, as a sync or an edit does while a modal sits. */
  nodes: TreeNode[];
  /** Every folder-colour write storage was asked for, in order (E1.S3). */
  colourWrites: WrittenChange[];
  /** What the diagnostic log was given, in order (E1.S3). */
  logged: LogLine[];
  /** How many times the host's tree repaint (`onMutated`) was called. */
  refreshed: { count: number };
}

function trustStore(o: FolderWorldOptions): ReturnType<typeof memoryTrust> {
  const store = memoryTrust();
  if (o.failTrust === true) {
    return { get: store.get, update: () => Promise.reject(new Error('the store is down')) };
  }
  return o.slowTrust === true
    ? { get: store.get, update: (k, v) => new Promise<void>((resolve) => setImmediate(() => void store.update(k, v).then(resolve))) }
    : store;
}

function exitCodesOf(o: FolderWorldOptions): Record<string, number> {
  return o.exitCodes ?? {};
}

/** The folder first; then its subfolders and entries; then what lies outside it. */
function treeOf(entries: readonly EntityMetadata[], o: FolderWorldOptions): TreeNode[] {
  const entity = (parentId: string | null) => (details: EntityMetadata): TreeNode => ({ id: details.id, name: details.name, type: 'entity', parentId, details });
  const subfolder = (name: string): TreeNode => ({ id: `sub-${name}`, name, type: 'folder', folderType: 'terminal', parentId: 'f' });
  const trashNode: TreeNode = { id: 'trash', name: 'Trash', type: 'folder', parentId: null, isTrash: true };
  return [
    { ...FOLDER_NODE, ...o.folder },
    ...(o.subfolders ?? []).map(subfolder),
    ...entries.map(entity('f')),
    ...(o.outside ?? []).map(entity(null)),
    ...(o.trash === true ? [trashNode] : []),
  ];
}

export function folderWorld(entries: readonly EntityMetadata[], o: FolderWorldOptions = {}): FolderWorld {
  const w = world(exitCodesOf(o), o);
  const store = trustStore(o);
  seedTrusted(store, o.trusted ?? []);
  const nodes = treeOf(entries, o);
  const folder = nodes[0];
  const activity = { count: 0 };
  const colouring = colouringStorage({
    all: () => nodes,
    replace: (node) => {
      const at = nodes.findIndex((n) => n.id === node.id);
      if (at >= 0) {
        nodes[at] = node;
      }
    },
  });
  if (o.colourWriteFails !== undefined) {
    colouring.failNextWrite(o.colourWriteFails);
  }
  const { log, lines: logged } = recordingLog();
  const refreshed = { count: 0 };
  const handlers = registerRunWorld(w, {
    log,
    onMutated: () => {
      refreshed.count += 1;
    },
    store,
    storage: {
      getNode: (_account: string, id: string) => nodes.find((n) => n.id === id),
      getChildren: (_account: string, parent: string | null) => nodes.filter((n) => (n.parentId ?? null) === parent).sort(siblingOrder),
      getHistory: () => Promise.resolve([]),
      getNodes: colouring.getNodes,
      updateNodeFields: colouring.updateNodeFields,
    },
    mocks: o.mocks,
    sshRoad: o.sshRoad,
    onActivity: () => {
      activity.count += 1;
    },
  });
  const folderTarget = { kind: 'node', accountId: 'a1', node: { ...folder } };
  return {
    ...w,
    click: (...args: unknown[]) => handlers['credSshManager.runFolder'](args.length === 0 ? folderTarget : args[0]),
    arrow: (id: string) => handlers['credSshManager.runCommand']({ kind: 'node', accountId: 'a1', node: nodes.find((n) => n.id === id) }),
    folderTarget,
    trust: store,
    activity: () => activity.count,
    nodes,
    colourWrites: colouring.written,
    logged,
    refreshed,
  };
}

/** An entry that asks for its dependencies to run first. */
export function needing(name: string, ...dependsOn: string[]): EntityMetadata {
  return session(name, { dependsOn, runDependencies: true });
}

export function named(w: FolderWorld, name: string): FakeTerminal[] {
  return w.terminals.filter((t) => t.name === T(name));
}

/** A folder world whose folder modal waits for the test (and any other dialog `holdDialogs` matches). */
export function held(entries: readonly EntityMetadata[], o: FolderWorldOptions = {}): FolderWorld {
  return folderWorld(entries, { holdDialogs: o.holdDialogs ?? FOLDER_MODAL, ...o });
}

export function folderModals(w: FolderWorld): string[] {
  return w.warnings.filter((text) => FOLDER_MODAL.test(text));
}

export async function modalNumber(w: FolderWorld, n: number): Promise<HeldDialog> {
  await until(() => w.held.length >= n, `dialog ${n}`);
  return w.held[n - 1];
}

export function choose(dialog: HeldDialog, which: 'first' | 'last'): void {
  dialog.answer(dialog.buttons[which === 'first' ? 0 : dialog.buttons.length - 1]);
}

/** Click, wait for the folder modal, and hand back the click's promise. */
export async function clickAndWait(w: FolderWorld): Promise<{ done: Promise<void>; modal: HeldDialog }> {
  const done = w.click();
  return { done, modal: await modalNumber(w, 1) };
}

export function everyText(w: FolderWorld): string {
  return [...w.warnings, ...w.infos].join('\n');
}
