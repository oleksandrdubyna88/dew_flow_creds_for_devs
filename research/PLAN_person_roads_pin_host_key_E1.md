# PLAN — G1, epic E1: the stories (the three roads enforce the saved pin of one call)

> Status: **IMPLEMENTED, 2026-11-27.** Epic E1 (the stories document) of G1: merged (#379, squash `f3e9887d`) and released in extension 1.23.0 on 2026-11-23 (release PR #383, `95e11116`, tag `extension-v1.23.0`). G1 as a whole was finished and released in extension 1.24.0 on 2026-11-27 (release PR #395, squash `a63dee35`, tag `extension-v1.24.0` at `a63dee35`, published to the Marketplace the same day). The parent [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) records the release and the run on the release commit (§10.5).
>
> The status as it stood before the promotion, kept as it was written: **Epic 1 built 2026-11-17/18 (E1.S1 to E1.S4), merged (#379, `f3e9887d`), not released; the re-review of epoch 2 replaces two of its rules (E1.S1's rule of the path by the parent's §3.11, E1.S3's condition of sentence C by §3.12); the stories document was written 2026-11-17.** The stories document of epic E1 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its `## Epics`, E1). It is the epic's baseline,
> written when E1 starts, not a change of the parent (`plan-change-control.md`, *What counts as a change*). It keeps no
> change ledger: a change of it is an entry in the parent's. Four stories, one cornerstone (E1.S2). Built on its own
> branch on top of the G2 plan ([PLAN_bridge_no_connection_sharing.md](PLAN_bridge_no_connection_sharing.md)), which
> merged on 2026-11-17 (#376; the parent's §4, §9). The spec of E1.S1 is written:
> [PLAN_person_roads_pin_host_key_E1_S1_spec.md](PLAN_person_roads_pin_host_key_E1_S1_spec.md), and the spec of the
> cornerstone E1.S2: [PLAN_person_roads_pin_host_key_E1_S2_spec.md](PLAN_person_roads_pin_host_key_E1_S2_spec.md) (both
> 2026-11-17, by Fable); the specs of E1.S3 ([PLAN_person_roads_pin_host_key_E1_S3_spec.md](PLAN_person_roads_pin_host_key_E1_S3_spec.md), by Fable)
> and of E1.S4 ([PLAN_person_roads_pin_host_key_E1_S4_spec.md](PLAN_person_roads_pin_host_key_E1_S4_spec.md), by Opus) are written too (2026-11-17). The feasibility probe of E1.S4 was run early and passed (2026-11-17; E1.S4, *The feasibility probe*).

The goal, scope, dependencies and done-when of the epic are in the parent's `## Epics`, E1; the sections named below
(§3.1 and so on) are the parent's. This document splits the epic into four stories, in the order in which what each
one decides has to be known. Each story's scenarios and brief are in its spec,
`research/PLAN_person_roads_pin_host_key_E1_S<n>_spec.md`, written when that story starts. A line reference here was
measured on `main` after G2 had merged (`ca99cd91`, 2026-11-17): they were repaired with the parent's (its §9, step 1),
and a repaired reference is not a change.

## Settled since the parent's commit

1. **Where the real `sshd` comes from** (the parent's §9, step 3, and §5: "this machine has no `sshd`").
   - *Locally:* an unprivileged `sshd`, unpacked into the session's scratchpad and run by the user. Nothing is
     installed into the system: `apt-get download openssh-server libwrap0`, then `dpkg-deb -x` into a new, empty
     folder. The recipe is G2's, its S2 spec §2: a wrapper that sets the library path for `sshd` alone, the
     `SshdSessionPath` and `SshdAuthPath` lines, and the `SSHD` path of `scripts/itestSshd.cjs:13`, all three edited
     in a scratch COPY of the whole repository. None of it is committed.
   - *In CI:* `/usr/sbin/sshd`, which `ci-extension.yml:162-165` installs for the step `npm run itest:ssh-agent`.
   - *The variable that CI sets* (the parent's §5): `CI=true`. Under it a missing `sshd` is a FAILED check; without
     it, a skip. Sections 5 and 7 of `scripts/ssh-agent-itest.cjs` already read it that way (`:493`, `:630`), and
     G2's section 9 does the same (`scripts/itestNoSharing.cjs:414`). `CREDS_GUARD_TESTS_REQUIRED` is the variable of `npm test`; the real runs are not
     in that suite.
2. **Sentence A's password form stays a dead end in E1, and C1 stays a candidate.** The question consultants were
   asked (consult `f97d93d1`), and both answers agree. C1 is Connect's repair of an empty scan. E1 builds §3.5 as
   written: the password form names no repair.
3. **`KnownHostsCommand` stays candidate C2**, measured by E2's M8 (the parent's choice, §3.9). E1 writes neither
   `KnownHostsCommand=none` nor `VerifyHostKeyDNS=no`.
4. **The smoke reuses G2's real-`sshd` rig.** G2 added section 9 to `scripts/ssh-agent-itest.cjs` (a new
   `scripts/itestNoSharing.cjs`) and a test helper, `src/test/noSharingArgv.ts`; both are on `main`. E1.S4's smoke
   follows that rig's pattern and does not build a rig of its own. The pattern: `startSshd` and `launch` of
   `scripts/itestSshd.cjs`, a section scope, an owned folder, and the compiled product's argv and
   `SshBridgeManager`/`bridgeSpawner`. When a unit test of E1 has to ask an argv about G2's words, it imports
   `noSharingArgv.ts` and does not copy it.

## The cornerstone

**Cornerstones: 1 of 1** (two epics: Q = ⌈2·2/5⌉ = 1). **E1.S2** is the cornerstone: the parent's E1 cornerstone area
(§3.1, §3.2) is the pin decision of one call and the guard that owns two files. E1.S1 and E1.S3 are security judgements
outside the quota (the parent's E1, *Cornerstone areas*; `subagent-models.md`, the row *Security judgement*). E1.S4 is
a test harness and is no security judgement: Opus writes its spec.

## E1.S1 · The words of a pinned call come from one function (§3.9, P1)

- **Model.** A security judgement outside the quota: Fable writes the spec, Sonnet codes, Opus reviews.
- **Spec.** [PLAN_person_roads_pin_host_key_E1_S1_spec.md](PLAN_person_roads_pin_host_key_E1_S1_spec.md) (2026-11-17).
  It names the function `hostKeyWords` (in `hostKeyPin.ts`) and fixes the rule of the path: a path with no white space
  is written as it is; a path with white space goes in double quotes; a path that holds a double quote is not named at
  all, and both options then name `/dev/null`, so that `ssh` refuses every host. The function always answers words, so
  neither builder gains a branch. Its RED texts and its mutation checks were measured on a scratch copy of `main` at
  `ca99cd91`.
- **Why first.** This story decides what a pinned argv says: the pin file as both known-hosts files, and the form of
  its path. Rows 6 and 7 of §3.9 decide that form: a path with white space goes in double quotes, and a path that
  holds a double quote never reaches `ssh` as two paths. Every later assertion and the smoke read argvs in that form.
  It touches neither `commands/agentCommands.ts` nor the helpers, so it does not wait for §3.6's budget.
- **Scope.**
  - `hostKeyPin.ts`: one new pure function (the spec names it). Given a pin file, it answers
    `StrictHostKeyChecking=yes`, `UserKnownHostsFile=<file>` and `GlobalKnownHostsFile=<file>`, with the same path
    twice. Given none, it answers `StrictHostKeyChecking=accept-new`, as today.
  - Its two callers: `hostKeyArgv` of `sshBridge.ts` (`:182-187`) and the expression of `buildSshExecArgv`
    (`sshExecCommand.ts:173-176`).
  - Not changed: `materializeKnownHosts`; Connect's line (`sshCommand.ts:313-330`, candidate C4); the config's own
    sources (C2).
  - Tests, the parent's §5: 13 (the function and both builders; RED first: no argv names `GlobalKnownHostsFile`
    today); 14 (the scan of `UserKnownHostsFile=`, written before the change: its first run names today's three
    places; afterwards it names the function and Connect's reviewed place, with C4 as the reason, and it finds both);
    12 (the agent's exec, *Run with Secrets* and the builders' own suites pass, and an expectation that changes is
    changed in this commit and named in its body: after G2 there is exactly one, G2's test of the literal of a pinned
    bridged argv, `test/sshExecCommand.test.ts:316-332`, which takes G1's pair out before it compares; the parent's §4
    and §5); the mutation checks of item 15 about `GlobalKnownHostsFile` and
    about a bare path with white space.
  - Docs: `src_vs_code/CHANGELOG.md`, `[Unreleased]`, the second half of §6's security entry. On every pinned call
    that the extension starts without a terminal, a key that only a system-wide file lists is no longer accepted,
    and a storage folder whose path holds a space no longer breaks the call. In `research/module_extension.md`, the
    paragraph **B10 — the host key** (`:5196-5213`) names the words of a pinned call and the one function, and says
    that Connect's line is not among them yet.
- **Depends on.** G2 merged (G2 edits both builders) and the parent's §9, step 1.
- **Done when.** Tests 12-14 were watched RED, then GREEN; the mutation checks are recorded in the commit body; on a
  pinned call, the agent's exec and *Run with Secrets* change only by these words (test 12); typecheck, lint and the
  whole suite are green.

## E1.S2 · The pin of one call, and the guard that owns two files (§3.1, §3.2, §3.5 sentences A and B) — CORNERSTONE

- **Model.** `model: fable`. The cornerstone (security): Fable writes the spec, Sonnet codes, Opus reviews. The two
  forms of sentence A are a security judgement too (P2), and they live in this story's writer.
- **Spec.** [PLAN_person_roads_pin_host_key_E1_S2_spec.md](PLAN_person_roads_pin_host_key_E1_S2_spec.md) (2026-11-17).
  Four things below were corrected from it on 2026-11-17, as facts and not as changes: the form of the three calls,
  the log line of the socket check, the count of `agentCommands.ts`, and which test the mutation "the pin before the
  guard" turns red.
- **Why here.** This story defines the one value that every road reads: *ready* (with `knownHostsFile` when the entry
  is pinned) or *refused*. It also defines which deletes run on every way out. A mistake here reaches all three roads
  and still looks as if it works. Examples: an unusable pin read as unpinned, a pin deleted only together with a key
  file, a pin written outside the guarded span. It does not depend on E1.S1: the files are disjoint. It is built after
  E1.S1 on the same branch.
- **Scope.**
  - **First, a commit of its own: §3.6's freed lines.** `commands/agentCommands.ts` was measured on `main` after G2
    had merged (2026-11-17, `ca99cd91`): 794 lines, as at `b84416aa`, because G2 did not change the file. The import
    lines that name one symbol each, from seven modules, are grouped into one line per module (794 → 785); the request
    strings stay. The budget holds after G2. If a later merge into `main` takes it away, that goes to the lead (§3.6;
    C10 is the only reserve).
  - **New `personPin.ts`** (the spec fixes the names; here `writePersonPin(storageDir, entity, auth)`). It answers one
    of three states (absent, pinned, refused) and never throws. It calls `materializeKnownHosts(storageDir, entity,
    randomUUID())`. A refusal carries sentence A, in the form that `auth` chooses, or sentence B when the write
    throws. Absent means `(entity.hostKey ?? '').trim() === ''`.
  - **`writtenKey.ts`.** Both helpers get the writer as a second, REQUIRED parameter, and §3.2's contract,
    items 1-5:
    - inside the `try`, the writer is called only for an `ok` credential, and then `run` or `start`;
    - `run` or `start` gets ONE value;
    - the helper keeps the writer's path and deletes it on its own, whether or not a key file was written;
    - only that path is deleted;
    - the bridge keeps one `handed` flag and one continuation for both files.

    The module comment says that the module now owns both files of a call.
  - **`commands/agentCommands.ts`.** The three calls of the helpers pass the writer, bound to the call's storage
    folder and snapshot. A refusal arrives in the refusal branches that exist (`:202-204`, `:277-280`, `:430-433`),
    and no road gains a branch. The argv calls are E1.S3's.
    - *The form the spec chose:* each road writes `withWrittenKey(await resolveExecAuth(…), (auth) =>
      writePersonPin(…), (credential) => {…})` (the bridge the same with `withWrittenKeyUntilExit`). The answer of the
      resolve has no name on a road, so a road holds only the ONE value that the guard hands it. A scan that stays
      (QS of the spec) keeps it so.
    - *The socket check's log line for a refused value* (the parent's §3.3: "It goes to the diagnostic log") is this
      story's: `socket check did not run: <the message>`, area `bridge`. It is written for a refused pin (a write that
      failed) and also for a refused credential of the check's own resolve, which was silent before. No message is
      shown for either.
    - *The count:* 794 lines on `main`, 785 after the import grouping, 784 after this story (the spec, §4.3).
  - **The test world `test/personRoadsWorld.ts`** gains a pin on the entry (`hostKey`), a real temporary storage
    folder (the owned-folder helper, as `test/hostKeyTrust.test.ts:128` uses it), and an `ssh` stand-in that reads the
    file the argv names (E1.S3 uses it). `materializeKnownHosts` and `forgetMaterializedKey` are the real ones in every
    pin test.
  - **Tests**, the parent's §5:
    - 10: the helpers, in `test/writtenKey.test.ts`. N16's U1-U8 get the new argument and keep every assertion.
    - 1: the unpinned guard, green before and after.
    - 5: the two deletes do not depend on each other.
    - 6: an unusable pin is refused on each road, and the form follows the login, word for word.
    - 7: a pin write fails, both ways: the stand-in throws, and a real folder cannot be written.
    - 8: two calls at once hold distinct files, and each end deletes only its own; `known_hosts-e1` is left
      untouched.
    - Unit tests of `personPin.ts`.
    - N16's C1-C6, I1-I7, R1 and B1-B9 run unchanged.
  - **Mutation checks of item 15** that belong to this story:
    - delete the pin only when a key file was written → test 5 is red;
    - write the pin before the guard → "a writer that throws" of test 10 is red (U13 of the spec; measured there as N3:
      test 7 stays green, because its writer answers a refusal and does not throw);
    - read an unusable pin as unpinned → test 6 is red;
    - refuse an absent pin → test 1 is red;
    - drop the suffix → test 8 is red;
    - give a password entry the key form → test 6 is red.
  - **Docs.**
    - `CHANGELOG.md`, the entry's clause on a saved key that cannot be read: it is refused, and the message says what
      to do.
    - `research/module_extension.md`: the paragraph **The bridge's `ssh` and its key file (N16)** (`:2581-2591`) gets
      the pin file and the extended helpers; the table *Secrets at rest and in flight* (`:6185`) gets the per-call pin
      file; *Rule C* (`:6613`) gets the per-call pin name.
    - `research/module_tests.md`: the new section after `## A bridge, its socket check and the install delete their
      key file (N16)` (`:2479`) begins, behind G2's section (`:2501`), with this story's tests and their counts as the
      runner reads them.
- **Depends on.** G2 merged; the parent's §9, step 1.
- **Done when.** Tests 5-8 and 10 were watched RED on the unchanged code and pass. The guards (test 1 and N16's tests)
  pass before and after. Each mutation check above turned red what it names and was restored. `agentCommands.ts`
  is at most 800 lines, with the count that the spec states. Typecheck, lint and the whole suite are green.

## E1.S3 · The three roads name the pin file, and a refused host key is told (§3.3, §3.4, §3.5 sentence C, P3)

- **Model.** A security judgement outside the quota: Fable writes the spec, Sonnet codes, Opus reviews.
- **Spec.** [PLAN_person_roads_pin_host_key_E1_S3_spec.md](PLAN_person_roads_pin_host_key_E1_S3_spec.md) (2026-11-17).
- **Why here.** It needs E1.S1's words in the argv and E1.S2's ready value. It is the step that makes the pin take
  effect on the five runs.
- **Scope.**
  - **`commands/agentCommands.ts`.** The four argv calls name `knownHostsFile`:
    - `sweepDeadSockets` gets it as a parameter (`:173-180`);
    - the mode check (`:206`);
    - `runRemote` (`:332-350`, its argv at `:338`), so the probe and the install run share one file;
    - `buildBridgeArgv` (`:437-441`).

    Both runs of the socket check read the same file. The check that follows a bridge (`:465`) writes its own pin
    file from the same snapshot. There is one pin snapshot per call (§3.3).
  - **How a test reads the file that an argv names.** The test world of E1.S2 has `knownHostsOf(argv)`: it takes the
    value of `UserKnownHostsFile`, bare or in double quotes. Those are the two forms that E1.S1 writes for a pin file,
    so the two specs agree. Two things for this story's spec: a storage folder whose path holds a double quote is
    named as `/dev/null` by E1.S1 (its spec, §1), and E1.S1's `test/pinnedArgv.ts` has `valuesOf(argv, name)` for both
    known-hosts options, so "the same file as both" can be asked with it.
  - **Sentence C.** `hostKeyPin.ts` gets a new pure function, the match: the call is pinned AND the run's stderr
    holds `Host key verification failed.`. Each bounded road gets one branch: 4 lines on the install and 7 on the socket check (13 lines added in the story;
    `agentCommands.ts` 784 after E1.S2, 797 after this story; the spec, §3.3):
    - *The install's probe* (`:282`; `runRemote` returns its stderr): sentence C in place of "the host did not
      answer the probe" (`remoteCliInstall.ts:84`). The install's second run keeps today's sentence.
    - *The socket check's mode check* (`:217`): `The bridge to "<name>" is not open: ` and sentence C, shown with
      `showErrorMessage` and written to the log too (P3).
  - **§3.6.** The final count of `agentCommands.ts` is at most 800, with lint's `max-lines` green; the spec states the
    exact count.
  - **Tests**, the parent's §5:
    - 2: the socket check;
    - 3: the install;
    - 4: the bridge;
    - 9: sentence C, with its guards: an unpinned entry, and on a pinned entry a host that is down and a refused
      login;
    - 11: the scan that stays: the four sites name `knownHostsFile`, and the scan still finds four.
  - **Mutation checks of item 15** that belong to this story:
    - drop `knownHostsFile` from each of the four calls in turn;
    - write one file per run;
    - delete the bridge's pin file at once, or from `onEnded`;
    - drop "pinned" from sentence C's condition;
    - show the check's sentence C in the log only.
  - **Docs.**
    - `CHANGELOG.md`, the first half of §6's entry: the three roads now check the pinned host key; a host that
      presents another key is refused and a message says so; an entry with no pin connects as before.
    - `research/module_extension.md` **B10**: the three roads, an unpinned entry as on the agent's exec, a pin
      enforced from a per-call file.
    - `research/module_tests.md`: the new section is completed with tests 2-4, 9 and 11, with their counts from the
      runner, and with what none of them proves (the last paragraph of §5).
- **Depends on.** E1.S1 and E1.S2.
- **Done when.** Tests 2-4, 9 and 11 were watched RED, then GREEN. Each mutation check above turned red what it names
  and was restored. The whole of §5, 1-16, is green, with lint and the build.

## E1.S4 · The smoke on real input (the parent's E1 done-when; §5, P4; §3.7, its last row)

- **Model.** A test harness, not a security judgement: Opus writes the spec, Sonnet codes, Opus reviews.
- **Spec.** [PLAN_person_roads_pin_host_key_E1_S4_spec.md](PLAN_person_roads_pin_host_key_E1_S4_spec.md) (2026-11-17).
- **Why last.** It runs everything above on real input, with the real `ssh` client against a real `sshd`, through the
  commands as the extension registers them.
- **Scope.**
  - **Where it runs.** A new script, named by the spec (here `scripts/itestPinnedRoads.cjs`). It is called from
    `scripts/ssh-agent-itest.cjs` as its section 10, so it runs in the CI step that has an `sshd`. That file has 764
    lines on `main` after G2 (757 at `b84416aa`; G2 added seven), and the limit is 800: 36 are left. POSIX only. Under `CI=true` a missing `sshd`
    fails (settled item 1). It follows G2's section-9 rig (settled item 4).
  - **The counterpart.** `startSshd` with host key K1, and a second one with K2.
    - The first must serve several connections at one address: the bridge holds its connection while its socket
      check makes two more. `sshd -d` serves exactly one (`scripts/itestSshd.cjs:2`). So either `startSshd` gains a
      mode without `-d` (G2's scout ran `sshd -D -e` as the user, G2's plan §2), or the spec shows another way.
    - The spec's first step is a feasibility probe, as G2's S2 had (its fact L2). **It was run early, on 2026-11-17,
      and passed:** the next item. The spec starts from its result and runs it again on the final code.
    - An edit of `itestSshd.cjs` must not collide with PR #365's edit of that file (G2's S2 spec says so).
  - **The feasibility probe (run on 2026-11-17, before the spec; the story's own first step, not a change of the
    order).** A script of the session ran it by hand; the script and its folders are not kept. Conditions: OpenSSH
    10.2p1 on both ends (Ubuntu `1:10.2p1-2ubuntu3.8`), the loopback, one user, no root. The `sshd` was unpacked as in
    settled item 1 and started as `sshd -D -e -f <config>`, through the wrapper, with the two lines `SshdSessionPath`
    and `SshdAuthPath`. Every client had the words of a pinned call as E1.S1 writes them, G2's two options, and
    `-F /dev/null`.
    1. **One listener serves a bridge and two runs at once, at one port.** A bridge-like `ssh -N -R
       <socket>:127.0.0.1:<port>` was up after 103 ms, and its forward answered. Two runs were started together
       (`stat -c %a <socket>`, and `sleep 1; echo`): exit codes 0 and 0 after 1.1 s, the first printed `600`. The bridge
       was still running and its forward still answered. The ONE log of the listener held 3 lines `Accepted
       publickey`. While both runs were open the listener had 6 descendants: for each connection an `sshd-session:
       <user> [priv]` with a child `sshd-session`, and under a run's the shell and its command. Each `sshd-session` of
       the first level leads a session of its own (its `pgid` and `sid` are its own pid), so a signal to the listener's
       process group does not reach it.
    2. **`endChild` alone does not end the server side** (`scripts/itestSshd.cjs:141-150`: it signals the pid that was
       recorded, the listener's). Set up: a bridge and two runs whose remote commands were still running (`sleep 300`,
       and a shell that ignores `TERM`, `HUP` and `INT`), 9 descendants.
       - *The clients first, then the listener* (the order in which a scope ends them): all ended in 8 ms, the listener
         with exit code 0. The six `sshd-session` processes went with their clients. The three processes of the remote
         commands were still alive 6 s later, and nothing that names them was left.
       - *The listener alone:* it exits with 0, and all 9 were alive 1 s later, with new parents. The bridge's client
         still ran and its forward still answered.
    3. **The recipe that ended everything, bounded.** (a) While the listener lives, list its descendants (`ps -e -o
       pid=,ppid=`, walked from the listener's pid) and keep each pid with its start time (`/proc/<pid>/stat`, field
       22). (b) End the clients by their recorded pids. (c) Wait at most 3 s for the list to be empty. (d) `SIGTERM` to
       what is left of the list, at most 2 s, then `SIGKILL`; only to a pid whose start time is still the recorded
       one. (e) `endChild` of the listener. Measured: 9 recorded, 3 alive after (c), 0 at the end, 5.1 s in all. With
       NO client ended first: 9 alive after (c), 0 at the end, 5.2 s, and the three clients had exited by themselves
       0.5 s later. The bound is 3 s + 2 s + 2 s and `endChild`'s own (at most 10 s). **The list has to be taken BEFORE
       the clients are ended:** afterwards a remote command is no descendant of the listener any more (item 2).
    4. **K2 at the address of K1.** K1 was ended by the recipe; K2 was listening on the same port 45 ms after that end
       began. Four runs at once, pinned to K1: exit code 255 and `Host key verification failed.`, four times. K2's log:
       0 accepted logins, 0 lines of an authentication attempt. The control, pinned to K2: exit code 0.
    5. **`PerSourcePenalties` has to be off in this mode.** With the default of `sshd` 10.2, 30 runs with a wrong pin
       in a row (0.7 s) ended like this: 17 times `Host key verification failed.`, then 13 times `Connection reset` or
       `Connection closed`. The log says `activating ipv4 penalty of 16 seconds for penalty: connections without
       attempting authentication`. The next run, with the RIGHT pin, was refused too (255, `Connection closed`). With
       the config line `PerSourcePenalties no`: 30 times the verification line, and the right pin then logged in. A
       refused host key is a connection without an authentication attempt. An `sshd -d` of today is a new process for
       every connection, so it never counted them. Leg 2 of the smoke makes four such connections, and E2 more.

    **Not measured:** a harness that is killed with `SIGKILL`. No cleanup runs then, and the listener, what it forked
    and the clients stay. G2's S2 spec measured a killed run of section 9 (its N8): what the run had started was still
    there at 58 s. macOS (no
    `/proc`; `ps -o lstart=` would give a start time there: read, not run). The runner's own `/usr/sbin/sshd`: the first
    run there is CI's.
  - **The recipe for a multi-connection mode of `startSshd`** (opt-in: a caller that does not ask for it gets today's
    `sshd -d`, byte for byte, so sections 5, 7 and 9 do not change).
    - *What the mode changes:* the flags `-D -e` in place of `-d -e`; one more config line, `PerSourcePenalties no`;
      and the result carries an end of its own that does item 3 for the clients it is given. The "Server listening"
      line comes in this mode too, so the wait stays. `LogLevel` stays the default: the lines `Accepted publickey` are
      in the log (item 1).
    - *The caller's duty:* each leg ends its server through that end, in its own `finally`, pass or fail, and before
      the scope ends the clients. What `launch` registers with the scope (`endChild` of each client and of the
      listener) stays as the second line.
    - *K1 and K2 at one address:* two folders, because `startSshd` writes `sshd_config`, `known_hosts` and `sshd.pid`
      by fixed names; and K2 on the port of K1, so the port can be given.
    - *Where it lives, and PR #365* (read on 2026-11-17; #365 is open). #365 gives `startSshd` a sixth parameter,
      `options` (`address`, `port`, `first`), and edits its doc comment, its signature, and the lines of the port, the
      known-hosts line, `ListenAddress` and the "listening" pattern. The line that holds `-d` (`:111`) is next to one
      of them. If #365 has merged when this story is built, the mode is one more key of that `options`, and the given
      port is its `port`. If it has not, the mode is a starter of its own in this story's new script, built from
      `launch` and `endChild` of `itestSshd.cjs`, so that no line of `startSshd` is edited by two branches; it is
      folded into `options` after #365. The lead decides which when the spec is written.
  - **The roads.**
    - The registered commands `credSshManager.installRemoteCli` and `credSshManager.openRemoteBridge`, under a
      stubbed `vscode`. The spec chooses between the compiled world `test/personRoadsWorld.ts` with a switch for the
      real runner and the real spawner, and a stub of the script's own; reuse comes first.
    - The real ones: `runSshExec`, the bridge spawner, `materializeKnownHosts`, `forgetMaterializedKey` and E1.S2's
      writer.
    - The question of *Install creds on host* is dismissed, so nothing is downloaded or installed. The smoke stops at
      the question; E2's M1 runs the install to its end.
  - **The client.** The real `ssh`, through a shim first on `PATH`, inside the owned folder.
    - The shim records each start's argv and pid. It puts `-F <the rig's config>` before the argv, as G2's rig puts
      its `-F`, so the person's own `~/.ssh/config` is not read.
    - A pinned call's only known-hosts file is the pin file, so no file in `~/.ssh` is written.
    - The spec first checks how the product finds its program. On `main` (`ca99cd91`) it is `ssh` from `PATH` on Linux
      (`sshProgram.ts:324`). `todo/PLAN_ssh_exec_absolute_program.md` is open and would change that.
  - **The legs** (the parent's E1, *Done when*):
    1. The entry is pinned to K1, and the counterpart presents K1. *Install creds on host* reaches its question.
       *Open Remote Bridge…* leaves a bridge whose socket check reads the socket's mode. The counterpart's log shows
       those logins as `Accepted`. Every recorded argv carries `StrictHostKeyChecking=yes` and one path as both
       known-hosts files.
    2. The entry is pinned to K1, and its address is served by K2. Both commands end refused. K2's log shows no
       accepted login. The install shows sentence C. The bridge's check shows its message: exactly one
       `showErrorMessage`.

    After both legs, no pin file of these calls is left in `keys/<pid>/`, and no client process is alive, by the
    recorded pids.
  - **A control, so that the smoke can fail.** By hand, recorded in the commit body: leg 2 with E1.S1's function made
    to answer `accept-new` is red (K2's log shows an accepted login).
  - **The owned folder** (§3.7, the last row): `ownedDir(section, 'pin', { parent: shortSocketRoot() })` under the
    harness scope. It is a short root because the forwarded socket's path has a length limit, and the harness's
    `creds` token is what lets the janitor find a killed run's folder. A run makes two `sshd` processes, the configs,
    two host keys, a user key, the logs, the shim's record and the sockets: a few kB. The section scope's `finally`
    removes all of it, pass or fail. A killed run's leftovers are the janitor's.
  - **The local run.** The scratch-copy recipe of settled item 1. The first run on the runner's `sshd` is CI's.
  - **Docs.**
    - `research/module_tests.md`: section 10, with where it lives, the exact command, what it proves, and what it
      does not. It is not M1-M9; those are E2's.
    - The header comment of `scripts/ssh-agent-itest.cjs`, which lists its sections.
- **Depends on.** E1.S1-E1.S3; G2 merged (its section 9 on `main`).
- **Done when.**
  - Both legs passed locally (the unpacked `sshd`), and in CI on the head sha's `itest:ssh-agent` step.
  - The control was red.
  - `ssh-agent-itest.cjs` is at most 800 lines.
  - The leftovers guard (`leftovers-check.mjs --profile node --token creds`) is clean, and `test/harnessSites.test.ts`
    is green.

## The epic's end

When the four stories are built, the code gate runs on E1's branch: `review_code`, then `resolve`, until `proceed`. A
cadence consult, if the gate orders one, comes before that round. Then the lead's Opus review, CI green on the head
sha, CodeRabbit read, and one PR, merged by squash. **E1 is merged and not released** (the parent's §9, step 4). E2
then writes `research/PLAN_person_roads_pin_host_key_E2.md`.
