# PLAN — Security/reliability audit follow-ups (code items shipped)

> Status: **IMPLEMENTED, 2026-08-21 (v0.19.0–v0.22.0).**
>
> The 2026-08-21 four-agent audit fixed the clear items; the six follow-ups
> below (#1–#6) each needed a decision or a data-migration step and have all
> shipped across v0.19.0 (KDF), v0.21.0 (envelope MAC, PIN re-key, remote-vault
> deletion, notes → SecretStorage) and v0.22.0 (version-vector merge).
>
> Deviations / accepted residuals: #3's envelope MAC deliberately excludes the
> `shares` array (cross-user appends a single owner key can't authenticate) —
> folder-transport share-metadata forgery is mitigated by steering teams to the
> server transport; #4 re-wraps the PIN wrap but does not mint a fresh master
> key (full method-wide revocation left unshipped).
>
> The audit's **server operational items** (not code-fixable here) were the one
> unfinished phase and were extracted to [PLAN_server_ops.md](PLAN_server_ops.md).

## 1. KDF cost — DONE (2026-08-21, v0.19.0)
Every sealed blob now records `kdfN`/`kdfR`/`kdfP` in its header
(`cryptoUtils.ts`). New blobs are written at **N=2^17** (r=8, p=1, maxmem
raised to ~300 MiB); a blob without the fields is read at the original
N=2^15, so existing vaults keep opening. The params ride inside the vault
envelope (folder + opaque server blob) and through share items on both
transports (extension `ShareItem` + server `Models`/`Program` carry
`kdfN/kdfR/kdfP`). A vault re-encrypts at the new cost on its next write
after unlock. Verified: unit tests (legacy vs new blob) + the server
transport itest (an N=2^17 share survives POST→GET and decrypts).

## 2. Cross-machine merge trusts client `updatedAt` — DONE (2026-08-21, v0.22.0)
Replaced the timestamp-only merge with **per-device monotonic version vectors
(vector clocks)**. New module `versionVector.ts` (pure vector algebra: merge,
`covers`/`dominates`/`concurrent`, `bumpVector`, `lastWriter`, tombstone
normalization). `syncMerge.ts` now resolves conflicts **causally**: the
dominating vector wins; truly concurrent edits fall back to `updatedAt` then to
the lexicographically-greater last-writer `deviceId` (order-independent, both
machines converge to the same winner). Each machine holds a persistent
`deviceId` + monotonic `seq` (`storageManager.ts`); every add/update/move stamps
the node's vector. Tombstones are now `{deletedAt, v}` (legacy bare-number
tombstones migrate on read). A per-profile **horizon** (element-wise max of
every vector ever seen, never pruned) is persisted so tombstones can still be
hard-deleted at the 90-day TTL **without** resurrection: a node restored from a
stale backup whose vector the horizon already covers is rejected as a phantom.
Legacy pre-vector nodes (empty vector) keep the old `updatedAt`/tombstone-time
behaviour and adopt a vector on first write. `types.ts` `BackupBundle` /
`isBackupBundle` and the transport snapshot carry `horizon` + object tombstones
(server blob stays opaque — no server change). Verified: 66/66 extension unit
tests including the three required scenarios (concurrent edits on different
devices; a >90-day stale backup rejected after tombstone GC; legacy/non-vector
merge) + the server transport itest round-trips the new payload.

## 3. Envelope plaintext metadata unauthenticated (folder transport) — DONE (2026-08-21, v0.21.0)
`cryptoUtils.ts` now embeds an HMAC-SHA256 `mac` in the envelope, keyed by an
HKDF of the master key (`cred-ssh-manager/envelope-mac`), over
`{format,version,account,wraps}`. `verifyEnvelopeMac` returns `ok|missing|bad`;
`syncManager` verifies it on every v2 unlock and warns on tamper;
`resignEnvelopeWraps` re-MACs after a legitimate `wraps` change. This closes
`account`/`wraps` forgery and the wrap-deletion lockout on the folder transport.
**Known residual (accepted):** the MAC deliberately excludes `shares` — those
are cross-user appends a single owner key can't authenticate — so share-metadata
forgery/replay on the folder transport is addressed by an **architectural
boundary decision (2026-08-21):** the NAS folder transport is for personal /
solo sync only, and the **server** transport (which stamps `fromEmail` from the
OAuth token) is the single recommended standard for teams. Documented in
`README.md` ("Which transport for what"). A NAS-only cryptographic alternative
(Ed25519 sender signatures + key pinning + a fingerprint check) is designed as
**backlog / optional** in [todo/PLAN_nas_sender_pki.md](PLAN_nas_sender_pki.md)
— it stays TOFU-based, so the server remains the stronger answer.

## 4. PIN change does not re-key (multi-key vaults) — DONE (2026-08-21, v0.21.0)
`syncManager.setPin` now re-keys via `rekeyToNewPin`: a v2 vault re-wraps the
master key under the new PIN (the `pin` wrap is rotated, other method wraps left
intact); a v1 vault re-encrypts under `accountId + newPIN`. The cached-guess-only
behaviour is gone. Full master-key rotation (mint a fresh master key and re-wrap
every method — needs each YubiKey touched) remains a deliberately-unshipped
stronger option, not required for the PIN-change case.

## 5. Account removal leaves the remote vault/shares in place — DONE (2026-08-21, v0.21.0)
Account removal now offers to also delete the remote copy. Server transport:
`DELETE /api/vault` removes the blob, its `.email`/team entry and the inbox;
folder transport: the `vault_*.enc` is deleted. Local-only removal is still
possible (the delete is offered, not forced).

## 6. `notes` is stored in globalState plaintext, not SecretStorage — DONE (2026-08-21, v0.21.0)
`notes` now live in SecretStorage (`storageManager` `getNotes`/`setNotes`, key
`${accountId}_${entityId}:notes`). Export/import/merge carry a `notes` map;
legacy plaintext `details.notes` is migrated to the secret on export and stripped
on import. The viewer and Copy-All resolve the note from SecretStorage.

## Server operational items

Extracted to [PLAN_server_ops.md](PLAN_server_ops.md) — they are
infrastructure/deployment decisions for `cred-vault-server`, still open.
