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
>
> **Revised 2026-11-07 for the parent's epoch 8** (§ *Revision for the rollout's epoch 8*, below): the lines of D3, D5, D6,
> § S4 and S5 sc. 2 that the parent's judge cut are corrected in place, each with a dated note. No merged code changes. No
> epic moves.

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

## Revision for the rollout's epoch 8 (2026-11-07)

The parent's § *Epoch 8* (`dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md`, approved 2026-11-07 by reviewers,
`Narrowed: no`) settles entry 7.2 by option (B) (its item 4.2) and acme's state (its item 4.3.2). Its judge cut the lines of
this document that said otherwise (§ *Plan changes* → *Re-review for epoch 8*, the row "creds
`todo/PLAN_test_leftovers_E2.md` on main"). This section is the cut's correction, in a new pull request; #253 is not
reverted. The corrections are not entries of the parent's ledger: they are the baseline epoch 8 is approved on. Where an
older line says otherwise, the line is corrected and marked with a dated note, and this section wins.

The parent's item 3 table rows that E2 must carry (the parent's text is the source; each row's observed result is there):

| Row | What it asks | What this document now says | Where |
|---|---|---|---|
| E2.4-a | `docker.yml`'s names are owner-form and the carve-out is complete, in the guard's reading | the names spell the literal owner `u1001`; the remover's names are unquoted; a `-v` argument is unquoted or quoted WHOLE, never the source alone in quotes; the shipped guard on the head gives 0 findings for `docker.yml` | D5; § S4 |
| E2.4-b | every remover command runs on every path | the remover has `shell: bash`, `if: always()`, `continue-on-error: true`, and `\|\| true` on each of the four removals; a creds test runs its body with a stub `docker` whose first removal fails and sees all four called (RED: one line without `\|\| true`) | D5; § S4 sc. 8 |
| E2.4-k | nothing of the smoke is left after the remover, or the job is red | a check step after the remover (`if: always()`, `shell: bash`, no `continue-on-error`) lists the two containers and the two volumes by exact name and exits 1 when one is left; it never uses a reader verb; the same creds test runs it with the stub | D5; § S4 sc. 8 |
| E2.4-c | the owner segment is the runner's uid, checked before any resource exists | the naming step's FIRST command is `[ "$(id -u)" = 1001 ] \|\| exit 1`, and the step comes before *Build*; a creds test pins both (RED: the check removed, or the step after *Build*) | D5; § S4 sc. 8 |
| E2.4-d | a failed smoke stays failed, the remover ran, NOTHING is left, `Publish` skipped | each hosted run quotes the check step's result, not only "the remover ran" | § S4 sc. 1, 2 |
| E2.4-e | a bash record is judged on Linux | `owned_owner` writes `:<start>:<ns>` on Linux; macOS writes neither. The released contract wins (§ *Order*) | D3; § S4 |
| E2.4-f | acme killed mid-issuance leaves nothing after the next run | acme's state is in labelled NAMED volumes of the owned compose project, no bind mount; observed on a hosted throwaway before E2.4's plan gate | D6; § S4 sc. 6 |
| E2.4-g | sc. 3 on Windows | S1's T14 (no change here) | § S4 sc. 3 |
| E2.4-h | acme's compose project is the owned folder's name, never a fixed one | `PROJECT` comes from `$STATE`'s basename, lower-cased, and from nothing else; a creds test pins it (RED: `PROJECT=acme`) | D6; § S4 sc. 9 |
| E2.4-i | `owned.sh` claims first; a kill between claim and folder leaves only a claim a sweep judges | as written (§ S4, sc. 3) | § S4 |
| E2.4-j | S2's scripts set their trap before their first fallible step | as written (§ *Revision* row 5; § S4 sc. 4) | § S4 |
| E2-d | the hand clean-up of E2's old names is recorded per machine | as written (D8); each E2 PR records its own | D8 |
| E2.5-a | the Node guard at `37b9aa5` leaves only the inventory's exemptions | after E2.4, 5 findings remain. S5 sc. 2's `.cjs` and `.sh` plants of a split spelling are `legacy-name` findings at `37b9aa5`; the PR pins each as a positive test. Row 2 of § *Revision for the rollout's epochs 6 and 7* is read with this | S5 sc. 2 |
| E2.5-b | the `.sh` temp paths the guard cannot see | migrated by E2.4 (`mcp-listen-smoke.sh:35`, `version-smoke.sh:30`); `git grep` for the old leaf names → 0 | E2.4.S2 |
| E2.5-c | the C# guard over `.cs` | the copied folded reading; the Node guard does not fold `.cs` | S5 sc. 2 |

The goal's Windows exception (§ *Goal*) is stated in the parent by its true condition from epoch 8 on: a Windows process
whose NEW files and folders are owned by `BUILTIN\Administrators` (pwsh on `windows-latest`), not "an elevated process"
(elevated Git Bash makes the caller's files; coai #962). This document's § *Goal* is read with that.

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
C# the same (E3's `Owner.This`), bash ~~never~~ **the same on Linux: `owned_owner` writes `:<start>:<ns>`, the start from
`/proc/$$/stat` with ONE `getconf CLK_TCK` per script, the namespace from ONE `readlink /proc/self/ns/pid` per script;
macOS writes neither** *[2026-11-07, the parent's epoch 8: "bash never" is corrected. Without `<ns>` every Linux reader
answers `unknown` for a bash record (rule §3; `janitor.sh:649`, `owned.mjs:564`), so nothing `owned.sh` makes on Linux
would ever be collected. The released contract wins (§ *Order*). The parent's row E2.4-e and item 4.3.1.]*. **bash on Windows writes the WINDOWS pid** — `/proc/$$/winpid` (a `read`
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
runner's uid, written as a LITERAL: `testsToDelete-u1001-creds-cv-${SMOKE_ID}`, `testsToDelete-u1001-creds-refused-${SMOKE_ID}`,
`testsToDelete-u1001-creds-refused-data-${SMOKE_ID}`, `testsToDelete-u1001-creds-refused-logs-${SMOKE_ID}`
(≤ 53 characters). `u1001` is the uid of the hosted `ubuntu-latest` runner, and `docker.yml` runs only there (D4). **The
first command of the naming step** (before *Build*, before any image, container or volume exists) is
`[ "$(id -u)" = 1001 ] || exit 1`: on any other runner the job fails at once, with nothing made. The remover's names are
written UNQUOTED (the guard builds `docker rm -f -v <name>` from the run's unquoted token). A `-v` argument is written
unquoted or quoted WHOLE (`-v "testsToDelete-u1001-creds-refused-data-${SMOKE_ID}:/data"`), never with the source alone
in quotes. *[2026-11-07, the parent's epoch 8: this sentence said "`testsToDelete-${OWNER}-creds-cv-${SMOKE_ID}` … The
owner segment is written as `${OWNER}` right after the prefix, never `"$OWNER"`". Measured with the released guard
(`37b9aa5`) on the whole workflow: that spelling gives 6 findings (4 `docker-name`, 2 `docker-run`), because the guard
wants literal digits in the owner segment (`leftovers-shell.mjs:7`) and does not match a quoted remover. Option (B), with
seven counterexamples red, gives 0. The parent's item 4.2 and rows E2.4-a, E2.4-c.]* The inline removals (`:92`, `:111`'s `docker rm
-f`, `:116-117`) go: ONE remover step, placed after "Smoke-test a refused start" (the last reader) and before "Log in",
`shell: bash`, `if: always()`, `continue-on-error: true`, each of the four removals `|| true`, and it ends by LISTING what
is left (`docker ps -a --filter label=testsToDelete.owner`, `docker volume ls --filter label=testsToDelete.owner`). It
never decides the verdict: its own exit is always 0, and `Publish`'s implicit `success()` reads the smoke steps' failure,
not its. **After the remover, a check step** (`if: always()`, `shell: bash`, NO `continue-on-error`) asks for each of the
two containers (`docker ps -a -q --filter "name=^<name>$"`) and the two volumes (`docker volume ls -q --filter
"name=^<name>$"`) by exact name; any answer → one line naming it, exit 1. It can only turn the job red, never green. It
never uses a reader verb (`docker inspect` there is a reader after the remover: 1 `docker-run`). This check is the in-job
observation the parent's proof asks for. *[2026-11-07, the parent's epoch 8: `|| true` lets a failed removal pass while
its resource stays, and the listing alone decides nothing. `shell: bash` makes the step run as `bash --noprofile --norc
-eo pipefail {0}`, under which `|| true` is what lets every later removal run. The parent's rows E2.4-b and E2.4-k; a creds
test pins both (§ S4 sc. 8).]*
*[2026-11-10, the rollout's entry 8.1 (conventions PR #146): `bash -e` does not stop on a command that fails inside another
command, so two lines of this text were wrong as written. **Was:** the check step's lines were `[ -z "$(docker ps -a -q --filter
"name=^<name>$")" ] || left="$left <key>"` (and `docker volume ls -q` for the volumes) — with the daemon down, `docker` fails,
the substitution is empty, and the check passes; and the naming step wrote `echo "SMOKE_ID=$(openssl rand -hex 4)"`, which
writes an empty id when `openssl` fails. **Now:** each line of the check step first assigns the listing, `out=$(docker ps -a -q
--filter "name=^<name>$")` (a failed assignment fails the step under `-e`), and then tests it, `[ -z "$out" ] || left="$left
<key>"`, for all four names; the naming step, after the uid check, which stays its first command, assigns `id=$(openssl rand
-hex 4)`, refuses an id that is not 8 hex digits, `[[ $id =~ ^[0-9a-f]{8}$ ]] || exit 1`, and only then writes `SMOKE_ID=$id`.
The creds test pins both: a stub `docker` that fails ("Cannot connect to the Docker daemon") makes the check's body exit non-zero;
a failing `openssl` stub makes the naming body (run as `bash -e`) exit non-zero with no `SMOKE_ID` written. The shipped guard on
`docker.yml`: still 0 findings.]*

**D6 — acme-test is a probe, so its containers are leftovers too** (rule §1's first sentence; the parent named only
`state/`). The compose project becomes `teststodelete-<owner>-creds-acme-<id>`, the name of the owned folder
`testsToDelete-<owner>-creds-acme-<id>` that `owned_dir STATE acme` made, lower-cased, and from nothing else; every
service and the network carry the owner label. ~~`state/` moves out of the checkout into an owned temp folder
`testsToDelete-<owner>-creds-acme-<id>` (same id), removed at the end through a container (root and uid-10001 files,
Facts) and then by `owned_remove`.~~ **The containers' state (`certs`, `data`, `logs`) lives in NAMED volumes of that
compose project, each with the owner label (`labels: { testsToDelete.owner: "${TESTS_TO_DELETE_OWNER:?}" }`); compose
names them `<project>_<name>`, so they carry the project's owner-form name. No bind mount. `run.sh` reads the few files it
needs through a one-shot container (`docker run --rm -v <volume>:/s:ro …`) into the owned folder, which holds only those
copies and is removed by `owned_cleanup`. `compose -p "$PROJECT" down -v` removes the volumes with the containers and the
network on every exit; after a kill, the janitor removes them by name and label (`docker volume rm`), whatever the owners
of the files inside. The container-side wipe is no longer needed.** *[2026-11-07, the parent's epoch 8: a bind mount
holds root- and uid-10001-owned files after a kill, and a janitor that runs as the user cannot remove them; "a person
removes it" is not an outcome of the plan. With named volumes the owned project, its labels, its state and its teardown
are still one, and more tightly. The parent's item 4.3.2 and rows E2.4-f, E2.4-h.]* The owner
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
CI: nothing survives the hosted job. acme: one stack of four containers, one network, ~~one state folder of < 1 MB~~ **three named volumes of < 1 MB together and one owned folder of the copied files** *[2026-11-07, the parent's epoch 8, item 4.3.2]*, per run.
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
owned_owner   # prints <token>:<host>@<linux|macos|windows>:<pid>[:<start>:<ns>] — host from `hostname` with [@:[:space:]] runs → '-', the WSL
              # ~distro suffix when WSL_DISTRO_NAME is set; os from `uname -s`; pid: on Windows read from /proc/$$/winpid, else $$;
              # on Linux ONLY also :<start>:<ns> — start from /proc/$$/stat and ONE `getconf CLK_TCK`, ns from ONE
              # `readlink /proc/self/ns/pid` (D3, corrected 2026-11-07: the parent's row E2.4-e); macOS and Windows write neither
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
          [ "$(id -u)" = 1001 ] || exit 1
          echo "runner uid: $(id -u)"
          {
            echo "SMOKE_ID=$(openssl rand -hex 4)"
            echo "SMOKE_OWNER=u1001:$(hostname | sed -E 's/[@:[:space:]]+/-/g')@linux:$PPID"
          } >> "$GITHUB_ENV"
          ps -o pid=,comm= -p "$PPID" || true
```

*[2026-11-07, the parent's epoch 8: the step wrote `OWNER=u$(id -u)` for the names and normalised the host with
`tr -s '@: \t' '-'`. Now its FIRST command checks the uid the names spell, before *Build* and before any resource
(row E2.4-c); no `OWNER` variable is written; the host is normalised with `sed -E 's/[@:[:space:]]+/-/g'`, because `tr -s`
also squeezes a `--` that is part of the host name, and rule §3 changes only runs of `@`, `:` and white space (the E2.4
brief's I19; the parent's item 4.2).]*

Every `cv`/`cv-refused`/volume occurrence in `:78-117` becomes the literal prefixed name of D5 (the literal owner
segment `u1001` right after the prefix; a `-v` argument unquoted or quoted whole, never the source alone in quotes);
`docker run` and both `docker volume create` gain `--label "testsToDelete.owner=$SMOKE_OWNER"`; `:92`,
`:111`'s `docker rm -f`, `:116-117` go. After *Smoke-test a refused start*:

```yaml
      # The carve-out's remover (common/test-leftovers.md §5): after every step that reads the two containers, on
      # every path, by exact name — and it never decides the verdict: continue-on-error, `|| true`, exit 0.
      # shell: bash runs the body as `bash --noprofile --norc -eo pipefail {0}`: without `|| true` the first failed
      # removal would end the step, and the later removals would not run (row E2.4-b).
      - name: Remove the smoke's containers and volumes
        if: always()
        continue-on-error: true
        shell: bash
        run: |
          [ -n "${SMOKE_ID:-}" ] || { echo "no smoke id: nothing was named, nothing to remove"; exit 0; }
          docker rm -f -v testsToDelete-u1001-creds-cv-${SMOKE_ID} || true
          docker rm -f -v testsToDelete-u1001-creds-refused-${SMOKE_ID} || true
          docker volume rm testsToDelete-u1001-creds-refused-data-${SMOKE_ID} || true
          docker volume rm testsToDelete-u1001-creds-refused-logs-${SMOKE_ID} || true
          echo "left after removal:"
          docker ps -a --filter label=testsToDelete.owner --format '{{.Names}}' || true
          docker volume ls --filter label=testsToDelete.owner --format '{{.Name}}' || true

      # Nothing of the smoke is left, or the job is red (row E2.4-k). No continue-on-error: it can only turn the job red.
      # Filters only, never a reader verb after the remover.
      - name: Check that nothing of the smoke is left
        if: always()
        shell: bash
        run: |
          [ -n "${SMOKE_ID:-}" ] || exit 0
          left=""
          [ -z "$(docker ps -a -q --filter "name=^testsToDelete-u1001-creds-cv-${SMOKE_ID}$")" ] || left="$left cv"
          [ -z "$(docker ps -a -q --filter "name=^testsToDelete-u1001-creds-refused-${SMOKE_ID}$")" ] || left="$left refused"
          [ -z "$(docker volume ls -q --filter "name=^testsToDelete-u1001-creds-refused-data-${SMOKE_ID}$")" ] || left="$left refused-data"
          [ -z "$(docker volume ls -q --filter "name=^testsToDelete-u1001-creds-refused-logs-${SMOKE_ID}$")" ] || left="$left refused-logs"
          [ -z "$left" ] || { echo "left after removal:$left"; exit 1; }
```

*[2026-11-07, the parent's epoch 8: the remover's names were written in double quotes with `${OWNER}`; the guard does not
match a quoted remover (2 `docker-run`), so they are unquoted now, with the literal owner. `shell: bash` and the check step
are new (rows E2.4-a, E2.4-b, E2.4-k). Each name in the check is written as a literal, not through a loop variable: then a
reader verb added there is a guard finding. Measured 2026-11-07 with `scanText` of the guard at `37b9aa5` on the whole
`docker.yml` of `0ae0211` with this naming step, these names, this remover and this check: **0 findings**; the same file
with the remover's names quoted: 2 `docker-run`; with a `-v` source alone in quotes: 1 `docker-run`; with one check line
written as `docker inspect <name>`: 1 `docker-run`; with that reader written through a loop variable (`docker inspect
"$n"`): 0 — so a loop would hide it. The guard on the whole head decides the final text (the brief's S3.0), and sc. 8 pins
its behaviour.]*

`Log in` and `Publish` are untouched. The owner pid is the runner's worker, `$PPID` of the step's shell — the
contract's rule for a CI job (R:112-116, N11 settled); the `ps` line records which process that was in the first run's
log. ~~The shipped guard's `docker-name` class accepts a literal whose expansions are `${OWNER}`/`${SMOKE_ID}` after the
owner form's prefix; S5 sc. 2 pins that this exact text passes and that `"$OWNER"` right after the prefix is `owner-blind`.~~
**The shipped guard at `37b9aa5` reads this whole workflow with 0 findings (the parent's row E2.4-a, measured on the whole
file); it wants literal digits in the owner segment and an unquoted remover. It does NOT check `|| true`, the uid check or
the step order before *Build*: sc. 8 does.** *[2026-11-07, the parent's epoch 8: the struck sentence was wrong — the
released guard reads `${OWNER}` after the prefix as no owner segment (6 findings). The parent's item 4.2.]*

**The change — acme-test** (D6). `docker-compose.acme-test.yml`: drop `name:` (`:19`); an `x-owned: &owned` block
`labels: { testsToDelete.owner: "${TESTS_TO_DELETE_OWNER:?}" }` merged into each service (`<<: *owned`) and set on
`networks.edge.labels`; ~~every `./state/…` source (`:47-48`, `:68-69`, `:97-98`) → `${ACME_STATE:?}/…`~~ **every
`./state/…` source (`:47-48`, `:68-69`, `:97-98`) → a NAMED volume of the project (`certs`, `data`, `logs`), declared
under `volumes:` with the same `labels: { testsToDelete.owner: "${TESTS_TO_DELETE_OWNER:?}" }`; compose names them
`<project>_<name>`. No bind mount of the state** *[2026-11-07, the parent's epoch 8, item 4.3.2, row E2.4-f]*. `run.sh`, in
this order:

1. **The very top**, right after `set -euo pipefail` and sourcing `../../.github/scripts/lib/owned.sh` — before any
   sweep, any `docker compose` call and any `owned_dir`: `export TESTS_TO_DELETE_OWNER="$(owned_owner)"`
   (`owned_token` having refused already if it cannot be had); `STATE=""`, `PROJECT=""`; `trap cleanup EXIT` and `trap
   'exit 130' INT` / `trap 'exit 143' TERM` (so an interrupt runs the EXIT trap once). `cleanup` skips each step whose
   input is not made yet: when `PROJECT` is set, `docker compose -p "$PROJECT" -f docker-compose.acme-test.yml down -v
   --remove-orphans || true` (it removes the named volumes with the containers and the network); ~~when `STATE` is set,
   `docker run --rm -v "$STATE":/s alpine sh -c 'rm -rf /s/certs /s/data /s/logs' || true`, then~~ when `STATE` is set,
   `owned_cleanup` (`owned_remove` on `$STATE`, which holds only the files `run.sh` copied out) — so the EXIT trap's body
   names `owned_cleanup`, as `owned_dir` requires (its check); the trap is set before the first `owned_dir`.
   *[2026-11-07, the parent's epoch 8: the container-side wipe goes; the state is in named volumes (item 4.3.2).]*
2. The start-of-run sweep of D6: `JANITOR_MIN_AGE_MINUTES=10 bash ../../.claude/rules/shared/tools/janitor.sh --token
   creds` (exit 0 and 3 fine; any other code one line, the run goes on; on Windows a dry run until armed).
3. `owned_dir STATE acme || exit 1` (claim, register, create, in the caller's shell); ~~`id` = its six-character suffix lowercased;
   `PROJECT="teststodelete-$(owned_token)-creds-acme-$id"`~~ **`PROJECT` = the basename of `$STATE`, lower-cased through
   `tr` (bash 3.2 has no `${x,,}`): `teststodelete-<owner>-creds-acme-<8 hex>`, from `$STATE` and from nothing else**,
   `COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.acme-test.yml)`. *[2026-11-07, the parent's epoch 8, row
   E2.4-h: the project is the owned folder's name; the guard cannot see this (the value is wholly an expansion), so sc. 9
   pins it. `-p teststodelete-${OWNER}-creds-acme-$id` is a `docker-name` finding at `37b9aa5`; `-p "$PROJECT"` is clean.
   The id is the folder's own 8-hex suffix (the E2.4 brief's I9). `ACME_STATE` is no longer exported: no bind mount reads it.]*

The fixed-name `cleanup` at `:53` and the `rm -rf state` at `:54` go. ~~(`mkdir -p` the four subfolders under
`$STATE`); `:56`'s chown mounts `$STATE`. Every `state/…` path in the checks (`:83`, `:86`) reads `$STATE/…`. On Git Bash the
`-v "$STATE":/s` form is whatever today's `"$(pwd)/state":/s` proves to work — verified by scenario 6, not assumed.~~
**`:56`'s chown runs on the `data` and `logs` volumes; the checks at `:83`, `:86` read the certificate from the `certs`
volume through a one-shot container (`docker run --rm -v "${PROJECT}_certs":/s:ro …`), and a file `run.sh` needs is
copied into `$STATE`.** *[2026-11-07, the parent's epoch 8, item 4.3.2. How compose makes and names the volumes, and when
the chown can run, the hosted throwaway of row E2.4-f observes before E2.4's plan gate (the parent's item 8.2 names both as
likely surprises); the E2.4 brief writes the exact lines.]*

**Scenarios** (RED first where a leak exists today):

1. **The smoke's remover runs on every path and never greens a failed smoke** — on a throwaway branch (never
   merged): the smoke steps given a sabotaged environment (`Vault__AllowedDomains=` empty, so the server refuses its
   start and never becomes healthy), `Log in`/`Publish`'s `if:` replaced by `github.event_name == 'workflow_dispatch'`
   and `push: false` (so the branch can reach them and publishes nothing); `gh workflow run docker.yml --ref <branch>`.
   **RED, on the old shape** with one extra always-run `docker ps -a` step: the job FAILED, `cv` is still listed.
   **GREEN, on the new shape**: the job FAILED, *Remove the smoke's containers and volumes* RAN and its "left after
   removal" listing is EMPTY, `Publish` is reported **skipped**. Then the same branch with the `cv-refused` half
   sabotaged (an image that exits 0) — FAILED, remover ran, listing empty, `Publish` skipped. Run URLs in the PR; the
   branch deleted. **In each run the result of *Check that nothing of the smoke is left* is quoted (green), not only "the
   remover ran"** *[2026-11-07, the parent's epoch 8, row E2.4-d: "the remover ran" alone proves no removal]*.
2. **The happy path on the real shape** — `gh workflow run docker.yml --ref <the PR branch>`: green, the remover's
   listing empty, **the check step green**, `Log in`/`Publish` skipped by their own `if:` (not main). `actionlint` green (`ci-server.yml:294-332`).
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
   --filter label=testsToDelete.owner` shows no acme container, `docker network ls` no acme network, **`docker volume ls
   --filter label=com.docker.compose.project=<project>` no acme volume** *[2026-11-07, the parent's epoch 8, item 4.3.2]*.
6. **acme survives its own kill and is collected** — `./run.sh` killed with `kill -9` (Windows: `taskkill /F /PID
   <winpid>`) mid-issuance: the project, the network and ~~the state folder~~ **the project's named volumes and the owned
   folder** remain, labelled/claimed with that pid; the
   next `./run.sh`, more than 10 minutes later, removes them before starting through `janitor.sh --token creds` (the
   project, its network and ~~the state folder~~ **its volumes** gone, the run green) — on Linux; on Windows the janitor's dry run LISTS
   them and the record says so (D6's limit), and they are removed by hand. A second `./run.sh` started while the first
   is LIVE: the first one's stack is untouched (the old `:53` tore it down) — the janitor reads the live owner and keeps it.
   **The Linux half, observed on a hosted `ubuntu-latest` throwaway job before E2.4's plan gate (never merged):** before
   the kill, the run lists the project's volumes and asserts that each carries the `testsToDelete.owner` label (an
   unlabelled one would be kept by the janitor as `unmarked`); after the kill, 11 minutes and the next run, `docker volume
   ls`, `docker ps -a` and `docker network ls`, each filtered by the compose PROJECT (`--filter
   label=com.docker.compose.project=<project>`, never by the owner label, which an unlabelled volume would not carry), are
   empty, and the owned folder and its claim are gone. "A person removes it" is not an outcome on Linux.
   *[2026-11-07, the parent's epoch 8: the state folder was a bind mount, and after a kill its root- and uid-10001-owned
   files could not be removed by a janitor that runs as the user. Item 4.3.2 and row E2.4-f.]*
7. **An interrupt at any point still cleans up** (RED first on `main`: Ctrl-C during the first `compose up` leaves
   `deploy/acme-test/state/` in the checkout — `cleanup` at `:49` never touches it): SIGINT to `run.sh` (a) during the
   janitor call, before `owned_dir` → exit non-zero, nothing made, no error from `cleanup`; (b) during `compose up` →
   the project, its network, **its volumes** and the ~~state~~ **owned** folder are gone when the script returns; (c) SIGTERM, same as (b).
8. **The remover, the uid check and the check step, pinned by a creds test** *[added 2026-11-07, the parent's epoch 8,
   rows E2.4-b, E2.4-c, E2.4-k]* (in E2.4.S3, beside the guard fixtures of `leftoversGuardFixtures.test.ts`; it reads
   `docker.yml`): (a) the remover step has `shell: bash`; its body RUNS under `bash --noprofile --norc -eo pipefail` with
   a stub `docker` first on `PATH` whose first removal fails → all four removals are called. RED: one removal without
   `|| true` (1 removal called, exit 1). (b) The check step's body runs with the stub: a stub that still lists
   `…-creds-cv-…` after the removal → exit 1 and one line naming it, RED; nothing listed → exit 0. (c) The naming step's
   FIRST command is the `id -u` check, and the step comes before *Build*. RED: the check removed, or the step moved after
   *Build*. The guard sees none of (a)–(c): the parent measured 0 findings with no `|| true` and with the uid check removed.
9. **Acme's project is the owned folder's name** *[added 2026-11-07, the parent's epoch 8, row E2.4-h]* (in E2.4.S4, a
   creds test over `deploy/acme-test/run.sh`): `PROJECT` is assigned from `$STATE`'s basename and from nothing else. RED:
   `PROJECT=acme`. The guard cannot see it: the value is wholly an expansion.

- **Commands.** `.github/scripts/lib/owned.test.sh`; the three `.test.sh`; `bash deploy/restore-archive-itest.sh`;
  `docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:v0.11.0 <every changed .sh>`; `actionlint`; the
  dispatches of sc. 1–2; `cd deploy/acme-test && ./run.sh`; `JANITOR_MIN_AGE_MINUTES=10 bash
  .claude/rules/shared/tools/janitor.sh --token creds --dry-run`.
- **DoD.** Sc. 1 observed RED then GREEN with run URLs; sc. 2 green; sc. 3–4 RED then GREEN; 5–7 recorded on at least
  one machine, the other OS stated as not run; **sc. 8–9 RED then GREEN (added 2026-11-07, the parent's epoch 8)**;
  `architecture.md:363` says the smoke's containers are named in the owner
  form, labelled and removed by one always-run step that never decides the verdict, **and a check step after it fails the
  job while a named container or volume is left**.

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
   (D9 #2; **revised, § *Revision* row 2:** a whole legacy literal in a `.cjs` and in a `.sh` ⇒ 1 each through the shipped guard, and no row asserts that a split spelling is not found); **[2026-11-07, the parent's epoch 8, row E2.5-a: read row 2 with this — at `37b9aa5` the F30 reader makes the split plants findings again: `"testsTo" + "Delete-"` in a `.cjs` and in a `.sh`, and `"testsTo""Delete-"` in a `.sh`, are each `legacy-name` (measured by the parent). The PR pins each as a positive test, "RED by hand once against a copy of the guard with the plant's line removed" (the parent's words).]** `Owned.Prefix` referenced from `src_mcp/tests/X.cs` ⇒ 1 `owner-blind` (D9 #14); `docker compose -p
   cred-vault-acme-test up` in `deploy/acme-test/run.sh` ⇒ 1 `docker-name`, with ~~`-p teststodelete-${OWNER}-creds-acme-$id`
   ⇒ 0~~ **`-p "$PROJECT"` ⇒ 0 (and a literal `-p teststodelete-u1001-creds-acme-…` ⇒ 0)** *[2026-11-07, the parent's
   epoch 8: `-p teststodelete-${OWNER}-creds-acme-$id` is one `docker-name` finding of the shipped guard at `37b9aa5`, and
   `-p "$PROJECT"` is clean (the parent's judge, a text scan). What the C# copy reads on the same lines is E2.5.S1's to
   observe.]*; `.github/workflows/docker.yml` ⇒ no docker finding from the C# guard (the pinned exclusion) — and, for the shipped
   Node guard (no new tests here: its own suite covers the classes), three facts pinned by running it over fixture
   workflows in `leftoversGuardFixtures.test.ts`: the D5 remover AFTER the reader ⇒ 0; the remover BEFORE the `docker
   logs` step ⇒ 1 `docker-run`; ~~`"$OWNER"` right after the prefix in the remover ⇒ `owner-blind`, `${OWNER}` ⇒ 0~~
   **the remover's names in double quotes ⇒ 2 `docker-run`, and a `-v` source alone in quotes ⇒ 1 `docker-run`; D5's
   workflow as written (option B) ⇒ 0** *[2026-11-07, the parent's epoch 8, row E2.4-a: the released guard reads no
   `${OWNER}` as an owner segment, so the struck fact cannot hold; the new facts are the parent's measured counterexamples]*.
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
| A failure test of the workflow: the job ends FAILED, the always-run cleanup ran and removed by exact name (observed in the job **by the check step, green; 2026-11-07, the parent's row E2.4-d**), `Publish` SKIPPED | S4 sc. 1 (both halves of the smoke), with the RED on the old shape; **sc. 8 for the remover's and the check's bodies** |
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
      exact-name step after the diagnostics, **followed by a check step that fails the job while a named container or
      volume is left (2026-11-07, the parent's epoch 8, row E2.4-k)**, and a failed smoke was observed FAILED with `Publish` skipped (S4).
- [ ] acme leaves no `state/`, folder, container, **volume** or network after a green or a failed run (S4); **after a kill,
      the next run's janitor removes its containers, network and named volumes on Linux (2026-11-07, the parent's epoch 8,
      row E2.4-f)**.
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

### E2.3 build record, part 5 — S5 (2026-11-07, branch `feat/test-leftovers-e2.3`, not pushed, not merged)

Built by a Sonnet coder from [PLAN_test_leftovers_E2.3_brief.md](PLAN_test_leftovers_E2.3_brief.md) § 3.5, test first, after the S4 commits (not rewritten). Commits, oldest first: S5 RED (the scan expects only the three E2.5 lines, `AotKitFolderTests`, the
kit test prints its folder); GREEN, the kit and the CLI test paths; GREEN, the archive, key-file, runner and store tests; the three minors of the S4 review (one commit, below); this record. Builds: each of the five test projects by name,
`nice -n 19 dotnet build <project> -c Release -m:4 --disable-build-servers`, 0 warnings, 0 errors. `dotnet format whitespace` and `style --verify-no-changes` on the server and service-defaults test projects: clean; `sweeper-scan`: none found.
**Correction to part 4:** it lists FOUR differences from the brief (the coordinator's report said five; the record is right).

**What was built.**
- **S5.0 — the scan.** `OwnedByS5` is gone; the expected list is the three lines of S3 (`AgentRelayTests`: the default socket path twice, the refused-path literal) and nothing else, over the five test trees.
- **S5.1 — `AotKitFolderTests`** (server project, in the server collection; **POSIX and WSL only**, skipped on Windows saying why: the server executable runs on Linux only, F14, and two executables at once on Windows meet F29). It starts THIS executable twice at once
  through `HostProcess.Start`, each running only `BackupArchiveCommandTests.ItLeavesAKit...`, both with one private `TMPDIR` that the test holds (so what they leave is still there to be read), and `CREDS_AOT_KIT_DIR` set empty. It asserts both exit 0, each printed an
  `aot-kit folder:` line, the two folders differ, each is an owned name in the given `TMPDIR`, each is gone with its claim after both have ended, and no `aot-kit` entry is left in the `TMPDIR`.
- **The kit test** now prints `aot-kit folder: <path>` and one line with the two commands. By default the folder is `_owned.Dir("aot-kit")` (per run, removed with the test). `CREDS_AOT_KIT_DIR` names a folder of the person's own: made if missing, overwritten, never removed (never set in CI).
  The test is renamed `ItLeavesAKitInAFolderOfItsOwnSoTheNativeBinaryCanBeCheckedByHand` (nothing else names it but the new test's filter).
- **Sites moved:** `BackupArchiveCommandTests` (`backup-cli`, parent of `item`), `BackupArchiveTests` (`backup`: the owned folder IS the unique parent, so the listing assertions of the staging folder still read only this test's entries; the claim is a sibling), `BackupKeyFileTests`
  (`key-file`; `:92` is `Owned.TempRoot()` under a marker: a path nothing creates), `BackupRunnerTests` (`backup-run`), `BackupStoreTests` (`backup-store`). Helpers that call the factories became instance methods; the classes are `IDisposable` over an `OwnedScope`.

**The RED list** (failing text, each seen before its code):
1. Scan: `... contains 7 item(s) too many.` with `UNEXPECTED` for `BackupArchiveCommandTests.cs:143` and `:277`, `BackupArchiveTests.cs:484`, `BackupKeyFileTests.cs:92` and `:148`, `BackupRunnerTests.cs:784`, `BackupStoreTests.cs:482`.
2. S5.1, said honestly: on the pre-S5 code, with only the print line added, the two overlapping runs BOTH PASSED (as the brief says: two runs write one fixed folder). What fails is what they printed: `Expected paths[0] not to be
   "/tmp/c23s5/testsToDelete-u1000-creds-kit-tmp-tknGWe/cred-vault-aot-kit" because two runs at once do not share a folder.` (the same path twice; it is not an owned name; it is still there afterwards).
3. By hand, after GREEN: the kit class's `Dispose` made empty -> `Expected first.ExitCode to be 0 because the kit test passes: WARNING: [...] aot-kit folder: ...` (the child's own end-of-run audit names the leftover). Put back.

**Counts, sc. 2 (a private short `TMPDIR` per executable, whole suite, top-level entries / all entries below)**, measured on a worktree of `main` (`b1cf565`, built Release the same way) and on this branch after S5:

| Executable | `main` | after S5 |
|---|---|---|
| `CredVaultServer.Tests` | 7 / 920 (`cred-vault-tests` and the six backup parents) | **0 / 0** |
| `CredsCli.Tests` | 6 / 6 (`clr-debug-pipe-*` x4, `dotnet-diagnostic-*` x2: a killed host's) | **0 / 0** |
| `CredsMcp.Tests` | 6 / 6 (the same shapes) | **0 / 0** |
| `CredsBroker.Tests` | 7 / 24 (`creds-endpoints-*`) | **0 / 0** |
| `CredsForDevs.ServiceDefaults.Tests` | 0 / 0 (82 tests then) | **0 / 0** |

Total on `main`: 26 top-level entries, 956 below them; after: 0 old-form and 0 owner-form. The brief's "about 190 folders" is not what this machine shows: the server's 920 is mostly the contents of the backup parents (the parents hold the 31 + 56 + 37 + 36 + 25 + 17 + 2 folders, many with files).
The socket folders were counted in `/tmp` itself (the real root): nothing new there after a full pass of the five.

**Counts, sc. 4 and the hand clean-up (row 2, E2 (d)), this WSL machine, over `/tmp`, `/var/tmp`, `/dev/shm` and `$XDG_RUNTIME_DIR` (`/run/user/1000`), by `find <root> -mindepth 1 -maxdepth 1 -name <pattern>`, for the brief's twenty names:**
- Before: **42** entries, all in `/tmp`, none in the other three roots: `cred-vault-tests`, `cred-vault-backup-run`, `-backup-store`, `-backup`, `-backup-cli`, `-key-file`, `-aot-kit` (one each: 7) and 35 `creds-endpoints-*`; 0 owner-form. All owned by this user, made on 2026-11-07
  (by test runs of earlier builds of this branch and of `main`; the brief's author found 0 at 13:57), and 9,119 entries including their contents. Checked immediately before removing: no process had any of them as its working directory or an open file, and none was newer than two minutes.
- Removed: those 42 (by those names, this user's, older than two minutes, held by nobody), and nothing else. After: **0**, and after the full pass of the five executables with the real temp root: **0** old-name and **0** owner-form entries in all four roots.
- A search by name at one moment, not a proof; it does not see a root another `TMPDIR` named (the private runs above cover that). `dotnet-diagnostic-*` sockets are not on the list (F13).

**Done-when 2, the C# guard by hand (Q11 (a); NOT committed).** The template's `LeftoversRepositoryGuardTests` at `dew_flow_mcp` `197cc76`, with the manifest's one operation (the namespace line), as a scratch file in `src_service_defaults/tests/Leftovers/`, run against this tree with
`LeftoversGuard.Scan(repoRoot, repoRoot)`; then deleted. It read the classes `raw-temp`, `raw-worktree`, `docker-name`, `docker-run`, `shared-store`, `ryuk-off`, `owner-blind`, `legacy-name` (and the exemption and token checks). **18 findings, in three groups:**
- shell, `raw-temp` `mktemp` (9, E2.4's): `.github/scripts/mcp-listen-smoke.test.sh:19`, `start-server-and-wait.sh:107`, `start-server-and-wait.test.sh:28`, `version-smoke.test.sh:14`; `deploy/restore-archive-itest.sh:45`, `restore-archive.sh:61`, `restore.sh:102`; `install.sh:63`, `:76`.
- docker (6, E2.4's): `.github/workflows/docker.yml:78` (`docker-name` for `cv`, and `docker-run` without the remove flag), `:101` and `:102` (`docker-name` for the volumes `cv-refused-data`, `cv-refused-logs`), `:105` (`docker-name` for `cv-refused`, and `docker-run`).
- C# (3, E2.5's): `src_cli/tests/AgentRelayTests.cs:38`, `:39`, `:278` (`raw-temp`, the `/tmp` literals that create nothing; the same three the scan test lists). No other C# file. `CallerIdentityTests.cs:196` is not a finding (a `/tmp` inside a raw string that holds a quote; the guard misses it, S3's follow-up).

**The three minors of the S4 review** (one commit). (1) `VaultServer.Dispose(bool)`: `WebApplicationFactory.Dispose(true)` reaches `DisposeAsync`, which reaches `Dispose(true)` again, so the body ran twice and a removal that gave up warned twice (rule 2: one). A `_ended` flag after
`base.Dispose` makes the rest run once. RED first, a locked subfolder standing in for a removal that gives up: `Expected collection to contain a single item because one removal that gave up is one warning, not one per run of the dispose body, but found {"owned: could not remove ... ", "owned: could not remove ...` (two). GREEN: one.
(2) `OrgRegistrationTests.HookWorld`'s `what` is `org-reg-hook`. (3) The dead `Directory.CreateDirectory(_root)` in `StartupGuardsTests` is gone.

**Follow-up (todo, not built):** `VaultServer` sets no `Logging__Directory`, so each test host writes a per-run log under `tests/bin/Release/net10.0/logs/` (gitignored, pruned by the product's 14-day retention); an owned log folder per server is a todo.

**Totals** (Release, one at a time, after the last code commit; the private-`TMPDIR` pass, the real-root pass gave the same but `CredsMcp.Tests` 174 / 2 / 168 / 4): `CredVaultServer.Tests` 830 / 0 failed / 827 passed / 3 skipped (828 after S4; +1 `AotKitFolderTests`, +1 the dispose-once test);
`CredsCli.Tests` 156 / 0 / 153 / 3; `CredsMcp.Tests` 174 / 2 / 169 / 3 (the two WSL `ParentWatchProcessTests`); `CredsBroker.Tests` 164 / 0 / 161 / 3; `CredsForDevs.ServiceDefaults.Tests` 606 / 0 / 581 / 25. Total 1,930.

**Not run / unproven.** Windows and macOS legs: `AotKitFolderTests` is skipped on Windows by design (F29); the macOS run of the moved backup classes; the Windows "not cleaned, not needed" machine. sc. 4 on Windows is Q10's. The row-24 Node guard and the barrier rescan (row 1) are not this story's by-hand
list and were not run here. The skip-count of `CredsMcp.Tests` varies by one between runs (3 or 4), as in part 3b.

**Differences from the brief.**
1. **S5.1's RED is the printed path, as the brief says**, and in this build it also fails on "two runs print one path" (the fixed folder is the same string), which the brief did not expect; the overlap itself still passes on `main`.
2. **The children get a `TMPDIR` the test holds**, not `HostProcess`'s hand-over (which removes its folder when the child ends and would hide the leftover): the test names all three variables, so the hand-over does not apply.
3. **The kit test also prints the two commands** in one warning line (the test output has no other channel that survives a passing test); the person who wants the kit sets `CREDS_AOT_KIT_DIR`.
4. **"about 190 folders"** (the brief's row 5) is 956 entries on `main` here, as above.
5. **Done-when 2's list is recorded here, not on a PR**; the scratch test file was deleted.

### E2.3 build record, part 5b — the final fix round (2026-11-07, branch `feat/test-leftovers-e2.3`, not pushed, not merged)

From the coai code gate (G0, G3, G5) and the Opus review of S5 (four minors). Four commits, then this record. Builds Release, `-m:4 --disable-build-servers`, 0 warnings; `dotnet format` whitespace and style clean on the server, mcp and service-defaults test projects.
- **G0.** `ParentWatchProcessTests.Dispose` no longer skips everything while the host runs: `EndHostThenRemove(pid, remove, killAndWait)` kills the host's tree through `HostProcess.KillOnDispose` (bounded wait), and only then removes the log and temp folders. When
  the end is not confirmed the Reaper's exception goes up and the folders are NOT removed (claimed and registered, so the audit names them). Pinned by `ParentWatchDisposeTests` with a fixture child (`sleep`; Windows skipped, saying why), so it runs where the real
  host cannot (this machine's WSL path): host running -> ended, THEN removed; end not confirmed (seam returns false) -> throws, nothing removed; already ended -> removed. RED, the fix taken out (the old "running: return"): `Expected running to be equal to {False} ... but found empty collection.`
  and `Expected a <System.InvalidOperationException> to be thrown, but no exception was thrown.`
- **G3.** There was no 100 ms sleep before a first check at `HostProcess.cs:403` in this tree: the group wait (`Child.TryEnd`) already checks first and then sleeps 25 ms. What changed: the pause now backs off 5, 10, 25, 50, 100 ms (last repeats), the bound unchanged. No behaviour change, no RED.
- **G5.** `ci-clients.yml`: one line before each audit self-test run, in bash and in pwsh, naming the executable and the case (`audit self-test: CredsCli.Tests, case '1'`). A line, not a `::group::`, so a failure's reason is never inside a collapsed group.
- **S5 minors.** (1) `AotKitFolderTests` asserts the children's `TMPDIR` is EMPTY. (2) The commands warning of the kit test says it is removed when the test ends and `CREDS_AOT_KIT_DIR` keeps a kit. (3) The printed-folder regex is `aot-kit folder: (?<path>.+?)\s*$`, multiline (a temp root with a space).
  (4) `VaultServerFolderTests`' give-up test creates the server inside the `try`, and its `finally` uses `SingleOrDefault(...)?.Dispose()`.

**Follow-ups.** The copied `LeftoversSweep.cs` enumerates every entry of the temp root and filters in managed code; a search pattern at the API level is the template's change (`dew_flow_mcp`). `VaultServer` sets no `Logging__Directory` (part 5).

**Totals** (Release, one at a time, private `TMPDIR`): `CredVaultServer.Tests` 830 / 0 / 827 / 3; `CredsCli.Tests` 156 / 0 / 153 / 3; `CredsMcp.Tests` 177 / 2 / 172 / 3 (+3 `ParentWatchDisposeTests`; the two WSL `ParentWatchProcessTests` as before); `CredsBroker.Tests` 164 / 0 / 161 / 3;
`CredsForDevs.ServiceDefaults.Tests` 606 / 0 / 581 / 25. Total 1,933. Private-`TMPDIR` entries after: 0 in each; old-name and owner-form entries in the four roots: 0.

### E2.3 build record, part 5c — the Windows leg of PR #311 (2026-11-07, branch `feat/test-leftovers-e2.3`)

**Measured fact:** on `windows-latest` (run 42388598855) a Node-made folder of the test process was the caller's own, not `BUILTIN\Administrators`', although the process is elevated. Two tests had assumed the other owner and failed:
`WindowsHandoffTests.The_natural_node_output_not_re_owned_is_preserved_as_foreign_uid_on_an_elevated_process` (`Expected Scope.IsMine(dir) to be False because premise: a new folder of an elevated run is owned by BUILTIN\Administrators ... but found True`) and
`SocketRootSweepTests.A_folder_a_live_process_made_survives_...` (actual `"live"`, expected `"foreign-uid"`). The stories (E2.3.S2) say the test "says which outcome the runner's own files gave"; it must not assert the premise. **Fix (one commit):** both tests now measure
`Scope.IsMine` of the folder and of its claim and assert the branch that implies (caller-owned: collected, resp. `live`; another SID: `foreign-uid`, kept), and each writes one test-output line (`windows ownership: elevated=...; a new folder of this run is owned by ...; outcome: ...`). `OwnedCreds.OwnerKind(path)`
names the owner (the caller, `BUILTIN\Administrators`, another account; on POSIX the uid). The cases with a re-owned or foreign fixture are unchanged. The first test is renamed `The_natural_node_output_not_re_owned_is_judged_by_its_real_owner_and_the_runner_says_which_outcome_it_gave` and is no longer skipped on a non-elevated runner.
Checked on Linux only (`CredsForDevs.ServiceDefaults.Tests` 606 / 0 failed / 581 / 25; the Windows case is skipped there, the socket test takes the `live` branch); the Windows legs are CI's. F31's text stands as a limit that MAY show on a runner; this runner did not show it.

### E2.4 build record, part 1 — S1 (2026-11-09, branch `feat/test-leftovers-e2.4`, not pushed, not merged)

Built by a Sonnet coder from [PLAN_test_leftovers_E2.4_S1_spec.md](PLAN_test_leftovers_E2.4_S1_spec.md), test first. Commits, oldest first: `2d0a188` RED (`owned.test.sh`, no helper);
`e7baf47` `owned.sh` (GREEN on Linux); `0c1d27b` the guard fix of the test file (T17); `45a1225` the CI step and the shellcheck line; `59859b9` `module_tests.md`; `4225f8b` the janitor's own words in the test output;
this record. Only S1 is built; S2 to S4 are not touched.

**What was built.**
- `.github/scripts/lib/owned.sh`: `owned_token`, `owned_owner`, `owned_trap`, `owned_exit_chain`, `owned_signal`, `owned_dir`, `owned_remove`, `owned_cleanup`, with the state in three indexed arrays (`OWNED_PATHS`, `OWNED_STATES`, `OWNED_TEXTS`),
  the states `claimed`, `created`, `kept`, `released`, the claim write with the `-e`/`-L` pre-check, `noclobber` and the read-back, the busy window (`OWNED_BUSY`, `OWNED_PENDING`), the Linux record `:<start>:<ns>` (field 22 after the last `)`, one `getconf`, one `readlink`).
  The word `mktemp` is nowhere in the two files. `git grep -n REPO_TOKEN -- .github/scripts/lib` is one line.
- `.github/scripts/lib/owned.test.sh`: T1 to T21 (T17 is by hand, below), every case in a real child `bash`, waited for with `wait`, read after the child is gone; the scope premise before every janitor and Node-sweep run.
- `ci-clients.yml`: step *Self-test the shell helper* after the version-smoke self-test (macOS runs `/bin/bash`); `ci-server.yml`: `$SHELLCHECK -x` over the two files. `research/module_tests.md`: one paragraph.

**The RED list.**
1. The trivial RED (no helper): `.github/scripts/lib/owned.test.sh: line 60: .../owned.sh: No such file or directory` then `FAIL cannot source .../owned.sh`, exit 1 (the source line, as the spec says).
2. T4 and T13, by hand, the folder made before the claim (a copy of the helper with `mkdir` at the start of `owned_claim`): `FAIL T4 at the hook the claim exists and the folder does not: expected [true], got [false]`; `FAIL T13 the root holds exactly ONE entry: expected [1], got [2]` and `FAIL T13 the entry: testsToDelete-u1000-creds-x-440d5364` (an unclaimed folder; the folder first, the claim second is what both sweeps would list `unmarked:`).
3. T8, by hand, the squatter adopted (`released` not set, state `created`, claim kept): `FAIL T8 the squatter's sentinel survives: condition false: test -f .../testsToDelete-u1000-creds-x-cccccccc/sentinel`; `FAIL T8 the root holds exactly one entry: expected [1], got [0]`; the same in T20b.
4. T20, by hand, `owned_signal` exits at once (no `OWNED_BUSY` check): `FAIL T20a the root holds NO folder and NO claim: expected [0], got [1]` (a folder without its claim).
5. T18, by hand, the chain as `cleanup; owned_cleanup` (no `set +e`, no `exit "$rc"`): `FAIL T18 the status is 3: expected [3], got [1]`; `FAIL T18 the root is empty: expected [0], got [2]`; `FAIL T18 with no owned_trap the root is empty: expected [0], got [2]`.
6. T7a, by hand, a tracked caller (`git add` only, then `git rm --cached`) with `trap cleanup EXIT`: `FAIL T7a .github/scripts/zz-caller.sh: sets a trap of its own: 4:trap cleanup EXIT`; the fixture half passed.
7. T2, T13, T15, T16, by hand, `owned_owner` without `:<start>:<ns>`: `FAIL T2 Linux record: u1000:jinx~Ubuntu@linux:933738`; `FAIL T2 the claim line equals the reference's formatOwner (byte for byte): expected [u1000:jinx~Ubuntu@linux:933738:1794264044:4026532216], got [u1000:jinx~Ubuntu@linux:933738]`;
   `FAIL T2 parseOwner reads start and ns ...: expected [ok ns start], got [ok nsDIFF startDIFF]`; `FAIL T15 the janitor collects folder and claim (root empty): expected [0], got [2]` with the janitor saying `skipped: folder ... liveness unknown for process 981265; the record names no pid namespace, or another one than this reader's`; the same in T16. This is the counterexample of the parent's item 8.1.
8. T19, by hand, a `"${OWNED_PATHS[@]}"` loop: **no RED on Linux** (bash 5.3.9 accepts an empty array under `set -u`); it is red on macOS bash 3.2 only, so that RED is CI's.
9. T5, found by running: `FAIL T5 exactly one of two racing mkdir succeeds (statuses 0, 0): expected [1], got [2]` (see difference 1).

**What ran where.** Linux, bash 5.3.9 (WSL, Ubuntu), run by hand with `TMPDIR` set to a scratch folder and once in the default root: `107 passed, 0 failed`, four times in a row after the T5 change; T13, T15, T16 ran the shipped janitor (`JANITOR_MIN_AGE_MINUTES=10`, `--token creds`, a private root) and the mounted `sweepLeftovers` for real, scope premise green (this machine has no `docker` binary; nothing was run with docker).
The record on this machine: `u1000:jinx~Ubuntu@linux:896992:1794263866:4026532216`. T17: `leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"` gives 16 findings, none under `.github/scripts/lib/` (the first draft of the test file had two: a printf format and a `${base#testsToDelete-}` cut, both rewritten); `git grep -n REPO_TOKEN -- .github/scripts/lib` is one line.

**What did not run, and why.**
- macOS (`/bin/bash` 3.2) and Git for Windows: CI only. So T3, T12, the Windows branches of T13, T15 and T16 (`windows_listing`, the F16 `unverified:` line, F31's `[ -O ]` outcome), T21's macOS asserts, T19's RED and T11 on macOS never ran. The by-hand review of the code for bash 3.2 found no `declare -A`, `mapfile`, `${x,,}`, quoted `=~` pattern, or `"${arr[@]}"` of a possibly empty array.
- `shellcheck` is not installed here and `docker` is not to be run, so the spec's by-hand shellcheck did not run. Directives added without measuring: `# shellcheck shell=bash` and `disable=SC2329` (owned.sh), `disable=SC2329,SC2016,SC2015,SC2012` (test), `disable=SC2206` on the one `words=($rest)`, and `-x` in the CI line. CI's `ci · server` is the first measurement.
- `actionlint` is not installed: both workflows were parsed with PyYAML only.

**Differences from the spec.**
1. **T5's race, a measured fact about this machine:** `mkdir` here is uutils coreutils 0.10.0, and two racing plain `mkdir` on one path both succeeded in about 1 run of 14 (22 of 300 in a loop). The spec's premise (C5) "exactly one succeeds" is false for it. The test asserts "at least one" when `mkdir --version` says uutils, "exactly one" elsewhere, and prints a NOTE. The helper is safe against two live runs because the claim is an exclusive create; only a non-helper process that makes the same name inside the same microseconds could be adopted. **For the coordinator:** keep this, or decide whether `owned_create_dir` must stop relying on `mkdir` (no portable exclusive create of a folder exists in bash); it is not a plan change.
2. A second `source` of `owned.sh` keeps the registered entries (`OWNED_LOADED`); the spec says the arrays are declared when the file is sourced. The smoke scripts of S2 source it twice.
3. The line `REPO_TOKEN="creds"; OWNED_REPO="$REPO_TOKEN"` holds the second name for the patterns, so `git grep REPO_TOKEN` is one line (spec row 15).
4. The busy window covers the whole draw (claim write, registration, trap install, hook, create), not only the create, so a trapped signal never lands between the claim and its registration. Every path leaves it through `owned_leave`.
5. `OWNED_HOOK_AFTER_CLAIM` runs after the claim, the registration and the trap install, right before the create (the spec: between steps 1 and 2).
6. The traps are installed on the first call also under `OWNED_KEEP=1`.
7. `owned_cleanup` on a `created` entry whose claim no longer holds what this run wrote: one line, state `released`, folder left (the spec is silent; `owned_remove` refuses). `kept` is removable by `owned_remove` and untouched by `owned_cleanup`.
8. T8's by-hand RED: with the states of section 4, taking out the `released` transition leaves the state `claimed`, and the cleanup then removes only the claim, so the sentinel survives. The RED that gives "the sentinel is gone" is the adoption of the squatter (item 3 above).
9. Every case has its own temp root below the private root (the spec: `TMPDIR="$ROOT"` for all), because the scripts and control files would be entries of one shared root and "exactly one entry" could not be read.
10. T7a reads `*.sh` files only (`git grep -l 'lib/owned.sh' -- '*.sh'`); a workflow that names the file is no caller. T3's `tasklist` check runs inside T2's alive window; T14's logic is `windows_listing`, shared by T13 and T15 on Windows. T16 on Windows is listed as skipped.
11. `owned_next_id` takes ids from `OWNED_TEST_IDS` by removing them from the variable; when the list is empty the draw is random.
12. The test also takes `T_OWNED_SH` (the helper to test), the seam the by-hand REDs use.

### E2.4 build record, part 1b — the fix round after the Opus review of `owned.sh` (2026-11-10, branch `feat/test-leftovers-e2.4`, not pushed, not merged)

Commits: `95052ea` the tests (RED against the helper of `e9a2677`), `7c8f328` the helper, `61ec0b4` F2 uses HUP, `f0335b4` `module_tests.md`. Every review item is accepted. Each RED below was seen first against the old helper; then each fix was taken out of the new helper
(a changed copy, `T_OWNED_SH`) and the test was red again.

| Item | Test | RED (failing text) | Fix |
|---|---|---|---|
| 1 | `tf1` P1, P2 | `F1 P1 ... the status is the script's 3: expected [3], got [5]`; `F1 P1 the root is empty: expected [0], got [2]`; `F1 P2 the root is empty: expected [0], got [4]` | `owned_exit_chain`: `set +eu`, then `( "$OWNED_CALLER_FN" ) \|\| true` |
| 2 | `tf2` P3, P3b | `F2 P3 ... expected [143], got [129]`; `folder and claim are gone: expected [0], got [2]`; P3b `expected [3], got [129]`, `expected [0], got [6]` | `OWNED_BUSY=1` first in the chain |
| 3 | `t5` | `T5 exactly one of two racing owned_create_dir wins, 20 rounds (bad rounds: (0,0)(0,0)...): expected [0], got [9]` (the plain mkdir; 2 of 20 with the fix out) | `owned_create_dir`: `perl -e 'mkdir $ARGV[0] or exit 1'` when perl exists, else `mkdir` |
| 4 | `tf4` P4 | `F4 P4: the claim is not left (the root is empty): expected [], got [testsToDelete-u1000-creds-x-7da47ea1.owner ]` | the traps are set before the draw loop |
| 5 | `tf5` | `F5 WSL_DISTRO_NAME [   ]: ... expected [u1000:jinx@linux:...], got [u1000:jinx~-@linux:...]` | `[ -n "${wsl//[[:space:]]/}" ]` |
| 6 | `tf6` P7 | `F6 path: tf6/testsToDelete-u1000-creds-x-6a243180`; `F6 folder and claim are gone after the cd: expected [0], got [2]` | a relative root is made absolute (`cd` and `pwd`); one line and return 1 when it cannot be entered |
| 7 | `t9b` | green on the old helper (the check was there); with the registry check taken out: `T9b owned_remove of an unregistered folder with our own record returns 1: expected [1], got [0]` | none (the test is the fix) |
| 8 | the `source` line of the test | not measured here (no shellcheck) | `# shellcheck source-path=SCRIPTDIR` then `source=owned.sh` |
| 9 | `tf9`, `t7a` | `F9 OWNED_HOOK_AFTER_CLAIM is named once: expected [1], got [0]` (and `OWNED_TEST_IDS`); with the old scan pattern: `T7a fixture [trap f 0]`, `[echo before; trap cleanup EXIT]`, `[if x; then trap cleanup TERM; fi]`: the pattern found nothing | one stderr line per seam, once; the scan drops comment lines and finds a trap after `;`, `then`, and `trap f 0`; the header says sourcing overwrites a caller's `REPO_TOKEN` |

**The coai plan round (131e644a), four points, accepted (2026-11-10).** Commits `920c9df` (tests, RED) and `7679283` (helper).
1. T7a joins backslash-continued lines (a comment line is never joined) and has planted multiline fixtures. RED with the old scan: `T7a multiline fixture: the pattern found nothing`, `T7a multiline fixture 2: ...`.
2. `owned_dir` and `owned_owner` refuse an empty `OWNED_TOKEN`; `owned_token` sets it empty on failure. Test G2: a failed token (the Windows branch forced on Linux, no node on `PATH`) returns 1, leaves the token empty and makes nothing; a token function that says ok and leaves it empty makes nothing; after a success the cache holds the value and a changed environment does not change it (the cache holds only a success). RED, the empty-token checks taken out: `G2 an empty token after a successful call: owned_dir returns 1: expected [1], got [0]` (the folder was `testsToDelete--creds-x-...`). The failed-token case is green on the old code too: it never set the token on failure.
3. The locals of `owned_dir` are `__owned_dir_*`. Test G3: `owned_dir dir x`, `var`, `what`, `root`, `i`, `rc`, `draws`, `re_var` each set the caller's variable. RED: `G3 owned_dir dir x: got [dir=UNSET]` (also `var`, `what`).
4. A seam `OWNED_PROC` (the /proc root, named once on stderr like the other seams) and a quiet degrade. Test G4 (Linux): no btime, a btime that is not a number, a field 22 that is not a number, a short stat line, no ns link: the record ends after the pid, no shell error on stderr; a good fake /proc with a command name `a b) c` gives start = btime + field 22 / CLK_TCK and the link's ns. RED: with the seam ignored, every case gets the real start and ns (`G4 nobtime: record: u1000:jinx~Ubuntu@linux:1417354:1794270450:4026532216`). Code that was already right for non-numeric input; only the missing `/proc/stat` file printed a shell error, now guarded by `-r`.

**The coai code gate (131e644a), six points, accepted (2026-11-10).** Commits `825afab` (the split and the names), the RED commit of the tests, and the helper commit.
1. Pathname expansion of the stat fields: the fields are read with `set -f` (the caller's own setting is put back). The review's case, files named `S`, `R`, `0` in the folder, is NOT a defect: a word without `*`, `?` or `[` expands to itself, and the test (`G4 globfiles`) is green before and after. The real case is a `*` in a field (only a fake `/proc` through `OWNED_PROC` can show it): RED `G4 globstar: ... expected [1002:4242], got [1000:4242]`; with `set -f` taken out, red again.
2. `owned_dir` is 14 lines now; the helpers are `owned_prepare`, `owned_say_seams`, `owned_register`, `owned_release`, `owned_settle`, `owned_draw`, and `owned_owner` gained `owned_host` and `owned_linux_suffix`. The longest function is `owned_token`, 30 lines. No behaviour change (the suite stayed green; no RED applies).
3. `owned.test.sh` (1,073 lines) is a 20-line runner plus `owned.test.lib.sh` (131), `owned.test.record.sh` (about 430), `owned.test.exit.sh` (436) and `owned.test.sweeps.sh` (166). Each area runs in its own bash with its own private root; every case is kept (the totals per area: 90, 85, 26 asserts; the shared base asserts run once per area). `ci-clients.yml` still calls `owned.test.sh`; the shellcheck line lists all six files.
4. The test functions are named for the guarantee (for example `squatter_folder_is_never_adopted_or_removed`); a comment `# case T8` above each keeps the number, and the printed names still start with it.
5. `owned_uname` fails with one line that names uname; `owned_token` and `owned_owner` stop on it. RED: `G5 the message names uname: expected [1], got [0]` (the old code already returned 1, with a line that did not name uname).
6. `owned_norm` is parameter expansion (pairs of separators shrink to one, then each becomes `-`; real hyphens stay). Not a plain `--` collapse, which would change a real `x--y`. Tests: `F5` with `My  Dis@:tro--x  ` and a long name of 25 spaced segments; red with the collapse taken out (`got [u1000:jinx~My--Dis--tro--x--@linux:...]`).

**The coai code gate, second round, three points, accepted (2026-11-10).**
1. `owned_draw` keeps its index in a local (`idx`), copied right after `owned_register`, so a hook that calls `owned_dir` cannot change what the outer draw settles. Test H1. RED: `H1 owned_remove of the outer folder returns 0 (its entry is created): expected [0], got [1]`; `H1 the exit chain removes the nested folder and its claim (the root is empty): expected [0], got [1]` (the outer entry stayed `claimed`, its folder was left without a claim). Red again with the global index put back.
2. The caller exclusion in T7a is `^\.github/scripts/lib/owned(\.test.*)?\.sh$`. No behaviour changes; no RED applies.
3. `OWNED_HOOK_AFTER_CLAIM` runs only when it names a defined function (`declare -F`); otherwise one stderr line and it is ignored. Test H2 (a script `hookcmd` on `PATH`). RED: `H2 a command of that name was not run: condition true: test -e .../th2.ran`; `H2 one line says the hook is not a defined function: expected [1], got [0]`. Red again with the check taken out.

**Found while testing, not in the review:** a child started with `&` by a non-interactive script ignores SIGINT from its start, and bash cannot trap a signal that was ignored at entry. So the F2 test sends HUP as the second signal; the helper's INT trap works in a foreground script and not in a `&` child (a limit of the shell, not a defect of the helper). P3b of the review (INT during `owned_remove_at`) is covered by a HUP sent from inside the caller's function.
**Effect of item 1:** the caller's function runs in a subshell, so a variable it sets is not seen by `owned_cleanup`; the function must act on files or processes, which is what a clean-up does.
**Not run here:** shellcheck (item 8 and the new directives are unmeasured), macOS bash 3.2 and Git for Windows (CI). Totals on Linux: 138 asserts, 0 failed, ten runs in a row (see the report).

### E2.4 build record, part 2 — S2, the shell scripts (2026-11-10, branch `feat/test-leftovers-e2.4`, not pushed, not merged)

Built by a Sonnet coder from [PLAN_test_leftovers_E2.4_brief.md](PLAN_test_leftovers_E2.4_brief.md) § 3.1, test first, on `092bad8`. Commits, oldest first: `9608b43` RED (S2.4, the two smoke self-tests);
`232bef2` the two smoke scripts and their self-tests; `4da990b` RED (S2.5, case `j`); `aba13a5` `start-server-and-wait.sh`, its self-test and `http/README.md`; `a0ab9df` `restore-archive-itest.sh`; `57cc72b` the four CI steps and the `-x` of shellcheck; this record with `module_tests.md`. S3 and S4 are not touched.

**The RED list** (every run by hand with `TMPDIR` a private empty folder; text is from the run).
1. S2.1, `mcp-listen-smoke.test.sh`, a stub `chmod` first on `PATH` that writes a marker and exits 1. Premise: `marker exists: yes; script exit: 1`. RED on `092bad8`: `after: 1 entries: tmp.qhQfmehkSb`. GREEN: `after: 0 entries`.
2. S2.2, `version-smoke.test.sh`, the same: RED `after: 1 entries: tmp.jFAOO3XIds`; GREEN 0.
3. S2.4, the new cases of each smoke self-test, against the old smoke scripts: `FAIL off CI: a binary that is not executable fails after the folder is made and leaves nothing — expected exit 1 saying 'not an executable' and an empty root; exit 1, left: [creds-mcp-listen-smoke-1594450]`; `FAIL off CI: a passing run leaves nothing — … left: [creds-mcp-listen-smoke-1594460]`; and `FAIL off CI, cli: a run that writes no log … left: [creds-version-smoke-1594946]`, `… a passing run leaves nothing … left: [creds-version-smoke-1594960]`. GREEN with the migrated scripts. Taken out again (the two smoke scripts of `9608b43` with the migrated self-tests): the same four FAIL lines.
4. S2.5, case `j`, against the old `start-server-and-wait.sh`: `the root holds: [start-server-y3mEbg.log]; the claim reads: []` and `FAIL j. with no START_SERVER_LOG the log is in an owned folder with a claim, kept for a sweep`. GREEN: one `testsToDelete-u1000-creds-server-log-<8 hex>` folder with `server.log`, its `.owner`, the record's pid the script's own and gone. The old script put back: red again.
5. S2.6, nine worlds, one run of `restore-archive-itest.sh` on `092bad8`: `after: 9` (`tmp.DmM5sh9ZFP` and eight more); GREEN `after: 0` (the run takes about 3.5 minutes: the restore script's health waits).
6. S2.7, the interrupt: `perl -e '$SIG{INT}="DEFAULT"; setpgrp(0,0); exec @ARGV' bash mcp-listen-smoke.test.sh`, a signal to the group after the first `ok` line. RED on `092bad8`: SIGTERM, exit 143, `after: 1 entries: tmp.Oo2xsY5yHo`; SIGHUP, exit 129, one `tmp.*`. GREEN: INT 130, TERM 143, HUP 129, each `after: 0 entries`, no survivor.
7. S2.3, positive only: `start-server-and-wait.test.sh` with a private `TMPDIR` (all cases, and `START_SERVER_CASES=g`) leaves 0 entries. A signal while the script waits: INT exit 130, HUP exit 129, the server stopped, the kept log folder and its claim stay (by design).

**The guard.** `leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"`: 16 findings before, 11 after. The five shell `raw-temp` lines S2 owns are gone (`mcp-listen-smoke.test.sh:19`, `start-server-and-wait.sh:107`, `start-server-and-wait.test.sh:28`, `version-smoke.test.sh:14`, `deploy/restore-archive-itest.sh:45`). Left: `restore-archive.sh:61`, `restore.sh:102`, `install.sh:63`, `:76` (product scripts, E2.5), six in `docker.yml` (S3), `commandParse.test.ts:40`.
`owned.test.sh` after S2: `90 + 93 + 26` asserts, `0 failed`; T7a `no caller sets a trap of its own (7 scanned)`.

**What only CI runs.** macOS (bash 3.2) and Git for Windows legs of the self-tests and of the new off-CI cases; the four `RUNNER_TEMP` root checks; shellcheck (not installed here, nothing measured: the `# shellcheck source=` lines, `-x` on two CI lines, `disable=SC2317,SC2329` on `on_exit`); actionlint (not installed; the two workflow files were parsed with PyYAML). `restore-archive-itest.sh` ran here under its own `nice` re-exec; the CI run has `CI=true`.

**Differences from the brief.**
1. `start-server-and-wait.sh` had its own `trap interrupted INT TERM HUP` (and `trap - INT TERM HUP`), which T7a flags in any caller. The trap became `owned_trap on_exit`, set before the first step that can fail; `on_exit` stops the server only while `waiting=1`, and every path that ends the wait itself sets `waiting=0` first. Effect: an interrupt now ends with 128 plus the signal (130, 143, 129), not always 143; the clean-up runs in a subshell, so it acts on the process by pid only. The script now sources `owned.sh` on every run, also with `START_SERVER_LOG` set (the helper needs no node and no mount on Linux or macOS unless `owned_dir` is called).
2. Row 9 says `git grep 'creds-mcp-listen-smoke-\|creds-version-smoke-'` is 0 after S2. It is 2 (the given-root branches, which the brief § 3.1 item 2 keeps unchanged); the off-CI leaf is gone.
3. `restore-archive-itest.sh`: `source … || exit 1` (a failed `source` without `set -e` goes on to `owned_dir: command not found`, found by running a copy). The script has no `set -e`, so no stubbed-failure RED applies to it; its RED is S2.6's nine entries.
4. S2.7 as written ("RED on `main`: its `tmp.*` stays") is true for SIGTERM and SIGHUP only. SIGINT on `092bad8`: the run goes on to its summary and removes its folder (bash waits for the child, which ends normally). A `&` child ignores SIGINT from the start and bash cannot trap that, so the signal test starts the script through `perl` with SIGINT at its default.
5. `ci-server.yml`: `-x` added to the shellcheck lines of `start-server-and-wait*.sh` and `restore-archive-itest.sh` (the `source`); `restore-archive-itest.sh` moved to its own line. The smoke scripts and their tests are still not shellchecked in CI (I16, a todo, not built).
6. `http/README.md` and the two smoke scripts' headers say what the new default does, in the places the brief names.

### E2.4 build record, part 3 — S3, the Docker smoke carve-out (2026-11-10, branch `feat/test-leftovers-e2.4`, not pushed, not merged)

Built by a Sonnet coder from [PLAN_test_leftovers_E2.4_brief.md](PLAN_test_leftovers_E2.4_brief.md) § 3.2, test first, on `abf693a`. Commits, oldest first: `7fd5323` RED (S3.3, `dockerSmokeLeftovers.test.ts`); `faa0fb8` `docker.yml` and the test cut to the complexity limit; this record with `research/module_tests.md`. S4 (acme) is not touched. **The hosted evidence of sc. 1 and sc. 2 is NOT yet gathered**: nothing runs Docker or a workflow here. The dispatches are listed below for the coordinator. *(Gathered afterwards, see "Hosted evidence of S3" in part 2b: runs P 42735113631, R 42735252947, G1 42735352830, G2 42735473885, S3.2 42735590128, G3 42738357610.)*

**The RED list** (text from the runs; `TMPDIR` a private empty folder; the folder was empty after every run).
1. S3.0, the shipped guard (`leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"`) on `abf693a`: 6 findings in `docker.yml` (`:78` and `:105` `docker-run` and `docker-name`, `:101` and `:102` `docker-name`). After S3: **0** in `docker.yml`; the whole repository 5 findings (`restore-archive.sh:61`, `restore.sh:102`, `install.sh:63`, `:76`, `commandParse.test.ts:40`).
2. S3.3, `dockerSmokeLeftovers.test.ts` on `abf693a`: 18 of 20 fail, 2 pass (the two verdict tests: nothing there turns a failure green). Each fails for the step that is not there: `no step named "Name the smoke's resources"`, `2 steps remove a container or volume, expected exactly one` (the old inline removals), `no step named "Check that nothing of the smoke is left"`, `no owner label: docker run -d --name cv \\`, and the guard test `expected [] … cls: 'docker-name', file: '.github/workflows/docker.yml'`.
3. The same file against the NEW `docker.yml` with one fault made in the real text, by hand (each then put back):
   - (b) the first removal without `|| true`: `E2.4-b: under bash -eo pipefail every removal runs although the first one fails` and `E2.4-b: there is one remover…` fail (1 removal call, exit 1).
   - (c) the uid check line deleted: `the first command is "echo \"runner uid: $(id -u)\"", not [ "$(id -u)" = 1001 ] || exit 1`, and the run under a stub `id` of 1000 no longer ends at once.
   - (k) the check's last line (`[ -z "$left" ] || … exit 1`) replaced by `true`: `E2.4-k: with a container or a volume still there after the remover, the check fails and names it` (`actual: 0`).
   - (k) the remover without the `refused-logs` removal: `E2.4-k: with nothing left the check is green` and the remover rule fail (the volume stays in the stub's world).
   - the check without `if: always()`: `E2.4-k: the check follows the remover, always runs, …` fails.
4. The planted faults are tests of their own (they pass when the rule refuses the plant): no uid check, the check second, the naming step after *Build* (moved by `moveStepAfter`), no `shell: bash`, no `always()`, a quoted remover name, a fourth removal missing, a second remover, a check with `continue-on-error`, without `always()`, with `docker inspect`, a name left out, a check that never fails (the real run shows it green with a container left), `continue-on-error` on a smoke step, an `always()` `Publish`. Through the shipped guard (when it can load `yaml`): the remover's names quoted 2 `docker-run`; a `-v` source alone in quotes 1; `docker inspect` in the check 1; `docker logs` after the remover 1; `--name cv` a `docker-name`; a `-v` argument unquoted: 0 (the real text quotes it WHOLE: 0).

**The checks that run here, by rule.** (c): the naming step is after checkout and before *Build*, its first command is the text of row 24, and run under a stub `id` printing 1000 it exits 1 with an empty `$GITHUB_ENV` and no `runner uid` line; under 1001 it writes `SMOKE_ID=<8 hex>` and `SMOKE_OWNER=u1001:<host>@linux:<pid>`. (b): one remover, `shell: bash`, `always()`, `continue-on-error: true`, placed after *Smoke-test a refused start* and before *Log in*, four removals each ending `|| true` and unquoted; run under `bash --noprofile --norc -eo pipefail` against a stub `docker` whose first removal fails, the four removal calls are all logged and the step exits 0; with no `SMOKE_ID` no docker call is made. (k): the check follows the remover, `always()`, `shell: bash`, no `continue-on-error`, no `docker inspect`, each of the four names asked for by `name=^<name>$`; with each one of the four left (stub `STUB_STUCK`) the job's step exits 1 and its line names it; with a sibling job's resources in the world (another id) nothing of theirs is removed and the check is green. Verdict: no step but the remover has `continue-on-error`, only the remover and the check run past a failure, `Publish`'s `if:` has no status function (its implicit `success()` skips it after a failed smoke).

**What changes in `docker.yml`.** The naming step sits right after checkout. *Smoke-test* and *Smoke-test a refused start* use the four names, the label `--label "testsToDelete.owner=$SMOKE_OWNER"` on both `docker run` and both `docker volume create`; the inline removals (`docker rm -f cv`, `docker rm cv-refused`, `docker volume rm …`, and the `docker rm -f` on the 120-second path) are gone. The remover and the check follow, as the stories write them. `Log in`, `Publish` and `Summary` are untouched.

**What only the hosted runs can show** (the coordinator runs them; each is one plain `gh workflow run`, and the next one starts only when the previous one has ended: `docker.yml`'s `concurrency` group is `docker-${{ … || github.ref }}` with `cancel-in-progress: true`, so two dispatches on one ref cancel each other).

*Setup.* After pushing `feat/test-leftovers-e2.4`: `git switch -c tmp/e24-smoke-red feat/test-leftovers-e2.4`; the throwaway edits below; push `tmp/e24-smoke-red` (never merged, never a pull request, deleted after the owner's word). Each edit was applied to a scratch copy of `abf693a`'s and of `faa0fb8`'s `docker.yml` here, and changes exactly the lines named.
- Common edit (every throwaway run): `sed -i "s/^        if: github.event.workflow_run.head_branch == 'main' || github.ref == 'refs\/heads\/main'\$/        if: github.event_name == 'workflow_dispatch'/; s/^          push: true\$/          push: false/" .github/workflows/docker.yml` (2 `if:` lines, 1 `push:`). `Log in` and `Publish` then run on a dispatch, and `Publish` pushes nothing.
- Sabotage of `cv`: `sed -i '0,/-e Vault__AllowedDomains=example.com/s//-e Vault__AllowedDomains=/' .github/workflows/docker.yml` (the first of two lines: `cv`'s).
- Sabotage of `cv-refused`: `sed -i 's/^            cred-vault-server:ci$/            busybox/' .github/workflows/docker.yml` (1 line, the refused run's image; it exits 0).

*S3.1 on `tmp/e24-smoke-red`* (sc. 1; one commit per variant, one dispatch each: `gh workflow run docker.yml --ref tmp/e24-smoke-red`).
- (P) premise: the common edit only. Expect: green, `Publish` RUNS (not skipped). If it is skipped, the rest proves nothing.
- (R) RED, old shape: `git show abf693a:.github/workflows/docker.yml > .github/workflows/docker.yml`, the common edit, the `cv` sabotage, and one more step at the end of the job: `      - name: List what is left (throwaway)` / `        if: always()` / `        run: docker ps -a`. Expect: FAILED at *Smoke-test* (`never became healthy`), `Publish` skipped, and the listing still shows the container `cv`.
- (G1) the new shape (`faa0fb8`'s file), the common edit, the `cv` sabotage. Expect: FAILED at *Smoke-test* with `never became healthy`; *Smoke-test a refused start* skipped; *Remove the smoke's containers and volumes* RAN and its `left after removal:` listing is EMPTY; *Check that nothing of the smoke is left* GREEN (quote its line); `Publish` skipped; the job red.
- (G2) the new shape, the common edit, the `cv-refused` sabotage. Expect: FAILED at *Smoke-test a refused start* with `a refused start exited 0, expected 78`; the remover RAN, the two volumes are gone (the listing is empty), the check GREEN, `Publish` skipped. This run also observes that `docker volume ls --filter "name=^<name>$"` is anchored (the check is green only when both volumes are really gone; a check that matched nothing would also be green, so read the remover's listing before the removal in the log: `docker volume ls` of the labelled volumes is in the remover's output after the removals, and the volumes appear in *Smoke-test a refused start*'s `docker volume create` lines).
- For every run quote: the failing step's own line, the remover's `left after removal:` output, the check's conclusion, `Publish`'s conclusion (`gh run view <id> --json jobs --jq '.jobs[].steps[] | [.name, .conclusion] | @tsv'`), the run URL; and from the first run the `runner uid: …` line and the `ps -o pid=,comm=` line (row 13: the worker process; row 24: the uid is 1001, else the naming step fails first and every run above fails at *Name the smoke's resources*, which is itself the answer for row 24).

*S3.2 on the PR branch* (sc. 2): `gh workflow run docker.yml --ref feat/test-leftovers-e2.4`. Expect: green; the naming step prints `runner uid: 1001`; the remover's listing is empty; the check green; `Log in` and `Publish` skipped by their own `if:`; `Summary` still writes "Image published" (I15). `actionlint` on the head: the remover's `# shellcheck disable=SC2086` line is the first line of its body and covers the unquoted names; every other name is quoted WHOLE, so no other SC2086 is expected. actionlint and shellcheck are not installed here: nothing is measured.

**What only CI runs.** The two guard tests of `dockerSmokeLeftovers.test.ts` (`the shipped guard reads docker.yml…`, `…refuses each plant…`) SKIP with a reason when the mounted guard cannot load its `yaml` module: the mount's `node_modules` holds it here (an `npm ci` in `.claude/rules/shared`), and `ci-extension.yml` fetches the mount with `git submodule update` only. They run on this machine (both green). Until a CI job installs the mount's modules, CI reads `docker.yml` by the text rules and the bash runs only; S5's whole-repository guard run needs that install anyway.

**Differences from the brief.**
1. The new test file is `src_vs_code/src/test/dockerSmokeLeftovers.test.ts`: `leftoversGuardFixtures.test.ts`, which the brief names as the neighbour, does not exist on this branch (S5). The guard facts for `docker.yml` (§ 3.2's counterexamples) are in the new file.
2. The names in *Smoke-test* and *Smoke-test a refused start* are written quoted WHOLE (`--name "…-${SMOKE_ID}"`, `-v "…:/data"`, `docker cp "…:/logs"`), not unquoted: the guard reads both (0 findings, measured on the whole file, and a `-v` source alone in quotes is 1 `docker-run`), and quoted names keep shellcheck's SC2086 away from every step but the remover. The remover and the check are as the brief writes them.
3. `# shellcheck disable=SC2086 -- <reason>` is the FIRST line of the remover's body (a directive before the first command covers the whole script; after one it covers one command).
4. The test file is written with each rule as a small check function (`type Check`), because `eslint src` allows a complexity of 4: the first draft failed it in 7 functions.
5. The two guard tests are skipped, not failed, when the guard cannot load `yaml` (see above): a failure would make `npm test` red on every machine without the mount's `node_modules`.
6. `research/architecture.md:363` (the one-line smoke description) is S4's file in the brief and is not edited: it stays true.

### E2.4 build record, part 4 — S4, acme (2026-11-10, branch `feat/test-leftovers-e2.4`, not pushed, not merged)

Built by a Sonnet coder from [PLAN_test_leftovers_E2.4_brief.md](PLAN_test_leftovers_E2.4_brief.md) § 3.3, test first, on `a267d75` (creds `main` with the acme TLS fix #326 is merged in). Commits, oldest first: `9d5d958` RED (S4.5 and the run tests, `acmeRunLeftovers.test.ts`); `58ff29a` the compose file; `d959308` `run.sh`; `98dfec4` shellcheck of `run.sh` in `ci-server.yml` and the `.gitignore` line; `c76870d` `deploy/README.md` and `research/architecture.md`; `7f13a40` the two evidence lines of `run.sh`; this record with `research/module_tests.md`. S1 to S3 are not touched. **The hosted evidence of sc. 5, 6 and 7 is NOT yet gathered**: nothing runs Docker here. *(Gathered afterwards: see "Hosted evidence of S4" in part 4, run 42738732851.)* The throwaway dispatch is written out below for the coordinator.

**The RED list** (text from the runs; `TMPDIR` a private empty folder; it was empty after every run).
1. S4.5 and the run tests, `acmeRunLeftovers.test.ts`, against `run.sh` and the compose file of `a267d75`: 21 of 22 fail, 1 passes (the shipped guard reads both files with no finding: it is a pin that no finding is added, not a test of a missing feature). Text of the failures:
   - E2.4-h: `PROJECT is assigned 0 times (besides the empty start), expected once: `, `PROJECT is not set empty before the clean-up is armed`, `COMPOSE is not docker compose -p "$PROJECT" -f docker-compose.acme-test.yml`.
   - E2.4-f: `the compose file fixes a project name (`name:`)`, `x-owned does not carry testsToDelete.owner from ${TESTS_TO_DELETE_OWNER:?}`, `services without the owner label (<<: *owned): pebble, vault, nginx, certbot`, `networks without the owner label: edge`, `named volumes without the owner label, or not exactly certs-conf, certs-www, data, logs: … (declared: )`, `a bind mount of a state folder: - ./state/data:/data`, `0 service mounts of the four named volumes, expected 6`.
   - the clean-up guard: `a teardown ran with no project:` with the calls `compose -f docker-compose.acme-test.yml down -v` twice (the old fixed-project clean-up runs when the owned folder cannot be made).
   - the certificate: `run.sh does not read the certificate through a throwaway alpine container`.
   - sc. 5 and sc. 7 under the stubs: the old script makes no owned folder and no labelled project, so the green run, the two failing runs and the three interrupts all fail their `assertCleaned`.
2. The same file against the NEW files with one fault made in the real text, by hand (each then put back; the test names that go red):
   - `PROJECT=acme` in `run.sh`: `E2.4-h: PROJECT is assigned once, from the owned folder's name…`, `…run under stubs, every compose call names the owner-form project…`, `…run under stubs, `PROJECT=acme` names a project that is not the folder's` (the plant test of that name is the one that passes when the rule refuses), and sc. 5 and sc. 7 (b), (c) (the teardown names `acme`, not the folder).
   - the guard `if [ -n "${PROJECT:-}" ]` changed to `if true`: `a failure before PROJECT is set runs no compose teardown and leaves nothing`, `an unguarded clean-up runs …` and `sc. 7 (a)`.
   - the certificate check made a host `[ -f ]`: `the certificate is asked for through a container: …`, `a certificate check from the host … the plant the test above refuses`, sc. 5 (the green run reports `no certificate was issued`).
   - `trap cleanup EXIT` in place of `owned_trap cleanup`: `the script sets `owned_trap cleanup` once, sources owned.sh, and has no trap of its own`, and sc. 7 (a), (b), (c) (no 130 or 143).
   - the `logs` volume without its label in the compose file: `E2.4-f: the compose file has no fixed name, the owner label on the four services, …` and `E2.4-f: the rule refuses a volume, a service or the network without the label…`.
3. The planted faults are tests of their own (they pass when the rule refuses): `PROJECT=acme`; two assignments; `-p acme`; a second way to set the project; a volume, the network, a service without `<<: *owned`; a fixed `name:`; a `./state` bind mount; the guard replaced by `if true`; the certificate read from the host; a `trap` of its own; no `owned_trap`; no `source`; `sudo`; `rm -rf state`.

**What the tests run.** `run.sh` is copied into a temp tree (with the real compose file and `owned.sh`), a stub `docker`, `curl`, `openssl`, `sleep` first on `PATH` and a stub janitor at the path `run.sh` calls, and RUN. Green: exit 0, the janitor is the first call (`--token creds`, `JANITOR_MIN_AGE_MINUTES=10`), every compose call names `teststodelete-u<uid>-creds-acme-<8 hex>` (the lower-cased name of the folder seen at `create`), one `down -v --remove-orphans` for it, the temp root empty. Failures (the stack does not start; no certificate in the volume): non-zero, the same teardown, the temp root empty. The janitor ending with 0 or 3 is silent; 127 names `git submodule update --init .claude/rules/shared`; any other code is one line; the run goes on. An interrupt (sc. 7): SIGINT during the janitor call ends with 130, no teardown, nothing made; SIGINT and SIGTERM during the first `compose up` end with 130 and 143 and the teardown and the folder removal run once. The owned folder that cannot be made (a temp root that does not exist) ends with 1 and no teardown against an empty name. The certificate is visible only to the stub container (never to the host): found; absent: `FAIL no certificate was issued`. **The shipped guard** (`node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"`): 0 findings in `deploy/acme-test` and in the new test file. The whole repository: 6 findings, none of S4's — `deploy/nginx/entrypoint.test.sh:39` (a `mktemp`, new with the merge of #326; S5's), `deploy/restore-archive.sh:61`, `deploy/restore.sh:102`, `install.sh:63`, `:76`, `commandParse.test.ts:40` (the five of the S3 record). The test file first had 5 findings of its own (a compose line with `-p "$PROJECT"` in a message, a regex for the folder name, a variable name, a `docker run` in a message, a lower-cased prefix regex); the names are now built from parts or matched without the prefix, so none is added.

**What changes.** Compose: `name:` goes; `x-owned: &owned` carries `testsToDelete.owner: "${TESTS_TO_DELETE_OWNER:?}"`, merged into the four services, `networks.edge` and four named volumes `certs-conf`, `certs-www`, `data`, `logs`; no `./state` bind mount. `run.sh`, in the brief's order: `source` of `owned.sh`; `owned_owner >/dev/null || exit 1`; `export TESTS_TO_DELETE_OWNER="$OWNED_OWNER"`; `STATE=""`, `PROJECT=""`; `cleanup` (`if [ -n "${PROJECT:-}" ]; then docker compose -p "$PROJECT" -f docker-compose.acme-test.yml down -v --remove-orphans … || true; fi`); `owned_trap cleanup` and no trap of its own; the janitor call (`JANITOR_MIN_AGE_MINUTES=10 bash ../../.claude/rules/shared/tools/janitor.sh --token creds || rc=$?`; 0 and 3 silent, 127 and others one line, the run goes on); `owned_dir STATE acme || exit 1`; `PROJECT="$(printf '%s' "${STATE##*/}" | tr '[:upper:]' '[:lower:]')"`; `COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.acme-test.yml)`; the lines `owned folder: …` and `compose project: …`; `"${COMPOSE[@]}" create`; the chown of the `data` and `logs` volumes through `docker run --rm -v "${PROJECT}_data:/d" -v "${PROJECT}_logs:/l" alpine chown -R 10001:10001 /d /l`, before the first `up`. The certificate check is `docker run --rm -v "${PROJECT}_certs-conf:/s:ro" alpine test -f /s/live/vaulthost/fullchain.pem` (no sudo), the known harness bug of hosted runs 42713538247 and 42714461289. `ci-server.yml` shellchecks it (`-x`); `.gitignore` loses the `state/` line; `deploy/README.md` and `research/architecture.md` say what the run leaves and who collects a killed one.

**Checks run here.** `acmeRunLeftovers.test.ts`: 22 of 22 green, `eslint` clean (complexity 4), `tsc` clean. The whole extension suite through `scripts/run-tests.mjs "out/test/*.test.js"`: 7133 tests, 7125 pass, 0 fail, 8 skipped (`readmeClaims` included, with the README paragraph). `bash .github/scripts/lib/owned.test.sh` once: exit 0, `all areas passed`; T7a `no caller sets a trap of its own (8 scanned)` green over the new `run.sh`. `bash -n deploy/acme-test/run.sh` clean. NOT run here (no Docker, no shellcheck): the shellcheck of `run.sh`, any real compose call, the janitor against a real daemon.

**What only the hosted runs can show** (the coordinator runs them: `git switch -c tmp/e24-acme feat/test-leftovers-e2.4`, add the one workflow below as `.github/workflows/tmp-e24-acme.yml`, push `tmp/e24-acme` (never merged, never a pull request, deleted after the owner's word), `gh workflow run tmp-e24-acme.yml --ref tmp/e24-acme`). It is the model of `tmp/e24-observe`'s workflow with the REAL `run.sh` and compose file in place of the prototype copies; its steps run in order and each later one has `if: always()` where it reads, so one run answers every row. **Pitfall for every signal step**: a background job of a non-interactive shell ignores SIGINT, and a signal ignored at entry cannot be trapped, so each signalling step starts with `set -m`.

```yaml
name: tmp e24 acme
on:
  workflow_dispatch:
permissions:
  contents: read
  packages: read
jobs:
  acme:
    name: E2.4.S4 · sc. 5, 6, 7
    runs-on: ubuntu-latest
    timeout-minutes: 60
    env:
      VAULT_IMAGE_REF: ghcr.io/oleksandrdubyna88/cred-vault-server:edge
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
          fetch-depth: 0
      - name: Fetch the shared rules (the janitor)
        run: git submodule update --init --depth 1 .claude/rules/shared

      - name: Identities, images, the listing helper
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          echo "uid: $(id -u) ($(id -un)); host: $(hostname); TMPDIR: ${TMPDIR:-unset}; pidns: $(readlink /proc/self/ns/pid); bash: $BASH_VERSION"
          docker info --format 'docker: server {{.ServerVersion}} security {{.SecurityOptions}}'
          echo "janitor pin: $(git -C .claude/rules/shared rev-parse HEAD)"
          for i in ghcr.io/letsencrypt/pebble:latest nginx:1.27-alpine certbot/certbot:latest alpine; do docker pull -q "$i"; done
          IMG="$VAULT_IMAGE_REF"
          if docker pull -q "$IMG"; then echo "image: pulled $IMG anonymously"
          elif echo "$GH_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin && docker pull -q "$IMG"; then echo "image: pulled $IMG after login"
          else IMG=cred-vault-server:local; docker build -q -f src_minimalapi_server/Dockerfile -t "$IMG" .; echo "image: built $IMG in the job"; fi
          echo "VAULT_IMAGE=$IMG" >> "$GITHUB_ENV"
          # list.sh <project>: the three listings filtered by the PROJECT label (never the owner label), the temp root's entries;
          # exit 1 when anything of the project, or any acme folder or claim, is left.
          cat > "$RUNNER_TEMP/list.sh" <<'EOF'
          project="${1:?project}"; bad=0; f="label=com.docker.compose.project=$project"
          for what in "volume ls" "ps -a" "network ls"; do
            out="$(docker $what -q --filter "$f")"
            if [ -z "$out" ]; then echo "OBSERVED: docker $what --filter $f -> empty"; else echo "LEFT: docker $what --filter $f ->"; echo "$out"; bad=1; fi
          done
          for e in "${TMPDIR:-/tmp}"/testsToDelete-*-creds-acme-*; do [ -e "$e" ] || continue; echo "LEFT: $e"; bad=1; done
          [ "$bad" = 0 ] && echo "OBSERVED: no acme folder or claim in ${TMPDIR:-/tmp}"
          exit "$bad"
          EOF

      - name: S4.4 shellcheck on run.sh (the pinned image of ci-server.yml)
        run: docker run --rm -v "$PWD":/mnt -w /mnt koalaman/shellcheck:v0.11.0 -x deploy/acme-test/run.sh

      - name: S4.1 RED on main's run.sh (0ae0211 in a second checkout) — state/ stays; the second run stops at rm -rf state
        continue-on-error: true
        run: |
          git worktree add --detach "$RUNNER_TEMP/old" 0ae0211
          cd "$RUNNER_TEMP/old/deploy/acme-test"
          rc=0; ./run.sh > "$RUNNER_TEMP/old1.log" 2>&1 || rc=$?
          tail -5 "$RUNNER_TEMP/old1.log"; echo "old run 1 exit: $rc"
          echo "state/ after the first old run: $(ls -ld state 2>&1)"; ls -la state 2>&1 | head
          rc=0; ./run.sh > "$RUNNER_TEMP/old2.log" 2>&1 || rc=$?
          tail -5 "$RUNNER_TEMP/old2.log"; echo "old run 2 exit: $rc (expected: stops at rm -rf state)"

      - name: S4.1 GREEN A — a green run, then nothing is left
        run: |
          cd deploy/acme-test
          rc=0; ./run.sh 2>&1 | tee "$RUNNER_TEMP/a.log" || rc=$?
          echo "run A exit: $rc"; grep -c 'ALL ISSUANCE CHECKS PASSED' "$RUNNER_TEMP/a.log"
          project="$(sed -n 's/^compose project: //p' "$RUNNER_TEMP/a.log")"; echo "project: $project"
          [ -n "$project" ] && bash "$RUNNER_TEMP/list.sh" "$project"
          test ! -e state && echo "OBSERVED: no deploy/acme-test/state"
          exit "$rc"

      - name: S4.1 GREEN B — a failing run (VAULT_IMAGE=busybox), then nothing is left
        run: |
          cd deploy/acme-test
          rc=0; VAULT_IMAGE=busybox ./run.sh 2>&1 | tee "$RUNNER_TEMP/b.log" || rc=$?
          echo "run B exit: $rc (expected non-zero)"; [ "$rc" != 0 ] || exit 1
          project="$(sed -n 's/^compose project: //p' "$RUNNER_TEMP/b.log")"; echo "project: $project"
          [ -n "$project" ] && bash "$RUNNER_TEMP/list.sh" "$project"
          test ! -e state && echo "OBSERVED: no deploy/acme-test/state"

      - name: S4.2 run 1 — start, assert the labels, kill -9 at the first issuance line
        run: |
          cd deploy/acme-test
          log="$RUNNER_TEMP/run1.log"
          ./run.sh >"$log" 2>&1 &
          pid=$!
          for _ in $(seq 1 300); do grep -q -- '-- 2. issuance' "$log" && break; kill -0 "$pid" 2>/dev/null || { echo "run 1 ended early"; cat "$log"; exit 1; }; sleep 1; done
          grep -q -- '-- 2. issuance' "$log" || { cat "$log"; exit 1; }
          project="$(sed -n 's/^compose project: //p' "$log")"; state="$(sed -n 's/^owned folder: //p' "$log")"
          rec="$(cat "$state.owner")"
          echo "owner record: $rec"
          n=0; bad=0
          for v in $(docker volume ls -q --filter "label=com.docker.compose.project=$project"); do
            l="$(docker volume inspect --format '{{index .Labels "testsToDelete.owner"}}' "$v")"
            echo "volume $v owner-label=$l"; [ "$l" = "$rec" ] || { echo "UNLABELLED OR WRONG: $v"; bad=1; }; n=$((n + 1))
          done
          echo "project volumes: $n (expected 4), a wrong label: $bad (expected 0)"; [ "$n" = 4 ] && [ "$bad" = 0 ]
          docker ps -a --filter "label=com.docker.compose.project=$project" --format '{{.Names}} {{.Status}} owner={{.Label "testsToDelete.owner"}}'
          docker network ls --filter "label=com.docker.compose.project=$project" --format '{{.Name}} owner={{.Label "testsToDelete.owner"}}'
          echo "claim: $rec; the pid in it is run 1's: $(cut -d: -f3 "$state.owner") (\$! = $pid)"
          kill -9 "$pid"; rc=0; wait "$pid" || rc=$?; echo "KILLED run 1; wait status $rc"
          { echo "PROJECT1=$project"; echo "STATE1=$state"; echo "KILLED_AT=$(date -u +%s)"; } >> "$GITHUB_ENV"

      - name: S4.2 after the kill — what is left (premise), then wait 11 minutes
        run: |
          bash "$RUNNER_TEMP/list.sh" "$PROJECT1" || true
          echo "folder: $([ -d "$STATE1" ] && echo yes || echo NO); claim: $([ -f "$STATE1.owner" ] && echo yes || echo NO)"
          now=$(date -u +%s); want=$((KILLED_AT + 660)); [ "$now" -ge "$want" ] || sleep $((want - now))
          echo "waited until $(date -u +%T), $(( $(date -u +%s) - KILLED_AT )) s after the kill"
          JANITOR_MIN_AGE_MINUTES=10 bash .claude/rules/shared/tools/janitor.sh --token creds --dry-run || echo "janitor --dry-run exit: $?"

      - name: S4.2 run 2 — the next run (its janitor call) is green and the killed project is gone
        run: |
          cd deploy/acme-test
          ./run.sh 2>&1 | tee "$RUNNER_TEMP/run2.log"
          bash "$RUNNER_TEMP/list.sh" "$PROJECT1"
          test ! -e "$STATE1" && test ! -e "$STATE1.owner" && echo "OBSERVED: the killed run's folder and claim are gone"

      - name: S4.2 concurrent RED on main — a second old run tears down the first one's stack
        continue-on-error: true
        run: |
          set -m
          cd "$RUNNER_TEMP/old/deploy/acme-test"
          sudo rm -rf state
          ./run.sh >"$RUNNER_TEMP/c1.log" 2>&1 & pid=$!
          for _ in $(seq 1 120); do grep -q -- '-- 2. issuance' "$RUNNER_TEMP/c1.log" && break; sleep 1; done
          ./run.sh >"$RUNNER_TEMP/c2.log" 2>&1 || true
          rc=0; wait "$pid" || rc=$?
          echo "old first run exit: $rc (RED: non-zero, its stack was taken down)"; tail -8 "$RUNNER_TEMP/c1.log"

      - name: S4.2 concurrent GREEN — a second run beside a live first one leaves the first one alone
        run: |
          set -m
          cd deploy/acme-test
          ./run.sh >"$RUNNER_TEMP/g1.log" 2>&1 & pid=$!
          for _ in $(seq 1 120); do grep -q -- '-- 2. issuance' "$RUNNER_TEMP/g1.log" && break; sleep 1; done
          p1="$(sed -n 's/^compose project: //p' "$RUNNER_TEMP/g1.log")"
          rc2=0; ./run.sh >"$RUNNER_TEMP/g2.log" 2>&1 || rc2=$?
          echo "second run exit: $rc2 (expected non-zero: the fixed ports 18081 and 18444 are taken); its last lines:"; tail -6 "$RUNNER_TEMP/g2.log"
          p2="$(sed -n 's/^compose project: //p' "$RUNNER_TEMP/g2.log")"
          echo "first project still has $(docker ps -q --filter "label=com.docker.compose.project=$p1" | wc -l) running containers and $(docker volume ls -q --filter "label=com.docker.compose.project=$p1" | wc -l) volumes"
          bash "$RUNNER_TEMP/list.sh" "$p2" || true
          rc1=0; wait "$pid" || rc1=$?
          echo "first run exit: $rc1 (expected 0)"; tail -4 "$RUNNER_TEMP/g1.log"
          bash "$RUNNER_TEMP/list.sh" "$p1"
          [ "$rc2" != 0 ] && [ "$rc1" = 0 ]

      - name: S4.3 (a) SIGINT during the janitor call (the mounted janitor replaced by a 6-second wait)
        run: |
          set -m
          cp .claude/rules/shared/tools/janitor.sh "$RUNNER_TEMP/janitor.real"
          printf '#!/bin/bash\nsleep 6\n' > .claude/rules/shared/tools/janitor.sh
          cd deploy/acme-test
          ./run.sh >"$RUNNER_TEMP/s7a.log" 2>&1 & pid=$!
          until grep -q -- '-- 0. what a killed run left' "$RUNNER_TEMP/s7a.log"; do sleep 0.2; done
          sleep 1; kill -INT "$pid"; rc=0; wait "$pid" || rc=$?
          echo "exit: $rc (expected 130)"; cat "$RUNNER_TEMP/s7a.log"
          cp "$RUNNER_TEMP/janitor.real" ../../.claude/rules/shared/tools/janitor.sh
          for e in "${TMPDIR:-/tmp}"/testsToDelete-*-creds-acme-*; do [ -e "$e" ] && { echo "LEFT: $e"; exit 1; }; done
          [ -z "$(docker ps -aq --filter label=testsToDelete.owner)$(docker volume ls -q --filter label=testsToDelete.owner)$(docker network ls -q --filter label=testsToDelete.owner)" ] && echo "OBSERVED: nothing made"
          ! grep -Eq 'No such|invalid|unknown shorthand' "$RUNNER_TEMP/s7a.log" && [ "$rc" = 130 ]

      - name: S4.3 (b) SIGINT and (c) SIGTERM during the first compose up
        run: |
          set -m
          cd deploy/acme-test
          for sig in INT TERM; do
            log="$RUNNER_TEMP/s7-$sig.log"
            ./run.sh >"$log" 2>&1 & pid=$!
            until grep -q -- '-- 1. before issuance' "$log"; do sleep 0.1; done
            kill -"$sig" "$pid"; rc=0; wait "$pid" || rc=$?
            echo "$sig: exit $rc (expected $([ "$sig" = INT ] && echo 130 || echo 143)); last line before the signal: $(grep -n -- '^--' "$log" | tail -1)"
            project="$(sed -n 's/^compose project: //p' "$log")"; bash "$RUNNER_TEMP/list.sh" "$project"
          done

      - name: Everything the job's docker still holds (should be empty of acme)
        if: always()
        run: |
          docker ps -a --format '  {{.Names}} {{.Status}}'; docker volume ls --format '  {{.Name}}'; docker network ls --format '  {{.Name}}'
          ls -la "${TMPDIR:-/tmp}" | grep -i teststodelete || echo "  (no testsToDelete entry)"
```

*(What was planned, kept as written; the results follow it.)* Expect, and quote from each step: S4.4 shellcheck: exit 0, no output. S4.1 RED: the first old run leaves `state/` (`drwxr-xr-x` with root-owned subfolders) and the second old run stops at `rm -rf state` with `Permission denied` (the brief's measured reasoning; if the first old run is red on the stack, `state/` still exists). S4.1 GREEN A: exit 0, `ALL ISSUANCE CHECKS PASSED`, every `OBSERVED … empty`, no `state`. B: non-zero, the same listings empty. S4.2: `project volumes: 4 … wrong label: 0`; after the kill the premise shows the containers, the network, four volumes, the folder and the claim; the janitor dry run lists them; run 2 prints the janitor's removal lines (quote them) and ends green; the project-filtered listings are empty and the folder and claim are gone. Concurrent: RED on main: the old first run exits non-zero; GREEN: the second run exits non-zero at `compose up` (ports) and removes only its own project, the first project keeps its containers and volumes, the first run exits 0. S4.3: 130, 130, 143 and nothing left. A step that fails at its premise (no `-- 2. issuance` line, no `compose project:` line) proves nothing: read it first.

**Hosted evidence of S4 (added in part 2c).** The one valid run is **42738732851** on `tmp/e24-acme`, head `31e4b6b` (that commit fixed the throwaway workflow's own bugs F2 to F5; the runs before it, 42737728428, 42737925125 and 42737647246, do not count). Runner: `uid: 1001 (runner); host: runnervmwuk1x; TMPDIR: unset; pidns: pid:[4026531836]; bash: 5.3.9(1)-release`; `docker: server 29.4.2`; `janitor pin: 37b9aa5773fc8ca1f79702b8535f9147d12a8626`; image `pulled ghcr.io/oleksandrdubyna88/cred-vault-server:edge anonymously`. The full step logs are kept in the coordinator's scratchpad (`e24-acme/`, one file per step).
- **S4.1 GREEN A** (a green run, then nothing is left): `ALL ISSUANCE CHECKS PASSED`, `run A exit: 0`, project `teststodelete-u1001-creds-acme-3bc83821`; `OBSERVED: docker volume ls --filter label=com.docker.compose.project=… -> empty`, the same for `docker ps -a` and `docker network ls`; `OBSERVED: no acme folder or claim in /tmp`; `OBSERVED: no deploy/acme-test/state`.
- **S4.1 GREEN B** (a failing run, `VAULT_IMAGE=busybox`): `FAIL nginx opened 443 by itself and serves the API — expected 200, got 000`, `FAIL unexpected issuer: none`, `run B exit: 1 (expected non-zero)`; the three listings `-> empty`, `OBSERVED: no acme folder or claim in /tmp`, `OBSERVED: no deploy/acme-test/state`.
- **S4.2 before the kill** (run 1): `project volumes: 4 (expected 4), a wrong label: 0 (expected 0)`; each of the four volumes `owner-label=u1001:runnervmwuk1x@linux:10750:1794276221:4026531836`; the four containers (`…-certbot-1`, `-nginx-1`, `-vault-1`, `-pebble-1`) and the network `…_edge` carry `owner=` with the same record; `claim: u1001:…:10750:1794276221:4026531836; the pid in it is run 1's: 10750 ($! = 10750)`; `KILLED run 1; wait status 137`.
- **S4.2 after the kill, 660 s later**: the premise listed `LEFT:` four volumes, four containers, the network, `/tmp/testsToDelete-u1001-creds-acme-1ed62529` and its `.owner` (`folder: yes; claim: yes`; `waited until 02:14:45, 660 s after the kill`); the janitor's dry run listed every removal (`would run: docker rm -f -v …` four times, `docker volume rm …_certs-conf`, `_certs-www`, `_data`, `_logs`, `docker network rm fda3ef904bd9`, the `mv --` to a quarantine name, `rm -rf --` and `rm -f -- /tmp/testsToDelete-u1001-creds-acme-1ed62529.owner`).
- **S4.2 run 2** (the next run): its janitor call printed `janitor: removed container teststodelete-u1001-creds-acme-1ed62529-certbot-1` (and `-nginx-1`, `-vault-1`, `-pebble-1`), `removed volume …_certs-conf`, `_certs-www`, `_data`, `_logs`, `removed network …_edge`, `removed folder /tmp/testsToDelete-u1001-creds-acme-1ed62529`; then `ALL ISSUANCE CHECKS PASSED`; the three listings of the killed project `-> empty`, `OBSERVED: no acme folder or claim in /tmp`, `OBSERVED: the killed run's folder and claim are gone`.
- **S4.2 concurrent GREEN** (a second run beside a live first): `first project still has 4 running containers and 4 volumes`; `first run exit: 0 (expected 0)`, `ALL ISSUANCE CHECKS PASSED`; afterwards the first project's three listings `-> empty` and `OBSERVED: no acme folder or claim in /tmp`. `second run exit: 1 (expected non-zero: the fixed ports 18081 and 18444 are taken)`; the second project's listings were empty.
- **S4.3**: (a) a SIGINT during the janitor call, `exit: 130 (expected 130)`, `OBSERVED: nothing made`; (b) `INT: exit 130 (expected 130)` and (c) `TERM: exit 143 (expected 143)`, each after `-- 1. before issuance`, with the three listings `-> empty` and `OBSERVED: no acme folder or claim in /tmp`.
- **The end step** (everything the job's docker still holds): `bridge`, `host`, `none` (the three default networks) and `(no testsToDelete entry)`.

**Differences, as they are (hosted run 42738732851).**
1. S4.4, the shellcheck step on the pinned image `koalaman/shellcheck:v0.11.0`, failed on `d2d3ae4`'s `run.sh`: `In deploy/acme-test/run.sh line 31: … SC1091 (info): Not following: ../../.github/scripts/lib/owned.sh`. Fixed since by F1 (part 2b, `source-path=SCRIPTDIR` on the directive line); the pull request's CI is the proof.
2. S4.1 RED: the first old run (`0ae0211`) left `state/` with `drwxr-xr-x 5 10001  10001 … data` and `… logs` (owned by uid 10001). The second old run did NOT stop at `rm -rf state` with `Permission denied` (the brief's measured reasoning): it ran on and failed its checks, `old run 2 exit: 1`. The old `run.sh` fails on its own on the hosted runner (`FAIL … unauthenticated request reaches the app and is refused — expected 401, got 000`, and in the other old runs `FAIL nginx opened 443 … got 000`, `FAIL unexpected issuer: none`).
3. Because of 2, the concurrent RED does not show that a second old run tears down the first: the old script fails alone (`old first run exit: 1 (RED: non-zero, its stack was taken down)` is its own failure). The concurrent GREEN shows the property directly: with the second run present the first project still had 4 running containers and 4 volumes, and the first run ended with exit 0. The second run exited 1 right after `-- 1. before issuance` with no port-bind line in the kept 6 lines (its full log was not kept), and its project listing was empty afterwards.
4. The throwaway's `list.sh` globs every acme folder, so it named the first run's live folder (`LEFT: /tmp/testsToDelete-u1001-creds-acme-10e26ac9`) while that run was still running. This is a detail of the throwaway tooling.
5. The throwaway workflow needed one push-trigger run before `gh workflow run` could find it (HTTP 404).
`run.sh` was not changed for any of these.

**Differences from the brief.**
1. ~~`cleanup` does NOT call `owned_cleanup`. The helper's exit chain runs `cleanup` in a subshell, then `owned_cleanup` in the script's shell; a second `owned_cleanup` inside the subshell removes the folder and the claim but leaves the shell's entry in state `created`, so the chain then prints `the claim of … is not what this run wrote - the folder is left` on every run (measured). With one call the folder goes once and nothing is said. The guard of an unset `STATE` therefore has nothing to guard; the guard of `PROJECT` is as written.~~ *(Removed in part 2b: the helper is fixed, `owned_cleanup` no longer warns when claim and folder are both gone, and `cleanup` calls it behind the `STATE` guard, as the brief § 3.3 item 1 asks.)*
2. `owned_trap cleanup` is written without `|| exit 1`: under `set -e` a failing call ends the script anyway.
3. The wait for the certificate is 150 tries of 2 seconds (the prototype of `tmp/e24-observe` used it) instead of 45: the control of run 42416565709 got its certificate just after the 90 seconds of the old wait. The check is one `docker run` per try.
4. `run.sh` prints `owned folder: …` and `compose project: …` (not in the brief): the hosted checks need the exact project and folder afterwards, and a person who reads a failed log needs them too.
5. The state of the run is only the owned folder, which stays empty: nothing of the run needs to be copied out of a volume, so the `cat > "$STATE/<file>"` form of the brief is not used.
6. ~~`deploy/README.md` is edited, although the brief says it does not describe `state/` (I1): it gets a paragraph on what the run leaves and who collects a killed run (the lead asked for it).~~ *(The README edit was taken out again in part 2b, `bb2c58b`: the brief says "no edit" twice.)* `.gitignore` loses the two lines (the comment and `deploy/acme-test/state/`); a `state/` an old version left in a checkout is no longer ignored. *(Part 2d: the README is not edited, so it says nothing about it; the header comment of `run.sh` says it can hold root-owned files and gives the command that removes it, `docker run --rm -v "$PWD":/w alpine rm -rf /w/state` from `deploy/acme-test`.)*
7. `ci-server.yml` already shellchecks `owned.sh` (S1); only `-x deploy/acme-test/run.sh` is added. shellcheck is not installed here and there is no `docker`: the line is read by eye for SC2154, SC2155 and SC2317, and the hosted dispatch above runs the pinned image.
8. The test file is `src_vs_code/src/test/acmeRunLeftovers.test.ts` (the brief says "beside S3.3": S3.3 is `dockerSmokeLeftovers.test.ts`, and there is no `leftoversGuardFixtures.test.ts` here). The compose rules read the text (indentation), not parsed YAML, so they run on every machine; the YAML merge was checked once with a YAML loader (every volume, the network and every service carry the label).
9. The brief's S4.2 premise check (the volumes carry the label before the kill) is in the hosted step, not in `run.sh`: a run that checks itself would add a failure path to the thing under test. `compose create` plus the compose file test make the labels; the hosted step reads them from the daemon.
10. One thing to know for the hosted green run: the compose images `nginx:1.27-alpine`, `certbot/certbot:latest`, `pebble:latest` are not pinned by digest; the observation runs at `59e1fac` and `6258f3e` were on certbot with Python 3.14.

### E2.4 build record, part 2b — the fix round after the Opus review of S2, with findings on S1, S3 and S4 (2026-11-10, branch `feat/test-leftovers-e2.4`, not pushed, not merged)

(The findings of the review round, each with its RED or "before" output, the fix and the "after" output.)

**Tools.** ShellCheck 0.11.0 (the CI image's version) and actionlint 1.7.12 run from private copies here; "the CI shellcheck lines" below are the `$SHELLCHECK …` lines of `ci-server.yml`, run one by one from the repository root by a script that reads them out of the workflow.

**Commits, oldest first.** `e95f026` ShellCheck fixes of S2's callers (and `run.sh`'s `source-path`); `a052468` S1's lint; `7996404` docker.yml directive; `c043c12` the mount-deps install (revoked, `49fb695` reverts it); `fb61b0c` the nginx entrypoint test; `54b9eb1` and `63e343e` the E2.5 lines kept here, then taken out of `module_tests.md`; `614c182` test (items 1 to 5 of the S3 review); `5bd88a7` RED (entry 8.1); `a8407ea` GREEN (entry 8.1) with the dated notes; `f54a495` RED (H3) then `7518575` `owned_cleanup`; `6068164` RED (acme); `bb2c58b` README revert; `fb0901f` run.sh; `5ad580d` the S2 minors; this record.

**1. BLOCKER 1, ShellCheck on S2's files.** Before (CI lines, 0.11.0): `restore-archive-itest.sh:42` SC1091 (`Not following: ../.github/scripts/lib/owned.sh`); `start-server-and-wait.sh:115` SC1091 and `:129` SC2154 (`logdir is referenced but not assigned`); `start-server-and-wait.test.sh:35` SC1073/SC1072 (`# shellcheck 0.11 calls it SC2329` read as a directive); `deploy/acme-test/run.sh:31` SC1091; the two smokes and their tests (not on the CI line then): SC1091 and SC2154 for `owned` and `work`. Fix: `# shellcheck source-path=SCRIPTDIR` above each `source=`; the comment starts "ShellCheck 0.11"; `logdir=""`, `work=""`, `owned=""` before the `owned_dir` calls. After: every CI line `(clean)`. The two smoke scripts and their self-tests were put on a CI shellcheck line (they were clean). *(Part 2d: taken off again: the brief § 5 and I16 say the smokes' shellcheck is a todo, not built here. I16 stays open. The four files are shellcheck-clean by hand, measured with ShellCheck 0.11.0 on 2026-11-10.)*

**2. BLOCKER 2, S1's line.** Before: `owned.test.lib.sh:1` SC2148; `:25`, `:80`, `:92`, `:110`, `:124` SC2034; `:76` SC2153; `:94` and `sweeps.sh:29` SC1007; `record.sh:248` SC2010; `record.sh:54` and `owned.sh:223` SC2034 (`extra`); `owned.sh` SC2004 at 316-318, 332, 451, 456. Fix: a `# shellcheck shell=bash` line; one `disable=SC2034` with its reason (the area files read those variables); `ROOT=""` before `owned_dir`; `TESTSTODELETE_OWNER=''`; a glob loop for the `ls | grep`; `read -r _`; subscripts without `$`. After: clean; `owned.test.sh` 90, 93 and 26 asserts, 0 failed (no behaviour changed).

**3. BLOCKER 3, `docker.yml`.** Before: `docker.yml:142:9: shellcheck reported issue in this script: SC1072:error:1:31: Expected '=' after directive key` and `SC1073`. The `#` form parses, but actionlint puts `set -eo pipefail` before the `run:` body (read from a spy `shellcheck`), so a directive at the top reaches ONE command: SC2086 on lines 3 to 6. Fix: one `# shellcheck disable=SC2086 # <reason>` before each of the four removals. After: actionlint 1.7.12 with 0.11.0 over every workflow: exit 0.

**4. S3 finding, the mount's dependencies in CI (revoked).** The two guard-reading tests skip when `.claude/rules/shared/node_modules` is absent: locally with the folder moved away `42 tests, 39 pass, 3 skipped`; present `42 tests, 42 pass, 0 skipped`. The install step (`npm ci --prefix .claude/rules/shared --ignore-scripts` in `ci-extension.yml` and `release.yml`) was made and then revoked by the coordinator (E2.5's, brief § 5): `49fb695` takes it out. The guard tests may skip in CI until E2.5. Consequence worth knowing: the plant "volume renamed in its create and `-v` only" is seen by the guard tests locally (2 fail) and by NO test of the old suite when the mount's dependencies are missing (`18 pass, 0 fail, 2 skipped`); the new name-set test (item 1) sees it without the mount (`23 pass, 2 fail`).

**5. S4 finding, `deploy/nginx/entrypoint.test.sh:39`.** RED by the guard's count: 6 findings before (the file's `raw-temp`, the four product `mktemp` lines, `commandParse.test.ts:40`); after `owned_dir WORK nginx-entry` (and no trap of its own) 5. The CI step runs it in its own `RUNNER_TEMP` root and fails when anything is left; its shellcheck line has `-x`. Run with a private `TMPDIR`: `ALL ENTRYPOINT RENDER CHECKS PASSED`, root empty.

**6. The minors of the S2 review.** The README and the script header now say the kept log may be gone about 10 minutes after the SERVER started (the sweep reads the folder's age, and only once the script has ended), not 10 minutes after the script ended. The two smoke scripts, the start script, `http/README.md` and the self-tests say that under Git Bash (Windows, off CI) the owned folder needs Node and the shared rules mount. Case `j` measures its time (`1.1 s`, was `0 ms`).

**7. Added items of the S3 review (`614c182`), RED by weakening the rule.** Each rule was weakened by hand in the test source, the file compiled and run; each plant test failed, and the old suite (HEAD before) passed with the same weakening for the seven rules of item 2 (`mutants-head`: all survived):
- item 1, the names of every `--name` and `docker volume create` equal the four of the remover and the check; weakened: `the rule refuses a volume renamed in its create and its -v only, …` fails. On the real file with the plant: old suite `18 pass, 2 fail` with the mount's dependencies (the guard), `18 pass, 0 fail, 2 skipped` without them (as in CI); the new suite `23 pass, 4 fail`, and `23 pass, 2 fail, 2 skipped` without the mount.
- item 2, a plant for each rule that had none: naming after checkout, remover `continue-on-error`, remover placement (before the last reader, and after Log in; the title's "one before the last reader" is now asserted), check position, check `shell: bash`, check removes nothing, Publish without `if`. Each weakened rule: its plant test fails; at HEAD each weakened rule survived (7 of 7).
- item 3, the naming step runs as GitHub runs a step with no `shell:` (`bash -e`); a harness test shows `false | true` is 0 under `-e` and 1 under the long form; the header comment says which shell each kind of step gets. Weakened (always the long form): that test fails.
- item 4, the naming step must come before `docker/setup-buildx-action` (it starts a builder container): a plant that moves it between buildx and Build is refused by that rule only.
- item 5, the sibling test uses ids that overlap (`abcd12345`, and a name with a prefix); removing the `$` (or the `^`) of a filter fails the test. On the real file without the four anchors: old suite `17 pass, 3 fail` (the check rules), new `21 pass, 6 fail`.

**8. Entry 8.1 (conventions PR #146), `5bd88a7` RED then `a8407ea`.** RED: `the check passed with no docker daemon` and `the naming step passed with a failing openssl` (a stub `docker` that exits 1 with "Cannot connect to the Docker daemon"; a stub `openssl` that exits 1). Fix: each check line is `out=$(docker …)` then `[ -z "$out" ] || left="$left <key>"`; the naming step is `id=$(openssl rand -hex 4)`, `[[ $id =~ ^[0-9a-f]{8}$ ]] || exit 1`, then `SMOKE_ID=$id`, the uid check still first. After: both tests pass (29 tests in the file); the old shape is shown green with the daemon down as a plant; ids `''`, `xyz`, `1234567`, `123456789`, `ABCD1234`, `abcd123g` are refused with nothing written. The shipped guard on the whole `docker.yml`: 0 findings; actionlint clean. The brief (3a) and D5 carry a dated note with the old text kept as "was".

**9. S1 helper against its spec (not counted as a change), `owned_cleanup`.** The spec says a function given to `owned_trap` may call `owned_cleanup` (idempotent). The helper runs that function in a subshell, so its release is lost and the outer `owned_cleanup` printed `the claim of … is not what this run wrote - the folder is left` (158 bytes). RED (case H3, `owned.test.exit.sh`): `FAIL H3 no line says the claim is not what this run wrote: expected [0], got [1]`, `FAIL H3 nothing is said at all: expected [0], got [158]`. Fix: claim missing and folder gone, state `created`: released, no line. H3b keeps the warning for a claim gone while the folder stays. After: `owned.test.exit.sh` 100 passed, 0 failed. Then `run.sh`'s `cleanup` calls `owned_cleanup` behind `if [ -n "${STATE:-}" ]; then`, as the brief § 3.3 item 1 asks; S4's difference 1 is struck out above. RED of that step: the script rule `the clean-up does not call owned_cleanup behind the STATE guard (brief § 3.3 item 1)`.

**10. The S4 review (`fb0901f`, `bb2c58b`).** F1 one directive line `# shellcheck source-path=SCRIPTDIR source=../../.github/scripts/lib/owned.sh`; the CI line for `run.sh` is clean. The `deploy/README.md` paragraph of `c76870d` is reverted (`.gitignore` and `architecture.md` stay). F6 `run.sh` says that on Windows (Git Bash) the pinned janitor is a dry run unless `JANITOR_WINDOWS_E2E_GREEN` is set, so it removes nothing there. The header's "in about a minute" is replaced by the bounds (a passing run takes a few minutes; a failing one reports after at most about ten: 60 s for port 80, 150 tries of 2 s plus a `docker run` for the certificate, 24 tries of up to 9 s for nginx). F8 `volumeProblems`: `compose create` before the first `docker run` that mounts a project volume, every `-v` source is `<folder's project>_` plus one of the four names; plants `acme_data` for `${PROJECT}_data`, and create moved after the chown, each red. F9 `down -v` keeps its output: on failure the run prints `clean-up: docker compose down -v ended with exit code N:` and the words; RED against the old `run.sh`: `F9 … ` and the script rule fail (`fail 2, pass 23`), green now (25 tests).

**Hosted evidence of S3 (added to part 3).** Runs on creds (`oleksandrdubyna88/dew_flow_creds_for_devs`): P 42735113631 (premise: `Publish` runs); R 42735252947 (the old shape, failure, `cv` left); G1 42735352830 (`tmp/e24-smoke-red` 8dab445: `Smoke-test` failure, `Smoke-test a refused start` skipped, the remover `success`, **`Check that nothing of the smoke is left`: success**, `Publish` skipped, the job failed as planned); G2 42735473885 (2ec4b56: `Smoke-test a refused start` failure, remover success, **check: success**, `Publish` skipped); S3.2 42735590128 (`feat/test-leftovers-e2.4` a267d75: every step success, **check: success**, `Publish` skipped by its own `if:`, the job green). Row E2.4-d is met: the check's result is quoted from G1, G2 and S3.2. **Observation (S3):** in R and G1 the container exited at once with code 78 (`FTL … exited: code 78, reason startupRefused: Vault:Allow…`), so the smoke printed its logs and exited 1 through the `unhealthy` branch, not through "never became healthy"; the job failed as planned, only the expected message in the brief was wrong.
**G3, run 42738357610 (`tmp/e24-smoke-red` 584192b).** Every anchored filter matched exactly its one resource on real Docker. The `$` anchor excluded the sibling `…-refused-data-<id>0`, which the unanchored filter matched. The check failed with `left after removal: refused refused-data refused-logs`, and `Publish` was skipped. `refused-data` was also left, because the container that still ran held it (Docker refuses to remove a volume in use, and `|| true` hid the error). This matches the brief's G2 purpose, so it is not a change.

**What was NOT counted as a plan change, and why.** G3 (an observation inside the brief's G2 purpose); B, the `owned_cleanup` fix (the helper is made to meet the S1 spec as written); the `deploy/README.md` revert (it restores the brief's "no edit"); the E2.5 items taken back out (the mount-dependency install in CI: E2.5's by § 5; the `module_tests.md` paragraphs of S3 and S4: *taken out here by mistake and put back in part 2c*); the ShellCheck, `-x`, `source-path` and directive fixes, the `entrypoint.test.sh` migration, the new tests and plants (evidence and lint inside the plan as written). Entry 8.1 is the one counted change (the rollout's, PR #146), recorded in the brief and in D5.

**Not fixed, with the reason.** *(Part 2c: the paragraphs of all four stories are in `module_tests.md`, brought up to date.)* The `module_tests.md` paragraphs of S1 (`59859b9`) and S2 (`abf693a`) stay: the coordinator's instruction named S3 and S4 only; if they should come out too, their text is in those commits. *(Part 2d: stated once and true: all four paragraphs, S1 to S4, are in `module_tests.md` now, brought up to date in `fdfe5d7`; the S1 and S2 text was moved out in `d50a828` and put back in `90ec17d`.)* The revert commit `49fb695` (made by `git revert`) has no `Co-Authored-By` line and cannot be amended. The guard-reading tests still skip in CI until E2.5 installs the mount's dependencies. No macOS or Windows leg of anything ran here.

**Final runs before the last commit** are listed in the report of the round (owned.test.sh, the start-server and smoke tests, `npm test` of `src_vs_code`, the CI shellcheck lines, actionlint, the guard).

#### Moved out of `module_tests.md` and back (was: "For E2.5: module_tests.md lines")

*[2026-11-10, part 2c: the text below went back into `research/module_tests.md` (`90ec17d`, then brought up to date in `fdfe5d7`), so what follows is the record of what was moved out and why that was wrong. The E2.5 story (this document, § Epics, E2.5) gives E2.5 only a new SECTION, "Test leftovers", in `module_tests.md`; each epic writes the paragraphs of its own flows, as E2.1 to E2.3 did, and the project rule and the operator's "docs with every change" command ask for the same. The brief's § 5 line "the guards' CI steps … `module_tests.md`" is that section, not the story paragraphs. The coai code gate said the same, as a gating finding. The mount-dependency install in CI stays out: that one IS E2.5's (§ 5, "the guards' CI steps").]*

~~By the brief's § 5 the `research/module_tests.md` text belongs to E2.5.~~ (Wrong, see the note above.) The edits of S3 (`bfaaa0c`) and S4 (`d2d3ae4`) were taken out of `module_tests.md` in the commit that follows this one; the text they added is kept here, whole, so E2.5 can apply it. (S1's and S2's paragraphs in `module_tests.md` were not part of that instruction and stay.)

**S3 — a new paragraph, after the S2 paragraph (the text as it stood then; the current one is in `module_tests.md`):**

> **The image smoke is a carve-out of the contract (2026-11-10, E2.4.S3 of [PLAN_test_leftovers_E2.md](../todo/PLAN_test_leftovers_E2.md)).**
> `docker.yml`'s two smoke containers and two volumes are named `testsToDelete-u1001-creds-{cv,refused,refused-data,refused-logs}-${SMOKE_ID}` and carry
> the label `testsToDelete.owner`; `u1001` is the uid of the hosted `ubuntu-latest` runner. The step that makes the id has the uid check as its
> FIRST command (`[ "$(id -u)" = 1001 ] || exit 1`) and comes before *Build*, so on any other runner nothing is made. One remover step
> (`if: always()`, `continue-on-error`, `shell: bash`, an unquoted name and `|| true` on each of four removals) runs after the last step that reads
> the containers; the step after it (`if: always()`, `shell: bash`, NO `continue-on-error`) asks for each of the four names with
> `docker ps -a -q --filter "name=^<name>$"` and `docker volume ls -q --filter …`, and fails the job while one is left. `Publish` keeps its implicit
> `success()`, so a failed smoke stays failed and nothing is published. `src_vs_code/src/test/dockerSmokeLeftovers.test.ts` reads `docker.yml` and
> RUNS the naming, remover and check bodies under `bash --noprofile --norc -eo pipefail` against a stub `docker` that keeps a world of named
> resources (a name in `STUB_STUCK` fails its removal and stays): all four removals are called after a failed first one; the check is red for each of
> the four names left, and for a remover that forgets a volume; the naming step ends at once, writing nothing, under a uid that is not 1001. Each rule
> also has a planted fault (a mutated copy of the real text) that it must refuse, and, when the mounted guard can load its `yaml` module, the
> shipped guard reads the real file with 0 findings and each plant (a quoted remover name, a `-v` source alone in quotes, a `docker inspect` or `docker
> logs` after the remover, a short name) with the finding it should have. What no test here can see is Docker itself: the hosted dispatches of the
> build record (part 3) do.

**S3 — the row of the table of container checks (`the AOT image, production shape`) now ends so:**

> | the AOT image, production shape | `docker.yml` → *Smoke-test a refused start* | every push to `main` (the image workflow does not run for pull requests) | the same with no auth scheme: read-only root, tmpfs `/tmp`, `cap-drop ALL`, `no-new-privileges`, Docker volumes; the containers and volumes are named under the leftovers contract and removed on every path (`dockerSmokeLeftovers.test.ts`) |

**S4 — a new paragraph, after the S3 paragraph (the text as it stood then; the current one is in `module_tests.md`):**

> **The acme harness owns its run (2026-11-10, E2.4.S4 of [PLAN_test_leftovers_E2.md](../todo/PLAN_test_leftovers_E2.md)).**
> `deploy/acme-test/run.sh` makes an owned folder with `owned_dir STATE acme`; its lower-cased name, `PROJECT="$(printf '%s' "${STATE##*/}" | tr '[:upper:]' '[:lower:]')"`,
> is the compose project and nothing else is (there is no `name:` in the compose file). The compose file's `x-owned` label `testsToDelete.owner` is on the four services,
> the network and the four named volumes (`certs-conf`, `certs-www`, `data`, `logs`); no state is a bind mount, because a container writes root-owned files that a
> janitor running as the user cannot delete. The script sets its clean-up with `owned_trap cleanup` and no trap of its own: `cleanup` runs
> `docker compose -p "$PROJECT" … down -v --remove-orphans` only when `PROJECT` is set, then the helper removes the folder. The first act of a run is the shared
> janitor (`--token creds`, 10 minutes), which collects what a `kill -9` left. The issued certificate is checked through a one-shot `alpine` container that mounts
> `certs-conf` read-only, never from the host: certbot's live folder is `drwx------ root`. `src_vs_code/src/test/acmeRunLeftovers.test.ts` copies `run.sh` into a temp
> tree and RUNS it against a stub `docker`, `curl`, `openssl`, `sleep` and janitor (green; a stack that does not start; no certificate; SIGINT during the janitor call;
> SIGINT and SIGTERM during `compose up`; an owned folder that cannot be made), and reads the text for the `PROJECT` line, the trap and the compose labels; each rule has
> a planted fault it must refuse (`PROJECT=acme`, an unlabelled volume, an unguarded clean-up, a host-side certificate check, a trap of its own). Docker itself is seen only
> by the hosted dispatch of the build record (part 4).

**S1 and S2 — taken out on 2026-11-10 too (same reason, § 5); put back in `90ec17d`, see the note above.** The S1 paragraph (`59859b9`) and the S2 paragraph (`abf693a`) stood after the paragraph that ends "RED again on a fresh publish without it."; the S2 table row stood after row *i* of the `start-server-and-wait` table. Their text:

> **The bash helper `owned.sh` has a self-test in real child processes (2026-11-09, E2.4.S1 of
> [PLAN_test_leftovers_E2.md](../todo/PLAN_test_leftovers_E2.md)).** `.github/scripts/lib/owned.sh` gives a shell script one owned
> folder, `testsToDelete-<owner>-creds-<what>-<8 hex>`, in the rule's order (claim by an exclusive write of the owner record, register
> the traps, create with `mkdir`), and removes it on every exit path by its exact name. `.github/scripts/lib/owned.test.sh` runs three area files (`owned.test.record.sh`, `owned.test.exit.sh`, `owned.test.sweeps.sh`, each in its own bash with its own private root, sharing `owned.test.lib.sh`) with 20
> cases (T1 to T21 of the spec; T3, T12 and T14 are Windows only) and every case starts a real `bash` with its own temp root: the
> name and the record against the mounted `owned.mjs` (the claim is byte for byte the reference's `formatOwner`, `:<start>:<ns>` on
> Linux), claim-first, a taken claim, a squatter folder that is never removed, `owned_remove` limited to this run's folders, a
> removal that gives up, `kill -9` between the claim and the `mkdir` and after it (the shipped janitor and the mounted Node sweep
> collect the claim on Linux and macOS; on Windows the Node sweep lists it `unverified:` and the janitor is a dry run), `OWNED_KEEP`,
> the exit chain under `set -e`, `set -u` with an empty registry, and a signal that arrives while `mkdir` runs. `ci-clients.yml` runs it
> on the three legs (macOS with `/bin/bash`, 3.2); `ci-server.yml` shellchecks both files. What it does not cover: a trap a caller sets
> itself (T7d measures the replacement, T7a scans the callers), a race of two live scripts on one name, the Windows
> collection (F16, F31), and the real temp root of a machine. On the WSL machine of this repository `mkdir` is uutils coreutils 0.10.0,
> whose plain `mkdir` is not always exclusive in a race (41 of 300 draws gave two successes), so `owned_create_dir` uses perl's `mkdir`
> where perl exists, and T5 races the helper's own create for 20 rounds and asserts one winner each; without perl on uutils the limit stays
> (the helper then relies on its exclusive claim for two live runs) and T5 prints a NOTE. A seam `OWNED_PROC` (the /proc root) lets a test give the helper a minimal /proc: the record then ends after the pid (T G4).
>
> **The shell scripts take their scratch from `owned.sh` (2026-11-10, E2.4.S2 of [PLAN_test_leftovers_E2.md](../todo/PLAN_test_leftovers_E2.md)).**
> `mcp-listen-smoke.test.sh`, `version-smoke.test.sh`, `start-server-and-wait.test.sh` and `deploy/restore-archive-itest.sh` make their
> folders with `owned_dir` (the test with its own clean-up function sets it with `owned_trap` first); none of them sets a trap of its
> own, and `owned.test.sh`'s caller scan (T7a) reads all of them. The two smoke scripts, with no log root and no `RUNNER_TEMP`, make
> their scratch with `owned_dir` too (a given root is unchanged, so the release jobs need no `owned.sh`); each smoke self-test has two
> new cases that run the smoke that way, with a private `TMPDIR`, once failing after the folder is made and once passing, and ask for an empty root.
> `start-server-and-wait.sh` with no `START_SERVER_LOG` writes `server.log` in a claimed, KEPT owned folder (case `j` reads the folder, the
> claim, the record's pid and that the old `start-server-*.log` is gone); its own trap became the `owned_trap` clean-up function, so an
> interrupt ends it with 128 plus the signal. `restore-archive-itest.sh` makes its nine worlds with `owned_dir` and gives the restore child
> `TMPDIR="$WORLD"`. Each of the four CI steps runs its script with `TMPDIR="$RUNNER_TEMP/leftovers-<step>"` and fails when anything is left in that root.
> Watched RED first (a private `TMPDIR`): a stub `chmod` that fails before the old removal left one `tmp.*` in each smoke self-test;
> the smoke scripts off CI left `creds-mcp-listen-smoke-<pid>` and `creds-version-smoke-<pid>`; `start-server-and-wait.sh` left
> `start-server-<id>.log`; the itest left nine `tmp.*`; a SIGTERM or SIGHUP to the process group of `mcp-listen-smoke.test.sh` left its `tmp.*`
> (a SIGINT does not, on the old script: bash waits for the child, which ends normally, and goes on). With `owned.sh` every root is empty, and INT, TERM and HUP give 130, 143 and 129.

**The S2 table row:**

> | j. no `START_SERVER_LOG`, no `RUNNER_TEMP`, a private `TMPDIR` (E2.4.S2) | the root holds one `testsToDelete-<owner>-creds-server-log-<id>` folder with `server.log` and its claim (a well-formed record, the script's own gone pid), and no loose `start-server-*.log` |

### E2.4 build record, part 2c — module_tests.md back, the certificate wait says it is waiting (2026-11-10, branch `feat/test-leftovers-e2.4`, not pushed, not merged)

**Why `module_tests.md` is back (the coordinator's correction).** Part 2b took the S3 and S4 paragraphs out of `research/module_tests.md` and kept their text in this record "for E2.5". That was wrong: the E2.5 story gives E2.5 only a new section, "Test leftovers"; each epic writes its own flows' paragraphs (E2.1 to E2.3 did), and the project rule asks for docs with every change. `90ec17d` restored the file; `fdfe5d7` brings the four paragraphs (S1 `owned.sh`, S2 scripts, S3 image smoke, S4 acme) in line with the fix round: `owned_cleanup` and the H3 cases; `entrypoint.test.sh`, the shellcheck lines, Git Bash needing Node and the mount; entry 8.1, the id check, the position before buildx, `bash -e` for the naming body, the name-set test, the plants, the overlapping siblings, the hosted runs; the cleanup order, the `down -v` report, the order of `compose create` and the `-v` sources, the progress lines, the Windows dry run. Every claim was read against the code at HEAD. The mount install in CI stays out (E2.5's, § 5).

**Commits.** `63d4577` RED, `b53d312` the progress lines, `fdfe5d7` `module_tests.md`, this record.

**The certificate wait (coai finding, minor).** The wait in `run.sh` is 150 tries of 2 s plus a `docker run` each and printed nothing. RED (`acmeRunLeftovers.test.ts`, the no-certificate scenario): `the certificate wait says it is waiting: …` failed with `actual: [], expected: [15, 30, …, 150]` (26 tests, 25 pass, 1 fail). Fix: `tries=150`; `if [ $((n % 15)) = 0 ]; then echo "  still waiting for the certificate: try $n of $tries"; fi` each try; on timeout `no certificate was issued after 150 tries`; the header names the progress lines. GREEN: 26 pass; a run that finds the certificate at once prints none; `shellcheck -x deploy/acme-test/run.sh` (0.11.0) clean.

### E2.4 build record, part 2d — the independent review of the fix round, and the first CI run of PR #329 (2026-11-10, branch `feat/test-leftovers-e2.4`, pushed by the coordinator as PR #329)

**Commits.** `5ada0ee` H3c test; `6cb6599` the S1 spec note; `5c3511e` RED (acme: `--max-time`, the guard block); `c715f27` run.sh; `ac0ecb8` CodeQL (C) and the live-lines rule; `1e4181d` the janitor from PATH (A); `204636d` the Windows plant (B); `0cce340` CI line, `entrypoint.test.sh` header, F5 value; `71cdb30` the brief notes; `445a225` and the commit after it, this record.

**1. Scope: the smokes' shellcheck.** Brief § 5 and I16 say the smoke scripts' shellcheck is a todo, not built here. The four files left the CI line (`ci-server.yml`); the other shellcheck lines stay. They are shellcheck-clean by hand: `shellcheck -x` 0.11.0 on the four files, 2026-11-10, no output. The sentence "closes I16" of part 2b is corrected there.

**2. `entrypoint.test.sh`.** Kept. Dated notes in the brief (row 20 and § 2): the file came with #326 after the inventory was measured at `0ae0211`, so it is a site of the planned kind (E2's scope "every temp site of … the CI/test shell scripts"); its CI step has S2's temp-root check; E2.4's Done-when (5 guard findings) needs it. Not a change. Its header now says that under Git Bash the owned folder needs Node and the mount.

**3. Test gap H3c (confirmed by a mutant).** Case H3c in `owned.test.exit.sh`: the folder is removed and the claim is rewritten with other text; expected: the warning once, the claim stays, the exit status survives. Mutant (the new `owned_cleanup` branch checks only the folder): `FAIL H3c a folder gone with a claim of other text keeps its warning: expected [1], got [0]` (102 passed, 1 failed). Real helper: 103 passed, 0 failed.

**4. S1 spec.** A dated note at `owned_cleanup` in `PLAN_test_leftovers_E2.4_S1_spec.md`: the branch "claim and folder both gone: released, silent", with the trade-off that if a buggy sweep removed a live run's folder and claim together, this run's exit is silent about it.

**5. Record contradictions.** Corrected by notes (nothing deleted): the S1/S2 paragraphs of `module_tests.md` are stated once and true (all four are in the file); the README sentence of S4's difference 6 (the README is not edited; `run.sh`'s header carries the old-`state/` text and the removal command); the quoted S3 and S4 paragraphs are marked as the old text.

**6. acme time bound, `--max-time`.** The loops alone take 60 + 150 × 2 + 24 × 9 = 576 s, plus 150 `docker run`s: about 11 to 13 minutes, not "ten". The header says so. RED: `every curl call is bounded by --max-time …` failed (the port-80 calls and the 443 `/api/vault` call had none). Fix: `--max-time 4` on those four calls. GREEN: 28 tests pass. (The curl stub now logs its arguments to a file of its own.)

**7. The guard block.** The rule asserts that `owned_cleanup` stands between the STATE `if` and its `fi`. With the old rule ("both lines exist") the plant "owned_cleanup moved out of the guard" is not refused (`fail 2`, the plant test among them); with the new rule it is.

**8. F5.** `d="(no folder)"` before the loop, so F5's failure text is clear when the root holds none.

**Rejected, no change (the coordinator's reasoning).** The duplicate "could not remove" line when the subshell's `owned_cleanup` gives up: the subshell's state cannot reach the outer shell, a second attempt can succeed once a holder has ended, and two lines for two attempts are true.

**The three real failures of PR #329's first CI run.**
- **A. macOS, "Self-test the shell helper": T13, T15 and T16** failed with `janitor.sh: command substitution: line 132: syntax error`. Cause: `run_janitor` ran the shared janitor with `"$BASH"`, which is `/bin/bash` 3.2 on macOS; bash 3.2 cannot parse `janitor.sh:132` (a `case … esac` inside `$( )` inside `${…:-…}`). Fix: the self-test runs the janitor as its callers do (`bash "$janitor"` from PATH; the shebang is `#!/usr/bin/env bash`, and `run.sh` calls it so; Homebrew's bash 5 on the hosted runner), with a comment that says why; `owned.sh` itself stays under `"$BASH"`. A `bash` older than 4 on PATH prints `NOTE T13: \`bash\` on PATH is version 3; …` and `skip T13 janitor: bash on PATH older than 4` (and the same for T15, T16); the Node half of T13 still runs. The shared janitor is not changed; the parse failure is a conventions follow-up (the coordinator files it). Checked here with a fake `bash` first on PATH that says 3: `20 passed, 0 failed`, the three NOTE and skip lines; with the real `bash`: `26 passed, 0 failed`. The macOS failure itself cannot be reproduced on this machine; the next CI run is the proof.
- **B. Windows, "Self-test the release smoke script": the case "off CI: a binary that is not executable"** failed: in Git Bash `[[ -x ]]` is true for a file whose first line is `#!`, so the plant at `mcp-listen-smoke.test.sh:99` was a program there. The plant is now `printf 'not a program\n' > "$work/not-a-program"` (no `#!`, no extension). `version-smoke.test.sh` has no such plant (it uses `FAKE_LOG=no`). Locally the case still passes (`exit 1`, `not an executable`, root empty); the Windows leg is the proof.
- **C. CodeQL `js/useless-regexp-character-escape` at `acmeRunLeftovers.test.ts:52`**: `PROJECT_LINE` was a template literal with `\${STATE…}`; the string reaches `mutate`, which also takes a RegExp, so CodeQL read `\$` as a regexp escape. `PROJECT_LINE` is now built from pieces with no escape. The tests that use it (`PROJECT=acme`, a second assignment, a fixed `-p`) still go red on their plants (28 pass). The folder-removal rule now reads live lines only, because `run.sh`'s new header comment names `rm -rf` (the command that removes an old `state/`). The `actions/untrusted-checkout` alert at `docker.yml:47` (the known false positive, dismissed as alerts 1, 13 and 40) is the coordinator's; the checkout is unchanged.

**The second CI run of PR #329 (head `5506d8d`).** macOS is green (A holds). The real `docker.yml` dispatch on this head, run 42744213082, is green: the first hosted run of entry 8.1's naming step and check (`runner uid: 1001`; the id made, checked, then written). One new failure, seen for the first time because the Windows leg had stopped at B before reaching the helper's self-test:
- **D. Windows, "Self-test the shell helper": T16** `FAIL T16 the claim names the child's pid: expected [2014], got [8872]`. Cause: the test's child wrote its msys `$$`, while the record holds the shell's Windows pid (`/proc/$$/winpid`, `owned.sh:163`), the pid a sweep can check. The helper is right; the test compared the wrong pid. Fix: the child writes `/proc/$$/winpid` under MINGW/MSYS/CYGWIN and `$$` elsewhere. RED is the CI line above; GREEN is the next Windows run. Linux after the fix: 90, 103 and 26 passed; the CI shellcheck line of the helper files (0.11.0): clean.
- **The CodeQL `actions/untrusted-checkout` alert 54 at `docker.yml:47`** is the finding dismissed as a false positive three times before (alerts 1, 13, 40, 2026-09-05). E2.4 does not change the checkout or the job's `if:`. Its dismissal was refused to the agent by the auto-mode classifier; it is the owner's to dismiss.

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
- **Done when.** S4 sc. 1–7 green or recorded, **sc. 8–9 green (2026-11-07, the parent's epoch 8)**; the guard evidence run shows only `commandParse.test.ts:40` and the
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
    always-run remover, **the uid check as the naming step's first command, the post-cleanup check step and their creds
    test**; the throwaway-branch failure evidence (FAILED and `Publish` skipped) and the happy path. Owns
    sc. 1, 2, **8 (2026-11-07, the parent's epoch 8)**.
  - **E2.4.S4 — acme: project identity, labels, state and teardown together** (Opus · Sonnet · Opus): D6 whole — the
    owned project and state (**the state in labelled named volumes of the project, 2026-11-07, the parent's item 4.3.2**),
    the top-of-script trap, the janitor `--token creds` sweep, the kill and interrupt cases,
    `.gitignore`, `deploy/README.md`, `architecture.md:363`. Owns sc. 5, 6, 7, **9 (2026-11-07)**.
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
