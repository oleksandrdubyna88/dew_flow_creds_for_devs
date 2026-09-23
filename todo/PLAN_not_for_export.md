# PLAN — an entry can be marked "Not for export" (issue #122)

> Status: **plan only, nothing implemented yet, 2026-09-23.** Scope: `src_vs_code` — the entry form's
> General section, the entry record, the Share and Export commands, the tree menu. No server, CLI or
> MCP change.
>
> Related docs: [module_extension.md](../research/module_extension.md) §Sharing, §share vs export vs
> backup, §the exits a developer may not use; [architecture.md](../research/architecture.md).

## 1. The goal

Issue #122: *"in the General section add a checkbox 'not for export' — this entity cannot be shared or
exported."* The screenshot is the General fieldset of the edit form (Name *, Type).

Decided with the owner on 2026-09-23: the mark blocks **Share with…** (to another person, through the
vault server or a shared folder) and **Export / Share Externally…** (a file). It does NOT block
*Share with Claude Code…* (an agent uses the entry, never receives the secret), backup, sync, or local
use (copy, run, connect). Inside a folder that is shared or exported, a marked entry is **left out and
named**; if nothing is left, the action is refused with the reason.

Facts the design rests on:

- An entry's marks are optional booleans on `EntityMetadata` (`types.ts`), validated by
  `isEntityMetadata` (`typeGuards.ts:372`); a save rebuilds `details` from the literal in `toValues`
  (`entityFormPanel.ts:488`), so a field missing there is deleted on every edit.
- Share: `commands/shareCommands.ts:27-39` → `shareInbox.shareNodes` (`shareInbox.ts:252`), whose
  `payloadsFor` (`:226`) is the one point both a selected entry and a folder walk
  (`collectFolderPayloads`, `:323`) go through. `shareInbox.ts` is at 796 of 800 lines.
- Export: `commands/exportCommand.ts:66` → `writeExport` (`:99`), whose `subtreeOf` (`:132`) is the
  walk; the corporate refusal (`refuseExit`, `corpExits.ts:21`) is the precedent for a refusal that
  lives in the HANDLER, not only in a menu `when` clause — the palette and multi-select reach it anyway.
- Menus: *Share with…* and *Export / Share Externally…* key on `viewItem` tokens from
  `entityContextValue` (`treeRowText.ts:99`).
- *Create for user* (`shareCommands.ts:42`) opens the same form to author an entry FOR someone — a
  "not for export" box there contradicts the action.

## 2. What must be true when done

1. The General section has **Not for export** (`notForExport: true` on the record), hidden when the
   form authors an entry for someone else. It survives every save and syncs with the record.
2. **Share with…** on a marked entry refuses, saying why; on a folder, marked entries are left out and
   named before anything is asked, and the rest is shared; if nothing is left, it refuses.
3. **Export / Share Externally…** behaves the same way, and the file never contains a marked entry.
4. The refusal is in the handlers (and `payloadsFor`, so no other caller of the share walk can leak a
   marked entry); the menu items are also hidden on a marked ENTITY row (`:noexport`) — a folder keeps
   them, since the rest of it may still leave.
5. The viewer names the mark, so a person who wonders why Share is missing can see it.
6. Help, `module_extension.md`, README and CHANGELOG say so — including what the mark does NOT stop.

## 3. Design

- `exportScope.ts` (pure): `isNotForExport(details)`, `exportScope(allNodes, roots) → { kept, withheld }`
  (the subtree walk moved here from `exportCommand.subtreeOf`, reused rather than copied), and the
  sentences `withheldNote(action, names)` / `nothingLeavesNote(action, names)`.
- `exportCommand.ts`: `writeExport` exports `scope.kept`; refuses when no entity is kept and something
  was withheld; notes the withheld ones.
- `shareCommands.ts`: the same scope over the selection before `shareNodes`; `shareInbox.payloadsFor`
  returns `[]` for a marked entity (defence in depth, +3 lines, keeping the file under 800).
- `generalNotes.ts`: `notForExportField(d, forSomeoneElse)`; `entityFormShape.ts`: optional
  `forSomeoneElse`; `entityFormScript.ts`: the payload key on an existing line (799 lines);
  `entityFormPanel.ts`: `notForExport` in the literal, never for someone else.
- `treeRowText.ts`: `:noexport`; `package.json`: `!(viewItem =~ /:noexport/)` on the two menus.
- Viewer: a line in the main group when the mark is set.

## 4. Build order

1. `exportScope.ts` + tests (red first). 2. Record, guard, form, save. 3. Export handler. 4. Share
handler + `payloadsFor`. 5. Menus + viewer. 6. Docs.

## 5. Test plan

- `exportScope.test.ts`: a marked entity alone → nothing kept; a folder with marked and unmarked →
  only unmarked kept, marked named; nested folders; the sentences.
- Export handler under the vscode stub: a marked entry refuses and writes nothing; a folder's file
  lacks the marked entry.
- Share: `shareInbox` payload test (`shareWorld`) — a marked entity yields no payload; the handler
  refuses a lone marked entry and notes a folder's.
- Form: the box renders, is absent for someone else; `toValues` keeps it; the guard accepts it.
- `treeRowText`: `:noexport` on a marked entity, not on a folder; the `package.json` clauses exist.

## 6. Risks

- An OLDER build saving the entry drops the unknown field (its `toValues` literal does not know it),
  and the loss syncs out — the same boundary every new mark has. Stated in the docs; nothing becomes
  less safe than before the mark existed on that machine.
- It is an honest-client control: a person with the vault can still read their own secret and paste it
  anywhere. The mark stops the product's own exits, not the person.

## 7. Definition of Done

- [ ] Share and Export refuse or leave out marked entries, in the handlers; menus hidden on marked rows.
- [ ] Tests above, red first; `npm test`, lint, typecheck, package green.
- [ ] Docs updated; this plan promoted.
- [ ] The `coai` gate: plan round and one code round; own review in parallel.
- [ ] PR merged, threads resolved.
