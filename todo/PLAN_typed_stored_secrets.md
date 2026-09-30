# PLAN — a stored secret has its own type: forgetting the PIN door stops compiling

> Status: **plan only, nothing implemented yet, 2026-09-29.** Plan gate passed (`proceed`, 2 of 2 reviewers,
> one round, seven findings accepted — §8). Scope: `src_vs_code/src` — `storageManager.ts`
> getter/setter signatures, a new `storedSecret.ts` / `entryReader.ts` / `entryWriter.ts`, the ~105 call
> sites that use a stored value, the four hand-written structural interfaces and one `Pick` that re-declare
> the getters, and the tests' fakes. Extension only; no format change. **Starts after**
> [PLAN_entry_pin_keeps_its_promise.md](../research/PLAN_entry_pin_keeps_its_promise.md) ships (extension 1.12.0).
>
> Owner decision 2026-09-29: the structural design is right, but migrating every call site in the same
> release as eighteen behavioural fixes to a secrets product is a regression risk of its own — so it is
> built second, on top of the runtime rules and tests that plan lands.

## 1. The goal

After the PIN plan, the rule *"no reader receives an envelope, no writer stores plaintext into a protected
entry"* is enforced by **tests** (`pinReaderBoundary`, `pinSlotMatrix`, the deletion of the three silent
getters — that plan §7). A test catches a new caller at `npm test`. This plan makes the compiler catch it
at `tsc`: a stored secret cannot be used as a `string`, and plaintext can only come out of the PIN door.

The root it removes (`storageManager.ts:697-899`): every getter returns `Thenable<string | undefined>`, so
"a value", "absent" and "locked" have one type; a caller that forgets the door type-checks.

## 2. Design (from the structural architecture pass of 2026-09-29)

- **`storedSecret.ts`:** `type StoredSecret = { readonly [STORED]: true }` — a phantom type, a string at run
  time, not assignable to `string`. `stored(raw)` / `storedOrNone(raw)` mint it only at the keychain and
  revision parse boundary; `carried(s)` hands the raw text to the raw carriers only (sync snapshots, backup
  bundles, revision snapshots, `entityPin`, history sealing); `readStored(s)` = `readSecret(carried(s))`.
  A branded `string & {…}` is rejected because it stays assignable to `string`; a runtime wrapper class is
  rejected because it breaks ~290 test assertions for no extra safety.
- **`slotSpec.ts`:** one `SLOT_SPECS` table (`name`, `label`, `bundleKey`) from which `SECRET_SLOTS`
  (`entitySlots.ts:31-89`), `RevisionSecrets` (`revisionHistory.ts:26-48`, the same ten keys),
  `SMALL_FIELDS` (`:74`) and the ten reads in `revisionSnapshot.ts:44-53` are DERIVED; a coverage test
  asserts `SLOT_SPECS.bundleKey ∪ {attachments, images}` equals `SECRET_KINDS` (`secretMaps.ts:48-71`).
- **`entryReader.ts`:** `EntryReader.text(slot) → FieldReading` (value | absent | withheld-with-reason,
  `fieldReading.ts:18-21`), built only by `openedReader(src, gate, admitted)` (the interactive door) or
  `unattendedReader(src, name, marked)` (never prompts, fails closed on the mark). `Admitted` has an
  unexported brand, so only the door can mint one.
- **`entryWriter.ts`:** `writeEntry(storage, a, e, ticket, { plan, blobs, details, node })` — the ONLY
  function that turns plaintext into a `StoredSecret` for a slot. It seals every `put` in memory first,
  keeps the crash-safe order (additions → node → removals), and stamps the protection mark. A `SealTicket`
  (unexported brand) comes from the door, from a brand-new entry, or from the unattended refusal. The PIN
  plan's `sealedWriter` / `sealValue` / `restoredDetails` are folded into it.
  - **The unattended ticket permits nothing on a protected entry** *(gate finding 0)*: on an entry with a
    locked slot or a PIN mark, `writeEntry` returns `{ kind: 'refused', reason }` and writes nothing; on an
    unprotected entry it permits plain writes.
  - **Interruption invariants** *(gate finding 1)*, Rule A per boundary: killed after the additions → only
    orphaned new secrets exist, the node still describes the old state; killed after the node write → the
    node is consistent, stale slots await removal; re-running the same plan converges in both cases.
- **No truthiness on a stored secret** *(gate finding 4)*: a stored secret is never `''` (`putSecret`
  deletes on empty, `storageManager.ts:364-371`), so truthiness and presence coincide today — but presence
  checks are still written `!== undefined`, and the funnel test forbids `!secret`, `.length` and template
  use on a `StoredSecret`. The object-shaped phantom is deliberate: string methods SHOULD not compile.
- **The flip:** getters return `Thenable<StoredSecret | undefined>`, setters take `StoredSecret |
  undefined`. Presence checks (`!== undefined`, ~10 sites) keep compiling; the ~105 value uses migrate to
  the reader; the ~45 writes to `writeEntry`.

## 3. Honest limits

`as never` / `as unknown as` casts and template literals defeat any brand. A source-scan **funnel test**
pins the modules allowed to call `carried(` / `readStored(` / `readSecret(` / `stored(` / `as StoredSecret`
(`storedSecret.ts`, `entitySlots.ts`, `entryReader.ts`, `entryWriter.ts`, `entityPin.ts`, `historyPin.ts`,
`revisionSnapshot.ts`, `revisionStore.ts`, `pinAdmission.ts`, `pinGate.ts`, `syncPinRule.ts`,
`storageManager.ts`), and review watches casts in production code. Type-aware lint rules are left out (CI
cost). *(Gate finding 2)*: `carried` / `readStored` live in a module whose name marks it internal
(`storedSecretInternal.ts`), the funnel scan has a NEGATIVE fixture — a file outside the allowlist that
calls `carried()` must make the scan fail — and a compile-fail fixture covers extraction by assignment.

## 4. Build order

- [ ] **T0** — Gate the plan; re-verify every `file:line` against the code as the PIN plan left it (it moves
      many of them).
- [ ] **T1** — `slotSpec.ts` + derivations + coverage test (no behaviour change).
- [ ] **T2** — `storedSecret.ts`, `entryReader.ts`, readers wrap today's getters inside `liveSlots` only.
- [ ] **T3** — Migrate readers file group by file group (viewer, clicks, automatic, export, share), each a
      green commit; the PIN plan's `pinReaderBoundary` classification shrinks as groups move.
- [ ] **T4** — `entryWriter.ts`; migrate Edit, Restore, create, share-accept/update, import, external
      apply, agent hooks, rotation.
- [ ] **T5** — The flip of the StorageManager signatures, **staged per slot** *(gate finding 6)*: each slot's
      getter/setter pair flips in its own green commit together with its callers, so a missed site surfaces
      one slot at a time rather than all at once (line-neutral against the ratchet, 1023); retype
      the four structural interfaces (`entityFlags.ts:52-54`, `exportSecrets.ts:6`, `maskEntries.ts:27-35`,
      `mcpEntries.ts:183-192`) and the `Pick` (`revisionSnapshot.ts:20-32`); test fakes get a `stored()`
      helper; the funnel test.
- [ ] **T6** — Docs (`research/module_extension.md`: the typed read/write API replaces the reader-class
      table), coai code round, release.

## 5. Test plan

- The PIN plan's `pinSlotMatrix` and `pinReaderBoundary` stay green through every step — they are the
  behavioural oracle this refactor must not move.
- New: the funnel test (with its negative fixture); the slot coverage test; a compile-fail fixture (a
  `tsc --noEmit` run over a snippet that uses a getter's result as a string must fail) so the guarantee
  itself is tested. The fixture runs **from a `node:test` file inside `npm test`** — it spawns `tsc` on the
  fixture and asserts a non-zero exit with the expected diagnostic — so CI cannot pass without it *(gate
  finding 5)*.
- Refusal and interruption tests before T4 *(gate findings 0, 1)*: an unattended update, a removal and a
  partial-write failure on a marked entry are refused with nothing written; a write thrown at each boundary
  (after additions, after the node) against the real `StorageManager` converges on retry.
- The inventory check *(gate finding 3)*: the PIN plan's `pinSlotMatrix` already enumerates every slot ×
  every reader/writer surface, and it is this plan's per-slot inventory — kept green unchanged.
- No behaviour change is intended: the whole suite green before and after each phase, with no assertion
  edited except mechanical fake signatures.

## 6. Size

About 1,700 production lines added in new modules, ~400 changed and ~900 removed in existing files (the
hand-written doors, three secret readers, hand lists), ~2,000 test lines mostly mechanical. The ratcheted
`storageManager.ts` and `extension.ts` must not grow.

## 7. Definition of Done

- [ ] Using a stored secret as a `string` outside the funnel modules is a compile error, proven by the
      compile-fail fixture.
- [ ] Every value read of a slot goes through `EntryReader`; every write through `writeEntry`.
- [ ] The PIN plan's behavioural tests unchanged and green; the funnel and coverage tests green.
- [ ] The ratchet did not grow; lint green.
- [ ] Docs updated; coai plan and code rounds `proceed`; promoted with deviations.

## 8. Plan gate — 2026-09-29

coai session `eda2faa2` (branch `docs/typed-stored-secrets`, kept for the build), one round, codex + gemini
(2 of 2 answered), verdict **proceed** (6 gating against a threshold of 6). All seven findings accepted:
the unattended ticket's refusal (§2), interruption invariants (§2, §5), the door-only extraction check (§3,
§5), the inventory check by reference (§5), no truthiness on a stored secret (§2), the compile-fail fixture
inside `npm test` (§5), and T5 staged per slot (§4).

The gate's operator commands for THIS plan, to follow when it is built: do the split with Fable at its
highest version; implement ordinary stories on Opus and anything security- or architecture-critical on
Fable (max), naming the model per story; build on this branch, one code round over the whole diff.
