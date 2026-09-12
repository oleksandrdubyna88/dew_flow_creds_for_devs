# PLAN — editing a PIN-protected entry leaves its new secret in the clear

> Status: **plan only, nothing implemented yet, 2026-09-12.** Scope: `src_vs_code/src` —
> `entityEditCommands.ts`, `entityPin.ts`, `pinPrompt.ts`/`pinGate.ts` (how the PIN reaches the save),
> and the tests. Extension only; no HTTP contract.
>
> Found by the automated reviewer on the pull request for
> [PLAN_entry_pin_kind_pick_env_feedback.md](../research/PLAN_entry_pin_kind_pick_env_feedback.md)
> (CWE-200, rated Major), and independently by the agent that implemented it. Not introduced there —
> it predates that work — but that work is what made it visible, and it is why this plan exists
> rather than a line in a summary.

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
