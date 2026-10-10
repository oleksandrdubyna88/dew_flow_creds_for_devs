# Module — `src_service_defaults` (the shared logging)

> `CredsForDevs.ServiceDefaults`, a .NET 10 class library, `IsAotCompatible`. Created 2026-10-09 by epic E1 of
> [PLAN_wsl_bridge_outlives_its_client.md](../todo/PLAN_wsl_bridge_outlives_its_client.md). Entry point from the
> system view: [architecture.md](architecture.md) §Logging.

## Purpose

The repository's ONE Serilog configuration, per the family rule
(`.claude/rules/shared/common/logging-serilog.md`): a coloured console and a file per run under a folder per UTC day,
with retention owned by the host. Three hosts use it — the server, `creds-mcp` and `creds` — and it exists so that a
fix to how a log is written is made once. Before it, only the server wrote files; the two AOT binaries wrote one
`[creds-for-devs]` line to stderr, and the WSL orphan investigation could not read why a process lived or ended.

It configures nothing by itself. A library never picks sinks for a host; each host calls one of its two entry points.

**Since E2 (2026-10-10) it also holds the two process-lifetime primitives** a serving host needs to notice its
client is gone — `ShutdownSignals` (the four termination signals, handled instead of dying by the default
disposition) and `ParentWatch` (the parent process, built on `ParentProcess`). They live here rather than in one
binary because the server uses them now and the WSL pump and the SSH-agent relay use them in E3: one copy, per the
reuse rule and the cadence consultation's fifth point (plan §14). Like the logging, they observe and report; ending
the process is the host's decision (`ServerLifetime` in `src_mcp`).

## Diagram

```mermaid
flowchart TB
    subgraph hosts["hosts"]
        server["server · Logging.cs<br/>AddCredVaultLogging"]
        mcp["creds-mcp · Program.ServeAsync"]
        relay["creds · AgentRelay.RunAsync<br/>RelayPipe.RunAsync"]
    end
    subgraph lib["src_service_defaults"]
        create["CredsLogging.Create<br/>env → LogSetup"]
        root["LogRoot.For<br/>CREDS_LOG_DIR · LOCALAPPDATA · XDG · Library/Logs"]
        build["CredsLogging.Build<br/>prune · levels · enrichers · sinks"]
        retention["LogRetention<br/>day folders older than N"]
        console["AnsiConsoleSink"]
        file["DailyRunFileSink"]
        run["HostRun · HostEnding · ExitReason"]
        ppid["ParentProcess.Id"]
        watch["ParentWatch<br/>handle + start time · getppid poll"]
        signals["ShutdownSignals<br/>INT · TERM · HUP · QUIT"]
    end
    server -->|"LogSetup from appsettings"| build
    mcp --> create
    relay --> create
    create --> root
    create --> build
    build --> retention
    build --> console
    build --> file
    mcp --> run
    relay --> run
    run --> ppid
    mcp --> watch
    mcp --> signals
    watch --> ppid
```

## Core entities

| Type | What it is |
|---|---|
| `LogSetup` (record) | Everything one logger is built from: app name, root (empty = console only), start time, levels, retention days, console writer, default source |
| `LogLevels` (record) | The floor and per-source overrides, bound EXPLICITLY — `Serilog.Settings.Configuration` scans assemblies, which AOT cannot |
| `LogPlatform` (enum) | Windows / MacOS / Linux — which folder convention the root follows |
| `ExitReason` (enum) | The closed vocabulary of the exit line (`clientClosed`, `busy`, `noAgentAnnounced`, `signalled`, `parentGone`, …), written as its camelCase word; never a contract exit name |
| `HostEnding` (record) | Exit code + `ExitReason` — the code stays the contract's |
| `HostRun` | Writes the start line (mode, version, pid, parent pid) and the exit line (code, reason, uptime); `Crash` logs the exception first |
| `AnsiConsoleSink`, `DailyRunFileSink`, `LogRetention`, `UtcTimestampEnricher` | Moved unchanged from the server (see [module_server.md](module_server.md)) |
| `ParentProcess` | The parent pid: `getppid()` or `NtQueryInformationProcess`; 0 when the platform will not say |
| `ShutdownSignals` | SIGINT/SIGTERM/SIGHUP/SIGQUIT registered with `Cancel = true`; `Received` completes with the FIRST; `ExitCode` = 128 + the POSIX number (129, 130, 131, 143) |
| `ParentWatch` | `Gone` completes when the parent is gone. Windows: the parent opened at once by handle, and a holder of its pid that started after this process means the pid was reused (gone already); a parent that cannot be found is gone; one that cannot be opened is logged and not watched. Linux/macOS: `getppid()` every 2 s on a `PeriodicTimer`, a change means re-parented; a start with ppid ≤ 1 is not watched. `Off(reason)` logs why and never completes |

## Entry points

- **`CredsLogging.Build(LogSetup)`** — the core. Prunes the root's expired day folders, applies the floor, the rule's two
  overrides (`Microsoft.AspNetCore`, `System.Net.Http.HttpClient` at Warning) and the host's own, the enrichers
  (`UtcTimestamp`, `Application`, `ProcessId`, a default `SourceContext`), the coloured console and the file. An
  unwritable or undeterminable root → console only, said once on stderr, start never blocked.
- **`CredsLogging.Create(appName, consoleToStdErr: true)`** — the AOT hosts' factory. `CREDS_LOG_DIR`,
  `CREDS_LOG_LEVEL` (verbose/debug for more; Information is the default AND the ceiling, because the start and
  exit lines are Information and the sentences a person or the extension reads are Warning or above), `CREDS_LOG_RETENTION_DAYS` (default 14, 0 disables).
- **`HostRun.Start` / `End` / `Crash`** — the two lines every serving run writes.
- **`ShutdownSignals.Register()`** and **`ParentWatch.Start(log)` / `ParentWatch.Off(reason, log)`** — the lifetime
  primitives; `creds-mcp` passes their tasks to `ServerLifetime` with the transport's end-of-stream.

## Behaviour worth knowing

- **One root, one retention window.** The AOT hosts on one machine share their platform root, and retention deletes
  whole DAY folders — the shape the family rule mandates. Two hosts given different `CREDS_LOG_RETENTION_DAYS` for the
  same root therefore resolve to the shortest window: the first host to start with it prunes for everyone. (Code
  round finding 2, rejected as a redesign and stated here instead.)
- **What a log line may carry.** Mode words, versions, pids, exit codes and reasons, the client's NAME (cleaned to
  one line), incoming method NAMES (Debug), the relay's socket path — which the relay already prints on stdout as its
  `export` line and which the extension reads from the busy refusal — and exception messages. **Never:** argument
  values, other environment values, the forwarded caller record, protocol bodies, tool arguments or results, stream
  bytes, tokens. The process tests in `src_mcp/tests/ServingLogTests.cs` and `src_cli/tests/RelayLogTests.cs` grep a
  marker out of every one of those places after positive controls.

## External dependencies

`Serilog` 4.4.0 and `Serilog.Sinks.File` 7.0.0 (Apache-2.0; versions and the freshness note in
`Directory.Packages.props`). Measured cost in the AOT binaries: about +1.2 MiB and 1–9 ms on the first response
([RESULTS_wsl_bridge_orphans.md](RESULTS_wsl_bridge_orphans.md), §7.2 section).

## Tests

`src_service_defaults/tests` (xUnit v3, MTP executable `CredsForDevs.ServiceDefaults.Tests`): the path shape, UTC
lines, the stderr choice, the floor and its ceiling, retention parsing and pruning, the unwritable fallback, the
override order, the root ladder per platform, the exit-reason words (enumerated from the type), the start/exit lines,
a real parent pid; `ShutdownSignalsTests` (first signal wins, the POSIX numbers, registration with the OS) and
`ParentWatchTests` (pid reuse → gone at once, a missing parent → gone, access denied → not watched, exit → gone,
ppid change → gone, ppid 1 → off, the real opener on a real process, the real watch of the runner's own parent). `Support/HostProcess.cs` starts a built binary and finds its run's file; it is LINKED into the
mcp and cli test projects rather than copied.
