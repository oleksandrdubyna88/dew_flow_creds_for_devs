# PLAN — payment instruments, broken into epics and stories

> Status: **plan only, nothing implemented yet.** This is the BUILD ORDER for
> [PLAN_payment_instruments.md](PLAN_payment_instruments.md) — it decides nothing and repeats nothing.
> Every product decision, every rejected reviewer finding and every reason lives in the parent plan;
> the `§` references below point into it and are the authority whenever this file and that one seem to
> disagree.
>
> Scope: `src_vs_code` only. The server is not touched and no HTTP contract changes, so
> [module_server.md](../research/module_server.md) is out of scope by construction.
>
> Related: [ЗАДАЧА_варианты_перемешивания_сид_фразы.md](ЗАДАЧА_варианты_перемешивания_сид_фразы.md)
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

1. **The write order today is the opposite of what §3d requires.** §3d rule 1 asks for *secret, then
   node*. The code writes *node, then secret*, in both mutation paths —
   `entityEditCommands.ts:99` (`updateNode` → `globalState`) then `:109` (`applySecrets` →
   `SecretStorage`), and `commands/treeMutationCommands.ts:250` then `:264`. Deletion has the same
   shape reversed: `storageManager.ts:693` (`saveNodes`, node gone from the tree) runs **before** the
   secret-deletion loop at `:706`. So §3d is not a payment story at all — it is a change to every
   kind, and it gets its own story (**S1.4**) that lands before any payment payload exists to be torn.
2. **There is no startup sweep for orphaned secrets.** §3d's table calls an orphaned secret
   "invisible, harmless, cleaned by a startup sweep". `StorageManager.init()` (`:336-361`) only
   migrates plaintext node slots into sealed metadata; `EphemeralSweeper` sweeps entity *expiry*, not
   orphans; `dropVanishedSecrets`/`dropAbsentKinds` (`:1111-1128`) run only inside `importBundle`.
   The sweep the plan relies on must be built — also **S1.4**.
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
| Sync | **carries** | `syncMerge.ts` — `ProfileSnapshot:53`, `emptySnapshot:68-84`, `fingerprint:122-150`, `mergeProfiles`' `copySecret` at `:246` and the `merged` literal `:272-286`. Four hand edits: this snapshot is a hand-maintained mirror of `SecretMapKey`, not table-driven |
| Revision history | **carries** | `revisionHistory.ts` — `RevisionSecrets:26-38`, `SMALL_FIELDS:64`; `revisionSnapshot.ts:11-31` (the `fields:` line at `:28` is the exemplar) |
| **Share** | **stripped** | `types.ts:457-474` `SharePayload.secrets`; `shareInbox.ts:596-625` `buildSharePayload` (the `fields:` line at `:622`); `shareInbox.ts:564-566` `importShared`'s apply block |
| External export | **carries** | `exportSecrets.ts:24-52` — one `put('payment', …)` beside the `login`/`url` pair at `:46-48`; `externalBundle.ts:13-28` `ExternalSecrets` gains `payment?`. `remapExternalIds:65-95` needs nothing — it never names a field |
| Agent surface | **absent entirely** | `mcpEntries.ts` — `visibleFields:142-152` and `storedSecrets:264-283` are a hand-written allowlist and payment is simply not in it. Assert the absence; the header at `:9-19` says this is the design, so the test protects it |

**New: `paymentRedaction.ts`** — one pure function
`redactPaymentForShare(raw: string): string | undefined` so the asymmetry lives in exactly one place
instead of being remembered at each call site. It drops `cvv` and `pin` and keeps everything else; an
all-empty result returns `undefined` per S1.2's rule.

`shareableDetails` (`shareFormat.ts:371-392`) needs **no** change: it operates on plaintext
`EntityMetadata`, and no payment value lives there. Recorded so the next reader does not go looking.

**Tests** — `paymentRedaction.test.ts`, one case per direction and **both** sides of each assertion,
because the parent plan asks for it in as many words: a card with CVV and PIN filled goes to share
**without** them, and to export, backup, sync and revision history **with** them. The export test is
the valuable one — it protects the decision from a later reader who "helpfully" adds a scrub. Plus
`mcpEntries.test.ts`: a payment record reaches an agent with no payment field at all.

**DoD** — the story contract, plus: six named tests, one per direction; the asymmetry is stated in
`paymentRedaction.ts`'s header with the reason (a shared copy lives on in someone else's vault; an
export is a file a person made once, deliberately, with a warning).

### S1.4 — a crash never leaves a node without its secret

Parent plan §3d rule 1. **Not a payment story** — a change to every kind, landing before any payment
payload exists to be torn. This is findings 1 and 2 above.

**Change**

| file:line | today | after |
|---|---|---|
| `entityEditCommands.ts:99` then `:109` | `updateNode` → `applySecrets` | `applySecrets` → `updateNode` |
| `commands/treeMutationCommands.ts:250` then `:264` | `addNode` → `applySecrets` | `applySecrets` → `addNode` |
| `storageManager.ts:693` then `:706-709` | `saveNodes` → delete secrets | delete secrets → `saveNodes` |

The reason, from the parent plan's own table: an orphaned secret nobody references is invisible,
harmless and sweepable; a node claiming a record that does not exist is visible, broken, and
**syncs**.

**New: a startup orphan sweep.** No sweep exists (finding 2). One pass on window open that lists the
`SecretStorage` keys belonging to the current account, compares them against the live node ids, and
deletes what no node claims. Built as a pure `orphanSweep(keys, nodeIds)` returning the keys to drop —
so it is tested without a keychain — plus a thin caller wired beside `EphemeralSweeper`
(`extension.ts:326-327`). It must be conservative in exactly one way: a key whose entity id it cannot
parse is **kept**, never guessed at.

**Tests** — `paymentWrite.test.ts`: the write is interrupted at each boundary (the fake `secrets`
store throws on the nth call) and no node is ever left without its secret; a keychain refusal leaves
the form open with the words on screen and the error shown. `orphanSweep.test.ts`: an orphan is
dropped, a live secret is not, an unparseable key is kept. Because this changes all kinds, the
existing `entityEditCommands.test.ts` and tree-mutation tests must stay green **unmodified** — if one
needs editing to pass, that is a behaviour change to report, not a test to adjust.

**DoD** — the story contract, plus: both mutation paths and the deletion path write in the new order;
the sweep runs on startup and is pure at its core; the report says explicitly that a non-payment kind
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

**Tests** — `decoyPhrase.test.ts`: an entered phrase with a converging checksum → the decoy converges;
entered with words deliberately moved → the decoy **also** fails; the decoy comes from the *chosen*
wordlist (a word from another list is spotted instantly); the decoy is never equal to the real phrase.

### S4.4 — the phrase form: two columns, two layouts, and a second real key

Parent plan §4.4.

Two columns, a wordlist per **column** (two real phrases may be different lists or languages), a
layout switch, the method list in random order every open, and one unambiguous confirmation before
saving: a forgotten code is a lost phrase — not us, not a backup, not sync, because the original is in
none of them.

| layout | column 1 | column 2 |
|---|---|---|
| Vertical | the whole real phrase | the whole decoy |
| Horizontal | first half of the real + first half of the decoy | the second halves of both |

**The second column may be a second real key** (§4.4). Then the decoy generator is not called; each
phrase hides the other. Three consequences, all three into the help: a leak of the mixed view reveals
**two** keys rather than one; the lengths must match (a requirement of weaving, not ours — the form
says so through `shuffleRefusal`); and the wordlist is chosen per column.

Twenty-four methods instead of twelve. Not a defence — enumerating 24 is no dearer than 12. The value
is that a person can pick a layout they will not forget.

The checksum hint appears **once, at save, and only if the entered phrase's checksum converges**
(§4.4, §7 item 2): the mixed view leaking on its own comes down to roughly two candidates, and words
the person moved themselves remove that. Never required — requiring it raises the "forgot it and lost
it forever" risk, which is the larger loss.

**Tests** — unequal lengths refuse through `shuffleRefusal` with words, not a silent failure; the
method list order differs across renders; the save confirmation cannot be skipped; the second-real-key
mode calls no generator; the hint appears only for a converging entered phrase.

### S4.5 — the viewer card: reassembly that hints at nothing

Parent plan §4.5, and the parent plan's own trap — the viewer must not *hint*, because a "valid
BIP-39" tick turns twelve methods into one second of enumeration for exactly the person the scheme
defends against.

Each mixed field gets **its own** method and layout picker (§3a), not one list per record. The chosen
method rebuilds the field as two coloured rows.

The mechanism is already in the product and should be copied rather than invented: TOTP recomputes a
live value per request and the seed never reaches the page (`entityViewPanel.ts:129-137`,
`viewerOptions.ts:70-73`). So `unshuffleTokens` runs **host-side** per request and posts back two
**arrays** — never a joined string, on either side (§5.1). `viewerOptions.ts:40-47`'s `SecretReader`
gains a payment accessor so the live and revision viewers share one resolution ladder automatically.

**No checksum check, no "looks real" mark, nothing** — and the test states it as a property: for a
correct and an incorrect method the answer is **identical in form**, two rows, no tick, no validation.

**Tests** — the viewer test above; each mixed field renders its own picker; the picker order is random
per open; the reassembly comes from the host and the page never receives a stored value.

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
| 5.4 | the assembled value lives first as a byte buffer we allocated and zero on close; rendering reads from it | otherwise there are several string-like copies — the parse result, the intermediates, the DOM. With it, exactly one, in the DOM, and that one is unavoidable |
| 5.5 | on close the card returns to the mixed view **first**, then is destroyed | so the freshest thing in the renderer's memory is not the open value. Costs nothing, and it is the only part of "flood the memory with junk" that works — the junk is real and already there |
| 5.6 | a help paragraph on swap and hibernation | a memory dump is taken from there more often than from a live process |

**Decoys are NOT built**, and the reason is recorded so nobody revisits it in six months (parent plan
§5.4): they fail to compose with 5.1 in either branch. If 5.1 works the attacker never finds the
sequence and decoys add noise to a search that already failed; if 5.1 failed they parsed our DOM and
found exactly one assembled structure, which loop-built decoys that never entered the DOM resemble in
no way. Useful where unneeded, useless where needed — and the blockchain and Luhn sieve them out in a
minute. Forcing garbage collection is also out of scope: `global.gc` needs `--expose-gc` and VS Code
does not start that way.

**Tests** — after assembling and closing, no word of the phrase exists in `globalState`, in webview
state, or in the log; `postMessage` payloads are arrays; and the form still retains its context (a
regression test for the trap in 5.3).

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
[README.md](README.md) trimmed, and any phase that did not get built extracted into a fresh `todo/`
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
