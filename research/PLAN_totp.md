# PLAN — TOTP: store an authenticator seed, show and copy the current code

> Status: **IMPLEMENTED, 2026-08-25.** Scope: `src_vs_code/src/` — a new secret field on every
> entity kind that has a login, the viewer, the form, the tree, and every place that enumerates the
> secret-field set.
>
> Related docs: [module_extension.md](module_extension.md),
> [PLAN_audit_roadmap_2026_08_25.md](PLAN_audit_roadmap_2026_08_25.md) (item **D2**).
>
> **Deviations from the plan, and what they cost.**
>
> - **The seed is stored as the canonical `otpauth://` URI, not as raw bytes plus columns.** The plan
>   said this; what it did not anticipate is that it makes the whole feature one string in one
>   SecretStorage key, so every enumeration site took a one-line change rather than five.
> - **`Copy All` excludes the code, as planned** — and the form's Steam checkbox turned out to need a
>   composer (`withSteamEncoder`), because Steam seeds are exported as bare base32 with nothing marking
>   them as Steam's.
> - **The viewer exception is the load-bearing decision** and it is worth restating: the panel receives
>   the derived CODE, never the seed, on the same reasoning the image preview already used. The test
>   asserts the rendered HTML contains neither.
> - **The tree token comes from a plaintext `hasTotp` flag**, deliberately, so expanding a folder makes
>   no keychain call per row — the C1 defect the audit records was not repeated here.
>
> **Open tail:** none of the plan's scope. What it did NOT include, and nobody has asked for: importing
> seeds from another manager's export (that is item D4), and a QR-code reader (a webview cannot see a
> screen, so the URI or the base32 secret is the only honest input).

## Symptom

SSH hosts, VPN gateways, cloud consoles and database proxies increasingly demand a second factor, and
the one-time code lives in a phone app or a second desktop program. Every competitor in the audit's
comparison (1Password, Bitwarden, KeePassXC, Proton Pass) stores the TOTP seed next to the password and
shows the live code; this extension has no field for it, so the person who keeps the login here still
has to keep a second application open to use it.

## Goal

- An entity carries an optional **TOTP seed** as an `otpauth://` URI (or a bare base32 secret), stored in
  SecretStorage like every other secret and carried by sync, backups, shares, external export and the
  revision history.
- The read-only viewer shows the **current code with a countdown** and a Copy button; the tree offers
  **Copy One-Time Code** on entities that have a seed. Copies expire through `secretClipboard.ts`.
- The Steam Guard variant (5-character alphanumeric code) is supported through `encoder=steam`.

## Where it plugs in (verified 2026-08-25)

| Concern | File | Today |
|---|---|---|
| Secret key scheme | `storageManager.ts:37-79` | one `xSecretKey()` per field; `:totp` joins them |
| Delete loops | `storageManager.ts:150-175`, `:277-318` | every field deleted per entity |
| Export / import / snapshot | `storageManager.ts:538-702`, `syncMerge.ts:39-52,62-75,113-137,166-223`, `syncManager.ts:374-385` | one record per field |
| Wire shapes | `types.ts:288-297` (`SharePayload.secrets`), `:358-384` (`BackupBundle`), `:525-581` (`isBackupBundle`) | |
| External export | `externalBundle.ts:13-21`, `extension.ts:1247-1266`, `:1380-1398` | |
| Form save path | `extension.ts:2462-2499` (`applySecrets`), `:2542-2553` (revision snapshot) | |
| Viewers | `extension.ts:2725-2783`, `:2786-2901`; `entityViewPanel.ts` | the viewer never receives a secret — one exception, the image preview (`entityViewPanel.ts:46-48`) |
| Form | `entityFormPanel.ts:68-83` (`EntityFormValues`), `:284-356` (`toValues`), `:717-729` (`passwordSection`), `:826` (visibility) | |
| Tree token | `treeDataProvider.ts:442-484` | capability tokens from plaintext flags — never a keychain read per row (C1) |
| History | `revisionHistory.ts:26-32,58` | `SMALL_FIELDS` |
| Crypto | `cryptoUtils.ts` | no base32, no HMAC-SHA1 — a new pure module is genuinely new |

## Design

1. **`totp.ts` (pure, `vscode`-free).** `decodeBase32`, `parseTotpSecret(text)` (an `otpauth://totp/…`
   URI or a bare base32 secret → a canonical `TotpConfig` + canonical URI), `totpCode(config, nowMs)`
   (RFC 6238 over HMAC-SHA1/256/512, 6–8 digits, any period; Steam's 26-character alphabet when
   `encoder=steam`), `totpRemainingMs(config, nowMs)`. Tested against the RFC 6238 vectors.
2. **Storage.** The canonical URI is the stored secret (`${accountId}_${entityId}:totp`), so algorithm,
   digits and period travel with the seed. `EntityMetadata.hasTotp?: boolean` is the plaintext flag the
   tree's `:totp` token is built from — a flag, not the seed, exactly as `isVpn` drives `:vpn`.
3. **The viewer receives the CODE, never the seed.** The second documented exception to "the viewer never
   receives a secret": a code that must be *read* cannot round-trip through the host. The host posts
   `{type:'totp', code, validUntil, period}`; the page draws the countdown and asks for a refresh when it
   expires; Copy still round-trips through `resolveSecret('totp')` so the clipboard TTL applies.
4. **`Copy All` excludes the code** — it is stale within a period, unlike every other field in that block.
5. **Form.** A `totpSection` fieldset (paste the URI or the secret, a Steam checkbox, `Clear` when one is
   stored), visible for `credential`, `ssh`, `db`, `vpn`. The page script validates the shape; the host
   canonicalises and refuses an unparsable seed with a warning rather than storing junk.

## Build order

1. `totp.ts` + `totp.test.ts` (RED on the RFC vectors first).
2. Storage + wire shapes + sync + history + external bundle, with `storageHistory`/`syncMerge`/`types`
   tests extended.
3. Form + viewer + tree token + `copyTotpCode` command + manifest.
4. Docs: `module_extension.md`, README feature table + commands, CHANGELOG.

## Test plan

- RFC 6238 Appendix B vectors for SHA1/SHA256/SHA512 at the six listed timestamps.
- `parseTotpSecret`: URI with issuer/digits/period/algorithm, bare base32 with spaces and lowercase,
  Steam `encoder=steam`, refusals (bad alphabet, unknown algorithm, digits outside 6–8).
- `mergeProfiles` carries `totps` with the winning node; `fingerprint` changes when a seed changes.
- `pushRevision` keeps `totp`; `isBackupBundle` accepts and rejects the new record.
- Manifest: `copyTotpCode` reachable from a menu gated by `:totp`.
- Webview: the viewer page script still parses with a TOTP row rendered; the form has exactly one
  `totpSection`.
- **The seed never reaches the webview**: the rendered viewer HTML for an entity with a seed does not
  contain the seed.

## Definition of Done

- [ ] Every secret-field enumeration site in the table above carries `totp`.
- [ ] Viewer shows a live code with a countdown; tree offers *Copy One-Time Code*; both copies expire.
- [ ] Tests above green; `npm test` green.
- [ ] `module_extension.md`, README, CHANGELOG updated; this plan promoted.
