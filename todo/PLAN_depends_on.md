# PLAN — "Depends on": one entity points at another, and the tree says so in colour

> Status: **code written and green under test; step 13, the pass in a real vault, is NOT done.**
> Steps 1–12 are landed and `research/module_extension.md` describes the feature as built; the
> suite is 1527 tests / 0 failures with `tsc`, `eslint` and `bundle` clean. What remains is the
> one thing no test stands in for — a person creating a dependency in the UI, seeing both ends
> tinted, opening the sub-tree beside a history twisty, and pressing the go-to-folder button.
> Until that happens this plan stays here, because until then nobody has seen the feature work.
>
> Scope: `src_vs_code` only — `types.ts`, `treeDataProvider.ts`, the three entity-form modules,
> `extension.ts`, `shareInbox.ts`, `shareFormat.ts`, `package.json`, and eight new modules.
>
> Related docs: [research/module_extension.md](../research/module_extension.md)
> (§"History as tree rows", §"The form is three modules, not one file", §"The per-entity flag
> caches", §"Performance: caches instead of per-row and per-cycle work"),
> [research/architecture.md](../research/architecture.md).

## The goal

An SSH connection is useless without the VPN that reaches its network. A password belongs to a
database that only exists behind the same VPN. The vault knows all three entries and knows
nothing about the sentence connecting them, so the person holding it re-derives that sentence
every time — usually while something is already broken.

This adds the sentence. An entity can declare that it **depends on** other entities in the same
account. Both ends of a dependency wear the same colour in the tree, so the relationship is
visible without opening anything, and the entity being depended *on* grows a sub-tree naming
everything that needs it.

The colour belongs to the **target**, never to the edge. Pointing a second entity at `vpn / org
meter` gets `org meter`'s existing colour with no choice to make, and changing that colour once
changes it everywhere — because there is only ever one place it is stored.

## What the spike already settled

The whole colour design rested on an assumption nobody in this repository had run:
`vscode.FileDecorationProvider` is the only API that can colour a tree row's **label text**, and
this extension had never used it — `resourceUri` and `FileDecorationProvider` appeared nowhere in
`src/`. If it turned out to tint only a badge, the feature would have had to fight the history
tint for the icon channel, where a comment at `treeDataProvider.ts:596-602` correctly says that
one channel carrying two meanings tells you neither.

**It was built and looked at rather than reasoned about.** `depDecorations.ts`'s
`DepSpikeDecorationProvider` painted every entity row, cycling all ten palette colours, and the
answer was yes: the label text is tinted, the `●` badge renders beside it, and the ten colours
read in both themes. The icon tint stayed with history, untouched.

Two things that survive the spike as production code:

- `src/depColors.ts` — the ten keys, their labels, and `depColorThemeId()`, the one mapping from a
  stored key to a `contributes.colors` id.
- `src/depDecorations.ts` — `DEP_SCHEME`, `depUri()`, `parseDepUri()`. Only the spike *provider*
  in that file is thrown away.
- The ten `credSshManager.depColor1..10` entries in `package.json`, each with `dark` / `light` /
  `highContrast` / `highContrastLight`. A **key** is stored, never a hex: the four variants are
  what make "readable in whichever theme the person actually uses" the theme's arithmetic instead
  of a colour somebody eyeballed once in dark mode, and a stored hex would freeze today's palette
  into every vault that ever synced.

One incidental fix the spike forced, already landed: six `treeProvider*.test.ts` files patch a
fake `vscode` that had no `Uri.from`, so every tree test failed with `TypeError` the moment a row
carried a `resourceUri`. The stubs now provide it.

## Decisions taken, and by whom

Settled with the owner before design:

| | decision |
|---|---|
| how a row is marked | **the label text**, plus a short badge — via `FileDecorationProvider`. The icon channel stays reserved for history |
| how many dependencies | **a list**, not one. Authored as repeating rows, the shape `portForwards` / `commandArgs` / `scriptVars` already use |
| scope | **the current account only**, exactly like `sshKeyEntityId` and `jumpHostEntityId` |
| the "go to folder" button | reveals and **expands the folder** — which means writing `getParent`, which this provider has never had |
| architecture | the module decomposition of the clean design (the line budget makes it compulsory), plus the shadow-row reuse of the minimal one (it is what makes the sub-tree useful) |

Taken by default, stated so they can be overridden rather than discovered:

- The colour lives on the **target**'s record. Storing it per edge would make "change it once,
  change it everywhere" a fan-out write across N entities; storing it on the target makes it a
  single write and no propagation code at all.
- A **dangling** reference is not swept. The target's deletion leaves the id in place, the colour
  simply is not drawn, and the tooltip says the target is gone — the convention
  `sshCredential.ts` and `sshOptions.ts:refuseHop` already set, and the right one here too: a
  target can come back on the next sync.
- `dependsOn` is **stripped when sharing**. An id addressing this vault means nothing in someone
  else's.
- Self-reference is refused in the picker (`jumpHostEntityId` already does this at
  `entityFormPanel.ts:417`); **cycles are allowed** — this is an annotation, not an execution
  chain, and nothing walks it more than one hop.
- Auto-pick is **the first unused colour**; once all ten are taken, the least-used.

## Why the relation goes on `EntityMetadata` and not in a table of edges

`mergeProfiles` resolves a conflict by picking a whole `TreeNode` — `pickNode` in
`syncMerge.ts:88-104` compares version vectors and returns one record entire. There is no
field-level merge. A relation stored as a field on the record therefore inherits, at no cost, the
causal ordering, the tombstones, the horizon-based rollback protection and the concurrent-edit
tie-break that are already written and already tested.

A separate edge collection would need every one of those again — its own version vector, its own
tombstones (edge *removal* is invisible to last-writer-wins without them), its own horizon, its
own type guard, and its own place in `ProfileSnapshot`, `BackupBundle`, `exportBundle`,
`importBundle`, `SharePayload` and `Revision`. That is the entire sync machinery, rebuilt for one
array of strings.

Two consequences worth stating because they are easy to get wrong:

1. **A field absent from `isEntityMetadata` (`types.ts:554`) is silently stripped** by every sync,
   import and sealed-slot read. `entityExpiry.test.ts:139-141` exists because that already
   happened once.
2. **A field absent from `toValues` (`entityFormPanel.ts:354`) is silently dropped on every form
   save.** That function builds `details` as an explicit field-by-field literal, not a spread, so
   nothing is preserved by accident there.

No schema version bump. This follows the `kind` precedent recorded in
`module_extension.md:175-178`: an optional field, a fallback when absent, no vault converted.

## The reverse index — derived, memoized, never a background walk

"Who depends on X" is needed by both the tint and the sub-tree, and the obvious move is to copy
`EntityFlagsRefresher` (`entityFlags.ts:39`), the serialized walk that fills `historyById` and
`passwordIds`. **That would be wrong, and the reason is the constraint that created it.** Those
caches exist because answering needs `SecretStorage`, which `getTreeItem` cannot await
(`treeDataProvider.ts:389-390`). `dependsOn` and `depColor` are plaintext fields already resident
in `storage.getNodes(accountId)`, which is synchronous, in-memory and identity-cached
(`storageManager.ts:378`). An async refresher would add the one hazard it was built to remove: a
window between an edit and the walk finishing, in which the tree paints pre-edit answers.

So the index is built **synchronously, on demand, and memoized for the repaint** — the lifecycle
`FilterMemo` (`treeSearch.ts:81`) already has: a `Map<accountId, DependencyIndex>` on the
provider, cleared in `refresh()` on the line that already clears the filter memo. Every mutation
arrives through `mutated()` (`extension.ts:417`), which calls `refresh()`, so there are no
invalidation hooks to forget.

**There is a test that will enforce this.**
`treeProviderPasswordFlag.test.ts:111` — *"expanding a folder of 300 entities reads the keychain
zero times"* — pins a measured guarantee on exactly the code path this feature extends. If the
index ever reaches for `SecretStorage`, or `depUri` ever does per-row work beyond building a URI,
that test goes red. It is the reason the design above is not merely tidier but checkable.

## The line budget is a hard constraint, not a style note

`eslint.config.mjs:28-30`: `max-lines` 800, `max-lines-per-function` 50, `complexity` 4. Measured
now:

| file | lines | headroom |
|---|---|---|
| `treeDataProvider.ts` | 794 | **6** |
| `entityFormScript.ts` | 778 | **22** |
| `entityFormPage.ts` | 565 | 235 |
| `entityFormPanel.ts` | 512 | 288 |
| `types.ts` | 710 | 90 |

`extension.ts` (3,396) is the one file carrying an `eslint-disable max-lines` header, and that
header says it comes off as the last step of audit A1 — it is not an invitation.

**So the build starts by making room, not by adding features.** Two extractions, both pure moves
of working code, both proved by the existing suite staying green without being edited:

- `kindIcon` / `folderIcon` / `buildTooltip` (`treeDataProvider.ts:721`, `:752`, `:777`) → a new
  `src/treeIcons.ts`. Frees ~65 lines.
- the entity `contextValue` ladder (`treeDataProvider.ts:539-591`) → `entityContextValue()` in
  `src/treeRowText.ts`. Frees ~45 lines **and** is what lets a shadow row render the same menu as
  the real one from one implementation rather than two.
- the picker's browser code → a new `src/depPickerScript.ts`, imported by `entityFormScript.ts`
  as one interpolation. Precedent: `entityFormPage.ts` and `entityFormScript.ts` were themselves
  split out of `entityFormPanel.ts` for this reason (`module_extension.md:571-600`).

## Data shapes

`src/types.ts`, on `EntityMetadata` (:53), beside `sshKeyEntityId` / `jumpHostEntityId`:

```ts
/**
 * Same-account entities this one depends on. A typed reference like `jumpHostEntityId`, and
 * like it this arrives by sync, import and accepted shares — so it CAN dangle and CAN cycle.
 * Nothing walks it more than one hop, which is why there is no depth cap here.
 */
dependsOn?: string[];
/**
 * The shared tint, on the TARGET's own record and never on the edge. Every entity naming this
 * one, and this one's own row, paint from this single field — which is the whole of "change
 * the colour once and it changes everywhere": there is nowhere else it is written.
 */
depColor?: string;
```

`isEntityMetadata` (:554) gains two clauses:

```ts
(v.dependsOn === undefined ||
  (Array.isArray(v.dependsOn) && v.dependsOn.every((id) => typeof id === 'string'))) &&
(v.depColor === undefined || typeof v.depColor === 'string') &&
```

`depColor` stays a loose `string` here on purpose, the same reasoning `kind` records at
`types.ts:563-565`: a value from a NEWER build must not cause this one to reject the whole
entity. `isDepColorKey` (`depColors.ts`) is the strict gate, applied only where the value is used.

`TreeElement` (:307) gains four kinds. The prefixes are chosen not to collide with the menu
regexes already in `package.json` (`^entity`, `^(folder|entity)`, `^(folder|entity|revision)`):

```ts
/** The sub-tree root under a TARGET — a sibling of the revision rows, never a replacement. */
| { kind: 'dependents'; accountId: string; node: TreeNode }
/** One folder holding at least one dependent. `folderId: null` is the account root, which has
 *  no real folder to reveal — the "go to folder" button is bound to contextValue, so that row
 *  simply never carries one. */
| { kind: 'dependentsFolder'; accountId: string; targetId: string; folderId: string | null;
    name: string; entities: readonly TreeNode[] }
/** A dependent entity, at a SECOND position in the tree. Same node, different row identity. */
| { kind: 'dependentEntity'; accountId: string; targetId: string; node: TreeNode }
```

## The shadow row, and why it earns its complexity

A `dependentEntity` row carries the **same `contextValue` a real entity row would**, and
`asElement` (`extension.ts:3337`) translates it back into a plain `{ kind: 'node' }`. Every
existing command — Edit, Delete, Move, Share, Clone, Connect, Copy Password, Run, Start VPN, the
forty-odd of them — then works on it with **no handler changed**, because they all narrow their
argument through `asElement` already. Its `item.id` is distinct (`dep:${accountId}:${targetId}:${node.id}`)
so VS Code's per-id expansion and selection state never bleeds between an entity's two positions.

The alternative — a private `contextValue` and an inert, look-only list — was the other design on
the table. It is smaller, and it makes the sub-tree a picture of a problem rather than a place to
fix one.

**One accepted gap, named rather than discovered later:** `handleDrag`
(`treeDataProvider.ts:626`) filters the raw elements VS Code hands it for `kind === 'node'`,
without going through `asElement`. A drag begun on a shadow row will therefore produce an empty
payload and do nothing. Dragging the real row still works. Teaching drag about a second position
for one node is out of proportion to its value, so it is documented here and left.

## Build order

Each step compiles, lints clean, keeps the suite green, and leaves the extension working.

1. **Make room, part one.** Extract `kindIcon` / `folderIcon` / `buildTooltip` into
   `src/treeIcons.ts`; update the three call sites. A pure move — proved by the existing tree
   tests passing **unedited**.
2. **Make room, part two.** Extract `entityContextValue(details, hasPassword)` into
   `treeRowText.ts` and rewire the real entity row to call it. Still a pure move, still proved by
   the untouched suite. Doing this before the feature is what keeps the refactor separable from it.
3. **Shapes.** `dependsOn` / `depColor` on `EntityMetadata`, the two `isEntityMetadata` clauses,
   the three `TreeElement` kinds. Extend `types.test.ts`.
4. **The pure core.** `src/depGraph.ts` + its test, TDD, no `vscode`: reverse index, folder
   grouping, tint resolution, `normalizeDependsOn`, the dangling-target message, auto-pick and
   colour-usage tally.
5. **`getParent`.** `src/treeParent.ts` (pure) + its test, then the one-line provider method.
   Tested for the pre-existing kinds too, not only the new ones — `reveal()` walks the whole
   chain, and a `getParent` that is right for three kinds and silently wrong for `account` fails
   in a way no test aimed at the new feature would catch.
6. **The real decoration provider.** Replace `DepSpikeDecorationProvider` with the graph-driven
   one. It **must** return `undefined` for a foreign scheme before doing anything else: a
   decoration provider is registered against the whole workbench, so VS Code asks it about every
   file in the person's workspace, not only about these rows.
7. **The tree.** New `getChildren` / `getTreeItem` branches, `collapsibleState` becomes
   `hasHistory || hasDependents`, the index memo, the `refresh()` invalidation. New
   `treeProviderDependsOn.test.ts`.
8. **The form.** `EntityFormOptions` / `EntityFormValues` / `toValues`, the new fieldset in
   `entityFormPage.ts`, `depPickerScript.ts`, two lines in `entityFormScript.ts`.
9. **The wiring.** `collectDependencyCandidates`, `applyDependencyColors`, the three
   `showEntityForm` call sites (`createForUser` gets empty candidates, as it already does for
   `jumpCandidates` — a reference into *this* vault is meaningless in the recipient's), the
   `asElement` branches, `mutated()`.
10. **Go to folder.** The command, the inline menu entry, `treeView.reveal`. If the filter is
    active it is cleared first — a filtered-out row cannot be revealed.
11. **Share stripping.** `buildSharePayload` (`shareInbox.ts:507`), with a test.
12. **Docs.** `research/module_extension.md`, then promote this plan.

## Test plan

| what | where | what it proves |
|---|---|---|
| validators | `types.test.ts` | a valid and a malformed `dependsOn`; `depColor` loose here and strict in `isDepColorKey` |
| the graph | `depGraph.test.ts` (new) | two entities on one target group together; a folder shows **only** its dependents, never its other contents; the account-root group; a dangling id is skipped, not thrown on; self-reference and an A↔B pair do not loop; auto-pick returns the first free colour, then the least-used |
| `getParent` | `treeParent.test.ts` (new) | folder → its folder or the account; entity → its folder; a dangling `parentId` returns `undefined` rather than throwing; the three new kinds resolve their own chain |
| the tree | `treeProviderDependsOn.test.ts` (new) | **an entity with history AND dependents shows both** — the coexistence requirement, as a test rather than a hope; a shadow row's `contextValue` equals the real row's; its `id` does not; every entity row carries a `resourceUri` |
| decorations | `depDecorations.test.ts` (new) | uri round-trip; a foreign scheme returns `undefined` **before** any graph lookup; a target and a dependent each resolve to the target's colour; an uninvolved entity gets nothing |
| the form | `webviewHtml.test.ts` (extend) | the new fieldset renders and the page script still parses for every kind — the trap this test exists for |
| sharing | the `buildSharePayload` test | a shared payload carries no `dependsOn` |
| performance | `treeProviderPasswordFlag.test.ts` (unchanged) | the 300-entity keychain guarantee still holds |
| manifest | `manifest.test.ts` (unchanged) | the new command is reachable, its group order is numeric, no slot clash |

## Risks

1. **A dependent whose targets have different colours can only show one.** `FileDecoration.color`
   is single-valued. The first still-resolvable entry in `dependsOn` wins; the rest are in the
   tooltip and in the sub-tree. Defensible, arbitrary, and the first thing to revisit if
   multi-target dependents turn out to be the normal case rather than the exception.
2. **`applyDependencyColors` writes a second entity inside one save.** A crash between the two
   `updateNode` calls leaves the dependent saved and the target's colour unset. This storage layer
   has no multi-node transaction anywhere — bulk delete is sequential for the same reason — so the
   risk profile is unchanged, and the failure heals itself: the next save auto-picks again.
3. **Blue (`depColor1`) sits near the history icon's blue.** Different channels — text against
   icon — and the spike read fine, but it is the one palette entry with a neighbour.
4. **`treeDataProvider.ts` has 6 lines of headroom.** Steps 1 and 2 free ~110, which should be
   enough. If the new branches run long, a third extraction is expected work, not a surprise.

## Definition of Done

- [ ] `npm run typecheck`, `npm run lint`, `npm test` all green; `npm run bundle` completes.
- [ ] Every new behaviour has a test; the coexistence of the two sub-trees is one of them.
- [ ] The 300-entity keychain guarantee still passes, unedited.
- [ ] `research/module_extension.md` describes the feature as built, with its deviations.
- [ ] This plan is promoted to `research/` with `IMPLEMENTED <date>`, its deviations and its open
      tail recorded (`node .claude/rules/shared/tools/plan-lifecycle.mjs` is CI's check).
- [ ] The `todo/README.md` table matches the folder.
- [ ] The spike provider is gone and no `SPIKE` marker remains in `extension.ts`.
