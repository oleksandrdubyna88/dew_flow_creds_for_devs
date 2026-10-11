# PLAN — the `creds` and `creds-mcp` release binaries carry the version of their tag

> Status: **plan only, nothing implemented yet (2026-10-11).** Scope: `.github/workflows/release.yml`,
> `.github/workflows/ci-clients.yml`, `.github/scripts/` (one new smoke and its self-test, one optional
> check added to the listen smoke), `install.sh`, two doc comments in `src_mcp` / `src_cli`, and a
> sweep of real user names and home paths out of tracked files.
>
> Related docs: [architecture.md](../research/architecture.md),
> [PLAN_caller_identity_in_consent.md](../research/PLAN_caller_identity_in_consent.md) (its finding M7
> named this defect and called the stamp "a small, separable change").

## 1. Symptom (measured 2026-10-11)

- The published `creds-mcp-0.10.0-win-x64.zip` (tag `mcp-v0.10.0`, checked against its `.sha256`)
  answers `creds-mcp --version` with **`creds-mcp 1.0.0`**.
- Reproduced locally: `dotnet publish src_mcp/src/CredsMcp.csproj -c Release -r win-x64` (the
  command `release.yml` runs today) → `creds-mcp.exe --version` prints `creds-mcp 1.0.0`.
- The CLI has no `--version` verb (`creds --version` → `unknown verb "--version"`, exit 96), but it
  DOES print its version: the log start line of a serving verb. Reproduced locally with the same
  unstamped publish: `creds relay-pipe` with no agent writes
  `started: relay-pipe, version 1.0.0, pid …, parent …`.

**Why it matters.** Extension 1.14.0's *Check the WSL MCP install* (`src_vs_code/src/wslMcpCheck.ts`,
`src_vs_code/src/mcpInstallTarget.ts:199`) compares the WSL install's `--version` with the version this
window recorded for `creds-mcp`. With every release saying `1.0.0` the check cannot see an older
install. The README promises that `creds-mcp --version` prints the version you ran. Every log start
line of both binaries says `1.0.0`.

## 2. Cause (verified file:line)

| Site | What it does |
|---|---|
| `.github/workflows/release.yml:166` | server publish: `-p:Version="${GITHUB_REF_NAME#server-v}"`, `shell: bash` — the correct pattern |
| `.github/workflows/release.yml:370` | CLI publish — **no `-p:Version`**, and no `shell:` (so `pwsh` on the Windows legs) |
| `.github/workflows/release.yml:563` | MCP publish — **no `-p:Version`**, no `shell:` |
| `Directory.Build.props` | sets no `Version` → the SDK default `1.0.0` |

Every reader of the version reads the assembly version, so the one stamp fixes all of them:

| Reader | Source |
|---|---|
| `src_mcp/src/Program.cs:52` | `Program.Version` = `typeof(Program).Assembly.GetName().Version?.ToString(3)` |
| `src_mcp/src/Program.cs:295` | `--version` first line `creds-mcp {Version}` |
| `src_mcp/src/Program.cs:143` | log start line via `HostRun.Start(log, mode, Version)` |
| `src_mcp/src/Program.cs:374` | MCP `ServerInfo.Version` sent to every client |
| `src_cli/src/AgentRelay.cs:47` | `AgentRelay.Version` (same expression) |
| `src_cli/src/AgentRelay.cs:189`, `src_cli/src/RelayPipe.cs:69` | log start lines of `relay` / `relay-pipe` |
| `src_service_defaults/src/HostRun.cs:37` | formats `started: {Mode}, version {Version}, …` — takes the string, reads nothing itself |
| `src_broker_client/src` | reads no assembly version (checked) |

The `exited: code …, reason …` line (`ExitReason`) carries no version. The CLI's consent label stays
`creds CLI` without a version (`src_cli/tests/CliContractTests.cs:103` explains why it had none); this
plan does not change that label — only the comment, which will no longer be true.

Not affected: `src_vs_code` downloads `creds`/`creds-mcp` by tag (`binaryInstaller.ts:117`) and keeps
the TAG's version as its record; it packs no binary and has no version of its own for them.
`ci-clients.yml:83-93` builds unstamped binaries, and no test reads their version as a number
(`src_mcp/tests/VersionTests.cs` compares with `Program.Version`, whatever it is).

## 3. The change

1. **`release.yml`, CLI and MCP legs**: a `Version` step computes `VERSION` — the tag minus its prefix
   on a tag (`${GITHUB_REF_NAME#cli-v}` / `${GITHUB_REF_NAME#mcp-v}`), and `0.0.0` on a
   `workflow_dispatch` trial (both jobs run on dispatch; `-p:Version=main` would fail the build). The
   publish steps get `shell: bash` and `-p:Version="$VERSION"` — the server step's pattern.
2. **New `.github/scripts/version-smoke.sh <mcp|cli> <binary> <version> [log root]`** — asserts the
   version EXACTLY:
   - `mcp`: the first line of `--version` equals `creds-mcp <version>` (a second line exists only
     inside WSL, where the Windows half is asked; it is not judged here);
   - `cli`: `relay-pipe` with no agent announced writes a log whose start line contains
     `started: relay-pipe, version <version>,` (the trailing comma stops `0.4.1` matching `0.4.10`).
   Literal comparisons only (`grep -F`, `[[ == ]]`), never a regex where `.` matches anything; a
   trailing `\r` is stripped first, because .NET writes CRLF on Windows. Every run of the binary is
   bounded by a 60 s guard (`timeout`, `gtimeout` or perl's alarm, as the listen smoke does):
   `relay-pipe` with nothing announced ends at once today (measured: exit 90 with the log written), and
   the guard keeps a regression from holding a release leg for its half hour (plan round 1, finding 0).
   Runs in both release legs after the publish, on every leg whose runner has the binary's
   architecture — all but the cross-built `osx-x64`; the arm64 legs build on arm64 runners, so the
   older smokes' `!endsWith(rid, 'arm64')` skip would have left three assets per product unchecked
   (cadence consultation, point 1). The
   `Version` step and both publish steps are `shell: bash` (the Windows legs default to `pwsh`).
3. **`mcp-listen-smoke.sh`**: when `SMOKE_VERSION` is set, the serve log's start line must say
   `started: serve, version $SMOKE_VERSION,` — release.yml sets it, so the log line is asserted too.
4. **Self-tests**: new `version-smoke.test.sh` (stand-in binaries: right version passes; `1.0.0`
   fails; a prefix like `0.10.10` for `0.10.1` fails; trailing text fails; no log fails) and a new
   case in `mcp-listen-smoke.test.sh`. `ci-clients.yml` runs both self-tests on all three OSes.
5. **`ci-clients.yml`**: build `creds-mcp` and `creds` once more with `-p:Version=0.0.1`, into their OWN
   output folder (`-o`, so the unstamped `bin/Release` the tests and the listen smoke use is untouched), and run
   `version-smoke.sh` on them, so the stamp → `--version` / log path is proven on every pull request
   on Linux, macOS and Windows, not first on a tag.
6. **Doc comments** at `src_mcp/src/Program.cs:51` and `src_cli/src/AgentRelay.cs:47` say where the
   version comes from (the tag, through `release.yml`) and which check holds it; the stale comment at
   `src_cli/tests/CliContractTests.cs:102-103` is corrected.
7. **Public-repo hygiene**: `install.sh:126` names a real Windows home path with a user name → becomes
   `CREDS_PREFIX="$HOME/.local/bin"`. The same sweep over ALL tracked files (`/c/Users/`, `C:\Users\`,
   `/home/<name>/`, `/mnt/c/Users/`, macOS `/Users/<name>/` (plan round 1, finding 1), `user@host:~`)
   found more real ones; placeholders (`<you>`, `…`,
   `dev`, `me`, `ada`, `someone`, `u`) stay:
   - `research/PLAN_caller_identity_in_consent.md:99,112`, `research/PLAN_consent_shows_the_tab_title.md:350`,
     `research/PLAN_os_aware_execution.md:60`, `todo/PLAN_connect_in_a_remote_window.md:39,83,103`;
   - `src_broker_client/tests/CallerIdentityTests.cs` (`/home/<name>`, a session name built from it),
     `src_cli/tests/AgentRelayTests.cs:26,33,34` (a user name in the socket path);
   - `src_vs_code/src/test/fileAcl.test.ts:18,26`, `sshConnectRemote.test.ts:27`,
     `remoteRoute.test.ts:103,106`, `wslRelay.test.ts:252,255` — **see §4, they ship separately.**

## 4. Releasing — mcp 0.10.1 and cli 0.4.1, nothing else

`release-please-config.json` gives a commit to every package whose directory it touches, and bumps
each by the commit TYPE; `exclude-paths: [".github"]` drops a commit that touches only `.github`, and
its `$exclude` note says a `Release-As:` footer cannot rescue such a commit and applies to every
package touched. No commits are unreleased under `src_mcp` since `mcp-v0.10.0` or under `src_cli`
since `cli-v0.4.0` (checked with `git log <tag>..origin/main -- <dir>`).

**Route:** the squash commit is typed `fix:` and touches `src_mcp/` and `src_cli/` (step 6 and the
CLI test hygiene) — so release-please proposes exactly `mcp 0.10.1` and `cli 0.4.1` by its normal
rule, with no footer. It touches nothing under `src_vs_code/` or `src_minimalapi_server/`, so neither
the extension nor the server is proposed. `src_broker_client`, `research/`, `todo/`, `install.sh` and
`.github/` belong to no package.

**The extension test files** (four, §3.7) would put a `fix:` commit under `src_vs_code/` and propose
an extension release, which the owner forbade. They go in a second small PR typed
`test(extension): …`, which release-please does not release. (Asked `ask_consultants`: answered
`none_available`; decided by the configuration above.)

Then: dispatch `release-please.yml`, check only the two expected PRs open (the existing server PR
#208 is not touched), merge one, dispatch to cut its tag, wait for `release.yml`; rebase the second
on `main` (manifest conflict: main's lines plus its own bump) in a new worktree, push with
`--force-with-lease`, merge, dispatch. One tag at a time. After each: download the `win-x64` asset,
check its `.sha256`, run `--version`.

## 5. Build order

1. Write `version-smoke.sh` + `version-smoke.test.sh`, the `SMOKE_VERSION` check + its self-test case.
2. **RED**: run the smokes against binaries published exactly as `release.yml` does today → they fail
   naming `1.0.0`.
3. **GREEN**: publish with `-p:Version=X.Y.Z` → they pass. **RED again** with the stamp removed.
4. Edit `release.yml` and `ci-clients.yml`; doc comments; hygiene sweep.
5. Build (`-m:4 --disable-build-servers`, lowered priority), run the mcp, cli and broker-client test
   executables one after another; run both self-tests in Git Bash.
6. Code gate, PR, checks green, merge; then the follow-up `test(extension)` PR; then the releases.

## 6. Test plan

| Check | Expected |
|---|---|
| `version-smoke.test.sh` (Git Bash; CI on 3 OSes) | all cases ok |
| `mcp-listen-smoke.test.sh` | all cases ok, including the new version case |
| `version-smoke.sh mcp <unstamped publish> 0.10.1` | **fails**, output names `creds-mcp 1.0.0` |
| `version-smoke.sh mcp <publish -p:Version=0.10.1> 0.10.1` | passes |
| `version-smoke.sh cli <unstamped publish> 0.4.1` | **fails**, the start line names `version 1.0.0` |
| `version-smoke.sh cli <publish -p:Version=0.4.1> 0.4.1` | passes |
| `SMOKE_VERSION=0.10.1 mcp-listen-smoke.sh` on both publishes | fails unstamped, passes stamped |
| `CredsMcp.Tests`, `CredsCli.Tests`, `CredsBroker.Tests` executables | green (hygiene edits change only literals) |
| `ci-clients` on the PR (ubuntu, macOS, Windows) | green, incl. the new stamped-build smoke |
| after each release: asset `.sha256` ok; `--version` / log line | `creds-mcp 0.10.1`; `version 0.4.1` |

## 7. Definition of Done

- [ ] Both smokes watched RED against today's build command and GREEN with the stamp; outputs quoted.
- [ ] `release.yml` stamps CLI and MCP from their tags (`0.0.0` on dispatch) and runs the version smoke.
- [ ] `ci-clients.yml` runs the new self-test and the stamped-build smoke on three OSes.
- [ ] No real user name or home path left in tracked files (the four extension test files via the
      follow-up PR); the list reported.
- [ ] `dotnet build` 0 warnings; the three test executables green; plan-lifecycle clean; pin-check passes.
- [ ] One PR merged green (Sonar gate included); release-please proposed only `mcp 0.10.1` and `cli 0.4.1`.
- [ ] Both released; each `win-x64` asset verified against its `.sha256` and prints the new version.
- [ ] This plan promoted to `research/` with `IMPLEMENTED <date>` and a `research/README.md` row.
