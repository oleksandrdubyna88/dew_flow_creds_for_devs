# PLAN — G1, epic E2: the stories (the known repairs: a pinned call trusts the pin alone, names it as one file or does not start, and says only what it saw)

> Status: **stories document written 2026-11-18, the baseline of epic E2; nothing of E2 built.** The stories document of epic E2 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its `## Epics`, E2; epoch 2, approved 2026-11-18). It is
> the epic's baseline, written when E2 starts, not a change of the parent (`plan-change-control.md`, *What counts as a change*). It
> keeps no change ledger: a change of it is an entry in the parent's. Four stories, one cornerstone (E2.S2). To be built on its own branch
> from `main` after E1 (#379, `f3e9887d`). Each spec is written when its story starts,
> `todo/PLAN_person_roads_pin_host_key_E2_S<n>_spec.md`: E2.S1,
> [PLAN_person_roads_pin_host_key_E2_S1_spec.md](PLAN_person_roads_pin_host_key_E2_S1_spec.md); E2.S2,
> [PLAN_person_roads_pin_host_key_E2_S2_spec.md](PLAN_person_roads_pin_host_key_E2_S2_spec.md); E2.S3,
> [PLAN_person_roads_pin_host_key_E2_S3_spec.md](PLAN_person_roads_pin_host_key_E2_S3_spec.md), [PLAN_person_roads_pin_host_key_E2_S4_spec.md](PLAN_person_roads_pin_host_key_E2_S4_spec.md) (all 2026-11-18).

The goal, scope, dependencies and done-when of the epic are in the parent's `## Epics`, E2, with the table of the repairs R1-R5;
the sections named below (§3.10 and so on) and the tests (17-27) are the parent's. This document splits the epic into four stories,
in the order in which what each one decides has to be known. A line reference here was read on `main` at `f3e9887d` (2026-11-18),
the tree that the parent's §1.1, §3.10-§3.12 and tests 17-27 name.

## Settled since the parent's commit

1. **How a client's version is read: the pure reading of the bridged road, under this plan's own floor.** Carried from the
   remote-bridge session, which owns `bridgedSshClient.ts` (read 2026-11-18):
   - `clientVerdict` reads only an anchored token at the very start of stderr, `^OpenSSH_(for_Windows_)?N.M` (`VERSION_TOKEN`,
     `bridgedSshClient.ts:33`), and applies the bridge's floor (`BRIDGED_SSH_FLOOR`, `:28`: 8.9, and Win32-OpenSSH 9.5).
   - E2 reads a version through `clientVerdictUnder` (`:68-76`), with this plan's floor of 8.5 passed as its parameter. The constant
     is not changed, and no second reading of the token is written (§3.10).
   - `bridgedSshClientCheck` (`:117-131`) keeps a verdict per program, and only a good one. Its `ClientVerdict` (`:30`) answers
     `ok: false` for both "no version" (R12) and "below the floor" (R13): the two differ only by their sentence. So the three answers of
     §3.10 cannot be taken from one verdict of that check. They can be taken from the pure reading of one `ssh -V` outcome, asked twice
     (for example: under a floor of 0.0, "is there a version"; under 8.5, "at or above"). E2.S1's spec chooses the shape.
   - The exports of `bridgedSshClient.ts` do not change. PR #380 (remote bridge E1.7, draft) may touch that file to share a helper
     (read 2026-11-18: its files do not include it yet, but they include `scripts/itestSshd.cjs` and `todo/README.md`). If a spec of
     E2 wants a shared helper in that file, it is a question to the lead and a line in both plans (the parent's §4, last paragraph),
     not a silent move.
2. **The bridged call does not change.** The bridged branch of `execHostKeyWords` (`sshExecCommand.ts:144-146`, the one word of
   strictness beside the `-F` file) is not touched by any story. A bridged call is never given a pin file
   (`valuesTaken`, `sshExecCommand.ts:159-161`, refuses one), so it never gets E2's words, and it is not asked E2's question about
   the client.
3. **The pin writer is synchronous today, and the client's answer is not.** `PinWriter` returns its value at once
   (`writtenKey.ts:28`), and `withWrittenKeyUntilExit` is synchronous on purpose: no `await` stands between the start and the attach
   of the one continuation (`:113-116`). Asking `ssh -V` is a spawn. So in E2.S2 the writer, or what it is handed, has to carry an
   answer that was awaited. The shape is the spec's. The constraint is N16's: an `await` may stand only BEFORE `start` (inside the
   guarded span, after the resolve), never between `start` and the attach, so the proof "exactly one of the two deletes runs, on every
   path" holds as it is.
4. **Where the program comes from, per road.** The three roads start the bare word: `runSshExec` defaults to `ssh`
   (`sshExecRunner.ts:95`), and the bridge starts `'ssh'` (`agentCommands.ts:455`). The agent's exec starts the program of
   `sshSpawnLaunch` (`sshProgram.ts:338-345`). *Run with Secrets* starts `spawnableSshProgram` of the default (`sshProgram.ts:371`;
   `composedForAnotherShell`, `remoteLaunch.ts:510-512`, refuses any other program). "The program that the call will start" (§3.10)
   is that one, per road.

## The cornerstone

**Cornerstones: 2 of 2** (three epics: Q = ⌈2·3/5⌉ = 2), E1.S2 and **E2.S2**. E2.S2 is the parent's E2 cornerstone area: the
complete words of one pinned call and the refusals that stand before them (§3.10, §3.11). E2.S1 and E2.S3 are security judgements
outside the quota (the parent's E2, *Cornerstone areas*; `subagent-models.md`, the row *Security judgement*). E2.S4 is a test
harness and a reading of the CHANGELOG against the tests: Opus writes its brief. This commit updates the ledger line of the parent's
`## Epics`.

## E2.S1 · The client's answer: what `ssh -V` says, read as one of three (§3.10, R1)

Spec: [PLAN_person_roads_pin_host_key_E2_S1_spec.md](PLAN_person_roads_pin_host_key_E2_S1_spec.md).

- **Model.** A security judgement outside the quota (which client gets which words decides whether a source of trust stays on):
  Fable writes the spec, Sonnet codes, Opus reviews.
- **Why first.** The words of a pinned call (E2.S2) cannot be written without this answer: §3.10 makes it a required input of the
  one function. So its type and its three values have to exist first. It touches no road and neither builder.
- **Scope.**
  - **One new module beside the helpers** (the spec names it; here `pinClient.ts`). It answers one of three for a program:
    *knows the option* (a version at or above 8.5), *older* (a version below 8.5), or *cannot be read* (the question could not be
    started, it did not end with 0, or its stderr starts with no version token). It never throws, except that a request that ended
    goes on as itself, as `notStartedVerdict` does (`bridgedSshClient.ts:154-160`).
  - **The reading is reused** (settled item 1): `clientVerdictUnder` with this plan's floor, unchanged. The spec says how the three
    answers are taken from it without a second reading of the token and without a change of that file's exports.
  - **The asking.** `ssh -V` of the program that the call will start (settled item 4), through the runner, under a time limit that
    kills the process tree (`runSshExec`; the bridged check's own limit is `CLIENT_CHECK_TIMEOUT_MS`, `bridgedSshClient.ts:81`). The
    spec says in which folder and environment it asks, so that the answer is about the same program that the call then starts (on
    Windows a bare name is searched in the current folder first: `sshProgram.ts:191-195`; the bridged check asks in an empty folder of
    its own, `bridgedSshClient.ts:110-116`).
  - **What is kept.** One answer per window and program (the parent's §3.7, *Added by epoch 2*). A version that was read, on either
    side of 8.5, is kept; "cannot be read" is not kept, so the next pinned call asks again (test 19: "a good answer is asked once per
    program, a bad one again"). The spec states this reading of "good".
  - **Windows.** On `win32` the reading counts only the build that Windows ships (`acceptable`, `bridgedSshClient.ts:55-56`). Off the
    agent case the program is the bare word from `PATH` (`openSshBinary`, `sshProgram.ts:206-216`), which can be another build. Under
    the bridged reading such a client reads as no version, and every pinned call off a bridge would then be refused with sentence F,
    whose words say the version could not be read. The spec decides which platform the reading is asked under, or records the refusal
    as intended and makes sentence F true for it. Either way it is written down; the lead is told (this is a question, not a silent
    choice).
  - **Not here:** the words, the refusal and sentence F (E2.S2); any change of `bridgedSshClient.ts`.
  - **Tests**, the parent's §5: 19, its unit half: the version is read from the start of the stderr of `ssh -V`; at or above 8.5,
    below 8.5 and "cannot be read" each give their answer (with the fixtures `OpenSSH_10.2p1`, `OpenSSH_8.4p1`,
    `OpenSSH_for_Windows_9.5p2`, a version later in a line, a version on stdout, exit code 1, a runner that throws, a time limit); a
    good answer is asked once per program, a bad one again; a request that ended goes on as its error.
  - **Mutation check of test 26** that belongs here: read "cannot be read" as "below 8.5" → 19 is red.
  - **Docs.** `research/module_tests.md`: the new test file and its count, read from the runner, in the G1 section
    (`## The three roads of the person and the saved host key (G1)`, `:2543`). The module's own docblock says where the reading comes
    from and what it does not decide. `research/module_extension.md` and the CHANGELOG wait for E2.S2, where the answer takes effect.
- **Depends on.** E1 merged; epoch 2 open.
- **Done when.** Test 19's unit half was watched RED (the module does not exist), then GREEN; the mutation check is recorded in the
  commit body; `bridgedSshClient.ts` is unchanged (`git diff` of it is empty); typecheck, lint and the whole suite are green.

## E2.S2 · The complete words of one pinned call, and the two refusals that stand before them (§3.10, §3.11, §3.12 part 1; R1, R2, R3) — CORNERSTONE

Spec: [PLAN_person_roads_pin_host_key_E2_S2_spec.md](PLAN_person_roads_pin_host_key_E2_S2_spec.md).

- **Model.** `model: fable`. The cornerstone (security): Fable writes the spec, Sonnet codes, Opus reviews. Sentences E and F are
  in this story, and their words are the spec's (the contracts: §3.10, §3.11).
- **Why here.** This is the one road in for every pinned call off a bridge: the three roads, the agent's exec and *Run with
  Secrets* only use it. It decides which pairs a pin file gets, how its path is written, and which calls do not start. A mistake here
  reads as working: a path that `ssh` resolves to another file, a source that stays on for one kind of client, a refusal that a road
  reads as "no pin". It needs E2.S1's answer as an input.
- **Scope.**
  - **The rule of the path** (§3.11), a pure function of `hostKeyPin.ts`. Three answers, from the measured rows a-k: the path as it
    is (none of the characters below); the path in double quotes (white space, an apostrophe); REFUSED with its kind (a double quote;
    two backslashes in a row; a backslash before an apostrophe; a percent sign; the two characters `${`; a control character). The
    spec fixes the exact set and may only move a kind from "written" to "refused" without E3's M7 (§3.11). `oneFileWord`
    (`hostKeyPin.ts:186-191`) is replaced; `NO_KEY_FILE` (`:137-138`) goes.
  - **One checked value.** The words can only be written from a value that the rule and E2.S1's answer made together: the path as
    the rule wrote it, and whether the client knows `KnownHostsCommand`. A raw path cannot reach the words, and a refused path has
    no value to give (the spec chooses the type; the precedent is `bridgedConfigText`'s `{ ok: false, field }`,
    `bridgedSshConfig.ts:239-250`). `hostKeyWords` (`:162-168`) takes that value or none. The `knownHostsFile` of
    `SshExecOptions` (`sshExecCommand.ts:10`) and of `BridgeOptions` (`sshBridge.ts:83`) carry it. A builder that names a pin file
    without the client's answer does not compile.
  - **The words** (§3.10, §3.12 part 1). For a pin file: the three pairs of §3.9, then `-o VerifyHostKeyDNS=no`,
    `-o KnownHostsCommand=none` only for a client that knows the option, and `-o LogLevel=ERROR`, all before any `extra`
    (`sshBridge.ts:228`, the builder's order). No pin file: today's one word, byte for byte. `ssh_config(5)` is read again for the
    keywords that name a source of host keys, and the spec records that enumeration (§3.10).
  - **What a road reads from stderr under `LogLevel=ERROR`.** The spec lists, per road, what it reads from the stderr of a pinned
    run, and shows that nothing it reads is printed only at `INFO` (§3.12 part 1, *Not measured*).
  - **Where the refusals stand** (§3.10, §3.11: before anything is written or started):
    - *The three roads:* the pin writer (`writePersonPin`, `personPin.ts:45-55`). It asks the client and the rule BEFORE
      `materializeKnownHosts` writes, so a refused call writes no pin file. Its refusal arrives in the refused value that a road
      already reads (`writtenKey.ts:68-78`), so no road gains a branch. The writer turns asynchronous, or is handed an awaited answer
      (settled item 3); the spec chooses, and N16's constraint holds. The rule is asked of the path that the file would have:
      `materializeKnownHosts` is not changed (the parent's §3.8), and its name is private (`knownHostsPath`, `hostKeyTrust.ts:66-68`),
      so the spec says how the whole path is known before the write without a second copy of the name (`materializedKeyPath`,
      `materializedKeys.ts:124`, is exported).
    - *The agent's exec:* where its pin file is made (`connectionArgvOptions`, `sshUseActions.ts:236`). The refusal names the field
      and echoes no path, and no `ssh` starts.
    - *Run with Secrets over SSH:* its pin file is made by Connect's options before the launch (`remoteLaunch.ts:273`, read at
      `:518`), and Connect's road does not change (C1, C4). So its refusal stands in `secretsLaunch` (`remoteLaunch.ts:501-507`),
      which already answers `{ kind: 'refused', reason }`. No `ssh` starts there; the file that Connect's options wrote is deleted by
      the cleanup that deletes it today. The spec names the place and the client's program there (settled item 4).
    - *An unpinned call* is not asked about its client and gets no new word, on every road.
  - **Sentences E and F** (§3.11, §3.10): the words are the spec's, from the baselines and contracts there. On the three roads they
    open with `Cannot reach "<name>": ` and `Cannot bridge to "<name>": ` (§3.5).
  - **`commands/agentCommands.ts`, 797 lines at `f3e9887d`, 3 left under the limit.** The writer's closures (`:194`, `:273`,
    `:429`) and the type of `sweepDeadSockets`'s parameter (`:166-174`) change on lines that exist; the bridge's guard is awaited on
    its own line (`:429`). No new branch. The spec states the count. If it is above 800, C10 (the parent's §3.6, §7 F5) is built
    first, in a commit of its own inside E2, and the spec says so.
  - **The tests of the roads see a new run.** The stand-in runner of `test/personRoadsWorld.ts` records every run of a road. If the
    question goes through the same runner, a pinned entry's records gain a `-V` run, and tests 2-4 and 6-9 of E1 count runs. The spec
    either makes the asker a part of its own that the world stands in for, or changes those counts in this commit and names each test
    in its body (the parent's §5: "the commit that changes it names it"). The same holds for the tests of the agent's exec and of
    *Run with Secrets* (test 12's list).
  - **Tests**, the parent's §5:
    - 17: the words, on the pure function and through both builders, for a client that knows the option, an older one, and no pin
      file (today's argv, byte for byte);
    - 18: the same through the real client's `ssh -G`, under a handed config with `KnownHostsCommand`, `VerifyHostKeyDNS yes` and
      `LogLevel QUIET`; a caller's `extra` that names any of the three comes too late;
    - 19, its road half: on each of the three roads a client that cannot be read starts no connection, writes no pin file, shows
      sentence F and deletes the key file of the call; an unpinned entry is not asked and connects as today;
    - 20: the rule of the path, one case per row of its table and per row a-k, bare, quoted or refused with its kind, the same
      spelling in both words;
    - 21: the same through the real client's `ssh -G`, with the control (the bare pair of apostrophes resolves another path);
    - 22: a refused path starts nothing, on each road and for each kind; on the agent's exec and *Run with Secrets* the refusal names
      the field and echoes no path;
    - 23: the scan that stays: no `/dev/null` as a known-hosts file in `src_vs_code/src` outside the tests, the words written only
      from the checked value, and test 14's scan still finds its places;
    - the guards: test 1 (an unpinned entry) and E1's tests 12-14, before and after.
  - **Mutation checks of test 26** that belong here: drop each of the three new pairs in turn → 17 and 18 are red; send
    `KnownHostsCommand=none` to a client below 8.5 → 17 is red; read "cannot be read" as "below 8.5" on a road → 19 is red; quote on
    white space only → 20 and 21 are red; answer `/dev/null` for a refused path → 22 and 23 are red; write the pin file before the rule
    is asked → "no pin file written" of 22 is red.
  - **Docs.**
    - `src_vs_code/CHANGELOG.md`, `[Unreleased]`, the parts that this story makes untrue (§6): the "two exceptions" of the first
      paragraph ("Neither is off on these calls yet") and "a `KnownHostsCommand` or `VerifyHostKeyDNS` in your own `ssh` config is
      still asked" of the second are replaced by what §3.10 does, with the answer for an `ssh` older than 8.5 and for one that cannot
      be asked (sentence F). The quiet case ("Not covered: if your own `ssh` config says `LogLevel QUIET`…") is replaced by what part 1
      of §3.12 does. The storage-folder paragraph says that a path with a space or an apostrophe works, and that a path of the refused
      kinds is refused with a message before anything connects (sentence E).
    - `research/module_extension.md`, **B10** (`:5318`): the words of a pinned call after E2, the client's three answers, the rule of
      the path with its refusal, sentences E and F, and that Connect's line has none of it.
    - The docblocks of `hostKeyPin.ts` that this story makes untrue: "What these words do NOT switch off" (`:156-158`), the
      `/dev/null` paragraph of `oneFileWord` (`:180-184`), and the comment of `NO_KEY_FILE` (`:137`).
    - `research/module_tests.md`, the G1 section: the new tests and their counts from the runner, and what none of them proves (a
      login; that is E3's).
- **Depends on.** E2.S1.
- **Done when.** Tests 17, 18, 19 (its road half) and 20-23 were watched RED on `main` at `f3e9887d`, then GREEN. The guards pass
  before and after, and an unpinned call is byte for byte as before on every road. Each mutation check above turned red what it names
  and was restored. `agentCommands.ts` is at most 800 lines, with the count that the spec states. Typecheck, lint and the whole suite
  are green.

## E2.S3 · Sentence C only on the evidence of the call's own pin file, sentence D otherwise (§3.12 parts 2 and 3; R4)

Spec: [PLAN_person_roads_pin_host_key_E2_S3_spec.md](PLAN_person_roads_pin_host_key_E2_S3_spec.md).

- **Model.** A security judgement outside the quota (the rule of evidence, and the words of sentence D, which must never send a
  person to replace a saved key): Fable writes the spec, Sonnet codes, Opus reviews.
- **Why here.** It reads what E2.S2 makes `ssh` print: `LogLevel=ERROR` keeps the lines under a quiet config, and the checked value
  carries the path whose `Offending` line is the evidence. It changes what a person is told, not what connects.
- **Scope.**
  - **One pure function of `hostKeyPin.ts`** in place of `hostKeyRefused` (`:214-216`): for a pinned call's path and its stderr it
    answers sentence C, sentence D or nothing, by the table of §3.12. The evidence is `ssh`'s line `Offending <type> key in <the pin
    file of this call>:<n>`, matched on the WHOLE path of this call (its uuid is in the name), beside the verification line; the line
    `Add correct host key in …` is not the evidence (it is cut at 100 characters). Split at CR LF and at LF alone. An unpinned call
    gets nothing, whatever it printed.
  - **The spec measures** how the `Offending` line prints a path that the rule wrote in double quotes (§3.12 part 2, *Not
    measured*: the spec measures the first), and fixes the match from that.
  - **Sentence D**: its words are the spec's, from the baseline and the contract of §3.12. `refusedHostKeySentence` (`:223-225`)
    keeps its words.
  - **The two branches of the roads** (`agentCommands.ts:216-222`, the socket check; `:283-286`, the install's probe) ask the new
    function and keep their size: the socket check shows exactly one error message, `The bridge to "<name>" is not open: ` with
    sentence C or `The bridge to "<name>" could not be checked: ` with sentence D, and logs it; the install shows sentence C or D once,
    in place of "did not answer the probe". The install's second run keeps today's sentence (§3.5). 0 lines added to the file.
  - **Tests**, the parent's §5:
    - 24: the pure function, with the measured texts as fixtures (L9 a, c, d, e, g, h, i, and the run of 2026-11-18): this call's
      `Offending` line gives C; another call's pin file (another uuid), a hop's lines, a remote text that is or ends with the line, and
      `No <type> host key is known` give D; an empty stderr, a host that is down and a refused login give nothing; an unpinned call
      gives nothing; CR LF and LF alone both split;
    - 25: the roads show it; the guard of test 9 holds for both sentences (an unpinned entry; on a pinned entry a host that is down
      and a refused login show the sentences of before);
    - E1's test 9 changes where its stderr fixture lacks the `Offending` line: the commit names it. E2.S3 also removes H1-H4 of
      `personRoadsHostKey.test.ts` (they asked `hostKeyRefused`, which goes; their cases are rows of 24), not only test 9's fixtures.
  - **Mutation checks of test 26** that belong here: drop the `Offending` line from the condition of sentence C → the hop and the
    remote text of 24 are red; match the pin file's folder in place of its whole path → "another call" of 24 is red; show sentence D in
    the log only → 25 is red.
  - **Docs.**
    - `src_vs_code/CHANGELOG.md`, `[Unreleased]`: "A host key that a jump host of your own `ProxyJump` refuses is told with the same
      sentence" is replaced by sentence D and when it is shown (§6).
    - `research/module_extension.md`, **B10**: sentence D, and the rule of evidence for sentence C.
    - The docblock of the function that replaces `hostKeyRefused`: "What it cannot tell apart" (`hostKeyPin.ts:209-212`) goes, and
      the docblock says what the function can and cannot tell (a client that does not keep the word, §3.12 *What stays open*).
    - `research/module_tests.md`, the G1 section: tests 24 and 25 with their counts from the runner.
- **Depends on.** E2.S2.
- **Done when.** Tests 24 and 25 were watched RED, then GREEN; the guard of test 9 holds for both sentences; each mutation check above
  turned red what it names and was restored; `agentCommands.ts` has the count E2.S2 left; typecheck, lint and the whole suite are
  green.

## E2.S4 · The entry claims only what holds, and E1's smoke runs on the changed words (R5, §6; test 27)

Spec: [PLAN_person_roads_pin_host_key_E2_S4_spec.md](PLAN_person_roads_pin_host_key_E2_S4_spec.md).

- **Model.** A test harness and a reading of the entry against the tests, not a security judgement: Opus writes the brief, Sonnet
  codes, Opus reviews. R5 is "read by the Opus review of E2" (the parent's E2, the table).
- **Why last.** It reads everything above: the whole entry against what E2.S1-E2.S3 built, and the real client against the changed
  words.
- **Scope.**
  - **The CHANGELOG entry as a whole** (`src_vs_code/CHANGELOG.md`, `[Unreleased]`; §6, decision 11). E2.S2 and E2.S3 replaced the
    sentences that they made untrue; this story writes the rest:
    - the heading and the opening claim only what holds; the baseline of the heading is §6's: `Changed — security: a saved host key
      that can be used is the only key a call without a terminal accepts`;
    - the limit of C3 stands in the opening, not only further down: when a saved host key cannot be used, the three roads of a person
      refuse, and the agent's `ssh:exec` and *Run with Secrets* over SSH still read it as no saved key and run with `accept-new`;
    - what stays not covered is said in one place: *Connect via SSH* (C1, C4), the agent's reading of an unusable saved key (C3),
      Windows, where no login was measured (C6);
    - every sentence of the entry that claims a behaviour has a test of §5 behind it, or is said as "not measured" and left to a row
      of E3. The brief lists each claim with its test; the list goes into the commit body, and E3 reads it when it writes §10's table.
      No version heading: the release writes it.
  - **E1's smoke on the changed words** (`scripts/itestPinnedRoads.cjs`, section 10 of `ssh-agent-itest.cjs`, test 27). It runs as it
    is and may fail on two known causes, which this story repairs in the script:
    - the shim records every start of the client (`itestPinnedRoads.cjs:257-291`), and a pinned call now starts `ssh -V` first. Leg
      1's check that every recorded start holds the pin words (`startsHoldThePin`, `:387`) has to tell a `-V` start from a connection
      and say how many of each it saw;
    - leg 1 checks the pin words of every recorded argv: it gains the three new pairs (with `KnownHostsCommand=none`, the client being
      OpenSSH 10.2p1), and the bare word `UserKnownHostsFile` of the shared helper `test/pinnedArgv.ts` reads a quoted path as E2.S2
      writes it.
    Leg 2 shows sentence C on both roads; it now needs the `Offending` line of the real client, and the leg says so when it is
    missing. `scripts/itestSshd.cjs` is not edited (PR #380 edits it). Both files stay at most 800 lines.
  - **The control** (by hand, recorded in the commit body, as E1.S4's): leg 2 with the words function made to answer `accept-new`
    is red.
  - **Tests**, the parent's §5: 27: the whole extension suite, lint (`max-lines` included: §3.6) and the build are green; the smoke
    passes both legs, locally on the unpacked `sshd` (E1's stories document, settled item 1) and in CI on the head sha's
    `itest:ssh-agent` step.
  - **Docs.** `research/module_tests.md`: the smoke's section says what leg 1 now checks (the six pairs, the `-V` start) and what it
    does not prove (M1-M14 are E3's). The header comment of `scripts/ssh-agent-itest.cjs` only if a section changes.
- **Depends on.** E2.S1-E2.S3.
- **Done when.** The smoke passed both legs locally and in CI on the head sha; the control was red; the entry's list of claims and
  tests is in the commit body; the leftovers guard (`leftovers-check.mjs --profile node --token creds`) is clean and
  `test/harnessSites.test.ts` is green; the whole of §5 that E2 owns, 17-27, is green with lint and the build.

## The epic's end

When the four stories are built, the code gate runs on E2's branch: `review_code`, then `resolve`, until `proceed`. A cadence
consult, if the gate orders one, comes before that round. Then the lead's Opus review (it reads the CHANGELOG entry against E2.S4's
list: R5), CI green on the head sha, CodeRabbit read, and one PR, merged by squash after the head sha's checks exist and pass. A PR
over the repository's cap needs the owner's word. **E2 is merged and not released** (the parent's §9, step 6). E3 then writes
`todo/PLAN_person_roads_pin_host_key_E3.md`.
