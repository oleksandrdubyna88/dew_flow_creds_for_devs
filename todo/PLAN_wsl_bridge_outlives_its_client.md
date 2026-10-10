# PLAN — every creds process ends when the client it serves is gone

> Status: **in progress, 2026-10-10 — E1 (#201), E4.S1 (#205), E2 (#211), E4.S3 (#212), E4.S2 (#213) and E3 implemented (§14; §5.4–§5.8 *As built*); E5 not yet.** Plan gate passed (`proceed`, 1 of 2 reviewers, one
> round — §14); each epic is re-gated on its own branch. Scope: `src_mcp/src` (`Program.cs`, `WslPump.cs`, the
> tool lambdas, `Windows.cs`, a new `ServerLifetime`), `src_broker_client/src` (`BrokerClient.cs`, `WslInterop.cs`, a
> new shared `ChildLifetime`), `src_cli/src` (`AgentRelay.cs`, `RelayPipe.cs`), `src_vs_code/src` (the broker's
> consent and perform path, the WSL MCP install check), a new shared logging project `src_service_defaults`, the
> server's logging (moved, not rewritten), the node itests and `wslStrays.cjs`, CI and the release smoke.
>
> **Evidence:** [RESULTS_wsl_bridge_orphans.md](../research/RESULTS_wsl_bridge_orphans.md) — every claim in §1–§2 is
> measured there.
>
> Related docs: [PLAN_mcp_wsl_bridge.md](../research/PLAN_mcp_wsl_bridge.md) (which promised "neither half may outlive
> the other"), [PLAN_wsl_agent_relay.md](../research/PLAN_wsl_agent_relay.md), [PLAN_mcp_server.md](../research/PLAN_mcp_server.md),
> [PLAN_logging_convention.md](../research/PLAN_logging_convention.md), [module_extension.md](../research/module_extension.md),
> [module_tests.md](../research/module_tests.md); boundaries in §6 with
> [PLAN_creds_cli_reachable_from_every_caller.md](PLAN_creds_cli_reachable_from_every_caller.md) and
> [PLAN_consent_names_codex_and_wsl_sessions.md](PLAN_consent_names_codex_and_wsl_sessions.md).

## 1. The symptom (owner, 2026-10-09)

*"Each Claude session starts its own copy. Sessions in WSL start it through wsl.exe, so the copy lives on the Windows
side. There are 39 copies now, 36 of them under one wsl.exe, and I hold about 20 sessions — copies of closed sessions do
not end. The server must end by itself when its client disconnects or its parent disappears."*

Measured the same day: **51 `creds-mcp.exe`** and **27 `creds.exe relay-pipe`** on Windows, each with a `conhost.exe` —
about 160 processes for twenty sessions. Every Claude Code session restart (a VS Code window reload restarts all of them
at once, hence bursts of 8–10 in one second) leaked exactly one `creds-mcp.exe`, and it lived until the WSL session
did: all day under the VS Code WSL server.

## 2. What exists today — verified 2026-10-09

### 2.1 Three defects, each measured

| | Where | What happens |
|---|---|---|
| **A** | `src_mcp/src/Program.cs:201-205` — `await server.RunAsync()` with no token | `ModelContextProtocol` 2.2.0 (latest): after stdin EOF `McpSessionHandler.ProcessMessagesCoreAsync` waits for in-flight handlers without cancelling them, and the stateful `subscriptions/listen` handler completes only on cancellation. Claude Code 2.1.295 always opens one. **Natively on Windows, no WSL:** old handshake + EOF → exit 0; 2026-07-28 handshake + EOF → exit 0; **2026-07-28 + `subscriptions/listen` + EOF → never exits.** The same wait holds an in-flight `tools/call` for up to `BrokerClient.CallTimeout` (10 min, `src_broker_client/src/BrokerClient.cs:29`). |
| **B** | `src_mcp/src/WslPump.cs:56` — `ProcessExit += Stop(child)` is the only stop | Claude Code ends an MCP server with **SIGINT**. The .NET wrapper has no handler, dies by the default disposition, `ProcessExit` never runs, the `/init` proxy is left alive and hands the Windows half an EOF it cannot act on (A). Also `PumpAsync` awaits the child's stdout **unbounded** after the client hangs up (`WslPump.cs:89-92`), so even an orderly hang-up waits on A forever. |
| **C** | `src_cli/src/AgentRelay.cs:282-300` — `using var child` is the only end | `Process.Close()` does not close a `StandardInput` the caller has accessed (nor a synchronously read `StandardOutput`), and the pending `fromWindows` copy keeps both reachable. `relay-pipe` never sees EOF; natively it exits within a second of one. Measured: relay alive, **0 connections, 27 children, 115 pipe fds**. |

### 2.2 What does already work — kept, not rewritten

- The WSL interop bridge delivers end-of-stream and process death correctly: 50+ probes (EOF, SIGTERM, SIGKILL to the
  wrapper, the proxy, the process group, kills 0.05–2 s after spawn) all ended the Windows half. The defect is ours.
- Killing the launcher `wsl.exe` delivers **SIGHUP** to the Linux process (measured). `WslRelayManager.stop()`
  (`src_vs_code/src/wslRelayManager.ts:142-146`, `:294`) can stay as it is once the relay handles SIGHUP.
- `WslPump.PumpAsync`'s rule that a client which hangs up still receives the child's last reply
  (`src_mcp/tests/WslPumpTests.cs:83-104`) is right and stays — it is why §5.2 drains before cancelling.
- `WindowsBridge.CaptureAsync` (`src_broker_client/src/WslInterop.cs:193-219`) already closes stdin and kills the tree on
  timeout; the `--help` probe it runs does not leak.

### 2.3 Consent outlives the request — a security defect found while tracing cancellation

`credsAgentServer.ts` `perform` (`:483-533`) → `consent` (`:593-624`) → `ask` (`:627-696`) shows a modal
`showWarningMessage` wrapped in `withTimeout` (5 min). **Nothing in `src_vs_code/src` observes a closed request**: no
`res.on('close')`, no `AbortSignal`. So when the MCP client is gone and the person later clicks **Allow**, the grant is
allowed, the action runs on the machine (`brokerCall.ts:126`, `useAction.run`, no signal), and the answer is written to
a dead socket. `withTimeout` (`withTimeout.ts:20-35`) only settles the waiting promise; the modal stays on screen.
VS Code's API cannot dismiss a modal programmatically (`MessageOptions` has only `modal` and `detail`).

### 2.4 No diagnostics on disk

`creds-mcp`, `creds relay` and `creds relay-pipe` write only `Console.Error.WriteLine("[creds-for-devs] …")`. The family
rule (`.claude/rules/shared/common/logging-serilog.md`) requires a coloured console and a file per run. Neither the
reason a process stayed alive nor the reason it exited can be read afterwards — this investigation had to rebuild both
from `/proc` and a shim.

## 3. Decisions

### 3.1 The owner (2026-10-09)

1. Fix it in creds itself (Variant 1): the server ends when its client disconnects **or its parent disappears**.
2. In scope: the relay-pipe leak (C), parent watch, a stale WSL install check, logs on disk.
3. A tool call whose client is gone is **cancelled and its consent modal removed** — see §3.3 for what the API allows.
4. The orphans on the measured machine were cleaned up the same day, by PID, after proving each was an orphan.
5. An upstream issue goes to `modelcontextprotocol/csharp-sdk` (draft in §5.10) — posted 2026-10-09 with the owner's OK
   as [csharp-sdk#1914](https://github.com/modelcontextprotocol/csharp-sdk/issues/1914).
6. The config key in argv (a side finding) gets its own plan: [PLAN_config_key_off_the_command_line.md](../research/PLAN_config_key_off_the_command_line.md).
7. The owner's WSL MCP install is refreshed after the release ships.

### 3.2 The question consultant (consultation `33635809`, one of two rows answered — the other was rate-limited)

Every point below was checked against the code before it was taken.

- **Consent:** defuse now — a closed request becomes a terminal *abandoned* outcome that can no longer allow a grant,
  remember consent or run anything, even after intervening awaits (verified: `perform` mutates the grant and remembers
  consent before `runAndDeliver`). Replacing the modal is a separate owner decision (§3.3).
- **Timing:** EOF gets a 1 s drain (a half-close still deserves its reply — `WslPumpTests.cs:83`); a signal or a dead
  parent cancels immediately; after cancellation shutdown is bounded at 5 s; `Environment.Exit` only when that deadline
  expires — a normal return otherwise, so the log is flushed. Exit code **0** for EOF and parent loss, **128+n** for a
  handled signal (precedent: `wsl_care · src_daemon/src/WslCare.Cli/ShutdownSignals.cs`, which registers
  INT/TERM/HUP/QUIT, suppresses the default and returns after cleanup).
- **Logging:** relay-pipe gets files too, kept sparse at Information (start, owner, stop reason, outcome); the server
  moves onto the shared project in the same plan, so there is one Serilog configuration per repo, as the rule demands.
- **Order:** a small logging foundation first, so every later fix is observable on the machine where it matters; each
  fix ships with its own reproducer rather than all proof waiting for the last epic.

### 3.3 Removing the modal — decided by the owner, 2026-10-09

A modal cannot be removed by code. Two shapes were offered: (a) *defused modal* — it stays until clicked or timed out,
but a click on a dead request does nothing except record that it was ignored; (b) *a QuickPick with `ignoreFocusOut`* —
removable by `hide()` the moment the request closes, but non-modal, so a weaker consent surface.

**The owner chose (a), 2026-10-09: "a defused modal is enough."** The modal stays on screen after its request is gone
and is harmless there. The QuickPick story is **dropped** from §10 rather than deferred; its number, E4.S3, was
reused on 2026-10-10 for the VPN start the E4.S1 tail named (§5.7, §10).

## 4. Found on the way

- **The owner's WSL MCP config points at a manual install** of 2026-08-31 while the extension ships 2026-09-24's build.
  No Windows half receives `--caller`, so caller forwarding (#61) is off for every WSL session — and no fix released
  through the extension would reach it. §5.8.
- **A config access key in argv**, readable by every process in the distribution via `/proc/<pid>/cmdline` — the config
  snippets pass it as an argument (`src_vs_code/src/configSnippetBodies.ts:21-48`, `src_cli/src/CommandLine.cs:83-88`).
  Own plan (§3.1.6).
- **`creds-mcp` has no `--version`**, so nothing can tell which build a client config points at. §5.8.
- **No CancellationToken crosses** `Tools`/`UseTools`/`FolderTools` → `Windows` → `BrokerClient`; each broker call makes
  its own 10-minute source. §5.3.

## 5. Design

**The one rule all of it implements:** *a creds process that serves a client, or holds a child for one, ends within a
bounded time of losing it — whichever signal arrives first: end-of-stream, a termination signal, or its parent's death —
and says in its log which one it was.*

### 5.1 Logging foundation — `src_service_defaults` (new, shared)

- New project `src_service_defaults/src` (`CredsForDevs.ServiceDefaults`, `IsAotCompatible`), referenced by `src_mcp`,
  `src_cli` and the server. **Moved, not rewritten**, from the server: `AnsiConsoleSink.cs`, `DailyRunFileSink.cs`,
  `LogRetention.cs` and the explicit, reflection-free level binding of `Logging.cs:96-125` (the server deliberately
  avoids `Serilog.Settings.Configuration`). Packages: `Serilog`, `Serilog.Sinks.File`, versions per the NuGet policy.
- Two entry points over one core: the server keeps `AddDewFlowLogging(builder, …)` with its `appsettings.json` contract;
  the AOT hosts get a **factory** `CredsLogging.Create(appName, consoleToStdErr: true)` — no generic host exists there
  (precedent and the same recorded deviation: `dew_flow_connect_other_ais · src_mcp/service_defaults/CoaiLogging.cs:13-19`).
- **Levels from the environment** for the AOT hosts: `CREDS_LOG_LEVEL` (default Information), `CREDS_LOG_DIR`,
  `CREDS_LOG_RETENTION_DAYS` (default 14, 0 disables) — a single-file binary has no `appsettings.json` to ship. A
  recorded deviation from the rule's "levels from appsettings", same as coai's `COAI_LOG_LEVEL`.
- **Root:** `CREDS_LOG_DIR`, else `%LOCALAPPDATA%\creds-for-devs\logs` (Windows), `$XDG_STATE_HOME/creds-for-devs/logs`
  or `~/.local/state/creds-for-devs/logs` (Linux), `~/Library/Logs/creds-for-devs` (macOS). Never the binary's folder
  (coai learned that: `CoaiLogPath.cs:17-27`). Unwritable → console only, start never blocked (`Logging.cs:127-140`).
  Path: `{root}/{yyyy-MM-dd}/{app}-{HH-mm-ss}-{pid}.log`, UTC.
- **Hosts that log to files:** `creds-mcp` serving (both halves; apps `creds-mcp` / `creds-mcp-wsl`), `creds relay`,
  `creds relay-pipe`. One-shot verbs (`--help`, `--version`, `ls`, `env`, `config`, …) write no file — a precedent the
  server set for `--health-probe`. Console always to **stderr**: stdout carries JSON-RPC, the agent protocol, or the
  `export SSH_AUTH_SOCK=` line.
- **Never logged:** argv values, environment values, the `--caller` record (only that it was present), JSON-RPC bodies
  (method names only), tool arguments or results, stream bytes, grant tokens.
- The WSL boundary: environment variables do not cross into the Windows half without `WSLENV`; the Windows half reads
  its own and defaults to Information. Not extended in this plan.

### 5.2 The server ends when its client is gone — `src_mcp/src/ServerLifetime.cs` (new) — defect A

A pure orchestration over injected tasks, so every branch is a unit test:

```
RunAsync(run: ct => server.RunAsync(ct), clientGone, parentGone, signal,
         drain: 1 s, deadline: 5 s, log, exit)
```

1. `clientGone` = `transport.MessageReader.Completion` — the SDK's public seam, completed by
   `TransportBase.SetDisconnected` when the read loop hits EOF. No wrapper stream (that would lose the SDK's
   `CancellableStdinStream`).
2. EOF → wait up to `drain` for `run` to finish on its own → cancel the run token. Signal or parent loss → cancel at
   once. Cancelling `RunAsync`'s token cancels every in-flight handler (the listen TCS, tool calls) and reaches the SDK's
   `DisposeAsync`.
3. After cancellation, wait up to `deadline`. Still running → log `deadline` with the reason that started the shutdown
   and `exit(0)` (or the signal's code). The deadline clock is a dedicated `Timer`, not a pool task.
4. Exit codes: 0 for EOF and parent loss, 128+n for a handled signal; the reason is in the log line, never encoded in
   a new contract exit name.
5. `--version` (new `Startup.Version`, `Program.cs:60-67`): prints `creds-mcp <version>` from the same source as
   `ServerInfo.Version` (`Program.cs:177`); inside WSL a second line asks the Windows half (`CaptureAsync(["--version"])`)
   and prints its version and path. An old Windows half answers with a usage error — read as "older".

### 5.3 Cancellation reaches the broker

- Every tool lambda (`Program.cs:217-229, 249-262, 272-284, 297-303, 332-343, 394-491`) takes a `CancellationToken`
  (the SDK binds it to the request and leaves it out of the schema — asserted by a test).
- `ct = default` threads through `Tools`, `UseTools`, `FolderTools`, `Windows.ReadAllAsync`/`PostAsync` and every
  `BrokerClient` call; each `new CancellationTokenSource(CallTimeout)` becomes a linked source with `CancelAfter`.
  A cancelled send closes the connection, which is what the extension observes in §5.7.

### 5.4 One lifetime helper for processes that hold children — `src_broker_client/src/ChildLifetime.cs` (new)

Shared because both the MCP wrapper and the relay need exactly this, and today each has its own partial copy
(`WslPump.Stop`, the relay's nothing) — the rule against a second implementation applies.

- **Signals:** `PosixSignalRegistration` for SIGINT, SIGTERM, SIGHUP, SIGQUIT; `context.Cancel = true` so the default
  disposition no longer skips cleanup; the first reason wins (`Interlocked`); a `CancellationToken Shutdown` for the
  owner's loops.
- **Children:** `Track(Process)` (and an internal `Track(IManagedChild)` seam for tests); `StopAllAsync()` —
  idempotent, one shared task — does, per child and in parallel: close its stdin → wait `grace` → kill the tree;
  exceptions from a child that already left are swallowed. `ProcessExit` calls it synchronously with a bound.
- **Parent watch (opt-in):** `getppid()` via `DllImport("libc")` (precedent `AgentRelay.cs:47-50`; `LibraryImport`
  would require `AllowUnsafeBlocks`), polled by a `PeriodicTimer` every 2 s; a changed ppid means the parent died and the
  process was re-parented. Off when the starting ppid is 1, and off for the relay, which legitimately outlives its
  launcher.
- **Backstop:** `grace + 2 s` after shutdown began, `Environment.Exit(code)` — a blocking read of the client's stdin
  cannot be cancelled, and with the default disposition suppressed nothing else would end the process.
- **Reason and exit code** exposed as `ShutdownReason` (`None`, never null) and 128+n.

**As built (E3.S1, 2026-10-10):**

- **`src_service_defaults/src/ChildLifetime.cs`, not `src_broker_client`.** It composes E2's `ShutdownSignals` and
  `ParentWatch` (no second registration, no second `getppid()` poll — the §5.4 bullets on signals and the parent
  watch are those two classes) and the logger, and `src_broker_client` references none of that. One copy, beside
  the primitives it is made of.
- **`IManagedChild` / `ManagedProcess`** is the shape of a child (`CloseStdin`, `WaitForExitAsync`, `KillTree`); the
  `Process` adapter swallows a second close of a stdin the owner already disposed. `Track(Process)` returns it.
- **`StopAsync(child, grace)` is the one killer** — the per-connection stop the relay needs and the stop `StopAllAsync`
  applies to every tracked child in parallel; a stopped child is forgotten, a child tracked after the stop began is
  stopped at once. `StopAllAsync` is a `Lazy<Task>`: one shared task, whoever asks.
- **No `None` word was added to `ExitReason`.** The ending is a `Task<HostEnding> Ended` (incomplete while the session
  lives) and `EndingOr(ordinary)`, so an owner whose loop ended for its own reason still reports a signal that
  arrived meanwhile as 128 + n — E2's drain rule, reused.
- **The grace is 2 s, not 1 s** (`DefaultGrace`): the Windows half's own end-of-stream drain is 1 s (E2), and a 1 s
  grace would kill it at the moment it was leaving on its own, costing its log the exit line every time. The backstop
  is `grace + 2 s`, as planned; it exits through `HostRun.ForcedExit(log)` — the server's deadline exit, moved into
  `HostRun` so the two cannot drift.
- **`ProcessExit`** runs `StopAllAsync` synchronously with the same bound.
- **One stop per child, shared** (code round 1): a connection's own stop and the shutdown's stop of every child meet
  on the same process; the second caller gets the stop in flight, `StopAllAsync` waits for every stop in flight,
  each stop runs off the lock, and a child tracked once the stop began is stopped at once (the flag is set under the
  lock before the snapshot, not published after it). A child that survives its kill is a Warning, not a Debug line.

### 5.5 The WSL wrapper stops the Windows half — `src_mcp/src/WslPump.cs` — defect B

- `RunAsync` (`:50-67`): a `ChildLifetime` with the parent watch on; `Track(child)` replaces `ProcessExit += Stop`
  (`:56`); `Stop` (`:175-189`) moves into the helper — one killer, not three (the third is `CaptureAsync`'s, left as is
  because it is a bounded one-shot).
- **SIGINT is "the client is closing"**: close the child's stdin, a 1 s grace, kill the tree — killing the `/init` proxy
  ends the Windows half (measured).
- `PumpAsync` (`:83-93`): after the client hangs up, wait for the child's stdout **at most** `drain + deadline` instead of
  forever; a fired `Shutdown` token returns at once. `SettleAsync` (`:159-172`) is unchanged.
- The ownership comments (`:53-55`, `:99-111`) are kept; the measured buffering decision does not move.

**As built (E3.S2, 2026-10-10):**

- `Program.RelayAsync` makes the lifetime (`ChildLifetime.Start`, the parent watched by the server's own rule
  `WatchParent` — so the kill switch applies to the pump too) and hands it to `WslPump.RunAsync(args, lifetime, log)`;
  the testable core `RunAsync(windowsHalf, args, fromClient, toClient, lifetime, log)` runs in-process against a script.
- `PumpAsync` gained a shutdown token and a hang-up bound (`HangUpBound` = the Windows half's drain + deadline, 6 s);
  the four-stream overload the old tests use delegates to it. A third `Ending.Interrupted` is what a fired token
  returns, also during the wait for the last reply.
- **A signalled session gets NO grace — a deviation from "a 1 s grace", forced by measurement.** Claude Code 2.1.296
  ends a server with SIGINT, SIGTERM 100 ms later and SIGKILL about 450 ms after that (a logging shim between the real
  `claude -p` and the wrapper, 2026-10-10 — RESULTS, *The fix, measured*). A wrapper that waited any grace would be
  killed before it reached its kill, and a Windows half that ignores end-of-stream — a stale install still in defect
  A — would outlive the session exactly as before. So on a signal the child's stdin is closed and its tree killed at
  once (`GraceFor`); the Windows half's log then ends without an exit line, which is the truth. A lost parent or a
  client that hung up gives the child the lifetime's 2 s; a child that closed its own stdout keeps the old 5 s.
  `SettleAsync` is therefore not unchanged: it stops through the lifetime, with the grace `GraceFor` decides.
- **Found on the real bridge, not planned:** `CREDS_RELAYED_FROM_WSL` never reached the Windows half, because
  environment variables do not cross WSL interop (§5.1 says so) — E2's "the parent watch is off for the Windows half"
  was a sentence the bridge did not honour (its log read *watching the parent 19532*, the session-long `wsl.exe`:
  harmless, and wrong). `WindowsBridge.StartInfo` now names the variable in `WSLENV`, appended once to the person's
  own list (`WslInterop.WslEnvFor`); the end-to-end log reads *parent watch off: started by the Linux half*.

### 5.6 The relay closes what it opened — `src_cli/src/AgentRelay.cs` — defect C

- `RunAsync` (`:159-221`): `ChildLifetime` without the parent watch replaces `CancelKeyPress` + `stopping`; after the
  accept loop, `StopAllAsync()` and only then `Remove(path)` (kept also on `ProcessExit`).
- `ServeAsync` (`:282-300`) becomes a thin caller of a testable core
  `CarryConnectionAsync(client, toChildStdin, fromChildStdout, child, ct)`, shaped like `WslPump.PumpAsync`: after the
  first direction ends, **dispose the child's stdin** (the EOF `Process.Close` never sends), wait ≤ 2 s, kill the tree,
  dispose its stdout so the pending copy ends; every child is `Track`ed for the relay's own shutdown.
- `RelayPipe.PumpAsync` (`src_cli/src/RelayPipe.cs:124-131`) already ends on either side; a test pins that.

**As built (E3.S3, 2026-10-10):**

- `AgentRelay.RunAsync` makes the lifetime with `ParentWatch.Off` and a 2 s grace; `ListenAsync(path, contract,
  windowsHalf, lifetime, log)` is the in-process seam — bind, accept, carry, `StopAllAsync`, `Remove(path)`,
  `EndingOr(ListenerClosed)`. `Console.CancelKeyPress` and `ExitReason.Interrupted` are gone: Ctrl-C is SIGINT, and
  the exit code is the shell's 130.
- `CarryConnectionAsync(client, toChild, fromChild, child, lifetime)` returns a `ConnectionEnding` — `SshClosed`,
  `WindowsSideClosed`, **`CopyFailed` with the exception** (the plan round's finding; `relay-pipe`'s own exit line
  already said `copyFailed` since E1) or `Interrupted`: the copies take the lifetime's token, so a relay ended by a
  signal does not wait for ssh or the Windows side to close a connection nobody will finish (SonarCloud on #214). The copy still reading from ssh after the Windows side closed is observed but
  **not awaited**: awaiting it would hold the connection until ssh gave up, since the socket is the caller's to close.
- The relay logs each connection's child at its start (`connection N opened; relay-pipe pid P`), so a live child can
  be found by a test or a person without waiting for the connection to end.

### 5.7 A request that is gone can authorise nothing — `src_vs_code/src` — §2.3

- Where the MCP and alias routes create `res`: `res.on('close', …)` aborts an `AbortController` when the response was not
  finished. The signal threads through `BrokerDoor.consent` / `perform` (`brokerMcpDoor.ts:25-98`) into
  `credsAgentServer.consent` / `ask` / `perform` and `brokerCall`'s `useAction.run` (`brokerCall.ts:126`).
- After every await on that path (`ask` returning, `consent` returning, before `runAndDeliver`) an aborted signal ends
  the request as **abandoned**: no `grants.allow`/`deny`, nothing remembered, nothing run, one audit line `ABANDONED`.
- **The action boundary itself refuses an aborted request** (gate round 1, finding 0): a check before `runAndDeliver`
  leaves a window between the check and the start. So the signal is an argument of the action start, and the check is
  made in the same synchronous step that starts it — no await between them — and every `useAction.run` that spawns a
  process or sends a request takes the signal, so a disconnect after the start cancels the work rather than only its
  reply. A test disconnects exactly at that boundary.
- The shared `consenting` map (`credsAgentServer.ts:64, 608-614`) keys a prompt by grant secret; the MCP door mints a
  grant per request (`:275`), but token doors share one — so an abandoned waiter **detaches** from a shared prompt and
  never decides it for another live request.
- The modal itself: §3.3 — it stays, defused.

**As built (E4.S1, refining the bullets above where the code asked for it):**

- The signal is made once per request at the top of the router (`requestLife.ts`, no `vscode`): `res` `close` with the
  response not finished aborts it. Every door gets it — the token and alias routes pass it to `perform`; the MCP and
  folder routes get it on the per-request `BrokerDoor` (`door.signal`), whose `consent`/`perform` hand it to the
  broker's `consent`/`ask`/`perform`.
- `ConsentOutcome` gains `abandoned`. The shared prompt is its own unit (`sharedPrompt.ts`): a waiter joins with its
  own signal and **detaches the moment that signal fires** — its request ends then, not when somebody clicks; the
  person's answer is applied (`grants.allow`/`deny`, presence) only if a live waiter is still attached when the prompt
  settles. A click on a prompt nobody waits for writes one `ignored` line and decides nothing.
- Checks after every await on the path: consent, the consent memory write, the waiting-rotation release, the mask table
  read; the MCP create also after the folder PIN step, before `make` — and the PIN step itself takes the signal, so its
  box closes when the client leaves instead of checking (and counting wrong) PINs for nobody (consultation, §14). And at
  the boundary itself — `brokerCall.ts` checks, counts the use (`GrantRegistry.reserve`) and starts the action in ONE
  synchronous step. The count moved there from before the one-use lane's queue (code round 1, §14): a call whose client
  left while it waited its turn used to have spent a use of its grant without running.
- One audit line per abandoned request, outcome `ABANDONED`, its detail naming the stage it was dropped at. No answer is
  written: the socket is already gone.
- `UseActionContext.signal` is required, so every action start states it. The four actions that spawn a process — ssh
  exec, a stored script, a stored terminal command, a database query — hand their launcher both the window's and the
  request's signal as a LIST (`useActions.launchGuards`; never an `AbortSignal.any` composite, which Node 20 keeps
  referenced from the window's long-lived signal, one per call — risk consultation, §14), and `runBounded` refuses to
  SPAWN once any has fired — it used to spawn and only then subscribe to the abort (cadence consultation, §14).
  Opening an SSH terminal is gated too: `ConnectOptions.startGate` is checked after the credential lookup, the host-key
  read and the relay probe, before any terminal opens; a terminal already open belongs to the person and stays. An env
  export has no await before its effect, so the broker's boundary check covers it. An action that throws after its
  client left (refused at launch, or killed mid-run) is journalled as that request's `ABANDONED`, not as `internal`.
- **Open tail, recorded — taken by E4.S3 below:** a VPN start (`runVpn`) awaits before it opens its terminal and is
  not gated by the request. (This bullet first called the tunnel *window-scoped* and spoke of `runVpn`'s *retries*;
  both were wrong. `runVpn` has no retry loop, and a WireGuard tunnel installed as a Windows service
  (`/installtunnelservice`) outlives the VS Code window, as a `wg-quick up` stays up until it is stopped.) **Deviation, the rotation:** it refuses an abandoned request before it draws a secret, but runs its
  statement with the window's signal only — killing a statement that may already have changed the far side would lose
  the new value, because the vault stores it only after the statement succeeds. Expressed as
  `UseActionContext.finishOnceStarted`: the statement's launch is still refused for a gone request (a `startGate`),
  only an already-running statement is left to finish.
- Proven across the process boundary too: level 8 of `creds-mcp-itest.cjs` kills the real binary mid-consent and then
  answers Allow. A client that only closes the binary's stdin is NOT seen until E2.S3 makes the binary cancel its
  broker call on EOF.

**E4.S3 — a gone request starts no VPN** (design for its own plan round; an *as built* paragraph follows the code
round). The promise, exactly: *once the client's departure has been observed, no new VPN start and no continuation of
one already under way — up to the moment its command is handed to a terminal.* A command already typed into
PowerShell or a sudo prompt, and a tunnel already up, are **not** revoked: their life is separate work (open tail
below).

- The gap (verified 2026-10-10): the VPN action's `open` (`agentUseActions.ts`, `vpnAction`) takes no signal, and the
  extension's `open` (`extension.ts`, the agent deps) calls `runVpn` without one. `runVpn` awaits before anything is
  sent — the dependency chain (its approval modal, its terminal's shell integration, every step, every *Continue*
  question), the custom launcher's trust modal, the entry's door in `writeVpnConfig`, OpenVPN Connect's import
  question, the install offer. A client gone during any of them still got: the stored config written into a private
  file (`writeVpnConfig`), the dependency installers run (`runDependenciesFirst`), a custom launcher's line typed — with
  no administrator prompt of its own (`runWithLauncher`) — an OpenVPN Connect profile import, or the tunnel itself
  started.
- The request's signal travels `vpnAction.run` → `open(accountId, entityId, action, startGate)` →
  `runVpn(…, startGate)` → `VpnRunContext.startGate` — the shape of SSH's `ConnectOptions.startGate`. The dependency
  chain takes it as `DependencyRunRequest.startGate`, the install offer as `offerToInstall(tool, startGate)`.
- Checked after every await on that path and immediately before each effect: before the entry's door is asked and
  again before the config is materialised; before the chain terminal opens and before each step is typed or executed;
  before the install recipe is sent; before the launcher's line, the OpenVPN Connect import line and the built-in
  start or stop line are sent. A fired gate returns `false` quietly — no warning for a person who did not ask.
- The exit is E4.S1's: an action that did not start and whose request is gone throws the launcher's *not started*
  error, which `brokerCall` journals as that request's `ABANDONED` (*as the action was starting — it was not
  launched*), answering nobody. A start whose command was sent before the client left answers as it always did.
- The person's own Start and Stop (`entityCommands.ts`) pass no gate — never fired — and do not change; a test pins it.
- Found while tracing, the same class and the same fix: the SSH terminal's install offer (`sshConnect.ts`,
  `offerToInstall('ssh')`) was not gated by its `startGate`; and an SSH terminal refused by its gate was journalled
  as an `internal` failure instead of `ABANDONED`. Both are taken here.
- **Open tail (not this story):** revoking a command already sent, or a tunnel already up, for a request that has gone
  — a tunnel's life cycle is its own plan; and the entry-PIN box `writeVpnConfig` may raise stays on screen after the
  request leaves (the folder PIN step's box closes; this door takes no token yet) — the gate is checked after it
  answers, so nothing is written for a gone request.

**As built (E4.S3, 2026-10-10, refining the bullets above where the code asked for it):**

- One reading of a gate, `requestLife.requestGone(startGate)` — `false` for no gate, the person's own click — and one
  exit, `requestLife.notStarted()`, MOVED from `sshExecRunner.ts` (where `runBounded` already threw it for a refused
  launch) so the VPN action and the SSH terminal throw the same error the broker already journals as `ABANDONED`.
- `runVpn` takes the gate as a REQUIRED last argument (`AbortSignal | undefined`), the `UseActionContext.signal`
  precedent: the person's Start and Stop pass `undefined` in so many words, so a new caller cannot forget it.
- Where it is read: `runVpn`'s entry (a request already gone is asked nothing — not even the launcher's trust
  modal); the chain's entry, after its approval modal (`approveAndRun`) and before every step (`runStep`);
  `storedConfig` (split out of `writeVpnConfig`) before the entry's door and again before materialising; the
  custom launcher's `configFor`, the last await before its line; `sendToVpnTerminal`, the only place the built-in
  launcher types (start, stop, OpenVPN Connect's import); `offerToInstall` before its modal and before the recipe.
  Both launchers build the chain request through one `vpnDependencies(ctx, roots)`, which carries the gate.
- The exit: `vpnAction`'s `vpnOutcome` throws `notStarted()` when nothing started and the gate has fired; a start
  whose line was typed before the client left answers `opened` as always (pinned by a test).
- **Deviation, the config is written LAST** (code round 1, finding 2): the built-in start used to write the config
  before it looked for the launcher, so a request that left at OpenVPN Connect's import question — or at the install
  offer of a launcher that was missing — left the plaintext config on disk for a start that never happened (and so
  did a live start that was declined there). Now the launcher is found first, and only a line that will be sent
  writes it: `startLine` for the CLI, after *Import profile* for OpenVPN Connect, never for a missing launcher; no
  await lies between the write and the send. `vpnAction` takes only `VpnUseDeps` (the entity read and `open`),
  so its tests hand it a typed fixture instead of a cast (finding 0).
- **Deviation, a wider test seam:** the VPN world moved out of `dependencyChain.test.ts` into `test/vpnWorld.ts`
  (both suites use it; it gained held dialogs and an `onExecute` hook), `brokerWorld` gained `realAction` so the
  real `vpnAction` runs behind the real broker, and `sshConnectWorld` gained `sshMissing`.
- **The agent's opener is a factory**, `vpnRun.agentVpnOpener`, registered by `extension.ts` — the line that hands
  `open`'s gate to `runVpn` is held by a test (checkpoint round, finding 3); it was activation wiring no test loaded.
- A chain step that finishes after its request has gone ends the chain with no *Continue* question (`settle` reads the
  gate first — checkpoint round, finding 4). `notStarted()` builds a `RequestEndedError` whose `name` is part of the
  instance (finding 2).
- The flows are catalogued in [module_tests.md](../research/module_tests.md), *A gone request starts no VPN*, with the
  scenario-harness gap and its reason.
- **Open tail, found by the own review and left for a later story:** (1) the SSH terminal's path awaits the credential
  lookup (its PIN box) and the host-key read BEFORE its first gate check, so for a gone request it can still show the
  host-key or bastion prompt, write a known_hosts pin (taken back by the later check) and, through
  `refuseAndOfferTheFix`, run a remedy (relay setup, add a key to the agent) before the retry stops at the gate — E4.S1's
  SSH gate, not this story's VPN one; (2) a dependency step already typed when the client left is the shell's, yet the
  request is journalled `ABANDONED` "as the action was starting — it was not launched": true of the VPN, not of the step.

### 5.8 A stale WSL install says so — `src_vs_code/src`

- The extension does not write a client's MCP config; it copies a block (`wslMcpInstall.ts:79`, `mcpClientConfig.ts`).
  So the check asks the install itself: `wsl -d <distro> -e <path> --version` (§5.2) — the path and the flag as
  separate arguments, no shell between them (E2 plan round, finding 0: a path with a quote in it must not become a
  command), bounded by a timeout that kills the process tree — compared with
  `compareVersions` (`credsInstall.ts:151`) against what the extension ships. **`<path>` is the exact executable the
  copied config block names** (the install path `installIntoWsl` wrote), never a bare `creds-mcp` resolved through the
  shell's PATH — a current binary earlier on the PATH would report "current" while the client still launches the stale
  one (E1 plan round, finding 1). The verdict says which path it checked.
- Pure verdict `staleVerdict(versionOutput, expected)` in `wslMcpInstall.ts` (current / older / no `--version` = older),
  host wiring next to `staleBinaryWarning` (`wslMcpInstall.ts:108`, shown from `mcpInstallTarget.ts:113`).
- When: after every MCP install into WSL; at activation at most once a day per distribution, **only for running
  distributions** (`wsl -l --running -q`) — never wake the VM; and a command *"Check the WSL MCP install"*.
- What the person sees: the distribution, both versions, the Windows-half path the install uses, and **Update** (the
  existing `installIntoWsl`, then the config block with the new path on the clipboard), **Later**, **Not for this version**.

**E4.S2 design, settled before its plan round** (question consultation `85327e0e`, codex — verified against the code):

- **Which executable — the block's two values, remembered.** The extension cannot see the client's config, and does
  not read it: a client's per-user file also holds other servers' env values and account data, and a credential manager
  pulling that file across the WSL boundary to recover two strings it already wrote is poor data minimisation (the
  consultant's word). So `installIntoWsl` records, per distribution, the two values the copied block names — the Linux
  binary (`installedPathFrom`) and the translated Windows binary — in `globalState` the moment the block is on the
  clipboard. The check replays exactly that pair: `wsl -d <distro> -e env CREDS_MCP_WINDOWS_BINARY=<windows> <linux>
  --version` — `env` because the Windows half `--version` reports is resolved from that variable, and without it the
  probe would ask a different half than the client launches. A Linux path that is not absolute or contains `=` (which
  `env` would read as an assignment) is refused, never quoted.
- **An install the extension did not make is "not recorded"**, not guessed at. The command says so for a running
  distribution and offers **Update** — which, followed by the paste and the client restart the install message already
  asks for, is the fix for the motivating case (a manual install from August). Asking the person to paste their
  config's command was rejected as the default: it would still need the Windows path too, and still not prove the client
  uses it.
- **Expected** = the `creds-mcp` version the extension recorded installing on Windows (`binaryInstaller`'s record) — the
  half the block points at. **Below the first release with `--version` (`mcp` 0.10.0)** the check cannot judge and says
  nothing at activation (a current install of that version has no `--version` either — flagging it would loop Update).
- **Verdict:** `current` when the Linux half answers a version ≥ expected and the Windows half answers one ≥ expected;
  `older` when the Linux half has no `--version` (a non-zero exit — a build older than the flag, or a binary that is
  gone), answers less, or the Windows half answers less, or answers one of E2's three words (`older than --version, or
  no answer`, `answered without a version`, `not started`); **`unknown`** when the probe timed out — a hung distribution
  is not evidence of an old binary (consultant), so it is reported by the command and silent at activation. The bounded
  run is `runWslBounded`'s core widened to tell a timeout from an exit, not a second spawner.
- **When:** after every install into WSL (shown only when not current); at activation for recorded, running
  (`wsl -l --running -q`), due (24 h per distribution) installs, skipping a distribution whose **Not for this version**
  names the current expected version; and the command **Check the WSL MCP install**, which ignores both throttle and
  dismissal. Activation spawns nothing when no install is recorded.
- **Where:** the panel button lives in the view's **Install…** submenu, beside *Install the MCP Server…* (owner's rule,
  2026-10-09: every action is a panel button, the palette duplicates); it is the same command id, so the button and the
  palette run one handler. The orchestration is a `vscode`-free module with injected `runningDistros`, `probe`, state
  and clock, so the stopped-distribution, throttle and dismissal rules are unit tests.

**As built (E4.S2, where the code refined the block above):**

- **Every message claims only the copied block** (plan round, finding 1): "the MCP server whose config this
  extension last copied for <distro>", never "your client runs" — copying a block does not prove it was pasted.
- **The explicit command also offers only RUNNING distributions** (`wsl -l --running -q`), not only activation: it
  never starts a VM either; with none running it says so. With one running it asks that one; with several, a pick.
- **The Update straight after an install is not offered**: an install whose verdict is already `older` (a Windows
  half that does not start, say) is reported with **Later** / **Not for this version** only, because Update would
  install the same release again.
- **Registered from `agentCommands.ts`, beside *Install the MCP Server…***, not from `extension.ts` (whose size
  ratchet forbids growth) — with plain values (`storageDir`, `state`), so registering needs nothing of the editor's
  API, and an activation-check failure goes to the diagnostic log instead of an unhandled rejection.
- **The bounded run was widened, not copied**: `runWslOutcome` and `runningDistros` share `runWslBounded`'s one
  spawn, deadline and tree kill; the core now collects bytes, because `wsl -l` answers in UTF-16 and a
  distribution's programs in UTF-8. `binaryInstaller` gained `recordedVersion` and `binaryIn` (the storage-only
  half of `binaryPath`).

### 5.9 Native parent watch for the server — `src_mcp/src/ParentWatch.cs` (new)

- Only when the server is not relayed (`WslInterop.RelayedVariable` unset, `WslInterop.cs:59`): under the relay the
  Windows parent is the distribution's session-long `wsl.exe`, whose life says nothing about the client.
- **Windows:** first thing in `Main`, `NtQueryInformationProcess(ProcessBasicInformation)` →
  `InheritedFromUniqueProcessId`; open it at once (`Process.GetProcessById`), and if its start time is later than ours
  the original parent is already gone (PID reuse) → `parentGone` now. Then `WaitForExitAsync`. Access denied → log and
  run without the watch; EOF remains the primary signal.
- **Linux/macOS:** the `getppid()` poll from §5.4.
- Kill switch `CREDS_MCP_NO_PARENT_WATCH=1` for a launcher that starts the server as a child and exits (corrected on
  PR #211: a launcher that `exec`s is replaced by the server, so it has no separate death to watch).

### 5.10 Upstream

**Posted 2026-10-09** with the owner's approval of the text:
[modelcontextprotocol/csharp-sdk#1914](https://github.com/modelcontextprotocol/csharp-sdk/issues/1914). The text as
drafted:

> **Stdio server never exits after stdin EOF once a client has sent `subscriptions/listen` (2026-07-28).**
> 2.2.0, `StdioServerTransport` + `McpServer.Create` + `await server.RunAsync()` without a token. Client: `server/discover`,
> `subscriptions/listen {"notifications":{"toolsListChanged":true}}` (server acknowledges), then closes stdin.
> Expected: `RunAsync` completes. Actual: runs forever. `ProcessMessagesCoreAsync` waits for in-flight handlers after the
> channel completes without cancelling them, and the stateful listen handler completes only on cancellation; any
> long-running `tools/call` behaves the same. Suggest cancelling in-flight handler tokens when the transport completes.

The local fix stays either way: it is harmless once upstream fixes it, and clients older than any fix exist.

## 6. Boundaries with other plans

| Plan | Touches | Who builds what |
|---|---|---|
| [PLAN_creds_cli_reachable_from_every_caller.md](PLAN_creds_cli_reachable_from_every_caller.md) | `WslInterop.cs` (a resolution rung), the WSL install | That plan owns where `creds`/`creds-mcp` are installed and found; this one owns how long they live and `--version`. §5.8 reuses its install, never re-implements it. |
| [PLAN_consent_names_codex_and_wsl_sessions.md](PLAN_consent_names_codex_and_wsl_sessions.md) | the consent modal's text, caller identity over the bridge | That plan owns what the modal SAYS; this one owns whether a closed request can still be answered. |

Both are named back from those plans in the same change that lands this one.

## 7. Measure before building

1. **`PosixSignalRegistration` under NativeAOT on linux-x64**: publish the wrapper AOT, send SIGINT/SIGTERM/SIGHUP from a
   process that spawned it (not a bash `&` job — SIGINT is ignored there), confirm the handler runs. The JIT test
   builds do not answer this.
2. **Serilog in the AOT binaries**: size and cold-start delta of `creds-mcp` with and without it; IL warnings under
   `TreatWarningsAsErrors` (the server needs `NoWarn IL2104`). Refusal criterion fixed in advance: **> 3 MB or > 50 ms
   added to the first response** → a hand-written sink honouring the same contract, recorded as a rule deviation.
3. **`server/discover` + `subscriptions/listen` fixture** captured from Claude Code 2.1.295 (the shim log in the
   RESULTS record), stored under `src_mcp/tests/fixtures/` — not invented.
4. Whether `McpServer.Create` can take an `ILoggerFactory` (so SDK lines reach the file) without reflection.
   **Answered in E1:** it can, and is deliberately not given one — the SDK logs outgoing JSON at Trace and a client's
   cancellation reason at Information, which would carry protocol bodies into the file (§5.1). The client's name and
   method names come through an incoming message filter instead. Record: the RESULTS file, §7.2 section.

## 8. Growth budget

Logs are the only new growth. Estimate (to be measured on the machine in the RESULTS record after E1): ~8 lines and
~1.5 KB per host run, ~200 runs a day → ~300 KB/day, ~4 MB and 3–7 thousand files across 14 days. **Owner:** each
host prunes day-folders older than the window at startup, only folders whose name parses as a date, never the current
file, `IOException`/`UnauthorizedAccessException` ignored. **Interrupted:** a file without its exit line is the
diagnosis (killed hard), not a leak; nothing is in flight to sweep. If measurement exceeds the estimate tenfold,
relay-pipe drops to one file per day per relay (still per run of the relay).

## 9. Security

- §2.3 is the security-relevant change: after E4 a request whose client is gone can neither allow a grant nor run an
  action. Tests prove the late **Allow** runs nothing.
- Logs never contain argv values, environment values, caller records, JSON-RPC bodies or tool data (§5.1); a test runs a
  host with a marker secret in argv and env and greps the file — paired with a test that the grep finds a known line.
- Parent watch and signals only END processes this process started; nothing is ever killed by image name.

## 10. Build order — five epics

Each epic is its own branch, its own plan round and code round of the review gate, its own pull request; each story is
one commit with its tests. A commit that touches only `src_broker_client` or `src_service_defaults` releases nothing —
every epic touches `src_mcp` or `src_cli` (or the extension) so release-please opens the component release; releases
only with the owner's OK on the notes.

### Epic E1 — the logs say why a process lived and why it ended

- **E1.S1** `src_service_defaults`: the moved sinks and retention, the factory, the env-level binding; the server moved
  onto it mechanically with its `appsettings.json` contract unchanged. Tests: the server's existing logging tests pass
  unmodified; the factory writes the path shape, UTC, stderr.
- **E1.S2** wire the four hosts (start with pid/ppid/mode/version/client name after handshake; exit with code, uptime
  and reason; relay connections; relay-pipe outcome); the existing human sentences go through the logger. Tests: the
  secret-marker grep and its positive control; stdout of `creds-mcp` carries only JSON-RPC.
- **E1.S3** measurement §7.2 recorded in the RESULTS record; release smoke: the published binary writes its file.

### Epic E2 — the server ends when its client is gone (A)

- **E2.S1 RED**: process test — the built `creds-mcp` given the captured 2026-07-28 handshake with
  `subscriptions/listen`, stdin closed → must exit within 10 s; fails today with "still running". Positive control: the
  2025-06-18 handshake exits (already true) — so a refused fixture cannot pass silently.
- **E2.S2** `ServerLifetime` + `Program.RunAsync` (§5.2); unit tests for every branch (EOF then drain, signal, parent,
  deadline, run finishing on its own calls no exit). E2.S1 goes green.
- **E2.S3** cancellation to the broker (§5.3): a stub broker whose POST hangs sees the connection close within
  `drain + deadline` after EOF; the `CancellationToken` parameter is absent from every tool schema.
- **E2.S4** native parent watch (§5.9) and `--version` (§5.2.5): `cmd /c creds-mcp` with the parent killed → exits;
  relayed → does not; PID-reuse case → `parentGone` at once.

### Epic E3 — the bridge and the relay stop what they started (B, C)

- **E3.S1** `ChildLifetime` with fake signal source, fake children and fake parent probe: stop order, grace, idempotence,
  first reason wins, 128+n, a throwing child does not stop the others, ppid change → `ParentGone`. A real-signal test on
  Linux CI spawns the host itself and asserts its `SigIgn` mask does not ignore SIGINT before sending it.
- **E3.S2 RED → green** `WslPump`: a client that hangs up while the child never closes stdout ends within the bound;
  SIGINT/SIGTERM/SIGHUP to a pump host stop a real fake child (`new WindowsBridge(<script>)`, no WSL needed). The two
  existing `WslPumpTests` endings stay green.
- **E3.S3 RED → green** `AgentRelay`: after `CarryConnectionAsync` the child's stdin is closed (fake stream records the
  dispose); 20 connections leave 0 live children (process test with `CREDS_WINDOWS_BINARY=<script>` and a short
  `CREDS_RELAY_SOCKET`); SIGTERM/SIGHUP to the relay remove the socket and stop every child.
- **E3.S4** §7.1 AOT measurement; the WSL itests of E5.S1 run by hand against this build before the epic's PR.

### Epic E4 — a request that is gone can authorise nothing; a stale install says so

- **E4.S1 RED → green** abort on `res` close threaded through consent/perform/run (§5.7). TS tests: the client drops
  during the modal, the test clicks **Allow** → no grant allowed, nothing run, `ABANDONED` logged; a token grant shared
  by two waiters — one abandons, the other still gets its answer; the client drops between consent and the action start
  → the action never starts; the client drops after the start → the action's signal fires.
- **E4.S2** stale WSL install check (§5.8): pure `staleVerdict` tests (every state, an old Windows half, no
  `--version`, a timeout); host orchestration tests (a stopped distribution is never probed, once a day, *Not for this
  version*); the panel button and the command are one id; the install records the block's two paths.

- **E4.S3 RED → green** a gone request starts no VPN (§5.7, *E4.S3*). TS tests under the `vscode` stub, each holding
  one await open, firing the request's signal, then releasing it: the built-in start (no config file, no line sent),
  the dependency chain (at its approval modal, and between two steps), the install offer, the custom launcher (at its
  trust modal: no `{config}` file, no line), OpenVPN Connect's import; the VPN action ends `ABANDONED` through the real
  broker. A live request starts exactly as before, and the person's own click (no gate) is unchanged. Each check is
  watched red with its line removed. (The QuickPick consent surface that once held this number was dropped by the
  owner's decision in §3.3.)

### Epic E5 — proof on the real bridge, and the tail

- **E5.S1** `wslStrays.cjs`: `watchWindowsPids(image, exePath)` — set difference of Windows PIDs filtered to the test's
  own binary path, polled up to 5 s, swept **by PID only**. Each itest run copies the binaries it starts into a
  **run-unique directory** (gate round 1, finding 1), so a process another user or test started from the shared build
  output can never match, and the sweep re-checks each PID's `ExecutablePath` against that directory immediately before
  stopping it. `creds-mcp-wsl-itest.cjs`: a Claude-Code-2.1.295-shaped client
  (`server/discover`, `subscriptions/listen`, `tools/list`) ended by SIGINT, SIGTERM, SIGHUP and by a stdin close —
  0 Windows survivors each; SIGKILL of the wrapper — 0 survivors (proves A alone suffices). `wsl-agent-relay-itest.cjs`:
  10 `ssh-add -l` → 0 new `relay-pipe`, relay fd count back to baseline; `manager.dispose()` → 0 survivors.
- **E5.S2** CI: a `windows-latest` leg in `ci-clients.yml` (not required until it has reported once —
  `branch-protection.json:19-31`); release smoke in `release.yml` (the published AOT binary exits on EOF with an open
  listen, and writes its log).
- **E5.S3** follow the upstream issue (§5.10, posted as csharp-sdk#1914); `research/module_*.md` and `architecture.md` updated
  (§13); the owner's WSL MCP refreshed to the released build (§3.1.7); the RESULTS record gets the after-numbers.

### Ordering constraints

E1 → E2 → E3 → E4 → E5. E2 before E3 because E3's itest for SIGKILL relies on A being fixed. E4.S1 is independent of
E2/E3 and may ship earlier if a release window needs it. E5.S1's itests run by hand before each of E2–E4's PRs, not only
at the end.

## 11. Test plan

All .NET tests run as Microsoft Testing Platform executables after `dotnet build`, never `dotnet test`
(`src_mcp/tests/bin/Debug/net10.0/CredsMcp.Tests.exe`, the `src_cli` and `src_broker_client` equivalents, the server's);
the extension with `npm test`; the WSL itests with `npm run itest:all` on a Windows machine with WSL.

| Defect / behaviour | RED first | Layer |
|---|---|---|
| A: listen + EOF never exits | E2.S1 | process (built `creds-mcp.dll`) |
| A: in-flight tool call holds the process | E2.S3 | process + stub broker |
| parent dies (native) | E2.S4 | process |
| B: SIGINT skips cleanup | E3.S1/E3.S2 | unit + process (Linux CI) |
| B: unbounded wait after hang-up | E3.S2 | unit (existing `HeldStream`) |
| C: relay never closes child stdin | E3.S3 | unit + process |
| consent outlives the request | E4.S1 | TS unit |
| stale install verdict | E4.S2 | TS unit |
| a gone request starts no VPN | E4.S3 | TS unit (`vscode` stub) + broker |
| logs leak nothing, stdout stays clean | E1.S2 | process |
| the whole bridge, real Claude-shaped client | E5.S1 | node itest on WSL (manual) |

Every bug test is shown red with the real symptom before the fix and green after; both observations go in the PR.

## 12. Not doing, and why

- **An idle timeout.** MCP sessions legitimately sit silent for hours; it cannot tell "gone" from "quiet".
- **A Windows Job Object for interop children.** The WSL service creates them, not us; nothing of ours owns a job they
  could be placed in.
- **`exec` instead of the pump.** It removes the wrapper but keeps A, loses `--caller` forwarding and needs `execve`
  through unsafe P/Invoke; revisit only if E3 measures badly.
- **Extending `WSLENV`** so log settings reach the Windows half — not needed for the leak; a later plan if wanted.
- **Changing `WslRelayManager.stop()`** — it delivers SIGHUP, which E3 handles (measured, §2.2).

## 13. Definition of Done

- [ ] On the measured machine after a day of normal use: `creds-mcp.exe` count equals live MCP clients; `creds.exe
      relay-pipe` count equals live SSH-agent connections (recorded in the RESULTS record).
- [ ] Defects A, B, C each have a test shown red with the real symptom and then green; the WSL itests of E5.S1 pass.
- [ ] A late **Allow** for a gone request runs nothing (E4.S1). (§3.3 decided by the owner 2026-10-09: defused modal.)
- [ ] A gone request starts no VPN, its installers or its launcher, and writes no config (E4.S3).
- [ ] Every serving host writes `logs/{yyyy-MM-dd}/{app}-{HH-mm-ss}-{pid}.log` with its start and its exit reason;
      retention works; nothing secret is in a log file.
- [ ] `creds-mcp --version` reports both halves under WSL; a stale WSL install is reported with an update offer.
- [ ] Each epic passed its plan and code rounds; its PR's automated comments were read and answered; releases cut only
      with the owner's OK on the notes.
- [ ] `research/module_extension.md`, `module_tests.md`, `architecture.md` (the WSL bridge diagram and process lifetime),
      `PLAN_mcp_wsl_bridge.md` (its promise now kept — a pointer here) updated; `todo/README.md` and `research/README.md`
      match; `node .claude/rules/shared/tools/plan-lifecycle.mjs` passes; the plan is promoted when E5 lands.

## 14. Review record

**Plan round 1 (2026-10-09, session `a87435eb`) — `proceed`**, gating 2 against threshold 6, **1 of 2 reviewers
answered** (codex; gemini rate-limited — the verdict is one vendor's, not a panel's).

| # | Finding | Decision |
|---|---|---|
| 0 | §5.7: a race between the last abort check and starting the action | **accepted** — the action boundary itself refuses an aborted request, checked in the same synchronous step; boundary test added (§5.7, E4.S1) |
| 1 | E5.S1 could stop an unrelated process started from the same test binary | **accepted** — run-unique binary directory, `ExecutablePath` re-checked before each stop (E5.S1) |
| 2 | §8 retention could delete a still-running host's folder | **rejected** — the moved `DailyRunFileSink` rolls a running host into the new day's folder (`DailyRunFileSink.cs:52-93`) and `LogRetention.cs:15` states the invariant; an idle-for-the-whole-window host loses only out-of-window lines |

The round's operator commands: build this plan without re-splitting it (the five epics above ARE its split, made
before the round); work autonomously per the six orders; ask the question consultant before the person.

### Epic E1 — the logs say why a process lived and why it ended (branch `feat/e1-logs-on-disk`)

**Plan round (2026-10-09, session `889ae40d`) — `proceed`**, gating 2 against threshold 6, **1 of 2 reviewers
answered** (codex; gemini rate-limited — one vendor's verdict, not a panel's).

| # | Finding | Decision |
|---|---|---|
| 0 | §3.1/§3.3 leave the modal promise unresolved while E4 defaults to a modal that stays visible | **rejected** — outside E1's scope and already recorded as the owner's open decision: §3.3 names both shapes, E4 ships (a), (b) only on the owner's word as E4.S3, and §13 requires "the owner has decided §3.3" before the plan closes |
| 1 | §5.8 checks the PATH's `creds-mcp`, not the binary the copied config launches | **accepted** — §5.8 now checks the exact executable path the config block names and says which path it checked |

**Cadence consultation, epics 1–3** (owed before this epic's code round; codex). Verified and acted on: (1) the
relay's *already served* refusal is read by the extension (`socketFromBusyLine`), so a raised `CREDS_LOG_LEVEL`
must not hide it — the AOT floor is capped at Warning and a process test runs the refusal at `fatal` through the
extension's own pattern; (2) the new project had to reach the server's Dockerfile, the main-push path filter of
`ci-server.yml`, and the two WSL itests' explicit copy lists (the relay's also lacked `Directory.Packages.props`,
which the first package in the CLI's graph now needs) — all four done, the image built and run; the itest's
`tail -1` read of the refusal became a `grep`, since the exit line now follows it; (3) do not hand the SDK an
`ILoggerFactory` (§7.4 above); (4) read the client name before AND after the handshake message is handled.
Its fifth point — E2's Unix parent watch reuses §5.4's poll, which sits in E3.S1 — is for E2's branch: the
primitive moves into E2 and E3 reuses it. Also new in E1 and reusable there: `ParentProcess.Id()` in
`src_service_defaults` (getppid / `NtQueryInformationProcess`) — the observation half of §5.4/§5.9's watch.

**What shipped, and where it differs from §5.1/§10:**

- `src_service_defaults/src` (`CredsForDevs.ServiceDefaults`) with the three sinks MOVED (`git mv`, namespace only),
  plus `CredsLogging` (core `Build` + AOT factory `Create`), `LogLevels`, `LogRoot`, `UtcTimestampEnricher` (moved out
  of the server's `Logging.cs`), `HostRun`/`HostEnding` (start and exit lines) and `ParentProcess`. The server's
  `Logging.cs` keeps its `appsettings` keys and calls the core — the contract and the server's output are unchanged
  (container built, run, file written under `/logs`).
- **Deviation:** the server's `LoggingSinkTests` pass byte-for-byte unmodified (a `<Using>` in the test project
  supplies the new namespace), but `ConfigKeysTests` had to drop `LogRetention.cs` from its list of server files
  that read configuration — the file moved, and it never read a key itself (`Logging:RetentionDays` is read in
  `Logging.cs`, which stays in the list).
- **Deviation:** `CREDS_LOG_LEVEL` lowers freely but never raises the floor above Information — first capped at
  Warning (consultation point 1), then at Information after CodeRabbit on #201 showed a Warning floor dropping the
  start and exit lines this epic exists for; the first CI run caught the same thing in the busy-refusal test.
- The human `[creds-for-devs] …` sentences of the SERVING paths go through the logger at Warning/Error (they keep
  their words; the console prefix becomes `[time LVL] creds-relay:`); the one-shot paths keep the plain stderr line
  and write no file, as §5.1 says.
- A fourth .NET test project, `src_service_defaults/tests`, run by `ci-clients` (Linux and macOS), Sonar and both
  release legs. The process-test helper lives there and is LINKED into the mcp and cli test projects.
- §7.2: +1.20 MiB (`creds-mcp`) / +1.25 MiB (`creds`), about 1–9 ms on the first response — Serilog kept.
- Release smoke: each published `creds-mcp` serves one handshake and each `creds` runs `relay-pipe` with nothing
  behind it; both must leave their file with its start line, a real parent pid and its exit line.

**Code round (2026-10-09, same session) — `proceed`**, gating 3 against threshold 5, **4 of 8 reviewers answered**
(codex's four roles; all four gemini roles rate-limited — one vendor's verdict).

| # | Finding | Decision |
|---|---|---|
| 0 | The new module has no `research/module_*.md` | **accepted** — [module_service_defaults.md](../research/module_service_defaults.md), linked from `architecture.md` and `research/README.md` |
| 1 | `HostEnding.Reason` is an untyped string | **accepted** — `ExitReason`, a closed enum written as its camelCase word; a test enumerates the type |
| 2 | One host's retention prunes another app's logs in a shared root | **rejected** — day-folder pruning per root is the rule's shape and the moved `LogRetention`'s; one root has one window, so the shortest window set wins — now stated in the module doc |
| 3 | A client can forge a log line through its name (CR/LF) | **accepted** — client name and method names go through `CallerIdentity.Clean`; RED ("Expected sink.Messages to contain only items matching (Not(message.Contains(…") → GREEN → RED again with the fix removed |
| 4 | A negative `CREDS_LOG_RETENTION_DAYS` is accepted | **rejected** — inaccurate: `NumberStyles.None` refuses a sign, `-3` falls back to 14, pinned by a test |

Own review (a separate reviewer, same time): the parent pid had no test that would notice a broken P/Invoke — the
process tests now assert the host's parent IS the test process, and the release smokes grep a non-zero parent; two
relay methods and `LogRoot.For` were over the complexity ceiling — helpers extracted; the socket path in the relay's
lines is deliberately allowed (it is the relay's address, printed on stdout already) and the docs now say so. It also
named `RelayPipe.PumpAsync` reporting an orderly close when the first copy FAULTED; deferred to E3 at first, and
taken in the final round below once a reviewer raised it independently.

**Final code round (`again`, 2026-10-10) — `proceed`**, gating 1 against threshold 5, **4 of 8 reviewers answered**
(codex; gemini rate-limited).

| # | Finding | Decision |
|---|---|---|
| 0 | `LogLevels.Overrides` is a required positional list, not an init-only `[]` default | **accepted** — `Overrides { get; init; } = []` |
| 1 | The rule's two overrides are forced on every host | **rejected** — they ARE the rule's, for every host (`logging-serilog.md`, *Levels come from configuration*); a host adds its own after them |
| 2 | The WSL start failure logs `e.Message`, which can carry the path `CREDS_MCP_WINDOWS_BINARY` named | **accepted** — the exception's type is logged instead (an environment value is never logged) |
| 3 | relay-pipe logs a FAILED copy as an orderly close | **accepted** — `ExitReason.CopyFailed`; RED ("Expected RelayPipe.EndingOf(broken, broken) to be ExitReason.CopyFailed … but found ExitReason.RelayClosed") → GREEN → RED again with the check removed |

**Pull request #201's automated reviewers.** CodeRabbit: a floor of Warning dropped the start and exit lines →
the ceiling moved to Information (RED → GREEN; the first CI run of the busy-refusal test had failed on exactly that);
the WSL itests' persistent `/tmp` build cache → answered: it predates this PR and E5.S1 replaces it. SonarCloud
(gate failed on new-code coverage 79.6 % < 80, 21 issues): every issue fixed — exceptions passed to catch-block
logs (except the creds-mcp.exe start failure, which logs the exception TYPE from its own method so an
environment-named path stays out), nested ternaries, a parameter name, plan paths read as TODO markers,
`LibraryImport` in the shared library (coai's `AllowUnsafeBlocks` precedent), a generated regex — and relay-pipe's
two no-agent paths now run in-process, where the scanner can see them.

**Checkpoint code round after the rebase onto #202 (`again`, 2026-10-10) — `proceed`**, gating 3 against threshold
5, **4 of 8 reviewers answered** (codex; gemini rate-limited).

| # | Finding | Decision |
|---|---|---|
| 0 | The process-test helper has no path that kills the child on a timeout | **accepted** — `HostProcess.KillOnDispose`, used by every process test: the child's tree is killed, by its own handle, if the test leaves it running |
| 1 | The message filter is added by mutating the options' collection | **accepted** — the filter is part of `McpServerOptions` as constructed |
| 2 | The unwritable-log fallback prints the configured root and the error on stderr | **rejected** — stderr only, never the file; the server's moved, unchanged sentence; a directory the person configured is the one thing that makes it actionable, and a filesystem location is the class of value the plan already allows (the relay's socket path) |
| 3 | The mcp release smoke has no time bound on macOS | **accepted** — `timeout`, else `gtimeout`, else perl's `alarm` before `exec` |

**E4.S1 plan round (2026-10-09, session `addfcdf4`, branch `fix/e4-gone-request-authorises-nothing`) — `proceed`**,
gating 2 against threshold 6, **1 of 2 reviewers answered** (codex; gemini rate-limited, quota reset ~108 h).

| # | Finding | Decision |
|---|---|---|
| 0 | §5.7: a disconnect during an asynchronous `reserve` would spend the grant | **rejected** — `GrantRegistry.reserve` is synchronous (`brokerCall.ts`); the abort check precedes it in the same step. The residue (a one-use call abandoned while queued after its reserve counts one use) matters only for a capped token grant on a one-use entry, and the action never starts |
| 1 | §5.4: POSIX signal registration on Windows hosts | **rejected** — Epic E3's scope, re-gated on its own branch |

The round's operator commands: build without re-splitting; work autonomously; consultants before the person; a cadence
consultation for epics 4–5 before the code round; name the risky pieces (E4.S1, the security fix, was named).

**Cadence consultation for epics 4–5** (codex `gpt-6-astra`, `ec851fc7…`) — three findings, each verified and acted on:
`runBounded` spawned before checking an already-aborted signal (fixed: a refused launch, tested with a marker file); a
rotation's exemption should start at the statement launch, not at generation (fixed: `finishOnceStarted` + `startGate`);
the folder PIN box outlived the request (fixed: the signal cancels its token). Its transport question was answered by
measurement (`requestLife.test.ts`, port and pipe, four shapes) and a cross-process leg (level 8 of `creds-mcp-itest.cjs`).

**E4.S1 code round 1 (2026-10-09, session `addfcdf4`) — `proceed`**, gating 3 against threshold 5, **4 of 8 reviewers
answered** (codex's four roles; gemini's four rate-limited, quota reset ~95 h — the verdict is one vendor's).

| # | Finding | Decision |
|---|---|---|
| 0 | `sshUseActions.test.ts`: the touched `CTX` fixture still cast `as never` | **accepted** — typed as `UseActionContext` |
| 1 | `brokerWorld.ts`: the `settle` stub read its arguments through a tuple cast | **accepted** — the real signature |
| 2 | `creds-mcp-itest.cjs`: the new leg is over 50 lines | **accepted** — the window and the binary moved into two helpers |
| 3 | a queued one-use call whose client left had already spent a use of a capped grant | **accepted** — rejected in the plan round as low-impact, raised a third time with a concrete consequence (a capped grant refusing a live call after fewer calls had run). The use is now counted at the action boundary; RED first: *"the second of two allowed calls was refused: … reached its limit of 2 calls"*, green after |

**E4.S1 code round 2 (2026-10-09, `again`) — `proceed`**, gating 3 against threshold 5, **4 of 8 reviewers answered**
(gemini rate-limited again).

| # | Finding | Decision |
|---|---|---|
| 0 | `sharedPrompt.ts` mutates its waiter `Set` and prompt `Map` | **rejected** — `SharedPrompts` is a stateful registry, the very `Map` it replaced in `credsAgentServer.ts` (`consenting.set/delete`); this codebase's registries (`GrantRegistry`, `OneUseLane`) hold mutable state by design, and the immutability rule governs data, not a service's own state |
| 1 | `research/architecture.md` does not mention the new cross-module flow | **accepted** — a paragraph on the gate being bound to a live request, with the cross-process half (E2.S3) named |
| 2 | a later request could join an ORPHANED modal that still shows the request that left, and be allowed by a person reading another request's command | **accepted** — an orphaned prompt takes no new waiters; the next request raises its own. RED first (*"the later request joined a modal showing the request that had left"*), green after |

**E4.S1 code round 3 (2026-10-09, `again`) — `proceed`**, gating 2 against threshold 5, **4 of 8 reviewers answered**
(gemini rate-limited). Nothing accepted; the session is closed.

| # | Finding | Decision |
|---|---|---|
| 0 | the immutability rule, re-raised for `sharedPrompt.ts` | **rejected** — no new argument; the rule names its subject (*immutable data*), and `stillWanted()` must see a waiter leave synchronously, which copy-on-write would break |
| 1 | `ConsentOutcome` lives in `brokerMcpDoor.ts` | **rejected** — that is the `vscode`-free module holding the door contract; `brokerConsent.ts` imports `vscode` and takes the type only |
| 2 | a client leaving while the consent memory is written leaves the grant allowed | **rejected** — the Allow was given to a live request (checked at the answer, no await before `remember`); only the MCP door remembers, and it mints a grant per call that is never handed out; the request's action still does not run |

**Risk consultation for E4.S1** (codex `gpt-6-astra`, `bb3ab088…`), named as risky because it is the consent path of a
credential broker — each point verified, then acted on:

- the agent's SSH terminal dropped `ctx.signal`, and `connectEntity` awaits the credential lookup before opening it, so
  a client gone in there still got an authenticated terminal — **fixed**: `ConnectOptions.startGate`, two tests, watched
  red without the check;
- the race between the modal resolving and `stillWanted()` holds — **pinned** by a same-tick unit test;
- a token allowed by a live waiter stays allowed after another detached, as the modal promises — **pinned** by a later
  call on the token that runs without a dialog;
- `AbortSignal.any` per call keeps a reference on the window's signal in Node 20 — **fixed** by passing the signals as
  a list (no composite).

Own review (a subagent reading the diff in context, the gate's other half): no high-confidence defect; two of its low
notes were taken — an action that throws after its client left is now journalled `ABANDONED` rather than `internal`
(test watched red without it), and the folder routes got their own abandoned test.

### Epic E2 — the server ends when its client is gone (branch `feat/e2-server-ends-with-its-client`)

**Plan round (2026-10-10, session `5cc39dba`) — `proceed`**, gating 2 against threshold 6, **1 of 2 reviewers
answered** (codex; gemini failed to authenticate — one vendor's verdict, not a panel's).

| # | Finding | Decision |
|---|---|---|
| 0 | §5.8 builds the WSL version check as a shell command a quoted path could break out of, with no bound | **accepted** — §5.8 now runs `wsl -d <distro> -e <path> --version` with the path and the flag as separate arguments, bounded by a timeout that kills the tree (E4 builds it) |
| 1 | §3.1 promises to remove an abandoned modal, §3.3 makes it optional | **rejected** — outside E2, and rejected on the same argument in E1's plan round: §3.3 is the owner's open decision, E4 ships (a), (b) only on the owner's word, and §13 cannot close before the owner decides |

The round's operator commands, applied: build the epic as one unit without re-splitting; work autonomously
(RED → GREEN → RED again for every fix, docs with every change, every test suite before the PR, the PR process
end to end); questions to the question consultant before the person.

**What shipped, and where it differs from §5.2, §5.3, §5.9 and §10:**

- **The fixture is a fresh capture, not the 2026-10-09 shim log** — that log recorded method names only. A
  transparent shim between `claude -p` (Claude Code **2.1.289**, native Windows) and `creds-mcp` recorded the four
  client lines verbatim on 2026-10-10: `server/discover` (a version probe), `subscriptions/listen`,
  `server/discover`, `tools/list` — the 2.1.295 sequence plus the probe
  ([RESULTS](../research/RESULTS_wsl_bridge_orphans.md), *The fixture*).
- **`ShutdownSignals` and `ParentWatch` live in `src_service_defaults`**, not in `src_mcp` and not in E3's
  `ChildLifetime`: the server needs them now, the pump and the relay need them in E3, and one copy is the reuse
  rule (cadence consultation, point 5). E3's `ChildLifetime` composes them rather than re-implementing either.
- **`ExitReason` gained `Signalled` and `ParentGone`.** A deadline exit keeps the reason that began the shutdown
  in its exit line; a Warning line before it says the deadline passed (no separate reason word).
- **The Windows parent is read when serving starts, not first thing in `Main`** — a few milliseconds later; the
  start-time comparison is what makes the timing irrelevant (a reused pid is caught either way).
- **`Program.ServeOnAsync(transport, …)`** takes the transport, so the whole server runs in-process over pipes in a
  test (`ServeOnTests`) — the coverage tool sees only in-process code (the E1 lesson).
- **`IsOurBrokerAsync` propagates the caller's cancellation** instead of reading it as "not our window" (it used to
  swallow every `TaskCanceledException`), and `Windows.PostToAsync` is the walk over already-found endpoints.
- **Observed, not planned:** with the run token alone and no per-tool token, the 5 s deadline already ended the
  process — the E2.S3 test therefore asserts the connection closes BEFORE `drain + deadline` and that the log has
  no "did not stop within" line, which is what tells a cancelled call from a killed process.

**Tests, red first.** E2.S1: *"Expected exited to be True because creds-mcp must exit within 10 s of stdin EOF with a
subscriptions/listen open, but it is still running, but found False"* → green; break-it (`ServeOnAsync` back to a
bare `await server.RunAsync()`) red again. E2.S3: *"Expected closedAt.Elapsed to be less than 6s because the cancelled
call closes its connection, it does not wait for the process to die, but found 6s, 30ms"* → green; break-it
(`creds_exec`'s delegate drops the token) red again. E2.S4: *"Expected exited to be True because creds-mcp must exit
once its parent is gone, but it is still running, but found False"* → green; break-it (the watch always off) red
again. Suites: mcp 126, service defaults 55, cli 133, broker 127, server 809.

**Code round (2026-10-10, same session) — `proceed`**, gating 1 against threshold 5, **4 of 8 reviewers answered**
(codex's four roles; all four gemini roles rate-limited — one vendor's verdict).

| # | Finding | Decision |
|---|---|---|
| 0 | The parent-watch process test launches through `cmd /c` / `sh -c` despite "exe + argv, never a shell string" | **rejected** — the intermediary IS the subject of E2.S4 as the plan states it; it is launched as exe + argv (`ProcessStartInfo.ArgumentList`), the `sh -c` script is a constant and the binary path travels as `$0`, never interpolated into a command string, and every wait is bounded with the child killed by its own handle on dispose |
| 1 | No `research/module_mcp.md` describes the new serving lifetime | **rejected** — there is no `module_mcp.md`: the MCP server is documented in `architecture.md`, which gained *How long a `creds-mcp` lives* (diagram, exit codes, cancellation, parent watch, `--version`), and the shared primitives are in `module_service_defaults.md` |
| 2 | A signal during the end-of-stream drain is reported as a client close, exit 0 | **accepted** — the task that ends the drain decides the ending: a signal gives 128 + n, a lost parent `parentGone`; RED (*"Expected … to be HostEnding … 130, Signalled"*, two tests) → GREEN → RED again with the reassignment removed |

Own review (a separate reviewer, same time), all verified and taken: (1) the same drain finding; (2) the deadline
did not cover closing the transport — `ServeOnAsync` now owns the transport and disposes it inside the run, under
the deadline; RED (*a transport that hangs while closing — "System.TimeoutException: The operation has timed out"*,
the forced exit never came) → GREEN → RED again with the disposal moved out — and `HostRun.End` writes one exit
line per run, since the deadline and a normal return can meet (RED: *"to contain a single item, but found
{"exited: code 143 …", "exited: code 0 …"}"* → GREEN → RED again); (3) the real-parent test skips a runner started
by init (a container entrypoint) instead of failing there; (4) `ParentWatch` reads its cancellation token once,
so a dispose between two ticks cannot raise `ObjectDisposedException` in a discarded task (a race, no
deterministic test); (5) `ParentWatch.Attach` split under the complexity ceiling.

**Final code round (`again`, 2026-10-10) — `proceed`**, gating 1 against threshold 5, **4 of 8 reviewers answered**
(codex; gemini rate-limited).

| # | Finding | Decision |
|---|---|---|
| 0 | The deadline is armed only after `CancelAsync` returns, so a cancellation callback that blocks keeps it from ever existing | **accepted** — the timer is created before the cancel; RED (*a callback that never returns — "System.TimeoutException: The operation has timed out"*, no forced exit) → GREEN → RED again with the order reversed |

**Pull request #211's automated reviewers.** CodeRabbit: rate-limited (no review; skipped by the owner's standing
decision). SonarCloud (gate failed on new-code coverage 79.5 % < 80, 4 issues): every issue fixed — an awaited
`WriteLineAsync` for `--version`, an assertion-less test given its assertions, `BrokerClient.Bounded` takes the token
last, and `UseTools.RotateAsync` takes a `Rotation` record instead of eight parameters. Coverage: the read walk
became `Windows.ReadFromAsync` and is driven against the stub window in-process, the grant and bearer posts are
cancelled in-process, the parent-watch decision runs through `Program.WatchParent(log, env)` in a test, and on
Linux/macOS a real SIGHUP is sent to the test process to prove the handler runs and the default disposition does not.

**Checkpoint code round after the SonarCloud fixes (`again`, 2026-10-10) — `proceed`**, gating 2 against threshold 5,
**4 of 8 reviewers answered** (codex; gemini rate-limited).

| # | Finding | Decision |
|---|---|---|
| 0 | The lifetime flow has no scenario-harness test | **rejected** — it has one, in the shape `scenario-tests.md` names first: the C# suite drives the BUILT binary over its real transport (stdio JSON-RPC) with a real client's captured session, in CI on Linux and macOS (`ServerEndsWithClientTests`, `ToolCancellationTests`, `ParentWatchProcessTests`), and `module_tests.md` names them; the same flow across the real WSL bridge is E5.S1's node itest, as §10 orders |
| 1 | `--version` reads "no answer" and "an empty answer" as the same state | **accepted** — three words: `older than --version, or no answer` (null: a usage error or a timeout), `answered without a version` (empty), the version itself; RED (*"Expected Program.WindowsHalfAnswer(stdout) to be … but they differ"*, three cases) → GREEN → RED again with the empty case folded back |
| 2 | `--version` inside WSL holds this build's line until the Windows half answers | **accepted** — `WriteVersionAsync` writes and flushes this build's line before the probe starts; the test holds the probe open and reads the first line (written against the new seam, so its teeth were proven by break-it: the probe moved first → red) |

**Final code round (`again`, 2026-10-10) — `proceed`**, gating 1 against threshold 5, **4 of 8 reviewers answered**
(codex; gemini rate-limited). One finding — `WindowsHalfAnswer` takes `string?` — **rejected**: the null is the
existing contract of the shared `WindowsBridge.CaptureAsync` probe the `--caller` forwarding has used since
2026-09-12, read at exactly one boundary and turned at once into one of three tested words; changing that shared
API is outside E2.

**Checkpoint code round after the rebase onto #205 (`again`, 2026-10-10) — `proceed`**, gating 1 against threshold
5, **4 of 8 reviewers answered** (codex; gemini rate-limited). The rebase conflicted only in documentation (this
plan's status line and §14, the `todo/README.md` row); E4.S1's record and behaviour are kept.

| # | Finding | Decision |
|---|---|---|
| 0 | `src_mcp` has no `research/module_*.md` of its own (raised a second time, now as blocking) | **accepted** — reversing the code round's rejection: the knowledge-base rule asks for a module doc per module, and the server had only paragraphs in `architecture.md`. [module_mcp.md](../research/module_mcp.md) now holds its purpose, diagram, entities, entry points, lifetime, dependencies and tests, linked from `architecture.md`'s module map and `research/README.md` |

**PR #211's automated reviewers.** CodeRabbit (it reviewed this time) raised two README sentences, both accurate and
fixed: the kill switch is for a launcher that starts `creds-mcp` as a child and exits (an `exec`ing one is replaced
by it), and `--version` checks the executable that ran, so an install is checked by the path the client's config
names. **Pre-merge checkpoint round (`again`) — `proceed`**, gating 1 against threshold 5, 4 of 12 reviewers
answered (codex; gemini rate-limited, the local engine misconfigured): the shell intermediary of the parent-watch
test raised again — **rejected** again, on the code round's reason (the plan's own E2.S4 test, exe + argv, nothing
interpolated).

### Story E4.S3 — a gone request starts no VPN (branch `fix/e4s3-gone-request-starts-no-vpn`)

**E4.S3 plan round (2026-10-10, session `a516fb69`, branch `fix/e4s3-gone-request-starts-no-vpn`) — `proceed`**,
gating 2 against threshold 6, **1 of 2 reviewers answered** (codex; gemini rate-limited).

| # | Finding | Decision |
|---|---|---|
| 0 | §5.4/§5.6: the relay on Windows would depend on POSIX signal registration | **rejected** — `creds relay` refuses to run on Windows (`AgentRelay.RunAsync`, the `IsWindows` guard); it runs inside WSL. Epic E3's scope, re-gated on its own branch |
| 1 | §8: retention has no test that old logs are pruned | **rejected** — inaccurate: E1 shipped `LoggingSinkTests.Retention_*` (old, current and non-date folders, the disabled sweep, the on-disk prune) |

**E4.S3 code round 1 (2026-10-10, same session) — `proceed`**, gating 3 against threshold 5, **4 of 12 reviewers
answered** (codex's four roles; gemini's four rate-limited, the local engine's four misconfigured — one vendor's verdict).

| # | Finding | Decision |
|---|---|---|
| 0 | `brokerAbandoned.test.ts`: the VPN fixture is cast `as never` | **accepted** — `vpnAction` now takes `VpnUseDeps` (what it reads, nothing more); the broker and unit fixtures are typed |
| 1 | `sshUseActions.test.ts`: the new terminal test casts its fixture `as never` | **rejected** — it uses the file's one fixture helper `deps()`, cast at all ten call sites; typing it means narrowing `SshUseDeps.storage` from the `StorageManager` class across the exec and terminal paths, outside this story. Recorded as a follow-up |
| 2 | a request abandoned at OpenVPN Connect's question or the install offer leaves its config on disk | **accepted** — the config is written last (*As built*, above). RED first: *"the VPN config was left on disk for an import the request never reached"*, *"the VPN config was written with no launcher to read it"*; green after; red again with the old `vpnRun.ts` restored |

Break-it for the story: every gate check reverted one at a time — 17 of 17 went red with the real symptom (e.g.
*"the stored VPN config was written for a request whose client had gone"*, *"a step ran after the client had gone"*,
*"the installer ran for a request whose client had gone"*).

**E4.S3 checkpoint round after the rebase onto #211 (`again`, 2026-10-10) — `proceed`**, gating 2 against threshold 5,
**4 of 12 reviewers answered** (codex; gemini rate-limited, the local engine misconfigured). The rebase conflicted only
in this plan's status line and §14; E2's record is kept above.

| # | Finding | Decision |
|---|---|---|
| 0 | `sshUseActions.test.ts`: the fixture cast `as never` (raised again) | **rejected** — no new argument: the file's one `deps()` helper, cast at all ten call sites; a follow-up |
| 1 | the VPN flow has no scenario test and no `module_tests.md` entry | **accepted as the rule allows** — catalogued in [module_tests.md](../research/module_tests.md) with every covering test, and the scenario-harness leg recorded as NOT covered with its reason: the only harness that could reach it stubs `vscode` with terminals that record nothing, and no test may start a real tunnel or installer |
| 2 | `notStarted()` assigns `error.name` after construction | **accepted** — `RequestEndedError`, its `name` part of the instance; a refactor with no behaviour to watch red — the existing `AbortError` assertions hold it |
| 3 | the `extension.ts` line handing the gate to `runVpn` is held by no test | **accepted** — `vpnRun.agentVpnOpener`, tested; written against the new seam, so its teeth were proven by break-it (the gate dropped → *"the agent opener started a VPN for a request whose client had gone"*) |
| 4 | a step that finishes after its request has gone still asks the person to *Continue* | **accepted** — `settle` reads the gate first; RED (*"the person was asked to continue a chain nobody waits for"*) → GREEN → RED again with the check removed |

Own review (a separate reviewer reading the final code, the gate's other half): no high-confidence defect — a gate check
found between every await and the next effect, the reorder costing the person's path nothing it relied on, the
`ABANDONED`/refusal mapping consistent, complexity within 4. Taken: `sshConnect.ts` kept a private copy of
`requestGone` — now the shared one. Recorded, not taken: the two open-tail items above. Answered: the stop test is
caught by `runVpn`'s entry check, and `sendToVpnTerminal`'s own check is held by the OpenVPN Connect test (break-it
#14); `configFor`'s last check is belt-and-braces now that `settle` reads the gate after every step.

### Epic E4, story S2 — a stale WSL install says so (branch `feat/e4s2-stale-wsl-install-says-so`)

**Question consultation before the plan round** (`85327e0e`, codex `gpt-6-astra`, one of one row answered): which
executable the check may run when the extension cannot see the client's config. Its answer — record the copied
block's two paths per distribution and replay them, report an unrecorded distribution as such, keep a timeout
`unknown` rather than `older` — was verified against `wslMcpInstall.ts` and `wslProcess.ts` and is the design block
of §5.8.

**Plan round (2026-10-10, session `07bee33e`) — `proceed`**, gating 2 against threshold 6, **1 of 3 reviewers
answered** (codex; gemini rate-limited, quota reset ~89 h; the local engine misconfigured — "model is required").

| # | Finding | Decision |
|---|---|---|
| 0 | §5.7/§9 promise a gone request runs nothing, but the VPN start is not gated | **rejected** — outside E4.S2: §5.7's recorded open tail, closed by its own story on its own branch (PR #212, re-gated there) |
| 1 | §5.8 treats copying a block as proof the client uses its paths | **accepted** — the check and every message are worded as verifying the block this extension last copied, never the client's config; a "pending until confirmed" state was not added, since the paste cannot be observed |

The round's operator commands, applied: build the story as one unit without re-splitting; work autonomously
(RED → GREEN → RED again, docs with the change, every suite before the PR, the PR process end to end); questions to
the question consultant before the person.

**Tests, red first.** Before the code existed, the new suites failed for the missing feature: the panel test with
*"credSshManager.checkWslMcpInstall is not contributed"* and *"the check has no panel button — the palette would be
its only way in"*, the verdict and orchestration suites with `staleVerdict` / `runWslOutcome` not defined. Green
after: the 4 new and widened suites, 71 tests. Break-it, each fix removed from the compiled code and the suite run
again: the running-distribution filter removed → *"a STOPPED distribution is never probed at activation"* red
(*"a stopped distribution was asked, which starts its VM"*); the 24-hour clock removed → *"at most once a day"* and
*"per distribution"* red; the Windows half left unjudged → four verdict tests red, *"an older WINDOWS half is older
even when the Linux half is current"* first; a missing version read as current → four red; the panel button
removed from the manifest → two red. Full extension suite: 5531 tests, 5527 pass, 0 fail, 4 skipped.

**Code round (2026-10-10, same session) — `proceed`**, gating 3 against threshold 5, **4 of 12 reviewers answered**
(codex's four roles; gemini rate-limited, the local engine misconfigured — one vendor's verdict).

| # | Finding | Decision |
|---|---|---|
| 0 | The flow has no scenario test and `module_tests.md` does not name it | **accepted in part** — `module_tests.md` now names the flow, what stands in for a harness and its exact limit, and the one read-only manual run against the real bridge; **the scenario leg itself is not added here**: the only harness that can drive it is the manual WSL itest, which deletes and rebuilds a `/tmp` tree inside the distribution and is what E5.S1 rewrites with run-unique directories — the leg belongs to that rewrite |
| 1 | The per-distribution maps are written as whole-map read-modify-write | **rejected** — within one window the read and the write are one synchronous step and a `Memento` reflects an `update` immediately, so two installs cannot interleave; across two windows the loss is one record, which degrades to the explicit *not recorded* path whose remedy (Update) restores it; the same whole-map shape holds the CLI aliases (`ALIAS_KEY`) |
| 2 | The bounded run buffers unlimited stdout until the deadline | **accepted** — `OUTPUT_CAP_BYTES` (64 KiB) kept, the rest read and dropped; RED (*"kept 4194321 bytes of an endless answer"*) → GREEN → RED again with the cap removed |
| 3 | A distribution named `constructor`/`toString` reads an inherited member as an install | **accepted** — own-property reads for all three maps; RED (*"TypeError: Cannot read properties of undefined (reading 'startsWith')"*) → GREEN → RED again, plus the same for the daily clock |
| 4 | The post-install probe can look like a hung install | **accepted** — it runs under a progress notification (UI only; no unit test can observe it) |
| 5 | Activation probes distributions serially | **rejected** — deliberate: one `wsl.exe` at a time at activation, each bounded at 15 s, fire-and-forget off the activation path; the recorded set is the distributions a person installed into through this extension, one or two in practice |

Own review (a separate reviewer, same time): no high-confidence defect; its minor note that `offerStale` is not
awaited at two call sites, so a failing Update or dismissal would surface as an unhandled rejection, was taken — the
choice is applied under a `try` that shows the error.

**Final code round (`again`, 2026-10-10) — `proceed`**, gating 5 against threshold 5, **4 of 12 reviewers answered**
(codex; gemini rate-limited, the local engine misconfigured). Nothing accepted.

| # | Finding | Decision |
|---|---|---|
| 0–3 | The German, Spanish, Russian and Ukrainian help sentences break the English-only text rule | **rejected** — the built-in help is localized by design (the README's language switch; every article in five languages; the owner's decision of 2026-10-09); the rule governs chrome, and every label inside the sentences stays English |
| 4 | No scenario test for the flow (re-raised) | **rejected** — no new argument; the only harness able to drive it deletes and rebuilds a tree inside the distribution, which this story may not do; the leg belongs to E5.S1's rewrite, and `module_tests.md` states the gap |
| 5 | Whole-map writes across two windows (re-raised) | **rejected** — on the first round's reasons |
| 6 | Activation probes serially without showing progress | **rejected** — a background reminder nobody waits on; each stale result is reported as its probe finishes |

**Pull request #213's automated reviewers.** CodeRabbit: reviewed, no actionable comments. SonarCloud (gate failed on
new-code coverage 76.4 % < 80, 4 issues), all four fixed and the coverage raised: what the person is shown is now
decided by a pure `noticeFor` (the dialog code only shows it), and the window's half — the command, Update, the
dismissal, the post-install notice, the install-first redirect — runs in-process under the `vscode` stub with
`wsl.exe` stood in for (`wslMcpCheckHost.test.ts`, written against code that already passed, so its teeth were proven
by break-it: the install record removed → two red; the no-running guard removed → *"with no distribution running the
command says so and probes nothing"* red; Update offered after an install → red). `await` inside the activation loop
(three issues, S9382): the due distributions are now asked side by side — this reverses the code round's rejection of
finding 5; the stamp's read-modify-write has no await inside it, so two cannot interleave. The backtracking pattern
for the Windows-half line (S8786) became string steps, and the version pattern too; RED with the old pattern put back
(*"a hostile Windows-half line is read in linear time"*, 1384 ms against a 1 s bound) → GREEN.

**Pre-merge checkpoint round (`again`, 2026-10-10) — `proceed`**, gating 1 against threshold 5, **all 4 reviewers
answered** (codex). The four help-language findings were raised again and discounted; rejected again, and the conflict
between the shared rule *User-facing text is English* and the five-language help goes to the owner. The whole-map
writes were raised a third time and rejected on the same reasons. Taken: **a failed `wsl -l --running -q` is no
longer read as "no distribution is running"**. `listRunning` keeps a failure apart from an empty answer, and the
command says it could not list. RED (the host test showed *"No WSL distribution is running…"* for a failed listing)
→ GREEN → RED again with the check removed.

**Final pre-merge round (`again`, 2026-10-10) — `proceed`**, gating 1 against threshold 5, **all 4 reviewers
answered** (codex). Nothing taken. The help-language conflict was raised again and goes to the owner. The whole-map
writes were raised a fourth time and rejected. The stamp before the probe is deliberate (a hung distribution is not
asked again on every reload), and the cost is one day's reminder after a crash mid-probe. One prompt per stale
distribution was rejected: the recorded set is one or two distributions, and each notice names its own.

### Epic E3 — the bridge and the relay stop what they started (branch `fix/e3-bridge-and-relay-stop-their-children`)

**Plan round (2026-10-10, session `36622fa5`) — `proceed`**, gating 1 against threshold 6, **1 of 3 reviewers
answered** (codex `gpt-6-luna`; gemini rate-limited, reset ~89 h; the local engine named no model — one vendor's
verdict, not a panel's).

| # | Finding | Decision |
|---|---|---|
| 0 | E3 does not carry the `CopyFailed` outcome for relay stream faults | **accepted** in part — `relay-pipe`'s own exit line already says `copyFailed` (E1's final code round, finding 3); what was still true is the RELAY's per-connection line, which read a faulted copy as "ssh closed". `CarryConnectionAsync` returns a typed `ConnectionEnding` with `CopyFailed` and the exception, logged; a test injects a fault in each direction |

The round's operator commands, applied: build the epic as one unit without re-splitting; work autonomously
(RED → GREEN → RED again, docs with every change, every suite before the PR, the PR end to end); consultants before
the person. The cadence consultation for epics 1–3 was already closed in E1; no risk item was named for E3.

**What shipped, and where it differs from §5.4–§5.6:** the *As built* blocks under each section — the helper lives
in `src_service_defaults`, the grace is 2 s, a signalled pump session gets none, `CREDS_RELAYED_FROM_WSL` now crosses
the bridge through `WSLENV`, and the relay's connection line distinguishes a failed copy.

**Tests, red first — the fixes removed behind their API (`ShutdownSignals` left unregistered, the hang-up bound
infinite, the relay only disposing its child), the process tests run on Linux, then the fixes restored:**

- E3.S2, a signal to the pump (SIGINT, SIGTERM, SIGHUP, the built binary on the pump path, no WSL): *"Expected
  (Posix.GoneWithinAsync(child, Bound, ct)) to be True because the Windows half (pid 227656) must be stopped by the
  pump, but it is still running, but found False"* → green → red again.
- E3.S2, a hang-up on a child that never closes its stdout: *"Expected (HostProcess.ExitsWithinAsync(host, within,
  ct)) to be True because the pump must end within 00:00:11.999 of the client hanging up, but it is still running,
  but found False"* → green → red again.
- E3.S3, twenty connections: *"Expected alive to be empty because every relay-pipe child must be gone once its
  connection ended, but these still run, but found at least one item {227771}"* → green → red again.
- E3.S3, SIGTERM and SIGHUP to the relay: *"Expected File.Exists(socket) to be False because the relay removes its
  socket on the way out — a corpse is what the next relay has to dial first, but found True"* → green → red again.
- E3.S1's `ChildLifetimeTests` (17) and the in-process twins (`WslPumpTests` +4, `WslPumpRunTests` 7,
  `AgentRelayConnectionTests` 5, `WslInteropTests` +5) were written against the new seams; `§7.1` and the end-to-end
  runs are in the RESULTS record.

Suites after E3 on Windows: service defaults 74, mcp 151 (4 skipped — the pump host tests, Unix only), cli 141
(4 skipped — the relay host tests), broker 132. On Linux, inside WSL: the same, plus five E2/E1 process tests that
fail INSIDE a distribution on `origin/main` too (`VersionTests`, `ServerEndsWithClientTests`, `ServingLogTests`,
`ToolCancellationTests`, `RelayLogTests`): there the built binary takes the pump path and `creds relay-pipe` is
relayed to Windows — they are written for CI's plain Linux, where they pass. The extension: `npm run typecheck`
clean, `npm test` 5,487 (4 skipped, 0 failed); the server 809.

**E3.S4 — the real bridge, before the PR** (the RESULTS record, *The fix, measured*): §7.1 answered — the Native
AOT wrapper (published inside the distribution with gcc as the linker) handles SIGINT, SIGTERM and SIGHUP from a
node parent after a `SigIgn` check, exits 130/143/129 with its exit line, and the stubborn child is gone. The two
WSL harnesses run by hand against this build: `creds-mcp-wsl-itest.cjs` — all checks passed; `wsl-agent-relay-itest.cjs`
— all checks passed, including *disposing the manager takes it down — nothing outlives the window*, which is the
relay's SIGHUP path. Five real `claude -p` sessions inside WSL on the new bridge: **0 Windows survivors in each**, the
wrapper's exit line written every time; three more with a pre-E2 Windows half still in defect A: 0, 0, 0. Measured on
the way: Claude Code 2.1.296's exit is SIGINT, SIGTERM +100 ms, SIGKILL ~+450 ms — which is why a signalled session
gets no grace (§5.5 *As built*).

**Code round 1 (2026-10-10, session `36622fa5`, after the rebase onto #212) — `proceed`**, gating 1 against threshold
5, **4 of 12 reviewers answered** (codex's four roles; gemini's four rate-limited, the local engine's four without a
model — one vendor's verdict).

| # | Finding | Decision |
|---|---|---|
| 0 | A child tracked while `StopAllAsync` is snapshotting is missed: `Track` read `Lazy.IsValueCreated`, false until the factory returns | **accepted** — a `_stopping` flag set under the lock before the snapshot; `Track` reads it. The deterministic RED (a stdin close that blocks inside the snapshot: *"the condition did not hold within 00:00:10"* — the late child never stopped) also showed each stop ran its first step under the lock, so a blocking close stalled every other `Track` and stop: each stop now runs off the lock. With that, the window the test held open no longer exists and the test pins the behaviour rather than reproduces the race; what remains is the lock-to-publish gap, closed by the flag by construction |
| 1 | The six-second drain after a hang-up is invisible in the wrapper's log | **accepted** — *the client hung up; waiting up to 6 s for the Windows half's last reply* when the wait begins; RED (the line absent) → GREEN → RED again |

Own review (a separate reviewer reading the final files, the gate's other half): no high-confidence defect; its lower
notes, each verified: (1) `StopAllAsync` returned while a connection's own stop of the same child was still in its
grace, so the relay could remove its socket and exit first — **taken**: one stop per child, shared, and every stop in
flight awaited; RED (*"Expected stopAll.IsCompleted to be False because a stop still in flight is part of stopping
everything, but found True"*) → GREEN → RED again. (2) The same snapshot race as finding 0. (3) `Process.ExitCode`
throws for a child that could not be ended, which ended the pump without its exit line and read as a missing Windows
binary — **taken**: `WslPump.ExitCodeOf` answers 1 with a Warning; RED → GREEN → RED again. (4) A signal arriving
during the 2 s / 5 s settle of a child that already saw end-of-stream or closed its stdout does not shorten that wait —
**recorded, not taken**: the child in that state is leaving; the client's kill of the wrapper then leaves at most that
window, after which the Windows half ends by E2's end-of-stream rule; cutting it short would need a second kill path
beside the one shared stop. (5) An access-denied kill was logged at Debug as "already ended" — **taken**: a child that
has not exited after a refused or completed kill is a Warning; RED (*"to have an item matching m.Contains("child 777 is
still running")"*) → GREEN.

**Final code round (`again`, 2026-10-10) — `proceed`**, gating 2 against threshold 5, **all 4 reviewers answered**
(codex's four roles; the panel had no gemini and no local engine this time).

| # | Finding | Decision |
|---|---|---|
| 0 | `ChildLifetime` mutates its own state despite the immutability rule | **rejected** — the rule names its subject, immutable DATA, and keeps `class` for stateful services, which a registry of a process's live children is (as `ParentWatch`, `ShutdownSignals`, `GrantRegistry`, `SharedPrompts`); E4.S1's rounds 2 and 3 rejected the same finding on the same reasoning; the data here (`HostEnding`, `ConnectionEnding`) is records |
| 1 | `WslPump.ExitCodeOf` needs a concrete `Process` beside the `IManagedChild` | **accepted** — `IManagedChild.ExitCode`; the pump reads the ending through the interface; a fake with a code of its own pins it |
| 2 | A child started by a connection task after `StopAllAsync`'s snapshot is stopped by its `Track` but not awaited, so the relay could remove its socket and exit first | **accepted as a hardening** — `StopAllAsync` returns only when no stop is in flight (a late `Track`'s included); RED (*"Expected stopAll.IsCompleted to be False because the late child's stop is still in flight … but found True"*) → GREEN → RED again. The interleaving as described cannot occur in the relay today — `ServeConnectionAsync` starts and tracks the child synchronously inside the accept loop's iteration, before the loop can observe the token and return — but the invariant should not depend on that ordering |

**Checkpoint round after those two (`again`, 2026-10-10) — `proceed`**, gating 2 against threshold 5, **all 4
reviewers answered** (codex's four roles).

| # | Finding | Decision |
|---|---|---|
| 0 | `Track(Process)` accepts a process this host did not start, which the lifetime would then close and kill | **accepted** — `ManagedProcess` refuses a `Process` not started by this host with a redirected stdin (one looked up by pid has no readable `StartInfo`; .NET throws), with an `ArgumentException` naming the rule; RED (*"Expected a <System.ArgumentException> to be thrown, but no exception was thrown"* for `Process.GetProcessById(Environment.ProcessId)`) → GREEN |
| 1 | `Track` started a late child's stop after releasing the lock, a gap `InFlightAsync` could look through | **accepted** — the stop is started under the same (reentrant) lock, so it is registered before any empty snapshot; structural — the gap is between a lock release and the next statement and cannot be held open by a test; the late-stop test pins the behaviour |
| 2 | A person's `CREDS_RELAYED_FROM_WSL/u` entry would keep the marker from crossing | **accepted** — `WslEnvFor` drops any entry of theirs for the variable, flags included, and appends the bare name once; RED (two theory rows) → GREEN |

**Last checkpoint round before the pull request (`again`, 2026-10-10) — `proceed`**, gating 1 against threshold 5,
**all 4 reviewers answered** (codex's four roles). One finding — only a process started *by the lifetime* should be
trackable — **rejected**: §9's rule is "only what THIS PROCESS started", which readable `StartInfo` plus a redirected
stdin proves; the lifetime cannot start processes (the binary and the interop launch are `WindowsBridge`'s, in a project
`src_service_defaults` cannot reference), and `Track` is the owner's explicit act one line after `StartPiped` in both
hosts.

**Pull request #214's automated reviewers.** CodeRabbit: rate-limited (no review; skipped by the owner's standing
decision). SonarCloud (gate failed on the reliability rating; new-code coverage 95.3 %): every issue judged by
behaviour and fixed — the relay's two copies take the lifetime's token (the data path, not the cleanup: a signal now
ends a held connection as `Interrupted`; RED *"The operation has timed out"* → GREEN → RED again with the token
removed), the `ProcessExit` hook's wait names `CancellationToken.None` with its reason (that wait IS the cleanup the
fired token must not cut short), the pump's three Information lines in one block became two (the session's ending and
the child's exit code on one line), `PumpAsync` takes its token last, `Posix` uses `LibraryImport` and discards the
kill's result on purpose, a test helper returns the concrete array.
