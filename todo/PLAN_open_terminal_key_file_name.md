# PLAN — the key file of a terminal is named `call-<uuid>.key`, and a terminal keeps one key file (N17)

> Status: **in progress, epoch 2, 2026-11-15** (stopped at entry 1.2, re-reviewed, resumed). E1.S1 is built at `895e345b`, unmerged. This text is the plan as
> revised for epoch 2 on 2026-11-15 (the re-review record below); epoch 2 is approved, and E1.S2 is not built yet.
> Scope: the extension only (`src_vs_code/src`): the name of the key file that `prepareSshSession` (`sshSession.ts`) writes
> (built), the key file of a Connect that reuses a live terminal (`openKeyTerminal`, `sshConnect.ts`), their tests and the
> test world, the scan of `keysDirPaths.test.ts`, the docs. Found as N17 of
> [PLAN_agent_refusal_key_file_path.md](../research/PLAN_agent_refusal_key_file_path.md) (§13) by the lead's Opus code
> review on 2026-11-12. Order of the follow-ups advised by the question consultants on 2026-11-15 (consult
> `ad7ce1a5`): N17 first and alone; N16 (three roads of the person leave a key until the purge) is its own next plan.

## Plan changes

> Epoch 1 · approved 2026-11-15 · by reviewers · state: closed

- 1.1 · 2026-11-15 · reviewer · approach — Fable's spec found that the real `openSshTerminal` reuses a live terminal
  of the entry and types nothing (`terminalManager.ts:51-57`): after the fix each extra Connect of a live session writes
  one more `call-<uuid>.key` that no `ssh` reads, kept until that terminal closes (today one path is rewritten). §2
  says so; guard G1 is added to §3. (The round's accepted finding, T-N17c, and the spec consult's points were folded in
  at the round's resolve, before approval, and are not entries. The line numbers, the file list of §3.5 and the two S1
  sites are repairs.)
- 1.2 · 2026-11-15 · reviewer · scope — the growth of 1.1 has no fixed bound (an agent's `creds_open_terminal` on a
  live session adds a file per call too) and N16 does not cover this road; F2 (forget the key of a reused terminal at
  once) is recorded and routed. Raised by the cadence consultant (`c35d5cf5`) and the Opus code review; the question
  consultants split (`692ebd61`), so by the rule it counts. This second change stopped the plan.

### Re-review for epoch 2

Narrowed: no — the scope grows by one story (E1.S2, no key file left by a Connect that reuses a live terminal); nothing got smaller

| Work | Where | Verdict | Action |
|---|---|---|---|
| the plan as first written, 50345d34 | pushed, unmerged | fits | kept; its text was rewritten forward by the re-review revision 4c23b8bb |
| the epics, the E1.S1 spec and the ledger with change 1.1, 19a358d6 | pushed, unmerged | fits | kept; superseded in part by E1.S2 (the S1 spec's G1 and its list of files with no change) |
| E1.S1 code and tests (the call name on every road of prepareSshSession), 3099f5a5 | pushed, unmerged | fits | kept; superseded in part by E1.S2 (G1 rewritten, T-N17c extended, the world repaired W6-W9) |
| E1.S1 documents (CHANGELOG and the module documents), 895e345b | pushed, unmerged | fits | kept; superseded in part by E1.S2 (the last two CHANGELOG sentences, the G1 clause and count in module_tests.md, the README row) |
| change 1.2 and the stop, 3e8270c1 | pushed, unmerged | fits | kept; entry 1.2 and the stop stay; its routing of F2 to N16 was rewritten by 4c23b8bb |

  (The re-review, 2026-11-15. The consult for it is `d60bc360`: fix F2 in `openKeyTerminal` with a snapshot of the
  window's terminals taken directly before the synchronous open. The question consultants, `576f2936`, both: F2 is a
  second story of the SAME epic, built forward on the same branch, then one code round over the whole diff of E1. The
  whole plan below is revised against that; what the revision changes is the baseline of epoch 2 and is no entry. An
  Opus judge filled the verdicts of the table. The revised plan passed the document review (interim path, 2 findings
  accepted: the stories document and the projected size) and the lead's Opus review (approve, 6 low findings folded
  into the E1.S2 spec).)

> Epoch 2 · approved 2026-11-15 · by reviewers · state: open

## 1. Symptom

### 1.1 The name of the key file tells the id of a key entry (fixed on the branch by E1.S1)

On `main` (`4f9caa42`), `creds_open_terminal` calls `connectEntity` (`sshUseActions.ts:382`) → `prepareSshSession` →
`keyFile` (`sshSession.ts`), which writes the stored key with `materializePrivateKey(storageDir, source.keyEntityId,
source.content, suffix)`: the file is `keys/<pid>/<keyEntityId>.key`, or `<keyEntityId>-<uuid>.key` when `isolate` is
set. `connectEntity` then types `ssh -i "<path>" …` into a VS Code terminal (`sshCommand.ts:232-233`). When the SSH
entry borrows the key of a linked key entry that the agent may not view, the id of that entry is in the terminal's
text. The answer to the agent is `opened` or a fixed sentence, but an agent in the same window with a tool that reads
a terminal can read the id. Rule C (1.21.4) closed this for every caller of `resolveExecAuth`; this road was left out
on purpose (§8 of that plan: "the person's roads keep their names") and recorded as N17.

The same writer serves the person's Connect, a folder run, a linked line run and a dependency run (`sshRoad.ts`,
`dependencyRunHost.ts`). They type the same path into the person's terminal. Nothing reads the name back: every
owner deletes the file it was handed (`openKeyTerminal` on terminal close, `sshConnect.ts:117-134`; `ReadySsh.cleanup()`
for `sshRoad.ts:121`, `:170`, `:178`, `dependencyRunHost.ts:402` and `commands/folderRunCommand.ts:280`), by the path it
got, never by a name.

### 1.2 A reused terminal collects key files (found while E1.S1 was specified and reviewed; changes 1.1 and 1.2)

`openSshTerminal` (`terminalManager.ts:37-66`) gives back a live terminal of the same account and entry and types
nothing (`:51-57`); only a new terminal gets the line (`:61`, `:64`). `prepareSshSession` has written a key file by
then. `openKeyTerminal` (`sshConnect.ts:117-134`) does not know that the terminal was reused: it registers one more
close listener and keeps the new file until that terminal closes (`:125-130`).

On `main` the repeated call rewrites the one file `<keyEntityId>.key`, so nothing collects. With the call name of
E1.S1 each repeated Connect of a live session writes a NEW `call-<uuid>.key` that no `ssh` reads. There is no fixed
bound: every such *Connect via SSH*, and every `creds_open_terminal` of an agent on a live session
(`sshUseActions.ts:382`; an entry whose agent access asks `never`, or once in 12 hours, lets the calls repeat with no
question: `consentDue`, `mcpConsentPolicy.ts:109-123`), adds one decrypted copy of the private key and one listener, until that terminal closes or the
purge runs. The product's own rule is that a key is on disk only when an `ssh -i` needs the path
(`research/module_extension.md`, the row *SSH private key on disk*). N16 does not cover this road (its three roads are in
`commands/agentCommands.ts`). So E1.S1 alone must not ship: it would trade the id in a name for a growing set of key
files.

## 2. Fix

### 2.1 The name (E1.S1, built at `3099f5a5`)

`keyFile` (`sshSession.ts:467-481`, the write at `:473`) calls `materializeCallKey(storageDir, source.content)`
(`keyInstaller.ts:175`) for every road of `prepareSshSession`, with or without `isolate`. The file is
`keys/<pid>/call-<uuid>.key`. `keyFile` has no `suffix` parameter, so the writer of the key cannot be handed a name
part (a question consultant, 2026-11-15). The solved instance that it copies is `byStoredKey` of `sshExecAuth.ts`.

- A random name per prepare is already unique, so `isolate`'s suffix is no longer needed for the KEY file; it stays for
  the host-key pin (`known_hosts-<sshEntryId>-<uuid>`, `hostKeyTrust.ts:67`). The pin names the SSH entry that the
  agent asked for, which it may view (N11 of the parent plan: kept).
- Two terminals of one entry (the first has ended, the second is new) have two files, and each terminal deletes its
  own. On `main` they shared `<id>.key`, and the first close deleted the file of the second.
- `materializePrivateKey` keeps its `suffix` parameter: no product caller passes one. Removing it touches the lines
  that the open bridge PR #365 changes in `keyInstaller.ts`, so it waits for #365 (follow-up F1).

### 2.2 One key file per terminal (E1.S2)

In `openKeyTerminal` (`sshConnect.ts:117-134`), and nowhere else in the product:

- `const before = new Set(vscode.window.terminals)` is taken directly before the call of `openSshTerminal`. The open
  half is synchronous (`sshConnect.ts:72-73`, `:111`), so no `await` stands between the snapshot and the call.
- The condition that forgets the key at once, `terminal === undefined`, becomes
  `terminal === undefined || before.has(terminal)`. A terminal that was in the window before the call was not made
  by this call: it is the reused one. Its new key file is forgotten at once and NO close listener is registered.
- The other branch does not change: a new terminal keeps its file until THAT terminal closes.

**Why the new file may go at once.** The reason is: the new path was never sent to any terminal. `openSshTerminal`
types a line only into a terminal that it has just created, so no line names the new file and no `ssh` will read it.
The reason is NOT "the `ssh` of the live terminal authenticated long ago": `exitStatus === undefined` says only that
the terminal has not ended; it proves neither that an `ssh` runs in it nor that one has read its key.

**What stays.** The file that the reused terminal's own line names stays until that terminal closes, as today: the
`ssh` of that line may still read it, and the person may run the line again in the same shell.

**What was decided against** (the re-review consult, `d60bc360`):

- No change of what `openSshTerminal` returns, and no code change in `terminalManager.ts`. The snapshot tells a
  reused terminal from a new one without a new contract between the two files. `terminalManager.ts` gets one comment
  at `:51-57`: `openKeyTerminal` relies on "a reused terminal gets no line".
- The reuse is not looked up in `prepareSshSession`, and no snapshot is taken before it. Prepare has `await`s and
  dialogs; an answer read there is old when the terminal opens (measured on a copy of the compiled branch,
  2026-11-15: with the snapshot before the `await` of prepare, three Connects that overlap keep three files). Prepare
  also serves the roads, which do not reuse this way. So the key file of such a call is still written, and the open
  half deletes it right after, with no dialog and no wait between; it is not avoided.
- The holder of `sshRoad.ts` (`cleanWhenClosed` and `hold`, `:174-205`) is not reused: it calls `cleanup()`, which
  deletes the pin too, and Connect keeps its pin `known_hosts-<id>` on purpose. (`sshRoad.ts` also imports
  `sshConnect.ts`, `:5`.)

**The same shape at the other sites** (searched 2026-11-15: every `onDidCloseTerminal` and every caller of
`cleanup()` in `src_vs_code/src`). `sshRoad.ts` keeps one listener per terminal and holds a session only when its line
was typed (`:193-205`); a session whose line was not typed is cleaned by its owner (`ownedSessions`, `:113-139`);
`dependencyRunHost.ts` cleans each step when the step ends (`:400-403`). A key file that is kept although no line
names it was found on the Connect road only.

### 2.3 What grows, and who retires it

| What | How many, after E1.S2 | Who retires it | When it is interrupted |
|---|---|---|---|
| a `call-<uuid>.key` in `keys/<pid>/` (one private key, a few kB, mode 0600) | one per OPEN Connect terminal whose line names a stored key; a call that reuses a live terminal leaves none | the close event of that terminal (`openKeyTerminal`); at once when no terminal opened or the terminal was reused | a killed window leaves its `keys/<pid>/`; `purgeMaterializedKeys` (`keyInstaller.ts:280`) of the next window that activates or deactivates removes the folder of a process that is gone, and each window removes its own |
| a listener of `onDidCloseTerminal` | one per such terminal | it disposes itself when that terminal closes (`sshConnect.ts:128`) | it ends with the extension host |

A window has at most one live Connect terminal per entry of an account, plus terminals that have ended and are not
closed yet; each holds one file. No call of an agent adds to this once the entry's terminal is live.

**Projected size.** A key file is the private key itself: about 0.4 kB for ed25519, about 3.3 kB for RSA 4096. A
heavy window, 30 open Connect terminals of stored-key entries plus 10 that have ended and are not closed, holds 40
files, at most 40 × 3.3 kB ≈ 132 kB, and 40 listeners. The count is bounded by the terminals the person keeps open;
repeated Connects and agent calls on a live terminal add nothing. Before E1.S2 each such call added one file.

### 2.4 What does not change

`keyInstaller.ts`, `materializedKeys.ts`, `sshRoad.ts`, `dependencyRunHost.ts`, any purge, and the code of
`terminalManager.ts`. No sentence, status or answer changes; `creds_open_terminal` still answers `opened` for a live
session.

## 3. Tests (RED first)

Each new or changed assertion is watched RED before its fix, then GREEN. Items 1 to 8, 2a and 2b are E1.S1 (built;
their RED texts and the mutations M1 to M6 are in the body of `3099f5a5`). Items 9 to 14 are E1.S2; its spec has the
steps, the texts measured on a copy of the compiled branch, and the order.

1. **T-N17a, `sshSession.test.ts`:** an SSH entry with a LINKED stored key whose key entry id reads like a name
   (`hid-key-8f3k2`, different from the SSH entry's id): `materializedKeyPath`'s basename matches
   `/^call-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.key$/` and does not contain the key entry id.
   Read from the world's own list of written files, not guessed. RED before E1.S1 (`hid-key-8f3k2.key`).
2. **T-N17b, the terminal text:** through `connectEntity` with the same linked key, the text sent to the terminal holds
   `-i` followed by the written path (positive first), and holds neither the key entry id nor its name. The text
   comes from the REAL command composition (`openSshTerminal` / `buildSshCommand` of `terminalManager.ts`), not from
   the stand-in of `sshConnectWorld.ts`, which records arguments and composes nothing (a question consultant,
   2026-11-15, verified by reading).
2a. **T-N17c, two lifetimes (accepted from the plan round, codex):** two NON-isolated Connects of one entry with a
   stored key, each with its own terminal (the first has ended, so the real reuse rule opens a second): two distinct
   `call-<uuid>.key` paths; closing the first terminal deletes the first path only; the second path is deleted when its
   own terminal closes. E1.S2 keeps it and adds to it (item 12): the ended first terminal is in the snapshot, and the
   key of the terminal that replaces it must NOT be forgotten before a close.
2b. **G1 (change 1.1, rewritten by E1.S2).** As built by E1.S1, G1 says that every file written for a live terminal is
   forgotten when it closes, and none before. That sentence is the defect of §1.2. Item 10 replaces it.
3. **T20 (`sshSession.test.ts`)** keeps its four-distinct-files claim; its key pattern is the `call-<uuid>.key`
   pattern; the pin pattern `known_hosts-e1-<uuid>` stays.
4. **T21 (`sshSession.test.ts`)**: a non-isolated prepare writes a call-named key; the pin and "no suffix asked of the
   known_hosts writer" stay.
5. Every other assertion on the literal `/storage/keys/k1.key` in `sshSession.test.ts`, `sshConnect.test.ts` and
   `sshConnectRemote.test.ts` (L1 to L11 of the E1.S1 spec) compares with the path that the world's writer returned.
6. **The scan S1/S2, `keysDirPaths.test.ts`:** `sshSession.ts` is off `WRITER_LIST`; the list is exactly two files
   (`keyInstaller.ts`, `transportFactory.ts`).
7. **Mutation check M1 to M6 (E1.S1, by hand, recorded in `3099f5a5`):** the old writer back → 18 tests red; and five
   more.
8. The whole extension suite (`npm test` in `src_vs_code`), lint and the build green before the PR.
9. **The test world is repaired first (E1.S2; the Opus code review of E1.S1 and the re-review consult).** Three tests
   are written on the unchanged world and watched RED, then four repairs of `sshConnectWorld.ts` turn them GREEN and
   change the colour of no older test (measured: the 101 tests of the six suites that load the world):
   - **FX-D** — the world's key writer ignores the folder it is handed, so a product that hands it
     `<storageDir>/<keyEntityId>` stays green. Repair: the stand-in builds its path from that folder.
   - **FX-L** — `dispose()` of the world's close event does nothing, so a product that disposes its listener on ANY
     close stays green. Repair: the close event is the shared `StubEventEmitter` (`test/vscodeStub.ts:144-182`):
     `dispose` removes the listener, a dispatch goes over a copy of the list, and the world can count the listeners.
   - **T-N17d** — no test reads the dialog of a failed key write (`sshSession.ts:476`) for the id or the name of the
     linked key entry, and the world's failure names no file. Repair: the failure text names the file, as the text of
     the operating system does.
   - A gate on the credential lookup, so a test can hold several Connects inside prepare at once (item 11, G3).
10. **G1, rewritten: a Connect that reuses a live terminal leaves nothing.** Two Connects of a live session through the
   real `openSshTerminal`: one terminal, one typed line, two files written; the second file is forgotten at once and
   the first is not; one close listener. Then the close of another terminal forgets nothing and takes no listener
   away; the close of the terminal forgets the first file, and no listener is left. RED on the branch: the second file
   is kept.
11. **No accumulation, and the two ways around it:**
   - **G2** — five calls on one live terminal, with the options of the agent's `creds_open_terminal`: one key file and
     one listener are left; after the close, none. RED on the branch: five files, five listeners.
   - **G3** — three Connects that overlap: all three are held inside prepare until the last has arrived (the gate of
     item 9), then go on. One terminal, one typed line; the one file left is the file that the line names. RED on
     the branch: three files. (Three Connects started together with `Promise.all` and no gate do NOT overlap in this
     world: measured, the first opens its terminal before the second reaches its lookup. So the gate is needed.)
   - **G4** (a guard, green before and after) — another live terminal is in the window before the Connect: the key
     of the NEW terminal is kept; the close of the other terminal forgets nothing; the close of the own terminal
     leaves no file and no listener.
12. **T-N17c, kept and extended:** the leak check also on the SECOND terminal's line and on both tabs; nothing is
   forgotten before a close although the ended first terminal is in the snapshot; two listeners, then one, then none.
   Green before and after the fix of E1.S2 (a guard of the fix).
13. **Mutation checks M7 to M17 (E1.S2, by hand, recorded in the commit):** each must compile and turn the named tests
   red — the `before.has` check dropped; the snapshot taken after the call; the snapshot taken before the `await` of
   prepare; a listener registered also on reuse; forget on any close; `sub.dispose()` moved out of its `if`; the
   writer handed `<storageDir>/<keyEntityId>`; `before.size > 0` in the place of `before.has(terminal)`; reuse judged
   by an earlier terminal of the entry, an ended one too; the world's `dispose` a no-op again; the old writer back
   (for T-N17d). The table with the red tests of each is in the E1.S2 spec, §6.
14. The whole extension suite, typecheck and lint green; no new `eslint-disable`.

## 4. Docs

- `src_vs_code/CHANGELOG.md` `[Unreleased]`, `### Changed — security: the key file of a terminal`: the key file that
  Connect, `creds_open_terminal` and the runs over SSH write is named `call-<uuid>.key`, so the text typed into a
  terminal holds no id of a linked key entry (E1.S1, written). E1.S2 replaces its last two sentences: a second
  *Connect via SSH*, or a second `creds_open_terminal` of an agent, while the entry's terminal is open brings that
  terminal forward and types nothing, and the key file written for it is deleted at once; an open terminal keeps one
  key file, however often it is asked for.
- `research/module_extension.md`: the *Rule C* paragraph and the sentence on `isolate` (E1.S1, written). E1.S2: who
  owns the key file on Connect (`openKeyTerminal`: when its terminal closes; at once when no terminal opened or a live
  one was reused), and the row *SSH private key on disk*.
- `research/module_tests.md`: T-N17a, T-N17b, T-N17c, the scan's list of two (E1.S1, written). E1.S2: the row of the
  connect path (G1 as rewritten, G2 to G4, FX-D, FX-L, T-N17d, the close event and the gate of the world, the counts
  that the runner prints), and what the tests do not prove (a real VS Code window).
- The parent plan's §13 N17 line gets "fixed in <version>, PLAN_open_terminal_key_file_name.md" at promotion (a
  research document; appended, not rewritten).
- `todo/README.md`: a row for this plan, its stories document and each spec; removed at promotion.

## 5. Out of scope

- N16 (the three roads of `agentCommands.ts` that never delete their file): its own plan, next.
- The `known_hosts-<id>` and `agent-script-<id>` names (they hold the id of the entry that was asked for, which the
  caller may view).
- The text of the operating system in a failed write (Q1 of the parent plan, kept by the owner). T-N17d only proves
  that this text holds no id and no name of a key entry.
- The reuse rule itself (`terminalManager.ts:51-57`): a Connect of a live terminal types nothing, also when the `ssh`
  in it has ended and its shell is still open. Today's behaviour, not changed.
- The holders of the roads (`sshRoad.ts`) and of the dependency run (§2.2: they do not have this shape).

## 6. Follow-ups

- F1: after #365 merges, drop the `suffix` parameter of `materializePrivateKey` (no product caller passes it), and
  correct the three docblocks that E1.S1 left stale on lines that #365 moves: `keyInstaller.ts:147-150` (it says that
  `sshSession.ts` passes the id of a key entry and a suffix), `keyInstaller.ts:172-173` (it says that
  `materializeCallKey` is for a call of an agent or a road of `resolveExecAuth`) and `materializedKeys.ts:102` ("of
  ONE call of an agent").
- F2: no longer a follow-up. It is E1.S2 of this plan (§2.2), and it does not go into the N16 plan.
- F3 (a candidate, from the E1.S1 spec): after E1.S1 nothing in the product reads `keyEntityId` of a stored-key
  source (`sshCredential.ts:27`, `:86`). Not removed here.

## 7. Definition of Done

- [ ] **No id in a name.** No road of `prepareSshSession` writes a key file whose name holds an id; `sshSession.ts`
      is off `WRITER_LIST` (E1.S1).
- [ ] **No accumulation on reuse.** A Connect or a `creds_open_terminal` that reuses a live terminal leaves no key
      file and no listener of its own; an open Connect terminal holds exactly one key file and one close listener,
      and none after it closes (E1.S2: G1, G2, G3).
- [ ] T-N17a, T-N17b, T-N17c and the scan were watched RED, then GREEN, and M1 to M6 are recorded (E1.S1, in
      `3099f5a5`). FX-D, FX-L and T-N17d were watched RED on the unrepaired world; G1, G2 and G3 were watched RED on
      the product of the branch; M7 to M17 are recorded (E1.S2).
- [ ] Suite, typecheck, lint and build green.
- [ ] The gates of §8 passed: the revised plan, one code round over the whole diff of E1, the own Opus review,
      CodeRabbit.
- [ ] CHANGELOG and research docs say what ships, in the same PR.
- [ ] `plan-lifecycle.mjs` is clean; the summary names the epoch, the count and what was cut.
- [ ] Released after the owner's word; this plan, its stories document and its two specs promoted to `research/` together.

## 8. Build order and merge conditions

1. E1.S1 — built (`3099f5a5`, `895e345b`), unmerged, on `fix/open-terminal-call-key-name`.
2. The re-review (this revision): the Opus judge fills the table of the record; the revised plan goes to the gate by
   the interim path of `plan-change-control.md` (the document review of this file, named as the re-review for epoch
   2) and to the lead's own Opus review; then the line of epoch 2 is written. Not narrowed, so reviewers approve.
   Until then no code of this plan is written.
3. E1.S2 — fix forward on the same branch, on top of `3e8270c1`: no revert and no rewrite of history. Order inside
   the story: the three tests of the world RED, the world repairs, the tests of the product RED, the fix, the
   mutations, the documents (the E1.S2 spec, §8).
4. One code round with `again: true` over the WHOLE diff of E1 (base `19a358d6`), with this revised plan as the plan
   text; the own Opus review of the same diff.
5. One PR for E1. **Merge conditions:** every item of §7 down to the documents; the checks of the head commit exist
   and pass; E1.S1 is not merged or released without E1.S2 (§1.2).
6. Release after the owner's word; then the promotion.

## Epics

One epic with two stories. The split of 2026-11-15 was one epic with one story: the gate's size heuristic said
Medium (two or three epics), and two question consultants and the lead judged that the files of the plan are context
for one change in one function (`keyFile`, `sshSession.ts`), so a split would leave a red state between its parts.
That still holds for E1.S1. The re-review adds E1.S2 to the SAME epic (the question consultants, `576f2936`, both):
it has the same goal (what Connect leaves on disk and in a terminal for a stored key), the same branch and the same
PR, and it is not a part of E1.S1 cut off: E1.S1 is green alone, and E1.S2 is a second change in a second function
(`openKeyTerminal`, `sshConnect.ts`) with tests of its own. The stories are in the stories document [PLAN_open_terminal_key_file_name_E1.md](PLAN_open_terminal_key_file_name_E1.md)
(the document review of the re-review, 2026-11-15). Fable wrote this split and its revision (a security judgement). One epic gives a cornerstone quota of
1; E1.S1 holds it. E1.S2 is security work with a spec by Fable (the row *Security judgement* of
`subagent-models.md`, outside the quota) and is no second cornerstone.

Cornerstones: 1 of 1 — E1.S1 (spec: [PLAN_open_terminal_key_file_name_E1_S1_spec.md](PLAN_open_terminal_key_file_name_E1_S1_spec.md), by Fable, 2026-11-15)

### E1 · The key file of a terminal has a call name, and a terminal keeps one

- **Goal.** No road of `prepareSshSession` writes a key file whose name holds an id: the line that Connect,
  `creds_open_terminal` and the runs over SSH type into a terminal tells no id and no name of a linked key entry. And
  a Connect terminal holds one key file: a call that reuses a live terminal leaves none.
- **Scope.** §2; §3; the documents of §4.
- **Depends on.** Rule C as shipped in 1.21.4 (`materializeCallKey`, `callKeyName`, the scan S1 and S2). Not on PR #365.
- **Done when.** §7 is ticked.
- **Cornerstone area (the one of this plan).** The name of the key file of a session: the one call site in `keyFile`,
  the scan that keeps `sshSession.ts` off the writer list, and the proof of the typed line from the real composition.
  A mistake there is an id of a hidden entry in a terminal that an agent can read, while every other test stays green.
- **Security area outside the quota.** The life of the key file on Connect (`openKeyTerminal`): a mistake there is
  either a decrypted key that stays on disk with no reader, once per call, or a key deleted while the line that names
  it has just been typed.

**Stories.** [PLAN_open_terminal_key_file_name_E1.md](PLAN_open_terminal_key_file_name_E1.md): E1.S1 (cornerstone, built) and E1.S2 (security,
not built).

END OF PLAN
