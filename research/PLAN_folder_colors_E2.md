# PLAN — folder colours, epic E2: the person chooses the colour; the documents are complete

> Status: **IMPLEMENTED, 2026-11-12.** Stories of epic E2 of [PLAN_folder_colors.md](PLAN_folder_colors.md): the person
> chooses the colour in the folder form, and the documents are complete. Scope: `src_vs_code` only. No cornerstone.
> Deviations: below, and § 9 of the parent. Built on `feat/folder-colors-e2`, which starts at the end of E1 (`6c9149bd`).

Paths are relative to `src_vs_code/src/` unless they say otherwise. Every `file:line` was opened on commit `6c9149bd`.

## The two stories

| Story | What | Scenarios and brief | Code, tests, writing | Review |
|---|---|---|---|---|
| S1 | The folder form: the swatches, the suggestion line, `readValues`, and the write in `editFolder` | Opus, this document | Sonnet | Opus |
| S2 | The documents: CHANGELOG, the module document's form part, the help in five languages, one stub plan | Opus, this document | Sonnet | Opus |

No cornerstone is marked, so the ledger stays `Cornerstones: 1 of 1 — E1.S2`. The README row is committed with this file.

## Build order, and what each story leaves green

1. **S1.** Every S1 scenario is green. Typecheck, lint and the whole `npm test` are green.
2. **S2.** H1-H2 green, the documents written, `plan-lifecycle.mjs` clean, `npm run package` builds. This closes E2.

## Rules for every story

- **RED, GREEN, then teeth.** Write the test; watch it fail for the reason its name gives (a new function gets a wrong
  body first, so RED is an assertion, not a compile error). Write the code; watch it pass. Apply the *Revert*, watch
  it go red, restore. Report all three observations.
- **Fixtures pass the real guard** (`isTreeNode`, as `folderColorAllocator.test.ts:33-37` does). Keys come from
  `DEP_COLOR_KEYS`; a pick is read back from `pickFolderColor` or `ensureFolderColor`, never typed. Eslint: complexity
  4, 50 lines per function, 800 per file.
- **Commands** (from `src_vs_code`): `npm run typecheck`, `npm run lint`, `npm test`. One file:
  `npm run compile && node ../.agents/conventions/tools/low-priority.mjs node --test out/test/<name>.test.js`.

## E2.S1 — the folder form

- model: brief and scenarios — opus
- model: code and tests — sonnet
- model: review — opus

**Goal.** The folder form shows the twelve swatches and saves a colour only when the person clicked one. Parent §3.5,
§6.7.

### S1 decisions

| # | Decision | Source |
|---|---|---|
| D1 | **Edit intent.** An untouched swatch row sends NO `folderColor`. Only a click on a swatch is a choice. The form's first marking of the stored colour is not a choice. | A consultant, 2026-11-12, verified by the lead |
| D2 | **Precedence.** A choice wins over the auto-pick. `editFolder` does not write from the node it read when the form opened. The save is ONE `updateNodeFields` call with a FUNCTION patch (`storageManager.ts:521-531`, run inside the lease). The patch sets `folderColor` only when the person chose a key and that key differs from the node AS IT IS THEN. A save with no choice (a rename only) leaves `folderColor` alone, even when another window or the auto-pick wrote one while the form was open — **as far as that write is visible in the saving window** (E2 plan round 1): the patch sees this window's copy of the node list, and a write from another window that has not arrived by broadcast is not seen; the whole-list save can then drop it. That is E1's named residual (P1), not fixed here; the stub `PLAN_node_writes_refuse_stale_base.md` (S2) is its plan. | The same consultant and lead |
| D3 | The swatches are the dependency swatches: the same palette JSON (`paletteJson`, `depPickerScript.ts:41-50`, now exported), the same classes `depSwatches` / `depSwatch` / `depSwatchOn`, the same `jsonForScript` rule (`webviewHtml.ts:162`). There is no "no colour" choice. | Parent §3.5 |
| D4 | The suggestion line shows only when the folder holds NO string. A key this build does not know (`depColor99`) gets no mark and no line, because the auto-pick never writes over a string (E1). A click replaces it. | This document (finding F3) |
| D5 | A folder in the trash (`inTrash`) gets no Colour row, like the access switches (`folderFormPage.ts:107`). The trash itself is never painted, and the auto-pick never colours inside it. | This document (finding F2) |
| D6 | The line reads: *No colour yet. The first terminal opened from this folder gets the least-used colour at that moment (now: &lt;label&gt;; this can change before then). Choose one to set it now.* | Parent §3.5, in plainer words (finding F4) |

### S1 brief

1. **`depPickerScript.ts`.** Export `paletteJson` (`:41`). No other change.
2. **`entityFormStyles.ts`.** Move the three swatch rules and their comment (`:66-73`) into
   `export const DEP_SWATCH_STYLES` in the same file. `formStyleSheet` interpolates it where the rules were. Fix
   "ten distinguishable squares" in that comment to "twelve".
3. **`folderColors.ts`** (no `vscode`). Add two pure functions:
   - `folderColorChange(now: TreeNode, chosen: DepColorKey | undefined): Partial<TreeNode>` — `{ folderColor: chosen }`
     only when `chosen` is defined, `now` is a folder that is not the trash (reuse `storedFolderColor`'s test, `:19-21`),
     and `now.folderColor !== chosen`. Otherwise `{}`, with NO `folderColor` property.
   - `folderFormColour(folder: TreeNode, nodes: readonly TreeNode[]): { folderColor?: DepColorKey; suggestedColor?: DepColorKey }`
     — `folderColor` is `folderColorKeyOf(folder)`; `suggestedColor` is `pickFolderColor(nodes)` only when
     `typeof folder.folderColor !== 'string'` (D4). Each property is left out when it has no value.
4. **New `folderSwatchScript.ts`** (no `vscode`). `folderSwatchScript(marked: DepColorKey | undefined): string`
   returns a page-script FRAGMENT: `var FOLDER_PALETTE = ${paletteJson()};`,
   `var folderMarked = ${jsonForScript(marked ?? null)};`, `var folderChosen = undefined;`, and
   `paintFolderSwatches()`, which empties `#folderSwatches` (`textContent = ''`) and appends one `button` per palette
   entry: `type` button, class `depSwatch` (plus ` depSwatchOn` for `folderChosen ?? folderMarked`),
   `style.background = entry.css`, `title` and `aria-label` = the label, `data-key` = the key. A click sets
   `folderChosen = entry.key` and repaints. `collectFolderColor()` returns `folderChosen`. The fragment ends with
   `paintFolderSwatches();`. The shape is `depSwatch` (`depPickerScript.ts:109-124`).
5. **`folderFormPage.ts`.** `FolderFormOptions` (`:31-64`) gains `folderColor?: DepColorKey` and
   `suggestedColor?: DepColorKey`, each with a doc comment. The `<style>` adds `${DEP_SWATCH_STYLES}`. When not
   `inTrash`, a `<fieldset><legend>Colour</legend>` sits between General (`:100-105`) and the access fieldset. It holds
   `<span class="depSwatches" id="folderSwatches"></span>` and, when `suggestedColor` is set, the D6 line as
   `<p class="hint" id="folderColorHint">`, the label from `DEP_COLOR_LABELS` through `escapeHtml`. The script adds
   `folderSwatchScript(options.folderColor)`, or `function collectFolderColor() { return undefined; }` in the trash
   (the shape of `:112`). `save()` (`:113-118`) adds `folderColor: collectFolderColor(),` (JSON drops `undefined`).
   The file comment's "Name and agent access, and nothing else" (`:25-28`) names the colour too.
6. **`folderFormPanel.ts`.** `FolderFormValues` (`:16-27`) gains `folderColor?: DepColorKey` (doc: present only when a
   swatch was clicked). `FolderFormMessage.data` (`:31`) and the `readValues` parameter (`:93`) gain
   `folderColor?: unknown`. `readValues` adds `folderColor: isDepColorKey(data.folderColor) ? data.folderColor : undefined`.
7. **`entityEditCommands.ts` `editFolder`** (`:361-396`). Its comment asks that it meet the complexity ceiling when
   next touched, so remove the `eslint-disable-next-line complexity` (`:361`). Move the options into
   `folderFormOptions(accountId, node, storage)`: the current fields (`:374-386`, with the inherited ternary in a
   helper of its own) plus `...folderFormColour(node, nodes)`. Replace the object patch (`:391-394`) with
   `(now) => ({ name: …, mcp: result.mcp, ...folderColorChange(now, result.folderColor) })` (D2). The name rule does
   not change. Never read `node.folderColor` in the write.

### S1 scenarios

Page scenarios run the fragment with `runFragment` (`test/miniDom.ts:154`) over a `MiniDocument` holding `folderSwatches`.

- **W1** — `test/folderFormPage.test.ts`, `the_colour_row_offers_every_palette_key_once_and_nothing_else`. Given no
  colour. When the fragment runs. Then `#folderSwatches` holds `DEP_COLOR_KEYS.length` children in that order, each
  with class `depSwatch`, `data-key` its key, `title` its `DEP_COLOR_LABELS` label, and a background holding
  `--vscode-credSshManager-<key>` and `DEP_COLOR_FALLBACK[key]`. No other child: no "no colour" choice.
  *Revert:* empty the loop in `paintFolderSwatches`.
- **W2** — same file, `the_stored_colour_is_marked_and_is_not_a_choice` (D1). Given `folderColor: DEP_COLOR_KEYS[3]`.
  When nothing is clicked. Then only that swatch has `depSwatchOn`, and `collectFolderColor()` is `undefined`.
  *Revert:* start with `folderChosen = folderMarked`.
- **W3** — same file, `a_click_is_the_choice_and_moves_the_mark`. Given `DEP_COLOR_KEYS[3]` stored. When swatch
  `[7]` fires `click`. Then `collectFolderColor()` is `[7]` and only `[7]` is marked. When swatch `[3]` is clicked
  next, the result is `[3]`: a click on the stored key is a choice too (E4 makes it write nothing).
  *Revert:* drop `folderChosen = entry.key` from the click handler.
- **W4** — same file, `the_suggestion_line_shows_only_without_a_colour_and_says_it_can_change` (D6). Given
  `suggestedColor: DEP_COLOR_KEYS[2]` and no `folderColor`. Then `folderColorHint` holds that key's label and the words
  `can change`. Given `folderColor: DEP_COLOR_KEYS[1]` alone, or neither field, there is no `folderColorHint`.
  *Revert:* render the line when `folderColor` is undefined (the "neither" case fails); or drop the "can change" clause.
- **W5** — `test/folderColors.test.ts`, `the_form_marks_a_known_key_and_suggests_only_for_a_folder_holding_no_string`
  (D4). Nodes: `f-none` (no field), `f-k` (`DEP_COLOR_KEYS[0]`), `f-99` (`depColor99`). Then `folderFormColour` gives
  `f-none` only `suggestedColor`, equal to `pickFolderColor(nodes)`; `f-k` only `folderColor`; `f-99` neither (no own
  property). *Revert:* suggest whenever `folderColorKeyOf` is undefined (`f-99` fails).
- **W6** — `test/folderFormPage.test.ts`, `the_trash_has_no_colour_row` (D5). Given `inTrash: true` and a
  `folderColor`. Then no `folderSwatches`, no `<legend>Colour</legend>`, and the script holds the `collectFolderColor`
  that returns `undefined`. *Revert:* render the Colour fieldset without the `inTrash` check.
- **W7** — same file, `the_folder_form_and_the_entity_form_share_one_swatch_style_and_palette` (D3). The folder page
  contains `DEP_SWATCH_STYLES` and `paletteJson()`; `formStyleSheet(0)` contains `DEP_SWATCH_STYLES`.
  *Revert:* remove `${DEP_SWATCH_STYLES}` from the folder page's `<style>`.
- **W8** — `test/webviewHtml.test.ts`, `the_folder_form_page_script_parses_with_and_without_a_colour`. For a suggested,
  a coloured and a trashed form, `new Function('acquireVsCodeApi', script)` does not throw (the shape of `:141-162`),
  and the script posts `folderColor: collectFolderColor()`. *Revert:* drop that line from `save()`.
- **V1** — `test/folderFormPanel.test.ts`, `read_values_keeps_a_palette_key_and_drops_everything_else` (parent §3.5,
  untrusted webview input). Through a JSON round trip, as `:168-176` does: every `DEP_COLOR_KEYS` key is kept;
  `depColor99`, `DEPCOLOR1`, `' depColor1'`, `__proto__`, `constructor`, `3`, `null`, `true`, `{}`, `['depColor1']`
  and an absent field give `undefined`. Name and mcp read as before. *Revert:* `typeof data.folderColor === 'string'`.

The `E` scenarios are in the new `test/folderFormSave.test.ts`. They drive the REAL `editNode` with a FOLDER node. Load it
with `loadWithVscode(…, { './folderFormPanel': { showFolderForm } })` (the shape of `editProtected.test.ts:275-279`).
The fake `showFolderForm` records its options and returns a promise that the test resolves. The storage is the E1 fake
`folderColorStorage` (`test/folderColorStorage.ts`), passed `as never` (as `envSaveNotice.test.ts:414` does). "The
save's change" is the save's entry in `fake.written`.

- **E1** — `a_rename_keeps_a_colour_another_window_wrote_while_the_form_was_open` (test a). Given a folder that wears
  `DEP_COLOR_KEYS[0]`. When the form is open, `fake.put` gives the folder `[1]`. Then the form saves a new name with no
  colour. Then the folder has the new name and `[1]`, and the save's change is `byFunction` with no own `folderColor`.
  *Revert:* (i) the object patch `{ name, mcp, folderColor: node.folderColor }` (`[0]` comes back);
  (ii) `folderColor: result.folderColor` with no check (the colour is cleared).
- **E2** — `a_save_without_a_choice_keeps_the_colour_the_auto_pick_wrote_meanwhile` (test b). Given an uncoloured folder
  `f` with entry `e`. The form opens with `suggestedColor`. While it is open, `await ensureFolderColor(fake, A, 'e')`
  returns K. The form saves a rename. Then `f` wears K. *Revert:* (i) of E1.
- **E3** — `an_explicit_choice_wins_over_the_auto_pick_in_both_orders` (test c). C is the first key that is not K.
  Order 1: the auto-pick writes K while the form is open, then the form saves C. Then `f` wears C. Order 2:
  `fake.beforePatch(() => { racing = ensureFolderColor(fake, A, 'e'); })`, then the form saves C. The auto-pick's
  outside check runs before the save stores C, so it queues behind it. Then `f` wears C, `racing` resolves to C, and
  the auto-pick's change is `{}`. *Revert:* write the choice only when `now` holds no string (order 1 fails).
- **E4** — `a_choice_equal_to_the_stored_key_adds_nothing_to_the_write` (test f). Given a folder that wears
  `DEP_COLOR_KEYS[2]`. The form saves `[2]`: the save makes ONE `updateNodeFields` call, and its change has no own
  `folderColor`. Given `[2]` stored, `fake.put` gives it `[4]` while the form is open, and the form saves `[4]`: still
  no `folderColor` in the change. Positive tail: a choice of `[5]` puts `folderColor: [5]` in the change and in storage.
  *Revert:* compare with the snapshot, `node.folderColor !== chosen` (the `[4]` case fails); or drop the comparison
  (the first case fails).
- **E5** — `the_form_is_given_the_marked_key_and_the_suggestion`. The options that `showFolderForm` received: a coloured
  folder gives `folderColor` and no `suggestedColor`; an uncoloured one gives `suggestedColor` equal to
  `pickFolderColor(fake.getNodes(A))`. *Revert:* drop `...folderFormColour(…)` from `folderFormOptions`.

## E2.S2 — the documents

- model: brief — opus
- model: writing — sonnet
- model: review — opus

**Goal.** The CHANGELOG, the module document and the help in five languages describe the whole feature. The storage
weakness that E1 named gets a stub plan of its own. Parent §3.6, §8.

### S2 brief

1. **`src_vs_code/CHANGELOG.md`**, under `## [Unreleased]` (`:7`), one entry
   `### Added — a folder has a colour, and its terminals wear it`. Short sentences: the first terminal opened from a
   folder gives the folder the least-used colour of the dependency palette, once; the folder's row and the icon of its
   `Creds: <folder> / <entry>` and `Creds SSH: <folder> / <entry>` terminals wear it; *Edit* on a folder has a **Colour**
   row with twelve swatches; a terminal already open keeps its colour; there is no way back to no colour; other terminals,
   the trash and root entries get no colour; Export and Import do not carry the colour (E1's F5).
2. **`research/module_extension.md`**, the *Folder colours* section (`:3180-3246`). Make the note at `:3182-3183` name
   both epic files. Add a paragraph **The choice in the form.** before **The limit.** (`:3226`): the twelve swatches
   (D3), the edit intent (D1), the precedence and the one function patch (D2), the suggestion line and when it shows (D4,
   D6), `readValues` and `isDepColorKey`, no "no colour", no row in the trash (D5), and that a Save still stamps the
   folder once, as before (finding F1). Change the future tense at `:3227` and `:3237` ("E2's form") to the present. The
   residual paragraph (`:3235-3246`) ends with one sentence that links the stub of item 4, relative
   (`../todo/PLAN_node_writes_refuse_stale_base.md`).
3. **The help, five languages, English first** (`.agents/PROJECT.md` rule 7). In the article `basics` (*Entries: the
   nine kinds…*, `helpEn.ts:80`), field `usage`, one new paragraph directly after the paragraph that starts
   `**The lines of a folder run do not wait for each other.**`, at the same place in `helpDe.ts`, `helpEs.ts`,
   `helpRu.ts`, `helpUk.ts`. It says what item 1 says, in the reader's words. **Colour**, *Edit*, `Creds:` and
   `Creds SSH:` stay English in every language.
4. **New `todo/PLAN_node_writes_refuse_stale_base.md`**, with its own `todo/README.md` row (status "not started, a
   stub"). Line 3: `> Status: **not started, a stub, 2026-11-12.**`. About 40 lines:
   - **The goal.** A window whose `globalState` copy is stale writes the WHOLE node list (`saveNodes`,
     `storageManager.ts:1005`) inside the lease. The lease serializes the windows but does not make a copy fresh
     (`windowLock.ts:17-21`; `research/PLAN_cross_window_write_coordination.md` § *The design round that changed the
     primitive — 2026-09-03*). So a write can drop another window's write that has not arrived by broadcast. E1 of
     the folder colours named it (P1, link `PLAN_folder_colors_E1.md`). It holds for every leased node write.
   - **The precedent**, as paths in the sibling repository `dew_flow_connect_other_ais` (not links; the planning rule
     on citations across repositories): `src_vs_code/src/chatStoreFile.ts:421` (a save names the revision it read) and
     `:522-554` (inside the claim it reads the record on disk, compares the revision, and refuses a mismatch);
     `src_vs_code/src/test/chatStoreFile.test.ts:700` (two writers, one revision: one lands, the other is refused);
     `src_vs_code/src/chatStoreWrite.ts:74-90` (taking the disk's revision and trying again re-opens the lost update,
     so it compares contents).
   - **Open questions** (not answered in the stub): where the authoritative revision lives, since a memento has no
     fresh read; refuse or merge; what each caller does with a refusal.
   - Build order, test plan and Definition of Done: "written when the plan is written"; the stub's own done-when is a
     plan that passed the coai plan gate.

### S2 scenarios

- **H1** — new `test/folderColorHelp.test.ts` (the shape of `folderRunHelp.test.ts`),
  `every_language_tells_the_folder_colour_with_its_labels_in_english`. For each of `HELP_LANGUAGES`, the `basics` body
  is not a fallback and holds `**Colour**`, `Creds:` and `Creds SSH:`, AND (E2 plan round 1, two reviewers) for each
  non-English language one distinctive phrase of its own translation of the paragraph — the word for "terminal icon" or
  the sentence that an open terminal keeps its colour, written in that language — so a paragraph left in English or
  left out fails. RED before item 3. *Revert:* delete the paragraph from `helpUk.ts` (the test names `uk`); or put the
  English paragraph into `helpDe.ts` (the test names `de`). The Opus review of S2 also reads each translation against
  the English source and says it carries the same claims (when the colour is given, how to choose one, the open-terminal
  limit).
- **H2** — same file, `the_english_help_says_an_open_terminal_keeps_its_colour`. The English body holds the exact
  sentence S2 writes for the limit. *Revert:* delete that sentence.
- **No test, checked by hand and said in the summary:** the CHANGELOG entry, the module document, the stub and its
  README row. `node .agents/conventions/tools/plan-lifecycle.mjs` is clean, which also resolves every new link.

## E2 is done when

- Every S1 and S2 scenario was seen RED, GREEN, and red again with its *Revert*. The summary gives the messages.
- `npm run typecheck`, `npm run lint`, the whole `npm test` and `npm run package` are green. `treeDataProvider.ts` still
  has at most 800 lines (E2 does not touch it).
- The coai code round reached `proceed`, and every finding is resolved. The PR says that the colours were not checked in
  the owner's real VS Code window.
- Then the lead promotes the parent, `PLAN_folder_colors_E1.md`, `PLAN_folder_colors_E1_S2_spec.md` and this file
  together, with their deviations (E1's F1-F5 and this file's findings). The stub stays in `todo/`.

**Not in E2:** the shared "allocate, then key" helper for X1's known limit (E1, the cadence consultation, point 2); a
Save that changes nothing and so writes nothing (F1); fixing the stale-copy write (S2 writes only its stub).

## Findings against the parent

The parent is not edited here. The lead decides each finding. If in doubt, a finding counts as a plan change, and any
one would be the SECOND change of epoch 1, which stops the plan. My reading of each is below.

- **F1 — "no version-vector bump" holds for the colour, not for the Save.** §3.5 gives `applyDependencyColors`'s
  reason. But `editFolder` writes `name` and `mcp` on every Save today (`entityEditCommands.ts:391-394`), and
  `updateNodeFields` stamps on every call (`storageManager.ts:528`). So E4 proves that an equal colour adds no field and
  no second write; a Save still stamps the folder once, as before E2. §3.5 as written holds. Not a change.
- **F2 — the trash.** §3.5 does not say what the form shows there. D5 shows no Colour row, like the access switches.
- **F3 — an unknown stored key.** §3.5's "no colour yet" is read as "holds no string" (D4). With `depColor99` nothing is
  marked and there is no line, because the auto-pick would not write.
- **F4 — the sentence.** D6 makes "provisional" explicit ("this can change before then"), and "set it now" replaces
  "fix it", which a non-native reader can read as "repair it".
- **F5 — reuse needs two exports.** `paletteJson` is private (`depPickerScript.ts:41`), and the swatch CSS is in the
  entity form's stylesheet (`entityFormStyles.ts:66-73`), which the folder page does not load. S1 exports both.
- **F6 — "the stored one" is the node inside the lease** (D2, the consultant's decision), not the node read when the
  form opened. It says how to keep §3.5. Not a change.
- **F7 — one document more than §3.6 lists.** The stub `todo/PLAN_node_writes_refuse_stale_base.md` is a separate plan.
  It does not change this plan's scope; the module document links it from the residual that §3.2 and E1 accepted.

### The lead's decisions (2026-11-12)

- **F1 — accepted as written; not a change.** §3.5's aim is that the COLOUR adds no write when it is unchanged (the
  reason `applyDependencyColors` gives). A Save already writes `name` and `mcp` and stamps once today; E4 proves the
  colour adds no field and no second write. Skipping an empty Save stays out of E2.
- **F2 — accepted; not a change.** §3.5 is silent about the trash; the form in the trash already hides the access
  switches, and the auto-pick never colours inside the trash, so D5 fills a silence the existing form already answers.
- **F3-F7 — accepted as written.** F7: the stub is a separate plan; it adds no scope to this one.

## Deviations

The deviations of the whole plan are § 9 of [PLAN_folder_colors.md](PLAN_folder_colors.md). What belongs to E2:

1. **D2 was narrowed in plan round 1** (`e0e24e5b`): "a rename keeps a colour another window wrote" holds as far as the
   write is visible in the saving window. The stale-copy residual is not fixed here. S2 wrote only its stub,
   [PLAN_node_writes_refuse_stale_base.md](../todo/PLAN_node_writes_refuse_stale_base.md), which stays in `todo/`.
2. **The E2.S1 review** (`74528ee8`): `folderColorChange` and `folderFormColour` check the trash at any depth, from the
   node as it is then (a crafted save cannot colour a folder inside the trash, and the form inside the trash gets no
   suggestion); an empty name box adds no name to the change, so a cleared name keeps another window's rename; the
   swatches move their mark in place (focus stays, `aria-pressed`); the doc comment of `editFolder` says the rules.
3. **The E2.S2 review** (`026c0d12`): *Import / Restore* keeps the colour, while *Export / Share Externally…* and *Import from
   External…* drop it (E1's F5 had said "Export and Import"); the help says Save and where the suggestion shows; the module
   document says the trash at any depth; the German grammar and the Russian and Ukrainian wording were fixed; the stub's
   cross-repository citations were made paths; the help test builds the terminal titles with `terminalTitles.ts`, so the
   title scan stays green.
4. **H1 checks each translation** for a phrase of its own (E2 plan round 1, two reviewers), so a paragraph left in English
   or left out fails for the named language.
5. **Not built, as the E2 text said:** the shared "allocate, then key" helper (X1's limit), a Save that changes nothing and
   so writes nothing (F1), the fix of the stale-copy write.
6. **coai.** E2 plan round: 2 of 2 reviewers. E2 code round: 8 of 8. Not checked: the colours in the owner's real VS Code
   window.
