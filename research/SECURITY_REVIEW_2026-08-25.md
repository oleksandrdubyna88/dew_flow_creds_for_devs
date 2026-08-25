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

Seven findings were confirmed in code and fixed the same day, each red-first with a
regression test. Two were data-loss / RCE class and reachable through normal use, not misuse.
The bulk of the new surface held up: the broker's loopback binding, bounded ceilings, per-call
key materialization and consent gate; the v3 MAC covering the sealed blob; the Ed25519
sender-signature downgrade handling; the server's atomic writes, striped locks and ETag path;
and the deploy stack's health-gated rollback with verified backups. 493 extension tests pass
(+31 new).

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

## Deferred — recommended, not yet done

- **A detected envelope-MAC tamper (v2/v3) only warns, then decrypts, merges and re-signs**
  the file — healing a detected splice into a newly-valid one. The causal merge mitigates the
  data-loss half; the persistence-of-tamper half remains. Recommend refusing the cycle on
  `mac === 'bad'`, as `BackupError` already is. (`syncManager.ts`)
- **`GrantRegistry` never evicts a grant** — unbounded for the window's life (small per-entry).
  Recommend a sweep of denied/expired grants. (`grantRegistry.ts`)
- **The agent audit log is a synchronous `appendFileSync` per broker call** on the UI thread.
  Recommend `fs.promises.appendFile` or one held file descriptor. (`credsAgentServer.ts`)
- **The deeper fix for finding 4**: migrate PIN-only (v1) vaults to the wrapped/HKDF envelope
  so scrypt runs once at unlock rather than per cycle. A data-format change, left as its own
  task — the content-hash cache removes the user-visible freeze in the meantime.

## Verification

- 493 extension unit tests pass (`npm test`), 31 added across the seven fixes, each written
  red-first; fix #2's and #3's teeth were proven by reverting the fix and watching the real
  symptom appear.
- No server (C#) code was touched — all seven fixes are extension-side — so the `.http` smoke
  suite was not in scope.
- A release should follow so these reach installed developers; the extension manifest version
  is owned by the concurrent feature work and will roll them up.
