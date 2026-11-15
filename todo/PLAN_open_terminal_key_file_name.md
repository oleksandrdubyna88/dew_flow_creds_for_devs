# PLAN — the key file of a terminal is named `call-<uuid>.key` (N17)

> Status: **in progress, 2026-11-15.** Scope: the extension only (`src_vs_code/src`): the name of the key file that
> `prepareSshSession` (`sshSession.ts`) writes, its tests, the scan of `keysDirPaths.test.ts`, the docs. Found as N17 of
> [PLAN_agent_refusal_key_file_path.md](../research/PLAN_agent_refusal_key_file_path.md) (§13) by the lead's Opus code
> review on 2026-11-12. Order of the follow-ups advised by the question consultants on 2026-11-15 (consult
> `ad7ce1a5`): N17 first and alone; N16 (three roads of the person leave a key until the purge) is its own next plan.

## Plan changes

> Epoch 1 · approved 2026-11-15 · by reviewers · state: open

- 1.1 · 2026-11-15 · reviewer · approach — Fable's spec found that the real `openSshTerminal` reuses a live terminal
  of the entry and types nothing (`terminalManager.ts:51-57`): after the fix each extra Connect of a live session writes
  one more `call-<uuid>.key` that no `ssh` reads, kept until that terminal closes (today one path is rewritten). §2
  says so; guard G1 is added to §3. (The round's accepted finding, T-N17c, and the spec consult's points were folded in
  at the round's resolve, before approval, and are not entries. The line numbers, the file list of §3.5 and the two S1
  sites are repairs.)

## 1. Symptom

`creds_open_terminal` calls `connectEntity` (`sshUseActions.ts:377`) → `prepareSshSession` → `keyFile`
(`sshSession.ts:465-480`), which writes the stored key with `materializePrivateKey(storageDir, source.keyEntityId,
source.content, suffix)`: the file is `keys/<pid>/<keyEntityId>.key`, or `<keyEntityId>-<uuid>.key` when `isolate` is
set. `connectEntity` then types `ssh -i "<path>" …` into a VS Code terminal (`sshCommand.ts:232-233`). When the SSH
entry borrows the key of a linked key entry that the agent may not view, the id of that entry is in the terminal's
text. The answer to the agent is `opened` or a fixed sentence, but an agent in the same window with a tool that reads
a terminal can read the id. Rule C (1.21.4) closed this for every caller of `resolveExecAuth`; this road was left out
on purpose (§8 of that plan: "the person's roads keep their names") and recorded as N17.

The same writer serves the person's Connect, a folder run, a linked line run and a dependency run (`sshRoad.ts`,
`dependencyRunHost.ts`). They type the same path into the person's terminal. Nothing reads the name back: every
owner deletes the file it was handed (`openKeyTerminal` on terminal close, `sshConnect.ts:117-134`; `ReadySsh.cleanup()`
for `sshRoad.ts:121`, `:170`, `:178`, `dependencyRunHost.ts:402` and `commands/folderRunCommand.ts:280`), by the path it got, never by a name.

## 2. Fix

One line of product code: `keyFile` calls `materializeCallKey(storageDir, source.content)` (`keyInstaller.ts:175`) for
every road of `prepareSshSession`, with or without `isolate`. The file is `keys/<pid>/call-<uuid>.key`. `keyFile` loses
its `suffix` parameter (it has no use for one), so the writer of the key cannot be handed a name part (a question
consultant, 2026-11-15). The solved instance to copy is `byStoredKey` of `sshExecAuth.ts`.

- A random name per prepare is already unique, so `isolate`'s suffix is no longer needed for the KEY file; it stays for
  the host-key pin (`known_hosts-<sshEntryId>-<uuid>`, `hostKeyTrust.ts:67`). The pin names the SSH entry that the
  agent asked for, which it may view (N11 of the parent plan: kept).
- Without `isolate` two Connects of one entry shared `<id>.key`; each now gets its own file, and each owner still
  deletes only its own. The first terminal's close no longer deletes the file of the second (a small improvement, not
  a goal).
- `materializePrivateKey` keeps its `suffix` parameter: after this plan no product caller passes one. Removing it
  touches the lines that the open bridge PR #365 changes in `keyInstaller.ts`, so it waits for #365 (follow-up F1).
- A second Connect while the entry's terminal lives opens no terminal and types nothing (`terminalManager.ts:51-57`),
  but `prepareSshSession` has written a key: one more `call-<uuid>.key` per such click, deleted when that terminal
  closes (change 1.1). Bounded by the clicks of one session; not fixed here (N16 is the plan for key lifetimes).
- No change to `keyInstaller.ts`, `materializedKeys.ts`, `sshConnect.ts`, `sshRoad.ts` or any purge.

## 3. Tests (RED first)

Each new or changed assertion is watched RED on today's code before the fix, then GREEN.

1. **T-N17a, `sshSession.test.ts`:** an SSH entry with a LINKED stored key whose key entry id reads like a name
   (`hid-key-8f3k2`, different from the SSH entry's id): `materializedKeyPath`'s basename matches
   `/^call-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.key$/` and does not contain the key entry id.
   Read from the world's own list of written files, not guessed. RED today (`hid-key-8f3k2.key`).
2. **T-N17b, the terminal text:** through `connectEntity` with the same linked key, the text sent to the terminal holds
   `-i` followed by the written path (positive first), and holds neither the key entry id nor its name. The text must
   come from the REAL command composition (`openSshTerminal` / `buildSshCommand` of `terminalManager.ts`), not from
   `sshConnectWorld.ts`'s fake of `openSshTerminal` (`:200-213`), which records arguments and composes nothing (a
   question consultant, 2026-11-15, verified by reading). The spec names the world. RED today.
2a. **T-N17c, two lifetimes (accepted from the plan round, codex):** two NON-isolated Connects of one entry with a
   stored key, each with its own terminal handle: two distinct `call-<uuid>.key` paths; closing the first terminal
   deletes the first path only; the second path is deleted when its own terminal closes. `sshConnectWorld.ts` hands
   back one `opened` object today, so the world needs one handle per open. T20 covers isolated prepares only and is
   no substitute. RED today (one shared `<id>.key`: both closes name the same path).
2b. **G1, a guard (change 1.1):** a second Connect of a live session opens no terminal and types nothing; every
   written file is forgotten when that terminal closes, and none before. Green before and after.
3. **T20 (`sshSession.test.ts:326`)** keeps its four-distinct-files claim; its key regex `/\/k1-[0-9a-f-]{36}\.key$/`
   becomes the `call-<uuid>.key` regex; the pin regex `known_hosts-e1-<uuid>` stays.
4. **T21 (`sshSession.test.ts:357`)** "a non-isolated prepare writes today's names": the key is now `call-<uuid>.key`
   (not `KEY`); the pin and "no suffix asked of the known_hosts writer" stay. Renamed to say what it now proves.
5. Every other assertion on `KEY` (`/storage/keys/k1.key`) in `sshSession.test.ts`, `sshConnect.test.ts` and
   `sshConnectRemote.test.ts` (L1-L11 of the spec) and the worlds' `./keyInstaller` fakes: the stub of the writer
   answers through `materializeCallKey` (added to the fake FIRST, or the fixed product answers `key-write-failed`); assertions compare with the path the stub returned, not a literal.
6. **The scan S1/S2, `keysDirPaths.test.ts`:** `sshSession.ts` leaves `WRITER_LIST`; the "exactly three files" test
   (`:140`) becomes exactly two (`keyInstaller.ts`, `transportFactory.ts`) and its name says two. RED: with the list
   changed first, S1 fails at `sshSession.ts:13` (the import) and `:472`; GREEN after the fix.
7. **Mutation check (by hand, recorded in the PR):** put `materializePrivateKey(storageDir, source.keyEntityId, …)`
   back → T-N17a, T-N17b, T-N17c, T20, T21, the L rows and S1 fail (M1-M6 of the spec).
8. The whole extension suite (`npm test` in `src_vs_code`), lint and the build green before the PR.

## 4. Docs

- `src_vs_code/CHANGELOG.md` `[Unreleased]`: `### Changed — security: the key file of a terminal` — the key file that
  Connect, `creds_open_terminal` and the runs over SSH write is named `call-<uuid>.key`, so the text typed into a
  terminal holds no id of a linked key entry.
- `research/module_extension.md`: the *Rule C* paragraph (every writer of a stored SSH key for a session or a call uses
  `materializeCallKey`; only the deploy key of git sync keeps an id name) and the `prepareSshSession` table if it names
  the file.
- `research/module_tests.md`: T-N17a, T-N17b, the scan's list of two.
- The parent plan's §13 N17 line gets "fixed in <version>, PLAN_open_terminal_key_file_name.md" at promotion (a
  research document; appended, not rewritten).
- `todo/README.md`: a row for this plan; removed at promotion.

## 5. Out of scope

- N16 (the three roads of `agentCommands.ts` that never delete their file): its own plan, next.
- The `known_hosts-<id>` and `agent-script-<id>` names (they hold the id of the entry that was asked for, which the
  caller may view).
- The text of the operating system in a failed write (Q1 of the parent plan, kept by the owner).

## 6. Follow-ups

- F1: after #365 merges, drop the `suffix` parameter of `materializePrivateKey` (no product caller passes it).

## 7. Definition of Done

- [ ] No road of `prepareSshSession` writes a key file whose name holds an id; `sshSession.ts` is off `WRITER_LIST`.
- [ ] T-N17a, T-N17b, T-N17c and the scan watched RED, then GREEN; the mutation of §3.7 recorded.
- [ ] Suite, lint, build green; coai gate on plan and code; own Opus review; CodeRabbit.
- [ ] CHANGELOG and research docs updated in the same PR.
- [ ] Released after the owner's word; this plan promoted to `research/`.

## Epics

One epic with one story. The gate's size heuristic said Medium (two or three epics). It does not fit: the files that
the plan names are context for one change in one function (`keyFile`, `sshSession.ts`), and a split would leave a red
state between its parts (the scan of §3.6 is red until the fix, and the fix is red until the test world and the
literal assertions of §3.5 change). Two question consultants and the lead judged one epic with one story right
(2026-11-15). The story is here, not in a stories document of its own, as for a plan this size. Fable wrote this
split (a security judgement). One epic gives a cornerstone quota of 1.

Cornerstones: 1 of 1 — E1.S1 (spec: [PLAN_open_terminal_key_file_name_E1_S1_spec.md](PLAN_open_terminal_key_file_name_E1_S1_spec.md), by Fable, 2026-11-15)

### E1 · The key file of a terminal has a call name

- **Goal.** No road of `prepareSshSession` writes a key file whose name holds an id: the line that Connect,
  `creds_open_terminal` and the runs over SSH type into a terminal tells no id and no name of a linked key entry.
- **Scope.** §2; §3 items 1 to 8, 2a and 2b; the documents of §4.
- **Depends on.** Rule C as shipped in 1.21.4 (`materializeCallKey`, `callKeyName`, the scan S1 and S2). Not on PR #365.
- **Done when.** §7 is ticked.
- **Cornerstone area (the one of this plan).** The name of the key file of a session: the one call site in `keyFile`,
  the scan that keeps `sshSession.ts` off the writer list, and the proof of the typed line from the real composition.
  A mistake there is an id of a hidden entry in a terminal that an agent can read, while every other test stays green.

**Story.**

- **E1.S1 · The call name on every road of `prepareSshSession`** (cornerstone: security; spec by Fable, code by
  Sonnet, review by Opus). The scan with its list of two, the new member and the real-terminal switch of the test
  world, T-N17a, T-N17b and T-N17c watched RED, T20 and T21, the literal assertions, the fix in `sshSession.ts`, the
  mutation checks, and the documents of §4. The spec is the file linked in the ledger line above.

END OF PLAN
