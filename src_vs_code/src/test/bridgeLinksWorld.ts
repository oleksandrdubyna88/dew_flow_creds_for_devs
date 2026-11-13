import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BridgedSshConfigWriter, bridgedSshConfigWriter as RealWriter } from '../bridgedSshCall';
import type { SshUseDeps, sshExecAction as SshExecAction } from '../sshUseActions';
import type { EntityMetadata, PortForward } from '../types';
import type { UseAction } from '../useActions';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { ACCOUNT, locked, memoryStorage, seedEntry } from './pinWorld';
import { loadEachWithVscode } from './vscodeStub';
import { recordingLog } from './liveColourStorage';
import { callKeyName, materializedKeysDir } from '../materializedKeys';

/**
 * The REAL `sshExecAction` over a vault that links its entry to a key and a jump host (E1.3 epoch 3, L1-L5).
 *
 * <p>Built the way `sshUseActions.test.ts` builds it: only the I/O boundaries are substituted (`./sshExecRunner`,
 * which records what would have been run, `./keyInstaller`, which writes REAL files, and `./hostKeyTrust`), and the
 * credential resolution, the jump chain and the argv are the product's own. So an assertion about what an agent on a
 * bridge reads is an assertion about what the action really answers.</p>
 *
 * <p>The action reads THIS vault (`memoryStorage`); the broker's lookups read the wall world's tree. Two sources, by the
 * same ids (`e1`, `k1`, `j1`, all in `a1`), on purpose: a test seeds the one the code under test reads.</p>
 */

export interface LinksOptions {
  /** `e1`'s key `k1`: stored in the clear, or sealed with its own PIN, or absent (no key linked at all). */
  readonly key?: 'plain' | 'sealed' | 'none';
  /** `e1`'s jump host `j1`: none, a good address, or one that is not a valid host. */
  readonly jump?: 'none' | 'valid' | 'invalid';
  readonly agentForward?: boolean;
  /** `e1` has a `local` and a `remote` port forward (Amendment 3, C.2). */
  readonly forwards?: boolean;
  /** What the pretended `ssh` writes on stderr. */
  readonly stderr?: string;
  /** The `stderr` of the pretended `ssh` is `Load key "<the word after -i>": invalid format`, built from the argv that it got (K6). */
  readonly printsKeyPath?: boolean;
  /** The pretended `ssh` cannot be started. */
  readonly runFails?: boolean;
  /** Writing the key file fails, with a message that carries a path. */
  readonly writeFails?: boolean;
  /** The deps carry no `bridgedSshConfig`: a bridged call is refused before any slot or key (Amendment 6, F.4; E1.6 keeps the refusal for a world with no writer). */
  readonly noConfigWriter?: true;
  /** A writer of the test's own, in place of the real one of E1.6 (L14: a stub that says ok for an entry the argv rules refuse). */
  readonly writer?: (real: BridgedSshConfigWriter) => BridgedSshConfigWriter;
  /** `j1`'s credential: a stored key of its own (default), a stored password, nothing, a key sealed with its own PIN, or the path in `jumpEntry.sshKeyPath`. */
  readonly hopKey?: 'plain' | 'password' | 'none' | 'sealed' | 'typed';
  /** The chain walk answers a `-J` text and NO hop entries, as a caller that built the chain by hand would (R9). */
  readonly dropHops?: true;
  /** `e1` logs in by a stored password (and has no key). */
  readonly destPassword?: string;
  /** Fields of `e1` and of `j1` that a test sets over the defaults (a user, a pin, a key path). */
  readonly entry?: Partial<EntityMetadata>;
  readonly jumpEntry?: Partial<EntityMetadata>;
  /** Called inside the pretended `ssh`, after its `cwd` was read: a test adds a line to `bridges/known_hosts` here, as `ssh` would. */
  readonly onRun?: (run: Run, world: { readonly storageDir: string; readonly home: string }) => void;
  /** The keychain read of the linked key rejects, as a keychain that errors does (a thrown read must answer, and give the slot back). */
  readonly keyReadThrows?: true;
  /** The SSH agent's socket is up (a path): with `agentForward`, a signing prompt may follow the Allow. No real socket exists here, so the run itself stands in for the prompt (`hold`). */
  readonly agentSocket?: string;
}

export interface Run {
  readonly argv: string[];
  readonly program?: string;
  readonly env: NodeJS.ProcessEnv;
  /** The bound the action handed the runner: the exec ends at it. */
  readonly timeoutMs?: number;
  /** The working folder of the spawn: `undefined` off a bridge. */
  readonly cwd?: string;
  /** What the folder held while the pretended `ssh` ran, and the text of `c.conf` then (`undefined` with no `cwd`). */
  readonly cwdFiles?: string[];
  readonly conf?: string;
}

export interface LinksWorld {
  readonly exec: UseAction;
  readonly runs: Run[];
  /** What the action wrote to the agent journal. */
  readonly notes: string[];
  /** Every key file the run materialised. */
  readonly materialised: string[];
  /** How many times the per-call ssh_config writer was called. */
  readonly configWrites: number;
  /** The injected home of the person's own `known_hosts`: a folder of this world. */
  readonly home: string;
  /** Awaited inside the pretended `ssh`, before it answers: a test sets it to stand for a signing prompt that is open. */
  hold?: () => Promise<void>;
  /** The agent's socket as the action sees it NOW: a test brings it up or takes it down between a dialog's opening and its Allow. */
  socket: string | undefined;
  /** Exec slots taken and not yet given back. */
  readonly slotsHeld: number;
  readonly storageDir: string;
  cleanup(): void;
}

export const KEY_BODY = 'PRIVATE KEY BODY';
export const HOP_KEY_BODY = 'HOP PRIVATE KEY BODY';
export const HOP_KEY_NAME = 'hop-key';
export const HOP_PASSWORD = 'hop-password-value';
export const KEY_NAME = 'deploy-key';
export const JUMP_NAME = 'jump';
export const STDERR_WITH_A_HOST = 'kex_exchange_identification: jump.example.com';

const ssh = (id: string, name: string, extra: Partial<EntityMetadata>): EntityMetadata =>
  ({ id, name, kind: 'ssh', isSshEnabled: true, ...extra }) as EntityMetadata;

/** What the pretended `ssh` writes on stderr: the fixed text of the option, or the key path that it was given. */
const stderrOf = (o: { readonly stderr: string; readonly printsKeyPath: boolean }, argv: string[]): string =>
  o.printsKeyPath ? `Load key "${argv[argv.indexOf('-i') + 1]}": invalid format` : o.stderr;

export async function linksWorld(options: LinksOptions = {}): Promise<LinksWorld> {
  const o = { key: 'plain', jump: 'none', hopKey: 'plain', destPassword: undefined, entry: {}, jumpEntry: {}, agentForward: false, forwards: false, stderr: '', printsKeyPath: false, runFails: false, writeFails: false, ...options } as const;
  const owned = cleanupScope();
  const storageDir = ownedDir(owned, 'links');
  const runs: Run[] = [];
  const notes: string[] = [];
  const materialised: string[] = [];
  let configWrites = 0;
  let slotsHeld = 0;
  const home = ownedDir(owned, 'home');
  const stub = { window: { showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined), showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined) } };
  const writeKey = (dir: string, id: string, content: string): string => {
    if (o.writeFails) {
      throw new Error(`EACCES: permission denied, open '${path.join(dir, id)}.key'`);
    }
    fs.mkdirSync(materializedKeysDir(dir), { recursive: true, mode: 0o700 });
    const keyPath = path.join(materializedKeysDir(dir), `${id}.key`);
    fs.writeFileSync(keyPath, content, { mode: 0o600 });
    materialised.push(keyPath);
    return keyPath;
  };
  const mocks = {
    './keyInstaller': {
      materializePrivateKey: writeKey,
      materializeCallKey: (dir: string, content: string): string => writeKey(dir, callKeyName(), content),
      writeAskpassScriptFile: (): string => path.join(storageDir, 'askpass.sh'),
    },
    ...(options.dropHops === true ? { './sshOptions': withoutHops() } : {}),
    './hostKeyTrust': { materializeKnownHosts: (): string | undefined => undefined },
    './sshExecRunner': {
      runSshExec: async (argv: string[], run: { env: NodeJS.ProcessEnv; program?: string; timeoutMs?: number; cwd?: string }): Promise<unknown> => {
        const seen = { argv, program: run.program, env: run.env, timeoutMs: run.timeoutMs, cwd: run.cwd, ...readFolder(run.cwd) };
        runs.push(seen);
        options.onRun?.(seen, { storageDir, home });
        await world.hold?.();
        return o.runFails
          ? Promise.reject(new Error(`spawn ssh ENOENT at ${storageDir}`))
          : Promise.resolve({ exitCode: 0, stdout: 'ok\n', stderr: stderrOf(o, argv), timedOut: false });
      },
    },
  };
  const [mod, call] = loadEachWithVscode(['../sshUseActions', '../bridgedSshCall'], stub, mocks) as [{ sshExecAction: typeof SshExecAction }, { bridgedSshConfigWriter: typeof RealWriter }];
  const storage = memoryStorage(stub);
  await seedVault(storage, o);
  if (options.keyReadThrows === true) {
    storage.getPrivateKey = () => Promise.reject(new Error('the keychain would not answer'));
  }
  const realWriter = call.bridgedSshConfigWriter({ storage, storageDir, home, note: (message) => void notes.push(message) });
  const counted = (writer: BridgedSshConfigWriter): BridgedSshConfigWriter => (request) => {
    configWrites += 1;
    return writer(request);
  };
  const deps: SshUseDeps = {
    storage,
    storageDir,
    log: recordingLog().log, onMutated: () => undefined,
    signal: new AbortController().signal,
    acquireExecSlot: () => {
      slotsHeld += 1;
      return (): void => {
        slotsHeld -= 1;
      };
    },
    note: (message) => void notes.push(message),
    agentSocket: () => world.socket,
    // E1.6's real writer over this vault, counted; a test may put its own in front of it.
    ...writerDeps(options, realWriter, counted),
  };
  const world: LinksWorld = {
    exec: mod.sshExecAction(deps),
    socket: options.agentSocket,
    runs,
    notes,
    materialised,
    get configWrites() {
      return configWrites;
    },
    get slotsHeld() {
      return slotsHeld;
    },
    storageDir,
    home,
    cleanup: () => void owned.close(), // the folder is owned and claimed: closing the scope removes it
  };
  return world;
}

/** The options with every default filled in; `noConfigWriter` is not one of them, it is read where the deps are built. */
type Resolved = Required<Omit<LinksOptions, 'noConfigWriter' | 'keyReadThrows' | 'agentSocket' | 'writer' | 'onRun' | 'destPassword' | 'dropHops'>> & { readonly destPassword: string | undefined };

type Storage = Parameters<typeof seedEntry>[0];

async function seedVault(storage: Storage, o: Resolved): Promise<void> {
  await seedEntry(storage, ssh('e1', 'prod', linksOf(o)), o.destPassword === undefined ? {} : { password: o.destPassword });
  await seedKey(storage, o.key);
  await seedJump(storage, o);
}

/** A `local` and a `remote` forward: the first opens the laptop's port to the server, the second a listener on the server. */
const FORWARDS: PortForward[] = [
  { kind: 'local', bindPort: 8080, host: 'db', hostPort: 5432 },
  { kind: 'remote', bindPort: 9000, host: 'intranet.example', hostPort: 443 },
];

/** Whether `e1` forwards the agent and its two ports. */
function forwardingOf(o: Resolved): Partial<EntityMetadata> {
  return { ...(o.agentForward ? { agentForward: true } : {}), ...(o.forwards ? { portForwards: FORWARDS } : {}) };
}

/** `e1`'s own settings: the host, and the links to a key and a jump host as the options ask for them. */
function linksOf(o: Resolved): Partial<EntityMetadata> {
  const key = o.key === 'none' ? {} : { sshKeyEntityId: 'k1' };
  const jump = o.jump === 'none' ? {} : { jumpHostEntityId: 'j1' };
  return { host: 'prod.corp.com', user: 'deploy', ...key, ...jump, ...forwardingOf(o), ...o.entry };
}

/** The key entry `k1`: an `sshkey` that is never shared with an agent, holding the key body, in the clear or sealed under its own PIN. */
async function seedKey(storage: Storage, key: NonNullable<LinksOptions['key']>): Promise<void> {
  if (key === 'none') {
    return;
  }
  const sealed = key === 'sealed';
  const details = { id: 'k1', name: KEY_NAME, kind: 'sshkey', isSshEnabled: false, pinProtected: sealed || undefined } as EntityMetadata;
  await seedEntry(storage, details, { 'private key': sealed ? await locked(KEY_BODY) : KEY_BODY });
}

/** `j1`: a jump host with a key entry of its own (`hk1`), a stored password, a typed path, or nothing (`hopKey`), and the test's own fields over it. */
function hopEntry(o: Resolved): EntityMetadata {
  const own = hasHopKeyEntry(o) ? { sshKeyEntityId: 'hk1' } : {};
  return ssh('j1', JUMP_NAME, { host: o.jump === 'valid' ? 'jump.example.com' : 'bad host!', user: 'hop', ...own, ...o.jumpEntry });
}

const hasHopKeyEntry = (o: Resolved): boolean => o.hopKey === 'plain' || o.hopKey === 'sealed';

async function seedJump(storage: Storage, o: Resolved): Promise<void> {
  if (o.jump === 'none') {
    return;
  }
  await seedEntry(storage, hopEntry(o), o.hopKey === 'password' ? { password: HOP_PASSWORD } : {});
  await seedHopKey(storage, o);
}

/** The key entry `hk1` that `j1` links to: in the clear, or sealed under its own PIN. */
async function seedHopKey(storage: Storage, o: Resolved): Promise<void> {
  if (!hasHopKeyEntry(o)) {
    return;
  }
  const sealed = o.hopKey === 'sealed';
  const details = { id: 'hk1', name: HOP_KEY_NAME, kind: 'sshkey', isSshEnabled: false, pinProtected: sealed || undefined } as EntityMetadata;
  await seedEntry(storage, details, { 'private key': sealed ? await locked(HOP_KEY_BODY) : HOP_KEY_BODY });
}

/** `sshOptions` with a `resolveJumpHops` that keeps the `-J` text and drops the entries. */
function withoutHops(): Record<string, unknown> {
  const real = require('../sshOptions') as typeof import('../sshOptions');
  return {
    ...real,
    resolveJumpHops: (...args: Parameters<typeof real.resolveJumpHops>) => {
      const chain = real.resolveJumpHops(...args);
      return chain.ok ? { ok: true, value: chain.value } : chain;
    },
  };
}

/** The deps' writer of the per-call file: none, or the real one (counted), or the test's own put in front of it. */
function writerDeps(
  options: LinksOptions,
  real: BridgedSshConfigWriter,
  counted: (writer: BridgedSshConfigWriter) => BridgedSshConfigWriter,
): Pick<SshUseDeps, 'bridgedSshConfig'> {
  if (options.noConfigWriter === true) {
    return {};
  }
  return { bridgedSshConfig: counted(options.writer === undefined ? real : options.writer(real)) };
}

/** The tail of the file: what a pretended `ssh` reads of its working folder while it "runs". */
function readFolder(cwd: string | undefined): { cwdFiles?: string[]; conf?: string } {
  if (cwd === undefined) {
    return {};
  }
  return { cwdFiles: fs.readdirSync(cwd), conf: fs.readFileSync(path.join(cwd, 'c.conf'), 'utf8') };
}

export { ACCOUNT };
