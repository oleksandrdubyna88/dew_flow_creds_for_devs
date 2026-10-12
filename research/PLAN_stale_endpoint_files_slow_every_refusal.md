# PLAN — stale endpoint files slow every refusal

> Status: **IMPLEMENTED, 2026-10-11.** Measured first (§3): the 2 s per stale file was a .NET connect to a closed
> loopback port on Windows waiting out the SYN retransmissions — not WSL, not a listening port, not the reads. Shipped:
> `LoopbackConnect` (refused at once, as libuv does — a design item the first draft did not have), `Endpoints.Live` /
> `ReadLive` (a provably-gone pid is never dialled) and the extension's sweep at activation. **Deviations:** the sweep is
> called from the `CredsAgentServer` constructor, not from a line in `extension.ts` (a size ratchet refuses that file's
> growth, and the announcement's owner is the better home); the CLI keeps `Read` for its *no window* check and walks
> `Live` of it, so no sentence or exit code changed; the parallel walk and a client deleting files were not built (§4.4,
> §4.5). Result on the reporting machine (§10): a fake-key refusal over the real 35 files, 68.42 s → 0.04–0.19 s on
> Windows and 69.53 s → 0.35–0.40 s through WSL. **Released 2026-10-12** (§12): cli 0.4.2, mcp 0.10.2, extension 1.14.1;
> with the RELEASED cli 0.4.2 the same refusal takes 0.05–0.07 s on Windows and 0.21–0.24 s through WSL. The released
> cli 0.4.2 and mcp 0.10.2 were installed on the reporting machine the same day (Windows and WSL, the old files kept
> beside them), and a WSL tool reading its keys through `creds config -` read them again.
>
> Scope: `src_broker_client/src/BrokerClient.cs` (the connect every probe makes), `src_broker_client/src/LoopbackConnect.cs`,
> `src_broker_client/src/Endpoints.cs` (a pid that is provably gone), `src_cli/src/Program.cs` and `src_mcp/src/Windows.cs`
> (the five walks read through it), `src_vs_code/src/cliEndpoint.ts` and `src_vs_code/src/credsAgentServer.ts` (the sweep
> that was designed and never wired), their tests, and the measuring script `src_vs_code/scripts/endpoint-probe-timing.cjs`.
>
> Related docs: [module_extension.md](module_extension.md) (*An announcement per window*),
> [module_mcp.md](module_mcp.md) (`Windows`), [PLAN_headless_cli.md](PLAN_headless_cli.md)
> (where the endpoint file was designed), [PLAN_config_key_off_the_command_line.md](PLAN_config_key_off_the_command_line.md)
> (the `creds config` walk this was found under), [PLAN_wsl_bridge_outlives_its_client.md](../todo/PLAN_wsl_bridge_outlives_its_client.md)
> (why windows leave files behind: a window that crashes or is killed runs no dispose).

## 1. The symptom (the owner's machine, 2026-10-10 and 2026-10-11)

`creds config -` with a key no window holds takes about **67 seconds** to say so. The endpoint directory holds
**34–35** `window-*.json` files, all but one for windows that are gone; the walk probes each one, and each probe costs
about **2 s**. Every alias call, every `creds ls` and every MCP read walk pay the same, and the refusal for an unknown
key is reached only after the LAST file — so the cost is paid in full exactly on the failure path, where a person is
waiting to be told no.

2026-10-11 made it urgent: inside WSL the released cli 0.4.0 refused a fake key after **68.7 s** (exit 92, *"no running VS
Code window holds that config key"*), and a WSL consumer that reads its keys through `creds config -` under its own
timeout now fails with *"creds config timed out"* — so a WSL agent session gets no vendor keys at all. The same read on
Windows was reported fast at 18:09 UTC.

## 2. What exists today — verified 2026-10-11 on `main` (`cbf0da42`)

- **The announcement.** `credsAgentServer.ts:377-389` writes `<globalStorage>/endpoints/window-<pid>.json` on every
  announce (port, socket, agent socket, `startedAt` = the time of THIS announce); `removeLocalTraces` (`:727-740`)
  removes it on an orderly dispose, and only then. A window that crashed, was killed, or lost power leaves its file
  (`cliEndpoint.ts:88-105`).
- **The sweep that was designed and not wired.** `cliEndpoint.staleEndpoints(endpoints, isAlive)`
  (`cliEndpoint.ts:136-142`, *"so a sweep can remove them"*) has a unit test (`cliEndpoint.test.ts:99`) and **no
  production caller**. The module's own doc (`:13-17`) says *"a reader checks whether that pid is still alive instead
  of trusting the file's existence"* — and no reader does. `readEndpoints` (`:115-125`) returns every file that parses.
- **The reader.** `Endpoints.Read` (`src_broker_client/src/Endpoints.cs:71-92`) returns every announcement that
  parses, newest first; its doc (`:27-30`): *"a stale entry is the normal case … What decides is the unauthenticated
  health probe"*. `RelayPipe` (`src_cli/src/RelayPipe.cs:83`) also reads it, for agent addresses, not for a probe walk.
- **The probe.** `BrokerClient.IsOurBrokerAsync` (`BrokerClient.cs:74-93`): one GET to the health route, bounded by
  `HealthTimeout = TimeSpan.FromSeconds(2)` (`:26`); a timeout or a refused connect reads as *false* — not ours — and
  the walk moves on. The handler is built in `BrokerClient.Create` (`:46-66`) with a `ConnectCallback` only for the
  Remote-SSH socket.
- **The walks**, sequential, newest first, one probe per file: the CLI's alias call (`src_cli/src/Program.cs:183-219`),
  its config read (`:302-334`) and `creds ls` (`:353-378`); the MCP server's `Windows.ReadAllAsync`
  (`src_mcp/src/Windows.cs:44-54`, walking in `ReadFromAsync` `:57-71`) and `PostAsync` (`:110-120`, walking in
  `PostToAsync` `:127-143`). All five obtain their list from `Endpoints.Read(Endpoints.DirectoryHere())`.
- **Under WSL** the Linux `creds config` hands the key to the Windows half on stdin (`ConfigRelay`,
  `src_cli/src/ConfigRelay.cs:93-117`); the Windows `creds.exe` reads the Windows directory and probes on Windows — the
  files, the pids and the probes all live on the Windows side.

## 3. The measurement — why 2 s per file (2026-10-11, the reporting machine)

Measured with a FAKE key only, and without touching a single endpoint file (read-only).

**The walk, end to end:**

| What | Files | Result | Time |
|---|---|---|---|
| Windows `creds.exe config -` (the installed build), fake key | 35 | exit 92, *no running VS Code window holds that config key* | **68.42 s** |
| WSL `~/.local/bin/creds config -` (released cli 0.4.0) → Windows `creds.exe`, fake key | 35 | exit 92, same sentence | **69.53 s** |

So **WSL is not the cause**: the relay adds about one second; the 68 s are spent inside the Windows binary. *"Fast on
Windows at 18:09"* was a read with the REAL key, and the window holding it had re-announced at 18:09:55 UTC — its file
was the newest, so the newest-first walk found it on the first probe and never reached a dead file. With a fake key
the walk visits every file, on both sides.

**Per file, split by `src_vs_code/scripts/endpoint-probe-timing.cjs`** (Node, the same 35 files, read-only):

| Part | Result | Time |
|---|---|---|
| list + read + parse | 35 files | 0.4 ms list, 0.2–0.9 ms per file |
| pid | 33 `gone` (ESRCH), 1 `alive(EPERM)` (pid reused by a protected process), 1 `alive` (the live window) | — |
| raw TCP connect (Node) | 34 `refused`, 1 `open` | **0–3 ms** each, 32 ms in total |
| `GET /v1/health` (Node, 2 s bound) | 34 `ECONNREFUSED`, 1 `200 creds-for-devs-agent` | 0–5 ms each, 98 ms in total |

**The same connect from .NET** (PowerShell 7.6 on .NET, `Socket.ConnectAsync` and `HttpClient.GetAsync` to three of the
dead ports): **2041–2163 ms** each.

So against the candidates in the first version of this plan: (a) *the port is listening again* — no, every dead port
refuses; (b) *a filter drops* — no, Node is refused in a millisecond on the same ports; (d) *the directory or the reads*
— no, under a millisecond. It is **(c), the connect itself, but not the dual-stack race**: on Windows a TCP connect that
meets an RST is retried — the stack retransmits the SYN — and only after those retries does the connect fail, about
2 s. Node does not pay it because libuv sets `SIO_TCP_INITIAL_RTO` with no SYN retransmissions on every loopback
connect ("fail instantly if the target port on the localhost is not reachable, instead of waiting for 2s", libuv
`src/win/tcp.c`). .NET does not, so every .NET client pays ~2 s per dead file, which the 2 s health bound then caps.
Linux and macOS refuse a loopback connect at once; the defect is Windows-only — which is every walk under WSL too.

**The fix in one call, measured the same way:** the same .NET socket with `SIO_TCP_INITIAL_RTO` set to
`{Rtt = unspecified, MaxSynRetransmissions = none}` before the connect: **1–17 ms** per dead port instead of 2 s.

## 4. Design — chosen by §3

1. **A loopback connect that fails fast on Windows (NEW, the fix of the measured cause).** `BrokerClient.Create` gets a
   `ConnectCallback` for the port transport (`LoopbackConnect.ConnectAsync`, a new file in `src_broker_client`): it
   creates the socket, and on Windows, when the address is loopback, applies `SIO_TCP_INITIAL_RTO`
   (`0x98000011`, `TCP_INITIAL_RTO_PARAMETERS { USHORT Rtt = 0xFFFF; UCHAR MaxSynRetransmissions = 0xFE }`) before
   connecting — exactly what libuv does. The ioctl is best effort: Windows older than 10.0.16299 does not know it, and a
   failure leaves the connect as it is today (slow, still correct). It changes nothing else: no timeout, no address, no
   transport; the Remote-SSH unix-socket callback stays as it is. Every walk — the CLI's three and the MCP's two — gets it
   through the one factory, so no walk is edited for it.
2. **The extension sweeps at activation** — `sweepStaleEndpoints(storageDir, ownPid, isAlive)` in `cliEndpoint.ts`:
   `readEndpoints` → `staleEndpoints(…, isAlive)` → `removeEndpoint` for each, never its own file; called once at
   activation from the `CredsAgentServer` constructor — the class that writes and removes this window's own
   announcement, built once in `activate` (`extension.ts:519`). *Deviation from the first draft, which named a line in
   `extension.ts` beside `purgeMaterializedKeys`: that file sits under a size ratchet (`.size-baseline.json`, 1025
   lines) that refuses any growth, and the owner of the announcement is the better home anyway.* `isAlive` is
   `pidIsAlive(pid)` = `process.kill(pid, 0)` on the extension host, which shares the files' pid namespace (the extension
   is `ui`-kind, so in a WSL or Remote-SSH window it still runs on the local machine). **`EPERM` means alive**, not dead:
   the probe throws it for a live process of another user or session (measured: one of the 35 pids), and only `ESRCH`
   says the pid is gone; any other error is read as alive too. A sweep never throws and a directory that cannot be read
   is not an error. Cost: one directory read per activation. Limit: a pid reused by an unrelated process keeps that one
   file until the probe — today's behaviour, no worse.
3. **The clients skip a provably-dead window before dialling** — `Endpoints.ReadLive(directory)`: `Read`, minus the
   announcements whose pid is provably gone (`Endpoints.PidIsGone`: `Process.GetProcessById` throws `ArgumentException`
   = not running; every other answer — running, access denied, anything unexpected — is NOT gone, so the probe still
   decides). The MCP's two walks read through `ReadLive`; the CLI's three keep `Read` for their *no window is running*
   check and walk `Endpoints.Live(...)` of it, so every refusal keeps its sentence and its exit code (a config read over
   dead windows still answers 92, *no running VS Code window holds that config key*, and the Remote-SSH socket entry,
   pid 0, is never filtered). `Read` itself is unchanged (`RelayPipe` and the MCP's `Announced()` diagnostic keep every
   file). Only "gone" is used — no start-time comparison against `startedAt`,
   because a clock step between a window's start and its announce would make a live window look like a reused pid, and
   a false "gone" is a refused read. Covers the time between a crash and the next activation of any window, and Linux /
   macOS, where (1) is not needed.
4. **Probe in parallel with one short budget — not done.** §3 shows no listening-but-silent port: every dead port
   refuses, so with (1) a dead file costs milliseconds and a parallel walk would buy nothing but a reshaped walk in five
   places. If a future measurement shows silent listeners, this comes back with its own plan.
5. **A client that proved a window dead removes its file — not done.** The file is the extension's; a CLI deleting it
   would be a second writer in a directory one process owns. Default no, the owner's call; the sweep in (2) is the
   honest owner. No test or measurement in this plan deletes or moves an existing endpoint file: every test builds its
   own temporary directory.

The probe stays the deciding check in every case: (1) makes a refusal cheap, (3) skips only what cannot be live, and a
reused pid or a reused port is still caught by the health GET exactly as today.

## 5. Growth budget

Today the directory grows by one file per window that did not dispose, and nothing retires any of them — 35 on the
owner's machine. With (2) the count is bounded by the windows that crashed since the last activation of any window —
a bound that holds only until that next activation: a person who keeps one window open for weeks while others crash
still collects a file per crash until any window activates again (plan gate, 2026-10-11). That is accepted, not fixed
with a timer, because with (1) and (3) such a file costs a `GetProcessById` and no dial; the sweep is about keeping the
directory tidy, not about the walk's time. The sweep deletes only files whose pid is provably gone (never its own,
never a live one). Each
skipped or refused file costs (3) a `GetProcessById` (sub-millisecond) or (1) a refused connect (milliseconds).

## 6. Build order

1. §3: the timing script and the end-to-end timings, recorded above. **Done.**
2. **RED → GREEN the fast-fail connect (4.1):** a broker-client test that probes N closed loopback ports (each a
   `TcpListener` started and stopped by the test) and bounds the total: RED on Windows with the real symptom (≈2 s per
   port), GREEN with `LoopbackConnect`; then RED again with the callback removed from `Create`. Plus a test that a live
   listener is still found through the new callback (the probe still answers `true`).
3. **RED → GREEN the dead-pid skip (4.3):** `EndpointsTests.cs` — `ReadLive` drops a file whose pid belongs to a
   process the test started and that has exited, keeps this process's own file, and leaves the directory untouched (same
   files, same bytes). Then a walk test in `src_mcp/tests` over the `StubBroker` (the `ToolCancellationTests.cs`
   pattern): an endpoint directory with the live stub plus N dead-pid files whose port is a counting listener; the walk
   returns the stub's body and the counting listener saw **zero** connections. RED again with `ReadLive` swapped back to
   `Read`.
4. **RED → GREEN the sweep (4.2):** `cliEndpoint.test.ts` — a dead pid's file is removed, the own pid's and a live
   pid's are kept, `EPERM` keeps the file, an unreadable directory is not an error; `pidIsAlive` maps `ESRCH` → false,
   `EPERM` → true. An activation seam test (`brokerEndpointSweep.test.ts`) builds the REAL broker over a storage folder
   holding an exited process's announcement and this process's own, and requires only the own one to remain. RED again
   with the constructor's call removed.
5. The real machine, **before merge — a merge gate** (plan gate, 2026-10-11): the same fake-key `creds config -` timing
   with binaries BUILT (published, AOT) from the candidate commit, run from a run-unique folder (never replacing the
   installed binaries), on Windows and inside WSL (the built Linux `creds` with `CREDS_WINDOWS_BINARY` naming the built
   `creds.exe`), against the owner's real 35 files, which stay untouched. Under 3 s on both sides, or the PR does not
   merge. Repeated after merge with the merged commit's build.
6. Docs: `module_extension.md` (*An announcement per window*), `module_mcp.md` (`Windows`), `architecture.md`'s
   discovery paragraph; the extension CHANGELOG (*Unreleased*); this plan promoted to `research/` with its results.

## 7. Test plan

| Behaviour | Build step | Layer |
|---|---|---|
| N closed loopback ports cost far less than N × 2 s to probe (Windows: RED before, GREEN after) | 2 | C# `BrokerClientConnectTests.cs` (new), real sockets |
| a live listener still passes the probe through the new connect | 2 | C# same file |
| `ReadLive` drops a file whose pid has exited, keeps its own pid, never touches the directory | 3 | C# `EndpointsTests.cs` |
| a walk over N dead-pid files makes zero connections to their ports and still reaches the live window | 3 | C# `src_mcp/tests/StaleWindowsTests.cs` (new), `StubBroker` |
| the BUILT `creds` — config read, alias call, `ls` — over N dead-pid files: zero connections, the same exit code and sentence | 3 | C# `src_cli/tests/StaleWindowsProcessTests.cs` (new), a process test |
| a crashed window's file is removed at the next activation; this window's own and a live one are kept; `EPERM` keeps it; an unreadable directory is no error | 4 | TS `cliEndpoint.test.ts` |
| building the broker (once, in `activate`) sweeps with its own pid | 4 | TS `brokerEndpointSweep.test.ts`, the real constructor |
| the refusal sentences are unchanged | — | existing CLI tests |
| a refusal for an unknown key with the real 35 files takes < 3 s, Windows and WSL | 5 | manual, recorded here |

Run as the repository says: test EXECUTABLES one after another (never `dotnet test`), `npm test` in `src_vs_code`, all
under `.claude/rules/shared/tools/low-priority.mjs`, builds with `-m:4 --disable-build-servers`.

## 8. Not doing, and why

- **A TTL on the file** (delete when `startedAt` is old): a window open for a week is live; age says nothing.
- **Trusting the pid instead of the probe**: the probe stays the decision — a reused pid or a reused port is exactly
  what it exists to catch; the pid check only skips the files that cannot possibly be live.
- **A start-time check against `startedAt`**: a clock step could make a live window look reused (§4.3).
- **Changing `HealthTimeout`**: a slow but live window would read as gone; the number is not the defect.
- **The parallel walk and a client deleting files**: §4.4 and §4.5.

## 9. Definition of Done

- [x] §3 measured on the reporting machine and recorded in this plan; the fix chosen by those numbers.
- [x] A refusal for an unknown key, with the real 35 files in the directory, takes under 3 s on that machine — on
      Windows and through WSL — with binaries built from the candidate commit BEFORE merge (§10).
- [x] The same timing repeated with binaries built from the merged commit, and with the released cli 0.4.2 (§12).
- [x] No client deletes an endpoint file; the extension's sweep never deletes a live window's file or its own.
- [x] Each change shown RED with the real symptom, GREEN, and RED again with the fix removed.
- [x] `module_extension.md`, `module_mcp.md`, `architecture.md` updated; the extension CHANGELOG has the sweep;
      `todo/README.md` and `research/README.md` match; `node .claude/rules/shared/tools/plan-lifecycle.mjs` clean; the
      gate's plan and code rounds recorded.
- [x] Released: the cli, mcp and extension patch releases that carry it, each asset's `.sha256` checked (§12).

## 10. Results — the fix on the reporting machine (2026-10-11, before merge)

The merge gate of §6.5, with binaries built from the candidate commit `0a3830f4` into a run-unique folder (the installed
binaries untouched), a FAKE key, and the owner's real endpoint folder: 35 files before, 35 after every run.

| What | Before (§3) | After |
|---|---|---|
| Windows: built `creds.exe config -` (Native AOT), three runs | 68.42 s | **0.190 s, 0.043 s, 0.048 s** — exit 92, the same sentence |
| WSL: built Linux `creds config -` → built `creds.exe` (`CREDS_WINDOWS_BINARY`), three runs | 69.53 s | **0.396 s, 0.349 s, 0.391 s** — exit 92, the same sentence |
| WSL: the installed Linux `creds` 0.4.0 → built `creds.exe` | — | **0.220 s** |

The Linux half was built framework-dependent rather than Native AOT (the distribution has no `clang`); it only relays, and
the last row — the installed AOT Linux half with the new Windows half — shows the whole cost was the Windows half's.

**Each change on its own**, from the tests: `BrokerClientConnectTests` saw five closed loopback ports take 10,048 ms with
the slowest at 2.015 s before `LoopbackConnect`, and pass after; the walk tests (`StaleWindowsTests`,
`StaleWindowsProcessTests`) saw six announcements of exited processes cost six connections before `Endpoints.Live`, and
zero after — on the built `creds` for the config read, an alias call and `creds ls`, with exit codes and sentences unchanged.

## 11. Review record

- **Plan round** (1 reviewer, `proceed`, 2 findings, both accepted): the real-machine timing became a merge gate run
  BEFORE merge (§6.5, §10), and §5 now says the growth bound holds only until the next activation.
- **Code round** (4 of 4 reviewers, `proceed`, 3 minor findings, all accepted and each fixed red-first):
  `module_extension.md` named `activate` as the sweep's caller when it is the broker constructor; `BrokerClient` had a
  public constructor taking any `HttpClient`, which would skip `LoopbackConnect` — it is private now, and a test holds
  that `Create` is the only way in; and the sweep removed `window-<pid>.json` by pid alone, so a new window that took the
  dead pid and announced between the read and the removal would have lost its file — it now removes a file only while
  it still holds the announcement judged stale (`stillAnnounced`), and a test makes the new window announce inside the
  sweep's own liveness check.
- **Own review** (one reviewer): no finding at high confidence; its low-confidence note — the first timed probe also
  paid the JIT and handler start-up — is taken: the timing test probes one closed port untimed first.
- **Final code round** (`again`, 4 of 4 reviewers, `proceed`, 2 minor findings, both rejected with reasons):
  (a) a replacement written between `stillAnnounced` and the unlink — not reachable: the two calls run back to back in
  one synchronous turn, a window announces only seconds after its process starts, and a process that already existed
  at the liveness check would have kept the file; closing those microseconds would need a lock or a per-generation
  file name, a change to the `window-<pid>.json` contract the C# readers and the itests share. CodeRabbit raised the
  same point on the pull request and got the same answer. (b) "skip the timing test where the option is unsupported" —
  rejected: on such a Windows the product really is slow, and a skipped guard would turn that symptom green.

## 12. Release record (2026-10-12)

The fix merged as #229 (`ccc817ce`) and shipped in three patch releases, cut one at a time:

| Release | Release PR | Checked |
|---|---|---|
| `cli-v0.4.2` | #230 | `creds-0.4.2-win-x64.zip` and `-linux-x64.tar.gz` match their `.sha256` (win-x64: `dda31b40…511c25d`) |
| `mcp-v0.10.2` | #231 | `creds-mcp-0.10.2-win-x64.zip` matches its `.sha256` (`86fd9e70…bb0a37`); `creds-mcp.exe --version` prints `creds-mcp 0.10.2` |
| `extension-v1.14.1` | #228, after the CHANGELOG heading PR #233 | the release page shows the *1.14.1* section; the `.vsix` says 1.14.1 (sha256 `f06ea135…25a5f1`; this release type ships no `.sha256` file) |

**The same fake-key refusal, real endpoint folder (37 files by then, untouched by every run):**

| Binaries | Windows | WSL |
|---|---|---|
| built from the merged commit `ccc817ce` | 0.563 / 0.116 / 0.144 s | 1.06 / 1.15 / 1.39 s (a busier machine; the Linux half JIT-built) |
| the RELEASED cli 0.4.2 (downloaded, checksum-verified, run from a run-unique folder) | 0.066 / 0.051 / 0.045 s | 0.229 / 0.209 / 0.243 s |

All exit 92 with the unchanged sentence. The coordinating session measured the released cli 0.4.2 on its own as well: about
0.2 s on Windows and 0.28 s through WSL. Before the fix: 68.42 s and 69.53 s.
