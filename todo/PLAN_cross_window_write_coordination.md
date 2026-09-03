# PLAN — coordinating writes between two VS Code windows

> Status: **step 1 of 4 done (the reproduction); the primitive is not built.** Scope: `src_vs_code/src/storageManager.ts`,
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

## What the reproduction found — step 1 is DONE

`src/test/crossWindowWrites.test.ts`, 2026-09-03. Two `StorageManager` instances over one memento and
one keychain, with the shared memento able to PAUSE on a named key so the interleaving is repeatable
rather than raced.

**The damage has a name, and it is worse than "a broken state":**

> Window A begins removing an account and is parked between unlisting it and wiping its secrets.
> Window B imports a bundle into the same profile. **The import succeeds and B is told so.** A then
> resumes and wipes — destroying what B has just written, after B reported success, with no error on
> either side.

So the failure is not a torn end state that a sweep could find later. The end state is perfectly
self-consistent: the account is gone and nothing of it remains. What is missing is the person's data,
and nothing anywhere recorded that it was lost. That is the shape a lease has to close, and it is why
"skip when you cannot take it" is not universally right — for an import, silently skipping is the same
outcome as being wiped.

A control test sits beside it: the identical pair through ONE instance is serialized by `SerialQueue`
and the import survives, because it genuinely runs second. Without that control the first test would
only show that the two operations conflict, not that the WINDOW is where the guarantee stops.

**One constraint the reproduction also settled**, and it belongs in the design rather than being
discovered during it: `vscode.Memento` has no compare-and-swap. `get` then `update` is a
read-modify-write two windows can both win, so a lease key in `globalState` cannot exclude anything.

## The design round that changed the primitive — 2026-09-03

The first draft of steps 2–4 proposed exactly that lease, with a write-then-read-back to settle a
tie. **Three of the round's findings were Blocking and all three said the same thing, from three
different vendors independently: the read-back does not settle it.** Both windows read empty, both
write their own holder, and each can re-read its own value — `Memento.update` is asynchronous and a
foreign write reaches the other window's cache through a broadcast with no ordering guarantee against
a local read. So two windows enter, and the reproduction above still destroys the import. A design
whose central claim is refuted before a line is written is the cheapest kind of finding there is.

Eleven findings, **all accepted**. The design below is the corrected one.

### The primitive is a directory, not a key

`fs.mkdir` without `recursive` is **atomic on every platform this ships to**: it either creates the
directory or fails because it exists. That is a real mutual exclusion primitive, and one this
extension already has a place for — `context.globalStorageUri` is a directory on disk shared by every
window of the profile, which is the same sharing that makes the problem exist in the first place.

- **Acquire** = `mkdir(lockDir)`. Success IS the lock; there is no read-then-write to lose.
- **Identity** = a `holder.json` written inside the directory after acquiring: an id unique to this
  acquisition (not to the window — see fencing) plus a heartbeat timestamp.
- **Heartbeat**, not renewal-of-a-deadline: the holder rewrites the timestamp while it works, and a
  window is a valid holder only while `now - heartbeat < TTL`. A holder whose renewal loop dies stops
  being one without having to notice, which is what a killed window and a wedged one have in common.
- **Stale break** = read `holder.json`, and if it is older than the TTL, remove the directory and
  retry the `mkdir`. The retry is what makes the break safe: two windows can both decide to break,
  but only one can win the `mkdir` that follows.
- **Fencing** = the acquisition id. Release removes the directory **only if `holder.json` still names
  this acquisition**, so a holder that overran its TTL and was broken cannot delete the lock of the
  window that replaced it. The residual — a break landing between our check and our `rmdir` — is
  named in the header rather than papered over.

### What the round settled about behaviour

- **The sweep skips — and must come back.** Skipping when another window holds the lock is right, but
  a holder that is then killed leaves the pending removal for nobody: the sweep runs once at startup.
  So a skip schedules a retry after the TTL, and keeps doing so while the record still names work.
- **A person-triggered operation waits INDEFINITELY with a visible progress notification**, not on a
  bounded timeout. A bounded one fails a command while the other window is still mutating the same
  data, which is a worse state than waiting.
- **An import never reports success having done nothing.** Step 1 is why: silently skipping an import
  is the same outcome as being wiped.
- **The message never names a window id.** "Another window is importing" is actionable; "window 12345"
  is not.
- **The wiring goes in a `LeasedQueue` beside `SerialQueue`, not into `storageManager.ts`**, which is
  at its size-ratchet baseline and may not grow. The five call sites keep their shape.

## Build order

1. ~~A failing test with two `StorageManager` instances over one shared memento + keychain, showing a
   removal and an apply interleaving into a broken state.~~ **Done** — see above.
2. The lock primitive — `windowLock.ts`, free of `vscode`, taking a small filesystem port so the
   `mkdir` race, the stale break and the fencing check are all unit tests. Its header states the one
   residual race rather than implying there is none.
3. `LeasedQueue` beside `SerialQueue`: same `run` shape, the lock taken inside it. The five call
   sites in `storageManager.ts` keep their shape and that file does not grow.
4. The per-operation behaviour the round settled — the sweep skips and retries after the TTL,
   everything else waits with a visible progress notification, and nothing reports success having
   done nothing.
5. Re-point the step-1 reproduction at the leased operations and watch it stop losing the import.
   That test is the acceptance criterion, and it already exists.

## Definition of Done

- [x] The two-instance test from step 1 exists and passes, and names the failure: an import that
      SUCCEEDED is destroyed afterwards, with no error on either side.
- [ ] The same test, re-pointed at leased operations, no longer loses the import.
- [ ] A window killed holding the lock does not block the next one — the heartbeat, not a deadline.
- [ ] A holder that overran its TTL cannot delete the lock of the window that replaced it.
- [ ] The sweep skips rather than waits; a person-triggered removal waits visibly.
- [ ] `research/module_extension.md` records the primitive and its boundary.
- [ ] `SerialQueue`'s header stops being the last word on this, and points here.
