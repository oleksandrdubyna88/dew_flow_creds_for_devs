# PLAN — a folder has a colour, and its terminals wear it
> Status: **approved by the coai plan gate 2026-11-12 (round 1: proceed, 2 of 2 reviewers, 6 findings accepted), split
> into 2 epics, nothing implemented yet.** Scope: the extension only (`src_vs_code`): one node field, the folder row's
> icon, the `Creds:` and `Creds SSH:` terminals' icon, and a colour picker in the folder form.

## Plan changes

> Epoch 1 · approved 2026-11-12 · by reviewers · state: open

- 1.1 · 2026-11-12 · agent · approach — the allocator runs inside the storage lease (cross-window), not on an in-memory chain (one window only); §3.2 rewritten

## 1. The goal, before any solution

The owner keeps many entry terminals open at once, and their tabs read `Creds: ai1-root / small-tasks`,
`Creds: ai1-dev3 / project-tools-claude-sync`, `Creds SSH: ssh connections / project-tools`. The folder part
(`ai1-root`, `ai1-dev3`) is what tells them apart, and in a long list it does not stand out. The owner asked for the
folder name in a colour (2026-11-12).

**VS Code cannot colour part of a terminal name.** `TerminalOptions.name` is plain text, and the one colour the API
has is `TerminalOptions.color`, which paints the terminal's ICON in the tabs list. So the owner chose (2026-11-12, four
answers, recorded here as decisions, not open questions):

- **D1 — a colour per folder, "like dependencies":** stored on the folder, picked automatically (the least-used of the
  palette) the first time, and changeable in the folder form.
- **D2 — shown on the terminal icon AND on the folder's own row in the tree**, so a terminal can be matched to its
  folder by eye.
- **D3 — only the terminals whose title names a folder:** `Creds: <folder> / <entry>` and
  `Creds SSH: <folder> / <entry>`. `Creds: before …`, `Creds run: …` and `Creds VPN: …` stay as they are.
- **D4 — one pull request over the cap** (creds had five open).

## 2. What exists today (verified on `main` at 6dd96fe7)

- **The palette.** `src/depColors.ts:15-32` — twelve keys `depColor1`…`depColor12`, each a contributed theme colour
  (`credSshManager.depColorN`, four theme variants each), with labels (`:37-50`), webview fallbacks (`:61-74`) and the
  one key→id mapping `depColorThemeId` (`:83-85`). A key is stored, never a hex.
- **The dependency auto-pick.** `src/depGraph.ts:468-473` `pickDepColor(usage)` — the first unused key, else the
  least-used, palette order breaking ties. It takes any usage map, so it serves folders as it is.
- **The stored dependency colour** is `EntityMetadata.depColor` (`src/types.ts:290-300`), written by
  `applyDependencyColors` (`src/entityEditCommands.ts:441-456`), which skips an unchanged colour so a version vector is
  not bumped for nothing.
- **A folder is a `TreeNode`** (`src/types.ts:380-470`) with folder-only fields on the node itself (`folderType`,
  `folderAsksForPin`, `isTrash`, `mcp`…). A folder has no `details`. The node guard checks each folder field's type
  (`src/typeGuards.ts:411-419`, `hasValidFolderExtras`); a field it does not know is not checked and is kept, so an older
  build keeps a newer field.
- **The folder row** (`src/treeDataProvider.ts:593-595`) paints every folder with `FOLDER_COLOR`
  (`credSshManager.folderIcon`, dark orange) through `folderIcon(folderType)` (`src/treeIcons.ts:92-96`). The trash
  has its own `trash` icon. `treeDataProvider.ts` is 797 lines against the 800 ceiling.
- **The terminal key and titles.** `src/terminalTitles.ts:12-24` — `EntryTerminalKey { entryName, folderName }`, made
  by the one constructor `entryTerminalKey(entryName, folder)` from the DIRECT parent folder node, or by
  `entryTerminalKeyOf(storage, accountId, entryId, entryName)` (`:30-38`). The title is both the creation name and the
  find key, matched exactly (`:5-9`).
- **Where the folder-named terminals are created:**
  - `openEntryTerminal` (`src/pinnedTerminal.ts:149-158`) and `openSshEntryTerminal` (`:176-180`) — `Creds: …`;
  - `openSshTerminal` (`src/terminalManager.ts:32-62`, `createTerminal` at `:57`) and the password terminal in
    `src/sshConnect.ts:143-148` — `Creds SSH: …`, both named from `SshTerminalPlace.title`
    (`src/terminalManager.ts:12-15`), which `placeOf` builds (`src/sshConnect.ts:80-82`).
- **Where a key is built from storage** (the callers of `entryTerminalKeyOf` / `entryTerminalKey` outside tests):
  `src/commands/runCommands.ts:75` (the arrow), `src/commands/folderRunCommand.ts:93` and `:203` (the folder run),
  `src/sshConnect.ts:81` (SSH Connect), `src/vpnLauncherRun.ts:190-191` (a VPN's launcher entry).
- **The folder form.** `src/folderFormPage.ts` (pure page, 201 lines) and `src/folderFormPanel.ts` (webview, 98
  lines; `FolderFormValues` `:16-27`, `readValues` `:93-98`). It is opened by `editFolder`
  (`src/entityEditCommands.ts:362-392`), which saves `name` and `mcp` with `updateNodeFields`. The dependency swatches
  to copy from: `src/depPickerScript.ts:35-50` (palette JSON) and `:100-120` (swatch buttons), styles
  `src/entityFormStyles.ts:66-73`.

## 3. The change

### 3.1 The stored colour — `TreeNode.folderColor`

- New optional node field `folderColor?: string` (folders only), one of `DEP_COLOR_KEYS`. On the NODE, like the other
  folder fields, because a folder has no `details`. A value this build does not know is ignored when painting, never
  rejected — the same rule `depColor` follows, so a vault written by a newer build still opens.
- `hasValidFolderExtras` (`src/typeGuards.ts:411-419`) gains `folderColor === undefined || typeof === 'string'`.
- It syncs, backs up and restores with the node like every other node field. Folders are not shared, so no share code
  changes.

### 3.2 The pure logic — new `src/folderColors.ts` (no `vscode` import, repository rule 3)

- `folderColorKeyOf(node): DepColorKey | undefined` — the key of a FOLDER node that is not the trash and whose value
  `isDepColorKey`; otherwise `undefined`.
- `folderColorUsage(nodes): Map<DepColorKey, number>` — how many of the account's folders wear each key.
- `pickFolderColor(nodes): DepColorKey` — `pickDepColor(folderColorUsage(nodes))`. Folders count among folders only;
  dependency colours are a separate meaning and are not counted.
- `ensureFolderColor(storage, accountId, entryId): Promise<DepColorKey | undefined>` — the AUTO-PICK. It reads the
  entry's direct parent folder from storage (`parentFolderOf`); with no folder (root, dangling parent) or the trash it
  writes nothing and returns `undefined`; with ANY string already stored it writes nothing — a key this build does not
  know (`depColor99` from a newer build) is kept untouched and gives `undefined` for painting; otherwise it writes
  `pickFolderColor` with `updateNodeFields` and returns the key it wrote. Storage is typed as the three methods it
  uses, so a test gives it a fake.
- **The allocator is one critical section, inside the storage lease** (plan round 1, two reviewers; mechanism changed
  by entry 1.1). Read-count-pick-write must not interleave: two first opens at once — two entries of one folder in a
  folder run, or two folders, in one window or in two — would otherwise read the same usage, pick the same key, and
  write twice. `StorageManager.updateNodeFields` (`src/storageManager.ts:521`) takes a FUNCTION patch that it runs
  inside its write queue and the cross-window lease (`leasedQueue.ts`, `windowLock.ts`), on the node as it is then.
  `ensureFolderColor` passes such a patch: inside it, the folder is re-checked (any string stored → no change), the
  usage is tallied from `getNodes(accountId)` as it is then, and the key is chosen. Because `updateNodeFields` stamps
  the version vector on every call (`stampVector`), a check OUTSIDE the lease first skips the call when the folder
  already holds a string; the in-lease re-check covers the race. The one cost left: a call that loses that race
  (two windows, same folder, same moment) stamps the folder once with no change — accepted, it is rare and
  harmless. A failed write rejects that call only; the next call takes the lease as usual. Nothing is kept in
  memory. (Was: an in-memory per-account promise chain, which covered one window only — `src/serialQueue.ts:15`.)

**When the auto-pick runs:** just before a folder-named terminal is created or found, by the caller that builds the
key (D1: "the first time"). A folder nobody opens a terminal from keeps no colour and stays orange in the tree. One
write per folder, once; an existing colour is never rewritten (no version-vector bump, no sync noise).

### 3.3 The terminal icon

- `EntryTerminalKey` gains `folderColor?: DepColorKey`, set by `entryTerminalKey(entryName, folder)` from
  `folderColorKeyOf(folder)` — and only PRESENT when the folder has a colour, so the key of an uncoloured folder is
  exactly what it is today. The titles do not change, so finding a terminal by its title does not change.
- `SshTerminalPlace` gains `color?: DepColorKey`; `placeOf` fills it from the key.
- The four creation sites pass `color: new vscode.ThemeColor(depColorThemeId(key))` when there is a key, and no
  `color` property at all when there is none. One small helper builds that options fragment, so the four sites cannot
  disagree.
- The callers in §2 call `ensureFolderColor` BEFORE they build the key, and build the key AFTER it from a FRESH
  storage read (plan round 1): `runCommands.ts:75`, `sshConnect.ts` (before `placeOf`), `vpnLauncherRun.ts:190`, and
  the folder run once at its start — after which it RE-READS the folder node it builds keys from
  (`folderRunCommand.ts:93`, `:203`), because a node object read before the write still has no colour.
- No module outside `terminalTitles.ts` writes an `EntryTerminalKey` as an object literal; keys come only from
  `entryTerminalKey` / `entryTerminalKeyOf` (checked by the scan test, §6.5).
- **Limit, said in the docs:** VS Code fixes a terminal's colour when it is created. A terminal already open keeps
  its colour after the folder's colour changes; the next terminal opened gets the new one.

### 3.4 The folder row

- `folderIcon(folderType, colorKey?)` (`src/treeIcons.ts:94`) paints with the folder's theme colour when there is a
  key, and `FOLDER_COLOR` otherwise. The call at `treeDataProvider.ts:595` passes `folderColorKeyOf(node)` on the
  same line, so the 800-line file does not grow. The trash keeps its own icon and colour.

### 3.5 The folder form

- A **Colour** fieldset with the twelve swatches, painted and labelled like the dependency swatches (same palette
  JSON, same CSS classes, same `jsonForScript` rule), the current colour marked. A folder with no colour yet shows
  none marked and a line under the swatches: *No colour yet. The first terminal opened from this folder gets the
  least-used colour at that moment (now: &lt;suggested&gt;). Choose one to fix it.* — the suggestion is
  `pickFolderColor`, and the sentence says it is provisional, because another folder can take it first (plan round 1).
- `FolderFormValues.folderColor?: DepColorKey`, read in `readValues` through `isDepColorKey` (a webview message is
  untrusted input); anything else is dropped.
- `editFolder` writes `folderColor` only when a swatch was chosen and it differs from the stored one — same reason as
  `applyDependencyColors`.
- There is no "no colour" choice: a coloured folder can change colour, not go back to orange. (Not asked for; a
  later change if wanted.)

### 3.6 Documents (the autonomous order (2))

- `src_vs_code/CHANGELOG.md` — an `[Unreleased]` entry.
- `research/module_extension.md` — a short section beside *Depends on* (§ at line 3076): the field, the auto-pick, the
  two places it shows, the terminal colour limit.
- The help (repository rule 7, all five languages, English first): one paragraph in the article that describes the
  entry terminals (`helpEn.ts` article *Entries: the nine kinds*, the paragraph about the arrow), with the UI label
  **Colour** kept in English.

## 4. Growth budget

One optional string per folder, written once per folder. Nothing grows over time; nothing to retire; nothing in
flight to sweep.

## 5. Build order (tests first — RED, then GREEN, then the check that the test fails without the fix)

1. `folderColors.ts` and its tests (§6.1).
2. The node guard (§6.2).
3. The key and the four creation sites (§6.3, §6.4).
4. The `ensureFolderColor` calls in the four callers, with the scan test (§6.5).
5. The folder row (§6.6).
6. The folder form and `editFolder` (§6.7).
7. Documents and help (§3.6).
8. `npm run typecheck`, `npm run lint`, the whole `npm test` at lowered priority, `npm run package`.

## 6. Test plan (`node:test` over compiled `out/`, as the repository runs them)

1. `folderColors.test.ts`: the key of a coloured folder; an unknown key, a non-folder and the trash give `undefined`;
   usage counts folders only; the pick is the first unused key, then the least-used, palette order on a tie;
   `ensureFolderColor` writes once, writes nothing when a colour exists, at the root, for a dangling parent and in the
   trash, and returns the key it wrote or found; an unknown stored key (`depColor99`) is left byte-identical and gives
   `undefined`; **concurrency** — two calls started together for two entries of ONE uncoloured folder write once and
   return the same key; two calls started together for TWO uncoloured folders get two different keys; a call after a
   failed write still runs.
2. `types`/`typeGuards` test: a folder with `folderColor: 'depColor3'` passes; with `folderColor: 3` fails; with
   `folderColor: 'depColor99'` passes the guard (kept, ignored when painting).
3. `terminalTitles.test.ts`: the key of a coloured folder carries `folderColor`; the key of an uncoloured folder has NO
   such property (deep-equal to today's); every title is byte-identical to today's.
4. Terminal creation (the existing fake-`vscode` worlds of `terminalManager.test.ts`, `sshConnect*.test.ts` and the
   pinned-terminal tests): each of the four sites passes `color` with id `credSshManager.depColorN` for a coloured
   folder, and passes no `color` property for an uncoloured folder or an entry at the root.
5. A scan test, in the shape of `terminalTitleScan.test.ts`, three checks (plan round 1 widened it): every non-test
   module that calls `entryTerminalKeyOf(` or `entryTerminalKey(` also calls `ensureFolderColor(`; every
   `createTerminal(` whose name is `entryTerminalTitle(…)`, `sshTerminalTitle(…)` or a `place.title` also passes the one
   colour helper; and no module outside `terminalTitles.ts` builds an `EntryTerminalKey` as an object literal — so a
   new road cannot open an uncoloured folder terminal unnoticed.
6. `treeIcons.test.ts`: `folderIcon(type, key)` carries the key's theme colour; without a key, `FOLDER_COLOR`.
7. `folderFormPage.test.ts` / `folderFormPanel.test.ts`: twelve swatches, the stored colour marked, the suggestion line
   only when there is no colour; `readValues` keeps a palette key and drops anything else; `editFolder` writes
   `folderColor` on a change and does not write it when it is the same.

## 7. Not in scope

- Colouring part of the tab text (the API cannot).
- `Creds: before …`, `Creds run: …`, `Creds VPN: …` terminals (D3).
- A "no colour" choice, and recolouring terminals that are already open.
- A release. Merging publishes nothing; an extension release is a release-please PR and the owner's word.

## 8. Definition of Done

- [ ] The tests of §6 were seen failing first, then passing; the summary gives both.
- [ ] `npm run typecheck`, `npm run lint` and the whole `npm test` (lowered priority) are green; `npm run package`
      builds the `.vsix`.
- [ ] `treeDataProvider.ts` is still at most 800 lines.
- [ ] CHANGELOG, `module_extension.md` and the help in five languages describe the feature.
- [ ] `plan-lifecycle.mjs` clean and `pin-check.mjs` OK; the plan is promoted to `research/` with its deviations.
- [ ] coai: a plan round and a code round reached `proceed`, every finding resolved.
- [ ] Not checkable here, said in the PR: how the colours look in the owner's real VS Code window.

## Epics

Two epics, both on branch `feat/folder-terminal-colors`, in the one pull request of D4. E1 is a whole vertical slice:
a colour is picked, and the terminal icon and the folder row show it. E2 lets the person choose the colour and
completes the documents. Each epic's stories are one document, written when that epic starts. It links back here and
gets its own `todo/README.md` row. Two epics give a cornerstone quota of 1.

### E1 — a folder gets a colour; its terminals and its row show it

- **Goal.** The first terminal opened from a folder gives that folder the least-used colour, one time. The terminal
  icon and the folder row wear that colour. Two opens at the same moment never give one colour to two folders.
- **Scope.** §3.1, §3.2, §3.3, §3.4; build steps 1–5 and 8 of §5; tests §6.1–§6.6. Also the part of
  `research/module_extension.md` (§3.6) that describes what E1 builds. The module document stays current in E1.
- **Depends on.** Nothing new. `pickDepColor` (`src/depGraph.ts:468`) and the palette (`src/depColors.ts`) are used
  as they are.
- **Done when.** Tests §6.1–§6.6 were seen red, then green. `npm run typecheck`, `npm run lint` and the whole
  `npm test` are green. `treeDataProvider.ts` has at most 800 lines. The module document describes the field, the
  auto-pick, the two places that show the colour, and the terminal colour limit.
- **Cornerstone areas.** The contract that ASSIGNS and stores a folder's colour (§3.2, `ensureFolderColor`). Not the
  palette arithmetic: `pickDepColor` is proven already.
- **Stories** (`todo/PLAN_folder_colors_E1.md`, written when the epic starts):
  - **E1.S1 — the stored field and the pure policy.** `TreeNode.folderColor` and the guard (§3.1). `folderColorKeyOf`,
    `folderColorUsage`, `pickFolderColor` (§3.2). No storage write.
  - **E1.S2 — the allocator `ensureFolderColor` (cornerstone).** The contract: the fresh read, the tally, the choice
    and the write are ONE critical section. No write when any string is stored: an unknown key is kept, and painted
    as none. No write at the root, for a dangling parent, or in the trash. A failed write does not block later
    calls. A call for one account never reads or writes the nodes of another account.
  - **E1.S3 — the terminals and the folder row.** The key carries the colour; one helper; the four creation sites;
    the four callers (ensure, then a fresh read); the scan test (§3.3). The folder row as §3.4 says: the call at
    `treeDataProvider.ts:595` passes `folderColorKeyOf(node)`, with one import line (797 → 798 of 800 lines).
- **Design point of E1.S2 — settled by entry 1.1.** The allocator runs as a function patch of `updateNodeFields`
  inside the cross-window lease, with a check outside the lease first (§3.2). A call that loses the race inside the
  lease stamps the folder once with no change; that is accepted (§3.2).

### E2 — the person chooses the colour; the documents are complete

- **Goal.** The folder form shows the twelve swatches and saves a chosen colour. The CHANGELOG, the module document
  and the help in five languages describe the whole feature.
- **Scope.** §3.5, §3.6; build steps 6–8 of §5; tests §6.7; the whole Definition of Done (§8).
- **Depends on.** E1: the field, the guard, `folderColorKeyOf` and `pickFolderColor`.
- **Done when.** Tests §6.7 were seen red, then green. Every box of §8 is ticked, `npm run package` included. The
  pull request says that the colours were not checked in the owner's real VS Code window.
- **Cornerstone areas.** None. Watched at review: `readValues` treats the webview message as untrusted input;
  `editFolder` writes only on a change; the suggestion line says that it is provisional.
- **Stories** (`todo/PLAN_folder_colors_E2.md`, written when the epic starts):
  - **E2.S1 — the folder form.** The swatches, the provisional suggestion line, the validated message
    (`isDepColorKey`), and the write only on a change in `editFolder` (§3.5).
  - **E2.S2 — the documents.** The CHANGELOG entry, the rest of the module document (the form), and the help
    paragraph in five languages, English first (§3.6, repository rule 7).

Cornerstones: 1 of 1 — E1.S2
