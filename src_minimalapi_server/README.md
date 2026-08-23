# Cred Vault Server

A zero-knowledge vault + share relay for the **CredsForDevs** VS Code
extension — C# minimal API on **.NET 10**. It replaces the shared NAS folder
with an authenticated HTTPS endpoint, so a whole company can use the
extension without giving everyone read access to everyone's files.

**The server never sees plaintext.** It stores opaque vault blobs and share
payloads that are encrypted on the clients (AES-256-GCM, scrypt-derived
keys). PINs, passwords, keys, and VPN configs never leave the machines.

> Part of the [dew_flow_creds_for_devs](../README.md) monorepo. The client that talks to this API
> is [`src_vs_code`](../src_vs_code); the one-command deployment is [`deploy/`](../deploy/README.md);
> the endpoint-by-endpoint contract is [research/module_server.md](../research/module_server.md).

## Why a server instead of a file share

| | NAS folder | This server |
|---|---|---|
| Auth | folder ACLs | the caller's **Microsoft/Google token** (the session the extension already holds) |
| Who can read your ciphertext | everyone with folder access | only you (`GET /api/vault` is scoped to the token's email) |
| Sender identity of a share | claimed by the sender | **stamped by the server** from the verified token — unforgeable |
| Joiners/leavers | manual ACL edits | whatever your IdP already does |

## Endpoints

| Method | Path | Purpose | Authorization |
|---|---|---|---|
| GET | `/api/health` | liveness | public |
| GET | `/api/whoami` | resolved caller + whether a vault exists | any allowed caller |
| GET | `/api/vault` | download **your** vault blob | token email only |
| PUT | `/api/vault` | upload **your** vault blob (`application/octet-stream`) | token email only |
| GET | `/api/team` | emails of everyone with a vault (same allowed domains) | any allowed caller |
| POST | `/api/shares` | share one sealed entity with someone | sender = token email |
| GET | `/api/shares` | **your** pending shares | recipient = token email |
| DELETE | `/api/shares/{id}` | accept/decline cleanup of your own item | recipient = token email |

`POST /api/shares` body: `{ toEmail, entityName, entityKind, salt, iv, tag, data }`
— the last four are base64 of the client-side AES-256-GCM envelope; the
server stores them verbatim and adds `id`, `fromEmail`, `fromName`,
`createdAt`.

## Configuration

Environment variables (double underscore = section separator) or
`appsettings.json`:

| Key | Meaning |
|---|---|
| `Vault__DataDir` | where blobs live (default `./data`; mount a volume here) |
| `Vault__AllowedDomains` | csv of email domains allowed to use the server (empty = any verified caller) |
| `Vault__MaxVaultBytes` | per-vault upload cap (default 8 MiB) |
| `Auth__Microsoft__Tenant` | Entra tenant id/domain — enables Microsoft tokens |
| `Auth__Microsoft__Audiences` | csv of accepted audiences (empty = audience not validated) |
| `Auth__Google__Enabled` | `true` to also accept Google id tokens |
| `Auth__Google__Audiences` | csv of accepted Google client ids |
| `Auth__Local__SigningKey` | HMAC secret enabling a symmetric **Local** token scheme — tests / offline deployments only. **Leave empty in production.** |
| `Vault__MaxShareBytes` | per-share payload cap (default 1 MiB) |
| `Vault__MaxInboxItems` | pending shares per recipient (default 500) |
| `Vault__AllowAnyDomain` | `true` to run with no domain boundary (the server refuses to start if `AllowedDomains` is empty and this is false) |
| `Vault__RequireForwardedHttps` | refuse any request not forwarded as https. Enable ONLY when the app's port is unreachable except through your TLS proxy |
| `Vault__RateLimit__PermitLimit` | requests per window, per caller (default 120) |
| `Vault__RateLimit__WindowSeconds` | the window (default 10) |
| `Logging__Directory` | root of the per-run log files (default `<app>/logs`) |
| `Serilog__MinimumLevel__Default` | verbosity (default `Information`) |

Audience note: an access token issued for Microsoft Graph has Graph's
audience, so validating audience only works when the extension requests a
token for *your* API's scope. Until that app registration exists, run with
`Auth__Microsoft__Audiences` empty (issuer + domain + per-email
authorization still apply), or use the Local scheme behind the VPN.

## Run

```bash
cd src
Vault__DataDir=/srv/credvault \
Vault__AllowedDomains=yourcompany.com \
Auth__Microsoft__Tenant=<tenant-id> \
ASPNETCORE_URLS=http://0.0.0.0:5080 \
dotnet run
```

Put it behind a TLS-terminating reverse proxy (nginx/Caddy/ALB) — the app
speaks plain HTTP and expects the proxy to add HTTPS.

## Tests

`tests/` is 36 xUnit v3 tests on Microsoft Testing Platform, hosted **in-process** through
`WebApplicationFactory` — no free port, no background `dotnet run`, ~1.5 seconds. They cover the
auth gates (including forged `alg=none`, wrong-key, missing-claim and expired tokens), domain
enforcement, vault isolation and size caps, team listing, share delivery with sender stamping,
recipient-only reads and deletes, path traversal, per-caller rate limiting, the forwarded-HTTPS
guard, and a large inbox.

The test project builds into a self-contained runner executable. **Never `dotnet test`** — there is
no VSTest host here and it aborts with a `testhost.deps.json` error, which is a tooling mismatch,
not a test failure.

```bash
dotnet build ../dew_flow_creds_for_devs.slnx
./tests/bin/Debug/net10.0/CredVaultServer.Tests.exe                    # Linux: drop the .exe
./tests/bin/Debug/net10.0/CredVaultServer.Tests.exe --filter-class "*SharingTests"
```

Configuration reaches the app through **process environment variables** rather than
`WithWebHostBuilder`: `Program.cs` reads `builder.Configuration` before `Build()`, so anything a
`WebApplicationFactory` adds during `ConfigureWebHost` lands too late to be seen. Because process
environment is global, the suite runs in one non-parallel collection.

## Security properties & limits

- **Zero-knowledge**: only ciphertext is stored; a server compromise yields
  encrypted blobs, still guarded by each user's PIN/key material.
- **Least privilege**: nobody can read another person's vault or inbox; the
  only cross-user write is appending a share, which reveals nothing.
- **Metadata is visible to the server**: emails, entity names/kinds, share
  timestamps. Treat it as sensitive telemetry.
- **No remote revoke**: a delivered share is a copy (same as the file
  transport).
- **Rate limiting** is per authenticated caller (`Vault:RateLimit:*`), so one noisy account
  cannot throttle anyone else; requests with no valid token share a per-IP bucket. nginx adds a
  second, per-source-address layer in front.
- **Inbox quotas** are enforced by count (`Vault:MaxInboxItems`), but there is **no TTL** — a share
  nobody accepts sits until the recipient deletes it. See `todo/PLAN_server_ops.md`.
- **Optimistic concurrency** is available and opt-in: `GET /api/vault` returns an `ETag`, `PUT`
  honours `If-Match` / `If-None-Match: *` and answers `412` when the caller's copy is stale. The
  extension sends it automatically. A client that sends neither header keeps last-write-wins.
- **No audit log** beyond the application log.
- **No HTTP contract versioning** — neither side negotiates, so an old extension talking to a new
  server goes undetected. Same plan.
