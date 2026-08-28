# Security, reliability and architecture review — 2026-08-23

Scope: both halves of the product, reviewed on consolidation into this monorepo. The brief was
explicit that this tool must be **dependable 24/7/365**, so reliability findings are ranked
alongside security ones.

**Verdict: the design is sound.** No critical findings. The cryptography is correct and
conservative, the trust boundary is real, and the server genuinely cannot read what it stores. What
follows are the gaps — five of which were fixed in this task, with a test each; the rest are
recorded as plans.

## What the design gets right

Stating this first is not politeness; a review that only lists problems gives no baseline for
judging the ones it lists.

- **Correct AEAD throughout.** AES-256-GCM, a fresh 16-byte salt and 12-byte IV per encryption
  call, 128-bit tags verified through `decipher.final()`. A failed tag is the single source of
  truth for "wrong PIN" — there is no custom heuristic anywhere.
- **scrypt at a real cost** (`N=2^17`, ~128 MiB) with a **versioned, tested migration**: each blob
  records the parameters it was sealed with, so raising the cost never orphans an old vault.
  `kdfMigration.test.ts` proves a mismatched recorded `N` fails through the auth tag rather than
  silently producing garbage.
- **Key slots, not re-encryption.** A random 256-bit master key wrapped once per unlock method —
  the LUKS/FileVault pattern. Adding or removing a YubiKey rewrites a small wrap record, never the
  payload.
- **Domain-separated HKDF.** The WebAuthn wrapping key and the envelope-MAC key derive from the same
  master key under distinct `info` strings. Deliberate, and correct.
- **Integrity beyond the AEAD tag.** An HMAC-SHA256 over the envelope's plaintext metadata, compared
  with `timingSafeEqual`, and actually wired into the sync path rather than being dead code.
- **Proper PKCE.** S256, fresh `state` checked on every redirect, loopback-only listener, client
  secret in `SecretStorage` and never in `settings.json`.
- **Disciplined key material on disk.** A private key is materialised only when `ssh -i` needs a
  path, `0600` inside a `0700` directory under the extension's own storage — never the OS temp dir —
  and purged on activate, on deactivate, and when the terminal closes.
- **Strong webview hygiene.** `default-src 'none'`, nonce-based scripts, `localResourceRoots: []`,
  everything escaped. The read-only viewer never receives secret values at all.
- **No TLS bypass anywhere**, and the UI actively resists misconfiguration: a non-localhost
  `http://` server URL raises a modal warning that the token would travel in clear.
- **Sender identity is unforgeable on the server path.** `POST /api/shares` takes the sender from
  the verified token, not the body.
- **Startup guards that fail loudly.** No auth scheme, or an empty domain allow-list, refuses to
  start rather than running as a service that 401s everything or accepts everyone.

---

## Fixed in this task

Each was reproduced with a test that was **watched failing first**, then fixed, then watched
passing. The failure messages are quoted because "tests pass" is not evidence.

### 1. HIGH — the rate limiter could not tell callers apart

`Program.cs` partitioned the limiter on `ctx.User.FindFirst("email")`, but nothing populated
`ctx.User`: the endpoints authenticated by hand, there was no `UseAuthentication()`, and no default
scheme to give it one. The key therefore always fell through to `RemoteIpAddress` — which **behind a
reverse proxy is the proxy's address for every caller alive**.

*Impact:* one busy client consumed the entire 120-requests-per-10-seconds budget for the whole
company. A denial of service requiring no attacker, reachable by an ordinary sync storm.

*Red:* `OneCallerBurningTheirBudgetDoesNotLockOutAnother` —
`Expected bobsFirstRequest.StatusCode to be OK, but found TooManyRequests`. Bob's **first** request.

*Fix:* resolve the caller in middleware **before** `UseRateLimiter`, and partition on the verified
email (`user:<email>`), falling back to `anon:<ip>` only for requests with no valid token — which is
correct behaviour for anonymous traffic and wrong for authenticated traffic. `RequireCaller` now
reads the already-resolved principal, so authentication also stopped happening twice per request.

### 2. HIGH — `RequireForwardedHttps` was bypassed by omitting a header

The guard fired only when `X-Forwarded-Proto` was **present and not https**. A request with no such
header passed straight through.

*Impact:* the control existed to guarantee traffic arrived over TLS, and the way past it was to send
less, not more. Any plaintext request qualified.

*Red:* `WithHttpsRequired_ARequestCarryingNoProtocolHeaderIsRefused` —
`Expected Forbidden, but found OK`.

*Fix:* a missing header is now treated exactly like a plaintext one. `/api/health` is the single
exemption, because the container's own healthcheck runs inside the network with no proxy to add the
header and health carries no secret.

### 3. HIGH — listing an inbox materialised the whole thing in memory

`GET /api/shares` built a `List<ShareItem>` of every pending item before serialising. With the
shipped defaults (`MaxInboxItems=500`, `MaxShareBytes=1 MiB`) that is roughly **700 MiB live** before
JSON encoding doubles it.

*Impact:* any account inside the allowed domain could fill a colleague's inbox and make that
colleague's next sync try to allocate three quarters of a gigabyte. On a small VPS that is an OOM
kill, and the target is the victim, not the attacker.

*Fix:* `ListSharesAsync` is now an `IAsyncEnumerable<ShareItem>` and the endpoint streams it, so one
item is live at a time. Covered by `InboxScaleTests` — a 60-item inbox lists completely, an empty
inbox is `[]` and not `null`, and a corrupted item is skipped rather than failing the listing.

> Honest limitation: these tests prove **correctness** through the streaming path. The memory
> improvement follows from the implementation and is not asserted by a test — peak live set is not
> something a test in this harness can measure reliably, and a test that pretended to would be worse
> than none.

### 4. HIGH — a wedged server hung the extension forever

`serverTransport.ts` called `fetch` with no timeout. A server that accepted the connection and then
stopped answering left the promise pending for the life of the window; because the sync cycle awaits
it under a one-at-a-time guard, **nothing synced again** and the UI said nothing.

*Impact:* silent, permanent loss of sync from a transient server fault. Directly contrary to the
house rule that every wait has a ceiling.

*Red:* with the fix reverted, the test file did not complete — it hung for the full 25-second
harness timeout and failed. That is the symptom exactly.

*Fix:* `AbortSignal.timeout(60_000)` on every request, and a timeout is reported differently from a
refused connection because they are different operational problems.

### 5. HIGH — copied secrets stayed on the clipboard forever

Eight call sites wrote passwords, private keys, DB connection strings and a whole "copy all" block
to the clipboard with no expiry — only a hint in one message suggesting the user clear it manually.

*Impact:* the clipboard is the least private surface on the machine: any process can poll it, the OS
keeps a history (Win+V), and several platforms sync it between devices. A password copied once
outlives every protection the vault provides.

*Fix:* `secretClipboard.ts` — a `vscode`-free module that writes the secret and schedules a clear
45 seconds later, **only if the clipboard still holds exactly what was written**, so a later copy of
the user's own is never destroyed. Six unit tests, including the case that matters most: a secret
the user has replaced is left alone. The public key is deliberately still a plain write; it is not a
secret.

---

## Also fixed along the way

- **`npm test` ran no tests.** `node --test out/test/` resolves the directory as a module on Node
  22+ and exited `MODULE_NOT_FOUND`. The suite had been silently green-by-absence.
- **A silent NuGet downgrade.** `System.IdentityModel.Tokens.Jwt` was pinned at 8.14.0 while
  `JwtBearer` pulled 8.19.2 transitively. `NU1605` was a warning in the old project; under the house
  `TreatWarningsAsErrors` it failed the build immediately.
- **A company domain in a public default.** `appsettings.json` shipped
  `"AllowedDomains"` preset to a real company domain. Cleared — a default that silently grants a real domain access
  is a footgun, and this repository is public.
- **The deployment crashed on first boot on Linux.** A root-owned bind mount against an
  unprivileged container. See [module_deployment.md](module_deployment.md); fixed with a one-shot
  `init` service and a startup error that names the cause and the fix.
- **No structured logging.** The service had default console logging only, so a 24/7 deployment had
  nothing to read after an incident. Now Serilog, console plus a file per run.

---

## Open findings

Ranked. Each has a plan; none is a reason to hold the release.

| # | Severity | Finding | Plan |
|---|---|---|---|
| 6 | MEDIUM | WebAuthn RP ID is the bare `localhost`, shared with every other local web app | `PLAN_extension_security_tail.md` |
| 7 | MEDIUM | Share metadata (`fromEmail`, `entityName`) is unauthenticated on the folder transport | `PLAN_extension_security_tail.md` |
| 8 | MEDIUM | PIN policy is length-only (8 chars) for a secret guarding offline ciphertext | `PLAN_extension_security_tail.md` |
| 9 | MEDIUM | No optimistic concurrency on `PUT /api/vault` — a lost update is possible | `todo/PLAN_server_ops.md` |
| 10 | LOW | The master key is cached for the window's lifetime with no idle timeout | `PLAN_extension_security_tail.md` |
| 11 | LOW | `/api/health` writes a probe file on every call | `todo/PLAN_server_ops.md` |
| 12 | LOW | No inbox TTL — an unaccepted share sits until deleted | `todo/PLAN_server_ops.md` |
| 13 | INFO | `/api/team` lets any authenticated caller enumerate colleagues' emails | by design; documented |
| 14 | INFO | `chmod 0600` is a no-op on Windows; the comment implies a guarantee it does not make | `PLAN_extension_security_tail.md` |

### On finding 6, the one worth understanding

WebAuthn scopes a credential by **RP ID string, not origin+port**. With `RP_ID = 'localhost'`, any
local page on any port can call `navigator.credentials.get()` with the same RP ID, the leaked
`credentialId` and `prfSalt` — both of which sit in **plaintext** in the vault envelope's `wraps`
array, on shared storage by design — and recover the identical PRF secret this extension uses to
unwrap the master key.

It is not remote and not silent: it needs a local page the user's browser will load, plus a physical
touch, and the browser prompt does disclose the requesting origin. But the "hardware second factor"
is not actually scoped to this extension. The fix is small — bind the loopback listener to
`creds-for-devs.localhost` (which browsers resolve to loopback per RFC 6761, no DNS needed) and use
that as the RP ID — but it **invalidates existing registrations**, which is why it is a plan with a
migration step rather than an edit.

### On finding 7

`sealShare` protects the payload with GCM; the surrounding label does not travel under it. Anyone
who can write to a shared NAS folder can therefore author a share and label it "from your team lead"
— the recipient's UI shows that name **before** anything is decrypted. The fix is to bind the
metadata as GCM **additional authenticated data**, which needs no shared secret and so does not fight
the "anyone may append" design.

This does not affect the **server** transport, where the sender is stamped from a verified token —
which is the strongest argument for teams using the server rather than a folder, and is already the
project's stated position.

---

## Reliability against the 24/7 brief

Measured against `.claude/rules/shared/common/reliability.md`.

| Requirement | State |
|---|---|
| Every wait has a ceiling | **Now yes** — finding 4 was the one unbounded wait. nginx and Kestrel timeouts are explicit |
| Crash-recovery sweep, invoked at startup | Yes — `SweepStaleTempFiles()` removes temp files from interrupted writes |
| Health reflects real state | Yes — probes that the data directory is writable, rather than returning a constant |
| Health does no blocking work | **Partly** — it writes a probe file per call. Bounded by rate limiting; finding 11 |
| Growth surfaces bounded | **Partly** — inboxes bounded by count, not time (finding 12); vaults grow with headcount, which is correct; logs rotate per run and per container |
| Transient faults survived | Yes — restart policies, a certbot renewal loop where one failure never ends the loop, and per-item failures that skip rather than abort a listing |
| Graceful shutdown | Yes — ASP.NET's SIGTERM handling; the run is wrapped so a startup or shutdown fault reaches the log |
| Failures diagnosable after the fact | **Now yes** — this was the biggest gap. Per-run log files, UTC throughout |

**Update, same day.** What was written here as the single largest remaining risk — "nobody has
restored a backup" — has since been closed. The cycle was rehearsed against the published image:
data written, data directory destroyed, `deploy/restore.sh` run, vault read back with its exact
contents. The rehearsal immediately found two defects that no amount of reading the script would
have shown: the scheduled backup archived the empty directory after the outage and shadowed the
good restore point, and the restore script failed after moving the data aside and left the stack
down. Both are fixed, and scheduled backups to an operator-chosen path now ship.

The remaining reliability limit is structural rather than a defect: this is a one-instance,
one-filesystem service with no HA story. For the threat it defends against — a lost laptop, a
shared folder everyone can read — that is a reasonable trade, but it should be a chosen one.

## Architecture notes

The architecture needs no restructuring. Two observations:

- **The split is in the right place.** All cryptography on the client, all identity on the server,
  and nothing in between that has to be trusted with both. Very little of the system needs to be
  correct for the central claim to hold, which is the property you want.
- **The server is right to be small.** No database, no ORM, no background workers, four source
  files. Every feature that would add one of those should be weighed against the fact that its
  absence is why this thing can be reviewed in an afternoon.

One genuine architectural gap: **there is no versioning on the HTTP contract.** The paths carry no
version and neither side negotiates. Today the two halves ship from one repository so they move
together, but the moment an old extension talks to a new server — which is normal, users update on
their own schedule — nothing detects the mismatch. Recorded in `todo/PLAN_server_ops.md`.
