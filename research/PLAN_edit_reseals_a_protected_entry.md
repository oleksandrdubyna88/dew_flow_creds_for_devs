# PLAN — editing a PIN-protected entry leaves its new secret in the clear

> Status: **IMPLEMENTED, 2026-09-29.** Superseded by, and built as phase P3 of,
> [PLAN_entry_pin_keeps_its_promise.md](PLAN_entry_pin_keeps_its_promise.md) (boundary table in §0 below).
> Deviations: the premise of §1 step 1 was false (Edit never asked for the PIN), and §4 step 3's "write, then
> `protectEntity`" was replaced by seal-before-write (R3); the rest are in that plan's §15, its open tail in
> §16. Scope: `src_vs_code/src` —
> `entityEditCommands.ts`, `entityPin.ts`, `pinPrompt.ts`/`pinGate.ts` (how the PIN reaches the save),
> and the tests. Extension only; no HTTP contract.
>
> Found by the automated reviewer on the pull request for
> [PLAN_entry_pin_kind_pick_env_feedback.md](PLAN_entry_pin_kind_pick_env_feedback.md)
> (CWE-200, rated Major), and independently by the agent that implemented it. Not introduced there —
> it predates that work — but that work is what made it visible, and it is why this plan exists
> rather than a line in a summary.

## 0. Superseded — where each part is built now (2026-09-29)

The 2026-09-29 audit found that **§1 step 1 below is false**: `editNode` (`entityEditCommands.ts:34-163`)
never calls `admitEntry`, so the form is NOT opened with the PIN — it opens over envelopes, shows an empty
card, and Save **deletes** the locked payment, second values and login/URL and drops the PIN mark. The
plaintext-on-save defect this plan describes is real and is one of eighteen; all of them are built by
[PLAN_entry_pin_keeps_its_promise.md](PLAN_entry_pin_keeps_its_promise.md). This document is kept as the
record of the design question it asked, and is promoted together with that plan.

| Item of this plan | Built by | How it changed |
|---|---|---|
| §3 where the PIN comes from at save time | the new plan §5.2 | Option (a) taken — as the `pinSession` grant **re-read at Save**, never a PIN captured when the form opened; a missing grant asks again, and a decline keeps the form open. |
| §4 step 3 "`protectEntity` after `applyAdditions`" | the new plan §4 R3, §5.2 | **Replaced**: values are sealed in memory BEFORE they are written (`sealedWriter`), so plaintext never reaches the keychain; `protectEntity` stays only as an idempotent sweep. |
| §3 / §4 step 4 the failure rule | the new plan §5.2 step 7 | Kept: a part-way failure is surfaced; by construction no slot is left in the clear. |
| §4 step 5 share-accept and import | the new plan §5.6 | Share *Update it* is the same defect and is fixed; import writes new entries only and is recorded. |
| §5 `envApply`'s mark-based refusal | the new plan §5.2 step 6 (D5) | Kept, and the edit path now hands it the MARKED details, which it did not. |

Nothing in this plan is built anywhere else.

## 1. The symptom

`protectEntity` (`entityPin.ts:50`) wraps every unwrapped slot of an entry under its PIN. It has
exactly two callers: the explicit command (`pinCommands.ts:287`) and the create path
(`pinOnCreate.ts:186`).

**The edit path has none.** `editNode` (`entityEditCommands.ts`) writes the form's new secrets with
`applyAdditions`, updates the node, applies removals — and never re-seals. So for an entry that is
PIN-protected:

1. The person opens it, is asked for the PIN, and the form shows the decrypted values.
2. They type a new password and save.
3. `applyAdditions` writes that password to SecretStorage **in the clear**.
4. `details.pinProtected` is still `true`, the form's *"PIN — on"* banner still says every secret this
   entry holds is wrapped, and the viewer still asks for the PIN before showing it.

The entry now claims a protection it does not have, and the claim is the dangerous half: a backup, a
sync and an export all carry what is stored, and what is stored is plaintext. Anything that reads the
value directly gets it without the PIN.

## 2. What this is NOT

The environment-variable half is already closed on the branch that found it:
`envApply.automaticFieldRefusal` now refuses on the entry's MARK as well as on the wrap inside the
value, so a binding cannot hand out a protected entry's password while its stored value happens to be
plaintext. That is a guard at one consumer. **It is not a fix**: the plaintext is still on disk, and
every other reader of that slot — the viewer's own reveal, a share, an export, a backup — decides
from the value.

## 3. The design question, which is why this is a plan and not a patch

The PIN is not in `EntityFormValues`. The edit flow asks for it to READ the entry (through
`entryPinGate`), and nothing retains it. So a re-seal needs an answer to: **where does the PIN come
from at save time?**

Three candidates, and the trade is real:

| | how | cost |
|---|---|---|
| **(a) keep the PIN from the open** | the gate that unlocked the entry for the form hands it to the save | the PIN lives in memory for the life of an open form — which is already true of every secret the form is showing, so it adds no new exposure class |
| (b) ask again on save | a second prompt when the entry is protected and a secret changed | a prompt a person did not ask for, on every save, and one they can dismiss — leaving exactly the state this plan is about |
| (c) re-wrap under a PIN the save derives | impossible: the PIN is stored nowhere, by design | — |

**(a) is recommended**, and the reason is the one the form already relies on: an open edit form holds
this entry's plaintext for as long as it is open. Holding the PIN beside it for the same window adds
nothing an attacker did not already have, and it is the only option that makes the save correct
without asking the person a question whose wrong answer is silent damage.

The second question: **what happens when the re-seal fails?** The secret is already written. The
answer must not be "log it": the entry would be marked protected and be plaintext, which is this
defect with extra steps. The save should refuse to complete silently — surface the failure, and say
that the entry's secrets are NOT protected until it succeeds.

## 4. Build order

1. **RED** `entityPin.test.ts` (or a new `editReseals.test.ts`) driving the real `editNode` handler
   over an in-memory vault, in the style of `envSaveNotice.test.ts`: create an entry, protect it with
   a PIN, edit it with a new password, and assert the stored value reads as **locked**
   (`readSecret(...).kind === 'locked'`). It fails today with the new plaintext.
2. Decide (a) and thread the PIN from the gate that opened the form to the save.
3. `protectEntity` after `applyAdditions` and before the node write — it is idempotent by design
   (already-locked slots are left alone, `entityPin.ts:47-49`), so it is safe to call on every save
   of a protected entry.
4. **RED** the failure path: a re-seal that throws leaves the save reporting it, and the person is
   told the entry is not protected.
5. Check the other writers of an entry's secrets the same way — the share ACCEPT path
   (`shareInbox.ts`) and the import path both write secrets into an entry that may be marked
   protected. Each is either already correct or the same defect; say which in the promotion.

## 5. Definition of Done

- [ ] Editing a PIN-protected entry leaves every changed secret wrapped, asserted by a test watched
      failing first against today's code.
- [ ] A failed re-seal is surfaced, and never leaves an entry marked protected with a plaintext value.
- [ ] The share-accept and import paths are checked for the same shape and the answer recorded.
- [ ] `envApply`'s mark-based refusal stays: it is defence in depth, not the fix, and the comment
      there says so.
- [ ] `research/module_extension.md` records the rule — every writer of a protected entry's secret
      re-seals it — in the section on the per-entry PIN.
- [ ] The `coai` gate: a plan round and a code round, both resolved.
