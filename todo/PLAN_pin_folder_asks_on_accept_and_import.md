# PLAN — a folder that asks for a PIN asks it too when a share or an import lands in it

> Status: **in progress, 2026-10-03 — B1–B7 built on `feat/pin-folder-accept-import`, B8's documentation
> written; the code round and the move out of `todo/` follow** (deviations: §10). Scope: `src_vs_code/src` — `shareInbox.ts`
> (its import half extracted to a new `shareImport.ts`), `shareRecipientPin.ts`, a new `arrivalPin.ts`,
> `pinOnCreate.ts` (one export widened), `importCommands.ts`, `externalSecretsApply.ts`, the two import
> handlers in `commands/treeMutationCommands.ts`, and their tests. Extension only; no format, contract or
> server change.
>
> Answers the open question of [PLAN_typed_stored_secrets.md](../research/PLAN_typed_stored_secrets.md) §2.7
> (*"Checked and left as they are, with the question named"*). Related:
> [PLAN_entry_pin_keeps_its_promise.md](../research/PLAN_entry_pin_keeps_its_promise.md) (R3, R5),
> [PLAN_agent_creates_what_the_folder_holds.md](../research/PLAN_agent_creates_what_the_folder_holds.md) (D-B),
> [module_extension.md](../research/module_extension.md) §*The entry PIN keeps its promise* and §*The type takes
> over*. Shares one story with [PLAN_waiting_rotation_visible.md](PLAN_waiting_rotation_visible.md) (§6).

All `file:line` references are to `src_vs_code/src/` and were read on `main` at `95a4f58f` on 2026-10-02.

## 1. The symptom

A folder whose entries are protected promises that nothing in it is stored in the clear. Two of the four
roads that put a NEW entry into a folder keep that promise; two do not.

| Road | What it does today | Where |
|---|---|---|
| The person's Add | asks the folder's PIN BEFORE the form (`pinForNewEntry`), seals every value in memory, then `applyCreatePin` | `commands/treeMutationCommands.ts:255`, `:294`, `:319` |
| An agent's create | asks the same question after consent (`settleAgentCreate`), the same writer, the same `applyCreatePin` | `agentCreatePin.ts:22-34`, `mcpHooks.ts:73-75`, `:85` |
| An accepted share | `writerForNew(storage, a, id)` with the default `NO_PIN` — plain, no question, no mark | `shareInbox.ts:698`, `:706`; `entryWriter.ts:92-96` |
| An import (another tool, or a CredsForDevs bundle) | the same `writerForNew(..., NO_PIN)` | `importCommands.ts:65`; `externalSecretsApply.ts:63` |

So a protected folder holds plain entries after an accept or an import, the folder still reads as protected
(`pinOnCreate.ts:22-25`: protection is derived from the entries), and nothing says so. R3 is not broken — the
entries written are not protected — which is why §2.7 recorded it as a question, not a defect.

**The owner's decision (2026-10-02):** *yes* — a folder that asks for a PIN asks it when a share is accepted
into it and when something is imported into it, exactly as the person's own Add into that folder does.

### What the code says about "into it" (verified, it narrows the problem)

- **A single-entry share lands at the account ROOT.** `importShared` walks `payload.folderPath ?? []`
  (`shareInbox.ts:639-657`) and only a FOLDER share carries a chain (`shareInbox.ts:349`). The root never
  asks (`pinOnCreate.ts:254-256` returns no siblings for `null`; `asksAnyway` starts at no folder,
  `:192-198`). So the road is a **folder share** whose chain names, by name, an existing folder that asks
  (`:641-645` reuses a folder of the same name).
- **The folder chain is written before anything else** (`shareInbox.ts:647-654`), and an import creates its
  folders first too (`importCommands.ts:28-46`, `:49-55`). A decision taken after those writes cannot keep
  "declined = nothing written"; this plan moves the folder writes after the decision.
- **A share the sender protected already asks a PIN** — the recipient's OWN, typed twice
  (`shareRecipientPin.ts:37-46`), sealed in memory (`:54-84`) and written through the plain writer. In a
  folder that asks, that PIN is unchecked against the folder's entries: the folder ends up holding entries
  under two PINs with nobody told (`pinOnCreate.ts:270`, the sentence Add would have shown).
- **Found while reading — a miscount the decline path would inherit.** A dismissed *Update it / Keep both*
  returns normally from `importShared` (`shareInbox.ts:685-691`), so `acceptOne` then says *Accepted "X"*
  (`:432-434`) and `acceptMany` counts it as imported (`:554`) while the share is still in the inbox.
- **Checked and out of scope:** Clone writes metadata only (`treeMutationCommands.ts:173-186`); a share's
  *Update it* writes an EXISTING id through `sealingForUpdate` (`shareUpdateSeal.ts:52-69`); a drag of an
  existing entry into a protected folder writes no value. None of them makes a new id in the folder.

## 2. The goal

1. An entry a share or an import writes into a folder that asks is sealed under the folder's PIN **before
   its first write** (R3: never in the clear, not even for a moment), carries the mark and the first
   `pinEpoch`, and its folder chain is asked the question Add would ask there.
2. A batch — several shares, a file of many entries — asks **once per folder**, not once per entry.
3. Declined: **nothing is written** for that folder — no value, no node, no folder shell. A share stays in
   *Shared with me* and is counted as pending; an import reports which entries it skipped and why.
4. One sealing road: the writer and the mark are `writerForNew(…, settled)` and `applyCreatePin` — the ones
   Add and the agent's create use. No second implementation.
5. No lease is held across any PIN box or modal.

## 3. Design

### 3.1 Where the decision is taken — `arrivalPin.ts` (new, ~90 lines)

One small module, over `pinOnCreate`'s own question — reused, not copied. **It imports no `vscode`** (plan
round, finding 5; the repository's rule 3): the question is a port, `AskFolderPin = (folderId) =>
Promise<CreatePin>`, bound to `pinOnCreate.pinForNewEntry` (which does import `vscode`) only where the
commands are registered, and faked in `arrivalPin.test.ts`:

- **`landingOf(storage, accountId, under, chain)`** — pure, writes nothing: walks `chain` (folder names)
  from `under` exactly as `importShared` does (`shareInbox.ts:640-645`: reuse a child folder of that name),
  and answers `{ existing: string | null; creates: readonly FolderSeg[] }` — the deepest folder that exists
  and the segments this arrival will have to create below it.
- **`arrivalPins(storage, accountId)`** — a per-command memo, `settledFor(landing): Promise<CreatePin>`:
  - `creates` empty → the question Add asks in `existing`: `pinForNewEntry(storage, a, existing)`
    (`pinOnCreate.ts:101-112`) — checked against the folder's protected entries and agreed in a modal
    (`PinAsk.confirm` default true, `:236-238`), or typed twice in a folder that only carries the preference.
  - `creates` non-empty → a folder the arrival creates is empty, so Add into it could only be asked through
    a preference on `existing` or above. `folderPrefersPin(storage, a, existing)` — today's private
    `asksAnyway` (`pinOnCreate.ts:168-189`) exported under that name, the one widening of `pinOnCreate` —
    false → `none`; true → **the answer settled for `existing`** (asked once if not yet), so one folder's
    whole landing subtree is one question. (Add would ask a fresh *typed-twice* first PIN per new subfolder;
    see §9 Q1.)
  - The memo key is `existing` (`null` for the root, which answers `none` without asking). A `cancelled`
    answer is memoised too: a declined folder is not asked again within the same command.
- **Lifetime.** The memo lives for ONE command invocation (an `acceptOne`, an `acceptMany`, one import) and
  is dropped with it; it holds settled PINs in memory as `settleAgentCreate` holds `sealWith` between its
  settle and its make (`mcpHooks.ts:73`). Nothing is persisted, nothing is granted to the window (Add grants
  nothing either). Growth: one entry per distinct destination folder of one command — no growth surface.

### 3.2 The write — the roads Add and the agent take, unchanged

For every new id whose landing settled `pin`: `writerForNew(storage, a, id, settled)` (`entryWriter.ts:92-94`
→ the sealing writer, `:247`, seals each value in memory before its raw setter and commits under the lease),
the node, then `applyCreatePin(settled, storage, a, id)` (`pinOnCreate.ts:308-329`: the idempotent sweep, the
history, the mark and `pinEpoch` + 1, last). For `none`: today's `writerForNew(…)` exactly. A `cancelled`
landing writes nothing. The folders a landing `creates` are written only once that landing settled
`none` or `pin`.

**No lease across a box:** every question is asked before the first write of its landing; the writers take
the lease per write (`entryWriter.ts:159-166`, `:250-254`) and nothing holds it between two of them.

### 3.3 Shares — `shareImport.ts` (extracted) and the accept paths

`importShared` (`shareInbox.ts:637-788`) moves, first and verbatim, to `shareImport.ts` as
`landShare(deps, share, payload, pins): Promise<ShareLanding>` (§6 — this is what pays for every line below;
`shareInbox.ts` is at 798 of eslint's 800, `eslint.config.mjs:30`). Then, in this order:

1. **Origin** (unchanged): a share the same sender sent before asks *Update it / Keep both*
   (`shareInbox.ts:674-692`). *Update it* stays the `updateInPlace` road. Dismissed → `left`.
2. **New id** (no origin, or *Keep both*): `landingOf(…, null, payload.folderPath)` → `pins.settledFor(…)`.
   `cancelled` → `left`, with *"Left in "Shared with me" — the folder "X" asks for a PIN on every entry in it,
   and none was given."* Nothing is written, not the folder chain either.
3. **The sender's instruction and the folder's ask are ONE question.** `forThisRecipient`
   (`shareRecipientPin.ts:116-126`) moves from the two callers (`shareInbox.ts:420`, `:549`) into `landShare`,
   after step 2, and is asked **only when the folder settled `none`**. When the folder settled `pin`, the
   payload's `pinAskOnImport` is satisfied by the folder's PIN: it is cleared on the node (the instruction is
   spent, as `wrappedPayload` spends it, `shareRecipientPin.ts:76-78`) and the values go through the sealing
   writer — `wrappedPayload` is not used. *Update it* calls `sealedForRecipient` itself before
   `updateInPlace`, as today. **Consequence, deliberate:** for a share that is an update candidate, the own-PIN
   box now comes after *Update it / Keep both* rather than before — a PIN is no longer asked for a share the
   person then dismisses.
4. **Writes** as §3.2: missing folders, the values through `writerForNew(…, settled)`, the node,
   `applyCreatePin`, the origin, the consume (`removeOwnShare`).

**One share is one landing and one decision, taken before any write** (plan round, finding 1): a share
carries ONE folder chain (`payload.folderPath`), every entry of a folder share lands in that chain's
subtree, and the subtree is one question (§9.1) — so a share is written whole or not at all; there is no
partial landing to retry. `ShareLanding = 'landed' | 'left'`. `acceptOne` says *Accepted* only for `landed`; `acceptMany`'s
`importOpened` counts `left` with the pending ones (`shareInbox.ts:524-526`), and its tally names the folders
that were declined. `acceptMany` creates ONE `arrivalPins` for the whole conversation, across its PIN rounds
(`:480-516`), so three shares into one folder are one question however many transit PINs opened them.

### 3.4 Imports — `importEntities` and `applyExternalSecrets`

- **From another tool** (`credSshManager.importFrom`, `treeMutationCommands.ts:474-518` →
  `importCommands.importEntities`, `:22-74`). After the existing *Import N entries?* confirm (`:503-510`) and
  before any write: each entity's landing is `landingOf(…, location.parentId, entity.folder ? [entity.folder] : [])`
  — every `folder` there is new (`folderFor` never reuses one, `:36-45`) — settled through one `arrivalPins`.
  `folderFor` then creates only folders with at least one entity going ahead. Each `runCreate` takes
  `writerForNew(…, settled)` (`:65`) and is followed by `applyCreatePin` for a `pin` landing.
  `importEntities` returns `{ created, skipped }` (`skipped`: entry names with the reason) instead of a
  number, and the handler's message (`:514-517`) names them as it names the reader's skips (`:499-502`).
- **A CredsForDevs bundle** (`credSshManager.importExternal`, `:521-610`). `remapExternalIds` puts every
  bundle node under `location.parentId` (`externalBundle.ts:76-106`); its folders are all new. Each entity's
  landing is `{ existing: location.parentId, creates }` from its remapped parents — so the whole bundle is
  at most ONE question. `applyExternalSecrets` (`externalSecretsApply.ts:57-67`) is widened with
  a REQUIRED `pinFor: (entityId) => SettledPin` — no `NO_PIN` default, so a caller cannot forget it and
  write plain into a protected folder (plan round, finding 3); its own test passes `() => NO_PIN` explicitly,
  a declared mechanical change — and passes it to
  `writerForNew` (`:63`). A declined landing removes its entities — and any remapped folder left holding
  nothing — from `remapped` before `applyExternalSecrets` and the node loop (`:591-594`);
  `applyCreatePin` runs for each sealed entity after its node; the message (`:607-609`) names the skipped.

### 3.5 What is deliberately not done

- **`wrappedPayload` stays** for a protected share landing in a folder that asks nothing. It is the precedent
  R3 was written from (`PLAN_entry_pin_keeps_its_promise.md` §R3), it seals with `lockSecret` directly and
  writes the mark in the node — a second sealing road beside `writerForNew` + `applyCreatePin`. Folding it in
  is a separate change with its own risk (parallel scrypt, its progress notification); named, not done —
  §9 Q2.
- **No PIN is asked for an update of an existing entry** (`sealingForUpdate` owns that), for Clone, or for
  a drag into a protected folder.

## 4. Build order — small stories, each RED first

Every behavioural story: the test named after the guarantee, run RED against the unfixed code with the real
symptom in its message, the fix, GREEN, the whole suite; a **break-it** (revert the fix or plant the defect,
see red, restore) recorded in the commit body. Over the real `StorageManager` with the keychain write log
(`test/pinWorld.ts`, the `addEntityPin.test.ts` pattern) and the share world (`test/shareWorld.ts`).
Typecheck, lint (`max-lines` 800, `max-lines-per-function` 50), `npm test`, the plan lifecycle check.

- [x] **B1 — extract the share import.** *(e7224b39)* `importShared` (with the imports only it uses) moves to
      `shareImport.ts` verbatim; `ShareInbox` calls `landShare(this.deps, …)`. No behaviour changes, so no
      RED: the whole share suite (`shareInbox`, `shareUpdateSeal`, `recipientPin`, `sharePayment`,
      `shareArrivalReadable`, `shareBatchRefusal`, `writeOrderPaths`) stays green unmodified, and
      `shareInbox.ts` drops to ~650 lines. Shared with Plan C (§6).
- [x] **B2 — an accept says what happened.** *(febc4e77)* `ShareLanding`. RED (`shareInbox.test.ts`): dismiss *Update
      it / Keep both* in `acceptOne` → today the infos say *Accepted "X"* after *Left in "Shared with me"*;
      in `acceptMany` → the tally says *Accepted 1 item(s)* with the share still in the inbox. Break-it:
      count `left` as landed → red.
- [x] **B3 — one accepted share into a folder that asks is sealed under its PIN.** *(16bb9c9b)* `arrivalPin.ts`,
      `folderPrefersPin`, steps 2 and 4 of §3.3. RED (new `test/arrivalPin.test.ts`): a folder share whose
      chain names an existing folder holding a protected entry → *"the keychain was handed the arriving
      password in the clear"*, and the entry carries no mark. GREEN: every slot write is an envelope, the
      entry opens with the folder's PIN, marked, `pinEpoch` 1. Declined → no keychain write, no node, no
      folder created, the share still pending and the sentence said. A share whose chain names nothing that
      exists, and a single-entry share (root), ask nothing — written as today. Break-it: hand `landShare`
      `NO_PIN` → red.
- [x] **B4 — a batch asks once per folder.** *(4d6d6855)* RED: `acceptMany` over three shares into one protected folder →
      today no box and three plain entries; GREEN: exactly one PIN box and one *Use this PIN* modal, three
      sealed entries; two folders → two boxes; the first declined → its shares left and counted pending, the
      second folder still asked. The same through two transit-PIN rounds (one memo per conversation). And
      the box is never inside the lease: from the stubbed box, a second window's `runOrSkip` over the same
      lock is not skipped. Break-it: a memo per share → three boxes, red.
- [x] **B5 — the sender's protection and the folder's ask are one question.** *(984a29eb)* Step 3 of §3.3. RED: a
      `pinAskOnImport` share into a folder that asks → today the own-PIN box (typed twice) is asked, the
      folder's is not, and the entry is sealed under a PIN that opens none of the folder's protected
      entries (*"sealed under a PIN the folder's entries do not use"*). GREEN: one box (the folder's), the
      node carries the mark and no `pinAskOnImport`. Into a folder that asks nothing: `recipientPin.test.ts`
      unchanged. An update candidate asks its own PIN after *Update it*. Break-it: ask `forThisRecipient`
      unconditionally → two boxes, red.
- [x] **B6 — an import from another tool honours the folder.** *(075f52b9)* RED (`writeOrderPaths`-style, real storage):
      `importEntities` into a protected folder → plain writes. GREEN: one question per destination; sealed
      entries; declined → those entries and their would-be folders not written, `skipped` names them, the
      rest imported. Break-it: drop `pinFor` → red.
- [x] **B7 — a bundle import honours the folder.** *(a4b87619)* RED (`externalSecretsApply.test.ts` world plus the
      handler): `importExternal` into a protected folder → plain writes. GREEN: at most one question; sealed;
      declined → nothing of the bundle under that landing written, said. The coverage test over
      `EXTERNAL_SECRET_KEYS` stays as it is. Break-it: `pinFor` answering `NO_PIN` → red.
- [ ] **B8 — docs and promotion** (§7). The docs are written (the B8 docs commit); `review_code` over the whole
      diff and `/promote-plan` with the deviations are still to come.

## 5. Test plan

| Guarantee | Where | How it is shown |
|---|---|---|
| Never written in the clear (R3) | `arrivalPin.test.ts` | the keychain write log holds only envelopes for every slot of every arrival into a folder that asks (B3, B6, B7) |
| Declined writes nothing | `arrivalPin.test.ts` | no keychain write, no node, no folder node; the share pending; the import's `skipped` (B3, B4, B6, B7) |
| Once per folder | `arrivalPin.test.ts` | count of PIN boxes and modals across a batch and across PIN rounds (B4) |
| One question, not two | `arrivalPin.test.ts`, `recipientPin.test.ts` | box count; the mark and no instruction on the node (B5) |
| The accept's word matches the inbox | `shareInbox.test.ts` | infos and tally after a dismissed update and a declined folder (B2) |
| No lease across a box | `arrivalPin.test.ts` | a second window's `runOrSkip` from inside the box stub runs (B4) |
| Unchanged where nothing asks | the existing share and import suites | green without edits (B1, B3-B7) |

## 6. Boundary with the sibling plan

| Item | Built by | The other plan's part |
|---|---|---|
| Extract `importShared` from `shareInbox.ts` (798 lines) | **this plan, B1** | [PLAN_waiting_rotation_visible.md](PLAN_waiting_rotation_visible.md) W2 adds one line to `shareInbox.ts` and needs the room: it lands after B1, or lands B1 first exactly as written here and this plan skips it |
| The share's sender-side door (`payloadsFor`) | the sibling, W2 | nothing here |

Disjoint otherwise: this plan touches the RECEIVING half of `shareInbox.ts`, the sibling the SENDING half.

## 7. Docs to update

- `research/module_extension.md` — §*The entry PIN keeps its promise*: the paragraph on Add into a folder
  that asks (`:1461-1470`) names accept and import as the same road; the `pinOnCreate.ts` row (`:1171`) gains `folderPrefersPin`; new rows
  for `arrivalPin.ts` and `shareImport.ts`; the import order table (`:391`) notes the decision before the
  folders; §*Sharing* notes the one-question rule for `pinAskOnImport`.
- `research/module_tests.md` §*A PIN-protected entry keeps its promise* — `arrivalPin.test.ts`.
- `research/PLAN_typed_stored_secrets.md` — its status line's open tail says §2.7's question is answered and
  points here (done in this plan's commit, so the boundary is named on both sides).
- `src_vs_code/CHANGELOG.md` `[Unreleased]` — *Changed:* accepting a folder share into, or importing into, a
  folder whose entries are protected asks its PIN and seals before writing; *Fixed:* a dismissed update no
  longer says *Accepted*.
- Help (`helpEn.ts` and the four translations): the protected-folder paragraph names accept and import.

## 8. Definition of Done

- [ ] B1–B8 merged, each behavioural story with its RED observation and break-it in the commit body.
- [ ] An accepted folder share and both imports into a folder that asks are sealed before their first write,
      marked, and asked once per folder — shown over the real storage's write log.
- [ ] A decline writes nothing for that folder; the share stays pending; the import names what it skipped.
- [ ] `writerForNew` and `applyCreatePin` are the only sealing road these arrivals take; no new sealer.
- [ ] `shareInbox.ts` well under 800 lines; typecheck, lint, `npm test`, plan lifecycle green.
- [ ] §7 docs updated; plan promoted with its deviations.

## 9. Decided (2026-10-02)

1. **New subfolders an arrival creates under a folder that carries the preference — ONE question for the
   whole landing subtree**, with the PIN settled for the existing folder (not Add's fresh PIN per new
   subfolder: a 20-folder import would ask 20 times). A folder that asks only because it HOLDS protected
   entries (no preference) does not reach a subfolder the arrival creates — as Add into an empty subfolder
   of it asks nothing today.
2. **`shareRecipientPin.wrappedPayload` is folded into `writerForNew` + `applyCreatePin` — as a separate
   follow-up, not in this plan** (open tail): it is a second sealing road, and in a PIN folder it seals under
   the recipient's own PIN, unchecked against the folder's, so one folder can hold two PINs. This plan must
   not make that worse: where both apply, the folder's PIN wins and no second "own PIN" is asked (§3).

## 10. As built — deviations from the text above (2026-10-03)

Each story's RED message and break-it are in its commit body (§4 names the commits).

1. **The port carries two functions, not one.** `AskFolderPin` became `FolderQuestion { ask, prefers }`:
   `folderPrefersPin` lives in `pinOnCreate.ts`, which imports `vscode`, so `arrivalPin.ts` could not call it
   and stay free of `vscode` (finding 5). The binder is `pinOnCreate.folderQuestion(storage)` — a second
   export of `pinOnCreate` beside `folderPrefersPin`, where §3.1 named one widening.
2. **A landing carries its account, and the memo takes no storage.** `Landing = { accountId, existing,
   creates }`, `arrivalPins(question)`, memo key (account, folder): one memo serves an `acceptMany` whose
   shares are for different accounts, as §3.3 asks (*ONE `arrivalPins` for the whole conversation*).
   `ArrivalPins.declined()` was added for the batch tally that names the declined folders.
3. **An import's landing is built directly, not with `landingOf`.** `landingOf` reuses a folder of the same
   name; `folderFor` never does, so an existing same-named folder would have been asked instead of the new
   folder the entry really lands in. `importLanding` / `chainOf` construct `{ existing: location.parentId,
   creates }` — what §3.4 describes in words.
4. **`importEntities`' question is REQUIRED too** (the plan said so only of `pinFor`), for finding 3's reason.
   Declared mechanical edit: `writeOrderPaths.test.ts`'s five calls pass a question that asks nothing, and
   `count` → `count.created`. `externalSecretsApply.test.ts`'s five calls pass `() => NO_PIN` (as planned).
   `pinWorld.memoryStorage` gained an optional `lockDir` (additive) for the lease probe.
5. **The bundle import moved out of the command.** `importCommands.landBundle` holds the decision, the secrets,
   the nodes and the marks; the `importExternal` handler calls it (`treeMutationCommands.ts` 755 → 746 lines).
6. **`landShare` was decomposed** (`originArrival`, `newArrival`, `updatedInPlace`, `writeChain`, `writeArrival`,
   `settleShare`) and lost its `eslint-disable`; `sealedForRecipient` moved from `ShareInbox` into
   `shareImport.ts`. `shareInbox.ts` ends at 621 lines (from 798).
7. **B3 gave each batch share its own memo; B4 hoisted it.** So B4's RED is three boxes for three shares (B3's
   interim state), not §4's *"no box and three plain entries"* (the pre-plan state).
8. **B5's RED symptom** is *"the recipient's own PIN was asked as well as the folder's"* — the own-PIN box took
   the folder PIN as its first entry, the confirm box mismatched and nothing landed — rather than an entry
   sealed under a PIN the folder does not use; the guarantee asserted is the same (one box, the folder's).
9. **A declined folder is said per share as well as in the batch tally** (`Left in "Shared with me" — the folder
   "X" asks for a PIN on every entry in it, and none was given.`); `ShareLanding` stays two-valued.
10. **The folder chain of an update.** *Update it* writes the share's missing folders only after the question
    and the own PIN (it used to be the very first write); *Keep both* writes them only after the folder's
    decision.
11. **B7's §9.1 test was strengthened during its break-it**: with `pinFor` planted to answer `NO_PIN` it stayed
    green, because `applyCreatePin`'s sweep sealed the entry afterwards; it now asserts the write log never saw
    that entry's values in the clear, and goes red under the plant.
12. **Help:** one new paragraph per language after the protected-folder paragraph (*"What arrives in such a
    folder is asked the same"*), naming accept and both imports and the one-question rule.
