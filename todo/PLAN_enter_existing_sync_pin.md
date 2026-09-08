# PLAN — a machine can only ADOPT a Sync PIN by changing it for everyone

> Status: **plan only, nothing implemented yet, 2026-09-08.** Scope: `src_vs_code/src/syncManager.ts`,
> `src_vs_code/src/vaultKeys.ts`, `src_vs_code/package.json` (one command), plus tests.
>
> Extracted from [PLAN_locked_vault_prompt.md](../research/PLAN_locked_vault_prompt.md), which fixed
> WHICH button a locked vault is offered and deliberately left this — the thing the button does.

## The gap

There is exactly one route by which a Sync PIN reaches a machine: `credSshManager.setSyncPin` →
`SyncManager.setPin` (`syncManager.ts:198`). It asks for a PIN with
`pinValidator('choosing')` — the strength rules for a NEW secret — and then calls `rekeyToNewPin`
(`syncManager.ts:256`), which unlocks the vault, re-wraps it under the typed PIN and **writes the
vault back to the sync location**.

That is right for *changing* a PIN. It is wrong for the far more common case: a second machine
(or a re-installed one, or one whose keychain was reset) where the person knows the account's
existing PIN and wants this machine to remember it. What they need is
"verify this PIN opens the vault, then store it" — `vaultKeys.savePin` (`vaultKeys.ts:210`) already
being the second half. Today the only way to get there rewrites the remote for everybody.

It is survivable when the typed PIN is the same as the existing one: the vault is re-wrapped with
fresh salt under the same secret, and other machines keep opening it. It is destructive on a typo,
and it is a needless remote write in every case — over a vault whose merge cycle is the most
consequential code in the extension.

## Symptom in the wild

The locked-vault notification offers **Set Sync PIN…** to a machine with no stored PIN. That is the
correct offer — background sync genuinely cannot run unattended there — and the only command behind
it is the re-key. So the fix for "this machine does not know the PIN yet" is currently a fleet-wide
credential rotation.

## What must be true when this is done

1. A machine with no stored PIN can adopt the account's existing PIN **without any write** to the
   sync location.
2. A wrong PIN is refused with a sentence that says so, and nothing is stored.
3. Changing the PIN for the fleet remains possible, is a separate, clearly-named action, and still
   re-keys.
4. The locked-vault notification's second button routes to *adopt*, not to *change* — which is what
   makes this plan the completion of the other one.
5. `pinValidator('entering')` is used for an existing PIN; the "choosing" strength rules apply only
   where a new secret is being chosen.

## Sketch

- `SyncManager.adoptPin(account)`: read the remote envelope, ask for the PIN with
  `promptPin`-style validation, attempt `unlock` against it, and on success `keys.savePin`. On
  failure, the existing `wrong-password` `BackupError` already carries the right message.
- Two commands where there is one: `CredsForDevs: Use This Account's Sync PIN…` (adopt) and the
  existing `Set Sync PIN` (change, re-key). The readiness fix for `notConfigured` / `needsPerson`
  points at ADOPT.
- `lockedButtons`' `setPin` action becomes `adoptPin` for the notification, leaving the re-key to
  the palette. Rename the enum member with it — a button named for a destructive verb is what
  started this.

## Test plan

| test | asserts |
|---|---|
| adopting the correct PIN stores it and writes nothing to the transport | `writes` is empty, `savePin` was called |
| adopting a WRONG PIN stores nothing and says why | no `savePin`, the wrong-password message |
| changing the PIN still re-keys and writes | unchanged behaviour of `setPin` |
| the locked-vault notification's second button routes to adopt | the offer's action names adopt |

## Definition of Done

- [ ] Adopting a PIN performs no remote write, proven by a test over the transport stub.
- [ ] The re-key path is unchanged and still tested.
- [ ] `research/module_extension.md` describes the two routes and which one each surface offers.
- [ ] The `coai` gate ran on plan and code.
