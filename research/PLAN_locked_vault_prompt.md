# PLAN — the locked-vault notification offers to CHANGE the PIN instead of unlocking

> Status: **IMPLEMENTED, 2026-09-08.** Scope as built: `src_vs_code/src/lockedNotice.ts`,
> `src_vs_code/src/lockedVaultPrompt.ts` (new), `src_vs_code/src/syncManager.ts`,
> `src_vs_code/src/syncReadiness.ts`, and four test files.
>
> Related docs: [module_extension.md](module_extension.md), [architecture.md](architecture.md).
> Open tail: [PLAN_enter_existing_sync_pin.md](../todo/PLAN_enter_existing_sync_pin.md) — the
> *Out of scope* item below, extracted as its own plan.

## Deviations from the plan

1. **A new module was needed, and the linter is what said so.** The plan kept the offer inside
   `syncManager.ts`. The edit pushed that file to 818 lines against an 800-line ESLint ceiling, so
   the whole surface — `reportLockedVaults`, `showUnlockOffer`, `offerUnlock`, `storedPinAnswer`,
   `pickAndUnlock` — moved to `lockedVaultPrompt.ts`. It is the better shape for the reason this
   defect existed at all: inside the manager the offer was unreachable from a test, which is how it
   came to disagree with the readiness icon. It now has eight tests of its own, covering what
   pressing each button actually does — behaviour nothing asserted before.
2. **`hasStoredPin` became a tri-state.** The first draft degraded a failed keychain lookup to
   "no PIN stored", which surfaces the destructive button on a machine whose PIN is fine. Two
   review-gate vendors raised it independently; `StoredPinAnswer = 'yes' | 'no' | 'unknown'` is the
   answer, with `unknown` treated as `yes`.
3. **`syncReadiness` was brought in.** The plan claimed the two surfaces would stop disagreeing but
   changed only one of them — also caught by the gate. Its `isLocked` branch now takes its label
   from `LOCKED_BUTTON_LABELS.unlock`, and a test asserts the icon and the popup name the action
   identically.
4. **A third literal was already there.** The multi-vault message had its own `'Unlock…'` string
   (twice, as label and as comparison). It reads from the shared constant now.
5. **Twenty tests, not four** — three in `syncManager.test.ts`, four in `lockedNotice.test.ts`,
   one in `syncReadiness.test.ts`, twelve in the new `lockedVaultPrompt.test.ts`.
6. **The code round added a failure mode nobody had thought about: a keychain that HANGS.** The
   notification is raised after the lookup, and `warnedAccounts` has already deduped the account
   by then — so a lookup that never settles meant no offer at all, and nothing asking again until
   the window was reloaded. The lookup is bounded at 5 s now (`withTimeout`, extracted from
   `credsAgentServer` where it was private, rather than written a second time) and a timeout
   counts as `unknown`. Three more of its findings were about the same shape of defect: the
   multi-vault chain is detached and had no catch, a refused lookup was silently swallowed, and an
   abandoned "which vault" pick left no trace. All four are now logged; three of its twelve
   findings were rejected with reasons — `architecture.md` does not describe extension-internal
   modules, one finding's own analysis concluded no change was needed, and a "disposal check" would
   have added lifecycle semantics `SyncManager` does not have.

## The symptom

Auto-sync raises this notification:

```
⚠ Auto-sync: the vault of <email> is locked on this machine.
        [ Set Sync PIN ]  [ Unlock with Security Key ]
```

The vault is locked because somebody pressed **Lock Vaults**, or because auto-lock elapsed. The
Sync PIN is already set on this machine and has not changed. The person is nevertheless offered,
as the FIRST button, to set a Sync PIN they already set — and the button that actually answers
the situation is labelled as if it needed a security key, which most vaults here do not have.

## Why it happens

1. A background cycle calls `unlock(..., { interactive: false })`. While the vault is locked,
   [vaultKeys.ts:353](../src_vs_code/src/vaultKeys.ts#L353) refuses **every** silent route —
   including the stored Sync PIN, deliberately, because otherwise Lock protects nothing on the
   unattended machine it exists for. So a machine with a perfectly good stored PIN reports
   "locked", which is correct.
2. The report reaches [`offerUnlock`](../src_vs_code/src/syncManager.ts#L744), and that method
   shows **both buttons unconditionally** — it asks nothing about the account's state.
3. The verdict it should have asked for already exists and is already right:
   [syncReadiness.ts:52-59](../src_vs_code/src/syncReadiness.ts#L52-L59) answers `isLocked` with
   `fixLabel: 'Unlock'`, and its own comment says why —
   *"telling somebody to set a PIN they already set … is how a status line loses its credibility"*.
   Two surfaces answering one question, and only one of them was taught the answer.

### It is not only a wrong label

`Set Sync PIN` runs [`setPin`](../src_vs_code/src/syncManager.ts#L198) →
[`rekeyToNewPin`](../src_vs_code/src/syncManager.ts#L256): the vault is **re-wrapped under a new
PIN and written back to the sync location**. Every other machine then fails to open it until the
same new PIN is typed there — which is the failure text at
[syncManager.ts:62](../src_vs_code/src/syncManager.ts#L62). So the first button of a
"your vault is locked" popup is a fleet-wide credential rotation, offered to somebody whose
actual problem is that a timer elapsed.

### And the second label is wrong too

`Unlock with Security Key` runs `credSshManager.unlockWithSecurityKey`, which despite its name is
the **general** unlock: [keyCommands.ts:354](../src_vs_code/src/commands/keyCommands.ts#L354) calls
`vaultKeys.unlock(..., { interactive: true })`, and [unlockPlan](../src_vs_code/src/unlockPlan.ts)
then decides between a key touch, a typed PIN, or a choice between them. A person with no security
key reads that button as "not for me" and presses the other one — the destructive one.

## What must be true when this is done

1. A locked vault whose Sync PIN **is** stored on this machine is offered exactly one action:
   unlock. No PIN change is proposed for a state that is not a PIN problem.
2. A locked vault with **no** stored Sync PIN keeps both offers — background sync genuinely cannot
   run unattended there, and setting the PIN is the fix — but unlock comes **first**.
3. The unlock button is not labelled as security-key-only, because the command behind it is not.
4. The popup and the readiness icon can no longer disagree: the decision is one pure function,
   tested on its own, in the module that already owns this notification's wording, and
   `syncReadiness` takes the unlock offer's wording from that same place rather than repeating it.
5. **A keychain that will not answer does not surface the destructive button.** "Is a PIN stored"
   has three answers, not two, and the unknown one must degrade towards *unlock only* — an OS
   keychain hiccup on a machine whose PIN is perfectly fine must never put a fleet-wide re-key one
   click away. (Raised by the review gate, by two vendors independently, against this plan's first
   draft, which degraded the other way.)

## Out of scope (recorded, not fixed here)

- **`setPin` always re-keys.** Even for somebody whose PIN is simply not stored on THIS machine,
  the only route offered re-wraps the vault and rewrites the remote. What that person needs is
  "enter the existing PIN and remember it", which does not exist as a command. That is a real gap,
  it is not what this notification's defect is, and mixing it in would put a vault rewrite inside a
  fix about button labels. → follow-up plan.
- The palette title of `credSshManager.unlockWithSecurityKey` ("Unlock Vault (Security Key)…") is
  misleading in the same way, but renaming it touches `README.md` and five translated help pages;
  it is a documentation change with its own review, not a rider on this one.

## Build order

1. **`lockedNotice.ts`** — add the pure decision beside the pure wording it already owns:

   ```ts
   export type LockedButton = 'unlock' | 'setPin';
   export const LOCKED_BUTTON_LABELS: Readonly<Record<LockedButton, string>>;
   export function lockedButtons(facts: { hasStoredPin: boolean }): readonly LockedButton[];
   ```

   `hasStoredPin: true` → `['unlock']`. `false` → `['unlock', 'setPin']`. Labels: `Unlock…` and
   `Set Sync PIN…`.

   `hasStoredPin` is a **tri-state**, not a boolean: `'yes' | 'no' | 'unknown'`, and `'unknown'`
   returns `['unlock']` — the same as `'yes'`. A lookup that failed is not evidence that no PIN is
   stored, and the two are only interchangeable if the extra offer is harmless, which this one is
   not.

2. **`syncReadiness.ts`** — the `isLocked` branch takes its `fixLabel` from
   `LOCKED_BUTTON_LABELS.unlock` instead of repeating the word. One constant, so the icon's action
   and the popup's first button cannot drift apart; a test asserts they are the same string.

3. **`syncManager.ts`** — `offerUnlock` becomes async, asks
   [`vaultKeys.storedPin`](../src_vs_code/src/vaultKeys.ts#L201) for the one fact, maps the buttons
   through `LOCKED_BUTTON_LABELS`, and dispatches by the returned button rather than by a literal.
   A `storedPin` that throws (a keychain that will not open) yields `'unknown'` → **unlock only**.
   The method never rejects, so its fire-and-forget callers cannot raise an unhandled rejection;
   the popup is already shown at most once per account per session by `noteLocked`'s
   `warnedAccounts` guard, so no further de-duplication is added. Complexity stays ≤ 4 (the repo's
   ESLint limit) by keeping the fact-gathering in its own small method. `reportLocked` and
   `pickAndUnlock` call it with `void`.

4. **Tests** — one at the notification level (the symptom), one at the pure level (the rule).

## Test plan

RED first, both watched failing before any production edit.

| test | file | asserts |
|---|---|---|
| a locked vault whose PIN is stored is offered Unlock and no PIN change | `test/syncManager.test.ts` | the buttons handed to `showWarningMessage` are exactly `['Unlock…']` |
| a locked vault with no stored PIN is still offered to set one, second | `test/syncManager.test.ts` | buttons are `['Unlock…', 'Set Sync PIN…']` in that order |
| a keychain that THROWS does not offer the re-key | `test/syncManager.test.ts` | buttons are `['Unlock…']`, and the cycle does not reject |
| `lockedButtons` drops the PIN offer when a PIN is stored | `test/lockedNotice.test.ts` | `['unlock']` |
| `lockedButtons` offers both, unlock first, when none is stored | `test/lockedNotice.test.ts` | `['unlock', 'setPin']` |
| an UNKNOWN stored-PIN answer is treated like a stored one | `test/lockedNotice.test.ts` | `['unlock']` |
| the readiness icon and the popup name the unlock action identically | `test/syncReadiness.test.ts` | `syncReadiness({isLocked:true,…}).fixLabel === LOCKED_BUTTON_LABELS.unlock` |

The existing world stub in `syncManager.test.ts` records only the message text, so it grows a
`prompts` list of `{ message, buttons }`; the `keys` stub grows `storedPin`. Both are additive —
no existing assertion changes meaning.

Expected RED: the first test fails with the buttons containing `Set Sync PIN`, which is the defect
itself and not a setup error.

## Definition of Done

- [ ] Both new `syncManager` tests were watched failing with the real symptom, then passing.
- [ ] `npm run typecheck` and `npm test` in `src_vs_code` are green; the failure message and the
      pass are both reported in the summary.
- [ ] `npm run lint` clean — complexity ≤ 4 held without a new `eslint-disable`.
- [ ] `research/module_extension.md` records the notification's two-state offer.
- [ ] The follow-up for "enter an existing PIN without re-keying" exists as its own `todo/` plan.
- [ ] This plan is promoted to `research/` with `IMPLEMENTED <date>` and its deviations, and
      `todo/README.md` matches the folder.
- [ ] The `coai` gate: `review_plan` reached `proceed` before implementation, `review_code` ran on
      the finished branch, every finding resolved.
