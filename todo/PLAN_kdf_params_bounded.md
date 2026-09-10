# PLAN — a blob names only the KDF costs this build has ever written

> Status: **plan only, nothing implemented yet, 2026-09-10.** Scope: `src_vs_code/src/cryptoUtils.ts`, its tests.
> Audit finding **#6** of [REVIEW_product_audit_2026-09-09.md](REVIEW_product_audit_2026-09-09.md),
> re-verified 2026-09-10 (§Перепроверка).
>
> Related docs: [module_extension.md](../research/module_extension.md) (envelope, KDF),
> [PLAN_envelope_mac_required.md](PLAN_envelope_mac_required.md) (the MAC that would have caught this — after the cost).

## Symptom

`paramsOf` (`cryptoUtils.ts:180-186`) takes `kdfN`, `kdfR`, `kdfP` from the file whenever they are
numbers and hands them to scrypt (`deriveKey` `:151-158`, `deriveKeyAsync` `:167-176`). `maxmem` (300 MiB,
`:86`) bounds `128·N·r`; it bounds **`p` by nothing** — `p` multiplies time at constant memory. Audit
measurement on a synthetic blob: `p` 1 → 128 took one open from **3 ms to 213 ms**, then both reported
`wrong-password`.

The path is reachable without a person: background sync unlocks with the stored PIN
(`syncManager.ts:445` → `vaultKeys.ts` `silentPin` `:419-426` → `unwrapWithPinAsync` `keyWrap.ts:376-384`
→ `openBlobAsync` `cryptoUtils.ts:410-418` → `paramsOf(wrap)`). A write-capable attacker at the sync
location sets `kdfP` on the PIN wrap and every device that syncs burns a libuv thread for as long as they
chose; four such blobs exhaust the pool that also serves the extension's file I/O. The MAC covers
`kdfN/kdfR/kdfP` (`macMaterialV3`, `:629`) but can only be verified with the master key — after the unwrap
it should have bounded. With the MAC stripped (finding #2) the burn is silent as well.

## What must be true when this is done

1. An open refuses, before deriving anything, every parameter set this build has never written.
2. Every parameter set this build *has* written still opens: no fields (legacy, `N=2^15`), `N=2^15`,
   `N=2^17`, all with `r=8`, `p=1`.
3. Raising the cost in a future release is one edit in one place.

## Design

`checkedParams(blob): ScryptParams` beside `checkedSalt` (`:371-384`), called by `openBlob` and
`openBlobAsync` in place of `paramsOf`:

- `N`: an integer power of two, `2^14 ≤ N ≤ 2^18`. `LEGACY_SCRYPT_N` and `DEFAULT_SCRYPT_N` are inside;
  `2^18` is the most `maxmem` admits at `r=8` and leaves one doubling for a future raise.
- `r`: exactly `SCRYPT_R` (8). `p`: exactly `SCRYPT_P` (1). No writer here has produced anything else
  (`:83-84`; `sealWithKey` and the wrap writers all use the constants).
- Anything else — a non-integer, `NaN`, negative, an unexpected combination —
  `BackupError('corrupted', 'Encrypted data names KDF parameters this build does not accept.')`.

The bound is a list of *accepted* values, not a ceiling: a ceiling on `p` of, say, 16 would still let an
attacker make every sync sixteen times slower than the owner chose. The values live in one constant,
`ACCEPTED_SCRYPT` (rule 3).

**Not done, and why:** the audit also asks for a cap on concurrent unwraps and a cancellable execution.
With the parameters pinned, the cost of an open is the cost the owner chose when the vault was written;
the concurrency is then the concurrency of legitimate syncs, and a Promise timeout that cannot stop a
running scrypt would only add a second way to be told "slow". Recorded as the deviation.

## Build order

1. RED: `cryptoUtils.test.ts` — `'a blob naming p=128 is refused before any key is derived'`: seal with
   the defaults, rewrite `kdfP`, open with the right passphrase → expect `corrupted`; today
   `wrong-password` after the full derivation (assert the kind; the timing is the audit's evidence, not
   the test's).
2. RED: the table below as one parameterised test.
3. `checkedParams` → GREEN.
4. GREEN guard: the existing legacy / `2^15` / `2^17` fixtures and `envelopeAad.test.ts`'s `V3_FIXTURE`
   still open; `keyWrap.test.ts` PIN-wrap round trips still pass.
5. `npm run typecheck`; full `npm test`.
6. `module_extension.md` (KDF: the accepted set); `CHANGELOG.md`.

## Test plan

| `kdfN` / `kdfR` / `kdfP` | Verdict |
|---|---|
| absent / absent / absent | opens (legacy 2^15) |
| 2^15 / 8 / 1 · 2^17 / 8 / 1 · 2^14 / 8 / 1 · 2^18 / 8 / 1 | opens |
| 2^17 / 8 / 128 | corrupted |
| 2^17 / 16 / 1 | corrupted |
| 2^20 / 8 / 1 · 3·2^15 / 8 / 1 · 2^13 / 8 / 1 | corrupted |
| 0.5 / 8 / 1 · NaN / 8 / 1 · −2^15 / 8 / 1 · "32768" (string) / 8 / 1 | corrupted (a string is "absent" today — it becomes refused: a typed value that is not a number is not legacy) |

## Definition of Done

- [ ] All tests above; RED and GREEN reported.
- [ ] `npm run typecheck`, `npm test` green.
- [ ] `module_extension.md` and `CHANGELOG.md` updated.
- [ ] `coai` plan → `proceed`, code round run, findings resolved.
- [ ] Promoted to `research/` with deviations recorded.
