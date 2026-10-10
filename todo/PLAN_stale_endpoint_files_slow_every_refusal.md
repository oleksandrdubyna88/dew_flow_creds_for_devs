# PLAN — stale endpoint files slow every refusal

> Status: **plan only, nothing implemented yet, 2026-10-10.** Scope: `src_vs_code/src/cliEndpoint.ts` and
> `credsAgentServer.ts` (the sweep that was designed and never wired), `src_broker_client/src/Endpoints.cs` and
> `BrokerClient.cs` (what one stale file costs), `src_cli/src/Program.cs` and `src_mcp/src/Windows.cs` (the five
> walks over announced windows), their tests. **Measure first (§3):** nothing here is built before the per-file cost
> is known on the machine that reported it.
>
> Related docs: [module_extension.md](../research/module_extension.md) (*An announcement per window*),
> [module_mcp.md](../research/module_mcp.md) (`Windows`), [PLAN_headless_cli.md](../research/PLAN_headless_cli.md)
> (where the endpoint file was designed), [PLAN_config_key_off_the_command_line.md](../research/PLAN_config_key_off_the_command_line.md)
> (the `creds config` walk this was found under), [PLAN_wsl_bridge_outlives_its_client.md](PLAN_wsl_bridge_outlives_its_client.md)
> (why windows leave files behind: a window that crashes or is killed runs no dispose).

## 1. The symptom (the owner's machine, 2026-10-10)

`creds config -` with a key no window holds takes about **67 seconds** to say so. The endpoint directory holds
**34** `window-*.json` files for windows that are gone; the walk probes each one, and each probe costs the health
timeout, **2 s**: 34 × 2 s ≈ 67 s. Every alias call, every `creds ls` and every MCP read walk pay the same, and the
refusal for an unknown key is reached only after the LAST file — so the cost is paid in full exactly on the failure
path, where a person is waiting to be told no.

## 2. What exists today — verified 2026-10-10 on `main`

- **The announcement.** `credsAgentServer.ts:378-389` writes `<globalStorage>/endpoints/window-<pid>.json` on every
  announce (port, socket, agent socket, `startedAt`); `:734-740` removes it on an orderly dispose, and only then. A
  window that crashed, was killed, or lost power leaves its file (`cliEndpoint.ts:88-105`).
- **The sweep that was designed and not wired.** `cliEndpoint.staleEndpoints(endpoints, isAlive)`
  (`cliEndpoint.ts:136-142`, *"so a sweep can remove them"*) has a unit test (`cliEndpoint.test.ts:106`) and **no
  production caller** (grep, 2026-10-10). The module's own doc (`:13-17`) says *"a reader checks whether that pid is
  still alive instead of trusting the file's existence"* — and no reader does. `readEndpoints` (`:115-125`) returns
  every file that parses and says liveness is deliberately not decided there.
- **The reader.** `Endpoints.Read` (`src_broker_client/src/Endpoints.cs:72-92`) returns every announcement that
  parses, newest first; its doc (`:27-30`): *"a stale entry is the normal case … What decides is the unauthenticated
  health probe"*.
- **The probe.** `BrokerClient.IsOurBrokerAsync` (`BrokerClient.cs:74-93`): one GET to the health route, bounded by
  `HealthTimeout = TimeSpan.FromSeconds(2)` (`:26`); a timeout reads as *false* — not ours — and the walk moves on.
- **The walks**, sequential, newest first, one probe per file: the CLI's config read (`src_cli/src/Program.cs:302-335`),
  its alias call (`:183-220`) and `creds ls` (`:353-375`); the MCP server's `Windows.ReadFromAsync` (`src_mcp/src/Windows.cs:57-71`,
  through `ReadOneAsync` `:73-89`) and `PostToAsync` (`:127-140`). Five copies of one shape.
- **Under WSL** the Linux `creds` hands the call to the Windows half (`WslInterop`), which reads the Windows
  directory and probes on Windows — the files and the pids live on the Windows side either way.

## 3. The open question — why 2 s per file, and not 0 (MEASURE FIRST)

A loopback connect to a port nobody listens on is refused at once on every operating system; a stale file *should*
cost milliseconds, not the full timeout. So before any fix, find out on the owner's machine which of these it is:

- (a) **the port is listening again** — the OS reissued it to another process that accepts a connection and never
  answers HTTP (the probe then waits out its 2 s), or to another VS Code window (it answers *ours*, the key is refused
  with 401 at once — cheap, not this symptom);
- (b) **a filter drops instead of refusing** — a firewall or a security product on the loopback interface;
- (c) **the connect itself** — `SocketsHttpHandler` to the IPv4 literal `127.0.0.1` has no dual-stack race to lose, so
  rule this out rather than assume it;
- (d) **something that is not the probe** — the endpoint directory on a slow or network-backed profile, or the JSON
  reads.

**How:** a script (`scripts/endpoint-probe-timing.cjs`, new) that reads the directory, and for each file reports the
pid's liveness, one raw TCP connect time to the port, and one `GET /v1/health` time with a 2 s bound — one line per
file, nothing secret in it (ports, pids, timings). Its output goes into a *Results* section of this plan. The fix
is chosen by those numbers, not by the arithmetic in §1.

## 4. Design — the candidates, chosen after §3

1. **The extension sweeps at activation** — `readEndpoints` → `staleEndpoints(…, isAlive)` → `removeEndpoint` for each,
   never its own file; `isAlive` is `process.kill(pid, 0)` on the extension host, which shares the files' pid namespace
   (the extension is `ui`-kind, so in a WSL window it still runs on Windows). The predicate already exists; this wires
   it. Cost: one directory read per activation. Limit: a pid reused by an unrelated process keeps that one file alive
   until the probe — today's behaviour, no worse.
2. **The clients skip a provably-dead window before dialling** — in the walks (or in `Endpoints.Read` behind a
   parameter), `Process.GetProcessById(pid)` on the side that owns the namespace (the Windows half under WSL); a pid
   that is gone costs no probe. Same limit as (1) for a reused pid; covers the window between a crash and the next
   activation.
3. **Probe in parallel with one short budget** — fan `IsOurBrokerAsync` out over every file under a single ~2 s
   budget, then post newest-first to those that answered: 34 files cost one budget, not 34. This reshapes the five
   walks, so it is done ONCE — a shared walk helper in `src_broker_client` the CLI's three walks and the MCP's two sit
   on (the reuse rule; today each walk is a copy). Only if §3 shows the probes are the cost (listening-but-silent
   ports): for a dead port refused at once, (1)+(2) already make the walk cheap.
4. **A client that proved a window dead removes its file** — an ownership question: the file is the extension's, and
   a CLI deleting it is a second writer in a directory one process owns. **Default: no**, unless the owner decides
   otherwise; the sweep in (1) is the honest owner.

Recommended: (1) and (2) now; (3) by the measurement; (4) the owner's call.

## 5. Growth budget

Today the directory grows by one file per window that did not dispose, and nothing retires any of them — 34 on the
owner's machine. With (1) the count is bounded by the windows that crashed since the last activation of any window,
and the sweep deletes only files whose pid is provably gone (never its own, never a live one). No new growth.

## 6. Build order

1. §3: the timing script, run on the owner's machine; the numbers recorded here.
2. **RED → GREEN** the sweep (1): a file whose pid is dead is removed at activation; a live window's file and this
   window's own are kept; a directory that cannot be read is not an error — `cliEndpoint.test.ts` and an activation
   seam test. Then RED again with the sweep's call removed.
3. **RED → GREEN** the dead-pid skip (2): a file whose pid is not alive costs no probe — `EndpointsTests.cs`, and a
   walk test over a stub window (the `ToolCancellationTests.cs` pattern) counting probes.
4. Only if §3 says so: the shared parallel walk (3) — one helper, the five call sites on it, a process test against a
   listening-but-silent port proving 34 files cost one budget.
5. Docs: `module_extension.md` (*An announcement per window*), `module_mcp.md` (`Windows`), `architecture.md`'s
   discovery paragraph; this plan promoted with its *Results*.

## 7. Test plan

| Behaviour | RED first | Layer |
|---|---|---|
| a crashed window's file is removed at the next activation; a live window's and this window's own are kept | 2 | TS unit (`cliEndpoint.test.ts`, the activation seam) |
| a file whose pid is dead costs no probe | 3 | C# (`EndpointsTests.cs`, a walk over a stub window counting probes) |
| 34 stale files cost at most one budget | 4 (conditional) | C# process test against a listening-but-silent port |
| the refusal sentences are unchanged | — | existing CLI tests |
| no client deletes a file (unless §4.4 is decided) | 3 | the walk tests assert the directory is untouched |

## 8. Not doing, and why

- **A TTL on the file** (delete when `startedAt` is old): a window open for a week is live; age says nothing.
- **Trusting the pid instead of the probe**: the probe stays the decision — a reused pid or a reused port is exactly
  what it exists to catch; the pid check only skips the files that cannot possibly be live.
- **Changing `HealthTimeout`**: a slow but live window would read as gone; the number is not the defect, the count is.

## 9. Definition of Done

- [ ] §3 measured on the reporting machine and recorded in this plan; the fix chosen by those numbers.
- [ ] A refusal for an unknown key, with 34 dead files in the directory, takes under 3 s on that machine.
- [ ] No client deletes an endpoint file unless the owner decided §4.4; the extension's sweep never deletes a live
      window's file or its own.
- [ ] Each change shown RED with the real symptom, GREEN, and RED again with the fix removed.
- [ ] `module_extension.md`, `module_mcp.md`, `architecture.md` updated; `todo/README.md` and `research/README.md`
      match; `node .claude/rules/shared/tools/plan-lifecycle.mjs` clean; the gate's plan and code rounds recorded.
