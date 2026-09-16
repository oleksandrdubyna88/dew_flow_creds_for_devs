# PLAN — the viewer says an entry is woven, and shows what the method did

> Status: **IMPLEMENTED, 2026-09-16.** Scope: `src_vs_code/src` — the entity viewer's woven row and
> the page script that drives it, plus two adjacent corrections the owner asked for in the same pass.
> Extension only; no HTTP contract, no storage change, no migration.
>
> Closes [#58](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/58).
>
> Built as six stories, each through its own multi-model code round: 3 + 12 reviewers on the plan and
> on S1–S3. **Six deviations worth reading before the plan itself.**
>
> - **The row order is cleared when the ENTRY changes, not on every render.** The plan said per
>   render, and a code round showed why that is wrong: re-rendering the same entry while a keychain
>   read is in flight posts rows under the old order into a page whose Copy resolves the new one —
>   the display and the clipboard disagreeing about the same secret, with nothing on screen saying
>   so. Re-rendering the same entry is not a new viewing.
> - **The order is sampled before EVERY await, and there were two of them.** The keychain read on the
>   password path and the confirmation modal on the card path. The password one was fixed first and
>   the card one was found by a reviewer noticing the asymmetry — the RED was the real PIN reaching
>   the clipboard when the row on screen showed the other reading.
> - **The draw is the house CSPRNG, not `Math.random`.** One bit, but a predictable bit is one a
>   reader who has watched a few opens carries into the next. `cryptoRandom` already existed.
> - **The form's raw-code title had THREE sites, not the two this plan named** — card, password and
>   phrase. Fixing two would have left the phrase form saying `f4` while its own picker said
>   `Method 4`, which is the exact defect the change was for.
> - **`miniDom` had the bug this feature is about.** Its matcher returned `true` for any selector it
>   could not parse, so `[data-woven-host]` — the selector the viewer's page script binds by —
>   matched the FIRST element in the document. A test driving the page would have bound it to the
>   wrong node and passed. Fixed, with its own tests, before the page tests were trusted.
> - **Two types the plan did not anticipate**: `DisplayedPair`, a branded `ReadingPair` so an
>   arithmetic pair cannot reach a display consumer (the compiler refused four call sites the moment
>   it landed), and `rowIn`, the single mapping of `a`/`b` to a row shared by both hosts.
>
> **Not built, because the owner did not ask for them** (2026-09-15): a per-row Show/Hide toggle, and
> renaming the Show button to *Unweave*. The button still says Show, and nothing in the build claims
> to undo a weave.
>
> Related docs: [module_extension.md](module_extension.md),
> [PLAN_woven_passwords_and_entity_pin.md](PLAN_woven_passwords_and_entity_pin.md),
> [PLAN_payment_ui_tail.md](PLAN_payment_ui_tail.md),
> [PLAN_form_chrome_and_weave_example.md](PLAN_form_chrome_and_weave_example.md).

## The goal, and what is already built

The issue asks for four things. **Three of them already exist** and the honest first step is saying
so, because the work is widening what is there rather than writing a second implementation:

| Asked for | Today |
|---|---|
| a dropdown of weaving methods, in a random order | `wovenRow.ts:43-61` — `<select class="mixPick">`, order from `methodOrder(random)` |
| a button that rebuilds the value | the same row's `Show` (`data-action="reassemble"`, `wovenRow.ts:53`) |
| the recovered pair, each with a Copy | `readingRow` (`wovenRow.ts:64-70`), ids `payReading_<key>_a` / `_b` |
| **the method drawn on two values and the result** | **missing in the viewer** — the FORM paints it (`weaveExample.ts:115`, `weaveExampleScript.ts:80`) |
| **"this entry is woven" said in Main** | **missing** — the viewer has no equivalent of the form's `wovenState` (`generalNotes.ts:17`) |

So two things ship, plus three corrections the owner decided on while this was being specified.

## What ships

1. **Main says it.** One sentence in the viewer's Main section naming what is woven — the password
   and/or the payment fields by their labels. One statement, one place, for every kind of entry.
2. **A picture under the reading.** When a reading is shown, a three-column block appears beneath the
   two rows: the first row's value, the second row's value, and **the stored woven value with every
   token coloured by which of the two rows it came from**. The same painter the form uses.
3. **The two rows stop being in a fixed order** (see §The row order below).
4. **The form's example stops naming the raw code.** It says *"Password — f4"*; every picker on every
   surface says *"Method 4"*.
5. **The edit refusal stops promising an action that does not exist.**

### Decisions taken by the owner, 2026-09-15

- **The picture is painted after `Show`, never on a dropdown change.** Painting on change would put an
  unwoven CVV, PIN or seed phrase on screen without `revealGate` (`revealGate.ts:22-41`) ever asking
  the second question — `paymentViewHost.ts:170` only reaches a reading after `grant()`.
- **One sentence, in Main**, rather than one per section, even though a payment record's woven fields
  are drawn in the *Payment instrument* frame (`entityViewPage.ts:616`).
- **The form's `f4` label is fixed in this change**, not deferred.
- **The row order is randomised per render** (§The row order).

## The symptom behind item 3 — the rows are not what the page claims

`WOVEN_ROW_NOTE` (`wovenRow.ts:73-75`) tells the person:

> *"Both rows come back the same way whichever method you pick — nothing here can tell you which one
> is yours, and that is deliberate."*

That is not true of the build. The real value is woven as the FIRST column (`wovenSecret.ts:54`
`shuffleTokens([...value], [...decoy], code)`), `unweaveSecret` returns it as `first`
(`wovenSecret.ts:81`), and the host puts `first` into row **a** — `wovenPasswordHost.ts:120`
(`first: [...reading.first]`) and `paymentViewHost.ts:227` (`first: buffers[0].words()`, where
`buffers[0] = PhraseBuffer.of(reading.real)`, `:213`). `rowOf` states the mapping outright:
`which === 'b' ? reading.decoy : reading.real` (`paymentViewMessages.ts:228-230`).

**Under the correct method, row one is always yours.** Somebody working through the twelve methods
never reads row two. The protection is twelve, not twenty-four, and the sentence on screen overstates
it. Nothing about this is introduced by this change; the picture merely makes the pairing easier to
read, which is why the owner chose to fix it here rather than record it.

## The row order — the mechanism, and the one way it must not be built

**The flip must live in the HOST and must never appear in a message.** The page's whole defence is
that its DOM says `a` and `b` and nothing else (`wovenRow.ts:11-17`); a `flip: true` travelling in the
reading answer would put the answer one inspector away from the person this feature defends against —
the same standard that keeps ids `a`/`b` instead of `real`/`decoy`. Deriving it page-side from a
nonce fails for the same reason: the derivation is in the source.

So:

- A new pure module `rowFlip.ts` holds, per `(entityId, key)`, one boolean minted from an **injected**
  random the first time a reading is asked for, and kept until the panel shows another entry. Injected
  because `Math.random` is already passed in for method order (`entityViewPage.ts:231`,
  `entityViewerCommands.ts:106`) precisely so a test can pin it.
- **Per render, not per press.** Pressing `Show` twice with the same method must not swap the rows
  under the person's hands; opening the entry again may. The flip is cleared where the card's other
  per-entry state is cleared — `PaymentViewHost.reset()` (`paymentViewHost.ts:323-326`).
- One function applies it, `displayed(reading, flip)`, returning the two rows in **display** order.
  The message is built from that, and a Copy resolves `a`/`b` against the same flip. `rowOf`'s
  contract changes from *"b is the decoy"* to *"b is the second row shown"*, which is the honesty fix:
  after this, no function on the display path knows which reading is the person's.
- `wovenPasswordHost.ts` is a set of free functions with injected deps (`WovenPasswordDeps`, `:23-30`)
  and stays that way: the flip store arrives as one more injected dependency, owned by the caller.
- `WOVEN_ROW_NOTE` is rewritten to say what is now true.

**What this does not claim.** One extra bit. Twelve methods become twenty-four readings to work
through, and the method is still the only real secret. The note will say that rather than more.

## Design

### New modules

| Module | Holds | Why its own file |
|---|---|---|
| `wovenPicture.ts` | `wovenPictureTokens(stored, code, layout): readonly ExampleToken[]` — each stored token tagged with the **row** it is in | the only new arithmetic; pure, so it is a unit test rather than a hope |
| `rowFlip.ts` | the per-`(entityId, key)` display flip, from an injected random | one store, both hosts; `vscode`-free |
| `viewWeaveScripts.ts` | painter → picture fragment → `paymentCardScript()`, assembled once, in that order | the exact mirror of `formWeaveScripts.ts:19-25`, which exists **because** two copies of the painter shipped once and one of them painted outside the block its colours are scoped under (issue #51) |

### The arithmetic

`wovenPictureTokens` runs the *side labels* — not the values — through the same two functions the real
weave runs the values through: `phraseColumns` (`phraseLayout.ts:104`) and `shuffleLayout`
(`shuffle.ts:163`). It therefore cannot disagree with the rows beneath it, and it holds no value at
all.

**The horizontal-layout trap.** Under `layout: 'horizontal'` the two woven COLUMNS are not the two
ROWS — each column is half of each phrase (`phraseLayout.ts:119-145`). Colouring naively by
`Slot.side` would colour a horizontal phrase's picture into columns that contradict the rows below it,
for every horizontal phrase record. Running the labels through `phraseColumns` is what makes the two
agree by construction instead of by a second piece of arithmetic that has to be kept in step.

### The message — extended, not new

`paymentReading` (posted at `paymentViewHost.ts:206-231` and `wovenPasswordHost.ts:105-123`) gains two
fields: `woven: { text, side }[]` and `methodName: string`. Nothing else changes — not
`CopyMessage` (`entityViewPage.ts:143`), not `HANDLED` (`paymentViewHost.ts:42`), not the panel's
handler chain (`entityViewPanel.ts:134-229`). One message because the rows and the picture must
appear, refuse and vanish together, and because the page's stale-method guard
(`paymentViewCard.ts:271`) then covers the picture for free.

`methodName` is `methodLabel(code)` (`shuffle.ts:56`). The raw code never reaches a screen — which is
item 4, and `shuffle.ts:34-49` already records why that matters: the label is the only route back to a
woven value.

### The markup — one line

```html
<div class="readingRows" id="payRows_${key}" hidden>
  ${readingRow(key, 'a', label)}
  ${readingRow(key, 'b', label)}
  <div class="weaveExHost" id="payExample_${key}"></div>
</div>
```

Inside `payRows_<key>`, so the picture cannot be on screen when the rows are not — which is what makes
the phrase's 90-second auto-close (`revealGate.ts:58` → `payClose`, `paymentViewCard.ts:215-225`) cover
it structurally rather than by remembering to clear it. It is cleared explicitly as well.

`wovenRow.ts` serves both the card (`paymentViewCard.ts:129`) and the password
(`entityViewPage.ts:228`), so this one line is the whole answer to "payment or password".

### Columns are named after ROWS

`paintExample` (`weaveExampleScript.ts:80-93`) hard-codes the form's second-column caption, *"The
decoy it is woven with"*. In the viewer that sentence would name row two as the decoy and undo the
entire point. The painter gains an optional caption parameter; the viewer passes **"First row"** and
**"Second row"** — the ordinals `readingRow` already prints (`wovenRow.ts:65`) — so the picture
introduces no new vocabulary to the page.

### Styles

`.weaveEx*` lives in `entityFormStyles.ts:129-140` today. It moves to an exported constant beside the
painter and is interpolated by both stylesheets — the `WOVEN_ROW_STYLES` precedent (`wovenRow.ts:77`,
*"so neither can style them differently"*). The viewer gets it through `paymentCardStyles()`
(`paymentViewCard.ts:315`), which `entityViewStyles.ts:116` already includes, so `entityViewStyles.ts`
is not touched.

### Two corrections

- `mixedFieldGuard.ts:38-48` ends *"…or view it and unweave the field first."* There is no unweave,
  and this change deliberately does not add one — it is read-back only. The sentence becomes an
  instruction that exists: open the entry, pick your method, press Show, copy the row you recognise,
  then create a new entry and delete this one.
- `wovenFormScript.ts:46` and `cardFormScript.ts:292` title the form's example with `answer.method`
  (`f4`). `exampleAnswer` (`weaveExample.ts:35`) gains `methodName` and both call sites use it.

## Build order

Each story leaves the repository green: `npm run typecheck`, `npm test`, `npx eslint src`.

- **S1 — one definition of the picture's colours.** Move `.weaveEx*` out of `entityFormStyles.ts` into
  an exported constant; interpolate it in the form's stylesheet and in `paymentCardStyles()`. No
  behaviour change.
  *Test:* the constant appears in both stylesheets and `.exTok.first` occurs exactly once in each.
- **S2 — the painter takes the second column's name.** Optional caption parameter, existing callers
  unchanged.
  *Test:* the caption is the caller's when given and the form's when not.
- **S3 — `wovenPicture.ts`.** Not wired yet.
  *Tests:* every stored token is coloured by the row it is in (checked against `shuffleTokens`);
  **a horizontal phrase is coloured by its ROWS, not its columns** (the test that catches the naive
  design); the output holds nothing the page does not already have; and nothing in the module can name
  a value's truth — its JSON fails `/real|decoy/i` and it imports neither `phraseReassembly` nor
  `wovenSecret`.
- **S4 — the row order (RED first).** `rowFlip.ts`, `displayed()`, both hosts, `rowOf`'s new contract,
  the rewritten `WOVEN_ROW_NOTE`.
  *Tests:* with a pinned random the first row is the second reading — **this test fails on today's
  code, which is the point**; a Copy of row `a` under a flip copies the same text the row shows; the
  flip is stable across two `Show` presses and re-minted after `reset()`; and **no message, and no
  part of the page, carries the flip** (`JSON.stringify(answer)` has no boolean that tracks it).
- **S5 — the answer carries the picture.** `woven` + `methodName` in both hosts.
  *Tests:* a reading answer carries one token per stored character and names none of it; the existing
  `!/real|decoy/i` assertion (`wovenPasswordForm.test.ts:159`) now guards the new fields for free.
- **S6 — the page paints it.** `viewWeaveScripts.ts`, the host `<div>`, `payClose` extracted so
  `payHelpers` stays inside the 50-line function ceiling, `entityViewPage.ts` swaps the script call.
  *Tests, through `miniDom` because a string assertion cannot see a painting bug (the #51 lesson):*
  the block is painted under a reading; **a phrase that closes itself takes its picture with it**;
  a refused reading leaves no stale picture; the painted DOM's text fails `/real|decoy/i`; and the
  picture under a wrong method is shaped exactly like the picture under the right one.
- **S7 — Main says it.** `wovenViewNote` beside `wovenState` in `generalNotes.ts`, one entry in
  `mainRows`.
  *Test:* present for a woven password, present for a payment record naming *PIN* by its label, absent
  for a plain entry, and no control anywhere claims to undo a weave — the viewer's mirror of
  `wovenPasswordForm.test.ts:97`.
- **S8 — the two corrections.** The refusal sentence; `methodName` in the form's example.
  *Tests:* the refusal no longer matches `/unweave the field/` and names Show and copy; the form's
  example is titled `Method 4` and never `f4`.
- **S9 — docs.** `research/module_extension.md` gains the three modules and a design record for why the
  viewer's picture is drawn from real values while the form's never is. `architecture.md` is not
  touched: no cross-module interaction changes.

## Test plan

Runner is `npm test` in `src_vs_code` (`node --test` over compiled `out/`). `out/` is removed before
the run that is reported, because `tsc` leaves renamed files behind and a stale `out/` inflates a
suite silently.

New files: `test/wovenPicture.test.ts`, `test/rowFlip.test.ts`, `test/wovenViewPicture.test.ts`.
Extended: `wovenRow.test.ts`, `wovenPasswordForm.test.ts`, `paymentViewCard.test.ts`,
`paymentViewHost.test.ts`, `paymentForm.test.ts`, `mixedFieldGuard.test.ts`.

The two that carry this change's risk, named so they cannot be quietly dropped:

1. `a phrase that closes itself takes its picture with it` — a phrase auto-closes after 90 s; a
   picture of all twelve words surviving that close would defeat the measure entirely.
2. `the first row is not always the person's value` — RED against today's code.

## Definition of Done

- [ ] `npm run typecheck`, `npm test` and `npx eslint src` are green in `src_vs_code`, and the reported
      test run followed a cleared `out/`.
- [ ] S4's and S8's tests were **watched failing first** and the failure messages are in the summary.
- [ ] No stored value is built into the page's HTML string; every value arrives by message and is set
      as a DOM property.
- [ ] No message, id, class or caption names a reading as real or decoy.
- [ ] The picture is reachable only through a reading that passed `revealGate`, and it disappears with
      the rows.
- [ ] `entityViewPage.ts` is still under the 800-line ceiling and no function exceeds 50 lines.
- [ ] `research/module_extension.md` records the three new modules and the row-order change.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; this plan is
      promoted to `research/` with `IMPLEMENTED <date>` and its deviations in the same task.
- [ ] The `coai` gate: a `review_plan` round reached `proceed` before implementation, a `review_code`
      round ran on the finished branch, every finding resolved with `accept` or a reasoned `reject`,
      and the summary reports the verdicts and how many reviewers answered.
