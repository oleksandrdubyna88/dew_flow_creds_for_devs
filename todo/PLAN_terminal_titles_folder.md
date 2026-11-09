# PLAN — Terminal titles name the folder, and "CredsForDevs" becomes "Creds"

> Status: **stopped for re-review, 2026-11-09.** S1-S4 are built on `feat/terminal-titles-folder` (local commits,
> not merged); the code gate passed (session d1d8e222, 8 of 8 reviewers) and its accepted finding is change 1.2, the
> plan's second change since approval. No new code until the whole plan is reviewed again. Scope: the VS Code
> extension's terminal titles (src_vs_code/src), five help languages, the changelog and the extension module doc.
> Plan gate: coai `proceed` 2026-11-09 (session d1d8e222, 2 of 2 reviewers).

## Plan changes

> Epoch 1 · approved 2026-11-09 · by reviewers · state: stopped

- 1.1 · 2026-11-09 · reviewer · approach — a folder name's control characters are escaped in the title instead of a new folder-run refusal
  (plan gate findings 0 and 4, and the own Opus review, accepted after the plan's proceed. The same round's other
  edits were judged fixes that satisfy the plan as written: one key constructor for every road, the arrow's key from
  the current stored node, the rebuilt absence checks, the source scan; "script and arrow share one title" was
  dropped because one entry is never both. Gate findings 1, 2 and 3 were rejected with reasons in the gate.)
- 1.2 · 2026-11-09 · reviewer · approach — the folder run re-reads its folder node after the dependency chain, for the re-check and the creation
  (code gate finding 2 and the own Opus bug review: a folder renamed while the chain waits makes the re-check miss a
  terminal the arrow opened under the new name, so a second terminal opens. The consultants split on whether this
  only satisfies the plan as written (consult e5cc1cdc); it needs a new decision for a folder deleted during the wait,
  so it is counted. This second change stopped the plan.)

## Goal

An entry's terminal tab reads `CredsForDevs: external-connect`. The owner asked for:

1. A short prefix: `Creds` instead of `CredsForDevs`.
2. The name of the tree folder that holds the entry, before the entry name.

Owner decisions (asked and answered, 2026-11-09):

- The folder is the CredsForDevs TREE folder that holds the entry, not the VS Code workspace folder. Direct parent
  only, never the path.
- Format `Creds: <folder> / <entry>`. An entry with no parent folder (parentId null or undefined, or a dangling
  parentId) gives `Creds: <entry>`. The Trash folder is a normal parent (`Creds: Trash / x`).
- The folder goes into ONLY the entry terminal (green arrow, a VPN launcher entry, folder run rows) and the
  script-run terminal.
- Short prefix only, no folder: the dependency wait terminal `CredsForDevs: before <owner>` → `Creds: before <owner>`;
  the masked run `CredsForDevs run: <name>` → `Creds run: <name>`; the built-in VPN `CredsForDevs VPN: <name>` →
  `Creds VPN: <name>`.
- Unchanged: `SSH: <host>`, `env check: …`, `Install <tool>`, output channel names, command titles and the
  `CredsForDevs` category, the status bar, the env collection description.
- Terminals opened before the update keep their old title and are NOT found again: the arrow opens a second terminal
  once. The same happens after a folder rename or an entry move. Accepted as a one-time effect, with no fallback search
  for old titles; the CHANGELOG says it.
- This PR may open over the 3-open-PR cap.

## Facts the design rests on (verified)

- A terminal title is both the creation name and the lookup key, matched by exact `t.name === name`:
  `liveTerminalsOfEntry` (src_vs_code/src/pinnedTerminal.ts:145), `openEntryTerminal` (:129), `reusableTerminal` for
  `fresh` (:99), `chainTerminal` (src_vs_code/src/dependencyRunHost.ts:188). No source code matches a title by
  prefix. Find and create must build the same title.
- Tree nodes are flat `TreeNode` with `parentId` (src_vs_code/src/types.ts:374); an entry node's id equals
  `details.id`. `parentFolderOf(storage, accountId, node)` (src_vs_code/src/moveGate.ts:130, no `vscode` import)
  returns the parent node, or `undefined` at the root or for a dangling id. `storage.getNode` is synchronous.
- `nodeAt` returns the element the menu handed over (src_vs_code/src/entityViewerCommands.ts:465), drawn before any
  later move; storage replaces a node object on a move (src_vs_code/src/storageManager.ts:528). `folderAt` re-reads
  storage for this reason (src_vs_code/src/commands/folderRunCommand.ts:71-79).
- `entryShell` / `entryOpenRefusal` / `usableEntryShell` use the entry NAME only for refusal sentences
  (src_vs_code/src/hostShell.ts:140-146) and keep the name.
- The entry half of the title stays `details.name` (src_vs_code/src/commands/runCommands.ts:133-134: a share that
  split `node.name` and `details.name` must not part terminals). A folder run row's `name` is `details.name` for every
  row with a line (src_vs_code/src/folderRun.ts:96).
- A script entry and a command entry are different kinds (`isScript`, src_vs_code/src/commands/runCommands.ts:283;
  menus `:cmd` / `:script`), so one entry never has both an arrow terminal and a script terminal.
- `escapeControl` (used as `shown` in src_vs_code/src/folderRun.ts:19) writes `\n`, `\r`, `\t` as visible escapes.

## Design

A new pure module `src_vs_code/src/terminalTitles.ts` (no `vscode` import) owns every Creds terminal title:

```ts
export interface EntryTerminalKey { readonly entryName: string; readonly folderName: string | undefined }
/** The ONE constructor: the entry's details.name and its direct parent folder node (undefined at the root). */
export function entryTerminalKey(entryName: string, folder: TreeNode | undefined): EntryTerminalKey
/** Reads the CURRENT stored node's parent — never a tree element's possibly old parentId. */
export function entryTerminalKeyOf(source: NodeSource, accountId: string, entryId: string, entryName: string): EntryTerminalKey
export function entryTerminalTitle(key: EntryTerminalKey): string // `Creds: ${escaped folder} / ${name}` | `Creds: ${name}`
export function chainTerminalTitle(ownerName: string): string      // `Creds: before ${ownerName}`
export function maskedRunTitle(name: string): string               // `Creds run: ${name}`
export function vpnTerminalTitle(name: string): string             // `Creds VPN: ${name}`
```

The folder name is written through `escapeControl`, so a tab or a newline in a folder name never reaches a title:
find and create both use the escaped string, for the arrow and the folder run alike, and the folder run needs no new
refusal. The entry half is not escaped (unchanged behaviour; the folder run already refuses such entry names).

Signature changes:

- pinnedTerminal.ts: `findEntryTerminal(key, terminalOs)`, `openEntryTerminal(key, terminalOs)`,
  `liveTerminalsOfEntry(key)`, `liveEntryTerminal(key, choice)`; `usableEntryShell(key.entryName, …)`;
  `entryTerminalName` deleted; `entryOpenRefusal(name, os)` unchanged.
- terminalGuard.ts: `sendGuarded(key, terminalOs, lineFor, startGate?)` and `typeIntoNew(key, terminalOs, lineFor)`
  pass the key through.
- commands/runCommands.ts: `Entry` gains `readonly key: EntryTerminalKey`, built once in `entryAt` with
  `entryTerminalKeyOf(host.storage, accountId, node.id, details.name)` (current storage, not the element). Arrow:
  `sendGuarded(entry.key, …)`. Script run: `pinnedTerminal(entryTerminalTitle(ready.entry.key), { env, fresh: true })`.
  Masked run: `maskedRunTitle(job.entry.name)`.
- vpnLauncherRun.ts:116: the LAUNCHER's own key, `entryTerminalKeyOf(ctx.storage, ctx.accountId, launcher.id,
  launcher.name)`. The launcher may sit in another folder than the VPN; its own arrow must find the same terminal.
- vpnRun.ts:240: `vpnTerminalTitle(ctx.details.name)`. dependencyRunHost.ts:169: `chainTerminalTitle(request.ownerName)`.
- commands/folderRunCommand.ts: `Folder` keeps the folder's `node` (from `found.node`). The module const `FACTS`
  becomes `factsOf(folder)` with `isOpen: (name) => liveTerminalsOfEntry(entryTerminalKey(name, folder.node)).length > 0`;
  `openTerminals`, `appeared` and `typeLine` get the folder and build the key the same way. Every row is a DIRECT child
  of the folder, so the folder node is every row's parent. The pure `folderRun.ts` `FolderFacts` / `planFolderRun`
  are unchanged.

## Test plan (node:test; a failing test first for every new behaviour)

New:

1. `test/terminalTitles.test.ts`: a title with a parent folder; no parent (parentId null, undefined, a dangling id);
   the Trash parent; nested folders give only the direct parent; a folder name with `\t` / `\n` is escaped; the three
   fixed titles; `entryTerminalKeyOf` reads the current stored parent.
2. Folder run command: rows' terminals are titled `Creds: claude sessions / a`; a terminal the arrow opened for an
   entry of the folder is reported open, and closed by `Close Open Terminals and Run` (find and create agree); a
   terminal left with the OLD title `CredsForDevs: a` is not counted as open (the one-time effect, pinned).
3. Arrow: an entry whose stored node has a parent folder gets the folder in its title (`arrowWorld` gains a parent
   option); an element with an OLD parentId still gives the current folder; a launcher in folder X while the VPN sits
   in folder Y gives `Creds: X / start openvpn`.
4. Script run: the script terminal's title carries the folder.
5. A source scan, like `test/commandRoadScan.test.ts`: no file under `src` except `terminalTitles.ts` builds a
   terminal name with `Creds: `, `Creds run: `, `Creds VPN: ` or `CredsForDevs` as a terminal title, and no test
   asserts an old title literal.

Updates (expected titles built through the real functions where the import is cheap): `test/folderWorld.ts` `T`;
`BEFORE` in folderRunCommand / folderRunEdges tests; the regexes `/: b$/` `/: a$/` (still match `… / b`);
dependencyChain (the absence checks at :41, :82, :110 rebuilt with the new functions, so they still test something),
commandNameRoads, launcherBusyTerminal, busyTerminalGuard, terminalActivity, vpnGoneRequest (`/^Creds VPN: /`),
folderRunHelp VERBATIM `Creds: before <folder>`.

## Documentation

- helpEn/De/Es/Ru/Uk.ts line 85: `CredsForDevs: before <folder>` → `Creds: before <folder>` in all five (repo rule 7:
  the label stays English, byte for byte).
- src_vs_code/CHANGELOG.md `## [Unreleased]`: `### Changed — terminal titles name the folder`: the formats, the
  no-folder case, the one-time effect after the update / a rename / a move, and that two entries whose names make the
  same title (e.g. a root entry literally named `x / y` and entry `y` in folder `x`) share one terminal, as two
  same-named entries in one folder already do.
- research/module_extension.md (~2208-2216, 2297-2300): `terminalTitles.ts` owns every title; find and create share
  one key.
- No version bump (a release step, not this PR).

## Build order

Stories at the bottom. Each commit is green on typecheck, lint and the extension tests.

## Definition of Done

- [ ] `npm run typecheck`, `npm run lint`, `npm test` in src_vs_code green (lowered priority, capped workers); the
      server, cli, mcp and broker are untouched and their runners not run — the PR says so.
- [ ] Every new behaviour has a test seen failing first, then passing.
- [ ] Help in five languages, CHANGELOG and research/module_extension.md updated.
- [ ] coai code gate run over the whole diff, every finding resolved; own review run at the same time.
- [ ] This plan promoted to research/ with `git mv` as the last step.

## Stories

Four stories, no epics (a small plan; the layout of `research/PLAN_terminal_folder_run.md` §Stories). One branch
`feat/terminal-titles-folder`, one PR, one commit per story, in this order. Every commit is green on `npm run typecheck`,
`npm run lint` (complexity 4 per function, 50 code lines per function, 800 lines per file) and `npm test` in `src_vs_code`,
at lowered priority. Each story names its RED-first tests: a test "seen failing first" is run once against the tree BEFORE
the story's production edit, its failure message recorded in the commit or the PR, then run green.
Cornerstones: 1 of 4 — S2. Its spec: [PLAN_terminal_titles_folder_S2_spec.md](PLAN_terminal_titles_folder_S2_spec.md).

### S1 — The pure title module

- **Cornerstone:** no.
- **Files:** new `src_vs_code/src/terminalTitles.ts`; new `src_vs_code/src/test/terminalTitles.test.ts`; `todo/README.md`
  (two rows, this plan and the S2 spec — `plan-lifecycle.mjs` fails CI for a `todo/PLAN_*.md` with no row; note 3).
- **What changes:** the module of §Design, exactly its seven exports. `entryTerminalKey(name, folder)` stores the folder's
  name as stored (`folder?.name`); `entryTerminalTitle` is the ONE place that writes it through `escapeControl`
  (`transitSecretReport.ts:244`, pure) — so a key compares by value and every title comes out of one function.
  `entryTerminalKeyOf(source, accountId, entryId, entryName)` reads `source.getNode(accountId, entryId)` and
  `parentFolderOf` (`moveGate.ts:130`, pure); an entry not in storage answers no folder (note 2). `NodeSource` is the
  `{ getNode(accountId, id): TreeNode | undefined }` shape `parentFolderOf` already takes. No production caller switches:
  every old literal stays until S2 and S3.
- **Tests** (`terminalTitles.test.ts`, all new; the file does not compile until the module exists — the first green compile
  is the watched transition, and every case below is RED against an empty module body that returns `''`):
  `a_parent_folder_goes_before_the_entry` (`Creds: ops / x`); `no_parent_gives_the_bare_title` (`parentId` undefined,
  `null`, and a dangling id through `entryTerminalKeyOf` with a `getNode` that knows only the entry — all `Creds: x`);
  `the_trash_is_a_normal_parent` (`Creds: Trash / x`); `only_the_direct_parent_is_named` (inner folder inside outer gives
  `Creds: inner / x`); `a_control_character_in_the_folder_name_is_escaped` (`a\tb` → `Creds: a\u0009b / x`, `a\nb` →
  `Creds: a\u000ab / x`, equal to `escapeControl`'s output; the entry half `x\ty` is NOT escaped);
  `the_three_fixed_titles` (`Creds: before o`, `Creds run: n`, `Creds VPN: n`); `the_key_reads_the_stored_parent`
  (a source whose stored node says `parentId: 'now'` answers folder `now`; the function takes an id, so an element's old
  parentId cannot reach it); `an_entry_not_in_storage_has_no_folder` (`getNode` answers `undefined` → `Creds: x`);
  `the_module_imports_no_vscode` (reads its own source: no `from 'vscode'`).
- **Done:** the nine tests pass; `src/terminalTitles.ts` and its test are the only files under `src/` in the diff;
  `todo/README.md` lists this plan and the S2 spec; typecheck, lint, suite green.

### S2 — One key for every entry terminal (CORNERSTONE)

- **Cornerstone:** yes — the spec is [PLAN_terminal_titles_folder_S2_spec.md](PLAN_terminal_titles_folder_S2_spec.md);
  this entry is its summary.
- **Files:** `src/pinnedTerminal.ts`, `src/terminalGuard.ts`, `src/commands/runCommands.ts`, `src/commands/folderRunCommand.ts`,
  `src/vpnLauncherRun.ts`; fakes `src/test/arrowWorld.ts`, `src/test/vpnWorld.ts`, `src/test/folderWorld.ts`; new
  `src/test/terminalTitleRoads.test.ts`; expectation updates in `busyTerminalGuard.test.ts`, `launcherBusyTerminal.test.ts`,
  `commandNameRoads.test.ts`, `dependencyChain.test.ts`, `folderRunEdges.test.ts`, `folderRunCommand.test.ts` (through
  `T`), `terminalActivity.test.ts`. `src/folderRun.ts` is NOT in the diff.
- **What changes:** `EntryTerminalKey` replaces the entry-name string on `findEntryTerminal`, `openEntryTerminal`,
  `liveTerminalsOfEntry`, `liveEntryTerminal`, `sendGuarded`, `typeIntoNew`; `entryTerminalName` is deleted. Every entry
  road builds its key once and in one way: the arrow in `entryAt` from the CURRENT stored node; the script run from the same
  key; the launcher from its OWN node; the folder run from the folder node it re-read, through one `keyOf(folder, name)`
  used for classification, the modal snapshot, the post-await recheck and creation. `FolderFacts` and `planFolderRun` keep
  their signatures. The three short-prefix titles stay as today (S3).
- **Tests, RED first** (in `terminalTitleRoads.test.ts` unless named; each failure message recorded):
  `the_arrow_titles_its_terminal_with_the_stored_parent_folder`; `an_element_with_an_old_parent_id_still_gives_the_current_folder`;
  `a_root_entry_keeps_the_bare_title`; `a_history_row_takes_the_live_entrys_folder`;
  `the_arrow_finds_a_terminal_titled_with_the_folder` (one terminal, not two); `the_launcher_uses_its_own_folder_not_the_vpns`
  (`Creds: X / start openvpn`, nothing under `Y /`); `the_arrow_and_the_launcher_share_one_terminal`;
  `rows_run_under_the_folders_title` (`Creds: claude sessions / a`); `an_old_title_is_not_counted_as_open` (a live
  `CredsForDevs: a` is left alone, the row is `run`); `a_folder_name_with_a_tab_is_escaped_in_the_title`;
  `the_script_terminal_carries_the_folder` (and `fresh` disposes the one of the same title). Guard, not RED (true today and
  after): `the_arrows_terminal_is_closed_by_close_open_terminals_and_run`; the existing
  `after_a_split_name_*` pair in `folderRunEdges.test.ts:216-240` now runs under the folder's title through `T`.
- **Done:** every assertion of an entry terminal's title in `src/test` goes through `entryTerminalTitle` / `T` (no new
  literal); `grep -n 'CredsForDevs: \$' src/pinnedTerminal.ts src/commands/runCommands.ts` finds only the masked run
  (`:368`, S3's); `git diff --stat src/folderRun.ts` is empty; the RED list above was seen failing against S1's tree with the
  test-side edits only, then green; typecheck, lint, suite green.

### S3 — The short prefix on the three other titles, the help and the scan

- **Cornerstone:** no.
- **Files:** `src/dependencyRunHost.ts:169` (`chainTerminalTitle(request.ownerName)`), `src/commands/runCommands.ts:368`
  (`maskedRunTitle(job.entry.name)` — the NODE's name, as today; note 6), `src/vpnRun.ts:240` (`vpnTerminalTitle(ctx.details.name)`);
  `src/helpEn.ts`, `helpDe.ts`, `helpEs.ts`, `helpRu.ts`, `helpUk.ts` line 85 (`CredsForDevs: before <folder>` →
  `Creds: before <folder>`, the label in English in all five, repo rule 7); tests `folderRunHelp.test.ts:49` (VERBATIM),
  `folderRunCommand.test.ts:17` and `folderRunEdges.test.ts:14` (`BEFORE = chainTerminalTitle(FOLDER)`),
  `dependencyChain.test.ts:27,110,131`, `launcherBusyTerminal.test.ts:45`, `commandNameRoads.test.ts:190`,
  `vpnGoneRequest.test.ts:34` (`/^Creds VPN: /`); `src/test/arrowWorld.ts` (the `masked` record gains `name`); new
  `src/test/terminalTitleScan.test.ts`.
- **What changes:** the three titles are built by `terminalTitles.ts`; the help names the new chain title; the scan pins
  that no source but `terminalTitles.ts` builds a title (`Creds: `, `Creds run: `, `Creds VPN: `, `CredsForDevs: ${`,
  `CredsForDevs: before `, `CredsForDevs run: `, `CredsForDevs VPN: `), with an allow-list keyed by file and exact trimmed
  line, each with a reason, and the stale-entry companion of `commandRoadScan.test.ts:101-107`: `transportFactory.ts:261`
  (a warning, not a title), the five `help*.ts` (the help quotes the title to the reader), `folderRunHelp.test.ts` VERBATIM,
  `terminalTitles.test.ts` (the pure tests assert literals), the `an_old_title_is_not_counted_as_open` line (the pinned
  one-time effect), the scan file itself. Over `src/test` the same patterns: no test asserts an old title literal.
- **Tests, RED first:** `terminalTitleScan.test.ts` written before the three edits — it fails naming the three sites and
  the old test literals; `the_chain_terminal_is_titled_creds_before_owner` (dependencyChain: `terminalNamed(w,
  chainTerminalTitle('ops relay stage'))`); `the_masked_run_is_titled_creds_run` (arrowWorld, `runWithSecrets`, the mock's
  `name` is `Creds run: alert`); `the_built_in_vpn_terminal_is_titled_creds_vpn` (vpnGoneRequest's regex finds the terminal
  only after the change — its existing tests are the RED); `every_language_holds_the_labels_and_the_commands_byte_for_byte`
  with the new VERBATIM, before the five help files change. Companion: `the_scan_still_finds_what_it_is_about` (a literal
  fixture matches; `terminalTitles.ts` unexcluded has at least three sites).
- **Done:** `grep -rn 'CredsForDevs: before\|CredsForDevs run:\|CredsForDevs VPN:\|CredsForDevs: \${' src --include=*.ts`
  finds nothing outside the allow-list; the help in five languages carries `Creds: before <folder>`; typecheck, lint, suite
  green.

### S4 — The record

- **Cornerstone:** no.
- **Files:** `src_vs_code/CHANGELOG.md` (`## [Unreleased]`, `### Changed — terminal titles name the folder`: the formats,
  the no-folder case, the one-time effect after the update / a rename / a move, same-title entries sharing a terminal, and the
  script terminal titled by the entry's name — note 1); `research/module_extension.md` (~2208-2216, 2297-2300:
  `terminalTitles.ts` owns every title, find and create share one key, the folder run's `keyOf`); `research/module_tests.md`
  (the test table: `terminalTitles`, `terminalTitleRoads`, `terminalTitleScan`); this plan's status line and an `## As
  built` section (deviations, the RED messages); the S2 spec's status line; the `todo/README.md` rows' status. Last, the
  promotion: `git mv todo/PLAN_terminal_titles_folder.md research/` and the S2 spec with it, `research/README.md` mentions
  both.
- **What changes:** documentation only; no file under `src/` except none.
- **Tests:** none new. `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; `npm test` stays
  green (the help tests read the files).
- **Done:** the CHANGELOG, the two research documents and the plan status say what S1–S3 built; the plan and the spec sit in
  `research/`; the coai code gate ran over the whole diff with every finding resolved, and the own review ran beside it.

### Notes on the design, found while splitting (the design text above is unchanged)

1. **The script terminal's entry half changes from the node's name to `details.name`.** Today `launchScript` titles with
   `ready.entry.name` (`runCommands.ts:221`), which is `element.node.name`; the design's `entryTerminalTitle(ready.entry.key)`
   uses `details.name`. For a share that split the two names the script terminal's title moves. Kept: one key for every
   entry terminal, the arrow's rule (`runCommands.ts:133-134`). S4's CHANGELOG says it in one clause.
2. **A stored node that is gone.** `entryTerminalKeyOf` reads the current stored node; an entry deleted between the menu's
   drawing and the click has none, so the key has no folder and the title is `Creds: <entry>`. The design does not say;
   decided here, pinned by `an_entry_not_in_storage_has_no_folder`.
3. **`todo/README.md` rows.** `plan-lifecycle.mjs` (`.claude/rules/shared/tools/plan-lifecycle.mjs:264-281`) fails for a
   `todo/PLAN_*.md` with no row; the plan's file lists do not name it. S1 adds the rows for this plan and the S2 spec.
4. **`dependencyChain.test.ts:110` is the chain title.** The design groups the absence checks at :41, :82, :110 under one
   rebuild; :41 and :82 look for the launcher's terminal (an entry title, S2), :110 for `CredsForDevs: before` (S3). Split so.
5. **The fakes have no parent today.** `arrowWorld.run` builds the stored node and the element from one record with no
   `parentId` (`arrowWorld.ts:87-88`); `storageOf` answers `{ id, details }` only (`vpnWorld.ts:294-299`); `folderWorld`'s `T`
   is a literal (`folderWorld.ts:14`). The additions are in the spec §S2.2. The script road writes a file
   (`writeScriptFile`, `runCommands.ts:233-239`) under the fixed `/storage` of `registerRunWorld` (`arrowWorld.ts:61`), so the
   script test needs an owned `storageDir` (`ownedDir` of `scripts/lib/leftovers.cjs`, as `dependencyChain.test.ts` does).
6. **The masked run keeps the NODE's name.** `runCommands.ts:368` uses `job.entry.name`; the design's `maskedRunTitle(job.entry.name)`
   keeps that. Only the prefix changes there — written down so S3 does not "fix" it to `details.name`.

## As built

Four commits on `feat/terminal-titles-folder`, one per story. Suite after each: 6998, 7010, 7015 tests, 0 failed, 8 skipped.

RED seen first, by story (messages in the commit bodies):

- S1: `Cannot find module '../terminalTitles'`; then against a stub returning `''`: `actual '' expected 'Creds: ops / x'` and the like (6 of 9).
- S2: on S1's tree `terminalTitleRoads` 12 of 12 (`no terminal "Creds: ops / alert" — opened: CredsForDevs: alert`; the arrow's second
  terminal, 2 against 1; `no terminal "Creds: X / start openvpn" — opened: CredsForDevs: before ops relay stage, CredsForDevs: start openvpn`),
  plus the suites that go through `T` / `rootTitle`.
- S3: the scan named `runCommands.ts:374`, `dependencyRunHost.ts:169`, `vpnRun.ts:240`; `'CredsForDevs run: node-alert'` against
  `'Creds run: node-alert'`; the chain title missing; the help's VERBATIM absent in English.

Deviations from the plan and the S2 spec:

1. The folder-run fakes' regexes `/: b$/`, `/: a$/`, `/: o$/` do NOT still match (the folder stands between the colon and the name);
   they became `/ \/ b$/` etc.
2. `the_arrows_terminal_is_closed_by_close_open_terminals_and_run` (a guard in the spec) also failed on S1's tree: `T` already named the
   folder while the arrow did not. It is a guard only after the code change.
3. A shared `rootTitle(name)` in `vpnWorld.ts` builds a root entry's title from the real functions; the seven suites use it.
4. `dependencyChain`'s trashed-launcher absence check looks for any title ending in the entry half: that launcher's own title would
   name the Trash.
5. The scan's allow-list also holds seven other `CredsForDevs: ${...}` notification prefixes (not terminal titles), the vpnGoneRequest
   regex line and a second old-title line in `terminalTitleRoads.test.ts`; the plan named only `transportFactory.ts:261`.
6. `entryAt`'s key is read from the destructured element in one return statement; `launcherKey(ctx, launcher)` is a small helper in
   `vpnLauncherRun.ts`.
