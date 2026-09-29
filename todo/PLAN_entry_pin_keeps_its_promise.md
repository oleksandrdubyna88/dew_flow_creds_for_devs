# PLAN — a PIN-protected entry keeps its promise: it opens, it edits, it never leaks, it never loses

> Status: **plan only, nothing implemented yet, 2026-09-29.** Scope: `src_vs_code/src` — the PIN door and
> gate (`pinAdmission.ts`, `pinGate.ts`, `pinPrompt.ts`, `pinSession.ts`, `entityPin.ts`, `entitySlots.ts`),
> the viewer and the edit form, ~12 click commands, ~6 automatic readers, export, share-update, history,
> a new *Restore This Version…* command, the sync merge, `package.json`, help ×5, CHANGELOG, and their
> tests. Extension only; no server, HTTP contract or vault-format change. Ships as **extension 1.12.0**.
>
> Supersedes the open [PLAN_edit_reseals_a_protected_entry.md](PLAN_edit_reseals_a_protected_entry.md),
> whose whole scope is phase P3 here (§6 boundary table), and whose §1 premise was false. Related docs:
> [module_extension.md](../research/module_extension.md) §"A PIN on an entry" (:1151-1290),
> [PLAN_woven_passwords_and_entity_pin.md](../research/PLAN_woven_passwords_and_entity_pin.md) (the PIN
> design record), [PLAN_payment_polish_and_entity_pin.md](../research/PLAN_payment_polish_and_entity_pin.md),
> [PLAN_second_values.md](../research/PLAN_second_values.md). Sibling plans opened the same day:
> [PLAN_agent_creates_what_the_folder_holds.md](PLAN_agent_creates_what_the_folder_holds.md) (same release)
> and [PLAN_typed_stored_secrets.md](PLAN_typed_stored_secrets.md) (after it).

All `file:line` references below are to `src_vs_code/src/` unless a path says otherwise, and were read on
`origin/main` at `6905e9f` (no source change since the audited `4d35afa`).

## 1. The symptom, as the owner reported it

> *"я защитил пинкодом. и все данные карты исчезли (был свв, номер и тд)"* — 2026-09-29.

A payment card entry (*orest payonear*) was protected with **Protect with a PIN…**. Afterwards **View** asks
for the PIN, accepts it, and shows only *Main → Name*, *Dates & history* and *Agent access*. The card
number, the CVV and the rest are gone from the page.

**Nothing was deleted.** `protectEntity` (`entityPin.ts:50-89`) rewrote every slot — `paymentRaw` and
`secondRaw` included (`entitySlots.ts:31-89`) — as a PIN-wrapped envelope `{"v":1,"lock":{…}}`
(`secretEnvelope.ts` `lockSecret`). *Remove PIN Protection…* (`package.json:1100`, menu `:1782-1786`)
unwraps them all and the card comes back. The owner was told this the same day, together with the one
action that WOULD have lost the data (§2 D2).

This is not a regression: a protected payment card has never rendered, since the PIN shipped in 0.99.0
(~2026-09-04, CHANGELOG `:1175`). The second-value reads that have the same defect arrived with #52
(2026-09-16). No test drives the real `openEntityViewer`, so nothing noticed.

## 2. What is actually wrong — the audit

Three independent read-only audits (reader survey, design record + tests, recovery path) and three
architecture passes were run on 2026-09-29. Every row below was traced in code; the high-impact ones were
re-verified by hand.

### 2.1 The root cause

The StorageManager getters return the **raw stored string** (`storageManager.ts:697-899`). Three of them —
`getFields` (:820), `getSecond` (:840), `getPayment` (:860) — parse it and keep only keys they know
(`entityFields.ts:23-45`, `secondValues.ts:79-105`, `paymentFields.ts:244-270`). An envelope has none, so
a **locked record silently becomes `{}`**, indistinguishable from "empty". Every other getter hands the
envelope JSON back as if it were the value. The design record asked for the opposite —
*"the accessor returns a typed LOCKED result … and every interactive host decides whether to ask"*
(`research/PLAN_payment_polish_and_entity_pin.md:518-526`) — and the reader survey that was supposed to
classify every reader (`research/PLAN_woven_passwords_and_entity_pin.md:228-258`) was a hand-written list
that never had a row for the viewer's card shape or for the edit form. *"The one thing that must not
happen is a reader that hands envelope JSON to something expecting a password"* (`:257`) happens at ~18
sites.

The gate primitives themselves are sound and are reused, not replaced: `pinAdmission.admit` /
`openedText` (the door, `pinAdmission.ts:34-99`), `pinPrompt.admitEntry` / `entryPinGate`
(`pinPrompt.ts:17-106`), `pinGate.openStored` / `automaticPinRefusal` / `pinRefusalFor`
(`pinGate.ts:54-138`), `viewerOptions.gatedSecretReader` (`viewerOptions.ts:159-186`).

### 2.2 The defects, worst first

| # | Defect | Where | Consequence |
|---|---|---|---|
| **D1** | Viewer builds the card's SHAPE from ungated typed getters | `entityViewerCommands.ts:99` `getPayment`, `:64` and `:102` `getSecond` | The reported bug. `{}` → `paymentCardFor(...,{})` → `present: []` (`paymentViewMessages.ts:76-92`) → markup `''` (`paymentViewCard.ts:61-64`) → frame dropped (`entityViewPage.ts:246-249`). A credential's second-password row is hidden too (`:119`). The values ARE reachable — `resolvePayment`/`resolveSecond` (`:109-110`) go through the gated reader. |
| **D2** | **Edit is not gated, and Save deletes locked data** | `entityEditCommands.ts:34-163` (no `admitEntry`); menu `package.json:1563-1565` excludes only `:mixed` and the folder token `:locked` | Form opens with an empty card (`:53`), empty second values (`:67`), empty login/URL (`:94`), envelope JSON in Notes/Config/DB (`:92,93,97`). Save: `newPayment {}` → `applyFormSecrets.ts:103` `setPayment(undefined)` → `putSecret` deletes (`storageManager.ts:364-371`); same for second values (`:105`); credential `setFields({})` deletes login/URL (`:65`). The woven-card guard `hasMixedField` (`:54`) is bypassed because the record reads `{}`. `hasStoredTotp` false → tree loses *Copy Code*. The only surviving copy is ciphertext in history (`:119-127`, cap 3, no restore UI). |
| **D3** | Every Edit+Save **drops the PIN mark** | `entityFormPanel.ts:574-600` rebuilds `details` from a literal with no `pinProtected`; `carryThroughDetails` (`attachmentMeta.ts:200-213`) does not carry it; `updateNodeFields` replaces details whole (`storageManager.ts:520-531`) | Row becomes `:pinoff` (`treeRowText.ts:184`) → *Remove PIN Protection…* disappears while slots are locked; agents see the entry again (`mcpEntries.ts:109-111`, mark-only); `envApply.ts:88`'s mark fallback is defeated. |
| **D4** | A value typed during Edit is stored **in the clear** | `applyFormSecrets.ts:50-79` never re-seals | The open plan [PLAN_edit_reseals_a_protected_entry.md](PLAN_edit_reseals_a_protected_entry.md). |
| **D5** | Edit hands the new plaintext to terminal variables | `entityEditCommands.ts:152-160` passes `result.details` (no mark) to `applyEnvBindings` | The 2026-09-12 hole reopened: the wrap check at `envApply.ts:82` passes (the new value is plain) and the mark check at `:88` has no mark to see. |
| **D6** | ~12 CLICK commands hand envelope JSON to a sink | `commands/entityCommands.ts:92` Copy Password, `:262` Copy DB, `:232` Copy DB w/o password, `:249` Connect DB → `dbLauncher`, `:197` Install SSH key → disk, `:125` Copy Code (says "no seed — open Edit", steering into D2); `vpnRun.ts:210` Save VPN config; `vpnLauncherRun.ts:97` VPN start; `sshCredential.ts:39,51-52` via `sshConnect.ts:155` (human Connect: key to disk, password to askpass); `commands/treeMutationCommands.ts:645` Write config file; `commands/agentCommands.ts:722` git signing config; `sshAgentManager.ts:111` Add to agent; `configCommands.ts:32-38` Show Config Changes | Clipboard, files, DB extension, VPN launcher and the remote host receive `{"v":1,"lock":…}`. |
| **D7** | AUTOMATIC readers hand envelopes on, or say the wrong thing | `extension.ts:1026` config route body (`brokerConfigRoute.ts:54-67` has no PIN check); `transportFactory.ts:261` git deploy key; `entityFieldReading.ts:57` notes for `creds://` refs, `:67` TOTP reads *absent* not *withheld*; `sshExecAuth.ts:129-135` broker materialises a protected **key** (only the password branch at `:89` is gated) — reached when entry A references protected key entity B via `sshKeyEntityId`; `sshAgentManager.loadMarked` (`:169-178`) at startup | A config envelope served to an application; a deploy key that cannot authenticate; an envelope written to disk as an SSH key. |
| **D8** | Export hands envelopes as values | `exportSecrets.ts:39-54` (and `parseFields` at `:54` drops login/URL); `commands/exportCommand.ts:137` CVV warning never shown | An export nobody can open for protected entries, and one missing their login/URL. |
| **D9** | Share *Update it* drops the mark and writes plaintext into a protected entry | `shareInbox.ts:683-699` `updateNode` replaces the node; `keepingMark` (`exportScope.ts:78-80`) carries only `notForExport`; the accept path writes the arriving values raw | The receiving entry claims no PIN and holds plaintext. `shareWithheld.ts:76` computes the withheld notice from `{}`. |
| **D10** | History copies from before the PIN stay **plaintext** and open without it | `protectEntity` records no revision; snapshots are raw slot strings (`revisionSnapshot.ts:34-56`); revisions live in the keychain, per machine, not synced (`revisionStore.ts:5-43`, `secretMaps.ts:51-71`), cap 3 (`revisionHistory.ts:23`); the revision viewer asks nothing (`entityViewerCommands.ts:211-283`, `extension.ts:846-853`, `revisionSecretReader` `viewerOptions.ts:189-205`) | A CVV readable and copyable with no PIN until three later edits push it out. Post-protection revisions render `{}`/envelope JSON; Copy copies the envelope (`entityViewCopy.ts:182-190`). |
| **D11** | No way to restore a version, and the tooltip says there is | `revisionRowItem.ts:31` *"Clone it to bring it back"*; Clone copies metadata only (`commands/treeMutationCommands.ts:173-186`) | A false instruction; D2's only survivor is unreachable. |
| **D12** | Sync can silently revert protection | `syncMerge.ts` `pickNode` (:121-137) breaks concurrent vectors on wall clock; `copySecret` (:356-366) is `primary[id] ?? fallback[id]` | Machine B, not yet synced, edits the entry A just protected; if B's clock is later, B's plaintext and unmarked node replace the envelopes. The fallback can also inject a plaintext slot from the losing side into a protected winner. |
| **D13** | Remove PIN loses the *woven* flag | `entityPin.ts:126-140` `openedSlots` returns `unlockSecret(...)` and `unprotectEntity` writes it bare; the lock side keeps it (`:87` `lockSecret(..., read.woven)`) | A woven password comes back as a plain one: the viewer offers no Unweave and shows the pair as one string. |
| **D14** | Remove PIN over a damaged slot clears the mark anyway | `openedSlots` opens only `locked` slots, a `corrupt` one is skipped | An entry with an unreadable value stops claiming a PIN. |
| **D15** | Dead end when the mark is lost but slots are locked | `pinCommands.ts:62-64` *"already has its own PIN"*; only *Protect…* is on a `:pinoff` row | No menu route out — reachable today by D3 and D12. |
| **D16** | No limit on PIN attempts | `pinGate.askOnce` (:77-88), the folder/new-entry sibling checks (`pinCommands.ts:231-250`, `pinOnCreate.ts:151-170`) | Unlimited guessing at an unlocked, unattended window (scrypt ≈1 s per try is the only cost). |
| **D17** | Two sentences the product says are false | `pinGate.ts:136-137` *"remove the PIN protection from its General section"* — General has no such control; the banner `generalNotes.ts:93-96` says *"you were asked for it to open this form"* (false for Edit today) and *"every secret this entry holds is wrapped"* (attachments and images deliberately are not, `entitySlots.ts:9-13`) | The product tells the person to do something impossible, and promises a protection it does not give. |
| **D18** | Smaller readers that misreport | `configCommands.ts:38` diffs envelope against envelope; `entityFlags.ts:177` config-validity flag computed on an envelope; `commands/agentCommands.ts:722` / `sshAgentManager.ts:111` a misleading "key does not parse" | Wrong notices, no leak. |

Correctly gated today and **kept as is**: the live viewer's eager reads (`entityViewerCommands.ts:58-69,125`),
`openSite.ts:39-43`, share build (`shareInbox.ts:238-244,343`, `sharePayloadBuild.ts:48-75`),
`envApply.ts:65-109`, `rotateAction.ts:214`, `sshExecAuth.ts:89`, `hygieneScan.ts:117`, `maskEntries.ts:121`,
and the raw carriers (sync, backup and bundles via `secretMaps.ts`, `revisionSnapshot`, `entitySlots`,
`entityPin`, `pinAdmission`).

## 3. Owner decisions, 2026-09-29

1. **Edit on a protected entry asks for the PIN once, shows the real values, and Save seals every changed
   value** under the same PIN and keeps the mark. (Not "refuse Edit".)
2. **Everything in one release** — every defect in §2, the minor ones included (*"все баги что нашел — тоже
   фикси"*).
3. **Protecting an entry also seals its kept history**; the history viewer asks for the PIN; Remove PIN
   unseals it.
4. **A PIN-gated *Restore This Version…*** ships now, and the Clone tooltip is corrected.
5. **Design:** the UX-first design as the base, with the protection-epoch sync rule from the structural
   design and the extra findings of the minimal design. The full compile-time secret type is its own plan,
   [PLAN_typed_stored_secrets.md](PLAN_typed_stored_secrets.md), after this release.
6. **A sync conflict's losing protected edit is kept** in that machine's history and the person is told
   once — never dropped silently.
7. The agent-create defect the owner found the same day (a Terminal entry that shows *SSH command*) is a
   separate plan in the same release: [PLAN_agent_creates_what_the_folder_holds.md](PLAN_agent_creates_what_the_folder_holds.md).

Proposed in this plan by precedent and **confirmed by the owner, 2026-09-29**:

- **Export asks for the PIN** of every protected entry in the selection, like share already does
  (`shareInbox.ts:220-226`): a decline aborts the whole export, nothing is written. The file carries the
  opened values under the file's own password and no `pinProtected` claim (the envelope is bound to this
  account and could not be opened at the other end anyway). The picker and the plain-JSON warning state
  how many protected entries go in.
- **PIN attempts:** five wrong in a row → wait 30 s, doubling to a 15-minute cap; the right PIN resets;
  kept in memory only; nothing is ever wiped for a wrong PIN.

## 4. The rules this plan establishes

These go into `research/module_extension.md` §"A PIN on an entry" as the section's new invariants.

- **R1 — One door per operation a person clicked.** A click on a protected entry goes through
  `admitEntry` (asks only when a slot is locked, remembers the PIN in `pinSession` until the window closes
  or the vault locks), then reads through `openedText`/`openStored`. No click path ever receives an
  envelope. The prompt names the purpose (*"Enter it to copy its password"*).
- **R2 — Nothing automatic prompts, and every refusal is SAID.** Automatic readers use
  `automaticPinRefusal`, falling back to the mark (`pinRefusalFor`), and answer with a withheld reading, an
  audit line or an error sentence — never an envelope, never a silent "absent".
- **R3 — A protected entry is never written in the clear, not even for a moment.** Every writer into a
  protected entry (Edit, Restore, share-update, the history rewrite) **seals in memory first and then
  writes**, the precedent `shareRecipientPin.ts:54-82` already sets. The open plan's "write, then run
  `protectEntity`" (`PLAN_edit_reseals_a_protected_entry.md` §4 step 3) is rejected: plaintext would sit
  in the keychain in between. `protectEntity` still runs afterwards as an idempotent sweep.
- **R4 — A save never erases what it could not read.** An editor opened over a `corrupt` or unopenable
  value refuses to open; a value equal to what was opened is **kept byte-identical** (no re-seal, no sync
  churn).
- **R5 — The mark follows the values, never the other way round.** Every writer carries `pinProtected`;
  the door restores a missing mark on an entry whose values are locked; the mark is still written last
  (`pinCommands.ts:297-313`).
- **R6 — Protection is a decision with a counter.** `TreeNode.pinEpoch` counts protect/unprotect
  decisions; the sync merge resolves a concurrent disagreement by the later decision (§5.9).

## 5. Design, journey by journey

Every prompt is the existing box titled `PIN for "<name>"`. `entryPinGate` and `admitEntry` gain an
optional `purpose`; when set, the prompt reads *"This entry is protected with its own PIN. Enter it to
<purpose>. It is remembered until this window closes or the vault locks."* (replacing the generic
`PROMPT` at `pinGate.ts:103` for that call). Declined → nothing happens and nothing more is said (the
existing `admitEntry` contract, `pinPrompt.ts:102-105`); wrong → `WRONG_PIN` (`:105-107`); damaged →
`corruptReason` (`:109-114`).

### 5.1 View (D1)

`entityViewerCommands.ts`: create the gated reader (today `:90-94`) directly after the door (`:58-61`);
`:64` becomes `parseSecondValues(await gated.secondRaw())`; `:99` becomes
`parsePaymentFields(await gated.paymentRaw())` when `isPayment`; `:102` reuses the `:64` value instead of
reading twice. One PIN, the card frame and the second rows render, a miss is said through `told`
(`viewerOptions.ts:178-186`).

### 5.2 Edit (D2-D5, D17 banner)

New pure module `editPrefill.ts` (every function ≤50 lines, complexity ≤4):

- `openEntryForEdit(storage, accountId, node, gate)` opens, through `openStored`, only the slots the form
  PREFILLS — notes, fieldsRaw, secondRaw, paymentRaw, configBody, dbConnection, totp — and records
  presence only for password, privateKey and vpnConfig. Any `corrupt` or `wrong` result refuses (R4).
- `sealedWriter(storage, accountId, entityId, pin, opened)` implements the setter subset
  `applyFormSecrets` uses (`SecretWriter = Pick<StorageManager, 'setPassword' | … | 'setTotp'>`, which
  becomes that module's parameter type). Each typed record is serialised with the existing
  `serializeFields` / `serializePaymentFields` / `serializeSecondValues`; `undefined` stays a delete
  (Rule A unchanged); a value equal to its opened plaintext is **skipped**; anything else is sealed with
  `sealValue()` — extracted from `entityPin.lockOne` (`entityPin.ts:79-88`) — before the raw setter runs.
  `setPassword('')` still means keep.
- `pinForSave(gate)`: at Save time the grant is re-read (never captured when the form opened —
  `pinSession.ts:35-50`); if it no longer opens the first locked slot (vault locked, window reloaded), ask
  again with purpose *"save it"*.

`editNode` sequence:

1. Folder → unchanged.
2. `gate = await admitEntry(storage, accountId, node.id, node.name, 'edit it')`; declined → no form.
3. `prefill = await openEntryForEdit(...)`; refused → `<corruptReason> Edit is not opened, so nothing can
   overwrite it.`
4. `storedPayment = parsePaymentFields(prefill.paymentRaw)` — the `hasMixedField` guard now sees the real
   record.
5. `showEntityForm` fed from the prefill (notes, fields, config, db, `storedSecond`,
   `hasStoredSecondPassword`, `storedTotpDescription` from the opened seed). New optional
   `EntityFormOptions.beforeSave?: () => Promise<boolean>` (`entityFormShape.ts`); `agreed()`
   (`entityFormPanel.ts:258-265`) runs it last. For a protected entry it is `pinForSave(gate)`; a decline
   **keeps the form open** with everything typed — the contract `confirmInvalidSave` already has.
6. Save: `recordRevision` (a protected entry's snapshot is already envelopes) → `applyAdditions(writer)`
   with `writer = protected ? sealedWriter(...) : storage` → `written = carryThroughDetails(...)`, which
   now carries `pinProtected` through a small `carryMarks()` helper (D3) → `updateNodeFields(written)` →
   `applyRemovals(storage)` → if protected, the `protectEntity` sweep → `applyEnvBindings(..., written, ...)`
   (D5 — the written, marked details, not `result.details`).
7. A seal that throws part-way: every slot is either sealed or not yet written, never plaintext. Message:
   *Saving "<name>" stopped part-way: <reason>. Nothing was stored in the clear; open it again to check
   what was saved.*

The `mixedFieldGuard.test.ts:102-121` source pins are updated deliberately: `admitEntry(` before
`openEntryForEdit(` before `showEntityForm(`, and `hasMixedField(` before `showEntityForm(`.

### 5.3 Click commands (D6, D18)

New thin `vscode` module `pinClick.ts`:
`clickedSecret(storage, accountId, owner, read, purpose): Promise<{kind:'open', value, protectedEntry} | {kind:'stopped'}>`
= `admitEntry` + `openStored` + `told`. Each row below becomes a one-liner through it.

| Command | Today | Purpose text | Extra |
|---|---|---|---|
| Copy Password | `commands/entityCommands.ts:92` | copy its password | |
| Copy DB connection / without password | `:262` / `:232` | copy its connection string | |
| Connect DB | `:249` → `dbLauncher` | connect | |
| Copy Code | `:125` | copy its one-time code | the "open Edit" hint is safe once Edit is gated |
| Install SSH key | `:197` → `keyInstaller` | install its key | file-outside-the-PIN note |
| Save VPN config | `vpnRun.ts:210` | save its VPN configuration | file-outside-the-PIN note |
| Start VPN | `vpnLauncherRun.ts:97` (shared with `vpnRun.ts:115`) | start the VPN | temp file, no note |
| Connect SSH | `sshConnect.ts:155` via `sshCredential.ts:39,51-52` | connect | `resolveSshCredential` gains an opener; the human path asks **the owner of the value** — the key entity may differ from the SSH entry |
| Write config file | `commands/treeMutationCommands.ts:645` | write its config file | file-outside-the-PIN note |
| Git signing config | `commands/agentCommands.ts:722` | read its public key | uses `details.publicKey` with no PIN when present (`entityFormPanel.ts:616`) |
| Add key to agent | `sshAgentManager.ts:111` | load its key into the SSH agent | `load(..., open)`: the click at `agentCommands.ts:667` passes the click opener; `loadMarked` (`:169-178`) keeps the automatic one and logs `pinRefusalFor` |
| Show Config Changes | `configCommands.ts:32-38` | compare it with its previous version | opens the current body and `history[0].secrets.config` before `diffConfigs` |
| Bridge / install CLI (human) | `commands/agentCommands.ts:283,433` → `sshExecAuth.ts:112` | connect | click opener |

`treeMutationCommands.ts` (762 lines) and `agentCommands.ts` (779) take one-line call sites only.

### 5.4 Automatic readers (D7, D18)

| Path | Change | What is said |
|---|---|---|
| Config route `extension.ts:1026` | the line is swapped in place (net 0, ratchet): `body: (holder) => configBodyReading(storage, holder)`, a `FieldReading`; `configRouteResult` (`brokerConfigRoute.ts:63-67`) treats `withheld` as the existing `REFUSED`, audit outcome `withheld (PIN)` | The application gets the same 401 sentence as for an unknown key, so the route cannot tell real keys from invented ones (`:47-52`); the owner's audit line says why. |
| Git deploy key `transportFactory.ts:252-266` | a locked key throws `pinRefusalFor(name) + " It is the deploy key for <location>, so this sync cannot authenticate with it."` before `materializePrivateKey` | through the sync failure path (verify it surfaces `error.message`, §10 risk 4) |
| `creds://` refs `entityFieldReading.ts:57,67` | extract `pinFieldRefusal(details, stored)` from `envApply.ts:82-88` into `pinGate.ts`; `envApply.automaticFieldRefusal` calls it; notes and TOTP return `withheld(refusal)` | TOTP reads *withheld*, not *absent* |
| SSH broker key `sshExecAuth.ts:129-135` | refuse a locked stored key with `automaticPinRefusal` before `materializePrivateKey` | the agent gets the PIN sentence; nothing reaches disk |
| Agent at startup `sshAgentManager.loadMarked` | automatic opener | log line is `pinRefusalFor(name)` |
| Share withheld notice `shareWithheld.ts:66-79` | `WithheldReader` becomes `{ getPaymentRaw, getSecondRaw }`, opened with a silent gate (the share already admitted the entry, so the grant exists) | the CVV and second values are named again |
| Config-validity flag `entityFlags.ts:177` | `isLockedSecret(body)` → not judged | no false "invalid" |

### 5.5 Export (D8)

After `admitLeaving` (`exportCommand.ts:98`), `admitForExport` runs `admitEntry(..., 'export it')` on
every selected entity with a locked slot; a decline or a wrong PIN on any of them aborts with *"<name> is
protected with its own PIN, so nothing was exported. Its values have to be unwrapped here before they can
leave."* `exportSecretsFor(vault, accountId, ids, open)` passes every getter result through `open`, which
uses the silent gate and **throws** on a locked value with no grant (existing "Export failed… Nothing was
written."). Login/URL come back because `parseFields` now sees plaintext; the CVV note (`:137`) counts
correctly. Exported nodes carry `pinProtected: undefined`. The picker title and the plain-JSON modal add
*" N of these entries are protected with their own PIN; their values go into the file unwrapped,
protected only by the file's password."*

### 5.6 Share *Update it* and the other writers into an existing entry (D9)

- `shareInbox.ts:683-699`: when the local entry is protected, the update goes through the live door
  (`admitEntry(..., 'update it')`), its arriving values are sealed with `sealValue` before being written
  (R3), and `keepingMark` (`exportScope.ts:78`) is widened to carry `pinProtected` and `pinEpoch` as well
  as `notForExport` (one helper, one place). `shareInbox.ts` is at 800 lines: the logic lives in a new
  `shareUpdateSeal.ts`, the call site changes in place.
- Checked and recorded in the promotion, each either already correct or fixed the same way:
  `importCommands.ts:97-122` (writes new entries only — expected correct),
  `externalSecretsApply.ts:92,107`, `mcpHooks.ts:44`, rotation `extension.ts:688-691` /
  `rotateAction.ts:208-219`.

### 5.7 History: sealed, opened through the door, restorable (D10, D11)

- **Format:** per-field envelopes inside each revision — the shape a snapshot of a protected entry already
  has, so one reader (`readSecret`/`openedText`) serves both and re-running is idempotent.
- `historyPin.ts` (new, pure): `protectHistory(storage, a, e, pin)`, `unprotectHistory(...)` (opened list,
  lenient: a field under another PIN is left sealed and counted), `openRevision(revision, gate)`.
- `revisionStore.writeHistory` + `StorageManager.replaceHistory` — **net ≤0 lines** in the ratcheted
  `storageManager.ts` (1023): paid for by deleting the three typed getters (§7.1) and the orphaned header
  at `:807-808`. `replaceHistory` does nothing when the stored history is absent **or parses to empty**
  (`parseHistory` returns `[]` for corrupt JSON, which must never be overwritten).
- **Protect** (`pinCommands.ts:279-295`, `pinOnCreate.applyCreatePin` `:186-189`): `protectEntity` →
  `protectHistory` → mark + epoch. Progress: *"… — <name> (kept versions)"*.
- **History is per machine** (`revisionStore.ts:8-11`): Protect can only seal THIS machine's history. On
  every other machine the door heals it — after a successful admission, `protectHistory` runs in the
  background with a status-bar message *"Sealing the kept versions of <name> under its PIN…"* (a Copy
  Password must not suddenly take 20 s).
- **Remove PIN** (`removeOne`, `:88-99`), in order: wrong-PIN check → open all live slots AND all history
  fields in memory → damaged-slot check (§5.8) → write live slots → `replaceHistory` with the opened list →
  clear the mark, bump the epoch → `forgetPin`. Interrupted after the live write: history stays sealed while
  the entry is not — it still opens, because the revision viewer asks; *Remove PIN Protection…* is offered
  while ANY slot, live or kept, is locked.
- **Revision viewer** (`entityViewerCommands.ts:211-283`): `admitEntry` on the LIVE entry (*"see this
  previous version"*), then `openRevision`, then render from the opened copy — card, Copy and Copy All
  (`entityViewCopy.ts`) work unchanged. A version sealed under a PIN that no longer opens the live entry is
  asked for separately and **never granted**, so the live grant is not overwritten. `extension.ts:852`
  changes in place (net 0).
- **Restore This Version…** — command `credSshManager.restoreRevision`, menu
  `viewItem =~ /^revision/`, group `3_manage@0`, hidden from the palette (`"when": "false"`, as `:1207`),
  registered from `registerPinCommands` (`pinCommands.ts:46-49`) so `extension.ts` does not grow. Logic in
  new `revisionRestore.ts`:
  1. resolve with `nodeAt`; the live node must exist;
  2. door on the live entry (*"restore this version"*) — refuses a corrupt live slot (R4); `openRevision`;
  3. modal *"Restore <name> to the version replaced at <date>? What it holds now becomes its newest
     previous version, so this can be undone the same way."* (+ *"The oldest kept version (<date>) drops
     out of history."* when three are kept); button **Restore**;
  4. `recordRevision(snapshotForRevision(live))` first;
  5. additions: each `SECRET_SLOTS` row (password last), the value sealed with `sealValue` first when the
     live entry is protected — **a version from before protection comes back sealed**;
  6. node: `restoredDetails(version, live)`, pure — the version's content, with these kept from TODAY:
     `pinProtected`, `pinEpoch`, `mcp`, `mcpCreatedByAgent` (a restore never widens agent access),
     `notForExport`, `configKeyHash` (never revive a revoked key), `expiresAt`, `burnPolicy`, `sshAgent`,
     `depColor`, and every `attachment*`/`image*` claim (revisions keep no files); `hasTotp` derived from
     the restored seed;
  7. removals: every slot the version lacks, through a new `SecretSlot.remove` (password via
     `deletePassword`, because `setPassword('')` means keep, `storageManager.ts:701-704`);
  8. the `protectEntity` sweep if protected; env-binding notice; refresh. Message *"<name> is back to the
     version replaced at <date>. Its agent access and code-access key are today's, not that version's."*
  `SecretSlot` gains `revisionField: keyof RevisionSecrets` and `remove`.
- **Tooltip** `revisionRowItem.ts:31`: *"Replaced <date> — click to see what it was. Right-click →
  Restore This Version… to bring it back."*

### 5.8 Remove PIN over a damaged slot, the woven flag, and the dead end (D13-D15)

- `openedSlots` (`entityPin.ts:126-140`) collects `corrupt` slots; `unprotectEntity` throws
  `DamagedSlots(labels)` before writing anything. `removeOne` shows a modal *"<name> holds a damaged
  protected value (<labels>). Removing the PIN cannot open it: it would stay unreadable while the entry
  stops claiming a PIN."* with **Remove the PIN from the rest**, which calls `unprotectEntity(...,
  { keepDamaged: true })` and reports *"… Its <labels> could not be opened and was left exactly as it
  was."*
- Unwrapped values are written with `plainSecret(value, read.woven)` (`secretEnvelope.ts`
  `plainSecret`) — the woven mark survives (D13).
- The door (`pinAdmission.admit`, `:34-46`) gets the mirror of `repairFalseMark`: a locked slot with no
  mark → restore the mark (best-effort, like `clearMark` `:133-144`, no epoch bump). After a successful
  admission, plaintext found in a protected entry (a value that arrived from an older build or another
  machine) is sealed at once by `protectEntity`.
- `protectEntry` on an entry that is already protected (`pinCommands.ts:62-65`): a warning *"<name>
  already has its own PIN (<locked> of <total> values are locked). To set a different one, remove the
  protection first."* with the button **Remove PIN Protection…** instead of a dead end.

### 5.9 Sync (D12) — the protection epoch

`TreeNode.pinEpoch?: number` (beside `folderAsksForPin`, `types.ts:407`; validated in `typeGuards.ts`
`hasValidSyncFields`) counts protection DECISIONS. It lives on the node, not in `details`, because an
older build's Edit rebuilds `details` from an allow-list (`entityFormPanel.ts:574-664`) but keeps unknown
node fields (`updateNodeFields` spreads `{...n, ...patch}`, `storageManager.ts:527`; the merge pushes
`{...winner}`, `syncMerge.ts:263`; `isTreeNode` strips nothing, `typeGuards.ts:475-487`).

- Protect, Remove PIN and a sealed share import write the mark **and** `pinEpoch + 1` in ONE node write
  (`updateNodeFields` accepts a function patch evaluated inside the write lease — ~2 changed lines,
  `storageManager.ts:520-531`, inside the ratchet budget). Door healing never bumps it.
- New pure `syncPinRule.ts`, used by `mergeProfiles`:
  1. **Dominance still decides first** — a causally later write saw the protection state.
  2. **Concurrent vectors whose sealed state differs** ("sealed" is derived from the envelopes, the
     truth, not from the mark, a mirror): the higher `pinEpoch` wins; equal epochs → the sealed side wins
     (fail closed).
  3. When this overrides the wall-clock choice (`syncMerge.ts:133-136`), the kept node gets
     `v = mergeVectors(va, vb)`, so the resolution dominates both inputs and an older build elsewhere
     accepts it by dominance instead of flipping it back on wall clock.
  4. In the per-id fallback (`copySecret`, `:356-366`) a **sealed winner never takes a plaintext value**
     from the loser.
- **The loser is kept** (owner decision 6): new pure `protectionConflicts(local, merged)` lists ids whose
  local values were replaced by the other side's protection decision; `syncManager.ts` (780 lines — the
  logic stays in `syncProtection.ts`, ~3 lines at `:566-567`) records `revisionFromSnapshot(local, id)`
  **before** `applySnapshot`, and says once: *"<name> is protected with its own PIN again: another machine
  changed it under that PIN while this one held it unprotected. What this machine had is now its newest
  previous version — open it with the PIN to compare, or Restore This Version…."* (and the mirror sentence
  for an unprotect that won). Coordinate with
  [PLAN_sync_says_what_already_happened.md](PLAN_sync_says_what_already_happened.md), which also edits
  `syncManager.ts` and owns how sync reports what it did — this notice goes through its summary once that
  lands, and the two plans are ordered in §6.

| Case | Outcome |
|---|---|
| A protects; B edits before seeing it (concurrent) | A's sealed copy wins whatever the clocks; B's values become B's newest revision; B is told. |
| A removes the PIN (epoch 2); B edits under the PIN (epoch 1), concurrent | The later decision wins: unprotected. A's values stand; B's sealed edit becomes B's newest revision; B is told. |
| Remove PIN syncing normally (other side saw the protect) | Dominance: plain wins, as it should (a test guards that the rule does not reach this far). |
| Both protect at once with different PINs | Both sealed → the rule does not fire; one node wins wholesale, no mixing. Stated in the help. |
| An older build (≤1.11) edits a protected entry | Its edit unwraps (the bug) and dominates causally, so it wins legitimately; the next door on a fixed build re-seals and restores the mark. Named in the CHANGELOG: update every machine. |

### 5.10 PIN attempts (D16)

New pure `pinAttempts.ts`, keyed like `pinSession` (`pinSession.ts:38-40`): `cooldownMs`, `noteWrong`,
`noteRight`; one choke point `attemptUnlock(envelope, accountId, entityId, pin, now)` used by
`pinGate.tryPin` (:91-101), `entityPin.opensQuietly` / `openedSlots` (:136, :188-195) and `historyPin`.
`askOnce` checks the cooldown BEFORE prompting: *"Too many wrong PINs for <name>. Nothing has been changed
— try again in <n> s."* A sibling check that opens none of N protected siblings counts one wrong attempt on
each. Stated honestly in the help: it slows guessing at an unattended window; it does not stop an offline
attacker, for whom scrypt is the cost.

### 5.11 The two false sentences (D17)

- `pinRefusalFor` (`pinGate.ts:135-137`): *"… Open the entry and enter the PIN, or remove the PIN
  protection: right-click it and choose Remove PIN Protection…."* (keeps the phrase the assertion at
  `test/pinReaders.test.ts:38` checks).
- Banner (`generalNotes.ts:93-96`): *"PIN — on. Every secret this entry holds — all but its attachment and
  image — is wrapped under a PIN of its own, and this form was opened with it. Saving seals every value you
  change under the same PIN. Nothing automatic can use this entry while that is true, and agents do not
  see it at all. Right-click the entry in the tree for Remove PIN Protection…. There is no recovery for a
  forgotten PIN."*

## 6. Boundaries with other plans

| Item | Built by | The other plan's part |
|---|---|---|
| Edit re-seals a protected entry (open plan §1-§5) | **this plan, P3** (§5.2) | [PLAN_edit_reseals_a_protected_entry.md](PLAN_edit_reseals_a_protected_entry.md) is superseded: its option (a) "keep the PIN from the open" is taken (as a grant re-read at Save, not a captured PIN), its "write then `protectEntity`" order is replaced by R3, its failure rule is §5.2 step 7, its step 5 (share-accept, import) is §5.6. Promoted together with this plan. |
| A compile-time `StoredSecret` type, a single `writeEntry` path | [PLAN_typed_stored_secrets.md](PLAN_typed_stored_secrets.md), **after** this release | This plan lands the runtime rules and the test guard (§7) that plan turns into a compile error. |
| Agent-created entries carry only fields their kind has; the SSH rows only for SSH | [PLAN_agent_creates_what_the_folder_holds.md](PLAN_agent_creates_what_the_folder_holds.md), same release | Disjoint files except `entityViewPage.ts` (it owns the SSH-row gate; this plan does not touch those rows). |
| How sync reports what it did | [PLAN_sync_says_what_already_happened.md](PLAN_sync_says_what_already_happened.md) | Both edit `syncManager.ts`. Whichever lands second rebases; the conflict notice of §5.9 is routed through that plan's summary once it exists. This plan's merge rule (`syncMerge.ts`, `syncPinRule.ts`) is disjoint from it. |
| Re-wrapping when an entry moves across a PIN boundary | not built (design record `research/PLAN_payment_polish_and_entity_pin.md:509-516`) | Out of scope, unchanged. |

Nothing else in `todo/` touches these files.

## 7. The guard — why this class of bug cannot come back quietly

1. **Delete the three silent getters.** `getFields`, `getSecond`, `getPayment` (`storageManager.ts:820,
   840, 860`) have six production callers (`entityEditCommands.ts:67,94`, `entityViewerCommands.ts:64,99,102`,
   `shareWithheld.ts:76`) — all rewritten above — and 16 calls in five test files, which move to
   `parseX(await getXRaw(...))`. A read that silently empties a locked record then no longer compiles.
2. **`test/pinReaderBoundary.test.ts`** (source-reading, the style of `mixedFieldGuard.test.ts`): the
   getter names are DERIVED from `SECRET_SLOTS` (not a hand list — the failure mode of the old survey), and
   a checked-in `READERS: Record<file, 'carrier' | 'door' | 'automatic' | 'presence'>` must classify every
   `src/**/*.ts` that calls one. An unlisted caller fails naming file, line and getter (*"classify this
   reader"*); a `door` file must contain a door primitive; an `automatic` file a refusal primitive; a
   `presence` file only `!== undefined` uses.
3. **`test/slotTable.test.ts`:** `SECRET_SLOTS.map(s => s.revisionField)` equals `SMALL_FIELDS`
   (`revisionHistory.ts:74`); keys unique; every slot has `remove`.
4. **`unlockSecret(`** is called only in `secretEnvelope.ts` and `pinAttempts.ts` (source pin), so no path
   bypasses the attempt limit.
5. **`test/pinSlotMatrix.test.ts`:** for EVERY slot of `SECRET_SLOTS`, with only that slot locked, every
   surface (viewer options, edit prefill, each click sink, export, share payload, env collection,
   `creds://`, revision viewer) receives the plaintext and never `"lock":`; an untouched Edit-save leaves
   every slot byte-identical; a changed one is stored locked and opens to the new text. A fixture table
   typed `Record<SlotName, string>` makes an eleventh slot without a fixture a compile error.
6. **Help parity:** every language's `entity-pin` help names *Restore This Version…* and *Remove PIN
   Protection…* (pattern `helpCatalog.test.ts:154-174`).

## 8. Size, lint and growth budget

- **Ratchet** (`.size-baseline.json`, `test/sizeRatchet.test.ts:31-44`): `storageManager.ts` 1023 and
  `extension.ts` 1038 must not grow — `replaceHistory` and the function patch are paid for by §7.1 and
  the orphan header; `extension.ts` changes two lines in place (`:852`, `:1026`).
- **Hard limit 800:** `shareInbox.ts` is at 800 (logic in `shareUpdateSeal.ts`); `syncManager.ts` 780
  (logic in `syncProtection.ts`); `agentCommands.ts` 779 and `treeMutationCommands.ts` 762 (one-line call
  sites only).
- **ESLint** (`eslint.config.mjs:18-30`): function ≤50 lines, complexity ≤4 — assume `?.` and default
  parameters count; `carryThroughDetails`, `configRouteResult`, `SshAgentManager.load`, `askOnce` and
  `repairFalseMark` are at the limit and get a helper, not a branch. `entityViewerCommands.ts:1` and
  `entityEditCommands.ts:1` carry "moved verbatim" file disables whose own comment says each function
  meets the limits when next touched: `openEntityViewer` and `editNode` are split, and the disables are
  removed when unused (`reportUnusedDisableDirectives: 'error'` forces it).
- **Growth surfaces:**
  - `pinEpoch`: one integer per protected node, +1 per deliberate protect/unprotect — bounded by human
    clicks; never retired; ≈8 bytes per node.
  - `pinAttempts`: an in-memory map keyed by account+entry, cleared on success and on vault lock; bounded
    by the entries a person tries; lost on reload by design.
  - History: unchanged cap of 3 per entry (`MAX_REVISIONS`). Restore and a sync conflict each record one
    revision and can push the oldest out — the modal and the notice say so. No new store.
  - No in-flight persisted state: an interrupted seal leaves sealed-or-unwritten slots, which the door
    heals; an interrupted Remove PIN is finished by running it again (§5.7).
- **scrypt cost:** Edit opens up to 7 slots (~1 s each) — opened in parallel (`Promise.all`) behind a
  progress notification; an untouched save seals nothing; Protect with full history adds up to ~30 seals
  once, with progress; door healing of history is backgrounded.

## 9. Build order

Each phase is a green commit (`npm run typecheck`, `npm run lint`, `npm run ratchet`, `npm test`). Every
defect starts with its RED test watched failing with the real symptom (§11), then the fix, then green.

- [ ] **P0 — Gate this plan.** coai `review_plan` until `proceed`, run alongside our own review.
- [ ] **P1 — Primitives.** `sealValue` extraction; `purpose` on `entryPinGate`/`admitEntry`;
      `SecretSlot.revisionField`/`remove` + `slotTable.test`; `pinAttempts` + `attemptUnlock`;
      `pinFieldRefusal` extraction; silent gate.
- [ ] **P2 — View (D1).** The reported bug first: smallest change, visible at once.
- [ ] **P3 — Edit (D2-D5, D17 banner).** `editPrefill`, `sealedWriter`, `SecretWriter`, `beforeSave`,
      `carryMarks`, the env fix, the banner; `mixedFieldGuard` pins updated.
- [ ] **P4 — Clicks (D6, D18).** `pinClick`, the SSH opener split (owner of the value), agent, git
      signing, config changes.
- [ ] **P5 — Automatic, export, share-update (D7-D9).** Including the broker key refusal and the deploy
      key; the §5.6 check list recorded.
- [ ] **P6 — History and Restore (D10-D11).** Typed-getter deletion lands here so the ratchet stays green;
      `replaceHistory`; `historyPin`; revision viewer; `revisionRestore`; tooltip; `package.json`.
- [ ] **P7 — Remove PIN hardening and the dead end (D13-D15).** Damaged-slot refusal, woven flag, door
      heal, Protect-on-protected.
- [ ] **P8 — Sync (D12).** `pinEpoch`, `syncPinRule`, the fallback guard, `syncProtection` + the conflict
      revision and notice.
- [ ] **P9 — Attempts (D16) wired, false sentences (D17), guards (§7).** `pinReaderBoundary`,
      `pinSlotMatrix`, `unlockSecret` pin, help parity.
- [ ] **P10 — Docs and release.** Help ×5 (`helpEn/Ru/Uk/De/Es.ts`, key `entity-pin` at `:295`),
      CHANGELOG (§12), `research/module_extension.md` (the entry-PIN section: R1-R6, reader classes, history,
      Restore, sync rule), `research/module_tests.md` (new scenario tests); coai `review_code` until
      `proceed`; full suite from `out/`; promote this plan and the superseded one; extension 1.12.0.

### 9.1 Epics and pull requests

The owner allowed more than one pull request (2026-09-29). The phases ship as four epics, each its own
branch, pull request and coai code round; **nothing is released until the last one** (owner decision 2).
The order puts the data loss first.

| Epic | Phases | Pull request closes | Why this order |
|---|---|---|---|
| E1 | P1-P3 | D1-D5, the banner half of D17 | the reported bug and the only data LOSS; carries this plan's commit |
| E2 | P4-P5 | D6-D9, D18 | every leak of an envelope to a sink; reuses E1's door and `sealValue` |
| E3 | P6-P7 | D10, D11, D13-D15 | history, Restore and Remove PIN share `replaceHistory` and the slot table's `revisionField`/`remove` |
| E4 | P8-P10 | D12, D16, the rest of D17, §7 guards, docs, release | the guard is written last, when every reader it classifies is final |

[PLAN_agent_creates_what_the_folder_holds.md](PLAN_agent_creates_what_the_folder_holds.md) is a fifth pull
request after E1 (it uses `sealValue`) and before the release. Extension 1.12.0 is cut after E4 and it have
both merged.

## 10. Risks

1. **scrypt latency** on Edit and Protect (§8) — parallel opens, progress, keep-if-unchanged.
2. **Mixed-version fleet:** an older build still unwraps on Edit and its edit dominates causally. Door
   healing repairs it on the next open of a fixed build; the merged vector stops wall-clock flapping. Named
   in the release notes.
3. **A view can write** (door healing restores a mark or seals a stray plaintext value): it bumps the
   vector only when drift is found; it races another window's write exactly as `protectEntity` already
   does.
4. **The deploy-key refusal** relies on the sync failure path surfacing `error.message` — verified in P5
   before it is relied on.
5. **Vault lock while a form is open:** `beforeSave` asks again; a decline keeps the form and its typing.
6. **Two PINs on one entry** after concurrent protects with different PINs: the version is asked for
   separately (§5.7); Remove PIN on a version under a foreign PIN leaves it sealed and says so in its count.
7. **Test mocks are graph-wide** (`vscodeStub.ts:16-43`): a mock of `'./pinPrompt'` affects every module
   that requests it — prefer the stubbed `showInputBox`.
8. **Every existing EDIT test** that edits a locked entry without a queued PIN
   (`envSaveNotice.test.ts:387-411`) implicitly pinned the ungated path and must now queue one — updated
   deliberately, not weakened.

## 11. Test plan

`node:test`, `loadWithVscode`, real `lockSecret` cached once per file (`pinReaders.test.ts:22-24`, ~1 s per
wrap). The in-memory vault is derived from `envSaveNotice.test.ts:98-186` **with real typed setters and no
stubbed deletions** (the old fake made `setPayment`/`setSecond`/`setFields` no-ops, which is why no test
could see D2). Every RED test is watched failing with the real symptom first, and both observations are
reported.

| Defect | Test (named after the guarantee) | File / template | RED today because |
|---|---|---|---|
| D1 | a protected payment entry opens with its card frame; a protected credential's second-password row is drawn; a declined PIN opens no viewer | new `viewerOpen.test.ts`; mock `./entityViewPanel` `showEntityView`, template `openSite.test.ts:44-138` | `present: []`, `hasSecondPassword` false |
| D2 | Edit of a protected card that changes only the name keeps every payment field, its second values, its seed and *Copy Code*; a protected credential keeps login/URL; Edit prefills opened notes, never the envelope; Edit refuses over a damaged value; a declined door opens no form | new `editProtected.test.ts`; real `editNode`, `showEntityForm` mocked to post back exactly the prefill, template `envSaveNotice.test.ts:353-411` | the payment/second/fields slots are deleted |
| D3 | an edit never takes an entry's PIN mark off, and the entry stays hidden from agents | `attachmentMeta.test.ts`; `editProtected.test.ts` via `hiddenFromAgents` | mark dropped |
| D4 | a new password typed into a protected entry is stored LOCKED and opens to the new text; an untouched save rewrites no sealed value; a `beforeSave` that answers false keeps the form open | `editProtected.test.ts`; `entityFormPanel.test.ts` | stored in clear |
| D5 | an Edit that types a new password hands env bindings the MARKED details and writes no variable | `editProtected.test.ts` | `NEW-PW` written |
| D6 | every click that uses a protected value opens it first — the sink gets the plaintext, never `"v":1`, at most one prompt; a declined door writes nothing; Connect over a protected key entity asks THAT entity's PIN; git signing uses `details.publicKey` without asking | new `pinClickPaths.test.ts` (table-driven, fake `register`, clipboard spy); `sshCredential.test.ts` | clipboard gets `{"v":1,"lock"` |
| D7 | a PIN-protected config answers 401 and audits `withheld (PIN)`; a protected deploy key is refused and never materialised; a `creds://` note/code is withheld, not absent; the broker refuses a protected stored KEY and writes nothing to disk | `brokerConfigRoute.test.ts`; `transportFactory`; `entityFieldReading.test.ts`; `pinReaders.test.ts` (`materializePrivateKey` spy) | 200 with the envelope; key file written |
| D8 | exporting a protected entry asks its PIN and a decline writes nothing; export carries OPENED values and login/URL; exported details carry no `pinProtected`; the card note counts a protected CVV | `storageExportSecrets.test.ts`; `exportCommand` | envelopes exported, login/URL dropped |
| D9 | updating a protected entry from a share keeps its PIN and stores the arriving values sealed; sharing a protected card names the CVV as withheld | `shareInbox` update test; `shareWithheld.test.ts` | mark dropped, plaintext written |
| D10 | protect seals every kept version's values (fields derived from `SECRET_SLOTS`); Remove PIN unseals them; a version under another PIN is left sealed and counted; a kept version of a protected entry opens only after the PIN and draws its card; another machine's history is sealed at its first door | new `historyPin.test.ts`, `revisionViewer.test.ts` | plaintext CVV in history, opens without PIN |
| D11 | Restore brings the version back and records today's state first; restoring into a protected entry SEALS a pre-protection version; Restore keeps today's agent access and code-access key; Restore removes a value the version lacked; a declined PIN restores nothing; the tooltip offers Restore, not Clone; the command is contributed and registered | new `revisionRestore.test.ts`; `revisionRowItem`; `commandsRegistered.test.ts` | no such command |
| D12 | a concurrent edit that had not seen the protection does not unwrap it, whichever clock is later and whichever side is local; a later concurrent Remove PIN beats an earlier sealed edit; a dominating plain value still wins; a sealed winner borrows no plaintext slot; the local loser is recorded before `applySnapshot` and the person is told | `syncMerge.test.ts` (template `:62-67`); `syncManager` order test | plaintext wins on wall clock |
| D13 | Remove PIN keeps a woven password woven | `entityPin.test.ts` | `woven` lost |
| D14 | Remove PIN on an entry with a damaged slot changes nothing and names the value; *Remove the PIN from the rest* leaves the damaged slot byte-identical | `entityPin.test.ts` | slot skipped, mark cleared |
| D15 | the door restores a missing mark on an entry whose values are locked; Protect on an already-protected entry offers *Remove PIN Protection…* | `pinGateHoles.test.ts`; `pinCommands` | dead end |
| D16 | five wrong PINs cool the entry down 30 s, doubling to 15 min; a right PIN resets; a cooling entry is refused without a prompt | new `pinAttempts.test.ts` (`ask: () => assert.fail()`) | unlimited |
| D17 | the refusal names *Remove PIN Protection…*; the banner says Save seals and that attachments are not wrapped | `pinReaders.test.ts`, `generalNotes.test.ts` | false text |
| D18 | a protected env/yaml config is not flagged invalid; Show Config Changes diffs opened bodies | `entityFlags`; `pinClickPaths.test.ts` | flagged / envelope diff |
| guard | §7 items 2-6 | `pinReaderBoundary`, `slotTable`, `pinSlotMatrix`, help parity | the leaky sites are unclassified |

A new flow needs a scenario test named in `research/module_tests.md` (`.claude/rules/shared/common/testing.md:382-383`):
*protect a card → view → edit the name → view → Remove PIN → view*, over the real `StorageManager`
(`shareWorld.ts:402`), asserting the card at every step.

## 12. User-facing text and release

Help `entity-pin` (`helpEn.ts:295-302`, mirrored in `helpRu`/`helpUk`/`helpDe`/`helpEs` at the same key,
command names kept in English as those files do):

- **whatItIs** += *"Its kept previous versions are sealed under the same PIN. Attachments and images are not
  wrapped."*
- **usage** += *Editing asks once, and Save seals* · *Every click asks once* (the list, and "a file you save
  is outside the PIN") · *History is protected too* (sealed here on Protect, on another machine at the
  first open; Restore This Version…; Remove PIN unseals) · *Export asks for the PIN* · *Five wrong PINs in a
  row make you wait*; *Nothing automatic uses it* += config keys and git deploy keys.
- **whatCanGoWrong** += *Update every machine* (a version before 1.12 still removes the protection when it
  edits) · *Changed on two machines at once* (§5.9 table, in one paragraph) · *A damaged value*.

CHANGELOG under `## [Unreleased]`, becoming `## [1.12.0] — <date> — The entry PIN keeps its promise`:
**Fixed** — viewing a protected card; editing (the full list of what it used to delete, leak and drop);
every click; nothing automatic gets a sealed value; export; share update; sync; Remove PIN on a damaged or
woven value; the dead end; wrong-PIN wait. **Added** — history is protected; *Restore This Version…*.
**Note** — update every machine.

Release per `.claude/rules/shared/common/task-lifecycle.md:78-123`: extension version in `package.json`
AND `package-lock.json` (guarded by `lockfileVersion.test.ts`), tag `extension-v1.12.0` pushed alone,
together with the sibling plan's relay release in the order that plan states.

## 13. Definition of Done

- [ ] The owner's card entry, protected, shows its whole card in View after one PIN (verified in the real
      editor, not only in tests).
- [ ] Every defect D1-D18 has a test that was watched failing with the real symptom, then passing; both
      observations are in the summary.
- [ ] No reader in `src/**` receives an envelope: `pinReaderBoundary` and `pinSlotMatrix` are green, and the
      three silent getters are gone.
- [ ] A protected entry is never written in the clear by Edit, Restore, share-update or the history rewrite
      (R3), asserted per slot.
- [ ] Edit+Save and Restore keep the mark and `pinEpoch`; terminal variables never receive a value of a
      protected entry.
- [ ] History is sealed on Protect and at the first door elsewhere, opens only with the PIN, and Restore
      works on protected and unprotected entries.
- [ ] The sync rule of §5.9 holds in both argument orders; a losing edit is kept as a revision and said once.
- [ ] `npm run typecheck`, `npm run lint`, `npm run ratchet`, `npm test` green; the ratchet did not grow.
- [ ] Help ×5, CHANGELOG, `research/module_extension.md`, `research/module_tests.md` updated; §5.6's check
      list answered in the promotion.
- [ ] coai: a plan round and a code round, both `proceed`, every finding resolved.
- [ ] This plan and [PLAN_edit_reseals_a_protected_entry.md](PLAN_edit_reseals_a_protected_entry.md)
      promoted to `research/` with `IMPLEMENTED <date>` and their deviations; `todo/README.md` updated in the
      same commit.
- [ ] Extension 1.12.0 released.
