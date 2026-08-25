import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EnvExportResponseBody,
  ErrorCode,
  ExecResponseBody,
  clampExecTimeout,
  errorBody,
  statusForErrorCode,
} from './brokerProtocol';
import { UseAction, UseActionContext, UseActionResult } from './useActions';
import { StorageManager } from './storageManager';
import { EntityMetadata } from './types';
import { runBounded } from './sshExecRunner';
import { resolveScriptEnv } from './scriptRender';
import { scriptRunPlan } from './scriptRun';
import { buildCommandLine } from './commandLine';
import { isCommandTrusted } from './commandTrust';
import { lockToOwner, materializedKeysDir } from './materializedKeys';
import { buildDbQueryLaunch, isSafePostgresUri, refuseQuery, resolveDbCli } from './dbCliLauncher';

/**
 * The broker's non-SSH capabilities: a stored script, a stored terminal command, and a
 * bare credential.
 *
 * <p>Shaped exactly like `sshUseActions.ts` — validate, summarize, re-read the live
 * entity, act, clean up in `finally` — because a second shape would be a second set of
 * mistakes. What differs per kind is only where the secret goes, and each kind reuses the
 * closest channel that already exists rather than inventing one.</p>
 *
 * <p>Two of the three ignore the request body entirely. That is the load-bearing safety
 * property here and not an oversight: what runs is exactly what a human saved, so no
 * agent-supplied text ever reaches an interpreter or a shell.</p>
 */

export interface AgentUseDeps {
  storage: StorageManager;
  storageDir: string;
  /** Aborted on dispose, so nothing spawned here outlives the window. */
  signal: AbortSignal;
  /** Guard against a runaway agent loop; returns a release function. */
  acquireExecSlot(): (() => void) | undefined;
  note(message: string): void;
  /** This machine's record of which exact bodies a person has vouched for. */
  trustStore: {
    get(key: string): string[] | undefined;
    update(key: string, value: string[]): Thenable<void>;
  };
  /** Writes an entity's bound secrets into the terminal environment; returns the NAMES. */
  applyEnv(details: EntityMetadata, accountId: string): Promise<string[]>;
}

function fail(code: ErrorCode, message: string): UseActionResult {
  return { status: statusForErrorCode(code), body: errorBody(code, message) };
}

/** The live entity behind a grant, re-read on every call — never a snapshot. */
function entityFor(deps: AgentUseDeps, ctx: UseActionContext): EntityMetadata | undefined {
  return deps.storage.getNode(ctx.accountId, ctx.entityId)?.details;
}

function execOutcome(result: UseActionResult): string {
  const body = result.body as ExecResponseBody;
  return body.timedOut === true ? 'timed out' : `exit ${body.exitCode ?? 'killed'}`;
}

/**
 * The message a not-yet-vouched-for body gets.
 *
 * <p>The broker's own consent is per GRANT: once a person clicks Allow, every later call
 * on that token runs silently — including one whose stored content was edited, or
 * replaced by a sync, after the click. The content fingerprint is what notices that, so
 * the agent path checks it too rather than trusting a grant to cover a body it never
 * showed anyone.</p>
 */
function untrusted(entityName: string, what: string): UseActionResult {
  return fail(
    'no_credential',
    `"${entityName}" has not been run on this machine yet. Run it once from the tree so a person sees ${what}, then retry.`,
  );
}

/**
 * Run a stored SCRIPT.
 *
 * <p>Variables travel in the child's environment, so the file written to disk holds names
 * rather than values (see `resolveScriptEnv`), and it is deleted in `finally`.</p>
 */
// eslint-disable-next-line max-lines-per-function
export function scriptRunAction(deps: AgentUseDeps): UseAction {
  return {
    kind: 'script',
    action: 'run',
    verb: 'run the stored script of',
    describeOutcome: execOutcome,
    validate: () => ({ ok: true }),
    summarize: () => 'the stored script, exactly as saved',
    // eslint-disable-next-line complexity
    async run(ctx): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      if (entity === undefined) {
        return fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`);
      }
      if (entity.script === undefined || entity.script.trim().length === 0) {
        return fail('no_credential', `"${ctx.entityName}" has no script body.`);
      }
      if (!isCommandTrusted(deps.trustStore, ctx.entityId, entity.script)) {
        return untrusted(ctx.entityName, 'what it does');
      }
      const language = entity.scriptLanguage ?? 'other';
      const plan = scriptRunPlan(language, process.platform);
      if (plan.kind === 'unsupported') {
        return fail('not_supported', plan.reason);
      }
      const release = deps.acquireExecSlot();
      if (release === undefined) {
        return fail('too_many_requests', 'Too many commands are already running.');
      }
      const resolved = resolveScriptEnv(entity.script, entity.scriptVars, language);
      const scriptPath = path.join(
        materializedKeysDir(deps.storageDir),
        `agent-script-${ctx.entityId}${plan.extension}`,
      );
      try {
        fs.mkdirSync(path.dirname(scriptPath), { recursive: true, mode: 0o700 });
        const body = resolved.body.endsWith('\n') ? resolved.body : `${resolved.body}\n`;
        fs.writeFileSync(scriptPath, body, { mode: 0o700 });
        lockToOwner(scriptPath);
        const outcome = await runBounded(plan.command, [...plan.args, scriptPath], false, {
          env: { ...process.env, ...resolved.env },
          timeoutMs: clampExecTimeout(undefined),
          signal: deps.signal,
        });
        return { status: 200, body: outcome };
      } finally {
        try {
          fs.rmSync(scriptPath, { force: true });
        } catch {
          // already gone — nothing to do
        }
        release();
      }
    },
  };
}

/**
 * Run a stored TERMINAL command.
 *
 * <p>This is the one caller that spawns through a shell, and it is safe for a specific
 * reason rather than by luck: the stored line is human-authored shell syntax — pipes,
 * chained commands — and is byte-for-byte what the human Run button already hands to a
 * shell. Nothing the agent sends contributes to it.</p>
 */
export function terminalRunAction(deps: AgentUseDeps): UseAction {
  return {
    kind: 'terminal',
    action: 'run',
    verb: 'run the stored command of',
    describeOutcome: execOutcome,
    validate: () => ({ ok: true }),
    summarize: () => 'the stored command, exactly as saved',
    // eslint-disable-next-line complexity
    async run(ctx): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      if (entity === undefined) {
        return fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`);
      }
      const line = buildCommandLine(entity.command ?? '', entity.commandArgs);
      if (line.trim().length === 0) {
        return fail('no_credential', `"${ctx.entityName}" has no command.`);
      }
      if (!isCommandTrusted(deps.trustStore, ctx.entityId, line)) {
        return untrusted(ctx.entityName, 'the line');
      }
      const release = deps.acquireExecSlot();
      if (release === undefined) {
        return fail('too_many_requests', 'Too many commands are already running.');
      }
      try {
        const outcome = await runBounded(line, [], true, {
          env: process.env,
          timeoutMs: clampExecTimeout(undefined),
          signal: deps.signal,
        });
        return { status: 200, body: outcome };
      } finally {
        release();
      }
    },
  };
}

/**
 * Export a bare CREDENTIAL into this window's terminal environment.
 *
 * <p>A credential has no host and no process of its own, so there is nothing to run it
 * against. The one way to make it usable without handing it over is the env-binding
 * mechanism the human UI already has; the response carries the variable NAMES.</p>
 *
 * <p>Honest limitation, and it is in the consent text rather than only here: this reaches
 * integrated terminals opened afterwards in THIS window. An agent whose shell lives
 * outside VS Code gets nothing from it.</p>
 */
export function credentialExportEnvAction(deps: AgentUseDeps): UseAction {
  return {
    kind: 'credential',
    action: 'exportEnv',
    verb: 'export the stored secret of',
    describeOutcome(result) {
      const body = result.body as EnvExportResponseBody;
      return `${body.written.length} variable(s)`;
    },
    validate: () => ({ ok: true }),
    summarize: () =>
      'into integrated terminals opened after this, in this VS Code window only — a shell outside VS Code is unaffected',
    async run(ctx): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      if (entity === undefined) {
        return fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`);
      }
      if (Object.keys(entity.envBindings ?? {}).length === 0) {
        return fail(
          'no_credential',
          `"${ctx.entityName}" exports no environment variable. Open Edit and switch one on first.`,
        );
      }
      const written = await deps.applyEnv(entity, ctx.accountId);
      const body: EnvExportResponseBody = { written };
      return { status: 200, body };
    },
  };
}

/**
 * Query a DATABASE.
 *
 * <p>The one non-SSH kind where the agent's own text reaches a process — so it reaches it
 * as a single argv element to a CLI, never through a shell, and the password rides an
 * environment variable that tool's own documentation names. `mongodb` is refused: see
 * `buildDbQueryLaunch` for why a JavaScript shell cannot be handed an agent's query and a
 * password at the same time.</p>
 */
// eslint-disable-next-line max-lines-per-function
export function dbQueryAction(
  deps: AgentUseDeps & { onPath: (exe: string) => boolean },
): UseAction {
  return {
    kind: 'db',
    action: 'query',
    verb: 'run a query against',
    describeOutcome: execOutcome,
    validate(body) {
      const query = (body as { query?: unknown }).query;
      if (typeof query !== 'string' || query.trim().length === 0) {
        return { ok: false, message: 'A non-empty "query" string is required.' };
      }
      if (query.length > 8000) {
        return { ok: false, message: 'That query is too long (8000 characters maximum).' };
      }
      return { ok: true };
    },
    summarize(body) {
      return String((body as { query?: unknown }).query ?? '');
    },
    // eslint-disable-next-line complexity, max-lines-per-function
    async run(ctx, body): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      if (entity === undefined) {
        return fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`);
      }
      const dbType = entity.dbType;
      if (dbType === undefined) {
        return fail('no_credential', `"${ctx.entityName}" has no database type set.`);
      }
      const connection = await deps.storage.getDbConnection(ctx.accountId, ctx.entityId);
      if (connection === undefined || connection.length === 0) {
        return fail('no_credential', `"${ctx.entityName}" has no stored connection string.`);
      }
      if (dbType === 'postgres' && !isSafePostgresUri(connection)) {
        return fail(
          'not_supported',
          `"${ctx.entityName}" has a stored connection string that is not a plain ` +
            'postgres:// URL. The broker refuses it rather than hand psql a value that ' +
            'could carry command-line options. Fix the entry to a ' +
            'postgresql://user:pass@host:port/db URL, or query it yourself.',
        );
      }
      const query = String((body as { query: string }).query);
      // Client meta-commands (`\!`, `system`, `:!!`) are a shell escape, and that shell
      // inherits the password. Said back to the agent as the reason, so it learns the rule
      // instead of retrying variants.
      const refusal = refuseQuery(dbType, query);
      if (refusal !== undefined) {
        return fail('not_supported', refusal);
      }
      const launch = buildDbQueryLaunch(dbType, connection, query);
      if (launch === undefined) {
        return fail(
          'not_supported',
          `A ${dbType} connection cannot be queried through the broker. Its shell would be able to read the password back out of the environment it is given, which is exactly what this path exists to prevent.`,
        );
      }
      if (resolveDbCli(dbType, deps.onPath) === undefined) {
        return fail(
          'tool_missing',
          `"${launch.exe}" is not on this machine's PATH — install the ${dbType} client, or query it yourself.`,
        );
      }
      const release = deps.acquireExecSlot();
      if (release === undefined) {
        return fail('too_many_requests', 'Too many commands are already running.');
      }
      try {
        const outcome = await runBounded(launch.exe, launch.args, false, {
          env: { ...process.env, ...launch.env },
          timeoutMs: clampExecTimeout(undefined),
          signal: deps.signal,
        });
        return { status: 200, body: outcome };
      } finally {
        release();
      }
    },
  };
}

/**
 * Bring a VPN tunnel up or down.
 *
 * <p>Not an exec action, deliberately. Both tools create a network interface and need
 * root or Administrator; a captured background child cannot answer the UAC dialog or the
 * sudo prompt that requires, and faking that would mean a privileged helper service.
 * So this opens the same terminal the human Start button opens — the elevation prompt
 * stays theirs to answer — and the agent learns only that it was opened.</p>
 */
export function vpnAction(
  deps: AgentUseDeps & {
    open: (accountId: string, entityId: string, action: 'start' | 'stop') => Promise<boolean>;
  },
  action: 'up' | 'down',
): UseAction {
  return {
    kind: 'vpn',
    action,
    verb: action === 'up' ? 'start the VPN tunnel of' : 'stop the VPN tunnel of',
    describeOutcome(result) {
      return (result.body as { opened?: boolean }).opened === true ? 'opened' : 'refused';
    },
    validate: () => ({ ok: true }),
    summarize: () =>
      'a terminal opens and the operating system asks for administrator rights — a human answers that prompt',
    async run(ctx): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      if (entity === undefined) {
        return fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`);
      }
      const opened = await deps.open(ctx.accountId, ctx.entityId, action === 'up' ? 'start' : 'stop');
      return opened
        ? { status: 200, body: { opened: true } }
        : fail('no_credential', `"${ctx.entityName}" could not be started — see the notification.`);
    },
  };
}
