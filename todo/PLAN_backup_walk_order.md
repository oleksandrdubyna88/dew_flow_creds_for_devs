# PLAN — the backup walks a vault before the key it depends on

> Status: **plan only, nothing implemented yet, 2026-09-10.** Scope: `src_minimalapi_server/src/BackupArchive.cs`,
> its tests, `research/module_server.md`.
> Audit finding **#7** of [REVIEW_product_audit_2026-09-09.md](REVIEW_product_audit_2026-09-09.md),
> re-verified 2026-09-10 (§Перепроверка).
>
> Related docs: [module_server.md](../research/module_server.md) (backup, login keys),
> [PLAN_corp_server_backup.md](../research/PLAN_corp_server_backup.md) (why nothing is locked during a walk).

## Symptom

An archive is one live walk of the data directory (`BackupArchive.cs:173-188` → `Walk` `:205-219`,
per-directory ordinal sort `:224-235`), with no snapshot, no lock (`BackupRunner.cs:233-262` never takes
`VaultStore.GateFor`) and no cross-file check in `Verify` (`:106-107` authenticates chunks and names).
The class says so and is right that per-file atomicity is what a rename buys (`:26-30`). What it does not
say is that the walk order runs **against** the one dependency that kills a vault:

- Ordinal order at the top level is `org` → `org-recovery` → `sent` → `shares` → `vaults`; inside `org`,
  `login-keys` comes right after `events`. So the login keys are read near the start of the archive and
  the vaults at the very end — the exposed window is most of the run, not an instant.
- A developer's first login mints S create-if-absent (`LoginKeyStore.GetOrMintAsync`, `:98-123`, wired
  to `GET /api/org/login-key` at `OrgEndpoints.cs:747-770`), and their first vault write follows. Land
  both after the walk has passed `org/login-keys/` and before it reaches `vaults/`, and the archive holds
  a vault with no S.
- On a restore from that archive, the developer's next login finds no key and **mints a new one** —
  silently, by the same create-if-absent path — and *every wrap already sealed to the old S becomes
  unopenable* (`LoginKeyStore.cs:56-58`, the class's own warning). No administrator is asked anything.
- Mitigant, verified: S is only issued where `OrgRecovery.Enabled` (`OrgEndpoints.cs:725-729`), so such
  a deployment also has officer escrow — the vault is recoverable through break-glass, not dead. It is
  still a backup that restores a person into a lockout.

Audit reproduction on the real `CreateFile`/`Verify`/`Extract`: two dependent files swapped through
`onEntry` between the key directory and the vault directory; `Verify` passed; the extracted pair mixed
generations.

## What must be true when this is done

Every `vaults/<key>.bin` in an archive is accompanied by the `org/login-keys/<key>.bin` it is sealed to,
whenever that key existed at any moment of the walk — with no lock, no snapshot, and no change to what a
restore does.

## Design

Walk **`vaults/` first**, then the rest of the tree in today's ordinal order. This is enough because the
dependency is monotone:

- S is created **before** any vault sealed to it can be written (the client fetches S to seal its wraps);
- S is **never rotated in place** — `GetOrMintAsync` mints only when absent, and the only removal is the
  account deletion route (`LoginKeyStore.RemoveAsync`), after which there is no vault either.

So a vault captured at time *t* depends on an S that already existed at *t*, and `org/login-keys/` is
enumerated after *t*. The same monotonicity holds for the other files a vault sits beside: a member record
without a vault is the documented harmless state (`Program.cs:896-898`), and the org-recovery escrow wrap
lives *inside* the vault envelope. **Checked and recorded as the condition under which this ordering must
be revisited:** the recovery roster (`org-recovery/`) is create-once per ceremony today; the cheap
roster rotation in [PLAN_org_recovery_tail.md](PLAN_org_recovery_tail.md) is unbuilt, and when it lands
the roster becomes a file a vault can depend on that *can* change — that plan owns the question then.

Implementation: `Tree(root)` yields the `vaults` subtree (when present) before `Walk(root, root)` with
`vaults` skipped at the top level. Per-directory sort is unchanged, so the archive of a given tree is still
the same archive twice — the top-level order is fixed, just not ordinal. The class remarks say why.

**Not done, and why** (the audit's other proposals): a filesystem snapshot or a mutation pause needs a
platform we do not have or a lock the design refused for a reason (`PLAN_corp_server_backup.md`); an
automatic `Verify` after `CreateFile` checks bytes, which is not this defect; a dependency-aware verify is
the *"restore proven on a stand"* item of [PLAN_product_improvements.md](PLAN_product_improvements.md)
§2, and stays there. This plan removes the one dependency that turns an archive into a lockout.

## Build order

1. RED: `BackupArchiveTests.cs` — `AKeyMintedWhileTheWalkIsInsideOrgStillAccompaniesItsVault`: tree with
   `org/events/…`, `org/login-keys/old.bin`, `org/members/…`, `shares/…`, `vaults/old.bin`; `onEntry` fires
   once, on the first entry under `org/members/`, and writes `org/login-keys/new.bin` and
   `vaults/new.bin` (temp + rename, as the store does); `Extract`; assert **for every** `vaults/*.bin`
   present, `org/login-keys/<same>.bin` is present. Today: the vault is captured (walked later), the key is
   not (already passed) → RED with the invariant's own sentence.
2. The same test parameterised on the trigger point — `org/members/`, `shares/`, first entry of `vaults/`,
   last entry before `vaults/` — asserting the invariant at each. (After the fix: at `org/members/` neither
   file is captured; at `vaults/` first entry the vault list is already materialised so neither is; the key
   alone may appear, which is the harmless direction.)
3. `Tree` reorder → GREEN; `AnArchiveRoundTripsTheTreeByteForByte` and the determinism test stay green.
4. `dotnet build` 0 warnings; server test exe.
5. `module_server.md` backup section: the order and the invariant it keeps; the roster condition.

## Test plan

| Test | Proves |
|---|---|
| mint during `org/members/` → invariant holds | the fix |
| mint during `shares/` → holds | window closed for the whole tail |
| mint at first / last `vaults/` entry → holds | the materialised listing |
| round trip byte-for-byte (existing) | nothing else moved |
| same tree → same archive (existing determinism) | order is fixed |

## Definition of Done

- [ ] All tests above; the RED sentence and the GREEN run reported.
- [ ] `dotnet build` 0 warnings; server tests green.
- [ ] `module_server.md` documents the walk order, the invariant, and the roster condition.
- [ ] `coai` plan → `proceed`, code round run, findings resolved.
- [ ] Promoted to `research/` with deviations recorded.
