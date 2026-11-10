import { describeError } from './describeError';
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
import { CallTarget, UseAction, UseActionContext, UseActionResult, launchGuards } from './useActions';
import { SshExecAuth, buildSshExecArgv, validateRemoteCommand } from './sshExecCommand';
import { resolveJumpChain } from './sshOptions';
import { materializeKnownHosts } from './hostKeyTrust';
import { runSshExec } from './sshExecRunner';
import { notStarted } from './requestLife';
import { sshSpawnLaunch } from './sshProgram';
import { resolveExecAuth } from './sshExecAuth';
import { describeSshTarget } from './terminalManager';
import { RemoteWindowDeps, connectEntity } from './sshConnect';
import { remedyRunner, remoteWindowDeps } from './remoteConnectHost';
import { WslRelayManager } from './wslRelayManager';
import { EntityMetadata } from './types';
import { AGENT_FORWARD_REFUSED, BRIDGE_USE_REFUSED } from './bridgeScope';

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
  /**
   * The WSL relays this window is running, for the remote-window decision.
   *
   * <p>Optional so the broker's own tests need not build one. Absent means the connect path treats
   * the window as local, which is exactly what it did before this existed.</p>
   */
  relays?: WslRelayManager;
  /**
   * Whether the agent already serves this entity's key.
   *
   * <p>This action used to call `connectEntity` with the default `false`, which was invisible while
   * the only consequence was materialising a key that the agent could have served. In a WSL window
   * it is not invisible: the route refuses as `agent-has-no-key` while the agent is serving it.</p>
   */
  servesKeyForEntity?(entity: EntityMetadata): boolean;
  /**
   * E1.6's writer of the per-call ssh_config a bridged `ssh` runs under (parent §4.9). ABSENT on the partial-E1 tree, and that absence is the
   * lock between partial E1 and E2 (`unguardedBridge`): a bridged call is refused before any slot, key or spawn. The parameter is E1.6's to
   * widen (the legs and their keys go in); the result is §4.9's decided shape — `cwd`, a fresh folder per call that holds the file and nothing
   * else, and `configFile`, the relative name `c.conf`. Nothing on this tree calls it: the argv carries no `-F` until E1.6 writes the file.
   */
  bridgedSshConfig?: BridgedSshConfigWriter;
}

export type BridgedSshConfigWriter = (call: { readonly callId: string }) => { readonly cwd: string; readonly configFile: string };
/** The journal's reason while the writer is absent; the agent reads `BRIDGE_USE_REFUSED` and not this. */
export const NO_BRIDGED_SSH_CONFIG = 'no per-call ssh_config yet: E1.6';

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
  // `sshSpawnLaunch` (shared with Run with Secrets over SSH, E3.S1): `openSshBinary`, not `openSshProgram`, because this string is
  // SPAWNED with `shell: false`, and on Windows a relative name is resolved by `CreateProcess`, which searches the current directory
  // before `PATH`. The viewer's copyable bare word belongs to the other function.
  const launch = sshSpawnLaunch(entity, deps.agentSocket(), process.platform);
  if (launch.warning !== undefined) {
    deps.note(`ssh:exec — ${launch.warning}`);
  }
  return { program: launch.program, env: { ...env, ...launch.env } };
}

function fail(code: ErrorCode, message: string): UseActionResult {
  return { status: statusForErrorCode(code), body: errorBody(code, message) };
}

/**
 * A refusal as the agent reads it: the sentence as it always was off a bridge; on a bridge the generic sentence, the real one in the
 * journal. The code is kept.
 *
 * <p>The sentences that go through here name the entry a linked key or a jump host is (`sshExecAuth.ts`, `sshOptions.ts`), or carry a
 * path or an argv (`Could not write the stored key`, `Could not run ssh`). The key and the chain are part of USING the entry, so an
 * agent on a bridge is served through them — but it is not told what they are. Those two files do not know which door asked, so the
 * door is handled here, where every such sentence passes.</p>
 */
function bridgedRefusal(deps: SshUseDeps, ctx: UseActionContext): (code: ErrorCode, message: string) => UseActionResult {
  return (code, message) => {
    if (ctx.bridge === undefined) {
      return fail(code, message);
    }
    deps.note(`${ctx.entityName}: ${message} (a Remote Bridge was told only that it could not be used)`);
    return fail(code, BRIDGE_USE_REFUSED(ctx.entityName));
  };
}

/**
 * Why this entry cannot be connected to at all, decided before anything decrypts a key to disk: an entity whose host was
 * cleared after the grant was minted cannot be connected to, and writing key material only to refuse the call left it
 * lying there until the next activate. And on a bridge, an entry that forwards the shared agent (the laptop's whole identity:
 * the wall says so first, and this is the live entity's word).
 */
function unusableEntity(ctx: UseActionContext, entity: EntityMetadata): UseActionResult | undefined {
  if (!entity.host) {
    return fail('no_credential', `"${ctx.entityName}" has no host configured.`);
  }
  return ctx.bridge !== undefined && entity.agentForward === true ? fail('denied', AGENT_FORWARD_REFUSED(ctx.entityName)) : undefined;
}

/** The live entity behind a grant, re-read on every call — never a snapshot. */
function entityFor(deps: SshUseDeps, ctx: CallTarget): EntityMetadata | undefined {
  return deps.storage.getNode(ctx.accountId, ctx.entityId)?.details;
}

/**
 * Resolve the credential into what `ssh` needs, and map a failure onto a broker error code.
 *
 * <p>The resolution itself lives in `sshExecAuth.ts`, shared with the `ssh -R` bridge, which
 * used to carry its own one-kind copy of it. What stays here is the part that is specific to
 * an agent call: showing the warning and turning a refusal into a `UseActionResult`.</p>
 */
async function prepareAuth(
  deps: SshUseDeps,
  ctx: UseActionContext,
  entity: EntityMetadata,
  refuse: (code: ErrorCode, message: string) => UseActionResult,
): Promise<
  | { ok: true; keyPath?: string; env: NodeJS.ProcessEnv; auth: SshExecAuth; materialized?: string }
  | { ok: false; result: UseActionResult }
> {
  const resolved = await resolveExecAuth(deps.storage, ctx.accountId, entity, deps.storageDir);
  if (resolved.warning !== undefined) {
    // The human Connect path shows this; the agent path used to drop it, which is the one case
    // where an entity authenticates with different key material than its configuration names
    // and nobody is told.
    deps.note(`${ctx.entityName}: ${resolved.warning}`);
    void vscode.window.showWarningMessage(resolved.warning);
  }
  if (!resolved.ok) {
    const code: ErrorCode = resolved.reason === 'no_credential' ? 'no_credential' : 'internal';
    return { ok: false, result: refuse(code, resolved.message) };
  }
  const { keyPath, env, auth, materialized } = resolved;
  return { ok: true, keyPath, env, auth, materialized };
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
  bridged: boolean,
): { jump?: string; knownHostsFile?: string; bridged: boolean } {
  return { jump, knownHostsFile: materializeKnownHosts(deps.storageDir, entity), bridged };
}

/**
 * Delete the key file this call materialised, and never throw: `force` swallows ENOENT only, and a lock on the file (Windows,
 * while `ssh.exe` is still letting go of it) must cost neither the exec slot nor the finished result (Amendment 3, C.6). The note
 * names the failure, not the key; what stays on disk is the person's own file, in a folder only they can read.
 */
function removeKeyFile(deps: SshUseDeps, file: string | undefined): void {
  try {
    if (file !== undefined) {
      fs.rmSync(file, { force: true });
    }
  } catch (error) {
    try {
      deps.note(`ssh:exec — the key file could not be removed: ${describeError(error)}`);
    } catch {
      /* a journal that will not take the line costs neither the slot nor the result (Amendment 6, D.6) */
    }
  }
}

// eslint-disable-next-line max-lines-per-function
export function sshExecAction(deps: SshUseDeps): UseAction {
  return {
    kind: 'ssh',
    action: 'exec',
    mutatesSecrets: false,
    // The signing prompt of a forwarded agent arrives through the socket, by no static path: only an entry that forwards it, while it is up.
    asksAfterConsent: (target) => entityFor(deps, target)?.agentForward === true && deps.agentSocket() !== undefined,
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
      const refuse = bridgedRefusal(deps, ctx);
      const unusable = unusableEntity(ctx, entity) ?? unguardedBridge(deps, ctx, refuse);
      if (unusable !== undefined) {
        return unusable;
      }
      const release = deps.acquireExecSlot();
      if (release === undefined) {
        return fail('too_many_requests', 'Too many SSH commands are already running.');
      }
      const prepared = await prepareAuth(deps, ctx, entity, refuse).catch((error: unknown) => { release(); throw error; });
      if (!prepared.ok) {
        release();
        return prepared.result;
      }
      try {
        const chain = resolveJumpChain(entity, (id) => deps.storage.getNode(ctx.accountId, id)?.details);
        if (!chain.ok) {
          return refuse('no_credential', chain.reason);
        }
        const argv = buildSshExecArgv(
          entity,
          prepared.keyPath,
          String((body as { command: string }).command),
          prepared.auth,
          connectionArgvOptions(deps, entity, chain.value, ctx.bridge !== undefined),
        ) as string[]; // the host was checked above
        const launch = agentAwareLaunch(deps, entity, prepared.env);
        const outcome = await runSshExec(argv, {
          program: launch.program,
          env: launch.env,
          timeoutMs: clampExecTimeout((body as { timeoutMs?: unknown }).timeoutMs),
          ...launchGuards(deps.signal, ctx),
        });
        const response: ExecResponseBody = outcome;
        return { status: 200, body: response };
      } catch (error) {
        return refuse('internal', `Could not run ssh: ${describeError(error)}`);
      } finally {
        removeKeyFile(deps, prepared.materialized);
        release();
      }
    },
  };
}

export function sshTerminalAction(deps: SshUseDeps): UseAction {
  return {
    kind: 'ssh',
    action: 'terminal',
    mutatesSecrets: false,
    asksAfterConsent: true,
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
      // The human's own Connect path, verbatim: same terminal name, same askpass env, same key
      // cleanup on close — and, since this window may be attached to WSL, the same remote-window
      // decision and the same answer about whether the agent already holds the key.
      const opened = await connectEntity(ctx.accountId, entity, {
        storage: deps.storage,
        storageDir: deps.storageDir,
        agentServesKey: deps.servesKeyForEntity?.(entity) === true,
        refreshAgentServesKey: (): boolean => deps.servesKeyForEntity?.(entity) === true,
        remote: brokerWindow(deps),
        // The request's end refuses the OPEN; a terminal already open belongs to the person and stays.
        startGate: ctx.signal,
      });
      // It used to report `opened: true` whatever happened, which was harmless while the only
      // failure was an entity with no host — and is not, now that a remote window can REFUSE. An
      // agent told a terminal is open waits at one that is not there.
      if (!opened) {
        return notOpened(ctx);
      }
      void vscode.window.showInformationMessage(openedMessage(ctx.entityName, entity));
      const response: TerminalResponseBody = { opened: true };
      return { status: 200, body: response };
    },
  };
}

/**
 * No terminal opened. For a request whose client has gone that is its start gate refusing, and it is that
 * request's abandonment — thrown, so the broker journals `ABANDONED` and answers nobody (E4.S3) — not an
 * internal failure written to a socket nobody reads. For a live request the window said why.
 */
function notOpened(ctx: UseActionContext): UseActionResult {
  if (ctx.signal.aborted) {
    throw notStarted();
  }
  return fail('internal', `Could not open an SSH terminal for "${ctx.entityName}" — the window said why.`);
}

/** The target named where it can be — an entity with no host still opened something. */
function openedMessage(entityName: string, entity: EntityMetadata): string {
  const target = describeSshTarget(entity);
  return `Claude Code opened an SSH terminal for "${entityName}"${target === undefined ? '' : ` (${target})`}.`;
}

/** A bridged call with no writer of the per-call file is refused before any slot, key or spawn: the generic sentence to the agent, this reason in the journal. Off a bridge, nothing. */
function unguardedBridge(deps: SshUseDeps, ctx: UseActionContext, refuse: (code: ErrorCode, message: string) => UseActionResult): UseActionResult | undefined {
  return ctx.bridge !== undefined && deps.bridgedSshConfig === undefined ? refuse('denied', NO_BRIDGED_SSH_CONFIG) : undefined;
}

/**
 * What the broker knows about this window — or `undefined` where it was given no relay manager,
 * which is every test and every caller predating remote windows.
 *
 * <p>`remedyRunner(undefined)`: the broker has an entity and no tree row, so a refusal's *Add Key to
 * Agent* button says so plainly rather than opening a picker nobody asked for.</p>
 */
function brokerWindow(deps: SshUseDeps): RemoteWindowDeps | undefined {
  return deps.relays === undefined ? undefined : remoteWindowDeps(deps.relays, remedyRunner(undefined));
}

// `extension.ts` is under the size ratchet, so it imports the road host from the module that already assembles the SSH deps (E2-D9).
export { sshRoadOf } from './sshRoad';

/**
 * Everything the two SSH actions need, assembled in one place instead of in `activate()`.
 *
 * <p>Extracted when the remote-window fix gave this record two more fields: `extension.ts` is
 * under a size ratchet that only moves DOWN, which is its whole point — the file is being
 * dismantled (audit A1), and growing it to wire a feature is exactly the move the ratchet exists to
 * refuse. The literal moved here whole, beside the type it satisfies.</p>
 */
export function sshDepsFor(parts: {
  storage: StorageManager;
  storageDir: string;
  agentServer: { signal: AbortSignal; acquireExecSlot(): (() => void) | undefined; note(message: string): void };
  sshAgent: { socketPath: string | undefined; servesKeyForEntity(entity: EntityMetadata): boolean };
  relays: WslRelayManager;
}): SshUseDeps {
  return {
    storage: parts.storage,
    storageDir: parts.storageDir,
    signal: parts.agentServer.signal,
    acquireExecSlot: parts.agentServer.acquireExecSlot,
    note: parts.agentServer.note,
    // What makes `-A` real rather than decorative: the child needs SSH_AUTH_SOCK in its own
    // environment, and the window's collection reaches terminals only. See `sshProgram.ts`.
    agentSocket: (): string | undefined => parts.sshAgent.socketPath,
    // The broker's "open a terminal" action reaches the SAME connect path as the tree's button, so
    // it needs the same two facts: which window this is, and whether the agent already holds this
    // key. Without the second it would ask for a route that always refuses as `agent-has-no-key`.
    relays: parts.relays,
    servesKeyForEntity: (entity): boolean => parts.sshAgent.servesKeyForEntity(entity),
  };
}
