import { BRIDGE_USE_REFUSED } from './bridgeScope';
import { DbClientCheck, DbClientVerdict, goodVerdict, inEmptyFolder } from './bridgedDbClient';
import { BRIDGED_DB_PROFILES, DbProfileRow, bridgedDbConnection, bridgedDbPair, profileClientOf } from './bridgedDbProfile';
import { DR9, clientNameOf } from './bridgedDbSentences';
import { bridgedSshEnv } from './bridgedSshEnv';
import { ErrorCode, clampExecTimeout, errorBody, statusForErrorCode } from './brokerProtocol';
import { DbQueryLaunch, buildDbQueryLaunch, refuseQuery, resolveDbCli } from './dbCliLauncher';
import { materializedKeyPath } from './materializedKeys';
import { fieldReadingOf } from './secretOpener';
import { automaticOpenerFor } from './automaticRead';
import { runBounded } from './sshExecRunner';
import { type ContainerDeps, containerCheck, spawnInContainer } from './containerDbQuery';
import type { AgentUseDeps } from './agentUseActions';
import type { DbType, EntityMetadata } from './types';
import { UseActionContext, UseActionResult, launchGuards } from './useActions';

/**
 * The bridged road of a database `query` (the E1.7 spec §S7.6, "the bridged order"; parent §4.11). Pure of `vscode`, so `agentUseActions.ts` hands a bridged call over in one statement
 * and keeps the off-bridge road as it was.
 *
 * <p>In order, and each step ends the call when it refuses: the gate (the pair is served: DR1), the stored connection is read, §S6.15 Z2's refusals (DR2-DR6), `refuseQuery`, the client
 * is on `PATH` (`tool_missing`), the client check (DR7, DR8), the build with the verdict (DR9 when it answers nothing), the exec slot, and the spawn, in a folder that holds nothing,
 * of the file the check asked. No step before the check starts a process, so an entry or a query that is refused spends no spawn, the version spawn included. The entry and its type
 * (step 1) are read by the caller, as on every door.</p>
 */

/** What the bridged road needs of the action's own deps. */
export type BridgedDbQueryDeps = Pick<AgentUseDeps, 'storage' | 'storageDir' | 'signal' | 'acquireExecSlot' | 'note'> & {
  readonly onPath: (exe: string) => boolean;
  readonly profiles?: readonly DbProfileRow[];
  readonly dbClient?: DbClientCheck;
  /** The window's container (S3): present on Windows, where a bridged client runs in a Linux container and never on the host. */
  readonly container?: ContainerDeps;
};

const fail = (code: ErrorCode, message: string): UseActionResult => ({ status: statusForErrorCode(code), body: errorBody(code, message) });

/**
 * A bridged database call that is refused: the generic sentence for the agent, the real one in the journal, in the form `bridgedRefusal` of `sshUseActions.ts` writes it.
 * `not_supported`, as every refusal of this road but DR9 (`internal`).
 */
function refused(deps: Pick<AgentUseDeps, 'note'>, ctx: UseActionContext, sentence: string, code: ErrorCode = 'not_supported'): UseActionResult {
  deps.note(`${ctx.entityName}: ${sentence} (a Remote Bridge was told only that it could not be used)`);
  return fail(code, BRIDGE_USE_REFUSED(ctx.entityName));
}

/**
 * The stored connection of the call, read once for both roads: a value, or the refusal that says why there is none (a sealed value withheld, a damaged wrap, no connection stored).
 * Wrap first, mark second: an agent reaches this entry only while its mark is lost (`automaticOpenerFor`, typed-secrets plan T3).
 */
export async function storedConnectionOf(deps: Pick<AgentUseDeps, 'storage'>, ctx: UseActionContext, entity: EntityMetadata): Promise<string | UseActionResult> {
  const stored = fieldReadingOf(await automaticOpenerFor(deps.storage, ctx.accountId)(entity, await deps.storage.getDbConnection(ctx.accountId, ctx.entityId), 'dbConnection'));
  if (stored.kind === 'value') {
    return stored.value;
  }
  return fail('no_credential', stored.kind === 'withheld' ? stored.reason : `"${ctx.entityName}" has no stored connection string.`);
}

/** Step 2 (§S6.15 Z1, Q18): the pair of this entry's client and this system must be served. Asked before the stored connection is read, so a refused pair touches nothing of the entry. */
function gateRefusal(deps: Pick<AgentUseDeps, 'note'> & { profiles?: readonly DbProfileRow[]; container?: ContainerDeps }, ctx: UseActionContext, dbType: DbType): UseActionResult | undefined {
  const pair = bridgedDbPair(deps.profiles ?? BRIDGED_DB_PROFILES, dbType, deps.container === undefined ? process.platform : 'container');
  return pair.served ? undefined : refused(deps, ctx, pair.sentence);
}

/**
 * Steps 4 and 5: the connection the profile cannot build (a setting outside it, a missing user, password or host, a field outside its shape) is refused with the rule's own sentence in
 * the journal, and then the query `refuseQuery` refuses, with its own sentence for the agent, as today.
 */
function inputRefusal(deps: Pick<AgentUseDeps, 'note'>, ctx: UseActionContext, dbType: DbType, stored: string, query: string): UseActionResult | undefined {
  const connection = bridgedDbConnection(dbType, stored, ctx.entityName);
  if (!connection.ok) {
    return refused(deps, ctx, connection.sentence);
  }
  const refusal = refuseQuery(dbType, query);
  return refusal === undefined ? undefined : fail('not_supported', refusal);
}

/** Step 7: the verdict on the client this call would start, or `undefined` when the window handed the road no check (the builder then answers no launch: DR9). */
async function checked(deps: BridgedDbQueryDeps, ctx: UseActionContext, dbType: DbType): Promise<DbClientVerdict | undefined> {
  const client = profileClientOf(dbType);
  return client === undefined ? undefined : deps.dbClient?.({ client, window: deps.signal, request: ctx.signal });
}

/** Steps 9 and 10: the exec slot, then the file the check asked, started from a folder that holds nothing and is removed in a `finally`, with the slot given back. */
async function spawned(deps: BridgedDbQueryDeps, ctx: UseActionContext, launch: DbQueryLaunch): Promise<UseActionResult> {
  const release = deps.acquireExecSlot();
  if (release === undefined) {
    return fail('too_many_requests', 'Too many commands are already running.');
  }
  try {
    const outcome = await inEmptyFolder(deps, 'query', (dir) =>
      // A bridged client gets the allow-list of `ssh` and its own password variable, and nothing else of the extension host's environment (§4.9 row 5, §4.11).
      runBounded(launch.exe, launch.args, false, { env: bridgedSshEnv(process.env, process.platform, launch.env), cwd: dir, timeoutMs: clampExecTimeout(undefined), ...launchGuards(deps.signal, ctx) }),
    );
    return { status: 200, body: outcome };
  } finally {
    release();
  }
}

/** Step 6: the client is not on `PATH`: `tool_missing`, as today. An absent client is not a client that did not answer. */
function notOnPath(deps: Pick<BridgedDbQueryDeps, 'onPath'>, dbType: DbType): UseActionResult | undefined {
  return resolveDbCli(dbType, deps.onPath) === undefined
    ? fail('tool_missing', `"${clientNameOf(dbType)}" is not on this machine's PATH — install the ${dbType} client, or query it yourself.`)
    : undefined;
}

/** Steps 7 and 8: the check says it is a measured build, and the builder, handed the verdict, writes the launch. */
async function launched(deps: BridgedDbQueryDeps, ctx: UseActionContext, dbType: DbType, stored: string, query: string): Promise<UseActionResult> {
  const verdict = await checked(deps, ctx, dbType);
  if (verdict?.ok === false) {
    return refused(deps, ctx, verdict.sentence);
  }
  // The client is given a connection the builder writes from the entry's own fields (§S6.15 Z2), never the stored string, and is asked for the files it would read under the person's `HOME`
  // at a path in the keys folder that nothing ever writes (E1.6 §S6.14 Y6): a defence inside the profile, and the lock is that no stored setting reaches the client.
  const launch = buildDbQueryLaunch(dbType, stored, query, { bridged: true, absentFile: materializedKeyPath(deps.storageDir, 'no-client-file'), verdict: goodVerdict(verdict) });
  return launch === undefined ? refused(deps, ctx, DR9, 'internal') : spawned(deps, ctx, launch);
}

/** Steps 6 to 8: the client is on `PATH`, then the check and the build; with a container (S3), the image is checked and the client runs there. */
async function afterInput(deps: BridgedDbQueryDeps, ctx: UseActionContext, dbType: DbType, stored: string, query: string): Promise<UseActionResult> {
  if (deps.container !== undefined) {
    return inContainer({ ...deps, container: deps.container }, ctx, dbType, stored, query);
  }
  return notOnPath(deps, dbType) ?? (await launched(deps, ctx, dbType, stored, query));
}

/** The container road (S3): the image's client is asked, the launch is built for its path in the image, and the run goes through the env file. */
async function inContainer(deps: BridgedDbQueryDeps & { container: ContainerDeps }, ctx: UseActionContext, dbType: DbType, stored: string, query: string): Promise<UseActionResult> {
  const verdict = await imageVerdict(deps, ctx, dbType);
  if (verdict?.ok === false) {
    return refused(deps, ctx, verdict.sentence);
  }
  const launch = buildDbQueryLaunch(dbType, stored, query, { bridged: true, absentFile: materializedKeyPath(deps.storageDir, 'no-client-file'), verdict: goodVerdict(verdict) });
  return launch === undefined ? refused(deps, ctx, DR9, 'internal') : spawnInContainer(deps, ctx, launch);
}

/** The image's verdict on this type's client, or `undefined` for a type with no profile client (the builder then answers no launch: DR9). */
async function imageVerdict(deps: BridgedDbQueryDeps & { container: ContainerDeps }, ctx: UseActionContext, dbType: DbType): Promise<DbClientVerdict | undefined> {
  const client = profileClientOf(dbType);
  return client === undefined ? undefined : containerCheck(deps, ctx, client);
}

/** The bridged call, from the gate on (the entry and its type are the caller's). */
export async function runBridgedDbQuery(deps: BridgedDbQueryDeps, ctx: UseActionContext, entity: EntityMetadata, dbType: DbType, body: unknown): Promise<UseActionResult> {
  const gated = gateRefusal(deps, ctx, dbType);
  if (gated !== undefined) {
    return gated;
  }
  const stored = await storedConnectionOf(deps, ctx, entity);
  if (typeof stored !== 'string') {
    return stored;
  }
  const query = String((body as { query: string }).query);
  return inputRefusal(deps, ctx, dbType, stored, query) ?? (await afterInput(deps, ctx, dbType, stored, query));
}
