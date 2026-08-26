# PLAN — The convenience layer

> Status: **IMPLEMENTED, 2026-08-25.** Scope: `package.json` contributions, `quickOpen.ts`,
> `lockStatus.ts`, `statusBar.ts`.
>
> Related docs: [module_extension.md](module_extension.md),
> [PLAN_audit_roadmap_2026_08_25.md](../todo/PLAN_audit_roadmap_2026_08_25.md) (item **D11**).

## Symptom

The UX audit found the whole layer absent: **zero** keybindings in the manifest, no quick-open, no
`viewsWelcome` and no walkthrough (a clean install showed one "Search" row and nothing else), and no
status-bar indicator for the lock or sync. Esc/Ctrl+S in the two webviews shipped separately, in
block B.

## What shipped

- **Five keybindings**: `Ctrl+Alt+P` go to credential, `Ctrl+Alt+F` filter, `Ctrl+Alt+C` copy
  password, `Ctrl+Alt+Enter` connect, `Ctrl+Alt+L` lock. The middle three are scoped to the view, so
  they do not take keys away from the editor.
- **Go to Credential** (`quickOpen.ts`) — one list across every account, matched against
  `nodeHaystack`, **the tree filter's own haystack**. Reused rather than re-derived: a picker that
  searched secrets would answer "does any password contain this?" one keystroke at a time, which is
  the oracle `treeSearch.ts` exists to refuse.
- **`viewsWelcome`** and a **four-step walkthrough** with its own media pages.
- **A status-bar item** for the lock — the state that decides whether background sync runs at all,
  and which could previously only be discovered by trying something. Clicking it does the opposite of
  the current state rather than opening a menu of one option.

## Deviations

- **The picker opens the viewer instead of revealing the tree row.** `TreeView.reveal` requires
  `getParent` on the provider, which this one does not implement — and opening the thing asked for is
  what the picker was for anyway. Implementing `getParent` is the alternative if a row-reveal is ever
  wanted.
- **The wording lives in `lockStatus.ts`**, which imports no `vscode` and therefore has tests. The
  same carve-out `sshCommand.ts` and `entityText.ts` already made, for the same reason: text that
  lives beside a `vscode` import is text nobody checks.

## Open tail

No sync indicator distinct from the lock one: `render` takes a `syncing` flag and the wording exists,
but nothing calls it mid-cycle yet. `SyncManager` would need to report start and finish.
