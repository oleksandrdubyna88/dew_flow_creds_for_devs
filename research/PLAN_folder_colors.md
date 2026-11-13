# PLAN — a folder has a colour, and its terminals wear it
> Status: **IMPLEMENTED, 2026-11-12.** Scope: the extension only (`src_vs_code`): one node field, the folder row's icon,
> the `Creds:` and `Creds SSH:` terminals' icon, and a colour picker in the folder form. Built in 2 epics on
> `feat/folder-colors-e1` and `feat/folder-colors-e2`. Deviations: § 9. Ledger at promotion: epoch 1, one entry (1.1), no
> stop. Approved by the coai plan gate 2026-11-12 (proceed, 2 of 2 reviewers, 6 findings accepted).

## Plan changes

> Epoch 1 · approved 2026-11-12 · by reviewers · state: closed

- 1.1 · 2026-11-12 · agent · approach — the allocator runs inside the storage lease (cross-window), not on an in-memory chain (one window only); §3.2 rewritten

## 1. The goal, before any solution

The owner keeps many entry terminals open at once, and their tabs read `Creds: server-a / tasks`,
`Creds: server-b / tools-sync`, `Creds SSH: ssh connections / tools`. The folder part
(`server-a`, `server-b`) is what tells them apart, and in a long list it does not stand out. The owner asked for the
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

## 9. Deviations — what shipped differently from this plan (promoted 2026-11-12)

This section covers the four documents of the plan: this file, [PLAN_folder_colors_E1.md](PLAN_folder_colors_E1.md),
[PLAN_folder_colors_E1_S2_spec.md](PLAN_folder_colors_E1_S2_spec.md) and [PLAN_folder_colors_E2.md](PLAN_folder_colors_E2.md).
Each of the three says what is its own and points here. Ledger at promotion: epoch 1, one entry (1.1), no stop.
Built on `feat/folder-colors-e1` and `feat/folder-colors-e2` (one branch per epic, the gate's order; the plan's text
named `feat/folder-terminal-colors`). The one pull request of D4 comes from the last branch, which holds both epics.

1. **A fifth `createTerminal` site.** §2 and §3.3 list four. Run Script opens `Creds: <folder> / <entry>` through
   `pinnedTerminal(entryTerminalTitle(…), …)`, so it is a fifth site, and it is coloured. The sites that shipped:
   `terminalManager.ts` (the SSH key session), `sshConnect.ts` (the password terminal), `pinnedTerminal.ts` in three
   places (`pinnedTerminal`, `openEntryTerminal`, `openSshEntryTerminal`). The lead's decision F1 (E1 stories): not a
   plan change. D3 names the class (every terminal titled `Creds: <folder> / <entry>` or `Creds SSH: <folder> / <entry>`),
   and §6.5 check 2 already demands the colour for every such `createTerminal`; §2's list of four was an incomplete
   inventory. The callers are five roads: SSH Connect, the arrow (and a history row), the folder run, the VPN launcher,
   Run Script.
2. **The allocator runs inside the cross-window lease (entry 1.1, the only counted change).** The first text had an
   in-memory per-account promise chain, which covers one window. It was rewritten after plan round 1 (two reviewers) to
   one `updateNodeFields` call with a function patch, run inside the write queue and the lease. The check that skips the
   call for a folder holding a string stands OUTSIDE the lease, because every `updateNodeFields` stamps the version
   vector; the same check is repeated inside. A call that loses the race stamps the folder once with no change: three
   memento writes and one sync upload. It happens in one window too, when two calls for one uncoloured folder start
   together (the E1.S2 spec's P2, measured as M1 and M5), not only in two windows as §3.2 says.
3. **The stale-copy residual is named, not fixed.** The lease makes two windows take turns; it does not make a
   window's `globalState` copy fresh. So (a) a second window can tally an old list and give two folders one colour, and
   (b) worse, `saveNodes` (`storageManager.ts:1005`) writes the WHOLE node list from that copy, so a stale window's write
   can drop another window's write made within the broadcast delay: the colour, a rename, any node edit. This holds for
   every leased node write in the extension, not for the colour alone. It has its own stub plan,
   [PLAN_node_writes_refuse_stale_base.md](../todo/PLAN_node_writes_refuse_stale_base.md), which stays in `todo/` because
   nothing of it is built. Checked: a probe over the real `StorageManager` with one shared memento and a real lock
   directory (M1-M6 of the E1.S2 spec); a MODEL of two windows with a 400 ms late broadcast (M7: both windows picked
   `depColor1`, and each whole-list write dropped the other's); `storageManager.ts:1005` and `windowLock.ts:17-21` read.
   NOT checked: two real VS Code windows. The two-window test R4 proves the lease's serialization only (item 6).
4. **The scan test checks a module, not the order inside a function.** §6.5 check 1 says every module that builds a
   key also calls `ensureFolderColor(`. X1 does exactly that, so a new road inside a module that already colours passes
   it uncoloured. Checked: the cadence consultation of 2026-11-12 built the counterexample and it passed X1. Not
   changed, because rewriting a planned test after approval would have been the plan's second change and a stop. The
   follow-up (a shared async "allocate, then key" helper, with the synchronous lookup-only builders exempted) is NOT
   built. X1 has one allowed exception that §6.5 does not name: `terminalManager.ts:38` builds the key of the default
   place, which has no folder (E1 finding F2). The module document says the limit.
5. **A failed colour write is logged, and `log` is required on every road.** §3.2 says only that a failed write rejects
   that call. Shipped (E1 plan round 1, D2; scenario C10): each caller catches the rejection with
   `noteColourFailure(log)`, which writes ONE line to the diagnostic log (source `folderColors`, `describeError`'s text,
   no folder or entry name), opens the terminal without a colour, and shows no toast. The E1.S3 review found that
   `credSshManager.connectSsh` passed no `log`, so a failed write there was dropped in silence. Since then `log` is a
   required field of every dependency type, so the compiler finds a missing one, and a test goes through the real command.
6. **R4 was rewritten, and a no-lock control was added.** After
   the Opus review of E1.S2 (`91f2a7d9`) R4 holds window a at its write, so window b has to wait for the lease, and a
   control with no lock shows the residual of item 3 (window b picks the same key). The fake's first wait went (it did
   nothing), A3 asserts identity on the fake, A4 and A5 read their Givens back, and V2 got a tooth that bites. R4 proves the
   lease over one memento object and one lock directory. It does NOT prove the broadcast of a real window.
7. **`folderColorAllocator.test.ts` is 464 lines against the 450 the E1.S2 spec planned.** Both are under the 800-line
   ceiling. The two-window helpers moved out of `crossWindowWrites.test.ts` into `test/twoWindowsWorld.ts`, and the shared
   fake storage into `test/folderColorStorage.ts` (the spec's P7).
8. **The folder run did not need the re-read §3.3 asks for (E1 finding F3).** §3.3 says the run re-reads the node it
   builds keys from at `folderRunCommand.ts:93` and `:203`. `keyOf` (`:93`) builds keys only to FIND terminals by title,
   and a colour does not change a title. The keys that CREATE terminals come from `keyOfRow` (`:203`), which already reads
   storage fresh after the ensure calls. The call is `colourRows`, once per row to type, in row order, before the first
   preparation.
9. **New modules and one export that §3 does not list.** `terminalColor.ts` (`folderColorOption`; a module of its own
   because `terminalManager.test.ts:61` replaces `./pinnedTerminal`), `folderSwatchScript.ts`, `paletteJson` exported from
   `depPickerScript.ts`, and `DEP_SWATCH_STYLES` moved out of `formStyleSheet` in `entityFormStyles.ts` so both forms load
   one set of rules. `editFolder` lost its `eslint-disable complexity`. `treeDataProvider.ts` has 798 lines, as planned.
10. **The trash rule became "any depth".** §3.2 says "the trash". Shipped: the allocator writes nothing for a folder
    inside the trash at any depth (E1.S2 spec P6a), and since the E2.S1 review (`74528ee8`) the form's save
    (`folderColorChange`) and its suggestion (`folderFormColour`) check it at any depth too, from the node as it is
    then. A crafted save cannot colour a folder inside the trash. The form in the trash has no Colour row (E2 D5). A
    colour a folder wore before it went in keeps showing.
11. **The form saves differently from §3.5.** §3.5 says `editFolder` writes `folderColor` only when a swatch was chosen
    and it differs from the stored one. Shipped (E2 D1, D2): only a CLICK is a choice (the marked stored colour is not),
    and the save is one `updateNodeFields` call with a function patch that compares with the node AS IT IS THEN. So a
    rename keeps a colour that the auto-pick or another window wrote while the form was open, and an explicit choice wins
    over the auto-pick in either order. That holds as far as the write is visible in the saving window (item 3). A cleared
    name box adds no name to the change, so it keeps another window's rename (E2.S1 review). A Save still stamps the
    folder once, as before the feature (E2 finding F1). A folder holding a string this build does not know gets no mark
    and no suggestion line (E2 D4). The line's words changed: *this can change before then* and *Choose one to set it now*
    (D6; §3.5 had *Choose one to fix it*).
12. **Export and Import are not alike (E1 finding F5, corrected by the E2.S2 review).** *Export / Share Externally…*
    and *Import from External…* do not carry the colour: an imported folder is rebuilt from name, type and the PIN
    preference, and gets its colour again at its first terminal. *Import / Restore*, sync and backup move whole nodes
    and keep it. §3.1 said only "folders are not shared".
13. **Two more side effects, accepted (E1 finding F4).** `entryAt` also serves Run with Secrets, whose terminal is
    `Creds run: …` and gets no colour, and it runs before the trust question. So such a run, or a cancelled trust
    question, still gives the folder its colour. One write per folder, ever. The first open from an uncoloured folder
    waits for the lease with no bound of its own (the spec's P3): a dead holder is broken after 15 s, a live one is waited for.
14. **The stub plan** `PLAN_node_writes_refuse_stale_base.md` is one document more than §3.6 lists (E2 finding F7).
    It adds no scope to this plan.
15. **The documents.** The CHANGELOG entry, the module document's section *Folder colours* (written in E1, extended in E2),
    and the help paragraph in five languages (German, Spanish, Russian, Ukrainian after English; `folderColorHelp.test.ts`
    checks each translation for a phrase of its own). *Colour*, *Edit*, `Creds:` and `Creds SSH:` stay English.

**The gates.** Parent plan round: `proceed`, 2 of 2 reviewers (6 findings accepted). E1 plan round 1: 1 of 2 reviewers,
because the antigravity provider failed with a 403 (a ToS account block). E1 code round: 5 of 8 reviewers. E2 plan
round: 2 of 2. E2 code round: 8 of 8. Cadence consultation 2026-11-12 (epics 1-2): items 1-3 of the lead's decisions in
the E1 stories. Opus reviews of E1.S1, E1.S2, E1.S3, E2.S1 and E2.S2.

**Not checked.** How the colours look in the owner's real VS Code window (the PR says so). Two real VS Code windows.
The Definition of Done boxes of §8 are not ticked here: the checks they name belong to the pull request.

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
- **Stories** (`research/PLAN_folder_colors_E1.md`, written when the epic starts):
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
- **Stories** (`research/PLAN_folder_colors_E2.md`, written when the epic starts):
  - **E2.S1 — the folder form.** The swatches, the provisional suggestion line, the validated message
    (`isDepColorKey`), and the write only on a change in `editFolder` (§3.5).
  - **E2.S2 — the documents.** The CHANGELOG entry, the rest of the module document (the form), and the help
    paragraph in five languages, English first (§3.6, repository rule 7).

Cornerstones: 1 of 1 — E1.S2
