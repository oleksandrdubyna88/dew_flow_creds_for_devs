import * as vscode from 'vscode';
import { EntityMetadata } from './types';
import { PrepareOptions, PreparedSsh, ReadySsh, RefusedSsh, prepareSshSession, windowOf } from './sshSession';
import { offerTheFix } from './sshConnect';
import { remedyRunner, remoteWindowDeps } from './remoteConnectHost';
import type { SshUseDeps } from './sshUseActions';

/**
 * The ONE host of the SSH roads (E2.S1 of `PLAN_terminal_command_over_ssh.md`, decisions E2-D1, E2-D4 and the lead
 * amendment A1): how a road that types or spawns a line over SSH prepares the session, says a refusal, and owns the
 * prepared session until a terminal takes it over.
 *
 * <p>Every road prepares the same way, so a test hands a road a fake `SshRoad` instead of mocking a module. It is passed
 * only by the PERSON's roads (the arrow, a VPN's Start); an agent's call passes none and keeps E1's refusal (E2-D2).</p>
 */
export interface SshRoad {
  /**
   * `prepareSshSession` for `ssh`, as the person's click would: this window's route, whether the agent serves THIS
   * entry's key, and `isolate: true` so two runs of one entry never share a key or a pin file. `ssh` is the entity
   * exactly as the road read it: the result's `snapshot` is that same object (the one snapshot).
   */
  prepare(accountId: string, ssh: EntityMetadata): Promise<PreparedSsh>;
  /**
   * SSH Connect's own refusal modal, with its remedy button and NO retry: the person runs the entry again (parent §4.3).
   * Nothing is prepared again.
   */
  sayRefused(refused: RefusedSsh, ssh: EntityMetadata): Promise<void>;
}

/** What a road host is built from: the part of `SshUseDeps` that `extension.ts` already assembles. */
export type SshRoadDeps = Pick<SshUseDeps, 'storage' | 'storageDir' | 'relays' | 'servesKeyForEntity'>;

export function sshRoadOf(deps: SshRoadDeps): SshRoad {
  const optionsFor = (ssh: EntityMetadata): PrepareOptions => ({
    storage: deps.storage,
    storageDir: deps.storageDir,
    agentServesKey: deps.servesKeyForEntity?.(ssh) === true,
    remote: deps.relays === undefined ? undefined : remoteWindowDeps(deps.relays, remedyRunner(undefined)),
    isolate: true,
  });
  return {
    prepare: (accountId, ssh) => prepareSshSession(accountId, ssh, optionsFor(ssh)),
    sayRefused: async (refused, ssh) => {
      await offerTheFix(refused, ssh, windowOf(optionsFor(ssh)));
    },
  };
}

/**
 * ONE OWNER (parent §4.4). The road holds `ready` from `prepare` to the hand-over. `use` answers the terminal the line
 * was sent into, or `undefined` when nothing was sent. On `undefined` AND on a throw the session is cleaned here; after a
 * hand-over, that terminal's close cleans it (`cleanWhenClosed`).
 */
export async function ownedSession(ready: ReadySsh, use: () => Promise<vscode.Terminal | undefined>): Promise<boolean> {
  let handedTo: vscode.Terminal | undefined;
  try {
    handedTo = await use();
    return handedTo !== undefined;
  } finally {
    if (handedTo === undefined) {
      ready.cleanup();
    } else {
      cleanWhenClosed(handedTo, ready);
    }
  }
}

/** The session a terminal owns now, and the listener that ends it with the terminal. */
interface Owned {
  readonly ready: Pick<ReadySsh, 'cleanup'>;
  readonly listener: vscode.Disposable;
}

/**
 * ONE session per terminal (lead amendment A1). A terminal is reused only when its last command is known to have
 * finished (`terminalGuard.ts`), so the ssh of the session it holds has ended: handing it a new session first cleans the
 * earlier one and drops its listener. Without this, every run into a reused terminal added a listener and kept its
 * files until the terminal closed.
 */
const owners = new WeakMap<vscode.Terminal, Owned>();

function retire(terminal: vscode.Terminal): void {
  const earlier = owners.get(terminal);
  if (earlier !== undefined) {
    owners.delete(terminal);
    earlier.listener.dispose();
    earlier.ready.cleanup();
  }
}

/** After a hand-over: `cleanup()` when THIS terminal closes (at once if it already has). Disposes its own listener. */
export function cleanWhenClosed(terminal: vscode.Terminal, ready: Pick<ReadySsh, 'cleanup'>): void {
  retire(terminal);
  if (terminal.exitStatus !== undefined) {
    ready.cleanup();
    return;
  }
  const listener = vscode.window.onDidCloseTerminal((closed) => {
    if (closed === terminal) {
      owners.delete(terminal);
      listener.dispose();
      ready.cleanup();
    }
  });
  owners.set(terminal, { ready, listener });
}
