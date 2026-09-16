# PLAN — a second value of your own, everywhere a value can be woven

> Status: **PR A implemented 2026-09-16; PR B not started.** What is built: the pair rule, the
> two weaving choke points, and the storage slot with every seam a secret kind touches — all of it
> invisible to the user. What is NOT built: the form controls, the save gates, the viewer rows, the
> share/export policy and the help translations, which are PR B on a branch of its own. The plan
> stays here until PR B lands. Scope: `src_vs_code/src` — a new
> secret slot, the two weaving choke points, the six forms that offer weaving, the viewer, and the
> save gates. Extension only; no HTTP contract, no server change.
>
> Closes [#52](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/52).
>
> Related docs: [module_extension.md](../research/module_extension.md),
> [PLAN_payment_instruments.md](../research/PLAN_payment_instruments.md),
> [PLAN_woven_passwords_and_entity_pin.md](../research/PLAN_woven_passwords_and_entity_pin.md).
> Also `PLAN_viewer_unweave_picture.md` (issue #58) — not linked because it is still on its own
> branch; it lands in `research/` when that pull request merges.

## The goal

A woven field today is the person's value shuffled with a decoy the build **generates**. The issue
asks for the other option: let the person type their own second value — two passwords, two seed
phrases, *"seed 1, seed 2, password 1, password 2"* — and store the second one encrypted **even
when weaving is not chosen**, as an ordinary secret field. Everywhere weaving exists today.

## What already exists, and is the shape to widen

**The seed phrase already does this**, and it is the only place that does. `phraseFormMarkup.ts:72-87`
offers `#phraseSecondMode` — *"A decoy, generated for you"* against *"My own words — a second real
key, or a phrase I choose"* — and `phraseSaveGate.ts:97-99` honours it: with `ownWords` the decoy
generator is **never called**, which `phraseForm.test.ts:93-106` proves with a random source that
throws. The record remembers it in `PaymentFields.ownWords` (`paymentFields.ts:141`).

So this is a widening, not a new mechanism. Reuse-first, step 1.

## The seven weave points, and what this plan adds to each

| Where | Field | Has an own-second option today |
|---|---|---|
| card form | `number`, `cvv`, `pin` | no |
| bank form | `iban`, `accountNumber` | no |
| phrase form | `mixed` | **yes** — `ownWords` |
| the Secret section | `password` (credential, ssh, sshkey, vpn) | no |

The phrase keeps what it has. The other **six** gain it.

## The owner's decisions (2026-09-15), which this plan does not reopen

1. **Storage: ONE new JSON record slot** holding an entity's second values as keys — `password2`,
   `cvv2`, `pin2`, `number2`, `iban2`, `accountNumber2`. Not a slot per field, and not "store
   nothing when weaving is off". A second value after this one is a KEY in that record rather than
   another pass through every seam.
2. **All six weave points**, not a subset.
3. **A share carries a woven field exactly as it does today.** No new withholding for the woven
   case, even when the partner half is the person's own real value.
4. **A mismatched pair is REFUSED**, not confirmed: if the two values do not use the same character
   classes, the save does not happen.

## The one thing the owner has not decided, and the assumption this plan proceeds under

**Does a SHARE carry the plain second value** — the one in the new slot, for a field that is *not*
woven? Decision 3 is about the woven case and does not answer it. This plan assumes **it does not**,
because that is what this repository's allowlist doctrine already does with every new field
(`paymentRedaction.ts:30-42`: a new field is withheld until decided, because the mistake is
irreversible in only one direction) and because a share names one credential for a colleague, while
a second value is something the person added for themselves. **The sender is told by name** which
second values were withheld, the way `withheldFromShare` already tells them.

If that is wrong it is one line in the allowlist and its test — but it must be decided deliberately
rather than discovered.

## What the plan must not break

- **Weaving needs two halves of the SAME LENGTH.** `shuffleTokens` throws on unequal
  (`shuffle.ts:217-222`), and length is counted in **code points** — `weaveRefusal` already counts
  `[...value].length` because a single emoji is two UTF-16 units and got past a `.length` check,
  throwing much deeper with a message about decoys (`wovenSecret.ts:27-40`).
- **A generated decoy carries guarantees a typed one cannot.** Luhn and the same BIN for a card
  (`decoyDigits.ts:125-157`), mod-97 and the same country for an IBAN (`:159-206`), the same
  character CLASSES for a password (`:92-113`), and for a phrase the same checksum STATE rather than
  validity (`decoyPhrase.ts:70-96`). A typed second value has none of them by construction — which
  is what decision 4 is about.
- **The method is stored NOWHERE**, and nothing here changes that. What is saved is the mark alone.
- **Marks must not outlive values** — `pruneMarks` (`paymentFields.ts:274-285`), and
  `passwordWoven` cleared when the password is cleared (`entityFormPanel.ts:749`).
- **Three compile-time guards** in `paymentFields.ts` break loudly if a key is added carelessly:
  `EVERY_FIELD_IS_LISTED` (`:70`), `EVERY_SHUFFLEABLE_HOLDS_A_STRING` (`:105`), and
  `FORM_KEYS`/`keysForForm` (`:190-207`), which requires every key to belong to at most one form.
- **A woven payment record cannot be reopened in the edit form** (`mixedFieldGuard.ts`,
  `entityEditCommands.ts:52-56`). That does not change — and a reviewer named the consequence more
  sharply than the first draft of this plan did: a card whose NUMBER is woven cannot have its plain
  second PIN corrected, because the whole record is frozen. That is the rule `holder` and `expiry`
  already live under, so it is not new, but a second value is a thing a person is newly invited to
  type, which makes the freeze easier to walk into. **The plan keeps the guard** — relaxing it is
  how a woven value gets re-woven and destroyed — and S4 states the cost where the choice is made,
  beside the box: a second value on a record with any woven field can only be changed by creating
  the entry again. If that proves too sharp in use, the fix is a plan of its own about editing woven
  records, not a hole in this guard.

## The rule that decides where a second value is stored

**A woven field's own second value lives ONLY inside the woven string.** When the box is ticked and
a second is typed, that value replaces the decoy and is **not** also written to the new slot.
Writing it there as well would hand any reader the half to subtract, and the twelve methods would
become none. A test is named for this and it is the sharpest invariant in the change.

**A second value on an UNWOVEN field is an ordinary secret**: encrypted at rest, PIN-wrapped, synced,
backed up, exported, kept in history, shown masked in the viewer, never shared and never handed to
anything automatic.

## The sync rule this plan is built around — a kind that DELETES

All three review vendors went for the same throat, and they were right to: **this repository has
already lost data exactly here, once.** The comment on `ProfileSnapshot.payments`
(`syncMerge.ts:56-67`) records it — *"the `SECRET_KINDS` row already put payments into the snapshot
`getSnapshot` builds, so a snapshot returning from a merge WITHOUT them read as an absence, and
`dropAbsentKinds` deleted the `:payment` key of every entity. Save a card, let any ordinary change
arrive from another machine, lose the card — CVV and PIN included, which exist nowhere else."* And
the sentence that generalises it: *"A kind added to that table and not to this interface does not
fail to sync; it DELETES."*

So the rule, read out of the code rather than assumed:

- `dropAbsentKinds` (`secretMaps.ts:117-128`) walks `SECRET_KINDS` and deletes the keychain key of
  every kind whose incoming map has no entry for that entity.
- The guard that makes a new kind safe is the `?? {}` FALLBACK in the merge:
  `copySecret(out, id, primary.X ?? {}, fallback.X ?? {})` takes `primary[id] ?? fallback[id]`
  (`syncMerge.ts:262-270, 339-349`), so a snapshot from a build that predates the kind contributes
  nothing and **the other side's value survives**.

What that means for this plan, and it is not negotiable:

1. **The `SECRET_KINDS` row and the `ProfileSnapshot` field land in the SAME pull request** — PR A —
   never a table row waiting for a later story to add the snapshot field. That gap is what happened
   with payments.
2. `seconds?:` is OPTIONAL and every merge site carries the `?? {}` guard, for the same reason the
   three kinds above it carry one.
3. **An older released build does not delete these keys**, because its own `dropAbsentKinds` walks
   its own `SECRET_KINDS`, which has no `seconds` row. That is the direction a reviewer feared and
   it is safe by construction — but it is asserted rather than argued, in the test below.
4. `secondSurvival` therefore tests **both directions**: a snapshot lacking `seconds` merged into
   one that has them keeps them, and a snapshot carrying them merged into one that does not carries
   them through.

**A known bound, pre-existing and not introduced here:** because absence falls back to the other
side, an intentional CLEAR of one second value on one device does not propagate as a deletion while
another device still holds it — the same for `notes`, `configs` and `payments` today. Deletion
travels with the entity, not with a map's absence. Recorded rather than solved, because solving it
means tombstones per secret kind for every kind, which is its own plan.

## The cost, measured rather than estimated

A tenth secret KIND is not free. Counting the seams one existing kind touches — `notes` —
gives **15 production files** (`secretMaps`, `syncMerge`, `syncManager`, `backupBundleType`,
`idQuarantine`, `revisionHistory`, `revisionSnapshot`, `exportSecrets`, `externalBundle`,
`externalSecretsApply`, `entitySlots`, `storageManager`, `maskEntries`, `secretKeys`, plus the
viewer). `entityFields.ts:7-9` records why that matters: one JSON record exists precisely so a
third field is "a key in this object, not another pass through every seam a secret kind touches".

The slot is unavoidable for `password2` — a credential has no JSON record of its own — so the
decision stands and this is simply the honest price. It is also why this ships as **two pull
requests**.

## Build order — two pull requests

### PR A — the rule, the choke points, and the slot (invisible to the user)

- **S1 — the pair rule, PER FIELD.** New `secondPair.ts`: `pairRefusal(first, second, label, kind)`
  — same token count in CODE POINTS, and not identical, for every field. The class comparison that
  decision 4 refuses on is the PASSWORD's rule and is applied as such: it reuses `classesOf`
  (`decoyDigits.ts:106-112`, exported for this), which is the same function the generated decoy is
  built to satisfy. A card number and a PIN are digits on both sides, so the comparison is trivially
  satisfied there and refuses nothing; an IBAN's country letters are part of its own alphabet. What
  this rule must NOT become is a checksum demand — a typed second card number that fails Luhn is
  the person's business and is confirmed elsewhere (`paymentValidation`'s `confirm` severity),
  because people hold instruments this build has never heard of. Pure, no `vscode`.
  *Tests:* an emoji pair equal in `.length` but not in code points is refused; an identical pair is
  refused; a password pair whose class sets differ is refused; **a digits pair of equal length is
  NOT refused** — the companion that stops the rule quietly rejecting every card; every refusal is
  a sentence a person can act on.
- **S1b — what an EMPTY second means, said once.** Blank with the own-second mode chosen and weaving
  ON is a refusal: there is nothing to weave with, and generating a decoy behind the person's back
  would store something they did not choose. Blank with weaving OFF stores nothing. Clearing an
  existing second value DELETES it, and where it was woven the attempt is refused with the same
  sentence as any other attempt to re-weave a woven field.
  *(The plan round briefly recorded this rule as unreachable, on the reading that one text box was
  the only control. It is reachable, because the mode select in S4 is the state it needs — and that
  select is the phrase form's, widened rather than invented.)*
  *Tests:* one per row of S4's table. `pairRefusal` returning no refusal for a blank second is PR A's
  (`secondPair.test.ts`); what blank MEANS is decided here.
- **S2 — the two choke points take a supplied second.** `weaveSecret(value, code, random, second?)`
  (`wovenSecret.ts:49`) and `weaveOne` (`paymentWeaving.ts:72-84`) use a typed value INSTEAD of
  calling `generateDecoy`; the record gains `ownSecond` beside `shuffledFields`, and the entry gains
  `passwordSecondOwn` beside `passwordWoven`.
  *Tests:* with a second supplied, the random source is **never consulted** — asserted with a random
  that throws, the way `phraseForm.test.ts:93-106` already does; the pair round-trips to both typed
  values under the method; a bad pair throws the refusal's own sentence; `ownSecond` names exactly
  the own-woven keys and never a key absent from `shuffledFields`.
- **S3 — the slot, end to end.** New `secondValues.ts` (parse/pick/serialize, the `entityFields.ts`
  shape), `secondSecretKey`, the `secretMaps` row, the `storageManager` accessors, and every seam
  above.
  *Tests:* `storageSecond` (set/get, an empty record DELETES the key, an entity delete removes it);
  `secondSurvival` — **both directions**, per §The sync rule: a snapshot lacking `seconds` merged
  into one that has them keeps them, and the reverse carries them through; `secondTravel` (export
  and revision carry it); the PIN wrap walks it (`entityPin`'s label list, with the password still
  last); the broker masker masks it.
  **The agent guarantee is exercised, not scanned.** An absent getter proves nothing when the slot
  is registered with the generic secret maps — a reviewer's point, and a fair one. The test drives
  the agent-visible operations against an entity that HOLDS a second value of every kind and asserts
  none of them comes back: the MCP entry listing, the read paths, and the export an agent can ask
  for. A source-level absence check may stand beside that, never instead of it.

### PR B — the forms, the gates, the viewer, and the policy

- **S4 — the form controls, and THE STATE TABLE.** A second box beside each of the six fields, the
  phrase's `secondColumn()` widened rather than copied. New modules, because `entityFormPanel.ts`
  (799), `entityFormScript.ts` (799) and `entityFormPage.ts` (764) are at the ceiling.

  **A MODE beside the box, because this product already built this control once.** The plan round
  found the hole — as written, S1b needed to tell "I chose to type my own and left the box blank"
  apart from "make me a decoy", and one text box cannot carry both meanings — and two of three
  reviewers proposed an explicit switch. The first answer written here was to delete the second
  meaning instead and let the box be the switch. That was wrong, and what makes it wrong is in this
  repository rather than in the argument: **the phrase form already has this exact control.**
  `phraseSecondMode` (`phraseFormMarkup.ts:72`) is a two-option select — *"A decoy, generated for
  you"* / *"My own words — a second real key, or a phrase I choose"* — with the own box revealed
  under it, and `phraseSaveGate.ts:52` reads `ownWords` from it and applies the pair refusal only to
  an own column. This story's own sentence says to WIDEN that rather than copy it; a different
  control for the same decision three fields away is the drift the reuse rule exists to stop.

  So: one shared mode control, used by all three forms, and S1b stands as it was written.

  | weaving | mode | the box | what is stored |
  |---|---|---|---|
  | ON, field not yet woven | own | filled | Woven with THEIR value. `ownSecond` / `passwordSecondOwn` marked. The typed second is **not** written to the record — that is the sharpest rule |
  | ON, field not yet woven | own | blank | **Refused.** They chose to supply a half and supplied none; drawing a decoy behind their back would store something they did not choose. S1b's rule, now reachable |
  | ON, field not yet woven | decoy *(default)* | — | Woven with a generated decoy. Today's behaviour, unchanged, and the box is not shown |
  | ON, field ALREADY woven | — | — | Nothing. `weavePaymentFields` filters a key already in `shuffledFields` and `wovenSave` keeps `wasWoven`, so neither control is read |
  | OFF | *(no mode: there is nothing to choose between)* | filled | Stored in the record, exactly as typed |
  | OFF, something stored | — | blank | **Kept.** The password box's own rule (`wovenSave` returns `woven: wasWoven` for an empty box), so an unrelated edit cannot silently delete a secret |
  | OFF, nothing stored | — | blank | Nothing |
  | any, something stored | — | *Clear* ticked | Deleted. The `clearPassword` affordance, shown only when there is something to clear |

  The other refusal is a mismatched PAIR (owner decision 4), and it is `pairRefusal`'s, built in PR A.

  **Where the mode lives on each form.** One per form, not one per field: the entity form puts it in
  `weaveControls`, beside the method; the payment form puts it in `mixControls`, which is already the
  place one method governs every ticked field, with a box per ticked field under it; the phrase form
  has it already and gives up its private copy. Per-field modes would be six switches for a choice
  nobody makes differently per field, and the payment form's existing *"Give each field its own
  method…"* expander is the precedent for adding that later if anybody asks.

  *Tests:* one per row, and each one DRIVES the control — `input`, `change`, save — and asserts the
  record the save wrote, rather than asserting that six inputs were rendered. Issue #51 is why: every
  page test here matched the generated SOURCE, the source said the right thing, and the picture was
  three grey lines. `miniDom.ts` runs the fragment.
- **S5 — the save gates.** `refuseSecondPairs` before the checksum gate, so nothing is woven when a
  pair is refused; the password's equivalent; `secondRecordFor` drops every value a weave consumed.
  **`passwordSecondOwn` is written only beside `passwordWoven`, and cleared wherever it is cleared**
  — the entity-metadata twin of the rule `pruneOwnSecond` already enforces for a payment record,
  accepted from PR A's code review. PR A declares the field and guards its type; nothing writes it
  yet, so it cannot go stale yet, and this is the story where it could: `entityFormPanel.ts:749`
  clears `passwordWoven` when the password is cleared or the entry is a database, and a mark left
  standing there would tell the share and the export that an ordinary password costs two secrets.
  *The named test:* a record carrying the mark with no woven password is repaired on READ, not only
  on save — a record written by an older build, or by one that forgot, is the case a save-side
  check cannot reach.
  *The named test:* `a woven field's second value is never stored beside it` — and it asserts the
  STORED state, not the generator. "The random was never called" proves a decoy was not drawn; it
  says nothing about whether the typed value was also written to the slot, which is the thing that
  would hand a reader the half to subtract. The test reads back what the save wrote.
  **There is no path from woven back to un-woven through the form**, and S5 says so rather than
  leaving it to be discovered: unticking the weave box on an already-woven entry does nothing on its
  own (`weaveNotice` already says that sentence to the person), so no partner secret has to be
  restored or discarded. And **an unrelated edit to a woven entry saves normally** — the second box
  is not read for a field already woven, and no blank box refuses — which is the trap a reviewer
  found in the plan as first written. A regression test per row of S4's table.
- **S6 — the viewer.** A masked row with Copy per second value; `cvv2` and `pin2` inherit the reveal
  gate of the field they belong to, because copying is showing. A WOVEN field shows no second row:
  there is nothing stored to show, and a row promising one would be a lie about where the value is.
  **Where the person's own woven second value actually comes back** is said on the row rather than
  left to be worked out — a reviewer asked and the plan had no answer written down. It comes back
  the way the first half does: pick the method, and the reading shows BOTH rows, which #58's picture
  draws side by side in colour. With an own second value both rows are the person's own real values,
  which is exactly what the issue asked for ("seed 1, seed 2"). What does not exist, and must not, is
  a product that can hand over either row by itself — it does not know which is which.
- **S7 — share and export.** The withholding above, the sender's notice by name, and the export
  warning's counts.
  *Tested at the BOUNDARY, not at the allowlist:* a share is actually built and the payload asserted
  to carry no second value of any kind, while the sender's notice names each one withheld — a
  generic serializer that picked the slot up would pass an allowlist unit test and fail this. The
  decided case is asserted beside it: a woven field whose partner is the person's own real value
  still travels, exactly as it does today.
- **S8 — docs and help.** `module_extension.md`, `architecture.md`'s slot count, and the five help
  languages in one commit — a stale translation is invisible, so all five change together.
  *And something checkable beside the discipline:* every language's help body must carry the new
  section's marker, so a language nobody touched is RED rather than quietly English-shaped. The
  fallback marks a MISSING translation and never a stale one, which is why the coverage test rewards
  that failure today; a content-version check across languages is the real fix and is help
  infrastructure rather than this feature.

## Test plan

`npm test` in `src_vs_code`, after `rm -rf out`. Every new pure module is `vscode`-free and unit
tested; randomness is injected so a draw can be scripted; every "nothing was stored / nothing was
sent" test carries a positive companion proving the scan still finds a known instance.

## Deviations, PR A (recorded as they happened)

1. **`pairRefusal` takes no `kind`.** S1 specified `pairRefusal(first, second, label, kind)` so the
   class comparison could be the password's alone. It is uniform instead, and the argument that made
   it uniform is the one that made it exist: a decoy is BUILT to match the original's class set so
   that neither half can be picked out by inspection, and that property is worth exactly as much on
   an IBAN as on a password. The prediction S1 made — that a password-shaped check would refuse every
   card — is answered by a test rather than by a parameter: two card numbers are digits on both
   sides, so the sets are equal and nothing is refused. A code round re-raised the parameter and was
   rejected on this evidence.
2. **A stranger character is ONE class, not a class per character.** Found by the code round, and it
   was a real defect: `classesUsed` named each unknown character as its own class, so two Cyrillic
   passwords matched only if spelled with the very same letters — which the identical-halves rule
   forbids anyway. The rule therefore refused every pair a Russian or Ukrainian speaker could type.
   What the coarser class gives up is a pair in two DIFFERENT non-Latin scripts; the alternative is a
   table of every script there is, always one alphabet out of date.
3. **A second value is stored exactly as typed.** Also from the code round. The record trimmed what
   it stored while the woven path does not, so one set of keystrokes made two different secrets
   depending on a box ticked elsewhere. Whitespace now decides only whether there is a value at all.
4. **`snapshotForRevision` takes a `RevisionSource`, not a `StorageManager`.** The narrow-interface
   shape `maskEntries.ts` and `mcpEntries.ts` already use, taken so the tests need no `as never` —
   which is the cast that let nine storage fakes go stale without the compiler saying so.
5. **S1b's rows are PR B's.** What a blank second means at create and at edit is a decision the SAVE
   makes, and there is no form to make it in until S4. `pairRefusal` returns no refusal for a blank
   second and says so in a test; the rest lands with the save gates.

## Definition of Done

- [ ] `npm run typecheck`, `npm test` and `npx eslint src` green, the reported run after a cleared `out/`.
- [ ] A woven field's own second value is stored ONLY inside the woven string — its named test passes.
- [ ] A supplied second means the decoy generator is never called — asserted with a throwing random.
- [ ] The new slot survives a sync merge, a backup round trip, an export and a revision.
- [ ] Nothing automatic can read a second value, and an agent cannot see one.
- [ ] The share policy is implemented as decided, and the sender is told what was withheld.
- [ ] Marks never outlive their values (`ownSecond ⊆ shuffledFields`, `passwordSecondOwn ⇒ passwordWoven`).
- [ ] `research/module_extension.md` and `architecture.md` record the slot and its seams; the five
      help languages changed together.
- [ ] `plan-lifecycle.mjs` and `pin-check.mjs` pass; this plan is promoted with its deviations.
- [ ] The `coai` gate: a plan round before implementation, a code round per pull request, every
      finding resolved with `accept` or a reasoned `reject`, and the summary reports the verdicts
      and how many reviewers answered.
