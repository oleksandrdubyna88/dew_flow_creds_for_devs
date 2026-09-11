# PLAN — a signed envelope without its signature is tampered, not legacy

> Status: **plan only, nothing implemented yet, 2026-09-10.** Scope: `src_vs_code/src/cryptoUtils.ts`,
> `vaultKeys.ts`, `syncManager.ts`, `backupManager.ts`, `commands/recoveryCommands.ts`, their tests.
> Audit finding **#2** of [REVIEW_product_audit_2026-09-09.md](REVIEW_product_audit_2026-09-09.md),
> re-verified 2026-09-10 (§Перепроверка).
>
> Related docs: [module_extension.md](../research/module_extension.md) (envelope, wraps, MAC),
> [PLAN_share_metadata_aad.md](../research/PLAN_share_metadata_aad.md) (why `wraps` are not in the AAD).

## Symptom

The envelope MAC exists for one threat, and its own comment names it (`cryptoUtils.ts:522-527`): *on a
shared-folder transport a write-capable attacker could forge the owner account or delete unlock wraps
to lock the owner out.* Today that attacker succeeds by deleting the MAC along with the wrap:

- `verifyEnvelopeMac` answers `'missing'` whenever the `mac` field is absent, for every version
  (`cryptoUtils.ts:660-663`) — the comment says *legacy/unsigned envelope*, but every v3+ writer signs
  (`encryptJsonWrapped` :479, `resignEnvelopeWraps` :698), so on a current v4 file "no MAC" is never legacy.
- `macStatusBlocksSync` blocks only `'bad'` (`:680-682`); `'missing'` proceeds.
- `headerAad` deliberately binds `format/version/account/kdf` and not `wraps` (`:606-611`, and it is right
  to — adding a security key rewrites wraps without re-sealing the payload). So with the MAC gone nothing
  authenticates the wrap list at all.
- The sync cycle **unwraps and caches before it checks**: `this.keys.unlock(...)` at `syncManager.ts:445`
  runs `remember()` (`vaultKeys.ts:426`, `:472`, `:490` → `:572`) with whatever wraps the file carried, and
  only then `verifyEnvelopeMac` at `:452-462`. Even a `'bad'` verdict therefore leaves the tampered wrap
  list in the key cache, and the next save re-signs it (`wrapsToWrite`, `:533`) into a valid v4 envelope.

Audit reproduction on real functions: v4 envelope, one wrap removed, MAC removed →
`macStatus=missing; blocksSync=false; payloadOpens=true; wrapsRemaining=1`.

What the attacker gets: not the payload (that still needs a key), but a **downgrade** — strip the
security-key wrap and the recovery wrap, leave the PIN wrap, and every device now opens the vault by PIN
alone and re-signs that state. Or strip everything but a wrap that no longer opens, and the owner is
locked out with a file that looks legitimate.

Two adjacent facts that make the fix cheap:

- Every production rewrite of `wraps` goes through `resignEnvelopeWraps` (four call sites in
  `securityKeyOps.ts`: 190, 218, 246, 305). `envelopeWithWraps` (`cryptoUtils.ts:495-501`), which copies
  the old MAC over new wraps, is **called by no production code** — it is the one function that would
  produce an unsigned-looking v4 file, and it is dead.
- The audit's finding #6 ([PLAN_kdf_params_bounded.md](../research/PLAN_kdf_params_bounded.md), shipped) composes with this one: the MAC covers
  `kdfN/kdfR/kdfP` (`macMaterialV3`, `:629`), so with the MAC required the KDF parameters become
  authenticated too — after the unwrap. That plan bounds them before it.

## What must be true when this is done

1. A v3 or v4 envelope without a `mac` field is `'bad'`. A v1 file (never signed) and a v2 file (signed
   only after the unsigned wrap-rewrite was replaced) keep answering `'missing'`.
2. No code path adopts a key or a wrap list from an envelope whose MAC is `'bad'`: not the sync cache,
   not a file import, not a recovery re-key. The refusal happens **before** `remember()`.
3. The refusal writes nothing — not the file, not the wrap list, not the cache — and says *tampered*, not
   *wrong PIN*.
4. `envelopeWithWraps` is gone.

## Design

### 0. Prerequisite — the KDF parameters are bounded first

[PLAN_kdf_params_bounded.md](../research/PLAN_kdf_params_bounded.md) landed **before** this plan (gate round 1,
codex): every entry point below unwraps before it can verify, so an unsigned v4 envelope with an
extreme `kdfP` would still cost the derivation before being called tampered. With the accepted
parameter set pinned, the unwrap costs what the owner chose, and this plan's test table gains one row:
*an unsigned v4 envelope naming an unaccepted `kdfP` is refused before deriving* (`corrupted`, from the
bound), not after (`tampered`).

### 1. `verifyEnvelopeMac` — "absent" is legacy only for the two versions that were ever unsigned

```ts
if (typeof mac !== 'string') {
  return unsignedLegacy(env.version) ? 'missing' : 'bad';
}
```

`unsignedLegacy(v)` is `v === VERSION_PIN_ONLY || v === VERSION_WRAPPED` — **exact integer equality,
an allow-list**. Anything else — 3, 4, a future 5, a string `"2"`, `null`, absent — with no string `mac`
is `'bad'` (gate round 1, gemini: a `>=` test with `typeof === 'number'` would let `version: "3"` read as
legacy; a v3 file is sealed without AAD, so a mutated version still decrypts). `mac: null` and any
non-string `mac` take the same branch as absent; the function returns before touching `mac` again, so
there is no second read to crash on.

The cut is v2, not v3: the comment on `resignEnvelopeWraps` (`:685-686`) says it *replaces the older
unsigned wrap-rewrite for v2 vaults*, so an unsigned v2 file can exist on disk and must keep opening.
A v3 file was never written unsigned (`macMaterialV3` and v3 arrived together).

### 2. One integrity check, before the cache — `requireIntactEnvelope`

A new export in `cryptoUtils.ts`:

```ts
/**
 * Throws BackupError('tampered') when the envelope's own signature says it was altered.
 * The key is the MASTER key (the MAC key is HKDF of it, `envelopeMacKey`) — which is why this can
 * only run after an unwrap, and why it must run before anything is cached.
 * 'ok' and 'missing' (v1/v2 only, by §1) pass; only 'bad' throws.
 */
export function requireIntactEnvelope(fileContent: string, masterKeyBase64: Passphrase): void
```

The order at every call site, stated once (gate round 1, gemini): **unwrap the candidate master key
into a local — do not cache — call `requireIntactEnvelope(raw, candidate)` — only then `remember()`.**
A wrong PIN never reaches this: the wrap's own AES-GCM tag throws `wrong-password` inside the unwrap, so
a key that arrives here is the right key and a mismatch under it is tampering, not a typo.

`BackupErrorKind` gains `'tampered'` (`cryptoUtils.ts:99` — the union that already separates
`server-key-required` from `wrong-password` for the same reason: two different failures must not reach a
person as one sentence). The sentence a person sees, in one place (`describeError` / the sync warning):
*"The vault file's integrity signature is missing or does not match — it was altered outside
CredsForDevs. Nothing was changed on this machine; check who can write to the sync location."*

Called from:

- `VaultKeys` — a private `rememberVerified(account, vaultContent, master, wraps)` replaces the four
  `this.remember(...)` calls (`vaultKeys.ts:253`, `:426`, `:472`, `:490`). It verifies against the raw file
  the wraps were read from, then caches. The cached short-circuit at `:377` reads no file and needs no
  change: `syncManager.ts:452` still verifies the raw file against the cached key on every cycle.
- `syncManager.ts:445-462` — `unlock` now throws `tampered` before caching; the catch turns it into the
  existing `warnTampered` + `{ applied: false, pushed: false }`. The check at `:452` stays (it is the
  one that runs when the key came from the cache).
- `backupManager.ts:294-300` (import from file) — after `unwrapWithPinAsync`, before
  `decryptJsonWithMasterKey`.
- `commands/recoveryCommands.ts:500-509` (escrow open) — after the escrow unwrap, before the decrypt; a
  re-key that carries `previousWraps` (`:538`) must not carry a tampered list forward. `recoveryCommands`
  imports `vscode`; the three lines *find the escrow wrap → unwrap → verify → decrypt* are extracted into
  a `vscode`-free `openEscrowedVault(content, orgPrivateKey)` in `orgEscrow.ts` (or the module that
  already owns `unwrapWithOrgEscrow`) so the refusal is a unit test, not a hope (gate round 1, codex).

### 3. Delete `envelopeWithWraps`

Unused; keeping it is keeping the one way to write a v4 file whose MAC does not match.

## Build order

1. RED: `cryptoUtils.test.ts` — `'a v4 envelope with its MAC stripped is bad, not missing'` (expects
   `'bad'`, gets `'missing'`), and the guard `'a v2 envelope without a MAC still reads as missing'`.
2. `verifyEnvelopeMac` fix → GREEN.
3. RED: `syncManager.test.ts` — `'a stripped MAC and a removed wrap stop the cycle before anything is
   cached or written'`: v4 envelope with a PIN wrap and a recovery wrap; remove the recovery wrap and the
   `mac`; run a cycle; assert `applied === false`, a tamper warning, the file at the sync location is
   byte-identical, and a following save does not re-sign the shortened list.
4. `requireIntactEnvelope`, `rememberVerified`, the `tampered` kind, the syncManager catch → GREEN.
5. RED: `backupManager.test.ts` — `'importing a vault file whose MAC was stripped is refused as
   tampered, not as a wrong PIN'`.
6. Import and recovery call sites → GREEN.
7. Remove `envelopeWithWraps` and its test; `npm run typecheck`; full `npm test`.
8. `research/module_extension.md` envelope section; `CHANGELOG.md` under the next version.

## Test plan

| Test | Proves |
|---|---|
| v4 without `mac` → `'bad'`; **v3 without `mac` → `'bad'`** (its own test, not implied by v4) | rule 1 |
| v2 without `mac` → `'missing'`; v1 → `'missing'` | legacy files keep opening |
| `version: "3"`, `version: null`, no `version`, `version: 5` — each without `mac` → `'bad'` | the allow-list, not a range |
| `mac: null`, `mac: 42` on v4 → `'bad'`; on v2 → `'missing'` | a non-string `mac` is "absent" |
| v4 with a MAC of the other material shape (v2 canonical) → `'bad'` | a downgraded signature is not accepted |
| sync: stripped MAC + removed wrap (v3 and v4) → cycle stops, nothing cached, nothing written | rule 2, 3 |
| sync: warm cache, then the file is tampered → cycle stops (existing test at `syncManager.test.ts:315-331` still passes) | the cached path |
| import: stripped MAC → `tampered`; import of an unsigned v2 backup → opens | rule 2 for files, legacy kept |
| recovery: valid escrow unwrap + stripped MAC + removed security wrap → `tampered`, no re-key output | rule 2 for recovery |
| unsigned v4 with `kdfP: 128` → `corrupted` before deriving (prerequisite plan's bound) | the unwrap cannot be made expensive first |
| the four `securityKeyOps` rewrites still verify `'ok'` afterwards (existing `keyWrap.test.ts:366-389`) | no live path writes an unsigned v3+ file |

## Definition of Done

- [ ] All tests above; the RED failures and the GREEN run reported with the suite's own numbers.
- [ ] `npm run typecheck` and `npm test` green; `envelopeWithWraps` gone.
- [ ] `module_extension.md` says which versions must carry a MAC and where the check runs; `CHANGELOG.md`
      entry names the downgrade this closes.
- [ ] `coai` plan round reached `proceed`; code round run on the branch; every finding resolved.
- [ ] Promoted to `research/` with deviations recorded.
