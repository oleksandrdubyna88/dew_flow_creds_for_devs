# dew_flow_creds_for_devs

A credential manager for developers: SSH hosts, keys, VPN configs, database connections and
passwords, in the editor you already have open — with an optional self-hosted server so a whole team
can share them without anyone running a password vault they have to trust.

Two products, one repository:

| | What it is | Ships as |
|---|---|---|
| [`src_vs_code`](src_vs_code) | **CredsForDevs**, a VS Code extension | a `.vsix` on the Marketplace |
| [`src_minimalapi_server`](src_minimalapi_server) | **Cred Vault Server**, a .NET 10 minimal API | a container image |

The extension works on its own. The server is optional, and only becomes interesting when more than
one person is involved.

There is also a third party in the room now: an **AI coding agent**. *Share with Claude Code…* gives
one the use of an SSH credential — it can run commands on the host and ask for your terminal — while
the plaintext stays where it was. The extension runs `ssh` on the agent's behalf, the token dies with
the VS Code window that minted it, and the first use needs a click from you. See the
[extension's listing](src_vs_code/README.md#share-with-claude-code--an-agent-that-uses-a-credential-it-never-receives)
and [research/PLAN_agent_ssh_broker.md](research/PLAN_agent_ssh_broker.md).

## The one idea worth knowing

**The server cannot read anything it stores.**

Secrets are encrypted on your machine (AES-256-GCM under a scrypt-derived key, or a random master
key wrapped once per unlock method — a PIN, a YubiKey). What travels to the server is ciphertext,
and what the server writes to disk is that same ciphertext. It has no key, and there is no code path
that would let it acquire one.

What it does add is the thing a shared folder cannot:

| | A shared NAS folder | This server |
|---|---|---|
| Who may read your ciphertext | everyone with folder access | only you — `GET /api/vault` is scoped to your token's email |
| Sender of a shared secret | claimed by the sender, unverifiable | **stamped by the server** from a verified token |
| Joining and leaving | someone edits ACLs, eventually | whatever your identity provider already does |

## What the extension holds

Seven kinds of entry, each with the action it exists for: **credentials**, **SSH connections**
and **SSH keys** (connect, install), **VPN configs** (start/stop the tunnel), **database
connections** (open in your client, or a query), **terminal commands** (arguments as rows, each
with its own note, run with one click) and **scripts** (a highlighted editor, variables pulled
out as `${NAME}` rows and delivered through the environment rather than pasted into the body).
Any entry can also carry one encrypted file and one encrypted image.

Any entry can also be given a **lifetime**, for the staging tokens and one-off keys nobody ever
gets round to deleting: one hour, one day, until VS Code closes, or until an agent has used it
once. When the time comes the entry is really deleted — secret, revision history and a tombstone
that carries the deletion to every machine that syncs — never merely flagged as spent.

Around them: folders with types, **project** folders that create the whole set at once, Ctrl/Shift
multi-select for bulk delete/export/share, per-entry created and changed dates, the **last 3
versions** of each entry, and an export for people outside your organisation — password-sealed, or
plain JSON if you deliberately ask for it.

And two things that exist because pasting a secret into a chat window should not be the only
option:

- **Share with Claude Code** — an AI agent gets a capability token, not a credential. It can ask
  the extension to run an SSH command, a stored script, a saved command, a SQL query, or bring a
  VPN up; the extension performs it and returns only the output. The broker has no endpoint that
  returns plaintext, and that is structural: no response shape in the protocol has a field a
  secret could travel in.
- **Terminal environment variables** — bind a secret to a name, and it appears in new integrated
  terminals without ever being echoed or copied.

## Quickstart

### Use the extension

Install from the Marketplace (see [PUBLISHING.md](src_vs_code/docs/PUBLISHING.md) if you are
publishing it yourself), or build it:

```bash
cd src_vs_code
npm ci && npm run package        # produces creds-for-devs-<version>.vsix
code --install-extension creds-for-devs-*.vsix
```

Add an account, add a credential, press Connect. Nothing else is required — no server, no account
anywhere, no network.

### Run the server

```bash
cd deploy
cp .env.example .env      # edit: your domain, your identity provider, your TLS mode
docker compose up -d
```

That is the whole deployment. It brings up the API, an nginx that terminates TLS, and a certbot that
obtains and renews the certificate. Everything that must survive an update — vault blobs, share
inboxes, certificates — lives in host directories the containers only borrow.

Full operator guide, including the four TLS modes and what to choose for an internal network:
**[deploy/README.md](deploy/README.md)**.

## `creds` on another machine

The extension is one half; `creds` is the other — the same broker, reached from a terminal, a
script, or a host you are connected to over Remote-SSH. On a remote host it is what turns the
bridge into something usable, and it is why *Open Remote Bridge…* hands you a setup block rather
than a working command.

```sh
curl -fsSL https://raw.githubusercontent.com/oleksandrdubyna88/dew_flow_creds_for_devs/main/install.sh | sh
```

Native AOT: one file, no runtime to install first — 6.8 MB on disk, ~3 MB to download. It picks
the build for the machine it runs on, verifies the release checksum, and refuses to install on a
mismatch. `CREDS_PREFIX` chooses somewhere other than `/usr/local/bin`; `CREDS_VERSION` pins a
release instead of taking the newest.

Piping a script into `sh` is a thing worth being deliberate about, on a tool about credentials
most of all. [install.sh](install.sh) is 120 lines, does exactly what is written above, and reads
in a minute — download it and look before you run it on anything you care about.

**What it does NOT install is a credential.** `creds` holds none and can obtain none: it relays a
request to the VS Code window that minted the grant token, that window performs the action, and
only the output comes back. There is no field in the protocol a secret could travel in.

## Your agent, and what it may do

An AI agent can reach this vault through MCP — and reaches **nothing** until you say so. Every
entry is invisible to an agent until you turn a switch on for it, including every entry that
existed before the feature.

Six switches per entry, on a ladder, all off by default. Deleting implies creating implies
replacing implies using implies seeing, so *"may change it but may not see it"* is not a state you
can assemble by clicking. Set them on a folder and the entries in it inherit — including ones
created there later.

| Switch | What an agent may do |
|---|---|
| **Visible to agents** | see the entry's non-secret half — name, host, user, port, and a connection string with the password removed |
| **Usable by agents** | ask to run a command, a query, a saved script; open a terminal or a VPN for you |
| **Agents may replace the secret** | rotate it, without seeing the old value or the new one |
| **Agents may create entries** | store a credential in a folder you opened for it |
| **Agents may delete** | move an entry to the Trash — never permanently, and optionally only what it created itself |

Two things hold at every level. **A secret is never handed over**: the window holds the value, uses
it, and answers with the result — there is no field in the protocol one could travel in. And
**the switch is not consent**: every single call still asks you, in your editor, showing the real
entry and the real command.

Rotation is the one that sounds impossible. To change a password somebody must know the new one —
so the agent never writes it. It writes a placeholder:

```sql
ALTER USER app IDENTIFIED BY '{{creds:new}}'
```

The window generates the value, substitutes it, runs the statement, snapshots the old value into
that entry's history, and stores the new one. Only a statement that **succeeded** updates the
vault. You approve the statement with the placeholder still in it, which is what makes it safe to
show you.

There is exactly one call where a secret travels *toward* the vault: an agent that provisioned
something and holds the key can store it. **⋯ → MCP logs** counts those by name — along with
everything an agent asked for and did not get, and everything it asked this window to generate
that it could not. Install the server from **⋯ → Install the MCP Server…**; it is a separate
binary, and the extension still has zero runtime dependencies.

## Where the real documentation lives

- [research/architecture.md](research/architecture.md) — how the two halves fit together, the trust
  boundary, and the sequence of a sync
- [research/module_extension.md](research/module_extension.md) — the extension's layers, crypto, and
  sync algorithm
- [research/module_server.md](research/module_server.md) — every endpoint, its authorization rule,
  and the storage layout
- [research/module_deployment.md](research/module_deployment.md) — the container stack, TLS, updates
  and backups
- [research/SECURITY_REVIEW_2026-08-23.md](research/SECURITY_REVIEW_2026-08-23.md) — the full
  security, reliability and architecture review, with what was fixed and what was not
- [todo/](todo/) — what is still open, as executable plans
- [CLAUDE.md](CLAUDE.md) — the rules a contributor (human or agent) works under here

## Building everything

```bash
git submodule update --init .claude/rules/shared   # shared conventions

dotnet build dew_flow_creds_for_devs.slnx
./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe

cd src_vs_code && npm ci && npm run typecheck && npm test
```

Each half has its own CI workflow — [ci · extension](.github/workflows/ci-extension.yml) and
[ci · server](.github/workflows/ci-server.yml) —
because a change to one should never be blocked by the other's toolchain.

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, ship it.
