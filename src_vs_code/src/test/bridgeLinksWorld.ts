import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SshUseDeps, sshExecAction as SshExecAction } from '../sshUseActions';
import type { EntityMetadata, PortForward } from '../types';
import type { UseAction } from '../useActions';
import { ACCOUNT, locked, memoryStorage, seedEntry } from './pinWorld';
import { loadWithVscode } from './vscodeStub';

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
}

export interface Run {
  readonly argv: string[];
  readonly program?: string;
  readonly env: NodeJS.ProcessEnv;
}

export interface LinksWorld {
  readonly exec: UseAction;
  readonly runs: Run[];
  /** What the action wrote to the agent journal. */
  readonly notes: string[];
  /** Every key file the run materialised. */
  readonly materialised: string[];
  readonly storageDir: string;
  cleanup(): void;
}

export const KEY_BODY = 'PRIVATE KEY BODY';
export const KEY_NAME = 'deploy-key';
export const JUMP_NAME = 'jump';
export const STDERR_WITH_A_HOST = 'kex_exchange_identification: jump.corp.com';

const ssh = (id: string, name: string, extra: Partial<EntityMetadata>): EntityMetadata =>
  ({ id, name, kind: 'ssh', isSshEnabled: true, ...extra }) as EntityMetadata;

export async function linksWorld(options: LinksOptions = {}): Promise<LinksWorld> {
  const o = { key: 'plain', jump: 'none', agentForward: false, forwards: false, stderr: '', runFails: false, writeFails: false, ...options } as const;
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-links-'));
  const runs: Run[] = [];
  const notes: string[] = [];
  const materialised: string[] = [];
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
      runSshExec: (argv: string[], run: { env: NodeJS.ProcessEnv; program?: string }): Promise<unknown> => {
        runs.push({ argv, program: run.program, env: run.env });
        return o.runFails
          ? Promise.reject(new Error(`spawn ssh ENOENT at ${storageDir}`))
          : Promise.resolve({ exitCode: 0, stdout: 'ok\n', stderr: o.stderr, timedOut: false });
      },
    },
  };
  const mod = loadWithVscode<{ sshExecAction: typeof SshExecAction }>('../sshUseActions', stub, mocks);
  const storage = memoryStorage(stub);
  await seedVault(storage, o);
  const deps: SshUseDeps = {
    storage,
    storageDir,
    signal: new AbortController().signal,
    acquireExecSlot: () => (): void => undefined,
    note: (message) => void notes.push(message),
    agentSocket: () => undefined,
  };
  return { exec: mod.sshExecAction(deps), runs, notes, materialised, storageDir, cleanup: () => fs.rmSync(storageDir, { recursive: true, force: true }) };
}

type Storage = Parameters<typeof seedEntry>[0];

async function seedVault(storage: Storage, o: Required<LinksOptions>): Promise<void> {
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
function forwardingOf(o: Required<LinksOptions>): Partial<EntityMetadata> {
  return { ...(o.agentForward ? { agentForward: true } : {}), ...(o.forwards ? { portForwards: FORWARDS } : {}) };
}

/** `e1`'s own settings: the host, and the links to a key and a jump host as the options ask for them. */
function linksOf(o: Required<LinksOptions>): Partial<EntityMetadata> {
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
    await seedEntry(storage, ssh('j1', JUMP_NAME, { host: jump === 'valid' ? 'jump.corp.com' : 'bad host!', user: 'hop' }), {});
  }
}

export { ACCOUNT };
