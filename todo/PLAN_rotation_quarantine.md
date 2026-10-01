# PLAN — a rotated value the vault could not store waits in quarantine, not in the clipboard

> Status: **plan only, nothing implemented yet, 2026-10-01.** Scope: the rotation's store
> (`rotationStore.ts`, `rotateAction.ts`), a new per-entry quarantine item in the OS keychain
> (`rotationQuarantine.ts`, `secretKeys.ts`), its release at the entry-PIN door (`pinAdmission.ts`,
> `pinPrompt.ts`), *Remove PIN Protection…* (`pinCommands.ts`), the startup sweep (`ephemeralSweeper.ts`),
> the tree hint (`entityFlags.ts`, `treeDataProvider.ts`), the `creds_rotate` answer and description.
>
> Related: [PLAN_typed_stored_secrets.md](../research/PLAN_typed_stored_secrets.md) (ships in the SAME release, after
> its E3), [PLAN_entry_pin_keeps_its_promise.md](../research/PLAN_entry_pin_keeps_its_promise.md) (R3),
> [module_extension.md](../research/module_extension.md) §*The entry PIN keeps its promise*,
> [module_tests.md](../research/module_tests.md) §*A PIN-protected entry keeps its promise*.

## 1. The symptom

A rotation changes the password on the far side FIRST and stores it after (`rotateAction.ts:26-30`,
`:131-153`). Since typed-secrets E2 (#177) the store is unattended (`entryWriter.writeUnattended`,
`entryWriter.ts:90-103`), so an entry that became PIN-protected between `prepare` (`rotateAction.ts:161-178`,
whose `protectedSlot` `:217-228` passed) and the store is refused — `UnattendedRefusal` before the write,
or `ProtectedMeanwhile` from the plain writer's re-check under the lease (`entryWriter.ts:111-134`,
`:146-152`). Nothing automatic may hold a PIN, and that refusal is right.

What happens next is the problem. `rotationStore.handedToPerson` (`rotationStore.ts:54-61`) asks the person
to *Store it (asks for the entry's PIN)* (`:67-81`); declined, dismissed or failed, it offers *Copy the new
password* (`:86-93`) and the agent hears `rotated: true, stored: false` (`rotateAction.ts:297-298`). So the
ONLY copy of a working password lives in process memory until a person answers a modal, and the last resort
puts it on the clipboard, where a clipboard-history tool keeps it whatever `copySecret`'s auto-clear
(`secretClipboard.ts:92-98`) does. A person who is away, or who presses Escape twice, loses access.

**Found while verifying (not in the owner's statement, and fixed first — §5 Q1):** the new value is not
masked out of the rotation's own answer in either E2 path. `rotateAction.ts:32-37` says *"by the time the
response is masked the new value is stored, so it is in the mask table"*; the post-run table is read
through `maskEntries.ts:80-89`, which passes every stored value through `secretOpener.unsealedText`
(`secretOpener.ts:117-119`) — a SEALED value answers nothing (`maskEntries.ts:115-123`). Stored under the
PIN, the new value is sealed; copied instead, it is stored nowhere. Either way `brokerResponse.answered`
(`brokerResponse.ts:225-231`, the refresh documented at `:133-140`) masks with a table that does not hold
it, and a statement composed to echo its input hands the new secret to the agent.

## 2. The goal

1. A value the far side accepted is never lost because a person was not there: it is kept on this machine,
   outside the entry, from the moment the store is refused.
2. It is put into the entry, sealed under the PIN, the next time that PIN is entered — by the door that
   already heals a protected entry, not by a new mechanism.
3. It never leaves the machine and never reaches an agent, and the person can see that it is waiting.
4. The clipboard stays only as the last resort, never automatic, and says plainly what a clipboard
   history does.

## 3. Decisions the owner made

Recorded as given (2026-10-01): **losing access is unacceptable; "show nothing" is excluded.** Keep the
clipboard fallback, but with an EXPLICIT warning about clipboard-manager risks — a clipboard history tool
keeps the value regardless of auto-clear. And ideally, store the value in a temporary QUARANTINE slot of the
entry until the next time the PIN is entered.

Accepted trade-off that follows from it: the quarantined value is protected by the OS keychain only — the
same protection an UNPROTECTED entry's password has — for the time between the refused store and the next
PIN. It is not sealed: sealing needs the PIN, and nothing automatic has it.

## 4. Design

### 4.1 Where the value lives — outside the entry's slots (R3 holds)

R3 (`research/PLAN_entry_pin_keeps_its_promise.md:135`; `research/module_extension.md:1353`) says a protected
ENTRY is never written in the clear. The quarantine therefore is not a slot:

- **One keychain item per entry**, `rotationQuarantineSecretKey(a, e)` = `${a}_${keyPart(e)}:rotationQuarantine`
  — built by `suffixed` (`secretKeys.ts:44-46`), so `keyPart`'s escape covers it. Its value is a JSON record
  `{ v: 1, slots: { password?: Held, dbConnection?: Held } }`, `Held = { value, at, was }`: the new stored
  form, the rotation's UTC epoch ms, and `was` = SHA-256 hex of the slot's text the rotation replaced (the
  value `RotateDeps.current` read in `draw`, `rotateAction.ts:262`). Keyed by slot so a password hold and a
  connection-string hold never overwrite each other.
- **NOT in `SECRET_SLOTS`** (`entitySlots.ts:93-182`): so `protectEntity`/`unprotectEntity`, the door's
  `firstLockedStored` (`pinAdmission.ts:101-113`), `lockedSlotCount`, the revision snapshot
  (`revisionSnapshot.ts:35-41`) and Restore never see it — an entry is not "half protected" because a hold
  exists, and the hold never enters history.
- **NOT in `secretMaps.SECRET_KINDS`** (`secretMaps.ts:48-71`): so the sync and backup snapshot
  (`storageManager.ts:908`, `readSecretMaps` → `readKindsInto` `secretMaps.ts:101-113`), a bundle apply
  (`storeSecretMaps` `:116-122`, `dropAbsentKinds` `:125-136` — which therefore never deletes it either) and
  import never carry it. The keychain cannot be listed (`orphanSweep.ts:13-15`), so a key no list names is
  carried by nothing.
- **IN `ENTITY_KEY_BUILDERS`** (`secretKeys.ts:137-152`): so everything that DELETES an entry's keys deletes
  it — `forgetEntitySecrets` (`storageManager.ts:373-380`) for a deletion (`deleteNodeRecursive` `:622-638`),
  account removal (`wipeAccountData` `:340-347`, `pendingCleanup`'s `forgetSecrets` `:336`), the undo of a
  failed create (`treeMutationCommands.ts:312`, `mcpHooks.ts:83`) and the orphan sweep
  (`orphanSweep.ts:83-101`).

**Typed (E3).** The implementation is built on `main` AFTER `feat/typed-secrets-e3` merges. `Held.value` is
a `StoredSecret` (`storedSecret.ts`), minted by the quarantine's own parse (`stored()`), always the plain
stored form (`secretEnvelope.plainSecret(value, false)`), serialised with `carried()`. Release reads it with
`readSecret`: anything but an unwoven `value` (`locked`, `corrupt`) refuses the release and keeps the item —
it is never written anywhere. `rotationQuarantine.ts` joins `storedSecretFunnel.test.ts`'s `ALLOWED` list
with the reason *"the quarantine's parse boundary"*. Writes use E2's `Sealing` + `entryWriter.writerFor`,
which E3 leaves as they are; the item's own keychain verbs are a separate narrow port, not the slot setters
E3 types.

**Who reaches the item.** A `QuarantineStore` (`read`, `put`, `drop`, all three under `storage.writes` —
the cross-window lease, `storageManager.ts:105`) exposed as one readonly field of `StorageManager`. Both
ratcheted files are at their baselines (`src_vs_code/.size-baseline.json`: `storageManager.ts` 1015,
`extension.ts` 1037), so the field and every wiring line are paid for in the same commit. A boundary scan
(Q2) fails when anything but `rotationQuarantine.ts`, `secretKeys.ts` and that one field references the key
builder or the store.

*Naming:* `idQuarantine.ts` already exists (renaming unsafe ids on import). The new module is
`rotationQuarantine.ts` and the person-facing word is *"waiting"*, never "quarantine".

### 4.2 A local index — what the tree and the sweep read

The keychain cannot be listed, and `getTreeItem` cannot await (`treeDataProvider.ts:123-161`). A LOCAL,
never-synced globalState key `credSshManager.rotationQuarantine` holds `[accountId, entityId]` pairs (ids
only), the precedent `PENDING_KEY` (`storageManager.ts:52`, `pendingCleanup.ts:1-25`) sets. Order: **index
first, item second** at a hold; **item first, index second** at a release. The only torn state is an index
entry without an item, which is harmless and self-healing: the flags walk and the sweep `get` the item for
listed ids only, and drop an entry whose item (or node) is gone. The door does not use the index — it reads
the item directly (one `get` beside the up-to-ten `firstLockedStored` already makes).

### 4.3 The rotation's store (`rotationStore.ts`)

1. Unattended write as today (`rotationStore.ts:41-47`). Landed → **drop any hold of that slot** (a newer
   value the far side holds supersedes it; without this the next door would overwrite the newer value with
   the older). Answer `stored`.
2. Refused (`UnattendedRefusal`) or failed for another reason → **write the hold** (index, then item, under
   the lease; last value wins — a second hold of the same slot overwrites the first, because the far side
   holds the latest). Landed → answer **`quarantined`** at once and show the modal WITHOUT awaiting it:
   *"The password of "X" WAS changed on the far side. "X" was protected with a PIN while that ran, so the
   new password is being kept on this machine, outside the entry, until its PIN is entered — then it is
   stored, sealed. Until then the entry still holds the old password, which no longer works."*
   Buttons: **Store it now (asks for the PIN)** → `admitEntry` (the door, §4.4), and **Later**. No copy
   button: the value is safe, and after the PIN the normal *Copy Password* exists.
3. The hold write itself failed → today's E2 chain, unchanged in shape (*Store it* under the PIN, else the
   copy offer), with two changes: the copy modal carries the clipboard warning (§4.7), and it stays awaited,
   because here the value exists only in memory. Answer `stored: false` as today.

`RotateDeps.store` (`rotateAction.ts:61`) takes `was` and resolves `'stored' | 'quarantined'` (or rejects
`RotationNotStored` as today, `:318-323`). The agent body (`:297-298`) gains `stored: "quarantined"` with a
sentence: *"The far side changed. The entry was protected with a PIN while it ran, so the new value is kept
on the person's machine, outside the entry, until they next enter its PIN — then it is stored. Do not retry
the rotation; the old value no longer works."* `stored: false` keeps its meaning (`:326-327`). The journal
word (`describeRotation` `:101-108`) is `rotated, quarantined` beside `rotated, not stored` (`:330`); the MCP
log's rotation filter is action-based (`mcpLogRows.ts:91-93`) and needs nothing. **Why a string and not a
second boolean:** `stored` answers "where is the value now" — in the entry, held beside it, or nowhere — and
three answers in one field cannot contradict each other the way `stored: false, held: true` can.

**Why the agent no longer waits for the person when the hold landed:** the value is safe, so nothing the
person answers changes what the agent should do; a modal left open would otherwise hold a broker call open
for minutes.

### 4.4 Release at the door — `pinAdmission.admit`

`admit` (`pinAdmission.ts:36-52`) is the one door every person-driven read of a protected entry passes:
`admitEntry` (`pinPrompt.ts:118-135`) for View, Edit (`entityEditCommands.ts:99`), every click
(`pinClick.ts:44`, `:66-68`), Export (`commands/exportCommand.ts:182`), Open Site, the kept-version door
(`revisionDoor.ts:43`), a share's update (`shareUpdateSeal.ts:120`), and the share inbox
(`shareInbox.ts:240`). Release is added there, best-effort like `healProtected` (`:71-77`) and `clearMark`
(`:181-192`) — a failed release never becomes a failure to open:

- **Locked path:** after `healProtected`, `releaseHeld(storage, a, e, gate)`.
- **Unlocked path:** after `repairFalseMark` (`:42-46`), the same call — it takes the plain road (below).

`releaseHeld`, per held slot, in this order — a crash at any point loses nothing:

1. `read` the item; nothing held → return (the common case: one `get`).
2. Open the live slot with the silent `gate` (`openedText`, `pinAdmission.ts:122-133`; nothing is asked —
   the door just granted). Equal to the held value → an earlier release wrote it and died before step 5: go
   to 5.
3. Its SHA-256 differs from `was` → the slot changed after the rotation (another machine's Edit, a sync):
   **do not overwrite** — keep the item and report a conflict (§4.6).
4. The proof: `sealingAtWrite.sealingForUpdate(storage, a, e, true, releaseDoors)` (`sealingAtWrite.ts:180-195`)
   — reused, not re-written: its decision table is exactly the release's. `releaseDoors.door` answers the
   window's grant (`pinSession.grantedPin`) and asks nothing; `releaseDoors.firstPin` answers `undefined`.
   So: a sealed slot → `sealed` with the grant → the sealing writer (`entryWriter.ts:233-257`) seals in
   memory, outside the lease, and commits inside it (`:267-270`) — R3; no sealed slot and no mark → `plain`
   → the plain writer, re-checked under the lease (`:146-152`), refusing with `ProtectedMeanwhile` if the
   entry was protected since; marked over nothing → `stopped`, item kept. Write through
   `writerFor(storage, a, e, sealing, NOTHING_OPENED)` (`:66-71`) — `setPassword` / `setDbConnection`.
5. Under the lease: re-`read` the item; drop the slot from it only if its `at` is still the one released (a
   newer rotation that landed meanwhile stays). Empty record → `drop` the item.
6. Drop the index entry.

**History.** Nothing is recorded at release: the rotation already recorded the previous value BEFORE its
store attempt (`rotateAction.ts:291`), as the existing rotation rule says. The conflict path's *Use the
rotated one* (§4.6) records a snapshot first, as Restore and Edit do, because there the value being
replaced is NOT in history.

`Admission`'s `in` gains `released: readonly RotationSlot[]` and `conflicts: …`; `admitEntry` says
*"The new password of "X" from <time> is now stored, sealed under its PIN."* (time through
`requestTime.localRequestTimeLine`, `requestTime.ts:26`). No lease is held across any box: the door asked
before release began.

**Why the door and not a new trigger:** reuse-first, and the door is precisely "the next time the PIN is
entered". It also orders Edit correctly by construction — Edit admits first (`entityEditCommands.ts:99`),
so the form opens over the rotated value. A share or an export through the door likewise carries the
rotated value, released first; the item itself is never read by either.

### 4.5 When the entry is no longer protected

- **Remove PIN Protection…** does not pass through `admit`: it asks with `gate.ask` and calls
  `unprotectEntity` directly (`pinCommands.ts:131-138`, `removeOne` `:180-189`). `removeOne` calls
  `releaseHeld` after `markProtection(false)`: the entry is plain, so step 4 takes the plain writer.
  **Written plain, deliberately:** the person decided the entry's values are plain; the held value has
  exactly a plain slot's protection already (the OS keychain), so moving it in changes no exposure, while
  keeping it held would leave the entry on a dead password with no PIN left to trigger anything.
- **Unprotected by a sync or another window**, with no door yet: the startup sweep
  (`ephemeralSweeper.sweepOrphans`, `ephemeralSweeper.ts:133-146`) and the post-pull callback beside the
  flags refresh (`extension.ts:282-290`) release every indexed hold whose entry is now neither marked nor
  sealed — through the same `releaseHeld` with the plain proof, i.e. exactly the unattended store the
  rotation would have made. A protected entry's hold is left alone: nothing automatic holds a PIN.
- **Entry moved to Trash:** kept (Trash restores). **Permanently deleted, account removed:** deleted with
  the entry's other keys (§4.1). See open question 1.
- **Another window:** the item and the index are shared by every window of the profile; the lease
  serialises their writes; the release's step 2 and step 5 make two windows releasing at once idempotent.
- **Another machine:** never sees the item. It receives the rotated value, sealed, when this machine has
  released it and syncs — the modal says *on this machine*.

### 4.6 What the person sees

- **Tree:** `EntityFlagTarget` (`entityFlags.ts:32-44`) gains `waitingIds`, a fourth `FLAG_SETS` member
  (`:70-72`) filled by the walk (`:119-130`) from the index, verified by one `get` per LISTED id. The row's
  description (`treeDataProvider.ts:651-653`) appends `rotated password waiting` (or `rotated connection
  string waiting`) and the tooltip (`:654`) says how to store it: *open the entry and enter its PIN*.
- **Modal** at the rotation (§4.3), **info** at release (§4.4).
- **Conflict** (§4.4 step 3): a warning from `admitEntry`, *"A rotated password of "X" from <time> is
  waiting, but the stored password changed after it (in another window or by a sync). Which one does the
  far side accept?"* — **Store the rotated one** (snapshot to history, then release) / **Keep the current
  one** (a confirming modal, then drop the item). Dismissed → kept, asked at the next door.

### 4.7 The clipboard, last resort only

Offered only in §4.3 step 3, only after a click (`rotationStore.ts:88-91` — never automatic). The modal and
the post-copy message add: *"A clipboard history (Windows' Win+V, a clipboard manager, a remote-desktop
clipboard) keeps its own copy: the automatic clear empties the clipboard, not that history. Paste it into
the entry now, then delete it from the history."* `vscode.env.clipboard` takes plain text only, so the
extension cannot mark the content as excluded from clipboard history; the sentence is the whole mitigation,
and it says so rather than implying more.

### 4.8 The masker

**Decision: the rotation masks its own answer with the value it holds**, in `commit`
(`rotateAction.ts:283-299`): `stdout` is masked with `buildMaskTable` over the drawn secret and the stored
value before the body is returned, whatever the store's outcome. **`maskEntries` is not taught the
quarantine item.** Justified: the only output that can carry the new value is this rotation's own answer —
the value is in hand there; in storage it is sealed (unreadable to the masker by design, `maskEntries.ts:115-123`),
held, or nowhere. A later call cannot print it: while the entry is protected every automatic path refuses
it (`pinGate.pinFieldRefusal`), and once released into a plain entry it is in the ordinary table. Reading
the item on the masker's per-call path would add a keychain read to every call to buy nothing.

### 4.9 Growth (the planning rule's budget)

- **Item:** at most one per entry, ≤ 2 slots × ~300 B. Exists only for entries rotated WHILE being protected
  — a race, so expect zero or a handful per vault. Retired by release, supersession, entry deletion or
  account removal; a hold over a protected entry that is never opened again stays until it is, by design.
- **Index:** ids only, one pair per item; entries without an item are dropped by the walk and the sweep.
- **Interrupted:** every state between two steps above is either "item and slot both hold the value"
  (step 2 finishes it) or "index without item" (dropped). No in-flight state, so no timeout is needed.

### 4.10 Honest limits

- The OS-keychain-only protection of §3, for the time a hold waits.
- A crash between the far side accepting and the hold write (§4.3 step 2) still loses the value, exactly
  as today: closing it needs an intent written BEFORE the far side runs, which then needs a person to say
  whether an unconfirmed change happened. Not this plan.
- A hold over a protected entry whose PIN is forgotten is as unreachable as the entry; the tree keeps
  saying it is there.

## 5. Build order — small stories, each RED first

Built on `main` after typed-secrets E3 merges, one PR, the same release as that plan. Every story: the test
named after the guarantee, run RED against unfixed code with the real symptom in its message, the fix, GREEN,
the whole suite; a **break-it** check (revert the fix or plant the defect, see red, restore) recorded in the
commit body. Typecheck, lint, the size ratchet (line-neutral in the two baselined files), `npm test`.

- [ ] **Q1 — the rotation's answer never carries the new value.** *Independent of the rest; a candidate for
      a hotfix.* RED (`rotationNoLoss.test.ts`): a statement that echoes `{{creds:new}}`, the entry protected
      while it runs, the person stores it under the PIN → the agent's `stdout` contains `NEW_SECRET` today;
      the same for the copy path. Fix §4.8. Break-it: drop the mask in `commit` → red.
- [ ] **Q2 — the quarantine store and its exclusions.** `rotationQuarantineSecretKey`, `QuarantineStore`,
      the index. RED: `secretKeys.test.ts:168`'s golden list gains `acct-7_ent-42:rotationQuarantine` (red:
      missing); a delete, an account removal and the orphan sweep leave no item (`entityWriteOrder.test.ts`
      pattern); a sync/backup snapshot, a bundle apply that drops kinds, export and a share payload of an
      entry WITH an item carry and touch nothing of it (the item's key never appears in the logged keychain
      reads of `readSecretMaps`, and survives `dropAbsentKinds`); `slotTable.test.ts`: the item is in neither
      `SECRET_SLOTS` nor `SECRET_KINDS`. Boundary scan (new, beside `storedSecretFunnel.test.ts`): only the
      allowed modules reference the key builder or the store; NEGATIVE fixture (a planted reference from
      `mcpEntries.ts` is reported) and POSITIVE control (the known references are found). Break-it: add the
      key to `SECRET_KINDS` → the bundle test is red.
- [ ] **Q3 — the refused store writes the hold.** RED (`rotationNoLoss.test.ts`, over the real
      `StorageManager` with the keychain write log): protected while the statement ran → the item holds the
      new value, no slot key received a plaintext write (the old value stays sealed byte-for-byte), the
      agent body says `stored: "quarantined"` with no value, the journal says `rotated, quarantined`, and
      the answer arrives without the modal being answered. A second refused rotation of the same slot →
      the item holds the second value. A refused rotation followed by a successful plain store → the item
      is gone. The hold write failing → today's chain (the three existing tests at `:99`, `:112`, `:128` keep
      passing, re-pointed at the failing-hold world). Break-it: skip the supersession drop → the
      older-overwrites-newer test is red.
- [ ] **Q4 — release at the door, sealed.** RED (`pinAdmission` world): with an item waiting, `admit` with
      the PIN → the slot opens to the new value, every write to the slot key is an envelope (R3, write
      log), the item and the index entry are gone, `released` names the slot. Crash cases by injected
      failure: the item `drop` fails → the next `admit` finds slot == held and finishes; the sealed write
      fails → item kept, door still `in`. Conflict: slot changed after the rotation → item kept, nothing
      written, `conflicts` reported; *Store the rotated one* records a snapshot then writes; *Keep the
      current one* drops it. Edit after a waiting rotation opens over the rotated value. Break-it: delete
      the item before the write → the crash test is red.
- [ ] **Q5 — release when the entry is not protected.** RED: Remove PIN Protection with an item waiting →
      the slot holds the new value plain and the item is gone; an entry unprotected "by a sync" → the
      startup sweep releases it; an entry protected again between the sweep's decision and its write →
      `ProtectedMeanwhile`, item kept; a protected entry's item is untouched by the sweep. Break-it: let the
      sweep take a protected entry → red.
- [ ] **Q6 — the person sees it.** RED: the walk's `waitingIds` holds an entry with an item and drops a
      stale index entry; the row description says `rotated password waiting`; the rotation modal's text
      and buttons; the clipboard modal and the post-copy message carry the clipboard-history sentence; no
      clipboard write happens without the button. Break-it: remove the warning sentence → red.
- [ ] **Q7 — docs, contract, release notes, promotion.** §7. `review_code` over the whole diff; the plan
      promoted with its deviations.

## 6. Test plan

| Guarantee | Where | How it is shown |
|---|---|---|
| The new value never reaches the agent | `rotationNoLoss.test.ts` | echoing statement, every store outcome → `stdout` masked (Q1) |
| A refused store keeps the value on this machine | `rotationNoLoss.test.ts` | keychain write log: item written, no plaintext into a slot key (Q3) |
| R3 holds at release | new `rotationQuarantine.test.ts` | write log: only envelopes reach the slot key (Q4) |
| Nothing is lost by a crash | `rotationQuarantine.test.ts` | injected failure after each step, next door completes (Q4) |
| Never leaves the machine | `secretKeys.test.ts`, `slotTable.test.ts`, bundle/export/share tests | the key is in no carried list and is absent from every payload (Q2) |
| Never reaches an agent reader | new boundary scan | negative fixture + positive control (Q2) |
| Deleted with its entry | `entityWriteOrder.test.ts` pattern | delete, account removal, orphan sweep (Q2) |
| Last value wins; newer never overwritten by older | `rotationNoLoss.test.ts` | second hold; hold then plain store (Q3) |
| Unprotected entry gets it plain | `rotationQuarantine.test.ts` | Remove PIN, sweep, protected-meanwhile refusal (Q5) |
| Visible, and the clipboard warns | `entityFlags` tests, `rotationStore` stub-vscode tests | hint, modal text, no copy without click (Q6) |

Real `StorageManager` over the logged in-memory keychain (`test/pinWorld.ts`) throughout, as
`rotationNoLoss.test.ts` already does. No `dotnet test`; the C# side changes only the tool description, and
`contract/mcp-tools-v1.json` is regenerated (`src_vs_code/scripts/emit-mcp-tools.mjs`).

## 7. Docs to update

- `research/module_extension.md` — the rotation paragraph (`:1542-1552`) rewritten for the hold, the
  release and the masker; the `rotationStore.ts` row (`:1180`) and a `rotationQuarantine.ts` row beside it;
  §*The entry PIN keeps its promise* (`:1332`): R3 holds because the item is not a slot, and its protection
  stated.
- `research/module_tests.md` — the `rotationNoLoss.test.ts` row (`:880`) and new rows for
  `rotationQuarantine.test.ts` and the boundary scan, in §*A PIN-protected entry keeps its promise* (`:820`).
- `src_vs_code/CHANGELOG.md` `[Unreleased]` — *Fixed:* the echoed new value (Q1); *Changed:* a rotation
  refused by a PIN keeps the value until the PIN is entered; the clipboard warning.
- Help (`helpEn.ts:132` — *"the old value is kept there, the new one in the vault"* gains the waiting case;
  `:300` — a paragraph on a rotation that lands while an entry is being protected), and the same in
  `helpDe.ts`, `helpEs.ts`, `helpRu.ts`, `helpUk.ts`.
- `creds_rotate`'s description (`src_mcp/src/UseTools.cs:129-137`): one sentence on `stored: "quarantined"`;
  the contract regenerated.

## 8. Definition of Done

- [ ] Q1–Q7 merged, each with its RED observation and its break-it recorded in the commit body.
- [ ] A rotation refused by a PIN answers `stored: "quarantined"`, and the value is in the entry, sealed,
      after the next door with the PIN — shown by test over the real storage.
- [ ] The item is in no bundle, export, share, history, agent listing, log or journal line; deleted with its
      entry and its account (tests in §6).
- [ ] The rotation's own answer never carries the new value, whatever the store did.
- [ ] Typecheck, lint, the size ratchet (line-neutral in `storageManager.ts` and `extension.ts`),
      `npm test`, the plan lifecycle check, all green.
- [ ] Docs of §7 updated; `review_plan` and `review_code` `proceed`; the plan promoted with its deviations.

## 9. Open questions for the owner

1. **Permanent delete of an entry with a waiting rotation** (Empty Trash, or a delete on another machine
   that syncs): proposed — the confirmation names it (*"…holds a rotated password that was never stored;
   deleting it loses the only copy"*), and a synced deletion deletes it silently like every other value of
   the entry. Or: refuse the permanent delete until it is released?
2. **The conflict at release** (§4.4 step 3 — the stored value changed after the rotation): proposed — ask
   the person (*Store the rotated one* / *Keep the current one*). Or: the later timestamp wins without
   asking?
3. **The agent answer no longer waits for the person** when the hold landed (§4.3): proposed yes. Or keep
   waiting for the modal, as E2 does today?
