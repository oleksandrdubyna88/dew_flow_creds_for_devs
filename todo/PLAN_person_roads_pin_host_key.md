# PLAN — three roads of the person enforce the entry's pinned host key (G1 of N16)

> Status: **plan only, nothing implemented yet, 2026-11-17.** Not approved: no plan round has run, so there is no change
> ledger yet (it opens at the approval). Scope: the extension only (`src_vs_code/src`): the bridge socket check, *Install
> creds on host* and *Open Remote Bridge…* in `commands/agentCommands.ts`, the helpers of `writtenKey.ts`, one small new
> module for the pin of one call, their tests, one help article in five languages, the docs. Found as G1 of
> [PLAN_person_roads_forget_key.md](../research/PLAN_person_roads_forget_key.md) (N16, §5) by the lead's Opus review and a
> Fable security pass on 2026-11-16, by reading.
> **Depends on:** the G2 plan, `todo/PLAN_bridge_no_connection_sharing.md` (written 2026-11-17 on its own branch
> `fix/g2-no-connection-sharing`; a path, not a link, until it is on `main`). G2 goes first; this plan is built after G2 has merged (§4).

## 1. Symptom

An SSH entry can hold a pinned host key (`hostKey`, `types.ts:90-96`: "Its presence is what turns
`StrictHostKeyChecking` from `accept-new` … into `yes` against a known_hosts file built from exactly this line"). The
edit form says of it: "Checked on every connection" (`entityFormPage.ts:352`). On three roads of the person that is not
true. They pass no `knownHostsFile`, so every `ssh` they start runs with `StrictHostKeyChecking=accept-new` against the
person's own `~/.ssh/known_hosts` (`sshBridge.ts:164-167`, `sshExecCommand.ts:146-148`), pinned entry or not:

| Road | Where | Its `ssh` runs | The argv call with no `knownHostsFile` |
|---|---|---|---|
| the bridge socket check `verifyBridgeSocket` | `agentCommands.ts:191-245` | two: the sweep (`:185`) and the mode check (`:217`) | `:180` (`sweepDeadSockets`), `:206` |
| *Install creds on host* (`credSshManager.installRemoteCli`) | `:259-329`, `runRemote` `:332-350` | two: the probe (`:282`) and the install (`:314`) | `:338` |
| *Open Remote Bridge…* (`credSshManager.openRemoteBridge`) | `:381-478` | one long-lived `ssh -N -R` (`:452`) | `:437-441` (`buildBridgeArgv`) |

Both argv builders already take the option: `BridgeOptions.knownHostsFile` (`sshBridge.ts:82`, used at `:213`) and
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
   `ControlPersist` from the person's own config; being measured on 2026-11-17). The reason (gemini, consult
   `9737729d`): a client that reuses an existing master connection does no new key exchange and no new login, so the
   pin options of this plan would be passed over while connection sharing is on. Read, not measured here; §4.

## 3. Fix

**The rule:** on these three roads, an entry with a pin starts `ssh` only with `StrictHostKeyChecking=yes` and a
`UserKnownHostsFile` that holds that pin and nothing else, written for this call and deleted with this call. (`ssh`
also reads the system-wide known_hosts files, on every road: §7, F3.)

**What exists and is reused** (nothing below is written a second time): the `knownHostsFile` option of both argv
builders; `materializeKnownHosts` with its `suffix` (the name, the directory `keys/<pid>/`, the modes `0700`/`0600`,
`lockToOwner`, the sanitised entry id: `hostKeyTrust.ts:66-98`, `materializedKeys.ts:75-81`); `forgetMaterializedKey`
(`keyInstaller.ts:262-268`, never throws); the two helpers of `writtenKey.ts`; the test world
`test/personRoadsWorld.ts`.

### 3.1 The pin of one call

One new function on the person's side, in a new small module beside the helpers (here `personPin.ts` and
`writePersonPin(storageDir, entity)`; the spec names them). It reads `entity.hostKey` of the snapshot that the road
already holds (`agentCommands.ts:266`, `:402`; the socket check gets the bridge's snapshot, `:465`), and answers one of
three. It never throws.

| The stored pin | The answer | What `ssh` gets |
|---|---|---|
| absent: `undefined`, empty, or only whitespace | unpinned | `StrictHostKeyChecking=accept-new`, as today |
| present and usable | pinned, with the path of the file written now | `StrictHostKeyChecking=yes`, `UserKnownHostsFile=<that file>` |
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

1. **The order, inside the guarded span:** the `try` opens; when the credential is `ok`, the helper calls the writer;
   then it calls `run` / `start`. A credential that is not `ok` writes no pin.
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

### 3.3 The two bounded roads (S1)

- **The socket check** (`:191-245`): the guard gets the writer; both argv calls name `knownHostsFile`
  (`sweepDeadSockets` gets it as a parameter, `:173-180`; the mode check, `:206`). Both runs read the SAME file. A
  refused value ends the check before any `ssh` (the branch at `:202-204`), and the refusal of a pin goes to the
  diagnostic log (`bridge`): the check never shows a dialog for what the bridge itself reports.
- **The install** (`:259-329`): the guard gets the writer; `runRemote` (`:332-350`) reads the ready value, so the probe
  and the install run name the same `knownHostsFile` (`:338`). A refused pin arrives in the existing refusal branch
  (`:277-280`). The pin file stays while the modal question is open, as the key file does (N16, §2.1).
- **One pin snapshot per call.** A pin that the person replaces while an install waits at its question is used by the
  NEXT call. The running call keeps the pin it started with.

### 3.4 The bridge (S2)

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
| the pin is present and unusable | `Cannot reach "<name>": ` + sentence A; no `ssh` | `Cannot bridge to "<name>": ` + sentence A; no `ssh`, no bridge |
| the pin file cannot be written | the same with sentence B | the same with sentence B |
| pinned, the host presents ANOTHER key: `ssh` refuses | sentence C, in place of today's "the host did not answer the probe" | the bridge's `ssh` ends (255), the row goes back to *Open Remote Bridge…*; the socket check shows sentence C |

**Sentence A** (new; the pin is present and unusable):

```text
The saved host key of "<name>" cannot be used, so nothing was sent to that host. Use Connect SSH on this entry once: it shows the key the host offers now, and Trust and connect saves it.
```

Why Connect SSH: it is the one road that heals such a pin. `pinVerdict` reads a stored text that does not parse as a
first contact (`hostKeyPin.ts:146-149`), the dialog shows the fingerprint (`hostKeyTrust.ts:139-149`, the button *Trust
and connect*), and the answer is written over the stored text (`connectionOptions.ts:87-99`). The edit form cannot do
it (§7, F2). When the host itself is the cause (it cannot form a known_hosts line), Connect SSH names that in its own
words; the sentence stays true, its advice is then one step short. Accepted: such an entry needs a host that was
edited after it was pinned, or imported data (`scanHostKey` refuses such a host before any pin is made,
`hostKeyTrust.ts:37-39`).

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

- **Where:** the first run whose answer each bounded road reads: the install's probe (`:282`; `runRemote` already
  returns its stderr, `:346`) and the socket check's mode check (`:217`), which speaks for the bridge as it already
  does for a missing socket (`:223-230`). The install's second run keeps today's sentence (a key that changes between
  two runs seconds apart).
- **When:** the call is PINNED and the run's stderr holds OpenSSH's line `Host key verification failed.`. An unpinned
  entry keeps today's sentences, whatever `ssh` printed: it has no saved key to speak of.
- **Measured for this plan, by hand, 2026-11-17, OpenSSH 10.2p1 (Ubuntu):** `ssh -F none -o BatchMode=yes -o
  StrictHostKeyChecking=yes -o UserKnownHostsFile=<a file that holds another ed25519 key for that host> -o
  GlobalKnownHostsFile=/dev/null` against a public sshd (`github.com:22` and `ssh.github.com:443`): exit code 255, and
  no line about a login; stderr ends with `Host key
  for <host> has changed and you have requested strict checking.` and `Host key verification failed.`; stderr names the
  pin file's path twice. **Not measured:** Windows' `ssh.exe`; a host that offers no key of the pinned type; a real
  refusal inside the suite (§5).
- A miss of the match shows today's sentence. It never shows a wrong claim of safety.

### 3.6 The file size

`commands/agentCommands.ts` has 794 lines; lint refuses more than 800 (`eslint.config.mjs:30`). The budget, against
`b84416aa` and to be measured again on `main` after G2 has merged:

- **Freed, first, in a commit of its own:** the imports that still name one symbol per line from the same module are
  grouped, as N16 did (§2.3 there). Seven modules: `../installCommand` (three lines), `../credsInstall` (three),
  `../sshExecCommand`, `../sshCommand`, `../agentShareSnippet`, `../secretClipboard`, `../gitSigningConfig` (two each).
  794 → 785. The import request strings do not change, so no module mock of a test changes.
- **Added, about 12:** no road gains a branch for a refused pin (§3.2, item 2); the four argv calls gain the option on
  lines that exist; `sweepDeadSockets` gains one parameter; sentence C is one branch of four lines on each of the two
  bounded roads; one import. The spec states the exact counts per story.
- **Not taken: moving the socket check out of the file.** `test/launchRoadScan.test.ts:306-319` pins the three calls of
  `buildSshExecArgv` that name no `ownAgent` to this file by name; that list belongs to
  [PLAN_ssh_exec_own_agent_forwarding.md](PLAN_ssh_exec_own_agent_forwarding.md). If the budget does not hold after G2,
  that is a question to the lead before the spec is written, not a silent move.

### 3.7 What grows, and who retires it

| What | How many, after this plan | Who retires it | When it is interrupted |
|---|---|---|---|
| the pin file `known_hosts-<entryId>-<uuid>` of a socket check | one while that check runs on a pinned entry (about 32 s at most), none after | the `finally` of `withWrittenKey` | a killed window leaves `keys/<pid>/`; `purgeMaterializedKeys` (`keyInstaller.ts:280`) of the next window that activates, or of this window's dispose (`extension.ts:216-217`), removes the folder |
| the pin file of an install | one while that install runs or its question is open, none after | the same `finally` | as above |
| the pin file of a bridge | one per LIVE bridge of a pinned entry (one bridge per entry; `start` replaces), plus one per `ssh` that a failed kill left running (N16, change 1.1) | the one continuation on that bridge's `exited` | as above; `dispose` kills every bridge. The bound N16 narrowed holds for the pin file too: a started `ssh` whose kill fails and that never exits keeps its files until the purge |
| a pin file left half written (the write threw part way) | at most one per failed write; its name is random and no `ssh` is given it | the purge only: the writer does not know the path | as above |

No new process, no new timer, no new continuation: the one of N16 deletes both files.

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
match of sentence C is a new pure function there); both argv builders; the agent's exec; Connect; `sshExecAuth.ts`;
`sshBridgeManager.ts`; `bridgeSpawner.ts`; every purge; an unpinned entry on these roads; every sentence that exists
today. A person sees three new sentences (§3.5).

## 4. The boundary with the G2 plan

The G2 plan (written 2026-11-17, its §6) carries this table from its side
(`planning-docs.md`, *a boundary between two plans is named on both sides*), and its path above becomes a link. On
N16's side, G1 of its §5 names this plan.

| Item | Which plan builds it | The other plan's part |
|---|---|---|
| connection sharing turned off on the bridge's `ssh -N -R` (`sshBridge.ts:156-161` names no `ControlPath` or `ControlMaster`) | G2 | G1 is built after it |
| connection sharing turned off on the four bounded runs (the socket check's two, the install's two): `buildSshExecArgv` adds `ControlPath=none` only for `bridged: true` (`sshExecCommand.ts:28-35`, `:154-158`), and the three calls of `agentCommands.ts` pass no options | **G2** (its decision 1, scope (b), consult `925f4f14`: the two options go into every argv of `buildSshExecArgv`, so these four runs, the agent's local exec and Run with Secrets) | G1's pin on these four runs is passed over wherever a master connection to that host exists |
| the pin on all five `ssh` runs, the per-call pin file, the three sentences | G1 | none |
| `commands/agentCommands.ts` and `test/personRoadsWorld.ts` | both plans edit them | G2 first; G1 measures §3.6 again and repairs its line references after G2 has merged |

**The order, and why:** G2, then G1 (§2, decision 4). With connection sharing on, a client that finds a master
connection to the host does no key exchange, so `StrictHostKeyChecking` and `UserKnownHostsFile` are not read at all.
The second row is this plan's own reading of the code, 2026-11-17: the reason of decision 4 holds for the four bounded
runs as much as for the bridge. A bridge that became a master would even carry its own socket check 1.5 s later.
Read, not measured; the G2 plan measures connection sharing.

**Disjoint:** G2 writes no pin file and no sentence about a host key; G1 adds no option about connection sharing.

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
   call deleted, nothing left in the folder.
7. **A pin write that fails** (the stand-in of `./hostKeyTrust` throws, and separately a real folder that cannot be
   written): sentence B, no `ssh` run, the key file of the call deleted (a real file).
8. **Two calls at once:** two installs of one entry that overlap, and a bridge with its socket check, hold distinct pin
   files; each end deletes only its own; a file `known_hosts-e1` that was in the folder before is still there after.
9. **Sentence C:** the stand-in answers exit code 255 and the stderr that §3.5 measured. The install shows sentence C
   and not "did not answer the probe"; the socket check shows it. Guard: the same stderr on an UNPINNED entry shows
   today's sentences.
10. **The helpers** (`test/writtenKey.test.ts`, extended): the writer is called once, inside the span, only for an `ok`
    credential; `run` / `start` get the refused value for a refused pin and are still called; a writer that throws (it
    must not) still deletes the key file; both files go through one continuation on the bridge.
11. **A scan that stays** (in the style of `test/launchRoadScan.test.ts:283-319`): every call of `buildSshExecArgv` and
    of `buildBridgeArgv` in `commands/agentCommands.ts` names `knownHostsFile`; and the scan still finds its four
    sites, so it cannot pass by matching nothing.
12. **The agent's road is not touched:** `test/hostKeyTrust.test.ts`, `test/sshUseActions.test.ts` and
    `test/sshExecOver.test.ts` pass unchanged.
13. **Mutation checks** (by hand, recorded in the commit body): drop `knownHostsFile` from each of the four argv calls
    in turn → test 2, 3 or 4 and the scan are red; delete the pin only when a key file was written → test 5 is red;
    write the pin before the guard → test 7's key file stays; read an unusable pin as unpinned → test 6 is red; drop
    the suffix → test 8 is red; write one file per run → "the same file" of tests 2 and 3 is red; delete the bridge's
    pin at once, or from `onEnded` → test 4 is red; refuse an absent pin → test 1 is red; drop "pinned" from the
    condition of sentence C → the guard of test 9 is red.
14. The whole extension suite (`npm test` in `src_vs_code`), lint (`max-lines` included) and the build green before
    the PR.

**What no test here proves.** That `ssh` refuses a host whose key is not the pinned one: that is `ssh`'s decision, made
from two options that the tests can only see in the argv. A real refusal cannot run inside the suite (it needs an
sshd; this machine has none, checked with `which sshd`; the CI image was not checked, and a test that depends on a
public host is not hermetic). It CAN be watched by hand, and was, once, for sentence C (§3.5). The same two options are
what Connect and the agent's exec have sent since B10. So §8 holds one hand check on a real host. Windows is read, not
run (the suite runs on Ubuntu; N16, G3).

## 6. Docs

- `src_vs_code/CHANGELOG.md`, `[Unreleased]`: a security entry. The bridge, its socket check and *Install creds on
  host* now check an entry's pinned host key: with a pin, `ssh` connects only to a host that presents it; a host that
  presents another key is refused and a message says so; a saved key that cannot be read is refused with the way to
  save it again; an entry with no pin connects as before. No version heading: the release writes it.
- `research/module_extension.md`: the paragraph **B10 — the host key** (`:5157-5173`) names the three roads (an
  unpinned entry as the agent's exec, a pin enforced from a per-call file); the paragraph **The bridge's `ssh` and its
  key file (N16)** (`:2581-2591`) gets the pin file and the extended helpers; the table *Secrets at rest and in flight*
  (`:6146`) gets the per-call pin file beside the row *SSH private key on disk*; the paragraph *Rule C* (`:6575`) names
  the per-call pin name, which keeps the entry's id as `known_hosts-<id>` does.
- `research/module_tests.md`: a new section after `## A bridge, its socket check and the install delete their key file
  (N16)` (`:2479`): the test files with their counts (read from the runner), what each proves, the real pieces, and
  what none of them proves (§5).
- The help article `remote-bridge`, *What can go wrong* (`helpEn.ts:205`), one sentence: an entry with a pinned host
  key is bridged, and installed to, only when the host presents that key; otherwise a message says so, and Connect SSH
  shows the new key. In all five languages, English the source (`.agents/PROJECT.md`, rule 7).
- At promotion: G1 of N16's §5 gets its "Fixed in" text; the `todo/README.md` row moves to `research/README.md`.

## 7. Out of scope

- **G2**, the bridge and connection sharing: its own plan, first (§4). **G3-G8** of N16's §5.
- Asking the fingerprint on these roads for an unpinned entry (decision 1).
- Deleting a bridge's pin file before its `ssh` ends (§3.4).
- A check of the pin before the token and before the PIN question (§3.4).
- Moving the socket check or the install out of `agentCommands.ts` (§3.6).

**Found while this plan was written, not built here** (each read in the code on 2026-11-17 unless it says measured):

- **F1 (the follow-up of decision 3).** The agent's exec reads an unusable pin as no pin: `materializeKnownHosts`
  answers `undefined` (`hostKeyTrust.ts:85-92`), `connectionArgvOptions` passes it on (`sshUseActions.ts:224`), and the
  call runs with `accept-new`. Fail-open where nobody is watching. Its own plan.
- **F2.** Every other reader takes an unusable pin as "no pin" too. Connect asks as on a first contact when the scan
  answers (the heal of §3.5); when the scan answers nothing it goes on with no pin file (`connectionOptions.ts:70`):
  `ssh`'s own question for a key entry (`sshCommand.ts:319-328`), `accept-new` for a password entry
  (`sshSession.ts:503-506`). The edit form says "No host key pinned yet" and offers no *Forget the pinned host key*
  (`entityEditCommands.ts:162`, `:202`; `entityFormPage.ts:349-355`), and its Save keeps the stored text
  (`entityFormPanel.ts:643`). Where such a text can come from: a sync or an import. The two writers of `hostKey` found
  (a search of `src_vs_code/src` for the word) do not write one: Connect writes `formatHostKey` of a scanned key
  (`connectionOptions.ts:94`), and the form keeps the stored text or clears it.
- **F3 (measured).** A pin is not the only trusted source of a host's key: with `UserKnownHostsFile` set, `ssh -G`
  still shows `globalknownhostsfile /etc/ssh/ssh_known_hosts /etc/ssh/ssh_known_hosts2` (OpenSSH 10.2p1, `-F none`). A
  key that a system-wide file lists for the host is accepted beside the pin, on every pinned road: Connect, the
  agent's exec, and these three after this plan. `hostKeyPin.ts:15` says "built from it alone". It belongs on the one
  road in (the argv builders), for all roads together, and it needs an answer for Windows: its own plan.
- **F4.** The socket check's log line for an empty answer says the socket "is there" (`agentCommands.ts:232-234`), also
  when `ssh` itself failed and nothing was observed (`interpretSocketProbe` reads an empty answer as `unreadable`,
  `sshBridge.ts:298-304`).
- **F5.** `commands/agentCommands.ts` holds doc comments with no function under them (`:76-93`, `:133-152`; the
  registrations were moved out of `extension.ts` word for word). A question for the lead, not a change of this plan:
  the comments whose function lives in another file could go, which would also widen §3.6's budget.

## 8. Definition of Done

- [ ] On a pinned entry every one of the five `ssh` runs of the three roads carries `StrictHostKeyChecking=yes` and a
      per-call `UserKnownHostsFile`; on an unpinned entry every run is as today.
- [ ] The pin file is written inside the guarded span, complete before the spawn, one per call, and deleted on every
      exit of §3.3 and §3.4, whether or not a key file was written; only a file that the call wrote is deleted.
- [ ] A pin that is present and unusable, and a pin write that fails, are refused before any `ssh`, with sentences A
      and B; a refused host key on a pinned entry shows sentence C.
- [ ] `materializeKnownHosts` and the agent's exec are unchanged (test 12).
- [ ] `agentCommands.ts` at most 800 lines, lint green.
- [ ] The tests of §5 RED first, then GREEN; the mutation checks recorded.
- [ ] One hand check on a real host, recorded in the PR: a pinned entry bridges and installs; its pin file is in
      `keys/<pid>/` while the bridge is open and gone after *Close*; an entry whose pin is another key (pinned by a
      Connect, then its host changed to another server in the edit form, which keeps the pin) is refused with sentence
      C. If no real host can be had, the deviations say what was checked and what was not.
- [ ] The docs of §6, the help sentence in five languages.
- [ ] The coai code gate at `proceed`; the lead's Opus review; CI green on the head sha; CodeRabbit read.
- [ ] Released as an extension patch with the owner's word; the plan promoted.

## 9. Build order and merge conditions

1. **G2 merges first** (§4). Then this plan is revised against `main`: the line references, §3.6's count, and the
   second row of §4's table.
2. This plan through the coai plan gate (`review_plan` → `resolve` until `proceed`). The approval opens the ledger.
3. The specs by Fable, one per story that needs one (S1, S2, S3), and the cadence consult if the gate orders one,
   BEFORE the build.
4. S1 (the cornerstone), then S2, then S3, each RED → GREEN, by a Sonnet coder, each from its spec; the lead's Opus
   review of each. Then S4, the documents, from its brief in `## Stories`.
5. `review_code` over the whole diff → `resolve` until `proceed`.
6. One branch, one PR (a squash merge), after the head sha's checks exist and pass. A PR over the repository's cap
   needs the owner's word.
7. The release (a patch) with the owner's word, then the promotion PR.

## Stories

Split straight into four stories, with no epics and no stories document, on the gate's habit for a small plan (N16:
three to five stories, no epics, at most one cornerstone). The split was written with this plan; the question
consultants were asked about the decisions of §2, not about the split, and the plan round may order another one. S1,
S2 and S3 decide whether a host is the one the person pinned, so each has a security spec that Fable writes before its
code (the row *Security judgement* of `subagent-models.md`, outside the quota); S1 is also the one cornerstone. Per
story: the spec or brief first, then a Sonnet coder (tests RED first, then the code), then the lead's Opus review. The
specs are not written now. They keep no change ledger: a change of one is an entry of this plan.

### S1 — The pin of one call, and the two bounded roads enforce it (CORNERSTONE)

- **Goal.** The bridge socket check and *Install creds on host* start `ssh` on a pinned entry only with the pin, from a
  file of this call that goes with this call; an unusable pin is refused before any `ssh` (§3.1-§3.3).
- **Why the cornerstone.** It sets the contract that S2 and S3 only use: the three states of a pin, the refusal as the
  one value a road reads, the guard that owns two files. A mistake here (an unusable pin read as unpinned, a pin
  deleted only with a key file, a pin written outside the span) reaches all three roads and reads as working.
- **Scope.** `commands/agentCommands.ts`: the imports of seven modules grouped (§3.6; a commit of its own), then
  `verifyBridgeSocket`, `sweepDeadSockets`, the handler of `credSshManager.installRemoteCli` and `runRemote`. New
  `src/personPin.ts`: the writer of §3.1 and sentences A and B. `src/writtenKey.ts`: `withWrittenKey` extended, and
  the shared part of §3.2 (the one value, the two deletes). Tests: `test/personRoadsWorld.ts` extended (§5), a new test
  file for tests 1, 2, 3, 5, 6, 7 and the install half of 8, `test/writtenKey.test.ts` extended (test 10, its bounded
  half), the scan of test 11 for the three `buildSshExecArgv` calls. No document (S4).
- **Depends on.** G2 merged (§4, §9).
- **Done when.** The spec's RED scenarios were watched failing on the unchanged code and pass; its guards pass before
  and after; N16's tests pass with the one mechanical edit of §3.2; the mutations of §5 that name these roads each
  turned red what the spec names and were restored; `agentCommands.ts` is within the spec's count; typecheck, lint and
  the whole suite green.
- **model:** fable writes the spec (the cornerstone, and security judgement); sonnet codes; opus reviews.

### S2 — A bridge enforces the pin, and its pin file goes when its `ssh` ends

- **Goal.** *Open Remote Bridge…* on a pinned entry starts its `ssh` only with the pin; the pin file is the command's
  to delete until the bridge's `ssh` holds it, and is deleted when THAT `ssh` has ended, whatever ended it (§3.4).
- **Scope.** `src/writtenKey.ts`: `withWrittenKeyUntilExit` extended (one flag, one continuation, both files).
  `commands/agentCommands.ts`: the handler of `credSshManager.openRemoteBridge` from its guard to `bridges.start`.
  Tests: a new test file, or `test/bridgeKeyHandoff.test.ts` extended, for test 4, the bridge halves of 5, 6, 7 and 8,
  and one real pin file through a held process; `test/writtenKey.test.ts` (test 10, the bridge half); the scan of test
  11 gains the `buildBridgeArgv` call. No change of `sshBridgeManager.ts` or `bridgeSpawner.ts`.
- **Depends on.** S1 (the writer, the one value, the world).
- **Done when.** The spec's RED scenarios were watched failing and pass; *Close* alone deletes no pin file in a test
  whose process ends only when the test says so; a replacement keeps the second bridge's pin file; its mutations each
  turned red what the spec names and were restored; typecheck, lint and the whole suite green.
- **model:** fable writes the spec (security judgement); sonnet codes; opus reviews.

### S3 — A host key that `ssh` refused is named

- **Goal.** On a pinned entry, a person who meets a host with another key is told so, by the install and by the socket
  check that speaks for the bridge, and is told what to do (§3.5, sentence C); the help says it.
- **Scope.** `src/hostKeyPin.ts`: one new pure function for the match and sentence C (no existing function changes).
  `commands/agentCommands.ts`: one branch after the install's probe and one after the socket check's mode check. The
  help article `remote-bridge` in `helpEn.ts`, `helpDe.ts`, `helpEs.ts`, `helpRu.ts`, `helpUk.ts`. Tests: test 9 with
  its guard, the pure function's own tests, the help's existing parity tests.
- **Depends on.** S1 (a call knows whether it is pinned). Not S2: S3 can be cut by the plan round and leave S1 and S2
  whole.
- **Done when.** The spec's RED scenarios were watched failing and pass; the unpinned guard passes before and after;
  the stderr the tests use is the text that §3.5 measured; the five articles say the same; typecheck, lint and the
  whole suite green.
- **model:** fable writes the spec (security judgement: what a person is told at a possible interception); sonnet
  codes; opus reviews.

### S4 — The documents

- **Goal.** The documents say what S1 to S3 built (§6).
- **Scope, which is also the brief** (no spec; one commit; no code): the first three items of §6 (the CHANGELOG entry,
  the four places of `research/module_extension.md`, the new section of `research/module_tests.md`), and in this plan
  the ticks of §8 and what was built in the status paragraph. The help sentence belongs to S3 and the promotion to §9.
  Every sentence the documents had stays.
- **Depends on.** S1, S2 and S3 (their final names, counts and line numbers).
- **Done when.** Every sentence added describes code that is on the branch (each name grepped);
  `node .agents/conventions/tools/plan-lifecycle.mjs` is clean; no sentence names a version, a sha or a count that the
  next commit moves, except the test counts of `module_tests.md`.
- **model:** the brief is the list above (written with this plan); sonnet writes the documents; opus reviews them.

Cornerstones: 1 of 1 — S1
