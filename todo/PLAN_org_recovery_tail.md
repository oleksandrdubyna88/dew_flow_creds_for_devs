# PLAN — what corporate recovery left: a live rehearsal, and cheap roster rotation

> Status: **plan only, nothing implemented yet.** Scope: the two items
> [PLAN_org_recovery.md](../research/PLAN_org_recovery.md) shipped without — one a verification it
> deliberately deferred, one a feature it deliberately did not build.
>
> Related docs: [module_server.md](../research/module_server.md),
> [module_extension.md](../research/module_extension.md).

## The symptom

Corporate recovery is built, tested on both halves, and **has never been run by three people on
three machines**. Every part has tests; the whole has none, and the parts that a live run
exercises — the out-of-band PIN, an officer on a second machine, the target's own client meeting a
vault that was re-keyed under them — are exactly the parts a unit test cannot reach.

Separately, one thing the parent plan named as a risk and then declined to solve: **a Shamir share
cannot be selectively revoked.** An officer who leaves keeps a mathematically valid share, so the
only answer today is a *hard* rotation — generate a new keypair, run the whole ceremony again, and
let every vault re-seal on its next write. That works and is correct; it is also five people's
afternoon for what should be an administrative edit.

## Item 1 — the rehearsal (the parent's own DoD, unpaid)

Three officers on three machines, one target account, against a real server with
`Vault:CorpRecovery:OfficerEmails` set. The steps are in
[PLAN_org_recovery.md](../research/PLAN_org_recovery.md) §Ceremonies; what the rehearsal is FOR is
the questions tests cannot ask:

- Does the one-time PIN survive being read aloud? (It is typed by a human who did not generate it.)
- Does an officer who accepts on machine A and contributes from machine B work — the share is in
  SecretStorage, which does **not** sync, so the honest answer may be "no, and the panel must say
  so per machine".
- What does the TARGET see afterwards? Their vault is re-keyed under a PIN they do not know yet.
  The parent plan asserts they meet a locked vault; nobody has watched it happen.
- Does the audit line say something a non-participant can act on?

**Write down what it teaches, including the parts that work.** A rehearsal recorded only when it
fails is a rehearsal nobody can cite later.

## Item 2 — roster rotation without a fresh ceremony

The design already exists as a sketch in the parent (`sessionKind: 'key-rotation'`): a quorum
reconstructs the org private key exactly as a break-glass does, then **re-splits the same key**
against the new roster and delivers fresh invites — instead of minting a new keypair and forcing
every vault on the server to re-seal.

The trade to decide before building it, because it is not obviously the right answer:

| | hard rotation (today) | re-split (this item) |
|---|---|---|
| A departed officer's old share | worthless — the key it rebuilds is gone | **still valid**, because the key did not change |
| Every vault must re-seal | yes, on next write | no |
| Ceremony cost | full, five people | a quorum plus new invites |

So a re-split is the right move for *adding* an officer and the wrong one for *removing* a
compromised one. It must therefore refuse to be used for a removal, or say very plainly that it is
not a revocation — the failure mode otherwise is an operator who believes they removed somebody.

## Build order

1. Item 1 first, and record it — it may change what item 2 should be.
2. `sessionKind` on `RecoverySession`, with `targetEmail` absent for a rotation.
3. The client half: reconstruct → `mintShareSet` against the new roster → invites → publish under
   the SAME public key with a new `setupId`.
4. The refusal: a re-split whose new roster is a strict subset of the old one is either blocked or
   carries an explicit "this does not revoke anybody" confirmation.

## Test plan

- Server: a rotation session needs no `targetEmail` and never serves a target vault; the audit
  records `kind: "roster-rotation"` distinctly from a recovery.
- Client: a re-split produces shares that rebuild the SAME key (so existing escrow wraps still
  open) and a NEW integrity tag bound to the new roster shape.
- The removal refusal, with the message asserted rather than the branch.

## Definition of Done

- [ ] The rehearsal has been run and written up in `research/`, including what worked.
- [ ] Whether an officer can contribute from a second machine is answered in the docs either way.
- [ ] Rotation ships with its "this is not a revocation" refusal, or is recorded as refuted.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` passes.
