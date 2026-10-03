# PLAN — a waiting rotated value is used at the click and announced at every door

> Status: **partly built, 2026-10-03 — W1, W3, W5 and W6 are in (`1bceeabb`, `ac19cdcd`, `e0e65b58`,
> `bf3a6c3b`) with W4's docs, the owner's three follow-ups (§10.7) and the code round's two fixes (§10.8, the
> round passed: proceed, 4 of 4) the security review's three fixes (§10.9) and the third code round's (§10.10); W2 waits on the sibling plan's B1;
> the promotion is open (§10 records what was built differently).** Planned 2026-10-02. Scope: `src_vs_code/src` — `pinClick.ts`,
> `pinPrompt.ts` (one half of `admitted` extracted), `shareInbox.ts` (one line, after the extraction its sibling
> plan owns), `rotationQuarantine.ts` (one index-only read exported), `rotationStore.ts` and
> `rotationWaiting.ts` (wording), and their tests. Extension only; no format, contract or server change.
>
> The open tail of [PLAN_rotation_quarantine.md](../research/PLAN_rotation_quarantine.md) (its status line and
> §5.1). Related: [module_extension.md](../research/module_extension.md) §*The entry PIN keeps its promise*
> (the rotation paragraphs), [PLAN_pin_folder_asks_on_accept_and_import.md](../research/PLAN_pin_folder_asks_on_accept_and_import.md)
> (owns the `shareInbox.ts` extraction, §6).

All `file:line` references are to `src_vs_code/src/` and were read on `main` at `95a4f58f` on 2026-10-02.

## 1. The symptom

The rotation-quarantine plan shipped with two known limits, recorded in its status line:

1. **A click on an UNPROTECTED entry with a waiting rotated value uses the old value**, until the sweep
   releases it — nothing is lost, but the click hands a password the far side no longer accepts.
2. **The share inbox's door releases a waiting value without saying so** — every other door says *"The new
   password of "X" from <time> is now stored, sealed under its PIN."*

The owner, about both: *"главное как-то отобразить это"* — the person must SEE them.

### What the code says (verified)

- **Why (1) happens.** `clickOpener` skips the door when the entry has no mark and the value read is not
  sealed (`pinClick.ts:53-54`, `needsDoor` `:77-79`) — deliberately, because the door reads every slot to
  find there is nothing to ask (`:24-25`). The release lives in the door (`pinAdmission.ts:42-59`, `released`
  `:68-70`), so a click that skips it never releases, and reads the slot as stored.
- **When an unprotected entry has a hold at all.** (a) The rotation's unattended store failed for ANY reason —
  `heldOrHanded` holds on every error, not only the PIN refusal (`rotationStore.ts:49-56`, `:71-89`) — so a
  keychain failure on a plain entry leaves a hold beside it; (b) the entry was unprotected by a sync — released
  right after the pull (`extension.ts:289`) — or by another window's *Remove PIN Protection…*, which releases
  itself (`pinCommands.ts:174`). What finishes (a), and any release that failed, is the sweeper's tick
  (`ephemeralSweeper.ts:55` `TICK_MS = 60_000`, `:87`, `:159-165`) — hence "≤60 s".
- **What the person sees today.** The tree row says `rotated password waiting` (or `rotated connection string
  waiting`) for every entry with a held item, protected or not (`treeDataProvider.ts:655-658` →
  `rotationWaiting.waitingHint` `:36-45`, from `waitingKeys`, `rotationQuarantine.ts:543-551`) — and its
  tooltip says *"open the entry and enter its PIN to store it"* (`rotationWaiting.ts:43`), which is wrong for an
  entry with no PIN. The modal at the hold says *"was protected with a PIN while that ran"*
  (`rotationStore.ts:137-143`) even when the hold came from a keychain failure on an unprotected entry —
  `whyNotStored` (`:107-111`) already tells the two apart, but `waitingNotice` (`:130-135`) does not use it.
- **Why (2) happens.** `payloadsFor` calls `admit` directly (`shareInbox.ts:239-245`) — the only door outside
  `pinPrompt.ts` that does — and drops what `admit` answered: the `released` slots are never said, and a
  `conflict` is never asked, so the payload is built from the stored value and the hold waits on. Every other
  door goes through `admitted` (`pinPrompt.ts:135-153`), whose `settleRelease` (`rotationWaiting.ts:69-78`)
  says it (`sayReleased` `:87-91`) and asks the conflict.

## 2. The goal

1. **Remove limit (1), not merely show it:** a click on an unprotected entry that has a waiting value stores
   it first and uses it — said in the words every door uses. The click on every other unprotected entry costs
   what it costs today.
2. The share door says what it released and asks what it could not, like every door.
3. What the person reads about a waiting value is true of THIS entry: no PIN named where there is none.
4. Nothing lost on any failure; no lease across any box or modal.

## 3. Design

### 3.1 Limit (1) — the click takes the door when, and only when, something waits

Two candidates were weighed against the code:

- *The suggested shape:* the click calls `releaseHeld(…, UNATTENDED)` (`rotationQuarantine.ts:288`, `:305-315`)
  before reading, as the sweep does. Safe — `UNATTENDED` refuses anything protected — but silent, and a
  CONFLICT (the slot changed after the rotation) stays unresolved for good: the sweep counts it as nothing
  released and retries every tick (`:510-521`), and no door ever asks, because an unprotected click never
  reaches one.
- **Chosen: the click takes the door.** `needsDoor` gains one question — *does the index list this entry?* —
  answered by a new `rotationQuarantine.isWaiting(storage, a, e)`: the local index alone (`listed()`,
  `:91-100`, a memento read — no keychain `get`), exported from the module so the boundary scan
  (`test/rotationQuarantineBoundary.test.ts:24-30`) still finds the index named in one file. A listed entry
  goes down the path a protected one already takes: `beforeTheDoor` (`:451-458`) → `admitted`
  (`pinPrompt.ts:135-153`) → `admit`'s unlocked branch, which already releases (`pinAdmission.ts:48-52`) →
  `rereadAfter` (`rotationQuarantine.ts:468-473`), so the click opens the released slot.

Why it is the same write as the sweep's: for an entry with no mark and no sealed slot, the door's proof
`AT_THE_DOOR` → `sealingForUpdate` answers `plainOver(false)` (`sealingAtWrite.ts:180-195`, `:104-106`), and
`UNATTENDED` → `unattendedSealing` answers the same `plainOver(false)` (`:209-215`): the plain writer,
re-checked under the lease (`entryWriter.ts:159-166`), refusing with `ProtectedMeanwhile` if the entry was
protected meanwhile. What the door adds is exactly what the owner asked for: `settleRelease` says *"The new
password of "X" from <time> is now stored."* (`rotationWaiting.ts:94-97` — no "sealed" for a plain slot) and
asks a conflict. **A PIN box appears only for a SEALED slot:** `admit` asks only when a slot is locked
(`pinAdmission.ts:48`) — so an entry with no mark and nothing sealed is never asked, while an entry whose mark was
lost and that still holds a sealed slot is, which is right by R3 (corrected at the security review, §10.9).
**No lease across a modal:** the conflict modal is asked after the release returned. **Nothing lost:** a
release that fails keeps the item (`rotationQuarantine.ts:305-315`); the click then uses the stored value,
and the row keeps saying the value waits.

Cost: an unlisted entry — every entry, almost always — pays one memento read and nothing else; the reason
`pinClick.ts:24-25` gives for skipping the door holds for it. A listed one pays the door's slot walk, once.

### 3.2 Limit (2) — the share door goes past the door like every other

`admitted` does two things after `admit` answers `in`: `healKeptVersions` and `settleRelease`
(`pinPrompt.ts:150-152`). That half is extracted as `pastTheDoor(storage, a, e, name, admission)` in
`pinPrompt.ts` — reuse by extracting the shared half, not a second copy — and `admitted` calls it. `payloadsFor`
keeps its own `admit` and its own decline wording (`reportAdmission`, `shareInbox.ts:249-255`, which says why
a protected entry cannot be shared without its PIN — `admitted` would lose that) and calls `pastTheDoor` on
`in`. The payload is then built from the released value, and a conflict settled for the rotated one is
shared as the rotated one (`buildSharePayload` reads after the call, `:245`). The share door also gains the
background heal of kept versions every other door runs — a deliberate consequence of one door.

`shareInbox.ts` is at 798 of eslint's 800 (`eslint.config.mjs:30`); the call is one line and the name joins
the existing `pinPrompt` import. The room comes from the sibling plan's extraction (§6).

### 3.3 The words match the entry

- **The hold's modal** (`rotationStore.ts:130-143`) takes the store's error and says `whyNotStored`'s reason
  (`:107-111`) — the PIN only when the PIN was the reason. For an unprotected entry it adds *"It is stored the
  next time you use "X", or within a minute"* and its button is *Store it now* — `admitEntry` on a plain
  entry already releases without asking anything (`:133`).
- **The row's tooltip** (`rotationWaiting.ts:43`): an entry without the mark reads *"…it is stored the next
  time you use the entry, or within a minute"*; a marked one keeps *"open the entry and enter its PIN"*. The
  description `rotated password waiting` stays as it is — it is already true for both.

### 3.4 Honest limits that remain (said, not fixed)

- An AGENT's use of an unprotected entry with a waiting value releases it first, unattended (§9.1, W5); a
  CONFLICT is not resolved automatically — the agent uses what is stored and the person's next door asks.
- A release that fails (a keychain error, `ReleaseOvertaken`) leaves the click on the stored value; the row
  keeps showing the wait, and the next door or tick retries.
- The sweeper's own release is said to the person too (§9.2, W6), not only in the log.

## 4. Build order — small stories, each RED first

Built on `main`; every story: the test named after the guarantee, RED against the unfixed code with the real
symptom in its message, the fix, GREEN, the whole suite; a **break-it** recorded in the commit body. Over the
real `StorageManager` with the keychain read and write logs (`test/pinWorld.ts`) and the rotation worlds of
`test/rotationQuarantine.test.ts` (`doorWorld`, `clickWorld`, the Q5 unprotected world). New tests go to a new
`test/waitingRotationVisible.test.ts` (the existing file is 665 lines). Typecheck, lint, `npm test`, the plan
lifecycle check.

- [x] **W1 — a click on an unprotected entry with a waiting value uses the new one.** *(`1bceeabb`, 2026-10-03.)* `isWaiting`,
      `needsDoor`. RED: an unmarked entry with a plain password and a held newer one → *Copy Password*
      (`clickedSecret`) copies the OLD value (*"the click used the password the rotation replaced"*). GREEN: the
      new value is copied, the slot holds it plain, the item and its index entry are gone, the infos say
      *"…is now stored."* without "sealed", and no PIN box was raised. The same for a value read before the
      door (`clickOpener`, Connect/SSH path). A conflict (slot changed after the rotation) is ASKED at the
      click, and *Store the rotated one* is what the click uses. Cost guard: an unlisted unprotected entry →
      the keychain read log holds no `:rotationQuarantine` read and no slot beyond the one clicked. Break-it:
      `needsDoor` without the index question → red.
- [ ] **W2 — the share door says what it released.** *(NOT built on 2026-10-03: it waits on the sibling plan's B1,
      the `shareInbox.ts` extraction, which is being built in another worktree; `shareInbox.ts` was not touched.)*
      Lands after the sibling's B1 (§6). `pastTheDoor`.
      RED (share world): sharing a protected entry with a waiting value → the payload carries the new value
      but the infos hold no *"is now stored, sealed under its PIN"*; with a conflict → no question, and the
      payload carries the current value while the hold waits. GREEN: the sentence said; the conflict asked;
      *Store the rotated one* → the payload carries the rotated value. A declined PIN still says the share's
      own sentence. Break-it: drop the `pastTheDoor` call → red.
- [x] **W3 — the words match the entry.** *(`ac19cdcd`, 2026-10-03.)* RED: a hold after a keychain failure on an unprotected entry → the
      modal says *"was protected with a PIN"*; its row tooltip says *"enter its PIN"*. GREEN: the modal names
      the store's failure, no PIN, and *"within a minute"*; the tooltip of an unmarked entry names no PIN, a
      marked one still does. Break-it: restore the fixed sentence → red.
- [x] **W5 — an agent's use of an unprotected entry stores a waiting value first** (§9.1). *(`e0e65b58`, 2026-10-03;
      the reader list differs — §10.2.)* Every automatic
      reader that resolves a stored secret for an agent (`automaticOpener` callers: env apply, `creds://`, the
      db query, the deploy key, ssh) asks `isWaiting` (index only) and, for a listed UNMARKED entry, runs
      `releaseHeld(…, UNATTENDED)` before reading — the plain writer re-checked under the lease, never a PIN,
      never a modal. RED: an agent's db query against an unprotected entry with a held newer connection string
      uses the OLD one. GREEN: the new one is used, stored plain, the hold gone. A conflict: nothing written,
      the agent uses the stored value, the hold waits. A marked entry: untouched (its door is the person's).
      Cost guard: an unlisted entry reads no `:rotationQuarantine` key. Break-it: skip the release → red.
- [x] **W6 — the sweep's release is said to the person** (§9.2). *(`bf3a6c3b`, 2026-10-03.)* The sweep's `releaseUnprotected` returns
      WHICH entries and slots it released, and the sweeper says each once through `rotationWaiting`'s words
      (*"The new password of "X" from <time> is now stored."*), not only in the log; a tick that released
      nothing says nothing. RED: a sweep releasing a held value → no info shown. Break-it: drop the say → red.
- [ ] **W4 — docs and promotion** (§7). *(The §7 docs are updated for W1/W3/W5/W6, 2026-10-03; the code round, W2's
      docs and the promotion are open.)* `review_code` over the diff, then `/promote-plan` with the
      deviations; the rotation-quarantine plan's open tail updated to point at the promoted record.

## 5. Test plan

| Guarantee | Where | How it is shown |
|---|---|---|
| The click uses the rotated value | `waitingRotationVisible.test.ts` | the value handed to the clipboard sink (W1) |
| The click asks no PIN and holds no lease across the conflict modal | same | box count; a second window's `runOrSkip` from inside the modal stub runs (W1) |
| Nothing lost | same | an injected release failure keeps the item, the click uses the stored value (W1) |
| An unlisted click costs nothing new | same | the keychain read log (W1) |
| Every door says it | same, share world | infos and the conflict modal at the share door (W2) |
| No PIN named where there is none | same, `rotationStore` stub-vscode tests | modal and tooltip text (W3) |
| Unchanged elsewhere | `rotationQuarantine.test.ts`, `pinClickPaths.test.ts`, the share suite | green without edits |

## 6. Boundary with the sibling plan

| Item | Built by | This plan's part |
|---|---|---|
| Extract `importShared` from `shareInbox.ts` (798 lines) | [PLAN_pin_folder_asks_on_accept_and_import.md](../research/PLAN_pin_folder_asks_on_accept_and_import.md) **B1** | W2 needs the room: it lands after B1 — or, if this plan is built first, lands B1 first exactly as written there, and that plan skips it |
| The share's sender-side door (`payloadsFor`) | **this plan, W2** | nothing there |

Disjoint otherwise: this plan touches the SENDING half of `shareInbox.ts`, the sibling the RECEIVING half.

## 7. Docs to update

- `research/module_extension.md` — the rotation paragraph *"The held value goes in at the next PIN"*: a click
  on an unprotected entry the index lists takes the door; the share door says and asks like every door; the
  `pinClick.ts` and `rotationWaiting.ts` rows.
- `research/module_tests.md` §*A PIN-protected entry keeps its promise* — `waitingRotationVisible.test.ts`.
- `research/PLAN_rotation_quarantine.md` — its open tail points here (done in this plan's commit, so the
  boundary is named on both sides); updated again at promotion.
- `src_vs_code/CHANGELOG.md` `[Unreleased]` — *Fixed:* a click on an entry whose rotated password was waiting
  used the old one; sharing an entry did not say the waiting value was stored; the waiting modal and row named a
  PIN on an entry without one.
- Help (`helpEn.ts` and the four translations): the waiting paragraph of the rotation section.

## 8. Definition of Done

- [ ] W1–W6 merged, each with its RED observation and break-it in the commit body.
- [x] An agent's use of an unprotected entry with a waiting value uses the new value (W5); the sweep's release
      is said to the person (W6).
- [x] A click on an unprotected entry with a waiting value uses the new value and says it was stored, with no
      PIN box — shown over the real storage; an unlisted entry's click reads nothing new.
- [ ] The share door says what it released and asks a conflict.
- [x] No sentence names a PIN for an entry without one.
- [ ] Typecheck, lint, `npm test`, plan lifecycle green; §7 docs updated; plan promoted with its deviations.

## 9. Decided (2026-10-02)

The owner's direction for both limits: *"главное как-то отобразить это"* — the person must see it.

1. **An agent's use of an unprotected entry with a waiting value releases it first, unattended** — exactly
   the store the rotation would have made (`releaseHeld` with the UNATTENDED proof, re-checked under the
   lease), one keychain `get` only for entries the local index lists. A conflict (the slot changed since the
   rotation) is NOT resolved automatically: the agent uses what is stored and the conflict waits for the
   person's next door, as today. Built as its own story, RED first.
2. **The sweep's release is said to the person**, once per release (*"The new password of "X" … is now
   stored."*), through the same words the door uses (`rotationWaiting`) — not only in the log.

## 10. What was built differently (recorded at build time, 2026-10-03)

Each built story's commit body carries its RED messages and its break-it. W2 is not built (§4). What differs from
the text above:

1. **W1 as planned.** `needsDoor` became async and asks `isWaiting` LAST, behind the mark and the sealed check,
   with a failed index read counted as "nothing waits". The lease guard is a modal stub that runs
   `storage.writes.runOrSkip` and races it against two seconds — `ran`, not `blocked behind the click`.
2. **W5's readers.** First built (`e0e65b58`) as three explicit calls — `agentUseActions.dbQueryAction`,
   `envApply.bindableFieldReading`, `sshCredential.passwordOf` — and **replaced by the code round (item 8.2)**
   with ONE automatic opener every automatic reader goes through, so the deploy key, config bodies, notes, TOTP
   and the SSH agent's startup sweep go through it too (they hold no rotation slot today; the release is a
   memento read for them). The release is `rotationQuarantine.releaseBeforeAutomaticUse`, which reuses the
   sweep's own `releaseIfUnprotected` rather than calling `releaseHeld(…, UNATTENDED)` bare: a marked or sealed
   entry is skipped before the slots are walked. **What a LISTED entry costs** (corrected at the security review): an
   unlisted one reads nothing from the keychain; a listed MARKED one reads the held item at the broker's release,
   then at the opener the item and each held slot's raw value (`beforeTheDoor`'s snapshot) and the item once more —
   the mark answers before any slot walk; a listed entry WITHOUT the mark that holds a sealed slot also walks every
   slot (`lockedSlotCount`). Nothing is written for either. The plan asked for no message here; the owner's
   follow-up (item 7) added one.
3. **W6's saying is injected.** `rotationWaiting.releaseAndSay` releases and says each value;
   `EphemeralSweeper.releaseWaiting` is typed to the list and stays free of `vscode` at run time (its own suite
   loads it without a stub), and `extension.ts` wires `releaseAndSay` in — line-neutral at 1037 by merging its
   two imports from `entityViewerCommands`. The plan scoped W6 to the sweep; the release right after a pulled
   sync was made to speak by the owner's follow-up (item 7).
4. **W3's branch is the store's error, not the entry's mark.** `UnattendedRefusal` keeps the PIN sentence and the
   *Store it now (asks for the PIN)* button; any other failure names itself (`whyNotStored`), says *"It is stored
   the next time you use "X", or within a minute"*, and offers *Store it now*.
5. **Help:** one sentence added to the waiting paragraph of the PIN article in all five languages — an entry
   without a PIN can have a value waiting; its next use (a click or an agent's) stores it first, else the sweep
   within a minute, and each time the person is told. Pinned per language by item 7's coverage test.
6. **Declared mechanical test edits:** `rotationWaiting.test.ts` — the row test's db entry carries the mark, so it
   still asserts the PIN tooltip for a protected entry (W3); `rotationQuarantine.test.ts` — three
   `assert.equal(released, N)` read `released.length`, and the sweeper test's stub resolves two `ReleasedValue`
   items instead of the number 2 (W6). No other existing assertion changed.
7. **The owner's follow-ups (2026-10-03, "the person must SEE it")** — beyond the plan's text, each red-first with
   its break-it in the commit body:
   1. **The release right after a pulled sync is said** (`a65ab0e5`): the sync's post-pull callback in
      `extension.ts` calls `rotationWaiting.releaseAndSay` instead of the silent `releaseUnprotected`. The test
      reads that callback's release out of `extension.ts` (the `agentDoors.test.ts` precedent — the callback is a
      lambda inside `activate`) and runs it, with a positive control on the sweeper's wiring.
   2. **An agent's use that stores a waiting value is said** (`408a6305`): `releaseBeforeAutomaticUse` hands what
      it stored to a port, `rotationQuarantine.announceReleasesWith`, which `extension.ts` sets once to
      `rotationWaiting.sayReleasedValues` — an info message, never a modal, never awaited, so the agent's call is
      not held (per storage since item 8.1). Injected because the module and the readers stay free of `vscode`. A
      conflict, or nothing waiting, says nothing. `extension.ts` stays at 1037 by merging its two `corpPolicy`
      imports.
   3. **Every help language pins the sentence** (`37b150ed`): `rotationHelpCoverage.test.ts` checks, per
      `HELP_LANGUAGES`, the sentence's opening and its "you are told" in that language; a language with no pinned
      fragments fails. Red first against `helpDe.ts` with the sentence removed.
8. **The coai code round (2026-10-03: proceed, 4 of 4; two Major findings, both accepted)** — each red-first with
   its break-it in the commit body:
   1. **No module-global hook** (`d1069b67`). Item 7.2's announcer lived in a module-level variable of
      `rotationQuarantine.ts`, shared by every storage, test and run in one module graph. It now lives on the
      storage's own `QuarantineStore` (`announce` / `announceWith`, a closure in `quarantineStore`, saying nothing
      until set); `announceReleasesWith(storage, say)` sets it on THAT storage, and `extension.ts` passes the
      storage it built. RED: two `StorageManager`s from one module graph (`pinWorld.memoryStorages`, new) — the
      first's release was heard through the second's words.
   2. **The release by construction** (`b4cdb9f5`). New `automaticRead.automaticOpenerFor(storage, accountId)`:
      the index first, then the release and a re-read of a value read before it, then
      `secretOpener.automaticOpener`'s decision. Every automatic reader opens through it; the three explicit
      calls and `sshCredential.waitingStoredFirst` are gone; the bare `automaticOpener` is named only in
      `secretOpener.ts` and `automaticRead.ts`, and a scan (negative fixture, positive control) fails on any other
      use. **Not inside `automaticOpener` itself:** it is `(owner, stored)` — no storage, no account — and
      `rotationQuarantine.ts` already imports `secretOpener.ts`, so the release there would be an import cycle; a
      factory beside it plus the scan gives the same guarantee. RED: a new automatic reader written in the test,
      through the common opener, was handed the replaced password; the scan listed the seven readers.
9. **The security review (2026-10-03, after the second code round passed: proceed, 4 of 4, no findings)** — three
   findings, each red-first with its break-it in the commit body:
   1. **MEDIUM — the broker releases before the mask table** (`f31e18b6`). The table is read before the action and a
      non-mutating action is delivered with it; since W5 the action could release the new value mid-run and print it
      unmasked. A new broker hook, `releaseWaiting` (`rotationQuarantine.releaseBeforeAutomaticUse`), runs in
      `CredsAgentServer.handle` before `tableOrFail`; the opener's release stays the backstop. RED over the real broker,
      masker and storage: the printed new password came back unmasked.
   2. **LOW — the rotation fingerprints what it really replaces** (`d22f00b4`). `RotateDeps.current` read the slot raw;
      `rotationStore.rotationCurrent` releases first. RED: a rotation whose own store failed left a hold whose `was` was
      the pre-release value — a spurious conflict at the next release. `extension.ts` shrank to 1034 and the ratchet
      baseline is locked there.
   3. **LOW — a re-read by slot, not by text** (`114a7876`). `rereadAfter` re-read any value equal to what a released
      slot held; `SecretOpener` (and `AfterTheDoor`) now take the slot the value was read from, and only that slot is
      re-read. RED: `creds://…/notes` equal to the old password answered the new password, and a click on such a
      config body was handed it — the click door shared the defect and is fixed with it.
   Corrected wording: §3.1's "no PIN box can appear" (a mark-lost entry with a sealed slot IS asked, by R3) and
   §10.2's cost of a listed entry.
10. **The third coai code round (2026-10-03: proceed, 4 of 4, findings accepted; rejected: removing the slot
    altogether, and moving the release into `maskEntriesFor`)** — each red-first where it is behaviour, with its
    break-it in the commit body:
    1. **No fixture cast** (`11a9685c`, findings 0+1): `waitingRotationVisible.test.ts` builds its entries with a
       typed `entry()` factory, replaces the storage's own methods instead of double casts, gives the sweeper a real
       `Memento` class, and looks the post-pull release up in a typed table. No assertion changed.
    2. **An EMPTY slot is re-read too** (`f4333116`, finding 4): `rereadAfter` required `value !== undefined`, so a
       rotation that replaced nothing left Copy Password copying nothing after the door had stored the value. It now
       compares `before[slot] === value` for a slot the snapshot took, `undefined` included. RED: the click copied
       nothing; the automatic reader got nothing.
    3. **The slot is REQUIRED** (`1d3a524a`, finding 5): `SecretOpener`, `AfterTheDoor`, `clickedSecret` and
       `clickedValue` take `slot: RotationSlot | undefined`; every caller states its slot or `undefined`. The
       behavioural path the finding named (`creds://…/password` through `entityFieldReading`) already named
       `'password'` and was not red; the RED is the compile-fail harness — two fixtures in
       `test/fixtures/typed/` (an opener and a click without the slot) compiled, and must be TS2554, with a
       positive control that states `undefined` and `'password'`.
