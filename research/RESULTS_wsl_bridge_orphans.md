# RESULTS — why the Windows half of the WSL bridge outlives its client

> Measured 2026-10-09 on one Windows 11 machine with an Ubuntu WSL2 distribution, Claude Code 2.1.295
> (VS Code extension, Linux build inside the VS Code WSL server), `creds-mcp` built from `ad9dcb04`
> (2026-08-31) and the extension-shipped build of 2026-09-24, `ModelContextProtocol` 2.2.0 (the latest
> on NuGet that day). Every probe below signalled only processes it had started itself; Windows-side
> survivors were counted by **set difference of `creds-mcp.exe` PIDs**, because interop children are
> parented to the distribution's long-lived `wsl.exe`, never to the `wsl.exe` that ran the probe.
>
> The fix was built as [PLAN_wsl_bridge_outlives_its_client.md](PLAN_wsl_bridge_outlives_its_client.md) (implemented
> 2026-10-16). What E3 measured on the same machine on 2026-10-10 is the section *The fix, measured*; the last
> section, *The one-day count after E6*, is the count on 2026-10-16 that closed the plan.

## The symptom

On the measured machine, with about twenty live Claude Code sessions: **51 `creds-mcp.exe`** and **27
`creds.exe relay-pipe`** processes on Windows, each with its own `conhost.exe`. 39 of the 51 had no live
client — their Linux-side interop proxy (`/init …/creds-mcp.exe`) had been re-parented to the session's
subreaper. Their fingerprint: 2 threads, ~138 handles, ~0.1 s CPU over hours. They arrived in bursts of
8–10 within one second — every session a VS Code window reload restarts leaks one copy.

## Two leaks, two causes

### Leak 1 — `creds-mcp.exe`: two defects that are each sufficient on their own side

**A. The server does not exit on stdin end-of-stream while a `subscriptions/listen` is open.**
Native Windows, no WSL involved, a client that speaks and then closes stdin:

| What the client sent before closing stdin | Both builds |
|---|---|
| `initialize`, `notifications/initialized`, `tools/list` (2025-06-18) | exits, code 0 |
| `server/discover`, `tools/list` (2026-07-28) | exits, code 0 |
| `server/discover`, **`subscriptions/listen`**, `tools/list` (2026-07-28) | **still running 15 s after EOF — never exits** |

Claude Code 2.1.295 always sends `subscriptions/listen` (with `notifications.toolsListChanged: true`)
right after `server/discover`. So against this client, end-of-stream — the one signal the MCP stdio
transport defines for shutdown — no longer ends the server.

**B. The Linux wrapper dies from SIGINT without stopping the Windows half.** A transparent logging shim
between a real `claude -p` and the wrapper recorded what the client does at exit:

```
+15ms   client→ server/discover            ←server result 2611 B
+477ms  client→ subscriptions/listen       ←server notifications/subscriptions/acknowledged
+699ms  client→ tools/list                 ←server result 18436 B
+2410ms got SIGINT
+2418ms wrapper exited sig=SIGINT
```

No stdin close, no SIGTERM: **SIGINT**. The .NET wrapper has no handler for it, so it dies by the
default disposition and `AppDomain.ProcessExit` never runs — and that is where `WslPump.Stop(child)`
is registered. The interop proxy is left alive with its stdin at end-of-stream (no process holds the
write end — read from `/proc/*/fd`), it delivers that EOF to Windows, and the Windows half then sits in
defect A for as long as the WSL session lives. Under the VS Code WSL server that is all day.

### Leak 2 — `creds.exe relay-pipe`: the child's stdin is never closed

`creds relay` (the SSH-agent relay) was alive with **0 client connections** (its only sockets: the
listener and the .NET diagnostics socket), **27 `relay-pipe` children** and **115 open pipe fds**.
Natively, `creds.exe relay-pipe` exits within a second of stdin EOF. The relay never sends one:
`Process.Close()` deliberately does not close `StandardInput` once the caller has accessed it (nor
`StandardOutput` read synchronously), and the still-pending copy from the child keeps both streams
reachable, so finalisation never closes them either.

## What did NOT leak — the probes that ruled the bridge out

The first hypothesis — "the client-gone signal does not cross from WSL to Windows" — was wrong, and
these are the measurements that refuted it. Each row is the wrapper (or the `.exe` launched directly),
the Windows PID identified by set difference, and its state ≥ 10 s after the event:

| Event | Before `initialize` | After `initialize` | After `tools/list` |
|---|---|---|---|
| stdin EOF | exited | exited | exited |
| SIGTERM to the wrapper | exited | exited | exited |
| SIGKILL to the wrapper | exited | exited | exited |
| SIGKILL to the `/init` proxy | exited | exited | — |
| SIGTERM / SIGHUP / SIGKILL to the process group | — | exited | — |
| SIGTERM / SIGHUP / SIGINT to the `/init` proxy | — | exited | — |
| early kill sweep: 0.05 / 0.2 / 0.5 / 1 / 2 s after spawn, KILL/TERM/EOF | exited (25 of 25) | — | — |
| a node client (socketpair stdio): `stdin.end()`, SDK-style end→TERM→KILL, KILL, TERM, destroy | — | — | exited (7 of 7) |

Every one of these used the **2025-06-18** handshake or none, which is exactly why none leaked: the
leak needs `subscriptions/listen` (defect A) *and* an ending that skips `ProcessExit` (defect B). A real
`claude -p` supplies both, and leaked **one copy on every run** — 5 of 5, normal exit included.

Two traps met while measuring, kept because they cost a wrong verdict each:

- **A FIFO opened read-write is its own writer.** Feeding the wrapper `<>fifo` means closing the
  shell's end is not an EOF; the first probe "leaked" for that reason alone.
- **A bash `&` job ignores SIGINT.** A non-interactive shell starts background jobs with SIGINT set to
  ignore, so "SIGINT to a wrapper started with `&`" measures nothing. Test SIGINT from a process that
  spawns the wrapper itself (node, or a C# test).

## What a Linux process receives when its `wsl.exe` is killed

The extension stops the agent relay by killing the `wsl.exe` that started it
(`src_vs_code/src/wslRelayManager.ts`, `stop()`). A bash probe trapping HUP/TERM/INT/PIPE/QUIT, started
the same way and its `wsl.exe` then killed from Windows, recorded **`trap-HUP`** (`wait` returned 129)
— and, having handled it, was still alive three seconds later. So a host that handles SIGHUP learns
that its launcher is gone; one that does not dies by the default disposition, skipping
`ProcessExit`, exactly as SIGINT does in defect B.

## The fixture — a real Claude Code session start, captured 2026-10-10

Plan §7.3 asked for the `server/discover` + `subscriptions/listen` handshake as a test fixture, captured
rather than composed. The 2026-10-09 shim above recorded only method names and timings, so the fixture was
captured again on 2026-10-10: a transparent node shim between `claude -p` (Claude Code **2.1.289**, native
Windows, `--mcp-config` naming the shim) and a `creds-mcp` built from `origin/main` at `9494a67c`, logging each
client line verbatim. What the client sent, in order:

| # | Method | id |
|---|---|---|
| 1 | `server/discover` | `server-discover-probe-1` |
| 2 | `subscriptions/listen` `{"notifications":{"toolsListChanged":true}}` | `listen:0` |
| 3 | `server/discover` | `0` |
| 4 | `tools/list` | `1` |

The same sequence 2.1.295 sent inside WSL, plus the version probe 2.1.289 sends first; every request carries the
2026-07-28 per-request `_meta` (`protocolVersion`, `clientInfo`, `clientCapabilities`). The server acknowledged the
listen and answered the rest; the client then closed stdin (natively on Windows it ends by EOF, not by SIGINT as it
did inside WSL), and the server did not exit. The four client lines are
`src_mcp/tests/fixtures/claude-code-2.1.289-handshake-2026-07-28.jsonl`, unmodified. They carry the client's own
public product metadata and nothing of this machine.

## Side findings, outside the leak

- **The WSL MCP configuration pointed at a manual install** (`%LOCALAPPDATA%\Programs\creds\creds-mcp.exe`
  plus a Linux wrapper in `~/.local/bin`, both 2026-08-31) while the extension shipped a 2026-09-24
  build. No Windows half received `--caller`, so caller forwarding (#61) was inactive for WSL sessions —
  and a fix released through the extension would not have reached them.
- **A config access key in argv.** A `creds.exe config <key>` process had been stopped (`T`) for over
  six hours with the key in its command line, readable by any user's process in the distribution through
  `/proc/<pid>/cmdline` — measured: `/proc` mounted without `hidepid`, `cmdline` mode `0444`, and an unprivileged user
  read root's PID 1 command line. Tracked separately in
  [PLAN_config_key_off_the_command_line.md](PLAN_config_key_off_the_command_line.md).

## Cleanup done on the measured machine

The 39 creds-mcp proxies whose parent was the subreaper (no live wrapper) and the 27 relay-pipe proxies
of a relay with no connections were SIGKILLed by PID; their Windows halves exited within 8 s
(51 → 13 `creds-mcp.exe`: the 7 live WSL sessions, the native Windows sessions, and new ones;
27 → 2 `creds.exe`). Live sessions were not touched.

## Serilog in the AOT binaries — §7.2 of the plan, measured 2026-10-09 (E1.S3)

The plan fixed the refusal criterion before measuring: **more than 3 MB, or more than 50 ms added to
the first response**, and the hosts would get a hand-written sink honouring the same contract instead.
Measured on the same Windows 11 machine, `win-x64` Native AOT `Release` publishes of the branch that
adds the shared logging (`feat/e1-logs-on-disk`) against `origin/main` at `7dbf592b`.

| Binary | Without Serilog | With Serilog | Added |
|---|---|---|---|
| `creds-mcp.exe` | 14,346,240 B | 15,600,640 B | **+1,254,400 B (1.20 MiB)** |
| `creds.exe` | 6,255,616 B | 7,563,776 B | **+1,308,160 B (1.25 MiB)** |

**Trim/AOT warnings: none.** Both publish clean under `TreatWarningsAsErrors` with no `NoWarn`, on
Serilog 4.4.0 — the `IL2104` the server's project suppresses (recorded there against Serilog core's
`@`-destructuring internals) did not appear in either binary, so neither carries the suppression.

**Cold start of `creds-mcp`** — spawn to the first stdout line answering `initialize` (2025-06-18),
40 interleaved runs per series after 3 warm-ups each, with a log file written by every "with" run
(`coldstart.mjs`, a node harness: `spawn`, write one request, time the first `\n` on stdout):

| Series | p10 without / with | p25 | p50 | machine |
|---|---|---|---|---|
| 1 | 100.2 / 95.1 ms | 116.3 / 107.2 | 144.9 / 164.2 | busy |
| 2 | 74.8 / 76.1 | 87.4 / 92.4 | 137.1 / 126.2 | busy |
| 3 | 72.4 / 73.7 | 82.0 / 84.6 | 101.8 / 99.2 | busy |
| A/A control: without vs without | 68.1 / 68.0 | 73.4 / 72.5 | 83.2 / 82.0 | quiet |
| 4 | 51.8 / 59.2 | 61.2 / 68.2 | 69.8 / 78.8 | quiet |
| 5 | 66.8 / 67.5 | 71.7 / 73.9 | 77.1 / 80.8 | quiet |

On the quiet machine — where the A/A control agrees with itself to about a millisecond — logging adds
**about 1–9 ms** to the first response: creating the day folder, opening the run's file and the
retention sweep's directory listing. On the busy machine the arms swap places from series to series,
which is the noise, not the logger. `creds --help`, a one-shot verb that never builds a logger, is
unchanged within noise (p50 43.4 / 41.5 and 61.4 / 61.3 ms; A/A 40.8 / 38.3).

**Decision: Serilog stays.** Both numbers sit far inside the criterion (1.2 MiB of 3 MB; single-digit
milliseconds of 50), so no hand-written sink and no rule deviation for it. Not measured: the Linux and
macOS binaries (no native AOT linker in the measuring distribution); the release workflow's smoke step
now runs every published `creds-mcp` and `creds` on its own runner and checks the file it writes.

**§7.4, answered on the way:** `McpServer.Create` does take an `ILoggerFactory`, and it is deliberately
NOT given one. The SDK writes outgoing JSON at Trace and a client's cancellation reason at Information
(the cadence consultation read `McpSessionHandler` 2.2.0), so routing it into the file would carry
protocol bodies there at a raised floor — exactly what §5.1 forbids. The client's name and the incoming
method names are taken through an incoming message filter instead (`ClientNaming`).

## The fix, measured — E3 on the same machine, 2026-10-10

The same Windows 11 machine and Ubuntu WSL2 distribution; Claude Code **2.1.296** (the VS Code WSL server's
Linux build, run as `claude -p --model haiku` inside the distribution with `--mcp-config` naming only the server
under test and `--strict-mcp-config`); the Linux wrapper **published Native AOT for linux-x64 inside the
distribution** (gcc as the linker, `-p:CppCompilerAndLinker=gcc` — the distribution has no clang; 14,972,472 B,
zero AOT warnings); the Windows half built from the same branch. Windows survivors were counted exactly as in
the first measurement — a set difference of `creds-mcp.exe` pids before and 15 s after the session, filtered to
the executable path of THIS build so nobody else's `creds-mcp.exe` is counted or stopped — and the only
processes ever stopped were in that difference, by pid.

### §7.1 — `PosixSignalRegistration` under Native AOT: it works

A node parent (never a bash `&` job, which ignores SIGINT) spawned the AOT wrapper with a script standing in for
`creds-mcp.exe` that answers `--help` at once and otherwise never reads stdin, never closes stdout and ignores
TERM, HUP and INT — a Windows half that will not leave on its own. `/proc/<pid>/status` was read first: `SigIgn`
did not include the signal.

| Signal sent | Wrapper exit | Took | Its exit line | The stubborn child afterwards |
|---|---|---|---|---|
| SIGINT | 130 | 2.06 s | `exited: code 130, reason signalled, after 2.147 s` | gone |
| SIGTERM | 143 | 1.96 s | `exited: code 143, reason signalled, after 2.130 s` | gone |
| SIGHUP | 129 | 2.09 s | `exited: code 129, reason signalled, after 2.171 s` | gone |

(The two seconds were the grace of that build; the signal path has none now, for the reason below.)

### What the client actually does at exit — the half-second ladder

A transparent node shim between the real `claude -p` and the wrapper, forwarding both streams and every signal,
writing a 100 ms heartbeat so its own death is visible as the last beat:

```
+     0ms shim started
+     6ms wrapper started
+  2153ms shim got SIGINT -> forwarded to wrapper
+  2253ms shim got SIGTERM -> forwarded to wrapper
+  2618ms heartbeat          (the last one: the shim was SIGKILLed within the next 100 ms)
```

**SIGINT, SIGTERM 100 ms later, SIGKILL about 450 ms after that.** The 2026-10-09 shim saw only the SIGINT
because the old wrapper died from it at once. The consequence decided E3's shape: a wrapper that handles SIGINT and
then gives its child a grace — the plan's 1 s, E3's first 2 s — never reaches its kill, and a Windows half that
ignores end-of-stream would outlive the session exactly as before. So on a signal the pump closes the child's
stdin and kills its tree at once; the grace is kept for a client that hangs up and for a lost parent. The first
end-to-end run, before that change, showed it: the wrapper's log ended at *the session ended: Interrupted* with no
exit line — killed during its grace — while the Windows half still ended by itself (its stdin had been closed).

### End to end — real Claude Code sessions, Windows survivors

Each row: a `claude -p` session inside WSL that shakes hands with `creds` (server/discover, subscriptions/listen,
tools/list — the handshake every session makes), answers *OK*, and exits.

| Bridge | Runs | New `creds-mcp-wsl` log / new `creds-mcp` log per run | Windows survivors 15 s after exit | The wrapper's last line |
|---|---|---|---|---|
| **after E3**: this branch's AOT wrapper + this branch's `creds-mcp.exe` | 5 | 1 / 1 | **0, 0, 0, 0, 0** | `exited: code 130, reason signalled` (after 1.77–2.55 s) — every run |
| E3's wrapper + a **pre-E2** `creds-mcp.exe` (built from `9494a67c`, still in defect A) | 3 | 1 / 1 | **0, 0, 0** | `exited: code 130, reason signalled` — every run |
| `origin/main` (E2 merged, E3 not): the old wrapper + the E2 `creds-mcp.exe` | 5 | 1 / 1 | 0, 0, 0, 0, 0 | `started the Windows half, pid …` — no exit line: killed by the client's ladder |
| the old wrapper + the **pre-E2** `creds-mcp.exe` — the 2026-10-09 pair, as near as this branch can build it | 3 | 1 / 1 | 0, 0, 0 | `started the Windows half, pid …` — no exit line |

Two things in that table, stated rather than smoothed over:

- **The 2026-10-09 leak — one `creds-mcp.exe` per session, 5 of 5 — did not reproduce on 2026-10-10 with a pre-E2
  Windows half under Claude Code 2.1.296.** The Windows half's log ends at *client: claude-code 2.1.296* with no
  exit line in every row above, so it was ended hard each time; under 2.1.296's SIGINT/SIGTERM/SIGKILL ladder the
  `/init` interop proxy evidently dies with the wrapper's process group, and the Windows half then ends by the
  bridge's end-of-stream (the first measurement's *What did NOT leak* table). Whether 2.1.295 delivered only the
  SIGINT the shim then recorded, or the owner's 2026-08-31 install differed in some other way, cannot be settled
  from here. **E3 does not depend on the client's ladder**: the pump ends the child itself, and the stubborn-child
  tests (`WslPumpHostTests`, `WslPumpRunTests`) are the proof that holds whatever a client does.
- **What E3 visibly changes on this machine** is the wrapper's own ending: an exit line with the signal's code and
  reason, written before the client's kill arrives (1.8–2.5 s after start, within the 450 ms the ladder allows after
  SIGINT), where `origin/main`'s wrapper leaves a file with no ending at all. The Windows half's log ends without
  an exit line after a signalled session — by design now: it is killed, and a file with no exit line is the truth.

### Also seen in the logs, and fixed in E3

The Windows half of the bridge logged *watching the parent 19532* — the distribution's session-long `wsl.exe` — in
the first end-to-end run, while E2 had documented its parent watch as off under the relay. The reason: the variable
that switches it off, `CREDS_RELAYED_FROM_WSL`, is set on `ProcessStartInfo.Environment`, and environment variables
do not cross WSL interop (measured 2026-08-26). The bridge now names it in `WSLENV`, appended to the person's own
list; the after-runs' Windows half logs *parent watch off: started by the Linux half of the WSL bridge, whose parent
says nothing about the client*.

### The relay

The relay's fix (defect C) was measured in process tests on Linux rather than on the real bridge: twenty
connections through the built `creds relay` against an echo child left **0** `relay-pipe` children alive (the same
twenty left them all alive with the fix removed), and SIGTERM and SIGHUP — the latter what a killed `wsl.exe`
delivers — stopped a held connection's stubborn child and removed the socket (`AgentRelayHostTests`). The
hand-run `wsl-agent-relay-itest.cjs` against this build, on the real bridge, is recorded in the plan's §14.

## E5 — the harnesses on the real bridge, 2026-10-11

The same Windows 11 machine and Ubuntu WSL2 distribution (node 20, python 3.12 and the .NET SDK inside it). Both
harnesses in their E5 shape (`creds-mcp-wsl-itest.cjs`, `wsl-agent-relay-itest.cjs`; the plan's E5.S1): every
binary a run starts is a copy in a directory named for the run, on both sides, and every count is a set difference
of the processes whose **executable path** lies under that directory — `Get-CimInstance Win32_Process` on Windows,
`/proc/<pid>/exe` inside the distribution — polled every 250 ms for up to 5 s. A Windows watch costs ~0.7–0.9 s per
poll (a PowerShell process per question), so "gone N ms after" below means *gone by the first poll*. The Linux
halves were Debug builds made inside the distribution, under the person's cache directory (no AOT; the code is
the same, only the packaging differs — the AOT wrapper was measured in E3 above). Each harness was then run
unchanged against a scratch checkout of `9494a67c` — E1 merged, E2 and E3 not: the Windows half still in defect
A, the wrapper in defect B, the relay in defect C — so that every check has a RED on record, with the defect's own
words. The harnesses went through two review rounds on the way (the plan's §14); the figures below are from the
FINAL harness's runs, and where its first version measured something the final one did not see, both are stated.

### The MCP bridge — a Claude-Code-shaped client ends the session five ways

The client (`wsl-mcp-client.cjs`, the distribution's own node, the wrapper's real parent — never a bash `&` job)
sends the captured 2.1.289 session (`server/discover`, `subscriptions/listen`, `server/discover`, `tools/list`),
waits for the three replies while the listen stays open, then ends the session. Before each ending exactly one
`creds-mcp.exe` of the run was alive on Windows (the positive control held 5 of 5 times in the GREEN run).

| Ending | This branch: the wrapper's exit | the wrapper ended, after the word | the Windows half gone | Pre-E2/E3 pair: what the harness saw |
|---|---|---|---|---|
| SIGINT | **130** | 106 ms | by the first poll (930 ms) | `{"code":null,"signal":"SIGINT"}` — died by the default disposition, no handler (B) |
| SIGTERM | **143** | 77 ms | by the first poll (620 ms) | `{"code":null,"signal":"SIGTERM"}` — the same |
| SIGHUP | **129** | 63 ms | by the first poll (620 ms) | `{"code":null,"signal":"SIGHUP"}` — and, in the first of three RED runs, **a `creds-mcp.exe` survived** (A): still there at the 5 s bound, at the next two endings, and at the end of the run |
| stdin closed (`eof`) | **0** | 1,073 ms | by the first poll (652 ms) | *the wrapper did not end within 20000 ms of eof* — the unbounded wait after a hang-up (B); in that first run the positive control saw two processes, the survivor among them |
| SIGKILL of the wrapper | killed, as sent | 8 ms | by the first poll (710 ms) | the new Windows half left; in the first run the SIGHUP survivor did not |

**42 of 42 checks GREEN on this branch** (40 of 40 on the harness's first version); **4 of 42 RED against the old
pair** in the final run — the three signal exits and the `eof` hang — and **10 of 40** in the first version's run,
whose SIGHUP survivor failed the two later endings' positive control and the run's last check, and whose last
line, *swept 1 process(es) this run left behind: 15284*, is the sweep working as designed: the survivor stopped by
pid through a held handle after its path was re-read, nothing else touched. Two things stated rather than smoothed
over: with the old pair, the Windows half DID leave after SIGINT, SIGTERM and SIGKILL of the old wrapper (as on
2026-10-10 — the `/init` proxy evidently dies with it and delivers end-of-stream, which that build's 2.2.0 SDK
honours when it feels like it), and survived SIGHUP once in three runs; the 2026-10-09 leak was never reliably
reproducible from a single signal, which is why the harness asserts the behaviour the fix guarantees rather than a
particular leak. And the `eof` ending on this branch takes ~1.1 s where the signals take under 110 ms: that is the
pump's drain (the Windows half's own `drain + deadline` after end-of-stream, then its exit code read by the
wrapper) — the ending where nobody is killed.

### The relay — ten connections, a stop by pid, and a `dispose()` over a live connection

| What | This branch | Pre-E3 `creds` |
|---|---|---|
| a connection HELD open on the relay before the ten (`wslHoldSocket.py`) — the proof the Windows watch sees a relay-pipe of this run at all | exactly one `creds.exe relay-pipe` of the run alive, gone within 5 s of the connection's end | two alive (the first connection's had never left); neither gone |
| 10 × `ssh-add -l` through the relay | 10 of 10 list the key; the relay's own lines, baselined: 10 opened, 10 `still running: false` | 10 of 10 list the key; the old relay's ending lines read `still running: true` |
| `creds.exe relay-pipe` of the run on Windows, 5 s after the tenth | **0** | **12** (the first connection's, the held one's and all ten — pids on record), still there 5 s later; gone only when the old relay was stopped and its pipes closed under them (11 in the first version's run, which had no held connection) |
| the relay's descriptor count (`/proc/<pid>/fd`), baseline after the first connection → after the ten | **83 → 83** | 85 → **105** (83 → 103 in the first version's run; defect C's 115 pipe fds, in miniature) |
| the relay stopped by its own pid (SIGTERM through a pidfd, the path re-read first) | gone within 5 s, its `wsl.exe` exited, **socket removed** | gone within 5 s, **socket left** — no handler, `ProcessExit` skipped |
| the manager's relay, a connection HELD open | exactly one `creds.exe relay-pipe` of the run alive on Windows (the positive control) | none seen — the old relay's child had already ended its connection |
| `manager.dispose()` (a killed `wsl.exe`, SIGHUP to the relay) | **0** relay-pipe on Windows and **0** relay inside WSL by the first poll (740 ms); managed socket removed | 0 and 0 — but the managed socket left |

**40 of 40 checks GREEN on this branch** (36 of 36 on the harness's first version); **9 of 40 RED against the pre-E3
build** (8 of 36 in the first version's run). The fd baseline is taken after the FIRST connection rather than at
start, on purpose: a .NET host opens its child-reaping plumbing the first time it starts a process, and those
descriptors are permanent — a baseline at start would read a healthy relay as leaking by a constant.

### The release smoke, on a published binary

`.github/scripts/mcp-listen-smoke.sh` (E5.S2) runs the published `creds-mcp` the way Claude Code leaves it: the
captured session written, stdin held open until the `tools/list` RESULT has arrived (a reply that never comes is
a failure, not a closed stdin and a pass), then closed; exit code 0 within 10 s of that on a sub-second clock; the
log's start line, a real parent and `exited: code 0, reason clientClosed`. On this branch's binaries it passes —
the Debug build (*tools/list answered while stdin was open; the server exited with code 0 1.081 s after the
client's end-of-stream*) and the win-x64 Native AOT publish, 15,760,384 B (its first version: *stdin closed at
0s, the server exited with code 0 at 2s*; the log: `exited: code 0, reason clientClosed, after 1.085 s`). Against
the pre-E2 `creds-mcp.exe` it is RED with defect A's own shape: *tools/list answered while stdin was open; the
server exited with code 124 59.660 s after the client's end-of-stream — expected exit code 0 after the client's
end-of-stream* — the 60 s guard is what ended it. The script's own test (a stand-in server ending at once, ending
10.5 s after end-of-stream, never answering) and the script itself against the built `creds-mcp` run on every
pull request on all three operating systems (`ci-clients.yml`).

## Defect D — a STOPPED interop proxy never forwards end-of-stream (measured 2026-10-14)

> After A, B and C shipped (creds-mcp 0.10.2, cli 0.4.2), the one-day count on the owner's machine fell from
> 39–51 orphans (≈20 sessions) to **3 per day**. Those three are a new, narrower defect. The numbers below were
> measured on a second Windows 11 machine with Ubuntu WSL2 (kernel 6.18, systemd), `python3`/`gcc`/`setpriv`
> inside the distribution; every process a probe signalled was one it had started itself, by pid, and the
> throwaway probes used `C:\Windows\System32\sort.exe` as a stand-in Windows half (it reads stdin to EOF, then
> exits — the same end-of-stream sensor `creds-mcp.exe` is since defect A). `strace` is not installed and was
> not added; `/proc/<pid>/status` and `/proc/<pid>/stat` carried the evidence.

### The symptom (owner, 2026-10-14)

16 `creds-mcp.exe` on Windows: 6 under a live `claude.exe`, 10 under the long-lived `wsl.exe`; inside WSL only 7
Linux wrappers, each with a live Claude Code parent. The **3 extra** Windows halves each belonged to an interop
proxy `/init …/creds-mcp.exe … --caller <record>` in state **T (stopped)**, reparented to `/init` (the interop
subreaper), with **no Linux wrapper left**; `fd0` was a pipe whose write end nobody held; `SigIgn = 0x1000`
(SIGPIPE only), `SigCgt = 0`, nothing pending. `kill -CONT` on one made it run, read the end-of-stream waiting on
that pipe, and exit — and its Windows half exited on its own within seconds. Nothing was killed.

### What stops the proxy — only SIGSTOP, and it is not a tty signal

The WSL interop proxy is not an ordinary process. Probed by sending each stop signal directly to a proxy a
throwaway wrapper had started (`d_sig.py`):

| Signal | Effect on the proxy |
|---|---|
| **SIGSTOP** (19) | **stops it → `T`**; `SIGCONT` resumes it, it reads EOF and exits |
| SIGTSTP (20) | **no effect** — stays `S` |
| SIGTTIN (21) | **no effect** — stays `S` |
| SIGTTOU (22) | **no effect** — stays `S` |

The proxy also **blocks SIGINT** (`SigBlk` carries SIGINT and SIGWINCH) and catches nothing — `/init` forwards
Ctrl-C to the Windows side itself rather than letting the Linux half die on it. So of the four job-control stops,
**only SIGSTOP** — which cannot be caught, blocked or ignored — actually stops the proxy. The proxy has **no
controlling terminal** (`tty_nr = 0`, `tpgid = -1`), so SIGTTIN/SIGTTOU/SIGTSTP from a terminal cannot arise in
the first place. The owner's `kill -CONT` revive is itself the proof the stop was a **SIGSTOP-family** stop and
**not a cgroup freeze**: a frozen cgroup is not resumed by SIGCONT, a SIGSTOP-stopped task is.

### Why a stopped proxy leaks — the kernel does not wake it

Reproduced exactly (`d_controller.py stop-proxy-then-orphan`): SIGSTOP the proxy → `T`; SIGKILL its wrapper → the
proxy is reparented to the subreaper and **stays `T` indefinitely**. POSIX sends SIGHUP+SIGCONT to a process group
only when the group *becomes* orphaned while holding a stopped member; on this WSL kernel, in this configuration
(the proxy reparented to the interop subreaper), that wake-up is **not delivered** — the proxy sits stopped
forever. A stopped proxy forwards nothing, so the end-of-stream on its `fd0` (the wrapper's closed pipe) never
reaches the Windows half, which since defect A exits only on end-of-stream — so it leaks. `SIGCONT` → it reads the
EOF → exits → the Windows half exits. This is the owner's revive, reproduced.

Contrast, the non-leaking paths (also measured): a **plain orphan** (SIGKILL the wrapper, proxy never stopped)
leaves the proxy in `S`; it reads EOF and exits on its own (≈ the wrapper's pipe close) — matches E5's SIGKILL
row, 0 survivors. A **SIGTERM to the wrapper's group** kills the proxy at once (SIGTERM is not blocked). So the
leak needs the proxy **specifically SIGSTOPped** *and then* orphaned.

### Who sends the SIGSTOP, and when

SIGSTOP to a process with no controlling terminal is not a job-control artefact; something sends it. It is **not**
the Claude Code SIGINT→SIGTERM→SIGKILL ladder (none of those stops the proxy — SIGINT is blocked, SIGTERM kills,
SIGKILL kills), and it is **not** a cgroup freeze (ruled out by the SIGCONT revive). A grep of the WSL
`vscode-server`, the Claude Code extension and the agent host found **no userspace SIGSTOP sender** (the only
`SIGSTOP` strings are `human-signals`/`execa` description tables, not sends; `js-debug`'s `terminateProcess.sh`
takes its signal from argv). The classic source of a bare SIGSTOP is a **process-tree terminator using the
"SIGSTOP the node, then SIGKILL it" idiom** (stop a process so it cannot fork more children while the walk
descends), racing with the wrapper's own death so the follow-up SIGKILL misses the proxy once it has been
reparented off the wrapper's subtree. The remaining in-environment candidate that a grep cannot see is WSL's own
`/init` interop teardown as the hosting `wsl.exe` session is torn down. **The exact external trigger is a race in
code this project does not own, and the fix must not depend on identifying it** — what is proven, and sufficient,
is the *state* it leaves: proxy SIGSTOPped, wrapper gone.

### The fix, measured — a parent-death signal on the proxy (`setpriv --pdeathsig KILL`)

Because the wrapper is already dead in the leak, no wrapper-side exit code can run. The robust, cheap fix is to
launch the Windows half through `setpriv --pdeathsig KILL --`, so the proxy carries `PR_SET_PDEATHSIG(SIGKILL)`:
when its parent (the wrapper) dies for **any** reason, the kernel sends it SIGKILL, and **SIGKILL ends a stopped
process** — no wrapper code, no cooperation from the proxy. Measured (`d_pdeath.py`):

| Launch | After SIGSTOP(proxy) + SIGKILL(wrapper) |
|---|---|
| plain (today) | proxy **survives** stopped+orphaned — the leak |
| `setpriv --pdeathsig KILL -- <exe>` | proxy **gone within 0.5 s** — pdeathsig fired despite the stop |

Properties checked before and while building it:

- **It survives the interop execve.** The proxy launched through `setpriv` still shows `comm = <exe>` and still
  dies by pdeathsig — `PR_SET_PDEATHSIG` is preserved across the single `execve` into `/init` (same credentials).
- **`PR_SET_PDEATHSIG` is THREAD-scoped through `.NET`'s launch — the footgun is REAL here, and it dictates the
  shape of the fix.** A raw C probe forking the child from a worker thread and letting that thread exit kept the
  child alive (process-scoped); but the way the code actually launches — `.NET`'s `Process.Start`, which forks on
  the CALLING thread, with `setpriv` arming the signal — the child is **SIGKILLed the instant its forking thread
  exits** (measured: `aliveAfterForkingThreadExit=False` on kernel 6.18). The pump and the relay reach
  `Process.Start` on a thread-pool worker, and the portable thread pool retires an idle worker after a few seconds
  — so a naive fix would have the kernel kill the Windows half under a LIVE client, a regression worse than the
  leak. **The fix therefore forks every guarded child on one dedicated, long-lived thread** (`GuardedLauncher`):
  with it, the child **survives** the churn of the calling thread (measured: `aliveWhileLauncherThreadLives=True`
  through the same `.NET` path), and the signal fires only when that thread dies — which is process exit, exactly
  when the proxy should go. A `src_mcp` regression test (`ParentDeathLauncherTests`) proves both halves: it is
  skipped where the kernel is process-scoped, and otherwise shows the guarded child outliving the exit of the
  thread that called `StartPiped`.
- **stdio crosses `setpriv` untouched** (JSON-RPC bytes round-tripped through `setpriv -- sort.exe`, exit 0) and
  `setpriv` (util-linux) is present in both installed distros (2.39.3 and 2.41.3), resolved only from trusted
  system directories (never an attacker-writable PATH entry). When it is absent the launch falls back to today's
  direct exec and the pump logs one WARNING; `CREDS_NO_PDEATH_GUARD=1` is the operator's off switch. The guard is
  armed only when the Windows binary resolves, so a missing one still throws the `WindowsHalfMissing` diagnosis
  (exit 99) rather than a silent `setpriv` exec failure.

### Why not the lighter wrapper-side candidates (measured)

- **`setsid` / a private process group for the proxy.** The stop that actually works is SIGSTOP, and SIGTSTP — the
  job-control stop a session would shield against — does not stop the proxy at all; a SIGSTOP sent to a pid by a
  tree walk is unaffected by the proxy's session. So isolating the proxy's session does not address the real stop.
- **A wrapper exit path (SIGCONT the child, close stdin, bounded wait, SIGKILL).** In the leak the wrapper is
  already gone (SIGKILLed by the terminator/race), so none of its exit code runs; SIGKILL of the wrapper alone
  does not leak (the proxy exits on EOF), and the one case that does — the proxy left SIGSTOPped — is exactly the
  case the dead wrapper cannot act on. A parent-death signal set **at launch** is the only wrapper-side mechanism
  that still works when the wrapper never runs another instruction.
- **A heartbeat / liveness lease to the Windows half.** Robust but heavier (a new out-of-band channel or a renewed
  token file, a poll, a new failure mode) and unnecessary: pdeathsig already ends the proxy, and ending the proxy
  ends the Windows half (E3's measured fact). Kept in reserve only if a target distribution lacks `setpriv`.

The fix was built as [PLAN_wsl_bridge_outlives_its_client.md](PLAN_wsl_bridge_outlives_its_client.md) §5.11 (Defect D,
epic E6, creds-mcp 0.10.3). The mechanism is measured above and the host test covers the code path; the full
real-bridge itest with its sixth ending, `stopped`, was NOT run end to end (the plan's open tail).

## The one-day count after E6 — measured 2026-10-16

> Measured 2026-10-16 08:27 UTC on the owner's machine (Windows 11 with an Ubuntu WSL2 distribution), by reading the
> process tables of both sides. This is the count the plan's Definition of Done asked for. No process was signalled.

**State of the machine.** creds-mcp 0.10.3 (defect D fixed: the Windows half is launched through
`setpriv --pdeathsig KILL --`) was installed on 2026-10-14 14:05 UTC, on Windows and in WSL. Nothing was restarted
since: Windows booted 2026-10-15 07:40 UTC (24.8 h before the count) and WSL had been up 1 day 51 min. Every running
`creds-mcp.exe` had started after 08:14 on the count day — not one process was left over from the previous 24 hours.

| Side | What was counted | Result |
|---|---|---|
| Windows | `creds-mcp.exe` processes | 7 — 3 are children of the 3 live `claude.exe`, 4 are children of the WSL session's `wsl.exe`, **0 have a gone parent** |
| WSL | Linux wrappers (`~/.local/bin/creds-mcp`) | 4 — each with a live Claude Code parent |
| WSL | interop proxies (`/init … creds-mcp.exe`) | 4 — all in state S, each a child of its wrapper, **0 in state T** |
| both | Windows halves against proxies | the 4 Windows halves matched the 4 proxies one to one, by the `--caller` session id |

**Result: 0 orphans, 0 stopped proxies.**

| Date | State of the build | Orphan `creds-mcp.exe` on the machine |
|---|---|---|
| 2026-10-09 | before the work (about 20 sessions) | 39–51 |
| 2026-10-14 | after A, B and C (creds-mcp 0.10.2) | 3 per day, all from defect D |
| 2026-10-16 | after E6 (creds-mcp 0.10.3), one day without a restart | **0** |

**What this does and does not show.** An earlier count on 2026-10-15 also found 0 orphans, but it covered only
4 hours after a reboot, so it could not show a leak that needs a day of sessions to appear; it is not the evidence.
This count is one day on one machine. The leak of defect D was 3 per day, so a day without it is evidence, not a
proof — the count should be repeated after a normal working week. The count says nothing about the sub-millisecond
window between the fork and `setpriv`'s `prctl` (the plan's open tail), and it did not run the real-bridge
`stopped` ending of the itest.
