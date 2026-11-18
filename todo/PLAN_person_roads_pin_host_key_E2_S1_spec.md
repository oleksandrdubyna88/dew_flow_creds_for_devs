# PLAN — E2.S1 spec: the client's answer, what `ssh -V` says read as one of three (SECURITY)

> Status: **spec, 2026-11-18, by Fable; nothing of it is built.** A security spec, written before its code (the row *Security
> judgement* of `subagent-models.md`: which client gets which words decides whether a source of trust stays on). Story E2.S1 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its §3.10, the repair R1, and the unit half of test 19 of
> its §5) and of its stories document [PLAN_person_roads_pin_host_key_E2.md](PLAN_person_roads_pin_host_key_E2.md) (`## E2.S1`).
> This file is promoted together with the parent.
>
> Scope: `src_vs_code/src`: new `pinClient.ts`; ONE additive export in `bridgedSshClient.ts` (`versionTokenOf`); new
> `test/pinClient.test.ts`; two lists of `test/noConnectionSharing.test.ts`; one document (§5). Branch `fix/g1-e2-measurements` (or the branch the lead names for E2's build). Each
> `file:line` below was read on `cbeae5b8` (the code of `main` at `f3e9887d`). Fable writes this spec, a Sonnet coder builds it, Opus
> reviews it. The story after it, E2.S2, is
> [PLAN_person_roads_pin_host_key_E2_S2_spec.md](PLAN_person_roads_pin_host_key_E2_S2_spec.md): it is the first caller of this module.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above; a section
named §3.10 and so on is the parent's, and "§2 of this spec" is this document's. This document's own names: the decisions D1 to D8,
the facts K1 to K10, the tests V1 to V6, A1 to A8, R1 and R2, the mutations M1 to M10, the break-its Y1 to Y6. This document keeps no
change ledger: a change of it is an entry in the parent (`plan-change-control.md`).

## What E2.S1 builds, in one paragraph

A pinned call that the extension starts with no terminal, off a bridge, must ask no source of host keys but its pin file (§3.10).
One such source, a config's `KnownHostsCommand`, can be turned off on the command line only from OpenSSH 8.5. A client that does not
know the option ends with `Bad configuration option` when it is given the word. So the word cannot be sent blindly, and it cannot be
left out blindly. This story builds the one thing that answers which of the two it is: a small module that asks the `ssh` program
that a call will start for its version (`ssh -V`) and reads the answer as one of three. **`knows`**: a version at or above 8.5.
**`older`**: a version below 8.5; this is a success of its own, never a failure. **`unreadable`**: no version could be read; E2.S2
refuses such a pinned call before it starts (sentence F). The module touches no road and neither argv builder. Nothing calls it
until E2.S2.

| File | Change | Where |
|---|---|---|
| `bridgedSshClient.ts` | the private `tokenOf` (`:49`) becomes the exported `versionTokenOf`; its one caller (`:69`) names it. 2 lines changed, 0 added. No other export, constant or behaviour of the file changes | §1 |
| `pinClient.ts` (new, 111 lines) | `PinClient`, `ReadablePinClient`, `KNOWN_HOSTS_COMMAND_SINCE`, `pinClientOf(exitCode, stderr)`, `PinClientCall`, `PinClientAsk`, `PinClientParts`, `pinClientAsker(parts?)`, `windowPinClient` | §2 |
| `test/pinClient.test.ts` (new, 241 lines) | 16 tests: V1 to V6 (the reading), A1 to A8 (the asking), R1 and R2 (the real runner) | §3 |
| `test/noConnectionSharing.test.ts` | the two lists of G2 that name every place that starts an `ssh` each gain `pinClient.ts`: 2 comment lines added, 2 lines changed | §3.4 |
| `research/module_tests.md` | one row in the table of the G1 section | §5 |

## Decisions settled before this spec

Each was settled by the lead on 2026-11-18, before this spec was written; D1 to D4 after the question consultants were asked
(consult `133736fc`, both answers). They are binding. A coder who finds one that cannot be built as written stops and tells the lead.

- **D1. A pinned call reads ANY OpenSSH token, on EVERY platform.** The token is the one at the very start of the stderr of
  `ssh -V`: `OpenSSH_N.M` or `OpenSSH_for_Windows_N.M`. The bridged road's rule for `win32` (only the build that Windows ships counts,
  `acceptable`, `bridgedSshClient.ts:55-56`) is NOT used: under it a portable OpenSSH on Windows would read as no version, and every
  pinned call off a bridge would be refused with a sentence that says the version could not be read. This answers the open question
  of the stories document (`## E2.S1`, *Windows*).
- **D2. Three answers.** At or above 8.5: `knows`. A readable version below 8.5: `older`, and the call proceeds without the word.
  No readable token (the spawn failed, the exit code is not 0, the time limit ended it, stderr starts with no token, the token
  stands only on stdout or behind a banner): `unreadable`, and E2.S2 refuses the call with sentence F.
- **D3. `older` is a success of its own.** The type keeps it apart from `unreadable`, so that no reader can fold the two into one
  "not ok". (The bridged check's `ClientVerdict` folds "no version" and "below the floor" into `ok: false`,
  `bridgedSshClient.ts:30`: that is why it cannot be reused whole, K3.)
- **D4. What is kept.** One answer per program, and BOTH readable answers are kept (`knows` and `older`). `unreadable` is never
  kept, so the next pinned call asks again (test 19: "a good answer is asked once per program, a bad one again"; "good" is "a
  version was read").
- **D5. ONE parser, shared by ONE additive export.** The parent says "no second reading of a version is written". The private
  `tokenOf` of `bridgedSshClient.ts` is exported as `versionTokenOf(stderr)`, answering `{ text, version, windowsBuild } | undefined`,
  and `clientVerdictUnder` keeps calling it. No other export, constant or behaviour of that file changes. The remote-bridge session
  owns that file and agreed to exactly this (the lead's message of 2026-11-18). Its PR #380 will not add an export of that name;
  whoever merges second rebases. This replaces two sentences of the stories document ("The exports of `bridgedSshClient.ts` do not
  change"; done-when: "`bridgedSshClient.ts` is unchanged"): see *Notes for the lead*.
- **D6. The bridge's probing conventions are used:** the runner with a time limit (`runSshExec`, `CLIENT_CHECK_TIMEOUT_MS`), the
  token anchored at the start of stderr, and exit code 0 required.
- **D7. The anchored rule stays, and the bridged tests stay green.** `CV1` to `CV7` of `test/bridgedSshClient.test.ts` pass
  before and after, unchanged. The mutation T42 of the bridge's spec (`todo/PLAN_remote_bridge_scoped_E1_S6_spec.md:1226`: drop the
  `^` of the token, and CV7 is red) still turns CV7 red (M8 of this spec).
- **D8. This story writes no sentence and refuses nothing.** Sentence F and the refusal are E2.S2's.

Decided by this spec (each is recorded in *Notes for the lead*): what the question is asked WITH (the same program word, folder and
`PATH` as the call, K5, K6); what an answer is kept UNDER (those three, §2.2); that the question is given no signal of a request or
of the window (§2.2); that the floor's comparison of two numbers is written here (K4).

## Binding constraints

- **No plan change.** Build what the parent, the stories document and this document say. If a step cannot be done as written, a
  code block here does not compile, or a test is not RED or GREEN as this document says: stop and tell the lead. Do not repair the
  parent, the stories document or this document.
- **`bridgedSshClient.ts` gets the two lines of §1 and nothing else.** Read `git diff -- src_vs_code/src/bridgedSshClient.ts`
  before the commit: 2 lines removed, 2 added. If the file has moved under you (PR #380), stop and tell the lead.
- **The RED proof of this story is the missing module** (the stories document: "watched RED (the module does not exist)"). The
  test file is written first, and `npm run typecheck` then fails with the two errors of §3.2. Keep that output. No test runs until
  `tsc` passes: `npm test` runs `tsc` first.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): 800 lines per file, 50 code lines per function (120 in `src/test/`),
  complexity 4. The code of §2 was linted as it stands (K9).
- **Stage by path.** Read `git diff --staged --stat` before the commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history. Never a bare `git stash`. Never commit `.claude/settings.json`. No Python.
- **Local runs** follow `common/local-cpu-budget.md`: through the lowered runner of §*Commands*, one run at a time.
- **Test leftovers.** A test folder is made with `ownedDir` of `scripts/lib/leftovers.cjs`, as `test/bridgedSshClient.test.ts`
  does. No test of this story writes outside such a folder.

## Facts read on `cbeae5b8` that this spec uses

| # | Fact | How it is known |
|---|---|---|
| K1 | `bridgedSshClient.ts`: `Version` is exported (`:19`); `VERSION_TOKEN = /^OpenSSH_(for_Windows_)?(\d+)\.(\d+)/` is private (`:33`); `interface Token { text; version; windowsBuild }` is private (`:43-47`); `tokenOf(stderr)` is private (`:49-52`) and has ONE caller, `clientVerdictUnder` (`:69`); `CLIENT_CHECK_TIMEOUT_MS = 10_000` (`:81`) and the type `ClientRunner` (`:84`) are exported | read; a search of `src_vs_code/src` for `tokenOf` finds no other use of this function (`test/promptSiteWalk.ts` has a method of the same name on a class of its own) |
| K2 | `tsconfig.json` emits no declarations, so an exported function may answer a type that is not exported (`Token`). The exported function then compiles, and a caller reads `.text` and `.version` | measured on a scratch copy: `tsc` exit 0 |
| K3 | `bridgedSshClientCheck` (`:117-131`) cannot be reused whole. Its verdict folds "no version" and "below the floor" into `ok: false`; it applies the `win32` rule through its `platform`; it asks in an empty folder of its own under `keys/<pid>/`, not in the folder of the call; and it keeps a good verdict per program word alone. What IS reused, with no change of an export: the type `ClientRunner`, the constant `CLIENT_CHECK_TIMEOUT_MS`, the runner `runSshExec`, and `bridgedSshEnv` | read |
| K4 | `atLeast` (`:38-40`), the comparison of two versions, is private, and D5 allows ONE export. So `pinClient.ts` compares two numbers itself (`atOrAbove`, one line). It is not a reading of a version: the token and its numbers come from `versionTokenOf` | read |
| K5 | **Which program a call starts.** The three roads of the person start the bare word `ssh` with no `cwd` and the environment of the credential (`runSshExec`'s default, `sshExecRunner.ts:95`; `agentCommands.ts:179`, `:211`, `:347`, `:455`); that environment is `process.env` with, for a password, the askpass variables (`sshExecAuth.ts:97`, `:151`, `:172`). The agent's exec starts the program of `sshSpawnLaunch` with no `cwd` (`sshUseActions.ts:125`, `:340`). *Run with Secrets* starts `spawnableSshProgram`'s program in the storage folder (`sshRoad.ts:79-88`). A bare word is found through `PATH`; on Windows the current folder is searched first (`sshProgram.ts:187-199`) | read |
| K6 | So the question finds the program that the call will find only when it is started with the same three things: the program word, the folder (or none), and the `PATH` of the call's environment. The bridged check's empty folder would ask ANOTHER program than a call that starts a bare word in the window's own folder on Windows. A wrong answer there is not harmless in one direction: "knows" for a client that is older ends the call (`Bad configuration option`), but "older" for a client that knows the option leaves a config's `KnownHostsCommand` on | reasoned from K5; measured for the last part with `ssh -G`, K8 |
| K7 | `bridgedSshEnv(source, platform)` (`bridgedSshEnv.ts`) answers a NEW object with the names that decide the lookup and that `ssh -V` needs: `PATH`, `HOME` off Windows; seven names on Windows, among them `PROGRAMDATA`, without which Win32-OpenSSH answers 255 and prints nothing (its docblock, M9 there). It takes no askpass variable and no agent socket unless a caller names them as `extra`. The question names none | read |
| K8 | Measured 2026-11-18, OpenSSH 10.2p1, `ssh -G`, the client alone: under a config that says `KnownHostsCommand /bin/echo x`, a command line WITHOUT `-o KnownHostsCommand=none` resolves `knownhostscommand /bin/echo x`; with the word it prints no such line. And `ssh -V` of this client prints `OpenSSH_10.2p1 Ubuntu-…, OpenSSL …` on stderr, exit code 0, nothing on stdout | measured |
| K9 | The code of §2 and §3 as it stands here: `tsc` exit 0; `eslint` clean on `pinClient.ts`, `bridgedSshClient.ts` and `test/pinClient.test.ts`; the 16 tests pass; the 19 tests of `test/bridgedSshClient.test.ts` pass with §1 applied | measured on a scratch copy of `cbeae5b8`, Node 26, Linux |
| K10 | **A scan knows every place that starts an `ssh`.** `test/noConnectionSharing.test.ts` holds two lists (G2): the functions that call `runSshExec` (`:146`) and the modules that import the runner (`:188`). A new module that names the runner turns both red until it is listed: measured, the whole suite on the scratch copy had exactly these two failures of its own after §2 (`G2: an ssh is started from an argv only at the listed places`, `G2: no other door to a spawned ssh…`). `bridgedSshClient.ts` is listed there for the same `-V` | measured |

**Not measured:** a client older than 8.5 (what it prints for `-V`, and that it ends at the unknown word: E3's M11); Windows'
`ssh.exe` (the fixture `OpenSSH_for_Windows_9.5p2` is the text of the bridge's own tests); which program Windows finds for a bare
word in a folder that holds an `ssh.exe` (read, `sshProgram.ts:187-199`).

## Commands

```bash
cd src_vs_code
LP=../.agents/conventions/tools/low-priority.mjs
node $LP npx tsc -p ./ --noEmit                                   # typecheck
node $LP npx tsc -p ./                                            # compile to out/
node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/pinClient.test.js"
node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/bridgedSshClient.test.js"
node $LP npx eslint src/pinClient.ts src/bridgedSshClient.ts src/test/pinClient.test.ts
npm test                                                          # the whole suite, before the commit
```

## 1. `bridgedSshClient.ts`: the one export

Two lines change. The function keeps its body, its doc line above it (`:42`, the docblock of `Token`) and its place.

```diff
--- a/src_vs_code/src/bridgedSshClient.ts
+++ b/src_vs_code/src/bridgedSshClient.ts
@@ -47,5 +47,5 @@
 }
 
-function tokenOf(stderr: string): Token | undefined {
+export function versionTokenOf(stderr: string): Token | undefined {
   const found = VERSION_TOKEN.exec(stderr);
   return found === null ? undefined : { text: found[0], version: [Number(found[2]), Number(found[3])], windowsBuild: found[1] !== undefined };
@@ -67,5 +67,5 @@
 /** `clientVerdict` under a floor of the caller's: what a test says when it is about the rule and not about the constant. */
 export function clientVerdictUnder(floor: BridgedFloor, exit: number | null, _stdout: string, stderr: string, platform: NodeJS.Platform): ClientVerdict {
-  const token = exit === 0 ? tokenOf(stderr) : undefined;
+  const token = exit === 0 ? versionTokenOf(stderr) : undefined;
   if (token === undefined) {
     return { ok: false, sentence: sentences.clientNoVersion(exit) };
```

Nothing else: `VERSION_TOKEN`, `Token`, `atLeast`, `acceptable`, `clientVerdict`, `clientVerdictUnder`, `BRIDGED_SSH_FLOOR`, the
check and its parts stay as they are. `Token` stays private (K2).

## 2. `pinClient.ts` (new)

### 2.1 The file

```ts
import { CLIENT_CHECK_TIMEOUT_MS, ClientRunner, Version, versionTokenOf } from './bridgedSshClient';
import { bridgedSshEnv } from './bridgedSshEnv';
import { runSshExec } from './sshExecRunner';

/**
 * What the `ssh` program says of itself, read for a PINNED call that the extension starts with no terminal, off a bridge (G1, E2: the
 * plan's §3.10). A pinned call must ask no source of host keys but its pin file. One such source, `KnownHostsCommand`, can be turned off
 * on the command line only from OpenSSH 8.5; an older client ends with `Bad configuration option` when it is given the word. So the
 * client is asked what it is, and there are three answers:
 *
 * <ul>
 * <li>`knows`: a version at or above 8.5. The words of the call turn the option off (`hostKeyWords`).</li>
 * <li>`older`: a version below 8.5. Such a client has no `KnownHostsCommand`, so the word is left out. This is a success of its own.</li>
 * <li>`unreadable`: no version could be read. The pinned call is refused before it starts (sentence F, `hostKeyPin.ts`).</li>
 * </ul>
 *
 * <p><b>Where the reading comes from.</b> The token is the bridged road's, `versionTokenOf` of `bridgedSshClient.ts`: an OpenSSH token at
 * the very start of the stderr of `ssh -V`, after an exit code of 0. A version on stdout, or later in a line, is no version. Nothing else of
 * that module's rule applies here: any OpenSSH build counts on every platform (the portable one on Windows too), and there is no floor
 * below which a call is refused.</p>
 *
 * <p><b>What it does not decide:</b> whether a call is pinned (an unpinned call is never asked), what the words are (`hostKeyWords`), and
 * what a person is told. It does not prove that the program that answered is the one that then runs: it asks with the same program word,
 * folder and `PATH` as the call, a moment before it.</p>
 */

/** The first OpenSSH that knows `KnownHostsCommand` (read in its release notes; no older client was run: E3's M11). */
export const KNOWN_HOSTS_COMMAND_SINCE: Version = [8, 5];

export type PinClient =
  | { readonly kind: 'knows'; readonly token: string }
  | { readonly kind: 'older'; readonly token: string }
  | { readonly kind: 'unreadable'; readonly exitCode: number | null };

/** A client whose version was read, on either side of 8.5: the only kind the words of a pinned call can be written for. */
export type ReadablePinClient = Exclude<PinClient, { kind: 'unreadable' }>;

/** Whether `version` is at or above `since`: major and minor compared as numbers. */
function atOrAbove(version: Version, since: Version): boolean {
  return version[0] > since[0] || (version[0] === since[0] && version[1] >= since[1]);
}

/** Reads one answer of `ssh -V`. `token` is the matched text (`OpenSSH_8.4`), and no other part of the output is kept. */
export function pinClientOf(exitCode: number | null, stderr: string): PinClient {
  const token = exitCode === 0 ? versionTokenOf(stderr) : undefined;
  if (token === undefined) {
    return { kind: 'unreadable', exitCode };
  }
  return { kind: atOrAbove(token.version, KNOWN_HOSTS_COMMAND_SINCE) ? 'knows' : 'older', token: token.text };
}

// ---- the spawn that asks -------------------------------------------------------------------------------------------------------------

/** One question: the program the call will start, the folder it will start in (absent: the window's own), and the environment it will get. */
export interface PinClientCall {
  readonly program: string;
  readonly cwd?: string;
  readonly env: NodeJS.ProcessEnv;
}

export type PinClientAsk = (call: PinClientCall) => Promise<PinClient>;

/** What the asker is built from; every part is for a test to say. */
export interface PinClientParts {
  readonly run?: ClientRunner;
  readonly platform?: NodeJS.Platform;
  readonly timeoutMs?: number;
}

/**
 * The asker of one window: `ssh -V` through the runner, under its time limit. It is started as the call will be: the same program word,
 * the same folder, and the names of the call's environment that decide which program a bare word finds (`bridgedSshEnv`: `PATH` and
 * `HOME`, or the Windows names). Nothing else of that environment goes to the child: no askpass password, no agent socket.
 *
 * <p>A version that was read, on either side of 8.5, is kept for this asker's life, per program word, folder and `PATH`.
 * `unreadable` is never kept, so the next pinned call asks again. It never throws: a runner that fails is `unreadable` with no exit
 * code. It is given no signal of a request or of the window: the time limit ends the child, and the call's own run refuses a request
 * that has gone, as before.</p>
 */
export function pinClientAsker(given: PinClientParts = {}): PinClientAsk {
  const parts = { run: runSshExec, platform: process.platform, timeoutMs: CLIENT_CHECK_TIMEOUT_MS, ...given };
  const kept = new Map<string, ReadablePinClient>();
  return async (call) => {
    const env = bridgedSshEnv(call.env, parts.platform);
    const key = keptUnder(call, env);
    const read = kept.get(key) ?? (await asked(parts, call, env));
    if (read.kind !== 'unreadable') {
      kept.set(key, read);
    }
    return read;
  };
}

/** What an answer is kept under: the program word, the folder and the `PATH`, which together decide which program a call starts. */
function keptUnder(call: PinClientCall, env: NodeJS.ProcessEnv): string {
  return [call.program, call.cwd ?? '', env.PATH ?? ''].join('\0');
}

/** One run of `ssh -V`, read; a runner that fails is a client that did not answer. */
async function asked(parts: Required<PinClientParts>, call: PinClientCall, env: NodeJS.ProcessEnv): Promise<PinClient> {
  const where = call.cwd === undefined ? {} : { cwd: call.cwd };
  try {
    const outcome = await parts.run(['-V'], { program: call.program, env, timeoutMs: parts.timeoutMs, ...where });
    return pinClientOf(outcome.exitCode, outcome.stderr);
  } catch {
    return { kind: 'unreadable', exitCode: null };
  }
}

/** The asker of this window: one per extension host, so a version that was read is asked once for the window's life. */
export const windowPinClient: PinClientAsk = pinClientAsker();
```

### 2.2 Why each part is as it is

- **`pinClientOf` takes the exit code and stderr, and nothing else.** No stdout (a version there is no version), no platform
  (D1). Its two parameters are a test (V3: `pinClientOf.length === 2`).
- **`token` is the matched text only** (`OpenSSH_8.4`, `OpenSSH_for_Windows_9.5`): the anchored pattern's own match, so no other
  part of the program's output can travel in the answer. E2.S2's sentence F holds the exit code and no token.
- **The question is started as the call will be** (K5, K6): the caller hands over the program word, the folder when the call has
  one, and the environment the call will get. The asker reduces that environment with `bridgedSshEnv` (K7): the lookup names stay,
  an askpass password and the agent's socket do not reach a process that needs neither.
- **What an answer is kept under: the program word, the folder and the `PATH`** (`keptUnder`). Those three decide which program
  starts. D4 says "per program"; a bare word under another `PATH`, or in another folder on Windows, is another program.
- **No signal of a request or of the window.** `ssh -V` connects to nothing and reads no input (the runner gives it no stdin). The
  time limit ends a child that hangs. A request that has gone is refused by the call's own run, which gets the guards as before
  (`runSshExec`, `alreadyGone`, `sshExecRunner.ts:122-125`), so the asker never throws and needs no case for it. This is why the
  fixture "a request that ended goes on as its error" of the stories document has no test here: see *Notes for the lead*.
- **Two calls at once** that find nothing kept each ask (A8). The answers are the same, the cost is one more short run, and no
  promise is kept in the map: a kept promise that then answers `unreadable` would have to be taken out again.
- **`windowPinClient`** is the one asker of a window: a module is loaded once per extension host. E2.S2's callers name it; a test
  stands in for it by the request string `./pinClient`.

### 2.3 Every way out of `pinClientAsker(...)(call)`

| # | What happens | The answer | Kept |
|---|---|---|---|
| 1 | an answer is kept for this program word, folder and `PATH` | that answer; no child starts | it stays |
| 2 | exit code 0, stderr starts with a token at or above 8.5 | `{ kind: 'knows', token }` | yes |
| 3 | exit code 0, stderr starts with a token below 8.5 | `{ kind: 'older', token }` | yes |
| 4 | exit code 0, stderr starts with no token (empty; a banner first; the token on stdout only) | `{ kind: 'unreadable', exitCode: 0 }` | no |
| 5 | an exit code that is not 0, whatever stderr holds | `{ kind: 'unreadable', exitCode: <n> }` | no |
| 6 | the time limit ended the child, or a signal did (`exitCode` is `null`) | `{ kind: 'unreadable', exitCode: null }` | no |
| 7 | the runner rejects (no `ssh` at all: `ENOENT`) or throws at once | `{ kind: 'unreadable', exitCode: null }` | no |

It never throws. `bridgedSshEnv` throws only for an `extra` name, and the asker hands it none.

## 3. `test/pinClient.test.ts` (new)

### 3.1 The file

```ts
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestContext, test } from 'node:test';
import { ownedDir } from '../../scripts/lib/leftovers.cjs';
import { CLIENT_CHECK_TIMEOUT_MS, ClientRunner, clientVerdict, versionTokenOf } from '../bridgedSshClient';
import { BRIDGED_ENV_POSIX, BRIDGED_ENV_WINDOWS, bridgedSshEnv } from '../bridgedSshEnv';
import { KNOWN_HOSTS_COMMAND_SINCE, PinClient, PinClientCall, pinClientAsker, pinClientOf } from '../pinClient';

/**
 * G1, E2.S1: what the `ssh` program says of itself, read for a pinned call as one of three (the parent's §3.10, test 19, its unit half).
 * `knows`: OpenSSH 8.5 or newer, so `KnownHostsCommand=none` can be written. `older`: a version below 8.5, which has no such option.
 * `unreadable`: no version could be read, and a pinned call is then refused (E2.S2). The token is the bridged road's
 * (`versionTokenOf`); the floor, the platforms and what is kept are this plan's own.
 */

const knows = (token: string): PinClient => ({ kind: 'knows', token });
const older = (token: string): PinClient => ({ kind: 'older', token });
const unreadable = (exitCode: number | null): PinClient => ({ kind: 'unreadable', exitCode });

test('V1: a version at or above 8.5 knows the option: 10.2, 8.5 itself, 9.0, 8.10 (numbers, not text) and 11.0', () => {
  assert.deepEqual(pinClientOf(0, 'OpenSSH_10.2p1 Ubuntu-2ubuntu3.8, OpenSSL 3.5.5 27 Jan 2026\n'), knows('OpenSSH_10.2'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_8.5p1, OpenSSL 1.1.1k\n'), knows('OpenSSH_8.5'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_9.0p1\n'), knows('OpenSSH_9.0'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_8.10p1\n'), knows('OpenSSH_8.10'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_11.0\n'), knows('OpenSSH_11.0'));
  assert.deepEqual(KNOWN_HOSTS_COMMAND_SINCE, [8, 5]);
});

test('V2: a version below 8.5 is OLDER, a success of its own and never "unreadable": 8.4, 7.9, 6.6 and 8.1 of Windows', () => {
  assert.deepEqual(pinClientOf(0, 'OpenSSH_8.4p1 Debian-5+deb11u3, OpenSSL 1.1.1w\n'), older('OpenSSH_8.4'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_7.9p1\n'), older('OpenSSH_7.9'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_6.6.1p1\n'), older('OpenSSH_6.6'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_for_Windows_8.1p1, LibreSSL 3.0.2\r\n'), older('OpenSSH_for_Windows_8.1'));
});

test('V3: any OpenSSH token counts on every platform: the build that Windows ships and the portable one read alike (not the bridge\'s win32 rule)', () => {
  assert.deepEqual(pinClientOf(0, 'OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2\r\n'), knows('OpenSSH_for_Windows_9.5'));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_9.9p1, OpenSSL 3.3.2\n'), knows('OpenSSH_9.9'));
  // The control: the bridged road refuses the portable build on win32 (its CV4). This reading takes no platform at all.
  assert.equal(clientVerdict(0, '', 'OpenSSH_9.9p1, OpenSSL 3.3.2\n', 'win32').ok, false);
  assert.equal(pinClientOf.length, 2, 'exit code and stderr: no platform, no stdout');
});

test('V4: no token at the very start of stderr is unreadable, with the exit code: empty, a banner first, a token later in a line, a blank first line', () => {
  assert.deepEqual(pinClientOf(0, ''), unreadable(0));
  assert.deepEqual(pinClientOf(0, 'banner OpenSSH_9.9p1\n'), unreadable(0));
  assert.deepEqual(pinClientOf(0, 'Warning: something\nOpenSSH_9.9p1\n'), unreadable(0));
  assert.deepEqual(pinClientOf(0, '\nOpenSSH_9.9p1\n'), unreadable(0));
  assert.deepEqual(pinClientOf(0, ' OpenSSH_9.9p1\n'), unreadable(0));
  assert.deepEqual(pinClientOf(0, 'Dropbear v2022.83\n'), unreadable(0));
  assert.deepEqual(pinClientOf(0, 'OpenSSH_9\n'), unreadable(0), 'a token with no minor number is no version');
});

test('V5: an exit that is not 0 is unreadable even with a token in stderr; a killed child (no exit code) too', () => {
  assert.deepEqual(pinClientOf(1, 'OpenSSH_10.2p1\n'), unreadable(1));
  assert.deepEqual(pinClientOf(255, ''), unreadable(255));
  assert.deepEqual(pinClientOf(null, 'OpenSSH_10.2p1\n'), unreadable(null));
});

test('V6: the reading is the bridged road\'s one parser: for each fixture the token is `versionTokenOf`\'s, text and numbers', () => {
  for (const stderr of ['OpenSSH_10.2p1 x\n', 'OpenSSH_8.4p1\n', 'OpenSSH_for_Windows_9.5p2\r\n']) {
    const token = versionTokenOf(stderr);
    const read = pinClientOf(0, stderr);
    assert.ok(token !== undefined && read.kind !== 'unreadable');
    assert.equal(read.token, token.text);
  }
  assert.deepEqual(versionTokenOf('OpenSSH_for_Windows_9.5p2\r\n'), { text: 'OpenSSH_for_Windows_9.5', version: [9, 5], windowsBuild: true });
  assert.deepEqual(versionTokenOf('OpenSSH_10.2p1 x\n'), { text: 'OpenSSH_10.2', version: [10, 2], windowsBuild: false });
  assert.equal(versionTokenOf('banner OpenSSH_9.9p1'), undefined);
});

/* ---- the asking ---------------------------------------------------------------------------------------------------- */

interface Seen {
  argv: string[];
  options: Parameters<ClientRunner>[1];
}

/** A runner that records each call and answers what the test says, in order; the last answer repeats. */
function recordingRunner(answers: readonly (() => ReturnType<ClientRunner>)[]): { run: ClientRunner; seen: Seen[] } {
  const seen: Seen[] = [];
  const run: ClientRunner = (argv, options) => {
    seen.push({ argv, options });
    return answers[Math.min(seen.length - 1, answers.length - 1)]();
  };
  return { run, seen };
}

const answer = (exitCode: number | null, stderr: string, stdout = ''): (() => ReturnType<ClientRunner>) => () => Promise.resolve({ exitCode, stdout, stderr });
const NEW = answer(0, 'OpenSSH_10.2p1 Ubuntu-2ubuntu3\n');
const OLD = answer(0, 'OpenSSH_8.4p1 Debian-5\n');
const NONE = answer(1, '');
/** The environment of a call: the lookup names, a password of an askpass login, and the agent's socket. */
const CALL_ENV: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: '/home/someone', CREDS_SSH_PASSWORD: 'a-secret', SSH_ASKPASS: '/x/askpass', SSH_AUTH_SOCK: '/run/agent.sock' };
const call = (more: Partial<PinClientCall> = {}): PinClientCall => ({ program: 'ssh', env: CALL_ENV, ...more });

test('A1: the question is `ssh -V` of the call\'s program, in the call\'s folder, with the lookup names of the call\'s environment and no secret of it, under the 10 s bound', async () => {
  const { run, seen } = recordingRunner([NEW]);
  const ask = pinClientAsker({ run, platform: 'linux' });

  assert.deepEqual(await ask(call({ program: '/opt/ssh', cwd: '/some/folder' })), knows('OpenSSH_10.2'));

  assert.equal(seen.length, 1);
  const [one] = seen;
  assert.deepEqual(one.argv, ['-V']);
  assert.equal(one.options.program, '/opt/ssh');
  assert.equal(one.options.cwd, '/some/folder');
  assert.deepEqual(one.options.env, bridgedSshEnv(CALL_ENV, 'linux'));
  assert.deepEqual(Object.keys(one.options.env).sort(), [...BRIDGED_ENV_POSIX].sort(), 'PATH and HOME: no password, no askpass, no agent socket');
  assert.equal(one.options.timeoutMs, CLIENT_CHECK_TIMEOUT_MS);
  assert.equal(CLIENT_CHECK_TIMEOUT_MS, 10_000);
  assert.equal(one.options.signal, undefined);
  assert.equal(one.options.startGate, undefined);
});

test('A2: a call that names no folder is asked in none (the runner then starts it in the window\'s own, as the call will be); on win32 the lookup names are Windows\'', async () => {
  const { run, seen } = recordingRunner([NEW]);
  const source: NodeJS.ProcessEnv = { Path: 'C:\\Windows\\System32\\OpenSSH', SystemRoot: 'C:\\Windows', ProgramData: 'C:\\ProgramData', CREDS_SSH_PASSWORD: 'a-secret' };

  await pinClientAsker({ run, platform: 'win32' })({ program: 'ssh', env: source });

  assert.equal('cwd' in seen[0].options, false, 'no cwd key at all');
  assert.deepEqual(seen[0].options.env, bridgedSshEnv(source, 'win32'));
  assert.equal(Object.keys(seen[0].options.env).every((name) => [...BRIDGED_ENV_WINDOWS, 'USERNAME', 'USERDOMAIN', 'LOGONSERVER'].includes(name)), true);
});

test('A3: BOTH readable answers are kept: a new client and an older one are each asked once, however many calls follow', async () => {
  const fresh = recordingRunner([NEW]);
  const askNew = pinClientAsker({ run: fresh.run, platform: 'linux' });
  assert.deepEqual([await askNew(call()), await askNew(call()), await askNew(call())], [knows('OpenSSH_10.2'), knows('OpenSSH_10.2'), knows('OpenSSH_10.2')]);
  assert.equal(fresh.seen.length, 1);

  const aged = recordingRunner([OLD, NEW]);
  const askOld = pinClientAsker({ run: aged.run, platform: 'linux' });
  assert.deepEqual([await askOld(call()), await askOld(call())], [older('OpenSSH_8.4'), older('OpenSSH_8.4')]);
  assert.equal(aged.seen.length, 1, 'the older answer is a good answer: it is not asked again');
});

test('A4: "unreadable" is never kept: the next call asks again, and takes the answer it then gets', async () => {
  const { run, seen } = recordingRunner([NONE, NONE, OLD]);
  const ask = pinClientAsker({ run, platform: 'linux' });

  assert.deepEqual(await ask(call()), unreadable(1));
  assert.deepEqual(await ask(call()), unreadable(1));
  assert.deepEqual(await ask(call()), older('OpenSSH_8.4'));
  assert.deepEqual(await ask(call()), older('OpenSSH_8.4'));
  assert.equal(seen.length, 3);
});

test('A5: an answer is kept for one program, one folder and one PATH: another program, another folder and another PATH are each asked', async () => {
  const { run, seen } = recordingRunner([NEW]);
  const ask = pinClientAsker({ run, platform: 'linux' });

  await ask(call());
  await ask(call({ program: '/opt/ssh' }));
  await ask(call({ cwd: '/some/folder' }));
  await ask(call({ env: { ...CALL_ENV, PATH: '/opt/bin:/usr/bin' } }));
  await ask(call({ env: { ...CALL_ENV, CREDS_SSH_PASSWORD: 'another' } }));
  await ask(call());

  assert.deepEqual(seen.map((one) => [one.options.program, one.options.cwd, one.options.env.PATH]), [
    ['ssh', undefined, '/usr/bin'],
    ['/opt/ssh', undefined, '/usr/bin'],
    ['ssh', '/some/folder', '/usr/bin'],
    ['ssh', undefined, '/opt/bin:/usr/bin'],
  ]);
});

test('A6: a runner that cannot start ssh, and one that throws at once, are "unreadable" with no exit code; the asker never throws, and asks again', async () => {
  const failing: ClientRunner = () => Promise.reject(new Error('spawn ssh ENOENT'));
  const throwing: ClientRunner = () => {
    throw new Error('EACCES');
  };

  assert.deepEqual(await pinClientAsker({ run: failing, platform: 'linux' })(call()), unreadable(null));
  assert.deepEqual(await pinClientAsker({ run: throwing, platform: 'linux' })(call()), unreadable(null));

  const { run, seen } = recordingRunner([() => Promise.reject(new Error('spawn ssh ENOENT')), NEW]);
  const ask = pinClientAsker({ run, platform: 'linux' });
  assert.deepEqual([await ask(call()), await ask(call())], [unreadable(null), knows('OpenSSH_10.2')]);
  assert.equal(seen.length, 2);
});

test('A7: a version on stdout only is "unreadable": stdout is never read', async () => {
  const { run } = recordingRunner([answer(0, '', 'OpenSSH_10.2p1\n')]);
  assert.deepEqual(await pinClientAsker({ run, platform: 'linux' })(call()), unreadable(0));
});

test('A8: two calls at once that find nothing kept each ask, and both get the answer; the next call asks no more', async () => {
  const { run, seen } = recordingRunner([NEW]);
  const ask = pinClientAsker({ run, platform: 'linux' });

  assert.deepEqual(await Promise.all([ask(call()), ask(call())]), [knows('OpenSSH_10.2'), knows('OpenSSH_10.2')]);
  await ask(call());

  assert.equal(seen.length, 2, 'at most one question per call that found nothing kept; none after');
});

/* ---- the real runner -------------------------------------------------------------------------------------------------- */

/** A stand-in `ssh`: a shell script in a folder of its own, named to the asker as the program. */
function standIn(t: TestContext, body: string): string {
  const file = path.join(ownedDir(t, 'standin'), 'ssh');
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

const posix = process.platform === 'win32' ? { skip: 'a shell script stands in for ssh' } : {};

test('R1: the real runner: a stand-in of 10.2 knows, one of 8.4 is older, one that exits 255 is unreadable with 255, one that never answers is killed at the bound', posix, async (t) => {
  const ask = pinClientAsker({ timeoutMs: 1_000 });
  const marker = path.join(ownedDir(t, 'marker'), 'ran');
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };

  assert.deepEqual(await ask({ program: standIn(t, 'echo "OpenSSH_10.2p1 Ubuntu, OpenSSL 3.5" >&2'), env }), knows('OpenSSH_10.2'));
  assert.deepEqual(await ask({ program: standIn(t, 'echo "OpenSSH_8.4p1 Debian" >&2'), env }), older('OpenSSH_8.4'));
  assert.deepEqual(await ask({ program: standIn(t, 'echo "OpenSSH_10.2p1"; exit 0'), env }), unreadable(0), 'the version on stdout only');
  assert.deepEqual(await ask({ program: standIn(t, 'exit 255'), env }), unreadable(255));
  const startedAt = Date.now();
  const silent = await ask({ program: standIn(t, `sleep 2; echo done > "${marker}"; exec sleep 30`), env });

  assert.deepEqual(silent, unreadable(null));
  assert.ok(Date.now() - startedAt < 5_000, 'it did not wait for the child');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(fs.existsSync(marker), false, 'the child was killed at the bound and never went on');
});

/** The `ssh` of this machine's PATH, when it has one: the test below is skipped without it, and says so. */
function pathSsh(): string | undefined {
  const names = process.platform === 'win32' ? ['ssh.exe'] : ['ssh'];
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter((dir) => dir !== '');
  return dirs.flatMap((dir) => names.map((name) => path.join(dir, name))).find((file) => fs.existsSync(file));
}

test('R2: the real client of this machine\'s PATH answers a version that can be read (skipped where PATH has no ssh)', pathSsh() === undefined ? { skip: 'no ssh on PATH' } : {}, async () => {
  const read = await pinClientAsker()({ program: 'ssh', env: process.env });

  assert.notEqual(read.kind, 'unreadable', JSON.stringify(read));
  assert.match((read as { token: string }).token, /^OpenSSH_(for_Windows_)?\d+\.\d+$/);
});
```

### 3.2 RED first

Write §3.1 before §1 and §2. Then `node $LP npx tsc -p ./ --noEmit` fails with exactly these two errors (measured on a scratch
copy of `cbeae5b8`, 2026-11-18), and no test runs:

```text
src/test/pinClient.test.ts(6,64): error TS2305: Module '"../bridgedSshClient"' has no exported member 'versionTokenOf'.
src/test/pinClient.test.ts(8,98): error TS2307: Cannot find module '../pinClient' or its corresponding type declarations.
```

After §1 alone the first error goes and the second stays. After §2: `tsc` exit 0, and the file's 16 tests pass (R1 takes about
2.3 s: it waits for the time limit of one stand-in). On a machine with no `ssh` on its `PATH`, R2 is skipped and says so. R1 is skipped on
Windows, where a shell script cannot stand in for `ssh` (as the real-runner test of `test/bridgedSshClient.test.ts` is).

### 3.3 What each test holds

| # | Test | What it holds |
|---|---|---|
| V1 | a version at or above 8.5 knows the option | 8.5 itself, and `8.10` as numbers (a comparison of text would call `8.10` older) |
| V2 | a version below 8.5 is OLDER | D3: a success of its own; also the Windows build below 8.5 |
| V3 | any OpenSSH token counts on every platform | D1, with the control: the bridged reading refuses the same text on `win32` |
| V4 | no token at the very start of stderr is unreadable | D2, D7: a banner first, a blank first line, a leading space, another program |
| V5 | an exit code that is not 0 is unreadable | D6 |
| V6 | the token is `versionTokenOf`'s | D5: one parser |
| A1, A2 | the question is `ssh -V` of the call's program, folder and lookup names | K5 to K7; no secret of the environment goes to the child |
| A3 | BOTH readable answers are kept | D4 |
| A4 | `unreadable` is never kept | D4 |
| A5 | kept per program word, folder and `PATH` | §2.2 |
| A6 | a runner that fails is `unreadable`; the asker never throws | §2.3, row 7 |
| A7 | a version on stdout only is `unreadable` | D2 |
| A8 | two calls at once | §2.2 |
| R1 | the real runner, with stand-ins | the time limit kills the child; the exit code is kept |
| R2 | the real client of this machine | the token of a real `ssh -V` is read |

### 3.4 `test/noConnectionSharing.test.ts`: the two lists (K10)

`pinClient.ts` starts an `ssh` whose one argv is `-V`: no connection, so no argv builder and no `NO_CONNECTION_SHARING`. It is
listed beside the bridged check, with its reason.

```diff
--- a/src_vs_code/src/test/noConnectionSharing.test.ts
+++ b/src_vs_code/src/test/noConnectionSharing.test.ts
@@ -144,5 +144,6 @@
     usesOf('runSshExec', 'sshExecRunner'),
     // E1.6: execOverSsh's run is runCall (its options from runOptions); the client check (bridgedSshClientCheck) runs `ssh -V` alone, no connection.
-    ['bridgedSshClient.ts#bridgedSshClientCheck', 'commands/agentCommands.ts#runRemote', 'commands/agentCommands.ts#sweepDeadSockets', 'commands/agentCommands.ts#verifyBridgeSocket', 'sshUseActions.ts#runCall', 'sshUseActions.ts#runOptions'],
+    // G1, E2.S1: the asker of a pinned call (pinClientAsker) runs `ssh -V` alone too, no connection.
+    ['bridgedSshClient.ts#bridgedSshClientCheck', 'commands/agentCommands.ts#runRemote', 'commands/agentCommands.ts#sweepDeadSockets', 'commands/agentCommands.ts#verifyBridgeSocket', 'pinClient.ts#pinClientAsker', 'sshUseActions.ts#runCall', 'sshUseActions.ts#runOptions'],
     HOW_TO_FIX,
   );
@@ -186,5 +187,6 @@
     [...new Set(matchesOf(/['"]\.{1,2}\/(?:[\w-]+\/)*sshExecRunner['"]/g))],
     // E1.6: bridgedSshClient.ts names the runner for the client check, whose one argv is `-V` (no connection).
-    ['agentUseActions.ts', 'bridgedSshClient.ts', 'commands/agentCommands.ts', 'configWrite.ts', 'gitTracked.ts', 'hostKeyTrust.ts', 'sshUseActions.ts', 'transportFactory.ts'],
+    // G1, E2.S1: pinClient.ts names it for the same question of a pinned call off a bridge, with the same one argv.
+    ['agentUseActions.ts', 'bridgedSshClient.ts', 'commands/agentCommands.ts', 'configWrite.ts', 'gitTracked.ts', 'hostKeyTrust.ts', 'pinClient.ts', 'sshUseActions.ts', 'transportFactory.ts'],
     HOW_TO_FIX,
   );
```

The file keeps its 9 tests (8 pass, 1 skipped, as before).

## 4. The mutation checks

Each one must turn the named tests red; restore after each one and watch the 16 pass again. Measured 2026-11-18 on the compiled
module of the scratch copy; the coder repeats them on the source and records each in the commit body.

| # | The mutation | Red |
|---|---|---|
| M1 | `pinClientOf` answers `older` where it answers `unreadable` (the parent's test 26: read "cannot be read" as "below 8.5") | V4, V5, A4, A7, R1 |
| M2 | drop `exitCode === 0 ?` (read the token whatever the exit code) | V5 |
| M3 | keep every answer (drop the `if` before `kept.set`) | A4, A6 |
| M4 | keep only `knows` | A3, A4 |
| M5 | `>` in place of `>=` for the minor number | V1 |
| M6 | hand the child the call's whole environment (drop `bridgedSshEnv`) | A1, A2 |
| M7 | keep an answer under the program word alone | A5 |
| M8 | in `bridgedSshClient.ts`, drop the `^` of `VERSION_TOKEN` (the bridge's T42) | CV7 of `test/bridgedSshClient.test.ts`; V4 and V6 here |
| M9 | drop `timeoutMs` from the runner's options | A1, R2 |
| M10 | compare the versions as text | V1, and with it A1, A3, A6, A8, R1 |

## 5. Documents

`research/module_tests.md`, the table of the section `## The three roads of the person and the saved host key (G1)` (`:2543`): one
new row, after the row of `hostKeyWords.test.ts`. The count is read from the runner's output, not copied from here.

```markdown
| `pinClient.test.ts` | 16 | E2.S1 (the plan's §3.10): what the `ssh` program says of itself, read for a pinned call as one of three. V1 to V6, the reading alone: a version at or above 8.5 `knows` `KnownHostsCommand` (8.5 itself, `8.10` as numbers); one below is `older`, a success of its own; any OpenSSH token counts on every platform (the control: the bridged reading refuses the portable build on `win32`); no token at the very start of stderr, a token on stdout, and an exit code that is not 0 are `unreadable`; the token is `versionTokenOf`'s, the bridged road's one parser. A1 to A8, the asking through a recording runner: `ssh -V` of the call's program, in the call's folder, with the lookup names of the call's environment and no secret of it, under the 10 s bound; both readable answers are kept per program word, folder and `PATH`, `unreadable` never; a runner that fails is `unreadable`, and the asker never throws. R1, the real runner with stand-in scripts (not on Windows): the exit code is kept, and a child that never answers is killed at the bound. R2, the real client of the machine's `PATH` (skipped where there is none). What it does not prove: what a client older than 8.5 prints, and that such a client ends at the unknown word (the plan's E3, M11); nothing about a road: the first caller is E2.S2. |
```

The docblock of `pinClient.ts` (§2.1) says where the reading comes from and what it does not decide. `research/module_extension.md`
and the CHANGELOG wait for E2.S2, where the answer takes effect (the stories document).

## 6. Order of work, and the commit

1. Read `git status --short`. Write `test/pinClient.test.ts` (§3.1). Run the typecheck: the two errors of §3.2. Save the output.
2. Apply §1. Run the typecheck: one error left. Run `out/test/bridgedSshClient.test.js` only after step 3 (it needs `tsc` to pass).
3. Write `pinClient.ts` (§2.1) and apply §3.4. Typecheck, lint, compile; run `pinClient.test.js` (16 pass),
   `bridgedSshClient.test.js` (19 pass, as before) and `noConnectionSharing.test.js` (9 tests: 8 pass, 1 skipped, as before).
4. The ten mutations of §4, one at a time, each restored.
5. `npm test`, the whole suite, and `npm run lint`.
6. The row of §5.
7. One commit, staged by path: `src_vs_code/src/bridgedSshClient.ts`, `src_vs_code/src/pinClient.ts`,
   `src_vs_code/src/test/pinClient.test.ts`, `src_vs_code/src/test/noConnectionSharing.test.ts`, `research/module_tests.md`. Its body holds what was observed: the RED text of step 1,
   the counts of step 3, each mutation with what it turned red, and the numbers of the whole suite.

## 7. Done when (each item can be counted)

1. `git diff cbeae5b8 -- src_vs_code/src/bridgedSshClient.ts` is the two lines of §1: 2 removed, 2 added.
2. `test/pinClient.test.ts` has 16 tests; the typecheck was watched failing with the two errors of §3.2 before §1 and §2 existed,
   and all 16 pass after (R2 skipped only where `PATH` has no `ssh`).
3. `test/bridgedSshClient.test.ts`: 19 tests, 19 pass, the file unchanged (`git diff` of it is empty). CV1 to CV7 are among them.
4. Each mutation M1 to M10 turned red what §4 names and was restored.
5. `pinClient.ts` imports no `vscode`, and no file of `src/` outside `src/test/` imports `pinClient.ts` yet. The two lists of
   `test/noConnectionSharing.test.ts` name it, and that file is green.
6. Typecheck, lint and the whole suite are green; the commit body holds the observations.

## 8. Break it: ways to make the tests pass while the defect stays, and the row that stops each one

| # | The shortcut | What stops it |
|---|---|---|
| Y1 | answer `older` for everything that is not `knows` (two answers in place of three) | V4, V5, A7; M1 |
| Y2 | read the token with a second pattern in `pinClient.ts` | V6 holds the token to `versionTokenOf`'s; the review reads the imports (checklist 2) |
| Y3 | apply the bridged `win32` rule "to be safe" | V3: the portable build on Windows must read as a version |
| Y4 | keep `unreadable` for the window, so a missing `ssh` is asked once | A4, A6 |
| Y5 | ask in an empty folder, as the bridged check does | A1 and A2 hold the folder to the call's own; K6 says why |
| Y6 | hand the child the whole environment of the call | A1, A2: no password, no askpass, no agent socket |

## 9. Opus review checklist

1. `bridgedSshClient.ts`: exactly the two lines of §1; the pattern still starts with `^`; `clientVerdictUnder` calls
   `versionTokenOf`; no second parser stands anywhere in `src/` (search for `OpenSSH_`).
2. `pinClient.ts` imports `versionTokenOf`, `Version`, `ClientRunner` and `CLIENT_CHECK_TIMEOUT_MS` from `./bridgedSshClient`,
   `bridgedSshEnv` and `runSshExec`; it holds no pattern of its own and imports no `vscode`.
3. The type has three kinds, and `older` cannot be read as a failure: no `ok` field, no boolean that folds two kinds.
4. `unreadable` is never written into the map; both readable kinds are.
5. The child gets `['-V']`, the call's program word, the call's folder or none, the reduced environment and the time limit; no
   signal. Nothing of stdout is read.
6. The asker cannot throw: the one `await` of the runner stands inside the `try`.
7. The ten mutations are in the commit body, each with what it turned red.
8. No sentence for a person stands in this module (D8).

## 10. Not verified by this spec

- What a client older than 8.5 prints for `-V`, and that it ends with `Bad configuration option` at the word: read in the release
  notes and the parent's §3.9; E3's M11 runs one.
- Windows: no test of this story starts `ssh.exe`; R1 is skipped there, and R2 asks whatever `PATH` holds.
- That the program that answered is the program that then runs: the question is asked a moment before the call, with the same
  program word, folder and `PATH`. A `PATH` that changes between the two, or an `ssh` that is replaced, is not seen.
- **A kept `older` can go stale, and in the unsafe direction.** An `ssh` that is replaced by a newer one while the window is open
  keeps its `older` answer until the window is reloaded: its pinned calls then get no `KnownHostsCommand=none`, and a config's
  command is asked (K8). D4 keeps both readable answers; the cost is this. It is in *Notes for the lead*.

## Notes for the lead

1. **For the stories document** (`## E2.S1`): two sentences are replaced by D5. "The exports of `bridgedSshClient.ts` do not
   change" (settled item 1, last bullet) becomes "one additive export, `versionTokenOf`"; and done-when's "`bridgedSshClient.ts` is
   unchanged (`git diff` of it is empty)" becomes "its diff is the two lines of the spec's §1". Settled item 1's third bullet
   ("E2 reads a version through `clientVerdictUnder` … with this plan's floor of 8.5 passed as its parameter") is replaced by D1
   and D5: the reading takes no platform and no floor of the bridge. Scope's "any change of `bridgedSshClient.ts`" under *Not here*
   goes.
2. **For the stories document:** the test fixture "a request that ended goes on as its error" has no test, by §2.2: the asker is
   given no signal, so it never throws, and the call's own run refuses a request that has gone. If the lead wants the question
   itself ended with the request, the asker needs the guards of `launchGuards` and one more way out; say so before the build.
3. **For the parent's §3.7** (*Added by epoch 2*, first row): "one value in memory per program" is, exactly, one per program
   word, folder and `PATH` (§2.2), and both readable answers are kept (D4), not "only a good answer … as `bridgedSshClientCheck`
   keeps its own". Wording, no change of what grows: at most a handful of small values per window.
4. **A stale `older`** (§10, last item): a decision of D4 that the lead may want to revisit before the release. Keeping only
   `knows` costs one `ssh -V` (a few milliseconds) per pinned call on a client below 8.5, and closes it. Not changed here.
5. **The comparison of two version numbers** is written in `pinClient.ts` (K4), because `atLeast` is private and D5 allows one
   export. If the lead prefers none, the remote-bridge session would have to export `atLeast` too.
6. **The line of §1 is a rename** (2 lines changed). An alias in one new line (`export const versionTokenOf = tokenOf;`) would be
   1 line added and 0 changed; the lead's message says "renamed/exported", so the rename is specified.
