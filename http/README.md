# `http/` — the vault server's contract suite

One folder per route group, per
[`.claude/rules/shared/common/http-contracts.md`](../.claude/rules/shared/common/http-contracts.md).
The files are ordinary `.http` documents: open one in VS Code and send a single request while you are
writing the endpoint, or run the whole tree headless before a release.

| Folder | Routes |
|---|---|
| [`platform/`](platform) | `/api/health`, `/api/client-config`, `/api/whoami` |
| [`vault/`](vault) | `GET`/`PUT`/`DELETE /api/vault` |
| [`team/`](team) | `/api/team` |
| [`shares/`](shares) | `/api/shares`, `/api/shares/sent`, and both withdrawal paths |
| [`metrics/`](metrics) | `/api/metrics`, read by an officer AND by an administrator — the file enrols its own dedicated `admin@<domain>` once, and never demotes it |
| [`org-recovery/`](org-recovery) | the eleven corporate-recovery routes |
| [`org/`](org) | the corporate surface: `/api/org/me`, the admin's `/api/org/members`, `/api/org/members/{email}` and `/api/org/settings`, and `active.http` — the block/unblock route `/api/org/members/{email}/active`, the blocked caller's `403` with its reason header, and the withdrawn-share receipt and its dismissal; and `login-key.http` — `GET /api/org/login-key`, the one response on this server that carries key material, so it asserts the bytes AND that nothing may cache them; and `events.http` — `GET /api/org/events`, the event log's reader, whose scoped requests are the ones that matter: a member reading their own rows, and a member asking for a colleague BY NAME and still getting only their own |

## This repository has a SECOND HTTP surface, and it is not here

The VS Code extension serves one too: `src_vs_code/src/credsAgentServer.ts` listens on a loopback
port (and, through `brokerListeners.ts`, on a pipe or unix socket) and answers the routes a `creds`
CLI, an MCP client and an alias caller use — `/v1/use/…`, the MCP doors, the config read, health.

**It has no `.http` files, deliberately, and it is not uncovered.** It is served by a VS Code
extension host, and its port and grant token are minted per window and per pid, so there is no
headless run for a suite to make. What the `.http` tier exists to provide — a real request over the
wire — it already has: `src_vs_code/src/test/brokerWorld.ts` starts the **real** server, mints a real
grant, and `call()` does a real `fetch` against `http://127.0.0.1:<port>`. **65 tests** drive it that
way across `credsAgentServer.test.ts` and `brokerMcpRoutes.test.ts`.

Written down because the numbers below invite the wrong conclusion: `http-coverage.mjs` reads C# and
Rust route registrations, so its verdict for this repository — 32 of 32 — is a statement about the
**vault server** and says nothing at all about the extension's API. An armed coverage check is not a
claim that every HTTP surface in a repository has a suite.

For the record, the family's founding evidence for this whole tier came from that second surface:
`/v1/use/exportEnv` was unreachable in every released build because the route grammar rejected a
capital letter, and the first end-to-end run found it in seconds
([testing.md](../.claude/rules/shared/common/testing.md)).

## The environment this suite expects

A contract suite has an environment contract, and a failure to meet it is an **environment** failure —
never a regression in the API. Reading it once is enough; you will not need it again unless a
precondition genuinely changed.

| What | Why the suite needs it |
|---|---|
| `Auth:Local:SigningKey` ≥ 32 bytes, and the same value in `VAULT_LOCAL_SIGNING_KEY` | Microsoft and Google tokens exist only after an interactive sign-in. The `Local` scheme is symmetric, so the suite signs its own tokens — which is what makes every authenticated request runnable headless. |
| `Vault:AllowedDomains=example.com` | The 403 branch is *"your token is fine and your domain is not served here"*. Reaching it needs a domain the server refuses, so it needs a domain it accepts. |
| `Vault:CorpRecovery:OfficerEmails=officer@example.com,officer2@example.com,officer3@example.com` | Every recovery lever is officer-only, `org/` needs corp mode on, and `/api/metrics` — open to administrators as well as officers since 2026-09-12 — still needs a roster: `RequireAdminAsync` sits inside `orgRecovery.Enabled`, so a rosterless server refuses admins too. **Three, not two**: the quorum guard turns a smaller roster OFF (`OrgRecoveryConfig.MinimumOfficers`), so a two-officer environment runs the whole suite against a personal server — the officer requests fail for an environmental reason, and `org/me.http`'s 426 never fires. CI uses the same three. |
| `Vault:LoginKey:Kek` = base64 of **32** bytes | `org/login-key.http` reads a developer's login key. Without it that route answers `503` on purpose — a deployment that has not configured the feature — and every request in the file fails for an environmental reason rather than a contract one. Any throwaway value works; the suite's server is thrown away with it. **CI mints one per run** (`ci-server.yml`, `openssl rand -base64 32`): without it the suite fails four checks with `503` and reports a CONTRACT REGRESSION for what is really an incomplete environment — which is what it did on PR #32, and why the environment table and the workflow have to agree. |
| A **fresh** `Vault:DataDir` | `vault/vault.http` opens with "there is no vault yet". The file deletes what it created, so a completed run leaves the store as it found it; an interrupted one does not. |

**The signing key is never in this repository.** Whoever holds it can mint a token for any email on
that server (`deploy/README.md` says so), so it belongs to a throwaway local server and nothing else.
`http-run.mjs --require-env VAULT_LOCAL_SIGNING_KEY` refuses to start without it, because a suite
running with an empty key produces a wall of 401s that reads exactly like an auth regression.

## Running it

```bash
npm install --save-dev httpyac@6.16.7            # once per machine

# a local run goes below interactive work (.claude/rules/shared/common/local-cpu-budget.md)
LP=.claude/rules/shared/tools/low-priority.mjs

# BUILD first, on its own — never inside the wait for the server (see below)
node $LP dotnet build src_minimalapi_server/src/CredVaultServer.csproj -c Release -m:4 --disable-build-servers

# START the built server from its project directory (its content root) and wait until /api/health answers 2xx.
# The script exits 0 only then, and prints the server's pid and log file; it fails with the exit code and the
# log when the server exits, and with one sentence when the deadline passes.
export VAULT_LOCAL_SIGNING_KEY="$(openssl rand -base64 48)"
(cd src_minimalapi_server/src &&
  Auth__Local__SigningKey="$VAULT_LOCAL_SIGNING_KEY" \
  Vault__AllowedDomains=example.com \
  Vault__CorpRecovery__OfficerEmails=officer@example.com,officer2@example.com,officer3@example.com \
  Vault__CorpRecovery__Threshold=2 \
  Vault__LoginKey__Kek="$(openssl rand -base64 32)" \
  Vault__DataDir=/tmp/vault-suite \
  Vault__PublishInstanceFile=false \
  ASPNETCORE_URLS=http://127.0.0.1:5099 \
    node ../../$LP bash ../../.github/scripts/start-server-and-wait.sh http://127.0.0.1:5099/api/health 60 -- \
    ./bin/Release/net10.0/CredVaultServer)

node $LP node .claude/rules/shared/tools/http-run.mjs \
  --require-env VAULT_LOCAL_SIGNING_KEY --env local --target http://127.0.0.1:5099

kill <the pid the start script printed>   # it IS the server: the script started the apphost itself
```

**Why the server is built first and started through a script** (2026-10-12,
[PLAN_contract_suite_waits_for_a_built_server.md](../research/PLAN_contract_suite_waits_for_a_built_server.md)):
CI used to `dotnet run` — build AND start — inside a 60 s health wait that never failed. On #240 a cold build
took 67.3 s, the wait gave up quietly, and the suite reported **370 failed checks, every one `ECONNREFUSED`**,
for a server that was merely still compiling. `.github/scripts/start-server-and-wait.sh` lets only an answering
server through, so the suite now runs against a server or not at all. It starts the APPHOST rather than
`dotnet run`, because the pid it records — and the only one it ever signals — must be the server itself.

Three local notes. The apphost finds the runtime the way any .NET apphost does, so with .NET installed outside the
standard location (say `~/.dotnet`) set `DOTNET_ROOT` first — otherwise the script fails at once and its log says
*You must install .NET*. Under Git Bash `bash` must be Git's own (Git's `usr\bin` before `System32` on PATH), not
WSL's `bash.exe`. And on Windows `kill <pid>` ends the server without a graceful shutdown (MSYS turns it into
`TerminateProcess`), which is harmless for this throwaway data directory.

The verdict is the **exit code**, not the log tail: `0` pass · `1` contract regression · `3`
environment · `4` configuration · `5` no valid report. Exit `3` means the API was never exercised —
report it as *"the suite could not run"*, not as a finding about the server.

### Against a live deployment

Only the requests tagged `# @prod` are safe to send at something real: they read and change nothing.

```bash
node .claude/rules/shared/tools/http-run.mjs --tag prod --target https://vault.example.com
```

Today that subset still needs a token for everything except `/api/health` and `/api/client-config`,
and this server has no machine identity — see the open question in
[`todo/PLAN_prod_checks_and_http_contracts.md`](../.claude/rules/shared/todo/PLAN_prod_checks_and_http_contracts.md)
in the conventions repository. Until that is decided, [`../POST_DEPLOY.md`](../POST_DEPLOY.md) runs the
anonymous ones.

## Adding an endpoint

Its requests go in the same commit as the endpoint: the happy flow asserting status **and** shape, and
one request per error status the endpoint decides for itself. A branch the wire cannot provoke — the
store being down, a 500 MiB body, a ceremony that needs real key material — gets one
`# @uncovered <status> — <why>` line instead of machinery. `http-coverage.mjs` counts both.
