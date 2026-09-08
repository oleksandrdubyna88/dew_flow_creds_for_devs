# PLAN — the share PIN can be generated, and lands on the clipboard ready to paste

> Status: **IMPLEMENTED, 2026-09-08.** Scope: the VS Code extension only —
> `src_vs_code/src/shareInbox.ts`, `src_vs_code/src/commands/shareCommands.ts`, two new modules,
> the share test harness, and the sharing help article in five languages. **No server change, no
> HTTP contract change** (repo rule 6 is not engaged).
>
> Related docs: [module_extension.md](module_extension.md),
> [PLAN_sharing.md](PLAN_sharing.md), [PLAN_generator.md](PLAN_generator.md).
>
> **Superseded in part, the same day, by
> [PLAN_pin_drawn_by_default.md](PLAN_pin_drawn_by_default.md):** the sparkle button this plan
> shipped worked and **nobody found it**, so the PIN is now drawn when the box opens and the button
> is a redraw. That plan also moved this one's module — every `sharePinPrompt.ts` below is
> `transitPinPrompt.ts` today, renamed when the export password started asking through the same box.
> The file names are left as they were written, because this document records what was built on the
> day it was built.

## What shipped differently from this plan

Four deviations, all found while building rather than while planning:

1. **Every `file:line` reference above was verified against the WRONG BRANCH.** The checkout sat on
   `fix/locked-vault-prompt` when the plan was written, and `origin/main` was thirty commits ahead:
   the corporate epics had landed, `shareDelivery.ts` had been extracted, and `deliverBatch` no
   longer calls `sealShare` itself. The design survived unchanged; the coordinates did not. The
   check that would have caught it costs one command — branch first, verify second.
2. **`shareInbox.ts` was 797 lines, not 769** — against a ceiling of 800. The extraction the plan
   argued for on grounds of tidiness was in fact the only option available. It is 769 now.
3. **`announceShared` lives in `sharePinPrompt.ts`**, which the plan described as the module for
   ASKING. Keeping the two halves apart would have split the wording of one promise across two
   files, which is the thing that file exists to prevent; the module's doc comment now says it
   holds the PIN's whole conversation.
4. **The plan named a `Copy again` action and a `Show PIN` modal; both are offered only when the
   PIN was generated**, and `Show PIN` reveals through `showWarningMessage({ modal: true })`. A
   typed PIN gets neither, because offering to re-copy something this extension never held would
   misdescribe where it came from.

Everything else shipped as written, including all ten accepted review-gate findings.

## The symptom

Sharing an entry ends at one box: **One-time share PIN**, `shareInbox.ts:59-72`. It says
*"Encrypts the shared item. Tell it to the recipient out-of-band."* — so the person must now invent
a PIN, type it twice, and then reproduce it by hand into whatever chat window they use to tell the
recipient.

Three things go wrong there, and all three are the same thing:

1. **A human-invented transit PIN is the weakest link in the whole product.** On the server
   transport a share is sealed with `recipientKeyId + pin` where `recipientKeyId` is the
   recipient's **email** — public. `pinPolicy.ts:15-19` says so in its own words: *"There the PIN
   is not half the secret; it is all of it."* `validatePin` refuses the demonstrably weak and
   advises above that, but advice is what people click past.
2. **The PIN then has to be retyped into a chat.** Typing a secret twice into a modal and a third
   time into Slack is where transcription errors live, and a wrong PIN is not a friendly failure —
   the recipient simply cannot open the share.
3. **The generator that solves this already exists and is not wired to any PIN box.**
   `secretGenerator.ts:9` names this exact case in its own doc comment: *"a passphrase for the one
   secret a person does have to type or say aloud (a vault PIN, **a share PIN**)"*. Its only caller
   is the standalone palette command `credSshManager.generateSecret`
   (`commands/entityCommands.ts:159-176`), which already does generate → `copySecret` → notify.

## The goal

In the share-PIN box, one click generates a strong PIN and puts it on the clipboard, so the next
keystroke can be `Ctrl+V` into the chat where the recipient is told.

Decided with the operator before this plan was written:

| question | decision |
|---|---|
| which PIN | the **one-time share PIN** only — not the entry-protection PIN of `pinPrompt.newPin`, whose loss destroys an entry and whose generation therefore has different stakes |
| how it is offered | a **button inside the PIN box** — `window.createInputBox()` with a `QuickInputButton` |
| what is generated | **`generatePassphrase(DEFAULT_PASSPHRASE)`** — 6 words, 48 bits, e.g. `wave-glad-firm-oath-luck-vast` |
| the 45 s clipboard wipe | keep the normal TTL, and give the success notification a **`Copy again`** action so the PIN can never be lost between generating it and pasting it, plus **`Show PIN`** for the read-aloud case |

## Why a passphrase and not a password

`DEFAULT_PASSWORD` is 32 characters of four classes; `DEFAULT_PASSPHRASE` is six four-letter words
at exactly 8 bits each. The password is stronger on paper and worse here, for three reasons that
are all about the PIN's job rather than its entropy:

- It has to survive a **chat round trip** — a client that eats a trailing `~`, a person who
  double-clicks to select and misses a symbol.
- It has to survive being **read aloud**, which is the fallback the prompt itself recommends.
- It has to be **retyped by the recipient** into `askSharePin` (`shareInbox.ts:381-393`) when the
  paste does not survive.

48 bits against an offline attacker at the shipped scrypt cost (`pinPolicy.ts` assumes 0.1 s per
guess) is 2^47 x 0.1 s, about **446,000 years** of average search on one lane. (The first draft of
this plan said "~450 years" — wrong by three orders of magnitude, caught by the review gate. The
number is kept rather than dropped because a later reader will cite it.)

## Design

### New: `src/sharePin.ts` — pure, no `vscode`

This is where the *decisions* live, so they are `node:test` assertions rather than hopeful
comments (repo rule 3).

```ts
export interface SharePin {
  readonly value: string;
  /** True when this extension drew it, false when the person typed it. */
  readonly generated: boolean;
}

export function typedPin(value: string): SharePin;
export function generateSharePin(): SharePin;          // generatePassphrase(DEFAULT_PASSPHRASE)
export function sharePinNotice(pin: SharePin, ttlMs: number): string;
```

`sharePinNotice` is the tail of the delivery message: `''` for a typed PIN (the existing
*"Tell them the PIN out-of-band."* already covers it), and for a generated one the sentence naming
the clipboard promise. It never carries the PIN **value** itself — see *Decided* below.

`generateSharePin` exists as its own named function rather than an inline call because it is the
place the passphrase-not-password policy is written down, and because it makes the one real
correctness risk testable: a generated PIN that `validatePin` would refuse.

### New: `src/sharePinPrompt.ts` — the shell, mirroring `pinPrompt.ts`

Exports `chooseSharePin(): Promise<SharePin | undefined>`. It holds the `createInputBox` wiring and
**the wording**, for the reason `pinPrompt.ts:38-42` gives for its own existence: one place, so the
box cannot come to say two different things.

It is a new module rather than an addition to `shareInbox.ts` because **`shareInbox.ts` is 769
lines against the 800-line ESLint ceiling** (`eslint.config.mjs`) — the machinery does not fit
there. Moving `promptSharePin` and `confirmSharePin` out (`shareInbox.ts:58-87`) buys ~30 lines
back at the same time.

Behaviour:

- title/prompt/`password: true`/`ignoreFocusOut: true` exactly as today;
- **two** buttons: `$(sparkle)` *"Generate a PIN and copy it"* and `$(eye)` / `$(eye-closed)`
  *"Show / hide the PIN"*, which flips `password` so the person can READ what was drawn before
  they send it — the read-aloud case answered at the moment it arises rather than afterwards;
- **generate pressed** → `generateSharePin()` → `await copySecret(vscode.env.clipboard, value)`
  → the box's value is set and `validationMessage` shows the non-blocking `Information` line
  *"Generated — six words, copied to your clipboard."*;
- **the clipboard write is awaited and caught.** `writeText` can reject (no clipboard provider,
  a locked session). On rejection the value still goes into the box, the eye button still reveals
  it, and the line reads *"Generated, but copying failed — reveal it with the eye and copy it by
  hand."* Nothing may later claim a copy that did not happen;
- **editing a generated PIN makes it a typed one.** `onDidChangeValue` compares against the drawn
  string; the moment they differ, `generated` drops to false. This is the single rule that closes
  the divergence three reviewers found independently: without it the box can seal PIN B while the
  clipboard holds PIN A, invisibly, because the box is masked. Dropping the flag re-imposes the
  whole typed path — the repeat box, no `Copy again`, no `Show PIN` — which is exactly right,
  because a hand-edited value IS a typed value;
- **a still-generated PIN skips the repeat box** — there is nothing to mistype;
- a typed PIN keeps both boxes and the mismatch → `undefined` behaviour unchanged.

**The one real hazard of `createInputBox`:** unlike `showInputBox`, it does **not** block Enter on
a validation error — `validationMessage` is display only. The refusals in `pinFeedback(value,
'choosing')` (`pinPolicy.ts:176-186`) must therefore be re-checked in `onDidAccept`, or this change
silently removes the PIN strength floor from the one box where it matters most. This is the
regression the test plan watches red first.

### Changed: threading the answer through

`promptSharePin` returns `string | undefined` today and both call sites feed it straight to
delivery. The success notification is raised inside `deliverBatch` (`shareInbox.ts:180-187`), which
is the only place that knows the share actually went — so it is the only place that can honestly
say "here is the PIN, go paste it". It therefore has to know whether the PIN was generated.

Rather than an optional boolean flag beside a `string`, the `SharePin` record is threaded:

| file:line | change |
|---|---|
| `shareInbox.ts:299` (`askAndDeliver`) | `chooseSharePin()` instead of `this.promptSharePin(true)` |
| `shareInbox.ts:122-126` (`deliverBatch`) | `pin: SharePin`; `sealShare(..., pin.value, ...)` |
| `shareInbox.ts:210-216` (`deliver`) | same parameter type |
| `shareInbox.ts:184-186` | success message gains `sharePinNotice(pin, secretClipboardTtl())` and, when generated, a `Copy again` action that calls `copySecret` again |
| `commands/shareCommands.ts:80` | `chooseSharePin()` — `createForUser` gets the feature for free |
| `test/sharePayment.test.ts:148,172` | `PIN` → `typedPin(PIN)` |

`shareInbox.ts:59` (`promptSharePin(confirm: boolean)`) is **only ever called with `true`** —
verified: the two call sites are `shareInbox.ts:299` and `shareCommands.ts:80`; the accept side has
its own `askSharePin` at `shareInbox.ts:381`. The `confirm` parameter dies with the move rather
than being carried into the new module as an untested branch.

### Changed: the test harness

`src/test/shareWorld.ts:75-125` stubs `vscode` for six suites, and six existing tests drive
`shareNodes` (`shareInbox.test.ts:127,268,287,302,349`, `pinGateHoles.test.ts:158,171`), which
reaches the PIN box. The stub needs `window.createInputBox`, `ThemeIcon`, and `env.clipboard`,
with handles a test can drive (`ui.inputBox.pressGenerate()`, `.accept()`, `.hide()`), plus
`ui.clipboard` to assert what was copied.

### Changed: the user-facing docs

- The sharing help article's `usage` — `helpEn.ts:220` and the same entry in `helpRu.ts`,
  `helpUk.ts`, `helpDe.ts`, `helpEs.ts`. It currently says *"A one-time PIN travels out of band."*
  and must now say the box can draw one.
- `research/module_extension.md` — the sharing section and the clipboard/secret-handling section.

## Decided — the PIN value does NOT go into the notification text

The operator first asked for the PIN to be **shown in the notification** with a `Copy again`
button. One thing in this repository argued against the first half, it was put back to them, and
the decision below is what they settled on.

`withheldNote` (`shareInbox.ts:200-208`) carries this comment, about the very notification this
plan is editing:

> *"Field NAMES only. This reaches a notification, and several UI layers log those."*

VS Code keeps notifications in the Notification Center until dismissed, and the repo's own posture
notes (`module_extension.md:2117-2120`) record that the recovery-code panel has **no copy button at
all** because "a clipboard is read by managers, sync tools and screenshot pipelines."

Two readings, both defensible:

- **Show it.** A share PIN is one-time, transit-only, and is *designed* to be pasted into a chat
  app, which retains it far more durably than a notification does. Seeing it lets the person read
  it aloud when the paste fails, and confirms what they are sending.
- **Do not show it; keep only `Copy again`.** The button holds the value in memory for the
  notification's lifetime and re-copies on demand — which delivers the entire stated requirement
  ("so I can just Ctrl+V") without writing a live PIN into a surface the repo has already
  identified as logged.

**Settled (operator, 2026-09-08): `Copy again` without the value in the text, plus a second
action `Show PIN` that reveals it on demand.** The default stays quiet — nothing durable is
written into a surface this repository has already classified as logged — and the read-aloud case
is one click away rather than impossible. `Show PIN` raises a second information message carrying
the value; that message is the person's own deliberate act, which is the distinction
`withheldNote` was drawing in the first place.

**Revised by the gate — `Show PIN` uses a MODAL, not a second notification.** A reviewer pointed
out that the plan asserted an invariant which its own second button broke: raising the value in an
information message puts it in the very Notification Center the first half was avoiding. So the
reveal is `showWarningMessage(value, { modal: true })` — a dialog, transient, gone when it is
dismissed, never retained in notification history. The invariant now actually holds on both paths.

**Revised by the gate — the clipboard is written TWICE, and the message stops asserting a
present tense.** The 45 s wipe starts at the copy, and an arbitrary amount of time passes between
pressing generate and the share landing (other prompts, a slow transport), so "it is on your
clipboard" could already be false when it is read. On a successful delivery of a generated PIN the
value is copied again, which restarts the window at the moment the person actually goes to paste,
and the sentence is written so it is true either way.

Concretely, the success message becomes:

```
Shared "prod api" with bob@corp.com. Tell them the PIN out-of-band —
copied to your clipboard, which clears in 45s.   [ Copy again ]  [ Show PIN ]
```

Both actions are offered only when `pin.generated` is true. A PIN the person invented is theirs
and needs neither.

## Build order

0. Branch `feat/generated-share-pin` from `origin/main`. **Done.** The checkout was sitting on
   `fix/locked-vault-prompt`, which at that moment was pushed, unmerged and had no open PR; it
   landed on `main` as `e8245b6` while this branch was being written, so the note that once warned
   it was stranded no longer applies. Recorded because the branch this work started from is the
   reason for deviation 1 below.
1. `src/sharePin.ts` + `src/test/sharePin.test.ts` — pure, red → green.
2. Extend `src/test/shareWorld.ts` (and `src/test/vscodeStub.ts` if the new prompt suite needs it)
   with `createInputBox`, `ThemeIcon`, `env.clipboard`.
3. `src/sharePinPrompt.ts` + `src/test/sharePinPrompt.test.ts`; delete `promptSharePin` /
   `confirmSharePin` from `shareInbox.ts`.
4. Thread `SharePin` through `askAndDeliver` / `deliverBatch` / `deliver` /
   `commands/shareCommands.ts`; re-copy on success, and add the `Copy again` action and the
   modal `Show PIN`.
5. Help article in five languages; `research/module_extension.md`.
6. `npm run typecheck`, `npm test`, `npm run package`; promote this plan.

## Test plan

**Pure — `src/test/sharePin.test.ts`:**

1. *A generated share PIN is never one the policy would refuse* — 200 draws, each through
   `validatePin`, all `undefined`. This is the correctness risk that matters: a generated PIN
   rejected by the box that offered it would be an unusable button.
2. *A generated share PIN carries at least 48 bits and six words.*
3. *Two draws differ* — the CSPRNG is actually being drawn from.
4. *A typed PIN's notice never contains the PIN* — the record's `generated: false` branch.
5. *A generated PIN's notice names the clipboard TTL in seconds and does **not** contain the PIN* —
   the assertion that pins the decision above, so a later edit cannot quietly put a live secret
   back into a logged surface.

**Shell — `src/test/sharePinPrompt.test.ts` (via the `vscode` stub):**

6. *Pressing the generate button copies the PIN to the clipboard, and the value it resolves is
   byte-for-byte the value it copied* — one assertion, both halves. From the gate: a wiring error
   could copy A and resolve B, and every separate assertion would still pass while the recipient
   pastes something that cannot open the share.
7. *A generated PIN is not asked for twice* — exactly one box was shown.
8. *A typed PIN is still asked for twice, and a mismatch cancels the share* — resolves `undefined`.
9. **RED FIRST:** *Enter on a PIN the policy refuses does not seal a share.* Written against a
   naive `createInputBox` port with no `onDidAccept` check, watched failing (it will resolve
   `'1234'`), then fixed. This is the regression the API change introduces and the reason this
   test exists before the code.
10. *Escape resolves `undefined` and disposes the box* — no leaked disposable.
11. **RED FIRST:** *Generating and then editing yields a TYPED pin* — press generate, change one
    character, accept: the result carries `generated: false`, the repeat box was shown, and the
    resolved value is the edited one. Written first against an implementation with no
    `onDidChangeValue` comparison, where it resolves `generated: true` and skips the repeat —
    which is the divergence three reviewers found in the plan.
12. *A clipboard that rejects is reported, not hidden* — `writeText` throws, the prompt still
    resolves the generated value, and the validation line says copying failed.
13. *The eye button unmasks and re-masks* — `password` flips, and the value is untouched by it.

**Integration — `src/test/shareInbox.test.ts`:**

14. *After a delivered share with a generated PIN, the notification offers `Copy again` and
    `Show PIN`; pressing the first re-copies the same value, pressing the second reveals it in a
    **modal**, not in a notification.*
15. *The value sealed into the share equals the value on the clipboard* — captured at `sealShare`
    and compared with what the notification re-copied. The end-to-end form of test 6, and the one
    assertion that actually proves the feature works for the recipient.
16. *After a delivered share with a **typed** PIN, the notification offers neither action and
    names no value* — the typed path is unchanged, which is the other half of the decision above.
17. *The success sentence never contains the PIN* — asserted against the message text itself.
18. The six existing `shareNodes` tests stay green against the new stub — the proof the move
    changed no behaviour on the typed path.

## Definition of Done

- [ ] `npm run typecheck` clean; `npm test` green in `src_vs_code` (all suites, not only the new ones).
- [ ] Tests 9 and 11 were **watched failing first**, and the summary reports each failure message
      and its pass.
- [ ] The value copied to the clipboard, the value sealed into the share, and the value
      `Copy again` re-copies are proven to be the same string (tests 6 and 15) — the defect three
      reviewers found in the first draft of this plan.
- [ ] `Show PIN` is a modal, and no code path puts the PIN into a notification's text.
- [ ] ESLint holds: no file over 800 lines (`shareInbox.ts` must come out *below* its current 769),
      no function over 50 lines, no function over complexity 4.
- [ ] `sharePin.ts` imports no `vscode` (repo rule 3).
- [ ] The share-PIN strength floor still blocks Enter — proven by test 9, not by reading the code.
- [ ] The sharing help article updated in **all five** languages.
- [ ] `research/module_extension.md` updated; this plan promoted to `research/` with its deviations
      recorded (`node .claude/rules/shared/tools/plan-lifecycle.mjs`).
- [ ] `node .claude/rules/shared/tools/pin-check.mjs` passes.
- [ ] The `coai` gate: a `review_plan` round reached `proceed` before step 1, a `review_code` round
      ran on the finished branch, every finding resolved with `accept` or a reasoned `reject`.

## What the review gate changed

One `review_plan` round, three vendors, all three answered; verdict `good_enough` (the plan stage
has a one-round budget), 10 findings, **all 10 accepted**. Recorded here because the most valuable
one was found by all three independently and was a real hole:

| # | what it found | what changed |
|---|---|---|
| 1, 7, 10 | the box stays editable after generate, so the sealed PIN can silently diverge from the copied one — and the box is masked, so nobody can see it happen | `onDidChangeValue` drops `generated` to false on any edit, which re-imposes the entire typed path |
| 2 | `Show PIN` put the secret into the same retained surface the default deliberately avoids | the reveal is a **modal**, not a notification |
| 3 | "it is on your clipboard for 45s" can already be false when it is read | the value is re-copied on successful delivery, and the sentence no longer asserts a present tense |
| 4 | the entropy figure was wrong by ~1000x | ~450 years → ~446,000 years |
| 5 | a rejected `writeText` would still be reported as copied | the copy is awaited and caught, and the failure is said out loud |
| 6 | no test proved the copied PIN is the sealed PIN | tests 6 and 15 |
| 8 | generate-then-cancel overwrites the clipboard for a share that never happened | accepted as a known, non-destructive cost of copying at generate time, which is what the feature is for; the re-copy on delivery is the mitigation that matters |
| 9 | no unmask, so a generated PIN could not be read before sending | the `$(eye)` button |

## What the CODE round changed

The code gate answered with 7 of 9 reviewers (both gemini roles failed on a headless permission) and
15 findings, of which **eight were about files this branch does not touch** — the corporate backup
epic, already on main. Verified rather than assumed: `git diff --name-only origin/main...HEAD`
returns eighteen files, none of them under `deploy/` or `.github/`. The gate's worktree appears to
have held a stale `origin/main` as its baseRef, and each of those eight was rejected with that
evidence. Four more described defects the shipped code had already fixed and which this plan had
predicted; three were performance or debouncing advice the design makes moot, because the
generated/typed decision is not taken in `onDidChangeValue` at all.

The round that actually found things was the parallel one — this session's own reviewers, run at the
same time as the gate rather than instead of it, which is what the rule asks for. Two real defects:

1. **`copySecret` was unguarded in `announceShared` and in `Copy again`,** while the identical call
   on the generate button was wrapped. Both run AFTER delivery has succeeded and nothing above them
   catches — `timed()` re-throws — so a locked session would have turned a completed share into a
   generic command failure, and taken down the `Show PIN` offer that was the last route to the PIN.
   The clipboard sentence therefore moved INTO `announceShared`, composed from whether the copy
   actually happened rather than upstream from the intention to try it.
2. **The re-copy did not cancel the first wipe.** Both writes are the same string, so the earlier
   timer found its own value and wiped at the earlier deadline — which made this plan's central
   claim about the 45 s window false in exactly the case it was written for. `copySecret` now clears
   the wipe it supersedes. Watched failing first.

A third, smaller one: pressing Escape on the repeat box announced that the PINs did not match, which
describes a mistake nobody had made. That behaviour was inherited verbatim from the code this plan
moved, and `backupManager.ts` had the correct guard all along. Also watched failing first.

The lesson worth keeping is about the two rounds rather than either finding: the gate's diff was
wrong and its reviewers still produced fourteen confident findings from it. Reading a finding for
whether it is TRUE OF THIS BRANCH, with git rather than with judgement, is the step that made the
difference — and the reviewers that found the two real defects were the ones this session ran
itself.

## Out of scope

- **The entry-protection PIN** (`pinPrompt.newPin`). Same generator, different stakes: that PIN is
  stored nowhere and forgetting it destroys the entry, so "it was on your clipboard for 45 seconds"
  is not an acceptable custody story. A separate plan, if it is wanted at all.
- **Unifying the three "type it twice" implementations** (`shareInbox.promptSharePin`,
  `pinPrompt.newPin`, and the accept-side box). Real duplication, noted by the exploration, but a
  refactor nobody asked for inside a feature change.
- **The extension release.** Shipping is a separate `extension-vX.Y.Z` tag per this repo's release
  doctrine.
