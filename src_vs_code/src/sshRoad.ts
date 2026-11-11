import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { EntityMetadata } from './types';
import { PrepareOptions, PreparedSsh, ReadySsh, RefusedSsh, prepareSshSession, windowOf } from './sshSession';
import { offerTheFix } from './sshConnect';
import { remedyRunner, remoteWindowDeps } from './remoteConnectHost';
import { sshReaderShell } from './pinnedTerminal';
import { AGENT_SOCKET_ENV, E3_INHERITED_DROP, type EnvDrop, NO_SSH_TO_SPAWN, spawnableSshProgram, sshSpawnLaunch } from './sshProgram';
import { NodeLookup, RemotePlan, SshLink, TypedLine, sshLinkOf, trustLineFor, typedLine } from './remoteLaunch';
import { sendGuarded } from './terminalGuard';
import type { EntryTerminalKey } from './terminalTitles';
import type { SshUseDeps } from './sshUseActions';

/**
 * The ONE host of the SSH roads (E2.S1 of `PLAN_terminal_command_over_ssh.md`, decisions E2-D1, E2-D4 and the lead
 * amendment A1): how a road that types or spawns a line over SSH prepares the session, says a refusal, and owns the
 * prepared session until a terminal takes it over (`ownedSessions`), and re-checks a prepared snapshot against the line the
 * person was shown (`recheckedLine`, `linkedNow`). The folder run, the chain, the arrow and a VPN's launcher all use these.
 *
 * <p>Every road prepares the same way, so a test hands a road a fake `SshRoad` instead of mocking a module. It is passed
 * only by the PERSON's roads (the arrow, a VPN's Start); an agent's call passes none and keeps E1's refusal (E2-D2).</p>
 */
export interface SshRoad {
  /**
   * `prepareSshSession` for `ssh`, as the person's click would: this window's route, whether the agent serves THIS
   * entry's key, and `isolate: true` so two runs of one entry never share a key or a pin file. `ssh` is the entity
   * exactly as the road read it: the result's `snapshot` is that same object (the one snapshot).
   *
   * <p>`use` is `'terminal'` (the default: the session's line is typed into a terminal, which reaches the extension's agent through
   * the window's environment collection) or `'spawn'` (E3-D4: Run with Secrets spawns the `ssh` itself, and a child of the extension
   * host does not reach that agent). For `'spawn'` the agent never serves the key: a stored key is always written to its isolated
   * file and `-i` names it. The spawned ssh's environment is the one sentence of `spawnLaunch`, so the host process's own
   * `SSH_AUTH_SOCK` is not handed on (the hazard `sshSession.ts` refuses on the relay route).</p>
   */
  prepare(accountId: string, ssh: EntityMetadata, use?: 'terminal' | 'spawn'): Promise<PreparedSsh>;
  /**
   * The program, folder and environment of the `ssh` that Run with Secrets spawns for `ssh` — the SNAPSHOT of a prepared session
   * (E3-D5). `env` is the askpass environment of a password session. The program is `sshSpawnLaunch`'s, made absolute on Windows
   * (`spawnableSshProgram`, CWE-426); the folder is the extension's own `storageDir`, never the workspace. The environment (E3-D8,
   * parent D17 (a)): the run ADDS only `env` — the askpass variables and, when the extension's agent serves the run (`ownAgent`: the
   * entry forwards and the socket is up), its `SSH_AUTH_SOCK` — and no resolved value; it REMOVES what `withoutEnv` names (always
   * `E3_INHERITED_DROP`: the host's `SSH_AUTH_SOCK` and every `CREDS_REF_` name); other ordinary variables (`PATH`, `HOME`, …) are
   * inherited as by every spawned program. `warning` is for the banner (E3-D12), not a toast. `refused` when no ssh client can be
   * started: nothing was read and nobody was asked.
   */
  spawnLaunch(ssh: EntityMetadata, env: Readonly<Record<string, string>> | undefined): SpawnLaunch;
  /**
   * SSH Connect's own refusal modal, with its remedy button and NO retry: the person runs the entry again (parent §4.3).
   * Nothing is prepared again.
   */
  sayRefused(refused: RefusedSsh, ssh: EntityMetadata): Promise<void>;
}

/** What `SshRoad.spawnLaunch` answers. */
export type SpawnLaunch =
  | { kind: 'spawn'; program: string; cwd: string; env: Record<string, string>; warning?: string; ownAgent: boolean; withoutEnv: EnvDrop }
  | { kind: 'refused'; reason: string };

/** What a road host is built from: the part of `SshUseDeps` that `extension.ts` already assembles. */
export type SshRoadDeps = Pick<SshUseDeps, 'storage' | 'storageDir' | 'relays' | 'servesKeyForEntity'> & Partial<Pick<SshUseDeps, 'agentSocket'>>;

export function sshRoadOf(deps: SshRoadDeps): SshRoad {
  const optionsFor = (ssh: EntityMetadata, use: 'terminal' | 'spawn'): PrepareOptions => ({
    storage: deps.storage,
    storageDir: deps.storageDir,
    agentServesKey: use === 'spawn' ? false : deps.servesKeyForEntity?.(ssh) === true,
    remote: deps.relays === undefined ? undefined : remoteWindowDeps(deps.relays, remedyRunner(undefined)),
    isolate: true,
  });
  return {
    prepare: (accountId, ssh, use = 'terminal') => prepareSshSession(accountId, ssh, optionsFor(ssh, use)),
    sayRefused: async (refused, ssh) => {
      await offerTheFix(refused, ssh, windowOf(optionsFor(ssh, 'terminal')));
    },
    spawnLaunch: (ssh, env) => spawnLaunchOf(deps, ssh, env),
  };
}

function spawnLaunchOf(deps: SshRoadDeps, ssh: EntityMetadata, env: Readonly<Record<string, string>> | undefined): SpawnLaunch {
  const base = sshSpawnLaunch(ssh, deps.agentSocket?.(), process.platform);
  const program = spawnableSshProgram(base.program, process.platform, process.env.PATH, fs.existsSync);
  if (program === undefined) {
    return { kind: 'refused', reason: NO_SSH_TO_SPAWN };
  }
  const ownAgent = AGENT_SOCKET_ENV in base.env;
  const launch = { kind: 'spawn' as const, program, cwd: deps.storageDir, env: { ...base.env, ...env } as Record<string, string>, ownAgent, withoutEnv: E3_INHERITED_DROP };
  return base.warning === undefined ? launch : { ...launch, warning: base.warning };
}

/**
 * ONE OWNER (parent §4.4) of the sessions a run prepared, for every road that prepares: the arrow and the launcher
 * (`runOverSsh`), the folder run and the chain. A run makes it BEFORE its first `prepare`, `own`s each session the moment
 * `prepare` answers it, and `cleanAll`s in its `finally`: a refusal, a stop, a throw in a later preparation, a closed
 * terminal. A session `handOver`ed to a terminal leaves the list; that terminal's close cleans it. `cleanup()` is idempotent,
 * so a road may also clean one session earlier (a step that ended) and leave it in the list. A session `handOverToRun`ed to a spawned
 * run stays on the list until the run exists, and the list and the run share its one once-only end; a throw while the run is being
 * made is cleaned by `cleanAll`, once.
 */
export interface OwnedSessions {
  own(ready: ReadySsh): void;
  /** `earlierEnded`: the send reused a terminal after a `finished` verdict (`GuardedSend`), so what it held before has ended. */
  handOver(ready: ReadySsh, terminal: vscode.Terminal, earlierEnded?: boolean): void;
  /**
   * The hand-over of a session to a SPAWNED run (Run with Secrets over SSH, E3-D7), in three steps: (1) take the session's
   * once-only end (it is put on the list first when it is not on it); (2) `start(ended)` makes the run, whose end is that same
   * once-only end; (3) only when `start` returned, take the session off the list. A throw from step 1 or 2 leaves it ON the list, so
   * the owner's `cleanAll` is the ONE path that cleans it, once, before and after a run's end alike; after step 3 only the run
   * cleans it. The road calls it inside its `try … finally`, with no `await` in it.
   */
  handOverToRun(ready: ReadySsh, start: (ended: () => void) => void): void;
  cleanAll(): void;
}

export function ownedSessions(): OwnedSessions {
  const owned = new Map<ReadySsh, () => void>();
  const endOf = (ready: ReadySsh): (() => void) => {
    const kept = owned.get(ready);
    if (kept !== undefined) {
      return kept;
    }
    const end = once(() => ready.cleanup());
    owned.set(ready, end);
    return end;
  };
  return {
    own: (ready) => void endOf(ready),
    handOver: (ready, terminal, earlierEnded = false) => {
      owned.delete(ready);
      cleanWhenClosed(terminal, ready, earlierEnded);
    },
    handOverToRun: (ready, start) => {
      start(endOf(ready));
      owned.delete(ready);
    },
    cleanAll: () => {
      [...owned.values()].forEach((end) => end());
      owned.clear();
    },
  };
}

/** `work` the first time, nothing after: so a second call does nothing even when a future `cleanup()` is not idempotent. */
function once(work: () => void): () => void {
  let done = false;
  return () => {
    if (!done) {
      done = true;
      work();
    }
  };
}

/** What a terminal holds: every session whose line was typed into it and may still be running, and the one listener that ends them. */
interface Held {
  readonly sessions: Pick<ReadySsh, 'cleanup'>[];
  readonly listener: vscode.Disposable;
}

/**
 * The sessions each terminal holds. A terminal is reused after a `finished` verdict (`terminalGuard.ts`) — the ssh of the
 * session it held has ended, so that session is cleaned at the hand-over (lead amendment A1: one listener, no files kept
 * until the terminal closes). After "Type It Anyway" into a busy or unknown terminal the earlier ssh may STILL be running and
 * reading its key and pin files: the terminal then keeps BOTH sessions, under the one listener, and its close cleans all.
 */
const holders = new WeakMap<vscode.Terminal, Held>();

function endAll(terminal: vscode.Terminal, held: Held): void {
  holders.delete(terminal);
  held.listener.dispose();
  held.sessions.forEach((session) => session.cleanup());
}

/** After a hand-over: `cleanup()` when THIS terminal closes (at once if it already has). */
function cleanWhenClosed(terminal: vscode.Terminal, ready: Pick<ReadySsh, 'cleanup'>, earlierEnded: boolean): void {
  const closed = terminal.exitStatus !== undefined;
  endHeldIf(terminal, earlierEnded || closed);
  if (closed) {
    ready.cleanup();
    return;
  }
  hold(terminal, ready);
}

/** What the terminal held before ends now, when its last command had finished or it has closed. */
function endHeldIf(terminal: vscode.Terminal, ended: boolean): void {
  const earlier = holders.get(terminal);
  if (earlier !== undefined && ended) {
    endAll(terminal, earlier);
  }
}

/** The terminal holds `ready` too, under its one listener (made here when it holds nothing yet). */
function hold(terminal: vscode.Terminal, ready: Pick<ReadySsh, 'cleanup'>): void {
  const kept = holders.get(terminal);
  if (kept !== undefined) {
    kept.sessions.push(ready);
    return;
  }
  const sessions = [ready];
  const listener = vscode.window.onDidCloseTerminal((gone) => {
    if (gone === terminal) {
      endAll(terminal, { sessions, listener });
    }
  });
  holders.set(terminal, { sessions, listener });
}

/**
 * The prepared snapshot against what the person was SHOWN: the trust line rebuilt from it must equal `shownLine` (else
 * `changedReason`: the entry changed while the dialog was open), then `passwordReason` when the session carries a password
 * environment and the road cannot give it a terminal of its own (the chain), then the typed line, which can refuse too
 * (PowerShell 5.1). Reads the snapshot only (one snapshot). The folder run and the chain both call it.
 */
export function recheckedLine(remote: RemotePlan, ready: ReadySsh, shownLine: string, changedReason: string, passwordReason?: string): TypedLine {
  if (trustLineFor(ready.entity, ready.jump, remote.line) !== shownLine) {
    return { kind: 'refused', reason: changedReason };
  }
  if (passwordReason !== undefined && ready.env !== undefined) {
    return { kind: 'refused', reason: passwordReason };
  }
  return typedLine(remote, ready, sshReaderShell());
}

export type LinkedNow = Extract<SshLink, { kind: 'linked' }>;

/**
 * A Terminal entry's link read AGAIN after the person's approval (the entry or the SSH entry may have changed while the
 * dialog was open), the same way on every road that prepares: the entry is re-read from storage by the caller (`liveDetails`:
 * gone or in the Trash is `undefined`) and its link is read against the vault as it is now. The link, or the sentence why it
 * cannot be used: the link's own refusal, else `changedReason` (the entry is gone, no longer linked). Fails closed.
 */
export function linkedNow(node: EntityMetadata | undefined, lookup: NodeLookup, changedReason: string): LinkedNow | string {
  const link = node === undefined ? NO_LINK : sshLinkOf(node, lookup);
  return link.kind === 'linked' ? link : unusableReason(link, changedReason);
}

/** An entry that is gone: its link reads as nothing, which is "changed". */
const NO_LINK: SshLink = { kind: 'none' };

function unusableReason(link: SshLink, changedReason: string): string {
  return link.kind === 'refused' ? link.reason : changedReason;
}

/**
 * The arrow's and the launcher's one road over SSH, after each has planned its line (E2.S1): prepare, the typed line's own
 * refusal (PowerShell 5.1, before anyone is asked), `gates` on the TRUST LINE of the prepared snapshot (the trust question
 * and the dependencies, as the road has them), then the guarded send into SSH Connect's shell with the session's environment
 * (a password opens a new terminal, D10). A stopped preparation says what it had to; a refused one shows SSH Connect's own
 * modal with no retry; a refused send says why. `true` when the line was typed. The ONE OWNER holds the session until the
 * terminal has it. `key` is read after the gates, as the road keeps its terminal's key current across their awaits.
 */
export async function runOverSsh(
  road: SshRoad,
  accountId: string,
  plan: RemotePlan,
  key: () => EntryTerminalKey,
  gates: (trustLine: string) => Promise<boolean>,
): Promise<boolean> {
  const sessions = ownedSessions();
  try {
    const prepared = await road.prepare(accountId, plan.ssh);
    if (prepared.kind === 'refused') {
      await road.sayRefused(prepared, plan.ssh);
    }
    if (prepared.kind !== 'ready') {
      return false;
    }
    sessions.own(prepared);
    return await typedAfterGates(sessions, prepared, plan, key, gates);
  } finally {
    sessions.cleanAll();
  }
}

async function typedAfterGates(sessions: OwnedSessions, ready: ReadySsh, plan: RemotePlan, key: () => EntryTerminalKey, gates: (trustLine: string) => Promise<boolean>): Promise<boolean> {
  const typed = typedLine(plan, ready, sshReaderShell());
  if (typed.kind === 'refused') {
    return said(typed.reason);
  }
  return (await gates(trustLineFor(ready.entity, ready.jump, plan.line))) ? sentAndHandedOver(sessions, ready, typed.line, key) : false;
}

/** The guarded send; a typed line hands the session to the terminal it went into. */
async function sentAndHandedOver(sessions: OwnedSessions, ready: ReadySsh, line: string, key: () => EntryTerminalKey): Promise<boolean> {
  const sent = await sendGuarded(key(), { kind: 'ssh', env: ready.env }, () => line);
  if (sent.kind === 'typed') {
    sessions.handOver(ready, sent.terminal, sent.earlierEnded);
    return true;
  }
  return sent.kind === 'refused' ? said(sent.reason) : false;
}

function said(reason: string): false {
  void vscode.window.showWarningMessage(reason);
  return false;
}
