# PLAN — a waiting rotated value is used at the click and announced at every door

> Status: **plan only, nothing implemented yet, 2026-10-02.** Scope: `src_vs_code/src` — `pinClick.ts`,
> `pinPrompt.ts` (one half of `admitted` extracted), `shareInbox.ts` (one line, after the extraction its sibling
> plan owns), `rotationQuarantine.ts` (one index-only read exported), `rotationStore.ts` and
> `rotationWaiting.ts` (wording), and their tests. Extension only; no format, contract or server change.
>
> The open tail of [PLAN_rotation_quarantine.md](../research/PLAN_rotation_quarantine.md) (its status line and
> §5.1). Related: [module_extension.md](../research/module_extension.md) §*The entry PIN keeps its promise*
> (the rotation paragraphs), [PLAN_pin_folder_asks_on_accept_and_import.md](PLAN_pin_folder_asks_on_accept_and_import.md)
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
asks a conflict. **No PIN box can appear:** `admit` asks only when a slot is locked (`pinAdmission.ts:48`).
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

- [ ] **W1 — a click on an unprotected entry with a waiting value uses the new one.** `isWaiting`,
      `needsDoor`. RED: an unmarked entry with a plain password and a held newer one → *Copy Password*
      (`clickedSecret`) copies the OLD value (*"the click used the password the rotation replaced"*). GREEN: the
      new value is copied, the slot holds it plain, the item and its index entry are gone, the infos say
      *"…is now stored."* without "sealed", and no PIN box was raised. The same for a value read before the
      door (`clickOpener`, Connect/SSH path). A conflict (slot changed after the rotation) is ASKED at the
      click, and *Store the rotated one* is what the click uses. Cost guard: an unlisted unprotected entry →
      the keychain read log holds no `:rotationQuarantine` read and no slot beyond the one clicked. Break-it:
      `needsDoor` without the index question → red.
- [ ] **W2 — the share door says what it released.** Lands after the sibling's B1 (§6). `pastTheDoor`.
      RED (share world): sharing a protected entry with a waiting value → the payload carries the new value
      but the infos hold no *"is now stored, sealed under its PIN"*; with a conflict → no question, and the
      payload carries the current value while the hold waits. GREEN: the sentence said; the conflict asked;
      *Store the rotated one* → the payload carries the rotated value. A declined PIN still says the share's
      own sentence. Break-it: drop the `pastTheDoor` call → red.
- [ ] **W3 — the words match the entry.** RED: a hold after a keychain failure on an unprotected entry → the
      modal says *"was protected with a PIN"*; its row tooltip says *"enter its PIN"*. GREEN: the modal names
      the store's failure, no PIN, and *"within a minute"*; the tooltip of an unmarked entry names no PIN, a
      marked one still does. Break-it: restore the fixed sentence → red.
- [ ] **W5 — an agent's use of an unprotected entry stores a waiting value first** (§9.1). Every automatic
      reader that resolves a stored secret for an agent (`automaticOpener` callers: env apply, `creds://`, the
      db query, the deploy key, ssh) asks `isWaiting` (index only) and, for a listed UNMARKED entry, runs
      `releaseHeld(…, UNATTENDED)` before reading — the plain writer re-checked under the lease, never a PIN,
      never a modal. RED: an agent's db query against an unprotected entry with a held newer connection string
      uses the OLD one. GREEN: the new one is used, stored plain, the hold gone. A conflict: nothing written,
      the agent uses the stored value, the hold waits. A marked entry: untouched (its door is the person's).
      Cost guard: an unlisted entry reads no `:rotationQuarantine` key. Break-it: skip the release → red.
- [ ] **W6 — the sweep's release is said to the person** (§9.2). The sweep's `releaseUnprotected` returns
      WHICH entries and slots it released, and the sweeper says each once through `rotationWaiting`'s words
      (*"The new password of "X" from <time> is now stored."*), not only in the log; a tick that released
      nothing says nothing. RED: a sweep releasing a held value → no info shown. Break-it: drop the say → red.
- [ ] **W4 — docs and promotion** (§7). `review_code` over the diff, then `/promote-plan` with the
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
| Extract `importShared` from `shareInbox.ts` (798 lines) | [PLAN_pin_folder_asks_on_accept_and_import.md](PLAN_pin_folder_asks_on_accept_and_import.md) **B1** | W2 needs the room: it lands after B1 — or, if this plan is built first, lands B1 first exactly as written there, and that plan skips it |
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
- [ ] An agent's use of an unprotected entry with a waiting value uses the new value (W5); the sweep's release
      is said to the person (W6).
- [ ] A click on an unprotected entry with a waiting value uses the new value and says it was stored, with no
      PIN box — shown over the real storage; an unlisted entry's click reads nothing new.
- [ ] The share door says what it released and asks a conflict.
- [ ] No sentence names a PIN for an entry without one.
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
