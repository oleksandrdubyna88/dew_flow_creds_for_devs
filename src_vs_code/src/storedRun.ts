import * as fs from 'node:fs';
import * as path from 'node:path';
import { ErrorCode, clampExecTimeout, errorBody, statusForErrorCode } from './brokerProtocol';
import { lockToOwner, materializedKeyPath } from './materializedKeys';
import type { ScriptRunPlan } from './scriptRun';
import { type MaskEntry, buildMaskTable, maskResponseBody } from './secretMasker';
import { runBounded } from './sshExecRunner';
import { type UseActionContext, type UseActionResult, launchGuards } from './useActions';

/**
 * What an agent's run of a stored command or script shares between this computer's road and a Remote Bridge's (`agentUseActions.ts`,
 * `bridgedRun.ts`): the refusal of an untrusted body, the script file that lives only for its run, and the masking of values only the run knows.
 * Imports no `vscode`.
 */

export function failed(code: ErrorCode, message: string): UseActionResult {
  return { status: statusForErrorCode(code), body: errorBody(code, message) };
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
export function untrusted(entityName: string, what: string): UseActionResult {
  return failed('no_credential', `"${entityName}" has not been run on this machine yet. Run it once from the tree so a person sees ${what}, then retry.`);
}

/** What the script file run needs of its caller: where the file goes, the window's life, the exec slot. */
export interface ScriptFileDeps {
  readonly storageDir: string;
  readonly signal: AbortSignal;
}

/**
 * Writes `body` to an owner-only file named for the entry, runs it with the plan's interpreter and `env`, and removes the file in `finally`.
 * The caller holds the exec slot. Variables and `creds://` values travel in `env`, so the file holds names, never values.
 */
export async function runScriptFile(
  deps: ScriptFileDeps,
  ctx: UseActionContext,
  plan: Extract<ScriptRunPlan, { kind: 'run' }>,
  body: string,
  env: NodeJS.ProcessEnv,
): Promise<UseActionResult> {
  const scriptPath = materializedKeyPath(deps.storageDir, `agent-script-${ctx.entityId}${plan.extension}`);
  try {
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(scriptPath, body.endsWith('\n') ? body : `${body}\n`, { mode: 0o700 });
    lockToOwner(scriptPath);
    const outcome = await runBounded(plan.command, [...plan.args, scriptPath], false, {
      env,
      timeoutMs: clampExecTimeout(undefined),
      ...launchGuards(deps.signal, ctx),
    });
    return { status: 200, body: outcome };
  } finally {
    removeQuietly(scriptPath);
  }
}

function removeQuietly(file: string): void {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // already gone — nothing to do
  }
}

/**
 * The result with every value of `entries` masked out of its body. For values only the run itself knows (a resolved `creds://` reference, the
 * bridge's own SSH entry): the broker masks the grant's own values on the way out as well, so this is a second pass over a body, never the only one.
 * The whole output is masked at once, after the run, so a value the child printed across two writes is masked like any other.
 */
export function maskedWith(result: UseActionResult, entries: readonly MaskEntry[]): UseActionResult {
  return entries.length === 0 ? result : { ...result, body: maskResponseBody(result.body, buildMaskTable(entries)).body };
}
