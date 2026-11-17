# PLAN — S2 spec: a bridge's key file goes when its ssh ends, and a start that fails ends (SECURITY, CORNERSTONE)

> Status: **IMPLEMENTED, 2026-11-17** (`f4a0b4c1` the move, `5cbce789` the fix; the spec amended 2026-11-16 for plan change 1.1; extension 1.22.2, #373). The cornerstone spec of the plan, and a security spec, written by Fable
> before its code (the rows *Cornerstone spec* and *Security judgement* of `subagent-models.md`). Story S2 of
> [PLAN_person_roads_forget_key.md](PLAN_person_roads_forget_key.md) (its §2.2, §2.4, §3 items 3, 4, 4a and 5, `## Stories` S2, and entry 1.1 of its `## Plan changes`).
> This file is promoted together with the parent.
>
> Scope: `src_vs_code/src` — `writtenKey.ts` (one more function), `commands/agentCommands.ts` (the handler of
> `credSshManager.openRemoteBridge`, from its resolve to its start), new `bridgeSpawner.ts`, `extension.ts` (the spawner leaves
> `activate`), `src_vs_code/.size-baseline.json`, and tests: new `test/bridgeKeyHandoff.test.ts`, new `test/bridgeSpawner.test.ts`,
> `test/writtenKey.test.ts` (five more tests). No document: the documents are S3. Branch `fix/n16-forget-person-keys`, on top of the
> two commits of S1. Each `file:line` below was read on `5d49cc9b`; S1 moves the lines of `commands/agentCommands.ts` (18 lines up
> for its imports, then down by the lines it adds), so find a place by its text. Fable writes this spec, a Sonnet coder builds it,
> Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above. "The S1 spec"
is [PLAN_person_roads_forget_key_S1_spec.md](PLAN_person_roads_forget_key_S1_spec.md); its names keep their meaning (K1 to K10, the
world of its §3, `forgetWrittenKey`, `withWrittenKey`, C, I, R, U1 to U3, M1 to M7). This document's own names: the facts L1 to L9,
the scenarios P1 to P12, B1 to B9, U4 to U8, the mutations N1 to N16, the break-its Y1 to Y11. This document keeps no change ledger:
a change of it is an entry in the parent (`plan-change-control.md`).

## What S2 builds, in one paragraph

*Open Remote Bridge…* writes the stored key to a file and starts one long-lived `ssh -R` that reads it. Today nobody deletes the
file: it stays until the window ends, also after the bridge has ended. S2 gives the file two owners, one after the other, with no
moment between them. From the answer of the resolve until the bridge is started, the COMMAND owns it and deletes it on every way
out that starts no bridge. From the statement that attaches one continuation to the started process's `exited`, the PROCESS owns
it: the file is deleted when that `ssh` has ended, whatever ended it. *Close* does not delete it; the end of the process does. That
only works when `exited` always settles, and today it does not: the real spawner builds `exited` from the child's `'exit'` alone,
and a child that cannot start emits `'error'` and no `'exit'`. So the same story moves the spawner out of `activate` into a module
that a test can drive, and makes `exited` settle on a failed start. The listener that does this takes the child's `'error'`
event, which was an uncaught exception of the extension host before; so the spawner hands every `'error'` to a reporter, and
`extension.ts` points the reporter at the diagnostic log (the parent's change 1.1). The two halves are built and proven together,
with a process whose end the test decides, and with two real processes.

| File | Change | Where |
|---|---|---|
| `bridgeSpawner.ts` (new) | first the move (commit c3): `bridgeProcessOf(child: BridgeChild): BridgeProcess` and `bridgeSpawner(parts?: BridgeSpawnerParts): BridgeSpawner`. Then (commit c4): `bridgeProcessOf(child: BridgeChild, report: BridgeErrorReport): BridgeProcess`, `bridgeSpawner(parts: BridgeSpawnerParts): BridgeSpawner` with a REQUIRED `parts.report`, and `describeBridgeError(error: Error): string`; `exited` settles on the `'error'` of a child with no `pid`, and every `'error'` goes to the reporter | §4 |
| `extension.ts` | c3: the import of `node:child_process` becomes the import of `./bridgeSpawner`; the first argument of `new SshBridgeManager(` becomes `bridgeSpawner()`. c4: that argument hands over the reporter, and the import names `describeBridgeError` too. 975 lines at both commits | §4.1, §4.2 |
| `src_vs_code/.size-baseline.json` | `"src/extension.ts"`: 981 → 975 (c3) | §4.1 |
| `writtenKey.ts` | appended: `withWrittenKeyUntilExit<T extends Started>(credential: ExecAuth, start: () => T \| undefined): T \| undefined` (c4) | §2 |
| `commands/agentCommands.ts` | the handler of `credSshManager.openRemoteBridge`, from the statement after its resolve to `bridges.start`; one import line (c4) | §3 |
| `test/bridgeSpawner.test.ts` (new) | 12 tests: P1 to P12 | §5.1 |
| `test/bridgeKeyHandoff.test.ts` (new) | 9 tests: B1 to B9 | §5.2 |
| `test/writtenKey.test.ts` | its first comment, and 5 more tests: U4 to U8 | §5.3 |

## Binding constraints

- **No plan change.** Build what the parent and this document say. If a step cannot be done as written, a code block here does not
  compile, or a test is not RED or GREEN as this document says: stop and tell the lead. Do not repair the parent or this document.
- **A RED proof is a failed assertion, never a compile error.** Read the exit of `tsc` before any test result. This is why the
  spawner is MOVED first, with no change of behaviour (step 1), and its tests are watched red on the moved text (step 2); why
  the test file reaches the two functions through two typed constants (§5.1), so that it compiles before the reporter exists; and
  why U4 to U8 and P12 (each calls a function that is new) are written together with it and are proven by mutations.
- **Keep what the runner printed.** Save each RED text in the scratchpad folder of the session and quote it in the commit body.
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): 800 lines per file, 50 code lines per function (120 in `src/test/`),
  complexity 4, also in tests. No new `eslint-disable`. `commands/agentCommands.ts` has **794 lines** after this story (787 after
  S1, +7: §3.3). `extension.ts` goes from 981 to **975** lines at c3 and still has 975 at c4; its baseline is lowered once (§4.1).
- **`sshBridgeManager.ts` does not change.** Not its rules (start, stop, dispose, `onEnded`), not its types. Nothing is attached to
  `onEnded`.
- **No `await` between the resolve and the start.** The function that `withWrittenKeyUntilExit` runs is synchronous, as the code
  between `:437` and `:463` is today. Do not make it `async` and do not move a dialog's `await` into it.
- **No sentence a person sees changes; no argv changes; the spawn options do not change** (`windowsHide: true`, `stdio: 'ignore'`,
  the environment that was resolved, the argv copied). No dialog moves out of `registerAgentCommands` or changes its order
  (`test/promptSiteLedger.ts:56-63`).
- **One behaviour changes on purpose** (the parent's §2.2): a bridge whose `ssh` cannot start now ENDS: the manager drops its row
  and calls `onEnded` (one log line, one refresh of the tree). Before, its row stayed *bridged* until the window ended.
- **One line of the diagnostic log is new** (the parent's change 1.1): `the ssh of a bridge did not start, or could not be stopped:
  <the text of the error>`, area `bridge`, level `warn`, once per `'error'` of a bridge's child. It holds the text of the error
  and nothing else of it: never the argv, never a key path. It is not a dialog, so the constraint above stands.
- **Files with no change:** `sshBridgeManager.ts`, `sshExecAuth.ts`, `keyInstaller.ts`, `materializedKeys.ts`, `sshBridge.ts`,
  `describeError.ts`, `diagnosticLog.ts`,
  `test/sshBridgeManager.test.ts`, `test/personRoadsWorld.ts`, `test/personRoadsForgetKey.test.ts`, `test/vscodeStub.ts`,
  `test/promptSiteLedger.ts`; `package.json`; every document.
- **Tests leave nothing outside an owned temp folder.** B9 writes one real file and P6 names one path that does not exist: both in
  a folder of `ownedDir` (`scripts/lib/leftovers.cjs`). P6 asks the real `child_process.spawn` for a program that is not there
  (nothing starts); P7 starts `node` once, and it exits at once. Each of the two has a timeout of 20 s. No test starts `ssh`.
- **Node only.** No Python, also not for a helper script. Write documents with the Edit or Write tool, not with a shell heredoc.

## Facts read on `5d49cc9b` that this spec uses

| # | Fact | Where |
|---|---|---|
| L1 | The handler of `credSshManager.openRemoteBridge` (`:394-484`): the row (`:395-400`); the key of the bridge (`:401`); an OPEN bridge asks *Keep it open* / *Close the bridge* and returns: it resolves nothing and starts nothing (`:403-413`); no host returns (`:415-421`); `await agentServer.share(…)` (`:424`); a token that cannot be parsed returns (`:425-428`); no storage folder returns (`:434-436`); `await resolveExecAuth(…)` with a click opener (`:437`); the warning (`:438-440`); not ok reports and returns (`:441-444`); `keyPath` (`:445`); the remote socket path (`:447`); the argv (`:448-452`); no argv warns and returns (`:453-458`); `bridges.start(…)` (`:463`); the refresh (`:464`); the detached socket check (`:471`); the instructions and the last message (`:476-483`). **Between `:437` and `:463` there is no `await`** | `commands/agentCommands.ts` |
| L2 | The replacement that the command CAN reach: between the open check (`:403`) and the start (`:463`) stand two `await`s (`:424`, and `:437`, which can hold a PIN dialog open). Two *Opens* of one entry that overlap both pass `:403` before either has started; the second `bridges.start` then replaces the first (L3). A second *Open* after the first has started does not replace: it asks (`:403-413`) | `commands/agentCommands.ts` |
| L3 | `SshBridgeManager.start` (`:65-79`): `this.stop(key)` first (`:66`), then the spawn (`:67`), the row (`:68`), and its own continuation on `exited`, which calls `onEnded` ONLY `if (this.open.get(key) === bridge)` (`:69-77`); it returns the `OpenBridge` `{ key, remotePath, process }` (`:78`, `:31-35`). `stop` deletes the row (`:86`) BEFORE it kills (`:87`); `dispose` stops every bridge (`:92-96`). So `onEnded` is not called for a bridge that was closed, replaced or disposed; the `exited` of its process still settles when the process ends. `BridgeProcess.exited`: "Resolves when the process ends, with its exit code when there was one" (`:19-23`) | `sshBridgeManager.ts` |
| L4 | *Close Remote Bridge* is `bridges.stop(key)` (`:383`), and so is *Close the bridge* of the quick pick (`:408`): a kill, not an end | `commands/agentCommands.ts` |
| L5 | The spawner stands inside `activate` (`:188-195`): `childProcess.spawn(command, [...args], { env, windowsHide: true, stdio: 'ignore' })` (`:190`), `kill: () => child.kill()` (`:192`), `exited` from `child.once('exit', …)` alone (`:193`); no `'error'` listener. `onEnded` there is a log line and `provider.refresh()` (`:196-202`). The import of `node:child_process` (`:81`) has no other user in the file. The file has 981 lines; its header exempts it from `max-lines` (`:1-4`); `.size-baseline.json` holds `"src/extension.ts": 981`; `npm run ratchet` (a CI step, `.github/workflows/ci-extension.yml:77-78`) fails when the file is larger than its baseline and asks for `npm run ratchet -- --update` when it is smaller. The diagnostic log is `log` (`:176`), and `onEnded` already writes `log.warn('bridge', …)` (`:197`). `extension.ts` does not import `describeError`. The window's dispose purges this window's key folder, synchronously (`:222-223`) | `extension.ts`, the baseline |
| L6 | Node: a child that cannot start (the program is not there, or may not be run) emits `'error'` on the next tick and no `'exit'`; its `pid` is `undefined`. An emitter with no `'error'` listener throws the error of the event. Seen for real in L9 (b): P6. The error object of a failed spawn carries the argv (`spawnargs`) and the program (`path`); its `message` is `spawn <program> ENOENT` and holds no argument (P6 reads a real one). `describeError` answers the `message` of an `Error` (`describeError.ts:10-12`) | Node, the run, `describeError.ts` |
| L7 | `forgetMaterializedKey` cannot throw (K2). `forgetWrittenKey` reads two fields of a plain object and calls it: it cannot throw either. So a continuation that only calls it cannot reject | `keyInstaller.ts`, `writtenKey.ts` |
| L8 | The world's `heldChild` (the S1 spec's §3): `kill()` only counts; `exited` settles when the test calls `end`, and never by itself. The manager's own fake settles `exited` inside `kill()` (`test/sshBridgeManager.test.ts:27-30`): with that fake, "Close deletes the file" and "the end of the process deletes the file" look the same. The world's `ended` list is the manager's `onEnded` | the tests |
| L9 | **Measured 2026-11-16** on copies of `src_vs_code` at `5d49cc9b` with S1 built, in a scratch folder (the copies were edited and compiled, not the repository; not kept). (a) Step 1 alone: compile and `eslint src` are clean; `extension.ts` has 975 lines; the ratchet says it shrank, and `--update` writes 975; `sshBridgeManager`, `sizeRatchet`, `bridgeAuthParity`, `bridgeBoundary`, `commandsRegistered` and `promptSites` are green. (b) `test/bridgeSpawner.test.ts` (without P12) on step 1: it compiles; P1, P3, P4, P6, P8, P9, P10, P11 red with the texts of §5.1; P2, P5, P7 green. (c) With §4.2 and P12: all 12 green; `extension.ts` still has 975 lines. (d) `test/bridgeKeyHandoff.test.ts` on that product: B1 to B7 and B9 red with the texts of §5.2; B8 green. (e) With §2 and §3: all 9 green, `test/writtenKey.test.ts` 8 green, `personRoadsForgetKey` still 14 green, `promptSites` and `launchRoadScan` green; `commands/agentCommands.ts` has 794 lines; `eslint src` is clean. (f) N1 to N16 turn red what §7 says; under N3 the 9 tests of `test/sshBridgeManager.test.ts` stay green. (g) The whole suite of the copy with S1 and S2 built, the reporter included (`node --test` over `out/test/*.test.js`): 7845 tests, 7785 pass, 37 skipped, 23 fail. Each of the 23 fails on a part of the repository that the copy does not have (`.github/workflows`, `install.sh`, `xunit.runner.json`, the `http` folder, the server's folders, git itself); none reads a file of this plan. No folder of the run was left in the temp root. The build runs the whole suite in the repository | the run |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.** A test result after a failed `tsc` is the result of old files.
2. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
3. `node $LP npm run typecheck`
4. `node $LP npm run lint`
5. `node $LP npm run ratchet` (it compiles first); `node $LP npm run ratchet -- --update` lowers the baseline to the measured size.
6. `npm test` — the full suite (it compiles first and lowers itself).

## 1. Who owns the key file, and when

| From | Until | The owner | What deletes the file |
|---|---|---|---|
| the answer of `resolveExecAuth` | the statement that attaches the continuation to the started process's `exited` | the command | the `finally` of `withWrittenKeyUntilExit`, at once, when no bridge was started or something threw |
| that statement | the end of the process | the process that reads the file | the continuation on its `exited`, once, when the process has ended |

Three rules make the handoff exact.

1. **One flag, set by the statement directly after the attach.** `handed` starts `false`. The attach is
   `void started.process.exited.then(forget, forget);` and the next statement is `handed = true;`. Nothing stands between them.
   An attach that throws leaves `handed` false, and the `finally` deletes. An attach that worked is followed only by an
   assignment, which cannot throw. So on every path exactly ONE of the two deletes is armed: never both, never neither.
2. **The continuation hangs on the process, not on the manager.** It is attached to `process.exited` of the `OpenBridge` that
   `bridges.start` returned. `onEnded` is not used: it is silent for a bridge that was closed, replaced or disposed (L3).
3. **The continuation cannot fail and cannot be lost.** Both halves of `then` are the same `forget`, so a rejected `exited`
   (outside the contract of `BridgeProcess`, L3) deletes too and leaves no unhandled rejection; `forget` cannot throw (L7).

## 2. The helper: one more function in `writtenKey.ts`

Appended to the file of S1, as it is:

```ts
/** What a started bridge hands back, as much as the handoff reads: its process, whose `exited` settles when the process has ended. */
interface Started {
  readonly process: { readonly exited: Promise<unknown> };
}

/**
 * Run `start` while the key file of `credential` is the caller's to delete, and hand the file to the process that `start` started.
 *
 * <ul>
 * <li>`start` returns a started thing: ONE continuation on its process's `exited` deletes the file when that process has ended,
 *     whatever ended it; nothing is deleted now.</li>
 * <li>`start` returns `undefined` (nothing was started): the file is deleted at once.</li>
 * <li>`start` throws: the file is deleted at once and the SAME error goes on to the caller.</li>
 * </ul>
 *
 * <p>`handed` is set by the statement directly after the one that attaches the continuation, with nothing between them: an attach
 * that throws leaves it false and the `finally` deletes; an attach that worked cannot be followed by a throw before the flag. So
 * exactly one of the two deletes runs, on every path. `start` is synchronous on purpose: no `await` stands between the start and
 * the attach.</p>
 */
export function withWrittenKeyUntilExit<T extends Started>(credential: ExecAuth, start: () => T | undefined): T | undefined {
  let handed = false;
  try {
    const started = start();
    if (started !== undefined) {
      const forget = (): void => forgetWrittenKey(credential);
      void started.process.exited.then(forget, forget);
      handed = true;
    }
    return started;
  } finally {
    if (!handed) {
      forgetWrittenKey(credential);
    }
  }
}
```

| `start` | The key file | The caller gets |
|---|---|---|
| returns a started thing | on the disk; deleted once when its `process.exited` settles (fulfilled or rejected) | the started thing |
| returns `undefined` | deleted at once | `undefined` |
| throws | deleted at once | the same error object |
| returns a thing whose `exited` cannot be read or has no `then` (a broken spawner) | deleted at once, by the `finally` (the attach threw before the flag) | the `TypeError` of the attach |
| any of these, for a credential with no `materialized` or a refusal | nothing is deleted, now or later | as above |

Complexity: 3 (the two `if`s). `forget` is a function of its own.

## 3. The command: the handler of `credSshManager.openRemoteBridge`

### 3.1 The import

```ts
import { withWrittenKey, withWrittenKeyUntilExit } from '../writtenKey';
```

### 3.2 From the resolve to the start

The text from the warning (`:438`) to `bridges.start(…)` (`:463`) moves, two spaces deeper, into the function that
`withWrittenKeyUntilExit` runs. Three things change inside it: the two `return;` become `return undefined;`, and
`bridges.start(…)` is RETURNED. After the call, the command leaves when nothing was started, and reads the remote path back
from the bridge, because the `remote` of the inner function is not in scope outside it. After the change:

```ts
    const credential = await resolveExecAuth(storage, accountId, details, storageDir, clickOpener(storage, accountId, 'connect'));
    // N16: the key file of this call is this command's to delete until the bridge's ssh holds it; then that ssh's end deletes it.
    const bridge = withWrittenKeyUntilExit(credential, () => {
      if (credential.warning !== undefined) {
        void vscode.window.showWarningMessage(credential.warning);
      }
      if (!credential.ok) {
        void vscode.window.showErrorMessage(`Cannot bridge to "${node.name}": ${credential.message}`);
        return undefined;
      }
      const keyPath = credential.keyPath;

      const remote = { path: remoteSocketPath(details.user ?? '', bridgeId(() => crypto.randomUUID())) };
      const argv = buildBridgeArgv(
        details,
        { port: parsed.port, remote, keyPath, auth: credential.auth },
        isSafeSshTarget,
      );
      if (argv === undefined) {
        void vscode.window.showWarningMessage(
          `"${node.name}" cannot be bridged: its host is not a shape ssh can be given safely.`,
        );
        return undefined;
      }

      // The RESOLVED environment, not the parent’s: a password entity carries its answer in
      // SSH_ASKPASS, and spawning with process.env would drop exactly the thing that lets this
      // connection authenticate at all.
      return bridges.start(key, remote.path, 'ssh', argv, credential.env);
    });
    if (bridge === undefined) {
      return;
    }
    const remote = { path: bridge.remotePath };
    provider.refresh();
```

Everything after `provider.refresh();` stays as it is (the socket check, the instructions, the last message): it uses `remote`,
which holds the same path as before (`start` keeps the path it was given, L3).

### 3.3 The line count

787 lines after S1. This story adds 7: the comment (+1), the line that opens the call (+1), `});` (+1), the three lines of
`if (bridge === undefined) { return; }` (+3), `const remote = { path: bridge.remotePath };` (+1). The import line changes and
adds none. **794 lines.** Read the diff with `git diff -w`.

### 3.4 Every way out of the command

| Way out | The key file written for the bridge |
|---|---|
| no row; the bridge is already open (*Keep it open*, *Close the bridge*, the pick dismissed); no host; `share` rejects; the token cannot be parsed; no storage folder | none was written: all of these are before the resolve |
| the resolve answers a refusal | none was written; the error is shown as before; nothing is deleted |
| the resolve answers the person's own key file or a password | none was written; the bridge starts as before; nothing is deleted, at the start or at the end |
| a dialog call, the socket path or the argv throws | deleted at once; the same error goes on to the caller of the command |
| no argv | the warning as before; deleted at once |
| `bridges.start` throws (the spawner threw, or the stop of an earlier bridge threw) | deleted at once; the same error goes on. An earlier bridge that this start had already stopped keeps its own continuation |
| `bridges.start` returns | on the disk; the process owns it from the attach on. What the command does after (the refresh, the socket check, the message) no longer touches it, also when one of them throws |
| later: the `ssh` ends by itself; *Close*; a replacement; the window's `dispose`; a start that failed (§4.2) | deleted once, when `exited` settles. After *Close*, a replacement and `dispose` that is when the killed process has ended, not when it was killed |
| the window is killed | not deleted by this code: the purge of the parent's §2.4 retires it |

## 4. The spawner

### 4.1 Step 1 — the move (no change of behaviour)

New `bridgeSpawner.ts`, the whole file at this step. It is what `activate` did, word for word, behind two names: `bridgeProcessOf`
(a child becomes a `BridgeProcess`) and `bridgeSpawner` (the `BridgeSpawner` of the manager, over `child_process.spawn` or a test's
stand-in). `bridgeSpawner` takes its parts as one object; at this step the object holds only the optional `spawn`, so the call
in `activate` is `bridgeSpawner()`.

```ts
import * as childProcess from 'node:child_process';
import type { BridgeProcess, BridgeSpawner } from './sshBridgeManager';

/**
 * How this window starts the `ssh` of a bridge. It stood inside `activate` (`extension.ts`); it is a module of its own so that a
 * test can hand it a child (N16).
 */

/** As much of a child process as a bridge reads. A `ChildProcess` is one; a test hands in an `EventEmitter`. */
export interface BridgeChild {
  kill(): boolean;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
}

/** How a child is started: `child_process.spawn`, or a test's stand-in. */
export type ChildSpawn = (command: string, args: string[], options: childProcess.SpawnOptions) => BridgeChild;

/** What a spawner is made of. */
export interface BridgeSpawnerParts {
  /** Default: `child_process.spawn`. */
  readonly spawn?: ChildSpawn;
}

/** The `BridgeProcess` of a child: `exited` settles with the code of its `'exit'`. */
export function bridgeProcessOf(child: BridgeChild): BridgeProcess {
  return {
    kill: () => child.kill(),
    exited: new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code))),
  };
}

/** The spawner of `SshBridgeManager`: the argv copied, the environment it is given, no window on Windows, no stdio. */
export function bridgeSpawner(parts: BridgeSpawnerParts = {}): BridgeSpawner {
  const spawn = parts.spawn ?? childProcess.spawn;
  return (command, args, env) => bridgeProcessOf(spawn(command, [...args], { env, windowsHide: true, stdio: 'ignore' }));
}
```

In `extension.ts`: the import of `node:child_process` (`:81`) is replaced, in its place, by

```ts
import { bridgeSpawner } from './bridgeSpawner';
```

and the first argument of `new SshBridgeManager(` (`:189-195`, seven lines) becomes one line:

```ts
  const bridges = new SshBridgeManager(
    bridgeSpawner(),
    (key, code) => {
```

The comment above it and `onEnded` stay. The file then has 975 lines. Run `node $LP npm run ratchet -- --update`:
`.size-baseline.json` then says `"src/extension.ts": 975` and nothing else in it changes. Typecheck, lint, the ratchet and the
whole suite are green with this step alone; it is its own commit (§6).

### 4.2 The fix — `exited` settles on a start that failed, and every `'error'` is reported

`bridgeSpawner.ts` after the fix, the whole file. `BridgeChild` gets `pid` and `on('error')`; `bridgeProcessOf` listens, settles
`exited` for a child that never started, and hands EVERY `'error'` to `report`; `describeBridgeError` is the log line.

```ts
import * as childProcess from 'node:child_process';
import { describeError } from './describeError';
import type { BridgeProcess, BridgeSpawner } from './sshBridgeManager';

/**
 * How this window starts the `ssh` of a bridge. It stood inside `activate` (`extension.ts`); it is a module of its own so that a
 * test can hand it a child (N16).
 *
 * <p><b>`exited` always settles.</b> The row of a bridge leaves the tree, and the key file written for the bridge is deleted, when
 * `exited` settles (`sshBridgeManager.ts`, `writtenKey.ts`). A child that cannot start (`ssh` is not found) emits `'error'` and no
 * `'exit'`, so `exited` settles on that `'error'` too. And with no `'error'` listener Node throws the event in the extension
 * host.</p>
 *
 * <p><b>Every `'error'` is reported.</b> The listener takes the event, so nothing else would ever say why a bridge did not start,
 * or that a kill failed. The reporter is not optional: a spawner that is made without one does not compile.</p>
 */

/** As much of a child process as a bridge reads. A `ChildProcess` is one; a test hands in an `EventEmitter` with a `pid`. */
export interface BridgeChild {
  /** Absent when the child never started. */
  readonly pid?: number;
  kill(): boolean;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
  /** `on`, not `once`: every `'error'` of the child needs a listener, for as long as the child lives. */
  on(event: 'error', listener: (error: Error) => void): unknown;
}

/** How a child is started: `child_process.spawn`, or a test's stand-in. */
export type ChildSpawn = (command: string, args: string[], options: childProcess.SpawnOptions) => BridgeChild;

/** Told every `'error'` of a bridge's child: one that never started, and one that started (a kill that failed). */
export type BridgeErrorReport = (error: Error) => void;

/** What a spawner is made of. */
export interface BridgeSpawnerParts {
  readonly report: BridgeErrorReport;
  /** Default: `child_process.spawn`. */
  readonly spawn?: ChildSpawn;
}

/**
 * The line of the diagnostic log for an `'error'` of a bridge's child. Only the text of the error: Node's error object also holds
 * the argv (`spawnargs`), and the argv of a bridge names its key file.
 */
export function describeBridgeError(error: Error): string {
  return `the ssh of a bridge did not start, or could not be stopped: ${describeError(error)}`;
}

/**
 * The `BridgeProcess` of a child. `exited` settles ONCE, with the first of: the code of its `'exit'`; `null` on an `'error'` while
 * the child has no `pid` (it never started). An `'error'` of a STARTED child (Node emits one when a kill fails) settles nothing:
 * its `ssh` may still run and read its key file, and its `'exit'` settles `exited` later. Every `'error'` goes to `report`, AFTER
 * the settle, so that a reporter that throws cannot keep `exited` from settling.
 */
export function bridgeProcessOf(child: BridgeChild, report: BridgeErrorReport): BridgeProcess {
  return {
    kill: () => child.kill(),
    exited: new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code));
      child.on('error', (error) => {
        if (child.pid === undefined) {
          resolve(null);
        }
        report(error);
      });
    }),
  };
}

/** The spawner of `SshBridgeManager`: the argv copied, the environment it is given, no window on Windows, no stdio. */
export function bridgeSpawner(parts: BridgeSpawnerParts): BridgeSpawner {
  const spawn = parts.spawn ?? childProcess.spawn;
  return (command, args, env) => bridgeProcessOf(spawn(command, [...args], { env, windowsHide: true, stdio: 'ignore' }), parts.report);
}
```

In `extension.ts`, two lines change again and none is added (975 lines). The import:

```ts
import { bridgeSpawner, describeBridgeError } from './bridgeSpawner';
```

and the first argument of `new SshBridgeManager(`, on one line:

```ts
  const bridges = new SshBridgeManager(
    bridgeSpawner({ report: (error) => log.warn('bridge', describeBridgeError(error)) }),
    (key, code) => {
```

| The child | `exited` | The reporter |
|---|---|---|
| emits `'exit'` with a code or `null` | settles with it | not called |
| never started (no `pid`) and emits `'error'` | settles with `null`. The manager then drops the row and calls `onEnded(key, null)`; the key file's continuation runs | called with the error, after the settle. The log then holds the cause (`… : spawn ssh ENOENT`) and, from `onEnded`, `<key> ended (null)` |
| emits `'error'` and then `'exit'`, or `'exit'` and then `'error'` | settled once, with the first; the second changes nothing and throws nothing | called once per `'error'` |
| STARTED (it has a `pid`) and emits `'error'`, once or more often | not settled: its `ssh` may still run. Its `'exit'` settles `exited` later | called with each error, in order |
| `spawn` itself throws | no child: `bridges.start` throws, and §3.4 deletes the key file at once | not called: the command's caller gets the error, as before |
| the reporter throws | settled all the same: the settle is the statement before the report | its error comes out of the child's emit, as any listener's does; for a STARTED child that emit is inside `child.kill()`, so the throw leaves `stop()`/`dispose()` halfway — the reporter must not throw (documented on `BridgeErrorReport`, the lead's Opus review of S2) |

**Why the reporter is required, and why the parts are one object.** An optional reporter with a silent default is the dropped
error again, one forgotten argument away; with a required one, a spawner that reports to nobody does not compile, and the one
call of the product has to say where the errors go (P8 reads that call). The parts are one object, not two positions, for two
reasons: `spawn` keeps its default without an `undefined` in the product's call, and the test file compiles against the moved
text of step 1 (a function that takes `{ spawn? }` accepts `{ report, spawn? }`), so its tests are red there by their assertions.
`bridgeProcessOf` takes the reporter as its second argument, also required.

**Why the log line is a function of this module.** `describeBridgeError` is one sentence around `describeError(error)`. As a
function it has a test of its own (P12: the argv that rides on Node's error object does not reach the line), and `extension.ts`
needs no new import line. The sentence names both cases, because the reporter is told an error and not which of the two it was:
a child that never started, or a started child whose kill failed.

**What the reporter does not change** (the parent's §2.4, narrowed by change 1.1): a started child whose kill fails and that
never exits keeps its key file. `stop()` has dropped its row before the kill (L3), so `dispose` cannot try again, and no retry is
built. The file goes with the synchronous purge on the window's dispose (`extension.ts:222-223`) or at the next activation, best
effort. What is new is that the failed kill is in the log.

`bridgeProcessOf` has complexity 2, `bridgeSpawner` 2, `describeBridgeError` 1. The `'error'` listener is registered with `on`: a
second `'error'` of the same child must find a listener too (P4, P10), and the interface names `on` for it so that `once` does not
compile.

## 5. Scenarios

Each row is one test. "RED" is the text in the state the row names. A guard is green before and after; a mutation of §7 proves it.

### 5.1 New `test/bridgeSpawner.test.ts` — RED on step 1 (§4.1), GREEN with §4.2

The file reaches the two functions through two constants that are typed as the functions are AFTER the fix (`processOf`,
`spawnerOf`). On the moved text of step 1 neither function knows a reporter; a function that takes less is still assignable to
these types, so the file compiles there and every RED below is an assertion (P6 excepted, see its row). P9, P10 and P11 give their
fake child a listener of the test's own on `'error'`, so that an emit never throws and the first assertion that fails is the
one about the reporter.

| Id | Setup | Expected | RED on step 1 |
|---|---|---|---|
| P1 | a child with no `pid` emits `'error'` | the emit does not throw; `exited` is settled with `null` | `Got unwanted exception: P1: the error event of a child that never started has no listener` — `Actual message: "spawn ssh ENOENT"` |
| P2 (guard) | a child emits `'exit'` 255 | `exited` is settled with 255 | green |
| P3 | one child emits `'error'` then `'exit'` 7; another `'exit'` 7 then `'error'` | `null` for the first, 7 for the second; no emit throws | `Got unwanted exception: P3: the error event has no listener` |
| P4 | a child WITH a `pid` emits `'error'` twice, then `'exit'` 0 | no emit throws; `exited` is still pending after the errors; then 0 | `Got unwanted exception: P4: the error event of a started child has no listener` — `Actual message: "kill EPERM"` |
| P5 (guard) | `bridgeSpawner` over a recording stand-in | the command, a COPY of the argv, and exactly `{ env, windowsHide: true, stdio: 'ignore' }`; `kill()` reaches the child | green (it guards the move) |
| P6 | the REAL spawner and the real manager start a program that does not exist (a path in an owned folder), with `-i <a key path>` in its argv | `exited` settles with `null`; the row is gone; `onEnded` was called once with `null`; ONE error was reported, its text holds `ENOENT` and does not hold the key path | the uncaught error of the real child, which the runner gives to the test: `Error: spawn <path>/no-such-ssh ENOENT`. This is the second fault of the parent's §1, seen for real; it is not an assertion text |
| P7 (guard) | the REAL spawner starts `node -e "process.exit(3)"` | `exited` settles with 3; nothing was reported | green |
| P8 | the source of `extension.ts` | exactly one `new SshBridgeManager(`; its first argument is `bridgeSpawner({ report: (error) => log.warn('bridge', describeBridgeError(error)) })`; the file does not name `node:child_process` | `P8: the bridges of the window are not started by bridgeSpawner with a reporter that writes describeBridgeError(error) to the bridge log` (at step 1 the call is `bridgeSpawner()`) |
| P9 | a child with no `pid` emits one `'error'` | the reporter got that error, the same object, once; `exited` is settled with `null` | `P9: the error of a child that never started was not reported` — `[]` is not `[Error: spawn ssh ENOENT]` |
| P10 | a child WITH a `pid` emits two different errors | the reporter got both, in order; `exited` is still pending | `P10: an error of a started child was not reported` — `[]` is not the two errors |
| P11 | a child with no `pid` emits `'error'`; the reporter throws | `exited` is settled with `null` all the same | `P11: exited did not settle after a failed start whose reporter throws` |
| P12 (written at step 3) | an error as Node makes it for a failed spawn, with `spawnargs` that name a key file | the line is exactly `the ssh of a bridge did not start, or could not be stopped: spawn ssh ENOENT`; the key path is not in it | none: it imports `describeBridgeError`, which does not exist before step 3. N16 proves it |

At step 2 the file is the text below WITHOUT its second import line (`describeBridgeError`) and WITHOUT P12; step 3 adds both.

The whole file, as measured:

```ts
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { BridgeChild, ChildSpawn, bridgeProcessOf, bridgeSpawner } from '../bridgeSpawner';
import { describeBridgeError } from '../bridgeSpawner';
import { BridgeProcess, BridgeSpawner, SshBridgeManager } from '../sshBridgeManager';

/**
 * The real spawner of a bridge (N16): `exited` always settles, and every `'error'` of the child is reported. A bridge's key file is
 * deleted when `exited` settles, and the row of a bridge leaves the tree when it does, so a start that fails must settle it too.
 */

const scope = cleanupScope();
after(() => scope.close());

type Report = (error: Error) => void;

/**
 * The two functions under test, typed as they are AFTER the fix. On the moved text (step 1) neither knows a reporter; a function
 * that takes less is still one of these, so this file compiles there too and its tests fail by their assertions.
 */
const processOf: (child: BridgeChild, report: Report) => BridgeProcess = bridgeProcessOf;
const spawnerOf: (parts: { report: Report; spawn?: ChildSpawn }) => BridgeSpawner = bridgeSpawner;

/** A child the test drives: an `EventEmitter` with a `pid` (absent when it never started). */
class FakeChild extends EventEmitter implements BridgeChild {
  kills = 0;
  constructor(readonly pid?: number) {
    super();
  }
  kill(): boolean {
    this.kills += 1;
    return true;
  }
}

/** A child with a listener of the TEST on `'error'`, so that an emit never throws: for the tests that ask what was reported. */
function heardChild(pid?: number): FakeChild {
  const child = new FakeChild(pid);
  child.on('error', () => undefined);
  return child;
}

const quiet: Report = () => undefined;
const PENDING = 'pending';

/** What `exited` settled with, or `pending` when it has not settled after every ready callback ran. */
async function stateOf(exited: Promise<number | null>): Promise<number | null | typeof PENDING> {
  const turns = async (): Promise<typeof PENDING> => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    return PENDING;
  };
  return Promise.race([exited, turns()]);
}

const enoent = (): Error => Object.assign(new Error('spawn ssh ENOENT'), { code: 'ENOENT' });

test('P1: a child that never started settles exited with null on its error event', async () => {
  const child = new FakeChild();
  const bridge = processOf(child, quiet);

  assert.doesNotThrow(() => child.emit('error', enoent()), 'P1: the error event of a child that never started has no listener');
  assert.equal(await stateOf(bridge.exited), null, 'P1: exited did not settle after a failed start');
});

test('P2: a child that exits settles exited with its code', async () => {
  const child = new FakeChild(4321);
  const bridge = processOf(child, quiet);

  child.emit('exit', 255, null);

  assert.equal(await stateOf(bridge.exited), 255);
});

test('P3: a child that emits both settles once, with the first', async () => {
  const failedFirst = new FakeChild();
  const a = processOf(failedFirst, quiet);
  assert.doesNotThrow(() => failedFirst.emit('error', enoent()), 'P3: the error event has no listener');
  failedFirst.emit('exit', 7, null);
  assert.equal(await stateOf(a.exited), null, 'P3: the later exit replaced the first settlement');

  const exitedFirst = new FakeChild();
  const b = processOf(exitedFirst, quiet);
  exitedFirst.emit('exit', 7, null);
  assert.doesNotThrow(() => exitedFirst.emit('error', enoent()), 'P3: an error after the exit has no listener');
  assert.equal(await stateOf(b.exited), 7);
});

test('P4: the error of a STARTED child settles nothing, and its later exit settles exited with its code', async () => {
  const child = new FakeChild(4321);
  const bridge = processOf(child, quiet);

  assert.doesNotThrow(() => child.emit('error', new Error('kill EPERM')), 'P4: the error event of a started child has no listener');
  assert.doesNotThrow(() => child.emit('error', new Error('kill EPERM')), 'P4: a second error event has no listener');
  assert.equal(await stateOf(bridge.exited), PENDING, 'P4: the error of a started child settled exited, and its ssh may still run');

  child.emit('exit', 0, null);
  assert.equal(await stateOf(bridge.exited), 0);
});

test('P5: the spawner starts the child as before: the argv copied, the given environment, hidden, no stdio', () => {
  const calls: { command: string; args: string[]; options: unknown }[] = [];
  const child = new FakeChild(1);
  const env = { PATH: '/usr/bin', SSH_ASKPASS: '/storage/askpass.sh' };
  const argv = ['-N', '-R', '/tmp/s.sock:127.0.0.1:5', '--', 'dev@host'];
  const spawn = spawnerOf({ report: quiet, spawn: (command, args, options) => (calls.push({ command, args, options }), child) });

  const bridge = spawn('ssh', argv, env);
  bridge.kill();

  assert.deepEqual(calls, [{ command: 'ssh', args: argv, options: { env, windowsHide: true, stdio: 'ignore' } }]);
  assert.notEqual(calls[0].args, argv, 'the argv was handed over, not copied');
  assert.equal(child.kills, 1);
});

test('P6: a REAL program that does not exist ends its bridge: exited settles with null, the row goes, and the cause is reported', { timeout: 20_000 }, async () => {
  const missing = path.join(ownedDir(scope, 'nossh'), 'no-such-ssh');
  const ended: [string, number | null][] = [];
  const reported: Error[] = [];
  const manager = new SshBridgeManager(spawnerOf({ report: (error) => void reported.push(error) }), (key, code) => void ended.push([key, code]));

  const bridge = manager.start('a1:e1', '/tmp/s.sock', missing, ['-N', '-i', '/storage/keys/1/call-real.key'], { ...process.env });

  assert.equal(await bridge.process.exited, null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.isOpen('a1:e1'), false, 'P6: the row of a bridge whose ssh never started is still open');
  assert.deepEqual(ended, [['a1:e1', null]]);
  assert.equal(reported.length, 1, 'P6: the cause of the failed start was not reported once');
  assert.match(reported[0].message, /ENOENT/);
  assert.doesNotMatch(reported[0].message, /call-real\.key/, 'P6: the text of a real spawn error names the key file');
});

test('P7: a REAL program that runs and ends settles exited with its code, and reports nothing', { timeout: 20_000 }, async () => {
  const reported: Error[] = [];
  const bridge = spawnerOf({ report: (error) => void reported.push(error) })(process.execPath, ['-e', 'process.exit(3)'], { ...process.env });

  assert.equal(await bridge.exited, 3);
  assert.deepEqual(reported, []);
});

test('P8: the window starts its bridges with this spawner and sends their errors to the log, and extension.ts spawns nothing by itself', () => {
  // The tests above prove the spawner; this one proves that the window USES it. Read from the source, as the other wiring scans do.
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');
  const managers = source.match(/new SshBridgeManager\(/g) ?? [];

  assert.equal(managers.length, 1, 'the scan no longer finds the one place where the bridges are made');
  assert.match(
    source,
    /new SshBridgeManager\(\s*bridgeSpawner\(\{ report: \(error\) => log\.warn\('bridge', describeBridgeError\(error\)\) \}\),/,
    'P8: the bridges of the window are not started by bridgeSpawner with a reporter that writes describeBridgeError(error) to the bridge log',
  );
  assert.doesNotMatch(source, /node:child_process/, 'P8: extension.ts starts a process by itself again');
});

test('P9: the error of a child that never started is reported, the same object, and exited settles with null', async () => {
  const reported: Error[] = [];
  const child = heardChild();
  const bridge = processOf(child, (error) => void reported.push(error));
  const failure = enoent();

  child.emit('error', failure);

  assert.deepEqual(reported, [failure], 'P9: the error of a child that never started was not reported');
  assert.equal(reported[0], failure);
  assert.equal(await stateOf(bridge.exited), null, 'P9: exited did not settle after a failed start');
});

test('P10: every error of a STARTED child is reported, and none of them settles exited', async () => {
  const reported: Error[] = [];
  const child = heardChild(4321);
  const bridge = processOf(child, (error) => void reported.push(error));
  const first = new Error('kill EPERM');
  const second = new Error('kill ESRCH');

  child.emit('error', first);
  child.emit('error', second);

  assert.deepEqual(reported, [first, second], 'P10: an error of a started child was not reported');
  assert.equal(await stateOf(bridge.exited), PENDING, 'P10: the error of a started child settled exited, and its ssh may still run');
});

test('P11: a reporter that throws does not keep exited from settling', async () => {
  const child = heardChild();
  const bridge = processOf(child, () => {
    throw new Error('the log is closed');
  });

  try {
    child.emit('error', enoent());
  } catch {
    // The reporter's own failure comes out of the emit; what this test asks is below.
  }

  assert.equal(await stateOf(bridge.exited), null, 'P11: exited did not settle after a failed start whose reporter throws');
});

test('P12: the log line of a bridge error is the text of the error behind one sentence, and never the argv', () => {
  // As Node makes the error of a spawn that failed: the argv rides on the object, and the argv of a bridge names its key file.
  const failure = Object.assign(new Error('spawn ssh ENOENT'), { code: 'ENOENT', path: 'ssh', spawnargs: ['-N', '-i', '/storage/keys/1/call-real.key', 'dev@host'] });

  const line = describeBridgeError(failure);

  assert.equal(line, 'the ssh of a bridge did not start, or could not be stopped: spawn ssh ENOENT');
  assert.doesNotMatch(line, /call-real\.key/);
});
```

### 5.2 New `test/bridgeKeyHandoff.test.ts` — RED before §2 and §3, GREEN with them

The world is the S1 spec's. Every bridge is a `heldChild`: it ends only when the test says so (L8). `FIRST` is
`/storage/keys/1/call-first.key`, `SECOND` is `/storage/keys/1/call-second.key`; the socket checks of these tests get no
credential, so `forgotten` holds only what the bridge's road deletes.

| Id | Setup and action | Expected | RED before §2 and §3 |
|---|---|---|---|
| B1 | *Open*; then the test ends the process with 255 | after *Open*: one bridge, open, `forgotten` is `[]`. After the end: `onEnded` once, `forgotten` is `[FIRST]` | `B1: the bridge ended and its key file stays` — `[]` is not `['/storage/keys/1/call-first.key']` |
| B2 | *Open*; *Close Remote Bridge*; then the test ends the process | after *Close*: killed once, the row gone, `forgotten` is `[]`. After the end: `onEnded` was NOT called, `forgotten` is `[FIRST]` | `B2: the closed bridge ended and its key file stays` |
| B3 | *Open*; *Open* again answering *Keep it open*; *Open* again answering *Close the bridge*; then the end | the second *Open* asks once, starts nothing, kills nothing, deletes nothing; the third kills and deletes nothing; after the end `forgotten` is `[FIRST]` | `B3: the closed bridge ended and its key file stays` |
| B4 | two *Opens* of one entry held at the resolve by a gate, then released: the second start replaces the first (L2). Then the test ends the FIRST process; then `dispose` and the end of the second | after both: two bridges, the first killed once, `forgotten` is `[]`. After the first's end: `onEnded` not called, `forgotten` is `[FIRST]`, the replacement still open. After the second's end: `[FIRST, SECOND]` | `B4: the replaced bridge ended and its key file stays, or the live bridge lost its file` |
| B5 | the host is `-oProxyCommand=evil`, so the real `buildBridgeArgv` answers none | no bridge; the *cannot be bridged* warning; `forgotten` is `[FIRST]` at once | `B5: no bridge was started and the key file stays` |
| B6 | `buildBridgeArgv` throws (the real `../sshBridge` with that one function replaced) | the command rejects with the SAME error object; no bridge; `forgotten` is `[FIRST]` | `B6: the command failed and the key file stays` |
| B7 | the spawner throws | the command rejects with the SAME error object; no row; `forgotten` is `[FIRST]` | `B7: the start failed and the key file stays` |
| B8 (guard) | the bridge's key is the person's own file; *Open*; the end | `onEnded` once; `forgotten` is `[]` | green |
| B9 | a REAL file in an owned folder is the bridge's written key; the real `forgetMaterializedKey`; *Open*; *Close*; the end | on the disk after *Close*; not on the disk after the end | `B9: the key file of the ended bridge is still on the disk` |

In every RED above the earlier assertions of the test pass on the unchanged product: the bridge was started, killed, replaced, as
the row says. B2 and B4 assert that `onEnded` was NOT called when the file was deleted: a delete that hung on `onEnded` could not
have happened there.

The whole file, as measured:

```ts
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import * as realBridge from '../sshBridge';
import { KEY, Parts, World, click, ownKeyFile, settled, world, writtenKey } from './personRoadsWorld';

/**
 * N16, the bridge: the key file that *Open Remote Bridge…* wrote belongs to the command until the bridge's `ssh` holds it, and is
 * deleted when THAT `ssh` ends: not when the command returns, not when *Close* is pressed, and not when another bridge ends.
 */

const scope = cleanupScope();
after(() => scope.close());

const FIRST = '/storage/keys/1/call-first.key';
const SECOND = '/storage/keys/1/call-second.key';

async function opened(parts: Parts = {}): Promise<World> {
  const w = world({ clicks: [writtenKey(FIRST), writtenKey(SECOND)], ...parts });
  await click(w, 'openRemoteBridge');
  await settled();
  return w;
}

test('B1: an open bridge keeps its key file; the file is deleted once, when its ssh ends by itself', async () => {
  const w = await opened();

  assert.equal(w.children.length, 1, 'no bridge was started');
  assert.equal(w.bridges.isOpen(KEY), true);
  assert.deepEqual(w.forgotten, [], 'B1: the key file was deleted while the ssh that reads it runs');

  w.children[0].end(255);
  await settled();

  assert.deepEqual(w.ended, [KEY], 'the manager was not told the bridge ended');
  assert.deepEqual(w.forgotten, [FIRST], 'B1: the bridge ended and its key file stays');
});

test('B2: Close kills the ssh and deletes nothing; the key file is deleted when the ssh has ended', async () => {
  const w = await opened();

  await click(w, 'closeRemoteBridge');
  await settled();

  assert.equal(w.children[0].killed, 1, 'Close did not kill the ssh');
  assert.equal(w.bridges.isOpen(KEY), false);
  assert.deepEqual(w.forgotten, [], 'B2: Close deleted the key file of an ssh that has not ended');

  w.children[0].end(null);
  await settled();

  assert.deepEqual(w.ended, [], 'B2 stands on this: the manager reports no end for a bridge that was closed');
  assert.deepEqual(w.forgotten, [FIRST], 'B2: the closed bridge ended and its key file stays');
});

test('B3: a second Open of an open bridge asks Keep or Close and starts nothing; Keep deletes nothing, Close there works as Close', async () => {
  let pick = 'Keep it open';
  const w = await opened({ answer: (message) => (/is bridged at/.test(message) ? pick : undefined) });
  const asked = (): number => w.asked.filter((one) => /is bridged at/.test(one.message)).length;

  await click(w, 'openRemoteBridge');
  await settled();

  assert.equal(asked(), 1, 'the second Open did not ask');
  assert.equal(w.children.length, 1, 'the second Open started a bridge');
  assert.equal(w.children[0].killed, 0, 'Keep closed the bridge');
  assert.deepEqual(w.forgotten, [], 'B3: Keep deleted the key file of a live bridge');

  pick = 'Close the bridge';
  await click(w, 'openRemoteBridge');
  await settled();

  assert.equal(w.children.length, 1, 'the third Open started a bridge');
  assert.equal(w.children[0].killed, 1, 'Close did not kill the ssh');
  assert.deepEqual(w.forgotten, [], 'B3: Close deleted the key file of an ssh that has not ended');

  w.children[0].end(null);
  await settled();

  assert.deepEqual(w.forgotten, [FIRST], 'B3: the closed bridge ended and its key file stays');
});

test('B4: a bridge that REPLACES another: the first key file goes when the first ssh ends, the second stays with its bridge', async () => {
  // Two Opens of one entry that overlap: both pass the open check before either has started, so the second start replaces the first.
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const w = world({ clicks: [writtenKey(FIRST), writtenKey(SECOND)], resolveGate: gate });
  const both = [click(w, 'openRemoteBridge'), click(w, 'openRemoteBridge')];
  await settled();
  assert.equal(w.children.length, 0, 'a bridge started before its credential was resolved');

  release();
  await Promise.all(both);
  await settled();

  assert.equal(w.children.length, 2, 'the two Opens did not start two bridges');
  assert.equal(w.children[0].killed, 1, 'the second start did not replace the first');
  assert.deepEqual(w.forgotten, [], 'B4: a key file was deleted while its ssh has not ended');

  w.children[0].end(null);
  await settled();

  assert.deepEqual(w.ended, [], 'B4 stands on this: the manager reports no end for a bridge that was replaced');
  assert.deepEqual(w.forgotten, [FIRST], 'B4: the replaced bridge ended and its key file stays, or the live bridge lost its file');
  assert.equal(w.bridges.isOpen(KEY), true, 'the replacement is not open');

  w.bridges.dispose();
  w.children[1].end(null);
  await settled();

  assert.deepEqual(w.forgotten, [FIRST, SECOND], 'B4: the window ended and the second key file stays');
});

test('B5: a host that gives no argv starts nothing, and the key file is deleted at once', async () => {
  const w = await opened({ host: '-oProxyCommand=evil' });

  assert.equal(w.children.length, 0);
  assert.match(w.warnings.at(-1) ?? '', /cannot be bridged/);
  assert.deepEqual(w.forgotten, [FIRST], 'B5: no bridge was started and the key file stays');
});

test('B6: a throw while the argv is built deletes the key file, and the same error reaches the caller', async () => {
  const failure = new Error('the argv could not be built');
  const throwing = { ...realBridge, buildBridgeArgv: (): never => { throw failure; } };
  const w = world({ clicks: [writtenKey(FIRST)], mocks: { '../sshBridge': throwing } });

  await assert.rejects(click(w, 'openRemoteBridge'), (error) => error === failure);
  assert.equal(w.children.length, 0);
  assert.deepEqual(w.forgotten, [FIRST], 'B6: the command failed and the key file stays');
});

test('B7: a start that throws deletes the key file, and the same error reaches the caller', async () => {
  const failure = new Error('spawn EACCES');
  const w = world({ clicks: [writtenKey(FIRST)], spawn: () => { throw failure; } });

  await assert.rejects(click(w, 'openRemoteBridge'), (error) => error === failure);
  assert.equal(w.bridges.isOpen(KEY), false);
  assert.deepEqual(w.forgotten, [FIRST], 'B7: the start failed and the key file stays');
});

test('B8: a bridge whose key is the person\'s own file deletes nothing, at its start and at its end', async () => {
  const w = await opened({ clicks: [ownKeyFile('/home/me/.ssh/id_ed25519')] });

  w.children[0].end(0);
  await settled();

  assert.deepEqual(w.ended, [KEY]);
  assert.deepEqual(w.forgotten, [], 'B8: a file that was not written for the call was deleted');
});

test('B9: a REAL key file of a bridge is on the disk while its ssh runs and gone when it has ended', async () => {
  const keyFile = path.join(ownedDir(scope, 'keys'), 'call-bridge.key');
  fs.writeFileSync(keyFile, 'not a key', { mode: 0o600 });
  const w = await opened({ clicks: [writtenKey(keyFile)], realForget: true });

  await click(w, 'closeRemoteBridge');
  await settled();
  assert.equal(fs.existsSync(keyFile), true, 'B9: the key file left the disk before its ssh ended');

  w.children[0].end(null);
  await settled();

  assert.equal(fs.existsSync(keyFile), false, 'B9: the key file of the ended bridge is still on the disk');
});
```

### 5.3 `test/writtenKey.test.ts` — five more tests, written together with §2

The file's first comment becomes:

```ts
/**
 * The guards of a written key file (N16), alone: `withWrittenKey` for a road that ends, `withWrittenKeyUntilExit` for a road that
 * hands the file to a process. The roads themselves are `personRoadsForgetKey.test.ts` and `bridgeKeyHandoff.test.ts`.
 */
```

Appended after U3:

| Id | What it proves |
|---|---|
| U4 | nothing is deleted while the process runs; once when `exited` settles; the started thing is handed back |
| U5 | `undefined` deletes at once; a throwing `start` deletes at once and the SAME error goes on |
| U6 | a continuation that cannot be attached (reading `exited` throws): ONE delete, at once, and the error goes on. This is the test of rule 1 of §1 |
| U7 | an `exited` that REJECTS deletes too, and the process sees no unhandled rejection |
| U8 | nothing is deleted for the person's own key file or a refusal, at the start and at the end |

```ts
test('U4: withWrittenKeyUntilExit deletes nothing while the process runs, and once when it has ended', async () => {
  const { mod, forgotten } = guards();
  const exited = held<number | null>();
  const started = { process: { exited: exited.promise } };

  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, () => started), started, 'the started thing was not handed back');
  await turn();
  assert.deepEqual(forgotten, [], 'the key file was deleted while its process runs');

  exited.resolve(null);
  await turn();
  assert.deepEqual(forgotten, [KEY_FILE]);
});

test('U5: withWrittenKeyUntilExit deletes at once when nothing was started, and when the start throws (the same error)', () => {
  const { mod, forgotten } = guards();
  const failure = new Error('spawn EACCES');

  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, () => undefined), undefined);
  assert.deepEqual(forgotten, [KEY_FILE]);

  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, () => { throw failure; }), (error) => error === failure);
  assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
});

test('U6: a continuation that cannot be attached deletes the key file once, at once, and the error goes on', () => {
  const { mod, forgotten } = guards();
  // What a broken spawner could hand back: a process with no `exited`. The attach throws; the finally is then the one delete.
  const broken = { process: { get exited(): Promise<unknown> { throw new TypeError('no exited'); } } };

  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, () => broken), TypeError);
  assert.deepEqual(forgotten, [KEY_FILE]);
});

test('U7: an exited that REJECTS deletes the key file too, and leaves no unhandled rejection', async () => {
  const { mod, forgotten } = guards();
  const exited = held<number | null>();
  const unhandled: unknown[] = [];
  const note = (reason: unknown): void => void unhandled.push(reason);
  process.on('unhandledRejection', note);
  try {
    mod.withWrittenKeyUntilExit(WRITTEN, () => ({ process: { exited: exited.promise } }));
    exited.reject(new Error('the wait failed'));
    await turn();
    await turn();
  } finally {
    process.off('unhandledRejection', note);
  }

  assert.deepEqual(forgotten, [KEY_FILE]);
  assert.deepEqual(unhandled, []);
});

test('U8: withWrittenKeyUntilExit deletes nothing for a key file of the person or for a refusal, at the start and at the end', async () => {
  const { mod, forgotten } = guards();

  mod.withWrittenKeyUntilExit(OWN_FILE, () => ({ process: { exited: Promise.resolve(0) } }));
  mod.withWrittenKeyUntilExit(OWN_FILE, () => undefined);
  mod.withWrittenKeyUntilExit(REFUSED, () => undefined);
  await turn();

  assert.deepEqual(forgotten, []);
});
```

## 6. Order of work, and the commits

1. **Step 1, the move** (§4.1): `bridgeSpawner.ts` as in §4.1, `extension.ts`, the baseline. Compile, typecheck, lint, the ratchet,
   the whole suite: green. Commit c3: `refactor(extension): the bridge spawner leaves activate for bridgeSpawner.ts (N16 S2)`.
2. **The spawner's tests** (§5.1, without P12 and without the import of `describeBridgeError`). Compile: exit 0. Run the one
   suite: P1, P3, P4, P6, P8, P9, P10 and P11 red with the texts of §5.1; P2, P5 and P7 green. Save the output.
3. **The spawner's fix** (§4.2): `bridgeSpawner.ts`, the two lines of `extension.ts`, and P12 with its import. The suite: 12
   green. `wc -l` of `extension.ts` still says 975.
4. **The bridge's tests** (§5.2). Compile: exit 0. Run the one suite: B1 to B7 and B9 red with the texts of §5.2; B8 green. Save
   the output.
5. **The helper and the command** (§2, §3) and U4 to U8 (§5.3). The three suites: 9 (`bridgeKeyHandoff`), 12 (`bridgeSpawner`) and
   8 (`writtenKey`) green. `wc -l` says 794.
6. **The mutation checks** (§7), one at a time, each restored before the next. Save what each one printed.
7. Typecheck, lint, the ratchet, the whole suite: green. Commit c4:
   `fix(ssh): N16 S2 — a bridge's key file is deleted when its ssh ends, and a bridge whose ssh cannot start ends`. Its body quotes
   the RED texts of steps 2 and 4 and the result of each mutation.

If a test of step 2 or step 4 is red with another text, or a guard is red: stop and tell the lead. No commit holds a red test.
The two halves (steps 2 to 5) are one commit on purpose: the command's half is not safe without the spawner's.

## 7. The mutation checks (each one must turn the named tests red; restore after each one)

Each mutation is a temporary edit of the PRODUCT, never of a test. Compile (read the exit), run `bridgeKeyHandoff`,
`bridgeSpawner`, `writtenKey` and `sshBridgeManager`, read what is red, restore, and compile again before the next one. "Red"
below is what was measured (L9 f); a mutation that turns red something else, or less, is a finding for the lead.

| # | The mutation | Red |
|---|---|---|
| N1 | No continuation: in `withWrittenKeyUntilExit`, the two lines `const forget = …` and `void started.process.exited.then(forget, forget);` are removed (the flag is still set) | B1, B2, B3, B4, B9, U4, U6, U7 |
| N2 | No delete at once: in the `finally`, `if (!handed) { forgetWrittenKey(credential); }` becomes `void handed;` | B5, B6, B7, U5, U6 |
| N3 | The delete hangs on what `onEnded` hangs on: the edit of `sshBridgeManager.ts` below, for this one run | B2, B3, B4, B9. B1 stays green, and so do the 9 tests of `test/sshBridgeManager.test.ts` |
| N4 | The flag is set before the start: `handed = true;` becomes the first statement of the `try` | B5, B6, B7, U5, U6 |
| N5 | The flag is set before the attach: the two statements change places | U6 |
| N6 | The flag is never set: `handed = true;` is removed, so the file is deleted at once after a start too | B1, B2, B3, B4, B9, U4, U7 |
| N7 | The continuation has no rejection half: `then(forget, forget)` becomes `then(forget)` | U7 |
| N8 | No `'error'` listener: the whole `child.on('error', …);` statement of `bridgeProcessOf` becomes `void report;` | P1, P3, P4, P6, P9, P10, P11 |
| N9 | The listener has no condition: `if (child.pid === undefined) { resolve(null); }` becomes `resolve(null);` | P4, P10 |
| N10 | The listener is registered once: in `BridgeChild` and in `bridgeProcessOf`, `on(` becomes `once(` for `'error'` | P4, P10 |
| N11 | `activate` spawns by itself again: `extension.ts` gets back its old first argument of `new SshBridgeManager(` (seven lines) and its import of `node:child_process` in place of the import of `./bridgeSpawner` | P8 |
| N12 | No report: in the listener, `report(error);` becomes `void report; void error;` | P6, P9, P10 |
| N13 | Only a failed start is reported: `report(error);` moves inside the `if`, after `resolve(null);` | P10 |
| N14 | The report comes before the settle: `report(error);` becomes the first statement of the listener | P11 |
| N15 | The window reports to nobody: in `extension.ts`, the argument becomes `bridgeSpawner({ report: () => undefined })` and the import loses `describeBridgeError` | P8 |
| N16 | The log line carries the whole error object: in `describeBridgeError`, `${describeError(error)}` becomes `${describeError(error)} ${JSON.stringify(error)}` | P12 |

N3, in `SshBridgeManager.start` (restore it; `git diff -- src/sshBridgeManager.ts` must be empty after):

```ts
    this.stop(key);
    const spawned = this.spawn(command, argv, env);
    let ownEnd: (code: number | null) => void = () => {};
    const bridge: OpenBridge = { key, remotePath, process: { kill: () => spawned.kill(), exited: new Promise<number | null>((resolve) => { ownEnd = resolve; }) } };
    this.open.set(key, bridge);
    void spawned.exited.then((code) => {
      if (this.open.get(key) === bridge) {
        this.open.delete(key);
        this.onEnded(key, code);
        ownEnd(code);
      }
    });
    return bridge;
```

With it, the `exited` that the command waits for settles exactly when `onEnded` is called, and never for a bridge that was
closed or replaced.

How these map to the parent's §3 item 5: "remove each of the four forgets" is M1 and M2 of the S1 spec and N1 and N2 here;
"attach the bridge's forget to `onEnded`" is N3; "drop the `'error'` listener" is N8; "drop its `pid` condition" is N9; "set the
bridge's flag before `start`" is N4. Of change 1.1: "drop the call of the reporter" is N12; "report only when the child never
started" is N13; "report before the settle" is N14; "a reporter that does nothing in `extension.ts`" is N15; "the log line from
the whole error object" is N16. N5, N6, N7, N10 and N11 are this spec's own.

## 8. Done when (each item can be counted)

- [x] c3 changes `bridgeSpawner.ts` (new), `extension.ts` (975 lines) and `.size-baseline.json` (975) and nothing else; the suite is
      green at c3.
- [x] P1, P3, P4, P6, P8, P9, P10 and P11 were watched red on c3 and pass at c4; P2, P5 and P7 were green at both; P12 passes.
- [x] `extension.ts` has 975 lines at c3 and at c4; its one `new SshBridgeManager(` is handed
      `bridgeSpawner({ report: (error) => log.warn('bridge', describeBridgeError(error)) })`.
- [x] B1 to B7 and B9 were watched red on the product of step 3 and pass at c4; B8 was green at both.
- [x] `test/writtenKey.test.ts` has U1 to U8 and they pass.
- [x] N1 to N16 each turned red what §7 names, and the product was restored after each.
- [x] `commands/agentCommands.ts` has 794 lines; `git diff -w c2..c4` of it shows the seven added lines of §3.3, the import line, the
      two `return undefined;` and the returned `bridges.start(…)`, and nothing else.
- [x] `sshBridgeManager.ts` and `test/sshBridgeManager.test.ts` are unchanged.
- [x] `commands/agentCommands.ts` does not import `../keyInstaller`; `forgetMaterializedKey` is called for the three roads only in
      `writtenKey.ts`.
- [x] `extension.ts` does not name `node:child_process`.
- [x] `npm run typecheck`, `npm run lint`, `npm run ratchet` and `npm test` are green; the leftovers audit of `npm test` names no
      folder of this run.

## 9. Break it — ways to make the tests pass while the defect stays, and the row that stops each one

| # | The way | What stops it |
|---|---|---|
| Y1 | The file is deleted when *Close* is pressed (in the close command, or in the manager's `stop`) | B2, B3 and B9: after *Close* and before the end, `forgotten` is `[]` and the real file is on the disk. A fake that ends inside `kill()` would hide this; the world's does not (L8) |
| Y2 | The delete is attached to `onEnded` | B2 and B4 assert that `onEnded` was not called and the file is deleted all the same; N3 |
| Y3 | The file is deleted when the command returns | B1, first half; U4; N6 |
| Y4 | Only the newest bridge of an entry is tracked (a map from the entry to one key file), so a replaced bridge's file is forgotten about, or the live bridge's file is deleted when the old process ends | B4: `[FIRST]` after the first's end, with the replacement open; `[FIRST, SECOND]` after the second's end. The continuation closes over ITS call's credential; there is no map |
| Y5 | The cleanup runs only on a throw, not on "nothing started" | B5, U5 (N2, N4) |
| Y6 | The flag is set before the attach, so an attach that throws leaves the file with nobody | U6 (N5) |
| Y7 | The spawner settles `exited` on every `'error'` | P4 (N9): the file of a running `ssh` would be deleted and its row dropped while it runs |
| Y8 | The tests of the spawner pass on a fake child, and `activate` still spawns by itself | P8 (N11); P6 and P7 run the real `child_process.spawn` |
| Y9 | The command's tests pass on a cooperative fake while the real spawner never settles on a failed start | P6: the real spawner, the real manager, a program that is not there: the row goes and `onEnded` is called. With B1 (the file goes when `exited` settles) the chain is closed |
| Y10 | The reporter is accepted and never called, or called only for a child that never started | P9 and P10 (N12, N13); P6 asserts the report of a real failed start |
| Y11 | The log line is built from the whole error object, or the window logs something else than the line | P12 (N16): the argv on the object does not reach the line; P8 (N15) pins the window's call to `describeBridgeError(error)` |

## 10. Opus review checklist

1. No statement stands between `await resolveExecAuth(…)` of the bridge and `withWrittenKeyUntilExit(…)`; the comment line is the
   only thing between them.
2. The function handed to `withWrittenKeyUntilExit` is synchronous: no `async`, no `await`, and every dialog in it is `void`ed as
   before.
3. In `withWrittenKeyUntilExit`: the attach and `handed = true;` are adjacent statements in that order; the `finally` deletes only
   `if (!handed)`; the continuation is `then(forget, forget)`; nothing else was added.
4. The continuation is attached to `started.process.exited` of what `bridges.start` returned. Nothing reads `onEnded`, and
   `sshBridgeManager.ts` has no diff.
5. `forget` closes over the credential of ITS call. There is no shared variable, map or module state for key files.
6. `bridgeSpawner.ts` is the text of §4.2: `once('exit')`, `on('error')`, the `pid` condition, the unchanged spawn options, the
   argv copied; in the listener the settle stands BEFORE `report(error)`, and `report(error)` stands outside the `if`; `report` is
   required in `BridgeSpawnerParts` and in `bridgeProcessOf`; `describeBridgeError` uses `describeError(error)` and nothing else
   of the error.
7. c3 is a move only: the body of `bridgeProcessOf` and the options of the spawn are what `extension.ts:190-193` had.
8. `extension.ts`: the first argument of the one `new SshBridgeManager(` is
   `bridgeSpawner({ report: (error) => log.warn('bridge', describeBridgeError(error)) })`; no `node:child_process`; `onEnded` and
   its comment unchanged; 975 lines and the baseline says 975.
9. Each RED text in the body of c4 is one of §5, and P6's is the real `ENOENT` of a child.
10. Each mutation in the body of c4 names what turned red, and it is what §7 says; N3 was restored (`git diff` of
    `sshBridgeManager.ts` is empty).
11. B4 really replaces: two children, the first killed once, before either end. B3 really asks and starts nothing.
12. B2, B3 and B9 hold the process open across *Close*: the delete is asserted absent after the kill and present after `end`.
13. 794 lines; no new `eslint-disable`; no dialog moved or reordered; no sentence and no argv changed.
14. P6 and B9 write only into folders of `ownedDir`; P6 and P7 are the only tests that start a process, and each has a timeout.
15. The one behaviour change is the one of the parent's §2.2 (a failed start ends the row), and nothing else a person sees. The
    one new log line is the sentence of `describeBridgeError`; no other log line was added, and none carries an argv, an
    environment or a key path.
16. The test file's two typed constants are the only way it reaches `bridgeProcessOf` and `bridgeSpawner`; they hold no cast.

## 11. Not verified by this spec

- A real `ssh -R` and a real host: no test starts `ssh`. That a running `ssh` no longer needs its key file after it has
  authenticated is not used: the file stays until the process ends (the parent's §2.2).
- Windows. The suite runs on Ubuntu. That `ssh.exe` which cannot start also emits `'error'` with no `pid`, and that a key file can
  be deleted in the moment its process has ended, are read from Node's contract, not measured. A delete that fails is silent and
  the purge of the parent's §2.4 retires the file.
- An `'error'` of a STARTED child for real (a kill that fails): only with the fake child (P4, P10).
- A started child whose kill fails and that never exits: its key file stays until the purge (the parent's §2.4 as narrowed by
  change 1.1): the synchronous purge on the window's dispose (`extension.ts:222-223`) or the next activation, best effort. No
  test makes a kill fail for real, and no retry of a failed kill is built. The spawner sends the default signal, as before.
- That the new line reaches the log FILE: P8 reads the call in `extension.ts`; no test runs `activate`. The diagnostic log is
  not changed by this story.
- A start that fails AFTER the last message of the command was shown: the person has read *Bridge open to …*; the row then goes
  back to *Open Remote Bridge…* by `onEnded`, and the socket check reports the missing socket as it does today. No new sentence.
- The window ending: `dispose` kills every bridge; whether each `exited` settles before the extension host is gone is not
  measured. The purge is the net.

## Notes for the lead

- **The reporter (plan change 1.1) is built as a required part.** `bridgeSpawner({ report, spawn? })` and
  `bridgeProcessOf(child, report)`: no default, so the error cannot be dropped by leaving an argument out (§4.2 says why, and why
  one object). The sentence lives in `bridgeSpawner.ts` as `describeBridgeError`, so that it has a test and `extension.ts` stays
  at 975 lines. The report comes AFTER the settle: the delete of a key file does not depend on the log (P11, N14).
- **The log line says "did not start, or could not be stopped" for both cases.** The reporter is told an error, not which case it
  was. If two sentences are wanted, the reporter's type has to carry the case, which is a change of the parent's 1.1 text.
- **The helper takes the whole answer of the resolve**, also a refusal, and the warning and the not-ok error are shown inside the
  guarded function. This keeps the guard directly after the resolve.
- **`.then(forget, forget)`**: a rejected `exited` deletes too. The parent does not name a rejected `exited`; `BridgeProcess` says
  it resolves. The choice: a file that might be deleted under a process whose state is unknown, against a file that stays for the
  life of the window; this spec takes the first, and U7 holds it.
- **The replacement is two overlapping Opens** (L2, B4), not a second click: the second click asks (B3). The parent's §3 item 3
  says "a second open of the same entry"; the parent's story S2 records how it is built.
- **N3 edits `sshBridgeManager.ts` for one run.** It is the only way to hang the command's wait on what `onEnded` hangs on without
  rewriting the command; check that it was restored.
