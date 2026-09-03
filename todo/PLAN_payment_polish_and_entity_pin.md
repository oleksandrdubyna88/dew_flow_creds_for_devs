# PLAN — the owner's batch of 2026-09-03: payment surfaces, weaving, and a per-entity PIN

> Status: **plan only, nothing implemented yet.** Scope: `src_vs_code/src` — the payment form and
> viewer, the weaving controls, the phrase and password generators, and one new secret envelope
> shared by woven passwords and PIN-protected entries. No server change; the HTTP contract is
> untouched except where §6.2 adds a share flag.
>
> Related docs: [module_extension.md](../research/module_extension.md),
> [architecture.md](../research/architecture.md),
> [PLAN_payment_instruments.md](../research/PLAN_payment_instruments.md),
> [PLAN_payment_ui_tail.md](../research/PLAN_payment_ui_tail.md),
> [PLAN_generator.md](../research/PLAN_generator.md),
> [PLAN_sharing.md](../research/PLAN_sharing.md).

## Where this came from

Nine items reported by the owner in one sitting while using the payment kind. They are kept in one
document because five of them touch the same four files, and because the last two turn out to need
the **same** new mechanism — building it twice is the defect this plan exists to avoid.

Two of the nine are not polish. **§1.1 loses data** (the one thing a person must remember does not
name the algorithm on the surface where they need it back) and **§1.2 makes two of the three payment
forms unreachable**. They go first, alone, and ship without waiting for the rest.

| § | item | kind |
|---|---|---|
| 1.1 | `Method N` names a different algorithm in the form and in the viewer | **defect, recovery-grade** |
| 1.2 | the Form dropdown never switches the visible fieldset | **defect** |
| 2.1 | a revealed CVV/PIN has `Show` and no `Hide` | defect |
| 2.2 | card number: group by four; two copy buttons (with and without spaces) | defect + feature |
| 2.3 | payment-system mark: a glyph, and a control that lets the person set it | defect + feature |
| 3 | billing address decomposes into editable cells, like a pasted command | feature |
| 4.1 | the weaving picker needs a worked three-column example | feature |
| 4.2 | per-field weaving method: exists, is hidden, prints raw record keys | defect |
| 5 | phrase generation with parameters, and the same for the password | feature |
| 6.1 | weaving for passwords | feature |
| 6.2 | extra PIN protection per entity and per folder | feature |

## Decisions already taken by the owner (2026-09-03)

Recorded here because three of them close off cheaper implementations that a reviewer would
otherwise, correctly, propose:

1. **The per-entity PIN is a real cryptographic wrap, not a UI gate.** Accepted with its price: the
   `pinPolicy.ts` floor applies (8 characters, 12 if all digits), and a PIN-wrapped entry is
   unreadable to the agent, to env exposure and to terminal injection without the PIN.
2. **The brand mark stays a neutral glyph**, not the networks' trademarked logos — the reasoning
   already written at `cardBrandIcons.ts:10-16` stands.
3. **The address format table covers US, UK, DE, UA, PL**, everything else gets one generic order.
4. **A woven password disables its automatic paths** (env variable, terminal injection, agent
   access) rather than prompting for a method and a column at use time.

---

## Phase 1 — the two defects that lose things

### 1.1 `Method N` must name the same algorithm everywhere

**Symptom.** The person weaves a field under "Method 5" in the form, opens the card, picks
"Method 5", and gets a different algorithm — a different one on every open.

**Cause, verified.** `shuffle.ts:27` states the intent — *"The methods, in their permanent order.
The UI shows them SHUFFLED; the code never moves."* Neither half is true today:

- `paymentFormMarkup.ts:153-155` — `methodOptions()` maps `SHUFFLE_CODES` in **fixed** order and
  labels by position, so the form is not shuffled at all and "Method 1" is always `f1`.
- `paymentViewMessages.ts:76` — `methods: methodOrder(random)` shuffles per card open, and
  `paymentViewCard.ts:86-88` labels by position **within the shuffled array**, so the viewer's
  "Method 3" is a random code every time.

**Fix.** Bind the label to the CODE and shuffle only the ORDER.

- New in `shuffle.ts`: `METHOD_LABELS: Readonly<Record<ShuffleCode, string>>` (`f1` → `Method 1` …
  `f12` → `Method 12`) plus `methodLabel(code)`. It belongs beside `SHUFFLE_CODES`, whose comment
  already promises this property.
- `paymentFormMarkup.ts` — options come from `methodOrder(random)`, labelled by `methodLabel`. The
  markup builder must therefore take a `Random`, exactly as `paymentCardFor` already does
  (`paymentViewMessages.ts:65-70`); the panel passes `Math.random`, tests pass a pinned one.
- `paymentViewCard.ts:86-88` — label by `methodLabel(code)` instead of `index + 1`.

**What must NOT change.** The order is still shuffled on both surfaces, for the reason
`paymentViewCard.ts:77-79` gives: a method remembered by POSITION is one a later release can move.
Binding the label to the code is what makes that argument true rather than merely stated.

**Migration question this raises, and the honest answer.** A value already woven under what the form
called "Method 5" *was* woven under `f5`, because the form has always been in fixed order. So the
form's naming is the one that is already correct and nothing stored needs re-reading — only the
viewer was lying. Any card woven before this fix stays readable under the same label afterwards.

### 1.2 The Form dropdown must switch the fieldset

**Symptom.** Choosing *Bank details* or *Hidden phrase* leaves the *Card* fieldset on screen. Only
reopening the panel shows another form, so two of the three payment forms are unreachable in a
session.

**Cause, verified.** The conditions are correct — `formSections.ts:210`, `:225`, `:237` gate the
three fieldsets on `val('paymentForm')`, emitted by `formVisibilityScript.ts:24-28`. But
`entityFormScript.ts:332-334` binds `updateVisibility` to `entityType` and `sshKeyEntityId` only.
**Nothing listens to `#paymentForm`**, so `val('paymentForm')` is read once at load.

**Fix.** Bind `updateVisibility` to `#paymentForm` as well. The select does not exist for every
kind, so the binding is guarded the way the page already guards optional elements
(`entityFormScript.ts:730`, `if (reveal)`).

**And the dead element beside it.** `#paymentNotice` (`paymentFormMarkup.ts:34`) is an empty `<p>`
no code ever writes to. `switchWarning` (`paymentFormSwitch.ts:40`) is wired only into the save gate
(`paymentSaveGate.ts:49`), i.e. the person is told what they are about to lose at save time, not
when they switch. Fill `#paymentNotice` from the same pure function at switch time. This is not
scope creep: the switch handler is the change, and leaving a warning element unwired beside a
freshly working switch is leaving the defect that hid this one.

---

## Phase 2 — the read-side polish

### 2.1 `Hide` beside `Show`

**Cause.** There is no hide path at all: `paymentViewCard.ts:60-72` renders a static `Show`, and
`payFill` (`:157-163`) writes the value and drops the `gated` class with nothing to reverse it.

**Fix.**

- `MASK` becomes a module constant used by both the markup and the script, so the two cannot
  disagree about what "masked" looks like (today `••••••••` is a literal in the markup only).
- The button carries `data-label` (a constant from `PAYMENT_FIELD_LABELS`, never record data) so the
  script can rewrite `title` / `aria-label` without interpolating anything new into the page.
- **The flip happens when the value ARRIVES, in `payFill`, not on click.** A click only asks; the
  host may refuse (`paymentViewHost.ts:147-155` posts nothing when the modal is declined), and a
  button that said `Hide` over a masked box would be lying about the state.
- `hide` is handled page-locally in the capture listener (`paymentViewCard.ts:224-235`, extend the
  action allow-list): re-set the box to `MASK`, restore `gated`, flip back to `Show`, and
  `stopPropagation` so the host never sees it. No round trip, because there is nothing host-side to
  release for a plain gated field — `held` (`paymentViewHost.ts:64`) holds woven readings only.
- `aria-pressed` follows the state.

The precedent is `entityFormScript.ts:730-738`, the form's own `revealPassword` toggle — same shape,
same wording.

**Deliberately unchanged:** the grant stays remembered per field per card
(`paymentViewHost.ts:273-279`), so Hide→Show does not ask again. Hiding is tidying the screen, not
revoking consent.

### 2.2 Card number grouped, and two copy buttons

**Constraint that decides the design.** The record must keep **digits only**: a woven number is
permuted per character (`shuffleTokens([...original], …)` at `paymentWeaving.ts:83`), so a stored
space would be woven in and the value could not be rebuilt. Grouping is therefore presentation only.

- New pure module `cardNumberFormat.ts`: `groupDigits(value)` → `5293 6605 9491 0479`, and
  `digitsOnly(value)`. Four-digit groups for every brand except Amex (4-6-5), decided by `brandOf` —
  the one place that already knows the brand.
- **Form:** an `input` listener formats in place, preserving the caret (the classic trap: count the
  digits before the caret, reformat, then place the caret after the same digit count).
  `cardFieldsFrom` (`cardFormFields.ts:53-57`) strips to digits on save. `luhn` and `brandOf` already
  strip (`cardBrand.ts:97`), so the brand hint is unaffected.
- **Viewer:** the number arrives grouped for display, via `plainValues` (`paymentViewMessages.ts`).
- **Two copy buttons** on the number row: `pay_number` copies digits, `pay_number|spaced` copies the
  grouped form. `copyValueFor`'s payment branch (`entityViewCopy.ts:36-42`) splits the variant off
  the key; `allowCopy` (`paymentViewHost.ts:265-271`) must take `key.split('|')[0]` so a variant can
  never become a way past the reveal gate. Titles say which is which — two identical clipboard icons
  side by side is a coin toss.

### 2.3 The payment-system mark, and a control that can set it

**Two defects, one of them structural.**

`paymentFields.ts:23` states that `brand` is **stored rather than derived**, *"a field the person
confirms"*, because a woven number has no first digits to read from. But the only writer is
`withBrand(cardFieldsFrom(data), brandOf(textOf(data.cardNumber)))` at `paymentSaveGate.ts:107` —
always derived. **No control exists anywhere for the person to confirm or correct it**, so an
unrecognised prefix stores no brand at all and cannot be fixed from the interface.

And the glyphs: `brandIconFile` and `BRAND_ICON_FILES` (`cardBrandIcons.ts:34-41`) have **no
consumer outside their own module**, though all 18 files exist under `media/brands/` and are
generated by `scripts/generate-brand-icons.mjs`. Only `PAYMENT_BRAND_LABELS` is used
(`cardFormFields.ts:3`).

**Fix.**

- A `<select id="cardBrand">` in the card fieldset: *Detected automatically*, plus the nine systems.
  `paymentSaveGate.ts:107` prefers the person's explicit choice and falls back to `brandOf`. This is
  what makes the sentence in `paymentFields.ts:23` true.
- The glyph is rendered as **inline SVG**, not `<img src=…>`: every panel is created with
  `localResourceRoots: []` (`entityViewPanel.ts:100`, `formPanels.ts:37`) and that hardening stays.
  The extension host reads `media/brands/<brand>.svg` and passes the markup to the page — the file is
  generated, non-secret, and carries no record data.
- Shown in two places: beside the brand row in the viewer, and beside the select in the form.
- **Not in the tree.** The single `iconPath` slot is already spent on the kind glyph plus the
  agent-access ladder (`mcpIcons.ts` header); a brand mark there would displace a security signal.

---

## Phase 3 — the billing address as cells

**Goal.** Paste one line; get editable cells; see the assembled address underneath in the local
format. Same on the viewer: every cell its own row, plus one combined string.

**The pattern to mirror**, which exists in this repository with the doctrine this feature needs —
`commandParse.ts:3-13`: *"every guess it makes is written into a field the user can see and correct,
never applied invisibly."* Address parsing is guessing by nature, so that is the right precedent and
not merely a similar-looking one.

| the command form | the address form |
|---|---|
| paste box `#command` (`entityFormPage.ts:526`) | paste box `#addressPaste` |
| `parseCommandLine` (`commandParse.ts:105`), host-side and pure | `parseAddress`, new, host-side and pure |
| posted back as `splitResult` (`entityFormPanel.ts:268`) | posted back as `addressSplit` |
| editable rows `#argRows` (`entityFormScript.ts:141`) | six cells |
| readonly `#commandPreview` (`entityFormPage.ts:542`) ← `buildCommandLine` | readonly textarea ← `formatAddress` |

**Cells.** `addressLine1`, `addressLine2`, `addressCity`, `addressRegion`, `addressPostal` — plus the
**existing** `country` field (`paymentFields.ts:112`), which already has its own box. A second country
box would be a duplicate that could disagree with itself.

**Record shape — the move that keeps this cheap.** `address` **stays**, as the DERIVED assembled
string, exactly the precedent `brand` sets. The cells become the source of truth and `address` is
rewritten from them on every save. Consequence: `paymentRedaction.ts:60`, the share, the export, the
import and the agent filter need **no change at all** — they keep seeing one `address`. Old records
carry only `address`: it is parsed into the cells on open, visibly and correctably, and the raw text
is kept untouched until the person saves.

`PAYMENT_FIELD_KEYS`, `PaymentFields` and `PAYMENT_FIELD_LABELS` all grow by five; the exactness
assertion at `paymentFields.ts:47-60` fails the build if one of the three is missed, which is what
that assertion is for.

**`formatAddress`** — a table of five countries (US `city, STATE ZIP`; DE `ZIP city`; UK postcode on
its own line; UA and PL postcode before the city) and one generic order for everything else. The
table is data, so a sixth country is a row.

**`bankAddress` keeps its plain textarea** in this plan. It is a different question — the address of
an institution, usually copied as a block out of a bank's own wire instructions — and widening the
widget to it can be a row in a later plan if the owner wants it.

---

## Phase 4 — the weaving controls

### 4.1 The worked example

Under the picker, per marked field, three columns: a green random sample **in that field's own
shape**, an orange random sample of the same shape, and the weave of the two under the chosen method,
with every token coloured by the side it came from.

**The machinery exists and says so.** `shuffleLayout(length, code)` (`shuffle.ts:137`) is documented
as *"Exported because the viewer paints each token by the side it came from"* — that is column three.
Samples come from `generateDecoy({ kind: decoyKindFor(field) }, random)` (`decoyDigits.ts:50`,
`paymentWeaving.ts:31`) and `generateDecoyPhrase` (`decoyPhrase.ts:45`), so a CVV example is three
digits and a card example is sixteen Luhn-valid ones without a new generator.

- **Both columns are generated. The person's real value never enters the example** — showing the real
  pairing beside the method that produced it would put the answer on screen next to the question.
- Computed **host-side** as a pure `weaveExample(kind, code, random)` and posted to the page, by the
  precedent of `cardTyped` → `cardBrand` (`entityFormPanel.ts:384`). The example is then a unit test
  rather than arithmetic inside a template string.
- Colours are `--vscode-charts-green` and `--vscode-charts-orange`, so it survives both themes.
- One example block per marked field, because the shapes differ and that is the whole point.

### 4.2 Per-field method: unhide it and label it properly

It already exists — `#mixExpand` → `#mixPerField` → `renderPerField` (`cardFormScript.ts:118-136`).
Two real defects there:

- `cardFormScript.ts:127` prints the **raw record key** (`number`, `cvv`, `pin`) as the label instead
  of `PAYMENT_FIELD_LABELS`.
- the same line emits `<span data-chosen="…">`, which nothing reads — dead markup.

And the reason the owner thought the feature was absent: with three fields ticked it is still behind a
button. **Expand it automatically once two or more fields are marked**, keeping the button as the way
back to one shared method.

---

## Phase 5 — generation with parameters

**Phrase.** `mnemonicFor(length, wordlistId, random)` (`wordlists.ts:265`) already produces a
checksum-valid phrase and is used only to build decoys (`decoyPhrase.ts:86`). The phrase form has no
generate button at all. So: a *Generate phrase* control with a wordlist select (already rendered from
`WORDLIST_IDS`, `phraseFormMarkup.ts:88`) and a word count, calling `mnemonicFor` host-side with Node
crypto — never `Math.random` in the page, per the doctrine at `entityFormScript.ts:718`.

**Word length is not a free knob, and the plan says so rather than faking it.**

- On a BIP-39 list the word length is fixed by the list. Filtering to N-letter words cuts the pool
  from 2048 and the result is **not a valid mnemonic** — no wallet will accept it. So the phrase form
  offers wordlist and count, and one sentence beside them says why length is not offered.
- The password's passphrase draws from `secretGenerator.ts:143` — exactly 256 **four-letter** words,
  chosen so strength is exactly 8 bits per word (`:20`, `:134`). A length filter therefore belongs
  **here**, where nothing depends on a checksum, and only if the strength readout is recomputed from
  the real remaining pool. `GeneratedSecret` already carries the strength note, so this is honest by
  construction or not at all.

---

## Phase 6 — one envelope, two features

Both remaining items need the same thing: **a secret that describes itself**, so that a value and the
fact of its protection are written in one operation.

**Why they cannot use a flag on the node.** A password is stored as a bare string under
`secretKey(accountId, entityId)` (`secretKeys.ts:39`) — no suffix, no JSON. The keychain and
`globalState` are not one transaction, so a mark kept on the `TreeNode` (`types.ts:305`) can exist
without its value or the reverse. For a woven or PIN-wrapped value that state is **unreadable data**,
which is exactly why the payment record carries `shuffledFields` inside itself (`paymentFields.ts`,
parent plan §3d rule 1). The same argument applies here, so the same answer does.

### 6.0 `secretEnvelope.ts` (new, pure)

A versioned JSON envelope stored under the secret's own key, carrying the value plus the marks that
describe it (woven, PIN-wrapped and its KDF parameters). Two rules:

- **Read:** a string that does not parse as an envelope **is** a legacy plaintext secret. That is the
  whole migration — no pass over existing vaults, no flag day.
- **Write:** one function, so no seam can write a half-envelope. Every existing reader already goes
  through the accessor in `storageManager.ts`, which is the single place to decode.

### 6.1 Weaving a password

- A *Store this password woven with a decoy* checkbox in the Secret section, carrying the same honest
  paragraph the card's weaving controls do (`paymentFormMarkup.ts:177-178`).
- The decoy must be **password-shaped**: same length, same character classes. `secretGenerator.ts`
  already holds the charset logic (`LOWER` / `UPPER` / `DIGITS` / `SYMBOLS`, `:26-30`), so this is a
  new `DecoyKind` served from the existing generator rather than a second generator.
- The viewer shows the two columns exactly as the card's woven row does — which means the woven row
  must come **out** of `paymentViewCard.ts` into a module both kinds use. Extracting it IS the work
  here; a second copy would drift from the first.
- **Ticking the box disables this entry's automatic paths** — env exposure (`ENV_ENTITY_PASSWORD`),
  terminal injection, agent access — and says so at the moment it is ticked. Decision 4 above; the
  reason is that nothing, the extension included, can know which of the two halves is the real one,
  so an automatic path could only ever hand out a guess.

### 6.2 Extra PIN protection, per entity and per folder

- A checkbox in the **General** section, and the same on a folder (`folderFormPage.ts`).
- **The wrap is real** (decision 1): the entity's secret gets a second scrypt wrap under a key
  derived from the PIN. `keyWrap.ts:155` already does this shape for the vault master key — a fresh
  random key sealed in a pin-wrap — so this is that mechanism applied one level down, not a new
  cryptosystem.
- `validatePin` (`pinPolicy.ts:76`) and `pinValidator` (`pinInput.ts`) govern the PIN, so the 8/12
  character floor and the strength advice come for free and identically to every other PIN in the
  product.
- **View and edit ask for it**, with the answer remembered no longer than the window is unlocked —
  the shape `PaymentViewHost`'s grant already has (`paymentViewHost.ts:273-295`), including its "the
  panel may have been re-rendered for another entry" check.
- **Folder inheritance.** A folder's flag means its entries are wrapped under the folder's PIN. An
  entry may override with its own: enter the existing one, then the new one twice — a re-wrap of that
  one entry's key, which leaves every sibling untouched by construction.
- **Sharing.** Every share is *already* PIN-sealed today: `sealBlob(payload, recipientKeyId + pin,
  aad)` (`shareFormat.ts:190`), the sender types the PIN twice at share time (`shareInbox.ts:56-82`,
  `promptSharePin(true)`), and the recipient must enter it to open (`shareInbox.ts:323-346`). So three
  of the owner's five share requirements are already shipped. What this phase adds is the **mark**: a
  PIN-protected entry carries a flag in the share payload, so the recipient's vault re-applies the
  protection locally after the share is opened instead of silently downgrading it to an unprotected
  entry.
- **Not negotiable:** that flag is a payload field, sealed with the rest. The server must not learn
  which entries are PIN-protected — repository rule 1.

---

## Build order

Each step builds and tests green on its own, and each is a commit.

1. **§1.1** method labels — a pure `shuffle.ts` addition and two call sites. *Ships alone.*
2. **§1.2** the form switch, plus `#paymentNotice`. *Ships alone.*
3. **§2.1** Hide, **§2.2** grouping and the two copy buttons, **§2.3** the brand select and glyph.
4. **§4.2** per-field labels and auto-expand — small, and it clears the ground for §4.1.
5. **§4.1** the worked example.
6. **§3** the address cells.
7. **§5** generation parameters.
8. **§6.0** the envelope, then **§6.1** the woven password, then **§6.2** the PIN.

§6 is last because it is the only step that changes how a secret is stored, and because §6.1 proves
the envelope on a feature with a smaller blast radius than §6.2.

## Test plan

`npm test` in `src_vs_code` — `node:test` over `out/test/*.test.js`. Every module below is
`vscode`-free, which is repository rule 3 and the reason these are tests rather than hopeful comments.

**Red first, watched failing, for every defect** (§1.1, §1.2, §2.1, §2.2, §2.3's missing control,
§4.2), per the shared testing rule — named after the guarantee, never after a bug number.

| what | test |
|---|---|
| §1.1 | `MethodFive_NamesTheSameAlgorithmInTheFormAndInTheCard` — the form's and the card's option lists, built with two different pinned randoms, agree on the code behind every label, and the two orders are not equal |
| §1.1 | every label appears exactly once on each surface, and all twelve codes are present |
| §1.2 | the emitted page script wires `#paymentForm` to `updateVisibility` |
| §1.2 | `switchWarning` reaches `#paymentNotice` for a stored card switched to `bank` |
| §2.1 | the gated row renders a button whose action becomes `hide` and whose text becomes `Hide` in `payFill`, and the mask constant is the one the markup used |
| §2.1 | the button is NOT flipped by a click, only by an arriving value |
| §2.2 | `groupDigits` on 16-digit, Amex 15-digit, short and non-digit input; `digitsOnly` round trip; the caret arithmetic as a pure function |
| §2.2 | `cardFieldsFrom` strips spaces, and a woven number is built from digits only |
| §2.2 | `copyValueFor('pay_number')` vs `copyValueFor('pay_number|spaced')`; `allowCopy('pay_cvv|spaced')` still gates |
| §2.3 | an explicit brand survives a save; an unrecognised number keeps the person's choice; `brandOf` still fills the default |
| §2.3 | the viewer and form markup carry the glyph inline, and no value from the record |
| §3 | `parseAddress` on a US one-liner, a UK one, a DE one, a two-line paste, garbage and empty — every guess lands in a cell, nothing is dropped |
| §3 | `formatAddress` per country in the table plus the generic fallback; parse→format→parse is stable |
| §3 | a legacy record with only `address` opens with populated cells; a save rewrites `address` from the cells |
| §4.1 | `weaveExample`'s third column is exactly `shuffleLayout`; both samples have the field's shape; no real value is reachable from it |
| §4.2 | the per-field row is labelled `Card number`, not `number`; the panel auto-expands at two marks |
| §5 | a generated phrase is checksum-valid for every wordlist and count; the password pool filter reports the real bit count |
| §6.0 | a legacy plaintext secret reads as unprotected; an envelope round-trips; a truncated envelope refuses rather than reading half |
| §6.1 | a woven password's decoy matches its length and character classes; the env, terminal and agent paths refuse a woven entry |
| §6.2 | wrap and unwrap under a PIN; a wrong PIN refuses; folder inheritance; an entity override leaves its siblings readable under the folder PIN; the share flag survives seal→open |

`npm run typecheck` and `npm run lint` run at every step; warnings are errors here.

## Definition of Done

- [ ] `npm run typecheck` and `npm test` green in `src_vs_code`; the server build untouched and green.
- [ ] Every defect has a test that was **watched failing first**, and the summary reports the failure
      message and the pass.
- [ ] No stored value is interpolated into any page HTML string — the rule at
      `paymentViewMessages.ts:17-21` and `paymentFormMarkup.ts:11-16`, re-checked for every new row.
- [ ] `localResourceRoots: []` is still `[]` on every panel.
- [ ] The record keeps digits-only card numbers, and `address` is derived from the cells.
- [ ] `research/module_extension.md` updated, and `research/architecture.md` too if §6 changes a
      cross-module seam; diagrams re-rendered.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` passes, and this plan is promoted to
      `research/` with its deviations recorded — or split, with its unbuilt phases extracted into a
      fresh `todo/` plan.
- [ ] The `coai` gate: a `review_plan` round reached `proceed`, `review_code` ran on the finished
      branch, every finding was resolved with `accept` or a reasoned `reject`, and the summary reports
      the verdicts **and** how many reviewers actually answered.

---

## Accepted from the plan review round (2026-09-03)

Verdict `good_enough`, 8 findings, **2 of 3 reviewers** answered (the local engine missed the
round's deadline). Seven accepted, one rejected with reason. They change §3 and §6 materially, so
they are written into the plan rather than left in a review log.

### §6.0 — the envelope holds CIPHERTEXT, not a value beside a flag

The envelope as first written could be implemented literally: `value` stored in the clear next to
`pinWrapped: true`. That reads as protection and is none. The layout is therefore specified:

- the secret is encrypted with a **random data key** (AES-GCM, as `keyWrap.ts` already seals);
- that data key is wrapped by the **PIN-derived** key (scrypt, `pinPolicy`'s parameters);
- the envelope persists only the ciphertext, the nonce, the wrapped key and the KDF parameters.
- **Test:** the persisted envelope contains the plaintext secret nowhere — asserted by searching the
  serialised bytes for it, the same blunt shape as `paymentViewCard.test.ts`'s "no value reaches the
  page".

### §6.2 — a share cannot re-apply protection from a boolean

Two reviewers found the same hole from different sides: the recipient receives a sealed payload and
a mark, but no key material and no PIN, so "re-apply the protection locally" cannot mean anything —
and re-using the share's own transit PIN would wrap the entry under a one-time transfer secret the
recipient never chose.

So the flag is an **instruction to ask**, never a key: on opening a share marked PIN-protected, the
recipient chooses their own PIN (or inherits the destination folder's, when it has one), and the
entry is wrapped under that. The alternative — importing it unprotected — is refused, because a
person who protected an entry did not agree to share it unprotected.

### §6.2 — re-wrapping a folder is a migration, and migrations get interrupted

Turning a folder's PIN on, or changing it, re-wraps every child. Killed halfway, the folder's flag
and its children disagree and some entries are unreadable.

So: a **resumable** re-wrap with a committed marker. The old wrap is kept until every child has
succeeded; the marker names the folder, the target state and which children are done; startup
resumes or rolls back. This mirrors the startup sweeps this repository already runs for orphaned
`InProgress` work.

### §6.2 — moving an entry across a PIN boundary

A tree move is metadata-only today. Moving an unprotected entry INTO a protected folder would leave
its secret unwrapped while the interface claims it is protected; moving one OUT would leave it
wrapped under a PIN nothing records any more.

So a move that crosses a PIN boundary **asks and re-wraps**, and is refused if the PIN is not given.
A silent metadata-only move across that boundary must not be reachable.

### §6.0 — `storageManager` must not prompt

It is called by background sync, the tree renderer and headless tooling, none of which can show a
modal. If it were the place that decodes a PIN-wrapped secret, those callers would hang, throw, or
receive envelope JSON where they expected a password.

So the accessor returns a **typed locked result** — "this is protected and no grant is held" — and
every interactive host decides whether to ask. A background caller gets a value it can recognise and
skip.

### §3 — the address cells travel

The plan claimed export, share and import need no change because `address` stays derived. That was
wrong in one direction: the cells are new keys on `PaymentFields`, so they ride along with the
record automatically — and `paymentRedaction.ts:60` redacts `address` by NAME. Five unredacted
address keys would have shipped a billing address in a share that redacts the assembled string.

So the cells are added to the redaction list beside `address`, and the export, share and import
schemas carry them — which also removes the re-parse this finding predicted on re-import.

### Rejected, with reason

**"§6.1 does not persist enough to render the woven password after reload."** The premise misreads
the mechanism. A woven value is not a value plus a separately-kept decoy: the decoy is generated
once at save and interleaved into ONE stored string (`paymentWeaving.ts:82-83`), so it is persisted
by construction, and `unshuffleTokens` (`shuffle.ts:208-218`) rebuilds both columns from that string
alone. The method is deliberately stored nowhere — `shuffle.ts:4-10`, *"that choice is stored
NOWHERE"* — so persisting it, as the finding asks, would destroy the property the feature exists
for. No decoy is regenerated at render, so the divergence described cannot happen. Taken as a
documentation gap only, which this paragraph closes.
