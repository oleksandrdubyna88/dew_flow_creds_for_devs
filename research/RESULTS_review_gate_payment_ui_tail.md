# RESULTS — what the review gate actually caught, on one feature

> Measured 2026-09-02 on [PLAN_payment_ui_tail.md](PLAN_payment_ui_tail.md), released as
> `extension-v0.94.0`. Two `coai` rounds (one plan, one code), **thirty findings**, three vendors, and
> the only question worth asking about a review gate: *how many of them changed the thing that
> shipped?*
>
> The count is the easy number and the misleading one. A round that returns fourteen findings and a
> round that returns fourteen useful findings cost the same and are not the same event.

## The criterion, fixed before the tally

A finding is counted as **acted on** when it changed the artefact — code written differently, or a
design changed before it was written. Everything else is one of:

- **declined (correct)** — the observation is true and the fix was refused on cost or on a documented
  design decision; the reasoning is recorded in `resolve`, and a reasoned rejection is discounted in
  later rounds;
- **declined (wrong)** — the premise is factually incorrect about this codebase;
- **no-op** — a positive remark whose own `fix` field says "None required".

The strictest sub-count, kept separately, is **defects prevented**: findings without which a defect
would have reached the `.vsix`.

## The tally

| round | reviewers | findings | acted on | declined (correct) | declined (wrong) | no-op |
|---|---|---|---|---|---|---|
| plan | 3 of 3 answered | 14 | **10** | 0 | 4 | 0 |
| code | 9 of 9 answered | 16 | **6** | 2 | 3 | 5 |
| **total** | | **30** | **16** (53 %) | 2 | 7 | 5 |

**Defects prevented: 8 of 30 (27 %).** Five were caught in the plan round, before a line existed;
three in the code round, in code that compiled, passed 3 000 tests and looked finished.

## By vendor — the number that changes how the gate is read

| vendor | findings | acted on | declined | no-op | defects prevented |
|---|---|---|---|---|---|
| `codex` | 13 | **12** | 1 (correct) | 0 | 5 |
| `gemini` | 5 | **4** | 1 (wrong) | 0 | 3 |
| `local` | 12 | **0** | 7 (wrong) | 5 | 0 |

The local engine produced **40 % of the findings and 0 % of the changes**. That is not an argument for
switching it off — it costs no money and no quota, and a round of three answering is worth more than a
round of two when the two disagree — but it is an argument against reading a finding count as a
quality signal. Five of its twelve were pure commentary with `fix: "None."`, and three of the seven
declined asked for something the design deliberately refuses.

Two of its rejections are worth naming, because they are the shape to watch for:

- *"Defer every document to one commit at the end"* — the exact inverse of `codex`'s first plan
  finding, which this plan had already accepted. Following both was impossible; following this one
  would have recreated the window the whole plan existed to close.
- *"Let the user lock a verified method"* — asks the product to know which of the two rebuilt rows is
  real. That is the hint the design withholds by construction; implementing it would have turned
  twelve methods into one second of enumeration.

## The eight defects, and where they were caught

| # | round | vendor | what would have shipped |
|---|---|---|---|
| 1 | plan | `gemini` | **The reveal gate on `reveal` but not on `reassemble`.** A woven PIN reached through the method picker would have appeared with no second question — the requirement inverted, with every test of the requirement still green. Watched red before the fix: *"it asked — actual 0, expected 1"* |
| 2 | plan | `gemini` | `readingFor` had no field-key parameter, so it could not say WHICH woven field to rebuild on a record holding several |
| 3 | plan | `gemini` | A rebuilt row's Copy resolving `pay_<key>` would have copied the STORED woven pair from a card showing rebuilt digits |
| 4 | plan | `codex` | No correlation between a request and its answer: the viewer is the shared preview tab, so an answer could land in a card now showing another entry |
| 5 | plan | `codex` | Phrase cleanup covering close and dispose but not a timer after navigation or a failed delivery |
| 6 | code | `codex` | **A gated Copy could copy the previous entry.** `state.options` is captured before the confirmation await; the tab re-renders while the modal is open |
| 7 | code | `codex` | A `postMessage` that throws left an assembled phrase held in a buffer with nothing on screen to close it |
| 8 | code | `codex` | Two quick clicks are two record reads; their answers could arrive reversed, showing one method's rows under a picker naming another |

## And the finding the gate did NOT make: the tests found the worst two

Neither round found either of the two defects that would actually have **destroyed data**. Both were
found by writing the phrase form's own tests and watching them fail:

1. `pruneMarks` kept a mark only when the value was a `string`. A woven phrase is `mixed`, an array,
   so the mark was pruned by the rule that exists to keep marks honest. The symptom was the phrase
   coming back **absent** rather than wrong.
2. `mixed` is deliberately absent from `SHUFFLEABLE_KEYS` — it is not a field that got woven, it IS
   the woven phrase — so a record marks a woven digit field and a woven phrase in two different ways,
   and `hasMixedField` knew only the first. A saved phrase would have been editable, and the form
   would have re-woven it with nothing to put back: the exact destruction `mixedFieldGuard` was built
   to prevent, reached by the one record shape the guard had never seen.

Both live at the seam between two modules that each looked correct. That is the class a reviewer
reading a diff is worst placed to catch and a round-trip test is best placed to catch — which is the
argument for the gate being *additional*, in the words the repository's own CLAUDE.md uses, rather
than a substitute for the tests.

## What this says about the gate, in one paragraph

Over one feature: the gate cost two rounds and returned sixteen changes, eight of them defects that
would have shipped. Its yield is real and it is not uniform — one vendor produced 12 of the 16 changes
and another produced 4, while the third produced none. The plan round outperformed the code round
(10 changes from 14 findings against 6 from 16), which is the expected direction and worth stating
plainly: **a design corrected before it is written costs one paragraph; the same correction after the
code exists costs the code.** And the two worst defects came from neither round, which is why "the
reviewers agreed" is not an answer to "does it work" any more than "the tests are green" was.

## Test evidence for the same release

Recorded here because a review record without the test record is half a measurement.

| suite | result |
|---|---|
| unit (`npm test`, `node:test` over compiled output) | **3004 tests, 3000 pass, 0 fail, 4 skipped** |
| `tsc` / `eslint` / size ratchet | clean / clean / at baseline |
| `plan-lifecycle.mjs` / `pin-check.mjs` | clean / OK |
| `dotnet build dew_flow_creds_for_devs.slnx` | **0 warnings, 0 errors** (warnings are errors here) |
| `CredVaultServer.Tests` | **162 tests, 162 pass, 0 fail** |
| `itest:masked-run` | **pass** |
| `itest:git` | **pass** |
| `itest:agent` | **pass** |
| `itest:ssh-agent` | **pass** |
| `itest:server` | **pass** — 18 transport checks, against a real Cred Vault Server on loopback |
| a real VS Code extension host | **not run** — every test here is `node:test` over `out/`, and that is what this repository's suite is |

`itest:server` is worth a note, because its first run FAILED and the failure said nothing about the
code. It needs a running server started with the exact signing key its own header names
(`itest-key-itest-key-itest-key-32x`) and `Auth__Microsoft__Tenant=` empty; started with any other
key the suite dies on a 401 that reads like a transport defect. Environment, not regression — and the
distinction is the reason the run was repeated rather than reported.

The artefact itself was opened before the tag rather than trusted: `creds-for-devs.vsix` carries
version 0.94.0, the viewer card (`payCard`, `paymentReading`, `mixPick`), the phrase form
(`phraseSection`, `phraseWords`), the ten wordlists, and **no** disabled weave box and no leftover
"Weaving is not finished" paragraph.

---

## Appendix — all thirty findings, so the tally above can be checked

`✔` acted on · `≈` declined, observation correct · `✗` declined, premise wrong · `—` no-op.
**D** marks a defect that would otherwise have shipped.

### Plan round — 14 findings, all 3 reviewers answered, verdict `good_enough`

| # | vendor | | finding | outcome |
|---|---|---|---|---|
| 1 | codex | ✔ | Stages B and C would enable behaviour while the documents still said it was off | build order changed: every behaviour commit carries its own document change |
| 2 | codex | ✔ | "No stored value in the page" is false once values arrive by message | invariant restated as *never built into the HTML string*; the test says which claim it asserts |
| 3 | codex | ✔ **D** | No correlation between request and answer; the viewer is the shared preview tab | every answer carries the entity id; the page drops what is addressed elsewhere |
| 4 | codex | ✔ | Reveal and reassembly trust the message payload | field checked against the loaded record, method against `isShuffleCode` |
| 5 | codex | ✔ **D** | Phrase cleanup covers close and dispose, not a timer after navigation or a failed post | cancelled and cleared on every path; the code round later found the concrete instance |
| 6 | codex | ✔ | Existing records have no compatibility behaviour | every read path made total; the versioned-migration half declined (no released build holds a payment record) |
| 7 | codex | ✔ | A refusal or a retry may lose typed input or spend a decoy | refusal costs nothing; the decoy is drawn only on a save that goes through |
| 8 | gemini | ✔ **D** | **`reassemble` bypasses the reveal gate** | the gate covers the picker; granted per field per card |
| 9 | gemini | ✔ **D** | `readingFor` has no field key on a record with several woven fields | signature corrected before it was written |
| 10 | gemini | ✔ **D** | A rebuilt row's Copy would resolve `pay_<key>` and copy the stored woven pair | `copyReading` recomputes host-side |
| 11 | local | ✗ | The phrase section might fail to mount and strand the form | sections render synchronously from a static catalog; there is no mount step, and `formOf` defaults an unknown value |
| 12 | local | ✗ | Wiping the buffer on dispose loses the phrase; add a re-reveal | closing IS the measure, and Show already re-requests |
| 13 | local | ✗ | Defer every document change to one commit at the end | the inverse of #1, and it recreates the window this plan closed |
| 14 | local | ✗ | Let the user lock a "verified" method | asks the product to know which row is real — the hint the design withholds |

### Code round — 16 findings, all 9 reviewers answered, verdict `proceed`

| # | vendor · role | | finding | outcome |
|---|---|---|---|---|
| 1 | codex · arch | ✔ | `paymentSaveGate` imports `vscode`, against repo rule 3 | `refuse()` joined `confirmDestructive` in `dialogs.ts` |
| 2 | codex · arch | ✔ | The finished plan is still in `todo/` marked plan-only | promoted — it was already Stage D, so this changed nothing unscheduled |
| 3 | codex · sec | ✔ **D** | **A gated Copy can copy the PREVIOUS entry**: options captured before the confirmation await | options identity re-checked after the await |
| 4 | codex · sec | ✔ **D** | A failed `postMessage` leaves an assembled phrase held | released on that path too |
| 5 | codex · ux | ✔ **D** | Out-of-order reassembly answers show one method's rows under another's label | the answer carries its method; the page drops a stale one |
| 6 | codex · ux | ≈ | The decoy is generated in the gate and again in the builder | true; the fix is a refactor of the save path for a cost in array draws, and a differing decoy is by design |
| 7 | gemini · sec | ✗ | Phrase copy bypasses the buffer's zeroing | the clipboard is the documented exception; the proposed fix would blank the rows on screen |
| 8 | gemini · ux | ✔ | A rebuilt row's Copy gives no acknowledgement | posts the same `copied` message every other Copy does |
| 9 | local · arch | ✗ | Split the monolithic plan into sub-plans | it is already four stages of one commit each — and this reviewer's own #12 calls it exceptionally well-structured |
| 10 | local · arch | ✗ | Add a subscribe/invalidate channel to `SecretReader` | reading per request IS the mechanism, copied from the one-time code path |
| 11 | local · sec | ✗ | A constant `random` in the harness weakens the reveal-gate tests | that `random` feeds the picker's display order and reaches no part of the gate |
| 12–16 | local | — | five positive remarks whose own `fix` field reads "None." | nothing to do |
