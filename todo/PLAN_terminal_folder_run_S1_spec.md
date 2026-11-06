# PLAN — S1 spec: the busy-terminal guard (CORNERSTONE)

> Status: **built, in review, 2026-11-05.** Parent: [PLAN_terminal_folder_run.md](PLAN_terminal_folder_run.md).
> Story S1 of the parent's `## Stories` (parent §Design 2 *A terminal that may be busy*, §Test plan, §Hand checks 2–5).
> Written by Fable before any code; Sonnet codes from it, Opus reviews. Where this spec and the parent's §2 differ in a
> detail, this spec decides and the parent's deviation is recorded at promotion.
>
> Scope: `src_vs_code` only. Two new pure-or-host modules (`terminalActivity.ts`, `terminalActivityTracker.ts`), one
> new host module for the guard (`terminalGuard.ts`), the find/create split in `pinnedTerminal.ts`, the two callers
> (`commands/runCommands.ts`, `vpnLauncherRun.ts`), the tests and the two research docs. No `{name}` (S2), no folder
> run (S3, S4), no help text, no README, no CHANGELOG (S4).

## S1.0 — Facts this spec rests on (verified 2026-11-05 in this worktree, `@types/vscode` 1.93.0)

| # | Fact | Where | Consequence |
|---|---|---|---|
| F1 | The green arrow is `runCommand` → `passGates` (OS refusal, trust modal, dependency chain, each awaited) → `typeIntoEntryTerminal`, which calls `entryTerminal(entry.name, entry.details.terminalOs)` and `opened.terminal.sendText(line, true)`. | `src/commands/runCommands.ts:104-131` | The guard sits exactly where `typeIntoEntryTerminal` is: after the last await of the gates. |
| F2 | `entryTerminal` decides the shell with `entryShell`, names the terminal `` `CredsForDevs: ${entryName}` ``, and on the default road `defaultProfileTerminal` does `vscode.window.terminals.find((t) => t.name === name) ?? createTerminal({ name })` — by name, **no `exitStatus` check**, then `show()`. On the pinned road `pinnedTerminal(name)` reuses only a live terminal of the same `shellPath` (`reusableTerminal`, `:98-105`). | `src/pinnedTerminal.ts:115-131`, `:63-74`, `:98-105` | This is the hazard: a live terminal of that name, whatever runs in it, receives the line. The split keeps today's routing (default: by name; pinned: by name and shell) and adds liveness. |
| F3 | The VPN launcher is the second road: `launch` → `entryTerminal(launcher.name, launcher.terminalOs)` → `sendText(withConfig(line, configPath, opened.family), true)`. `configFor` is the last await before it and re-reads `requestGone(ctx.startGate)` (E4.S3). | `src/vpnLauncherRun.ts:98-123` | The launcher takes the same guard. With a `startGate` the guard must add **no await** before the send, or the E4.S3 invariant ("read last, immediately before the line is sent") breaks. |
| F4 | `entryTerminal` has exactly two callers: `runCommands.ts:125` and `vpnLauncherRun.ts:103`. | `grep -rn "entryTerminal\b" src` | Both move to the guard; `entryTerminal` is removed, not kept beside its replacement. |
| F5 | `registerRunCommands(host)` is called once from `extension.ts:840` with `{ context, refSource, register, storage, storageDir, vaultKeys }`; `host.context` is the `ExtensionContext`. `extension.ts` is 1003 lines against a ratchet baseline of 1003 (`.size-baseline.json`). | `src/extension.ts:840`, `src/commands/runCommands.ts:22-43` | The tracker is subscribed from `registerRunCommands` through `host.context.subscriptions`; `extension.ts` does not change. |
| F6 | `onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution` carry `{ terminal, shellIntegration, execution }`, the end also `exitCode: number \| undefined`; `undefined` means the shell did not report a code **or** reported a command started before this one finished (a sub-shell). `TerminalShellIntegration` has only `cwd` and `executeCommand`; `executeCommand` "sends ^C as necessary". `Terminal.exitStatus` is `undefined` while the terminal lives. | `index.d.ts:7684-7726`, `:7448-7457`, `:7333`, `:10793-10800` | Only a matched end with a numeric code is `finished`; an undefined code poisons; the guard keeps `sendText`, never `executeCommand`. |
| F7 | `dependencyRunHost.ts` already compares executions by identity (`e.execution === execution`, `:321-324`) and uses a fresh terminal per chain. | `src/dependencyRunHost.ts:309-333` | The tracker's identity rule is the same one; the chain is untouched by this story. |
| F8 | The stub world: `src/test/vpnWorld.ts` `world()` builds a `vscode` stub whose `window.terminals` is a **static `[]`** (created terminals are recorded in `w.terminals` but never listed), whose `executeCommand` fires `ended` listeners with `{ execution, exitCode }` (no `terminal` field), and which has no `onDidStartTerminalShellExecution`. `loadWithVscode(request, stub, mocks)` substitutes modules by the request string the module under test writes. | `src/test/vpnWorld.ts:64-131`, `src/test/vscodeStub.ts:16-67` | The world gains `preopened`, a `start` event and an event firer (§S1.7.1); created terminals stay unlisted so no existing test changes meaning. |
| F9 | **Probe, 2026-11-05, against the compiled main checkout (same sources):** `loadWithVscode('../commands/runCommands', w.vscode, { '../extension': { maskingBanner: () => '' } })` loads with the vpnWorld-shaped stub and nothing more (a Proxy recorded no other `vscode` key at import); `registerRunCommands` with a fake host registers three commands; invoking `credSshManager.runCommand` with `{ kind: 'node', accountId, node }`, the line pre-trusted and `window.terminals` holding a live `CredsForDevs: alert` with a running execution, calls that terminal's `sendText('tmux attach -t alert', true)` once and creates nothing. | probe script, not committed | The RED test drives the **real handler**; the one mock is `'../extension'` (`runCommands.ts:15` imports `maskingBanner` from it, which would otherwise load the whole extension). |
| F10 | Limits: eslint `complexity` 4, `max-lines-per-function` 50 (120 in `src/test`), `max-lines` 800; CLAUDE.md rule 3: testable logic imports no `vscode`. | `eslint.config.mjs`, `CLAUDE.md` | §S1.11 gives the function shapes that fit. |

Not determined here, and not needed for correctness: what VS Code revives after a reload or a Remote-SSH reconnect, whether
old sequences replay, whether tmux passes an inner shell's sequences. Every answer lands in `unknown` or `poisoned`,
which ask. The parent's §Hand checks measure them.

## S1.1 — The contract (what the reviewer checks every line against)

Three identities and one moment:

1. **Terminal identity is the `vscode.Terminal` OBJECT**, never its name. The tracker keys on the object (`WeakMap`).
   The guard reads the activity of the object it will type into, and an override (`Type It Anyway`) authorises one send
   to **that object** — captured before the await — not to whichever terminal later carries its name.
2. **Execution identity is the `TerminalShellExecution` OBJECT.** An end counts only when `event.execution === current`.
   A late end (for an earlier execution) and a replayed end (no start recorded) are ignored. Matched start and end
   prove correlation, not that they came from the outer shell: a start while one is running is the sub-shell signature
   and poisons, exactly as an end with `exitCode === undefined` does.
3. **`finished` is the ONLY verdict that types without asking**, and it is reached by exactly one path: `running(c)`
   then `end(c, number)` — a non-zero number included (a failed `aws sso login` still finished). `unknown` at start,
   after a reload (nothing recorded), without integration, after a poison, and after our own send.
4. **The last moment before sending.** After the gates' last await, the find, the read, `noteSent` and `sendText` run
   with **no await between them**. Our own send invalidates all evidence synchronously (`noteSent` BEFORE
   `sendText`), so a late event cannot restore `finished` for the next click. On the modal path the only await is the
   question; after it, the send goes to the captured object if it is still alive, and never to a re-find.
5. **A false `finished` is the expensive error; a false `unknown` costs one question.** Every doubt resolves to `unknown`.
6. **Overlap.** Two invocations on one live terminal cannot both type: the second finds either `unknown` (the first
   already typed, synchronously) or a question already open for that object (refused quietly, no second modal). This is
   enforced by code (§S1.5 `asking`), not by the modal's blocking the UI, and scenario 17 proves it.

## S1.2 — `src/terminalActivity.ts` (new, pure: imports nothing from `vscode`)

```ts
/** What the tracker knows about one terminal. Values are immutable; the tracker replaces, never mutates. */
export type ActivityState =
  | { readonly kind: 'unknown' }                        // nothing recorded, or cleared by our own send
  | { readonly kind: 'running'; readonly current: object } // a start seen, its end not yet
  | { readonly kind: 'finished' }                       // the matching end carried a numeric exit code
  | { readonly kind: 'poisoned' };                      // a sub-shell signature: unknown for the terminal's life

export type ActivityEvent =
  | { readonly kind: 'start'; readonly execution: object }
  | { readonly kind: 'end'; readonly execution: object; readonly exitCode: number | undefined }
  | { readonly kind: 'sent' };                          // our own sendText

export type Activity = 'finished' | 'running' | 'unknown';

export const UNKNOWN: ActivityState;   // Object.freeze({ kind: 'unknown' })
export function nextActivity(state: ActivityState, event: ActivityEvent): ActivityState;
export function readActivity(state: ActivityState | undefined): Activity;  // undefined (no record) → 'unknown'

export const TYPE_ANYWAY = 'Type It Anyway';
export function busyQuestion(terminalName: string, verdict: 'running' | 'unknown', line: string): string;
export function agentRefusal(terminalName: string): string;
export function closedMeanwhile(terminalName: string): string;
```

**The transition table — complete; every cell is a test in §S1.7.2.** Rows are the state before, columns the event.
`c` is the running execution, `e` any execution, `e ≠ c` a different object.

| state \ event | `start(e)` | `end(c, number)` | `end(c, undefined)` | `end(e ≠ c)` or end with no start | `sent` |
|---|---|---|---|---|---|
| `unknown` | `running(e)` | — (no `c`: ignored, stays `unknown`) | — (ignored) | ignored, `unknown` | `unknown` |
| `running(c)` | **`poisoned`** (a start before `c` ended: a sub-shell, whichever order VS Code delivers the pair) | `finished` | `poisoned` | ignored, `running(c)` | `unknown` |
| `finished` | `running(e)` | — (no `c`: ignored) | — (ignored) | ignored, `finished` | `unknown` |
| `poisoned` | `poisoned` | `poisoned` | `poisoned` | `poisoned` | `poisoned` |

`readActivity`: `unknown` → `'unknown'`, `running` → `'running'`, `finished` → `'finished'`, `poisoned` → `'unknown'`,
`undefined` → `'unknown'`.

Why `running + start → poisoned` and not `running(e)`: the parent's table has no row for it, and the natural reading
(`current = its execution`) would make `start(tmux)`, `start(ls inside tmux)`, `end(ls, 0)` read `finished` while tmux
runs — parent hand check 4 says that must never happen. VS Code documents that a start before the previous command
finished is what makes the previous end's code `undefined` (F6); whichever of the two events arrives first, this table
lands in `poisoned`. Recorded as a spec decision (§S1.14 D1).

**Texts** (exact; the line is shown verbatim, as the trust modal does — a summary is what an attacker would want):

```ts
busyQuestion(name, 'running', line) ===
  `"${name}" is still running a command, so this line was not typed:\n\n${line}\n\n` +
  `${TYPE_ANYWAY} sends it into that terminal as keystrokes. Whatever runs there receives them — a tmux client passes them to the program inside.`;

busyQuestion(name, 'unknown', line) ===
  `CredsForDevs cannot tell whether "${name}" has finished its last command — no shell integration reported it, or the window was reloaded since — so this line was not typed:\n\n${line}\n\n` +
  `${TYPE_ANYWAY} sends it into that terminal as keystrokes. Whatever runs there receives them — a tmux client passes them to the program inside.`;

agentRefusal(name) ===
  `"${name}" may still be running its last command, and a request from an agent does not type over it. Nothing was typed; run the entry yourself from the tree once that terminal is free.`;

closedMeanwhile(name) ===
  `"${name}" closed while the question was open, so nothing was typed. Run it again to open a new terminal.`;
```

Shape: `nextActivity` is a `switch` on `event.kind` delegating to `onStart`, `onEnd`, `onSent` (each complexity ≤ 4);
`onEnd` first answers `state` unless `state.kind === 'running' && state.current === event.execution`, then
`typeof event.exitCode === 'number' ? FINISHED : POISONED`. `UNKNOWN`, `FINISHED`, `POISONED` are frozen constants;
`running` states are fresh frozen objects. No function mutates its arguments.

## S1.3 — `src/terminalActivityTracker.ts` (new, host: imports `vscode`)

```ts
import * as vscode from 'vscode';
import { Activity, ActivityState, UNKNOWN, nextActivity, readActivity } from './terminalActivity';

/** One record per terminal OBJECT, retired with it — a WeakMap, no close listener, cannot grow (parent §Budget). */
const states = new WeakMap<vscode.Terminal, ActivityState>();
let tracking: vscode.Disposable | undefined;

/**
 * Subscribe once to shell integration's start and end events. Idempotent: a second call answers the same disposable,
 * because two subscriptions would apply every start twice — and a start while running is the poison row.
 */
export function trackTerminalActivity(): vscode.Disposable;
/** What the tracker knows about `terminal` — `'unknown'` for one it has never heard of (a reload, no integration). */
export function activityOf(terminal: vscode.Terminal): Activity;
/** Called immediately BEFORE our own `sendText`: the evidence is void from this moment, synchronously. */
export function noteSent(terminal: vscode.Terminal): void;
```

- `trackTerminalActivity`: `tracking ??= subscribe()`; `subscribe()` registers
  `vscode.window.onDidStartTerminalShellExecution((e) => apply(e.terminal, { kind: 'start', execution: e.execution }))`
  and `onDidEndTerminalShellExecution((e) => apply(e.terminal, { kind: 'end', execution: e.execution, exitCode: e.exitCode }))`
  and returns a plain `{ dispose(): void }` that disposes both and clears `tracking` (not `vscode.Disposable.from`: the
  stub world has no `Disposable` class).
- `apply(terminal, event)`: `states.set(terminal, nextActivity(states.get(terminal) ?? UNKNOWN, event))`.
- `activityOf(t)`: `readActivity(states.get(t))`. `noteSent(t)`: `apply(t, { kind: 'sent' })`.

The module is loaded fresh per `loadWithVscode` (the whole `out/` graph is evicted), so a test never inherits another
test's `states`.

## S1.4 — `src/pinnedTerminal.ts`: `entryTerminal` splits into a find and a create

Remove `entryTerminal` (`:107-131`, including `defaultProfileTerminal`) and add:

```ts
export type EntryLookup =
  | { ok: false; reason: string }                                              // entryShell or pinned refusal
  | { ok: true; terminal: vscode.Terminal | undefined; family: ShellFamily };  // the live terminal the line would go to today, or none

/**
 * The terminal a Terminal ENTRY's line would be typed into, if one is LIVE — found, never created, never shown.
 * Default road: the first live terminal of the entry's name. Pinned road: a live one of the name running the pinned
 * shell (`reusableTerminal`'s rule). Live means `exitStatus === undefined` — a closed terminal still in the list is
 * not a target (today's default road had no such check: F2).
 */
export function findEntryTerminal(entryName: string, terminalOs: string | undefined): EntryLookup;

/** A NEW terminal for the entry, shown — created, never found. The guard calls it only when `find` answered none. */
export function openEntryTerminal(entryName: string, terminalOs: string | undefined): EntryTerminal;  // EntryTerminal type unchanged (:107-109)
```

Implementation shape (each function complexity ≤ 4):

- `entryRefusal(choice: EntryShell): string | undefined` — `refused` → its reason; `pinned` → `pinnedRefusal()`; else
  `undefined`.
- `findEntryTerminal`: `ctx = shellContext()`, `choice = entryShell(...)`, refusal → `{ ok: false }`; otherwise
  `{ ok: true, terminal: liveEntryTerminal(entryName, choice), family: readerFamily(choice, pinnedShell(), ctx) }`.
- `liveEntryTerminal(entryName, choice)`: `live = vscode.window.terminals.filter((t) => t.name === name && t.exitStatus === undefined)`;
  `choice.kind === 'pinned' ? live.find((t) => shellPathOf(t) === pinnedShell().shellPath) : live[0]`.
- `openEntryTerminal`: same refusal; then `createTerminal(choice.kind === 'pinned' ? { name, shellPath: pinnedShell().shellPath } : { name })`,
  `terminal.show()`, `{ ok: true, terminal, family }`.
- The entry name is `` `CredsForDevs: ${entryName}` `` in both, as today (`:121`). `pinnedTerminal`, `sendPinned`,
  `reusableTerminal` do not change (their hazard is a recorded todo, parent §Not in this plan).

## S1.5 — `src/terminalGuard.ts` (new, host): the guard both roads share

```ts
import * as vscode from 'vscode';
import { ShellFamily } from './hostShell';
import { findEntryTerminal, openEntryTerminal } from './pinnedTerminal';
import { activityOf, noteSent } from './terminalActivityTracker';
import { TYPE_ANYWAY, agentRefusal, busyQuestion, closedMeanwhile } from './terminalActivity';

export type GuardedSend =
  | { kind: 'typed'; terminal: vscode.Terminal }
  | { kind: 'declined' }                 // the person did not say Type It Anyway, or a question is already open for that terminal
  | { kind: 'refused'; reason: string }; // the caller says it (warning)

/**
 * Type an entry's line into its terminal only when that is known to be safe NOW (parent §2):
 * no live terminal → open one and type; its last command known finished → type; anything else → show it and ask —
 * or, for an agent-served start (`startGate` given), refuse without asking. `lineFor` receives the family of the shell
 * that will read the line (`{config}` is quoted for it).
 */
export async function sendGuarded(
  entryName: string,
  terminalOs: string | undefined,
  lineFor: (family: ShellFamily) => string,
  startGate?: AbortSignal,
): Promise<GuardedSend>;
```

The flow, with the synchronous section marked. **No await stands between the find and the send on the `none` and
`finished` paths**; with a `startGate` there is no await at all.

```ts
const asking = new WeakSet<vscode.Terminal>();   // terminals with a question open

export async function sendGuarded(entryName, terminalOs, lineFor, startGate): Promise<GuardedSend> {
  const found = findEntryTerminal(entryName, terminalOs);                       // ── synchronous from here
  if (!found.ok) { return { kind: 'refused', reason: found.reason }; }
  if (found.terminal === undefined) { return typeIntoNew(entryName, terminalOs, lineFor); }
  const verdict = activityOf(found.terminal);
  const line = lineFor(found.family);
  return verdict === 'finished' ? typed(found.terminal, line) : askThenType(found.terminal, verdict, line, startGate);
}                                                                                // ── to here (unless asking)

function typeIntoNew(entryName, terminalOs, lineFor): GuardedSend {
  const opened = openEntryTerminal(entryName, terminalOs);
  return opened.ok ? typed(opened.terminal, lineFor(opened.family)) : { kind: 'refused', reason: opened.reason };
}

/** `noteSent` BEFORE `sendText`: the evidence is void before the keystrokes leave, and a late end cannot restore it. */
function typed(terminal: vscode.Terminal, line: string): GuardedSend {
  noteSent(terminal);
  terminal.sendText(line, true);
  return { kind: 'typed', terminal };
}

async function askThenType(terminal, verdict: 'running' | 'unknown', line, startGate): Promise<GuardedSend> {
  if (startGate !== undefined) { return { kind: 'refused', reason: agentRefusal(terminal.name) }; }   // no await on the agent path
  if (asking.has(terminal)) { return { kind: 'declined' }; }                                           // one question per terminal object
  asking.add(terminal);
  try {
    terminal.show();
    const choice = await vscode.window.showWarningMessage(busyQuestion(terminal.name, verdict, line), { modal: true }, TYPE_ANYWAY);
    return choice === TYPE_ANYWAY ? overrideSend(terminal, line) : { kind: 'declined' };
  } finally {
    asking.delete(terminal);
  }
}

/** The object captured before the await, never a re-find; gone meanwhile → nothing typed (parent §2: re-read exitStatus). */
function overrideSend(terminal: vscode.Terminal, line: string): GuardedSend {
  return terminal.exitStatus === undefined ? typed(terminal, line) : { kind: 'refused', reason: closedMeanwhile(terminal.name) };
}
```

Notes the coder must keep:

- `lineFor` is called once per send, after the family is known; for the arrow it ignores the family.
- `asking` is a `WeakSet` on the terminal object: it cannot grow past the live terminals and needs no close listener.
- The `finally` releases the object even when `showWarningMessage` rejects.
- Two concurrent invocations with **no** live terminal each open a terminal (as today — F2's `create`). Not a busy
  terminal typed over; accepted and not tested.

## S1.6 — The callers and the registration

**`src/commands/runCommands.ts`**

- Imports (`:16`): drop `entryTerminal`; keep `pinnedShell, pinnedTerminal, shellContext`. Add
  `import { sendGuarded } from '../terminalGuard';` and `import { trackTerminalActivity } from '../terminalActivityTracker';`.
- `registerRunCommands` (`:39-43`): first line `host.context.subscriptions.push(trackTerminalActivity());`.
- `runCommand` (`:114-116`): `await typeIntoEntryTerminal(entry, line);`.
- `typeIntoEntryTerminal` (`:119-131`) becomes:

```ts
/**
 * A dedicated terminal per entry, reused only when its last command is known to have finished — otherwise the person
 * is shown the terminal and asked (`terminalGuard.ts`; parent decision B). The line runs with Enter: the operator asked
 * for the button to do the whole job, and `Copy Command` remains for the times you want to edit before running.
 */
async function typeIntoEntryTerminal(entry: Entry, line: string): Promise<void> {
  const sent = await sendGuarded(entry.name, entry.details.terminalOs, () => line);
  if (sent.kind === 'refused') {
    warn(sent.reason);
  }
}
```

**`src/vpnLauncherRun.ts`**

- Import (`:10`): `import { shellContext } from './pinnedTerminal';` plus `import { sendGuarded } from './terminalGuard';`.
- `launch` (`:98-112`) becomes:

```ts
async function launch(ctx: VpnRunContext, launcher: EntityMetadata, line: string): Promise<boolean> {
  const configPath = await configFor(ctx, line);
  if (configPath === undefined) {
    return false;
  }
  // `{config}` quoted for the shell that will READ the line (`readerFamily`) — quoting for another one would be #103
  // again. With a request behind the start, the guard refuses a busy terminal instead of asking, so no await stands
  // between `configFor`'s last read of the request and the send (E4.S3).
  const sent = await sendGuarded(launcher.name, launcher.terminalOs, (family) => withConfig(line, configPath, family), ctx.startGate);
  if (sent.kind === 'refused') {
    void vscode.window.showWarningMessage(sent.reason);
  }
  return sent.kind === 'typed';
}
```

- The module docblock (`:15-23`) gains one sentence: *"…and typed only when its terminal's last command is known to
  have finished; otherwise the person is asked, and an agent's request is refused (`terminalGuard.ts`)."*

`extension.ts`, `storageManager.ts`, `dependencyRunHost.ts`, `vpnRun.ts` (`sendPinned`, a recorded todo) do not change.

## S1.7 — Tests

### S1.7.1 — The world: `src/test/vpnWorld.ts` grows, `src/test/arrowWorld.ts` is new

`vpnWorld.ts` (every existing test keeps its meaning: created terminals stay unlisted, `executeCommand` still ends
with the same code):

- `World.open(name: string): LiveTerminal` — makes a terminal through the same `createTerminal` fabric (so it has a
  `FakeTerminal` record with `sent` and `executed`) and returns the OBJECT without listing it, where
  `interface LiveTerminal { readonly name: string; exitStatus: { code: number | undefined } | undefined; sendText(text: string, enter?: boolean): void; show(): void; dispose(): void; shellIntegration?: unknown }`
  (the shape the fabric already builds; expose it with this type).
- `WorldOptions.preopened?: readonly string[]` — names of terminals that are LIVE before the flow starts: each is
  `open`ed and `vscode.window.terminals` is the array of exactly these objects. Without the option it stays `[]`.
- `World.live: Record<string, LiveTerminal>` — the preopened objects by name.
- `World.shell: { start(terminal: LiveTerminal, execution?: object): object; end(terminal: LiveTerminal, execution: object, exitCode: number | undefined): void }`
  — fires the `started` / `ended` listener lists with `{ terminal, execution, exitCode, shellIntegration: terminal.shellIntegration }`;
  `start` returns the execution object (a fresh `{}` unless given).
- `vscode.window.onDidStartTerminalShellExecution: subscribe(started)`, a new listener list.
- The existing `executeCommand` fabric fires `ended` with `terminal` and `shellIntegration` added to the event (the
  chain matches on `execution` only; nothing changes for it).

`arrowWorld.ts` (new, not `*.test.ts`):

```ts
export interface ArrowWorld extends World {
  /** Invoke the green arrow's handler on `entry`, exactly as a click does. */
  run(entry: EntityMetadata): Promise<void>;
  /** What `registerRunCommands` pushed into `context.subscriptions`. */
  subscriptions: unknown[];
}
/** The world with `runCommands` registered against a fake host; `trusted` are [entityId, line] pairs already vouched for. */
export function arrowWorld(opts: WorldOptions = {}, trusted: readonly (readonly [string, string])[] = []): ArrowWorld;
```

Built as the probe did (F9): `w = world({}, opts)`;
`mod = loadWithVscode<{ registerRunCommands(h: unknown): void }>('../commands/runCommands', w.vscode, { '../extension': { maskingBanner: () => '' } })`;
host `{ context: { globalState: store, subscriptions }, refSource: {}, register: (c, h) => (handlers[c] = h), storage: { getNode: (_a, id) => nodes[id], getHistory: async () => [] }, storageDir: os.tmpdir(), vaultKeys: { noteUserActivity: () => undefined } }`
where `store` is `memoryTrust()` pre-seeded with `commandFingerprint(id, line)` for each pair (`commandFingerprint` from
`'../commandTrust'`, pure) and `nodes[id] = { id, type: 'entity', name, details }` is filled by `run(entry)` before it
invokes `handlers['credSshManager.runCommand']({ kind: 'node', accountId: 'a1', node: { id: entry.id, name: entry.name, details: entry } })`.
The entry used throughout: `{ id: 'alert', name: 'alert', isSshEnabled: false, isTerminal: true, command: 'tmux attach', commandArgs: [{ value: '-t alert' }] }`
— no `terminalOs`, so `entryShell` answers `default` on every platform and the terminal is `CredsForDevs: alert`.

### S1.7.2 — Pure: `src/test/terminalActivity.test.ts`

Each test name is the `test()` title. `E = {}` objects; `n = nextActivity`, `r = readActivity`.

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 1 | `nothing_recorded_reads_unknown` | no state | `r(undefined)`, `r(UNKNOWN)` | both `'unknown'` |
| 2 | `a_start_then_its_end_with_a_numeric_code_reads_finished_nonzero_included` | `UNKNOWN` | `start(c)`, `end(c, 0)`; separately `end(c, 1)` and `end(c, -1978335189)` | each `'finished'` |
| 3 | `a_start_with_no_end_reads_running` | `UNKNOWN` | `start(c)` | `'running'` |
| 4 | `an_end_with_undefined_code_on_the_current_execution_poisons_for_life` | `running(c)` | `end(c, undefined)`, then `start(e)`, `end(e, 0)`, then `sent`, then `start(f)`, `end(f, 0)` | `'unknown'` after every step; `state.kind === 'poisoned'` throughout |
| 5 | `a_start_while_running_poisons_in_either_delivery_order` | `running(c)` | (a) `start(e)` then `end(c, undefined)`; (b) `end(c, undefined)` then `start(e)`; (c) `start(e)` then `end(e, 0)` | all `'unknown'`, kind `poisoned` — (c) is the tmux-with-inner-integration case |
| 6 | `an_end_for_another_execution_is_ignored` | `running(c)` | `end(e, 0)` | still `'running'` and `state.current === c` |
| 7 | `an_end_with_no_start_is_ignored` | `UNKNOWN`; separately `FINISHED` (reached via 2) | `end(e, 0)`, `end(e, undefined)` | `UNKNOWN` stays `'unknown'`; finished stays `'finished'` |
| 8 | `our_own_send_clears_the_evidence_and_a_late_end_cannot_restore_it` | finished (via 2) and `running(c)` | `sent`, then `end(c, 0)` | `'unknown'` after `sent`; still `'unknown'` after the late end; then `start(e)`, `end(e, 0)` → `'finished'` (the aws-sso re-run) |
| 9 | `states_are_values_not_mutated` | any sequence from 2, 4, 8 | after each `n` | the input state object is unchanged (`deepEqual` to a copy taken before) and `Object.isFrozen(output)` |
| 10 | `the_question_names_the_terminal_and_shows_the_line_verbatim` | — | `busyQuestion('CredsForDevs: alert', 'running', 'tmux attach -t alert')` and `'unknown'` | each contains the name in quotes, the line on its own line, `TYPE_ANYWAY`; running says *still running a command*, unknown says *cannot tell*; `agentRefusal` and `closedMeanwhile` contain the name and *nothing was typed* |

### S1.7.3 — Stub world, the arrow: `src/test/busyTerminalGuard.test.ts`

`A = 'CredsForDevs: alert'`, `L = 'tmux attach -t alert'`, `aw = arrowWorld(opts, [['alert', L]])`, `t = aw.live[A]`,
`rec = terminalNamed(aw, A)`. Every world is built with `holdDialogs: /was not typed/` unless the row says `modal: 'dismiss'`.

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 11 | **`the_arrow_never_types_into_a_terminal_whose_command_is_running`** (RED first, §S1.8) | `preopened: [A]`, `modal: 'dismiss'`; `aw.shell.start(t)` | `await aw.run(entry)` | `assert.deepEqual(rec.sent, [], 'the arrow typed into a terminal whose command is running')`; `aw.terminals.length === 1` (nothing created); one warning matching `/is still running a command/` carrying `L` |
| 12 | `the_arrow_types_as_today_when_the_last_command_finished` | `preopened: [A]`; `c = start(t)`, `end(t, c, 0)` | `run` | `rec.sent` is `[L]`; `aw.terminals.length === 1`; `aw.warnings` empty; `aw.held` empty |
| 13 | `a_nonzero_exit_still_counts_as_finished` | as 12 with `end(t, c, 1)` | `run` | `rec.sent` is `[L]`, no dialog |
| 14 | `the_arrow_opens_a_new_terminal_when_none_is_live` | no `preopened` | `run` | `aw.terminals.length === 1`, its name `A`, its `sent` is `[L]`; no dialog |
| 15 | `a_live_terminal_with_no_evidence_asks_and_cancel_types_nothing` | `preopened: [A]`, no events | `run`; answer the held dialog with `undefined` | `rec.sent` is `[]`; the dialog text matches `/cannot tell whether "CredsForDevs: alert"/` and contains `L`; its buttons are `['Type It Anyway']` |
| 16 | `type_it_anyway_types_once_into_the_same_terminal_object` | `preopened: [A]`, `c = start(t)` | `p = run`; `await until(() => aw.held.length === 1)`; while held: `other = aw.open(A)` and `aw.vscode.window.terminals = [other]` (a close-and-reopen under the same name); also `end(t, c, 0)` arrives late; answer `'Type It Anyway'`; `await p` | `rec.sent` is `[L]` (the original object); `other`'s record `sent` is `[]`; `aw.terminals.length === 2` (no third terminal) |
| 17 | `a_double_click_asks_once_and_types_at_most_once` | `preopened: [A]`, `start(t)` | `p1 = run; p2 = run` (no await between); `await until(() => aw.held.length === 1)`; `await p2` (it settles on its own: the question is already open for that object); answer the one dialog `'Type It Anyway'`; `await p1` | `aw.held.length === 1` (one question, ever); `rec.sent` is `[L]` |
| 18 | `a_double_click_on_a_finished_terminal_types_once_then_asks` | `preopened: [A]`, `c = start(t)`, `end(t, c, 0)` | `p1 = run; p2 = run`; `await until(() => aw.held.length === 1)`; answer `undefined`; `await Promise.all` | `rec.sent` is `[L]` (the first typed synchronously, the second found `unknown` and asked) |
| 19 | `type_it_anyway_on_a_terminal_that_closed_meanwhile_types_nothing` | `preopened: [A]`, `start(t)` | `p = run`; while held: `t.exitStatus = { code: 0 }`; answer `'Type It Anyway'`; `await p` | `rec.sent` is `[]`; a warning matching `/closed while the question was open/`; `aw.terminals.length === 1` (no new terminal opened for the override) |
| 20 | `after_our_send_a_start_and_a_numeric_end_make_the_next_click_silent` | `preopened: [A]`, `c = start(t)`, `end(t, c, 0)` | `run` (types); then `e = start(t)`, `end(t, e, 0)`; `run` again | `rec.sent` is `[L, L]`; `aw.held` empty throughout |
| 21 | `after_our_send_with_no_new_evidence_the_next_click_asks` | as 20 | `run` (types); then `end(t, c, 0)` again (a replay) and nothing else; `run` | `rec.sent` is `[L]`; one held dialog matching `/cannot tell/` |
| 22 | `a_sub_shell_signature_keeps_asking_for_the_terminals_life` | `preopened: [A]`, `c = start(t)`, `end(t, c, undefined)` | `run` → dialog, answer `undefined`; then `e = start(t)`, `end(t, e, 0)`; `run` → dialog, answer `undefined` | `rec.sent` is `[]`; two held dialogs, both `/cannot tell/` |
| 23 | `the_tracker_is_registered_through_registerRunCommands_and_disposes` | `preopened: [A]` | `aw.subscriptions[0].dispose()`; then `c = start(t)`, `end(t, c, 0)`; `run`; answer the held dialog `undefined` | `aw.subscriptions.length === 1` with a `dispose` function; after the dispose the events are not heard, so `run` asks (`aw.held.length === 1`, `/cannot tell/`) and `rec.sent` is `[]` |

### S1.7.4 — Stub world, the launcher: `src/test/launcherBusyTerminal.test.ts`

Through `startVpn(w, ownerChain(), o)` of `vpnWorld.ts`. The launcher's terminal is `S = 'CredsForDevs: start openvpn'`
(`ownerChain().start`, `terminalOs: hostOs`, which `entryShell` routes to `default` on this platform exactly as
`dependencyChain.test.ts` relies on). Each row cleans its `dir` as the existing tests do.

| # | Test | Given | When | Then |
|---|---|---|---|---|
| 24 | `the_launcher_never_types_into_its_terminal_while_a_command_runs_there` | `world({}, { preopened: [S], holdDialogs: /was not typed/ })` — NOT `modal: 'dismiss'`, which would dismiss the chain's and the trust modal first and never reach the guard; `w.shell.start(w.live[S])` | `p = startVpn`; `await until(() => w.held.length === 1)`; answer `undefined`; `await p` | `started === false`; `terminalNamed(w, S).sent` is `[]`; the chain terminal still ran `install-openvpn` (the installer is awaited before the launcher, as today); the held dialog's text matches `/is still running a command/` |
| 25 | `a_finished_launcher_terminal_is_typed_into_as_today` | `preopened: [S]`, `c = start`, `end(c, 0)` | `startVpn` | `started === true`; `terminalNamed(w, S).sent.length === 1`, matching `/^openvpn --config '.*ops_relay_stage\.ovpn'$/`; `w.terminals.filter((t) => t.name === S).length === 1` |
| 26 | `an_agent_served_start_refuses_a_busy_terminal_instead_of_asking` | `preopened: [S]`, `start` (running), `holdDialogs: /was not typed/`, `startGate: new AbortController().signal` (live, not aborted) | `startVpn(w, nodes, { startGate })` | `started === false`; `w.held` is empty (no question); `terminalNamed(w, S).sent` is `[]`; a warning matching `/a request from an agent does not type over it/` |
| 27 | `an_agent_served_start_types_into_a_finished_terminal_without_a_question` | `preopened: [S]`, `start`, `end(0)`, `startGate` live | `startVpn` | `started === true`; `sent.length === 1`; `w.held` empty |

### S1.7.5 — Structural, unchanged suites that must stay green

`sizeRatchet.test.ts` (extension.ts stays 1003), `commandsRegistered.test.ts`, `manifest`, `helpCoverage`,
`listingCoverage`, `dependencyChain.test.ts`, `vpnGoneRequest.test.ts`, `npm run lint`, `npm run typecheck`.

## S1.8 — RED first, then RED-GREEN-RED

1. **Before any production change**, write §S1.7.1's world changes and test 11 only. Compile, run
   `node --import ./scripts/lower-priority.mjs --test out/test/busyTerminalGuard.test.js`. It must FAIL with the
   `deepEqual` message: expected `[]`, actual `['tmux attach -t alert']`, under the assertion text
   *the arrow typed into a terminal whose command is running*. Copy the failure into the summary. A failure for any
   other reason (a load error, a missing stub key) is not RED: fix the world first. F9 says the load succeeds with the
   vpnWorld stub plus the `'../extension'` mock.
2. Build §S1.2–S1.6, the remaining tests, run the whole suite: green, with the pass of test 11 in the summary.
3. **RED again without the fix** — by two named mutations, each applied alone, watched, and restored (a `git stash` of
   the production files would not compile: the new modules import the split):
   - M1, the guard trusts everything: in `sendGuarded`, `const verdict: Activity = 'finished';` in place of
     `activityOf(found.terminal)`. Expected red: tests 11, 15, 16, 17, 18, 19, 21, 22, 24, 26. Expected still green,
     because they pass today too and say nothing about the fix: 12, 13, 14, 20, 25, 27 — say so in the summary.
   - M2, our own send leaves the evidence standing: `noteSent` made a no-op. Expected red: 18 and 21 (the double click
     on a finished terminal types twice; the replayed end makes the second click silent), and pure test 8.
   After each: `git checkout -- src/terminalGuard.ts src/terminalActivityTracker.ts`, `npm test` green. Both red
   lists and the final green go in the summary, with the failure messages of 11, 18 and 21.

## S1.9 — Documentation this story carries

- `research/module_extension.md:2072-2075`: rewrite the paragraph. Keep the first sentence (the line is sent with Enter;
  the operator's decision). **Replace** *"these are commands the user wrote and saved, not commands arriving from
  elsewhere"* — stale since `commandTrust.ts` (sync and Accept Share deliver commands; the trust modal exists because of
  it) — with the truth, and add the guard: typed only when the terminal's last command is known to have finished
  (shell integration's matched start and end with an exit code); otherwise the terminal is shown and the person asked,
  `Type It Anyway`; an end without an exit code (a sub-shell) leaves that terminal asking for its life; a reload or a
  terminal without integration asks once, then types silently after the first finished command; an agent-served VPN
  start refuses instead of asking. Include the §S1.2 transition table. This closes the parent's last *Not in this
  plan* bullet; S4 does not repeat it.
- `research/module_tests.md`: the unit-test row gains `terminalActivity.test.ts`, `busyTerminalGuard.test.ts`,
  `launcherBusyTerminal.test.ts` and the world additions (`preopened`, `shell.start/end`, `arrowWorld.ts`); a line
  stating that driving a real terminal stays **not covered** for the reason the file gives (nothing drives VS Code) and
  that the parent's §Hand checks 2–5 are what covers it; the RED message of test 11 as the proof the test has teeth.
- No help, README or CHANGELOG here (S4).

## S1.10 — Commands

```bash
cd src_vs_code
npm ci                                   # node_modules is not installed in this worktree
npm run typecheck && npm run lint
npm test                                 # compiles, then node:test over out/test/*.test.js, lowered, ≤ 8 workers
# one suite, after npm run compile:
node --import ./scripts/lower-priority.mjs --test out/test/busyTerminalGuard.test.js
node --import ./scripts/lower-priority.mjs --test out/test/terminalActivity.test.js out/test/launcherBusyTerminal.test.js
```

Local runs stay at lowered priority (`common/local-cpu-budget.md`); the scripts above already lower themselves.

## S1.11 — Size, lint and style budget

- `terminalActivity.ts` ≈ 90 lines: `nextActivity` (switch, 3 cases), `onStart`, `onEnd`, `onSent`, `readActivity`
  (a lookup table `Record<ActivityState['kind'], Activity>`, complexity 1), four text functions. Every function
  complexity ≤ 4, ≤ 50 lines.
- `terminalActivityTracker.ts` ≈ 45 lines; `terminalGuard.ts` ≈ 80 lines (`sendGuarded` complexity 4: two `if`, one
  ternary; `askThenType` complexity 4: two `if`, one ternary; the rest ≤ 2).
- `pinnedTerminal.ts` grows by about 40 lines and loses 25; `runCommands.ts` and `vpnLauncherRun.ts` change ±10 each;
  `extension.ts` and `storageManager.ts` are untouched (ratchet).
- Immutability: `readonly` on every field; frozen constants; no mutation of arguments; the only mutable stores are the
  `WeakMap`, the `WeakSet` and the `tracking` binding, each documented as such.
- Rule 3: `terminalActivity.ts` imports nothing from `vscode`; the texts live there so they are unit-tested.
- User-facing text is English; quotes and names as the texts in §S1.2, byte for byte (the tests match on them).

## S1.12 — Out of scope (do not touch)

`{name}` and `resolveCommand` (S2); `folderRun.ts`, the folder handler, `:runall`, menus (S3, S4); help in five languages,
README, CHANGELOG (S4); `sendPinned` / `pinnedTerminal` reuse (parent todo); `fresh` disposing by name (parent todo);
`dependencyRunHost.ts`; `isTransient`; any `executeCommand` use for typing; a close listener or a size cap on the
tracker (a `WeakMap` needs neither); stubbing VS Code's event ORDER and calling it integration (parent: not worth
having).

## S1.13 — Opus review checklist for the code

1. Between `findEntryTerminal` and `sendText` on the `none` and `finished` paths: no `await`, no `.then`, no event
   subscription. Read `sendGuarded` top to bottom and say so.
2. With `startGate !== undefined`, `sendGuarded` reaches `return` without any `await` on every path.
3. `noteSent` precedes `sendText` in `typed`, and nothing else calls `sendText` on an entry terminal.
4. `overrideSend` types into the parameter object; no second `findEntryTerminal`, no `vscode.window.terminals` read
   after the await.
5. The `running + start` cell is `poisoned`, and test 5(c) exists and passes.
6. `trackTerminalActivity` is idempotent, and is called from `registerRunCommands`, not from `extension.ts`.
7. `entryTerminal` and `defaultProfileTerminal` are gone; the default road now checks `exitStatus === undefined`.
8. The RED message of test 11 and the RED-again result (§S1.8 step 3) are in the coder's summary verbatim.
9. No existing test's expectations changed in `vpnWorld.ts`; created terminals are still not listed.
10. The texts in code equal §S1.2 byte for byte; the tests match on them.

## S1.14 — Decisions closed in this spec

| # | Decision | Why |
|---|---|---|
| D1 | `running + start → poisoned`, not `running(new)`. | Parent hand check 4; F6; §S1.2 explanation. A deviation from the parent's five-row table to record at promotion. |
| D2 | Overlap is enforced by a `WeakSet` of terminals with a question open, and proven by test 17. | The parent relies on the modal; a double click queues two invocations before any await resolves, and the second would ask after the first typed. Behaviour as the parent states; the mechanism made explicit. |
| D3 | The arrow's target is the terminal today's routing would pick (default: by name; pinned: by name and shell), now required live. "Any live terminal of the name, any shell" is the folder run's rule (S3), not the arrow's. | Minimal change to `entryTerminal`'s contract; the folder run opens NEW terminals and never reuses. |
| D4 | An override whose terminal closed meanwhile types nothing and does not open a new terminal. | The override authorises one send to that object; a new terminal would be a different action the person did not see. |
| D5 | The texts live in the pure module. | They are tested there; the host module composes nothing. |
| D6 | The guard is a module of its own (`terminalGuard.ts`), not part of `pinnedTerminal.ts`. | Two callers; `pinnedTerminal.ts` stays about which shell and which terminal, the guard about whether to type. |
