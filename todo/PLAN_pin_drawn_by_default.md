# PLAN — the transit PIN is drawn before it is asked for, and the export path gets the same box

> Status: **plan only, nothing implemented yet.** Scope: the VS Code extension only —
> `src_vs_code/src/sharePinPrompt.ts` (renamed), `src_vs_code/src/commands/exportCommand.ts`, their
> tests, the sharing and import/export help articles in five languages, and
> `research/module_extension.md`. **No server change, no HTTP contract change** (repo rule 6 is not
> engaged).
>
> Related docs: [module_extension.md](../research/module_extension.md),
> [PLAN_generated_share_pin.md](../research/PLAN_generated_share_pin.md),
> [PLAN_sharing.md](../research/PLAN_sharing.md).

## The symptom

`PLAN_generated_share_pin.md` shipped on 2026-09-08 and put a generator behind a `sparkle` button in
the share-PIN box (`sharePinPrompt.ts:58-61`). It works. **Nobody found it.**

The operator opened a fresh VS Code window on the released 1.3.0, ran *Share with…*, photographed the
box, and asked where the feature was. The two buttons were in the screenshot — VS Code renders
`InputBox.buttons` as small, dimmed glyphs in the box's TITLE row, at the far right, on the same line
as the words *One-time share PIN* and visually a part of the chrome rather than of the form. The
person who opens that box is looking at the empty field and at the sentence under it.

That sentence is `PROMPT` at `sharePinPrompt.ts:35`:

> *Encrypts the shared item. Tell it to the recipient out-of-band.*

It does not mention that a PIN can be drawn. The only place the button is described is the sharing
help article — which nobody is reading at the moment they are being asked for a PIN. So the feature
is present, correct, tested, released, and **invisible**, which for a discoverability feature is the
same as absent.

There is a second symptom, in a different command, and it is the older one:

**`Export / Share Externally…` never got the generator at all.** `sealedForm` at
`exportCommand.ts:182-191` still raises a plain `showInputBox` for *Password for the export* —
*"Tell it to the recipient out-of-band — it is the only key to this file."* Same job, same threat
model, same sentence about telling somebody out-of-band, and no way to be handed a strong value.
It is also the **only** transit-secret box in the extension with **no confirmation of a typed
value**: `chooseSharePin` sends a typed PIN to `confirmTyped` (`sharePinPrompt.ts:240-257`), while a
mistyped export password is discovered when the recipient cannot open the file, by which time the
plaintext is gone.

## The goal

1. The box **opens with a PIN already drawn and already on the clipboard.** Enter ships it; the next
   keystroke can be `Ctrl+V` into the chat. Typing over it is still fully supported and still takes
   the whole typed path, confirmation included.
2. **`Export / Share Externally…` asks through the same box** — same generator, same reveal, same
   strength floor, same confirmation of a typed value.

## Decisions, and why

### 1. Drawn on OPEN, not offered on a button

The button stays (a redraw is a real want: a value that is awkward to read aloud), but it stops being
the only route. This is the whole point of the change: a default that costs nothing to override beats
an affordance nobody sees. The person who wants their own PIN types, exactly as before, and pays one
extra keystroke — `Ctrl+A` is already how a person replaces a pre-filled field.

### 2. The copy happens on open too — and a drawn value never outlives what it was drawn for

Drawing without copying would keep the box's promise half-made and put us back where we started: the
value would be masked, on screen, and unreachable. So the open path copies, exactly as the button
path does.

That makes the copy something the extension does **on its own**, which the button version never did.
Under the button, a copy was always an explicit act by the person, and every consequence of it was
theirs. A copy nobody asked for is ours, so this change owes an invariant the old one did not:

> **The clipboard never keeps a drawn value that is not the value the operation actually used.**

Four ways that can be violated, and this plan closes all four. Three were raised by the review gate
(findings 1, 9, 10) and the third is the sharpest defect in the whole change:

| The person… | Without the rule | What runs |
|---|---|---|
| opens the box, presses **Escape** | a live transit secret sits on the clipboard for 45 s, for a share that never happened | wipe on cancel |
| **types over** the drawn PIN and accepts | the clipboard still holds the DRAWN value while the share is sealed with the TYPED one — they paste A into the chat, the recipient is sent A, the item opens only with B, and nothing anywhere reports an error | wipe the drawn value on accept when it is not what was accepted |
| **mismatches or cancels the repeat box** | `confirmTyped` answers `undefined` and the whole flow ends, with the drawn value still on the clipboard | wipe when `chooseTransitPin` answers `undefined` by any route |
| **cancels the save dialog**, or the write fails | no file exists, and its password is on the clipboard | `save` wipes unless it actually wrote the file |

The wipe is always `clearIfUnchanged` (`secretClipboard.ts:54-61`), which by construction touches the
clipboard only when it still holds exactly the string we put there — so a person who copied something
of their own in the meantime keeps their own work, and no wipe can ever destroy data we did not
create. That exact-match guard is why no timestamp or write-window is needed on top of it.

The second row is the one that justifies the invariant existing as a named rule rather than as three
separate `if`s: it is silent. Every other failure here announces itself, and that one hands the
recipient a PIN that looks right and is not.

This is also a real trap in the existing shape: `accepted` calls `box.hide()`
(`sharePinPrompt.ts:123`), which raises `onDidHide`, so "hidden" alone cannot distinguish a cancel
from an accept. The handler must consult state that `accepted` sets, and the test for it
(`acceptingLeavesTheClipboardAlone`) is written before the code.

### 3. `generated` stays DERIVED, and the pre-fill does not touch that

`accepted` computes `untouched = drawn.value.length > 0 && box.value === drawn.value`
(`sharePinPrompt.ts:121`). A pre-filled value sets `drawn.value` at open through the same field the
button sets, so an untouched pre-fill resolves `generated: true` and an edited one resolves a typed
PIN, with no new branch and no new flag. The module's own doc comment argues at length for why this
is derived rather than latched; the pre-fill is one more path that could have forgotten to set a flag
and cannot forget a comparison.

### 4. The advisory line says both things, in one place

The message under the field becomes:

> *Generated, and copied to your clipboard. Type over it to use your own.*

The second sentence is the entire discoverability fix — it is what tells the person the value is not
a fixture. It is used by **both** the open path and the `sparkle` button, because it describes a
state and not an event, and a message that differs between two routes to the same state is how the
box comes to say two different things. The clipboard-failure wording is unchanged
(`sharePinPrompt.ts:105-107`).

### 5. The module is renamed, because it stops being about sharing

`sharePinPrompt.ts` becomes **`transitPinPrompt.ts`**. Both callers ask for the same kind of secret —
one that crosses to another person, out-of-band, once — and the file's stated job is to be the single
place where *everything said about it* lives. A file called `sharePinPrompt` holding the export
password's wording is a name that lies, which is the failure mode the module was created to prevent.

`SharePin` in `sharePin.ts` is **not** renamed: it is the type the share transport already speaks
(`shareInbox.ts`, `shareDelivery.ts`, `shareCommands.ts`), and renaming a type across a subsystem to
tidy a word is a bigger diff than this change deserves. `transitPinPrompt.ts` documents that it
returns the share transport's type because the two happen to be the same shape, and that this is the
one thing to revisit if the export path ever needs a field the share path does not.

Cost of the rename: two existing imports (`shareInbox.ts:25`, `commands/shareCommands.ts:7`), one
NEW import in `commands/exportCommand.ts` (which imports no prompt module today — it calls
`vscode.window.showInputBox` directly, and gains the import as part of this change), one test file,
and the doc references. It is done with `git mv` so the history follows.

### 6. The export path gets the terminal message too — it is not decoration there

`announce` (`transitPinPrompt.ts:182-199`) re-copies the value immediately before showing the
message, and the comment on it explains why: an unbounded amount of time passes between drawing the
PIN and the operation landing, so the 45 s promise is only true if it is measured from the moment the
person goes to paste.

The export path has **more** of that gap than the share path, not less: after the box comes a
`showQuickPick` for the form, then a `showSaveDialog` — a native file dialog a person can sit in for
minutes. Wiring the generator into `sealedForm` without wiring the announcement into `save` would
ship a feature whose clipboard is reliably empty by the time it is used. So `save`
(`exportCommand.ts:193-207`) raises the same message, with `Copy again` and `Show PIN`, for a
generated password only.

**Mechanically, end to end** — spelled out rather than implied, because the gate read the terse
version and could not tell whether the value was threaded at all:

1. `sealedForm` (`exportCommand.ts:182-191`) calls `chooseExportPassword()` and holds the whole
   `SharePin`, not just its `.value`. `undefined` — Escape, a weak value abandoned, a mismatched or
   cancelled repeat box — returns `undefined` from `sealedForm` exactly as today, and the export ends
   with nothing written. There is no re-prompt loop: that is `confirmTyped`'s existing contract on
   the share path (*both boxes or nothing*), and the point of this change is that the two paths
   behave identically.
2. `ExportFile` (`exportCommand.ts:34-37`) gains `readonly pin?: SharePin`; `sealedForm` returns it
   alongside `content` and `ext`.
3. `plainForm` (`exportCommand.ts:167-181`) sets nothing, so its `pin` is `undefined` — there is no
   password on that path and never was.
4. `save` (`exportCommand.ts:193-207`) reads `file.pin` and announces **only** when
   `file.pin !== undefined && file.pin.generated` — an explicit `undefined` test rather than a
   truthiness test, so an empty string could never be mistaken for a password, and a plain-JSON
   export can never raise a `Copy again` it has nothing to copy. A test asserts the plain path
   announces nothing about a PIN.
5. `save` returns early when `showSaveDialog` is cancelled (`exportCommand.ts:199-201`) and can throw
   when `fs.writeFile` fails. **Both are cancellations for clipboard purposes**: no file exists, so
   its password must not stay on the clipboard. Per the invariant in decision 2, `save` wipes a
   generated password through `clearIfUnchanged` on either route, and announces only after the write
   actually happened.

### 7. The export password's typed path now confirms — a deliberate behaviour change

Routing `sealedForm` through the shared box means a typed export password is asked for twice. That is
a change to an existing flow, and it is the correct one: this password is the only key to a file that
outlives the session, and the asymmetry with the share path was never argued for anywhere — it is
simply what `showInputBox` gave. Recorded here so the promoted plan records it rather than a reader
discovering it.

### 8. What is deliberately NOT changed

- **The vault master PIN box (`pinPrompt.ts`) is untouched.** A vault PIN is not a transit secret: it
  is typed by the same person repeatedly and must be memorable to them. Drawing one and copying it to
  the clipboard would be actively wrong.
- **The recipient's `askSharePin`** — the box that asks a receiver to type the PIN they were told —
  keeps no generator. There is nothing to draw there; the value already exists.
- **`validatePin` / `pinPolicy` are untouched.** `sharePin.test.ts` already asserts 200 draws against
  `validatePin`, which is what makes a pre-filled value safe to hand to the accept path unchanged.

## What the review gate changed (round 1, 2026-09-08 — all 3 reviewers answered)

Verdict `good_enough`, 8 gating against a threshold of 6, one round budgeted. Six findings accepted,
five rejected with reasons.

**Accepted, and folded in above:** the export threading spelled out end to end rather than implied
(decision 6, steps 1–5); `exportCommand.ts` added to the rename's cost audit; the plain-JSON path
guarded with an explicit `pin !== undefined` and its own test; and — the three that matter — the
clipboard invariant in decision 2. **Codex found the one silent defect in the change**: type over the
drawn PIN, accept, and the clipboard still holds the DRAWN value while the item is sealed with the
typed one, so the recipient is handed a PIN that looks right and opens nothing. That finding is why
decision 2 is a named invariant with a table instead of a sentence about Escape.

**Rejected, with reasons recorded in the gate:** a re-prompt loop on a `confirmTyped` mismatch (it
would change the share path, whose *both boxes or nothing* contract is the thing this change is
aligning the export path TO); a timestamp window inside `clearIfUnchanged` (the exact-match guard is
strictly stronger, and a write-window would leave the secret behind on a slow cancel — the finding's
own walkthrough ends by describing correct behaviour); a lock icon and colour on the pre-filled field
(`InputBox` has no per-field styling and the field is masked; the implementable half of that fix is
already decision 4); renaming `SharePin` to `TransitPin` across the share transport (decision 5
weighs and declines it, and the finding's own alternative is what decision 5 commits to); and a
`Promise.race` against the TTL expiring during the save dialog (`announce` re-copies immediately
before showing the message, which is decision 6's entire argument).

## Build order — two stories, each reviewed and committed on its own

The gate's operator commands ask for 2–4 epics of 2–4 stories each, from a heuristic that counted
203 lines, 8 build steps and 25 named files. **That heuristic is wrong for this plan and the command
says to say so when it is.** The 25 files are almost all *references* — the line-numbered citations
this document is made of — not files that change. What actually changes is one prompt module, one
command, their two test files, five help articles and one module doc, for a few hundred lines. Split
into a dozen stories, most would be a paragraph of help text with a full `review_code` round attached
to it, and the reviewers would be reading a diff too small to judge against its own scope.

So: **two stories, each an independently shippable behaviour change**, each finished the way the
command requires — reviewed with `review_code`, every finding resolved, docs and tests updated,
committed — before the next begins.

### Story 1 — the share PIN is drawn before it is asked for

The whole user-visible fix for the reported symptom, on the path the operator actually walked.

1. **RED tests first**, watched failing (§Test plan, rows 1–5).
2. Extract `draw(box, drawn)` from `pressed` (`sharePinPrompt.ts:76-92`) and call it from `askOnce`
   before `box.show()`; add the "Type over it to use your own." half of the advisory.
3. Implement the decision-2 invariant on the share path: `accepted` records that it accepted and
   what it resolved; `onDidHide` wipes on cancel; an accepted TYPED value wipes the drawn one; a
   `confirmTyped` mismatch or cancel wipes too.
4. Docs: `research/module_extension.md` and the sharing article in `helpEn/Ru/Uk/De/Es.ts`.
5. `npm run typecheck && npm run lint && npm test && npm run ratchet`; `review_code`; resolve; commit.

### Story 2 — the export path asks through the same box

1. **RED tests first**, watched failing (§Test plan, rows 6–8).
2. `git mv src_vs_code/src/sharePinPrompt.ts src_vs_code/src/transitPinPrompt.ts`, and the test file
   with it; fix the two existing imports. No behaviour change — the suite must be green again here.
3. Parameterise the box's wording — `chooseTransitPin(wording)` — keeping `chooseSharePin()` as the
   share preset, and add `chooseExportPassword()`.
4. `sealedForm` calls it and keeps the whole `SharePin`; `ExportFile` carries it; `save` announces on
   a real write and wipes on a cancelled dialog or a failed write (decision 6, steps 1–5).
5. Docs: `research/module_extension.md` and the import/export article in `helpEn/Ru/Uk/De/Es.ts`.
6. `npm run typecheck && npm run lint && npm test && npm run ratchet`; `review_code`; resolve; commit.

## Test plan

`node:test` over compiled `out/`, driven through the existing `FakeInputBox`
(`src/test/sharePinPrompt.test.ts:19-101`), which already raises `onDidChangeValue` on a programmatic
assignment the way VS Code does — that is exactly the interaction the pre-fill relies on.

Eight new tests, each named for the guarantee and each watched failing first. Rows 1–5 are story 1,
rows 6–8 are story 2:

| # | Test | Fails today because |
|---|---|---|
| 1 | `theBoxOpensWithAPinAlreadyDrawnAndCopied` | `askOnce` opens empty; `box.value` is `''` and the clipboard is untouched |
| 2 | `theDrawnValueIsWhatEnterResolves` | nothing is drawn, so there is no untouched pre-fill to resolve as `generated` |
| 3 | `typingOverTheDrawnPinTakesTheTypedPath` | no pre-fill to type over; asserts the repeat box IS raised, `generated` is false, **and the drawn value is off the clipboard** — the silent row of decision 2 |
| 4 | `escapingWipesTheClipboardItNeverAskedFor` | no wipe exists; also asserts a FOREIGN clipboard value is left alone, and that a cancelled repeat box wipes too |
| 5 | `acceptingAGeneratedPinLeavesTheClipboardAlone` | guards the trap in decision 2 — `hide()` on the accept path must not wipe the value the person is about to paste |
| 6 | `theExportPasswordBoxIsTheSharedBox` | `sealedForm` raises `showInputBox`; asserts the drawn value, both buttons, and that a typed one is confirmed |
| 7 | `aPlainJsonExportSaysNothingAboutAPin` | nothing to announce today; guards the `pin !== undefined` test in decision 6 step 4 |
| 8 | `aCancelledSaveDialogTakesTheExportPasswordWithIt` | no wipe exists; asserts the same for a failed `fs.writeFile` |

Rows 6–8 are wiring tests on the real command module, in the style of `exportPaymentWarning.test.ts`
— which exists precisely because the export direction had only pure tests and nothing proved the
command was wired.

The whole suite must stay green: 3683 tests, 3679 passing, 4 skipped, measured on this branch's base
before any edit.

## Definition of Done

- [ ] Six RED tests watched failing with the real symptom, then green; both observations in the summary.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run ratchet` all green.
- [ ] The box opens drawn, copied, and says so; Escape wipes, Enter does not.
- [ ] `Export / Share Externally…` uses the same box and announces a generated password after the save.
- [ ] `research/module_extension.md` and the five help articles updated.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass.
- [ ] The `coai` gate: a `review_plan` round reached `proceed`, a `review_code` round ran on the
      finished branch, every finding resolved, verdicts and reviewer counts in the summary.
- [ ] This plan promoted to `research/` with its deviations recorded.
