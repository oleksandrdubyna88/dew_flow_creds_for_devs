/**
 * What is known about one terminal's last command — the pure half of the busy-terminal guard (parent
 * `PLAN_terminal_folder_run.md` §2). Imports nothing from `vscode`.
 *
 * <p>`finished` is the ONLY verdict that types without asking, and it is reached by exactly one path: OUR OWN send,
 * then a start, then the end of THAT execution carrying a numeric exit code. A start and an end on a terminal the
 * extension has not typed into this activation say nothing: after a reload they could be a replay, or a shell inside a tmux
 * client that still runs. Everything else — nothing recorded, a reload, no shell integration, a sub-shell, a send with
 * no start seen yet — reads `unknown`, and a false `unknown` costs one question while a false `finished` types into
 * whatever is running.</p>
 *
 * <p>Values are immutable: the tracker replaces a terminal's state, it never mutates one.</p>
 */

/** What the tracker knows about one terminal. */
export type ActivityState =
  | { readonly kind: 'unknown' } // nothing recorded: no send of ours this activation
  | { readonly kind: 'armed' } // we typed, and no start has been seen since
  | { readonly kind: 'running'; readonly current: object } // a start seen, its end not yet
  | { readonly kind: 'finished' } // the matching end carried a numeric exit code
  | { readonly kind: 'poisoned' }; // a sub-shell signature: unknown for the terminal's life

export type ActivityEvent =
  | { readonly kind: 'start'; readonly execution: object }
  | { readonly kind: 'end'; readonly execution: object; readonly exitCode: number | undefined }
  | { readonly kind: 'sent' }; // our own sendText

export type Activity = 'finished' | 'running' | 'unknown';

export const UNKNOWN: ActivityState = Object.freeze({ kind: 'unknown' });
const ARMED: ActivityState = Object.freeze({ kind: 'armed' });
const FINISHED: ActivityState = Object.freeze({ kind: 'finished' });
const POISONED: ActivityState = Object.freeze({ kind: 'poisoned' });

/**
 * The transition table (parent §2). A start with no send of ours says nothing. A start while one is running is the sub-shell
 * signature (VS Code documents that a start before the previous command finished is what makes the previous end's code
 * `undefined`): poisoned, whichever order the pair arrives in. An end counts only for the execution OBJECT that is running — a
 * late end and a replayed end are ignored. Our own send arms the terminal, so a late end cannot restore `finished`; over a
 * running command it poisons.
 */
export function nextActivity(state: ActivityState, event: ActivityEvent): ActivityState {
  return state.kind === 'poisoned' ? state : step(state, event);
}

function step(state: ActivityState, event: ActivityEvent): ActivityState {
  switch (event.kind) {
    case 'start':
      return onStart(state, event.execution);
    case 'end':
      return onEnd(state, event);
    case 'sent':
      return onSent(state);
  }
}

function onStart(state: ActivityState, execution: object): ActivityState {
  if (state.kind === 'unknown') {
    return state; // no send of ours: a replay, or a shell inside what is attached here
  }
  return state.kind === 'running' ? POISONED : Object.freeze({ kind: 'running', current: execution });
}

/**
 * Our own send arms the terminal: what starts after it can be believed — except over a RUNNING command: typing into it
 * (`Type It Anyway`) must not erase that something runs there, or a start and end of a program inside it (tmux's inner
 * shell) would read as the terminal finishing. Poisoned for life, like any other sub-shell signature.
 */
function onSent(state: ActivityState): ActivityState {
  return state.kind === 'running' ? POISONED : ARMED;
}

function onEnd(state: ActivityState, event: { readonly execution: object; readonly exitCode: number | undefined }): ActivityState {
  if (state.kind !== 'running' || state.current !== event.execution) {
    return state;
  }
  return typeof event.exitCode === 'number' ? FINISHED : POISONED;
}

const READING: Record<ActivityState['kind'], Activity> = {
  unknown: 'unknown',
  armed: 'unknown',
  running: 'running',
  finished: 'finished',
  poisoned: 'unknown',
};

/** A terminal with no record reads `unknown`: a reload, or no shell integration, tells us nothing. */
export function readActivity(state: ActivityState | undefined): Activity {
  return state === undefined ? 'unknown' : READING[state.kind];
}

export const TYPE_ANYWAY = 'Type It Anyway';

const KEYSTROKES = `${TYPE_ANYWAY} sends it into that terminal as keystrokes. Whatever runs there receives them — a tmux client passes them to the program inside.`;

/** The question, with the line shown verbatim as the trust modal shows it — a summary is what an attacker would want. */
export function busyQuestion(terminalName: string, verdict: 'running' | 'unknown', line: string): string {
  const why =
    verdict === 'running'
      ? `"${terminalName}" is still running a command, so this line was not typed:`
      : `CredsForDevs cannot tell whether "${terminalName}" has finished its last command — no shell integration reported it, or the window was reloaded since — so this line was not typed:`;
  return `${why}\n\n${line}\n\n${KEYSTROKES}`;
}

export function agentRefusal(terminalName: string): string {
  return `"${terminalName}" may still be running its last command, and a request from an agent does not type over it. Nothing was typed; run the entry yourself from the tree once that terminal is free.`;
}

export function closedMeanwhile(terminalName: string): string {
  return `"${terminalName}" closed while the question was open, so nothing was typed. Run it again to open a new terminal.`;
}
