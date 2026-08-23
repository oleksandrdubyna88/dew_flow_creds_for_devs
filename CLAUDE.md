# Claude Code — Project Rules for dew_flow_creds_for_devs

These rules apply to all code in this repository and override Claude's defaults. The family-wide
doctrine lives in [.claude/rules/shared](.claude/rules/shared) (a submodule of
`dew_flow_conventions`) — this file carries only what is specific to THIS repository, deliberately:
a copied rule is a mirror that drifts.

## Project Overview

`dew_flow_creds_for_devs` is a **credential manager for developers**, in two halves that ship
independently and are versioned independently:

- `src_vs_code` — the **CredsForDevs** VS Code extension. Holds the secrets, does all the
  cryptography, and is the only thing that ever sees plaintext.
- `src_minimalapi_server` — the **Cred Vault Server**, a .NET 10 minimal API. A zero-knowledge blob
  store and share relay: it stores ciphertext it cannot read, and stamps share sender identity from
  a verified token so it cannot be forged.

The trust boundary between them is the whole product. **The server never holds a key that opens a
vault**, and no change may make it able to. A feature that would require the server to understand a
payload is the wrong feature.

**This repository is public and MIT-licensed.** Anything committed here is published; the deployment
secrets live in `deploy/.env`, which is git-ignored and must stay that way.

**Read first:** [README.md](README.md), then [research/architecture.md](research/architecture.md)
and the relevant `research/module_*.md`.

## Commands

```bash
# --- server (.NET) ---
dotnet build dew_flow_creds_for_devs.slnx -c Debug

# Run tests — ALWAYS via the test project's executable, NEVER `dotnet test`
# (xUnit v3 / Microsoft Testing Platform: there is no VSTest testhost, so `dotnet test` aborts)
./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe
./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe --filter-class "*SharingTests"

# Run the server standalone (the Local scheme needs no cloud IdP)
Vault__DataDir=/tmp/cv Vault__AllowedDomains=example.com \
  Auth__Local__SigningKey=dev-key-dev-key-dev-key-32bytes! \
  ASPNETCORE_URLS=http://127.0.0.1:5113 \
  dotnet run --project src_minimalapi_server/src

# --- extension (TypeScript) ---
cd src_vs_code
npm ci
npm run typecheck
npm test                    # node:test over out/test/*.test.js
npm run package             # builds the .vsix
npm run icon                # regenerates media/icon.png from the same glyph as icon.svg

# --- deployment ---
cd deploy && cp .env.example .env && $EDITOR .env && docker compose up -d
./update.sh                 # pull + recreate + verify health, with --rollback
./backup.sh /mnt/nas/vault  # verified tarball of data + certs + .env

# --- a fresh clone needs the shared rules before a session sees them ---
git submodule update --init .claude/rules/shared
```

## Project Structure

| Path | Role |
|------|------|
| `src_vs_code/src/` | Extension logic. Every module that needs a unit test imports **no** `vscode` |
| `src_vs_code/src/test/` | `node:test` suites — run directly against compiled `out/`, no VS Code harness |
| `src_minimalapi_server/src/` | `Program.cs` (pipeline + endpoints), `VaultStore`, `TokenIdentity`, `Models` |
| `src_minimalapi_server/tests/` | xUnit v3 on Microsoft Testing Platform, in-process via `WebApplicationFactory` |
| `deploy/` | The one-command Docker stack: app + nginx + certbot, and the operator scripts |
| `research/` | The system as it is — architecture, module docs, implemented plans |
| `todo/` | Work not yet done |

## Repository-specific rules

1. **The server must never be able to decrypt.** `VaultStore` stores opaque bytes; `ShareItem.Data`
   is client-sealed ciphertext. Adding a server-side field that requires reading a payload breaks the
   product's central claim — and the README's comparison table with it.
2. **Sender identity is stamped, never accepted.** `POST /api/shares` takes `toEmail` from the body
   and `fromEmail` from the **verified token**. A change that lets a client supply its own sender
   re-introduces the forgery the server exists to prevent.
3. **The testable half of the extension imports no `vscode`.** `cryptoUtils`, `keyWrap`, `pinPolicy`,
   `shareFormat`, `syncMerge`, `versionVector`, `secretClipboard`, `serverTransport` are deliberately
   free of it — that is why their edge cases are real tests instead of hopeful comments. Keep new
   pure logic on that side of the line.
4. **The two products version separately.** Release tags are `server-vX.Y.Z` and `extension-vX.Y.Z`;
   `.github/workflows/release.yml` keys off the prefix. Never a single repo-wide version.
5. **`deploy/certbot/` holds a committed script; `deploy/certbot-data/` holds runtime certificates.**
   The suffix is load-bearing — an earlier layout put both in one directory, and the `.gitignore`
   entry for the data silently excluded the script.
6. **Anything that changes the HTTP contract changes two codebases.** The extension's expectations
   live in `src_vs_code/src/serverTransport.ts`; the server's endpoints in `Program.cs`. They are
   documented together in [research/module_server.md](research/module_server.md), and a change to one
   without the other ships a broken client.

## Definition of Done

- [ ] `dotnet build dew_flow_creds_for_devs.slnx` — 0 warnings (warnings are errors here).
- [ ] The server test executable runs green, and `npm test` in `src_vs_code` runs green.
- [ ] New behaviour has tests; a fix has a test **watched failing first**, and the summary reports
      both the failure message and the pass.
- [ ] A change to the HTTP contract updated both sides and `research/module_server.md`.
- [ ] A change to `deploy/` was proven by actually bringing the stack up, not by reading the YAML.
- [ ] Any plan the work finished was promoted with its deviations recorded
      (`node .claude/rules/shared/tools/plan-lifecycle.mjs` is CI's check).
- [ ] `node .claude/rules/shared/tools/pin-check.mjs` passes.
