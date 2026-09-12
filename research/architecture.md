# Architecture

How the two halves of `dew_flow_creds_for_devs` fit together, and the one boundary that
everything else follows from.

> Cross-repository citations are **paths, not links** — a relative link that resolves only on one
> machine is worse than a citation naming its source.

## The system in one picture

```mermaid
C4Container
    title CredsForDevs + Cred Vault Server

    Person(dev, "Developer", "Has SSH hosts, keys, VPN configs, DB connections")
    System_Ext(agent, "AI agent", "Claude Code and other MCP clients. Receives no secret, ever")

    Container_Boundary(workstation, "The developer's machine") {
        Container(ext, "CredsForDevs", "VS Code extension, TypeScript", "Holds every secret. Does ALL cryptography. The only component that ever sees plaintext")
        Container(cli, "creds", ".NET Native AOT", "Terminal client of the broker. Holds no secret")
        Container(mcp, "creds-mcp", ".NET Native AOT", "MCP server. Relays an agent's request to a window; gated per entry by switches that are off by default")
        ContainerDb(secretstore, "VS Code SecretStorage", "OS keychain", "Passwords, private keys, VPN configs, notes, DB connection strings")
        ContainerDb(globalstate, "VS Code globalState", "JSON", "The node tree, tombstones, version vectors — metadata only")
    }

    System_Ext(idp, "Microsoft Entra / Google", "Issues the token that proves who the caller is")

    Container_Boundary(deployment, "Self-hosted, one docker compose") {
        Container(nginx, "nginx", "TLS termination", "Certificates, security headers, per-IP rate limiting, ACME webroot")
        Container(api, "Cred Vault Server", ".NET 10 minimal API", "Zero-knowledge blob store + share relay. Cannot decrypt anything it holds")
        Container(certbot, "certbot", "ACME client", "Issues and renews; ~6-day certs in IP mode")
        ContainerDb(disk, "Host directories", "Filesystem", "vaults/{hash}.bin, shares/{hash}/{id}.json — ciphertext only")
    }

    Rel(dev, ext, "Uses")
    Rel(agent, mcp, "Asks", "JSON-RPC over stdio")
    Rel(mcp, ext, "Relays", "loopback HTTP, /v1/mcp/*, no token — the switches are the gate")
    Rel(cli, ext, "Relays", "loopback HTTP, /v1/use/*, grant token")
    Rel(ext, secretstore, "Reads and writes plaintext secrets")
    Rel(ext, globalstate, "Reads and writes metadata")
    Rel(ext, idp, "Signs in", "OAuth 2.0 + PKCE")
    Rel(ext, nginx, "Sync + share", "HTTPS, Bearer token, ciphertext bodies")
    Rel(nginx, api, "Proxies", "HTTP, X-Forwarded-Proto: https")
    Rel(api, idp, "Validates token signatures", "OIDC discovery")
    Rel(api, disk, "Stores opaque bytes")
    Rel(certbot, nginx, "Answers HTTP-01 through the shared webroot")
```

## The trust boundary

**The server never holds enough to open a vault alone.** Everything else in this document is
downstream of that sentence — and it was rewritten on 2026-09-06, from *"the server never holds a key
that opens a vault"*, because a corporate server now holds one factor of a developer's.

**What changed, exactly.** A developer's vault wraps are sealed to `HKDF(scrypt(accountId + PIN) ‖ S)`,
where **S** is a 32-byte login key the server mints and hands only to that person while their account is
active (`module_server.md` §The login key). The file plus the PIN no longer opens anything: without S
there is no key to try. That is the point — a copied vault, a laptop taken home, a repository somebody
cloned, all stop working the day the person is deactivated.

**What did NOT change, and why the weaker sentence is still a strong one.** S is one factor of two. The
server has never seen the PIN and has never seen the master key, so it cannot open a vault with what it
holds. An operator with S and a stolen file can attack the PIN offline — which they could already do
against an unbound `pin` wrap, with no S at all. **The operator's position is unchanged; the position of
a stolen FILE is what changed.** Stating it as "never holds a key" would now be false, and stating it as
"holds nothing" would be a lie by omission; this is the true version, and the table below carries it.

| | Sees plaintext | Holds a decryption key | Can forge a sender |
|---|---|---|---|
| The extension | yes — it is the only one | yes, derived from a PIN or a security key | n/a |
| The server | **no** | **no** — one FACTOR of a developer's wrap key (S), never the wrap key and never the master key | **no** — it stamps identity from a verified token |
| Anyone with disk access to the server | no | S, for the developers on that server — which without their PIN opens nothing | no |
| An AI agent granted access | **no** — it holds a capability token; the extension runs `ssh` on its behalf | no | n/a — its first use of a token needs a human's click |

The last row is the same sentence in a second setting: something is given the *use* of a credential
without being given the credential. The extension is still the only thing that sees plaintext; what
the agent has is a token that buys one entity's worth of work in the window that minted it, gated by
a modal and written down in an audit channel. See
[module_extension.md](module_extension.md#the-agent-broker--using-a-credential-without-handing-it-over).

What the server contributes is the thing a shared folder cannot: **authenticated identity**. It
knows who is calling, because the caller presents a token their identity provider signed, and it
uses that identity for exactly three decisions — which vault you may read, which inbox you may read,
and whose name goes on a share you send.

### Why that is worth a server at all

The extension works with no server, syncing through a shared folder. That mode has two problems the
server exists to solve:

1. **Everyone with folder access can read everyone's ciphertext.** Offline, at leisure. The only
   thing standing between them and the secrets is the strength of a PIN.
2. **A share's sender is a claim, not a fact.** Anyone who can write to the folder can drop in an
   item labelled "from your team lead". `research/PLAN_sharing.md` records this as a known
   residual; `todo/PLAN_nas_sender_pki.md` is the folder-mode answer nobody has needed enough to
   build, because the server answers it for free.

## What a sync actually does

```mermaid
sequenceDiagram
    participant U as Developer
    participant E as Extension
    participant K as VaultKeys
    participant N as nginx
    participant S as Server
    participant D as Disk

    U->>E: edits a credential
    E->>E: stamp a version vector {deviceId: seq}
    Note over E: debounced 5s, then a sync cycle

    E->>K: unlock(account)
    alt master key cached
        K-->>E: key
    else PIN or security key
        K->>U: prompt for PIN / touch the YubiKey
        K->>K: scrypt(N=2^17) or HKDF(WebAuthn PRF) -> unwrap master key
        K-->>E: key
    end

    E->>N: GET /api/vault (Bearer id token)
    N->>S: proxied, X-Forwarded-Proto: https
    S->>S: validate token, resolve email, check domain
    S->>D: read vaults/{sha256(email) first 32}.bin
    D-->>S: ciphertext
    S-->>E: 200 ciphertext (or 404 — nothing stored yet)

    E->>E: AES-256-GCM open, verify envelope MAC
    E->>E: mergeProfiles(local, remote) — causal, per node
    Note over E: version vectors decide — ties break on updatedAt, then deviceId

    E->>N: PUT /api/vault (ciphertext)
    N->>S: proxied
    S->>D: atomic write (temp file, rename)
    S-->>E: 204
```

The merge is **causal, not clock-based**: each node carries a version vector, and a vector that
dominates wins outright. Wall-clock time is only a tiebreaker for genuinely concurrent edits. That
is what lets two machines edit different credentials offline and both survive — see
[module_extension.md](module_extension.md).

## Cross-cutting concerns

### Identity

One flow, two providers. VS Code has a built-in Microsoft provider; it has none for Google, so the
extension registers its own (`googleAuthProvider.ts`) implementing the full authorization-code +
PKCE dance against a loopback listener. The server accepts **Microsoft access tokens** and **Google
id tokens** — the asymmetry is real and load-bearing: a Google access token is opaque and cannot be
validated by a third party, so the id token is what travels.

**The scope is a cross-module contract, and the server owns it.** A Microsoft token is only
usable if the extension asked Entra for the *operator's own* API scope; ask for `user.read` and
what comes back is a Graph token, which Microsoft makes unverifiable by third parties. That value
therefore has to travel from the deployment to every client, and having each developer paste it
into their own `settings.json` was the arrangement that produced this system's worst failure mode —
an empty Team, no error, nobody at fault. Since server 0.2.3 the server publishes it on the
anonymous `GET /api/client-config` and the extension configures itself; the local setting remains
as an override and still wins. Anonymous is not a concession here: the caller has no token yet by
definition, and a client id is public by construction.

A third scheme, `Local`, is an HMAC-signed token with no cloud dependency. It exists for air-gapped
deployments and for the test suite. Anyone holding its signing key can impersonate any allowed
email, which is why the deployment guide says to leave it empty wherever a real IdP exists.

### Authorization

Four rules, applied in this order on every authenticated request:

1. **The email comes from the token**, never from the request. `TokenIdentity.Email` walks a claim
   priority list and rejects a token that explicitly marks its email unverified.
2. **The domain must be allowed.** Outside `Vault:AllowedDomains` is 403, even with a perfectly
   valid token.
3. **On a corp server, the account must be active** (2026-09-06). A registry record saying
   `active: false` is 403 with `X-Creds-Reason: account-deactivated` — a header, so a client can tell it
   from the domain's 403 without matching prose — and a record the server cannot read is 503, never a
   pass. Officers pass whatever their record says (the roster is configuration, and the break-glass
   quorum must not be lockable by its own records); a personal server consults no registry at all. The
   check sits inside the one caller gate every route opens with, so no route can forget it; the five
   branches are in [module_server.md](module_server.md) §Authorization. One rule looks the other way
   for the same reason: `POST /api/shares` also checks the RECIPIENT's standing, because the gate judges
   whoever is calling and a share is addressed to somebody else — material must not be delivered into an
   inbox its owner is locked out of.
4. **The resource is derived from the email.** There is no vault id and no inbox id in any URL —
   `GET /api/vault` means *your* vault by construction, so there is no parameter to tamper with.

### Rate limiting

Two independent layers, because they defend against different things:

| Layer | Partitioned by | Stops |
|---|---|---|
| nginx | source IP | unauthenticated floods, before they reach the app |
| the app | **verified caller email** | one noisy account exhausting the service for everyone |

The app's layer requires the caller to be resolved *before* the limiter runs, which is why the
pipeline authenticates in middleware rather than inside each endpoint. Getting this wrong is not
hypothetical — see [SECURITY_REVIEW_2026-08-23.md](SECURITY_REVIEW_2026-08-23.md), finding 1.

### Storage layout

```
${DATA_DIR}/
  vaults/
    <sha256(lowercased email)[..32]>.bin      the encrypted vault blob
    <sha256(lowercased email)[..32]>.email    the plaintext email, for team discovery
  shares/
    <sha256(recipient email)[..32]>/
      <guid>.json                              one pending share
  org/                                         ONLY on a server with a corporate roster
    members/<key>.json                         one person: role, flags, project assignments
    projects/<guid>.json                       one project: its name, whether it is archived
    settings.json                              the runtime settings an admin may change
    events/<yyyy-MM-dd>.ndjson                 the corporate event log, one file per UTC day
    login-keys/<key>.bin                       one developer's login key, under the deployment KEK
```

Filenames are hashed so the directory listing is not a staff directory, and the `.email` sidecar
exists only because team discovery needs to answer "who else uses this server". Writes are atomic
(write to a temp file, rename), which is what lets `backup.sh` run against a live server.

**`org/` appears on the first WRITE, never at startup.** A personal deployment grows none of it, and
that is a decision rather than laziness: an `org/` tree on disk tells an operator this server has a
roster when it has none. What each record holds, and why each is shaped as it is, is in
[module_server.md](module_server.md).

### The corporate event log (2026-09-07, epic 4)

A corporate server keeps one append-only record of what happened — shares with their outcome, roles,
blocks, projects, assignments, login keys — as NDJSON, one file per UTC day under `org/events/`, kept
forever and swept by nobody (about 18 MB a year at 200 people). **Metadata only**: an entry's name and
kind, which a share already carries in plaintext, and never a byte of a payload.

`GET /api/org/events` reads it back, and the one thing worth knowing at this level is that **the
server decides the scope, not the client**: an administrator or a recovery officer reads the whole
domain, everybody else reads only rows naming them as actor or subject, and a caller's filters can
narrow that and never widen it. So the log is a *server-enforced* rule in the umbrella's Boundaries
table, not an honest-client one — the extension's tab draws what it is handed and cannot ask for more.
Full detail: [module_server.md](module_server.md) §`GET /api/org/events`,
[PLAN_corp_event_log.md](PLAN_corp_event_log.md).

### Logging

Serilog, console plus **a new file per run** under `logs/{UTC date}/{app}-{HH-mm-ss}-{pid}.log`.
A file per run rather than a rolling daily file, because the question during an incident is almost
always "what did *that* run do". Levels come from configuration; changing verbosity is a config
edit and a restart, never an edited call site.

Container logs are separately capped by Docker's json-file driver at 10 MB × 5 per service, so a
log loop cannot fill the disk that holds the vaults.

### Error handling

The two halves answer failure differently, because they fail differently.

**Server.** One `UseExceptionHandler` at the edge logs the exception with its method and path and
returns a bare `{"error":"internal error"}` — the client is told nothing about internals. Below
that, expected failures are *values*, not exceptions: a missing vault is a 404, an oversize body is
a 400, a foreign domain is a 403. `catch` appears in exactly three places, and each one is a
boundary where continuing is correct rather than optimistic:

| Where | Catches | Why continuing is right |
|---|---|---|
| `VaultStore.ListVaultOwners` | `IOException`, `UnauthorizedAccessException` | One locked sidecar must not break team discovery for everyone |
| `VaultStore.ReadShareOrNullAsync` | `JsonException`, `FileNotFoundException` | One corrupted inbox item must not fail the whole listing |
| `CredVaultLogging` | `IOException`, `UnauthorizedAccessException` | An unwritable log mount is a degraded log, not an outage |

Startup is the opposite: misconfiguration **throws and stops the host**, because a credential
server that silently accepts everyone is worse than one that does not start.

**Extension.** Failures reach the user as a sentence, not a stack trace, and the sentences
distinguish causes that need different actions — "did not answer within 60s" is a different problem
from "unreachable", and a 401 ("sign in again") is different from a 403 ("outside the allowed
domain"). Decryption is the exception to all of this: a wrong PIN is detected *only* by the AEAD
tag failing, never by a heuristic, so there is exactly one way to be wrong.

### Build, test and release

**Separate workflows, not jobs in one file.** Each product owns a pipeline that appears under its
own name in the Actions tab, runs only when its own paths change, and fails on its own terms.

```
ci · extension      src_vs_code/**
                    npm ci -> typecheck -> node:test -> vsce package
                    (packaging proves the manifest is publishable)

ci · server         src_minimalapi_server/**, deploy/**, the MSBuild baseline
                    dotnet build -c Release -> the xUnit v3 runner EXECUTABLE
                    (never `dotnet test` — no VSTest host exists here)
                    + compose validated in all four TLS modes, + shellcheck
                         │
                         │ workflow_run, only on success
                         ▼
docker image        build -> RUN it -> wait for healthy -> assert 401 on /api/vault
                    -> on main: push :edge and :sha-<commit> to ghcr.io, multi-arch

docs · plans        plan-lifecycle.mjs + pin-check.mjs from the shared submodule

release             tag-driven: server-v* -> image, extension-v* -> Marketplace
```

`deploy/**` sits in the server's path filter deliberately: the compose stack is how this server is
delivered, so a change to it re-runs the server pipeline and therefore the image pipeline.

The image pipeline is **chained rather than parallel** — an image is not worth building from code
whose tests have not passed. `workflow_run` has two traps and both are handled: it fires on
completion regardless of outcome (so the job checks `conclusion == 'success'` itself), and it runs
in the context of the default branch (so the checkout names `head_sha`, or it would build main's
tip while claiming to build the commit that passed).

Two further properties worth naming:

- **The image is tested before it is published, and the publish reuses that build's cache**, so
  what reaches the registry is what passed. The push steps are gated on
  `github.ref == refs/heads/main`, so a pull request can never move a tag an operator pulls.
- **The docs are checked like code.** `plan-lifecycle.mjs` fails the build on a plan filed in the
  wrong folder, a missing status line, a link that does not resolve, or a `todo/README.md` index
  that has drifted from the folder. `pin-check.mjs` fails when the conventions submodule pin trails
  its remote.

Releases are tag-driven and per product — `server-v*` publishes a multi-arch image and moves
`:latest`; `extension-v*` publishes to the Marketplace and **refuses while the publisher id is
still a placeholder**. A tag never ships both.

### Where a copy of the whole deployment lives (2026-09-07, epic 5)

A flow across all three modules rather than a feature of any one of them, which is why it is here as
well as in each.

```
  extension                       server                          off the machine
  ─────────                       ──────                          ───────────────
  Server Backup… ──PUT settings──▶ org/backup/settings.json
                                     │  credentials sealed under the deployment KEK
  Mint key ──────POST key────────▶ org/backup/key.sealed ── the words, ONCE, to a modal
                 ◀── BK1-… ─────     (what is kept is their HKDF output)
                                     │
  Back up now ───POST run────────▶ claim ▶ archive ▶ upload ──────▶ S3 / Azure Blob
                                     │                              (retention at each)
  ◀── status (polled) ────────────  org/backup/status.json
  Download ──────GET archive─────▶ stream ─────────────────▶ a file the admin chose
                                     │
                            restore-archive.sh ◀── the same BK1- words, on the host
```

Four things about it are decided ACROSS modules rather than inside one:

- **The backup key outranks the KEK.** The KEK is inside the archive; the backup key is not. One
  archive and one key reconstitute every vault, every sealed login key and the local signing key —
  which is why the words are shown once, by a modal that will not close on a dismissal, and why
  neither half ever writes them to disk.
- **The extension holds no policy about who may do this.** Every route is `RequireAdmin` and the
  server decides. The menu entry appears on the corporate-admin and officer rows because those are
  the callers the server accepts, not because the extension has an opinion about roles.
- **The nag rides the policy fetch epic 1 already runs**, so this machine has one corporate cadence
  rather than two — and only a SUCCESSFUL read may change what it believes, the same rule the
  project folders rest on.
- **The deployment gains a second restore path and keeps the first.** `restore.sh` reads the
  host-side unencrypted tar, certificates included; `restore-archive.sh` reads the server's
  encrypted archive and asks for the words. Neither replaces the other —
  [module_deployment.md](module_deployment.md) has the table of what each one answers.

## Module map

| Module | Document | What it owns |
|---|---|---|
| The extension | [module_extension.md](module_extension.md) | All cryptography, the data model, sync and sharing, the UI |
| The server | [module_server.md](module_server.md) | The HTTP contract, authorization, storage |
| The deployment | [module_deployment.md](module_deployment.md) | Containers, TLS, updates, backups |
| The CLI | [../src_cli/README.md](../src_cli/README.md) | `creds` — the terminal client of the broker. A .NET Native AOT binary holding no secret: it relays a request to the VS Code window named by a grant token and prints what comes back |
| The broker client | `src_broker_client/` | Discovery, the health probe, the wire contract and the WSL bridge — shared by both binaries, so a fix to any of it is made once. The bridge is an instance per binary (`WslInterop.Creds`, `WslInterop.CredsMcp`), each with its own override variable, because one shared `creds.exe` would have sent an MCP handshake to the CLI |
| The MCP server | `src_mcp/` | `creds-mcp` — what an AI agent talks to. **Sixteen tools** over the same broker, across two objects: entries (list, use, rotate, create, delete, export-env, and `creds_config_snippet` — read-only public text, how code reads a config, from the viewer's own catalog) and folders (list, create, edit, delete, since 0.85.0). Every one is gated by a switch that is off by default — **two ladders, ten switches, inherited down the whole tree** — and by the same consent prompt. Holds no secret and can obtain none, and no request it can compose has a field the switches could arrive in. **Inside WSL it carries the session rather than serving it** — see below |

### The MCP server inside WSL (2026-08-28)

An MCP client usually runs inside the distribution and starts `creds-mcp` as its own child, which
puts the server in a Linux kernel while the window it must reach listens on the **Windows**
loopback — and `127.0.0.1` there is the virtual machine's own. The announcement files are on
Windows too, at a `globalStorage` path whose shape depends on the VS Code edition.

So the Linux binary does not try to reach the window at all. It re-executes `creds-mcp.exe`
through WSL interop and becomes its stdio:

```
MCP client ──stdin──► creds-mcp (Linux) ──pipe──► creds-mcp.exe (Windows) ──loopback──► window
           ◄─stdout──                   ◄─pipe──
```

Three consequences worth stating, because each was a decision:

- **Nothing new listens anywhere.** The bridge is a process boundary, not a socket, so the broker
  stays exactly as loopback-only as it was — the same argument `creds` makes for the same trick.
- **A session is carried, not relayed.** `creds` uses `WindowsBridge.Relay` (one call, streams
  inherited, an exit code back); MCP is a long-lived JSON-RPC conversation in both directions, so
  this uses `StartPiped` and a pump that closes both halves together.
- **The Windows half does the finding.** No Linux-side guess at `/mnt/c/Users/…`, which breaks on
  the first machine whose disk is not `C:`.

- **Who is asking is computed on the Linux side and forwarded as an ARGUMENT (2026-09-12).** The
  consent modal names its caller — agent, session, folder — and the Linux half is the process the
  MCP client actually spawned, so its environment holds the session; the Windows half's belongs to
  `wsl.exe`, and a pid found there would name somebody else's session. The record crosses as
  `--caller <base64url json>` (environment variables do not cross the bridge — measured), and only
  after a once-per-session hermetic `creds-mcp.exe --help` probe shows the Windows half knows the
  flag: an old half handed an unknown argument dies with a usage error before the handshake, which
  is a dead server rather than a degraded one. Every failure of the probe starts the Windows half
  without the flag. The Windows half fills only the agent's name, from the client that shakes hands
  with it — *the side that spoke to the environment names the session; the side that spoke to the
  client names the client.*

`CREDS_MCP_WINDOWS_BINARY` overrides the executable — its own variable, never the CLI's. Design
record and what the build taught: [PLAN_mcp_wsl_bridge.md](PLAN_mcp_wsl_bridge.md); the caller
record: [PLAN_caller_identity_in_consent.md](../todo/PLAN_caller_identity_in_consent.md).

## Where the contract lives

**Two contracts now, and both are implemented twice.** (Three binaries share the second: the
extension, `creds` and `creds-mcp` — which is why the C# half became a library rather than a copy.)

The HTTP contract between the extension and the server is stated once, in
[module_server.md](module_server.md), and implemented in `Program.cs` and
`src_vs_code/src/serverTransport.ts`. A change to one without the other ships a broken client,
which is why `CLAUDE.md` makes keeping them together a repository rule rather than a hope.

The **broker** contract — how a terminal client asks a VS Code window to use a credential —
used to be a TypeScript module shared by its only two callers, which made it a shared
implementation rather than a specification. With `src_cli/` it gained a second implementation in
another language, so since 2026-08-26 it is a generated file: `contract/broker-v1.json`, emitted
from `brokerProtocol.ts` by `npm run contract`, embedded into the CLI binary at build time, with
a test on **each** side asserting its own tables match it. Since 2026-09-12 it also carries a
`caller` block — the optional label every performing body may carry so the consent modal can name
who is asking: its field name, the four sub-fields, the flat fallback prefix and the 80-character
cap, read off `brokerCaller.ts` rather than retyped. Additive, so the wire's `version` stays 1.

That check earns its place because this class of drift is silent. A client posting `vpn-up` to a
route the broker renamed, or reporting exit 95 where the other reports 0, raises no error
anywhere — it surfaces as an agent drawing a wrong conclusion in somebody’s terminal, with
nothing in any log to explain it. Exactly that bug was found on the Node side while the CLI was
being written: every verb whose answer carries no `exitCode` reported success as failure 95.
