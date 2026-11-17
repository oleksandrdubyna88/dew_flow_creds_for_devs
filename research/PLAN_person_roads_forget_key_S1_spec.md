# PLAN — S1 spec: the bridge socket check and Install creds on host delete their key file (SECURITY)

> Status: **IMPLEMENTED, 2026-11-17** (`cd9bb49d`, `b045f2c9`, the review's nits `92ac846e`; extension 1.22.2, #373). Security spec, written by Fable before its code (the row *Security
> judgement* of `subagent-models.md`; not the cornerstone: S2 holds it). Story S1 of
> [PLAN_person_roads_forget_key.md](PLAN_person_roads_forget_key.md) (its §2.1, §2.3, §3 items 1, 2, 4a and 5, `## Stories` S1).
> This file is promoted together with the parent.
>
> Scope: `src_vs_code/src` — `commands/agentCommands.ts` (three grouped imports, `verifyBridgeSocket`, the handler of
> `credSshManager.installRemoteCli`), new `writtenKey.ts`, and tests: new `test/personRoadsWorld.ts`,
> `test/personRoadsForgetKey.test.ts`, `test/writtenKey.test.ts`. No document: the documents are S3. Branch
> `fix/n16-forget-person-keys` at `5d49cc9b`. Each `file:line` below was read on `5d49cc9b`. Fable writes this spec, a Sonnet coder
> builds it, Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above. "The S2 spec"
is [PLAN_person_roads_forget_key_S2_spec.md](PLAN_person_roads_forget_key_S2_spec.md); it continues on the code and the world of this
story. The names of this document: the facts K1 to K10, the scenarios C1 to C6, I1 to I7, R1, U1 to U3, the mutations M1 to M7,
the break-its X1 to X7. This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`).

## What S1 builds, in one paragraph

`resolveExecAuth` writes a stored SSH key to a file `keys/<pid>/call-<uuid>.key` and tells its caller the path in `materialized`:
that caller, and only that caller, may delete the file. Two callers in `commands/agentCommands.ts` run a few short `ssh` commands
with it and never delete it: the socket check of a bridge, and *Install creds on host*. The file then stays until the window
ends. S1 adds one small module, `writtenKey.ts`, with the rule in one place (`withWrittenKey`: run, then delete in a `finally`),
and makes both roads run inside it, from the statement directly after the resolve to their end. Before that, three groups of
imports of `agentCommands.ts` become one line each, because the file is at its limit of 800 lines. The third road, the bridge
itself, is S2.

| File | Change | Where |
|---|---|---|
| `commands/agentCommands.ts` | three groups of imports on one line each (commit c1); `verifyBridgeSocket` and the handler of `credSshManager.installRemoteCli` inside `withWrittenKey`, one new import (commit c2) | §2 |
| `writtenKey.ts` (new) | `forgetWrittenKey(credential: ExecAuth): void` and `withWrittenKey<T>(credential: ExecAuth, run: () => Promise<T>): Promise<T>` | §1 |
| `test/personRoadsWorld.ts` (new) | the world: the real registered commands, the real `SshBridgeManager`, four stand-ins | §3 |
| `test/personRoadsForgetKey.test.ts` (new) | 14 tests: C1 to C6, I1 to I7, R1 | §4 |
| `test/writtenKey.test.ts` (new) | 3 tests: U1 to U3 | §4 |

## Binding constraints

- **No plan change.** Build what the parent and this document say. If a step cannot be done as written, a code block here does not
  compile, or a test is not RED or GREEN as this document says: stop and tell the lead. Do not repair the parent or this document.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first. Read the exit of `tsc` before any test
  result. This is why the world and the tests of §4 use only modules that exist on `5d49cc9b`, and why `test/writtenKey.test.ts`
  (it loads the new module) is written together with the module and is proven by mutations, not by a RED.
- **Keep what the runner printed.** Save each RED text in the scratchpad folder of the session and quote it in the commit body.
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): a file has at most 800 lines, with blank lines and comments counted; a
  function has at most 50 code lines (120 in `src/test/`); complexity is at most 4, also in tests. No new `eslint-disable`. The
  header of `agentCommands.ts` (`:1-3`) stays as it is.
- **The line budget of `commands/agentCommands.ts` is §2.4: 782 lines after step 1, 787 after this story.** A different count means
  that something else changed: find it before the commit.
- **The product change is §1 and §2 and nothing else.** No sentence a person sees changes. No argv changes. No dialog moves out of
  `registerAgentCommands`, and none is added, removed or put in another order (`test/promptSiteLedger.ts:56-63` names them by their
  order). No call of `buildSshExecArgv` changes (`test/launchRoadScan.test.ts:316-325` counts the three of this file).
- **Files with no change:** `sshExecAuth.ts`, `keyInstaller.ts`, `materializedKeys.ts`, `sshBridgeManager.ts`, `sshExecRunner.ts`,
  `sshExecCommand.ts`, `sshBridge.ts`, `remoteCliInstall.ts`, `extension.ts`; `test/vscodeStub.ts`,
  `test/forgetAgentConsents.test.ts`, `test/promptSiteLedger.ts`, `test/launchRoadScan.test.ts`; `package.json`; every document
  except the parent's status paragraph when the lead asks for it.
- **The bridge's own key file is not this story.** The handler of `credSshManager.openRemoteBridge` does not change here. Its key
  file still stays after S1; S2 ends that.
- **Tests leave nothing outside an owned temp folder.** One test writes a real file (R1): into a folder of `ownedDir`
  (`scripts/lib/leftovers.cjs`), never through `os.tmpdir()` or `mkdtemp` (the guard `test/leftoversSites.test.ts` reads every test
  file). The other tests write nothing: their key paths are words.
- **Node only.** No Python, also not for a helper script. Write documents with the Edit or Write tool, not with a shell heredoc.

## Facts read on `5d49cc9b` that this spec uses

| # | Fact | Where |
|---|---|---|
| K1 | `resolveExecAuth` (`:115-124`) answers a stored key through `byStoredKey` (`:155-166`): the file is written by `materializeCallKey` (`:161`) and the answer carries `materialized: keyPath` (`:162`). The field says "Set only when a key was WRITTEN for this call, and only that caller may delete it" (`:36-37`). The other answers carry no `materialized`: a key file of the person (`:146`), a password (`:91-99`), every refusal (`ok: false`, `:40-47`). A write that fails is caught there and answered as a refusal (`:163-165`) | `sshExecAuth.ts` |
| K2 | `forgetMaterializedKey` is `fs.rmSync(keyPath, { force: true })` inside a `try` whose `catch` is empty (`:262-268`). It cannot throw, whatever it is given. A delete that fails is silent | `keyInstaller.ts` |
| K3 | The socket check, `verifyBridgeSocket` (`:208-260`): an outer `try` (`:213`); no storage folder returns (`:214-216`); the resolve, with FOUR arguments and no opener (`:217`); not ok returns (`:218-220`); the argv of the mode check (`:222`), none returns (`:223-225`); the sweep (`:230`; `sweepDeadSockets`, `:190-206`, catches the throw of its own run, `:201-205`); a timer of 1.5 s (`:232`); the mode check run (`:233-237`); a missing socket is reported and returns (`:239-247`); an unreadable mode returns (`:248-251`); a wide mode warns (`:252-256`); the outer `catch` logs `socket check did not complete: …` (`:257-259`). Its one caller starts it detached: `void verifyBridgeSocket(accountId, details, remote)` (`:471`) | `commands/agentCommands.ts` |
| K4 | *Install creds on host*, the handler of `credSshManager.installRemoteCli` (`:274-342`): the resolve, with a click opener as fifth argument (`:287`); the warning (`:288-290`); not ok reports and returns (`:291-294`); the probe run (`:296`), its timeout returns (`:297-302`); a blocker returns (`:303-307`); the modal question (`:311-316`), any other answer returns (`:317-319`); the install run inside `withProgress` (`:321-333`, the run at `:328`); the two last messages (`:335-341`). `runRemote` (`:345-363`) never throws for its run: no argv is a value (`:352-354`), a throw is a value (`:360-362`) | `commands/agentCommands.ts` |
| K5 | The file has 800 lines. Imports that name one symbol per line from one module: ten of `../sshBridge` (`:24`, `:28-32`, `:41-43`, `:45`), six of `../remoteCliInstall` (`:33-38`), five of `../cliAliases` (`:9`, `:46-48`, `:51`). The file groups imports already (`:6`, `:50`, `:52`, `:69`). No test reads these import lines | `commands/agentCommands.ts` |
| K6 | The solved instance of the rule: `execOverSsh` deletes the key file in a `finally` around its run (`sshUseActions.ts:277-300`, the `finally` at `:297-299`). `forgetWhenTheOpenThrows` says why its cleanup can be trusted: `forgetMaterializedKey` never throws, so it cannot hide the first error (`sshConnect.ts:147`, the function at `:149-158`) | `sshUseActions.ts`, `sshConnect.ts` |
| K7 | How a test drives a registered command: `loadWithVscode(request, stub, mocks)` loads the module under a stubbed `vscode` and replaces further modules by the request string that the importing module WRITES (`test/vscodeStub.ts:16-28`, `:56-61`); it applies to every module of the graph. `test/forgetAgentConsents.test.ts:69-112` registers the real agent commands this way and keeps the handlers. So the stand-ins are `../sshExecAuth`, `../sshExecRunner` and `../sshExecCommand` (what `commands/agentCommands.ts` writes) and `./keyInstaller` (what `writtenKey.ts` writes) | the tests |
| K8 | `keyInstaller.ts` imports `vscode`, so `writtenKey.ts` does too, through it. A test loads `writtenKey.ts` with `loadWithVscode`. `writtenKey.ts` imports `ExecAuth` with `import type`: nothing of `sshExecAuth.ts` is loaded for it at run time, so the stand-in `../sshExecAuth` of a test stays the only resolver | `keyInstaller.ts`, the new module |
| K9 | A temp folder of a test: `cleanupScope()` once per file, `after(() => scope.close())`, `ownedDir(scope, '<what>')` (`test/keyInstaller.test.ts:9-13`, `:47-48`) | the tests |
| K10 | **Measured 2026-11-16** on a copy of `src_vs_code` at `5d49cc9b` in a scratch folder (the copy was edited and compiled, not the repository; not kept). (a) The world and `test/personRoadsForgetKey.test.ts` of §3 and §4 compile on the unchanged product; of its 14 tests 12 are red with the texts of §4 and 2 pass (C6, I7). (b) With step 1 alone the file has 782 lines and the same 12 are red. (c) With §1 and §2: all 14 pass, the 3 tests of `test/writtenKey.test.ts` pass, the file has 787 lines, `eslint src` is clean. (d) M1 to M7 turn red what §6 says. (e) At that state `forgetAgentConsents`, `cliAliasMessage`, `addKeyToAgentReference`, `promptSites` and `launchRoadScan` are green. (f) The whole suite of the copy with S1 and S2 built (`node --test` over `out/test/*.test.js`): 7841 tests, 7781 pass, 37 skipped, 23 fail. Each of the 23 fails on a part of the repository that the copy does not have (`.github/workflows`, `install.sh`, `xunit.runner.json`, the `http` folder, the server's folders, git itself); none reads a file of this plan. No folder of the run was left in the temp root. The build runs the whole suite in the repository | the run |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.** A test result after a failed `tsc` is the result of old files.
2. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
3. `node $LP npm run typecheck`
4. `node $LP npm run lint`
5. `npm test` — the full suite (it compiles first and lowers itself).

## 1. The helper: new `writtenKey.ts`

The whole file. `forgetWrittenKey` is the one spelling of "delete what was written, and only that"; `withWrittenKey` is the guard
of a road that ends. Both take what `resolveExecAuth` answered, as it is (also a refusal), so that the call can stand directly
after the resolve with no statement between them.

```ts
import { forgetMaterializedKey } from './keyInstaller';
import type { ExecAuth } from './sshExecAuth';

/**
 * The key file that `resolveExecAuth` WROTE for one call, and the one rule about it (N16): the caller that got `materialized` deletes
 * the file when no `ssh` of its own will read the path again. A credential with no `materialized` (the person's own key file, a
 * password, a refusal) deletes nothing: the extension did not write it.
 *
 * <p>Both functions take what `resolveExecAuth` answered, as it is, so that no statement stands between the resolve and the guard.</p>
 */

/** Delete the key file written for this credential, when one was. Never throws (`forgetMaterializedKey` is best effort). */
export function forgetWrittenKey(credential: ExecAuth): void {
  if (credential.ok && credential.materialized !== undefined) {
    forgetMaterializedKey(credential.materialized);
  }
}

/**
 * Run `run` and delete the key file of `credential` when it has ended: after its value, after its rejection and after a synchronous
 * throw alike. The value or the SAME error goes on to the caller.
 */
export async function withWrittenKey<T>(credential: ExecAuth, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } finally {
    forgetWrittenKey(credential);
  }
}
```

What each way out of `withWrittenKey` does:

| `run` | The key file | The caller gets |
|---|---|---|
| returns a promise that fulfils | deleted after it fulfilled | the value |
| returns a promise that rejects | deleted after it rejected | the same error object |
| throws before it returns a promise | deleted | the same error object, as a rejection |
| any of the three, for a credential with no `materialized` or a refusal | nothing is deleted | as above |

`forgetWrittenKey` has complexity 3 (the `if` and the `&&`), `withWrittenKey` 1. No `catch`: nothing here handles an error.

## 2. The product changes in `commands/agentCommands.ts`

### 2.1 Step 1 — the three grouped imports (a change of form only)

For each of `../sshBridge`, `../remoteCliInstall` and `../cliAliases`: the lines that import one name each become ONE line, at the
place of the first of them, with the names in the order that the old lines had. Nothing else moves. The request strings do not
change. The three lines, exactly:

```ts
import { AliasMap, aliasFor, withoutAlias, describeAliasProblem, withAlias } from '../cliAliases';
import { sweepCommand, modeCheckCommand, interpretSocketProbe, describeMissingSocket, isOwnerOnlyMode, describeWideSocket, remoteSocketPath, bridgeId, buildBridgeArgv, remoteInstructions } from '../sshBridge';
import { probeCommand, blockerFor, interpretProbe, confirmationFor, installCommand, interpretInstall } from '../remoteCliInstall';
```

They stand at lines 9, 24 and 28 of the new file. The other modules that are imported on several lines (`../installCommand`,
`../credsInstall` and others) stay as they are: the parent's §2.3 names these three. The file then has 782 lines. Typecheck, lint
and the whole suite are green with this step alone; it is its own commit (§5).

### 2.2 The socket check

One import, after the import of `../sshExecAuth`:

```ts
import { withWrittenKey } from '../writtenKey';
```

In `verifyBridgeSocket`, everything from the statement after the resolve to the end of the `try` body moves, unchanged and two
spaces deeper, into the function that `withWrittenKey` runs. The not-ok return moves inside too. Two lines are new: the one that
opens the call and the `});` that closes it. After the change (the middle is the old text):

```ts
    try {
      if (storageDir === undefined) {
        return;
      }
      const credential = await resolveExecAuth(storage, accountId, entity, storageDir);
      await withWrittenKey(credential, async () => {
        if (!credential.ok) {
          return; // the bridge itself already reported this
        }
        const keyPath = credential.keyPath;
        const argv = buildSshExecArgv(entity, keyPath, modeCheckCommand(remote), credential.auth);
        if (argv === undefined) {
          return;
        }
        // … the comment, the sweep, the timer, the mode check run and the three outcomes, as they are, two spaces deeper …
        if (!isOwnerOnlyMode(mode)) {
          log.warn('bridge', `${remote.path} is mode ${mode}, not 600`);
          void vscode.window.showWarningMessage(describeWideSocket(mode, remote));
        }
      });
    } catch (error) {
      log.info('bridge', `socket check did not complete: ${describeError(error)}`);
    }
```

| Way out of the socket check | The key file written for it |
|---|---|
| no storage folder (before the resolve) | none was written |
| the resolve answers a refusal | none was written; nothing is deleted |
| the resolve answers the person's own key file or a password | none was written; nothing is deleted, the check runs as before |
| no argv | deleted |
| the run of the sweep throws | the sweep logs it and the check goes on (as before); deleted at the end |
| the mode check run throws, or the window's signal ends it | deleted, then the outer `catch` logs as before |
| the socket is missing, its mode is unreadable, its mode is 600, its mode is wide | deleted |
| the window ends while the timer or a run is pending | not deleted by this code: the purge of the parent's §2.4 retires it |

### 2.3 Install creds on host

In the handler of `credSshManager.installRemoteCli`, everything from the statement after the resolve (`:288`) to the last statement
of the handler (`:341`) moves, unchanged and two spaces deeper, into the function that `withWrittenKey` runs. Two lines are new.
After the change:

```ts
    const credential = await resolveExecAuth(storage, accountId, details, storageDir, clickOpener(storage, accountId, 'connect'));
    await withWrittenKey(credential, async () => {
      if (credential.warning !== undefined) {
        void vscode.window.showWarningMessage(credential.warning);
      }
      if (!credential.ok) {
        void vscode.window.showErrorMessage(`Cannot reach "${node.name}": ${credential.message}`);
        return;
      }

      const facts = await runRemote(details, credential, probeCommand(), 20_000);
      // … the timeout, the blocker, the question, the install run and the two last messages, as they are, two spaces deeper …
      void vscode.window.showErrorMessage(`Could not install on "${node.name}": ${outcome.reason}`);
    });
  });
```

`credential` is a `const`, so the check `if (!credential.ok)` narrows it for the rest of the inner function, and `runRemote` and
the function inside `withProgress` take it as before. The key is resolved once: no second resolve after the question (the
parent's §2.1: a second resolve can ask the PIN twice).

| Way out of the install | The key file written for it |
|---|---|
| no row, no storage folder, no host (before the resolve) | none was written |
| the resolve answers a refusal | none was written; the error is shown as before |
| the probe times out; the host cannot be installed to (a blocker); the host gives no argv (a blocker: the probe was not answered) | deleted |
| the question is open | on the disk: the install run after a *yes* reads the same path |
| the person says no, or closes the question | deleted |
| the install succeeds, fails or times out | deleted after the last message was started |
| a dialog or `withProgress` rejects or throws | deleted; the same error goes on to the caller of the command, as before |
| the window ends while a run or the question is pending | not deleted by this code: the purge of the parent's §2.4 retires it |

### 2.4 The line budget of `commands/agentCommands.ts`

ESLint counts every line, also blank lines and comments (`max-lines` with `skipBlankLines: false, skipComments: false`); for this
file its count is the count of `wc -l`.

| State | Lines | The difference |
|---|---|---|
| `5d49cc9b` | 800 | at the limit |
| after step 1 (§2.1) | 782 | −9 `../sshBridge`, −5 `../remoteCliInstall`, −4 `../cliAliases` |
| after S1 (§2.2, §2.3) | 787 | +1 the import of `../writtenKey`, +2 the socket check, +2 the install |
| after S2 (its spec) | 794 | +7 |

Read the diff of §2.2 and §2.3 with `git diff -w`: without the indentation it is five added lines and no removed line.

## 3. The world: new `test/personRoadsWorld.ts`

The whole file, as measured (K10). It is not named `*.test.ts`. It registers the REAL `registerAgentCommands` and uses the REAL
`SshBridgeManager`; S2 uses the same world, so the parts that only S2 reads (`heldChild`, `resolveGate`, `spawn`, `ended`) are
written now.

- A resolve that is handed an opener is a click (the bridge, the install); a resolve with none is the socket check (K3, K4). The
  world answers them from two lists, so that a test of the bridge and a test of the socket check do not have to count calls.
  **Do not give the socket check an opener and do not take the opener from a click:** the world would then answer the wrong list.
- `forgotten` records what `forgetMaterializedKey` was given. With `realForget` the stand-in is left out and the real function
  deletes.
- Every run records how many paths were forgotten when it STARTED (`forgottenBefore`), and every question the same: that is how a
  test sees that the file was still there when it was needed.
- The stand-ins settle on promise callbacks, never on a timer. The one timer of the product (the 1.5 s of the socket check) is
  moved by the test (`checked` in §4).

```ts
import { formatToken } from '../grantToken';
import { BridgeProcess, BridgeSpawner, SshBridgeManager } from '../sshBridgeManager';
import type { ExecAuth } from '../sshExecAuth';
import type { SshExecOutcome } from '../sshExecRunner';
import { loadWithVscode } from './vscodeStub';

/**
 * The world of the three roads of the person that write a key file through `resolveExecAuth` (N16): the bridge socket check,
 * *Install creds on host* and *Open Remote Bridge…*. The REAL `registerAgentCommands` is loaded under a stubbed `vscode`; a test
 * calls the handlers the extension registered. The bridges are the REAL `SshBridgeManager` over a spawner the test chooses.
 *
 * <p>Stand-ins, by the request string that `commands/agentCommands.ts` (or the module it imports) writes: `../sshExecAuth` (what a
 * resolve answers), `../sshExecRunner` (no real `ssh`), `./keyInstaller` (the recorder of `forgetMaterializedKey`; left out with
 * `realForget`), and with `noExecArgv` `../sshExecCommand`.</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

export type Handler = (...args: unknown[]) => unknown;

/** A bridge's `ssh` whose end the TEST decides: `kill()` only counts, `exited` settles when `end` is called and never by itself. */
export interface HeldChild extends BridgeProcess {
  killed: number;
  end(code: number | null): void;
}

export function heldChild(): HeldChild {
  let settle: (code: number | null) => void = () => {};
  const exited = new Promise<number | null>((resolve) => {
    settle = resolve;
  });
  return {
    killed: 0,
    exited,
    kill(): void {
      this.killed += 1;
    },
    end: (code) => settle(code),
  };
}

/** A resolved credential whose key was WRITTEN for the call: `materialized` is the path. */
export const writtenKey = (keyPath: string): ExecAuth => ({ ok: true, keyPath, env: {}, auth: 'key', materialized: keyPath });

/** A resolved credential whose key is the person's own file: nothing was written, so nothing may be deleted. */
export const ownKeyFile = (keyPath: string): ExecAuth => ({ ok: true, keyPath, env: {}, auth: 'key' });

export const NO_CREDENTIAL: ExecAuth = { ok: false, reason: 'no_credential', message: 'nothing stored' };

/** What one `ssh` run answers. */
export const ran = (stdout: string, exitCode = 0, stderr = ''): SshExecOutcome => ({
  exitCode,
  stdout,
  stderr,
  stdoutTruncated: false,
  stderrTruncated: false,
  timedOut: false,
  durationMs: 1,
});

export const TIMED_OUT: SshExecOutcome = { ...ran('', 0), exitCode: null, timedOut: true };

export interface Parts {
  /** What a resolve WITH an opener answers (a click: the bridge, the install), one per call, in order. */
  clicks?: readonly ExecAuth[];
  /** What a resolve with NO opener answers (the socket check), one per call, in order. None left: no credential. */
  checks?: readonly ExecAuth[];
  /** A click's resolve waits for this before it answers. */
  resolveGate?: Promise<void>;
  /** The n-th `ssh` run (0-based) of the window. It may throw. */
  run?: (index: number, argv: readonly string[]) => SshExecOutcome;
  host?: string;
  /** The spawner of the bridges. Default: every bridge is a `heldChild`, kept in `children`. */
  spawn?: BridgeSpawner;
  /** What a modal question and the quick pick answer. Default: dismissed. */
  answer?: (message: string, rest: readonly unknown[]) => string | undefined;
  /** The real `forgetMaterializedKey` deletes; `forgotten` stays empty. */
  realForget?: boolean;
  /** `buildSshExecArgv` answers no argv. */
  noExecArgv?: boolean;
  /** More stand-ins, by request string. */
  mocks?: Record<string, unknown>;
}

export interface World {
  handlers: Map<string, Handler>;
  bridges: SshBridgeManager;
  children: HeldChild[];
  /** Every path `forgetMaterializedKey` was given, in order. */
  forgotten: string[];
  /** Every `ssh` run: its argv and how many paths were forgotten when it started. */
  runs: { argv: readonly string[]; forgottenBefore: number }[];
  /** Every modal question and quick pick: its text and how many paths were forgotten when it was shown. */
  asked: { message: string; forgottenBefore: number }[];
  /** `onEnded` of the manager: a bridge that ended by itself. */
  ended: string[];
  infos: string[];
  warnings: string[];
  errors: string[];
  logs: string[];
}

export const ROW = { accountId: 'a1', node: { id: 'e1', name: 'box' } };
export const KEY = 'a1:e1';

function emptyWorld(parts: Parts): World {
  const w: World = { handlers: new Map(), bridges: undefined as never, children: [], forgotten: [], runs: [], asked: [], ended: [], infos: [], warnings: [], errors: [], logs: [] };
  const held: BridgeSpawner = () => {
    const child = heldChild();
    w.children.push(child);
    return child;
  };
  w.bridges = new SshBridgeManager(parts.spawn ?? held, (key) => void w.ended.push(key));
  return w;
}

/** A dialog that records its text and answers what the test says; one without buttons answers nothing. */
function dialog(w: World, parts: Parts, into: string[]): (message: string, ...rest: unknown[]) => Promise<string | undefined> {
  return (message, ...rest) => {
    into.push(message);
    const asks = rest.some((one) => typeof one === 'string');
    if (asks) {
      w.asked.push({ message, forgottenBefore: w.forgotten.length });
    }
    return asks ? Promise.resolve().then(() => parts.answer?.(message, rest)) : Promise.resolve(undefined);
  };
}

function vscodeStub(w: World, parts: Parts): Record<string, unknown> {
  return {
    window: {
      showInformationMessage: dialog(w, parts, w.infos),
      showWarningMessage: dialog(w, parts, w.warnings),
      showErrorMessage: dialog(w, parts, w.errors),
      showQuickPick: (items: readonly string[], options: { title: string }): Promise<string | undefined> => dialog(w, parts, w.infos)(options.title, ...items),
      withProgress: (_options: unknown, task: () => Promise<unknown>): Promise<unknown> => task(),
    },
    ProgressLocation: { Notification: 15 },
    env: { clipboard: { writeText: (): Promise<void> => Promise.resolve() } },
  };
}

/** The stand-in of `../sshExecAuth`: a resolve with an opener is a click, one with none is the socket check. */
function resolverOf(parts: Parts): Record<string, unknown> {
  const clicks = [...(parts.clicks ?? [])];
  const checks = [...(parts.checks ?? [])];
  return {
    resolveExecAuth: async (_s: unknown, _a: unknown, _e: unknown, _d: unknown, open?: unknown): Promise<ExecAuth> => {
      if (open === undefined) {
        return checks.shift() ?? NO_CREDENTIAL;
      }
      await parts.resolveGate;
      return clicks.shift() ?? NO_CREDENTIAL;
    },
  };
}

/** The stand-in of `../sshExecRunner`: no `ssh` starts; each run is recorded and answered on a promise callback. */
function runnerOf(w: World, parts: Parts): Record<string, unknown> {
  const answer = parts.run ?? ((): SshExecOutcome => ran('600'));
  return {
    runSshExec: (argv: readonly string[]): Promise<SshExecOutcome> => {
      w.runs.push({ argv, forgottenBefore: w.forgotten.length });
      const index = w.runs.length - 1;
      return Promise.resolve().then(() => answer(index, argv));
    },
  };
}

function mocksOf(w: World, parts: Parts): Record<string, unknown> {
  const recorder = { './keyInstaller': { forgetMaterializedKey: (keyPath: string): void => void w.forgotten.push(keyPath) } };
  const noArgv = { '../sshExecCommand': { buildSshExecArgv: (): undefined => undefined } };
  return {
    '../sshExecAuth': resolverOf(parts),
    '../sshExecRunner': runnerOf(w, parts),
    ...(parts.realForget === true ? {} : recorder),
    ...(parts.noExecArgv === true ? noArgv : {}),
    ...parts.mocks,
  };
}

/** Register the real agent commands over the stand-ins, and hand back what they registered and what they did. */
export function world(parts: Parts = {}): World {
  const w = emptyWorld(parts);
  const details = { id: ROW.node.id, name: ROW.node.name, isSshEnabled: true, host: parts.host ?? 'box.example', user: 'dev' };
  const mod = loadWithVscode<{ registerAgentCommands(host: Record<string, unknown>): void }>('../commands/agentCommands', vscodeStub(w, parts), mocksOf(w, parts));
  const say = (_area: string, text: string): void => void w.logs.push(text);
  mod.registerAgentCommands({
    MACHINES: [],
    agentServer: { setFolderHooks: (): void => undefined, share: (): Promise<string> => Promise.resolve(formatToken(4242, 'c2VjcmV0')), signal: undefined },
    aliasMap: () => ({}),
    bridges: w.bridges,
    log: { info: say, warn: say },
    mutated: (): void => undefined,
    offerInstall: (): Promise<void> => Promise.resolve(),
    provider: { refresh: (): void => undefined },
    register: (command: string, handler: Handler): void => void w.handlers.set(command, handler),
    setAliasMap: (): Thenable<void> => Promise.resolve(),
    sshAgent: {},
    state: {},
    storage: { getAccounts: () => [], getNodes: () => [], getNode: () => ({ id: ROW.node.id, name: ROW.node.name, details }) },
    storageDir: '/storage',
    vaultKeys: {},
  });
  return w;
}

/** Run one registered command on the row, as a click does. */
export function click(w: World, command: 'openRemoteBridge' | 'closeRemoteBridge' | 'installRemoteCli'): Promise<unknown> {
  const handler = w.handlers.get(`credSshManager.${command}`);
  if (handler === undefined) {
    throw new Error(`credSshManager.${command} is not registered; registered: ${[...w.handlers.keys()].join(', ')}`);
  }
  return Promise.resolve(handler(ROW));
}

/** Let every promise callback that is ready run: the stand-ins settle on promise callbacks, never on a timer. */
export async function settled(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
```

## 4. Scenarios: new `test/personRoadsForgetKey.test.ts`

Each row is one test. "RED" is the text on the unchanged product (K10 a); the assertion that fails is the LAST one of the test,
so every earlier assertion of the test (the road was really taken) already passes on the unchanged product. A guard is green before
and after; a mutation of §6 proves it.

The socket check is reached as the extension reaches it: through `credSshManager.openRemoteBridge`, which starts it detached. The
bridge of these tests has the person's own key file, so `forgotten` holds only what the check deletes. `CHECK` is
`/storage/keys/1/call-check.key`, `INSTALL` is `/storage/keys/1/call-install.key`.

| Id | Setup | Expected | RED on the unchanged product |
|---|---|---|---|
| C1 | the check gets a written key; both runs answer `600` | two runs; no path was forgotten when either run started; then `forgotten` is `[CHECK]` | `C1: the socket check left its key file` — `[]` is not `['/storage/keys/1/call-check.key']` |
| C2 | the mode check answers `missing` | one error is shown; `forgotten` is `[CHECK]` | `C2: the socket check left its key file` |
| C3 | the mode check answers an empty text | `forgotten` is `[CHECK]` | `C3: the socket check left its key file` |
| C4 | `buildSshExecArgv` answers no argv | no run; `forgotten` is `[CHECK]` | `C4: the socket check left its key file` |
| C5 | every run throws | the log has `socket check did not complete`; `forgotten` is `[CHECK]` | `C5: the socket check left its key file` |
| C6 (guard) | the check gets the person's own key file | two runs; `forgotten` is `[]` | green |
| I1 | *yes*; the probe answers a Linux x86_64 host with curl, the install answers the installer's success line | two runs; the second argv holds `INSTALL`; nothing was forgotten when either run started or when the question was shown; the success message; `forgotten` is `[INSTALL]` | `I1: the install left its key file` — `[]` is not `['/storage/keys/1/call-install.key']` |
| I2 | *yes*; the install run exits 22 with a `curl:` line | the failure message; `forgotten` is `[INSTALL]` | `I2: the install left its key file` |
| I3 | the probe times out | one run; the 20-seconds warning; `forgotten` is `[INSTALL]` | `I3: the install left its key file` |
| I4 | the probe answers `os=Darwin` | the blocker's warning; `forgotten` is `[INSTALL]` | `I4: the install left its key file` |
| I5 | the question is dismissed | one question, one run; `forgotten` is `[INSTALL]` | `I5: the install left its key file` |
| I6 | the question itself throws an error | the command rejects with the SAME error object; `forgotten` is `[INSTALL]` | `I6: the install left its key file` |
| I7 (guard) | *yes*; the person's own key file; a success | two runs; `forgotten` is `[]` | green |
| R1 | a REAL file in an owned folder is the check's written key; the real `forgetMaterializedKey` | the file was on the disk at both runs; after the check it is not | `R1: the key file of the socket check is still on the disk` |

The whole file, as measured:

```ts
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test, TestContext } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { Parts, TIMED_OUT, World, click, ownKeyFile, ran, settled, world, writtenKey } from './personRoadsWorld';

/**
 * N16, the two bounded roads: the bridge socket check and *Install creds on host* delete the key file that `resolveExecAuth` wrote
 * for them, on every way out, and only a file that was written for them.
 */

const scope = cleanupScope();
after(() => scope.close());

const CHECK = '/storage/keys/1/call-check.key';
const INSTALL = '/storage/keys/1/call-install.key';
const PROBE_OK = 'creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n';
const INSTALLED = 'creds-install: installed /home/dev/.local/bin/creds\n';

/** Open a bridge and let its socket check run to its end: the check waits 1.5 s on a timer between its two runs. */
async function checked(t: TestContext, parts: Parts): Promise<World> {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = world({ clicks: [ownKeyFile('/home/me/.ssh/id_ed25519')], ...parts });
  await click(w, 'openRemoteBridge');
  await settled();
  t.mock.timers.tick(1500);
  await settled();
  return w;
}

const yes = (_message: string, rest: readonly unknown[]): string | undefined => rest.find((one): one is string => typeof one === 'string');

test('C1: the socket check deletes its key file after a normal check, and not before its second run', async (t) => {
  const w = await checked(t, { checks: [writtenKey(CHECK)] });

  assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
  assert.deepEqual(w.runs.map((run) => run.forgottenBefore), [0, 0], 'C1: the key file was deleted before a run that reads it');
  assert.deepEqual(w.forgotten, [CHECK], 'C1: the socket check left its key file');
});

test('C2: the socket check deletes its key file when the socket is missing', async (t) => {
  const w = await checked(t, { checks: [writtenKey(CHECK)], run: () => ran('missing') });

  assert.equal(w.errors.length, 1, 'the missing socket was not reported');
  assert.deepEqual(w.forgotten, [CHECK], 'C2: the socket check left its key file');
});

test('C3: the socket check deletes its key file when the mode cannot be read', async (t) => {
  const w = await checked(t, { checks: [writtenKey(CHECK)], run: () => ran('') });

  assert.deepEqual(w.forgotten, [CHECK], 'C3: the socket check left its key file');
});

test('C4: the socket check deletes its key file when the host gives no argv', async (t) => {
  const w = await checked(t, { checks: [writtenKey(CHECK)], noExecArgv: true });

  assert.equal(w.runs.length, 0, 'a run started with no argv');
  assert.deepEqual(w.forgotten, [CHECK], 'C4: the socket check left its key file');
});

test('C5: the socket check deletes its key file when its run throws', async (t) => {
  const boom = (index: number): never => {
    throw new Error(`spawn ssh ENOENT (run ${index})`);
  };
  const w = await checked(t, { checks: [writtenKey(CHECK)], run: boom });

  assert.ok(w.logs.some((line) => line.includes('socket check did not complete')), `the throw was not logged: ${w.logs.join(' | ')}`);
  assert.deepEqual(w.forgotten, [CHECK], 'C5: the socket check left its key file');
});

test('C6: the socket check deletes nothing when no key file was written for it', async (t) => {
  const w = await checked(t, { checks: [ownKeyFile('/home/me/.ssh/id_ed25519')] });

  assert.equal(w.runs.length, 2, 'the check did not run');
  assert.deepEqual(w.forgotten, [], 'C6: a file that was not written for the call was deleted');
});

async function installed(parts: Parts): Promise<World> {
  const w = world({ clicks: [writtenKey(INSTALL)], ...parts });
  await click(w, 'installRemoteCli');
  return w;
}

test('I1: the install deletes its key file after a success, and the install run still had it', async () => {
  const w = await installed({ answer: yes, run: (index) => ran(index === 0 ? PROBE_OK : INSTALLED) });

  assert.equal(w.runs.length, 2, 'the probe and the install did not both run');
  assert.ok(w.runs[1].argv.includes(INSTALL), 'the install run was not given the key file of the call');
  assert.deepEqual(w.runs.map((run) => run.forgottenBefore), [0, 0], 'I1: the key file was deleted before a run that reads it');
  assert.deepEqual(w.asked.map((one) => one.forgottenBefore), [0], 'I1: the key file was deleted while the question was open');
  assert.match(w.infos.at(-1) ?? '', /is installed on "box"/);
  assert.deepEqual(w.forgotten, [INSTALL], 'I1: the install left its key file');
});

test('I2: the install deletes its key file after a failed install', async () => {
  const w = await installed({ answer: yes, run: (index) => (index === 0 ? ran(PROBE_OK) : ran('', 22, 'curl: (22) The requested URL returned error: 404')) });

  assert.match(w.errors.at(-1) ?? '', /Could not install on "box"/);
  assert.deepEqual(w.forgotten, [INSTALL], 'I2: the install left its key file');
});

test('I3: the install deletes its key file when the probe times out', async () => {
  const w = await installed({ run: () => TIMED_OUT });

  assert.equal(w.runs.length, 1);
  assert.match(w.warnings.at(-1) ?? '', /did not answer within 20 seconds/);
  assert.deepEqual(w.forgotten, [INSTALL], 'I3: the install left its key file');
});

test('I4: the install deletes its key file when the host cannot be installed to', async () => {
  const w = await installed({ run: () => ran('creds=-\narch=x86_64\nos=Darwin\nget=/usr/bin/curl\n') });

  assert.match(w.warnings.at(-1) ?? '', /Cannot install on "box"/);
  assert.deepEqual(w.forgotten, [INSTALL], 'I4: the install left its key file');
});

test('I5: the install deletes its key file when the person says no', async () => {
  const w = await installed({ run: () => ran(PROBE_OK) });

  assert.equal(w.asked.length, 1, 'the question was not asked');
  assert.equal(w.runs.length, 1, 'something ran after a no');
  assert.deepEqual(w.forgotten, [INSTALL], 'I5: the install left its key file');
});

test('I6: the install deletes its key file when the question itself fails, and the same error reaches the caller', async () => {
  const failure = new Error('the window is closing');
  const w = world({ clicks: [writtenKey(INSTALL)], run: () => ran(PROBE_OK), answer: () => { throw failure; } });

  await assert.rejects(click(w, 'installRemoteCli'), (error) => error === failure);
  assert.deepEqual(w.forgotten, [INSTALL], 'I6: the install left its key file');
});

test('I7: the install deletes nothing when no key file was written for it', async () => {
  const w = await installed({ clicks: [ownKeyFile('/home/me/.ssh/id_ed25519')], answer: yes, run: (index) => ran(index === 0 ? PROBE_OK : INSTALLED) });

  assert.equal(w.runs.length, 2);
  assert.deepEqual(w.forgotten, [], 'I7: a file that was not written for the call was deleted');
});

test('R1: a real key file of the socket check is gone from the disk when the check ends', async (t) => {
  const keyFile = path.join(ownedDir(scope, 'keys'), 'call-check.key');
  fs.writeFileSync(keyFile, 'not a key', { mode: 0o600 });
  const present: boolean[] = [];
  const w = await checked(t, { checks: [writtenKey(keyFile)], realForget: true, run: () => (present.push(fs.existsSync(keyFile)), ran('600')) });

  assert.deepEqual(present, [true, true], 'the file was not there for a run that reads it');
  assert.equal(w.runs.length, 2);
  assert.equal(fs.existsSync(keyFile), false, 'R1: the key file of the socket check is still on the disk');
});
```

New `test/writtenKey.test.ts`, written together with the module (it cannot be RED first: K8, and the second binding constraint).
S2 adds its tests to this file.

| Id | What it proves |
|---|---|
| U1 | `withWrittenKey` hands back the value of the run, and deletes only after the run has ended (the run is held by the test) |
| U2 | after a rejection and after a synchronous throw the file is deleted and the SAME error object reaches the caller |
| U3 | nothing is deleted for the person's own key file and for a refusal |

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExecAuth } from '../sshExecAuth';
import { loadWithVscode } from './vscodeStub';

/**
 * The guard of a written key file (N16), alone: `withWrittenKey`, for a road that ends. The roads themselves are
 * `personRoadsForgetKey.test.ts`.
 */

type Guards = typeof import('../writtenKey');

const KEY_FILE = '/storage/keys/1/call-unit.key';
const WRITTEN: ExecAuth = { ok: true, keyPath: KEY_FILE, env: {}, auth: 'key', materialized: KEY_FILE };
const OWN_FILE: ExecAuth = { ok: true, keyPath: '/home/me/.ssh/id_ed25519', env: {}, auth: 'key' };
const REFUSED: ExecAuth = { ok: false, reason: 'no_credential', message: 'nothing stored' };

function guards(): { mod: Guards; forgotten: string[] } {
  const forgotten: string[] = [];
  const mod = loadWithVscode<Guards>('../writtenKey', {}, { './keyInstaller': { forgetMaterializedKey: (keyPath: string): void => void forgotten.push(keyPath) } });
  return { mod, forgotten };
}

const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** A promise the test settles. */
function held<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: Error): void } {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('U1: withWrittenKey hands back the value and deletes the key file only after the run has ended', async () => {
  const { mod, forgotten } = guards();
  const run = held<string>();

  const result = mod.withWrittenKey(WRITTEN, () => run.promise);
  await turn();
  assert.deepEqual(forgotten, [], 'the key file was deleted while the run was going');

  run.resolve('done');
  assert.equal(await result, 'done');
  assert.deepEqual(forgotten, [KEY_FILE]);
});

test('U2: withWrittenKey deletes the key file after a rejection and after a synchronous throw, and hands on the same error', async () => {
  const { mod, forgotten } = guards();
  const failure = new Error('the run failed');

  await assert.rejects(mod.withWrittenKey(WRITTEN, () => Promise.reject(failure)), (error) => error === failure);
  await assert.rejects(mod.withWrittenKey(WRITTEN, () => { throw failure; }), (error) => error === failure);

  assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
});

test('U3: withWrittenKey deletes nothing for a key file of the person or for a refusal', async () => {
  const { mod, forgotten } = guards();

  await mod.withWrittenKey(OWN_FILE, () => Promise.resolve());
  await mod.withWrittenKey(REFUSED, () => Promise.resolve());
  await assert.rejects(mod.withWrittenKey(OWN_FILE, () => Promise.reject(new Error('the run failed'))));

  assert.deepEqual(forgotten, []);
});
```

## 5. Order of work, and the commits

1. **Step 1, the imports** (§2.1). Compile, typecheck, lint, the whole suite: green. `wc -l` says 782. Commit c1:
   `refactor(extension): agentCommands.ts imports three modules on one line each (N16 S1)`.
2. **The world and the scenarios** (§3, §4, only `test/personRoadsWorld.ts` and `test/personRoadsForgetKey.test.ts`). Compile: exit
   0. Run the one suite: 12 red, 2 green, with the texts of §4. Save the output. If a test is red with another text, or C6 or I7
   is red: stop and tell the lead.
3. **The helper and the two roads** (§1, §2.2, §2.3) and `test/writtenKey.test.ts`. Compile; the two suites: 14 and 3 green.
   `wc -l` says 787.
4. **The mutation checks** (§6), one at a time, each restored before the next. Save what each one printed.
5. Typecheck, lint, the whole suite: green. Commit c2:
   `fix(ssh): N16 S1 — the bridge socket check and Install creds on host delete the key file they wrote`. Its body quotes the RED
   texts of step 2 and the result of each mutation.

No commit holds a red test. S2 starts on top of c2.

## 6. The mutation checks (each one must turn the named tests red; restore after each one)

Each mutation is a temporary edit of the PRODUCT, never of a test. Compile (read the exit), run `personRoadsForgetKey` and
`writtenKey`, read what is red, restore, and compile again before the next one. "Red" below is what was measured (K10 d); a
mutation that turns red something else, or less, is a finding for the lead.

| # | The mutation | Red |
|---|---|---|
| M1 | The socket check runs outside the guard: in `verifyBridgeSocket`, `await withWrittenKey(credential, async () => {` becomes `await (async () => {`, and its closing `});` becomes `})();` | C1, C2, C3, C4, C5, R1 |
| M2 | The install runs outside the guard: the same two edits in the handler of `credSshManager.installRemoteCli` | I1, I2, I3, I4, I5, I6 |
| M3 | The helper deletes the wrong thing: in `forgetWrittenKey`, `materialized` becomes `keyPath`, in both places | C6, I7, U3 |
| M4 | The helper deletes first: the body of `withWrittenKey` becomes `forgetWrittenKey(credential); return await run();` | C1, I1, R1, U1 |
| M5 | The helper has no `finally`: the body becomes `const value = await run(); forgetWrittenKey(credential); return value;` | C5, I6, U2 |
| M6 | The socket check's guard starts too late: the not-ok return, `keyPath`, `argv` and the no-argv return stand BEFORE `await withWrittenKey(credential, async () => {` | C4 |
| M7 | The install's guard starts too late: `await withWrittenKey(credential, async () => {` stands AFTER the return of the probe's timeout | I3 |

M1 and M2 are the first two of "the four forgets" of the parent's §3 item 5; the other two are N1 and N2 of the S2 spec. M3 to
M7 are this spec's own. When S2 is built, M3 also turns B8 and U8 red (measured on the copy with S2).

## 7. Done when (each item can be counted)

- [x] c1 changes only import lines of `commands/agentCommands.ts`; the file has 782 lines at c1 and 787 at c2.
- [x] `git diff -w c1..c2 -- src/commands/agentCommands.ts` shows five added lines and no removed line.
- [x] The 12 RED tests of §4 were watched failing with the texts of §4 on the product of c1, and pass at c2; C6 and I7 were green at
      both.
- [x] `test/writtenKey.test.ts` has U1 to U3 and they pass.
- [x] M1 to M7 each turned red what §6 names, and the product was restored after each (the suite is green at c2).
- [x] `writtenKey.ts` is the only file that calls `forgetMaterializedKey` for these two roads; `commands/agentCommands.ts` does not
      import `../keyInstaller`.
- [x] No file of the list *Files with no change* changed.
- [x] `npm run typecheck`, `npm run lint` and `npm test` are green; the leftovers audit of `npm test` names no folder of this run.

## 8. Break it — ways to make the tests pass while the defect stays, and the row that stops each one

| # | The way | What stops it |
|---|---|---|
| X1 | The world deletes: its stand-in of the resolver or of the runner calls the recorder | The world of §3 calls `forgotten.push` in one place only, the stand-in of `./keyInstaller`. The Opus review reads the world for this (§9) |
| X2 | The product deletes `keyPath`, so the person's own key file is deleted too | C6, I7, U3 (M3) |
| X3 | The product deletes first and runs after | `forgottenBefore` in C1 and I1, the question in I1, the held run of U1, the real file of R1 (M4) |
| X4 | The product deletes only after a run that returned | C5, I6, U2 (M5) |
| X5 | The guard starts too late: an early return leaves before it | C4 for the socket check (M6); I3 for the install (M7); I4 and I5 for the later returns |
| X6 | A test passes because the road was never taken (the timer was not moved, the handler was not registered) | Every test asserts the road first: the count of runs, the message, the log line. `click` throws when the command is not registered. C1 asserts two runs |
| X7 | The socket check is given an opener, so the world answers it from the list of the clicks | Every C test would then get the bridge's credential and `forgotten` would stay `[]`: red. The world says so (§3) |

## 9. Opus review checklist

1. `withWrittenKey` is called in the statement directly after each of the two resolves (`verifyBridgeSocket`, the install); no
   statement stands between the `await resolveExecAuth(…)` and the call.
2. Inside each guarded function the text is the old text, two spaces deeper: `git diff -w` shows five added lines in
   `commands/agentCommands.ts` between c1 and c2 and nothing removed.
3. `writtenKey.ts` is the text of §1: `materialized`, not `keyPath`; a `finally`, not a `catch`; `return await run()` inside the
   `try` (a bare `return run()` would leave the `try` before the promise settles, and the file would be deleted while the run is
   going: U1 is the test).
4. Nothing new can throw out of a cleanup: `forgetMaterializedKey` is unchanged (K2).
5. The socket check still passes no opener; the install still passes `clickOpener(storage, accountId, 'connect')`.
6. No dialog moved out of `registerAgentCommands` or changed its order; `promptSites` is green.
7. The world: the only writer of `forgotten` is the stand-in of `./keyInstaller`; the bridges are the real `SshBridgeManager`; the
   handlers come from `register`.
8. Each RED text in the body of c2 is one of §4, and its test's earlier assertions passed on the unchanged product (the road was
   taken).
9. Each mutation in the body of c2 names what turned red, and it is what §6 says.
10. 782 and 787 lines; no new `eslint-disable`; the file's header unchanged.
11. R1 writes into a folder of `ownedDir` and nowhere else; no test names a temp path by itself.
12. No sentence a person sees and no argv changed: `git diff c1..c2 -- src/commands/agentCommands.ts` shows no changed string.

## 10. Not verified by this spec

- A real `ssh` and a real host. The runner is a stand-in in every test; what is proven is when the file is deleted relative to
  the runs, not that an `ssh` could read it.
- Windows. The suite runs on Ubuntu. After a run that TIMED OUT the runner has asked the child to end; whether `ssh.exe` has
  released the file when the `finally` runs was not measured. A delete that fails there is silent (K2) and the purge of the
  parent's §2.4 retires the file.
- A delete that fails for another reason: silent as on every road today; no test makes one fail.
- The window ending in the middle of a road: no `finally` runs in a killed process. The purge of the next activate or
  deactivate is the parent's §2.4 and is not tested again here.
- The bridge's own key file: S2.

## Notes for the lead

- The socket check and the install are indented two spaces deeper, about 100 lines of diff for five new lines. A named inner
  function per road would avoid the indentation and cost about six more lines each; the budget (§2.4) made the choice.
- The helper takes the whole answer of `resolveExecAuth`, also a refusal, so that nothing stands between the resolve and the
  guard. The warning of the install is therefore shown inside the guard.
- `test/writtenKey.test.ts` cannot be RED first (the module does not exist). Its proof is M3, M4 and M5.
- As built, after the Opus review of S1 (the nits, tests only): C3 now asserts its road first (two runs, the log line
  `its mode could not be read`), so X6 holds for every test; C3b (the socket answers `644`: the warning is shown and the key is
  forgotten) and U3b (a password credential, `auth: 'askpass'` with no `materialized`: nothing is forgotten; also in U8) were added,
  and R1 builds its path with `ownedFile`. Checked by mutation: C3 with a `missing` answer is red; with the guard emptied C3b is red.
