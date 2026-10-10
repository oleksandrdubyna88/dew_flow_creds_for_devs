# RESULTS — why the Windows half of the WSL bridge outlives its client

> Measured 2026-10-09 on one Windows 11 machine with an Ubuntu WSL2 distribution, Claude Code 2.1.295
> (VS Code extension, Linux build inside the VS Code WSL server), `creds-mcp` built from `ad9dcb04`
> (2026-08-31) and the extension-shipped build of 2026-09-24, `ModelContextProtocol` 2.2.0 (the latest
> on NuGet that day). Every probe below signalled only processes it had started itself; Windows-side
> survivors were counted by **set difference of `creds-mcp.exe` PIDs**, because interop children are
> parented to the distribution's long-lived `wsl.exe`, never to the `wsl.exe` that ran the probe.
>
> The fix is planned in [PLAN_wsl_bridge_outlives_its_client.md](../todo/PLAN_wsl_bridge_outlives_its_client.md);
> what E3 measured on the same machine on 2026-10-10 is the last section, *The fix, measured*.

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
