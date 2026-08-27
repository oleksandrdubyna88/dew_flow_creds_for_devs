# PLAN — a printable recovery code as a third KeyWrap

> Status: **plan only, nothing implemented yet.** Scope: `src_vs_code` only (keyWrap,
> securityKeyOps, unlockPlan, vaultKeys, backupPlan, two new modules, extension commands).
>
> Related docs: [module_extension.md](../research/module_extension.md),
> [PLAN_audit_roadmap_2026_08_25.md](PLAN_audit_roadmap_2026_08_25.md) (item **D9**, first half),
> [PLAN_org_recovery.md](PLAN_org_recovery.md) (the corporate tier built on top of this).

## The symptom

A vault has exactly two ways in: the PIN (in a head) and a security key (in a pocket). Lose both —
forgotten PIN after a holiday, a YubiKey through a washing machine — and the vault is
cryptographically gone, which is correct behaviour for an attacker and a disaster for the owner.
Every serious credential manager ships a third, offline factor for exactly this: a printed
high-entropy code in a drawer. Roadmap D9 named it
([PLAN_audit_roadmap_2026_08_25.md:233-235](PLAN_audit_roadmap_2026_08_25.md)); the wrap slots it
needs have existed since v2 (`keyWrap.ts`).

## The design

**Code format:** `RC1-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-CCCC` — 30 symbols of Crockford Base32
(no `I L O U`), drawn with `crypto.randomInt(32)` (uniform, 32 is a power of two), = **150 bits
exactly**, reported unrounded per the `pinPolicy.ts:96-101` ethos. `CCCC` is a deterministic
checksum (`SHA-256('cred-ssh-manager/recovery-checksum:' + core)`, first 4 bytes mapped into the
alphabet — 256 % 32 = 0, unbiased) so a typo is caught locally before any decrypt attempt.
Parsing is case-insensitive, ignores spaces/dashes, and maps the Crockford confusables
(`O→0`, `I/L→1`).

**Wrap:** a third `KeyWrapKind: 'recovery'`, constant `id: 'recovery'` (mirrors `id: 'pin'`,
`keyWrap.ts:90`), **one per vault** — `upsertWrap` (`keyWrap.ts:242-245`) makes replace-on-regenerate
free. Wrapping key is **HKDF** over the 30-symbol core (info `'cred-ssh-manager/recovery-code'`,
fresh 16-byte salt per wrap), not scrypt — the input is already high-entropy, the same argument
`prfWrappingKey` (`keyWrap.ts:71-79`) and the v3 payload key (`cryptoUtils.ts:255-266`, 240 ms vs
0.18 ms measured) already make. AES-256-GCM around the master key, exactly like `wrapWithPrf`
(`keyWrap.ts:129-153`); the shared unwrap body is extracted (`unwrapMasterKey`) rather than copied.

**Envelope arithmetic** (`securityKeyOps.ts`): `envelopeWithRecoveryCode` with the same two regimes
as `envelopeWithAddedKey` (`securityKeyOps.ts:71-99`) — wrapped vault gains/replaces the one slot
around the SAME master (`rekeyed: false`); a legacy v1 key forces the upgrade (fresh master, PIN
wrap + recovery wrap, `'pin-required'` without a PIN). The near-identical v1-upgrade halves of both
add-paths are extracted into one `upgradeLegacyToWrapped`. `envelopeWithRemovedRecoveryCode` drops
the slot and re-signs — no rekey, and the caller says out loud that old copies stay openable, the
same honesty `removeSecurityKey` already practises (`extension.ts:3022-3026`).

**Unlock:** interactive-only, never stored, lowest priority. `UnlockFacts` gains
`hasRecoveryWrap`; the plan table (`unlockPlan.ts:35-52`) gains a terminal
`{ kind: 'recoveryCodeAvailable' }` before the final refuse — a *hint* shown when the degenerate
only-recovery vault meets a person; background callers still refuse. The real path is an explicit
command `credSshManager.unlockWithRecoveryCode` (precedent: `unlockWithSecurityKey`,
`package.json`), because in the real scenario the vault still HAS pin/key wraps — their holder just
lost the values — so the automatic cascade never reaches the degenerate branch. After a successful
recovery unlock, a modal **offers** (not forces) an immediate new PIN via the existing
`sync.setPin` → `rekeyToNewPin` (`syncManager.ts:146-247`), which composes for free: the recovery
unlock warmed the same cache (`vaultKeys.ts:344-350`), so `rekeyToNewPin`'s own unlock
short-circuits (`vaultKeys.ts:197-202`).

**Ceremony/print:** `credSshManager.setupRecoveryCode` follows the `addSecurityKey` handler shape
exactly (`extension.ts:2757-2830`): unlock first to prove ownership → generate → pure envelope
function → `writeVault` → `clearCache` → show the code once. The display is a dedicated webview
(`recoveryCodeView.ts`, CSP/nonce per `entityViewPanel.ts:470-472`) with a **Print** button
(`window.print()`, zero deps) and **deliberately no Copy button** — the code leaves the screen only
on paper, never through a clipboard a sync tool may mirror. The code is never persisted in
plaintext anywhere — no SecretStorage, no log; only its HKDF-wrapped form lives in the vault file.

**A found defect this fixes on the way:** `backupWriteMode` (`backupPlan.ts:37`) routes by "has a
webauthn wrap". A vault with only PIN + recovery wraps would be misclassified `{kind:'pin'}` and
the NAS backup write would silently strip the recovery wrap — the exact bug class the function's
own doc comment exists to prevent. The check becomes kind-agnostic ("any non-pin wrap") via a new
`hasVaultKeyedWrap`, RED test first.

**Known limitation, stated rather than hidden:** an older installed build's `isKeyWrap` is an
allowlist — a wrap-mutating action performed there (add/remove security key, PIN change) filters
the unknown `'recovery'` kind out. For a personal vault (machines usually run the same build) this
is a changelog note, not a migration; the corporate plan inherits the same fix.

## Build order

1. `recoveryCode.ts` + `test/recoveryCode.test.ts` (generate/parse/checksum) — RED→GREEN.
2. `keyWrap.ts`: kind, guard, `wrapWithRecoveryCode`/`unwrapWithRecoveryCode`/`recoveryWrap`/
   `hasVaultKeyedWrap`, `unwrapMasterKey` extraction + `test/keyWrap.test.ts` additions.
3. `backupPlan.ts`: RED test (pin+recovery misrouted) watched failing, then the fix.
4. `securityKeyOps.ts`: `envelopeWithRecoveryCode`, `envelopeWithRemovedRecoveryCode`,
   `upgradeLegacyToWrapped` extraction + tests (incl. "regenerate invalidates the old code").
5. `unlockPlan.ts`: fact + outcome + tests.
6. `vaultKeys.ts`: `unlockWithRecoveryCode`, `promptRecoveryCode`, the hint branch.
7. `recoveryCodeView.ts` + `test/webviewHtml.test.ts` block (script parses).
8. `extension.ts` three handlers + `package.json` commands/menus (`commandsRegistered.test.ts`
   guards the pairing).
9. Docs: `research/module_extension.md`, extension `README.md` feature table, `CHANGELOG.md`.
10. `npm run typecheck && npm run lint && npm test`.

## Test plan

- **recoveryCode**: format shape; entropy exactly 150; round-trip; case/space/dash-insensitive;
  confusable mapping; checksum catches a mistyped character (`bad-checksum`); garbage
  (`bad-format`); two generations differ.
- **keyWrap**: recovery wrap round-trips the master; wrong code → `wrong-password`; `isKeyWrap`
  accepts the new kind; pin+webauthn+recovery all open one vault; `upsertWrap` keeps one slot;
  `hasVaultKeyedWrap` truth table.
- **backupPlan**: pin+recovery-only vault → `{kind:'wrapped'}` (the RED test for the found bug).
- **securityKeyOps**: add-to-wrapped same master / `rekeyed:false`; legacy refuses without PIN;
  legacy upgrade; **regenerating replaces — the old code opens nothing**; removal drops the slot,
  never rekeys; the pre-extraction suite stays green (characterization of the refactor).
- **unlockPlan**: only-recovery + interactive → `recoveryCodeAvailable`; background → `refuse`;
  recovery never preempts pin/key.
- **webviewHtml**: the recovery view's inline script parses; the page renders the code.

## Definition of Done

- [ ] All tests above green (`npm test`), `npm run typecheck` and `npm run lint` clean.
- [ ] The backupPlan RED failure message and its GREEN are both reported in the summary.
- [ ] The code appears nowhere but the webview panel body — no log, no toast, no clipboard.
- [ ] `research/module_extension.md`, extension `README.md` and `CHANGELOG.md` updated.
- [ ] This plan promoted to `research/` with deviations recorded.
