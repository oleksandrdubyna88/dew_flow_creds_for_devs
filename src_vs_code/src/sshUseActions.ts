import { describeError } from './describeError';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import {
  ErrorCode,
  ExecResponseBody,
  TerminalResponseBody,
  clampExecTimeout,
  errorBody,
  statusForErrorCode,
} from './brokerProtocol';
import { StorageManager } from './storageManager';
import { UseAction, UseActionContext, UseActionResult } from './useActions';
import { SshExecAuth, buildSshExecArgv, validateRemoteCommand } from './sshExecCommand';
import { resolveJumpChain } from './sshOptions';
import { materializeKnownHosts } from './hostKeyTrust';
import { runSshExec } from './sshExecRunner';
import { agentForwardEnv, openSshProgram } from './sshProgram';
import { resolveSshCredential } from './sshCredential';
import { askpassEnv } from './sshAskpass';
import { materializePrivateKey, writeAskpassScriptFile } from './keyInstaller';
import { describeSshTarget } from './terminalManager';
import { connectEntity } from './sshConnect';
import { EntityMetadata } from './types';

/**
 * The two things an agent may do with an SSH grant: run a command, or open the
 * interactive terminal for the human. Registered into the use-action registry,
 * which is what a `db` or `vpn` kind will plug into later without the broker
 * learning anything new.
 *
 * <p>The secret never leaves this file's stack frame. A password reaches the
 * spawned `ssh` through its own environment (the askpass mechanism the human
 * Connect path has used since 0.42.0), a stored key through a 0600 file the
 * purge on activate/deactivate already covers — and neither ever appears in
 * anything this module returns. The result types in `brokerProtocol.ts` have
 * no field it could travel in.</p>
 */

export interface SshUseDeps {
  storage: StorageManager;
  storageDir: string;
  /** Aborted on dispose, so no ssh outlives the window that started it. */
  signal: AbortSignal;
  /** Guard against a runaway agent loop; returns a release function. */
  acquireExecSlot(): (() => void) | undefined;
  /** Write one line to the agent audit channel. */
  note(message: string): void;
  /**
   * The agent's socket when one is running, undefined when it is not.
   *
   * <p>A function rather than a value: the agent starts and stops while the window lives, and
   * a snapshot taken at construction would be a stale answer for the rest of the session.</p>
   */
  agentSocket(): string | undefined;
}

/**
 * The program and environment that make `-A` more than a flag, plus one audit line when it
 * cannot be.
 *
 * <p>`-A` in the argv is half of agent forwarding. The other half is that the client can reach
 * the agent — on Windows only the built-in OpenSSH can, ours being a named pipe — and that
 * `SSH_AUTH_SOCK` is in THIS child's environment rather than only in terminals. Both halves were
 * missing until 2026-08-26; `sshProgram.ts` records the measurement.</p>
 */
function agentAwareLaunch(
  deps: SshUseDeps,
  entity: EntityMetadata,
  env: NodeJS.ProcessEnv,
): { program: string; env: NodeJS.ProcessEnv } {
  const wanted = entity.agentForward === true;
  const forwarding = agentForwardEnv(env, wanted, deps.agentSocket());
  if (forwarding.warning !== undefined) {
    deps.note(`ssh:exec — ${forwarding.warning}`);
  }
  return { program: openSshProgram('ssh', wanted, process.platform), env: forwarding.env };
}

function fail(code: ErrorCode, message: string): UseActionResult {
  return { status: statusForErrorCode(code), body: errorBody(code, message) };
}

/** The live entity behind a grant, re-read on every call — never a snapshot. */
function entityFor(deps: SshUseDeps, ctx: UseActionContext): EntityMetadata | undefined {
  return deps.storage.getNode(ctx.accountId, ctx.entityId)?.details;
}

/**
 * Resolve the credential into what `ssh` needs: an optional key path and an
 * environment. The key is materialized per call and deleted in the caller's
 * `finally`; the human terminal path deletes the same file when its terminal
 * closes, so nothing here may assume a cached path still exists.
 */
// eslint-disable-next-line complexity
async function prepareAuth(
  deps: SshUseDeps,
  ctx: UseActionContext,
  entity: EntityMetadata,
): Promise<
  | { ok: true; keyPath?: string; env: NodeJS.ProcessEnv; auth: SshExecAuth; materialized?: string }
  | { ok: false; result: UseActionResult }
> {
  const source = await resolveSshCredential(deps.storage, ctx.accountId, entity);
  if (source.warning !== undefined) {
    // The human Connect path shows this; the agent path used to drop it, which
    // is the one case where an entity authenticates with different key material
    // than its configuration names and nobody is told.
    deps.note(`${ctx.entityName}: ${source.warning}`);
    void vscode.window.showWarningMessage(source.warning);
  }
  if (source.kind === 'none') {
    return {
      ok: false,
      result: fail('no_credential', `"${ctx.entityName}" has no stored password or key any more.`),
    };
  }
  if (source.kind === 'password') {
    const scriptPath = writeAskpassScriptFile(deps.storageDir, process.platform);
    return {
      ok: true,
      auth: 'askpass',
      // spawn REPLACES the environment rather than merging it (unlike
      // createTerminal), so the parent's PATH and HOME must be carried in
      // explicitly — without them ssh is unresolvable and known_hosts is not
      // found.
      env: { ...process.env, ...askpassEnv(scriptPath, source.password, process.platform) },
    };
  }
  if (source.kind === 'keyPath') {
    return { ok: true, keyPath: source.path, env: { ...process.env }, auth: 'key' };
  }
  try {
    // A name of this call's own, not the entity's: the file name decides who
    // may delete it, and a shared one meant the first call to finish pulled the
    // key out from under every other that was still authenticating with it —
    // including a human terminal open on the same entity.
    const keyPath = materializePrivateKey(
      deps.storageDir,
      `${source.keyEntityId}-${crypto.randomUUID()}`,
      source.content,
    );
    return { ok: true, keyPath, env: { ...process.env }, auth: 'key', materialized: keyPath };
  } catch (error) {
    return {
      ok: false,
      result: fail(
        'internal',
        `Could not write the stored key to disk: ${describeError(error)}`,
      ),
    };
  }
}

/**
 * The connection-manager options an agent may use WITHOUT being asked: the jump host this entity
 * is configured to go through, and the host key it is pinned to.
 *
 * <p>Neither is agent input — both come from what a person saved. A FIRST CONTACT is deliberately
 * not negotiated here: nobody is watching, so an unpinned host keeps ssh's `accept-new` and the
 * fingerprint is offered when a human connects. A pinned one is enforced, which is the half that
 * matters for an unattended call.</p>
 */
function connectionArgvOptions(
  deps: SshUseDeps,
  entity: EntityMetadata,
  jump: string | undefined,
): { jump?: string; knownHostsFile?: string } {
  return { jump, knownHostsFile: materializeKnownHosts(deps.storageDir, entity) };
}

// eslint-disable-next-line max-lines-per-function
export function sshExecAction(deps: SshUseDeps): UseAction {
  return {
    kind: 'ssh',
    action: 'exec',
    verb: 'run a command on',
    describeOutcome(result) {
      const body = result.body as ExecResponseBody;
      if (body.timedOut) {
        return 'timed out';
      }
      return `exit ${body.exitCode ?? 'killed'}`;
    },
    validate(body) {
      const command = (body as { command?: unknown }).command;
      const checked = validateRemoteCommand(command);
      return checked.ok ? { ok: true } : { ok: false, message: checked.message };
    },
    summarize(body) {
      return String((body as { command?: unknown }).command ?? '');
    },
    // eslint-disable-next-line complexity
    async run(ctx, body): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      if (entity === undefined) {
        return fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`);
      }
      // Before anything decrypts a key to disk: an entity whose host was
      // cleared after the grant was minted cannot be connected to, and writing
      // key material only to refuse the call left it lying there until the next
      // activate.
      if (!entity.host) {
        return fail('no_credential', `"${ctx.entityName}" has no host configured.`);
      }
      const release = deps.acquireExecSlot();
      if (release === undefined) {
        return fail('too_many_requests', 'Too many SSH commands are already running.');
      }
      const prepared = await prepareAuth(deps, ctx, entity);
      if (!prepared.ok) {
        release();
        return prepared.result;
      }
      try {
        const chain = resolveJumpChain(entity, (id) => deps.storage.getNode(ctx.accountId, id)?.details);
        if (!chain.ok) {
          return fail('no_credential', chain.reason);
        }
        const argv = buildSshExecArgv(
          entity,
          prepared.keyPath,
          String((body as { command: string }).command),
          prepared.auth,
          connectionArgvOptions(deps, entity, chain.value),
        ) as string[]; // the host was checked above
        const launch = agentAwareLaunch(deps, entity, prepared.env);
        const outcome = await runSshExec(argv, {
          program: launch.program,
          env: launch.env,
          timeoutMs: clampExecTimeout((body as { timeoutMs?: unknown }).timeoutMs),
          signal: deps.signal,
        });
        const response: ExecResponseBody = outcome;
        return { status: 200, body: response };
      } catch (error) {
        return fail(
          'internal',
          `Could not run ssh: ${describeError(error)}`,
        );
      } finally {
        if (prepared.materialized !== undefined) {
          fs.rmSync(prepared.materialized, { force: true });
        }
        release();
      }
    },
  };
}

export function sshTerminalAction(deps: SshUseDeps): UseAction {
  return {
    kind: 'ssh',
    action: 'terminal',
    verb: 'open an interactive terminal to',
    describeOutcome: () => 'opened',
    validate: () => ({ ok: true }),
    summarize(_body) {
      return 'open an interactive SSH terminal in VS Code';
    },
    async run(ctx): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      if (entity === undefined) {
        return fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`);
      }
      // The human's own Connect path, verbatim: same terminal name, same
      // askpass env, same key cleanup on close.
      await connectEntity(ctx.accountId, entity, deps.storage, deps.storageDir);
      void vscode.window.showInformationMessage(
        `Claude Code opened an SSH terminal for "${ctx.entityName}"${
          describeSshTarget(entity) === undefined ? '' : ` (${describeSshTarget(entity)})`
        }.`,
      );
      const response: TerminalResponseBody = { opened: true };
      return { status: 200, body: response };
    },
  };
}
