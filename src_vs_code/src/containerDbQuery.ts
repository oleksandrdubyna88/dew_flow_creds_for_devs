import { BRIDGE_USE_REFUSED } from './bridgeScope';
import { type DbClientVerdict, inEmptyFolder } from './bridgedDbClient';
import { BRIDGED_DB_PROFILES, type DbClient, type DbProfileRow } from './bridgedDbProfile';
import { bridgedSshEnv } from './bridgedSshEnv';
import { clampExecTimeout, errorBody, statusForErrorCode } from './brokerProtocol';
import { type ContainerRuntime, containerVerdict, probeArgv, queryArgv, writeEnvFile } from './containerDb';
import type { DbQueryLaunch } from './dbCliLauncher';
import { type SshExecOptions, type SshExecOutcome, runBounded } from './sshExecRunner';
import type { AgentUseDeps } from './agentUseActions';
import { type UseActionContext, type UseActionResult, launchGuards } from './useActions';

/**
 * The container road of a bridged database query (change 11.1, the 72-hour slice, S3): the client check is a probe of the image, and the
 * spawn is the container tool with the env file. Pure of `vscode`; `bridgedDbQuery.ts` hands a call here when the window has a container.
 */

/** What runs a child: the bounded runner by default; a test stands in. */
export type ContainerRun = (program: string, argv: string[], options: SshExecOptions) => Promise<SshExecOutcome>;

/** The window's container: `runtime` is `undefined` where the tool is not on this machine (the person is told how to prepare it). */
export interface ContainerDeps {
  readonly runtime: ContainerRuntime | undefined;
  readonly run?: ContainerRun;
}

/** What the person is told (the journal) when the tool or the image is not there. */
export const CONTAINER_NOT_READY =
  'A database query through a Remote Bridge runs its client in a Linux container on this computer, and the container is not ready: wslc is not installed, or the image was not built. Run "CredsForDevs: Prepare Database Container" once.';

type Deps = Pick<AgentUseDeps, 'storageDir' | 'signal' | 'acquireExecSlot' | 'note'> & { readonly container: ContainerDeps; readonly profiles?: readonly DbProfileRow[] };

const runner = (deps: Deps): ContainerRun => deps.container.run ?? ((program, argv, options) => runBounded(program, argv, false, options));

/** The env of the tool itself: the bridged allow-list and nothing of the call. The password is in the env file, never here. */
const toolEnv = (): NodeJS.ProcessEnv => bridgedSshEnv(process.env, process.platform, {});

/** The good verdicts, per image: an image is named by its recipe and run with `--pull never`, so what answered once answers the same. */
const kept = new Map<string, DbClientVerdict>();

/** The verdict on the client in the image: a probe with no network, read against the `container` row. A bad verdict is not kept. */
export async function containerCheck(deps: Deps, ctx: UseActionContext, client: DbClient): Promise<DbClientVerdict> {
  const runtime = deps.container.runtime;
  if (runtime === undefined) {
    return { ok: false, sentence: CONTAINER_NOT_READY };
  }
  return kept.get(runtime.image) ?? (await probed(deps, ctx, client, runtime));
}

/** The image was not built (or the tool cannot find it): `--pull never` makes the run end at once. */
const imageMissing = (outcome: Pick<SshExecOutcome, 'exitCode' | 'stderr'>): boolean => outcome.exitCode === 125 || /No such image|not found/i.test(outcome.stderr);

async function probed(deps: Deps, ctx: UseActionContext, client: DbClient, runtime: ContainerRuntime): Promise<DbClientVerdict> {
  const outcome = await inEmptyFolder(deps, 'probe', (dir) =>
    runner(deps)(runtime.tool, probeArgv(runtime), { env: toolEnv(), cwd: dir, timeoutMs: 60_000, ...launchGuards(deps.signal, ctx) }),
  );
  const verdict = imageMissing(outcome) ? { ok: false as const, sentence: CONTAINER_NOT_READY } : containerVerdict(deps.profiles ?? BRIDGED_DB_PROFILES, client, outcome.exitCode, outcome.stdout);
  if (verdict.ok) {
    kept.set(runtime.image, verdict);
  }
  return verdict;
}

/** Forgets the kept verdicts (a test; a rebuilt image is a new tag anyway). */
export function forgetContainerVerdicts(): void {
  kept.clear();
}

const fail = (message: string, ctx: UseActionContext, deps: Pick<AgentUseDeps, 'note'>): UseActionResult => {
  deps.note(`${ctx.entityName}: ${message} (a Remote Bridge was told only that it could not be used)`);
  return { status: statusForErrorCode('not_supported'), body: errorBody('not_supported', BRIDGE_USE_REFUSED(ctx.entityName)) };
};

/**
 * The query in the container: the exec slot, an env file with the password and the user, the tool started from a folder that holds nothing,
 * and the env file removed in a `finally` whatever the run came to. The client's path and arguments are the launch's, unchanged.
 */
export async function spawnInContainer(deps: Deps, ctx: UseActionContext, launch: DbQueryLaunch): Promise<UseActionResult> {
  const runtime = deps.container.runtime;
  if (runtime === undefined) {
    return fail(CONTAINER_NOT_READY, ctx, deps);
  }
  const envFile = writeEnvFile(deps.storageDir, launch.env);
  if ('refused' in envFile) {
    return fail(envFile.refused, ctx, deps);
  }
  const release = deps.acquireExecSlot();
  if (release === undefined) {
    envFile.remove();
    return { status: statusForErrorCode('too_many_requests'), body: errorBody('too_many_requests', 'Too many commands are already running.') };
  }
  try {
    const outcome = await inEmptyFolder(deps, 'query', (dir) =>
      runner(deps)(runtime.tool, queryArgv(runtime, envFile.path, launch), { env: toolEnv(), cwd: dir, timeoutMs: clampExecTimeout(undefined), ...launchGuards(deps.signal, ctx) }),
    );
    return { status: 200, body: outcome };
  } finally {
    envFile.remove();
    release();
  }
}
