# PLAN — E1.S1 spec: the key file of a terminal has a call name (CORNERSTONE)

> Status: **IMPLEMENTED, 2026-11-15** (`3099f5a5` the code and the tests, `895e345b` the documents; extension 1.22.1, #366). Since the re-review
> of the parent for epoch 2, G1 of this document is replaced by G1 of
> [the E1.S2 spec](PLAN_open_terminal_key_file_name_E1_S2_spec.md), which also changes `sshConnect.ts` and
> `test/sshConnectWorld.ts`, and `terminalManager.ts` for one comment (they leave the list *Files with no change* below). The rest is the record of what E1.S1 built.
> Cornerstone spec, written by Fable before its code. Story E1.S1 of
> [PLAN_open_terminal_key_file_name.md](PLAN_open_terminal_key_file_name.md) (its §2, §3 items 1 to 8 and 2a, §4, `## Epics` E1).
> This file is promoted together with the parent.
>
> Scope: `src_vs_code/src` — `sshSession.ts` (one call site, one import, one parameter, one field, one docblock), and tests:
> `test/keysDirPaths.test.ts`, `test/sshConnectWorld.ts`, `test/sshSession.test.ts`, `test/sshConnect.test.ts`,
> `test/sshConnectRemote.test.ts`, one new suite `test/sshConnectKeyName.test.ts`. Then the documents of the parent's §4.
> Branch `fix/open-terminal-call-key-name` at `50345d34`. Each `file:line` below was read on `50345d34`.
> Fable writes this spec, a Sonnet coder builds it, Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above. "The N10
spec" is [PLAN_agent_refusal_key_file_path_E1_S1_spec.md](PLAN_agent_refusal_key_file_path_E1_S1_spec.md). The names
T-N17a, T-N17b, T-N17c, T20, T21, S1 and S2 are the parent's. Names that start with F, FX, G, L, W, M or B are this document's own.
This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`).

## What E1.S1 builds, in one paragraph

`prepareSshSession` writes a stored key to a file. Today the name of the file is the id of the key entry (`sshSession.ts:472`).
`connectEntity` then types `ssh -i "<path>" …` into a terminal. An agent's `creds_open_terminal` takes the same road
(`sshUseActions.ts:382`). So the id of a linked key entry that the agent may not view is in a text that the agent can read.
E1.S1 makes the one writer of that file `materializeCallKey`: the name is `call-<uuid>.key` on every road, with `isolate` and
without. `keyFile` loses its `suffix` parameter. The host-key pin keeps its name and its suffix. `sshSession.ts` leaves the list
of the scan. No sentence, status or answer changes.

## Binding constraints

- **No plan change.** Build what the parent and this document say. If a step cannot be done as written, or you find a new caller
  or a test that this document does not list: stop and tell the lead. Do not repair the parent.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first. Read the exit of `tsc` before any
  test result. This is why the test world gets its new member (step 2) before the product calls it.
- **Keep what the runner printed.** Save each RED text in the scratchpad folder of the session and quote it in the commit body.
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): a file has at most 800 lines, a function at most 50 code lines (120
  in `src/test/`), complexity at most 4 (also in tests). No new `eslint-disable`. `noUnusedLocals` and `noUnusedParameters` are
  on: a mock declares only the parameters that it reads (a name that starts with `_` is allowed).
- **Files with no change:** `keyInstaller.ts` and `test/keyInstaller.test.ts` (the open PR #365 edits both),
  `materializedKeys.ts`, `sshConnect.ts`, `terminalManager.ts`, `sshCommand.ts`, `sshRoad.ts`, `dependencyRunHost.ts`,
  `sshExecAuth.ts`, `sshCredential.ts`, `hostKeyTrust.ts`, `connectionOptions.ts`, `keysPurge.ts`. Nothing in `contract/`,
  `src_mcp`, `src_cli`, `src_broker_client`, `src_minimalapi_server`. `materializePrivateKey` keeps its `suffix` parameter (the
  parent's follow-up F1).
- **The new tests write nothing to disk.** The key writer of the world is a stand-in that returns a path. No temp folder is made.
- **Node only.** No Python, also not for a helper script. Write documents with the Edit or Write tool, not with a shell heredoc.

## Facts read on `50345d34` that this spec uses

| # | Fact | Where |
|---|---|---|
| F1 | The one call site is `keyFile` (`:465-480`); the write is `:472`. Its one caller is `keyBranch` (`:456-463`, the call at `:457`). The import is `:13`. `suffix` is made at `:342`, goes to `connectionOptions` at `:343-350`, is put on `Resolved` at `:351` (the field is `:218`) and is read again at `:457` only | `sshSession.ts` |
| F2 | `materializeCallKey(storageDir, content)` is `keyInstaller.ts:175-177`. `callKeyName()` is `materializedKeys.ts:107-109`; that module imports no `vscode` (`:1-4`). The solved instance is `sshExecAuth.ts:161` | the three files |
| F3 | **No exit follows the key write.** `keyBranch` returns `ready(…)` at `:462`, directly after `keyFile`. `ready` (`:525-553`) has no exit. The failed write (`:458-461`) returns before a path exists. `giveBack` (`:521-523`) takes back the PIN only (`forgetOurPin`); it never held a key | `sshSession.ts` |
| F4 | The owners delete by the path that they got, never by a name. `openKeyTerminal` (`sshConnect.ts:117-134`): at once when no terminal opened (`:122-123`), else when THIS terminal closes (`:125-130`). `ReadySsh.cleanup()` (`sshSession.ts:542-551`) is called at `sshRoad.ts:121`, `:170`, `:178`, `dependencyRunHost.ts:402` and `commands/folderRunCommand.ts:280` | the five files |
| F5 | The real composition. `openSshTerminal` (`terminalManager.ts:37-66`) builds the line at `:44`, **gives back a live terminal of the same account and entry and types nothing** (`:51-57`), else creates one (`:61`) and types the line (`:64`). `buildSshCommand` is `sshCommand.ts:213-245`; `-i` and the quoted path are `:232-234`; `shellQuote` is `:161-166` | the two files |
| F6 | The world's stand-in of `./terminalManager` (`:200-214`) records arguments and composes nothing; it returns the ONE object `opened` (`:140`, `:209`). The stand-in of `./keyInstaller` (`:170-183`) has NO `materializeCallKey`. The stub's `createTerminal` (`:237-250`) records `sent` (`:241-243`) and does not add the terminal to `window.terminals` (`:236`). `closeTerminal` is `:133`; `onDidCloseTerminal` is `:251-254` | `test/sshConnectWorld.ts` |
| F7 | No world runs the agent's action with the real `connectEntity` and the real `terminalManager`: `test/sshUseActions.test.ts:151` and `test/secondEntryWorld.ts:245` replace `./sshConnect`; `test/brokerAbandoned.test.ts:559` replaces `./terminalManager`. The agent's action calls `connectEntity` at `sshUseActions.ts:382-392` with `agentServesKey`, `remote` and `startGate`; none of them names a file | the four files |
| F8 | **Measured 2026-11-15** on the compiled `50345d34`, with a scratch script (not kept): the world's mocks without the `./terminalManager` entry, and a stub that lists created terminals. One Connect of `e1` with the key id `hid-key-8f3k2` types `ssh -i "/storage/keys/hid-key-8f3k2.key" prod.corp.com` (the same text for `linux` and for `win32`); the tab is `Creds SSH: ssh connections / prod`. A second Connect while the terminal lives: the same terminal, shown again, nothing typed, the key written again. With `exitStatus` set on the first terminal: a second terminal. The same script with a writer that answers a call name (the state after the fix, made at the edge of the world): the steps of T-N17b, T-N17c and G1 pass as §4 writes them, and the line is `ssh -i "/storage/keys/call-<uuid>.key" prod.corp.com` | the run |
| F9 | A stored-key source carries `keyEntityId` and no name (`sshCredential.ts:27`, `:86`) | `sshCredential.ts` |
| F10 | The pin is `known_hosts-<sshEntryId>`, with `-<suffix>` under `isolate` (`hostKeyTrust.ts:66-68`, `:80-98`) | `hostKeyTrust.ts` |
| F11 | The literal `/storage/keys/k1.key` is asserted in 12 tests (5, 3 and 4): `test/sshSession.test.ts` (`KEY`, `:32`; used at `:57-62`, `:209`, `:252`, `:300`, `:361`), `test/sshConnect.test.ts` (`:47`, `:48`, `:70`, `:86`), `test/sshConnectRemote.test.ts` (`:231`, `:233`, `:265`, `:486`, `:502`, `:503`). T20 has the pattern `/\/k1-[0-9a-f-]{36}\.key$/` (`test/sshSession.test.ts:345`) | the three files |
| F12 | The scan: `WRITER_LIST` is `:100-104`, S1 is `:129-138`, S2 is `:140-150`. An import is a site (`:116`) | `test/keysDirPaths.test.ts` |
| F13 | Baseline, run 2026-11-15 after `npm run compile`: `sshSession` 21 tests, `sshConnect` 34, `sshConnectRemote` 25, `keysDirPaths` 4; all pass | the run |
| F14 | `world()` (`:113-229`) has 106 code lines of 120 and complexity 3 of 4 | `test/sshConnectWorld.ts` |
| F15 | PR #365 changes the body of `materializePrivateKey` and adds a function directly above the docblock of `materializeCallKey` (`gh pr diff 365`, read 2026-11-15) | `keyInstaller.ts` |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.** A test result after a failed `tsc` is the result of old files.
2. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
3. `node $LP npm run typecheck`
4. `node $LP npm run lint`
5. `npm test` — the full suite (it compiles first and lowers itself).

## 1. Scenarios

Each row is one test, or the tests that the row names. "RED today" is what the test shows on the product of `50345d34`, after
steps 1 to 3 and before step 4. The details and the order of the assertions are in §4.

| Id | Where | Setup | Action | Expected | RED today |
|---|---|---|---|---|---|
| S1 | `test/keysDirPaths.test.ts` | the written list without `sshSession.ts` | scan `src` for `materializePrivateKey` | no site outside the list | **red**: two sites, `sshSession.ts:13` (the import) and `sshSession.ts:472` (the call) |
| S2 | the same | the same | compare the list; find a call in each file | the list is exactly `keyInstaller.ts`, `transportFactory.ts`; a call in each | green in every state |
| FX | `test/sshConnectKeyName.test.ts` | the fixture of §3.2 | read the constants and the storage | the key entry is in the storage with its name; its id is not the SSH entry's; id and name are in no other text of the world; `keyLeaks` finds both | green before and after |
| T-N17a (2 tests) | `test/sshSession.test.ts` | `source: LINKED_SOURCE`, `options: OPTIONS`; one test without `isolate`, one with `isolate: true` | `prepareSshSession('a1', linked entity, …)` | `ready`; one file written; `materializedKeyPath` and `entity.sshKeyPath` are that file; the path holds neither the id nor the name; the last part is a call name | **red** at the second assertion: `T-N17a (non-isolated): the path of the key file holds hid-key-8f3k2: /storage/keys/hid-key-8f3k2.key`; isolated: `…/hid-key-8f3k2-<uuid>.key` |
| T-N17b | `test/sshConnectKeyName.test.ts` | the same source; `realTerminal: true`; `remote: LOCAL_LINUX`; a live `startGate`, as the agent's action passes | `connectEntity('a1', linked entity, …)` | opened; one terminal, one typed line; the line holds `-i "<the written path>"`; the line and the tab hold neither the id nor the name; the last part of the path is a call name | **red** at the absence assertion: `T-N17b: the typed line holds hid-key-8f3k2: ssh -i "/storage/keys/hid-key-8f3k2.key" prod.corp.com` |
| T-N17c | the same file | the same world | Connect; the first terminal ENDS (`exitStatus` set, no close event yet); Connect again; close the first; close the second | two terminals; two distinct call-named paths; each line names its own path; nothing forgotten before a close; the first close forgets the first path only; the second close forgets the second | **red** at the distinct-paths assertion: `T-N17c: two Connects of one entry wrote one path: /storage/keys/hid-key-8f3k2.key, /storage/keys/hid-key-8f3k2.key` |
| G1 | the same file | the same world | Connect twice while the terminal lives; close another terminal; close the terminal | one terminal, one typed line; two files written; nothing forgotten before its close; after its close every written file is forgotten | green before and after (a guard; see the notes for the lead, item 1) |
| T20 | `test/sshSession.test.ts:326` | as today | as today | as today, and: each key is a call name; the key name does not hold the pin's suffix | **red**: the last part is `k1-<uuid>.key` |
| T21 | `test/sshSession.test.ts:356`, renamed | as today | as today | the key is a call name; the pin is `OUR_PIN`; no suffix was asked of the pin writer | **red**: the last part is `k1.key` |
| L1 to L11 | the 11 tests of F11 other than T21 (§4.5) | as today | as today | as today, with `writtenCallKey(w)` in the place of the literal | **red** in `writtenCallKey`: the last part is `k1.key` |

Count: in the state before the fix, 18 tests fail and no other: S1, T-N17a (2), T-N17b, T-N17c, T20, T21, L1 to L11. FX, G1 and
S2 pass. After the fix all pass.

**Is a scenario needed for an exit after the key write?** No. F3: the key write is the last thing the seam does before `ready`,
so there is no such exit to test. The exits that follow belong to the owners (F4), and they have their tests: no terminal opened
(L7), the terminal closed (L6, T-N17c, G1), `cleanup()` (L1, L4, T20). If the build finds an exit between `keyFile` and `ready`,
stop and tell the lead.

## 2. Files and changes

| File | Step | Change |
|---|---|---|
| `test/keysDirPaths.test.ts` | 1 | the list loses one row; S2's name and list say two; the docblock |
| `test/sshConnectWorld.ts` | 2 | W1 to W5 (§3.2) |
| `test/sshSession.test.ts` | 3 | T-N17a (2 new tests); T20; T21; L1 to L4; `KEY` (`:32`) goes |
| `test/sshConnectKeyName.test.ts` (new) | 3 | FX, T-N17b, T-N17c, G1 |
| `test/sshConnect.test.ts` | 3 | L5 to L7; the comment at `:14` |
| `test/sshConnectRemote.test.ts` | 3 | L8 to L11 |
| `sshSession.ts` | 4 | the fix, seven edits (§5) |
| `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md`, `todo/README.md` | 6 | §7 |

No file comes near 800 lines (the largest: `test/sshConnectRemote.test.ts`, 608).

## 3. Steps 1 and 2 — the scan, and the world

### 3.1 Step 1 — the scan (on the unchanged product)

In `test/keysDirPaths.test.ts`:

- Remove the row `'sshSession.ts'` from `WRITER_LIST` (`:102`).
- S2 (`:140`): the name becomes `the scan of the writer would notice: the list is exactly two files, and the scan finds a call in
  each`. Its first assertion compares with `['keyInstaller.ts', 'transportFactory.ts']`.
- The docblock (`:93-98`): "A key file of an agent's call" becomes "A key file of a call or of an SSH session (Connect,
  `creds_open_terminal`, the runs over SSH)". S1's name and message stay.

Run the one suite. It must show: S1 fails with exactly the two lines
`sshSession.ts:13  import { forgetMaterializedKey, materializePrivateKey, writeAskpassScriptFile } from './keyInstaller';` and
`sshSession.ts:472  const keyPath = materializePrivateKey(storageDir, source.keyEntityId, source.content, suffix);`. S2 and the
two older tests pass. Save the text. A site in another file stops the work: tell the lead.

### 3.2 Step 2 — the world, `test/sshConnectWorld.ts` (no test changes yet)

**W1, the key writer: one helper for the two members**, so that they cannot differ (the copy rule of the N10 spec, §3). The
sibling keeps its name from the id. The new member takes its name from the REAL `callKeyName` (new import:
`import { callKeyName } from '../materializedKeys';`, a plain import, F2). Never a name that the test made up.

```ts
const keyWriter = (w: World, parts: Parts) => (name: string): string => {
  if (parts.materialiseFails === true) {
    throw new Error('disk full');
  }
  const keyPath = `/storage/keys/${name}.key`;
  w.materialised.push(keyPath);
  return keyPath;
};
```

The two members of the stand-in of `./keyInstaller`, with `const write = keyWriter(w, parts);`:

```ts
materializePrivateKey: (_dir: string, entityId: string, _content: string, suffix?: string): string =>
  write(`${entityId}${suffix === undefined ? '' : `-${suffix}`}`),
materializeCallKey: (): string => write(callKeyName()),
```

The sibling gives the same paths as today (`:171-178`). Both members record in `materialised`, and both throw `disk full` under
`materialiseFails`.

**W2, the switch `realTerminal?: boolean`** on `Parts` (`:79-107`). With it:

- the map of mocks holds NO `./terminalManager` entry, so the real module loads under the stub (a module that is not in `mocks`
  loads for real, `test/vscodeStub.ts:56-61`). The real `openSshTerminal` and `buildSshCommand` compose the line;
- the stub's `createTerminal` also pushes the terminal into `w.existing`, the stub's `window.terminals` (`:236`), as VS Code lists
  a terminal that it created. Without this the real reuse rule (F5) would never see a live terminal and the world would lie.

`sshTerminals` and `sshTerminalHandle` stay empty in this mode: a test reads `w.created[n]` (its `name`, its `sent`) and closes
`w.created[n]`. The stand-in of `./pinnedTerminal` stays (`:199`). Without the switch nothing changes: the stand-in still
returns the one `opened` object, and `createTerminal` does not list.

**W3, the constants** (exported):

```ts
/** A key entry that the SSH entry borrows. Its id reads like a name (an imported id can), and it is not the SSH entry's id. */
export const LINKED_KEY_ID = 'hid-key-8f3k2';
export const LINKED_KEY_NAME = 'hidden-deploy-key';
export const LINKED_KEY_NODE: TreeNode = { id: LINKED_KEY_ID, name: LINKED_KEY_NAME, type: 'entity', parentId: 'f1' };
export const LINKED_SOURCE = { kind: 'storedKey', keyEntityId: LINKED_KEY_ID, content: 'PRIVATE' };
/** The last part of a call key file: `call-`, a uuid, `.key`. */
export const CALL_KEY_FILE = /^call-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.key$/;
/** A local window whose shell is pinned, so the typed line is the same text on every runner (the reason of `WSL_NO_RELAY`). */
export const LOCAL_LINUX = { side: { kind: 'local' as const }, relay: { enabled: false, running: false, socket: '' }, hostPlatform: 'linux' as NodeJS.Platform };
```

**W4, three small helpers** (exported):

- `lastPart(file: string): string` — the text after the last `/` (the world's writer joins with `/` on every platform).
- `keyLeaks(text: string): string[]` — those of `[LINKED_KEY_ID, LINKED_KEY_NAME]` that `text` holds.
- `writtenCallKey(w: Pick<World, 'materialised'>): string` — asserts that `w.materialised` has length 1 (message: the list),
  asserts that `lastPart(w.materialised[0])` matches `CALL_KEY_FILE`, and returns the path. A test compares with this path and
  never types a name. The length check comes first: a comparison with `undefined` must not pass. New import of the world:
  `import * as assert from 'node:assert/strict';`.

**W5, the size of `world()`** (F14). The new ternary for `./terminalManager` is its last allowed branch. Move the two stand-ins
out of `world()` into two functions, `keyInstallerFake(w, parts)` and `terminalManagerFake(w, opened)`, with no change of what
they do. Correct the header comment (`:27-29`): the writer is now `materializeCallKey`.

**Then:** `npm run typecheck` is clean. `npm test` shows one failed test, S1 with its two sites, and no other. Every older test
of the world still passes with no change: this proves that W1 to W5 changed nothing for them.

## 4. Step 3 — the tests

No test guesses a name. A path comes from `w.materialised`; a typed line comes from `w.created[n].sent`.

### 4.1 FX — the fixture (green before and after), in `test/sshConnectKeyName.test.ts`

The file has four small helpers (`ConnectOptions`, `EntityMetadata` and `World` are type-only imports):

```ts
const linked = (): EntityMetadata => entity({ sshKeyEntityId: LINKED_KEY_ID });
const linkedStorage = (): ReturnType<typeof storageWith> => storageWith(E1_IN_FOLDER, FOLDER, LINKED_KEY_NODE);
const linkedWorld = (): World => world({ source: LINKED_SOURCE, options: OPTIONS, realTerminal: true });
/** The options of the agent's `creds_open_terminal` (`sshUseActions.ts:382-392`), in a local window with a pinned shell. */
const connect = (): ConnectOptions => ({ ...connectBase(), storage: linkedStorage(), storageDir: '/storage', agentServesKey: false, remote: LOCAL_LINUX, startGate: new AbortController().signal });
```

Name: `FX, the fixture of N17: the key entry is in the world under an id that reads like a name, and its id and name are in no
other text of the world`. Assertions, in this order:

1. `LINKED_KEY_ID !== linked().id`, and `linked().sshKeyEntityId === LINKED_SOURCE.keyEntityId`.
2. `linkedStorage().getNode(ACCOUNT_ID, LINKED_KEY_ID)?.name` is `LINKED_KEY_NAME` (the name exists in the storage that the
   product reads).
3. `keyLeaks(text)` is `[]` for each of: `'/storage'`, `SSH_TITLE`, `ACCOUNT_ID`, `FOLDER.name`, `LINKED_SOURCE.content`, and the
   `id`, `name` and `host` of `linked()`.
4. The reader works: `keyLeaks(LINKED_KEY_ID)` is `[LINKED_KEY_ID]`, and `` keyLeaks(`x ${LINKED_KEY_NAME} y`) `` is
   `[LINKED_KEY_NAME]`.

FX says: when a test finds the id in a path or a line, the id came through the name of the key file, not from another text.

**What the name assertion is.** In this world the lookup of the credential is replaced (`./sshCredential`), so the key entry is a
node of the storage and the `keyEntityId` of the source. Today only the id reaches the file name; a source carries no name (F9).
So the absence of the NAME is green before and after: it guards a later change. The absence of the ID is the RED one.

### 4.2 T-N17a — the name that the seam writes (2 tests; RED), in `test/sshSession.test.ts`

After T21. One loop over `[['non-isolated', {}], ['isolated', { isolate: true }]]` makes two tests, so the runner shows each by its
name: `T-N17a (<mode>): the key file of a linked key entry has a call name, with no id and no name of that entry`.

World: `world({ source: LINKED_SOURCE, options: OPTIONS })`. Action:
`prepareSshSession('a1', entity({ sshKeyEntityId: LINKED_KEY_ID }), { storage: storageWith(E1_IN_FOLDER, FOLDER, LINKED_KEY_NODE), storageDir: '/storage', ...mode })`.
Assertions, in this order:

1. The result is `ready`. `w.materialised.length` is 1. With `written = w.materialised[0]`: `r.materializedKeyPath === written`
   and `r.entity.sshKeyPath === written`. (The one positive: the path that the session carries is the file that was written.)
2. `keyLeaks(written)` is `[]`, with the message
   `` `T-N17a (${mode}): the path of the key file holds ${found.join(' and ')}: ${written}` ``. The WHOLE path is read, not only
   its last part: an id in a folder name would be found too.
3. `lastPart(written)` matches `CALL_KEY_FILE`.

### 4.3 T-N17b — the typed line, from the real composition (1 test; RED), in `test/sshConnectKeyName.test.ts`

Name: `T-N17b: the line typed into the terminal names the written key file after -i, and holds no id and no name of the linked key
entry`. World: `linkedWorld()`. Action: `opened = await w.mod.connectEntity('a1', linked(), connect())`. Assertions, in this order:

1. `opened` is `true`. `w.created.length` is 1. `w.created[0].sent.length` is 1. `w.materialised.length` is 1.
2. **Positive first.** With `written = w.materialised[0]` and `line = w.created[0].sent[0]`: `line` includes
   `` `-i "${written}"` ``. Message: `` `T-N17b: the typed line does not name the written key file (${written}): ${line}` ``.
   The closing quote follows the whole path, so the word after `-i` is exactly the path that the writer returned.
3. `keyLeaks(line)` is `[]`, with the message `` `T-N17b: the typed line holds ${found.join(' and ')}: ${line}` ``.
4. `keyLeaks(w.created[0].name)` is `[]` (the tab).
5. `lastPart(written)` matches `CALL_KEY_FILE`.

Without assertion 2 the test could pass because no path reached the line.

### 4.4 T-N17c and G1 — two Connects of one entry, in `test/sshConnectKeyName.test.ts`

The real `openSshTerminal` hands back a NEW terminal for an entry only when the earlier one has ended (F5, F8). So the two
handles of T-N17c come from the real rule, not from a stand-in: the first session ends, and its close event has not arrived yet.

**T-N17c** (RED). Name: `T-N17c: two Connects of one entry, each with its own terminal, write two call-named files, and each close
forgets its own file only`. World: `linkedWorld()`; one `connect()` for both calls. Steps and assertions, in this order:

1. Connect. `first = w.created[0]`. Then `first.exitStatus = { code: 0 }` (ended; no close event).
2. Connect again. `w.created.length` is 2; `second = w.created[1]`; `first !== second`; each has one typed line.
3. `w.materialised.length` is 2, and `new Set(w.materialised).size` is 2, with the message
   `` `T-N17c: two Connects of one entry wrote one path: ${w.materialised.join(', ')}` ``. With `[a, b] = w.materialised`.
4. `first.sent[0]` includes `` `-i "${a}"` ``; `second.sent[0]` includes `` `-i "${b}"` ``; `lastPart(a)` and `lastPart(b)` match
   `CALL_KEY_FILE`.
5. `w.forgotten` is `[]`.
6. `w.closeTerminal(first)`; `w.forgotten` is `[a]`.
7. `w.closeTerminal(second)`; `w.forgotten` is `[a, b]`.

**G1** (a guard; green before and after). Name: `G1: a second Connect of a live session opens no terminal and types nothing, and
every key file written for that terminal is forgotten when it closes`. Steps and assertions, in this order:

1. Connect twice (no `exitStatus`). `w.created.length` is 1; `w.created[0].sent.length` is 1; `w.materialised.length` is 2.
2. `w.forgotten` is `[]`. `w.closeTerminal({ name: 'somebody else' })`; `w.forgotten` is still `[]`.
3. `w.closeTerminal(w.created[0])`; `[...w.forgotten].sort()` is deep-equal to `[...w.materialised].sort()`.

G1 does not assert that the two paths differ: today they are one path written twice, and G1 must be green in both states.

### 4.5 T20, T21 and the literal rows L1 to L11

**The rule for a literal.** The constant `KEY` (`test/sshSession.test.ts:32`) goes. Where a test compared with `KEY` or with
`'/storage/keys/k1.key'`, it now takes `const written = writtenCallKey(w);` and compares with `written`. Where the test only
asserted that the key was written (`assert.deepEqual(w.materialised, [KEY])`), the call `writtenCallKey(w)` is the assertion.
The message of a comparison stays. The message of a removed `deepEqual` (L8, `:231`) becomes a comment. No other line of these
tests changes. The key id of their sources stays `k1`.

| Row | Test (line of its `test(`) | Lines that change |
|---|---|---|
| L1 | `test/sshSession.test.ts:52` `ready with a stored key wrote the key; cleanup deletes it and our pin` | `:57-59`, `:62` |
| L2 | `:200` `the snapshot is the entity handed in; …` | `:209` (the world is `stored`) |
| L3 | `:239` `the Windows-client route: …` | `:252` |
| L4 | `:294` `cleanup never deletes a known_hosts file outside our directory` | `:300` |
| L5 | `test/sshConnect.test.ts:35` `a stored key is materialised and passed to the terminal` | `:47-48` |
| L6 | `:51` `the decrypted key is WIPED when the terminal closes` | `:70` |
| L7 | `:73` `a terminal that could not be opened wipes the key IMMEDIATELY` | `:86` |
| L8 | `test/sshConnectRemote.test.ts:217` `a stored key the agent cannot serve is handed to the WINDOWS client, …` | `:231`, `:233` |
| L9 | `:247` `the agent is NOT trusted on this route, however loaded it is` | `:265` |
| L10 | `:477` `a LOCAL window is untouched: …` | `:486` |
| L11 | `:491` `THE REPORT, both halves: …` | `:502-503` (the world is `before`) |

The comment at `test/sshConnectRemote.test.ts:38` tells what an old defect wrote; it is history and stays. The comment at
`test/sshConnect.test.ts:14` names the writer: it becomes `materializeCallKey`.

**T20** (`test/sshSession.test.ts:326`). The four-distinct-files claim, the pin pattern (`:346`), the suffix comparison (`:347`)
and the cleanup part (`:349-353`) stay. The line `:345` goes. In its place, in this order:
`assert.match(lastPart(first.materializedKeyPath as string), CALL_KEY_FILE)`, the same for `second`, and
`assert.ok(!(first.materializedKeyPath as string).includes(w.pinSuffixes[0] as string), 'the key name is not built from the suffix of the session')`.

**T21** (`:356`). New name: `T21: a non-isolated prepare writes a call-named key and today’s pin name, and asks no suffix of the
known_hosts writer`. The line `:361` becomes `assert.equal(r.materializedKeyPath, writtenCallKey(w));`. The lines `:362-363` stay.

**The run of step 3** (compile, then `npm test`): 18 failed tests and no other (§1). No failure is a compile error. Save one
failure text of each of S1, T-N17a, T-N17b, T-N17c, T20, T21 and of one L row.

## 5. Step 4 — the fix, in `sshSession.ts`

Seven edits, and no other line of the product:

1. `:13` becomes `import { forgetMaterializedKey, materializeCallKey, writeAskpassScriptFile } from './keyInstaller';`
2. `:472` becomes `const keyPath = materializeCallKey(storageDir, source.content);`
3. `keyFile` (`:465-469`) loses the parameter `suffix`: `function keyFile(source: SshCredentialSource, storageDir: string): …`.
   It gets a docblock of two sentences: the name of the file is random (`materializeCallKey`, rule C), for every road, with
   `isolate` and without; the path is typed into a terminal, so it must tell no id of a key entry.
4. `:457` becomes `const key = keyFile(s.source, s.connect.storageDir);`
5. `:218` goes (`readonly suffix: string | undefined;` of `Resolved`): nothing reads it any more.
6. `:351` becomes `… : composed({ ...r, resolved });`
7. The docblock of `isolate` (`:125-131`) says what is true now: `isolate` makes the PIN file this preparation's own
   (`known_hosts-<id>-<uuid>`), so two prepares of one SSH entry never share a pin and `cleanup()` of one cannot delete the
   other's; every road passes it; `connectEntity` never does, so SSH Connect keeps the pin name `known_hosts-<id>`. The key
   file needs no switch: it is `call-<uuid>.key` on every road.

`:342` and `:343-350` do not change: the suffix is still made under `isolate` and still goes to `connectionOptions`. The sentence
of `:475`, the `ready` contract and `cleanup()` do not change. After the edit `sshSession.ts` holds no `materializePrivateKey`
and no `keyEntityId`.

Then: the 18 tests pass, S1 passes, the full suite is green, `typecheck` and `lint` are clean. If a test of another world fails
with `Could not write the stored key to disk: … materializeCallKey is not a function` (the `try` of `keyFile` catches the
`TypeError`), that world replaces `./keyInstaller` and calls the real seam: give it the member by the copy rule and tell the lead.
None is known: the other worlds that replace `./keyInstaller` either have the member already or never call `prepareSshSession`.

## 6. Step 5 — the mutation checks (each one must turn the named tests red; restore after each one)

Each mutation must compile: a red by a compile error proves nothing. After each one, restore the file and see that
`git status --short` shows only the changes of the story. Record the red tests of each mutation.

| # | The change, exact | Must go red |
|---|---|---|
| M1 | The parent's §3.7. In `sshSession.ts`: `:13` imports `materializePrivateKey` in the place of `materializeCallKey`; the write becomes `materializePrivateKey(storageDir, source.keyEntityId, source.content)` | the 18 of step 3: S1, T-N17a (2), T-N17b, T-N17c, T20, T21, L1 to L11 |
| M2 | A fixed name. The same import; the write becomes `materializePrivateKey(storageDir, 'call-key', source.content)` | S1; T-N17a (2), at assertion 3; T-N17c, at assertion 3; T20; at least these |
| M3 | In `sshConnect.ts:126`, `if (closed === terminal)` becomes `if (closed !== undefined)`: a close of ANY terminal forgets | T-N17c, at step 6 (`[a, b]` in the place of `[a]`); G1, at step 2; L6 |
| M4 | Put the row `'sshSession.ts'` back on `WRITER_LIST` | S2, at its first assertion |
| M5 | The pin loses its suffix. `sshSession.ts:342`: `connect.isolate === true ? undefined : randomUUID()` (the two answers change places) | T20 (the pin pattern, four distinct files); T21 (`pinSuffixes`) |
| M6 | In `keyLeaks`, return `[]` | FX, at assertion 4. (Without FX, T-N17a and T-N17b would pass and prove nothing about the id.) |

## 7. Step 6 — the documents (the parent's §4)

- **`src_vs_code/CHANGELOG.md`**, under `## [Unreleased]` (`:7`): the heading `### Changed — security: the key file of a terminal`.
  Say, in plain sentences for a user: the key file that *Connect via SSH*, an agent's `creds_open_terminal` and the runs over SSH
  write for a stored key is now named `call-<uuid>.key`. Before, the name began with the id of the key entry, so the
  `ssh -i "<path>"` line in the terminal showed the id of a linked key entry, also to an agent that can read the terminal and may
  not view that entry. The file is deleted as before: when its terminal closes or its run ends.
- **`research/module_extension.md`**: the sentence at `:257-258` (with `isolate: true` only the PIN carries a per-preparation uuid;
  the key is `call-<uuid>.key` on every road; `connectEntity` keeps the pin name). The *Rule C* paragraph (`:6553-6559`): every
  writer of a stored SSH key for a call or for a session uses `materializeCallKey` (`resolveExecAuth` and `prepareSshSession`);
  only the deploy key of the git sync keeps a name from an id (`git-<id>`, `transportFactory.ts:286`); pinned also by
  `sshConnectKeyName.test.ts` and T-N17a.
- **`research/module_tests.md`**: the rows of the connect path and of the seam (`:1159-1160`) get the new suite, T-N17a, T-N17b,
  T-N17c, G1 and what T20 and T21 now prove; write the counts that the runner prints, not the counts of this document. The
  paragraph of the scan (`:2448-2452`): the list is two files, and S2 compares with two names.
- **`todo/README.md`**: the row of the parent says what is built. The row of this spec is the lead's (notes, item 9).
- The parent's §13 N17 line and the promotion are not part of this story.

## 8. Order of work, and the commits

Every commit is green (`git-workflow.md` rule 2). The RED states stay in the working tree, never committed: run, read, save the
text, go on. The body of c1 is the record of the RED proof.

| State or commit | Holds | The state of `npm test` | Message |
|---|---|---|---|
| state 1 (RED, not committed) | step 1: the scan | 1 red: S1, with `sshSession.ts:13` and `:472` | — |
| state 2 (RED, not committed) | step 2: W1 to W5 | the same 1 red, no other; `typecheck` clean | — |
| state 3 (RED, not committed) | step 3: FX, T-N17a, T-N17b, T-N17c, G1, T20, T21, L1 to L11 | 18 red (§1), no other; FX and G1 pass | — |
| c1 | steps 1 to 5: the states above, the fix, and the results of M1 to M6 | green | `fix(ssh): the key file of a terminal is named call-<uuid>.key, with no id of a key entry (N17)` — its body quotes the S1 failure, one failure text of each of T-N17a, T-N17b, T-N17c, T20, T21 and one L row, the count 18, the pass, and the red tests of each mutation |
| c2 | step 6: the documents | green | `docs(ssh): N17 — the CHANGELOG and the module documents` |

## 9. Done when (each item can be counted)

- [x] **S1 first.** The first run of S1 failed with exactly 2 sites in 1 file (`sshSession.ts:13`, `:472`).
- [x] **The world.** After step 2, `typecheck` exits 0 and `npm test` shows 1 failed test (S1).
- [x] **RED.** In state 3, 18 tests fail, each one by its assertion, 0 compile errors; FX and G1 pass. The texts are saved.
- [x] **GREEN.** After the fix the 18 pass. `npm test`, `npm run typecheck` and `npm run lint` are clean, with no new
      `eslint-disable`.
- [x] **The callers.** `grep -rlw materializePrivateKey src --include=*.ts --exclude-dir=test` (in `src_vs_code`) gives exactly 2
      files: `keyInstaller.ts`, `transportFactory.ts`. `grep -c materializePrivateKey src/sshSession.ts` and
      `grep -c keyEntityId src/sshSession.ts` each give 0.
- [x] **No literal.** `grep -rn "keys/k1" src/test` gives 1 line, the comment at `test/sshConnectRemote.test.ts:38`.
- [x] **The 6 mutations** each turned at least 1 named test red, and each was restored.
- [x] **No other file.** The files of *Files with no change* have no difference against `50345d34`.
- [x] **The documents** of §7 are in c2.

## 10. Break it — ways to make the tests pass while the leak stays, and the row that stops each one

| # | The wrong way | What stops it |
|---|---|---|
| B1 | The product still gives the id to the writer, and the WORLD drops it (the sibling of the world writes a call name) | S1. M1: with the old call back, the 18 must go red; a world that drops the id keeps them green. The review reads W1: the sibling still builds its name from `entityId` |
| B2 | The world makes up the name (`'call-test'`) | W1 takes the name from the real `callKeyName`. T-N17c and T20 need two different names. `CALL_KEY_FILE` needs a uuid |
| B3 | The suffix of the session becomes the name (`materializePrivateKey(storageDir, 'call', content, suffix)`): a call-shaped name under `isolate` | S1. T-N17a (non-isolated): `call.key` is no call name. T20: the key name must not hold the pin's suffix |
| B4 | A name that is a digest of the id: no test finds the id as text | S1, when the name goes through the old writer. In every case T-N17c: one key entry, two Connects, two names (a digest gives one) |
| B5 | The id goes into the folder, not the name | T-N17a reads the whole path. T-N17b and T-N17c read the whole line |
| B6 | T-N17b is proven on the stand-in of `terminalManager`, which composes nothing | `realTerminal: true`; assertion 2 of T-N17b reads `sent` of the terminal that the real `openSshTerminal` created. The review checks that the map of mocks of that world has no `./terminalManager` |
| B7 | The line never holds the path, so the absence passes | Assertion 2 of T-N17b and assertion 4 of T-N17c (the positive) |
| B8 | The reader of the leaks is dead, or the id is in the world by another road | FX. M6 |
| B9 | The fix is done only for the non-isolated road (the roads keep `<id>-<uuid>.key`) | T-N17a (isolated). T20 |
| B10 | The pin loses its suffix together with the key | T20 (the pin pattern, the two suffixes). M5 |
| B11 | The key is forgotten on any close, or on the first close for both | T-N17c steps 6 and 7. G1. L6. M3 |
| B12 | A literal row is made green by comparing `undefined` with `undefined` | `writtenCallKey` checks the length first |

## 11. Not verified by this spec

- The new tests were not written or run. What a test shows today comes from reading the code, from the baseline run (F13) and
  from the scratch run of F8. The first run of each step is the check. A difference from §1 goes to the lead before any fix.
- **No test drives the agent's `sshTerminalAction` into the real `connectEntity`** (F7). T-N17b calls `connectEntity` with the
  options that the agent's action passes. The call at `sshUseActions.ts:382` is one line and adds no text to the terminal.
- **The roads** (`sshRoad.ts`, `dependencyRunHost.ts`, the folder run) are not run by a new test. They call the same
  `prepareSshSession` with `isolate: true` (`sshRoad.ts:68`); T-N17a (isolated) and T20 prove what the seam hands them. Their
  typed line comes from `remoteLaunch.ts`, which this story does not change.
- A real `ssh`, a real VS Code terminal and Windows. On `win32` the line is quoted by `windowsWord`; F8 saw the same text for
  the world's path, which has no character that needs it. The story adds nothing to the quoting.
- An agent "that reads a terminal" is the parent's reading of the risk (its §1). No test reads a terminal as an agent would.

## Notes for the lead

Nothing below is decided in this spec. Each note says what the spec does meanwhile, inside the plan as written.

1. **A second Connect of a LIVE session leaves one more key file until the terminal closes.** The real `openSshTerminal` gives
   back the live terminal of the entry and types nothing (F5, F8). `prepareSshSession` has already written a key by then. Today
   that is the same path, written again. After the fix it is a new file that no `ssh` reads, and each further click adds one.
   All of them are deleted when that terminal closes (each has its own listener). The parent's §2 describes two Connects as two
   terminals; that holds only when the first has ended. The parent has no growth line for it. The spec adds the guard G1 (every
   file is forgotten at the close) and nothing more. A product change (forget the new key at once when the terminal was reused)
   needs `openSshTerminal` to say that it reused, and is not in the plan. G1 is the one scenario here that the parent's §3 does
   not name: strike its row and the mentions of G1 if it is not wanted.
2. **T-N17c uses the real terminal manager, not one handle per open of the stand-in.** The parent's §3 item 2a asks for one
   handle per open in `sshConnectWorld.ts`. With `realTerminal` the handles come from the real rule (the first terminal ended).
   The stand-in keeps its one `opened` object, so no older test changes. T-N17c is red today at the distinct-paths assertion,
   before a close is read.
3. **The literal is in three test files, not one.** The parent's §3 item 5 names `sshSession.test.ts` and its world.
   `/storage/keys/k1.key` is also asserted in `sshConnect.test.ts` (4 lines) and `sshConnectRemote.test.ts` (6 lines): 7 more
   tests (L5 to L11). They would go red at the fix.
4. **The world needs its new member before the fix.** The stand-in of `./keyInstaller` has no `materializeCallKey` (F6). Without
   step 2 the fixed product would answer `key-write-failed` in every test, because the `try` of `keyFile` catches the `TypeError`.
5. **S1 names two lines.** The parent's §3 item 6 says that S1 fails at `sshSession.ts:472`. The import at `:13` is a site too.
6. **The fix is seven edits in one file, not one line** (§5): the import, the call, the parameter and its one caller, the field
   `Resolved.suffix` and its spread, and the docblock of `isolate`. All follow from the parent's §2.
7. **Mutations beyond the parent's §3.7.** M1 is the parent's. M2 and M3 are from the brief for this spec. M4, M5 and M6 are
   this document's (the list, the pin's suffix, the reader of the leaks). The parent says that M1 turns T-N17a, T-N17b and S1
   red; it also turns T-N17c, T20, T21 and the L rows red.
8. **Docblocks that go stale and that this story may not touch.** `keyInstaller.ts:147-150` says that `sshSession.ts` passes the
   id of a key entry and a suffix; `:172-173` says that `materializeCallKey` is for a call of an agent or a road of
   `resolveExecAuth`. Both sit on lines that PR #365 moves (F15). `materializedKeys.ts:102` says "of ONE call of an agent". They
   belong to the parent's follow-up F1. Also found: after the fix nothing in the product reads `keyEntityId` of a stored-key
   source (`sshCredential.ts:27`, `:86`). Not removed here; a candidate follow-up.
9. **Owed with the commit that adds this file:** a row for it in `todo/README.md` (`planning-docs.md`: a README row is in the
   same commit as the file that it links). The spec changed no file but the parent (its `## Epics`) and itself.
10. **The parent has no `## Plan changes` ledger.** `plan-change-control.md`: the commit of the first passing plan round writes
    the heading and the line of epoch 1. The status line says "in progress" and names no approval. Not added here.
11. **The heading of the epics section is `## Epics`,** not `## 8. Epics and stories` as the brief asked: `planning-docs.md`
    names that heading, and every plan of this repository uses it.
12. **The parent's Definition of Done** (§7) names T-N17a, T-N17b and the scan as watched RED; it does not name T-N17c. Its §1
    gives `sshSession.ts:466-479` and `sshConnect.ts:115-129`; the functions are at `:465-480` and `:117-134`. Its list of the
    `cleanup()` owners misses `commands/folderRunCommand.ts:280`. `research/module_tests.md:1159` says 24 tests for
    `sshConnect.test.ts`; the runner shows 34.
