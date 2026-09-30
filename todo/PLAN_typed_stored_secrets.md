# PLAN — a stored secret has its own type: forgetting the PIN door stops compiling

> Status: **plan only, nothing implemented yet, 2026-09-29 — revised after the consultation, 2026-09-30.**
> Plan gate passed (`proceed`, 2 of 2 reviewers, one round, seven findings accepted — §8) on the 2026-09-29
> text; this revision (§9, §10) changes the design enough to owe a second plan round before T1 (§4, T0).
> Scope: `src_vs_code/src` — `storageManager.ts` getter/setter signatures, a new `storedSecret.ts` and
> `entryWriter.ts`, the shipped door and sealing modules RETYPED rather than replaced (`secretOpener.ts`,
> `pinClick.ts`, `pinGate.ts`, `pinAdmission.ts`, `sealingAtWrite.ts`, `editPrefill.ts`,
> `shareUpdateSeal.ts`), the 102 getter references, 83 setter references and 5 + 4 structural interfaces
> counted in §10, and the tests' fakes. Extension only; no format change. **Starts after**
> [PLAN_entry_pin_keeps_its_promise.md](../research/PLAN_entry_pin_keeps_its_promise.md) and
> [PLAN_agent_creates_what_the_folder_holds.md](../research/PLAN_agent_creates_what_the_folder_holds.md),
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
them back through the table (`restoreVersion.ts:97-102`). Each field flips with its slot (T5). A version
`openRevision` has opened (`historyPin.ts:177-188`) holds plain-form `StoredSecret`s, which is exactly what
an unprotected entry stores — so the revision viewer, Copy All and *Show Config Changes* read it through
the same door the live viewer uses (§2.3), and no second reader type is needed.

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
  `storageSecretReader` and `revisionSecretReader` both build one) and `SecretReader` (the opened text the
  page gets — built ONLY by `gatedSecretReader`). The revision viewer reaches its `SecretReader` through
  `gatedSecretReader` with a silent gate (the version was opened by `revisionDoor.openKeptVersion`
  `:31-49`, so every value answers `unprotected`), and the three places that read a kept version's fields as
  text — `entityViewerCommands.ts:327-328, 375`, `entityViewCopy.ts:186-190`, `configCommands.ts:60` — read
  through it or through `clickOpener`, which `configCommands.openedBodies` (`:71-84`) already does.

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
  share's *Update it*: `shareUpdateSeal.writerFor` `:98-105` moved — the door, then the grant; `stopped`
  when declined), and `unattendedSealing(storage, owner)` (below).
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
  written without".
- **Interruption invariants** *(gate finding 1)*, unchanged from what shipped and now type-carried: the
  writer seals each value in memory before its own raw setter runs, so a process killed between two slot
  writes leaves every slot sealed-or-unwritten and never plaintext (`editPrefill.ts:246-254`,
  `restoreVersion.ts:17-21`); Rule A keeps the node consistent on either side of the kill
  (`applyFormSecrets.ts:41-46`); re-running the same Edit or Restore converges (`restoreVersion.ts:31-32`,
  the kill-and-rerun test of `revisionRestore.test.ts`). T4 adds the same test for the case §2.7 found.
- **A new entry in a folder that asks for a PIN is sealed before its first write.** The agent's create
  already is (`mcpHooks.ts:42-44, 74`); the person's Add is not (§2.7). `sealingForNew` gives both the same
  proof and the same writer; `applyCreatePin` (`pinOnCreate.ts:293-314`) keeps running after, as the
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

### 2.7 What the compiler will find that the tests did not — recorded in T0

**The person's Add into a folder that asks for a PIN writes every value in the clear, then seals it.**
`commands/treeMutationCommands.ts:285` runs `applyAdditions(storage, …)` — the storage itself, plaintext —
and `applyCreatePin` (`:310` → `pinOnCreate.ts:306` `protectEntity`) seals afterwards, *"because it wraps
what is THERE"* (`:308-309`). That is the *"write, then `protectEntity`"* order rule R3 rejected for Edit
(`PLAN_entry_pin_keeps_its_promise.md` §4 R3), and the agent's create in the same folder was deliberately
built the other way (`mcpHooks.ts:42-44`: *"not even for the moment 'write, then protect' would leave it
there"*). A kill between `:285` and `:310` leaves the new entry's values plain in the keychain under a node
that claims nothing. After T4, `applyAdditions(storage, …)` does not compile; `writerFor(sealingForNew(createPin))`
seals in memory first. T4's first RED test is this case (§5).

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
   identity) is a failure outside the funnel *(gate finding 4)*. Presence stays `!== undefined`
   (`readerScan.isPresenceShape` :152-177 already accepts only that shape). Time-boxed: the program build is
   measured in T2; above ~10 s on CI this half is recorded as a limit and the syntax half stands alone.
3. **The compile-fail harness** (`test/typedFixtures.test.ts`, gate finding 5) runs INSIDE `npm test`: every
   file under `src/test/fixtures/typed/` carries a first-line `// expect TS<code> at line <n>` or
   `// expect compiles`; the harness builds a program per fixture with the project's own `tsconfig`
   options and asserts exactly that diagnostic at that line, or none. The fixtures are excluded from
   `tsc -p ./` and from `eslint src` (one line each in `tsconfig.json` and `eslint.config.mjs`), which is
   why the harness has to be a test and cannot be the build.

Type-aware ESLint rules stay out (CI cost, as gated); the checker in item 2 is one test file, not a lint
pass over every rule. Review watches casts in production code.

## 4. Build order — stories

Every story leaves the build green on its own: `npm run typecheck`, `npm run lint`, `npm run ratchet`
(`extension.ts` 1038, `storageManager.ts` 1015 — `.size-baseline.json`; the plan's earlier 1023 was lowered
by the PIN plan P8), `npm test`. Every RED is watched failing for the real symptom before its fix, and both
observations go into the commit. The model per story follows the gate's operator command (§8): ordinary
stories on Opus, security- or architecture-critical ones on Fable, with the reason named.

- [ ] **T0 — Re-verify, count, gate the revision.** *(The re-read and the counts are done: §10, 2026-09-30.)*
      Remaining: a second coai `review_plan` round over THIS text before T1 — the design changed (§2, §9),
      and a gate that read the 09-29 text has not read the absorption or §2.7.
      **Model: Fable** — it is the split the operator asked for, and §2.7 is a security finding.
- [ ] **T1 — The slot table is the one list.** `SecretSlot.bundleKey`; `RevisionSecrets` typed from
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
- [ ] **T2 — `StoredSecret` exists, and the compile-fail harness runs in `npm test`.** `storedSecret.ts`;
      `test/typedFixtures.test.ts` with its first fixtures — `stored_is_not_a_string.ts` (TS2322),
      `a_string_is_not_stored.ts` (TS2322), `carried_is_a_string.ts` (compiles); the `tsconfig` / ESLint
      exclusions; the program-build timing for §3 item 2. Nothing returns a `StoredSecret` yet.
      **RED / teeth:** new infrastructure has no failing predecessor, so its teeth are proven the other
      way round (`testing.md`, *if the fix already landed*): with `type StoredSecret = string` planted, the
      harness must fail *"expected TS2322 at line 7 of stored_is_not_a_string.ts — the fixture compiled"*;
      restored, green. Both observations in the commit.
      **Model: Opus** — a type, a harness, two config lines. **DoD:** harness green with its positive
      control; `npm run compile` unaffected by the fixtures; timing recorded in the commit.
- [ ] **T3 — The reads converge on the doors.** Outside the funnel no module parses a stored string or uses
      a getter's result as text. `secretOpener.ts` gains `fieldReadingOf`, `plainText`, `unsealedText`;
      `envApply.ts:90-133`, `entityFieldReading.ts:57-81`, `agentUseActions.ts:304-313`,
      `transportFactory.ts:280-288` go through `automaticOpener`; `hygieneScan.ts:111-121`,
      `maskEntries.ts:121`, `entityFlags.ts:249, 253`, `mcpEntries.ts:282-294` through the owner-less reads;
      `viewerOptions.ts` splits `StoredReader` / `SecretReader` and the revision viewer
      (`entityViewerCommands.ts:327-328, 375`), Copy All (`entityViewCopy.ts:186-190`) and *Show Config
      Changes* (`configCommands.ts:60`) read a kept version through the gated reader; the funnel test's
      syntax half lands here. Getters and setters are still `string`: every step is a refactor the PIN plan's
      suite must not notice.
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
- [ ] **T4 — One road to a writer.** `sealingAtWrite.ts`: the brand, `sealingForNew`, `sealingForUpdate`,
      `unattendedSealing`. `entryWriter.ts`: `EntryWriter`, `writerFor`, the plain and the sealing writer —
      `editPrefill.sealedWriter` (`:216-242`) and `shareUpdateSeal.sealingWriter` (`:111-125`) deleted;
      `SecretWriter` and `ShareWriter` replaced by `EntryWriter`. Callers: `entityEditCommands.ts:272-273`,
      `mcpHooks.ts:74`, `commands/treeMutationCommands.ts:285`, `shareInbox.ts:699-740`,
      `shareUpdateSeal.ts:52-69, 98-105`, `importCommands.ts:111-129`, `externalSecretsApply.ts:71-95`,
      `extension.ts:688-691`. Until T5 the storage still satisfies `EntryWriter` structurally, so T4 adds the
      funnel test's rule *"no `applyAdditions(storage`, `store: storage` or `storage.set<Slot>(` outside
      `entryWriter.ts` and `entitySlots.ts`"* — retired in T5's last commit, where the type takes over.
      **RED (red today):** *a person's Add into a folder that asks for a PIN never writes a value in the
      clear — the keychain's write log sees only sealed values* (§2.7; the write-log assertion of
      `pinSlotMatrix.test.ts` over `treeMutationCommands`' create, template `agentCreatePin.test.ts`);
      *an Add into a PIN folder killed after its first slot write leaves that slot SEALED and the node absent,
      and running it again converges* (gate finding 1). **RED (new behaviour, tests first):** *the unattended
      sealing of an entry with a sealed slot is `stopped` with the PIN sentence; of an entry with the mark
      alone, `stopped`; of a plain unmarked entry, `plain`; it is never `sealed`* (gate finding 0);
      *an update from a share into a protected entry seals every arriving value and keeps the mark and
      epoch* (`shareUpdateSeal.test.ts`, unchanged and green — the oracle). **Compile-fail fixture:**
      *`writerFor` refuses a `Sealing` that was not made by `sealingAtWrite`* — `{ kind: 'plain' }` handed
      in is TS2345; teeth proven by removing the brand.
      **Model: Fable** — every writer into the keychain changes hands, and R3 is the rule the owner's data
      loss came from.
      **DoD:** `editProtected`, `emptyProtected`, `shareUpdateSeal`, `revisionRestore`, `agentCreatePin`,
      `writeOrderPaths`, `pinSlotMatrix` green unchanged; `editPrefill.ts` and `shareUpdateSeal.ts` shrink;
      `storageManager.ts` and `extension.ts` line-neutral.
- [ ] **T5 — The flip, one slot at a time** *(gate finding 6)*, in the order of fewest references first
      (§10): `paymentRaw` (6 — and the slot the owner lost, so its RED is the card), `secondRaw` (6),
      `fieldsRaw` (7), `notes` (8), `configBody` (9), `vpnConfig` (10), `totp` (10), `dbConnection` (14),
      `privateKey` (16), `password` (16). Per slot, one green commit: **RED** — the fixture
      *`get<Slot>`'s result is not a string* (compiles today: the harness is red); then the getter returns
      `Thenable<StoredSecret | undefined>` and the raw setter takes `StoredSecret | undefined` (the typed
      setter mints — `storageManager.ts:825-827, 841-843, 857-859`, in place), the `RevisionSecrets` field,
      the table row, that slot's member in the structural interfaces (`entityFlags.ts:53-55`,
      `exportSecrets.ts:9-20`, `maskEntries.ts:29-34`, `mcpEntries.ts:187-191`, `shareWithheld.ts:59-60`,
      `viewerOptions.StoredReader`, `revisionSnapshot.ts:20-32`), the callers the compiler names, the fakes
      (a `stored()` helper in `test/pinWorld.ts`); the seams accept `StoredSecret | string` for the
      duration. `GATED_BY_CALLER` re-read for that slot's functions. **The eleventh commit** takes the
      transitional `| string` off `readSecret`, `openStored`, `openedText`, `SecretOpener`, `SlotRead` and
      `SecretSlot.read`, lands the fixture *the storage itself is not a writer* (TS2345 on
      `applyAdditions(storage, …)`), and retires T4's interim scan rule.
      **Model: Opus** — mechanical, each commit bounded by the compiler's own list; the one judgement per
      caller was made in T3 and T4. **DoD per commit:** typecheck, lint, ratchet (line-neutral in the two
      ratcheted files), `npm test`; no assertion edited except a fake's signature.
- [ ] **T6 — Docs, code round, release.** `research/module_extension.md` §*The entry PIN keeps its promise*
      (`:1329-1517`): the type, the funnel table and the compile-fail harness as one subsection — the reader
      classes table STAYS, because the AST guard stays (§2.6; the 09-29 text said the API *replaces* it);
      `research/module_tests.md` §*A PIN-protected entry keeps its promise* (`:820-848`): the two scanning
      tests and the harness; help unchanged (nothing a person sees moves); CHANGELOG; coai `review_code`,
      one round over the whole diff (§8); promotion with deviations; release.
      **Model: Opus.** **DoD:** §7.

## 5. Test plan

- The PIN plan's `pinSlotMatrix` (40 cells), `pinReaderBoundary`, `pinClickPaths`, `editProtected`,
  `emptyProtected`, `revisionRestore`, `shareUpdateSeal`, `entryPinScenario` stay green through every story
  with no assertion edited — they are the behavioural oracle this refactor must not move
  (`research/module_tests.md:820-848`).
- New, structural, each with its companion (`testing.md`, *a structural test that matches nothing passes
  forever*): the funnel test (§3 items 1-2: allowlist, negative fixture, positive control, the type-aware
  half); the compile-fail harness (§3 item 3) with a fixture that must compile as its control; the slot
  coverage test (T1).
- New, behavioural, RED first: hygiene's two (T3); the Add-into-a-PIN-folder pair (T4); the unattended
  sealing's four answers (T4, tests first); one compile-fail fixture per slot (T5, ten) and the two proof
  fixtures (T4, T5).
- Refusal and interruption *(gate findings 0, 1)*: an unattended write into an entry with a sealed slot,
  and into one with the mark alone, is refused with the PIN sentence and writes nothing; a create killed
  after its first slot write, against the real `StorageManager`, converges on re-run — beside the PIN plan's
  kill-and-rerun test for Restore.
- The inventory check *(gate finding 3)*: `pinSlotMatrix` enumerates every slot × every surface and is
  this plan's per-slot inventory — kept green unchanged; T5's order is read off §10's per-getter table, not
  off a new list.
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
- [ ] Docs updated (T6); a plan round over this revision and one code round over the whole diff both
      `proceed`; promoted with deviations, the §2.7 question for the owner carried into the promotion.

## 8. Plan gate — 2026-09-29

coai session `eda2faa2` (branch `docs/typed-stored-secrets`, kept for the build), one round, codex + gemini
(2 of 2 answered), verdict **proceed** (6 gating against a threshold of 6). All seven findings accepted,
and each keeps its place in the revised text: the unattended ticket's refusal (§2.4 `unattendedSealing`,
§5), interruption invariants (§2.4, §5), the door-only extraction check (§3 item 1: the allowlist with its
negative fixture and positive control), the inventory check by reference (§5: `pinSlotMatrix`), no
truthiness on a stored secret (§3 item 2, type-aware), the compile-fail fixture inside `npm test` (§3 item
3, T2), and T5 staged per slot (§4 T5, ten commits in the order of §10).

The gate's operator commands for THIS plan, to follow when it is built: do the split with Fable at its
highest version *(done in this revision — §4, §9)*; implement ordinary stories on Opus and anything
security- or architecture-critical on Fable (max), naming the model per story *(§4 names one per story
with its reason)*; build on this branch, one code round over the whole diff.

## 9. Consultation — 2026-09-30

An advisory consultant (Gemini, through `coai consult`) read the 09-29 text against the 1.12.0 code and
made three points. Each was verified against the code before it was acted on.

| # | The consultant said | Verified | What the plan did with it |
|---|---|---|---|
| 1 | Keep the type mechanics (phantom, `SLOT_SPECS`, per-slot flip) but do not build `EntryReader` / `writeEntry` from scratch: `EntryReader` should yield `secretOpener.ts`'s `OpenedSecret` (`:29`), with `automaticOpener` as the unattended reader and `pinClick.clickedSecret` the interactive one; `writeEntry` should consume `sealingAtWrite.ts`'s `Sealing` (`:39`) as its proof and absorb `editPrefill.sealedWriter` (`:216`), so there is ONE read API and ONE write API | `OpenedSecret` is at `secretOpener.ts:29-36`, `automaticOpener` at `:47`, `SecretOpener` at `:39`; `clickedSecret` / `clickOpener` at `pinClick.ts:30-48`, and `clickOpener` runs `admitEntry` itself (`:43`); `Sealing` at `sealingAtWrite.ts:39` with its constants at `:71-72, 101-103`; `sealedWriter` at `editPrefill.ts:216-242`, and a second copy of it, `sealingWriter`, at `shareUpdateSeal.ts:111-125` | **Followed on the write side and on the door**: no `entryReader.ts`, no `Admitted` brand (§2.3); `Sealing` branded and `writerFor` the one road, both writer copies merged (§2.4). **Not followed on the answer type**: `OpenedSecret` folds *absent* into `open{value: undefined}`, and the automatic consumers need *absent* apart from *withheld* (`fieldReading.ts:4-14`), so `FieldReading` stays their answer and one adapter, `fieldReadingOf`, joins `secretOpener.ts`. "One read API" therefore means: one door type (`SecretOpener`) and one answer per consumer class, not one answer type for every consumer |
| 2 | Keep the AST guard (`readerScan.ts` / `pinReaderBoundary.test.ts`, `enclosingFunction` at `readerScan.ts:119`): the type proves the door was used, the AST proves it was used in the same function. Retarget the scan at the new reader API rather than delete it, and say what happens to `GATED_BY_CALLER` | `enclosingFunction` is at `readerScan.ts:119-126`; `GATED_BY_CALLER` at `pinReaderBoundary.test.ts:184-231` — 22 functions in 12 files, each with a written reason; the "listed but no longer needed" check at `:291-296` | **Followed.** §2.6: the scan is kept unchanged — there is no new reader API to retarget it at, because the openers it already recognises ARE the API; the list neither grows nor shrinks by the flip, each reason gains a compile-time twin and is annotated in T5 |
| 3 | Story split: T1/T2 ordinary (Opus): phantom + `slotSpec`; T3 security-critical (Fable): `secretOpener` / `pinClick` into `EntryReader`; T4 security-critical (Fable): `sealedWriter` / `sealingAtWrite` into `writeEntry`; T5 ordinary (Opus): the per-slot flip and the ~105 call sites; T6 docs | The counts are in §10: 102 getter references, 83 setter references, 9 table walkers, 5 hand-written and 4 `Pick` interfaces, ~200 test references | **Followed, with two changes.** `slotSpec` is not a new table: `SECRET_SLOTS` exists and is widened (§2.5, T1). T3 is not "into `EntryReader`" but "the reads converge on the openers" — the same modules, the same model, a different destination (§4). T0 is added back as a story because the revision owes a plan round, and §2.7 makes T4's first RED a shipped defect rather than a refactor |

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
