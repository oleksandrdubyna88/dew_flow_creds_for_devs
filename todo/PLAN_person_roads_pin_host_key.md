# PLAN — three roads of the person enforce the entry's pinned host key (G1 of N16)

> Status: **stopped for re-review, 2026-11-18, at entry 1.2 (E2's rows cannot decide the candidates; M1's install is unsafe). The revision for epoch 2 is written (2026-11-18, by Fable) and waits for the Opus judge and the re-review; nothing of epoch 2 is approved, and nothing of it is built. Epic 1 merged (#379, `f3e9887d`), not released.** (Plan written 2026-11-17.) Approved 2026-11-17 by the plan round (`proceed`; its four
> findings, P1-P4, accepted and folded in: `## Plan changes`). Epoch 1 had two changes (1.1: the pass criteria of E2's rows M2 and M3; 1.2: the stop). The revision replaces the
> old split (two epics and a list of candidates) by three epics (`## Epics`): E1 is done; E2 builds the known repairs (§1.1, §3.10-§3.12); E3 is the
> measurements against a real `sshd`, as the release gate. Every other candidate has a written disposition. E1's stories document is
> [PLAN_person_roads_pin_host_key_E1.md](PLAN_person_roads_pin_host_key_E1.md) (2026-11-17), with the specs of its four stories:
> [PLAN_person_roads_pin_host_key_E1_S1_spec.md](PLAN_person_roads_pin_host_key_E1_S1_spec.md),
> [PLAN_person_roads_pin_host_key_E1_S2_spec.md](PLAN_person_roads_pin_host_key_E1_S2_spec.md) (the cornerstone),
> [PLAN_person_roads_pin_host_key_E1_S3_spec.md](PLAN_person_roads_pin_host_key_E1_S3_spec.md) (the three by Fable) and
> [PLAN_person_roads_pin_host_key_E1_S4_spec.md](PLAN_person_roads_pin_host_key_E1_S4_spec.md) (by Opus). The stories documents of E2 and E3 are not written.
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
> name `main` at `f3e9887d`, read on 2026-11-18.

## Plan changes

> Epoch 1 · approved 2026-11-17 · by reviewers · state: stopped

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
| the plan documents inside PR #379 (the plan as first written, the boundary with G2, the approval with P1-P4 and the split, the revision after G2 with change 1.1, the review repairs, the candidates C11-C17), squash f3e9887d | main | TBD | proposed: kept; the plan's text is rewritten forward by this revision |
| E1's stories document and the four specs E1.S1-E1.S4, in PR #379, squash f3e9887d | main | TBD | proposed: kept; superseded in part by the specs of E2 (the path rule of E1.S1, the condition of sentence C of E1.S3) |
| E1.S1 code and tests: `hostKeyWords` and `oneFileWord` in `hostKeyPin.ts`, both argv builders, `hostKeyWords.test.ts`, `pinnedArgv.ts`, in PR #379, squash f3e9887d | main | TBD | proposed: kept; corrected forward by E2 in a new pull request (the path rule and its refusal, the words about other sources of trust and about the log level) |
| the grouped import lines of `agentCommands.ts` (E1.S2, §3.6), in PR #379, squash f3e9887d | main | TBD | proposed: kept |
| E1.S2 code and tests, the cornerstone: `personPin.ts`, the two guards of `writtenKey.ts`, sentences A and B, `personPin.test.ts`, `personRoadsPin.test.ts`, `writtenKey.test.ts`, in PR #379, squash f3e9887d | main | TBD | proposed: kept; E2 hands two more refusals through the same value |
| E1.S3 code and tests: the four argv calls name the pin file, `hostKeyRefused`, `refusedHostKeySentence`, `personRoadsHostKey.test.ts`, in PR #379, squash f3e9887d | main | TBD | proposed: kept; corrected forward by E2 in a new pull request (sentence C only on evidence, sentence D) |
| E1.S4 the smoke on real input: `itestPinnedRoads.cjs` (section 10 of `ssh-agent-itest.cjs`) with its four repairs, the exports line of `itestSshd.cjs`, in PR #379, squash f3e9887d | main | TBD | proposed: kept; E3 extends the rig |
| E1's documents: the entry of `src_vs_code/CHANGELOG.md` under Unreleased, `research/module_extension.md`, `research/module_tests.md`, in PR #379, squash f3e9887d | main | TBD | proposed: kept; E2 rewrites the CHANGELOG entry (its opening guarantee, the two sources that E2 turns off, the quiet case) |
| the other side of the boundaries: G1 of N16's §5 (`research/PLAN_person_roads_forget_key.md`), the pointer in §8 of `todo/PLAN_remote_bridge_scoped.md`, the rows of `todo/README.md`, in PR #379, squash f3e9887d | main | TBD | proposed: kept; this revision updates the plan's own row |
| change 1.2 and the stop, bcaafce2 | pushed, unmerged | TBD | proposed: kept; entry 1.2 and the stop stay |

  (The re-review, 2026-11-18. The verdicts are the Opus judge's: `TBD` stands until the judge has filled them, and the
  check of the ledger reads `TBD` as a finding until then. The actions are proposals for the judge.)
  (The consult for the re-review is `97eb6bb5`: keep the measurements as evidence, but put the known violations of the
  plan's own contract into a small build epic before the final measurements and the release. The cadence consult
  `594a6709` is the list of rows that the old measurements lacked. The question consultants, `274c6e9d`, both
  answers: epoch 2 is a build epic of the known repairs and then the measurement epic as the release gate; the
  re-review replaces the old split and does not append an epic to it; every other candidate gets a written
  disposition before the release. Checked for this revision on 2026-11-18, OpenSSH 10.2p1: §1.1, §3.10-§3.12.)
  (The whole plan below is revised against that. What the revision changes is the baseline of epoch 2 and is no
  entry. The line of epoch 2 is written when the re-review has passed.)

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
    owner's word.
13. **Three epics get the feature review.** `review_feature` runs once, after E3 and before the release
    (`coai-feature-gate.md`: a plan of three or more epics).

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
section. §3.10-§3.12 are E2's to build. Nothing of them is in the code.

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
| pinned, the run's stderr holds the verification line and does NOT name the pin file of this call (a jump host of the person's config, a host with no key of the saved type, a remote text): epoch 2, §3.12 | sentence D | the socket check shows an error message: `The bridge to "<name>" could not be checked: ` + sentence D. It does not say "is not open": without the evidence the check does not know that |
| pinned, the pin file's path cannot be written for `ssh` as one file: epoch 2, §3.11 | `Cannot reach "<name>": ` + sentence E; no `ssh`, no pin file | `Cannot bridge to "<name>": ` + sentence E; no `ssh`, no bridge |
| pinned, the `ssh` program cannot be asked what it is: epoch 2, §3.10 | the same with sentence F; no connection is started | the same with sentence F; no connection is started, no bridge |

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

**Sentence C against P2.** Its advice cannot end in an unchecked connection: with a pin that parses, Connect keeps
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
  `ssh.exe` (C6); a host that offers no key of the pinned type; a refusal through the roads themselves, which E1's
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

**The fix: one rule decides, before anything is written or started, and it has three answers.**

| The pin file's path holds | The answer | Why |
|---|---|---|
| none of the characters below | the path as it is, byte for byte as today | no call that works today changes |
| white space, or an apostrophe | the path in double quotes, in both words | rows b, d, k; §3.9, row 7 |
| a double quote; two backslashes in a row; a backslash before an apostrophe; a percent sign; the two characters `${`; a control character | REFUSED, with the field named | rows e-j. No spelling was found that every client reads as the one file in BOTH words. The bridged file's rule refuses the same kinds before the spawn (`unsafeSshConfigValue`, `bridgedSshConfig.ts:88-90`; `unsafeBridgedFileValue`, `:98-100`: its Y5 is the UNC folder) |

- **The exact set is the spec's, from a measurement per client that the release names.** The spec may move a kind from
  "refused" to "written" only with the collision measurement of E3's M7 for it, on every such client; it may always move
  one from "written" to "refused". Both are inside this rule, so neither is a plan change.
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
2. **Sentence C needs evidence that `ssh` judged the pin of THIS call.** The evidence is `ssh`'s own line
   `Offending <type> key in <the pin file of this call>:<n>`, beside the verification line. Only the `ssh` that was given
   the words reads that file, and its name holds the uuid of this call:
   - a nested `ssh` of a jump host gets none of the outer's words (§4, G2's H1): it reads the person's own files, and its
     lines name those (read; L9 h says "printed by the nested `ssh`");
   - a remote command never learns the path: it is a word of the local argv.
   **Measured 2026-11-18** (the run of part 1): the line holds the whole path (115 characters there), ends with `:1`, and
   stands before the verification line. The line `Add correct host key in …` is cut at 100 characters, so it is not the
   evidence. **Not measured:** how the line prints a path that was written in double quotes; a hop on the roads; Windows'
   `ssh.exe`. The spec measures the first, and E3 measures the first two (M7, M5 f). Windows stays not measured, because E3
   makes no login there (C6). A miss shows sentence D: it never shows a false sentence C.
3. **The verification line without that evidence gets sentence D,** on a pinned call. It covers a hop's refused key, a
   host that offers no key of the saved type (`No <type> host key is known for …`, §3.5), and a text that only looks like
   `ssh`'s. It says what was seen and names no host as the cause.

| A pinned call's run ended, and its stderr holds | The person is shown |
|---|---|
| the verification line and the `Offending` line with this call's pin file | sentence C (its words do not change) |
| the verification line, and no such line | sentence D |
| neither | the sentences of before (a host that is down, a refused login, a time limit), as on an unpinned entry |

An unpinned call is shown the sentences of before, whatever its `ssh` printed, as E1 built it.

**Sentence D** (new). The contract: it says that the connection ended with that line, and that `ssh` did not name this
entry's saved key as the reason; it names a jump host of the person's own config as a possible place; it never tells the
person to replace a saved key; and its advice cannot end in an unchecked connection (by the argument of *Sentence C
against P2*, §3.5: the pin of this entry parses, so Connect keeps enforcing it and asks before it replaces it). The baseline:

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
answer is C7. The install's second run keeps today's sentence (§3.5); E3's M2 records it word for word.

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
    pair of apostrophes resolves another path, so the test can fail.
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
is C6.

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

**E3 writes:** its results into this plan as §10, before `## Epics`, per row: the numbers, the date, the versions of the
client and of the counterpart, the commit; in `research/module_tests.md` the real runs: where the counterpart lives, the
exact command, M1-M14 marked as measured, and what they do not prove.

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

Revised for epoch 2. The first group is E1's, as approved in epoch 1; its work is merged, and the judge of the re-review
sorts it (`## Plan changes`). The boxes are ticked by the commit that proves each.

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

**E3 (the release gate):**

- [ ] Every measurement M1-M14 passed as its last column says, in one run of the whole set on the final code, against a
      real `sshd`, through the registered commands. A missing measurement is not a pass; no row passed on either result;
      every control showed what it is there for. The results are in this plan (§10).
- [ ] No run of E3 wrote outside its owned folder: the places that the real installer writes are the same before and
      after (M1).
- [ ] Every sentence of the CHANGELOG entry that claims a behaviour names, in §10, the test or the row behind it.
- [ ] The documents of §6 that are E3's.

**The whole plan:**

- [ ] The coai code gate at `proceed` on each epic's branch; the lead's Opus review; CI green on the head sha;
      CodeRabbit read.
- [ ] The feature review ran once, after E3 and before the release, and every finding is resolved (decision 13).
- [ ] Every candidate that is not built has its disposition (`## Epics`), read again by the lead at the release.
- [ ] Released as an extension patch with the owner's word, only after E3 passed; the plan and its stories documents
      promoted, with the deviations.

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
6. **E2**, on its own branch from `main`, after epoch 2 is open. Opus writes its stories document when E2 starts
   (`todo/PLAN_person_roads_pin_host_key_E2.md`, with its own row in `todo/README.md`), marks the one cornerstone
   within the quota and updates the ledger line in the same commit. Fable writes the cornerstone's spec and every spec
   that is a security judgement; Sonnet codes each story, tests RED first; Opus reviews each. The cadence consult, if
   the gate orders one, comes before E2's code round. Then `review_code` over E2's diff → `resolve` until `proceed`,
   and one PR (a squash merge) after the head sha's checks exist and pass. A PR over the repository's cap needs the
   owner's word. **E2 is merged and not released.**
7. **E3**, on its own branch, after E2 has merged. Opus writes its stories document when E3 starts (`…_E3.md`). Its
   first story is the feasibility of the instruments that are not known to work (`## Epics`, E3): it runs before any row
   is built. Then the rows M1-M14. A row that fails is repaired inside E3 only when the repair makes the code do what
   this plan already says; the whole set is then run again. A repair that changes a planned step or a pass criterion
   is a plan change and is recorded as one; so is a row that cannot be run. An instrument that E3's setup marks with
   "here" is the stories document's to choose. The results are written into this plan
   (§10). Then `review_code` → `resolve` until `proceed`, and one PR.
8. **The feature review** (`review_feature`), once, from a checkout of `main` that holds E1, E2 and E3; its `baseRef`
   is the commit before E1 (`4392a272`). Findings that are accepted land as new pull requests.
9. **The release** (an extension patch) with the owner's word, and only when: E3 passed as a whole on the code that is
   released (a later commit to `src_vs_code/src` means the whole set again); the feature review is resolved; every
   candidate that is not built has its disposition. Then the promotion PR: this plan and its stories documents
   together.
10. **The candidates that are not built** follow their dispositions (`## Epics`). One that the lead takes becomes a
    plan of its own, the question consultants first.

## Epics

Three epics, and a list of the candidates that are not built, each with its disposition. This is the split of the re-review
for epoch 2 (§2, decision 7; the question consultants `274c6e9d`, both answers; the consult `97eb6bb5`). It REPLACES the split
of epoch 1 (two epics and a list of candidates, consult `cbe21f00`); it does not append an epic to it. The gate's split
order allows two epics beyond what is done: E1 is done, E2 and E3 are the two. Each epic's stories are one document,
`todo/PLAN_person_roads_pin_host_key_E<n>.md`, written by Opus when that epic starts; it links back here and gets its own
`todo/README.md` row. The stories of E2 and E3 are not written now. The code gate runs once per epic, on that epic's
branch. Three epics: the cornerstone quota is 2, and the feature review runs once at the end (§9, step 8).

### E1 — The three roads enforce the saved pin of one call

- **State.** Done: merged on 2026-11-18, PR #379, squash `f3e9887d`. Not released. The text below is E1 as it was approved
  and built; the Opus judge of the re-review sorts its work (`## Plan changes`). What E2 corrects forward is in §1.1.
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
- **Stories.** `todo/PLAN_person_roads_pin_host_key_E2.md`: not written yet. Opus writes it when E2 starts and marks the
  cornerstone story.

### E3 — The release gate: every claim is measured on the roads, against a real `sshd`

- **Goal.** Every claim of this plan about what `ssh` does with these words is measured, on the roads themselves, on the
  code that will be released. E3 is the release gate: the release waits for the whole set (§2, decision 12). The pass
  criteria below were written on 2026-11-18, before any of E2 or E3 is built.
- **Scope.** The harness of the real runs (E1's counterpart, section 10, extended); the measurements M1-M14; the repair of
  whatever one of them shows, inside the limit of §9, step 7; the results, written into this plan as §10; the check of
  the CHANGELOG entry against them; the real-run part of `research/module_tests.md` (§6). No new behaviour of the product.
- **Depends on.** E2 merged. G2 merged (M3 measures it).
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
    process group, so that the session of a master connection stays. The row proves that it stayed (M3).
  - *The control client.* The real `ssh` client that the harness starts itself, not through a road, with the words that
    the row names: "E1's words" are the three pairs of §3.9 alone, as `f3e9887d` writes them. A control shows that the hole
    is there without the repair. Its argv, exit code and the counterpart's log are recorded. **A control that does not
    show what its row says fails the row:** the row could not have failed.
  - *The evidence:* the counterpart's log (accepted logins, authentication attempts, forwards); a record of every
    start of the client with its argv and its pid (the logging shim of section 10, first on `PATH`, which then runs the
    real client); the messages that the stand-in was shown, word for word and in order; the stderr of each run; the files
    in `keys/<pid>/`.
  - *The client's config,* where a row needs one, is handed to the real client by the harness, and to the nested client
    of a jump host too. The person's own `~/.ssh` is never read by a row and never written.
  - *Where the rows run.* M1-M9, M12 and M14 on the rig of E1's smoke (an unpacked `sshd` here, `/usr/sbin/sshd` in CI;
    `CI=true` fails a missing one). M10 where the run owns the resolver, and M11 where a client older than 8.5 runs: a
    container that the run starts, or an unpacked package; the stories document says which. M13 on the Windows client of
    the owner's machine, the client alone, as K7 of the spec of E1.S1 did.

| # | The theory | The run | Passes when |
|---|---|---|---|
| M1 | A pinned entry whose host presents the pinned key works on all three roads, to the end of the install | the entry pinned to K1, the counterpart K1; the install to its end through the stand-in, the bridge with its check | the counterpart logs exactly 5 accepted logins, one per run; each of the 5 recorded argvs holds `StrictHostKeyChecking=yes`, one path as both known-hosts files, `VerifyHostKeyDNS=no`, `KnownHostsCommand=none` and `LogLevel=ERROR`; the install's two runs name one path, the check's two runs one path, the bridge its own: 3 distinct paths; the forwarded socket exists while the bridge is open and the check reads its mode; no sentence of §3.5 is shown; the stand-in's marker holds the run's nonce; the four conditions of the stand-in hold, each by its own evidence |
| M2 | A key that another known-hosts file trusts does not satisfy a pinned call (P1) | the entry pinned to K1; K2 is listed (a) in the file that the client reads as the person's default one, (b) in the file that it reads as the system-wide one (an owned file that the handed config names; the result says which). Two legs, each for (a) and for (b). *The mismatch:* the counterpart is K2 from the start. *The switch:* the counterpart is K1 until the install's question is open, then K2 takes the address and the question is answered | *The mismatch,* for (a) and for (b): each of the four runs that start ends with exit code 255 and the verification line; the record of the client's starts holds no install run; K2 logs 0 accepted logins, 0 authentication attempts and 0 forwards. *The switch,* for (a) and for (b): K1 logged the probe as accepted; the install run starts once and ends with exit code 255 and the verification line; K2 logs 0 accepted logins and 0 authentication attempts; the stand-in's marker was not written; what the install shows is recorded word for word. The control, in (b): the control client with the two pairs of before E1 (no `GlobalKnownHostsFile`) is accepted by K2 |
| M3 | With G2 on `main`, a live master connection does not carry a pinned call past the key check | a master connection to the counterpart (K1) is alive through the handed config (`ControlMaster`, `ControlPath`, `ControlPersist`). Two legs. *The mismatch:* the entry is pinned to K2. *The switch:* the entry is pinned to K1; when the install's question is open, K1's listener alone is ended, K2 takes the address, and the question is answered | *The mismatch:* each of the four runs that start ends with exit code 255 and the verification line; the record of the client's starts holds no install run; after the master was set up, K1's log shows no new session, command or forward. *The switch:* the master is alive directly before the question is answered and directly after the install run has ended (`ssh -O check` on the control path ends with 0 both times); the install run starts once and ends with exit code 255 and the verification line; between the switch and the end of that run K1's log shows no new session or command, and K2 logs 0 accepted logins. Then the control, AFTER the switch: the control client with the same pin words and without G2's two options ends with 0, and K1's log shows one new command: the master was there to ride, and the road did not ride it |
| M4 | An absent pin connects as before; an unusable pin and a failed pin write start nothing | (a) no `hostKey`, an empty one, one of white space; (b) a text that does not parse; (c) a parsed key on a host that cannot form a line; (d) a pin write that fails | (a): the 5 runs carry `accept-new`, no known-hosts file and none of the pairs of E2; 5 accepted logins; 0 pin files written; and, in a world that made no pinned call before, no start of the client with `-V`. (b), (c), (d), on each road: 0 starts of the client, 0 connections in the counterpart's log, no *bridged* row, 0 files left in `keys/<pid>/` (except one case, candidate C14: in (d) a pin file that the failed write had begun can stay until the next activation's purge, and the run names such a file when it finds one); sentence A in the login's form for (b) and (c), sentence B for (d). Recorded for C9: whether the bridge's command minted a token before it refused |
| M5 | A refused host key is told to the person as what the call saw, and nothing else is (P3, V4, V5) | pinned to K1 in all seven. (a) the counterpart K2. (b) the counterpart stopped. (c) the counterpart K1, its login refused. (d) an address that does not answer inside the run's time limit. (e) as (a), and the handed config says `LogLevel QUIET`. (f) the counterpart K1, and the handed config sends the connection through a jump host of the run (a second `sshd`) whose key the jump host's own known-hosts file refuses. (g) the counterpart K1 with the login accepted, and the remote side writes `Host key verification failed.` as the last line of its stderr and ends with 255 (here: the `sshd`'s forced command) | (a): the install shows sentence C once and not "did not answer the probe"; after *Open Remote Bridge…* no *bridged* row is left, and exactly one error MESSAGE holds `The bridge to "<name>" is not open: ` and sentence C (a log line alone does not pass); the stderr of the probe and of the mode check holds the `Offending` line with the pin file of that call; the order of the messages is recorded. (b), (c), (d): sentences C and D are shown 0 times on both roads; what is shown is recorded word for word and is the same text that the same case shows on an unpinned entry in the same run. (e): as (a), every item; the control: the control client with E1's words under the same config ends with 255 and an empty stderr. (f): each run that starts ends with 255; the destination logs 0 connections; sentence C is shown 0 times; the install shows sentence D once; exactly one error message holds `The bridge to "<name>" could not be checked: ` and sentence D; no *bridged* row is left; no stderr holds a line with the pin file of its call. (g): K1 logs the logins as accepted; sentence C is shown 0 times; the install shows sentence D once; exactly one error message holds `The bridge to "<name>" could not be checked: ` and sentence D, and the *bridged* row stays (the tunnel is up) |
| M6 | Every call owns its files, calls do not disturb each other, nothing is left | two installs of one pinned entry that overlap; a bridge with its check; a bridge replaced by a second; each with a stored key, with a key that the person named by its path, and with a password; a file `known_hosts-<id>` is in the folder before | the pin paths of calls that overlap are distinct, as many as the calls; at each call's end its own file is gone and every other call's file is there with its bytes; `known_hosts-<id>` and the person's own key file are the same bytes after; after the last end: 0 files of these calls in `keys/<pid>/`, 0 client processes alive (by the recorded pids, not by name), no forwarded socket left. The password entry: with K1 the counterpart's log shows that the password attempt arrived (accepted, or `Failed password` where the counterpart cannot check one; the result says which); with K2 it shows 0 authentication attempts |
| M7 | The pin file is read as the one intended file where its path needs double quotes (V2, R2) | the storage folder's path holds (a) a space, (b) one apostrophe, (c) a pair of apostrophes, (d) a space and an apostrophe; for each the runs of M1 and of M2 (b), both legs. *The collision,* for (c): a file at the path that the bare word resolves to (the apostrophes taken out) holds K2's line, the pin file holds K1's; once the counterpart is K1, once K2 | (a)-(d): as M1 and as M2 (b), both legs; in the mismatch leg both roads show sentence C (the `Offending` line names the pin file of a quoted word). *The collision:* with the counterpart K1, 5 accepted logins; with K2, each of the four runs that start ends with 255 and the verification line, and K2 logs 0 accepted logins and 0 authentication attempts. The control: the control client with E1's words (the path bare) is ACCEPTED by K2: it read the other file |
| M8 | `KnownHostsCommand`, alone, is not asked by a pinned call (V1, R1) | the entry pinned to K1, the counterpart K2; the handed config names a `KnownHostsCommand` that prints K2's line and records each of its own starts; no DNS source is on | The control first: the control client with E1's words is accepted by K2, and the command's record holds at least one start. Then the roads: each of the four runs that start ends with 255 and the verification line; each recorded argv holds `KnownHostsCommand=none`; the command's record holds 0 starts for the roads' runs; K2 logs 0 accepted logins and 0 authentication attempts |
| M9 | The advice of sentence A repairs the pin (the key form), and no password entry is given it (P2) | a key entry with a pin that does not parse: all three roads; then Connect's options (`connectionOptions`) with the real scan of the counterpart (K1) and *Trust and connect* answered; then the runs of M1. Beside it, for C1: a password entry in the same state, the scan given no answer | the three roads showed the key form and started nothing; the stored pin is K1's line after the answer, and M1 passes on that entry; the password entry was shown the password form by all three roads. Recorded for C1: whether Connect's options for it name no pin file |
| M10 | A secure SSHFP record, alone, does not admit a key to a pinned call (V1, R1) | where the run owns the resolver: the counterpart has a name, and the resolver answers a SECURE SSHFP record of K2 for it and records each question. The entry is pinned to K1, the counterpart is K2, the handed config says `VerifyHostKeyDNS yes`; no `KnownHostsCommand` is named | The control first: the control client with E1's words is accepted by K2, and the resolver's record holds the SSHFP question. Then the roads: each of the four runs that start ends with 255 and the verification line; each recorded argv holds `VerifyHostKeyDNS=no`; the resolver's record holds 0 SSHFP questions for the roads' runs; K2 logs 0 accepted logins and 0 authentication attempts. If the control is not accepted, the row is NOT passed: it showed no bypass |
| M11 | The answer for an older client holds on a real one (R1, R2) | a real client older than 8.5 as the program of the roads. (a) The client alone: a config line `KnownHostsCommand …` and no `IgnoreUnknown`; then the same with the config's own `IgnoreUnknown` for it, pinned to K1 against the counterpart K2 with the command printing K2's line. (b) The roads: the runs of M1, of M2 (b) the mismatch, and of M7 (a)-(d). (c) A program that answers `-V` with no version at the start of its stderr | (a): without `IgnoreUnknown` the client ends with `Bad configuration option` and 255 before it connects; with it the login is refused with the verification line and K2 logs 0 accepted logins. (b): as M1, with NO `KnownHostsCommand` pair in the 5 argvs and with `VerifyHostKeyDNS=no` and `LogLevel=ERROR` in each; as M2 (b), the mismatch; as M7 (a)-(d) with its collision. (c): on each road 0 starts of a connection (the record holds the `-V` starts alone), 0 connections in the counterpart's log, 0 pin files written, sentence F, no *bridged* row. The result names the client's version |
| M12 | A path that cannot be written for `ssh` as one file starts nothing (V2, V3, R3) | the storage folder's path holds (a) a double quote, (b) two backslashes in a row (the shape of a UNC folder; on Linux a folder of that name stands for it), (c) `%h`, (d) `${HOME}`. The entry is pinned to K1 and the counterpart is K1, so only the refusal can stop the call. It signs in with a key that the person named by its path, outside that folder, so the pin file is the only file that the call would write there | for each of (a)-(d), on each road: 0 starts of the client, 0 connections in the counterpart's log, no file written into the storage folder, no *bridged* row, sentence E with the kind of that path. No recorded argv of the whole run of E3 names `/dev/null` as a known-hosts file |
| M13 | The Windows client reads the words as the Linux client does (R2, R3), the client alone | `ssh.exe -G` of the Windows that the owner's machine has, started with the argv as separate arguments, with the words that the final code writes for a pin file under a storage folder (a) with a space, (b) with an apostrophe, (c) with both; and the rule asked for a UNC folder (`\\server\share\…`) | (a)-(c): the client resolves strict checking, `verifyhostkeydns false`, no `knownhostscommand`, `loglevel ERROR`, and both known-hosts lists as the one intended path; one file is told from two by the control of K7. The UNC folder: the rule refuses it, and no `ssh.exe` is started for it; the control: `ssh.exe -G` with the bare and the quoted UNC word resolves another path (K8 c). The result names the client's version. NOT in this row: a login on Windows (C6) |
| M14 | The agent's pinned exec gets the same words and the same refusals (§3.9: the one effect outside the three roads) | the agent's `ssh:exec` through its own call, off a bridge, as section 9 of `ssh-agent-itest.cjs` drives an exec; the entry pinned to K1. (a) the counterpart K1. (b) the counterpart K2 and the handed config of M2 (b). (c) the counterpart K2 and the handed config of M8. (d) the storage folder of M12 (a) | (a): one accepted login; the recorded argv holds the six pairs of M1. (b), (c): exit code 255 and the verification line; K2 logs 0 accepted logins and 0 authentication attempts. (d): 0 starts of the client, and the agent's answer names the field and holds no path. NOT in this row: *Run with Secrets* over SSH, which calls the same builder (tests 22, 23) and needs a terminal's launch to run |

- **The feasibility comes first.** E3's first story probes the instruments that are not known to work, before any row is
  built, as E1.S4's probe did: the `PATH` of the counterpart's login for the install's stand-ins; the stop of the listener
  alone with a master that stays; a resolver that the run owns and whose answer the client takes as secure (M10); a client
  older than 8.5 that runs here (M11); a handed config that the nested client of a jump host reads too (M5 f); the Windows
  client from this machine (M13). A probe that fails is not a skipped row. It is a recorded plan change, and when it makes
  the release gate smaller it goes to the owner, the question consultants first.
- **Done when.**
  - Every row passes as its last column says, in ONE run of the whole set on the final code: the rows of the rig in one
    run of the script, and M10, M11 and M13 on the same commit. A repair means the whole set again. A later commit to
    `src_vs_code/src` before the release means the whole set again.
  - A row that was not measured is not passed, and E3 is then not done: there is no "if no real host can be had". No row
    passes on either result. Every control showed what its row says.
  - The results are in §10, per row: the numbers, the date, the client's and the counterpart's version, the commit, and
    for M10, M11 and M13 where they ran.
  - §10 holds one table for the CHANGELOG entry: each sentence of it that claims a behaviour, and the test of §5 or the
    row behind it. A claim with nothing behind it is taken out of the entry or said as "not measured".
  - The code gate is at `proceed` and E3's PR is merged.
- **Cornerstone areas.** None: E3 measures and builds no behaviour.
- **Stories.** `todo/PLAN_person_roads_pin_host_key_E3.md`: not written yet.
- **Info for M5 (a), the bridge.** The person also sees *Bridge open to …* before the check's error (§3.5 says so):
  the click shows it at once, and the check's message follows when its `ssh` is refused. E3's reading of the screen counts both lines.

### The remaining candidates

None is built in E1, E2 or E3. Each has its disposition here, as decision 12 asks before the release; the lead reads the list
again at the release. "Taken" means that E2 builds it and the candidate is closed. A candidate that becomes work gets a plan
of its own (§9, step 10). C1-C10 were written with the plan, C11-C17 during E1.

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
  ends with the line (`97eb6bb5`). §3.12 replaces it with the evidence of the call's own pin file (R4).
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

Cornerstones: 1 of 2 — E1.S2
