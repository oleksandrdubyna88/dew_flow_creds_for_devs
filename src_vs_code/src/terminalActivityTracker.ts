import * as vscode from 'vscode';
import { Activity, ActivityEvent, ActivityState, UNKNOWN, nextActivity, readActivity } from './terminalActivity';

/**
 * Shell integration's start and end events, folded into one `ActivityState` per terminal (the host half of
 * `terminalActivity.ts`). Only the sources of the events are here; every decision is the pure module's.
 */

/** One record per terminal OBJECT, retired with it — a WeakMap, no close listener, cannot grow. */
const states = new WeakMap<vscode.Terminal, ActivityState>();

/** The one subscription — a second would apply every start twice, and a start while running is the poison row. */
let tracking: vscode.Disposable | undefined;

/** Subscribe once to shell integration's start and end events. Idempotent: a second call answers the same disposable. */
export function trackTerminalActivity(): vscode.Disposable {
  tracking ??= subscribe();
  return tracking;
}

function subscribe(): vscode.Disposable {
  const started = vscode.window.onDidStartTerminalShellExecution((e) => apply(e.terminal, { kind: 'start', execution: e.execution }));
  const ended = vscode.window.onDidEndTerminalShellExecution((e) =>
    apply(e.terminal, { kind: 'end', execution: e.execution, exitCode: e.exitCode }),
  );
  return {
    dispose: (): void => {
      started.dispose();
      ended.dispose();
      tracking = undefined;
    },
  };
}

function apply(terminal: vscode.Terminal, event: ActivityEvent): void {
  states.set(terminal, nextActivity(states.get(terminal) ?? UNKNOWN, event));
}

/** What the tracker knows about `terminal` — `'unknown'` for one it has never heard of (a reload, no integration). */
export function activityOf(terminal: vscode.Terminal): Activity {
  return readActivity(states.get(terminal));
}

/** Called immediately BEFORE our own `sendText`: what was known is void, and a start from here on counts, synchronously. */
export function noteSent(terminal: vscode.Terminal): void {
  apply(terminal, { kind: 'sent' });
}
