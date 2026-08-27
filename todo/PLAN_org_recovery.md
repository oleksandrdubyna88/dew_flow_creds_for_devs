# PLAN — corporate break-glass recovery of personal vaults (Shamir 2-of-N)

> Status: **plan only, nothing implemented yet.** Scope: both halves — `src_vs_code` (escrow wrap,
> Shamir, ceremonies, officer UI) and `src_minimalapi_server` (officer config, invite/session
> endpoints, audit log). Owner decisions recorded 2026-08-27.
>
> Related docs: [module_server.md](../research/module_server.md),
> [module_extension.md](../research/module_extension.md),
> [PLAN_recovery_code_wrap.md](PLAN_recovery_code_wrap.md) (the personal tier, built first).

## The symptom

When the only person who could open a vault leaves — deletes the account, takes the PIN and the
YubiKey — everything they never shared is gone. Shares don't cover it: sharing here is
point-to-point copies (`shareInbox.ts:127-140`), so what was never shared exists in exactly one
sealed vault. The personal recovery code ([PLAN_recovery_code_wrap.md](PLAN_recovery_code_wrap.md))
helps its *owner*; it does nothing for the company when the owner is the one who left.

## Owner decisions (2026-08-27, fixed)

1. **Server config lists recovery officers by email.** Empty → feature off. Configured → minimum
   **3 officers, threshold 2-of-N**, enforced by a startup guard.
2. **Every account using that server is enrolled automatically** once the config is set: its vault
   gains an escrow wrap on its next ordinary write. No opt-out per account; **transparency is
   mandatory** — every client shows that corp recovery is on and who the officers are.
3. **Officers get a dedicated management view** (tree "…" menu) for the corp master key;
   recovery uses **2+ officers' YubiKeys/PINs**.
4. **Ceremonies are remote/asynchronous** — officers in different cities.
5. **The server stays transport-only** (CLAUDE.md rule 1): it never holds a share it can open.

## The design (blueprint, condensed)

### Cryptography — one new primitive, one new pure module

- **X25519 (ECIES-style)** via `node:crypto` — the zero-dependency rule forbids libraries. The org
  recovery *public* key is published; each vault's 32-byte master key is sealed to it as a
  `kind: 'org-escrow'` `KeyWrap` (fresh ephemeral X25519 per seal +
  `HKDF('creds-for-devs/org-escrow-wrap', ECDH)` + AES-256-GCM; wrap carries
  `ephemeralPublicKey` and `orgPublicKeyFingerprint`). The wrap lives in the existing `wraps[]`
  array — AAD deliberately excludes `wraps` (`cryptoUtils.ts:355-386`), so adding/refreshing it
  never re-seals the payload. It must NEVER appear as an unlock option in `unlockPlan.ts`.
- **Shamir over GF(256)** (`shamir.ts`, ~120-150 lines, pure): AES polynomial `0x11B` so
  HashiCorp/SLIP-39 published vectors cross-check it; `splitSecret`/`combineShares` +
  `mintShareSet` publishing an **HKDF-HMAC integrity tag** over the recombined secret — classic
  Shamir is unauthenticated, and the tag (not the server) is what rejects a wrong/tampered subset.
- **The org private key never exists assembled after setup** except transiently in the
  initiator's memory during break-glass; every buffer is zeroed after use (`.fill(0)`,
  precedent `cryptoUtils.ts:213`).

### Where an officer's share lives

Inside the officer's **own vault envelope** (new field `orgEscrowShare`), sealed under their own
PIN/YubiKey — so it syncs to all their machines through the transport that already exists, and
recovery is their normal daily unlock gesture. Delivery of freshly minted shares reuses the
*shape* of `/api/shares` (sealed with a one-time PIN, sender stamped from the token) as a
dedicated `/api/org-recovery/invites` group — `ShareItem` is structurally bound to
`TreeNode`/`EntityKind` and must not carry key material dressed as a credential.

### Server (all payloads public or opaque — per-field justification in the full blueprint)

Config: `Vault:CorpRecovery:OfficerEmails` (CSV), `:Threshold` (default 2), `:SessionTtlHours`
(default 72); startup guard refuses N<3 or threshold outside [2,N]. New files:
`OrgRecoveryStore.cs` (atomic flat files, `VaultStore.cs:280-285` idiom), `OrgRecoveryModels.cs`,
`OrgRecoveryMaintenance.cs` (hourly sweep of expired invites/sessions; the append-only
`audit.log` is never pruned).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/org-recovery/config` | any caller | officers, threshold, org public key + fingerprint, `setupComplete` |
| POST | `/api/org-recovery/invites` | officer | one sealed share per recipient officer (sender stamped) |
| GET | `/api/org-recovery/invites` | officer | own pending invites |
| POST | `/api/org-recovery/invites/{id}/ack` | recipient | single-use delete after durable local store |
| GET | `/api/org-recovery/invites/status` | officer | initiator's poll: acked / pending |
| POST | `/api/org-recovery/setup` | inviter | publish public key; 409 while any invite pending |
| POST | `/api/org-recovery/sessions` | officer | start break-glass: target email + ephemeral session pubkey |
| GET | `/api/org-recovery/sessions/{id}` | officer | status + opaque contributions |
| POST | `/api/org-recovery/sessions/{id}/contribute` | officer | share resealed to the session key (stamped) |
| GET/PUT | `/api/org-recovery/sessions/{id}/target-vault` | **initiator** | the ONE cross-owner vault read/write, gated on session `ready`; reuses `VaultStore` verbatim; PUT completes + audits |
| GET | `/api/org-recovery/audit` | officer | who initiated / contributed / when — metadata only |

The threshold gate server-side is a **courtesy, not a security boundary** — the server cannot
verify a contribution (opaque ciphertext); the client-side integrity tag is the real check. Say so
in code comments and `module_server.md`, or a maintainer will assume otherwise.

### Ceremonies (remote/async)

- **Setup**: officer A generates the keypair locally → splits → seals one invite per officer
  (one-time PIN told out-of-band) → each officer accepts independently, seals the share into their
  own vault (PIN or a fresh PRF registration under an `'org-escrow'` salt namespace), **acks only
  after the durable write** → A publishes once all acked → A zeroes everything.
- **Enrollment**: every client, on each sync write, runs `ensureOrgEscrowWrap` (pure):
  config off → remove wrap; fingerprint stale/absent → mint fresh; fetch failed → change nothing
  (fail safe, never silently strip). Wired next to `keys.encrypt` in `syncManager.ts:471`.
- **Break-glass**: A starts a session (fresh ephemeral session keypair) → each officer: normal own
  unlock → unseal own share → reseal to the session key → contribute → at quorum A combines,
  verifies the integrity tag, opens the target's escrow wrap → **mandatory re-key** (fresh master,
  single temporary-PIN wrap, every old wrap discarded) → PUT back → audit line → temporary PIN
  relayed to the business out-of-band. The target's other devices see a locked vault until the new
  PIN is typed.

### R2 — the rotation function this depends on

Full master-key rotation exists only as two inlined special cases
(`securityKeyOps.ts:85-98` v1-upgrade, `:135-147` last-key-removed); ordinary one-of-many key
removal deliberately does NOT rotate (`securityKeyOps.ts:150-155`). Extract
`vaultRekey.rekeyUnderPin(payload, account, pin, now, pendingShares, extraWraps)` — both existing
branches become callers (characterization tests pin byte-equivalent behaviour), break-glass is the
third. This ships **before** any server work and is independently valuable: it is the missing
"rotate after removing a key" story.

### Client-side trust

`orgRecoveryPinning.ts` — TOFU pinning of `orgPublicKeyFingerprint` per server, the
`senderPinning.ts:61-104` state machine over one value; a swapped key without a visible setup
ceremony is a loud `mismatch` modal, same ceiling the product already documents for share
signatures.

## Preconditions (do not start before)

1. [PLAN_recovery_code_wrap.md](PLAN_recovery_code_wrap.md) shipped — it introduces the third wrap
   kind, the kind-agnostic `backupPlan` routing and the forward-compat lesson this plan inherits.
2. ~~The server-ops work in flight~~ — landed 2026-08-27 (`ContractVersion.cs`,
   `VaultStoreOutbox.cs`, `ShareMaintenance.cs` are committed); this plan's endpoints assume
   those files and the precondition is satisfied.
3. ~~**X25519 raw-key spike**~~ — **done 2026-08-27, and it refuted half the guess.** Measured with
   a throwaway script before a line of the module was written:

   | claim | measured |
   |---|---|
   | JWK round-trip is the reliable route to raw bytes | **only for the PUBLIC half.** Importing a private JWK is refused — `Invalid JWK OKP key` — unless the public member rides along, which a bare share holder does not have |
   | DER tail gives the same 32 bytes | yes, byte-identical to JWK's `x`/`d`; prefixes constant across 50 generated keypairs |
   | rotation cost matters on every sync write | no: seal **0.138 ms**, open **0.154 ms** (mean of 200), wrap 214 JSON bytes |

   So **both directions go through DER** and the JWK route is not used at all. The private key is
   32 bytes with no structure around it, which is what makes splitting it possible.

   Remaining honest gap: measured on Node 24 (this machine), while the floor is Node 18
   (`engines.vscode ^1.85.0`, esbuild `--target=node18`). Every API used — `diffieHellman`,
   `hkdfSync`, DER `createPublicKey`/`createPrivateKey` — long predates 18, but that is an
   argument, not a measurement.

## Build order

1. Contract doc: the endpoint table + wire shapes into `research/module_server.md` (rule 6 —
   one source both halves implement against).
2. ~~**R2**: `vaultRekey.ts` extraction~~ — **shipped 2026-08-27** (`199c12f`), brought forward
   because the recovery-code work needed it: `rekeyUnderPin` is the one place a master key
   rotates, both former branches repointed, and it reports a recovery code it could not carry.
3. **Extension pure crypto** — **`shamir.ts` and `orgEscrowCrypto.ts` shipped 2026-08-27.**
   Still open in this step: the `'org-escrow'` `KeyWrap` kind and the forward-compat wrap
   filtering. What the two modules landed with, worth keeping:
   - Shamir is **not authenticated** by construction, and too few shares return a well-formed
     WRONG secret rather than an error — pinned by test. `mintShareSet`/`verifyRecombined` carry
     an HKDF-HMAC tag bound to the roster shape; that tag, never the server's count, is the gate.
   - The field multiply is checked against an **independent log/antilog implementation over all
     65 536 pairs**, and the zero-information property (one share leaves all 256 secret bytes
     possible) is computed with that independent multiply so a bug cannot agree with itself.
     No third-party vectors were copied; this is stronger and needs no attribution.
   - Fingerprints reuse the existing `keyFingerprint` from `shareSignature.ts` rather than
     inventing a second spelling.
4. Server phase 1: config + guard + `GET /api/org-recovery/config`.
5. Server phase 2: invites + setup + maintenance sweep.
6. Extension: setup ceremony + officer panel + TOFU pinning + transparency UI.
7. Extension: `ensureOrgEscrowWrap` on every sync write.
8. Server phase 3: sessions + target-vault gate + audit.
9. Extension: break-glass ceremony end-to-end.
10. Follow-up plan extracted at the end: `sessionKind: 'key-rotation'` (cheap roster rotation).

## Test plan

Extension: `shamir.test.ts` (every valid subset recombines; tampered share fails the tag; n=255
cap; third-party vectors), `orgEscrowCrypto.test.ts` (round-trip, wrong key, ephemeral never
reused), `vaultRekey.test.ts` + characterization of both repointed branches,
`orgEscrowOps.test.ts` (four branches), `orgRecoveryPinning.test.ts`, transport shapes.
Server (`WebApplicationFactory`): config on/off, startup guard refusal, invite lifecycle +
early-publish 409, session auth matrix (non-officer 403, non-initiator 403, pre-ready 409,
single-use PUT), audit entry per completed session, sweep spares the audit log.

## Top risks (recorded, with mitigations)

1. **Shares cannot be selectively revoked** — a departed officer's kept copy stays valid; v1 ships
   hard rotation only (fresh keypair, global opportunistic re-wrap).
2. **Server swaps the org public key** → TOFU fingerprint pinning + loud mismatch.
3. **Old clients drop unknown wrap kinds** (`isKeyWrap` allowlist) → forward-compat fix required,
   plus opportunistic re-add heals a one-time loss.
4. **Officer loses both factors** → N−threshold ≥ 1 by construction; setup copy pushes ≥ 2.
5. **Hand-rolled ECIES/Shamir is roll-your-own crypto**, forced by zero-deps → textbook primitives
   only, distinct HKDF info strings, third-party vectors, dedicated `/security-review` pass on
   `shamir.ts` + `orgEscrowCrypto.ts` before ship.

## Definition of Done

- [ ] Both halves' suites green; the server suite includes the full session auth matrix.
- [ ] `research/module_server.md` and `module_extension.md` describe the endpoints, the wrap and
      both ceremonies; the "threshold is a courtesy" note is in both code and docs.
- [ ] A full remote rehearsal: 3 officers on 3 machines, one target, break-glass to a re-keyed
      vault, audit line present, target's second device recovers with the new PIN only.
- [ ] `/security-review` run on the new crypto modules; findings addressed before release.
- [ ] Follow-up rotation plan extracted; this plan promoted with deviations recorded.
