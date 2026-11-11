import * as fs from 'node:fs';
import * as path from 'node:path';
import { agentMayView } from '../mcpEntries';
import { commandFingerprint } from '../commandTrust';
import { terminalRunAction, vpnAction } from '../agentUseActions';
import type { AgentUseDeps } from '../agentUseActions';
import { rotateAction } from '../rotateAction';
import type { RotateDeps } from '../rotateAction';
import { trustLineFor } from '../remoteLaunch';
import { resolveJumpChain } from '../sshOptions';
import type { SshUseDeps, sshExecAction as SshExecAction, sshTerminalAction as SshTerminalAction, execOverSsh as ExecOverSsh } from '../sshUseActions';
import type { EntityMetadata } from '../types';
import type { OverSsh, UseAction, UseActionContext, UseActionResult } from '../useActions';
import { stored } from '../storedSecret';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { HIDDEN_HOP_IDS, asBroker, hiddenHops } from './agentSshWorld';
import { ACCOUNT, locked, memoryStorage, seedEntry } from './pinWorld';
import { markerOf } from './unlistedWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * Part B of the class test (`todo/PLAN_agent_refusal_names_unlisted_entry_E2.md` §2): the REAL actions over a REAL vault in which the SSH
 * entry `prod` (`e1`) can use the key of a second entry and go through a chain of jump hosts, each hidden from agents.
 *
 * <p>Built the way `bridgeLinksWorld.ts` builds its world: only the I/O edges are replaced (`./keyInstaller`, which writes a REAL file in a
 * folder the world owns, `./hostKeyTrust`, `./sshExecRunner`, which records the argv, and `./sshConnect`, which opens nothing).
 * `./sshCredential` is NOT replaced: the resolver, the opener, the chain and the argv are the product's own. `e1` always holds a plain key
 * of its own, so a call is never refused at the credential step before the chain is read.</p>
 */

export { ACCOUNT };

/** The key of `e1` itself. */
export const OWN_KEY = 'PRIVATE KEY OWN-BODY';
/** The key entry's value, when it works. */
export const LINKED_KEY = 'PRIVATE KEY LINKED-BODY';
/** A cut envelope: a wrap that cannot be read. */
export const DAMAGED = '{"v":1,"lock":{"wrap":';
/** What the journal says when it will not take a line. */
export const JOURNAL_BROKEN = 'the journal could not be written';

/** The ids of the hidden entries that are not hops. Each has at least 10 characters and is no word of a sentence. */
export const HIDDEN_ID = { key: 'hid-key-8f3k2', ssh: 'hid-ssh-5d1w9', launcher: 'hid-lnc-2p7v4', dependency: 'hid-dep-6b9z1' } as const;

/** The names of the entries the agent may view. */
export const VISIBLE_NAME = { e1: 'prod', t1: 'deploy', t2: 'deploy-linked-hidden', v1: 'tunnel' } as const;

export interface SecondOptions {
  /** `e1` links to a key entry with `sshKeyEntityId`: a key that works, one sealed with its own PIN, one whose value is damaged. */
  readonly key?: 'none' | 'plain' | 'sealed' | 'damaged';
  /** The key entry gets `mcp: { view: true }` and no mark. */
  readonly keyVisible?: boolean;
  /** How many hidden hops `e1` goes through (at most 5). */
  readonly hops?: number;
  /** The hop (1 to 4) that has an address `isSafeSshTarget` refuses. */
  readonly unsafeAt?: number;
  /** The hops that get `mcp: { view: true }`. */
  readonly visibleHops?: readonly number[];
  /** `deps.note` throws. */
  readonly noteThrows?: boolean;
}

/** The doors of the world: each one makes one call of a real action. */
export type Door = 'exec' | 'terminal' | 'run' | 'runHidden' | 'rotate' | 'vpnUp';

export interface SecondWorld {
  /** One call of one door, answered by the real action. */
  readonly call: Readonly<Record<Door, () => Promise<UseActionResult>>>;
  /** What the actions wrote to the agent journal. */
  readonly notes: string[];
  /** The argv of every `ssh` that would have been started. */
  readonly spawned: string[][];
  /** Every key file the calls materialised. */
  readonly materialised: string[];
  readonly storage: ReturnType<typeof memoryStorage>;
  readonly storageDir: string;
  /** The names and the ids of the entries the agent may not view in THIS world, and the folder of the world. */
  readonly hiddenNames: string[];
  readonly hiddenIds: string[];
  /** The hidden names and the hidden ids of this world that `text` holds. */
  leaks(text: string): string[];
  /** Whether the agent may view the entry, as the product's own `agentMayView` answers it. */
  mayView(id: string): boolean;
  /** The name of the key entry, and of the hops by number. */
  readonly names: { readonly key: string; readonly hop: (n: number) => string };
  /** The context of a call, for a test that asks the action itself. */
  ctx(id: string): UseActionContext;
  cleanup(): void;
}

type Storage = ReturnType<typeof memoryStorage>;

const STATEMENT = 'echo {{creds:new}}';

const entry = (id: string, name: string, extra: Partial<EntityMetadata>): EntityMetadata =>
  ({ id, name, kind: 'ssh', isSshEnabled: true, host: 'h.example.test', user: 'u', ...extra });

const viewable: Partial<EntityMetadata> = { mcp: { view: true, use: true } };

/** `e1`: the SSH entry `prod`, with the links the options ask for. */
function e1Of(o: Required<SecondOptions>): EntityMetadata {
  return entry('e1', VISIBLE_NAME.e1, {
    host: 'prod.corp.com',
    user: 'deploy',
    ...viewable,
    ...(o.key === 'none' ? {} : { sshKeyEntityId: HIDDEN_ID.key }),
    ...(o.hops === 0 ? {} : { jumpHostEntityId: HIDDEN_HOP_IDS[0] }),
  });
}

/** The key entry: an `sshkey` that no switch opens to agents (or `view` on, for the control); sealed, it also carries the mark. */
async function seedKey(storage: Storage, o: Required<SecondOptions>): Promise<void> {
  if (o.key === 'none') {
    return;
  }
  const value = { plain: LINKED_KEY, sealed: await locked(LINKED_KEY), damaged: DAMAGED }[o.key];
  const details = entry(HIDDEN_ID.key, markerOf(HIDDEN_ID.key), {
    kind: 'sshkey',
    isSshEnabled: false,
    ...(o.key === 'sealed' ? { pinProtected: true } : {}),
    ...(o.keyVisible ? { mcp: { view: true } } : {}),
  });
  await seedEntry(storage, details, { 'private key': value });
}

/** The hops, each hidden unless the options show it; hop `n` jumps through hop `n + 1`. */
async function seedHops(storage: Storage, o: Required<SecondOptions>): Promise<void> {
  for (const [at, node] of hiddenHops(o.hops, o.unsafeAt).entries()) {
    const details = o.visibleHops.includes(at + 1) ? { ...node.details, mcp: { view: true } } : node.details;
    await seedEntry(storage, details as EntityMetadata, {});
  }
}

/** `t1` runs a line over `e1`; `t2` is linked to an SSH entry the agent may not view; `v1` is a VPN with a hidden launcher and a hidden dependency. */
async function seedLinked(storage: Storage): Promise<void> {
  const terminal = (id: string, name: string, sshEntityId: string): EntityMetadata =>
    ({ id, name, kind: 'terminal', isSshEnabled: false, isTerminal: true, command: 'echo linked', sshEntityId, ...viewable });
  await seedEntry(storage, terminal('t1', VISIBLE_NAME.t1, 'e1'), {});
  await seedEntry(storage, terminal('t2', VISIBLE_NAME.t2, HIDDEN_ID.ssh), {});
  await seedEntry(storage, entry(HIDDEN_ID.ssh, markerOf(HIDDEN_ID.ssh), {}), {});
  const vpn: EntityMetadata = { id: 'v1', name: VISIBLE_NAME.v1, kind: 'vpn', isSshEnabled: false, vpnLauncherEntityId: HIDDEN_ID.launcher, dependsOn: [HIDDEN_ID.dependency], ...viewable };
  await seedEntry(storage, vpn, {});
  await seedEntry(storage, entry(HIDDEN_ID.launcher, markerOf(HIDDEN_ID.launcher), {}), {});
  await seedEntry(storage, entry(HIDDEN_ID.dependency, markerOf(HIDDEN_ID.dependency), {}), {});
}

/** The fingerprint a person's approval of `t1`'s line over `e1` carries: the REAL chain and the REAL trust line, never a guessed value. */
function trustedLines(storage: Storage): string[] {
  const byId = (id: string): EntityMetadata | undefined => storage.getNode(ACCOUNT, id)?.details;
  const ssh = byId('e1') as EntityMetadata;
  const chain = resolveJumpChain(ssh, byId);
  return chain.ok ? [commandFingerprint('t1', trustLineFor(ssh, chain.value, 'echo linked'))] : [];
}

/** The deps of `rotateAction`: the stub deps of `rotateAction.test.ts`, with `e1` as the entity and a plain password in the slot. */
function rotateDeps(storage: Storage): RotateDeps {
  return {
    generate: () => ({ ok: true, value: 'NEW-secret-4b7e', kind: 'password' }),
    entity: () => storage.getNode(ACCOUNT, 'e1')?.details,
    current: () => Promise.resolve(stored('old-password-9f2c')),
    snapshot: () => Promise.resolve({ at: 1, name: VISIBLE_NAME.e1, details: entry('e1', VISIBLE_NAME.e1, {}), secrets: {} }),
    record: () => Promise.resolve(),
    store: () => Promise.resolve('stored' as const),
  };
}

interface Modules {
  readonly sshExecAction: typeof SshExecAction;
  readonly sshTerminalAction: typeof SshTerminalAction;
  readonly execOverSsh: typeof ExecOverSsh;
}

/** The I/O edges of the world, and nothing else. */
function mocksOf(storageDir: string, spawned: string[][], materialised: string[]): Record<string, unknown> {
  return {
    './keyInstaller': {
      materializePrivateKey: (dir: string, id: string, content: string): string => {
        const keyPath = path.join(dir, `${id}.key`);
        fs.writeFileSync(keyPath, content, { mode: 0o600 });
        materialised.push(keyPath);
        return keyPath;
      },
      writeAskpassScriptFile: (): string => path.join(storageDir, 'askpass.sh'),
    },
    './hostKeyTrust': { materializeKnownHosts: (): string | undefined => undefined },
    './sshExecRunner': {
      runSshExec: (argv: string[]): Promise<unknown> => {
        spawned.push(argv);
        return Promise.resolve({ exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false });
      },
    },
    './sshConnect': { connectEntity: (): Promise<boolean> => Promise.resolve(false) },
  };
}

/** The ids that exist in this world and that no switch opens to agents: the hops the options do not show, the key entry, and the three other hidden entries. */
function hiddenIdsOf(o: Required<SecondOptions>): string[] {
  const hops = HIDDEN_HOP_IDS.slice(0, o.hops).filter((_id, at) => !o.visibleHops.includes(at + 1));
  const key = o.key === 'none' || o.keyVisible ? [] : [HIDDEN_ID.key];
  return [...hops, ...key, HIDDEN_ID.ssh, HIDDEN_ID.launcher, HIDDEN_ID.dependency];
}

const defaults: Required<SecondOptions> = { key: 'none', keyVisible: false, hops: 0, unsafeAt: 0, visibleHops: [], noteThrows: false };

export async function secondEntryWorld(options: SecondOptions = {}): Promise<SecondWorld> {
  const o = { ...defaults, ...options };
  const owned = cleanupScope();
  const storageDir = ownedDir(owned, 'second');
  const notes: string[] = [];
  const spawned: string[][] = [];
  const materialised: string[] = [];
  const stub = { window: { showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined), showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined) } };
  const mod = loadWithVscode<Modules>('../sshUseActions', stub, mocksOf(storageDir, spawned, materialised));
  const storage = memoryStorage(stub);
  await seedEntry(storage, e1Of(o), { 'private key': OWN_KEY });
  await seedKey(storage, o);
  await seedHops(storage, o);
  await seedLinked(storage);
  const signal = new AbortController().signal;
  const sshDeps: SshUseDeps = {
    storage,
    storageDir,
    signal,
    acquireExecSlot: () => (): void => undefined,
    note: (message) => {
      if (o.noteThrows) {
        throw new Error(JOURNAL_BROKEN);
      }
      notes.push(message);
    },
    agentSocket: () => undefined,
  };
  const agentDeps: AgentUseDeps & { onPath: () => boolean; overSsh: OverSsh } = {
    ...sshDeps,
    trustStore: { get: () => trustedLines(storage), update: async () => undefined },
    applyEnv: async () => ({ written: [] as string[], withheld: [] }),
    onPath: () => false,
    overSsh: mod.execOverSsh(sshDeps),
  };
  return worldOf({ o, storage, storageDir, notes, spawned, materialised, hidden: hiddenIdsOf(o), mod, sshDeps, agentDeps, close: () => void owned.close() });
}

interface Parts {
  readonly o: Required<SecondOptions>;
  readonly storage: Storage;
  readonly storageDir: string;
  readonly notes: string[];
  readonly spawned: string[][];
  readonly materialised: string[];
  readonly hidden: string[];
  readonly mod: Modules;
  readonly sshDeps: SshUseDeps;
  readonly agentDeps: AgentUseDeps & { onPath: () => boolean; overSsh: OverSsh };
  readonly close: () => void;
}

function worldOf(p: Parts): SecondWorld {
  const names = (id: string): string => p.storage.getNode(ACCOUNT, id)?.name ?? id;
  const hiddenNames = p.hidden.map(markerOf);
  const ctx = (id: string): UseActionContext => ({ accountId: ACCOUNT, entityId: id, entityName: names(id), signal: p.sshDeps.signal });
  const exec = p.mod.sshExecAction(p.sshDeps);
  const run = terminalRunAction(p.agentDeps);
  const rotate = rotateAction(exec, 'command', rotateDeps(p.storage));
  const through = (action: UseAction, id: string, body: unknown = {}): (() => Promise<UseActionResult>) => () => action.run(ctx(id), body);
  const linked = (id: string): (() => Promise<UseActionResult>) => () => run.run(asBroker(run, ctx(id)), {});
  return {
    call: {
      exec: through(exec, 'e1', { command: 'uptime' }),
      terminal: through(p.mod.sshTerminalAction(p.sshDeps), 'e1'),
      run: linked('t1'),
      runHidden: linked('t2'),
      rotate: through(rotate, 'e1', { statement: STATEMENT }),
      vpnUp: through(vpnAction({ storage: p.storage, open: () => Promise.resolve(false) }, 'up'), 'v1'),
    },
    notes: p.notes,
    spawned: p.spawned,
    materialised: p.materialised,
    storage: p.storage,
    storageDir: p.storageDir,
    hiddenNames,
    hiddenIds: p.hidden,
    leaks: (text) => [...hiddenNames, ...p.hidden].filter((hidden) => text.includes(hidden)),
    mayView: (id) => agentMayView(p.storage, ACCOUNT, id),
    names: { key: markerOf(HIDDEN_ID.key), hop: (n) => markerOf(HIDDEN_HOP_IDS[n - 1]) },
    ctx,
    cleanup: p.close,
  };
}
