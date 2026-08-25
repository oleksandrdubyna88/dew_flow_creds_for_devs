# Security, performance & resilience review — 2026-08-25, post-merge hardening

> Scope: the ~46 commits (~10,300 insertions) merged on 2026-08-24–25 — the AI-agent SSH
> broker, vault format v3, Ed25519 share signatures, external export/import, scripts,
> per-window ACLs, the sign-in scope-discovery feature, and Ctrl/Shift multi-select. Three
> parallel reviews (security · performance · resilience), each verified against the code
> before it was believed, then compared to the day-before-launch review it follows.
>
> Predecessor: [SECURITY_REVIEW_2026-08-24.md](SECURITY_REVIEW_2026-08-24.md). None of its
> "fixed" items were re-opened here; this review covers what the merge that followed it added.

## The short version

Ten findings were confirmed in code and fixed, each red-first with a regression test. Two
were data-loss / RCE class and reachable through normal use, not misuse; the seven high/medium
that followed were taken in the same pass. The bulk of the new surface held up: the broker's
loopback binding, bounded ceilings, per-call key materialization and consent gate; the v3 MAC
covering the sealed blob; the Ed25519 sender-signature downgrade handling; the server's atomic
writes, striped locks and ETag path; and the deploy stack's health-gated rollback with verified
backups. 502 extension tests pass (+40 new).

## Fixed (all on `master`, red-first)

| # | Sev | Finding | Fix | Commit |
|---|-----|---------|-----|--------|
| 1 | **CRITICAL** | The agent DB action handed a stored Postgres connection string to `psql` as a bare positional argv — no `--`, no leading-dash rejection. A `dbConnection` arrives by sync / Accept Share / import, so `-o\|command` (psql's pipe-to-shell) was reachable as attacker data on the first agent call. The exact class the ssh path already closed, not applied here. | `isSafePostgresUri` proves the string is a real `postgres://` URL before use; the launcher emits `-c query -- <uri>` so the string is an unambiguous positional. | `2bbdb19` |
| 2 | **CRITICAL** | Auto-lock wiped the master-key `Buffer` in place, and `unlock()` returned that same cached Buffer — so the 60-second lock tick firing mid-sync zeroed the key a cycle was still sealing with. AES-GCM/HKDF accept an all-zero key and seal a permanently undecryptable vault, pushed to the shared location with no error. | `detachVaultKey` hands each caller its own copy; `lock()` still zeroes the cached original. Pure vscode-free module, anti-aliasing rule under test. | `5c4a8a3` |
| 3 | **CRITICAL** | "Backup to NAS" overwrote the live sync file with a plain `writeFile` — the same name automatic sync reads — while its siblings did temp-then-rename. A dropped NAS share mid-write left a truncated authoritative file. | One shared `writeFileAtomically` core (temp + rename), used by both `FolderTransport` and the backup command. | `567f5cf` |
| 4 | HIGH | Accept-all retried every PIN against every still-locked item each round (O(items × PINs)); PIN-only (v1) vaults ran a full scrypt decrypt on every idle auto-sync cycle. Both froze the extension-host thread for seconds. | Accept-all tries only the just-entered PIN (an item stays locked precisely because earlier PINs failed). Idle sync reuses the last decrypted plaintext keyed by a hash of the envelope's exact bytes; dropped after a push. | `060b737` |
| 5 | MEDIUM | The server-advertised sign-in scope was used unvalidated to mint a token then handed back to that server (a Graph scope would mint a Graph token for the user), and was fetched even over plaintext http to a remote host. | `isSafeAdvertisedScope` allows only an app-specific `api://…/scope`; discovery runs over https, or http only to loopback. Explicit setting still wins. | `1df63d1` |
| 6 | HIGH | Materialized keys / script files lived in a `keys/` dir shared by every window; any window's activate/dispose purged the whole directory, deleting another window's live SSH key or running script. | Each window owns `keys/<pid>/` and purges only its own; a sweep reclaims dead-pid leftovers but never a live window's. | `7cfd9b0` |
| 7 | HIGH | The broker memoized its loopback start with `??=`, pinning a rejected promise — one transient bind failure disabled Share-with-Agent for the window's life. | `startOnce` shares a successful start but forgets a failed one, so the next share retries. | `28b5c19` |
| 8 | MEDIUM | A detected envelope-MAC tamper only warned, then decrypted, merged and re-signed the file — healing a detected splice into a newly-valid one. | Fail closed: `macStatusBlocksSync` stops the cycle on `bad` (never on legacy `missing`); the altered file is neither merged nor re-signed, and auto-sync pauses with a notice. | `24f7d9d` |
| 9 | MEDIUM | `GrantRegistry` never evicted a grant — unbounded for the window's life. | `mint()` sweeps denied grants (an unknown token is refused just the same) with a 256 cap; allowed grants (live capabilities) and pending ones are kept. | `94c64b1` |
| 10 | MEDIUM | The agent audit log was a synchronous `appendFileSync` on every broker call, blocking the UI thread. | Async appends chained to preserve order; best-effort as before. | `94c64b1` |

## Deferred — recommended, not yet done

- **The deeper fix for finding 4 is done** (`PLAN_v1_vault_migration.md`): the v1 envelope is retired —
  every vault is written as v3 (wrapped/HKDF), so scrypt runs once at unlock rather than on every read
  and write. A legacy PIN-only vault migrates on its next sync (same PIN, data preserved) and a new
  PIN-only vault is v3 from the first write. **Backups too**: the NAS backup writes v3 on its next run,
  keeping its standalone backup PIN as a self-contained pin-wrap (never through the per-account cache);
  dated snapshots copy the sync ciphertext so they were already v3. Nothing writes v1 any more.

## Verification

- 502 extension unit tests pass (`npm test`), 40 added across the ten fixes, each written
  red-first; fix #2's and #3's teeth were proven by reverting the fix and watching the real
  symptom appear.
- No server (C#) code was touched — all ten fixes are extension-side — so the `.http` smoke
  suite was not in scope.
- A release should follow so these reach installed developers; the extension manifest version
  is owned by the concurrent feature work and will roll them up.
