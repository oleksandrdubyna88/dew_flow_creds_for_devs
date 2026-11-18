# PLAN — three roads of the person enforce the entry's pinned host key (G1 of N16)

> Status: **Epic 1 built, 2026-11-18, in PR #379 (E1.S1-E1.S4), unmerged; E2 and the candidates are open.** (Plan written 2026-11-17.) Approved 2026-11-17 by the plan round (`proceed`; its four
> findings, P1-P4, accepted and folded in: `## Plan changes`). Epoch 1, one change (1.1: the pass criteria of E2's rows M2 and M3). Split into two epics and a list of
> candidates (`## Epics`); E1's stories document [PLAN_person_roads_pin_host_key_E1.md](PLAN_person_roads_pin_host_key_E1.md) is written (2026-11-17), and the spec of its first story,
> [PLAN_person_roads_pin_host_key_E1_S1_spec.md](PLAN_person_roads_pin_host_key_E1_S1_spec.md), and of its cornerstone,
> [PLAN_person_roads_pin_host_key_E1_S2_spec.md](PLAN_person_roads_pin_host_key_E1_S2_spec.md) (both 2026-11-17, by Fable), and the specs of E1.S3,
> [PLAN_person_roads_pin_host_key_E1_S3_spec.md](PLAN_person_roads_pin_host_key_E1_S3_spec.md) (by Fable), and of E1.S4,
> [PLAN_person_roads_pin_host_key_E1_S4_spec.md](PLAN_person_roads_pin_host_key_E1_S4_spec.md) (by Opus; both 2026-11-17). Scope: the extension only (`src_vs_code/src`): the bridge
> socket check, *Install creds on host* and *Open Remote Bridge…* in `commands/agentCommands.ts`, the helpers of
> `writtenKey.ts`, one small new module for the pin of one call, the words that both `ssh` argv builders write for a
> pinned call (`sshBridge.ts`, `sshExecCommand.ts`: the agent's pinned exec and a pinned *Run with Secrets* get them too,
> §3.9), their tests, the real runs against a real `sshd`, the docs. Found as G1 of
> [PLAN_person_roads_forget_key.md](../research/PLAN_person_roads_forget_key.md) (N16, §5) by the lead's Opus review and a
> Fable security pass on 2026-11-16, by reading.
> **Depends on:** the G2 plan, [PLAN_bridge_no_connection_sharing.md](../research/PLAN_bridge_no_connection_sharing.md): merged into `main` on
> 2026-11-17 (#376, `07ed8303`). This plan is built on it (§4). Its line references, §3.6's count, §4 and test 12 of §5 were
> revised against `main` at `ca99cd91` on 2026-11-17 (§9, step 1).

## Plan changes

> Epoch 1 · approved 2026-11-17 · by reviewers · state: open

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
| pinned, the host presents ANOTHER key: `ssh` refuses | sentence C, in place of today's "the host did not answer the probe" | the bridge's `ssh` ends (255), the row goes back to *Open Remote Bridge…*; the socket check shows an error message: `The bridge to "<name>" is not open: ` + sentence C (P3) |

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
- **When:** the call is PINNED and the run's stderr holds OpenSSH's line `Host key verification failed.`. An unpinned
  entry keeps today's sentences, whatever `ssh` printed: it has no saved key to speak of.
- **Measured for this plan, by hand, 2026-11-17, OpenSSH 10.2p1 (Ubuntu):** `ssh -F none -o BatchMode=yes -o
  StrictHostKeyChecking=yes -o UserKnownHostsFile=<a file that holds another ed25519 key for that host> -o
  GlobalKnownHostsFile=/dev/null` against a public sshd (`github.com:22` and `ssh.github.com:443`): exit code 255, and
  no line about a login; stderr ends with `Host key
  for <host> has changed and you have requested strict checking.` and `Host key verification failed.`; stderr names the
  pin file's path twice. A pin file that `ssh` does not find ends with the same last line, after `No ED25519 host
  key is known for <host> and you have requested strict checking.` (§3.9, row 6). **Not measured:** Windows'
  `ssh.exe` (C6); a host that offers no key of the pinned type; a refusal through the roads themselves, which E1's
  smoke and E2 measure (M5).
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
- A miss of the match shows today's sentence. The connection is still refused, but for *Open Remote Bridge…* today's message is *Bridge open to …* (shown at once, before its socket check runs), so under `LogLevel QUIET` that success message is the only one and the tree row going back is the only sign (as it already was before G1 for a host that is down or a refused login). C13 is the remedy.

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

### 3.7 What grows, and who retires it

| What | How many, after this plan | Who retires it | When it is interrupted |
|---|---|---|---|
| the pin file `known_hosts-<entryId>-<uuid>` of a socket check | one while that check runs on a pinned entry (about 32 s at most), none after | the `finally` of `withWrittenKey` | a killed window leaves `keys/<pid>/`; `purgeMaterializedKeys` (`keyInstaller.ts:280`) of the next window that activates, or of this window's dispose (`extension.ts:216-217`), removes the folder |
| the pin file of an install | one while that install runs or its question is open, none after | the same `finally` | as above |
| the pin file of a bridge | one per LIVE bridge of a pinned entry (one bridge per entry; `start` replaces), plus one per `ssh` that a failed kill left running (N16, change 1.1) | the one continuation on that bridge's `exited` | as above; `dispose` kills every bridge. The bound N16 narrowed holds for the pin file too: a started `ssh` whose kill fails and that never exits keeps its files until the purge |
| a pin file left half written (the write threw part way) | at most one per failed write; its name is random and no `ssh` is given it | the purge only: the writer does not know the path | as above |
| the counterpart of the real runs (E1's smoke, E2): one `sshd` process, its owned temporary folder (config, host keys, log, the login's home), the sockets its forwards leave on this machine | one process and one folder per run, none after; a few kB of text, plus what the install run writes into the owned home | the run that started it: it stops the process and removes the folder and the sockets when it ends, pass or fail | a killed run: the repository's janitor for test leftovers (`research/module_tests.md`, *Test leftovers*); the stories document names the folder so that the janitor's token covers it |

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

### 3.8 What does not change

`materializeKnownHosts` and every other function of `hostKeyTrust.ts`; the existing functions of `hostKeyPin.ts` (the
match of sentence C and the words of §3.9 are new pure functions there); both argv builders, except the words of a
pinned call (§3.9); the agent's exec and *Run with Secrets*, except those words on a pinned call; every unpinned call
on every road; Connect, its scan and its terminal line; `sshExecAuth.ts`; `sshBridgeManager.ts`; `bridgeSpawner.ts`;
every purge; every sentence that exists today. A person sees three new sentences, the first in two forms (§3.5).

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

**Not closed here: the sources that only an `ssh` config turns on** (candidate C2). `KnownHostsCommand` (row 3) can be
named on the command line only from OpenSSH 8.5; an older client stops at the unknown option, so every pinned call
would fail there, and `IgnoreUnknown` cannot guard it (above). `VerifyHostKeyDNS` is off by default; read in the
manual, not measured (it needs a signed zone). The system-wide files are read by default; these two are read only
when the person's or the machine's own config says so. `-F none` is no answer: these roads honour the person's
config (a jump host, an alias).

**What a pinned call no longer reads:** the `@cert-authority` and `@revoked` lines of a system-wide file (the manual;
not measured). A pin is one plain key, so that is what "pinned" means. **Windows** is read, not run (C6).

## 4. The boundary with the G2 plan

The G2 plan ([PLAN_bridge_no_connection_sharing.md](../research/PLAN_bridge_no_connection_sharing.md); merged 2026-11-17, #376) carries
this table from its side in its §6 (`planning-docs.md`, *a boundary between two plans is named on both sides*). On N16's
side, G1 of its §5 names this plan. **Revised on 2026-11-17 against what G2 shipped** (`main` at `ca99cd91`): the first two
rows say what is in the code now, and the rows below the builders' row were added from G2's follow-ups H1-H5 (its §9).

| Item | Which plan builds it | The other plan's part |
|---|---|---|
| connection sharing turned off on the bridge's `ssh -N -R`: `FIXED_OPTIONS` ends with the constant `NO_CONNECTION_SHARING`, the words `-o ControlPath=none -o ControlMaster=no` (`sshBridge.ts:174-180`) | G2, shipped | G1 is built on it |
| connection sharing turned off on the four bounded runs (the socket check's two, the install's two): every argv of `buildSshExecArgv` carries the same constant (`sshExecCommand.ts:47`, pushed at `:185`; a bridged call has the two among its six, `:57-63`), so these four runs, the agent's exec and *Run with Secrets* have it, and no call site passes an option for it | **G2**, shipped (its decision 1, scope (b), consult `925f4f14`) | with the two options a pinned call makes a connection of its own, so its pin words are read. G2 measured both sides (the docblock of the constant, `sshExecCommand.ts:20-46`; section 9 of `scripts/ssh-agent-itest.cjs`): with a master up, a call without them used neither its own key nor its own pinned host key; with them a wrong pin ends with `Host key verification failed.`. E2's M3 measures it on the roads |
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

**What the suite cannot prove, and what proves it (P4).** That `ssh` refuses a host whose key is not the pinned one is
`ssh`'s decision, made from words that the tests above can only see in the argv (`security.md`, *a measure you have
not observed working is a comment*). So the real runs are part of this plan, not a hand check that may be left out:
E1 ends with a smoke on real input, and E2 is the whole set, M1-M9 (`## Epics`), with the real `ssh` client against a
real `sshd` that the run starts for itself, through the commands as the extension registers them. A measurement that
is missing counts as not passed. The suite keeps a real-`sshd` test from passing by being skipped, as it does for
the guard tests (`CREDS_GUARD_TESTS_REQUIRED`, `.agents/PROJECT.md`, *Commands*): the stories document names the
variable that CI sets. **Checked on 2026-11-17:** this machine has no `sshd` (`which sshd`); the CI image was not
checked. Where the binary comes from is settled before E1's stories are written (§9, step 3; settled in E1's stories
document, item 1). A public host stays
out of the suite (not hermetic); §3.5 and §3.9 used one by hand. Windows is read, not run (the suite runs on Ubuntu;
N16, G3; C6).

## 6. Docs

The documents are inside the epics, with the change they describe: the first two items with E1, the third with E1
(the suite) and E2 (the real runs).

- `src_vs_code/CHANGELOG.md`, `[Unreleased]`: a security entry. The bridge, its socket check and *Install creds on
  host* now check an entry's pinned host key: with a pin, `ssh` connects only to a host that presents it; a host that
  presents another key is refused and a message says so; a saved key that cannot be read is refused, and the message
  says what to do; an entry with no pin connects as before. And on every pinned call that the extension starts
  without a terminal (these three, the agent's exec, *Run with Secrets*), a key that only a system-wide known-hosts
  file lists is no longer accepted, and a storage folder whose path holds a space no longer breaks the call. No
  version heading: the release writes it.
- `research/module_extension.md`: the paragraph **B10 — the host key** (`:5196-5213`) names the three roads (an
  unpinned entry as the agent's exec, a pin enforced from a per-call file), the words of a pinned call and the one
  function that writes them, and that Connect's line is not among them yet; the paragraph **The bridge's `ssh` and its
  key file (N16)** (`:2581-2591`) gets the pin file and the extended helpers; the table *Secrets at rest and in flight*
  (`:6185`) gets the per-call pin file beside the row *SSH private key on disk*; the paragraph *Rule C* (`:6613`) names
  the per-call pin name, which keeps the entry's id as `known_hosts-<id>` does.
- `research/module_tests.md`: a new section after `## A bridge, its socket check and the install delete their key file
  (N16)` (`:2479`; G2's section follows it at `:2501`, and the new one stands behind G2's): the test files with their counts (read from the runner), what each proves, the real pieces, and
  what none of them proves (§5). E2 adds the real runs: where the counterpart lives, the exact command, M1-M9 marked
  as measured, and what they do not prove.
- **Not in the epics: the help article** `remote-bridge`, *What can go wrong* (`helpEn.ts:205`). A change to it changes
  all five languages together (`.agents/PROJECT.md`, rule 7), so it cannot be cut down to English: candidate C5.
- After E2: its results are written into this plan as §10, before `## Epics`.
- At promotion: G1 of N16's §5 gets its "Fixed in" text; the `todo/README.md` rows move to `research/README.md`.

## 7. Out of scope

- **G2**, the bridge and connection sharing: its own plan, first (§4). **G3-G8** of N16's §5.
- Asking the fingerprint on these roads for an unpinned entry (decision 1).
- Deleting a bridge's pin file before its `ssh` ends (§3.4).
- A check of the pin before the token and before the PIN question (§3.4).
- Moving the socket check or the install out of `agentCommands.ts` (§3.6).
- Connect's own road: its scan, its questions and the words of its terminal line (§3.5, §3.9; C1, C4).
- The sources of trust that only an `ssh` config turns on (§3.9; C2).

**Found while this plan was written, not built here** (each read in the code on 2026-11-17 unless it says measured).
F3 was taken into the plan at the plan round. The others are candidates in `## Epics`, each with the result of E2
that would justify it:

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
  it after §3.9: Connect's line (C4), the config's own sources (C2), Windows (C6).
- **F4.** The socket check's log line for an empty answer says the socket "is there" (`agentCommands.ts:232-234`), also
  when `ssh` itself failed and nothing was observed (`interpretSocketProbe` reads an empty answer as `unreadable`,
  `sshBridge.ts:317-323`).
- **F5.** `commands/agentCommands.ts` holds doc comments with no function under them (`:76-93`, `:133-152`; the
  registrations were moved out of `extension.ts` word for word). A question for the lead, not a change of this plan:
  the comments whose function lives in another file could go, which would also widen §3.6's budget.

## 8. Definition of Done

- [ ] On a pinned entry every one of the five `ssh` runs of the three roads carries `StrictHostKeyChecking=yes` and
      ONE per-call file as its `UserKnownHostsFile` and its `GlobalKnownHostsFile`; on an unpinned entry every run is
      as today.
- [ ] The pin file is written inside the guarded span, complete before the spawn, one per call, and deleted on every
      exit of §3.3 and §3.4, whether or not a key file was written; only a file that the call wrote is deleted.
- [ ] A pin that is present and unusable, and a pin write that fails, are refused before any `ssh`, with sentence A
      in the form of the entry's login and sentence B; no form of sentence A sends a password entry to Connect SSH.
- [ ] A refused host key on a pinned entry shows sentence C: the install's own, and the bridge's as a message of the
      socket check, not only a log line.
- [ ] The words of a pinned call come from one function that both argv builders call; `materializeKnownHosts` is
      unchanged; the agent's exec and *Run with Secrets* change only by those words on a pinned call (test 12).
- [ ] `agentCommands.ts` at most 800 lines, lint green.
- [ ] The tests of §5 RED first, then GREEN; the mutation checks recorded.
- [ ] E1's smoke on real input passed, and every measurement of E2 (M1-M9) passed, against a real `sshd`, through the
      registered commands. A missing measurement is not a pass. The results are in this plan (§10).
- [ ] The docs of §6.
- [ ] The coai code gate at `proceed` on each epic's branch; the lead's Opus review; CI green on the head sha;
      CodeRabbit read.
- [ ] Released as an extension patch with the owner's word, after E2; the plan and its stories documents promoted.

## 9. Build order and merge conditions

1. **Done, 2026-11-17:** G2 merged first (#376, `07ed8303`), and this plan was revised against `main` at `ca99cd91`: the
   line references into `sshBridge.ts`, `sshExecCommand.ts` and `research/module_extension.md`; §3.6's count (794 lines,
   as before: G2 did not change the file); §4's rows about G2; test 12 of §5. A repaired reference is not a change.
2. **Done, 2026-11-17:** the coai plan gate (`review_plan` → `resolve`) answered `proceed`; P1-P4 were accepted and
   folded in; the split was ordered, and the question consultants were asked about it (`cbe21f00`). That approval
   opened the ledger.
3. **Before E1's stories are written:** where the real `sshd` of the smoke and of E2 comes from (a package on the
   build machine, a container, the CI image) is settled, the question consultants first. A package on the person's
   machine is the person's decision.
4. **E1**, on its own branch. Opus writes its stories document when E1 starts
   (`todo/PLAN_person_roads_pin_host_key_E1.md`, with its own row in `todo/README.md`), marks the one cornerstone
   within the quota and updates the ledger line in the same commit. Fable writes the cornerstone's spec and every
   spec that is a security judgement; Sonnet codes each story, tests RED first; Opus reviews each. The cadence
   consult, if the gate orders one, comes before E1's code round. Then `review_code` over E1's diff → `resolve` until
   `proceed`, and one PR (a squash merge) after the head sha's checks exist and pass. A PR over the repository's cap
   needs the owner's word. **E1 is merged and not released.**
5. **E2**, on its own branch, after E1 has merged. Opus writes its stories document when E2 starts (`…_E2.md`). The
   measurements M1-M9 are run. One that fails is repaired inside E2 and the whole set is run again; a repair that
   changes a planned step is a plan change and is recorded as one. The results are written into this plan (§10).
   Then `review_code` → `resolve` until `proceed`, and one PR.
6. **The release** (an extension patch) with the owner's word, only after E2 has passed. Then the promotion PR: this
   plan and both stories documents together.
7. **The candidates** are not built inside the epics. After E2, each one whose result came in becomes a plan of its
   own or a recorded change of this one: the lead's decision, the question consultants first.

## Epics

Two epics and a list of candidates, as the plan round ordered for a plan of this size (§2, decision 6; consult
`cbe21f00`, both answers agree). Each epic's stories are one document, `todo/PLAN_person_roads_pin_host_key_E<n>.md`,
written by Opus when that epic starts; it links back here and gets its own `todo/README.md` row. The stories are not
written now. The code gate runs once per epic, on that epic's branch. Two epics: the cornerstone quota is 1.

### E1 — The three roads enforce the saved pin of one call

- **Goal.** On the bridge socket check, *Install creds on host* and *Open Remote Bridge…*, an entry with a pin starts
  `ssh` only against that pin, from one file of this call that goes with this call; a pin that cannot be used starts
  nothing; a person who meets a host with another key is told so. It is the smallest core that runs end to end on
  real input. The guarantee is that of the pin file: it does NOT cover the sources that only an `ssh` config turns on,
  `KnownHostsCommand` (C2) and `VerifyHostKeyDNS` (C17); with `VerifyHostKeyDNS yes` in the person's config `ssh` also
  accepts a key that matches a secure SSHFP record, which may not be the pin (OpenSSH 10.2 asks DNS before it reads the files).
- **Scope.** All of §3, and no candidate:
  - the pin of one call with its three states, and the per-call pin file that N16's extended helpers own (§3.1, §3.2);
  - the two bounded roads and the bridge (§3.3, §3.4);
  - the pin file as both known-hosts files and its path as one file, from the one function that both argv builders
    call (§3.9);
  - an unusable pin and a pin write that fails refuse before any `ssh` starts; sentence A in its two forms, B and C;
    the socket check shows the bridge's refused host key as a message (§3.5);
  - the file-size budget (§3.6);
  - the tests of §5 (1-16), and the documents of §6 that belong to E1;
  - the counterpart of the smoke: a real `sshd` that the run starts for itself (§3.7, the last row), as much of it
    as the smoke needs. E2 extends it.
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

### E2 — The real runs: the plan's theory is tested against a real `sshd`

- **Goal.** Every claim of this plan about what `ssh` does with these words is measured, on the roads themselves.
  The pass criteria below were written on 2026-11-17, before any of it is built.
- **Scope.** The harness of the real runs (E1's counterpart, extended); the measurements M1-M9; the repair of whatever
  one of them shows; the results, written into this plan as §10; the real-run part of `research/module_tests.md`
  (§6). No new behaviour of the product, unless a measurement fails.
- **Depends on.** E1 merged. G2 merged (M3 measures it).
- **The setup of every measurement.**
  - *The counterpart:* an `sshd` that the run starts for itself on the loopback, on a free port, from its own
    config, with host key K1, in an owned temporary folder; its logins get a home inside that folder, so the
    install run writes nothing outside it (whether the installer comes from its published address or from a local
    stand-in is the stories document's decision; the real client makes the run either way). K2 is another host key:
    a second counterpart at the same address stands for another machine there.
  - *The roads:* the registered commands `credSshManager.installRemoteCli` and `credSshManager.openRemoteBridge` (the
    socket check runs through the bridge's command), with the REAL `ssh` client, `runSshExec`, the bridge spawner,
    `materializeKnownHosts` and `forgetMaterializedKey`. Only the `vscode` module is the suite's stand-in, as in
    every test of this repository.
  - *The five runs:* the sweep, the mode check, the probe, the install run, the bridge. **On a refused host key four
    of them start** (change 1.1): the install returns after a probe that failed (`installRemoteCli`,
    `agentCommands.ts:282-292`), so its second run never starts. Where a row needs the install run on a host with
    another key, it uses *the switch*: the counterpart presents the pinned key until the install's question is open
    (the probe has passed), then the other counterpart takes the address, and only then the question is answered. So
    the second connection goes through the production control flow.
  - *The evidence:* the counterpart's log (accepted logins, authentication attempts, forwards); a record of every
    start of the client with its argv and its pid (here: a logging shim first on `PATH` that then runs the real
    client; the stories document may choose another instrument that counts starts as surely); the messages that the
    stand-in was shown; the files in `keys/<pid>/`.
  - *The client's config,* where a row needs one (M2, M3, M8), is handed to the real client by the harness. The
    person's own `~/.ssh` is never written.

| # | The theory | The run | Passes when |
|---|---|---|---|
| M1 | A pinned entry whose host presents the pinned key works on all three roads | the entry pinned to K1, the counterpart K1; the install to its end, the bridge with its check | the counterpart logs exactly 5 accepted logins, one per run; each of the 5 recorded argvs holds `StrictHostKeyChecking=yes` and one path as both known-hosts files; the install's two runs name one path, the check's two runs one path, the bridge its own: 3 distinct paths; the forwarded socket exists while the bridge is open and the check reads its mode; no sentence of §3.5 is shown |
| M2 | A key that another known-hosts file trusts does not satisfy a pinned call (P1) | the entry pinned to K1; K2 is listed (a) in the file that the client reads as the person's default one, (b) in the file that it reads as the system-wide one (the real file where the run may write it, else an owned file that the handed config names; the result says which). Two legs, each for (a) and for (b). *The mismatch:* the counterpart is K2 from the start. *The switch:* the counterpart is K1 until the install's question is open, then K2 takes the address and the question is answered | *The mismatch,* for (a) and for (b): each of the four runs that start (the sweep, the mode check, the probe, the bridge) ends with exit code 255 and `Host key verification failed.`; the record of the client's starts holds no install run; the counterpart logs 0 accepted logins, 0 authentication attempts and 0 forwards. *The switch,* for (a) and for (b): K1 logged the probe as accepted; the install run starts once and ends with exit code 255 and the verification line; K2 logs 0 accepted logins and 0 authentication attempts; nothing was written into the login's home; what the install shows is recorded word for word. Control, once, by hand, so that the row can fail: in setup (b) the real client with today's two words and no `GlobalKnownHostsFile` is accepted |
| M3 | With G2 on `main`, a live master connection does not carry a pinned call past the key check | a master connection to the counterpart (K1) is alive through the handed config (`ControlMaster`, `ControlPath`, `ControlPersist`). Two legs. *The mismatch:* the entry is pinned to K2. *The switch:* the entry is pinned to K1; when the install's question is open, K1's listener is ended, the master's session stays, K2 takes the address, and the question is answered | *The mismatch:* each of the four runs that start ends with exit code 255 and the verification line; the record of the client's starts holds no install run; after the master was set up, the counterpart's log shows no new session, command or forward. *The switch:* the install run starts once and ends with exit code 255 and the verification line; after the switch K1's log shows no new session or command (the run did not ride the master), and K2 logs 0 accepted logins. Control, once, by hand: the real client with the same pin words and without G2's options is carried by the master |
| M4 | An absent pin connects as before; an unusable pin and a failed pin write start nothing | (a) no `hostKey`, an empty one, one of white space; (b) a text that does not parse; (c) a parsed key on a host that cannot form a line; (d) a pin write that fails | (a): the 5 runs carry `accept-new` and no known-hosts file, 5 accepted logins, 0 pin files written. (b), (c), (d), on each road: 0 starts of the client, 0 connections in the counterpart's log, no *bridged* row, 0 files left in `keys/<pid>/` (except one case, candidate C14: in (d) a pin file that the failed write had begun can stay until the next activation's purge, and the run names such a file when it finds one); sentence A in the login's form for (b) and (c), sentence B for (d). Recorded for C9: whether the bridge's command minted a token before it refused |
| M5 | A refused host key is told to the person as that, and nothing else is (P3) | pinned to K1 in all four: (a) the counterpart K2; (b) the counterpart stopped; (c) the counterpart K1, its login refused; (d) an address that does not answer inside the run's time limit | (a): the install shows sentence C once and not "did not answer the probe"; after *Open Remote Bridge…* no *bridged* row is left, and exactly one error MESSAGE holds the bridge's form of sentence C (a log line alone does not pass); the order of the messages is recorded. (b), (c), (d): sentence C is shown 0 times on both roads, and what is shown is recorded word for word |
| M6 | Every call owns its files, calls do not disturb each other, nothing is left | two installs of one pinned entry that overlap; a bridge with its check; a bridge replaced by a second; each with a stored key, with a key that the person named by its path, and with a password; a file `known_hosts-<id>` is in the folder before | the pin paths of calls that overlap are distinct, as many as the calls; at each call's end its own file is gone and every other call's file is there with its bytes; `known_hosts-<id>` and the person's own key file are the same bytes after; after the last end: 0 files of these calls in `keys/<pid>/`, 0 client processes alive (by the recorded pids, not by name), no forwarded socket left. The password entry: with K1 the counterpart's log shows that the password attempt arrived (accepted, or `Failed password` where the counterpart cannot check one; the result says which); with K2 it shows 0 authentication attempts |
| M7 | A pin file at a path with a space is read as one file (§3.9, rows 6-7) | the storage folder's path holds a space; the runs of M1 and of M2 (b), both legs | as M1 and as M2 (b), both legs |
| M8 | The sources that only an `ssh` config turns on: measured for C2, either result passes | the entry pinned to K1, the counterpart K2; the handed config names a `KnownHostsCommand` that prints K2 | for each run that starts it is recorded whether the login was accepted or refused, with the client's version (the install run starts only after a probe that was accepted: five runs, or four). An accepted login is the result that C2 names; it does not fail E2 |
| M9 | The advice of sentence A repairs the pin (the key form), and no password entry is given it (P2) | a key entry with a pin that does not parse: all three roads; then Connect's options (`connectionOptions`) with the real scan of the counterpart (K1) and *Trust and connect* answered; then the runs of M1. Beside it, for C1: a password entry in the same state, the scan given no answer | the three roads showed the key form and started nothing; the stored pin is K1's line after the answer, and M1 passes on that entry; the password entry was shown the password form by all three roads. Recorded for C1: whether Connect's options for it name no pin file |

- **Done when.** Every row passes as its last column says, in one run of the whole set on the final code: a repair
  means the whole set again. The results are in §10, per row: the numbers, the date, the client's and the
  counterpart's version, the commit. A row that was not measured is not passed, and E2 is then not done: there is no
  "if no real host can be had". The code gate is at `proceed` and E2's PR is merged.
- **Cornerstone areas.** None.
- **Stories.** `todo/PLAN_person_roads_pin_host_key_E2.md`: not written yet.
- **Info for M5 (a), the bridge.** In leg 2 of the smoke (E1.S4) the person also sees *Bridge open to …* before the check's error (§3.5 says so):
  the click shows it at once, and the check's message follows when its `ssh` is refused. E2's reading of the screen counts both lines.

### Candidates

Not built in E1 or E2 (§9, step 7). Each names the result of E2 that would justify it.

- **C1 — Connect refuses to go on when its scan answers nothing and no usable pin stands in** (§3.5; §7, F2).
  Justified by M9: the password entry is left with a sentence that names no repair, and Connect's options name no pin
  file for it.
- **C2 — The config's own sources are off on a pinned call** (`KnownHostsCommand=none`, `VerifyHostKeyDNS=no`), with
  an answer for a client older than OpenSSH 8.5 (§3.9). Justified by M8: an accepted login. `VerifyHostKeyDNS=no` alone is C17.
- **C3 — The agent's exec refuses an unusable pin** in place of reading it as no pin (§7, F1). Justified by M4, (b)
  and (c): 0 starts on the three roads, which leaves the agent's road as the one that still connects.
- **C4 — Connect's terminal line takes the words of §3.9** (the pin as both files, the path as one file;
  `sshCommand.ts:313-330`). Justified by M2 and M7 passing on the builders.
- **C5 — The help article `remote-bridge` says it, in five languages together** (§6). Justified by M5: the sentences
  that were captured are the ones the article has to match.
- **C6 — The real runs on Windows** (Win32-OpenSSH: the path form of §3.9, the system-wide file, the stderr that
  sentence C reads). Justified by M1, M2, M5 and M7 passing on Linux: they are the list that Windows repeats. Measured
  so far, the client alone (`ssh.exe -G`, 2026-11-17): the spec of E1.S1, its facts K7 and K8. A storage folder on a
  UNC path (a roaming profile) is read as another path (`\\` becomes one `\`, K8 c), so every pinned call is refused and
  sentence C names a local cause as a changed host; fail closed, recorded here.
- **C7 — The socket check's log line no longer says "is there" for an empty answer** (§7, F4). Justified by M5, (b)
  and (c): a host that is down and a refused login both reach that line.
- **C8 — The edit form can clear a saved host key that does not parse** (§7, F2, its second half). Justified by M9:
  the repair works only where Connect's scan answers.
- **C9 — The pin is checked before the token is minted and before the PIN question** (§3.4). Justified by M4, (b):
  a refused pin leaves a grant that nobody used.
- **C10 — The doc comments of `agentCommands.ts` that have no function under them go** (§7, F5). No result of E2
  bears on it; it is taken only if §3.6's count does not hold after G2. It holds (§3.6, measured 2026-11-17).
- **C11 — An apostrophe in the storage path is quoted** (§3.9). `oneFileWord` (`hostKeyPin.ts`) quotes a path only on white
  space. Measured (the E1.S1 spec, K8 a, b): one apostrophe and no white space, bare, is `invalid quotes`, so every pinned call of
  such a storage folder fails; a PAIR of apostrophes is taken out and resolves to another path, which after E1.S3 shows a false
  sentence C. Both fail closed, and neither is a regression of this plan. The fix is to quote on `/[\s']/`: measured that double
  quotes heal it (K8 a). Would be justified by a row that E2 does not run as written (a storage folder with an apostrophe, beside M7);
  adding that row is a recorded plan change, not an edit.
- **C12 — The match asks for the LAST line of the stderr** (§3.5, the E1.S3 spec, *Notes for the lead*). For a refused key of
  the destination the verification line is the last line; for a hop of the person's `ProxyJump` it is the last but one, followed by
  `Connection closed by UNKNOWN port 65535`. One changed line in `hostKeyRefused` would stop sentence C from naming the wrong host,
  and also from matching a remote command that prints the line in the middle of its output. Would be justified by rows that E2 does not run as
  written (a hop of the person's `ProxyJump`, a quiet config, beside M5); adding them is a recorded plan change.
- **C13 — A pinned call states its own `LogLevel`** (§3.9; the E1.S3 spec, L9 g). With `LogLevel QUIET` in the person's config a
  refusal is silent and the match misses. One more word from `hostKeyWords` (`-o LogLevel=ERROR`) would bring the line back. NOT
  measured, and a change of the words of E1.S1. Would be justified by a row E2 does not run as written (a config that says `QUIET`,
  beside M5); adding it is a recorded plan change. Under `QUIET` the bridge shows only *Bridge open to …* (§3.5).
- **C14 — A partly written pin file is removed when its write fails** (§3.1; the E1.S2 spec, §2.3). `materializeKnownHosts`
  (`hostKeyTrust.ts`) writes the file and then calls `lockToOwner`; a write that fails half way leaves the file until the purge
  of the next activation (the parent's §3.7). The key file has its own cure: PR #365's `withoutPartialKey` (`keyInstaller.ts`)
  removes a partial key. Note the two readings of `lockToOwner`: the E1.S2 spec, §2.3, says it "does not throw"
  (`materializedKeys.ts:28-38`: it is best-effort and swallows its error), while #365 guards the call all the same, inside its
  `try`. Both hold today; the guard is the safer reading. Justified by M4, (d) (a pin write that fails): a pin file in
  `keys/<pid>/` afterwards, which is the one named exception to M4's "0 files left" (M4 says the run names such a file when it finds
  one). Note too that the tests Q7a to Q7c of the E1.S2 spec do not model a failure AFTER the pin write began (they make
  `materializeKnownHosts` throw before it writes, or make the folder impossible): no test of E1 leaves a partly written pin file, so C14
  would add that test with its fix.
- **C15 — The socket check's own pin-write failure is more than logged** (§3.3, by design; the code gate on #379, finding 4). When the
  pin file of the socket check cannot be written, the check starts no `ssh` and the failure is only written to the log: the person sees no
  sentence for it (the bridge is open by then, §3.5). Would be justified by a row E2 does not run as written (M4, (d), beside the
  socket check's own write, with the person's screen read, not only the log); adding it is a recorded plan change.
- **C16 — A storage path that holds a double quote is refused before `ssh` starts** (§3.9; the code gate, finding 5; with C11). A path
  with a double quote names `/dev/null` in both known-hosts words (the E1.S1 tests), so every pinned call of such a storage folder is
  refused and sentence C shows a false cause (a changed host). The fix is to refuse before `ssh` starts, with a sentence that names the
  storage path. Would be justified by a row E2 does not run as written (a storage folder with a double quote, beside M7 and C11's
  apostrophe row); adding it is a recorded plan change.
- **C17 — `VerifyHostKeyDNS=no` on a pinned call, alone** (§3.9; the code gate on #379, CodeRabbit). C2 names it together with
  `KnownHostsCommand=none`, and the second is the reason C2 needs an answer for a client older than OpenSSH 8.5. `VerifyHostKeyDNS`
  is not: it is an old option (read, not measured: present since OpenSSH 3.8, 2004), so one more pair of words `-o VerifyHostKeyDNS=no`
  in `hostKeyWords` is safe on an old client. Measured 2026-11-18, OpenSSH 10.2p1: `ssh -G -o VerifyHostKeyDNS=no ...` is accepted
  and resolves `verifyhostkeydns false`; `yes` resolves `true`. NOT added to the code: a record only. Would be justified by a row E2
  does not run as written (M8's handed config naming `VerifyHostKeyDNS yes` beside its `KnownHostsCommand`; a secure SSHFP record
  needs a signed zone, so the row may not be runnable). Adding it is a recorded plan change, not an edit; C2 then keeps `KnownHostsCommand` alone.

Cornerstones: 1 of 1 — E1.S2
