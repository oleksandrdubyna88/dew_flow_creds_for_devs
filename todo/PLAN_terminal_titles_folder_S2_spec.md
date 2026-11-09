# PLAN — S2 spec: one key for every entry terminal (CORNERSTONE)

> Status: **built on `feat/terminal-titles-folder`, 2026-11-09 (commit of S2; deviations in the parent's `## As built`).** Scope: `src_vs_code/src/pinnedTerminal.ts`, `terminalGuard.ts`,
> `commands/runCommands.ts`, `commands/folderRunCommand.ts`, `vpnLauncherRun.ts`; the fakes `test/arrowWorld.ts`,
> `test/vpnWorld.ts`, `test/folderWorld.ts`; the new `test/terminalTitleRoads.test.ts`; expectation updates in seven suites.
> Story S2 of [PLAN_terminal_titles_folder.md](PLAN_terminal_titles_folder.md) (§Design "Signature changes", §Test plan items
> 2–4, §Stories S2). Its own file because the parent goes whole to the review gate and must stay short; promoted with it.
> Needs S1 merged into the branch (the module `terminalTitles.ts` exists and its nine tests pass).

## S2.0 — Facts this spec rests on (verified 2026-11-09, by line)

| # | Fact | Consequence |
|---|---|---|
| F1 | `entryTerminalName` (`pinnedTerminal.ts:155-157`) is the ONE builder of an entry terminal's title, read by `openEntryTerminal` (:134), `liveTerminalsOfEntry` (:146) and through it `liveEntryTerminal` (:168). `launchScript` builds its own string (`runCommands.ts:221`). | Four sites become `entryTerminalTitle(key)`; nothing else in `src/` composes an entry title. |
| F2 | `sendGuarded(entryName, terminalOs, lineFor, startGate?)` (`terminalGuard.ts:218-234`) and `typeIntoNew(entryName, terminalOs, lineFor)` (:240-243) pass the name straight to `findEntryTerminal` / `openEntryTerminal`. | Both take the key and pass it through; nothing else in them changes. |
| F3 | `Entry` (`runCommands.ts:50-55`) is built once in `entryAt` (:57-64) from `nodeAt`'s element; `host.storage` is a `StorageManager` whose `getNode(accountId, id)` is synchronous (`storageManager.ts:409`). | The key is one more field of `Entry`, built in `entryAt` from storage. |
| F4 | For a history row `nodeAt` answers `{ ...element.node, name: revision.name, details: revision.details }` (`entityViewerCommands.ts:476-480`): the id is the live entry's, the details are the revision's. | The folder comes from the live node, the entry half from the revision's `details.name` (as today). |
| F5 | The launcher is `liveDetails(ctx.storage, ctx.accountId, id)` (`vpnRun.ts:118`), an `EntityMetadata` whose `id` is its node id; `launch(ctx, launcher, line)` (`vpnLauncherRun.ts:108`) has `ctx.storage` and `ctx.accountId`. | `entryTerminalKeyOf(ctx.storage, ctx.accountId, launcher.id, launcher.name)` needs no new parameter. |
| F6 | `folderAt` (`folderRunCommand.ts:458-466`) re-reads the folder node from storage and keeps only `id` and `name`; `FACTS` is a module constant (:437-440); `openTerminals` (:512), `appeared` (:538) and `typeLine` (:544) build the title from `row.name`. `planFolderRun` passes the same `row.name` to `facts.isOpen` (`folderRun.ts:144`), and `row.name` is `details.name` for every row with a line (:96). | `Folder` keeps the node; one `keyOf(folder, name)` serves the four readers with the same input the planner used. `FolderFacts` keeps `isOpen(name)`. |
| F7 | `arrowWorld.run` writes the stored node and the element from one record with no `parentId` (`arrowWorld.ts:86-89`); `registerRunWorld` fixes `storageDir: '/storage'` (:61); `storageOf` answers `{ id, details }` for entries and `undefined` otherwise (`vpnWorld.ts:294-299`); `folderWorld`'s `T` is the literal `` `CredsForDevs: ${name}` `` (`folderWorld.ts:14`) and every entry is a child of folder `f` (:79-88). | §S2.2 adds a parent to each fake; `T` becomes the real title of a direct child of the folder node. |
| F8 | The world's `dispose` closes nothing: the terminal stays listed and live (`vpnWorld.ts:32-33, 130-133`). A modal gets its first button unless `modal: 'last'` / `'dismiss'`; `holdDialogs` holds one for the test (:163-172). | "Left alone" is asserted as `disposed === 0`; `TYPE_ANYWAY` is the first (only) button of the busy question. |
| F9 | `scriptRunPlan('bash', platform)` answers `run` on every platform (`scriptRun.ts:18-21`); `writeScriptFile` writes under `materializedKeyPath(storageDir, …)` and runs `lockToOwner` (`runCommands.ts:233-239`). | The script test uses `scriptLanguage: 'bash'` and an owned directory. |
| F10 | `transitSecretReport.ts`, `moveGate.ts`, `corpPolicy.ts`, `entityKind.ts`, `trash.ts` import no `vscode` (grep, 2026-11-09). | `terminalTitles.ts` stays importable from a test without the stub. |

## S2.1 — What S2 delivers, and what it leaves

Delivers: every terminal opened FOR an entry — the green arrow, a VPN launcher entry, a folder run row, the script run —
is found and created under `entryTerminalTitle(key)`, and every road builds its key from the current stored tree in one
way. Leaves to S3: `CredsForDevs: before <owner>` (`dependencyRunHost.ts:169`), `CredsForDevs run: <name>`
(`runCommands.ts:368`), `CredsForDevs VPN: <name>` (`vpnRun.ts:240`), the help, the scan. Leaves to S4: CHANGELOG and research.

## S2.2 — The fakes: exactly what to add

**`test/arrowWorld.ts`**

- `export interface ArrowOptions extends WorldOptions { parent?: TreeNode; elementParentId?: string | null; storageDir?: string }`.
  `arrowWorld(opts: ArrowOptions = {}, trusted, refSource)`.
- In `invoke`: when `opts.parent` is set, `nodes[opts.parent.id] = opts.parent` once, and the stored entry node gets
  `parentId: opts.parent.id`. The ELEMENT handed to the handler gets `parentId: 'elementParentId' in opts ? opts.elementParentId
  : opts.parent?.id` — the stale-element case passes an id that storage does not know. Put this in a helper
  `elementOf(opts, entry, nodeName)` so `invoke` stays under complexity 4.
- `runScript(entry, nodeName?)`: `invoke('credSshManager.runScript')`, exported on `ArrowWorld`.
- `RunWorldHost.storageDir?: string`; `registerRunWorld` passes `storageDir: host.storageDir ?? '/storage'`; `arrowWorld`
  forwards `opts.storageDir`.
- A test helper in the new suite, not in the world: `folder(id, name, parentId: string | null = null): TreeNode` →
  `{ id, name, type: 'folder', folderType: 'terminal', parentId }`.

**`test/vpnWorld.ts`**

- `storageOf(nodes, config = …, placed: Record<string, TreeNode> = {})`: `placed[entryId]` is the folder node that entry
  sits in. `getNode(_a, id)`: an entry → `{ id, details: nodes[id], parentId: placed[id]?.id }`; otherwise
  `folderIn(placed, id)` (a folder of `placed` by its id, else `undefined`). A helper `folderIn` keeps `getNode` at
  complexity ≤ 3. An unknown id still answers `undefined` (`dependencyChain.test.ts:75-83` relies on it).

**`test/folderWorld.ts`**

- `export const FOLDER_NODE: TreeNode = { id: 'f', name: FOLDER, type: 'folder', folderType: 'terminal', parentId: null }`;
  `treeOf` uses `{ ...FOLDER_NODE, ...o.folder }` (the two overrides in `folderRunCommand.test.ts:330-331` change
  `folderType` and `parentId`, never the name, so `T` stays right for them).
- `T = (name: string): string => entryTerminalTitle(entryTerminalKey(name, FOLDER_NODE))` — `Creds: claude sessions / <name>`.
  `named`, `listedLive`, `preopened: [T(…)]` and every existing assertion follow without edits.
- A test that renames the folder (C4) builds its title with the two functions directly.

## S2.3 — Test scenarios

All in `src/test/terminalTitleRoads.test.ts` unless a file is named; `cleanupScope` / `ownedDir` from
`scripts/lib/leftovers.cjs` for the script directory, as `dependencyChain.test.ts:8-12` does. Expected titles are built
with `entryTerminalTitle` / `entryTerminalKey` imported from `../terminalTitles` — the import is pure and cheap. **RED
first:** the fakes of §S2.2 and this file are written on S1's tree, `npm test` is run once, and the failures named below
are recorded (the message, not a paraphrase) before any production file changes. The folder scenarios reuse the world's
`arrow(id)`, which hands the handler the stored node (`folderWorld.ts:114`).

**A — the green arrow (`arrowWorld`)**

| # | Test | Given | When | Then | RED today |
|---|---|---|---|---|---|
| A1 | `the_arrow_titles_its_terminal_with_the_stored_parent_folder` | `arrowWorld({ parent: folder('ops-id', 'ops') })`, entry `alert` with line `tmux attach -t alert`, trusted | `run(entry)` | `terminalNamed(aw, entryTerminalTitle(entryTerminalKey('alert', folder)))` — `Creds: ops / alert` — has `sent` `[L]`; `aw.terminals.length === 1` | yes: `no terminal "Creds: ops / alert" — opened: CredsForDevs: alert` |
| A2 | `an_element_with_an_old_parent_id_still_gives_the_current_folder` | as A1 plus `elementParentId: 'moved-from'` (unknown to storage) | `run(entry)` | the title is `Creds: ops / alert` (a reader of the element's `parentId` would answer the dangling id and `Creds: alert`) | yes |
| A3 | `a_root_entry_keeps_the_bare_title` | `arrowWorld()` with no parent | `run(entry)` | `Creds: alert`; nothing named with ` / ` | yes: today `CredsForDevs: alert` |
| A4 | `a_history_row_takes_the_live_entrys_folder` | parent `ops`; `runRevision(live, { name: 'row-name', details: E('older', 'x {name}') })` | | `aw.terminals.map(name)` is `['Creds: ops / older']` (F4: the revision's `details.name`, the live node's folder) | yes |
| A5 | `the_arrow_finds_a_terminal_titled_with_the_folder` | parent `ops`; `preopened: [Creds: ops / alert]` (built with the functions); the default modal answer (first button, `TYPE_ANYWAY`) | `run(entry)` | `aw.terminals.length === 1` and that terminal's `sent` is `[L]`; `aw.warnings` holds the busy question naming `"Creds: ops / alert"` | yes: today a second terminal `CredsForDevs: alert` is created (length 2) |

**B — the VPN launcher (`vpnWorld`, `startVpn`)**

| # | Test | Given | When | Then | RED today |
|---|---|---|---|---|---|
| B1 | `the_launcher_uses_its_own_folder_not_the_vpns` | `ownerChain()`; `storage: storageOf(nodes, undefined, { start: folder('x', 'X'), vpn: folder('y', 'Y') })` | `startVpn` | `started === true`; `terminalNamed(w, Creds: X / start openvpn).sent.length === 1`; no terminal whose name includes `Y /` | yes: `no terminal "Creds: X / start openvpn" — opened: CredsForDevs: before ops relay stage, CredsForDevs: start openvpn` |
| B2 | `the_arrow_and_the_launcher_share_one_terminal` | as B1 with `preopened: [Creds: X / start openvpn]` and `shellEvents` = `noteOurSend` + `shell.start` + `shell.end(…, 0)` on it (the shape of `launcherBusyTerminal.test.ts:23-33`) | `startVpn` | the launcher's line is typed into the preopened terminal; `w.terminals.filter(name === title).length === 1` | yes: a second terminal `CredsForDevs: start openvpn` appears |
| B3 | existing `dependencyChain.test.ts:29,41,51,82,92,111`, `launcherBusyTerminal.test.ts:19`, `commandNameRoads.test.ts:214` | `storageOf` without `placed` | | the launcher's title is `entryTerminalTitle(entryTerminalKey('start openvpn', undefined))` — `Creds: start openvpn`; the absence checks at :41 and :82 look for that title (a check for a title nobody builds would pass forever) | yes, after the expectation edit |

**C — the folder run (`folderWorld`)**

| # | Test | Given | When | Then | RED today |
|---|---|---|---|---|---|
| C1 | `rows_run_under_the_folders_title` | `folderWorld([session('a'), session('b')])` | `click()` | `named(w, 'a')` (title `Creds: claude sessions / a`) has `sent` `[L('a')]`, same for `b`; `w.infos` is `Typed 2 of 2 …` | yes, once `T` changes: `named` finds nothing — the same failure appears in `a_run_types_each_line_into_its_own_new_terminal_and_reports_typed` |
| C2 | `the_arrows_terminal_is_closed_by_close_open_terminals_and_run` | `folderWorld([session('a')], { trusted: [['a', L('a')]], modal: 'last' })` | `await w.arrow('a')` then `await w.click()` | the modal lists `a` under `Terminal already open`; the arrow's terminal has `disposed === 1`; a second terminal of the same title has `sent` `[L('a')]`; `w.infos` is `Typed 1 of 1 in "claude sessions". Typed: a.` | **no** — a guard: true today under the old title and after under the new one; it proves the agreement survives the key |
| C3 | `an_old_title_is_not_counted_as_open` | `folderWorld([session('a')], { preopened: ['CredsForDevs: a'] })` (the ONE literal; S3's scan allow-lists this line with the reason "the pinned one-time effect") | `click()` | the modal has only `Run`; the old terminal has `sent []`, `disposed 0`; `named(w, 'a')` has one terminal with `[L('a')]`; `w.infos` is `Typed 1 of 1 …` | yes: today the row is `open`, left alone, `Typed 0 of 1` |
| C4 | `a_folder_name_with_a_tab_is_escaped_in_the_title` | `folderWorld([session('a')], { folder: { name: 'a\tb' } })` | `click()` | `w.terminals.map(name)` is `[entryTerminalTitle(entryTerminalKey('a', { ...FOLDER_NODE, name: 'a\tb' }))]` — `Creds: a\u0009b / a`; the report says `Typed 1 of 1` (no folder-name refusal; the entry name `a` is clean) | yes |
| C5 | existing `after_a_split_name_the_folder_run_and_the_arrow_find_the_same_terminal` and `…reads_the_terminal_the_arrow_opened_as_open` (`folderRunEdges.test.ts:216-240`) | unchanged text, `T` now carries the folder | | both pass: the arrow's key (from the stored node, parent `f`) and the folder run's `keyOf(folder, 'alert')` give one title | they go RED with the new `T` until the code changes |

**D — the script run (`arrowWorld.runScript`)**

| # | Test | Given | When | Then | RED today |
|---|---|---|---|---|---|
| D1 | `the_script_terminal_carries_the_folder` | `arrowWorld({ parent: folder('ops-id', 'ops'), storageDir: ownedDir(scope, 'script') })`; entry `{ id: 's1', name: 'sc', isScript: true, script: 'echo hi', scriptLanguage: 'bash', isSshEnabled: false }`; `preopened: [Creds: ops / sc]` | `runScript(entry)` | the preopened terminal has `disposed === 1` (`fresh`); a second terminal `Creds: ops / sc` has one `sent` starting `bash ` and naming a file under the owned directory; `filesUnder(dir)` holds one `script-s1.sh` | yes: today `CredsForDevs: sc`, the preopened one untouched |

**E — expectation updates (RED after the edit, green after the code)**

`busyTerminalGuard.test.ts:14` `A` and `:96` regex; `launcherBusyTerminal.test.ts:19` `S`; `commandNameRoads.test.ts:49,67,68,74,82,98,214`;
`dependencyChain.test.ts:29,41,51,82,92,111`; `terminalActivity.test.ts:232` (a pure text test; the name through the
function so no old literal remains). Each becomes `entryTerminalTitle(entryTerminalKey('<name>', undefined))` or a module
const built from it. Not touched in S2: every `CredsForDevs: before …` (`dependencyChain:27,110,131`, `launcherBusyTerminal:45`,
`commandNameRoads:190`, `BEFORE` in the two folder suites), `vpnGoneRequest.test.ts:34`, `folderRunHelp.test.ts:49`.

## S2.4 — The brief: signature changes

**`src/pinnedTerminal.ts`**

- Import `{ EntryTerminalKey, entryTerminalTitle } from './terminalTitles'`.
- `:123` `export function findEntryTerminal(key: EntryTerminalKey, terminalOs: string | undefined): EntryLookup` —
  `usableEntryShell(key.entryName, terminalOs)` (:124), `liveEntryTerminal(key, usable.choice)` (:125).
- `:129` `export function openEntryTerminal(key: EntryTerminalKey, terminalOs: string | undefined): EntryTerminal` —
  `usableEntryShell(key.entryName, terminalOs)` (:130); `:134` `const name = entryTerminalTitle(key);`.
- `:145` `export function liveTerminalsOfEntry(key: EntryTerminalKey): readonly vscode.Terminal[]` — `:146`
  `const name = entryTerminalTitle(key);`.
- `:155-157` `entryTerminalName` deleted.
- `:167` `function liveEntryTerminal(key: EntryTerminalKey, choice: EntryShell)` — `:168` `liveTerminalsOfEntry(key)`.
- Unchanged: `entryOpenRefusal(entryName, terminalOs)` (:151), `usableEntryShell(entryName, terminalOs)` (:173),
  `pinnedTerminal`, `sendPinned`, `reusableTerminal`.
- Comments: `:117-122` "the first live terminal of the entry's name" → "of the key's title"; `:141` likewise; `:23` says the
  key comes from `terminalTitles.ts`.

**`src/terminalGuard.ts`**

- Import `{ EntryTerminalKey } from './terminalTitles'`.
- `:218-223` `sendGuarded(key: EntryTerminalKey, terminalOs, lineFor, startGate?)`; `:224` `findEntryTerminal(key, terminalOs)`;
  `:229` `typeIntoNew(key, terminalOs, lineFor)`.
- `:240` `typeIntoNew(key: EntryTerminalKey, terminalOs, lineFor)`; `:241` `openEntryTerminal(key, terminalOs)`.

**`src/commands/runCommands.ts`**

- Import `{ EntryTerminalKey, entryTerminalKeyOf, entryTerminalTitle } from '../terminalTitles'`.
- `:50-55` `interface Entry { …; readonly key: EntryTerminalKey }`.
- `:63` `return { accountId, id, name, details, key: entryTerminalKeyOf(host.storage, element.accountId, element.node.id,
  element.node.details.name) };` — inside the return literal, no new branch (`entryAt` is at complexity 3 today).
- `:137` `sendGuarded(entry.key, entry.details.terminalOs, () => line)`; the comment at `:133-134` says the title is
  `entryTerminalTitle(key)`, folder and `details.name`.
- `:221` `pinnedTerminal(entryTerminalTitle(ready.entry.key), { env: resolved.env, fresh: true })`.
- `:368` NOT touched (S3).

**`src/vpnLauncherRun.ts`**

- Import `{ entryTerminalKeyOf } from './terminalTitles'`.
- `:116` `sendGuarded(entryTerminalKeyOf(ctx.storage, ctx.accountId, launcher.id, launcher.name), launcher.terminalOs,
  (family) => withConfig(line, configPath, family), ctx.startGate)`; a one-line `launcherKey(ctx, launcher)` helper if the
  line gets long. The comment at `:113-115` gains: the LAUNCHER's own folder, not the VPN's.

**`src/commands/folderRunCommand.ts`**

- Import `{ EntryTerminalKey, entryTerminalKey } from '../terminalTitles'` and `type { TreeNode } from '../types'`.
- `:426-430` `interface Folder { accountId; id; name; readonly node: TreeNode }`; `:465` `{ accountId: element.accountId,
  id: found.node.id, name: found.node.name, node: found.node }`.
- `:437-440` `FACTS` deleted; in its place
  `function keyOf(folder: Folder, name: string): EntryTerminalKey { return entryTerminalKey(name, folder.node); }` and
  `function factsOf(folder: Folder): FolderFacts { return { shellRefusal: entryOpenRefusal, isOpen: (name) =>
  liveTerminalsOfEntry(keyOf(folder, name)).length > 0 }; }`.
- `:488` `planFolderRun(host.storage.getChildren(folder.accountId, folder.id), factsOf(folder))`.
- `:500` `openTerminals(plan, folder)`; `:512-514` `function openTerminals(plan: FolderPlan, folder: Folder): Authorised` with
  `liveTerminalsOfEntry(keyOf(folder, row.name))`.
- `:525` `typeAll(plan, closing, authorised ?? NOTHING_AUTHORISED, folder)`; `:532-535` `function typeAll(plan, closing,
  authorised, folder: Folder)` passing `folder` to `appeared(r, authorised, folder)` and `typeLine(step.row, …, folder)`.
- `:538-541` `function appeared(row: LineRow, authorised: Authorised, folder: Folder): boolean` with
  `liveTerminalsOfEntry(keyOf(folder, row.name))`.
- `:544-553` `function typeLine(row: LineRow, toClose: readonly vscode.Terminal[], folder: Folder): FolderOutcome` with
  `typeIntoNew(keyOf(folder, row.name), row.details.terminalOs, () => row.line)`.
- The header comment (`:417-424`) gains one sentence: every title of a row is `keyOf(folder, row.name)`, the folder node
  re-read in `folderAt`.

**Not changed:** `src/folderRun.ts` (`FolderFacts.isOpen(name)`, `planFolderRun`), `src/hostShell.ts`, `src/moveGate.ts`,
`src/terminalTitles.ts` (S1's), `src/dependencyRunHost.ts`, `src/vpnRun.ts`.

## S2.5 — The order of edits

1. **Test side first, on S1's tree:** §S2.2 fakes, `terminalTitleRoads.test.ts`, the §S2.3 E updates. `npm run typecheck`
   is green (nothing in production changed); `npm test` is RED on A1–A5, B1–B3, C1, C3–C5, D1 and the E suites. Record the
   messages.
2. `pinnedTerminal.ts` (§S2.4). Typecheck is now red in `terminalGuard.ts` and `folderRunCommand.ts` — expected.
3. `terminalGuard.ts`. Red moves to `runCommands.ts`, `vpnLauncherRun.ts`, `folderRunCommand.ts`.
4. `runCommands.ts`. 5. `vpnLauncherRun.ts`. 6. `folderRunCommand.ts`. After 6: `npm run typecheck` green, `npm run lint` green.
7. `npm test`: everything of step 1 green, nothing else red. If a suite not in §S2.3 E goes red, a title was built
   somewhere this spec did not list — find the builder, do not patch the test.
8. One commit. Do not commit between 2 and 6.

## S2.6 — Pitfalls

1. **Find and create must get the SAME key value.** Four readers (`findEntryTerminal` → `liveEntryTerminal`,
   `openEntryTerminal`, `liveTerminalsOfEntry`, `pinnedTerminal` for the script) call `entryTerminalTitle(key)` and nothing
   else composes a title. In the folder run every key is `keyOf(folder, name)` — never `entryTerminalKey(row.details.name, …)`
   in one place and `row.name` in another, though they are equal today (F6).
2. **The folder run's planner interface stays.** `FolderFacts.isOpen(name)` and `shellRefusal(name, os)` are unchanged;
   the folder node lives in the host's closure (`factsOf`). `git diff src/folderRun.ts` is empty.
3. **The launcher uses its own node.** `launcher.id` and `launcher.name` (F5), never `ctx.details` — the VPN may sit in
   another folder (B1).
4. **`entryAt` reads the stored node's parentId, not the element's.** `entryTerminalKeyOf(host.storage, accountId,
   element.node.id, …)`; `element.node.parentId` is never read (A2). For a revision the id is the live entry's (F4).
5. **An entry gone from storage** gives a key with no folder (parent note 2); do not throw and do not fall back to the element.
6. **Complexity 4, 50 lines, 800 lines.** `entryAt` stays at 3 (the key sits in the return literal). `keyOf`, `factsOf` are 1.
   In the fakes, `getNode` of `storageOf` and `invoke` of `arrowWorld` take a helper each. File sizes after S2:
   `runCommands.ts` ≈ 390, `folderRunCommand.ts` ≈ 190, `terminalTitleRoads.test.ts` ≤ 450.
7. **No `vscode` in `terminalTitles.ts`** (S1's rule, kept): the new suite imports it directly, outside `loadWithVscode`;
   the fakes import it too.
8. **S2 does not touch the three short-prefix titles** nor their tests (§S2.3 E "not touched"). `BEFORE` in the folder
   suites stays `CredsForDevs: before …` until S3.
9. **The world's `dispose` closes nothing** (F8): "left alone" is `disposed === 0`, "closed" is `disposed === 1`; a disposed
   terminal is still listed, so `a_new_terminal_never_comes_from_find` keeps its meaning.
10. **Titles in tests come from the functions.** Only C3 writes an old literal, on purpose; S3's scan allow-lists that line.
11. **`storageOf` must still answer `undefined`** for an id it does not know (`dependencyChain.test.ts:75-83`).
12. **The script test writes a real file.** Owned directory (`ownedDir`), the scope closed in `after`; `lockToOwner` runs
    `icacls` on Windows within its 5 s budget (`materializedKeys.ts:27-37`) — the suite already pays this in
    `materializedKeys` tests.
13. **The arrow's `preopened` terminal (A5) asks** — no evidence of our send; the default modal answer is `TYPE_ANYWAY`, the
    only button. Assert the question text names the new title, so a wrong title shows up in the message, not only in the count.
14. **One scenario per test, under 120 code lines** (`eslint.config.mjs`, the test relaxation).

## S2.7 — Done when

- Every row of §S2.3 A–D passes; every RED of step 1 was seen with its message and is recorded in the commit body or the PR.
- `grep -rn "CredsForDevs: \${" src --include=*.ts | grep -v test` finds only `runCommands.ts:368` (S3's masked run).
- `grep -n entryTerminalName src -r` finds nothing.
- `git diff --stat src/folderRun.ts src/hostShell.ts src/terminalTitles.ts` is empty.
- `npm run typecheck`, `npm run lint`, `npm test` green at lowered priority; nothing outside `src_vs_code` changed.
