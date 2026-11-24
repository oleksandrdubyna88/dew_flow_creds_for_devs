# PLAN — the search stays reachable while the CredsForDevs tree scrolls, and it is green

> Status: **IMPLEMENTED, 2026-11-23.** Extension 1.23.0 (#382, squash 3007e5bd, merged 2026-11-18; release PR #383, squash
> 95e11116, tag `extension-v1.23.0`, 2026-11-23). The owner checked it by hand in a real VS Code window on 2026-11-23 (§8). The
> deviations are in §7. Scope: the extension only (`src_vs_code`): the view's title bar, the filter row's colours, the line
> above the tree, the filter box, their tests and the docs. No change to how the filter matches.
>
> This plan was never in `todo/`. It was written during the work, outside the repository, and sent to the coai plan gate as
> text. This record was rebuilt on 2026-11-23 from the text the gate reviewed (round 2) and from the working copy written
> after the gate. Sections 1–6 are that plan. Sections 7 and 8 were written at promotion.

## 1. Goal (owner's request, 2026-11-18)

"The search row must stay fixed and not disappear when scrolling. Make the search icon (magnifier) green, and the word Search
green too."

Fact: a VS Code `TreeView` cannot pin a leaf row. Three options went to the owner:

- **A:** a separate `WebviewView` with a real input above the tree.
- **B:** the search row as an ancestor of every row, relying on sticky scroll.
- **C:** a pinned title-bar action plus `TreeView.message`.

Two consultants rejected B: clicking a collapsible parent collapses the vault, and sticky scroll depends on a user setting.
**The owner chose C.**

## 2. What must be true when done

1. The view's title bar (it never scrolls) carries a GREEN magnifier action that opens the existing filter InputBox
   (`credSshManager.search`). It is leftmost, before the yellow help "?".
2. While a filter is active, the title bar also carries the Clear Filter action (`credSshManager.clearSearch`, codicon
   close). The `TreeView.message` above the tree (it does not scroll) reads the same text as the row:
   `Search: <query> — <N found | nothing matches>[  ·  unknown filter: …]`. When no filter is active the message is empty
   (no banner).
3. The existing first tree row keeps working exactly as before. Its icon is green, both idle (`search`) and active
   (`filter-filled`), and its LABEL text ("Search" / "Search: <query>") is green. The grey description stays grey.
4. Nothing else in the tree changes colour. The decoration provider still answers `undefined` for every uri that is not
   ours, because VS Code asks it about every workspace file.

## 3. Design

- `package.json` `contributes.colors`: new `credSshManager.searchAccent` (dark `#3FB950`, light `#2DA042`, hc `#4AE168`,
  hcLight `#117A2D`), the same green the green icons use.
- `media/search-green.svg` and `media/search-green-light.svg`: a codicon-shaped magnifier, `#3FB950` / `#2DA042`. A codicon
  cannot be coloured in a title bar. The help "?" already uses the same SVG-pair pattern. The `credSshManager.search`
  command icon becomes this pair.
- `view/title`: the repo's manifest test requires a plain non-negative integer after `@`, so the navigation group is
  renumbered:
  - search `navigation@0`;
  - clearSearch `navigation@1` (when `view == credSshManagerView && credSshManager.searchActive`);
  - help `@2`, addAccount `@3`;
  - refresh `@4` and syncNow `@5` keep their numbers.
- New `searchAccent.ts`, small, with vscode-only constants: the colour id, a synthetic `credssearch:/row` uri, and
  `searchRowDecoration(uri)`. That function returns a `FileDecoration` with the accent colour for that uri only.
- `searchRowItem.ts`:
  - the icon is `new ThemeIcon(look.icon, new ThemeColor(SEARCH_ACCENT_COLOR_ID))`;
  - `resourceUri = searchRowUri()`. A `resourceUri` supplies the label and icon only when they are absent, and both are
    set explicitly.
- `depDecorations.ts`: `provideFileDecoration` answers `searchRowDecoration(uri)` first. This widens the one provider the
  extension registers instead of adding a second one (the file already explains why two providers on the workbench are
  avoided). Both checks compare the scheme string first.
- New small module `searchPin.ts`. It adds no code to `treeDataProvider.ts`, which sits at 798 of its 800-line ceiling. It
  holds two functions:
  - `pinnedSearchState(row)`, a pure function;
  - `pinSearch(treeView, provider)`, which:
    - subscribes to `provider.onDidChangeTreeData`;
    - reads the row through `provider.getTreeItem({ kind: 'search' })`, the one road that builds the row, so there is no
      second copy of the wording;
    - sets `treeView.message` and the `credSshManager.searchActive` context key from the row's `contextValue`
      (`credSearchActive`), and only when the value changes.

  It is wired once in `extension.ts`, after `createTreeView`. Every path that changes the query (InputBox, clearSearch,
  goToOriginalFolder, and the others) goes through setSearchQuery → refresh → onDidChangeTreeData, so all of them are
  covered.

## 4. Tests

The repo convention is node:test with no VS Code harness. One new file, `searchPinned.test.ts`, written first (RED):

- The idle and active rows carry the accent `ThemeColor` on the icon and the synthetic `resourceUri`. Both rows are built
  by the real `searchRowItem`.
- The decoration provider answers the accent for the row uri without reading the dependency graph. It still answers
  `undefined` for a file uri and for an unrelated dep uri, and the search green never answers for a dep uri.
- `pinnedSearchState`:
  - idle → empty message and `false`;
  - active → "Search: prod — 4 found" and `true`;
  - zero matches → "nothing matches".
- `pinSearch`: the banner and the context key follow repaints, an unchanged state is not sent again, and dispose stops the
  listening.
- Manifest:
  - the colour is contributed;
  - the search command icon is an existing SVG pair;
  - search and clear come before help in the title bar;
  - clear is gated on the context key.

## 5. Out of scope

- A real inline text field (option A).
- Any change to the filtering logic.

The CHANGELOG entry ships in the PR. The release follows repo practice.

## 6. Review record

- **coai plan gate:**
  - round 1: both reviewers failed (vendor exit 143 / context canceled), and the owner answered the hold;
  - round 2: proceed, 2/2 reviewers, 3 findings, 2 accepted:
    - `pinSearch` takes a `setContext` callback, not `vscode.commands`;
    - the state is applied at wiring, for an already-active provider.
  - The third finding was rejected: a workbench scenario test, but this repo has no workbench harness.
- **coai code gate:** two rounds, each proceed, 8/8 reviewers.
  - Round 1: 3 findings, all accepted and fixed.
  - Final round: 3 findings, 2 accepted and fixed. 1 rejected: the scenario test, for the same reason as in the plan gate.
    The flow is listed in `module_tests.md` instead.
- **Own review:** three Opus reviewers (correctness, simplicity, conventions).
- **CodeRabbit on #382:** one Minor finding, fixed in 787f4f4a:
  - the symptom: a reopened box still showed the cleared term, and Enter applied nothing;
  - the fix: the box is resynced, and Enter applies what it shows.

## 7. Deviations (what shipped differently from §2–§4)

1. **The wiring is in `commands/viewCommands.ts`, not `extension.ts`.** The first wiring made `extension.ts` 982 lines
   against its size-ratchet baseline of 975 (`.size-baseline.json`), and the full suite failed. `pinSearch(` is called
   once, in `viewCommands.ts`. A structural test in `searchPinned.test.ts` checks that one call site.
2. **`pinSearch(view, tree, setContext)` takes a callback** (accepted plan-gate finding), so `searchPin.ts` imports
   nothing and its tests need no `vscode` stub. It applies the current state at once, when it is wired, before the first
   event. A teeth check that removed this failed 5 of 16 tests.
3. **The light theme colour is `#1A7F37`, not `#2DA042`.** It was changed for contrast on a light background (own
   review). The title-bar SVG for light themes stays `#2DA042`, because it is a fixed file and not the theme colour. The
   colour's description says so.
4. **One source for `credSearchActive`.** `searchPin.ts` exports `SEARCH_ACTIVE_ROW_CONTEXT`, and `searchRowItem.ts` uses
   it, so the row and the banner cannot drift apart.
5. **Two filter-box fixes that the new button made reachable** (`searchBox.ts`, not planned). Each was RED first with its
   real symptom:
   - **Running Search while the box is open** created a second `InputBox`. Showing it hid the first box, and the first
     box's `onDidHide` put the old filter back. `searchBoxOpener` now shows the open box again. RED: applied
     `['aws', '']`, expected `['aws']`.
   - **A filter cleared from outside while the box was open** (Clear Filter, Go to Original Folder, Reveal by Id) came
     back on Escape. The box now restores `before` only when the tree's filter is still the term the box applied
     (`SearchWiring.current`). RED: `'prod' !== ''`.
   - The CodeRabbit fix (§6) belongs here too: `reshow` resyncs a reopened box to the current filter.
6. **Manifest tests changed:** the search command left `PALETTE_ONLY` in `manifest.test.ts` (it is in the title bar now),
   and it joined `OBVIOUS_VERBS` in `manifestIcons.test.ts`.
7. **The grey description does NOT stay grey** (§2 item 3). In the owner's window on 2026-11-23, the description
   (`8 found`) was green like the label. Checked: one real window, the owner's theme and settings. NOT checked: other
   themes, and the setting `explorer.decorations.colors` set to `false`. The owner accepted the look as it is.
8. **Process:** the first test file was written by the lead session, not by a Sonnet coder.
9. **The release was held, then shipped with others.** 1.23.0 also carries #365 (E1.6 bridge), #379 (G1 E1) and #388
   (G1 E2). The release was deferred on 2026-11-18 while G1 E1 was not releasable, and it shipped after G1 E2 merged.

## 8. Owner hand check (2026-11-23)

Done on a test VSIX (1.22.4, built from `main` at 3a6afd22, the same feature code as 1.23.0), in the owner's real VS Code
window:

| Check | Result |
|---|---|
| Green magnifier first in the title bar | OK |
| *Clear Filter* (×) beside it only while a filter is on | OK |
| Line above the tree: `Search: orc — 8 found` | OK |
| Row icon and label green | OK (the description too, §7 item 7) |
| The line above the tree stays while a long tree scrolls | OK (owner: "работает") |

The UI is not covered by an automated check: no harness here drives a real workbench (`module_tests.md`, *The pinned
search*).
