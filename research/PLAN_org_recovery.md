# PLAN — corporate break-glass recovery of personal vaults (Shamir 2-of-N)

> Status: **IMPLEMENTED, 2026-08-27** — steps 1–9 of the build order are built and tested on
> both halves. Step 10 (a cheap officer-roster rotation that re-splits the existing key instead
> of running a fresh ceremony) is deliberately not built and is extracted below as the open tail.
> Owner decisions recorded 2026-08-27; every deviation is recorded against its step.
>
> **Not yet rehearsed end to end.** Every part has tests on its own side, but the DoD's live
> three-machine rehearsal — three officers, one target, a real recovery — has not been run, and
> until it has, this is a feature that passes its tests rather than one that is known to work.
>
> Related docs: [module_server.md](module_server.md),
> [module_extension.md](module_extension.md),
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

1. ~~Contract doc first~~ — **revised 2026-08-27, and the revision matters.** Writing unbuilt
   endpoints into `research/module_server.md` would break the folder rule that document lives
   under: `research/` describes the system **as it is**, and a reader would take the table as
   built. The contract therefore stays in THIS plan until each endpoint ships, and
   `module_server.md` is updated as each one lands — which is what happened for
   `/api/org-recovery/config` below. Rule 6's intent (one statement both halves implement
   against) is met by the plan for the unbuilt half and by the module doc for the built half.
2. ~~**R2**: `vaultRekey.ts` extraction~~ — **shipped 2026-08-27** (`199c12f`), brought forward
   because the recovery-code work needed it: `rekeyUnderPin` is the one place a master key
   rotates, both former branches repointed, and it reports a recovery code it could not carry.
3. ~~**Extension pure crypto**~~ — **step complete 2026-08-27**: `shamir.ts`,
   `orgEscrowCrypto.ts`, the `'org-escrow'` `KeyWrap` kind, and the forward-compat wrap
   filtering. What it landed with, worth keeping:
   - **Forward compat was a live defect, not a precaution.** Red first: registering a security
     key on a vault holding an unknown wrap kind deleted that wrap and re-signed the envelope —
     `actual: undefined`. `KeyWrap.kind` is now a plain `string`, the guard is structural, and
     routing goes through `isKnownWrapKind`. A wrap this build cannot USE is one it must CARRY;
     a malformed one is still refused.
   - The escrow wrap is the only kind nobody can open when it is written, so it must never be
     an unlock option — `UnlockFacts` has no field for it, asserted **structurally** by a test,
     because the failure mode is a later contributor helpfully adding one.
   - Shamir is **not authenticated** by construction, and too few shares return a well-formed
     WRONG secret rather than an error — pinned by test. `mintShareSet`/`verifyRecombined` carry
     an HKDF-HMAC tag bound to the roster shape; that tag, never the server's count, is the gate.
   - The field multiply is checked against an **independent log/antilog implementation over all
     65 536 pairs**, and the zero-information property (one share leaves all 256 secret bytes
     possible) is computed with that independent multiply so a bug cannot agree with itself.
     No third-party vectors were copied; this is stronger and needs no attribution.
   - Fingerprints reuse the existing `keyFingerprint` from `shareSignature.ts` rather than
     inventing a second spelling.
4. ~~Server phase 1: config + guard + `GET /api/org-recovery/config`~~ — **shipped 2026-08-27**
   (`OrgRecovery.cs`, 11 tests, documented in `module_server.md`). Deviations worth recording:
   - The endpoint is readable by **any allowed caller**, not officers only, and that became a
     test rather than a comment: enrolment is automatic and unconsented, so a person whose
     secrets a quorum can recover must be able to see that and who they are.
   - `enabled` and `setupComplete` are two fields, not one. Collapsing them is how a client
     would try to enrol against a key the ceremony has not minted yet.
   - The guard normalises duplicates and casing **before** counting, because three entries
     naming two people would otherwise pass as a 2-of-2 in disguise — the exact shape the
     three-officer minimum exists to refuse.
   - A configured roster logs at **Warning** on startup. It is the one setting that changes what
     happens to other people's vaults.
5. ~~Server phase 2: invites + setup + maintenance sweep~~ — **shipped 2026-08-27**
   (`OrgRecoveryStore.cs`, `OrgRecoveryMaintenance.cs`, five endpoints, 15 tests). Deviations:
   - **Republishing is idempotent, not refused.** The plan said `409` when `setupComplete` is
     already true, which would have made a retry after a dropped response impossible and left
     no route for a hard rotation. Same `setupId` + same key → `200`; same `setupId` + a
     *different* key → `409`, because that is a swap rather than a retry.
   - **Two refusals the plan did not name**, both found while writing the auth matrix: a
     recipient outside the roster (an officer could otherwise seat a share with an accomplice
     and turn 2-of-3 into something one person controls), and a split whose
     threshold/total disagrees with the roster (clients pin a fingerprint saying "2 of 3";
     shares minted 2-of-5 would implement another scheme behind that pin).
   - **A stale published key reads as "setup not complete."** If the roster changes after a
     ceremony, the officers holding shares are not the officers the server now names, so
     clients must refuse to enrol rather than seal to a quorum that no longer exists.
   - **AOT caught the streaming at build time** (`IL2026`/`IL3050`): the source generator has no
     converter for `IAsyncEnumerable`. Both listings now go through one `WriteJsonArrayAsync`
     instead of the share inbox's hand-rolled copy plus a second one.
6. Extension: setup ceremony + officer panel + TOFU pinning + transparency UI.
7. ~~Extension: the escrow wrap on every sync write~~ — **shipped 2026-08-27**
   (`orgEscrowOps.ts`, `orgRecoveryClient.ts`, 23 tests). Deviations:
   - The function is `escrowAction`/`applyEscrowAction`, not one `ensureOrgEscrowWrap`: the
     caller shows a different sentence per reason, so the DECISION is worth reading on its own
     and the mechanical half must not be able to disagree with it.
   - **An untrusted key REMOVES an existing wrap**, which the plan did not say. Declining to
     add is not enough — a wrap already sealed to a substituted key keeps paying out on every
     version written before the swap was noticed.
   - `VaultKeys.encrypt` took an optional wrap list rather than the caller editing `key.wraps`:
     `detachVaultKey` shares that array with the cached key, so an in-place edit would rewrite
     the cache under whoever else holds it.
   - A resolver that throws cannot stop a sync. Corporate recovery being unreachable is a
     reason to leave the wraps alone, never a reason for somebody's own secrets to stop syncing.
8. ~~Server phase 3: sessions + target-vault gate + audit~~ — **shipped 2026-08-27**
   (7 endpoints, 10 tests, session expiry folded into the maintenance pass). Deviations:
   - **The write-back is conditional** (`If-Match` → `412`). The target may still have a machine
     online; break-glass is not a licence to clobber a write made while the quorum gathered.
   - **A non-initiator officer gets `404`, not `403`** — somebody who did not start a session has
     no business learning it exists or whose vault it concerns.
   - **Contributions are upserted by officer.** Retrying is a person retrying; counting it twice
     would let one officer alone satisfy a threshold of two, which is the most tempting way to
     defeat this and is now its own test.
9. ~~Extension: break-glass ceremony end-to-end~~ — **shipped 2026-08-27**
   (`breakGlass.ts`, `orgShareEnvelope.ts`, `orgRecoveryPanel.ts`, five commands, 9 tests).
   Deviations:
   - **The recovery combines SUBSETS, not the first `threshold` blobs.** Interpolation over a
     wrong subset does not fail — it returns a well-formed key that is simply not the right one —
     so each candidate is checked against the integrity tag. A contribution that will not even
     decrypt is dropped rather than fatal: one officer resealing to a stale session must not stop
     the others.
   - **The contribution carries its share index.** The plan's wire shape had no place for it, and
     without it the shares are points on a curve with no x — not interpolable at all. Not secret:
     a coordinate is not a value.
   - **The re-key binds to the TARGET's accountId**, read from the envelope's plaintext header,
     not the recovering officer's — a PIN wrap is bound to its owner, and the header is plaintext
     precisely so a restore knows whose vault it holds before opening anything.
   - **The session keypair is memory-only**, in the window that started the recovery. Writing it
     anywhere would put the means to decrypt a quorum's key material on disk beside it.
   - An officer's share lives in **SecretStorage**, not the vault payload: a share that synced
     would sit beside the very escrow wraps it exists to open.
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
- [x] `/security-review` run on the new crypto modules 2026-08-27; **all seven findings addressed** (commits `60dc195`, `f392f40`, `2125e03`, `3681641`, `c61ab64`, `6236478`, `c2f095f`). The primitives came through clean — field arithmetic checked exhaustively, secrecy measured, no key or nonce reuse, no weak randomness; every defect was in the wiring. Two were severe: the TOFU pin was never written and the sync resolver never assigned, so the feature's central defence was inert and no vault enrolled at all; and the break-glass session key was taken from the server unverified, which a compromised relay could use to harvest a quorum. Both closed, with a structural test that fails if either is ever unwired again.
- [ ] Follow-up rotation plan extracted; this plan promoted with deviations recorded.
