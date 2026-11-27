# PLAN — E3.S1 spec: a run that ended with 0 is told nothing about a host key (C19; SECURITY)

> Status: **IMPLEMENTED, 2026-11-27.** Story E3.S1 (spec) of G1: merged (#393, squash `fe9aee47`, and #394, `b152bf06`) and released in extension 1.24.0 on 2026-11-27 (release PR #395, squash `a63dee35`, tag `extension-v1.24.0` at `a63dee35`, published to the Marketplace the same day). The parent [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) records the release and the run on the release commit (§10.5).
>
> The status as it stood before the promotion, kept as it was written: **spec, 2026-11-23, by Fable; not built.** A security spec, written before its code (the row *Security judgement* of
> `subagent-models.md`; outside the quota: both cornerstones of the plan are marked). Story E3.S1 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its §3.12, part 4, with decision 14; the last row of the
> table of §3.5; §3.6, *After E2, and E3.S1's budget*; the tests 28-32 of its §5; §6, *E3.S1 (C19) updates*; the group *E3.S1* of
> its §8; `## Epics`, E3) and of its stories document
> [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md) (`## E3.S1`). It changes the condition that
> [PLAN_person_roads_pin_host_key_E2_S3_spec.md](PLAN_person_roads_pin_host_key_E2_S3_spec.md) built: the judge of the re-review
> for epoch 3 cut that condition and placed its correction here. The parent, the stories document and `todo/README.md` do not
> name this file yet: the lead adds the links and the row (*Notes for the lead*). This file is promoted together with the parent.
>
> Scope: `src_vs_code/src` — `hostKeyPin.ts` (one function gains a required parameter and a private helper; its docblock),
> `commands/agentCommands.ts` (2 lines changed, 0 added: 797 before and after), `sshUseActions.ts` (one docblock, the last place
> of W7: §4); tests: `test/hostKeyTold.test.ts` (44 tests added, 5 call lines changed) and one new compile fixture,
> `test/fixtures/typed/host_key_told_needs_the_exit_code.ts`; and three documents (§8). No builder, no guard, no pin writer, no
> word of an argv, no sentence, no script. Each `file:line` below was read on `fix/g1-e3-release-gate` at `8dabad08`, on
> 2026-11-23. Its `src_vs_code` is the tree of the release 1.23.0 (`95e11116`): `git rev-parse <commit>:src_vs_code` answers
> `20857985` for both. Since then the branch has two commits of plan text (`753b3a48`, `e1c7d7cb`: the stories document with the
> lead's answers to its questions); they change no file of `src_vs_code` or of `research/`. Fable writes this spec, a Sonnet coder
> builds it, Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above; a section
named as §3.12 and so on is the parent's, and a section named as "§2 of this spec" is this document's. "E2.S3" is the spec linked
above; its names keep their meaning (S0 to S6 and X0 to X8, the tests of `test/hostKeyTold.test.ts`; `Told`, `exported`,
`EVIDENCE`, `NO_EVIDENCE`). This document's own names: the facts Z1 to Z21, the scenarios S7 to S11 and X9 to X15, the fixture
(its file name), the mutations MU1 to MU12, the break-its BR1 to BR10, the claims CF1 to CF11. "The verification line" is
`Host key verification failed.`. "The `Offending` line" is `Offending <type> key in <file>:<n>`. "The evidence" is the
`Offending` line with the pin file of this call as the whole name (§3.12, part 2). "A run" is one start of `ssh` that a road waits
for: it ends with an exit code, or with none. This document keeps no change ledger: a change of it is an entry in the parent
(`plan-change-control.md`), and the parent's epoch 3 has one entry (3.1), so a second one stops the whole plan.

## What E3.S1 builds, in one paragraph

Since E2, a pinned call of the install or of the socket check whose text holds the verification line is told sentence C (on the
evidence) or sentence D (without it). The function that chooses, `hostKeyTold`, asks the TEXT of the run alone. That is one
condition short (the parent's W2). `ssh` ends with 255 when it refuses a host's key. A run that ended with 0 is a run whose `ssh`
took the host's key, logged in and ran the remote command to its end. When the text of such a run holds the verification line,
the remote side wrote it: a profile of the login, or the command. As E2 built it, such a run gets sentence D. Then the install
stops before its question although its probe was answered, and the socket check says "could not be checked" although its answer
is there to read. The release 1.23.0 ships this and says so under "Not yet right". E3.S1 gives `hostKeyTold` the exit code of the
run as a REQUIRED parameter and makes it answer NOTHING for 0, whatever the text holds. The two callers hand over the code of
their own run on the lines that exist. Every run that did not end with 0 is told as before.

| File | Change | Where |
|---|---|---|
| `hostKeyPin.ts` | `hostKeyTold(pin, stderr, name, exitCode: number \| null)`: the new last parameter is required. The function asks the pin and the exit code; a new private `toldByText` asks the text (lint allows complexity 4, and five questions in one body are 5: Z9). The docblock gains the paragraph of the exit code and loses its untrue sentence. +19 lines: 451 → 470 | §2 |
| `commands/agentCommands.ts` | the two calls hand `outcome.exitCode` (the socket check, `:216`) and `facts.exitCode` (the install, `:283`). **2 lines changed, 0 added: 797 → 797** | §3 |
| `sshUseActions.ts` | the docblock of `localLaunch` (`:315-318`) says "no connection starts" in place of "no `ssh` starts" (W7's last place; the stories document gives it to this story). A comment only. +1 line: 599 → 600 | §4 |
| `test/hostKeyTold.test.ts` | 44 tests added: S7 (11), S8 (15), S9 (3), S10, S11, X9 to X14 (2 each), X15. The type `Told` gains the parameter, and the five call lines of S1 to S4 hand 255. 50 → 94 tests, 369 → 569 lines | §5 |
| `test/fixtures/typed/host_key_told_needs_the_exit_code.ts` (new) | a call without the exit code: `// expect TS2554 at line 7`. `typedFixtures.test.ts` compiles it: 22 → 23 tests. That test file does not change | §5.4 |
| `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md` | the texts of §8. The CHANGELOG gets the heading of 1.23.0 above the text that 1.23.0 shipped, and a NEW entry under `## [Unreleased]`; the shipped text is not changed | §8 |

## Binding constraints

- **No plan change.** Build what the parent, the stories document and this document say. If a step cannot be done as written, a
  code block here does not compile, or a test is not RED or GREEN as this document says: stop and tell the lead. Do not repair the
  parent, the stories document or this document. The parent has one recorded change in its epoch (3.1); a second one stops the
  whole plan.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first. Read the exit of `tsc` before any
  test result. The tests reach the function through the module object, with a type of their own (Z11), so the test file compiles
  on the product before this story. The one test that is about the compiler is the fixture (§5.4): its RED is a failed assertion
  of the harness too.
- **Keep what the runner printed.** Save each RED text and quote it in the commit body.
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history. Never a bare `git stash`. Never commit `.claude/settings.json`.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): 800 lines per file, 50 code lines per function (120 in `src/test/`),
  complexity 4, also in tests. No new `eslint-disable`. **`commands/agentCommands.ts` has 797 lines before and after this
  story.** Do not break one of its lines in two, and do not add a line to it.
- **The product change is §2, §3 and §4 and nothing else.** `runRemote`, `sshExecRunner.ts`, `remoteCliInstall.ts`,
  `writtenKey.ts`, `personPin.ts`, `pinOfCall.ts`, `pinClient.ts`, both argv builders and every script are not touched.
  `test/personRoadsWorld.ts`, `test/pinnedArgv.ts`, `test/typedFixtures.test.ts` and `test/personRoadsHostKey.test.ts` do not
  change.
- **The exit code that a caller hands is the code of the SAME run whose stderr it hands, as that run answered it.** Never a
  constant. Never a value that turns "no exit code" into 0. The socket check hands the runner's `number | null` as it is; the
  install hands what `runRemote` answers, which is -1 for a run with no code (Z3).
- **The question is `exitCode === 0`, and it stands before every question about the text.** Not a falsy test (`null` is not 0),
  not `<= 0` (-1 is not 0), not `!== 255` (the parent did not take that rule: §3.12, part 4, *What it does not change*).
- **The parameter is required and is the LAST one.** No default, no `?`, no overload with three parameters.
- **Sentences C and D keep every character**, and so do the two openings of the bridge's form. No new sentence is written.
- **The CHANGELOG text that 1.23.0 shipped is history.** No character of it changes (§8.1).
- **Tests leave nothing outside an owned temp folder.** The new road tests use the file's own `storage()` (`ownedDir` under the
  `cleanupScope` that the file closes in `after`). No new test starts a process.
- **Node only.** No Python, also not for a helper script. Write files with the Edit or Write tool, not with a shell heredoc.

## Facts read on `8dabad08` and measured on 2026-11-23 that this spec uses

| # | Fact | How |
|---|---|---|
| Z1 | `hostKeyPin.ts` has 451 lines. `HOST_KEY_REFUSED_LINE` (`:326`), `OFFENDING_KEY_LINE` (`:329`), `namesFile` (`:345-348`), `HostKeyTold` (`:351-354`), the docblock of `hostKeyTold` (`:356-384`), the function (`:385-394`, 10 lines): `hostKeyTold(pin: CheckedPin \| undefined, stderr: string, name: string)`. Its first `if` (`:387`) asks the pin and the verification line; its second (`:390`) asks the evidence. The docblock sentence that this story makes untrue, "A remote command that wrote the verification line reads as sentence D whatever the run's exit code was", is at `:379-380`. `refusedHostKeySentence` is `:408`, `unnamedHostKeySentence` `:424`. The parent names `:380` for the function: it read `22caab8b`, and the stories document (its settled item 5) says what moved the line | read |
| Z2 | **The callers.** A search of `src_vs_code/src` and `src_vs_code/scripts` for `hostKeyTold`: outside the tests it stands in `hostKeyPin.ts` (the definition and two `{@link}` of the sentences' docblocks) and in `commands/agentCommands.ts` (797 lines): the import (`:27`), the socket check (`:216`; `outcome` is the run of the mode check, `:211-215`; the branch is `:216-222`) and the install (`:283`; `facts` is the run of the probe, `:282`; the branch is `:283-286`). No script calls it (`scripts/itestPinnedRoads.cjs` reads `refusedHostKeySentence` only). Exactly two callers, as the parent says | read; measured: the scan X15, run on this tree, lists these two calls and no other (§6) |
| Z3 | **The exit code that each caller has.** The socket check: `outcome.exitCode`, the runner's own `number \| null` (`sshExecRunner.ts:58`); the runner hands the `code` of the child's `close` event (`:191-194`), which is `null` when a signal ended the child. The install: `facts.exitCode`, a `number` of `runRemote` (`commands/agentCommands.ts:336-353`): `run.exitCode ?? -1` for a run (`:350`), and -1 where no `ssh` ran (no argv, `:344`; the runner threw, `:352`). So neither caller holds a 0 for a run that has no exit code. The parent names `:341` and `:350`: `:341` is the line of the return type | read |
| Z4 | **The time limit.** The runner sets `timedOut` when its timer ends, and sends SIGTERM, then SIGKILL after 2 s (`sshExecRunner.ts:23`, `:146-156`). The outcome is written when the child closes. So `timedOut` and the exit code are two facts of one run, and each caller already reads them apart (`facts.timedOut`, `commands/agentCommands.ts:287`) | read |
| Z5 | **What a road does when `hostKeyTold` answers nothing.** The install: the time limit's warning (`:287-292`); then `blockerFor(interpretProbe(facts.stdout))` (`:293`), which says "the host did not answer the probe" for a stdout with no answer (`remoteCliInstall.ts:84`); then the question that `confirmationFor` builds from the probe's answer (`:301-306`). The socket check: `interpretSocketProbe(outcome.stdout)` (`:223`); a missing socket is an error message; a mode that cannot be read is a log line; a mode wider than 600 is a warning that names the mode (`:238-241`; `describeWideSocket`, `sshBridge.ts:345`); mode 600 shows nothing | read |
| Z6 | **The exit code of `ssh`.** The manual of the client of this machine (`ssh(1)`, *EXIT STATUS*; `OpenSSH_10.2p1 Ubuntu-2ubuntu3.8`): "ssh exits with the exit status of the remote command or with 255 if an error occurred." | read, 2026-11-23 |
| Z7 | **A refused host key ends the run with 255.** Measured by the parent (§3.5, 2026-11-17; §3.12 part 1, 2026-11-18) and by E2.S3 (its J4, J9 to J11), by hand. The smoke holds it on the roads: leg 2 requires exit code 255 and the verification line for the probe and for the check's runs (`scripts/itestPinnedRoads.cjs:533`, `:560`). Leg 1 requires exit code 0 for the probe and for both runs of the check (`:457`, `:479`); its `sshd` has no forced command (a search of the script for `ForceCommand`: none), so nothing of that leg writes the line. So, by reading, no leg of the smoke has a run that ends with 0 and holds the line (test 32). The smoke was not run for this spec: `which sshd` finds nothing on this machine | carried; read |
| Z8 | **A run of these two roads is a connection of its own.** Every argv of `buildSshExecArgv` carries G2's two options (`ControlPath=none`, `ControlMaster=no`; the parent's §4, measured by G2). A client that rides a master does no key exchange. Without G2, an exit code of 0 would not show that the `ssh` of the call met the host's key | carried |
| Z9 | **Lint allows complexity 4** (`eslint.config.mjs:32`). Measured on a scratch copy: `hostKeyTold` with the exit code in its own body (`if (pin === undefined \|\| exitCode === 0)`, then the verification line, then the evidence) is refused: "Function 'hostKeyTold' has a complexity of 5. Maximum allowed is 4". The form of §2, two functions, is clean (`npx eslint src`: exit 0) | measured |
| Z10 | **How this repository holds a type that must refuse.** `src_vs_code/src` and `src_vs_code/scripts` hold no `@ts-expect-error` (a search: 0). The suite has a compile-fail harness: `test/typedFixtures.test.ts` (136 lines) compiles every file of `test/fixtures/typed/` (21 files) as a program of its own, with the options of `tsconfig.json`. The first line of a fixture says `// expect TS<code> at line <n>` or `// expect compiles`, and the diagnostics of the file must be exactly that one, or none. The folder is excluded from `tsc -p ./` (`tsconfig.json`, `exclude`) and from `eslint src` (`eslint.config.mjs:14`). Precedents: `stored_is_not_a_string.ts` (TS2322), `storage_is_not_a_writer.ts` (TS2345) | read; measured: 22 tests, 22 pass |
| Z11 | **How the tests reach the function.** Part 1 of `test/hostKeyTold.test.ts` reads each export through the module object (`exported<T>`, `:92-96`) under a type that the test writes itself (`Told`, `:89`). E2.S3 built it so that the file compiles before the export exists. The same door lets this story's tests compile against the function of before: JavaScript drops an argument that a function does not name | read; measured (§6) |
| Z12 | **The scan helpers.** `discoverSources(root, excluded)` lists every `.ts` under a folder, as paths with `/` (`test/tempSiteScan.ts:62`). `importedUses(file, text, name, module)` finds every reference to a binding imported from a module, also under another name and through a namespace import (`test/funnelScan.ts:160`). `test/hostKeyWords.test.ts:281-330` uses both for the callers of `hostKeyWords`. `typescript` is a module that tests import (`test/typedFixtures.test.ts:5`) | read |
| Z13 | **The world.** `ran(stdout, exitCode = 0, stderr = '')` is what one run answers (`test/personRoadsWorld.ts:69`); `TIMED_OUT` has `exitCode: null` (`:79`). The file's own helpers: `pinned`, `bridged`, `pinFileOf`, `storage`, `yes`, `PROBE_OK`, `NOT_READ` (`test/hostKeyTold.test.ts:208-236`) | read |
| Z14 | **No road test of the tests 1-27 answers the verification line with exit code 0.** X1 to X8 of `test/hostKeyTold.test.ts` answer 255 (`:256` to `:364`). T9a, T9b, the first row of T9c and T9d, and T9e of `test/personRoadsHostKey.test.ts` answer 255 (`:348`, `:361`, `:379`, `:406`). So no expectation of a road test changes | read (a search for `ran(` in both files) |
| Z15 | **The counts before this story**, from the runner: `hostKeyTold.test.js` 50 tests, `personRoadsHostKey.test.js` 34, `typedFixtures.test.js` 22; all pass. `research/module_tests.md:2566-2567` says 49 and 33 | measured |
| Z16 | **Measured on a scratch copy** of the repository at `8dabad08` (`git worktree add --detach`, outside the repository; `node_modules` and the shared rules linked in; removed after). Node 26.12.1, Linux. Nothing of the real worktree was edited. (a) The test file of §5.3 and the fixture of §5.4 on the product files of `8dabad08`: `tsc` exit 0; the RED run of §6. (b) After §2 and §3: `tsc` exit 0; `hostKeyTold` 94 of 94, `typedFixtures` 23 of 23, `personRoadsHostKey` 34 of 34. (c) `wc -l`: `commands/agentCommands.ts` 797, `hostKeyPin.ts` 470, `sshUseActions.ts` 600, `test/hostKeyTold.test.ts` 569. (d) `npx eslint src`: exit 0. (e) The mutations of §7, each on the product of §2 and §3, each restored. (f) The whole suite: §10, step 4 | a scratch copy |
| Z17 | **The CHANGELOG has no heading for 1.23.0.** `src_vs_code/CHANGELOG.md:7` is `## [Unreleased]`, and the next version heading is `## [1.22.3]` (`:112`). The three entries that 1.23.0 shipped stand between them (`:9-110`): the search (`:9-14`), G1 (`:16-106`) and the green row (`:108-110`). The G1 entry holds the two sentences that this story makes untrue for the next version: "a remote command that prints that line" among the cases of the second message (`:46`), and "Not yet right: a remote command that prints `Host key verification failed` and still ends with exit code 0 stops *Install creds on host* with the second message above; nothing more is sent." (`:104-105`). The same on `origin/main` (`95e11116`) | read |
| Z18 | **release-please does not write that file.** `release-please-config.json`: `"changelog-path": "RELEASES.md"`, and its note says why ("THE NARRATIVE CHANGELOG IS NOT TOUCHED"). The release commit `95e11116` changed four files: `.release-please-manifest.json`, `src_vs_code/RELEASES.md`, `src_vs_code/package.json`, `src_vs_code/package-lock.json`. The tag `extension-v1.23.0` exists. The heading of a released version was written by hand, after the release, in the pull request that promoted its plan: #375 wrote `## [1.22.2]`, #378 wrote `## [1.22.3]` (`git log -- src_vs_code/CHANGELOG.md`). `release.yml:932-944` takes the release notes from `'## [' + version + ']'` to the next `## [`, and answers "See CHANGELOG.md." when it finds no such heading | read |
| Z19 | **The documents.** `research/module_extension.md`: **B10** starts at `:5343`; its paragraph "The three roads of the person (G1, E1.S3)" is `:5427-5456`, and names `hostKeyTold` at `:5433`. `research/module_tests.md`: the section `## The three roads of the person and the saved host key (G1)` starts at `:2543`; the rows of `hostKeyTold.test.ts` and `personRoadsHostKey.test.ts` are `:2566-2567`; the harness is told at `:1224-1229` | read |
| Z20 | **W7's last place.** The docblock of `localLaunch` (`sshUseActions.ts:315-318`; the file has 599 lines) says: "the refusal of its pin (sentence E or F: nothing is written and no `ssh` starts)". `decidePinOfCall` asks the rule of the path, then the client, then writes (`pinOfCall.ts:51-62`): for sentence E no `ssh` of any kind starts; for sentence F the question `ssh -V` started and could not be read. A search of `src_vs_code/src`, of the two module documents and of the CHANGELOG for "no `ssh` starts" finds this one place | read |
| Z21 | The size ratchet (`.size-baseline.json`) lists no file of this story | read |

**Not measured for this spec:** a real `ssh` whose run ends with 0 and holds the verification line (E3's M5, h); the smoke (this
machine has no `sshd` on its `PATH`); `ssh.exe` (its exit code rule was not read). Each is in §14.

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.** A test result after a failed `tsc` is the result of old files.
2. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
3. `node $LP npm run typecheck`
4. `node $LP npm run lint`
5. `node $LP npm run ratchet` (it compiles first; this story changes no file of its baseline, Z21).
6. `npm test` — the full suite (it compiles first and lowers itself).

## 1. The rule: the exit code of the run is asked first

**The rule** (§3.12, part 4, the table). One run of a road ended. Its call is PINNED when the ONE value of the road holds a
checked pin. Then:

| The run ended | and its stderr holds | The person is shown |
|---|---|---|
| with 0 | anything, the verification line and the evidence included | nothing about a host key; the road goes on |
| with another code, or with none | the verification line and the evidence | **sentence C** |
| with another code, or with none | the verification line, and no evidence | **sentence D** |
| with another code, or with none | no verification line | nothing: the sentences of before |

An unpinned call is shown nothing by this rule, under every exit code. **The order of the questions:** no pin of the call,
nothing; exit code 0, nothing; no verification line, nothing; the evidence, sentence C; else sentence D. The first two answer
"nothing" before a line of the text is read.

| Road | The run that is asked | It ended with 0 | It did not end with 0 |
|---|---|---|---|
| *Install creds on host* | the probe (`facts`) | no sentence about a host key. The road goes on: the time limit's warning, the blocker, or the question that `confirmationFor` builds from the probe's answer, as for a probe without the line | as E2 built it. With the verification line in its text: ONE error message, sentence C or D, and the road returns. Without it: the sentences of before |
| *Install creds on host* | the install run is NOT asked | as today | as today |
| the socket check | the mode check (`outcome`) | no message about a host key. The check goes on and reads the stdout: a missing socket, a mode that cannot be read, a wide mode, or nothing for mode 600. The row stays *bridged* | as E2 built it. With the verification line in its text: ONE error message with the opening of its sentence, the same text in the log, and the check returns before it reads the stdout. Without it: the check reads the stdout |
| the socket check | the sweep is NOT asked | nothing | nothing |

**Why each part is as it is.**

- **What an exit code of 0 shows, and what it rests on.** Three things, each named with how it is known.
  1. `ssh` ends with the exit code of the remote command, or with 255 when an error occurred (Z6: read in the manual).
  2. `ssh` ends with 255 when it refuses a host's key, before any login (Z7: measured by hand, and held by leg 2 of the smoke).
  3. The run is a connection of its own, so its `ssh` did meet the host's key (Z8: G2, measured).

  So a run of these roads that ended with 0 is a run whose `ssh` did NOT refuse a host key: it took the key, logged in, and the
  remote command ended with 0. A verification line in its text is the remote side's: a profile of the login, or the command. The
  rule says no more than that. That the key which `ssh` took is the saved key rests on the words of a pinned call (E1, E2), which
  this story does not touch. A real run of this kind was not made for this spec: E3's M5 (h) makes one (§14).
- **Why "nothing", and not a third sentence.** Decision 10: a sentence names a cause only when the call saw it. The call saw a
  login and an answer. The road has that answer and reads it. A sentence about a host key would name a cause that is not there,
  and sentence D's words ("the connection … ended with") are false for such a run.
- **Why sentence C is not shown either.** A remote side cannot print the evidence: the name of the pin file is a word of the
  local argv and ends with a uuid of this call (E2.S3). And when the run ended with 0, no line of it is `ssh`'s refusal of this
  call's pin, by point 2. The exit code is asked BEFORE the evidence, so the second reason does not depend on the first: S7, and
  the mutation MU4.
- **What the remote side gains by this rule: nothing.** Before this story, a host that had presented the saved key could stop
  the install, and make the check say "could not be checked", by printing one line. After it, the line changes nothing: the road
  goes on and reads the stdout of that host. A host that passed the key check and the login controls that stdout with or without
  the line, so the line gives it no new power. A machine that is NOT the saved one never reaches an exit code of 0: its run ends
  at the key exchange with 255, and this story does not change one answer for 255.
- **The fail direction of a wrong exit code.** This is why the code must be the run's own.
  - A code that is wrongly NOT 0 (a good run read as -1): the function reads the text, as before this story. With the line in it
    the road shows sentence D and stops. That is the behaviour of 1.23.0: it fails closed.
  - A code that is wrongly 0 for a run that `ssh` refused (a caller's constant, or "no code" read as 0): the sentence is not
    shown. The road then reads an empty stdout: the install says "did not answer the probe", the check logs a mode that it could
    not read (Z5). Nothing connects and nothing is installed, because the refusal is `ssh`'s. What is lost is P3: the person
    cannot tell a refused host key from a host that is down. So each caller hands its run's own code, a missing code is never 0,
    and the tests hold both: X10, X13, X14, X15; MU2a, MU2c, MU5, MU6, MU8, MU9.
- **A run with no exit code is asked as before** (§3.12, part 4, *What it does not change*). The runner answers `null` when a
  signal ended the child (the time limit, the window's end); `runRemote` answers -1 for it and where no `ssh` ran (Z3). Neither
  is 0. The text of such a run is read as E2.S3 built it. For the install the answer of `hostKeyTold` still comes before the
  time limit's warning, as today (`commands/agentCommands.ts:283-292`).
- **A run that ended with another code than 0 is asked as before**, 255 and every other code. A remote command that prints the
  line and ends with 255, or with 1, still gets sentence D: its run did end, with the line in its text, and sentence D names no
  host as the cause. Not taken (the parent): sentence D for 255 alone. A remote command can end with 255 itself, so the code does
  not prove whose line it is. S9 holds "another code" and "none"; MU7 turns it red.
- **`timedOut` is not asked by the function.** It is a second fact of the same run (Z4), and each road reads it itself. A run can
  be marked `timedOut` and still carry an exit code of 0, when the timer and the child's own end meet. Then the function answers
  nothing, and the install shows the sentence of the time limit, as for a run without the line. Not tested (§14).
- **The parameter is the LAST one.** Three reasons.
  1. *The RED is a failed assertion for the right reason.* The tests call the function through the module object (Z11). A fourth
     argument is dropped by the function of before, which then answers sentence C or D for a run that ended with 0: exactly the
     defect (§6). An exit code in an earlier place would hand the function of before a number where it splits a text, and every
     test, the guards included, would end with a `TypeError`.
  2. *A missing argument fails closed at run time.* A caller that the compiler does not see (a script) and that hands three
     arguments gives `undefined`, which is not 0: the text is read, as in 1.23.0. No such caller exists (Z2).
  3. *The two calls change on the lines that exist* (§3.6): one more word at the end of each.
- **The parameter is required, and the suite holds it in the repository's own way** (Z10): a compile fixture with a call of
  three arguments, `// expect TS2554 at line 7` ("Expected 4 arguments, but got 3."). The compiler then proves that no caller of
  `src_vs_code/src` is missed, as with N16's reporter, E1.S2's pin writer and E2's checked pin. `@ts-expect-error` is not used:
  this repository has none, and `typescript/doctrine.md` (trap 3) names it among the casts that hide a changed shape.
- **`number | null`, as the runner answers it** (§3.12, part 4). The socket check hands the runner's value with no change. The
  install hands a `number`, which fits. No caller converts a value for this call.
- **Two functions, one of them private.** The parent says "the one pure function … takes the run's exit code". It stays the one
  exported function that the roads ask, with one answer. Its five questions do not fit lint's complexity of 4 in one body (Z9),
  so the three questions about the text move into `toldByText`, which nothing else calls. `hostKeyTold` reads top down as the
  order of the questions.
- **`exitCode === 0`, the strict comparison.** `!exitCode` would read `null` as 0 (MU8). `exitCode <= 0` would read
  `runRemote`'s -1 as 0 (MU9).

## 2. The product: `hostKeyPin.ts`

**The new signature:**

```ts
export function hostKeyTold(pin: CheckedPin | undefined, stderr: string, name: string, exitCode: number | null): HostKeyTold | undefined
```

The block from the docblock of `hostKeyTold` (`:356`) to the closing brace of the function (`:394`) is replaced by this block,
word for word: 39 lines go, 58 come. The line before it (`:355`, empty) and the line after it (`:395`, empty) stay.
`refusedHostKeySentence` follows, unchanged. No import, no constant and no other function of the file changes.

```ts
/**
 * What to tell the person when one run of a PINNED call ended with `ssh`'s line `Host key verification failed.` (G1, sentences C and D).
 * `undefined`: nothing, the road shows the sentences of before. `pin` is the checked pin of THIS call, and its `file` is the pin
 * file as it is on the disk; an unpinned call has none and is told nothing, whatever its `ssh` printed. `exitCode` is the exit code
 * of the SAME run whose `stderr` is handed, as its runner answered it (`null`: the run has none). It is required: a caller hands the
 * code of its own run, never a constant, and never 0 for a run that has no code.
 *
 * <p><b>The exit code is asked first (C19; the plan's §3.12, part 4).</b> A run that ended with 0 is told NOTHING, whatever its text
 * holds, sentence C included, and the road goes on as for a run without the line. `ssh` ends with 255 when it refuses a host's key
 * (measured, below), and with the exit code of the remote command when that command ran (read in `ssh(1)`; not run for this function).
 * So a run that ended with 0 is one whose `ssh` took the host's key, logged in and ran the remote command to its end: a verification
 * line in its text was written by the remote side (a profile of the login, or the command), and no line of it is `ssh`'s refusal of
 * this call's pin. The order of the questions: no pin, nothing; exit code 0, nothing; no verification line, nothing; the evidence,
 * sentence C; else sentence D. A run that ended with another code, or that has none, is asked as the rule below says.</p>
 *
 * <p><b>The rule: a sentence names a cause only when the call saw it.</b> The stderr of a run holds what the `ssh` of the call
 * printed, what a nested `ssh` of a jump host printed, and what the remote command wrote. The verification line can come from each
 * of the three. Sentence C says that the entry's host did not present its saved key, so it needs evidence that the `ssh` of THIS
 * call judged the pin of this call: its line `Offending <type> key in <file>:<n>` with the pin file of the call as the whole name.
 * Only the `ssh` that was handed that file reads it, and its name ends with a uuid of this call alone. The verification line
 * without that line is sentence D, which names no host as the cause. Neither line, or the `Offending` line alone: nothing.</p>
 *
 * <p><b>Measured 2026-11-18</b>, OpenSSH 10.2p1, the words of a pinned call with `LogLevel=ERROR`, against public `sshd`s (the pin
 * file held another key; no login was attempted). A host with another key: 15 lines, among them the `Offending` line with the whole
 * path of the pin file (258 characters in one run) and `:1`, and the verification line last. A path that was written in double
 * quotes is printed with none. The type in the line is the type of the SAVED key, also when the host presents a key of another
 * type. `ssh` ends its lines with CR LF, also on Linux, so the text is split at both. The line `Add correct host key in` is cut at
 * 100 characters and is no evidence. A jump host of a config's `ProxyJump` whose key the nested `ssh` refused: the same 15 lines,
 * and they name the file that the nested `ssh` read, not the pin file. A config that gives the host another name or port:
 * `No ED25519 host key is known for <that name>` and the verification line, with no `Offending` line. `ssh.exe` of
 * OpenSSH_for_Windows 9.5p2: 13 lines, the same `Offending` line.</p>
 *
 * <p><b>What it cannot tell.</b> A run whose `ssh` printed nothing (a client that does not keep `LogLevel=ERROR`; a nested `ssh`
 * under a config that says `LogLevel QUIET`, measured: exit code 255, no text) is told nothing. A remote command that wrote the
 * verification line, in a run that did NOT end with 0 (with 255, with another code, or with none), reads as sentence D: the code does not
 * prove whose line it is, and sentence D names no host as the cause. `ssh` cuts its own log line at 1024 bytes, and a byte outside
 * printable ASCII is printed as four characters, so a pin path of about 250 such bytes or more loses the `:<n>` that ends its `Offending`
 * line: the line then names no file, and a real key change shows sentence D (reported by the review of E2.S3; not run). A miss is
 * sentence D or nothing; it is never sentence C. A real `ssh` whose run ended with 0 and held the line was not run for this function: the
 * plan's E3 runs one on the roads (M5, h).</p>
 */
export function hostKeyTold(pin: CheckedPin | undefined, stderr: string, name: string, exitCode: number | null): HostKeyTold | undefined {
  if (pin === undefined || exitCode === 0) {
    return undefined;
  }
  return toldByText(pin.file, stderr.split(/\r?\n/), name);
}

/** What the text of one run says about the host's key, for a pinned call whose run did not end with 0 ({@link hostKeyTold} asks those two first): sentence C on the evidence of `file`, sentence D for the verification line without it, nothing without that line. */
function toldByText(file: string, lines: readonly string[], name: string): HostKeyTold | undefined {
  if (!lines.includes(HOST_KEY_REFUSED_LINE)) {
    return undefined;
  }
  if (lines.some((line) => namesFile(line, file))) {
    return { install: refusedHostKeySentence(name), bridge: `The bridge to "${name}" is not open: ${refusedHostKeySentence(name)}` };
  }
  return { install: unnamedHostKeySentence(name), bridge: `The bridge to "${name}" could not be checked: ${unnamedHostKeySentence(name)}` };
}
```

**The docblock, what changes in it and why.** Compare with `:356-384`.

| Place | Before | After |
|---|---|---|
| the first paragraph, its end (`:359`) | "… whatever its `ssh` printed." | the same, and then: "`exitCode` is the exit code of the SAME run whose `stderr` is handed, as its runner answered it (`null`: the run has none). It is required: a caller hands the code of its own run, never a constant, and never 0 for a run that has no code." |
| a NEW second paragraph | — | "**The exit code is asked first (C19; the plan's §3.12, part 4).**" It says: a run that ended with 0 is told nothing, sentence C included; why (255 for a refused key, measured; the remote command's code otherwise, read in `ssh(1)` and not run for this function); the order of the questions; and that a run with another code or with none is asked as the rule below says |
| *The rule* and *Measured 2026-11-18* | — | not one character changes |
| *What it cannot tell*, the sentence at `:379-380` | "A remote command that wrote the verification line reads as sentence D whatever the run's exit code was." | "A remote command that wrote the verification line, in a run that did NOT end with 0 (with 255, with another code, or with none), reads as sentence D: the code does not prove whose line it is, and sentence D names no host as the cause." |
| *What it cannot tell*, its end | "… it is never sentence C." | the same, and then: "A real `ssh` whose run ended with 0 and held the line was not run for this function: the plan's E3 runs one on the roads (M5, h)." |

The docblock says what was measured, what was read, and what was not run (`security.md`, *a measure you have not observed
working is a comment*): "255 for a refused key" is measured; "the remote command's code otherwise" is read.

**Why each part of the code is as it is.**

- **`pin === undefined || exitCode === 0`, in this order, and before the text is split.** Both answer nothing, so the order of
  the two cannot be seen from outside; it is the parent's order. No line of the text is read for either.
- **`toldByText(pin.file, stderr.split(/\r?\n/), name)`.** The helper gets the `file` of the checked pin, never its `word`
  (E2.S3), the lines split at CR LF and at LF, and the name. Its body is the body of the function of before, less the question
  about the pin: the verification line as a whole line, then the evidence, then sentence D. Its two `return` lines with the
  sentences are the lines `:391` and `:393` of today, character for character.
- **The helper stands behind the function**, so the docblock, the function and the helper read in the order of the questions.
  A function declaration can be called before the line it stands on.
- **Complexity:** `hostKeyTold` 3, `toldByText` 3 (lint clean, Z9).

## 3. The product: `commands/agentCommands.ts`

### 3.1 The diff

Against the file of `8dabad08` (797 lines). Two lines change. The two calls are found by their text.

```diff
--- a/src_vs_code/src/commands/agentCommands.ts
+++ b/src_vs_code/src/commands/agentCommands.ts
@@ -213,7 +213,7 @@ export function registerAgentCommands(host: AgentCommandsHost): void {
           timeoutMs: 15_000,
           signal: agentServer.signal,
         });
-        const told = hostKeyTold(credential.knownHostsFile, outcome.stderr, entity.name);
+        const told = hostKeyTold(credential.knownHostsFile, outcome.stderr, entity.name, outcome.exitCode);
         if (told !== undefined) {
           // The ssh of the bridge has no stdio, so this check is the one place that can say what the host key check of the bridge came to (G1, P3).
           log.info('bridge', told.bridge);
@@ -280,7 +280,7 @@ export function registerAgentCommands(host: AgentCommandsHost): void {
       }
 
       const facts = await runRemote(details, credential, probeCommand(), 20_000);
-      const told = hostKeyTold(credential.knownHostsFile, facts.stderr, node.name);
+      const told = hostKeyTold(credential.knownHostsFile, facts.stderr, node.name, facts.exitCode);
       if (told !== undefined) {
         return void vscode.window.showErrorMessage(told.install);
       }
```

### 3.2 The two lines, before and after

| Road | Line | Before | After | Whose exit code |
|---|---|---|---|---|
| the socket check | `:216` | `const told = hostKeyTold(credential.knownHostsFile, outcome.stderr, entity.name);` | `const told = hostKeyTold(credential.knownHostsFile, outcome.stderr, entity.name, outcome.exitCode);` | of `outcome`, the run of the mode check (`:211-215`): the runner's `number \| null`, as it is |
| the install | `:283` | `const told = hostKeyTold(credential.knownHostsFile, facts.stderr, node.name);` | `const told = hostKeyTold(credential.knownHostsFile, facts.stderr, node.name, facts.exitCode);` | of `facts`, the run of the probe (`:282`): what `runRemote` answers, -1 for a run with no code |

In each call the stderr and the exit code are read from ONE value: `outcome` in the first, `facts` in the second. The scan X15
holds exactly that.

### 3.3 The line count

| Step | Lines | How |
|---|---|---|
| `8dabad08` (the release 1.23.0) | 797 | `wc -l`, Z2 |
| after this story | **797: +0** | each of the two lines is replaced by one line. No branch, no comment and no import changes: `hostKeyTold` is already imported (`:27`) |

Measured on the scratch copy: `wc -l` says 797 before and after, and `npx eslint src` is clean (Z16 c, d). No lint rule limits
the length of a line (`eslint.config.mjs`, read). Three lines stay under the limit of 800.

### 3.4 What a person sees on each road after this story

| The entry and the run | The install | The bridge and its socket check |
|---|---|---|
| unpinned, any run | as today | as today |
| pinned, the run ended with 0 and its text holds no verification line | as today | as today |
| pinned, the run ended with 0 and its text holds the verification line (the remote side wrote it) | **changed:** no sentence about a host key; the install goes on to its question | **changed:** no message about a host key; the check reads the socket's mode; the row stays *bridged* |
| pinned, the run did not end with 0, the verification line with the evidence | sentence C, as today | `The bridge to "<name>" is not open: ` + sentence C, as today |
| pinned, the run did not end with 0, the verification line without the evidence (a hop, a renamed host, a remote text) | sentence D, as today | `The bridge to "<name>" could not be checked: ` + sentence D, as today |
| pinned, the run did not end with 0, no verification line | as today | as today |

## 4. The product: the docblock of `localLaunch` (`sshUseActions.ts`), W7's last place

The stories document gives this story one comment that is not C19's (its `## E3.S1`, *Docs*; its settled item 6; the judge's row
of E2.S2 in the re-review for epoch 3: "Corrected forward on E3's branch with W7, before the whole set runs"). It changes no
behaviour. It changes the tree of `src_vs_code/src`, which §9, step 11 compares, so it is made before any row is measured.

The docblock at `:315-318` is replaced by this one (4 lines go, 5 come: 599 → 600 lines):

```ts
/**
 * The launch of a call off a bridge, or the refusal of its pin (sentence E or F: nothing is written, no connection starts and nothing is sent
 * to the host; for sentence F the local question `ssh -V` ran first). The program and the environment are decided first, because the pin's
 * question about the client is asked of that program.
 */
```

It says what M4 and M11 (c) count (decision 15): no connection starts and nothing is sent. For sentence E no `ssh` of any kind
starts; for sentence F the question started and its answer could not be read (Z20). It is a commit of its own (§10, step 6).

## 5. Scenarios

Each row is one test, or one group of tests with one name. "RED" is the first assertion that fails on the product of `8dabad08`.
A guard is green before and after; a mutation of §7 proves it.

### 5.1 The rows

Part 1 asks the function alone, through the module object, with the fixtures of test 24 as they stand in the file: `EVIDENCE`
(11 texts that give sentence C: `:105-117`) and `NO_EVIDENCE` (15 texts that give sentence D: `:131-147`). Part 2 runs the real
`registerAgentCommands` over the world, as X0 to X8 do. Part 3 reads the shipped sources.

| Id | The parent's test | Setup and action | Expected | RED on `8dabad08` |
|---|---|---|---|---|
| S7 (11 tests) | 28 | `hostKeyTold` with the checked pin of the file, each text of `EVIDENCE`, and exit code 0 | `undefined` | sentence C in both forms where `undefined` is expected |
| S8 (15 tests) | 28 | the same with each text of `NO_EVIDENCE` and exit code 0 | `undefined` | sentence D in both forms where `undefined` is expected |
| S9 (guard, 3 tests) | 28 | every text of `EVIDENCE` and of `NO_EVIDENCE` with exit code 1; with `null`; with -1 | sentence C for the 11, sentence D for the 15, in both forms, as test 24 says | green |
| S10 (guard) | 28 | six texts with no verification line (a host that is down, a refused login, two of no answer, no text, the `Offending` line of this call alone), each under 0, 255, 1, `null` and -1 | `undefined`, thirty times | green |
| S11 (guard) | 28 | NO pin, four texts of S1 and S2, each under the same five codes | `undefined`, twenty times | green |
| S1, S2, S3, S3b, S4 (E2.S3's; 29 tests) | 24, and 28's "with 255" | as E2.S3 wrote them; the call hands 255 (§5.2) | as before | green |
| X9 (2 tests) | 29 | a pinned entry; the probe answers exit code 0, the stdout of a good probe, and a stderr with the verification line: (1) a remote text that ends with the line; (2) the 15 lines with the pin file of the run. The person says yes; the install run answers "installed" | no error, no warning; ONE question, the text that `confirmationFor(interpretProbe(<the stdout>), 'box')` builds; two runs | `errors` holds sentence D (1) or sentence C (2) |
| X10 (guard, 2 tests) | 29, the guard | the same probe, the same stdout and stderr, exit code 255 | the errors are exactly `[sentence D]` (1) or `[sentence C]` (2); no question; one run | green |
| X11 (2 tests) | 29 | a pinned entry; *Open Remote Bridge…*, its socket check to the end; both runs answer exit code 0, the stdout `600`, and the two texts of X9 | two runs; no error, no warning; no log line with the sentence or about a mode that could not be read; the bridge is open | `errors` holds `… could not be checked: ` + sentence D (1) or `… is not open: ` + sentence C (2) |
| X12 (2 tests) | 29, "reads the socket's mode" | the same with the stdout `644` | no error; ONE warning, the one of a socket wider than 600 ("has mode 644 rather than 600"); the bridge is open | the same errors as X11 |
| X13 (guard, 2 tests) | 29, the guard | the runs of X12, exit code 255 | the errors are exactly the one message of the sentence; NO warning: the stdout is not read | green |
| X14 (guard, 2 tests) | — (§1, the fail direction) | a run with NO exit code (the runner's `null`) whose text is the verification line: the probe of the install; both runs of the check | the install: `[sentence D]`, no question. The check: `[… could not be checked: ` + sentence D`]`, no warning | green |
| X15 | 30, the scan | every shipped `.ts` of `src_vs_code/src` outside `test/`: each call of `hostKeyTold` with its arguments as they are written; and every reference to the import | exactly two calls, both in `commands/agentCommands.ts`: `(credential.knownHostsFile, outcome.stderr, entity.name, outcome.exitCode)` and `(credential.knownHostsFile, facts.stderr, node.name, facts.exitCode)`; as many references as calls; more than 100 files read | the two calls are found with three arguments each |
| the fixture | 30, "does not compile" | `hostKeyTold(undefined, '…', 'box')` in a program of its own | TS2554 at line 7, and no other diagnostic | "the fixture compiled" |

**Why the rows are as they are.**

- **S7 and S8 are per text.** A rule that is right for one text and wrong for another shows which one. S7 is the row that the
  parent's mutation "ask the exit code AFTER the evidence" must turn red, and S8 must stay green there (MU4).
- **X9 with X10, and X12 with X13, answer each text twice with the SAME stdout and stderr: with 0, and with 255.** So the exit
  code alone decides, as the control of M5 (h) asks of (g). X10 answers 255 with the stdout of a GOOD probe: the road must stop
  all the same.
- **X12 exists because mode 600 shows nothing.** A check that returned before it read the stdout would pass X11. With `644`
  the check must show the warning of a wide socket, so the mode was read. X13 is its guard: with 255 the same stdout is not read.
- **X9's second text holds the evidence under exit code 0.** A real `ssh` cannot produce that run. It is the road's side of S7:
  the order of the questions, seen on the road.
- **X14 holds "a missing code is never 0" on both roads.** It is green before and after: E2 asked the text alone. MU5, MU6,
  MU8 and MU9 turn it red.
- **X15 names the arguments.** The list is exact on purpose: a renamed variable turns it red, and its message says what to keep.
  The second assertion closes the door that a list of calls leaves open: the function handed on as a value, imported under
  another name, or reached through a namespace import (MU12).
- **The question of X9 is read from the product's function**, because test 29 names it so ("the one that `confirmationFor`
  builds from the probe's answer") and its words are not this story's. Sentences C and D stay literals of the test.

### 5.2 Which expectations of the tests 1-27 change

**No expectation changes. Five CALL lines change, in one file.** The commit that changes them names them (§5 of the parent).

| Test of 1-27 | What changes | Why |
|---|---|---|
| S1 (11 tests; `test/hostKeyTold.test.ts:123`) | the call hands 255 as its last argument; `TOLD_C` is expected, as before | the texts of S1 are those that `ssh` printed for a refused key, and that run ended with 255 (Z7) |
| S2 (15 tests; `:153`) | the same; `TOLD_D` is expected, as before | the same; a remote text there is the case that E3's M5 (g) runs with 255 |
| S3 (`:161`), S3b (`:168`), S4 (`:175`) | the same; `undefined` is expected, as before | the same |
| the type `Told` (`:89`) | gains `exitCode: number \| null` | it is the test's own type of the function (Z11); with it the compiler refuses a call of the test that hands no code |

Nothing else of the tests 1-27 changes: S0, S5, S6, X0 to X8 of the same file; every test of `test/personRoadsHostKey.test.ts`
(34), `test/personRoadsPin.test.ts`, `test/personRoadsPinRefusals.test.ts`, `test/personPin.test.ts`, `test/writtenKey.test.ts`,
`test/hostKeyWords.test.ts`, `test/pinWords.test.ts`, `test/pinClient.test.ts` and `test/itestCallers.test.ts`. No road test
answered the verification line with exit code 0 (Z14). If an existing test turns red after §2 and §3, stop and tell the lead.

### 5.3 `test/hostKeyTold.test.ts`: the diff

The whole diff against the file of `8dabad08`, as measured (369 → 569 lines; 50 → 94 tests). Written FIRST, on the product
before this story, and watched there (§6).

```diff
--- a/src_vs_code/src/test/hostKeyTold.test.ts
+++ b/src_vs_code/src/test/hostKeyTold.test.ts
@@ -2,7 +2,12 @@ import assert from 'node:assert/strict';
 import * as fs from 'node:fs';
+import * as path from 'node:path';
 import { after, test, TestContext } from 'node:test';
+import * as ts from 'typescript';
 import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
 import * as hostKeyPin from '../hostKeyPin';
+import { confirmationFor, interpretProbe } from '../remoteCliInstall';
+import { importedUses } from './funnelScan';
 import { KEY, Parts, World, click, knownHostsOf, passwordLogin, pinFiles, ran, settled, world } from './personRoadsWorld';
 import { testPin } from './pinnedArgv';
+import { discoverSources } from './tempSiteScan';
 
@@ -22,2 +27,9 @@ import { testPin } from './pinnedArgv';
  * (OpenSSH_for_Windows 9.5p2, the same day, measured by hand): 13 lines, with every backslash of the path as two. No login was made on Windows.</p>
+ *
+ * <p><b>E3.S1 (C19): the exit code of the run is asked first.</b> A run that ended with 0 is told nothing about a host key, whatever its
+ * text holds: its `ssh` accepted the host's key, logged in and ran the remote command to its end, so the line in its text is the remote
+ * side's. S7 to S11 hold that on the function, X9 to X14 on the two roads (each text is answered twice with the same stdout, with 0 and
+ * with 255, so the exit code alone decides), and <b>part 3</b> holds the callers: exactly two, each handing the exit code of the run
+ * whose text it hands. That a call without the exit code does not compile is the fixture
+ * `fixtures/typed/host_key_told_needs_the_exit_code.ts` (`typedFixtures.test.ts`). No real `ssh` ends with 0 here: E3's M5 (h) runs one.</p>
  */
@@ -87,4 +99,7 @@ const NO_BANNER = printed('Connection timed out during banner exchange');
 
-/** `hostKeyTold`. Its first argument is the checked pin of the call (E2.S2's `CheckedPin`): a test makes one with `testPin`, through the product's own maker. */
-type Told = (pin: unknown, stderr: string, name: string) => { install: string; bridge: string } | undefined;
+/**
+ * `hostKeyTold`. Its first argument is the checked pin of the call (E2.S2's `CheckedPin`): a test makes one with `testPin`, through the product's own maker.
+ * Its last argument is the exit code of the run (E3.S1): 255 is what `ssh` ended with for every text of S1 to S4 that it printed itself.
+ */
+type Told = (pin: unknown, stderr: string, name: string, exitCode: number | null) => { install: string; bridge: string } | undefined;
 
@@ -122,3 +137,3 @@ for (const row of EVIDENCE) {
 
-    assert.deepEqual(hostKeyTold(testPin(row.pinFile), row.stderr, 'box'), TOLD_C);
+    assert.deepEqual(hostKeyTold(testPin(row.pinFile), row.stderr, 'box', 255), TOLD_C);
   });
@@ -152,3 +167,3 @@ for (const row of NO_EVIDENCE) {
 
-    assert.deepEqual(hostKeyTold(testPin(PIN_FILE), row.stderr, 'box'), TOLD_D);
+    assert.deepEqual(hostKeyTold(testPin(PIN_FILE), row.stderr, 'box', 255), TOLD_D);
   });
@@ -160,3 +175,3 @@ test('S3: a pinned call whose stderr holds no verification line is told nothing:
   for (const stderr of [HOST_DOWN, LOGIN_REFUSED, NO_ANSWER, NO_BANNER, '', printed(`note: ${VERIFICATION} earlier`), printed('Host key verification failed')]) {
-    assert.equal(hostKeyTold(testPin(PIN_FILE), stderr, 'box'), undefined, stderr);
+    assert.equal(hostKeyTold(testPin(PIN_FILE), stderr, 'box', 255), undefined, stderr);
   }
@@ -167,3 +182,3 @@ test('S3b: the Offending line of this call WITHOUT the verification line is told
 
-  assert.equal(hostKeyTold(testPin(PIN_FILE), printed(`Offending ED25519 key in ${PIN_FILE}:1`), 'box'), undefined);
+  assert.equal(hostKeyTold(testPin(PIN_FILE), printed(`Offending ED25519 key in ${PIN_FILE}:1`), 'box', 255), undefined);
 });
@@ -174,3 +189,3 @@ test('S4: an unpinned call is told nothing, whatever its ssh printed', () => {
   for (const stderr of [refusedKey(PIN_FILE), HOP_REFUSED, NO_KEY_KNOWN, `${VERIFICATION}\n`]) {
-    assert.equal(hostKeyTold(undefined, stderr, 'box'), undefined, stderr);
+    assert.equal(hostKeyTold(undefined, stderr, 'box', 255), undefined, stderr);
   }
@@ -203,2 +218,61 @@ test('S6: sentence D never tells the person to replace, trust or forget a saved
 
+/* --- part 1, E3.S1 (C19): the exit code of the run is asked first --- */
+
+/** The exit codes of a run that did NOT end with 0, beside `ssh`'s own 255 of S1 to S4: another code; none (the runner's `null`: a time limit, a signal); and the -1 that `runRemote` hands for a run with none. */
+const NOT_ZERO: readonly { label: string; exitCode: number | null }[] = [
+  { label: 'another code, 1', exitCode: 1 },
+  { label: 'no exit code, the null of the runner', exitCode: null },
+  { label: 'the -1 that the install hands for a run with no exit code', exitCode: -1 },
+];
+const EVERY_CODE: readonly (number | null)[] = [0, 255, ...NOT_ZERO.map((one) => one.exitCode)];
+
+for (const row of EVIDENCE) {
+  test(`S7: a run that ended with 0 is told nothing, also when its text names the pin file of this call beside the verification line, ${row.label}`, () => {
+    const hostKeyTold = exported<Told>('hostKeyTold');
+
+    assert.equal(hostKeyTold(testPin(row.pinFile), row.stderr, 'box', 0), undefined);
+  });
+}
+
+for (const row of NO_EVIDENCE) {
+  test(`S8: a run that ended with 0 is told nothing when its text holds the verification line with no evidence, ${row.label}`, () => {
+    const hostKeyTold = exported<Told>('hostKeyTold');
+
+    assert.equal(hostKeyTold(testPin(PIN_FILE), row.stderr, 'box', 0), undefined);
+  });
+}
+
+for (const code of NOT_ZERO) {
+  test(`S9 (guard): a run that did not end with 0 is told as its text says, sentence C on the evidence and sentence D without it: ${code.label}`, () => {
+    const hostKeyTold = exported<Told>('hostKeyTold');
+
+    for (const row of EVIDENCE) {
+      assert.deepEqual(hostKeyTold(testPin(row.pinFile), row.stderr, 'box', code.exitCode), TOLD_C, row.label);
+    }
+    for (const row of NO_EVIDENCE) {
+      assert.deepEqual(hostKeyTold(testPin(PIN_FILE), row.stderr, 'box', code.exitCode), TOLD_D, row.label);
+    }
+  });
+}
+
+test('S10 (guard): a text with no verification line is told nothing under every exit code, and so is the Offending line of this call alone', () => {
+  const hostKeyTold = exported<Told>('hostKeyTold');
+
+  for (const exitCode of EVERY_CODE) {
+    for (const stderr of [HOST_DOWN, LOGIN_REFUSED, NO_ANSWER, NO_BANNER, '', printed(`Offending ED25519 key in ${PIN_FILE}:1`)]) {
+      assert.equal(hostKeyTold(testPin(PIN_FILE), stderr, 'box', exitCode), undefined, `exit code ${exitCode}: ${stderr}`);
+    }
+  }
+});
+
+test('S11 (guard): an unpinned call is told nothing under every exit code, whatever its ssh printed', () => {
+  const hostKeyTold = exported<Told>('hostKeyTold');
+
+  for (const exitCode of EVERY_CODE) {
+    for (const stderr of [refusedKey(PIN_FILE), HOP_REFUSED, NO_KEY_KNOWN, `${VERIFICATION}\n`]) {
+      assert.equal(hostKeyTold(undefined, stderr, 'box', exitCode), undefined, `exit code ${exitCode}: ${stderr}`);
+    }
+  }
+});
+
 /* --- part 2: the two roads --- */
@@ -369 +443,127 @@ test('X8 (guard): the SECOND run of the install keeps the sentence of before, al
 });
+
+/* --- part 2, E3.S1 (C19): a run that ended with 0 goes on --- */
+
+const INSTALLED = 'creds-install: installed /home/dev/.local/bin/creds\n';
+/** What the mode check answers for a socket that only its owner can reach, and for one that is wider: the second is told with a warning, so a test can see that the mode was read. */
+const OWNER_ONLY = '600';
+const WIDE_MODE = '644';
+
+/** Texts that hold the verification line, and what each is told when its run did NOT end with 0. A road answers each twice with the SAME stdout and stderr: with 0, and with 255. */
+const LINE_HELD: readonly { label: string; sentence: string; stderr: (argv: readonly string[]) => string; told: { install: string; bridge: string } }[] = [
+  { label: 'the remote side wrote the line', sentence: 'sentence D', stderr: () => `profile: sourcing extras\n${VERIFICATION}\n`, told: TOLD_D },
+  { label: 'the text names the pin file of the run', sentence: 'sentence C', stderr: (argv) => refusedKey(asSshPrints(pinFileOf(argv))), told: TOLD_C },
+];
+
+/** A run that has no exit code: the runner answers `null` (a signal ended the child). */
+const noCode = (stdout: string, stderr: string): ReturnType<typeof ran> => ({ ...ran(stdout, 0, stderr), exitCode: null });
+
+for (const row of LINE_HELD) {
+  test(`X9: the install goes on to the question of its probe when the probe ended with 0 and ${row.label}`, async () => {
+    const w = world(pinned(storage('x9'), { answer: yes, run: (index, argv) => (index === 0 ? ran(PROBE_OK, 0, row.stderr(argv)) : ran(INSTALLED)) }));
+    await click(w, 'installRemoteCli');
+
+    assert.deepEqual(w.errors, [], `X9: a probe that ended with 0 was told about a host key: ${w.errors.join(' | ')}`);
+    assert.deepEqual(w.warnings, []);
+    assert.deepEqual(w.asked.map((one) => one.message), [confirmationFor(interpretProbe(PROBE_OK), 'box').message], 'X9: the install did not ask the question that its probe answers');
+    assert.equal(w.runs.length, 2, 'X9: the install run did not start after the yes');
+  });
+
+  test(`X10 (guard): the same probe with exit code 255 is told ${row.sentence} and the install stops, when ${row.label}`, async () => {
+    const w = world(pinned(storage('x10'), { answer: yes, run: (_index, argv) => ran(PROBE_OK, 255, row.stderr(argv)) }));
+    await click(w, 'installRemoteCli');
+
+    assert.deepEqual(w.errors, [row.told.install], 'X10: the exit code 255 with the line was not told');
+    assert.deepEqual(w.asked, [], 'X10: the install asked its question');
+    assert.equal(w.runs.length, 1, 'X10: the install went on');
+  });
+
+  test(`X11: the socket check shows no message when its run ended with 0 and ${row.label}; the bridge stays open`, async (t) => {
+    const w = await bridged(t, pinned(storage('x11'), { run: (_index, argv) => ran(OWNER_ONLY, 0, row.stderr(argv)) }));
+
+    assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
+    assert.deepEqual(w.errors, [], `X11: a check that ended with 0 was told about a host key: ${w.errors.join(' | ')}`);
+    assert.deepEqual(w.warnings, []);
+    assert.deepEqual(w.logs.filter((line) => line === row.told.bridge || line.includes(NOT_READ)), [], 'X11: the check logged a host key, or a mode that it did not read');
+    assert.equal(w.bridges.isOpen(KEY), true, 'X11: the check closed the bridge');
+  });
+
+  test(`X12: the socket check READS the mode when its run ended with 0 and ${row.label}: a socket wider than 600 is told`, async (t) => {
+    const w = await bridged(t, pinned(storage('x12'), { run: (_index, argv) => ran(WIDE_MODE, 0, row.stderr(argv)) }));
+
+    assert.deepEqual(w.errors, [], `X12: a check that ended with 0 was told about a host key: ${w.errors.join(' | ')}`);
+    assert.equal(w.warnings.length, 1, `X12: the check did not read the mode of the socket: ${w.warnings.join(' | ')}`);
+    assert.match(w.warnings[0], /has mode 644 rather than 600/);
+    assert.equal(w.bridges.isOpen(KEY), true, 'X12: the check closed the bridge');
+  });
+
+  test(`X13 (guard): the same run of the check with exit code 255 shows ONE error message with ${row.sentence} and does not read the mode, when ${row.label}`, async (t) => {
+    const w = await bridged(t, pinned(storage('x13'), { run: (_index, argv) => ran(WIDE_MODE, 255, row.stderr(argv)) }));
+
+    assert.deepEqual(w.errors, [row.told.bridge], 'X13: the exit code 255 with the line was not told');
+    assert.deepEqual(w.warnings, [], 'X13: the check read a stdout that it must not trust');
+  });
+}
+
+test('X14 (guard): a probe with NO exit code that holds the line is told sentence D: a missing code is never read as 0', async () => {
+  const w = world(pinned(storage('x14'), { answer: yes, run: () => noCode(PROBE_OK, `${VERIFICATION}\n`) }));
+  await click(w, 'installRemoteCli');
+
+  assert.deepEqual(w.errors, [SENTENCE_D], 'X14: a run with no exit code was read as a run that ended with 0');
+  assert.deepEqual(w.asked, [], 'X14: the install asked its question');
+});
+
+test('X14 (guard): a run of the socket check with NO exit code that holds the line is told sentence D: a missing code is never read as 0', async (t) => {
+  const w = await bridged(t, pinned(storage('x14'), { run: () => noCode(WIDE_MODE, `${VERIFICATION}\n`) }));
+
+  assert.deepEqual(w.errors, [TOLD_D.bridge], 'X14: a run with no exit code was read as a run that ended with 0');
+  assert.deepEqual(w.warnings, []);
+});
+
+/* --- part 3, E3.S1: the callers --- */
+
+const SRC = path.resolve(__dirname, '..', '..', 'src');
+
+/** Every shipped source file. */
+const SOURCES = discoverSources(SRC, new Map([['test', 'the tests are not shipped: they call the function with texts and exit codes of their own']]));
+
+const sourceOf = (file: string): string => fs.readFileSync(path.join(SRC, file), 'utf8');
+
+interface Call {
+  readonly file: string;
+  readonly args: readonly string[];
+}
+
+/** Every call of `hostKeyTold` by that name in one file, with its arguments as they are written. The syntax tree is read, so a call over several lines is one call. */
+function callsOf(file: string): Call[] {
+  const source = ts.createSourceFile(file, sourceOf(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
+  const found: Call[] = [];
+  const visit = (node: ts.Node): void => {
+    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'hostKeyTold') {
+      found.push({ file, args: node.arguments.map((one) => one.getText(source)) });
+    }
+    ts.forEachChild(node, visit);
+  };
+  visit(source);
+  return found;
+}
+
+const HOW_TO_FIX =
+  "a call of hostKeyTold was added, moved or changed. Each caller hands the exit code of the SAME run whose stderr it hands, as that run answered it: never a constant, and never 0 for a run with no exit code (PLAN_person_roads_pin_host_key.md, section 3.12, part 4). Then edit this list in the same commit";
+
+test('X15: hostKeyTold has exactly two callers, the socket check and the install, and each hands the stderr and the exit code of one and the same run', () => {
+  assert.ok(SOURCES.length > 100, `the discovery found only ${SOURCES.length} files`);
+  const calls = SOURCES.flatMap(callsOf);
+
+  assert.deepEqual(
+    calls,
+    [
+      { file: 'commands/agentCommands.ts', args: ['credential.knownHostsFile', 'outcome.stderr', 'entity.name', 'outcome.exitCode'] },
+      { file: 'commands/agentCommands.ts', args: ['credential.knownHostsFile', 'facts.stderr', 'node.name', 'facts.exitCode'] },
+    ],
+    HOW_TO_FIX,
+  );
+  // A reference of another kind (the function handed on as a value, imported under another name or through a namespace) would be a caller that the list above does not see.
+  const uses = SOURCES.flatMap((file) => importedUses(file, sourceOf(file), 'hostKeyTold', 'hostKeyPin'));
+  assert.equal(uses.length, calls.length, `${HOW_TO_FIX}. hostKeyTold is named at: ${uses.map((use) => `${use.file}:${use.line}`).join(', ')}`);
+});
```

### 5.4 The fixture: `test/fixtures/typed/host_key_told_needs_the_exit_code.ts` (new)

The whole file. Its call stands on line 7.

```ts
// expect TS2554 at line 7
// What a person is told about a host key is asked WITH the exit code of the run (G1, E3.S1, C19): a run that ended with 0 is told
// nothing. A call that hands no exit code does not compile, so no caller can leave the question out, and the parameter cannot be
// made optional without this file turning red.
import { hostKeyTold } from '../../../hostKeyPin';

export const told = hostKeyTold(undefined, 'Host key verification failed.\n', 'box');
```

`typedFixtures.test.ts` finds it by its folder: the test file is not edited. The harness requires exactly ONE diagnostic, with
this code at this line, so a fixture that fails for another reason (an import that does not resolve) is red too.

## 6. RED first: how it is watched, and what was seen

**How.** The new argument does not compile against the function of before when the function is called by its name. The tests do
not call it so: part 1 reads it through the module object under the test's own type (Z11), part 2 drives the roads, part 3 reads
source text, and the fixture is compiled by the harness and not by `tsc -p ./`. So the test file of §5.3 and the fixture of §5.4
compile on the product of `8dabad08` (`tsc` exit 0), and every RED below is a failed assertion.

**Measured on the scratch copy, 2026-11-23** (Z16 a): the test file of §5.3 and the fixture of §5.4, with `hostKeyPin.ts` and
`commands/agentCommands.ts` as they are at `8dabad08`.

```text
npx tsc -p ./                                                   exit 0
run-tests.mjs "out/test/hostKeyTold.test.js"                    tests 94, pass 61, fail 33
run-tests.mjs "out/test/typedFixtures.test.js"                  tests 23, pass 22, fail 1
run-tests.mjs "out/test/personRoadsHostKey.test.js"             tests 34, pass 34, fail 0
```

The 33 of `hostKeyTold.test.js`: S7 (11), S8 (15), X9 (2), X11 (2), X12 (2), X15 (1). The first lines of each failure, as the
runner printed them; a group with one name and one text is printed once:

```text
✖ S7: a run that ended with 0 is told nothing, also when its text names the pin file of this call beside the verification line, the 15 lines as ssh prints them, with CR LF
  (and the ten others of S7)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + {
  +   bridge: `The bridge to "box" is not open: "box" did not present its saved host key, so CredsForDevs did not connect. […]`,
  +   install: `"box" did not present its saved host key, so CredsForDevs did not connect. […]`
  + }
  - undefined
✖ S8: a run that ended with 0 is told nothing when its text holds the verification line with no evidence, a remote text that ENDS with the line
  (and the fourteen others of S8)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + {
  +   bridge: `The bridge to "box" could not be checked: The connection to "box" ended with "Host key verification failed", […]`,
  +   install: `The connection to "box" ended with "Host key verification failed", and ssh did not name the saved host key of this entry as the reason. […]`
  + }
  - undefined
✖ X9: the install goes on to the question of its probe when the probe ended with 0 and the remote side wrote the line
  AssertionError [ERR_ASSERTION]: X9: a probe that ended with 0 was told about a host key: The connection to "box" ended with "Host key verification failed", […]
  + [
  +   `The connection to "box" ended with "Host key verification failed", and ssh did not name the saved host key of this entry as the reason. […]`
  + ]
  - []
✖ X9: the install goes on to the question of its probe when the probe ended with 0 and the text names the pin file of the run
  AssertionError [ERR_ASSERTION]: X9: a probe that ended with 0 was told about a host key: "box" did not present its saved host key, so CredsForDevs did not connect. […]
✖ X11: the socket check shows no message when its run ended with 0 and the remote side wrote the line; the bridge stays open
  AssertionError [ERR_ASSERTION]: X11: a check that ended with 0 was told about a host key: The bridge to "box" could not be checked: The connection to "box" ended with "Host key verification failed", […]
✖ X11: the socket check shows no message when its run ended with 0 and the text names the pin file of the run; the bridge stays open
  AssertionError [ERR_ASSERTION]: X11: a check that ended with 0 was told about a host key: The bridge to "box" is not open: "box" did not present its saved host key, […]
✖ X12: the socket check READS the mode when its run ended with 0 and the remote side wrote the line: a socket wider than 600 is told
  AssertionError [ERR_ASSERTION]: X12: a check that ended with 0 was told about a host key: The bridge to "box" could not be checked: […]
✖ X12: the socket check READS the mode when its run ended with 0 and the text names the pin file of the run: a socket wider than 600 is told
  AssertionError [ERR_ASSERTION]: X12: a check that ended with 0 was told about a host key: The bridge to "box" is not open: […]
✖ X15: hostKeyTold has exactly two callers, the socket check and the install, and each hands the stderr and the exit code of one and the same run
  AssertionError [ERR_ASSERTION]: a call of hostKeyTold was added, moved or changed. Each caller hands the exit code of the SAME run whose stderr it hands, as that run answered it: never a constant, and never 0 for a run with no exit code […]
    [
      {
        args: [
          'credential.knownHostsFile',
          'outcome.stderr',
          'entity.name',
  -       'outcome.exitCode'
        ],
        file: 'commands/agentCommands.ts'
      },
      {
        args: [
  ...
          'node.name',
  -       'facts.exitCode'
        ],
        file: 'commands/agentCommands.ts'
      }
    ]
```

The one of `typedFixtures.test.js`:

```text
✖ host_key_told_needs_the_exit_code.ts is refused with TS2554 at line 7
  AssertionError [ERR_ASSERTION]: expected TS2554 at line 7 of host_key_told_needs_the_exit_code.ts — the fixture compiled
```

Each is the right reason. The function of before reads the text alone, so a run that ended with 0 gets sentence C or D (S7, S8),
and the roads show it and stop (X9, X11, X12). The two callers hand three arguments (X15). A call of three arguments compiles
(the fixture). The 61 green tests of `hostKeyTold.test.js` are E2.S3's 50 and the 11 guards of this story: S9 (3), S10, S11,
X10 (2), X13 (2), X14 (2). The coder's own RED run must show these 33 and this 1, and no other. A different text, or one more
failure, is a reason to stop.

**GREEN, measured** (Z16 b), after §2 and §3: `tsc` exit 0; `hostKeyTold` 94 of 94, `typedFixtures` 23 of 23,
`personRoadsHostKey` 34 of 34.

## 7. The mutation checks (each one must turn the named tests red; restore after each one)

Each mutation is a temporary edit of the PRODUCT, never of a test. Compile (read the exit), run `hostKeyTold.test.js` (94) and
`personRoadsHostKey.test.js` (34), and for a mutation of the signature also `typedFixtures.test.js` (23); read what is red;
restore; compile again before the next one. "Red" below is what was measured on the scratch copy (Z16 e). A mutation that turns
red something else, or less, is a finding for the lead. `G` is the line `if (pin === undefined || exitCode === 0) {`.
`T9a` and `T9b` are E1.S3's tests in `test/personRoadsHostKey.test.ts`.

| # | The mutation | Red |
|---|---|---|
| MU1 | A sentence is answered under exit code 0: `G` becomes `if (pin === undefined \|\| (void exitCode, false)) {` (the `void` reads the parameter, which the compiler refuses when nothing reads it) | 32 of 94: S7 (all 11), S8 (all 15), X9 (both), X11 (both), X12 (both) |
| MU2a | The install hands the constant 0: its call ends with `node.name, 0)` | 10 of 94: X1 (both), X2 (all 4), X10 (both), X14 (the install), X15; and T9a |
| MU2b | The install hands the constant 255 | 3: X9 (both), X15 |
| MU2c | The socket check hands the constant 0: its call ends with `entity.name, 0)` | 8: X3, X4, X5, X6, X13 (both), X14 (the check), X15; and T9b |
| MU2d | The socket check hands the constant 255 | 5: X11 (both), X12 (both), X15 |
| MU3a | The parameter is optional: `exitCode?: number \| null` | 1 of 23 in `typedFixtures`: the fixture ("the fixture compiled"). 0 of 94 and 0 of 34 |
| MU3b | The parameter has a default: `exitCode: number \| null = 255` | the same 1 of 23; 0 of 94 and 0 of 34 |
| MU4 | The exit code is asked AFTER the evidence: `G` becomes `if (pin === undefined) {`; `toldByText` gets the exit code as a fourth parameter and asks `if (exitCode === 0) { return undefined; }` between its `return` of sentence C and its `return` of sentence D | 14: S7 (all 11), and X9, X11 and X12 for the text that names the pin file (1 each). S8 stays green |
| MU5 | `runRemote` answers 0 for a run with no exit code: `run.exitCode ?? 0` | 1: X14 (the install) |
| MU6 | The socket check hands 0 for a run with no exit code: `outcome.exitCode ?? 0` | 2: X14 (the check), X15 |
| MU7 | A sentence only for exit code 255 (the rule that the parent did not take): `G` asks `exitCode !== 255` | 5: S9 (all 3), X14 (both) |
| MU8 | No exit code is read as 0 inside the function: `G` asks `!exitCode` | 2: S9 (no exit code), X14 (the check) |
| MU9 | A code of 0 or below is read as a run that ended well: `G` asks `(exitCode !== null && exitCode <= 0)` | 2: S9 (the -1), X14 (the install) |
| MU10 | The install asks with the stdout of its probe (E2.S3's Y25, on the new guards): `facts.stdout` in place of `facts.stderr` | 10: X1 (both), X2 (all 4), X10 (both), X14 (the install), X15; and T9a |
| MU11 | A third caller, with a constant: behind the `runRemote` of the install run, the line `void hostKeyTold(credential.knownHostsFile, run.stderr, node.name, 0);` | 1: X15 (three calls where two are listed) |
| MU12 | The function is handed on as a value: at the same place, the line `void hostKeyTold;` | 1: X15 (three references to the import, two calls) |

All of them compiled (`tsc` exit 0). MU1 to MU4 are the parent's test 31, in its order: "answer a sentence under exit code 0 →
28 and 29 are red" is MU1; "hand a constant in place of the run's own code at one caller → 29 is red for that road" is MU2a to
MU2d (both constants, at both callers); "make the parameter optional → 30 is red" is MU3a and MU3b; "ask the exit code AFTER the
evidence of sentence C → the sentence C case of 28 under exit code 0 is red" is MU4. MU5 to MU12 are this spec's own. In MU2a to
MU2d the scan X15 is red too; the road tests are red WITHOUT it, so the behaviour is held and not only the text of the call.

## 8. The documents of this story

Three documents and the docblock of §2 (which is in the product commit). The texts below are what each must say; fit the wording
to the lines around it, and keep every fact.

### 8.1 `src_vs_code/CHANGELOG.md`: the heading of 1.23.0 and a NEW entry; the text that 1.23.0 shipped is not changed

**How this repository's releases meet this file (Z17, Z18).** release-please writes `src_vs_code/RELEASES.md`, the version of
`package.json` and of `package-lock.json`, and its manifest. It never writes `CHANGELOG.md`: that file is prose that a person
writes. An entry is written under `## [Unreleased]` with the change. The heading of a released version has been written by hand
after the release, in the pull request that promoted the plan (#375, #378). For 1.23.0 nobody has written it: G1 is not promoted,
because E3 is open, and entry 3.1 released before E3. So today the three entries that 1.23.0 shipped stand under
`## [Unreleased]`.

**The rule of this story, as the lead settled it** (the stories document, *Questions for the lead*, the answer to its Q2: choice
(a), on E3's branch; consult `552ad198`; "none is a plan change"). The parent's §6 says that E3.S1 "updates … the CHANGELOG
entry, where it lists 'a remote command that prints that line'". That sentence was written before entry 3.1. The entry has
shipped: 1.23.0's package carries it, with the sentence "Not yet right: …". An edit in place would make a released text say what
its package does not do. So:

- **No character of `:9-110` changes** (the three entries of 1.23.0, Z17). Not the case list of the second message (`:46`), and
  not the sentence "Not yet right: …" (`:104-105`): both are true for 1.23.0.
- **The documents commit of this story writes the heading of 1.23.0**, as the lead's answer words it: the line
  `## [1.23.0] — 2026-11-23 — Security — a call without a terminal trusts only a saved host key that can be used; the search stays in reach`, above the first entry that 1.23.0 shipped (`:9`), with one empty line before it and one after it.
  All three `###` headings of `:9-110` then stand under it. If the file already holds a `## [1.23.0]` heading when step 5 of
  §10 starts (another session wrote it on `main`, and the branch took it by a merge), it is not written a second time. Q1 asks
  about the form of that line.
- **The fix is a NEW entry under `## [Unreleased]`**, above that heading. The next release ships it. It names 1.23.0 and what
  that version said. E3.S10 later writes into the same section what §10 of the parent supports (the stories document, E3.S10).

**The layout after this story:**

```markdown
## [Unreleased]

### Fixed — a server that prints "Host key verification failed" and still answers no longer stops Install creds on host or the bridge's socket check

<the four paragraphs below>

## [1.23.0] — 2026-11-23 — Security — a call without a terminal trusts only a saved host key that can be used; the search stays in reach

### Added — the search stays in reach and its filter stays in view
<… the three entries of 1.23.0, not one character changed …>

## [1.22.3] — 2026-11-17 — Security — the extension's own `ssh` calls share no connection
```

`release.yml:932-944` takes the notes of a release from `'## [' + version + ']'` to the next `## [`. With this layout the section
of 1.23.0 ends at `## [1.22.3]`, and the new entry is not in it.

**The new entry, its text:**

```markdown
### Fixed — a server that prints "Host key verification failed" and still answers no longer stops Install creds on host or the bridge's socket check

Since 1.23.0, *Install creds on host* and the socket check of *Open Remote Bridge…* tell you when their call for an entry with a
saved host key ends with `Host key verification failed`. That rule read the text of the run alone. So when the server itself
printed that line (a profile of the login, or the command) and the run still ended with exit code 0, *Install creds on host* stopped before its question with the second message of 1.23.0 (`The
connection to "<name>" ended with "Host key verification failed", and ssh did not name the saved host key of this entry as the
reason. …`), and after *Open Remote Bridge…* the socket check said `The bridge to "<name>" could not be checked: …` although it
could read the socket. 1.23.0 named this under "Not yet right".

Now the exit code of the run is asked first. A run that ended with exit code 0 is told nothing about a host key, whatever it
printed: *Install creds on host* goes on to its question, and the socket check goes on and reads the mode of the socket. `ssh`
ends with 255 when it refuses a host's key, and with the exit code of the remote command when that command ran (the manual,
`ssh(1)`), so a run that ended with 0 was not refused. A run that did not end with 0 is told as in 1.23.0: a refused host key,
and also a remote command that prints that line and ends with another code than 0, which still gets the second message. So is a
run that has no exit code (the time limit ended it). An entry with no saved host key is told none of this, as before.

Nothing that `ssh` is given changes: the same words, and the same one file with the saved key. So what `ssh` accepts and refuses
is as in 1.23.0. What changes is one message, which was shown for a run that `ssh` had not refused.

Held by the tests, on the texts that a real `ssh` printed: the same text is answered with exit code 0 and with 255, and the exit
code alone decides. Not measured yet: a real `ssh` against a real `sshd` whose run ends with exit code 0 and holds that line,
through these two commands. The real-road runs that follow measure it.
```

**The claims of the entry** (the parent's §6: "every sentence of the entry that claims a behaviour has a test of §5 or a row of
E3 behind it"). This table goes into the body of the commit of the documents (§10), and E3 reads it when it writes §10 of the
parent.

| # | The claim (the entry's words, shortened) | The suite | By hand / read | E3 |
|---|---|---|---|---|
| CF1 | in 1.23.0 a run that ended with 0 and held the line stopped the install with the second message, and the check said "could not be checked" | the RED of X9, X11 and X12 on the tree of 1.23.0 (§6; Z16 a) | the entry of 1.23.0 says it itself (`:104-105`) | none: E3 measures the tree after this story |
| CF2 | a run that ended with 0 is told nothing about a host key, whatever it printed | S7, S8 | — | M5 (h) |
| CF3 | the install goes on to its question | X9 | — | M5 (h) |
| CF4 | the socket check goes on and reads the mode of the socket | X11, X12 | — | M5 (h) |
| CF5 | `ssh` ends with 255 when it refuses a host's key | the smoke, leg 2 (`scripts/itestPinnedRoads.cjs:533`, `:560`) | measured by hand (§3.5, §3.12; E2.S3, J4) | M2 (each run that starts ends with 255 and the verification line); M5 (f), (g) |
| CF6 | `ssh` ends with the exit code of the remote command when that command ran | — | read (`ssh(1)`, *EXIT STATUS*, Z6); the entry says "the manual" | M5 (g) and (h) record both codes |
| CF7 | a run that did not end with 0 is told as in 1.23.0 | S1, S2, S9; X1 to X6, X10, X13 | — | M5 (a), (f), (g) |
| CF8 | a remote command that prints the line and ends with another code than 0 still gets the second message | S2 (the two remote texts), S9 (code 1); X2 (its fourth row), X3, X10, X13 | — | M5 (g), with 255 |
| CF9 | a run with no exit code is told as in 1.23.0 | S9 (`null`, -1); X14 | — | none |
| CF10 | an entry with no saved host key is told none of this | S4, S11; X7 | — | none: no row runs an unpinned entry whose `ssh` prints the line |
| CF11 | nothing that `ssh` is given changes | `hostKeyWords.test.ts`, `pinWords.test.ts`, T1 to T4 and T11 of `personRoadsHostKey.test.ts` pass with no edit; `git diff` of `hostKeyWords`, `sshExecCommand.ts` and `sshBridge.ts` is empty | — | M1 |

The last paragraph of the entry claims no behaviour: it says what holds the claims, and what is not measured.

### 8.2 `research/module_extension.md`, **B10 — the host key**

In the paragraph "**The three roads of the person (G1, E1.S3).**" (`:5427-5456`). Two changes.

1. Directly behind the sentence that ends with "… is decided by one function, `hostKeyTold` in `hostKeyPin.ts` (G1, E2.S3)."
   (`:5432-5433`), and before "**Sentence C** (`refusedHostKeySentence` …", this text comes in:

   ```markdown
   **The exit code of the run is its first question (G1, E3.S1; C19).** Each of its two callers hands it the exit code of the SAME
   run whose stderr it hands, as a required parameter: the socket check the runner's own (`number | null`), the install the one of
   `runRemote`, which is -1 for a run with no code. A missing code is never 0. A run that ended with 0 is told nothing, whatever
   its text holds, sentence C included: `ssh` ends with 255 when it refuses a host's key (measured), and with the exit code of the
   remote command when that command ran (read in `ssh(1)`), so a run that ended with 0 was not refused, and a verification line in
   its text is the remote side's (a profile of the login, or the command). The install then goes on to its question, and the socket
   check goes on and reads the socket's mode. A run that ended with another code, or that has none, is asked as follows.
   ```

2. In the sentence about sentence D (`:5439-5440`), "a jump host's refused key, an `ssh` config that gives the host another name
   or port, a remote text" becomes "a jump host's refused key, an `ssh` config that gives the host another name or port, a remote
   text in a run that did not end with 0".

The rest of the paragraph does not change. Its last sentence but one, "What was measured, and what the function cannot tell, is
in its docblock", stays true: the docblock of §2 says what was read and what was not run.

### 8.3 `research/module_tests.md`, the section `## The three roads of the person and the saved host key (G1)`

Read the counts from the runner, not from this document.

1. **The row of `hostKeyTold.test.ts`** (`:2566`). Its count becomes the runner's (94 measured; the row says 49 today and the
   runner says 50, Z15). Its text opens "E2.S3, and E3.S1 (C19)." and gains, behind the part about X0 to X8:

   ```markdown
   E3.S1, the exit code of the run is asked first (the plan's §3.12, part 4; tests 28 to 30). S7 and S8: every text that gives sentence C or sentence D gives NOTHING when its run ended with 0, the text with the evidence included. S9 to S11 (guards): with another code (1), with none (the runner's `null`) and with the -1 that the install hands for none, each text is told as before; a text with no verification line, and an unpinned call, are told nothing under every code. X9 to X13: the two roads answer each text with exit code 0 and with 255 (X9 with X10, and X12 with X13, hand the same stdout and stderr, so the exit code alone decides); with 0 the install goes on to the question of its probe and the socket check reads the mode (a socket wider than 600 is still told, and the bridge stays open), with 255 the road shows sentence C or D and stops. X14: a run with no exit code that holds the line is told sentence D on both roads, so a missing code is never read as 0. X15: a scan of the shipped sources finds exactly two calls of `hostKeyTold`, both in `commands/agentCommands.ts`, each with the stderr and the exit code of one and the same run, and no other reference to the import
   ```

2. **The row of `personRoadsHostKey.test.ts`** (`:2567`): only its count, from the runner (34 measured; the row says 33).
   This story changes no test of that file.

3. **One new row**, behind the row of `hostKeyTold.test.ts`:

   ```markdown
   | `fixtures/typed/host_key_told_needs_the_exit_code.ts` (compiled by `typedFixtures.test.ts`) | 1 | E3.S1 (test 30): a call of `hostKeyTold` with three arguments, without the exit code of the run, is refused with TS2554 at its line. The parameter is required: a default or a `?` on it makes the fixture compile, and the harness is red |
   ```

4. **The paragraph "What none of them proves"** gains:

   ```markdown
   No test of the suite ends a real `ssh` with exit code 0 while its text holds the verification line: X9 to X14 answer through the stand-in of the runner. That a real client's run of this kind goes on through the two roads is E3's M5 (h), with (g) of the same run as its control (the same text with exit code 255). The smoke (section 10) has no such leg: its leg 1 ends with 0 and prints no such line, its leg 2 ends with 255.
   ```

## 9. What does NOT change

- **No word of an argv.** `hostKeyWords`, `sshExecCommand.ts`, `sshBridge.ts`: no diff. C19 is a sentence (the parent's §4).
- **No sentence.** Sentences A to F and the two openings of the bridge's form keep every character. No new sentence.
- **The evidence of sentence C**, and the whole rule of E2.S3 for a run that did not end with 0: `OFFENDING_KEY_LINE`,
  `PRINTED_ESCAPES`, `unprinted`, `namesFile`, the split at CR LF and LF, the whole name.
- **Which run is asked.** The probe of the install and the mode check of the socket check, and no other: not the sweep, not the
  install run (X8 and T9e stay green).
- **`runRemote`** (`commands/agentCommands.ts:336-353`) and its -1; **`sshExecRunner.ts`**; `interpretInstall`, which already
  takes the install run's exit code (`:321`).
- **An unpinned call**, on every road and under every exit code: told nothing by this function, as before.
- **The order of a road around the call.** The install still asks `hostKeyTold` before the time limit's warning; the check still
  asks it before it reads the stdout.
- **`pinOfCall.ts`, `pinClient.ts`, `personPin.ts`, `writtenKey.ts`**, the guards, the pin file and its deletes.
- **The agent's exec and *Run with Secrets*.** They do not call `hostKeyTold`. Only the comment of §4 changes in
  `sshUseActions.ts`.
- **The scripts.** Section 10 of the smoke runs as it is; no leg of it has a run that ends with 0 and holds the line (Z7).
- **`test/personRoadsWorld.ts`, `test/pinnedArgv.ts`, `test/typedFixtures.test.ts`, `test/personRoadsHostKey.test.ts`.**
- **The released text of the CHANGELOG** (§8.1), `src_vs_code/RELEASES.md`, the version in `package.json`.
- **The help articles** (the parent's C5).

## 10. Order of work, and the commits

1. Read `git status --short`. **The tests:** the test file (§5.3) and the fixture (§5.4). Compile: exit 0. Run `hostKeyTold`:
   61 green and 33 red with the texts of §6; `typedFixtures`: 22 green and 1 red; `personRoadsHostKey`: 34 green. Save the output.
2. **The product** (§2, §3). Compile: exit 0. `hostKeyTold` 94 green, `typedFixtures` 23 green, `personRoadsHostKey` 34 green.
   `wc -l src/commands/agentCommands.ts` says 797.
3. **The mutation checks** (§7), one at a time, each restored before the next. Save what each one printed.
4. Typecheck, lint, the ratchet, the whole suite: green. Measured on the scratch copy with §2 to §5 applied (Z16 f): `npm test`
   exit 0, 8414 tests, 8370 pass, 0 fail, 44 skipped, in 4 min 17 s; `node scripts/size-ratchet.mjs` exit 0; `npx eslint src` exit
   0. The whole suite of the tree before this story was not run for this spec, so the count before is not measured: this story
   adds 45 tests (44 and the fixture).
   Commit c1: `fix(ssh): G1 E3.S1 — a run that ended with 0 is told nothing about a host key (C19)`. Its body quotes the RED
   texts of step 1 and the result of each mutation, names the changed call lines of E2.S3's tests (§5.2), says "+0 lines" with
   the count of `commands/agentCommands.ts`, and says what is not measured (§14).
5. **The documents** (§8). In `src_vs_code/CHANGELOG.md`: the heading of 1.23.0 (if the file does not hold it yet), then the new
   entry above it (§8.1). Read `git diff -- src_vs_code/CHANGELOG.md`: it shows added lines only, all of them above `:9`.
   `node .agents/conventions/tools/plan-lifecycle.mjs .` and `node .github/scripts/public-hygiene.mjs` from the repository
   root: clean. Commit c2: `docs(extension): G1 E3.S1 — the exit code is the first question of the rule of evidence (C19)`. Its
   body holds the claim table of §8.1.
6. **The comment of §4**, in a commit of its own, c3: `docs(ssh): G1 E3.S1 — the docblock of localLaunch says what a refused pin
   starts (W7)`. Compile and lint: green.

If a test of step 1 is red with another text, or a guard is red: stop and tell the lead. No commit holds a red test. The smoke
(test 32) is not a local step: it runs in CI on the head sha that the lead pushes (§11).

## 11. Done when (each item can be counted)

- [ ] `test/hostKeyTold.test.ts` has 94 tests. 33 were watched red on the product before this story with the texts of §6 and
      pass after §2 and §3. The 61 others were green at both.
- [ ] `test/fixtures/typed/host_key_told_needs_the_exit_code.ts` is there; `typedFixtures.test.js` has 23 tests; the new one was
      watched red ("the fixture compiled") before §2 and passes after. `test/typedFixtures.test.ts` has no diff.
- [ ] `hostKeyTold` has four parameters, the last one `exitCode: number | null`, with no default and no `?`. In the block of §2
      the diff of `hostKeyPin.ts` is that block and nothing else. The docblock no longer holds "whatever the run's exit code was".
- [ ] `commands/agentCommands.ts` has 797 lines; its diff is the two lines of §3.1 and nothing else.
- [ ] `hostKeyTold` is called in two places of that file and in no other file of `src_vs_code/src` outside the tests (X15).
- [ ] No test of `test/personRoadsHostKey.test.ts` changed (34 pass). `test/personRoadsWorld.ts` and `test/pinnedArgv.ts` have
      no diff in this story.
- [ ] No argv word and no sentence changed: `hostKeyWords`, `refusedHostKeySentence`, `unnamedHostKeySentence`,
      `sshExecCommand.ts`, `sshBridge.ts`, `writtenKey.ts`, `personPin.ts`, `pinOfCall.ts` and every script have no diff.
- [ ] MU1 to MU12 each turned red what §7 names, and the product was restored after each.
- [ ] The documents of §8 are changed: the CHANGELOG has the heading `## [1.23.0]` once, above the entries that 1.23.0 shipped,
      and the new entry under `## [Unreleased]`; `git diff` of it shows added lines only. `plan-lifecycle.mjs` and
      `public-hygiene.mjs` are clean.
- [ ] The docblock of `localLaunch` is the one of §4 (`sshUseActions.ts`: 600 lines).
- [ ] `npm run typecheck`, `npm run lint` (no new `eslint-disable`), `npm run ratchet` and `npm test` are green; the leftovers
      audit of `npm test` names no folder of this run.
- [ ] The smoke (section 10, both legs) passed in CI's `itest:ssh-agent` step on the head sha of this story (test 32; the
      stories document, E3.S1, *Done when*). This box is the lead's: it needs a push.

## 12. Break it — ways to make the tests pass while the defect stays, and the row that stops each one

| # | The way | What stops it |
|---|---|---|
| BR1 | The function gets the parameter and does not ask it: the calls compile, the fixture passes | S7, S8; X9, X11, X12; MU1 |
| BR2 | The exit code is asked only where sentence D would be shown; sentence C is still shown under 0 ("it cannot happen") | S7 (11 texts with the evidence under 0); X9, X11 and X12 with the text that names the pin file; MU4 |
| BR3 | The roads go on for 0 because the CALLERS skip the call (`if (outcome.exitCode !== 0)` around it), and the function is unchanged | S7, S8 ask the function alone; X15 holds the two lines; `commands/agentCommands.ts` would gain lines, and this story keeps 797 |
| BR4 | A caller hands a constant, so that its road's new test passes: 0 makes "goes on" green, 255 makes "is told" green | each road has both: X9 with X10, X11 and X12 with X13; X15; MU2a to MU2d |
| BR5 | "No exit code" is turned into 0, in `runRemote`, at the socket check's call, or inside the function (`!exitCode`, `exitCode ?? 0`, `<= 0`) | X14 on both roads; S9 (`null`, -1); MU5, MU6, MU8, MU9 |
| BR6 | The narrower rule: a sentence only for 255, every other code goes on | S9 (code 1, `null`, -1); X14; MU7 |
| BR7 | The parameter is optional or has a default, "so that the tests need no change" | the fixture (TS2554 no longer comes); MU3a, MU3b |
| BR8 | The socket check, for 0, returns silently before it reads the stdout: no error is shown, and mode 600 shows nothing anyway | X12: with `644` the warning of a wide socket must be shown |
| BR9 | The road tests answer 0 with an empty stdout, so "no error" passes although the road did not go on | X9 answers the stdout of a good probe and requires the question and the install run; X12 requires the warning |
| BR10 | A third caller is added later with a constant, or the function is handed on under another name | X15: the list of calls, and the count of references to the import; MU11, MU12 |

## 13. Opus review checklist

1. `hostKeyPin.ts`: the diff of the block is §2. `hostKeyTold` has four parameters; the last is `exitCode: number | null`, with
   no `?`, no default, no overload. Its first statement is `if (pin === undefined || exitCode === 0)`, with `===`. Nothing of the
   text is read before it.
2. `toldByText` is private, has one caller, and its body is the body of before less the pin: the verification line as a whole
   line, the evidence by `namesFile(line, file)`, then sentence D. Its two `return` lines with the sentences did not change a
   character (`git diff` shows them as context or as moved lines with the same text).
3. Ask: is there a run of these two roads that ends with 0 although the `ssh` of the call refused a host key? (Z6, Z7, Z8: the
   exit code rule is read, 255 is measured, the run is a connection of its own. A person's own wrapper around `ssh` is §14.)
4. Ask: does a host gain anything by printing the line and ending with 0? (§1: it controls the stdout that the road reads
   anyway. A machine that is not the saved one never reaches 0.)
5. `commands/agentCommands.ts`: the diff is the two lines of §3.1; 797 lines; no new `eslint-disable`. In each call the stderr
   and the exit code come from ONE value (`outcome`, `facts`). `outcome` is the run of the mode check, not of the sweep. `facts`
   is the run of the probe, not of the install run.
6. `runRemote` did not change: `run.exitCode ?? -1`, and -1 in its two other returns. No `?? 0` anywhere in the diff.
7. The docblock of `hostKeyTold`: the sentence "whatever the run's exit code was" is gone. The new paragraph says "measured" only
   for 255 and "read" for the remote command's code, and the last sentence says what was not run. *The rule* and *Measured
   2026-11-18* did not change.
8. `test/hostKeyTold.test.ts`: the diff is §5.3. S1 to S4 changed only by the argument 255; `SENTENCE_C`, `SENTENCE_D` and both
   openings are still literals. X9 with X10, and X12 with X13, answer the same stdout and stderr with 0 and with 255. X14 answers
   `exitCode: null`.
   Every text that names the pin file of a run reads the name from the argv of that run. No new test starts a process or writes
   outside `storage()`.
9. The fixture is §5.4, its call on line 7, and `test/typedFixtures.test.ts` has no diff. No `@ts-expect-error` came into
   `src_vs_code/src`.
10. X15 reads every shipped `.ts` outside `test/` (more than 100 files), lists the arguments of both calls, and compares the
    count of references to the import with the count of calls.
11. The RED texts in the body of c1 are those of §6; each mutation in the body names what turned red, and it is what §7 says.
12. `src_vs_code/CHANGELOG.md`: the diff adds lines and removes none. The heading `## [1.23.0]` stands once, above the first
    entry that 1.23.0 shipped; the new entry is under `## [Unreleased]`, above that heading; the sentence "Not yet right: …"
    still stands in the section of 1.23.0. The entry says "the manual" for the exit code rule and
    "not measured yet" for the real run.
13. `research/module_extension.md` and `research/module_tests.md` say what §8.2 and §8.3 say; the counts are the runner's.
14. The comment of §4 is a commit of its own and changes no code line of `sshUseActions.ts`.
15. Read §14 and *Questions for the lead*: is one of the open points (the form of the heading of 1.23.0; a `timedOut` run with
    exit code 0; a wrapper around `ssh`) more than a note before E3 measures?

## 14. Not verified by this spec

- **A real `ssh` whose run ended with 0 and holds the verification line, through the roads.** The runner is a stand-in in every
  test of this story. What is proven is what the function answers for an exit code and a text, and what the roads then do.
  That such a run of a real client ends with 0 is read (Z6), not run. E3's M5 (h) runs it against a real `sshd`, with (g) as its
  control.
- **The smoke** (section 10, test 32) was not run for this spec: this machine has no `sshd` on its `PATH`, and a local run
  before E3.S2 would be the scratch copy that decision 16 ends for a row. The story's run is CI's (§11). By reading, no leg of it
  has a run that ends with 0 and holds the line (Z7), and this story changes no answer for a run of the smoke.
- **`ssh.exe`.** The exit code rule was read in the manual of OpenSSH 10.2p1 on Linux. It was not read or run for
  OpenSSH_for_Windows. No login is made on Windows by any row (C6).
- **A person's own program in place of `ssh`** (a wrapper first on `PATH`) that ends with 0 whatever its `ssh` did. Then a
  refused host key is told as a host that did not answer (§1, the fail direction): nothing connects, and P3 is lost. Such a
  program is the person's; E2 asks it only for its version.
- **A run that is marked `timedOut` and carries exit code 0** (the timer and the child's end meet, Z4). The function answers
  nothing; the install then shows the sentence of the time limit, the check reads the stdout. Before this story such a run with
  the line showed sentence D. Not tested: the stand-in has no such race.
- **A remote command that ends with 255 itself and prints the line.** It is told sentence D, as before (the parent: not taken
  otherwise). The exit code cannot tell it from a refusal of a hop; sentence D names neither as the cause.
- **A stderr that was cut at the byte limit** (E2.S3, its §12), unchanged.
- **That a person reads the new entry of the CHANGELOG as intended.** Its claims were checked against the tests (§8.1).

## Questions for the lead

One question. The larger one (where C19's fix is written in a CHANGELOG whose entry has shipped) was open when this spec was
started; the lead answered it in the stories document while the spec was written (its Q2), and §8.1 builds that answer.

**Q1 · The form of the heading of 1.23.0 that this story writes into the CHANGELOG.**

- *What the lead's answer says* (the stories document, the answer to its Q2): "E3.S1's first documents commit writes
  `## [1.23.0] — 2026-11-23` above the two shipped entries".
- *What is so* (Z17, Z18; read on `8dabad08`, 2026-11-23). (1) Every version heading before it has a title behind a second
  dash: the heading of 1.22.3 (`:112`) is `## [1.22.3] — 2026-11-17 — Security — …`, and the headings at `:149`, `:164` and
  `:176` have the same form. The line of the answer has none. (2) The text that 1.23.0 shipped has three `###` headings, not two: the
  search (`:9`), G1 (`:16`) and the green search row (`:108`), which stands BELOW the G1 entry. They are two changes (#382 with
  two headings, and G1).
- *What this spec does with it* (§8.1): it writes the line exactly as the answer words it, with no title, above `:9`, so that
  all three headings stand under it. Nothing reads a title: `release.yml` looks for `## [1.23.0]` alone.
- *What the lead decides:* a title for that line, or none. If one is wanted, it is one line of commit c2, and the lead gives its
  words: the section holds a feature and a security change, and the coder does not choose how a released version is named.
- *One more fact, not a question.* `release.yml:932-944` answers "See CHANGELOG.md." when the file holds no heading of the
  version that is released. So the notes of the NEXT release are that line unless its heading is in the file before its tag.
  Whether the page of 1.23.0 shows that line was not read.
- **The lead's answer (2026-11-23):** a title, in the form of the headings before it. The line is
  `## [1.23.0] — 2026-11-23 — Security — a call without a terminal trusts only a saved host key that can be used; the search stays in reach`
  (§8.1 and its layout carry it). Read by the lead the same day: the GitHub release page of `extension-v1.23.0` shows only
  "See CHANGELOG.md.". This story does not change a published page; that is the owner's to decide. For the release after E3:
  its version heading must be in the file before its tag, or its notes are that line too (a note for E3.S10 and the release step).

## Notes for the lead

- **The links to this file.** The parent's status block and its `## Epics`, E3; the stories document's status block ("No spec
  is written yet") and its `## E3.S1`; and `todo/README.md` do not name this file. I do not edit them. Measured 2026-11-23:
  `plan-lifecycle.mjs` has one finding, "todo/README.md omits PLAN_person_roads_pin_host_key_E3_S1_spec.md".
- **The stories document came while this spec was written.** It was an untracked file when the facts of this spec were read,
  and the lead committed it with the answers to its five questions (`753b3a48`, then `e1c7d7cb`). This spec was read again
  against the committed text. Two things of it are built here and were not in the brief of this spec: the heading of 1.23.0 in
  the documents commit (§8.1), and W7's last place, the docblock of `localLaunch` (§4, a commit of its own).
- **The parent's §6 is not built as it is written for the CHANGELOG** (an edit of the entry in place). The lead's answer says
  that this is no plan change; the parent's text is not edited for it by this spec.
- **Line references of the parent that moved** (the stories document's settled item 5 has the whole list): `hostKeyTold` is
  `hostKeyPin.ts:385`, not `:380`; `runRemote`'s answers of -1 are `commands/agentCommands.ts:344`, `:350` and `:352`, and `:341`
  is the line of its return type. Repaired references, no change.
- **Two functions in place of one body** (§2). The parent says "the one pure function". The exported function stays one, with
  one answer for both roads. Lint's complexity of 4 does not hold five questions in one body (measured: 5, Z9), so the questions
  about the text are a private helper. I read this as the spec's own choice of form, not as a change. An `eslint-disable` on the
  function would be the other way; the constraints of this spec, as those of the E2 specs, forbid a new one.
- **The parameter is the last one** (§1). The parent says "takes the run's exit code as a required parameter" and names no
  place. The last place gives a RED that is a failed assertion for the right reason, and it fails closed for a caller that hands
  none at run time. If the lead wants it elsewhere, §2, §3, the fixture's text, the type `Told`, every call of the tests and X15's
  list change, and the RED of §6 becomes a `TypeError` in every test of part 1.
- **Test 29's "the stdout of a good run".** For the socket check the good run is mode 600, which shows nothing (X11). X12 adds
  mode 644, because only a wide socket makes "reads the socket's mode" visible in the world. Both rows are there.
- **Test 29's guard is made of new tests** (X10, X13), not only of E2.S3's X1 to X5: they answer the SAME stdout and stderr as
  X9 and X12 with 255, so that the exit code alone differs. E2.S3's tests answer an empty stdout.
- **X14 is this spec's own** (no test of the parent names it). It holds the constraint that a missing exit code is never read
  as 0, on both roads. It follows from §3.12, part 4, *What it does not change* ("a run with no exit code … told as parts 2 and
  3 say").
- **`research/module_tests.md` is two counts behind the runner today** (Z15: 49 and 33 written, 50 and 34 run). §8.3 takes the
  runner's numbers. I did not look for the test that was added without its count.
- **The parent's *Done when* of E3.S1 names M5** ("M5 keeps its leg with exit code 255 (g) and has its leg with 0 (h)"). Both
  legs are in the parent's row M5 as revised for epoch 3. This story builds no leg: E3.S8 does.
- **For E3.S8 (M5, h).** The function answers nothing for 0 before it reads the text. So the leg's own words matter: "the stderr
  of each holds the verification line (without that the leg could not have failed, and it is not passed)". X9 to X13 are the
  suite's form of that control.
- **For the next release.** This story makes `src_vs_code/src` differ from the tree of 1.23.0. By §9, step 11, the tree that E3
  measures is the tree that is released; the claim table of §8.1 names the rows.
