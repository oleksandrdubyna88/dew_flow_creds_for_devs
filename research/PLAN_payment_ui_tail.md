# PLAN — the payment UI tail: the viewer card, the phrase form, and documents that say what ships

> Status: **IMPLEMENTED, 2026-09-02.** All four stages shipped in `0.94.0`, one commit each. Scope was
> `src_vs_code` only — the viewer, the form, the help article, the changelog and the two payment plans.
> No server change and no HTTP contract change, so [module_server.md](module_server.md) was out of
> scope by construction.
>
> **Deviations, recorded rather than quietly absorbed:**
>
> 1. **The layout is not offered as a picker in the viewer** (parent §4.5 asked for one). It is a
>    STORED field of a phrase record, so a picker would offer twenty-four readings while the record
>    already names which twelve are meaningful — furniture suggesting a choice that has been made.
> 2. **Two defects were found in already-green code**, both by the phrase form's own tests, and both
>    would have destroyed a phrase silently. `pruneMarks` kept a mark only when the value was a
>    string, so a woven phrase's mark was pruned; and `mixed` is deliberately absent from
>    `SHUFFLEABLE_KEYS`, so a record marks a woven digit field and a woven phrase in two different
>    ways while `hasMixedField` knew only the first — a saved phrase would have been editable, and
>    re-woven on the next save. `wovenKeys()` is now the one question. One existing assertion had to
>    be CHANGED rather than added, which is called out in its own test.
> 3. **`entityViewPage.ts` had to give up its stylesheet** (`entityViewStyles.ts`, moved verbatim). It
>    was at 798 of the 800-line ceiling, and the rule here is extract rather than suppress.
> 4. **Stage D's documentation half happened in Stages B and C instead** — the plan review's first
>    finding: the original build order would have enabled the weave boxes in B while the changelog
>    still said they were off. Each behaviour commit carries its own document change.
> 5. **The reveal gate covers `reassemble`**, which the first draft did not say. The plan round found
>    it; a woven PIN reached through the method picker would have been shown with no second question.
>
> **What the review gate cost and returned is measured**, not asserted:
> [RESULTS_review_gate_payment_ui_tail.md](RESULTS_review_gate_payment_ui_tail.md) — 30 findings, 16
> acted on, 8 defects prevented, and a per-vendor split worth reading before trusting a finding count.
>
> **The open tail:** Monero's list landed separately in 0.95.0, closing parent deviation 4. Nothing here
> has been run inside a real VS Code extension host — every test is `node:test` over compiled output,
> which is what this repository's suite is; all five extension integration suites and the server's own
> 162 tests were run after the release and pass. Cross-window write coordination remains
> [PLAN_cross_window_write_coordination.md](PLAN_cross_window_write_coordination.md), built 2026-09-03.
>
> Parent record: [PLAN_payment_instruments.md](PLAN_payment_instruments.md) and its build
> order [PLAN_payment_instruments_epics.md](PLAN_payment_instruments_epics.md). This plan
> finishes S4.4 and S4.5's UI halves and S5.1/S5.2's wiring, which those two documents record as
> "landed (core)" — pure modules, no callers.
>
> Related: [ЗАДАЧА_варианты_перемешивания_сид_фразы.md](../todo/ЗАДАЧА_варианты_перемешивания_сид_фразы.md)
> (the twelve weaves), [module_extension.md](module_extension.md).

## The symptom, verified in the checkout rather than remembered

`0.94.0` is in `package.json`, untagged. Its changelog, its help article and both payment plans
describe a feature set the build does not have. Every line below was checked by reading the code, not
by trusting the previous session's report.

**1. Seven modules have no production caller at all.** Measured by importing-file scan across `src/`
excluding `src/test/`:

| module | imported in production by |
|---|---|
| `revealGate.ts` | **nothing** — only `test/revealGate.test.ts` |
| `phraseBuffer.ts` | **nothing** |
| `phraseReassembly.ts` | **nothing** |
| `phraseLayout.ts` | only `phraseReassembly.ts` — a dead chain |
| `decoyPhrase.ts` | **nothing** |
| `wordlists.ts` + the ten `wordlistBip39*.ts` (~245 KB) | only `decoyPhrase.ts` — the same dead chain |

**2. The viewer knows nothing about the kind.** `entityViewPage.ts` contains the string `payment`
**zero** times. So a saved card cannot be read anywhere except by opening the edit form, and there is
no surface on which a woven value could ever be shown.

**3. `Phrase` is offered in the form and has no fields behind it.** `PAYMENT_FORMS`
(`paymentForm.ts:19`) has three entries and `paymentFormOptions` renders all three, while
`formSections.ts:188-222` declares only `paymentSection`, `cardSection`
(`condition: val('paymentForm') === 'card'`) and `bankSection`. Choosing *Phrase* leaves the selector
alone on screen, and the save writes `paymentForm: 'phrase'` with an empty record. Nothing refuses it.

**4. The weave boxes are `disabled`** (`paymentFormMarkup.ts:159-180`), with a paragraph saying the
feature is off because nothing can read a woven value back. That was the right call and it is the
thing this plan removes.

**5. Three published documents contradict the build.**

- `CHANGELOG.md`'s `[0.94.0]` promises phrases in ten languages "checked against its own checksum as
  you type", weaving of "any of the number, CVV, PIN, IBAN or account number", and that "the CVV, the
  PIN and an assembled phrase ask a second time before they appear".
- `helpContent.ts:681-695` (`payment-instruments`, en **and** ru) promises the same two.
- Both plans carry `Status: IMPLEMENTED, 2026-09-02`, and the epics plan's *open tail* names only the
  Monero wordlist and cross-window write coordination — not the missing UI. The story table is the
  only place that says `landed (core)`, and no reader of the status line reaches it.

`da9b3fe`, which switched the boxes off, changed four files and no document.

## What must be true when this is done

1. A payment entry opens in the **read-only viewer** and shows its fields, with a Copy per field that
   round-trips through the host — for all three forms.
2. **No stored payment value appears in the page's HTML**, on the viewer as on the form. Values arrive
   by `postMessage`, on request. This is the rule the kind added; the viewer must not be its exception.
3. **CVV, PIN and an assembled phrase ask a second time** before they are shown, using `revealGate`.
4. A **woven field can be read back**: a per-field method picker, reassembly host-side, two rows, and
   **no hint whatsoever** about which row is real.
5. The **phrase form exists**: two columns, a wordlist per column, both layouts where the arithmetic
   allows, a generated decoy or a second real key, and the method chosen before the save.
6. The **weave boxes are on** — and they are on only because 1–4 make a woven value readable.
7. The changelog, the help article and both plans describe **the build that ships**, at every commit
   in the series rather than only at its end.

## The `coai` plan round — what it changed before anything was written

One round, verdict `good_enough` (the round budget is 1), **all three reviewers answered**, 14
findings, 12 gating. Ten accepted, four rejected with reasons. The accepted ones changed the design
below rather than being noted and forgotten:

1. **Documents move with the behaviour, not after it.** The first draft corrected the documents in
   Stage A and again in Stage D — which meant Stage B would enable the weave boxes while the
   changelog still said they were off, breaking this plan's own promise in its own build order. Each
   behaviour commit now carries its document change.
2. **The HTML invariant restated precisely.** "No value in the page" is false once values arrive:
   they are in the live DOM by definition. The rule this kind actually adds is that no stored value is
   ever **built into the HTML string** — the thing that gets concatenated and, when something goes
   wrong, logged. Values are set as DOM *properties* (`input.value`), which is also why they never
   reach a serialisation of the page. The test asserts the generated markup, and says which claim it
   is asserting.
3. **Every answer is stamped with the entity it was read for.** The preview tab is REUSED for another
   entry (`entityViewPanel.ts` `show()`), so a late answer can land in a card that now shows something
   else. The card carries the entity id, the host stamps every answer, and the page drops what does
   not match.
4. **The reveal gate covers `reassemble`, not only `reveal`** — the best finding of the round. A woven
   PIN reached through the method picker would have been shown with no second question, which is the
   requirement inverted. Granted once per field per panel, not once per method: twelve modals to try
   twelve methods is a feature nobody would use.
5. **`readingFor` takes the field key.** The first draft's signature could not say WHICH woven field
   to rebuild, and a record may have several.
6. **Copy on a result row recomputes host-side.** Resolving `pay_<key>` from storage would copy the
   woven value rather than the row on screen; the row's Copy sends `(field, code, layout, which)` and
   the host rebuilds it.
7. **Every read path is total.** An empty `paymentForm: 'phrase'` record can already exist (symptom 3),
   and `unshuffleTokens` throws on an odd-length input. Nothing in the card may throw on a record;
   an unreadable one renders as unreadable. *(Not accepted: inventing a version field and a migration.
   `pickPaymentFields` is already the compatibility layer, and no released build contains a payment
   record at all — `extension-v0.93.0` is on `main`, and this kind exists only on this branch.)*
8. **A refusal never destroys input.** A declined confirmation, an unequal own-words column or an
   unavailable layout leaves the typed words exactly where they are; the decoy is generated only on a
   save that is actually going through.
9. **Cleanup on every path**, including a dispose that lands while a prompt is open, a timer that
   fires after the panel is gone, and a `postMessage` that throws.
10. **Message payloads are allowlisted host-side** — the field against the record's own keys, the
    method against `isShuffleCode`, the layout against the two names — the way this same handler
    already checks `BINDABLE_FIELDS`.

**Rejected, with the reasons recorded** (a rejection is discounted in later rounds unless a reviewer
raises it with a new argument): a fallback "form not ready" section for a state no value can reach;
a "re-reveal without a reload" mechanism that is what the Show button already is; deferring every
document to one commit at the end (the inverse of 1, and it recreates the very window this plan
closes); and a "verified method" marker, which is the hint §4.3 exists to withhold.

## Build order — four stages, four commits

Strictly ordered. B before C for the reason S4.5 already taught this feature: wiring a save path
before its inverse exists writes values nobody can read back.

---

### Stage A — the documents say what ships (today's build)

No behaviour changes here. This lands FIRST because the false claims are already in the tree.

**A1. `CHANGELOG.md`** — rewrite `[0.94.0]` so it describes card + bank + the form switch + the edit
refusal, and states plainly, in the same voice the form uses, that weaving and the phrase are built
but switched off until the viewer can read them back.

**A2. `helpContent.ts`** — the `payment-instruments` article, `en` and `ru` alike: the same
correction. `helpCoverage.test.ts` builds its corpus from `a.en` only, so the Russian half is not
enforced by any test — it is changed by hand and named here so the next reader knows.

**A3. Both plans.** `research/PLAN_payment_instruments.md` and `..._epics.md` get a seventh deviation
and a corrected *open tail* naming this document. Their `IMPLEMENTED` status stays — the epics they
record did land — but the tail stops being implied.

**A4. `research/module_extension.md`** — the payment module table marks the six unwired modules as
unwired, and the *What the reviews caught* section gains the seventh, eighth and ninth no-caller
instances rather than leaving the count at four.

**A5. This file**, and its row in `todo/README.md`.

**Tests.** `plan-lifecycle.mjs` clean (it checks the status lines and the `todo/`↔`research/` links);
`helpCoverage.test.ts` still green. No new test — there is no new behaviour, and A1–A4 are prose.

---

### Stage B — the viewer card, and the two rungs that need it

The mechanism to copy is TOTP's, named in S4.5: the host recomputes per request and the page never
receives the stored value (`entityViewPanel.ts:129-137`, `viewerOptions.ts:70-73`).

**B1. `paymentViewCard.ts`** *(new, pure — no `vscode`)*. The card's markup from METADATA only:
which form, which keys the record holds, which of them are woven. No value is passed in and none can
therefore be rendered. One row per present key: a readonly input the host fills, a Copy button, and —
for a gated key — a **Show** button instead of a filled value. For each woven key, a method picker
(and a layout picker where the field is the phrase) plus two result rows.

`entityViewPage.ts` is 785 of 800 lines, so this is a separate module for the reason
`paymentFormMarkup.ts` is: the ceiling, not taste. It exports `paymentCardMarkup(view)` and
`paymentCardScript()`; `entityViewPage.ts` gains one `viewFrame` call and one script include.

**B2. `paymentViewMessages.ts`** *(new, pure)*. What the host answers, decided where it can be
tested: `plainValues(fields)` (everything present, minus the gated keys, minus the woven keys),
`revealValue(fields, field)`, `readingFor(fields, fieldKey, code, layout)` → `{ real, decoy }` via
`phraseReassembly.reassemble`. Digit fields reassemble as CHARACTERS under the vertical layout —
which is what `weaveOne` wrote (`shuffleTokens([...original], [...decoy], code)`) — and the phrase as
WORDS under its stored layout. **Total**: a record whose woven value has an odd token count (which
`unshuffleTokens` refuses, correctly) answers "cannot be read" rather than throwing out of a message
handler.

**B3. `viewerOptions.ts`** — `SecretReader` gains `payment(): Thenable<string | undefined>`, and both
readers implement it: `storageSecretReader` from `storage.getPayment`, `revisionSecretReader` from
`revision.secrets.payment`. This is the seam that makes the revision viewer work for free, which is
what the module exists for.

**B4. `EntityViewOptions`** gains `payment?: PaymentCardView` (metadata) and
`resolvePayment?: () => Thenable<PaymentFields>` (values, host-side only).

**B5. `entityViewPanel.ts`** — three messages: `payment` (the plain values, asked on load), `reveal`
(one gated field, or the whole phrase) and `reassemble` (a field, a method and a layout). `reveal` is
where `revealGate` finally has a caller: `needsReveal(field)` decides, `revealPrompt(label)` /
`phraseRevealPrompt(n)` is the question, and `confirmDestructive` from `dialogs.ts` asks it — the
fifth copy of that modal is not written, per S2.4.

**The gate covers `reassemble` too, and this is the finding the round earned its cost with.** A woven
PIN reached through the method picker is the same value as a revealed PIN; sending it back without the
second question would be the requirement inverted. The grant is per FIELD and per PANEL — asked once,
remembered while that card is open, dropped the moment the panel re-renders another entry — because
asking again for each of twelve methods is a control nobody would use.

Every payload is checked host-side before it is acted on, the way this same handler already checks
`BINDABLE_FIELDS`: the field against the keys the loaded record actually holds, the method against
`isShuffleCode`, the layout against the two names. And every answer carries the entity id it was read
for; the page ignores an answer addressed to an entry it is no longer showing.

**B6. The phrase's own rung.** An assembled phrase is held in a `PhraseBuffer`, posted to the page as
an ARRAY of words (measure 5.1), auto-closed after `PHRASE_VISIBLE_MS` (5.2), and the buffer cleared
on close and on panel dispose (5.4). On close the card returns to the mixed rows FIRST and then drops
the words (5.5). `retainContextWhenHidden` is already absent from this panel (5.3) — verified, not
added.

**B7. `entityViewCopy.ts`** — `pay_<key>` resolves through `options.resolvePayment`, so a Copy of a
CVV goes through the host exactly as a password does. A gated field's Copy asks the same question its
Show does: copying is showing, to the clipboard.

**A result row's Copy is a different message.** `pay_<key>` reads what is STORED, which for a woven
field is the woven value — copying that from a row showing rebuilt digits would hand somebody the one
thing on screen they did not ask for. The row's button sends the field, the method, the layout and
which row, and the host rebuilds it: `copyReading`.

**B8. `entityViewerCommands.ts`** — build the two new options for the live viewer and the revision
viewer.

**B9. `paymentFormMarkup.ts`** — the boxes lose `disabled`, the "not finished yet" paragraph goes, and
`mixControls` is shown when any box is ticked. The test that pinned the disabled state
(`paymentForm.test.ts`) is rewritten to pin the opposite, and the reason is recorded in this plan
rather than deleted quietly. **The changelog and the help article change in this same commit** — the
boxes turning on is exactly the sentence Stage A wrote, so Stage A's words leave when the state they
describe does.

**Tests** (red first, each one watched failing):
- a card record renders one row per present key, and **no value from the record appears in the HTML**
  — asserted by rendering with a record whose every value is a distinctive token and searching the
  page for each one;
- a gated key renders a Show button and no value; an ungated one renders an empty input;
- `plainValues` omits `cvv`, `pin` and every woven key; `revealValue` returns exactly one;
- `readingFor` on a woven card number under the correct code returns the original digits, and under
  a wrong code returns two rows of the same shape — asserted as *identical in form*, which is the
  requirement;
- a woven phrase saved horizontally round-trips to the ORIGINAL words (the S4.5 property, now through
  the viewer's own path);
- the panel's `reveal` handler refuses when the confirmation is declined, and posts nothing;
- `PhraseBuffer` is cleared when the view closes and when the panel is disposed;
- the mix boxes are enabled and `mixControls` appears when one is ticked.

---

### Stage C — the phrase form

**C1. `phraseFormMarkup.ts`** *(new, pure)*. The `phraseSection` fieldset: a textarea for the first
column, its wordlist select, the second-column mode (a generated decoy, or my own words / a second
real key) with its own textarea and wordlist, the layout switch, the method picker, and the two
sentences that must be on screen — `layoutRefusal(n)` when horizontal is missing, and
`phraseSaveWarning(n, layout)` above the save.

**C2. `phraseFormScript.ts`** *(new)*. Page-side: split words on whitespace, show the live count, show
the checksum state per column (`checksumHolds`) as a HINT and never as a gate, refresh the layout
options from `layoutsFor(count)`, and collect `phraseWords`, `phraseSecond`, `phraseOwnWords`,
`phraseListFirst`, `phraseListSecond`, `phraseLayout`, `phraseMethod` into the save payload.

**C3. `formSections.ts`** — `phraseSection`, `kinds: ['payment']`,
`condition: "val('paymentForm') === 'phrase'"`, in a colour no other payment section wears.

**C4. `phraseSaveGate.ts`** *(new, pure where it can be)* — the record a phrase save writes:
the second column (typed, or `generateDecoyPhrase` when it is a decoy), `phraseRefusal` before
anything is woven, `phraseColumns(real, second, layout)`, `shuffleTokens(...)` → `mixed`, plus
`wordlistFirst`, `wordlistSecond`, `layout`, `ownWords` and `shuffledFields: ['mixed']` so
`hasMixedField` is true and the edit guard fires. `paymentSaveGate.paymentGates` gains the phrase
confirmation, asked with the same `confirmDestructive`.

**C5. `entityFormPanel.ts`** — `paymentRecordFor` routes to the phrase builder when the chosen form is
`phrase`; the card/bank path is untouched. **The changelog and the help article change in this same
commit**, for B9's reason.

**A refusal costs the person nothing.** A declined confirmation, an unequal own-words column or a
layout the word count does not allow leaves every typed word where it is — the form panel keeps its
state (`retainContextWhenHidden: true`, deliberately, per S5.2 measure 5.3's exception) and the save
simply does not proceed. The decoy is generated **only on a save that is going through**, so a second
attempt is not a second decoy.

**Tests** (red first):
- a phrase form saves a record whose `mixed` is `2N` tokens, whose `layout` and wordlists are stored,
  and whose `shuffledFields` contains `mixed`;
- the ORIGINAL words are nowhere in the stored record — asserted token by token, because that is the
  claim the feature makes;
- the stored record round-trips through the viewer's `readingFor` to the original phrase, vertical
  and horizontal;
- a 25-word phrase is never offered horizontal and saves vertically;
- `ownWords` suppresses `generateDecoyPhrase` entirely (asserted by injecting a random that would
  throw);
- an unequal own-words second column is refused BEFORE anything is woven, with `phraseRefusal`'s
  words;
- a saved phrase record cannot be opened for editing (`mixedFieldGuard`, already built, now reachable).

---

### Stage D — the record, and the release

The changelog and the help article are already correct by here: B9 and C5 each carried their own,
which is finding 1 of the review round doing its work. What is left is the record and the tag.

**D3.** `research/module_extension.md` — the payment section's module table, the viewer's new rule
(the second surface that renders no stored payment value), and the no-caller count closed.

**D4.** Promotion: this plan moves to `research/` with `IMPLEMENTED <date>` and its deviations, per
[planning-docs.md](../.claude/rules/shared/common/planning-docs.md); the two parent plans' open tail
is updated to point at it; `todo/README.md` is brought back into agreement with the folder.

**D5.** Release: `extension-v0.94.0` — the tag is what publishes, per CLAUDE.md's release table. Cut
only after the whole suite, `tsc`, `eslint` and the ratchet are green **on the staged tree**, and only
after the `coai` code round has been resolved.

## Definition of Done

- [ ] Every module listed in the symptom table has a production caller, or is named here as
      deliberately unwired.
- [ ] No stored payment value appears in the viewer's HTML — asserted by a test, not by reading.
- [ ] CVV, PIN and an assembled phrase ask a second time; nothing else does.
- [ ] A woven value written by the form can be read back by the viewer, for a digit field and for a
      phrase, vertical and horizontal.
- [ ] `Phrase` in the form selector leads to a form with fields.
- [ ] `npm run compile`, `npm run typecheck`, `npm test`, `npm run lint`, `npm run ratchet` all green,
      and the numbers are reported rather than claimed.
- [ ] No file over 800 lines; no new `eslint-disable`; every new pure module imports no `vscode`.
- [ ] The changelog and the help article match the build at EVERY commit in the series.
- [ ] `plan-lifecycle.mjs` and `pin-check.mjs` pass.
- [ ] The `coai` gate: a plan round reached `proceed` before Stage B, a code round ran on the finished
      branch, every finding resolved with `accept` or a reasoned `reject`, and the verdicts and the
      real reviewer counts are in the summary.
