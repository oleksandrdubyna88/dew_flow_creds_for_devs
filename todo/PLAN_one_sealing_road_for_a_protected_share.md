# PLAN — a protected share seals through the one road every other arrival takes

> Status: **plan only, nothing implemented yet, 2026-10-03.** Scope: `src_vs_code/src` — `shareRecipientPin.ts`
> (`wrappedPayload` and `sealedForImport` removed; `forThisRecipient` answers a PIN, not a payload), `shareImport.ts`
> (the recipient's own PIN becomes a `SettledPin`), `shareUpdateSeal.ts` (the own PIN reaches `historyPin`), and their
> tests. Extension only; no format, contract or server change.
>
> The open tail of [PLAN_pin_folder_asks_on_accept_and_import.md](../research/PLAN_pin_folder_asks_on_accept_and_import.md)
> (§3.5 and the owner's decision §9.2: *"folded into `writerForNew` + `applyCreatePin` — as a separate follow-up"*).
> Related: [PLAN_entry_pin_keeps_its_promise.md](../research/PLAN_entry_pin_keeps_its_promise.md) (R3, R6, §5.9),
> [module_extension.md](../research/module_extension.md) §*The entry PIN keeps its promise*.

## 1. The symptom

A share whose sender had the entry protected arrives in the clear (the sender unwrapped it, because the recipient can
never be given that PIN). In a folder that asks for a PIN, the folder's PIN now seals it through the arrival road
(`shareImport.newArrival`, `shareImport.ts:236-258`: `writerForNew(…, settled)` at `:254`, then
`applyCreatePin` in `writeArrival`, `:334-339`). In a folder that asks NOTHING, the recipient is offered a PIN of
their own, and the values take a second road: `shareRecipientPin.wrappedPayload` (`shareRecipientPin.ts:54-84`)
seals every slot with `lockSecret` in memory and writes the mark and `pinEpoch: 1` into the payload's node;
the arrival then writes those envelopes through the PLAIN writer (`writerForNew` with `NO_PIN`).

Two roads for one guarantee are two places for it to drift. What reading the second one turned up — each to be
shown RED before anything is changed, because they are read from the code, not observed:

1. **An update can leave the entry's kept version in the clear while the entry becomes protected.** *Update it* on
   an UNPROTECTED entry from a protected share, in a folder that asks nothing: `arrivingForUpdate`
   (`shareImport.ts:189-194`) seals the payload under the own PIN (`sealedForRecipient` → `forThisRecipient`), and
   `updateInPlace` (`shareUpdateSeal.ts:57-75`) is called with `historyPin = pinOf(decision.folder)` (`:135`,
   `:140-142`) — `undefined`, because the FOLDER settled `none`. So the revision of what the entry was is recorded
   plain (`keptVersion`, `:79-84`) beside values that are now sealed. *Protect…* seals the last three versions
   (`pinOnCreate.applyCreatePin` → `protectHistory`, `pinOnCreate.ts:347`); this road does not.
2. **The update may not count the protection decision.** `wrappedPayload` puts `pinEpoch: 1` on the payload's node
   (`shareRecipientPin.ts:79-80`), but `rebuilt` (`shareUpdateSeal.ts:92-100`) takes `pinEpoch` from the EXISTING
   node (`recipientsOwn`, `:103-107`), so an unprotected entry that an update made protected keeps the epoch it had.
   `pinEpoch` is what a sync uses to order protection decisions (§5.9); an uncounted decision can lose to an older
   one from another machine.
3. **The two roads seal differently.** `wrappedPayload` seals in parallel (`Promise.all`, `:63-67`) under a
   `withProgress` notification (`sealedForImport`, `:135-144`); `writerForNew` seals per write, re-checked under the
   lease. A change to either is a change to one road only.

## 2. The goal

1. ONE sealing road for every arrival that ends protected: the recipient's own PIN is a `SettledPin` like the
   folder's, the values go through `writerForNew(…, settled)` / the update's sealing writer, and `applyCreatePin`
   writes the sweep, the history, the mark and the first `pinEpoch` — the order Add and the folder arrival use.
2. An update that makes an entry protected seals its kept version and counts the decision (1.1, 1.2 closed).
3. Nothing the person sees changes: the same own-PIN question, the same decline message
   (`declinedMessage`, `shareRecipientPin.ts:87-92`), the same "nothing written when declined", and the wait is still
   announced.

## 3. Design

- `forThisRecipient` (`shareRecipientPin.ts:116-126`) answers `SettledPin | 'declined'` — `{ kind: 'pin', pin }` for
  the own PIN, `{ kind: 'none' }` when the sender asked nothing — and the payload's instruction is spent by the
  caller with `shareImport.spentInstruction` (`shareImport.ts:264-267`), the helper the folder's PIN already uses.
  `wrappedPayload`, `lockedOrAsIs` and `sealedForImport` are deleted.
- `newArrival` (`shareImport.ts:236-258`) settles ONE pin: the folder's when it settled `pin`, else the own PIN when
  the sender asked, else `none`; `writerForNew(…, settled)` and `applyCreatePin(settled, …)` do the rest. R3 holds
  as it does for the folder's PIN today: every value is sealed by the writer before it is first written, and the
  mark comes after the node.
- *Update it* (`updatedInPlace`, `:125-137`): the settled own PIN reaches `updateInPlace`'s `historyPin` (so 1.1 is
  sealed in memory before it is written) and `updatedArrival`'s sealing writer (`:209`, today only for the folder's
  PIN), and `applyCreatePin` counts the decision (1.2).
- The wait: the progress notification moves to wrap the landing's writes when its settled PIN came from the person
  (the scrypt cost is per sealed slot either way). Whether the per-write sealing is measurably slower than the
  parallel wrap for a nine-slot entry is measured before and after (§5); if it is, the writer takes the parallel
  seal, not the share.

## 4. Build order — red first

- [ ] **S1 — the update seals the kept version.** RED: *Update it* on an unprotected entry from a protected share in
      a folder that asks nothing, own PIN given → the newest revision holds the old password in the clear. GREEN after
      the own PIN reaches `historyPin`. Break-it: drop it → red.
- [ ] **S2 — the update counts the decision.** RED: the same update → `pinEpoch` unchanged. GREEN: + 1, in the mark's
      write. Break-it.
- [ ] **S3 — one road for a new arrival.** RED-first characterisation: a new protected share in a folder that asks
      nothing → every slot sealed, the mark and `pinEpoch: 1` on the node, the keychain write log shows no plain value
      at any point (`pinWorld`'s write log), the decline writes nothing. These pass today; they are the guard that the
      fold changes nothing the person can see. Then the fold; `wrappedPayload` gone.
- [ ] **S4 — the wait is still said.** The "Protecting …" notification wraps the landing when the PIN was the
      person's own; timing before/after recorded (§5).
- [ ] **S5 — docs and promotion.**

## 5. Test plan

| Guarantee | Where | How |
|---|---|---|
| The kept version is sealed by an update that protects | `recipientPin.test.ts` (or a new `shareOneRoad.test.ts`) | the revision's password reads `locked` and opens with the own PIN |
| The decision is counted | same | `pinEpoch` before/after |
| No plain value ever written | same, over `pinWorld.memoryStorage` | the keychain write log holds no plain value of the share |
| Decline writes nothing; the message is unchanged | `recipientPin.test.ts`, `shareBatchRefusal.test.ts` | unchanged assertions, green without edits |
| Folder PIN arrivals unchanged | `arrivalPin.test.ts`, `arrivalPinReview.test.ts` | green without edits |
| The wait | a timing note in §10 | nine-slot entry, three runs before and after |

## 6. Docs to update

- `research/module_extension.md` §*The entry PIN keeps its promise* — the protected share's arrival paragraph.
- `research/module_tests.md` — the new rows.
- `research/PLAN_pin_folder_asks_on_accept_and_import.md` — its open tail points at the promoted record.
- `src_vs_code/CHANGELOG.md` — *Fixed:* an update from a protected share left the entry's previous version
  unprotected (if S1's RED confirms it).

## 7. Definition of Done

- [ ] S1 and S2 observed RED, then green, each with its break-it in the commit body.
- [ ] `wrappedPayload`, `lockedOrAsIs` and `sealedForImport` are gone; `lockSecret` is not called from `shareRecipientPin.ts`.
- [ ] Every existing share and arrival suite green without assertion edits.
- [ ] Typecheck, lint, `npm test`, plan lifecycle green; §6 docs updated; the coai gate (plan, then code) passed.
