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
| Unit, extension | `src_vs_code/src/test/*.test.ts`, node:test | 5,607 (5 skipped; 2026-10-11) | logic, in-process, `vscode` stubbed |
| Unit, .NET | `src_minimalapi_server/tests`, `src_cli/tests`, `src_mcp/tests`, `src_broker_client/tests`, `src_service_defaults/tests` — xUnit | 1,351 (2026-10-14, after E6; pass counts, platform-specific process tests skipped off their platform) | server 809, cli 141, mcp 163, broker 157, service defaults 81. The cli and mcp suites include PROCESS tests since E1 of PLAN_wsl_bridge_outlives_its_client: the built binary run with a marker in argv, environment and protocol bodies, its log file grepped for it after positive controls (`ServingLogTests`, `RelayLogTests`; helper `src_service_defaults/tests/Support/HostProcess.cs`, linked into both). E2 added the lifetime ones: the built `creds-mcp` given a captured Claude Code 2.1.289 session start (`src_mcp/tests/fixtures/`) must exit within 10 s of stdin EOF with a `subscriptions/listen` open (`ServerEndsWithClientTests`, positive control the 2025-06-18 handshake); a stub broker holding a POST must see the connection close before `drain + deadline` with no forced exit (`ToolCancellationTests`, `Support/StubBroker.cs`); the server started through `cmd /c` / `sh -c` must exit when that intermediary is killed, and must not when relayed or switched off (`ParentWatchProcessTests`). Each has an in-process twin (`ServeOnTests`, `ServerLifetimeTests`, `ParentWatchTests`) for the coverage tool. E3 added the child holders' tier: the built `creds-mcp` on the pump path against a script standing in for the Windows half — SIGINT, SIGTERM and SIGHUP each end it with 128 + n and the child dead, after a `SigIgn` check from `/proc` (`WslPumpHostTests`); the built `creds relay` serving twenty connections leaves no `relay-pipe` child alive, and SIGTERM or SIGHUP stops a held connection's stubborn child and removes the socket (`AgentRelayHostTests`); both Linux and macOS only, where those halves run. Their in-process twins: `WslPumpTests` and `WslPumpRunTests`, `AgentRelayConnectionTests` (`CarryConnectionAsync` over fakes and the whole relay over a real socket), `ChildLifetimeTests`; the shared helpers (`FakeChild`, `Posix`, `TestStreams`) sit beside `HostProcess` and are linked, not copied. E6 (defect D, 2026-10-14) added, in `WslInteropTests`: the pure `WindowsBridge.WithParentDeath` argv shaping, the pure `ResolveSetpriv`/`GuardStatus` (kill switch, trusted-dir order, the real off-reason) and the pure `BinaryResolves` (path vs bare-name-on-PATH vs missing); and two `src_mcp` process tests on Linux (skipped without `setpriv`): `WslPumpHostTests.A_child_left_STOPPED_and_orphaned_still_dies_with_the_wrapper` (the pump's stubborn child SIGSTOPped, the wrapper SIGKILLed, the child must still die through `setpriv --pdeathsig KILL`) and `ParentDeathLauncherTests` (the thread-scope backstop — a guarded child forked through `StartPiped` on a thread that then exits must outlive it, else the kernel's thread-scoped pdeathsig would kill the Windows half when a pool worker retires; self-calibrating, skipped on a process-scoped kernel), plus the pure `Program.GuardLogLine` naming the real off-reason (`ProgramGuardLogTests`); `Posix` gained `Stop`. The 2026-10-14 pass counts are in this row's head |
| HTTP contract | `http/http-run.mjs` over `http/*.http` | 82 requests, 9 files | the real server over HTTP, with a coverage report that refuses an unlisted route |
| Scenario | `src_vs_code/scripts/*-itest.cjs` | 9 harnesses | a real process, a real socket, a real binary |

## The ten harnesses

Every one is a plain `.cjs` file run by node — no framework — because each starts a real process and
what it needs is control over teardown, not a runner. Nine live in `src_vs_code/scripts/`; the tenth
drives the SERVER binary and lives in the server's tree, so that a server-only change is what re-runs
it. Two of the nine already drive .NET products this way (`creds`, `creds-mcp`) — the harness language
is node throughout because what these need is process control, not a test runner. `npm run itest:<name>` compiles first.

| Harness | Drives | In CI | Verified 2026-09-06 |
|---|---|---|---|
| `src_vs_code/scripts/agent-broker-itest.cjs` | the broker over its own loopback HTTP surface, `vscode` stubbed | **yes** — *Integration test (agent broker)* | pass |
| `src_vs_code/scripts/git-transport-itest.cjs` | the encrypted vault in a real git repository: commit, clone, delete | **yes** — *Integration test (git transport)* | pass |
| `src_vs_code/scripts/creds-cli-itest.cjs` | the real `creds` binary against a live broker | **yes** — *Integration test (creds CLI against the broker)* | pass |
| `src_vs_code/scripts/creds-mcp-itest.cjs` | `creds-mcp` over stdio, the full tool surface, both switch ladders and the quiet path (#95), and — since 2026-09-24 — the caller's TAB TITLE from the C# sender to the TypeScript modal (#136: a fixture home with a registry entry and a transcript; the modal must quote the title and — since 2026-09-24, the owner reversing D4 — the audit line must carry it the same way; skipped on Windows, where `HOME` does not decide the profile folder) | **yes, added 2026-09-06** | pass — **95** checks on Linux (WSL, 2026-09-24), 93 on Windows where the title check is skipped; **111** on Windows (2026-09-30), with the kind-catalogue legs; **116** on Windows (2026-10-09), with level 8 — the real binary killed while its consent modal is open, then Allow: nothing runs, one `ABANDONED` line (E4.S1 of `PLAN_wsl_bridge_outlives_its_client.md`) |
| `src_vs_code/scripts/masked-run-itest.cjs` | a masked run through a real pty, asserting no whole secret appears | **yes, added 2026-09-06** | pass |
| `src_minimalapi_server/scripts/backup-archive-itest.cjs` | the REAL server binary sealing, verifying and opening a backup archive | **yes, added 2026-09-07** — in `ci · server`, on the server's own path filter | pass |
| `src_vs_code/scripts/creds-mcp-wsl-itest.cjs` | the same MCP surface, bridged from inside a WSL distribution; since 2026-10-11 (E5.S1 of `PLAN_wsl_bridge_outlives_its_client.md`) a Claude-Code-shaped client INSIDE the distribution (`wsl-mcp-client.cjs`, the wrapper's real parent) opens the captured session with its held `subscriptions/listen` and ends it six ways — SIGINT, SIGTERM, SIGHUP, a closed stdin, SIGKILL of the wrapper, and (E6/defect D, 2026-10-14) the `/init` interop proxy SIGSTOPped then the wrapper SIGKILLed — and the Windows `creds-mcp.exe` of the run must be alive before each ending (the positive control) and gone within 5 s after it | no — see below | pass — **42** checks (2026-10-11, the final harness; 40 on its first version); 4 of them RED against the pre-E2/E3 build, 10 of 40 on the first version (see *The bridge, proved on the real machine*). E6 added the sixth, `stopped`, ending; its real-bridge run is the manual E6.S2 step, the mechanism measured directly in RESULTS, *Defect D*, and the CI-runnable proof is `WslPumpHostTests.A_child_left_STOPPED_and_orphaned_still_dies_with_the_wrapper` |
| `src_vs_code/scripts/ssh-agent-itest.cjs` | the SSH agent on a named pipe, and which ssh client can reach it; since 2026-09-24 the REAL `SshAgentManager` too, with a signing prompt nobody answers — the real `ssh-keygen -Y sign` must fail within the bound, not hang; since 2026-10-20 (#197 E1.1, section 5, POSIX only) a LIVE login — a real `ssh` against a user-mode `sshd -d` on loopback with a throwaway host key, through the real manager — whose dialog must name *an SSH login* and carry, as a line of its own, *This login is for the server whose host key is ED25519* followed by the fingerprint `ssh-keygen -l -E sha256` prints for that host key (the host-bound request OpenSSH 8.9+ sends). **This live section is pending its first CI run** — it has run only as a local `skip` (no `sshd` on the author's machine); no CI log line of it passing is quoted here yet, and this sentence stays until one is. On a failed login the check's detail carries the last 20 lines of sshd's `-d -e` output. It does **not** prove a login from Windows: that is M1, a real Windows client against a real server, owed by hand. Without `/usr/sbin/sshd` it is a `FAIL` when `CI=true` and a printed `skip` locally; on Windows it prints `skip  live OpenSSH login — POSIX only; M1 covers Windows` | **yes, added 2026-09-11** — the POSIX branch only, see below; the CI job installs `sshd` first (apt with `Acquire::Retries=3`, so a mirror hiccup does not turn the job red) | pass (sections 1–4); section 5 (live OpenSSH login) pending its first CI run |
| `src_vs_code/scripts/wsl-agent-relay-itest.cjs` | `ssh-keygen -Y sign` inside Linux reaching an agent in a Windows process; since 2026-10-11 (E5.S1) also that the relay's Windows children end with their connections — ten `ssh-add -l` leave 0 `creds.exe relay-pipe` of the run and the relay's fd count at its baseline; the relay is stopped by its own pid; the manager's `dispose()` takes down a relay holding a LIVE connection, its relay-pipe on Windows included | no — see below | pass **after repair — see below**; **40** checks (2026-10-11, the final harness; 36 on its first version), 9 of them RED against the pre-E3 build |
| `src_vs_code/scripts/server-transport-itest.cjs` | `ServerTransport` against a RUNNING Cred Vault Server | no — see below | **not run** — needs a server on `127.0.0.1:5113` |

**Why each of the remaining three is not in CI.** *"Not in CI" with a reason is a decision; "not in CI" alone is
a harness rotting* — so each carries one.

- **`creds-mcp-wsl-itest.cjs` and `wsl-agent-relay-itest.cjs`** need a WSL distribution with the .NET
  SDK, node and python3 inside it. The extension job runs on `ubuntu-latest`, where WSL does not exist
  and the thing under test — the Windows↔Linux bridge — has no meaning; the `windows-latest` leg of
  `ci-clients.yml` (E5.S2, 2026-10-11) runs the .NET process tests of the Windows half, not these — a
  hosted Windows runner has no distribution either.
- **`ssh-agent-itest.cjs`** was left out for a real reason, and the reason turned out to argue for
  reading its result narrowly rather than for running nothing. The argument was: on Ubuntu it
  exercises the POSIX branch, while its subject is the Windows named-pipe path and which of the
  several `ssh-add` binaries on a Windows PATH can reach it — so a green there is a pass about the
  branch it does not exist to protect. All true. What it misses is that the script also drives the
  agent PROTOCOL against a REAL `ssh-add` — a key parsed, loaded, listed and signed for — and
  nothing else in CI does that on any platform. **Added 2026-09-11**, with the step's comment saying
  in as many words that the Windows half stays uncovered by it.
- **`server-transport-itest.cjs`** needs a Cred Vault Server running with the Local auth scheme. CI
  states this reason in the workflow itself: adding it would mean building and running the server
  inside the extension's job.

Two were added on the day this file was written, because neither had a reason — only an absence.

**And the leak that made two of them unrunnable by hand is fixed** (`scripts/wslStrays.cjs`, new).
Both WSL harnesses asserted *"nothing outlives the client"* as a GLOBAL question — `ps -eo args |
grep '[c]reds-mcp'` over the whole machine. Measured 2026-09-11: both failed that one check
identically on `main` and on a feature branch.

**And then the processes were looked at, which is the part worth keeping.** They were not debris.
Thirteen of them: six `creds-mcp` servers, each the child of a LIVE Claude Code session running
inside WSL, plus a `creds relay` holding `/run/user/1000/creds-agent.sock` — the runtime path the
extension publishes, not the `/tmp/creds-relay-itest-<pid>.sock` the harness uses. Every one was
somebody's working tool. So the global question was not merely fragile after a bad run: it is red on
a working machine **always**, and the harness was unrunnable by hand for anyone who actually uses
this product. A harness that cannot be run is a harness that rots.

Its own leftovers are a real second failure, and the sweep is for those: a run that failed partway
stopped without taking its processes down, so the next run inherited them.

The question is a DIFFERENCE now — what was alive before this run, against what is alive after —
and a sweep in a `finally` takes down whatever this run started and left, whichever way it ended. A
stray from somebody else's session is neither asserted on nor killed: this run did not start it. The
first check in the relay harness got stronger by the same change, since *"a real relay is running"*
now means ours rather than any.

**And since 2026-10-11 the question is asked by EXECUTABLE PATH, on both sides** (E5.S1 of
[PLAN_wsl_bridge_outlives_its_client.md](PLAN_wsl_bridge_outlives_its_client.md)). Each run
copies the binaries it starts into a directory named for the run — `%LOCALAPPDATA%\creds-itest\creds-itest-<run>\` on Windows (the person's own local application data, never the shared temp directory),
`${XDG_CACHE_HOME:-~/.cache}/creds-itest/<run>/` inside the distribution (`scripts/wslRun.cjs`; the person's own
cache directory rather than `/tmp`, where a predictable name could be pre-created by another local user and the
harness would run their binary — SonarCloud S5443 on the first version) — and a watch is "processes of this
image whose executable lies under this run's directory": `watchWindowsPids` through `Get-CimInstance
Win32_Process`, `watchLinuxPids` through `/proc/<pid>/exe` (`scripts/wslProcs.py`). The Windows side is
watched at all because that is the side the leak was on — every `creds-mcp.exe` and `creds.exe relay-pipe`
the bridge starts is a Windows process, parented to the WSL service and never to the test's `wsl.exe`. A
stop goes by pid through a HELD handle (a `Process` object on Windows, a pidfd inside the distribution),
the path re-read through it immediately before the kill, so a pid reused between the check and the stop
cannot be hit; the pids and the directory reach PowerShell and Python through their environment or argv,
never through a command line. And **nothing is deleted inside the distribution** (a machine rule since an
agent's `wsl.exe` cleanup removed parts of a home directory, 2026-10-07): the Linux build lands in a
directory named by a hash of its inputs, so a stale build is never reused and never removed; sockets and
scratch files are run-unique; each run ends by printing what the cache directory now holds — a few MB per run,
for the person to clear when they like. **And every step inside the distribution is exe +
argv** (`security.md`; E5's code round): `wsl.exe -e bash -l scripts/wslSteps.sh NAME=value... -- <verb> [args]`,
one constant checked-in script whose exports are applied after the login profile and whose every value — a path, a
socket, a file list — is an argv entry; nothing composes shell text from a value, and a harness that cannot run
here throws `skip(...)` so the sweep and the finish still run before it exits 0.

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
| `src_vs_code/scripts/ssh-agent-itest.cjs` | OpenSSH (`ssh-add`, `ssh-keygen`) — built-in on Windows, on PATH elsewhere; CI runs it on Ubuntu | a named pipe or socket freed when the process exits, a `testsToDelete-ait-*` temp dir (key, stub, the managers' storage `m` and `l`) and — only on a run that reaches the live login — a `testsToDelete-sshd-*` dir (host key, `authorized_keys`, `known_hosts`, `sshd_config`). under `-d` sshd neither daemonises nor forks per connection, but its privilege separation and the session still fork children that exit when the connection closes — which is why the run ends the ssh client FIRST, then sshd, by their own pids; each is awaited (5 s bound) and, if it did not exit, killed with SIGKILL and awaited again; only then is the folder removed, and a failure of that removal never replaces the real error |
| `src_vs_code/scripts/creds-mcp-wsl-itest.cjs` | WSL + the .NET SDK, node and python3 inside it | nothing it started — the sweep stops the run's own processes by pid on both sides; `${XDG_CACHE_HOME:-~/.cache}/creds-itest/` (a build per changed set of inputs, a directory per run) stays by design, a few MB each, until the person clears it |
| `src_vs_code/scripts/wsl-agent-relay-itest.cjs` | the same, plus OpenSSH inside it | the same; a run's sockets and scratch files are under its own `…/creds-itest/<run>/` |
| `src_vs_code/scripts/server-transport-itest.cjs` | a Cred Vault Server on `127.0.0.1:5113`, Local auth | nothing of its own |

Every harness carries its own timeout on the child processes it spawns; none of them waits for ever,
and each prints the command that would fix a missing prerequisite instead of hanging on it. Re-running
after a kill is safe for all of them — the two WSL ones included since 2026-10-11, because their sockets
are run-unique: a harness killed outright (so its `finally` never ran) leaves THAT run's relay or wrapper
alive inside the distribution, which the next run neither asserts on nor needs; stop it by its pid.

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

## The bridge, proved on the real machine (2026-10-11, E5 of `PLAN_wsl_bridge_outlives_its_client.md`)

The defects of [RESULTS_wsl_bridge_orphans.md](RESULTS_wsl_bridge_orphans.md) — a server that never exits on
end-of-stream once a `subscriptions/listen` is open, a wrapper that dies from a signal without stopping its Windows
half, a relay that never closes its children's stdin — were each fixed under process tests on Linux CI (E2, E3).
What those cannot say is whether a real Linux process reaching a real Windows process through WSL interop behaves
the same, because the Windows half is in another process table. The two WSL harnesses now say it:

- **`creds-mcp-wsl-itest.cjs`** — a client shaped like Claude Code runs INSIDE the distribution
  (`scripts/wsl-mcp-client.cjs`, spawned by the distribution's node so it is the wrapper's real parent and no
  shell sits between — a bash `&` job starts with SIGINT ignored), sends the captured 2.1.289 session with its held
  listen, and ends it on one word from the Windows side: `SIGINT`, `SIGTERM`, `SIGHUP`, `SIGKILL` (sent by itself,
  as Claude Code does) or `eof` (the wrapper's stdin closed). For each: the session answered, exactly one
  `creds-mcp.exe` of the run alive on Windows (the positive control — a watch that sees nothing would pass every
  time), the wrapper's exit as the plan states it (130 / 143 / 129 / 0 / killed), 0 Windows survivors within 5 s,
  nothing of the run left inside WSL. The thirteen older checks (the vault read through the bridge, a create with
  consent on Windows, `--help` answered without a Windows process) are kept in front of it.
- **`wsl-agent-relay-itest.cjs`** — the relay is a child of the harness (its first stdout line names the socket;
  its stderr's connection lines are the positive control that a relay-pipe was started for each connection); ten
  `ssh-add -l` after a warm-up connection, then 0 `creds.exe relay-pipe` of the run on Windows within 5 s and the
  relay's descriptor count (`wslProcs.py fds`) back at its baseline; the relay stopped by its own pid, gone with
  its socket; then the manager's relay with a connection HELD open by `scripts/wslHoldSocket.py` — one relay-pipe of
  the run alive on Windows — and `manager.dispose()` taking both down within 5 s, socket included.

**Each check has teeth, shown rather than claimed.** Both harnesses were run unchanged from a scratch checkout of
`9494a67c` (E1 merged, E2–E3 not): 4 of 42 and 9 of 40 checks RED on the final harness (10 of 40 and 8 of 36 on its
first version, whose run also caught the old Windows half surviving a SIGHUP), with the defects' own words — *the wrapper
ends with exit code 130 — {"code":null,"signal":"SIGINT"}*, *the wrapper did not end within 20000 ms of eof*, *0
Windows survivors within 5 s — … did not take down: 15284*, *0 new creds.exe relay-pipe … did not take down:
46832, 15120, …* (eleven), *descriptor count … back at its baseline (83) — now 103*, *it removed its socket on
the way out — … still exists*; and the RED run's sweep stopped exactly the one survivor, by pid. The numbers are
in the RESULTS record, *E5 — the harnesses on the real bridge*.

**The release smoke moved into a script** — `.github/scripts/mcp-listen-smoke.sh <binary>` — so it runs here
against a locally published binary before a tag as well as in `release.yml` on every runner that can execute what
it built: the captured session, stdin held open until `tools/list` is answered, then closed; exit 0 within 10 s;
the log's start line, parent and `exited: code 0, reason clientClosed`. GREEN on this branch's Debug build and its
win-x64 AOT publish; RED on the pre-E2 binary (*exited with code 124 at 61s* — the guard). And `ci-clients.yml`
gained a `windows-latest` leg (bash, the `.exe` suffix), so the Windows half's process tests run on a pull request
for the first time; it becomes a required check only after it has reported once.

**The release binaries report their tag's version, and a smoke holds them to it (2026-10-11,
[PLAN_release_binaries_carry_their_version.md](PLAN_release_binaries_carry_their_version.md)).** Until then
`release.yml` published `creds` and `creds-mcp` without `-p:Version`, so every release said `1.0.0` — in
`creds-mcp --version`, in both binaries' log start lines and in the MCP `ServerInfo.Version` — and the extension's
*Check the WSL MCP install* could not tell an old install from a new one. Both publish steps now take the tag's
version (`0.0.0` on a `workflow_dispatch` trial), and `.github/scripts/version-smoke.sh <mcp|cli> <binary> <X.Y.Z>`
checks it exactly: the first line of `creds-mcp --version`, and — `creds` has no `--version` verb — the start line
of the log `creds relay-pipe` writes with no agent announced. Literal comparisons (`0.10.10` never matches
`0.10.1`), CRLF stripped, a 60 s guard on every run. `mcp-listen-smoke.sh` asserts the serve log's start line too
when `SMOKE_VERSION` is set. Both run in the release legs; `ci-clients.yml` runs the new self-test
(`version-smoke.test.sh`, seventeen cases, each asserting the REASON a refusal gives) and builds both binaries once
more with `-p:Version=0.0.1` on all three operating systems. RED against a local win-x64 publish made the way the
release made it — *--version printed 'creds-mcp 1.0.0', expected exactly 'creds-mcp 0.10.1'*, *the log's start
line does not name version 0.4.1* (`started: relay-pipe, version 1.0.0, …`), *the log's start line does not name
version 0.10.1* — GREEN with the stamp, RED again on a fresh publish without it.

**Still not proved by anything automated:** the one-day count on the owner's machine (the plan's first DoD line —
`creds-mcp.exe` count equals live clients after a day of normal use), which needs the released build installed;
and the stale-install leg of E4.S2 inside `creds-mcp-wsl-itest.cjs`.

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

## The backup archive (2026-09-07, epic 5 story 1)

The format is driven from two tiers, and the second one is the reason the first is not enough.

| Tier | What it drives | Where |
|---|---|---|
| In-process | the format itself: the round trip byte for byte, the exclusion rule, every refusal — a wrong key, a flipped byte at its own chunk, a dropped final chunk read as truncation, two chunks swapped, an edited created-at stamp, a newer version, an oversized declared chunk size, `../escaped.txt`, `/etc/cron.d/evil`, a Windows data stream, a symlink entry, a failure that must leave no staging directory | `src_minimalapi_server/tests/BackupArchiveTests.cs` |
| In-process, the command | the three verbs, their arguments, and the sentence each refusal answers with | `src_minimalapi_server/tests/BackupArchiveCommandTests.cs` |
| **The real binary** | `--create-archive`, `--verify-archive`, `--decrypt-archive` run as a program: seal a tree, verify it, open it elsewhere, compare every file byte for byte, and refuse a wrong key, a flipped byte, a truncation, a missing key file, a key that is not 32 bytes, an occupied destination, and the wrong number of arguments | `src_minimalapi_server/scripts/backup-archive-itest.cjs` |

**Why the third tier exists.** The unit suites drive `BackupArchive` and `BackupArchiveCommand` in
process, which answers "is the format right" and says nothing at all about whether the SHIPPED thing
can be run. These verbs are the recovery kit: the moment anyone needs them the server is gone, and
there is no second chance to discover that the entry point never wired them up. That is the exact
shape of failure this family has already had once, with `/v1/use/exportEnv` unreachable in every
released build while both sides' contract tests were green.

It earned its keep on its first run, and not in the way intended: it picked a **published binary from
an earlier build** and every check about the new verb failed for a reason that had nothing to do with
the code. The harness now takes the newest candidate and prints which one it took — a stale artefact
quietly under test is worse than no artefact.

**What it does not cover.** The archive it takes is a synthetic tree, not a live server's data
directory, so nothing here exercises a file vanishing mid-walk (the unit suite's `Skipped` path);
and the binary it drives in CI is the framework-dependent one, not the Native AOT build that ships.
The published AOT binary was driven through the SAME harness locally — all 24 checks pass against
`win-x64/publish/CredVaultServer.exe` — and `CVBK_SERVER` names a binary explicitly, so CI can point at
a published one as soon as story 5 builds one in the same job.

## The backup key and its store (2026-09-07, epic 5 story 2)

Three tiers again, and the third one is a **cross-language** contract rather than a process.

| Tier | What it drives | Where |
|---|---|---|
| In-process | the construction: every vector, the derived 32 bytes, a 500-core round trip, a key typed with confusables, `BadChecksum` against `BadFormat`, the exact entropy | `src_minimalapi_server/tests/PrintableKeyTests.cs` |
| In-process | the key FILE's two forms and every refusal between them, including a base64 key that happens to begin `BK1` | `src_minimalapi_server/tests/BackupKeyFileTests.cs` |
| In-process, on real files | the store: mint-once, the acknowledgement handshake and its four holes, the run-history guard, the unreadable branches, and the key never entering an archive of its own deployment | `src_minimalapi_server/tests/BackupStoreTests.cs` |
| In-process, over the source | the configuration list, both directions, plus the scan's own known-match companion | `src_minimalapi_server/tests/ConfigKeysTests.cs` |
| **The real binary** | a printable key with one character wrong, and a key in neither form, refused by the shipped verbs with the right sentence and exit code | `src_minimalapi_server/scripts/backup-archive-itest.cjs` |
| **Both languages, live** | the vectors regenerated, compared byte for byte against the committed file, and every `RC1` case fed back through the COMPILED `recoveryCode.ts` parser | `contract/emit-printable-key-vectors.mjs --check`, in `ci · extension` |

**Why the last row is not optional.** `contract/printable-key-v1.json` pins one construction that is
implemented twice — `RC1-` in the extension, `BK1-` in the server — and two suites each asserting
their own copy of a file prove nothing about each other. The generator is the live check the
scenario rule asks for: it derives the file from the construction, refuses a hand-edited copy, and
runs every case through the shipped parser rather than through its own idea of it. The backup cases
additionally carry the derived 32 bytes, so `HKDF`'s salt — the one parameter whose ambiguity would
produce an archive nobody can open — is pinned across both languages.

**What none of this covers.** Nothing drives the key through a UI, because there is no UI for it yet
(story 5). The concurrency guard — two processes minting at once — is reasoned from the
create-if-absent write and the run-history check rather than raced in a test; the same is true of
`LoginKeyStore`, whose discipline it copies. And the acknowledgement is exercised by calling the
store, not by an admin pressing a button, which story 3's endpoints will add.

## The cloud destinations (2026-09-07, epic 5 story 4)

| Tier | What it drives | Where |
|---|---|---|
| Published vectors | AWS's own `aws-sig-v4-test-suite` cases and the documented worked example, at the canonical request, the string to sign AND the signature | `src_minimalapi_server/tests/AwsSigV4Tests.cs` |
| An independent implementation | Azure's SharedKey algorithm, with expectations computed OUTSIDE this codebase | `src_minimalapi_server/tests/AzureSharedKeyTests.cs` |
| A stubbed transport | what each client SENDS and what it makes of the answer: the path style, the two mandatory Azure headers, the post-upload verification, both pagination shapes, the write probe | `src_minimalapi_server/tests/BackupTargetTests.cs` |
| In-process, over real HTTP | a target refused at SAVE time — plain http, an unknown kind, missing credentials, an unreachable host — and a status that carries no credential in any shape | `src_minimalapi_server/tests/BackupEndpointTests.cs` |
| The wire | the same refusals as a client sends them, and the status's per-target list | `http/org/backup.http` |

**The review round's own regressions, each watched failing first.** Six of the round's findings were
behaviours no existing test could have caught, so each is now pinned by one named after the guarantee
rather than the defect: a settings save that OMITS `targets` leaves them alone
(`ASettingsSaveThatOMITSTargetsLeavesThemAlone` — sabotaged to write an empty list, and it failed with
*"Expected after.Targets to contain a single item … but the collection is empty"*); half a credential
is refused by the field that is missing rather than reaching a base64 decoder; a listing that failed is
not an empty one, on both clients; a 200 carrying something that is not a listing is a failure too;
an upload the service stored SHORT is a failure and not a success; and a settings file written before
targets existed reads back with an empty list.

**The second round added two more, and one shared fixture.** A kind this server does not implement is
skipped rather than built as Azure (`AKindThisServerDoesNotImplementIsSKIPPEDAndNeverBuiltAsAnother` —
sabotaged back to the ternary, and it failed with *"Expected built.Client to be null … but found
CredVaultServer.AzureBlobTarget"*), paired with one asserting the two kinds it DOES implement so it
cannot pass by refusing everything; and an upload that landed where retention could not run is
`partial` rather than `ok` (`AnUploadThatLANDEDWhereRetentionCannotRunIsNotACleanRun` — sabotaged back
to a verdict over uploads alone, and it failed with *"Expected status.LastResult to be "partial" …
but "ok""*), again paired with the clean-run case. The stubbed transport moved into its own
`StubTransport.cs` when the second suite needed it — a copy would have drifted, and the copy that
drifts is the one nobody is looking at.

**What none of it covers, said plainly.** Nothing here proves that AWS or Azure ACCEPT what these
clients send — only that they send what the specifications say, and that the signatures match values
those specifications publish. A live check against a real bucket needs credentials nobody should
commit and a network CI does not have; the honest substitute is the save-time probe, which every
operator's first configuration runs against their own account and which fails loudly on their screen
rather than at 03:00. When somebody does point this at a real bucket, that run IS the missing tier and
it belongs in this file.

## Editing the destinations, and the last success (2026-09-24, #134)

| Tier | What it drives | Where |
|---|---|---|
| Pure, in process | the planner's every branch: a kept record carrying the requested region, an unchanged destination neither sealed nor proved, new keys and new identities sealed and proved, the event row's words, one identity twice refused | `src_minimalapi_server/tests/BackupTargetPlanTests.cs` |
| In-process, over real HTTP, the cloud STUBBED | the same decisions as a client meets them — `VaultServer` now takes service replacements, so `BackupTargets` is built over `StubTransport` and a probe is a request the test reads rather than a DNS lookup: the region saved, the unchanged destination unprobed, the unopenable sibling kept, `409` without a KEK only when sealing, the settings row naming `+`/`-`, and `GET …/targets` byte-equal to the shared fixture | `src_minimalapi_server/tests/BackupEndpointTests.cs` |
| Real files | the second instant on `status.json` through every writer, and a legacy file reading its `ok` run as its last success | `src_minimalapi_server/tests/BackupRunnerTests.cs`, `BackupStoreTests.cs` |
| A hung transport | the probe's DELETE giving up on the probe deadline rather than the request's, in both clients | `src_minimalapi_server/tests/BackupTargetTests.cs` |
| The wire | the targets route's `403` and its empty `200`, and the status shape with `lastSuccessAt`; the populated listing and a proved save are `@uncovered` with their reasons | `http/org/backup.http` |
| One fixture, two suites | `contract/backup-targets-v1.json` — the EXACT array the route answers; the server compares the route's answer to the whole document, the extension feeds the same bytes to `readTargets` | `BackupEndpointTests.TheTargetsRouteAnswersTheSharedFixtureShape`, `src_vs_code/src/test/orgBackupClient.test.ts` |
| **The LIVE check, two implementations against each other** | the REAL compiled TypeScript client (`out/orgBackupClient.js`, the `vscode`-free half) driven over the wire against the REAL server the `.http` contract job starts: `readTargets` answers a list (a `404` is a contract failure, since the server was started from the same commit), the status carries `lastSuccessAt` as an instant, a save with a destination at a host that cannot resolve is REFUSED through the client's own error path naming the destination, and the list is unchanged afterwards. Exit codes as `http-run.mjs`: 0 pass · 1 contract · 3 environment · 4 configuration | `src_vs_code/scripts/backup-targets-live.cjs`, run in `ci · server` › *http · contract suite* after the `.http` run, and by hand with the recipe in its header |

**The flow catalogue for the destinations, honestly.** *Read the destinations* — covered live. *Save a
destination the server refuses* — covered live (an unreachable host; the refusal reaches the person
through the client's own path). *Add, edit or remove a destination the server ACCEPTS* — **not covered
live**: a proved save needs a reachable bucket with credentials nobody should commit; it is covered
in-process over a stubbed transport (`BackupEndpointTests` with `Corp.ServerWith`) and in the tab's
own suite, which is a second unit tier and not a scenario. *A run to the new destination* — not
covered anywhere here, for the same reason; the save-time probe every operator's first configuration
runs against their own account is the honest substitute, and when somebody points this at a real
bucket that run IS the missing tier and belongs in this file.

The check exists because the plan gate and then the code gate both quoted `testing.md` back at a plan
that had written *"not a cross-language live run"* as a deviation: two suites agreeing with one file
is not the live check the rule mandates, and it took the second round to stop recording the gap and
close it.

**A Windows-only collision, seen once in four runs of the backup classes.** `AtomicWriteAsync` is a
`File.Move` over the destination; on Windows that fails with a sharing violation when a reader holds
the file, and the restart test polls `status.json` every ten milliseconds while the sweep replaces it,
so the sweep logged *"could not read the backup status at startup"* and the test timed out. On Linux —
the containers — `rename(2)` succeeds under a reader. Pre-existing, outside this change, and named in
the report rather than papered over with a retry.

## The extension's half of the backup (2026-09-07, epic 5 story 5)

| Tier | What it drives | Where |
|---|---|---|
| A stubbed `fetch` | what the client SENDS and what it makes of each answer: the admin routes, the bearer and contract headers, a `404` read as "no backup here", a shape this build cannot read, and the two settings requests that look alike and are not | `src_vs_code/src/test/orgBackupClient.test.ts` |
| Pure, in process | the tab's state machine and the page: the order the key is shown in, the mint button's gating, a failure that must end the busy state, escaping, and a target row that carries both outcomes | `src_vs_code/src/test/backupTab.test.ts` |
| Pure, in process | the nag's cadence and its silence — the whole point of the module | `src_vs_code/src/test/backupNotice.test.ts` |
| Pure, in process | the watch: who is polled, what a failed read may change, and one message for several accounts | `src_vs_code/src/test/backupWatch.test.ts` |
| Real files | a download that fails halfway leaves nothing at the chosen path, and does not destroy the archive already there | `src_vs_code/src/test/archiveDownload.test.ts` |
| The manifest, enforced | the new command has a help article in five languages and a README entry — `helpCoverage` and `listingCoverage` failed on the commit that added it, which is the moment it is cheap to fix | `src_vs_code/src/test/helpCoverage.test.ts`, `listingCoverage.test.ts` |
| A stubbed `fetch` (#134) | `readTargets`: the shared fixture accepted verbatim, a `404` as `undefined` and not as an empty list, a row projected onto the six contract fields so a leaked credential never reaches a page, a shape refused with a sentence; the long deadline on a save that carries destinations, proved by a slow stub that a schedule-only save gives up on; `lastSuccessAt` optional and an instant | `src_vs_code/src/test/orgBackupClient.test.ts` |
| Pure, in process (#134) | the destinations helpers: the server's refusals mirrored, loopback http, both halves or neither, the first save, the region blanked for Azure, empty credentials OMITTED, key-less requests from key-less summaries, the list with one row replaced or removed | `src_vs_code/src/test/backupTargets.test.ts` |
| Pure, in process (#134) | the tab's destinations half: the list drawn with `re-enter` per row, no form against an older server, the whole list sent with the sealed ones key-less, the HTML after a FAILED save holding the endpoint and none of the four typed credential strings, the list re-read after a failure, an identity change asked for both halves, remove asking first and a dismissed dialog sending nothing, every status handed to the tree seam, a message refused at the door | `src_vs_code/src/test/backupTab.test.ts` |
| The page script, RUN (#134) | what the destination form posts, the credential halves named for the kind, the region row following the kind, Edit and Remove posting the row they sit on, and the script touching no `setState` | `src_vs_code/src/test/backupPage.test.ts` (over `miniDom.ts`) |
| Pure, in process (#134) | the Backup row telling the last run from the last success, an older server drawn as before, and the Vaults row naming pending shares only when there are some | `src_vs_code/src/test/serverItems.test.ts` |

**The two tests that exist because their absence would be invisible.** A settings save that names no
destinations must send NO `targets` member — a client that defaulted the field to `[]` would wipe every
configured destination each time somebody edited the schedule, and nothing on either side would say so
until an archive failed to arrive weeks later. And the key must be SHOWN before the status is read
back: a refresh redrawing the page underneath a dialog somebody is copying from is how a key nobody can
reproduce is lost. Both are assertions about ORDER and absence, which no amount of clicking would
reveal.

**One real defect, found by its own test rather than by review.** The watch cleared an account's nag
window whenever no notice came back — including when the notice was merely suppressed by the dedupe, so
the window would be cleared on the very next cycle and the nag would return every other tick. The test
that caught it asserts the second cycle is silent; health and dedupe now answer separately.

**The review round added four more, and one whole tier.** The gate found a status validator that
checked five fields while the page read ten (a truncated answer became a broken tab instead of the
documented sentence); a `Content-Disposition` filename taken as-is and handed to the save dialog as
its `defaultUri`, so a hostile server could open it at `/home/dev/.ssh/config`; account checks run
one after another inside the cycle that repaints the tree; and a notice map persisted once per
healthy account per cycle. Each is now pinned — the filename by a table of six hostile shapes paired
with an ordinary one, the concurrency by counting reads in flight, the write by counting writes.

**The automated reviewer's round added six more**, each red first: a run cancelled mid-build still
reaches a terminal status (the catch-all was handing the CANCELLED token to the status write, so
"in progress" would have survived for ever — the spinner the catch-all exists to prevent, produced by
the catch-all); a rename that fails leaves no `.part` file behind; an instant no `Date` can render is
refused rather than crashing the page on `toISOString`; words the person DISCARDED are not reported
as a key in place; and two more restore scenarios — the rollback stops the stack before it touches
the data, and a rollback that cannot stop it moves nothing and says so. That last pair is a data-loss
path: `docker compose up -d` has already handed the containers the data directory by the time a
health check fails, and swapping directories underneath a running server damages the restored copy
and the original at once.

**And a tier that did not exist: `deploy/restore-archive-itest.sh`.** It runs the restore script as a
PROGRAM with `docker` replaced by a recording shim — seven scenarios, 23 assertions — because the
script's design is its order and reading cannot check an order. It is what says *"the stack was never
stopped"* as a fact about what reached `docker`. The round found the unfinished-restore check sitting
after `docker compose down`; scenario 4 is what catches that class now, and it was watched failing
against the old ordering.

**What none of it covers.** Nothing drives VS Code itself: the modal that shows the key once, the save
dialog, the webview's own script and the tree menu are exercised only through their pure halves. So a
command registered but never wired to a menu, or a `when` clause that stops matching, is caught by the
manifest tests above and by nothing else — which is exactly why the `account-corpOfficer` case was
found by reading `orgRecoveryAccess.ts` rather than by a test. And the harness above is not the
live-stack rehearsal: no image is pulled and no server runs, so nothing yet proves that an archive
from a live deployment restores onto a real host. That is a tracked exception rather than a silent
gap — named in the plan, in `module_deployment.md`, and in the epic's summary.

## The lock file's own version, which no tool was checking (2026-09-14)

`lockfileVersion.test.ts` asserts that `src_vs_code/package-lock.json` agrees with
`package.json` about this project's name and version — in **both** places the lock states it, its top
level and its `packages[""]` entry.

It exists because the drift was real and long. The lock said `0.98.0` while the extension shipped as
`1.7.0`: fourteen releases, every one of them touching `package.json` and `CHANGELOG.md` and nothing
else. Nothing complained, and that is the point — `npm ci` validates the lock's DEPENDENCIES against
the manifest and has no opinion at all about the project's own version field, so the file installs
perfectly while telling every reader, auditor and supply-chain scanner the wrong version.

The test was watched failing against the drifted file before the fix, and its message names the
cause rather than the mismatch: *"a release bumped one and not the other, which npm never complains
about and every reader of the lock believes"*. The second assertion exists separately because a
`lockfileVersion: 3` file carries the version twice, and fixing only the top one leaves half the
drift in place.

**The same drift is present in the family's other two extensions** — `connect_other_ais/src_vs_code`
(0.31.17 against a lock saying 0.30.0) and a private sibling's `tools/vscode-extension` (0.19.0 against 0.9.0).
Neither is fixed here; this is a note so the next person does not rediscover it.

## Account deletion, and what the gate has to make indivisible (2026-09-11, audit finding #4)

`VaultTests` in the server suite. Four scenarios, three of them new, and they exist because the order
`DELETE /api/vault` had always described was enforced by sequence alone.

| Test | What it holds down |
|---|---|
| `AVaultTheOsWillNotReleaseIsReportedAndKeepsItsLoginKey` | A vault the OS will not unlink answers **503**, and the login key, the owner sidecar and the member record are all still there. Before the fix: `204`, with the key gone — and on a corporate server every developer wrap is sealed to that key |
| `ASecondDeleteAfterTheLockClearsFinishesTheJob` | A refusal costs a retry and nothing else: the state it leaves is the state it started from |
| `AWriteCannotSlipBetweenTheVaultDeleteAndTheKeyRemoval` | The per-person gate is held from the vault delete through the key and the registry record. Asserted on the **vault file**, not on the request: the first version of this test asserted only that the request had not finished and passed against the unfixed code, because the endpoint already blocked further down on the member record's own gate |
| `AClientHangingUpDuringTheDeleteDoesNotAbandonTheRegistryRemoval` | Unchanged guarantee, **changed arrangement**: it used to hold the gate and wait for the vault to disappear while holding it, which only worked while the vault delete took no gate. It times the hang-up off the vault file now |

Client half, `serverTransport.test.ts`: `a refused DELETE quotes what the server said, not just the
number` — the 503 sentence says *nothing else was removed, including the login key*, and `HTTP 503`
alone sends a person looking for a bug in the extension.

**Run in both configurations.** This change is about ordering under concurrency, so the server suite
was run as Debug and as the shipping Release build — 766 of 766 in each.

## A one-use entry, a call cap, and a conditional create (2026-09-11, audit findings #3 and #5)

`oneUseAndCap.test.ts` (new), `grantTtl.test.ts`, `serverTransport.test.ts`. Harness:
`src/test/brokerWorld.ts` — the real broker over real HTTP. Command: `npm test`, or
`node --import ./scripts/lower-priority.mjs --test out/test/oneUseAndCap.test.js`.

| Flow | Status | What it holds down |
|---|---|---|
| Two concurrent calls on a one-use entry | covered | The action runs ONCE, the entry burns once, and the loser is told `not_found` |
| The same, across **both doors** | covered | The token door and the MCP door are different grants for one entry; the lane is keyed by account+entity, never by token, so "one token, one use" is not what is being promised |
| A call **after** the first has finished | covered | The distinct path, and the one the gate found: one-use is answered from STORAGE, a burned entry is not in storage, so a later call saw an entry that no longer looked one-use and skipped the queue. The lane decides before storage does |
| An ordinary entry runs two calls **at once** | covered | Asserted as OVERLAP, not as a call count — a queue that ran both in turn leaves the identical record, and the first version of this test passed against a lane keyed by token |
| A call cap of one, two concurrent calls | covered | One run, one shared dialog, and the loser told it ran out of CALLS rather than out of time |
| A refused consent under a cap | covered | Spends nothing |
| `reserve` is one step | covered | `grantTtl.test.ts`: the check and the count cannot be interleaved, and a refused reservation leaves no trace |
| The create after a 404 | covered | `If-None-Match: *` on the wire, and the second machine refused rather than winning |
| A 412, and what the next write may claim | covered | The retry never reaches the wire; a re-read restores the precondition; an ETag-less re-read does **not** turn the conflict back into a blind write |
| A read or write with no ETag | covered | Forgets the version rather than holding one it cannot confirm — except a conflict, which survives |

**What these do not prove.** The harness stubs the action, so nothing here exercises a real `ssh`
exec behind a one-use entry, and nothing exercises two VS Code WINDOWS: a grant lives in one
window's memory by design, so the lane is per window and two windows racing one entry is a
different question (it is `PLAN_cross_window_write_coordination.md`'s). The `serverTransport` tests
stub `fetch`; the server half of the precondition is the .NET suite's `ConcurrencyTests`.

**A fixture that lied, recorded because it is the lesson.** `brokerWorld`'s one-use stub answered
`true` unconditionally, including after the entry had burned. The product reads a node out of
storage, so it answers `false` then — and `burnAndMark` asked the question *after* the burn, so the
lane was never marked spent and a queued second call ran the action again. Every test passed. The
stub answers from `w.burned` now, which is what made the defect visible.
## What the unit suite is asserted ON (2026-09-11, audit finding #8)

`npm test` is `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs out/test/*.test.js`, which starts
`node --test --test-concurrency=min(8, CPUs - 1)` (since 2026-10-11 — see *Local runs* below), and CI runs it in
exactly one configuration:
**`ubuntu-latest`, Node 22** (`.github/workflows/ci-extension.yml`). There is no OS matrix and no
Node matrix. That is a choice, not an oversight — but it has to be written down, because two tests
were passing there **for the wrong reason**.

`defaultProbe` split `PATH` on a hard-coded `;`. On Linux the whole colon-joined value became ONE
bogus entry, `hasTool` was never true, and `pathSshIsBuiltIn` always answered false — so the two
tests that assert Windows PATH precedence never exercised the branch they were named for, and failed
on any Windows machine whose `PATH` puts `C:\Windows\System32\OpenSSH` ahead of Git's MSYS `ssh`.
Reproduced here, and the product was right in both cases:

```
on Windows a forwarding line names the client that can reach the agent
  actual:   'ssh -A deploy@example.com'
  expected: 'C:/Windows/System32/OpenSSH/ssh.exe -A deploy@example.com'
```

What that leaves, and how it is covered now:

| Branch | How it is asserted |
|---|---|
| Windows PATH precedence — Git first, built-in first, neither | Injected `PathProbe`, in `sshProgram.test.ts` and `sshCommand.test.ts`, through **both** entry points |
| The REAL `defaultProbe` wiring | `sshDefaultProbe.test.ts` — the probe is asked what it SAW (the directories it parsed, whether it found the file), not merely whether the answer came out false. Real temp directories, a real `ssh.exe`, `PATH` set and restored, the tree removed after. The built-in-first case is SKIPPED where that directory does not exist, i.e. off Windows |
| The `PATH` split itself | `pathDirsOf` with `;` and `:`, and the wrong delimiter asserted to produce one bogus entry — the bug, pinned. The delimiter follows the TARGET platform rather than the host, so naming `win32` from a Linux runner does not reintroduce it from the other side |
| V8's JSON error text | `jsonErrorLine.test.ts` on both message shapes as fixtures. The two engine-driven tests ask the engine whether it offered a position at all, and stay strict where it did — relaxing them to "the right line or none" would have passed a regression that stopped extracting lines entirely |

Two fixtures are shared rather than copied — `sshPath.ts` (the PATH states) and `engineJson.ts`
(whether this engine names a position) — because a second copy of either is a thing to update that
nothing would notice was missed.

**A Windows CI job is the thing deliberately not added.** It would be minutes per run to exercise one
`if` whose seam now exists, is used by both entry points, and has a real-probe test beside it. The
day that seam proves insufficient, the job is the answer.

## The folder form's text size (2026-09-12, #53 and #2)

The flow: somebody presses **±** in the folder form, the press reaches the host, the host writes the
shared `credSshManager.uiScale` setting, and every open page — the other form, the viewer, the help
page — repaints from that one value. It is the T28 contract, and the folder form was the page that
did none of it. It is catalogued here because `scenario-tests.md` asks for every flow a task adds,
**including the ones no harness reaches.**

Covered by `src_vs_code/src/test/folderFormPanel.test.ts` — the real `folderFormPanel` loaded
through the `vscode` stub (`src/test/vscodeStub.ts`: `loadWithVscode`, with `configStub` recording
every setting write and `settingsVscode` serving them back), with a fake panel standing in for the
editor's webview. Command: `npm test`, or `node --import ./scripts/lower-priority.mjs --test out/test/folderFormPanel.test.js`.

| Flow | Status | What it holds down |
|---|---|---|
| The form opens at the stored size | covered | The rendered HTML carries `zoomStyle(offset)`, not the base size — the page used to be rendered with no scale at all |
| An open form follows a change | covered | `pushUiScaleTo` is hooked on mount: exactly one `{type:'uiScale', px, label}` is posted, and the hook is disposed with the panel |
| A press writes the shared setting | covered | `{type:'zoom', delta: 1}` from the page leaves one write of `uiScale`, one step up, at global scope — the press is reported, the host clamps |
| A press is not a save | covered | The panel is not disposed and the promise does not settle. Falling through to the save or cancel branch would close a form somebody was filling in |
| A press with no `delta`, or one that is not a finite number | covered | Writes **nothing**. The call sites passed `message.delta ?? 0`, so a malformed `{type:'zoom'}` wrote the size already stored and pushed `uiScale` to every open page for nothing |
| The page script's own ± button and `uiScale` listener | **not covered** | No harness drives a real webview — see below |

**What this does not prove.** The page half is asserted as TEXT, not executed: `folderFormPage.test.ts`
checks that the rendered page contains the `data-zoom` buttons and the `zoomApplyScript()` fragment
verbatim, and nothing anywhere runs that script in a browser, clicks the button, or observes
`document.body.style.fontSize` change. A listener that is present and throws on its first message
would pass every test named above. That is not a gap with a fix in this task — it is this document's
own standing finding, *The editor's own UI* below: nothing here drives VS Code, every harness stubs
`vscode` or talks to the broker underneath it, and inventing a tenth harness for one webview would be
the wrong answer to it. The flow's one real look is by hand, on the packaged `.vsix`.

## The second value a person types (#52)

Named here because the code round asked where these flows are covered, and the honest answer has a
shape worth writing down: there is no harness that can drive this feature end to end, for the reason
the section below gives, so each half is covered where it can actually be executed.

| what | where | what it can and cannot see |
|---|---|---|
| The pair rule | `secondPair.test.ts` | Pure. Code points, identical halves, character classes — including the Cyrillic pair the code round found refused |
| What the save STORES | `secondSave.test.ts` | Pure, one test per row of the plan's state table. Reads back what the save decided, never whether a decoy was generated |
| The page's message, read | `secondFormInput.test.ts` | Pure. Both mode controls answering for their own fields, and a crafted payload's unknown keys refused |
| The payment gate | `secondPaymentGate.test.ts` | The REAL `paymentRecordFor` behind a `vscode` stub: a good pair woven, a mismatched one refused, and the typed half absent from the record |
| The page's half | `secondModeScript.test.ts` | RUN through `miniDom`, not matched as source: a box shown, hidden, emptied when hidden, and each control governing only its own scope |
| The markup | `secondModeMarkup.test.ts` | Derived from the catalogue, no value in the page, and no backtick that would end the template literal it is pasted into |
| The viewer's rows | `secondViewerRows.test.ts` | The rows drawn, and the gate a second CVV inherits — driven through `reveal`, so the Show path is covered rather than the private predicate. That a Copy asks nothing (#153) is pinned in `entityViewPanelWiring.test.ts` |
| Out of the vault | `secondShareBoundary.test.ts` | A REAL share payload built and asserted, plus the export counts. Not an allowlist unit test, because that passes for a payload a serializer picked the slot up into |
| Sync, backup, revision | `secondSurvival.test.ts`, `storageSecond.test.ts`, `secondTravel.test.ts` | The five lists agreeing, an empty record deleting its key, and the agent surface driven with a vault that HOLDS one of every kind |
| The five help languages | `secondHelpCoverage.test.ts` | That each language mentions the control — the one stale-translation failure that is checkable without a content-version scheme |

**What none of this reaches** is the same gap the section below names: nothing opens the real form,
ticks the real box and reads the real keychain. A control rendered but never wired to a listener, or
a webview that throws on open, is caught by the page-script tests over `miniDom` and by nothing else.

## The consent policy's two inheritance axes (2026-09-16, issue #95, story S1.2)

`resolveMcpInTree` now walks the ladder and the ask policy separately. The unit tier covers it
thoroughly — the regression itself (*a folder that only sets a policy does not close the branch its
parent opened*) was **watched failing first** against the single-axis predicate, with the real
symptom: `a consent setting closed a branch it has no business closing — false !== true`, the
inherited `use` rung reading false.

| flow | covered | note |
|---|---|---|
| a policy-only folder leaves the rights beneath it alone | **unit** | `mcpAccess.test.ts`; red-first observed |
| an explicit empty object still closes a branch | **unit** | the mirror-image bug; both predicates pinned by name |
| the two axes resolved from two different folders | **unit** | both folder names asserted |
| a word from a newer build stops the climb instead of inheriting a `never` | **unit** | fixture is JSON, so the type system cannot sanitise the case away |
| a stored `null` hands the answer back to the folder | **unit** | what the form sends for *Inherit* |
| nothing in the Trash answers on either axis | **unit** | a never-ask policy surviving a delete would be the sharpest form of this bug |
| the same, end to end through the real `creds-mcp` binary | **binary** | **closed by S4.2** — see *The quiet path through the REAL binary* below, which drives six quiet calls, one forced prompt and a delete through the real executable. It was written here as `NOT COVERED YET` while it was true, because nothing could WRITE a policy until the form landed in S3.1, and a gap nobody writes down is a gap nobody closes; leaving that marker standing once S4.2 had closed it would have been the same failure in the other direction, and it stood for one story too long |

**The door's half (S2.2)**, driven through the real broker over loopback by
`test/brokerMcpRoutes.test.ts`:

| flow | covered | note |
|---|---|---|
| six quiet calls in a row all succeed and none raises a dialog | **broker** | red-first: today the sixth answered `too_many_requests` and the four before it timed out at a dialog nobody was answering |
| a quiet call leaves nobody present, and says so in the journal | **broker** | `presence === 0`, and one line reading `allowed without a prompt` |
| deleting and creating still ask on a pre-consented entry | **broker** | the consumer half of the guarantee; the producer half is in `mcpEntries.test.ts` |
| an answered dialog is remembered under the ladder shown; a quiet call is not | **broker** | the window does not slide |
| a token call never writes the MCP stamp | **broker** | the two dialogs say different things |
| quiet calls spend no modal slot, so a prompting call still gets its five | **broker** | releasing a slot never taken would free another call's |
| an entry INHERITING never-ask from its folder runs quiet through the REAL lookup | **broker** | the only test here that builds the answer the way production does — `mcpUseLookup` over a real tree and a real stamp store — with an ask-every-time control beside it, so it cannot pass by resolving nothing |
| a remembered write that FAILS does not fail the call somebody allowed | **broker** | it costs one more dialog next time and says so in the journal |
| a runaway loop leaves ONE journal line a window, not one a call | **unit** | the ceiling bounds actions, not refusals; a line each would be a journal nobody can read |
| the ceiling is one per WINDOW, shared by every tokenless caller | **unit** | deliberate: the only caller identity this route has is a LABEL the body supplies, so keying on it would hand an attacker as many quotas as it invented |
| a refused PROMPT is still never written down | **unit** | unchanged and pinned, so the gap stays visible — widening it is a decision, not a side effect of this story |
| a call gives back the slot the ceiling that admitted it took, and a refused one gives back nothing | **unit** | the code round's finding: naming the ceiling twice lets the two namings disagree. Red first, with the naive refusal-release in place — `the call in flight still holds its slot` |
| a clock that moves backward does not strand the ceiling | **unit** | red first: half an hour back and the sixty-first was still refused. Both the counts and the journal mark are measured with both bounds |

**The wiring (S2.4)** — `test/mcpHooks.test.ts`, the story that makes all of the above true in a real
window rather than only in a test. Five behavioural rows through the factory, and one scan.

| flow | covered | note |
|---|---|---|
| a consent remembered through one hook is what the other reads | **unit** | the round trip, which is the whole point of one store; split across two it passes nothing |
| two hook sets over one state read the same store, and a different state reads its own | **unit** | asserted through behaviour, not object identity, and with a DIFFERENT vault object each time — the key is the `Memento` |
| two hook sets over one state write through ONE queue, so a concurrent remember is not lost | **unit** | the test the memo actually needs, and the row above cannot give: `ConsentStamps` caches nothing, so two instances still read each other's LANDED writes — what a queue each costs is a write still in flight. With the memo deleted this is the only test in the file that fails, watched: *the first consent was overwritten by the second* |
| a remembered consent lands under the real key, `credSshManager.mcpConsentStamps` | **unit** | the key is every installed machine's record; a rename is a silent forget for everybody |
| the clock the factory was given is the one BOTH halves answer to | **unit** | the write carries it and the read is measured from it, at a millisecond either side of twelve hours |
| an entry whose folder sets no policy still asks, and no stamp is written | **unit** | every entry in every vault today, since no control can write `ask` until S3.1 — the wiring must change nothing for them |
| a consent answered on one real call is what the next one reads | **broker** | the flow rather than the shape: two calls over loopback through the real door, the real modal, the real `recordConsent` and the real store — the first asks, the second does not, and both run. Watched red by dropping the write half: `2 !== 1`, the second call asked again |
| the scan still finds the line it is about | **scan** | a prohibition that matches nothing passes forever, so the sanctioned instance gets its own test |
| the write bound answers when NOTHING else holds the event loop (S4.3) | **spawn** | the never-answers test above passes for the wrong reason whenever the suite around it happens to hold the loop, and that is what hid a real defect for six stories: `recordConsent` passed `{ unref: true }` to `withTimeout`, an unrefd timer does not hold the loop, and a caller awaiting it in an otherwise idle process gets **no answer at all** rather than a late `undefined`. Under the broker a listening socket always holds the process, so nothing local ever showed it. **CI did**: three tests `cancelled` with *Promise resolution is still pending but the event loop has already resolved*, beside `fail 0` — so the run exited 1 with nothing to point at, in the extension job and in SonarCloud's coverage job both. This row is that observation rather than a re-run: `recordConsent` runs in a spawned process holding nothing open and must answer. Watched red by restoring the `unref` |
| the window wires BOTH hooks into the live broker, from the one factory | **scan** | there is no VS Code to activate here, and the defect is a call site: a broker left on the store-less resolver keeps every unit test green. Both branches watched red — the old line restored, and a later `resolveMcpUse:` key shadowing the spread, which is the same trap `brokerWorld` sprang earlier in this feature. Failures name `extension.ts:<line>` |

**The control (S3.1)** — `test/mcpAskChoices.test.ts` for the words and the markup,
`test/mcpSwitchScript.test.ts` for the page script RUN under `miniDom`, and the round trip in
`test/folderFormPanel.test.ts`. The fixture both script tests build on is `test/mcpFormFixture.ts`:
one builder, because two copies of a fixture that must mirror one piece of markup are two copies
that drift, and its controls and their state come from the same lists and the same predicate the
real markup uses.

| flow | covered | note |
|---|---|---|
| four choices, each with a why, and never-ask says the switches become the whole gate | **unit** | the one control that can remove a confirmation; the sentence beside it is part of it |
| exactly one radio is checked, and it is the local answer | **unit** | over all four values, including absent — Inherit is what absence checks |
| an inheriting folder names the folder above and its answer; with nothing above, the option does not use the word | **unit** | and is still offered either way: taking back a local answer is what it is for |
| a folder name in the Inherit label is escaped | **unit** | names arrive by sync and by import, and this extension has shipped one such interpolation before |
| `MCP_SWITCHES` still has ten entries and five bar colours, and no ask id is among them | **unit** | the separation as a number — `searchPredicates.ts` throws at module load for an id it does not know, so a cadence in that list breaks every search at startup |
| each choice posts its OWN value, and Inherit posts null | **executed** | table-driven, one row per control: a test asserting only "a policy was posted" passes for a page that serializes `always` whichever radio was picked |
| touching only a radio posts a policy and NO ladder · touching only a switch posts a ladder and NO policy | **executed** | the §2 regression from both sides. Watched red with the flags merged: *a ladder was written because a cadence was chosen* |
| a form opened on a decided ladder keeps posting it when only the policy is touched | **executed** | opening a form must not silently narrow what is stored |
| nothing touched and nothing decided posts `undefined` | **executed** | the oldest guarantee in this script, and the two flags did not cost it |
| a page with NO radios keeps the policy the record already had, and never marks it touched | **executed** | the entity form until S3.2. Watched red: *a form with no control for it silently cleared the policy* — the sharpest finding of the plan round, and a real defect in the first design |
| a stored cadence that is not one of the three words cannot close the script tag | **executed** | `jsonForScript`, not `JSON.stringify`, which escapes quotes and leaves `</script>` alone. Found by the repository's own interpolation scan going red |
| a save that only chose a cadence leaves the ladder ABSENT · Inherit clears a stored cadence · a ladder survives its cadence being taken back | **round trip** | page script → JSON → `readValues`, which is the shape written to the vault and the only place the regression is visible |
| the group renders under the switches, with its hint; the Trash has neither | **page** | same rule as the switches: in the Trash they would be controls that decide nothing |
| a folder that answered only the CADENCE still shows the ladder it inherits | **page** | the code round's find, and a real defect: `{ ask: 'never' }` was read as "this folder decided", so the form drew an all-off ladder under a sentence claiming so. Watched red — *the inherited ladder was shown as all off* |
| a stored cadence that is not one of the three words shows the one actually in force | **page** | records arrive by sync and by import; the form runs the stored value through `askPolicy`, the reader the resolver uses, so an unknown word shows `always` and a `null` shows Inherit. Watched red |
| what a node would inherit is what the ANCESTRY says, whatever the node says itself | **unit** | `inheritedAskFor`, moved into `mcpAccess.ts` so S3.2 shares it rather than copying a tree walk: two levels up, nothing above, and a node in the Trash inheriting nothing |
| a fourth policy with no control does not compile | **observed, not a test** | `ASK_CONTROLS` is a `Record<McpAskPolicy, …>`; adding `every24h` to `ASK_POLICIES` fails with *Property 'every24h' is missing*, which is why `askWords` needs no fallback |

**The entity form (S3.2)** — the same group on the other form, over a value the resolver already
computes. `test/entityFormPage.test.ts` for the markup, `test/entityFormPanel.test.ts` for the round
trip through `toValues`.

| flow | covered | note |
|---|---|---|
| an inheriting entry under a never-ask folder shows Inherit — never *Ask every time* | **page** | the guard the story exists for: the default belongs to the end of the walk, and showing it as a choice tells somebody the opposite of what the door will do. Watched red by rendering the resolved value as the local one — *the default was shown where a folder had answered* |
| an entry with its own answer shows it checked, and Inherit still names what it would inherit | **page** | which is why the label comes from `inheritedAskFor` (the parent) and the tick from the record |
| with nothing above, the Inherit option names no folder | **page** | the same two labels the folder form has, from one builder |
| the group sits after the tenth switch and before the doors footer | **page** | with a door actually live, so the footer is rendered — with none, the only `agentDoors` in the page is a CSS class above it, and the assertion would pass for the wrong reason |
| the sentence is per HALF | **page** | four states in one line. Watched red with both halves driven by `mcp !== undefined` — *The input did not match /Switches set on this entry/* |
| saving with only the cadence touched leaves the entry's ladder absent; taking a cadence back keeps the switches | **round trip** | the §2 regression on the entity side, through the real page script, JSON, and `toValues` |

**The doors footer (S3.3)** — `test/agentDoors.test.ts`. A never-ask entry is a door like the other
four, and the footer's promise is that what it lists is LIVE.

| flow | covered | note |
|---|---|---|
| a never-ask entry renders a standing-consent row FIRST, naming the command | **unit** | position asserted, not presence: implemented at the end of the table it would still exist and still be wrong |
| an entry that still asks renders no such row | **unit** | both `always` and `every12h` |
| a never-ask entry agents may NOT use is not a door | **unit** | the row says an agent may USE this entry without asking; with `use` off nothing can walk through it. Watched red with the `use` half dropped |
| an entry that INHERITS never from its folder has the door too | **unit** | the row is about what the door will do, not where the answer was written |
| the CLI row no longer claims there is no consent modal, and the code-access row still does | **unit** | one of the two was false — `handleAlias` → `perform` → `consent` — in the module whose job is saying which doors have no modal |
| the CLI row does not hand the alias door to a cadence that cannot reach it (S4.3) | **unit + scan** | the replacement was false the OTHER way: *whether a dialog appears follows this entry's consent setting*, while `preConsent` is wired into `mcpDoor` alone and `handleAlias` mints a fresh grant per call, so a never-ask entry is still asked in a terminal. Watched red against that sentence, quoted verbatim by the assertion. The scan half slices `handleAlias` out of `credsAgentServer.ts` and requires no `preConsent` inside it — wiring the door turns the row red rather than making it false a third time. **Two things the code round made it do properly.** The slice runs to the NEXT member rather than to a named neighbour, because a method moved between the two would have widened the window in silence. And the prohibition has a companion that requires the same pattern AT the sanctioned site, the `door` getter — which caught this file's own dead assertion: renaming the hook to `preConsentX` left a bare `/preConsent/` green on both halves, so the pattern is the whole property, `\bpreConsent\s*:`. Both halves watched red, one by renaming the wiring and one by pre-consenting inside `handleAlias` |
| the rendered FORM carries the row | **page** | the builder can be right while the form never shows it |
| the standing-consent row offers no manage link, while the doors that ARE elsewhere keep theirs | **page** | `editNode` from inside the entity form re-opens it and discards unsaved edits; `command` is optional on `AgentDoorRow` now, and an empty `data-command` is asserted absent too |
| the window COMPUTES the door rather than the tests supplying it | **scan** | every other row here hands `standingConsent` in, so deleting the computation from `extension.ts` would leave them all green. Watched red by replacing it with `false` |

**The way out (S4.1)** — `test/forgetAgentConsents.test.ts`. The handler is CAPTURED from a
`commands.registerCommand` stub rather than imported, so what runs is what the extension registered:
a title in the help and a handler under another id is a palette entry that throws when pressed.

| flow | covered | note |
|---|---|---|
| the registered command empties the real `credSshManager.mcpConsentStamps` key | **command** | with a stamp written first, so the clear is not passing against an empty store |
| after forgetting, a call inside the OLD twelve-hour window asks again | **command** | the emptiness is not the guarantee — this is, asked through `consentDue` the way the door asks it |
| forgetting writes the two machine-local keys and nothing else | **command** | the map and the tombstone; a third key would be a record this feature never said it kept |
| dismissing the confirmation forgets nothing | **command** | it is not recoverable. This test caught a real trap in ITSELF first: a helper parameter defaulted to the confirm answer and called with an explicit `undefined` takes the DEFAULT, so the dismiss case was silently testing the confirm case |
| the person is told only after both writes land, and the truth when one fails | **command** | `forgetAll` is awaited; a message shown while a tombstone is in flight says the windows are gone when they are not |
| the command the manifest contributes is the command that is registered | **command** | the two halves of a palette entry, pinned together |
| each of the five languages names the command, drops the obsolete *every action raises the modal*, and says never-ask leaves the journal | **help ×5** | `helpCoverage.test.ts` checks the ENGLISH corpus only, and a STALE translation is invisible to a coverage test that can only spot a missing one. Watched red by reinstating the Russian sentence |
| the stale-claim scan still finds a known obsolete sentence | **companion** | the other half of a prohibition: a scan that matches nothing passes forever, so the predicate is fed each obsolete sentence and asserted to recognise it |
| a store that refuses the write says so, through the REGISTERED handler | **command** | driven through the command rather than through `forgetAll`, because the handler's catch branch is the subject and calling the store directly never reaches it. Watched red by removing the error message |

**The ceiling (S2.3)** — the quiet path's own limiter, since the prompt was the old one. The unit half
is `test/aliasThrottle.test.ts` with the clock injected, so sixty calls cost under a millisecond; the
broker half drives the ceiling for real over loopback, and the two sixty-call tests cost 863 ms and
810 ms of a 43 s suite — measured, and judged cheap enough to keep the boundary honest at the route
rather than only in the unit. Both halves were **watched failing first**: with the silent path admitted
unconditionally (S2.2's shape) the sixty-first answered `actual: 200, expected: 429`; with the in-flight
rule applied to every construction the second quiet call answered `busy` — `call 2, with 1 in flight
and none released` — while the thirteen modal-budget tests stayed green. The code round added two
more, both watched red before their fix: a refused caller releasing in a `finally` freed the
in-flight slot of the call it had been refused *behind* (`the call in flight still holds its slot`),
and a clock corrected half an hour backward left the window full, so every silent call was refused
until the clock caught up.

| flow | covered | note |
|---|---|---|
| the default construction is today's modal budget to the byte — five, serialized, that wording | **unit** | the literal sentence asserted, so a rewording around the number cannot pass |
| an unserialized throttle never answers `busy`, however many calls are in flight | **unit** | the in-flight rule protects a human; this path has none |
| it refuses the (max+1)th inside the window, admits again once the window has passed, and `release` is a no-op | **unit** | sixty admitted and sixty released is still sixty inside the minute |
| its refusal names silent calls and sixty, not prompts and five — and the window it measured over | **unit** | `describe` became an instance method for this; a true number in a false sentence is still a false sentence |
| `TokenlessCeilings` hands a prompting call to the modal budget and a quiet one to the ceiling, and neither sees the other | **unit** | the modal budget spent, sixty quiet calls still pass; sixty quiet calls spent, the modal budget is back a minute later |
| the sixty-first silent call in a minute is refused as `too_many_requests`, and the refusal is audited | **broker** | 61 real calls: `429`, the silent wording, zero dialogs, sixty runs, and one journal line `via mcp` — `respondError` logs nothing without a grant, so the line is written at the ceiling itself |
| sixty quiet calls spend no modal slot, so a prompting call afterwards still gets its five | **broker** | S2.2's four-call row, extended to the whole ceiling: five alias prompts pass, and the sixth is refused with the MODAL's wording |
| an entry that prompts is still refused at the sixth | **broker** | the modal defence on the MCP door, intact beside the new ceiling |
| the wire contract is unchanged | **contract** | `too_many_requests` already existed; `npm run contract` leaves `contract/broker-v1.json` with an empty diff |

**What this does not prove** *(rewritten twice — once when S2.2 made the door read the policy, and
again when S4.2 drove it through the binary; each time the obsolete half of this section was the
sentence that had stopped being true)*. Everything above stops at the extension's own loopback
surface. The leg below is what crosses it.

### The quiet path through the REAL binary (S4.2)

`src_vs_code/scripts/creds-mcp-itest.cjs`, level 6 — ten checks of a run that is **93** (82 before
this story). The lookup is the real `mcpUseHooks` over a real `StorageManager` and a real stamp
store, not a stub answering `preConsented: true`: a stub would prove the door forwards a flag, which
is already a unit test, and what had never been shown is that the POLICY, resolved through a tree,
survives the trip through the binary. Its own window, because the levels above have spent the
five-prompt budget and a fresh window has a fresh ceiling.

| flow | covered | note |
|---|---|---|
| six calls on a never-ask entry succeed end to end, and the human is asked ZERO times | **binary** | six distinct queries, each asserted by its own text, so a leg answering the same thing six times cannot pass |
| an entry answered inside its twelve hours is quiet too | **binary** | the other way to be quiet, from a stamp the real store holds |
| twelve hours and a millisecond later it asks again, and runs once allowed | **binary** | the boundary as a value, not a wait — the clock is an argument to the factory |
| deleting a never-ask entry still asks, exactly once for that call | **binary** | owner decision D2 through the binary. The count is taken immediately around the delete, so a prompt elsewhere cannot stand in for it |
| a bare local process — no token, no approval, no session, **not even an MCP client** — reaches a never-ask entry, and nobody is asked | **broker, deliberately** | the boundary this feature buys, demonstrated rather than assumed — the parent plan's finding 12 asked to SEE it. It POSTs at the loopback port rather than going through the binary, because that IS the scenario: a local process that never speaks MCP. The binary's own unattended path is what the six calls above exercise |
| the binary under test is NEWER than the C# it embodies | **binary** | `npm run itest:mcp` compiles the TypeScript and NOT the .NET server, so a stale `creds-mcp.exe` would pass every check above while proving nothing about today's code. It compares the executable against the newest `.cs`/`.csproj` under `src_mcp/src` (skipping `bin`/`obj`, which are its own output) and FAILS with the build command. Watched red by touching `Program.cs`: *built 111.4h BEFORE Program.cs* |
| the delete really moved the entry IN THE TREE | **binary** | asserted against the real `StorageManager` through the real `moveEntryToTrash`, not against a spy array agreeing with itself |
| the quiet leg contributed every check it owns | **binary** | a green run and a run that happened are different claims: an early return leaves the rest unexecuted and the script still reports success |

**Watched red**, by returning `preConsented: false` from the real lookup — and the failure is the
feature's own argument. Each of the six calls then raised a dialog, the fifth spent the
five-a-minute modal budget, and the SIXTH was refused outright with `too_many_requests`. Without the
quiet path, six agent calls in a minute are not merely noisy; they are impossible.

**What this leg still does not prove.** Three things, named because a reader will look here.

- **The caller is the script**, not a real MCP client: the handshake is hand-written, and the client
  the binary believes it is talking to is this file.
- **The sixty-a-minute silent ceiling is not exercised here.** It is unit-covered in S2.3, and sixty
  calls through a spawned binary would take the leg well past the script's timeouts. That is a cost
  accepted deliberately, not an oversight.
- **The idle auto-lock is unchanged**, and this leg shows what that means: a never-ask entry on an
  idle machine is usable by anything that can reach the loopback port. The check above demonstrates
  exactly that and calls it the boundary rather than a bug, because it is what the setting says.

And nothing here is reachable by a PERSON until Epic 3's controls, which landed in S3.1–S3.3.

### The claims, the compatibility promise, and the contract (S4.3)

The last story of #95 carries no door change. What it has instead is the text — and three of its own
guards turned out to be the interesting part, each found by the code round and each watched red.

| flow | covered | note |
|---|---|---|
| no README claims a prompt on every call | **unit** | three BANNED patterns in `readmeClaims.test.ts`, with `RETIRED_CLAIMS` feeding each one the real sentence it was written to catch. Watched red: *README.md: an entry can be set to ask every 12h or never — #95* |
| nor does the text an AGENT is handed | **unit** | the same bans over `src_mcp/src/Program.cs` and `contract/mcp-tools-v1.json`. The claim had TWO owners and only the READMEs were watched, so `Program.cs` could have drifted back to *Every action asks the person first* with the suite green — three roles of the code round said so independently. Watched red by restoring that exact sentence and reverting it. Each file is also asserted to contain the word *consent* first, so a wrong path cannot pass by scanning nothing |
| an older build that drops the policy can make an entry QUIETER, not only louder | **unit** | the CHANGELOG promised the opposite. Losing the field is losing an ANSWER, and absence means *ask the folder*: an entry deliberately set to *ask every time* inside a never-ask folder comes back silent after an older build saves it. The test PINS the hazard rather than closing it — the reader cannot tell a dropped answer from one nobody gave, so failing closed here would be "an entry can no longer inherit never", which is the feature. It did not go red, and that is the honest report: the code was right and the sentence was wrong |
| a shared token survives sustained SILENT mcp use | **unit** | `grantRegistry.test.ts`. The cap's existing test overflows with PENDING grants, which is what eviction prefers, so it passed while the real path — allowed grants at sixty a minute — evicted the oldest allowed TOKEN in about four minutes. Watched red, `undefined !== 'allowed'`; two companions beside it require that the window still bounds itself (the oldest CALL grant is what went) and that the scope defaults to the protected kind. Teeth re-proved by flipping the tiers |
| the contract is regenerated from a FRESH binary | **script guard** | `emit-mcp-tools.mjs` refuses a `creds-mcp` older than its newest `.cs`. The solution file used not to list `src_mcp` at all, so a `Program.cs` edit plus `dotnet build …slnx` reported success and regenerated the contract from the previous binary — observed exactly that way, mid-story. The solution carries both MCP projects now, which is the repair; this guard stays because it holds whatever anybody built. Watched red by `touch`ing `Program.cs`: *built 0.0h BEFORE Program.cs*. The check is the harness's own, moved to `scripts/mcpBinary.cjs` so both drivers share one copy |
| `--check` answers about the CONTRACT, not the platform | **script guard** | with `core.autocrlf=true` every checkout rewrites the generated file as CRLF while the generator writes LF, so a byte comparison reported *the MCP surface has changed* after a rebase that changed nothing. Observed on this branch. Both sides are normalised now, and `.gitattributes` pins the two `contract/*.json` files to LF |
## Connecting from a remote window (2026-09-17)

Four pure modules and one wiring, and the split between them is what makes the WSL case testable at
all on a Linux CI runner that has no `wsl.exe`.

| what | where | what it proves |
|---|---|---|
| which machine the terminal is on | `remoteWindow.test.ts` (16) | the four-rung distribution ladder, and that a relay serving `Ubuntu` is found from a `wsl+ubuntu` authority — the exact-key `Map.get` trap, measured |
| what a click may do | `remoteRoute.test.ts` (23) | a cartesian `EVERY_CASE` over (side × credential × agent × readiness × **Windows client**) lands on exactly one route, no refusal is empty, no reason repeats; plus the named cases as whole values — and one clause that pins the rest: with no Windows client installed every answer is byte-for-byte the four-argument one, so the new route can only ADD answers |
| what it says | `remoteWindowMessage.test.ts` (15) | one assertion per reason that its sentence exists and leaks no `undefined`; that the heading names both machines; that the button follows the FIRST reason, drops its "and Connect" promise when fixing the relay is not the whole fix, and is ABSENT for the one reason no command here can fix |
| asking the distribution | `wslProcess.test.ts` (10) | an answer, a non-zero exit, empty output, junk output, and a HUNG child that is bounded and observed killed — through an injected spawner, which is the only reason the hang case runs on CI |
| the connect path itself | `sshConnect.test.ts` (32), fixture in `sshConnectWorld.ts` | the report, both halves: nothing written and no terminal for a WSL window; the `env SSH_AUTH_SOCK=…` line with no `-i` when the relay serves it; a refused translation deleting the `known_hosts` file it wrote — and NOT deleting one outside the directory we write into; and the Windows-client route: the key materialised and passed UNtranslated, the pin left Windows-spelled, the program word on the line, the shell still `linux`, the agent not trusted, and a port forward connected WITH its note |
| both call sites agreeing | `remoteConnectParity.test.ts` (4) | the call sites are FOUND rather than listed; each must use the shared builder, and none may read `remoteName`, the relay setting, the configured distributions or a socket path itself — with every forbidden pattern asserted to MATCH in the builder, so a typo cannot make the guard pass forever |
| the article | `remoteWindowHelp.test.ts` (5) | all five translations are real (`fallback === false`), quote the error people arrive with, carry the 0777 measurement, and name the command by its exported label |

**What none of this proves, and the DoD says so out loud.** No unit test opens a real WSL shell.
`scripts/wsl-agent-relay-itest.cjs` is the only thing that drives the real relay with the real
OpenSSH tools, and it prints its reason and passes when WSL is absent — which is every CI run, since
CI is Linux. **A green CI run is therefore not evidence for the relay route.**

It was RUN on 2026-09-17 on a Windows machine with WSL: twenty checks, all `ok`. Three of them are
this change's, and they end with a CONTROL rather than a claim — the composed line is built by the
real `envPrefix`, it is run in a shell that does not export `SSH_AUTH_SOCK`, it reaches the agent,
and the same shell without it reaches nothing. That is what makes the first two a measurement. (Run
again on 2026-10-11 in its E5 shape — 36 checks, all `ok`, the three above among them.)

**The last centimetre is still unobserved**: nobody has clicked *Connect* in a real VS Code window
attached to WSL, so VS Code creating the terminal and posting the line into it has only ever been
exercised by a stub. Closing that means building the `.vsix` and clicking once.

## A PIN-protected entry keeps its promise (2026-09-29, extension 1.12.0)

The flows [PLAN_entry_pin_keeps_its_promise.md](PLAN_entry_pin_keeps_its_promise.md) added or
repaired, each driven through the product's own entry points over the REAL `StorageManager` with real
`lockSecret` wraps (the shared world is `src/test/pinWorld.ts`; `vscodeStub.loadEachWithVscode` loads
several modules into ONE graph so a PIN the first door granted is the grant every later surface sees).
Command: `npm test`, or `node --import ./scripts/lower-priority.mjs --test out/test/<file>.js`.

| Flow | Test | What it holds down |
|---|---|---|
| **The owner's walk:** protect a card → view → edit the name → view → Remove PIN → view | `entryPinScenario.test.ts` | the whole card — frame, every field, the second value, the note — at every step; sealed after Protect and after the edit, the mark kept, plain after Remove PIN, and no box once it is gone |
| Every slot × every surface | `pinSlotMatrix.test.ts` (40) | ten slots, each alone sealed: viewer, revision viewer, Edit's prefill, the click door, export and share get the plaintext and never `"lock":`; env and `creds://` are withheld in words; an untouched save is byte-identical; a changed slot is sealed (the keychain's write log never sees it in the clear) and opens to the new text |
| No reader unclassified | `pinReaderBoundary.test.ts` (11) | every `src/**` slot reader is carrier / door / automatic / presence, and EACH read meets its class in its own function (a door or refusal primitive there or in a local helper it calls, or a named caller-gated function with its reason; presence per read); `unlockSecret(` only in its two modules — the TypeScript syntax tree (`readerScan.ts`), with companions that assert the scan still matches known instances and fixtures for a `.bind` alias, a bracket access and an ungated second function |
| View a protected entry | `viewerOpen.test.ts` | the card frame and the second-password row drawn after one PIN; a decline opens nothing |
| Edit a protected entry | `editProtected.test.ts` | nothing deleted, every value kept, a change sealed before it is written, the mark and the env bindings right, a damaged value refused, a notification while the values open |
| An entry protected while empty | `emptyProtected.test.ts`, `revisionRestore.test.ts` | the door keeps its mark (and still clears the 0.99.0 false mark over plain values); the first value saved in Edit or brought back by Restore is sealed under a first PIN — typed twice, or checked against the folder's protected entries — before the first write (the write log never sees it in the clear); a decline keeps the form and saves nothing; a save that stores nothing asks nothing; an entry that became marked-and-empty while the form was open is refused |
| Add into a folder that asks for a PIN | `addEntityPin.test.ts` | through the registered `credSshManager.addEntity` handler over the real `StorageManager`: every keychain write of the new entry is sealed (the write log never sees the password, the note or the login in the clear), the mark and `pinEpoch` 1, the PIN opens every slot; a create killed after its first slot write leaves that slot sealed and the node absent, and the next Add converges; a folder of protected entries checks the PIN against them and agrees to the count; a folder that asks nothing writes under the vault alone (2026-10-01, the first of the two plaintext windows) |
| The arrival memo alone | `arrivalPinMemo.test.ts` (5) | `arrivalPin.ts` without `vscode`, over a question that records what it was asked: a folder a landing creates that asks is asked even inside a plain folder the command created; a folder's answer — or decline — reaches it and below, never a plain folder above it; recording what was created asks nothing; an inherited decline names the folder that was asked |
| A share or an import into a folder that asks for a PIN — the security review | `arrivalPinReview.test.ts` (11) | over the same world (`test/arrivalWorld.ts`, shared with `arrivalPin.test.ts`): *Update it* that moves an unprotected root entry into a folder that asks is asked its PIN and seals what arrives (the write log never sees it), and the revision of its old values is written sealed — a crash after the node and before the mark leaves no plaintext history; declined writes nothing and moves nothing; *Update it* on a protected entry from a `pinAskOnImport` share is sealed under the entry's own PIN with no second box; a declined door leaves no empty folder; a bundle that recreates a folder asking for a PIN asks its first PIN once and seals what lands in it, declined writes neither the folder nor its entries; a batch is not asked again for a subfolder it created, and seals what lands in a folder that asks inside a plain folder it created; a recreated folder's first PIN names it; a folder question that fails still ends the batch with its tally and keeps the shares |
| A share or an import into a folder that asks for a PIN | `arrivalPin.test.ts` (19), `shareInbox.test.ts` | through the real `ShareInbox` and the registered `credSshManager.importFrom` / `importExternal` handlers over the real `StorageManager` and its keychain write log ([PLAN_pin_folder_asks_on_accept_and_import.md](PLAN_pin_folder_asks_on_accept_and_import.md), 2026-10-03): an accepted folder share, a CSV import and a CredsForDevs bundle into a folder that asks are sealed under its PIN before their first write (the write log holds only envelopes), marked with `pinEpoch` 1; declined → no keychain write, no node, no folder shell, the share still pending and the import naming what it skipped; a batch asks once per folder — across transit-PIN rounds too — and its tally names a declined folder; a second window's `runOrSkip` from inside the folder box runs (no lease across a box), with a control that sees a held lease; a sender-protected share into such a folder is ONE question and its instruction is spent; an update candidate asks its own PIN only after *Update it*; a folder that only HOLDS protected entries does not reach a folder the arrival creates; a dismissed update is not reported as *Accepted* nor counted as imported |
| Every click | `pinClickPaths.test.ts`, `sshCredential.test.ts` | the sink gets the plaintext after one PIN, a decline hands nothing, a file written from a protected value says it is outside the PIN |
| Nothing automatic | `brokerConfigRoute`, `transportFactory`, `entityFieldReading`, `pinReaders`, `agentUseActions` tests | a withheld reading or a sentence, never the envelope |
| Export, share update | `exportProtected.test.ts`, `storageExportSecrets.test.ts`, `shareUpdateSeal.test.ts`, `shareWithheld.test.ts` | the PIN asked, opened values out, arriving values sealed in, the mark kept; an entry protected while empty asks its first PIN at the update and stores every arriving value sealed, a declined first PIN updates nothing and keeps the share, and an entry with no sealed slot and no mark asks for no entry PIN (2026-10-01, the second of the two plaintext windows) |
| History and Restore | `historyPin.test.ts`, `revisionViewer.test.ts`, `revisionRestore.test.ts` | kept versions sealed on Protect and at the first door elsewhere, opened only through the door, Restore sealing a pre-PIN version, keeping today's access, idempotent after an interruption |
| Remove PIN, the dead end | `entityPin.test.ts`, `pinCommands.test.ts`, `pinGateHoles.test.ts` | woven stays woven, a damaged value asked about, the mark restored at the door, Protect on a protected entry offering Remove, a Protect that raced another window's Protect under a different PIN recording nothing and saying so (the check silent — not a wrong guess) |
| Sync | `syncMerge.test.ts`, `syncPinRule.test.ts`, `syncManager.test.ts` | the later protection decision wins in both argument orders; no mixing across the sealed line or between two sealed sides that raced; the loser recorded before `applySnapshot` |
| Wrong PINs | `pinAttempts.test.ts`, `siblingPinAttempts.test.ts` | five wrong → a wait, doubling to the cap; a folder-wide PIN that opens none charges each sibling, one that opens some charges nobody, a cooling sibling refuses before the box |
| The help | `helpCatalog.test.ts` | every language names *Restore This Version…* and *Remove PIN Protection…* |

**What none of this proves.** No harness drives VS Code itself (*The editor's own UI*, below): the
tree's context menus, the real webview and the real input box are stubbed. The owner's own card,
protected and viewed in a real editor, is the plan's first Definition-of-Done item and is left open.

### The typed-secrets plan, epic 1 — no flow, two foundations (2026-10-01)

[PLAN_typed_stored_secrets.md](PLAN_typed_stored_secrets.md) E1 changes no behaviour, so it adds
no scenario; it adds what the later epics are checked with. `slotTable.test.ts` now holds the slot table
to the vault's kinds (the ten `bundleKey`s plus attachments and images equal `SECRET_KINDS`) and holds
`snapshotForRevision` to exactly the table's getters, and `syncPinRule.test.ts` holds `SEALABLE_MAPS`
to the same ten names. `typedFixtures.test.ts` is the **compile-fail harness**: every file under
`src/test/fixtures/typed/` declares on its first line `// expect TS<code> at line <n>` or `// expect
compiles`, is compiled as its own program with the project's `tsconfig.json` options, and must produce
exactly that diagnostic or none. The fixtures are excluded from `tsc -p ./` and `eslint src`; the
directory is resolved from the package root, an empty one fails, and a `// expect compiles` fixture
must exist as the control that programs are really built and checked. ~0.5-1 s per fixture.

### The typed-secrets plan, epic 2 — the doors and the one writer (2026-10-01)

E2 (T3, T4) moves every read onto an opener and every write onto `entryWriter.writerFor`, and changes
behaviour only where a road was wrong; each such change was RED first (or, where the code landed first,
shown red with the fix taken out) and is held by the flow it changed, over the real `StorageManager`:

| Flow | Test | What it holds down |
|---|---|---|
| The three reads | `secretOpener.test.ts` | `fieldReadingOf`, `plainText`, `unsealedText` asked of the five stored forms (absent, plain, woven, sealed, damaged — each checked against the real parser), and a protected entry withholding even a field it does not hold when the entry is passed |
| The health report | `hygieneScan.test.ts` | a damaged wrap and a woven pair are not graded as passwords (they were — "a strong, unique password") |
| A damaged wrap on the automatic roads | `envApply.test.ts`, `entityFieldReading.test.ts`, `agentUseActions.test.ts`, `transportFactory.test.ts` | withheld as damaged — never a terminal variable, a `creds://` value, a database client's argument (the client WAS launched with it) or a deploy key on disk |
| An agent's connection string | `mcpEntries.test.ts` | a sealed one is not listed as its envelope |
| Kept versions, admitted once | `revisionViewer.test.ts` | a woven kept password read as the live viewer reads it; the live viewer's history-row Copy of a protected entry copies the value, never the envelope, after ONE box; a version under the entry's older PIN asks for that PIN and is not granted over it; viewing and copying ask once (a guard, green before too) |
| The proofs | `sealingProof.test.ts` | `unattendedSealing`: stopped with the PIN sentence on a sealed slot, stopped on the mark alone, plain on a plain unmarked entry, never sealed; `sealingForNew`'s three answers; `writeUnattended` refused with nothing written, and the positive |
| The decision and the write under one lease | `shareUpdateSeal.test.ts` | a share update whose entry another window protects between the decision and the write stores nothing in the clear, keeps the other window's seal and the share, and says why; its companion lands an update nobody protects; the first write runs inside `StorageManager.writes` |
| Every write re-checked, and a new id verified (code round) | `plainWriterLease.test.ts` | protected after the first write → the second is refused and never stored in the clear; a first write that fails for a passing reason does not block a later one; every write runs inside the lease; `writerForNew` over an id whose entry exists and is protected stores nothing in the clear, while over a genuinely new id it reads no slot at all; a node that appears and is protected after the first write refuses the second ("new" is not remembered), and an unreadable tree takes the re-checked road (second code round) |
| Protect under the lease (security review) | `protectUnderLease.test.ts` | a plain write landing while Protect seals that slot ends sealed with the NEW value inside (it was seal(old) — the new value lost); a plain write after Protect sealed one slot is refused; *Protect with a PIN…* on an empty entry writes the mark inside a lease turn and a plain write decided before it is refused |
| A rotation never drops what the far side accepted, and never leaks it | `rotationNoLoss.test.ts` | protected while the statement ran: the value is HELD beside the entry (the slot keeps the other window's seal byte for byte, the only keychain write carrying the new value is the item's record), the agent hears `stored: "quarantined"` before the modal is answered, the journal says `rotated, quarantined`; a second refused rotation holds the later value; one that then lands plain supersedes the hold. The hold write failing → E2's chain: stored under the entry's PIN, or declined / PIN box dismissed → offered to copy once, nothing plain stored, `stored: false` with no value. Q1: a statement that echoes its input, delivered through the broker's real tail (`runAndDeliver` + `maskEntriesFor`) — stored under the PIN, copied, held, failed (non-zero exit) — never hands the agent the new value. Q6: the hold's modal text and buttons (no copy); the copy offer and the post-copy message carry the clipboard-history sentence; nothing is copied without the button; an unattended refusal never says "do it again from the entry". Security review: the hold failed and the person stored under the PIN → an older hold of that slot is gone and unlisted (finding 5); a ONE-USE entry → the person is handed the value (E2's modal, the copy) BEFORE the answer, and the real `burnIfOneUse` then burns the entry — the agent hears `stored: false`, never the value (finding 7c); a call that throws and a history write that fails (finding 4). Final security review: rotating a ONE-USE entry is refused before the far side runs, the entry keeps its value and is not burned (fix 1; the finding-7c tests reach the copy-only road through an entry made one-use while the statement runs); a door that throws on the PIN road still leads to the copy offer (fix 3); the copy-only road names the store's own failure, never a PIN nobody set (fix 4) |
| A held rotation: the store, its exclusions, its release | `rotationQuarantine.test.ts` | the item round-trips and a damaged one is nothing held; deleted with its entry, its account, by the orphan sweep; never read by a sync/backup snapshot (logged keychain reads), untouched by a bundle apply that drops kinds, deleted AND unlisted by one that removes the entry (an older backup restored — finding 7a), absent from an export and a share. A fresh hold's record carries no plain SHA-256 of the replaced value and the release still tells an unchanged slot (released) from a changed one (conflict) (finding 6); the fingerprint is a scrypt derivation of the replaced text under its own salt — neither its HMAC-SHA-256 nor its SHA-256 — and a v1 or v2 record (a fast hash) is read as held, turned into the door's question rather than written, and left alone by the sweep (CodeQL js/insufficient-password-hash on PR #179). The door with the PIN puts it in SEALED (no clear write — R3), item and index gone; a failed drop is finished by the next door without a second write; a failed sealed write keeps the item and the door opens; a slot changed after the rotation is a conflict (nothing written); *Store the rotated one* snapshots then stores, *Keep the current one* confirmed drops, dismissed asks again; the release message; Edit opens over the rotated value. Remove PIN stores it plain; the sweep stores it plain once a sync unprotected the entry, refuses (ProtectedMeanwhile) one protected between its decision and its write, leaves a protected entry alone even with the window's grant, drops a stale index entry; the sweeper runs it and repaints |
| The held rotation reaches one module | `rotationQuarantineBoundary.test.ts` | only `rotationQuarantine.ts` and `secretKeys.ts` name the item's key builder, store, field or index key, and `storageManager.ts` only to declare and make its field — a negative fixture (a reference planted in `mcpEntries.ts`) and a positive control |
| The person sees it | `rotationWaiting.test.ts`, `burnNow.test.ts`, `rotationHelpCoverage.test.ts` | the flags walk names the entry with a value waiting and drops stale index entries; the row says *rotated password / connection string waiting* and its tooltip how to store it; Delete, Empty Trash and Burn Now (through the real `runBurnNow`; `burnNow.test.ts` pins the appended sentence — finding 7b) name the only copy a permanent delete loses; every help language explains it and names *Burn Now…* among those deletions, and pins — in its own words — the sentence that a value waiting beside an entry WITHOUT a PIN goes in at its next use and that the person is told (a language with no pinned fragments fails) |
| A value waiting beside an UNPROTECTED entry is used and said (`research/PLAN_waiting_rotation_visible.md`) | `waitingRotationVisible.test.ts` | over the real `StorageManager` with the keychain read/write logs. W1: *Copy Password* and a click opener handed a value read before the door use the NEW value, store it plain, drop item and index entry, say *"…is now stored."* without "sealed", raise no PIN box; a slot changed after the rotation is ASKED at the click and *Store the rotated one* is what the click uses; the conflict modal is asked with no lease held (another window's `runOrSkip` runs from inside it); a release that fails keeps the item and the click uses the stored value; an unlisted entry's click reads the clicked slot and nothing else. W3: the hold's modal after a keychain failure names that failure, no PIN, and *within a minute*, with *Store it now*, which stores plain with no box; the tooltip names the PIN only for a marked entry. W5: the real `creds_query` (the client's launch captured) uses the new connection string and stores it plain; a conflict writes nothing and uses the stored one; a marked entry is untouched; an unlisted entry reads no `:rotationQuarantine` key; `bindableFieldReading` (env, `creds://`) and the agent's ssh credential read the new password. W6: the sweeper wired as `extension.ts` wires it says each stored value once, and a tick that stores nothing says nothing. The owner's follow-ups: the release in the sync's post-pull callback (read out of `extension.ts`, with a positive control on the sweeper's wiring) is the speaking one and says the value; an agent's query that stores a waiting value says it once with no modal (the words registered as `extension.ts` registers them, and a wiring test that it does), and a conflict or nothing waiting says nothing. The code round: two `StorageManager`s from ONE module graph (`pinWorld.memoryStorages`) never hear each other's release; a NEW automatic reader written in the test, through `automaticOpenerFor` and calling nothing else, gets the rotated value, and an unlisted owner's automatic open reads only its slot; no production file but `secretOpener.ts` and `automaticRead.ts` names the bare `automaticOpener` (a planted reader is reported; the sanctioned use is still found). The security review: over the REAL broker (`brokerWorld` with the real masker and release), an action that prints the password its own automatic read released comes back masked, and `extension.ts` passes `releaseWaiting`; the real `rotateAction` with `extension.ts`'s dependencies, whose own store fails after the far side's query released the waiting value, leaves a hold that releases with no conflict, and `extension.ts`'s `current` is `rotationCurrent`; `creds://…/notes` and a config-body click whose text equals the replaced password answer that text, never the released password. The third code round: an entry whose password was EMPTY before the rotation — Copy Password and an automatic read both get the rotated password the release just stored; and `typedFixtures.test.ts` holds two compile-fail fixtures (an opener and a click that leave the slot out must be TS2554) beside a positive control |
| The share door says what it released and asks a conflict (`research/PLAN_waiting_rotation_visible.md` W2) | `shareDoorRelease.test.ts` | through the real `ShareInbox` over the real `StorageManager` (`shareWorld.ts`), the delivered share opened with the transit PIN as the recipient opens it: a protected entry with a rotated password waiting sends the NEW one and says *"…is now stored, sealed under its PIN."*, the hold gone; an unprotected one says it without "sealed"; a slot changed after the rotation is ASKED, and *Store the rotated one* is what is sent; a dismissed question sends the stored value and keeps the hold; a FOLDER share releases and says the entry inside it; a declined entry PIN sends nothing, says only the share's own warning, and keeps the hold. Break-it: the `pastTheDoor` call removed → 5 of 6 red |
| Restore through the re-checked road | `restoreUnderLease.test.ts` | an entry protected between Restore's decision and its writes has nothing restored in the clear, keeps the seal and the mark, and the person is told |
| A batch accept survives one refusal | `shareBatchRefusal.test.ts` | two shares, the first refused → the second imported, only it consumed, the tally names the first, the log has its line |
| `creds_list` and the health report on damaged values | `mcpEntries.test.ts`, `hygieneScan.test.ts` | a damaged wrap is no connection string for an agent; a woven, sealed or damaged connection string is never graded as a password (key=value fixtures, so the connection parser alone cannot keep them out) |
| The funnel, syntax half | `storedSecretFunnel.test.ts` (over `funnelScan.ts`) | no module outside the allowlist (each with its reason) uses a funnel function or casts to `StoredSecret`; no kept-version reader uses `clickOpener`; T4's interim rule (its plaintext-writer half retired in E3, below) — the storage itself is a writer only in `entryWriter.ts` and the slot table (a deletion with `undefined` excepted), and no slot table row is handed the storage (`slot.write(storage`) outside a `file#function` allowlist — each with a negative fixture and a positive control |
| A writer needs a proof | `typedFixtures.test.ts`, `fixtures/typed/sealing_is_a_proof.ts` | a hand-built `plain` without the brand handed to `writerFor` is TS2345 |

The PIN suite above stayed green with no assertion edited; `pinReaderBoundary.test.ts`'s refusal
primitives gained `plainText(` and `unsealedText(` (the reads that replaced `isLockedSecret(` in the
scans), and two fakes changed mechanically (`editProtected.test.ts` takes the sealing writer from
`writerFor`; `envSaveNotice.test.ts`'s hand-built storage offers `writes`, the lease). The code-round fixes
changed fakes the same way and no assertion: `entityPin`, `pinGateHoles`, `pinFolderPlan` (both),
`writeOrderPaths` (both) and `externalSecretsApply` offer `writes` (Protect's seal and a new id's writes
run under it; the last also `getNode`). `secretClipboard.test.ts`'s "copying the same secret again restarts
its window" — 10 ms timer margins — failed twice under the full run's load while the scrypt-heavy suites
ran beside it, and is green alone; it was not touched.

### The typed-secrets plan, epic 3 — the flip, and the type takes over (2026-10-01)

E3 (T5) changes no behaviour, so it adds no flow; it turns the epics' scans into compile errors where a
type can carry them and keeps them as scans where it cannot. Three checks hold the result:

| Check | Test | What it holds down |
|---|---|---|
| The compile-fail harness | `typedFixtures.test.ts`, `fixtures/typed/` | one fixture per slot — `slot_<payment\|second\|fields\|notes\|config\|vpn\|totp\|db\|key\|password>_is_not_a_string.ts`: the getter's result handed to a `string` is TS2322, each watched compiling on the unflipped tree first — and `storage_is_not_a_writer.ts`: `applyAdditions(storage, …)` is TS2345 (it compiles at `49e34949`, before T5, and is refused from the first flipped slot on); beside E1's three and T4's `sealing_is_a_proof.ts` |
| The funnel, syntax half | `storedSecretFunnel.test.ts` (over `funnelScan.ts`) | the allowlist with reasons (now also `entityFieldReading.ts` and `envApply.ts` — a metadata note or public key read as the plain stored form it is; and `carried` inside the doors' own parse and return points named funnel-internal); its positive control also finds the export's `carried(`; **the stored-form rule, permanent:** no slot setter called on the storage itself outside `entryWriter.ts` / `entitySlots.ts`, and no `slot.write(storage` / `slot.store(storage` outside its `file#function` allowlist — negative fixture and companions as before |
| The reader boundary | `pinReaderBoundary.test.ts` | unchanged lists; every `GATED_BY_CALLER` reason annotated "(typed since T5)" |
| An opened kept version is a real stored form | `historyPin.test.ts` | `openRevision` over a real `lockSecret(value, …, woven = true)`: each opened field reads as `value`, woven exactly where the sealed one was (green on arrival — shown red with the mint reduced to `stored(open.value)`) |
| The text-level seal check | `secretEnvelope.test.ts` | `isSealedText`: a sealed envelope (woven or not) is sealed; plain text, a woven-plain envelope and a damaged one are not — readSecret's `value`, `value`, `corrupt` |

**T4's interim rule is retired where the type took over** — its `applyAdditions(storage` and
`store: storage` patterns, now refused by the compiler (the fixture above, and a planted
`applyAdditions(storage, …)` / `storage.setPassword(a, e, 'hunter2')` in a scratch production file failing
`tsc` with TS2345 twice). The rest of it stays as the permanent stored-form rule: a `StoredSecret` does not
say whether it is plain or sealed, so a plain stored form copied into a protected entry type-checks.

The PIN suite stayed green with no assertion's meaning changed. What changed is mechanical: test inputs
that stand for stored values are minted (`stored(...)`, re-exported by `pinWorld.ts` beside `carried`, or
`stored as mint` where a file already has a local `stored`); fakes of the structural interfaces answer
stored secrets; a test that inspects stored bytes reads them back with `carried(...)`; helper signatures
narrowed to `StoredSecret`; `viewerOptions.test.ts` reads a stored reader through `gatedSecretReader`, as
a page does — handing a page a stored reader no longer compiles. Every edited file is listed in its
commit (`85f0ac13` … `f474f3d4`).

## An agent creates what the folder holds (2026-09-30, extension 1.12.0, relay 0.9.0)

The flows [PLAN_agent_creates_what_the_folder_holds.md](PLAN_agent_creates_what_the_folder_holds.md)
added. The TypeScript half over the REAL `StorageManager` and the real hooks the broker calls; the C#
half through the relay's test executable; one live check — `creds-mcp-itest.cjs` — puts the real
binary against the real window code for the catalogue and the owner's case. Command: `npm test`, or
`node --import ./scripts/lower-priority.mjs --test out/test/<file>.js` and `npm run itest:mcp` from
`src_vs_code`; `node .claude/rules/shared/tools/low-priority.mjs ./src_mcp/tests/bin/Debug/net10.0/CredsMcp.Tests.exe`
from the repository root.

| Flow | Test | What it holds down |
|---|---|---|
| The per-kind table IS the form's save | `agentKindFields.test.ts` | every listed field survives the real `toValues` for its kind and no field the form scrubs is listed; a deny-list of the agent-access switches and every window-owned field is absent from the catalogue, every kind help and every folder answer (O4) |
| `fields` judged before anybody is asked | `agentFieldValidation.test.ts`, `mcpCreate.test.ts` | an unknown key, a wrong type, a bad enum word, a secret inside `fields`, a missing required field, payment — one sentence naming what the kind takes, nothing created; a field over 64 KiB of UTF-8 (a body, a note, a list of rows together; bytes, not characters) refused naming the field and the limit, one at the limit accepted whole, and the limit said in every free-text field's kind help |
| The owner's case | `mcpCreateHooks.test.ts` | a terminal asked for with a host is refused naming the terminal fields; created with its command, args, note and OS and no host; each kind's secret in its own slot; a script over the limit refused in `choose` naming the limit, nothing created, and one at the limit shown whole in the summary and stored whole |
| The consent prompt shows the command | `mcpCreate.test.ts` | the whole composed line of a terminal entry and the COMPLETE body of a script, in the summary and the journal |
| The catalogue routes | `brokerKindRoutes.test.ts`, `brokerContract.test.ts` | `/v1/mcp/kinds` and `/v1/mcp/kind-help` answer from the table, an unknown kind is refused naming `creds_kinds`, payment's help has no example; the contract carries both reads and the kind lists |
| A folder says what it holds | `mcpFolders.test.ts` | `holds` is the kind or `"any"`, `fields` only for a kind, `folderType` kept |
| SSH rows only on SSH | `sshRowsByKind.test.ts` | the live and the revision viewer draw no ssh line for a Terminal or a VPN with a host, an SSH entry keeps it; the Host row only for the kinds whose table has one or a record `canConnectSsh` admits; Copy All, Connect, the CLI verb and the tree description agree; the legacy host-only record keeps Connect and its viewer shows the Host and SSH line Connect runs |
| *Enable in CLI* names the real verb | `cliAliasMessage.test.ts` | through the registered `enableCliAccess`, a Terminal entry is told `creds run <alias>`, never `creds ssh`; for every kind the message names exactly `cliCommandFor`'s command, the CLI row's rule |
| D-B — a folder that asks for a PIN | `agentCreatePin.test.ts` | every keychain write of the new entry is sealed (the write log never sees the secret or the login in the clear), the mark and `pinEpoch` 1, the PIN opens it; a folder of protected entries checks the PIN as Add does, and the step raises no modal (the stub records every modal) — the count is said in a message that asks nothing, a PIN that opens none of the protected entries is a miss and the box asks again, while the person's own Add still agrees to the count in a modal; dismissed / three misses / out of time create nothing and write nothing; a box still open when the time runs out is closed through its cancellation token, and every box of both roads (`newPin`, the sibling check) carries the step's one token, disposed after; through the real broker door the agent receives the window's sentence and `settle` is bounded by the consent step's five minutes; a Deny never reaches the PIN step |
| The relay's side | `ToolsTests.cs`, `UseToolsTests.cs`, `StartupTests.cs`, `BrokerContractTests.cs` | the two tools' descriptions and schemas, `creds_create`'s `fields` parameter, the kind lists equal the contract's `agentCreatableKinds`, the instructions sentence before the ~2 KiB point |
| Real binary against real window code | `creds-mcp-itest.cjs` | the catalogue, the folder answer, the owner's case refused with a host and created with its command and arguments, the whole line in the prompt; an old window (health only) told to update and sent no create |

**What none of this proves.** No harness drives a real agent session against an installed relay — the
plan's first Definition-of-Done item, left open until 1.12.0 and relay 0.9.0 are installed. The PIN
boxes of D-B are stubbed input boxes; the real editor's box staying on screen after the step's time
ran out is not observed by any test.

## A gone request starts no VPN (2026-10-10, E4.S3)

The flows story E4.S3 of [PLAN_wsl_bridge_outlives_its_client.md](PLAN_wsl_bridge_outlives_its_client.md)
gated: an agent's `creds_vpn_up` / `creds_vpn_down` whose client leaves while the start waits. Every case holds ONE
await open, fires the request's signal, then lets it go — the moment a person answers a modal nobody waits for.
Command: `npm test`, or `node --import ./scripts/lower-priority.mjs --test out/test/<file>.js`.

| Flow | Test | What it holds down |
|---|---|---|
| The built-in start | `vpnGoneRequest.test.ts` | a client gone while the config is read: no config file, no tunnel line; gone during the last chain step: the config is not even read; the config is written LAST, so a declined OpenVPN Connect import or a missing launcher leaves no file |
| The dependency chain | `vpnGoneRequest.test.ts`, `dependencyChain.test.ts` | gone at its modal: no chain terminal; gone during a step: no next step, no *Continue* question |
| The install offer | `vpnGoneRequest.test.ts`, `toolEnsure.test.ts`, `sshConnect.test.ts` | a late **Install** installs nothing; a request already gone is not asked; the SSH offer carries the SSH request's gate |
| The custom launcher | `vpnGoneRequest.test.ts` | gone at its trust modal: no chain modal, no line; gone while `{config}` is read: no file, no line; gone after its last dependency: no line |
| OpenVPN Connect, a stop, an already-gone start | `vpnGoneRequest.test.ts` | no import line; no stop line; no question at all |
| The agent's opener and the action's exit | `vpnGoneRequest.test.ts`, `agentUseActions.test.ts` | `agentVpnOpener` hands its gate to the start; nothing started for a gone request THROWS (`ABANDONED`), a live refusal stays `no_credential`, a start sent before the client left answers `opened` |
| Through the real broker | `brokerAbandoned.test.ts` | the real `vpnAction` behind the real broker over HTTP, the client hung up mid-start: one `ABANDONED` line, never `409` or `opened` |
| Unchanged | `vpnGoneRequest.test.ts`, `vpnRunReports.test.ts`, `dependencyChain.test.ts` | a live request and the person's own click (no gate) start exactly as before |

**Not covered by a scenario harness, and why.** No `*-itest.cjs` drives a VPN start: the one harness that could reach
it, `agent-broker-itest.cjs`, stubs `vscode` with terminals that record nothing and modals that answer at once, and a
harness that started a REAL tunnel or installer is exactly what a test may never do. The cross-process half — that the
window sees a client leave at all — is level 8 of `creds-mcp-itest.cjs` (E4.S1). **What none of this proves:** a real
VS Code modal or terminal, and a real tunnel; a command already typed, and a tunnel already up, are not revoked by
design (plan §5.7, open tail).

## A gone request reaches no SSH prompt (2026-10-10, E4.S4)

The flows story E4.S4 of [PLAN_wsl_bridge_outlives_its_client.md](PLAN_wsl_bridge_outlives_its_client.md)
gated: an agent's SSH terminal whose client leaves before the terminal opens — during the entry's PIN box, the
host-key question, or a window's refusal — and the journal line of a VPN whose chain had already typed a step. Every
case fires the request's signal at one await and then lets the path continue, the moment a person answers a dialog
nobody waits for. Command: `npm test`, or `node --import ./scripts/lower-priority.mjs --test out/test/<file>.js`.

| Flow | Test | What it holds down |
|---|---|---|
| The entry | `sshConnect.test.ts` | a request already gone is asked nothing — no credential lookup, no PIN, no host-key question, no warning |
| The credential lookup | `sshConnect.test.ts`, `brokerAbandoned.test.ts` | gone during the lookup: no host-key question, no credential warning — in the unit world, and the real `sshTerminalAction` behind the real broker over real HTTP with the lookup held open |
| The host-key conversation | `connectionOptions.test.ts`, `sshConnect.test.ts` | the conversation is handed the request (the person's click hands none); already gone: no scan, no question, nothing written; gone while the question is open: *Trust and connect* writes no pin and no known_hosts file, the connection does not go ahead; gone during the scan: the scan was handed the signal and ends with it, nobody asked, nothing written; gone during a scan that still answers a key: no question (the own review); gone during the awaited pin write: the pin stands, no known_hosts file, nothing goes ahead (code round 3). The world holds the real `StorageManager` over memory and reads the pin back from the entry |
| A window's refusal | `sshConnect.test.ts` | gone while the modal is open: the button runs no remedy, copies nothing, retries nothing (the PIN is not asked twice); already gone at a late refusal (after the path translation): no modal, the pin file taken back |
| The journal | `brokerAbandoned.test.ts`, `vpnGoneRequest.test.ts`, `requestLife.test.ts` | the real `vpnAction` behind the real broker, its chain having typed a step when the client left: one `ABANDONED` line naming the step, never *not launched*; the chain's gone-after-typing cases (a step, the last step, a launcher's last step, a step's *Continue* question answered *Continue* or *Stop* after the client left, and — code round 1 — the config read AFTER a live step, built-in and custom launcher) throw the request's end with that stage; the end carries its stage, and a foreign `AbortError` with a `stage` is not read as one; the VPN test world hands back only a request's end and rethrows any other failure |
| Unchanged | `connectionOptions.test.ts`, `sshConnect.test.ts`, `sshConnectRemote.test.ts` | the person's own Connect passes no gate and is asked and trusted as before; a live request still connects, with the remedy-and-retry path intact |

**Not covered by a scenario harness, and why.** The plan round asked for a `*-itest.cjs` case that disconnects a real
request while the SSH prompt is open. The real-broker case above is what can be built: the request is real HTTP and its
close is the real `res` close, the broker is the real one, the action is the real one — only the prompt is stood in for
by a held promise. A harness that drove a REAL host-key modal, scanned a REAL host or opened a REAL SSH session is
exactly what a test may never do, and `agent-broker-itest.cjs` stubs `vscode` with modals that answer at once, so no
moment exists in it in which a prompt is open. The cross-process half is level 8 of `creds-mcp-itest.cjs` (E4.S1).
**What none of this proves:** a real VS Code modal; and the entry-PIN box itself stays on screen after the request
leaves (it takes no token — plan §5.7, open tail), harmless because the gate is read after it answers.

## A refused server start (2026-10-12, [PLAN_server_startup_refusal_is_logged.md](PLAN_server_startup_refusal_is_logged.md))

**The flow:** a configuration or an environment the server refuses (no auth scheme, no domain boundary, a
short HMAC key, a data dir on a network share, a data dir it cannot write) → one Fatal line in the run's
own file — `exited: code 78, reason startupRefused: <the guard's message>` with the exception — and exit
code **78**. The operator who reads the file after a deploy is who it is for.

| layer | test | runs where | what it proves |
|---|---|---|---|
| the BUILT JIT binary | `StartupRefusalProcessTests` | every server CI leg (Linux, Windows, macOS) | exit 78 and the Fatal line, for a refusal after the first log line (no auth) and one before it (a UNC data dir — the case whose file used to be EMPTY) |
| the AOT image, production shape | `docker.yml` → *Smoke-test a refused start* | every push to `main` (the image workflow does not run for pull requests) | the same with no auth scheme: read-only root, tmpfs `/tmp`, `cap-drop ALL`, `no-new-privileges`, Docker volumes |
| `Program` in-process | `StartupGuardTests` | every server CI leg | each of the five guards stops the real `Program` and its message reaches the file at Fatal; the accepted cases must really start |
| the guards alone | `StartupGuardsTests` | every server CI leg | each message byte for byte, the inner exception, the order (configuration before the disk) |

**Watched RED** on the old code: the process tests failed with *exit `-532462766` (`0xE0434352`)* and a file
holding only the `runtime:` line, or nothing; the published 0.11.0 image exited **139** with the same file.

**Limits.** The AOT check runs only after a merge, so a pull request that broke it would be found on `main`,
not on the pull request. Nothing covers an exception that is not a guard's (a malformed number in the
configuration, a fault in `Build()`): those are still unhandled, and the plan names them as its open tail.

## The probe-counting port stops cleanly (2026-10-12)

`CountingListener` (`src_service_defaults/tests/Support/StaleWindows.cs`, linked into the mcp, cli and broker test
projects) is the loopback port the stale-window tests point dead announcements at: it counts every connection and
answers a 404, so "skipped" is an observed zero rather than a timing. Its accept loop must end without throwing when
`DisposeAsync` stops it — including right after it has counted a connection, when the next accept meets a stopped
`TcpListener` and gets `InvalidOperationException("Not listening…")`. That exception is now a stop when, and only
when, a stop was requested.

| test | what it proves |
|---|---|
| `CountingListenerTests` (mcp) | 300 rounds of connect → a bounded wait until counted → dispose at once: a requested stop never throws |

**Watched RED** on a macOS CI leg (#234: the positive control `A_live_pid_on_a_port_that_is_not_ours_is_still_probed`
failed in its dispose) and locally, 3 of 3 runs, rounds 15, 4 and 11, with the same message; green 5 of 5 after,
and red again with the old helper. **Limit:** an `InvalidOperationException` raised before any stop is kept loud by
the `when` filter, which is read, not tested.

## The public-hygiene guard (2026-10-12, [PLAN_public_repo_hygiene.md](PLAN_public_repo_hygiene.md))

This repository is public, so `docs.yml` runs `.github/scripts/public-hygiene.mjs` over every tracked file and
path, the script itself included. It fails on four things, each an allowlist or a digest so that the check never
spells out what it forbids:

| rule | fails on | passes |
|---|---|---|
| `e-mail` | an address outside the reserved domains (RFC 2606 / 6761, `.internal`, any subdomain); at a fictional domain the fixtures use (registrable, so matched exactly), any local part but the generic ones they use (`first.last` at one of them fails); at a public mail service, any address but a few generic whole ones (`me@gmail.com`, `git@github.com`) | `name@example.com` |
| `private-ip` | an RFC 1918 address that is not one of twelve exact neutral fixture addresses | `10.0.0.5`, RFC 5737 `203.0.113.x` |
| `home-path` | a real-looking user in `C:\Users\<x>`, `/c/Users/<x>` (Git Bash), `/cygdrive/c/Users/<x>`, `/mnt/<d>/Users/<x>`, `\wsl$\<distro>\home\<x>`, `/home/<x>`, `/Users/<x>`; a quote inside the user folder does not end it | `<you>`, `…`, `me`, `dev`, `runner`, and only the named variables `$USER`, `${USER}`, `$USERNAME`, `%USERNAME%`, `$env:` (a `$` or `%` can begin a real folder) |
| `name` | a word, or two words joined by one `-` `_` `.` space, slash or a line break, whose SHA-256 is in the digest list | — |

The output reaches a public CI log, so it never prints what it found: a finding is `file:line:col` and a neutral
sentence per rule, never the address, host, user or name. A file with a finding in its own path prints as
`(a tracked path with a finding in its own name, #n)` on every line it reports. Running the script locally points
at the exact spot. A digest of a short name can be brute-forced; the list keeps names from coming back, it does
not make them secret. Adding a name: `--hash "<name>"` prints the digest.

Files of any size are read. A file with a NUL byte is binary and is skipped, and the summary counts those. A read
error other than a gitlink or a deleted file stops the scan, naming the error code and the path (masked when it has
a finding of its own), never the system's message. Every match on a line is checked; at most 50 per line and rule
are kept and counted (a line repeating one match a million times reports 50), and at most 500 are printed, while
the summary counts every kept one. Its own fixtures are assembled at run
time, so the script needs no exemption. It starts `git` by the path `resolved()` finds (exported from
`branch-protection.mjs`, the one implementation), not by name (Sonar S4036).

`--selftest` runs 50 checks first:
- 44 line cases;
- the no-leak check on the real formatter (a planted path, an address and two home paths holding a planted name);
- a read error on a planted path;
- the report cap, including that a path stays masked when its own finding is not among the kept ones;
- that the output never repeats a forbidden address, host or user, even in a path;
- a name split across a line break;
- that every digest is 64 hex characters.

Not covered: a fragment of a real secret, a name inside a longer identifier, a name of three or more words, a
non-ASCII name, and the deploy workflow's own name (functional: its GitHub environment holds the secrets).

**Watched:** RED on `origin/main` `a9428905` with 243 findings (name 224, e-mail 13, private-ip 6), GREEN after the
sweep, RED again with one planted line (one finding per rule), GREEN once it was removed. Each later guard fix was
watched RED, GREEN, RED:
- a reserved domain matched as a prefix;
- one 8 MiB line grew the heap by 427 MB (18 MB after);
- a path, address or home path holding a name was printed;
- the Git Bash, Cygwin and `\wsl$` home shapes were missed;
- a line repeating a name kept 699,050 findings and 119 MB (50 findings and 17 MB after);
- a line planted in the script itself passed while it was exempt;
- a read error printed the raw path;
- the report kept every finding;
- masking a path depended on its own finding being kept;
- any local part passed at a fictional domain;
- the per-line cap ran before the allow check, so a forbidden address after 50 allowed ones passed;
- a forbidden value was printed back;
- any user folder beginning with `$` or `%` passed;
- a name split by a line wrap passed. The sweep had missed exactly one such name, in `research/PLAN_depends_on.md`.

## The key fingerprint is of the scrypt key, not of the secret (2026-10-12)

`keyFingerprint.ts` promises that the eight hex characters a share failure is diagnosed with name the key scrypt
DERIVED, never the typed PIN — a short hash of the PIN would be an offline guessing oracle that skips the KDF
([PLAN_share_failure_diagnostics.md](PLAN_share_failure_diagnostics.md)). Until this date the test of that promise
checked `!includes('able')` and `!includes('colleague')` after an 8-hex match, which hold for every possible value.

| test | what it proves |
|---|---|
| `keyFingerprint.test.ts` → *a seal reports a fingerprint of the key it derived* | the reported value EQUALS the fingerprint of a key the test derives on its own (scrypt over the blob's salt and cost), and differs from our own context hash and a bare SHA-256 of each raw input |

**Watched RED** with two defects planted in `sealBlob`: a fingerprint of the typed string, and a fast hash of it
under another context string (the case the plan round named — inequality checks alone miss it). The three old
checks passed on the first one. Cost: one extra scrypt, the file runs in about 2.4 s.

## The contract suite waits for a built server (2026-10-12, [PLAN_contract_suite_waits_for_a_built_server.md](PLAN_contract_suite_waits_for_a_built_server.md))

**The flow** (`ci-server.yml`, job *http · contract suite*): self-test the start script → **build** the server
(`dotnet build … -c Release`, its own step) → **start** the built apphost through
`.github/scripts/start-server-and-wait.sh http://127.0.0.1:5099/api/health 60 -- ./bin/Release/net10.0/CredVaultServer`
→ the `.http` suite and the live client check, only when the start step succeeded → *Stop the server and show its
log* (`if: always()`), which signals only the pid the start step recorded and prints the server's log file.

Why: the job used to `dotnet run` — build and start — inside a 60 s wait that never failed. On #240 (run
38270198889) a cold build took 67.3 s, and the suite reported 370 `ECONNREFUSED` failures for a server that was
still compiling. Over that day's 20 runs build + start took 11–67 s; the start alone is under 0.4 s after the
server's first log line. On this PR's first run the build step took 27 s and the start step 2.3 s.

| case (`start-server-and-wait.test.sh`, stand-ins in node) | what it proves |
|---|---|
| a. never listens, deadline 3 s | exit 1 within 10 s, `did not answer 2xx on <url> within 3 s (last answer: no connection)`, the log, the pid stopped |
| b. a Fatal line and exit 78, deadline 30 s | exit 1 in under 5 s, `exited with code 78`, the Fatal line — the refused-start shape of #232 |
| c. listens (200) after 2 s | exit 0, `pid=` and `log=` in `$GITHUB_OUTPUT`, that pid alive |
| d. answers 500 | exit 1 no earlier than the 4 s deadline, `last answer: 500` — a 5xx is waited past, never taken as up |
| e. no `--` | exit 2, usage |
| f. the URL already answers 2xx | exit 1 at once, nothing started — a leftover server is never mistaken for the new build |
| g. TERM to the script while it waits | exit non-zero, `interrupted`, and the server it started is gone — a cancelled step leaves nothing behind |
| h. accepts the connection, never answers, deadline 2 s | exit 1 within 4.5 s — no probe runs past the deadline |
| i. the start line (on c's run) | names the program only, never its arguments, which may carry a secret |

Runs in the contract job before the build, and the pinned shellcheck of *compose · scripts* reads both scripts.
**Watched RED** with the old inline loop as the implementation (`START_SERVER_SCRIPT`): all six cases failed, and
case a — the defect — exited **0**. And RED again with the fix removed (a copy whose deadline branch exits 0): case a exited 0. GREEN on ubuntu in the PR's contract job. Cases g, h and i came from the
code round and were watched RED in CI first: i printed the stand-in's arguments, g exited 143 at once and left its
server running, h took 6.0 s for a 2 s deadline. **Limit:** the script signals only the pid it started, so its command must be
the server itself; a launcher such as `dotnet run` would leave the app behind on a KILL, which is why CI starts
the apphost.

## A login names its server (2026-10-20, #197 E1.1)

OpenSSH 8.9+ asks an agent to sign the host-bound form of the login request. The protocol and the server tests are driven
by ONE builder, `src/test/sshUserauth.ts` (`userauth({ blob, user, method, hostKey, … })`, the method names written as
literals because they are the wire contract), so the two suites cannot drift into two ideas of a well-formed request.

| suite | what it proves |
|---|---|
| `sshAgentProtocol.test.ts` (36 tests) | the request is read whole — every field, the key it names is the key signing, nothing after the last field · plain and host-bound methods, an empty or missing host key, a wrong service, message number or session-id size, a certificate login and the no-signature probe are `unknown` · `describeServerLine` is a line of its own and the user name cannot imitate it · the log keeps the raw user, the prompt never does |
| `sshAgentServer.test.ts` (17 tests) | over a real socket: a host-bound login of the served key is described as a login; a login naming key A and asked of key B is not a login |
| `sshAgentManager.test.ts` | the host-key clause is one whole line of the prompt, and a plain publickey login has none |
| `ssh-agent-itest.cjs` section 5 | a live `ssh` against a user-mode `sshd` — pending its first CI run (see the table at the top) |

## The prompt shows other people's text as text (2026-10-21, #197 E1 whole-epic review)

The key name (an import or a share sets it) and an SSHSIG namespace reached the prompt raw; a name with a line break could
print a fake *This login is for the server whose host key is …* line. One sanitiser, `displayText`, now serves the user, the
key name and the namespace.

| test | what it proves |
|---|---|
| `sshAgentManager.test.ts` → *a key NAME cannot forge the host-key line on a plain publickey login* | the prompt has as many lines as with a plain name, and none starts *This login is for* |
| `sshAgentManager.test.ts` → *a key NAME cannot forge a second host-key line on a host-bound login* | exactly ONE such line, the real one |
| `sshAgentManager.test.ts` → *a key NAME with quotes, control marks and great length is shown escaped, marked and cut* | `a" b‮…` reads `"a\" b?…` and ends in `…` |
| `sshAgentProtocol.test.ts` → *an SSHSIG namespace is the requester's text* | no newline, no control character, capped at 64 |
| `sshAgentManagerWindows.test.ts` → *an answer given after Remove… / across a re-load refuses* · *a request for a key that is not loaded…* | the manager's refusal lines are REASONS (*answered after the key was removed or replaced — no window was opened*, *the key is not loaded*) with no `REFUSED` of their own: the server writes the verdict once |

**Watched RED** on the unfixed code: `7 !== 6` (plain login) and `9 !== 8` (host-bound) — one line more than a plain name;
the namespace test saw `a signature in the "x"⏎This login is for the server whose host key is …`; the log tests saw
`REFUSED a signature with "prod": answered after the key was removed or re-added`. **Break-it:** the prompt reading
`key.name` raw turns the three name tests red; the namespace raw turns the namespace test red; the old log words turn the
three log tests red.

**Open, not fixed (2026-10-21):** during E1 two unrelated tests each failed ONCE in a full local run and never again —
`sshExecRunner.test` (`false !== true`; the line is unknown, the output was not kept) and `wslProcess.test` *an answer comes
back as the text the child printed* (actual `''`, expected the path; 6.5 s). Both spawn real child processes under 8 parallel
workers at lowered priority. Not reproduced in 3 later full runs (5704 pass, 0 fail each) and 5 single-file runs; there is
no CI record of either.

## A removed or replaced key never signs (2026-10-20, #197 E1.2)

The agent's prompt can stay open for minutes, and the person can remove or re-load the key meanwhile; an *Allow* given
afterwards must sign nothing ([PLAN_ssh_allow_longer_windows_E1.md](../todo/PLAN_ssh_allow_longer_windows_E1.md) §4).

| test | what it proves |
|---|---|
| `sshAgentServer.test.ts` → *a key removed while its prompt is open does not sign, whatever the answer* | over a REAL socket, the prompt held open by the test; the key leaves the served list, the answer is *Allow* → reply `FAILURE`, the key's `sign` never called, the refusal logged |
| `sshAgentServer.test.ts` → *a key re-loaded while its prompt is open signs with neither the old nor the new material* | the same key re-added as a new object (identical public bytes) → `FAILURE`, neither object signed |
| `sshAgentManager.test.ts` → *a replaced key object refuses to sign, even with identical public bytes* · *an unloaded key object refuses to sign* · *a disposed manager's key objects refuse to sign* | through the CAPTURED `LoadedKey.sign` (the manager tests run a stub server, so the server's check cannot be what they see); the replacement itself signs, which is what proves the fixture is a real key |

**The shared world.** `src/test/sshAgentWorld.ts` (precedent `pinWorld.ts`) holds what `sshAgentManager.test.ts` used to
carry: the stub socket server, the `vscode` spy (dialogs, the BUTTONS each one offered, the output channel, the
environment collection), `realPrivateKey`, `manager`, `keyEntity`, `unanswered`, and the temp storage directory —
now named `testsToDelete-agent-…` (the server suite's two temp folders too) and swept at exit. `sshAgentManager.test.ts`
went from 585 to 429 lines with no assertion changed, was 475 with the three new tests, and was 489 with the
key-material guard of the review below; E1.3 and E1.1 took it to 503, and the E1 whole-epic review (key name in the prompt) to 545 — its real line count today. (The plan's "≤ 450" was not met by E1.2 itself; the first version of this
paragraph said 386, which was wrong.) The world's output-channel spy refuses a write after its `dispose()`, like the real
channel, and `unanswered()` also returns `failLate` (a modal that rejects late).

### The review's additions (2026-10-20, #197 E1.2 review)

| test | what it proves |
|---|---|
| `sshAgentServer.test.ts` → both E1.2 tests | now also assert the refusal line says *removed or replaced* |
| `sshAgentServer.test.ts` → *a key replaced inside the covered-window path is refused: the check is after the await even with no prompt* | a confirm that swaps the key synchronously and answers `true` with no modal → `FAILURE`, the counting copy signed 0 |
| `sshAgentServer.test.ts` → *every prompt open for a removed key is refused — two on one socket and one on another* | three prompts for one key held open, the key removed, all answered *Allow* → three `FAILURE`, signed 0 |
| `sshAgentManagerLog.test.ts` (new file) → *a prompt that runs out of time / FAILS / is answered after the window closed* | no throw out of the confirm, nothing written after `dispose()` (the spy channel throws on a write after dispose) |
| `sshAgentManagerLog.test.ts` → *a key named with line breaks writes one line per log call* | name `x⏎SIGNED with "y"U+2028z` → as many lines in the channel as log calls |
| both suites → *nothing this suite logged carries key material* (last test of `sshAgentManager.test.ts`, `sshAgentServer.test.ts`, `sshAgentManagerLog.test.ts`) | `assertNoKeyMaterialLogged()` of `sshAgentWorld.ts` reads every log the file captured (`watchLogs`) against every key it generated (`watchSecret`): no `PRIVATE KEY` header and no base64 line of a key; `keyMaterialIn` is pure and has its own test showing it catches a leak |

**Watched RED** (unfixed code): the server tests' `assert.match` of *removed or replaced* against the old *removed while …*
line; *a prompt that runs out of time…* and *…FAILS…* with `Error: the output channel was disposed`; the forged-line test
with `8 !== 4` (eight lines in the channel for four log calls). The covered-window, three-prompt and key-material tests are
guards that were green on the shipped code; **break-it** shows their teeth: moving the check before the `await`, or
removing it, turns the covered-window and three-prompt tests red (and the two E1.2 server tests); a `loaded` line that
prints the key turns the guard red (`a log line carries key material: … -----BEGIN PRIVATE KEY-----?…`); without the
`disposed` guard in `log` or without `withoutControlChars` the matching tests above turn red. *An answer after the window
closed* is also a guard — that path writes no line on the shipped code either.

**Watched RED** on unfixed code, each for its real reason: the two server tests read reply type `14` (`SIGN_RESPONSE`)
where `5` (`FAILURE`) was expected; the three manager tests got a signature `Buffer` where `undefined` was expected.
**Break-it**, one fix at a time: without the server's post-`await` check only the two server tests go red; without
`revoke()` in `serve()`, in `unload()` or in `dispose()`, exactly the matching manager test goes red.

## A window belongs to one generation of one key (2026-10-20, #197 E1.3)

The window book ([module_extension.md](module_extension.md), *The SSH agent*) is pure, so its rules are tests with no
editor; the manager's half — that the right question is asked at the right moment — is a second suite on the shared world.

| suite | what it proves |
|---|---|
| `allowWindows.test.ts` (26 tests, pure) | a window never covers the next generation of its key · a revocation fences an answer even with no window open, and never an answer for another key · `stale-key` wins over the other two fences · a fence never moved reads 0 · no grant reaches past its scope's ceiling (`login` pinned equal to `ASK_WINDOW_MS`, which the TEST imports) · a shorter grant never shortens a longer one · the two clocks — (11 min, 1 min) and (1 min, 11 min) refuse, the boundary is strict on both, a wall clock set back above `grantedAt` refuses · a login window never covers a Git signature · a book that did not change is the same object, and a grant never touches the book it was given · lock, login-end and sweep behave as the book says · **review round:** a dead window (wall clock set back, or ended on the monotonic clock) never blocks a grant · a window of generation 1 never blocks a grant for generation 2 · a live same-generation window that ends later still wins (*kept-later*) · `nextExpiry` is the earlier end of the two clocks |
| `sshAgentManagerWindows.test.ts` (11 tests, on `sshAgentWorld.ts`) | re-adding a loaded key starts with no window · an answer after *Remove from SSH Agent* refuses and names it · *Allow for 10 minutes* on a prompt whose key was unloaded (or re-loaded) opens no window for the key loaded next · every silent signature logs its window and its end · the gate reads the injected monotonic clock · a request for a key that is not loaded is refused with no dialog · **review round:** the monotonic clock is read at the click (origin 10 h, prompt held 5 min, second request 12 min after arrival is covered) · the window runs ten minutes from ONE wall-clock reading at the click (clock +6 min per read) · a key loaded again gets its own window, the old generation's does not shadow it (stopped clock). `assertNoKeyMaterialLogged()` now runs in the LAST test of the file |

`manager()` in the world gained `monotonic?: () => number` (the manager's last constructor parameter, optional with no default —
a defaulted fourth parameter takes the constructor to complexity 5 and `npm run lint` says so). A test's monotonic origin is
never 0: a book that stored `grantedAtMono` as 0, or never stored it, computes the wrong elapsed time.

**Watched RED** on the code before the book (unfixed manager, the new suite only): re-adding a loaded key `1 !== 2`
(*the re-loaded key asked again*); *Allow for 10 minutes* after an unload: the answer returned `true !== false` and the key
loaded next did not ask, `1 !== 2`; across a re-load the same two; the silent signature logged
*allowed (within the 10-minute window) for an SSH login as "me" (ssh-connection)* where `allowed without asking` was expected;
an unloaded key opened a dialog and was allowed, `true !== false`. The monotonic-clock test cannot be red as an assertion: the
parameter does not exist on the old manager, so it fails to compile (`Expected 4-7 arguments, but got 8`). The pure suite
**cannot be red** — the module is new — so it was broken instead.

**Break-it**, one mutation at a time (each compiled, the suites run, the file restored): in the book — mono boundary `<=`
(*the boundary expires on both clocks*); wall boundary `>=` in `withinAllowWindow`; the mono half of `covers` dropped (four tests);
fence compared with `<` (*a revocation fences an answer even when no window was open*); `?? 0` removed (*a fresh key's first grant
opens*, `undefined !== 0`); the `ReadonlyMap` mutated through a cast (seven tests); `kept-later` building a new book;
`grantedAtMono` stored as 0; `withoutExpired` leaving an empty key entry, dropping a key's other scope, or ignoring the mono clock;
`scopesFor` with `!== 0`; `endLoginWindows` moving the key fence; the generation ignored in `covers` and in the crossing; the lock
fence checked before `stale-key`; no ceiling; a shorter grant overwriting a longer; `forgetKey` leaving the entry; `nextExpiry`
taking the latest. In the manager — the generation read after the `await` (the two re-load tests), or off the `AgentKey` argument
(every dialog test: all refused as *not loaded*); the monotonic clock injected but not used; the stale answer not refused; no new
generation (re-load test); the not-loaded refusal removed. **Two mutations survive, and that is stated:** `forgetKey` in `unload()` and
the reset in `dispose()` change nothing a test can see in E1 — an unloaded key is refused as *not loaded* and a re-load forgets again — they
keep the book from holding windows of dead keys, which E2's row and expiry timer will read. And `forgetKey` in `serve()` alone is
redundant with the generation check in `covers`: removing it, or the new generation, alone leaves the re-add test green;
removing **both** turns it red (`1 !== 2`) — the defect needed both rules to be missing.

**The E1.3 review round (Opus + Fable, 2026-10-20).** *Watched RED on the book as it was* (HEAD 3387fdcb, pure suite): *a dead window never
blocks a grant* — `'opened'` expected, `'kept-later'` actual (the old rule compared only `until`); *a window of generation 1 never blocks a grant for
generation 2* — the same pair; *nextExpiry is the earlier end of the two clocks* — expected `W + 2 min`, actual `W + 10 min` (the wall `until`). The
manager tests added here pin behaviour that was already correct, so they cannot be red on the code: they were broken instead.
**Break-it, every mutant:** in the book — `placed` back to the old rule (`existing.until >= until` only): both new grant tests red · liveness on the wall clock only: red
only on *a window the monotonic clock already ended never blocks a grant either* (the reason that fifth test exists) · the "later" comparison dropped: *a shorter grant never
shortens a longer one* and *ending the login windows moves no fence* red · the generation dropped from the liveness check: *generation 1 never blocks generation 2* red ·
`nextExpiry` ending at the wall `until`: its test red. In the manager — `grantedAtMono = 0` and the arrival reading used in `settle`: both turn *the monotonic clock is read
at the click* red · two wall-clock reads at the click, in either order: *the window runs ten minutes from ONE reading* red (one by the window ending early, the other by the log line's
end) · for *a key loaded again gets its own window*: `forgetKey` removed from `serve()` **stays green** now (the book's same-generation rule covers it — the two rules are redundant, the test
pins the pair); `forgetKey` removed AND the old `placed` rule restored: red (3 dialogs, not 2); generation never moving AND `forgetKey` removed: red (four tests); generation never moving
alone: only *an answer given across a re-load refuses* red; `forgetKey` removed AND `covers` not checking the generation: red (two tests).

## What every text says the signing prompt does (2026-10-20, #197 E1.4)

A sentence is not something a compiler or a behaviour test reads, and the signing prompt's texts had drifted from the prompt
for as long as the ten-minute window existed. `sshAgentHelp.test.ts` (7 tests) holds them to it; `repoFiles.ts` is the one
place a test derives the repository root and reads a repository file (moved out of `readmeClaims.test.ts`, which imports it).

| test | what it proves |
|---|---|
| *the help names every answer the signing prompt offers, in every language* | loops `SIGNING_BUTTONS` (exported by `agentConsent.ts`, spread by the dialog — never a copy) × `HELP_LANGUAGES` over the `ssh-agent` article; goes red by itself when *Allow longer…* joins the list |
| *no shipped text says every signature asks* | a pattern over the English `ssh-agent` and `wsl-relay` articles, `package.json`, both READMEs and the walkthrough |
| *the scan matches every old English sentence* | the companion a pattern test needs: each old sentence, quoted verbatim, must match — it caught `SSH agent, confirming every use` the first time |
| *no replaced sentence survives, in any language of the help* | each of the five `help*.ts` against its OWN old wording (a pattern in English cannot see *jedes Mal*) |
| *no replaced sentence survives in the code that shows or documents the prompt* | `extension.ts`, `agentDoors.ts`, `commands/agentCommands.ts` and the comments that said the same |
| *the guard on command titles matches the two promises the title once made* | the companion of the next one: `Add to SSH Agent (asks before signing)` and `(confirm every use)` must match `TITLE_PROMISES_ASKING`, plain `Add to SSH Agent` must not |
| *no command title, README or help language puts "asks before signing" after Add to SSH Agent* | the manifest, both READMEs and the five help files hold no such title, and the manifest does carry the plain command |
| `sshAgentManager.test.ts` → *the dialog offers exactly the signing buttons, Allow once first* | the dialog's buttons equal `SIGNING_BUTTONS` |

**Deliberately not scanned:** `agentDoors.ts` line 87, the CLI door, which really asks every time (`handleAlias` mints a fresh
grant per call; `agentDoors.test.ts` pins the sentence), and the binary's own help in `src_cli` (`CommandLine.cs` waits for its `cli-v` release; `src_cli/README.md` was corrected).

## What none of them covers

Named rather than implied, because the rule asks for exactly this.

- **The editor's own UI.** Nothing drives VS Code itself — no extension-host test, no click on a
  tree row, no form filled in. Every harness stubs `vscode` or talks to the broker underneath it.
  So a command registered but never wired to a menu, a context value that stops matching, or a
  webview that throws on open, is caught by unit tests over the pure halves and by nothing else.

  **What the viewer's woven-row flow has instead**, named here because the gap above is why it needs
  naming. The Show → reading → Copy path spans a panel that imports `vscode`, two hosts that do not,
  and a page script, and no harness can drive it end to end. It is covered in three places, and the
  split is deliberate: the arithmetic and the row order in `rowFlip.test.ts` and
  `wovenPicture.test.ts`; what each host answers, and that a Copy follows the order the rows were
  shown in — including when a render lands mid-await — in `paymentViewHost.test.ts` and
  `wovenPasswordForm.test.ts`; and the WIRING in `entityViewPanelWiring.test.ts`, which asserts over
  the panel's own source that one store is constructed, handed to both hosts, and cleared at both
  sites. **The limit is exact**: that wiring is read, not executed, so a panel that constructs
  everything correctly and still threw on open would pass it. That is the same limit as the rest of
  this bullet. It exists because this feature once shipped ten modules reachable from nothing but
  their own tests — a test that asserts the CALL is the answer to that — and every scan in it
  carries a companion proving the pattern still matches a known instance.
- **Open Site in Browser (issue #104).** No harness clicks the menu item or the viewer's button, and
  none lets a real VS Code hand the address to a real browser. What stands in: the judge
  (`siteUrl.test.ts`), the PIN-gated command path and the one-door scan (`openSite.test.ts`), the
  REAL viewer panel's message loop under the stub (`viewerOpenSite.test.ts`, which goes red if the
  open branch falls below the copy-only return), and the flag walk (`siteUrlFlag.test.ts`). **The
  limit is exact**: what `vscode.Uri.parse` and `openExternal` finally give the OS is not observed —
  VS Code re-serializes a `Uri`, so a percent-encoded `%26`, `%2F` or `%2B` inside a query value may
  not reach the browser as stored. The judge keeps the query as stored; the editor's last step is
  unverified.
- **The stale WSL MCP install check (2026-10-10, E4.S2 of
  [PLAN_wsl_bridge_outlives_its_client.md](PLAN_wsl_bridge_outlives_its_client.md) §5.8).** No
  harness clicks *Install… → Check the WSL MCP install* or answers its dialog. What stands in: the verdict
  over E2's real `--version` format, the probe's argv and its refusals (`wslMcpStale.test.ts`); when it runs
  — never a stopped distribution, once a day, the dismissal, nothing spawned with nothing recorded, an
  object-property distribution name (`wslMcpCheck.test.ts`); the bounded run's timeout-versus-exit, its
  UTF-16 listing, a failed listing told apart from an empty one, and its output cap (`wslProcess.test.ts`); the panel button being the palette's one id
  (`wslMcpCheckButton.test.ts`); and the window's half — the command, each click, Update's new block and
  record — in-process under the `vscode` stub with `wsl.exe` stood in for (`wslMcpCheckHost.test.ts`). It was run once by hand, read-only, against the real bridge on a Windows
  machine with two running distributions — the argv crossed `wsl.exe` and both pre-0.10.0 binaries read as
  `older`. **The limit is exact**: a `current` verdict from a real 0.10.0 install has not been observed (no
  such release existed yet), and the real editor's dialogs and a real `wsl.exe` under them are unexercised. The automated leg belongs in
  `creds-mcp-wsl-itest.cjs`, which E5.S1 rewrote with run-unique directories on 2026-10-11 — the stale-install leg
  itself is still not in it (open tail).
- **The Marketplace artefact.** `npm run package` runs in CI, and nothing installs the resulting
  `.vsix` into a real editor and opens it. The publish step is verified by reading the release run.
- **The server and the extension end to end.** `server-transport-itest.cjs` would do it, and it is
  the one harness CI does not run. Today the two halves are verified separately: the extension
  against a stubbed transport, the server against `http/`'s requests — 181 of them, 390 checks, over
  46 of 46 registered routes, as of 2026-09-07.
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

Locally, every line below runs at most 8 workers at lowered CPU priority — see *Local runs* just after.

```bash
LP=.claude/rules/shared/tools/low-priority.mjs

# .NET — 1,318 tests on 2026-10-11. The solution carries three of the five test projects, so the
# other two are built by name. The executables run ONE AFTER ANOTHER: each gets 8 threads.
node $LP dotnet build dew_flow_creds_for_devs.slnx -m:4 --disable-build-servers
node $LP dotnet build src_cli/tests/CredsCli.Tests.csproj -m:4 --disable-build-servers
node $LP dotnet build src_broker_client/tests/BrokerClient.Tests.csproj -m:4 --disable-build-servers
node $LP ./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe
node $LP ./src_cli/tests/bin/Debug/net10.0/CredsCli.Tests.exe
node $LP ./src_mcp/tests/bin/Debug/net10.0/CredsMcp.Tests.exe
node $LP ./src_broker_client/tests/bin/Debug/net10.0/CredsBroker.Tests.exe
node $LP ./src_service_defaults/tests/bin/Debug/net10.0/CredsForDevs.ServiceDefaults.Tests.exe

# the extension's unit suite — 5,612 on 2026-10-11; the script lowers itself and caps its pool at 8
cd src_vs_code && npm test

# every scenario harness except the one needing a live server — each script lowers itself
npm run itest:all

# the HTTP contract suite (see http/README.md for the environment it needs, and its lowered form)
node $LP node .claude/rules/shared/tools/http-run.mjs --require-env VAULT_LOCAL_SIGNING_KEY --env local --target http://127.0.0.1:5099
```

## Local runs: at most 8 workers, at lowered CPU priority (2026-10-11)

The shared rule [local-cpu-budget.md](../.claude/rules/shared/common/local-cpu-budget.md) — measured on a
24-thread workstation where one plain `node --test` started 23 test-file processes at normal priority and
every other session lagged. How this repository follows it, entry point by entry point
([PLAN_local_cpu_budget_adoption.md](PLAN_local_cpu_budget_adoption.md)):

| Entry point | Workers | Lowered by |
|---|---|---|
| `npm test` | `scripts/run-tests.mjs` starts `node --test --test-concurrency=min(8, CPUs - 1)`: node's own default capped at 8 (23 here before, 8 now; 3 on a 4-vCPU runner, as before) | `node --import ./scripts/lower-priority.mjs`; the `node --test` child inherits it |
| `npm run itest:*`, `itest:all` | one process, harnesses one after another | the same preload; every binary a harness starts inherits it |
| the five xUnit executables | 8 threads — ONE root `xunit.runner.json`, copied into each test project's output by `Directory.Build.props`, except when `CI=true` | `node $LP <exe>`, one executable at a time |
| `dotnet build` / `publish` named anywhere in these docs, prerequisites included | `-m:4` (`csharp/dotnet-build.md`) | `node $LP dotnet build … -m:4 --disable-build-servers` — see below |
| `deploy/restore-archive-itest.sh` | one bash process | re-runs itself once under `nice` (19; 10 under Git Bash, where 19 is the Windows Idle class the rule forbids) |
| the `.http` suite | httpyac, one request at a time | `node $LP node …/http-run.mjs` |
| a one-file run | one worker | `node --import ./scripts/lower-priority.mjs --test out/test/<file>.js` |

- **The preload** `src_vs_code/scripts/lower-priority.mjs` is a verbatim copy of the conventions template
  with only its `MOUNT` line changed to `../../.claude/rules/shared/`. It calls the shared tool's
  `lowerOwnPriority()`. Where the mount is absent — CI, which checks no submodule out for the extension
  job, or a clone without `git submodule update --init` — it lowers nothing, and outside CI it says so
  once. **No CI job changed.**
- **The xUnit runner reads the file — proved, not assumed.** A file on disk is not enough: a
  `xunit.runner.json` beside the `.csproj` but not copied to the output leaves the runner at its default.
  Each executable's `Starting:` line under `--xunit-diagnostics on`: before, `parallel mode = collections
  [24 threads]`; after, `[8 threads]` for all five; with the root file set to 5 and one project rebuilt,
  `[5 threads]` — the runner follows the root file. `--max-threads N` on the command line overrides it.
- **A lowered build disables the build servers.** Without `--disable-build-servers` a lowered `dotnet
  build` hands its compiling to a compiler server (`VBCSCompiler`) that an earlier, normal-priority build
  started — observed 2026-10-11: one was running at `Normal` while the lowered builds above ran. With the
  flag, the compiler runs inside the lowered tree. The shared rule names this for `nice`; it holds for
  Windows too. `dotnet run` takes the same flag.
- **Measured 2026-10-11, lowered, one after another:** ServiceDefaults 80 (6 s), CredsBroker 133 (3 s),
  CredsCli 142 (101 s), CredsMcp 154 (27 s), CredVaultServer 809 (89 s) — 0 failed; `npm test` 5,612 tests,
  0 failed, 379 s on a machine other sessions were also loading.
- **The pin:** `src/test/localCpuBudget.test.ts` asserts that the `test` script preloads the lowering module
  and starts `scripts/run-tests.mjs` with no exact `--test-concurrency`; the runner's cap (1, 1, 3, 8, 8 for
  1, 2, 4, 9 and 24 threads), its `CAP` equal to the pin's `MAX_WORKERS` (the same bound the xUnit case uses,
  so one budget governs both), and its exit codes (the child's own, 128 + the signal number, 1 when the spawn
  failed); the preload on every `itest:*` script, the preload's one `MOUNT` line and where it resolves, the
  preload against the template (skipped, saying so, where the mount is absent), and the root
  `xunit.runner.json` with the `Directory.Build.props` item that copies it to every test output, skipped
  when `CI=true`. A pin bump that changes the template turns it red until the copy follows.
- **Not lowered, on purpose:** `compile`, `typecheck`, `lint`, `bundle` and the generators are one process
  each and start no pool; the rule's own form `npm run compile && node --import … --test` leaves the
  compile unlowered. `deploy/acme-test/run.sh` does its work in containers the Docker daemon starts, which
  neither `nice` nor the tool reaches.
- **CI parallelism is never raised.** `--test-concurrency` and `maxParallelThreads` are exact values, and the
  first version (a bare 8 for both) raised a 4-vCPU hosted runner from 3 to 8 node workers and from 4 to 8
  xUnit threads. Since the follow-up of 2026-10-11 the runner computes `min(8, CPUs - 1)`, node's own default
  wherever that is at most 8, and the xUnit copy is skipped when `CI=true`, so CI keeps xUnit's default.
- **Open tail:** the two WSL harnesses build inside the distribution with a bare `dotnet build`; a
  Windows-side BelowNormal does not reach the WSL VM. Owed there: `nice -n 19 dotnet build -m:4
  --disable-build-servers`, once the branch rewriting those harnesses lands.

The WSL harnesses skip loudly rather than silently when the distribution, the .NET SDK inside it, or
the Windows binary is missing — each prints the command that would fix it. That is the convention
every harness here follows: a skip says why, and a missing prerequisite is never mistaken for a pass.
