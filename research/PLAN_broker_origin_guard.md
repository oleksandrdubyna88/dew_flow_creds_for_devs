# PLAN — the broker refuses browsers at the door

> Status: **IMPLEMENTED, 2026-09-11.** Scope as built: `brokerOrigin.ts` (new), `credsAgentServer.ts`,
> `brokerProtocol.ts`, `brokerRequests.ts`, `brokerOrigin.test.ts` and `brokerOriginDoor.test.ts` (new),
> `brokerWorld.ts`, `research/module_extension.md`.
> Not in the 2026-09-09 audit — found in the 2026-09-10 re-verification
> ([REVIEW_product_audit_2026-09-09.md](../todo/REVIEW_product_audit_2026-09-09.md) §Перепроверка).
>
> Related docs: [module_extension.md](module_extension.md) (the broker's doors),
> [PLAN_agent_ssh_broker.md](PLAN_agent_ssh_broker.md), [PLAN_cli_bridge_tail.md](PLAN_cli_bridge_tail.md).

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


## What shipped differently

**The plan framed `Origin` as the main defence, and it is not.** A reviewer pointed out that a browser
omits `Origin` on a same-origin GET — and after a DNS rebind the page IS same-origin, so the read
routes this change exists to close would have stayed open. **`Host` is what closes rebinding**: the
browser sends the name the page was loaded from, which is the attacker's. `Origin` closes the other
half, the ordinary cross-origin POST that reaches the token-less alias door.

**The port is checked too**, which three reviewers asked for independently. A browser sends the port
it connected to, so `Host: localhost` (meaning 80) or a mismatched port cannot come from a page that
reached this listener. `admitsRequest` therefore takes the port it is guarding.

**The door is a WRAPPER, not a branch.** The plan put the check at the top of `handle`; a reviewer
asked for the common entry point instead, and they were right — `behindTheDoor` wraps the handler both
listeners are given, so "every listener is covered" is true by construction rather than by every
listener happening to route through one method.

**`Connection: close` on a refusal**, also a reviewer's: the body was never read, and a keep-alive
socket holding an unread body serves nobody.

**A documentation defect of mine was found and fixed here.** `research/module_extension.md` still said
the masker "fails open by design" — the opposite of what the code has done since the masking change.
That edit was lost resolving a rebase conflict on that branch, so main carried a doc that contradicted
its own source. Repaired, with the masking and door sections it should have had.

**`credsAgentServer.ts` hit its 800-line ceiling again**, so the door lives entirely in
`brokerOrigin.ts` and the bearer-token authorisation moved to `brokerRequests.ts`, which already owns
request admission. 798 lines.

## What was checked rather than assumed

Four reviewers predicted that the named-pipe and Unix-socket listener would 403 everything, because an
IPC client sends no TCP `Host`. **It does not**, and the reason is in `BrokerClient.cs`'s own comment:
the client composes `http://127.0.0.1:<port>/…` and the transport is chosen separately, so the `Host`
is the URL's either way. Evidence rather than argument: `creds-mcp-wsl-itest` — which crosses WSL, the
bridge and the pipe — passes its functional checks, as do `agent-broker-itest`, `creds-cli-itest`,
`creds-mcp-itest` and `wsl-agent-relay-itest`.

## Open tail

- **The pipe path is covered by the WSL integration tests, not by a unit test.** The broker harness
  starts only the loopback listener, so the `Host` an IPC client sends is asserted indirectly. Worth
  a direct test the day the harness can start the extra listener.
- **Two WSL integration checks fail on this machine** — `no half of the bridge outlives the client`
  and `disposing the manager takes it down` — both naming installed WSL binaries and both failing the
  same way with this change stashed. Reported as pre-existing rather than claimed unrelated.


## The regression it caused, and the fix

**The `Host` check was applied to a listener that has no host.** Both of the broker's listeners share
one router, and the door was wrapped around the router — so the unix socket (a named pipe on Windows)
got the port's door. A caller reaching the broker over that socket was never told a port: the WSL
bridge and Remote-SSH forward a socket *because* no loopback port is reachable. The URL it composes
therefore cannot name our port, and `creds ssh <name>` over the socket started answering `403`.

`NOT_ON_THE_NETWORK` is now that listener's facing, and `doorsFor` builds one wrapper per listener
(sharing the once-per-window note). The `Host` check is skipped there; the browser-header checks are
not. This is not a weakening: `Host` exists to close DNS rebinding, which is a browser attack, and no
page can open a unix socket or a named pipe.

The socket's guard is its file mode — 0600 on POSIX, which refuses another user before any of our
code runs; on Windows the pipe takes the default DACL and is a convenience rather than a boundary.
Behind the transport, each route authorises exactly as it does on the port, because they share one
router: the token door needs a grant token, the **alias door needs none** (its authorisation is the
rate limit and the consent modal, and it mints its own grant), and the **read routes authenticate
nothing** — which is precisely why the browser-header checks stay on this listener. Nothing here
changed; a precondition that could never hold was removed.

**Why it reached `main`.** The only thing exercising the path was one case in `creds-cli-itest.cjs`,
guarded by `process.platform !== 'win32'`, so it could not run on the machine the change was written
on. There are unit tests now: `brokerOrigin.test.ts` decides the headers for both facings, and
`brokerOriginDoor.test.ts` drives the real second listener end to end on **both** platforms — the
first unit test that has ever opened it.
