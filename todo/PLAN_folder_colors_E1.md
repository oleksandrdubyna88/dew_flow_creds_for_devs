# PLAN — folder colours, epic E1: a folder gets a colour; its terminals and its row show it

> Status: **stories, not built, 2026-11-12.** Stories of epic E1 of [PLAN_folder_colors.md](PLAN_folder_colors.md).
> Scope: `src_vs_code` only. S1 and S3 are specified here (scenarios and brief, by Opus). S2 is the cornerstone; its
> spec is Fable's, in its own file. Worktree branch `feat/folder-colors-e1`.

Every path below is relative to `src_vs_code/src/` unless it says otherwise. Every `file:line` was opened on commit
`1db4c344` of this branch.

## The three stories

| Story | What | Scenarios and brief | Code and tests | Review |
|---|---|---|---|---|
| S1 | The stored field, the guard, the pure policy | Opus, this document | Sonnet | Opus |
| **S2 — cornerstone, `model: fable`** | The allocator `ensureFolderColor` | **Fable**: [PLAN_folder_colors_E1_S2_spec.md](PLAN_folder_colors_E1_S2_spec.md) | Sonnet | Opus |
| S3 | The key, the colour helper, the terminal sites, the callers, the scan, the folder row, the module document | Opus, this document | Sonnet | Opus |

Two epics give Q = ⌈2·2/5⌉ = 1. The parent's ledger already reads `Cornerstones: 1 of 1 — E1.S2`. This document marks
no other cornerstone, so the ledger does not change. This file's `todo/README.md` row is committed with it.

## Build order, and what each story leaves green

1. **S1.** `types.test.ts` and the new `folderColors.test.ts` are green. Nothing outside the tests calls the new
   functions yet. Typecheck, lint and the whole `npm test` are green.
2. **S2.** The S2 spec's scenarios are green. No caller yet. The whole suite is green.
3. **S3.** Every scenario below is green, with the scan. `treeDataProvider.ts` has 798 lines. The module document
   describes E1. The whole suite, typecheck and lint are green. This closes E1.

## Rules for every story

- **RED, GREEN, then teeth.** Write the test. Run it and watch it fail for the reason its name gives. Write the code.
  Watch it pass. Then delete the production line named in the scenario's *Revert*, watch the test go red, and restore
  it. Report the three observations.
- **A new function gets a wrong body first** (`undefined`, an empty map, `DEP_COLOR_KEYS[0]`). Then the RED is an
  assertion failure, not a compile error.
- **Fixtures pass the real guard.** Every `TreeNode` fixture passes `isTreeNode` (one assertion in the fixture helper).
- **Lists come from the source.** Iterate `DEP_COLOR_KEYS`; never type the twelve keys. Read a theme id back from
  `depColorThemeId`; never type the prefix.
- **Limits (eslint).** Complexity 4 per function, 50 lines per function, 800 lines per file.
- **Commands** (from `src_vs_code`): `npm run typecheck`, `npm run lint`, `npm test` (already at lowered priority).
  One file: `npm run compile && node ../.agents/conventions/tools/low-priority.mjs node --test out/test/<name>.test.js`.

## E1.S1 — the stored field and the pure policy

- model: brief and scenarios — opus
- model: code and tests — sonnet
- model: review — opus

**Goal.** A folder can store `folderColor`. The node guard checks its type. Three pure functions say which key a
folder wears, how many folders wear each key, and which key a new folder gets. No storage write. Parent §3.1, §3.2
(first three bullets), §6.1 (pure part), §6.2.

### S1 brief

1. **`types.ts`.** In `TreeNode` (`:380-456`), after `mcp?: McpAccess;` (`:455`), add `folderColor?: string;` with a
   doc comment: folders only; a key of the dependency palette (`depColors.ts`); written once by `ensureFolderColor` or
   by the folder form (E2); a `string`, not `DepColorKey`, so a key from a newer build is kept; painted only through
   `folderColorKeyOf`.
2. **`typeGuards.ts`.** In `hasValidFolderExtras` (`:411-419`) add
   `(v.folderColor === undefined || typeof v.folderColor === 'string') &&`. Loose on purpose, like the `depColor`
   clause (`:395-397`). Update the doc comment above (`:402-409`, "these four") so it names the colour.
3. **New `folderColors.ts`** (no `vscode` import, repository rule 3). Imports: `DepColorKey`, `isDepColorKey`
   (`depColors.ts:34`, `:87`), `pickDepColor` (`depGraph.ts:468`), `isTrashFolder` (`trash.ts:28`), `TreeNode`.
   - `export function folderColorKeyOf(node: TreeNode | undefined): DepColorKey | undefined` — the key of a folder
     that is not the trash and whose `folderColor` passes `isDepColorKey`; else `undefined`. It takes `undefined` so
     that S3's `entryTerminalKey` can pass its folder as it is.
   - `export function folderColorUsage(nodes: readonly TreeNode[]): Map<DepColorKey, number>` — counts
     `folderColorKeyOf(node)` over the nodes. A key no folder wears is not in the map.
   - `export function pickFolderColor(nodes: readonly TreeNode[]): DepColorKey` — `pickDepColor(folderColorUsage(nodes))`.
   - The file comment says: folders count among folders only; `details.depColor` is another meaning and is not read.

### S1 scenarios

- **G1** — `test/types.test.ts`, the table of *every group of isTreeNode refuses at least one value* (`:187`).
  Given a folder with `folderColor: 3`. When `isTreeNode` reads it. Then it is refused (a new `'folder extras'` row).
  RED today: the field is not checked. *Revert:* delete the new clause in `hasValidFolderExtras`.
- **G2** — `test/types.test.ts`, new test `a_folder_colour_from_a_newer_build_is_kept`. Given folders with
  `folderColor: 'depColor3'` and `'depColor99'`. Then both pass `isTreeNode`. Green at once: it pins today's
  tolerance. *Teeth:* make the clause strict (`isDepColorKey(v.folderColor)`) and watch the `depColor99` case fail.
- **P1** — `test/folderColors.test.ts`, `the_key_of_a_coloured_folder`. For every key of `DEP_COLOR_KEYS`, a folder
  with that key gives that key. *Revert:* return `undefined`.
- **P2** — `test/folderColors.test.ts`, `no_key_for_an_unknown_value_a_non_folder_or_the_trash`. `undefined` for:
  `folderColor: 'depColor99'`; an entity node with `folderColor: 'depColor2'`; the trash (`isTrash: true`) with
  `folderColor: 'depColor2'`; a folder with no field; `undefined`. *Revert:* remove the trash check (the trash case
  fails); remove `isDepColorKey` (the `depColor99` case fails).
- **P3** — `test/folderColors.test.ts`, `usage_counts_the_folders_that_wear_a_key`. Given folders wearing
  `DEP_COLOR_KEYS[1]` twice and `DEP_COLOR_KEYS[4]` once, the trash wearing `DEP_COLOR_KEYS[4]`, a folder wearing
  `depColor99`, and an entity whose `details.depColor` is `DEP_COLOR_KEYS[0]`. Then the map is exactly
  `{ [1]: 2, [4]: 1 }`. *Revert:* count `node.folderColor` without `folderColorKeyOf`.
- **P4** — `test/folderColors.test.ts`, `the_pick_is_the_first_unused_then_the_least_used_in_palette_order`.
  No coloured folder → `DEP_COLOR_KEYS[0]`. Every key worn once but the last → the last. Every key once, the first two
  twice → `DEP_COLOR_KEYS[2]`. *Revert:* return `DEP_COLOR_KEYS[0]`.
- **P5** — `test/folderColors.test.ts`, `dependency_colours_do_not_move_the_folder_pick`. Given one folder wearing
  `DEP_COLOR_KEYS[0]` and three entities with `details.depColor: DEP_COLOR_KEYS[1]`. Then the pick is
  `DEP_COLOR_KEYS[1]`. *Revert:* also count `details.depColor`.

## E1.S2 — the allocator `ensureFolderColor` (cornerstone)

- model: spec (scenarios and brief) — fable
- model: code and tests — sonnet
- model: review — opus

Spec (scenarios and brief): [PLAN_folder_colors_E1_S2_spec.md](PLAN_folder_colors_E1_S2_spec.md), written by Fable;
code by Sonnet; review by Opus.

**The contract** (parent §3.2 and entry 1.1). The spec decides the tests, the fakes and the race harness.

- `ensureFolderColor(storage, accountId, entryId): Promise<DepColorKey | undefined>`, in `folderColors.ts`. Storage is
  typed as the three methods it uses: `getNode`, `getNodes`, `updateNodeFields` (`storageManager.ts:409`, `:405`,
  `:521`). A test gives it a fake.
- It reads the entry's DIRECT parent folder with `parentFolderOf` (`moveGate.ts:131-138`). At the root, for a missing
  entry, for a dangling parent and in the trash it writes nothing and returns `undefined`.
- When the folder holds ANY string, it writes nothing. It returns the key when this build knows it, else `undefined`;
  an unknown key (`depColor99`) stays byte-identical.
- Otherwise it writes `pickFolderColor` and returns the key it wrote. **The fresh read, the tally, the choice and the
  write are ONE critical section:** one `updateNodeFields` call with a FUNCTION patch, run inside the write queue and
  the cross-window lease (`:521-531`). Inside it the folder is checked again (any string → no field change), and the
  usage is tallied from `getNodes(accountId)` as it is then.
- `updateNodeFields` stamps the version vector on every call (`stampVector`, `:471`). So a check OUTSIDE the lease skips
  the call when the folder already holds a string. A call that loses a two-window race stamps the folder once with no
  change: accepted.
- Two calls at once for two entries of ONE folder write once and return the same key. Two calls for TWO folders get
  two different keys in one window, and in two windows when the second window's `globalState` copy already holds the
  first write. It is NOT guaranteed across windows when that copy is stale (P1, E1 plan round 1): the second window
  can then pick the same key. That outcome is a repeated colour, never a lost or overwritten one — the same as palette
  reuse after twelve folders — and the spec's R4b tests it.
- A failed write rejects that call only. The next call takes the lease as usual. Nothing is kept in memory.
- A call for one account never reads or writes the nodes of another account.

**What S3 relies on:** the name and signature above; a rejection on a failed write; and, after it resolves, storage
holds the colour, so a key built after it from a fresh read carries it.

## E1.S3 — the terminals and the folder row

- model: brief and scenarios — opus
- model: code and tests — sonnet
- model: review — opus

**Goal.** A folder-named terminal wears its folder's colour on its icon, and the folder row wears it too. Before a
folder-named terminal is found or created, its caller runs the auto-pick. Parent §3.3, §3.4, §6.3-§6.6, and the E1 part
of §3.6.

### S3 decisions

| # | Decision | Why |
|---|---|---|
| D1 | The helper is a new module `terminalColor.ts`, not a function in `pinnedTerminal.ts`. | `terminalManager.test.ts:61` replaces `./pinnedTerminal` with `composedShellPath` alone; a helper there would be missing in that world. |
| D2 | A failed colour write never stops a terminal, and it is never silent (E1 plan round 1): each caller catches the rejection, writes one line to the extension's diagnostic log (`DiagnosticWriter`, `diagnosticLog.ts`; source `folderColors`, the message from `describeError`, no folder or entry name), and goes on. No toast. One new scenario per caller road is not needed: one test (C10) drives a rejecting storage through the arrow and asks that the terminal opened uncoloured AND the log got the line. | The colour is cosmetic: the terminal opens uncoloured, and the next open tries again (no string is stored). A toast would interrupt for a cosmetic failure; the log is what a bug report carries. |
| D3 | SSH Connect calls it first in `connectEntity`, BEFORE `prepareSshSession`. | The open half after prepare is synchronous by design (`sshConnect.ts:99`); an await there would let a gone agent request get a terminal. `placeOf` still reads storage after prepare, so it sees the colour. |
| D4 | The VPN launcher calls it in `runWithLauncher`, after the `stop` return (`vpnLauncherRun.ts:74-81`). | One place for both roads (local `:202`, linked `:112`). It is before every gate, so the rule "no await between `configFor` and the send" (`:198-201`) does not change. |
| D5 | The folder run calls it in `prepareAndType` (`folderRunCommand.ts:202`), before `prepareLinked`, once per row to type, in row order. | After the modal (a cancelled modal opens nothing) and before the first preparation, so "nothing is awaited from the last preparation to the last send" (`:44-45`) still holds. The first call writes; the others only read. A row moved meanwhile colours its new folder, where its terminal opens. |
| D6 | The arrow and Run Script call it in `entryAt` (`runCommands.ts:68-77`), before the key at `:75`. | The parent's site. See finding F4 for its two side effects. |

### S3 brief

1. **`terminalTitles.ts`.** `EntryTerminalKey` (`:12-16`) gains `readonly folderColor?: DepColorKey;` (doc: the
   folder's colour, present only when the folder has one). `entryTerminalKey` (`:22-24`) sets it from
   `folderColorKeyOf(folder)` and leaves the property OUT when there is none:
   `folderColor === undefined ? { entryName, folderName: folder?.name } : { entryName, folderName: folder?.name, folderColor }`.
   The titles (`:44-62`) do not change.
2. **New `terminalColor.ts`** (imports `vscode`, `DepColorKey`, `depColorThemeId`):
   `export function folderColorOption(key: DepColorKey | undefined): { readonly color?: vscode.ThemeColor }` — `{}`
   without a key, else `{ color: new vscode.ThemeColor(depColorThemeId(key)) }`. The one place the sites get a colour.
3. **`pinnedTerminal.ts`.** `openEntryTerminal` (`:155`):
   `createTerminal({ name, ...shell, ...folderColorOption(key.folderColor) })`, where `shell` is
   `{ shellPath: pinnedShell().shellPath }` on the pinned road and `{}` otherwise. `openSshEntryTerminal` (`:177`): add
   `...folderColorOption(key.folderColor)`. `PinnedOptions` (`:67-72`) gains `color?: DepColorKey` (set only at
   creation); `pinnedTerminal` (`:82`) adds `...folderColorOption(options.color)`.
4. **`terminalManager.ts`.** `SshTerminalPlace` (`:12-15`) gains `readonly color?: DepColorKey;`. `:57` adds
   `...folderColorOption(place.color)`. The default place (`:38`) stays as it is.
5. **`sshConnect.ts`.** `connectEntity` (`:60-72`): first line `await ensureFolderColor(connect.storage, accountId,
   entity.id).catch(() => undefined);` (D3). `placeOf` (`:80-82`) builds the key once and returns
   `{ title: sshTerminalTitle(key), accountId, color: key.folderColor }`. The password terminal (`:143-148`) adds
   `...folderColorOption(place.color)`.
6. **`commands/runCommands.ts`.** `entryAt`: the call before `:75` with `host.storage`, `accountId`, `node.id`.
   `launchScript` (`:267`): add `color: ready.entry.key.folderColor` to the options (finding F1).
7. **`commands/folderRunCommand.ts`.** A small `colourRows(host, folder, rows)` that awaits the call for each row, in
   order; `prepareAndType` calls it with `linesToType(plan, chosen.closing)` before `prepareLinked`. `keyOf`
   (`:92-94`) does not change (finding F3).
8. **`vpnLauncherRun.ts`.** In `runWithLauncher`, after the `stop` branch: the call with `ctx.storage`,
   `ctx.accountId`, `launcher.id` (D4).
9. **`treeIcons.ts`.** `folderIcon(folderType: FolderType | undefined, colorKey?: DepColorKey)` (`:94-96`): the theme
   colour of `colorKey` when given, else `FOLDER_COLOR`. The glyph does not change.
10. **`treeDataProvider.ts`.** One import line `import { folderColorKeyOf } from './folderColors';` and `:595` becomes
    `: folderIcon(node.folderType, folderColorKeyOf(node));`. The trash branch (`:593-594`) does not change. Check
    `wc -l` gives 798.
11. **The test worlds.** Each fake `createTerminal` records the `color` it was given, and each `vscode` stub gets
    `ThemeColor: class { constructor(readonly id: string) {} }`: `terminalManager.test.ts:41`, `sshConnectWorld.ts:222`,
    `vpnWorld.ts:202` (the arrow, linked arrow, folder run, launcher and script share it). The shared fake
    `test/folderColorStorage.ts` is MADE BY S2 (its spec, P7) and REUSED here: `getNodes` and `updateNodeFields`
    (object or function patch, each write recorded) over a node list. `storageWith` (`sshConnectWorld.ts:310-313`), the `arrowWorld.ts` storage (`:149-155`)
    and the `folderWorld.ts` storage (`:105-108`) use it.

### S3 scenarios

- **K1** — `test/terminalTitles.test.ts`, `a_coloured_folder_puts_its_colour_in_the_key`. A folder with
  `folderColor: 'depColor3'` → `key.folderColor === 'depColor3'`. *Revert:* drop `folderColor` from the constructor.
- **K2** — same file, `an_uncoloured_folder_gives_todays_key`. Uncoloured folder, root, dangling parent, the trash with
  a colour, and `depColor99` → the key deep-equals `{ entryName, folderName }` and `'folderColor' in key` is false.
  *Revert:* always write `folderColor: folderColorKeyOf(folder)`.
- **K3** — same file, `the_colour_never_changes_a_title`. For every key of `DEP_COLOR_KEYS`, `entryTerminalTitle` and
  `sshTerminalTitle` of the coloured key equal those of the same folder without a colour.
- **H1** — `test/terminalColor.test.ts`, `each_key_gives_its_theme_colour`. For every key, `folderColorOption(key).color.id`
  is `depColorThemeId(key)`. *Revert:* return `{}`.
- **H2** — same file, `no_key_gives_no_color_property`. `folderColorOption(undefined)` has no own `color` property.
- **C1** — `test/terminalManager.test.ts`, `the_ssh_terminal_wears_the_place_colour_and_none_without_one`. A place with
  `color: 'depColor3'` → the created options' `color.id` is `credSshManager.depColor3` (via `depColorThemeId`). A place
  without → no `color` property. *Revert:* remove the spread at `:57`.
- **C2** — `test/sshConnect.test.ts`, `the_password_and_key_terminals_wear_the_folder_colour`. Entry `e1` in a folder
  with `depColor3`: the password terminal's `color.id` is the theme id; the key session's place has
  `color: 'depColor3'`. Entry at the root (`E1_AT_ROOT`): no `color` property. *Revert:* the spread at `:143-148`, then
  `color` in `placeOf`.
- **C3** — same file, `the_first_connect_colours_an_uncoloured_folder_once`. Empty palette use, uncoloured folder: the
  first connect records ONE write of `folderColor: DEP_COLOR_KEYS[0]` on `f1` and its terminal wears it; a second
  connect records no write. *Revert:* remove the call in `connectEntity`.
- **C4** — `test/terminalTitleRoads.test.ts`, `the_arrows_terminal_wears_its_folder_colour`. Coloured folder → colour;
  root entry → no `color` property. *Revert:* the spread at `pinnedTerminal.ts:155`.
- **C5** — same file, `the_first_arrow_colours_its_folder_once`. Uncoloured folder → one write, the terminal wears the
  key; a second arrow writes nothing. *Revert:* remove the call in `entryAt`.
- **C6** — `test/sshRoadArrow.test.ts`, `a_linked_arrows_terminal_wears_its_folder_colour`. *Revert:* the spread at
  `pinnedTerminal.ts:177`.
- **C7** — `test/terminalTitleRoads.test.ts`, `a_folder_run_colours_the_folder_once_and_every_row_wears_it`. Two rows,
  uncoloured folder → one write; both new terminals wear the same key. *Revert:* remove `colourRows`.
- **C8** — same file, `the_launcher_wears_its_own_folders_colour`. VPN and launcher in two folders with two colours →
  the launcher's terminal wears the launcher's folder colour. *Revert:* remove the call in `runWithLauncher`.
- **C9** — same file, `the_script_terminal_wears_its_folder_colour`. *Revert:* remove `color:` at `runCommands.ts:267`.
- **C10** — same file, `a_failed_colour_write_still_opens_the_terminal`. `updateNodeFields` rejects → the line is typed
  into a new terminal with no `color` property, no toast is shown, and the diagnostic log got exactly one line with
  source `folderColors` that names no folder or entry (D2). *Revert:* remove the `.catch` in `entryAt` (the run
  rejects); or remove the log line (the log assertion fails).
- **R1** — `test/treeIcons.test.ts`, `a_folder_icon_wears_the_folder_colour`. For every key, `folderIcon(type, key)`
  has `color.id === depColorThemeId(key)` and the same glyph as `folderIcon(type)`; without a key,
  `credSshManager.folderIcon`. *Revert:* ignore `colorKey`.
- **R2** — `test/treeProviderDependsOn.test.ts`, `the_folder_row_wears_its_colour_and_the_trash_does_not`. A folder
  with `depColor3` → `iconPath.color.id` is the theme id; `depColor99` → `credSshManager.folderIcon`; the trash with a
  colour → glyph `trash`, colour `credSshManager.folderIcon`. *Revert:* the argument at `treeDataProvider.ts:595`.

### S3 scan test — new `test/folderColorScan.test.ts` (parent §6.5, in the shape of `terminalTitleScan.test.ts`)

It reads every `.ts` file under `src` except `src/test/`. It skips lines whose trimmed text starts with `//`, `*` or
`/*`. A call's text runs from its name to the balanced closing parenthesis, over lines.

- **X1** `every_module_that_builds_a_terminal_key_colours_the_folder_first`: a module with a call
  `entryTerminalKeyOf(` or `entryTerminalKey(` (not its `function` line) also holds `ensureFolderColor(`. Allowed
  without it: `terminalTitles.ts` (the builder), and the exact line at `terminalManager.ts:38` (finding F2), because
  "the default place has no folder, so it has no colour". RED until items 5-8.
- **X2** `every_terminal_created_for_a_folder_title_passes_the_colour_helper`: each `vscode.window.createTerminal(`
  call holds `folderColorOption(`, or its first trimmed line is in the PLAIN list, each with its reason:
  `dependencyRunHost.ts:349` (`Creds: before …`, D3), `entityViewerCommands.ts:262` (`env check: …`),
  `maskedTerminal.ts:137` (`Creds run: …`, D3). And each `pinnedTerminal(` or `sendPinned(` call whose text holds
  `entryTerminalTitle(` or `sshTerminalTitle(` also holds `color:`. RED until items 3-6.
- **X3** `no_module_but_terminalTitles_writes_a_terminal_key_by_hand`: outside `terminalTitles.ts`, no innermost
  `{…}` literal names both `entryName` and `folderName` as properties (`name:` or shorthand). Green at once; its teeth
  are X5.
- **X4** `the_scan_still_finds_what_it_is_about`: X1 finds `commands/runCommands.ts` as a key builder that holds the
  call; X2 finds the password terminal in `sshConnect.ts` as a coloured site and the `launchScript` call; X3 finds the
  literal in `terminalTitles.ts`.
- **X5** `fixtures_are_read_the_way_the_code_is_written`: a three-line `createTerminal` with the helper on its third
  line is ONE coloured site; `{ accountId, entityId, entryName }` (the shape at `rotationWaiting.ts:79`) is not a key
  literal; `{ entryName,\n folderName: f }` is one.
- **X6** `the_allow_lists_have_no_stale_entry`: every allowed line still exists.

### S3 module document part

S3 writes a new section in `research/module_extension.md` directly after *Depends on — a relationship the vault can
see (0.62.0)* (`:3076-3179`), before *The form is three modules, not one file* (`:3180`). Heading:
`### Folder colours — a folder's terminals and its row (Unreleased)`. It says: the field (`TreeNode.folderColor`, a
palette key, kept when unknown, painted only when known); the auto-pick (when it runs, once per folder, inside the
storage lease, the check outside it, the accepted empty stamp); the two places (the terminal icon at the five creation
sites, and the folder row); the limit (VS Code fixes a terminal's colour when it is created); and what gets no colour
(`Creds: before …`, `Creds run: …`, `Creds VPN: …`, the trash, an entry at the root). E2 adds the form.

## E1 is done when

- Every scenario of S1, S2 and S3 was seen RED, then GREEN, then red again with its *Revert* applied; the summary gives
  the failure messages and the passes.
- `npm run typecheck`, `npm run lint` and the whole `npm test` are green; `treeDataProvider.ts` has at most 800 lines.
- The module document section above is written.

## Findings against the parent

The parent is not edited here. The lead decides each finding.

- **F1 — a fifth creation site.** Run Script opens `Creds: <folder> / <entry>` through
  `pinnedTerminal(entryTerminalTitle(ready.entry.key), …)` (`runCommands.ts:267`, then `pinnedTerminal.ts:82`). The
  parent's §2 and §3.3 list four sites. By D3 this terminal names a folder, so S3 colours it (item 3, item 6, C9, X2).
  My reading: this only satisfies D3 as written, so it is not a plan change. In doubt it counts, and it would be the
  SECOND change of epoch 1, which stops the plan. The lead decides before S3 starts. If it is left out, drop C9, the
  `color:` part of X2, and the `PinnedOptions.color` part of item 3.
- **F2 — §6.5 check 1 has an exception.** `terminalManager.ts:38` calls `entryTerminalKey(entity.name, undefined)` for
  the default place. That module never calls `ensureFolderColor`. X1 allows this one line, with its reason.
- **F3 — the folder run needs no re-read at `:93`.** §3.3 says the run re-reads the folder node it builds keys from
  (`:93`, `:203`). `keyOf` (`:92-94`) builds keys only to FIND terminals by title (`:99`, `:175`), and a colour does
  not change a title. The keys that CREATE terminals come from `keyOfRow` (`:203`), which already reads storage fresh.
- **F4 — the call in `entryAt` has two side effects.** `entryAt` also serves Run with Secrets (`runCommands.ts:354`),
  whose terminal is `Creds run: …` and gets no colour. And it runs before the trust question. So such a run, or a
  cancelled trust question, also gives the folder its colour. Harmless (one write per folder, ever); said in the
  module document.
- **F5 — Export and Import do not carry the colour.** Import rebuilds the folder chain from `FolderSeg`
  (`importCommands.ts:214`, `arrivalPin.ts:21-29`): name, type and `folderAsksForPin` only. An imported folder gets
  its colour again at its first terminal. Sync and backup move whole nodes (the parent's §3.1). Not in E1.
- **F6 — small references.** `TreeNode` ends at `types.ts:456`, not `:470`. The parent's §Epics names branch
  `feat/folder-terminal-colors`; this worktree is on `feat/folder-colors-e1`.

### The lead's decisions (2026-11-12)

- **F1 — S3 colours the fifth site; not a plan change.** The parent's D3 names the CLASS: every terminal whose title is
  `Creds: <folder> / <entry>` or `Creds SSH: <folder> / <entry>`. Run Script's terminal is in that class. The parent's
  own scan test (§6.5, check 2) requires every `createTerminal` with such a name to pass the colour helper, so the
  parent already demands this site; §2's list of four was an incomplete inventory, not a scope line. Scope, goals,
  contract and approach are unchanged. The E1 plan round is told this, so a reviewer who reads it as a change can say so.
- **F2 — accepted** as written (X1's one exception, with its reason).
- **F3 — accepted, and it satisfies §3.3 as written.** The keys that CREATE terminals come from `keyOfRow`
  (`folderRunCommand.ts:203`), which reads storage fresh after the ensure calls; `keyOf` (`:92-94`) only finds
  terminals by title, which a colour does not change. No extra re-read is added.
- **F4 — accepted**; the module document says it.
- **F5 — out of E1**; recorded here and in the PR. Import gives an imported folder its colour again at its first
  terminal.
- **The S2 spec's findings P1-P7** (its §1): P1 (a window's `globalState` copy can miss another window's write that
  has not arrived by broadcast yet — the residual every leased writer has), P2 (an empty stamp costs three memento
  writes and one sync upload) and P3 (the first open waits for the lease, without a bound, as every write does) are
  ACCEPTED as named limits: the doc comment of `ensureFolderColor` and S3's module-document part say them. P4 is
  covered by R5d. P5 is NOT used (it would be a second plan change). P6 (a)-(c) are readings of §3.2 and §6.1, not
  changes: "in the trash" is any depth; a parent that is not a folder is left alone; S2's tests are in
  `test/folderColorAllocator.test.ts` because they load real storage and a real lock. P7 is applied in S3 item 11.
- **F6 — noted.** One branch per epic is the gate's order; the one PR of D4 is opened from the last epic's branch,
  which holds both epics.
