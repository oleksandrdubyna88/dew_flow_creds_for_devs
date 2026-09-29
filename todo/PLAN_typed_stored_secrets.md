# PLAN — a stored secret has its own type: forgetting the PIN door stops compiling

> Status: **plan only, nothing implemented yet, 2026-09-29.** Scope: `src_vs_code/src` — `storageManager.ts`
> getter/setter signatures, a new `storedSecret.ts` / `entryReader.ts` / `entryWriter.ts`, the ~105 call
> sites that use a stored value, the four hand-written structural interfaces and one `Pick` that re-declare
> the getters, and the tests' fakes. Extension only; no format change. **Starts after**
> [PLAN_entry_pin_keeps_its_promise.md](PLAN_entry_pin_keeps_its_promise.md) ships (extension 1.12.0).
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
- **The flip:** getters return `Thenable<StoredSecret | undefined>`, setters take `StoredSecret |
  undefined`. Presence checks (`!== undefined`, ~10 sites) keep compiling; the ~105 value uses migrate to
  the reader; the ~45 writes to `writeEntry`.

## 3. Honest limits

`as never` / `as unknown as` casts and template literals defeat any brand. A source-scan **funnel test**
pins the modules allowed to call `carried(` / `readStored(` / `readSecret(` / `stored(` / `as StoredSecret`
(`storedSecret.ts`, `entitySlots.ts`, `entryReader.ts`, `entryWriter.ts`, `entityPin.ts`, `historyPin.ts`,
`revisionSnapshot.ts`, `revisionStore.ts`, `pinAdmission.ts`, `pinGate.ts`, `syncPinRule.ts`,
`storageManager.ts`), and review watches casts in production code. Type-aware lint rules are left out (CI
cost).

## 4. Build order

- [ ] **T0** — Gate the plan; re-verify every `file:line` against the code as the PIN plan left it (it moves
      many of them).
- [ ] **T1** — `slotSpec.ts` + derivations + coverage test (no behaviour change).
- [ ] **T2** — `storedSecret.ts`, `entryReader.ts`, readers wrap today's getters inside `liveSlots` only.
- [ ] **T3** — Migrate readers file group by file group (viewer, clicks, automatic, export, share), each a
      green commit; the PIN plan's `pinReaderBoundary` classification shrinks as groups move.
- [ ] **T4** — `entryWriter.ts`; migrate Edit, Restore, create, share-accept/update, import, external
      apply, agent hooks, rotation.
- [ ] **T5** — The flip of the StorageManager signatures (line-neutral against the ratchet, 1023); retype
      the four structural interfaces (`entityFlags.ts:52-54`, `exportSecrets.ts:6`, `maskEntries.ts:27-35`,
      `mcpEntries.ts:183-192`) and the `Pick` (`revisionSnapshot.ts:20-32`); test fakes get a `stored()`
      helper; the funnel test.
- [ ] **T6** — Docs (`research/module_extension.md`: the typed read/write API replaces the reader-class
      table), coai code round, release.

## 5. Test plan

- The PIN plan's `pinSlotMatrix` and `pinReaderBoundary` stay green through every step — they are the
  behavioural oracle this refactor must not move.
- New: the funnel test; the slot coverage test; a compile-fail fixture (a `tsc --noEmit` run over a snippet
  that uses a getter's result as a string must fail) so the guarantee itself is tested.
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
