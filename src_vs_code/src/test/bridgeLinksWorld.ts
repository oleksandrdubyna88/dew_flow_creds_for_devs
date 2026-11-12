import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SshUseDeps, sshExecAction as SshExecAction } from '../sshUseActions';
import type { EntityMetadata, PortForward } from '../types';
import type { UseAction } from '../useActions';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { ACCOUNT, locked, memoryStorage, seedEntry } from './pinWorld';
import { loadWithVscode } from './vscodeStub';
import { recordingLog } from './liveColourStorage';

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
  /** The pretended `ssh` cannot be started. */
  readonly runFails?: boolean;
  /** Writing the key file fails, with a message that carries a path. */
  readonly writeFails?: boolean;
  /** The deps carry no `bridgedSshConfig`, as production's do until E1.6 (Amendment 6, F.4): a bridged call is refused before any slot or key. */
  readonly noConfigWriter?: true;
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
}

export interface LinksWorld {
  readonly exec: UseAction;
  readonly runs: Run[];
  /** What the action wrote to the agent journal. */
  readonly notes: string[];
  /** Every key file the run materialised. */
  readonly materialised: string[];
  /** How many times the per-call ssh_config writer was called. Nothing calls it on the partial-E1 tree: the argv has no `-F` to name a file. */
  readonly configWrites: number;
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
export const KEY_NAME = 'deploy-key';
export const JUMP_NAME = 'jump';
export const STDERR_WITH_A_HOST = 'kex_exchange_identification: jump.example.com';

const ssh = (id: string, name: string, extra: Partial<EntityMetadata>): EntityMetadata =>
  ({ id, name, kind: 'ssh', isSshEnabled: true, ...extra }) as EntityMetadata;

export async function linksWorld(options: LinksOptions = {}): Promise<LinksWorld> {
  const o = { key: 'plain', jump: 'none', agentForward: false, forwards: false, stderr: '', runFails: false, writeFails: false, ...options } as const;
  const owned = cleanupScope();
  const storageDir = ownedDir(owned, 'links');
  const runs: Run[] = [];
  const notes: string[] = [];
  const materialised: string[] = [];
  let configWrites = 0;
  let slotsHeld = 0;
  const stub = { window: { showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined), showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined) } };
  const mocks = {
    './keyInstaller': {
      materializePrivateKey: (dir: string, id: string, content: string): string => {
        if (o.writeFails) {
          throw new Error(`EACCES: permission denied, open '${path.join(dir, id)}.key'`);
        }
        const keyPath = path.join(dir, `${id}.key`);
        fs.writeFileSync(keyPath, content, { mode: 0o600 });
        materialised.push(keyPath);
        return keyPath;
      },
      writeAskpassScriptFile: (): string => path.join(storageDir, 'askpass.sh'),
    },
    './hostKeyTrust': { materializeKnownHosts: (): string | undefined => undefined },
    './sshExecRunner': {
      runSshExec: async (argv: string[], run: { env: NodeJS.ProcessEnv; program?: string; timeoutMs?: number }): Promise<unknown> => {
        runs.push({ argv, program: run.program, env: run.env, timeoutMs: run.timeoutMs });
        await world.hold?.();
        return o.runFails
          ? Promise.reject(new Error(`spawn ssh ENOENT at ${storageDir}`))
          : Promise.resolve({ exitCode: 0, stdout: 'ok\n', stderr: o.stderr, timedOut: false });
      },
    },
  };
  const mod = loadWithVscode<{ sshExecAction: typeof SshExecAction }>('../sshUseActions', stub, mocks);
  const storage = memoryStorage(stub);
  await seedVault(storage, o);
  if (options.keyReadThrows === true) {
    storage.getPrivateKey = () => Promise.reject(new Error('the keychain would not answer'));
  }
  const deps: SshUseDeps = {
    storage,
    storageDir,
    log: recordingLog().log,
    signal: new AbortController().signal,
    acquireExecSlot: () => {
      slotsHeld += 1;
      return (): void => {
        slotsHeld -= 1;
      };
    },
    note: (message) => void notes.push(message),
    agentSocket: () => world.socket,
    // E1.6's writer, stood in for: it records its calls and writes nothing, because on this tree no call is made (the argv has no `-F`).
    ...(options.noConfigWriter === true ? {} : { bridgedSshConfig: () => {
      configWrites += 1;
      return { cwd: storageDir, configFile: 'c.conf' };
    } }),
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
    cleanup: () => void owned.close(), // the folder is owned and claimed: closing the scope removes it
  };
  return world;
}

/** The options with every default filled in; `noConfigWriter` is not one of them, it is read where the deps are built. */
type Resolved = Required<Omit<LinksOptions, 'noConfigWriter' | 'keyReadThrows' | 'agentSocket'>>;

type Storage = Parameters<typeof seedEntry>[0];

async function seedVault(storage: Storage, o: Resolved): Promise<void> {
  await seedEntry(storage, ssh('e1', 'prod', linksOf(o)), {});
  await seedKey(storage, o.key);
  await seedJump(storage, o.jump);
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
  return { host: 'prod.corp.com', user: 'deploy', ...key, ...jump, ...forwardingOf(o) };
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

async function seedJump(storage: Storage, jump: NonNullable<LinksOptions['jump']>): Promise<void> {
  if (jump !== 'none') {
    await seedEntry(storage, ssh('j1', JUMP_NAME, { host: jump === 'valid' ? 'jump.example.com' : 'bad host!', user: 'hop' }), {});
  }
}

export { ACCOUNT };
