# PLAN — E1.1 spec: rule C, the name of a call file (CORNERSTONE)

> Status: **built on the branch, unmerged, 2026-11-12** (`8517c1ff`, `bd8285d6`; pull request #359). Cornerstone spec, written 2026-11-12 by Fable, before its code. Story E1.1 of
> [PLAN_agent_refusal_key_file_path.md](PLAN_agent_refusal_key_file_path.md) (its §4.1 rows C1, C2, C3 and C5, §5 steps 1 to 6, §6.1 to
> §6.5, `## Epics` E1). The stories document of the epic is `todo/PLAN_agent_refusal_key_file_path_E1.md`; Opus writes it, and it marks
> this story in the cornerstone ledger of the parent. This file is promoted together with the parent and that document.
>
> Scope: `src_vs_code/src` — `materializedKeys.ts` (one new export), `keyInstaller.ts` (one new export), `sshExecAuth.ts` (one call
> site and two imports), and tests: `test/keysDirPaths.test.ts`, one new suite `test/agentKeyPath.test.ts`, `test/secondEntryWorld.ts`,
> `test/bridgeLinksWorld.ts`, `test/bridgeLinks.test.ts`, `test/sshExecAuth.test.ts`, `test/materializedKeys.test.ts`,
> `test/keyInstaller.test.ts`, and the new member of the other test worlds. A worktree of the branch
> `fix/agent-refusal-key-file-path` at `e44d17da`, base `main` at `6dd96fe7`. Each `file:line` below was read on `e44d17da`.
> Fable writes this spec, a Sonnet coder builds it, Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan that this document links
above. A row name (S1, S2, C1 to C5, K1 to K6, U1 to U3, G1 to G9) is the parent's. Names that start with F, P or B are this
document's own. This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`).

## What E1.1 builds, in one paragraph

An agent's SSH call writes a stored key to a file. Today the name of the file starts with the id of the key entry
(`sshExecAuth.ts:162`). The path can reach the agent in three ways: (a) the write fails, (b) the run fails, (c) `ssh` prints the path.
E1.1 gives the file a random name, `call-<uuid>.key`. One function makes the name (`callKeyName`, C1). One function writes the file
(`materializeCallKey`, C2). One call site changes (C3). A scan keeps other writers out (S1, S2). Part C of the class test proves the
three ways on three doors (`creds_exec`, `creds_rotate` on an SSH entry, a linked `creds_run`). No sentence, code, status or body
shape changes. The comments of C4 and the documents are E1.2.

## Binding constraints

- **No plan change.** Epoch 1 of the parent holds one change (1.1). A second accepted change of scope, goals, the Definition of
  Done, the build order, the tests or the approach stops the whole plan. Build what the parent and this document say. If a step
  cannot be done as written, or you find a new site or a new caller: stop and tell the lead. Do not repair the parent.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first. So the new symbols exist as no-ops
  (step 2) before a test names them (step 3). Read the exit of `tsc` before any test result.
- **Keep what the runner printed.** Save each RED text in the scratchpad folder of the session, and quote it in the commit body. A
  restart of the PC empties the scratchpad; the commit body stays.
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): a file has at most 800 lines, a function at most 50 code lines (120 in
  `src/test/`), complexity at most 4 (also in tests). No new `eslint-disable`. `src_vs_code/tsconfig.json:11-12` has `noUnusedLocals`
  and `noUnusedParameters`: a mock declares only the parameters that it reads.
- **Files with no change in E1.1:** `sshUseActions.ts`, `agentUseActions.ts`, `rotateAction.ts`, `commands/agentCommands.ts`,
  `sshSession.ts`, `transportFactory.ts`, `hostKeyTrust.ts`, `agentNaming.ts`, `mcpEntries.ts`,
  `test/agentNamesOnlyViewable.test.ts`. Nothing in `contract/`, `src_mcp`, `src_cli` or `src_broker_client`. `SshUseDeps` and
  `AgentUseDeps` get no new member.
- **The three roads of the person** (`commands/agentCommands.ts:217`, `:287`, `:437`) call `resolveExecAuth`, and its signature
  does not change (`sshExecAuth.ts:116-122`). So C3 renames their key files too, with no edit there (the parent's change 1.1).
- **Node only.** No Python, also not for a helper script. Write documents with the Edit or Write tool, not with a shell heredoc.

## Facts read on `e44d17da` that this spec uses

| # | Fact | Where |
|---|---|---|
| F1 | The one call site. `crypto` is used at `:162` only (the import is `:1`). `keyEntityId` is read at `:162` only. The import at `:7` also brings `writeAskpassScriptFile`, which `:91` still uses | `sshExecAuth.ts` |
| F2 | The module imports `node:path`, `node:child_process` and `./fileAcl` (`:1-3`). It imports no `node:crypto` and no `vscode`. A test can import it with no stub (`test/materializedKeys.test.ts:5`) | `materializedKeys.ts` |
| F3 | The module imports `vscode` (`:5`). It imports four names from `./materializedKeys` in one block (`:9-14`) and exports them again (`:19`). The writer is `:149-166`: it writes, sets the mode and calls `lockToOwner` (`:162-164`). A test loads it with `loadWithVscode` (`test/keyInstaller.test.ts:46-81`) | `keyInstaller.ts` |
| F4 | The identifier `materializePrivateKey` is in the product source (tests apart) 8 times in 4 files. One is in a comment (`keyInstaller.ts:25`). The 7 others: `keyInstaller.ts:149`; `sshSession.ts:13`, `:472`; `transportFactory.ts:7`, `:286`; `sshExecAuth.ts:7`, `:162` | `grep -rnw materializePrivateKey src --include=*.ts --exclude-dir=test`, in `src_vs_code` |
| F5 | The world of part B replaces four I/O edges (`:174-194`). Its key writer makes a REAL file `<dir>/<id>.key`, where `<dir>` is the storage folder itself, and it pushes to `materialised` only AFTER the write (`:177-182`). Its stand-in of `./hostKeyTrust` writes no pin file (`:185`). Its runner answers exit code 0 and `ok` (`:186-191`). The hidden ids are made in `hiddenIdsOf` (`:197-201`); `leaks` reads them (`:282`). The doors are at `:267-274` | `test/secondEntryWorld.ts` |
| F6 | A rotation stores the new value only when the statement answers 200 and exit code 0 (`:478-484`). Then it answers `stdout` only (`:391`). In each other case it hands the answer of the inner `ssh:exec` on as it came (`:187-190`), with the new value masked in the top-level text fields (`:212-214`; `secretMasker.ts:151-163`) | `rotateAction.ts` |
| F7 | A linked run hands the answer of `overSsh` on as it came (`agentUseActions.ts:425-435`). `call.ssh` is the SSH entry, so the pin file of a linked run has the id of the SSH entry (`sshUseActions.ts:219`, `:254-258`; `hostKeyTrust.ts:66-68`, `:93`) | the three files |
| F8 | Off a bridge a refusal with no `second` passes its sentence with no change (`:135-152`). Way (a) is `:196-198`. Way (b) is `:290-291`. The 200 body of way (c) is `:287-289`. The key file is removed at `:293` | `sshUseActions.ts` |
| F9 | The key path is the word after `-i` (`:159-161`). A pin file is the value of `-o UserKnownHostsFile=<file>` (`:146-148`) | `sshExecCommand.ts` |
| F10 | A module that is not in `mocks` loads for real under the stub (`test/vscodeStub.ts:56-61`). `hostKeyTrust.ts` imports `vscode` (`:3`) and `runBounded` of `./sshExecRunner` (`:4`); only `scanHostKey` reads `runBounded` (`:46`). So the real `materializeKnownHosts` (`:80-98`) works in a world that replaces `./sshExecRunner` | the two files |
| F11 | The world of the bridge links: the key writer is `:91-99`, and its `writeFails` throws `EACCES: permission denied, open '<dir>/<id>.key'` (`:92-94`). The runner is `:104-110`; its `stderr` is the fixed text `o.stderr` (`:109`). The deps have a `bridgedSshConfig` (`:131-135`), so a bridged call runs in this world (`test/bridgeLinks.test.ts:50-66`) | `test/bridgeLinksWorld.ts` |
| F12 | `withoutComments(source)` removes comments by the compiler's scanner and keeps each line break (`test/importWalk.ts:101-103`; `test/importWalk.test.ts:42-46`). A string that holds `//` is not a comment for it | the two files |
| F13 | The worktree has no `src_vs_code/node_modules` and no `src_vs_code/out`. The mount `.agents/conventions` has its modules | `ls` |
| F14 | The branch differs from `main` (`6dd96fe7`) in the plan file only. Between the parent's commit `b95282f1` and `e44d17da`, 15 files of `src_vs_code/src` changed by one replaced line each; no line moved | `git diff --stat` |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `npm ci` (one time; F13).
2. `node $LP npm run compile` — **read its exit first.** A test result after a failed `tsc` is the result of old files.
3. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
4. `node $LP npm run typecheck`
5. `node $LP npm run lint`
6. `npm test` — the full suite (it compiles first and lowers itself).

The closing checks (`npm run contract`, `plan-lifecycle.mjs`, `pin-check.mjs`) are E1.2's.

## 1. Files and functions

| File | Thing | Step | Change |
|---|---|---|---|
| `test/keysDirPaths.test.ts` | the scan S1 and its companion S2 | 1 | two new tests, one new import |
| `materializedKeys.ts` | `callKeyName()` (C1) | 2 | one new export, one new import (`node:crypto`) |
| `keyInstaller.ts` | `materializeCallKey(storageDir, content)` (C2) | 2 | one new export, one name more in the import block `:9-14` |
| ten sites in eight test files | the new member `materializeCallKey` of each world (C5) | 2 | §3 |
| `test/secondEntryWorld.ts` | four options and the list `attempted` | 3 | §4 |
| `test/agentKeyPath.test.ts` (new) | part C: the fixture proof, K1, the nine cells (K2 to K4), G5 | 3 | §5 |
| `test/sshExecAuth.test.ts:70-82` | the test becomes K5 | 3 | §6 |
| `test/bridgeLinksWorld.ts`, `test/bridgeLinks.test.ts` | the option `printsKeyPath`; K6 after `:188` | 3 | §4, §6 |
| `sshExecAuth.ts:1`, `:7`, `:162` | the fix C3 | 4 | §7 |
| `test/materializedKeys.test.ts`, `test/keyInstaller.test.ts` | U1; U2 and U3 | 5 | §8 |

**C1, exact.** In `materializedKeys.ts`, the first import line is new: `import * as crypto from 'node:crypto';`. The function goes
after `safeFileComponent` and `nameDigest`, before `materializedKeyPath` (`:99`):

```ts
export function callKeyName(): string {
  return `call-${crypto.randomUUID()}`;
}
```

It takes no argument. So no data of the vault can arrive in it. Its docblock says rule C in two sentences: the name of a call file
holds no id and no name of an entry; it is random.

**C2, exact.** In `keyInstaller.ts`, directly after `materializePrivateKey` (after `:166`):

```ts
export function materializeCallKey(storageDir: string, content: string): string {
  return materializePrivateKey(storageDir, callKeyName(), content);
}
```

`callKeyName` is added to the import block of `./materializedKeys` (`:9-14`). It is NOT added to the export line `:19`: no caller
needs it from this module, and a test imports it from `../materializedKeys`. The function has no parameter for an id. The file is
`<storageDir>/keys/<pid>/call-<uuid>.key` (the same folder, modes and `lockToOwner` as `:155-165`). Its docblock says: the writer of
a key file of one call of an agent, or of a road that shares `resolveExecAuth`.

**Size.** No file comes near a limit. At most: `materializedKeys.ts` 114 → 130, `keyInstaller.ts` 292 → 310, `sshExecAuth.ts` 167 →
166, `test/secondEntryWorld.ts` 288 → 350, `test/agentKeyPath.test.ts` 200, `test/keysDirPaths.test.ts` 89 → 150,
`test/bridgeLinksWorld.ts` 200 → 220, `test/bridgeLinks.test.ts` 472 → 500.

## 2. Step 1 — the scan S1 and S2, in `test/keysDirPaths.test.ts`

Written first, on the unchanged `src` code. It uses `sourceFiles(SRC)` of the same file (`:30-37`): each `.ts` file of `src` and of
each folder under it, the folder `test` apart. New import: `import { withoutComments } from './importWalk';` (F12).

**The scan.** For each file: read the source, remove the comments with `withoutComments`, and find each match of
`/\bmaterializePrivateKey\b/g`. Each match is one site:

- `file`: the path relative to `SRC`, with `/` (for example `commands/x.ts`). Not the base name: a file of the same name in a folder
  must not pass as a file of the list.
- `line`: the number of line breaks before the match, plus 1. It is the line of the source (F12).
- `text`: that line of the source, trimmed.
- `call`: `true` when the next characters after the match are optional white space and `(`. Read it from the text after the match,
  not from the line, so a `(` on the next line is found.

So a site is a call, the definition, an import, an import with `as` (the first name is the identifier), a member of a namespace
import, a re-export, or a string that holds the name. Comments and tests are apart.

**The written list**, a constant of the test, `file → reason`:

| File | Reason (the text in the test) |
|---|---|
| `keyInstaller.ts` | the writer itself, and `materializeCallKey`, which gives it a random name |
| `sshSession.ts` | the person's Connect and the person's roads: the path goes into the person's terminal or a dialog, no agent reads it |
| `transportFactory.ts` | the deploy key of the vault's git sync: no action of an agent imports this module |

**S1**, test name: `only the written files name materializePrivateKey: a key file of a call is written by materializeCallKey`. It
takes the sites whose `file` is not a key of the list. It asserts that the list of their lines is `[]`:
`` assert.deepEqual(offenders.map((s) => `${s.file}:${s.line}  ${s.text}`), [], <message>) ``. The format is the one of `:76`. The message: `A key file of a call is written with materializeCallKey() of keyInstaller.ts: its name
holds no id of an entry (rule C). A new caller of materializePrivateKey needs a decision in the plan, not a new name on this list.`

**S2**, test name: `the scan of the writer would notice: the list is exactly three files, and the scan finds a call in each`. Two
assertions, in this order:

1. The comparison: `assert.deepEqual(Object.keys(LIST).sort(), ['keyInstaller.ts', 'sshSession.ts', 'transportFactory.ts'])`. A fourth
   name fails here.
2. Each file of the list has at least one site with `call === true`. A change of formatting that makes the scan match nothing fails
   here.

**The first run** (compile, then the one suite). It must show this, and no more:

- S1 fails. The failure names exactly two sites, both in one file: `sshExecAuth.ts:7` (the import) and `sshExecAuth.ts:162` (the
  call). No other file.
- S2 passes. The two old tests of the file pass.
- The definition `export function materializePrivateKey(` at `keyInstaller.ts:149` is an occurrence too. In state 1 it is the one occurrence in `keyInstaller.ts` (C2 is not there yet), so S2 passes for that file only because of it. Do not make the scan skip a definition.

Save the text. Then run the `grep` of F4 and write its 8 lines into the summary, compared with the parent's §4.3: `keyInstaller.ts`,
`sshSession.ts` and `transportFactory.ts` are on the list; `sshExecAuth.ts` is the defect. **A site in another file stops the work:**
tell the lead (the parent's §5 step 1 calls it a plan change).

**What S1 does not find** is in the parent's §6.3. The docblock of the two tests says it in three lines: a name that is built at run
time; a new call inside a file of the list; the other writers that name a file from an id through `materializedKeyPath`.

## 3. Step 2 — the no-op step: C1, C2 and C5

Add C1 and C2 (§1). They have no caller in the product. Then add the new member to each test world that replaces `./keyInstaller`
and loads `sshExecAuth.ts` (directly, or through `sshUseActions.ts`).

**The copy rule.** The new member `materializeCallKey(dir, content)` does what its sibling `materializePrivateKey` does in that
world: the same records, the same real file, the same throw, the same `writeFails`. Only the name differs. Where the sibling builds
a name from its `id` argument, the new member takes the name from the REAL function: `import { callKeyName } from '../materializedKeys';`
(a plain import, F2). Never a name that the test made up. Where the sibling builds no name (a fixed text, an empty text, a throw),
the new member gives the same fixed text or the same throw. Where the two members can share one helper, write the helper: then they
cannot differ.

| # | Site | The sibling does | The new member does |
|---|---|---|---|
| 1 | `test/sshUseActions.test.ts:122-132` (member `:125-130`) | a REAL file `<dir>/<id>.key`; pushes to `log.materialised`; gives the path | the same, with `callKeyName()` in the place of `id` |
| 2 | `test/sshExecAuth.test.ts:42-51` (member `:43-46`) | `writes.push('key:' + name)`; gives `<dir>/<name>` (no `.key`, joined with `/`) | the same record and the same shape of path, with `callKeyName()` as `name`. It declares `dir` only |
| 3 | `test/sshExecAuth.test.ts:165-170` (member `:166-168`) | throws `new Error('EACCES: read-only file system')` | the same throw |
| 4 | `test/bridgeLinksWorld.ts:90-101` (member `:91-99`) | with `writeFails`: throws `EACCES: permission denied, open '<dir>/<id>.key'`; else a REAL file, and pushes to `materialised` | the same two branches, with `callKeyName()` in the place of `id` |
| 5 | `test/secondEntryWorld.ts:176-184` (member `:177-182`) | a REAL file `<dir>/<id>.key`; pushes to `materialised` | the same, with `callKeyName()` |
| 6 | `test/sshExecOver.test.ts:83-91` (member `:84-89`) | a REAL file; pushes to `materialised` | the same, with `callKeyName()` |
| 7 | `test/brokerAbandoned.test.ts:557` | gives the fixed text `'/k'` | gives `'/k'` |
| 8 | `test/pinClickPaths.test.ts:256-264` (member `:258-261`) | `written.push(content)`; gives `<dir>/<name>` | the same record, with `callKeyName()` as `name` |
| 9 | `test/pinReaders.test.ts:139` | gives `''` | gives `''` |
| 10 | `test/pinReaders.test.ts:400-408` (member `:402-405`) | `materialized.push(content)`; gives `<dir>/<name>` | the same record, with `callKeyName()` as `name` |

Ten sites in eight files (the parent writes "11 sites in 9 files"; see the notes for the lead). Method: `grep -n "'./keyInstaller'"`
over `src_vs_code/src/test`, then the module that each site loads. Not on the list, because their writer does not change:
`test/sshConnectWorld.ts:156` (it loads `sshSession.ts`), `test/transportFactory.test.ts:182` (it loads `transportFactory.ts`),
`test/pinClickPaths.test.ts:104` (the key `'../keyInstaller'` of `commands/entityCommands.ts`).

**Why the same records matter.** Site 8 is reached after the fix: `test/pinClickPaths.test.ts:270` asserts that the opened key was
written. A new member that records nothing makes that test red. Site 10 is never reached: `test/pinReaders.test.ts:412` asserts
that nothing was written. A new member that records nothing there makes the guard pass and test nothing. The review reads the two
members of each site side by side.

**Then:** `npm run typecheck` is clean. `npm test` shows the failure of step 1 (S1, the two sites) and no other. A world that this
list misses shows in step 4 as a `TypeError` (`materializeCallKey is not a function`): add the member by the copy rule and tell the
lead.

## 4. Step 3, the worlds — the options of part C, and the option of K6

### 4.1 `test/secondEntryWorld.ts`

Four new members of `SecondOptions` (`:48-61`); each default is `false` (`:203`). One new list of `SecondWorld` (`:66-89`):
`attempted`. One new export: `SSH_SAYS`.

| Option | What the edge of the world does |
|---|---|
| `writeFails` | The key writer throws what Node throws for a failed `open`: `EACCES: permission denied, open '<the path that it was asked to write>'`. It records that path in `attempted` BEFORE it throws. It writes no file and pushes nothing to `materialised` |
| `startFails` | The runner records the argv in `spawned`, then rejects with `new Error('spawn ssh ENOENT; the argv was: ' + argv.join(' '))`. The text holds the WHOLE argv. This is a stand-in for the worst case: Node's own message of a failed start holds the program and a code, and no argv (the parent's §1.2) |
| `sshPrints` | The runner records the argv, then answers `{ exitCode: 255, stdout: '', stderr, timedOut: false }`. `stderr` is built from the argv that it got (below). **Exit code 255, not 0:** on the `rotate` door an exit code 0 goes into the store and the answer drops `stderr` (F6) |
| `pinned` | `e1` gets a pinned host key: `hostKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY'` (the key of `test/hostKeyTrust.test.ts:26`), added in `e1Of` (`:101-109`). The map of mocks holds NO `./hostKeyTrust` entry, so the REAL `materializeKnownHosts` writes `<storageDir>/keys/<pid>/known_hosts-e1` (F10). Without `pinned` the stand-in of `:185` stays |

**`attempted`:** each path that the key writer was asked to write, pushed before the write, for a write that works and for a write
that fails. `materialised` keeps its meaning (`:73-74`): the files that were written. With no failure the two lists are equal.

**The key writer, one helper for the two members** (so the copy rule holds by construction):

```ts
const keyWriter = (o: Required<SecondOptions>, log: Log) => (dir: string, name: string, content: string): string => {
  const keyPath = path.join(dir, `${name}.key`);
  log.attempted.push(keyPath);
  if (o.writeFails) {
    throw new Error(`EACCES: permission denied, open '${keyPath}'`);
  }
  fs.writeFileSync(keyPath, content, { mode: 0o600 });
  log.materialised.push(keyPath);
  return keyPath;
};
```

`materializePrivateKey` is `write` itself (`(dir, id, content)`). `materializeCallKey` is `(dir, content) => write(dir, callKeyName(), content)`.
`Log` holds `spawned`, `materialised` and `attempted`; `mocksOf` (`:174`) takes `o`, `storageDir` and `log`.

**What the pretended `ssh` prints.** One exported constant, so that a test does not type the texts again:

```ts
export const SSH_SAYS = {
  notAccessible: (file: string): string => `Warning: Identity file ${file} not accessible: No such file or directory.`,
  loadKey: (file: string): string => `Load key "${file}": invalid format`,
  pin: (file: string): string => `Offending ED25519 key in ${file}:1`,
} as const;
```

`stderr` is these lines, joined with `\n`: `notAccessible(key)`, `loadKey(key)`, and `pin(value)` when the argv has a word that
starts with `UserKnownHostsFile=`. `key` is the word after `-i` of the argv that the runner got. `value` is the text after
`UserKnownHostsFile=`. No part of `stderr` is a fixed path: each path comes from the argv that the product built.

Keep each function at complexity 4 or less: the writer, the runner and the text of `stderr` are three small functions.

### 4.2 `test/bridgeLinksWorld.ts` — the option of K6

One new member of `LinksOptions` (`:22-42`): `printsKeyPath?: boolean`, default `false` (`:80`). With it, the `stderr` of the runner
(`:109`) is `` `Load key "${argv[argv.indexOf('-i') + 1]}": invalid format` `` in the place of `o.stderr`. The exit code stays 0 and
`stdout` stays `ok\n`, as today. Nothing more changes in the runner.

## 5. Step 3, part C — `test/agentKeyPath.test.ts` (new)

A suite of its own. It runs the REAL actions over `secondEntryWorld`. In each test the world has `key: 'plain'`: `e1` (`prod`)
borrows the key of the hidden entry `hid-key-8f3k2` (`test/secondEntryWorld.ts:43`), and the key works. The three doors:
`const DOORS = ['exec', 'rotate', 'run'] as const;` (`run` is the linked run of `t1`). Each test makes a new world and calls
`w.cleanup()` in a `finally`. The file imports no symbol of the product that is new. Tests are made in loops over `DOORS`, one test
for each door, so the runner shows each cell by its name.

No test guesses a name. A path comes from `w.attempted`, from `w.materialised` or from `w.spawned`.

### 5.1 The fixture proof (3 tests; green before the fix and after it)

Name: `C, the fixture, <door>: with no option the call reaches ssh one time and answers 200, the key entry is hidden, and its id is in no other text`.
World: `{ key: 'plain' }`. One call of the door. Assertions, in this order:

| # | Assertion |
|---|---|
| P1 | `result.status` is 200 (the message is the body as JSON) |
| P2 | `w.spawned.length` is 1 |
| P3 | `w.materialised.length` is 1, and `w.attempted` is deep-equal to `w.materialised` |
| P4 | the argv has `-i`, and the word after `-i` is equal to `w.materialised[0]` |
| P5 | `w.mayView(HIDDEN_ID.key)` is `false` (the product's own `agentMayView`), and `w.mayView('e1')` is `true` |
| P6 | `w.hiddenIds` includes `HIDDEN_ID.key` |
| P7 | `HIDDEN_ID.key` is a part of none of these texts: each value of `VISIBLE_NAME`; `'e1'`, `'t1'`, `'t2'`, `'v1'`; `w.storageDir`; `OWN_KEY`; `LINKED_KEY`; each hidden name but the marker of the key entry itself (`w.names.key`); the body of this answer as JSON |

P7 says: when a cell finds the id in an answer, the id came through the path, not from another text. The method is the one of part
B (`test/agentNamesOnlyViewable.test.ts:483-485`). If P1 or P2 fails on a door, the world is wrong, not the code: tell the lead.

### 5.2 K1 — the argv (3 tests; RED before the fix)

Name: `K1, <door>: no word of the argv holds a hidden id or a hidden name, and the word after -i is the file that was written`.
World: `{ key: 'plain' }`. Assertions, in this order: (1) `w.spawned.length` is 1 and the argv has `-i`; (2) the word after `-i` is
equal to `w.materialised[0]`; (3) `w.spawned[0].flatMap((word) => w.leaks(word))` is `[]`, with the message
`` `${door}: the argv holds ${found.join(' and ')}: ${the word after -i}` ``.

### 5.3 The nine cells — K2, K3, K4 (9 tests; RED before the fix)

Three ways on three doors. One table drives them:

| Way | Row | World options | The text T that is read | The path P of assertion 1 | Status | Code | T starts with |
|---|---|---|---|---|---|---|---|
| (a) the key cannot be written | K2 | `{ key: 'plain', writeFails: true }` | `body.error.message` | `w.attempted[0]`, and `w.attempted.length` is 1 | 500 | `internal` | `Could not write the stored key to disk: ` |
| (b) the run fails | K3 | `{ key: 'plain', startFails: true }` | `body.error.message` | `w.materialised[0]`, and `w.materialised.length` is 1 | 500 | `internal` | `Could not run ssh: ` |
| (c) `ssh` prints the path | K4 | `{ key: 'plain', sshPrints: true }` | `body.stderr` | `w.materialised[0]`, and `w.materialised.length` is 1 | 200 | — | — |

Names: `K2 (a) on <door>: …`, `K3 (b) on <door>: … (a stand-in for the worst case: Node's own message holds no argv)`,
`K4 (c) on <door>: …`. Each name says the three assertions in words.

**In each cell the test asserts, in this order, with `assert` (the first failure is the one that the runner reports):**

1. **The channel is live.** The list of the table has length 1, and T holds P. For (c): T holds `SSH_SAYS.loadKey(P)` and
   `SSH_SAYS.notAccessible(P)`. Read T itself, not the body as JSON (a JSON text changes a `\` of a Windows path). Message:
   `` `${cell}: the channel is not live: the answer does not hold the path of the call file (${P}): ${T}` ``.
2. **The status, the code and the sentence are those of today.** `result.status` is the status of the table. For (a) and (b):
   `body.error.code` is `internal`, and T starts with the sentence of the table. For (c): `body.exitCode` is 255.
3. **0 hidden ids and 0 hidden names.** `assert.deepEqual(w.leaks(JSON.stringify(result.body)), [], message)`, with the message
   `` `${cell}: the answer holds ${found.join(' and ')}: ${T}` ``.

Assertion 1 is the one positive of a file of negative assertions. Without it a cell can pass because the path never reached the
answer.

### 5.4 G5 — the pin file (2 tests; green before the fix and after it)

Name: `G5, <door>: the pin file of the call carries the id of the SSH entry of the call, and the agent may view that entry`. Doors:
`exec` and `run`. World: `{ key: 'plain', sshPrints: true, pinned: true }`. Read `pin`: the text after `UserKnownHostsFile=` in
`w.spawned[0]`. Assertions, in this order: (1) `result.status` is 200 and `pin` is defined; (2) `body.stderr` holds
`SSH_SAYS.pin(pin)` (the channel is live); (3) `path.basename(pin)` is `known_hosts-e1`; (4) `fs.existsSync(pin)` is `true` (the REAL
writer wrote it); (5) `w.mayView('e1')` is `true`; (6) `w.leaks(pin)` is `[]`. On the `run` door the addressed entry is `t1`, and the
pin still has the id of `e1`: the SSH entry that the gate let through (F7). G5 does NOT assert on the whole `stderr`: before the
fix it holds the key path with the hidden id, and G5 must be green before and after.

## 6. Step 3 — the RED rows K1 to K6

Each row is watched FAILING on the base with the no-op step (before C3), by its assertion, then passing after step 4. `<dir>` is
the storage folder of the world. Save what the runner printed.

| Row | File, test | Input | The assertion that fails today | The text that the runner must show today | After the fix |
|---|---|---|---|---|---|
| K1 | `test/agentKeyPath.test.ts`, 3 tests (§5.2) | `{ key: 'plain' }`, one call of each door | assertion 3 | `exec: the argv holds hid-key-8f3k2: <dir>/hid-key-8f3k2-<uuid>.key` (and the same for `rotate` and `run`) | no word holds a hidden id or name; the word after `-i` is `<dir>/call-<uuid>.key` |
| K2 | the same file, 3 cells (§5.3) | `writeFails` | assertion 3 (1 and 2 pass) | `(a) on exec: the answer holds hid-key-8f3k2: Could not write the stored key to disk: EACCES: permission denied, open '<dir>/hid-key-8f3k2-<uuid>.key'` | the same sentence with `…/call-<uuid>.key` |
| K3 | the same file, 3 cells | `startFails` | assertion 3 | `(b) on exec: the answer holds hid-key-8f3k2: Could not run ssh: spawn ssh ENOENT; the argv was: … -i <dir>/hid-key-8f3k2-<uuid>.key …` | the same sentence; the argv in it has `call-<uuid>.key` |
| K4 | the same file, 3 cells | `sshPrints` | assertion 3 | `(c) on exec: the answer holds hid-key-8f3k2: Warning: Identity file <dir>/hid-key-8f3k2-<uuid>.key not accessible: …` | the same two lines of `ssh` with `call-<uuid>.key` |
| K5 | `test/sshExecAuth.test.ts`, the test at `:70-82` | `withCredential({ kind: 'storedKey', keyEntityId: 'deploy-key', content: 'PRIVATE' }, writes)('/store')` | the last part of `keyPath` holds `deploy-key` | `the last part of the key path holds the id of the key entry: deploy-key-<uuid>` | the last part is `call-<uuid>` |
| K6 | `test/bridgeLinks.test.ts`, a new test after `:188` | `both({ printsKeyPath: true }, {}, …)`; one call through the bridge, one through the main port | the last part of the printed path starts with `k1-` | a list of two: `the bridge: the last part of the printed path starts with the id of the key entry: k1-<uuid>.key` and the same for `the main port` | on the two doors the last part is `call-<uuid>.key` |

**K5, exact.** The test at `:70-82` changes in step 3. Its new name: `K5: a stored key is written out under a call name that holds
nothing of the id of the key entry, and the argv is told it is a KEY`. The id of the key entry becomes `deploy-key` (it was `k7`).
The line `:79` goes. In its place: `const last = (auth.keyPath ?? '').split('/').at(-1) ?? '';` then, in this order,
`assert.ok(!last.includes('deploy-key'), <the message of the table>)`, `assert.match(last, /^call-[0-9a-f-]{36}$/)` and
`assert.ok(auth.keyPath?.startsWith('/store/'))`. The lines `:78`, `:80` and `:81` stay. The world of this file gives `<dir>/<name>`
with no `.key` (§3, site 2), so the last part is the name. The test at `:84-91` (G7) keeps `k7` and is not changed.

**K6, exact.** New import: `import * as path from 'node:path';`. In one `both(…)` call, for the two doors in the order
`viaBridge(ww.bridge)`, `viaMain(ww)` (as `:182`): the reply has status 200; `argv` is `lw.runs[<index of the door>].argv`; `keyPath`
is the word after `-i`; `stderr` of the reply is equal to `` `Load key "${keyPath}": invalid format` `` (the text is passed on as it
was returned: L5 stays). Then `last = path.basename(keyPath)`. Collect one line for each door whose `last` starts with `k1-` (the
message of the table), and assert one time that the list is `[]`. Then, for each door, `assert.match(last, /^call-[0-9a-f-]{36}\.key$/)`.
K6 asserts on the last part only: the folder is the world's own, and a short id (`k1`) can be a part of a random folder name by
chance. No existing line of the file changes (§9, G1 to G4).

**The count of step 3.** `npm test` then shows 15 failed tests and no other: S1; K1 (3); the nine cells; K5; K6. The fixture proof
(3) and G5 (2) pass. No failure is a compile error.

## 7. Step 4 — the fix C3, in `sshExecAuth.ts`

Three edits, and no other line:

- `:162` becomes `const keyPath = materializeCallKey(storageDir, source.content);`
- `:7` becomes `import { materializeCallKey, writeAskpassScriptFile } from './keyInstaller';`
- `:1` goes (`import * as crypto from 'node:crypto';`): nothing more uses it there (F1), and `noUnusedLocals` refuses it.

The sentence of `:165`, the two shapes of the answer and the docblock of `:151-155` do not change. The parameter `entity` of
`byStoredKey` stays (`:157` reads it). After the edit the file holds no `keyEntityId` and no `crypto`.

Then: K1 to K6 pass, S1 passes, the full suite is green. If a test fails with `materializeCallKey is not a function`, a world is
missing from §3: add it by the copy rule and tell the lead.

## 8. Step 5 — the unit rows U1 to U3 (each watched passing; a mutation of §10 shows that it can fail)

| Row | File | Test name | Assertions |
|---|---|---|---|
| U1 | `test/materializedKeys.test.ts` (`callKeyName` is added to the import at `:5`) | `U1: a call name is call- and a random uuid, new for each call, and the sanitiser gives it back with no change` | `first` and `second` are two calls. `first` matches `/^call-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`; `first !== second`; `safeFileComponent(first) === first`; `callKeyName.length === 0` |
| U2 | `test/keyInstaller.test.ts`, on the real file system, with `world()` (`:46-81`) | `U2: a call key lands in keys/<pid>/ as <a call name>.key, with one end-of-line, mode 0600, and it is still ours to read` | `keyPath = w.mod.materializeCallKey(w.storage, 'PRIVATE KEY BODY')`. `path.dirname(keyPath)` is `w.mod.materializedKeysDir(w.storage)`; `path.basename(keyPath)` matches `/^call-[0-9a-f-]{36}\.key$/`; the file reads as `'PRIVATE KEY BODY\n'` (one end-of-line; the read after `lockToOwner` works); a body `'BODY\n'` is written as `'BODY\n'`; where `process.platform !== 'win32'`, `fs.statSync(keyPath).mode & 0o777` is `0o600`; two calls give two paths; `w.mod.materializeCallKey.length === 2` |
| U3 | the same file, beside the test at `:202-208` | `U3: a purge takes a call key with THIS window pid directory` | write with `materializeCallKey`, call `purgeMaterializedKeys(w.storage)`, the file is gone |

U1 holds the exact shape of the name. The other rows use the short pattern `call-` and 36 characters of hex and `-`.

## 9. Guard rows G1 to G9 (watched passing before the fix and after it)

"Before" is the state of step 3 (the base, the no-op step, part C). "After" is the state after step 4. Run each file in the two
states and record the pass of each row.

| Row | The existing lines that are the guard | Change |
|---|---|---|
| G1 | `test/bridgeLinks.test.ts:97-102` (on a bridge, (a) is `BRIDGE_USE_REFUSED`, and the journal has the real error) and `:141-146` (the same for (b)) | none |
| G2 | `test/bridgeLinks.test.ts:103-107` (on the main port (a) keeps its sentence, with `EACCES` and the folder) | none. It holds after the fix only because site 4 of §3 throws the same text |
| G3 | `test/bridgeLinks.test.ts:147-149` (on the main port (b) keeps its sentence) | none |
| G4 | `test/bridgeLinks.test.ts:180-188` (L5: `stderr` is passed on as it was returned, on the two doors) | none |
| G5 | new, §5.4 | — |
| G6 | `test/sshUseActions.test.ts:318-326` (written one time, the word of the argv, gone after the call) and `:328-338` (gone also when `ssh` fails) | none |
| G7 | `test/sshUseActions.test.ts:340-350` and `test/sshExecAuth.test.ts:84-91` (two calls, two files) | none |
| G8 | `test/agentNamesOnlyViewable.test.ts`, the whole file (parts A and B) | none: `git diff 6dd96fe7` of the file is empty |
| G9 | `test/keyInstaller.test.ts:88-95`, `:97-102` and `:339-353` (the person's roads keep `<id>.key` and `<id>-<suffix>.key`); `:299-307` (a traversing id stays in the folder) | none |

**G1 to G4: the same lines as on the base.** `test/bridgeLinks.test.ts` is the same on `e44d17da`, on `6dd96fe7` and on the parent's
`b95282f1` (F14). E1.1 only ADDS to it (one import, the test K6). The check, from the repository root:
`git diff --numstat 6dd96fe7 -- src_vs_code/src/test/bridgeLinks.test.ts` shows 0 removed lines. A body holds a random path, so two runs are never byte-equal; the assertion is what does not change.

## 10. Step 6 — the mutation checks (each one must turn the named tests red; restore after each one)

Each mutation must compile: a red by a compile error proves nothing. After each one, restore the file and see that
`git status --short` shows no change. Record the red tests of each mutation.

| # | The change, exact | Must go red |
|---|---|---|
| 1 | Put the base back in `sshExecAuth.ts`, from the repository root: `git checkout 6dd96fe7 -- src_vs_code/src/sshExecAuth.ts` (the lines `:1`, `:7`, `:162` of today). Restore: `git checkout HEAD -- src_vs_code/src/sshExecAuth.ts` | K1 (3), the nine cells, K5, K6, S1: the 15 of step 3 |
| 2 | In `callKeyName()`: `void crypto.randomUUID(); return 'call-00000000-0000-4000-8000-000000000000';` (the `void` line keeps the import used) | U1 (the two names are equal); G7 in the two files |
| 3 | Add the key `'sshExecAuth.ts'` to the written list of S1 | S2, at its first assertion (the comparison) |
| 4 | In `test/secondEntryWorld.ts`, make the `stderr` of `sshPrints` the fixed text `'Permission denied (publickey).'` | assertion 1 of the three (c) cells (`the channel is not live`); G5 can go red too |
| 5 | In `hiddenIdsOf` (`test/secondEntryWorld.ts:199`), give `[]` for the key entry in each case | P6 of the three fixture tests. (Without that proof K1 to K4 would pass and prove nothing.) Part B's own count at `test/agentNamesOnlyViewable.test.ts:480` can go red too |
| 6 | Add the product file `src_vs_code/src/mutationSix.ts`: `import { materializePrivateKey as writeKey } from './keyInstaller';` and `export const mutationSix = (dir: string): string => writeKey(dir, 'x', 'y');`. Run the suite `keysDirPaths` only. Then delete the file and its two files in `out/` | S1, with the site `mutationSix.ts:1` (the import; the call `writeKey(` holds no name of the writer) |

## 11. Order of work, and the commits

The order is the parent's §5, steps 1 to 6. **Every commit is green** (`git-workflow.md` rule 2; the E2 stories of F7 did the
same). The RED states of steps 1 to 3 stay in the working tree, never committed: run, read, save the text in the scratchpad folder
of the session, go on. The first commit holds steps 1 to 4 together, and its body is the record of the RED proof (a restart of the
PC empties the scratchpad; the commit body stays). Decided by the lead on 2026-11-12, after the notes for the lead, item 4.

| State or commit | Holds | The state of `npm test` | Message |
|---|---|---|---|
| state 1 (RED, not committed) | step 1: S1 and S2 | 1 red: S1, with `sshExecAuth.ts:7` and `:162` | — |
| state 2 (RED, not committed) | step 2: C1, C2, the ten sites of C5 | the same 1 red, no other; `typecheck` clean | — |
| state 3 (RED, not committed) | step 3: the options of the two worlds, part C, K5, K6. The "before" pass of G1 to G9 is recorded here | 15 red (§6), no other | — |
| c1 | steps 1 to 4: the states above and the fix C3 | green | `fix(agent): the key file of an agent's call has a random name, with no id of an entry (rule C)` — its body quotes the first S1 failure, one failure text of each of K1 to K6, the count 15 of state 3, the "before" pass of G1 to G9, and the pass |
| c2 | step 5: U1 to U3. The "after" pass of G1 to G9 and the results of the six mutations are in its body | green | `test(keys): unit rows of the call name and its writer (U1 to U3)` |

## 12. Done when (each item can be counted)

- [ ] **S1 first.** The first run of S1 failed with exactly 2 sites in 1 file (`sshExecAuth.ts:7`, `:162`). The summary has the 8
      lines of the `grep` of F4, compared with the parent's §4.3.
- [ ] **The no-op step.** `npm run typecheck` exits 0, and `npm test` shows 1 failed test (S1).
- [ ] **RED.** In state 3, 15 tests fail, each one by its assertion: S1, K1 (3), the nine cells, K5, K6. 0 compile errors. Each text
      is saved; the summary quotes one failure and the pass.
- [ ] **The nine cells.** After c1, 9 of 9 cells pass. In each cell assertion 1 found the path of the call file in the answer
      first, and the answer holds 0 hidden ids and 0 hidden names.
- [ ] **The argv.** On the 3 doors the argv holds 0 hidden ids and 0 hidden names (K1).
- [ ] **K6.** On the 2 doors (the bridge, the main port) the last part of the printed path is a call name.
- [ ] **The callers.** `grep -rlw materializePrivateKey src --include=*.ts --exclude-dir=test` (in `src_vs_code`) gives exactly 3
      files: `keyInstaller.ts`, `sshSession.ts`, `transportFactory.ts`. S1 and S2 pass. `grep -c keyEntityId src/sshExecAuth.ts` and
      `grep -c crypto src/sshExecAuth.ts` each give 0.
- [ ] **U1 to U3** pass (3 tests).
- [ ] **G1 to G9** were watched passing before c1 and after it. `test/bridgeLinks.test.ts` has 0 removed lines against `6dd96fe7`;
      `test/agentNamesOnlyViewable.test.ts` has no difference.
- [ ] **The 6 mutations** each turned at least 1 named test red, and after each one `git status --short` showed no change.
- [ ] **No other file.** From the repository root, `git diff --stat 6dd96fe7 -- contract src_mcp src_cli src_broker_client` is
      empty. The files of *Files with no change in E1.1* have no difference. `SshUseDeps` and `AgentUseDeps` have 0 new members.
- [ ] **Clean.** `npm run lint` is clean with no new `eslint-disable`; `npm test` is green at c1 and at c2.

## 13. Break it — ways to make the tests pass while the leak stays, and the row that stops each one

| # | The wrong way | What stops it |
|---|---|---|
| B1 | The product still gives an id to the writer, and the WORLD drops it (the sibling `materializePrivateKey` of a world writes a `call-` name) | S1 (the call site still names the writer). Mutation 1: with the base back, K1 to K6 must go red; a world that drops the id keeps them green. The review: the sibling of each world still builds its name from `id` |
| B2 | A test world makes up the name (`'call-test'`) | The copy rule (§3). G7 goes red (two calls, one name). U2 runs the real writer on the real file system one time |
| B3 | `callKeyName(id)` or `materializeCallKey(storageDir, content, id)`: a parameter brings the id back | The signatures of §1 are exact. U1 asserts `callKeyName.length === 0`; U2 asserts `materializeCallKey.length === 2`. The review reads the two signatures |
| B4 | A name that is a digest of the id (`call-<hash of the id>`): no test finds the id as text | `callKeyName()` gets no id. G7 at `test/sshExecAuth.test.ts:84-91`: the same key entry two times must give two names. U1: two calls, two names |
| B5 | The id goes into the folder, not the name (`materializeCallKey(path.join(storageDir, id), …)`) | K1: each word of the argv is read, the whole path. The cells read the whole answer |
| B6 | The channel is closed in the world, not in the product: `writeFails` throws a text with no path, `startFails` has no argv, `sshPrints` prints a fixed text | Assertion 1 of each cell. Mutation 4 |
| B7 | The id of the key entry leaves the list of hidden ids, or the key entry becomes visible | P5 and P6 of the fixture proof. Mutation 5 |
| B8 | The new member of a world records nothing, so a guard that says "nothing was written" passes and tests nothing | The copy rule and the review of each of the ten sites. `test/pinClickPaths.test.ts:270` goes red for site 8; the fixture proof (P3) for site 5; G6 and G7 for site 1 |
| B9 | S1 reads the top folder only, or finds calls only | S2 (a call in each file of the list). Mutation 6 (an import with `as` in a new file) |
| B10 | The assertions of G1 to G4 change so that they pass | The `--numstat` check of §9: 0 removed lines in `test/bridgeLinks.test.ts` |
| B11 | K6 reads the whole printed path, or K5 reads the whole `keyPath` | The two rows read the last part only (§6): the id `k1` can be in a random folder name by chance, and `/store/` is the test's own text |

## 14. Not verified by this spec

- No test was run and nothing was compiled for this spec: the worktree has no `node_modules` and no `out` (F13). Each statement
  about what a test shows today comes from reading the code. The first run of each step is the check. A difference from §2, §5.1
  or §6 goes to the lead before any fix.
- A real `ssh`, Windows, and the person's terminal: the parent's §6.6 says what the tests do not prove. E1.1 adds nothing to it.
- On the `rotate` door, the message of cell (b) also holds the new value of the world. The stand-in error holds the whole argv,
  the remote command holds the new value (`rotateAction.ts:174`), and the rotation masks the top-level text fields only (F6;
  `secretMasker.ts:137-140`; the message is at `error.message`, `brokerProtocol.ts:78`). Part C does not assert on it. Node's own
  message of a failed start holds no argv (the parent's §1.2).
- The comment at `sshUseActions.ts:130-132` is false from c1 until E1.2 changes it (C4, the parent's §5 step 7). It is the same
  branch and the same pull request.

## Notes for the lead

> Status of these notes, 2026-11-12, by the lead: 1, 2 and 5 are done in `42d7340d` (the counts, the S1 failure lines, the cornerstone line and the README row); 4 is decided in §11 (green commits only); 3 and 6 stand as written. The stories document [PLAN_agent_refusal_key_file_path_E1.md](PLAN_agent_refusal_key_file_path_E1.md) checked this spec against the code; its notes on the spec are the build facts that are newer than this text.

Nothing below is decided in this spec. Each note says what the spec does meanwhile, inside the plan as written.

1. **The count of C5.** The parent says "11 sites in 9 files" (§4.1 row C5, §5 step 2). The parent's own list has 10 sites in 8
   files, and the code has the same 10 in 8: `grep -n "'./keyInstaller'"` over `src_vs_code/src/test` gives 10 files; two of them
   (`test/sshConnectWorld.ts`, `test/transportFactory.test.ts`) are not on the list by the parent's own words. The list is right;
   the two numbers are wrong. The spec lists the 10 sites (§3). A repaired count is not a plan change, but the lead decides.
2. **S1 names two lines, not one.** The parent says that the first run of S1 fails "on `sshExecAuth.ts:162`" (§5 step 1, §6.3,
   §12). By the parent's own definition an import is an occurrence, so the first failure names `sshExecAuth.ts:7` (the import) and
   `:162` (the call): one file, two sites. Mutation 6 needs the import to be a site. The spec expects the two sites (§2, §12).
3. **Three of the ten worlds build no name.** The parent says that each new member "takes the name from the REAL `callKeyName()`".
   In `test/brokerAbandoned.test.ts:557` the sibling gives the fixed text `'/k'`; in `test/pinReaders.test.ts:139` it gives `''`;
   in `test/sshExecAuth.test.ts:166-168` it throws. The spec: the new member gives the same fixed text or the same throw there, and
   uses `callKeyName()` at the seven sites where the sibling builds a name (§3).
4. **RED commits.** The brief for this spec asks for RED commits before the fix. `git-workflow.md` rule 2 says that the tests of
   the change passed before a commit, and the E2 stories document of F7 kept each RED state in the working tree only. The parent
   says nothing about commits. The lead decided green commits only (§11: the RED states stay in the working tree, and the first
   commit, c1, quotes them).
5. **The cornerstone ledger and the README row.** On `e44d17da` the parent's ledger line reads `Cornerstones: 0 of 1 — none marked
   yet`, and `todo/PLAN_agent_refusal_key_file_path_E1.md` does not exist. `subagent-models.md` asks that the cornerstone is in the
   ledger before its spec is written. This spec changed no other file. Owed, in the commit that adds this file: the mark of E1.1 in
   the stories document with the ledger line `1 of 1 — E1.1`, and a row for this file in `todo/README.md` (`planning-docs.md`: a
   README row is in the same commit as the file that it links). Until the row is there, `plan-lifecycle.mjs` shows 1 finding:
   `todo/README.md omits PLAN_agent_refusal_key_file_path_E1_S1_spec.md` (run on 2026-11-12, with this file not committed).
6. **Found along the way, not built:** the third item of §14 (a rotation's refusal carries its text one level down, where the
   rotation's own mask does not read). It is the class of the parent's §3 point (2) and of its residue. No leak is shown: no real
   error is known to carry the remote command. Recorded so that it is not lost.
