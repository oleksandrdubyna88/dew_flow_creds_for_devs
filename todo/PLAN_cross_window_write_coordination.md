# PLAN — coordinating writes between two VS Code windows

> Status: **plan only, nothing implemented yet.** Scope: `src_vs_code/src/storageManager.ts`,
> `pendingCleanup.ts`, `serialQueue.ts`, and whatever durable coordination primitive this ends up
> choosing.
>
> Related docs: [module_extension.md](../research/module_extension.md) (the write-order invariant, the
> serial queue, `pendingCleanup`), [PLAN_payment_instruments_epics.md](../research/PLAN_payment_instruments_epics.md)
> (S1.4, where this was raised and deliberately deferred).

## The gap

S1.4 serialized the three operations that share this extension's secrets — applying a bundle, removing
an account, and the sweep that finishes interrupted work — through `SerialQueue`. That closed a round
of real interleaving bugs, and its boundary is stated in its own header:

> Serializes within ONE instance and no further.

Both review providers, independently, pointed at what that leaves: **VS Code runs an extension host per
window, and every window of the same profile shares one `globalState` and one `SecretStorage`.** Window
A removing an account while window B applies a bundle is not serialized by anything.

## Why it was deferred rather than fixed

1. It is a **different design**, not a missing line. A durable lock in `globalState` brings its own
   failure modes — a stale lock from a window that was killed, a lease that has to expire, and a rule
   for what a window does when it cannot take the lock. Every one of those is the kind of consistency
   question this codebase has so far answered by *not* having a lock.
2. The existing multi-window story is **not nothing**: the node cache is validated by the memento
   value's reference identity (so a second window's write is seen on the very next read), the sync
   merge resolves divergence with version vectors and tombstones, and the sweep exists precisely
   because another window can die mid-operation.
3. The observed severity is low: it needs two windows of the same profile doing bulk operations at the
   same moment. Not impossible — a sync cycle is not something the person triggers — but the sync path
   is also the one with the most existing convergence machinery behind it.

## What a solution has to answer

- **What the primitive is.** A lease key in `globalState` (holder id + timestamp) is the obvious
  candidate, since it is the only durable store both windows already share.
- **What a window does when it cannot take the lease.** Wait? Skip? For the sweep, skipping is right —
  the other window is doing the work. For a removal the person triggered, waiting with a visible
  status is right, and failing silently is not.
- **How a stale lease is broken.** A window killed while holding it must not lock the profile forever.
- **Whether `SecretStorage.onDidChange` can carry the signal** instead — it already fires across
  windows and `changeToken` already listens to it.
- **How it is tested.** Two `StorageManager` instances over one memento, which is exactly what the
  reviewers asked for and what no test does today.

## Build order

1. A failing test with two `StorageManager` instances over one shared memento + keychain, showing a
   removal and an apply interleaving into a broken state. **This first** — the gap is currently a
   claim, and a claim about concurrency deserves a reproduction.
2. The lease primitive, in its own module, free of `vscode`, with the stale-lease rule.
3. Route the same three operations (plus `upsertAccount`) through it, inside the existing
   `SerialQueue.run` so a window is serialized against both itself and its peers.
4. Decide and implement the "cannot take the lease" behaviour per operation.

## Definition of Done

- [ ] The two-instance test from step 1 exists and passes.
- [ ] A window killed holding the lease does not block the next one.
- [ ] The sweep skips rather than waits; a person-triggered removal waits visibly.
- [ ] `research/module_extension.md` records the primitive and its boundary.
- [ ] `SerialQueue`'s header stops being the last word on this, and points here.
