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
