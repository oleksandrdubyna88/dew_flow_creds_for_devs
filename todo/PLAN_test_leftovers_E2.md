# PLAN — Test leftovers, E2: creds names, claims, removes and collects what its tests, harnesses and CI smoke make

> Status: **plan only, nothing implemented yet — the 2026-11-01 re-split against release `105d53c` of
> `dew_flow_conventions` (the merged core, F17–F20, the core/detail split), the merged C# helper of `dew_flow_mcp`
> (`4feb245`, with its Darwin path at `197cc76`) and `main` `47724fd` of this repository.** The October split (2026-10-16,
> against the E1 branch) is superseded whole; this document is a new baseline for the plan gate, not a patch. Stories of
> epic E2 of the parent plan `dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md` (§ *Epics*, E2; § *Wave 1*
> for the re-split rule). The pin is **already at `105d53c`** (PR #289, `47724fd`, merged alone 2026-11-01 under owner
> decision 1 of R6): the old S1 is done. Scope: a Node WRAPPER over the mounted reference (never a port), E3's C# helper
> copied by file into one linked folder, a bash helper; every temp site of the extension's unit tests, its harnesses,
> the server's harness, the five xUnit projects and the CI/test shell scripts; `docker.yml`'s two smoke steps;
> `deploy/acme-test/`; two guards (the shipped Node one under `--profile node`, E3's C# one with this repository's
> discovery); `research/module_tests.md` and `research/architecture.md`.
>
> Re-split by Fable (plan → epics role), 2026-11-01. Not a cornerstone (parent, E2 entry; the quota ledger is untouched).
> Models per story below: Sonnet codes, Opus briefs and reviews; two cornerstones (§ *Epics*) have their spec by Fable.
>
> **Plan-gate round 2 (2026-11-01, coai session `0b24304d`): `proceed`**, with 1 of 2 reviewers counted — the file (122 KB) did
> not reach the other whole. One finding accepted (the bash helper claims FIRST, S4) and the operator's commands applied:
> five epics of 3–5 stories at the bottom of this document (§ *Epics*, the last section), per-epic branches and gates, two
> cornerstones, a consultation per three epics (`9d8564bb` before E2.1–E2.3). Stage B is five pull requests, not one (D8).

**Committed together with this document** (one commit, the shared `common/planning-docs.md` § *A plan split into
epics and stories*): its row in `todo/README.md` under *Currently open*, as the first row of the table —

```
| [PLAN_test_leftovers_E2.md](PLAN_test_leftovers_E2.md) | plan only, 2026-11-01 — re-split against release 105d53c; the pin is already there (PR #289); stage A measured empty | Stories of epic E2 of `dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md`. Everything a test, a harness or the image smoke makes outside its process is named `testsToDelete-<owner>-creds-…`, claimed by its run, removed on every path, and collected by the next run when a run was killed: a Node wrapper over the mounted reference (`src_vs_code/scripts/lib/leftovers.cjs`), E3's C# helper (with its Darwin path) linked into the five xUnit projects, a bash helper for the CI scripts; `docker.yml`'s two smoke containers under the contract's carve-out with one always-run exact-name remover that never decides the verdict; the acme harness's state and compose project owned; the shipped Node guard and E3's C# guard over the whole repository |
```

**Parent and contract are cited as paths, never links** (the shared `common/planning-docs.md` § *Across
repositories*): the parent `dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md`; the remainder plan
`dew_flow_conventions · todo/PLAN_test_leftovers_merged_core_release.md` (R6's three owner decisions, R7's release);
the follow-ups `dew_flow_conventions · todo/PLAN_test_leftovers_merged_core_followups.md` (F16–F20); the contract
`dew_flow_conventions · common/test-leftovers.md` (the core, mounted at `.claude/rules/shared/common/test-leftovers.md`)
and `common/test-leftovers-detail.md` (the detail, with the `## Tokens` table — where the two differ the detail decides);
the janitor's contract `common/test-leftovers-janitor.md`; the Node reference `tools/lib/owned.mjs`,
`tools/lib/leftovers-sweep.mjs`, `tools/leftovers-check.mjs`, `tools/lib/sweeper-scan.mjs`, `tools/run-tests.mjs`,
`tools/lib/unmatchable-pid.mjs`, `tools/fixtures/owner-vectors.json`; the shipped janitor `tools/janitor.sh`. The C#
template: `dew_flow_mcp · tests/Mcp.Tests/Leftovers/*.cs` at `197cc76` and its promoted stories
`dew_flow_mcp · research/PLAN_test_leftovers_E3.md` (§ *Deviations*, § *Darwin path*, § *What the other epics take from
here*). The Rust port's record: `dew_flow_sidecar_rust · research/PLAN_test_leftovers_E4.md` (§ *Deviations*). *Rule §n*
below is a section of the contract; `R:n` a line of the detail at `105d53c`; `O:n` a line of `owned.mjs`; `S:n` of
`leftovers-sweep.mjs`; `G:n` of `leftovers-check.mjs`.

## What changed from the October version, and why

| October (2026-10-16, against E1's branch) | Now (2026-11-01, against `105d53c`) | Why |
|---|---|---|
| Names `testsToDelete-creds-<what>-<id>` | `testsToDelete-<owner>-creds-<what>-<id>`; the October form is a **legacy name** the guard refuses and the sweep lists, never collects | rule §1 of the merged core (R:23-68) |
| S1: move the pin to the E1 release | **Done**: PR #289 (`47724fd`) pinned `105d53c` alone, 2026-11-01 | owner decision 1 of R6: a pin bump merges alone |
| One stage; S5 merged last | **Two stages**: A, sweep-only — measured EMPTY here (D8) and recorded; B, the producer stage, five stacked per-epic pull requests E2.1–E2.5 (D8, after the plan gate's split order; the parent's entry 1.6) | the barrier (rule § *The barrier*; R6) |
| D1: a CommonJS **port** of `owned.mjs` / `leftovers-sweep.mjs` (`owned.cjs`) | a **wrapper** `src_vs_code/scripts/lib/leftovers.cjs` that loads the MOUNTED reference and binds the token with `ownedFor({ token, row })` (O:750); nothing of the reference is copied | decision 11 of the merged core (R7): Node consumers wrap and run the reference, never port it — F17–F20 were fixed there once for every Node consumer |
| D7: one guard of this repository's own, in Node (`.github/scripts/leftovers-check.mjs`) | **two guards, neither written here**: the shipped `tools/leftovers-check.mjs --profile node` in `docs.yml`, and E3's C# guard (`LeftoversGuard*.cs`) with this repository's discovery, run by `CredsForDevs.ServiceDefaults.Tests` on three OSes | decision 11 for Node; the `node` profile exists since `115bbf8` (G:174-209); the C# side gets the family's one C# guard |
| S2's end-of-run audit through a run-marker folder (sc. 8, 8a) | the runner exports `TESTSTODELETE_RUN=<its record>` (R:120-121; O:438-449) and the audit compares that exact record after `node --test` returned; no marker folder | the contract's own mechanism; the run marker was an E1-era invention and would itself be an owner-form folder |
| D3: the record `<host>@<os>:<pid>[:<start>]` | `<owner>:<host>@<os>:<pid>[:<start>[:<ns>]]`, the WSL `~distro` suffix, the two keys (name selects, kernel authorises) | rule §3 (R:100-167) |
| S3: E3's shape copied **by shape**, Linux and Windows | E3's helper copied **by file** (byte-identical save the namespace line; `OwnedToken.cs` rewritten), **with the Darwin path**, the layout self-test and the macOS CI steps; this repository's additions in files of their own | E3 § *What the other epics take*; R7 (the Darwin path exists because coai and creds run C# suites on macOS) |
| Windows kernel owner: the profile path | BOTH keys in C# (profile AND owner SID, fail closed — E3's `Scope.IsMine`); the Node wrap runs the reference, which on Windows LISTS and changes nothing until F16's Fix (the parent's F16 (b), decided 2026-11-01) — E2.1 merges only after creds pins that release, and its Windows CI leg asserts a planted gone-owner folder survives | owner decision 2 of R6 applies to PORTS; the wrap takes what the reference does |
| `owner-blind` with the binding tracer everywhere | in `.cs` by literal, no tracer (any bare-prefix literal outside the helper's folder is a finding); scripts keep the shipped classifier | owner decision 3 of R6 |
| The facts, read at `a7b3ecf2` | re-verified at `47724fd`; the 24 commits since moved anchors in six files and added **six legacy-name producers** (below) | the merge of `main` into this branch |
| (nothing) | a **must-not-copy-back-in** list (D9) from wave 1 and the mcp Darwin follow-ups 1–6 | the parent's *Wave 1 done* paragraph; E3's *Darwin follow-ups* |
| `owned.sh`: `mktemp -d`, then the claim | **claim first**, then register, then an exclusive `mkdir` — no `mktemp`; a kill between the two steps leaves an orphan claim the next sweep collects, never an unclaimed folder (S4; a test kills a child between the steps) | plan-gate round 2, the one finding (accepted): rule §2's order |
| `HostProcess.TempDirectory` returns `OwnedDir.Create(..).Path`; `Remove` calls `Removal.Quietly` | the adapter keeps the `OwnedDir` and `Remove` DISPOSES it: at `197cc76` the registry entry leaves only in `OwnedDir.Dispose()` (`OwnedDir.cs:55`, `:71`), so the first shape left every removed folder registered as never disposed and the audit red (S3) | the question consultant (`9d8564bb`, Codex), verified against the file |
| One producer pull request (wave-1 shape) | **five epics, five stacked branches, five pull requests**, each with one plan gate and one code gate; the barrier evidence before the FIRST producer merge (E2.1) | the gate's operator commands (round 2); § *Epics* |

Kept unchanged where they still hold: the facts tables (each anchor re-read), D5 (the carve-out), D6 (acme), the growth
surface, the plan-gate round 1 record, the notes for the parent (N1–N13, with N14–N19 added).

## Goal

Every folder, file, container, volume and compose project that a creds test, harness, CI script or probe makes outside
its own process is named `testsToDelete-<owner>-creds-<what>-<id>` (`<owner>` the OS user's token, `u<uid>` on POSIX or
`w<digits>` on Windows; the lowercase spelling where a namespace requires it), claimed by the run that made it, removed by
that run on success AND failure, and — when the run was killed — collected by the next run's start-of-run sweep, only
under the two keys of rule §4 (scope: the name's owner, the record's owner, the caller's token and the kernel owner are
one; abandonment: the record is `gone`). Two guards keep it so. In CI the image smoke follows the contract's carve-out,
and a failed smoke stays failed and never publishes.

**Done when:** stage A is recorded (S0); `npm test`, every `itest:*` harness and the server's harness create only owned,
claimed folders through the wrapper, leave none after a run, and sweep at start (S2); the five xUnit executables do the
same through E3's helper, on Linux, Windows AND macOS (S3); `docker.yml`, the acme harness and the shell test scripts
follow rule §2, §5 and the carve-out, proved by a failure run whose `Publish` is skipped (S4); both guards are green on
`main` and red on every class that can occur here (S5).

## Facts the split rests on

Read on `origin/main` `a7b3ecf2` (2026-10-16) and **re-verified line by line on `47724fd` (2026-11-01)**. Where an anchor
moved, the new line is given and the old one struck. The parent's figures stand in total (111 temp mentions in 70 files,
`research/` included) and are wrong in their split; these counts bind the stories. "Leaks" = no removal at all;
"fragile" = removed only as a last statement, which a failed assertion or a thrown error skips.

**New since October** (the 24 commits of the SSH allow-longer-windows work, merged after the first split):

- **Six legacy-name producers**, all with a removal: `src_vs_code/src/test/sshAgentServer.test.ts:71` and `:652`
  (`mkdtempSync(… 'testsToDelete-agent-')`, removed at `:118` and `:691`), `src/test/sshAgentWorld.ts:419` (the same
  prefix; removed by a `process.on('exit')` at `:426-429` by exact path), `src_vs_code/scripts/ssh-agent-itest.cjs:76`
  (`testsToDelete-ait-`; removed at `:247` before `process.exit` at `:253`; the `process.exit(1)` at `:89` and the
  `.catch` at `:757-759` skip it — fragile), `:483` and `:595` (`testsToDelete-sshd-`; removed at `:574`, `:625`). Under
  rule §1 their second segment (`agent`, `ait`, `sshd`) is outside the owner grammar: a **legacy name**, which the guard
  refuses (class `legacy-name`) and the sweep lists and never collects (no record). None is an owner-form producer and
  none is a prefix sweep, so none crosses the barrier. S2 migrates all six.
- `sshAgentManager.test.ts` has no temp site any more (October's `:192-210` moved into `sshAgentWorld.ts`); the harness's
  stub is written inside its run folder (`ssh-agent-itest.cjs:279`, was `:230`).
- **The stage A measurement**: `node .claude/rules/shared/tools/sweeper-scan.mjs --root .` on `47724fd` (2026-11-01):
  `none found (1495 file(s) read) — the barrier is open for this scope`. The remainder plan's R6 recorded the same for
  `0fa2ee3` on 2026-10-31. **Stage A is empty.**
- **The shipped guard's RED**, measured on `47724fd` (2026-11-01):
  `node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"`
  → exit 1, **62 findings**: 53 `raw-temp` (44 in 29 `src_vs_code/src/test/*.test.ts` files; 9 in shell:
  `.github/scripts/mcp-listen-smoke.test.sh:19`, `start-server-and-wait.sh:107`, `start-server-and-wait.test.sh:28`,
  `version-smoke.test.sh:14`, `deploy/restore-archive-itest.sh:45`, `deploy/restore-archive.sh:61`, `deploy/restore.sh:102`,
  `install.sh:63`, `:76`), 5 `docker-name` (`docker.yml:78`, `:101`, `:102`, `:105`, and `src_vs_code/src/test/commandParse.test.ts:40`
  — a quoted image name inside a parser fixture, no container is built: a false positive the exemption grammar covers),
  2 `docker-run` (`docker.yml:78`, `:105`), 2 `legacy-name` (`sshAgentServer.test.ts:71`, `:652`). **What the `node`
  profile does NOT reach** (G:174-209: tracked `*.test.*`/`*.spec.*` files anywhere, every text file under the ROOT
  folders `scripts/`, `test/`, `tests/`, workflows, `.github/scripts/*.{mjs,js,sh}`, every `*.sh`/`*.ps1`):
  `src_vs_code/scripts/*.cjs` (the harnesses), `src_minimalapi_server/scripts/backup-archive-itest.cjs`,
  `src_vs_code/src/test/vpnWorld.ts` and `sshAgentWorld.ts` (helpers, not `*.test.ts`), every `.cs` file, and —
  measured: zero `TMPDIR` findings — the `${TMPDIR:-/tmp}` spelling of `mcp-listen-smoke.sh:35` and `version-smoke.sh:30`
  (N6 of the October notes still stands). The C# guard copy with this repository's discovery closes every gap but the
  last; the last is closed by migrating those two scripts (S4), not by a detector.
- **The mount is not fetched where the wrapper will run.** Only `ci-server.yml:96` (the `http · contract suite` job)
  and `docs.yml:36` fetch `.claude/rules/shared`; `ci-extension.yml` (the whole extension job), `ci-server.yml`'s
  `build · test` job (`:43-81`, which runs `backup-archive-itest.cjs` at `:81`) and `ci-clients.yml` (three OSes) do not.
  `scripts/run-tests.mjs:1-10` says so in its own words: "This file needs no mount, so CI runs it." The wrapper changes
  that (S2, S3: one `git submodule update --init --depth 1 .claude/rules/shared` step per job).
- **The guard needs `yaml@2`** to read workflows (G:134-172): it looks in its own `node_modules` first, then the scanned
  repository's root — this repository has no root `package.json`. `docs.yml` therefore runs
  `npm ci --ignore-scripts --prefix .claude/rules/shared` before the guard (the rule entry's own step 3).
- `AllowUnsafeBlocks` is set in `CredsCli.Tests.csproj:9`, `CredsMcp.Tests.csproj:9` and
  `CredsForDevs.ServiceDefaults.Tests.csproj:9` (for `Support/Posix.cs`'s `[LibraryImport]`) and NOT in
  `BrokerClient.Tests.csproj` or `CredVaultServer.Tests.csproj`; E3's `Native.cs` is `[LibraryImport]` too (`Native.cs:445-462`
  of the template), so the two gain the property (S3).
- **CI OS legs.** `clients · build · test (${{ matrix.os }})` runs the four client test projects on `ubuntu-latest`,
  `macos-latest` and `windows-latest` (`ci-clients.yml:49-54`, `:102-108`); both the ubuntu and the **macOS** legs are
  REQUIRED checks (`.github/branch-protection.json:22-23`). The server project runs on ubuntu only (`ci-server.yml:43`, `:68`).
  The extension suite runs on ubuntu only (`ci-extension.yml:28`). So the Darwin path of E3's helper runs here on a required
  leg from the first green run, and the extension's socket-path check on macOS stays a by-hand record (S2 sc. 11).
- Node in CI is `22.x` (`ci-extension.yml:40`, `ci-server.yml:111`); `src_vs_code/tsconfig.json:3-4` is `module: Node16`,
  `rootDir: src`; `@types/node ^20.11.0` (`package.json:81`). A CommonJS module loads the mounted ESM reference with
  `require()` on Node ≥ 22.12 (`require(esm)`, unflagged there) or with `await import()` on any Node — S2 sc. 0 measures which
  the installed `22.x` gives before the first edit.

**CI and the container smoke** — all verified at the lines the parent names.

- `.github/workflows/docker.yml:30` `runs-on: ubuntu-latest`; there is no self-hosted runner in any workflow. The job
  runs only on `workflow_run` of a push to `main` or on `workflow_dispatch` (`:15-18`, `:38-42`) — **a pull request
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
  `docs.yml` job (`:25-78`) that fetches the submodule (`:36`) and runs `pin-check.mjs` (`:66`). ~~The day E1 is
  released, every pull request here is red until the pin moves (S1). The pin today is `e29883f`.~~ The pin moved to
  `115bbf8` (#287) and then to `105d53c` (#289, `47724fd`); `pin-check` is green on `main`.

**`deploy/acme-test/`** — run by hand only (no workflow or script calls it; `deploy/README.md:252`), not shellchecked
by `ci-server.yml:257-262`.

- `run.sh:22` drives the fixed compose project `cred-vault-acme-test` (`docker-compose.acme-test.yml:19`): four
  containers (`pebble`, `vault`, `nginx`, `certbot`) and one network (`edge`, `:104-106`), host ports 18081/18444
  (`:24-25`, `:103`). `trap cleanup EXIT` (`:49-50`) runs `compose down -v`, and `cleanup` is also called at the START
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
no `pretest`; ESLint over `src` with complexity 4, 50 lines per function, no `console`, `ci-extension.yml:45-54`).

- **46 sites in 30 files** (re-counted 2026-11-01: still 46 in 30, but eight files entered the set — `arrivalPin`,
  `brokerAbandoned`, `configSnippet` (2), `dependencyChain` (2), `keyInstaller` (2), `hygieneScan`, `sshUseActions`,
  `sshAgentWorld.ts` — and `sshAgentManager.test.ts` left it), all `fs.mkdtempSync(path.join(os.tmpdir(), …))` or
  `os.tmpdir()`. October's audit: 21 safe (try/finally, a top-level `after()`, or a `process.on('exit')`), **2 fragile**
  (~~`sshAgentServer.test.ts:59` — the test at `:277` disposes after an assertion at `:280`~~ now `:71`/`:118` and
  `:652`/`:691`; `sshExecRunner.test.ts:79` — `rmSync` as the last statement at `:130`), **20 leak** in 12 files, 3 create
  nothing (`materializedKeys.test.ts:54`, `:93`, `pinClickPaths.test.ts:357`). The leak/fragile split of the eight new
  files is not audited here: **S2 sc. 10's RED count is the measurement**, and the guard's 44 `raw-temp` findings are the
  site list.
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
  them green (R:135).
- **Sockets inside the folders** (POSIX): `brokerListeners.test.ts` and `brokerOriginDoor.test.ts:187`
  (`broker-<pid>.sock`), `sshAgentServer.test.ts:71`, `:652` (`agent.sock`); `requestLife.test.ts:33` binds
  `creds-life-<pid>-<n>.sock` directly in the temp root. macOS allows 104 bytes; the owner-form leaf
  (`testsToDelete-u501-creds-sock-abc123`, 36 characters, against 17 today) under macOS's ~49-character `TMPDIR` plus a
  17-character socket name is at the limit. The extension suite runs on Ubuntu only in CI (`ci-extension.yml:28`), so
  macOS is a by-hand check — and a required one (S2 sc. 11): the folders move under the short socket root (D4), as the
  C# socket tests do.
- No `git init` in a unit-test folder (the three `.git` are empty directories: `gitTransport.test.ts:78`, `:149`,
  `gitTransportSerial.test.ts:50`). One folder is made at import time: `pinClickPaths.test.ts:15`.

**Harnesses** (`src_vs_code/scripts/*.cjs`, `src_minimalapi_server/scripts/backup-archive-itest.cjs`). Six run in CI
(`ci-extension.yml:82`, `:89`, `:106`, `:118`, `:150`, `:156`; `ci-server.yml:81`), three by hand
(`creds-mcp-wsl`, `wsl-agent-relay`, `server-transport`), plus `tree-perf-bench.cjs` (no alias).

- **17 temp folders** (15 in October plus the two `sshd` folders): 4 safe (`creds-mcp-itest.cjs:452`, `:600`, `:716`;
  `masked-run-itest.cjs:79` makes nothing); **5 fragile** — `agent-broker-itest.cjs:78` (removed at `:343` before
  `process.exit`, the `.catch` at `:346-349` skips it), `git-transport-itest.cjs:48` (a bare repository and three clones;
  `:127`, `.catch` `:130-133`), `ssh-agent-itest.cjs:76` (`:247`; `process.exit(1)` at `:89` and `.catch` `:757-759` skip
  it), `:483` (`:574`) and `:595` (`:625`, both last-statement removals); **8 leak** — `creds-cli-itest.cjs:89` (made before
  the SKIP return at `:109-113`), `creds-mcp-itest.cjs:301`, `:743` (only its `title-home` child is removed, `:1027`),
  `:935`, `:1286`, and `backup-archive-itest.cjs:39` (`tempDir()`, called at `:109`, `:112`, `:187`: three per run, holding a
  random key and a sealed archive).
- **The stub files** — the fake `vscode` module each harness writes into the shared temp root and resolves through
  `Module._resolveFilename`: **seven fixed names, never removed** — `agent-broker-itest.cjs:21`,
  `creds-cli-itest.cjs:25`, `creds-mcp-itest.cjs:44`, `creds-mcp-wsl-itest.cjs:39`, `git-transport-itest.cjs:23`,
  `server-transport-itest.cjs:22`, `tree-perf-bench.cjs:25` (the parent's "7 … `*-itest.cjs`" counts the bench as an
  itest); one per-pid stub removed on success only (`masked-run-itest.cjs:19`, `:149`); one already inside its run's
  folder (`ssh-agent-itest.cjs:279`). Two runs of one harness at once (two checkouts, two sessions) truncate and
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
| `.github/scripts/mcp-listen-smoke.sh:35-36` `<root>/creds-mcp-listen-smoke-$$` | `ci-clients.yml:97`, `:120`; `release.yml:624` | never | leaks off CI; unseen by the shipped guard (measured) |
| `.github/scripts/version-smoke.sh:30`, `:64` `<root>/creds-version-smoke-$$` | `ci-clients.yml:118-119`; `release.yml:403`, `:631` | never | leaks off CI; unseen by the shipped guard (measured) |
| `deploy/restore-archive-itest.sh:45` `WORLD="$(mktemp -d)"` | `ci-server.yml:271` | none — `world()` runs nine times (`:138` … `:239`) | **leaks 9 per run** |

Product scripts, out of scope and exempted inline by S5 (an operator runs them; their temp folders are not test
leftovers): `install.sh:63`, `:76`; `deploy/restore.sh:102` (removed on the success path only — a product note, not
this epic's); `deploy/restore-archive.sh:61`; `src_vs_code/src/installCommand.ts:72`, `:100` (text a user runs).
`RUNNER_TEMP` (`ci-server.yml:148`, the two smoke scripts' first choice) is emptied by the runner at the start and
end of every job and is not a temp root this rule governs (R:258).

**The five xUnit projects** (xUnit v3 on Microsoft Testing Platform, `OutputType Exe`, `IsTestProject` at line 6 of
each `.csproj`; one root `xunit.runner.json` linked by `Directory.Build.props:18-20`; `TreatWarningsAsErrors`
`Directory.Build.props:8`). `CredVaultServer.Tests` runs in `ci-server.yml:68` (ubuntu); the other four in
`ci-clients.yml:102-108` on ubuntu, macOS and Windows. Shared test helpers already live in
`src_service_defaults/tests/Support/` and are LINKED, not copied (`CredsCli.Tests.csproj:30-36`,
`CredsMcp.Tests.csproj:31-39`, `BrokerClient.Tests.csproj:29`, `CredVaultServer.Tests.csproj:33`).

- **54 sites in the five projects** (re-counted 2026-11-01: 37 raw temp-API calls in 26 files + 14 `HostProcess.TempDirectory`
  callers + 3 hard-coded `/tmp` sockets = 54, unchanged): 33 safe, **3 fragile**, **11 leak**, 7 create nothing; 13 files
  hold a leak or a fragile site. No assembly fixture, collection fixture, `IAsyncLifetime` or `Testcontainers` anywhere;
  the one collection is `ServerCollection` (`src_minimalapi_server/tests/ServerCollection.cs:9`, `DisableParallelization`,
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
  SonarCloud S5443 (`wslRun.cjs:14-16`). E2 adds no deletion inside WSL; the guards do not see these paths (no temp
  API) and need no exemption.
- `RUNNER_TEMP` paths in workflows (above) and the job workspace's `./refused-logs` (`docker.yml:113`).
- `deploy/restore.sh:102`'s success-only removal and `deploy/restore-archive.sh`'s uid-10001 scratch (product
  defects; reported to the owner in the producer PR, not fixed here).
- **What the PRODUCT owns is never touched**: the vault's data directories, `deploy/certbot-data/`, the operator
  scripts' scratch (above), the in-process host's `logs/`, the WSL cache. Nothing here adds a sweep over a product
  path, and no product name carries the prefix.

## Decisions

**D1 — Three helpers, one per language (rule §2, R:69-72); only ONE of them is written here.**

| Language | Helper | How it comes to be | Reached by |
|---|---|---|---|
| Node | `src_vs_code/scripts/lib/leftovers.cjs` + `leftovers.d.cts` — a **wrapper** | loads the MOUNTED `tools/lib/owned.mjs` and `tools/lib/leftovers-sweep.mjs` (resolved from the repository root: `.claude/rules/shared/tools/lib/`), binds the token once with `ownedFor({ token: REPO_TOKEN, row: REPO_ROW })` (O:750-762) and re-exports `ownedDir`, `ownedName`, `ownedPattern`, `cleanupScope`, `tempRoot`, `removeQuietly`, `readOwner`, `ownerState`, `thisOwner`, `thisOwnerToken`, `formatOwner`, `runRecord`, `sweepLeftovers`; adds three things of this repository's own — `shortSocketRoot()`, `ownedFile(scope, what, name)`, `writeStub(scope, what, text)` — and nothing else. `REPO_TOKEN = 'creds'` and `REPO_ROW = 'the developer-credentials server and extension'` are written in this file ONCE (the guard's `TOKEN_CONSTANT` shape, G:745: `REPO_TOKEN = "…"`). Decision 11: nothing of the reference is copied; a defect in it is fixed in `dew_flow_conventions` and taken by a pin bump | unit tests (`import … from '../../scripts/lib/leftovers.cjs'` — the same relative path from `src/test/` and `out/test/`), the harnesses (`require('./lib/leftovers.cjs')`), `run-tests.mjs`, `run-itests.mjs`, `backup-archive-itest.cjs` (`require('../../src_vs_code/scripts/lib/leftovers.cjs')`) |
| C# | E3's helper, **copied by file** into `src_service_defaults/tests/Support/Leftovers/`, namespace `CredsForDevs.Tests.Leftovers` | every file of `dew_flow_mcp · tests/Mcp.Tests/Leftovers/` at `197cc76` that is not a test (`Owned`, `OwnedDir`, `OwnedScope`, `OwnedToken`, `Owner`, `OwnerToken`, `OwnerVectors`, `OwnerFixtures`, `Liveness`, `Scope`, `Native`, `NativeDarwin`, `DarwinLayout`, `DarwinFifoChild`, `PosixFifo`, `Errno`, `Removal`, `Unremovable`, `UnmatchablePid`, `WindowsOwnership`, `LeftoversSweep`, `LeftoversSweepFixture`, `LeftoversAudit`, `LeftoversAuditException`, `LeftoversSelfTest`, `LeftoversGuard*`) byte-identical save the namespace line, **except** `OwnedToken.cs` (rewritten: `RepoToken = "creds"`, `RepoRow = "the developer-credentials server and extension"` — the `creds` row of the detail's `## Tokens` table, R:317), `LeftoversGuardFiles.cs` and the two path constants of `LeftoversGuard.cs` (this repository's discovery, D7); every test file of that folder copied too, into `src_service_defaults/tests/Leftovers/`, token and namespace renamed. The things this repository needs beyond E3 live in files of their own (`OwnedCreds.cs`: `ShortSocketRoot`; `LeftoversSocketRootSweepFixture.cs`: the second root's sweep and audit) — a copied file is never edited, so the next byte-compare against E3 is one `diff` | compiled in place by `CredsForDevs.ServiceDefaults.Tests`; linked by the other four with ONE wildcard `<Compile Include="..\..\src_service_defaults\tests\Support\Leftovers\*.cs" Link="Support\Leftovers\%(Filename)%(Extension)" />` each (the existing `Support/` precedent). The guard's repository scan (`LeftoversRepositoryGuardTests`) and the guard's own tests compile in `ServiceDefaults.Tests` only — one scan per run of the family, on three OSes |
| bash | `.github/scripts/lib/owned.sh`, sourced | written here — the contract wants a bash helper where tests are bash (R:69); the janitor is never sourced (its contract, § *Running it*). It holds the token once as `REPO_TOKEN="creds"` (the same constant shape, so the guard counts it). Its order is the contract's — claim, register, create — and it uses no `mktemp` (S4; plan-gate round 2). Its owner token: `u$(id -u)` on Linux and macOS; on Git for Windows' bash the `w<digits>` form is a SHA-256 of the normalised account name (R:28-34) whose rules the vectors pin — `owned.sh` asks the mounted reference ONCE per script (`node --input-type=module -e 'import { thisOwner, formatOwner } …'` against `.claude/rules/shared/tools/lib/owned.mjs`), which rule §3 allows ("ONE child per script or run to learn a constant of the host"); no `node` on PATH there → the script refuses with one line (fail closed). On Linux and macOS no child is needed | the four CI/test shell scripts, `deploy/restore-archive-itest.sh`, `deploy/acme-test/run.sh` |

*Rejected:* a CommonJS port of the reference (October's D1) — decision 11. *Rejected:* a bash port of the owner-token hash
(three lines of `janitor.sh:142-155`) — the vectors file is the proof of that hash and a copy drifts from it. *Rejected:*
vendoring `owned.mjs` + an `owned-token.mjs` beside it (the shape the reference's `owned-token.mjs` header offers): the
mount is already in every clone and the pin is the version.

**D2 — Names (rule §1, R:23-68).** `testsToDelete-<owner>-creds-<what>-<id>`; `<owner>` from the helper (`thisOwnerToken()`
in Node, `OwnerToken.This` in C#, `u$(id -u)` / the reference in bash); `<what>` is the old prefix without its
`creds-`/`cred-vault-`/`cvbk-` lead and trailing `-` (`creds-sock-` → `sock`, `cred-vault-backup-store` →
`backup-store`, `cvbk-download-` → `download`); the whole name ≤ 63 characters, so `<what>` ≤ 63 − 14 − 11 − 6 − 1 − 6 = 25
characters with the longest owner token (`w` + 10 digits) — the helper refuses a longer one. A folder that will hold a
Unix socket keeps `<what>` ≤ 5 characters. `<id>`: 6 of `[A-Za-z0-9]` (the reference's `randomId`; E3's `IdAlphabet`) or, in bash,
8 hex characters from `/dev/urandom` (rule §1 accepts 6 to 12). Docker names use the same id rule; compose project names must be lowercase, so the acme
project is `teststodelete-<owner>-creds-acme-<id>` (rule §1's second spelling). Per-pid FILES in the temp root
(`hostKeyPin.test.ts:74`, `sshExecRunner.test.ts:79`, `requestLife.test.ts:33`, the stubs) move INSIDE an owned
folder — one kind (folder) instead of two. The six legacy-name sites of the facts take the owner form like every
other site.

**D3 — The owner record, and where it lives (rule §3, R:100-167).** `<owner>:<host>@<os>:<pid>[:<start>[:<ns>]]`:
`<host>` the DNS host name (Node `os.hostname()`; C# `Dns.GetHostName()`, never `Environment.MachineName`; bash
`hostname`), each run of `@`, `:` or whitespace written as one `-`, under WSL `~<distro>` appended, compared
case-insensitively by every reader. Start and namespace: Node writes them on Linux only (`/proc`, no spawn; O:291-320),
C# the same (E3's `Owner.This`), bash never. **bash on Windows writes the WINDOWS pid** — `/proc/$$/winpid` (a `read`
builtin, no spawn) — because the Node sweep, the C# sweep and the janitor all judge Windows pids; an MSYS `$$` there
reads as a dead or a stranger's process (R:116-118). Folders: the sibling `<folder>.owner` — never inside (R:135; the
listing assertions of the facts). Containers and volumes: `--label testsToDelete.owner=<record>` (R:138). Compose: the
same label on every service and on the network. **The run exports its record once** as `TESTSTODELETE_RUN=<record>`
(R:120-121): `run-tests.mjs` and `run-itests.mjs` export their own `formatOwner(thisOwner())` into the child's
environment, so every test-file process and every harness child claims with the RUN's record, and the end-of-run audit
can ask for exactly that record. **The two keys** (R:143-150): the name's owner segment SELECTS; the kernel owner
AUTHORISES — in Node `isMine` (O:215: the real uid on POSIX; on Windows the profile path only, F16 open), in C#
`Scope.IsMine` (the uid on POSIX; on Windows the profile path AND the owner SID, owner decision 2 of R6 — elevated runs'
files, owned by `BUILTIN\Administrators`, fail closed and are kept). The difference between the two helpers on one
Windows machine is recorded, not resolved here: the Node side is as strict as the reference, no stricter.

**D4 — Who sweeps what at start (rule §4, R:168-206).** The token is `creds` for every language, so every sweep
collects every creds folder by the same rule — age ≥ 10 min selects, the two keys authorise, `live`/`unknown` preserve,
unmarked owner-form folders are listed and never collected (R:182), legacy names are listed with the command a person
would run (R:196-199), a vanished target is someone else's success, never an error, and nothing ever fails the run:

- `npm test` → `scripts/run-tests.mjs` (before `node --test`), in the shape of `tools/run-tests.mjs:109-116`
  (`runWithSweep`: one report line only when the sweep found something, a thrown sweep is one line, the exit code is the
  suite's); `npm run itest:all` → `scripts/run-itests.mjs` (before the first harness). A single `itest:*` alias does not
  sweep: the next `npm test`, `itest:all` or xUnit run does.
- every xUnit executable → `LeftoversSweepFixture` (E3's assembly fixture, `[assembly: AssemblyFixture]`), linked into
  all five.
- **Two roots on POSIX.** Unix sockets live under the short socket root (`/tmp` on Linux and macOS, the temp root on
  Windows — Node `shortSocketRoot()` in the wrapper, C# `OwnedCreds.ShortSocketRoot`; macOS's `TMPDIR` is too long for a
  103-byte socket path once the owner segment is in the name). Every sweep and every end-of-run audit reads BOTH roots
  when they differ: Node calls `sweepLeftovers({ repo, tmp })` once per root (S:588 takes `tmp`); C# runs a second
  assembly fixture, `LeftoversSocketRootSweepFixture`, which calls the copied `LeftoversSweep.Run` and
  `LeftoversSweepFixture.RealAudit` with `ShortSocketRoot` — so a killed run's socket folder is collected like any other,
  and E3's fixture file is not edited.
- **The end-of-run audit** (rule §2's "removed by that run"; E3's `LeftoversAudit`). Node: after `node --test` returns,
  `run-tests.mjs` reads both roots and lists every owner-form folder and orphan claim whose record is EXACTLY this
  runner's own (`formatOwner(thisOwner())` — the record it exported as `TESTSTODELETE_RUN`) and whose folder and claim
  pass `isMine`; each is removed with `removeQuietly` (exact name, five tries, one warning on giving up) and the suite's
  verdict becomes 1 with `run-tests: this run left <n> folder(s) it claimed — a test made scratch outside a scope: <paths>`
  when the suite itself passed. A folder claimed by any other record — a concurrent `npm test` (another pid, another
  start), a harness, a C# run — is never touched and never counted. A dead test-file process cannot be a live sibling:
  the audit runs in the parent after the whole child tree ended. (The run-marker folder of October's sc. 8/8a is gone:
  the record IS the marker.) `run-itests.mjs` gains the sweep only (no audit: a harness's children may still be ending).
  C#: E3's audit as copied — `Owner.This`, never the run's record (review fix A), removal through `RemoveCaptured` by
  identity (fix B), the three exception kinds (fix H), the `CREDS_LEFTOVERS_SELFTEST` teeth of S3.
- containers/volumes/compose: there is no creds-wide container sweep. CI: the hosted runner's VM is the collector
  (`docker.yml:30`), and the always-run remover covers every path but a killed runner — **deviation, recorded:** no
  start-of-job container sweep in `docker.yml`; the day the workflow moves to a non-ephemeral runner, that step is
  added in the same change. acme: see D6 (the janitor's `--token creds` mode).

**Where the collection guarantee holds.** "A killed run's leftovers are collected by the next run" holds for the
three runners that sweep: `npm test`, `npm run itest:all` and the five xUnit executables. A direct `node --test
out/test/<file>.test.js` (or one `itest:*` alias, or `node scripts/<harness>.cjs`) still makes and removes its own
scratch through the helper on every unwinding path, but it does not sweep old leftovers — the next runner run, or
the janitor, does. The runners' headers and `module_tests.md` say so in one sentence each.

- The old names (`creds-*`, `cred-vault-*`, `cvbk-*`, `arrival-lease-*`, `wsl-mcp-check-*`, the stub file names,
  `tmp.*` from bare `mktemp`, and the six legacy `testsToDelete-agent-*`/`-ait-*`/`-sshd-*`) are NOT swept — `creds-`
  is not a registered token, other software uses such names, and a legacy name without a record is listed, never
  collected (R:59, R:196-199). S2/S3/S4 each LIST them before and after on the machine they ran on and report; removed only on
  the owner's word, by hand — the per-machine hand clean-up record of D8 (as E3 and E4 recorded theirs).

**D5 — The CI smoke under the carve-out (rule §5, R:207-225).** Both containers stay WITHOUT `--rm` — `cv`'s logs are
what a failed health wait prints (`:85`, `:88`), `cv-refused` is read after it exits (`:110-115`). One id per job;
names spelled with the literal prefix in every command (the guard compares the text), the owner segment from the
runner's uid: `testsToDelete-${OWNER}-creds-cv-${SMOKE_ID}`, `testsToDelete-${OWNER}-creds-refused-${SMOKE_ID}`,
`testsToDelete-${OWNER}-creds-refused-data-${SMOKE_ID}`, `testsToDelete-${OWNER}-creds-refused-logs-${SMOKE_ID}`
(≤ 53 characters with `u1001`). The owner segment is written as `${OWNER}` right after the prefix, never `"$OWNER"` with
a quote between prefix and segment: the shipped classifier reads `<prefix>-"$OWNER"-…` as **broad** and `<prefix>-${OWNER}-…`
as owner-aware (E3's S4 deviations, measured with `sweeper-scan.mjs`). The inline removals (`:92`, `:111`'s `docker rm
-f`, `:116-117`) go: ONE remover step, placed after "Smoke-test a refused start" (the last reader) and before "Log in",
`if: always()`, `continue-on-error: true`, each command `|| true`, and it ends by LISTING what is left (`docker ps -a
--filter label=testsToDelete.owner`, `docker volume ls --filter label=testsToDelete.owner`) — the in-job observation
the parent's proof asks for. It never decides the verdict: its own exit is always 0, and `Publish`'s implicit
`success()` reads the smoke steps' failure, not its.

**D6 — acme-test is a probe, so its containers are leftovers too** (rule §1's first sentence; the parent named only
`state/`). The compose project becomes `teststodelete-<owner>-creds-acme-<id>`; every service and the network carry the
owner label; `state/` moves out of the checkout into an owned temp folder `testsToDelete-<owner>-creds-acme-<id>` (same
id), removed at the end through a container (root and uid-10001 files, Facts) and then by `owned_remove`. The owner
record is exported and `trap cleanup EXIT` (plus `INT` and `TERM`) is registered at the VERY TOP of `run.sh`, right
after sourcing `owned.sh` — before the sweep, before any `docker compose` call and before `owned_dir` — and `cleanup`
tolerates what is not made yet (an unset `STATE`/`PROJECT` is skipped). The start-of-run sweep needs three-valued
liveness in bash, and **it delegates to the mounted janitor's per-token mode** (`tools/janitor.sh:49-52`, `:117`):
`JANITOR_MIN_AGE_MINUTES=10 bash .claude/rules/shared/tools/janitor.sh --token creds` — it sweeps only the caller's
`testsToDelete-<owner>-creds-…` (and the lowercase compose spelling) on this machine, folders and containers alike, with
the contract's 10 minutes; exit 0 and 3 both fine, any other code one reported line that never stops the run. **On
Windows the janitor removes nothing unless `JANITOR_WINDOWS_E2E_GREEN` is set** (its contract, § *Running it*): on the
owner's Windows machine the acme sweep is a dry run until F9's Windows run arms it — a recorded limit, not a defect of
this plan. Never a copy of the janitor's liveness code.

**D7 — Two guards, neither written here (rule §7, R:251-272).**

- **Node, scripts, workflows, shell:** the shipped `tools/leftovers-check.mjs --profile node --repo . --token creds
  --identity "the developer-credentials server and extension"`, run by `docs.yml` after `npm ci --ignore-scripts --prefix
  .claude/rules/shared` (the `yaml@2` it needs) — the job already fetches the submodule (`:36`) whose `## Tokens` table the
  token check reads (G:827-837: the detail first, then the core), and its check name is required. It reads every tracked
  `*.test.ts`, every `.sh`/`.ps1`, `.github/scripts/*.{mjs,js,sh}`, every workflow; it recognises the §5 carve-out
  (`docker.yml`); it finds the three token constants (`REPO_TOKEN = "creds"` in `leftovers.cjs` and `owned.sh`, `RepoToken =
  "creds"` in `OwnedToken.cs` — G:745 matches both spellings in `.cjs`, `.sh` and `.cs`) and requires them equal and
  registered.
- **C#, the harnesses, the test helpers:** E3's `LeftoversGuard` with THIS repository's `GuardFiles` — `src_*/tests/**/*.cs`
  → Tests, `src_*/src/**/*.cs` → Source, scripts under `.github/scripts/`, `src_vs_code/scripts/`, `src_vs_code/src/test/`
  (the `*.ts` helpers that are not `*.test.ts`), `src_minimalapi_server/scripts/`, `http/`, `deploy/`, workflows; helper
  folder `src_service_defaults/tests/Support/Leftovers/` plus the Node wrapper file as the second folding allowance
  (`FoldingAllowances`, pinned by a test) — run once per family run by `LeftoversRepositoryGuardTests` in
  `ServiceDefaults.Tests`, on three OSes; `owner-blind` in scripts through the mounted classifier via `node`
  (`GuardScripts.ClassifierPath` is mount-relative and stays). The §5 carve-out is NOT recognised by E3's guard ("a
  container that needs the carve-out re-opens this guard", `LeftoversGuard.cs` header): `docker.yml` is judged by the
  shipped Node guard, so the C# copy excludes `.github/workflows/docker.yml` from its docker classes by name — ONE
  pinned entry, with the Node guard's green as the proof that the exclusion hides nothing.
- Why two and not one: decision 11 forbids porting the Node guard, E3's guard is the family's one C# guard, and the
  `node` profile's discovery does not reach this repository's harnesses or `.cs` files (measured, Facts). Overlap is
  harmless (the same finding twice); a gap is not.
- **Exemptions** — inline only, the grammar of R:268-272 (≥ 10 characters, ≥ 3 words, no placeholder; `owner-blind`
  and `ryuk-off` never exemptible). The expected ones: the three helpers' one temp line each and the wrapper's
  `shortSocketRoot()` literal (`raw-temp`); `install.sh:63`, `:76`, `deploy/restore.sh:102`, `deploy/restore-archive.sh:61`
  (product); `commandParse.test.ts:40` (`docker-name — a quoted image name in a parser fixture; no container is built`);
  the `docker compose` calls of `restore-archive-itest.sh` (docker is a shim there, `:68-124`); any `RUNNER_TEMP` line S4
  kept (no finding by R:258, so none needed). `src_vs_code/src/installCommand.ts` is not discovered (product source).

**D8 — The two stages, and the merge conditions of the producer stage** (rule § *The barrier*, R:287-303; R6 of the
remainder plan).

- **Stage A (sweep-only) is EMPTY** — measured twice (`0fa2ee3` by R6 on 2026-10-31; `47724fd` here on 2026-11-01: none
  found, 1495 files read). The exact-name removals of the facts (`sshAgentWorld.ts:426-429`, `ssh-agent-itest.cjs:247`,
  `:574`, `:625`, the `rmSync` of every safe site) remove what their own process made by its full path; none matches a
  prefix. S0 records this and nothing else.
- **Stage B (producer) is FIVE pull requests, one per epic of § *Epics*** (the gate's operator commands, round 2;
  this replaces wave 1's one-PR shape and settles the October question "one or two"). Each epic has its own branch, cut
  from the previous epic's merge commit (stacked: `feat/leftovers-e2-1-node-unit` from `main`, `…-2-node-harness` from
  E2.1's merge, and so on), one `mcp__coai__review_plan` round on its own section of this document and one
  `mcp__coai__review_code` round, an Opus review, and green legs on every OS it touches; each merges a COMPLETE resource
  lifecycle for its scope (name, claim, removal, sweep, proofs), so no merged state has a producer without its sweep.
  The whole-repository guards switch on LAST (E2.5); after each earlier epic the shipped Node guard is RUN and its
  remaining findings are recorded on that epic's PR as migration evidence — never turned into exemptions. The pin bump
  (S1) is already merged, by itself. The question consultant is asked once per three epics, before each group is built:
  `9d8564bb` (2026-11-01) covered E2.1–E2.3; a second consult precedes E2.4.
- **The merge conditions**, as E3's (a)–(d): (a) the pin at `105d53c` — done; (b) R6 records every consumer's sweep-only
  stage as landed or empty — done 2026-10-31 (this family's seven and the private sibling's ten; the barrier opened);
  (c) the per-machine *Barrier checklist* of `dew_flow_conventions · research/PLAN_test_leftovers_merged_core.md` is
  recorded for every machine that runs these tests — the operator's WSL machine is recorded open (R6, 2026-10-31); **the
  owner's Windows machine (Git Bash, the acme probe, the by-hand Windows runs of S2 sc. 10 and S3 sc. 4) is not tested**
  and must be before the FIRST producer merge, E2.1's; (d) the one-time hand clean-up of D4's old names is recorded per machine in
  the PR of the epic whose names they are — each path removed, or kept with a reason. The stories may be written, gated, built and reviewed before that;
  the merge waits. If the released text differs from what is cited here, stop and report — never resolve the difference
  in code.

**D9 — Must not copy back in.** The defects wave 1 found in the ports, and the mcp Darwin follow-ups, each with where
this repository is protected and what a reviewer checks:

| # | The defect (where found) | Protected by | The reviewer checks |
|---|---|---|---|
| 1 | an end-of-run audit that matches folders by the shared `TESTSTODELETE_RUN` record deletes LIVE siblings' folders — the first child to finish deleted the others' (E3 review fix A) | C#: the copied fixture passes `Owner.This`, never the run's record; Node: the audit runs in the PARENT after `node --test` returned, compares the parent's OWN record, and `run-itests.mjs` has no audit | S2 sc. 8: an audit with a `live` sibling's record removes nothing of it; S3 sc. 5: `RealAudit` is called with `Owner.This` |
| 2 | a guard that reads only whole literals is fooled by split, escaped or concatenated spellings (E3 fix C; E4 item 26) | the copied `LeftoversGuardLiterals.cs` (the folded reading); the shipped Node guard reads the same way | S5 sc. 2: a planted `"testsTo" + "Delete-"` in a `.cs`, a `.cjs` and a `.sh` is a finding each |
| 3 | a rename that is not exclusive (Rust `std::fs::rename` on Windows and POSIX `rename(2)`) replaces an empty directory at the quarantine name (F17; E4 items 9, 27) | the copied `Native.RenameExclusively` (`renameat2` on Linux, `renamex_np` with `RENAME_EXCL` on Darwin — no reserve-then-rename fallback there, `MoveFileExW` with no flags on Windows); Node: F17 fixed in the reference at `556550c`, taken by the pin | S3: the copied `NativeTests`/`DarwinNativeTests` pass on all three legs; nothing here calls `Directory.Move` or `fs.renameSync` on an owned path |
| 4 | a quarantine suffix that is not hex breaks every reader's pattern (E4 item 25) | the copy; the reference | S3 sc. 1: the quarantine name test of the copied `LeftoversSweepTests` |
| 5 | a FIFO swapped in at a claim path blocks the read (F20) | the copied verified read (`O_NONBLOCK | O_NOFOLLOW`, `fstat` identity); Node: F20 fixed at `733c781` | S3: the copied FIFO tests, the Darwin one in a CHILD process with a 90 s bound |
| 6 | the hosted Windows runner is elevated: a new file's owner is `BUILTIN\Administrators` or the user depending on how it is created (E3 S2; E4 item 10) | the copied `RunnerFactsTests` records it in the job log; both outcomes are asserted through the two `WindowsOwnership` fixtures, never from the runner's own files; elevated runs' files fail closed and are kept | S3: `RunnerFactsTests` output on the Windows leg in the PR |
| 7 | the quarantine pass asked the probe about any pid text (F18) | `isAskablePid` in the reference (`d7a2ec9`); the copy's askable range | S3 sc. 1 (copied) |
| 8 | the orphan-claim pass deleted the claim of a folder sitting in a live sweep's quarantine (F19) | the reference (`bf3bd4a`); the copy's `quarantine-conflict` | S3 sc. 1 (copied) |
| 9 | Darwin follow-up 2: the layout self-test did not guard the destructive paths | the copy calls `DarwinLayout.Require` at the top of the real sweep, the real audit, `OwnedDir.Create` and `Removal.Quietly`; the second-root fixture of D4 calls the SAME guarded entry points | S3: `LayoutGateTests` pass on Linux; the macOS leg runs `DarwinLayoutTests` first |
| 10 | Darwin follow-up 3: a Darwin-sensitive test built its scope with `new()` | every test of this repository that is Darwin-sensitive uses `DarwinLayout.FreshOwnedScope()` | S3: a grep in the PR |
| 11 | Darwin follow-up 4: the FIFO child could pass for the wrong reason (it asserted only a null read) | the copy's child `lstat`s the claim and asserts it is a FIFO before the read | S3 (copied) |
| 12 | Darwin follow-up 5: `Errno.Current` guessed Linux on any system that is not macOS | the copy's `Errno.For(isLinux, isMacOS)`, which throws elsewhere | S3 (copied `ErrnoTests`) |
| 13 | Darwin follow-ups 1 and 6: a budget written as a Linux constant failed on macOS (`MAXSYMLINKS` 32 vs 40), twice | not a leftovers defect; the lesson: a test with a kernel limit as a literal is checked on every leg — this repository's socket-path length is asserted on Linux AND macOS (S2 sc. 11, S3 sc. 2) | the macOS leg is required |
| 14 | `owner-blind` in `.cs` with a binding tracer lets a constant carry the prefix to a sweep (owner decision 3) | the copy's literal rule; `Owned.Prefix` referenced outside the helper's folder is a finding | S5 sc. 2 |
| 15 | the Windows caller SID read once per process (E4 item 28) — the first thread decided for all | a reviewer checks the copied `Native.OwnerSidOf` path reads per call | S3 review |
| 16 | a janitor test run in the REAL temp root raced the other tests and exited 1 in 3 runs of 6 (E3 S4) | the copied `LeftoversJanitorTests` plants in a PRIVATE root handed as `TMPDIR` | S3 (copied) |
| 17 | a sweep over the old names "to help" — the one-time clean-up is the owner's (E3, E4: 682 `mcp-*` folders, the `bge-*` folders, retained for the owner) | D4: nothing sweeps `creds-*`, `cred-vault-*`, `cvbk-*` or the legacy `testsToDelete-agent-*`; the hand clean-up record of D8 | S2/S3/S4 list before and after |
| 18 | an adapter that takes an `OwnedDir`'s PATH and removes it by path leaves the registry entry behind: `Create` registers (`OwnedDir.cs:55`), only `Dispose()` unregisters (`:71`) — the audit then fails on folders that are gone (found by the question consultant on this plan's October S3, verified 2026-11-01) | S3: `HostProcess` keeps the `OwnedDir` and disposes it; every other site holds the `OwnedDir`/`OwnedScope` itself | S3 sc. 2: a `HostProcess.TempDirectory`+`Remove` pair leaves `OwnedDir.Unreclaimed()` empty (RED with the path-only adapter) |

**Growth surface.** After E2 a full local run makes ≈ 60 Node unit-test folders (S2 RED fixes the exact number) plus
the safe ones it already made, ≈ 25 harness folders, the C# folders of S3, nine shell worlds; each a few KB except
`git-transport-itest`'s repository (< 1 MB) and `backup-archive-itest`'s three (a few MB). Every one is removed by its
test on every unwinding path; a killed run's are collected by the next start-of-run sweep after 10 minutes once their
owner is gone; a machine that stops running these tests is cleaned by the janitor (`bash
.claude/rules/shared/tools/janitor.sh`, one hour). A teardown that gives up leaves the folder prefixed and claimed
by a pid that dies with the run, so the next sweep collects it. A claim is one line of at most 512 bytes (R:121-123).
CI: nothing survives the hosted job. acme: one stack of four containers, one network, one state folder of < 1 MB, per run.
Quarantines (`.<name>.teststodelete-quarantine-<pid>-<hex>`) exist only between a sweep's rename and its removal; a
killed sweep's are restored or listed by the next (R:194).

## Order

The build order is the five epics of § *Epics* (the last section): E2.1 → E2.2 → E2.3 → E2.4 → E2.5, each on its own
branch cut from the previous epic's merge commit, each one pull request with one plan gate and one code gate (D8).
The sections S0–S5 below are the detailed briefs the stories point to: S2 feeds E2.1 and E2.2, S3 feeds E2.3, S4 feeds
E2.4, S5 feeds E2.5; S0 and S1 are records.

| Stage · brief | Model (brief · code · review) | Depends on | Lands in |
|---|---|---|---|
| A · S0 — the sweep-only stage: recorded empty | Opus (this section) · main session (a record, no code) · Opus | — | this document's D8 and the parent's R6; re-run on every epic's head |
| B · S1 — the pin on release `105d53c` | — | — | **done**: PR #289 (`47724fd`), merged alone 2026-11-01 |
| B · S2 — the Node wrapper, its runners' sweep and audit, and every Node site | Opus · Sonnet · Opus; the runner story is a cornerstone (Fable spec) | S1; S2 sc. 0 | E2.1 (unit tests), E2.2 (harnesses) |
| B · S3 — E3's C# helper copied with its Darwin path, linked into five projects, every C# site | Opus · Sonnet · Opus | S1; E3 merged (`4feb245`, `197cc76`); E2.2 merged | E2.3 |
| B · S4 — the CI smoke carve-out, acme-test, the bash helper and the shell scripts | Opus · Sonnet · Opus; the `owned.sh` story is a cornerstone (Fable spec) | S1; E2.3 merged; the second consult | E2.4 |
| B · S5 — the two guards' CI steps, the exemptions, the docs | Opus · Sonnet · Opus | E2.1–E2.4 merged | E2.5 |

Where this document and the released contract differ, the contract wins and the difference is reported to the parent,
never resolved in code.

### Boundary with E1/R7 and E3 (both sides — the shared planning rule § *A boundary between two plans*)

| Item | Built by | The other's part |
|---|---|---|
| The contract text, the `## Tokens` row `creds` (R:317), `tools/janitor.sh --token <t>`, F17–F20 | E1, R7 (released at `105d53c`) | E2 reads them through the mount; never edits them |
| The Node reference (`owned.mjs`, `leftovers-sweep.mjs`, `leftovers-check.mjs`, `sweeper-scan.mjs`, `run-tests.mjs`'s shape) | E1, R7 | E2 S2 WRAPS the first two, S5 RUNS the third under `--profile node`; a defect found here goes back as a follow-up (F-n), taken by the next pin |
| The `node` profile's discovery | the conventions repository | does not reach this repository's harnesses, `.cs` or helper files (Facts); E2 does not ask for a profile change — the C# guard copy covers the gap (N14) |
| The C# helper, the Darwin path, the C# guard (every file of `tests/Mcp.Tests/Leftovers/`) | E3 (`4feb245`, `197cc76`) | E2 S3 copies by file; `OwnedToken.cs`, `GuardFiles.cs` and two path constants are rewritten; additions in files of their own. A behaviour E2 needs that E3 lacks (`ShortSocketRoot`, the second-root sweep) is built beside the copy and sent to E3 as a note (N13, N18) |
| The container label and the `docker-name` carve-out in a C# guard | E3 names them as "a copy with containers adds"; this repository's containers are CI-only (`docker.yml`) and judged by the shipped Node guard | E2's C# guard copy does NOT grow a carve-out reader; it excludes `docker.yml` by name (D7) |
| The pin bump | E2 S1 | R7 released; done |

Disjoint otherwise: E2 changes nothing in `dew_flow_conventions` or `dew_flow_mcp`.

## S0 — The sweep-only stage, recorded empty

- **Models.** This section is the record; no code, no coder.
- **What.** The barrier scan over this repository found no owner-blind sweeper, twice (D8). Every removal in the tree
  is by the exact path of what the same process made.
- **Acceptance.** 1. The two scan lines (R6's at `0fa2ee3`; `sweeper-scan: none found (1495 file(s) read) — the barrier is
  open for this scope` at `47724fd`) are quoted in this document and in the producer PR's description. 2. The producer PR
  re-runs `node .claude/rules/shared/tools/sweeper-scan.mjs --root .` on its own head before the merge and quotes the
  line — a sweeper that appeared in the meantime is a stop. 3. No story of stage B adds a prefix match outside the
  helpers (S5's `owner-blind` class proves it).
- **DoD.** The three lines above in the PR; nothing else.

## S1 — The pin on release `105d53c` — done by PR #289

`dew_flow_creds_for_devs` PR #289 (`chore(rules): pin shared conventions to release 105d53c — the test-leftovers reference
hardened (F17–F20) and the rule split into a core and a detail companion`, `47724fd`, 2026-11-01) merged alone under owner
decision 1. `pin-check.mjs` is green; the mounted detail carries the `creds` row (R:317: `` | `creds` | dew_flow | the
developer-credentials server and extension | ``); `janitor.sh` has `--token <t>` (`:49-52`, `:117`). What the October S1
carried into S2 — the constants table comparing the helpers' constants with the released text — is now S2's, S3's and
S4's DoD each: `REPO_TOKEN`/`RepoToken` = `creds`; `REPO_ROW`/`RepoRow` = that row's `repository` column; the prefix,
the three spellings, the owner grammar `^[uw][0-9]{1,10}$`, id 6 (accept 6–12), 63 characters = rule §1; the record
grammar, 512 bytes, the 2-second tolerance = §3; 10 minutes = §4. Nothing of S1 is built here.

## S2 — The Node wrapper, its runners' sweep and audit, and every Node site

- **Models.** Brief by Opus (this section); code by a Sonnet coder; review by Opus against rule §1–§4, D1–D4, D9 and the
  mounted `owned.mjs` / `leftovers-sweep.mjs` / `run-tests.mjs`. The runner story (E2.1.S2) is a cornerstone: its spec is
  Fable's (§ *Epics*). This brief is built as E2.1 (the unit tests) and E2.2 (the harnesses).
- **Goal.** No unit test, harness or the server's harness leaves a folder or file in either root on any path; a
  killed run's are collected by the next `npm test` / `itest:all`; `npm test` fails when the suite itself left one;
  nothing of the reference is copied.
- **Files.** New `src_vs_code/scripts/lib/leftovers.cjs`, `leftovers.d.cts`; `scripts/run-tests.mjs`, `scripts/run-itests.mjs`;
  new tests `src/test/leftoversWrapper.test.ts`, `src/test/leftoversRunner.test.ts`; all 30 files with a temp site (the
  29 `*.test.ts` of the guard's list plus `vpnWorld.ts` and `sshAgentWorld.ts` — the ones that leak or are fragile AND the
  safe ones, because every `os.tmpdir()` outside the wrapper is a finding of S5's guards); the ten `scripts/*.cjs` harness
  files of the facts (the nine of October plus `ssh-agent-itest.cjs`'s two `sshd` sites); `src_minimalapi_server/scripts/backup-archive-itest.cjs`;
  `.github/workflows/ci-extension.yml` (one step after checkout: `git submodule update --init --depth 1 .claude/rules/shared`;
  the comment of `run-tests.mjs:1-10` — "needs no mount, so CI runs it" — is rewritten) and `ci-server.yml`'s `build · test`
  job (the same step before `:81`); `research/module_tests.md` (`:125-146`, the *Leaves behind if killed* table).

**Scenario 0 — before the first edit (RED-GREEN by measurement, not by test):** on the installed Node (`node --version`
in `ci-extension.yml`'s `22.x` and on the developer machine) a `.cjs` file does `require('<mount>/tools/lib/owned.mjs')`;
if it throws `ERR_REQUIRE_ESM`, the wrapper exposes an `async load()` that does `await import(pathToFileURL(…))` and every
caller awaits it once at the top (the harnesses already have an async `main()`; `run-tests.mjs` is ESM and imports
directly). The result (Node version, which form) is the first line of the PR.

**The change — the wrapper.** `leftovers.cjs`: resolve the mount root from this file (`path.resolve(__dirname,
'../../..', '.claude/rules/shared')`), refuse with one line naming `git submodule update --init .claude/rules/shared`
when `tools/lib/owned.mjs` is not there (fail closed: no helper, no test), load the two modules, `const owned =
ownedFor({ token: REPO_TOKEN, row: REPO_ROW })`, and export: `REPO_TOKEN`, `REPO_ROW`, `owned.*` (D1's list),
`sweepLeftovers`, `tempRoot`, plus `shortSocketRoot()` (`'/tmp'` on Linux and macOS under `// testsToDelete-exempt: raw-temp
— a Unix socket path must stay under 103 bytes on macOS, whose TMPDIR is too long`, `tempRoot()` on Windows — the same
root as S3's `OwnedCreds.ShortSocketRoot`), `ownedFile(scope, what, name)` = `path.join(owned.ownedDir(scope, what), name)`,
and `writeStub(scope, what, text)` (the fake `vscode` inside an owned folder; returns its path). The `.d.cts` declares
exactly the exports (sc. 9); the scope type is `{ after(fn: () => unknown): void }`, which node:test's `TestContext`
satisfies. No function of the reference is re-implemented; a behaviour the wrapper needs and the reference lacks is a
follow-up to `dew_flow_conventions`, not a local copy.

**The change — the runners.** `run-tests.mjs` gains, in this order: (1) the sweep of BOTH roots in the shape of
`tools/run-tests.mjs:109-116` — `sweepLeftovers({ repo: <this repository's root>, tmp: tempRoot() })`, then the same with
`tmp: shortSocketRoot()` when it differs; one report line each only when something was found; a thrown sweep is one
line; never the exit code; (2) `TESTSTODELETE_RUN = formatOwner(thisOwner())` in the child's environment (R:120-121),
so every test-file process claims with the runner's record; (3) after `node --test` returns, the **end-of-run audit** of
D4: every depth-1 owner-form entry of both roots whose claim parses to EXACTLY the runner's record (`readOwner` +
`formatOwner` equality, after `isMine`) and every such orphan claim is listed and removed with `removeQuietly`; a
non-empty list turns a passing suite's exit into 1 with the line of D4; a failing suite keeps its own code and the list
is printed; any other record is untouched and uncounted. `run-itests.mjs` gains (1) and (2) only. Each runner's header
carries the scope sentence of D4 (a direct `node --test <file>` removes its own scratch but does not sweep).

**The change — the sites.** The pattern, chosen per file:

- a test that makes its folder inline or through a helper it calls with nothing → the helper takes the test's
  context: `test('…', (t) => { const dir = tempDir(t); … })`, `tempDir = (t) => ownedDir(t, 'download')`;
- a file whose helpers are called from many tests or at import time (`pinClickPaths.test.ts:15`,
  `sshAgentWorld.ts:419-429`, `sshDefaultProbe.test.ts:26-34`, `wslMcpCheckHost.test.ts:52-57`) → one
  module-level `const scope = cleanupScope(); after(() => scope.close());` (node:test's top-level `after` runs at the
  end of the file whether tests passed or not) and the existing `process.on('exit')` / `made` lists go — the folder is
  made inside the first hook or test, never at module load (R:76-78);
- `vpnWorld.ts:249` → `startVpn` takes the scope and registers the folder before anything can throw, so
  `vpnGoneRequest.test.ts:417` and the 11 `until(...)` callers stop leaking; its 28 callers' own `rmSync` go;
- the try/finally sites keep their shape with `ownedDir(scope, …)` in place of `mkdtempSync` and the `rmSync`
  removed (the scope removes); the six legacy-name sites the same way;
- per-pid files and sockets move inside an owned folder (D2): `hostKeyPin.test.ts:74`, `sshExecRunner.test.ts:79`
  (the child writes `<dir>/marker`), `requestLife.test.ts:33` (`<dir>/life-<n>.sock`; Windows pipes unchanged);
- every folder that holds a Unix socket (`brokerListeners.test.ts`, `brokerOriginDoor.test.ts:187`,
  `sshAgentServer.test.ts:71`, `:652`, `sshAgentWorld.ts:419`, `requestLife.test.ts:33`) is made under the short socket
  root: `ownedDir(t, '<what>', { parent: shortSocketRoot() })` (O:641 takes `parent`) — so
  `/tmp/testsToDelete-u1000-creds-sock-abc123/broker-<pid>.sock` stays far under macOS's 103 bytes;
- the three nothing-created sites take `tempRoot()` (`materializedKeys.test.ts:54`, `:93`; `pinClickPaths.test.ts:357`);
- harnesses: a module-level `cleanupScope()` closed in a `finally` around `main()` AND in the `.catch` before
  `process.exit`, so the early exits (`ssh-agent-itest.cjs:89`, the SKIP at `creds-cli-itest.cjs:109-113`) remove too;
  every stub through `writeStub(scope, '<harness>-stub', text)`; `backup-archive-itest.cjs`'s `tempDir(tag)` becomes
  `ownedDir(scope, \`backup-${tag}\`)`; a child process that makes temp paths of its own gets the owned folder as
  `TMPDIR`, `TEMP` and `TMP` (R:89-92).

`<what>` per site: the old prefix without `creds-`/`cvbk-`/trailing `-`; ≤ 5 characters where a socket is bound
(`sock`, `door`, `agent`, `life`).

**Scenarios** (`src/test/leftovers*.test.ts`; RED first — every wrapper scenario written against `leftovers.d.cts`
before `leftovers.cjs` has bodies and observed failing; every scenario that counts entries uses a PRIVATE parent made
with `ownedDir`, because eight test files write the temp root at once). The reference's own behaviour is NOT re-tested
here (its 400-odd tests run in `dew_flow_conventions`); what is tested is the binding, the additions, the runners and
the sites:

1. **The wrapper binds the token and the row** — `ownedName('download')` matches
   `^testsToDelete-[uw][0-9]{1,10}-creds-download-[A-Za-z0-9]{6}$` and its owner segment equals `thisOwnerToken()`;
   `REPO_TOKEN === 'creds'`; `REPO_ROW` equals the `repository` cell of the `creds` row read from the mounted detail
   (`.claude/rules/shared/common/test-leftovers-detail.md`, parsed by the test); 1 000 names distinct.
2. **A bad `what` makes nothing** — `''`, `'a/b'`, `'a\\b'`, `'-x'`, `'a\u0001b'`, 26 × `x` throw (the reference's own
   limit, reached through the wrapper); the parent is unchanged.
3. **The claim sits beside the folder, never inside** — `<dir>.owner` parses to `thisOwner()`; `readdirSync(dir)` is `[]`.
4. **A test that fails still removes its folder** — a subtest `await t.test('inner', (t2) => { dir = ownedDir(t2,
   'unwind'); throw new Error('the failing body'); })` (its rejection caught) → after it, `dir` and `dir.owner` are gone.
5. **A killed test leaves its folder claimed, and the next sweep collects it** — a child `node -e` that loads the
   wrapper, makes `ownedDir(cleanupScope(), 'killed', { parent })`, prints the path and
   `process.kill(process.pid, 'SIGKILL')`. The folder and claim remain, naming the child's pid. `sweepLeftovers({ repo,
   tmp: parent, now: now + 11 min, probe })` with a probe answering `alive` keeps both (`live`); with `{ alive: false }`
   removes both. Never the REAL probe on the dead child's pid (`unmatchable-pid.mjs`).
6. **`shortSocketRoot()` and the second root** — on Linux and macOS it is `/tmp`, on Windows `tempRoot()`; given a
   private PAIR of roots, a dead-claimed `testsToDelete-<owner>-creds-sock-abc123` in the SECOND root → removed by the
   runner's two-root sweep (seam for `tmp`).
7. **`ownedFile` and `writeStub`** — the file sits inside an owned folder of the right name; two stubs of two scopes are
   two files; the scope's close removes the folder and the claim.
8. **The runner sweeps, audits, and never lets either change a passing verdict wrongly** (`leftoversRunner.test.ts`,
   seams for `spawn`, `sweep`, the two roots and the record): a sweep that throws → one line, the suite's code; the child
   environment holds `TESTSTODELETE_RUN` equal to `formatOwner(thisOwner())`; a suite that passed and left a folder claimed
   with THIS runner's record → exit 1 naming it, and the folder removed; a folder claimed with another LIVE record (this
   test's own pid with a different start, or `unmatchablePid()` — premise asserted) → not counted, not touched (D9 #1,
   RED first: an audit that compares the owner segment alone removes it); a folder with no claim (unmarked) → listed,
   never touched; a suite that failed → its own code, unchanged, the list printed.
9. **The types say what the module exports** — `Object.keys(require('../../scripts/lib/leftovers.cjs'))` equals the
   export list the test reads out of `leftovers.d.cts` (both directions).
10. **Nothing leaks after a full run** (by hand, recorded in the PR): before the migration, one `npm test` on Linux
    (WSL is fine) and one on Windows, counting NEW entries of the old names (`cvbk-download-*`, `creds-*`,
    `arrival-lease-*`, `wsl-mcp-check-*`, `creds-life-*.sock`, `testsToDelete-agent-*`) — the RED count, expected ≈ 60 / 56;
    after: zero new old-form entries and zero `testsToDelete-<owner>-creds-*`. The same for `npm run itest:all` (RED:
    the eight leaking folders + seven stubs + `backup-archive`'s three + the fragile `ait`/`sshd` folders on a failing
    path), and `node scripts/tree-perf-bench.cjs` once.
11. **The socket paths fit on macOS — required before S2 is done.** The extension suite has no macOS CI leg
    (`ci-extension.yml:28`), so this is a by-hand run on a macOS machine, recorded in the PR (macOS version, Node
    version, the five files' result, the longest socket path printed and its byte length): the `brokerListeners`,
    `brokerOriginDoor`, `sshAgentServer`, `sshAgentWorld`-using and `requestLife` files pass, every socket sits under
    `shortSocketRoot()`, and the longest socket path is under 103 bytes. If a macOS leg is added to `ci-extension.yml`
    before S2 merges, that leg's green run replaces the by-hand record. Without either, S2 is not done.
12. **The mount missing is a refusal, not a silent pass** — with `.claude/rules/shared/tools/lib/owned.mjs` renamed
    aside (by hand, reverted): `npm test` stops before `node --test` with the one line naming the submodule command.

- **Commands.** `cd src_vs_code && npm run typecheck && npm run lint && npm test`;
  `node --import ./scripts/lower-priority.mjs --test out/test/leftoversWrapper.test.js` (one file);
  `npm run itest:all`; `node ../src_minimalapi_server/scripts/backup-archive-itest.cjs` with the server built.
- **DoD.** Scenarios 1–9 RED then GREEN on Windows and on the CI runner; 10 recorded with both counts; 11 recorded on
  macOS (or a green macOS CI leg); 12 observed; `npm test` and every CI harness step green with the submodule step in
  place; no `os.tmpdir()` left outside `leftovers.cjs` (S5 proves it); `module_tests.md:130-146` says what each harness
  leaves after a kill now ("nothing the next sweep does not collect") and names the wrapper, the sweep, the run record and
  the audit, and the scope sentence of D4.

## S3 — E3's C# helper copied with its Darwin path, linked into five projects, and every C# site

- **Models.** Brief by Opus; code by a Sonnet coder; review by Opus against E3's merged files (a `diff` per copied file),
  rule §1–§4, D1–D4 and D9.
- **Depends on** E3's merged producer stage (`dew_flow_mcp` #58, `4feb245`) and its Darwin path (`197cc76`): the coder
  takes `tests/Mcp.Tests/Leftovers/*.cs` at `197cc76` and copies them (D1) — by file, never by reference, never by
  re-typing. A behaviour E2 needs that E3 lacks is built in a file of its own here and sent to E3 as a note.
- **Goal.** No xUnit test here leaves a folder or file in either root on any path; each of the five executables
  sweeps at start on Linux, Windows and macOS and fails a run that left something it claimed.
- **Files.** New `src_service_defaults/tests/Support/Leftovers/*.cs` (the copies; `OwnedToken.cs` rewritten;
  `LeftoversGuardFiles.cs` and the two constants of `LeftoversGuard.cs` rewritten for D7; `OwnedCreds.cs` and
  `LeftoversSocketRootSweepFixture.cs` of this repository's own; the fixture file carries `[assembly: AssemblyFixture]`);
  new `src_service_defaults/tests/Leftovers/*.cs` (every test file of E3's folder but `LeftoversRepositoryGuardTests.cs`, which E2.5 adds over a
  clean tree — token and namespace renamed, plus `SweepRanTests.cs` and this repository's own below); the four other `.csproj` files (one wildcard `Compile Include`
  each; `AllowUnsafeBlocks` added to `BrokerClient.Tests.csproj` and `CredVaultServer.Tests.csproj`); the C# site files of
  the facts; `.github/workflows/ci-clients.yml` (the submodule step; the macOS leg's four steps from `dew_flow_mcp ·
  .github/workflows/ci.yml:144-200` — the `arm64` check with uid and system printed, the layout self-test with its grep,
  `--filter-namespace CredsForDevs.Tests.Leftovers` before the whole executable, the audit's teeth in bash for both
  `CREDS_LEFTOVERS_SELFTEST` values; the same teeth on ubuntu (`ci.yml:49-70`) and in PowerShell on Windows
  (`ci.yml:103-120`)) and `ci-server.yml` (the submodule step and the teeth after `:68`); `research/module_tests.md`
  (the .NET tier row, `:20`).

**The change — the helper.** The copies as D1 says, and three things of this repository's own:

- `OwnedCreds.ShortSocketRoot` (`OwnedCreds.cs`) — `"/tmp"` on Linux and macOS (the reason `AgentRelayHostTests.cs:34`
  hard-codes it), `Owned.TempRoot()` on Windows; the one hard-coded `"/tmp"`, under an inline `raw-temp` exemption.
  `LeftoversSocketRootSweepFixture` (a second assembly fixture) runs the copied `LeftoversSweep.Run` over that root at
  start and `LeftoversSweepFixture.RealAudit(ShortSocketRoot, OwnedDir.Unreclaimed())` at the end, through the SAME
  `GuardedSweep`/`GuardedAudit` entry points (D9 #9); on Windows, where the roots are one, it does nothing.
- `HostProcess.TempDirectory(prefix)` and `HostProcess.Remove(path)` are WIDENED into a **registry-correct adapter**, not
  copied around: `TempDirectory(what)` calls `OwnedDir.Create(what)` (claim first) and KEEPS the `OwnedDir` in a static
  `ConcurrentDictionary<string, OwnedDir>` keyed by its path, returning the path; `Remove(path)` takes the entry out and
  calls its `Dispose()` — never `Removal.Quietly` on the path, never `Directory.Delete` — so the 14 callers keep their shape
  and only their argument changes (`"creds-mcp-pump"` → `"mcp-pump"`), a refused removal stops being silent (one warning
  line, the folder left prefixed and claimed, the entry kept as `DisposeAttempted`), and the end-of-run audit sees the
  folder leave the registry. A path `Remove` was not given by `TempDirectory` is one warning and nothing removed. **Why
  this shape and not the October one** (verified 2026-11-01 against `197cc76`): `OwnedDir.Create` enters the registry
  (`OwnedDir.cs:55`) and only `OwnedDir.Dispose()` leaves it (`:71`); returning the bare path and removing through
  `Removal.Quietly` would have left all 14 folders registered as never disposed and failed every run's audit (D9 #18).
- `BackupArchiveCommandTests.cs:143`'s kit becomes a **per-run, owned** folder: `_owned.Dir("aot-kit")`
  (`testsToDelete-<owner>-creds-aot-kit-<id>`, claimed by the run, removed with the class's scope on every path). The test
  prints the kit's path and the two command lines (`:139-140`, rewritten to name `<printed kit>/archive.cvbk` and
  `<printed kit>/key.b64`) to its output. A person who wants the kit to outlive the run sets `CREDS_AOT_KIT_DIR` to a
  folder of their own (never set in CI); that folder is the person's, not a test leftover.

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
| `src_broker_client/tests/EndpointsTests.cs:16` | `_owned.Dir("endpoints")`; `:80` → `Owned.TempRoot()` under the marker the copied guard asks for outside the helper's folder (E3 review fix D) |
| the 14 `HostProcess.TempDirectory` callers | argument renamed only (widened helper, above) |
| `src_cli/tests/AgentRelayHostTests.cs:34`, `AgentRelayConnectionTests.cs:162`, `RelayLogTests.cs:84` | `Path.Combine(_owned.Dir("sock", OwnedCreds.ShortSocketRoot), "cr.sock")` — `/tmp/testsToDelete-u501-creds-sock-abc123/cr.sock` is 49 bytes; the length is asserted as `AgentRelayTests.cs:122` does |
| `AgentRelayTests.cs:121` | `Path.Combine(_owned.Dir("corpse"), "c.sock")`, the `:122` length assertion kept — it is the guard that the move still fits macOS |
| the nothing-created sites `LogRootTests.cs:17`, `:18`, `:44`, `AgentRelayTests.cs:105`, `RelayPipeEndingTests.cs:41`, `BackupKeyFileTests.cs:92`, `EndpointsTests.cs:80` | `Owned.TempRoot()` in place of `Path.GetTempPath()`, each under the marker (fix D) — any absolute directory, same meaning |

Dispose order matters where a live host or a child writes into the folder (`ShareMaintenanceTests.cs:122-133`,
the process tests): the host or child is a `using` inside the test, so it is gone before xUnit disposes the class and
its scope.

**Scenarios.** E3's test files, copied and renamed, ARE the scenario list for the helper (the owner token and its
vectors, the record, claim-first, the squatter, liveness on three systems, the kernel owner on Windows through the two
`WindowsOwnership` fixtures, identity and the exclusive rename, the quarantine and its restore, the orphan claim, the
FIFO reads, the sweep's decision table, the audit's three exception kinds, the layout self-test, the errno tables, the
guard's detectors and break-its, the janitor cross-check in a private root) — the coder records in the PR which were
carried and any that were not, with why. Then, for this repository:

1. **Every executable sweeps at its start** — `Support/Leftovers/SweepRanTests.cs` (linked into all five) takes
   `LeftoversSweepFixture` and asserts `LastRun` is not null; on Linux and macOS it takes
   `LeftoversSocketRootSweepFixture` too and asserts its run over `/tmp`.
2. **What leaked stops leaking** — RED on `main`, recorded before the migration: one run of `CredVaultServer.Tests`
   and `CredsBroker.Tests` leaves N new folders under `cred-vault-backup-run`, `-backup-store`, `-backup`,
   `-backup-cli`, `-key-file`, `cred-vault-tests` and `creds-endpoints-*` (expected ≈ 190; the exact N in the PR), the
   six parents themselves, and `cred-vault-aot-kit`. GREEN: none of them new; the kit test prints a
   `testsToDelete-<owner>-creds-aot-kit-<id>` path that is gone after the run, and two executables started at once print
   two different kit paths and both pass. The widened `HostProcess.Remove`: a test holding a file under a
   `HostProcess.TempDirectory` folder open with `FileShare.None` (Windows) or a read-only parent (POSIX, premise
   asserted; skipped as root) → `Remove` returns, the warn seam got ONE line, the folder still matches `Owned.Pattern`
   and keeps its claim — RED on `main`: the same set-up leaves an unclaimed, unprefixed folder and says nothing. The
   sockets: on Linux AND macOS the three `cr.sock` paths are asserted < 103 bytes and the tests pass; a sweep over a
   private pair of roots finds a dead-claimed `testsToDelete-<owner>-creds-sock-*` in the second root.
3. **The audit has teeth** — the copied `LeftoversSelfTest` under `CREDS_LEFTOVERS_SELFTEST` (values `1` and
   `failed-dispose`), run by the CI steps of the Files list on all three OSes and asserted as mcp's steps assert (a
   NON-zero exit carrying the audit's first line with counts and the case's words, the folder on its own line under
   them, and an empty, listable temp root afterwards). If xUnit v3 did not fail the run on an assembly-fixture cleanup
   exception the step would be red on its first run.
4. **Nothing leaks after a full run** (by hand): the old names before and after the five executables on Windows and
   in WSL — the RED count, then zero new old-form entries and zero `testsToDelete-<owner>-creds-*`.
5. **The copy is the copy** — a test reads every file of `Support/Leftovers/` whose name is not in the pinned list
   (`OwnedToken.cs`, `LeftoversGuardFiles.cs`, `LeftoversGuard.cs`, `OwnedCreds.cs`, `LeftoversSocketRootSweepFixture.cs`)
   and asserts it equals E3's file at `197cc76` save the namespace line — the sha of each E3 file is pinned in the test
   (the vectors file is proof enough for the token; this is proof for the rest). And D9 #1: the real fixture's audit is
   built with `Owner.This` (a reflection read of `RealAudit`'s call, or the copied test that pins it).
6. **The macOS leg is green with the layout self-test first** — `clients · build · test (macos-latest)` runs the four
   steps of the Files list; its log carries `darwin layout: arch=Arm64` and `getuid=<the shell's uid>`; the run URL in
   the PR. The elevated Windows runner's owner (`RunnerFactsTests`) is in the Windows log; both URLs in the PR (D9 #6).

- **Commands.** `node $LP dotnet build dew_flow_creds_for_devs.slnx -m:4 --disable-build-servers` plus the two
  projects the solution does not carry (`research/module_tests.md:1723-1724`); the five executables one after
  another (`:1726-1730`), each with `--filter-namespace "CredsForDevs.Tests.Leftovers"` first; `dotnet format
  dew_flow_creds_for_devs.slnx --verify-no-changes --no-restore` in Linux or WSL (CRLF noise on Windows).
- **DoD.** Every scenario RED then GREEN on Windows and on the CI runners (the four client projects on all three OSes);
  the teeth observed on each OS; the .NET tier row of `module_tests.md:20` names the helper, the two sweeps and the
  audit; build at 0 warnings; the per-file `diff` against E3 in the review.

## S4 — The CI smoke carve-out, acme-test, the bash helper and the shell scripts

- **Models.** Brief by Opus; code by a Sonnet coder; review by Opus against rule §2, §5, D1 (bash), D3, D5, D6. The
  `owned.sh` story (E2.4.S1) is a cornerstone: its spec is Fable's (§ *Epics*).
- **Goal.** The image smoke follows the carve-out and a failed smoke stays failed and never publishes; the acme probe
  leaves nothing in the checkout, the temp root or the Docker daemon; every CI/test shell script names, claims and
  removes its scratch on every path, in the owner form.
- **Files.** `.github/workflows/docker.yml`; new `.github/scripts/lib/owned.sh` and `.github/scripts/lib/owned.test.sh`;
  `.github/workflows/ci-clients.yml` (one step after `:79`: *Self-test the shell helper*); `.github/scripts/mcp-listen-smoke.sh`,
  `mcp-listen-smoke.test.sh`, `version-smoke.sh`, `version-smoke.test.sh`, `start-server-and-wait.sh`,
  `start-server-and-wait.test.sh`; `deploy/restore-archive-itest.sh`; `deploy/acme-test/run.sh`,
  `docker-compose.acme-test.yml`; `.gitignore:120-121` (the `state/` line goes); `ci-server.yml:257-262` (shellcheck
  gains `owned.sh` and `deploy/acme-test/run.sh`); `deploy/README.md:252` if it describes `state/`;
  `research/architecture.md:363` (the image line).

**The change — `owned.sh`** (sourced; bash; no `set -e` of its own; **claim first** — plan-gate round 2's finding, rule
§2's order as `owned.mjs` has it, O:641-660):

```bash
REPO_TOKEN="creds"                                     # rule §1 — the ONLY place the shell token is written (the guard's constant shape)
owned_token   # prints the caller's owner token: u$(id -u) on Linux/macOS; on MINGW*/MSYS*/CYGWIN* the w<digits> form read ONCE
              # from the mounted reference through node (D1); no node → one line on stderr, return 1 (every caller exits)
owned_owner   # prints <token>:<host>@<linux|macos|windows>:<pid> — host from `hostname` with [@:[:space:]] runs → '-', the WSL
              # ~distro suffix when WSL_DISTRO_NAME is set; os from `uname -s`; pid: on Windows read from /proc/$$/winpid, else $$
owned_dir <var> <what>   # sets the caller's variable with printf -v — NO command substitution, so it runs in the caller's shell and
                         # the trap it checks is the caller's. Validates what (non-empty, no / \ control, no leading -, ≤ 25). Then, in
                         # rule §2's order, up to three draws of dir="${TMPDIR:-/tmp}/testsToDelete-$(owned_token)-${REPO_TOKEN}-<what>-<8 hex>":
                         #   1. CLAIM  — (set -o noclobber; owned_owner > "$dir.owner"): the exclusive create; EEXIST → somebody's name, draw again
                         #   2. REGISTER — OWNED_MADE+=("$dir"); on the first call: `trap -p EXIT` empty → `trap owned_cleanup EXIT`; not empty
                         #      and not naming owned_cleanup → one line, the own claim removed, return 1 (a script with its own trap calls
                         #      owned_cleanup inside it and sets it BEFORE its first owned_dir); OWNED_KEEP=1 skips this step (handed-on resources)
                         #   3. CREATE — mkdir "$dir" (exclusive: a folder already there is a squatter's — one warning, the own claim removed
                         #      only while it still holds exactly what was written (cmp), never the folder, draw again)
                         # Seam: OWNED_HOOK_AFTER_CLAIM names a function run between 1 and 2 (the kill test); unset in every real run.
owned_remove <dir>   # refuses an empty path or a basename not matching ^testsToDelete-<token>-creds- (the CALLER's token, read
                     # once — never the bare prefix); five tries 0.1 s apart: rm -rf -- "<dir>", then rm -f -- "<dir>.owner";
                     # on giving up ONE stderr line, return 0
owned_cleanup        # owned_remove on every entry of OWNED_MADE, last first; idempotent; never exits the shell
```

The name pattern inside `owned_remove` is built from the token variable (`^testsToDelete-${OWNED_TOKEN}-creds-`), never
written with a bare prefix — the shipped classifier reads a bare-prefix glob or regex in a `.sh` as `owner-blind`, and the
class takes no exemption. `mktemp` is gone: it creates before it claims, and a process killed between its `mkdir` and the
claim leaves an UNCLAIMED owner-form folder that rule §4 lists and never collects (the finding). With the claim first, a
kill between the claim and the `mkdir` leaves an **orphan claim** with a record whose pid is gone, which every sweep of
rule §4 collects (R:84-87). Every caller does ONE line, after its own trap if it has one: `owned_dir work smoke-test || exit 1`
(a script with its own trap, `start-server-and-wait.test.sh:36-43`, adds `owned_cleanup` to its `cleanup` body and keeps
`trap cleanup EXIT` before the call).

**The change — the scripts.** `mcp-listen-smoke.test.sh:19`, `version-smoke.test.sh:14`,
`start-server-and-wait.test.sh:28` → the line above (the `rm -rf` at `:72`, `:81` goes); `restore-archive-itest.sh`
→ one `owned_dir WORLD world` per `world()` call; `owned_cleanup`, the one EXIT trap (installed by the first call),
removes all nine; `mcp-listen-smoke.sh:35-36` and `version-smoke.sh:30`, `:64` → under `RUNNER_TEMP` (a runner-owned
root, emptied per job) unchanged — no finding by R:258; off CI (no `RUNNER_TEMP`, no explicit root) → `owned_dir` + trap
(the per-pid `creds-*-smoke-$$` leaf goes); `start-server-and-wait.sh:107`'s default (no `START_SERVER_LOG`) →
`OWNED_KEEP=1 owned_dir log server-log` (claimed, created, kept out of the cleanup list), because the log is handed on (`:132`) — its claim names the shell that made it, so
the next sweep collects it once that shell is gone, and the test (`start-server-and-wait.test.sh`) passes
`START_SERVER_LOG="$work/…"` so its runs leave nothing.

**The change — `docker.yml`** (D5). A new first step after checkout, *Name the smoke's resources*:

```yaml
      # common/test-leftovers.md §1, §3, §5: one random id per job; the owner token is the runner user's; the record's pid is
      # the job's runner worker, the parent of every step's shell — the only process that outlives the step (R:112-116).
      # Printed once, so the first run shows which process that is.
      - name: Name the smoke's resources
        run: |
          {
            echo "OWNER=u$(id -u)"
            echo "SMOKE_ID=$(openssl rand -hex 4)"
            echo "SMOKE_OWNER=u$(id -u):$(hostname | tr -s '@: \t' '-')@linux:$PPID"
          } >> "$GITHUB_ENV"
          ps -o pid=,comm= -p "$PPID" || true
```

Every `cv`/`cv-refused`/volume occurrence in `:78-117` becomes the literal prefixed name of D5 (`${OWNER}` right after
the prefix); `docker run` and both `docker volume create` gain `--label "testsToDelete.owner=$SMOKE_OWNER"`; `:92`,
`:111`'s `docker rm -f`, `:116-117` go. After *Smoke-test a refused start*:

```yaml
      # The carve-out's remover (common/test-leftovers.md §5): after every step that reads the two containers, on
      # every path, by exact name — and it never decides the verdict: continue-on-error, `|| true`, exit 0.
      - name: Remove the smoke's containers and volumes
        if: always()
        continue-on-error: true
        run: |
          [ -n "${SMOKE_ID:-}" ] || { echo "no smoke id: nothing was named, nothing to remove"; exit 0; }
          docker rm -f -v "testsToDelete-${OWNER}-creds-cv-${SMOKE_ID}" || true
          docker rm -f -v "testsToDelete-${OWNER}-creds-refused-${SMOKE_ID}" || true
          docker volume rm "testsToDelete-${OWNER}-creds-refused-data-${SMOKE_ID}" || true
          docker volume rm "testsToDelete-${OWNER}-creds-refused-logs-${SMOKE_ID}" || true
          echo "left after removal:"
          docker ps -a --filter label=testsToDelete.owner --format '{{.Names}}' || true
          docker volume ls --filter label=testsToDelete.owner --format '{{.Name}}' || true
```

`Log in` and `Publish` are untouched. The owner pid is the runner's worker, `$PPID` of the step's shell — the
contract's rule for a CI job (R:112-116, N11 settled); the `ps` line records which process that was in the first run's
log. The shipped guard's `docker-name` class accepts a literal whose expansions are `${OWNER}`/`${SMOKE_ID}` after the
owner form's prefix; S5 sc. 2 pins that this exact text passes and that `"$OWNER"` right after the prefix is `owner-blind`.

**The change — acme-test** (D6). `docker-compose.acme-test.yml`: drop `name:` (`:19`); an `x-owned: &owned` block
`labels: { testsToDelete.owner: "${TESTS_TO_DELETE_OWNER:?}" }` merged into each service (`<<: *owned`) and set on
`networks.edge.labels`; every `./state/…` source (`:47-48`, `:68-69`, `:97-98`) → `${ACME_STATE:?}/…`. `run.sh`, in
this order:

1. **The very top**, right after `set -euo pipefail` and sourcing `../../.github/scripts/lib/owned.sh` — before any
   sweep, any `docker compose` call and any `owned_dir`: `export TESTS_TO_DELETE_OWNER="$(owned_owner)"`
   (`owned_token` having refused already if it cannot be had); `STATE=""`, `PROJECT=""`; `trap cleanup EXIT` and `trap
   'exit 130' INT` / `trap 'exit 143' TERM` (so an interrupt runs the EXIT trap once). `cleanup` skips each step whose
   input is not made yet: when `PROJECT` is set, `docker compose -p "$PROJECT" -f docker-compose.acme-test.yml down -v
   --remove-orphans || true`; when `STATE` is set, `docker run --rm -v "$STATE":/s alpine sh -c 'rm -rf /s/certs /s/data
   /s/logs' || true`, then `owned_cleanup` (`owned_remove` on `$STATE`) — so the EXIT trap's body names `owned_cleanup`, as
   `owned_dir` requires (its check); the trap is set before the first `owned_dir`.
2. The start-of-run sweep of D6: `JANITOR_MIN_AGE_MINUTES=10 bash ../../.claude/rules/shared/tools/janitor.sh --token
   creds` (exit 0 and 3 fine; any other code one line, the run goes on; on Windows a dry run until armed).
3. `owned_dir STATE acme || exit 1` (claim, register, create, in the caller's shell); `id` = its six-character suffix lowercased;
   `PROJECT="teststodelete-$(owned_token)-creds-acme-$id"`, `COMPOSE=(docker compose -p "$PROJECT" -f
   docker-compose.acme-test.yml)`; `export ACME_STATE="$STATE"`.

The fixed-name `cleanup` at `:53` and the `rm -rf state` at `:54` go (`mkdir -p` the four subfolders under
`$STATE`); `:56`'s chown mounts `$STATE`. Every `state/…` path in the checks (`:83`, `:86`) reads `$STATE/…`. On Git Bash the
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
3. **`owned.sh` keeps rule §1–§3** (new `.github/scripts/lib/owned.test.sh`, run from `ci-clients.yml` beside the two
   smoke self-tests, three OSes, in a PRIVATE root handed as `TMPDIR`): `owned_dir d x` → `d` matches
   `^testsToDelete-[uw][0-9]{1,10}-creds-x-[0-9a-f]{8}$` under that root, its owner segment equal to what `node -e` prints
   from the mounted `thisOwnerToken()` on the same machine (the one cross-helper check, all three OSes); `d.owner` exists
   and parses with the contract's record grammar and, on Windows, names a pid `tasklist` lists while the script runs;
   **the claim is older than the folder** (`d.owner`'s mtime ≤ `d`'s birth, or the seam: with `OWNED_HOOK_AFTER_CLAIM`
   set to a function that records `[ -e "$d.owner" ] && [ ! -e "$d" ]`, the record is true); a bad `what` → non-zero,
   nothing made, no claim; `owned_remove ""` and `owned_remove /tmp/other` refuse and remove nothing; `owned_dir` in a
   script whose EXIT trap does not name `owned_cleanup` → non-zero, the own claim removed, nothing created; a squatter
   (a folder planted at the drawn name through the seam) → one warning, the claim redrawn, the planted folder untouched;
   `owned_remove` on a folder whose parent is read-only (POSIX, premise asserted) returns 0, one line, both remain; with
   `node` hidden from PATH on Windows (`PATH=/usr/bin` in a subshell) `owned_token` returns 1 with its line (fail closed).
   **The kill between the two steps (the round-2 finding; RED first against a `mktemp`-first helper):** a child bash
   script sources `owned.sh` with `OWNED_HOOK_AFTER_CLAIM=die` (`die() { kill -9 $$; }`) and calls `owned_dir d x` →
   the child dies between the claim and the `mkdir`; the private root then holds exactly ONE entry, `…-x-<id>.owner`,
   and no folder; its mtime is set 11 minutes back (`touch -d`); `JANITOR_MIN_AGE_MINUTES=10 bash
   .claude/rules/shared/tools/janitor.sh --token creds` with `TMPDIR` = that root → on Linux and macOS the root is EMPTY
   afterwards (the orphan claim of a gone pid is collected); on Windows (a dry run unless armed) the janitor's output
   names the claim as what it would remove, and the same root fed to the Node reference's `sweepLeftovers({ tmp })`
   through `node -e` is empty afterwards — measured, not assumed. RED on the `mktemp`-first shape: the same kill after the
   `mkdir` and before the claim leaves an UNCLAIMED folder that both sweeps list as unmarked and never remove. And a kill
   AFTER the `mkdir` (`kill -9 $$` from a child of the script) leaves the folder AND its claim, which the same sweep
   collects.
4. **The shell scripts leave nothing** — RED on `main`: `restore-archive-itest.sh` leaves nine `tmp.*` folders (count
   them before/after one run); `mcp-listen-smoke.test.sh` interrupted with SIGINT mid-run leaves its `tmp.*` folder.
   GREEN: zero new old-form entries; the interrupted run leaves nothing (the trap ran).
5. **acme leaves nothing** (by hand, on the machine the owner uses — Git Bash on Windows — and on Linux if one is at
   hand, recorded): RED on `main`: after a green `./run.sh`, `deploy/acme-test/state/` exists; on Linux the second run
   stops at `:54` (if it does, that is the reasoning of the facts measured). GREEN: after a green AND after a failing
   run (`VAULT_IMAGE=busybox`), no `state/`, no `testsToDelete-<owner>-creds-acme-*` folder or claim, `docker ps -a
   --filter label=testsToDelete.owner` shows no acme container, `docker network ls` no acme network.
6. **acme survives its own kill and is collected** — `./run.sh` killed with `kill -9` (Windows: `taskkill /F /PID
   <winpid>`) mid-issuance: the project, the network and the state folder remain, labelled/claimed with that pid; the
   next `./run.sh`, more than 10 minutes later, removes them before starting through `janitor.sh --token creds` (the
   project, its network and the state folder gone, the run green) — on Linux; on Windows the janitor's dry run LISTS
   them and the record says so (D6's limit), and they are removed by hand. A second `./run.sh` started while the first
   is LIVE: the first one's stack is untouched (the old `:53` tore it down) — the janitor reads the live owner and keeps it.
7. **An interrupt at any point still cleans up** (RED first on `main`: Ctrl-C during the first `compose up` leaves
   `deploy/acme-test/state/` in the checkout — `cleanup` at `:49` never touches it): SIGINT to `run.sh` (a) during the
   janitor call, before `owned_dir` → exit non-zero, nothing made, no error from `cleanup`; (b) during `compose up` →
   the project, its network and the state folder are gone when the script returns; (c) SIGTERM, same as (b).

- **Commands.** `.github/scripts/lib/owned.test.sh`; the three `.test.sh`; `bash deploy/restore-archive-itest.sh`;
  `docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:v0.11.0 <every changed .sh>`; `actionlint`; the
  dispatches of sc. 1–2; `cd deploy/acme-test && ./run.sh`; `JANITOR_MIN_AGE_MINUTES=10 bash
  .claude/rules/shared/tools/janitor.sh --token creds --dry-run`.
- **DoD.** Sc. 1 observed RED then GREEN with run URLs; sc. 2 green; sc. 3–4 RED then GREEN; 5–7 recorded on at least
  one machine, the other OS stated as not run; `architecture.md:363` says the smoke's containers are named in the owner
  form, labelled and removed by one always-run step that never decides the verdict.

## S5 — The two guards' CI steps, the exemptions, and the docs

- **Models.** Brief by Opus; code by a Sonnet coder; review by Opus against rule §1, §5, §7 and D7.
- **Goal.** No test, harness, CI script or workflow here creates a temp path, container, volume or compose project
  outside the three helpers (or under a valid inline exemption), no name is built without the owner segment, no
  prefix match exists outside the helpers, every helper's token is registered, and a scan of nothing is red — checked
  on every pull request by the shipped Node guard and by E3's C# guard.
- **Files.** `.github/workflows/docs.yml` (two steps after *Public hygiene*: `npm ci --ignore-scripts --prefix
  .claude/rules/shared`, then `node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds
  --identity "the developer-credentials server and extension"`); the C# guard's discovery (S3's `LeftoversGuardFiles.cs`)
  and `LeftoversRepositoryGuardTests` (added here, in E2.5, over a clean tree — the C# guard's scan over the tree is run
  by hand after E2.3 and E2.4 and its list recorded on those PRs as migration evidence); the inline exemptions of D7;
  `research/module_tests.md` (a section *Test leftovers* after `:146`), `research/architecture.md:366` (the docs·plans
  line names the Node guard), `CLAUDE.md` (one line in *Commands*: the janitor, `bash
  .claude/rules/shared/tools/janitor.sh --dry-run`, from Git for Windows' bash on Windows; one line: the two guards and
  how to run each locally).

**Scenarios** (RED first: the real-tree runs on the last `main` commit before S2–S4 landed):

1. **This repository passes both guards** — RED before S2–S4 with the full lists in the PR: the shipped guard's 62
   findings of the facts (re-run on the branch's base), and the C# guard's list over the same base (the harnesses, the
   `.cs` sites, the helper-file sites the node profile misses, the fixed `/tmp` sockets — the coder records the count).
   GREEN after: exit 0 from `leftovers-check.mjs --profile node` in `docs.yml`, and `This_repository_passes_the_guard`
   green on the three OS legs.
2. **Every class fires once, and a valid exemption silences it** — for the C# guard, E3's own `LeftoversGuardTests`
   (copied) plus this repository's additions in `LeftoversGuardCredsTests.cs`: a planted `fs.mkdtempSync(` in
   `src_vs_code/scripts/x.cjs` and in `src_vs_code/src/test/xWorld.ts` ⇒ 1 `raw-temp` each; `Path.GetTempPath()` in
   `src_cli/tests/X.cs` ⇒ 1; `"testsTo" + "Delete-"` in a `.cs`, a `.cjs` and a `.sh` ⇒ 1 `legacy-name`/`owner-blind` each
   (D9 #2); `Owned.Prefix` referenced from `src_mcp/tests/X.cs` ⇒ 1 `owner-blind` (D9 #14); `docker compose -p
   cred-vault-acme-test up` in `deploy/acme-test/run.sh` ⇒ 1 `docker-name`, with `-p teststodelete-${OWNER}-creds-acme-$id`
   ⇒ 0; `.github/workflows/docker.yml` ⇒ no docker finding from the C# guard (the pinned exclusion) — and, for the shipped
   Node guard (no new tests here: its own suite covers the classes), three facts pinned by running it over fixture
   workflows in `leftoversGuardFixtures.test.ts`: the D5 remover AFTER the reader ⇒ 0; the remover BEFORE the `docker
   logs` step ⇒ 1 `docker-run`; `"$OWNER"` right after the prefix in the remover ⇒ `owner-blind`, `${OWNER}` ⇒ 0.
3. **A scan of nothing is red** — the C# guard over an empty folder ⇒ `FilesScanned == 0` and the one sentence (copied
   test); the shipped guard with `--repo <empty git repository>` ⇒ exit 2 (observed once, recorded).
4. **The tokens** — the shipped guard's token check over the real mount ⇒ none; the three constants (`leftovers.cjs`,
   `owned.sh`, `OwnedToken.cs`) found and equal — one changed to `cred` (by hand, reverted) ⇒ a `token` finding naming
   the three places; the C# `GuardTokens` over the real mount ⇒ none, over a rule text whose `creds` row names another
   repository ⇒ 1.
5. **The exclusion lists are pinned** — the C# guard's `ExcludedFiles` is empty (E3's test, copied) and its docker
   exclusion is exactly `.github/workflows/docker.yml`; the shipped guard's `EXCLUDED_FILES` is its own two test files
   (its test).
6. **Break-it on the real tree** (by hand, recorded, reverted): one raw `fs.mkdtempSync` in a unit test, one in a
   harness, one `Path.GetTempPath()` in a C# test, `continue-on-error` deleted from the remover step,
   `.claude/rules/shared` de-initialised — each red naming its line (the last: the shipped guard's `token` finding
   naming the mount, and the C# guard's one `owner-blind` finding for the missing classifier); restored ⇒ green.

- **Commands.** `npm ci --ignore-scripts --prefix .claude/rules/shared && node .claude/rules/shared/tools/leftovers-check.mjs
  --repo . --profile node --token creds --identity "the developer-credentials server and extension"`;
  `./src_service_defaults/tests/bin/Debug/net10.0/CredsForDevs.ServiceDefaults.Tests --filter-class "*LeftoversRepositoryGuardTests"`;
  `node .claude/rules/shared/tools/plan-lifecycle.mjs`; `node .github/scripts/public-hygiene.mjs`.
- **DoD.** Sc. 1 RED with both recorded lists, then GREEN on the branch after S2–S4; 2–5 green; 6 observed; `docs.yml`
  runs both steps in the required job; `module_tests.md`, `architecture.md` and `CLAUDE.md` updated; this document's
  status becomes `E2 shipped, <YYYY-MM-DD>; promotes with its parent` — never *implemented* while it sits in `todo/` —
  the README row and the parent's E2 entry the same sentence. Parent and stories promote together, after the last epic.

## Test plan

| The parent's "proven by" | Where |
|---|---|
| A failure test of the workflow: the job ends FAILED, the always-run cleanup ran and removed by exact name (observed in the job), `Publish` SKIPPED | S4 sc. 1 (both halves of the smoke), with the RED on the old shape |
| The guard's break-it on a `docker run` without `--rm` and without an always-run remover | S5 sc. 2 (the remover-before-reader variant through the shipped guard), sc. 6 |
| RED-GREEN per no-cleanup temp file class | Node unit tests: S2 sc. 10 (counted); harnesses and stubs: S2 sc. 10; C#: S3 sc. 2–4; shell: S4 sc. 4; acme: S4 sc. 5; and S5 sc. 1 for all of them at once |
| Unwind test for the helper | S2 sc. 4–5 (the wrapper), S3 (E3's set, copied), S4 sc. 3 (bash) |
| (contract) owner claim, two keys, start-of-run sweep, concurrent-owner survival | S2 sc. 5, 8; S3 (E3's set); S4 sc. 6 |
| (contract) teardown that gives up stays prefixed and claimed | S3 sc. 2 (the widened `Remove`), sc. 3 (`failed-dispose`); S4 sc. 3 |
| (round 2) a kill between claim and create leaves nothing the next sweep does not collect — RED-GREEN-RED | S4 sc. 3 (the kill test; RED on a `mktemp`-first helper, GREEN claim-first, RED again with the two steps swapped by hand) |
| (consultant, verified) a removed `HostProcess` folder leaves the registry | S3 sc. 2 (`OwnedDir.Unreclaimed()` empty after `Remove`; RED with the path-only adapter) |
| (wave 1) the audit never removes a live sibling's folder — RED-GREEN-RED | S2 sc. 8 (a record-equality audit; RED with an owner-segment compare, GREEN, RED again with the compare reverted); S3 sc. 5 |
| (wave 1) split, escaped or concatenated spellings are findings — RED-GREEN-RED | S5 sc. 2, through the copied folded reading; reverting `LeftoversGuardLiterals.cs` to a whole-literal read turns it RED again (by hand, recorded) |
| (wave 1) an exclusive rename, a hex quarantine suffix, a FIFO that cannot block, the elevated runner | S3: the copied `NativeTests`, `DarwinNativeTests`, `LeftoversSweepTests`, `RunnerFactsTests`, `WindowsOwnership` on the three legs |
| (Darwin) the layout holds before anything destructive runs | S3 sc. 6 and the copied `LayoutGateTests`, `DarwinLayoutTests` |
| (barrier) stage A empty, and still empty at the merge | S0; the rescan line on the producer PR's head |

## Definition of Done

- [ ] Stage A recorded (S0): the two scan lines and the rescan on the PR head, all "none found".
- [x] The pin carries release `105d53c`; the mounted detail lists `creds` (S1, PR #289).
- [ ] Every folder and file a Node, C# or shell test, harness or CI script makes is named
      `testsToDelete-<owner>-creds-<what>-<id>`, claimed beside itself with the record of rule §3, removed on every
      unwinding path, never by a throwing teardown; a teardown that gives up leaves it prefixed and claimed with one line
      (S2–S4). The six legacy-name sites of `main` are gone.
- [ ] `npm test`, `itest:all` and each xUnit executable sweep both roots at start under the two keys and never fail the
      run for it; the runners export `TESTSTODELETE_RUN`; `npm test` and the xUnit executables fail a run that left
      something claimed with their own record, and never touch another record's folder (S2, S3).
- [ ] E3's helper is a byte copy save the five named files, with its Darwin path, green on Linux, Windows and macOS;
      `AllowUnsafeBlocks` in all five test projects (S3).
- [ ] `docker.yml`'s two containers and two volumes are prefixed in the owner form, labelled, removed by one always-run
      exact-name step after the diagnostics, and a failed smoke was observed FAILED with `Publish` skipped (S4).
- [ ] acme leaves no `state/`, folder, container or network after a green or a failed run (S4).
- [ ] The shipped Node guard (`--profile node`) and the C# guard are red on every class that can occur here, on an
      unregistered or disagreeing token and on a scan of nothing, and green on `main` — the first in the required
      `docs.yml` job, the second on the three OS legs (S5).
- [ ] Nothing of the Node reference was copied (a reviewer greps the wrapper for every exported name of `owned.mjs` and
      finds only re-exports); nothing of D9 came back in (the reviewer walks the table).
- [ ] The merge conditions (a)–(d) of D8 are recorded on the producer PR, the owner's Windows machine included.
- [ ] `research/module_tests.md`, `research/architecture.md` and `CLAUDE.md` describe the helpers, the sweeps, the
      audit, the two guards and the janitor.
- [ ] Each epic of § *Epics* merged through its own branch, plan gate and code gate, in order; the second consult ran before
      E2.4; the shipped Node guard's remaining findings after E2.1, E2.2, E2.3 and E2.4 are recorded on those PRs as
      migration evidence (never exemptions) and reach zero in E2.5.
- [ ] A plan-gate round on THIS document reached `proceed` before the first producer commit; the summary of the producer
      PR names the rounds, the reviewers that answered, and the Opus review.

## Plan-gate round 1 (2026-10-17)

The coai plan gate's first round over the October version; judged by Opus. Accepted then and still applied above,
re-read against the release (each item's wording updated where the release changed it):

1. Node socket tests use the same short socket root as S3's C# socket tests; every sweep and audit reads it; a
   macOS socket-path check is required before S2 is done — D4, S2 (wrapper, sites, sc. 6, sc. 11, DoD).
2. The AOT kit is a per-run, owned folder whose path the test prints — no fixed directory shared by concurrent
   runs — S3 (helper bullet, sc. 2).
3. The collection guarantee holds for `npm test`, `npm run itest:all` and the xUnit executables; a direct `node
   --test <file>` removes its own scratch but does not sweep — D4, S2 runners and DoD.
4. acme `run.sh` exports the owner and registers `trap cleanup EXIT` (plus `INT`/`TERM`) at the very top, before any
   sweep, compose call or `owned_dir` — D6, S4 (run.sh order, sc. 7).
5. `janitor.sh --token` is in the release: the acme start-of-run sweep calls `janitor.sh --token creds` with
   10 minutes; the "if E1 says no" fallback and N4's request are gone — D6, Order, Boundary, S1, S4 sc. 6, N4.
6. The end-of-run audit fails only for what THIS run claimed — October's run marker is replaced by the contract's
   `TESTSTODELETE_RUN` record (D4, S2 sc. 8); the concurrency property the marker gave (a second `npm test` on the same
   host is never blamed) holds through the record's pid and start instead.

Rejected:

- `owned_claim` in a subshell could mask a pre-existing claim — the folder is the random one `owned_dir` has just
  created, so its claim cannot pre-exist, and the subshell's exit status reaches the caller. *(Moot since round 2:
  `owned_claim` is gone; the claim is written first, inside `owned_dir`, in the caller's own shell.)*

Also reflected from the contract, settled: the owner host compared case-insensitively (D3); a CI job's owner pid
is the runner worker `$PPID` (D5, N11). **This document needs a new round**: a re-split is a whole re-review
(`common/plan-change-control.md` step 7), and the parent's wave-1 paragraph says so for every consumer's stories.

## Plan-gate round 2 (2026-11-01) — the re-split's own round

coai session `0b24304d` over this document: verdict **`proceed`**, 1 of 2 reviewers counted (the 122 KB file did not reach
the other whole — a size this document now records as a limit of its own; a split into a facts companion is the owner's
call). One finding, **accepted**: S4's `owned_dir` ran `mktemp -d` and claimed afterwards, so a kill in that gap left an
unclaimed owner-form folder that rule §4 lists and never collects. Applied: the bash helper claims FIRST, registers, then
creates exclusively (D1, D2, S4 — the block, the callers, acme, sc. 3's kill test, RED on the old shape).

The gate's operator commands, applied: five epics of 3–5 stories, split by Fable, written at the bottom (§ *Epics*);
cornerstones marked (2 of Q = 2); per-epic branches from the previous epic's commit; one plan gate and one code gate per
epic; a consultation once per three epics before each group (D8, Order).

The question consultant (`9d8564bb`, Codex with the files, Gemini without), each item verified before adoption:

| Consultant said | Verified | Adopted |
|---|---|---|
| Five sequential epics, each a complete lifecycle for its scope; whole-repository guard activation last (Codex; Gemini the same order) | against the facts: the Node profile reads every `.sh` and the workflows, so a guard switched on before E2.4 is red on 13 findings not of that epic | yes — § *Epics*, D8 |
| `HostProcess.TempDirectory` returning `OwnedDir.Create(..).Path` with `Remove` → `Removal.Quietly` leaves registry entries (`OwnedDir.cs:49`) | yes: `Create` registers at `OwnedDir.cs:55`, only `Dispose()` unregisters at `:71`; the audit's `NeverDisposed` would fire on every run | yes — S3 (the registry-correct adapter), D9 #18, S3 sc. 2 |
| acme's fixed-project `down` can destroy a running probe; project, labels, state and teardown belong together | already D6/N3 (`run.sh:53`); nothing new | already so; E2.4.S4 is one story for all four |
| Switch the shipped Node guard on at the end of the Node epics, not the end (Gemini) | measured on `47724fd`: 9 shell `raw-temp` + 4 `docker-name`/`docker-run` findings are not Node's and stay until E2.4 → the step would be red for two epics | **no** — the guard is RUN after each epic and its list recorded (migration evidence); it switches on in E2.5 |
| Cornerstones: the end-of-run audit against live siblings; the creds-only primitives (`owned.sh`, the short socket-root sweep) (Gemini) | the audit and `owned.sh` are the two places a mistake deletes live data or is written from scratch here; the socket-root sweep is one call into copied code behind the same guarded entry points | partly — two cornerstones (the quota): E2.1.S2 and E2.4.S1; the socket-root fixture is an Opus-briefed story |
| Do not adopt coai's unreleased raw-temp baseline proposal; leftover findings after an epic are migration evidence, not exemptions (both) | nothing here adopted it | yes — D8 |

## Notes for the parent (`dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md`, E2 entry)

Opus, 2026-10-16, against `origin/main` a7b3ecf2 of this repository, the E1 branch of the shared rules and E3's
stories (N1–N13); Fable, 2026-11-01, against `47724fd`, release `105d53c` and E3's merged helper (N14–N19).

| # | The entry says | What is so | Resolution here |
|---|---|---|---|
| N1 | ~110 temp sites, ~35 files without cleanup, 68 files | 111 mentions in 70 files, but 3 are `research/*.md` and 8 are product (`install.sh`, `deploy/restore*.sh`, `installCommand.ts`). Test-side: Node unit 46 sites in 30 files (20 leak, 2 fragile, in 14 files), harnesses 15 folders (8 leak, 3 fragile) + 9 stubs (7 never removed), shell 7 (1 leaks nine per run, 4 fragile or off-CI leaks), C# 54 sites in five projects (11 leak, 3 fragile, in 13 files; ≈ 190 folders per run). About 40 files hold a leak or a fragile site, not ~35; and the C# side is five projects, not "the server tests". **2026-11-01:** still 46/30 (eight files entered, one left) and 54; harnesses 17 folders (two `sshd` folders added) | the facts tables; S5 sc. 1 is the exact RED |
| N2 | "the 7 fixed-name stub files the `*-itest.cjs` scripts write" | six are itests; the seventh is `tree-perf-bench.cjs:25`; an eighth, per-pid, is removed on success only (`masked-run-itest.cjs:19`, `:149`) | S2: every stub inside an owned folder |
| N3 | acme: `state/` cleaned at the start of the next run | right, and on a Linux host the start's `rm -rf state` cannot delete root- and uid-10001-owned files (reasoned, S4 sc. 5 measures). The entry misses that acme's COMPOSE PROJECT (four containers, one network, fixed name `cred-vault-acme-test`) is a container leftover too, and that its start-of-run `compose down -v` by fixed name (`run.sh:53`) tears down a concurrent run's stack — the owner-less reclaim rule §4 forbids. Bind mounts are also `:68-69`, `:97-98` | D6, S4 |
| N4 | (nothing) | a consumer whose SHELL starts containers needs rule §4's sweep with three-valued liveness in bash; the shipped janitor has it. **Settled, 2026-10-17:** the release ships `janitor.sh --token <t>` | D6 calls it; never a copy |
| N5 | a failure test: stub image, job FAILED, `Publish` SKIPPED | `docker.yml` never runs on a pull request (`:15-18`, `:38-42`), and on a dispatch from a branch `Publish` is skipped by its OWN `if:` (`:137`), which proves nothing about `success()` | S4 sc. 1: a throwaway branch makes `Publish` reachable with `push: false`, then a sabotaged smoke shows it skipped by the failure |
| N6 | the guard scans workflows and `deploy/**/*.sh` beside the test trees | also needed: `.github/scripts/**`, `src_vs_code/scripts/`, `src_minimalapi_server/scripts/`. ~~The mounted `tools/leftovers-check.mjs` cannot be reused~~ **2026-11-01: it can and must (decision 11), under `--profile node`** — but its `raw-temp` class still misses the shell spelling `${TMPDIR:-/tmp}` (measured: 0 `TMPDIR` findings on `47724fd`), so `mcp-listen-smoke.sh:35` and `version-smoke.sh:30` pass unseen | D7; S4 migrates the two scripts regardless. **Still open for the contract's guard**: a `raw-temp` detector for `${TMPDIR…}`/`$TMPDIR` in `.sh` |
| N7 | a Node helper (`src_vs_code`) and a C# helper | the server's harness runs in `ci-server.yml:81` with no compile, and the shell scripts run on three OSes without Node or .NET as a prerequisite: there is a THIRD, shell helper. **2026-11-01:** the Node helper is a wrapper over the mount; the mount must be fetched in three more jobs | D1 |
| N8 | helper, guard, proof | no owner claim and no start-of-run sweep (rule §2–§4), which every repository that creates a kind must wire; and bash on Windows must write the WINDOWS pid (`/proc/$$/winpid`) or every Node, C# and janitor reader misjudges it | D3, D4 |
| N9 | "a C# helper (the server tests)" | five xUnit projects make temp paths, not one; four run on three OSes. One helper, linked by the existing `Support/` precedent | D1, S3 |
| N10 | (nothing) | the WSL harnesses' Linux run folders are never deleted, by a machine rule after the 2026-10-07 incident (`wslRun.cjs:18-22`) | out of scope, recorded; no deletion inside WSL is added |
| N11 | (for the contract) | rule §3's `<pid>` for a CI job. **Settled:** the detail names the runner worker (`$PPID`) for a resource that outlives its step (R:112-116) | D5 |
| N12 | (for the contract) | rule §7's `docker-name` class. **Settled:** R:261 names `docker compose -p`/`--project-name`/`COMPOSE_PROJECT_NAME` | S4 (acme) |
| N13 | (for E3, whose helper S3 copies) | two things E3's helper lacks and creds needs: a socket root other than the temp root (macOS's `TMPDIR` is too long for a 103-byte socket path, so creds binds under `/tmp`), which the sweep must then also scan; and an existing per-repository mini-helper to WIDEN rather than replace (`HostProcess.TempDirectory`/`Remove`, 14 callers). **2026-11-01:** E3's "what the other epics take" table carries neither; built here in files of their own (`OwnedCreds.cs`, `LeftoversSocketRootSweepFixture.cs`) so the copied files stay byte-identical | S3; E3 may want a `SocketRoot` row in its table |
| N14 | (for the contract's guard) the `node` profile is "a Node consumer's tests and scripts, wherever they sit" | its discovery (G:174-209) reads tracked `*.test.*`/`*.spec.*` files anywhere and every text file under the ROOT folders `scripts/`, `test/`, `tests/` — not `src_vs_code/scripts/`, `src_minimalapi_server/scripts/`, nor `src/test/*.ts` helpers that are not `*.test.ts` (`vpnWorld.ts`, `sshAgentWorld.ts`), nor `.cs`. Measured on `47724fd`: 62 findings, none in those places | D7: the C# guard copy with this repository's discovery covers them. No profile change is asked; the family may want a `--scan <glob>` some day |
| N15 | (for the contract's guard) | `src_vs_code/src/test/commandParse.test.ts:40` is a `docker-name` finding for a quoted image name inside a parser fixture string (no container is built) — a false positive the exemption grammar covers | D7 exemption |
| N16 | (for the parent's E2 entry) | six legacy-name producers (`testsToDelete-agent-`, `-ait-`, `-sshd-`) entered `main` with the SSH work after the October split; none is owner-form, none sweeps | Facts; S2 migrates them; D4 lists them |
| N17 | (for E3) | `LeftoversGuardFiles.cs` and the `HelperFile`/`HelperFolder` constants of `LeftoversGuard.cs` are mcp's layout (`tests/`, `src/`, `.github/scripts/`, `http/`); a copy rewrites them — so "every file but `OwnedToken.cs` copied byte-identical" holds for the helper and not for the guard's discovery | D1, D7; E3's table may say so |
| N18 | (for E3) | the carve-out is not recognised by E3's guard; a copy in a repository with a CI container excludes that workflow by name and lets the shipped Node guard judge it, rather than growing a carve-out reader in C# | D7 |
| N19 | (for the parent) | the Node wrapper keeps the reference's Windows kernel-owner check (profile only; F16 open) while the C# copy checks the SID too: on one Windows machine the two helpers of this repository judge differently. Resolved by the parent's F16 (b) (2026-11-01): the Node sweep only lists on Windows, the C# one collects; closed for good by F16's Fix | D3 |

## Epics

Five epics, E = 5, so the cornerstone quota is Q = ⌈2·5/5⌉ = 2 (`common/subagent-models.md`). Split by Fable on
2026-11-01 after the question consultant (`9d8564bb`; the second consult precedes E2.4). One epic per complete resource
lifecycle, in the order what leaks most and what the next epic needs: the Node unit suite (the biggest leak, the wrapper
every later Node story uses), the Node harnesses, the five C# executables, the shell/Docker/acme side, then the
whole-repository guards. Each epic: its own branch from the previous epic's merge commit, one pull request, one
`mcp__coai__review_plan` round on its section here, one `mcp__coai__review_code` round, an Opus review (D8). Every story:
brief and scenarios by Opus, code by Sonnet, review by Opus — except the two cornerstones, whose spec is Fable's. The
detailed briefs are S2–S5 above; a story names the scenarios it owns.

**Cornerstones: 2 of 2 — E2.1.S2, E2.4.S1.**

### E2.1 — The Node unit-test lifecycle

- **Goal.** `npm test` creates only owned, claimed folders through the wrapper, removes them on every path, sweeps both
  roots at start, and fails a run that left something claimed with its own record — the first owner-form producer of
  this repository, with the barrier evidence (D8 (c), (d)) on its PR before it merges.
- **Scope.** S2 minus the harnesses: the wrapper, `run-tests.mjs`, the 30 unit files (`*.test.ts`, `vpnWorld.ts`,
  `sshAgentWorld.ts`), `ci-extension.yml`'s mount fetch, `module_tests.md`'s unit rows.
- **Depends on.** S1 (done); `9d8564bb`; the barrier record of the owner's Windows machine (merge, not build).
- **Done when.** S2 sc. 0–9 and 12 green, 10's unit half and 11 recorded; the shipped Node guard run on the branch head
  and its remaining findings (expected: the harness-free list — shell, docker, `commandParse`) recorded on the PR.
- **Stories.**
  - **E2.1.S1 — the wrapper and the mount** (Opus · Sonnet · Opus): sc. 0 (the `require(esm)` measurement),
    `leftovers.cjs` + `leftovers.d.cts` with `ownedFor`, `shortSocketRoot`, `ownedFile`, `writeStub`, fail-closed
    loading; the submodule step in `ci-extension.yml`. Owns sc. 1, 2, 3, 7, 9, 12.
  - **E2.1.S2 — the runner: record, both-root sweep, parent-only audit** — **CORNERSTONE, spec by Fable**, code by
    Sonnet, review by Opus. `TESTSTODELETE_RUN` exported to the children; `sweepLeftovers` over both roots in
    `runWithSweep`'s shape, never the exit code; the end-of-run audit by EXACT record after `node --test` returned,
    removal by `removeQuietly`, the verdict rule of D4; sweeping and auditing never conflated (D9 #1). Owns sc. 5, 6, 8.
    Why a cornerstone: it is the one place in the Node half where a wrong compare deletes a live sibling's folders, and
    the audit is this repository's own logic over the reference, not a copy.
  - **E2.1.S3 — the plain unit folders** (Opus · Sonnet · Opus): the sites of the facts that make a folder and hold no
    socket — `archiveDownload`, `agentUseActions`, `arrivalPin`, `brokerAbandoned`, `brokerEndpointSweep`, `cliEndpoint`,
    `configSnippet`, `connectionOptions`, `crossWindowWrites`, `dependencyChain`, `diagnosticLog`, `gitTransport`,
    `gitTransportSerial`, `hostKeyPin`, `hostKeyTrust`, `hygieneScan`, `keyInstaller`, `materializedKeys`, `pinClickPaths`,
    `sshDefaultProbe`, `sshExecRunner`, `sshUseActions`, `wslMcpCheckHost`, `vpnWorld.ts` and its 29 callers,
    `vpnGoneRequest` — the per-file patterns of S2. Owns sc. 4 and the unit half of sc. 10 (RED counted first).
  - **E2.1.S4 — the process and socket tests, the `*World.ts` helpers, the unit-side legacy names, macOS** (Opus ·
    Sonnet · Opus): `brokerListeners`, `brokerOriginDoor`, `requestLife`, `sshAgentServer` (`:71`, `:652`),
    `sshAgentWorld.ts:419-429` under `shortSocketRoot()`; the legacy `testsToDelete-agent-` sites gone; the by-hand
    macOS socket-length record. Owns sc. 11 and the guard evidence run of this epic.
- **Cornerstone area:** the audit (S2).

### E2.2 — The Node harness lifecycle

- **Goal.** `npm run itest:all` and every harness, the server's included, make only owned folders and stubs, remove
  them on every exit path, and the `itest:all` runner sweeps both roots at start with the run's record propagated — and
  NO harness-wide end audit, because a harness's children may still be ending (D4).
- **Scope.** S2's harness half: `run-itests.mjs`, the ten `scripts/*.cjs`, `backup-archive-itest.cjs`,
  `ci-server.yml`'s `build · test` mount fetch, `module_tests.md:130-146`.
- **Depends on.** E2.1 merged (the wrapper).
- **Done when.** The harness half of sc. 10 recorded (RED first: 8 leaking folders, 7 stubs, `backup-archive`'s three,
  the `ait`/`sshd` folders on a failing path); every CI harness step green with the mount; the guard evidence run recorded.
- **Stories.**
  - **E2.2.S1 — `run-itests.mjs`: record propagation and the both-root sweep, no audit** (Opus · Sonnet · Opus); the
    submodule step before `ci-server.yml:81`; the runner's scope sentence.
  - **E2.2.S2 — the extension harnesses' folders and stubs** (Opus · Sonnet · Opus): `agent-broker`, `creds-cli`,
    `creds-mcp`, `creds-mcp-wsl`, `git-transport`, `masked-run`, `server-transport`, `tree-perf-bench` — the
    module-level scope closed in `finally` AND `.catch`, every stub through `writeStub`, children handed `TMPDIR`/`TEMP`/`TMP`.
  - **E2.2.S3 — `ssh-agent-itest` and the server's backup harness, with the proofs** (Opus · Sonnet · Opus): the three
    legacy `ait`/`sshd` sites and the early exits (`:89`, `:757-759`); `backup-archive-itest.cjs`'s `tempDir(tag)`;
    sc. 10's harness half and the bench run; the guard evidence run.
- **Cornerstone area:** none.

### E2.3 — The C# lifecycle across the five executables

- **Goal.** E3's helper, with its Darwin path, runs in all five xUnit executables on Linux, Windows and macOS; every C#
  site is owned; each executable sweeps both roots at start and fails a run that left something it claimed.
- **Scope.** S3 whole, except `LeftoversRepositoryGuardTests` (E2.5).
- **Depends on.** E2.2 merged; E3 at `197cc76`.
- **Done when.** S3 sc. 1–6 green or recorded on the three legs; the C# guard's scan over the tree run by hand and its
  list recorded (shell and docker findings expected until E2.4); the hand clean-up of the C# old names recorded per machine.
- **Stories.**
  - **E2.3.S1 — copy the helper, link it, the CI prerequisites** (Opus · Sonnet · Opus): the files of D1, `OwnedToken.cs`,
    the four wildcard links, `AllowUnsafeBlocks` in the two projects, the mount fetch in `ci-clients.yml` and
    `ci-server.yml`, the macOS steps, the audit teeth on three OSes, `SweepRanTests`, the copy-is-the-copy test. Owns
    sc. 1, 3, 5, 6.
  - **E2.3.S2 — the socket-root extension and the registry-correct `HostProcess` adapter** (Opus · Sonnet · Opus):
    `OwnedCreds.ShortSocketRoot`, `LeftoversSocketRootSweepFixture` through the guarded entry points (D9 #9);
    `HostProcess.TempDirectory`/`Remove` keeping and disposing the `OwnedDir` (D9 #18). Owns sc. 2's `Remove` and
    second-root parts.
  - **E2.3.S3 — the client, process and socket sites** (Opus · Sonnet · Opus): `src_cli/tests` (`AgentRelayHostTests`,
    `AgentRelayConnectionTests`, `RelayLogTests`, `AgentRelayTests`, `RelayPipeEndingTests`), `src_mcp/tests`,
    `src_broker_client/tests` (`EndpointsTests`, `SessionTitleTests`), `src_service_defaults/tests` (`CredsLoggingTests`,
    `LogRootTests`), the 14 `HostProcess` callers; the socket lengths asserted on Linux and macOS.
  - **E2.3.S4 — the server factories, `VaultServer` and the store tests** (Opus · Sonnet · Opus): the seven private
    `TempDir()`/`NewDir()`/`NewPath()` and the ctor-made dirs of the `Org*`, `Startup*`, `LoggingSink`, `LoginKeyStore`,
    `ShareMaintenance` classes; `VaultServer.cs:45` without the shared parent; the dispose order of the live-host tests.
  - **E2.3.S5 — the backup sites and the AOT kit, with the proofs** (Opus · Sonnet · Opus): `BackupArchiveCommandTests`
    (the per-run kit, `CREDS_AOT_KIT_DIR`), `BackupArchiveTests`, `BackupKeyFileTests`, `BackupRunnerTests`,
    `BackupStoreTests`; sc. 2's counts and sc. 4; the hand-run guard list.
- **Cornerstone area:** none (the helper is a copy; what is new here is thin and behind E3's guards).

### E2.4 — Shell, the Docker smoke, acme

- **Goal.** Every CI/test shell script, the image smoke and the acme probe name, claim and remove their scratch in the
  owner form; a failed smoke stays failed and never publishes; acme's project, labels, state and teardown are one.
- **Scope.** S4 whole.
- **Depends on.** E2.3 merged; the second consultation (once per three epics; before this group).
- **Done when.** S4 sc. 1–7 green or recorded; the guard evidence run shows only `commandParse.test.ts:40` and the
  product scripts (the exemptions of E2.5).
- **Stories.**
  - **E2.4.S1 — `owned.sh`, claim-first, and its self-test** — **CORNERSTONE, spec by Fable**, code by Sonnet, review by
    Opus. The helper of S4's block (claim → register → create, no `mktemp`, the trap check, `OWNED_KEEP`, the Windows
    token through the reference, the Windows pid), `owned.test.sh` with the kill-between test, the `ci-clients.yml`
    self-test step. Owns sc. 3. Why a cornerstone: the only helper written from scratch in this repository, in the
    language with the fewest guarantees, carrying the round-2 finding and the Windows subtleties the other helpers get
    from the reference.
  - **E2.4.S2 — the shell scripts** (Opus · Sonnet · Opus): the two smoke self-tests, `start-server-and-wait.{sh,test.sh}`,
    `restore-archive-itest.sh`'s nine worlds, the two smoke scripts off CI; shellcheck. Owns sc. 4.
  - **E2.4.S3 — the Docker smoke carve-out** (Opus · Sonnet · Opus): the names, labels, the runner-worker record, ONE
    always-run remover; the throwaway-branch failure evidence (FAILED and `Publish` skipped) and the happy path. Owns
    sc. 1, 2.
  - **E2.4.S4 — acme: project identity, labels, state and teardown together** (Opus · Sonnet · Opus): D6 whole — the
    owned project and state, the top-of-script trap, the janitor `--token creds` sweep, the kill and interrupt cases,
    `.gitignore`, `deploy/README.md`, `architecture.md:363`. Owns sc. 5, 6, 7.
- **Cornerstone area:** the bash helper (S4).

### E2.5 — Repository-wide enforcement

- **Goal.** Both whole-tree guards are on and green on three OS legs and in the required `docs.yml` job; every remaining
  finding is a real exemption with a reason; the barrier rescan is clean; the docs and the records are complete.
- **Scope.** S5 whole, plus the parts of S3 deferred here.
- **Depends on.** E2.1–E2.4 merged.
- **Done when.** S5 sc. 1–6; `plan-lifecycle.mjs` clean; this document's status line reads `E2 shipped, <date>; promotes
  with its parent`.
- **Stories.**
  - **E2.5.S1 — the C# guard's creds discovery and its tests** (Opus · Sonnet · Opus): `LeftoversGuardFiles.cs` for this
    tree, the two path constants, the `docker.yml` exclusion and the wrapper's folding allowance pinned,
    `LeftoversRepositoryGuardTests` over a clean tree, `LeftoversGuardCredsTests`. Owns sc. 2, 3, 5.
  - **E2.5.S2 — the inline exemptions, the shipped Node guard in `docs.yml`, the token checks, the break-its** (Opus ·
    Sonnet · Opus): `npm ci --ignore-scripts --prefix .claude/rules/shared` + `leftovers-check.mjs --profile node` as a
    required step; the exemptions of D7; sc. 1, 4, 6.
  - **E2.5.S3 — the final barrier rescan, the docs and the completion records** (Opus · Sonnet · Opus):
    `sweeper-scan.mjs` on the PR head; `module_tests.md`, `architecture.md:366`, `CLAUDE.md`; the merge-condition
    records collected from the five PRs; the status line and the README row.
- **Cornerstone area:** none.

### Dependencies and order

E2.1 → E2.2 → E2.3 → E2.4 → E2.5, strictly: each branch is cut from the previous merge commit, so the wrapper (E2.1) is
there for the harnesses (E2.2), the C# copy (E2.3) sees the Node side clean, the shell helper (E2.4) is the last
producer, and the guards (E2.5) switch on over a clean tree. The barrier evidence (D8 (c), (d)) is on E2.1's PR before
it merges; the shipped Node guard's remaining findings are recorded after each of E2.1–E2.4 and must only shrink.
