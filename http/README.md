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
| [`metrics/`](metrics) | `/api/metrics` |
| [`org-recovery/`](org-recovery) | the eleven corporate-recovery routes |

## The environment this suite expects

A contract suite has an environment contract, and a failure to meet it is an **environment** failure —
never a regression in the API. Reading it once is enough; you will not need it again unless a
precondition genuinely changed.

| What | Why the suite needs it |
|---|---|
| `Auth:Local:SigningKey` ≥ 32 bytes, and the same value in `VAULT_LOCAL_SIGNING_KEY` | Microsoft and Google tokens exist only after an interactive sign-in. The `Local` scheme is symmetric, so the suite signs its own tokens — which is what makes every authenticated request runnable headless. |
| `Vault:AllowedDomains=example.com` | The 403 branch is *"your token is fine and your domain is not served here"*. Reaching it needs a domain the server refuses, so it needs a domain it accepts. |
| `Vault:CorpRecovery:OfficerEmails=officer@example.com,officer2@example.com` | `/api/metrics` and every recovery lever are officer-only. Without a roster the server answers 403 to everyone, and the officer requests fail for an environmental reason. |
| A **fresh** `Vault:DataDir` | `vault/vault.http` opens with "there is no vault yet". The file deletes what it created, so a completed run leaves the store as it found it; an interrupted one does not. |

**The signing key is never in this repository.** Whoever holds it can mint a token for any email on
that server (`deploy/README.md` says so), so it belongs to a throwaway local server and nothing else.
`http-run.mjs --require-env VAULT_LOCAL_SIGNING_KEY` refuses to start without it, because a suite
running with an empty key produces a wall of 401s that reads exactly like an auth regression.

## Running it

```bash
npm install --save-dev httpyac@6.16.7            # once per machine

export VAULT_LOCAL_SIGNING_KEY="$(openssl rand -base64 48)"
Auth__Local__SigningKey="$VAULT_LOCAL_SIGNING_KEY" \
Vault__AllowedDomains=example.com \
Vault__CorpRecovery__OfficerEmails=officer@example.com,officer2@example.com \
Vault__DataDir=/tmp/vault-suite \
Vault__PublishInstanceFile=false \
  dotnet run --project src_minimalapi_server/src --urls http://127.0.0.1:5099 &

node .claude/rules/shared/tools/http-run.mjs \
  --require-env VAULT_LOCAL_SIGNING_KEY --env local --target http://127.0.0.1:5099
```

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
