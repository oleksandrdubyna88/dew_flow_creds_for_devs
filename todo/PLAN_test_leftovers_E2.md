# PLAN — Test leftovers, E2: creds names, claims, removes and collects what its tests, harnesses and CI smoke make

> Status: **plan only, nothing implemented yet, 2026-10-16; blocked on the E1 release of `dew_flow_conventions`**
> (S3 also on E3's C# helper landing in `dew_flow_mcp`). Stories of epic E2 of the parent plan
> `dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md` (§ *Epics*, E2). Scope: the `.claude/rules/shared` pin;
> a Node helper and start-of-run sweep under `src_vs_code/scripts/lib/`; a C# helper linked into the five test
> projects; a shell helper under `.github/scripts/lib/`; every temp site of the extension's unit tests, its
> harnesses, the server's harness, the five xUnit projects and the CI/test shell scripts; `docker.yml`'s two smoke
> steps; `deploy/acme-test/`; a repository-wide guard run by `docs.yml`; `research/module_tests.md` and
> `research/architecture.md`.
>
> Split by Opus, 2026-10-16. Not a cornerstone (parent, E2 entry). Models per story below.

**Committed together with this document** (one commit, the shared `common/planning-docs.md` § *A plan split into
epics and stories*): its row in `todo/README.md` under *Currently open*, as the first row of the table —

```
| [PLAN_test_leftovers_E2.md](PLAN_test_leftovers_E2.md) | plan only, 2026-10-16 — blocked on the E1 release (S3 also on E3) | Stories of epic E2 of `dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md`. Everything a test, a harness or the image smoke makes outside its process is named `testsToDelete-creds-…`, claimed by its run, removed on every path, and collected by the next run when a run was killed: a Node helper (`src_vs_code/scripts/lib/owned.cjs`) for the unit tests and the nine harnesses, E3's C# helper linked into the five xUnit projects, a shell helper for the CI scripts; `docker.yml`'s two smoke containers under the contract's carve-out with one always-run exact-name remover that never decides the verdict; the acme harness's state and compose project owned; and one guard over the whole repository in `docs.yml` |
```

**Parent and contract are cited as paths, never links** (the shared `common/planning-docs.md` § *Across
repositories*): the parent `dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md`; the contract
`dew_flow_conventions · common/test-leftovers.md` (mounted here at `.claude/rules/shared/common/test-leftovers.md`
once S1 moves the pin); the Node reference implementation `dew_flow_conventions · tools/lib/owned.mjs`,
`tools/lib/leftovers-sweep.mjs`, `tools/leftovers-check.mjs`, `tools/lib/unmatchable-pid.mjs`; the shipped janitor
`dew_flow_conventions · tools/janitor.sh`; E1's stories `dew_flow_conventions · todo/PLAN_test_leftovers_E1.md`; E3's
stories `dew_flow_mcp · todo/PLAN_test_leftovers_E3.md` (the C# shape). *Rule §n* below is a section of the contract.

## Goal

Every folder, file, container, volume and compose project that a creds test, harness, CI script or probe makes
outside its own process is named `testsToDelete-creds-<what>-<id>` (or the lowercase spelling where the namespace
requires it), claimed by the run that made it, removed by that run on success AND failure, and — when the run was
killed — collected by the next run's start-of-run sweep, only when its owner is provably gone. A guard over the
whole repository keeps it so. In CI the image smoke follows the contract's carve-out, and a failed smoke stays
failed and never publishes.

**Done when:** the pin carries the E1 contract (S1); `npm test`, every `itest:*` harness and the server's harness
create only owned, claimed folders, leave none after a run, and sweep at start (S2); the five xUnit executables do
the same through E3's C# shape (S3); `docker.yml`, the acme harness and the shell test scripts follow rule §2, §5 and
the carve-out, proved by a failure run whose `Publish` is skipped (S4); the guard is red on every class of rule §7
that can occur here, on an unregistered token and on a scan of nothing, and green on `main` (S5).

## Facts the split rests on (read on `origin/main` a7b3ecf2, 2026-10-16)

The parent's figures stand in total (111 temp mentions in 70 files, `research/` included) and are wrong in their
split; these counts bind the stories. "Leaks" = no removal at all; "fragile" = removed only as a last statement, which
a failed assertion or a thrown error skips.

**CI and the container smoke** — all verified at the lines the parent names.

- `.github/workflows/docker.yml:30` `runs-on: ubuntu-latest`; there is no self-hosted runner in any workflow. The job
  runs only on `workflow_run` of a push to `main` or on `workflow_dispatch` (`:14-18`, `:38-42`) — **a pull request
  that edits `docker.yml` never runs it**; only a dispatch on the branch does (Login and Publish are then skipped by
  their own `if:` at `:129`, `:137`).
- `cv`: `docker run -d --name cv … -p 8080:8080` (`:78-81`); read by `docker inspect` (`:83`) and `docker logs`
  (`:85`, `:88`); removed only at `:92`, after the 401 assertion. The exits at `:85`, `:88` and `:91` leave it.
- `cv-refused`: `docker volume create cv-refused-data` / `cv-refused-logs` (`:101-102`); `docker run -d --name
  cv-refused` (`:105-109`); read by `docker wait` (`:110`), `docker logs` (`:111`, `:112`), `docker cp` (`:113`);
  the timeout branch removes the container but not the volumes (`:111`); the failures at `:112` and `:114-115` remove
  nothing; the success path removes all three (`:116-117`). `docker cp` writes `./refused-logs` into the job's
  workspace (`:113`), which `actions/checkout` cleans on any later job.
- `Publish` (`:136-149`) and `Log in` (`:128-134`) carry an `if:` with no status function, so GitHub's implicit
  `success()` applies: any failed earlier step skips them. The image `cred-vault-server:ci` is the product build
  (`:64-73`), not a test-built image.
- Every other hand-started container in the repository already runs with `--rm`: `deploy/acme-test/run.sh:56`,
  `.github/workflows/ci-server.yml:253`, and the product scripts `deploy/backup.sh:47`, `deploy/restore.sh:120`,
  `deploy/restore-archive.sh:85`, `:231`. No Testcontainers, no `WithName`, no `docker network create`, no worktree
  anywhere (searched the whole tree outside `node_modules`).
- Required checks (`.github/branch-protection.json:19-31`) include `plan lifecycle · submodule pin` — the
  `docs.yml` job (`:24-78`) that fetches the submodule (`:36`) and runs `pin-check.mjs` (`:66`). **The day E1 is
  released, every pull request here is red until the pin moves (S1).** The pin today is `e29883f`, whose
  `common/test-leftovers.md` is the pre-E1 text (no owner, no sweep, no `## Tokens`).

**`deploy/acme-test/`** — run by hand only (no workflow or script calls it; `deploy/README.md:252`), not shellchecked
by `ci-server.yml:257-262`.

- `run.sh:22` drives the fixed compose project `cred-vault-acme-test` (`docker-compose.acme-test.yml:19`): four
  containers (`pebble`, `vault`, `nginx`, `certbot`) and one network (`edge`, `:104-106`), host ports 18081/18444
  (`:55-57`). `trap cleanup EXIT` (`:49-50`) runs `compose down -v`, and `cleanup` is also called at the START
  (`:53`) — by fixed name, so a second run started beside a first tears the first one's stack down.
- `state/` is wiped at the START of the next run (`:54`) and never at the end; `compose down -v` does not touch bind
  mounts. It is git-ignored (`.gitignore:121`). Bind mounts: `docker-compose.acme-test.yml:47-48` (vault, uid
  10001 — `src_minimalapi_server/Dockerfile:56`), `:68-69` (nginx, read-only), `:97-98` (certbot, the image's default
  user, root). `run.sh:56` chowns `data` and `logs` to 10001.
- **On a Linux host a non-root `rm -rf state` cannot delete those files** (reasoning, not measured: deletion needs
  write permission on the parent, and the parents belong to root and 10001), so `:54` under `set -euo pipefail`
  (`:19`) stops every run after the first there. Docker Desktop's bind mounts do not enforce it. S4 removes the
  state through a container and measures it.

**Extension unit tests** (`src_vs_code/src/test/`, node:test over compiled `out/test/*.test.js`, one process per
file, `min(8, CPUs-1)` files at once — `src_vs_code/package.json:57`, `scripts/run-tests.mjs:17-27`; no global setup,
no `pretest`; ESLint over `src` with complexity 4, 50 lines per function, no `console`, `ci-extension.yml:50-54`).

- **46 sites in 30 files**, all `fs.mkdtempSync(path.join(os.tmpdir(), …))` or `os.tmpdir()`: 21 safe (try/finally,
  a top-level `after()`, or `sshAgentManager.test.ts:202-210`'s `process.on('exit')`), **2 fragile**
  (`sshAgentServer.test.ts:59` — the test at `:277` disposes after an assertion at `:280`;
  `sshExecRunner.test.ts:79` — `rmSync` as the last statement at `:130`), **20 leak** in 12 files, 3 create nothing
  (`materializedKeys.test.ts:54`, `:93`, `pinClickPaths.test.ts:357`).
- The leaking files, with the tests that reach each site: `archiveDownload.test.ts:19` (5), `agentUseActions.test.ts:177`
  (1), `brokerEndpointSweep.test.ts:20` (2), `brokerListeners.test.ts:51`, `:79`, `:92`, `:104` (1 each, POSIX only,
  `:48`), `cliEndpoint.test.ts:23` (14), `connectionOptions.test.ts:64` (11), `crossWindowWrites.test.ts:132` (2),
  `diagnosticLog.test.ts:63` (6) and `:97` (1), `gitTransport.test.ts:40` (2), `:77` (6), `:148` (1),
  `gitTransportSerial.test.ts:48` (1), `:153` (1), `hostKeyTrust.test.ts:124` (1), `:135` (1); and `vpnWorld.ts:249`
  (`startVpn`, 29 callers), which leaks for certain in `vpnGoneRequest.test.ts:417` (`startVpn` rejects, `vpnWorld.ts:255-268`
  rethrows, the folder is never returned) and on any `until(...)` timeout in 11 more. **About 60 folders per Linux
  run, 56 on Windows**, none removed (the exact count is S2's RED).
- **No owner marker may sit inside these folders**: `archiveDownload.test.ts:51`, `:66`, `:94` assert the exact
  `readdirSync`; `connectionOptions.test.ts:216`, `:229`, `:248`, `:263`, `:278` and `vpnGoneRequest.test.ts:56`,
  `:114`, `:138`, `:197`, `:275`, `:339`, `:378`, `:403`, `:437` (`= []`) and `:224`, `:237`, `:322` (length 1) assert
  every file under the folder (`vpnWorld.ts:273` `filesUnder`). The contract's sibling `<folder>.owner` is what keeps
  them green.
- **Sockets inside the folders** (POSIX): `brokerListeners.test.ts` and `brokerOriginDoor.test.ts:187`
  (`broker-<pid>.sock`), `sshAgentServer.test.ts:59`, `:231` (`agent.sock`); `requestLife.test.ts:33` binds
  `creds-life-<pid>-<n>.sock` directly in the temp root. macOS allows 104 bytes; the longer leaf
  (`testsToDelete-creds-sock-abc123`, 31 characters, against 17 today) leaves ≈ 99. The extension suite runs on
  Ubuntu only in CI (`ci-extension.yml:28`), so macOS is a by-hand check.
- No `git init` in a unit-test folder (the three `.git` are empty directories: `gitTransport.test.ts:78`, `:149`,
  `gitTransportSerial.test.ts:50`). One folder is made at import time: `pinClickPaths.test.ts:15`.

**Harnesses** (`src_vs_code/scripts/*.cjs`, `src_minimalapi_server/scripts/backup-archive-itest.cjs`). Six run in CI
(`ci-extension.yml:82`, `:89`, `:106`, `:118`, `:131`, `:137`; `ci-server.yml:81`), three by hand
(`creds-mcp-wsl`, `wsl-agent-relay`, `server-transport`), plus `tree-perf-bench.cjs` (no alias).

- **15 temp folders**: 4 safe (`creds-mcp-itest.cjs:452`, `:600`, `:716`; `masked-run-itest.cjs:79` makes nothing);
  **3 fragile** — `agent-broker-itest.cjs:78` (removed at `:343` before `process.exit`, the `.catch` at `:346-349`
  skips it), `git-transport-itest.cjs:48` (a bare repository and three clones; `:127`, `.catch` `:130-133`),
  `ssh-agent-itest.cjs:50` (`:212`; `process.exit(1)` at `:63` and `.catch` `:283-286` skip it); **8 leak** —
  `creds-cli-itest.cjs:89` (made before the SKIP return at `:109-113`), `creds-mcp-itest.cjs:301`, `:743` (only its
  `title-home` child is removed, `:1027`), `:935`, `:1286`, and `backup-archive-itest.cjs:39` (`tempDir()`, called
  at `:109`, `:112`, `:187`: three per run, holding a random key and a sealed archive).
- **The stub files** — the fake `vscode` module each harness writes into the shared temp root and resolves through
  `Module._resolveFilename`: **seven fixed names, never removed** — `agent-broker-itest.cjs:21`,
  `creds-cli-itest.cjs:25`, `creds-mcp-itest.cjs:44`, `creds-mcp-wsl-itest.cjs:39`, `git-transport-itest.cjs:23`,
  `server-transport-itest.cjs:22`, `tree-perf-bench.cjs:25` (the parent's "7 … `*-itest.cjs`" counts the bench as an
  itest); one per-pid stub removed on success only (`masked-run-itest.cjs:19`, `:149`); one already inside its run's
  folder (`ssh-agent-itest.cjs:230`). Two runs of one harness at once (two checkouts, two sessions) truncate and
  rewrite the same file while the other may be `require`-ing it, and two checkouts of different versions load each
  other's stub; a fixed name in a world-writable `/tmp` is SonarCloud S5443, which `wslRun.cjs:12-16` already
  records.
- `server-transport-itest.cjs` and `tree-perf-bench.cjs` create no folder; the two WSL harnesses keep their run
  folders away from the temp root on purpose (below, *Out of scope*).

**Shell** — in scope (tests and CI helpers):

| Site | Run by | Cleanup today | Verdict |
|---|---|---|---|
| `.github/scripts/mcp-listen-smoke.test.sh:19` `mktemp -d` | `ci-clients.yml:75`, three OSes | `rm -rf` at `:72`, no trap | fragile |
| `.github/scripts/version-smoke.test.sh:14` `mktemp -d` | `ci-clients.yml:79`, three OSes | `rm -rf` at `:81`, no trap | fragile |
| `.github/scripts/start-server-and-wait.test.sh:28` `mktemp -d` | `ci-server.yml:127` | `trap cleanup EXIT` `:43` (`:36-42`) | safe |
| `.github/scripts/start-server-and-wait.sh:107` `mktemp …/start-server-XXXXXX.log` | `ci-server.yml:158-173` with `START_SERVER_LOG` set (`:162`) | handed on to the stop step (`:132`, `ci-server.yml:208`) | kept on purpose; the default only fires off CI |
| `.github/scripts/mcp-listen-smoke.sh:35-37` `<root>/creds-mcp-listen-smoke-$$` | `ci-clients.yml:97`, `:120`; `release.yml:624` | never | leaks off CI |
| `.github/scripts/version-smoke.sh:30`, `:64` `<root>/creds-version-smoke-$$` | `ci-clients.yml:118-119`; `release.yml:403`, `:631` | never | leaks off CI |
| `deploy/restore-archive-itest.sh:45` `WORLD="$(mktemp -d)"` | `ci-server.yml:271` | none — `world()` runs nine times (`:138` … `:239`) | **leaks 9 per run** |

Product scripts, out of scope and exempted inline by S5 (an operator runs them; their temp folders are not test
leftovers): `install.sh:63`, `:76`; `deploy/restore.sh:102` (removed on the success path only — a product note, not
this epic's); `deploy/restore-archive.sh:61`; `src_vs_code/src/installCommand.ts:72`, `:100` (text a user runs).
`RUNNER_TEMP` (`ci-server.yml:148`, the two smoke scripts' first choice) is emptied by the runner at the start and
end of every job and is not a temp root this rule governs.

**The five xUnit projects** (xUnit v3 on Microsoft Testing Platform, `OutputType Exe`, `IsTestProject` at line 6 of
each `.csproj`; one root `xunit.runner.json` linked by `Directory.Build.props:18-20`; `TreatWarningsAsErrors`
`Directory.Build.props:8`). `CredVaultServer.Tests` runs in `ci-server.yml:67-68` (ubuntu); the other four in
`ci-clients.yml:101-108` on ubuntu, macOS and Windows. Shared test helpers already live in
`src_service_defaults/tests/Support/` and are LINKED, not copied (`CredsCli.Tests.csproj:30-36`,
`CredsMcp.Tests.csproj:31-39`, `BrokerClient.Tests.csproj:29`, `CredVaultServer.Tests.csproj:33`).

- **54 sites in the five projects**: 33 safe, **3 fragile**, **11 leak**, 7 create nothing; 13 files hold a leak or a
  fragile site. No assembly fixture, collection fixture, `IAsyncLifetime` or `Testcontainers` anywhere; the one
  collection is `ServerCollection` (`src_minimalapi_server/tests/ServerCollection.cs:9`, `DisableParallelization`,
  39 classes). No SQLite, no git repository, no `GetTempFileName`, no `TEMP`/`TMP` environment reads.
- **The leaks** (server project unless named; folders per full run in brackets):
  `BackupArchiveCommandTests.cs:276` `NewPath()` (≈ 37), `BackupArchiveTests.cs:484` (≈ 34), `BackupKeyFileTests.cs:148`
  (16 — each holds a clear-text test key, `:141`), `BackupRunnerTests.cs:784` (36), `BackupStoreTests.cs:482` (25),
  `LoginKeyStoreTests.cs:21` (11), `OrgBlockingWithdrawalTests.cs:53` (2), `OrgProjectsStoreTests.cs:16` (14),
  `ShareMaintenanceTests.cs:25` (4 — handed to a live in-process host as `Vault__DataDir`, `:122-126`, which
  `VaultServer.Dispose` never removes), `BackupArchiveCommandTests.cs:143` (`cred-vault-aot-kit`, a FIXED leaf kept on
  purpose for a person to point the AOT binary at, `:134-142`, with a key in it, `:152`; two executables running at
  once overwrite each other's), and `src_broker_client/tests/EndpointsTests.cs:16` (7). **≈ 190 folders per run.**
- **The fragile ones**: `LoggingSinkTests.cs:153` (`Directory.Delete` as the last statement, `:162`);
  `src_cli/tests/AgentRelayHostTests.cs:34` and `AgentRelayConnectionTests.cs:162` — real Unix sockets at a
  HARD-CODED `/tmp/cr-<9 hex>.sock` (short on purpose: macOS's `TMPDIR` is ~50 characters and the cap is 103 bytes,
  `AgentRelayTests.cs:116-120`, `:140-144`), removed only by the relay itself (`:104`, `:179`); `RelayLogTests.cs:84`
  has the same path with a `finally`.
- **Six fixed parents sit unprefixed in the temp root and are never removed**, even where the child is:
  `cred-vault-tests` (13 lines, `VaultServer.cs:45` among them), `cred-vault-backup-run`, `-backup-store`, `-backup`,
  `-backup-cli`, `-key-file`.
- **The safe ones go through a mini-helper already**: `HostProcess.TempDirectory(prefix)` / `HostProcess.Remove(path)`
  (`src_service_defaults/tests/Support/HostProcess.cs:148-167`) — 14 callers (cli 5, mcp 8, server 1), each a
  class field disposed in `Dispose`; `Remove` swallows `IOException`/`UnauthorizedAccessException` silently, and a
  child process writes into every one of these folders. The server project also has seven private copies
  (`TempDir()`/`NewDir()`/`NewPath()`). `VaultServer` (334 instances, all `using`) removes its own `DataDir`
  (`:98-123`) but not the parent.
- **Assertions an owner marker INSIDE would break** (the sibling marker keeps them green): `VersionTests.cs:104`,
  `StartupGuardsTests.cs:48`, `BackupArchiveTests.cs:207`, `:262`, `BackupStoreTests.cs:186`,
  `BackupRunnerTests.cs:163`, `OrgProjectsStoreTests.cs:56`, `ParentWatchProcessTests.cs:91`, `:117`, and the
  pattern-and-pid log lookups `HostProcess.cs:138`, `AgentRelayHostTests.cs:152`, `WslPumpHostTests.cs:124`,
  `StartupRefusalProcessTests.cs:71`.
- **Windows handles that can refuse a removal**: `BackupStoreTests.cs:48-52`, `BackupRunnerTests.cs:661-662`
  (`FileShare.None`), `Corp.Undeletable` (`Corp.cs:219-237`), the child processes above.
- Not a temp site, recorded: the in-process `VaultServer` writes its Serilog files to `AppContext.BaseDirectory/logs`
  (`src_minimalapi_server/src/Logging.cs:39-42`) — the build output, git-ignored, reused on purpose; out of scope.

**Out of scope, on purpose** (each recorded for the promotion):

- The two WSL harnesses' run folders: Windows side `%LOCALAPPDATA%\creds-itest\creds-itest-<run>` (`wslRun.cjs:41`,
  `:48-53`, `:110-114`), removed by `finishRun` in a `.finally` (`wslRun.cjs:206-214`, `wslStrays.cjs:217-219`);
  Linux side `~/.cache/creds-itest/<run>` and `build-<hash>`, **never deleted by design** — "nothing is deleted
  inside the distribution, a machine rule since 2026-10-07" (`wslRun.cjs:18-22`). Kept out of the temp root by
  SonarCloud S5443 (`wslRun.cjs:14-16`). E2 adds no deletion inside WSL; the guard does not see these paths (no temp
  API) and needs no exemption.
- `RUNNER_TEMP` paths in workflows (above) and the job workspace's `./refused-logs` (`docker.yml:113`).
- `deploy/restore.sh:102`'s success-only removal and `deploy/restore-archive.sh`'s uid-10001 scratch (product
  defects; reported to the owner in S5's PR, not fixed here).

## Decisions

**D1 — Three helpers, one per language, each ONE implementation.** The contract wants one helper per repository in
its language; this repository writes tests in three.

| Language | Helper | Reached by | Why there |
|---|---|---|---|
| Node | `src_vs_code/scripts/lib/owned.cjs` + `owned.d.cts` (types) + `leftovers-sweep.cjs` | unit tests (`import … from '../../scripts/lib/owned.cjs'` — the same relative path from `src/test/` and `out/test/`), the harnesses (`require('./lib/owned.cjs')`), `run-tests.mjs`, `run-itests.mjs`, `backup-archive-itest.cjs` (`require('../../src_vs_code/scripts/lib/owned.cjs')`) | `backup-archive-itest.cjs` runs in `ci-server.yml:81` with "Node built-ins only, so no setup step" (`:78`) — no `npm ci`, no compile — so a TypeScript helper under `src/test/` (compiled to `out/`) could not reach it. Plain CommonJS with Node built-ins only is the one form every Node entry point can load. TypeScript resolves `.cjs` to the sibling `.d.cts` (module `Node16`, `tsconfig.json:3-4`); declaration files are not subject to `rootDir` |
| C# | E3's shape (`Owned`, `Owner`, `Liveness`, `OwnedDir`, `OwnedScope`, `Removal`, `UnmatchablePid`, `LeftoversSweep`, `LeftoversSweepFixture`, `LeftoversAudit`) in `src_service_defaults/tests/Support/Leftovers/`, namespace `CredsForDevs.Tests.Leftovers` | the five test projects — compiled in place by `CredsForDevs.ServiceDefaults.Tests`, linked by the other four with ONE wildcard `<Compile Include="..\..\src_service_defaults\tests\Support\Leftovers\*.cs" Link="Support\Leftovers\%(Filename)%(Extension)" />` each | the existing `Support/` linking precedent; one copy for five executables |
| bash | `.github/scripts/lib/owned.sh`, sourced | the four CI/test shell scripts, `deploy/restore-archive-itest.sh`, `deploy/acme-test/run.sh` | the scripts run on three OSes under bash; neither Node nor .NET is a prerequisite of every one of them |

*Rejected:* importing the mounted `tools/leftovers-check.mjs` / `owned.mjs` — the guard imports `yaml`
(`dew_flow_conventions · tools/leftovers-check.mjs:34`), which neither the mount nor any package here installs
(`docs.yml` runs no `npm ci`; no `package-lock.json` here carries `yaml`), and its discovery (`:67-76`) is that
repository's layout; consumers mirror the shape, not the code (parent, decision 1). *Rejected:* a fourth, inline
helper in `backup-archive-itest.cjs` (the reason the Node helper is `.cjs`).

**D2 — Names.** `REPO_TOKEN = "creds"` (the contract's `## Tokens` row) written ONCE per helper: `owned.cjs`,
`Owned.cs`, `owned.sh`. S5 checks all three are equal and registered. `<what>` is the old prefix without its
`creds-`/`cred-vault-`/`cvbk-` lead and trailing `-` (`creds-sock-` → `sock`, `cred-vault-backup-store` →
`backup-store`, `cvbk-download-` → `download`); ≤ 36 characters (63 − `testsToDelete-creds-` − `-` − 6). A folder that
will hold a Unix socket keeps `<what>` ≤ 5 characters. `<id>`: 6 of `[A-Za-z0-9]` (Node: `owned.mjs`'s `randomId`;
C#: `RandomNumberGenerator.GetString`, E3; bash: `mktemp`'s `XXXXXX`). Docker names use the same id rule;
compose project names must be lowercase, so the acme project is `teststodelete-creds-acme-<id>` (rule §1's second
spelling). Per-pid FILES in the temp root (`hostKeyPin.test.ts:74`, `sshExecRunner.test.ts:79`,
`requestLife.test.ts:33`, the stubs) move INSIDE an owned folder — one kind (folder) instead of two.

**D3 — The owner, and where it lives** (rule §3). `<host>@<os>:<pid>[:<start>]`, `<host>` the DNS host name
sanitised `[@:\s]+` → `-` (Node `os.hostname()`; C# `Dns.GetHostName()`, never `Environment.MachineName` — E3; bash
`hostname`, the janitor's own source, `tools/janitor.sh:33`). Start: Node writes it on Linux only (`/proc`, no
spawn), C# everywhere (`Process.StartTime`, E3), bash never. **bash on Windows writes the WINDOWS pid** —
`/proc/$$/winpid` (a `read` builtin, no spawn), because the Node sweep (`process.kill(pid, 0)`), the C# sweep
(`Process.GetProcessById`) and the janitor (`tasklist`, `janitor.sh:43`) all judge Windows pids; an MSYS `$$` there
reads as a dead or a stranger's process. Folders: the sibling `<folder>.owner` — never inside (the listing
assertions above). Containers and volumes: `--label testsToDelete.owner=<owner>`. Compose: the same label on every
service and on the network.

**D4 — Who sweeps what at start** (rule §4). The token is `creds` for every language, so every sweep collects every
creds folder by the same rule — age ≥ 10 min selects, owner `gone` authorises, `live`/`unknown` preserve, unmarked
new-form old folders go, a vanished target is someone else's success, never an error:

- `npm test` → `scripts/run-tests.mjs` (before `node --test`); `npm run itest:all` → `scripts/run-itests.mjs` (before
  the first harness). A single `itest:*` alias does not sweep: the next `npm test`, `itest:all` or xUnit run does.
- every xUnit executable → `LeftoversSweepFixture` (E3 S3's assembly fixture), linked into all five.
- containers/volumes/compose: there is no creds-wide container sweep. CI: the hosted runner's VM is the collector
  (`docker.yml:30`), and the always-run remover covers every path but a killed runner — **deviation, recorded:** no
  start-of-job container sweep in `docker.yml`; the day the workflow moves to a non-ephemeral runner, that step is
  added in the same change. acme: see D6.
- The old names (`creds-*`, `cred-vault-*`, `cvbk-*`, `arrival-lease-*`, `wsl-mcp-check-*`, the stub file names,
  `tmp.*` from bare `mktemp`) are NOT swept — `creds-` is not a registered token and other software uses such
  names. S2/S3/S4 each LIST them before and after on the machine they ran on and report; removed only on the owner's
  word, by hand.

**D5 — The CI smoke under the carve-out** (rule §5). Both containers stay WITHOUT `--rm` — `cv`'s logs are what a
failed health wait prints (`:85`, `:88`), `cv-refused` is read after it exits (`:110-115`). One id per job; names
spelled with the literal prefix in every command (the guard compares the text):
`testsToDelete-creds-cv-$SMOKE_ID`, `testsToDelete-creds-refused-$SMOKE_ID`,
`testsToDelete-creds-refused-data-$SMOKE_ID`, `testsToDelete-creds-refused-logs-$SMOKE_ID` (≤ 41 characters).
The inline removals (`:92`, `:111`'s `docker rm -f`, `:116-117`) go: ONE remover step, placed after "Smoke-test a
refused start" (the last reader) and before "Log in", `if: always()`, `continue-on-error: true`, each command
`|| true`, and it ends by LISTING what is left (`docker ps -a --filter label=testsToDelete.owner`, `docker volume ls
--filter label=testsToDelete.owner`) — the in-job observation the parent's proof asks for. It never decides the
verdict: its own exit is always 0, and `Publish`'s implicit `success()` reads the smoke steps' failure, not its.

**D6 — acme-test is a probe, so its containers are leftovers too** (rule §1's first sentence; the parent named only
`state/`). The compose project becomes `teststodelete-creds-acme-<id>`; every service and the network carry the
owner label; `state/` moves out of the checkout into an owned temp folder `testsToDelete-creds-acme-<id>` (same id),
removed at the end through a container (root and uid-10001 files, Facts) and then by `owned_remove`. The trap is
registered BEFORE `compose up`. The start-of-run sweep needs three-valued liveness in bash: **it delegates to the
mounted janitor** if E1 ships the per-token mode asked for in *Notes for the parent* N4
(`JANITOR_MIN_AGE_MINUTES=10 bash .claude/rules/shared/tools/janitor.sh --token creds`, exit 0 and 3 both fine, any
other code one reported line); **if E1 ships without it**, `run.sh` does not sweep: when a
`teststodelete-creds-acme-*` project already holds a container it stops before `up`, names the project and prints
the janitor's `--dry-run` command — non-destructive — and the deviation is recorded. Never a copy of the janitor's
liveness code (reuse-first: copy-for-now is the defect).

**D7 — One guard for the whole repository, in Node, run by `docs.yml`** (rule §7). `.github/scripts/leftovers-check.mjs`
(Node built-ins only), in the shape of `public-hygiene.mjs` (`--selftest` over in-memory fixtures, then the real
tree; `docs.yml:58-61`) — the job already fetches the submodule (`docs.yml:36`) whose `## Tokens` table the token
check reads, and its check name is required. One guard rather than three because the classes span three languages
plus YAML in one tree. It recognises the §5 carve-out in workflows with a dependency-free reader of
`jobs.<id>.steps[]` that fails CLOSED (finding `workflow-unreadable`) on any shape it does not understand inside a
job holding a `docker run`.

**Growth surface.** After E2 a full local run makes ≈ 60 Node unit-test folders (S2 RED fixes the exact number) plus
the safe ones it already made, ≈ 25 harness folders, the C# folders of S3, nine shell worlds; each a few KB except
`git-transport-itest`'s repository (< 1 MB) and `backup-archive-itest`'s three (a few MB). Every one is removed by its
test on every unwinding path; a killed run's are collected by the next start-of-run sweep after 10 minutes once their
owner is gone; a machine that stops running these tests is cleaned by the janitor (`bash
.claude/rules/shared/tools/janitor.sh`, one hour). A teardown that gives up leaves the folder prefixed and claimed
by a pid that dies with the run, so the next sweep collects it. A marker is ~40 bytes. CI: nothing survives the
hosted job. acme: one stack of four containers, one network, one state folder of < 1 MB, per run.

## Order

| Story | Model (spec · code · review) | Depends on | Lands |
|---|---|---|---|
| S1 — the pin on the E1 release | Opus (this section) · main session · Opus | E1 S5 released | first; every other merge waits for it (`plan lifecycle · submodule pin` is required) |
| S2 — the Node helper, its sweep, and every Node site | Opus · Sonnet · Opus | S1 | after S1 |
| S3 — E3's C# shape, linked into five projects, and every C# site | Opus · Sonnet · Opus | S1, **E3 S2–S4 merged in `dew_flow_mcp`** | after E3; in parallel with S2/S4 |
| S4 — the CI smoke carve-out, acme-test, the shell helper and scripts | Opus · Sonnet · Opus | S1; D6's sweep on E1's answer to N4 | in parallel with S2 |
| S5 — the repository-wide guard, its CI step, the docs | Opus · Sonnet · Opus | S1 (mounted `## Tokens`), the three helpers' constants | written beside S2–S4, merged LAST (red until all three land) |

S2–S4 may be coded before E1 is released against the contract text E1's branch fixes; they merge only after S1.
Where this document and the released contract differ, the contract wins and the difference is reported to the parent,
never resolved in code.

### Boundary with E1 and E3 (both sides — the shared planning rule § *A boundary between two plans*)

| Item | Built by | The other's part |
|---|---|---|
| The contract text, the `## Tokens` row `creds`, `tools/janitor.sh` | E1 | E2 reads them through the mount; never edits them |
| `tools/janitor.sh --token <t>` (N4) | E1, if accepted | E2 S4 calls it from `run.sh`; otherwise S4's fallback |
| The Node reference (`owned.mjs`, `leftovers-sweep.mjs`, `leftovers-check.mjs`, `unmatchable-pid.mjs`) | E1 | E2 S2/S5 mirror shape and order in CommonJS, not the code |
| The C# shape (API, claim-first, `Dns.GetHostName`, assembly-fixture sweep, end-of-run audit) | E3 S2–S4 | E2 S3 copies it by shape into one linked folder; a difference E2 needs goes back to E3 as a note |
| The C# guard | E3 (C#, its own repository) | not copied: E2's guard is S5's Node guard (D7) |
| The pin bump | E2 S1 | E1 S5 releases |

Disjoint otherwise: E2 changes nothing in `dew_flow_conventions` or `dew_flow_mcp`.

## S1 — The pin on the E1 release

- **Models.** This section is the brief; the main session makes the commit; Opus reviews the diff.
- **Goal.** `.claude/rules/shared` points at the `release` tip that carries E1, so `Pin check` is green and the mount
  offers what S2–S5 read: the `## Tokens` table with the `creds` row, and `tools/janitor.sh`.
- **Files.** `.claude/rules/shared` (the gitlink); `CLAUDE.md` only if `gate-snippet-check.mjs` says the gate block
  changed.
- **Change.** `git -C .claude/rules/shared fetch origin release` → `checkout <the release sha>` (the sha `git
  ls-remote origin refs/heads/release` prints, never `main`'s); read the released `common/test-leftovers.md` and
  confirm the `## Tokens` header `| token | family | repository |` with a row whose first cell is `` `creds` ``, §1's
  63-character limit, §3's owner form and sibling `.owner`, §4's 10 minutes, §5's carve-out wording (a later step
  with `if: always()`, `continue-on-error: true`, after every reader, exact `docker rm -f -v` / `docker volume rm`),
  §7's exemption grammar — and whether `janitor.sh` has `--token` (N4; it decides S4's D6 branch). A difference from
  what this document cites stops the epic and goes to the parent. One commit: `chore(rules): pin shared conventions to
  release <short sha> — test leftovers: owner, start-of-run sweep, carve-out, guard grammar, tokens table`.
- **Scenarios.** 1. `node .claude/rules/shared/tools/pin-check.mjs` → 0 (RED first: after the release, on `e29883f`,
  it names the pin as behind). 2. `plan-lifecycle.mjs`, `gate-snippet-check.mjs`, `build-flags-check.mjs`,
  `post-deploy-check.mjs` → 0. 3. `git -C .claude/rules/shared grep -n "^| \`creds\` |" common/test-leftovers.md`
  → one line.
- **Commands.** The four node checks; `node .github/scripts/public-hygiene.mjs`.
- **DoD.** Pin equals the release tip; every required check green; this document's status line still says *plan
  only*.

## S2 — The Node helper, its start-of-run sweep, and every Node site

- **Models.** Brief by Opus (this section); code by a Sonnet coder; review by Opus against rule §1–§4, D1–D4 and
  `owned.mjs`.
- **Goal.** No unit test, harness or the server's harness leaves a folder or file in the temp root on any path; a
  killed run's are collected by the next `npm test` / `itest:all`; `npm test` fails when the suite itself left one.
- **Files.** New `src_vs_code/scripts/lib/owned.cjs`, `owned.d.cts`, `leftovers-sweep.cjs`, `leftovers-sweep.d.cts`,
  `unmatchable-pid.cjs`, `unmatchable-pid.d.cts`; `scripts/run-tests.mjs`, `scripts/run-itests.mjs`; new tests
  `src/test/leftoversOwned.test.ts`, `src/test/leftoversSweep.test.ts`, `src/test/leftoversRunner.test.ts`; all 29
  test files with a temp site (the 30th file of the facts is `vpnWorld.ts`) — the ones that leak or are fragile AND the safe ones, because every `os.tmpdir()`
  outside the helper is a finding of S5's guard; `vpnWorld.ts`; the nine `scripts/*.cjs` harness files of the facts; `src_minimalapi_server/scripts/backup-archive-itest.cjs`;
  `research/module_tests.md` (`:125-146`, the *Leaves behind if killed* table).

**The change — the helper.** `owned.cjs` is `dew_flow_conventions · tools/lib/owned.mjs` (`:41-297`) in CommonJS,
minus the worktree half (no test here makes a worktree), with `REPO_TOKEN = 'creds'`,
`OWNED_PATTERN = /^teststodelete[-_]creds[-_]/i`, `MAX_NAME 63`, `ID_LENGTH 6`, `START_TOLERANCE_S 2`, and the same
functions: `tempRoot()` (the ONE `os.tmpdir()`, under `// testsToDelete-exempt: raw-temp — the helper is the one place
a test learns the temp root`), `ownedPrefix`, `ownedName`, `cleanupScope()` (`after(fn)` + `close()`, never rejects),
`startFromProcStat`, `processProbe`, `thisOwner`, `formatOwner`, `parseOwner`, `writeOwner` (`flag: 'wx'`),
`readOwner(dir)` (folder only), `ownerState(owner, probe)`, `removeLink`, `removeQuietly(dir, { rm, warn } = {})`
(five tries 100 ms apart, folder first, claim last, ONE `owned: could not remove … — left for the start-of-run sweep`
line via `process.stderr.write` — never `console`, which the lint forbids; `rm`/`warn` are the test seams of sc. 6), `ownedDir(scope, what, { parent })` (create → `scope.after` on the next statement → claim;
a failed claim removes and throws). Two additions: `ownedFile(scope, what, name)` = `path.join(ownedDir(scope, what),
name)` for the per-pid files and the stubs; and `writeStub(scope, what, text)` for the harnesses' fake `vscode`
(returns the stub's path inside an owned folder). `leftovers-sweep.cjs` is `leftovers-sweep.mjs` (`:21-198`) minus the
worktree pass: folders (a `.git` FILE ⇒ `other clone`), the decision table (`:49-57`), orphan claims (`:156-169`),
`ENOENT` on removal counted as removed. `unmatchable-pid.cjs` is `unmatchable-pid.mjs` verbatim in CommonJS. Each
`.d.cts` declares exactly the exports (S2 sc. 9 pins it); the scope type is `{ after(fn: () => unknown): void }`, which
node:test's `TestContext` satisfies.

**The change — the runners.** `run-tests.mjs` gains `runWithSweep` in the shape of `dew_flow_conventions ·
tools/run-tests.mjs:62-80` (sweep, one report line only when it found something, never changes the exit code) and an
**end-of-run audit**: after `node --test` exits, every depth-1 folder of the temp root matching `OWNED_PATTERN`
whose claim names THIS host, whose owner is `gone` (each test file is its own, now dead, process), and whose mtime is
≥ the run's start, plus every orphan claim of that kind, is listed, removed with `removeQuietly`, and — when the list
is not empty and the suite itself passed — turns the exit code to 1 with `run-tests: this run left <n> folder(s) — a
test made scratch outside a scope: <paths>`. Its one known blind spot, written into the runner's header: a SECOND
`npm test` on the same machine whose test file crashed during this run's window is counted here too — the message
names the folder, so the mistake is visible, never silent. (E3's audit compares one exact owner; node:test's per-file
processes give this runner no pid list to compare with.) `run-itests.mjs` gains the sweep only (no audit: a harness's children
may still be ending). Both import `./lib/leftovers-sweep.cjs`.

**The change — the sites.** The pattern, chosen per file:

- a test that makes its folder inline or through a helper it calls with nothing → the helper takes the test's
  context: `test('…', (t) => { const dir = tempDir(t); … })`, `tempDir = (t) => ownedDir(t, 'download')`;
- a file whose helpers are called from many tests or at import time (`pinClickPaths.test.ts:15`,
  `sshAgentManager.test.ts:192-210`, `sshDefaultProbe.test.ts:26-34`, `wslMcpCheckHost.test.ts:52-57`) → one
  module-level `const scope = cleanupScope(); after(() => scope.close());` (node:test's top-level `after` runs at the
  end of the file whether tests passed or not) and the existing `process.on('exit')` / `made` lists go;
- `vpnWorld.ts:249` → `startVpn` takes the scope and registers the folder before anything can throw, so
  `vpnGoneRequest.test.ts:417` and the 11 `until(...)` callers stop leaking; its 28 callers' own `rmSync` go;
- the try/finally sites keep their shape with `ownedDir(scope, …)` in place of `mkdtempSync` and the `rmSync`
  removed (the scope removes);
- per-pid files and sockets move inside an owned folder (D2): `hostKeyPin.test.ts:74`, `sshExecRunner.test.ts:79`
  (the child writes `<dir>/marker`), `requestLife.test.ts:33` (`<dir>/life-<n>.sock`; Windows pipes unchanged);
- the three nothing-created sites take `tempRoot()` (`materializedKeys.test.ts:54`, `:93`; `pinClickPaths.test.ts:357`);
- harnesses: a module-level `cleanupScope()` closed in a `finally` around `main()` AND in the `.catch` before
  `process.exit`, so the early exits (`ssh-agent-itest.cjs:63`, the SKIP at `creds-cli-itest.cjs:109-113`) remove too;
  every stub through `writeStub(scope, '<harness>-stub', text)`; `backup-archive-itest.cjs`'s `tempDir(tag)` becomes
  `ownedDir(scope, \`backup-${tag}\`)`.

`<what>` per site: the old prefix without `creds-`/`cvbk-`/trailing `-`; ≤ 5 characters where a socket is bound
(`sock`, `door`, `agent`, `life`).

**Scenarios** (`src/test/leftovers*.test.ts`; RED first — every helper scenario written against `owned.d.cts` before
`owned.cjs` has bodies and observed failing; every scenario that counts entries uses a PRIVATE parent made with
`ownedDir`, because eight test files write the temp root at once):

1. **A name carries the prefix, the token and six random characters** — `ownedName('download')` matches
   `^testsToDelete-creds-download-[A-Za-z0-9]{6}$`; 1 000 calls distinct; `ownedDir(t, 'unicode пробел')` exists.
2. **A bad `what` makes nothing** — `''`, `'a/b'`, `'a\\b'`, `'-x'`, `'a\u0001b'`, 37 × `x` throw; the parent is
   unchanged; 36 × `x` succeeds.
3. **The claim sits beside the folder, never inside** — `<dir>.owner` parses to `thisOwner()`; `readdirSync(dir)` is
   `[]`.
4. **A test that fails still removes its folder** — a subtest `await t.test('inner', (t2) => { dir = ownedDir(t2,
   'unwind'); throw new Error('the failing body'); })` (its rejection caught) → after it, `dir` and `dir.owner` are
   gone. (In-process: the subtest's `after` has run when `t.test` settles; no second test observes the first.)
5. **A killed test leaves its folder claimed, and the next sweep collects it** — a child `node -e` that `require`s
   `owned.cjs`, makes `ownedDir(cleanupScope(), 'killed', { parent })`, prints the path and
   `process.kill(process.pid, 'SIGKILL')` (on Windows Node maps it to `TerminateProcess`: no handler runs either). The
   folder and claim remain, naming the child's pid. `sweepLeftovers({ tmp: parent, now: now + 11 min, probe })` with a probe
   answering `alive` for that pid keeps both (`live`); with `{ alive: false }` removes both. Never the REAL probe on the
   dead child's pid (`unmatchable-pid.mjs:3-7`).
6. **Teardown never throws; what it cannot remove stays prefixed and claimed** — through a seam,
   `removeQuietly(dir, { rm, warn })` (defaults `fs.rmSync` and `process.stderr.write`): an `rm` that throws `EBUSY` on
   the folder → returns `false`, `warn` got exactly one line starting `owned: could not remove` and ending `left for the
   start-of-run sweep`, the folder and its claim both still exist; an `rm` that throws `ENOENT` → `true`. Then the real
   OS on POSIX: the parent `chmod 0o555`, the premise asserted (a root runner removes it anyway — the test fails saying
   so, never passes for the wrong reason), same outcome; restore `0o755`. (Node opens files with `FILE_SHARE_DELETE` on
   Windows, so a held handle there does not reproduce the refusal; the seam is the Windows proof.)
7. **The sweep removes only what a gone owner left** — on a private root at now + 11 min: claimed by this process →
   `live`; `other@<os>:1` → `foreign host`; `hands off` → `unreadable`; a dead claim (`unmatchablePid()`, premise
   asserted) → removed with its claim; unmarked and old → removed; young → untouched and unreported; a `.git` FILE →
   `other clone`; `testsToDelete-mcp-x-abc123`, `creds-sock-abc123` → untouched and unreported;
   `TESTSTODELETE-CREDS-x-abc123`, `teststodelete_creds_x_abc123` with a dead claim → removed; an old orphan
   `testsToDelete-creds-y-abc123.owner` → removed; a target that vanished between listing and removal → counted
   removed, no error.
8. **The runner sweeps, audits, and never lets either change a passing verdict wrongly** (`leftoversRunner.test.ts`,
   seams for `spawn`, `sweep`, `tmp`): a sweep that throws → one line, the suite's code; a suite that passed and left
   a `gone`-owned folder created after the start → exit 1 naming it, and the folder removed; a `live`-owned one or one
   older than the start → not counted; a suite that failed → its own code, unchanged.
9. **The types say what the module exports** — `Object.keys(require('../../scripts/lib/owned.cjs'))` equals the
   export list the test reads out of `owned.d.cts` (both directions), and the same for the sweep.
10. **Nothing leaks after a full run** (by hand, recorded in the PR): before the migration, one `npm test` on Linux
    (WSL is fine) and one on Windows, counting NEW entries of the old names (`cvbk-download-*`, `creds-*`,
    `arrival-lease-*`, `wsl-mcp-check-*`, `creds-life-*.sock`) — the RED count, expected ≈ 60 / 56; after: zero new
    old-form entries and zero `testsToDelete-creds-*`. The same for `npm run itest:all` (RED: the eight leaking
    folders + seven stubs + `backup-archive`'s three), and `node scripts/tree-perf-bench.cjs` once.
11. **The socket paths still fit** (by hand on macOS if a machine is available, else stated as not run): the
    `brokerListeners`, `brokerOriginDoor`, `sshAgentServer` and `requestLife` files pass and the longest socket path
    they print is under 104 bytes.

- **Commands.** `cd src_vs_code && npm run typecheck && npm run lint && npm test`;
  `node --import ./scripts/lower-priority.mjs --test out/test/leftoversOwned.test.js` (one file);
  `npm run itest:all`; `node ../src_minimalapi_server/scripts/backup-archive-itest.cjs` with the server built.
- **DoD.** Scenarios 1–9 RED then GREEN on Windows and on the CI runner (6 per OS); 10 recorded with both counts; 11
  run or stated not run; `npm test` and every CI harness step green; no `os.tmpdir()` left outside `owned.cjs` (S5
  proves it); `module_tests.md:130-146` says what each harness leaves after a kill now ("nothing the next sweep does
  not collect") and names the helper, the sweep and the audit.

## S3 — E3's C# shape, linked into five projects, and every C# site

- **Models.** Brief by Opus; code by a Sonnet coder; review by Opus against E3's merged code, rule §1–§4 and D1–D4.
- **Depends on** E3 S2–S4 merged in `dew_flow_mcp`: the coder reads E3's merged `tests/Mcp.Tests/Leftovers/*.cs`
  and writes THIS repository's copy by shape (names, order, three-valued answers, claim-first with
  `FileMode.CreateNew`, `Dns.GetHostName`, `TestContext.Current.AddWarning`, the assembly fixture, the end-of-run
  audit) — never by file copy, never by reference. A behaviour E2 needs that E3 lacks is a note to E3 first.
- **Goal.** No xUnit test here leaves a folder or file in the temp root on any path; each of the five executables
  sweeps at start and fails a run that left something it claimed.
- **Files.** New `src_service_defaults/tests/Support/Leftovers/{Owned,Owner,Liveness,OwnedDir,OwnedScope,Removal,UnmatchablePid,LeftoversSweep,LeftoversSweepFixture,LeftoversAudit}.cs`
  (the fixture file carries `[assembly: AssemblyFixture(typeof(LeftoversSweepFixture))]`); new tests
  `src_service_defaults/tests/Leftovers/{OwnedTests,LivenessTests,LeftoversSweepTests,LeftoversAuditTests}.cs` (this
  project runs on ubuntu, macOS AND Windows in CI, `ci-clients.yml:54`, `:107-108`); the four other `.csproj` files
  (one wildcard `Compile Include` each, D1); the C# site files of the facts; `research/module_tests.md` (the .NET
  tier row, `:20`).

**The change — the helper.** E3's types, by shape, with `RepoToken = "creds"`, the namespace above, and three
additions this repository needs:

- `Owned.ShortSocketRoot` — `"/tmp"` on Linux and macOS (the reason `AgentRelayHostTests.cs:34` hard-codes it: a
  socket path must stay under 103 bytes on macOS), `Owned.TempRoot()` on Windows; and `LeftoversSweep` sweeps BOTH
  roots when they differ (macOS), so a killed run's socket folder is collected too. The one hard-coded `"/tmp"` lives
  here, under an inline exemption.
- `HostProcess.TempDirectory(prefix)` and `HostProcess.Remove(path)` are WIDENED, not copied around: `TempDirectory`
  becomes `OwnedDir.Create(what)`'s path (claim first, E3), `Remove` becomes `Removal.Quietly(path, Owned.DefaultWarn)`
  — so the 14 callers keep their shape and only their argument changes (`"creds-mcp-pump"` → `"mcp-pump"`), and a
  refused removal stops being silent (one warning line, the folder left prefixed and claimed).
- `BackupArchiveCommandTests.cs:143`'s kit moves to `Path.Combine(AppContext.BaseDirectory, "aot-kit")` — the build
  output, as `dew_flow_mcp`'s `SpoolFixtureTests` keeps its hand-checked file — so it keeps its purpose (a fixed path a
  person can find, overwritten every run), stops putting a key into the shared temp root, and two executables no
  longer race on it (each has its own `bin`). The comment's two command lines (`:139-140`) are updated.

**The change — the sites** (E3 S4's migration pattern: a class that makes folders becomes `IDisposable` with
`private readonly OwnedScope _owned = new();` and `public void Dispose() => _owned.Dispose();` — xUnit v3 disposes it
after every test, passed or failed; factories become instance methods; `what` is the old leaf without its
`cred-vault-`/`creds-` lead):

| Site | Becomes |
|---|---|
| the seven private `TempDir()`/`NewDir()`/`NewPath()` (`BackupArchiveCommandTests.cs:276`, `BackupArchiveTests.cs:484`, `BackupKeyFileTests.cs:148`, `BackupRunnerTests.cs:784`, `BackupStoreTests.cs:482`, `LoginKeyStoreTests.cs:21`, `OrgBlockingWithdrawalTests.cs:53`, `OrgProjectsStoreTests.cs:16`, `ShareMaintenanceTests.cs:25`) | `_owned.Dir("backup-cli")` etc.; where a unique PARENT was the point (`BackupArchiveTests.cs:477-481`), the owned folder is that parent and `target` stays its child |
| the ctor-made `_dir`/`_root` of `OrgEventLogQueryTests.cs:24`, `OrgEventLogTests.cs:19`, `OrgMembersStoreTests.cs:25`, `OrgSettingsStoreTests.cs:16`, `OrgRegistrationTests.cs:50`, `StartupGuardsTests.cs:11`, `src_service_defaults/tests/CredsLoggingTests.cs:14`, `src_broker_client/tests/SessionTitleTests.cs:22` | `_owned.Dir(...)`; their hand-written `Dispose` bodies go (each swallowed a different subset of exceptions) |
| `OrgRecoveryMaintenanceTests.cs:19`, `LoggingSinkTests.cs:69`, `:101`, `:153` | `_owned.Dir(...)`; the eight `try/finally` deletes and the last-statement delete at `:162` go |
| `VaultServer.cs:45` | `DataDir = OwnedDir.Create("vault")` held in a field; `Dispose(bool)` disposes it after `base.Dispose` and the env restore, in place of `:111-121` — no shared `cred-vault-tests` parent |
| `StartupGuardTests.cs:29`, `:165` | `_owned.Dir("guard-logs")`; the `not-a-directory` FILE inside `_owned.Dir("guard-file")` |
| `src_broker_client/tests/EndpointsTests.cs:16` | `_owned.Dir("endpoints")`; `:80` → `Owned.TempRoot()` |
| the 14 `HostProcess.TempDirectory` callers | argument renamed only (widened helper, above) |
| `src_cli/tests/AgentRelayHostTests.cs:34`, `AgentRelayConnectionTests.cs:162`, `RelayLogTests.cs:84` | `Path.Combine(_owned.Dir("sock", Owned.ShortSocketRoot), "cr.sock")` — `/tmp/testsToDelete-creds-sock-abc123/cr.sock` is 44 bytes; the length is asserted as `AgentRelayTests.cs:122` does |
| `AgentRelayTests.cs:121` | `Path.Combine(_owned.Dir("corpse"), "c.sock")`, the `:122` length assertion kept — it is the guard that the move still fits macOS |
| the nothing-created sites `LogRootTests.cs:17`, `:18`, `:44`, `AgentRelayTests.cs:105`, `RelayPipeEndingTests.cs:41`, `BackupKeyFileTests.cs:92`, `EndpointsTests.cs:80` | `Owned.TempRoot()` in place of `Path.GetTempPath()` — any absolute directory, same meaning |
| `Owned.cs` `TempRoot()` | the one `Path.GetTempPath()`, under `// testsToDelete-exempt: raw-temp — the helper is the one place a test learns the temp root` |

Dispose order matters where a live host or a child writes into the folder (`ShareMaintenanceTests.cs:122-133`,
the process tests): the host or child is a `using` inside the test, so it is gone before xUnit disposes the class and
its scope.

**Scenarios.** E3 S2 sc. 1–11 and S3 sc. 1–7 and S4 sc. 7–8, renamed to this token and namespace, in
`src_service_defaults/tests/Leftovers/` — the coder takes E3's merged test files as the scenario list and records in
the PR which ones were carried and any that were not (with why). Then, for this repository:

1. **Every executable sweeps at its start** — a test class in each of the five projects (one shared linked file
   `Support/Leftovers/SweepRanTests.cs`) takes `LeftoversSweepFixture` and asserts `LastRun` is not null.
2. **What leaked stops leaking** — RED on `main`, recorded before the migration: one run of `CredVaultServer.Tests`
   and `CredsBroker.Tests` leaves N new folders under `cred-vault-backup-run`, `-backup-store`, `-backup`,
   `-backup-cli`, `-key-file`, `cred-vault-tests` and `creds-endpoints-*` (expected ≈ 190; the exact N in the PR), the
   six parents themselves, and `cred-vault-aot-kit`. GREEN: none of them new, the kit under `bin/…/aot-kit`. And
   the widened `HostProcess.Remove`: a test holding a file under a `HostProcess.TempDirectory` folder open with
   `FileShare.None` (Windows) or a read-only parent (POSIX, premise asserted) → `Remove` returns, the warn seam got ONE
   line, the folder still matches `Owned.Pattern` and keeps its claim — RED on `main`: the same set-up leaves an
   unclaimed, unprefixed folder and says nothing.
   And the sockets: on Linux and macOS the three `cr.sock` paths are asserted < 103 bytes and the tests pass; a
   `LeftoversSweep` over a private pair of roots finds a dead-claimed `testsToDelete-creds-sock-*` in the second root.
3. **The audit has teeth** (by hand, recorded, reverted): drop the `IDisposable` from ONE migrated class in
   `CredVaultServer.Tests`, run its executable → non-zero with the audit's message naming that class's folders;
   restore → green. If xUnit v3 does not fail the run on an assembly-fixture cleanup exception, stop and report (E3
   S4 sc. 8 asks the same).
4. **Nothing leaks after a full run** (by hand): the old names before and after the five executables on Windows and
   in WSL — the RED count, then zero new old-form entries and zero `testsToDelete-creds-*`.

- **Commands.** `node $LP dotnet build dew_flow_creds_for_devs.slnx -m:4 --disable-build-servers` plus the two
  projects the solution does not carry (`research/module_tests.md:1317-1319`); the five executables one after
  another (`:1320-1324`), each with `--filter-namespace "CredsForDevs.Tests.Leftovers"` first; `dotnet format
  dew_flow_creds_for_devs.slnx --verify-no-changes --no-restore` in Linux or WSL (CRLF noise on Windows).
- **DoD.** Every scenario RED then GREEN on Windows and on the CI runners (the four client projects on all three OSes);
  the audit's teeth observed and reverted; the .NET tier row of `module_tests.md:20` names the helper, the sweep and the
  audit; build at 0 warnings.

## S4 — The CI smoke carve-out, acme-test, the shell helper and the shell scripts

- **Models.** Brief by Opus; code by a Sonnet coder; review by Opus against rule §2, §5, D5, D6.
- **Goal.** The image smoke follows the carve-out and a failed smoke stays failed and never publishes; the acme probe
  leaves nothing in the checkout, the temp root or the Docker daemon; every CI/test shell script names, claims and
  removes its scratch on every path.
- **Files.** `.github/workflows/docker.yml`; new `.github/scripts/lib/owned.sh` and `.github/scripts/lib/owned.test.sh`;
  `.github/workflows/ci-clients.yml` (one step after `:79`: *Self-test the shell helper*); `.github/scripts/mcp-listen-smoke.sh`,
  `mcp-listen-smoke.test.sh`, `version-smoke.sh`, `version-smoke.test.sh`, `start-server-and-wait.sh`,
  `start-server-and-wait.test.sh`; `deploy/restore-archive-itest.sh`; `deploy/acme-test/run.sh`,
  `docker-compose.acme-test.yml`; `.gitignore:120-121` (the `state/` line goes); `ci-server.yml:257-262` (shellcheck
  gains `owned.sh` and `deploy/acme-test/run.sh`); `deploy/README.md:252` if it describes `state/`;
  `research/architecture.md:363` (the image line) .

**The change — `owned.sh`** (sourced; bash; no `set -e` of its own):

```bash
OWNED_REPO_TOKEN=creds                                  # rule §1 — the ONLY place the shell token is written
OWNED_PREFIX="testsToDelete-${OWNED_REPO_TOKEN}-"
owned_owner   # prints <host>@<linux|macos|windows>:<pid> — host from `hostname` sanitised [@:[:space:]] → '-';
              # os from `uname -s`; pid: MINGW*|MSYS*|CYGWIN* → read the Windows pid from /proc/$$/winpid, else $$
owned_dir <what>     # validates what (non-empty, no / \ control, no leading -, ≤ 36); prints the new folder:
                     # mktemp -d "${TMPDIR:-/tmp}/${OWNED_PREFIX}<what>-XXXXXX" — the ONE mktemp, under an exemption
owned_claim <dir>    # (set -o noclobber; owned_owner > "<dir>.owner") — a failed claim: owned_remove, return 1
owned_remove <dir>   # refuses an empty path or a basename not matching ^testsToDelete-creds-; five tries 0.1 s apart:
                     # rm -rf -- "<dir>", then rm -f -- "<dir>.owner"; on giving up ONE stderr line, return 0
```

Every caller does, in this order — create, register, claim (rule §2):
`work="$(owned_dir smoke-test)"; trap 'owned_remove "$work"' EXIT; owned_claim "$work" || exit 1`
(a script with its own trap calls `owned_remove "$work"` inside it: `start-server-and-wait.test.sh:36-42`).

**The change — the scripts.** `mcp-listen-smoke.test.sh:19`, `version-smoke.test.sh:14`,
`start-server-and-wait.test.sh:28` → the line above (the `rm -rf` at `:72`, `:81` goes); `restore-archive-itest.sh`
→ one `owned_dir` per `world()` call, each added to an array that ONE `trap … EXIT` (registered before the first
`world`) removes; `mcp-listen-smoke.sh:35-37` and `version-smoke.sh:30`, `:64` → under `RUNNER_TEMP` (a runner-owned
root, emptied per job) unchanged with an inline `testsToDelete-exempt: raw-temp — RUNNER_TEMP is emptied by the runner
at the start and end of every job` only if S5's classes match it; off CI (no `RUNNER_TEMP`, no explicit root) →
`owned_dir` + trap; `start-server-and-wait.sh:107`'s default (no `START_SERVER_LOG`) → `owned_dir server-log` without a
trap, because the log is handed on (`:132`) — its claim names the shell that made it, so the next sweep collects it
once that shell is gone, and the test (`start-server-and-wait.test.sh`) passes `START_SERVER_LOG="$work/…"` so its
runs leave nothing.

**The change — `docker.yml`** (D5). A new first step after checkout, *Name the smoke's resources*:

```yaml
      # common/test-leftovers.md §1, §3, §5: one random id per job; the owner is the job's runner process, the parent
      # of every step's shell. Printed once, so the first run shows which process that is.
      - name: Name the smoke's resources
        run: |
          {
            echo "SMOKE_ID=$(openssl rand -hex 4)"
            echo "SMOKE_OWNER=$(hostname | tr -s '@: \t' '-')@linux:$PPID"
          } >> "$GITHUB_ENV"
          ps -o pid=,comm= -p "$PPID" || true
```

Every `cv`/`cv-refused`/volume occurrence in `:78-117` becomes the literal prefixed name of D5; `docker run` and both
`docker volume create` gain `--label "testsToDelete.owner=$SMOKE_OWNER"`; `:92`, `:111`'s `docker rm -f`, `:116-117`
go. After *Smoke-test a refused start*:

```yaml
      # The carve-out's remover (common/test-leftovers.md §5): after every step that reads the two containers, on
      # every path, by exact name — and it never decides the verdict: continue-on-error, `|| true`, exit 0.
      - name: Remove the smoke's containers and volumes
        if: always()
        continue-on-error: true
        run: |
          [ -n "${SMOKE_ID:-}" ] || { echo "no smoke id: nothing was named, nothing to remove"; exit 0; }
          docker rm -f -v "testsToDelete-creds-cv-$SMOKE_ID" || true
          docker rm -f -v "testsToDelete-creds-refused-$SMOKE_ID" || true
          docker volume rm "testsToDelete-creds-refused-data-$SMOKE_ID" || true
          docker volume rm "testsToDelete-creds-refused-logs-$SMOKE_ID" || true
          echo "left after removal:"
          docker ps -a --filter label=testsToDelete.owner --format '{{.Names}}' || true
          docker volume ls --filter label=testsToDelete.owner --format '{{.Name}}' || true
```

`Log in` and `Publish` are untouched. The owner pid: if the first run prints a process that is not the runner's
worker, use `$$` of the naming step and say so in the PR — on a hosted runner nothing reads it, and its only reader
elsewhere (the janitor, one hour) cannot select it inside the 30-minute job (`docker.yml:31`).

**The change — acme-test** (D6). `docker-compose.acme-test.yml`: drop `name:` (`:19`); an `x-owned: &owned` block
`labels: { testsToDelete.owner: "${TESTS_TO_DELETE_OWNER:?}" }` merged into each service (`<<: *owned`) and set on
`networks.edge.labels`; every `./state/…` source (`:47-48`, `:68-69`, `:97-98`) → `${ACME_STATE:?}/…`. `run.sh`:
source `../../.github/scripts/lib/owned.sh`; the start-of-run sweep of D6 first (janitor `--token` branch or the
non-destructive fallback); then `STATE="$(owned_dir acme)"`, `id` = its six-character suffix lowercased,
`PROJECT="teststodelete-creds-acme-$id"`, `COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.acme-test.yml)`;
`trap cleanup EXIT` registered NOW, before `owned_claim` and before any `up`, where `cleanup` = `compose down -v
--remove-orphans || true`, then `docker run --rm -v "$STATE":/s alpine sh -c 'rm -rf /s/certs /s/data /s/logs' ||
true`, then `owned_remove "$STATE"`; export `ACME_STATE="$STATE"` and `TESTS_TO_DELETE_OWNER="$(owned_owner)"`; the
fixed-name `cleanup` at `:53` and the `rm -rf state` at `:54` go (`mkdir -p` the four subfolders under `$STATE`);
`:56`'s chown mounts `$STATE`. Every `state/…` path in the checks (`:83`, `:86`) reads `$STATE/…`. On Git Bash the
`-v "$STATE":/s` form is whatever today's `"$(pwd)/state":/s` proves to work — verified by scenario 6, not assumed.

**Scenarios** (RED first where a leak exists today):

1. **The smoke's remover runs on every path and never greens a failed smoke** — on a throwaway branch (never
   merged): the smoke steps given a sabotaged environment (`Vault__AllowedDomains=` empty, so the server refuses its
   start and never becomes healthy), `Log in`/`Publish`'s `if:` replaced by `github.event_name == 'workflow_dispatch'`
   and `push: false` (so the branch can reach them and publishes nothing); `gh workflow run docker.yml --ref <branch>`.
   **RED, on the old shape** with one extra always-run `docker ps -a` step: the job FAILED, `cv` is still listed.
   **GREEN, on the new shape**: the job FAILED, *Remove the smoke's containers and volumes* RAN and its "left after
   removal" listing is EMPTY, `Publish` is reported **skipped**. Then the same branch with the `cv-refused` half
   sabotaged (an image that exits 0) — FAILED, remover ran, listing empty, `Publish` skipped. Run URLs in the PR; the
   branch deleted.
2. **The happy path on the real shape** — `gh workflow run docker.yml --ref <the PR branch>`: green, the remover's
   listing empty, `Log in`/`Publish` skipped by their own `if:` (not main). `actionlint` green (`ci-server.yml:294-332`).
3. **`owned.sh` keeps rule §2** (new `.github/scripts/lib/owned.test.sh`, run from `ci-clients.yml` beside the two
   smoke self-tests, three OSes): `owned_dir x` → `^testsToDelete-creds-x-[A-Za-z0-9]{6}$` under `${TMPDIR:-/tmp}`;
   the claim parses with the contract's owner grammar and, on Windows, names a pid `tasklist` lists while the script
   runs; a bad `what` → non-zero, nothing made; `owned_remove ""` and `owned_remove /tmp/other` refuse and remove
   nothing; a script killed with `kill -9 $$` from a child leaves the folder AND its claim (the next sweep's input);
   `owned_remove` on a folder whose parent is read-only (POSIX, premise asserted) returns 0, one line, both remain.
4. **The shell scripts leave nothing** — RED on `main`: `restore-archive-itest.sh` leaves nine `tmp.*` folders (count
   them before/after one run); `mcp-listen-smoke.test.sh` interrupted with SIGINT mid-run leaves its `tmp.*` folder.
   GREEN: zero new old-form entries; the interrupted run leaves nothing (the trap ran).
5. **acme leaves nothing** (by hand, on the machine the owner uses — Git Bash on Windows — and on Linux if one is at
   hand, recorded): RED on `main`: after a green `./run.sh`, `deploy/acme-test/state/` exists; on Linux the second run
   stops at `:54` (if it does, that is the reasoning of the facts measured). GREEN: after a green AND after a failing
   run (`VAULT_IMAGE=busybox`), no `state/`, no `testsToDelete-creds-acme-*` folder or claim, `docker ps -a --filter
   label=testsToDelete.owner` shows no acme container, `docker network ls` no acme network.
6. **acme survives its own kill and is collected** — `./run.sh` killed with `kill -9` (Windows: `taskkill /F /PID
   <winpid>`) mid-issuance: the project, the network and the state folder remain, labelled/claimed with that pid; the
   next `./run.sh` (D6 branch) either removes them before starting (janitor `--token`, the project gone and the run
   green) or stops before `up` naming the project and the janitor command (fallback). A second `./run.sh` started
   while the first is LIVE: the first one's stack is untouched (the old `:53` tore it down).

- **Commands.** `.github/scripts/lib/owned.test.sh`; the three `.test.sh`; `bash deploy/restore-archive-itest.sh`;
  `docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:v0.11.0 <every changed .sh>`; `actionlint`; the
  dispatches of sc. 1–2; `cd deploy/acme-test && ./run.sh`.
- **DoD.** Sc. 1 observed RED then GREEN with run URLs; sc. 2 green; sc. 3–4 RED then GREEN; 5–6 recorded on at least
  one machine, the other OS stated as not run; `architecture.md:363` says the smoke's containers are named, labelled
  and removed by one always-run step that never decides the verdict.

## S5 — The repository-wide guard, its CI step, and the docs

- **Models.** Brief by Opus; code by a Sonnet coder; review by Opus against rule §1, §5, §7 and D7.
- **Goal.** No test, harness, CI script or workflow here creates a temp path, container, volume or compose project
  outside the three helpers (or under a valid inline exemption), every helper's token is registered, and a scan of
  nothing is red — checked on every pull request.
- **Files.** New `.github/scripts/leftovers-check.mjs`; `.github/workflows/docs.yml` (two steps after *Public
  hygiene*: `node .github/scripts/leftovers-check.mjs --selftest`, then `node .github/scripts/leftovers-check.mjs`);
  the inline exemptions of the product sites; `research/module_tests.md` (a section *Test leftovers* after
  `:146`), `research/architecture.md:366` (the docs·plans line names the guard), `CLAUDE.md` (one line in *Commands*:
  the janitor, `bash .claude/rules/shared/tools/janitor.sh --dry-run`, from Git for Windows' bash on Windows).

**The guard** — `dew_flow_conventions · tools/leftovers-check.mjs`'s shape, Node built-ins only:

- **Discovery** — `git ls-files -z --cached --others --exclude-standard` (as `public-hygiene.mjs` does), keeping:
  `src_vs_code/src/test/**/*.ts`, `src_vs_code/scripts/**/*.{cjs,mjs,js,sh}`, `src_minimalapi_server/scripts/**`,
  `src_*/tests/**/*.cs`, `.github/workflows/*.{yml,yaml}`, `.github/scripts/**/*.{mjs,js,cjs,sh}`,
  `deploy/**/*.{sh,yml,yaml}`, every `*.sh` and `*.ps1`, `http/**/*.{mjs,js,cjs}`. Excluded by name — a frozen list a
  selftest pins to exactly one entry: `.github/scripts/leftovers-check.mjs` (it carries the violations as fixtures).
  **Scan of nothing**: fewer than one file in each of `src_vs_code/src/test/`, `src_*/tests/`, `.github/workflows/` ⇒
  exit 2, `leftovers-check: scanned nothing under <root> — discovery broke; the repository is not clean`.
- **Classes** — `leftovers-check.mjs:121-171` (raw-temp, raw-worktree, shared-store, ryuk-off; comments skipped,
  exemptions read) plus, for this repository's languages: raw-temp `CreateTempSubdirectory\s*\(`,
  `GetTempFileName\s*\(`, `GetEnvironmentVariable\(\s*"(TEMP|TMP|TMPDIR)"`, and in `.sh`/workflow `run:`
  `\$\{?TMPDIR\b`, `\$\{?TEMP\b`, `\$\{?TMP\b`, `\bmktemp\b`; docker-run and docker-name as `:173-364` (a `docker
  run` without `--rm` passes only under the complete carve-out: a prefixed `--name`, every named volume prefixed, a
  LATER `if: always()` + `continue-on-error: true` step after every reader that runs `docker rm -f -v <name>` and
  `docker volume rm <volume>` — names compared with surrounding quotes stripped; in a `.sh`, a `trap … EXIT` on an
  earlier line with `|| true`); docker-name also on `docker compose -p|--project-name <name>` (and refused: a `docker
  compose … up` with no `-p` in a test file — `*.test.sh`, `*-itest.sh`, `deploy/acme-test/**`); two classes of this
  repository: `workflow-unreadable` (D7) and `verdict` — in a job that holds a carve-out remover, a step that
  publishes (`push: true` under `with:`, or `docker push`) whose `if:` contains `always()`, `failure()` or
  `cancelled()`.
- **Exemptions** — inline only, the grammar of `leftovers-check.mjs:61`, `:90-117` and the reason test of
  `dew_flow_conventions · tools/ownership-check.mjs` `isReason` (≥ 10 characters, ≥ 3 words, no placeholder; `shared-store` needs
  `lock:`; `ryuk-off`, `verdict`, `workflow-unreadable` never exemptible). The expected exemptions: the three helpers'
  one temp line each; `install.sh:63`, `:76`, `deploy/restore.sh:102`, `deploy/restore-archive.sh:61` (product); the
  `docker compose` calls of `restore-archive-itest.sh` (docker is a shim there, `:68-124`); any `RUNNER_TEMP` line S4
  kept. `src_vs_code/src/installCommand.ts` is not discovered (product source).
- **Tokens** — `OWNED_REPO_TOKEN` in `owned.sh`, `REPO_TOKEN` in `owned.cjs`, `RepoToken` in `Owned.cs`: each found
  exactly once, all three equal, and that token a row of the mounted rule's `## Tokens` table (`tokenFindings`,
  `leftovers-check.mjs:400-418`; header exactly `| token | family | repository |`; family `dew_flow`). The mounted
  file missing ⇒ a finding naming `git submodule update --init .claude/rules/shared`.
- **Output** — `file:line — class — text` per finding, then one cure sentence per class naming rule §7 and the helper
  to use; exit 0 clean, 1 findings, 2 scanned nothing or bad arguments.

**Scenarios** (RED first: the real-tree run on the last `main` commit before S2–S4 merged):

1. **This repository passes the guard** — RED before S2–S4 with the full list in the PR: every Node, C# and shell
   site of the facts (the 46 + 15 + 9 stubs + C# + shell counts, minus what exemptions cover), the two `docker run`
   (`docker.yml:78`, `:105`), the two volume creates, and acme's `docker compose` without `-p`. GREEN after.
2. **Every class fires once, and a valid exemption silences it** (`--selftest`, in-memory): `fs.mkdtempSync(` in a
   `.ts` ⇒ 1; `Directory.CreateTempSubdirectory("x")`, `Path.GetTempPath()` in a `.cs` ⇒ 1 each; `mktemp -d`,
   `"${TMPDIR:-/tmp}/x"` in a `.sh` ⇒ 1 each; `git worktree add` ⇒ 1; a workflow with `docker run -d --name
   testsToDelete-creds-cv-$X img` and no remover ⇒ 1 `docker-run`; the same with the D5 remover AFTER the reader ⇒ 0;
   the remover BEFORE the `docker logs` step ⇒ 1; the remover without `continue-on-error` ⇒ 1; the remover missing one
   volume ⇒ 1; `--name cv` ⇒ 1 `docker-name`; `docker volume create cv-data` ⇒ 1; `docker compose -p
   teststodelete-creds-acme-$id up` ⇒ 0, `docker compose up` in `deploy/acme-test/run.sh` ⇒ 1; a publish step with
   `if: always()` in a job holding a remover ⇒ 1 `verdict`; a `trap` covering a `.sh` `docker run` written on the line
   AFTER it ⇒ 1; `TESTCONTAINERS_RYUK_DISABLED=true` under an exemption ⇒ 1; `testsToDelete-exempt: raw-temp — needed`
   ⇒ 1 `exemption`; a well-formed `raw-temp` exemption ⇒ 0; a commented-out `// fs.mkdtempSync(` ⇒ 0; a workflow
   step written as a YAML flow mapping in a job holding a `docker run` ⇒ 1 `workflow-unreadable`.
3. **A scan of nothing is red** — an empty listing, a listing with no `src_*/tests/*.cs`, a root that does not exist ⇒
   exit 2 each.
4. **The tokens** — the real mount ⇒ none; fixture rules with no `## Tokens`, a two-column table, `creds` only in the
   `repository` column, `creds` twice ⇒ 1 each; the three helper constants disagreeing (`creds` / `creds` / `cred`) ⇒ 1;
   a constant missing ⇒ 1.
5. **The exclusion list is exactly one file** — pinned.
6. **Break-it on the real tree** (by hand, recorded, reverted): one raw `fs.mkdtempSync` in a unit test, one
   `Path.GetTempPath()` in a C# test, `continue-on-error` deleted from the remover step, `.claude/rules/shared`
   de-initialised — each red naming its line; restored ⇒ green.

- **Commands.** `node .github/scripts/leftovers-check.mjs --selftest`; `node .github/scripts/leftovers-check.mjs`;
  `node .claude/rules/shared/tools/plan-lifecycle.mjs`; `node .github/scripts/public-hygiene.mjs`.
- **DoD.** Sc. 1 RED with the recorded list, then GREEN on `main` after S2–S4; 2–5 green; 6 observed; `docs.yml` runs
  both steps in the required job; `module_tests.md` and `architecture.md` updated; this document's status becomes
  `E2 shipped, <YYYY-MM-DD>; promotes with its parent` — never *implemented* while it sits in `todo/` — the README
  row and the parent's E2 entry the same sentence. Parent and stories promote together, after the last epic.

## Test plan

| The parent's "proven by" | Where |
|---|---|
| A failure test of the workflow: the job ends FAILED, the always-run cleanup ran and removed by exact name (observed in the job), `Publish` SKIPPED | S4 sc. 1 (both halves of the smoke), with the RED on the old shape |
| The guard's break-it on a `docker run` without `--rm` and without an always-run remover | S5 sc. 2 (and the remover-before-reader, no-`continue-on-error`, missing-volume variants), sc. 6 |
| RED-GREEN per no-cleanup temp file class | Node unit tests: S2 sc. 10 (counted); harnesses and stubs: S2 sc. 10; C#: S3 sc. 2–4; shell: S4 sc. 4; acme: S4 sc. 5; and S5 sc. 1 for all of them at once |
| Unwind test for the helper | S2 sc. 4–5 (Node), S3 (E3's set), S4 sc. 3 (bash) |
| (contract, not in the parent) owner claim, start-of-run sweep, concurrent-owner survival | S2 sc. 5, 7; S3 (E3 S3 sc. 2); S4 sc. 6 |
| (contract) teardown that gives up stays prefixed and claimed | S2 sc. 6; S3 (E3 S2 sc. 6); S4 sc. 3 |

## Definition of Done

- [ ] The pin carries the E1 release; the mounted rule lists `creds` (S1).
- [ ] Every folder and file a Node, C# or shell test, harness or CI script makes is named
      `testsToDelete-creds-<what>-<id>`, claimed beside itself, removed on every unwinding path, never by a throwing
      teardown; a teardown that gives up leaves it prefixed and claimed with one line (S2–S4).
- [ ] `npm test`, `itest:all` and each xUnit executable sweep at start on owner liveness and never fail the run for it;
      `npm test` and the xUnit executables fail a run that left something they claimed (S2, S3).
- [ ] `docker.yml`'s two containers and two volumes are prefixed, labelled, removed by one always-run exact-name step
      after the diagnostics, and a failed smoke was observed FAILED with `Publish` skipped (S4).
- [ ] acme leaves no `state/`, folder, container or network after a green or a failed run (S4).
- [ ] The guard is red on every class, on an unregistered or disagreeing token and on a scan of nothing, and green on
      `main` in the required `docs.yml` job (S5).
- [ ] `research/module_tests.md`, `research/architecture.md` and `CLAUDE.md` describe the helpers, the sweeps, the
      guard and the janitor.

## Notes for the parent (`dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md`, E2 entry)

Opus, 2026-10-16, against `origin/main` a7b3ecf2 of this repository, the E1 branch of the shared rules and E3's
stories.

| # | The entry says | What is so | Resolution here |
|---|---|---|---|
| N1 | ~110 temp sites, ~35 files without cleanup, 68 files | 111 mentions in 70 files, but 3 are `research/*.md` and 8 are product (`install.sh`, `deploy/restore*.sh`, `installCommand.ts`). Test-side: Node unit 46 sites in 30 files (20 leak, 2 fragile, in 14 files), harnesses 15 folders (8 leak, 3 fragile) + 9 stubs (7 never removed), shell 7 (1 leaks nine per run, 4 fragile or off-CI leaks), C# 54 sites in five projects (11 leak, 3 fragile, in 13 files; ≈ 190 folders per run). About 40 files hold a leak or a fragile site, not ~35; and the C# side is five projects, not "the server tests" | the facts tables; S5 sc. 1 is the exact RED |
| N2 | "the 7 fixed-name stub files the `*-itest.cjs` scripts write" | six are itests; the seventh is `tree-perf-bench.cjs:25`; an eighth, per-pid, is removed on success only (`masked-run-itest.cjs:19`, `:149`) | S2: every stub inside an owned folder |
| N3 | acme: `state/` cleaned at the start of the next run | right, and on a Linux host the start's `rm -rf state` cannot delete root- and uid-10001-owned files (reasoned, S4 sc. 5 measures). The entry misses that acme's COMPOSE PROJECT (four containers, one network, fixed name `cred-vault-acme-test`) is a container leftover too, and that its start-of-run `compose down -v` by fixed name (`run.sh:53`) tears down a concurrent run's stack — the owner-less reclaim rule §4 forbids. Bind mounts are also `:68-69`, `:97-98` | D6, S4 |
| N4 | (nothing) | a consumer whose SHELL starts containers needs rule §4's sweep with three-valued liveness in bash; the shipped janitor has it but no per-token mode, and cannot be sourced. **Request to E1, before its release:** `janitor.sh --token <t>` (capture only `^teststodelete[-_]<t>[-_]`), with `JANITOR_MIN_AGE_MINUTES` already there | D6's first branch; the fallback otherwise — never a copy |
| N5 | a failure test: stub image, job FAILED, `Publish` SKIPPED | `docker.yml` never runs on a pull request (`:14-18`, `:38-42`), and on a dispatch from a branch `Publish` is skipped by its OWN `if:` (`:137`), which proves nothing about `success()` | S4 sc. 1: a throwaway branch makes `Publish` reachable with `push: false`, then a sabotaged smoke shows it skipped by the failure |
| N6 | the guard scans workflows and `deploy/**/*.sh` beside the test trees | also needed: `.github/scripts/**` (four CI/test scripts with temp sites), `src_vs_code/scripts/`, `src_minimalapi_server/scripts/`. The mounted `tools/leftovers-check.mjs` cannot be reused (it imports `yaml`, `:34`; its discovery is E1's layout). Its `raw-temp` class misses the shell spelling `${TMPDIR:-/tmp}`, so `mcp-listen-smoke.sh:35` and `version-smoke.sh:30` would pass unseen | D7, S5 (shell `TMPDIR`/`TEMP`/`TMP` added) |
| N7 | a Node helper (`src_vs_code`) and a C# helper | the server's harness runs in `ci-server.yml:81` with no compile, and the shell scripts run on three OSes without Node or .NET as a prerequisite: the Node helper must be dependency-free CommonJS, and there is a THIRD, shell helper | D1 |
| N8 | helper, guard, proof | no owner claim and no start-of-run sweep (rule §2–§4), which every repository that creates a kind must wire; and bash on Windows must write the WINDOWS pid (`/proc/$$/winpid`) or every Node, C# and janitor reader misjudges it | D3, D4 |
| N9 | "a C# helper (the server tests)" | five xUnit projects make temp paths, not one; four run on three OSes. One helper, linked by the existing `Support/` precedent | D1, S3 |
| N10 | (nothing) | the WSL harnesses' Linux run folders are never deleted, by a machine rule after the 2026-10-07 incident (`wslRun.cjs:18-22`) | out of scope, recorded; no deletion inside WSL is added |
| N11 | (for the contract) | rule §3's `<pid>` is undefined for a CI job, where every step is its own shell; E2 uses the runner's worker (`$PPID`), observed once. One sentence in §5 would settle it for every consumer | D5 |
| N13 | (for E3, whose shape S3 copies) | two things E3's C# shape lacks and creds needs: a socket root other than the temp root (macOS's `TMPDIR` is too long for a 103-byte socket path, so creds binds under `/tmp`), which the sweep must then also scan; and an existing per-repository mini-helper to WIDEN rather than replace (`HostProcess.TempDirectory`/`Remove`, 14 callers) | S3 adds `Owned.ShortSocketRoot` and the second sweep root; sent to E3 as a note so its "what the other epics take" table can carry it |
| N12 | (for the contract) | rule §7's `docker-name` class names `--name`, volume/network create and `WithName`, not `docker compose -p` — a compose project's containers carry the project's name | S5 adds it here; the contract may want it |
