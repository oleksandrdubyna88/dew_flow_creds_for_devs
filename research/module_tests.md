# module_tests — the scenario harnesses, what each drives, and what none of them covers

> The document `.claude/rules/shared/common/scenario-tests.md` asks every repository for: one
> harness that drives the product the way its users drive it, written in the product's own language,
> kept in git, and **described here — including the flows it does not cover.**
>
> This repository had nine harnesses and no document. The rule's second half is the one that bites:
> *owning a harness is not enough — it has to be named, catalogued and run.* Four of these were run
> by whoever remembered them, and the day this file was written one of them had been broken for long
> enough that nobody could say when.
>
> Unit tests are governed by [testing.md](../.claude/rules/shared/common/testing.md) and are not
> catalogued here. What is here is the tier that starts a real process.

## The tiers

| Tier | Where | Count | What it proves |
|---|---|---|---|
| Unit, extension | `src_vs_code/src/test/*.test.ts`, node:test | 3,302 (4 skipped) | logic, in-process, `vscode` stubbed |
| Unit, .NET | `src_minimalapi_server/tests`, `src_cli/tests`, `src_mcp/tests`, `src_broker_client/tests` — xUnit | 447 | server 300, cli 78, mcp 40, broker 29 |
| HTTP contract | `http/http-run.mjs` over `http/*.http` | 82 requests, 9 files | the real server over HTTP, with a coverage report that refuses an unlisted route |
| Scenario | `src_vs_code/scripts/*-itest.cjs` | 9 harnesses | a real process, a real socket, a real binary |

## The nine harnesses

Every one is a plain `.cjs` file run by node — no framework — because each starts a real process and
what it needs is control over teardown, not a runner. `npm run itest:<name>` compiles first.

| Harness | Drives | In CI | Verified 2026-09-06 |
|---|---|---|---|
| `src_vs_code/scripts/agent-broker-itest.cjs` | the broker over its own loopback HTTP surface, `vscode` stubbed | **yes** — *Integration test (agent broker)* | pass |
| `src_vs_code/scripts/git-transport-itest.cjs` | the encrypted vault in a real git repository: commit, clone, delete | **yes** — *Integration test (git transport)* | pass |
| `src_vs_code/scripts/creds-cli-itest.cjs` | the real `creds` binary against a live broker | **yes** — *Integration test (creds CLI against the broker)* | pass |
| `src_vs_code/scripts/creds-mcp-itest.cjs` | `creds-mcp` over stdio, the full tool surface and both switch ladders | **yes, added 2026-09-06** | pass |
| `src_vs_code/scripts/masked-run-itest.cjs` | a masked run through a real pty, asserting no whole secret appears | **yes, added 2026-09-06** | pass |
| `src_vs_code/scripts/creds-mcp-wsl-itest.cjs` | the same MCP surface, bridged from inside a WSL distribution | no — see below | pass |
| `src_vs_code/scripts/ssh-agent-itest.cjs` | the SSH agent on a named pipe, and which ssh client can reach it | no — see below | pass |
| `src_vs_code/scripts/wsl-agent-relay-itest.cjs` | `ssh-keygen -Y sign` inside Linux reaching an agent in a Windows process | no — see below | pass **after repair — see below** |
| `src_vs_code/scripts/server-transport-itest.cjs` | `ServerTransport` against a RUNNING Cred Vault Server | no — see below | **not run** — needs a server on `127.0.0.1:5113` |

**Why each of the four is not in CI.** *"Not in CI" with a reason is a decision; "not in CI" alone is
a harness rotting* — so each carries one.

- **`creds-mcp-wsl-itest.cjs` and `wsl-agent-relay-itest.cjs`** need a WSL distribution with the .NET
  SDK inside it. The extension job runs on `ubuntu-latest`, where WSL does not exist and the thing
  under test — the Windows↔Linux bridge — has no meaning.
- **`ssh-agent-itest.cjs`** would run on Linux, and that is the reason not to: its subject is the
  Windows named-pipe path and which of the several `ssh-add` binaries on a Windows PATH can reach it.
  On Ubuntu it would exercise the branch it does not exist to protect and report a pass about it.
- **`server-transport-itest.cjs`** needs a Cred Vault Server running with the Local auth scheme. CI
  states this reason in the workflow itself: adding it would mean building and running the server
  inside the extension's job.

Two were added on the day this file was written, because neither had a reason — only an absence.

**`masked-run-itest.cjs` on Linux was verified, not assumed.** A reviewer called adding it to an
`ubuntu-latest` runner blocking, on the grounds that a pty harness written and run only on Windows
usually breaks on Linux. Fair, and checkable: it was run inside a real WSL Ubuntu with node 20 and
every check passed. There is no native pty module here — `node-pty` is not a dependency of this
extension at all; what the harness stubs is VS Code's pseudoterminal *interface*, and the shell it
spawns is the platform's own.

**`server-transport-itest.cjs` is documented from its source, not from a run** — it is the one
harness on this page nobody has executed while writing about it, and that is stated rather than
implied. Its assertions and CI status are read off the file; whether they still hold is unverified
until someone starts a server and runs it. That is the honest state, and it is why it sits last in
`itest:all` with its prerequisite spelled out.

## Prerequisites, timeouts and cleanup

A harness that leaves a socket, a port or a temp directory behind makes the NEXT run lie. Each of
these cleans up after itself on a normal exit; what follows is what to remove after one is killed.

| Harness | Needs | Leaves behind if killed |
|---|---|---|
| `src_vs_code/scripts/agent-broker-itest.cjs` | nothing | a loopback listener and an endpoint file under the temp dir it names |
| `src_vs_code/scripts/git-transport-itest.cjs` | `git` | a temp directory holding a bare repository |
| `src_vs_code/scripts/creds-cli-itest.cjs` | `dotnet build src_cli/src/CredsCli.csproj` | a broker listener, an endpoint file |
| `src_vs_code/scripts/creds-mcp-itest.cjs` | `dotnet build src_mcp/src/CredsMcp.csproj` | a `creds-mcp` child on stdio |
| `src_vs_code/scripts/masked-run-itest.cjs` | nothing | nothing — the child dies with the pty |
| `src_vs_code/scripts/ssh-agent-itest.cjs` | Windows, OpenSSH on PATH | a named pipe, freed when the process exits |
| `src_vs_code/scripts/creds-mcp-wsl-itest.cjs` | WSL + the .NET SDK inside it | a build tree at `/tmp/creds-relay-itest-build` |
| `src_vs_code/scripts/wsl-agent-relay-itest.cjs` | the same | a `creds relay` process inside the distribution and `/tmp/creds-itest.*` — `wsl -e pkill -f 'creds relay'` |
| `src_vs_code/scripts/server-transport-itest.cjs` | a Cred Vault Server on `127.0.0.1:5113`, Local auth | nothing of its own |

Every harness carries its own timeout on the child processes it spawns; none of them waits for ever,
and each prints the command that would fix a missing prerequisite instead of hanging on it. Re-running
after a kill is safe for all of them except the two WSL ones, where a leftover relay holds the socket
the next run wants — that is the one case worth the `pkill` above.

## Running them all at once

```bash
cd src_vs_code && npm run itest:all             # every harness this platform can run
npm run itest:all -- agent git masked-run       # or a named subset
npm run itest:all -- --with-server              # plus the one needing a server you started
```

`src_vs_code/scripts/run-itests.mjs` compiles once — the nine `itest:*` aliases each begin with their
own `npm run compile` — then runs each harness, streaming its output as it arrives rather than
holding it until the child exits, because a harness waiting on a socket looks identical to a hung one
when its output is held back. It prints a summary separating **pass**, **skipped** (a prerequisite is
missing and the harness said so) and **not runnable here** (Windows-only, on a non-Windows machine).

Three details are there because a review round asked for them, and one because Windows refused the
obvious answer:

- **A mistyped name is refused**, by name, with the legal values and a non-zero exit — a typo that
  quietly runs nothing must not report success.
- **Each harness is bounded at fifteen minutes** and killed with the reason named, so a deadlock
  inside one does not deadlock the runner.
- **`server-transport-itest.cjs` is opt-in.** It probes `127.0.0.1:5113` first and reports *skipped*
  when nothing is listening, because an "all tests" command that always exits 1 on a freshly built
  checkout cannot be the routine health check it advertises.
- **It spawns `node` on each script rather than `npm run`, with no shell.** A reviewer asked for
  `shell: false` and was right about the smell — but dropping the shell while still calling `npm`
  fails on Windows with `EINVAL`, measured here: since the CVE-2024-27980 mitigation Node refuses to
  spawn a `.cmd` without a shell, and `npm` on Windows *is* `npm.cmd`. Naming the script directly
  avoids the shell and the alias together.

Verified 2026-09-06 on this machine: `npm run itest:all` — **8 passed, 0 skipped, 0 not runnable
here**.

## What running them found

**`wsl-agent-relay-itest.cjs` could not start.** It crashed with
`TypeError: distros.find is not a function` before its first manager check. Two API drifts, neither
of which anything could have caught:

- `WslRelayManager.start(command, distros)` takes an ARRAY of distribution names. The harness passed
  the bare string `''`, from back when it took one. `['']` is the correct translation — an empty
  name means the default distribution, and `refuse` skips empty entries deliberately.
- `manager.socketPath` became `socketPathFor(distro)` when the manager gained multi-distribution
  support. The harness kept calling the old getter, got `undefined`, and crashed on `.length`.

**The repair was checked for vacuousness, because a reviewer asked whether `['']` exercises
anything.** It does: `refuse` skips empty entries rather than rejecting them, and `start` then calls
`launch('')`, which is the default distribution. The proof is downstream in the same run — *"a real
relay is running in the distribution"* asserts `ps -eo args | grep creds relay` finds one, and
*"disposing the manager takes it down"* asserts it is gone afterwards. A vacuous start would fail
both.

**The lesson is structural, not incidental.** These harnesses are untyped `.cjs` requiring compiled
`out/*.js`, so they can drift away from the API they drive with nothing to notice — no compiler, no
test, and for six of the nine, no CI. A harness that cannot start proves nothing, and it had been
proving nothing silently. The repair is in `wsl-agent-relay-itest.cjs` with the reason written above
each change.

## The corporate event log's reader (2026-09-07, epic 4 story 1)

`GET /api/org/events` is served by the vault server and driven from two tiers, named here because the
flow is new and neither tier alone is evidence about it:

| Tier | What it drives | Where |
|---|---|---|
| In-process, over real HTTP | the route: who is scoped to what, the query grammar's refusals, the cursor over the wire | `src_minimalapi_server/tests/OrgEventsEndpointTests.cs` |
| Store-level, on real files | the reader: ordering, day-file selection, the cursor's stability under an append, a torn line, both budgets, an unopenable file | `src_minimalapi_server/tests/OrgEventLogQueryTests.cs` |
| The wire, against a started stack | the same route as a client sends it — including a member reading their own rows and a member asking for a colleague BY NAME | `http/org/events.http` |

The scenario the endpoint tests exist for, and which no unit test can state, is the scoping one: a
member's page must never carry a row that names only somebody else, whatever they filter by. It is
asserted twice — once in-process, once over the wire — because it is the only rule here whose failure
is silent, and it was watched failing before it passed.

**Driven through the EXTENSION since story 3**: `scripts/server-transport-itest.cjs` accepts a share
through the compiled `ServerTransport` saying `accepted`, then reads the row back through the
extension's own `OrgEventsClient` and asserts the server recorded `share.accepted` naming both
people. That is the live check the contract rule asks for — the client's word and the server's kind
are two implementations of one agreement, and two suites each reading their own copy of the names
prove nothing about it. It skips loudly on a server with no roster, because the log exists only in
corp mode. What is still not driven end to end is the VIEWER: `eventTab.test.ts` and `orgEventsPage.test.ts`
cover what it asks for, what it does with a late answer and what it draws for each of its four
states, and no harness opens an editor to look at it. Named rather than implied — nothing here drives
VS Code itself, as this file's own gap list says.

### What a share writes to it (story 2)

`ShareEventRowTests` drives every share flow over real HTTP against the in-process server and asserts
each row by reading it back OUT of the log, never off a status code:

| Flow | What is asserted |
|---|---|
| a send | one `share.sent` naming both people, the entity and the id |
| accept and decline | two different kinds, the RECIPIENT as actor, and both shares gone from the inbox |
| a delete that says nothing, and one saying a word this build does not know | `share.unknown`, and still `204` |
| a delete that finds nothing | `404` and no row at all |
| a withdrawal, and one of something already taken | one row; and none, because the accept already wrote its own |
| a block | one `share.withdrawn_blocked` per share, beside the `member.blocked` row that keeps the counts |
| an expiry | one row per pruned inbox item, the sender as actor — and a sweep whose caller has already cancelled still records every share it deleted |
| a project's share, withdrawn | the row cites the project, which the receipt now carries |
| a login key | a row on the first call and none on the second |
| a personal deployment | no rows and no `org/` folder |

The one that is not about a row: **no byte of a share's sealed payload reaches the log**. The test
posts a share whose ciphertext is a distinctive marker, reads every byte of every day file, and
asserts the marker is absent — with a control asserting the search would have found the row.

`http/shares/shares.http` covers the same parameter from the wire (accepted, an unknown value, and
none at all); the ROWS are declared `@uncovered` there, because a row is not a response.

## What none of them covers

Named rather than implied, because the rule asks for exactly this.

- **The editor's own UI.** Nothing drives VS Code itself — no extension-host test, no click on a
  tree row, no form filled in. Every harness stubs `vscode` or talks to the broker underneath it.
  So a command registered but never wired to a menu, a context value that stops matching, or a
  webview that throws on open, is caught by unit tests over the pure halves and by nothing else.
- **The Marketplace artefact.** `npm run package` runs in CI, and nothing installs the resulting
  `.vsix` into a real editor and opens it. The publish step is verified by reading the release run.
- **The server and the extension end to end.** `server-transport-itest.cjs` would do it, and it is
  the one harness CI does not run. Today the two halves are verified separately: the extension
  against a stubbed transport, the server against `http/`'s requests — 157 of them as of 2026-09-07.
- **The sync merge under real concurrency.** Version-vector merging has thorough unit tests; no
  harness runs two windows against one vault at the same time. That gap has a plan of its own —
  [PLAN_node_writes_are_last_write_wins.md](PLAN_node_writes_are_last_write_wins.md) — and
  it is where the last-write-wins defect lives.
- **Corporate recovery with three people.** Shamir splitting and the escrow wrap are unit-tested;
  the ceremony across three machines has never been run. It is a human task by nature:
  [ЗАДАЧА_проверка_корп_восстановления.md](../todo/ЗАДАЧА_проверка_корп_восстановления.md).
- **macOS and Linux.** Every harness here runs on Windows, and four of them are Windows-only by
  construction (named pipes, WSL). The Linux keychain fallback the README warns about is asserted by
  unit tests and has no scenario coverage at all.

## How to run everything

```bash
# .NET — 447 tests when this was written; the vault server alone is 530 as of 2026-09-07
dotnet build dew_flow_creds_for_devs.slnx
./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe
./src_cli/tests/bin/Debug/net10.0/CredsCli.Tests.exe
./src_mcp/tests/bin/Debug/net10.0/CredsMcp.Tests.exe
./src_broker_client/tests/bin/Debug/net10.0/BrokerClient.Tests.exe

# the extension's unit suite — 3,302
cd src_vs_code && npm test

# every scenario harness except the one needing a live server
for t in agent git cli mcp ssh-agent masked-run mcp-wsl wsl-relay; do npm run itest:$t; done

# the HTTP contract suite (see http/README.md for the environment it needs)
cd http && npm ci && node http-run.mjs
```

The WSL harnesses skip loudly rather than silently when the distribution, the .NET SDK inside it, or
the Windows binary is missing — each prints the command that would fix it. That is the convention
every harness here follows: a skip says why, and a missing prerequisite is never mistaken for a pass.
