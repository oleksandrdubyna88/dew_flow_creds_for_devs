# PLAN — epic 2: blocking, and the login key that makes a copied dev vault dead

> Status: **plan only, nothing implemented yet, 2026-09-04.** Scope: an admin can deactivate a
> colleague and every door shuts the same minute — the server refuses them, their pending shares are
> withdrawn in both directions, and their vault file stops opening even for someone holding the PIN.
> That last part is the login key: a server-held factor folded into a dev's wraps. Second of five
> epics under [PLAN_corp_control_plane.md](PLAN_corp_control_plane.md), which holds the owner
> decisions, the invariants and the shared shapes.
>
> Depends on [PLAN_corp_registry_roles.md](PLAN_corp_registry_roles.md) for the registry, the roles
> and `RequireAdmin`. **This epic reworks the sentence `architecture.md:51` opens with** — see
> *The rule that changes*.
>
> Related docs: [module_server.md](../research/module_server.md),
> [module_extension.md](../research/module_extension.md) §Cryptography,
> [PLAN_org_recovery.md](../research/PLAN_org_recovery.md),
> [PLAN_recovery_code_wrap.md](../research/PLAN_recovery_code_wrap.md),
> [SECURITY_REVIEW_2026-08-24.md](../research/SECURITY_REVIEW_2026-08-24.md) (M-1, the offline PIN
> attack that sets the bar here).

## The symptom

Someone leaves. Today the company can do two things: wait for the identity provider to stop issuing
them tokens, and delete their vault (`Program.cs:634-641`), which also erases what the company may
still need. Neither touches the thing that actually walked out of the building — **a copy of the
vault file**.

That file opens offline. Its wraps are self-contained: `wrapWithPin` derives its key from
`scrypt(accountId + PIN)` (`src_vs_code/src/keyWrap.ts:128-140`), and `accountId` is in the file's
own plaintext header, so anyone holding the file and the PIN opens it on any machine, forever, with
no network. `unlockInner` (`src_vs_code/src/vaultKeys.ts:258-395`) never contacts a server; the
server only ever delivered the bytes. The 2026-08-24 review's finding M-1 already says this blob is
attacked offline and unthrottled, which is why the PIN floor was raised past the online-authenticator
standard. A PIN floor is the right answer to guessing. It is not an answer to a person who knows the
PIN because it was theirs.

Second symptom, smaller and immediate: a share sent an hour before the block sits in the inbox and
is still openable, and the sender has no way to learn that the person it was addressed to is gone.

## What this epic delivers

1. **`active: false`** refuses every authenticated request from that email, with a machine-readable
   reason header so a client can tell "deactivated" from "wrong domain".
2. **Pending shares withdrawn in both directions** at the moment of the block, with the sender told
   why, once, and the row then dismissible.
3. **The login key S** — 32 random bytes per person, held by the server, issued only to an active
   dev, folded into that dev's PIN and security-key wraps. Without S the file does not open.
4. **Rotation on unblock**, so a copy of the old S is worthless.
5. **The offline lease** — how long an honest client keeps working without hearing from the server.
6. **The export, backup and clone bans for devs**, gated in the menus *and* in the handlers.
7. **The recovery code closed for devs** — the wrap stripped and the commands refused — because a
   printed code opens the file with no PIN and no S, which is the same door by another name.

## The rule that changes

> `research/architecture.md:51` — "The server never holds a key that opens a vault" — becomes
> **"The server never holds enough to open a vault alone."** The README's comparison table and
> `CLAUDE.md` rule 1 gain the same qualification, citing this plan.

Why this is safe to state and dangerous to state loosely:

- S is **one factor of two**. The wrap key is `HKDF(scrypt(accountId + PIN) ‖ S)`. The server never
  sees the PIN and never sees the master key.
- What a server operator gains: with S and a stolen blob they can attack the PIN offline. **They can
  do that today** against the plain `pin` wrap, with no S at all. The operator's position is
  unchanged; this is worth saying in the module doc, because a reader will otherwise assume the
  opposite.
- What a *thief of the file alone* loses: everything. That is the entire point of the epic.
- S is not a backdoor into a member's or an admin's vault: only dev roles are bound. A dev promoted
  to member unbinds at the next sync.

Both sentences — "one factor of two" and "the operator could already do this" — go into
`module_server.md` and `module_extension.md` in the same commit as the code, because an unexplained
weakening of the product's founding sentence is how a future contributor decides the boundary is
negotiable.

## Decisions taken here, with their reasons

**The `active` check lives inside the caller gate, not in new middleware.** Every endpoint already
opens with `RequireCaller` (`Program.cs:445-459`), so it is the choke point. It becomes
`RequireActiveCaller`, an async sibling that resolves the caller, consults the registry and answers
`403` through the existing `Fail` helper (`Program.cs:465-469`); the old sync `RequireCaller` stays
for the two places that must not consult the registry. **Epic 1 must expose a synchronous
`Find(email)` over an in-memory cache** — see *Contract with epic 1* below — or every one of the
~17 call sites becomes async for a disk read on the hot path.

**The refusal carries `X-Creds-Reason: account-deactivated`.** A client that must lock the account
and purge local key material cannot be asked to match on English prose, and a 403 for a disallowed
domain must stay distinguishable from a 403 for a blocked person.

**The rate limiter is untouched.** It partitions on the email before the gate runs
(`Program.cs:190-205`, ordering at `:424-442`); a blocked caller keeps their own bucket, because
moving them to a shared one lets their retries punish everybody else.

**A missing KEK degrades the feature, it does not stop the server.** `module_server.md:395-422`
records this exact lesson from the officer roster: refusing to boot over an optional feature took
ordinary vault sync down for everyone. So corp mode with no `Vault:LoginKey:Kek` logs at **Error**
at startup, `GET /api/org/login-key` answers `503`, and member and admin accounts sync as normal.
The property that must hold is narrower than availability: **no wrap is ever bound to an S the
server cannot reproduce** — which is a client-side check on the fingerprint, not a boot refusal.

**S is minted once and returned, not re-minted per call.** A second call returns the same bytes,
under the striped lock (`VaultStore.cs:115-119`) so two windows cannot mint twice. Rotation is a
deliberate delete, and only on the `false → true` transition.

**Nothing about S is ever logged.** The lines are "login key issued for {email}" and "login key
revoked for {email} (unblock)". `module_server.md` already states that no secret, token or ciphertext
reaches a log; this is the first feature that could break it by accident.

**The wrap carries a flag, not a new kind.** `KeyWrap` gains `serverBound?: boolean` and
`loginKeyFingerprint?: string`, following `rpId`'s precedent (`keyWrap.ts:70-71`). New kinds
(`server-pin`, `server-webauthn`) would fork every kind-dispatch site — `hasPinWrap`,
`removeWrap(wraps, 'webauthn', id)`, `hasVaultKeyedWrap` (`keyWrap.ts:444-446`) — into parallel
branches that must be kept in step by hand. A boolean composes with the dispatch that already
exists, and an older build carries it untouched through `isKeyWrap`'s structural guard, which is the
forward-compatibility rule `module_extension.md` records as a live defect once already.

**The recovery code is the door this epic would otherwise leave open, and closing it takes three
things, not one sentence.** A `recovery` wrap (`keyWrap.ts:226-227`, constant id `'recovery'`)
opens the master key from HKDF over the printed code alone — no PIN, no S, no network. A dev who
set one up at any point holds paper that opens their copied vault exactly as it did before this
epic, which is the whole attack this epic exists to close. So:

1. **The wrap is stripped when the account is a dev**, by the same decide-then-apply step that binds
   S — one more branch in `devLoginKeyOps`, not a second mechanism. Promotion member → dev strips it
   on the next sync write; demotion dev → member does not restore it, because the code that made it
   is gone.
2. **The three commands are refused for a dev** — `setupRecoveryCode` (`package.json:786`, menu
   `:1258`), `unlockWithRecoveryCode` (`:792`, `:1263`) and `removeRecoveryCode` (`:798`, `:1268`) —
   in the `when` clause and in the handler, like every other ban here. Ungated, `setupRecoveryCode`
   would let a dev mint the bypass at will.
3. **A test asserts a dev's vault carries no `recovery` wrap** after one sync, and that the strip
   survives a promotion.

**What this cannot do, said plainly:** a code printed before the strip still opens vault *copies*
written before it. That is the same residual `removeRecoveryCode` already documents — removing the
slot does not re-key the vault, and paper cannot be recalled. What the strip does guarantee is that
every version written from that moment on is closed to it. A company that wants the older copies
dead too has one instrument, and it is the officers' break-glass re-key.

**S never feeds scrypt.** scrypt exists to slow an attack on a low-entropy human choice; S is 32
random bytes. The bind is HKDF over the concatenation, `info =
"cred-ssh-manager/dev-login-key-bind"`, in one new helper beside `masterKeyScryptInput`
(`cryptoUtils.ts:185-192`) and reused verbatim for the WebAuthn PRF secret. One helper, two callers.

**A server-bound wrap is filtered out of the facts, not handled inside the plan.** `unlockPlan`
(`unlockPlan.ts`) gets no new branch: `unlockInner` computes `usableWraps` — every wrap that is not
server-bound, plus the server-bound ones when S is in hand — and the existing facts are derived from
that. This is how `org-escrow` is already invisible to `UnlockFacts`: structurally, so that nobody
can helpfully add an unlock option for a door that has no key on this side.

**A missing S is its own error.** `unwrapWithPin` throws `'server-key-required'`, never
`'wrong-password'`. A person typing their correct PIN and being told it is wrong is how a support
ticket becomes an afternoon.

**The lease is per machine and never syncs, and its heartbeat is the sync, not the readiness
refresh.** `credSshManager.loginKeyLease.<accountId>` in `globalState`, bumped from
`SyncManager`'s per-account success callback (`onAccountSynced`, `syncManager.ts:121`, fired at
`:360`) and from a successful policy fetch. This was nearly wired to epic 1's policy fetch alone,
which would have been wrong: `refreshOrgAccess`/`refreshReadiness` runs at activation and from
specific commands (`extension.ts:392`, `:509`), **not** from the periodic sync loop
(`syncManager.ts:295`), so a window left open and syncing all day would never bump the lease and
would lock an online developer out. `0` hours means always expired when offline. Expiry locks that account only, which is
why `VaultKeys.lock()` (`vaultKeys.ts:130-139`) and its `LockState` must be widened to take an
optional account. **That widening is a build item with its own characterization tests**, not a
detail: today the lock is one global instance per `VaultKeys`.

**Menus are discoverability; handlers are the gate.** Checked against the manifest rather than
assumed: of the six ways vault content leaves the machine by command, only three hang off a tree
row. `backupToNas` (`package.json:1161`), `backupNow` (`:1171`) and `restoreBackup` (`:1166`) are
view-title items whose `when` is `view == credSshManagerView` with no `viewItem` to narrow, and
`extension.exportSecrets` is a palette command with no menu entry at all. A `when`-only ban would
leave four open doors, three of them in the panel header. Every handler carries the guard; the
`when` clauses stay so a dev is not shown a command that will refuse.

## Contract with epic 1

Epic 2 needs, and epic 1 must ship:

```csharp
Member? Find(string email);   // synchronous, from an in-memory cache; null = not registered
Task SetActiveAsync(string email, bool active, string byAdmin, CancellationToken ct);
```

The cache is loaded lazily per email and invalidated on write — the registry is small (200 records
of about a kilobyte) and read on every request, so a disk read per call is the wrong shape. If epic 1
ships an async-only registry, `RequireActiveCaller` becomes a hot-path disk read and every call site
must be revisited: **this is the highest-blast-radius unknown in the epic, and it is checked before
item 2 of the build order, not after.**

## Files

### Server

| File | New/modify | Responsibility |
|---|---|---|
| `src/LoginKeyStore.cs` | new | `${DataDir}/org/login-keys/<KeyFor(email)>.bin`: `{iv, tag, data, createdAt}`, AES-256-GCM over S under the deployment KEK. `GetOrCreateAsync`, `Revoke`, `FingerprintAsync`. Atomic write and hashed key per `OrgRecoveryStore.cs:374-379` / `VaultStore.cs:30-36`; minting under the 64-way stripe (`VaultStore.cs:115-119`). |
| `src/VaultStoreBlocking.cs` | new partial | `WithdrawAllInvolvingAsync(email, ct)` — a third concern beside `VaultStoreOutbox.cs`, for the reason that file's own header gives. |
| `src/Models.cs` | modify | `SentShare` gains `WithdrawnReason` (default `""`, omitted when empty — the `Format` precedent at `:48-50`). |
| `src/Program.cs` | modify | `RequireActiveCaller` and `X-Creds-Reason` beside `RequireCaller` (`:445-459`); the third branch in `DELETE /api/shares/sent/{id}` (`:1266-1286`); the KEK startup log. |
| `src/OrgEndpoints.cs` | modify | `GET /api/org/login-key` and `PUT /api/org/members/{email}/active` join epic 1's extension method rather than growing `Program.cs`. |
| `src/AppJsonContext.cs` | modify | New DTOs. |
| `http/org/` | modify | `login-key.http`, `active.http`; the blocked-caller `403` is one request. |

**Endpoints**

| Method | Path | Auth | Answers |
|---|---|---|---|
| GET | `/api/org/login-key` | active dev | `{loginKey}` base64, idempotent. `403` for a non-dev, `503` when no KEK is configured. |
| PUT | `/api/org/members/{email}/active` | `RequireAdmin` | `{active}`. Idempotent (`204`). `409` for an officer. On `false`: persist → withdraw both directions → revoke S. On `true`: persist only; S mints fresh on the next `GET`. Logged at Warning naming admin and target, and appended to the event log. |

**Withdrawal, concretely.** Shares *to* the blocked user: delete the inbox file, and rewrite the
sender's receipt at `sent/<KeyFor(from)>/<id>.json` with `withdrawnReason` set — rewritten, not
deleted, so it survives one more `GET /api/shares/sent` and the sender actually sees it. Shares
*from* the blocked user: delete the recipient's inbox copy; the blocked sender's own receipts need
no reason, because they cannot call anything. `DELETE /api/shares/sent/{id}` gains a branch before
the existing withdraw logic: a receipt already carrying a reason is dismissed with `204` whatever the
inbox says. Done inline in the block handler, not on `ShareMaintenance`'s hourly cadence —
"immediately" is the requirement.

### Extension

| File | New/modify | Responsibility |
|---|---|---|
| `src/cryptoUtils.ts` | modify | `bindWithLoginKey(baseKey, loginKey)` — HKDF-SHA256, `info = "cred-ssh-manager/dev-login-key-bind"`, 32 bytes — beside `masterKeyScryptInput` (`:185-192`). |
| `src/keyWrap.ts` | modify | `serverBound` / `loginKeyFingerprint` on `KeyWrap`; the optional `loginKey` argument through `wrapWithPin` (`:128-140`), `unwrapWithPin` (`:249-262`) and the PRF path; `'server-key-required'` as a distinct failure. `wrapWithOrgEscrow` (`:384-402`) untouched — the officer quorum and S are orthogonal doors. |
| `src/orgLoginKeyClient.ts` | new | `fetchLoginKey(account)` on epic 1's `corpApiClient`; `503` and `403` surfaced as their own sentences. |
| `src/vaultKeys.ts` | modify | `resolveLoginKey` (memory → sealed local copy → server, interactive only) and `usableWraps` in `unlockInner` (`:258-395`), before the wrap inspection. A non-interactive call with no S returns undefined and never prompts, matching the existing silent-path refusal. `lock(accountId?)` and `LockState` widened. |
| `src/devLoginKeyOps.ts` | new, pure | `loginKeyBindAction(wraps, facts)` → `unchanged | bind | rebind | unbind`, the shape of `orgEscrowOps.ts` and for its reason: the decision is worth reading on its own, and the mechanical half must not be able to disagree with it. An unreachable server is `unchanged`, never `unbind` — "not knowing changes nothing". **The same function answers the recovery wrap**, because "what should this vault's wraps be, given who this person is" is one question: a dev's answer drops the `recovery` slot, everyone else's leaves it alone. |
| `src/syncManager.ts` | modify | The bind action beside the escrow action (`:562`) and the `keys.encrypt` call (`:520`), folded into the same `willWrite` decision. **Only the PIN wrap re-binds on a background sync**; a security-key wrap needs the key touched, so it re-binds lazily the next time it is used interactively (`vaultKeys.ts` `way === 'key'`), the rule `vaultRekey.ts` already states. No master key rotates: this is re-wrap, not re-key. |
| `src/loginKeyLease.ts` | new, pure | `leaseExpired(now, lastVerified, hours)`, `0` always expired offline. |
| `src/extension.ts` | modify | The lease bump on `onAccountSynced` (`syncManager.ts:121`, fired per account at `:360`) as well as on a successful policy fetch — the sync loop is the only thing that runs on its own. |
| `src/lockedNotice.ts` | modify | An optional reason so a lease lock does not read like an idle lock. |
| `src/storageManager.ts` | modify | The purge on `account-deactivated`: cached S → sealed local S → lease key → `lock(accountId)`. No durable intent record is needed, unlike account removal (`pendingCleanup.ts`), because S is reissuable and a crash mid-purge leaves the account locked either way. |
| `package.json` | modify | The three recovery-code commands refused for a dev: `setupRecoveryCode` (`:786`, menu `:1258`), `unlockWithRecoveryCode` (`:792`, `:1263`), `removeRecoveryCode` (`:798`, `:1268`). Plus `when` clauses for the three commands that have a tree row: `exportExternal` (`:1513`, `viewItem =~ /^(folder|entity)/`), `cloneNode` (`:1473`, `/^(folder|entity|revision)/`) and `setBackupLocation` (`:1213`, `viewItem == account`). **Three more have no row at all** — `backupToNas` (`:1161`), `backupNow` (`:1171`) and `restoreBackup` (`:1166`) are view-title items whose `when` is only `view == credSshManagerView`, and `extension.exportSecrets` is palette-only. Read from the manifest, because the natural assumption is that every command hangs off a row and half of these do not. |
| every handler above | modify | **The handler is the gate**; the `when` clause is discoverability. One shared guard refuses for a dev account, so the palette, the view title and a keybinding are covered by the same line. Cross-account move must be checked against `treeMutationCommands.ts` before assuming the clone gate covers it. |

## Growth

| Surface | Size | Retired by | Interrupted |
|---|---|---|---|
| `org/login-keys/*.bin` | 200 × ~300 B | deleted on unblock and with the vault | atomic write; a half-minted key cannot exist |
| `SentShare.withdrawnReason` | one string on existing records | the sender's dismiss, or the 31-day sweep | rewritten atomically |
| the lease memento | one number per account per machine | account removal | a lost value reads as expired, which locks — the safe direction |

## Build order

1. **Confirm epic 1's registry exposes a synchronous `Find`.** Everything else assumes it.
2. Server: `RequireActiveCaller`, the reason header, `LoginKeyStore`, the KEK startup log,
   `GET /api/org/login-key`.
3. Server: `WithdrawAllInvolvingAsync`, `SentShare.WithdrawnReason`, the dismiss branch.
4. Server: `PUT .../active` with the officer refusal, the event-log lines, tests.
5. Extension: `bindWithLoginKey`, the `KeyWrap` fields, `'server-key-required'`, unit tests first.
6. Extension: `orgLoginKeyClient`, `resolveLoginKey`, `usableWraps`.
7. Extension: `lock(accountId?)` + `LockState` widening **with characterization tests for today's
   behaviour before the change**, then the lease.
8. Extension: `devLoginKeyOps` — the S binding **and the recovery-wrap strip** — the sync wiring, and
   the lazy security-key re-bind.
9. Extension: the three recovery-code commands refused for a dev, in the manifest and the handlers.
10. Extension: the export, backup and clone gates.
11. Docs: the reworded rule in `architecture.md`, the README table, `CLAUDE.md` rule 1,
    `module_server.md`, `module_extension.md`.

## Test plan

**Server**: the auth matrix for a blocked caller across vault GET/PUT, team, shares, org-recovery
config and the login key, each `403` carrying the reason header; an officer cannot be blocked
(`409`); unblock restores; S is byte-identical across two `GET`s and different after unblock; a share
to a blocked user is withdrawn and its sender's receipt carries the reason, then dismisses; a share
from a blocked user leaves the recipient's inbox; with no KEK the login key is `503` while ordinary
sync is unaffected.

**Extension** (`node:test`): a PIN round-trip with and without S; the wrong S fails as
`server-key-required`, never `wrong-password`; a vault written without S is **byte-identical to
today** (no new keys in the JSON) — the forward-compatibility property; a vault holding only a
server-bound PIN wrap with no S never reaches `silentPin`; `devLoginKeyOps` four branches, including
an unreachable server leaving wraps alone; **a dev's vault carries no `recovery` wrap after one
sync, and a member promoted to dev loses the one they had**; `leaseExpired` truth table including
`0`; the purge order on a deactivated response.

**Watched failing first**, per the repository's testing rule, for every one of these: they are
guarantees, and a test that has never been red is decoration.

## Risks

1. **Epic 1's registry shape** (sync vs async) — item 1 of the build order exists to settle it.
2. **The reworded rule** is a change to the product's central claim. It is recorded here, repeated
   in three documents, and the "the operator could already do this" sentence travels with it. A
   summary that drops that sentence turns a true statement into a false one — the failure mode
   `knowledge-base.md` §Shortening a rule records.
3. **`VaultKeys.lock()` per account** is new surface, not a refactor of tested behaviour.
4. **The bans are honest-client only** (the umbrella's *Boundaries* table). Nobody may later "fix"
   this by moving the check server-side; the server cannot see an export.
5. **A dev who is offline past the lease with no network is locked out of their own work.** That is
   the feature. The lease default of 24 hours and the `0` option are the operator's dial, and the
   lock notice must say plainly what happened and what to do.

## Definition of Done

- [ ] **The corporate-recovery rehearsal has run** — [PLAN_org_recovery_tail.md](PLAN_org_recovery_tail.md)
      item 1, three officers on three machines — and its findings are recorded, **before the first
      `GET /api/org/login-key` ships**. After this epic, break-glass is the only road into a blocked
      dev's vault, and a door nobody has ever opened must not become the only one. The umbrella
      states this as a precondition; it is repeated here because this is the checklist somebody
      actually runs through.
- [ ] Both suites green; every new guarantee has a test that was watched failing.
- [ ] A blocked user is refused everywhere, and a live client locks and purges within one cycle.
- [ ] A dev's vault copied to another machine does not open with the correct PIN alone, and does not
      open with a recovery code either — verified by hand, not only by a unit test.
- [ ] Unblock issues a new S and the old one opens nothing.
- [ ] `architecture.md`, the README table and `CLAUDE.md` rule 1 carry the reworded rule with the
      operator-position sentence.
- [ ] `module_server.md` and `module_extension.md` document the key, the wrap fields, the lease and
      the bans, including which are honest-client only.
- [ ] `http/org/login-key.http` and `active.http` run green.
- [ ] The `coai` gate: `review_plan` reached `proceed`, `review_code` ran, findings resolved,
      verdicts and reviewer counts reported.
- [ ] `/security-review` run over the wrap changes — this is key material, and the org-recovery
      precedent is that every defect was in the wiring, not the primitives.
