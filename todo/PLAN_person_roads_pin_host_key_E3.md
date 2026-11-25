# PLAN — G1, epic E3: the stories (the release gate: every claim is measured on the roads, against a real `sshd`)

> Status: **Stories document written 2026-11-23, the baseline of epic E3. E3.S1-E3.S3 are built and reviewed (`a445af56`..`a07e4cac`); E3.S4 (`07a22de1`..`1ad5736b`, review fixes `b061a030`..`1a015583`) , E3.S5 (`edda3461`..`c9d0279e`) and E3.S6 (`3c2ebef2`..`62251613`) are built and reviewed; CI green on `62251613`. E3.S7 is built and reviewed (CI green on `97752998`); E3.S8 is built (`ab375f29`, `3d3eab44`), not reviewed; the E3.S9 spec is written, not built. The plan is stopped for re-review since 2026-11-25 (change 3.2 in the parent: M11 (b) cannot run as written, because an `ssh` older than 8.7 keeps the apostrophes of a bare word). The parent is revised for epoch 4 (2026-11-25), and with it this document's E3.S9 and E3.S10 (*Settled by the re-review for epoch 4*, below). The re-review is narrowed: the judge, the coai round on the revised plan and the owner's approval come before any new code, and no story is built or reviewed until the parent has its line of epoch 4.** The stories document of epic E3 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its `## Epics`, E3; epoch 3, approved by the owner on 2026-11-23, with entry 3.1). It is
> the epic's baseline, written when E3 starts, not a change of the parent (`plan-change-control.md`, *What counts as a change*). It
> keeps no change ledger: a change of it is an entry in the parent's. Ten stories, no cornerstone (the quota of two is spent: E1.S2, E2.S2). Built on
> `fix/g1-e3-release-gate`, which stands on E2's head and has taken `main` by a merge (`8dabad08`). Each spec is written when its story starts,
> `todo/PLAN_person_roads_pin_host_key_E3_S<n>_spec.md`: E3.S1, [PLAN_person_roads_pin_host_key_E3_S1_spec.md](PLAN_person_roads_pin_host_key_E3_S1_spec.md) (2026-11-23); E3.S2, [PLAN_person_roads_pin_host_key_E3_S2_spec.md](PLAN_person_roads_pin_host_key_E3_S2_spec.md) (2026-11-23); E3.S3, [PLAN_person_roads_pin_host_key_E3_S3_spec.md](PLAN_person_roads_pin_host_key_E3_S3_spec.md) (2026-11-23); E3.S4, [PLAN_person_roads_pin_host_key_E3_S4_spec.md](PLAN_person_roads_pin_host_key_E3_S4_spec.md) (2026-11-24); E3.S5, [PLAN_person_roads_pin_host_key_E3_S5_spec.md](PLAN_person_roads_pin_host_key_E3_S5_spec.md) (2026-11-24); E3.S6, [PLAN_person_roads_pin_host_key_E3_S6_spec.md](PLAN_person_roads_pin_host_key_E3_S6_spec.md) (2026-11-24); E3.S7, [PLAN_person_roads_pin_host_key_E3_S7_spec.md](PLAN_person_roads_pin_host_key_E3_S7_spec.md) (2026-11-24); E3.S8, [PLAN_person_roads_pin_host_key_E3_S8_spec.md](PLAN_person_roads_pin_host_key_E3_S8_spec.md) (2026-11-24); E3.S9, [PLAN_person_roads_pin_host_key_E3_S9_spec.md](PLAN_person_roads_pin_host_key_E3_S9_spec.md) (2026-11-25).

The goal, scope, dependencies and done-when of the epic are in the parent's `## Epics`, E3, with its setup and the rows M1-M14. The sections
named below (§3.12 and so on), the decisions (14-18) and the tests (28-33) are the parent's. This document does not write a pass criterion again:
a story names its rows, and the last column of each row in the parent is the pass criterion. It does not change a pass criterion, a planned step,
the scope or the order of the parent. Where it found a place that it cannot write as the parent says, the place is in *Questions for the lead* at
the end.

**Which tree the line references mean.** Every line reference of this document was read on `8dabad08`, on 2026-11-23. The tree of `src_vs_code`
there is the tree of the release 1.23.0 (`95e11116`; settled item 3). The parent read E2's head, `22caab8b`; where it names another line for the
same thing, settled item 5 says so.

## Settled since the parent's commit

1. **E2 is merged.** PR #388 is on `main` as the squash `4799f9d7` (read: `git log`, 2026-11-23). The parent's status line, §1.2, E2's *State*
   and §9, step 8 still say "in PR #388" or "not merged". They describe the tree before that merge.
2. **G1 is released before E3, by entry 3.1.** `95e11116` is `chore(main): release extension 1.23.0 (#383)`. The tag `extension-v1.23.0` points
   at it (`git tag --points-at 95e11116`). `src_vs_code/RELEASES.md` lists #379 (E1) and #388 (E2) under 1.23.0, and `src_vs_code/package.json`
   says `1.23.0`. So decision 12 and §9, step 11 did not hold for this one release (entry 3.1). E3 stays the gate of G1's NEXT release and of
   every claim that a row is measured.
   - **The CHANGELOG has no heading for 1.23.0.** The G1 entry stands under `## [Unreleased]` (`src_vs_code/CHANGELOG.md:7`; the entry is
     `:16-106`). In this repository the version heading came with the promotion pull request (`git log -S`: #375 wrote the heading of 1.22.2,
     #378 that of 1.22.3). Three sentences of that entry are E3's to change: "a remote command that prints that line" among the cases of the
     second message (`:46`), "Not yet right: a remote command that prints `Host key verification failed` and still ends with exit code 0 …"
     (`:104-105`, C19), and "Not measured before this release: …" (`:105-106`). Where E3 writes these changes is question Q2.
3. **E3's branch has taken `main` once.** `8dabad08` is a merge with the parents `077672ce` (E3's branch) and `95e11116` (`main`). So the step of
   §9, step 9, "E3's branch takes `main` by a merge", is done once. It must be done again, by a merge and never by a rebase, if `main` moves
   before the whole set runs (E3.S10).
   - The tree of `src_vs_code` is the same at `8dabad08` and at `95e11116` (`git rev-parse <commit>:src_vs_code`: `20857985` at both). E3's
     branch holds no change of the product or of the harness against the release yet.
   - The files that tooling parses, read again after the merge (`git-workflow.md`, rule 11): `src_vs_code/CHANGELOG.md` holds the G1 entry once;
     the exports of `scripts/itestSshd.cjs` (`:238`) are the list that section 10 and the other sections import; `todo/README.md` has the rows
     of the parent, of E1 and of E2 and their specs (`:37-47`), with status texts from before E2's merge, and no row for this document yet.
   - The merge is local. The remote branch read `077672ce` (`origin/fix/g1-e3-release-gate`, read without a fetch, 2026-11-23).
4. **E2 as merged is more than E2 at `22caab8b`.** E2's pull request took review fixes after the head that the parent read (CodeRabbit on #388;
   read in the squash message of `4799f9d7` and in `git diff 22caab8b 8dabad08`). Four of them touch what E3 measures or uses:
   - `checkedPin` writes a path with an EQUALS SIGN in double quotes too (`hostKeyPin.ts:226`, `/[\s'=]/`; its docblock `:209`, `:216-219`). The
     docblock says: OpenSSH 8.4 splits an unquoted known-hosts value at `=` (read in its source, not run); OpenSSH 10.2p1 resolves the bare and
     the quoted word to the same path (measured with `ssh -G`). The CHANGELOG says it (`CHANGELOG.md:78-79`). The parent's §3.11 and M7 do not
     name this kind. See Q1.
   - `pinClientAsker` keeps its answers in a map that it replaces and does not change in place (`pinClient.ts:87`, `:93`). What it keeps, and
     when it asks again, is as §3.10 says (*The order as E2 built it*).
   - `itestCallers.test.ts` requires `await` before `checkedPinOf(` (`:32`).
   - The tests of `pinWords.test.ts` (G1-G3) and `hostKeyWords.test.ts` that give `KnownHostsCommand` to the real `ssh -G` skip on a local
     `ssh` older than 8.5 (`sshKnowsKnownHostsCommand`, `test/pinnedArgv.ts:20`). They are unit tests. No row of E3 depends on them.
5. **Line references that moved, and those that did not** (the parent read `22caab8b`; this list was read on `8dabad08`).
   - Moved by the five lines of item 4's docblock, in `hostKeyPin.ts`: `hostKeyTold` `:380` → **`:385`**; `refusedHostKeySentence` `:403` →
     **`:408`**; `unnamedHostKeySentence` `:419` → **`:424`**; `pinPathSentence` `:280` → **`:285`**; `pinClientSentence` `:288` → **`:293`**.
     The docblock sentence of `hostKeyTold` that C19 makes untrue ("A remote command that wrote the verification line reads as sentence D
     whatever the run's exit code was") is at `:379-380`.
   - Not moved: `commands/agentCommands.ts` has **797** lines (§3.6); the two callers of `hostKeyTold` are `:216` (the socket check, with the
     runner's `outcome` of `:211-215`) and `:283` (the install's probe, with `facts` of `:282`); their branches are `:216-222` and `:283-286`;
     `runRemote` is `:336` and answers `-1` where it has no exit code (`:344`, `:350`, `:352`; the parent's `:341` is the line of its return
     type); `installCommand()` is called at `:318`; the guards are `:194`, `:273` and `:429`; the socket check starts at `:468`.
     `PIN_PATH_KINDS` is `hostKeyPin.ts:143`, `REFUSED_PIN_PATHS` `:157-166`; `decidePinOfCall` is `pinOfCall.ts:51-62`; the asker is
     `pinClient.ts:84-96`; `CLIENT_CHECK_TIMEOUT_MS` is `bridgedSshClient.ts:81`; `exitCode: number | null` is `sshExecRunner.ts:58`, and the
     runner's `KILL_GRACE_MS` (2 s, SIGTERM then SIGKILL) is `sshExecRunner.ts:23`; `knownHostsPath` is `hostKeyTrust.ts:66-68`.
   - Not moved, in the scripts: `SSHD` is `scripts/itestSshd.cjs:13`; `startSshd` is `:94`, its config `:102-117`, its `sshd -d` `:118`;
     `servingConfig` is `scripts/itestPinnedRoads.cjs:68-84`, `startServingSshd` `:103`, `endServer` `:198`, the shim `:257-291`, the note that
     `world()` evicts the modules of `out/` `:47`. `AUTH_ATTEMPT` is `:34`.
6. **What is left of W7.** Entry 3.1 moved the correction of "no `ssh` starts" into E2's pull request (the judge's row 19). Read on
   `8dabad08`: the CHANGELOG says "No connection starts (at most the local `ssh -V` that reads the version runs first)" (`CHANGELOG.md:87`)
   and "No connection starts then" for the two refusals of the agent's exec and *Run with Secrets* (`:94`); a search of
   `research/module_extension.md` and `research/module_tests.md` finds no "no `ssh` starts". One place is left: the docblock of `localLaunch`,
   `sshUseActions.ts:316` ("sentence E or F: nothing is written and no `ssh` starts"; for sentence F the question did start). It is a comment of
   `src_vs_code/src`, so it changes the tree that §9, step 11 compares. E3.S1 corrects it (below), before any row is measured.
7. **The tools of this machine** (read 2026-11-23). `ssh -V`: `OpenSSH_10.2p1 Ubuntu-2ubuntu3.8`. `which sshd` finds nothing, so a local run
   needs an unpacked `sshd` (E1's stories document, item 1). CI installs `/usr/sbin/sshd` for the step `npm run itest:ssh-agent`
   (`.github/workflows/ci-extension.yml:162-168`). `ci · extension` runs on a pull request to `main`, on a push to `main` and on a dispatch
   (`ci-extension.yml:8-16`): a head of E3's branch gets a CI run through a dispatch on the branch or through a pull request.
8. **Who starts an `sshd` through `scripts/itestSshd.cjs`** (E3.S2, its item 5 and test 33; a search of `scripts/` for `SSHD`, `startSshd`,
   `startServingSshd` and `sshd_config`):
   - `SSHD` is imported by `ssh-agent-itest.cjs` (sections 5 and 7: `:51`, `:500`, `:635`), `itestForwardAgent.cjs` (section 8: `:23`,
     `:200`), `itestNoSharing.cjs` (section 9, G2: `:34`, `:413`), `itestPinnedRoads.cjs` (section 10: `:26`, `:90`, `:663`) and
     `bridged-ssh-itest.cjs` (`:19`, `:381`).
   - `startSshd` (`sshd -d`) is called by sections 5 and 7, section 8 (`:88`), section 9 (`:110`) and the bridge plan's rig
     (`itestBridgedRig.cjs:97`, used by `bridged-ssh-itest.cjs` and its leg files). `itestBridgedTrust.cjs`, `bridged-mysql-itest.cjs` and
     `lib/psqlRig.cjs` import only `launch` and `endChild`.
   - Only `itestSshd.cjs` and `itestPinnedRoads.cjs` write an `sshd` config. No script of another plan writes one of its own today.
   - These run in CI as `itest:ssh-agent`, `itest:bridged-ssh`, `itest:bridged-mysql` and `itest:bridged-psql` (`ci-extension.yml:168`, `:174`,
     `:194`, `:208`, `:279`).
9. **Where the runs of E3 keep what they make** (the parent's §3.7: this document names the folder and the container, so that the janitor's
   token covers them). Every file, process, socket, config and unpacked program of a row or a probe lives in an owned folder that the
   repository's helper makes: `ownedDir` of `scripts/lib/leftovers.cjs` (the token `creds`, `:20`), under the short socket root `/tmp`
   (`shortSocketRoot`, `:45`), as section 10's `pin` folder (`itestPinnedRoads.cjs:673`) and section 9's `nsh` folder
   (`itestNoSharing.cjs:424`). A container, if E3.S3 chooses one, is started with `--rm`, the owned name prefix and the owner label of
   `test-leftovers.md` § 5, which the janitor sweeps (`janitor.sh`). A container runtime that the janitor does not read would leave a
   container that nobody sweeps: E3.S3 says so if it chooses one, and it is then a question for the lead.

## Settled by the re-review for epoch 4 (2026-11-25)

The parent stopped on its second change of epoch 3 (entry 3.2) and was revised as a whole (its `### Re-review for epoch 4`, §1.3 and
decisions 19-22). This document follows the revised parent. It keeps its ten stories and their order. What the re-review changes is the
baseline of the parent's next epoch, not a change of this document that anybody counts.

1. **Two parsers, and a fixed expectation for each** (the parent's decision 19; §3.11, *Two parsers*). An OpenSSH client before 8.7 keeps the
   apostrophes of a word that is not in double quotes; a client from 8.7 on takes them out. Measured with `ssh -G` on 8.4p1 and on 10.2p1
   (`research/module_tests.md`, *The apostrophes of a bare word on an older client*). The boundary of `KnownHostsCommand` stays 8.5. A
   control about a bare word says what must come out for the parser of the client that it runs, and the run takes that expectation by the
   client's version, never by the outcome.
2. **M11 (b) is revised in the parent.** It keeps the runs of M1, of M2 (b) the mismatch and of M7 (a)-(e) with both legs of M2 (b) for each
   shape. In place of M7's collision it has *the twin of (c), on the older client*: both bare-word outcomes of M7's collision the other way
   round. E3.S9 below says what that means for the story. This also answers Q2 of the E3.S9 spec ("the switch legs too?"): yes.
3. **Test 34 is new in the parent's §5, and E3.S9 builds it.** It gives the control of test 21 (the unit test G5,
   `test/pinWords.test.ts:324`) a fixed expectation per parser. Why E3.S9: it is the story that brings up the older client, so it can watch
   G5 fail on that client first and then pass on both. It is test code; no product file changes.
4. **M7 is built as the parent now says it.** The parent's row names the collision as the expectation of a client from 8.7 on, and names
   the witness of the K1 leg, which E3.S7 built (its check M7.x2). No leg of E3.S7 changes by it: the row has the expectation of the newer
   parser alone, its collision fails on an older client, and the record of identities names the client's version (the legs hold no check of
   the version of their own; read at `17694426`). E3.S10's judge reads that version beside the collision's result.
5. **M2 (a), M5 (e) and M6 are said in the parent as they were built** (the owner's readings of 2026-11-24 for M2 (a) and M6.11; the
   measurement of E3.S8 for `loglevel SILENT`). No leg changes. E3.S10 writes the limit of M2 (a) into §10 in words (the parent's
   decision 22).
6. **The answers of epoch 3 are records** (the parent's `## Epics`, E3, *How the rows are read*): the lead's answers in the specs of E3.S4
   to E3.S8, and Q1-Q5 below. None is a plan change.
7. **1.23.0 is the one release that did not wait for E3** (the parent's decision 21). *The epic's end* below already says how the next
   release runs the whole set again; nothing of it changes.
8. **The spec of E3.S9 (2026-11-24) is written against the row of epoch 3.** It is not built and its questions Q1-Q7 are not answered. It
   is written again, by Opus, against the revised M11 (b) and with test 34, after the parent has its line of epoch 4 and before any code of
   the story. Its questions Q3-Q7 go to the lead with the new spec.

## The cornerstone

**Cornerstones: 2 of 2** (three epics: Q = ⌈2·3/5⌉ = 2), E1.S2 and E2.S2. E3 marks none, and the ledger line of the parent's `## Epics`
does not change. E3.S1's spec is a security judgement outside the quota: Fable writes it (`subagent-models.md`, the row *Security judgement*;
the parent's E3, *Cornerstone areas*). The instrument and the rows are Opus's to specify.

## E3.S1 · C19: a run that ended with 0 is told nothing about a host key (§3.12 part 4; decision 14; tests 28-32)

- **Model.** A security judgement outside the quota (it changes the rule of evidence of §3.12): Fable writes the spec, Sonnet codes, tests RED
  first, Opus reviews.
- **Why first.** The parent fixes the order (§9, step 9). It is the one behaviour that E3 builds, and what E3 measures must be the final
  behaviour. M5 (h) measures it on the roads.
- **Scope.**
  - **`hostKeyTold`** (`hostKeyPin.ts:385`) takes the run's exit code, as the runner answers it (`number | null`, `sshExecRunner.ts:58`), as a
    REQUIRED parameter. The order of its questions is §3.12 part 4's: no pin of the call, nothing; exit code 0, nothing; no verification line,
    nothing; the evidence of part 2, sentence C; else sentence D.
  - **The two callers** hand over the exit code of their own run, on the lines that exist: the socket check at `agentCommands.ts:216` hands
    `outcome.exitCode` (the runner's own); the install's probe at `:283` hands `facts.exitCode` (`runRemote`, `-1` where the runner has none:
    `:344`, `:350`, `:352`). No branch and no line is added: the file stays at 797 lines (§3.6). The spec states the count.
  - **Test 30's "does not compile".** The spec names how the suite holds it. A precedent of this repository: `test/typedFixtures.test.ts`
    with its compile-fail fixtures in `test/fixtures/typed/`. The scan of the callers finds exactly the two of `commands/agentCommands.ts` in
    `src_vs_code/src` outside the tests, and it finds both, so it cannot pass by matching nothing.
  - **How the RED is watched** is the spec's (test 28: the new argument does not compile against the old function).
  - **What does not change** (§3.8, *In epoch 3*): no word of an argv, no sentence's words, `pinOfCall.ts`, `pinClient.ts`, every unpinned
    call. The agent's exec and *Run with Secrets* do not call `hostKeyTold`.
  - **Tests**, the parent's §5: 28-32. Test 31's mutation checks are recorded in the commit body.
  - **Docs** (§6, *E3.S1 (C19) updates*):
    - the docblock of `hostKeyTold` (`hostKeyPin.ts:379-380`): the sentence about a remote command "whatever the run's exit code was" is
      rewritten;
    - `research/module_extension.md`, **B10** (`:5343`): the exit code is the first question of the rule of evidence;
    - `research/module_tests.md`, the G1 section (`:2543`): the new cases and their counts, read from the runner;
    - the CHANGELOG sentences of settled item 2 that C19 makes untrue (`:46` and `:104-105`), at the place that the answer to Q2 names;
    - **W7's last place** (settled item 6): the docblock of `localLaunch` (`sshUseActions.ts:316`) says what M4 and M11 (c) count: no
      connection starts and nothing is sent; for sentence F the question `ssh -V` ran. This is the judge's correction "with W7, before the whole
      set runs" (the parent's re-review for epoch 3, the row of E2.S2). It is a comment and changes no behaviour.
- **Depends on.** Epoch 3 open; E2 merged (settled item 1).
- **Done when.** The parent's line of E3.S1 (`## Epics`, E3) and the group *E3.S1* of §8, by reference. Test 32's smoke (section 10, both legs)
  passes in CI's `itest:ssh-agent` step on the story's head sha (settled item 7). A local run before E3.S2 would need the scratch copy of E1's
  item 1; decision 16 bars that copy for a row, and the smoke is no row. If the smoke is also run so, the record says that it was a copy.

## E3.S2 · The launch instrument, committed before anything is measured (W4; decision 16; test 33)

- **Model.** Opus writes the spec, Sonnet codes, Opus reviews.
- **Why second.** The parent fixes the order. No row and no probe runs from a copy with edits (decision 16), so E3.S3 and every row need it.
- **Scope.** The parent's five items of E3.S2 (`## Epics`, E3), in short:
  1. The `sshd` executable and the extra lines of the server's config are parameters of the run (an unpacked `sshd` needs `SshdSessionPath`
     and `SshdAuthPath`, and a wrapper that sets its library path). The spec chooses how they are handed (names of variables, or a file of the
     run); no tracked file is edited to hand them. With no parameter: `/usr/sbin/sshd` and no extra line, as today (`itestSshd.cjs:13`); under
     `CI=true` a missing `sshd` still fails.
  2. The serving launcher (`startServingSshd`, `itestPinnedRoads.cjs:103`; `sshd -D -e`, every connection) is the one that every row uses.
     `sshd -d` starts no counterpart of a row. The spec says where the serving launcher lives, so that the extra lines reach it and
     `startSshd` (`itestSshd.cjs:94`) from the same place (test 33).
  3. A stop of the listener ALONE, by its own pid, which leaves alive what the listener forked for a session. `endServer`
     (`itestPinnedRoads.cjs:198`) stays the end of a leg.
  4. The record of identities (the setup, *The identities*): the path, the version and the SHA-256 of every executable that ran, and the
     SHA-256 of every config text handed out. The same record holds `git rev-parse HEAD` and the answer of
     `git status --porcelain --untracked-files=no` (the setup, *The launch instrument*), because this story's own run must show a tree with no
     modified tracked file.
  5. The sections that start their `sshd` through `itestSshd.cjs` keep what they call (settled item 8). The story shows it where they run: CI's
     four steps of settled item 8.
- **Tests**, the parent's §5: 33, RED first. The RED is watched on this tree: the path is a constant (`itestSshd.cjs:13`), and neither config
  reads a parameter (`itestSshd.cjs:102-117`, `itestPinnedRoads.cjs:68-84`).
- **Docs** (§6, *E3.S2 (the instrument) updates*): `research/module_tests.md`, where the counterpart comes from and the exact command, with
  the parameters in place of the recipe of a scratch copy; the comments of the two launchers.
- **Depends on.** E3.S1 (the order of §9, step 9).
- **Done when.** The parent's line of E3.S2 and the group *E3.S2* of §8, by reference: test 33 passes; section 10 passes locally on an unpacked
  `sshd` from a tree with no modified tracked file, with its record of identities in the commit body and in `research/module_tests.md`; the
  story shows a master connection that outlives its listener and carries one more command (the instrument of M3); the other sections pass as
  before in CI. Both script files stay at most 800 lines.

## E3.S3 · The feasibility of the instruments that are not known to work (decision 18; the parent's *The feasibility comes first*)

- **Model.** Opus writes the brief: what each probe must show, and the line that says it worked. Sonnet builds and runs the probes. An Opus
  judge reads each result. A probe that failed goes to the lead.
- **Why third.** The parent fixes the order: after C19 and the committed instrument, before any row is built.
- **Scope.** Each probe runs through the committed instrument of E3.S2 and records the identities of what it ran, as a row does. The probes
  are the parent's list:
  1. **The install's stand-in** (the setup, *The install's stand-in*; rows M1, M2 *the switch*, M3 *the switch*, M6, M7, M9 and M11 (b), each of
     which runs an install to its end or to its install run). The probe shows the four conditions, each by its own evidence: the install run
     passes the real authentication and a command of it runs to its end; what runs writes only inside the owned folder; the published installer
     is not fetched; the places that the real installer writes (`/usr/local/bin/creds`, `/tmp/creds-install.*`) are the same before and after,
     by size, time and hash, and the recorded starts show that the real download program did not start. The first candidate is the parent's
     (`PATH` of the counterpart's login, with stand-ins for the download program and for `sh`). The lines that give the login that `PATH` go
     through the serving launcher's extra config lines of E3.S2 (see Q4). The parent lets this document choose another instrument that keeps the
     four conditions; none is chosen before the probe.
  2. **A resolver that the run owns, whose answer the client takes as secure** (M10). This document chooses the parent's first way: a container
     that the run starts, with the counterpart, the client, the resolver and the harness of the roads inside it, so that the roads are driven
     where the run owns the resolver. The second way, an unpacked package, is probed only if the container cannot be had, and only with
     evidence that the client of the run asks that resolver.
  3. **A client older than 8.5 that runs here** (M11). This document chooses the parent's second way first: an unpacked package, unpacked by
     the user into the owned folder (as E1's `sshd`), with a wrapper that sets its library path, placed on `PATH` where the shim finds it as the
     real client (`realSsh`, `itestPinnedRoads.cjs:257`). A container is the second way. The result names the client's version. With it,
     one more check (the lead's answer to Q1): `ssh -G -F /dev/null` with both known-hosts options set to a quoted path that holds `=`
     prints that path, whole, as the sole value of each option.
  4. **A handed config that the nested client of a jump host reads too** (M5 f).
  5. **The Windows client from this machine** (M13): `ssh.exe -G` of the owner's Windows, started with the argv as separate arguments, as K7 of
     the spec of E1.S1 did.
  6. **A forced command that writes the verification line and then runs the command that it was asked for, to exit code 0** (M5 h).
  7. **A program that never answers `-V` and that the runner's limit ends** (M11 d). It records its start with `-V`, answers nothing and does
     not end by itself.
  The stop of the listener alone, with a master that stays, is E3.S2's, not a probe here.
- **The margin of M11 (d), fixed here before any run** (the parent's M11 (d): "a margin that the stories document fixes before the run"):
  **5 s**. Each of the two times per road lies between 10 s (`CLIENT_CHECK_TIMEOUT_MS`) and 15 s. Why 5 s: the runner sends SIGTERM at its
  limit and SIGKILL 2 s later (`KILL_GRACE_MS`, `sshExecRunner.ts:23`), and the run answers on the child's `close`; the other 3 s are for the
  start of the command, the sentence and the reading of the process table, at the lowered priority of the scripts. The margin does not change
  after a run: a change of it after a run is a change of a pass criterion.
- **A probe that fails** is not a skipped row. It is a recorded plan change, an entry in the parent's ledger. When it makes the release gate
  smaller, it goes to the owner, the question consultants first (decision 18). Four probes are not proven and the parent says so: the install's
  stand-in, the resolver, the older client, Windows.
- **Docs.** `research/module_tests.md`: each instrument that worked, where it lives, the exact command, and its identities. The probes'
  records go in the commit body.
- **Depends on.** E3.S2.
- **Done when.** Each of the seven probes has a result that an Opus judge read: worked, with its evidence and identities; or failed, with the
  plan change recorded and sent as decision 18 says. No row is built before this story is done.

## The rows: built story by story, measured once

The parent leaves the split of M1-M14 to this document (§9, step 9). Six row-stories hold the fourteen rows, and E3.S10 runs them all once.

| Story | Rows | What they are about |
|---|---|---|
| E3.S4 | M1, M6 | a pinned call that works, on all three roads; calls that own their files |
| E3.S5 | M4, M9 | a saved key that cannot be used, and a pin write that fails, in both states of the asker; the repair of sentence A |
| E3.S6 | M2, M3, M8 | another key is refused, whatever else would trust it: another known-hosts file, a live master, a `KnownHostsCommand` |
| E3.S7 | M7, M12, M14 | the pin file's path: the paths that need double quotes, the refused kinds, and the agent's exec |
| E3.S8 | M5 | what the person is told, as the call saw it |
| E3.S9 | M10, M11, M13; test 34 | the rows off the rig: DNS, an older client and a client that never answers, Windows; and, since the re-review for epoch 4, the control of test 21 per parser |

**Building a row is not measuring it.** A row-story builds the legs of its rows, their controls and their evidence, and it PROVES them: it runs
them on its own head and shows that they can pass and that each control shows what it is there for. Such a run is a proving run. Its numbers
go into the commit body and into `research/module_tests.md` as "seen when it was built", never into §10, and it passes no row. The one run
whose results go into §10 is E3.S10's: the whole set, once, on the final tree, after the last merge of `main` (§9, step 9; the parent's E3,
*Done when*). A change after that run that can affect the shipped extension or the measurements (`src_vs_code/src`, the dependencies, the
build, the packaging, the harness) means the whole set again.

**Where the legs live.** The rows of the rig (M1-M9, M12, M14) extend section 10 (`scripts/itestPinnedRoads.cjs`, called by
`scripts/ssh-agent-itest.cjs`). Each row-story puts its legs in a file of its own beside it, called from section 10, so that one run of the
script (`npm run itest:ssh-agent`) runs every row of the rig (the parent's E3, *Done when*: "the rows of the rig in one run of the script").
Every file stays at most 800 lines. CI's `itest:ssh-agent` step then runs them with `/usr/sbin/sshd`. M10, M11 and M13 run where E3.S3 found
their instruments, on the same commit as the rig.

**What every row-story uses** (the parent's setup, built once in E3.S4 and reused): the counterpart started by the committed launcher of
E3.S2; the five runs and *the switch*; the install's stand-in as E3.S3 proved it; the control client with "E1's words" (the three pairs of §3.9
as `f3e9887d` writes them); the evidence (the counterpart's log, the shim's record of every start with its argv and pid, the messages shown
word for word and in order, the stderr of each run, the files in `keys/<pid>/`); the handed client config, never the person's `~/.ssh`
(section 10 already checks that `~/.ssh/known_hosts` is unchanged, `itestPinnedRoads.cjs:674`, `:678`); the four counts of decision 15; the
state of the asker, cold or warm, made by the leg itself; the record of identities of E3.S2.

**The done-when that every row-story shares,** beside the one that it names:

- every leg of its rows is built, runs through the committed instrument, and runs from a tree with no modified tracked file;
- a proving run passed every leg on the story's head: locally, and for the rig's rows in CI's `itest:ssh-agent` step on a head sha
  (settled item 7);
- every control of its rows showed what its row says, in that proving run. A control that does not show it fails its row (the setup);
- where a leg has no control of its own, the story showed once, by hand, that the leg can fail (the product made to do the wrong thing that
  the leg is about, as E1.S4's control did). The commit body records it as a hand check, not a result;
- typecheck, lint (`max-lines`), the whole suite, `test/itestCallers.test.ts`, `test/harnessSites.test.ts` and the leftovers guard
  (`leftovers-check.mjs --profile node --token creds`) are green; the run left nothing outside its owned folder (settled item 9).

**What a proving run that fails asks for.** The harness is wrong: the story repairs it. The product does not do what the plan says: a repair
inside E3, only when it makes the code do what the plan already says (§9, step 9), with a test watched RED first and its own spec by Opus.
A row that cannot run as written, or an instrument that does not work: a plan change, recorded in the parent's ledger, and the owner when it
makes the gate smaller (decision 18). A story never makes a row weaker.

**Models of the row-stories.** Opus writes each spec (the parent's E3: "the instrument and the rows are Opus's to specify"), Sonnet codes the
legs, Opus reviews.

## E3.S4 · The common rig; a pinned call that works, and calls that own their files (M1, M6)

- **Why here.** M1 is the base that other rows reuse ("the runs of M1": M7, M9, M11 b). The common parts of the rig are built with it.
- **Rows.** M1, M6.
- **Instruments.** The committed launcher (E3.S2); the install's stand-in (E3.S3, probe 1).
- **Scope.**
  - The common parts listed above (*What every row-story uses*), each once, in a file that every later row-story calls.
  - **The four counts** per leg (decision 15): the starts of the client, with the question `ssh -V` among them; the connection starts (a start
    whose argv names a destination); the authentication attempts and the accepted logins, from the counterpart's log (`AUTH_ATTEMPT`,
    `itestPinnedRoads.cjs:34`), with the command that ran and the exit code. A road that another road's refusal keeps from starting has no start
    of any kind in that leg, and the record shows it.
  - **M1**, cold, with the time of the one question `ssh -V` recorded (C20: the wait of a normal run).
  - **M6**: two installs that overlap, a bridge with its check, a bridge replaced by a second; each with a stored key, a key that the person named
    by its path, and a password. For the password entry the result says whether the counterpart logged an accepted login or `Failed password`.
- **Depends on.** E3.S3.
- **Done when.** The shared done-when above. The pass criteria are M1's and M6's last columns.

## E3.S5 · A saved key that cannot be used, and a pin write that fails, in both states of the asker (M4, M9)

- **Why here.** Both rows count in both states of the asker (decision 15), and M9 ends with the runs of M1 (E3.S4).
- **Rows.** M4, M9.
- **Instruments.** The committed launcher; the cold and the warm world of the setup (*The state of the asker*); for M9, Connect's options
  (`connectionOptions`) with the real scan of the counterpart and *Trust and connect* answered. No unproven instrument.
- **Scope.**
  - **M4**: (a) the three absent forms; (b), (c), (d) each twice per road, cold and warm, each in a world of its own. The spec says how the pin
    write of (d) fails with the REAL writer. The two roads that can be driven are *Install creds on host* and *Open Remote Bridge…*; the socket
    check has no start of any kind, as M4 says. Recorded for C9: whether the bridge's command minted a token before it refused; and for C14,
    any pin file that a failed write left.
  - **M9**: the key entry, cold and warm; then Connect's repair; then the runs of M1. The password entry beside it, cold and warm. Recorded for
    C1: whether Connect's options for it name no pin file.
- **Depends on.** E3.S4.
- **Done when.** The shared done-when above. The pass criteria are M4's and M9's last columns.

## E3.S6 · Another key is refused, whatever else would trust it (M2, M3, M8)

- **Why here.** These rows use *the switch* (M2, M3) and the control client, which E3.S4 built, and the stop of the listener alone, which
  E3.S2 proved.
- **Rows.** M2, M3, M8.
- **Instruments.** The committed launcher, with a second counterpart (K2) at the same address; the stop of the listener alone (E3.S2, item 3);
  the install's stand-in (E3.S3, probe 1) for the two switch legs; a master connection of the handed config; a recording `KnownHostsCommand`
  in the owned folder (M8).
- **Scope.**
  - **M2**: the two legs (*the mismatch*, *the switch*), each for (a) the client's default user file and (b) an owned file that the handed config
    names as the system-wide one; the result says which file each is. The control in (b).
  - **M3**: the two legs. The control AFTER the switch must end with 0 through the master that survived, or the row is not passed.
  - **M8**: the control first, then the roads.
- **Depends on.** E3.S4.
- **Done when.** The shared done-when above. The pass criteria are M2's, M3's and M8's last columns.

## E3.S7 · The pin file's path, and the agent's exec (M7, M12, M14)

- **Why here.** M7 runs the runs of M1 and of M2 (b), both legs (E3.S4, E3.S6). M14 uses the handed configs of M2 (b) and M8 (E3.S6) and the
  storage folder of M12 (a), so it comes after M12.
- **Rows.** M7, M12, M14.
- **Instruments.** The committed launcher; storage folders inside the owned folder whose paths hold the characters that the rows name; the
  install's stand-in (E3.S3, probe 1); for M14, the agent's `ssh:exec` through its own call, off a bridge, as section 9 drives an exec
  (`itestNoSharing.cjs`).
- **Scope.**
  - **M7** (a)-(e), with *the collision* for (c) and its control. Before (e) drives a road, the run asks the product's rule for the complete
    pathname of its folder; a refusal makes the leg not passed (it has become a case of M12).
  - **M12**: coverage first (the kinds read from `PIN_PATH_KINDS`, `hostKeyPin.ts:143`; each of (a)-(f) asks the rule for the complete pathname
    of its folder and gets its kind); then (a)-(f) on the roads, cold; (g) and (h) on the rule and the client alone, with the control by
    `ssh -G`. The scan over every recorded argv of the whole run for `/dev/null` as a known-hosts file is M12's; E3.S10 runs it over the whole
    run.
  - **M14** (a)-(d). *Run with Secrets* is not in this row (the parent says why).
- **Depends on.** E3.S6.
- **Done when.** The shared done-when above. The pass criteria are M7's, M12's and M14's last columns. See Q1 (the equals sign) and Q3 (which
  roads "each road" means in M12).

## E3.S8 · What the person is told, as the call saw it (M5)

- **Why here.** M5 needs the final rule of evidence (E3.S1) and two probes of E3.S3; it reuses the control client and the handed config of
  E3.S4.
- **Rows.** M5 (a)-(h).
- **Instruments.** The committed launcher; a second `sshd` as the jump host of the run, and a handed config that the nested client reads too
  (E3.S3, probe 4); the `sshd`'s forced command for (g); a forced command that writes the line and then runs the command it was asked for, to 0,
  for (h) (E3.S3, probe 6); for (d), an address on the loopback that does not answer inside the run's time limit (the spec says how; no address
  outside this machine).
- **Scope.** The eight legs as M5 writes them. The messages are compared with what the product's functions answer (`refusedHostKeySentence`,
  `unnamedHostKeySentence`), never with a text typed in the plan (§3.5, *The words as E2 built them*). For (a) the reading of the screen counts
  *Bridge open to …* too (the parent's *Info for M5 (a)*). The control of (h) is (g) of the same run. Recorded for C7: the socket check's log line
  in (b) and (c).
- **Depends on.** E3.S4.
- **Done when.** The shared done-when above. The pass criteria are M5's last column, for each of (a)-(h).

## E3.S9 · The rows off the rig (M10, M11, M13), and the control of test 21 per parser (test 34)

Revised by the re-review for epoch 4 (2026-11-25): M11 (b) as the parent now has it, and test 34. M10, M11 (a), (c), (d) and M13 are as
they were. The spec of 2026-11-24 is written against the row of epoch 3; it is written again before the story is built (*Settled by the
re-review for epoch 4*, item 8).

- **Why here.** They need the three instruments that E3.S3 probed and that are not the rig's: the resolver, the older client, Windows. M11 (b)
  runs the runs of M1, M2 (b) and M7 (E3.S4, E3.S6, E3.S7). Test 34 is here because this story brings up the older client, and the test's
  RED can be watched only on that client.
- **Rows.** M10, M11, M13. **Test.** 34 (the parent's §5).
- **Instruments.** For M10, the resolver as E3.S3 found it (probe 2). For M11, the older client (probe 3) and the program that never answers
  (probe 7), with the margin fixed in E3.S3 (5 s). For M13, the Windows client (probe 5). For test 34, the older client of probe 3, first on
  `PATH` for one run of the `-G` tests of `test/pinWords.test.ts`.
- **Scope.**
  - **M10**: the control first, then the roads. If the control is not accepted, the row is not passed.
  - **M11** (a)-(d). In (b) the roads run under a config of their own that names no `KnownHostsCommand`, and the count of the question is one
    per pinned call (three). In (c) and (d) see Q3 (which roads "each road" means). The result names the client's version, and for C20 the two
    times per road and what the person was shown while waiting.
  - **M11 (b), as revised.**
    - *The client's version first.* Before the legs of (b) the run reads the version of the client that it put first on `PATH`, checks that
      the product reads it as older and that it is below 8.7, and fails the legs when it is not or cannot be read. The record of identities
      names it.
    - *What stays, with every check of the row code:* the runs of M1; M2 (b), the mismatch; and for each of M7's five shapes (a)-(e) the runs
      of M1 and both legs of M2 (b). These hold the product's own word (in double quotes in (a)-(d), bare with a backslash in (e)), the
      `Offending` line of the mismatch leg, the words of an older client (no `KnownHostsCommand` pair) and one question `ssh -V` before the
      connections of each pinned call.
    - *What goes:* M7's two legs of the collision, run on the older client with M7's expectation. They cannot pass there.
    - *What comes in their place: the twin of (c), two legs.* The storage folder of M7 (c), a pair of apostrophes. The pin file of each call
      (the intended file) holds K1's line; the twin, the file at the path with the apostrophes taken out, holds K2's line, and it is written
      when the call's pin file is known and before that call's client starts, as E3.S7 built it for M7. First `ssh -G` on this client, as
      both known-hosts options, for the bare word and for the word in double quotes: each resolves to itself in both lists. Then:
      - **K1 is the counterpart.** The roads log 5 accepted logins. Then the witness, the control client with E1's words and the path bare,
        ends with 0, and K1 logs one more accepted login with its command.
      - **K2 is the counterpart.** Each of the four runs that start ends with 255 and the verification line; K2 logs 0 accepted logins and 0
        authentication attempts. Then the control, the control client with E1's words and the path bare, ends with 255 and the verification
        line, and K2 logs 0 authentication attempts and 0 accepted logins for it.
      The K1 leg rules out that the client found neither file. The K2 leg rules out that it found the twin. A bare-word outcome the other
      way round, in either leg, fails the row. The expectations of these two legs are constants of the older parser in the story's own
      code: they are not M7's expectations with a switch, and they are never chosen by what the run shows.
    - *What the result says in words* (the parent's decision 22): this row does not show the collision, which is a fact of a client from 8.7
      on, and no row ran a client of 8.5 or 8.6.
  - **Test 34: the code of the unit test G5** (`test/pinWords.test.ts:324`; and `test/pinnedArgv.ts` if the choice of the parser lives beside
    `sshKnowsKnownHostsCommand`, `:20`). RED first: with the older client first on `PATH`, G5 as it stands fails at its first assertion; the
    story watches that and records the message (it is inferred from the lead's `ssh -G` measurement and was never run). Then the `-G` tests
    read the client's version with the product's reader and take the expectation of its parser, as the parent's test 34 lists them: G4 on
    both parsers; the control of the newer parser as today; the control of the older parser (the bare pair resolves itself, and a bare
    equals sign does not); the refused rows asserted on the newer parser and recorded on the older one. GREEN twice: the suite as CI runs it,
    and one run with the older client first on `PATH`. A written path that the older client resolves to another one is a defect of the rule
    on that client. The coder does not repair it in this story: the coder stops and tells the lead. The repair (the kind moves to "refused",
    which the parent's §3.11 allows) changes the product, so it is a repair inside E3 with its own spec and its test RED first (*What a
    proving run that fails asks for*).
  - **M13** (a)-(c) and the UNC folder, the client alone. The result names the client's version.
- **Docs.** `research/module_tests.md`: M10, M11 and M13 as seen when they were built, and test 34 with its counts on both clients.
- **Depends on.** E3.S7; and the parent's line of epoch 4.
- **Done when.** The shared done-when above (CI does not run these rows; their proving runs are local and on the owner's Windows for M13). The
  pass criteria are M10's, M11's and M13's last columns, M11 (b) as revised for epoch 4. Test 34 was watched RED on the older client and
  is green on both clients; no file of `src_vs_code/src` outside `src/test/` changed.

## E3.S10 · The one run of the whole set, §10, and the CHANGELOG entry (no row of its own)

- **Model.** Sonnet runs the set and drafts §10 from the record. An Opus judge reads every row against its last column, every control, and
  every count. The CHANGELOG table is the judge's (as R5 was read by the Opus review of E2).
- **Why last.** It measures the final tree: every story above is done, and nothing that can affect the measurements changes after it.
- **Scope.**
  1. **The tree.** If `main` has moved since `8dabad08`, E3's branch takes it again by a merge, never by a rebase or a force push (decision 17),
     and the files that tooling parses are read again (`src_vs_code/CHANGELOG.md`, `todo/README.md`, the scripts' exports; `git-workflow.md`,
     rule 11).
  2. **The run.** The rows of the rig in ONE run of the script, and M10, M11 and M13 on the same commit, through the committed instrument, from
     a tree with no modified tracked file. The run records `git rev-parse HEAD`, the empty answer of
     `git status --porcelain --untracked-files=no`, and the identities of what ran. The commit is a descendant of E3.S1's and of E3.S2's.
     **The run starts from a fresh checkout of that commit** (`git worktree add --detach <owned folder> <commit>`, then `npm ci` in its
     `src_vs_code`), so an untracked file of a working tree cannot take part in it. The run also records the answer of
     `git status --porcelain --untracked-files=all` in that checkout, which is empty (ignored files, such as `node_modules` and the
     build's output, are made by `npm ci` and the build from the commit). What the run uses from outside the tree (the unpacked `sshd`,
     the older client, the Windows client) is named by path, version and SHA-256 in the identities. (The plan round on this document,
     finding 1: a check with `--untracked-files=no` alone does not see an untracked input.)
     **Since the re-review for epoch 4:** with M11, on the same commit and from the same checkout, the `-G` tests of test 34 run once with
     the older client first on `PATH`. Their result is evidence of the rule of the path on the older parser. It is no row.
  3. **§10 in the parent**, before `## Epics`, per row: the four numbers of decision 15 where the row counts them, the date, the versions of the
     client and of the counterpart, the commit, the identities, and for M10, M11 and M13 where they ran. A row that was not measured is "not
     passed", and E3 is then not done. **Since the re-review for epoch 4, §10 also says these limits in words** (the parent's decision 22
     and §6): M2 (a) proves the user-file slot that the handed config names and claims nothing about the compiled-in default path, and no
     run read or wrote the person's real `~/.ssh`; M7's collision is the result of a client from 8.7 on, with that client's version beside
     it; M11 (b) shows on the older client, by its version, that the intended file alone supplied trust, and it shows no collision; no row
     ran a client of 8.5 or 8.6; the result of test 34 on the older client stands beside M11.
  4. **The CHANGELOG table in §10.** Each sentence of the entry that claims a behaviour, with the test of §5 or the row behind it. The start is
     the claim list CL1-CL32 that E2.S4 wrote (the body of `d0ae4b3c`, carried in the squash message of `4799f9d7`), read again against the
     entry as it stands, because E2's later fixes changed it (settled item 4). A claim with nothing behind it is taken out of the entry or said as
     "not measured". "No connection starts" is backed by M4 (W7). The sentence "Not measured before this release" (`CHANGELOG.md:105-106`) is
     written again from §10. Where this lands in the CHANGELOG is Q2. Since the re-review for epoch 4: the new entry under `[Unreleased]`
     carries the limits of item 3 in the person's words, and what it says of "an `ssh` older than 8.5" names the version that M11 ran.
  5. **`research/module_tests.md`**, the real runs (§6, *E3 writes*): where the counterpart lives, the exact command, M1-M14 marked as
     measured, and what they do not prove.
- **Depends on.** E3.S1-E3.S9.
- **Done when.** The parent's E3 *Done when* and the group *E3* of §8, by reference, apart from its last item (the code gate and the merge),
  which is the epic's end below.

## The epic's end

When E3.S10 is done, the code gate runs on E3's branch: `review_code`, then `resolve`, until `proceed`. A cadence consult, if the gate orders
one, comes before that round. Then the lead's Opus review, CI green on the head sha, CodeRabbit read, and one PR, merged by squash after the head
sha's checks exist and pass. A PR over the repository's cap needs the owner's word. E2's pull request is merged already (settled item 1), so
decision 17's order holds. A code-gate fix that can affect the shipped extension or the measurements means the whole set again (E3.S10).

After E3's merge: the feature review, once, from a checkout of `main` that holds E1, E2 and E3, with `baseRef` `4392a272` (§9, step 10); then
the release of G1's next extension patch with the owner's word, only as §9, step 11 says (the tree of `src_vs_code` of the released commit is
the tree that E3 measured, the vsix's hash named); then the promotion of the parent and its stories documents together.

**What step 11 means for the release commit (the plan round on this document, finding 0; consult `e7464abb`).** The release commit of
release-please always changes the tree of `src_vs_code` in more than the CHANGELOG: the release of 1.23.0 changed `RELEASES.md`,
`package.json` and `package-lock.json` (`git diff --name-only extension-v1.23.0^ extension-v1.23.0 -- src_vs_code`, read 2026-11-23), and
the extension reads its own version at run time (`extension.ts:916`). So the trees are never the same, and step 11's own clause applies every
time: the whole set runs again on `main`. In this repository the merge of the release pull request does not cut the tag; the next run of
`release-please.yml` does. So the order is: the release pull request is merged; the whole set runs once more, as E3.S10 runs it (a fresh
checkout, the identities), on that merge commit of `main`; only when it passes is `release-please.yml` run again to cut the tag; and the
release names that commit, the vsix's hash and the identities of that run. This is the existing clause of step 11, not a change of it; a
release that skipped this run would need a change of the plan (an entry of the ledger) first.

The commit that adds this document also updates the parent's `## Epics`, E3, *Stories* ("not written yet"), and adds this document's row to
`todo/README.md` (`planning-docs.md`: each stories document gets its own row, committed with the file it links).

## Questions for the lead

**The lead's answers (2026-11-23), each after one consult of the question consultants. None is a plan change; the parent's ledger gets no
entry for them.**

- **Q1: no new leg (choice A).** Consult `9551f020`: OpenSSH 8.4p1 reads both known-hosts options with one parser, and once it sees the
  opening double quote it takes the path to the closing quote as one name (`readconf.c`, `misc.c` of `V_8_4_P1`, read, not run). So a quoted
  `=` gives no road to a second file. M7 and M11 (b) keep (a)-(e). E3.S3's probe 3 adds one check on the older client that it brings up:
  `ssh -G -F /dev/null` with both options set to a quoted path that holds `=` prints that path, whole, as the sole value of each option. That
  check is evidence of the probe, not a row; if it splits the path, the lead stops and records a plan change. Until it runs, §10's CHANGELOG
  table says for this claim: OpenSSH 10.2p1 by `pinWords.test.ts` (row "an equals sign"); OpenSSH 8.4 read, not run.
- **Q2: choice (a), on E3's branch.** Consult `552ad198`: `git diff extension-v1.23.0 HEAD -- src_vs_code/CHANGELOG.md` is empty (checked),
  and the shipped text already says "No connection starts" (W7) and names C19 as "Not yet right" (checked). E3.S1's first documents commit
  writes `## [1.23.0] — 2026-11-23` above the two shipped entries; C19's fix and every correction that §10 supports go into a NEW entry under
  `[Unreleased]`, and the text of 1.23.0 is not edited. No separate pull request (the repository is over its cap of open pull requests) and
  no condition of order before E3: that would be a change of the build order. If another session writes the heading on `main` first, E3's
  branch takes it by the merge of §9, step 9.
- **Q3: confirmed.** "Each road" in M11 (c), M11 (d) and M12 means the roads that the leg can drive; the socket check after a refused bridge
  has no start of any kind, by the setup's note, and the record shows it.
- **Q4: confirmed.** A repaired reference: E3.S3's probe 1 probes it, through the extra config lines of E3.S2's serving launcher. The parent's
  text is not edited for it.
- **Q5: record only.** Consult `6a283e64`: the files that the runs load from the submodule did not change across the pin move of `8dabad08`
  (`git -C .agents/conventions diff b174649 c598a11 -- tools/lib/owned.mjs tools/lib/owned-token.mjs` is empty; checked). E3.S10 records
  `git rev-parse <commit>:.agents/conventions` beside the identities. If the pin moves between the measured run and the release, the release
  reads what changed under the condition that step 11 already has ("the harness"): a change of those files means the whole set again; a
  change elsewhere in the rules does not.

**Q1 · The equals sign is a kind that the rule now quotes, and no row measures it.**
- The parent, §3.11, the table of the rule: "white space, or an apostrophe | the path in double quotes, in both words". M7 (the paths that need
  double quotes): "(a) a space, (b) one apostrophe, (c) a pair of apostrophes, (d) a space and an apostrophe, and, since epoch 3, (e) a backslash
  as the last character of the folder's own name". M11 (b) runs M7 (a)-(e) on the older client.
- What is on `main` (settled item 4): `checkedPin` quotes `=` too (`hostKeyPin.ts:226`, `/[\s'=]/`). Its docblock (`:216-219`): "OpenSSH 8.4
  reads a known-hosts value with `strdelim`, which splits an UNQUOTED value at `=` … The 8.4 reading is from its source (`readconf.c`), not run
  here." The CHANGELOG (`:78-79`): "A path with an apostrophe or an equals sign works too … OpenSSH 8.4 splits an unquoted value at `=`; OpenSSH
  10.2 reads it whole either way, measured". It came with the squash `4799f9d7` ("fix(extension): quote a pin path with an equals sign; …
  (CodeRabbit, #388)"). The parent's ledger has no entry for it.
- My reading: the quoting stays inside the rule's answer "written" (§3.11 lets the spec set the kinds), so I do not count it as a plan change.
  But a leg for it in M7 and M11 (b) would be one (a row grows). Without a leg, §10's CHANGELOG table must say for this claim: OpenSSH 10.2p1
  by `pinWords.test.ts` (its row "an equals sign", G4); OpenSSH 8.4 read, not run. Which does the lead want?

**Q2 · Where E3 writes into the CHANGELOG, now that the G1 entry has shipped.**
- The parent, §6: "E3.S1 (C19) updates, with its code: the CHANGELOG entry …"; "E3 corrects in the CHANGELOG entry what a row says otherwise";
  the entry has "No version heading: the release writes it".
- What is so (settled item 2): 1.23.0 shipped the G1 entry, and the entry still stands under `## [Unreleased]` (`CHANGELOG.md:7`, `:16-106`).
  Here the heading of a released version has come with the promotion pull request (#375, #378). So an edit of that entry in place would make it
  describe the next release while 1.23.0's package carries the old text.
- The choices that I see: (a) write the `## [1.23.0]` heading first (outside E3's stories), and E3 writes a new entry under `[Unreleased]` for
  C19 and for what §10 changes; (b) E3 edits the entry in place, and the release that follows E3 writes one heading over 1.23.0's and the next
  version's text. I do not think either is a plan change; it decides only where E3.S1's and E3.S10's sentences go.

**Q3 · "On each road" in M11 (c), M11 (d) and M12 (a)-(f).**
- The parent, M11 (c): "on each road 0 connection starts (the record holds the `-V` starts alone, one per refused call)"; M11 (d): "on each road
  the record holds exactly ONE start, the `-V`"; M12: "(a)-(f), on each road: 0 starts of the client of ANY kind".
- What is so: the socket check starts only after a bridge started (`agentCommands.ts:468`; §3.3). A refused bridge keeps it from starting, so it
  has no start at all, not "exactly ONE". M4 and M9 were worded for "the two roads that it can reach" by `077672ce` ("M4/M9 count the two
  reachable roads"); M11 and M12 were not. The setup's note on what a row counts says: "A road that the refusal of another road keeps from
  starting (the socket check after a refused bridge, §3.3) has no start of any kind in that leg, and the record shows it."
- My reading: "each road" there means the two roads that can be driven, and the socket check is recorded with no start, by the setup's note.
  I do not think this is a plan change, because the note already governs. The lead confirms, or says otherwise.

**Q4 · Two stale words in the setup's *The install's stand-in*.**
- The parent: "How the login gets that `PATH` (the `sshd`'s own config, through the `extraConfig` of `startSshd`, `scripts/itestSshd.cjs:94`)
  is NOT measured: it is the first thing that E3's first story probes."
- What is so: since epoch 3, E3's first story is C19 (E3.S1), and the feasibility is E3.S3 (the parent's own *The feasibility comes first*,
  "E3.S3 since epoch 3"). The counterpart of every row is the serving launcher (E3.S2, item 2), and `startSshd` is `sshd -d`, which starts no
  counterpart of a row.
- My reading (E3.S3, probe 1): E3.S3 probes it, and the lines go through the serving launcher's extra config lines of E3.S2. A repaired
  reference, not a change. The lead confirms.

**Q5 · The harness also reads a file that the release's tree comparison does not see.**
- The parent, §9, step 11: "the release compares the tree of `src_vs_code` at both commits (`git rev-parse <commit>:src_vs_code`; that folder
  holds the harness too)". E3's *Done when*: a later change of "the harness" means the whole set again.
- What is so: the scripts load the shared rules' `owned.mjs` through the submodule (`scripts/lib/leftovers.cjs:25-35`,
  `.agents/conventions/tools/lib/owned.mjs`), which makes every owned folder of the runs. A pin bump of `.agents/conventions` changes it and
  leaves the tree of `src_vs_code` the same. The merge `8dabad08` itself moved that pin (to `c598a11`, from #385).
- My proposal: E3.S10 records `git rev-parse <commit>:.agents/conventions` beside the identities (more evidence, no change). Whether the release
  compares that pin too, and runs the whole set again when it moved, would add to step 11: I think that is a plan change, and it is the lead's.
