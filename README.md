# dew_flow_creds_for_devs

A credential manager for developers: SSH hosts, keys, VPN configs, database connections and
passwords, in the editor you already have open — with an optional self-hosted server so a whole team
can share them without anyone running a password vault they have to trust.

Two products, one repository:

| | What it is | Ships as |
|---|---|---|
| [`src_vs_code`](src_vs_code) | **Cred SSH Manager**, a VS Code extension | a `.vsix` on the Marketplace |
| [`src_minimalapi_server`](src_minimalapi_server) | **Cred Vault Server**, a .NET 10 minimal API | a container image |

The extension works on its own. The server is optional, and only becomes interesting when more than
one person is involved.

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

## Quickstart

### Use the extension

Install from the Marketplace (see [PUBLISHING.md](src_vs_code/docs/PUBLISHING.md) if you are
publishing it yourself), or build it:

```bash
cd src_vs_code
npm ci && npm run package        # produces cred-ssh-manager-<version>.vsix
code --install-extension cred-ssh-manager-*.vsix
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

Both halves build and test independently in CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)),
because a change to one should never be blocked by the other's toolchain.

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, ship it.
