# PLAN — three roads of the person enforce the entry's pinned host key (G1 of N16)

> Status: **epoch 4 approved by the owner 2026-11-25 (narrowed), open, one change (4.1, 2026-11-25: M13's control of K7 proves two files for (a) only; (b) and (c) the bare word is refused, owner's word). Epoch 3 (approved 2026-11-23, narrowed) was stopped for re-review on 2026-11-25 by its second change (3.2: M11 (b) cannot run as written: an `ssh` older than 8.7 keeps the apostrophes of a bare word, so it has no collision; OpenSSH 8.4p1 measured); the re-review has passed. The revision of the whole plan for epoch 4 is written (2026-11-25: `### Re-review for epoch 4`, §1.3, decisions 19-22), and it is NARROWED. The Opus judge sorted the done work of epoch 3 (14 fits; the E3.S9 spec cut, fixed forward), and the coai round on the revised plan passed (the interim document round, two parts, `proceed`; one finding accepted and fixed in §3.11). The owner approved epoch 4 on 2026-11-25. Next: the Opus review of E3.S9, then E3.S10. E1 and E2 merged (#379, #388) and released in 1.23.0 on 2026-11-23, before E3 (3.1). E3 started 2026-11-23: its stories document is written; E3.S1 (C19), E3.S2 (the launcher) and E3.S3 (the probes) are built and reviewed; E3.S4 (the common rig, M1, M6), E3.S5 (M4, M9) and E3.S6 (M2, M3, M8) are built and reviewed (CI green on `62251613`); the owner read HC1 of E3.S4 as a record, not a plan change, and M2 (a) as the user-file slot that the handed config names (2026-11-24); E3.S7 (M7, M12, M14) is built and reviewed (CI green on `97752998`); E3.S8 (M5) is built and reviewed (review fixes `167220a6`, CI green); the E3.S9 spec was written again for epoch 4 (`3b3dd0c7`), and E3.S9 (M10, M11, M13, test 34) is built (`6409e7c4`, `fbe36413`; entry 4.1 `15e28ea9`), not reviewed. No row of E3 is measured: every run so far was a proving run, and §10 is not written.** (Plan written 2026-11-17.) Approved 2026-11-17 by the plan round (`proceed`; its four
> findings, P1-P4, accepted and folded in: `## Plan changes`). Epoch 1 had two changes (1.1: the pass criteria of E2's rows M2 and M3; 1.2: the stop). Its re-review replaced the
> old split (two epics and a list of candidates) by three epics (`## Epics`): E1 is done; E2 builds the known repairs (§1.1, §3.10-§3.12); E3 is the
> measurements against a real `sshd`, as the release gate. Epoch 2 had two changes (2.1: two more refused kinds of a storage path; 2.2: the stop). The revision for
> epoch 3 keeps the three epics and changes E3 (§1.2): its first story builds C19 (a run that ended with 0 is told nothing about a host key: §3.12, part 4), its second
> commits the launch instrument of the real runs, and its rows M1, M3-M5, M7, M9, M11, M12 and M14 are revised (`## Epics`). Every other candidate has a written disposition.
> Two changes came in epoch 3 (3.1: the owner released E1 and E2 in 1.23.0 before E3; 3.2: the stop). The revision for epoch 4 keeps the three epics, the ten stories of E3 and
> their order. It changes what a client older than 8.7 is asked to show: M11 (b), test 21 and the rule of admission of §3.11 get a FIXED expectation per parser (§1.3; decisions 19, 20). It
> writes 1.23.0 into decision 12 and §9, step 11 as the one release that did not wait for E3 (decision 21), says what M2 (a) proves and what it does not (decision 22), and carries the
> readings of epoch 3 into the rows. E1's stories document is
> [PLAN_person_roads_pin_host_key_E1.md](PLAN_person_roads_pin_host_key_E1.md) (2026-11-17), with the specs of its four stories:
> [PLAN_person_roads_pin_host_key_E1_S1_spec.md](PLAN_person_roads_pin_host_key_E1_S1_spec.md),
> [PLAN_person_roads_pin_host_key_E1_S2_spec.md](PLAN_person_roads_pin_host_key_E1_S2_spec.md) (the cornerstone),
> [PLAN_person_roads_pin_host_key_E1_S3_spec.md](PLAN_person_roads_pin_host_key_E1_S3_spec.md) (the three by Fable) and
> [PLAN_person_roads_pin_host_key_E1_S4_spec.md](PLAN_person_roads_pin_host_key_E1_S4_spec.md) (by Opus). E2's stories document is
> [PLAN_person_roads_pin_host_key_E2.md](PLAN_person_roads_pin_host_key_E2.md) (2026-11-18; its cornerstone is E2.S2), with the specs of its first three stories:
> [PLAN_person_roads_pin_host_key_E2_S1_spec.md](PLAN_person_roads_pin_host_key_E2_S1_spec.md),
> [PLAN_person_roads_pin_host_key_E2_S2_spec.md](PLAN_person_roads_pin_host_key_E2_S2_spec.md) (the cornerstone) and
> [PLAN_person_roads_pin_host_key_E2_S3_spec.md](PLAN_person_roads_pin_host_key_E2_S3_spec.md), [PLAN_person_roads_pin_host_key_E2_S4_spec.md](PLAN_person_roads_pin_host_key_E2_S4_spec.md). E3's stories document is
> [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md) (2026-11-23; ten stories, no cornerstone); it links the specs of its stories.
> Scope: the extension only (`src_vs_code/src`): the bridge
> socket check, *Install creds on host* and *Open Remote Bridge…* in `commands/agentCommands.ts`, the helpers of
> `writtenKey.ts`, the module for the pin of one call (`personPin.ts`), the words that both `ssh` argv builders write for a
> pinned call (`hostKeyPin.ts`, `sshBridge.ts`, `sshExecCommand.ts`: the agent's pinned exec and a pinned *Run with Secrets* get them too,
> §3.9-§3.11), the sentences for a refused host key, their tests, the real runs against a real `sshd`, the docs. Found as G1 of
> [PLAN_person_roads_forget_key.md](../research/PLAN_person_roads_forget_key.md) (N16, §5) by the lead's Opus review and a
> Fable security pass on 2026-11-16, by reading.
> **Depends on:** the G2 plan, [PLAN_bridge_no_connection_sharing.md](../research/PLAN_bridge_no_connection_sharing.md): merged into `main` on
> 2026-11-17 (#376, `07ed8303`). This plan is built on it (§4).
> **Which tree the line references mean:** §1, §3.1-§3.9, §4, §5 (tests 1-16) and §7 keep the references of the tree before E1
> (`main` at `ca99cd91`): they are the record of what E1 was built against. §1.1, §3.10-§3.12, tests 17-27 and `## Epics` (E2, E3)
> name `main` at `f3e9887d`, read on 2026-11-18. What epoch 3 adds (§1.2, decisions 14-18, the parts marked "epoch 3" in §3 and §5-§9, tests 28-33, E3 as
> revised) names E2's head, `22caab8b` on `fix/g1-e2-measurements`, read on 2026-11-19. What epoch 4 adds (§1.3, decisions 19-22, the parts marked "epoch 4" in §3 and
> §5-§9, test 34, E3 as revised) names the head of `fix/g1-e3-release-gate` at the stop, `17694426`, read on 2026-11-25; the stories document of E3 lists the line references
> that E2's merge moved (its settled item 5).

## Plan changes

> Epoch 1 · approved 2026-11-17 · by reviewers · state: closed

  (The plan round's four accepted findings were folded in at its resolve, the one that approved the plan. They are
  the baseline of epoch 1, not entries. This plan names them P1-P4, because §7 has its own F1-F5: P1, the pin file
  is the only known-hosts file of a pinned call (§3.9); P2, the advice of sentence A sends no password entry to
  Connect SSH (§3.5); P3, the socket check shows a refused host key to the person, not only to the log (§3.3,
  §3.5); P4, the real runs against a real `sshd` are required, not a hand check (§5, `## Epics`).)
  (The split into two epics and a list of candidates was ordered by the same round, for a plan of size Huge. It is
  the baseline of epoch 1, not an entry: `## Epics`. The question consultants were asked about the split, consult
  `cbe21f00`: both answers agree on it.)

- 1.1 · 2026-11-17 · reviewer · dod — E2's M2 and M3 demanded a host-key failure on all five runs, but the install returns after a failed probe (`installRemoteCli`, `agentCommands.ts`), so its second run never starts on a mismatch. Split: an ordinary mismatch proves the refusal and that the install run does not start; a separate scenario lets the probe pass and switches the counterpart's key before the install run, so the second connection is tested through the production control flow. Raised by the cadence consultant (`84b9c946`) before the build; checked by reading.
  (The entry was handed over with the kind "acceptance". The ledger knows no such kind, and the check refuses the
  line with it, so the kind is `dod`: what changed is the pass criteria of E2's rows M2 and M3, which are E2's
  done-when and the Definition of Done's item on M1-M9. Nothing else of the entry was altered. Applied in `## Epics`,
  E2: *The five runs* of the setup, the rows M2 and M3 (each now has two legs, *the mismatch*
  and *the switch*), and the count of runs in M7 and M8.)
- 1.2 · 2026-11-18 · reviewer · dod — E2 cannot decide the candidates it is meant to decide, and one row is unsafe as written. The cadence consultant (`594a6709`, before E2's build; checked by reading): M5 lacks a wrong destination key under `LogLevel QUIET`, a wrong jump-host key with a right destination, and remote output that ends with the verification line (C12, C13); M7 lacks one apostrophe, a pair, a double quote and a UNC path (C11, C16; Linux cannot stand for UNC); M8 joins `KnownHostsCommand` and a secure SSHFP record, so it cannot tell which source admitted K2, and has no control with the disabling option (C2, C17); M3 needs a listener-only stop, or a killed master passes as "no bypass"; and M1's install run would write `/usr/local/bin` of this machine, the counterpart being this machine (`installCommand` passes no prefix; `install.sh:21`). Also: the candidates must be decided before any release (§9).
  (This second change stopped the plan for re-review, 2026-11-18.)

### Re-review for epoch 2

Narrowed: no — the scope grows: the known repairs become a build epic (E2), and the measurements grow from nine rows to fourteen and become the release gate (E3); nothing got smaller

| Work | Where | Verdict | Action |
|---|---|---|---|
| the plan documents inside PR #379 (the plan as first written, the boundary with G2, the approval with P1-P4 and the split, the revision after G2 with change 1.1, the review repairs, the candidates C11-C17), squash f3e9887d | main | fits | kept: the record of epoch 1; their text is rewritten forward by this revision (5e775a7c), which goes to `main` with the re-review's pull request |
| E1's stories document and the four specs E1.S1-E1.S4, in PR #379, squash f3e9887d | main | fits | kept as the record of what E1 built; their status lines say "merged, not released" and name the two rules that epoch 2 replaces (E1.S1's rule of the path: §3.11; E1.S3's condition of sentence C: §3.12), so nothing is built from those rules again; E2's stories document and specs carry the new ones |
| E1.S1, the one function: `hostKeyWords` in `hostKeyPin.ts`, called by both argv builders (`sshBridge.ts`, `execHostKeyWords` of `sshExecCommand.ts`), its three pairs, white space in double quotes, `hostKeyWords.test.ts`, `pinnedArgv.ts`, the one changed expectation of `sshExecCommand.test.ts`, in PR #379, squash f3e9887d | main | fits | kept: it is the one road in that §3.9 asks for and that §3.10-§3.12 extend; E2 adds its pairs and changes its parameter in E2's pull request (R1, R2, R4 part 1) |
| E1.S1, the rule of the path inside `oneFileWord` (`hostKeyPin.ts:186-191`): an apostrophe written bare, a double quote answered with `NO_KEY_FILE`, `/dev/null` (`:138`), and its docblock "it never trusts a file the pin did not name", in PR #379, squash f3e9887d | main | cut | corrected in a new pull request, and that pull request is E2's (R2, R3; tests 20-23), before any release; not reverted. It contradicts decision 9 (no stand-in file) and §3.11 (V2, V3). Why no revert and no earlier pull request: a revert of #379 puts the three roads back on `accept-new` and refuses a storage path with a space again, so `main` would be worse; and on no road does this rule connect where E1's base refused (a double quote: `ssh` starts and refuses every host; one apostrophe: `invalid quotes`, the call ends; a pair: the bare word names another file, which E1's base also named as the person's file on the agent's exec, beside the system-wide files). What is false on `main` meanwhile is a sentence (C for the double quote) and the docblock; nothing of it is released |
| the grouped import lines of `agentCommands.ts` (E1.S2, §3.6), in PR #379, squash f3e9887d | main | fits | kept |
| E1.S2 code and tests, the cornerstone: `personPin.ts`, the two guards of `writtenKey.ts`, sentences A and B, `personPin.test.ts`, `personRoadsPin.test.ts`, `writtenKey.test.ts`, in PR #379, squash f3e9887d | main | fits | kept: the one value, ready or refused, is where E2's two refusals (the path, §3.11; the client, §3.10) arrive, from the same pin writer and before it writes, so no road gains a branch (§3.6) |
| E1.S3, the roads: the four argv calls name `knownHostsFile` (`sweepDeadSockets` with its parameter), `refusedHostKeySentence` (the words of sentence C), the two branches with the bridge's message, `personRoadsHostKey.test.ts`, in PR #379, squash f3e9887d | main | fits | kept: the words of sentence C and the bridge's message stay (§3.5, §3.12); in E2's pull request the two branches ask E2's one pure function in place of `hostKeyRefused` and keep their size |
| E1.S3, the condition of sentence C: `hostKeyRefused` (`hostKeyPin.ts:214-216`), the verification line anywhere in the stderr of a pinned call, and its docblock, in PR #379, squash f3e9887d | main | cut | corrected in a new pull request, and that pull request is E2's (R4; tests 24, 25), before any release; not reverted. It contradicts decision 10 and §3.12 (V4): sentence C then names a cause that the call did not see (a hop's refused key, a remote text, the `/dev/null` of the row above). Why no revert: without it a refused key is told as "did not answer the probe" on the install and as nothing on the bridge, which P3 forbids; and sentence C's advice cannot end in an unchecked connection (§3.5, *Sentence C against P2*), so the wrong cause does not weaken the pin meanwhile. The quiet case (V5) is a miss, not a contradiction: E2's `LogLevel=ERROR` closes it |
| E1.S4 the smoke on real input: `itestPinnedRoads.cjs` (section 10 of `ssh-agent-itest.cjs`) with its four repairs, the exports lines of `itestSshd.cjs` and of `itestNoSharing.cjs`, in PR #379, squash f3e9887d | main | fits | kept: it passed in CI on the merge commit (`ci · extension`, run 44362280657, both legs); E2 runs it again on the changed words (test 27), and its leg 2 then needs the `Offending` line of the real client; E3 extends the rig |
| E1's module documents: `research/module_extension.md` (B10, the bridge's key file, the table of secrets, Rule C) and `research/module_tests.md`, in PR #379, squash f3e9887d | main | fits | kept: they describe `main` as it is, the `/dev/null` and the match included (`module_extension.md`, B10); E2's pull request updates them with the code (§6) |
| E1's entry of `src_vs_code/CHANGELOG.md` under `[Unreleased]`, in PR #379, squash f3e9887d | main | cut | corrected in a new pull request, and that pull request is E2's (R5), before any release. It contradicts decision 11 (V6): the heading, "a saved host key is the only key a call without a terminal accepts", and "gets the saved key as its ONLY known-hosts file" claim more than `main` holds (C3, the two sources that a config turns on, the path rule of the rows above). It is published by the first extension release from `main`, not by a merge, so it can wait for E2 only while no such release is cut: see the note below the table |
| the other side of the boundaries: G1 of N16's §5 (`research/PLAN_person_roads_forget_key.md`), the pointer in §8 of `todo/PLAN_remote_bridge_scoped.md`, the rows of `todo/README.md`, in PR #379, squash f3e9887d | main | fits | kept; this revision updated the plan's own row, and the judge's commit the five rows of E1 |
| change 1.2 and the stop, bcaafce2 | pushed, unmerged | fits | kept: entry 1.2 and the stop stay (the ledger is append only); it goes to `main` with the re-review's pull request |
| the revision of the whole plan for epoch 2, 5e775a7c | local, never pushed | fits | kept: it is step 4 of the re-review, the baseline of epoch 2 and no entry; pushed with this branch for the re-review |

  (The verdicts are the Opus judge's, 2026-11-18, read against this revision and the code at `f3e9887d`. Three merged
  parts contradict the revised plan and are cut: the rule of the path with its `/dev/null` (decision 9), the condition of
  sentence C (decision 10) and the CHANGELOG's guarantee (decision 11). Each is corrected in a new pull request, and that
  pull request is E2's (R2-R5); none is reverted, because a revert of #379 makes `main` worse than E1 does, and none of
  the three makes a pinned call connect where E1's base refused. Everything else fits and is kept. No other pull request
  is owed before E2.)
  (What this needs meanwhile is a hold on releases, decision 12 applied to `main`: no extension release from `main` until
  E3 has passed. A release from `main` ships E1 with the three cut parts and this CHANGELOG entry. Read 2026-11-18: the
  release pull request that release-please keeps open for the extension (#383, 1.23.0) lists #379, so merging it is such
  a release, and under the stop it is also a merge that carries this plan's work. If an extension release is wanted
  before E3, E1 is first taken out of `main` by a revert in its own pull request, with the owner's word; that would be a
  plan change.)
  (The consult for the re-review is `97eb6bb5`: keep the measurements as evidence, but put the known violations of the
  plan's own contract into a small build epic before the final measurements and the release. The cadence consult
  `594a6709` is the list of rows that the old measurements lacked. The question consultants, `274c6e9d`, both
  answers: epoch 2 is a build epic of the known repairs and then the measurement epic as the release gate; the
  re-review replaces the old split and does not append an epic to it; every other candidate gets a written
  disposition before the release. Checked for this revision on 2026-11-18, OpenSSH 10.2p1: §1.1, §3.10-§3.12.)
  (The whole plan below is revised against that. What the revision changes is the baseline of epoch 2 and is no
  entry. The re-review passed on 2026-11-18: the coai document round on this file, `proceed`, three findings on E3's
  rows M11 and the release condition accepted and folded in before approval.)

> Epoch 2 · approved 2026-11-18 · by reviewers · state: closed

- 2.1 · 2026-11-18 · reviewer · scope — §3.11's refused kinds of a storage path grow from six to eight: a tilde at the start and a backslash at the end are refused too (measured by the E2.S2 spec author with `ssh -G` on OpenSSH 10.2p1: a leading tilde is expanded and a trailing backslash escapes the closing quote, so neither names the intended file). Recorded in the E2.S2 spec; tests hold them as pure cases. Also from the spec work, not changes: the kept answer of `ssh -V` is the newer-client answer only (consult 85d3babf, both: a kept older answer goes stale in the unsafe direction), which is §3.7's "only a good answer is kept"; and for *Run with Secrets* the refusal stands in its launch after Connect's options made the pin file, as §3.10 lets the spec name the place.
- 2.2 · 2026-11-19 · reviewer · dod — E3's M4 cannot pass as written: it asks that an unusable pin and a failed pin write "start nothing" (0 client starts), but since E2.S1/E2.S2 the call asks `ssh -V` before it knows the pin is unusable (`pinOfCall.ts` ~:60; test P15 expects that question), so a client start always happens there; and a warm cache would hide it, so row order decides the result. Raised by the cadence consultant (`dbe12934`) before E3's build; checked by reading. The same consult also found that M5 (g) runs the remote-output case with exit 255, not C19's successful command; that M11 (c) does not measure C20's ten-second wait; that C19's note "nothing is connected" is false (authentication and the remote command already ran); and that the local sshd recipe edits a scratch copy, which E3's final-commit evidence must reconcile — these go to the re-review, not to separate entries.
  (This second change stopped the plan for re-review, 2026-11-19.)

### Re-review for epoch 3

Narrowed: yes — the question consultants (`de8bc542`, both answers) read the M4/M9 change as a smaller release gate: a cold refusal that starts `ssh -V` failed the written row and now passes, and the protected property being kept does not offset a weaker acceptance condition (the precedent of the plan-change-control plan's own epoch 3). The owner approves epoch 3 first. Otherwise the scope grows: C19 becomes a build story of E3 (so E3 no longer "builds no behaviour"), the launch instrument of the real runs becomes a story of E3, M5 gains the run that ends with 0, M11 the client that never answers, M12 goes from four path shapes to all eight kinds of entry 2.1, and M7 gains one shape; M4 and M9 count connection starts and authentication attempts in both states of the asker in place of starts of the client, a number that §3.10 as approved for epoch 2 made unreachable (the third note below the table says why this is read as no smaller gate)

| Work | Where | Verdict | Action |
|---|---|---|---|
| the plan documents inside PR #379 (the plan as first written, the boundary with G2, the approval with P1-P4 and the split, the revision after G2 with change 1.1, the review repairs, the candidates C11-C17), squash f3e9887d | main | fits | kept, as in the re-review for epoch 2: the record of epoch 1; their text is rewritten forward by the revisions for epoch 2 (5e775a7c) and epoch 3 (4d08120e), which reach `main` with E2's pull request as the judge's note below the table says it is to be carried |
| E1's stories document and the four specs E1.S1-E1.S4, in PR #379, squash f3e9887d | main | fits | kept as the record of what E1 built; item 1 of the stories document (the local `sshd`, run from a scratch copy with three edits) stays as the record of how E1 and E2 ran, and no row of E3 runs from it (decision 16): E3.S2's committed launcher replaces the recipe |
| E1.S1, the one function: `hostKeyWords` in `hostKeyPin.ts`, called by both argv builders (`sshBridge.ts`, `execHostKeyWords` of `sshExecCommand.ts`), its three pairs, white space in double quotes, `hostKeyWords.test.ts`, `pinnedArgv.ts`, the one changed expectation of `sshExecCommand.test.ts`, in PR #379, squash f3e9887d | main | fits | kept: the one road in that §3.9 asks for; E2.S2 added its pairs and gave it the checked pin as its parameter on the branch, and epoch 3 changes no word of an argv (C19 is a sentence, §4) |
| E1.S1, the rule of the path inside `oneFileWord`: an apostrophe written bare, a double quote answered with `NO_KEY_FILE`, `/dev/null`, and its docblock, in PR #379, squash f3e9887d | main | cut | corrected in a new pull request, and that pull request is E2's (R2, R3: c20be822, 581d96c0; read at 22caab8b: `NO_KEY_FILE` is gone and no word names `/dev/null` as a known-hosts file), before any release; not reverted, for the reasons of the re-review for epoch 2; release-please #383 stays held |
| the grouped import lines of `agentCommands.ts` (E1.S2, §3.6), in PR #379, squash f3e9887d | main | fits | kept |
| E1.S2 code and tests, the cornerstone: `personPin.ts`, the two guards of `writtenKey.ts`, sentences A and B, `personPin.test.ts`, `personRoadsPin.test.ts`, `writtenKey.test.ts`, in PR #379, squash f3e9887d | main | fits | kept: the one value, ready or refused, is where E2's refusals arrive (`writePersonPin` hands `decidePinOfCall`'s answer, `personPin.ts:65-71`). Read at 22caab8b for a connection before an unusable pin is found: on each road the guard decides the pin before the road's callback builds any argv (`withWrittenKey`, `withWrittenKeyUntilExit`; `agentCommands.ts:194`, `:273`, `:429`), and the socket check runs only after a bridge was started (`:468`); the token that the bridge mints first is C9 (§7) and no connection. Sentence A's "nothing was sent to that host" stays true under decision 15 |
| E1.S3, the roads: the four argv calls name `knownHostsFile` (`sweepDeadSockets` with its parameter), `refusedHostKeySentence`, the two branches with the bridge's message, `personRoadsHostKey.test.ts`, in PR #379, squash f3e9887d | main | fits | kept; E3.S1 hands the run's exit code to `hostKeyTold` on the two lines that ask it (`agentCommands.ts:216`, the runner's `outcome.exitCode`; `:283`, `facts.exitCode`, which `runRemote` already answers as -1 for a run with no code, `:350`), so the branches keep their size (§3.6) |
| E1.S3, the condition of sentence C: `hostKeyRefused`, the verification line anywhere in the stderr of a pinned call, and its docblock, in PR #379, squash f3e9887d | main | cut | corrected in a new pull request, and that pull request is E2's (R4: a686badd; read at 22caab8b: `hostKeyRefused` is gone), before any release; not reverted. E2's correction is itself one condition short of the revised §3.12 (the row of E2.S3's condition below), so `main` lacks part 4 from E2's merge until E3's; that gap fails closed |
| E1.S4 the smoke on real input: `itestPinnedRoads.cjs` (section 10 of `ssh-agent-itest.cjs`) with its four repairs, the exports lines of `itestSshd.cjs` and of `itestNoSharing.cjs`, in PR #379, squash f3e9887d | main | fits | kept; E2.S4 ran it on the changed words (805aed3b), and it already counts the question `ssh -V` apart from the connections, as decision 15 asks; E3.S2 makes its serving launcher the committed instrument of every row |
| E1's module documents: `research/module_extension.md` (B10, the bridge's key file, the table of secrets, Rule C) and `research/module_tests.md`, in PR #379, squash f3e9887d | main | fits | kept: they describe `main` as it is. Not as proposed ("E2's commits bring them up to the branch"): two of their sentences become false when E2 merges, and E2's documents did not change them. B10's "On a refusal no `ssh` starts" (`module_extension.md`) and "there and unusable, or not writable: no `ssh` starts" (`module_tests.md`): since E2.S2 the question `ssh -V` can start first. Corrected forward on E3's branch with W7 (§6), before the whole set runs: no connection starts, nothing is sent |
| E1's entry of `src_vs_code/CHANGELOG.md` under `[Unreleased]`, in PR #379, squash f3e9887d | main | cut | corrected in a new pull request, and that pull request is E2's (R5: d0ae4b3c and the CHANGELOG edits of E2's code gate), before any release. E2's replacement keeps or adds three sentences that the revised plan makes false (the row of E2.S4's three sentences below), corrected forward in E3. The entry is published only by a release: #383 stays held, and no extension release from `main` comes before E3 has passed (decision 12) |
| the other side of the boundaries: G1 of N16's §5 (`research/PLAN_person_roads_forget_key.md`), the pointer in §8 of `todo/PLAN_remote_bridge_scoped.md`, the rows of `todo/README.md`, in PR #379, squash f3e9887d | main | fits | kept; the revision updated the plan's own row and the row of E2's stories document, and the judge's commit the rows and status lines of the four specs of E2 |
| the re-review of epoch 1 on the branch: change 1.2 and the stop (bcaafce2), the revision for epoch 2 (5e775a7c), the judge's verdicts (e1bd2ebb), the document round folded in and epoch 2 approved (96f6c85f) | pushed, unmerged | fits | kept: the ledger is append only, and the baseline of epoch 2 is what E2 was built on; all four are in the history of 22caab8b, so they reach `main` with E2's pull request |
| E2's stories document (cbeae5b8), the specs of E2.S1 and E2.S2 (9e4f58d5) with their README rows (473dd1b0), and change 2.1 (ab3dc23d) | pushed, unmerged | fits | kept; the eight kinds of entry 2.1 are what M12 now covers. The status lines of the four specs of E2 still said "not built" (E2.S1-E2.S3) or named no cut part; the judge's commit repairs them, status only |
| E2.S1, the client's answer: `pinClient.ts` (`pinClientOf`, `pinClientAsker`, `windowPinClient`), `versionTokenOf` shared from `bridgedSshClient.ts`, `pinClient.test.ts`, its rows of `module_tests.md`, 79652693 | pushed, unmerged | fits | kept: the asker keeps the answer `knows` alone, per program word, folder and `PATH` (`pinClient.ts:84-96`), which is what the cold and warm states of M4, M9 and M11 count on (decision 15) |
| E2.S2, the cornerstone: its tests watched RED (c20be822); the complete words of a pinned call, the rule of the path with its eight kinds, `CheckedPin`, `pinOfCall.ts`, sentences E and F, the two refusals on the agent's exec and on *Run with Secrets* (581d96c0); its documents (70676a95); the review's fixes (6f582b59); the real-`sshd` scripts hand the builders a checked pin, with the scan `itestCallers.test.ts` (ff50c987) | pushed, unmerged | fits | kept. Read at 22caab8b against the revised M4, M9 and M12: `decidePinOfCall` (`pinOfCall.ts:51-62`) asks whether a saved key is there, then the rule of the path of the whole pathname, then the client, and only then writes, and the write alone finds a saved key unusable or throws. So a refused path starts nothing of any kind (M12; M14 d, through `localPin`, `sshUseActions.ts:261`), and an unusable key or a failed write starts the one question at most and no connection (M4, M9); no argv that names a destination is built before that answer. Not as proposed ("epoch 3 changes nothing of it"): its code stays, but one docblock is false by the measure of W7, `localLaunch`'s "sentence E or F: nothing is written and no `ssh` starts" (`sshUseActions.ts:316`), and so are the same words in `module_extension.md` for *Run with Secrets* (70676a95): for sentence F the question did start. Corrected forward on E3's branch with W7, before the whole set runs (a comment of `src_vs_code/src` changes the tree that §9, step 11 compares) |
| E2.S3 as built: its spec (76bd8bed) and README row (4bd29cbd); `hostKeyTold` in place of `hostKeyRefused`, sentence C on the evidence of the call's own pin file, sentence D otherwise, `hostKeyTold.test.ts`, the two branches of `agentCommands.ts` (a686badd); its documents (a375c3f2); the review's nits (35dd6dac) | pushed, unmerged | fits | kept: parts 1-3 of §3.12 as revised; the next row is the one part of it that the revision contradicts |
| E2.S3, the condition that asks the text alone: `hostKeyTold(pin, stderr, name)` takes no exit code, so a run that ended with 0 and whose remote side printed the verification line is told sentence D, the install stops before its question and the socket check says "could not be checked"; and its docblock sentence "A remote command that wrote the verification line reads as sentence D whatever the run's exit code was" (a686badd) | pushed, unmerged | cut | fix forward by E3.S1 on E3's branch (§3.12, part 4; decision 14): the exit code as a required parameter, nothing for 0, the docblock rewritten; no revert commit and no fix on E2's branch, never a rewrite of history. The proposal's action stands; its verdict does not: the part contradicts the revised §3.12, so it is cut, not kept. Why forward and on E3's branch: a revert of a686badd brings back `hostKeyRefused`, the condition cut in epoch 2 (sentence C for a remote text); a commit on E2's branch opens its code round again, which the question consultants advised against (`8d07d6a6`); and meanwhile it fails closed: the run was already accepted with the pin, sentence D names no host as the cause, tells the person not to replace a key and names no road to reconnect, and the road stops rather than goes on. It reaches `main` with E2's pull request and is corrected there by E3's, before any release |
| E2.S4 as built: its spec (71a430e9) and its links (5f8827f6, 01aa18d7); section 10 on the changed words (805aed3b); the CHANGELOG entry that claims only what holds (d0ae4b3c), with the edits of E2's code gate | pushed, unmerged | fits | kept, apart from the three sentences of the next row. The record in `module_tests.md` that the local run set `SshdSessionPath` and `SshdAuthPath` in a scratch copy stays as the record of that run; E3.S2 ends the recipe |
| E2.S4, three sentences of the CHANGELOG entry that the revised plan makes false: (1) "No `ssh` starts, nothing is sent to that host" for a saved host key that cannot be used (E1's words, kept by d0ae4b3c after E2.S2 put the question first: W7); (2) "Nothing starts then", for the two refusals of the agent's `ssh:exec` and *Run with Secrets* (d0ae4b3c): for an `ssh` whose version cannot be read the question did start; (3) "a remote command that prints that line" among the cases of the second message (a375c3f2), which holds only when the run did not end with 0 (C19) | pushed, unmerged | cut | fix forward on E3's branch, never a rewrite: (3) with E3.S1's code (§6); (1) and (2) with W7, worded as M4 and M11 (c) count (no connection starts, nothing is sent), written before the whole set runs so that the tree E3 measures is the tree released, and checked against §10 after it. The proposal named (1) and (3); (2) is the judge's, of the same kind as W7. The entry ships only with a release, and none comes before E3 |
| the plan repairs made while E2 was built: the links to the specs, what E2.S3's measurements settle, candidate C18 (ec06139e) | pushed, unmerged | fits | kept |
| the disposition of C19 in the same commit: "not built; … not blocking: the person is told a true thing about the line, and nothing is connected" (ec06139e) | pushed, unmerged | cut | fixed forward by the revision (4d08120e: C19 taken into E3 as E3.S1, the disposition withdrawn, W2), on E3's branch, never a rewrite. Its two reasons are false: the sentence says the connection "ended with" the line, and the login and the remote command had run. Not as proposed ("kept"): a disposition that the revision withdraws is cut. It must not reach `main` without its correction: E2's pull request carries the re-review's commits (the judge's note below the table) |
| E2's code gate, its fixes: a disposed bridge manager spawns nothing, the changelog claims what was asked, sentences E and F name a remedy (516afd05); the rig reads `ssh -V` through the product's bounded asker, and the scan reads each script whole (4474eb07); sentences D and C no longer send the person to Connect SSH (ffc897ce, e38d9331); the two sharing words in `module_tests.md` (1cef821e); the plan's §3.5 and sentence D's contract say so (0f5e07ea) | pushed, unmerged | fits | kept; none of them contradicts the revised plan, and this re-review does not open E2's gate again (the question consultants, `8d07d6a6`) |
| the status "E2 built and gated" and candidate C20 (22caab8b) | pushed, unmerged | fits | kept; C20's disposition is rewritten forward by the revision (decided by M11 d, with M1's number beside it), and the plan text reaches `main` as the judge's note says |
| change 2.2 and the stop, 6d10c4f5 | pushed, unmerged | fits | kept: entry 2.2 and the stop stay (the ledger is append only); it reaches `main` with E2's pull request (the judge's note) |
| the revision of the whole plan for epoch 3, 4d08120e | pushed, unmerged | fits | kept: step 4 of the re-review, the baseline of epoch 3 and no entry; it reaches `main` with E2's pull request (the judge's note). The judge adds to it, not against it: §6 names W7 in the CHANGELOG alone, and the other places where E2 made "no `ssh` starts" false (the rows of E1's module documents, of E2.S2 and of E2.S4's three sentences above) are corrected with W7 |
| `Narrowed: yes` for epoch 3 (consult `de8bc542`), 85ff6600 | pushed, unmerged | fits | kept: the line stands, the author's argument stays below as written, and the owner approves epoch 3 first; its line says `by owner` (step 8) |

  (The verdicts are the Opus judge's, 2026-11-19, read against the revision (4d08120e, 85ff6600) and the code at 22caab8b, with `main` at f3e9887d for the merged rows. Three rows were split so that a cut part stands alone (E2.S3, E2.S4, ec06139e), and two rows were added (4d08120e, 85ff6600). Cut and merged: the same three parts of E1 as in epoch 2, each corrected by E2's pull request, none reverted. Cut and pushed, unmerged, each fixed forward on E3's branch and never by a rewrite: E2.S3's condition that asks the text alone (E3.S1), three sentences of E2's CHANGELOG entry (E3.S1 and W7), and C19's withdrawn disposition (already by 4d08120e). Kept although they become false when E2 merges, and corrected forward with W7: two sentences of E1's module documents and one docblock and one paragraph of E2.S2. No done work starts a connection, or an authentication attempt, before an unusable saved key, a failed pin write or a refused path is found: the three roads decide the pin in their guard before any argv, the agent's exec in `localPin` before its argv, and the order of `decidePinOfCall` is the one decision 15 counts. No new pull request is owed before E2's.)
  (What E2's pull request carries, the judge's action for the rows of the plan's text. E3's branch holds, on top of 22caab8b, nothing but the documents of this re-review: 6d10c4f5, 4d08120e, 85ff6600, the judge's commit and, after the owner's word, the line of epoch 3. `fix/g1-e2-measurements` takes them by a fast-forward push (a push that rewrites nothing and forces nothing) before its pull request opens, and before E3.S1 commits anything on E3's branch, so that the push carries no code of E3. Without that, `main` would get this plan as it stands at 22caab8b: epoch 2 open with no stop, M4 as written in epoch 2 and C19's withdrawn disposition, a merged text that contradicts the revised plan and that E3's pull request would have to correct. They are plan text: E2's code round is not opened again for them (§9, step 8).)
  (Where the work stands, read on 2026-11-19 with `git ls-remote`: `fix/g1-e2-measurements` is at 22caab8b on the remote and `fix/g1-e3-release-gate` at 6d10c4f5; no pull request is open for either branch. `main` holds of this plan's work what #379 merged, and nothing else. The 33 commits after f3e9887d on `fix/g1-e3-release-gate` are each the work of exactly one row above; a row's action can name a commit of another row. Read again by the judge, 2026-11-19: `fix/g1-e3-release-gate` at 85ff6600 on the remote, `fix/g1-e2-measurements` still at 22caab8b; `main` at 7ccbcf09 holds of this plan's work what #379 merged and nothing else (#382 and #384 after it are outside the plan). Where the judge split a row, a commit of it is named by both halves: the half that is cut names the part.)
  (The revision's author first wrote `Narrowed: no` and argued it below, kept as written; the question consultants `de8bc542` read it as narrowed, so the line says `Narrowed: yes`. The owner chooses between this replacement and the other way named at the end of this note. Why the author read no narrowing although one number of M4 and of M9 gets smaller. Both rows said "0 starts of the client" for a saved host key that cannot be used and for a pin write that fails. They now say: 0 connection starts and 0 authentication attempts, and of the client's starts exactly one in a cold window, the question `ssh -V`, and none in a warm one. That is read here as a correction and not as a smaller gate, for three reasons. First, §3.10 as approved for epoch 2 puts the question where the pin of the call is decided, before the write that finds a saved key unusable, so no code that keeps §3.10 could meet the old number. Second, what the person is promised, that nothing is sent to that host, is measured more closely than before: connections and authentication attempts, in both states of the asker. Third, nothing else of the Definition of Done, the merge conditions or the release got smaller. One sentence of the plan does get weaker: "no `ssh` starts" for such a saved key (§3.1, §3.5, and the CHANGELOG says it too) becomes "no connection starts". The other way to settle entry 2.2, to read the saved key before the question so that the old number holds, changes E2's built order and is not what the consult advised. It was read so: the line above says `Narrowed: yes`, and the owner approves epoch 3 first.)
  (The consult for the re-review is `22147fce`: E3 as written counts starts of a process where it means connections or commands that succeeded; M4 and M9 are revised together; C19 is built now, as a small first story of E3; M11 gains the client that never answers; the launch instrument is committed before anything is measured; M12 is checked against the complete pathname of the pin file; and an instrument that is not known to work does not make the gate smaller. The cadence consult `dbe12934` raised entry 2.2 and three more points: C19's old note is false, M11 (c) does not measure C20, and a local recipe on a scratch copy is no evidence about the final commit. The question consultants, `8d07d6a6`, both answers: C19 is a small first story of E3, and this re-review revises E3's scope ("builds no behaviour"), §3.12 and C19's disposition together; E2's gate is not opened again; no fourth epic. Checked for this revision on 2026-11-19 by reading the code at `22caab8b`: §1.2.)
  (The epics did not change in number or in order, so nothing is split again: three epics, a quota of two cornerstones, both marked. What changed inside E3 is in `## Epics`.)
  (The whole plan below is revised against that. What the revision changes is the baseline of epoch 3 and is no entry. The line of epoch 3 is written when the re-review has passed.)

> Epoch 3 · approved 2026-11-23 · by owner · state: closed

- 3.1 · 2026-11-23 · owner · merge-conditions — the owner chose to release from `main` once E2's pull request (#388) has merged, BEFORE E3: the release ships E1 and E2 without the real-road runs M1-M14 (decision 12 and §9 step 11 do not hold for this one release). The CHANGELOG of this release says what is not measured (an `ssh` older than 8.5, the install to its end on a real host, a login on Windows, DNS and a `KnownHostsCommand` on the roads) and what is not yet right (C19: a remote command that prints the verification line and ends with 0 stops the install with sentence D; it fails closed); its "no `ssh` starts" sentences were corrected to "no connection starts" in the same pull request (the judge's row 19, moved forward from E3's branch). E3 stays as revised and is the gate of G1's next release and of every claim that a row is measured.
- 3.2 · 2026-11-25 · agent · dod — M11 (b) cannot run as written (decision 18). It asks a real client older than 8.5 to show M7's collision for (c): the bare word `x'y'z` reads the other file `xyz`, and K2 accepts M7's control with E1's words through it. A client older than 8.5 keeps the apostrophes of a bare word: the lead measured `ssh -G -F /dev/null -o "UserKnownHostsFile=/tmp/kh/x'y'z"`, which gives `userknownhostsfile /tmp/kh/x'y'z` on OpenSSH 8.4p1 (the client of probe P3) and `/tmp/kh/xyz` on 10.2p1 (2026-11-25, `research/module_tests.md`). So on an older client there is no collision, the bare word names the pin file itself, and M7's control cannot be accepted. The pass criterion of M11 (b) for the collision is rewritten by the re-review.
  (Found by the E3.S9 spec writer, read in the source, question Q1 of the E3.S9 spec; measured by the lead. Consultants could not be asked: coai refused every call, its data folder was not found. The owner chose to record it and stop, 2026-11-25.)
  (This second change stopped the plan for re-review, 2026-11-25. In flight at the stop: E3.S8 built and proven, `ab375f29` and `3d3eab44`, not reviewed; the E3.S9 spec written, not built.)

### Re-review for epoch 4

Narrowed: yes — the consultant of the re-review (`3b6c7351`) read the revised M11 (b) as a smaller release gate: the collision of a pair of apostrophes cannot be shown on OpenSSH 8.4p1, so a run on that client that the written row rejects, because K2 does not accept that control through the colliding file, now passes that part; the older parser keeps a collision pair of its own in the row, with a bare equals sign, which the lead took in after the judge's review; the owner approves epoch 4 first

| Work | Where | Verdict | Action |
|---|---|---|---|
| E2's pull request #388, squash 4799f9d7: E2 as merged, with the review fixes that came after `22caab8b` (an equals sign in the pin file's path is written in double quotes; the asker replaces its map; the `-G` tests of the unit suite that skip on a client older than 8.5), and with it the documents of the re-review for epoch 3, the line of epoch 3 and entry 3.1 | main | fits | kept: epoch 4 changes no word of the product (§3), and the equals sign in double quotes is §3.11 as revised (both parsers read the quoted word as the one file); the documents stay, the ledger is append only. Follow-up, on E3's branch and never by a revert: the unit test G5 (`src_vs_code/src/test/pinWords.test.ts:324`, with the label of its row at `:208`) asserts the answer of the newer parser against whatever `ssh` is first on `PATH`; test 34 gives it a fixed expectation per parser (E3.S9), and the change reaches `main` with E3's pull request. Until then `main` is not red by it: the client of CI is from 8.7 on (the checks of #388 passed) |
| the release 1.23.0 (#383, 95e11116, the tag `extension-v1.23.0`), which shipped E1 and E2 before E3 (entry 3.1), and the CHANGELOG heading `[1.23.0]` over the shipped entry (#389, 49683a59) | main | fits | kept: decision 21 records it as the one release exception, and a shipped release is not taken back. Its CHANGELOG claims nothing that the revision makes false: a path with an apostrophe or an equals sign is said to be written in double quotes, which both parsers read as the one file, and "an `ssh` older than 8.5" is listed as not measured. Follow-up: E3.S10 writes the limits of decision 22 into the new entry under `[Unreleased]`, never into the shipped text (§6); the promotion records 1.23.0 as a deviation (§8) |
| the stories document of E3 with the lead's answers to its five questions (753b3a48), and the plan round's two findings on it (e1c7d7cb) | pushed, unmerged | fits | kept: its E3.S9 and E3.S10 are rewritten forward by the revision (fbf073fe, *Settled by the re-review for epoch 4*), and its ten stories and their order stay; its answer to Q1 (no leg for an equals sign) stands, and C21 records the leg on the older parser that it leaves out |
| the two merges of `main` into E3's branch: 8dabad08 (1.23.0 and E2's squash) and d94c307b (#389) | pushed, unmerged | fits | kept: merges, never a rebase (decision 17); E3.S10 takes `main` again the same way if it has moved |
| E3.S1, C19: its spec (abdeca8b); `hostKeyTold` takes the run's exit code and answers nothing for 0, from both callers, tests 28-32 (a445af56); its documents, with the new CHANGELOG entry under `[Unreleased]` (f60906b5); the docblock of `localLaunch`, the last place of W7 (65a8cb3b); the review (5b8078c8) | pushed, unmerged | fits | kept: C19 stays the one behaviour of the product that E3 builds (§3, *Epoch 4 changes nothing of the product*); nothing of it depends on a parser |
| E3.S2, the launch instrument: its spec (55d6a828, 4063c56b); one place names the `sshd` of the real runs and writes every `sshd` config, test 33 (874b310b); leg 0, a master that outlives the stop of its listener, and the record of identities (b26dcf81); its documents (e1f6c891); the review (bf11b088) | pushed, unmerged | fits | kept: the record of identities names the client's version, which decision 19 needs beside M7's collision; section 10 writes it in the same run as the rows (`itestPinnedRoads.cjs:537`) |
| E3.S3, the feasibility: its brief (6b38d5e1, 44987ac2); the five probes of batch A (1d67a080, 34c3f8b0); probe P3, the client older than 8.5, with the check of a quoted and of a bare equals sign (cd5088d9); probe P2, the resolver that the run owns (d9629402, e6cb6532); what batch B showed (9e417465); the review, with the notes L2-L5 for the row stories (a07e4cac) | pushed, unmerged | fits | kept: probe P3 with its checks P3.4 and P3.5 is the measured fact behind §3.11 *Two parsers*, the older control of test 34 and C21; it did not ask what the older client does with a bare pair of apostrophes and claims nothing about it (decision 18 as revised) |
| E3.S4, the common rig, M1 and M6: its spec (152696ae); the rig with the real resolve, its own proof, the legs of M1 and M6 (07a22de1, 0f8081b7, 3b121371); M6.11 judges a LIVE forward, the owner's reading (1ad5736b, 62cfb688); the review fixes (b061a030, 464968aa, 4862ac47, 5a4b1820, 1a015583) and their record (dde170af) | pushed, unmerged | fits | kept: the rig asks its own client (OpenSSH 10.2p1) and holds no expectation about a bare word; M6.11 is M6 as revised (no LIVE forward). M1's checks expect a client that knows `KnownHostsCommand`; M11 (b) turns that assertion into its opposite for the older client, as the row says, and that is E3.S9's work |
| E3.S5, M4 and M9: its spec (in 62cfb688); the legs, cold and warm, and Connect's repair (edda3461, a583a64d); their record (dde170af); the review (c9d0279e) and its record, with the owner's reading of HC1 of E3.S4 (be47dd81) | pushed, unmerged | fits | kept: M4 and M9 ask no bare word, and epoch 4 changes none of their numbers |
| E3.S6, M2, M3 and M8: its spec with the answers A1 (the owner: M2 (a) is the user-file slot) and A2, A3 (the lead) (ba548a40, af49f35a); the legs (3c2ebef2) and their record (b67f1c34); the review (62251613); the status commit (6ee2a6a2) | pushed, unmerged | fits | kept: M2 (a) is built as the user-file slot, and `ssh -G` under the leg's config shows it before the roads run (M2.0, `itestRowM2.cjs:19`), which is M2 (a) as revised (decision 22); M3 and M8 ask no bare word |
| E3.S7, M7, M12 and M14: its spec with the lead's answers A1-A3 (8476d2f3); the legs, with M7's collision on OpenSSH 10.2p1 and its witness (27d83a3f) and their record (b657af9c); the review (8cf4b6ea) | pushed, unmerged | fits | kept: the collision legs hold both outcomes of the newer parser, M7.y3 (K2 accepts the control) and M7.x2 (the witness against K1 ends with 255 and the verification line, and K1 logs no new accepted login; `itestRowM7.cjs:128`), which is the witness that the revised row names; the legs read no version of their own, and the record of identities names it (the stories document, item 4). M12's controls (g) and (h) ask the rig's client, which is the row's. Follow-up for E3.S9: the docblocks of `resolvedBare` (`scripts/lib/pathRecord.cjs:88`, "ssh drops them") and of `controlBare` state the newer parser's reading as a fact of `ssh`; when M11 (b) reuses them for its twin they name the parser (test code, no row changes) |
| E3.S8, M5: its spec with the lead's answers A1-A4 (97752998); the eleven legs (ab375f29) and their record (3d3eab44); built before the stop, not reviewed | pushed, unmerged | fits | kept: M5.e0 takes `QUIET` or `SILENT` and prints which one `ssh -G` said (`itestRowM5.cjs:83`), as M5 (e) is revised (Y7); no leg asks a bare word. Follow-up: its Opus review, the first step after the line of epoch 4 (§9, step 9); until then it is built and not reviewed |
| the E3.S9 spec (M10, M11, M13), written before the stop, not answered and not built; its M11 (b) is written against the row of epoch 3 (in 17694426) | pushed, unmerged | cut | fixed forward on E3's branch, never reverted and never a rewrite of history. Its M11 (b) builds M7's two collision legs on the older client with M7's expectations (`m11-m7-c-collision-k1` and `-k2`, its TX1 and MX1), which the revised M11 (b) takes out (the stories document, E3.S9, *What goes*). The revision already marks it as written against the row of epoch 3 (the parent's E3 *Stories*; the stories document, item 8). Opus writes it again at the same path, against the revised M11 (b) and with test 34, after the line of epoch 4 and, as §9, step 9 places a cut, before the Opus review of E3.S8; no code of E3.S9 comes before it. What does not touch M11 (b) (M10, M11 (a), (c), (d), M13, Q3-Q7) may be carried over |
| change 3.2 and the stop, with the lead's measurement of the bare word on OpenSSH 8.4p1 in `research/module_tests.md` (17694426) | pushed, unmerged | fits | kept: entry 3.2 and the stop stay (the ledger is append only); its "older than 8.5" is read through §1.3 (Y4) and the note below, never edited; the measurement is the fact of Y1 |
| the revision of the whole plan for epoch 4: this record, §1.3, decisions 19-22, the rows as revised, and the stories document's E3.S9 (the commit that adds this record) | pushed, unmerged (fbf073fe) | fits | kept: step 4 of the re-review, the baseline of epoch 4 and no entry, with the fixes of the lead's Opus review of it that are accepted; it reaches `main` with E3's pull request |

  (The verdicts are the Opus judge's, 2026-11-25, read against the revision (fbf073fe) and the code at fbf073fe, which is the code of 17694426 (fbf073fe changes only `todo/`), with `main` at ac5df8ad for the two merged rows. One row is cut: the E3.S9 spec, for its M11 (b); it is fixed forward by its rewrite, and it needs no revert and no new pull request. Nothing merged is cut. No built leg of M1-M9, M12 or M14, and no part of the rig, expects the newer parser where the revised plan forbids it: the only expectations about a bare word are M7's, which the revised M7 gives to a client from 8.7 on, and G5's, which test 34 changes. The follow-ups: G5 and test 34 (E3.S9); the docblocks of `resolvedBare` and `controlBare` (E3.S9); the Opus review of E3.S8; the limits of decision 22 in §10 and in the new CHANGELOG entry (E3.S10).)

  (Superseded by the judge's note above; kept as it was written before the verdicts: The Verdict and the Action of every row are open on purpose. An Opus judge fills them after this revision, read against the revised plan and the code at `17694426`: step 5 of the full stop. Nothing is kept or cut before that, and the lead writes the commit of the last row when it has one.)
  (Where the work stands, read on 2026-11-25 with `git ls-remote`: `fix/g1-e3-release-gate` is at 17694426 on the remote, so every commit of the rows above that is not on `main` is pushed and unmerged; no pull request is open for the branch. `main` is at ac5df8ad. E3's branch last took `main` at 49683a59 (the merge d94c307b); the one commit of `main` after that, #390, bumps the shared rules. The 54 commits from 8dabad08 to 17694426 on the branch's first-parent line are each the work of one row; where one commit holds the documents of two stories (62cfb688, dde170af), both rows name it. The tree of `src_vs_code/src` outside the tests differs from the release 1.23.0 in three files, all E3.S1's (`hostKeyPin.ts`, `commands/agentCommands.ts`, `sshUseActions.ts`).)
  (What got weaker, each place and why. FIRST, M11 (b), and it is the narrowing. The row of epoch 3 asked the older client to show M7's collision: K2 accepts the control with E1's words through the colliding file. A client before 8.7 keeps the apostrophes of a bare word, so on it the bare word names the intended file and there is no other file to read. The row now asks both bare-word outcomes the other way round: K1 accepts the witness through the intended file, and K2 refuses the control although the twin holds K2's line. A run on 8.4p1 that the written row rejects now passes. On that client the row shows that the hole is absent, not that a repair closes it. That is so for the pair of apostrophes, and it stays given up. After the judge's review the lead took the older parser's own collision into the same row: a bare equals sign, which 8.4p1 splits into two names (probe P3.5). With it K2 does accept a control with E1's bare words on the older client, through a twin at the first name of the split, and K2 refuses the roads, whose word is in double quotes. So the row shows a hole and its repair on the older client too, with the kind that this parser has, and it records that the newer parser has no collision of that kind. SECOND, test 21 and the unit test G5: the control "the bare pair of apostrophes resolves another path" holds on a client from 8.7 on only; before 8.7 the fixed expectation is the opposite. The test stays able to fail on the older parser through another measured control, a bare equals sign (probe P3.5 of E3.S3). THIRD, the rule of admission of §3.11: "the collision measurement of E3's M7 for it, on every such client" cannot be met on a client before 8.7; it is now a measurement per parser with a fixed expectation, with the evidence that the intended file alone supplies trust. FOURTH, M2 (a): it proves the user-file slot that the handed config names and claims nothing about the compiled-in default path, where the row said "the file that the client reads as the person's default one" (the owner's reading, 2026-11-24). FIFTH, M6: "no forwarded socket left" is read as no LIVE forward, and the dead socket file that `sshd` leaves is recorded and not judged (the owner's reading, 2026-11-24). SIXTH, decision 12, §8 and §9, step 11 said that no release comes before E3 has passed; 1.23.0 came before it, by entry 3.1. The text now says so. Nothing more is given up by it: G1's next release waits for E3 as before. SEVENTH, test 34 and the refused rows of G5: as E2 built it, G5 asserts that no refused row is read as the one file in both spellings. Test 34 keeps that assertion on the newer parser only; on the older parser it records what the client resolves for each refused kind and asserts nothing. The reason: the assertion warns of a rule that refuses a path that it could always write, it was measured on the newer parser alone, and to refuse more is always allowed, because a refusal fails closed. What is lost is that warning on the older parser; no path that the rule writes loses a check by it, because G4 holds on both parsers.)
  (What did not get weaker. Every other row keeps its last column. M7 keeps its collision on the newer client, and its row now names the witness that E3.S7 built. M11 (b) keeps the product's quoted-path checks, all five shapes (a)-(e) with both legs of M2 (b), the count of the question and the words for an older client, and the logins of an older client stay to be shown in the one run of the whole set. The `KnownHostsCommand` threshold stays 8.5. The other readings of epoch 3 change no number.)
  (The readings of epoch 3 are records, not entries. Several were settled without consultants, because coai refused every call when they were asked (its data folder was not found): the owner's (HC1 of E3.S4 was a wrong prediction of a hand check, and no row or instrument changed by it; M2 (a) and M6.11, as above) and the lead's answers in the specs of E3.S6, E3.S7 and E3.S8. Also measured: `ssh -G` prints `LogLevel QUIET` as `loglevel SILENT` (E3.S8). The revision carries each into the text where it belongs (`## Epics`, E3, *How the rows are read*, and the rows M2 and M5); none is counted.)
  (Entry 3.2 names 8.5 because the client of M11 is older than 8.5. The boundary of the tokeniser is 8.7, read in the release notes and in the source; OpenSSH 8.4p1 and 10.2p1 are the two clients measured, with `ssh -G` only. The entry is not edited: the ledger is append only. §1.3 and §3.11 name both boundaries.)
  (The consult for the re-review is `3b6c7351`, closed as solved, and checked by the lead. It settled: on the older client both bare-word outcomes of M7's collision are reversed, with K1's line in the intended file and K2's in the twin, and the K1 leg rules out that the client found neither file; the same premise is in test 21, in the rule of admission of §3.11 and in the unit test G5, and each gets a fixed expectation per parser; decision 12 and §9, step 11 record 1.23.0 as the one exception; M2 (a)'s qualification goes into the release evidence; the re-review is narrowed.)
  (After the verdicts, the lead decided on the judge's review of the revision (PASS WITH FIXES), 2026-11-25: the equals-sign pair goes into M11 (b), on both clients, and C21 keeps only the client of 8.5 or 8.6. The cells of the table and the judge's note stand as the judge wrote them. Where a cell names C21 for the leg on the older parser, read the equals-sign pair of M11 (b); where the note lists the follow-ups of E3.S9, that pair is one more of them.)
  (The epics did not change in number or in order, and E3 keeps its ten stories and their order, so nothing is split again: three epics, a quota of two cornerstones, both marked. E3.S9's scope is revised in the stories document, and its spec is written again before it is built.)
  (The coai round of the re-review, 2026-11-25, by the interim path of `plan-change-control.md` (this branch's plan round had passed): `review_document` of the whole plan at `0757e416`, in two parts because the file is over the reviewers' limit (part 1: the status, the ledger and §1-§3; part 2: the status, the ledger, §4-§9 and the Epics). Part 1: `proceed`, two reviewers answered, one finding (Major): §3.11 asked for M7's collision on every newer client, also for a kind with no collision there; accepted and fixed in §3.11 (a collision control only on a parser whose fixed expectation is a collision). Part 2: `proceed`, two reviewers answered, no finding. The lead's own Opus review is the judge's review above (PASS WITH FIXES, applied). Next: the owner, because the re-review is narrowed.)
  (The whole plan below is revised against that. What the revision changes is the baseline of epoch 4 and is no entry. The line of epoch 4 is written only after the judge, the coai round on the revised plan and the owner's approval.)

> Epoch 4 · approved 2026-11-25 · by owner · state: open

- 4.1 · 2026-11-25 · agent · dod — M13's control of K7 cannot run as written for (c) (decision 18). K7 tells one file from two by a ` ~` after the space: the bare word is split and its second name gives `tilde_expand`. In (c) the folder also holds an apostrophe (`pin o'probe`), and the owner's `ssh.exe` (`OpenSSH_for_Windows_9.5p2`, a tokeniser of 8.7 or later) refuses the bare word with `command-line line 0: invalid quotes` before any tilde step, with or without the twin (3 runs, the same). So (c) reads as (b). The row now asks K7's proof of two files for (a) only; for (b) and (c) the bare word is refused (255, `invalid quotes`); the product's quoted word resolves the one intended path in all three cases, as before. The gate is narrower by the proof of two files for (c); the owner gave the word (decision 18).
  (Found by the E3.S9 coder in M13's proving runs, `6409e7c4`: M13.x4 (c) red, every other M13 check green; the check was left red, not weakened. Consult `1063722520ea496aab168d1b52b808bb` (solved): a change, kind `dod`, the first of epoch 4, trigger 5 of `coai-consultant.md` not fired. The owner chose "record 4.1", 2026-11-25. The first change of the epoch: recorded, the work goes on.)

## 1. Symptom

An SSH entry can hold a pinned host key (`hostKey`, `types.ts:90-96`: "Its presence is what turns
`StrictHostKeyChecking` from `accept-new` … into `yes` against a known_hosts file built from exactly this line"). The
edit form says of it: "Checked on every connection" (`entityFormPage.ts:352`). On three roads of the person that is not
true. They pass no `knownHostsFile`, so every `ssh` they start runs with `StrictHostKeyChecking=accept-new` against the
person's own `~/.ssh/known_hosts` (`sshBridge.ts:183-186`, `sshExecCommand.ts:174-176`), pinned entry or not:

| Road | Where | Its `ssh` runs | The argv call with no `knownHostsFile` |
|---|---|---|---|
| the bridge socket check `verifyBridgeSocket` | `agentCommands.ts:191-245` | two: the sweep (`:185`) and the mode check (`:217`) | `:180` (`sweepDeadSockets`), `:206` |
| *Install creds on host* (`credSshManager.installRemoteCli`) | `:259-329`, `runRemote` `:332-350` | two: the probe (`:282`) and the install (`:314`) | `:338` |
| *Open Remote Bridge…* (`credSshManager.openRemoteBridge`) | `:381-478` | one long-lived `ssh -N -R` (`:452`) | `:437-441` (`buildBridgeArgv`) |

Both argv builders already take the option: `BridgeOptions.knownHostsFile` (`sshBridge.ts:82`, used at `:232`) and
`SshExecOptions.knownHostsFile` (`sshExecCommand.ts:8`). The agent's exec road passes it: `connectionArgvOptions`
(`sshUseActions.ts:218-225`) calls `materializeKnownHosts` (`hostKeyTrust.ts:80-98`), and its `ssh` gets
`StrictHostKeyChecking=yes` and `UserKnownHostsFile=<the pin file>`. Connect does the same (`connectionOptions.ts:70`).

**What it costs.** `accept-new` accepts any key from a host that `~/.ssh/known_hosts` does not list yet. A person who
pinned an entry in CredsForDevs and never used plain `ssh` for that host has no such line. Another machine at that
address is then accepted on first contact by these three roads: it gets the forwarded socket of the bridge (an opening
to this machine's broker), and it is the machine that *Install creds on host* downloads a binary onto. A password entry
also sends its password there. The pin that the person confirmed by its fingerprint is not asked.

Not a regression: these roads never read the pin. Medium (N16, §5).

### 1.1 What E1 closed, and what is known since (the reason of epoch 2)

E1 is merged (#379, `f3e9887d`): on a pinned entry the five `ssh` runs of the three roads now carry
`StrictHostKeyChecking=yes` and the pin file of their call as both known-hosts files; an unusable pin starts nothing;
a refused host key is told. E1 is not released.

Since the plan was approved, the specs, the code gate on #379, the cadence consult (`594a6709`) and the consult of the
re-review (`97eb6bb5`) found places where the merged code does not keep the plan's own contract. Each was a candidate
that waited for a measurement of the old E2 to justify it. That order was wrong: a known violation needs no measurement
to justify its repair. These seven are the baseline of epoch 2.

| # | The contract | What the merged code does | How it is known |
|---|---|---|---|
| V1 | the pin is the only source of trust of a pinned call (§3, the rule; `hostKeyPin.ts:18`, "built from it alone") | a `KnownHostsCommand` of the person's or the machine's `ssh` config is asked beside the pin file, and with `VerifyHostKeyDNS yes` a key that matches a secure SSHFP record is accepted (was C2, C17) | §3.9, rows 3-4, measured 2026-11-17; the docblock of `hostKeyWords` (`hostKeyPin.ts:156-158`) says so |
| V2 | "it must never reach `ssh` as two paths", and the pin file is the file that `ssh` reads (§3.9) | a path with a PAIR of apostrophes, written bare, is read as ANOTHER path: `/tmp/creds-a'b'` resolves `/tmp/creds-ab`. That is not fail closed: a key in a file at that other path is trusted. One apostrophe ends every pinned call (`invalid quotes`). `\\` is read as one `\`, so a storage folder on a UNC path names another path. `%h` and `${HOME}` are expanded in `UserKnownHostsFile` and not in `GlobalKnownHostsFile`, so the two words name two files (was C11; C6 for UNC) | the spec of E1.S1, K8 a-d; measured again 2026-11-18, `ssh -G` of OpenSSH 10.2p1, the client alone (§3.11) |
| V3 | a call that cannot name its pin file is refused before any `ssh` starts, with a true sentence (§3.1, the third state) | a path with a double quote names `/dev/null` in both words (`NO_KEY_FILE`, `hostKeyPin.ts:138`, `oneFileWord`, `:186-191`): `ssh` starts, refuses every host, and sentence C names a changed host, a cause that is not there (was C16) | read 2026-11-18; the code gate on #379, finding 5 |
| V4 | sentence C says that the entry's host did not present the saved key (§3.5) | it is shown for every pinned call whose stderr holds the verification line (`hostKeyRefused`, `hostKeyPin.ts:214-216`): also for a refused key of a jump host of the person's own `ProxyJump`, and for a remote command that prints the line. The sentence then names a cause it cannot tell (was C12) | the spec of E1.S3, L9 h and i, measured 2026-11-17 |
| V5 | "the person has to be able to tell it from a host that is down" (§3.5, P3) | with `LogLevel QUIET` in the person's config `ssh` prints nothing for a refused key. The match misses, and after *Open Remote Bridge…* the only message is *Bridge open to …* (was C13) | L9 g; measured again 2026-11-18 against a public `sshd` (§3.12) |
| V6 | the CHANGELOG says what holds | its heading says "a saved host key is the only key a call without a terminal accepts", and the same entry says further down that the agent's `ssh:exec` and *Run with Secrets* run with `accept-new` when the saved host key cannot be used (C3) | `src_vs_code/CHANGELOG.md`, `[Unreleased]`, read 2026-11-18 |
| V7 | the real runs test the plan's theory and can fail (P4) | the old rows could not decide: no quiet config, no jump host, no remote output that ends with the line, no apostrophe, no double quote, no UNC path; one row joined `KnownHostsCommand` and SSHFP and passed on either result; M3 could pass because the master was killed; and M1's install run would have written `/usr/local/bin` of this machine (`installCommand()` passes no prefix, `agentCommands.ts:318`, `remoteCliInstall.ts:120`; `install.sh:21`; a `CREDS_PREFIX` that is exported on this side does not reach the remote command) | entry 1.2; the cadence consult `594a6709` |

V1-V6 are E2's (§3.10-§3.12, §6). V7 is E3's (`## Epics`).

### 1.2 What E2 closed, and what is known since (the reason of epoch 3)

E2 is built on `fix/g1-e2-measurements` (`79652693` to `22caab8b`, four stories), is through its code gate, and is not merged:
V1-V6 are repaired there. A pinned call of the three roads, of the agent's exec and of *Run with Secrets* asks the `ssh`
program for its version, says `VerifyHostKeyDNS=no`, `KnownHostsCommand=none` (for a client that knows it) and
`LogLevel=ERROR`, names its pin file as one file or is refused with sentence E, and tells a refused host key with sentence C
on evidence and with sentence D without it.

Before E3 was built, the cadence consult (`dbe12934`) and the consult of the re-review (`22147fce`) read E3's rows against
that code. Seven things do not hold. Each was checked for this revision by reading the code at `22caab8b`, on 2026-11-19.
They are the baseline of epoch 3.

| # | What E3 or the plan says | What is so | How it is known |
|---|---|---|---|
| W1 | M4 and M9: a saved host key that cannot be used, and a pin write that fails, "start nothing": 0 starts of the client | the call asks `ssh -V` BEFORE it can know either: `decidePinOfCall` asks the rule of the path (`pinOfCall.ts:56`), then the client (`:60`), and only then writes (`:68`), and the write is what finds a saved key unusable. So one start of the client is there in a window that asked nothing yet, and none in a window that holds a kept answer (`pinClient.ts:91-92`): the old number depends on what ran before. The rows count starts of a process where they mean connections | entry 2.2; test P15 of `personPin.test.ts` expects the question first |
| W2 | §3.12 and C19's note: a remote text with the verification line gets sentence D, "the person is told a true thing about the line, and nothing is connected" | `hostKeyTold` (`hostKeyPin.ts:380`) asks the text alone. A run that ended with 0 (the login was accepted and the remote command ran to its end) and whose remote side printed the line is told sentence D: the install stops before its question (`agentCommands.ts:283-286`), and the socket check says "could not be checked" (`:216-222`). Sentence D says that the connection "ended with" the line, which is false for such a run, and the note is false too: authentication and the command already ran. M5 (g) runs the remote text with exit code 255 only | `dbe12934`; read |
| W3 | C20 "would be justified by a row of E3", and M11 (c) is the row of a client that cannot be read | the program of M11 (c) answers at once. The wait of C20 is the one of a program that does not answer: up to the runner's limit (`CLIENT_CHECK_TIMEOUT_MS`, 10 s, `bridgedSshClient.ts:81`). No row measures it | `dbe12934`; read |
| W4 | E3's rows run "on the rig of E1's smoke (an unpacked `sshd` here)", and E3 passes "on the final code" | the launcher names one executable, `/usr/sbin/sshd` (`scripts/itestSshd.cjs:13`); its starter runs `sshd -d`, which serves one connection (`:118`); the starter that serves every connection, `startServingSshd`, lives in `scripts/itestPinnedRoads.cjs` (`:103`), and its config (`servingConfig`, `:68`) has no place for the lines that an unpacked `sshd` needs (`SshdSessionPath`, `SshdAuthPath`). So every local run so far was a run of a scratch COPY with three edits (E1's stories document, item 1; `research/module_tests.md`, the smoke of E2.S4: "set in a scratch copy only"). A result from such a copy is not a result of the commit | `dbe12934`, `22147fce`; read |
| W5 | M12 measures "a path that cannot be written for `ssh` as one file" with four shapes | the rule refuses eight kinds since entry 2.1 (`REFUSED_PIN_PATHS`, `hostKeyPin.ts:157-166`). And a kind is decided by the COMPLETE pathname of the pin file (`knownHostsPath`: the storage folder, `keys/<pid>/`, `known_hosts-<id>-<uuid>`), not by the folder: a storage folder that ends with a backslash gives a pathname that does not, so "a backslash at the end" cannot be reached through a folder, and neither can "a tilde at the start" of an absolute folder. Six kinds can be reached, and four have a row | `22147fce`; read; the spec of E2.S2 says the same of its own road tests |
| W6 | the setup names instruments "here" for the install's stand-in, the resolver of M10, the older client of M11 and Windows (M13) | none of the four is known to work. The feasibility story may find that one does not; the plan must say now that this does not make the gate smaller | `22147fce` |
| W7 | the CHANGELOG entry (E2.S4): a saved host key that cannot be used is refused, "No `ssh` starts" | by W1 the question starts. What holds is that no connection starts and nothing is sent | read, `src_vs_code/CHANGELOG.md`, `[Unreleased]`; found by this revision |

W2 is repaired by a change of the product, C19: E3's first story (§3.12, part 4). W1, W3 and W5 are repaired in E3's rows
(M4, M9, M11, M12). W4 is E3's second story, the committed launch instrument. W6 is decision 18. W7 is corrected inside E3
with the row that measures it (M4; §6).

### 1.3 What E3 has built, and what is known since (the reason of epoch 4)

E2 is merged (#388, the squash `4799f9d7`). The owner released E1 and E2 in 1.23.0 on 2026-11-23 (`95e11116`, the tag
`extension-v1.23.0`), before E3: entry 3.1. On E3's branch, C19 is built (E3.S1), the launch instrument is committed
(E3.S2), all seven probes of the feasibility worked (E3.S3), and the legs of the rows M1-M9, M12 and M14 are built
(E3.S4-E3.S8; E3.S8 is not reviewed). The rows M10, M11 and M13 have a spec and no code (E3.S9). **No row is measured.**
Every run so far was a proving run of a story: it passes no row, and §10 is not written.

The spec of E3.S9 read M11 (b) against the source of an older client, and the lead measured it (entry 3.2). The consult of
the re-review (`3b6c7351`) then read the whole plan for the same premise. Eight things do not hold as the plan says them.
Each was checked for this revision on 2026-11-25, at `17694426`. They are the baseline of epoch 4.

| # | What the plan says | What is so | How it is known |
|---|---|---|---|
| Y1 | M11 (b): a client older than 8.5 shows M7's collision for (c), "M7's control showing acceptance through the colliding file with E1's words" | An OpenSSH client older than 8.7 keeps the apostrophes of a bare word. `ssh -G -F /dev/null -o "UserKnownHostsFile=/tmp/kh/x'y'z"` gives `x'y'z` on 8.4p1 and `xyz` on 10.2p1; the word in double quotes gives `x'y'z` on both. So on the older client the bare word names the intended file, no other file is read, and K2 cannot accept the control. Only `ssh -G` was measured: no login | entry 3.2; `research/module_tests.md`, *The apostrophes of a bare word on an older client*; the spec of E3.S9, Q1 |
| Y2 | test 21: "The control: the bare pair of apostrophes resolves another path, so the test can fail", and the unit test that holds it, G5 (`test/pinWords.test.ts:324`) | G5 asserts the newer parser's answer against whatever `ssh` is first on `PATH`. On a client older than 8.7 its first assertion would fail. Inferred from the measurement of Y1, not run. G1-G3 skip on a client older than 8.5 and G4 chooses its words by the client; G5 has no such choice | read, `pinWords.test.ts:144-145`, `:310-333`; `3b6c7351` |
| Y3 | §3.11, the rule of admission: a kind moves from "refused" to "written" only with "the collision measurement of E3's M7 for it, on every such client" | A client older than 8.7 has no such collision, so the condition cannot be met as written on every client that the release names. And row a of §3.11's measurement ("another path, not fail closed") is a fact of the newer parser | follows from Y1; `3b6c7351` |
| Y4 | "a client older than 8.5" stands for two boundaries: the option `KnownHostsCommand` (§3.10) and how a client reads the value of a known-hosts option (§3.11) | They are two. The option came with 8.5: the product's threshold, and it stays. The parser changed with 8.7 (read in the release notes and in `misc.c` of `V_8_4_P1`; 8.4p1 and 10.2p1 measured). An unquoted value with an equals sign is split by 8.4p1 and read whole by 10.2p1 (probe P3.5 of E3.S3, 2026-11-24). A client of 8.5 or 8.6 knows the option and is read to have the older parser: no row runs one | read; `research/module_tests.md`, P3 |
| Y5 | decision 12, §8 and §9, step 11: the release waits for E3 | 1.23.0 shipped E1 and E2 before E3, with the owner's word (entry 3.1). Its CHANGELOG says what was not measured and what was not yet right. The plan's text still reads as if no release had been cut | entry 3.1; `git tag --points-at 95e11116` |
| Y6 | M2 (a): K2 is listed "in the file that the client reads as the person's default one" | OpenSSH takes `~` from the password database, not from `HOME` (measured, the spec of E3.S4, F23). So the compiled-in default path is always in the person's real home, and the setup forbids a row to read or to write there. What (a) can prove is the user-file slot: a file that the handed config names as `UserKnownHostsFile` | the owner's reading, 2026-11-24 (the spec of E3.S6, A1) |
| Y7 | M5 (e): the handed config says `LogLevel QUIET` | `ssh -G` prints that level as `loglevel SILENT`, the first name of the level in OpenSSH (10.2p1, E3.S8). A check that reads `-G` must take either name | `research/module_tests.md`, *M5, seen when it was built*, deviation 1 |
| Y8 | The texts of state: E2 "not merged", E3 "not built", "the stories document of E3 is not written", four instruments "not proven", the CHANGELOG entry with "no version heading" | E2 is merged and released. E3.S1-E3.S8 are built. All seven probes worked. The heading `[1.23.0]` is written (#389), and what E3 changes goes into a new entry under `[Unreleased]` (the stories document, the answer to Q2) | read |

Y1 is repaired in M11 (b), and Y2 and Y3 with it, by one rule: a FIXED expectation per parser, and on each parser the
evidence that the intended file alone supplies trust (decisions 19, 20; §3.11; test 21 and test 34; `## Epics`, E3). The
code of G5 is changed by E3.S9, the story that runs the older client. The older parser keeps a collision of its own kind, a
bare equals sign (Y4), and M11 (b) holds it as a pair of legs on both clients. Y4 is said in §3.10 and §3.11, and what no row runs
is said in the release evidence. Y5 is decision 21. Y6 is decision 22 and M2 (a). Y7 is in M5 (e). Y8 is repaired where
each text stands.

**The readings of epoch 3 are records, not changes.** While E3.S4-E3.S8 were specified and built, the owner and the lead
answered questions about how a row is read. No answer changed a row, an instrument's kind or a number, so none is an
entry. This revision carries them into the text: `## Epics`, E3, *How the rows are read*.

## 2. Settled before this plan (the baseline)

Four decisions were settled by the lead with the question consultants before this plan was written. They are the
baseline of the plan, not open questions.

1. **An unpinned entry keeps today's `accept-new` on these roads**, as on the agent's exec road
   (`sshUseActions.ts:213-216`: a first contact is not negotiated where nobody is asked). (Consult `9737729d`.)
2. **A pinned entry's pin is written as a PER-CALL file**, `known_hosts-<entryId>-<uuid>`: the `suffix` parameter of
   `materializeKnownHosts`, as the `isolate` of a session does (`sshSession.ts:340`). It is complete before the spawn
   and is deleted by the same guards that N16 made for the key file (`writtenKey.ts`): the `finally` of `withWrittenKey`
   on the two bounded roads, with ONE pin file for the whole bounded operation (both runs of the socket check, both of
   the install); `withWrittenKeyUntilExit` on the bridge, deleted when THAT `ssh` has ended and at once on every other
   exit. The delete of the pin does not depend on whether a key file was written. The pin is created inside the guarded
   span, so a write that fails cannot strand the key file. Precedent: the per-session suffix and its cleanup
   (`sshSession.ts:340`, `:526-553`) and its test (`test/sshSession.test.ts:335-368`, T20: two isolated prepares write
   four distinct files, each cleanup removes only its own). (Consult `4b211a20`.)
3. **A pin that is PRESENT but unusable is REFUSED on these three roads before any `ssh` starts**, with one sentence
   for the person. Unusable: the stored text does not parse, or the host cannot form a known_hosts line. Absent (empty
   or only whitespace) is unpinned. This is decided on the person's side only: the contract of `materializeKnownHosts`
   does not change, because the agent's exec calls it too; that road's fail-open is a separate follow-up (§7, F1).
   (Consult `ddd73927`.)
4. **Order: G2 first, then G1.** G2 is the bridge that does not turn off `ssh` connection sharing (`ControlMaster` /
   `ControlPersist` from the person's own config; measured by the G2 plan and merged on 2026-11-17, #376). The reason (gemini, consult
   `9737729d`): a client that reuses an existing master connection does no new key exchange and no new login, so the
   pin options of this plan would be passed over while connection sharing is on. Read when this plan was written; the
   G2 plan then measured it (§4).

Two more were settled at the plan round on 2026-11-17, and are baseline too (`## Plan changes`):

5. **The round's four findings, P1-P4, are accepted.** Each is folded into the section the ledger names.
6. **The split: two epics and a list of candidates** (`## Epics`). E1 is the smallest core that runs end to end on
   real input; E2 runs it for real against pass criteria that are written now; everything else is a candidate that a
   result of E2 has to justify. (Consult `cbe21f00`: both answers agree on this split.)

Seven more were settled by the re-review on 2026-11-18 (consults `97eb6bb5`, `594a6709`, `274c6e9d`). They are the baseline of
epoch 2, not entries. Decision 6 is replaced by decision 7.

7. **The split of epoch 2: three epics.** E1 is done. E2 builds the repairs of V1-V6 (§1.1). E3 is the measurements,
   and it is the release gate. The old E2 ("measure, and let a result justify a candidate") is gone: a known violation
   of the contract is repaired first and measured after. (Both answers of `274c6e9d`; `97eb6bb5`.)
8. **No pinned call asks another source of trust** (§3.10): `VerifyHostKeyDNS=no` on every pinned call, and
   `KnownHostsCommand=none` under the client's own answer about its version, with a written answer for a client older
   than OpenSSH 8.5 and for a client that cannot be asked.
9. **The pin file reaches `ssh` as the one intended file, or the call does not start** (§3.11). A path that cannot be
   written so is refused before any `ssh`, with a sentence that names the field. No stand-in file: `/dev/null` goes.
10. **A sentence names a cause only when the call saw it** (§3.12). Sentence C needs `ssh`'s own line that names the pin
    file of this call. The verification line without it gets a sentence that names no host as the cause. A pinned call
    states its own `LogLevel`, so a refusal is not silent.
11. **C3 stays outside this plan, and the CHANGELOG limits its guarantee to what holds** (§6). The agent's exec keeps
    reading an unusable pin as no pin until C3 has its own plan; the entry says so in its opening, not only further down.
12. **The release waits for E3.** E3 passes only as a whole, in one run on the final code. A measurement that is missing
    is not a pass. No row passes on either result. A control that does not show what it is there for fails its row.
    Every candidate that is not built has a written disposition before the release (`## Epics`). The release needs the
    owner's word. **One release did not wait (entry 3.1; decision 21):** 1.23.0 shipped E1 and E2 on 2026-11-23, before E3.
    This decision holds for G1's next release and for every release after it.
13. **Three epics get the feature review.** `review_feature` runs once, after E3 and before the release
    (`coai-feature-gate.md`: a plan of three or more epics).

Five more were settled by the re-review on 2026-11-19 (consults `22147fce`, `dbe12934`, `8d07d6a6`). They are the baseline of
epoch 3, not entries. Decisions 7-13 stay; decision 10 gains the condition of decision 14.

14. **C19 is built, as the first story of E3** (§3.12, part 4). The function that chooses the sentence for a host key takes
    the run's exit code as a required parameter and answers nothing when it is 0, from both callers. E3's scope said "no
    new behaviour of the product": it now says "one, C19, and it is built before anything is measured". C19 is no fourth
    epic, and E2's code gate is not opened again for it. (Both answers of `8d07d6a6`; `22147fce`.)
15. **A row counts what it is about.** A start of the client program, a connection start, an authentication attempt and
    an accepted login with its command are four counts, and no row puts one for another (`## Epics`, E3, the setup). For a
    saved host key that cannot be used and for a pin write that fails, the contract is: 0 connection starts and 0
    authentication attempts, in a window that asked the client nothing yet (one start, the question `ssh -V`) and in a
    window that holds a kept answer (no start). For a path that the rule refuses it stays 0 starts of any kind: that
    refusal stands before the question. The order of `decidePinOfCall` as E2 built it is not changed. (`22147fce`.)
16. **The launch instrument is committed before anything is measured.** The real runs start their `sshd` through one
    committed launcher that takes the executable and the extra lines of an unpacked server's config as parameters. No row is
    run from a copy with edits. The identities of what ran are recorded beside the results of the same commit.
    (`22147fce`, `dbe12934`.)
17. **The order of the merges: E2's pull request first, then E3's.** E3's branch stands on E2's head. After E2 has merged,
    E3's branch takes `main` by a merge: this repository never rebases a pushed branch and never force-pushes one. (`8d07d6a6`.)
18. **An instrument that is not known to work does not make the gate smaller.** The install's stand-in, the resolver that
    the run owns (M10), the client older than 8.5 (M11) and the Windows client (M13) are not proven. A row that is not
    measured is not passed. Making the gate smaller is a plan change, and it needs the owner's word. (`22147fce`.)
    Since E3.S3 (2026-11-24) each of them worked as a probe. A probe that worked does not show that a row can run as
    written: entry 3.2 was found after the probe of the older client had worked. The decision stays for every row.

Four more were settled by the re-review on 2026-11-25 (consult `3b6c7351`, checked by the lead; the owner's readings of
2026-11-24). They are the baseline of epoch 4, not entries. Decisions 7-18 stay; decision 12 gains the exception of
decision 21.

19. **A control about how a client reads a bare word has a FIXED expectation per parser.** There are two parsers: a
    client before OpenSSH 8.7 and a client from 8.7 on (§3.11). A row or a test that asks what a client does with a word
    that is not in double quotes says, for each parser that it runs, what must come out. Where one piece of code runs on
    either parser (test 34), it reads the client's version first and takes the expectation of that version; where a row
    runs one named client (M7 the newer, M11 the older), the result names that client's version. The expectation is never
    taken from the outcome, and no control passes on either result (decision 12). A client whose version is not read has
    no expectation, and its control is not passed. This holds for M7's collision, for M11 (b), for test 21 with the unit test G5, and for the rule of
    admission of §3.11. (`3b6c7351`.)
20. **On every parser the evidence is that the intended file alone supplies trust.** The product writes the pin file's
    path in double quotes where §3.11 says so, and both parsers read that word as the one intended file (measured with
    `ssh -G` on 8.4p1 and on 10.2p1 for a pair of apostrophes and for an equals sign; the other shapes on the older client,
    and every login there, are M11 (b)'s to show). What a row shows beside it depends on the parser. From 8.7 on: the bare word reads
    another file, and K2 accepts the control through it (M7's collision, as written). Before 8.7: the bare word reads the
    intended file too. K1's line is in the intended file and K2's line in the twin; K1 accepts the witness with the bare
    word, and K2 refuses the control with the bare word and logs no authentication attempt. The K1 leg rules out that the
    client found neither file. For a pair of apostrophes the older client has no hole to show. Its own kind is a bare
    equals sign, which it splits into two names: M11 (b) shows that collision with a pair of legs of its own, and shows
    with the same pair on the newer client that there is none (the lead, after the judge's review).
    The `KnownHostsCommand` threshold stays 8.5 (decision 8). (`3b6c7351`.)
21. **1.23.0 is the one release exception.** The owner released E1 and E2 before E3 (entry 3.1). Decision 12 and §9,
    step 11 did not hold for that one release, and they hold for every later one. What 1.23.0 shipped is not called
    measured anywhere: a claim is measured when §10 holds its row. E3 stays the gate of G1's next release.
22. **A row claims what its run can show, and the release evidence says the limit.** M2 (a) proves the user-file slot
    that the handed config names. It claims nothing about the compiled-in default path: OpenSSH takes `~` from the
    password database, so that path is in the person's real home, and the person's real `~/.ssh` is never read and never
    written by a run (the owner's reading, 2026-11-24). §10 and the CHANGELOG entry say this limit in words, beside the
    result. The same holds for what M11 (b) shows on the older client, for what M14 does not prove (the broker's HTTP
    layer and its consent), and for the clients that no row runs (8.5 and 8.6).

## 3. Fix

**The rule:** on these three roads, an entry with a pin starts `ssh` only with `StrictHostKeyChecking=yes` and with ONE
known-hosts file, which holds that pin and nothing else, written for this call and deleted with this call. `ssh` is
given that file as its `UserKnownHostsFile` and as its `GlobalKnownHostsFile`, so no system-wide file is read beside
it (P1, §3.9).

**What exists and is reused** (nothing below is written a second time): the `knownHostsFile` option of both argv
builders; `materializeKnownHosts` with its `suffix` (the name, the directory `keys/<pid>/`, the modes `0700`/`0600`,
`lockToOwner`, the sanitised entry id: `hostKeyTrust.ts:66-98`, `materializedKeys.ts:75-81`); `forgetMaterializedKey`
(`keyInstaller.ts:262-268`, never throws); the two helpers of `writtenKey.ts`; the test world
`test/personRoadsWorld.ts`.

**Epoch 2 widens the rule to what it always meant.** A pinned call that the extension starts with no terminal, off a
bridge, asks NO other source of trust than its pin file (§3.10); the file that `ssh` reads is the file that was written
for the call, or the call does not start (§3.11); and what the person is told about a refusal is what the call saw
(§3.12).

**Built and not built.** §3.1-§3.9 were built by E1 (#379, `f3e9887d`). They stand as the record of what was built,
with the references of the tree before E1; where epoch 2 changes one of them, the place says so and names the new
section. §3.10, §3.11 and parts 1-3 of §3.12 were built by E2, on `fix/g1-e2-measurements` (`22caab8b`), unmerged: they
stand as they were approved, and where E2 built another word or another count than the baseline here, the place says so.

**Epoch 3 changes one thing of the product, and one reading.** The one thing is part 4 of §3.12 (C19): a run that ended
with 0 is told nothing about a host key. It is E3.S1's, and nothing of it is in the code. The one reading: since E2,
"no `ssh` starts" in §3.1-§3.5 means that no CONNECTION starts. A pinned call asks the `ssh` program for its version before
it can know that its saved key cannot be used or that its pin file cannot be written (§3.10, *The order as E2 built it*),
so in a window that asked nothing yet one local `ssh -V` starts, and nothing reaches the host. Only a path that the rule
refuses (§3.11) still starts no `ssh` at all.

**Epoch 4 changes nothing of the product.** E2 is merged (#388) and C19 is built (E3.S1, `a445af56`, on E3's branch), so
the two paragraphs above describe the state of 2026-11-19. No word of an argv and no sentence changes, and the rule of the
path writes and refuses the same kinds. What changes is what the plan asks a client to SHOW: OpenSSH reads a word that is not in double
quotes with one of two parsers, and the boundary is 8.7, not the 8.5 of `KnownHostsCommand` (§1.3, Y1-Y4). The product
writes the same words for both parsers. A control, a test and the rule of admission of §3.11 now name the parser that they
speak of (decisions 19, 20).

### 3.1 The pin of one call

One new function on the person's side, in a new small module beside the helpers (here `personPin.ts` and
`writePersonPin(storageDir, entity, auth)`; the spec names them). It reads `entity.hostKey` of the snapshot that the
road already holds (`agentCommands.ts:266`, `:402`; the socket check gets the bridge's snapshot, `:465`), and answers
one of three. It never throws. `auth` is the login of the resolved credential (`sshExecAuth.ts:35`); it only chooses
the form of sentence A (§3.5).

| The stored pin | The answer | What `ssh` gets |
|---|---|---|
| absent: `undefined`, empty, or only whitespace | unpinned | `StrictHostKeyChecking=accept-new`, as today |
| present and usable | pinned, with the path of the file written now | `StrictHostKeyChecking=yes`, and that file as `UserKnownHostsFile` and as `GlobalKnownHostsFile` (§3.9) |
| present and unusable | refused, with the sentence of §3.5 | no `ssh` starts |

- **Absent** is `(entity.hostKey ?? '').trim() === ''`, the same trim that `parseHostKey` does (`hostKeyPin.ts:107-108`).
  Nothing is written.
- **Present:** it calls `materializeKnownHosts(storageDir, entity, randomUUID())`. A path is *pinned*. `undefined` is
  *unusable*: that function answers `undefined` when the text does not parse (`parseHostKey`, `hostKeyPin.ts:107-111`),
  when the entry has no host, or when the host cannot form a line (`knownHostsLine`, `:124-130`). So the three states
  come from the one existing function and one check for absence; there is no second copy of the parse to drift.
- **A write that throws** (a full disk, a directory that cannot be made) is *refused* too, with its own sentence
  (§3.5). An expected failure is a value here, as in `byStoredKey` (`sshExecAuth.ts:160-165`).
- `materializeKnownHosts` is not changed. The agent's exec still calls it with no suffix and still reads `undefined` as
  "no pin" (§7, F1).

### 3.2 The helpers own a second path: extended, not composed

`withWrittenKey` and `withWrittenKeyUntilExit` (`writtenKey.ts:23-29`, `:51-66`) are **extended**. Each gets a second,
REQUIRED parameter, the pin writer of §3.1 (required as N16's reporter is: a caller that names no writer does not
compile). The contract:

1. **The order, inside the guarded span:** the `try` opens; when the credential is `ok`, the helper calls the writer
   with that credential's `auth`; then it calls `run` / `start`. A credential that is not `ok` writes no pin.
2. **`run` / `start` get ONE value**, the credential and the pin decided together: *ready* (the `ok` credential, plus
   `knownHostsFile` when the entry is pinned) or *refused* (the credential's refusal as it is, or the pin's refusal in
   the same shape: `ok: false` and a `message`). A road reads one `ok`. There is no ready value without a pin decision,
   so no road can start `ssh` after a refused pin, and no road gains a new branch for it (§3.6).
3. **What is deleted.** The helper itself keeps the path that the writer returned. Its `finally` (and, on the bridge,
   its one continuation on `exited`) deletes the key file when the credential has `materialized`, and the pin file when
   one was written. The two deletes do not depend on each other: a password credential, or a key file of the person's
   own, gives the helper no key file to delete, and its pin file is still deleted.
4. **Only a path that the writer returned in this call is deleted.** No caller hands the helper a pin path. That is why
   the directory guard of `forgetOurPin` (`sshSession.ts:605-616`) is not copied: it protects a road whose path travels
   through an options object and a WSL translation; here the path never leaves the helper except as the `ssh` option.
5. **The bridge keeps ONE flag and ONE continuation** for both files: `handed` is set after the one attach, as today
   (`writtenKey.ts:46-49`). The proof of N16 ("exactly one of the two deletes runs, on every path") then holds for both
   files with no new case.

**Why extended, and not a second guard composed with the first** (`withWrittenPin` nested in `withWrittenKey`):

- With two guards the ORDER is a rule that every caller must keep: the pin guard inside the key guard, and the write
  inside the pin guard. The wrong order compiles, and it strands the key file when the pin write fails. With the
  extended helper the writer is a parameter that the helper calls inside its own `try`: the wrong order cannot be
  written.
- On the bridge, two guards mean two flags and two continuations on one `exited`, and their attach order has to be
  argued again. One flag keeps N16's argument as it is.
- The refusal of an unusable pin then stands at ONE place, on the road in, and not at three call sites
  (`security.md`, *a measure applied at some of its sites*).

**The cost:** two shipped helpers change their signature. The names stay (`writtenKey.ts`, `withWrittenKey`,
`withWrittenKeyUntilExit`: the one module that imports them, `commands/agentCommands.ts` with its three calls, and
`test/writtenKey.test.ts` keep their import); the module comment says that it now owns both files of a call. N16's
unit tests of the helpers (`test/writtenKey.test.ts`, U1-U8) get the new argument and keep every assertion. N16's
tests of the registered commands (C1-C6, I1-I7, R1, B1-B9) run unchanged: their entry has no pin.

### 3.3 The two bounded roads

- **The socket check** (`:191-245`): the guard gets the writer; both argv calls name `knownHostsFile`
  (`sweepDeadSockets` gets it as a parameter, `:173-180`; the mode check, `:206`). Both runs read the SAME file. A
  refused value ends the check before any `ssh` (the branch at `:202-204`). For a pin that can only be a write that
  failed: an unusable pin has already stopped the bridge's own command, which reads the same snapshot. It goes to the
  diagnostic log (`bridge`), as every "not observed" of this check does.
- **A host key that `ssh` refused is shown to the person by the check (P3).** Today that refusal reaches only the log:
  the bridge's `ssh` has no stdio, and the check reads its own empty answer as `unreadable` (`:232-234`). The check
  shows sentence C in its bridge form (§3.5) with `showErrorMessage`, as it shows a missing socket (`:223-230`), and
  writes the log line too.
- **The install** (`:259-329`): the guard gets the writer; `runRemote` (`:332-350`) reads the ready value, so the probe
  and the install run name the same `knownHostsFile` (`:338`). A refused pin arrives in the existing refusal branch
  (`:277-280`). The pin file stays while the modal question is open, as the key file does (N16, §2.1).
- **One pin snapshot per call.** A pin that the person replaces while an install waits at its question is used by the
  NEXT call. The running call keeps the pin it started with.

### 3.4 The bridge

- `openRemoteBridge` (`:381-478`): the guard gets the writer; `buildBridgeArgv` gets `knownHostsFile` (`:437-441`). A
  refused pin arrives in the existing refusal branch (`:430-433`): nothing is started, no row turns *bridged*, and
  *Bridge open to …* (`:471-473`) is not shown, because the command returns at `:454-456`.
- The pin file of a bridge lives as long as its key file: it is deleted when THAT `ssh` has ended (by itself, *Close*,
  a replacement, the window), and at once when nothing was started or the start throws. Only the key exchange needs
  the file; it is kept until the end for the reason N16 gives for the key (§2.2 there: a plain `ssh -N` gives no clean
  signal that it has connected).
- The token is minted before the resolve (`:411`), so a refused pin leaves an unused grant, as a refused credential
  does today. For an entry with its own PIN, the PIN is asked before the refusal. Both are accepted: an unusable pin is
  rare (§7, F2 says where one can come from), and a check before the resolve would be a second reading of the pin.
- The socket check that follows (`:465`) writes its OWN pin file from the same snapshot. One *Open Remote Bridge…* on
  a pinned entry therefore writes two pin files: the bridge's (until its `ssh` ends) and the check's (about 32 s at
  most).

### 3.5 What the person sees

| The entry and the host | The install | The bridge and its socket check |
|---|---|---|
| unpinned | as today | as today |
| pinned, the host presents the pinned key | as today | as today |
| the pin is present and unusable | `Cannot reach "<name>": ` + sentence A in the form of the entry's login; no `ssh` | `Cannot bridge to "<name>": ` + the same; no `ssh`, no bridge |
| the pin file cannot be written | the same with sentence B | the same with sentence B |
| pinned, the host presents ANOTHER key: `ssh` refuses, and names the pin file of this call as the place of the key that does not fit (§3.12) | sentence C, in place of today's "the host did not answer the probe" | the bridge's `ssh` ends (255), the row goes back to *Open Remote Bridge…*; the socket check shows an error message: `The bridge to "<name>" is not open: ` + sentence C (P3) |
| pinned, the run's stderr holds the verification line and does NOT name the pin file of this call (a jump host of the person's config, a config whose `HostName` alias or `Port` renames the lookup, a remote text): epoch 2, §3.12 | sentence D | the socket check shows an error message: `The bridge to "<name>" could not be checked: ` + sentence D. It does not say "is not open": without the evidence the check does not know that |
| pinned, the pin file's path cannot be written for `ssh` as one file: epoch 2, §3.11 | `Cannot reach "<name>": ` + sentence E; no `ssh`, no pin file | `Cannot bridge to "<name>": ` + sentence E; no `ssh`, no bridge |
| pinned, the `ssh` program cannot be asked what it is: epoch 2, §3.10 | the same with sentence F; no connection is started | the same with sentence F; no connection is started, no bridge |
| pinned, the run ended with 0, and its stderr holds the verification line (a text of the remote side): epoch 3, §3.12, part 4 | no sentence about a host key: the install goes on to its question, as for a probe without that line | no message about a host key: the check goes on and reads the socket's mode |

In the third and the fourth row "no `ssh`" reads "no connection" since E2 (§3, *Epoch 3 changes one thing*): the question
`ssh -V` can start first. In the sixth row the run did not end with 0 (epoch 3). In the seventh row "no `ssh`" is exact.

**Sentence A** (new; the pin is present and unusable). It has two forms, and the call's own login chooses (P2): the
`auth` that `resolveExecAuth` answered (`sshExecAuth.ts:35`), which comes from the same `resolveSshCredential` that
Connect's route reads (`sshExecAuth.ts:122`, `sshSession.ts:278`).

The key form (`auth: 'key'`: a stored key, or the person's own key file):

```text
The saved host key of "<name>" cannot be used, so nothing was sent to that host. Get the host's key fingerprint from the person who runs the server. Then use Connect SSH on this entry, and go on only if it shows that fingerprint: Trust and connect saves the key.
```

The password form (`auth: 'askpass'`):

```text
The saved host key of "<name>" cannot be used, so nothing was sent to that host. Do not use Connect SSH to save it again: this entry signs in with a password, and when Connect SSH cannot read the host's key first, it sends the password without checking the host. There is no safe repair for such an entry yet; the bridge and the install stay refused for it.
```

**An entry with no credential gets no form of sentence A.** `resolveExecAuth` answers not-ok for it
(`sshExecAuth.ts:139-141`), and no pin is written for a credential that is not `ok` (§3.2, item 1). The road shows the
credential's own refusal, as today, and nothing starts. (Corrected on 2026-11-17 from the spec of E1.S2: this section
and test 6 of §5 listed "no credential" under the key form, a state that no road can reach.)

**Why two forms (P2).** Connect SSH is the one road that can heal such a pin: `pinVerdict` reads a stored text that
does not parse as a first contact (`hostKeyPin.ts:146-149`), the dialog shows the fingerprint
(`hostKeyTrust.ts:139-149`, the button *Trust and connect*), and the answer is written over the stored text
(`connectionOptions.ts:87-99`). But that holds only when Connect's key scan answers. When the scan answers nothing,
Connect goes on with no question (`hostKeyTrust.ts:128-133`) and no pin file (`connectionOptions.ts:70`), and then
the two logins differ:

- **A key entry:** the extension gives `ssh` no word about the host key, so `ssh` asks by its own default, `ask`, in
  a terminal in front of the person (`sshCommand.ts:319-328`; a person's own config can say otherwise, and that is
  theirs). A fingerprint is shown before anything goes on, by the dialog or by `ssh`. So the key
  form's "go on only if it shows that fingerprint" holds on both ways. On the second way the pin is not saved, and
  the three roads refuse again: safe, one step short.
- **A password entry:** `ssh` runs with `accept-new` (`sshSession.ts:503-506`), and the password goes to whatever
  machine answers. The first draft of sentence A sent every entry there. A sentence cannot make that way safe: the
  connection is made before the person can stop it.

**Which repair path exists, checked by enumeration (2026-11-17, a search of `src_vs_code/src`):** `scanHostKey` has
one caller (`connectionOptions.ts:135`) and a pin has one writer (`:94`). No path refuses an empty scan. The edit
form cannot clear or write such a pin (§7, F2). So the password form names no repair, and says so. The repair is
candidate C1 (Connect refuses when its scan answers nothing and no usable pin stands in), the round's second option;
the question consultants lean to the wording here and the repair as a candidate.

When the host itself is the cause (it cannot form a known_hosts line), Connect SSH names that in its own words; the
key form stays true, its advice is then one step short. Accepted: such an entry needs a host that was edited after
it was pinned, or imported data (`scanHostKey` refuses such a host before any pin is made, `hostKeyTrust.ts:37-39`).

**Sentence B** (new; the write failed), in the shape of `sshExecAuth.ts:164`:

```text
Could not write the saved host key of "<name>" to disk: <the error>
```

**Sentence C** (new; `ssh` refused the host's key on a pinned entry):

```text
"<name>" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.
```

**Why sentence C is built, and not left to today's sentences.** Read on 2026-11-17, a refused key is named by none of
them. The install says "the host did not answer the probe, so nothing is known about it yet" (`remoteCliInstall.ts:84`;
the probe's stderr is not read). The bridge's `ssh` has no stdio (`bridgeSpawner.ts:79`), so the person sees *Bridge
open to …*, then the row goes back with one log line, `<key> ended (255)` (`extension.ts:190-191`); the socket check
reads its empty answer as `unreadable` and writes a log line only (`agentCommands.ts:232-234`). This plan makes "the
host's key is not the pinned one" a designed outcome of these roads, so the person has to be able to tell it from a
host that is down.

**Sentence C against P2.** (Revised by the code gate of E2, 2026-11-19: neither C nor D names Connect SSH any more, because Connect's own line still trusts the person's other sources, C4, and a password entry can proceed there without a fingerprint when its scan answers nothing; C and D now say not to replace the saved key because of the message and to get the fingerprint from the server's owner. The argument below is kept as first written.) Its advice cannot end in an unchecked connection: with a pin that parses, Connect keeps
enforcing it when its scan answers nothing (the pin file is written, `connectionOptions.ts:70`; the password branch
softens nothing when one exists, `sshSession.ts:503-506`), and when the scan answers, the alarm of a changed key is
asked first (`hostKeyTrust.ts:157-170`). What Connect's own `ssh` trusts beside the pin is candidate C4 (§3.9).

- **Where:** the first run whose answer each bounded road reads: the install's probe (`:282`; `runRemote` already
  returns its stderr, `:346`) and the socket check's mode check (`:217`), which speaks for the bridge as it already
  does for a missing socket (`:223-230`). The install's second run keeps today's sentence (a key that changes between
  two runs seconds apart).
- **The bridge's form is a message, not a log line (P3).** The check opens it with `The bridge to "<name>" is not
  open: `, because *Bridge open to …* (`:471-473`) is on the screen by then: the check runs after the command has
  returned (`:465`). The same words go to the log.
- **When, as E1 built it:** the call is PINNED and the run's stderr holds OpenSSH's line `Host key verification failed.` as a whole
  line. An unpinned entry keeps today's sentences, whatever `ssh` printed: it has no saved key to speak of.
  **Epoch 2 narrows it (V4, §3.12):** the words of sentence C stay, and it is shown only when the stderr also holds
  `ssh`'s line that names the pin file of this call. The verification line without that line shows sentence D.
- **Measured for this plan, by hand, 2026-11-17, OpenSSH 10.2p1 (Ubuntu):** `ssh -F none -o BatchMode=yes -o
  StrictHostKeyChecking=yes -o UserKnownHostsFile=<a file that holds another ed25519 key for that host> -o
  GlobalKnownHostsFile=/dev/null` against a public sshd (`github.com:22` and `ssh.github.com:443`): exit code 255, and
  no line about a login; stderr ends with `Host key
  for <host> has changed and you have requested strict checking.` and `Host key verification failed.`; stderr names the
  pin file's path twice. A pin file that `ssh` does not find ends with the same last line, after `No ED25519 host
  key is known for <host> and you have requested strict checking.` (§3.9, row 6). **Not measured:** Windows'
  `ssh.exe` (C6); a host that offers no key of the pinned type (measured since, by the E2.S3 spec: the 15 lines with `Offending <the saved type> key in <the pin file>:1`, §3.12 part 3); a refusal through the roads themselves, which E1's
  smoke and E3 measure (M5).
- **Measured for the E1.S3 spec, by hand, 2026-11-17, the same OpenSSH 10.2p1 against a real `sshd` on the loopback** (a repaired
  description of the match, not a change of it; the spec's facts L9):
  - `ssh` ends its own lines with CR LF, also on Linux (one of the 15 lines of a refused key ends with LF alone), so the match
    splits the text at both.
  - `LogLevel QUIET` in a person's config prints NOTHING for a refused key (exit code 255, stderr empty): the match then misses,
    and the sentence of today is shown. `FATAL` prints the verification line alone; `ERROR`, `INFO`, `VERBOSE` and `DEBUG` print it
    as a whole line.
  - A refused key of a hop of the person's own `ProxyJump` prints the same 15 lines (from the nested `ssh`) and one more line after
    them, `Connection closed by UNKNOWN port 65535`. The match reads it as a refused key of the entry, so sentence C can name the
    wrong host.
  - A host that passed the check can print the line itself: a remote command that writes `Host key verification failed.` to its
    stderr is matched too (the match is a whole line of the stderr).
- **As E1 built it,** a miss of the match shows today's sentence. The connection is still refused, but for *Open Remote Bridge…* today's message is *Bridge open to …* (shown at once, before its socket check runs), so under `LogLevel QUIET` that success message is the only one and the tree row going back is the only sign (as it already was before G1 for a host that is down or a refused login). **Epoch 2 closes the quiet case (V5, §3.12):** a pinned call states its own `LogLevel`.

**Sentences D, E and F** are epoch 2's. Their words and their conditions are in §3.12 (D), §3.11 (E) and §3.10 (F).

**The words as E2 built them** (read 2026-11-19 at `22caab8b`). Four sentences differ from the baselines that this plan
prints, by the specs and by E2's code gate, and the product's functions hold them word for word: sentence C
(`refusedHostKeySentence`, `hostKeyPin.ts:403`) and sentence D (`unnamedHostKeySentence`, `:419`) name no road of the product
and send the person to the server's owner for the fingerprint; sentence E (`pinPathSentence`, `:280`) and sentence F
(`pinClientSentence`, `:288`) name a remedy, and F says "it did not start, or did not end in time" in place of an exit code
when there is none. The baselines stay here as the record of what was approved. A row of E3 compares what was shown with
what the product's function answers, never with a text typed in this plan.

### 3.6 The file size

`commands/agentCommands.ts` has 794 lines; lint refuses more than 800 (`eslint.config.mjs:30`). **Measured again on `main`
after G2 had merged (2026-11-17, `ca99cd91`): 794 lines.** G2 did not change this file (`git diff b84416aa ca99cd91` of it
is empty), so the budget below is the one of `b84416aa`, and it holds: 794 now, 785 after the grouping, and 784 after
E1.S2 (counted in its spec, §4.3). What E1.S3 adds comes on top of 784, and its spec states the count.

- **Freed, first, in a commit of its own:** the imports that still name one symbol per line from the same module are
  grouped, as N16 did (§2.3 there). Seven modules: `../installCommand` (three lines), `../credsInstall` (three),
  `../sshExecCommand`, `../sshCommand`, `../agentShareSnippet`, `../secretClipboard`, `../gitSigningConfig` (two each).
  794 → 785. The import request strings do not change, so no module mock of a test changes.
- **Added, 13 (measured in the E1.S3 spec, 2026-11-17; the first count said "about 12"):** no road gains a branch for a
  refused pin (§3.2, item 2); the four argv calls gain the option on lines that exist; `sweepDeadSockets` gains one
  parameter; sentence C is one branch of 4 lines on the install and of 7 on the socket check (it builds the text once for
  the log and the message, and has one comment line); one import. `agentCommands.ts` is 784 after E1.S2 and **797** after
  E1.S3. The spec states the exact counts per story. §3.9's change is in the two builders and
  one pure function, outside this file.
- **Not taken: moving the socket check out of the file.** `test/launchRoadScan.test.ts:306-319` pins the three calls of
  `buildSshExecArgv` that name no `ownAgent` to this file by name; that list belongs to
  [PLAN_ssh_exec_own_agent_forwarding.md](PLAN_ssh_exec_own_agent_forwarding.md). The budget holds after G2 (above). If a
  later merge into `main` takes it away before E1.S2 is built, that is a question to the lead, not a silent move.

**After E1, and E2's budget.** Measured on `main` at `f3e9887d`, 2026-11-18: `commands/agentCommands.ts` has **797** lines, as the
spec of E1.S3 counted. Three lines are left under the limit. E2 is planned so that no road gains a branch:

- the two new refusals (the path, §3.11; the `ssh` program that cannot be asked, §3.10) arrive in the refused value that the
  guards already hand a road (§3.2, item 2): the pin writer answers them;
- which sentence a refused host key gets (C, D, or none, §3.12) is decided by one pure function of `hostKeyPin.ts`. The two
  branches of E1.S3 (`:216-222`, `:283-286`) ask it in place of `hostKeyRefused` and keep their size;
- the new words come from the one function that both builders call. The four argv calls change on lines that exist, if at all.

The specs of E2 state the count per story. If it does not hold, F5 (§7; C10) is the reserve: the doc comments of this file
that have no function under them go, in a commit of their own, inside E2. Moving the socket check or the install out of the
file stays not taken, for the reason above.

**After E2, and E3.S1's budget.** Counted on E2's head, `22caab8b`, 2026-11-19: `commands/agentCommands.ts` has **797** lines
still: E2 kept the count. E3.S1 (C19) hands the run's exit code to the one function that the
two branches ask, as one more argument on the two lines that call it (`:216`, `:283`); no branch and no line is added, so
the file stays at 797. No lint rule limits the length of a line (`eslint.config.mjs`, read). The spec of E3.S1 states the count.

### 3.7 What grows, and who retires it

| What | How many, after this plan | Who retires it | When it is interrupted |
|---|---|---|---|
| the pin file `known_hosts-<entryId>-<uuid>` of a socket check | one while that check runs on a pinned entry (about 32 s at most), none after | the `finally` of `withWrittenKey` | a killed window leaves `keys/<pid>/`; `purgeMaterializedKeys` (`keyInstaller.ts:280`) of the next window that activates, or of this window's dispose (`extension.ts:216-217`), removes the folder |
| the pin file of an install | one while that install runs or its question is open, none after | the same `finally` | as above |
| the pin file of a bridge | one per LIVE bridge of a pinned entry (one bridge per entry; `start` replaces), plus one per `ssh` that a failed kill left running (N16, change 1.1) | the one continuation on that bridge's `exited` | as above; `dispose` kills every bridge. The bound N16 narrowed holds for the pin file too: a started `ssh` whose kill fails and that never exits keeps its files until the purge |
| a pin file left half written (the write threw part way) | at most one per failed write; its name is random and no `ssh` is given it | the purge only: the writer does not know the path | as above |
| the counterpart of the real runs (E1's smoke, E3): one `sshd` process, its owned temporary folder (config, host keys, log, the login's home), the sockets its forwards leave on this machine | one process and one folder per run, none after; a few kB of text, plus what the install run writes into the owned home | the run that started it: it stops the process and removes the folder and the sockets when it ends, pass or fail | a killed run: the repository's janitor for test leftovers (`research/module_tests.md`, *Test leftovers*); the stories document names the folder so that the janitor's token covers it |

No new process, no new timer, no new continuation in the product: the one of N16 deletes both files. The last row is
the tests' only.

**Projected size.** A pin file is one known_hosts line: about 0.1 kB for an ed25519 key and about 0.75 kB for an RSA
4096 key (a host name of 20 characters; the public blob is 51 or 535 bytes, in base64 68 or 716 characters). A heavy
window with 10 open bridges, one socket check and one install running, all on pinned entries, holds 12 pin files: at
most 12 × 0.75 kB ≈ **9 kB** (about 1.2 kB with ed25519 pins), beside the at most 40 kB of key files that N16 counted
for the same window. Before this plan these roads write no pin file.

**Two calls at once.** Every call writes under its own uuid, so two calls of one entry that overlap (two installs; a
bridge and its socket check; a bridge that replaces another) have distinct files, and each deletes only its own. No
call writes or deletes `known_hosts-<entryId>`, the name that the agent's exec and a Connect terminal use
(`sshUseActions.ts:224`, `research/module_extension.md:257-259`).

**Added by epoch 2.**

| What | How many | Who retires it | When it is interrupted |
|---|---|---|---|
| the answer of the `ssh` program about its version (§3.10): one value in memory per program | one per window and program; only a good answer is kept, as `bridgedSshClientCheck` keeps its own (`bridgedSshClient.ts:117-131`) | the window's end; nothing is written to disk by this plan | nothing to sweep: a killed window takes it along |
| the process that asks it, `ssh -V` | one short run per window and program, and one more per pinned call for as long as no good answer came; under the runner's time limit, which kills the process tree | the runner (`runSshExec`) | as every run of the runner |
| the counterpart of E3, beside the `sshd` of E1's smoke: a second `sshd` (K2), a jump host's `sshd`, a master connection of the client, the stand-ins of the install (`## Epics`, E3), a recording `KnownHostsCommand`, an answerer of DNS questions, an unpacked older client | one set per run of E3, all inside the run's owned folder or inside a container that the run starts; a few MB at most (the unpacked client and `sshd`) | the run that started them: it ends the processes by their recorded pids and removes the folder and the container, pass or fail | a killed run: the repository's janitor for test leftovers, as for E1's smoke; the stories document of E3 names the folder and the container so that the janitor's token covers them |

No new timer and no new continuation in the product. A pin file is still written only for a call that will start `ssh`: a call
that §3.10 or §3.11 refuses writes none.

**Added by epoch 3.** The product gains nothing that grows: C19 is one parameter of a pure function, with no file, no
process and no timer. The real runs gain two things, the tests' only:

| What | How many | Who retires it | When it is interrupted |
|---|---|---|---|
| the program of M11 (d) that records its `-V` start and never answers | one process per road and run of that leg, for about the runner's limit (10 s) | the product's runner, at its limit, by the process tree: that is what the leg measures. If the leg fails, the run's own end removes the process by its recorded pid and start time | a killed run: the repository's janitor for test leftovers, as for every process of E3 |
| the record of identities (E3.S2): the path, the version and the hash of each executable, and the hash of each config text | a few kB of text per run of the whole set | it is part of the results: the numbers go into §10, and the run's file goes with the run's owned folder | nothing to sweep beyond that folder |

The launcher of E3.S2 starts nothing that E1's and E2's launchers did not start: one `sshd` per counterpart, in the run's
owned folder. Its listener-only stop (M3) leaves the session processes of the master alive on purpose; the leg ends them by
their recorded pids and start times when it has read them, as the end of a leg's server does for everything that server
forked (`endServer`, `itestPinnedRoads.cjs:198`).

### 3.8 What does not change

**As E1 built it:** `materializeKnownHosts` and every other function of `hostKeyTrust.ts`; the existing functions of `hostKeyPin.ts` (the
match of sentence C and the words of §3.9 are new pure functions there); both argv builders, except the words of a
pinned call (§3.9); the agent's exec and *Run with Secrets*, except those words on a pinned call; every unpinned call
on every road; Connect, its scan and its terminal line; `sshExecAuth.ts`; `sshBridgeManager.ts`; `bridgeSpawner.ts`;
every purge; every sentence that exists today. A person sees three new sentences, the first in two forms (§3.5).

**In epoch 2 the same holds, with these differences.** The functions that E1 added to `hostKeyPin.ts` and `personPin.ts`
change (`hostKeyWords`, `oneFileWord`, `hostKeyRefused`, `writePersonPin`). A pinned call gets more words (§3.10, §3.12); an
unpinned call gets none of them and stays byte for byte as today. The agent's pinned exec and a pinned *Run with Secrets*
get the same words and the same refusal of a path (§3.11), because they go through the same builder. A person can see three
more sentences (D, E, F). Not changed by epoch 2 either: `materializeKnownHosts` and the agent's reading of an unusable pin
(C3); Connect's road (C1, C4); the `-F` file of a bridged call and its own rule of a path (`bridgedSshConfig.ts`: `ownPath`,
`:167-169`; `unsafeBridgedFileValue`, `:98-100`); the rule of a key file's path (`unsafeSshConfigValue`, `:88-90`); the floor of
the bridged client (`BRIDGED_SSH_FLOOR`, `bridgedSshClient.ts:28`).

**In epoch 3 the same holds, with one difference.** `hostKeyTold` (`hostKeyPin.ts:380`) gains the run's exit code, and its
two callers in `commands/agentCommands.ts` pass it (§3.12, part 4). Nothing else of the product changes: not the words of a
pinned call, not the order in which the pin of a call is decided (`pinOfCall.ts`), not the asker and what it keeps
(`pinClient.ts`), not a sentence's words. The agent's exec and *Run with Secrets* do not call that function, so they do not
change. The scripts of the real runs change (E3.S2), and they are no part of the shipped extension.

### 3.9 The pin file is the only known-hosts file of a pinned call (P1)

**What was wrong.** `UserKnownHostsFile` replaces only the person's own files. `ssh` still reads the system-wide ones
(`/etc/ssh/ssh_known_hosts`, `ssh_known_hosts2`; `ssh -G`), so a key that such a file lists for the host satisfies
`StrictHostKeyChecking=yes` beside the pin. `hostKeyPin.ts:15` says "built from it alone". That is so on every pinned
road of today: Connect, the agent's exec, *Run with Secrets*; it would be so on these three.

**Measured, 2026-11-17, OpenSSH 10.2p1 (Ubuntu), against a public `sshd`** (`ssh.github.com:443`; `BatchMode`, no
login key offered). *Accepted*: the key check passed and the login was reached (`Permission denied (publickey)`).
*Refused*: `Host key verification failed.`, exit code 255.

| # | The pin file holds | Another source holds the host's real key | The words of the call | Result |
|---|---|---|---|---|
| 1 | another key | a file that a config names as `GlobalKnownHostsFile` | today's: `StrictHostKeyChecking=yes`, `UserKnownHostsFile=<pin>` | accepted: the hole of P1 |
| 2 | another key | the same | row 1 and `GlobalKnownHostsFile=<pin>` | refused |
| 3 | another key | a config's `KnownHostsCommand` prints it | as row 2 | accepted: a second source |
| 4 | another key | the same | row 2 and `KnownHostsCommand=none` | refused |
| 5 | the real key | none (`-F none`) | row 4 and `VerifyHostKeyDNS=no` | accepted (the control) |
| 6 | the real key; the file's path holds a space | none | as row 2, the path as it is inside the word | refused: `No ED25519 host key is known for …` |
| 7 | the same | none | as row 2, the path in double quotes inside the word | accepted |

Rows 1-3 gave the same on `github.com:22`. With `ssh -G`: under the words of row 2 both lists are the pin file alone,
also when a config names other files; a command-line option wins over a config. And `-o IgnoreUnknown=<name>` on the
command line REPLACES the config's own `IgnoreUnknown`: a config that needs its own then ends with `Bad configuration
option`, exit code 255. So an option that an older client does not know cannot be guarded that way.

Rows 1, 2, 6 and 7 were measured again on 2026-11-17 against a real `sshd` on the loopback (OpenSSH 10.2p1 on both ends), with
the words as the function of E1.S1 writes them, and gave the same; `ssh.exe -G` of OpenSSH_for_Windows 9.5p2 resolved the
quoted word of row 7 to one file (the client alone). Both are in the spec of E1.S1 (its facts K6 and K7).

**The fix: one function writes the words of a pinned call, and both builders call it.** A new pure function in
`hostKeyPin.ts` (the spec names it) answers, for a pin file, `StrictHostKeyChecking=yes`, `UserKnownHostsFile=<file>`
and `GlobalKnownHostsFile=<file>`: the same path twice, which needs no `/dev/null` against `NUL` on Windows. With no
pin file it answers `accept-new`, as today. `hostKeyArgv` of the bridge (`sshBridge.ts:183-187`) and the expression of
`buildSshExecArgv` (`sshExecCommand.ts:174-176`), which write the same words twice today, both call it.

- **The path is written so that `ssh` reads ONE file** (rows 6-7): both options take a list of files, and the key in
  a file at a bare path with white space is not found (row 6). A path with no white space is written as today, byte
  for byte; a path with white space goes in double quotes (row 7). The spec fixes the exact rule from these rows,
  and what a path that holds a double quote does: it must never reach `ssh` as two paths. (Fixed by the spec of E1.S1,
  2026-11-17: such a path is not named at all. Both options then name a file that holds no key, and `ssh` refuses
  every host.) A path with white space
  is not rare: the editor's storage folder, where `keys/<pid>/` lives (`extension.ts:170`), is under
  `Application Support` on macOS
  (`research/PLAN_mcp_server.md:207`; read, not run on macOS). By row 6 a pinned call of the agent's exec is refused
  there today, and without this rule every pinned call of the three roads would be refused and named by sentence C,
  a false alarm. `todo/PLAN_remote_bridge_scoped.md` (§8) found this for the off-bridge argv on Win32-OpenSSH with
  `-G` only, and left it with no owner; this plan takes it for both builders.
  **Epoch 2 replaces this rule of the path (V2, V3): §3.11.** White space is not the only character that makes `ssh` read
  another file, and a file with no key in place of the pin file starts an `ssh` that the plan said would not start.
- **Why in the builders, and not on the three roads.** The builders are the one road in (`security.md`, *a measure
  applied at some of its sites*). An option set at four call sites would leave the agent's pinned exec on the weaker
  words, and that is the road where nobody watches.

**What it touches outside the three roads: in scope, and the only such effect of this plan.** By enumeration (a
search of `src_vs_code/src` for `UserKnownHostsFile` and for the calls of both builders, 2026-11-17) three places
write these words:

| The place | Its pinned callers | In this plan |
|---|---|---|
| `sshBridge.ts:186` | the bridge (`agentCommands.ts:437`), after this plan | changed |
| `sshExecCommand.ts:176` | the agent's exec (`sshUseActions.ts:224`, `:259`); *Run with Secrets* over `ssh` (`remoteLaunch.ts:516-518`); after this plan the three calls of `agentCommands.ts` | changed: **the agent's pinned exec and a pinned *Run with Secrets* get the same words** |
| `sshCommand.ts:313-330`, the line of a Connect terminal | Connect and every road that opens a terminal | NOT changed: candidate C4 |

For the agent's pinned exec and a pinned *Run with Secrets* two things change. A host whose key is not the pin, but is
listed in a system-wide file, is refused; today it is accepted. And a pin file at a path with white space is read;
today the call is refused (row 6). Nothing else changes there: an unpinned call, `materializeKnownHosts`, and the
agent's fail-open on an unusable pin (C3) stay. Connect's line stays out because its words are shell words per
platform with a scan of their own (`test/shellQuotingRoadScan.test.ts:78-79`), and its real run is a terminal; until
C4, Connect's `ssh` reads the system-wide files beside the pin, as today.

**Not closed by E1, closed by epoch 2: the sources that only an `ssh` config turns on** (V1; it was candidate C2, and C17 for
`VerifyHostKeyDNS` alone). As E1 left it: `KnownHostsCommand` (row 3) can be
named on the command line only from OpenSSH 8.5; an older client stops at the unknown option, so every pinned call
would fail there, and `IgnoreUnknown` cannot guard it (above). `VerifyHostKeyDNS` is off by default; read in the
manual, not measured (it needs a signed zone). The system-wide files are read by default; these two are read only
when the person's or the machine's own config says so. `-F none` is no answer: these roads honour the person's
config (a jump host, an alias). §3.10 says how both are turned off, and what a client older than 8.5 gets.

**What a pinned call no longer reads:** the `@cert-authority` and `@revoked` lines of a system-wide file (the manual;
not measured). A pin is one plain key, so that is what "pinned" means. **Windows** is read, not run: E3's M13 measures the
client alone, and a login on Windows stays C6.

### 3.10 A pinned call asks no other source of trust (epoch 2, V1)

**What is wrong.** §3.9 made the pin file the only FILE. Two more sources of host keys exist, and a config turns them on.
Read on 2026-11-18 in the manual of the local client (`ssh_config(5)`, OpenSSH 10.2p1), by the keywords that name a source
of host keys: `UserKnownHostsFile`, `GlobalKnownHostsFile` (both the pin file since E1), `KnownHostsCommand` ("a command
to use to obtain a list of host keys, in addition to those listed in" the two files) and `VerifyHostKeyDNS` (with `yes`
"the client will implicitly trust keys that match a secure fingerprint from DNS"). `UpdateHostKeys` is no source: it adds
keys to the user file after the host was authenticated, and that file is the pin file of one call, deleted with it. The
spec of E2 repeats this enumeration and says how.

**The fix: the one function of §3.9 writes two more pairs for a pin file.**

- `-o VerifyHostKeyDNS=no`, on every pinned call. The option is old (read, not measured: since OpenSSH 3.8; C17), so every
  client knows it.
- `-o KnownHostsCommand=none`, on every pinned call of a client that knows the option. It came with OpenSSH 8.5 (§3.9;
  read, not measured on an older client), and a client that does not know an option on its command line ends with
  `Bad configuration option`. So the word cannot be sent blindly, and it cannot be left out blindly.

**Measured 2026-11-18, OpenSSH 10.2p1, `ssh -G`, the client alone:** under a config that says `KnownHostsCommand /bin/echo x`
and `VerifyHostKeyDNS yes`, the client resolves `verifyhostkeydns true` and `knownhostscommand /bin/echo x`; with the two
pairs on the command line it resolves `verifyhostkeydns false` and no `knownhostscommand` line. That a login is then
refused was measured for the command on 2026-11-17 (§3.9, row 4). For DNS it is not measured: E3, M10.

**The answer for an older client: the client is asked what it is, once, and there are three answers.**

| What the `ssh` program says of itself | The words for `KnownHostsCommand` | Why this is not a hole |
|---|---|---|
| a version at or above 8.5 | `KnownHostsCommand=none` | the source is off |
| a version below 8.5 | none | such a client has no `KnownHostsCommand`: a config line that names it ends the client, or the client passes it over when the config's own `IgnoreUnknown` covers it. So the source cannot be on there. Read, not measured: E3's M11 runs a client older than 8.5 |
| nothing that can be read (the question could not be started, it did not end with 0, its answer starts with no version) | the pinned call is refused before it starts, with sentence F | a pinned call never runs with the source maybe on |

- **How it is asked, reused:** `ssh -V` of the program that the call will start, and the version at the very start of its
  stderr: the token `VERSION_TOKEN` (`bridgedSshClient.ts:33`) that the bridged road already reads. The bridged road's own
  check (`bridgedSshClientCheck`, `:117-131`) asks through the runner with a time limit and keeps a good answer per program
  for the window; a bad answer is asked again. The spec decides whether that function is shared or its parts are; no second
  reading of a version is written. The bridged road's floor (8.9, and 9.5 on Windows) is another question and does not
  change: a pinned call off a bridge has no floor, only these three answers.
- **Where the answer enters:** the function that writes the words cannot be called for a pin file without it. As N16's
  reporter and E1.S2's pin writer are required parameters, a builder that names a pin file and no answer does not
  compile (the spec chooses the type).
- **Where the refusal stands:** where the pin of the call is decided, before a pin file is written. On the three roads
  that is the pin writer (`writePersonPin`, `personPin.ts:45-55`), whose refusal a road already reads (§3.2, item 2). On the
  agent's exec and *Run with Secrets* it is where their pin file is made (`sshUseActions.ts:236`; `remoteLaunch.ts:518`
  takes the prepared one): the spec names the place and the shape of the refusal, by the precedent of §3.11.
- **An unpinned call is not asked and gets no new word.**
- **The order as E2 built it** (read 2026-11-19, `decidePinOfCall`, `pinOfCall.ts:51-62`; the baseline of epoch 3,
  decision 15). (1) An entry with no saved host key is asked nothing (`:53`). (2) The rule of the path is asked of the whole
  pathname that the pin file would have (`:56`): a refused path ends the call here, before any `ssh` of any kind. (3) The
  client is asked (`:60`): `ssh -V` starts, unless the asker of the window holds a kept answer. (4) Only then the pin file is
  written (`:68`), and the write is what answers that a saved key cannot be used, or throws. So sentence E comes before the
  question, and sentences A, B and F after it. What the asker keeps (`pinClient.ts:84-96`): the answer of a client that
  knows the option, per program word, folder and `PATH`, for the window's life; an older answer and an unreadable one are
  asked again at every pinned call. One question is bounded by the runner's limit, 10 s (`CLIENT_CHECK_TIMEOUT_MS`,
  `bridgedSshClient.ts:81`), and the person sees no sign while it runs (C20).
- **Two boundaries, not one (epoch 4; §1.3, Y4).** 8.5 is the boundary of this section: the option `KnownHostsCommand`
  (`KNOWN_HOSTS_COMMAND_SINCE`, `pinClient.ts:28`). It stays. How a client reads the VALUE of a known-hosts option changes
  at another version, 8.7 (§3.11). The product asks the client for the first boundary alone, because its words for the path
  are the same for every client. So no word of a pinned call depends on 8.7; only what a control expects does (decision
  19). **Seen by probe P3 of E3.S3** (2026-11-24, OpenSSH 8.4p1; a probe, not a row): the asker reads that client as
  older, the words for it are five pairs with no `KnownHostsCommand`, and a login with them was accepted by K1. **Not
  measured, and no row measures it:** a client of 8.5 or 8.6, which knows the option and is read to have the older parser.
  The release evidence says so (decision 22).

**Sentence F** (new; the client cannot be asked). The words are the spec's; the contract: it says that no connection was
started, that the reason is the `ssh` program on this machine and not the host, and it holds the exit code and no other
part of the program's output (as `clientVerdict` does, `bridgedSshClient.ts:58-63`). The baseline:

```text
CredsForDevs could not read the version of the ssh program on this machine (exit code <n>), so it did not start a connection that has to check the saved host key of "<name>". Nothing was sent to that host.
```

**What it does not touch.** A bridged exec call: its `-F` file is the only config that its `ssh` reads, and the file names
neither source (read 2026-11-18: a search of `src_vs_code/src` finds `KnownHostsCommand` and `VerifyHostKeyDNS` in
`hostKeyPin.ts` alone, in a comment); its measurements are the bridge plan's. The nested `ssh` of a jump host: it gets none
of the outer's `-o` options (§4, G2's H1), so a hop's key is checked from the person's own sources, as before. Connect's
terminal line: C4, which now also lacks these two pairs.

### 3.11 The pin file reaches `ssh` as the one intended file, or the call does not start (epoch 2, V2, V3)

**What is wrong.** `oneFileWord` (`hostKeyPin.ts:186-191`) knows two cases: white space, which it quotes, and a double quote,
for which it names `/dev/null`. `ssh` reads the value of both options as a config line, and more characters than these two
change what it reads.

**Measured 2026-11-18, OpenSSH 10.2p1, `ssh -G -F /dev/null -o UserKnownHostsFile=<word> -o GlobalKnownHostsFile=<word>`,
the client alone** (this machine has no `sshd`). It repeats K8 of the spec of E1.S1, which also asked `ssh.exe` of
OpenSSH_for_Windows 9.5p2 for a, c and d.

| # | The word | What the client resolves | So |
|---|---|---|---|
| a | `/tmp/creds-a'b'`, bare | `/tmp/creds-ab` in both | ANOTHER path. Not fail closed: a key in a file there is trusted |
| b | the same in double quotes | `/tmp/creds-a'b'` in both | double quotes keep it |
| c | `/tmp/creds-a'b`, bare | `invalid quotes`, the client ends | every pinned call of such a folder fails |
| d | the same in double quotes | `/tmp/creds-a'b` in both | double quotes keep it |
| e | `/tmp/a"b`, bare | `invalid quotes` | no spelling is one file for every client (K8 g) |
| f | `\\srv\share\keys\k`, bare and in double quotes | `\srv\share\keys\k` in both | another path; a storage folder on a UNC path |
| g | `/tmp/creds-%h-x`, bare and in double quotes | the user list: `/tmp/creds-example.invalid-x`; the system-wide list: `/tmp/creds-%h-x` | the two words name two files |
| h | `/tmp/creds-%%h-x` | the user list: `/tmp/creds-%h-x`; the system-wide list: `/tmp/creds-%%h-x` | no one spelling serves both words |
| i | `/tmp/creds-${HOME}-x`, bare and in double quotes | the user list: the variable's value in its place; the system-wide list: as written | the same |
| j | `/tmp/creds-%Z-x` | `vdollar_percent_expand: unknown key %Z`, the client ends | fails, with a cause that no sentence names |
| k | `/tmp/a b` in double quotes; `/tmp/it's here` in double quotes | themselves | white space and an apostrophe together are kept |

**Not measured:** a login for any of these rows (E3: M7, M12); a client older than 8.7, which reads such a value with
another tokenizer (K8; E3's M11 runs one); Windows beyond K8 (E3's M13, the client alone).

**Two parsers (epoch 4; measured since, `ssh -G` only, no login).** The table above is the answer of a client from 8.7 on.
A client before 8.7 reads the value of both options with an older parser, which knows double quotes and no apostrophes
(read in `misc.c` and `readconf.c` of `V_8_4_P1`). Two rows differ on it, and both were measured on OpenSSH 8.4p1:

| The word | A client before 8.7 (8.4p1) | A client from 8.7 on (10.2p1) | Measured |
|---|---|---|---|
| a pair of apostrophes, bare (`/tmp/kh/x'y'z`; row a) | itself, the apostrophes kept: the one intended file | `/tmp/kh/xyz`: another path | the lead, 2026-11-25, the user list (`research/module_tests.md`, *The apostrophes of a bare word on an older client*) |
| the same in double quotes (row b) | itself | itself | the same |
| an equals sign, bare (`<dir>/data=prod/…`) | split at the sign: two names, neither the intended file | itself, whole | probe P3.5 of E3.S3, 2026-11-24, both lists; 10.2p1 for E2's review fix (the docblock of `checkedPin`, `hostKeyPin.ts`) |
| the same in double quotes | itself, whole, the sole value of each option | itself | probe P3.4 of E3.S3, both lists |

So "not fail closed" of row a is a fact of the newer parser. On the older parser a bare pair of apostrophes names the
intended file, and the word that names another file there is a bare equals sign. The product's word is in double quotes for
both kinds, and both parsers read it as the one file. **Not measured:** the other rows of the table above on a client before
8.7 (test 34 asks them with `ssh -G`, and M11 (b) shows the logins for M7's shapes and for the equals-sign pair); where between 8.4 and 10.2 each answer
changes (8.7 is read, not measured); a client of 8.5 or 8.6.

**The fix: one rule decides, before anything is written or started, and it has three answers.**

| The pin file's path holds | The answer | Why |
|---|---|---|
| none of the characters below | the path as it is, byte for byte as today | no call that works today changes |
| white space, or an apostrophe | the path in double quotes, in both words | rows b, d, k; §3.9, row 7 |
| a double quote; two backslashes in a row; a backslash before an apostrophe; a percent sign; the two characters `${`; a control character | REFUSED, with the field named | rows e-j. No spelling was found that every client reads as the one file in BOTH words. The bridged file's rule refuses the same kinds before the spawn (`unsafeSshConfigValue`, `bridgedSshConfig.ts:88-90`; `unsafeBridgedFileValue`, `:98-100`: its Y5 is the UNC folder) |

- **The exact set is the spec's, from a measurement per client that the release names.** The spec may always move a kind
  from "written" to "refused". It may move a kind from "refused" to "written" only with a measurement for that kind on
  every such client, **with a FIXED expectation per parser** (revised for epoch 4: decisions 19, 20; the text of epoch 2
  asked for "the collision measurement of E3's M7 for it, on every such client", and a client before 8.7 has no such
  collision). The measurement has two parts on each client. (1) The written word, as both options, resolves to exactly the
  intended pathname in both lists (`ssh -G`). (2) The intended file alone supplies trust, on the roads: with the right key
  in the intended file the login is accepted, and with it only in another file that a spelling of the path could name, the
  login is refused and the counterpart logs no authentication attempt. What the BARE word does is fixed per parser before
  the run and shown beside it, for EACH parser: the bare word either names another file (a collision: then a collision
  control is required on that parser, and K2 must accept it through that file, as M7 shows it from 8.7 on) or names the
  intended file (no collision: then no collision control is asked, and the bare-word outcomes are those of the intended
  file alone, as M11 (b) shows them for a pair of apostrophes before 8.7, and for an equals sign from 8.7 on). An outcome
  that differs from the fixed expectation fails the measurement on that client. (This wording is the coai round of the
  re-review for epoch 4, part 1, finding 0, accepted: the text before it asked for M7's collision on every newer client,
  which a kind with no collision there cannot show.) Both moves are inside this rule, so neither is a
  plan change.
- **As merged (#388), one more kind is written in double quotes: an equals sign** (`hostKeyPin.ts:226`, `/[\s'=]/`; a
  review fix of E2's pull request). It moved from "written bare" to "written in double quotes", which no client reads as
  another file (the table of the two parsers above). In epoch 3 no row had a leg for it (the lead's answer to Q1 of E3's
  stories document, consult `9551f020`); the pure tests and probe P3.4 hold it. Since the re-review for epoch 4, M11 (b)
  has the equals-sign pair: the collision that this quoting repairs on a client before 8.7, and the record that a client
  from 8.7 on has none.
- **No stand-in file.** `NO_KEY_FILE` (`hostKeyPin.ts:138`) goes. The function that writes the words takes only what the
  rule answered as "a word", so a raw path cannot reach it and a refused path has no word to give (the spec chooses the
  type). E1.S1 dropped a refusal from the builders because it needed a branch at every call site (its K3, K4); the
  refusal now stands BEFORE the builders, where the pin of the call is decided, so the builders gain no answer.
- **Where the refusal stands:** as in §3.10. On the three roads the pin writer answers it, before `materializeKnownHosts`
  writes: no pin file, no `ssh`, the key file of the call deleted by the guard as for every refusal. On the agent's exec
  and *Run with Secrets*, where their pin file is made. The precedent for the shape: `bridgedConfigText` answers
  `{ ok: false, field }` and echoes no value (`bridgedSshConfig.ts:239-250`), and `bridgedSshRefusals.ts:159-162` turns a
  field into a sentence.
- **What decides is the path of the storage folder**, with `keys/<pid>/`: the rest of the name is the sanitised entry id
  and a uuid (`materializedKeys.ts`), which hold none of these characters. The rule is still asked of the whole path.
- **The key file's path (`-i`) is not this rule's.** It is one argv word that `ssh` does not read as a config line, and it
  has its own rule (`unsafeSshConfigValue`).
- **Eight kinds since entry 2.1, and which of them a storage folder can cause** (epoch 3; read 2026-11-19,
  `REFUSED_PIN_PATHS`, `hostKeyPin.ts:157-166`). The table above names six; the spec of E2.S2 measured two more, and the rule
  refuses them too: a backslash at the END of the path (in double quotes: `invalid quotes`) and a tilde at its START
  (expanded in the person's list alone). The rule is asked of the complete pathname, and the pathname is made from the storage
  folder, `keys/<pid>/` and a file name that ends with a uuid (`knownHostsPath`, `hostKeyTrust.ts:66-68`). So six kinds can
  come from a storage folder: a control character, a double quote, two backslashes in a row, a backslash before an
  apostrophe, a percent sign, the characters `${`. Two cannot: no pathname ends with a backslash, whatever the folder
  (a folder whose own name ends with one gives a pathname with one backslash INSIDE, which the rule writes bare: E3's M7, e),
  and no absolute folder starts with a tilde. The rule holds both for a caller that hands it another path; the pure tests
  hold them, and E3's M12 asks the rule and the client alone for them and drives the roads for the six.

**Sentence E** (new; the path cannot be written for `ssh`). The contract: nothing was sent; the reason is the folder of the
extension's files on this machine, not the host and not the saved key; it names the kind of character and echoes no path.
To the agent the answer names the field and no value. The baseline for the person:

```text
The saved host key of "<name>" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has <kind> in its path, and ssh would read another file in its place.
```

`<kind>` is one of: `a double quote`, `two backslashes in a row (a network path)`, `a percent sign`, `the characters ${`, `a
control character`, `a backslash before an apostrophe`.

**What it costs.** A person whose storage folder is on a UNC path, or holds a percent sign or a double quote, can use no
pinned call without a terminal. That is so today: by rows e-j each such call fails or reads another file. After E2 it is
said, before anything connects. A storage folder with an apostrophe works for the first time (row c).

### 3.12 A sentence names a cause only when the call saw it (epoch 2, V4, V5)

**What is wrong.** `hostKeyRefused` (`hostKeyPin.ts:214-216`) is true for a pinned call whose stderr holds the line `Host key
verification failed.`. Sentence C then says that "<name>" did not present its saved host key. Measured for the spec of
E1.S3 (L9): a refused key of a hop of the person's own `ProxyJump` prints the same lines (h); a host that passed the check
can print the line itself (i); and under `LogLevel QUIET` nothing is printed at all (g). C12's remedy, to ask for the LAST
line, is not built: it tells a hop apart, but a remote text can END with the line (`97eb6bb5`).

**Three parts.**

1. **A pinned call states its own log level.** The function of §3.9 writes one more pair for a pin file,
   `-o LogLevel=ERROR`. `ERROR` and not `FATAL`: under `FATAL` the client prints the verification line alone (L9 g), without
   the line that part 2 reads. **Measured 2026-11-18, OpenSSH 10.2p1, against a public `sshd`** (`github.com:22`,
   `BatchMode`, no login key offered, the pin file with another ed25519 key): with `-F none` 15 lines; under a config that
   says `LogLevel QUIET`, exit code 255 and an empty stderr; under the same config with `-o LogLevel=ERROR` on the command
   line, the 15 lines again. `ssh -G` resolves `loglevel ERROR` there. **Not measured:** a config that sets the level in
   a `Match` block (read: the first value wins, and the command line is read first); what a road loses of the lines that
   `ssh` prints at `INFO`. The spec lists what each road reads from stderr; E3's M5 compares the sentences of a host that
   is down and of a refused login with those of an unpinned entry. An unpinned call keeps the person's level.
   **Seen when M5 was built (epoch 4; E3.S8, OpenSSH 10.2p1):** `ssh -G` prints a config's `LogLevel QUIET` as
   `loglevel SILENT`, the first name of that level. It is one level with two names, so a check that reads `-G` takes
   either name and records which one was printed (M5, e).
2. **Sentence C needs evidence that `ssh` judged the pin of THIS call.** The evidence is `ssh`'s own line
   `Offending <type> key in <the pin file of this call>:<n>`, beside the verification line. Only the `ssh` that was given
   the words reads that file, and its name holds the uuid of this call:
   - a nested `ssh` of a jump host gets none of the outer's words (§4, G2's H1): it reads the person's own files, and its
     lines name those (read; L9 h says "printed by the nested `ssh`");
   - a remote command never learns the path: it is a word of the local argv.
   **Measured 2026-11-18** (the run of part 1): the line holds the whole path (115 characters there), ends with `:1`, and
   stands before the verification line. The line `Add correct host key in …` is cut at 100 characters, so it is not the
   evidence. **Measured by the E2.S3 spec, 2026-11-18** (OpenSSH 10.2p1; `ssh.exe` of OpenSSH_for_Windows 9.5p2 for the last item):
   a path in double quotes is printed with no quotes; a backslash is printed as two; a byte outside printable ASCII is printed
   as a backslash and three octal digits (`\ooo`); `ssh.exe` 9.5p2 prints the same `Offending` line (13 lines) with every
   backslash doubled. The match reads the printed name back before it compares. **Not measured:** a hop on the roads (E3's M5 f),
   and a login on Windows (C6, because E3 makes no login there). E3 measures the quoted path again on the roads (M7). A miss
   shows sentence D: it never shows a false sentence C.
3. **The verification line without that evidence gets sentence D,** on a pinned call. It covers a hop's refused key, a
   config that renames the lookup (`No <type> host key is known for …`, below), and a text that only looks like `ssh`'s. It
   says what was seen and names no host as the cause. **A host that offers no key of the saved type is not among them**
   (measured by the E2.S3 spec, 2026-11-18): `ssh` prints the 15 lines with `Offending <the saved type> key in <the pin file>:1`,
   so it gets sentence C with its evidence, and that is true for it. The line `No <type> host key is known for <name>` comes
   when `ssh` finds no key under the name it looks up: a config's `HostName` alias or `Port` renames the lookup (measured), or the
   pin file is empty.

| A pinned call's run ended, and its stderr holds | The person is shown |
|---|---|
| the verification line and the `Offending` line with this call's pin file | sentence C (its words do not change) |
| the verification line, and no such line | sentence D |
| neither | the sentences of before (a host that is down, a refused login, a time limit), as on an unpinned entry |

An unpinned call is shown the sentences of before, whatever its `ssh` printed, as E1 built it.

**Part 4 (epoch 3, C19; decision 14): the run's exit code is asked first.** The three parts above ask the TEXT of the run
alone, and that is one condition short (W2, §1.2).

- **What is wrong.** `ssh` ends with 255 when it refuses a host's key (measured, §3.5 and part 1). A run that ended with 0
  is a run whose `ssh` checked the host's key, logged in, and ran the remote command to its end. When the stderr of such a
  run holds the verification line, the remote side wrote it: a profile of the login, or the command itself. As E2 built it, such a run is told sentence D. The install then stops before its question although its
  probe was answered, and the socket check says "could not be checked" although its answer is there to read. And the
  sentence says that the connection "ended with" the line, which is not so. The old note on C19 said that "nothing is
  connected": it is false, the login and the command already ran (`dbe12934`).
- **The fix.** The one pure function of this section (`hostKeyTold`, `hostKeyPin.ts:380`) takes the run's exit code, as
  the runner answers it (`number | null`, `sshExecRunner.ts:58`), and answers NOTHING when it is 0, whatever the stderr
  holds. Every other answer is as parts 2 and 3 say. The order of its questions: no pin of the call, nothing; exit code 0,
  nothing; no verification line, nothing; the evidence of part 2, sentence C; else sentence D.
- **The parameter is required.** A caller that hands no exit code does not compile, as with N16's reporter, E1.S2's pin
  writer and E2's checked pin: the compiler proves that no caller is missed. There are two callers (a search of
  `src_vs_code/src` outside the tests, 2026-11-19): the install's probe (`agentCommands.ts:283`), which has the code of
  `runRemote` (`:341`, `:350`: -1 when the runner has none), and the socket check's mode check (`:216`), which has the
  runner's own (`outcome.exitCode`). Both hand it over on the line that exists (§3.6).
- **What a road then does with such a run.** Nothing new: it goes on as for a run without the line. The install reads the
  probe's answer and reaches its question; the socket check reads the socket's mode.
- **Sentence C under exit code 0.** It is not shown either. A run that ended with 0 was not refused by `ssh`, so no line of
  it can be `ssh`'s refusal of this call's pin. A remote side cannot print the evidence of part 2 anyway (it never learns
  the pin file's name), so this is the same answer by a second reason.
- **What it does not change.** A run with no exit code (a time limit, a start that failed) and a run that ended with any
  other code than 0 are told as parts 2 and 3 say. A remote command that prints the line and ends with 255 (M5, g), or
  with another code than 0, is still told sentence D: its run did end, with the line in its text, and sentence D names no
  host as the cause. Not taken: to show sentence D for 255 alone. A remote command can end with 255 itself, so the code does
  not prove whose line it is, and the narrower rule was not asked for.

| A pinned call's run ended | and its stderr holds | The person is shown (epoch 3) |
|---|---|---|
| with 0 | anything, the verification line included | nothing about a host key; the road goes on |
| with another code, or with none | the verification line and the `Offending` line with this call's pin file | sentence C |
| with another code, or with none | the verification line, and no such line | sentence D |
| with another code, or with none | neither | the sentences of before |

The spec of E3.S1 is a security judgement: it is Fable's (`subagent-models.md`), outside the cornerstone quota. Tests 28-32
of §5 hold it; E3's M5 measures it on the roads, with exit code 255 (g) and with 0 (h).

**Sentence D** (new). The contract: it says that the connection ended with that line, and that `ssh` did not name this
entry's saved key as the reason; it names a jump host of the person's own config as a possible place; it never tells the
person to replace a saved key; and it names no in-product road to reconnect (revised by E2's code gate: see *Sentence C against P2*, §3.5). The baseline:

```text
The connection to "<name>" ended with "Host key verification failed", and ssh did not name the saved host key of this entry as the reason. It can be the key of a jump host in your own ssh config, which your own known_hosts file checks. Do not replace a saved key because of this message. Connect SSH on this entry checks this host's key again and asks before it changes anything.
```

**Where,** as in §3.5: the install's probe and the socket check's mode check. The bridge's form is a message, for C and
for D, and its opening says only what the check knows. With sentence C it opens with `The bridge to "<name>" is not open: `,
as E1 built it (P3): the host presented another key to the check, and the bridge's own `ssh` met the same host with the
same words. With sentence D it opens with `The bridge to "<name>" could not be checked: `: the tunnel may be up (a remote
text that only looks like the line; E3's M5 g) or down (a hop's refused key; M5 f), and the tree row says which. One pure
function of `hostKeyPin.ts` answers the sentence or nothing, so the two branches of the roads keep their size (§3.6).

**What stays open, and is said.** A pinned call that ends with 255 and prints nothing although it states its level (a
client that does not keep the word) shows the sentence of before. E3's M5 (e) fails if that happens on the client it
runs; on another client it is not known. The log line of the socket check that says the socket "is there" for an empty
answer is C7. The install's second run keeps today's sentence (§3.5); E3's M2 records it word for word. **A hop under a quiet config** (measured by the
E2.S3 spec, 2026-11-18): a jump host whose key the nested `ssh` refuses, under a config that says `LogLevel QUIET`, ends with
exit code 255 and an empty stderr, because `LogLevel=ERROR` is a word of the outer command line and does not reach the nested
`ssh`. The roads show the sentences of before. E3's M5 has a quiet config (e) and a hop (f), and no row with both.

## 4. The boundary with the G2 plan

The G2 plan ([PLAN_bridge_no_connection_sharing.md](../research/PLAN_bridge_no_connection_sharing.md); merged 2026-11-17, #376) carries
this table from its side in its §6 (`planning-docs.md`, *a boundary between two plans is named on both sides*). On N16's
side, G1 of its §5 names this plan. **Revised on 2026-11-17 against what G2 shipped** (`main` at `ca99cd91`): the first two
rows say what is in the code now, and the rows below the builders' row were added from G2's follow-ups H1-H5 (its §9).

| Item | Which plan builds it | The other plan's part |
|---|---|---|
| connection sharing turned off on the bridge's `ssh -N -R`: `FIXED_OPTIONS` ends with the constant `NO_CONNECTION_SHARING`, the words `-o ControlPath=none -o ControlMaster=no` (`sshBridge.ts:174-180`) | G2, shipped | G1 is built on it |
| connection sharing turned off on the four bounded runs (the socket check's two, the install's two): every argv of `buildSshExecArgv` carries the same constant (`sshExecCommand.ts:47`, pushed at `:185`; a bridged call has the two among its six, `:57-63`), so these four runs, the agent's exec and *Run with Secrets* have it, and no call site passes an option for it | **G2**, shipped (its decision 1, scope (b), consult `925f4f14`) | with the two options a pinned call makes a connection of its own, so its pin words are read. G2 measured both sides (the docblock of the constant, `sshExecCommand.ts:20-46`; section 9 of `scripts/ssh-agent-itest.cjs`): with a master up, a call without them used neither its own key nor its own pinned host key; with them a wrong pin ends with `Host key verification failed.`. E3's M3 measures it on the roads |
| the pin on all five `ssh` runs, the per-call pin file, the three sentences | G1 | none |
| the words of a pinned call in both argv builders: the pin file as both known-hosts files, its path as one file (§3.9) | G1 | none; G2's options are other words of the same two argvs |
| `commands/agentCommands.ts`, `test/personRoadsWorld.ts`, and the two builders `sshBridge.ts` and `sshExecCommand.ts` | both plans edit them | G2 first; G1 measures §3.6 again and repairs its line references after G2 has merged. Done 2026-11-17: G2 changed the two builders, and neither `commands/agentCommands.ts` nor `test/personRoadsWorld.ts` |
| the literal of a whole pinned bridged argv that G2's test holds (`test/sshExecCommand.test.ts:316-321`, used at `:328-332`: "a bridged argv is byte for byte the one before G2") | G2 wrote it | G1's §3.9 gives a pinned bridged call the third option too, so the argv of that test has one pair more than the literal, `-o GlobalKnownHostsFile=<file>`. E1.S1 changes that one test and names it (§5, test 12): the literal stays as G2 copied it, and the test takes G1's pair out before it compares. The six options of a bridged call and their place do not change |
| the hop legs of a jump host (G2's H1): a nested `ssh` gets none of the outer's `-o` options | no plan yet (G2's §9) | the same holds for the pin words. The destination's key is checked by the outer `ssh`, which carries them; a hop's own key is checked by the nested `ssh`, from the person's files. The three roads pass no jump of the entry; a `ProxyJump` of the person's config is theirs. Read, not measured |
| `git` over SSH (G2's H2: `GIT_SSH_COMMAND`, `gitRemote.ts:124`) | no plan yet | not a road of this plan: that string says `accept-new` and names no known-hosts file, and no builder writes it. Whether that road has a pin to enforce was not read |
| a tunnel whose window was killed without `dispose` (G2's H3) | no plan yet | its pin file stays as its key file does, until the purge (§3.7) |
| words in the `extra` of `buildBridgeArgv` (G2's H4: `-S`, `-M`, `-O` would win over G2's options) | a follow-up of G2 | for the pin words only `-o` spellings exist (read in the manual), and the builder's stand before `extra`, so a caller's come too late; E1.S1 tests it, also with the real `ssh -G`. Production passes no `extra` |
| one launcher for every `ssh` without a terminal (G2's H5) | a follow-up of G2 | the words of §3.9 are in the same two builders, so an `ssh` that no builder shaped would have neither G2's options nor a pin. E1.S1's scan holds the list of places that write the words and of the callers of its function |

**The order, and why:** G2, then G1 (§2, decision 4). With connection sharing on, a client that finds a master
connection to the host does no key exchange, so `StrictHostKeyChecking` and `UserKnownHostsFile` are not read at all.
The second row was this plan's own reading of the code, 2026-11-17: the reason of decision 4 holds for the four bounded
runs as much as for the bridge. A bridge that became a master would even carry its own socket check 1.5 s later.
Read when this plan was written; G2 then measured it and shipped the two options in both builders (the first two rows).

**Disjoint:** G2 writes no pin file, no known-hosts option and no sentence about a host key; G1 adds no option about
connection sharing. The two rows about the builders were added at the plan round (P1); the G2 plan's §6 carries them
from its side. The rows from H1-H5 name gaps that G2 found and that the pin words share; none is built here.

**Epoch 2 moves nothing of this division.** The pairs that E2 adds (§3.10, §3.12) are words of the same two argvs, written
by the same function as the pin words; G2's two options are not touched, and E2 adds no option about connection sharing.
M3 is E3's row now, with a stop of the listener alone that keeps the master alive (`## Epics`). The bridged exec call and
its `-F` file belong to [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md): E2 changes neither, and reuses that
file's reading of a client's version and the kinds of path it refuses, without changing them (§3.10, §3.11). If a spec of
E2 wants one shared function in place of two, that is a question to the lead and a line in both plans, not a silent move.

**Epoch 3 moves nothing of it either.** C19 changes one function about what a person is told, and no word of an argv.
E3.S2 changes the launchers of the real runs in `scripts/`: `itestSshd.cjs` is the file that G2's section 9
(`itestNoSharing.cjs`) and the bridge plan's rig (`itestBridgedRig.cjs` and its sections) start their `sshd` with too. The
change keeps what they call as it is (the same exports, the same defaults), so their sections run as before, and the story
shows it where they run. As E2 built it, the reading of a client's version is shared with the bridged road by one export of
`bridgedSshClient.ts` (`versionTokenOf`); the bridged road's own rule and floor did not change.

**Epoch 4 moves nothing of it.** It changes no word of an argv and no script of another plan. The floor of the bridged
client (8.9, and 9.5 on Windows) is above 8.7, so a bridged call meets the newer parser only; an older client is a client
of the roads off a bridge (M11).

## 5. Tests (RED first)

Each new assertion is watched RED on the code before its change, then GREEN. The commands are driven as the extension
registers them, through N16's world `test/personRoadsWorld.ts`, which gains: a pin on the entry (`hostKey`), a real
temporary storage folder (the repository's owned-folder helper, as `test/hostKeyTrust.test.ts:128`), and an `ssh`
stand-in that reads, at the moment of each run, the file that the argv names. `materializeKnownHosts` and
`forgetMaterializedKey` are the REAL ones in every pin test, so the files are real files.

1. **Guard, green before and after:** an unpinned entry (no `hostKey`, an empty one, one of whitespace) gives every one
   of the five runs `StrictHostKeyChecking=accept-new` and no `UserKnownHostsFile`, and writes no file.
2. **The socket check, pinned:** both runs carry `StrictHostKeyChecking=yes` and the SAME `UserKnownHostsFile`; its
   name is `known_hosts-e1-<uuid>` in `keys/<pid>/`; at each run the file is on the disk and holds the entry's line; it
   is gone when the check has ended, on each way out that N16 lists (a normal check, a missing socket, an unreadable
   mode, a wide mode, no argv, a run that throws).
3. **The install, pinned:** the probe and the install run carry the same file; it is on the disk while the question is
   open; it is gone after a success, a failed install, the probe's timeout, a blocker, the person's *no*, and a
   question that throws.
4. **The bridge, pinned:** the argv handed to the spawner carries the pin; the file is on the disk after the command
   has returned; it is deleted once when `exited` settles; *Close* alone deletes nothing until the process has ended;
   a replacement deletes the first bridge's pin file and not the second's; no argv, a throw while the argv is built and
   a throwing `start` delete it at once and the same error goes on.
5. **The two deletes are independent:** a password credential with a pin (no key file: the pin file is written and
   deleted); a key that the person named by its path, with a pin (the person's file is never deleted, the pin file
   is); a stored key with no pin (N16's tests, unchanged).
6. **An unusable pin is refused:** a text that does not parse, and a parsed key on a host that cannot form a line. Per
   road: no `ssh` run at all, no bridge started and no *bridged* row, sentence A where §3.5 says, the key file of the
   call deleted, nothing left in the folder. **The form follows the login (P2):** a stored key and the person's own key
   file get the key form; a password entry gets the password form, word for word, and never the key form's advice.
   An entry with no credential is refused by its credential before any pin is read: it shows that refusal and no
   form of sentence A (§3.5).
7. **A pin write that fails** (the stand-in of `./hostKeyTrust` throws, and separately a real folder that cannot be
   written): sentence B, no `ssh` run, the key file of the call deleted (a real file).
8. **Two calls at once:** two installs of one entry that overlap, and a bridge with its socket check, hold distinct pin
   files; each end deletes only its own; a file `known_hosts-e1` that was in the folder before is still there after.
9. **Sentence C:** the stand-in answers exit code 255 and the stderr that §3.5 measured. The install shows sentence C
   and not "did not answer the probe". **The bridge's is a visible message (P3):** the test drives the registered
   command `credSshManager.openRemoteBridge`, lets its socket check run, and finds exactly one `showErrorMessage`
   with `The bridge to "<name>" is not open: ` and sentence C; a log line alone does not pass. Guard: the same stderr
   on an UNPINNED entry shows today's sentences and no such message; a stderr of a host that is down, and one of a
   refused login, on a PINNED entry show today's sentences too.
10. **The helpers** (`test/writtenKey.test.ts`, extended): the writer is called once, inside the span, only for an `ok`
    credential; `run` / `start` get the refused value for a refused pin and are still called; a writer that throws (it
    must not) still deletes the key file; both files go through one continuation on the bridge.
11. **A scan that stays** (in the style of `test/launchRoadScan.test.ts:283-319`): every call of `buildSshExecArgv` and
    of `buildBridgeArgv` in `commands/agentCommands.ts` names `knownHostsFile`; and the scan still finds its four
    sites, so it cannot pass by matching nothing.
12. **The agent's road and *Run with Secrets* change only by the words of §3.9:** `test/hostKeyTrust.test.ts`,
    `test/sshUseActions.test.ts`, `test/sshExecOver.test.ts`, `test/secretsLaunch.test.ts`, `test/sshExecCommand.test.ts`
    and `test/sshBridge.test.ts` pass. Read on 2026-11-17, they build their expected argv with the builder itself or
    look for single words (`test/sshExecOver.test.ts:150`, `test/secretsLaunch.test.ts:83`, `:111`,
    `test/sshBridge.test.ts:139`), so no expectation is expected to change. One that does is changed in the commit
    that changes the builder, and its body names it. **Read again after G2, and run on a scratch copy for the spec of
    E1.S1 (2026-11-17): exactly one does.** G2 added the literal of a whole pinned bridged argv
    (`test/sshExecCommand.test.ts:316-321`), and a pinned bridged argv now has the pair of `GlobalKnownHostsFile` more
    (§4). The test that holds the literal takes that pair out before it compares; the literal itself stays. Every
    other test of these six files passes unchanged.
13. **The words of a pinned call (P1)**, on the pure function and through both builders: a pin file gives
    `StrictHostKeyChecking=yes` and the SAME path as `UserKnownHostsFile` and as `GlobalKnownHostsFile`; no pin file
    gives `accept-new` and neither option; a path with white space is written in the form that §3.9's row 7 measured,
    in both words; a path with none is today's word, byte for byte. RED first: no argv names `GlobalKnownHostsFile`
    today.
14. **A scan of the words that stays:** in `src_vs_code/src`, outside the tests, `UserKnownHostsFile=` is written by
    that one function and at the reviewed place of Connect's line (`sshCommand.ts`, named in the scan with C4 as its
    reason), and nowhere else; the scan finds both places, so it cannot pass by matching nothing. Written before the
    change: its first run names today's three places.
15. **Mutation checks** (by hand, recorded in the commit body): drop `knownHostsFile` from each of the four argv calls
    in turn → test 2, 3 or 4 and the scan are red; delete the pin only when a key file was written → test 5 is red;
    write the pin before the guard → "a writer that throws" of test 10 is red (measured for the spec of E1.S2, its N3:
    test 7 stays green there, because its writer answers a refusal and does not throw); read an unusable pin as
    unpinned → test 6 is red; drop
    the suffix → test 8 is red; write one file per run → "the same file" of tests 2 and 3 is red; delete the bridge's
    pin at once, or from `onEnded` → test 4 is red; refuse an absent pin → test 1 is red; drop "pinned" from the
    condition of sentence C → the guard of test 9 is red; show the check's sentence C in the log only → test 9 is red;
    give a password entry the key form → test 6 is red; drop `GlobalKnownHostsFile` from the function, or write a
    path with white space bare → test 13 is red.
16. The whole extension suite (`npm test` in `src_vs_code`), lint (`max-lines` included) and the build green before
    the PR.

**Tests 1-16 were built by E1** (#379; the counts are in `research/module_tests.md`). **Tests 17-27 are E2's**, RED first on
`main` at `f3e9887d`. Where a test of 1-16 holds an expectation that E2 changes, the commit that changes it names it.

17. **The words of a pinned call are complete (§3.10, §3.12),** on the pure function and through both builders: with a pin
    file and a client that knows the option, the argv holds `VerifyHostKeyDNS=no`, `KnownHostsCommand=none` and
    `LogLevel=ERROR` beside the three pairs of §3.9, before any `extra`; with a client below 8.5 it holds the same without
    the `KnownHostsCommand` pair; with no pin file it is today's argv, byte for byte. RED first: no argv names any of the
    three today.
18. **The same through the real client's `ssh -G`** (as the three `-G` tests of E1.S1): under a handed config that says
    `KnownHostsCommand`, `VerifyHostKeyDNS yes` and `LogLevel QUIET`, the pinned argv resolves `verifyhostkeydns false`,
    no `knownhostscommand` line and `loglevel ERROR`. A caller's `extra` that names any of the three comes too late.
19. **The client's three answers (§3.10):** the version is read from the start of the stderr of `ssh -V`; at or above 8.5,
    below 8.5 and "cannot be read" each give their words or the refusal; a good answer is asked once per program, a bad
    one again. On each of the three roads a client that cannot be read starts no connection, writes no pin file, shows
    sentence F and deletes the key file of the call. An unpinned entry is not asked and connects as today.
20. **The rule of the path (§3.11),** on the pure function, one case per row of its table and per row a-k of the
    measurement: bare, in double quotes, refused with its kind. Both words carry the same spelling. RED first: an apostrophe
    is written bare today, and a double quote names `/dev/null`.
21. **The same through the real client's `ssh -G`:** every path that the rule writes resolves, in both lists, to exactly
    that path; the test fails when the rule writes a path that the client resolves to another one. The control: the bare
    pair of apostrophes resolves another path, so the test can fail. **Revised for epoch 4 (Y2, §1.3; decision 19):** that
    control is the answer of a client from 8.7 on, and as E2 built it (G5, `test/pinWords.test.ts:324`) it is asserted
    against whatever `ssh` is first on `PATH`. The control now has a fixed expectation per parser: test 34.
22. **A refused path starts nothing:** on each of the three roads, for each refused kind: no `ssh` run, no pin file
    written, sentence E with its kind, the key file of the call deleted, no *bridged* row. On the agent's exec and
    *Run with Secrets*: the refusal of their road names the field and echoes no path, and no `ssh` starts.
23. **No stand-in file, as a scan that stays:** `src_vs_code/src`, outside the tests, holds no `/dev/null` as a known-hosts
    file; the function that writes the words is called only with what the rule answered; the scan of test 14 still finds
    its places.
24. **Which sentence (§3.12),** on the pure function, with the texts that were measured as fixtures (L9 a, c, d, e, g, h, i
    and the run of 2026-11-18): the verification line with the `Offending` line of THIS call's pin file gives sentence C;
    the same lines with the pin file of another call (another uuid), a hop's lines, a remote text that is or ends with the
    line, and `No <type> host key is known` give sentence D; an empty stderr, a host that is down and a refused login give
    nothing; an unpinned call gives nothing, whatever it printed. CR LF and LF alone both split.
25. **The roads show it:** the install shows sentence C or D once, in place of "did not answer the probe"; the socket check
    shows exactly one error message, `The bridge to "<name>" is not open: ` with sentence C or
    `The bridge to "<name>" could not be checked: ` with sentence D, and logs it. The guard of test 9 holds for both
    sentences.
26. **Mutation checks** (by hand, recorded in the commit body): drop each of the three new pairs in turn → 17 and 18 are
    red; send `KnownHostsCommand=none` to a client below 8.5 → 17 is red; read "cannot be read" as "below 8.5" → 19 is red;
    quote on white space only → 20 and 21 are red; answer `/dev/null` for a refused path → 22 and 23 are red; write the
    pin file before the rule is asked → "no pin file written" of 22 is red; drop the `Offending` line from the condition
    of sentence C → the hop and the remote text of 24 are red; match the pin file's folder in place of its whole path →
    "another call" of 24 is red; show sentence D in the log only → 25 is red.
27. The whole extension suite, lint (`max-lines` included: §3.6) and the build green before the PR, and **E1's smoke
    (section 10 of `ssh-agent-itest.cjs`) run again on the changed words:** leg 1 passes with the new pairs in every
    recorded argv; leg 2 shows sentence C on both roads, which now needs the `Offending` line of the real client.

**Tests 17-27 were built by E2** (on `fix/g1-e2-measurements`; the counts are in `research/module_tests.md` on that branch).
**Tests 28-32 are E3.S1's (C19) and test 33 is E3.S2's (the instrument)**, RED first on E2's head, `22caab8b`. Where a test of
1-27 holds an expectation that they change, the commit that changes it names it.

28. **The exit code is asked first (§3.12, part 4),** on the pure function, with the fixtures of test 24: each text that gives
    sentence C or sentence D there gives NOTHING with exit code 0; with 255, with another code (1) and with none it gives what
    test 24 says; a text with neither line gives nothing under every code; an unpinned call gives nothing under every code.
    RED first: the function takes no exit code today, so a remote text under exit code 0 gives sentence D. The spec says how
    the RED is watched, because the new argument does not compile against the old function.
29. **The roads go on (§3.12, part 4).** The stand-in answers exit code 0 and a stderr that holds the verification line,
    with the stdout of a good run. The install shows no sentence about a host key and reaches its question, the one that
    `confirmationFor` builds from the probe's answer. The socket check, driven through the registered
    `credSshManager.openRemoteBridge`, shows no error message, reads the socket's mode, and the row stays *bridged*. The
    guard: the same stderr with exit code 255 shows sentence D on both roads, as test 25 says, and the stderr of a refused
    key with 255 shows sentence C.
30. **No caller is missed.** A call of the function without an exit code does not compile (held in the suite the way this
    repository holds a type that must refuse; the spec names it). A scan that stays finds the callers of the function in
    `src_vs_code/src` outside the tests: exactly the two of `commands/agentCommands.ts`, each handing the exit code of its
    own run. It finds both, so it cannot pass by matching nothing.
31. **Mutation checks** (by hand, recorded in the commit body): answer a sentence under exit code 0 → 28 and 29 are red;
    hand a constant in place of the run's own code at one caller → 29 is red for that road; make the parameter optional →
    30 is red; ask the exit code AFTER the evidence of sentence C → the sentence C case of 28 under exit code 0 is red.
32. The whole extension suite, lint (`max-lines` included: `agentCommands.ts` stays at 797, §3.6) and the build green, and
    E1's smoke (section 10) passes again, both legs: no leg of it has a run that ends with 0 and holds the line.
33. **The launch instrument (E3.S2),** in the suite, as `itestCallers.test.ts` holds the scripts today. No script under
    `scripts/` holds the path of an `sshd` of its own: each takes the executable from the instrument's one place. The two
    starters that E1's smoke and E3's rows use (the one-connection `startSshd` and the serving launcher) take the extra lines of
    the server's config from the same place. A script of another plan that writes an `sshd` config of its own is named in
    the scan with its plan as the reason, as the scan of test 14 names Connect's line. With no parameter the executable is
    `/usr/sbin/sshd` and there is no extra line, so a run without parameters starts what it started before. The scan finds
    its places, so it cannot pass by matching nothing. RED first on `22caab8b`: the path is a constant
    (`itestSshd.cjs:13`), and neither config reads a parameter (`itestSshd.cjs:102-117`, `itestPinnedRoads.cjs:68-84`). What a
    parameter DOES is not a unit test's to show: the story's own run on an unpacked `sshd`, from a tree with no edit of a
    tracked file, shows it (`## Epics`, E3.S2).

**Tests 28-33 were built by E3.S1 and E3.S2** (on `fix/g1-e3-release-gate`; the counts are in `research/module_tests.md`).
**Test 34 is epoch 4's, and E3.S9 builds it**, because E3.S9 is the story that brings up the older client. It changes test
code only (`test/pinWords.test.ts`, and `test/pinnedArgv.ts` if the choice of the parser lives there), no product file.

34. **The control of test 21 has a fixed expectation per parser (decision 19).** The `-G` tests of the rule of the path
    read the version of the client that they ask, with the product's own reader (`versionTokenOf`), and take the
    expectation of its parser; the boundary is 8.7 and it is one constant of the tests, apart from the product's 8.5.
    - *What holds on BOTH parsers* (G4): every path that the rule writes resolves, in both lists, to exactly that path. A
      written path that a client resolves to another one is a defect of the rule on that client: the kind moves to
      "refused" (§3.11 allows that move), and the lead is told.
    - *The control, from 8.7 on* (G5 as E2 built it): the bare pair of apostrophes resolves the path without them, in both
      lists, and does not resolve itself. A bare path with an equals sign resolves ITSELF, whole, in both lists (measured
      on 10.2p1, 2026-11-23: the docblock of `checkedPin`). This parser has no collision of that kind, and the test
      asserts it.
    - *The control, before 8.7:* the bare pair of apostrophes resolves ITSELF, in both lists, and does not resolve the
      path without them. This is asserted, so a client whose parser is not the one that its version says cannot pass in
      silence. That the test can fail on this parser is shown by its own control: a bare path with an equals sign does
      not resolve to itself (probe P3.5). It resolves to two names, and the first is the path up to the sign: the place
      of the twin in the equals-sign pair of M11 (b).
    - *The refused rows* ("no refused row is read as the one file in both spellings") stay an assertion of the newer
      parser, where they were measured. On the older parser the test records what the client resolves for each refused
      kind and asserts nothing of it: a kind is refused when one client that the release names does not read it as the
      one file, and to refuse more is always allowed. This is weaker than G5 as E2 built it, and the re-review record
      lists it (its SEVENTH place).
    - *A client whose version is not read* gets no expectation: the `-G` tests fail there, as they fail a missing `ssh`
      under `CI=true`; they do not choose a parser by what comes out.
    RED first, watched in the story: with the unpacked OpenSSH 8.4p1 first on `PATH`, G5 as E2 built it fails at its
    first assertion (inferred from the measurement of entry 3.2, not run yet). Then GREEN twice: with the newer client
    first on `PATH` (the suite as CI runs it) and with the older one. The run with the older client is the story's own,
    with the client of M11; its result goes into `research/module_tests.md` and, from the one run of the whole set, into
    §10 beside M11 as evidence of the rule on the older parser. It is no row.

**What the suite cannot prove, and what proves it (P4, decision 12).** That `ssh` refuses a host whose key is not the pinned one,
asks no other source, reads the one file and prints the line that sentence C needs: all of that is `ssh`'s decision, made from
words that the tests above can only see in the argv or ask of `ssh -G` (`security.md`, *a measure you have
not observed working is a comment*). So the real runs are part of this plan, not a hand check that may be left out:
E1 ended with a smoke on real input, and E3 is the whole set, M1-M14 (`## Epics`), with the real `ssh` client against a
real `sshd` that the run starts for itself, through the commands as the extension registers them. A measurement that
is missing counts as not passed, and the release waits for all of them. The suite keeps a real-`sshd` test from passing by being skipped, as it does for
the guard tests (`CREDS_GUARD_TESTS_REQUIRED`, `.agents/PROJECT.md`, *Commands*); E1's smoke fails a missing `sshd` under
`CI=true` (E1's stories document). **Checked on 2026-11-18:** this machine has no `sshd` on its `PATH` (`which sshd`); E1's smoke runs
here on an unpacked one (E1's stories document, item 1). A public host stays
out of the suite (not hermetic); §3.5, §3.9 and §3.12 used one by hand. Windows is the client alone (M13); a login on Windows
is C6. **Since epoch 3 (decision 16):** that unpacked `sshd` was run from a scratch copy with three edits, which was enough for
a smoke and is not enough for the release gate. E3's rows run from the commit itself, through the committed instrument of
E3.S2, and the identities of what ran stand beside the results (`## Epics`, E3). **Since epoch 4 (decision 19):** a `-G`
test of the suite speaks for the one client that is first on `PATH` when it runs, and for the parser of that client. What
a client of the other parser does is shown by test 34's second run and by M11, never assumed from the first.

## 6. Docs

The documents are inside the epics, with the change they describe.

**Written by E1 (#379):** the entry of `src_vs_code/CHANGELOG.md` under `[Unreleased]`; in `research/module_extension.md` the
paragraph **B10 — the host key**, the paragraph **The bridge's `ssh` and its key file (N16)**, the table *Secrets at rest and
in flight* and *Rule C*; in `research/module_tests.md` the section after N16's, with the smoke.

**E2 rewrites the CHANGELOG entry, and reconciles its guarantee with what holds (V6, decision 11).** No version heading: the
release writes it. The entry after E2:

- **Its heading and its first paragraph claim only what holds.** Today's heading, "a saved host key is the only key a call
  without a terminal accepts", is wider than the entry's own text. The limit goes into the opening: the guarantee is for a
  saved host key that can be used; when it cannot be used, the three roads of a person refuse, and the agent's `ssh:exec`
  and *Run with Secrets* over SSH still read it as no saved key and run with `accept-new` (C3, not built by this plan).
  The baseline of the heading: `Changed — security: a saved host key that can be used is the only key a call without a
  terminal accepts`.
- **The two exceptions go, because E2 closes them:** the sentences about `VerifyHostKeyDNS` and `KnownHostsCommand`
  ("Neither is off on these calls yet", "is still asked") are replaced by what §3.10 does, with the answer for an `ssh`
  older than 8.5 and for one that cannot be asked.
- **The quiet case goes:** "Not covered: if your own `ssh` config says `LogLevel QUIET`…" is replaced by what §3.12 does.
- **The jump host is told as it is:** "A host key that a jump host of your own `ProxyJump` refuses is told with the same
  sentence" is replaced by sentence D and when it is shown.
- **The storage folder:** a path with a space or an apostrophe works; a path of the refused kinds is refused with a
  message, before anything connects (§3.11).
- **What stays not covered is said in one place:** *Connect via SSH* (C1, C4); the agent's reading of an unusable saved key
  (C3); Windows, where no login was measured (C6).
- **Every sentence of the entry that claims a behaviour has a test of §5 or a row of E3 behind it.** E3 checks that
  (`## Epics`, E3, done when) and corrects the entry where a row says otherwise.

**E2 also updates:** `research/module_extension.md`, **B10**: the words of a pinned call as they are after E2, the three
answers of the client, the rule of the path with its refusal, sentences D, E and F, and that Connect's line has none of it;
`research/module_tests.md`: the new test files with their counts (read from the runner), what each proves and what none of
them proves; the docblocks of `hostKeyPin.ts` that E2 makes untrue ("What these words do NOT switch off", the `/dev/null`
paragraph of `oneFileWord`, "What it cannot tell apart" of `hostKeyRefused`).

**As E2 built it** (`fix/g1-e2-measurements`, unmerged): the entry's heading is `Changed — security: a call without a terminal
asks ssh to trust only a saved host key that can be used`; it carries a claim table in the spec of E2.S4 (32 rows) and one
*Not covered* paragraph. The list above is the record of what was asked of it.

**E3.S1 (C19) updates, with its code:** the CHANGELOG entry, where it lists "a remote command that prints that line" among the
cases of the second message: the case is told only when the run did not end with 0, and a run that ended with 0 goes on;
`research/module_extension.md`, **B10**: the exit code as the first question of the rule of evidence;
`research/module_tests.md`: the new cases with their counts; the docblock of `hostKeyTold`, whose sentence "A remote command
that wrote the verification line reads as sentence D whatever the run's exit code was" becomes untrue.

**E3.S2 (the instrument) updates:** `research/module_tests.md`: where the counterpart of the real runs comes from and the
exact command, with the parameters in place of the recipe of a scratch copy; the comments of the two launchers.

**E3 writes:** its results into this plan as §10, before `## Epics`, per row: the numbers, the date, the versions of the
client and of the counterpart, the commit, and since epoch 3 the identities of what ran (`## Epics`, E3, the setup); in
`research/module_tests.md` the real runs: where the counterpart lives, the exact command, M1-M14 marked as measured, and what
they do not prove.

**E3 corrects in the CHANGELOG entry what a row says otherwise.** One such sentence is known before any row runs (W7,
§1.2): for a saved host key that cannot be used the entry says "No `ssh` starts, nothing is sent to that host". Since E2 the
question `ssh -V` can start first. E3 writes what M4 measures: no connection starts and nothing is sent. The entry is a text
that ships in the package, and no row measures it: a correction of the entry alone does not mean the whole set again.

**Where E3 writes, since the entry has shipped (epoch 4; Y5 and Y8, §1.3).** The G1 entry went out with 1.23.0, and its
heading `[1.23.0]` is written (#389). The shipped text is not edited any more. It already says "No connection starts" (the
correction of W7 moved into E2's pull request with entry 3.1), names C19 as "Not yet right", and lists what was not
measured before that release. What E3 changes goes into a NEW entry under `[Unreleased]` (the stories document of E3, the
lead's answer to Q2, consult `552ad198`): C19's fix is there since E3.S1, and every correction that §10 supports follows.
Where the paragraphs above say "the entry", read: the text of 1.23.0 for what it claimed, and the new entry for what E3
writes.

**The release evidence says its limits in words (epoch 4; decision 22).** §10 and the new CHANGELOG entry say, beside
the results:

- what M2 (a) proves: a key in the user-file slot that the handed config names does not satisfy a pinned call. It claims
  nothing about the compiled-in default path, and no run read or wrote the person's real `~/.ssh`;
- what M11 shows of an older client, by the version that the result names (OpenSSH 8.4p1 for the client of E3.S3): the
  words without `KnownHostsCommand`, the quoted path read as the one file, and for a pair of apostrophes that the
  intended file alone supplied trust. Each parser has a collision of a bare word of its own kind. A pair of apostrophes:
  on a client from 8.7 on (M7 shows it there, and M11 (b) shows that 8.4p1 has none). An equals sign: on a client before
  8.7 (M11 (b) shows it on 8.4p1, and shows that 10.2p1 has none);
- what M14 proves: the agent's `ssh:exec` through the action's own `run`, off a bridge, against the real `sshd`. It does
  not prove the broker's HTTP layer or its consent, which stand above that call;
- what no row ran: a client of 8.5 or 8.6 (the option known, the older parser read and not measured), and a login on
  Windows (C6);
- the result of test 34 on the older client, as evidence of the rule of the path there. It is no row.

- **Not in the epics: the help article** `remote-bridge`, *What can go wrong* (`helpEn.ts`). A change to it changes
  all five languages together (`.agents/PROJECT.md`, rule 7), so it cannot be cut down to English: candidate C5. Read on
  2026-11-18: the article says nothing about a saved host key, so nothing in it is made false by this plan.
- At promotion: G1 of N16's §5 gets its "Fixed in" text; the `todo/README.md` rows move to `research/README.md`.

## 7. Out of scope

- **G2**, the bridge and connection sharing: its own plan, first (§4). **G3-G8** of N16's §5.
- Asking the fingerprint on these roads for an unpinned entry (decision 1).
- Deleting a bridge's pin file before its `ssh` ends (§3.4).
- A check of the pin before the token and before the PIN question (§3.4; C9).
- Moving the socket check or the install out of `agentCommands.ts` (§3.6).
- Connect's own road: its scan, its questions and the words of its terminal line (§3.5, §3.9, §3.10; C1, C4).
- The agent's reading of an unusable pin as no pin (decision 3; C3). The CHANGELOG says it (§6).
- A login on Windows (C6). E3 measures the Windows client alone (M13).
- The key file's path, the `-F` file of a bridged call and its rules, the floor of the bridged client (§3.8).
- The key check of a jump host: the person's own config and files (§4).
- Any new word on an unpinned call.
- Since epoch 3: a sign of progress while the `ssh` program is asked for its version (C20); a change of the order in
  which the pin of a call is decided, so that a saved key that cannot be used is found before the question (decision 15);
  showing sentence D for exit code 255 alone (§3.12, part 4); a product change for the sake of a test instrument.
- Since epoch 4: a collision on a client before 8.7 for a pair of apostrophes (that client has none; M11 (b) shows the
  reverse: decision 20); a leg with an equals sign in M7, or among the shapes (a)-(e) that M11 (b) takes from M7 (the
  lead's answer to Q1 of E3's stories document stands for those: the equals sign has the one pair of M11 (b), on both
  clients, and no more); a run with a client of 8.5 or 8.6; any claim about the compiled-in default path of the person's
  known-hosts file (decision 22); a second question to the client, for its parser (§3.10: no word depends on 8.7).

**In scope since epoch 2, and no longer here:** the sources of trust that only an `ssh` config turns on (§3.10; they were
C2 and C17).

**Found while this plan was written and built, not built by E1** (each read in the code on 2026-11-17 unless it says measured).
F3 was taken into the plan at the plan round. The dispositions of the others are in `## Epics`, *The remaining candidates*:

- **F1 (the follow-up of decision 3).** The agent's exec reads an unusable pin as no pin: `materializeKnownHosts`
  answers `undefined` (`hostKeyTrust.ts:85-92`), `connectionArgvOptions` passes it on (`sshUseActions.ts:224`), and the
  call runs with `accept-new`. Fail-open where nobody is watching. Candidate C3.
- **F2.** Every other reader takes an unusable pin as "no pin" too. Connect asks as on a first contact when the scan
  answers (the heal of §3.5); when the scan answers nothing it goes on with no pin file (`connectionOptions.ts:70`):
  `ssh`'s own question for a key entry (`sshCommand.ts:319-328`), `accept-new` for a password entry
  (`sshSession.ts:503-506`). The edit form says "No host key pinned yet" and offers no *Forget the pinned host key*
  (`entityEditCommands.ts:162`, `:202`; `entityFormPage.ts:349-355`), and its Save keeps the stored text
  (`entityFormPanel.ts:643`). Where such a text can come from: a sync or an import. The two writers of `hostKey` found
  (a search of `src_vs_code/src` for the word) do not write one: Connect writes `formatHostKey` of a scanned key
  (`connectionOptions.ts:94`), and the form keeps the stored text or clears it.
- **F3 (measured). TAKEN into this plan at the plan round (P1): §3.9.** A pin is not the only trusted source of a
  host's key: with `UserKnownHostsFile` set, `ssh -G` still shows `globalknownhostsfile /etc/ssh/ssh_known_hosts
  /etc/ssh/ssh_known_hosts2` (OpenSSH 10.2p1, `-F none`). A key that a system-wide file lists for the host is accepted
  beside the pin, on every pinned road: Connect, the agent's exec, and these three after this plan.
  `hostKeyPin.ts:15` says "built from it alone". It belongs on the one road in (the argv builders). What is left of
  it after §3.9: Connect's line (C4), the config's own sources (C2; closed by epoch 2, §3.10), Windows (C6).
- **F4.** The socket check's log line for an empty answer says the socket "is there" (`agentCommands.ts:232-234`), also
  when `ssh` itself failed and nothing was observed (`interpretSocketProbe` reads an empty answer as `unreadable`,
  `sshBridge.ts:317-323`).
- **F5.** `commands/agentCommands.ts` holds doc comments with no function under them (`:76-93`, `:133-152`; the
  registrations were moved out of `extension.ts` word for word). A question for the lead, not a change of this plan:
  the comments whose function lives in another file could go, which would also widen §3.6's budget.

## 8. Definition of Done

Revised for epoch 2, and again for epoch 3. The first group is E1's, as approved in epoch 1; its work is merged, and the judge
of each re-review sorts it (`## Plan changes`). The second group is E2's, as approved in epoch 2; its work is built and
gated on its branch, and unmerged. Epoch 3 adds the groups of E3.S1 and E3.S2, and revises the groups of E3 and of the whole
plan. In the groups of E1 and E2, "before any `ssh`" for a saved key that cannot be used and for a pin write that fails reads
"before any connection" since E2 (§3, *Epoch 3 changes one thing*). The boxes are ticked by the commit that proves each.

Revised again for epoch 4. The groups of E1, E2, E3.S1 and E3.S2 stand as they were approved: their work is built, E1 and E2
are merged (#379, #388) and were released in 1.23.0 (entry 3.1), and the judge of the re-review sorts the work of epoch 3
(`## Plan changes`). Epoch 4 adds the group of test 34, adds three items to the group of E3, and in the group of the whole
plan it writes the one release exception and adds the item of this re-review. No item of an earlier epoch is taken out.

**E1 (merged, #379):**

- [ ] On a pinned entry every one of the five `ssh` runs of the three roads carries `StrictHostKeyChecking=yes` and
      ONE per-call file as its `UserKnownHostsFile` and its `GlobalKnownHostsFile`; on an unpinned entry every run is
      as today.
- [ ] The pin file is written inside the guarded span, complete before the spawn, one per call, and deleted on every
      exit of §3.3 and §3.4, whether or not a key file was written; only a file that the call wrote is deleted.
- [ ] A pin that is present and unusable, and a pin write that fails, are refused before any `ssh`, with sentence A
      in the form of the entry's login and sentence B; no form of sentence A sends a password entry to Connect SSH.
- [ ] A refused host key on a pinned entry shows sentence C: the install's own, and the bridge's as a message of the
      socket check, not only a log line. (E2 narrows when it is shown: §3.12.)
- [ ] The words of a pinned call come from one function that both argv builders call; `materializeKnownHosts` is
      unchanged; the agent's exec and *Run with Secrets* change only by those words on a pinned call (test 12).
- [ ] The tests 1-16 of §5 RED first, then GREEN; the mutation checks recorded; E1's smoke on real input passed.

**E2 (the repairs):**

- [ ] Every pinned call that goes through the two builders carries `VerifyHostKeyDNS=no` and `LogLevel=ERROR`, and
      `KnownHostsCommand=none` when its client is at or above 8.5; a client below 8.5 gets no word for the command; a
      client that cannot be read starts no pinned call and the person is shown sentence F (§3.10, §3.12).
- [ ] The pin file's path reaches `ssh` as the one file that was written, bare or in double quotes, or the call is
      refused before any `ssh` and before any pin file, with sentence E and its kind; no code names a file with no key in
      place of a pin file (§3.11).
- [ ] Sentence C is shown only with `ssh`'s line that names the pin file of this call; the verification line without it
      shows sentence D; the bridge's form of both is a message of the socket check, not only a log line (§3.12).
- [ ] An unpinned call is byte for byte as before E2, on every road.
- [ ] The CHANGELOG entry claims only what holds: its opening carries the limit of C3, and the sentences about the two
      sources, the quiet config and the jump host say what E2 built (§6).
- [ ] `agentCommands.ts` at most 800 lines, lint green (§3.6).
- [ ] The tests 17-27 of §5 RED first, then GREEN; the mutation checks recorded; E1's smoke passes on the changed words.
- [ ] The documents of §6 that are E2's.

**E3.S1 (C19, the one behaviour that E3 builds; epoch 3):**

- [ ] The function that chooses the sentence for a host key takes the run's exit code as a REQUIRED parameter and answers
      nothing when it is 0; with another code or none it answers as before (§3.12, part 4).
- [ ] Both callers hand it the exit code of their own run, on the lines that exist; a scan finds exactly these two callers,
      and a call without the exit code does not compile (test 30).
- [ ] A run that ended with 0 and holds the verification line: the install reaches its question, and the socket check goes
      on and reads the socket's mode; neither sentence C nor sentence D is shown (test 29).
- [ ] No word of an argv, no other sentence and no unpinned call changes; `agentCommands.ts` stays at 797 lines (§3.6).
- [ ] The tests 28-32 of §5 RED first, then GREEN; the mutation checks recorded; the documents of §6 that are E3.S1's.

**E3.S2 (the launch instrument; epoch 3):**

- [ ] One committed launcher starts every counterpart of the real runs. It takes the `sshd` executable and the extra lines
      of the server's config as parameters; with none it starts `/usr/sbin/sshd` as before, so CI does not change, and
      `CI=true` still fails a missing `sshd`.
- [ ] A local run on an unpacked `sshd` needs no edit of a tracked file: the story's own run shows it, from a tree whose
      tracked files are those of its commit.
- [ ] The serving launcher (`sshd -D -e`, every connection) is the one that every row uses, and it has a stop of the
      listener alone that leaves a master's session alive; the story shows a master that outlives its listener and carries
      one more command.
- [ ] The run records, beside its results, the identity of every executable and of every config text that it handed out
      (`## Epics`, E3, the setup). The sections of other plans that start their `sshd` through the same file pass as before,
      where they run.
- [ ] Test 33 of §5 RED first, then GREEN; the documents of §6 that are E3.S2's.

**Test 34 (the control per parser; epoch 4, built by E3.S9):**

- [ ] The `-G` tests of the rule of the path take the expectation of the parser of the client that they ask, by its
      version and never by the outcome; the boundary is 8.7, apart from the product's 8.5 (decision 19).
- [ ] G5 as E2 built it was watched RED with the older client first on `PATH`; test 34 is GREEN with the newer client
      first on `PATH` and with the older one; on both, every path that the rule writes resolves to exactly that path in
      both lists.
- [ ] No product file changed for it.

**E3 (the release gate):**

- [ ] Every measurement M1-M14 passed as its last column says (the rows as revised for epoch 3, and M2, M5, M6, M7 and M11
      as revised for epoch 4), in one run of the whole
      set on the final code, against a real `sshd`, through the registered commands. A missing measurement is not a pass;
      no row passed on either result; every control showed what it is there for. The results are in this plan (§10).
- [ ] Every control about a bare word ran against the fixed expectation of its client's parser, and §10 names that
      client's version beside it: M7's collision on a client from 8.7 on, the twin legs of M11 (b) on a client before 8.7
      (decisions 19, 20).
- [ ] The logins of the older client are shown, not inferred from `ssh -G`: in the twin legs of M11 (b), K1 accepted the
      witness with the bare word, K2 refused the control with the bare word, and K2 logged 0 authentication attempts.
- [ ] The equals-sign pair of M11 (b) ran on both clients. On the client before 8.7, K2 accepted the control with E1's
      bare words through the twin, and refused the roads. On the client from 8.7 on, K2 refused that control and K1
      accepted the same bare words, and the result says that this parser has no collision of that kind.
- [ ] §10 and the new CHANGELOG entry say the limits of decision 22 in words: what M2 (a) proves, what M11 shows of an
      older client, what M14 does not prove (the broker's HTTP layer and its consent), and which clients no row ran (§6).
- [ ] The whole set ran from the commit itself: through the committed instrument, from a tree with no modified tracked
      file, and after E3's branch had taken `main`. §10 names that commit and the identities of what ran.
- [ ] Every row counted what it is about: starts of the client, connection starts, authentication attempts and accepted
      logins are separate numbers in §10, and a row that depends on the state of the asker ran in the state it names
      (decision 15).
- [ ] No run of E3 wrote outside its owned folder: the places that the real installer writes are the same before and
      after (M1).
- [ ] An instrument that could not be made to work is a recorded plan change, with the owner's word when it makes the gate
      smaller; no row is left out without one (decision 18).
- [ ] Every sentence of the CHANGELOG entry that claims a behaviour names, in §10, the test or the row behind it; the
      sentence "No `ssh` starts" is corrected (§6).
- [ ] The documents of §6 that are E3's.

**The whole plan:**

- [ ] The coai code gate at `proceed` on each epic's branch; the lead's Opus review; CI green on the head sha;
      CodeRabbit read.
- [ ] E2's pull request merged before E3's was opened; E3's branch took `main` by a merge, never by a rebase or a force
      push (decision 17).
- [ ] The feature review ran once, after E3 and before the release, and every finding is resolved (decision 13).
- [ ] Every candidate that is not built has its disposition (`## Epics`), read again by the lead at the release.
- [ ] Released as an extension patch with the owner's word, only after E3 passed, and from the tree that E3 measured (§9,
      step 11); the plan and its stories documents promoted, with the deviations. **Since epoch 4 this item names G1's
      NEXT release.** One release is behind it: 1.23.0 shipped E1 and E2 before E3, with the owner's word (entry 3.1;
      decision 21). Its CHANGELOG said what was not measured. It does not tick this box, and the promotion records it
      as a deviation.
- [ ] The re-review for epoch 4 is complete: the judge's verdicts are in its record, the cuts are made if the judge
      orders any, the coai round on the revised plan is resolved, and the owner approved the narrowed epoch before its
      line was written.

## 9. Build order and merge conditions

1. **Done, 2026-11-17:** G2 merged first (#376, `07ed8303`), and this plan was revised against `main` at `ca99cd91`.
2. **Done, 2026-11-17:** the coai plan gate (`review_plan` → `resolve`) answered `proceed`; P1-P4 were accepted and
   folded in; the split was ordered, and the question consultants were asked about it (`cbe21f00`). That approval
   opened the ledger.
3. **Done, 2026-11-17:** where the real `sshd` comes from was settled (E1's stories document, item 1).
4. **Done, 2026-11-18:** E1, on its own branch: four stories, the code gate, one PR (#379, squash `f3e9887d`).
   **Merged and not released.**
5. **The stop, 2026-11-18** (`bcaafce2`, entry 1.2), and the re-review: the consult (`97eb6bb5`), the question
   consultants (`274c6e9d`), this revision of the whole plan, the Opus judge's verdicts on the done work, the cuts if
   the judge orders any (a new pull request or a fix forward, never a rewrite of history), the re-review of the revised
   plan, and then the line of epoch 2. Until that line stands: no new code on any epic of this plan and no merge of its
   work.
6. **Done up to its pull request, 2026-11-19:** E2, on its own branch from `main` (`fix/g1-e2-measurements`), after
   epoch 2 was open. Opus wrote its stories document (`todo/PLAN_person_roads_pin_host_key_E2.md`) and marked the one
   cornerstone; Fable wrote the cornerstone's spec and the specs that are security judgements; Sonnet coded each story,
   tests RED first; Opus reviewed each; `review_code` over E2's diff reached `proceed` (read from the gate's record on
   2026-11-19: its last round on `1cef821e`, all eight reviewers answered; the one commit after it, the head `22caab8b`, is
   plan text). **Built and gated, not merged:** its pull request is step 8, because the stop of step 7 came first.
7. **The stop, 2026-11-19** (`6d10c4f5`, entry 2.2), and the re-review: the consult (`22147fce`), the question consultants
   (`8d07d6a6`), this revision of the whole plan, the Opus judge's verdicts on the done work, the cuts if the judge orders
   any (a revert commit or a fix forward on the branch that holds the work, a new pull request for what is on `main`, never
   a rewrite of history), the re-review of the revised plan, and then the line of epoch 3. Until that line stands: no new
   code on any epic of this plan and no merge of its work.
8. **E2's pull request, first** (decision 17), after epoch 3 is open: one PR from `fix/g1-e2-measurements`, merged by
   squash after the head sha's checks exist and pass and CodeRabbit is read. E2's code gate stands at `proceed` and is not
   opened again by the re-review. The epoch 3 judge cut three parts of E2 (E2.S3's text-only condition, three sentences of
   E2.S4's CHANGELOG entry, C19's old disposition) and placed every correction FORWARD: in the re-review's documents or on
   E3's branch (E3.S1, W7). So no product or test commit is added to E2's branch: it takes only the re-review's document
   commits by a fast-forward push before its pull request (the judge's note below the table), and its code round is not
   run again. Only a later cut that the judge places ON E2's branch would be a commit there, followed by one more code
   round (`again: true`) before the pull request. A PR over the repository's cap needs the owner's
   word. **E2 is merged and not released.** **Done, 2026-11-23:** #388, the squash `4799f9d7`. The last sentence did not
   stay true: the owner released E1 and E2 in 1.23.0 the same day (#383, `95e11116`), before E3 (entry 3.1; step 11).
9. **E3**, on its own branch (`fix/g1-e3-release-gate`), which stands on E2's head, after epoch 3 is open. Opus writes its
   stories document when E3 starts (`…_E3.md`). The order of its first three stories is fixed here (`## Epics`, E3):
   1. **E3.S1, C19.** Fable writes the spec (a security judgement), Sonnet codes it, tests RED first, Opus reviews.
   2. **E3.S2, the launch instrument,** committed before any row is measured.
   3. **E3.S3, the feasibility** of the instruments that are not known to work, each probed through the committed
      instrument, before any row is built.

   Then the rows M1-M14, as the stories document splits them. A row that fails is repaired inside E3 only when the repair
   makes the code do what this plan already says; the whole set is then run again. A repair that changes a planned step or
   a pass criterion is a plan change and is recorded as one; so is a row that cannot be run, and so is an instrument that
   cannot be made to work (decision 18). An instrument that E3's setup marks with "here" is the stories document's to
   choose. **The merge conditions of E3:** E2's pull request is merged; then E3's branch takes `main` by a merge (never a
   rebase, never a force push), and the files that tooling parses are read again after it (`src_vs_code/CHANGELOG.md`,
   `todo/README.md`, the scripts' exports; `git-workflow.md`, rule 11); only then the whole set runs once, on that tree,
   and its results are written into this plan (§10). Then `review_code` → `resolve` until `proceed`, and one PR, merged by
   squash after the head sha's checks exist and pass. A PR over the repository's cap needs the owner's word. The cadence
   consult, if the gate orders one, comes before E3's code round.

   **Where step 9 stands, 2026-11-25.** E3's branch took `main` twice by a merge (`8dabad08`, `d94c307b`). E3.S1, E3.S2
   and E3.S3 are done, in that order. The stories document split the rows into six row-stories and one last story for the
   one run (E3.S4-E3.S10). E3.S4-E3.S7 are built and reviewed, E3.S8 is built and not reviewed, E3.S9 has a spec and no
   code, and E3.S10 has not started. No row is measured.

   **The stop inside step 9, 2026-11-25** (`17694426`, entry 3.2), and the re-review: the consult (`3b6c7351`); this
   revision of the whole plan; the Opus judge's verdicts on the done work of epoch 3; the cuts if the judge orders any (a
   revert commit or a fix forward on E3's branch, a new pull request for what is on `main`, never a rewrite of history);
   the coai round on the revised plan; the owner's approval, because the re-review is narrowed; and then the line of
   epoch 4. Until that line stands: no new code on any epic of this plan and no merge of its work. After it, E3 goes on
   in the order of its stories document, and that order does not change:
   1. the Opus review of E3.S8, as built before the stop;
   2. E3.S9, built from its new spec: the revised M11 (b), with the twin of (c) and the equals-sign pair, and test 34
      (the code of the unit test G5);
   3. E3.S10, the one run of the whole set, with the legs of M11 (b) and test 34's run on the older client in it.

   A cut that the judge orders comes before these three, on E3's branch. The judge ordered one: the spec of E3.S9 is cut
   for its M11 (b) and is fixed forward. Opus writes it again at the same path, against the revised M11 (b) and with test
   34, after the line of epoch 4 and before the Opus review of E3.S8. No code of E3.S9 comes before the new spec.
10. **The feature review** (`review_feature`), once, from a checkout of `main` that holds E1, E2 and E3; its `baseRef`
    is the commit before E1 (`4392a272`). Findings that are accepted land as new pull requests.
11. **The release** (an extension patch) with the owner's word, and only when: E3 passed as a whole on the code that is
    released (any later change that can affect the shipped extension or the measurements — `src_vs_code/src`, its dependencies, build, packaging, or the harness — means the whole set again, and the release names the commit and the vsix that E3 measured); the feature review is resolved; every
    candidate that is not built has its disposition. **Since epoch 3, "the code that is released" is checked, not assumed:**
    the tree of the released commit is the tree that E3 measured. A squash merge makes another commit of the same tree, so
    the release compares the tree of `src_vs_code` at both commits (`git rev-parse <commit>:src_vs_code`; that folder holds
    the harness too), and names both commits, the hash of the vsix, and the identities that §10 holds. If the two trees
    differ in more than the text of the CHANGELOG entry (§6), the whole set runs again on `main` before the release. Then the promotion PR:
    this plan and its stories documents together.
    **The one exception (epoch 4; entry 3.1; decision 21):** 1.23.0 was released on 2026-11-23 with the owner's word, from
    `main` after E2's merge and before E3 (#383, `95e11116`, the tag `extension-v1.23.0`). No condition of this step held
    for it: no row was measured, the feature review had not run, and its CHANGELOG said what was not measured. This step
    is the step of G1's NEXT release and of every release after it, with every condition as written. A release-please
    commit always changes more of `src_vs_code` than the CHANGELOG (`RELEASES.md`, and the version in `package.json` and
    `package-lock.json`), so the clause above
    applies each time: the whole set runs once more on the merged release commit of `main`, before the tag is cut (the
    stories document of E3, *The epic's end*).
12. **The candidates that are not built** follow their dispositions (`## Epics`). One that the lead takes becomes a
    plan of its own, the question consultants first.

## Epics

Three epics, and a list of the candidates that are not built, each with its disposition. This is the split of the re-review
for epoch 2 (§2, decision 7; the question consultants `274c6e9d`, both answers; the consult `97eb6bb5`). It REPLACES the split
of epoch 1 (two epics and a list of candidates, consult `cbe21f00`); it does not append an epic to it. The gate's split
order allows two epics beyond what is done: E1 is done, E2 and E3 are the two. Each epic's stories are one document,
`todo/PLAN_person_roads_pin_host_key_E<n>.md`, written by Opus when that epic starts; it links back here and gets its own
`todo/README.md` row. The code gate runs once per epic, on that epic's
branch. Three epics: the cornerstone quota is 2, and the feature review runs once at the end (§9, step 10).

**The re-review for epoch 3 keeps this split** (the question consultants `8d07d6a6`, both answers: C19 is a story of E3,
not a fourth epic). E1 is done. E2 is built and gated, and not merged. E3 is revised: it builds one behaviour first (C19),
commits its launch instrument second, and its rows are repaired (§1.2). The stories document of E2 is written; that of E3
is not. Both cornerstones of the quota are marked (E1.S2, E2.S2), so E3 has none.

**The re-review for epoch 4 keeps this split too** (the consult `3b6c7351`). E1 and E2 are merged and were released in
1.23.0 (entry 3.1). E3 keeps its ten stories and their order; eight of them are built (E3.S1-E3.S8). What changes is inside
E3: the rows M2, M5, M6, M7 and M11 as revised below, the list *How the rows are read*, and test 34, which E3.S9 builds. The
stories document of E3 is written (2026-11-23), and its E3.S9 is revised with this revision. No epic and no story is added
or taken out, so nothing is split again and the cornerstone ledger does not change.

### E1 — The three roads enforce the saved pin of one call

- **State.** Done: merged on 2026-11-18, PR #379, squash `f3e9887d`. Not released when this was written; released since,
  with E2, in 1.23.0 on 2026-11-23 (entry 3.1). The text below is E1 as it was approved
  and built; the Opus judge of the re-review sorted its work (`## Plan changes`): it fits, except three parts that E2's pull
  request corrects (the rule of the path, the condition of sentence C, the CHANGELOG's guarantee). What E2 corrects is in §1.1.
- **Goal.** On the bridge socket check, *Install creds on host* and *Open Remote Bridge…*, an entry with a pin starts
  `ssh` only against that pin, from one file of this call that goes with this call; a pin that cannot be used starts
  nothing; a person who meets a host with another key is told so. It is the smallest core that runs end to end on
  real input. The guarantee is that of the pin file: it does NOT cover the sources that only an `ssh` config turns on,
  `KnownHostsCommand` (C2) and `VerifyHostKeyDNS` (C17); with `VerifyHostKeyDNS yes` in the person's config `ssh` also
  accepts a key that matches a secure SSHFP record, which may not be the pin (OpenSSH 10.2 asks DNS before it reads the files).
- **Scope.** All of §3.1-§3.9, and no candidate:
  - the pin of one call with its three states, and the per-call pin file that N16's extended helpers own (§3.1, §3.2);
  - the two bounded roads and the bridge (§3.3, §3.4);
  - the pin file as both known-hosts files and its path as one file, from the one function that both argv builders
    call (§3.9);
  - an unusable pin and a pin write that fails refuse before any `ssh` starts; sentence A in its two forms, B and C;
    the socket check shows the bridge's refused host key as a message (§3.5);
  - the file-size budget (§3.6);
  - the tests of §5 (1-16), and the documents of §6 that belong to E1;
  - the counterpart of the smoke: a real `sshd` that the run starts for itself (§3.7, the last row), as much of it
    as the smoke needs. E3 extends it.
- **Depends on.** G2 merged (§4, §9).
- **Done when.**
  - The RED scenarios of its specs were watched failing on the unchanged code and pass; the guards pass before and
    after; N16's tests pass with the one mechanical edit of §3.2; each mutation check of §5 turned red what it names
    and was restored; `agentCommands.ts` is within §3.6's count; typecheck, lint and the whole suite are green.
  - **The smoke on real input passed**, through the commands as the extension registers them, with the real `ssh`
    client against a real `sshd` on the loopback of the machine that runs it:
    1. the entry is pinned to the key that the counterpart presents: *Install creds on host* reaches its question
       (the probe was answered), *Open Remote Bridge…* leaves a bridge whose socket check reads the socket's mode,
       and the counterpart's log shows these logins as accepted;
    2. the counterpart presents another key at the same address: both commands end refused, the counterpart's log
       shows no accepted login, the install shows sentence C, and the bridge's check shows its message.
  - The code gate is at `proceed` and E1's PR is merged.
- **Cornerstone areas.** One: the pin decision of one call and the guard that owns two files (§3.1, §3.2): the three
  states, the refusal as the one value that a road reads, the two deletes. Every road only uses it, so a mistake
  there (an unusable pin read as unpinned, a pin deleted only with a key file, a pin written outside the span)
  reaches all three roads and reads as working. Not marked, and Fable's all the same, outside the quota: the words of
  a pinned call (§3.9) and the two forms of sentence A (§3.5) are security judgements (`subagent-models.md`, the row
  *Security judgement*).
- **Stories.** [PLAN_person_roads_pin_host_key_E1.md](PLAN_person_roads_pin_host_key_E1.md) (2026-11-17): four
  stories, E1.S1-E1.S4; the cornerstone is E1.S2. The specs, all 2026-11-17: E1.S1,
  [PLAN_person_roads_pin_host_key_E1_S1_spec.md](PLAN_person_roads_pin_host_key_E1_S1_spec.md); E1.S2,
  [PLAN_person_roads_pin_host_key_E1_S2_spec.md](PLAN_person_roads_pin_host_key_E1_S2_spec.md); E1.S3,
  [PLAN_person_roads_pin_host_key_E1_S3_spec.md](PLAN_person_roads_pin_host_key_E1_S3_spec.md); E1.S4,
  [PLAN_person_roads_pin_host_key_E1_S4_spec.md](PLAN_person_roads_pin_host_key_E1_S4_spec.md).

### E2 — The known repairs: a pinned call trusts the pin alone, names it as one file or does not start, and says only what it saw

- **State.** Built 2026-11-18 and 2026-11-19 on `fix/g1-e2-measurements` (`79652693` to `22caab8b`), four stories; through
  its code gate (`proceed`; §9, step 6); pushed, not merged, not released. The text below is E2 as it was approved for
  epoch 2 and built. The Opus judge of the re-review for epoch 3 sorts its commits (`## Plan changes`). Epoch 3 changes
  nothing of its scope. Three things that E2 built are carried forward by E3, on E3's branch and never by a rewrite: the
  function of §3.12 gains the exit code (E3.S1), two sentences of the CHANGELOG entry are corrected (§6), and the launchers
  of the real runs become the committed instrument (E3.S2). Its pull request is the first merge of epoch 3 (§9, step 8).
  **Since then (epoch 4):** merged on 2026-11-23, PR #388, squash `4799f9d7`, with the review fixes of that pull request
  (an equals sign in the pin file's path is written in double quotes: §3.11), and released with E1 in 1.23.0 the same day
  (entry 3.1). Epoch 4 changes nothing of its scope and nothing of its code. One of its unit tests, G5 of test 21, gets a
  fixed expectation per parser; E3.S9 changes it (test 34).
- **Goal.** The six places where the merged code does not keep this plan's contract (V1-V6, §1.1) are repaired, before
  the measurements that decide the release. After E2 every `ssh` that the extension starts for a pinned entry with no
  terminal, off a bridge, asks no source of trust but its pin file; reads that file and no other, or does not start; and
  the person is told a cause only when the call saw it.
- **Scope.** §3.10, §3.11, §3.12; the tests 17-27 of §5; the documents of §6 that are E2's, with the reconciled
  CHANGELOG. The candidates that E2 takes in: C2 and C17 (§3.10), C11 and C16 (§3.11), C13 and the concern of C12 (§3.12).
  No other candidate, and no new behaviour beyond these sections. C10 only as the reserve of §3.6.
- **The release-blocking repairs.** Each blocks the release until it is built here and measured by E3.

  | # | The repair | Repairs | Where | Proven by the suite | Measured by E3 |
  |---|---|---|---|---|---|
  | R1 | no pinned call asks another source of trust: `VerifyHostKeyDNS=no` always, `KnownHostsCommand=none` under the client's own answer, a written answer for a client below 8.5 and for one that cannot be read | V1 | §3.10 | tests 17, 18, 19 | M8, M10, M11 |
  | R2 | the pin file's path is quoted where double quotes keep it (white space, an apostrophe) and the two words always name the one file | V2 | §3.11 | tests 20, 21 | M7, M11, M13 |
  | R3 | a path that cannot be written so is refused before any `ssh` and before any pin file, with the field named; no file with no key stands in | V2, V3 | §3.11 | tests 22, 23 | M12, M13, M14 |
  | R4 | sentence C only on the evidence of the call's own pin file; sentence D otherwise; a pinned call states its `LogLevel`, so a refusal is not silent | V4, V5 | §3.12 | tests 17, 18, 24, 25 | M5 (a, e, f, g), M7 |
  | R5 | the CHANGELOG entry claims only what holds: the limit of C3 in its opening, and what R1-R4 built in place of the sentences they make untrue | V6 | §6 | read by the Opus review of E2 | E3's check of every claim against §10 |

- **Depends on.** E1 merged (done). Epoch 2 open: the re-review has passed.
- **Done when.**
  - The RED scenarios of its specs were watched failing on `main` at `f3e9887d` and pass; the guards pass before and
    after; an unpinned call is byte for byte as before on every road; each mutation check of test 26 turned red what it
    names and was restored; `agentCommands.ts` is within §3.6's count; typecheck, lint and the whole suite are green.
  - E1's smoke (section 10 of `ssh-agent-itest.cjs`) passes on the changed words, both legs (test 27).
  - The code gate is at `proceed` and E2's PR is merged. E2 is not released.
- **Cornerstone areas.** One: **the complete words of one pinned call and the refusals that stand before them** (§3.10,
  §3.11): which pairs a pin file gets, how its path is written, and the two decisions that stop a call before it starts
  (the path, the client). It is the one road in for every pinned call off a bridge: the three roads, the agent's exec and
  *Run with Secrets* only use it. A mistake there reads as working: a path that `ssh` resolves to another file, a source
  that stays on for one kind of client, a refusal that a road reads as "no pin". Not marked, and Fable's all the same,
  outside the quota: the rule of evidence for sentence C and the words of sentences D, E and F (§3.12) are security
  judgements (`subagent-models.md`, the row *Security judgement*).
- **Stories.** [PLAN_person_roads_pin_host_key_E2.md](PLAN_person_roads_pin_host_key_E2.md) (2026-11-18): four stories,
  E2.S1-E2.S4; the cornerstone is E2.S2. The specs are written when each story starts: E2.S1,
  [PLAN_person_roads_pin_host_key_E2_S1_spec.md](PLAN_person_roads_pin_host_key_E2_S1_spec.md); E2.S2,
  [PLAN_person_roads_pin_host_key_E2_S2_spec.md](PLAN_person_roads_pin_host_key_E2_S2_spec.md); E2.S3,
  [PLAN_person_roads_pin_host_key_E2_S3_spec.md](PLAN_person_roads_pin_host_key_E2_S3_spec.md), [PLAN_person_roads_pin_host_key_E2_S4_spec.md](PLAN_person_roads_pin_host_key_E2_S4_spec.md) (all 2026-11-18).

### E3 — The release gate: every claim is measured on the roads, against a real `sshd`

- **State.** Partly built, not measured, and stopped (2026-11-25). Revised by the re-review for epoch 3 (§1.2; decisions
  14-18) and again by the re-review for epoch 4 (§1.3; decisions 19-22). On its branch, `fix/g1-e3-release-gate`, at
  `17694426`: E3.S1 (C19), E3.S2 (the launch instrument) and E3.S3 (the feasibility: all seven probes worked) are built and
  reviewed; the legs of M1, M6 (E3.S4), M4, M9 (E3.S5), M2, M3, M8 (E3.S6) and M7, M12, M14 (E3.S7) are built and reviewed;
  the legs of M5 (E3.S8) are built and not reviewed; M10, M11 and M13 (E3.S9) have a spec, written against the row of
  epoch 3, and no code; the one run of the whole set (E3.S10) has not started. Every run so far was a proving run, which
  passes no row. The Opus judge of the re-review sorts this work (`## Plan changes`).
- **Goal.** Every claim of this plan about what `ssh` does with these words is measured, on the roads themselves, on the
  code that will be released. E3 is the release gate: the release waits for the whole set (§2, decision 12). Before it
  measures, E3 builds the one repair that is known and not built (C19), and commits the instrument that it measures with,
  so that what is measured is the final behaviour, from the commit itself. The pass criteria below were written on
  2026-11-18, before any of E2 or E3 was built, and revised on 2026-11-19, before any of E3 is built. They were revised
  once more on 2026-11-25 (epoch 4), after the legs of eleven rows were built and before any row was measured. The legs of
  the one row whose criterion changes against the facts, M11, are not built. The re-review record names each place where a
  criterion got weaker, and why.
- **Scope.**
  - **One behaviour of the product, built first: C19** (E3.S1; §3.12, part 4; tests 28-32). This replaces the sentence "No
    new behaviour of the product" of epoch 2 (decision 14). E3 builds no other behaviour.
  - **The launch instrument, committed second** (E3.S2; decision 16; test 33), and the feasibility of the instruments that
    are not known to work (E3.S3; decision 18).
  - The harness of the real runs (E1's counterpart, section 10, extended); the measurements M1-M14; the repair of
    whatever one of them shows, inside the limit of §9, step 9; the results, written into this plan as §10; the check of
    the CHANGELOG entry against them, with its known correction (§6); the real-run part of `research/module_tests.md` (§6).
  - **Since epoch 4: one change of test code, test 34** (§5), built by E3.S9 with the older client that it brings up. It
    changes no behaviour of the product, so C19 stays the one behaviour that E3 builds.
- **Depends on.** E2 built and through its code gate (done; not merged). Epoch 3 open: the re-review has passed. E2's
  pull request merged before E3's branch takes `main` and before the whole set runs (§9, step 9). G2 merged (M3 measures it).
  Since epoch 4: E2 is merged (#388) and E3's branch has taken `main`. What E3 waits for now is the line of epoch 4: the
  judge, the coai round on the revised plan and the owner's approval of the narrowed re-review.
- **Its first three stories, in this order.** The stories document (by Opus, when E3 starts) writes them out and splits
  the rows into the stories after them; the order of these three is the re-review's.
  - **E3.S1 — C19: a run that ended with 0 is told nothing about a host key.** Its spec: [PLAN_person_roads_pin_host_key_E3_S1_spec.md](PLAN_person_roads_pin_host_key_E3_S1_spec.md) (Fable, 2026-11-23). `hostKeyTold` takes the run's exit code as
    a required parameter and answers nothing for 0; both callers hand it over on the lines that exist (§3.12, part 4). The
    spec is Fable's, a security judgement; tests RED first. *Done when:* tests 28-32 pass, each mutation check of test 31
    turned red what it names and was restored, the documents of §6 that are E3.S1's are written, and M5 keeps its leg with
    exit code 255 (g) and has its leg with 0 (h).
  - **E3.S2 — The launch instrument, committed before anything is measured** (W4, §1.2). One launcher for every
    counterpart. (1) The `sshd` executable is a parameter of the run, and so are the extra lines of the server's config (an
    unpacked `sshd` needs `SshdSessionPath` and `SshdAuthPath`, and its executable is a wrapper that sets its library
    path). With no parameter: `/usr/sbin/sshd` and no extra line, as CI runs it today; under `CI=true` a missing `sshd` still
    fails. How the parameters are handed (the names of the variables, or a file of the run) is the story's to choose; no
    tracked file is edited to hand them. (2) The serving launcher (`startServingSshd`, `sshd -D -e`, every connection) is the
    one that every row uses; `sshd -d`, which serves one connection, starts no counterpart of a row. (3) A stop of the
    listener ALONE, by its own pid, which leaves alive what the listener forked for a session; `endServer`
    (`itestPinnedRoads.cjs:198`) ends those too, and stays the end of a leg. (4) The record of identities (the setup,
    below). (5) The other sections that start their `sshd` through `itestSshd.cjs` keep what they call. *Done when:* test 33
    passes; E1's smoke (section 10) passes locally on an unpacked `sshd` from a tree with no modified tracked file, and its
    record of identities is in the story's results; the story shows, with a master connection and the listener-only stop,
    that the master outlives its listener and carries one more command (the instrument of M3, proven before M3 is built).
  - **E3.S3 — The feasibility of the instruments that are not known to work** (*The feasibility comes first*, below),
    each probed through the committed instrument.
- **The setup of every measurement.**
  - *The counterpart:* an `sshd` that the run starts for itself on the loopback, on a free port, from its own
    config, with host key K1, in an owned temporary folder. K2 is another host key:
    a second counterpart at the same address stands for another machine there.
  - *The roads:* the registered commands `credSshManager.installRemoteCli` and `credSshManager.openRemoteBridge` (the
    socket check runs through the bridge's command), with the REAL `ssh` client, `runSshExec`, the bridge spawner,
    `materializeKnownHosts` and `forgetMaterializedKey`. Only the `vscode` module is the suite's stand-in, as in
    every test of this repository. M14 drives the agent's exec the same way.
  - *The five runs:* the sweep, the mode check, the probe, the install run, the bridge. **On a refused host key four
    of them start** (change 1.1): the install returns after a probe that failed (`installRemoteCli`,
    `agentCommands.ts:282-286`), so its second run never starts. Where a row needs the install run on a host with
    another key, it uses *the switch*: the counterpart presents the pinned key until the install's question is open
    (the probe has passed), then the other counterpart takes the address, and only then the question is answered. So
    the second connection goes through the production control flow.
  - *The install's stand-in (entry 1.2).* The counterpart is this machine, and the real install run downloads the
    published installer and writes `/usr/local/bin` (`install.sh:21`). A `CREDS_PREFIX` on this side does not reach the
    remote command, and the product's command is not changed for a test: `installCommand()` is called as production calls
    it (`agentCommands.ts:318`). So the stand-in stands on the counterpart's side, and it must keep four conditions:
    (1) the install run passes the real authentication of the real `sshd` and a command of it runs there, to its end;
    (2) what runs writes only inside the owned folder;
    (3) the published installer is not fetched;
    (4) the run proves (2) and (3) itself: the places that the real installer writes (`/usr/local/bin/creds`, and
    `/tmp/creds-install.*`) are listed with size, time and hash before and after and are the same; the recorded starts
    show that the real download program did not start.
    Here: the counterpart's login gets a `PATH` whose first folder is inside the owned folder and holds stand-ins for the
    download program (it records its argv and fetches nothing) and for the `sh` that the command starts (it runs an
    owned stand-in installer, which writes a marker with the run's nonce into the owned folder and prints the installer's
    line `creds-install: installed <path>`). How the login gets that `PATH` (the `sshd`'s own config, through the
    `extraConfig` of `startSshd`, `scripts/itestSshd.cjs:94`) is NOT measured: it is the first thing that E3's first story
    probes. The stories document may choose another instrument that keeps the four conditions.
  - *The stop of the listener alone (entry 1.2; M3).* The process that listens is ended by its own pid, not by its
    process group, so that the session of a master connection stays. The row proves that it stayed (M3). Since epoch 3
    this stop is a committed function of the launch instrument (E3.S2), proven there before M3 is built; the ordinary end
    of a leg's server, which ends everything that the listener forked, is not used for it.
  - *The control client.* The real `ssh` client that the harness starts itself, not through a road, with the words that
    the row names: "E1's words" are the three pairs of §3.9 alone, as `f3e9887d` writes them. A control shows that the hole
    is there without the repair. Its argv, exit code and the counterpart's log are recorded. **A control that does not
    show what its row says fails the row:** the row could not have failed.
  - *The parser of the client (epoch 4; decisions 19, 20).* A control or a witness whose words hold a path that is NOT in
    double quotes asks what the client's parser does with it, and OpenSSH has two: before 8.7 and from 8.7 on. The row says
    what must come out, and for which parser. The run never chooses an expectation by what came out. M7 has the expectation
    of the newer parser alone and runs on the rig's client: on an older client its collision fails, which is the right
    result, and the record of identities names the version. M11 puts another client in the place of the rig's, so before
    the legs of M11 (b) the run reads that client's version, checks that it is below 8.7, and fails the legs when it is not
    or when it cannot be read. The two rows together hold both parsers.
  - *The evidence:* the counterpart's log (accepted logins, authentication attempts, forwards); a record of every
    start of the client with its argv and its pid (the logging shim of section 10, first on `PATH`, which then runs the
    real client); the messages that the stand-in was shown, word for word and in order; the stderr of each run; the files
    in `keys/<pid>/`.
  - *The client's config,* where a row needs one, is handed to the real client by the harness, and to the nested client
    of a jump host too. The person's own `~/.ssh` is never read by a row and never written. Since epoch 4 (Y6, §1.3;
    decision 22): OpenSSH takes `~` from the password database and not from `HOME`, so no leg can put a file at the
    compiled-in default path of the person's known-hosts file. Where a row names "the person's file", it names the
    user-file slot: a file in the leg's own folder that the handed config names as `UserKnownHostsFile`. The row claims
    that slot and nothing about the compiled-in path.
  - *Where the rows run.* M1-M9, M12 and M14 on the rig of E1's smoke (an unpacked `sshd` here, `/usr/sbin/sshd` in CI;
    `CI=true` fails a missing one). M10 where the run owns the resolver, and M11 where a client older than 8.5 runs: a
    container that the run starts, or an unpacked package; the stories document says which. M13 on the Windows client of
    the owner's machine, the client alone, as K7 of the spec of E1.S1 did. As E3.S3 probed them (2026-11-24): M10 in a
    container that the run starts; M11 with an unpacked OpenSSH 8.4p1 as the program of the roads, on this machine, against
    the counterparts of the rig; M13 from this machine against the owner's `ssh.exe`.
  - *The launch instrument (epoch 3, decision 16).* Every counterpart of a row is started by the committed launcher of
    E3.S2, with the executable and the extra config lines as parameters of the run. The whole set runs from a tree with no
    modified tracked file; the run records `git rev-parse HEAD` and the answer of
    `git status --porcelain --untracked-files=no`, which is empty, or the run is no run of that commit.
  - *The identities (epoch 3, decision 16).* Beside the results, for the same commit: the path, the version and the
    SHA-256 of every executable that a row ran (the client; the `sshd`, its wrapper and the helper programs that its config
    names; the older client of M11; `ssh.exe` of M13; the resolver of M10), and the SHA-256 of every config text that the
    run handed to one of them. A result with no identity beside it is not a result of its row.
  - *What a row counts (epoch 3, decision 15).* Four numbers, and no row puts one for another. A START of the client: every
    start that the shim records, the question `ssh -V` included. A CONNECTION START: a start whose argv names a
    destination (the sweep, the mode check, the probe, the install run, the bridge). An AUTHENTICATION ATTEMPT, from the
    counterpart's log. An ACCEPTED LOGIN, from the counterpart's log, with the command that ran and the exit code that the
    run ended with. A road that the refusal of another road keeps from starting (the socket check after a refused bridge,
    §3.3) has no start of any kind in that leg, and the record shows it.
  - *The state of the asker (epoch 3, decision 15).* The window keeps the answer of a client that knows
    `KnownHostsCommand`, and asks an older or an unreadable client again at every pinned call (§3.10, *The order as E2
    built it*). *Cold:* an asker that asked nothing yet; a new world has one (`world()` evicts the modules of `out/`,
    `itestPinnedRoads.cjs:47`). *Warm:* an asker that holds the kept answer of the newer client, made by one pinned call to
    K1 in the same world before the leg; that call's own starts are not counted in the leg. A leg whose numbers depend on
    the state names it and makes it itself. No leg takes it over from the leg before, so the order of the rows decides
    nothing.

| # | The theory | The run | Passes when |
|---|---|---|---|
| M1 | A pinned entry whose host presents the pinned key works on all three roads, to the end of the install | the entry pinned to K1, the counterpart K1; the install to its end through the stand-in, the bridge with its check | the counterpart logs exactly 5 accepted logins, one per run; each of the 5 recorded argvs holds `StrictHostKeyChecking=yes`, one path as both known-hosts files, `VerifyHostKeyDNS=no`, `KnownHostsCommand=none` and `LogLevel=ERROR`; the install's two runs name one path, the check's two runs one path, the bridge its own: 3 distinct paths; the forwarded socket exists while the bridge is open and the check reads its mode; no sentence of §3.5 is shown; the stand-in's marker holds the run's nonce; the four conditions of the stand-in hold, each by its own evidence. Since epoch 3: the run is cold, and beside the 5 connection starts the record holds exactly ONE question `ssh -V`, started before the first connection; how long it took is recorded (C20: the wait of a normal run) |
| M2 | A key that another known-hosts file trusts does not satisfy a pinned call (P1) | the entry pinned to K1; K2 is listed (a) in the file that the client reads as the person's default one (since epoch 4, said as it can be run: the USER-FILE SLOT, a file `.ssh/known_hosts` in the leg's own home folder that the handed config names as `UserKnownHostsFile`; before the roads run, `ssh -G` under that config shows that the client resolves this file as the person's own. It is not the compiled-in default path, which is in the person's real home and which no leg reads or writes: Y6, §1.3), (b) in the file that it reads as the system-wide one (an owned file that the handed config names; the result says which). Two legs, each for (a) and for (b). *The mismatch:* the counterpart is K2 from the start. *The switch:* the counterpart is K1 until the install's question is open, then K2 takes the address and the question is answered | *The mismatch,* for (a) and for (b): each of the four runs that start ends with exit code 255 and the verification line; the record of the client's starts holds no install run; K2 logs 0 accepted logins, 0 authentication attempts and 0 forwards. *The switch,* for (a) and for (b): K1 logged the probe as accepted; the install run starts once and ends with exit code 255 and the verification line; K2 logs 0 accepted logins and 0 authentication attempts; the stand-in's marker was not written; what the install shows is recorded word for word. The control, in (b): the control client with the two pairs of before E1 (no `GlobalKnownHostsFile`) is accepted by K2. Since epoch 4 (decision 22): the numbers of (a) do not change, and the result says in words what (a) proves, the user-file slot that the handed config names, and that it claims nothing about the compiled-in default path |
| M3 | With G2 on `main`, a live master connection does not carry a pinned call past the key check | a master connection to the counterpart (K1) is alive through the handed config (`ControlMaster`, `ControlPath`, `ControlPersist`). The counterpart is the serving launcher of E3.S2, and the switch uses its stop of the listener alone (epoch 3). Two legs. *The mismatch:* the entry is pinned to K2. *The switch:* the entry is pinned to K1; when the install's question is open, K1's listener alone is ended, K2 takes the address, and the question is answered | *The mismatch:* each of the four runs that start ends with exit code 255 and the verification line; the record of the client's starts holds no install run; after the master was set up, K1's log shows no new session, command or forward. *The switch:* the master is alive directly before the question is answered and directly after the install run has ended (`ssh -O check` on the control path ends with 0 both times); the install run starts once and ends with exit code 255 and the verification line; between the switch and the end of that run K1's log shows no new session or command, and K2 logs 0 accepted logins. Then the control, AFTER the switch: the control client with the same pin words and without G2's two options ends with 0, and K1's log shows one new command: the master was there to ride, and the road did not ride it. Since epoch 3, said outright: if that control does not end with 0 through the master that survived, the row is NOT passed, because a master that went down with its listener would show "no bypass" for the wrong reason |
| M4 | An absent pin connects as before; an unusable pin and a failed pin write start no connection and attempt no authentication, whatever the window asked before (revised for epoch 3: entry 2.2, decision 15) | (a) no `hostKey`, an empty one, one of white space; (b) a text that does not parse; (c) a parsed key on a host that cannot form a line; (d) a pin write that fails. (b), (c) and (d) each run TWICE on each road, in a world of their own: once *cold* and once *warm* (the setup: the state of the asker). The newer client is the program of the roads | (a): the 5 connection starts carry `accept-new`, no known-hosts file and none of the pairs of E2; 5 accepted logins; 0 pin files written; and, cold, 0 starts of the client with `-V` (an unpinned call is not asked). (b), (c), (d), on *Install creds on host* and *Open Remote Bridge…*, in BOTH states (the socket check is reached only after a bridge started, §3.3, so in these legs it has no start of any kind and the record shows it, by the note on what a row counts; its own refusal on an unusable pin is held by its unit tests): 0 connection starts; 0 connections and 0 authentication attempts in the counterpart's log; no *bridged* row; 0 files left in `keys/<pid>/` (except one case, candidate C14: in (d) a pin file that the failed write had begun can stay until the next activation's purge, and the run names such a file when it finds one); sentence A in the login's form for (b) and (c), sentence B for (d). And the starts of the client, which the row of epoch 2 put at 0: *cold*, exactly ONE per refused call, the question `ssh -V`, and it had ended before the sentence was shown; *warm*, exactly 0. Either number wrong fails the leg: two starts cold, or one start warm, is a call that asks more than §3.10 says. Recorded for C9: whether the bridge's command minted a token before it refused |
| M5 | A refused host key is told to the person as what the call saw, and nothing else is (P3, V4, V5) | pinned to K1 in all eight. (a) the counterpart K2. (b) the counterpart stopped. (c) the counterpart K1, its login refused. (d) an address that does not answer inside the run's time limit. (e) as (a), and the handed config says `LogLevel QUIET` (since epoch 4: `ssh -G` prints that level as `loglevel SILENT` on OpenSSH 10.2p1, so a check that the handed config resolves the quiet level takes either name and records which one was printed: Y7, §1.3). (f) the counterpart K1, and the handed config sends the connection through a jump host of the run (a second `sshd`) whose key the jump host's own known-hosts file refuses. (g) the counterpart K1 with the login accepted, and the remote side writes `Host key verification failed.` as the last line of its stderr and ends with 255 (here: the `sshd`'s forced command). (h), epoch 3 (C19): as (g), but the remote side writes the line to its stderr and then runs the command that it was asked for, which ends with 0 (here: a forced command that writes the line and hands over to the original command) | (a): the install shows sentence C once and not "did not answer the probe"; after *Open Remote Bridge…* no *bridged* row is left, and exactly one error MESSAGE holds `The bridge to "<name>" is not open: ` and sentence C (a log line alone does not pass); the stderr of the probe and of the mode check holds the `Offending` line with the pin file of that call; the order of the messages is recorded. (b), (c), (d): sentences C and D are shown 0 times on both roads; what is shown is recorded word for word and is the same text that the same case shows on an unpinned entry in the same run. (e): as (a), every item; the control: the control client with E1's words under the same config ends with 255 and an empty stderr. (f): each run that starts ends with 255; the destination logs 0 connections; sentence C is shown 0 times; the install shows sentence D once; exactly one error message holds `The bridge to "<name>" could not be checked: ` and sentence D; no *bridged* row is left; no stderr holds a line with the pin file of its call. (g): K1 logs the logins as accepted; the probe and the mode check each ended with 255 (recorded); sentence C is shown 0 times; the install shows sentence D once; exactly one error message holds `The bridge to "<name>" could not be checked: ` and sentence D, and the *bridged* row stays (the tunnel is up). (h): K1 logs the logins as accepted; the probe and the mode check each ended with 0, and the stderr of each holds the verification line (without that the leg could not have failed, and it is not passed); sentences C and D are shown 0 times on both roads; the install reaches its question, the one that `confirmationFor` builds from the probe's answer; the socket check shows no error message and reads the socket's mode, and the *bridged* row stays. The control of (h) is (g) of the same run: the same text with exit code 255 shows sentence D, so the text was read and the exit code alone decided |
| M6 | Every call owns its files, calls do not disturb each other, nothing is left | two installs of one pinned entry that overlap; a bridge with its check; a bridge replaced by a second; each with a stored key, with a key that the person named by its path, and with a password; a file `known_hosts-<id>` is in the folder before | the pin paths of calls that overlap are distinct, as many as the calls; at each call's end its own file is gone and every other call's file is there with its bytes; `known_hosts-<id>` and the person's own key file are the same bytes after; after the last end: 0 files of these calls in `keys/<pid>/`, 0 client processes alive (by the recorded pids, not by name), no forwarded socket left (since epoch 4, as the owner read it on 2026-11-24: no LIVE forward, which means that nothing listens on a bridge socket of the leg; the dead socket file that `sshd` leaves when the client has ended is recorded and not judged, and the next bridge sweeps it). The password entry: with K1 the counterpart's log shows that the password attempt arrived (accepted, or `Failed password` where the counterpart cannot check one; the result says which); with K2 it shows 0 authentication attempts |
| M7 | The pin file is read as the one intended file where its path needs double quotes (V2, R2) | the storage folder's path holds (a) a space, (b) one apostrophe, (c) a pair of apostrophes, (d) a space and an apostrophe, and, since epoch 3, (e) a backslash as the last character of the folder's own name: the complete pathname of the pin file then holds one backslash inside and does not end with one, so the rule writes it bare, and it is no case of M12 (W5); for each the runs of M1 and of M2 (b), both legs. *The collision,* for (c): a file at the path that the bare word resolves to (the apostrophes taken out) holds K2's line, the pin file holds K1's; once the counterpart is K1, once K2. Since epoch 4 (decision 19): the collision is the expectation of a client from 8.7 on, and the file at the path without the apostrophes is called the TWIN. The row has this one expectation, and its client is the newer client of the rig (OpenSSH 10.2p1 here). The record of identities names the client's version, and §10 holds it beside the result of the collision. On a client before 8.7 the two legs of the collision fail as written and are not passed; that parser's form of them is M11 (b)'s | (a)-(e): as M1 and as M2 (b), both legs; in the mismatch leg both roads show sentence C (the `Offending` line names the pin file of a quoted word, and for (e) of a bare word with a backslash, which `ssh` prints as two). Before (e) drives a road, the run asks the product's rule for the complete pathname of its folder and gets no refusal: if the rule refuses it, the leg is not passed, it has become a case of M12. *The collision:* with the counterpart K1, 5 accepted logins; with K2, each of the four runs that start ends with 255 and the verification line, and K2 logs 0 accepted logins and 0 authentication attempts. The control: the control client with E1's words (the path bare) is ACCEPTED by K2: it read the other file. Since epoch 4 the row also names the witness that E3.S7 built, so that both bare-word outcomes of the newer parser are fixed: with the counterpart K1, after the counts, the control client with E1's words (the path bare) ends with 255 and the verification line, and K1 logs no new accepted login, because the bare word read the twin, which holds K2's line |
| M8 | `KnownHostsCommand`, alone, is not asked by a pinned call (V1, R1) | the entry pinned to K1, the counterpart K2; the handed config names a `KnownHostsCommand` that prints K2's line and records each of its own starts; no DNS source is on | The control first: the control client with E1's words is accepted by K2, and the command's record holds at least one start. Then the roads: each of the four runs that start ends with 255 and the verification line; each recorded argv holds `KnownHostsCommand=none`; the command's record holds 0 starts for the roads' runs; K2 logs 0 accepted logins and 0 authentication attempts |
| M9 | The advice of sentence A repairs the pin (the key form), and no password entry is given it (P2) (revised for epoch 3 with M4: decision 15) | a key entry with a pin that does not parse: the roads, once *cold* and once *warm*, each in a world of its own; then Connect's options (`connectionOptions`) with the real scan of the counterpart (K1) and *Trust and connect* answered; then the runs of M1. Beside it, for C1: a password entry in the same state, the scan given no answer, the roads cold and warm as for the key entry | the two roads that it can reach (*Install creds on host* and *Open Remote Bridge…*; the socket check has no start of any kind, as in M4) showed the key form and started NO CONNECTION: 0 connection starts, and 0 connections and 0 authentication attempts in the counterpart's log, in both states; of the client's starts, which the row of epoch 2 called "nothing": cold, exactly one per refused call, the question `ssh -V`; warm, exactly 0; the stored pin is K1's line after the answer, and M1 passes on that entry; the password entry was shown the password form, with the same numbers in both states, and the counterpart's log shows no password attempt. Recorded for C1: whether Connect's options for it name no pin file |
| M10 | A secure SSHFP record, alone, does not admit a key to a pinned call (V1, R1) | where the run owns the resolver: the counterpart has a name, and the resolver answers a SECURE SSHFP record of K2 for it and records each question. The entry is pinned to K1, the counterpart is K2, the handed config says `VerifyHostKeyDNS yes`; no `KnownHostsCommand` is named | The control first: the control client with E1's words is accepted by K2, and the resolver's record holds the SSHFP question. Then the roads: each of the four runs that start ends with 255 and the verification line; each recorded argv holds `VerifyHostKeyDNS=no`; the resolver's record holds 0 SSHFP questions for the roads' runs; K2 logs 0 accepted logins and 0 authentication attempts. If the control is not accepted, the row is NOT passed: it showed no bypass |
| M11 | The answer for an older client holds on a real one (R1, R2); and, since epoch 3, a client that never answers ends the call in bounded time, with nothing sent; and, revised for epoch 4 (entry 3.2; decisions 19, 20), on a client before 8.7 the intended file alone supplies trust, although that client reads a bare word otherwise than a newer one | a real client older than 8.5 as the program of the roads (so it is older than 8.7 too; the run reads its version before the legs of (b), and the result names it: OpenSSH 8.4p1 for the client of E3.S3). (a) The client alone: a config line `KnownHostsCommand …` and no `IgnoreUnknown`; then the same with the config's own `IgnoreUnknown` for it, pinned to K1 against the counterpart K2 with the command printing K2's line. (b) The roads, under a config of their own that names no `KnownHostsCommand` (that line is (a)'s alone; a pre-8.5 client would refuse to read it): the runs of M1, of M2 (b) the mismatch, and of M7 (a)-(e), each shape as M7 has it, with the runs of M1 and both legs of M2 (b). The row of epoch 3 went on: "M7's control showing acceptance through the colliding file with E1's words". This client cannot show that (Y1, §1.3), so epoch 4 puts in its place *the twin of (c), on the older client:* the same two files as in M7's collision, where the pin file of the call (the intended file) holds K1's line and the twin (the path with the apostrophes taken out) holds K2's line; once the counterpart is K1, once K2. And *the equals-sign pair*, which the lead took into the row after the judge's review: the collision that the older parser does have. The storage folder's path holds one equals sign, so the product writes the pin file's path in double quotes. The pin file of each call holds K1's line. The twin, a file at the first name that a split of the bare path at the sign gives (the path up to the sign), holds K2's line. Once the counterpart is K1, once K2. The same two legs run a second time with the newer client of the rig (OpenSSH 10.2p1), so that the row holds this kind on both parsers. (c) A program that answers `-V` AT ONCE, with no version at the start of its stderr. (d), epoch 3 (W3; C20), *the version that never comes:* cold, a program that records its start with `-V`, answers nothing and does not end by itself | (a): without `IgnoreUnknown` the client ends with `Bad configuration option` and 255 before it connects; with it the login is refused with the verification line and K2 logs 0 accepted logins. (b): as M1 and M7 with their `KnownHostsCommand` assertion replaced by its opposite: NO `KnownHostsCommand` pair in the 5 argvs and with `VerifyHostKeyDNS=no` and `LogLevel=ERROR` in each; as M2 (b), the mismatch; as M7 (a)-(e), for each shape the runs of M1 and both legs of M2 (b), with every check of the product's own word as M7 has it (the word in double quotes in (a)-(d) and bare with a backslash in (e); in the mismatch leg both roads show sentence C, and the `Offending` line names the pin file); and, since epoch 3, M1's one question replaced by its count for an older client: one question `ssh -V` before the connections of EACH pinned call (three: the install, the bridge, its socket check), because an older answer is not kept. Revised for epoch 4, in place of "with its collision": *the twin of (c).* Before its two legs the run asks this client with `ssh -G`, as both known-hosts options, for the bare word of (c) and for the same word in double quotes; each resolves to itself in both lists, the apostrophes kept. That is the fixed expectation of a client before 8.7, and another answer fails both legs. *With the counterpart K1:* the roads log 5 accepted logins, as in M7; then the witness, the control client with E1's words (the path bare), ends with 0, and K1 logs one more accepted login with its command: the bare word read the intended file. *With the counterpart K2:* each of the four runs that start ends with 255 and the verification line, and K2 logs 0 accepted logins and 0 authentication attempts, as in M7; then the control client with E1's words (the path bare) ends with 255 and the verification line, and K2 logs 0 authentication attempts and 0 accepted logins for it: the twin held K2's line, and the client did not read it. In each leg the twin holds K2's line before a client that could read it starts. The two legs decide together: the K1 leg rules out that the client found neither file, and the K2 leg that it found the twin. A bare-word outcome the other way round, in either leg, fails the row: it would be the collision of a newer parser on a client that the run read as older, and the expectation is fixed by the version, never by the outcome. *The equals-sign pair, on the older client.* Before its two legs the run asks this client with `ssh -G`, as both known-hosts options, for the bare path and for the path in double quotes. The bare path resolves to two names, and the first is the path of the twin; the path in double quotes resolves to itself, whole, in both lists. That is the fixed expectation of a client before 8.7 (probes P3.5 and P3.4 of E3.S3), and another answer fails both legs. *With the counterpart K1, the witness:* the roads of the product, with the logins as in M1: 5 accepted logins, the path in double quotes in every connection start, and no sentence of §3.5. The twin is there and is not read. *With the counterpart K2:* each of the four runs of the roads that start ends with 255 and the verification line, and K2 logs 0 accepted logins and 0 authentication attempts. Then the control: the control client with E1's words (the path BARE) is ACCEPTED by K2: it ends with 0, and K2 logs one more accepted login with its command. It read the twin. That is the hole of this parser, and the roads of the same leg show that the double quotes close it. If K2 does not accept the control, the row is NOT passed: it showed no hole. *The same pair with the newer client (10.2p1).* First `ssh -G`: the bare path resolves to itself, whole, in both lists (the fixed expectation of a client from 8.7 on; measured on 10.2p1, 2026-11-23). The roads give the same results against K1 and against K2. The control with E1's bare words against K2 ends with 255 and the verification line, and K2 logs 0 authentication attempts and 0 accepted logins for it; in the K1 leg the same bare words end with 0 and K1 logs one more accepted login, which rules out that the client found neither file. So the newer parser has no collision of this kind, and the result says so in words. An outcome the other way round, on either client, fails the row. Only `ssh -G` was measured for this pair; the logins are for the one run of the whole set to show, and a leg of it that cannot run as written is told to the lead (decision 18). NOT shown by (b), and the result says so: the collision of a pair of apostrophes on the older client, which that client does not have (M7 shows it on a client from 8.7 on), and a client of 8.5 or 8.6. (c): on each road 0 connection starts (the record holds the `-V` starts alone, one per refused call), 0 connections and 0 authentication attempts in the counterpart's log, 0 pin files written, sentence F with the exit code, no *bridged* row. (d): on each road the record holds exactly ONE start, the `-V`; 0 connection starts; 0 connections and 0 authentication attempts in the counterpart's log; 0 pin files written, during the wait and after it; sentence F in its form without an exit code ("it did not start, or did not end in time"); no *bridged* row; the program that never answers is gone, by its recorded pid and start time and never by name, no later than the margin after sentence F; two times are recorded per road, from the start of the command to sentence F and to the end of that program, and each lies between the runner's limit (10 s, `CLIENT_CHECK_TIMEOUT_MS`) and that limit plus a margin that the stories document fixes before the run; recorded for C20: both times, and what the person was shown while waiting. The result names the client's version |
| M12 | A path that cannot be written for `ssh` as one file starts nothing, for every refused kind (V2, V3, R3; entry 2.1; revised for epoch 3: W5) | A leg is named by the COMPLETE pathname of the pin file as the product makes it (`knownHostsPath`: the storage folder, `keys/<pid>/`, `known_hosts-<id>-<uuid>`), not by the folder alone. Six kinds can come from a storage folder, and each is a leg on the roads; the folder's path holds (a) a double quote, (b) two backslashes in a row (the shape of a UNC folder; on Linux a folder of that name stands for it), (c) `%h`, (d) `${HOME}`, (e) a backslash before an apostrophe, (f) a control character (a tab). Two kinds cannot come from a storage folder, and are legs of the rule and of the client alone: (g) a backslash at the END of the pathname (the pathname ends with the file's name; a folder that ends with a backslash is M7, e), (h) a tilde at its START (the storage folder is an absolute path). In (a)-(f) the entry is pinned to K1 and the counterpart is K1, so only the refusal can stop the call; it signs in with a key that the person named by its path, outside that folder, so the pin file is the only file that the call would write there; each leg is cold | Coverage first: the run reads the kinds from the product (`PIN_PATH_KINDS`, `hostKeyPin.ts:143`) and fails when one of them is neither a leg (a)-(f) nor (g) or (h); and for each of (a)-(f) it asks the product's rule for the complete pathname of that leg's folder and gets the kind of the leg, before a road is driven. (a)-(f), on each road: 0 starts of the client of ANY kind, the question `ssh -V` included (the rule stands before the question); 0 connections in the counterpart's log; no file written into the storage folder; no *bridged* row; sentence E with the kind of that path. (g), (h): the product's rule, asked with such a pathname, refuses it with its kind; no road is driven for them, and the result says so; the control, the client alone: `ssh -G` with that word as both known-hosts options does not resolve both lists to the one pathname ((g) in double quotes: `invalid quotes`; (h): expanded in the person's list and not in the system-wide one), so the refusal has its reason on the client of this run. No recorded argv of the whole run of E3 names `/dev/null` as a known-hosts file |
| M13 | The Windows client reads the words as the Linux client does (R2, R3), the client alone | `ssh.exe -G` of the Windows that the owner's machine has, started with the argv as separate arguments, with the words that the final code writes for a pin file under a storage folder (a) with a space, (b) with an apostrophe, (c) with both; and the rule asked for a UNC folder (`\\server\share\…`) | (a)-(c): the client resolves strict checking, `verifyhostkeydns false`, no `knownhostscommand`, `loglevel ERROR`, and both known-hosts lists as the one intended path; for (a) one file is told from two by the control of K7; for (b) and (c) the bare word is refused (255, `invalid quotes`: the apostrophe is read before any tilde, entry 4.1). The UNC folder: the rule refuses it, and no `ssh.exe` is started for it; the control: `ssh.exe -G` with the bare and the quoted UNC word resolves another path (K8 c). The result names the client's version. NOT in this row: a login on Windows (C6) |
| M14 | The agent's pinned exec gets the same words and the same refusals (§3.9: the one effect outside the three roads) | the agent's `ssh:exec` through its own call, off a bridge, as section 9 of `ssh-agent-itest.cjs` drives an exec; the entry pinned to K1. (a) the counterpart K1. (b) the counterpart K2 and the handed config of M2 (b). (c) the counterpart K2 and the handed config of M8. (d) the storage folder of M12 (a) | (a): one accepted login; the recorded argv holds the six pairs of M1. (b), (c): exit code 255 and the verification line; K2 logs 0 accepted logins and 0 authentication attempts. (d): 0 starts of the client of any kind, the question `ssh -V` included (cold), and the agent's answer names the field and holds no path. NOT in this row: *Run with Secrets* over SSH, which calls the same builder (tests 22, 23) and needs a terminal's launch to run |

- **How the rows are read** (epoch 4). These readings were settled in epoch 3, while the stories were specified and built:
  by the lead after a consult where the item names one, and by the owner or the lead alone where coai could not be asked
  (it refused every call then; its data folder was not found). They are records, not plan changes: no row, no kind of
  instrument and no number changed by them. They stand here so that the one run of the whole set and its judge read each
  row as it was built. The specs hold the full answers.
  - *Every row of the rig:* the roads run the REAL resolve of the credential in a process of the leg; only the `vscode`
    module is a stand-in (the spec of E3.S4, A1; consult `da8604ac`). `askpass.sh` in `keys/<pid>/` is the window's helper
    and no file of a call (A2; consult `a185f2e1`).
  - *M2 (a):* the user-file slot (the owner; Y6; the row says it now).
  - *M2, M3, M8, "each of the four runs … ends with … the verification line":* the bridge's `ssh` has no stdio in the
    product, so the shim writes a stderr that the product IGNORES to a file of the run, and the line is read there. The
    product's spawn, argv, environment and exit code are as they are (the spec of E3.S6, A2).
  - *M3, the control "with the same pin words":* the install run's recorded words, with only the path of the two
    known-hosts options replaced by a file of the control's own that holds the same line; the road's pin file is deleted
    by then (the spec of E3.S6, A3).
  - *M5 (b)-(d), "the same text … on an unpinned entry in the same run":* the same run of the script; one unpinned twin
    leg per case, compared by the messages shown (kind, text, order). The log lines of C7 are recorded and not compared,
    because each names the socket of its own call (the spec of E3.S8, A2).
  - *M5 (d), "an address that does not answer":* an address on the loopback whose connection is made and whose SSH answer
    never comes; the leg records which limit ended each run. No address outside this machine (A1).
  - *M5 (e):* `QUIET` or `SILENT` in the answer of `ssh -G` (Y7; the row says it now).
  - *M5 (f), "each run that starts":* the four connection starts that the shim records. The nested client of the jump host
    is started by an absolute path, so it is seen in the jump host's log and in the `Offending` line of the jump host's own
    file (A4).
  - *M5 (h), "reads the socket's mode":* no error message, and the mode check's own answer is an owner-only mode. The
    check says nothing for such a mode, and no leg widens the mask of the forwarded socket to get a sign (A3).
  - *M6, "no forwarded socket left":* no LIVE forward (the owner; the row says it now).
  - *M7 (c), the twin:* the pathname of a pin file holds the uuid of its call, so the rig writes the twin at the moment
    the call's pin file is known and before that call's client starts; the leg shows the order (the spec of E3.S7, A3).
  - *M9, "then Connect's options … then the runs of M1":* the repair starts from the same state in a new world, so that
    M1's one question can be counted cold (the spec of E3.S5, Q1; consult `9d5c1fe5`).
  - *M11 (c), M11 (d), M12, "on each road":* the roads that the leg can drive. The socket check after a refused bridge has
    no start of any kind, by the setup's note (the stories document, Q3).
  - *M14, "through its own call":* the action's own `run` with the dependencies that production assembles, off a bridge,
    against the real `sshd`. The broker's HTTP layer and its consent stand above it and are not proven by the row (the
    spec of E3.S7, A1). *M14 (d), "names the field":* the place that sentence E names, with the kind, and no path (A2).
  - *The equals sign* has no leg in M7 and none among the shapes (a)-(e) that M11 (b) takes from M7 (the stories document,
    Q1; §3.11). Since the re-review for epoch 4 it has the one pair of M11 (b), on both clients. That pair is a part of the
    revised row and no reading.
  - *HC1 of E3.S4* was a hand check whose prediction was wrong; every row and every instrument ran as written (the owner).
- **The feasibility comes first** (E3.S3 since epoch 3: after C19 and after the committed instrument, before any row is
  built). The story probes the instruments that are not known to work, as E1.S4's probe did: the `PATH` of the
  counterpart's login for the install's stand-ins; a resolver that the run owns and whose answer the client takes as secure
  (M10); a client older than 8.5 that runs here (M11); a handed config that the nested client of a jump host reads too
  (M5 f); the Windows client from this machine (M13); and, since epoch 3, a forced command that writes the verification line
  and then runs the command it was asked for, to exit code 0 (M5 h), and a program that never answers `-V` and that the
  runner's limit ends (M11 d). The stop of the listener alone, with a master that stays, is proven by E3.S2. Each probe
  runs through the committed instrument and records the identities of what it ran, as a row does. A probe that fails is
  not a skipped row. It is a recorded plan change, and when it makes the release gate smaller it goes to the owner, the
  question consultants first (decision 18). Four of these are not proven and are said so here, so that nobody plans on
  them: the install's stand-in, the resolver, the older client, Windows.
  **Since E3.S3 (2026-11-23 and 2026-11-24): all seven probes worked,** and an Opus judge read each result
  (`research/module_tests.md`, *The instruments of E3's rows, probed*). A probe asks whether an instrument can show what its
  rows need; it passes no row. The probe of the older client showed that OpenSSH 8.4p1 runs here and that the product reads
  it as older; it did not ask what that client does with a bare pair of apostrophes. That was found when E3.S9 was
  specified, and it is entry 3.2: the instrument works, and the row could not run as written.
- **Done when.**
  - E3.S1 and E3.S2 are done as their own lines say (above), before the first row is measured: the commit of the results
    is a descendant of the instrument's commit and of C19's.
  - Every row passes as its last column says, in ONE run of the whole set on the final code: the rows of the rig in one
    run of the script, and M10, M11 and M13 on the same commit. A repair means the whole set again. Any later change before the release that can affect the
    shipped extension or the measurements (`src_vs_code/src`, the dependencies, the build, the packaging, the harness)
    means the whole set again; the run names its commit, and the release ships that commit's vsix.
  - That one run is a run of the commit: through the committed instrument, from a tree with no modified tracked file, after
    E3's branch has taken `main` (§9, step 9), with the identities of what ran beside the results.
  - A row that was not measured is not passed, and E3 is then not done: there is no "if no real host can be had". No row
    passes on either result. Every control showed what its row says.
  - The results are in §10, per row: the four numbers of the setup where the row counts them, the date, the client's and
    the counterpart's version, the commit, the identities, and for M10, M11 and M13 where they ran.
  - §10 holds one table for the CHANGELOG entry: each sentence of it that claims a behaviour, and the test of §5 or the
    row behind it. A claim with nothing behind it is taken out of the entry or said as "not measured". The sentence "No
    `ssh` starts" is corrected from M4 (§6).
  - Since epoch 4: test 34 passes on the final tree with the newer client first on `PATH` and with the older one, and
    §10 holds the result of the run with the older client beside M11. §10 says the limits of decision 22 in words (§6).
    Every control about a bare word ran against the fixed expectation of its client's parser (decision 19).
  - The code gate is at `proceed` and E3's PR is merged, after E2's (decision 17).
- **Cornerstone areas.** None. The quota of this plan is two cornerstones for three epics, and both are marked (E1.S2,
  E2.S2), so E3 can mark none; a third would go to the operator and not into the stories document (`subagent-models.md`).
  The one behaviour that E3 builds, C19, changes the rule of evidence of §3.12: its spec is a security judgement and is
  Fable's all the same, outside the quota (the row *Security judgement*). The instrument and the rows are Opus's to
  specify, as for every story that is no cornerstone.
- **Stories.** [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md) (2026-11-23): ten stories, no
  cornerstone. Its first three stories are E3.S1 (C19), E3.S2
  (the launch instrument) and E3.S3 (the feasibility), in that order; from E3.S4 on, the rows M1-M14, the results (§10) and
  the check of the CHANGELOG entry, as the stories document splits them. Since epoch 4: the ten stories and their order
  stay. E3.S9 (M10, M11, M13) is revised there for the new M11 (b) and takes test 34; its spec of 2026-11-24 is written
  against the row of epoch 3 and is written again before the story is built. E3.S10 runs test 34 on the older client with
  the whole set. The specs of the stories are linked from the stories document.
- **Info for M5 (a), the bridge.** The person also sees *Bridge open to …* before the check's error (§3.5 says so):
  the click shows it at once, and the check's message follows when its `ssh` is refused. E3's reading of the screen counts both lines.

### The remaining candidates

Each has its disposition here, as decision 12 asks before the release; the lead reads the list again at the release.
"Taken" means that an epic builds it and the candidate is closed: E2 built C2, C11, C13, C16 and C17, and since epoch 3 E3
builds C19 as its first story. No other candidate is built in E1, E2 or E3. A candidate that becomes work gets a plan
of its own (§9, step 12). C1-C10 were written with the plan, C11-C17 during E1, C18 and C19 during E2, C20 at E2's code
gate. The re-review for epoch 3 read all twenty again (2026-11-19): C19 and C20 change, the others stand as they are.
The re-review for epoch 4 read them again (2026-11-25): no disposition changes. C19 is built (E3.S1, on E3's branch). The
candidates that 1.23.0 shipped without (C1, C3-C10, C12, C14, C15, C18, C20) keep their dispositions for G1's next release.
One candidate is new, C21.

- **C1 — Connect refuses to go on when its scan answers nothing and no usable pin stands in** (§3.5; §7, F2).
  **Disposition: not built; a plan of its own, with C8** (the repair of a saved host key that cannot be used). Does not block
  the release: the password form of sentence A names no repair and says so, and the CHANGELOG says it. M9 records what
  Connect's options name for such an entry.
- **C2 — The config's own sources are off on a pinned call.** **Taken into E2** (R1, §3.10).
- **C3 — The agent's exec refuses an unusable pin** in place of reading it as no pin (§7, F1; decision 3).
  **Disposition: not built; a plan of its own, proposed as the next one on these roads.** It changes the contract of
  `materializeKnownHosts` for the road where nobody watches, and decision 3 kept it apart. It does not block the release
  on ONE condition, which is R5: the CHANGELOG's opening limits the guarantee to a saved host key that can be used.
- **C4 — Connect's terminal line takes the words of a pinned call** (`sshCommand.ts:312-329`): the pin as both files, the
  rule of the path, and since epoch 2 the two pairs of §3.10. **Disposition: not built; a plan of its own.** Its words are
  shell words per platform with a scan of their own, and its real run is a terminal. Does not block the release: the
  CHANGELOG names *Connect via SSH* as not covered.
- **C5 — The help article `remote-bridge` says it, in five languages together** (§6). **Disposition: not built; one pull
  request of its own after E3,** when the sentences are final and M5 has captured them. Does not block the release: the
  article says nothing about a saved host key today (read 2026-11-18), so nothing in it is false.
- **C6 — The real runs on Windows** (Win32-OpenSSH). **Disposition: partly taken, the rest not built.** Taken: the UNC
  folder is refused (R3), and M13 measures the Windows client alone. Not built: a login on Windows through the roads; a
  plan of its own when a Windows machine with a counterpart can be had. Does not block the release, and the CHANGELOG
  says that no login was measured on Windows.
- **C7 — The socket check's log line no longer says "is there" for an empty answer** (§7, F4; `agentCommands.ts:234`).
  **Disposition: not built; one small follow-up with C15** (what the socket check tells). Older than G1 and not about the
  pin. M5 (b) and (c) record the line.
- **C8 — The edit form can clear a saved host key that does not parse** (§7, F2, its second half). **Disposition: with C1.**
- **C9 — The pin is checked before the token is minted and before the PIN question** (§3.4). **Disposition: closed, not
  built.** §3.4 accepted the cost. M4 records whether a token was minted; the candidate is opened again only if a row
  shows that such a grant can be used after the refusal.
- **C10 — The doc comments of `agentCommands.ts` that have no function under them go** (§7, F5). **Disposition: the
  reserve of E2's line budget** (§3.6): built inside E2, in a commit of its own, only if the count does not hold. Else it
  stays a question for the lead, outside this plan.
- **C11 — An apostrophe in the storage path is quoted.** **Taken into E2** (R2, §3.11).
- **C12 — The match asks for the LAST line of the stderr.** **Closed, not built:** it does not tell a remote text that
  ends with the line (`97eb6bb5`). §3.12 replaces it with the evidence of the call's own pin file (R4). **And no longer a remedy
  for a hop** (measured by the E2.S3 spec, 2026-11-18): under `LogLevel=ERROR` the line `Connection closed by UNKNOWN port 65535`
  no longer follows a hop's verification line, so the verification line is the last line of a hop's refusal too, and "the last
  line" does not separate a hop from the entry's own refusal.
- **C13 — A pinned call states its own `LogLevel`.** **Taken into E2** (R4, §3.12, part 1).
- **C14 — A partly written pin file is removed when its write fails** (§3.1; the E1.S2 spec, §2.3; PR #365's
  `withoutPartialKey` is the cure for a key file). **Disposition: not built; one small follow-up with its test** (no test of
  E1 leaves a partly written pin file). Does not block the release: the file holds one public known_hosts line, no `ssh`
  is given its name, and the purge of the next activation removes it (§3.7). M4 (d) names such a file when it finds one.
- **C15 — The socket check's own pin-write failure is more than logged** (§3.3; the code gate on #379, finding 4).
  **Disposition: with C7.** The two refusals that E2 adds stop the bridge's own command first, which reads the same
  folder and asks the same program, so the check alone still meets only a write that failed.
- **C16 — A storage path that holds a double quote is refused before `ssh` starts.** **Taken into E2** (R3, §3.11).
- **C17 — `VerifyHostKeyDNS=no` on a pinned call.** **Taken into E2** (R1, §3.10).
- **C18 — A person's ssh config that renames the entry's host or port makes every pinned call fail closed with sentence D.**
  A `HostName` alias or a `Port` in the person's `ssh` config (measured by the E2.S3 spec, 2026-11-18: the alias once, the port on two hosts; a
  `HostKeyAlias` read, not measured) makes `ssh` look the key up under the resolved name and port, while the pin file holds the
  line under the entry's own host and port; the call is refused with `No <type> host key is known for <that name>` and the
  verification line, which is sentence D. **Disposition: not built; a plan of its own (§9, step 12), not blocking: it fails
  closed.** No test of this plan and no row of E3 holds it. Whether a pinned call should state `HostKeyAlias` itself is the
  question of that plan.
- **C19 — Show sentence D only when the run did not end with 0.** A remote profile that prints the verification line while the
  command succeeds gets sentence D as E2 built it, and the install stops (the rule of §3.12 asked the text only).
  **Taken into E3, as its first story** (E3.S1; §3.12, part 4; decision 14; tests 28-32; M5, g and h). The disposition of
  epoch 2 ("not built; … not blocking: the person is told a true thing about the line, and nothing is connected") is
  withdrawn, because both of its reasons are false (W2, §1.2): the sentence says that the connection "ended with" the line
  when it did not, and authentication and the remote command have already run. It is the baseline of epoch 3, not an
  entry: the re-review took it in (`8d07d6a6`, `22147fce`).
- **C20 — Progress while the client is asked** (the coai code gate of E2, rejected there for scope). A pinned *Run with
  Secrets* (and the other roads) waits up to 10 s with no sign when the `ssh` program does not answer `-V`, then shows
  sentence F. Epoch 2 said that a row of E3 would justify it, and no row measured that wait (W3). **Disposition: not built
  by this plan; decided by M11 (d), with M1's number beside it.** M11 (d) measures the worst case: how long a call waits for
  a program that never answers, that the wait ends with sentence F, and that no process and no connection is left. M1
  records how long the question takes in a normal run. If M11 (d) passes, the wait is bounded and fails closed, and a sign
  of progress is a change of what the person sees on five roads: a small plan of its own after the release (§9, step 12),
  for which the two numbers in §10 are the case or the dismissal; it does not block the release. If M11 (d) fails (no
  sentence F, a program left, a wait beyond the bound), that is not C20: it is a defect of §3.10, repaired inside E3, and
  it blocks the release.
- **C21 — A client of 8.5 or 8.6 is run** (the re-review for epoch 4). Such a client knows `KnownHostsCommand` and is
  read to have the older parser; no row runs one. **Disposition: not built; not blocking.** The product writes a path
  with an apostrophe or an equals sign in double quotes for every client, and both parsers read the quoted word as the
  one file; M11 (b) shows the logins on 8.4p1 and M7 on 10.2p1, and test 34 asks every written path with `ssh -G` on both
  parsers. The release evidence says what was not run (decision 22). The other half of this candidate as it was first
  written, a collision of the older parser's own kind, is **taken into M11 (b)** by the lead after the judge's review: the
  equals-sign pair.

Cornerstones: 2 of 2 — E1.S2, E2.S2
