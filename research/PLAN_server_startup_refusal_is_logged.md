# PLAN — a server that refuses to start says why in its log, and exits with a defined code

> Status: **IMPLEMENTED, 2026-10-12.** Deviations and the open tail: §7. Scope: `src_minimalapi_server/src/Program.cs`, a new
> `src_minimalapi_server/src/StartupGuards.cs`, `src_service_defaults/src/HostRun.cs` + `ExitReason.cs`,
> the server's tests, `.github/workflows/docker.yml` (a refusal smoke step on the AOT image),
> `research/module_server.md`, `research/module_service_defaults.md`, `research/module_tests.md`.
>
> Related docs: [module_server.md](module_server.md),
> [module_service_defaults.md](module_service_defaults.md), the family logging rule
> `.claude/rules/shared/common/logging-serilog.md`.

## 1. Symptom (measured 2026-10-11 and 2026-10-12)

The published image `cred-vault-server:0.11.0`, run in its production shape (read-only root, tmpfs
`/tmp`, `cap-drop ALL`, `no-new-privileges`, Docker volumes for `/data` and `/logs`), with a
configuration a startup guard refuses:

| refusal | console | per-run log file | exit code |
|---|---|---|---|
| no authentication scheme | `Unhandled exception. System.InvalidOperationException: No authentication scheme configured — …` | only the `runtime:` line | **139** (AOT) |
| data dir on 9p (a network filesystem) | the same shape | **0 bytes** | **139** (AOT) |

The JIT build on Windows, measured on this branch's base (`96a22348`), no auth scheme: exit
`0xE0434352` (the CLR's unhandled-exception code), the log file holds only the `runtime:` line.

An operator after a deploy reads the file (`deploy/`, `POST_DEPLOY.md`), and the file does not say
why the server is not running. Exit 139 reads as a segmentation fault — a crash — when the server in
fact made a deliberate decision.

## 2. Cause (verified)

- The five guards `throw new InvalidOperationException(...)` from top-level code:
  `Program.cs:95-101` (data dir on a network filesystem), `Program.cs:109-124` (data dir not
  writable), `Program.cs:447-473` (no auth scheme, empty domain list, HMAC key shorter than 32 bytes —
  these three run AFTER `builder.Build()` at `Program.cs:363`).
- The only `try/catch/finally` with `Log.Fatal` + `Log.CloseAndFlush()` wraps `app.Run()` alone
  (`Program.cs:1830-1846`). Nothing catches a guard, so the exception is unhandled: it never reaches
  Serilog, the file sink is never flushed, and the runtime ends the process with its crash code.
- The family rule (`logging-serilog.md`, "Failures during startup must still be logged") asks for the
  logger configured before the host is built — done at `Program.cs:35` — **and** the run wrapped in
  `try/catch/finally` with `Log.CloseAndFlush()`. The second half is missing for the startup phase.

## 3. Fix

### 3.1 The shared half — `src_service_defaults`

- `ExitReason.StartupRefused` — a startup check refused this configuration or environment.
- `HostRun.RefusedExitCode = 78` — `EX_CONFIG` from `sysexits.h`, the conventional "configuration
  error" code. A defined, documented number that no runtime crash produces (139 = SIGSEGV,
  134 = SIGABRT, `0xE0434352` on Windows). It is a contract an operator's script may test, so the
  tests pin the literal.
- `HostRun.Refused(ILogger log, Exception refusal)` (static — a refusal happens before there is a run
  to time): logs ONE line at **Fatal**, carrying the exception (the doctrine's "exception first"), in
  the shape of the existing exit line so `grep exited:` finds it:
  `exited: code 78, reason startupRefused: <the guard's message>`; returns 78. The caller flushes.

Reuse checked first (`reuse-first.md`): `HostRun.Crash` logs Fatal but is an instance method of a run
that has started, and its line says `crashed` — the wrong word for a decision. `HostRun.End` writes an
Information exit line. Neither fits; widening `HostRun` with one static member keeps one owner of the
exit-line vocabulary.

### 3.2 The server — one catch around all five guards

- New `StartupGuards.cs`: `StartupGuards.Check(StartupSettings, Func<string?> mounts)` runs the five
  guards and throws `InvalidOperationException` with **the same messages, byte for byte** (the
  unwritable one keeps its inner exception). **Order, chosen on purpose:** the three pure configuration
  checks first (no auth scheme, empty domain list, short HMAC key), then the network-filesystem check,
  then the writable probe last — so a configuration that is refused anyway never touches the disk (the
  probe creates the directory and writes a file). Today the disk checks run first; the only visible
  difference is which message wins when two things are wrong at once, and a test pins the new order.
- `Program.cs`: the auth configuration reads (`Program.cs:291-302`) move up into the configuration
  section, and the guard call sits where the data-dir guards sit today — **before** `new VaultStore`
  (`Program.cs:130`), which is the reason the writable probe exists. Wrapped in the top-level catch:

  ```csharp
  try { StartupGuards.Check(...); }
  catch (InvalidOperationException refusal)
  {
      var code = HostRun.Refused(Log.Logger, refusal);
      Log.CloseAndFlush();
      return code;
  }
  ```

- The three post-`Build()` guards are removed from `Program.cs:447-473`. They depend only on
  configuration, so running them before `Build()` loses nothing, and it means the server never builds a
  host it is about to refuse.

**Why not one `try` around the whole top-level body.** It would re-indent ~1,500 lines of
`Program.cs`: `dotnet format --verify-no-changes` runs in CI, so the indentation cannot be skipped,
and SonarCloud blames every re-indented line as new — the 18 existing code smells of `Program.cs`
would become new issues of this PR, and the review gate's diff would be whitespace. Moving the guards
to one place gives the same guarantee for every refusal with a diff a reviewer can read.

**Known remainder, out of scope:** an exception that is not a guard's — a malformed number in
`config.GetValue<long>` (`Program.cs:41-90`), a data-dir path the writable probe rejects with an
`ArgumentException` or `NotSupportedException` (the probe catches only `IOException` and
`UnauthorizedAccessException`), a fault reading `/proc/mounts`, a fault in `Build()` — is still
unhandled before `app.Run()`. It is a different class (a framework conversion message, not one of ours) and needs the
same re-indent to catch at the top. Recorded in this plan's tail; not built here.

The existing `app.Run()` catch stays as it is: it already logs Fatal and flushes, and a fault while
serving is a crash, not a refusal.

### 3.3 The other hosts that share `src_service_defaults`

Checked by reading: `creds-mcp` (`src_mcp/src/Program.cs:144-160`), `creds relay`
(`src_cli/src/AgentRelay.cs:192-210`) and `creds relay-pipe` (`src_cli/src/RelayPipe.cs:62-78`) create
the logger first, wrap the whole run in `try { … } catch (Exception e) { run.Crash(e); throw; }`, and
dispose the logger with `using var` inside an `async` method (so it is flushed while the exception
unwinds). Their refusals — usage, tool missing, socket path too long, busy, listen failed, no agent
announced — are RETURNED as contract exit codes (`BrokerContract.Exit`), never thrown. So they do not
have this gap: a refusal is logged and has a defined code; an unexpected fault is logged at Fatal and
stays a crash by design. No change there.

### 3.4 In-process tests change what they observe

`StartupGuardTests` drives `Program` through `WebApplicationFactory`. Today it asserts that startup
**throws**; after the fix the entry point returns 78 instead, which `WebApplicationFactory` cannot see
(before `Build()` it reports "the entry point exited without ever building an IHost"). The tests keep
their cases and their message assertions, and read the run's **log file** instead (a per-test
`Logging__Directory`, set and restored by `VaultServer` like every other variable): the refusal must be
there at Fatal; an accepted configuration must leave no Fatal line. The file is read with
`FileShare.ReadWrite | FileShare.Delete` after the server is disposed. `Log.Logger` is static and the
refusal closes it; the next test's host rebuilds it, which is safe because every server test runs in
the one non-parallel `ServerCollection`. That is the operator's view, which is what this plan is about.

## 4. Build order

1. RED: `StartupRefusalProcessTests` (server tests) — starts the BUILT server binary
   (`HostProcess`, linked from `src_service_defaults/tests/Support`, the way `CredsMcp.Tests` does) with
   (a) no auth scheme and (b) a UNC data dir (`//nas.invalid/vault`, refused by `DataDirCheck` before
   any disk is touched — the pre-`Build()` case whose file was empty). Asserts exit code **78** and a
   `FTL` line in the run's log file carrying the guard's message. Run it, watch it fail with the real
   symptom.
   The server test project already references the server project, so the built `CredVaultServer(.exe)`
   apphost and its runtime config are in the test output folder (checked on this branch).
2. `ExitReason.StartupRefused`, `HostRun.RefusedExitCode`, `HostRun.Refused` + unit tests in
   `HostRunTests`.
3. `StartupGuards.cs` + its unit tests, the `Program.cs` move and the catch.
4. `StartupGuardTests` read the log file.
5. GREEN; then revert the `Program.cs` catch only, watch the process test go RED again, restore.
6. A refusal smoke step in `.github/workflows/docker.yml`, after the existing smoke test of the AOT
   image: the same image, production shape, no auth scheme → exit 78 and the Fatal line in `/logs`.
   That workflow runs on every push to `main`, so the AOT guarantee has a recurring check, not only
   the one local run.
7. The local AOT proof (§5, item 6), the docs, the plan promoted.

## 5. Test plan

1. **Process tests (the RED test)** — exit code 78 and the Fatal line, for one post-`Build()` guard
   (no auth scheme) and one pre-`Build()` guard (UNC data dir). JIT build, every CI platform.
2. **`HostRunTests`** — `Refused` logs exactly one Fatal event carrying the exception and the message,
   in the `exited: code 78, reason startupRefused` shape, and returns 78.
3. **`StartupGuardTests`** — every existing case kept; refusals found in the log file at Fatal with
   their message, accepted configurations leave no Fatal line.
4. **`StartupGuards` unit tests** — one case per guard with its exact message; the writable refusal
   carries its inner exception; the order (bad auth + UNC data dir → the auth message, and no data
   directory created).
5. **The whole server suite and the service-defaults suite** — executables, one after another, at
   lowered priority, `-m:4 --disable-build-servers`.
6. **The AOT binary in the production shape** — the image built from this branch
   (`src_minimalapi_server/Dockerfile`), run read-only with tmpfs `/tmp`, `cap-drop ALL`,
   `no-new-privileges`, and Docker VOLUMES (not bind mounts) for `/data` and `/logs`, with no auth
   scheme: exit code 78 and the reason in the volume's log file. The same run against the published
   `0.11.0` image records the "before" (139 and the line-less file). Only this task's own containers
   and volumes, removed by name.
7. **CI** — the `docker.yml` refusal smoke step (build order 6) repeats item 6 on every push to `main`.
8. No HTTP route, status or shape changes, so the `.http` contract suite is not touched.

## 6. Definition of Done

- [ ] A refused startup writes `exited: code 78, reason startupRefused: <message>` at Fatal, with the
      exception, to the per-run file — JIT and AOT — and exits 78.
- [ ] The five guard messages are unchanged.
- [ ] The process test was watched RED (real symptom), GREEN, and RED again with the catch reverted.
- [ ] `creds-mcp` and the CLI checked; the result stated (§3.3).
- [ ] `dotnet build dew_flow_creds_for_devs.slnx -m:4 --disable-build-servers` — 0 warnings; server and
      service-defaults suites green.
- [ ] `module_server.md` (startup guards), `module_service_defaults.md` (the vocabulary) and
      `module_tests.md` (the flow, its coverage and its limits) updated;
      `POST_DEPLOY.md` only if its item 7 wording changes.
- [ ] Plan promoted to `research/` with `IMPLEMENTED <date>`, its deviations and its open tail
      (§3.2's remainder); `plan-lifecycle.mjs` clean; a `research/README.md` row.
- [ ] coai plan and code gates run; own reviewer run in parallel.

## 7. What shipped (2026-10-12)

**Measured, before and after** — the same refusing configurations, the image in its production shape
(read-only root, tmpfs `/tmp`, `cap-drop ALL`, `no-new-privileges`, Docker volumes for `/data` and `/logs`):

| run | exit | the run's log file |
|---|---|---|
| 0.11.0, no auth scheme | **139** | 172 bytes: only the `runtime:` line |
| 0.11.0, data dir on a Docker Desktop bind mount (9p) | **139** | **0 bytes** |
| this branch (AOT image), no auth scheme | **78** | `[… FTL] CredVaultServer: exited: code 78, reason startupRefused: No authentication scheme configured — …` + the exception |
| this branch (AOT image), 9p bind mount | **78** | `… reason startupRefused: DataDir '/data' is on a 9p mount. …` + the exception |
| this branch (AOT image), a root-owned data dir | **78** | `… reason startupRefused: DataDir '/data-ro' is not writable …` + both inner exceptions |
| JIT on Windows, before / after, no auth scheme | `0xE0434352` / **78** | the `runtime:` line only / the Fatal line |

RED → GREEN → RED: `StartupRefusalProcessTests` failed on the old code with *"Expected exitCode to be 78 …
but found -532462766"* and *"Expected log "" to contain "FTL]""* (the UNC case: an empty file); green
after the fix; red again with only the `Program.cs` catch removed.

**Deviations from the plan.**

- `DataDirCheckTests.TheServerRefusesToStartOnANetworkDataDir_UnlessTold` (`OpsTests.cs`) was a fourth
  in-process test that asserted a THROW; it moved to `StartupGuardTests.ADataDirOnANetworkShareIsRefused`,
  read from the log file like the others. It also joined the server collection there — it set the same
  process-wide variables without it.
- The Fatal line names its source (`CredVaultServer`), like every other server line, rather than an empty
  `SourceContext` — `Log.Logger` has none of its own.
- The refusal flushes with `Log.CloseAndFlushAsync()` — the top-level code is already `async`.
- The recurring AOT check (plan gate finding, accepted): a *Smoke-test a refused start* step in
  `docker.yml` runs the built image with no auth scheme and asserts exit 78 and the Fatal line in the
  `/logs` volume. It runs on every push to `main`, not on pull requests — the workflow never builds a
  pull request's image.

**Exceptions, not an `Outcome`, reconciled with the C# doctrine §5** ("expected failures are values";
raised by a code-gate reviewer in both rounds, rejected with this reason). The owner's task prescribed the
shape — catch at the top level, log Fatal *with the exception*, flush, return a code. Two of the five refusals
wrap an infrastructure exception (`IOException` / `UnauthorizedAccessException` from the writable probe), which
§5 says still throws; values for three guards and exceptions for two would be two refusal paths for one
event. A refusal is terminal and happens once per process, and the catch is exactly §5's "catch with the
exception as the first log argument" at the one layer that genuinely ends the process.

- The `docker.yml` refused-start step runs the container DETACHED and waits for it with a 120 s bound
  (code-gate round 2, accepted): a regression that made the refused configuration start serving would
  otherwise hang the job instead of failing it.

**The other hosts** — `creds-mcp`, `creds relay`, `creds relay-pipe`: no change, as §3.3 says. Their
refusals are returned contract codes; an unexpected fault is logged at Fatal through `HostRun.Crash` and
flushed by the `using var` logger in an `async` method before the rethrow.

**Open tail — not built.** Exceptions that are not a guard's still escape before `app.Run()` unlogged,
with the runtime's crash code: a malformed number in a `config.GetValue<…>` read (`Program.cs`'s
configuration section), a data-dir path the writable probe rejects with an `ArgumentException` or
`NotSupportedException`, a fault reading `/proc/mounts`, a fault in `builder.Build()`. Catching them at
the top level needs the whole top-level body inside one `try` — a ~1,500-line re-indent that §3.2 rejected
for this change. Also seen and left alone: in the chiseled image the writable refusal says
*"not writable by uid :"* — `Environment.UserName` is empty where there is no `/etc/passwd`; the guard
messages were kept byte for byte on purpose.
