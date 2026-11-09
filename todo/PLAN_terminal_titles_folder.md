# PLAN — Terminal titles name the folder, and "CredsForDevs" becomes "Creds"

> Status: **epoch 2 open, 2026-11-09; S5 to build.** S1-S4 are built on `feat/terminal-titles-folder` (pushed, not
> merged); the code gate passed (session d1d8e222, 8 of 8 reviewers) and its accepted finding was change 1.2, the
> plan's second change since approval, which stopped the plan. The re-review is done: the revision below (the whole
> plan read again against the built code; story S5 added for change 1.2 and the accepted review clean-ups) went
> through the coai document review (`proceed`, 4 of 4, its one finding accepted) and the own Opus review, and the Opus
> judge marked every commit `fits` in the record's table; their accepted findings are folded in below as the epoch-2
> baseline. Scope: the VS Code extension's
> terminal titles (src_vs_code/src), five help languages, the changelog and the extension and test module docs.
> Plan gate: coai `proceed` 2026-11-09 (session d1d8e222, 2 of 2 reviewers).

## Plan changes

> Epoch 1 · approved 2026-11-09 · by reviewers · state: closed

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

### Re-review for epoch 2

Narrowed: no

| Work | Where | Verdict | Action |
|---|---|---|---|
| S1 — `terminalTitles.ts`, its nine tests, the plan and the todo rows, f8fb23e | pushed, unmerged (`feat/terminal-titles-folder`) | fits | kept; S5 derives `NodeSource` |
| S2 — one key for every entry terminal, the fakes, `terminalTitleRoads.test.ts`, 01a8a41 | pushed, unmerged (`feat/terminal-titles-folder`) | fits | kept; S5 closes the post-wait key |
| S3 — the short prefix on the three other titles, the help, the scan, 7c26422 | pushed, unmerged (`feat/terminal-titles-folder`) | fits | kept; S5 generalises the scan |
| S4 — CHANGELOG, module_extension, module_tests, the As built (the promotion not done), 726d80b | pushed, unmerged (`feat/terminal-titles-folder`) | fits | kept; S5 corrects the docs |
| the stop — the ledger moved under the status block, change 1.2 recorded, ecc0466 | pushed, unmerged (`feat/terminal-titles-folder`) | fits | kept |

> Epoch 2 · approved 2026-11-09 · by reviewers · state: open

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

What the goal is NOT (decided at the re-review, 2026-11-09): no search for old titles; no escaping of ENTRY names in
a title (the folder run already refuses control characters in an entry name; the arrow's name is shown as it is); no
work on the cost of per-row terminal scans (a handful of rows against the window's terminal list, synchronous; not a
measured problem). The reviewers raised the last two and they were rejected as out of scope.

## Facts the design rests on (verified)

Verified against the built branch on 2026-11-09 (`feat/terminal-titles-folder` at ecc0466), unless a line says "before".

- A terminal title is both the creation name and the lookup key, matched by exact `t.name === name`:
  `liveTerminalsOfEntry` (src_vs_code/src/pinnedTerminal.ts:146-147), `openEntryTerminal` (:130-135), `reusableTerminal`
  for `fresh`, `chainTerminal` (src_vs_code/src/dependencyRunHost.ts). No source code matches a title by prefix. Find and
  create must build the same title.
- Tree nodes are flat `TreeNode` with `parentId` (src_vs_code/src/types.ts); an entry node's id equals `details.id`.
  `parentFolderOf(storage, accountId, node)` (src_vs_code/src/moveGate.ts:130-138, no `vscode` import) returns the
  parent node, or `undefined` at the root or for a dangling id. `storage.getNode` is synchronous.
- `nodeAt` returns the element the menu handed over (src_vs_code/src/entityViewerCommands.ts), drawn before any later
  move; storage replaces a node object on a move (src_vs_code/src/storageManager.ts:528). `folderAt` re-reads storage
  for this reason (src_vs_code/src/commands/folderRunCommand.ts:82-90) and keeps the node it read (`Folder.node`).
- **A delete is a move to the Trash.** `moveToTrash` (src_vs_code/src/storageManager.ts:545-560) sets the node's
  `parentId` to the Trash folder's id (`trashedFrom` remembers the old one); `deleteNodeRecursive` (:622) is the only
  permanent removal, and the only way to remove the Trash itself. So a "deleted" entry has the Trash as its parent, and a
  "deleted" folder keeps its name under the Trash while its children keep pointing at it.
- **The folder run's awaits, in order** (src_vs_code/src/commands/folderRunCommand.ts): `folderAt` (sync) →
  `planFolderRun` with `factsOf(folder)` (sync) → `beforeAsking` (sync) → `openTerminals` snapshot (sync, "the same
  tick as the modal's text") → `await showWarningMessage` (the modal) → `await trustAll` → `await runDependenciesFirst`
  (the chain) → `typeAll` (sync to the last send: `settleRow` with `appeared`, then the closes and `typeIntoNew`).
  Nothing is awaited between the folder's re-read and the snapshot; the modal and the chain are the only waits.
- **Today every key of the folder run is `keyOf(folder, name)` = `entryTerminalKey(name, folder.node)`** over the
  node captured before the modal (folderRunCommand.ts:58-60, 137, 164, 172), for the classification, the snapshot,
  `appeared` and `typeIntoNew`. A folder renamed during the wait keeps its old name in every post-wait key: the
  re-check misses a terminal the arrow opened under the new name (change 1.2's cause), and the new terminal opens under
  the old name. An entry moved out of the folder during the wait is likewise still keyed to the folder.
- The arrow and the launcher read their key from storage by id: `entryAt` (src_vs_code/src/commands/runCommands.ts:67,
  `entryTerminalKeyOf(host.storage, accountId, node.id, element.node.details.name)`) and `launcherKey`
  (src_vs_code/src/vpnLauncherRun.ts:110-112). `entryTerminalKeyOf` answers no folder for an entry storage no longer has
  (src_vs_code/src/terminalTitles.ts:31-40).
- **`settleRow` re-reads nothing of the entry** (src_vs_code/src/folderRun.ts:272-281): it asks `appeared(row)` (a live
  terminal of the row's title the person did not authorise closing) and otherwise types the line resolved before the
  modal. An entry deleted or changed during the wait is still typed (pinned: `the_line_typed_is_the_approved_string_even_if_the_entry_changed_meanwhile`,
  src_vs_code/src/test/folderRunCommand.test.ts:84-95). An `open` row with no such terminal under `Run` is reported
  `CLOSED_MEANWHILE` (folderRun.ts:34, :280).
- Closing is authorised per terminal OBJECT from the snapshot (`Authorised`, by row id), never by name afterwards
  (folderRunCommand.ts:37-39, 162-177). Under `Run` the snapshot is NOT handed on (`runChosen` gets `undefined`, so
  `appeared` compares against `NOTHING_AUTHORISED`): today "under `Run`, any live terminal" (folderRun.ts:268-269) is
  true only because the key does not change between the snapshot and the re-check.
- `folderButtons` (folderRun.ts:193-196) shows `Run` only when a `run` row exists and `Close Open Terminals and Run` only
  when an `open` row exists: a test that needs a button must have a row of that kind before the click. A test closes a
  terminal "meanwhile" with `w.exit(terminal)` (sets `exitStatus`, removes it from `window.terminals`;
  folderRunCommand.test.ts:183-194); "still live" is `exitStatus === undefined`.
- A row's `name` and `line` are captured before the modal (`planFolderRun`); an entry renamed during the wait keeps its
  old `row.name` in the folder run while the arrow's key uses the current `details.name`.
- `FolderFacts.isOpen(name)` gets a NAME only (folderRun.ts:64-69; `finalRow` passes `row.name`, :144); two rows may
  share a name (two same-named entries in one folder share one terminal, by design).
- `entryShell` / `entryOpenRefusal` / `usableEntryShell` use the entry NAME only for refusal sentences
  (src_vs_code/src/hostShell.ts) and keep the name.
- The entry half of the title is `details.name` (runCommands.ts: a share that split `node.name` and `details.name` must
  not part terminals). A folder run row's `name` is `details.name` for every row with a line (folderRun.ts:96).
- A script entry and a command entry are different kinds (`isScript`; menus `:cmd` / `:script`), so one entry never has
  both an arrow terminal and a script terminal.
- `escapeControl` (used as `shown` in folderRun.ts:19) writes `\n`, `\r`, `\t` as visible escapes.
- **The fakes.** `folderWorld` exposes `nodes` (src_vs_code/src/test/folderWorld.ts:64), and `folderTarget` carries
  a COPY of the folder node, but `folderAt` re-reads `nodes.find(...)`, so the captured `Folder.node` IS the object
  `nodes[0]`: a test that renames the folder in place (`w.nodes[0].name = …`) also renames the captured node and cannot
  go red against today's code; a test must REPLACE the node object (`w.nodes[0] = { ...w.nodes[0], name }`), as real
  storage does on a move. `held` + `clickAndWait` hold the folder modal; `holdDialogs: /^(Run the entries|Before )/`
  also holds the chain's own dialog (folderRunCommand.test.ts:316), which is a point strictly inside the wait.
  `w.arrow(id)` runs the real arrow handler in the same world (folderWorld.ts:118); `trash: true` adds a Trash folder
  with id `trash` (folderWorld.ts:82). The world's `dispose` closes
  nothing: "left alone" is `disposed === 0`, "closed" is `disposed === 1`.
- `arrowWorld`'s `elementOf` reads `'elementParentId' in opts` (src_vs_code/src/test/arrowWorld.ts:81-84) so that a
  `null` can be passed; no test passes `null`. The doc comment "The world with `runCommands` registered against a fake
  host…" stands above `ArrowOptions` (arrowWorld.ts:70-73), not above `arrowWorld`.
- Four test sites compose `entryTerminalTitle(entryTerminalKey(…))`: `rootTitle` (src_vs_code/src/test/vpnWorld.ts:294),
  `T` (folderWorld.ts:18), `titleIn` (src_vs_code/src/test/terminalTitleRoads.test.ts:31) and
  src_vs_code/src/test/terminalActivity.test.ts:233. `terminalTitleRoads.test.ts:125` asserts `T('a') === titleIn(FOLDER_NODE, 'a')`,
  two calls of the same two functions: a tautology.
- The scan (src_vs_code/src/test/terminalTitleScan.test.ts) matches `CredsForDevs: ${` and the one literal
  `'CredsForDevs: a'`; the first needs seven allow-list lines for notification prefixes (transportFactory, extension ×2,
  treeMutationCommands, wslRelayCommands ×3) that are not titles, and the second catches one spelling of one name.
  Quoted `CredsForDevs: …` strings in `src/test` today: terminalTitleRoads.test.ts:144 and :149 (the pinned one-time
  effect), bridgeConsent.test.ts:486 (`"CredsForDevs: Agent Access"`, an output panel), sshAgentHelp.test.ts:179 and
  :182 (`"CredsForDevs: SSH Agent"`, an output panel), envApply.test.ts:108 (the env collection description) — none is
  an entry terminal title.
- `NodeSource` (terminalTitles.ts:19-21) is a second copy of the `{ getNode(accountId, id): TreeNode | undefined }`
  shape `parentFolderOf`'s first parameter already declares (moveGate.ts:131).
- `dependencyChain.test.ts:118` asserts no terminal `startsWith(chainTerminalTitle(''))` (`Creds: before `), where the
  owner's name is known (`ops relay stage`).
- The S1 commit (f8fb23e) records six of the nine `terminalTitles.test.ts` cases red against a stub returning `''`;
  `no_parent_gives_the_bare_title`, `an_entry_not_in_storage_has_no_folder` and `the_module_imports_no_vscode` are not
  among them. research/module_tests.md says "every case failed", which is not what the commit records.

## Design

A pure module `src_vs_code/src/terminalTitles.ts` (no `vscode` import) owns every Creds terminal title:

```ts
export interface EntryTerminalKey { readonly entryName: string; readonly folderName: string | undefined }
/** The ONE constructor: the entry's details.name and its direct parent folder node (undefined at the root). */
export function entryTerminalKey(entryName: string, folder: TreeNode | undefined): EntryTerminalKey
/** Reads the CURRENT stored node's parent — never a tree element's possibly old parentId. No node: no folder. */
export function entryTerminalKeyOf(source: NodeSource, accountId: string, entryId: string, entryName: string): EntryTerminalKey
export function entryTerminalTitle(key: EntryTerminalKey): string // `Creds: ${escaped folder} / ${name}` | `Creds: ${name}`
export function chainTerminalTitle(ownerName: string): string      // `Creds: before ${ownerName}`
export function maskedRunTitle(name: string): string               // `Creds run: ${name}`
export function vpnTerminalTitle(name: string): string             // `Creds VPN: ${name}`
```

`NodeSource` is derived from `parentFolderOf`'s first parameter (`Parameters<typeof parentFolderOf>[0]`), not declared a
second time (S5). The folder name is written through `escapeControl`, so a tab or a newline in a folder name never reaches
a title: find and create both use the escaped string, for the arrow and the folder run alike, and the folder run needs no
new refusal. The entry half is not escaped (unchanged behaviour; the folder run already refuses such entry names).

**Every road reads its key from storage by the entry's id, at the moment it needs it:**

- Arrow: `Entry.key` built once in `entryAt` with `entryTerminalKeyOf(host.storage, accountId, node.id, details.name)`
  (current storage, never the element's `parentId`); `sendGuarded(entry.key, …)`.
- Script run: `pinnedTerminal(entryTerminalTitle(ready.entry.key), { env, fresh: true })` — the same key.
- Masked run: `maskedRunTitle(job.entry.name)` (the NODE's name, as before; only the prefix changed).
- VPN launcher: `launcherKey(ctx, launcher)` = `entryTerminalKeyOf(ctx.storage, ctx.accountId, launcher.id, launcher.name)`
  — the LAUNCHER's own folder, which may differ from the VPN's; its own arrow must find the same terminal.
- Built-in VPN: `vpnTerminalTitle(ctx.details.name)`; the dependency wait: `chainTerminalTitle(request.ownerName)`.
- Folder run: the timing contract below.

### The folder run's timing contract (change 1.2, settled at the re-review)

The re-review settled change 1.2 as: after the last await every row's key is read per row through `entryTerminalKeyOf`,
the function the arrow and the launcher use; built by story S5. `commands/folderRunCommand.ts` has two reading points
and nothing in between is a key:

1. **Before the modal, synchronous from `folderAt` to the snapshot.** `folderAt` re-reads the folder node from storage;
   the classification (`factsOf(folder).isOpen(name)`) and the modal's `openTerminals` snapshot build their keys with
   `entryTerminalKey(name, folder.node)` over that node. Nothing is awaited between the re-read and the snapshot, and
   every row is a DIRECT child of that folder (`getChildren(folder.id)`), so a per-row read through `entryTerminalKeyOf`
   would answer the same value for every row at this point; `FolderFacts.isOpen(name)` keeps its name-only signature
   (a name-to-id map would be ambiguous for two same-named rows, and `folderRun.ts` stays out of the diff). The
   snapshot's value is the list of terminal OBJECTS per row id.
2. **After the last await (`chain.ready`), in the synchronous post-wait step.** Every row's key for the re-check
   (`appeared`) and for the creation (`typeIntoNew`) is `entryTerminalKeyOf(host.storage, folder.accountId, row.id,
   row.name)` — the SAME function the arrow and the launcher use. The folder node captured before the modal is NOT
   read after the wait (the `Folder` keeps `node` only for the pre-modal keys, or drops it if nothing else needs it).

What follows from 2, each pinned by a test in S5:

- A folder renamed during the wait: the re-check and the creation use the NEW name. A terminal the arrow opened under
  the new name during the wait is found: the row is left alone, no second terminal (the 1.2 bug). A terminal under the
  OLD name that the modal listed is still closed by OBJECT under `Close Open Terminals and Run`, and the line goes into
  a new terminal under the new name.
- **Under `Run`, a terminal the snapshot listed and that is still live counts as `appeared`** (decision at the
  re-review): the row is reported `Left alone, terminal already open`, never `CLOSED_MEANWHILE` ("its terminal closed"
  would be false — the terminal is open under its old title). This is folderRun.ts:268-269's own words, "under `Run`,
  any live terminal", kept true when the key changes. In `folderRunCommand.ts` only: `ask` hands the snapshot to
  `runChosen` under BOTH buttons with `closing` as a separate boolean; `appeared(row)` is: any live terminal of the
  row's CURRENT key not in the snapshot, or — under `Run` only — any snapshot terminal of the row with
  `exitStatus === undefined`. `CLOSED_MEANWHILE` keeps its one case: the snapshot terminal really ended
  (`an_open_row_whose_terminal_closed_under_run_is_not_run_saying_so` stays green). `folderRun.ts` is unchanged.
- An entry moved out of the folder alone during the wait: its key names its NEW parent (or none); the line is typed
  there.
- **A delete during the wait is a move to the Trash** (`moveToTrash`): a trashed entry is typed under
  `Creds: Trash / <name>` (the Trash is a normal parent); a trashed folder keeps its name, so its rows keep
  `Creds: <folder> / <name>` and still run. A permanent removal (`deleteNodeRecursive`: the entry gone, or the folder
  gone with its children dangling) gives no folder and the title `Creds: <name>`. In every case the line is still typed,
  as today (`settleRow` re-reads nothing of the entry) — the run is NOT cancelled. This is the "new decision" change 1.2
  asked for: the Trash and bare titles are `entryTerminalKeyOf`'s existing rules (S1 note 2), the typing is the existing
  behaviour.
- **An entry renamed during the wait — accepted as it is:** the folder run types under the pre-modal `row.name` (the
  name the person approved in the modal, the one the control-character refusal judged), while the arrow's key uses the
  current `details.name`; after such a rename the arrow opens its own terminal once. The same one-time effect the
  owner accepted for a rename or a move; not re-read on purpose.
- Authorisation stays by terminal object from the snapshot; nothing is authorised by name after the modal.

Signature changes (S2, built): pinnedTerminal.ts `findEntryTerminal(key, terminalOs)`, `openEntryTerminal(key, terminalOs)`,
`liveTerminalsOfEntry(key)`, `liveEntryTerminal(key, choice)`; `entryTerminalName` deleted; terminalGuard.ts
`sendGuarded(key, terminalOs, lineFor, startGate?)` and `typeIntoNew(key, terminalOs, lineFor)`; runCommands.ts `Entry.key`;
vpnLauncherRun.ts `launcherKey`; folderRunCommand.ts `Folder.node`, `keyOf`, `factsOf`, `openTerminals(plan, folder)`,
`typeAll(…, folder)`, `appeared(row, authorised, folder)`, `typeLine(row, toClose, folder)`. S5 changes the last three to
take the host's storage and the account (or a `(row) => EntryTerminalKey` reader built once in `runChosen` after the chain)
instead of the folder; `folderRun.ts` stays unchanged.

## Test plan (node:test; a failing test first for every new behaviour)

Built (S1-S3): see §Stories and §As built. Added at the re-review (S5):

6. Folder run, the timing contract (`terminalTitleRoads.test.ts` or a new `folderRunTitlesDuringTheWait.test.ts` if the
   file would pass 450 lines): a rename during the wait with no terminal (created under the new name); with a terminal the
   arrow opened under the NEW name during the wait (left alone, one terminal, under both buttons); with a terminal the
   modal listed under the OLD name (`Close Open Terminals and Run` disposes it by object and types under the new name;
   `Run` leaves it alone, types nothing for that row, reports it `Left alone, terminal already open`); an entry moved out
   alone (typed under the new parent); an entry trashed (typed under `Creds: Trash / <name>`); the folder trashed (title
   unchanged, still runs); the folder removed for good (typed under `Creds: <name>`); an entry removed for good (typed
   under `Creds: <name>`). Every rename or move REPLACES the node object in `w.nodes` (the fact above); a test that needs
   a button has a row of that kind (`folderButtons`).
7. The scan made general: an old entry-title literal in a test is caught in single, double and backtick quotes with any
   name — one matcher per delimiter, so a name holding the other quote character (`"CredsForDevs: O'Brien"`) is caught —
   and in the regex form; a notification prefix (`` `CredsForDevs: ${message}` ``) is NOT a site (a negative fixture).
8. Guards for the clean-ups: `dependencyChain.test.ts:118` exact title; the four title compositions become one `titleIn`.

Updates (built in S2/S3): `test/folderWorld.ts` `T`; `BEFORE` in the two folder suites; the regexes `/: b$/` → `/ \/ b$/`;
dependencyChain's absence checks rebuilt with the new functions; commandNameRoads, launcherBusyTerminal, busyTerminalGuard,
terminalActivity, vpnGoneRequest (`/^Creds VPN: /`), folderRunHelp VERBATIM `Creds: before <folder>`.

## Documentation

- helpEn/De/Es/Ru/Uk.ts: `CredsForDevs: before <folder>` → `Creds: before <folder>` in all five (repo rule 7: the label
  stays English, byte for byte). Built (S3).
- src_vs_code/CHANGELOG.md `## [Unreleased]`, `### Changed — terminal titles name the folder`: the formats, the no-folder
  case, the one-time effect after the update / a rename / a move, same-title entries sharing one terminal, the script
  terminal titled by the entry's own name (built, S4); plus one clause (S5): *Run All in Folder* reads each entry's folder
  again when it types, after its dependencies ran, so a folder renamed or an entry moved meanwhile is found under its
  current title and no second terminal opens beside one the arrow opened.
- research/module_extension.md ("The title is one key"): `terminalTitles.ts` owns every title; find and create share one
  key (built, S4); the folder-run sentence is rewritten to the timing contract — `entryTerminalKey(name, folder.node)`
  before the modal, `entryTerminalKeyOf` per row after the last await, and what a rename, a move or a deletion during the
  wait gives (S5).
- research/module_tests.md ("Terminal titles name the folder"): the test table gains the S5 rows and the scan's general
  matcher; the **Teeth** paragraph says S1 saw 6 of 9 red against the stub and names the three that did not
  (`no_parent_gives_the_bare_title`, `an_entry_not_in_storage_has_no_folder`, `the_module_imports_no_vscode`) (S5);
  `titleIn` replaces `rootTitle` in the worlds' description.
- No version bump (a release step, not this PR).

## Build order

Stories at the bottom. S1-S4 are built (S4 without its promotion step). Then S5 (after the re-review gate passes), then
S4's remainder: the As built, the plan status and the promotion. Each commit is green on typecheck, lint and the extension
tests.

## Definition of Done

- [ ] `npm run typecheck`, `npm run lint`, `npm test` in src_vs_code green (lowered priority, capped workers); the
      server, cli, mcp and broker are untouched and their runners not run — the PR says so.
- [ ] Every new behaviour has a test seen failing first, then passing.
- [ ] Help in five languages, CHANGELOG, research/module_extension.md and research/module_tests.md updated, and
      module_tests.md's RED record matches the commits (6 of 9 for S1).
- [ ] The folder run's post-wait keys come from `entryTerminalKeyOf`; the folder node captured before the modal is not
      read after the last await; pinned by the S5 tests under both buttons.
- [ ] coai code gate run over the whole diff (S5 included), every finding resolved; own review run at the same time.
- [ ] This plan promoted to research/ with `git mv` as the last step, the S2 spec with it.

## Stories

Five stories, no epics (a small plan; the layout of `research/PLAN_terminal_folder_run.md` §Stories). One branch
`feat/terminal-titles-folder`, one PR, one commit per story, in this order: S1, S2, S3, S4 (built), S5, then S4's remainder.
Every commit is green on `npm run typecheck`, `npm run lint` (complexity 4 per function, 50 code lines per function, 800 lines
per file) and `npm test` in `src_vs_code`, at lowered priority. Each story names its RED-first tests: a test "seen failing first"
is run once against the tree BEFORE the story's production edit, its failure message recorded in the commit or the PR, then run
green. Cornerstones: 1 of 5 — S2. Its spec: [PLAN_terminal_titles_folder_S2_spec.md](PLAN_terminal_titles_folder_S2_spec.md);
its §S2.4 folder-run brief and pitfalls 1-2 are superseded by S5 for the post-wait keys (the spec says so).

### S1 — The pure title module (built, f8fb23e)

- **Cornerstone:** no.
- **Files:** new `src_vs_code/src/terminalTitles.ts`; new `src_vs_code/src/test/terminalTitles.test.ts`; `todo/README.md`
  (two rows, this plan and the S2 spec — `plan-lifecycle.mjs` fails CI for a `todo/PLAN_*.md` with no row; note 3).
- **What changes:** the module of §Design, exactly its seven exports. `entryTerminalKey(name, folder)` stores the folder's
  name as stored (`folder?.name`); `entryTerminalTitle` is the ONE place that writes it through `escapeControl`
  (`transitSecretReport.ts:244`, pure) — so a key compares by value and every title comes out of one function.
  `entryTerminalKeyOf(source, accountId, entryId, entryName)` reads `source.getNode(accountId, entryId)` and
  `parentFolderOf` (`moveGate.ts:130`, pure); an entry not in storage answers no folder (note 2). `NodeSource` is the
  `{ getNode(accountId, id): TreeNode | undefined }` shape `parentFolderOf` already takes (declared again in S1; derived
  from the parameter in S5). No production caller switches: every old literal stays until S2 and S3.
- **Tests** (`terminalTitles.test.ts`, all new; the file does not compile until the module exists — the first green compile
  is the watched transition; RED against an empty module body that returns `''` for the six cases that compare a title or a
  key with a folder): `a_parent_folder_goes_before_the_entry` (`Creds: ops / x`); `no_parent_gives_the_bare_title`
  (`parentId` undefined, `null`, and a dangling id through `entryTerminalKeyOf` with a `getNode` that knows only the entry —
  all `Creds: x`); `the_trash_is_a_normal_parent` (`Creds: Trash / x`); `only_the_direct_parent_is_named` (inner folder
  inside outer gives `Creds: inner / x`); `a_control_character_in_the_folder_name_is_escaped` (`a\tb` → `Creds: a\u0009b / x`,
  `a\nb` → `Creds: a\u000ab / x`, equal to `escapeControl`'s output; the entry half `x\ty` is NOT escaped);
  `the_three_fixed_titles` (`Creds: before o`, `Creds run: n`, `Creds VPN: n`); `the_key_reads_the_stored_parent`
  (a source whose stored node says `parentId: 'now'` answers folder `now`; the function takes an id, so an element's old
  parentId cannot reach it); `an_entry_not_in_storage_has_no_folder` (`getNode` answers `undefined` → `Creds: x`);
  `the_module_imports_no_vscode` (reads its own source: no `from 'vscode'`).
- **Done:** the nine tests pass; `src/terminalTitles.ts` and its test are the only files under `src/` in the diff;
  `todo/README.md` lists this plan and the S2 spec; typecheck, lint, suite green.

### S2 — One key for every entry terminal (CORNERSTONE; built, 01a8a41)

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
  used for classification, the modal snapshot, the post-await recheck and creation (the post-await half is what change 1.2
  and S5 revise). `FolderFacts` and `planFolderRun` keep their signatures. The three short-prefix titles stay as today (S3).
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

### S3 — The short prefix on the three other titles, the help and the scan (built, 7c26422)

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
  one-time effect), the scan file itself. Over `src/test` the same patterns: no test asserts an old title literal. (S5 drops
  the `CredsForDevs: ${` pattern and the seven prefix lines it needed, and makes the old-literal matcher general.)
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

### S4 — The record (built 726d80b without the promotion; its remainder after S5)

- **Cornerstone:** no.
- **Files:** `src_vs_code/CHANGELOG.md` (`## [Unreleased]`, `### Changed — terminal titles name the folder`: the formats,
  the no-folder case, the one-time effect after the update / a rename / a move, same-title entries sharing a terminal, the
  script terminal titled by the entry's name — note 1; after S5, the clause on the folder run reading the folder again when
  it types); `research/module_extension.md` ("The title is one key": `terminalTitles.ts` owns every title, find and create
  share one key; after S5 the folder run's timing contract in place of "`keyOf(folder, name)` … used for … the post-await
  re-check and the creation"); `research/module_tests.md` (the test table: `terminalTitles`, `terminalTitleRoads`,
  `terminalTitleScan`; after S5 the new rows, `titleIn`, and the **Teeth** paragraph corrected to 6 of 9 with the three
  named); this plan's status line and the `## As built` section (deviations, the RED messages; S5's added); the S2 spec's
  status line; the `todo/README.md` rows' status. Last, the promotion: `git mv todo/PLAN_terminal_titles_folder.md research/`
  and the S2 spec with it, `research/README.md` mentions both.
- **What changes:** documentation only; no file under `src/`.
- **Tests:** none new. `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; `npm test` stays
  green (the help tests read the files).
- **Done:** the CHANGELOG, the two research documents and the plan status say what S1–S3 and S5 built; the plan and the spec
  sit in `research/`; the coai code gate ran over the whole diff with every finding resolved, and the own review ran beside it.

### S5 — The folder run reads each row's folder after the wait, and the review clean-ups (after the re-review gate)

- **Cornerstone:** no. Built only after epoch 2 opens (the re-review gate passed; `Narrowed: no`, so reviewers may approve).
- **Files:** `src/commands/folderRunCommand.ts`; `src/terminalTitles.ts` (`NodeSource` only); fakes `src/test/arrowWorld.ts`,
  `src/test/vpnWorld.ts`, `src/test/folderWorld.ts`; tests `src/test/terminalTitleRoads.test.ts` (or a new
  `src/test/folderRunTitlesDuringTheWait.test.ts` if the roads file would pass 450 lines), `src/test/terminalTitleScan.test.ts`,
  `src/test/terminalActivity.test.ts`, `src/test/dependencyChain.test.ts`; docs `src_vs_code/CHANGELOG.md`,
  `research/module_extension.md`, `research/module_tests.md` (the S4 items marked "after S5"). NOT in the diff:
  `src/folderRun.ts`, `src/pinnedTerminal.ts`, `src/terminalGuard.ts`, `src/commands/runCommands.ts`, `src/vpnLauncherRun.ts`.
- **What changes, A (change 1.2):** in `folderRunCommand.ts`, after `chain.ready`, `runChosen` builds one reader
  `keyOfRow = (row: LineRow) => entryTerminalKeyOf(host.storage, folder.accountId, row.id, row.name)` and hands it to
  `typeAll`, `appeared` and `typeLine` in place of `folder`; `appeared` and `typeIntoNew` use it for every row. `ask` hands
  the snapshot to `runChosen` under both buttons, with `closing = choice === CLOSE_AND_RUN` beside it; `typeLine` closes
  only when `closing`. `appeared(row, snapshot, closing, keyOfRow)`: a live terminal of `keyOfRow(row)` not in the
  snapshot, or (`!closing`) a snapshot terminal of the row with `exitStatus === undefined` (the decision above). Before the
  modal nothing changes: `factsOf(folder)` and `openTerminals(plan, folder)` keep `entryTerminalKey(name, folder.node)` (the
  contract's point 1; `FolderFacts.isOpen(name)` unchanged). `Folder.node` stays for those two readers. The header comment
  states the contract: what is read before the modal, what after the last await, that the captured node is never read
  after the wait, and what `appeared` means under each button. The authorisation to CLOSE stays by terminal object and by
  the closing button only. Functions stay under complexity 4 and 50 lines (`appeared` takes a one-line helper
  `stillLive(terminals)` if it passes 4; `runChosen` grows by one line).
- **What changes, B (accepted review clean-ups, same scope):**
  - `terminalTitleScan.test.ts`: the title shapes over all of `src` stay (`Creds: `, `Creds run: `, `Creds VPN: `,
    `CredsForDevs: before `, `CredsForDevs run: `, `CredsForDevs VPN: `); the `CredsForDevs: ${` pattern goes, with the
    seven allow-list lines only it needed (transportFactory.ts, extension.ts ×2, treeMutationCommands.ts, wslRelayCommands.ts ×3);
    a second set over `src/test` only catches an old entry-title literal with any name, ONE matcher per delimiter so a
    name holding the other quote character is caught: `/'CredsForDevs: [^']*'/`, `/"CredsForDevs: [^"]*"/`,
    `` /`CredsForDevs: (?!\$\{)[^`]*`/ `` (a backtick title that is not a `${` prefix), and the regex form
    (`/\/\^?CredsForDevs: /`). The lines they catch today and their allow-list reasons: terminalTitleRoads.test.ts:144 and
    :149 (the pinned one-time effect — kept), bridgeConsent.test.ts:486 and sshAgentHelp.test.ts:179, :182 (an output
    panel's name, not a terminal title), envApply.test.ts:108 (the env collection description, not a terminal title).
    `the_scan_still_finds_what_it_is_about` adds the fixtures: the negative line
    `` void vscode.window.showWarningMessage(`CredsForDevs: ${message}`); `` is a site for neither set; a positive one for
    each of the three quote styles and the regex form with a name other than `a`; and `"CredsForDevs: O'Brien"` (a quote
    inside a differently quoted title) is one site.
  - One `titleIn(parent: TreeNode | undefined, name: string)` exported from `test/vpnWorld.ts` is the only composition of
    `entryTerminalTitle(entryTerminalKey(…))` under `src/test`; `rootTitle(name)` becomes `titleIn(undefined, name)` and
    folderWorld's `T(name)` becomes `titleIn(FOLDER_NODE, name)` (one-line names over it, kept so seven suites do not churn);
    `terminalTitleRoads.test.ts` imports `titleIn` and drops its local copy; `terminalActivity.test.ts:233` calls it.
  - `terminalTitleRoads.test.ts:125` (the tautology `T('a') === titleIn(FOLDER_NODE, 'a')`) is dropped.
  - `arrowWorld.ts`: `elementParentId?: string` (no `| null`); `elementOf` reads `opts.elementParentId ?? opts.parent?.id`
    (no `in` check); the doc comment "The world with `runCommands` registered against a fake host…" moves back above
    `export function arrowWorld`, and `ArrowOptions` gets its own one-line comment.
  - `terminalTitles.ts`: `export type NodeSource = Parameters<typeof parentFolderOf>[0];` replaces the interface.
  - `dependencyChain.test.ts:118`: `w.terminals.find((t) => t.name === chainTerminalTitle('ops relay stage'))` is `undefined`,
    instead of `startsWith(chainTerminalTitle(''))`.
  - `research/module_tests.md`: the S1 **Teeth** sentence says 6 of 9 cases were red against the stub and names the three
    that were not (`no_parent_gives_the_bare_title`, `an_entry_not_in_storage_has_no_folder`, `the_module_imports_no_vscode`);
    the S5 rows and `titleIn`. `module_extension.md` and the CHANGELOG as §Documentation says.
- **Tests, RED first** (each failure message recorded; every rename or move REPLACES the node object in `w.nodes`, never
  edits it in place — the captured node is that object): in the folder-run world with `held` and `clickAndWait` (the
  change happens while the modal is held, i.e. after every pre-modal read and before the post-wait step), and for the
  first one also with `needing('a', 'dep')`, `outside: [step('dep')]` and `holdDialogs: /^(Run the entries|Before )/` so
  the change happens while the chain itself waits:
  `a_folder_renamed_during_the_wait_is_typed_under_its_new_name` (no terminal before; after the rename and `Run`:
  one terminal `titleIn(renamed, 'a')`, `sent [L('a')]`, nothing under the old title);
  `a_terminal_the_arrow_opened_under_the_new_name_during_the_wait_is_left_alone` (rows `a` and `b`, so both buttons
  exist: under `Run` `b` is a `run` row; under `Close Open Terminals and Run` `b` is `preopened: [T('b')]`; rename, then
  `await w.arrow('a')` with `trusted`, then the button — in both: the arrow's terminal has `disposed 0`, `sent [L('a')]`,
  no second terminal for `a`, `b` typed once (under Close its old terminal `disposed 1`), the report
  `Typed 1 of 2 … Left alone, terminal already open: a. Typed: b.` — RED today: a second terminal for `a` opens under the
  OLD title);
  `an_old_title_terminal_the_modal_listed_is_closed_by_object_after_a_rename` (one row, `preopened: [T('a')]`, the only
  button is Close: the old terminal `disposed 1`, a new one under the new title with `[L('a')]`, `Typed 1 of 1` —
  RED today on the title of the new terminal);
  `under_run_an_old_title_terminal_still_live_is_left_alone_after_a_rename` (rows `a` and `b`, `preopened: [T('a')]`, so
  `Run` exists; `Run`: the old terminal `disposed 0`, `sent []`, no new terminal for `a`, `b` typed under the new title,
  the report `Typed 1 of 2 … Left alone, terminal already open: a. Typed: b.` and nothing of `closed while the question
  was open` — RED today twice: before S5's key change the old title is still the key (`b`'s title is wrong); with the key
  change alone `a` is reported closed meanwhile, which pins the decision);
  `an_entry_moved_out_during_the_wait_is_typed_under_its_new_parent` (a folder `g` pushed, the entry node replaced with
  `parentId: 'g'`: one terminal `titleIn(g, 'a')` — RED today: `T('a')`);
  `an_entry_trashed_during_the_wait_is_typed_under_the_trash` (`trash: true`, the entry node replaced with
  `parentId: 'trash'`: one terminal `titleIn(trashNode, 'a')` = `Creds: Trash / a`, `Typed 1 of 1` — RED today: `T('a')`);
  `a_folder_trashed_during_the_wait_keeps_its_title_and_runs` (`trash: true`, `w.nodes[0]` replaced with
  `parentId: 'trash'`: one terminal `T('a')`, `Typed 1 of 1` — a guard, green before and after; it pins that a trashed
  folder does not cancel or retitle the run);
  `a_folder_removed_for_good_during_the_wait_types_under_the_bare_title` (`w.nodes.splice(0, 1)`: one terminal
  `titleIn(undefined, 'a')`, `Typed 1 of 1` — RED today);
  `an_entry_removed_for_good_during_the_wait_is_still_typed_under_the_bare_title` (the entry node removed:
  `titleIn(undefined, 'a')`, `Typed 1 of 1` — RED today on the title; the typing itself is today's behaviour).
  Scan: the per-delimiter matchers are written first with fixture lines `'CredsForDevs: other'` and
  `"CredsForDevs: O'Brien"` in a test — RED until the allow-list and the fixtures are settled (the O'Brien line is RED
  against one shared matcher too, which is why there are three); the negative case is green before and after (a guard). Guards (green before
  and after, each run once): the exact chain title at dependencyChain:118, `titleIn` in the four places, `elementParentId`
  as a string. The RED list is run once against ecc0466's tree with the test-side edits only, then green after the edits.
- **Done:** every test above passes; `grep -n 'folder.node\|keyOf(' src/commands/folderRunCommand.ts` shows the captured
  node read only in `factsOf` and `openTerminals`; `grep -n CLOSED_MEANWHILE src/folderRun.ts` is unchanged (its one
  case is a terminal that ended); `grep -rn 'entryTerminalTitle(entryTerminalKey' src/test` finds one
  line (`titleIn`); `grep -n 'CredsForDevs: \\\$' src/test/terminalTitleScan.test.ts` finds nothing; `git diff --stat
  src/folderRun.ts src/pinnedTerminal.ts src/terminalGuard.ts src/commands/runCommands.ts src/vpnLauncherRun.ts` is empty;
  CHANGELOG, module_extension and module_tests carry the S5 text; typecheck, lint, suite green; one commit.

### Notes on the design, found while splitting (the design text above is unchanged)

1. **The script terminal's entry half changes from the node's name to `details.name`.** Today `launchScript` titles with
   `ready.entry.name` (`runCommands.ts:221`), which is `element.node.name`; the design's `entryTerminalTitle(ready.entry.key)`
   uses `details.name`. For a share that split the two names the script terminal's title moves. Kept: one key for every
   entry terminal, the arrow's rule (`runCommands.ts:133-134`). S4's CHANGELOG says it in one clause.
2. **A stored node that is gone.** `entryTerminalKeyOf` reads the current stored node; an entry deleted between the menu's
   drawing and the click has none, so the key has no folder and the title is `Creds: <entry>`. The design does not say;
   decided here, pinned by `an_entry_not_in_storage_has_no_folder`. (The re-review extends the same rule to the folder run's
   post-wait keys: §Design, the timing contract.)
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
7. **Why the pre-modal keys keep the captured node (re-review, 2026-11-09).** Nothing is awaited between `folderAt`'s
   re-read and the snapshot, and every row is a direct child of that node, so `entryTerminalKey(name, folder.node)` and a
   per-row `entryTerminalKeyOf` are equal there; the planner's `isOpen(name)` has no row id, and a name-to-id map would be
   ambiguous for two same-named rows. The function that CAN differ is the post-wait one, and that is the one shared with
   the arrow. Two functions in one file is accepted for this reason, and the header comment says which is used where.
8. **An in-place edit of the fake's folder node does not go red.** `Folder.node` is the object `w.nodes[0]` (the fact
   above); S5's tests replace the object. A test that edits in place would pass before and after S5 and prove nothing.
9. **Why `appeared` under `Run` reads the snapshot (re-review decision).** With the key read after the wait, a terminal
   the modal listed under the old title is no longer found by the row's key; without the snapshot the row would be
   reported "its terminal closed while the question was open", which is false. The snapshot is already taken for the
   closing button; under `Run` it is read, never acted on. The planner's `settleRow` keeps its contract (an `open` row
   with no `appeared` under `Run` is `CLOSED_MEANWHILE`): only the window's answer to `appeared` gets truer.

## As built

Four commits on `feat/terminal-titles-folder`, one per story, then the stop (ecc0466). Suite after each story: 6998, 7010,
7015 tests, 0 failed, 8 skipped. S5 is not built (the stop).

RED seen first, by story (messages in the commit bodies):

- S1: `Cannot find module '../terminalTitles'`; then against a stub returning `''`: `actual '' expected 'Creds: ops / x'` and the like (6 of 9;
  not red against the stub: `no_parent_gives_the_bare_title`, `an_entry_not_in_storage_has_no_folder`, `the_module_imports_no_vscode`).
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
7. S4's research/module_tests.md wrote "every case failed" for S1's stub run; the S1 commit records 6 of 9. S5 corrects the document.
8. The folder run carried the folder node captured before the modal into the post-wait re-check and creation (the spec's §S2.4 and
   pitfall 1 prescribed it); the code gate found the rename case. Change 1.2; S5 builds the timing contract.
