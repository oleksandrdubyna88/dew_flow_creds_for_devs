# RESULTS — why the Windows half of the WSL bridge outlives its client

> Measured 2026-10-09 on one Windows 11 machine with an Ubuntu WSL2 distribution, Claude Code 2.1.295
> (VS Code extension, Linux build inside the VS Code WSL server), `creds-mcp` built from `ad9dcb04`
> (2026-08-31) and the extension-shipped build of 2026-09-24, `ModelContextProtocol` 2.2.0 (the latest
> on NuGet that day). Every probe below signalled only processes it had started itself; Windows-side
> survivors were counted by **set difference of `creds-mcp.exe` PIDs**, because interop children are
> parented to the distribution's long-lived `wsl.exe`, never to the `wsl.exe` that ran the probe.
>
> The fix is planned in [PLAN_wsl_bridge_outlives_its_client.md](../todo/PLAN_wsl_bridge_outlives_its_client.md).

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

## Side findings, outside the leak

- **The WSL MCP configuration pointed at a manual install** (`%LOCALAPPDATA%\Programs\creds\creds-mcp.exe`
  plus a Linux wrapper in `~/.local/bin`, both 2026-08-31) while the extension shipped a 2026-09-24
  build. No Windows half received `--caller`, so caller forwarding (#61) was inactive for WSL sessions —
  and a fix released through the extension would not have reached them.
- **A config access key in argv.** A `creds.exe config <key>` process had been stopped (`T`) for over
  six hours with the key in its command line, readable by any user's process in the distribution through
  `/proc/<pid>/cmdline` — measured: `/proc` mounted without `hidepid`, `cmdline` mode `0444`, and an unprivileged user
  read root's PID 1 command line. Tracked separately in
  [PLAN_config_key_off_the_command_line.md](../todo/PLAN_config_key_off_the_command_line.md).

## Cleanup done on the measured machine

The 39 creds-mcp proxies whose parent was the subreaper (no live wrapper) and the 27 relay-pipe proxies
of a relay with no connections were SIGKILLed by PID; their Windows halves exited within 8 s
(51 → 13 `creds-mcp.exe`: the 7 live WSL sessions, the native Windows sessions, and new ones;
27 → 2 `creds.exe`). Live sessions were not touched.
