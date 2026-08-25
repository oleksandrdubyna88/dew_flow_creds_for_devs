# PLAN — retire the v1 vault envelope: every vault is v3 (wrapped/HKDF), PIN-only included

> Status: **IMPLEMENTED, 2026-08-25.** Scope: the sync vault envelope — `vaultKeys.ts`,
> `keyWrap.ts`, `syncManager.ts`, `cryptoUtils.ts` (read only).
>
> Related docs: [module_extension.md](module_extension.md),
> [SECURITY_REVIEW_2026-08-25.md](SECURITY_REVIEW_2026-08-25.md) (finding 4's deferred tail, now closed).
>
> **Deviations from plan:** implemented as designed, then extended. (1) Added an end-to-end "migrate a
> v1 file → the SAME PIN opens the v3, data preserved" safety test. (2) **Backups were brought in
> scope** on a follow-up request: the NAS backup (`backupManager`) now writes v3 too. Its standalone
> backup PIN is kept — a v3 backup is a self-contained pin-wrap under that PIN, opened without touching
> the per-account key cache. `backupWriteMode` was re-keyed off a **security-key** wrap (not "any wrap")
> so a pin-only backup routes to the standalone-PIN path and cannot collide with the sync master. Dated
> snapshots (`backupScheduler`) already copy the sync-vault ciphertext, so they are v3 for free. 506
> tests green.

## The goal

A PIN-only vault is written in the **v1** envelope: the payload key is `scrypt(accountId+PIN)`
with a fresh salt per file ([cryptoUtils.ts](../src_vs_code/src/cryptoUtils.ts) `sealBlob`). The
salt changes every write, so the derived key cannot be cached — scrypt (~1 s, ~128 MiB) runs on
**every read and every write**. The **v3** envelope encrypts the payload with a random master key
via cheap HKDF and stores that master key once in a **pin-wrap** (`scrypt(accountId+PIN)` over the
master key). Unlock unwraps once, caches the master, and every later op is HKDF. Today v3 is created
only when a security key is registered; a PIN-only user stays v1 forever.

Two requirements:
1. **Migrate every existing v1 vault to v3** on its next write (its next sync/backup).
2. **New PIN-only vaults are v3 from the start** — no v1 is ever written again.

Both fall out of one rule: **there is no v1 write path.** Every write produces v3; a v1 key is
upgraded to a master + pin-wrap at write time.

## Design

- **`VaultKey`'s v1 variant carries the PIN** (`{ version: 1; passphrase; pin }`), so a write can
  build a pin-wrap. Only one construction site (`vaultKeys.ts:184`).
- **`keyWrap.wrapPinVault(payload, accountId, pin, createdAt, account?, shares?)`** — pure, vscode-free:
  generate a random master key, `wrapWithPin` it, `encryptJsonWrapped` the payload under it, return
  `{ content, masterKey, wraps }`. This is the whole migration, and it composes existing pieces.
- **`VaultKeys.encrypt` never writes v1.** A v2 key writes wrapped as today; a v1 key calls
  `wrapPinVault`, caches the new `{masterKey, wraps}` for the account (so this session's later
  unlocks are v2), and returns v3 content. A read in the same cycle already happened with the v1
  key, so decrypt of the old v1 file is unaffected.
- **`syncManager.syncProfile` forces a migrate-write** when the file it just read was v1 (`raw !==
  undefined && key.version === 1`), so an idle v1 vault migrates on the next cycle rather than only
  when something changes. A failed v1 decrypt still throws `BackupError` *before* the write, so a
  wrong PIN can never overwrite an unreadable file — the migration only fires after a good decrypt.
- **`rekeyToNewPin`'s v1 branch** also migrates: build a pin-wrap under the new PIN and write v3,
  instead of re-encrypting v1.
- **New vaults**: a brand-new account has no file, so unlock returns a v1 key and the first sync
  write goes through `VaultKeys.encrypt` → v3. Nothing special needed.

Unlock already opens a pin-only v3 file: `unlockPlan` routes a `pin`-wrap with no key-wrap through
`silentPin` → `unwrapWithPin`. Reading v1 stays supported forever (no forced conversion of a file we
cannot write to).

## Concurrency note (acceptable at current scale — 2 users)

If the *same* account on two machines both migrate in the same instant (each generating its own
master before either reads the other's push), the two v3 files carry different masters and the
loser's cached master will fail to open the winner's file → that cycle throws and sync pauses until a
reload (which clears the cache and re-reads the master from the file's wrap). Normal operation avoids
this: a cycle reads before it writes, so the second machine reads the first's v3 and adopts its
master before ever generating one. Documented rather than engineered around, per the operator's call.

## Backups (added on follow-up — now in scope)

The NAS backup (`backupManager`) also writes v3 on the next backup, keeping its **standalone backup
PIN**: a v3 backup is a self-contained pin-wrap under that PIN (`wrapPinVault`), opened on restore with
the same PIN (`unwrapWithPin`) — never through `vaultKeys`, whose per-account cache would shadow the
sync master with the backup's freshly-minted one. `backupWriteMode` now routes off a **security-key**
wrap: a backup with a webauthn slot is vault-keyed (its master IS the sync master, safe to share the
cache); a pin-only or v1 backup goes to the standalone-PIN path. A legacy v1 backup still restores with
its PIN. Dated snapshots (`backupScheduler`) copy the sync-vault ciphertext and never touch a key, so
they became v3 the moment the sync vault did — no change needed.

## Build order

1. `keyWrap.wrapPinVault` + red-first round-trip test (v3, opens with PIN, wrong PIN fails).
2. `VaultKey` v1 += `pin`; `unlock` construction; `VaultKeys.encrypt` upgrade path.
3. `syncManager` force-write on v1; `rekeyToNewPin` v1 branch.
4. Full suite; verify no v1 is written and a migrated vault round-trips.

## Test plan

- `keyWrap.test.ts`: `wrapPinVault` produces a version-3 envelope, `unwrapWithPin` recovers the
  master, `decryptJsonWithMasterKey` recovers the payload, a wrong PIN does not.
- Existing `cryptoUtils`/`keyWrap` round-trip and MAC tests stay green (v3 read/write unchanged).
- Full extension suite green.

## Definition of Done

- [x] No code path writes a v1 envelope; `encryptJson` (v1) is used only where it still must read old files.
- [x] `wrapPinVault` is tested red-first; the migrated envelope round-trips and rejects a wrong PIN.
- [x] A v1 vault migrates on its next sync; a new PIN-only vault is v3 on first write.
- [x] `module_extension.md` updated (v1 is now read-only/legacy; every write is v3).
- [x] Plan promoted to `research/` with deviations recorded.
