import * as vscode from 'vscode';
import { ShellFamily } from './hostShell';
import { findEntryTerminal, openEntryTerminal } from './pinnedTerminal';
import { activityOf, noteSent } from './terminalActivityTracker';
import { Activity, TYPE_ANYWAY, agentRefusal, busyQuestion, closedMeanwhile } from './terminalActivity';

/**
 * The guard both roads to an entry's terminal share — the green arrow and the VPN launcher (parent
 * `PLAN_terminal_folder_run.md` §2).
 *
 * <p>The identity is the `vscode.Terminal` OBJECT, never its name: what is read is the object that will be typed
 * into, and an override authorises one send to that object, captured before the await. After the gates' last await
 * nothing stands between the find and the send on the no-terminal and finished paths.</p>
 */
export type GuardedSend =
  | { kind: 'typed'; terminal: vscode.Terminal }
  | { kind: 'declined' } // the person did not say Type It Anyway, or a question is already open for that terminal
  | { kind: 'refused'; reason: string }; // the caller says it (a warning)

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
  entryName: string,
  terminalOs: string | undefined,
  lineFor: (family: ShellFamily) => string,
  startGate?: AbortSignal,
): Promise<GuardedSend> {
  const found = findEntryTerminal(entryName, terminalOs); // synchronous from here ...
  if (!found.ok) {
    return { kind: 'refused', reason: found.reason };
  }
  if (found.terminal === undefined) {
    return typeIntoNew(entryName, terminalOs, lineFor);
  }
  const verdict = verdictOf(found.terminal);
  const line = lineFor(found.family);
  return verdict === 'finished' ? shownAndTyped(found.terminal, line) : askThenType(found.terminal, verdict, line, startGate); // ... to here
}

/**
 * A NEW terminal for the entry, and the line typed into it: never a find, and nothing is disposed. The no-terminal path
 * of `sendGuarded`, and each line of a folder run.
 */
export function typeIntoNew(entryName: string, terminalOs: string | undefined, lineFor: (family: ShellFamily) => string): NewTerminalSend {
  const opened = openEntryTerminal(entryName, terminalOs);
  return opened.ok ? typed(opened.terminal, lineFor(opened.family)) : { kind: 'refused', reason: opened.reason };
}

/** What the tracker knows — except that a terminal with a question open is never `finished`: that send is the person's to answer. */
function verdictOf(terminal: vscode.Terminal): Activity {
  return asking.has(terminal) ? 'unknown' : activityOf(terminal);
}

/** A reused terminal is brought to the front, as before the guard; no await between the show and the send. */
function shownAndTyped(terminal: vscode.Terminal, line: string): GuardedSend {
  terminal.show();
  return typed(terminal, line);
}

/** `noteSent` BEFORE `sendText`: the evidence is void before the keystrokes leave, and a late end cannot restore it. */
function typed(terminal: vscode.Terminal, line: string): Extract<GuardedSend, { kind: 'typed' }> {
  noteSent(terminal);
  terminal.sendText(line, true);
  return { kind: 'typed', terminal };
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
