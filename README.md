# CredsForDevs

**Your coding agent can run the migration. It can never be handed the password.**

A credential vault in the editor you already have open — SSH hosts and keys, database connections,
VPN profiles, terminal commands, config files and secrets — with a broker that lets an AI coding
agent act on them over **SSH, database and VPN protocols**, which no HTTP proxy can broker.

[Marketplace](https://marketplace.visualstudio.com/items?itemName=remsoftdev.creds-for-devs) ·
[How the broker works](research/PLAN_agent_ssh_broker.md) ·
[Security model](research/architecture.md) ·
[Self-host the team server](deploy/README.md) ·
[Security reviews](research/)

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/remsoftdev.creds-for-devs?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=remsoftdev.creds-for-devs)
[![Licence](https://img.shields.io/badge/licence-MIT-green)](LICENSE)
[![ci · extension](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/actions/workflows/ci-extension.yml/badge.svg)](.github/workflows/ci-extension.yml)
[![ci · server](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/actions/workflows/ci-server.yml/badge.svg)](.github/workflows/ci-server.yml)

Your SSH keys are in `~/.ssh`, your connection strings are in `appsettings.Development.json`, your
`.ovpn` files are somewhere in Downloads — and the moment you point a coding agent at any of them,
it can read all of it.

- [x] SSH hosts, keys, jump hosts and port forwards — connect in one click, never retype
- [x] Databases — Postgres, MySQL, SQL Server, MongoDB
- [x] VPN profiles — WireGuard and OpenVPN, up and down from the tree
- [x] Terminal commands and scripts, arguments as rows, variables through the environment
- [x] Config files kept out of git, read back from code in twenty languages
- [x] Payment instruments, one-time codes, seed phrases
- [x] A broker for AI agents — act on a credential, never receive it
- [x] Ten permission switches, every one off by default, and a prompt on every single call
- [x] A single-binary CLI, 6.8 MB, no runtime to install first
- [x] Optional self-hosted team sync the server cannot decrypt

## What makes it different

**Act on it, never receive it.** No response shape in the broker protocol has a field a secret could
travel in — a structure, not a policy. The source says it plainly
([`brokerProtocol.ts:7`](src_vs_code/src/brokerProtocol.ts)): *"no shape it could arrive in exists"*.
What that guarantee does and does not cover is spelled out under
[Your agent, and what it may do](#your-agent-and-what-it-may-do) — including where it becomes
best-effort, because a claim with no edge stated is a claim nobody should believe.

**Protocols, not just HTTP.** Every other agent credential broker proxies HTTPS. This one performs
SSH commands, database queries, VPN connections and saved terminal commands on the agent's behalf,
on the machine where the secret already lives.

**Local-first.** Secrets sit in the OS keychain. The team server is optional, stores ciphertext, and
holds no key — there is no decryption routine in it to call.

## Quickstart

### Use the extension

Install [from the Marketplace](https://marketplace.visualstudio.com/items?itemName=remsoftdev.creds-for-devs),
or build it:

```bash
cd src_vs_code
npm ci && npm run package        # produces creds-for-devs-<version>.vsix
code --install-extension creds-for-devs-*.vsix
```

Add an account, add a credential, press Connect. No server, no network for daily use, nothing leaves
the machine. Creating the account profile itself signs in with your existing Microsoft or Google
account — that identity is the profile's name, and nothing is stored with them.

### Run the team server, if you want one

```bash
cd deploy
cp .env.example .env      # edit: your domain, your identity provider, your TLS mode
docker compose up -d
```

That is the whole deployment: the API, an nginx that terminates TLS, and a certbot that obtains and
renews the certificate. Everything that must survive an update — vault blobs, share inboxes,
certificates — lives in host directories the containers only borrow. Full operator guide, including
the four TLS modes and what to choose for an internal network: **[deploy/README.md](deploy/README.md)**.

## The one idea worth knowing

**The server cannot read anything it stores.**

Secrets are encrypted on your machine: AES-256-GCM, under a random master key that is itself wrapped
once per unlock method — a sync PIN, a security key (YubiKey / FIDO2 through WebAuthn PRF), a printed
recovery code, or your organisation's recovery escrow. The PIN wrap is derived with scrypt at
N = 2¹⁷, about 128 MiB and a second of work per attempt. What travels to the server is ciphertext,
and what the server writes to disk is that same ciphertext. It has no key, and there is no code path
that would let it acquire one.

What it adds is the thing a shared folder cannot:

| | A shared NAS folder | This server |
|---|---|---|
| Who may read your ciphertext | everyone with folder access | only you — `GET /api/vault` is scoped to your token's verified email |
| Sender of a shared secret | claimed by the sender, unverifiable | **stamped by the server** from a verified token, so it cannot be set by the sender |
| Joining and leaving | someone edits ACLs, eventually | whatever your identity provider already does |

Without a server, sharing through a folder or a NAS is signed with Ed25519 instead — trust on first
use plus key continuity, which is strong against someone who arrives later and weak against someone
already in place when you first exchanged. That is why a team that needs sender authenticity uses the
server transport.

## What the extension holds

**Nine kinds of entry**, each with the action it exists for: **credentials**, **SSH connections** and
**SSH keys** (connect, install, serve from an agent with a prompt per signature), **VPN configs**
(start and stop the tunnel), **database connections** (open in your client, or run a query),
**terminal commands** (arguments as rows, each with its own note), **scripts** (a highlighted editor,
variables pulled out as `${NAME}` rows and delivered through the environment rather than pasted into
the body), **config files** (the whole `.env` or `appsettings.Development.json`, kept out of git and
read back from code), and **payment instruments** (cards, bank details, seed phrases, read back the
way they are printed). Any entry can also carry one encrypted file and one encrypted image, 4 MiB
each; executables are refused, including as a double extension.

Any entry can be given a **lifetime**, for the staging tokens and one-off keys nobody ever gets round
to deleting: one hour, one day, until VS Code closes, or until an agent has used it once. When the
time comes the entry is really deleted — secret, revision history and a tombstone that carries the
deletion to every machine that syncs — never merely flagged as spent.

Any entry, or a whole folder, can also take **a PIN of its own** — a real second wrap inside the
vault, not a prompt in front of it. A protected entry disappears from every agent-facing surface
rather than refusing on use, and a shared one asks its recipient to choose a PIN of *their* own,
because your PIN was never sent and cannot be.

Around them: folders with types, **project** folders that create the whole set at once, multi-select
for bulk delete, export and share, per-entry created and changed dates, the **last three versions**
of each entry, and an export for people outside your organisation — password-sealed, or plain JSON if
you deliberately ask for it.

## `creds` on another machine

The extension is one half; `creds` is the other — the same broker, reached from a terminal, a script,
or a host you are connected to over Remote-SSH.

```sh
curl -fsSL https://raw.githubusercontent.com/oleksandrdubyna88/dew_flow_creds_for_devs/main/install.sh | sh
```

Native AOT: one file, no runtime to install first — 6.8 MB on disk, about 3 MB to download, built for
six platforms. It picks the build for the machine it runs on, verifies the release checksum, and
refuses to install on a mismatch. `CREDS_PREFIX` chooses somewhere other than `/usr/local/bin`;
`CREDS_VERSION` pins a release instead of taking the newest.

Piping a script into `sh` is worth being deliberate about, on a tool about credentials most of all.
[install.sh](install.sh) is short enough to read in a minute and does exactly what is written above —
download it and look before you run it on anything you care about.

**What it does NOT install is a credential.** `creds` holds none and can obtain none: it relays a
request to the VS Code window that minted the grant token, that window performs the action, and only
the output comes back.

## Your agent, and what it may do

An AI agent reaches this vault through MCP — and reaches **nothing** until you say so. Every entry is
invisible to an agent until you turn a switch on for it, including every entry that existed before
the feature.

**Ten switches on two ladders**, all off by default — six over entries, four over folders. Deleting
implies creating implies replacing implies using implies seeing, so *"may change it but may not see
it"* is not a state you can assemble by clicking. Set them on a folder and the entries in it inherit,
including ones created there later.

| Switch | What an agent may do |
|---|---|
| **Visible to agents** | see the entry's non-secret half — name, host, user, port, and a connection string with the password removed |
| **Usable by agents** | ask to run a command, a query, a saved script; open a terminal or bring a VPN up |
| **Agents may replace the secret** | rotate it, without seeing the old value or the new one |
| **Agents may create entries** | store a credential in a folder you opened for it |
| **Agents may delete what they created** | move an entry to the Trash — never permanently |
| **Agents may delete anything here** | the same, over entries it did not create |
| **Agents may rename and move folders** | reorganise inside what you opened |
| **Agents may create folders** | make a folder to put things in |
| **Agents may delete folders they created** | to the Trash, never permanently |
| **Agents may delete any folder here** | the same, over folders it did not create |

Two things hold at every level. **A secret is never handed over**: the window holds the value, uses
it, and answers with the result — there is no field in the protocol one could travel in. And **the
switch is not consent**: every single call still asks you, in your editor, showing the real entry and
the real command.

**Where that guarantee ends, stated rather than glossed.** The structural half — no response field
can carry a secret — holds absolutely. The second half is different: if an approved command *prints*
a credential, the value appears in that command's own output, and a masker replaces this entry's
stored values on the way out. That masker **fails open by design** — if it cannot build its table it
lets the answer through rather than turning a working command into an outage — and it can only mask
values it knows, so a secret the vault has never seen passes through unchanged. It is a second line,
not the first. Approve commands you would be willing to see the output of.

Rotation is the one that sounds impossible. To change a password somebody must know the new one — so
the agent never writes it. It writes a placeholder:

```sql
ALTER USER app IDENTIFIED BY '{{creds:new}}'
```

The window generates the value, substitutes it, runs the statement, snapshots the old value into that
entry's history, and stores the new one. Only a statement that **succeeded** updates the vault. You
approve the statement with the placeholder still in it, which is what makes it safe to show you. This
is wired to **database and SSH entries**; other kinds cannot be rotated this way.

Note the two syntaxes are different things and both are real: `{{creds:new}}` means *"a value that
does not exist yet, mint it"*, while `creds://you@corp.com/prod-db/password` is a reference to the
value stored **today**, resolved into a child process's environment and masked out of its output.

There is exactly one call where a secret travels *toward* the vault: an agent that provisioned
something and holds the key can store it. **⋯ → MCP logs** counts those by name — along with
everything an agent asked for and did not get. Install the server from
**⋯ → Install the MCP Server…**; it is a separate binary, and the extension still has zero runtime
dependencies.

## Two honest caveats

**Linux without a Secret Service.** VS Code stores secrets in the OS keychain. On a Linux box with no
Secret Service running, it silently falls back to an obfuscated file store — which is not encryption.
The extension warns, and the fix is to install a keyring, not to ignore it.

**Agents in containers.** *Share with Claude Code* reaches an agent running beside the editor. An
agent inside a container cannot reach the broker socket, and the Remote Bridge exists for the cases
where a bridge is possible.

## Two products, one repository

| | What it is | Ships as |
|---|---|---|
| [`src_vs_code`](src_vs_code) | **CredsForDevs**, a VS Code extension | a `.vsix` on the Marketplace |
| [`src_minimalapi_server`](src_minimalapi_server) | **Cred Vault Server**, a .NET 10 minimal API, Native AOT | a 50 MB container image |

They version separately, on separate tags, and each half has its own CI workflow —
[ci · extension](.github/workflows/ci-extension.yml) and [ci · server](.github/workflows/ci-server.yml)
— because a change to one should never be blocked by the other's toolchain.

## Where the real documentation lives

- [research/architecture.md](research/architecture.md) — how the two halves fit together, the trust
  boundary, and the sequence of a sync
- [research/module_extension.md](research/module_extension.md) — the extension's layers, crypto, and
  sync algorithm
- [research/module_server.md](research/module_server.md) — every endpoint, its authorization rule,
  and the storage layout
- [research/module_deployment.md](research/module_deployment.md) — the container stack, TLS, updates
  and backups
- [research/PLAN_agent_ssh_broker.md](research/PLAN_agent_ssh_broker.md) — the broker, end to end
- [research/PLAN_mcp_server.md](research/PLAN_mcp_server.md) — the MCP surface, the switches, the journal
- [research/PLAN_org_recovery.md](research/PLAN_org_recovery.md) — corporate break-glass, and why the
  server still cannot open a vault alone
- [research/SECURITY_REVIEW_2026-08-24.md](research/SECURITY_REVIEW_2026-08-24.md) — the pre-launch
  review of the whole product, three critical findings and their fixes
- [research/SECURITY_REVIEW_2026-08-23.md](research/SECURITY_REVIEW_2026-08-23.md) — the security,
  reliability and architecture review, with what was fixed and what was not
- [todo/](todo/) — what is still open, as executable plans
- [CLAUDE.md](CLAUDE.md) — the rules a contributor, human or agent, works under here

## Building everything

```bash
git submodule update --init .claude/rules/shared   # shared conventions

dotnet build dew_flow_creds_for_devs.slnx
./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe

cd src_vs_code && npm ci && npm run typecheck && npm test
```

## Reporting a vulnerability

Open a [security advisory](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/security/advisories/new)
rather than a public issue. Everything in [research/](research/) that begins `SECURITY_REVIEW_` is a
past pass over this code, findings and all, including the ones that were not fixed and why.

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, ship it.
