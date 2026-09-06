# PLAN — a node write must not lose a concurrent one

> Status: **plan only, nothing implemented yet.** Scope: `src_vs_code/src/storageManager.ts` and the
> fourteen call sites of `updateNode` / `moveNode` outside it.
>
> Related docs: [module_extension.md](../research/module_extension.md),
> [PLAN_cross_window_write_coordination.md](../research/PLAN_cross_window_write_coordination.md),
> [architecture.md](../research/architecture.md).

## The symptom

Two VS Code windows are open on one profile. In window A somebody renames an entry. In window B
something writes the same node — the form saving a field, a drag moving it, the PIN door repairing a
false mark. B's write wins whole, and A's rename is gone. Nothing reports it, nothing sweeps it, and
the end state is self-consistent, so no later check can find the loss.

This is the same shape as the defect
[PLAN_cross_window_write_coordination.md](../research/PLAN_cross_window_write_coordination.md) was
written for — *"B's import SUCCEEDED, B was told so, and A then wiped it"* — and that plan built the
primitive that answers it: an atomic `mkdir` lease under `globalStorageUri`, with a heartbeat, a
fenced release and a sweep. **The primitive shipped; the node writes never moved onto it.**

## Where it is, verified

`this.writes` is the lease. Four operations use it:

| Call site | What it guards |
|---|---|
| `storageManager.ts:315` | listing an account |
| `storageManager.ts:370` | removing an account |
| `storageManager.ts:482` | `createEntityWithSecrets` |
| `storageManager.ts:952` | `applyBundle` — a sync merge |

The node writes do **not**:

- `storageManager.ts:550` — `updateNode(accountId, updated)` takes a WHOLE node from the caller,
  stamps it and maps it over `getNodes()`. Whatever the caller read is what gets written.
- `storageManager.ts:565` — `relocate(accountId, id, patch)` is better: it composes the patch onto
  the node **as it is at write time**. `moveNode` (`:560`) goes through it.
- `storageManager.ts:632` — `updateNode` called from inside the class for `trashRetentionDays`.

Fourteen call sites outside `storageManager.ts` use `updateNode`/`moveNode`.

**How it was found.** CodeRabbit raised it against `pinAdmission.ts:126` (`repairFalseMark`, new in
the entry-PIN work) on PR #25. The finding is right about the property and wrong about the blame: the
new code does a `getNode` and an `updateNode` with **no `await` between them**, so within one window
nothing can interleave. What is exposed is the cross-window case — and that is exposed for every
node write in the product, including a rename from the entity form. It is a pre-existing property,
not a regression, which is why it is a plan rather than a hotfix on a PIN pull request.

## Two things this must not do

1. **Do not simply wrap `updateNode` in `this.writes.run`.** `createEntityWithSecrets` already runs
   INSIDE the lease (`:482`), and a write that re-enters it would deadlock unless the lease is
   re-entrant. Whether it is has to be established first — that is task 1, not an assumption.
2. **Do not turn every write into a merge.** A field the person deliberately cleared and a field
   another window never touched look identical in a whole-node write. A merge that resurrects a
   cleared field is a worse defect than the one being fixed, and it is silent in the same way.

## The shape to build

`relocate` already demonstrates the answer for the top-level fields: **read at write time, apply a
patch, stamp**. The work is to make that the only way a node changes.

1. **Establish the lease's re-entrancy.** A test that takes the lease and takes it again from inside.
   Whatever the answer, write it into `module_extension.md` — it governs every later step.
2. **Give `relocate` a `details` patch** so a caller can change one metadata field without carrying
   the whole node. Every mark this product writes (`pinProtected`, `passwordWoven`,
   `folderAsksForPin`, `mcp*`) is one field.
3. **Move the fourteen call sites** from `updateNode(whole node)` to the patch form, one at a time,
   each with a test that a concurrent change to a DIFFERENT field survives it.
4. **Put the node writes behind the lease**, given task 1's answer.
5. **Delete `updateNode`'s whole-node form** — or leave it only where the caller genuinely replaces
   the node (an import, a restore), and say in its doc comment which those are. A method that is
   easy to misuse and documented as dangerous is still going to be misused.

`storageManager.ts` is at its size ratchet (1034 lines, `.size-baseline.json`), so this cannot add
net lines to it. Steps 2 and 5 together should leave it smaller, which is the direction the ratchet
allows.

## Test plan

| what | test |
|---|---|
| 1 | the lease taken from inside the lease either proceeds or is documented as deadlocking |
| 2 | a `details` patch changes one field and leaves the other twenty as they were |
| 3 | a rename applied between a caller's read and its write SURVIVES the write |
| 3 | a field the person CLEARED stays cleared — the patch does not resurrect it from the older copy |
| 4 | two writes racing on one node both land, in some order, with neither lost |
| 5 | every remaining whole-node caller is named in the doc comment, and a test asserts the list |

## Definition of Done

- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run ratchet` green in `src_vs_code`.
- [ ] No node write outside `storageManager.ts` passes a whole node it read earlier.
- [ ] The re-entrancy answer is recorded in `research/module_extension.md`, not only in a test.
- [ ] `research/module_extension.md` updated; `architecture.md` if the storage seam changed shape.
- [ ] The `coai` gate: `review_plan` to `proceed`, then `review_code` on the branch.
