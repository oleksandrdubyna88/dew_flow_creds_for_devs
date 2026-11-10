import * as vscode from 'vscode';
import { EntityMetadata } from './types';
import { buildSshCommand, openSshTerminal } from './terminalManager';
import { requestGone } from './requestLife';
import { composedShellPath } from './pinnedTerminal';
import { forgetMaterializedKey } from './keyInstaller';
import { RefusalReason } from './remoteRoute';
import {
  RefusalAction,
  RefusalContext,
  RemoteRefusal,
  refusalFor,
} from './remoteWindowMessage';
import {
  PrepareOptions,
  ReadySsh,
  RefusedSsh,
  RemoteWindowDeps,
  prepareSshSession,
  windowOf,
  withAcceptNew,
} from './sshSession';

export type { RemoteWindowDeps } from './sshSession';

/**
 * The human Connect path: open an SSH session for an entity in a VS Code
 * terminal. Moved out of `extension.ts` so the agent broker's terminal action
 * can call the exact same code the tree's Connect button runs.
 *
 * <p>Everything before a terminal exists is `prepareSshSession` (`sshSession.ts`); this file keeps the
 * open half and the refusal's modal.</p>
 */
export interface ConnectOptions extends PrepareOptions {
  /**
   * The agent, asked AGAIN — because the remedy has just changed it.
   *
   * <p>The exact counterpart of `RemoteWindowDeps.refresh`, and it was missing for the same reason
   * that one was: the retry rebuilt the window and kept every other field of this record, including
   * a snapshot taken before *Add Key to Agent* ran. So the remedy loaded the key, the retry read
   * `false`, and the refusal came back naming the thing that had just been fixed — the second
   * identical dialog, one layer along from where it was first fixed. Raised by a review.</p>
   *
   * <p>Absent means the snapshot is reused, which is right for a test and wrong for a window.</p>
   */
  readonly refreshAgentServesKey?: () => boolean;
  /**
   * The retry budget, spent by the one recursive call this function makes.
   *
   * <p>A refusal's button runs a remedy and then tries again; the second attempt must NOT offer
   * another retry, or the pair becomes a ride a person can stay on indefinitely. A code round
   * pointed out that the plan claimed "at most once" while nothing enforced it.</p>
   */
  readonly allowRetry?: boolean;
}

/** @returns whether a terminal was actually opened — a remote window can refuse. */
export async function connectEntity(
  accountId: string,
  entity: EntityMetadata,
  connect: ConnectOptions,
): Promise<boolean> {
  const prepared = await prepareSshSession(accountId, entity, connect);
  if (prepared.kind === 'stopped') {
    return false;
  }
  return prepared.kind === 'refused'
    ? offerAfterRefusal(prepared, accountId, entity, connect)
    : openReady(prepared);
}

/** The window refused: the modal is OURS (a road shows its own sentence), and so is the one retry. */
function offerAfterRefusal(
  refused: RefusedSsh,
  accountId: string,
  entity: EntityMetadata,
  connect: ConnectOptions,
): Promise<boolean> {
  // The retry re-READS the window: the remedy it follows exists to change the very state the first
  // attempt refused on.
  const retry =
    refused.retryable && connect.allowRetry !== false
      ? (): Promise<boolean> => retryAfterRemedy(accountId, entity, connect)
      : undefined;
  return refuseAndOfferTheFix(refused.reasons, entity, windowOf(connect), retry, connect.startGate);
}

/** Prepared: the open half. Rows 24-26 of the seam's table — synchronous, so no gate is needed here. */
function openReady(ready: ReadySsh): boolean {
  return ready.env === undefined ? openKeyTerminal(ready) : openPasswordTerminal(ready);
}

/** The key, the agent's answer or no credential: one terminal, with the key wiped when it ends. */
function openKeyTerminal(ready: ReadySsh): boolean {
  const terminal = openSshTerminal(ready.entity, ready.options, ready.platform, ready.prefix);
  const materialized = ready.materializedKeyPath;
  // Wipe the decrypted key from disk as soon as the session ends.
  if (materialized !== undefined) {
    if (terminal === undefined) {
      forgetMaterializedKey(materialized);
    } else {
      const sub = vscode.window.onDidCloseTerminal((closed) => {
        if (closed === terminal) {
          forgetMaterializedKey(materialized);
          sub.dispose();
        }
      });
    }
  }
  return terminal !== undefined;
}

function disposeLiveTerminalNamed(name: string): void {
  vscode.window.terminals.find((t) => t.name === name && t.exitStatus === undefined)?.dispose();
}

/** A password: its own terminal, whose ENVIRONMENT carries it. */
function openPasswordTerminal(ready: ReadySsh): boolean {
  const command = buildSshCommand(ready.entity, ready.platform, ready.options);
  if (command === undefined || ready.target === undefined || ready.env === undefined) {
    // Unreachable: `prepareSshSession` stopped on `no-host` first.
    return false;
  }
  // A FRESH terminal every time: the env carries this entity's password, and reusing
  // one would run the new session with the previous entity's credentials.
  const name = `SSH: ${ready.target}`;
  disposeLiveTerminalNamed(name);
  const passTerminal = vscode.window.createTerminal({
    name,
    // Composed for `platform` — pinned in a local window, as `openSshTerminal` is (issue #103).
    shellPath: composedShellPath(),
    env: ready.env,
  });
  passTerminal.show();
  passTerminal.sendText(withAcceptNew(command, ready.acceptNew), true);
  return true;
}

/**
 * Say what is wrong, name both machines, and offer the one button that fixes the first thing.
 *
 * <p>Modal, because it replaces a command that would otherwise have been typed into a terminal and
 * failed there — a notification in the corner would be read after the person had already gone
 * looking for the missing file, which is exactly the wasted trip this message exists to prevent.</p>
 */
async function refuseAndOfferTheFix(
  reasons: readonly RefusalReason[],
  entity: EntityMetadata,
  remote: RemoteWindowDeps,
  /**
   * What to do after the remedy — or `undefined` when there is to be no retry.
   *
   * <p>`undefined` is how the budget is spent: the retry passes it, so a second refusal offers its
   * button and then stops rather than handing the person a modal they can ride round for ever. The
   * plan claimed "at most once" before a code round pointed out that nothing enforced it.</p>
   */
  retry: (() => Promise<boolean>) | undefined,
  /**
   * The agent request the refused connection was for — REQUIRED, `undefined` for the person's own click,
   * so no call site can forget it (E4.S4). A request already gone is shown no modal at all; one gone while
   * the modal sat open gets no remedy, no copied command and no retry when the person presses the button:
   * a relay started or a key loaded for a request nobody waits for is work nobody asked for.
   */
  startGate: AbortSignal | undefined,
): Promise<boolean> {
  if (requestGone(startGate)) {
    return false;
  }
  const action = await askAndPick(refusalFor(reasons, refusalContext(remote)));
  return action === undefined || requestGone(startGate) ? false : actOnRefusal(action, entity, remote, retry);
}

/** The button the person pressed, for a request that is still there. */
async function actOnRefusal(
  action: RefusalAction,
  entity: EntityMetadata,
  remote: RemoteWindowDeps,
  retry: (() => Promise<boolean>) | undefined,
): Promise<boolean> {
  if (action === 'copyWindowsCommand') {
    await copyTheWindowsCommand(entity, remote.hostPlatform ?? process.platform);
    return false;
  }
  return runRemedyAndRetry(action, remote, retry);
}

/** Show the modal and turn the label the person pressed back into the action it stands for. */
async function askAndPick(refusal: RemoteRefusal): Promise<RefusalAction | undefined> {
  const chosen = await vscode.window.showWarningMessage(
    refusal.message,
    { modal: true },
    ...refusal.buttons.map((button) => button.label),
  );
  return refusal.buttons.find((button) => button.label === chosen)?.action;
}

/**
 * ONE retry, never a loop: the remedy either made the connection possible or it did not, and a
 * second refusal is information rather than a failure to report. The retry itself passes
 * `undefined` for its own retry, which is what spends the budget.
 */
async function runRemedyAndRetry(
  action: RefusalAction,
  remote: RemoteWindowDeps,
  retry: (() => Promise<boolean>) | undefined,
): Promise<boolean> {
  if ((await remote.runRemedy?.(action)) === true && retry !== undefined) {
    return retry();
  }
  return false;
}

/**
 * The second attempt, with BOTH halves of the state read again.
 *
 * <p>A remedy exists to change what the first attempt refused on, so a retry that reuses the
 * snapshot refuses for the reason that was just fixed. The window half was found by a code round;
 * the agent half by a review of that fix, one layer along and for the same reason — everything
 * else in the record was carried over untouched by the spread.</p>
 *
 * <p>`allowRetry: false` is what spends the budget: the second refusal shows its button and stops.</p>
 */
function retryAfterRemedy(
  accountId: string,
  entity: EntityMetadata,
  connect: ConnectOptions,
): Promise<boolean> {
  return connectEntity(accountId, entity, {
    ...connect,
    remote: freshWindow(connect),
    agentServesKey: freshAgent(connect),
    allowRetry: false,
  });
}

function freshWindow(connect: ConnectOptions): RemoteWindowDeps {
  const remote = windowOf(connect);
  return remote.refresh?.() ?? remote;
}

function freshAgent(connect: ConnectOptions): boolean {
  return connect.refreshAgentServesKey?.() ?? connect.agentServesKey === true;
}

/** Which two machines the wording names, read off the window once. */
function refusalContext(remote: RemoteWindowDeps): RefusalContext {
  const side = remote.side;
  return {
    distro: side.kind === 'wsl' ? side.distro : '',
    remoteName: side.kind === 'other' ? side.remoteName : 'wsl',
    hostPlatform: remote.hostPlatform ?? process.platform,
  };
}

/**
 * The line to paste into a terminal on the machine that actually holds the key.
 *
 * <p>It is the BARE connection, and the message says so: the refusal happens before
 * `connectionOptions` has resolved a jump host or pinned a host key, so the copied line carries
 * neither. Pasting a command that silently dropped a bastion or a pin would be worse than one that
 * says it is minimal — a code round asked for the difference to be stated rather than discovered.</p>
 */
async function copyTheWindowsCommand(entity: EntityMetadata, hostPlatform: NodeJS.Platform): Promise<void> {
  const command = buildSshCommand(entity, hostPlatform);
  if (command === undefined) {
    return;
  }
  await vscode.env.clipboard.writeText(command);
  void vscode.window.showInformationMessage(
    `Copied, and it is the bare connection — any jump host or pinned host key this entry uses is ` +
      `NOT in it. Run it in a terminal on this computer: ${command}`,
  );
}
