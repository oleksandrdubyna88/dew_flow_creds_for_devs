# PLAN — Test leftovers, E2.3 brief: the C# lifecycle across the five executables

> Status: **brief only, nothing built, 2026-11-07; no plan gate yet.** Scope: the build brief of epic E2.3 of
> [PLAN_test_leftovers_E2.md](PLAN_test_leftovers_E2.md) (§ *Epics* → E2.3, § S3). Branch `feat/test-leftovers-e2.3`, cut
> from `main` `bf59e4f`, where E2.1 (#294) and E2.2 (#310) are merged; the mount is release `37b9aa5`. Brief by Opus; code
> by a Sonnet coder; review by Opus. **F31 (the elevated Windows limit) was accepted again by the owner on 2026-11-07, at
> E2.3's start** (the coordinator's note; the next review is at a persistent Windows test machine or 2026-12-05, whichever
> comes first). So E2.3 copies the helper as it is, and the Windows handoff proof of E2.3.S2 says what it does not prove
> (row 15). **F29 was read before this brief** (§ 3.0). **Epoch 7 of the parent has used its one change (entry 7.1). The
> next accepted change is the seventh full stop.** So § 6 marks each question whose "yes" would be a change, and § 7 marks
> each finding that would be one if it were accepted. With the recommended answers, this brief makes **no** change.
> **Revised 2026-11-07 after the plan gate (coai `f78f1c4f`: G1, G2, G5), the risk consult on S2 (C1–C4) and an
> independent Opus review (R1–R9), all accepted by the coordinator.** Each fix makes E2.3 do what the stories document
> says; none is a plan change (each says which stories text it carries out).

**The epic's goal (E2.3, unchanged).** E3's helper, with its Darwin path, runs in all five xUnit executables on Linux,
Windows and macOS. Every C# site is owned. Each executable sweeps both roots at start and fails a run that left something
it claimed. **The bounded exception (§ *Goal* of the stories, the parent's epoch 7; F31):** what a run in an ELEVATED
Windows process leaves is owned by `BUILTIN\Administrators`. No sweep removes it, and the audit's claim scan does not see
it. It waits for a person. `windows-latest` is elevated, so on the Windows leg the audit works through its registry half
only.

Sources, read for this brief: the stories document (§ *Revision* rows 3, 4, 7–11; § *Goal*; D1–D9; S3; § *Epics* E2.3;
the E2.1 and E2.2 build records); the parent `dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md` at `origin/main`
`a3a02fa` (§ *Epoch 4* item 4; § *Epoch 6* items 3 and 8; § *Epoch 7* items 1, 3, 8; the ledger, entry 7.1); F29 and F31 of
`dew_flow_conventions · todo/PLAN_test_leftovers_merged_core_followups.md` at `a3a02fa`; the template
`dew_flow_mcp · tests/Mcp.Tests/Leftovers/` at `197cc76` (51 files; `dew_flow_mcp` `main` `45a8db2` has no commit under that
folder after `197cc76`); coai's adapted copy on its E5 branch at `a1ca6ed2` (`src_mcp/tests_leftovers/template-manifest.json`,
52 entries; `src_mcp/tests/Leftovers/TheAdaptedCopyTests.cs`; coai `main` does not hold the copy yet); the mounted rules
`common/test-leftovers.md`, its detail, `planning-docs.md`, `plan-change-control.md`, `testing.md`, the C# rules. Every
`file:line` below was read at `bf59e4f`. Template lines are `T:<file>:<line>` at `197cc76`; `T-ci` is the template's
`.github/workflows/ci.yml` at `197cc76`.

*Instruction loading:* this repository has no `AGENTS.md` and no `.agents/PROJECT.md`, so the shared resolver answers
`INCOMPLETE — Missing instruction source`. The rules named above were read directly from the mount. Nothing was changed
but this brief and its `todo/README.md` row.

## 1. The parent's table, filled

Each row is a merge condition of E2.3's pull request: the parent's E2 rows that apply (§ *Epoch 6* item 3: E2 (c), E2 (d),
the E2.3 row), each Done-when item of E2.3, each scenario of S3, each suite × OS cell, and the guard runs. The last column is
the one § *Epoch 7* item 8.1 adds. A row with "—" in the implementation or check column is **unmapped**: an open design
decision (§ 6), raised before the plan gate.

| # | Condition | Implementation (file:line at HEAD) | Invocations covered | Executable acceptance check | What the check prepares or substitutes, and what real-run behaviour it does not prove |
|---|---|---|---|---|---|
| 1 | **E2 (c)** — the barrier is open on every machine that runs these tests | `dew_flow_conventions · research/security/machines.md`: the WSL machine (conventions #136: none found, 266 files read); the owner's Windows machine by his statement (#124) | the operator's WSL machine; hosted runners need no record | Met. On the PR head: `node .claude/rules/shared/tools/sweeper-scan.mjs --root .` → `none found`. Measured by this brief at `bf59e4f`: `none found (1540 file(s) read)` | The rescan reads this checkout only. It does not prove that no sweeper appeared elsewhere on the machine after the owner's scan |
| 2 | **E2 (d)** and **Done-when 3** — the hand clean-up of the C# old names, per machine | A person's record on the PR, in the shape of `[E2.1 byhand 4]`. Names: `cred-vault-tests`, `cred-vault-backup-run`, `cred-vault-backup-store`, `cred-vault-backup`, `cred-vault-backup-cli`, `cred-vault-key-file`, `cred-vault-aot-kit`, `cred-vault-guards-*`, `cred-vault-refusal-*`, `creds-endpoints-*`, `creds-title-*`, `creds-relay-*`, `creds-dead-agent-*`, `creds-cli-stale-*`, `creds-mcp-*`, `creds-logsink-*`, `creds-retention-*`, `creds-log-tests-*`, `creds-corpse-*.sock`, `cr-*.sock` (the sites of § 3) | the WSL machine; the owner's Windows machine "not cleaned, not needed" (it does not test creds, 2026-11-04); CI VMs end with the job | `find <root> -mindepth 1 -maxdepth 1 -name '<pattern>'` over `/tmp`, `/var/tmp`, `/dev/shm`, `$XDG_RUNTIME_DIR`, before and after. A search by this brief's author (2026-11-07 13:57, read-only): **0** entries of these names | A search by name at one moment, not a proof (§ *Epoch 6* 8.1). It does not see a root that another `TMPDIR` named. `dotnet-diagnostic-*` sockets are not on the list: a killed child's socket cannot be told from another process's (F13) |
| 3 | **Parent E2.3 row** and **sc. 5** — the copy is an ADAPTED copy; its diff check fails on one unexplained byte | NEW `src_service_defaults/tests/Support/Leftovers/template-manifest.json` (52 entries: the template's 51 files but `LeftoversRepositoryGuardTests.cs`, plus `DirectoryLinks.cs` and `RepositoryRoot.cs`, F4); NEW `src_service_defaults/tests/Leftovers/TheAdaptedCopyTests.cs` in coai's form; `.gitattributes` `-text` per copied file (F6) | `CredsForDevs.ServiceDefaults.Tests` on three legs, `sonarcloud.yml`, `release.yml` | S1.1–S1.3 green on the head; by hand once: one byte changed in a copied file → red, naming the file | The check proves the bytes. It does not prove that the template is right: F29 and F31 are copied with it (rows 15, 17). It does not prove the ops are minimal; a reviewer reads each op's `reason` |
| 4 | **sc. 1** — every executable sweeps at its start | `Support/Leftovers/LeftoversSweepFixture.cs` (`[assembly: AssemblyFixture]`, T:LeftoversSweepFixture.cs:3), linked into all five by ONE wildcard each; NEW `Support/Leftovers/SweepRanTests.cs` | the five executables, every invocation of § 2 | S1.4: `LastRun` is not null in each of the five. The socket-root half (S2.8): `/tmp` was swept exactly once in each of the five (R5) | It proves that the fixture ran. It does not prove what it collected; S2.4 and S2.7 do that on prepared folders |
| 5 | **sc. 2, leaks** — what leaked stops leaking | § 3.3–3.5; the scan test S3.0 | `CredVaultServer.Tests`, `CredsBroker.Tests` and the other three | By hand, RED first: one run of each executable with `TMPDIR` at a private SHORT folder, new entries counted before and after. Expected RED from reading: ≈ 190 folders and the six parents plus the kit (the stories); **the exact N to be measured by the coder's RED**. After: 0 old-form and 0 owner-form entries. S3.0, S4.0, S5.0 automate the site count | A private `TMPDIR` stands in for the machine's temp root. It does not show a run in the real root, where other runs write at the same time. The `/tmp` socket folders are counted in `/tmp` itself. Linux only for the server executable (row 20) |
| 6 | **sc. 2, `HostProcess`** — a removal that gives up is loud, prefixed and claimed; the registry is left | `src_service_defaults/tests/Support/HostProcess.cs:148-167` and the `Reaper` `:104-119` → the registry-correct adapter that removes only after the child's end is confirmed (§ 3.2) | the 14 callers (cli 5, mcp 8, server 1) | S2.1–S2.3, S2.9 (the child confirmed ended first, C1), S2.10 (parallel and duplicate removals, C2) | A held handle (Windows) or a read-only parent (POSIX) stands in for a removal that gives up. S2.9 uses a fixture child, not a real binary. A child that product code starts (for example `WslPump.RunAsync` with `FakeChild.Stubborn(_root)`, `WslPumpRunTests.cs:57`) is not started through `HostProcess.Start`, so the adapter cannot wait for it; its end stays the product's |
| 7 | **sc. 2, sockets** — socket folders are owned, under the short root, and short enough | `OwnedCreds.ShortSocketRoot`; `AgentRelayHostTests.cs:34`, `AgentRelayConnectionTests.cs:162`, `RelayLogTests.cs:84`, `AgentRelayTests.cs:121` | `CredsCli.Tests` on Linux and macOS (required legs) | S3.2: each socket's parent matches `Owned.Pattern`; its UTF-8 byte length is ≤ `AgentRelay.MaxSocketPathBytes`, computed for macOS's real roots too | The length is computed for the longest owner token. The socket path of a CHILD's runtime (F13) is not covered |
| 8 | **sc. 2, second root** — a killed run's socket folder is collected | NEW `Support/Leftovers/LeftoversSocketRootSweepFixture.cs`, `OwnedCreds.cs` | the five executables where the two roots differ (macOS by default; Linux with `TMPDIR` set) | S2.4, S2.5, S2.8 | A private pair of roots and a dead-claimed folder (unmatchable pid, clock seam) stand in for a killed run. Ownership trace (§ *Epoch 7* 8.1): S2.4(c) has a SEPARATE live process make one folder the natural way, ages it past the 10-minute floor by the clock seam only, and reads it through the real sweep with real liveness and the real `Scope.IsMine`: folder and claim survive (`live`; `foreign-uid` on an elevated Windows process) |
| 9 | **sc. 3** — the audit has teeth on three OSes | `Support/Leftovers/LeftoversSelfTest.cs` (`CREDS_LEFTOVERS_SELFTEST`, values `1` and `failed-dispose`); NEW steps in `ci-clients.yml` (after `:108`) and `ci-server.yml` (after `:86`), in the form of T-ci `ci.yml:54-71` (bash), `:106-134` (pwsh) | all five executables (Q7) on ubuntu; the four client executables on macOS and Windows | Each step green only on a NON-zero exit that carries the audit's first line, names the folder under the case's words, and leaves the temp root without it | The self-test leaks on purpose; a real leak is not this. On Windows the step proves the registry half only: the claim scan is blind there (F31). The pwsh step ends with `exit 0` and checks each run's own `$LASTEXITCODE`, or it passes for the wrong reason (the epoch-7 judge's note on coai's probe) |
| 10 | **sc. 4** — nothing leaks after a full run (by hand) | the five executables in sequence | WSL: by hand. Windows: **—, unmapped** (Q10) | WSL: the old names and `testsToDelete-<owner>-creds-*` listed before and after the five; the RED count, then 0 new | A by-hand count is a search. The owner's Windows machine does not test creds; nothing runs the five there by hand |
| 11 | **sc. 6** — the macOS leg is green with the layout self-test first; the Windows runner's owner is in the log | `ci-clients.yml` matrix leg `macos-latest` (`:54`), four new steps with `if: runner.os == 'macOS'` (the form of T-ci `ci.yml:158-188`); `RunnerFactsTests` in `CredsForDevs.ServiceDefaults.Tests` | `clients · build · test (macos-latest)` (required); the Windows leg | The log carries `darwin layout: arch=Arm64` and `getuid=<the shell's uid>`; `--filter-namespace "CredsForDevs.Tests.Leftovers"` runs before the whole executable; both run URLs on the PR (D9 #6) | `macos-latest` is Arm64 only; the x86-64 entry points never run in a PR. `release.yml`'s `osx-x64` is built on the Arm64 image too |
| 12 | **D9 #1** — the real audit is built with `Owner.This`, never the run's record | `LeftoversSweepFixture.RealAudit` (T:LeftoversSweepFixture.cs:74-75), copied unchanged | all five | Row 3's check: the fixture file differs from the template only by its listed ops, and no op touches `RealAudit`'s body | A byte check, not a behaviour test. The copied `LeftoversAuditTests` hold the behaviour |
| 13 | **Revision row 9** — the audit order on creds' own tree | No run folder exists in any creds C# suite: no `IClassFixture`, `ICollectionFixture`, `AssemblyFixture` or `IAsyncLifetime` today (`git grep`: 0); `ServerCollection.cs:9` holds no fixture. So no fixture removes a folder before the audit reads it (§ 4) | all five | S2.6: with both assembly fixtures, in BOTH disposal orders, a never-disposed folder turns the run red and is named | The fixture seam stands in for xUnit's order. If a creds suite gains a run folder later, its brief plants an orphan claim inside it and shows the RED (row 9 of the revision) |
| 14 | **Revision row 11** — a test that says "collected" on Windows re-owns its fixture first | S2.4(a), S2.7(b), the copied `LeftoversSweepTests` collection cases (they re-own, T:LeftoversSweepTests.cs:597, or pass an owner seam) | the Windows leg | The test calls `WindowsOwnership.OwnedByCaller` on the folder AND its claim before the sweep, and asserts `Scope.IsMine` of both | It proves collection of a prepared entry. A real entry of an elevated run reads as a stranger's (rows 8, 15) |
| 15 | **E2.3.S2, the Windows handoff** `[cadence e2d20eab 2]`, and **revision row 10** (F31) | NEW `src_service_defaults/tests/Leftovers/WindowsHandoffTests.cs`; `node` + the mounted reference + `src_vs_code/scripts/lib/leftovers.cjs`; `src_vs_code/scripts/run-tests.mjs:121` (`loadReferenceSweep`) | `windows-latest` (not a required check, F12) | S2.7 (a)–(e) | **It proves interoperability on PREPARED ownership**: a Node-made folder and claim are read by the C# sweep under both keys. (a)–(d) prepare the entry (re-owned or made foreign, a fixed clock, a pid no process has). **They do not prove that a real folder of an elevated run is collected: it is not; it waits for a person.** (e) is the natural trace: a Node-made folder, not re-owned, is preserved as `foreign-uid` on the elevated runner, so the limit is a fact a run checks |
| 16 | **Done-when 2** — the C# guard's scan over the tree run by hand, its list recorded | the copied `LeftoversGuard.Scan` with the discovery S3 names for E2.3 (`LeftoversGuardFiles.cs`, the two path constants of `LeftoversGuard.cs`, as path ops; Q4) | the whole tree | **—, unmapped** until Q11 is answered: the repository test is E2.5's | A by-hand scan is a search, recorded with the classes it looked for. Shell and docker findings are expected until E2.4 |
| 17 | **Revision row 4** — F29 read before the copy | § 3.0; the manifest's `about`; `research/module_tests.md` | the Windows leg | **—, unmapped**: no test (Q2) | Two creds sweeps at once on one Windows machine can report a removal they did not do, or restore a folder without its claim. No PR job runs two at once (§ 3.0) |
| 18 | **DoD** — `AllowUnsafeBlocks` in all five (each links the copy, whose `Native.cs` uses `[LibraryImport]`, T:Native.cs:445-462) | per project at `bf59e4f`: `CredsCli.Tests.csproj:9` **yes**; `CredsMcp.Tests.csproj:9` **yes**; `CredsForDevs.ServiceDefaults.Tests.csproj:9` **yes**; `BrokerClient.Tests.csproj` **no** (gains it); `CredVaultServer.Tests.csproj` **no** (gains it) | all five builds | each of the five projects built by name at 0 warnings (§ 9) | A build proves the generator ran. Nothing more |
| 19 | **The mount and Node where the copy runs** | the fetch step `git submodule update --init --depth 1 .claude/rules/shared` in `ci-clients.yml` `build-test` (before `:87`), `release.yml` `cli-binaries` (before `:370`) and `mcp-binaries` (before `:627`); `actions/setup-node` 22.x in `ci-clients.yml`, in both `release.yml` jobs and in `sonarcloud.yml` (none has it today; `leftovers.cjs` needs Node 20.19 or 22.12+, `ci-server.yml:63-67`) (Q8, R4) | every job of § 2 | S1.5: `workflowMount.test.ts` extended: a job that runs a C# test executable fetches the mount before it, and a job that runs `CredsForDevs.ServiceDefaults.Tests` sets up Node 22 before it. RED today: `ci-clients.yml:build-test`, `release.yml:cli-binaries`, `release.yml:mcp-binaries` (both halves) | A text test of the workflow; it proves the step's place, not that the job ran. `release.yml` runs only on a tag, so its first real run is the next release (testing.md: a check that only runs during a release has never run) |
| 20 | **Suite × OS: Linux** | `ci-server.yml` `build-test` (`:45-86`): `CredVaultServer.Tests`; `ci-clients.yml` `build-test` ubuntu: the other four (`:102-108`); `sonarcloud.yml:140-144`: all five | all five | The required checks `build · test`, `clients · build · test (ubuntu-latest)`, `SonarCloud Scan` green on the head | Green proves the success path on Ubuntu. The server executable runs on Linux ONLY (F14) |
| 21 | **Suite × OS: macOS** | `ci-clients.yml` leg `macos-latest`: the four client executables | four of five | `clients · build · test (macos-latest)` (required) green, with row 11's steps | The server executable never runs on macOS (F14). The two roots differ on macOS, so S2's second-root fixture runs for real only here in a PR |
| 22 | **Suite × OS: Windows** | `ci-clients.yml` leg `windows-latest`: the four client executables | four of five | That leg green on the head; read by hand, because it is not a required check (F12) | The runner is elevated: the claim scan sees nothing, a real killed-run folder is kept (F31). The server executable never runs on Windows. The owner said on 2026-11-04 "temporarily we do not test on Windows" for his own machine |
| 23 | **Suite × OS: the release runners** | `release.yml` `cli-binaries` (`:370-377`) and `mcp-binaries` (`:627-634`): three executables each on `linux-x64`, `linux-arm64`, `win-x64`, `win-arm64` (`windows-11-arm`), `osx-arm64`, `osx-x64` | `CredsBroker.Tests`, `CredsCli.Tests`, `CredsMcp.Tests`, `CredsForDevs.ServiceDefaults.Tests` | **—, unmapped** for a PR: no PR job runs these runners. Row 19's text test is the only PR check | Whether `windows-11-arm` is elevated is not measured (§ *Epoch 7* item 1). `RunnerFactsTests` prints it at the first release |
| 24 | **The shipped Node guard's remaining findings, recorded** (stories' DoD: after E2.3) | `node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"` | the files the `node` profile reads | Run on the PR head; quote the list. Measured by this brief at `bf59e4f` (from a scratch copy of the mount's `tools/` and `common/`, with `yaml@2`): **16 findings, exit 1** — 9 `raw-temp` in shell, 6 in `docker.yml`, `commandParse.test.ts:40`. Expected after E2.3: the same 16 | **It proves nothing about E2.3's sites**: the `node` profile reads no `.cs` file. Row 16 is the C# list |
| 25 | **DoD** — the docs, the build, the format | `research/module_tests.md:20` (the .NET tier row) names the helper, the two sweeps, the audit, the F29 and F31 limits; the commands at `:2106-2115` | — | a reviewer reads it; `dotnet build` at 0 warnings; `dotnet format dew_flow_creds_for_devs.slnx --verify-no-changes --no-restore` green (`ci-server.yml:75-76`) | Documentation proves nothing about behaviour |
| 26 | **The invocation inventory** (§ *Epoch 6* 8.2) | § 2, copied to the PR | every workflow job, local command and editor task | `git grep -nE "tests/bin/(Debug|Release)" -- .github .vscode '*.md'`; a reviewer compares it with § 2 | A reviewer's reading. No creds C# site is exempted because a run folder contains it: there is no run folder (row 13) |

Unmapped: rows 10 (Windows by hand, Q10), 16 (the hand-run guard, Q11), 17 (F29, Q2), 23 (the release runners, Q13).

## 2. The invocation inventory

Every place that starts one of the five executables. "Mount" is whether the job fetches `.claude/rules/shared` before
the executable runs, at `bf59e4f`. After E2.3 every invocation sweeps the temp root at start, and the socket root where it
differs, and audits at its end. A filtered run (`--filter-class`, `--filter-namespace`) sweeps too, if xUnit builds the
assembly fixture for it: **to be measured by the coder** (one filtered run, its sweep line or `LastRun`).

| Executable | Invocations (`file:line`) | Mount today | OS |
|---|---|---|---|
| `CredVaultServer.Tests` | `ci-server.yml:86`; `sonarcloud.yml:140` (under `dotnet-coverage`); local `CLAUDE.md:50-51`, `research/module_tests.md:2110`, `.vscode/tasks.json:31` | yes (`ci-server.yml:56-57`, `sonarcloud.yml:36`) | Linux only (and the operator's WSL) |
| `CredsCli.Tests` | `ci-clients.yml:102`; `sonarcloud.yml:141`; `release.yml:375`; local `module_tests.md:2111` | ci-clients: **no**; sonar: yes; release: **no** | ubuntu, macOS, Windows; six release runners |
| `CredsMcp.Tests` | `ci-clients.yml:104`; `sonarcloud.yml:142`; `release.yml:632`; local `module_tests.md:2112` | as above | as above |
| `CredsBroker.Tests` | `ci-clients.yml:106`; `sonarcloud.yml:143`; `release.yml:373`, `:630`; local `module_tests.md:2113` | as above | as above |
| `CredsForDevs.ServiceDefaults.Tests` | `ci-clients.yml:108`; `sonarcloud.yml:144`; `release.yml:377`, `:634`; local `module_tests.md:2114` | as above | as above |

The copied tests that need the mount or Node, all in `CredsForDevs.ServiceDefaults.Tests`: the owner vectors
(T:OwnerVectors.cs:11, `.claude/rules/shared/tools/fixtures/owner-vectors.json`), the janitor cross-check (Linux only,
T:LeftoversJanitorTests.cs:26-28), the guard's script classifier through `node` (T:LeftoversGuardScripts.cs:20), and the
new handoff test (Windows). The server executable runs none of these; `ci-server.yml` fetches the mount already.

## 3. The stories

### 3.0 F29, read before the copy (revision row 4)

**What F29 says.** On Windows `Directory.Move` has no single winner: two threads that move one source both succeeded in
39951 of 40000 races (coai run 41873954643). The template's sweep moves a folder into quarantine with
`Native.RenameExclusively`. With two sweeps at once over one root on Windows, one sweep can report a removal it did not do,
and one can restore a folder under its old name without its claim (later sweeps keep it as `unmarked`). No wrong deletion
was found. POSIX has a single winner. F29's "fix for the others": the template's owner takes coai's fix (a per-root named
mutex over the whole pass, `SweepLock.cs`, three ops on `LeftoversSweep.cs`) "before E2.3, E6 and E7 copy it". **That fix
is not in the template**: `dew_flow_mcp` has no commit under `tests/Mcp.Tests/Leftovers` after `197cc76` (F15).

**What it means for creds.** A creds sweep collects only the `creds` token (rule §4), so a coai, mcp or Node sweep never
races it over the same folder; the Node sweep does not move anything on Windows (F16 interim). Two creds C# sweeps race only
if two creds executables start at once on one Windows machine. Within one executable the socket-root fixture does nothing
on Windows (the roots are one), so one executable runs one sweep. CI runs the executables one after another in one job
(`ci-clients.yml:101-108`, `release.yml:370-377`, `:627-634`); `CLAUDE.md:48` says one executable at a time; the owner's
Windows machine does not test creds. The copied `LeftoversSweepTests` run their sweeps in private roots.

**What the copy does (recommended, Q2).** It copies `LeftoversSweep.cs` as it is: no mutex op. The manifest's `about` text,
`research/module_tests.md` and the PR name the limit in one sentence each: "On Windows two creds test executables started
at once can each sweep the same root; then one can report a removal it did not do, or restore a folder without its claim
(F29). Run them one at a time." Taking coai's op instead is a change (§ 6, Q2).

### 3.1 E2.3.S1 — copy the helper, link it, the CI prerequisites (Opus · Sonnet · Opus; owns sc. 1, 3, 5, 6)

**Files.** NEW `src_service_defaults/tests/Support/Leftovers/` (the helper's 33 non-test files of D1's list, plus
`DirectoryLinks.cs` and `RepositoryRoot.cs`, F4; `template-manifest.json`; creds' own `SweepRanTests.cs`); NEW
`src_service_defaults/tests/Leftovers/` (the 17 test files of the template but `LeftoversRepositoryGuardTests.cs`; creds'
own `TheAdaptedCopyTests.cs`); the five `.csproj` files; `.gitattributes`; `.github/workflows/ci-clients.yml`,
`ci-server.yml`, `release.yml`, `sonarcloud.yml` (Q12); `src_vs_code/src/test/workflowMount.test.ts`;
`research/module_tests.md` (`:20` and the commands `:2106-2115`).

**What changes.**

1. **The manifest first** (coai's form, the parent's § *Epoch 4* item 4): per entry the upstream path, the target path,
   the upstream git blob SHA at `197cc76`, and ORDERED exact-replace ops, each with its count and, beyond the namespace
   and token, a `reason`. The ops the copy needs, read in the template (`git grep -c -E "Mcp\.|\bmcp\b|MCP_"` gives 1 to 58
   per file; the full list is the coder's, checked by the test):
   - `namespace Mcp.Tests.Leftovers;` → `namespace CredsForDevs.Tests.Leftovers;` in every file; `namespace Mcp.Tests;` →
     `namespace CredsForDevs.Tests;` in `DirectoryLinks.cs` and `RepositoryRoot.cs`;
   - `OwnedToken.cs`: `RepoToken = "creds"`, `RepoRow = "the developer-credentials server and extension"`;
   - the token in text and fixtures: `mcp tests:` (six in `LeftoversAuditTests.cs`; once in `LeftoversAuditException.cs:4`,
     a doc comment — the message itself is built from `OwnedToken.RepoToken`, T:LeftoversAuditException.cs:31),
     `--token mcp`, `-mcp-pg-` (`OwnedTests.cs`), `MCP_LEFTOVERS_SELFTEST` → `CREDS_LEFTOVERS_SELFTEST`,
     `typeof(Mcp.Tests.Leftovers.LeftoversSweepFixture)`. `MCP_DARWIN_FIFO_CHILD` (T:DarwinFifoChild.cs:14) stays: it is a
     private handshake between a test and its own child, not a token;
   - the helper PATHS, and only what S3's Files list names for E2.3 (Q4): `LeftoversGuardFiles.cs`'s roots for this tree
     (D7's folders) and the two constants of `LeftoversGuard.cs`, `HelperFile` and `HelperFolder` (T:LeftoversGuard.cs:47-48,
     one folder: `src_service_defaults/tests/Support/Leftovers/`); and the path ops the copied tests need to stay true:
     the four `FoldingAllowances` entries (T:LeftoversGuard.cs:63-65) and the pin's `folder` (T:LeftoversGuardTests.cs:649)
     re-pointed to where each file now lies, so `:651`'s list keeps its four entries and `:652` (every one exists) holds;
     `TokenFile` (T:LeftoversGuardTokens.cs; `LeftoversGuardTests.cs:621`); the fixture paths of `LeftoversGuardTests.cs`;
     `RepositoryIdentity.Row` → `OwnedToken.RepoRow` (T:LeftoversGuardTests.cs:394). **Not in E2.3** (E2.5.S1's own list):
     the `docker.yml` exclusion, the wrapper as a fifth folding allowance (with its op on the pin at `:651`), and a second
     helper folder;
   - **no op for the mount path**: creds mounts at `.claude/rules/shared`, as the template does.
   The ownership, liveness and deletion code gets no op (the parent's 3.1). The manifest's `about` carries § 3.0's sentence.
2. **The test first**, then the files: `TheAdaptedCopyTests.cs` in coai's shape (`TheManifest_IsWellFormed`;
   `EveryCopiedFile_IsTheTemplateUnderTheListedReplacesOnly`, a theory per entry: undo the ops in reverse on the RAW bytes,
   compare the git blob SHA, apply forward again; `EveryLeftoversFile_IsInTheManifestOrIsCredsOwn`, with creds' own list:
   `OwnedCreds.cs`, `LeftoversSocketRootSweepFixture.cs`, `SweepRanTests.cs`, `TheAdaptedCopyTests.cs`,
   `WindowsHandoffTests.cs` and the other own tests of § 3.2–3.5; `ACountBelowTheTemplatesOccurrences_IsRefused…`).
   With `CREDS_TEMPLATE_REPO` naming a local `dew_flow_mcp` checkout, a red names the first differing line.
3. **`.gitattributes`**: one `-text` line per copied file (coai's form, never a glob), so a Windows checkout with
   `core.autocrlf` keeps the bytes (F6).
4. **The links.** One wildcard per other project, the existing `Support/` form:
   `<Compile Include="..\..\src_service_defaults\tests\Support\Leftovers\*.cs" Link="Support\Leftovers\%(Filename)%(Extension)" />`.
   `AllowUnsafeBlocks` in `BrokerClient.Tests.csproj` and `CredVaultServer.Tests.csproj`. The test files of
   `src_service_defaults/tests/Leftovers/` compile in `CredsForDevs.ServiceDefaults.Tests` only (D1). That project does not
   set `JsonSerializerIsReflectionEnabledByDefault`; the three client projects set it to false
   (`BrokerClient.Tests.csproj:13`, `CredsCli.Tests.csproj:14`, `CredsMcp.Tests.csproj:15`), and
   T:LeftoversGuardScriptsTests.cs:24 serialises an anonymous type, so it must not move there.
5. **CI** (Q7, Q8, R4): the mount fetch and `setup-node` 22.x in `ci-clients.yml` and in `release.yml`'s two binary jobs;
   the teeth steps (row 9); the macOS steps (row 11): the Arm64 check with uid and system printed, the layout self-test
   with its three greps, `--filter-namespace "CredsForDevs.Tests.Leftovers"` before the whole executable. Every job builds
   EACH test project it runs by name, before it runs it (G1/G5): the solution holds three of the five
   (`dew_flow_creds_for_devs.slnx`: server, mcp, service-defaults tests), so `ci-server.yml:79`'s solution build is enough
   only for `CredVaultServer.Tests`; `ci-clients.yml:89-92`, `sonarcloud.yml:133-136` and `release.yml:372-376`,
   `:629-633` already build theirs by name. GitHub runs a `bash` step with `-e`, so a failed build stops the job
   before any executable runs, and the job starts from a fresh checkout with no `bin/`: an executable it runs exists
   only because that step built it. § 9 says the local check.
6. **The first build** measures one thing the copy cannot fix by editing (F16): the template files say `using Xunit;`, and
   all five projects add a global `<Using Include="Xunit" />`. If that warns under `TreatWarningsAsErrors`
   (`Directory.Build.props:8`), the answer is project-level (a `NoWarn` of that one id in the five `.csproj`, with the
   reason), never an edit of a copied file.

**RED-first tests.** Each fails before its code; the premise is asserted in the test.

| # | Assertion | Premise it checks | RED today |
|---|---|---|---|
| S1.1 | every manifest entry's target equals the template blob under its listed ops | the manifest names `197cc76` and 52 entries | every target is missing |
| S1.2 | every `.cs` file of the two folders is a manifest target or on creds' own list; `sonarcloud.yml`'s `sonar.exclusions` names exactly the manifest's targets (Q12) | the scan finds more than 50 files | the folders do not exist; by hand after GREEN: one new unlisted file → red |
| S1.3 | by hand, recorded: one byte changed in a copied file (and, once, one op's count lowered) → S1.1 red, naming the file and the op | the file is a manifest target | — (a mutation, run once) |
| S1.4 | `SweepRanTests`, in each of the five: `LeftoversSweepFixture.LastRun` is not null. (Its socket-root half is S2.8: S1's commit must compile without S2's fixture, R6.) | the test class takes the fixture through its constructor | with the `[assembly: AssemblyFixture]` line removed (the fixture file without that op), xUnit refuses the constructor: "did not have matching fixture data" |
| S1.5 | `workflowMount.test.ts`: (a) a job that runs a C# test executable (`tests/bin/(Debug|Release)/`) fetches the mount before it; (b) a job that runs `CredsForDevs.ServiceDefaults.Tests` runs `actions/setup-node` with `22.x` before it; the companion still finds `ci-server.yml:build-test` and the SonarCloud job as C#-running jobs | the companion finds ≥ 2 jobs | (a) and (b): `ci-clients.yml:build-test`, `release.yml:cli-binaries`, `release.yml:mcp-binaries`; (b) also `sonarcloud.yml`'s job, which today runs on the image's own Node (no `setup-node` there): it gains the step too |
| S1.6 | the teeth (row 9), by hand once on Linux: the audit made a no-op by a temporary edit of the fixture → the bash step's script prints "did not fail the run"; file restored | the self-test case ran (its folder exists before the end) | — (the step does not exist) |

**Exit paths.** The assembly fixture's constructor never throws (a sweep error is one line); its disposal is the audit,
which throws. A run killed by SIGKILL leaves its folders claimed; the next run's sweep collects them after 10 minutes on
POSIX and on Windows when the run was not elevated (F31). The layout gate on macOS: a failed `DarwinLayout.Require` means no
sweep and no audit removal, one line.

### 3.2 E2.3.S2 — the socket root, the `HostProcess` adapter, the Windows handoff (Opus · Sonnet · Opus; owns sc. 2's `Remove` and second-root parts)

**Files.** NEW `Support/Leftovers/OwnedCreds.cs`, `Support/Leftovers/LeftoversSocketRootSweepFixture.cs`;
`src_service_defaults/tests/Support/HostProcess.cs` (`Start` `:27`, the `Reaper` `:104-119`, `TempDirectory`/`Remove`
`:148-167`); NEW tests in `src_service_defaults/tests/Leftovers/` (`SocketRootSweepTests.cs`, `HostProcessAdapterTests.cs`,
`WindowsHandoffTests.cs`) and the socket-root half of `Support/Leftovers/SweepRanTests.cs`.

**What changes.**

- `OwnedCreds.ShortSocketRoot`: `"/tmp"` on Linux and macOS, `Owned.TempRoot()` on Windows; the one `"/tmp"` under an
  inline `raw-temp` exemption marker. `OwnedCreds.Canonical(path)`: the path with EVERY link of every component followed
  (realpath(3) on POSIX; the template's `Native.FinalPathOfFollowing` on Windows, T:Native.cs:261). Not
  `Path.GetFullPath`, which follows no link: on macOS `/tmp` is a link to `/private/tmp`, and `$TMPDIR` lies under `/var`,
  a link to `/private/var`.
- `LeftoversSocketRootSweepFixture` (its own `[assembly: AssemblyFixture]`): when `Canonical(ShortSocketRoot)` differs
  from `Canonical(Owned.TempRoot())`, it runs the copied `LeftoversSweep.Run` over `ShortSocketRoot` through
  `LeftoversSweepFixture.GuardedSweep` at start, and `LeftoversSweepFixture.RealAudit(ShortSocketRoot,
  OwnedDir.Unreclaimed())` through `GuardedAudit` at the end (D9 #9). When the two are one, the main fixture's sweep IS the
  sweep of that root, and this fixture runs none; `LastRun` records which. A seam constructor takes the roots, the sweep,
  the report and the audit, as the template's fixture does (T:LeftoversSweepFixture.cs:26).
- **The adapter, the map (C2).** `HostProcess.TempDirectory(what, warn = null)` calls `OwnedDir.Create(what, null, warn)`
  (T:OwnedDir.cs:35): the warning sink travels with that one folder, so no static, shared warning delegate exists for
  parallel tests to race on. It keeps the `OwnedDir` in a static `ConcurrentDictionary<string, OwnedDir>` keyed by its
  path and returns the path. `HostProcess.Remove(path, warn = null)` takes the entry out with ONE atomic `TryRemove`; only
  the call that won it calls `Dispose()`. A second `Remove` of the same path, or of a path `TempDirectory` did not give, is
  one warning and nothing removed. Never `Removal.Quietly` on the path, never `Directory.Delete`. A dispose that gives up
  keeps the `OwnedDir` in the helper's own registry as `DisposeAttempted` (T:OwnedDir.cs:62-72: the entry leaves only when
  folder AND claim are gone), so the end-of-run audit fails the run.
- **The child ends first (C1).** Today the `Reaper` (`:104-119`) calls `Kill(entireProcessTree: true)` and returns at once,
  so the class's `Dispose` can remove the folder while the child still writes in it. The stories say the child "is a
  `using` inside the test, so it is gone before xUnit disposes the class and its scope" (S3, the dispose-order sentence);
  this makes "gone" true. `Start` ties the child to each registered folder that one of its arguments or environment
  values names or lies under (the callers pass the folder, for example `VersionTests.cs:96`, `AgentRelayHostTests.cs:50`).
  The `Reaper` kills the tree, then waits with a bound (`WaitForExit(TimeSpan)`, which does not wait for the pipes). If the
  exit is confirmed, the tie ends. If not, the tie stays, and the `Reaper` throws one exception naming the pid and the
  folder: the test fails visibly. `Remove` of a folder with a tie still open keeps it (one warning; it stays registered,
  so the audit is red too).
- Children's temp paths (Q5, F13): **to be measured by the coder's RED first** — one run of `CredsMcp.Tests` and
  `CredsCli.Tests` with a private short `TMPDIR`, new entries listed. If a killed child leaves `dotnet-diagnostic-*` or
  `clr-debug-pipe-*` there, `Start` hands `TMPDIR`, `TEMP` and `TMP` = an owned folder under `ShortSocketRoot` to the child
  (rule §2). If nothing appears, nothing is built.

**RED-first tests.**

| # | Assertion | Premise it checks | RED today |
|---|---|---|---|
| S2.1 | after `TempDirectory("mcp-pump")`: the folder matches `Owned.Pattern` and its claim exists; after `Remove`: the folder is gone and `OwnedDir.Unreclaimed()` has no entry with that path | the folder existed and was registered (asserted between the two calls) | the name is `mcp-pump-<guid>`, unprefixed, no claim. By hand after GREEN: `Remove` through `Removal.Quietly(path)` instead of `Dispose()` → the registry assertion red (D9 #18; F19) |
| S2.2 | a file under a `TempDirectory` folder held with `FileShare.None` (Windows) or a read-only subfolder (POSIX; skipped as root, saying why) → `Remove` returns, the test's OWN warn sink got ONE line, the folder still matches the pattern and keeps its claim, the entry is `DisposeAttempted`, and `LeftoversAudit.Run` over a private root with that registry throws, naming it under `disposed but not removed`; then made removable and disposed by the test | the removal really failed (the folder exists after `Remove`) | `main` swallows the failure: no line, an unclaimed, unprefixed folder, nothing for an audit to see |
| S2.3 | `Remove` of a path `TempDirectory` did not give → one warning, the path untouched | the path exists before and after | `main` deletes it |
| S2.4 | with a private pair of roots that differ: (a) a dead-claimed `testsToDelete-<owner>-creds-sock-*` folder (unmatchable pid, clock 11 minutes on) in the SECOND root is removed by the socket-root fixture — on Windows only after `WindowsOwnership.OwnedByCaller` on the folder and its claim (revision row 11; T:LeftoversSweepTests.cs:597); (b) the main fixture's sweep alone keeps it (it reads the other root); (c) a SEPARATE process, still alive, makes one folder the natural way (`OwnedScope.Dir("sock", root2)`); the sweep's clock is set 11 minutes on, so the age is past the floor, and liveness is real: folder AND claim survive as `live`; on an elevated Windows process the reason is `foreign-uid` (the owner is asked before liveness, T:LeftoversSweep.cs:273), asserted as such (§ *Epoch 7* 8.1) | each folder and its claim exist before (asserted); the producer's pid is alive at the sweep (asserted); without the clock seam (c) would read `young` (asserted once) | the fixture does not exist |
| S2.5 | the socket-root fixture with a layout seam that throws: no sweep runs, one report line, no audit removal (D9 #9) | the seam was called | the fixture does not exist |
| S2.6 | both fixtures over a private pair of roots, disposed in BOTH orders: a never-disposed folder makes the run fail, and the message names it under `never disposed` | the folder is registered before the disposals | the fixture does not exist |
| S2.7 | **Windows only** (skipped elsewhere, saying why). A `node -e` child loads `leftovers.cjs` and makes `ownedDir` in a private root handed as `TEMP`/`TMP`; the claim's pid is rewritten in place to `UnmatchablePid`; clocks 11 minutes on. (a) the Node sweep, loaded through `loadReferenceSweep` and called with `{ tmp, token: 'creds', now }`, keeps it and lists `unverified: <path>`. The C# sweep then judges four twins: (b) both keys right — folder and claim re-owned with `OwnedByCaller`, inside the profile → collected; (c) the claim's owner SID foreign only (`ForeignToCaller` on the claim, its SID branch) → kept, listed; (d) outside the profile (`CommonDocuments`) with the caller's SID on both → kept, listed; (e) the natural output, NOT re-owned, on an elevated process (`WindowsPrincipal.IsInRole(Administrator)`; skipped when not elevated, saying why) → preserved as `foreign-uid` | (a) the `unverified:` line names THIS folder, so the Node sweep read it as its own token's, not `other` (F9); (b) `Scope.IsMine` of folder and claim asserted true; (c) the branch printed (`LastForeignBranch` is the SID one; skipped, saying why, if the token may not own `Administrators`); (d) the path is outside the profile and the SIDs are the caller's (asserted) | the test file does not exist; by hand after GREEN: (b) without the re-owning → kept as `foreign-uid` on the elevated runner, which is (e)'s fact |
| S2.8 | `SweepRanTests`' socket-root half, in each of the five: where the canonical roots are one, `/tmp` (the temp root) was swept exactly once and the socket-root fixture ran no second sweep; where they differ, the socket-root fixture's `LastRun` names `/tmp`. A unit test of `Canonical`: on macOS `/tmp` and `/private/tmp` give ONE sweep; macOS's `$TMPDIR` and `/tmp` give TWO | the two roots and their canonical forms are printed | the fixture does not exist |
| S2.9 | C1: a fixture child started through `HostProcess.Start` holds a file open in its `TempDirectory` folder; the test's assertion fails inside the `using` of its `KillOnDispose`; the class disposes. The folder goes only AFTER the child's exit (its exit time, from the `Process`, is before the folder's removal, recorded by a removal hook). Where the OS allows (Linux), a surviving-descendant case: the child starts a grandchild that holds the file and outlives a kill of the child alone; the folder stays until the tree is confirmed ended, or stays claimed with the `Reaper`'s exception | the child was alive and held the file when the assertion failed (asserted by its printed pid and an open handle) | `main`'s `Reaper` does not wait: the removal can come before the exit (seen as the order of the two times, or on Windows as a refused delete) |
| S2.10 | C2: (a) many independent `TempDirectory`/`Remove` pairs on parallel tasks, each with its own warn sink: each folder removed once, each sink holds only its own lines; (b) `Remove` twice on one path: one `Dispose()` (a counting hook), the second call one warning; (c) a failed dispose (S2.2's set-up) → the audit over that registry is red | the tasks really overlap (a barrier) | (a) the shared-path folders are unprefixed; (b) `main` deletes twice silently; (c) as S2.2 |

**What the stories call `unknown` (R5).** E2.3.S2 says: "the same folder with its claim's owner SID set to another
account's … → the C# sweep keeps it as `unknown`, listed." The template's label for that case is `foreign-uid`
(T:LeftoversSweep.cs:273; listed as `foreign:` at :299). The stories' word is a wrong name for it, not another behaviour:
S2.7(c) asserts what the stories mean — kept, listed, not collected — and records the label `foreign-uid`.

**Exit paths.** `Remove` never throws; the `Reaper` throws only when the child's end is not confirmed. A class whose
constructor throws after its field initializer called `TempDirectory` is never disposed; its folder stays registered and
the audit names it (a red run, as it should be). A child that outlives its test keeps its folder: the `Reaper`'s exception
fails the test, and the audit names the folder.

### 3.3 E2.3.S3 — the client, process and socket sites (Opus · Sonnet · Opus)

**The migration pattern** (E3 S4): a class that makes folders becomes `IDisposable` with
`private readonly OwnedScope _owned = new();` and `public void Dispose() => _owned.Dispose();`; xUnit v3 disposes it after
each test, passed or failed. A `what` is the old leaf without its `creds-`/`cred-vault-` lead. Darwin-sensitive tests use
`DarwinLayout.FreshOwnedScope()` (D9 #10).

| Site at HEAD | Change |
|---|---|
| the 14 `HostProcess.TempDirectory` callers: `AgentRelayConnectionTests.cs:23`, `AgentRelayHostTests.cs:29`, `RelayLogTests.cs:16`, `RelayPipeEndingTests.cs:55`, `StaleWindowsProcessTests.cs:26`; `ParentWatchProcessTests.cs:24`, `ServerEndsWithClientTests.cs:24`, `ServingLogTests.cs:28`, `StaleWindowsTests.cs:23`, `ToolCancellationTests.cs:29`, `VersionTests.cs:15`, `WslPumpHostTests.cs:30`, `WslPumpRunTests.cs:27`; server `StartupRefusalProcessTests.cs:33` (S4) | the argument only (`"creds-mcp-pump"` → `"mcp-pump"`); the 14 `Remove` calls stay |
| `AgentRelayHostTests.cs:34`, `AgentRelayConnectionTests.cs:162`, `RelayLogTests.cs:84` (`/tmp/cr-<9 hex>.sock`) | `Path.Combine(_owned.Dir("sock", OwnedCreds.ShortSocketRoot), "cr.sock")`: 49 bytes with `u501` |
| `AgentRelayTests.cs:121` (the corpse, length asserted `:122-124`) | `Path.Combine(_owned.Dir("corpse", OwnedCreds.ShortSocketRoot), "c.sock")`; the assertion kept, and `Encoding.UTF8.GetByteCount(path)` ≤ `AgentRelay.MaxSocketPathBytes` `[cadence e2d20eab 3]` |
| `AgentRelayTests.cs:153` (`Directory.CreateTempSubdirectory("creds-relay-long")`, `finally` delete), `:275` (the logs folder, `finally` delete) — **not in the stories' table** (F3) | `_owned.Dir("relay-long")`, `_owned.Dir("relay-logs")`; the `finally` deletes go |
| `src_broker_client/tests/EndpointsTests.cs:16`; `SessionTitleTests.cs:22`; `src_service_defaults/tests/CredsLoggingTests.cs:14` | `_owned.Dir("endpoints")`, `"title"`, `"log-tests"`; hand-written `Dispose` bodies go |
| nothing created: `AgentRelayTests.cs:105`, `RelayPipeEndingTests.cs:41`, `EndpointsTests.cs:80`, `LogRootTests.cs:17`, `:18`, `:44` | `Owned.TempRoot()` in place of `Path.GetTempPath()`, under the guard's marker (E3 review fix D) |
| string literals that create nothing: `AgentRelayTests.cs:33-34`, `:278`, `CallerIdentityTests.cs:196` | no change; listed for E2.5's guard |

**RED-first tests.**

| # | Assertion | Premise it checks | RED today |
|---|---|---|---|
| S3.0 | a scan test over `src_cli/tests`, `src_mcp/tests`, `src_broker_client/tests`, `src_service_defaults/tests` (helper folder excluded) with the copied guard's `raw-temp` reading (it flags the API calls and a `/tmp` or `/var/tmp` path literal, T:LeftoversGuard.cs:132): the findings outside a marker EQUAL an exact expected list — the four lines that create nothing and stay for E2.5's guard: `AgentRelayTests.cs:33`, `:34`, `:278`, `CallerIdentityTests.cs:196` (Q11). Not zero: a zero would be red until E2.5 | the scan reads more than 50 `.cs` files (56 in these trees today) and finds the sanctioned line in `OwnedCreds.cs` (testing.md: a scan gets a companion) | by `git grep` in these four trees, 20 lines: 13 API lines (`HostProcess.cs:151` among them), 3 `/tmp` socket lines, the 4 lines of the list; the guard's own count **to be measured by the coder's RED**, and the expected list corrected to the guard's reading only if the RED shows the guard reads one of the four otherwise (said on the PR) |
| S3.1 | each of the 14 callers' folders matches `Owned.Pattern` (one test through `HostProcess`, S2.1, plus the scan) | — | covered by S2.1 and S3.0 |
| S3.2 | the four socket paths: parent matches `Owned.Pattern`; UTF-8 bytes ≤ `MaxSocketPathBytes`; on Linux AND macOS | the socket was bound (the test's own assertion still runs) | the parent is `/tmp` itself |

**Exit paths.** A failed assertion: xUnit disposes the class, the scope removes. A child still running: `KillOnDispose`
(`HostProcess.cs:102`) is a `using` inside the test; after S2 it waits for the confirmed end, so the child has ended before
the class's `Dispose`, or the folder stays (S2.9). A held file on Windows: one warning, the folder kept claimed, the audit red.

### 3.4 E2.3.S4 — the server factories, `VaultServer`, the store tests (Opus · Sonnet · Opus)

| Site at HEAD | Change |
|---|---|
| `VaultServer.cs:44-45` (`cred-vault-tests/<guid>`), removed in `Dispose(bool)` `:111-121` | `DataDir` from an `OwnedDir.Create("vault")` held in a field; `Dispose(bool)` disposes it after `base.Dispose` and the environment restore; no shared parent |
| `LoginKeyStoreTests.cs:21`, `OrgBlockingWithdrawalTests.cs:53`, `OrgProjectsStoreTests.cs:16`, `ShareMaintenanceTests.cs:25`, `OrgRecoveryMaintenanceTests.cs:19` | `_owned.Dir("tests")` (or a closer `what`); the factories become instance methods |
| ctor-made: `OrgEventLogQueryTests.cs:24`, `OrgEventLogTests.cs:19`, `OrgMembersStoreTests.cs:25`, `OrgSettingsStoreTests.cs:16`, `OrgRegistrationTests.cs:50`, `StartupGuardsTests.cs:11` | `_owned.Dir(...)`; the hand-written `Dispose` bodies go |
| `LoggingSinkTests.cs:69`, `:101`, `:153` (the last-statement delete `:162`) | `_owned.Dir("logsink")`, `"retention"`; the `try/finally` deletes and `:162` go |
| `StartupGuardTests.cs:29`, `:165` | `_owned.Dir("guard-logs")`; the `not-a-directory` FILE inside `_owned.Dir("guard-file")` |
| `StartupRefusalProcessTests.cs:33` | `HostProcess.TempDirectory("vault-refusal")` |

Dispose order: the live host is a `using` inside the test (`ShareMaintenanceTests.cs:126`), so it is gone before the class
disposes its scope. The listing assertions (`StartupGuardsTests.cs:48`, `BackupArchiveTests.cs:207`, `:262`,
`BackupStoreTests.cs:186`, `BackupRunnerTests.cs:163`, `OrgProjectsStoreTests.cs:56`, `HostProcess.cs:137-138`) stay green
because the claim is a SIBLING, never inside.

**RED-first tests.** S4.0: the scan of S3.0 extended to `src_minimalapi_server/tests` (24 API lines there by `git grep`; the
guard's count **to be measured**); the expected list stays the four lines of S3.0. S4.1: one `using (new VaultServer())`: its `DataDir` matches `Owned.Pattern`; after the
dispose, the folder is gone and the registry has no entry; no `cred-vault-tests` folder was made (RED on `main`: the parent
exists and the name is a GUID).

**Exit paths.** A failed assertion; a host that has not released a handle (Linux only: the server executable runs nowhere
else, F14); `Corp.Undeletable` (`Corp.cs:219`) is a `using` inside its tests (`LoginKeyStoreTests.cs:226`,
`OrgBlockingWithdrawalTests.cs:110`), so it ends before the class disposes.

### 3.5 E2.3.S5 — the backup sites, the AOT kit, the proofs (Opus · Sonnet · Opus)

| Site at HEAD | Change |
|---|---|
| `BackupArchiveCommandTests.cs:276` (`NewPath`), `BackupArchiveTests.cs:484` (`NewPath`, the unique parent on purpose, `:477-482`; `NewDir` `:488` uses it), `BackupKeyFileTests.cs:148` (a clear-text key, `:141`), `BackupRunnerTests.cs:784`, `BackupStoreTests.cs:482` | `_owned.Dir("backup-cli")`, `"backup"`, `"key-file"`, `"backup-run"`, `"backup-store"`; where a unique parent is the point, the owned folder IS that parent |
| `BackupKeyFileTests.cs:92` (nothing created) | `Owned.TempRoot()` under the marker |
| `BackupArchiveCommandTests.cs:143` (`cred-vault-aot-kit`, a FIXED leaf, the commands in the comment `:139-140`) | `_owned.Dir("aot-kit")`; the test prints the kit's path and the two command lines; `CREDS_AOT_KIT_DIR` names a person's own folder (never set in CI) |

**RED-first tests.** S5.0: the scan of S4.0 over these files. S5.1, **POSIX and WSL only** (the server executable runs on
Linux only, F14, and two executables at once on Windows meet F29): the kit test prints a
`testsToDelete-<owner>-creds-aot-kit-<id>` path that is gone after the run; two executables started at once print two
different paths and both pass. The RED, said honestly: on `main` two runs overwrite the one fixed folder and both still
pass, so the overlap does not fail; the RED is the printed path — on `main` it is not owner-form
(`cred-vault-aot-kit`) and it is still there after the run. S5.2 by hand: sc. 2's counts (row 5) and sc. 4 (row 10),
before and after.

**The proofs to record on the PR.** sc. 2's counts per executable; sc. 4 on WSL; the hand clean-up (row 2); the barrier
rescan (row 1); the Node guard (row 24); the C# guard list (row 16); the run URLs of rows 9, 11, 15, 22.

## 4. The audit order (revision row 9)

Creds' C# suites have **no run folder**. No suite has a class, collection or assembly fixture today (`git grep -n -E
"IClassFixture|ICollectionFixture|AssemblyFixture|IAsyncLifetime"` over the five test trees: 0), and `ServerCollection.cs:9`
only turns parallel runs off. After E2.3 the only fixtures are the two assembly fixtures of § 3.1 and § 3.2. Neither holds a
folder that the other reads, and each audit reads its root directly. So coai's fault (a run folder the fixture removed
before the audit read it, the parent's row (o)) cannot happen here. S2.6 pins that the order of the two disposals does not
change the verdict. The claim scan is off in a process that writes another run's record (`Owner.RunRecord`,
T:LeftoversAudit.cs:41); no creds runner exports `TESTSTODELETE_RUN` to a C# executable, so the claim scan stays on, except
on an elevated Windows run (F31).

## 5. What is NOT in E2.3

- **E2.4** — `owned.sh`, the shell scripts, the Docker smoke, acme. **E2.5** — `LeftoversRepositoryGuardTests` over a
  clean tree, `LeftoversGuardCredsTests`, the `docs.yml` steps, the exemptions across the repository.
- **F29's mutex** (Q2) and **F31's fix**: the template's and the rule's, not this copy's. **F16's fix** (Node collection on
  Windows): the conventions repository's.
- The WSL harnesses' run folders; the product's own paths (the in-process host's `logs/`, `Logging.cs:39-42`).
- **Side findings, todos, not built here:** `ci-clients.yml:89-92`, `ci-server.yml:79`, `sonarcloud.yml:134-136` and
  `release.yml:372-377`, `:629-634` build without `-m:N` (`csharp/dotnet-build.md` § 2); the solution file carries three of
  the five test projects (`dew_flow_creds_for_devs.slnx`).

## 6. Open questions, each with a recommended answer

Each goes to the coordinator before the plan gate. **A "yes" marked CHANGE would be entry 7.2 of the parent: the seventh
full stop.**

- **Q1 — one pull request or several.** Each story is Opus · Sonnet · Opus, and the copy alone is 52 files. *Recommended:
  ONE pull request*, the stories as an ordered commit series (S1 → S5, each RED then GREEN), one plan gate, one code gate,
  and one Opus review per story's commit range before the code gate. Reason: D8 and the parent's entry 1.6 fix "five
  per-epic PRs", one per epic, each with one plan gate and one code gate. A split (for example S1+S2, then S3, then S4+S5)
  would make smaller reviews, and its first PR would still be complete (the sweep, the audit and the adapter land
  together), but it changes the build order and the merge conditions: **CHANGE**. The size of the copy is answered by the
  manifest: a reviewer reads the ops, not 52 files.
- **Q2 — F29 (§ 3.0).** *Recommended:* copy `LeftoversSweep.cs` with no mutex op; record the limit in the manifest,
  `module_tests.md` and the PR; report to the parent that F29's "the template's owner fixes it before E2.3 copies" did not
  happen (F15). Not a change: the stories ask only that F29 is read (revision row 4). The other answers: (B) take coai's
  `SweepLock.cs` and its three ops — an algorithm change the parent's 3.1 allows only "separately reviewed": **CHANGE**;
  (C) wait for the template's fix and copy a later commit than `197cc76`: **CHANGE**.
- **Q3 — `DirectoryLinks.cs`, `RepositoryRoot.cs`** (F4). *Recommended:* yes, copy both into `Support/Leftovers/` (they
  must compile in all five: T:DarwinLayout.cs:130 calls `DirectoryLinks.Run`, T:OwnerVectors.cs:11 reads
  `RepositoryRoot.Path`), namespace op `Mcp.Tests` → `CredsForDevs.Tests`. Not a change: the parent's 3.1 manifest lists
  them, and revision row 3 adopts 3.1.
- **Q4 — the guard's discovery, E2.3 or E2.5** (revised after the Opus review, R3). *Answer:* E2.3 makes only what S3's
  Files list names: "`LeftoversGuardFiles.cs` and the two constants of `LeftoversGuard.cs` rewritten for D7", as PATH ops,
  plus the path ops the copied tests need to stay true (`FoldingAllowances`' four entries and the pin's `folder`,
  T:LeftoversGuardTests.cs:649-652, so `:652`'s "all of them exist" holds). The `docker.yml` exclusion, the wrapper as a
  folding allowance (and its op on the pin at `:651`), and a second helper folder are E2.5.S1's: its own list reads "the
  `docker.yml` exclusion and the wrapper's folding allowance pinned, `LeftoversRepositoryGuardTests` over a clean tree,
  `LeftoversGuardCredsTests`". The parent's op rule (§ *Epoch 4* item 4) permits ops of named kinds — namespace, token,
  mount path, helper paths and folders, `RepositoryIdentity.Row` — and the edits each story lists; an exclusion or an
  added allowance is a creds addition, so it lands with the story that lists it. Not a change: each item lands where the
  stories put it.
- **Q5 — temp paths of `HostProcess` children** (F13). *Recommended:* measure first (§ 3.2); build the hand-over only if
  the RED shows an entry. Not a change: rule §2's "a child that makes temp paths gets an owned folder" binds already, and
  the stories' goal is "no xUnit test here leaves a folder or file in either root on any path".
- **Q6 — the socket-root fixture when the roots are one** (F10, R5, C3). *Answer:* "differ" is decided on CANONICAL paths
  (every link followed, `OwnedCreds.Canonical`; not `Path.GetFullPath`), as D4 says ("when they differ") and as Node's
  `rootsOf` does (`run-tests.mjs:113-115`). Where they are one, the main fixture's sweep is the run over that root and the
  socket-root fixture runs none. Sc. 1 says "on Linux and macOS it takes `LeftoversSocketRootSweepFixture` too and asserts
  its run over `/tmp`." That holds on Linux too: with one canonical root (`/tmp`), the one sweep IS the run over `/tmp`, and
  S2.8 asserts that `/tmp` was swept exactly once (no second sweep); on macOS it asserts the second fixture's run over
  `/tmp`. Proof of the canonical rule: `/tmp` and `/private/tmp` give one sweep; macOS's `$TMPDIR` and `/tmp` give two
  (S2.8). Not a change.
- **Q7 — the teeth: which executables, which shell.** *Recommended:* every executable the job runs (five on ubuntu, four
  on macOS and Windows): the fixture is linked into each, and one missed link would leave that executable with no audit.
  bash on Linux and macOS, `pwsh` on Windows (a step with `if: runner.os == 'Windows'` and `shell: pwsh`), checking each
  run's own `$LASTEXITCODE` and ending `exit 0`, as T-ci `ci.yml:106-134`. Not a change.
- **Q8 — the mount and Node in more jobs** (F7, F11). *Recommended:* yes, as § 3.1 item 5 and row 19; `setup-node` 22.x in
  `ci-clients.yml`, in `release.yml`'s two binary jobs (R4) and in `sonarcloud.yml`, with `node --version` printed once. Not a change: E2.1 did the same for `release.yml`'s extension job
  (E2.1 deviation 8).
- **Q9 — raw bytes on Windows** (F6). *Recommended:* `-text` per copied file in `.gitattributes`, coai's form. Not a change.
- **Q10 — sc. 4 on Windows.** *Recommended:* one recorded hosted run on a throwaway branch, in the shape of E2.1's
  `windows-unit` job (the consultants' decision `867ea464` lets it count as by hand): the four client executables, old
  names and owner-form entries listed before and after. The server executable's Windows cell is recorded as not run (it
  never runs on Windows). Not a change.
- **Q11 — the C# list by hand, and an automated site RED.** *Recommended:* (a) for Done-when 2, the coder runs the
  template's `LeftoversRepositoryGuardTests` locally with the manifest's ops, NOT committed, and records its list on the PR
  as a search with the classes it read; (b) S3.0/S4.0/S5.0 are one committed scan test (the copied guard's reading,
  `raw-temp` only, the five test trees), the automated RED of the site stories, in the role `leftoversSites.test.ts` had in
  E2.1. Not a change: a test that proves a Done-when item.
- **Q12 — SonarCloud and the copy.** A copied file cannot be edited to answer a Sonar issue. *Answer (R9):* add the 52
  copied files to `sonar.exclusions` (`sonarcloud.yml:115`) BY NAME, never a folder glob, so creds' own files in the same
  two folders (`OwnedCreds.cs`, the fixtures, the tests) stay analysed; the manifest's target list is the source of the
  names, and S1.2 asserts that the exclusion names exactly the manifest's targets. Not a change.
- **Q13 — the release runners** (row 23). No PR job runs `linux-arm64`, `windows-11-arm` or `osx-x64`. *Recommended:*
  accept the row as unmapped for the PR: S1.5 pins the mount step in both release jobs, and the first release after E2.3
  records `RunnerFactsTests` (is `windows-11-arm` elevated?) in the stories' build record. A throwaway dispatch of the two
  jobs before the merge would map it, at the cost of a release-shaped run. Not a change either way.

### The coordinator's answers (2026-11-07)

Every answer below is the brief's recommendation, chosen so that E2.3 makes no plan change (epoch 7 has none left).

- **Q1:** one pull request, the stories as an ordered commit series, one plan gate, one code gate, an Opus review per
  story's commit range.
- **Q2:** (A): copy `LeftoversSweep.cs` with no mutex op; record F29's limit in the manifest, `module_tests.md` and the PR;
  tell the parent that the template's fix did not happen before E2.3 (F15).
- **Q3:** yes, copy both files.
- **Q4 (reversed after the Opus review, R3):** E2.3 makes only what S3's Files list names — `LeftoversGuardFiles.cs` and
  the two constants of `LeftoversGuard.cs`, as path ops, with the path ops the copied tests need (T:LeftoversGuardTests.cs:652).
  The `docker.yml` exclusion, the wrapper as a folding allowance (its op on the pin at `:651`) and a second helper folder
  are E2.5.S1's, by E2.5.S1's own list and the parent's op rule. Not a change.
- **Q5–Q13:** yes, as recommended. Q13's release-runner row stays unmapped for the PR.

## 7. Integration findings

Each is a difference between the stories document and the code or the template at `bf59e4f` / `197cc76`. None is resolved
here. **CHANGE** marks one that would be a plan change if its alternative were accepted; with § 6's recommended answers,
none is.

- **F1 — moved anchors.** `ci-server.yml`'s `Test` is `:86` (the stories: `:68`); the local commands are
  `module_tests.md:2106-2115` (the stories: `:1723-1730`); the template's teeth are T-ci `ci.yml:54-71`, `:106-134`, and its
  macOS steps `:158-206` (the stories: `:49-70`, `:103-120`, `:144-200`); the corpse test is `AgentRelayTests.cs:110-134`;
  the required legs are `branch-protection.json:21-22` (the stories: `:22-23`).
- **F2 — the count holds.** 36 API lines in 25 test files, plus `HostProcess.cs:151` = the stories' 37 in 26; 14 callers;
  3 `/tmp` sockets: 54. No C# temp line changed since `47724fd` (`git diff 47724fd HEAD -- 'src_*/tests/**/*.cs'`).
  Commands: `git grep -n -E "GetTempPath|GetTempFileName|CreateTempSubdirectory" -- 'src_*/tests/*.cs' 'src_*/tests/**/*.cs'`;
  `git grep -n "HostProcess.TempDirectory(" -- 'src_*/tests/*.cs'`.
- **F3 — two sites the table lacks**: `AgentRelayTests.cs:153`, `:275` (both removed in a `finally`). § 3.3 maps them.
- **F4 — the template reaches outside its folder**: `DirectoryLinks.cs`, `RepositoryRoot.cs` (namespace `Mcp.Tests`) and
  `RepositoryIdentity.Row` (T:LeftoversGuardTests.cs:394). D1's list lacks them; the parent's 3.1 has them (Q3).
- **F5 — more ops than D1's "namespace line + three files"**: the token in test text and fixtures (58 `mcp` mentions in
  `LeftoversGuardTests.cs` alone), two variable names, a `typeof`, the helper paths. All are of the kinds the parent's 3.1
  permits (namespace, token, helper paths and folders, `RepositoryIdentity.Row`).
- **F6 — no `*.cs` line-ending rule** in `.gitattributes`: a Windows checkout with `core.autocrlf` turns the raw-byte check
  red on the Windows leg (coai added `-text` per file for this) (Q9).
- **F7 — jobs that will run the copy without the mount**: `ci-clients.yml` `build-test` (three legs); `release.yml`
  `cli-binaries` and `mcp-binaries` (six runners each). S3's Files list names only `ci-clients.yml` and `ci-server.yml`;
  `ci-server.yml` fetches it since E2.2 (`:56-57`) (Q8).
- **F8 — `unknown` vs `foreign-uid`**: a wrong name in the stories, not another behaviour; written once, in § 3.2 *What the
  stories call `unknown`*. Not a change.
- **F9 — the Node half of the handoff needs the token**: `sweepLeftovers({ tmp })` alone collects the reference's own token
  and calls a `creds` folder `other`, so it lists nothing; the call needs `token: 'creds'` (F22). The wrapper does not
  export `sweepLeftovers` (`leftovers.cjs:68-89`); `run-tests.mjs:121` loads it.
- **F10 — on Linux the two roots are one by default** (`/tmp`). Sc. 1 and D4 agree once "the run over `/tmp`" is read as
  the one sweep of that root: written once, in Q6. Not a change.
- **F11 — no Node set up in `ci-clients.yml`, `release.yml`'s two binary jobs or `sonarcloud.yml`**: the handoff test and
  the guard's script tests need it (Q8, R4); the runners'
  own Node versions are not measured here.
- **F12 — the Windows leg is not a required check** (`branch-protection.json:19-31` lists ubuntu and macOS): "green on the
  three legs" is read by hand on the PR.
- **F13 — killed `HostProcess` children**: `KillOnDispose` ends the tree (`HostProcess.cs:112`); E2.2 measured three CoreCLR
  entries left by a killed `creds-mcp` (`clr-debug-pipe-*-in`, `-out`, `dotnet-diagnostic-*-socket`). S3 gives the children
  no `TMPDIR` (Q5).
- **F14 — the server executable runs on Linux only** (`ci-server.yml:47`, `sonarcloud.yml:25`; not in `release.yml`). The
  goal's "Linux, Windows and macOS" holds for the four client executables, as S3's DoD reads it.
- **F15 — F29's precondition is not met**: the template has no commit under its folder after `197cc76` (Q2). Report to the
  parent; whether to proceed is the coordinator's (**CHANGE** if the answer is B or C of Q2).
- **F16 — `using Xunit;` in every template file vs a global `<Using Include="Xunit" />` in all five projects**
  (`CredsCli.Tests.csproj:19` and the four others); no creds test file has `using Xunit;` today. Whether this warns under
  `TreatWarningsAsErrors` is to be measured by the first build (§ 3.1 item 6).
- **F17 — xUnit versions**: creds `4.0.2` (`Directory.Packages.props`), the template `4.0.0`. No difference is expected;
  recorded.
- **F18 — the reflection switch**: three client test projects turn reflection JSON off; one copied test needs it
  (T:LeftoversGuardScriptsTests.cs:24). D1 keeps the test files in `CredsForDevs.ServiceDefaults.Tests`, so it holds.
- **F19 — D9 #18's RED as written cannot go red on `main`**: `main`'s `TempDirectory` registers nothing, so "the registry
  is empty after `Remove`" passes there. S2.1's premise (owner-form, claimed) is the RED; the revert of `Dispose()` is the
  by-hand check (testing.md: revert the line the behaviour depends on).
- **F20 — the F31 acceptance of 2026-11-07** was not in F31 at conventions `a3a02fa`; the coordinator records it in
  conventions.

## 8. Risks

1. **The copy cannot be edited** (F6, F16, Q12). A compile warning, a CRLF checkout or a Sonar issue in a copied file has
   only a project-level answer. The first build and the first Windows run show them; S1.1 makes each one red, never silent.
2. **The adapter makes old silent failures loud.** `HostProcess.Remove` swallowed `IOException` before; now a child that
   still holds a file at the class's `Dispose` makes the audit red (`disposed but not removed`). On the Windows leg the
   process tests (`ServerEndsWithClientTests`, `ParentWatchProcessTests`) may meet this first. The `Reaper` now waits for a
   confirmed end (C1), and a child it cannot confirm fails its test; children that product code starts are outside its
   reach (row 6).
3. **Windows proves less than it seems** (F12, F31, F29). The leg is not required, the runner is elevated, so the claim scan
   is blind and every "collected" test re-owns its entry; two sweeps at once are not coordinated. Rows 9, 14, 15, 17 say so.

## 9. Commands, Definition of Done

```bash
LP=.claude/rules/shared/tools/low-priority.mjs
# EACH of the five test projects built by name before it runs (the .slnx holds three of five); a failed build ends here
node $LP dotnet build src_minimalapi_server/tests/CredVaultServer.Tests.csproj -m:4 --disable-build-servers || exit 1
node $LP dotnet build src_cli/tests/CredsCli.Tests.csproj -m:4 --disable-build-servers || exit 1
node $LP dotnet build src_mcp/tests/CredsMcp.Tests.csproj -m:4 --disable-build-servers || exit 1
node $LP dotnet build src_broker_client/tests/BrokerClient.Tests.csproj -m:4 --disable-build-servers || exit 1
node $LP dotnet build src_service_defaults/tests/CredsForDevs.ServiceDefaults.Tests.csproj -m:4 --disable-build-servers || exit 1
# the binaries are the ones just built (testing.md): each test DLL is newer than HEAD's commit AND than every changed source
newest=$( { git log -1 --format=%ct; git ls-files -m -o --exclude-standard -- '*.cs' '*.csproj' | xargs -r stat -c %Y; } | sort -n | tail -1 )
for d in src_*/tests/bin/Debug/net10.0/*.Tests.dll; do [ "$(stat -c %Y "$d")" -gt "$newest" ] || echo "STALE: $d"; done
# any STALE line: rebuild; a suite result over a stale binary is no result
# one executable at a time; the Leftovers namespace first (Linux/WSL: no .exe)
node $LP ./src_service_defaults/tests/bin/Debug/net10.0/CredsForDevs.ServiceDefaults.Tests --filter-namespace "CredsForDevs.Tests.Leftovers"
node $LP ./src_service_defaults/tests/bin/Debug/net10.0/CredsForDevs.ServiceDefaults.Tests
node $LP ./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests
node $LP ./src_cli/tests/bin/Debug/net10.0/CredsCli.Tests
node $LP ./src_mcp/tests/bin/Debug/net10.0/CredsMcp.Tests
node $LP ./src_broker_client/tests/bin/Debug/net10.0/CredsBroker.Tests
CREDS_LEFTOVERS_SELFTEST=1 node $LP ./src_cli/tests/bin/Debug/net10.0/CredsCli.Tests --filter-class "*LeftoversSelfTest"   # must FAIL with the audit's line
dotnet format dew_flow_creds_for_devs.slnx --verify-no-changes --no-restore
cd src_vs_code && npm test                                  # workflowMount.test.ts (S1.5)
node .claude/rules/shared/tools/sweeper-scan.mjs --root .
node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"
```

- [ ] Rows 1–26 of § 1 each have their evidence line on the PR; the unmapped rows carry § 6's answers.
- [ ] S1.1–S1.6, S2.1–S2.10, S3.0–S3.2, S4.0–S4.1, S5.0–S5.2 RED then GREEN, each RED seen once and quoted; the by-hand
      reverts (S1.3, S2.1, S2.7) recorded; each run's binaries shown newer than the head (§ 9's check, locally; a fresh
      checkout and a `-e` build step in CI).
- [ ] `TheAdaptedCopyTests` green on three legs; every op beyond namespace and token has a `reason`; no op touches the
      ownership, liveness or deletion code.
- [ ] The teeth steps green on three OSes for each executable the job runs; the macOS log lines and the Windows
      `RunnerFactsTests` lines on the PR.
- [ ] sc. 2 counts and sc. 4 on WSL recorded per executable; Windows per Q10; the hand clean-up recorded per machine.
- [ ] The F29 and F31 sentences in the manifest's `about`, `module_tests.md:20` and the PR; `module_tests.md` names the
      helper, the two sweeps and the audit.
- [ ] Build at 0 warnings; `dotnet format` clean; required checks green on the head; the Windows leg read by hand.
- [ ] A `review_plan` round on this brief reached `proceed` before the first code commit; a `review_code` round and an
      Opus review before the merge.
