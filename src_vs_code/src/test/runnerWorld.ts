import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Owner, Scope } from '../../scripts/lib/leftovers.cjs';
import { formatOwner, ownedDir, thisOwner, thisOwnerToken } from '../../scripts/lib/leftovers.cjs';

/**
 * The shared world of the runner's test files (`leftoversRunner.test.ts`, `leftoversRunnerGate.test.ts`): the runner as the ES
 * module it is, its seams, a coordinator that "runs a suite" without starting anything, a planted folder, a probe for a live pid.
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

export type Spawn = (command: string, args: string[], options: { env: NodeJS.ProcessEnv; detached?: boolean; stdio?: unknown }) => EventEmitter;
export interface Ended {
  ended: boolean;
  alive: number;
  reason?: string;
}
/** What a scan for survivors answers: the pids it found, and what it could not look at (an unreadable /proc). */
export interface Found {
  pids: number[];
  unverified: string[];
}
export interface Seams {
  spawn?: Spawn;
  sweep?: (options: { repo: string; tmp: string }) => object;
  roots?: string[];
  record?: string;
  confirm?: (tree?: unknown) => Promise<Ended>;
  survivors?: (query: { rootPid?: number; record: string }) => Found | Promise<Found>;
  pidAlive?: (pid: number) => boolean;
  mine?: (target: string) => boolean;
  settleTimeoutMs?: number;
  timeoutMs?: number;
  stdio?: string;
  write?: (line: string) => void;
}
export interface Runner {
  runWithAudit(extra?: string[], seams?: Seams): Promise<number>;
  exitCodeOf(result: { status?: number | null; signal?: NodeJS.Signals | null; error?: Error }): number;
  timeoutFrom(env: Record<string, string | undefined>): number;
  DEFAULT_TIMEOUT_MS: number;
}
export interface TreeModule {
  confirmTreeEnded(
    tree: { root: number } | undefined,
    options?: { timeoutMs?: number; stepMs?: number; maxStepMs?: number; probe?: () => boolean; count?: () => number; now?: () => number; pause?: (ms: number) => Promise<void> },
  ): Promise<Ended>;
  findSurvivors(query: { rootPid?: number; record: string; platform?: string; procRoot?: string; since?: number; startOf?: (pid: number) => number | undefined }): Found;
  startInJob(command: string, args: string[], options: { env: NodeJS.ProcessEnv; stdio?: string }, runFn?: () => Promise<unknown>): EventEmitter;
  SUPERVISOR_MAX_OUTPUT_BYTES: number;
}

export const SRC_VS_CODE = path.resolve(__dirname, '..', '..');
export const WRAPPER = path.join(SRC_VS_CODE, 'scripts', 'lib', 'leftovers.cjs');
const RUNNER = path.join(SRC_VS_CODE, 'scripts', 'run-tests.mjs');
const TREE = path.join(SRC_VS_CODE, 'scripts', 'lib', 'processTree.mjs');
// module: Node16 keeps a dynamic import() as one in the CommonJS output, so it can load the .mjs.
export const runner = async (): Promise<Runner> => (await import(pathToFileURL(RUNNER).href)) as Runner;
export const processTree = async (): Promise<TreeModule> => (await import(pathToFileURL(TREE).href)) as TreeModule;

/**
 * NODE_TEST_CONTEXT is how node tells a test process it is the child of a runner. A nested `node --test` that inherits it
 * reports to that parent and exits 0 without running, so every REAL suite these tests start is given an environment without it.
 */
export const WITHOUT_TEST_CONTEXT = { NODE_TEST_CONTEXT: undefined };

export const nothingSwept = (): object => ({ removed: [], preserved: [], listed: [], errors: [] });
/** The answer of a confirmation that proves the tree ended: a coordinator that is only a fake has no pid, so nothing can confirm it itself. */
export const ENDED = async (): Promise<Ended> => ({ ended: true, alive: 0 });
export const me = thisOwnerToken();
export const RECORD = formatOwner(thisOwner());

/** A private root for one scenario: the folders the scenario makes and counts are the only ones in it. */
export const privateRoot = (scope: Scope): string => ownedDir(scope, 'aud');

/**
 * This process's owner record with another `pid` and, when given, a `start`. Every field is written out: a spread cast to `Owner`
 * would hide a field the record grammar needs, and a fixture the grammar rejects proves nothing (testing.md).
 */
export function ownerWith(pid: number, start?: number): Owner {
  const base = thisOwner();
  const owner: Owner = { owner: base.owner, host: base.host, pid };
  return start === undefined ? owner : { ...owner, start, ...(base.ns === undefined ? {} : { ns: base.ns }) };
}

/** A folder of the owner form claimed by `record` (or by no one when `record` is undefined), made by hand. */
export function plant(root: string, what: string, record?: string): string {
  const dir = path.join(root, `testsToDelete-${me}-creds-${what}-abc123`);
  fs.mkdirSync(dir);
  if (record !== undefined) fs.writeFileSync(`${dir}.owner`, `${record}\n`);
  return dir;
}

/** A coordinator that "runs a suite": does `work`, then exits with `status`. Starts nothing; its pid is none. */
export function suite(status: number, work: () => void = () => undefined, seen?: { env?: NodeJS.ProcessEnv; args?: string[] }): Spawn {
  return (_command, args, options) => {
    if (seen !== undefined) {
      seen.env = options.env;
      seen.args = args;
    }
    const child = new EventEmitter();
    setImmediate(() => {
      work();
      child.emit('exit', status, null);
    });
    return child;
  };
}

export function lines(): { write: (line: string) => void; seen: string[] } {
  const seen: string[] = [];
  return { write: (line) => seen.push(line), seen };
}

export const exists = (target: string): boolean => fs.existsSync(target);

/** Is `pid` a process right now? `process.kill(pid, 0)` on POSIX; `tasklist` on Windows, where signal 0 is not a probe everywhere. */
export function isAlive(pid: number): boolean {
  if (process.platform === 'win32') {
    const answer = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], { encoding: 'utf8' });
    return answer.includes(`"${pid}"`);
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `body` with extra variables in this process's environment (and no NODE_TEST_CONTEXT): the runner copies its own
 * environment into the real `node --test` it starts, on every OS and through its own tree policy — a spawn seam here would
 * bypass the Windows supervisor, which is exactly what the kill path must not skip.
 */
export async function withEnv<T>(vars: Record<string, string>, body: () => Promise<T>): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const key of [...Object.keys(vars), 'NODE_TEST_CONTEXT']) saved.set(key, process.env[key]);
  delete process.env.NODE_TEST_CONTEXT;
  Object.assign(process.env, vars);
  try {
    return await body();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
