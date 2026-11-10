import * as vscode from 'vscode';
import { ShellFamily } from './hostShell';
import { EntryLookup, findEntryTerminal, findSshTerminal, openEntryTerminal, openSshEntryTerminal, sshReaderShell } from './pinnedTerminal';
import { activityOf, noteSent } from './terminalActivityTracker';
import { EntryTerminalKey } from './terminalTitles';
import { Activity, TYPE_ANYWAY, agentRefusal, busyQuestion, closedMeanwhile } from './terminalActivity';

/**
 * The guard both roads to an entry's terminal share — the green arrow and the VPN launcher (parent
 * `PLAN_terminal_folder_run.md` §2).
 *
 * <p>The identity is the `vscode.Terminal` OBJECT, never its name: what is read is the object that will be typed
 * into, and an override authorises one send to that object, captured before the await. After the gates' last await
 * nothing stands between the find and the send on the no-terminal and finished paths.</p>
 *
 * <p>Two targets (`SendTarget`): an entry's own line, in the shell its *Runs on* names, and a line composed for SSH
 * (E2.S1 of `PLAN_terminal_command_over_ssh.md`), which goes into SSH Connect's shell and never reads *Runs on*. A
 * session that signs in with a password carries an environment, which a terminal takes only at creation: that send
 * never finds and never disposes, it opens a new terminal beside any live one (D10).</p>
 */
export type GuardedSend =
  | { kind: 'typed'; terminal: vscode.Terminal; /** The terminal was REUSED after a `finished` verdict: what ran in it before has ended. False for a new terminal and for Type It Anyway. */ earlierEnded: boolean }
  | { kind: 'declined' } // the person did not say Type It Anyway, or a question is already open for that terminal
  | { kind: 'refused'; reason: string }; // the caller says it (a warning)

/**
 * Where a line goes: an entry's own line (`terminalOs` is its *Runs on*), or a line composed for SSH (E2-D3), optionally
 * with the environment of a password session (D10).
 */
export type SendTarget =
  | { readonly kind: 'entry'; readonly terminalOs: string | undefined }
  | { readonly kind: 'ssh'; readonly env?: Record<string, string> };

/** What opening a new terminal can answer: there is no question on this road. */
export type NewTerminalSend = Extract<GuardedSend, { kind: 'typed' | 'refused' }>;

/** Terminals with a question open — one question per terminal object. A WeakSet: cannot outlive the terminals. */
const asking = new WeakSet<vscode.Terminal>();

/**
 * Type an entry's line into its terminal only when that is known to be safe NOW: no live terminal → open one and
 * type; its last command known finished → type; anything else → show it and ask — or, for an agent-served start
 * (`startGate` given), refuse without asking. `lineFor` receives the family of the shell that will read the line
 * (`{config}` is quoted for it). With a `startGate` there is no await at all.
 */
export async function sendGuarded(
  key: EntryTerminalKey,
  target: SendTarget,
  lineFor: (family: ShellFamily) => string,
  startGate?: AbortSignal,
): Promise<GuardedSend> {
  const found = lookupFor(key, target); // synchronous from here ...
  if (!found.ok) {
    return { kind: 'refused', reason: found.reason };
  }
  if (found.terminal === undefined) {
    return typeIntoNew(key, target, lineFor);
  }
  const verdict = verdictOf(found.terminal);
  const line = lineFor(found.family);
  return verdict === 'finished' ? shownAndTyped(found.terminal, line) : askThenType(found.terminal, verdict, line, startGate); // ... to here
}

/**
 * A NEW terminal for the entry, and the line typed into it: never a find, and nothing is disposed. The no-terminal path
 * of `sendGuarded`, and each line of a folder run.
 */
export function typeIntoNew(key: EntryTerminalKey, target: SendTarget, lineFor: (family: ShellFamily) => string): NewTerminalSend {
  if (target.kind === 'ssh') {
    return typed(openSshEntryTerminal(key, target.env), lineFor(sshReaderShell().family));
  }
  const opened = openEntryTerminal(key, target.terminalOs);
  return opened.ok ? typed(opened.terminal, lineFor(opened.family)) : { kind: 'refused', reason: opened.reason };
}

/**
 * The live terminal the line would go to now, by target: an entry's own rule, or SSH Connect's shell. A session with an
 * environment (a password) finds NONE, without looking: its send opens a new terminal and disposes nothing (D10).
 */
function lookupFor(key: EntryTerminalKey, target: SendTarget): EntryLookup {
  if (target.kind === 'entry') {
    return findEntryTerminal(key, target.terminalOs);
  }
  return { ok: true, terminal: target.env === undefined ? findSshTerminal(key) : undefined, family: sshReaderShell().family };
}

/** What the tracker knows — except that a terminal with a question open is never `finished`: that send is the person's to answer. */
function verdictOf(terminal: vscode.Terminal): Activity {
  return asking.has(terminal) ? 'unknown' : activityOf(terminal);
}

/** A reused terminal is brought to the front, as before the guard; no await between the show and the send. */
function shownAndTyped(terminal: vscode.Terminal, line: string): GuardedSend {
  terminal.show();
  return typed(terminal, line, true);
}

/** `noteSent` BEFORE `sendText`: the evidence is void before the keystrokes leave, and a late end cannot restore it. */
function typed(terminal: vscode.Terminal, line: string, earlierEnded = false): Extract<GuardedSend, { kind: 'typed' }> {
  noteSent(terminal);
  terminal.sendText(line, true);
  return { kind: 'typed', terminal, earlierEnded };
}

async function askThenType(terminal: vscode.Terminal, verdict: 'running' | 'unknown', line: string, startGate: AbortSignal | undefined): Promise<GuardedSend> {
  if (startGate !== undefined) {
    return { kind: 'refused', reason: agentRefusal(terminal.name) }; // no await on the agent path
  }
  if (asking.has(terminal)) {
    return { kind: 'declined' };
  }
  asking.add(terminal);
  try {
    terminal.show();
    const choice = await vscode.window.showWarningMessage(busyQuestion(terminal.name, verdict, line), { modal: true }, TYPE_ANYWAY);
    return choice === TYPE_ANYWAY ? overrideSend(terminal, line) : { kind: 'declined' };
  } finally {
    asking.delete(terminal);
  }
}

/** The object captured before the await, never a re-find; gone meanwhile → nothing typed. */
function overrideSend(terminal: vscode.Terminal, line: string): GuardedSend {
  return terminal.exitStatus === undefined ? typed(terminal, line) : { kind: 'refused', reason: closedMeanwhile(terminal.name) };
}
