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
>
> **E2.1 started 2026-11-02** on `feat/test-leftovers-e2.1` from `main` `66056a6`, which pins release **`5863c60`** (#292: F16 interim —
> the reference sweep only LISTS on Windows; F21 — the identity and exclusive-move helpers exported; the `raw-temp` baseline rule).
> The refinements of E2.1–E2.3 made as the epic starts are marked `[E2.1 plan gate n]` (coai session `156fd570`) and
> `[cadence e2d20eab n]` (the consult for epics 1–3), and listed in § *Plan-gate round 3 and the cadence consult*.
>
> **Revised 2026-11-05 for the parent's epochs 6 and 7** (§ *Revision for the rollout's epochs 6 and 7*, below). E2.1's code does not change. No epic moves.

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

## Revision for the rollout's epochs 6 and 7 (2026-11-05)

The parent's § *Epoch 6* item 8.3 and § *Epoch 7* item 8.3 (`dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md`) say what this document must say. The owner approved both epochs. This section lists each point and where it now stands. Where an older line says otherwise, the line is marked and this section wins.

| # | The parent's point | What this document now says | Where |
|---|---|---|---|
| 1 | The shipped Node guard does NOT read split spellings (F30) | D9 row 2 is corrected. The C# guard's copied folded reading holds for `.cs`. For `.cjs`, `.mjs` and `.sh`, the claim is zero WHOLE literals, F30 open | D9 row 2; S5 sc. 2; § *Test plan* |
| 2 | S5 sc. 2's `.cjs` and `.sh` plants cannot be findings | They become the positive test of what the shipped guard detects (a whole legacy literal and, on the lines F30 names, a bare-word glob), plus the one sentence below in E2.5's PR. No row asserts that a split spelling is NOT found, because that row would go red the day F30 ships | S5 sc. 2 |
| 3 | The DoD's "byte copy save the five named files" | The copy is an ADAPTED copy: a pinned manifest, permitted transformations per file, and a diff check that fails on one unexplained byte (the parent's entry 3.1). coai's `template-manifest.json` and `TheAdaptedCopyTests` are the working shape. D1's C# row and § *What changed*'s "byte-identical" are read with this | DoD; S3 sc. 5; E2.3 |
| 4 | F29 | E2.3 reads F29 (the Windows mutex op on the template's text) before it copies | E2.3 |
| 5 | S4's bash scripts set their trap before any fallible step, with a RED test | `mcp-listen-smoke.test.sh:19` and `version-smoke.test.sh:14` have `rm -rf` and no trap today. Each script in S4 sets its trap before its first fallible step. Its RED is a stubbed failure before the old trap's position, with the premise asserted. A kill stays unsolved, and the brief says so | S4; E2.4 |
| 6 | E2.5's `docs.yml` guard step | The step's name or comment says "zero whole literals, F30 open" until F30 ships. **F30 has a deadline of 2026-11-19, and it must ship or be re-decided before E2.5 merges** | E2.5 |
| 7 | Each E2.2 to E2.5 brief opens with the parent's table | S2 to S5 in this document are not those briefs, and they hold no such table. Each epic's Opus brief is written when that epic starts, and the author fills the table before the epic's plan gate: each condition, implementation by file, invocations covered, an executable check. An unmapped row is a design decision before the plan gate | each epic's brief |
| 8 | Each row also says what its check prepares or substitutes (§ *Epoch 7* item 8.1) | The table has that column: what the check prepares, and what real-run behaviour it therefore does not prove. For a row that reads ownership, one resource made the natural way is traced through the reader before the row is approved | each epic's brief |
| 9 | The audit's order (E5's 4.4) | E2.1 and E2.2: the audit runs in the PARENT after `node --test` returns (D9 row 1), so a run folder cannot end first, and E5's question does not arise in that form. E2.3: the brief checks the order on its own tree, because coai's fault was a run folder the fixture disposed first. If a creds suite has no run folder, the brief says so; if it gains one, it plants an orphan claim and shows the RED | D9 row 1; E2.3 |
| 10 | The elevated Windows exception (§ *Epoch 7*) | The goal's exception below. The Windows handoff proof of E2.3.S2 keeps its fixture and says what it does not prove. **Before E2.3 starts, F31 is raised with the owner: it is reviewed, and either fixed or accepted again, at the first of E2.3's start, a persistent Windows machine, or 2026-12-05** | § *Goal*; D3; E2.3 |
| 11 | Any test in the copy that says "collected" on Windows | It re-owns its fixture first, and its row in the table says so | E2.3 |

*[2026-11-07: F30 shipped in conventions release `37b9aa5` (promoted 2026-11-06), and this repository pins it (#306). Rows 1 and 6 now read "zero for the guard's listed spellings", not "zero whole literals, F30 open". The guard at that release, run over main at `85b5a67` (`--profile node --token creds`): **0 `legacy-name` findings**; 16 other findings, the same as at `834c91b` (9 `raw-temp`, 5 `docker-name`, 2 `docker-run`), which belong to E2.2–E2.5. Row 6's deadline is met.]*

**The one sentence for E2.5's PR, from E5's:** "The shipped Node guard finds a whole legacy literal and, on the lines F30 names, a bare-word glob or an anchored regex over the word; it does not find a word split over `+`, `.concat`, `.join('')`, a template hole, a `\u` or `\x` escape, a one-character class or half of the word; the count depends on the line (F30's note), so this repository's zero for `legacy-name` and `owner-blind` is zero WHOLE literals, F30 open."
*[2026-11-07: F30 shipped in conventions release `37b9aa5`, so this sentence is out of date and E2.5 must not copy it. Its end, "zero WHOLE literals, F30 open", now reads "zero for the guard's listed spellings". Its list of what the guard does not find is mostly no longer true: the guard now reads the joins, decodings and crossing pieces that table D2 of conventions `todo/PLAN_F30_folding_reader.md` lists, by file kind. E2.5 writes its sentence from D2 at its own pin, with what D2 says is not joined.]*

**Prerequisites for E2.1's merge:** condition (c), the owner's administrator scan on the WSL machine, is still open. The parent's § *Epoch 6* row "E2.1" records that E2.1 is built and waits for it.
*[2026-11-06: met. The owner ran the scan (none found, 266 files read; conventions #136), and E2.1 merged as #294 at `834c91b`.]*

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

**One bounded exception (the owner, the parent's epoch 7, 2026-11-05; F31).** What a run in an ELEVATED Windows process leaves, because it was killed or could not remove it at its normal end, is owned by `BUILTIN\Administrators` and reads as a stranger's under rule §4's two keys. No sweep removes it, and the audit names it only if it is in the registry. It waits for a person. No rule key is weakened to change this. In that state the audit's claim scan sees nothing, on every Windows CI leg, so a statement that the audit found no leak holds for the claim half on Linux and macOS only. A process that is not elevated is not affected, and no CI leg runs in that state.

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
  `115bbf8` (#287), to `105d53c` (#289, `47724fd`) and, on 2026-11-02, to `5863c60` (#292, `66056a6`): F16 interim (on `win32` the
  reference sweep sets `mutate` false and lists `unverified: <path> — the owner SID is not read on Windows (F16)` instead of
  removing, `leftovers-sweep.mjs:29-30`, `:364`, `:636`; the detail says so at R:203), F21 (the identity and exclusive-move
  helpers exported with io and platform seams, for a consumer to import — the wrapper imports, never copies), and the
  `raw-temp` baseline (R:275-277, `common/test-leftovers-baseline.md`, `leftovers-check.mjs --baseline`) — released now; E2
  does not adopt it: the evidence lists of D8 must reach zero in E2.5, and a baseline is E2.5's gate's call, not a default.
  `pin-check` is green on `main`.

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
`backup-store`, `cvbk-download-` → `download`); the whole name ≤ 63 characters, so `<what>` ≤ 63 − 14 − 11 − 7 − 1 − 6 = 24 for a 6-character `<id>` and 22 for the 8-character bash `<id>` (`-creds-` is 7; CodeRabbit on #253)
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
Windows machine is recorded, not resolved here: the Node side is as strict as the reference, no stricter — and since
`5863c60` the reference **removes nothing on Windows**: it lists `unverified:` and leaves everything (F16 interim). So on
Windows, E2.1 and E2.2 do NOT collect a killed run's folders; "the next Node run collects it" is false there until F16
closes. What collects them is the C# sweep of E2.3 (both keys, profile AND owner SID) or the janitor once armed — a
cross-language handoff that E2.3.S2 proves `[cadence e2d20eab 2]`. **For a run in an elevated process, only a person collects them: § *Goal*'s exception (the parent's epoch 7). E2.3.S2's proof makes the entry the user's first, so it proves the handoff for a run that is not elevated.**

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
  `run-tests.mjs` reads both roots and lists every owner-form folder and orphan claim whose record is EXACTLY **the
  record it exported to its children as `TESTSTODELETE_RUN`** — held once as a string at export time and compared as
  that string, never recomputed from `thisOwner()` afterwards `[E2.1 plan gate 0]` — and whose folder and claim pass
  `isMine`; each is removed with `removeQuietly` (exact name, five tries, one warning on giving up) and the suite's
  verdict becomes 1 with `run-tests: this run left <n> folder(s) it claimed — a test made scratch outside a scope: <paths>`
  when the suite itself passed. A folder claimed by any other record — a concurrent `npm test` (another pid, another
  start), a harness, a C# run — is never touched and never counted. **The audit removes only after the run has PROVED
  its whole process tree ended** `[cadence e2d20eab 1]`: the runner starts `node --test` in its own process group (POSIX;
  `detached: true` and a negative-pid signal reach the group) or job object (Windows), and on the coordinator's exit or on
  the timeout kills the WHOLE tree (POSIX `process.kill(-pgid, 'SIGKILL')`; Windows `taskkill /T /F /PID`), then confirms
  no descendant is alive (POSIX: a second group signal answers `ESRCH`; Windows: `tasklist` filtered by the group's
  pids answers none) before any removal. If the tree cannot be confirmed ended, the audit LISTS, fails the run with the
  same line and `(not removed: <n> descendant(s) still alive)`, and removes nothing — a later start-of-run sweep judges
  those folders by the record's liveness, as any other. Why: `spawnSync` (`run-tests.mjs:35`) waits only for the
  coordinator, and a test's surviving grandchild keeps using folders claimed under the run's record; an audit that
  removed them would remove them in use (and a later sweep, once the runner is dead, likewise). (The run-marker folder
  of October's sc. 8/8a is gone: the record IS the marker.) `run-itests.mjs` gains the sweep only (no audit: a harness's children may still be ending).
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
the janitor, does. The runners' headers and `module_tests.md` say so in one sentence each. **On Windows the Node
sweeps collect nothing** (F16 interim at `5863c60`: `unverified:` listing only); there the collector is the C# sweep of
the five executables (E2.3) or the janitor once armed — the handoff E2.3.S2 proves `[cadence e2d20eab 2]`.

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
| 2 | a guard that reads only whole literals is fooled by split, escaped or concatenated spellings (E3 fix C; E4 item 26) | the copied `LeftoversGuardLiterals.cs` (the folded reading), for `.cs`. ~~the shipped Node guard reads the same way~~ **It does not: it reads whole literals only (F30; § *Revision* rows 1 and 2)** | S5 sc. 2: a planted `"testsTo" + "Delete-"` in a `.cs` is a finding; ~~a `.cjs` and a `.sh`~~ for those, the positive test of what the shipped guard detects |
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
so every test-file process claims with the runner's record — the exported string is kept in one variable, and (3) and
the audit compare against THAT string `[E2.1 plan gate 0]`; (3) **the process-tree completion policy** `[cadence
e2d20eab 1]`: `node --test` is started in its own process group / job object; on exit or on a timeout the whole tree is
killed and its end confirmed (D4); (4) after that, the **end-of-run audit** of D4: every depth-1 owner-form entry of both
roots whose claim text equals the exported record (`readOwner`, then string equality, after `isMine`) and every such
orphan claim is listed and — only with the tree confirmed ended — removed with `removeQuietly`; a non-empty list turns a
passing suite's exit into 1 with the line of D4; a failing suite keeps its own code and the list is printed; any other
record is untouched and uncounted; an unconfirmed tree lists, fails and removes nothing. `run-itests.mjs` gains (1), (2)
and the tree kill of (3) on its timeout (`run-itests.mjs:132` kills only the direct child today `[cadence e2d20eab 1]`),
but no audit. Each runner's header carries the scope sentence of D4 (a direct `node --test <file>` removes its own
scratch but does not sweep) and the Windows sentence (no collection by Node until F16 closes).

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
   removes both — **on Linux and macOS**. **On Windows** `[cadence e2d20eab 2]` the same call lists
   `unverified: <path> — the owner SID is not read on Windows (F16)` and leaves folder and claim untouched (`removed` empty);
   the test asserts that listing and that both still exist, and nothing else. Never the REAL probe on the dead child's
   pid (`unmatchable-pid.mjs`).
6. **`shortSocketRoot()` and the second root** — on Linux and macOS it is `/tmp`, on Windows `tempRoot()`; given a
   private PAIR of roots, a dead-claimed `testsToDelete-<owner>-creds-sock-abc123` in the SECOND root → removed by the
   runner's two-root sweep (seam for `tmp`) on Linux and macOS; on Windows the two roots are one (`tempRoot()`), the
   sweep runs once and lists `unverified:` `[cadence e2d20eab 2]`.
7. **`ownedFile` and `writeStub`** — the file sits inside an owned folder of the right name; two stubs of two scopes are
   two files; the scope's close removes the folder and the claim.
8. **The runner sweeps, audits, and never lets either change a passing verdict wrongly** (`leftoversRunner.test.ts`,
   seams for `spawn`, `sweep`, the two roots and the record): a sweep that throws → one line, the suite's code; the child
   environment holds `TESTSTODELETE_RUN` equal to `formatOwner(thisOwner())`; a suite that passed and left a folder claimed
   with THIS runner's record → exit 1 naming it, and the folder removed; a folder claimed with another LIVE record (this
   test's own pid with a different start, or `unmatchablePid()` — premise asserted) → not counted, not touched (D9 #1,
   RED first: an audit that compares the owner segment alone removes it); a folder with no claim (unmarked) → listed,
   never touched; a suite that failed → its own code, unchanged, the list printed.
8b. **The audit matches the EXPORTED record, not a recomputed one** `[E2.1 plan gate 0]` — through the spawn seam a
   child `node -e` with its OWN pid (a different process) loads the wrapper with `TESTSTODELETE_RUN` set to the string the
   runner exported, makes one `ownedDir` in the private root and exits without closing its scope; the folder's claim is
   the exported record (the child's pid appears nowhere in it); the parent's audit finds exactly that folder, removes it
   (tree confirmed ended) and exits 1 naming it. RED first: an audit that compares against `formatOwner(thisOwner())`
   recomputed at audit time passes this (the strings happen to agree) — so the RED is made with an exported record whose
   `<start>` is deliberately one second off the live one (`TESTSTODELETE_RUN` given to the runner by the test, as a user
   may): the recomputed compare finds nothing, the exported-string compare finds the folder.
8c. **The kill path: a surviving descendant is ended before any removal, or nothing is removed** `[cadence e2d20eab 1]`
   (run on Linux AND on the Windows CI leg of `ci-extension.yml`'s matrix — this story adds a `windows-latest` entry for
   this one test file, since the extension job is ubuntu-only): a real `node --test` over ONE fixture test file; that file
   starts a long-lived child (`node -e 'setInterval(() => {}, 1000)'`, `stdio: 'ignore'`, `detached: false`), prints the
   child's pid on its own line, makes an `ownedDir` under the exported record and kills ITSELF with `SIGKILL` (Windows:
   `process.exit` is not enough — `TerminateProcess` on itself) so the child outlives it. After `runTests` returns: the
   printed pid is not alive (`process.kill(pid, 0)` throws `ESRCH`; Windows `tasklist /FI "PID eq <pid>"` answers none),
   the folder was removed, and the exit is 1 with the audit's line. The refusal path, through the confirmation seam: with
   the seam answering "one descendant alive" the folder is LISTED, not removed, the exit is 1 with `(not removed: 1
   descendant(s) still alive)`, and the folder and its claim still exist. RED first: against the `spawnSync`-only runner
   the child is alive after `runTests` returns (observed on Linux and Windows).
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
| `AgentRelayTests.cs:110-122` (`AFileNobodyIsServingIsStale`, the corpse test that already recorded a 105-character macOS failure) | `Path.Combine(_owned.Dir("corpse", OwnedCreds.ShortSocketRoot), "c.sock")` — under the SHORT socket root, never the temp root `[cadence e2d20eab 3]`; the `:122` length assertion kept, and the full path's **UTF-8 byte length** (`Encoding.UTF8.GetByteCount(path)`, not `path.Length`) asserted ≤ `AgentRelay.MaxSocketPathBytes`, computed for the macOS runner's real roots too: `/tmp/testsToDelete-u501-creds-corpse-abc123/c.sock` is 51 bytes; under `$TMPDIR` (`/var/folders/xx/<30 chars>/T/`, ~49) it would be ~95 — the `/tmp` root is what keeps the margin |
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
5. **The copy is the copy** (**revised, § *Revision* row 3: the check is a pinned manifest with the permitted transformations of each file, and it fails on one unexplained byte, backward and forward, as coai's `TheAdaptedCopyTests` does; the text up to "And D9 #1" is the first form, superseded, and the D9 #1 sentence stands**) — a test reads every file of `Support/Leftovers/` whose name is not in the pinned list
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
                         # the trap it checks is the caller's. Validates what (non-empty, no / \ control, no leading -, ≤ 22 for the 8-hex id). Then, in
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
   `src_cli/tests/X.cs` ⇒ 1; `"testsTo" + "Delete-"` in a `.cs` ⇒ 1 `legacy-name`/`owner-blind`
   (D9 #2; **revised, § *Revision* row 2:** a whole legacy literal in a `.cjs` and in a `.sh` ⇒ 1 each through the shipped guard, and no row asserts that a split spelling is not found); `Owned.Prefix` referenced from `src_mcp/tests/X.cs` ⇒ 1 `owner-blind` (D9 #14); `docker compose -p
   cred-vault-acme-test up` in `deploy/acme-test/run.sh` ⇒ 1 `docker-name`, with `-p teststodelete-${OWNER}-creds-acme-$id`
   ⇒ 0; `.github/workflows/docker.yml` ⇒ no docker finding from the C# guard (the pinned exclusion) — and, for the shipped
   Node guard (no new tests here: its own suite covers the classes), three facts pinned by running it over fixture
   workflows in `leftoversGuardFixtures.test.ts`: the D5 remover AFTER the reader ⇒ 0; the remover BEFORE the `docker
   logs` step ⇒ 1 `docker-run`; `"$OWNER"` right after the prefix in the remover ⇒ `owner-blind`, `${OWNER}` ⇒ 0.
3. **A scan of nothing is red** — the C# guard over an empty folder ⇒ `FilesScanned == 0` and the one sentence (copied
   test); the shipped guard with `--repo <empty git repository>` ⇒ exit 2 — an AUTOMATED fixture test, not a one-time
   observation `[E2.1 plan gate 2]`: a step of the required `docs.yml` job makes an empty `git init` repository under an
   owned folder, runs `leftovers-check.mjs --repo <it> --profile node --token creds --identity …`, and asserts exit 2 and
   the sentence `scanned nothing under … — discovery broke; the repository is not clean` on stderr.
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
| (wave 1) split, escaped or concatenated spellings are findings in `.cs` — RED-GREEN-RED (**scripts: whole literals only, F30; § *Revision* row 1**) | S5 sc. 2, through the copied folded reading; reverting `LeftoversGuardLiterals.cs` to a whole-literal read turns it RED again (by hand, recorded) |
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
- [ ] E3's helper is ~~a byte copy save the five named files~~ **an adapted copy with a pinned manifest and a diff check (§ *Revision* row 3)**, with its Darwin path, green on Linux, Windows and macOS, **read with § *Goal*'s elevated Windows exception**;
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

## Plan-gate round 3 and the cadence consult (2026-11-02, E2.1 starting)

The E2.1 plan gate, coai session `156fd570`, on this document's E2.1 section. Accepted and applied, each marked
`[E2.1 plan gate n]` where it lands:

- **[0]** the end-of-run audit matches the EXACT record the runner exported to its children (`TESTSTODELETE_RUN`, held
  as the exported string), never a `formatOwner(thisOwner())` recomputed at audit time — D4, S2 runners, sc. 8b (a
  child with a different pid leaks one folder under the exported record; the parent's audit finds it), E2.1.S2.
- **[2]** E2.5.S2 adds an automated fixture test that runs the shipped Node guard on an empty git repository in the
  required `docs.yml` job and asserts exit 2 and its sentence — S5 sc. 3, E2.5.S2.
- **Rejected** (reason recorded): a finding against D5's runner-worker record (`$PPID` of the step's shell as the
  smoke's owner pid) — hosted runners discard the VM at job end, so the record's pid never outlives the job; D5 stands as
  the contract's wording (R:112-116) and nothing changes.

The cadence consult for epics 1–3, `e2d20eab`; all three points verified in the code before adoption, each marked
`[cadence e2d20eab n]` where it lands:

1. **A destructive audit is unsafe until the run proves its tree ended.** Verified: `run-tests.mjs:35` is `spawnSync`
   on the `node --test` coordinator alone; `run-itests.mjs:132` `child.kill()` ends only the direct child. Applied: the
   process-tree completion policy (own process group / job object, whole-tree kill on exit or timeout, the end confirmed
   before any removal, else list-and-fail) — D4, S2 runners, sc. 8c (the kill path on Linux and Windows CI), E2.1.S2,
   E2.2.S1.
2. **Windows: the reference sweep now only lists** (F16 interim at `5863c60`, `leftovers-sweep.mjs:636`). Applied: sc. 5
   and 6 expect `unverified:` and untouched on Windows; D3, D4 and the runners' headers say plainly that E2.1/E2.2 do not
   collect on Windows; the cross-language handoff proof (a Node-owned folder, owner gone, clock past ten minutes → Node
   preserves, the copied C# sweep collects under both keys; plus the SID-refusal case) is E2.3.S2's.
3. **The corpse test** (`src_cli/tests/AgentRelayTests.cs:110-118`, a recorded macOS length failure) was routed to
   `_owned.Dir("corpse")` under the temp root. Applied: `OwnedCreds.ShortSocketRoot`, the full path's UTF-8 byte length
   computed for the macOS runner's roots, in E2.3.S3's socket proof — S3's table, E2.3.S3.

## E2.1 build record (2026-11-02, branch `feat/test-leftovers-e2.1`, not pushed, not merged)

Built by a Sonnet coder from the E2.1 section above, story by story, tests first, each RED watched again with the code
stashed. Commits, oldest first (S1 `5d7bfb3` test, `800d6e4` code; S2 `bbd9834` test, `141a5cd` code; S3 `6a8a7bf` test,
`0c82386` code; S4 `fee779f` test, `bfb07e5` code; `789cb75` the scan test's samples; this record). Suite: **5938 tests
before, 5969 after, 0 failed**; `npm run typecheck`, `npm run lint` clean.

**A blocker, found by measurement, recorded not resolved in code (D8: where the released text differs from what is cited
here, stop and report).** D1 and S2 say the wrapper re-exports `sweepLeftovers` and the runner sweeps both roots with it.
It cannot serve `creds`: `leftovers-sweep.mjs:78` compares every name's token with the reference's OWN `REPO_TOKEN`
(`conventions`, from its `owned-token.mjs`), `ownedFor` does not bind the sweep, and `sweepLeftovers` has no `token`
parameter. Measured with a dead-claimed `creds` folder and a dead-claimed `conventions` folder in one private root and
`probe: () => ({ state: 'dead' })`: the sweep removed only the `conventions` one. So scenarios 5 and 6 (the sweep collects a
killed test's folder; the second root) are NOT written, and the runner's start sweep is wired through a `sweep` seam whose
default throws one clear line per root (so a missing sweep is never silent). Options, for the owner and the parent: (1) a
conventions follow-up (F22) that gives `sweepLeftovers` a `token` parameter (and `classifyName` consumers the same), taken by a
pin bump — the plan's own rule for "a behaviour the wrapper needs and the reference lacks"; (2) vendoring `owned.mjs` with its
own `owned-token.mjs`, the shape the reference's header offers, which D1 rejected; (3) a Node module-customization hook that
redirects the reference's `./owned-token.mjs` import to this repository's token — no copy, but it leans on loader internals
and was not tried. Until one is chosen nothing collects a killed `npm test`'s folders (the janitor still does).

**Deviations from the E2.1 text, each with its reason.**

| # | Plan said | Done | Why |
|---|---|---|---|
| 1 | the wrapper exports exactly D1's list | also exports `isMine`; does not export `sweepLeftovers` | the audit's kernel-owner key for a folder needs `isMine`; the sweep is the blocker above |
| 2 | `ownedName` limit test: 26 × `x` throws | the test derives the room from the caller's owner (`63 - len(prefix) - 1 - 6`) and checks room accepted, room + 1 refused | the reference budgets the owner first: under `u1000` 30 characters fit, 26 would not throw |
| 3 | sc. 3: the claim parses to `thisOwner()` | it equals `runRecord()` (the run's record under a runner, this process's otherwise) | under `npm test` every claim carries the exported `TESTSTODELETE_RUN`, by design |
| 4 | sc. 4: `await t.test('inner', …)` with its rejection caught | a real `node --test` fixture that fails, with `NODE_TEST_CONTEXT` cleared | a failing subtest fails its parent; a nested `node --test` that inherits `NODE_TEST_CONTEXT` reports to its parent and exits 0 |
| 5 | the runner has a timeout | `timeoutMs` is a seam, and since the gate (code 9/13) it DEFAULTS to 60 minutes, overridable by `RUN_TESTS_TIMEOUT_MS`; tested with 4 s and 40 ms | the old runner had none; the rule asks a ceiling on every launched process, and a suite that hangs for ever is the case it exists for |
| 6 | Windows: job object, `taskkill /T /F /PID`, `tasklist` by pids | the reference's `run(…, { containTree: true })` supervisor (a job with KILL_ON_JOB_CLOSE); the confirmation there is the job's own guarantee | a walk from a dead coordinator misses descendants whose parent died first — exactly sc. 8c's fixture; the reference already solves it. NOT run here: the `runner lifecycle · windows` job of `ci-extension.yml` is the first observation |
| 7 | the audit seam "the record" given as `TESTSTODELETE_RUN` by the test | the runner takes a `record` seam (default `formatOwner(thisOwner())`); an ambient `TESTSTODELETE_RUN` is ignored by the runner | a runner is the top of a run; the nested runner in a test must not export the outer one's record |
| 8 | `ci-extension.yml` fetches the mount | also the extension job of `release.yml`, which runs `npm test` before it publishes | found while editing: without the mount that job would fail |
| 9 | `module_tests.md:125-146` | a new section *What the unit suite leaves behind* before the harness table; the harness rows are E2.2's | the unit rows had no home; `localCpuBudget.test.ts` lost its `runTests(spawn)` case for `exitCodeOf` (the spawnSync-only runner is gone) |
| 10 | S3 owns sc. 4 and the leak count | a syntax-tree scan test (`leftoversSites.test.ts`, with its two companions) is the automated RED for S3 and S4, beside the by-hand count | a RED that a machine can repeat; the repository guards of E2.5 stay the whole-tree enforcement |

**Evidence.** Scenario 10, unit half (Linux/WSL, `TMPDIR` pointed at a private short folder): one `npm test` left **60**
old-name entries before (14 `creds-endpoint`, 11 `creds-conn`, 9 `creds-gitunit`, 6 `creds-log`, 5 `cvbk-download`, 4 `creds-sock`,
2 `creds-window-lock`, 2 `creds-sweep`, 1 each `creds-ro`, `creds-mask`, `creds-kh2`, `creds-kh`, `creds-gitserial`,
`creds-gitclone`, `creds-chain`), **4** after S3, **0** after S4, and no owner-form entry at any point. (A private `TMPDIR`
must stay short: the first attempt used a 120-character one and `brokerListeners.test.ts` hung on a socket path past
the OS limit — a measurement of D4's reason.) The shipped Node guard on this head: **16 findings** (62 on `47724fd`) —
9 `raw-temp` in shell (4 CI scripts, `restore-archive-itest.sh`, three product scripts, `install.sh` twice), 6 in `docker.yml`,
1 `commandParse.test.ts:40` — the expected harness-free list, all E2.4/E2.5's. `sweeper-scan.mjs --root .`: `none found
(1502 file(s) read) — the barrier is open for this scope`.

**Open before E2.1 may merge (D8 and the story text).** (a) the blocker above; (b) sc. 11, the by-hand macOS record (the
path computation is asserted on every OS; no macOS machine ran the five socket files); (c) the Windows by-hand `npm test`
count (56 expected), the `runner lifecycle · windows` leg's first green (sc. 8c's kill path on a real job object), and the
Windows RED the spec asks for ("observed on Linux and Windows"; only Linux was observed); (d) sc. 12 by hand
(a renamed `owned.mjs`) — the automated refusal tests cover the same line; (e) barrier conditions (c) and (d) of D8 for the
owner's Windows machine; (f) a `review_code` round and the Opus review.

**Notes on the list above, 2026-11-04** (text added; nothing above is changed; the records are build record part 7):
- (b) sc. 11, macOS: by the question consultants' decision (`867ea464`) a deliberately started, recorded run on GitHub's hosted runner satisfies the by-hand record. The job `macos-sockets` of the throwaway branch `tmp/e21-byhand` is that run; it is prepared, not yet run. Its result is a placeholder in part 7 until the operator fills it. OPEN until then.
- (c) the Windows count: the owner's Windows machine does not test creds or coai for now (the OWNER, 2026-11-04; `dew_flow_conventions · research/security/machines.md`), so no by-hand run happens there. The job `windows-unit` of the same branch is the recorded run on a hosted Windows runner. **Which count:** the plan's "56" is the number of old-name FOLDERS one `npm test` left on Windows before the migration, not a test count; the job compares the same count after the migration (expected 0) and prints the suite's total. The first green of the `runner lifecycle · windows` leg is already recorded (part 6, `[E2.1 win green]`). The Windows RED of S2 sc. 10 and of sc. 8c ("observed on Linux and Windows") is NOT produced by this branch and stays open; part 7 does not claim it. OPEN until the run result is filled.
- (d) sc. 12 by hand: DONE on WSL Linux, 2026-11-04 — `npm test` with `owned.mjs` renamed aside exited 1 with the one refusal line and ran no test (`[E2.1 byhand 3]`).
- (e) the barrier conditions (c) and (d) of D8: for the owner's Windows machine, (c) is "not tested — and it does not test creds" and (d) is "not cleaned, because the machine does not test creds" (both by the owner's statement of 2026-11-04, `[E2.1 byhand 1]`, `[E2.1 byhand 5]`). For the operator's WSL machine: (c) is NOT complete — machines.md (PR #124, 2026-11-04) records the barrier OPEN for every place the developer account can read, but root's user systemd folder and `/var/spool/cron/crontabs` were not read (no password-less `sudo`), so an administrator must run `sudo node tools/sweeper-scan.mjs --system` (exit 0, or each line resolved) — and (d) is done, with nothing to remove (`[E2.1 byhand 4]`).
- (a) and (f): unchanged by this part.

### E2.1 build record, part 2 — the code gate and the risk consult (2026-11-02)

The code gate (coai session `156fd570`) and the risk consult (`3d75f52c`) were applied as test commit `836e13b` (fourteen
scenarios red against the first runner) and the commit after it. Marks: `[E2.1 code n]` the gate's accepted findings, `[E2.1 risk n]`
the consult's verified points.

| Mark | Result |
|---|---|
| **[E2.1 code 1]** a descendant that calls `setsid` leaves the group | `findSurvivors` after the group is gone: every process carrying `TESTSTODELETE_RUN=<record>` in its environment on Linux (`/proc/<pid>/environ`), and the parent-pid chain from the root (`ps -A -o pid=,ppid=`) everywhere. Survivors are ended with SIGKILL and asked again; what is left keeps the audit at list-and-fail. Test: a grandchild started `detached`, `stdio: 'ignore'`, `unref()`, holding a claimed folder — at the deletion boundary the folder is removed only if the grandchild is dead, else kept and reported with exit 1 (red against the group-only runner: "the folder was removed while its grandchild was still alive"). **Not seen:** on macOS a session leader whose parent died is reparented to launchd and carries no marker `ps` reads cheaply — the chain walk from a dead root finds nothing. Open point for the macOS by-hand record. The env marker was chosen over the chain alone because a chain walk from a DEAD coordinator cannot reach reparented orphans |
| **[E2.1 code 3]** | `forwardSignals` installs a handler only for a positive safe-integer pid (a pid of `-5` would have signalled process 5); `wait()` removes both child listeners and the timer on every outcome |
| **[E2.1 code 4]** | `endTree` never throws: a failing confirmation, a failing survivor scan or an unreadable process table is `reason: 'unknown'` — "cannot confirm", list-and-fail, with its own line `(not removed: the end of the process tree could not be confirmed)` |
| **[E2.1 code 5]** | the poll backs off 50 ms doubling to 1 s and its last wait is cut to the bound, so the whole poll stays inside 5 s |
| **[E2.1 code 7]** | the Windows supervisor's captured output is bounded (8 MiB, `SUPERVISOR_MAX_OUTPUT_BYTES`); an overflow, which the reference answers by ending the run, is reported as an error. Windows half observed only on the CI leg |
| **[E2.1 code 9/13]** | a finite default timeout of 60 minutes; `RUN_TESTS_TIMEOUT_MS` and the `timeoutMs` seam override it (a bad value is refused naming the legal form); when it fires the runner says `reached its timeout of <n> ms — ending the whole process tree`, ends the tree, audits, and exits non-zero (124 when nothing else says so) |
| **[E2.1 code 10]** | no `as Owner` casts: `ownerWith(pid, start?)` builds a record with every field |
| **[E2.1 code 11]** | the temp-site scan discovers every `.ts` under the test tree and scans it; two explicit exclusions with reasons (`tempSiteScan.ts` itself, `fixtures/`); a companion checks the discovery finds the known files and that each exclusion is real |
| **[E2.1 code 0]** | the `sweepNotWired` stub goes when the real sweep is wired — see the wiring step below |
| rejected by the gate | 2, 6, 8 and 12 (12: a start-sweep error never changes the exit code, as in the family's runners) |
| **[E2.1 risk 2]** Windows | `confirmTreeEnded(undefined)` no longer succeeds: it answers `not ended, reason: 'no-handle'`, so on Windows the audit removes nothing; it lists and fails the run when something is claimed, and a passing suite with nothing claimed stays passing. **Follow-up for `dew_flow_conventions`:** a "job is empty" acknowledgment from the reference's supervisor (`process-job.ps1` / `proc.mjs`) — until then Windows never removes in the audit (the Windows kill-path test asserts the descendant is dead and the folder preserved) |
| **[E2.1 risk 3]** | `runWithAudit` refuses a second call while one is active in the process (a module-level guard, released in a `finally`): both would share `thisOwner()`'s cached record and audit each other's folders. **Recorded, and corrected in round 3 [E2.1 Opus 2]:** on Windows and macOS the record has no start time, so a dead earlier run whose pid was reused by THIS runner writes the SAME record text — "the audit runs only while this runner is alive" does not protect against that, because the dead run's folders match. Where the record has no start time the audit now keeps only claims whose file is at or after this runner's start (less two seconds) and lists the others as `unproven:`; later sweeps rely on the reference's own liveness rules |
| **[E2.1 risk 4]** | the wiring step — written now, built after F22's release and creds' pin bump (below) |

**The wiring step for F22 (built after the pin; not before).** When the pinned release carries `sweepLeftovers({ …, token })`:
(1) export from `leftovers.cjs` a `sweepLeftovers` that binds `token: REPO_TOKEN` and is otherwise the reference's, and add it
to `leftovers.d.cts` (the export-list test turns red until both agree); (2) in `run-tests.mjs` replace `sweepNotWired` as the
production default of the `sweep` seam with that function; keep the both-root dedup (`rootsOf`), the real repository path
(`REPO_ROOT`), the one-line report and the non-fatal failure (a start-sweep error never changes the exit code); delete
`sweepNotWired` and the line it prints; (3) integration tests with the REAL sweep in private roots (never the real temp
root): an aged gone-owner `creds` folder is collected on POSIX; a folder of a live or unknown owner survives; a folder of
another token survives; both roots are covered (a dead-claimed `…-creds-sock-…` in the second root is removed); on Windows
the sweep lists `unverified:` and removes nothing (F16). These are the plan's scenarios 5 and 6, written against the real
sweep at last. Added in round 3: **the pin bump to a release that CARRIES F22 comes first** (F22 is merged in the conventions
repository but not released at the time of writing); the wrapper loads `leftovers-sweep.mjs` with the same fail-closed check as
`owned.mjs` (no mount, no sweep); `token` is put AFTER the caller's options so a caller cannot override it; the runner's header
(its step 2 says "not wired yet") and `module_tests.md` (the *Not wired yet* bullet) are rewritten in the same change.

### E2.1 build record, part 3 — code round 2 (2026-11-02)

Tests `53e8a7a` and `76833a1`, code `59446a7`. Rejected by the gate: 2 (the reference sweep is synchronous) and 10 (not a finding).

| Mark | Result |
|---|---|
| **[E2.1 code2 0]** SECURITY | the kernel-owner key (`isMine`) is asked of the CLAIM file itself before anything is read from it, whether or not the folder is still there; another user's claim is listed `foreign:` and never read, removed or counted — an orphan claim and a claim beside our own folder, both tested through a `mine` seam (red against the first round's runner) |
| **[E2.1 code2 1]** | the marker is one whole NUL-separated environ entry compared for equality, in place. The first round's concatenated search was already exact (NUL on both sides), so the near-miss test (the record as a prefix of a longer value, or after a character) pins it; it was red only because the scan's answer changed shape |
| **[E2.1 code2 3]** | each root is canonicalised once with `realpathSync` and deduplicated (macOS `/tmp` → `/private/tmp`; a symlink to a root is one root); the audit names canonical paths. Tested with a symlinked private root on POSIX |
| **[E2.1 code2 4]** | an unreadable `/proc` (or process table) is `unverified` for that half of the scan, never a throw; the parent-pid chain still runs; anything unverified keeps list-and-fail. **Found on the way (a defect of the first round, not of the finding):** on a real machine `systemd --user` and `(sd-pam)` belong to the caller and their environment is unreadable, so every run would have been "cannot confirm"; and under churn a zombie or a process in the middle of an exec is unreadable for a moment (the new scenarios flaked with six files at once). An unreadable environment is now a doubt only for a process of ours that started after the runner did (dated with the reference's `processProbe`, which the wrapper now exports) and is not a zombie, after a few retries; processes older than the run cannot be its descendants |
| **[E2.1 code2 5]** | `startInJob` catches the supervised start: a rejection emits `error` on the job, so `wait()` always settles |
| **[E2.1 code2 6/11]** | one process table, one adjacency map and one `/proc` pass per scan; the scan runs ONCE after the group is gone and only the pids found are polled (a `pidAlive` seam); environ buffers are searched in place, never concatenated. A process forked by a survivor after the scan is not seen — the scan is by design once |
| **[E2.1 code2 7]** | the group poll is a bare `kill(-pgid, 0)`; `ps` runs only to count members for an answer that is not "ended" |
| **[E2.1 code2 8]** | a run that timed out exits 124 whatever the coordinator's own code or signal |
| **[E2.1 code2 9]** | `hygieneScan` takes `ScanReads` (the four reads it uses, `Pick<StorageManager, …>`); its test builds a typed factory with whole record shapes and secrets minted with `stored`, and the `as never` casts of the changed fixtures are gone (`mod: undefined as never`, a placeholder assigned after the stub loads, is not among them). A type-level change: no RED to watch |

### E2.1 build record, part 4 — code round 3 and the Opus review (2026-11-02)

Tests `7cd670e`, code `c2fd390`. Rejected by the gate: 2 (the two ownership checks are defence in depth) and 4 (the claim is
owner-checked before any read since round 2).

| Mark | Result |
|---|---|
| **[E2.1 Opus 1]** MAJOR, macOS | on any POSIX that is not Linux the survivor scan adds the fixed entry `no environment scan on this OS`, so the run lists and fails and never removes there (a detached grandchild reparented to launchd was invisible to the ppid walk and the audit would have removed a LIVE folder). Tested with platform `darwin` at the scan, `endTree` and runner levels; the setsid scenario is Linux-only with that reason. **Consequence, stated plainly:** on macOS the unit suite's audit removes nothing and fails a run that left a claimed folder, until a macOS-capable survivor scan exists. **Refined in part 8 (`[E2.1 review 7]`):** the sentence "the run lists and fails" is true only of a run that CLAIMED a folder; a run that claimed none leaves with the suite's own code |
| **[E2.1 Opus 2]** MAJOR | where the record has no start time, only claims at or after the runner's start (less two seconds) are this run's; older ones are listed `unproven:` and never removed. Tested on Linux through a start-less record seam. The run-tests header and risk 3 are corrected |
| **[E2.1 code3 9 + Opus 3]** | both `ps` calls have a 5 s ceiling and are killed with SIGKILL; a timeout is `unverified`. Every spawnSync/execFileSync of the tests (`leftoversRunner.test.ts`, `runnerWorld.ts` tasklist, `leftoversWrapper.test.ts` twice) has one. Tested with a fake `ps` that hangs |
| **[E2.1 Opus bound]** | a coordinator that survives SIGKILL is given up on after a second bound (30 s, a seam): list-and-fail, exit 124 |
| **[E2.1 code3 0]** | `candidates()` takes the same `mine` predicate as the sort |
| **[E2.1 code3 1]** | `endTree`'s `since` and `startOf` default inside `processTree.mjs` from the reference's `processProbe` |
| **[E2.1 code3 3/6]** | the environ retries are awaited pauses, never `Atomics.wait`; the scan is asynchronous |
| **[E2.1 code3 5]** | unverified causes are kept when known survivors remain |
| **[E2.1 code3 7]** | `/proc` entries are matched against the table `ps` gave before any stat or dating |
| **[E2.1 code3 8]** | the foreign line says it does not fail this run and names the owning uid |
| **[E2.1 code3 10]** | each survivor is bound to its start time and re-verified before it is signalled; the group is signalled and the chain walked only while the group still has members |
| **[E2.1 code3 11]** | ownership is checked before any retry of an unreadable environment |
| **[E2.1 code3 12]** | each parent's child list is built once and pushed to |
| **[E2.1 code4 1 + 6]** | `candidates()` is purely structural (owner-form folder names and orphan-claim stems); `sortOne` is the single authority and checks the CLAIM first, whatever the folder is: a foreign claim is listed `foreign:` and nothing else of the entry is stat-ed — a foreign folder with a foreign claim used to be dropped silently |
| **[E2.1 code4 9]** | both `ps` calls go through the shared launcher (`run` of the reference: one launcher, its timeout ends the whole tree); `readTable`, `groupMembers` and the confirmation's `count` are async and awaited; a timeout or a non-zero exit is still "cannot confirm" |
| **[E2.1 code4 12]** | fail closed: a survivor with no bound start time is NEVER signalled (it cannot be told from a reused pid); alive it keeps the answer at not-ended, dead it is gone. **Consequence, stated plainly:** on non-Linux `startOf` is always undefined, so a chain-walk survivor on macOS is no longer killed either; that platform already fails closed (`no environment scan on this OS`), so the run lists and fails and removes nothing there |
| **[E2.1 code4 11]** rejected | set-uid and non-dumpable descendants stay a documented gap: failing closed on them would fail every run on a multi-user host (a doubt only when the process started after the runner did) |
| **[E2.1 Opus minor]** | on Windows with a pid the confirmation still has no handle; the Linux scan's gaps are in the `processTree.mjs` header (a cleared environment is invisible; a non-dumpable or set-uid descendant is a doubt only when it started after the runner); the Linux-only and root-skipped scenarios say why; the remaining `as` casts of changed fixtures are gone (three types narrowed to what they use: `EntityCommandsHost.vaultKeys`, `runVpn`'s vault keys, the agent manager's `envCollection`); the stale text (run-tests header, deviation 5, module_tests) is corrected; the F22 wiring step gained its four additions |

### E2.1 build record, part 5 — the F22 wiring (2026-11-02)

**[E2.1 F22 wiring]** The blocker of the first build record is resolved: conventions release `cc24f9e` (F22: `sweepLeftovers({ …, token })`)
is promoted and creds main pins it (#293, `bfc5348`); this branch merged `origin/main` (a merge) and has the submodule at `cc24f9e`.
Tests `81529d6`, code in the commit after it. The runner's default sweep is the mounted reference's `sweepLeftovers`, loaded
fail-closed on its own from `.claude/rules/shared/tools/lib/leftovers-sweep.mjs` and called as `{ ...options, token: REPO_TOKEN }` — the
token AFTER the caller's options, `REPO_TOKEN` from the wrapper (written once). A failure to load is one report line, no sweep, the
suite's own exit code. `sweepNotWired` and its line are gone. Scenarios 5 and 6 of the plan are now covered by
`leftoversRunnerSweep.test.ts` on the REAL sweep in private roots (a probe that calls pid 4242 dead, a clock eleven minutes on): a dead,
old `creds` folder is collected on POSIX; a live `creds` folder, a dead `conventions` folder and an unmarked folder survive; the report
lines are `sweepAll`'s; a `token` in the caller's options changes nothing (red when the token is put first); a sweep that cannot be
loaded fails closed; on Windows the sweep lists `unverified:` (F16; that scenario runs on the Windows leg). The wiring step's four
round-3 additions are all done (a release that carries F22 first; the same fail-closed load; `token` last; header and `module_tests.md`
rewritten). Collection of a killed `npm test` run's folders now works on Linux and macOS; on Windows the Node sweep still lists only
until F16 closes. **E2.1 no longer waits for F22.** What it still waits for before merging: the macOS by-hand record, the Windows
CI leg's first green and by-hand count, the merge conditions (c) and (d) of D8.

**[E2.1 code6 1]** Code round 6 over the wiring (base `4bf9797`): the sweep loader built the mount's path again
(`.claude/rules/shared/tools/lib`). The wrapper now exports `REFERENCE_LIB` (its `LIB`, declared in `leftovers.d.cts`) and the
loader joins `leftovers-sweep.mjs` to it, so the mount's location is written in one place. No behaviour change; `npm test`,
typecheck and lint exit 0. Rejected **[E2.1 code6 0]**: `seams.sweep` replaces the whole sweep by design (a test seam), and
`sweepOptions` is documented as the default sweep's only.

### E2.1 build record, part 6 — the first CI run of PR #294 (2026-11-02)

The first run gave the Windows evidence D8 and open item (c) ask for, and two failures. **Observed on Windows** (job `runner lifecycle ·
windows`, run 41533844075, `windows-latest`, Node 22.x): 51 tests of the wrapper, runner and gate files, 48 passed, 3 failed. The passes
include the real kill path and the timeout (a descendant of a self-killed `node --test` is dead after the runner returns, through the
reference's job-object supervisor) and the wrapper scenarios: the Windows half of the process-tree policy works. The three failures
were tests that assumed the POSIX answer, not defects:

| Mark | Result |
|---|---|
| **[E2.1 win 21/22]** | the backoff and the "is anyone there" tests exercised the POSIX path of `confirmTreeEnded`; on win32 it answers `no-handle` before it uses `probe` or `count` — the intended fail-closed path ([E2.1 Opus minor], [E2.1 risk 2]). They pass `platform: 'linux'` (the function's seam) so the logic still runs on every OS, and a new gate test asserts the win32 answer itself: `no-handle`, the probe never asked |
| **[E2.1 win 8]** | the audit matches the EXPORTED record — on Windows it found the folder and did NOT remove it. **Not a defect, and the plan says so:** the job-object supervisor gives no acknowledgment that its job is empty (D4's Windows sentence: the audit removes only after the tree is PROVEN ended; the consult's risk 2, [E2.1 risk 2] in part 2: "on Windows the audit removes nothing unless the supervisor confirms the job is empty"), and D3 hands Windows collection to the C# sweep of E2.3 or the janitor. Sc. 8c's original text ("the folder was removed" on the Windows leg) is superseded by risk 2, which the coordinator accepted; the kill-path scenarios already carried a Windows branch and the first run proves it. The scenario now asserts the Windows answer — the folder kept, `(not removed: …)` on the audit's line, the run failed — where it asserted POSIX removal by accident. Open: a job-empty acknowledgment from the reference (follow-up for conventions) would let Windows remove |
| **[E2.1 win jobs]** | the `runner lifecycle · windows` job ran only the wrapper, runner and gate files, so the Windows-only scenarios of `leftoversRunnerSweep.test.ts` (F16: the sweep lists `unverified:`) and `leftoversRunnerHardening.test.ts` (the pid-based win32 `no-handle`) ran nowhere. Both files are added to the job; the Linux-only scenarios in them skip there with their stated reasons |
| **[E2.1 code7 4]** | code round 7 (base `f274ef0`): `workflowMount` accepted a fetch step BELOW the tests, where the tests have already refused. The check now requires the fetch before the first unit-test command of the job; a fixture pair (fetch after, fetch before) is the test — RED with the old check, GREEN, RED again with it put back. Rejected [code7 0, 2] (the two-space job key is exact for workflow YAML; no parser dependency for one test), [code7 1] (an inline-comment decoy), [code7 3] (a split command fails loud, never silently) |
| **[E2.1 win green]** | the second CI run of #294 (head `c2be9a2`): `runner lifecycle · windows` GREEN — 77 tests, 63 pass, 0 fail, 14 skipped (the Linux-only scenarios), with all five runner files; the SonarCloud Scan passes with the mount. This is open item (c)'s "first green" of the Windows leg; the by-hand Windows count and the macOS record are still the owner's |
| **[E2.1 sonar gate]** | the SonarCloud quality gate on new code named two lines: `tempSiteScan.ts` sorted with no compare function (S2871) — now an explicit code-unit compare, the same order as before and on every machine (a locale order would not be); `runnerWorld.ts`'s `isAlive` ran `tasklist` by a PATH lookup (S4036) — now by its full path under `%SystemRoot%\\System32`. No behaviour change, so no RED; `npm test` 6024: 6019 pass, 0 fail, 5 skipped |
| **[E2.1 code8 0]** | code round 8 (base `c2be9a2`): the `C:\\Windows` fallback of `isAlive` is the named constant `DEFAULT_SYSTEM_ROOT`. Rejected [code8 1] (a RED for the explicit sort: the comparator IS the default code-unit order, so no input tells them apart) and [code8 2] (a PATH fallback when `SystemRoot` is unset: Windows itself requires it, a missing one fails loudly with the path named, and the fallback is what S4036 flagged) |
| **[E2.1 sonar]** | the SonarCloud job runs the unit tests through c8 (`node --test` over the compiled folder) and did not fetch the mount: 44 test files failed with "the shared rules are not mounted". S1 had promised the mount in every job that runs these tests and the plan's list missed this job (it named `ci-extension.yml`, `ci-server.yml`'s build-test job for the harness, and `ci-clients.yml`). Fixed: the repository's usual step after the checkout. `workflowMount.test.ts` now reads every workflow job by job and requires the step in each job that runs the unit tests, with a companion that must recognise the four known jobs (red before the fix: `sonarcloud.yml:sonar`). The jobs that hold the mount for the unit tests today: `ci-extension.yml` (`build-test`, `runner-windows`), `release.yml` (`extension`), `sonarcloud.yml` (`sonar`) |

### E2.1 build record, part 7 — the by-hand records (2026-11-04)

Branch head before this part: `7571243`. `origin/main` (`bfc5348`) was fetched over HTTPS on 2026-11-04 and is already in this branch
(part 5's merge): `git merge origin/main` printed `Already up to date.`, so there is no new merge commit. Marks: `[E2.1 byhand n]`.
This part records the work of the "Open before E2.1 may merge" list: items (b), (c), (d) and (e). It changes no code and no scenario.

| Mark | Result |
|---|---|
| **[E2.1 byhand 1]** decision, the owner | On **2026-11-04 the OWNER stated** that their Windows machine does not test creds or coai for now. That closes item P1 of the rollout plan (second option); it is recorded in `dew_flow_conventions · research/security/machines.md`, section "The owner's Windows machine" (*Owner statement, 2026-11-04*; on the conventions branch `docs/machines-p1-wsl-2026-11-04` at the time of writing). The statement replaces the scan and does not open that machine's barrier. **So no by-hand run happens on the owner's Windows machine** |
| **[E2.1 byhand 2]** decision, the consultants | The question consultants (`867ea464`, 2026-11-04) settled that a deliberately started, recorded run on GitHub's hosted runner (a `workflow_dispatch` or push on a throwaway branch) satisfies a "by-hand" record for macOS and for Windows. The plan's own sc. 11 already allows a macOS CI leg ("that leg's green run replaces the by-hand record") |
| **[E2.1 byhand 3]** sc. 12, by hand, WSL Linux | DONE, 2026-11-04, branch head `7571243`, Ubuntu 26.04.1 under WSL 2 (`Linux 6.18.54.1-microsoft-standard-WSL2 x86_64`), Node v26.12.1. Commands, from `src_vs_code/`: `mv ../.claude/rules/shared/tools/lib/owned.mjs ../.claude/rules/shared/tools/lib/owned.mjs.aside-sc12` (then `ls` of that folder showed `owned-token.mjs` and `owned.mjs.aside-sc12`, no `owned.mjs`); `npm test` (output kept in a file; `echo "exit: $?"`); `mv … owned.mjs.aside-sc12 …/owned.mjs` (reverted: `ls` showed `owned.mjs` again). **Exit code of `npm test`: 1.** Output (all of it, after the npm banner and the `tsc -p ./` compile, which passed): `run-tests: leftovers: the shared rules are not mounted (<checkout>/.claude/rules/shared/tools/lib/owned.mjs is missing) — run: git submodule update --init .claude/rules/shared`. That is ONE line, it names the submodule command, and nothing of `node --test` ran (no test line, no summary). After the revert `git status --short` was empty in the worktree and in the submodule (`.claude/rules/shared`). Result: the mount missing is a refusal, not a silent pass. Sc. 12 is observed |
| **[E2.1 byhand 4]** D4 hand clean-up, WSL machine | DONE, nothing to remove — the list is the table below this one. The machine's `/tmp` is a tmpfs and WSL started at 2026-11-04 09:34:55; the scan ran at 10:24 CET. Roots read: `/tmp` (this is `os.tmpdir()` — `$TMPDIR` is unset — and `shortSocketRoot()`; both printed `/tmp` by the wrapper), `/var/tmp`, `/dev/shm`, `$XDG_RUNTIME_DIR` (`/run/user/1000`). Patterns, as `find <root> -mindepth 1 -maxdepth 1 -name`: `creds-*`, `cred-*` (covers `cred-vault-*` and the stub `cred-ssh-vscode-stub.cjs`), `cvbk-*`, `arrival-lease-*`, `wsl-mcp-check-*`, `tmp.*`, `testsToDelete-*` (wider than the three legacy kinds, so a legacy `testsToDelete-agent-*`, `-ait-*`, `-sshd-*` could not hide). The stub file names of the facts (`creds-agent-vscode-stub.cjs`, `creds-cli-itest-vscode-stub.cjs`, `creds-mcp-itest-vscode-stub.cjs`, `creds-mcp-wsl-itest-vscode-stub.cjs`, `creds-git-vscode-stub.cjs`, `cred-ssh-vscode-stub.cjs`, `creds-tree-bench-vscode-stub.cjs`, `creds-masked-vscode-stub-<pid>.cjs`) all start with `creds-` or `cred-`. Result: **0 entries of D4's old names in any root; 0 removed.** `/var/tmp`, `/dev/shm` and `/run/user/1000`: 0 matches. In `/tmp`: 16 entries of the wide `testsToDelete-*` pattern, none a creds name — all KEPT (table below). Nothing was removed, so no `rm` ran. (The harness folders of `wslRun.cjs` are in the user's cache folder, not in the temp root, and nothing is deleted inside the distribution — N10; out of scope) |
| **[E2.1 byhand 5]** D4 hand clean-up, the owner's Windows machine | **NOT cleaned, and not needed to be**: that machine does not test creds (the owner's statement of 2026-11-04, `[E2.1 byhand 1]`), so no creds test run has made leftovers there since the statement, and nobody removes anything there on this PR. If the owner's Windows machine tests creds again, its barrier section and this clean-up are done first (machines.md says the same) |
| **[E2.1 byhand 6]** the throwaway branch | `tmp/e21-byhand`, cut from the head of this branch after this part. NOT pushed by the session that built it: the operator pushes and runs it. It adds `.github/workflows/e21-byhand.yml` (starts on a push of that branch, and on `workflow_dispatch` from it; a workflow file that exists only on a branch is not always offered for a manual dispatch, so the push is the sure start), `.github/e21-byhand/socket-log.mjs`, `macos-sockets.mjs` and `unit-suite-count.mjs`. It is never merged. What each job shows and when it fails — the next two rows |
| **[E2.1 byhand 7]** job `macos-sockets` (`macos-latest`), sc. 11 | Runs `npm ci`, `npm run compile`, prints `git rev-parse HEAD` / `GITHUB_SHA`, `sw_vers`, `uname -m`, `node --version`, then runs the FIVE files one by one with `node --test out/test/<file>.test.js`, with a preload that logs every Unix-socket path a process binds (`net.Server#listen` with a path): `brokerListeners`, `brokerOriginDoor`, `sshAgentServer`, `sshAgentManagerFlags` (the `sshAgentWorld`-using file that binds a real socket; the other `sshAgentManager*` files stub the server and bind none — measured, 1 bind against 0) and `requestLife`. It prints, per file: exit code, tests, pass, fail, skipped, and every socket path with its BYTE length (`Buffer.byteLength`); then the LONGEST path and its bytes. It FAILS (exit 1) when: the OS is not darwin; a file exits non-zero, reads no test count, has a failure or no pass; a file binds no socket; a socket is not under `shortSocketRoot()` (`/tmp`) in a `testsToDelete-u<uid>-creds-…` folder, or is under `os.tmpdir()` (checked only when `os.tmpdir()` and `shortSocketRoot()` differ, as on macOS; on Linux they are both `/tmp`); a path is 103 bytes or more. It does not stop at the first failure: it runs all five files and then prints `RESULT: FAIL` with every reason. A pass shows `RESULT: PASS`. **Expected on Linux** (dry run of the same script on this machine, 2026-11-04, head `7571243` with this part uncommitted; its ONLY failure is "the OS is linux, not darwin", exit 1): five files green (8, 8, 25, 2, 9 tests, in the order above), 32 binds, every one under `/tmp` in a `testsToDelete-u1000-creds-…` folder, longest `/tmp/testsToDelete-u1000-creds-agent-xh6Sza/keys/37738/agent.sock` = 65 bytes (the earlier dry run, with a 6-digit pid, gave 66). On macOS the owner segment is `u501`, so expect about the same lengths (65 to 66 bytes, a few more for a longer pid) and the limit of 103 never close |
| **[E2.1 byhand 8]** job `windows-unit` (`windows-latest`), the unit suite | Runs `npm ci`, then `node ../.github/e21-byhand/unit-suite-count.mjs`, which runs `npm test` (compile, then `scripts/run-tests.mjs`: THE UNIT SUITE THROUGH ITS RUNNER) and prints the tested commit, the platform, Node, the old-name entries before, the exit code and the suite's TOTAL (tests, pass, fail, skipped, cancelled). **Which count is compared, exactly:** the total of tests is printed and is checked only for "more than 0 and 0 failed" — it is NOT compared with 56, because the plan's 56 is not a test count. The 56 is the number of OLD-NAME FOLDERS one `npm test` left in the temp root on Windows BEFORE the migration (facts, "Extension unit tests": "about 60 folders per Linux run, 56 on Windows"; sc. 10: "the RED count, expected ≈ 60 / 56"; the "Open" list item (c) calls it the "by-hand `npm test` count"). What the job COMPARES is the same count AFTER the migration: the number of NEW entries of the old names in `os.tmpdir()` after the run (`creds-*`, `cred-*`, `cvbk-*`, `arrival-lease-*`, `wsl-mcp-check-*`, legacy `testsToDelete-agent-|ait-|sshd-*`) — expected **0** — and the owner-form `testsToDelete-*-creds-*` entries left — expected **0**. The job does NOT reproduce the 56 (that needs the pre-migration head `47724fd`; the Linux RED of 60 is already recorded in this record's first evidence); the Windows RED of S2 sc. 10 stays as open as it was, and this record does not claim it. It does not stop at the first failure; it prints `RESULT: PASS`, or `RESULT: FAIL` with every reason. It FAILS (exit 1) when: the platform is not win32; `npm test` exits non-zero; no total is read, the suite ran no test, or a test failed; any new old-name entry or any owner-form creds entry is left. **Expected on Linux** (dry run of the same script on this machine, 2026-11-04, head `7571243` with this part uncommitted, 218 s for the suite): `npm test` exit 0; total **6024 tests, 6019 pass, 0 fail, 5 skipped, 0 cancelled**; old-name entries before 0; COMPARED value 1 (new old-name entries) **0**; COMPARED value 2 (owner-form creds entries left) **0**; the ONLY failure is "the platform is linux, not win32", exit 1. (The Windows total may differ from this one; it is recorded, not compared.) |
| **[E2.1 byhand 9]** run 1's Windows failure, fixed (test only) | Run 1 (`41809870657`, tested `b39a18e`): `macos-sockets` PASS; `windows-unit` FAIL on ONE test of 6024, `leftoversSites.test.ts` "the longest socket path an owned folder under the short root can have fits the unix limit…": `the broker's socket path is refused as too long: C:\Users\<you>\AppData\Local\Temp\testsToDelete-w4294967295-creds-agent-abcdef`. Cause: on Windows `shortSocketRoot()` is the temp root, but the test checks a UNIX socket length (Windows sockets are named pipes). This was the first full Windows run of the unit suite; the standing Windows leg runs the five runner files only. Fix: the test uses `shortSocketRoot()` where it is `/tmp` (Linux, macOS) and the named constant `POSIX_SHORT_SOCKET_ROOT` (`/tmp`) on Windows. RED: run 1. GREEN on Linux: 6 of 6 in the file. RED again on Linux with a 30-character-longer id (the check still bites on every OS). GREEN on Windows: run 2 below. coai code round 9 (`156fd570`): proceed, 1 finding (name the constant), accepted. |

**The clean-up list of `[E2.1 byhand 4]`** (every path of the wide pattern in every root; age and owner at 10:24 CET on 2026-11-04; the rule: removed ONLY a creds test leftover proven by name pattern, owner uid 1000 and age over one hour, each by its exact path, never by a glob — no path met it):

| Path | Type · owner · modified (age) | Verdict · reason |
|---|---|---|
| `/tmp/testsToDelete-mgb-ledger-28VFCR`, `-P8UTH4`, `-qLIKAv` | dir · uid 1000 · 10:01 (23 min) | KEPT — not a creds name (`mgb-` is the benchmark repository's legacy form); made today by another repository's test; younger than one hour; may be in use |
| `/tmp/testsToDelete-mgb-ledger-B7LpwP`, `-DB7VQT`, `-WczSFa` | dir · uid 1000 · 10:19 (5 min) | KEPT — same; and 5 minutes old |
| `/tmp/testsToDelete-mgb-real-cal-NGAbZb` | dir · uid 1000 · 10:01 (23 min) | KEPT — same as the first row |
| `/tmp/testsToDelete-mgb-real-cal-pPqziW` | dir · uid 1000 · 10:07 (17 min) | KEPT — same |
| `/tmp/testsToDelete-mgb-real-cal-eivvwo` | dir · uid 1000 · 10:12 (12 min) | KEPT — same |
| `/tmp/testsToDelete-mgb-real-cal-MTXjyI` | dir · uid 1000 · 10:19 (5 min) | KEPT — same |
| `/tmp/testsToDelete-u1000-conventions-consumers-oDwFua` and its `.owner` claim file | dir + file · uid 1000 · 10:08 (16 min) | KEPT — owner-form folder of the `conventions` token (another repository's run), with its claim; not creds; younger than one hour; its sweep owns it |
| `/tmp/testsToDelete-u1000-conventions-consumers-FwIzkj` and its `.owner` claim file | dir + file · uid 1000 · 10:10 (14 min) | KEPT — same |
| `/tmp/testsToDelete-u1000-r9700-run-MYJXCV` and its `.owner` claim file | dir + file · uid 1000 · 10:18 (6 min) | KEPT — owner-form folder of the `r9700` token (another repository), with its claim; not creds; 6 minutes old |
| every other entry of `/tmp` (`coai-*`, `claude-1000`, `node-compile-cache`, `mcp-wpfpXm`, `codex-*`, `out`, `private-v1.json*`, `r-v*.json*`, `snap-private-tmp`, `systemd-private-*`, `vscode-typescript1000`, `.X11-unix`) | various | NOT LISTED AS CANDIDATES — no D4 pattern matches them (the scan was by D4's names, not by "everything"); never touched |

Counts: 16 listed paths (10 `mgb` folders, 6 entries of the two other-repository owner-form runs); 0 creds-name entries; 0 removed; 16 kept, each with its reason. The `mgb-` and owner-form folders are the "10 legacy-form folders of one other repository's benchmark tests" that `dew_flow_conventions · research/security/machines.md` records for this machine on the same day; their epic removes them.

**Merge conditions of D8, as this part leaves them.** (c) the per-machine barrier record. **The operator's WSL machine: NOT complete.** The barrier record (`dew_flow_conventions · research/security/machines.md`, PR #124, 2026-11-04) says the machine's barrier is OPEN for every place the developer account can read, but two root-only places (root's user systemd folder and `/var/spool/cron/crontabs`) were NOT read, because the account has no password-less `sudo`. So D8 (c) for the WSL machine is not complete until an administrator runs `sudo node tools/sweeper-scan.mjs --system` and it exits 0, or each line it prints is resolved. **The owner's Windows machine:** the owner's statement of 2026-11-04 (`[E2.1 byhand 1]`) meets condition (c) (P1 is closed), and that machine's barrier stays closed; nothing waits for it. (d) the one-time hand clean-up of D4's old names: WSL — recorded here, nothing to remove (`[E2.1 byhand 4]`); the owner's Windows machine — not cleaned, because it does not test creds (`[E2.1 byhand 5]`). **CI results of the throwaway run (the operator fills these after the run):**

| Item | Run 1 (2026-11-04) | Run 2 (after [E2.1 byhand 9]) |
|---|---|---|
| run URL and id | https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/actions/runs/41809870657 | https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/actions/runs/41812168328 |
| tested commit (head of `tmp/e21-byhand`) | `b39a18e` | `cdc116b` (run 1's head plus `[E2.1 byhand 9]`) |
| `macos-sockets`: conclusion | success (`RESULT: PASS`) | success (`RESULT: PASS`) |
| macOS version (`sw_vers`) · arch · Node | 26.6.2 (25G83) · arm64 · v22.23.4 | 26.6.2 (25G83) · arm64 · v22.23.4 (`os.tmpdir()` `/var/folders/…/T`, `shortSocketRoot()` `/tmp`) |
| the five files: result (tests / pass / fail) | 8/8/0 · 8/8/0 · 25/25/0 · 2/2/0 · 9/9/0 (brokerListeners, brokerOriginDoor, sshAgentServer, sshAgentManagerFlags, requestLife); 32 binds | 8/8/0 · 8/8/0 · 25/25/0 · 2/2/0 · 9/9/0; 32 binds |
| where the sockets were placed (root and folder form) | `shortSocketRoot()` = `/tmp`, folders `testsToDelete-u501-creds-<what>-<random>` | `shortSocketRoot()` = `/tmp`, folders `testsToDelete-u501-creds-<what>-<random>` |
| longest socket path · bytes (must be under 103) | 63 — `/tmp/testsToDelete-u501-creds-agent-qvTTzB/keys/2957/agent.sock` | 63 — `/tmp/testsToDelete-u501-creds-agent-mmuHHN/keys/2915/agent.sock` |
| `windows-unit`: conclusion | failure — one test, see [E2.1 byhand 9] | success (`RESULT: PASS`) |
| Windows version · Node | win32 10.0.26100 · x64 · v22.23.4 | win32 10.0.26100 · x64 · v22.23.4 |
| unit suite total: tests / pass / fail / skipped | 6024 / 6005 / 1 / 18 (cancelled 0) | 6024 / 6006 / 0 / 18 (cancelled 0); `npm test` exit 0 |
| COMPARED: new old-name entries (expected 0) · owner-form creds entries left (expected 0) | 0 · 0 | 0 · 0 |

**[E2.1 byhand 10] (2026-11-04):** run 2 is green on both jobs, so items (b) sc. 11 on macOS and (c) the Windows unit-suite count of the "Open before E2.1 may merge" list have their records (the table above; by the question consultants' decision `867ea464`, a recorded hosted run counts as by hand). The throwaway branch `tmp/e21-byhand` is deleted after this record; the four files it carried are quoted by name in `[E2.1 byhand 6..8]`. Still open for the merge: the WSL machine's administrator scan (D8 (c)), the PR's review and gates, and the rollout plan's re-review (it stopped on 2026-11-04 at its entry 4.2; no PR carrying its work merges until epoch 5 is approved).

### E2.1 build record, part 8 — CodeRabbit's review of PR #294 (2026-11-05)

Base `41aca25`. Seven points, each with a failing test first, then the fix, then green; commits `2780781` (1), `47811fe` (2),
`9ea90c7` (3 and 4), `861bb69` (7), `0b0f686` (5), `9a7216d` (6). Marks: `[E2.1 review n]`. No recorded decision is undone; two are
REFINED, as the rows say. Suite after: **6054 tests, 6049 pass, 0 fail, 5 skipped** on Linux (WSL 2, Node 26.12.1), 16 of them new;
`npm run lint` and `npm run typecheck` clean.

| Mark | Result |
|---|---|
| **[E2.1 review 1]** `ownedFile` | `leftovers.cjs`: `name` must be ONE plain path segment. A separator of either OS, `.`, `..`, an empty name, a NUL or a non-string is refused with one sentence (`TypeError`), before any folder is made. Callers pass constants, so no caller changes |
| **[E2.1 review 2]** zombies, **refines `[E2.1 code2 7]`** | `groupAlive` keeps ONE `kill(-pgid, 0)` as the cheap common answer. Only on Linux, and only when that kill says "alive", it reads `/proc/*/stat` once through the `procRoot` seam (`confirmTreeEnded` option, default `/proc`): the group is ended if at least one member is seen and every member of that process group is in state `Z`. Fail closed: a `/proc` that cannot be listed, a `stat` that cannot be read (a process that just left, `ENOENT`, is skipped) or understood, and a group with no member in the table all keep the answer "alive". Other OSes keep today's answer. Why: in a container with no init nobody reaps an orphaned zombie, the kill keeps saying "alive", and a clean run went red. `endTree` asks with its own `platform` seam |
| **[E2.1 review 3]** unlistable root | `candidates` still answers `[]` for `ENOENT` (the root is not there). Any other `readdirSync` error (`EACCES`, `ENOTDIR`, ...) is kept as `unlisted: <root> (<code>)`; `finishAudit` prints one `run-tests: unlisted:` line per root and a passing suite becomes exit 1. Nothing is removed from that root. The other roots are audited as before: a folder the run claimed in a root that CAN be read is still removed when the tree is proven ended (this is how the sentence "nothing is removed on that path" was read) |
| **[E2.1 review 4]** unreadable claim | `sortOne` no longer skips a claim with `owner.unreadable === true` without a word: it is listed (`run-tests: unreadable: <claim>`, like `unproven:`), the folder stays, nothing is removed, the exit code does not change |
| **[E2.1 review 5]** tests on macOS | `leftoversRunner.test.ts` expected the preserved branch only on `win32`. Now one helper, `auditRemoves(platform)` in `runnerWorld.ts` (true only for `linux`), is the condition at both sites. A seam test (`leftoversRunnerHardening.test.ts`) runs the runner told `darwin` and `freebsd` (and `linux` on a Linux machine) and checks that a claimed folder is kept or removed as the helper says. **Not run on macOS:** there is no macOS machine and `ci-extension.yml` has no macOS leg for this file (the by-hand macOS run of `[E2.1 byhand 7]` ran the five socket files only). The RED seen is the seam test with the OLD condition (`!== 'win32'`): `darwin: kept or removed as auditRemoves says`, actual `true`, expected `false`. The real-run sites themselves were not watched failing on macOS. Other tests in the runner files that start no `platform` seam and expect a removal (for example `leftoversRunner.test.ts` "a suite that passed and left a folder it claimed ...") have the same assumption on macOS; they were not changed here and are listed for the owner |
| **[E2.1 review 6]** alias | `tempSiteScan.ts` collects the local names of named imports of `tmpdir`, `mkdtemp` and `mkdtempSync` (`import { mkdtempSync as make }`) and counts a bare call of such a name. A property with an alias's name (`obj.make()`) and an alias of any other function are not sites. Planted samples in `leftoversSites.test.ts` |
| **[E2.1 review 7]** macOS exit code, **refines `[E2.1 Opus 1]`**. CodeRabbit's comment on `processTree.mjs:279` | On macOS the only `unverified` entry was the fixed `no environment scan on this OS`, so `endTree` answered `reason: 'unknown'` and `failsAnyway` made EVERY run exit 1, even with nothing claimed. `[E2.1 Opus 1]` named the consequence as "fails a run that left a claimed folder" and `leftoversRunnerHardening.test.ts` tested only that case. Now: that fixed entry ALONE, with no live survivor, has the reason `no-scan`; `failsAnyway` exempts it as it exempts `no-handle`, for the same reason (failing every run for a confirmation the platform cannot give makes the suite unusable). Unchanged: with a claimed folder the folder is kept, nothing is removed and the run fails (`refusalOf` has a sentence for `no-scan`); the fixed entry beside ANY other entry stays `unknown` and fails; a known live descendant is counted and fails. Nothing is ever removed on macOS. The comments above `findSurvivors`, in the header of `processTree.mjs` and in the header of `run-tests.mjs` said "the run lists and fails"; they now say what the code does. The test of `endTree` on `darwin` expects `no-scan` (it expected `unknown`) |

**Where the REDs were seen** (Linux): 1 `Missing expected exception: name "" must be refused`; 2 `actual: { ended: false, alive: 1 }, expected: { ended: true, alive: 0 }`;
3 `actual: 0, expected: 1` (a root that is a file; the same for mode 0); 4 the log held no `run-tests: unreadable:` line;
5 see its row; 6 `actual: [ 4 ], expected: [ 3, 3, 4 ]`; 7 `actual: 'unknown', expected: 'no-scan'` and, at the runner, `actual: 1, expected: 0`.
The Windows job `runner lifecycle · windows` now also runs `leftoversRunnerAudit.test.ts` (the missing-root and unreadable-claim scenarios run
there; the two POSIX root scenarios skip). That file was not run on Windows by the coder: the next CI run is its first.

### E2.1 build record, part 9 — CodeRabbit's second review of PR #294 (2026-11-06, at `2bb6ec3`)

| Mark | Result |
|---|---|
| **[E2.1 review 8]** zombies in the poll, **refines `[E2.1 code3 10]`**. CodeRabbit's comment on `processTree.mjs:353` | The group check and the environment read treated a zombie as ended (`[E2.1 review 2]`), but `settle`'s default check did not: `kill(pid, 0)` answers for a zombie, so one found by the parent-pid chain kept the run at "not ended" until the deadline, and the run failed. Now `pidAliveDefault` asks `isDefunct` on Linux. A `stat` that cannot be read keeps "alive". The test uses a real zombie of a live parent, and checks that a live process still counts. **The full suite then failed `a descendant that left the process group is ended…`, 6 of 6 runs alone:** that test's `isAlive` helper counted the killed grandchild as alive, and its state at the assertion was measured as `Z`. `isAlive` in `runnerWorld.ts` now gives the same answer as the poll. The test keeps its point: with the scan broken so nothing kills the grandchild, it goes red with the same message. **A limit, as in `groupAlive` and `readEnviron`:** a process whose main thread alone exited reads `Z` while its other threads run, so this check takes it for ended. A SIGKILL ends the whole process, so this matters only for a pid with no bound start, which is never signalled |
| **[E2.1 review 9]** the module's text. CodeRabbit's comment on `research/module_tests.md:163` | The sentence said old-enough claims "are removed" on macOS and Windows, where the audit removes nothing. It now says the age chooses what counts as this run's. No code |
| **[E2.1 review 10]** tests on macOS. CodeRabbit's comment on this document's line 1535 | CodeRabbit named three tests that plant their outcome with `confirm: ENDED` and expect a removal; on macOS the real scan would keep the folder. Telling the runner tests `darwin` by a preload on Linux found six such tests. All six now pass `NO_SURVIVORS` from `runnerWorld.ts`. **Not run on macOS:** there is no macOS machine and `ci-extension.yml` has no macOS job. Two more failed under the preload, `the audit matches the record the runner EXPORTED` and `the kill path`. They start real children, which the preload does not reach, and they ask `auditRemoves()` already, so this method cannot judge them |

**Where the REDs were seen** (Linux): 8 `actual: { ended: false, alive: 1 }, expected: { ended: true, alive: 0 }`, on the code before the fix and again with the fix taken out; 10 eight failures under the preload before the change, two after it. Merge of main at `d32a557` (`08da93d`, no conflict).

## E2.2 build record (2026-11-07, branch `feat/test-leftovers-e2.2`, not pushed, not merged)

Built by a Sonnet coder from [PLAN_test_leftovers_E2.2_brief.md](PLAN_test_leftovers_E2.2_brief.md), test first. Commits, oldest
first: `8b095bd` refactor of `run-itests.mjs` into `runHarnesses(args, seams)` (behaviour kept); `75a110c` `run-tests.mjs` exports
`sweepFor`, `sweepAll` (with `label`), `loadReferenceSweep`, `forwardSignals` (Q4; E2.1's 79 runner tests green); `583d37c` S1.1–S1.13
and S1.9 RED; `846bdc9` S1 code, the CI changes; `d7ca645` S2.2 RED; `ab66a75` `harnessScope.cjs`; `f2a41f4` S2.1 and S3.1 RED;
`dfda5c4` the eight extension harnesses; `a8e6e20` `ssh-agent`, `itestSshd`, `backup-archive`; `890aa6d` `module_tests.md`; this record.
Suite at `890aa6d`: **6468 tests, 6460 passed, 0 failed, 8 skipped** (`npm test`, which is the real runner, so it also swept both roots);
`npm run typecheck` and `npm run lint` clean.

**What was built, per story.**
- **S1** (`run-itests.mjs`): the helpers load dynamically and fail-closed (no mount: one `run-itests:` line naming
  `git submodule update --init .claude/rules/shared`, no harness, exit 1); the start-of-run sweep of both roots through `sweepFor`/`sweepAll`
  with `label: 'run-itests'`; the record held once and exported to every harness (`env: { ...process.env, TESTSTODELETE_RUN: record }`); POSIX
  harnesses start through `startInOwnTree`, a timeout calls `killWholeTree` and then `endTree`, a tree not confirmed ended adds
  `; the end of its process tree is not confirmed (<n> still alive | <reason>)` to that harness's FAIL line; Windows runs each harness through
  the reference's `run` (`containTree: true`, `timeoutMs`, `maxOutputBytes` 32 MiB, an abort signal), writes `out` + `err` at its end and reads
  the verdict from them (overflow, `spawnFailed` and timeout map to FAIL reasons); SIGINT/SIGTERM/SIGHUP are listened for, forwarded to the
  running harness's group (`forwardSignals`) or aborted (Windows), no further harness starts, the summary prints and the exit is 128 + n.
  The summary names each harness's output size (`(<n> bytes of output)`). No audit; the header says why. `ci-server.yml` `build-test` now fetches
  the mount, sets up Node 22 and prints `node --version`, and its push filter adds `src_vs_code/scripts/lib/**` and `.claude/rules/shared`; the new
  runner test is in the `runner lifecycle · windows` step; `workflowMount.test.ts` covers jobs that run a harness (with a companion that finds
  `ci-extension.yml:build-test` and `ci-server.yml:build-test`).
- **S2** (`scripts/lib/harnessScope.cjs`, plan change 7.1): one module-level scope; `run(main)` (a returned integer is the exit code, a throw
  is code 1 with the stack on stderr); `finish(code)` (sets `closing`, awaits `scope.close()`, then `process.exit`; a second call does nothing);
  `process.on` — not `once` — for SIGINT, SIGTERM and SIGHUP (exit 130, 143, 129; a signal during the close is ignored); `sectionScope()`
  (a scope whose close is registered in the module scope at once); `tempEnv(dir, env)` (the child's `TMPDIR`, `TEMP`, `TMP`);
  `handleSignals()` (for a harness with its own exit). Eight harnesses use it. Each writes its stub inside `main` through `writeStub`, then the
  `out/` requires (module-level `let` plus a load step where the file's helper functions need the modules); folders that hold a socket are
  under `shortSocketRoot()` with a `what` of at most five characters (`agent`, `cli`, `mcp`); children get an owned folder as their temp folder.
  The three SKIPs (`cli`, `mcp`, `git`) now come before any folder or stub. `mcp-wsl` keeps `runAndSweep`'s exit; its `finish` closes the module
  scope, in which the stub and `finishRun(dirs)` are registered, so a signal removes the same things.
- **S3**: `ait` is `ownedDir(scope, 'ait', { parent: shortSocketRoot() })`; each `sshd` section makes `sectionScope()` and `ownedDir(section, 'sshd')`
  and closes it in the same `finally`, after the client and `sshd` have ended; `itestSshd.launch` gives its children the temp folder
  (`setChildTemp`). `backup-archive-itest.cjs` requires the wrapper and the exit module by path from `src_vs_code/scripts/lib/`; `tempDir(scope, tag)`
  is `ownedDir(scope, 'backup-<tag>')`; its server child gets the `work` folder as temp folder. `module_tests.md` and the `run-itests.mjs` header are updated.

**The RED list** (the failing assertion; S1 against the refactor commit `75a110c`, which has the Q4 exports but no runner change):
1. S1.1 `(a) the ambient key was cleared, so only the runner can have set it` — actual `'undefined'`, expected the held record. (b) was not reached; the
   ambient foreign record is passed on by the old code, and the test now holds both halves.
2. S1.2 deepEqual — actual `[ 'start' ]`, expected `[ 'sweep <root A>', 'sweep <root B>', 'start' ]`.
3. S1.3 deepEqual — actual `[]`, expected `[ 'run-itests: leftovers sweep failed (boom)' ]`.
4. S1.4 `the dead folder and its claim are collected` — `true !== false`.
5. S1.5 `premise: without \`now\` the folder is kept only for its age` — actual `undefined`, expected `'young'` (nothing was swept).
6. S1.6 `the grandchild is dead after the runner returned` — `true !== false`.
7. S1.7 (a pin) `premise: the claim text equals the record` — the claim held the fixture's own record, because the runner did not export one yet. It is green once S1.1 is.
8. S1.8 `0 !== 1` — the harness ran with unloadable helpers.
9. S1.9 `workflowMount.test.ts`: the list of jobs without the mount was `[ 'ci-server.yml:build-test' ]`.
10. S1.10 `the running harness got the SIGTERM` — `false`, and the second harness started.
11. S1.11 `premise: the seam is called once per harness` — `0 !== 5`.
12. S1.12 `The input did not match /^pass\s+itest:loud\s+\(100 bytes of output\)/m`.
13. S1.13 no `; the end of its process tree is not confirmed (2 still alive)` phrase in the FAIL line.
14. S2.2 (nine cases): `premise: the folder and its claim existed before the exit ()` — the module did not exist, the fixture printed nothing. (Two cases fail on other premises: `a SIGINT is exit 130 and a SIGHUP is exit 129` on the code list, `a section scope` on `premise: the section folder was made`.)
15. S2.1 — 23 sites, the same 23 as `git grep` (`agent` 2, `cli` 2, `mcp` 8, `mcp-wsl` 1, `git` 2, `masked` 2, `server` 1, `ssh-agent` 3, `bench` 1, `backup` 1).
16. S3.1 — `[ 'ssh-agent-itest.cjs' ]` (three spellings in that file).
S3.2 and S3.3 are by hand, below.

**RED checked again with the fix taken out** (a temporary edit, then the file restored): `envOf` removed — S1.1 red with the same text; the sweep call removed —
S1.2, S1.3, S1.4, S1.5 red; the signal `break` removed — S1.10 red (`the second harness never started`); the `run`-branch dispatch removed — S1.11 red;
`loadHelpers` seam ignored — S1.8 red; `treeNote` removed — S1.13 red. S1.6: removing only `killWholeTree` (using `child.kill()`) kept the test green, because `endTree`
then kills the group as its second line; removing `killWholeTree` AND `endTree` made it red (`the grandchild is dead after the runner returned`). The S1.12 mutation edit
did not match its text and was not applied, so S1.12's RED is the one on the refactor commit only. In `harnessScope.cjs`: `process.once` instead of `process.on` — S2.2's
second-SIGTERM case red (`premise: the second signal came inside the close, and the close went on`); the `scope.after(() => section.close())` line removed — the section case red
(`the section folder and its claim are gone`).

**By-hand counts** (Linux/WSL, `TMPDIR`, `TEMP` and `TMP` at the private empty folder `/tmp/ce22p`, listed before and after; BEFORE = the harness files of `75a110c`
with the new runner; AFTER = `890aa6d`). `node-compile-cache` is made by `npm` itself in `TMPDIR` on every `npm run` (a direct `node` run does not make it) and is not a
harness entry; it is left out of the counts. Entries in `/tmp` itself (the socket root): 0 new harness entries in every run, before and after; the owner-form
`arrival-lease-*` and `pinclick-*` entries seen in `/tmp` during the AFTER runs are another session's `npm test` (their `what` is not one of ours).

| Invocation | BEFORE (new entries in the private folder) | AFTER |
|---|---|---|
| `npm run itest:all` (default set: agent git cli mcp masked-run backup-archive) | **15**: 4 stubs (`agent`, `cli`, `git`, `mcp`), `creds-cli-itest-*` 1, `creds-mcp-gone/-itest/-empty/-folders-*` 4, `cvbk-itest-*` 3, and 3 made by the `creds-mcp` child (`clr-debug-pipe-<pid>-…-in`, `-out`, `dotnet-diagnostic-<pid>-…-socket`) | **0** |
| `npm run itest:agent` | 1 (stub; the `storageDir` is removed on success) | 0 |
| `npm run itest:git` | 1 (stub) | 0 |
| `npm run itest:cli` | 2 (stub, `creds-cli-itest-*`) | 0 |
| `npm run itest:mcp` | 8 (stub, 4 folders, the 3 child entries) | 0 |
| `npm run itest:masked-run` | 0 | 0 |
| `npm run itest:backup-archive` | 3 (`cvbk-itest-source/-work/-occupied-*`) | 0 |
| `npm run itest:server` (no server; exit 1 as before) | 1 (stub) | 0 |
| `npm run itest:ssh-agent` (Linux; no `sshd` on this machine, sections 5 and 7 skipped) | 0 | 0 |
| `tree-perf-bench.cjs` direct (exit 1 both times, see side findings) | 1 (stub) | 0 |
| natural triggers: CLI binary moved aside / `PATH` without `git` / `BENCH_OUT` at an empty folder | 2 (stub, folder) / 1 (stub) / 1 (stub) | 0 / 0 / 0 |
| S3.3: `ssh-agent` with `PATH` holding only `node` (13 FAIL lines, exit 1) | not run before (by reading: the old code removed `dir` on a counted failure) | 0 |

**Each Linux harness's output size** (the summary of the AFTER `itest:all`; the Windows budget, G1, is 32 MiB): `agent` 1737 bytes, `git` 420, `cli` 1560,
`mcp` 6389, `masked-run` 543, `backup-archive` 1240. `ssh-agent`, `mcp-wsl` and `wsl-relay` are Windows-only in `itest:all`; `server` is opt-in. The budget is five orders of magnitude above these.

**S1.8 by hand** (as `[E2.1 byhand 3]`): `owned.mjs` moved aside, `npm run itest:all` printed one line,
`run-itests: leftovers: the shared rules are not mounted (…/owned.mjs is missing) — run: git submodule update --init .claude/rules/shared`, started no harness, exit 1; the file was put back.

**The proofs of the table.** Row 1: `sweeper-scan.mjs --root .` → `none found (1540 file(s) read) — the barrier is open for this scope`. Row 5: the guard evidence run, `leftovers-check.mjs --repo . --profile node --token creds
--identity "the developer-credentials server and extension"` → **16 findings, exit 1**: the same 16 as before (9 `raw-temp` in shell, 6 in `docker.yml`, `commandParse.test.ts:40`). It proves nothing about the harness files; rows 9 and 10 do. Row 2
(the hand clean-up of the old names): not done by this branch; it is a person's record on the PR, and the brief's search found 0 entries in the four roots.

**Not run, and why.**
- `itest:mcp-wsl`, `itest:wsl-relay`: Windows with WSL interop; the brief's row 16 says no harness runs on Windows during E2.2. The `creds-mcp-wsl-itest.cjs` edit is therefore **untested beyond `node --check`**.
- The `sshd` sections of `ssh-agent-itest.cjs` (sections 5 and 7): there is no `/usr/sbin/sshd` here, so the `ownedDir(section, 'sshd')` path and the close after `sshd` ended were not run. S2.2 proves the section scope and `sectionScope()` on a fixture.
- The `runner lifecycle · windows` job, and S1.6 / S1.4's Windows branch through the real job: only on a pushed branch (no push was asked for).
- Row 15 and the macOS cell (Q7): one recorded hosted macOS run on a throwaway branch; not started (no push).
- Both required CI checks on a PR head, the `review_code` round and the Opus review: not started (no PR).

**Differences from the brief, and findings.**
1. Extra seams on `runHarnesses`: `harnesses`, `compile`, `reachable`, `confirm`, `survivors`. Without a catalogue seam and `compile: false` no test could drive it without a real compile and real harnesses.
2. Extra tests: S1.12 (the output size), S1.13 (the unconfirmed tree phrase), `tempEnv`, S2.1's and S3.1's companions.
3. The three SKIPs now precede the folder and the stub (the brief put them after, `cli:109-113`); the observable result is 0 entries instead of a folder and a stub. `git`'s SKIP check was already before its folder.
4. `harnessScope.cjs` also exports `handleSignals` and `tempEnv`; `itestSshd.cjs` gains `setChildTemp`. `mcp-wsl` registers `finishRun(dirs)` in the module scope instead of calling it in `finish`, so a signal removes the run directory too.
5. `forwardSignals` takes `{ signals, onSignal }` options (default: the process), for the runner test's `signals` seam; the runner's own persistent listener records the signal, so a signal between two harnesses is not lost.
6. Side findings, not built (todos): **`tree-perf-bench.cjs` fails at HEAD** with `TypeError: vscode.Uri.from is not a function` (its stub lacks `Uri.from`; `depDecorations.js:61`), so the "bench run once" evidence is a failing run, before and after, and the bench's numbers cannot be had until the stub is fixed. `run-itests.mjs` still reads a skip only as `SKIP — ` (brief § 5). `node-compile-cache` appears in `TMPDIR` for every `npm run` (npm's, not ours).

### E2.2 build record, part 2 — the fix round after the code gate and the Opus review (2026-11-07)

Commits: `e9e0469` the REDs (tests); `4092455` runner fixes; `37d528f` `harnessScope.cjs` and the WSL harness; `d3a14bc` docs. Suite at `d3a14bc`:
**6478 tests, 6470 passed, 0 failed, 8 skipped** (`nice -n 19 npm test`); `npm run lint` (complexity 4) and `npm run typecheck` clean. Each fix was
watched red, then green, then taken out again (a temporary edit of the one line) and seen red; the file was restored each time.

| # | Fix | RED text (before the fix) | Taken out again |
|---|---|---|---|
| Opus 1 | S1.2 and S1.8 are pinned to `platform: 'linux'` (the `spawn` seam is the POSIX branch); each has a `win32` twin that counts starts in the `run` seam | The old S1.2 with `platform: 'win32'`: deepEqual, actual `[ 'sweep …', 'sweep …' ]`, expected the same plus `'start'`; the old S1.8 with `platform: 'win32'` PASSED, which is the reviewer's point (it counted nothing). Done by a temporary edit of the compiled test; the twins pass on the fixed tests | not applicable (a test fix) |
| Opus 2 | after `exit` the runner waits `closeBoundMs` (default `HARD_BOUND_MS`, 30 s) for `close`; it writes `<label>: its output was still open <n> ms after it exited — not waited for`, adds the same phrase to a killed harness's FAIL line, destroys the pipes, then runs `endTree` (whose scan ends a holder carrying the record) | S1.16: `the runner did not return within 15 s` (a detached grandchild holding the stdout pipe) | `exit` handler disabled: same text |
| Opus 3 | `harnessScope.cjs` listens for `uncaughtException` (an unhandled rejection arrives there), writes the error, `finish(1)` | S2.2 uncaught: `the folder and its claim are gone` failed; unhandled rejection: falsy `gone` | listener removed: both red |
| Opus 4 | `watchSignals` is registered at the start of `runHarnesses`, before the helpers load and the sweep; the header and `module_tests.md` say so | S1.17: `no harness started after the signal` | `watchSignals` made a no-op: S1.17 and S1.18 red |
| G10 | a signal during (or before) the compile skips the harnesses, still prints the summary, keeps 128 + n; new seam `compileArgs` | S1.18: `no harness ran` (the real compile ran to its end; with the seam in place and the old early return the text was `did not match /===== summary =====/`) | the early `return code 1` restored: red with the summary text |
| Opus 5 | `cancelled` reads `<label>: stopped by <signal>`; a start failure reads `could not start the harness (<reason>)` on both branches | S1.14: `did not match /^FAIL\s+itest:first\s+first: stopped by SIGTERM/m`; S1.11 and S1.15: `did not match … could not start the harness (…)` | each string put back: red |
| Opus 6 | `harnessScope.closeOnce()` is one memoised close (`closed ??= scope.close()`), shared by `finish` and by `creds-mcp-wsl-itest.cjs`'s `finish` | the first version of the test: `did not match /AFTER closes=1 gone=true/` (`closeOnce` was not a function). The test was then made to await only the SECOND call and to read a `slowDone` flag, because the first version also passed with an unguarded close | `closed = scope.close()`: red (`did not match /SECOND-RETURNED closes=1 slowDone=true gone=true/`) |
| Opus 7 | header: "A HARNESS makes and removes its own scratch"; `forwardSignals` loses its unused `onSignal` option (its doc says `signals` is for tests and for `run-itests.mjs`). **Correction to part 1, difference 5:** `forwardSignals` takes only `{ signals }`; the runner's own listener records the signal and nothing is passed through `forwardSignals` for that | — (wording) | — |
| Opus 8 | S1.6 gives the POSIX fixture 5 s (was 2 s) | — | — |
| G6 | on Windows one line before each harness: `itest:<name> started — on Windows its output is held under the job until it ends` | S1.11: `one line says the harness started and that its output is held until it ends [G6]` | line disabled: red |
| G9 | `research/architecture.md` says the backup harness requires the extension's wrapper and `harnessScope.cjs`, so `ci · server` fetches the mount and sets up Node 22 and its path filter lists `src_vs_code/scripts/lib/**` and `.claude/rules/shared`. No Mermaid diagram there shows this edge (the one pipeline drawing is plain text), so none was re-rendered | — | — |

CodeQL `js/bad-code-sanitization` on PR #310: the fixture sources of `itestRunner.test.ts` and `harnessScope.test.ts` are constants now; the wrapper, exit module, root and marks folder reach them as `FIXTURE_WRAPPER`, `FIXTURE_HARNESS_SCOPE`, `FIXTURE_ROOT` and `FIXTURE_MARKS` in the child's environment (`withEnv` for the runner tests, the spawn's `env` for the others), and no value is spliced into fixture code. The guards S1.10, S1.5 and the S2.2 section case were taken out again and are still red.

Also corrected: part 1 said `node-compile-cache` is "made by `npm` itself"; it appears in `TMPDIR` whenever Node runs the compile (it showed in a direct
`node scripts/run-itests.mjs masked-run` run too). It is not a harness entry, and the counts leave it out. A by-hand re-run of
`run-itests.mjs masked-run` after the fixes passed and left only that entry. Not run: the Windows job and the `win32` branch against a real job (no push).

### E2.2 build record, part 3 — CodeRabbit and SonarCloud on PR #310 (2026-11-07)

Commits: the REDs (tests), then one fix commit, then the docs. Each fix was watched red, then green, then taken out again and seen red.
- **A (CodeRabbit)** a SIGTERM in an `sshd` section stopped the folder's removal from waiting for the processes. `itestSshd.cjs` keeps the children `launch` started and exports `endRunning()`; both `sshd` sections register it in their section scope AFTER the folder, so a close ends the client, then `sshd`, then removes the folder. RED: S2.2 `a SIGTERM during a section stops the section's process BEFORE its folder is removed` — `it was told to stop while the folder was still there` (the process was never told; it was left running). Out again: `endRunning` made a no-op: the same text.
- **B** a signal during the server probe still started `server`. `runOne` checks `run.signal` after the probe and starts nothing. RED: S1.19 `the server harness never started`. Out again: red.
- **C** a signal during a helper load that then fails returned 1 with no summary. It now prints the summary and leaves with 128 + n. RED: S1.20 `did not match /===== summary =====/`. Out again: red.
- **D (docs)** `module_tests.md` no longer says the tree scan ends a descendant that holds the pipe after a normal exit: the runner waits at most 30 s, reports it, stops reading, and does neither scan nor end it without a timeout. The brief's status line and the `todo/README.md` row say it is built (PR #310) and point here; the brief's goal names SIGKILL as the exception; § 5 records the two rejections (the WSL run-folder race — out of scope; the SKIP-marker mismatch — pre-existing).
- **E (Sonar S4036)** `git-transport-itest.cjs` found `git` through the caller's `PATH`. It now looks in fixed directories (`/usr/bin`, `/usr/local/bin`, `/bin`, `/opt/homebrew/bin`; the two Git for Windows folders), or at the file `CREDS_ITEST_GIT` names. A missing git is the same SKIP, now naming the directories. By hand: the harness passes; `CREDS_ITEST_GIT=/nonexistent` gives the SKIP and leaves nothing.
- **F (S9383)** `harnessScope.run`'s async block has a last-resort `.catch(() => process.exit(1))`.
- **G (S3358, S4624)** the nested ternary and the nested template in `run-itests.mjs` are the helpers `exitFailure` and `leftOf`.
- **H (S3776, `creds-mcp-itest.cjs`)** not raised by E2.2: `git diff ccf2e9f HEAD` over that file adds no `if`, loop, `catch` or logical operator inside the big async function (the `if (!fs.existsSync(EXE))` skip was there before; the only changes are `process.exitCode = fails === 0 ? 0 : 1` becoming `return fails === 0 ? 0 : 1`, one removed `rmSync` and the moved `require`s). Left as it is.
- **I (S9382)** the `await` in the harness loop is intended; a comment says so.

### E2.2 build record, part 4 — code gate round 3 (2026-11-07)
- **Process ownership.** `itestSshd.cjs` lost its global `running` set and `endRunning()`. `launch(scope, …)` and `startSshd(scope, …)` take the owning scope and register `endChild(result)` in it right after the spawn, so a close ends the processes (the client before `sshd`) before the section folder, which was registered earlier. `ssh-agent-itest.cjs` passes the section scope (and `loginLegs` hands it to the rigs). RED (against the old module, API now taking a scope): S2.2 `premise: the section started its process`, and the new `closing one section ends only its own processes, not a process launched in another scope`: `closing the first section ended its own process and left the other one running`. Out again (`scope.after` line commented): both red (`it was told to stop while the folder was still there`, the same text as above). A test bug found on the way: `killQuietly(0)` would have signalled the test's own process group; it now returns for a pid of 0 or less.
- **`CREDS_ITEST_GIT` missing file:** the SKIP names the variable and the path; the fixed-directory message stays for the unset case (by hand).
- **Comment** about running harnesses one after another removed from `run-itests.mjs`.

### E2.3 build record, part 1 — S1 (2026-11-07, branch `feat/test-leftovers-e2.3`, not pushed, not merged)

Built by a Sonnet coder from [PLAN_test_leftovers_E2.3_brief.md](PLAN_test_leftovers_E2.3_brief.md) § 3.1, test first. Commits, oldest
first: `a6938ad` S1.5 RED (`workflowMount.test.ts`); `aa86b90` S1.1 and S1.2 RED (the manifest, `TheAdaptedCopyTests`, `.gitattributes`,
`RepositoryRoot.cs`); `68fd74a` the copy, the links, `SweepRanTests`; `f96bfb1` the Sonar exclusions; `069446a` the CI changes;
`96a6204` `module_tests.md`; `df61446` one manifest op for the barrier scan (difference 3); this record. Builds: each of the five test
projects by name, `nice -n 19 dotnet build <project> -c Release -m:4 --disable-build-servers`, 0 warnings, 0 errors, every time.

**What was built.**
- **The copy.** 52 files of `dew_flow_mcp` `tests/Mcp.Tests` at `197cc76`, each the template's raw bytes plus the manifest's ops: 33 helper files + `DirectoryLinks.cs`
  + `RepositoryRoot.cs` in `src_service_defaults/tests/Support/Leftovers/`, 17 test files in `src_service_defaults/tests/Leftovers/`. A generator (kept out of the
  repository) read each file with `git show 197cc76:<path>`, applied the ops, checked each count and the upstream blob SHA, and wrote the manifest.
  `template-manifest.json`: **52 entries, 76 ops** (52 namespace lines and 24 more, each with a `reason`): `OwnedToken.cs` (token, row), `LeftoversAuditException.cs`
  (doc comment), `LeftoversAuditTests.cs` (`mcp tests:` x6, `--token mcp`), `OwnedTests.cs`, `LeftoversSelfTest.cs` (`CREDS_LEFTOVERS_SELFTEST` x2), `LeftoversSweepFixture.cs` (`typeof`),
  `Owned.cs` (one doc line), `LeftoversGuard.cs` (`HelperFile`, the helper folders, the four folding allowances), `LeftoversGuardFiles.cs` (script folders, test and source roots), `LeftoversGuardTokens.cs`
  (`TokenFile`), `LeftoversGuardTests.cs` (eight path and identity ops, the pin). No op touches ownership, liveness or deletion code. `about` carries the F29 and F31 sentences.
- **Links.** One wildcard `Compile Include` per other project; `AllowUnsafeBlocks` in `BrokerClient.Tests` and `CredVaultServer.Tests`. F16 measured: the template's `using Xunit;` against the
  global `<Using Include="Xunit" />` gives **no warning** in any of the five, so no `NoWarn` was added.
- **`SweepRanTests`** (in `Support/Leftovers`, so linked into all five): the class asks for `LeftoversSweepFixture` in its constructor and asserts `LastRun` is not null.
- **`TheAdaptedCopyTests`** (coai's form): well-formed manifest (commit, 52 entries, unique targets); every op beyond the namespace line has a reason; the `about` text names F29 and F31; the theory over 52
  targets; every `.cs` file of the two folders is a target or on `CredsOwn` (premise: more than 50 files found); `sonar.exclusions` names exactly the targets; the count-below case; a one-byte case.
  `CREDS_TEMPLATE_REPO` names the first differing line.
- **`.gitattributes`:** 52 `-text` lines, no glob. **Sonar:** the 52 targets added to `sonar.exclusions` by name.
- **CI.** `ci-clients.yml`: mount fetch and `setup-node` 22.x (+ `node --version`) after `setup-dotnet`; three macOS-only steps (Arm64 check with uid and system printed, layout self-test with its three
  greps, `--filter-namespace "CredsForDevs.Tests.Leftovers"`) before the four executables; the teeth in one bash step (ubuntu, macOS) and one pwsh step (Windows) that loop over the four client executables.
  `ci-server.yml`: the teeth (bash) for `CredVaultServer.Tests`. `release.yml` `cli-binaries` and `mcp-binaries`: mount fetch and Node 22. `sonarcloud.yml`: Node 22 (the mount was there).
  `workflowMount.test.ts`: S1.5. `research/module_tests.md`: the .NET row and the commands.

**The RED list** (the failing assertion; each seen before its code):
1. S1.5 (a), `workflowMount.test.ts`: actual `[ 'ci-clients.yml:build-test', 'release.yml:cli-binaries', 'release.yml:mcp-binaries' ]`, expected `[]`. (b): the same three and `'sonarcloud.yml:sonar'`.
2. S1.1, 51 of 52 theory rows (the 52nd is `RepositoryRoot.cs`, which the RED commit already holds because the check reads the root through it): `System.IO.FileNotFoundException : Could not find file '.../Support/Leftovers/OwnedDir.cs'`.
3. S1.2: `Expected value to be greater than 50 because the premise: the scan sees the folders ..., but found 2 (difference of -48)`; Sonar: `Expected named to be a collection with 52 item(s) because the exclusion names exactly the copied files ..., but found an empty collection`.
4. S1.4, the `[assembly: AssemblyFixture]` line removed: at compile time `error xUnit1041: Fixture argument 'sweep' does not have a fixture source` (the analyzer is earlier than the brief's text); with that one id silenced (`-p:NoWarn=xUnit1041`)
   at run time `The following constructor parameters did not have matching fixture data: LeftoversSweepFixture sweep`. File restored (blob checked by the theory).
5. S1.3, by hand, each reverted: one byte in `Errno.cs` -> `Errno.cs: with the listed replaces undone, the git blob is 6b18974741ad...; the manifest says 7e489851e47b...`; one count lowered (`mcp tests:` 6 to 5) ->
   `LeftoversAuditTests.cs: operation 2 of 3 ('mcp tests:' -> 'creds tests:') expected 5 occurrence(s) of the new text, found 6 at line(s) 220, 229, 230, 247, 268, 273`. S1.2 by hand: a new `Stray.cs` ->
   `... found at least one item {"src_service_defaults/tests/Leftovers/Stray.cs"}`.
6. S1.6 on Linux: with `_audit();` commented out in the fixture, the bash script of the `ci-clients.yml` step ended `the end-of-run audit did not fail the run (./src_cli/tests/bin/Release/net10.0/CredsCli.Tests, 1)`, exit 1
   (its leaked self-test folder was removed by hand). File restored; the same script with the fixture whole: exit 0 for the four executables, both cases. The `ci-server.yml` script: exit 0 for the server executable.
7. Found by the first full run of the copy (not in the brief): `LeftoversGuardTests.No_file_is_excluded_and_the_guards_own_tests_are_scanned_clean` red with `owner-blind` and `raw-temp` findings at `LeftoversGuardTests.cs:128-131, 136, 178-180` (difference 1).
8. Found by `sweeper-scan.mjs --root .`: `Owned.cs:84 — owner-blind` (difference 3).

**Test totals** (Release, `nice -n 19`, one executable at a time, after the last commit's rebuild; "base" is `bf59e4f` built in a scratch worktree):

| Executable | total | failed | succeeded | skipped | base |
|---|---|---|---|---|---|
| `CredsForDevs.ServiceDefaults.Tests` | 569 | 0 | 551 | 18 | 82 total |
| `CredsForDevs.ServiceDefaults.Tests --filter-namespace CredsForDevs.Tests.Leftovers` | 487 | 0 | 470 | 17 | — |
| `CredVaultServer.Tests` | 824 | 0 | 821 | 3 | 820 |
| `CredsCli.Tests` | 150 | 0 | 147 | 3 | 146 |
| `CredsMcp.Tests` | 173 | 2 | 168 | 3 | 169 (2 failed) |
| `CredsBroker.Tests` | 163 | 0 | 160 | 3 | 159 |

The 2 `CredsMcp.Tests` failures (`ParentWatchProcessTests.The_server_ends_when_its_parent_is_killed_while_stdin_stays_open`, `...The_server_keeps_serving_when_the_watch_is_off`) fail the same way on `bf59e4f`: this WSL
machine "looks like WSL" and `creds-mcp.exe` cannot start (`windowsHalfMissing`). One run of `CredsMcp.Tests` showed 167 passed and 4 skipped, the next two 168 and 3: a skip of an existing test that flickers. `npm test`: 6486 tests, 6478 passed, 0 failed, 8 skipped (the real runner, so it also swept both roots).
Filtered runs build the fixture: `--filter-class "*SweepRanTests"` and `--filter-class "*LeftoversSelfTest"` (whose audit failed the run) and `--filter-namespace` all ran the sweep and the audit (brief § 2's measurement).
`sweeper-scan.mjs --root .` at the head: `none found (1595 file(s) read)`. `dotnet format whitespace` and `style --verify-no-changes --no-restore`: exit 0.

**Not run, and why.**
- **No CI.** The macOS steps, the pwsh teeth, the Windows leg, `release.yml` (runs on a tag only) and `sonarcloud.yml` have not run. The bash teeth script was run by hand on Linux only. `actionlint` and `pwsh` are not installed here: the four workflows were parsed with PyYAML, nothing more.
- **`dotnet format dew_flow_creds_for_devs.slnx --verify-no-changes --no-restore` as one command** prints 113 `IL2026`/`IL3050` errors in `src_minimalapi_server/src` once the projects have been built. The same 113 appear on `bf59e4f` after a build, so this is the machine and the AOT analyzers, not the copy. The two subcommands that read the copy are clean (above).
- **Rows 2, 5, 10, 16, 24 and S2–S5's tests** are other stories' (the hand clean-up, the leak counts, sc. 4, the hand-run C# guard, the shipped Node guard run). `leftovers-check.mjs` needs a scratch copy with `yaml@2` and was not run.
- S1.4's Windows and macOS runs, and the helper's Windows- and Darwin-only tests (the 17 skips above are those, on Linux).

**Differences from the brief.**
1. **The guard's helper folder is two folders (two ops in `LeftoversGuard.cs`), which the brief puts in E2.5.** The copied `LeftoversGuardTests.No_file_is_excluded_and_the_guards_own_tests_are_scanned_clean`
   scans `LeftoversGuardTests.cs` as it lies; the file names `Owned.Prefix` and `Owned.TempRoot` in its fixtures, which the guard allows inside the helper folder only. With one folder (`Support/Leftovers/`) that copied test is red.
   The two ops are coai's form (`HelperFolders` array, `Any`) and change no ownership code. E2.5.S1's own list in this document (§ *E2.5*) does not name a second helper folder, so the brief's "E2.5.S1's own list" does not hold
   for it. **For the coordinator:** keep the two ops, or take them out and decide how that one test is made true; either way creds' own tests in `tests/Leftovers` (S2) will name `Owned.*` and meet the same rule.
2. **Fewer token ops than the brief expects.** The 58 `mcp` words in `LeftoversGuardTests.cs` are fixture tokens passed to the guard as arguments (`McpRow`, `"mcp"`, `-mcp-x-`); they are self-consistent, the tests pass with them, so no op was made. `MCP_DARWIN_FIFO_CHILD` stays, as the brief said. The doc comments in `Owned.cs`
   (`:77`) and `OwnedDir.cs` (`:6`) that say `mcp` are untouched.
3. **One op on a doc line of `Owned.cs` (`:84`).** `tools/sweeper-scan.mjs` reads `&lt;owner&gt;` as no owner segment and reports the line as owner-blind, which breaks row 1 on the PR head (coai's copy has the same finding). The op writes
   `{owner}` and `creds`; its old text leaves the prefix word out, so the manifest is no finding either. It is a comment, but it is in the ownership file: a reviewer should read it. The template owner could fix it upstream instead.
4. **`LeftoversGuardFiles.cs` ops:** `ScriptFolders` gains `src_vs_code/scripts/` and `src_minimalapi_server/scripts/`; two new arrays `TestRoots` and `SourceRoots` (the template's `tests/` and `src/` stay, because the guard's own fixtures use them, plus the five projects' roots). The `.ts` helpers of `src_vs_code/src/test/` are not read by the guard (no `.ts` kind): E2.5.
5. **Reasons:** every op beyond the namespace line has one (the brief asked it beyond namespace and token). The tests check that.
6. **CI shape:** one teeth step loops over the executables (bash for ubuntu and macOS, pwsh for Windows) instead of a step per executable; the macOS-only steps are three, the fourth of row 11 is the shared bash teeth step. The macOS steps have no `if: !cancelled()` (a `bash -e` step stops the job).
   `ci-clients.yml` sets up Node on all three legs; `sonarcloud.yml`'s extension coverage now runs under Node 22 too.
7. **Order and builds:** `RepositoryRoot.cs` is in the RED commit (the check needs it to compile). Release, not Debug, and `nice -n 19` in place of `low-priority.mjs`, as the coder's instructions said; § 9's stale-binary check shows no STALE line after the final rebuild.
8. **`CLAUDE.md`'s command lines and `.vscode/tasks.json`** were not touched (not in § 3.1's file list); they still build the solution and name the `.exe` form.

### E2.3 build record, part 2 — S2 (2026-11-07, branch `feat/test-leftovers-e2.3`, not pushed, not merged)

Built by a Sonnet coder from [PLAN_test_leftovers_E2.3_brief.md](PLAN_test_leftovers_E2.3_brief.md) § 3.2, test first. Commits, oldest first: `12fbf95` S2.1-S2.3, S2.9, S2.10 RED (the tests, with
signature-only stubs in `HostProcess.cs` that keep main's behaviour); the adapter GREEN; the socket-root RED (stub fixture, stub `OwnedCreds`); the socket-root GREEN; the Q5 child-temp GREEN; S2.7; this record
and `module_tests.md` (the exact hashes are in `git log`). Builds: each of the five test projects by name, `nice -n 19 dotnet build <project> -c Release -m:4 --disable-build-servers`, 0 warnings, 0 errors.

**What was built.**
- **`HostProcess` (the adapter).** `TempDirectory(what, warn)` is an `OwnedDir` (claim first, prefixed, registered) kept in a static `ConcurrentDictionary<string, Folder>`; its warning sink travels with that one
  folder. `Remove(path, warn, onDispose)` takes the entry out with ONE `TryRemove`; only the winner calls `Dispose()`; a path not given, or already taken, is one warning; a failed dispose stays in `OwnedDir`'s
  registry (the audit's `disposed but not removed`). `Start` ties the child to each registered folder that an argument or an environment value contains (names are unique per run); `KillOnDispose` kills the
  tree, waits with a 15 s bound (`WaitForExit(TimeSpan)`, not for the pipes), and ends the ties, or throws ONE exception naming the pid and the folders; `Remove` keeps a folder with an open tie (one warning,
  still registered). `StartFile` starts any executable (a fixture child) the same way.
- **Q5 (children's temp paths).** MEASURED FIRST, RED: `CredsMcp.Tests` and `CredsCli.Tests`, each run on the built Release binaries with `TMPDIR=/tmp/c23q5` (private, short): **6 entries each**
  (`dotnet-diagnostic-<pid>-<n>-socket`, `clr-debug-pipe-<pid>-<n>-in` and `-out`, for two killed hosts). So `Start` hands `TMPDIR`, `TEMP` and `TMP` = an owned folder (`child-tmp`) under
  `OwnedCreds.ShortSocketRoot` to a child that names none of the three; it goes with the confirmed end. After: **`CredsCli.Tests` 0 entries**, `CredsMcp.Tests` **3** (one host). Those three come from
  `ParentWatchProcessTests`, which start the host by their own `Process.Start` (a site of S3), not through `HostProcess.Start`.
- **`OwnedCreds.cs`** (creds' own, in `Support/Leftovers/`): `ShortSocketRoot`, `Canonical` (realpath(3) through `[LibraryImport]`; `Native.FinalPathOfFollowing` on Windows; a missing path is its nearest
  existing folder plus the missing names), `RootsDiffer`. The one `"/tmp"` carries a `raw-temp` marker with its reason.
- **`LeftoversSocketRootSweepFixture.cs`** (its own `[assembly: AssemblyFixture]`): where the canonical roots differ it runs the copied sweep over the short root at the start and `RealAudit(root,
  OwnedDir.Unreclaimed())` at the end, both behind `GuardedSweep`/`GuardedAudit`; where they are one it does nothing. It builds the main fixture's own seam constructor for the run and the report, so both say the
  same things; each line starts with `[socket root <root>]`. `OwnsASweep`, `SweptRoot`, `LastRun` (null where it ran none).
- **Tests** (`src_service_defaults/tests/Leftovers/` unless noted): `HostProcessAdapterTests` (10: S2.1, S2.2, S2.3, S2.9 twice, S2.10 three times, the child's temp folder twice); `SocketRootSweepTests` (12, of
  which 3 skip off their OS and 1 is the producer half of S2.4(c)); `SweepRanTests` (`Support/Leftovers/`, linked into all five; now 2 tests); `WindowsHandoffTests` (4, Windows only).

**The RED list** (the failing assertion; each seen before its code; `main` behaviour behind signature-only stubs):
1. S2.1: `Expected OwnedDir.Unreclaimed().Select(d => d.Path) {empty} to contain "/tmp/mcp-pump-<guid>" because premise: it is registered between the two calls.`
2. S2.2: `Expected sink.Lines to contain a single item because the one line names the folder that was kept, but the collection is empty.`
3. S2.3: `Expected Directory.Exists(foreign.Path) to be True because the path exists after, but found False.`
4. S2.10 (a): `Expected Owned.Pattern().IsMatch(Path.GetFileName(paths[i])) to be True because folder 0 is prefixed, but found False.` (b): `Expected disposals to be 1 because only the call that won the atomic take-out disposes, but found 2.`
   (c): `Expected disposals to be 1, but found 4.`
5. S2.9: unconfirmed end: `Expected type to be System.InvalidOperationException because the Reaper fails the test when it cannot confirm the end, but found <null>.` The folder with a running child:
   `Expected early to be 0 because a folder with a running child tied to it is not disposed, but found 1 (difference of 1).` **The order assertion alone passed on `main`, 8 runs of 8, on Linux** (difference 1).
6. Q5: `Expected Owned.Pattern().IsMatch(Path.GetFileName(given)) to be True because the child's temp folder is owned: prefixed and claimed, but found False.`
7. S2.4, S2.5, S2.6, S2.8 (stub fixture owns no sweep; stub `Canonical` is `Path.GetFullPath`): `Expected sockets.OwnsASweep to be True because (a) the roots differ ... but found False.`;
   SweepRanTests: the stub read `/tmp/` and `/tmp` as two roots (`temp root /tmp/, short socket root /tmp; swept by the two fixtures: /tmp/`): `Expected sockets.OwnsASweep to be True because the second fixture
   sweeps exactly where the canonical roots differ, but found False.`; S2.5: `Expected layoutCalls to be greater than 0 because premise: the seam was called, but found 0.`; S2.6 with the socket fixture first:
   `Expected a <LeftoversAuditException> to be thrown, but no exception was thrown.`; S2.4(c): `System.NullReferenceException` (the stub's `LastRun` is null); the `Canonical` unit test: `... a link in the middle of
   a path is followed, but they differ at index 48: ".../first/sub" and ".../real/sub"`; the link twin: `Expected other.OwnsASweep to be True, but found False.`
8. By hand after GREEN (S2.1, D9 #18): `Remove` through `Removal.Quietly(path, warn)` instead of `Dispose()` -> `Expected OwnedDir.Unreclaimed().Select(d => d.Path) {"/tmp/testsToDelete-u1000-creds-mcp-pump-7SPtIi"} to
   not contain ... because a disposed and removed folder leaves the registry.`, and S2.2 `Expected entry!.DisposeAttempted to be True, but found False.`; the end-of-run audit failed that run too. Restored.
9. S2.7: no RED seen: the file did not exist, and the four tests run on Windows only. By hand on Linux: the maker script made `testsToDelete-u1000-creds-handoff-<id>` and its claim in a private `TMPDIR`; the sweep script
   (loaded through `run-tests.mjs`'s `loadReferenceSweep`, with `platform: 'win32'` added for the check) answered `preserved: unverified`, `listed: unverified: <path> - the owner SID is not read on Windows (F16)`.

**Test totals** (Release, `nice -n 19`, one executable at a time, after the last code commit's rebuild; no `STALE` line from § 9's check):

| Executable | total | failed | succeeded | skipped | after S1 |
|---|---|---|---|---|---|
| `CredsForDevs.ServiceDefaults.Tests` | 596 | 0 | 571 | 25 | 569 |
| `CredVaultServer.Tests` | 825 | 0 | 822 | 3 | 824 |
| `CredsCli.Tests` | 151 | 0 | 148 | 3 | 150 |
| `CredsMcp.Tests` | 174 | 2 | 168 | 4 | 173 |
| `CredsBroker.Tests` | 164 | 0 | 161 | 3 | 163 |

The 2 `CredsMcp.Tests` failures are the two `ParentWatchProcessTests` named in part 1 (they fail the same way on `bf59e4f`). `dotnet format whitespace` and `style --verify-no-changes --no-restore` on the
service-defaults test project: clean. `sweeper-scan.mjs --root .`: `none found (1600 file(s) read)`.

**Not run, and why.**
- **`WindowsHandoffTests` (S2.7 a-e)**, **the Windows branches of S2.2 (a held handle), S2.4(a) (re-owning), S2.4(c) (`foreign-uid` on an elevated process), S2.8's `On_Windows_the_short_socket_root_is_the_temp_root`**,
  and **the macOS cases** (`On_macOS_tmp_and_private_tmp_...`, the layout gate with a real failure): no Windows or macOS machine here; they run on the CI legs. Off their OS they skip, saying why.
- S2.9 on Windows is not built (the fixture child is a POSIX shell script); the Windows twin of "a child holds a file" is S2.2's held handle.
- The reaping of a child that product code starts (`WslPump.RunAsync` and `FakeChild.Stubborn`, row 6) stays the product's, as the brief says.

**Differences from the brief.**
1. **S2.9's order assertion is not red on Linux.** `Kill(entireProcessTree: true)` is followed by a reaped child before the next statement, 8 of 8 runs on `main`. The RED of S2.9 is the tie (a folder whose child still runs is
   disposed on `main`) and the unconfirmed end. The order assertion stays as the regression guard. Not a plan change: a test's premise.
2. **The Reaper's seam is the whole kill-and-wait** (`Func<Process, TimeSpan, bool>`), so the "end cannot be confirmed" case kills nothing and the child really still runs (deterministic). A fixture child that holds a file
   and has a grandchild is killed as a tree; the grandchild is gone within the bound.
3. **A child's own exit also ends its tie** (the `Exited` event). The brief ends it only on the Reaper's confirmation. `RelayLogTests` kills and awaits its first relay by its own handle, with no Reaper; without the event the
   `CredsCli.Tests` run was red with `never disposed: ...creds-relay-log` and `child-tmp`. A process the OS reaped has ended. *(Corrected in part 2b: the sentence went on "a surviving descendant is still the Reaper's concern", which was false - the event ended the tie, the Reaper then neither killed nor waited, and the folder went while a grandchild used it. The tie now ends only with the group.)*
4. **S2.4(c)'s producer is the test executable itself** (`Environment.ProcessPath`, `--filter-method` to a producer test that skips unless `CREDS_SOCKET_PRODUCER_ROOT` is set). `HostProcess` takes `WSL_DISTRO_NAME` out of a child's
   environment, and the host id of a claim carries it, so the first run read the producer's folder as `foreign host`; the test hands the variable on.
5. **S2.7's "twins"** are separate Node-made folders, one per case ((a) and (b) share one: the Node sweep first, then the re-owning and the C# sweep). (c) and (d) skip, saying why, where the token may not own `Administrators` or the public
   documents folder is not writable.
6. **The fixture reuses `LeftoversSweepFixture`'s seam constructor** for the run, the report and the audit. Its constructor takes the audit of one root as an optional seam (a test passes a no-op; the default is the real audit).
7. **`SweepRanTests`** is creds' own (it is on `CredsOwn`); its doc comment now says "lost its `AssemblyFixture` line" (the coordinator's item 3b) and it asks for both fixtures.
8. The callers of `HostProcess.TempDirectory` still pass `creds-...` names (`creds-mcp-pump`), so their folders read `testsToDelete-u<uid>-creds-creds-mcp-pump-<id>`. S3 renames the sites.

### E2.3 build record, part 2b — S2 fix round (2026-11-07, branch `feat/test-leftovers-e2.3`, not pushed, not merged)

An Opus review of S2 found defects 1-11 (all accepted). Commits: `e739c92` RED (seams in `HostProcess`: `duringEnd`, `afterTieCheck`, `TempOf`, `TiedFolders`; two stub properties on the socket-root fixture; the new tests); `4719db4` the
`HostProcess` fix (1, 4, 8); `72a4805` the fixture record, the producer, the Node report (7, 9, 10); this record with `module_tests.md` (11). Builds Release, `-m:4 --disable-build-servers`, 0 warnings.

**What changed, by defect.**
1. **A surviving descendant keeps the folder and the child's temp.** On POSIX `StartFile` starts the child through `perl -MPOSIX -e 'setsid; exec ...'` (same pid; the pid is the group id; .NET cannot put a child in a group, and a parent cannot
   after the exec). The tie ends in one place, `Child.TryEnd`: the direct child has exited AND no live member of its group is left (Linux: `/proc/*/stat`, zombies skipped; macOS: `kill(-group, 0)`). The Reaper kills the tree, then
   `kill(-group, SIGKILL)`, then waits for the exit and the empty group. The child's temp folder goes in the same step. Without `perl`, and on Windows, there is no group and the tie ends with the direct child's confirmed exit.
   **On Windows what holds** is the Reaper's tree kill (`Kill(entireProcessTree)` finds descendants by parent link) and the OS refusing to delete a folder with an open file (the refusal is S2.2's warning and an audit line); **what does not**
   is a descendant that left its parent's tree and holds no open file there. A Windows job object would close that and is not built.
2. **`A_test_that_names_the_temp_variables_itself...`** asserts `HostProcess.TempOf(child)` is null, per process, in place of a count of the process-wide registry. 3. The temp-folder test compares `Canonical(GetDirectoryName(given))` with
   `Canonical(ShortSocketRoot)` (macOS: `/tmp` is `/private/tmp`); not reproducible on Linux, fixed by reading.
4. `TryEnd` runs its body under the child's lock; the call that loses waits for the winner. 8. `Remove` decides the tie and the take-out under the folder's gate, and a start ties a folder under that same gate (and not a folder taken out
   meanwhile). 5. See below. 7. The producer gets `TESTSTODELETE_RUN=""`, its stdout and stderr are read to the end, and the test says its roots differ so it sweeps the real `/tmp`. 9. The socket-root fixture keeps `TempRootSeen` and
   `SocketRootSeen` (canonical); `SweepRanTests` reads the roots and the swept root from the fixtures' own record. 10. `WindowsHandoffTests` parses the Node report and asserts exactly one `unverified: <path>` line naming the folder.
   11. The sentence of part 2's difference 3 is corrected in place; `module_tests.md` now says when the child's temp folder goes and what holds on each OS.

**The RED list.** (1) `Expected Directory.Exists(folder) to be True because the grandchild still holds a file of the folder: the folder stays, but found False.` (4) `Expected loser.IsCompleted to be False because the loser must not return while
the winner is still ending ..., but found True.` (8) `Expected (tied && !Directory.Exists(folder)) to be False because a folder is never disposed while a running child is tied to it ..., but found True.` (9) `Expected sockets.TempRootSeen to be "/tmp" ... but "" has a
length of 0`. (7), by hand: with `TESTSTODELETE_RUN` set to the record of a live Node process, `Expected value to be 1001087L because the claim is the producer's own record, made the natural way, but found 1000920L`. By hand after GREEN, each fix taken out: (1) `GroupGone()` returning
true -> the (1) message; (4) the ended flag set before the body, outside the lock -> the (4) message; (8) the tie taken without the folder's gate -> the (8) message. (2) was a flake (9 of 25 full runs, the review): after the fix the full service-defaults suite ran 20 times
in a row with 0 failures (7 s each), and twice more in the totals below. (3) and (10) have no RED here (macOS and Windows).

**Defect 5 (the C1 wait has no RED) - recorded as unpinned.** `process.WaitForExit(bound)` after `Kill(entireProcessTree)` cannot be made to matter on Linux: .NET's `Kill` returns only after the child is reaped (a probe of 300 kill-then-check
rounds: `HasExited` false right after the kill in 0, the pid alive in 0). A deterministic check would need a child that stays alive after SIGKILL, which POSIX does not give (an uninterruptible sleep is not portable). What IS pinned is the wait for the group
(test 1 fails without it) and the "end cannot be confirmed" path (a seam that kills nothing). On Windows `TerminateProcess` is asynchronous, so the wait matters there; no Windows run has shown it.

**Totals** (Release, one at a time, after the last code commit): `CredsForDevs.ServiceDefaults.Tests` 603 total, 0 failed, 578 passed, 25 skipped (run twice, identical); `CredVaultServer.Tests` 825 / 0 / 822 / 3; `CredsCli.Tests` 155 / 0 / 152 / 3;
`CredsMcp.Tests` 174 / 2 / 169 / 3 (the two WSL `ParentWatchProcessTests`, as before); `CredsBroker.Tests` 164 / 0 / 161 / 3. `dotnet format whitespace` and `style`: clean; `sweeper-scan`: none found.

**Stays unproven.** Windows: everything in `WindowsHandoffTests`, the held-handle branches, and the descendant case above. macOS: the `perl` wrapper (the macOS system perl is assumed at `/usr/bin/perl`), `kill(-group, 0)` as the group test, the Canonical comparison. A pid reused by a
stranger between the group's emptying and a late `kill(-group)` would be signalled: the Reaper signals once, before the wait, so the window is the kill itself. A machine without `perl` runs the old, weaker tie (no group) without a message.

### E2.3 build record, part 3 — S3 (2026-11-07, branch `feat/test-leftovers-e2.3`, not pushed, not merged)

Built by a Sonnet coder from [PLAN_test_leftovers_E2.3_brief.md](PLAN_test_leftovers_E2.3_brief.md) § 3.3, test first. Commits, oldest first: `8ba2963` S3.0 and S3.2 RED (the scan, the old-name scan, `SocketSitesTests`, a
stub `SocketSites.Path` with main's `/tmp` behaviour); `4dce994` GREEN, cli; `dd3ccd4` GREEN, broker client and service defaults; `903749a` GREEN, mcp (the eight renames and `ParentWatchProcessTests`);
`2a8afa8` the scan keyed on file and a line fragment, three expected lines; `062e8eb` `module_tests.md`; this record. Builds: each of the five test projects by name, `nice -n 19 dotnet build <project> -c Release -m:4
--disable-build-servers`, 0 warnings, 0 errors. `HostProcess.cs` and the S2 test files are untouched. `TheAdaptedCopyTests.cs` (S1) gained one name on `CredsOwn` (`ClientSitesScanTests.cs`).

**What was built.**
- **`ClientSitesScanTests`** (creds' own, `tests/Leftovers/`): S3.0. A scratch copy of the `.cs` files of the four client trees (helper folders left out) is read by the copied `LeftoversGuard.Scan`; the `raw-temp` findings
  must be exactly three lines (below). Companions: more than 50 files; a planted file with four sites is found (teeth); `OwnedCreds.cs` is clean with its marker and one finding without it (the sanctioned line);
  no `TempDirectory(`/`.Dir(` call passes a `creds-` or `cred-vault-` name.
- **`SocketSites`** (`src_cli/tests/`): `Path(owned, what, file)` = a file in `owned.Dir(what, OwnedCreds.ShortSocketRoot)`; `Longest(root, what, file)` for the longest owner token. The four socket sites use it
  (`sock`/`cr.sock` three times, `corpse`/`c.sock`). `SocketSitesTests` (S3.2): the parent matches `Owned.Pattern()`, has its claim, lies under the short root, UTF-8 bytes <= `MaxSocketPathBytes`; with the longest owner
  (`u4294967295`) `/tmp` and `/private/tmp` leave 35 bytes or more on macOS's 103; macOS's own `$TMPDIR` shape leaves under 10.
- **Sites moved:** `AgentRelayHostTests`, `AgentRelayConnectionTests`, `RelayLogTests` (socket and class name); `AgentRelayTests` (now `IDisposable`: corpse, `relay-long`, `relay-logs`; `:105` under a marker);
  `RelayPipeEndingTests`, `StaleWindowsProcessTests` (names, `:41` under a marker); `EndpointsTests`, `SessionTitleTests`, `CredsLoggingTests` (`_owned.Dir`, hand-written deletes gone); `LogRootTests` (three
  paths under markers); the eight `src_mcp` callers (names). The 13 `TempDirectory` callers of the four trees now pass short names (the 14th is the server's, S4).
- **Row for the S2 review, finding 6 (coordinator's message): `ParentWatchProcessTests`.** `StartThroughIntermediary` starts the host with its own `Process.Start`; it now sets `TMPDIR`, `TEMP` and `TMP` to
  `_owned.Dir("child-tmp", OwnedCreds.ShortSocketRoot)` (the same hand-over `HostProcess` makes; the scope removes it after the test's `using`s ended the host). RED, measured first: `CredsMcp.Tests` with
  `TMPDIR=/tmp/c23s3` (private, short): **3 entries** (`clr-debug-pipe-<pid>-<n>-in`, `-out`, `dotnet-diagnostic-<pid>-<n>-socket`). After: **0**. `CredsCli.Tests`: 0 before and after S3 (S2 closed it).
  Private-`TMPDIR` count after S3: `CredsMcp.Tests` **0** (S2 left 3), `CredsCli.Tests` **0**.

**The RED list** (failing text, each seen before its code):
1. S3.0 scan: `Expected RawTempLines(Scratch(sources)) to be equal to {...} ... contains 14 item(s) too many.` The 18 findings: `EndpointsTests.cs:16`, `:80`; `SessionTitleTests.cs:22`; `AgentRelayConnectionTests.cs:162`; `AgentRelayHostTests.cs:34`;
   `AgentRelayTests.cs:33`, `:34`, `:105`, `:121`, `:153`, `:275`, `:278`; `RelayLogTests.cs:84`; `RelayPipeEndingTests.cs:41`; `CredsLoggingTests.cs:14`; `LogRootTests.cs:17`, `:18`, `:44`.
2. Old names: `Expected sources.Where(...) to be empty because a folder is named for what it holds ... but found at least one item {"src_cli/tests/AgentRelayHostTests.cs" ...`.
3. S3.2: `Expected string to be the same string, but they differ at index 2` (the stub's file name is not `cr.sock`; its parent is `/tmp` itself). The pattern assertion is behind it.
4. By hand, after GREEN: the marker of `LogRootTests` `state` removed -> the scan is red (`... contains 1 item(s) too many`, naming the line); restored. `GetTempPath()` under a marker stays exempt, as the guard says.
5. `ParentWatchProcessTests`: 3 entries before, 0 after (above). Taking the hand-over out gives the 3 back by the same count.

**Test totals** (Release, `nice -n 19`, one executable at a time, after the last code change):

| Executable | total | failed | succeeded | skipped | after S2 |
|---|---|---|---|---|---|
| `CredsForDevs.ServiceDefaults.Tests` | 600 | 0 | 575 | 25 | 596 |
| `CredVaultServer.Tests` | 825 | 0 | 822 | 3 | 825 |
| `CredsCli.Tests` | 155 | 0 | 152 | 3 | 151 |
| `CredsMcp.Tests` | 174 | 2 | 169 | 3 | 174 |
| `CredsBroker.Tests` | 164 | 0 | 161 | 3 | 164 |

The 2 `CredsMcp.Tests` failures are the two `ParentWatchProcessTests` of parts 1 and 2 (the host takes the WSL pump path here; same on `bf59e4f`). Release binaries were built by name just before each run, so § 9's Debug
`STALE` loop does not apply to them. `dotnet format whitespace` and `style --verify-no-changes --no-restore` on the cli, broker, service-defaults and mcp test projects: clean (one pre-existing trailing-space line in
`AgentRelayTests.cs` went with the edit). `dotnet format dew_flow_creds_for_devs.slnx --verify-no-changes --no-restore` stops on the server project's IL2026/IL3050 messages in this local Release setup (not in a file S3
touched); not a result.

**Not run, and why.** Windows and macOS legs (no such machine here): `SocketSitesTests` and the socket sites on macOS (the macOS byte counts are computed, not measured on a Mac), every test class's use of
`DarwinLayout.FreshOwnedScope()` there, and the Windows paths of the moved log and endpoint folders. They run on the CI legs.

**Differences from the brief.**
1. **The expected list has three lines, not four.** `CallerIdentityTests.cs:196` holds `/tmp` inside a RAW string literal (`"""..."""`); the copied guard's folded reading does not see raw strings, so it is not a finding. *(Corrected in part 3b: the guard DOES read a one-line raw string; it misses a `/tmp` inside a raw string that also holds a `"`, as `"""{"a":"/tmp/p"}"""` does.)* The
   brief allows correcting the list to the guard's reading when the RED shows it (said on the PR). Not a plan change.
2. **The list is keyed on file and a fragment of the line, not on the line number.** The migration adds lines above the literals (`AgentRelayTests.cs:33` and `:34` became `:38` and `:39`; `:278` held by chance); a number would be red for no reason.
3. **The scan reads a scratch copy** of the trees, not the trees: the guard's `Scan(root)` keys on relative paths, and a copy starts no script classifier (no `node`). Both helper folders are left out, as the brief says "helper
   folder excluded"; their own `/tmp` strings (`SocketRootSweepTests`) are E2.5's to judge.
4. **`SocketSites` is one small helper for the four sites** (the brief writes the `Path.Combine` inline four times); S3.2 then tests the helper and its worst case, and the sites share one line.
5. **The macOS temp root is not "too long" with an owned folder in it.** With the shortest sensible names the path under `/var/folders/.../T` is 101 bytes against 103; the old `creds-corpse-<pid>.sock` was 105. The test says
   what is true (under ten bytes to spare against 35 or more) and does not claim the root alone overflows. The short root stays because the brief and rule §2 say so and the margin is the point.
6. **`ParentWatchProcessTests` keep their own `Process.Start`** and take the owned `TMPDIR` from their own scope. Routing them through `HostProcess.StartFile` would end the tie and remove the folder when the launcher (not
   the host) exits, while the host still runs; and `HostProcess.Native` would set the relayed marker on WSL, which turns the watch off. Neither is S3's.

### E2.3 build record, part 3b — review rounds on S2 and S3 (2026-11-07, branch `feat/test-leftovers-e2.3`, not pushed, not merged)

Commits, oldest first: the site scan and the old-name pattern (items 1, 2, 7); the perl RED; the perl and `TempDirectory(parent)` fix; the relay sites and `SocketSites` (3, 5, 6); `ParentWatchProcessTests` (3, 4); this record.
Builds Release, `-m:4 --disable-build-servers`, 0 warnings; `dotnet format whitespace` and `style` clean on the service-defaults, cli and mcp test projects; `sweeper-scan`: none found.

**What changed.**
- **A. No perl is not silent.** `InItsOwnGroup` writes one test-output line per start without perl: no process group, a surviving descendant is NOT seen, the tie ends with the direct child's exit, install perl. The test
  `Perl_is_on_the_path_of_every_machine_that_runs_these_tests...` fails on Linux and macOS when `HostProcess.PerlPath` is null, so a runner image without perl goes red instead of weaker. RED: `Expected sink.Lines to contain a single item
  because the fallback is not silent, but the collection is empty.`; by hand, `PerlPath` returning null -> `Expected HostProcess.PerlPath not to be <null> because the adapter starts each child as a session leader through perl ...`.
- **S3 1.** `ClientSitesScanTests` leaves out only the manifest's targets (read from `template-manifest.json`) and scans creds' own files in the helper folders. RED: four message strings that name `/tmp`
  (`ClientSitesScanTests`, `HostProcessAdapterTests`, `SocketRootSweepTests` twice) appeared as `UNEXPECTED`; they were reworded (no `/tmp` in a message), so the list stays the three lines that create nothing.
- **S3 2.** The comment in the test and the sentence of part 3's difference 1 are corrected: the guard reads a one-line raw string and misses a `/tmp` inside one that holds a `"`. **Follow-up: the template guard's raw-string reading (E3 / E2.5).**
- **S3 3.** `HostProcess.TempDirectory(what, warn, parent)`; `SocketSites.Folder(site)` makes the relay tests' socket folder through it under the short root, so a relay started with the socket path is TIED to the folder (`AgentRelayHostTests`, `RelayLogTests`).
  `AgentRelayConnectionTests` and `AgentRelayTests` bind in this process and keep the scope. RED by hand: `Folder` made with `OwnedDir.Create` -> `Expected HostProcess.TiedFolders(child) to be equal to {<folder>} ... but found empty collection.`
  `ParentWatchProcessTests` keeps the host's pid and removes neither its log folder nor its temp folder while that host has not ended (the audit then names them); not RED-tested (the Reaper ends the host first in every case).
- **S3 4.** After the host's log shows `started:`, the test asserts the live host's `clr-debug-pipe-<pid>-*` are in the folder it was handed (skipped on Windows, and when the host has already ended). RED by hand, the host handed the shared temp root:
  `Expected pipes not to be empty because the live host's debug pipes are in the owned folder it was handed as TMPDIR, not in the shared temp root.` (on the two WSL-failing cases too: the host is reached before they fail).
- **S3 5.** `SocketSitesTests` says its canonical-root line bites only where the roots differ (macOS; Linux CI cannot). **S3 6.** `SocketSites.Relay` and `SocketSites.Corpse` are the two constants the sites and the theory use.
  **S3 7.** The old-name pattern covers `OwnedDir.Create`; RED: `Expected old.IsMatch("OwnedDir.Create(...)") to be True because premise: and the direct call of the helper, but found False.`

**Totals** (Release, one at a time, after the last code commit): `CredsForDevs.ServiceDefaults.Tests` 606 / 0 failed / 581 passed / 25 skipped; `CredVaultServer.Tests` 825 / 0 / 822 / 3; `CredsCli.Tests` 156 / 0 / 153 / 3;
`CredsMcp.Tests` 174 / 2 / 168 / 4 (the two WSL `ParentWatchProcessTests`, as before); `CredsBroker.Tests` 164 / 0 / 161 / 3.

**Not run / unproven.** macOS and Windows. The perl pin was not seen red on a real image without perl, only with the finder returning null. The `ParentWatchProcessTests` skip-while-running branch has no test of its own.

### E2.3 build record, part 4 — S4 (2026-11-07, branch `feat/test-leftovers-e2.3`, not pushed, not merged)

Built by a Sonnet coder from [PLAN_test_leftovers_E2.3_brief.md](PLAN_test_leftovers_E2.3_brief.md) § 3.4, test first. Commits, oldest first: S4 RED (the scan extended to the server's tests, `VaultServerFolderTests`); GREEN, `VaultServer`;
GREEN, the store and maintenance tests; GREEN, the logging-sink, startup-guard and refusal tests; this record. Builds: each of the five test projects by name, `nice -n 19 dotnet build <project> -c Release -m:4 --disable-build-servers`,
0 warnings, 0 errors. `dotnet format whitespace` and `style --verify-no-changes` on the server and service-defaults test projects: clean. `sweeper-scan`: none found. No copied helper file was edited.

**What was built.**
- **S4.0 — `ClientSitesScanTests`** now reads `src_minimalapi_server/tests` as a fifth tree (same scratch copy, same guard reading, same keying on file and a line fragment). The expected list is two arrays: `StaysForE25` (the three
  lines of S3, unchanged) and `OwnedByS5` (the seven backup sites of § 3.5, still on `GetTempPath()` after S4; S5's RED removes them one by one and the array goes with the last). The server's files in the old-name test too.
- **S4.1 — `VaultServerFolderTests`** (server project, in the server collection): (1) a `VaultServer`'s `DataDir` matches `Owned.Pattern()`, has its claim beside it and a registry entry while the server lives, and has all three gone after
  the dispose; (2) its parent is the temp root itself, not `cred-vault-tests`, and its name is not a bare GUID; (3) the ORDER: a hosted service built by a factory (so the host's container owns and disposes it) looks at the data folder in
  `StopAsync` and in `Dispose`; it must find the folder there in every step it is called, and the test fails when it was called never.
- **`VaultServer`:** `DataDir` is the path of an `OwnedDir.Create("vault")` held in a field. `Dispose(bool)` runs `base.Dispose` (the host and its container end), restores the environment, then disposes the folder. The hand-written
  `Directory.Delete` with its two `catch` blocks went (a handle that is not released is now one warning, a claimed folder and a red audit).
- **Sites moved (17 API lines and the old name):** `LoginKeyStoreTests`, `OrgBlockingWithdrawalTests`, `OrgProjectsStoreTests`, `ShareMaintenanceTests`, `OrgRecoveryMaintenanceTests` (the factories became instance methods over `_owned.Dir`, `what`
  `login-keys`, `withdrawal`, `projects`, `share-maint`, `recovery`); `OrgEventLogQueryTests`, `OrgEventLogTests`, `OrgMembersStoreTests`, `OrgSettingsStoreTests` (`_dir` set in the constructor from `_owned.Dir`; the hand-written `Dispose`
  bodies went); `OrgRegistrationTests.HookWorld` (its own `OwnedScope`); `StartupGuardsTests` (`guards`); `LoggingSinkTests` (`logsink` twice, `retention`; the three `try/finally` deletes and the last-statement delete went);
  `StartupGuardTests` (`guard-logs`, and `guard-file` for the `not-a-directory` file); `StartupRefusalProcessTests` (`HostProcess.TempDirectory("vault-refusal")`; the `Remove` call stays).

**The RED list** (failing text, each seen before its code):
1. Scan: `Expected Named(RawTempFindings(Scratch(sources))) to be equal to {...} ... contains 17 item(s) too many.` The 17 findings: `LoggingSinkTests.cs:69`, `:101`, `:153`; `LoginKeyStoreTests.cs:21`; `OrgBlockingWithdrawalTests.cs:53`;
   `OrgEventLogQueryTests.cs:24`; `OrgEventLogTests.cs:19`; `OrgMembersStoreTests.cs:25`; `OrgProjectsStoreTests.cs:16`; `OrgRecoveryMaintenanceTests.cs:19`; `OrgRegistrationTests.cs:50`; `OrgSettingsStoreTests.cs:16`;
   `ShareMaintenanceTests.cs:25`; `StartupGuardTests.cs:29`, `:165`; `StartupGuardsTests.cs:11`; `VaultServer.cs:45`. (Brief: 24 API lines in the tree; 17 + the 7 of S5.)
2. Old name: `Expected sources.Where(...) to be empty because a folder is named for what it holds ... but found at least one item {"src_minimalapi_server/tests/StartupRefusalProcessTests.cs"}.`
3. S4.1: `Expected string not to be "cred-vault-tests" because the shared parent of the old form is gone` and `Expected Owned.Pattern().IsMatch(Path.GetFileName(dir)) to be True because the name is an owned name`.
4. The order test is NOT red on `main` (main also removed the folder after `base.Dispose`); it is a pin. By hand, `_folder.Dispose()` moved before `base.Dispose`: `Expected probe.Seen to contain only items matching seen.Item2 because every step of ending
   the host saw the data folder; it is removed after them, never before`. Put back.
5. Two of the RED's own mistakes, seen and fixed before the commit: a fragment of the expected list that held `GetTempPath()` was itself a finding (the guard reads string literals), and `Owned.TempRoot()` in the new test needed its marker.

**Private-`TMPDIR` count, `CredVaultServer.Tests`** (a fresh short folder `/tmp/c23s4`, the Release executable, whole suite, entries at the top level): **before 7** (`cred-vault-tests` with 31 children, 121 entries below it, and the six
backup parents `cred-vault-aot-kit`, `-backup`, `-backup-cli`, `-backup-run`, `-backup-store`, `-key-file`; 920 entries in all). **After 6**: only the six backup parents (S5's). `cred-vault-tests`: gone. Owner-form entries left: 0. The 31 children were the folders of the store tests that never removed theirs; the logging-sink, guard and refusal folders were removed by hand before as well, and now by the scope. The remaining 6 are exactly the `OwnedByS5` list.

**Test totals** (Release, one at a time, after the last code commit): `CredVaultServer.Tests` 828 / 0 failed / 825 passed / 3 skipped (825 before: three new tests); `CredsCli.Tests` 156 / 0 / 153 / 3; `CredsMcp.Tests` 174 / 2 / 169 / 3 (the two WSL
`ParentWatchProcessTests`, as in part 3); `CredsBroker.Tests` 164 / 0 / 161 / 3; `CredsForDevs.ServiceDefaults.Tests` 606 / 0 / 581 / 25. Total 1,928.

**Not run / unproven.** Windows and macOS legs: `VaultServer`'s folder and the moved classes there (the Windows case of a handle the host has not released is one warning and a red audit, not tried). The dispose order of the live-host
tests that hold a folder of their own (`ShareMaintenanceTests`: the host is a `using` in the test, the folder is in the class's scope) rests on the language, not on a test of its own; the order that CAN be tested, `VaultServer`'s, is.
`Corp.Undeletable` is a `using` inside its tests, so it ends before the class disposes (unchanged).

**Differences from the brief.**
1. **The expected list is not the four (three) lines alone.** S5 has not run, so the seven backup sites are in the tree; they are listed in a second array, `OwnedByS5`, that S5 empties. After S5 the list is the three lines of S3.
2. **`StartupGuardsTests` changed one assertion.** `Directory.Exists(_root).Should().BeFalse(...)` said "the probe never created the folder"; the owned folder now exists from the start, so it reads `Directory.GetFileSystemEntries(_root)` empty. The
   claim of the test (nothing was written) is the same.
3. **`what` values are closer than `tests`** (the brief allows it): one per class, short, so a leftover names its class.
4. **The scan test keeps the name `ClientSitesScanTests`** (the manifest-copy test lists the file by name); its doc, method name and trees say the server is in it.

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
- **Done when.** S2 sc. 0–9 (8b, 8c included) and 12 green, 10's unit half and 11 recorded; sc. 5 and 6 assert the
  `unverified:` listing on Windows and removal on POSIX `[cadence e2d20eab 2]`; the runner's header and `module_tests.md`
  say that Node collects nothing on Windows until F16 closes; the shipped Node guard run on the branch head and its
  remaining findings (expected: the harness-free list — shell, docker, `commandParse`) recorded on the PR.
- **Stories.**
  - **E2.1.S1 — the wrapper and the mount** (Opus · Sonnet · Opus): sc. 0 (the `require(esm)` measurement),
    `leftovers.cjs` + `leftovers.d.cts` with `ownedFor`, `shortSocketRoot`, `ownedFile`, `writeStub`, fail-closed
    loading; the submodule step in `ci-extension.yml`. Owns sc. 1, 2, 3, 7, 9, 12.
  - **E2.1.S2 — the runner: record, both-root sweep, parent-only audit** — **CORNERSTONE, spec by Fable**, code by
    Sonnet, review by Opus. `TESTSTODELETE_RUN` exported to the children; `sweepLeftovers` over both roots in
    `runWithSweep`'s shape, never the exit code; the end-of-run audit by the EXACT exported record string after
    `node --test` returned `[E2.1 plan gate 0]`; the process-tree completion policy — own process group / job object,
    whole-tree kill on exit or timeout, the end confirmed before any removal, else list-and-fail `[cadence e2d20eab 1]`;
    removal by `removeQuietly`, the verdict rule of D4; sweeping and auditing never conflated (D9 #1). Owns sc. 5, 6, 8,
    8b, 8c (8c on Linux and on a `windows-latest` matrix entry for that file).
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
    submodule step before `ci-server.yml:81`; the runner's scope sentence; the timeout kill at `run-itests.mjs:132` ends the
    harness's WHOLE tree (the same group / job and confirmation as E2.1.S2's), because a descendant that outlives the
    runner keeps using folders under the run's record `[cadence e2d20eab 1]`.
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
- **Depends on.** E2.2 merged; E3 at `197cc76`. **F31 raised with the owner before this epic starts, and F29 read before the copy (§ *Revision* rows 4 and 10).**
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
    second-root parts. **And the Windows handoff proof** `[cadence e2d20eab 2]`, on the `windows-latest` leg: a folder
    made by the NODE wrapper (`node -e`, the mounted reference, E2.1's `leftovers.cjs`) in a private Windows root, its
    claim's pid an unmatchable one, the clock seam eleven minutes on → the Node sweep (`sweepLeftovers({ tmp })`)
    preserves it and lists `unverified:`; the copied C# sweep (`LeftoversSweep.Run` over the same root) collects it
    under both keys (inside the profile AND the owner SID is the caller's); and the SID-refusal case: the same folder
    with its claim's owner SID set to another account's (the `WindowsOwnership` fixture that plants a foreign owner)
    → the C# sweep keeps it as `unknown`, listed. On the elevated hosted runner the caller's new files belong to
    `BUILTIN\Administrators` (D9 #6), so the collecting case runs through the fixture that makes the entry the user's,
    and the test says which outcome the runner's own files gave. **What this does not prove (the parent's § *Epoch 7* item 8.1): that a real folder of an elevated run is collected. It is not; it waits for a person.**
  - **E2.3.S3 — the client, process and socket sites** (Opus · Sonnet · Opus): `src_cli/tests` (`AgentRelayHostTests`,
    `AgentRelayConnectionTests`, `RelayLogTests`, `AgentRelayTests`, `RelayPipeEndingTests`), `src_mcp/tests`,
    `src_broker_client/tests` (`EndpointsTests`, `SessionTitleTests`), `src_service_defaults/tests` (`CredsLoggingTests`,
    `LogRootTests`), the 14 `HostProcess` callers; the socket lengths asserted on Linux and macOS — the corpse test
    `AFileNobodyIsServingIsStale` included, routed through `OwnedCreds.ShortSocketRoot` with its full path's UTF-8 byte
    length computed for the macOS runner's temp root `[cadence e2d20eab 3]`.
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
- **Depends on.** E2.1–E2.4 merged. **F30 shipped or re-decided before this epic merges (§ *Revision* row 6).**
- **Done when.** S5 sc. 1–6; `plan-lifecycle.mjs` clean; this document's status line reads `E2 shipped, <date>; promotes
  with its parent`.
- **Stories.**
  - **E2.5.S1 — the C# guard's creds discovery and its tests** (Opus · Sonnet · Opus): `LeftoversGuardFiles.cs` for this
    tree, the two path constants, the `docker.yml` exclusion and the wrapper's folding allowance pinned,
    `LeftoversRepositoryGuardTests` over a clean tree, `LeftoversGuardCredsTests`. Owns sc. 2, 3, 5.
  - **E2.5.S2 — the inline exemptions, the shipped Node guard in `docs.yml`, the token checks, the break-its** (Opus ·
    Sonnet · Opus): `npm ci --ignore-scripts --prefix .claude/rules/shared` + `leftovers-check.mjs --profile node` as a
    required step; the automated empty-repository fixture step (exit 2 and its sentence) in the same job `[E2.1 plan
    gate 2]`; the exemptions of D7; sc. 1, 3, 4, 6.
  - **E2.5.S3 — the final barrier rescan, the docs and the completion records** (Opus · Sonnet · Opus):
    `sweeper-scan.mjs` on the PR head; `module_tests.md`, `architecture.md:366`, `CLAUDE.md`; the merge-condition
    records collected from the five PRs; the status line and the README row.
- **Cornerstone area:** none.

### Dependencies and order

E2.1 → E2.2 → E2.3 → E2.4 → E2.5, strictly: each branch is cut from the previous merge commit, so the wrapper (E2.1) is
there for the harnesses (E2.2), the C# copy (E2.3) sees the Node side clean, the shell helper (E2.4) is the last
producer, and the guards (E2.5) switch on over a clean tree. The barrier evidence (D8 (c), (d)) is on E2.1's PR before
it merges; the shipped Node guard's remaining findings are recorded after each of E2.1–E2.4 and must only shrink.

### Risk items (for the gates; at most three)

| Story | Why it is risky |
|---|---|
| **E2.1.S2** — the runner's sweep and audit | The one Node code of this repository that DELETES: a wrong record compare, or an audit run while a descendant still uses a folder, removes live data of this or a sibling run. Hence the exported-string compare `[E2.1 plan gate 0]` and the tree-completion policy `[cadence e2d20eab 1]`, each with a RED-first scenario (8b, 8c) on Linux and Windows. Cornerstone. |
| **E2.4.S1** — `owned.sh`, claim-first | New bash code that deletes, in the language with the fewest guarantees: a window between the two steps, a bare-prefix pattern, a wrong Windows pid or token, or a missing trap each turn a cleanup into a leak or a foreign removal. Hence claim → register → create, the trap check, the Windows token through the reference, and the kill-between test (S4 sc. 3). Cornerstone. |
| **E2.3.S2** — the socket-root sweep and the `HostProcess` adapter, with the Windows handoff | The only C# that is not a byte copy of E3: a second assembly fixture that sweeps and audits a second root (a mistake there sweeps `/tmp` wrongly on every executable), an adapter whose earlier shape failed every audit (D9 #18), and the proof that Windows collection — which Node no longer does — happens in C# under both keys `[cadence e2d20eab 2]`. |
