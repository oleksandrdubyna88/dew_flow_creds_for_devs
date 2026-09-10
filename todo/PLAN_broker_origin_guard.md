# PLAN — the broker refuses browsers at the door

> Status: **plan only, nothing implemented yet, 2026-09-10.** Scope: `src_vs_code/src/credsAgentServer.ts`,
> a new `brokerOrigin.ts`, their tests, the broker itests.
> Not in the 2026-09-09 audit — found in the 2026-09-10 re-verification
> ([REVIEW_product_audit_2026-09-09.md](REVIEW_product_audit_2026-09-09.md) §Перепроверка).
>
> Related docs: [module_extension.md](../research/module_extension.md) (the broker's doors),
> [PLAN_agent_ssh_broker.md](../research/PLAN_agent_ssh_broker.md), [PLAN_cli_bridge_tail.md](../research/PLAN_cli_bridge_tail.md).

## Symptom

The broker is a loopback HTTP server (`credsAgentServer.ts`), and a web page in the person's browser is
also on loopback. Nothing in `handle` (`:463`) looks at `Origin`, `Host`, `Sec-Fetch-Site` or
`Content-Type`; `respond` (`:704-711`) sets no CORS headers, which is right, and it is the only thing
standing between a page and the broker. Two consequences:

- **The alias door needs no token.** `POST /v1/alias/<action>` (`handleAlias`, `:346-388`) reads a name
  from the body, throttles, mints a grant and goes to `perform` — its authorisation is the rate limit and
  the consent modal. A cross-origin `fetch` with `Content-Type: text/plain` is a *simple request*: no
  preflight, and the body is parsed as JSON regardless of its declared type. So a page the person visits
  can raise the consent dialog in their VS Code for any alias it can name; the page cannot read the
  answer, but on *Allow* the stored command, query or SSH exec runs.
- **Read routes are unauthenticated** (`:466-473`, *"none authenticates"*) and `Host` is never checked
  (`:464` parses the path against a fixed base). Under DNS rebinding — a hostname that resolves to
  `127.0.0.1` — the page is same-origin with the broker and reads `/v1/aliases` and the entry lists:
  names, folders, kinds. Metadata, not secrets, and exactly the names the first consequence needs.

Every real client addresses `http://127.0.0.1:<port>` (`agentCli.ts:55`, `BrokerClient.cs:154`); the pipe
listener serves the same handler (`brokerListeners.ts`) and the WSL relay carries the bytes of a client
that composed the same URL. None is a browser; none sends `Origin`.

## What must be true when this is done

1. A request carrying an `Origin` header is refused before routing — every route, both listeners.
2. A request whose `Host` is not loopback is refused before routing.
3. Every existing client keeps working: the CLI, the MCP host, the WSL relay, the itests.
4. The refusal is a `403` with a sentence that says *browsers are not served*, logged once per call like
   any other refusal — never a modal.

## Design

One pure function, tested alone, applied first:

```ts
// brokerOrigin.ts
export function admitsRequest(headers: http.IncomingHttpHeaders): { code: 'forbidden'; message: string } | undefined
```

- `Origin` present (including `Origin: null`) → refused. Browsers send it on every `POST` and on every
  cross-origin request; no client of ours ever does.
- `Sec-Fetch-Site` present and not `none` → refused. Belt and braces for the browsers that send it.
- `Host` absent, or not one of `127.0.0.1`, `localhost`, `[::1]`, each with an optional `:port` — refused,
  case-insensitively. A pipe client's `Host` is what its URL said (`127.0.0.1:<port>`); this is proved by
  the itests below rather than assumed.
- `Content-Type` is **not** enforced: the body is parsed as JSON and refused otherwise, and the `Origin`
  rule already removes the browser case. Written down so nobody adds it later as "hardening" and breaks
  a client that sends none.

`handle` (`credsAgentServer.ts:463`) calls it before the read routes; the refusal goes through
`respondError(res, 'forbidden', …)` with no grant, so it is answered and not journalled per call (the
same rule the unknown-token probe follows at `:723-724`), but counted once in the output channel so a
person can see that something on their machine is knocking. `ErrorCode` gains `'forbidden'` if it lacks
one (`brokerProtocol.ts`); `statusForErrorCode` maps it to 403.

## Build order

1. RED: `brokerOrigin.test.ts` (new) — the table below, pure.
2. RED: `credsAgentServer.test.ts` — `'a request carrying an Origin header is refused at the door and
   nothing runs — both doors'` (alias door: today a dialog opens and the action runs);
   `'a Host that is not loopback is refused, on the health route too'`.
3. `admitsRequest`, the call in `handle`, the error code → GREEN.
4. `npm run typecheck`; full `npm test`; `node scripts/agent-broker-itest.cjs`,
   `node scripts/creds-cli-itest.cjs`, `node scripts/creds-mcp-itest.cjs` (real clients over the real
   port and pipe); `creds-mcp-wsl-itest.cjs` where WSL is available on this machine.
5. `module_extension.md` (the broker's door: what is refused before routing); `CHANGELOG.md`.

## Test plan

| Headers | Verdict |
|---|---|
| `Host: 127.0.0.1:4123` | admitted |
| `Host: localhost`, `Host: LOCALHOST:80`, `Host: [::1]:4123` | admitted |
| `Host: evil.example:4123` (rebound) | refused |
| no `Host` | refused |
| `Origin: http://evil.example` / `Origin: null` / `Origin: http://127.0.0.1:4123` | refused — all three |
| `Sec-Fetch-Site: cross-site` / `same-site` / `same-origin` | refused; `none` admitted |
| alias door with `Origin`, over real HTTP | 403, no dialog, `w.ran` empty |
| itests | every real client admitted |

## Definition of Done

- [ ] All tests above; RED and GREEN reported.
- [ ] `npm run typecheck`, `npm test`, the three itests green (WSL itest reported as run or as not
      runnable here, with the reason).
- [ ] `module_extension.md` and `CHANGELOG.md` updated.
- [ ] `coai` plan → `proceed`, code round run, findings resolved.
- [ ] Promoted to `research/` with deviations recorded.
