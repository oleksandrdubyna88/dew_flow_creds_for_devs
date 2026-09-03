# PLAN — payment instruments, broken into epics and stories

> Status: **IMPLEMENTED, 2026-09-02 — including the UI tail this line originally left implied.** All
> twenty-one stories landed; the per-story record is the table below, and the deviations are in the
> parent plan's status line.
>
> **The open tail, corrected 2026-09-02 after an audit read the code rather than this table.** The
> original version of this line named only two items, and a reader who stopped at the status line —
> which is what a status line is for — would have concluded the feature was whole. It is not. Three
> stories landed as their pure core with **no caller**, which the table below says as `landed (core)`
> and this line did not:
>
> 1. **S4.4's phrase FORM does not exist.** `formSections.ts` declares `cardSection` and
>    `bankSection` and no phrase section, while the selector offers all three forms — so *Phrase*
>    leads to an empty form today.
> 2. **S4.5's viewer CARD does not exist.** `entityViewPage.ts` contains the string `payment` zero
>    times, so `phraseReassembly`, `phraseLayout`, `decoyPhrase` and the ten wordlists have no
>    production caller, and no woven value could ever be read back.
> 3. **S5.1's reveal rung and S5.2's phrase buffer have no caller either** — `revealGate.ts` and
>    `phraseBuffer.ts` are imported by their own tests and by nothing else. Both guard the viewer,
>    which is item 2.
>
> Consequently the weave boxes were switched OFF in `0.94.0` (`da9b3fe`) rather than left as a trap:
> the save path could weave, nothing could unweave, and the method is stored nowhere by design.
>
> All three were then built, as [PLAN_payment_ui_tail.md](PLAN_payment_ui_tail.md), on the same day.
> Monero's wordlist (S4.1's data half) is still not included — see the parent's deviation 4 — and
> cross-window write coordination, which S1.4 uncovered, is
> [PLAN_cross_window_write_coordination.md](PLAN_cross_window_write_coordination.md), built 2026-09-03.
>
> **And the version was wrong here too:** nothing shipped in `0.93.0`. `extension-v0.93.0` was tagged
> 2026-09-01 from `main` at an unrelated commit, and this branch's work is `0.94.0`, untagged.
>
> This is the BUILD ORDER for
> [PLAN_payment_instruments.md](PLAN_payment_instruments.md) — it decides nothing and repeats nothing.
> Every product decision, every rejected reviewer finding and every reason lives in the parent plan;
> the `§` references below point into it and are the authority whenever this file and that one seem to
> disagree.
>
> Scope: `src_vs_code` only. The server is not touched and no HTTP contract changes, so
> [module_server.md](../research/module_server.md) is out of scope by construction.
>
> Related: [ЗАДАЧА_варианты_перемешивания_сид_фразы.md](../todo/ЗАДАЧА_варианты_перемешивания_сид_фразы.md)
> (the twelve weaves and their worked breakdowns),
> [module_extension.md](../research/module_extension.md).

## Why this file exists

The parent plan is 574 lines of decisions across six review rounds. It is a good record and a poor
work queue: its build order (1, 2, 2.5, 3, 3a, 3b, 3d, 3e, 3c, 4, 5, 6, 7) is the order the
*arguments* arrived in, not an order anything can be built in — §3d changes the write order of
**every** entity kind, §3a needs a decoy generator that §4.3 also needs, and §2.5's six directions
each live in a different file. This file turns it into 5 epics of 3–5 stories, each story being one
commit: one behaviour, its own red-first tests, its own review round.

## What the exploration found that the parent plan did not know

Three facts were verified in code before this breakdown was written, and each one moved work between
stories. They are recorded here because they are the reason the order below is not the parent plan's
order.

1. **The write order today is the opposite of what §3d requires — for a WRITE. For a DELETE the
   current order is already right, and §3d's rule read literally would break it.** §3d rule 1 asks
   for *secret, then node*, without distinguishing the two operations. On the create/update paths
   that is correct and the code has it backwards: `entityEditCommands.ts:99` (`updateNode` →
   `globalState`) then `:109` (`applySecrets` → `SecretStorage`), and
   `commands/treeMutationCommands.ts:250` then `:264`. On **deletion** the same words invert into the
   very failure the rule exists to prevent: delete the secret first, fail to persist the tree, and
   the node comes back on next start with its secret permanently gone — visible, broken, and it
   **syncs**. `deleteNodeRecursive` already does the safe thing (`storageManager.ts:693` `saveNodes`,
   then the secret loop at `:706`). So the rule is per-operation, not global, and both halves reduce
   to one invariant: **an orphaned secret is the only torn state allowed to exist.** §3d is therefore
   not a payment story at all — it is a change to every kind, and it gets its own story (**S1.4**)
   that lands before any payment payload exists to be torn.
2. **There is no startup sweep for orphaned secrets, and `vscode.SecretStorage` cannot be enumerated
   to build one.** §3d's table calls an orphaned secret "invisible, harmless, cleaned by a startup
   sweep". Three things are true and none of them is that sweep: `StorageManager.init()` (`:336-361`)
   only migrates plaintext node slots into sealed metadata; `EphemeralSweeper` sweeps entity
   *expiry*, not orphans; `dropVanishedSecrets`/`dropAbsentKinds` (`:1111-1128`) run only inside
   `importBundle`. Worse, the sweep cannot simply be written: the API is `get`/`store`/`delete` for a
   **known** key, with no listing, and every secret read in this codebase is driven by iterating the
   **live** node list (`readSecretMaps` → `readKindsInto`, `:1035-1054`). Once a node is gone its id
   is derivable from nothing, so there is no candidate key to sweep.
   **What makes it implementable without inventing an index: tombstones.** Deletion already records
   `{ deletedAt, v }` per removed id in `globalState` for the sync merge (`:699-711`) — a durable
   list of exactly the ids whose secrets should no longer exist. The one thing missing is ordering:
   `setTombstones` runs at `:711`, **after** the secret loop at `:706`, so a crash in between leaves
   an orphan named by nothing. Moving the tombstone write ahead of the secret loop makes every
   orphan the sweep must find already recorded — also **S1.4**.
3. **Neither of the two new UX steps has anything to copy.** No entity is un-editable today
   (`editNode`, `entityEditCommands.ts:29-116`, has no gate of any kind), and no field asks for
   anything beyond an unlocked vault before it is revealed (`entityViewPanel.ts:162-171` copies
   immediately). The nearest shapes are a state-gated *refusal* (`refuseEnv`,
   `entityViewerCommands.ts:170-175`) and four hand-written copies of the same modal
   (`entityFormPanel.ts:397`, `hostKeyTrust.ts:119`, `hygieneScan.ts:147`,
   `remoteCliInstall.ts:162`). Per `reuse-first` step 2 the fifth copy is not written: **S2.4**
   extracts one helper into `dialogs.ts` and the later confirmations call it.

Two smaller ones, both landmines rather than decisions:

- `formStructure.test.ts:13` declares its own `KINDS` tuple instead of importing `ENTITY_KINDS`, so a
  ninth kind is **not** covered there for free. **S1.1** adds it by hand and says so.
- `helpCoverage.test.ts:36` builds its corpus from `a.en` only, so no test enforces the Russian body
  §6.1 asks for — but the same file *does* fail on any new command without help text. **S5.3** carries
  the Russian body as a plan obligation, not a CI one.

## The five epics

| # | epic | what is true when it is done | stories |
|---|---|---|---|
| 1 | **The kind, its record, and a crash that cannot tear it** | `payment` is a kind the compiler is satisfied with, its fields are one JSON record under one keychain key, that record travels all six directions with the right redaction in each, and no crash can leave a node without its secret | 4 |
| 2 | **The card and the bank details** | Card and bank forms work, the brand is read from the number and shown as a glyph, and switching form erases the previous one after saying which fields die | 4 |
| 3 | **Mixed digits, and decoys that cannot betray themselves** | The mix checkbox works on PIN, CVV, card number and account number; a decoy is structurally indistinguishable and never equal to the original; a bad checksum is caught BEFORE the original is destroyed; a record with a mixed field cannot be edited | 4 |
| 4 | **The phrase** | Wordlists with real checksums, a decoy phrase whose checksum matches the real one by state, the two-column form with both layouts and the second-real-key mode, and a viewer that reassembles while hinting at nothing | 5 |
| 5 | **The reveal gate, memory hygiene, and the record** | CVV, PIN and an assembled phrase ask for more than an open vault; all six hygiene measures are in place with their limit named out loud; the help article, the module doc, the changelog and the promotion are done | 4 |

Total: **21 stories**. Epics are strictly ordered — 3 needs 1 and 2, 4 needs 3's decoy and validation
seams, 5 needs 4's viewer. Inside an epic the order is also fixed unless a story says otherwise.

## Story status

| story | status | notes |
|---|---|---|
| S1.1 | **landed** | 1 code round, 4 of 6 reviewers. Two findings, both accepted: the flag ladder's precedence could take a config's password away. Three exclusion-shaped permission lists named `payment` |
| S1.2 | **landed** | 3 plan rounds + 1 code round, 5 of 6 reviewers on the code. Ten findings accepted, two rejected with reasons. **Two BLOCKING data-loss paths**, both reproduced as failing tests first: a sync deleted every payment record, and an import that renamed an unsafe id stranded it. Also found a pre-existing config-body version of the second, fixed in its own commit |
| S1.3 | **landed** | 3 plan rounds, both reviewers on two of them. 15 findings accepted, 2 rejected with reasons. The best of the feature: my share list was an EXCLUSION list — the same shape that bit S1.1 three times — and is now an allowlist. Also answered a question I asked three times: the plan's six directions are not all of them, and the other five are audited and pinned in `paymentDoors.test.ts` |
| S1.4 | **landed** | 2 plan rounds (both providers) + my two reviewers + a write-path audit, all started together. **9 findings accepted, 0 rejected** — the highest accept rate of the epic, and five were about MY OWN fixes: the compensation could delete a secret out from under a node that was already persisted; `removeAccount` left ids both tombstoned and live, which the sweep refuses forever while the tombstones sync a deletion elsewhere; `importBundle` dropped secrets nothing named. The audit answered a question no gate asked — *is there a path that writes a node claiming a secret it never writes* — and found three PERMANENT ones (clone, share, share-update) |
| S1.4 (cont.) | | 10 plan rounds in the end. Rounds 4–9 chased progressively narrower crash windows and one of MY fixes for them introduced a real bug the next round caught (an in-flight create's node is absent, so the sweep would have purged it). The residual is closed and the cross-window gap is [PLAN_cross_window_write_coordination.md](PLAN_cross_window_write_coordination.md), built 2026-09-03. Honest verdict: the first three rounds earned their cost; the rest was over-engineering |
| S2.1 | **landed** | Nine systems as a TABLE, not a switch. Two range overlaps are real and the order encodes them (Mir inside Mastercard's neighbourhood; Maestro's bare `6` over Discover and UnionPay). It does not GUESS and it does not REFUSE — the two decisions §2.2 asked for |
| S2.2 | **landed** | Generic marks with initials, deliberately NOT the networks' logos: public MIT repo, and a trademark is not ours to ship. A test fails if somebody later replaces them with real artwork |
| S2.3 | **landed** | Two sections, because the kind and the form narrow at different moments. A stored card is delivered by MESSAGE, never rendered into the page — the rule this kind adds to a page that renders every other kind's stored value. One of my own tests was wrong and its failure was right |
| S2.4 | **landed** | `clearForForm` finally has a caller — the obligation S1.2 left. What a switch erases is DERIVED from the two forms' field lists, so `bank → phrase` cannot be the pair nobody pictured. The warning names fields, never values, and fires only when something is stored. `confirmDestructive` added; the four existing copies deliberately NOT rewritten |
| S3.1 | **landed** | A decoy that cannot betray itself: Luhn and the same BIN for a card, mod-97 and the same country for an IBAN, and for an internal account the same shape and NOTHING more — standard structure beside a non-standard real value is a signpost. The collision guard lives next to the generator, and on exhaustion it THROWS rather than handing back the original |
| S3.2 | **landed** | A failing checksum is a hint when plain and a CONFIRMATION when the field is about to be woven, because afterwards there is no original to compare against. Shipped with no caller and wired in after a review caught it |
| S3.3 | **landed** | The marks become woven values; the method is stored nowhere, asserted by walking all twelve codes through the serialised record. The brand is derived BEFORE the number is woven, which is why it is a stored field |
| S3.4 | **landed** | A woven record cannot be opened for editing — the form would weave the woven value a second time, doubling under two unknown methods, with no error at any step. Condition is "has a mixed field", never "is a phrase" |
| S4.1 + S4.2 | **landed** | Ten BIP-39 lists from the canonical package, never typed, checked against the standard's vectors plus a derived per-language one. My own four-letter-prefix test was wrong and taught me the real property: it holds on the accent-STRIPPED form |
| S4.3 | **landed** | The decoy matches the checksum STATE. Bounded, and refuses loudly — an unbounded loop in a save path is a hung window, not a test failure |
| S4.4 | **landed (core)** | Horizontal only at an even word count, and the tests assert the OFFER rather than the refusal: a refusal after a filled form is the failure being prevented. The FORM wiring is not built — the modules are pure and unwired, which a review named, and S4.5's inverse had to exist first or wiring them would have destroyed data |
| S4.5 | **landed (core)** | `dehorizontalize` + `phraseReassembly`. A review caught that I had shipped the forward split with no inverse and a round-trip test that only proved COLUMN-level inversion — green even though a horizontally-woven phrase could never have been read back. The reassembly hints at nothing: a wrong method answers in the same form as a right one, and the result carries two word arrays and no validity flag |
| S5.1 + S5.2 | **landed** | The only fields in this vault that ask twice, and a buffer that promises fewer copies WE control rather than "one copy in memory" — a claim that is false and unverifiable |
| S5.3 | **landed** | Help in en and ru, the module doc, 0.93.0 |
| S5.4 | **landed** | This promotion |

### Deviations recorded as they happen

1. **Sync moved from S1.3 into S1.2**, out of necessity rather than convenience. The `SECRET_KINDS`
   row put payments into the snapshot `getSnapshot` builds while `ProfileSnapshot` did not carry
   them, so a merged snapshot read as an absence and `dropAbsentKinds` DELETED the key for every
   entity. Deferring sync did not mean "does not sync yet"; it meant "destroys on the first sync".
   S1.3 therefore no longer owns sync — **revision history is the remaining hand-maintained seam**.
2. **A fourth hand-maintained list exists** that no story had named: the vault read-back in
   `syncManager.ts`. Found by `syncManager.test.ts`, which derives its slot list from
   `emptySnapshot()` at run time. All four are now tabulated in
   [module_extension.md](../research/module_extension.md) with the failure each omission produces.
3. **`secretKeys.ts` was extracted in S1.2** because the size ratchet forbade growing
   `storageManager.ts`. Not in any story's plan; the ratchet made it the only way to add a secret
   kind at all.
4. **S2.4 inherits an obligation from S1.2**: `clearForForm` exists with no caller. S2.4 must call it
   BEFORE persisting and add an integration test that switches a PERSISTED card to bank details and
   reads back neither a card value nor a card name.
5. **S1.3's share list is an ALLOWLIST, not the exclusion list the plan implied.** §2.5 reads as "CVV
   and PIN are stripped", which is an exclusion. It is now `SHARE_SAFE` — a field absent from that list
   does not travel. The next story adding a payment field must decide whether it is share-safe, and
   the compiler will not remind it; the plan is the reminder.
6. **The plan's SIX directions were not all of them.** Five more carry entity secrets and none had been
   audited: the masked-terminal path, the broker's `use` route, the headless CLI, terminal env bindings
   and the org-recovery escrow. All five are closed to payment and now asserted
   (`paymentDoors.test.ts`). The masked-output one is closed by UNREACHABILITY rather than by masking,
   and that is deliberate — see the test's own comment for why masking a JSON blob would be worse than
   nothing.

## Open product questions — for the owner, not for a story to decide quietly

1. **Should a payment instrument with a hidden PHRASE be shareable at all?** Today it is shareable and
   the phrase does not travel: a recipient would get tokens they cannot unweave, because the method is
   a code the person remembers and nothing transmits (parent plan §4.4) — and if the sender's second
   column held a second real key, sending it would leak two keys at once. So the safe behaviour ships:
   the entry arrives, the phrase does not, and the SENDER is told by name which fields were withheld.
   The alternative is to refuse to share a phrase record at all, which is arguably clearer. Raised by
   the S1.3 review; **decided conservatively and left open**, because "a card is shareable and a phrase
   is not" is a product statement rather than a redaction detail.
2. ~~`types.ts` is at exactly 800 of 800 lines.~~ **DONE in S1.3** — the code review quoted this very line
   back, because the story that touched the file trimmed two comments instead. `isBackupBundle` moved to
   `backupBundleType.ts`, beside the type it validates, and both comments were restored in full.
   `types.ts` is 762 with real headroom. The earlier attempt that mis-detected the closing brace is why
   the second one asserted its boundaries before writing and refused on CRLF endings until handled.

## Story contract — what every one of them owes

Applies to all 21, so it is written once. A story is not done until every line holds:

1. **Red first.** Each story names its tests. A test for new behaviour is written and *watched
   failing* before the code exists; for a defect the failure message must describe the real symptom,
   not a setup error. Both observations — the red message and the green — go into the story's report.
2. **`npm run compile` and `npm run typecheck` clean, `npm test` green, `npm run lint` clean,
   `npm run ratchet` green.** Warnings are errors in this repository.
3. **No file over 800 lines**, and no new `eslint-disable` on the ceiling. Extract instead.
4. **The `vscode`-free line is respected** — every pure module a story adds (`paymentFields`,
   `cardBrand`, `decoyDigits`, `decoyPhrase`, `paymentValidation`, `paymentRedaction`,
   `paymentFormSwitch`, `wordlists`) imports no `vscode`, which is what makes its edge cases real
   tests. Repository rule 3.
5. **`coai` code review**, then `resolve` with an `accept` or a *reasoned* `reject` for every finding,
   then the accepted fixes, then a re-review if the verdict asks for one. The verdict and the honest
   reviewer count are reported.
6. **One commit, staged by path**, covering only what the story touched, after the tests were seen
   green. Conventional-commit subject.
7. **Docs in the same commit when the story changed something the docs describe** —
   `research/module_extension.md` per story, `CHANGELOG.md` under `[Unreleased]`.

---

## EPIC 1 — The kind, its record, and a crash that cannot tear it

### S1.1 — `payment` is a kind, and the compiler proves nothing was forgotten

Parent plan §1. The cheapest story in the epic and the one that unlocks the rest: no fields, no
secret, no form body — just the kind, so every later story has somewhere to attach.

**Change**

| file | what |
|---|---|
| `types.ts:217` | `'payment'` into the `EntityKind` union |
| `types.ts:219-228` | `ENTITY_KINDS` |
| `types.ts:239-248` | `ENTITY_KIND_LABELS` — label `Payment instrument`, icon `credit-card` |
| `types.ts:63-211` | `EntityMetadata`: `isPayment?`, `paymentForm?: 'card' \| 'bank' \| 'phrase'` |
| `types.ts:606-661` | `isEntityMetadata` — the two new clauses, delegated to a `hasValidPaymentFields()` helper the way `hasValidConfigFields` is at `:640`, so this function's complexity does not grow |
| `entityShape.ts:38-59` | `PaymentShape = EntityBase & { kind: 'payment'; paymentForm: 'card' \| 'bank' \| 'phrase' }` |
| `entityShape.ts:61-69` | the `EntityShape` union |
| `entityShape.ts:71-83` | `EVERY_KIND_HAS_A_SHAPE` — **compile error if skipped** |
| `treeIcons.ts:24-45` | the `kindIcon` case — the one `assertNever` switch in production code |
| `entityFormPage.ts:119-128` | `KIND_HINT` — **compile error if skipped** |
| `entityKind.ts:27-54` | the `kindOf` ladder — `isPayment` above `credential`, below `config` |
| `entityKind.ts:90-101` | `legacyFlags` |
| `entityKind.ts:115-178` | the kind predicates written as `kind !== 'x'`, which default a new kind to **true**: `keepsPassword` → `false`, `canConnectSsh` → `false`, `canBurnOnAgentUse` / `permittedBurnPolicy` reviewed and decided explicitly |
| `treeRowText.ts:68-131` | the `:payment` context token; `isShareable` `:138-153` → shareable |
| `defaultFolders.ts:17-30` | a seeded `payments` folder — the comment at `:25` records `config` being forgotten here for two releases |

`FolderType` needs nothing: it is `EntityKind | 'any' | 'project'` (`types.ts:252`), so the folder
type appears on its own, exactly as the parent plan predicted.

**Tests** — `entityKind.test.ts`, `entityShape.test.ts`, `treeIcons.test.ts`, `types.test.ts` and
`defaultFolders.test.ts` iterate `ENTITY_KINDS` and cover the kind for free; assert that and do not
duplicate. Written by hand: `'payment'` into `formStructure.test.ts:13`'s own `KINDS` tuple (finding 4
above), and a new assertion that `keepsPassword('payment') === false` — the predicate whose default
would otherwise have given a payment record an invisible password slot.

**DoD** — the story contract, plus: the four compiler-enforced maps are filled, the tree offers a
`payment` folder type, and no test in the suite hardcodes a kind list that now excludes `payment`.

### S1.2 — `paymentFields.ts`: one JSON record under one keychain key

Parent plan §2.1, §3.1 and §3d rule 1. Modelled on `entityFields.ts` (59 lines), whose own header
states the reason: *"the record travels as one JSON string under one key, so a third field one day is
a key in this object, not another pass through every seam a secret kind touches (storage, bundle,
snapshot, merge, share, revision — nine files today)."*

**New: `paymentFields.ts`** — `PaymentFields`, `FIELD_KEYS`, `FIELD_LABELS`, `parsePaymentFields`,
`pickPaymentFields`, `serializePaymentFields`, mirroring `entityFields.ts:12-59` including its two
non-obvious rules: an unparseable or empty string yields `{}` and never throws, and an empty picked
record serializes to `undefined`, meaning *delete the key* rather than *store `{}`*.

Keys, all optional strings:

- card — `number`, `expiry`, `holder`, `cvv`, `pin`, `address`, `phone`, `country`, `brand`
- bank — `beneficiary`, `bank`, `iban`, `accountNumber`, `swift`, `intermediary`, `bankAddress`
- phrase — `mixed`, `wordlistFirst`, `wordlistSecond`, `layout`, `ownWords`
- the record itself — `shuffledFields`

`accountNumber` is deliberately **not** `iban`: §3a splits them because a decoy for a plain
`123456789` that carries a country code and a converging mod-97 is separable at a glance.

`brand` is a stored field rather than a derived one, because a mixed number has no first digits to
read (§3a, last paragraph).

`shuffledFields` lives **inside** this record, not on the node. That is §3d rule 1 and the whole
reason it works: the two stores cannot be one transaction, so the mark and the values are written by
one call and the state *"payload present, mark absent"* does not physically exist.

**Change**

| file | what |
|---|---|
| `storageManager.ts:124` | `SecretMapKey` gains `payment` |
| `storageManager.ts:127-138` | a `SECRET_KINDS` row, suffix `:payment` — this one row is what gives local backup, restore and per-entity deletion for free (`entitySecretKeys` `:199`, `removeAccount` `:471`, `deleteNodeRecursive` `:678`, `exportBundle` `:1021`, `importBundle` `:1074`) |
| `storageManager.ts:944-967` | `getPaymentRaw`/`setPaymentRaw` plus typed `getPayment`/`setPayment`, mirroring the `fields` pair exactly |
| `backupBundleType.ts:22` | `payments?: Record<string, string>` |
| `types.ts:730-789` | `isBackupBundle` — an `allStrings(v.payments)` clause. **Note, and do not silently fix:** `notes`, `configs` and `fields` have no such clause today. That is a pre-existing gap in somebody else's field; the story adds the check for its own map and reports the gap rather than widening its diff. |

**Tests** — `paymentFields.test.ts` (pure, no fakes, the `externalBundle.test.ts` style): unparseable
→ `{}`; unknown keys dropped; whitespace-only values dropped; an all-empty record serializes to
`undefined`; a round trip preserves every key. `storagePayment.test.ts` (a real `StorageManager` over
the `memento()`/`secrets()` fakes, the `storageFields.test.ts` style): set/get/delete under the
`:payment` suffix, and the key-forging guard from `storageSecretKeys.test.ts` holds for the new suffix
too.

**DoD** — the story contract, plus: exactly one `SECRET_KINDS` row was added and the four
table-driven seams were asserted to inherit it rather than being edited.

### S1.3 — the record travels six directions, and each one has its own test

Parent plan §2.5. The parent plan's own words: the promise stood in three places and was covered by
**one** test. Six directions, three of which need code that does not exist.

| direction | CVV / PIN | file:line |
|---|---|---|
| Local backup / restore | **carries** | free from S1.2's `SECRET_KINDS` row — assert, do not edit |
| Sync | **carries** | ✅ **DONE IN S1.2** — it could not wait, see deviation 1. `syncMerge.ts` (five edits) plus the vault read-back in `syncManager.ts` and the `rekey` list in `idQuarantine.ts` |
| Revision history | **carries** | `revisionHistory.ts` — `RevisionSecrets:26-38`, `SMALL_FIELDS:64`; `revisionSnapshot.ts:11-31` (the `fields:` line at `:28` is the exemplar) |
| **Share** | **stripped** | `types.ts:457-474` `SharePayload.secrets`; `shareInbox.ts:596-625` `buildSharePayload` (the `fields:` line at `:622`); `shareInbox.ts:564-566` `importShared`'s apply block |
| External export | **carries** | `exportSecrets.ts:24-52` — one `put('payment', …)` beside the `login`/`url` pair at `:46-48`; `externalBundle.ts:13-28` `ExternalSecrets` gains `payment?`. `remapExternalIds:65-95` needs nothing — it never names a field |
| Agent surface | **absent entirely** | `mcpEntries.ts` — `visibleFields:142-152` and `storedSecrets:264-283` are a hand-written allowlist and payment is simply not in it. Assert the absence; the header at `:9-19` says this is the design, so the test protects it |

**New: `paymentRedaction.ts`** — one pure function
`redactPaymentForShare(raw: string): string | undefined` so the asymmetry lives in exactly one place
instead of being remembered at each call site. It drops `cvv` and `pin` and keeps everything else; an
all-empty result returns `undefined` per S1.2's rule.

**Dropping a value means dropping its name from `shuffledFields` too.** Accepted from the review
round. `shuffledFields` (S1.2) is what tells the card which fields get a method picker, so a shared
card that still lists `cvv` there arrives at the recipient with a picker over a value that is not
present — a crash or a garbled row, in somebody else's vault, from a record they cannot edit. The
redaction is therefore one operation over both: remove the key **and** its entry in `shuffledFields`.
Generalised rather than hardcoded, so the next stripped field cannot forget it.

`shareableDetails` (`shareFormat.ts:371-392`) needs **no** change: it operates on plaintext
`EntityMetadata`, and no payment value lives there. Recorded so the next reader does not go looking.

**Tests** — `paymentRedaction.test.ts`, one case per direction and **both** sides of each assertion,
because the parent plan asks for it in as many words: a card with CVV and PIN filled goes to share
**without** them, and to export, backup, sync and revision history **with** them. The export test is
the valuable one — it protects the decision from a later reader who "helpfully" adds a scrub. Plus
`mcpEntries.test.ts`: a payment record reaches an agent with no payment field at all. **And from the
review:** a card whose CVV was mixed goes to share with `cvv` gone from `shuffledFields` as well as
from the values, so the recipient's card renders no picker for a field it does not have.

**DoD** — the story contract, plus: six named tests, one per direction; the asymmetry is stated in
`paymentRedaction.ts`'s header with the reason (a shared copy lives on in someone else's vault; an
export is a file a person made once, deliberately, with a warning).

### S1.4 — a crash never leaves a node without its secret

Parent plan §3d rule 1. **Not a payment story** — a change to every kind, landing before any payment
payload exists to be torn. This is findings 1 and 2 above, and it is the story the review round
changed most: both reviewers independently refuted the first draft of it.

**The invariant, stated once, because "secret first, then node" is not it.** §3d's wording is
per-operation and reads as global. What it actually protects is one thing:

> An orphaned secret — bytes in the keychain that no node references — is the only torn state
> allowed to exist. It is invisible, harmless and collectable. A node that claims a record which is
> not there is visible, broken, and it **syncs**.

That invariant gives *opposite* orders depending on the operation, which is why writing it as one
order produced a defect. Round 8 then showed that "create/update versus delete" is still too coarse —
an *edit that removes a field* is a deletion wearing an update's clothes. So the invariant resolves
into **two rules**, and between them they cover every case:

> **Rule A — the referrer is written on the safe side of its referent.** The node's metadata *refers
> to* a secret; the secret is the thing referred to. **Adding** a reference writes the referent first
> (secret, then node). **Removing** a reference writes the referrer first (node, then secret). Either
> way the only reachable-crash state is a secret nobody points at.
>
> **Rule B — a durable record naming what is about to become unreachable exists BEFORE it becomes
> unreachable.** For a deletion that record is the tombstone, so the order is tombstone, then node,
> then secrets.

| operation | order | what a crash mid-way leaves |
|---|---|---|
| create, or an edit that ADDS a field | **secret, then node** | a secret nothing points at — an orphan |
| an edit that REMOVES a field | **node, then secret** | an orphan. Reversed, it leaves the old node still claiming a payload that is already gone |
| delete a node | **tombstone, then node, then secrets** | an orphan **that the tombstone names** |

Rule A's second row is the round-8 finding and it is not a corner case: `applySecrets` already
*deletes* secrets when a `clearX` checkbox is set (`applyFormSecrets.ts:9-20` `applyOptional` — its
three-way clear/set/leave-alone shape is exactly where this lives). So a single save can both add and
remove, and it cannot be ordered as one unit: **the additions go before `updateNode`, the removals
after it.** That splits `applySecrets` into two calls around the node write, which is the real change
this story makes and the reason it is not a one-line reorder.

Rule B is why the tombstone moves ahead of the node write and not merely ahead of the secret loop. The
round-8 finding: with `saveNodes` → `setTombstones` → secrets, a kill between the first two leaves the
node durably gone and no tombstone written — an orphan named by nothing, which no sweep can ever
collect. With the tombstone first, the worst interruption leaves a node that is **both live and
tombstoned**, and the sweep already refuses that pair (a re-created id wins over its own tombstone),
so the deletion is simply not finished and can be re-run — nothing is lost and nothing is
unreachable.

**Change**

| file:line | today | after | why |
|---|---|---|---|
| `entityEditCommands.ts:99` / `:109` | `updateNode` → `applySecrets` | **`applySecrets`(additions) → `updateNode` → `applySecrets`(removals)** | Rule A both ways. A save that adds a field must write it before the node claims it; a save that clears one must stop the node claiming it before the value goes |
| `commands/treeMutationCommands.ts:250` / `:264` | `addNode` → `applySecrets` | **`applySecrets` → `addNode`** | Rule A. A create has no removals, so it stays one call |
| `applyFormSecrets.ts:9-20` | one `applyOptional` pass doing set **and** delete | **split into an additions pass and a removals pass** | the two halves belong on opposite sides of the node write, so they cannot stay one call |
| `storageManager.ts:693` / `:706-709` / `:711` | `saveNodes` → secrets → `setTombstones` | **`setTombstones` → `saveNodes` → secrets** | Rule B. The tombstone is the recovery record; it must be durable before the node stops being derivable |

The third and fourth rows are the round-8 findings. Note what the fourth one is *not*: the first draft
of this story proposed inverting `saveNodes` and the secret loop, which deletes the secret and then
fails to persist the tree, returning the node on next start with its data permanently gone. That
inversion is still wrong; what moves is the **tombstone**, to the front.

**New: a startup orphan sweep, driven by tombstones — not by enumeration.**
`vscode.SecretStorage` offers `get`/`store`/`delete` on a **known** key and no listing, and every
secret read here is driven by iterating live nodes (`readKindsInto`, `storageManager.ts:1047-1054`).
So "list the keys and drop what no node claims" is unimplementable as stated, and a new durable key
index would be a second source of truth to keep honest.

Deletion already writes the list this needs: a tombstone per removed id (`:699-711`), kept for the
sync merge. The sweep is therefore: for every tombstone id, for every `SECRET_KINDS` row, `get` the
key and `delete` it if something is there. Pure core —
`orphanCandidates(tombstoneIds, liveNodeIds): readonly string[]` — so it is tested with no keychain,
plus a thin caller wired beside `EphemeralSweeper` (`extension.ts:326-327`). An id that is **both**
tombstoned and live is never swept: a re-created id wins over its own tombstone.

**The honest limit, stated rather than glossed:** a tombstone pruned by the horizon before a sweep
ever runs leaves an orphan that is never collected. That is a wasted keychain slot holding ciphertext
no key path reaches — invisible and harmless, which is precisely the state the invariant permits. It
is not a leak and it is not silently ignored: it is the tolerated case.

**Tests** — `entityWriteOrder.test.ts` (named for all kinds, not `paymentWrite`, because that is what
it covers). The fake `secrets` store throws on the nth call, and at **every** boundary the surviving
state is checked against the invariant rather than against a snapshot:

- a create interrupted at each boundary never leaves a node claiming an absent secret;
- **an edit that REMOVES a field** — the round-8 case — interrupted after the removal: the persisted
  node must already have stopped claiming it. This is the test that fails against a single-pass
  `applySecrets`, which is what makes it worth writing;
- `saveNodes` fails *after* a successful secret deletion — unreachable by construction, because the
  node is persisted first;
- **a deletion interrupted between the tombstone and `saveNodes`** — the other round-8 case: the node
  is still live and also tombstoned, and the sweep must leave it alone;
- a keychain refusal leaves the form open with the words on screen and the error shown.

`orphanSweep.test.ts`: a tombstoned id's secret is dropped; a live id's secret is not; an id that is
both tombstoned and live is not; a tombstone with nothing in the keychain is a no-op rather than an
error.

**One question round 8 asked that this story must answer before it is written, not during:** the
invariant was audited against create, update and delete only. The other paths that write nodes and
secrets — `importBundle`/restore, the sync merge's apply, a revision rollback, Restore from the Trash
— are **not** yet checked against Rule A, and the reviewer was right to ask. The story starts by
auditing those four and reports what it found; if any of them orders the pair wrongly, that is part of
this story, because a second write path with the opposite order makes the invariant a comment.

Because this changes all kinds, the existing `entityEditCommands.test.ts` and tree-mutation tests must
stay green **unmodified** — if one needs editing to pass, that is a behaviour change to report, not a
test to adjust.

**DoD** — the story contract, plus: the invariant is written into `storageManager.ts`'s own header in
the two-row form above, so the next reader cannot re-derive "secret first" as a global rule; the
sweep is tombstone-driven with its limit stated; the report says explicitly that a non-payment kind
changed behaviour and which tests proved it did not regress.

---

## EPIC 2 — The card and the bank details

### S2.1 — `cardBrand.ts`: the number says which system, and Luhn only hints

Parent plan §2.2. Pure, no network, no `vscode`.

`brandOf(number: string): CardBrand | ''` over Visa, Mastercard, Amex, Discover, JCB, Diners,
UnionPay, Mir and Maestro — BIN prefixes and accepted lengths as a **table, not a switch**, following
`shuffle.ts:107-129`'s stated pattern so a tenth system is a row. `luhn(number): boolean` is exported
separately and used as a *typo hint*: a card the algorithm rejects still saves (§2.2). `binOf(number)`
is exported too, because `decoyDigits` needs it in S3.1.

**Tests** — `cardBrand.test.ts`: one published test number per system; a foreign prefix returns `''`
rather than a guess; a Luhn failure is a hint and never a refusal; `binOf` agrees with `brandOf` for
every fixture.

### S2.2 — the brand glyph, served the way an MCP icon already is

Parent plan §2.3. A payment-system mark cannot be drawn with a codicon, and `mcpIcons.ts` already
serves an SVG file as an icon — that is the path, not a new one.

SVGs into `media/brands/`, light and dark where the mark needs it (the `media/` convention is
`x-green.svg` / `x-green-light.svg`). Marks are drawn as neutral generic glyphs, **not** the card
networks' trademarked logos — this repository is public and MIT, and a trademark is not ours to ship.

**Tests** — the `manifestIcons.test.ts` / `mcpIcons.test.ts` style: every brand `cardBrand.ts` can
return has a file on disk, and every file is claimed by a brand. Adding a system without its glyph
reddens.

### S2.3 — the card form, and the notice that is shown once

Parent plan §2.4, and the §2.1 note that the difference between a number and a CVV lives in the form,
the card and the agent filter — not in storage.

**Change**

| file | what |
|---|---|
| `formSections.ts:73-180` | `paymentSection` (the form selector, `kinds: ['payment']`) and `cardSection` with `condition: "val('paymentForm') === 'card'"` — the `condition` mechanism already exists and `keySection:157` is the precedent. Colours picked so `colorCollisionsForKind` (`:199-207`) stays empty for `payment` |
| `entityFormPage.ts:411-694` | the `paymentForm` `<select>` and the card `<fieldset>` via `openSection(...)`, which throws on an id not in the catalog |
| `formVisibilityScript.ts` | **nothing** — the show/hide ladder is generated from `FORM_SECTIONS` |
| `entityFormScript.ts:663-693` | the new field names into the `save` payload |
| `entityFormPanel.ts:561-706` | `toValues`: `const isPayment = kind === 'payment'`, every payment field guarded by it, and every *other* kind's fields scrubbed when `isPayment` — the `isConfig` block at `:664-673` is the pattern |
| `applyFormSecrets.ts:41` | one `storage.setPayment(...)` call beside `setFields` |

CVV and PIN render hidden and reveal by a separate action. The one-time notice says plainly what is
being put next to the number and how that differs from storing a number alone (§2.4).

**Tests** — `entityFormPage.test.ts`: the card fieldset renders for `payment` and not for other kinds;
**no stored value appears in the HTML string** (the existing `:60-72` assertion extended — the one
rule this page has). `formStructure.test.ts`: fieldsets balance. `webviewHtml.test.ts` picks up the new
kind for free once it is in `ENTITY_KINDS` — assert that it does.

### S2.4 — bank details, and switching form erases the previous one

Parent plan §3.1 and §3e. Three forms in one JSON record is deliberate (§2.1) — and that is exactly
why a card re-typed as bank details leaves `number`, `cvv` and `pin` inside the record, invisible in
the form and very much present in sync and export.

**New: `paymentFormSwitch.ts`** — pure. `keysClearedBy(from, to): readonly string[]` and
`clearForForm(fields, form): PaymentFields`. The confirmation lists **field names, never values**.

**New in `dialogs.ts`: one `confirmDestructive(text, actionLabel): Promise<boolean>`** — the
`reuse-first` step-2 move. Four hand-written copies of
`showWarningMessage(text, { modal: true }, label)` exist today (`entityFormPanel.ts:397`,
`hostKeyTrust.ts:119`, `hygieneScan.ts:147`, `remoteCliInstall.ts:162`); this story writes the helper
and uses it, and **does not** rewrite the four existing call sites — that is a separate change nobody
asked for. The four are named in the report with a recommendation to migrate them, per `reuse-first`'s
"describe it, propose it, ask".

**Tests** — `paymentFormSwitch.test.ts`: card → bank → save leaves not one card key in the record;
declining the confirmation changes **nothing**; every ordered pair of the three forms has a case, so
`bank → phrase` cannot be the one nobody thought about.

---

## EPIC 3 — Mixed digits, and decoys that cannot betray themselves

### S3.1 — `decoyDigits.ts`: same structure, and never the original

Parent plan §3a. The hardest correctness story in the plan, and the one whose failure is silent.

`shuffle.ts` already knows nothing about words or digits and must stay that way — the difference lives
**only** in the decoy generator (§3a). So this module is the difference.

| field | what the decoy half must satisfy |
|---|---|
| Card number | passes Luhn **and** carries a BIN of the same system |
| IBAN | converges mod-97 **and** carries the same country code |
| Internal account (not IBAN) | the same length and the same alphabet — and nothing more |
| CVV, PIN | nothing: there is no structure, all digits are equal |

**The collision guard lives next to the generator, not at each field** (§3a). One
`generateDecoy(spec, rng)` that rejects a draw equal to the original and draws again, so the rule
covers digits and phrases with one implementation instead of being remembered once per field kind. At
a CVV that is one draw in a thousand and *not* theoretical: in that state the "decoy" **is** the real
CVV, the record shows it twice, and the person never finds out.

**Tests** — `decoyDigits.test.ts`: a decoy card passes Luhn and shares the BIN; a decoy IBAN converges
and shares the country; a decoy internal account matches length and alphabet and carries **no**
country code — the case §3a spells out, because a standard-shaped decoy beside a non-standard real
value separates the halves at a glance; a generator returning "just digits" reddens. Then the
deterministic collision test: a seeded RNG that yields the original first and something else second —
the generator must discard the first. And `unshuffleTokens(shuffleTokens(a, b, f), f)` round-trips for
every code and every length, asserted over **multisets** for digits, because digits repeat and a
"no token repeated" assertion would be wrong.

### S3.2 — `paymentValidation.ts`: checked before saving, because saving destroys the original

Parent plan §3b. A real hole, not a formality: a mixed field has no original after saving, so a typo
in it can never be noticed — not in the viewer, not in a backup, not next year.

| field | plain | marked "mix" |
|---|---|---|
| Card number | Luhn as a **hint** — said and saved | **hard confirmation** on a failing checksum |
| IBAN | mod-97 + country as a hint | hard confirmation |
| Internal account | nothing to check, and that is not an omission (§3a) | nothing to check |
| Phrase on a checksum-bearing wordlist | hint | hard confirmation |

Pure: `validatePayment(fields, shuffledFields): readonly Warning[]`, each warning carrying its field,
its text and its severity (`hint` | `confirm`). Nothing here refuses a save — the form decides what to
do with a `confirm`.

The 6–50 range is **not** narrowed to BIP-39 lengths: the owner widened it deliberately (a code
phrase, a security answer, a list of one-time codes), and the reviewer finding that asked to narrow it
was rejected inside an accepted finding (§3b).

**Tests** — `paymentValidation.test.ts`: a BIP-39 phrase with one word swapped fails its checksum; a
mixed field with a broken checksum yields `confirm` while a plain one yields `hint`; removing the
split makes the test red — that split is the whole story.

### S3.3 — the mix checkbox, per field, each with its own method

Parent plan §3a (the per-field decision, 2026-09-01) and §3d rule 1.

A `mix` checkbox on PIN, CVV, card number and account number. The method is offered **once and applied
to every marked field by default**; whoever wants to expands and gives each its own. The argument
against per-field codes stays on the record — four codes on one card is four chances to forget, and a
forgotten code is lost data — and is answered by the form, not by reversing the decision: the careful
person remembers one code, the paranoid four, and neither pays for the other's choice.

Nothing changes in storage: codes are stored **nowhere**, and that is invariant. What changes is the
interface, and `shuffledFields` (S1.2) stops being a convenience — the card must know which field gets
a method picker and which is shown as it is.

The interface says what mixing digits does **not** buy (§3a): against someone who can *enumerate*, a
CVV is 1000 values and mixing costs them nothing. It works against someone **reading** an already open
vault. Promising more would be a lie, and it is written on the screen, not only in the help.

**Tests** — the payload carries `shuffledFields` and the values are woven; a field not marked is stored
plainly; the default applies one method to all marked fields and an expanded picker overrides per
field; the brand is stored as its own field when the number is mixed (§3a).

### S3.4 — a record with a mixed field has no Edit

Parent plan §3d rule 2 and §4.6. There is no such gate today (finding 3).

Without it a card with a mixed PIN opens for editing, the form puts 8 digits where 4 belong (no
original, no code), and saving either fails validation or weaves them **again** — 16 digits under two
unknown codes. Irreversibly destroyed. The same number becomes 32 digits, then 64.

The condition is **"has a mixed field"**, never "is a phrase".

**Change** — a guard at the top of `editNode` (`entityEditCommands.ts:29`) that refuses with a
sentence, in the shape of the existing state-gated refusal `refuseEnv`
(`entityViewerCommands.ts:170-175`); and a `:mixed` context token from `treeRowText.ts:68-131` so
`package.json`'s `when` clause hides the menu item rather than only refusing after a click. Both: the
token is UX, the guard is the guarantee.

**Tests** — `entityEditCommands.test.ts`: a card with a mixed PIN has no edit command and `editNode`
refuses if called anyway; a card with **nothing** mixed edits normally — the second case is what stops
the gate from being written as "payment records cannot be edited".

---

## EPIC 4 — The phrase

### S4.1 — wordlists: the registry, BIP-39 English, and Monero

Parent plan §4.3. Note on shape, decided here: this repository embeds a wordlist as a TS string
constant (`secretGenerator.ts:143`, 256 words with its reasoning in the header). BIP-39 is 2048 words
per language and the file ceiling is 800 lines, so it is **one module per language** plus a registry —
never one file with ten lists.

`wordlists.ts` — the registry: `WordlistId`, `wordlistOf(id)`, `hasChecksum(id, length)`,
`checksumHolds(words, id)`, `indexOf(word, id)`. `wordlistBip39En.ts` and `wordlistMoneroEn.ts` — the
data. These two first, because they are the two whose checksums §3b actually validates.

**Deviation to record now:** the parent plan says "BIP-39 (English and the other eight languages)".
There are **ten** official BIP-39 wordlists (en, ja, ko, es, zh-Hans, zh-Hant, fr, it, cs, pt). The
count in the plan is wrong, not the intent; S4.2 ships the remaining nine.

**Tests** — `wordlists.test.ts`: each list's exact length (2048 / 1626) and its uniqueness — the
arithmetic the checksum depends on; published BIP-39 test vectors pass; a single swapped word fails;
Monero's 25th word is checked by its own rule, not BIP-39's.

### S4.2 — the remaining nine BIP-39 languages

Parent plan §4.3. Data only, one module per language, each registered in `wordlists.ts`. Split from
S4.1 so that a review round reads a *mechanism* and a review round reads *data*, and neither hides in
the other's diff.

**Tests** — the S4.1 suite, parameterised over every registered list: length, uniqueness, NFKD
normalisation, and the four-letter-prefix uniqueness property BIP-39 guarantees (which is what makes a
typo findable). A language registered without its data reddens.

### S4.3 — `decoyPhrase.ts`: the decoy's checksum matches the real one BY STATE

Parent plan §4.3, and §7 item 1 — the one thing taken from a rejected finding because it costs
nothing.

The old rule was "the decoy must have a *converging* checksum". Wrong, and dangerously so: if the
person deliberately re-ordered words in their own phrase then under the correct method exactly **one**
half validates — which points straight at the correct method. So: converges for the entered phrase →
generate a converging decoy; does not converge → generate a **non**-converging one. Nothing extra is
computed — §3b already has the entered phrase's checksum.

The generator is not called at all when the second column holds the person's own words or a second
real key (§4.4): there is nothing to fake, both halves are real, and both checksum states match by
construction.

Uses S3.1's `generateDecoy` collision guard — one rule for digits and phrases, which is why it lives
next to the generator.

**Rejection sampling must be bounded, and the checksum target must be reachable.** Accepted from the
review round: *"converge for the entered phrase"* is not always satisfiable by the chosen decoy
wordlist, and the naive loop then spins forever. A real 12-word BIP-39 phrase with Monero picked for
column 2 asks for a 12-word Monero phrase with a converging checksum — and Monero defines a checksum
only at 25 words, so no draw can ever satisfy it. Two rules close it:

1. **The checksum-state rule applies only where a checksum EXISTS at that length in the decoy's own
   wordlist** — `hasChecksum(id, length)`, already in S4.1's registry, is the guard. Where it is
   false there is no checksum to match, the constraint drops, and the decoy is drawn freely. The
   §4.3 rule is about not *revealing* the method through a checksum mismatch; a wordlist with no
   checksum at that length reveals nothing, so there is nothing to match.
2. **Every rejection-sampling loop has a bounded attempt count and fails LOUDLY** — a named refusal
   the form shows, never an unbounded retry and never a silent fall-through to an unconstrained
   draw. A generator that cannot meet its constraint must say so; a generator that quietly relaxes
   it produces exactly the separable half §3a forbids.

**Tests** — `decoyPhrase.test.ts`: an entered phrase with a converging checksum → the decoy converges;
entered with words deliberately moved → the decoy **also** fails; the decoy comes from the *chosen*
wordlist (a word from another list is spotted instantly); the decoy is never equal to the real phrase.
**And the two cases from the review:** a 12-word BIP-39 phrase with a Monero decoy wordlist terminates
— with no checksum constraint applied, because Monero has none at 12 — rather than hanging; and a
generator given an unsatisfiable constraint returns a named refusal within its attempt bound instead
of looping. The second test needs a deliberately impossible spec, and it is worth writing precisely
because an infinite loop in a save path is not a test failure anybody sees — it is a hung window.

### S4.4 — the phrase form: two columns, two layouts, and a second real key

Parent plan §4.4.

Two columns, a wordlist per **column** (two real phrases may be different lists or languages), a
layout switch, the method list in random order every open, and one unambiguous confirmation before
saving: a forgotten code is a lost phrase — not us, not a backup, not sync, because the original is in
none of them.

| layout | column 1 | column 2 | defined for |
|---|---|---|---|
| Vertical | the whole real phrase | the whole decoy | **any** length in `PHRASE_RANGE` |
| Horizontal | first half of the real + first half of the decoy | the second halves of both | **even** lengths only |

**Horizontal is offered only for an even number of words, and that is arithmetic rather than a
preference.** Accepted from the review round. Weaving requires two columns of *equal* length. At 25
words — standard Monero, and squarely inside the 6–50 range — halving gives 13 and 12, so column 1
holds 26 tokens and column 2 holds 24, `shuffleRefusal` refuses, and the save dies at the last step
after everything has been typed. The thirds convention from
[ЗАДАЧА_варианты_перемешивания_сид_фразы.md](../todo/ЗАДАЧА_варианты_перемешивания_сид_фразы.md) ("the first
two parts are equal, the remainder goes to the third") does not rescue it: unequal columns are not a
cosmetic imbalance here, they are unweavable. So the layout switch **hides** horizontal at an odd
length and says why in one line, instead of offering a choice that cannot be saved.

Consequence to state on the screen and in the help: **an odd-length phrase has twelve methods, an
even-length one has twenty-four.** Not a defence in either case — enumerating 24 is no dearer than 12
— so nothing is lost but the arithmetic must not surprise anyone at save time.

**The second column may be a second real key** (§4.4). Then the decoy generator is not called; each
phrase hides the other. Three consequences, all three into the help: a leak of the mixed view reveals
**two** keys rather than one; the lengths must match (a requirement of weaving, not ours — the form
says so through `shuffleRefusal`); and the wordlist is chosen per column.

The checksum hint appears **once, at save, and only if the entered phrase's checksum converges**
(§4.4, §7 item 2): the mixed view leaking on its own comes down to roughly two candidates, and words
the person moved themselves remove that. Never required — requiring it raises the "forgot it and lost
it forever" risk, which is the larger loss.

**Tests** — unequal lengths refuse through `shuffleRefusal` with words, not a silent failure; the
method list order differs across renders; the save confirmation cannot be skipped; the second-real-key
mode calls no generator; the hint appears only for a converging entered phrase. **And from the
review:** at an odd length the horizontal layout is not offered at all, and a 25-word phrase saves
under the vertical layout rather than being refused at the last step — the test asserts the offer, not
only the refusal, because a refusal after a form is filled is the failure being prevented.

### S4.5 — the viewer card: reassembly that hints at nothing

Parent plan §4.5, and the parent plan's own trap — the viewer must not *hint*, because a "valid
BIP-39" tick turns twelve methods into one second of enumeration for exactly the person the scheme
defends against.

Each mixed field gets **its own** method and layout picker (§3a), not one list per record. The chosen
method rebuilds the field as two coloured rows.

The mechanism is already in the product and should be copied rather than invented: TOTP recomputes a
live value per request and the seed never reaches the page (`entityViewPanel.ts:129-137`,
`viewerOptions.ts:70-73`). So the reassembly runs **host-side** per request and posts back two
**arrays** — never a joined string, on either side (§5.1). `viewerOptions.ts:40-47`'s `SecretReader`
gains a payment accessor so the live and revision viewers share one resolution ladder automatically.

**`unshuffleTokens` is not the whole reassembly — the layout has to be undone too.** Accepted from
the review round, and it is the kind of gap that would have shipped as "the viewer shows nonsense for
half the records". `unshuffleTokens` returns the two **columns** that were woven. Under the vertical
layout those columns *are* the real phrase and the decoy, so nothing further is needed. Under the
**horizontal** layout they are not: column 1 is the first half of the real followed by the first half
of the decoy, so each returned array is half-real and half-decoy, and rendering them as two rows shows
neither phrase. Reassembly is therefore two named steps, and the second one is missing from the parent
plan:

```
unshuffleTokens(mixed, code)  ->  { first: column1, second: column2 }
dehorizontalize(column1, column2) ->  { real, decoy }        // identity when layout is vertical
```

`dehorizontalize` is pure, sits beside `shuffle.ts` without touching it (that module knows nothing
about words, digits *or* layouts, and must keep knowing nothing), and is the exact inverse of the
form's horizontal split. Both directions read one shared halving function, for the same reason
`shuffleTokens`/`unshuffleTokens` both read one `layout` — a split that disagrees with its own inverse
destroys the value silently, because the original is nowhere.

**No checksum check, no "looks real" mark, nothing** — and the test states it as a property: for a
correct and an incorrect method the answer is **identical in form**, two rows, no tick, no validation.

**Tests** — the viewer test above; each mixed field renders its own picker; the picker order is random
per open; the reassembly comes from the host and the page never receives a stored value. **And from
the review:** a phrase saved under the horizontal layout round-trips to the *original* real phrase
through `unshuffleTokens` **then** `dehorizontalize` — asserted on the real phrase, because a test that
only checks the two columns come back is exactly the test that would have missed this.

---

## EPIC 5 — The reveal gate, memory hygiene, and the record

### S5.1 — CVV, PIN and an assembled phrase ask for more than an open vault

Parent plan §3c. **A new rung for this product, added deliberately.** Today no secret asks for
anything beyond the vault being unlocked: unlocked means the password copies
(`entityViewPanel.ts:162-171`). Payment fields become the exception, and the help says so plainly so
the inconsistency reads as a decision rather than an oversight.

Uses `confirmDestructive` from S2.4 — joined by a sibling `confirmReveal` if the wording differs, but
one helper either way, not a fifth copy.

**Tests** — CVV, PIN and an assembled phrase do not appear without confirmation; removing the rung
reddens; a declined confirmation reveals nothing and leaves no partial state.

### S5.2 — memory hygiene, all six measures, with the limit named out loud

Parent plan §5.

| # | measure | note |
|---|---|---|
| 5.1 | the phrase is never joined into one string in any UI or render layer — words are separate DOM nodes, HTML is built through DOM APIs, `postMessage` carries an array | the **one** honest exception is `clipboard.writeText`, which takes a string and only a string; written as an exception because claiming "never" would be false (round-6 finding) |
| 5.2 | the assembled view auto-closes after N seconds | |
| 5.3 | the viewer card is really destroyed | `entityViewPanel.ts:98` already passes no `retainContextWhenHidden` — **verify, do not add.** And 5.3 must **not** be applied to the form: `formPanels.ts:35-39` sets `retainContextWhenHidden: true` deliberately, and honouring 5.3 literally there would restore the defect where switching tabs wiped a half-filled form |
| 5.4 | the assembled value lives first as a byte buffer we allocated and zero on close; rendering reads from it | **fewer** application-controlled copies, not "exactly one" — see the honesty note below |
| 5.5 | on close the card returns to the mixed view **first**, then is destroyed | so the freshest thing in the renderer's memory is not the open value. Costs nothing, and it is the only part of "flood the memory with junk" that works — the junk is real and already there |
| 5.6 | a help paragraph on swap and hibernation | a memory dump is taken from there more often than from a live process |

**Decoys are NOT built**, and the reason is recorded so nobody revisits it in six months (parent plan
§5.4): they fail to compose with 5.1 in either branch. If 5.1 works the attacker never finds the
sequence and decoys add noise to a search that already failed; if 5.1 failed they parsed our DOM and
found exactly one assembled structure, which loop-built decoys that never entered the DOM resemble in
no way. Useful where unneeded, useless where needed — and the blockchain and Luhn sieve them out in a
minute. Forcing garbage collection is also out of scope: `global.gc` needs `--expose-gc` and VS Code
does not start that way.

**This is best-effort hygiene, and 5.4 must not be written as a guarantee.** Accepted from the review
round, and it is the same species of overclaim the parent plan already corrected once in 5.1. Decoding
a byte buffer and assigning each word to a DOM text node creates JavaScript strings *in addition to*
the buffer, plus DOM and renderer copies the runtime owns and we cannot reach. So "exactly one copy"
is false, and — worse — **unverifiable**: every test listed below can pass while the claim is untrue,
because they inspect `globalState`, webview state, logs and message shape, none of which can count
copies in a heap. What 5.4 actually buys is fewer copies *we* control and a buffer we can zero, which
is worth doing and is all that may be promised. The help says the limit in plain words (5.6), the way
§5.1 already says a JS string cannot be zeroed.

So the claim is *"fewer application-controlled copies, and the ones we own are cleared on close"*, and
the tests assert the **actions**, not a copy count.

**Tests** — after assembling and closing, no word of the phrase exists in `globalState`, in webview
state, or in the log; `postMessage` payloads are arrays; the form still retains its context (a
regression test for the trap in 5.3). **And the lifecycle actions themselves, since the count cannot
be tested:** on close the buffer we allocated is zeroed (asserted by reading it back), the card's DOM
is emptied, and 5.5's return-to-mixed-view happens **before** the dispose — asserted on the order of
the calls, because that order is the whole measure.

### S5.3 — the help article, the module doc, the changelog

Parent plan §6.

- A help article of its own (`helpContent.ts:38` `HelpArticle`) carrying all twelve breakdowns as
  three lines and two columns. **`en` and `ru` both**, per §6.1. Recorded honestly:
  `helpCoverage.test.ts:36` builds its corpus from `a.en` only, so the Russian body is an obligation
  of this plan and **not** something CI will catch — while any new command without help text *does*
  redden that same file.
- The article must say the things the product would otherwise over-promise: what mixing digits does
  not buy (§3a), that these are the only fields asking for more than an open vault (§3c), that a
  string in JS cannot be zeroed and what that means (§5.1, §5.6), and that in the second-real-key mode
  a leak reveals two keys (§4.4).
- `research/module_extension.md` — the new kind, the three forms, the mixing module, the reversed
  write order from S1.4 (which belongs to the whole extension, not to payments), and the new reveal
  rung.
- `CHANGELOG.md` under `[Unreleased]` → a version, and `package.json`'s `version` bumped. Nothing
  ships on merge here: the `.vsix` is released by pushing an `extension-vX.Y.Z` tag, and this story
  does **not** push one.

### S5.4 — promotion

Per `planning-docs.md` and `CLAUDE.md`'s Knowledge Base Sync, in the same task as the last story
rather than "later".

`/promote-plan` on **both** [PLAN_payment_instruments.md](PLAN_payment_instruments.md) and this file:
`git mv` to `research/`, status → `IMPLEMENTED <date>` with the deviations recorded (the wordlist count
from S4.1, the reversed write order becoming a cross-kind change, and whatever else the build teaches),
relative links fixed in both directions, inbound references updated, the *Currently open* table in
[README.md](../todo/README.md) trimmed, and any phase that did not get built extracted into a fresh `todo/`
plan rather than holding the document hostage.

**DoD** — `node .claude/rules/shared/tools/plan-lifecycle.mjs` exits 0 and
`node .claude/rules/shared/tools/pin-check.mjs` exits 0.

---

## Definition of Done — the whole plan

The parent plan's own DoD list is the authority and is not copied here. This file adds only what the
breakdown itself owes:

- [ ] All 21 stories landed, each as its own commit, each with its tests seen red before green.
- [ ] Every story went through a `coai` `review_code` round; every finding was resolved with an
      `accept` or a reasoned `reject`; each report names the verdict **and** how many reviewers
      actually answered.
- [ ] No story's commit swept in another session's work — staged by path, staged diff read.
- [ ] The cross-kind changes are called out as such in their reports: the write order (S1.4), the
      startup sweep (S1.4), the shared confirmation helper (S2.4).
- [ ] Deviations from the parent plan were recorded in the parent plan at promotion, not only here.
- [ ] `plan-lifecycle.mjs` and `pin-check.mjs` exit 0, and the `todo/README.md` table matches the
      folder.
