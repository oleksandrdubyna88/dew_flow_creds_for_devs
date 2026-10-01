# PLAN — a stored secret has its own type: forgetting the PIN door stops compiling

> Status: **IMPLEMENTED, 2026-10-01.** Three epics built in order, each with its plan round and code round
> at `proceed`: E1 (T1, T2) merged as #176, E2 (T3, T4) merged as #177, E3 (T5, T6) on `feat/typed-secrets-e3`
> (its PR opened after this promotion); the two plaintext windows of §2.7 were fixed ahead of them in #175.
> **Deviations:** E2 was planned on Fable (max) and built on Opus 5.5 (Fable was rate-limited); the writer
> side closed at T5's FIRST flipped slot, not at the eleventh commit — the `| string` window only covered the
> read seams (§3, *What the type does not catch*); T4's interim rule was retired only in part — its
> additions-pass pattern — and the rest is a PERMANENT stored-form rule, the storage bound to another name
> included; `sealValue` split into `sealText` / `sealValue` (E3 code round, finding 0); a `store` column on
> the slot table; the producers stay text-returning, minted at funnel call sites; two metadata values (the
> legacy note, the public key) minted at their one function each; `rotateAction.draw`, a reader §10 had not
> counted, reads through `unsealedText`; each story's own deviations are recorded under it (T1-T5).
> **Open tail:** `syncProtection.SNAPSHOT_MAP` is still a hand copy of the slot → bundle-map pairing; the
> funnel's type-aware half (§3 item 2) is unbuilt; **the release** — one for the whole plan (#175, #176,
> #177, E3) — waits for the owner's approval of its content. §2.7's question (should a folder that asks for
> a PIN ask at accept and import too?) stays the owner's.
>
> History: written 2026-09-29, revised after the consultation
> 2026-09-30, split into epics after the second plan round 2026-09-30.
> Two plan gates passed: `proceed` on the 2026-09-29 text (2 of 2 reviewers, one round, seven findings
> accepted — §8.1) and `proceed` on this revised text (session `bc788c97`, 1 of 2 reviewers — Codex was
> rate-limited — two findings accepted, one rejected with its reason — §8.2). The second round's operator
> commands turned §4 into three epics of two stories, each its own branch, plan round, code round and pull
> request (§4.0); T0 is done. **The two plaintext windows §2.7 names were fixed ahead of the epics**, on
> `fix/two-plaintext-windows` (2026-10-01, the cadence consultation's first advice — §9 row 4; pull request #175), so T4 keeps their tests green rather than turning them red.
> Scope: `src_vs_code/src` — `storageManager.ts` getter/setter signatures, a new `storedSecret.ts` and
> `entryWriter.ts`, the shipped door and sealing modules RETYPED rather than replaced (`secretOpener.ts`,
> `pinClick.ts`, `pinGate.ts`, `pinAdmission.ts`, `sealingAtWrite.ts`, `editPrefill.ts`,
> `shareUpdateSeal.ts`), the 102 getter references, 83 setter references and 5 + 4 structural interfaces
> counted in §10, and the tests' fakes. Extension only; no format change. **Starts after**
> [PLAN_entry_pin_keeps_its_promise.md](PLAN_entry_pin_keeps_its_promise.md) and
> [PLAN_agent_creates_what_the_folder_holds.md](PLAN_agent_creates_what_the_folder_holds.md),
> both shipped as extension 1.12.0 on 2026-09-30 — which is why every `file:line` below was re-read (§10).
>
> Owner decision 2026-09-29: the structural design is right, but migrating every call site in the same
> release as eighteen behavioural fixes to a secrets product is a regression risk of its own — so it is
> built second, on top of the runtime rules and tests that plan landed.

All `file:line` references are to `src_vs_code/src/` unless a path says otherwise, and were read on
`origin/main` at `39e2b738` (extension 1.12.0, relay 0.9.0) on 2026-09-30.

## 1. The goal

After the entry-PIN plan, the rule *"no reader receives an envelope, no writer stores plaintext into a
protected entry"* is enforced by **tests**: `pinReaderBoundary.test.ts` (every `src/**` reader of a slot
classified, per read, over the syntax tree), `pinSlotMatrix.test.ts` (ten slots × every surface), and the
deletion of the three silent typed getters (that plan §7, §15 *P9* and *The reader guard is per read*). A
test catches a new caller at `npm test`. This plan makes the compiler catch it at `tsc`: a stored secret
cannot be used as a `string`, and plaintext can only come out of the door.

The root it removes (`storageManager.ts:698-896`): every slot getter returns `Thenable<string | undefined>`
(`getPassword` :698, `getPrivateKey` :727, `getVpnConfig` :741, `getNotes` :805, `getFieldsRaw` :816,
`getSecondRaw` :832, `getPaymentRaw` :848, `getConfigBody` :861, `getDbConnection` :871, `getTotp` :886), so
"a value", "absent" and "sealed" have one type, and every raw setter takes a `string` — so a caller that
forgets the door, or writes plaintext into a protected entry, type-checks. 1.12.0 fixed eighteen instances
of that; the type is what stops the nineteenth compiling.

## 2. Design — absorbing what 1.12.0 shipped

The 2026-09-29 text designed `EntryReader` and `writeEntry` from scratch. Between that date and this
revision the entry-PIN plan shipped the runtime halves of both (its §15 lists every module it added), so
building them again would be the second implementation the reuse-first rule forbids. The design below
keeps the type mechanics — the phantom, the funnel, the per-slot staged flip — and **retypes the shipped
seams** instead of adding parallel ones. §9 records where that follows the consultant and where it does not.

### 2.1 The seams that exist today, and what each becomes

| Seam (today) | Where | What it is | In this plan |
|---|---|---|---|
| `readSecret(raw) → SecretRead` (`value` / `locked` / `absent` / `corrupt`, woven flag) | `secretEnvelope.ts:95` | the one parser of a stored string; `lockSecret` :191, `unlockSecret` :216, `plainSecret` :181, `isLockedSecret` :243 beside it | the root of the funnel: takes `StoredSecret`, and `lockSecret` / `plainSecret` return one |
| `openStored(stored, gate) → PinOpen` | `pinGate.ts:79-88` | the door primitive — grant, box once, silent gate | takes `StoredSecret` |
| `openedText(stored, gate) → string \| undefined` | `pinAdmission.ts:122-133` | the eager reads after `admit` | takes `StoredSecret` |
| `SecretOpener = (owner, stored) → OpenedSecret` | `secretOpener.ts:39`, `:29` | the seam for a path that is a click OR automatic; `automaticOpener` :47 is the unattended answer | **this is the plan's `EntryReader`** (§2.3) |
| `clickedSecret` / `clickOpener` | `pinClick.ts:30-48` | the interactive opener: `admitEntry` then a silent `openStored`, every stop SAID | **the plan's `openedReader`**; unchanged but for the type |
| `gatedSecretReader(inner, gate, report) → SecretReader` | `viewerOptions.ts:159-175` | the viewer's per-field seam over `storageSecretReader` :131-146 / `revisionSecretReader` :189-205 | `inner` becomes a `StoredReader`; the revision viewer goes through it too (§2.3) |
| `automaticPinRefusal` / `pinFieldRefusal` → sentence or `''` | `pinGate.ts:173-217` | the wrap first, the mark second | take `StoredSecret`; their four direct callers converge on `automaticOpener` (§2.3) |
| `FieldReading` = `value` / `withheld(reason)` / `absent` | `fieldReading.ts:18-21` | the automatic consumers' answer | kept; `fieldReadingOf(opened)` is the one adapter from `OpenedSecret` |
| `exportOpener → ExportOpen` | `exportSecrets.ts:38-55` | silent gate, throws on what it cannot open, byte-identical otherwise | takes `StoredSecret`, hands the file `carried()` text |
| `Sealing` = `plain` / `sealed{pin}` / `stopped` from `sealingAtWrite(...)` | `sealingAtWrite.ts:39`, `:75-94` | R3 at WRITE time — decided immediately before the first write, shared by Edit and Restore | **the plan's `SealTicket`** (§2.4): gains a brand and three more constructors |
| `sealedWriter(storage, a, e, pin, opened) → SecretWriter` | `editPrefill.ts:216-242` | seals in memory, skips a value equal to the opened one, then the raw setter | absorbed into `entryWriter.ts` |
| `sealingWriter(storage, a, pin) → ShareWriter` | `shareUpdateSeal.ts:111-125` | the same rule over the nine raw setters a payload writes | absorbed into `entryWriter.ts` (one writer, two shapes gone) |
| `SecretWriter = Pick<StorageManager, 12 setters>` | `applyFormSecrets.ts:14-28` | what `applyAdditions` writes through | becomes `EntryWriter`, an interface of PLAINTEXT setters the storage no longer satisfies (§2.4) |
| `SECRET_SLOTS` (`label`, `revisionField`, `read`, `write`, `remove`) | `entitySlots.ts:45-124` | the one table every walker reads | **the plan's `SLOT_SPECS`** (§2.5): gains `bundleKey`; nothing new beside it |
| `readerScan.ts` + `pinReaderBoundary.test.ts` | `test/readerScan.ts:119` (`enclosingFunction`), `test/pinReaderBoundary.test.ts:54-89` (`READERS`), `:184-231` (`GATED_BY_CALLER`) | the per-read AST guard | kept, retargeted (§2.6) |

### 2.2 `storedSecret.ts` — the phantom

```ts
declare const STORED: unique symbol;
/** A string as the keychain holds it — plain, a woven-plain envelope, a sealed envelope, or damaged. */
export type StoredSecret = { readonly [STORED]: true };
export function stored(raw: string): StoredSecret;                 // the mint — keychain and parse boundaries only
export function stored(raw: string | undefined): StoredSecret | undefined;
export function carried(s: StoredSecret): string;                   // the raw bytes, for the raw carriers only
```

A string at run time, an object type to the compiler, so it is assignable neither to nor from `string`:
`s.length`, `s === ''`, `s.trim()`, `f(s)` for `f(x: string)` and `const t: string = s` all fail. A branded
`string & {…}` is rejected because it stays assignable to `string`; a runtime wrapper class because it
breaks ~290 test assertions for no extra safety. **What the phantom does NOT catch** is in §3.

Where a `StoredSecret` is minted: `StorageManager`'s ten getters (`this.secrets.get(...)`, one cast each,
line-neutral for the ratchet), the kept-version parse (`revisionStore.parseHistory` :25-32 /
`revisionHistory.isRevisionList` :104-119), and the three producers of a stored form — `plainSecret`,
`lockSecret`, `sealValue` (`sealValue.ts:25-33`). Where one is stripped back to text without a door:
`carried()` in the raw carriers only — export (`exportSecrets.ts:39-45`, the byte-identical branch), the
share payload of an unprotected entry (`sharePayloadBuild.ts:48-49`), and the sync/backup bundles, which
never touch a getter at all (`secretMaps.ts:101-136` reads the chest by key — outside this type, as the
PIN plan §15 recorded for `pinReaderBoundary`).

**`RevisionSecrets` is typed too** (`revisionHistory.ts:26-48`, ten optional fields): a kept version holds
the same stored forms — `snapshotForRevision` copies getter results into it (`revisionSnapshot.ts:44-53`),
`historyPin` seals and opens them in place (`historyPin.ts:33-56, 70-89`), `restoreVersion.fateOf` writes
them back through the table (`restoreVersion.ts:97-102`). Each field flips with its slot (T5). **A version
`openRevision` (`historyPin.ts:177-188`) has opened holds REAL stored forms, never casts** *(gate
2026-09-30, finding 0)*: `withValues` / `storedForm` (`historyPin.ts:248-263`) already rewrite each opened
field as `plainSecret(open.value, read.kind === 'locked' && read.woven)`, and the typed version mints
exactly that — `stored(plainSecret(value, woven))` — so `readSecret` on an opened field answers `value`
with the woven flag intact, precisely what it answers for an unprotected entry's field, and no reader of
the opened copy can tell the two apart. That is what lets the revision viewer, the history row's Copy and
*Show Config Changes* read an opened version through the same `gatedSecretReader` the live viewer uses,
behind a SILENT gate (§2.3): no second reader type, and no second admission.

### 2.3 The read side: there is no `EntryReader` to build — the openers are it

The 09-29 design: `EntryReader.text(slot) → FieldReading`, built only by `openedReader(src, gate, admitted)`
or `unattendedReader(src, name, marked)`, with an unexported `Admitted` brand so only the door can mint the
interactive one. The shipped code already has both halves under other names, and stronger:

- **The interactive reader is `pinClick.clickOpener`** (`pinClick.ts:41-48`): it runs `admitEntry` itself
  when the entry is marked or the value sealed, then a SILENT `openStored`, and says every stop. An
  `Admitted` brand is unnecessary — the reader cannot exist without the door because the reader IS the
  door. `clickedSecret` (`:30-38`) is the same over a `SlotRead`.
- **The unattended reader is `secretOpener.automaticOpener`** (`secretOpener.ts:47-61`): never asks, refuses
  a sealed value OR a marked entry's value with the PIN sentence (`pinFieldRefusal` — wrap first, mark
  second), refuses a damaged wrap as damaged, and answers `open` with `value: undefined` for an absent one.
- Both are `SecretOpener = (owner, stored) → OpenedSecret`, and the paths that are click-or-automatic
  (`sshCredential.resolveSshCredential` :41-59, `sshAgentManager.load` :129-146) already take one as a
  parameter with the unattended one as the default.

So this plan adds **no reader class**. It retypes `SecretOpener`'s `stored` parameter, and makes the
openers the ONLY road from a `StoredSecret` to text outside the funnel:

- **`OpenedSecret` is not the one answer type** (this is the one place §9's consultant is not followed):
  its `open` carries `value: undefined` for an absent value, so a consumer that has to tell *absent* from
  *withheld* — a `creds://` reference, the config route, a terminal variable — cannot be fed it directly;
  `fieldReading.ts:4-14` records the defect that distinction was created to end. `FieldReading` stays their
  answer, and `secretOpener.ts` gains the one adapter, `fieldReadingOf(opened: OpenedSecret): FieldReading`
  (`stopped` → `withheld(reason)`, `open` with a value → `value`, without → `absent`). The four automatic
  readers that today call `pinFieldRefusal` and then use the string themselves — `envApply.storedField` /
  `bindableFieldReading` (`envApply.ts:90-133`), `entityFieldReading.notesReading` / `totpReading`
  (`entityFieldReading.ts:57-81`), `agentUseActions.dbQueryAction` (`:304-313`), `transportFactory.findPrivateKey`
  → `usableDeployKey` (`:280-288`) — go through `automaticOpener` + `fieldReadingOf` instead (T3);
  `configCommands.configBodyReading` (`:120-126`) already does. `rotateAction.protectedSlot` (`:212-223`)
  keeps `pinFieldRefusal`: it refuses BEFORE the action runs and never reads the value.
- **Two scans read a stored string with no owner and skip what is sealed by design** —
  `hygieneScan.present` (`:111-121`) and `maskEntries.present` (`:121`) — and three tree hints judge one
  (`entityFlags.ts:249, 253`, `mcpEntries.storedSecrets` `:282-294`). `secretOpener.ts` gains two owner-less
  reads for them, each documented: `plainText(stored)` — the value when `readSecret` says `value` and NOT
  woven (hygiene grades nothing it cannot read as a password: today a damaged wrap and a woven pair are
  both graded as strong, unique passwords, the lie `hygieneScan.ts:102-106` describes for sealed values —
  T3's two RED tests); `unsealedText(stored)` — the text as stored unless sealed or absent (the masker keeps
  masking everything it can see, as `maskFailClosed` requires; the config-validity and URL hints keep
  judging exactly what they judge today).
- **The viewer's seam splits in two**: `StoredReader` (seven methods returning `StoredSecret | undefined` —
  `storageSecretReader` `:131-146` and `revisionSecretReader` `:189-205` both build one) and `SecretReader`
  (the opened text the page gets — built ONLY by `gatedSecretReader` `:159-175`). **A kept version is
  admitted ONCE, by `revisionDoor.openKeptVersion` (`:31-49`), and read through a SILENT gate after that —
  never through `clickOpener`** *(gate 2026-09-30, finding 0)*: the revision viewer's page
  (`revisionViewOptions`, `entityViewerCommands.ts:327-328, 331, 351`) gets
  `gatedSecretReader(revisionSecretReader(opened), silentPinGate(…), report)` (`pinGate.ts:68`), and every
  field of the opened copy answers `unprotected` from `openStored` (`pinGate.ts:79-88`) because §2.2 minted
  it as a plain form; a second `admitEntry` for a version the door admitted a moment ago is exactly the
  second question `silentPinGate` exists to prevent. The other two readers of a kept version's fields take
  the same road. The live viewer's history-row Copy (`entityViewCopy.ts:182-190` — a row nobody has opened,
  `options.history` is `storage.getHistory` raw at `entityViewerCommands.ts:138`) goes through
  `openKeptVersion` for that row and then the silent reader over the opened copy, its value leaving the
  synchronous switch for an async resolver as `resolveSecret` already is. *Show Config Changes* keeps
  `clickedSecret` for the LIVE body (`configCommands.ts:78`) and opens the kept body (`:60`, `:82`) through
  `openStored` with the silent gate over the grant that click left, in place of today's `clickOpener` —
  the finding named the viewer; the rule is the same for all three.

### 2.4 The write side: `Sealing` is the proof, `writerFor` is the one road

The 09-29 design: `writeEntry(storage, a, e, ticket, { plan, blobs, details, node })`, the ONLY function that
turns plaintext into a stored value, with a branded `SealTicket` from the door, from a new entry, or from
the unattended refusal. The shipped code has the ticket (`Sealing`) and two copies of the writer; this plan
brands the ticket and merges the copies. It does **not** fold the additions/removals order into a new
`writeEntry`: `applyAdditions` → node → `applyRemovals` (`applyFormSecrets.ts:34-58`, `entityEditCommands.ts:294-321`)
and Restore's plan-then-write (`restoreVersion.ts:17-32`) are Rule A as two review rounds shaped it, and
rewriting them is the blast radius the owner deferred this plan to avoid.

- **`Sealing` gains an unexported brand** (`sealingAtWrite.ts:39`): `{ kind: 'plain'; [PROOF]: true } |
  { kind: 'sealed'; pin; [PROOF]: true } | { kind: 'stopped' }`. Only `sealingAtWrite.ts` can construct one,
  through four functions: `sealingAtWrite(...)` (the interactive re-read, shipped `:75-94`),
  `sealingForNew(settled: CreatePin)` (a brand-new entry: `plain` when the folder asks nothing, `sealed`
  with the folder's PIN — `pinOnCreate.CreatePin` `:35-40`), `sealingForUpdate(storage, a, e, name)` (the
  share's *Update it* — `shareUpdateSeal.writerFor` `:98-105` moved and **tightened**, *gate 2026-09-30,
  finding 2*: `plain` with NO door when the existing entry holds no sealed slot AND no mark — the same
  test `unattendedSealing` makes, `lockedSlotCount(...).locked === 0` and `details.pinProtected !== true`
  — where `writerFor` asked only `firstLockedStored` (`pinAdmission.ts:101-113`: locked slots, never the
  mark) until 2026-10-01, so an entry carrying the mark with every slot empty was updated in the clear
  (fixed ahead of the epics, §2.7: `writerFor` now makes that very test and takes the first-PIN road);
  `sealed{pin}` through the door and the grant when the entry is protected by either; `stopped` when the
  person declined or the door said why. `shareUpdateSeal.updateInPlace` (`:52-69`) takes the `Sealing`
  and writes through `writerFor(storage, a, e, sealing, NOTHING_OPENED)` in both cases — the storage
  itself is never handed out as the writer, and `ShareWriter` (`:28-39`) goes with it), and
  `unattendedSealing(storage, owner)` (below).
- **`entryWriter.ts` (new)**: `EntryWriter` — `SecretWriter`'s twelve plaintext setters
  (`applyFormSecrets.ts:16-27`) plus the three raw ones `ShareWriter` needs (`shareUpdateSeal.ts:37-39`), so
  `ShareWriter ⊂ EntryWriter` and both Picks go — and `writerFor(storage, a, e, sealing, opened):
  EntryWriter`, which answers the **plain writer** (mints `plainSecret(v)` per slot — identity at run time)
  for `plain` and the **sealing writer** for `sealed` (today's `sealedWriter`, `editPrefill.ts:216-242`:
  sealed in memory before the raw setter, a value equal to `opened` skipped, `setPassword('')` still keep,
  attachment and image straight through, bound to ONE entry — over `NOTHING_OPENED` `:65-78` when there was
  no form). A `stopped` sealing has no writer: the caller returns, as every caller already does.
- **The storage stops being a writer.** After the flip (T5) `StorageManager`'s raw setters take
  `StoredSecret`, so `applyAdditions(storage, …)`, `store: storage`, `writeImportedSecrets(storage, …)` and
  `RotateDeps.store` no longer type-check: a writer can only come from `writerFor`, and `writerFor` only from
  a `Sealing` nobody outside `sealingAtWrite.ts` can make. That is the whole guarantee on the write side, and
  it is a type, not a scan. The callers that change hands: `entityEditCommands.saveEdit` (`:272-273`),
  `mcpHooks.makeAgentEntry` (`:74`), `commands/treeMutationCommands.ts:285` (Add), `shareInbox.ts:699-740`
  (accept; `updateInPlace` `shareUpdateSeal.ts:52-69` for an update), `importCommands.writeImportedSecrets`
  (`:111-129`), `applyExternalSecrets` (`externalSecretsApply.ts:71-95`, called at
  `treeMutationCommands.ts:581`), the rotation store (`extension.ts:688-691`, in place, net 0).
- **The unattended ticket permits nothing on a protected entry** *(gate finding 0)*:
  `unattendedSealing(storage, owner)` answers `plain` only for an entry with **no sealed slot and no mark**
  (`lockedSlotCount(...).locked === 0` — `entityPin.ts:246-255` — and `details.pinProtected !== true`),
  and `stopped` with the PIN sentence otherwise; it can never answer `sealed`, because nothing automatic
  holds a PIN. Its one caller today is the rotation store; `rotateAction.protectedSlot` (`:212-223`)
  already refuses before the action runs, and the proof is what turns "refused before" into "cannot be
  written without". **A refusal AFTER the far side changed never drops the value** *(E2 security review,
  finding 1 — fixed in the code-round fixes, `887a2b05`)*: `rotationStore.storeRotated` hands it to the
  person — stored under the entry's PIN through the door and a `sealed` proof, or, declined, offered to
  copy — and the agent is told `stored: false`; an unattended refusal never tells its caller to act "from
  the entry".
- **Interruption invariants** *(gate finding 1)*, unchanged from what shipped and now type-carried: the
  writer seals each value in memory before its own raw setter runs, so a process killed between two slot
  writes leaves every slot sealed-or-unwritten and never plaintext (`editPrefill.ts:246-254`,
  `restoreVersion.ts:17-21`); Rule A keeps the node consistent on either side of the kill
  (`applyFormSecrets.ts:41-46`); re-running the same Edit or Restore converges (`restoreVersion.ts:31-32`,
  the kill-and-rerun test of `revisionRestore.test.ts`). T4 adds the same test for the case §2.7 found.
- **A new entry in a folder that asks for a PIN is sealed before its first write.** The agent's create
  always was (`mcpHooks.ts:42-44, 74`); the person's Add is since 2026-10-01 (§2.7), and both already take
  one writer, `pinOnCreate.writerForNewEntry`. `sealingForNew` gives both the same branded proof and moves
  that writer behind `writerFor`; `applyCreatePin` (`pinOnCreate.ts:293-314`) keeps running after, as the
  idempotent sweep plus the history and the mark — sealing nothing, because nothing is left plain.

### 2.5 The slot table, widened — there is no `slotSpec.ts`

The 09-29 design added `SLOT_SPECS` (`name`, `label`, `bundleKey`) beside `SECRET_SLOTS`. `SECRET_SLOTS`
(`entitySlots.ts:45-124`) already carries `label`, `revisionField`, `read`, `write` and `remove`, and
`slotTable.test.ts` already holds its ten `revisionField`s equal to `SMALL_FIELDS` (`revisionHistory.ts:79`).
So the table is widened, not doubled: `SecretSlot` gains `bundleKey: SecretMapKey`; `RevisionSecrets` is
typed from `SMALL_FIELDS`; `snapshotForRevision` walks the table instead of ten hand-written reads
(`revisionSnapshot.ts:44-53` — ten getter references gone); `SEALABLE_MAPS` (`syncPinRule.ts:46-48`, today
derived from `SECRET_KINDS` minus two names) is asserted equal to the table's `bundleKey`s; and the coverage
test asserts `SECRET_SLOTS.map(bundleKey) ∪ {attachments, images}` equals `SECRET_KINDS.map(bundleKey)`
(`secretMaps.ts:48-71`, twelve rows). No behaviour changes.

### 2.6 The AST guard stays, and what the type adds to each of its claims

`pinReaderBoundary.test.ts` is kept as it is: the getters derived from `SECRET_SLOTS` (`:95-110`), the
`READERS` classification (`:54-89`), the per-read rule in the nearest function (`readerScan.ts:119-126`),
`GATED_BY_CALLER` (`:184-231`, 22 functions in 12 files). The division of labour after this plan:

- **The type proves the door was used** — somewhere on the value's path. A `StoredSecret` reaches text only
  through a funnel function, so a value handed to a sink, a file, a JSON payload or a `string` parameter
  without one is a compile error.
- **The AST proves it was used in the SAME function.** A function may read a getter, hand the
  `StoredSecret` to a helper in another file that opens it, and satisfy the type while breaking the
  per-function rule the 2026-09-30 review wrote (`PLAN_entry_pin_keeps_its_promise.md` §15, *The reader
  guard is per read*). The scan still names that function.
- **`GATED_BY_CALLER` neither grows nor shrinks by the flip.** Its entries are functions that read a getter
  with no primitive in the function and hand the value on; after T5 every one of them hands on a
  `StoredSecret` (`sshCredential.passwordOwner` `:105-115`, `transportFactory.findPrivateKey` `:280-288`, the
  seven `storageSecretReader` fields, the four `SlotRead` constants of `commands/entityCommands.ts:105-108`,
  `gitSigningKey.readKey` `:14`, `exportSecrets.secretsOf` `:86-120`, `pinAdmission.firstLockedStored`
  `:101-113`, `mcpEntries.storedSecrets`, `entityFlags.read`, `historyPin`'s two, `entityViewerCommands.nodeAt`,
  `revisionRestore.agreed`), so each entry's written claim — *"the caller opens it"* — gains a compile-time
  twin. T5 re-reads every reason for the slot it flips and appends *"(typed since T5)"*; the scan's own
  "listed but no longer needed" check (`:291-296`) is what keeps the list honest.
- The DOOR and REFUSAL primitive lists (`:91-92`) gain nothing: `fieldReadingOf`, `plainText`,
  `unsealedText` and `writerFor` are not primitives, they are what a primitive's answer goes through.

### 2.7 What the compiler will find that the tests did not — recorded in T0, fixed ahead of the epics

> **Both defects below were fixed on 2026-10-01**, on `fix/two-plaintext-windows` (pull request
> #175), before any epic was built — the cadence consultation's first advice (§9 row 4):
> a plaintext window in a shipped release does not wait for a refactor. Each was RED first against the real
> `StorageManager` with every keychain write logged, then green, then shown red again with its fix reverted.
> T4 keeps these tests green through its retyping instead of carrying them as REDs.

**The person's Add into a folder that asks for a PIN wrote every value in the clear, then sealed it.**
`commands/treeMutationCommands.ts:285` ran `applyAdditions(storage, …)` — the storage itself, plaintext —
and `applyCreatePin` (`:310` → `pinOnCreate.ts:306` `protectEntity`) sealed afterwards, *"because it wraps
what is THERE"* (`:308-309`). That is the *"write, then `protectEntity`"* order rule R3 rejected for Edit
(`PLAN_entry_pin_keeps_its_promise.md` §4 R3), and the agent's create in the same folder was deliberately
built the other way (`mcpHooks.ts:42-44`: *"not even for the moment 'write, then protect' would leave it
there"*). A kill between `:285` and `:310` left the new entry's values plain in the keychain under a node
that claimed nothing. **Fixed:** `pinOnCreate.writerForNewEntry(settled, storage, a, e)` — the storage for
`none`, `editPrefill.sealedWriter` over `NOTHING_OPENED` for `pin` — is the one writer both creates take:
Add's additions go through it (`treeMutationCommands.ts`, in `runCreate`'s `writeSecrets`) and the agent's
inline ternary (`mcpHooks.ts:73-74`) was replaced by the same call, so the sealing road exists once.
`applyCreatePin` still runs after either as the idempotent sweep, the history and the mark.
`test/addEntityPin.test.ts` holds the two cases through the registered `credSshManager.addEntity` handler:
RED *"the keychain was handed a value in the clear: hunter2-typed-into-the-form"* and *"the slot written
before the kill is in the clear"*; green; red again with the writer reverted to the storage. T4's
`sealingForNew` retypes this road; it does not change it.

**A share's *Update it* into an entry protected while empty wrote the arriving values in the clear.**
`shareUpdateSeal.writerFor` (`:98-105`) answered the storage whenever `firstLockedStored` found no sealed
slot — it asked the slots, never `details.pinProtected` — so an entry that carried the mark and held nothing
(*Protect with a PIN…* on an empty entry, §15 *Protected while empty* of the PIN plan) was updated plain
under its mark (gate 2026-09-30, finding 2). **Fixed:** `writerFor` answers the storage only for an entry
with no sealed slot and no mark; marked and holding nothing in any slot (`lockedSlotCount(...).total === 0`,
the test `sealingAtWrite.emptyAtOpen` and Edit's `protectedWhileEmpty` make) it takes the first-PIN road
Edit and Restore shipped — `pinOnCreate.firstPinFor`, typed twice or checked against the folder's protected
entries, granted to the window — and seals every arriving value under it through `sealingWriter`; a
declined first PIN updates nothing and keeps the share, as a declined door does. A payload that carries no
secret asks nothing (`FirstSeal.adds`, asked of the share's secrets). A mark over values in the clear is
the 0.99.0 false mark, which the door clears at the next open; it is updated as the plain entry it is.
`test/shareUpdateSeal.test.ts` holds it through the real `ShareInbox`: RED *"the arriving password is
stored in the clear in an entry protected while empty"*; green; red again with the mark test reverted.
T4's `sealingForUpdate` is this decision as a branded `Sealing`.

**Checked and left as they are, with the question named:** an accepted share into a folder that asks for
a PIN (`shareInbox.ts:693-698`, a fresh id) and an import into one (`importCommands.ts:111-129`) ask no PIN
and write plain — the PIN plan §15 *P5* recorded them as *"NEW ids only — correct as they are"*, and they
are, for R3: the entry they write is not protected. Whether such a folder should ask at accept and import
as it does at Add and at an agent's create (D-B) is the owner's call, not this plan's; the typed writer
makes their `plain` proof visible (`sealingForNew({ kind: 'none' })`) rather than silent.

## 3. Honest limits — the funnel

`as never` / `as unknown as` casts defeat any brand, and the object phantom does not catch a `StoredSecret`
in a template literal, a `+` concatenation, `String(s)`, `JSON.stringify(s)` or a truthiness test — TypeScript
accepts every type in those positions. So the type is backed by one **funnel test** (`test/storedSecretFunnel.test.ts`),
over the TypeScript compiler API the reader scan already uses (`readerScan.ts:1, 36`):

1. **The allowlist (syntax).** The modules that may call `stored(`, `carried(`, `readSecret(`,
   `isLockedSecret(`, `isCorruptSecret(`, `isWovenSecret(`, `plainSecret(`, `lockSecret(`, `sealValue(` or
   write `as StoredSecret`, each with its reason — the 09-29 list of twelve was written before the PIN plan
   added the door and history modules, and today's callers are these:

   | module | why it may |
   |---|---|
   | `storedSecret.ts` | the type, `stored`, `carried` |
   | `storageManager.ts` | mints at `this.secrets.get`; the typed setters serialise then store |
   | `secretEnvelope.ts`, `sealValue.ts`, `pinAttempts.ts` | the parser, the three producers of a stored form, the one `unlockSecret` choke point (already pinned, `pinReaderBoundary.test.ts:342-352`) |
   | `revisionHistory.ts`, `revisionStore.ts` | the kept versions' parse boundary (`isRevisionList`, `pushRevision`) |
   | `secretMaps.ts`, `syncPinRule.ts`, `syncProtection.ts` | the raw carriers: chest ↔ bundle maps, the sealed-state rule over map strings (`syncMerge.copySecret` takes the rule, never parses), `revisionFromSnapshot` |
   | `exportSecrets.ts`, `sharePayloadBuild.ts`, `shareRecipientPin.ts` | stored → wire (`carried`), and the recipient's own wrap of an arriving payload (`:99-108`) |
   | `entryWriter.ts` | text → stored: the plain and the sealing writer |
   | `pinGate.ts`, `pinAdmission.ts`, `secretOpener.ts`, `pinClick.ts` | the doors, the refusals, the two owner-less reads |
   | `entityPin.ts`, `historyPin.ts`, `restoreVersion.ts` | seal and open in place — carriers that parse |
   | `entitySlots.ts` | the table: types only, no cast, no parse |

   The test fails naming any other file that calls one of these, with a **negative fixture** — a source
   string outside the allowlist that calls `carried()` must be reported — and a **positive control**: the
   scan still finds `exportSecrets.ts`'s `carried(` and `secretOpener.ts`'s `readSecret(` *(gate finding 2;
   the structural-test rule of `testing.md`)*.
2. **No truthiness, no stringification (type-aware).** One `ts.Program` over `src/**` (excluding `test/`)
   and its checker: every template span, `+` operand, `String(...)` / `JSON.stringify(...)` argument, and
   every operand of `!`, `&&`, `||`, `??`, `? :` or an `if` whose type is `StoredSecret` (by symbol
   identity) is a failure outside the funnel *(gate finding 4)*. Presence stays `!== undefined` — and that
   is ENFORCED today, not merely intended: the nine presence reads (§10) are all `!== undefined`, and
   `readerScan.isPresenceShape` (`:152-177` — the call, climbed through `await` and parentheses, compared
   with `undefined` by `!==` and nothing else) is the rule of the `presence` class in
   `pinReaderBoundary.test.ts` (`READERS` `:59-60, 81`: `editPrefill.ts`, `entityEditCommands.ts`,
   `sharePayloadBuild.ts`; applied per read at `:171-172`, with its own teeth at `:266`). The type-aware
   half adds the same rule for every expression typed `StoredSecret`, in whatever function and file, which
   is why the second round's finding 1 — asking for that shape to be pinned — was rejected rather than built
   (§8.2). Time-boxed: the program build is measured in T2; above ~10 s on CI this half is recorded as a
   limit and the syntax half stands alone.
3. **The compile-fail harness** (`test/typedFixtures.test.ts`, gate finding 5) runs INSIDE `npm test`: every
   file under `src/test/fixtures/typed/` carries a first-line `// expect TS<code> at line <n>` or
   `// expect compiles`; the harness builds a program per fixture with the project's own `tsconfig`
   options and asserts exactly that diagnostic at that line, or none. The fixtures are excluded from
   `tsc -p ./` and from `eslint src` (one line each in `tsconfig.json` and `eslint.config.mjs`), which is
   why the harness has to be a test and cannot be the build.

Type-aware ESLint rules stay out (CI cost, as gated); the checker in item 2 is one test file, not a lint
pass over every rule. Review watches casts in production code.

**Two limits the cadence consultation named (2026-09-30, §9 row 4), both verified against the code:**

- **The phantom changes nothing at run time.** `StoredSecret` is a `string` with a compile-time brand:
  `JSON.stringify` in `revisionStore.ts`, every `===`, and `structuredClone` see the same strings they see
  today, so no stored byte, no revision and no sync payload moves. That is what makes T5 a flip and not a
  migration — and it is also why the type proves nothing about a value that was cast.
- **During T5's first ten commits the compiler protects nothing on the write side.** The seams accept
  `StoredSecret | string` for the duration (§4 T5), so `applyAdditions(storage, …)` and
  `storage.set<Slot>(a, e, plaintext)` still type-check through the whole window, and a NEW plaintext write
  added in it is a compile error nowhere. In that window the guarantee rests on **T4's interim scan rule
  alone** — *no `applyAdditions(storage`, `store: storage` or `storage.set<Slot>(` outside `entryWriter.ts`
  and `entitySlots.ts`, and no `slot.write(storage` outside its `file#function` allowlist* — which is why it
  is retired in T5's eleventh commit and not a moment earlier: the
  commit that takes the `| string` off the seams is the one where the type takes over from the scan.

**What the type does not catch, and the rule that does** *(E3, deviation — coordinator decision 2026-10-01)*.
As built, the writer side closed at T5's FIRST flipped slot, not at the eleventh commit: the `| string`
window only ever covered the read seams, and once `setPaymentRaw` took `StoredSecret` the storage satisfied
no `EntryWriter` (`fixtures/typed/storage_is_not_a_writer.ts` compiles at `49e34949`, TS2345 from
`85f0ac13`). The interim rule's two PLAINTEXT-writer patterns — `applyAdditions(storage` and `store: storage`
— were retired in the eleventh commit because the type refuses them. Its other patterns stay as a
**permanent** funnel rule, not an interim one: no slot setter called on the storage itself outside
`entryWriter.ts` / `entitySlots.ts`, and no `slot.write(storage` / `slot.store(storage` outside its
`file#function` allowlist (Protect's `sealIfStill`, `unprotectEntity`, Restore's `writeSealed`). The phantom
cannot tell a plain stored form from a sealed one, so copying a plain stored form into a protected entry
type-checks — and the typed setters (`setFields`, `setPayment`, `setSecond`) still take a record.

## 4. Build order — three epics, six stories

Every story leaves the build green on its own: `npm run typecheck`, `npm run lint`, `npm run ratchet`
(`extension.ts` 1038 — 1037 since the E2 code-round fixes moved the rotation's store out —, `storageManager.ts` 1015 — `.size-baseline.json`; the plan's earlier 1023 was lowered
by the PIN plan P8), `npm test`. Every RED is watched failing for the real symptom before its fix, and both
observations go into the commit. The model per story follows the gate's operator command (§8.2): ordinary
stories on Opus, security- or architecture-critical ones on Fable (max), with the reason named. The story
ids T1–T6 are kept — §2, §5, §7 and §10 cite them — and each now carries its epic's number beside it.

### 4.0 Epics, gates and the consultation cadence

The second plan round (§8.2) came with three operator commands that outrank the review rule's defaults;
this is what they mean for THIS plan:

- **Three epics of two stories** — T1–T6 regrouped, none added, none split; T0 is done and is not an
  epic. **The gate runs once per epic.** Each epic is its own branch, cut from the previous epic's last
  commit: `feat/typed-secrets-e1` from `main` at the merge of this revision, `feat/typed-secrets-e2` from
  E1's last commit, `feat/typed-secrets-e3` from E2's. Per epic, in order: `review_plan` over this file
  verbatim before its first story, declaring `plan: todo/PLAN_typed_stored_secrets.md` (its path until the promotion) and `epic: k/3`;
  its stories built, each RED watched, each commit green; then ONE `review_code` over the epic's whole
  diff with the previous epic's last commit as `baseRef` (for E1, the `main` commit it was cut from), the
  same declaration. **Each epic ends green and mergeable on its own** — its own pull request into `main`,
  merged in order, so the next epic's branch starts from a merged base and never from an open one.
- **The split on Fable, each story on the model it names.** This split was made on Fable 5.1 (the
  operator's *highest available version*); E1 and E3 build on Opus, E2 on Fable (max), with the reason
  beside every story below. A story's model is not a suggestion: a subagent launched for it is launched
  with that model and says so in its summary.
- **One consultation for the group E1–E3.** The cadence is one consultation per group of three epics,
  BEFORE the group is built (`coai-consultant.md`, trigger 7). Three epics are one group, so ONE
  `consult` — the `CONSULT ON A CADENCE.` call as the round's reply writes it (`kind: cadence`, this plan,
  epics E1–E3) — before E1's first story: is this group right, where is it weak, what did it forget. It
  is closed with `close_consult` and an outcome once its advice has been verified against the code, and
  recorded as row 4 of §9. Its outcome may move a story between epics; it does not add one.
- **The whole-plan rounds are §8**: the 2026-09-29 round over the first text (§8.1) and the 2026-09-30
  round over this revision (session `bc788c97`, §8.2). The per-epic rounds are written into the table
  below as they run, and the promotion carries all of them.

| epic | branch | cut from | stories (model) | plan round | code round | PR |
|---|---|---|---|---|---|---|
| **E1** — foundations | `feat/typed-secrets-e1` | `main` at `9f62e4db` | T1, T2 (Opus) — built 2026-10-01, commits `f038982c` (T1) and `9e380014` (T2) | session `9f8e746d`, **proceed**, 1 of 2 reviewers (Codex rate-limited); finding 0 accepted — the harness resolves its fixtures from the package root, a run that finds zero fixtures FAILS, and the compiles-fixture is the positive control (all three built and shown red, T2's commit); finding 1 accepted as a check — the ratchet's output is recorded per commit (both commits: 1038 / 1015, at baseline) | session `9f8e746d`, **proceed**, 4 of 8 reviewers (Codex rate-limited), 6 findings: 5 rejected with reasons — the serial slot reads (2, 4) are the shipped order unchanged and parallel reads would not close a torn snapshot, only move it; the `undefined` overload (0) never drops `undefined` from the type; `read` returning `string` (1) is T5's staged flip; the pinned fixture line (3) is what proves the error sits on the statement under test — and finding 5 accepted: the harness hands each fixture's program to the next as `oldProgram`, so the lib files are parsed once (3 fixtures: 1.9 s → 1.5 s) | #176 |
| **E2** — the doors | `feat/typed-secrets-e2` | `main` at `9369b4d3` (E1 merged, #176) | T3, T4 — planned on Fable (max), **built on Opus 5.5, because Fable was rate-limited (2026-10-01)**; built 2026-10-01, commits `d8339155`, `275b9230`, `28fd17fd`, `6544409f`, `d39e9712` (T3) and `80574e5d`, `98839d13` (T4) | session `67779c80`, **proceed**, 1 of 2 reviewers (Codex rate-limited), 2 findings rejected — answered by §2.3 (the doors' answers for absent / plain / woven / sealed / damaged) and §2.4 (the branded `Sealing` and the `stopped` contract) | session `67779c80`, **proceed**, 8 of 8 reviewers, 15 findings — **11 accepted and fixed** (0 and 6: `writerForNew`'s `fresh` proof verified at its first write, `5683b799`; 1, 4, 7, 9, 10, 12: every plain write under the lease with its own re-check, no cached promise, `b2b9d0da`; 3: the health-report pin for a woven / sealed / damaged connection string, `f19ae9f0`, green on arrival; 5 and 14: the rotation's no-loss road and an unattended refusal that names no step "from the entry", `887a2b05`), **4 rejected** (2: a plain proof is only issued over zero sealed slots; 8: kept versions are read silently by design, §2.3; 11: each slot is sealed before its own setter, R3 holds; 13: bundle restore is sequential by design, there is no keychain bulk API). Own security review (Opus): rotation no-loss (`887a2b05`), Restore around the lease (`4bd853c0`), Protect around the lease (`11f9e0fc`), `creds_list` damaged wrap (`203307be`), batch accept (`300789d2`) — all fixed. **Second round** (`again`), **proceed**, 8 of 8 reviewers, 11 findings — **6 accepted and fixed** (0–4: `writerForNew` verified at EVERY write under the lease, nothing remembered, and an unreadable tree (`metadataFault`) takes the re-checked road — REDs *"a 'new' writer remembered its first check and wrote in the clear into an entry protected since"* and *"an unreadable tree was read as 'no node'"*; 5: `entitySlots.ts` imports `StorageManager` as a type), **5 rejected** (6: new ids are freshly minted and never reused, so no orphan slot can carry one; 7 and 8: Protect's in-lease re-seal happens only when a plain write landed on that slot during its ~1 s outside seal, and is one bounded step — a retry loop outside can be overtaken indefinitely; 9: a plain writer cannot know where its caller's batch ends and must never hold the lease across caller code that may ask, so one lease per write is the price — at most ten writes of an interactive save; 10: every remaining catcher of the interactive sentence is interactive, the unattended one is translated). **PR #177:** CodeRabbit — the sealing writer committed outside the lease, so a sealed value could land between Protect's re-read and its write and be lost: fixed, each commit under the lease and the scrypt outside it (RED *"a sealed value was committed outside the lease"*, actual `['setNotes OUTSIDE the lease', 'setPassword OUTSIDE the lease']`); three docs that contradicted the code fixed; the `notSavedNote` nit rejected (the toast is for a person and keeps the sentence, the log keeps the `kind`). Sonar: nested template, optional chains and `.at` fixed; `await` in a loop left (sequential by design, read-modify-write) and the `error_` catch-name rule left (not this repo's convention) | #177 |
| **E3** — the flip and the finish | `feat/typed-secrets-e3` | `main` at `2be95db5` (E2 merged, #177) | T5, T6 (Opus 5.5) — T5 built 2026-10-01, commits `85f0ac13`, `854e9342`, `76bd974f`, `aaf6006e`, `b7863a4d`, `7b98398c`, `e2b3715d`, `27bd099c`, `2bf5f8a1`, `5dc944d1` (the ten slots) and `f474f3d4` (the seams); T6's docs written | session `a48a7ccb`, **proceed**, 2 of 2 reviewers, 5 findings: 1, 2, 3 accepted (`49e34949`), 0 and 4 rejected | session `a48a7ccb`, **proceed**, 8 of 8 reviewers, 4 findings — 0 accepted and fixed (`f646303a`: `sealText` / `sealValue` split, RED fixture `seal_value_takes_no_text`); 1 and 3 rejected (`''` / `undefined` both mean keep at `storageManager.setPassword` :703); 2 rejected (`automaticOpener` never opens a sealed envelope; same path before E3; allowlist narrowed to the function — `455714be`). Independent test-diff check: 49 changed assertions byte-identical modulo `stored()` / `carried()`; two funnel weakenings closed (`3fbb7565` the storage under another name, `455714be` the per-function allowlist). **PR #178:** CodeRabbit — a kept field read back as `null` from a damaged or older history record crashed Protect's history pass (`isEmptySecret` asked `=== undefined`; RED *"TypeError: Cannot read properties of null"*, fixed with `typeof`); the storage destructured under another name (`const { storage: kept } = deps`) escaped the stored-form rule (RED, fixed); three docs narrowed to what the compiler actually refuses (an API typed `string`, not a template literal, `String()` or `JSON.stringify`). Sonar: the test re-export, fixed; `await` in a loop left (sequential by design) | #178 |

- [x] **T0 — Re-verify, count, gate the revision.** Done 2026-09-30, on Fable as the operator asked: the
      re-read and the counts (§10), the consultation (§9), the second plan round over this text (§8.2,
      `proceed`) and this split.

### E1 — Foundations: the table is the one list, the type exists, the harness runs (Opus)

**Why the cut is here.** After E1 nothing returns a `StoredSecret` yet: a column on the table, a type
nobody returns, a harness with three fixtures. Merged alone it is invisible to a person and to the PIN
plan's suite, and it is the ground the other two stand on — E2's funnel test and E3's per-slot fixtures
land in E1's harness, and T5 walks E1's table. The cut is after T2 rather than after T1 because a harness
without a type has no positive control and a type without the harness has no teeth. Opus: no judgement
is made in either story.

- [x] **T1 (E1) — The slot table is the one list.** `SecretSlot.bundleKey`; `RevisionSecrets` typed from
      `SMALL_FIELDS`; `snapshotForRevision` walks `SECRET_SLOTS`; `SEALABLE_MAPS` asserted against the
      table; the coverage test. Files: `entitySlots.ts`, `revisionHistory.ts`, `revisionSnapshot.ts`,
      `syncPinRule.ts`, `test/slotTable.test.ts`, the `syncPinRule` tests.
      **RED:** *every bundle key the vault stores is a slot's `bundleKey` or one of the two outside the PIN,
      and no slot names a key the vault does not store* — red as TS2339 (`bundleKey` does not exist on
      `SecretSlot`): a compile failure that names the missing column IS the symptom. **Guard (green before
      and after, and said so):** *`snapshotForRevision` reads exactly the table's getters* — the recording
      storage of `pinReaderBoundary.slotGetters` (`:95-110`) against what the snapshot calls.
      **Model: Opus** — one table widened, no behaviour. **DoD:** no behaviour change; `slotTable`,
      `pinSlotMatrix`, `pinReaderBoundary`, `syncMerge` green unchanged; ratchet unchanged.
      **Done 2026-10-01, `f038982c`** (Opus). RED as planned: `TS2339: Property 'bundleKey' does not exist on
      type 'SecretSlot'` at both new tests; the guard green over the ten hand-written reads and over the table
      walk, and red (`- 'getSecondRaw'`) with one read deleted. **Deviations:** `SecretSlot.read` takes
      `SlotSource` — the `Pick` of the ten getters, moved from `revisionSnapshot.ts:20-32` into `entitySlots.ts`,
      `RevisionSource` now its alias — because the snapshot is handed that narrow source and must walk the table
      without a cast (T5's structural interface for the snapshot is therefore `entitySlots.SlotSource`); the
      guard lives in `slotTable.test.ts` with its own recording storage, so `pinReaderBoundary.test.ts` stays
      byte-unchanged; the SEALABLE_MAPS equality is a new test beside the count test, which was not edited.
      **Left as found, a question for E2/E3:** `syncProtection.SNAPSHOT_MAP` (`:109-120`) is a third copy of
      the revision-field → bundle-map pairing the new column carries; it could be derived from the table.
- [x] **T2 (E1) — `StoredSecret` exists, and the compile-fail harness runs in `npm test`.** `storedSecret.ts`;
      `test/typedFixtures.test.ts` with its first fixtures — `stored_is_not_a_string.ts` (TS2322),
      `a_string_is_not_stored.ts` (TS2322), `carried_is_a_string.ts` (compiles); the `tsconfig` / ESLint
      exclusions; the program-build timing for §3 item 2. Nothing returns a `StoredSecret` yet.
      **RED / teeth:** new infrastructure has no failing predecessor, so its teeth are proven the other
      way round (`testing.md`, *if the fix already landed*): with `type StoredSecret = string` planted, the
      harness must fail *"expected TS2322 at line 7 of stored_is_not_a_string.ts — the fixture compiled"*;
      restored, green. Both observations in the commit.
      **Model: Opus** — a type, a harness, two config lines. **DoD:** harness green with its positive
      control; `npm run compile` unaffected by the fixtures; timing recorded in the commit.
      **Done 2026-10-01, `9e380014`** (Opus). Teeth: with `type StoredSecret = string` planted, *"expected
      TS2322 at line 7 of stored_is_not_a_string.ts — the fixture compiled"* (and the same for
      `a_string_is_not_stored.ts`), restored green; an empty directory and the `out/test/fixtures/typed`
      path both fail *"no fixtures under … — a harness over nothing passes"*; the compiles-fixture removed
      fails the guard; a header naming the wrong line reports the line it got. **Timing for §3 item 2:**
      one fixture program 0.4-1.1 s; one program over `src/**` without `test/` (508 roots, 670 source files)
      builds in 1.0-1.2 s and is fully checked in 4.8-6.3 s more — 5.9-7.4 s in all on this machine, under
      the ~10 s box; CI unmeasured. `out/test/fixtures` is not emitted.

**E1 DoD:** T1's and T2's DoDs; no behaviour change — the whole suite green with no assertion edited;
ratchet unchanged; the harness's teeth proven both ways in the commit; `review_plan` (epic 1/3) and
`review_code` over E1's diff against `main` both `proceed`, the cadence consultation closed with an outcome
before T1 began; the PR merged into `main`.

### E2 — The doors: every read converges on an opener, every writer comes from a `Sealing` (Fable, max)

**Why the cut is here.** These are the two judgement stories and the only two that change behaviour —
hygiene's two fixes; the Add sealed before its first write and the update into a marked entry were ALSO
behaviour changes here until the hotfix of 2026-10-01 shipped them ahead (§2.7), and T4 now retypes
those two roads with their tests green — grouped so that ONE code round sees every decision about where text comes from and where it goes,
while the getters and setters are still `string`: the reviewer reads doors and writers, not 185 signature
changes. E2 ends with T4's interim scan rule standing in for the type, which is what keeps the merged
state honest until E3 retires it, and it is its own PR because it is the one whose regression would be a
secrets regression — mergeable alone, bisectable alone. Fable (max) because a wrong default for an absent,
plain, woven, sealed or damaged value, or a writer the storage can still satisfy, is D7 and R3 again — the
two defects the owner's data loss came from — and a later round cannot repair a release that shipped one.

- [x] **T3 (E2) — The reads converge on the doors.** Outside the funnel no module parses a stored string or uses
      a getter's result as text. `secretOpener.ts` gains `fieldReadingOf`, `plainText`, `unsealedText`;
      `envApply.ts:90-133`, `entityFieldReading.ts:57-81`, `agentUseActions.ts:304-313`,
      `transportFactory.ts:280-288` go through `automaticOpener`; `hygieneScan.ts:111-121`,
      `maskEntries.ts:121`, `entityFlags.ts:249, 253`, `mcpEntries.ts:282-294` through the owner-less reads;
      `viewerOptions.ts` splits `StoredReader` / `SecretReader`, and the revision viewer
      (`entityViewerCommands.ts:327-328, 331, 351`), the history-row Copy (`entityViewCopy.ts:182-190`) and
      *Show Config Changes* (`configCommands.ts:60, 82`) read a kept version through the SILENT gated reader
      — admitted once by `openKeptVersion`, never through `clickOpener` (§2.3, gate 2026-09-30, finding 0);
      the funnel test's syntax half lands here. Getters and setters are still `string`: every step is a
      refactor the PIN plan's suite must not notice.
      **Guard (finding 0, green before and after, and said so):** *viewing, copying from and comparing a
      kept version of a protected entry asks for the PIN ONCE* — the `boxes` count `pinClickPaths` asserts
      for the live paths (`:123, :213, :224`), over the three kept-version readers; a grant in the session
      already keeps the second `admitEntry` silent today, which is why this is a guard and not a RED.
      **RED (finding 0, structural, red today):** *no reader of `Revision.secrets` calls `clickOpener`* —
      `configCommands.ts:82` does today — carried by the funnel test beside its allowlist.
      **RED (behavioural, red today):** *a damaged wrap is not graded as a password by the health report*;
      *a woven password is not graded as a strong, unique password* — `hygieneScan.test.ts`, the fixture a
      real `lockSecret` / `plainSecret(value, true)`. **RED (structural, red today):** *no module outside
      the funnel parses a stored string* — the allowlist names `hygieneScan.ts`, `maskEntries.ts`,
      `entityFlags.ts`, `envApply.ts` today. **Break-it, per moved site:** delete the primitive the site now
      goes through and watch `pinSlotMatrix` / `pinReaders` / `entityFieldReading` / `envApply` go red for
      that cell — recorded in the commit for each of the twelve files.
      **Model: Fable** — it is the door: what an automatic reader answers for an absent, plain, woven,
      sealed or damaged value is decided in ten modules at once, and a wrong default is D7 again.
      **DoD:** the PIN plan's suite green unchanged; the funnel's syntax half green with its negative
      fixture and positive control; `readerScan`'s `READERS` table unchanged; ratchet unchanged.
      **Done 2026-10-01, `d8339155` `275b9230` `28fd17fd` `6544409f` `d39e9712`** (Opus 5.5 — Fable was
      rate-limited). Every RED watched first: the funnel listed exactly the four files named above
      (`entityFlags.ts:249, 253`, `envApply.ts:108`, `hygieneScan.ts:117`, `maskEntries.ts:121`) and the
      `clickOpener` rule `configCommands.ts`; hygiene's two (*"a damaged wrap was graded as a password"*,
      *"a woven pair was graded as a password"*). The guard (one box for viewing and copying a kept version)
      green before and after. Break-it per moved site recorded in each commit. **Behaviour found and fixed on
      the way, each RED first:** a DAMAGED wrap was handed on as text by all four automatic readers (the
      broker's db query launched the client with it); an agent was shown a sealed connection string's
      envelope (`mcpEntries`); the revision viewer copied a woven kept password as its envelope, and the
      live viewer's history-row Copy put a protected entry's kept envelope on the clipboard
      (`entityViewCopy` read `options.history[i].secrets` raw — now `EntityViewOptions.resolveRevision`,
      through `openKeptVersion` and the silent reader). **Deviations:** (1) `fieldReadingOf(opened,
      claimedBy?)` takes the entry: built as written, `pinSlotMatrix` went red ten times (*"an automatic
      reader was handed {"kind":"absent"}"*) — the opener answers an absent value as absent while
      `pinFieldRefusal`, which terminal variables and `creds://` asked, refuses on the mark alone; envApply and
      entityFieldReading pass the entry, the db query and the deploy key do not (they said "nothing stored"
      first, and still do). (2) `pinReaderBoundary`'s refusal primitives gain `plainText(` and
      `unsealedText(` — §2.6 said they would gain nothing, but `READERS` is unchanged, the scans' files are
      `automatic`, and the funnel no longer lets them call `isLockedSecret(`, so without it the boundary named
      `hygieneScan.entryFor` ungated; `GATED_BY_CALLER` unchanged. (3) *Show Config Changes* opens the kept
      body through `pinClick.grantedOpener` — `clickOpener`'s silent half, extracted — rather than a bare
      `openStored`, so a stop is said in the same words. (4) The funnel's positive control for `carried(` in
      `exportSecrets.ts` cannot exist before T5 (nothing calls `carried` yet); the control is the parser's and
      the producers' known callers. (5) `mcpEntries` reads through `unsealedText` in the shaper, not in
      `storedSecrets`, which stays a caller-gated function.
- [x] **T4 (E2) — One road to a writer.** `sealingAtWrite.ts`: the brand, `sealingForNew`, `sealingForUpdate`,
      `unattendedSealing`. `entryWriter.ts`: `EntryWriter`, `writerFor`, the plain and the sealing writer —
      `editPrefill.sealedWriter` (`:216-242`) and `shareUpdateSeal.sealingWriter` (`:111-125`) deleted;
      `SecretWriter` and `ShareWriter` replaced by `EntryWriter`. Callers: `entityEditCommands.ts:272-273`,
      `mcpHooks.ts:74`, `commands/treeMutationCommands.ts:285`, `shareInbox.ts:699-740`,
      `shareUpdateSeal.ts:52-69, 98-105`, `importCommands.ts:111-129`, `externalSecretsApply.ts:71-95`,
      `extension.ts:688-691`. Until T5 the storage still satisfies `EntryWriter` structurally, so T4 adds the
      funnel test's rule *"no `applyAdditions(storage`, `store: storage` or `storage.set<Slot>(` outside
      `entryWriter.ts` and `entitySlots.ts`"* — and, since the E2 code-round fixes, *"no `slot.write(storage`
      outside an allowlist keyed `file#function`, each with its reason"* (Protect's `sealIfStill`, Remove
      PIN's `unprotectEntity`, Restore's `writeSealed`) — retired in T5's last commit, where the type takes over.
      **The decision and the writes under one lease** *(CodeRabbit on the hotfix PR #175, CWE-362, recorded
      2026-10-01)*: every writer today — the share update's `writerFor`, and on `main` before the hotfix too —
      reads the entry's state (a sealed slot? the mark?) and writes LATER, outside one cross-window lease, so
      another window protecting the entry in between can receive a plain write. The door's heal
      (`pinAdmission.healProtected`) seals such a stray value at the next open, which is why it is a narrow
      window and not an open hole; closing it is T4's to do, because `writerFor` is where the decision moves:
      a plain `Sealing` is re-validated under the same lease as EVERY slot write, each with its own re-check
      (a sealed slot or a mark the decision did not see → that write is refused and the person told, as
      `sealingAtWrite` refuses a form whose protection changed; nothing is cached, so one failed write never
      fails the next); a `fresh` proof is verified at EVERY write under the lease (a readable tree, no node carries the
      id — nothing remembered between writes); **Protect takes the same lease** — each slot sealed outside it and written inside it after the slot
      is read again, a value changed in between sealed instead of overwritten — so the re-check guards
      against Protect too; and no lease is ever held across a PIN box or a modal. RED first: *a share update
      whose entry is protected by another window between the decision and the write stores nothing in the
      clear*. *(As first built, only the first write was re-checked and Protect wrote around the lease; the
      E2 code round and its security review found both, and the code-round fixes below closed them.)*
      **Guard (green since the hotfix of 2026-10-01, §2.7 — kept green, not a RED):** *a person's Add into
      a folder that asks for a PIN never writes a value in the clear — the keychain's write log sees only
      sealed values*; *an Add into a PIN folder killed after its first slot write leaves that slot SEALED and
      the node absent, and running it again converges* (gate finding 1) — both in `addEntityPin.test.ts`
      over the registered Add handler, and T4's `sealingForNew` + `writerFor` must leave both exactly as they
      are, like the rest of the PIN plan's suite. **RED (new behaviour, tests first):** *the unattended
      sealing of an entry with a sealed slot is `stopped` with the PIN sentence; of an entry with the mark
      alone, `stopped`; of a plain unmarked entry, `plain`; it is never `sealed`* (gate finding 0);
      *an update from a share into a protected entry seals every arriving value and keeps the mark and
      epoch* (`shareUpdateSeal.test.ts`, unchanged and green — the oracle). **Guard (gate 2026-09-30,
      finding 2 — green since the hotfix of 2026-10-01, §2.7):** *an update from a share into an entry that
      carries the mark and holds no sealed slot asks for its first PIN and seals every arriving value*,
      *a declined first PIN updates nothing and keeps the share*, and *an entry with no sealed slot and no
      mark is written plain with no entry PIN asked* — three cases in `shareUpdateSeal.test.ts` that
      `sealingForUpdate`'s three answers (`plain` / `sealed{pin}` / `stopped`) must leave green; until the
      hotfix `writerFor` saw no locked slot and handed back the storage (`shareUpdateSeal.ts:99-101`).
      **Compile-fail fixture:**
      *`writerFor` refuses a `Sealing` that was not made by `sealingAtWrite`* — `{ kind: 'plain' }` handed
      in is TS2345; teeth proven by removing the brand.
      **Model: Fable** — every writer into the keychain changes hands, and R3 is the rule the owner's data
      loss came from.
      **DoD:** `editProtected`, `emptyProtected`, `shareUpdateSeal`, `revisionRestore`, `agentCreatePin`,
      `writeOrderPaths`, `pinSlotMatrix` green unchanged; `editPrefill.ts` and `shareUpdateSeal.ts` shrink;
      `storageManager.ts` and `extension.ts` line-neutral.
      **Done 2026-10-01, `80574e5d` `98839d13`** (Opus 5.5 — Fable was rate-limited). The unattended
      sealing's answers RED as TS2305 first, then green, with teeth (always-plain → *"an unattended write was
      permitted into an entry with a sealed slot"*); the compile-fail fixture `sealing_is_a_proof.ts` red with
      the brand removed (*"the fixture compiled"*); the interim rule red over the pre-T4 tree (39 findings in
      seven files). The lease: the existing cross-window lock is `StorageManager.writes` (the `LeasedQueue`
      over `windowLock.ts`), reused, not a second one. Its RED was shown with the re-check taken out — the
      test was written after the writer, so testing.md's *fix landed first* route: *"the arriving password
      reached the keychain in the clear, in a protected entry"*. `editPrefill.ts` 288 → 192 lines,
      `shareUpdateSeal.ts` 196 → 131; ratchet 1038 / 1015, at baseline. **Deviations:** (1) the plain proof
      carries what its decision saw of the mark (`marked`) and whether the entry is brand new (`fresh`): the
      re-check refuses a sealed slot or a mark the decision did NOT see, because `sealingForUpdate` and
      `sealingAtWrite` legitimately answer `plain` over a mark on values in the clear (the 0.99.0 false
      mark), and a new id has nothing to re-check; (2) `stopped` carries `reason` (`''` when said or
      declined, the PIN sentence for `unattendedSealing`) — the `OpenedSecret` contract; (3) `sealingForUpdate`
      takes its two doors as arguments so `sealingAtWrite.ts` stays pure of `vscode`; (4) `EntryWriter` adds
      `setSecondRaw` to the plan's list (an external bundle's import writes it) — fifteen setters;
      (5) `entryWriter.writerForNew` (`sealingForNew` over `NOTHING_OPENED`) and `writeUnattended` are the
      two shapes callers take, both behind `writerFor`; an accepted share and an import take `writerForNew`
      with no PIN (§2.7's question stays the owner's); `applyExternalSecrets` makes one writer per entity;
      (6) `StorageManager.writes` is made public instead of a new method — line-neutral; (7) the interim rule
      does not report a slot setter called with the literal `undefined`: a deletion writes nothing in the
      clear, and `writeOrderPaths` (the PIN suite) holds `applyRemovals`' `setNotes/setFields/setPayment/
      setConfigBody/setSecond(…, undefined)` by name; (8) `applySecrets` had no caller and was deleted; (9) two
      test fakes changed mechanically — `editProtected.test.ts` takes the sealing writer from `writerFor`,
      `envSaveNotice.test.ts`'s storage offers `writes`. ~~**Known limit:** `protectEntity` does not take the
      lease~~ — closed by the code-round fixes below.
      **The code-round fixes, 2026-10-01** (Opus 5.5; each RED first with the real symptom, then green, then
      red again with its fix reverted — every observation in its commit): `b2b9d0da` every write of a plain
      writer under the lease with its own re-check, no cached promise (findings 1, 4, 7, 9, 10, 12 — RED
      *"the second write of a plain writer reached the keychain in the clear, after the entry was
      protected"*, *"a later write was blocked by an earlier write's passing failure"*); `11f9e0fc` Protect
      seals each slot atomically with the lease — sealed outside, the slot read again inside, a value changed
      in between sealed inside the lease (one step: a loop outside could be overtaken without end), an
      empty entry's mark a leased node write (security review finding 3 — RED *"Protect sealed the value it
      read before the plain write landed — the new value was overwritten and is gone"*); `5683b799`
      `writerForNew` verifies "new" at its first write — no node may carry the id, the cheapest sufficient
      check because protection lives on the node and every new-id caller writes the node after its secrets
      (findings 0, 6 — RED *"a writer for a 'new' id wrote in the clear into an existing, protected
      entry"*); the second code round made it EVERY write, an unreadable tree "unknown" rather than "absent"; `887a2b05` the rotation's no-loss road, `rotationStore.ts` (security review finding 1,
      findings 5, 14 — RED *"the far side's new password was dropped"*): an `UnattendedRefusal` hands the
      value to the person — *Store it (asks for the entry's PIN)* through the door and a `sealed` proof, or,
      declined, *Copy the new password* through `copySecret` — and the agent gets `rotated: true, stored:
      false`; `4bd853c0` Restore's plain path through `writerFor` with its plain proof and the node rebuilt
      inside the lease, plus the interim rule's `slot.write(storage` pattern (security review finding 2 — RED
      *"Restore wrote the kept version in the clear into an entry protected meanwhile"*); `203307be`
      `creds_list` through `plainText` (security review finding 4 — RED *"a damaged wrap reached an agent as
      a connection string"*); `300789d2` a batch accept catches each share's save failure (security review
      finding 5 — RED *"one refused share aborted the whole batch"*); `f19ae9f0` the health-report pin for a
      woven / sealed / damaged connection string (finding 3 — green on arrival, teeth shown with `plainText`
      removed). **Deviations:** the rotation's copy offer also covers a store that failed for any other
      reason (the far side changed all the same); `ProtectedMeanwhile` keeps its interactive sentence and
      carries an `unattended` one; the fresh check reads `getNode`, not `nodePresence`, because
      `writeOrderPaths.test.ts` pins the import undo's exact `nodePresence` call order; `extension.ts` shrank
      to 1037 and the baseline was lowered. Mechanical test edits, no assertion touched: five hand-built
      storages gain `writes` (`entityPin`, `pinGateHoles`, `pinFolderPlan` ×2, `writeOrderPaths` ×2,
      `externalSecretsApply` — the last also `getNode`).

**E2 DoD:** T3's and T4's DoDs; the PIN plan's suite green with no assertion edited; the funnel test's
syntax half green with its negative fixture and positive control, and T4's interim rule (*no
`applyAdditions(storage`, `store: storage`, `storage.set<Slot>(` outside `entryWriter.ts` and
`entitySlots.ts`; no `slot.write(storage` outside its `file#function` allowlist*) green; every behaviour change — hygiene's two (the Add and the update into a marked
entry shipped ahead on the hotfix, §2.7, and stay green) — RED-then-green with both observations in its
commit; `readerScan`'s `READERS` table unchanged; ratchet
unchanged; `review_plan` (epic 2/3) and `review_code` over E2's diff against E1's last commit both
`proceed`; the PR merged into `main`.

### E3 — The flip and the finish: the type takes over, the plan closes (Opus)

**Why the cut is here.** Nothing in E3 decides anything — every judgement about a reader or a writer was
made in E2 — so the flip is mechanical, ten commits each bounded by the compiler's own list for
one slot and an eleventh that takes the transitional `| string` off the seams (E3 plan round, finding 1), and the docs and the promotion are the plan's close. It is its own epic because its diff is the
largest (the 102 getter and 83 setter references of §10, and ~30 test fakes) and would bury E2's
judgement if reviewed with it; and because the eleventh commit is the moment the type takes over from
T4's interim rule, so E3's code round is the one that must see `applyAdditions(storage, …)` refuse to
compile. T6 belongs here and not in a fourth epic because the plan finishes where the type does: the
promotion records all three epics' rounds and deviations. Opus: volume, not judgement.

- [x] **T5 (E3) — The flip, one slot at a time** *(gate finding 6)*, in the order of fewest references first
      (§10): `paymentRaw` (6 — and the slot the owner lost, so its RED is the card), `secondRaw` (6),
      `fieldsRaw` (7), `notes` (8), `configBody` (9), `vpnConfig` (10), `totp` (10), `dbConnection` (14),
      `privateKey` (16), `password` (16). Per slot, one green commit: **RED** — the fixture
      *`get<Slot>`'s result is not a string* (compiles today: the harness is red); then the getter returns
      `Thenable<StoredSecret | undefined>` and the raw setter takes `StoredSecret | undefined` (the typed
      setter mints — `storageManager.ts:825-827, 841-843, 857-859`, in place), the `RevisionSecrets` field
      (and, with the first flipped slot, `historyPin.withValues` / `storedForm` `:248-263` minting
      `stored(plainSecret(value, woven))` — §2.2, gate 2026-09-30, finding 0 — with its RED: *an opened
      version's field reads as `value`, woven where the sealed one was woven, against a real
      `lockSecret(value, …, woven = true)`*; a cast there is what the finding forbids, and the harness's
      fixture *a `string` is not a `StoredSecret`* is what refuses it), the table row, that slot's member
      in the structural interfaces (`entityFlags.ts:53-55`,
      `exportSecrets.ts:9-20`, `maskEntries.ts:29-34`, `mcpEntries.ts:187-191`, `shareWithheld.ts:59-60`,
      `viewerOptions.StoredReader`, `revisionSnapshot.ts:20-32`), the callers the compiler names, the fakes
      (a `stored()` helper in `test/pinWorld.ts`); the seams accept `StoredSecret | string` for the
      duration. `GATED_BY_CALLER` re-read for that slot's functions. **The eleventh commit** takes the
      transitional `| string` off `readSecret`, `openStored`, `openedText`, `SecretOpener`, `SlotRead` and
      `SecretSlot.read`, lands the fixture *the storage itself is not a writer* (TS2345 on
      `applyAdditions(storage, …)`), and retires T4's interim scan rule.
      **The window has no compiler in it (§3, consultation 2026-09-30):** while the seams carry
      `StoredSecret | string` — the first ten commits — a new plaintext write still type-checks everywhere,
      so T4's interim scan rule is the ONLY thing refusing one, and it stays in force, run green in every
      one of those ten commits, until the eleventh takes the `| string` off and the fixture *the storage
      itself is not a writer* goes red-then-green in its place. Retiring the rule earlier, or landing the
      eleventh commit without that fixture, leaves the write side guarded by nothing.
      **Model: Opus** — mechanical, each commit bounded by the compiler's own list; the one judgement per
      caller was made in T3 and T4. **DoD per commit:** typecheck, lint, ratchet (line-neutral in the two
      ratcheted files), `npm test` (which runs T4's interim rule); no assertion edited except a fake's signature.
      **Each commit is green before the next begins** (E3 plan round, finding 2): a commit whose checks go
      red is corrected or reverted in place — never built on — and the last green commit is the recovery point.
      **Done 2026-10-01, `85f0ac13` … `5dc944d1` (ten slots) and `f474f3d4` (the seams)** (Opus 5.5). Every
      slot's fixture `slot_<x>_is_not_a_string.ts` watched failing first — *"expected TS2322 at line 8 of
      slot_<x>_is_not_a_string.ts — the fixture compiled"* — then green; every commit green on typecheck,
      lint, `npm test` (the interim rule inside it) and the ratchet (1037 / 1015 throughout) before the next.
      Finding 0's test (*an opened kept version holds REAL stored forms … woven exactly where the sealed one
      was woven*, against a real woven `lockSecret`) was green on arrival — `withValues` already wrote that
      form untyped — and was shown red with the mint reduced to `stored(open.value)` (*"the woven password
      reads as a woven value"*, actual `woven: false`). The seam commit: `storage_is_not_a_writer.ts` lands
      green (see the deviations); a planted `applyAdditions(storage, …)` and `storage.setPassword(a, e,
      'hunter2')` in a scratch production file failed `tsc` with TS2345 twice and were removed; the export's
      `carried(` is the funnel's new positive control; all 22 `GATED_BY_CALLER` reasons end "(typed since
      T5)", the lists unchanged. Final suite: 5275 tests, 5271 pass, 0 fail, 4 skipped.
      **Deviations in E3:**
      1. *A `store` column on the slot table*, beside `write`: a stored form straight into the keychain. From
         the first flip the storage is no `SlotSink`, so Protect's `sealIfStill`, Remove PIN's
         `unprotectEntity` and Restore's `writeSealed` write through `store`; the funnel's slot-write rule
         scans `.store(storage` with the same three-function allowlist.
      2. *`RevisionSecrets`, `StoredReader` and `ExportOpen` widened to `StoredSecret | string` uniformly in the
         first commit*, not per slot — the table walkers (the snapshot, the history rewrite) write fields
         through a union key, so no field can be narrower than the widest slot; all narrowed in the seam
         commit.
      3. *The producers stay text-returning*: `plainSecret` and `lockSecret` return `string` and are minted at
         funnel call sites (`stored(plainSecret(...))`). §2.1's "`lockSecret` / `plainSecret` return one" was
         not built. `sealValue` was first overloaded over text and a stored form; the code round's finding 0
         split it (`f646303a`): `sealText(text) → sealed text` (the sealing writer mints it at the one road)
         and `sealValue(stored) → stored form` (Protect, the history, Restore) — an overload that tested
         `typeof value === 'string'` could not tell the two apart at run time.
      4. *Helpers in `storedSecret.ts`*: `storedRead` (the getters' mint over a `Thenable`, identity — no
         extra microtask), `carried` overloads for `undefined`, the transitional `seamText` (deleted in the
         seam commit) and `unflipped` (deleted with the tenth slot); `secretEnvelope.isEmptySecret` replaces
         `.length` on a stored value; `secretEnvelope.isSealedText` is `sshExecAuth`'s text-level re-check of
         opened text (the same parse).
      5. *Where `carried()` stands*: the raw carriers (the export's byte-identical branch, an unprotected
         share, Restore's plain road — a kept version's bytes to the plain writer — and the keychain write),
         and inside the doors' own parse and return points (`readSecret`, `openedText`'s unprotected branch,
         `unsealedText`), named funnel-internal in the funnel test.
      6. *A reader §10 had not counted*: `rotateAction.draw` parsed `RotateDeps.current` raw; `current` now
         answers the stored form and `draw` reads it through `unsealedText` — byte-identical in every case
         that reaches it (`protectedSlot` refuses a sealed value or a marked entry first).
      7. *`GATED_BY_CALLER` annotated per function* once all its reads were typed, the kept-version entries
         in the seam commit.
      8. *Two metadata values minted at their line* (coordinator decision): `entityFieldReading.notesReading`
         (`stored(details.notes)`) and `envApply.openedField` (`stored(details.publicKey)`), both modules
         allowlisted — "a metadata value read as the plain stored form it is"; `entityFieldReading.test.ts`
         and `sshExecAuth.test.ts` green untouched.
      9. *The fixture `storage_is_not_a_writer.ts` was not red at the seam*: the writer side closed at the
         first slot (§3, *What the type does not catch*); its RED is the `49e34949` tree.
      10. *T4's rule retired only in part* — its plaintext-writer patterns; the rest is permanent (§3).
      **Open tail:** `syncProtection.SNAPSHOT_MAP` is still a third hand copy of the slot → bundle-map
      pairing (deriving it from the table needs a cast or a typed builder); the §3 item 2 type-aware half of
      the funnel is still unbuilt.
- [x] **T6 (E3) — Docs, the last code round, promotion, release** — all but the release: release pending the owner's approval of its content. `research/module_extension.md` §*The
      entry PIN keeps its promise* (`:1329-1517`): the type, the funnel table and the compile-fail harness as
      one subsection — the reader classes table STAYS, because the AST guard stays (§2.6; the 09-29 text
      said the API *replaces* it); `research/module_tests.md` §*A PIN-protected entry keeps its promise*
      (`:820-848`): the two scanning tests and the harness; help unchanged (nothing a person sees moves);
      CHANGELOG; E3's `review_code` over its whole diff against E2's last commit (§4.0 — the round that
      sees the type take over); the promotion with deviations, carrying the three epics' rounds, the
      cadence consultation's outcome and the §2.7 question for the owner; the release after E3's PR —
      **one release for the whole plan** (the hotfix #175, E1 #176, E2 #177, E3): the candidate is `main`
      after E3's merge; the owner is shown its version numbers, the `[Unreleased]` CHANGELOG section that
      becomes them, the full suite's result on that commit and `main`'s CI, and the release is tagged and
      published only after the owner's explicit approval of that content (E3 plan round, finding 3).
      **Model: Opus.** **DoD:** §7.
      **Done 2026-10-01 but for the release** (Opus 5.5): docs in `ca659a26` (`module_extension.md`
      *The type takes over*, `module_tests.md` *epic 3*, CHANGELOG `[Unreleased]`); E3's code round
      `proceed` (session `a48a7ccb`, 8 of 8 — §4.0); its one accepted finding fixed in `f646303a`
      (`sealValue` split into `sealText(text) → text` and `sealValue(stored) → stored`); the independent
      test-diff check's two funnel weakenings closed — the storage bound to another name reported again
      (`3fbb7565`), the two metadata mints allowlisted per function (`455714be`); promoted to `research/`.
      **The release is pending the owner's approval of its content** (version numbers, the `[Unreleased]`
      section, the suite on `main` after E3's merge and `main`'s CI).

**E3 DoD:** §7 in full — it is the plan's DoD, and E3 is where the plan ends; plus `review_plan`
(epic 3/3) and `review_code` over E3's diff against E2's last commit both `proceed`, and the PR merged
into `main` before the release is tagged.

## 5. Test plan

- The PIN plan's `pinSlotMatrix` (40 cells), `pinReaderBoundary`, `pinClickPaths`, `editProtected`,
  `emptyProtected`, `revisionRestore`, `shareUpdateSeal`, `entryPinScenario` stay green through every story
  with no assertion edited — they are the behavioural oracle this refactor must not move
  (`research/module_tests.md:820-848`).
- New, structural, each with its companion (`testing.md`, *a structural test that matches nothing passes
  forever*): the funnel test (§3 items 1-2: allowlist, negative fixture, positive control, the type-aware
  half); the compile-fail harness (§3 item 3) with a fixture that must compile as its control; the slot
  coverage test (T1).
- New, behavioural, RED first: hygiene's two (T3); the unattended sealing's four answers (T4, tests
  first); one compile-fail fixture per slot (T5, ten) and the two proof fixtures (T4, T5). The
  Add-into-a-PIN-folder pair and the marked-empty share update were RED-then-green on the hotfix of
  2026-10-01 (§2.7: `addEntityPin.test.ts`, `shareUpdateSeal.test.ts`) and join the oracle above.
- Refusal and interruption *(gate findings 0, 1)*: an unattended write into an entry with a sealed slot,
  and into one with the mark alone, is refused with the PIN sentence and writes nothing; a create killed
  after its first slot write, against the real `StorageManager`, converges on re-run — beside the PIN plan's
  kill-and-rerun test for Restore.
- The inventory check *(gate finding 3)*: `pinSlotMatrix` enumerates every slot × every surface and is
  this plan's per-slot inventory — kept green unchanged; T5's order is read off §10's per-getter table, not
  off a new list.
- The second round's two accepted findings *(§8.2)*: **finding 0** — an opened version's field reads as
  `value` with its woven flag (T5, RED against a real woven `lockSecret`), no reader of `Revision.secrets`
  calls `clickOpener` (T3, structural, red today at `configCommands.ts:82`), and one PIN box for viewing,
  copying from and comparing a kept version (T3, a guard — green today because the grant keeps the second
  `admitEntry` silent, and said so); **finding 2** — an update from a share into an entry with the mark
  and no sealed slot asks for its first PIN and seals every value (RED-then-green on the hotfix of
  2026-10-01, §2.7; a guard for T4), and `sealingForUpdate`'s three answers, one case each (the three
  cases already in `shareUpdateSeal.test.ts` since the hotfix — T4 retypes, and keeps them green).
- No behaviour change is intended beyond T3's two hygiene fixes and T4's Add fix, both named as such: the
  whole suite green before and after each story, with no assertion edited except mechanical fake
  signatures.

## 6. Size

- **Production:** about **+380** lines in new or grown modules — `storedSecret.ts` (~60), `entryWriter.ts`
  (~160, of which ~90 move in from `editPrefill.sealedWriter` and `shareUpdateSeal.sealingWriter`),
  `sealingAtWrite.ts` (~+40: the brand and three constructors), `secretOpener.ts` (~+35: the adapter and
  the two owner-less reads), `viewerOptions.ts` (~±20), `entitySlots.ts` (~+12); about **−120** removed
  (the two writers, `revisionSnapshot`'s ten reads, `applyFormSecrets`' and `shareUpdateSeal`'s Picks);
  about **250** lines changed in place — signatures at the 102 getter and 83 setter references (§10),
  most of them textually unchanged because the seams absorb the type. The 09-29 estimate (+1,700 / −900)
  counted the doors and writers 1.12.0 has since shipped.
- **Tests:** about **+450** new (the funnel test ~150, the harness ~80 plus ~15 fixtures, T4's REDs ~120,
  T1's ~40, T3's ~40) and about **150** mechanical lines across the ~30 test files whose fakes return a
  slot getter's value (§10: 100 getter and 101 setter references under `src/test/`).
- **Ratchet:** `storageManager.ts` (1015) and `extension.ts` (1038) change in place only — the getters'
  cast and the typed setters' mint replace a line each; the rotation store's two lines swap in place.
- **Growth surfaces:** none — no store, no cache, no spawned process; the compile-fail harness builds one
  `ts.Program` per fixture in memory and discards it.

## 7. Definition of Done

- [ ] Using a stored secret as a `string` outside the funnel modules is a compile error, proven by the
      harness (§3 item 3): ten per-slot fixtures and the two proof fixtures red-then-green.
- [ ] Every value read of a slot outside the funnel reaches text through `openStored` / `openedText` /
      `gatedSecretReader` (door) or `automaticOpener` / `fieldReadingOf` / `plainText` / `unsealedText`
      (automatic); every write goes through an `EntryWriter` from `writerFor`, from a `Sealing` only
      `sealingAtWrite.ts` can make; `StorageManager` satisfies neither `EntryWriter` nor a `SecretReader`.
- [ ] The PIN plan's behavioural tests unchanged and green; the funnel test, the harness and the coverage
      test green with their companions.
- [ ] §2.7's Add is sealed before its first write, with its RED and its kill-and-rerun test.
- [ ] `pinReaderBoundary.test.ts` unchanged in its lists; every `GATED_BY_CALLER` reason re-read and
      annotated.
- [ ] The ratchet did not grow; lint green; `plan-lifecycle.mjs` clean.
- [ ] The three epics landed in order, each on its own branch cut from the previous epic's last commit,
      each with its `review_plan` (`epic: k/3`) and its `review_code` over its whole diff against that
      commit at `proceed`, each merged into `main` by its own pull request before the next was cut (§4.0);
      the one cadence consultation for E1–E3 closed with an outcome before E1 was built, and recorded in §9.
- [ ] The second round's findings kept their place: an opened version holds real stored forms and is read
      through the silent gated reader (finding 0 — §2.2, §2.3, T3, T5); `sealingForUpdate` answers `plain`
      without a door only for an entry with no sealed slot and no mark (finding 2 — §2.4, T4); the presence
      shape is cited as enforced, not rebuilt (finding 1 — §3 item 2).
- [ ] Docs updated (T6); the two whole-plan rounds (§8) and the three per-epic pairs all `proceed`; promoted
      with deviations, the §2.7 question for the owner carried into the promotion.

## 8. Plan gates

### 8.1 The first text — 2026-09-29

coai session `eda2faa2` (branch `docs/typed-stored-secrets`), one round, codex + gemini (2 of 2 answered),
verdict **proceed** (6 gating against a threshold of 6). All seven findings accepted, and each keeps its
place in the revised text: the unattended ticket's refusal (§2.4 `unattendedSealing`, §5), interruption
invariants (§2.4, §5), the door-only extraction check (§3 item 1: the allowlist with its negative fixture
and positive control), the inventory check by reference (§5: `pinSlotMatrix`), no truthiness on a stored
secret (§3 item 2, type-aware), the compile-fail fixture inside `npm test` (§3 item 3, T2), and T5 staged
per slot (§4 T5, ten commits in the order of §10). An unqualified *gate finding N* anywhere in this plan is
one of these seven; the second round's are cited as *gate 2026-09-30, finding N*.

That round's operator commands — the split on Fable at its highest version, ordinary stories on Opus and
the security-critical ones on Fable (max) with the model named per story, one branch and one code round
over the whole diff — were applied in the 2026-09-30 revision (§4, §9); the last of them is superseded by
the second round's per-epic commands below.

### 8.2 The revised text — 2026-09-30

coai session `bc788c97` (branch `feat/typed-stored-secrets`), one round, verdict **proceed** (2 gating
against a threshold of 6), **1 of 2 reviewers**: Gemini answered; Codex was rate-limited until 2026-10-06
and did not. So this verdict is one vendor's reading of the revised design, and the per-epic rounds
(§4.0) are where the second vendor reads it. Three findings:

| # | the finding | decision | where it landed |
|---|---|---|---|
| 0 | `historyPin.openRevision` must mint every opened field as a REAL stored form — `stored(plainSecret(value, woven))`, never a cast — so `readSecret` on it answers `value` with the woven flag; and the revision viewer reads the opened version through `gatedSecretReader` behind a SILENT gate (the version was admitted by `revisionDoor.openKeptVersion`), never through `clickOpener`, so history is never admitted twice | **accepted** | §2.2 (the mint — `withValues` / `storedForm` already produce that form untyped), §2.3 (the silent reader over the opened copy; the same road for the history-row Copy and *Show Config Changes*), T3 (the three kept-version readers move, one structural RED and one guard), T5 (the mint flips with the first slot, its RED against a woven `lockSecret`) |
| 1 | the nine presence reads should be held to the `!== undefined` shape, so a truthiness test on a stored value cannot read a sealed one as present | **rejected**, with the reason: they already are — all nine (§10) read `!== undefined` today, and the shipped AST guard enforces that shape per read: `readerScan.isPresenceShape` (`:152-177`) is the rule of `pinReaderBoundary.test.ts`'s `presence` class (`:171-172`, teeth at `:266`); the type-aware half of the funnel (§3 item 2) adds the same rule for every `StoredSecret`-typed expression, so no new rule was owed | §3 item 2 cites the enforcement by line |
| 2 | `sealingForUpdate(storage, a, e, name)` answers `plain` with NO door when the existing entry holds no sealed slot and no mark (an unprotected update), `sealed{pin}` through the door and the grant when protected, `stopped` when declined; `shareUpdateSeal.updateInPlace` takes the `Sealing` and writes through `writerFor` in both cases | **accepted** — and it tightened the `writerFor` of the day (`shareUpdateSeal.ts:98-105`), which asked only `firstLockedStored`: an entry carrying the mark with no sealed slot was updated in the clear until the hotfix of 2026-10-01 fixed it ahead of the epics (§2.7) | §2.4 (the three answers, the mark test shared with `unattendedSealing`, `updateInPlace` through `writerFor`), §2.7 (the fix, and its RED), T4 (the three cases kept green), §5 |

This round's three operator commands are what §4.0 applies: two-to-three epics of two-to-three stories with
one gate per epic (its own branch from the previous epic's commit, `review_plan` with `plan:` and
`epic: k/N` declared, the stories, `review_code` over the epic's diff with the previous epic's commit as
`baseRef`); the split on Fable at its highest version with ordinary stories on Opus and the expensive-to-
be-wrong ones on Fable (max), the model named per story; and one consultation per group of three epics,
before the group is built.

## 9. Consultation — 2026-09-30

An advisory consultant (Gemini, through `coai consult`) read the 09-29 text against the 1.12.0 code and
made three points. Each was verified against the code before it was acted on.

| # | The consultant said | Verified | What the plan did with it |
|---|---|---|---|
| 1 | Keep the type mechanics (phantom, `SLOT_SPECS`, per-slot flip) but do not build `EntryReader` / `writeEntry` from scratch: `EntryReader` should yield `secretOpener.ts`'s `OpenedSecret` (`:29`), with `automaticOpener` as the unattended reader and `pinClick.clickedSecret` the interactive one; `writeEntry` should consume `sealingAtWrite.ts`'s `Sealing` (`:39`) as its proof and absorb `editPrefill.sealedWriter` (`:216`), so there is ONE read API and ONE write API | `OpenedSecret` is at `secretOpener.ts:29-36`, `automaticOpener` at `:47`, `SecretOpener` at `:39`; `clickedSecret` / `clickOpener` at `pinClick.ts:30-48`, and `clickOpener` runs `admitEntry` itself (`:43`); `Sealing` at `sealingAtWrite.ts:39` with its constants at `:71-72, 101-103`; `sealedWriter` at `editPrefill.ts:216-242`, and a second copy of it, `sealingWriter`, at `shareUpdateSeal.ts:111-125` | **Followed on the write side and on the door**: no `entryReader.ts`, no `Admitted` brand (§2.3); `Sealing` branded and `writerFor` the one road, both writer copies merged (§2.4). **Not followed on the answer type**: `OpenedSecret` folds *absent* into `open{value: undefined}`, and the automatic consumers need *absent* apart from *withheld* (`fieldReading.ts:4-14`), so `FieldReading` stays their answer and one adapter, `fieldReadingOf`, joins `secretOpener.ts`. "One read API" therefore means: one door type (`SecretOpener`) and one answer per consumer class, not one answer type for every consumer |
| 2 | Keep the AST guard (`readerScan.ts` / `pinReaderBoundary.test.ts`, `enclosingFunction` at `readerScan.ts:119`): the type proves the door was used, the AST proves it was used in the same function. Retarget the scan at the new reader API rather than delete it, and say what happens to `GATED_BY_CALLER` | `enclosingFunction` is at `readerScan.ts:119-126`; `GATED_BY_CALLER` at `pinReaderBoundary.test.ts:184-231` — 22 functions in 12 files, each with a written reason; the "listed but no longer needed" check at `:291-296` | **Followed.** §2.6: the scan is kept unchanged — there is no new reader API to retarget it at, because the openers it already recognises ARE the API; the list neither grows nor shrinks by the flip, each reason gains a compile-time twin and is annotated in T5 |
| 3 | Story split: T1/T2 ordinary (Opus): phantom + `slotSpec`; T3 security-critical (Fable): `secretOpener` / `pinClick` into `EntryReader`; T4 security-critical (Fable): `sealedWriter` / `sealingAtWrite` into `writeEntry`; T5 ordinary (Opus): the per-slot flip and the ~105 call sites; T6 docs | The counts are in §10: 102 getter references, 83 setter references, 9 table walkers, 5 hand-written and 4 `Pick` interfaces, ~200 test references | **Followed, with two changes.** `slotSpec` is not a new table: `SECRET_SLOTS` exists and is widened (§2.5, T1). T3 is not "into `EntryReader`" but "the reads converge on the openers" — the same modules, the same model, a different destination (§4). T0 is added back as a story because the revision owes a plan round, and §2.7 makes T4's first RED a shipped defect rather than a refactor. The same six stories are now three epics of two (§4.0), the consultant's Opus / Fable / Opus grouping unchanged |
| 4 | **The cadence consultation for E1–E3** (§4.0; `kind: cadence`, epics 1-3, consultationId `c785e2389d834408a01b2cd282c5e79f`, Gemini 3.1 Pro via Antigravity, 2026-09-30 — the first attempt answered nothing, the second answered). **(A)** Move the two plaintext defects of §2.7 out of the epics into a separate fix shipped BEFORE them: a shipped release writes secrets in the clear on two roads, and a refactor's timeline is the wrong clock for that. **(B)** The phantom changes nothing at run time — `JSON.stringify` in `revisionStore.ts`, `===` and `structuredClone` all see strings — so T5 moves no byte; and the transitional `StoredSecret \| string` on the seams during T5's first ten commits gives the compiler NO protection against a new plaintext write in that window | **(A)** verified by reading `treeMutationCommands.ts:285-310` (`applyAdditions(storage, …)` then `applyCreatePin`) and `shareUpdateSeal.ts:98-105` (`firstLockedStored` only, never the mark): both windows real. **(B)** verified: the brand is erased by `tsc`; `revisionStore.ts`'s `JSON.stringify`, the `===` comparisons in `syncMerge` and the `structuredClone` of the store see plain strings; and with `\| string` on `readSecret`, `openStored`, `SlotRead` and `SecretSlot.read`, `applyAdditions(storage, …)` type-checks until the eleventh commit | **(A) followed** — the hotfix `fix/two-plaintext-windows` (2026-10-01; §2.7 records both fixes, their REDs and their tests; pull request #175); T4 and §5 now keep those tests green instead of carrying them as REDs. **(B) recorded** in §3 (*Two limits the cadence consultation named*) and in T5: in the window the guarantee rests on T4's interim scan rule alone, which must stay until T5's eleventh commit |

## 10. T0 — the re-verification record (2026-09-30)

Every `file:line` the 09-29 text cited, re-read at `39e2b738`:

| Cited (09-29) | Today | Note |
|---|---|---|
| `storageManager.ts:697-899` (the getters) | `:698-896` | the ten slot getters at :698, :727, :741, :805, :816, :832, :848, :861, :871, :886; raw setters :702, :731, :745, :809, :820, :836, :852, :865, :875, :890; typed setters :825, :841, :857; deleters :709, :735, :749, :879, :894 |
| `storageManager.ts:364-371` (`putSecret` deletes on empty) | `:364-371` | unchanged; `setPassword('')` keeps (`:702-707`) |
| `entitySlots.ts:31-89` (`SECRET_SLOTS`) | `:45-124` | `SecretSlot` at `:25-43` gained `revisionField` and `remove` (PIN plan P1) |
| `revisionHistory.ts:26-48` (`RevisionSecrets`) | `:26-48` | unchanged |
| `revisionHistory.ts:74` (`SMALL_FIELDS`) | `:79` | |
| `revisionSnapshot.ts:44-53` (the ten reads), `:20-32` (the `Pick`) | `:44-53`, `:20-32` | unchanged |
| `secretMaps.ts:48-71` (`SECRET_KINDS`) | `:48-71` | twelve rows |
| `fieldReading.ts:18-21` | `:18-21` | unchanged |
| `entityFlags.ts:52-54` | `:53-55` | `EntityFlagSource` at `:47-56`, three getters |
| `exportSecrets.ts:6` | `:8-21` | `SecretReader`, twelve getters (attachment and image at `:14-15`) |
| `maskEntries.ts:27-35` | `:27-35` | `SecretSource`, six getters |
| `mcpEntries.ts:183-192` | `:183-192` | `McpVaultSource`, five getters |
| *(not cited)* | `shareWithheld.ts:58-61` | a **fifth** hand-written interface, `WithheldReader`, added by the PIN plan §5.4 — the 09-29 text counted four |
| *(not cited)* | `applyFormSecrets.ts:14-28`, `shareUpdateSeal.ts:28-39`, `historyPin.ts:28` | three more `Pick`s: `SecretWriter`, `ShareWriter` (both replaced by `EntryWriter`, T4), `HistoryStore` (untouched) |
| *(not cited)* | `viewerOptions.ts:45-70` | `SecretReader`, seven per-field methods — split into `StoredReader` / `SecretReader` (T3) |
| ratchet `storageManager.ts` 1023 | **1015** | lowered by the PIN plan P8; `extension.ts` 1038 |
| the PIN plan §7 (`pinReaderBoundary`, `pinSlotMatrix`, the three getters deleted) | shipped | plus what §15 added: `readerScan.ts`, `secretOpener.ts`, `sealingAtWrite.ts`, `revisionDoor.ts`, `restoreVersion.ts`, `historyPin.ts`, `historyHeal.ts`, `sealValue.ts`, `syncPinRule.ts`, `syncProtection.ts`, `shareUpdateSeal.ts`, `agentCreatePin.ts` (the sibling plan) |
| "~105 call sites", "~45 writes", "~10 presence checks" | 102 / 83 / 9 | below |

**Getter references in `src/**` outside `test/`** — 102, of which 73 value reads, 9 presence reads
(`editPrefill.ts:150-152`, `entityEditCommands.ts:417`, `entityViewerCommands.ts:126-129`,
`sharePayloadBuild.ts:135`), and 20 table and snapshot rows (`entitySlots.ts` ×10, `revisionSnapshot.ts` ×10).
Per getter, which is T5's order:

| getter | refs | where |
|---|---|---|
| `getPaymentRaw` | 6 | exportSecrets:109, revisionSnapshot:52, sharePayloadBuild:76, shareWithheld:95, viewerOptions:143, entitySlots:72 |
| `getSecondRaw` | 6 | exportSecrets:113, maskEntries:95, revisionSnapshot:53, shareWithheld:96, viewerOptions:144, entitySlots:65 |
| `getFieldsRaw` | 7 | entityFlags:154, entityViewerCommands:133, exportSecrets:116, openSite:43, revisionSnapshot:51, sharePayloadBuild:71, entitySlots:56 |
| `getNotes` | 8 | entityFieldReading:62, entityViewerCommands:132, exportSecrets:103, maskEntries:85, mcpEntries:290, revisionSnapshot:48, sharePayloadBuild:50, entitySlots:49 |
| `getConfigBody` | 9 | configCommands:78, :121, configWrite:64, entityFlags:182, entityViewerCommands:134, exportSecrets:107, revisionSnapshot:50, sharePayloadBuild:70, entitySlots:79 |
| `getVpnConfig` | 10 | editPrefill:152, entityViewerCommands:128, exportSecrets:101, maskEntries:83, revisionSnapshot:46, sharePayloadBuild:65, vpnLauncherRun:100, vpnRun:211, viewerOptions:139, entitySlots:93 |
| `getTotp` | 10 | commands/entityCommands:107, entityFieldReading:78, entityViewerCommands:129, exportSecrets:106, mcpEntries:291, revisionSnapshot:49, sharePayloadBuild:53, :135, viewerOptions:142, entitySlots:100 |
| `getDbConnection` | 14 | agentUseActions:304, commands/entityCommands:106, envApply:129, :131, entityViewerCommands:131, exportSecrets:102, extension:684, hygieneScan:130, maskEntries:84, mcpEntries:292, revisionSnapshot:47, sharePayloadBuild:66, viewerOptions:140, entitySlots:86 |
| `getPrivateKey` | 16 | commands/entityCommands:108, editPrefill:151, entityEditCommands:417, envApply:125, entityViewerCommands:127, exportSecrets:100, gitSigningKey:14, maskEntries:82, mcpEntries:289, revisionSnapshot:45, sharePayloadBuild:64, sshAgentManager:134, sshCredential:48, transportFactory:282, viewerOptions:138, entitySlots:107 |
| `getPassword` | 16 | commands/entityCommands:105, editPrefill:150, entityFlags:207, envApply:123, entityViewerCommands:126, exportSecrets:99, extension:683, hygieneScan:132, maskEntries:81, mcpEntries:288, revisionSnapshot:44, sharePayloadBuild:63, sshCredential:111, :114, viewerOptions:137, entitySlots:115 |

Plus 9 walks of the table's own `read` (`entityPin.ts:84, 176, 247, 277, 311`, `pinAdmission.ts:107`,
`restoreVersion.ts:98, 167`, `editPrefill.ts:129`) and the kept-version readers of `Revision.secrets`
(`entityViewerCommands.ts:327-328, 375`, `entityViewCopy.ts:186-190`, `configCommands.ts:60`,
`restoreVersion.ts:68, 97, 110`, `historyPin.ts`, `historyHeal.ts:50`, `pinCommands.ts:106, 168`,
`entityPin.ts:217`, `syncProtection.ts:123-128`, `viewerOptions.ts:189-205`).

**Setter references in `src/**` outside `test/`** — 83 outside `storageManager.ts` (86 with its own three
typed→raw delegations at `:826, :842, :858`): the slot table's `write` / `remove` rows 20
(`entitySlots.ts:50-122`), `applyFormSecrets.ts` 20 (additions `:88-109`, removals `:120-136`),
`editPrefill.sealedWriter` 10 (`:226-238`), `importCommands.ts` 10 (`:96-100`, `:118-122`), `shareInbox.ts` 10
(`:707-738`, `:758`), `shareUpdateSeal.sealingWriter` 9 (`:115-123`), the rotation store 2
(`extension.ts:690-691`), `externalSecretsApply.ts` 2 (`:92` by name through `EXTERNAL_SECRET_KEYS`, `:107`).
`projectFolderSync.ts:97, 103, 116` match the name `setFields` and are not slot writes (`updateNodeFields`
patches, `projectFolderWiring.ts:85`).

**Under `src/test/`**: 100 getter references in 25 files, 101 setter references in 29 files — the fakes T5
retypes with `stored()`; `pinWorld.memoryStorage` and the tests over the real `StorageManager` need nothing.

**Found on the way (§2.7):** the person's Add into a folder that asks for a PIN writes plain before it
seals (`commands/treeMutationCommands.ts:285` → `:310` → `pinOnCreate.ts:306`). And confirmed as the PIN
plan left them: `importCommands` and `shareInbox` write new ids plain with no folder-PIN question;
`shareRecipientPin.ts:99-108` seals an arriving payload in memory before any write — a carrier that joins
the funnel allowlist.
