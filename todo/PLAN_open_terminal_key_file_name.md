# PLAN — the key file of a terminal is named `call-<uuid>.key` (N17)

> Status: **in progress, 2026-11-15.** Scope: the extension only (`src_vs_code/src`): the name of the key file that
> `prepareSshSession` (`sshSession.ts`) writes, its tests, the scan of `keysDirPaths.test.ts`, the docs. Found as N17 of
> [PLAN_agent_refusal_key_file_path.md](../research/PLAN_agent_refusal_key_file_path.md) (§13) by the lead's Opus code
> review on 2026-11-12. Order of the follow-ups advised by the question consultants on 2026-11-15 (consult
> `ad7ce1a5`): N17 first and alone; N16 (three roads of the person leave a key until the purge) is its own next plan.

## 1. Symptom

`creds_open_terminal` calls `connectEntity` (`sshUseActions.ts:377`) → `prepareSshSession` → `keyFile`
(`sshSession.ts:466-479`), which writes the stored key with `materializePrivateKey(storageDir, source.keyEntityId,
source.content, suffix)`: the file is `keys/<pid>/<keyEntityId>.key`, or `<keyEntityId>-<uuid>.key` when `isolate` is
set. `connectEntity` then types `ssh -i "<path>" …` into a VS Code terminal (`sshCommand.ts:232-233`). When the SSH
entry borrows the key of a linked key entry that the agent may not view, the id of that entry is in the terminal's
text. The answer to the agent is `opened` or a fixed sentence, but an agent in the same window with a tool that reads
a terminal can read the id. Rule C (1.21.4) closed this for every caller of `resolveExecAuth`; this road was left out
on purpose (§8 of that plan: "the person's roads keep their names") and recorded as N17.

The same writer serves the person's Connect, a folder run, a linked line run and a dependency run (`sshRoad.ts`,
`dependencyRunHost.ts`). They type the same path into the person's terminal. Nothing reads the name back: every
owner deletes the file it was handed (`openKeyTerminal` on terminal close, `sshConnect.ts:115-129`; `ReadySsh.cleanup()`
for `sshRoad.ts:121`, `:170`, `:178` and `dependencyRunHost.ts:402`), by the path it got, never by a name.

## 2. Fix

One line of product code: `keyFile` calls `materializeCallKey(storageDir, source.content)` (`keyInstaller.ts:175`) for
every road of `prepareSshSession`, with or without `isolate`. The file is `keys/<pid>/call-<uuid>.key`.

- A random name per prepare is already unique, so `isolate`'s suffix is no longer needed for the KEY file; it stays for
  the host-key pin (`known_hosts-<sshEntryId>-<uuid>`, `hostKeyTrust.ts:67`). The pin names the SSH entry that the
  agent asked for, which it may view (N11 of the parent plan: kept).
- Without `isolate` two Connects of one entry shared `<id>.key`; each now gets its own file, and each owner still
  deletes only its own. The first terminal's close no longer deletes the file of the second (a small improvement, not
  a goal).
- `materializePrivateKey` keeps its `suffix` parameter: after this plan no product caller passes one. Removing it
  touches the lines that the open bridge PR #365 changes in `keyInstaller.ts`, so it waits for #365 (follow-up F1).
- No change to `keyInstaller.ts`, `materializedKeys.ts`, `sshConnect.ts`, `sshRoad.ts` or any purge.

## 3. Tests (RED first)

Each new or changed assertion is watched RED on today's code before the fix, then GREEN.

1. **T-N17a, `sshSession.test.ts`:** an SSH entry with a LINKED stored key whose key entry id reads like a name
   (`hid-key-8f3k2`, different from the SSH entry's id): `materializedKeyPath`'s basename matches
   `/^call-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.key$/` and does not contain the key entry id.
   Read from the world's own list of written files, not guessed. RED today (`hid-key-8f3k2.key`).
2. **T-N17b, the terminal text:** through `connectEntity` with the same linked key, the text sent to the terminal holds
   `-i` followed by the written path (positive first), and holds neither the key entry id nor its name. Placed in the
   existing world of `connectEntity` (`sshConnectWorld.ts`) or of the agent's terminal action, whichever already
   records `sendText`; the coder names which. RED today.
3. **T20 (`sshSession.test.ts:326`)** keeps its four-distinct-files claim; its key regex `/\/k1-[0-9a-f-]{36}\.key$/`
   becomes the `call-<uuid>.key` regex; the pin regex `known_hosts-e1-<uuid>` stays.
4. **T21 (`sshSession.test.ts:357`)** "a non-isolated prepare writes today's names": the key is now `call-<uuid>.key`
   (not `KEY`); the pin and "no suffix asked of the known_hosts writer" stay. Renamed to say what it now proves.
5. Every other assertion on `KEY` (`/storage/keys/k1.key`) in `sshSession.test.ts` and its world: the stub of the
   writer answers through `materializeCallKey`; assertions compare with the path the stub returned, not a literal.
6. **The scan S1/S2, `keysDirPaths.test.ts`:** `sshSession.ts` leaves `WRITER_LIST`; the "exactly three files" test
   (`:140`) becomes exactly two (`keyInstaller.ts`, `transportFactory.ts`) and its name says two. RED: with the list
   changed first, S1 fails at `sshSession.ts:472`; GREEN after the fix.
7. **Mutation check (by hand, recorded in the PR):** put `materializePrivateKey(storageDir, source.keyEntityId, …)`
   back → T-N17a, T-N17b and S1 fail.
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
- [ ] T-N17a, T-N17b and the scan watched RED, then GREEN; the mutation of §3.7 recorded.
- [ ] Suite, lint, build green; coai gate on plan and code; own Opus review; CodeRabbit.
- [ ] CHANGELOG and research docs updated in the same PR.
- [ ] Released after the owner's word; this plan promoted to `research/`.

END OF PLAN
