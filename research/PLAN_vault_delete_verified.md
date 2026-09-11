# PLAN — a vault delete that did not happen says so, and keeps the key

> Status: **IMPLEMENTED, 2026-09-11.** Scope as built: `VaultStore.cs`, `OrgMembersStore.cs`,
> `Program.cs` (`DELETE /api/vault`), `serverTransport.ts`, `VaultTests.cs`,
> `serverTransport.test.ts`, `research/module_server.md`, `research/module_tests.md`.
> Audit finding **#4** of [REVIEW_product_audit_2026-09-09.md](../todo/REVIEW_product_audit_2026-09-09.md),
> re-verified 2026-09-10 (§Перепроверка).
>
> Related docs: [module_server.md](module_server.md) (the login key S and why order matters),
> [PLAN_corp_blocking_login_key.md](PLAN_corp_blocking_login_key.md).

## Symptom

`DELETE /api/vault` (`Program.cs:889-917`) promises an order — *the key is removed only once there is no
vault left for it to belong to* (`:908-914`) — and enforces it by sequence alone:

- `VaultStore.DeleteEverythingFor` (`VaultStore.cs:175-188`) returns `void`, swallows `IOException` and
  `UnauthorizedAccessException` without a log line, and takes no `GateFor` — the write path does
  (`TryWriteVaultAsync`, `:72`). Its sibling `OrgMembersStore.RemoveAsync` documents the contrast in its own
  comment: *best-effort like `VaultStore.DeleteEverythingFor`, and unlike it, it says so*.
- The endpoint then removes the member record (`:907`) and the login key S (`:915`) and answers `204`
  (`:917`) unconditionally. `LoginKeyStore.RemoveAsync` (`LoginKeyStore.cs:149-171`) returns `bool` and
  logs at Error; the endpoint discards the `bool`. The comment at `:896` says *the vault decides the
  response* — the vault's method has no way to.
- The route is **self-service**: `RequireCaller` (`:589-603`) checks the token, domain and standing, no
  role. Every developer can reach this path.
- The test suite has `Corp.Undeletable()` (`tests/Corp.cs:188`) for exactly this failure, applied to the
  login key, the member record, a receipt and an inbox (five sites) — never to the vault `.bin`.

Audit reproduction: on Windows, a `.bin` held open without delete sharing; `DeleteEverythingFor` returned
normally and `File.Exists(vaultPath)` stayed `true`. The endpoint continuation was read, not run.

Consequence: a vault that outlives its key is *a vault nobody can OPEN* (`:910-911`) — on a corporate
server every developer wrap is sealed to S. Recovery then depends on escrow (present wherever S is issued,
`OrgEndpoints.cs:725-729`) or on a backup; neither should be the ordinary path out of a locked file.

## What must be true when this is done

1. The deletion reports, per component, what actually happened.
2. If the vault file survived, the login key S is **not** removed, the member record is **not** removed,
   and the response is not a success.
3. Repeating the `DELETE` after the lock clears finishes the job; nothing about the first attempt makes
   the second one harder.
4. A vault write and a vault delete for the same person cannot interleave.

## Design

### 1. `DeleteEverythingForAsync` returns what it did, under the gate

```csharp
public sealed record VaultDeletion(bool VaultGone, bool OwnerGone, bool InboxGone)
{
    public bool Complete => VaultGone && OwnerGone && InboxGone;
}

public async Task<VaultDeletion> DeleteEverythingForAsync(string email, CancellationToken ct)
```

Takes `GateFor(key)` (rule 4). Each component is attempted; a caught `IOException` /
`UnauthorizedAccessException` is logged at **Error naming the person and the path** (the `LoginKeyStore`
shape, `LoginKeyStore.cs:160-168`) and reported `false`; "already absent" is `true`. The sync `void`
overload goes — one caller, and it is the one this plan changes.

### 2. The endpoint gates the rest on `VaultGone`

```
var deleted = await store.DeleteEverythingForAsync(email, ct);
if (!deleted.VaultGone) { 503 + sentence; log; return; }      // nothing else removed
await orgMembers.RemoveAsync(...)                              // unchanged: best-effort, logged
await loginKeys.RemoveAsync(...)                               // unchanged: best-effort, logged
204
```

**503**, not 409 or 500: the failure is the OS holding a file — transient, retryable, nobody's stale copy —
and `RequireCaller` already answers 503 when a record *cannot be read* (`VaultTests.cs:150-153` explains).
The sentence: *"The vault could not be deleted right now (the file is locked or not writable on the
server); nothing else was removed. Try again."* A surviving `.email` sidecar or inbox with the vault gone
keeps today's outcome (204; the admin list shows the leftover, the next `DELETE` removes it) — recorded
as the decision, because the vault is what the caller asked to remove and what the key belongs to.

### 3. The client says what the server said

`serverTransport.ts:452-458` throws `Remote vault delete failed: HTTP 503.` today; it should quote the
server's sentence through the existing `refusalDetail` so the person is told to try again rather than to
look for a bug.

### 4. `module_server.md`

The route's row gains the 503 and the invariant "S is removed only after the vault is gone, checked".
Rule 6 of `CLAUDE.md` (a contract change touches both sides): the status is new, the client is updated in
the same branch.

## Build order

1. RED: `VaultTests.cs` — `AVaultTheOsWillNotReleaseIsReportedAndKeepsItsLoginKey`: corp server; Alice
   PUTs a vault and fetches her login key (so `org/login-keys/<key>.bin` exists); `Corp.Undeletable` on the
   vault `.bin`; `DELETE` → expect 503, vault present, login key present, record present. Today: 204, key
   gone. Windows-only in effect (`Undeletable` strips directory-write on Unix, which blocks the unlink the
   same way — verify on both; the existing helper already runs on both).
2. RED: `ASecondDeleteAfterTheLockClearsFinishesTheJob` → 204, all gone.
3. RED: `VaultStoreTests` (or `VaultTests`) — `DeleteAndWriteForOnePersonDoNotInterleave`: hold
   `GateFor` while a delete is issued; assert the delete waits.
4. Implement 1–2 → GREEN; the existing `AFailedRegistryRemovalDoesNotFailTheVaultDelete` and
   `AClientHangingUpDuringTheDeleteDoesNotAbandonTheRegistryRemoval` stay green.
5. Client sentence; `serverTransport.test.ts` — `'a 503 on delete quotes the server'`.
6. `dotnet build` 0 warnings; server test exe; `npm test`.
7. `module_server.md`; server `CHANGELOG` (if the server keeps one — check `src_minimalapi_server/`).

## Test plan

| Test | Proves |
|---|---|
| locked vault → 503, key + record stay | rules 1, 2 |
| retry → 204, everything gone | rule 3 |
| delete waits on the write gate | rule 4 |
| registry removal fails → still 204 (existing) | scope kept narrow |
| client quotes the 503 sentence | contract, both sides |

## Definition of Done

- [ ] All tests above; RED and GREEN reported.
- [ ] `dotnet build` 0 warnings; server tests and `npm test` green.
- [ ] `module_server.md` documents the 503 and the checked order; client updated in the same branch.
- [ ] `coai` plan → `proceed`, code round run, findings resolved.
- [ ] Promoted to `research/` with deviations recorded.


## What shipped differently

**The gate had to cover MORE than the plan said, and the review gate found it twice.** The plan held
the per-person gate inside `DeleteEverythingForAsync` and released it when the vault deletion
returned. A concurrent `PUT` landing in that window recreates the vault before S is removed — the same
"a vault nobody can open" outcome by a different door. Taken; then the same reviewers pointed at the
next gap, between the key removal and the registry record, which `OrgMembersStore.RemoveAsync`
reacquires the gate for. The whole account deletion is one serialized unit now, which needed
`OrgMembersStore.RemoveWhileGateHeld` beside the gated `RemoveAsync` — a `SemaphoreSlim` is not
re-entrant, and that constraint is documented on both sides so it is not rediscovered.

**"Each component is attempted" contradicted the sentence the refusal sends.** The plan said the
deletion would try every component and report; the 503 says *nothing else was removed*. A reviewer
noticed those cannot both be true. The vault now goes first and ALONE, and a vault that will not go
stops everything — otherwise a retry runs against a state the first attempt already changed.

**The store carries the refusal out instead of logging it.** The plan had `DeleteEverythingForAsync`
logging at Error naming the person and the path. Constructing `VaultStore` with a logger needs the
service provider before the host is built, which the `ASP0000` analyzer refuses — correctly. The
refusal is returned as an `Exception?` and the endpoint, which has a logger and makes the
person-facing decision, writes the line.

**The continuation reports too.** `LoginKeyStore.RemoveAsync` returns a `bool` that the first
implementation discarded, so a key the OS would not unlink was invisible. It is carried out with the
per-component result and named in the leftovers line. The leftover itself stays accepted — a key that
outlives its vault is 300 bytes of ciphertext nobody can use — but an accepted leftover is still one
to report.

**A test of mine was written wrong first, and it is the one worth reading.**
`AWriteCannotSlipBetweenTheVaultDeleteAndTheKeyRemoval` asserted only that the request had not
finished after 250 ms — and it PASSED against the unfixed code, because the endpoint already blocked
further down on the member record's own gate, long after the vault had been deleted ungated. It
asserts what the vault FILE is doing now.

**An existing test changed its arrangement, not its guarantee.**
`AClientHangingUpDuringTheDeleteDoesNotAbandonTheRegistryRemoval` held the gate and waited for the
vault to disappear while holding it — which only worked while the vault delete took no gate. It times
the hang-up off the vault file now, and its comment says why.

## Open tail

- **`Directory.Delete(recursive: true)` on the inbox is synchronous and runs under the gate.** Raised
  three times by the code round. It predates this change and is unchanged by it, and the inbox is
  share items under an hourly maintenance sweep rather than a tree of 100,000 files — but if that ever
  stops being true, the deletion is the request that pays for it.
- **Partial success still answers 204.** A surviving owner sidecar, inbox or login key with the vault
  gone is logged by component and left to the next DELETE. Reviewers asked for 207 or a structured
  body; that is a contract change for a client that reads text, and the existing
  `AFailedRegistryRemovalDoesNotFailTheVaultDelete` asserts the current shape.
