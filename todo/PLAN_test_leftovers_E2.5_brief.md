# PLAN — Test leftovers, E2.5 brief: repository-wide enforcement (stories S1–S3)

> Status: **S1–S3 merged as PR #330 (`b6cc6b3`), 2026-11-10; the plan gate and every code round said `proceed`; the hosted evidence is recorded.** Was: S1–S3 built on `feat/test-leftovers-e2.5` (PR #330, unmerged). Build record: § *E2.5 build record* of [PLAN_test_leftovers_E2.md](PLAN_test_leftovers_E2.md). Was: brief only, nothing built. Revised the same day in one pass
> with the gate's accepted findings G1–G3 and an independent Opus review's findings F1–F18 (§ 13 says, for each, why it is
> not a change). Scope: the build brief of epic E2.5 of [PLAN_test_leftovers_E2.md](PLAN_test_leftovers_E2.md)
> (§ *Epics* → E2.5, § S5, D7, D8, D9; § *Revision for the rollout's epochs 6 and 7* rows 1, 2, 6, 7; § *Revision for the
> rollout's epoch 8* rows E2.5-a, b, c). Base: `main` `6e08071`, where E2.1 (#294), E2.2 (#310), E2.3 (#311) and E2.4 (#329)
> are merged; the mount is release `37b9aa5`. Branch for the build: `feat/test-leftovers-e2.5` from that commit. Brief by
> Opus; code by a Sonnet coder; review by Opus. **The parent's epoch 8 has used its one change (entry 8.1). The next
> accepted change is the eighth full stop.** So every difference from the plan that this brief found is an open question
> in § 10, never built in. The coordinator answered Q1–Q12 (end of § 10) with no change counted.
> **One open pull request touches the same files: creds #328 (draft, `chore/rules-layout-migration`, `8f31013`) moves
> the mount from `.claude/rules/shared` to `.agents/conventions` and the project text from `CLAUDE.md` to
> `.agents/PROJECT.md`** (Q1, and its order in S3.0). Below, `<mount>` means `.claude/rules/shared` on `6e08071`.

**The epic's goal (E2.5, the stories' words).** Both whole-tree guards are on and green on three OS legs and in the
required `docs.yml` job; every remaining finding is a real exemption with a reason; the barrier rescan is clean; the docs
and the records are complete. (How "three OS legs" is read where one leg is not a required check: Q10.)

Sources, read for this brief: the stories document (header; § *Revision* for epochs 6/7, rows 1, 2, 6, 7, 8; § *Revision*
for epoch 8; D7, D8, D9; § *Order* and its table; § S5; § *Test plan*; § *Definition of Done*; § *Epics* E2.5; the E2.3
build record parts 1, 3, 3b, 5; the E2.4 build record parts 1–4 and 2b–2h; the notes N1–N21); the E2.4 brief (§ 1, § 5,
§ 7) and the E2.3 brief (§ 3.1, Q4) as models of form; the parent `dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md`
at `origin/main` `d89a32f` (read only: the ledger to entry 8.1; § *Re-review for epoch 8*; § *Epoch 8* items 1, 2, 3, 3.2,
5, 8; § *Epoch 3* item 4; the DoD; § *Epics* E2); conventions `todo/PLAN_F30_folding_reader.md` D2 at the pin `37b9aa5`;
the mounted `common/test-leftovers-detail.md` § 7, `common/planning-docs.md`, `common/plan-change-control.md`; the mounted
`tools/leftovers-check.mjs`, `tools/lib/leftovers-cli.mjs`, `tools/lib/leftovers-fold.mjs`, `tools/lib/leftovers-fold-shell.mjs`,
`tools/janitor.sh`; the template's `dew_flow_mcp · tests/Mcp.Tests/Leftovers/LeftoversRepositoryGuardTests.cs` at
`197cc76`; creds #328's diff; `release.yml`'s triggers and matrices. Every `file:line` below was read at `6e08071`.

*Instruction loading:* this repository has no `AGENTS.md` and no `.agents/PROJECT.md` on `main`, so the shared resolver
answers `rules check: INCOMPLETE — Missing instruction source: …/AGENTS.md`. The rules named above were read directly
from the mount. Nothing was changed but this brief and its `todo/README.md` row. The mount's `node_modules` were
installed inside the mount only (`npm ci --ignore-scripts --prefix .claude/rules/shared`, git-ignored there). The C#
guard was run by hand from a scratch test file in two separate detached worktrees, never committed and deleted after
(as E2.3's part 5 did); the plants of § 0 and the mutant copies of the guard lived in scratch folders outside every temp
root, also deleted.

## 0. What was measured at `6e08071` (the delta against HEAD, epoch 8 item 8.1)

**The shipped Node guard** — `node <mount>/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the
developer-credentials server and extension"` (1.5 s, 622 text files discovered): **5 findings, exit 1**, exactly the
list the parent expects (row E2.5-a):

```
deploy/restore-archive.sh:61 — raw-temp — `mktemp`
deploy/restore.sh:102 — raw-temp — `mktemp`
install.sh:63 — raw-temp — `mktemp`
install.sh:76 — raw-temp — `mktemp`
src_vs_code/src/test/commandParse.test.ts:40 — docker-name — the image `myimage')` a test builds is not an owner-form leftover name
```

No `legacy-name`, no `owner-blind`, no `token` finding. So the parent's 8.2 surprise for E2.5 ("new `legacy-name`
findings from the F30 reader") did not come.

**The copied C# guard** — `LeftoversGuard.Scan(root, root)`, as the template's `LeftoversRepositoryGuardTests` does
(372 files): **10 findings**. Six of them are not the Node guard's (`ci-server.yml:375`, the two `docker.yml` lines, the
three `AgentRelayTests.cs` lines); the Node guard's `commandParse.test.ts:40` is not the C# guard's (it reads no `.ts`):

```
.github/workflows/ci-server.yml:375 — raw-temp — `mktemp`
.github/workflows/docker.yml:98 — docker-run — `a container started without the remove flag`
.github/workflows/docker.yml:125 — docker-run — `a container started without the remove flag`
deploy/restore-archive.sh:61 — raw-temp — `mktemp`
deploy/restore.sh:102 — raw-temp — `mktemp`
install.sh:63 — raw-temp — `mktemp`
install.sh:76 — raw-temp — `mktemp`
src_cli/tests/AgentRelayTests.cs:38 — raw-temp — `"/tmp"`
src_cli/tests/AgentRelayTests.cs:39 — raw-temp — `"/tmp"`
src_cli/tests/AgentRelayTests.cs:278 — raw-temp — `"/tmp"`
```

**A scratch copy with § 6's markers and Q4's answer (A)** (then thrown away): the Node guard `leftovers-check: clean (622
files).`, exit 0; the C# guard 2 findings, both `docker.yml` `docker-run` (the exclusion of S1.2 is what remains);
`ClientSitesScanTests` red as predicted (S2.3).

**The base before E2.1** (`a52fde1`, the parent of `834c91b`), with the same pinned guards: the Node guard **64**
findings (54 `raw-temp`, 5 `docker-name`, 2 `docker-run`, 3 `legacy-name`); the C# guard **84** findings over 295 files
(75 `raw-temp`, 4 `docker-name`, 2 `docker-run`, 3 `legacy-name`). The stories' "62" was the older guard at `47724fd`
(Q8).

**The mount de-initialised** (a detached worktree of `6e08071`, the C# test built with the mount, then `git submodule
deinit -f .claude/rules/shared`; F9, Q6). The shipped guard cannot start: `node .claude/rules/shared/tools/leftovers-check.mjs …`
ends in `node:internal/modules/cjs/loader … throw err`, exit 1. The same guard copied out of the mount (its `tools/`,
`common/` and `node_modules`, byte-equal to the mount's `tools/`) and run with `--repo` on that tree: the same 5 findings,
exit 1, and **no** `token` finding (the token check reads the rule beside the guard, which the copy carries). The C#
guard on the same tree: **11** findings, the 10 above plus `.github/scripts/branch-protection.mjs:1 — owner-blind — the
shipped classifier could not judge the scripts — node exited 1: node:internal/modules/esm/resolve…`; and
`RegisteredTokenFindings` gives 1 `token` finding: `neither common/test-leftovers-detail.md … nor common/test-leftovers.md
under …/.claude/rules/shared has a ## Tokens section — the token creds is not registered; an uninitialised submodule …`.

**Other reads.** `sweeper-scan.mjs --root .`: `none found (1678 file(s) read) — the barrier is open for this scope`.
Token checks: the Node guard none; the C# `RegisteredTokenFindings` 0 and `ConstantFindings` 0. The Node guard over an
empty `git init` folder and over a missing folder: exit 2, `leftovers-check: scanned nothing under <dir> — discovery
broke; the repository is not clean`. The C# guard over an empty folder: `FilesScanned` 0. `owned.sh` reads `TMPDIR` for
its root and never `RUNNER_TEMP` (`git grep -n RUNNER_TEMP .github/scripts/lib/owned.sh` → nothing; F4).

**Plants** (Node: `scanText(<path>, <text>)` of the mounted guard, which ignores discovery; C#: `Scan(<plant root>,
<repo>)`, which applies discovery; "—" = not discovered by that guard):

| Plant (path, text) | Node guard | C# guard |
|---|---|---|
| `src_vs_code/scripts/x.cjs`, `fs.mkdtempSync(path.join(os.tmpdir(), 'x'))` | `raw-temp` (but the `node` profile does not discover the folder) | 1 `raw-temp` |
| `src_vs_code/src/test/xWorld.ts`, the same | `raw-temp` (not discovered: not `*.test.ts`) | **— (`FilesScanned` 0)**: no `.ts` kind (S1.3) |
| `src_vs_code/src/test/x.test.ts`, the same | 1 `raw-temp` (discovered) | — (`FilesScanned` 0) |
| `src_cli/tests/X.cs`, `Path.GetTempPath()` | — | 1 `raw-temp` |
| `src_cli/tests/Y.cs`, `"testsTo" + "Delete-agent-x"` | — | 1 `owner-blind` (`testsToDelete-ag`) |
| `src_mcp/tests/X.cs`, `Owned.Prefix` | — | 1 `owner-blind` |
| `.github/workflows/docker.yml`, the real file | 0 | **2 `docker-run`** (`:98`, `:125`) (S1.2) |
| `deploy/acme-test/run.sh`, `docker compose -p cred-vault-acme-test up -d` | 1 `docker-name` | 1 `docker-name` |
| the same, `-p "$PROJECT"` | 0 | 0 |
| the same, `-p teststodelete-u1001-creds-acme-abcd1234` | 0 | 0 |
| the same, `-p teststodelete-${OWNER}-creds-acme-$id` | 1 `docker-name` | (not run) |
| `src_vs_code/scripts/x.cjs`, `'testsTo' + 'Delete-agent-x'` | 1 `legacy-name` (but not discovered) | **0** (Q9) |
| `src_vs_code/scripts/x.cjs`, `'testsToDelete-agent-x'` | 1 `legacy-name` (not discovered) | 1 `legacy-name` |
| `.github/scripts/x.sh`, `p="testsTo""Delete-agent-x"` | 1 `legacy-name` | 0 |
| `.github/scripts/x.sh`, `p="testsTo"+"Delete-agent-x"` | 1 `legacy-name` | (not run) |
| `.github/scripts/x.sh`, `p="testsToDelete-agent-x"` | 1 `legacy-name` | 1 `legacy-name` |
| `.github/scripts/x.sh`, `p=testsTo; q=${p}Delete-agent-x` | 0 (a stated limit) | (not run) |
| `.github/scripts/x.sh`, `x=${TMPDIR:-/tmp}; mkdir -p "$x/a"` | 0 (N6) | (not run) |
| a workflow `run:` block with `work="$(mktemp -d)"` | **0**: the Node guard reads `mktemp` in `.sh` only | 1 `raw-temp` (Q4) |
| the 55 `src_vs_code/src/test/*.ts` helpers that are not `*.test.ts`, each read as a script under `src_vs_code/scripts/` | — | `FilesScanned` 55, 0 findings |
| `install.sh` with the marker of § 6 above `:63` | `:63` gone, `:76` stays | `:63` gone, `:76` stays |
| the same marker with the reason `needed`, or `product script` (two words) | `exemption` + the finding stays | (not run) |
| the same marker with another class (`docker-run`) | the finding stays, no `exemption` finding | (not run) |
| `commandParse.test.ts` with the marker of § 6 above `:40` | 0 | — |
| an `owner-blind` line with an `owner-blind` marker above | `exemption` + `owner-blind` | (not run) |

**The F30 plants, with their detail text and two mutants** (F1; `scanText`, a path the profile discovers; each mutant a
scratch copy of the mount's `tools/` with one line changed):

| Plant | Pinned guard | `+` join off (`chain`, `leftovers-fold.mjs:430`) | piece reading off (`pieceHits`, `:784`) |
|---|---|---|---|
| `.cjs`: `const p = 'testsTo' + 'Delete-agent-x';` | `legacy-name` `` `testsToDelete-agent` `` | `legacy-name` `` `testsTo (a piece of the prefix word)` `` | `legacy-name` `` `testsToDelete-agent` `` |
| `.sh`: `p="testsTo""Delete-agent-x"` (touching pieces) | `legacy-name` `` `testsToDelete-agent` `` | the same | the same |
| `.sh`: `p="testsTo"+"Delete-agent-x"` (a `.sh` does not join `+`) | `legacy-name` `` `testsTo (a piece of the prefix word)` `` | the same | **no finding** |
| `.cjs` / `.sh`: a whole legacy literal | `legacy-name` `` `testsToDelete-agent` `` | the same | the same |

So an assertion of class and line alone does not go red when the `+` join is off: the piece reading still finds the
plant. The assertion must name the detail text (S2.6).

**Break-it, tokens** (scratch, reverted): `REPO_TOKEN = 'cred'` in `leftovers.cjs` → 2 `token` findings: `token constants
differ: creds in .github/scripts/lib/owned.sh:37, creds in …/OwnedToken.cs:9, cred in src_vs_code/scripts/lib/leftovers.cjs:20 —
every helper of a repository holds the same token (§2)` and `the token cred is not a row of the ## Tokens table of
common/test-leftovers-detail.md`.

**The two given-root leaf names (Q5 (C)).** `git grep -n -E 'listen-smoke-|version-smoke-' -- . ':!todo' ':!research'`:
the two leaves (`mcp-listen-smoke.sh:46` `creds-mcp-listen-smoke-$$`, `version-smoke.sh:73` `creds-version-smoke-$$`) and
two other names, the self-tests' CI roots `ci-clients.yml:90` (`$RUNNER_TEMP/leftovers-mcp-listen-smoke-test`) and `:107`
(`…/leftovers-version-smoke-test`), which do not read the leaf by name. `mcp-listen-smoke.sh:108` finds `creds-mcp-*.log`
INSIDE the leaf (the binary's own log name, not the leaf). No workflow step, artifact upload, release step, test or
script header reads either leaf by name. In `research/`: `module_tests.md:390`, a past-tense record of what the old
scripts left; it stays as it is.

## 1. The parent's table, filled

Each row is a merge condition of E2.5's pull request: the parent's rows E2.5-a, b, c and the E2 rows that apply to every
PR (E2 (c), E2-d); revision rows 6 and 7; S5 sc. 1–6; the E2.5 items E2.4 deferred (its brief § 5); D7; the DoD's E2.5
lines; the gate's G2 and G3. No row is unmapped since the coordinator's answers.

| # | Condition | Implementation (file:line at `6e08071`) | Invocations covered | Executable check | Prepares / does not prove | Observed at `6e08071`, with the counterexample that must be red |
|---|---|---|---|---|---|---|
| 1 | **E2.5-a** — the Node guard leaves only the inventory's exemptions | the five markers of § 6; the guard step in `docs.yml` (§ 5) | `docs.yml` `lifecycle` (required); a person | the step on the PR head prints `leftovers-check: clean (<n> files).`, exit 0 | A text scan of the files the `node` profile reads. It does not read `.cs`, `src_vs_code/scripts/`, `src_minimalapi_server/scripts/` or the `.ts` helpers (rows 8–11 carry those) | 5 findings (§ 0); with the markers: clean (622 files). Red: a marker whose reason is `needed` → `exemption` and the finding stays |
| 2 | **E2.5-a, F30 plants** — the `.cjs` and `.sh` plants are findings; the PR pins each as a positive test, RED by hand once against a copy of the guard with the plant's line removed (the parent's words) | `src_vs_code/src/test/leftoversGuardFixtures.test.ts` (new, S2.6), a marker above each plant line (F3) | `npm test` (`ci-extension.yml:74-75`), with rows 13 and 28 | `scanText` of the mounted guard: each plant → exactly one `legacy-name` on its line WITH its detail text (F1) | `scanText` reads the spelling, not discovery: a plant path the profile does not discover proves the reader only (Q9) | § 0's F30 table. RED: the `+`-join mutant turns the `.cjs` detail into the piece text; the piece mutant removes the `.sh` `+` plant's finding |
| 3 | **E2.5-b** — the `.sh` temp paths the guard cannot see were migrated by E2.4; `git grep` for the old leaf names → 0 | E2.4: `mcp-listen-smoke.sh:44-55`, `version-smoke.sh:72-82` (`owned_dir` when no root is given). E2.5: the two given-root leaves renamed (S2.8, Q5 (C)) | a person; CI and release pass `RUNNER_TEMP` (`ci-clients.yml:93`, `:110` (the self-tests), `:144`, `:258-260`; `release.yml:430`, `:705`, `:712`) | `git grep -n -E 'creds-mcp-listen-smoke-|creds-version-smoke-' -- . ':!todo' ':!research'` → 0; the two smoke self-tests green on three OSes | No detector (N6). `owned.sh:293` keeps `${TMPDIR:-/tmp}` as the helper's root. `todo/` and `research/` hold records of what was | **2** today (`:46`, `:73`, the given-root leaves E2.4 kept); nothing reads them by name (§ 0) |
| 4 | **E2.5-c** — the C# guard folds `.cs` | the copied `LeftoversGuardLiterals.cs` (E2.3) | the five xUnit executables | `LeftoversGuardCredsTests` plant: a split prefix word in `src_cli/tests/Y.cs` → 1 `owner-blind` | The Node guard does not read `.cs` | § 0: 1 `owner-blind` (`testsToDelete-ag`). Red: the same plant with `LeftoversGuardLiterals` reverted to a whole-literal read (by hand, S1.1) |
| 5 | **Revision row 6** — the guard step says what its zero means; F30 shipped or re-decided before E2.5 merges | the step's comment in `docs.yml` (§ 5), the sentence of § 8 | `docs.yml` | a reviewer reads the comment against D2 at the pin | Words, not behaviour | F30 is in `37b9aa5` (`acb693c` is its ancestor, checked), pinned by #306. Met |
| 6 | **E2 (c), S0 acceptance 2** — the barrier rescan on the PR head | none (a read) | the checkout | `node <mount>/tools/sweeper-scan.mjs --root .` → `none found`, quoted on the PR | The scan reads this checkout only | `none found (1678 file(s) read)` |
| 7 | **E2-d** — the hand clean-up of old names, per machine | E2.5 makes no resource and has no old name; the renamed given-root leaves of S2.8 live only in a caller's root | — | the PR says "none of E2.5's own"; S3.3 collects the four earlier PRs' records into one list | A record, not a proof | — (nothing to clean) |
| 8 | **S5 sc. 1** — this repository passes both guards | Node: row 1. C#: `LeftoversRepositoryGuardTests.cs` (copied, S1.4) | Node: `docs.yml`. C#: `ci-clients.yml:177-178` on ubuntu, macOS (required) and Windows (not required, Q10), `:165-167` (macOS), `sonarcloud.yml:157`, `release.yml:393`, `:666` (row 27) | `This_repository_passes_the_guard` green; the docs step green | The C# guard walks the FILE SYSTEM, not git: an untracked script in a person's checkout is read (§ 12, risk 1) | C#: 10 findings (§ 0); after § 6 and Q4 (A): 2, both `docker.yml` (row 10). RED history: `a52fde1` Node 64, C# 84 (Q8) |
| 9 | **S5 sc. 2, C# half** — every class fires once; a valid marker silences it | `LeftoversGuardCredsTests.cs` (new, creds' own, S1.1), its plants built from non-literals (F2) | the five executables' `ServiceDefaults.Tests` | the plant table of S1.1; the file itself scans clean | Plants in an owned scratch root, not the real tree | § 0's C# column; the `xWorld.ts` plant is not discovered today (row 11) |
| 10 | **D7, N18** — the C# guard excludes `docker.yml` from its docker classes by name, ONE pinned entry; the Node guard's green is the proof that the exclusion hides nothing | `LeftoversGuard.cs:199-205` (`HitsOutsideSource`) and a new constant beside `:45`, as manifest ops (S1.2) | the same | a test pins the list `[".github/workflows/docker.yml"]`; the real `docker.yml` → 0 docker findings; the SAME text as `.github/workflows/other.yml` → 2 `docker-run` | The exclusion is by name; a renamed workflow loses it (the counterexample) | today 2 `docker-run` (`:98`, `:125`) |
| 11 | **D7** — the C# guard reads the `src_vs_code/src/test/` helpers that are not `*.test.ts` | `LeftoversGuardFiles.cs:22` (`HasBlockComments`), `:30-31`, `:72-73` (`IsScript`), as manifest ops (S1.3; Q12) | the same | plant `xWorld.ts` → 1 `raw-temp`; plant `x.test.ts` → not discovered (the Node guard's) | — | **`FilesScanned` 0 today** (RED). The 55 real helpers, read as scripts: `FilesScanned` 55, 0 findings |
| 12 | **S5 sc. 2, Node half** — the `docker.yml` facts through the shipped guard | already built by E2.4 in `dockerSmokeLeftovers.test.ts` (part 3, RED list item 4) | `npm test` | they RUN in CI, not skip (rows 13, 28) | — | they skip in CI today (row 13) |
| 13 | **E2.4 brief § 5, part 2b item 4** — the mount's `node_modules` where the guard-reading tests run | `npm ci --ignore-scripts --prefix <mount>` in each job that runs the whole unit suite (Q7; F5) | `ci-extension.yml` `typecheck · test · package`, `sonarcloud.yml` extension coverage, `release.yml` extension job | `workflowMount.test.ts` gains the install rule (S2.4); the CI log of `npm test` shows the guard tests run | — | E2.4 part 2b: without the modules `42 tests, 39 pass, 3 skipped`; CI today skips |
| 14 | **S5 sc. 3** — a scan of nothing is red | Node: a `docs.yml` step (§ 5, `[E2.1 plan gate 2]`). C#: the copied `A_scan_of_nothing_says_so_instead_of_reporting_clean` | `docs.yml`; the executables | exit 2 and the sentence; `FilesScanned == 0` | An empty repository stands in for a broken discovery | both measured (§ 0). Red: the same step pointed at the real tree → not 2 |
| 15 | **S5 sc. 4** — the tokens | the three constants; the copied `GuardTokens` tests | both guards | Node: no `token` finding on the head; the break-it of § 0 by hand. C#: the copied token tests | — | none / 0 / 0; break-it: 2 `token` findings naming the three places |
| 16 | **S5 sc. 5** — the exclusion lists are pinned | `LeftoversGuard.cs:45` (`ExcludedFiles = []`), row 10's constant; the Node guard's `EXCLUDED_FILES` (`<mount>/tools/leftovers-check.mjs:137`) | — | the copied `No_file_is_excluded_and_the_guards_own_tests_are_scanned_clean` (`LeftoversGuardTests.cs:657`); row 10's pin; the Node guard's own test | — | C# `[]`; Node: its two test files |
| 17 | **S5 sc. 6** — break-it on the real tree, by hand, recorded, reverted | none | — | each red, naming its line or cause (S2.7) | By hand, once | the de-initialised mount (§ 0): the Node guard cannot start (exit 1, the missing module); copied out, 5 findings and no `token` finding; the C# guard 11 findings with the one `owner-blind` for the missing classifier, and 1 `token` finding (Q6) |
| 18 | **The C#-only findings** | `AgentRelayTests.cs:38`, `:39`, `:278` (markers, Q3 (A)); `ci-server.yml:375` (`$RUNNER_TEMP`, Q4 (A)) | `CredsCli.Tests`; job `compose · scripts` | row 8 green | — | scratch copy with both answers: C# 2 left, both `docker.yml` |
| 19 | **Docs** | `research/module_tests.md` (a section before `:125`, § 7); `research/architecture.md:374`; the *Commands* lines (Q1) | — | a reviewer reads them against the code | Words | — |
| 20 | **Completion records** | the stories' status line and `todo/README.md:38`; `plan-lifecycle.mjs` | `docs.yml` | `plan-lifecycle` green | The parent's E2 entry is in conventions: the coordinator's PR, not this one | — |
| 21 | **§ Epoch 3 item 4** — the invocation inventory | § 3, copied to the PR | every job that runs a guard; the Q4 site; the two renamed leaves | a reviewer compares § 3 with `git grep -n -E "leftovers-check|ServiceDefaults.Tests|npm test|node --test" -- .github` | E2.5 drops no prefix; the inventory is of the GUARDS, plus the sites E2.5 changes | § 3 |
| 22 | **The DoD's F3 line** — F3 released and pinned before the first Node compliance declaration | `<mount>/tools/leftovers-check.mjs:308` (`isPackageManifest`: the `node` profile reads `package.json` scripts) | — | none needed | E5's #945 declared first | met at `37b9aa5` |
| 23 | **D8** — one plan gate, one code gate, an Opus review per story; the cadence consult of this group | — | — | the PR names the rounds and the reviewers that answered | — | the plan gate said `proceed`; the group's consult is `c4fb33b8` (E2.4 brief § 4); no new one is due |
| 24 | **The stories' DoD: nothing of the Node reference was copied** | `src_vs_code/scripts/lib/leftovers.cjs` (E2.1) | — | the reviewer greps the wrapper for every exported name of `<mount>/tools/lib/owned.mjs` and finds only re-exports; the result on the PR | A reading at the head | E2.5 does not change the wrapper; the grep is re-run on the head |
| 25 | **The stories' DoD: nothing of D9 came back in** | D9 rows 1–18 | — | the reviewer walks the table at the head, one line per row on the PR | A reading | E2.5's own D9 rows: #2 (S1.1's split `.cs` plant, row 4), #14 (S1.1's `Owned.Prefix` plant) |
| 26 | **F30's closure for creds** — a consumer that declared "F30 open" re-runs the guard at `37b9aa5` and records it; the remaining findings reach zero in E2.5 | creds #309 recorded it at `85b5a67` (0 `legacy-name`); E2.5 records the run on its head | `docs.yml` | row 1's line on the PR, with the commit | — | 0 `legacy-name` at `6e08071` (§ 0) |
| 27 | **G2** — the repository guard's test on each distinct release runner before the merge | none: the release jobs already run `ServiceDefaults.Tests` | `release.yml` `cli-binaries` legs: `ubuntu-latest`, `ubuntu-24.04-arm`, `windows-latest`, `windows-11-arm`, `macos-latest` (osx-arm64 and osx-x64) | a `workflow_dispatch` of `release.yml` with `target=cli` on the PR branch (S3.4, run E2.5-R1): each leg's `This_repository_passes_the_guard` passed, quoted per leg with the run URL | The dispatch publishes nothing: `cli-release` runs on a `cli-v*` tag only (`release.yml:537`); `cli-sign` runs with `required: false`, packs unsigned. `mcp-binaries` uses the same runner set and is not dispatched again | **to observe** before the merge; `ubuntu-24.04-arm` and `windows-11-arm` have never run the guard's classifier through `node` |
| 28 | **G3** — in every job that installs the mount's modules, a guard-reading test that cannot load them FAILS, never skips | `src_vs_code/src/test/mountedGuard.ts` (new): the mount path and the load; the flag `CREDS_GUARD_TESTS_REQUIRED=1` on the unit-suite step of the three jobs of row 13 (S2.4) | the three jobs; off CI a person's `npm test` still skips | with the flag set and the mount's `node_modules` moved away by hand, `npm test` FAILS in the three guard-reading files; without the flag it skips; `workflowMount.test.ts` pins that each installing job sets the flag | A local run with the folder moved stands in for a CI job that lost its install | today the files skip in every job (row 13); release extension job: the PR's own `typecheck · test · package` job (E2.5-R2 by dispatch is withdrawn: S3.4, 2026-11-10) |

## 2. What E2.5 changes, by file and line

| File (at `6e08071`) | Change | Story |
|---|---|---|
| `src_service_defaults/tests/Support/Leftovers/LeftoversGuard.cs:45-46`, `:199-205` | a constant `DockerJudgedByNodeGuard = [".github/workflows/docker.yml"]` and the two docker classes skipped for it; manifest ops with a reason | S1.2 |
| `src_service_defaults/tests/Support/Leftovers/LeftoversGuardFiles.cs:22`, `:30-31`, `:72-73` | `.ts` in `HasBlockComments`; the `src_vs_code/src/test/` `.ts` files that are not `*.test.ts` read as `Script`; manifest ops | S1.3 (Q12) |
| `src_service_defaults/tests/Support/Leftovers/LeftoversGuard.cs:60-66` and `LeftoversGuardTests.cs:647-655` | the wrapper as a fifth folding allowance, with its op on the pin (Q2 (B)) | S1.5 |
| `src_service_defaults/tests/Leftovers/LeftoversRepositoryGuardTests.cs` (new) | the template's file at `197cc76`, namespace op only | S1.4 |
| `src_service_defaults/tests/Leftovers/LeftoversGuardCredsTests.cs` (new, creds' own) | the plants of S1.1, the F10 pin of S1.5, the scans-clean check | S1.1, S1.5 |
| `src_service_defaults/tests/Support/Leftovers/template-manifest.json` | entry 53 (`LeftoversRepositoryGuardTests.cs`) and the ops of S1.2, S1.3, S1.5 | S1 |
| `src_service_defaults/tests/Leftovers/TheAdaptedCopyTests.cs:27`, `:80`, `:37-47` | `TemplateEntries` 52 → 53, its message, and the `NotContain` line that says the repository guard test is E2.5's (it becomes the opposite: the entry is there); `LeftoversGuardCredsTests.cs` on `CredsOwn` | S1 |
| `.gitattributes`; `.github/workflows/sonarcloud.yml:128` | one `-text` line and one `sonar.exclusions` entry for the copied file | S1.4 |
| `install.sh:63`, `:76`; `deploy/restore.sh:102`; `deploy/restore-archive.sh:61`; `src_vs_code/src/test/commandParse.test.ts:40` | one marker line above each (§ 6) | S2.1 |
| `src_cli/tests/AgentRelayTests.cs:38`, `:39`, `:278` | one marker line above each (Q3) | S2.2 |
| `.github/workflows/ci-server.yml:375` | `work="$RUNNER_TEMP/nginx-config-test"; mkdir -p "$work"` (Q4) | S2.2 |
| `src_service_defaults/tests/Leftovers/ClientSitesScanTests.cs:9-11`, `:32-44`, `:94` | `Expected` becomes empty; the summary and the reason say "no unmarked temp site" | S2.3 |
| `src_vs_code/src/test/mountedGuard.ts` (new) | ONE mount-path constant (`.claude/rules/shared` today) and the guard's load: skip off CI, FAIL under `CREDS_GUARD_TESTS_REQUIRED=1` (G3, F6) | S2.4 |
| `src_vs_code/src/test/dockerSmokeLeftovers.test.ts:646-674`; `acmeRunLeftovers.test.ts:288`, `:657-676` | the guard path and the janitor fixture path from `mountedGuard.ts`; the skip through its rule (F6) | S2.4 |
| `.github/workflows/ci-extension.yml:52-53`, `:74-75`; `sonarcloud.yml:163-169`; `release.yml:856-872` | `npm ci --ignore-scripts --prefix <mount>` before the unit suite, and `CREDS_GUARD_TESTS_REQUIRED: "1"` on the step that runs it (Q7, G3) | S2.4 |
| `src_vs_code/src/test/workflowMount.test.ts:21`, new rules | the install-and-flag rule over the jobs that run the WHOLE unit suite, and a second rule for a job that names a guard-reading file (F5) | S2.4 |
| `.github/workflows/docs.yml` after `:61` | `setup-node` 22, the mount's `npm ci`, the guard step, the empty-repository step (§ 5) | S2.5 |
| `src_vs_code/src/test/leftoversGuardFixtures.test.ts` (new) | the F30 plants, each with its detail text and a marker above it (F1, F3) | S2.6 |
| `.github/scripts/mcp-listen-smoke.sh:46`; `.github/scripts/version-smoke.sh:73` | the given-root leaf renamed: `listen-smoke-log-$$`, `version-smoke-log-$$` (Q5 (C)) | S2.8 |
| `research/module_tests.md` before `:125` | the section *Test leftovers* (§ 7) | S3.2 |
| `research/architecture.md:374` | `docs · plans  plan-lifecycle.mjs + pin-check.mjs + leftovers-check.mjs (--profile node) from the shared submodule` | S3.2 |
| `CLAUDE.md:36-74` (or `.agents/PROJECT.md`, Q1) | two lines: the janitor; the two guards and how to run each | S3.2 |
| `todo/PLAN_test_leftovers_E2.md` | the E2.5 build record; notes N22–N24 (§ 9); the status line `E2 shipped, <date>; promotes with its parent` | S3.3 |
| `todo/README.md:38` | the same status | S3.3 |

Not changed: the copied helper's ownership, liveness and deletion code; the Node reference; the mount; the smoke scripts'
given-root behaviour (S2.8 changes only the leaf's name).

## 3. The invocation inventory (§ *Epoch 3* item 4)

E2.5 drops no prefix and makes no test resource of its own. The first table lists every place that runs a guard or a test
that reads a guard, at `6e08071`.

| Invocation (`file:line`) | What it runs after E2.5 | Mount, its modules, Node | Required check |
|---|---|---|---|
| `docs.yml` `lifecycle` (ubuntu), after `:61` | the Node guard; the empty-repository step | mount `:35-36`; modules and Node 22: new | yes (`plan lifecycle · submodule pin`) |
| `ci-clients.yml` `build-test` (ubuntu, macOS, Windows), `:177-178`; macOS also `:165-167` | `LeftoversRepositoryGuardTests`, `LeftoversGuardCredsTests` (in `ServiceDefaults.Tests`) | mount `:74-75`; Node 22 `:76-80`; the classifier needs no `yaml` (`sweeper-scan.mjs` imports none) | ubuntu and macOS yes; **Windows no** (Q10) |
| `sonarcloud.yml` `sonar`, `:157` (C#), `:163-184` (the unit suite under c8) | both | mount `:35-36`; Node 22; modules and flag: new (Q7, G3) | yes (`SonarCloud Scan`) |
| `release.yml` `cli-binaries` `:393`, `mcp-binaries` `:666` (a tag, or a dispatch with `target=cli`/`mcp`; runners `ubuntu-latest`, `ubuntu-24.04-arm`, `windows-latest`, `windows-11-arm`, `macos-latest` ×2) | `ServiceDefaults.Tests`, so the repository guard | mount `:364`, `:642`; Node 22 | a release job; observed by E2.5-R1 (row 27) |
| `release.yml` extension job `:856-872` (a tag, or a dispatch with `target=extension`) | `npm test` | mount `:860`; modules and flag: new (Q7, G3) | a release job; observed by E2.5-R2 (row 28) |
| `ci-extension.yml` `typecheck · test · package` `:74-75` | `npm test`: `dockerSmokeLeftovers`, `acmeRunLeftovers`, `leftoversGuardFixtures` read the guard | mount `:42-44`; Node 22; modules and flag: new | yes |
| `ci-extension.yml` `runner lifecycle · windows` `:193-221` | `node --test` with SEVEN named files (`leftoversWrapper`, `leftoversRunner`, `-Gate`, `-Hardening`, `-Audit`, `-Sweep`, `itestRunner`); none reads the guard | mount `:204-206`; no install (F5: the rule names this job out by what it runs) | no |
| a person | `node <mount>/tools/leftovers-check.mjs …` after `npm ci --ignore-scripts --prefix <mount>`; `./src_service_defaults/tests/bin/Debug/net10.0/CredsForDevs.ServiceDefaults.Tests --filter-class "*LeftoversRepositoryGuardTests"`; `npm test` (guard tests skip without the modules, off CI) | the person's mount | — |

The temp and leaf sites E2.5 changes, in the parent's columns (F17):

| Invocation (the command or job, `file:line`) | The temp root it actually gets | Who provides the owner, the cleanup and the sweep | What must exist first |
|---|---|---|---|
| `ci-server.yml` job `deployment` (`compose · scripts`), step *nginx itself accepts the config the entrypoint renders* (`:367-400`); no other invocation (an inline step; no person runs it) | today `mktemp -d` → the hosted runner's `/tmp`; after Q4 (A) `$RUNNER_TEMP/nginx-config-test` | the step's `trap 'rm -rf "$work"' EXIT` (`:376`) removes it; the runner empties `RUNNER_TEMP` at the start and the end of every job (the detail's § 7: job-scoped, no finding); no sweep is needed | `RUNNER_TEMP` (always set under Actions) |
| `mcp-listen-smoke.sh` with a root: `ci-clients.yml:93` (its self-test, root `$work`), `:144`, `:260` (root `RUNNER_TEMP`); `release.yml:705` | the caller's root; the leaf `listen-smoke-log-$$` after S2.8 | the caller (its root, its job); the leaf is left for the caller to read, as today | the given root |
| `version-smoke.sh` with a root: `ci-clients.yml:110` (its self-test), `:258-259`; `release.yml:430`, `:712` | the caller's root; the leaf `version-smoke-log-$$` after S2.8 | the same | the given root |
| either smoke script without a root (a person) | `owned_dir` under `${TMPDIR:-/tmp}` (E2.4, unchanged) | `owned.sh`: claim, trap, removal; the next sweep or the janitor after a kill | none on Linux and macOS; Node and the mount under Git Bash |

## 4. The stories

**One pull request**, S1 → S2 → S3 as an ordered commit series, each RED then GREEN (D8, as E2.3 and E2.4). One plan
gate on this brief (said `proceed`), one code gate, one Opus review per story's commit range. The repository test of
S1.4 is committed RED in S1 and goes green in S2.

### 4.1 E2.5.S1 — the C# guard's creds discovery and its tests (Opus · Sonnet · Opus; owns sc. 2, 3, 5)

Every op on a copied file is a manifest op with a `reason` (revision row 3, the parent's § *Epoch 4* item 4); the diff
check of `TheAdaptedCopyTests` stays green. No op touches ownership, liveness or deletion code.

- **S1.1 — `LeftoversGuardCredsTests.cs` (RED first).** Creds' own file in `src_service_defaults/tests/Leftovers/`, on
  `CredsOwn`. Each case writes its tree into an `OwnedScope` folder (as `LeftoversGuardTests` does), runs
  `LeftoversGuard.Scan(root, RepositoryRoot.Path)` and asserts the exact list of `file:line:class`.
  **This file is scanned by the copied guard like any other `.cs` of the tests (F2).** The folded reading applies to it
  (it is not one of the `FoldingAllowances`, and it must not become one: a sixth entry would be a change), and
  `owner-blind` takes no exemption. So:
  - every plant that holds the prefix word is BUILT, never written: from `LeftoversGuard.CamelWord` and
    `LeftoversGuard.Word` (both `internal`, same assembly) and local variables, as `LeftoversGuardTests.cs:14-16` builds
    `P`, `Lower` and `Marker`; no literal in the file holds the word, a piece of it, or the exempt marker;
  - every `raw-temp` plant line (`fs.mkdtempSync(` in a `.cjs` and a `.ts`, `Path.GetTempPath()` in a `.cs`) has a
    marker comment above it, as `ClientSitesScanTests.cs:123-129` does (`// testsToDelete-exempt: raw-temp — a planted
    …: the scan must find it in the scratch copy`);
  - every docker plant is split with `+` inside the docker words (`"docker com" + "pose -p cred-vault-acme-test up -d"`),
    because the docker classes read the raw line only;
  - a last case copies THIS file's own text into a scratch root at its own relative path and asserts `Scan` finds
    nothing (the shape of the copied `No_file_is_excluded_and_the_guards_own_tests_are_scanned_clean`).

  Cases (expected after S1; observed today in § 0): `src_vs_code/scripts/x.cjs` `fs.mkdtempSync(` → 1 `raw-temp`;
  `src_vs_code/src/test/xWorld.ts` the same → 1 `raw-temp` (**RED today: `FilesScanned` 0**); `src_vs_code/src/test/x.test.ts`
  → not discovered (that is the Node guard's); `src_cli/tests/X.cs` `Path.GetTempPath()` → 1 `raw-temp`; a split prefix
  word in a `.cs` → 1 `owner-blind` (row 4); `Owned.Prefix` in `src_mcp/tests/X.cs` → 1 `owner-blind` (D9 #14);
  `deploy/acme-test/run.sh` with `-p cred-vault-acme-test` → 1 `docker-name`, with `-p "$PROJECT"` → 0, with a literal
  owner-form project → 0; the real `docker.yml` copied in → 0 docker findings (**RED today: 2 `docker-run`**), and the
  same text as `.github/workflows/other.yml` → 2 `docker-run`; each exemptible case again with a valid marker (built from
  `CamelWord`) above the line → 0. By hand once, recorded: `LeftoversGuardLiterals.Fold` replaced by a whole-literal read
  → the split `.cs` case goes red (the stories' § *Test plan* row for split spellings).
- **S1.2 — the `docker.yml` exclusion.** A constant beside `ExcludedFiles` (`LeftoversGuard.cs:45`) with exactly one
  entry; `HitsOutsideSource` (`:199-205`) skips `docker-run` and `docker-name` for it, and nothing else (`raw-temp` and the
  others still read the file). A test pins the list and that the file exists. The comment says why: the §5 carve-out
  is read by the shipped Node guard, which is green on the file (row 1). GREEN: S1.1's two `docker.yml` cases.
- **S1.3 — the `.ts` helpers (D7; Q12).** `LeftoversGuardFiles.cs`: a `.ts` file under `src_vs_code/src/test/` whose name
  does not end in `.test.ts` is a `Script`; `.ts` joins `HasBlockComments` (`:22`). GREEN: S1.1's `xWorld.ts` case; the
  copied `Discovery_reads_the_tests_the_source_the_workflows_and_every_script` (`LeftoversGuardTests.cs:275`) stays green.
  Measured: the 55 real helpers add no finding. The new `mountedGuard.ts` of S2.4 is one of these helpers and holds no
  temp site.
- **S1.4 — `LeftoversRepositoryGuardTests.cs`.** The template's file at `197cc76` (one `[Fact]`,
  `This_repository_passes_the_guard`: `FilesScanned > 0` and no finding, the message `report.Describe(root)`), manifest
  entry 53 with the namespace op only; `TemplateEntries` from 52 to 53 (`TheAdaptedCopyTests.cs:27`), the message at `:80` and the `NotContain` line below it; a
  `-text` line in `.gitattributes`; the path in `sonar.exclusions`. **RED in this story**: the test fails on the branch
  with the 10 findings of § 0 minus S1.2's two, quoted in the commit. GREEN after S2.1–S2.2.
- **S1.5 — the wrapper's folding allowance (Q2 (B)) and its pin (F10).** The fifth entry
  `src_vs_code/scripts/lib/leftovers.cjs` in `FoldingAllowances`, with its op on the pin of
  `LeftoversGuardTests.cs:647-655`, and a comment: no effect at the pin, because the copy folds `.cs` only (`IsFolded`).
  A case in `LeftoversGuardCredsTests` pins that it has no effect: the same split-prefix plant (built from `CamelWord`)
  at `src_vs_code/scripts/lib/leftovers.cjs` and at `src_vs_code/scripts/lib/other.cjs` → the SAME result, 0 findings
  each, at the pin. A future template that folds JavaScript makes `other.cjs` a finding and turns this case red, so the
  allowance's effect becomes visible then.
- **Check:** `./src_service_defaults/tests/bin/Release/net10.0/CredsForDevs.ServiceDefaults.Tests --filter-namespace
  "CredsForDevs.Tests.Leftovers"` on Linux; the three CI legs.

### 4.2 E2.5.S2 — the exemptions, the guards in CI, the tokens, the break-its (Opus · Sonnet · Opus; owns sc. 1, 3, 4, 6)

- **S2.1 — the five Node findings (§ 6).** One marker line above each. RED: the Node guard on the branch before the
  commit, 5 findings, exit 1 (§ 0). GREEN: `clean (<n> files).`, exit 0; the C# guard loses the four product lines too.
- **S2.2 — the C#-only findings (Q3 (A), Q4 (A)).** Three markers in `AgentRelayTests.cs` and the `RUNNER_TEMP` line in
  `ci-server.yml:375`. GREEN: S1.4's test is green (measured on a scratch copy: 2 left before S1.2, 0 after).
- **S2.3 — `ClientSitesScanTests`.** Its `Expected` (`:38-43`) becomes empty, its summary (`:9-11`) and reason (`:94`)
  say "no unmarked temp site". RED (measured on the scratch copy, the exact text): `Expected Named(RawTempFindings(Scratch(sources)))
  to be equal to {… three AgentRelayTests lines …} because every temp site is a helper call or carries a marker; the three
  literals that create nothing stay for E2.5's guard, but found empty collection.`
- **S2.4 — the guard-reading tests run in CI, and fail there when they cannot (Q7, G3, F5, F6).**
  1. `src_vs_code/src/test/mountedGuard.ts` (new): ONE constant for the mount path (`.claude/rules/shared` today), the
     guard's path built from it, and one load function. When the guard or its `yaml` cannot load, it returns the reason;
     the caller skips with that reason, EXCEPT when `CREDS_GUARD_TESTS_REQUIRED=1`, where it fails with the same reason.
  2. `dockerSmokeLeftovers.test.ts` (`:646-674`) and `acmeRunLeftovers.test.ts` (`:657-676`, and the janitor fixture
     path at `:288`) take the path and the rule from it, so #328's rename is one constant (these two files are not in
     #328's diff: they came with #329 after its base) and a missed rename is a failure in CI, never a silent skip.
     `leftoversGuardFixtures.test.ts` (S2.6) uses it too.
  3. `npm ci --ignore-scripts --prefix <mount>` before the unit suite, and `CREDS_GUARD_TESTS_REQUIRED: "1"` in the `env:`
     of the step that runs it, in `ci-extension.yml` (install after `:44`, flag on `:74-75`), `sonarcloud.yml` (install
     before `:169`, flag on the step at `:163`) and the `release.yml` extension job (install before `:872`, flag on
     `:872`).
  4. `workflowMount.test.ts`: (a) a job that runs the WHOLE unit suite (`npm test`, `scripts/run-tests.mjs`, or
     `node --test` over the `out/test/*.test.js` glob) installs the mount's modules before that step and sets the flag on
     it; (b) a job whose `node --test` NAMES a file that reads the guard (the files that import `mountedGuard`, found by a
     scan of `src/test/`, with a premise that the scan finds the three) does the same. **Decision (F5):** the existing
     matcher `RUNS_UNIT_TESTS` (`:21`) also matches `runner lifecycle · windows` (`ci-extension.yml:221`), which names
     seven files and none that reads the guard; so the new rule uses the narrower reading (a) and (b), and that job needs
     no install. A premise test pins that (a) finds exactly the three jobs and (b) finds none today.
  - RED: the rule names the three jobs today. RED of the flag, by hand once: the mount's `node_modules` moved away,
    `CREDS_GUARD_TESTS_REQUIRED=1 npm test` → the guard-reading tests FAIL with the reason; without the flag they skip.
    GREEN: the CI log of `npm test` in each job shows those tests run.
- **S2.5 — `docs.yml` (§ 5).** RED of the guard step: the step on the commit before S2.1 is red with the five lines (run it
  by hand with the step's exact command; quote it). RED of the empty-repository step: its assertion pointed at the real
  tree fails (the exit is not 2), by hand once.
- **S2.6 — `leftoversGuardFixtures.test.ts` (F1, F3).** Loads the mounted guard through `mountedGuard.ts` (S2.4). Cases,
  each asserting the class, the line AND the detail text: `'testsTo' + 'Delete-agent-x'` in a `.cjs` → `` `testsToDelete-agent` ``;
  `"testsTo""Delete-agent-x"` in a `.sh` → `` `testsToDelete-agent` ``; `"testsTo"+"Delete-agent-x"` in a `.sh` →
  `` `testsTo (a piece of the prefix word)` `` (a `.sh` does not join `+`: this is a PIECE finding); a whole legacy literal
  in a `.cjs` and in a `.sh` → `` `testsToDelete-agent` ``. Each plant path is one the `node` profile discovers. No case
  asserts that a spelling is NOT found (revision row 2). **This file is read by the `docs.yml` guard step** (`*.test.ts`),
  and each plant string is itself a `legacy-name` finding there, so each plant line has a marker above it
  (`// testsToDelete-exempt: legacy-name — a planted spelling: the guard under test must find it in scanText`). RED, by
  hand once (the parent's E2.5-a words), each against a scratch copy of the mount's `tools/` with one reading removed, the
  test pointed at it by a seam: the `+` join off (`leftovers-fold.mjs:430`) → the `.cjs` split case red on its detail
  text (measured: the class stays, the text becomes the piece text); the piece reading off (`pieceHits`, `:784`) → the
  `.sh` `+` case red (measured: no finding); the shell word's touching pieces off (`readShWord`,
  `leftovers-fold-shell.mjs:36-75`) → the `.sh` touching case red (to observe at the build); recorded and thrown away.
- **S2.7 — break-it on the real tree (sc. 6, by hand, recorded, reverted).** One raw `fs.mkdtempSync` in a unit test (Node
  guard red at its line); one in a harness under `src_vs_code/scripts/` (C# guard red); one `Path.GetTempPath()` in a C#
  test (C# red); `continue-on-error` deleted from the remover step of `docker.yml` (Node guard: 2 `docker-run`, the parent's
  E2.4-a counterexample); one token constant changed (§ 0's two `token` findings); the mount de-initialised (Q6: record
  what § 0 measured — the Node step red at the start naming the missing module; the C# guard's `owner-blind` for the
  missing classifier and its `token` finding).
- **S2.8 — the two given-root leaves renamed (Q5 (C); row 3).** `mcp-listen-smoke.sh:46`: `creds-mcp-listen-smoke-$$` →
  `listen-smoke-log-$$`; `version-smoke.sh:73`: `creds-version-smoke-$$` → `version-smoke-log-$$`. The given-root
  behaviour stays: the leaf is made in the caller's root and left there for the caller. RED: `git grep -n -E
  'creds-mcp-listen-smoke-|creds-version-smoke-' -- . ':!todo' ':!research'` → 2 lines. GREEN: → 0; the two smoke
  self-tests (`bash .github/scripts/mcp-listen-smoke.test.sh`, `bash .github/scripts/version-smoke.test.sh`) green here
  and on the three legs of `ci-clients.yml:86-120`; the guards unchanged (neither name holds the prefix).
- **Check:** the guard command of § 5; `npm test` in `src_vs_code`; the executable of S1; the two smoke self-tests.

### 4.3 E2.5.S3 — the order against #328, the rescan, the docs, the records, the hosted evidence (Opus · Sonnet · Opus)

- **S3.0 — the rename, a named step, only if #328 merges first (G1, Q1).** Before E2.5 merges: merge `main` into the
  branch; replace `.claude/rules/shared` with `.agents/conventions` in E2.5's own new and changed lines (the constant of
  `mountedGuard.ts`; the three install lines and the guard steps of `docs.yml`; the strings of the new `workflowMount`
  rules; any manifest op of S1 that names the mount); drop E2.5's own `setup-node` and `npm ci` steps in `docs.yml`
  (#328's step does both); move the two command lines into `.agents/PROJECT.md`. Checks, quoted on the PR: `git grep -n
  '\.claude/rules/shared' -- . ':!todo' ':!research'` → only lines #328 itself keeps, if any, each named; the Node guard
  step green; `node .agents/conventions/tools/rules.mjs check --repo .` green; `npm test` with every guard-reading test
  RUN (the G3 flag makes a missed path a failure); `TheAdaptedCopyTests` and S1's executable green. **If E2.5 merges
  first, #328 carries this rename** when it merges `main`, over the same list, with the same checks. Either way #328 must
  also rename the eleven files at `6e08071` that hold the mount path and are not in its diff (they came after its base):
  `.github/scripts/lib/owned.sh`, `.github/scripts/lib/owned.test.lib.sh`, `.github/scripts/mcp-listen-smoke.sh`,
  `.github/scripts/mcp-listen-smoke.test.sh`, `.github/scripts/start-server-and-wait.sh`, `.github/scripts/version-smoke.sh`,
  `.github/scripts/version-smoke.test.sh`, `deploy/acme-test/run.sh`, `deploy/nginx/entrypoint.test.sh`,
  `src_vs_code/src/test/acmeRunLeftovers.test.ts`, `src_vs_code/src/test/dockerSmokeLeftovers.test.ts` (measured by
  comparing `git grep -l` at `6e08071` with #328's file list).
- **S3.1 — the barrier rescan** on the PR head: `node <mount>/tools/sweeper-scan.mjs --root .`, the line quoted on the PR
  (row 6). A sweeper that appeared is a stop.
- **S3.2 — the docs.** `module_tests.md` § *Test leftovers* (§ 7); `architecture.md:374`; the two command lines (Q1):
  `JANITOR_MIN_AGE_MINUTES=10 bash <mount>/tools/janitor.sh --token creds --dry-run` (the form `deploy/acme-test/run.sh:119`
  already uses; from Git for Windows' bash on Windows, where it removes nothing until F9; bash 4 or newer on macOS, N20; see
  § 11) and the two guards as § 5 and § 3 run them.
- **S3.3 — the records.** The E2.5 build record in the stories document; the merge conditions (a)–(d) of D8 collected
  from #294, #310, #311, #329 and this PR into one list; notes N22–N24 (§ 9) in *Notes for the parent*; the stories'
  status line and `todo/README.md:38` `E2 shipped, <date>; promotes with its parent` (never *implemented* while in
  `todo/`). The parent's E2 entry gets the same sentence in a conventions PR (the coordinator's). After the merge the
  parent's row F runs: `mcp__coai__review_feature` over E2's stories from creds, `baseRef` `a52fde1`.
- **S3.4 — the hosted evidence before the merge (G2, G3; rows 27, 28).** After the branch is pushed, the coordinator runs
  one plain command per run, the next only when the previous has ended:
  - **E2.5-R1:** `gh workflow run release.yml --ref feat/test-leftovers-e2.5 -f target=cli`. It runs `cli-binaries` on
    the six legs and `cli-sign` with `required: false`; `cli-release` is tag-only (`release.yml:537`), so nothing is
    published. Quote for each leg the line of `This_repository_passes_the_guard` (passed) and the run URL.
  - **E2.5-R2:** ~~`gh workflow run release.yml --ref feat/test-leftovers-e2.5 -f target=extension`~~ (**not a command to run** — see the correction below; the evidence for the `extension` job is the PR's `typecheck · test · package` job and the test step of run 42792112748, already recorded). ~~Its publish steps are
    tag-only (`:888`, `:923`, `:937`).~~ **[2026-11-10, corrected after run 42792112748: this dispatch PUBLISHES when the manifest version is new. The job `extension` runs on `target == 'extension'` and its Marketplace publish step has no tag guard (only the tag-match step and the two release steps do). The run was refused by the Marketplace (`v1.18.0 already exists`) and made no release. The safe evidence for that job is the PR's own `typecheck · test · package` job. Never dispatch `target=extension` for evidence.]** Quote that `dockerSmokeLeftovers`, `acmeRunLeftovers` and `leftoversGuardFixtures`
    ran (no skip line) under the flag.
  - If a dispatch is refused (an environment rule, or the auto-mode classifier), a throwaway workflow on a never-merged
    branch runs the same `ServiceDefaults.Tests` and `npm test` steps on the same runners, as E2.4 did with
    `tmp/e24-smoke-red`; it is deleted after.
- **Check:** `node <mount>/tools/plan-lifecycle.mjs`; `node .github/scripts/public-hygiene.mjs`.

## 5. The CI steps

**`docs.yml` `lifecycle` (ubuntu-latest, the required check `plan lifecycle · submodule pin`), after *Public hygiene*
(`:60-61`):**

```yaml
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 22.x
      # The shipped guard reads workflows through `yaml`, which lives in the mount's own lock file.
      # --ignore-scripts: SonarCloud githubactions:S6505.
      - name: The leftovers guard's dependencies
        run: npm ci --ignore-scripts --prefix .claude/rules/shared
      # <the sentence of § 8, as a comment: zero for the guard's listed spellings, table D2 of
      #  dew_flow_conventions todo/PLAN_F30_folding_reader.md at the pin; what the node profile does not read>
      - name: Test leftovers guard (shipped, node profile)
        run: node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"
      # A scan of nothing must be red, never clean [E2.1 plan gate 2]: an empty repository in an owned folder.
      # owned.sh reads TMPDIR, never RUNNER_TEMP, so the root is handed over as the E2.4 steps do.
      - name: The leftovers guard refuses a scan of nothing
        shell: bash
        run: |
          export TMPDIR="$RUNNER_TEMP"
          source .github/scripts/lib/owned.sh || exit 1
          owned_dir scratch guard-empty || exit 1
          git init -q "$scratch/repo"
          if node .claude/rules/shared/tools/leftovers-check.mjs --repo "$scratch/repo" --profile node --token creds \
              --identity "the developer-credentials server and extension" 2> "$scratch/stderr"; then code=0; else code=$?; fi
          [ "$code" = 2 ] || { echo "expected exit 2 for a scan of nothing, got $code"; exit 1; }
          grep -F "scanned nothing under $scratch/repo — discovery broke; the repository is not clean" "$scratch/stderr" \
            || { echo "the sentence is missing:"; cat "$scratch/stderr"; exit 1; }
```

Notes for the coder. `owned.sh` takes its root from `TMPDIR` only (`.github/scripts/lib/owned.sh:293`), so the step sets
`TMPDIR="$RUNNER_TEMP"` first (F4), the shape of `ci-clients.yml:93` and `ci-server.yml:176`; it needs no Node on Linux.
The exit code is read through `if … then … else code=$?`, not through a command substitution (entry 8.1: `bash -e` does
not stop on a failed substitution inside another command). The stderr file is inside the owned folder, beside the
repository, never in it. After #328 (S3.0) the paths read `.agents/conventions`, and #328's own step already installs the
mount's modules and Node 22, so the first two steps above are not added again. The step's ShellCheck runs through
actionlint (`workflows · actionlint`).

**The C# guard** has no step of its own: it is a test of `ServiceDefaults.Tests`, run where § 3 lists. **The unit-suite
jobs** get the install line and the flag of S2.4.

## 6. The exemptions

The grammar is the mounted detail's § 7: `testsToDelete-exempt: <class> — <reason>` on the line or the line above; a class
of the table (never `owner-blind`, never `ryuk-off`); a reason of at least ten characters and three words, not a
placeholder. Both guards read the same marker (measured on `install.sh`). Each line below goes ABOVE the finding's line,
so the finding's own text is not touched:

| Line | Class | Marker text (after `testsToDelete-exempt: <class> — `) |
|---|---|---|
| `install.sh:63` | `raw-temp` | a product script a person runs to install creds, not a test: its temp file is the installer's own |
| `install.sh:76` | `raw-temp` | a product script a person runs to install creds, not a test: its temp folder is the installer's own |
| `deploy/restore.sh:102` | `raw-temp` | a product script an operator runs on the server, not a test: its staging folder is the restore's own |
| `deploy/restore-archive.sh:61` | `raw-temp` | a product script an operator runs on the server, not a test: its scratch folder is the restore's own |
| `src_vs_code/src/test/commandParse.test.ts:40` | `docker-name` | a parser fixture string: no image or container is built here |
| `src_cli/tests/AgentRelayTests.cs:38`, `:39`, `:278` (Q3) | `raw-temp` | a path nothing creates: the product's default socket path is only compared as a string (`:278`: the refused path is only set, never made) |
| each plant line of `leftoversGuardFixtures.test.ts` (S2.6, F3) | `legacy-name` | a planted spelling: the guard under test must find it in scanText |
| each `raw-temp` plant line of `LeftoversGuardCredsTests.cs` (S1.1, F2) | `raw-temp` | a planted …: the scan must find it in the scratch copy (the words of `ClientSitesScanTests.cs:123-129`) |

`#` comments in the shell files, `//` in `.ts` and `.cs`. The reasons say only what is true: they do not say the product
removes its scratch on every path, because two of them do not (§ 9, side findings).

**D7's list, against the measurement.** Already in the tree (E2.1, E2.3): `Owned.cs:119`, `OwnedCreds.cs:17`,
`leftovers.cjs:46`. No finding, so no marker: `owned.sh`'s root (`:293`, N6) and the `docker compose` calls of
`restore-archive-itest.sh` (the shim). Not in D7's list but found: `AgentRelayTests.cs` ×3 (E2.3 left them "for E2.5's
guard") and `ci-server.yml:375` (#326, after the plan): Q3, Q4. **The count** (`git grep -n testsToDelete-exempt -- .
':!todo' ':!research'`): 20 today; after E2.5, 28 on the tree's own lines (+5 of S2.1, +3 of Q3), plus one above each plant
line of the two new test files (5 in `leftoversGuardFixtures.test.ts`; 3 or 4 in `LeftoversGuardCredsTests.cs`, by the
plants the coder writes). The PR quotes the final count and lists the new lines.

## 7. `module_tests.md` § *Test leftovers* — the content plan

A new section before `## What the unit suite leaves behind` (`:125`), after the harness catalogue (the stories said
"after `:146`", the same place in the older file). It is the map; each story's own paragraph stays where E2.1–E2.4 put it
(parent entry 8.1's note). Its parts, each a few lines or one table:

1. **The rule and the name.** The contract (`<mount>/common/test-leftovers.md` and its detail), the token `creds`,
   `testsToDelete-<owner>-creds-<what>-<id>`, the claim in `<folder>.owner` beside the folder.
2. **The three helpers** (one table): Node `src_vs_code/scripts/lib/leftovers.cjs` (+ `harnessScope.cjs`), a wrapper over
   the mounted reference; C# `src_service_defaults/tests/Support/Leftovers/`, an adapted copy of `dew_flow_mcp` `197cc76`
   with its manifest, linked into the five executables; bash `.github/scripts/lib/owned.sh` (its root is `TMPDIR`; a CI
   step hands it `RUNNER_TEMP`). Per row: who makes the folder, who sweeps at start (both roots), who audits at the end,
   what it does on Windows. Links to the paragraphs.
3. **Containers:** the `docker.yml` carve-out and acme, one line each with links.
4. **Who collects what a killed run left** (one table, per OS): Linux and macOS — the next `npm test`, `itest:all` or
   xUnit executable, or the janitor; Windows — the C# sweep (both keys), the Node sweep only lists (F16), the janitor is a
   dry run until F9, and what new files of `BUILTIN\Administrators` hold waits for a person (F31, by its true condition).
5. **The two guards** (one table): what each reads (Node: `*.test.*`, `.sh`/`.ps1` everywhere, `.github/scripts/*.{mjs,js,sh}`,
   workflows, `package.json` scripts; C#: `.cs` of the five test and source roots, `.sh`/`.ps1`/`.py` everywhere, JS in the
   script folders, the `src_vs_code/src/test/` helpers, workflows, `owner-blind` in scripts through the mounted classifier);
   where each runs (§ 3, the release runners included); the local commands; § 8's sentence; the `docker.yml` exclusion and
   why; the guard-reading Node tests, `mountedGuard.ts` and the `CREDS_GUARD_TESTS_REQUIRED` flag.
6. **What neither guard reads** (measured, § 0): a split spelling in `src_vs_code/scripts/*.cjs` and
   `src_minimalapi_server/scripts/*.cjs` (Q9); `${TMPDIR…}` in `.sh` (N6); a name built through a variable or across lines;
   compose files; a `/tmp` in a raw string that holds a quote (the template's limit). And the Node guard does not read
   `mktemp` in a workflow `run:` block (the C# copy does).
7. **The exemptions:** the grammar, the command that lists them (`git grep -n testsToDelete-exempt`), and the rule that a
   new one is read by a reviewer. No copy of the list (it would drift).
8. **The janitor:** the command of S3.2, `--token creds`, `--dry-run`, Windows, bash 4 (N20).
9. **Old names:** not swept; removed by hand once per machine; the records are in the E2 PRs.
10. **What stays open, said once:** `kill -9` runs no trap; F16, F9, F31, N6, N20, N21.

## 8. F30 — revision row 6, and the sentence

F30 shipped in conventions release `37b9aa5` and this repository pins it (#306). Revision row 6 is met: the step's comment
says "zero for the guard's listed spellings". The old sentence of the stories (`:76`) must not be copied (its own note at
`:77`). The sentence for the `docs.yml` comment, § 7 and the PR, written from D2 and D4 at the pin (F11):

> The shipped Node guard (conventions `37b9aa5`) reads one line's spellings, as table D2 of conventions
> `todo/PLAN_F30_folding_reader.md` lists them by file kind. In `.mjs .cjs .js .ts .tsx .jsx .mts .cts` it removes `//`
> and `/* */` comments, reads `'…'`, `"…"` and a template whose holes hold only a quoted literal, joins `+`,
> `.concat('a', 'b')` and `['a', 'b'].join(<literal>)` (spaces around the operator; a literal in its own parentheses), and
> decodes `\uXXXX`, `\u{…}`, `\xXX` and a one-character class `[T]`. In `.sh`, and in every `.yml` or `.yaml` file (read
> as `.sh`), it joins a word's touching pieces, quoted or not, and decodes `\xXX`, `\uXXXX` and octal inside `$'…'`. In
> `.ps1` it joins `+` and a binary `-join` over a literal array. A literal that holds the whole word with no owner form
> after it (the bare word), or a piece of six or more characters that crosses the word's middle in the word's own form,
> is `legacy-name`; a pattern after the bare word is `owner-blind`, unless the legacy reading reads that same
> occurrence. It does not join a template nested in a hole, a literal in an expression hole, a unary `-join` or a comment
> between operands (each literal is still read alone, so only a split into three or more pieces is missed). It does not
> read an unquoted `.sh` or yaml word with no quote in it, an extensionless script, any other file kind, or a name built
> through a variable, across lines or at run time. Some text it does not tell from code, and there the joins up to the
> next closer are silently not read (a whole name or a piece in that text is still a finding): a `.ps1` here-string or a
> `.sh` heredoc line, a nested `"$(…)"`, a regex at a position D2 does not name (after `)`, `else`, `+`, `%`, `throw`,
> `await` or `...`), and JSX text. So this repository's zero for `legacy-name` and `owner-blind` is zero for the guard's
> listed spellings, in the files its `node` profile reads; the `.cs` files, the harness folders and the test helpers are
> the C# guard's, which folds `.cs` only.

## 9. What is NOT in E2.5

- The product scripts' own temp handling. **Side findings, todos, not built:** `install.sh:63` keeps its temp file when
  `fetch` fails (`die` exits before `:66`'s `rm -f`); `deploy/restore.sh:102` keeps its staging folder when a step between
  `:103` and `:117` fails (its EXIT trap is `rollback`, which does not remove it). `restore-archive.sh:61` is clean (its
  `rollback` calls `cleanup`).
- I16, the ShellCheck of the two smoke scripts and their tests in CI: a todo.
- **Side finding, a todo, not built (2026-11-10; `release.yml` is outside E2.5):** a manual dispatch of `release.yml` with `target=extension`, from any branch, publishes to the Marketplace with no tag check when the manifest version is new (its publish step has no `if:`; run 42792112748 reached it).
- N20 (the janitor and bash 3.2), N21 (the flaky Windows dry run): conventions follow-ups.
- The template's raw-string reading (`CallerIdentityTests.cs:196`, E2.3 part 3b): a note for E3 (N24), not an op here.
- A `raw-temp` reading of `${TMPDIR…}` (N6), a `mktemp` reading in workflows for the Node guard (N23), the split spellings
  in the harness folders (N22, Q9): the conventions repository's or the template's.
- F16, F9, F31; the branch protection of the Windows clients leg (Q10).
- The rename of the eleven E2.4 files that #328 does not know (S3.0): #328's, in any order.
- The feature review of E2 (the parent's row F): after the merge.
- New notes for the stories' *Notes for the parent*, written by S3.3: **N22** — a split legacy spelling in
  `src_vs_code/scripts/*.cjs` or `src_minimalapi_server/scripts/*.cjs` is read by neither guard (the `node` profile does
  not discover those folders; the C# copy folds `.cs` only; measured). **N23** — the shipped Node guard reads `mktemp` in
  `.sh` only (`leftovers-check.mjs:376`), so a workflow `run:` block with `mktemp` is no finding; the C# template reads it
  (`ci-server.yml:375`, measured). **N24** — the template's raw-string limit, carried from E2.3.

## 10. Open questions, each with options and a recommendation

Each went to the coordinator before the plan gate. **Epoch 8 has used entry 8.1: an answer marked CHANGE would be entry
8.2 and the eighth full stop.** "In doubt, it is a change" (`common/plan-change-control.md`), so the coordinator decided
each "reads as no change" below.

- **Q1 — the order against creds #328, and where the two command lines go.** #328 (draft) renames `<mount>` to
  `.agents/conventions`, cuts `CLAUDE.md` to an adapter and moves its text into `.agents/PROJECT.md`, adds Node 22 and the
  mount's `npm ci` to `docs.yml`, and edits `LeftoversGuardFiles.cs`, `LeftoversGuardScripts.cs`, `LeftoversGuardTokens.cs`
  and `template-manifest.json` — files S1 also changes. It is based on `9916836`, before #329, so it must merge `main`
  anyway. **The exact overlaps (F7):** (1) `template-manifest.json`, the entry of `LeftoversGuardTests.cs`: #328 adds its
  mount-path ops there, and S1.5 adds the op on the `FoldingAllowances` pin (`:647-655`) to the same entry; (2) the entry
  and the file `LeftoversGuardFiles.cs`: #328 adds `.agents` to `NeverEntered` (`:28`), and S1.3 adds the `.ts` ops;
  (3) `workflowMount.test.ts`: #328 rewrites its mount strings, and S2.4 adds the install-and-flag rules; (4) `docs.yml`:
  #328 adds Node 22, the mount's `npm ci` and `rules.mjs check`, and S2.5 adds the guard steps; (5) `CLAUDE.md`: #328 cuts
  it, and S3.2 adds two lines. Not in #328's diff, and on `main` with the mount path: `dockerSmokeLeftovers.test.ts` and
  `acmeRunLeftovers.test.ts` (S2.4 routes them through one constant) and nine more E2.4 files (S3.0).
  (A) #328 first: E2.5 runs S3.0 before its own merge. (B) E2.5 first: #328 carries S3.0's rename. (C) build both now,
  and the second to merge renames. *Recommended:* (C), with the order made explicit as S3.0 (G1), and the two lines in the
  file that holds the project's *Commands* at merge time. Reads as no change: the stories name `CLAUDE.md` because it held
  the commands; #328 moves the same text by its own approved plan.
- **Q2 — the wrapper's folding allowance (E2.5.S1's list, D7).** Measured: `leftovers.cjs` spells the word nowhere but
  its exempt marker, and the copy folds `.cs` only (`IsFolded`, `LeftoversGuard.cs`), so the allowance changes no
  answer. (A) not built, said on the PR and in N22's note: in doubt **CHANGE** (an item of a story dropped). (B) built as
  written, a fifth entry with its op on the pin (`LeftoversGuardTests.cs:647-655`) and a comment that it has no effect at
  the pin: no change; with a case that pins the "no effect" (S1.5, F10). *Recommended:* (B).
- **Q3 — `AgentRelayTests.cs:38`, `:39`, `:278`** (C#-only `raw-temp`: `/tmp` literals that create nothing; E2.3 left
  them "for E2.5's guard"). (A) a marker above each (§ 6) and `ClientSitesScanTests` emptied (S2.3). (B) rewrite the
  asserts so no `/tmp` literal is in the test: it hides the product's real default from the reader. *Recommended:* (A).
  Reads as no change: D7 names "the expected ones", E2.3's record assigns these three to E2.5, and sc. 1 needs zero.
- **Q4 — `ci-server.yml:375`, `work="$(mktemp -d)"` in the nginx config step** (C#-only; came with #326 after the plan).
  (A) `work="$RUNNER_TEMP/nginx-config-test"; mkdir -p "$work"` (job-scoped by the detail's § 7, no finding in either
  guard, the trap stays). (B) a marker. (C) `owned_dir`. *Recommended:* (A). Reads as no change by E2.4's precedent for
  `entrypoint.test.sh` (its part 2d: a site of the planned kind that arrived after the inventory). Its inventory row: § 3.
- **Q5 — row E2.5-b's check.** The parent's check is "`git grep` for the old leaf names → 0". Measured: 2
  (`mcp-listen-smoke.sh:46`, `version-smoke.sh:73`), both in the GIVEN-root branch that E2.4's approved brief (§ 3.1
  item 2) keeps; E2.4's part 2 (difference 2) recorded it. Nothing else in the repository uses the two names (§ 0).
  (A) restate the check (no leaf under the machine's temp root; the two names only in their given-root branch): a
  different check text. (B) remove the given-root branch: **CHANGE** (E2.4's kept design). (C) rename the two leaves
  (S2.8), the given-root behaviour unchanged, so the check holds as written. *Recommended:* (C) (revised 2026-11-10 with
  the coordinator; was (A)). Not a change: the check is the parent's, word for word, and the behaviour E2.4 kept stays.
- **Q6 — sc. 6's last break-it.** The stories expect "`.claude/rules/shared` de-initialised — the shipped guard's `token`
  finding naming the mount". Measured (§ 0): the shipped guard lives in the mount and cannot start (exit 1, the missing
  module), so the `docs.yml` step is red at the start, naming the missing file, not with a `token` finding; run from a
  copy outside the mount, it gives the same 5 findings and no `token` finding (the copy carries its own rule). The C#
  half holds as the stories expect: one `owner-blind` for the missing classifier
  (`.github/scripts/branch-protection.mjs:1 — owner-blind — the shipped classifier could not judge the scripts — node
  exited 1…`) and one `token` finding from `RegisteredTokenFindings`, beside the 10 of the tree. *Recommended:* record
  what happens; reads as no change (the outcome "red, naming the cause" holds).
- **Q7 — which jobs install the mount's modules.** (A) all three that run the unit suite (`ci-extension.yml`,
  `sonarcloud.yml`, the `release.yml` extension job), with the `workflowMount` rule and the G3 flag; `runner lifecycle ·
  windows` is out by what it runs (F5). (B) only the required `ci-extension.yml` job; the guard tests keep skipping under
  coverage and on a tag. *Recommended:* (A). Not a change (E2.4 brief § 5 gives the install to E2.5).
- **Q8 — sc. 1's RED.** The stories: "the shipped guard's 62 findings … re-run on the branch's base". Measured with the
  pinned guards on `a52fde1`: Node 64, C# 84; on `6e08071`: 5 and 10. *Recommended:* the PR quotes both pairs, the base
  pair as sc. 1's RED and the HEAD pair as the RED of the switch-on. Not a change (a re-measurement at the pin, as epoch
  8's rule asks).
- **Q9 — split spellings in the harness folders.** Measured: neither guard reads `'testsTo' + 'Delete-…'` in
  `src_vs_code/scripts/x.cjs`. (A) state it as a limit (§ 7 part 6, the PR, N22). (B) the C# copy folds JavaScript in the
  script folders: an op beyond the permitted kinds and the template's code, **CHANGE**. (C) a wider `node` profile in
  conventions: **CHANGE** (N14 asked for none). *Recommended:* (A).
- **Q10 — the Windows clients leg is not a required check** (`.github/branch-protection.json`), while the goal says "green
  on three OS legs". (A) the PR head's Windows leg is observed green before the merge, as for E2.3 and E2.4.
  (B) make it required: a branch-protection change, the owner's, outside E2. *Recommended:* (A). Not a change.
- **Q11 — the two product side findings** (§ 9). (A) a todo line each, not built. (B) fix them in E2.5: **CHANGE** (scope).
  *Recommended:* (A). The markers' reasons do not claim a cleanup.
- **Q12 — the `.ts` reading is an op of logic, not of a path.** D7 names the helpers; E2.5.S1's list names
  "`LeftoversGuardFiles.cs` for this tree"; E2.3's record (part 1, difference 4) left it to E2.5. The parent's op rule
  names path and folder ops; adding `.ts` to `HasBlockComments` and a file-name test is a little more. *Recommended:*
  build it (S1.3) with its reason in the manifest; reads as no change (it carries out D7). Not built, the sc. 2 plant
  `xWorld.ts ⇒ 1` cannot hold: that would be the change.

**The coordinator's answers (2026-11-10, before the plan gate).** Every answer below is the recommended option, and none
is counted as a change: epoch 8 stays at entry 8.1.

- Q1 (C): both are built now; the second of #328 and E2.5 to merge renames `<mount>`. The two command lines go in the file
  that holds the project's *Commands* at merge time (`CLAUDE.md` today, `.agents/PROJECT.md` if #328 merges first).
  *[2026-11-10, after the plan gate (G1): the order is the named step S3.0, with its checks and the overlaps of Q1.]*
- Q2 (B): the fifth allowance entry is built as written, with its op on the pin and a comment that it has no effect at
  the pin (the copy folds `.cs` only). Building what the story lists satisfies the plan as written; dropping it would be
  the change. *[2026-11-10 (F10): with a case that pins the "no effect", S1.5.]*
- Q3 (A): a marker above each of the three lines, and `ClientSitesScanTests`' expected list emptied.
- Q4 (A): `work="$RUNNER_TEMP/nginx-config-test"; mkdir -p "$work"`, the trap kept. A site of the planned kind that
  arrived after the inventory, as E2.4's part 2d did for `entrypoint.test.sh`.
- Q5 (C): the two given-root leaves are renamed (S2.8), so row E2.5-b's check holds as written; the given-root behaviour
  stays. Not a change. *Was (A), "the check is restated as measured"; changed by the coordinator on 2026-11-10, after
  the plan gate, because (C) needs no new check text.*
- Q6: what really happens is recorded (the step is red at the start, naming the missing module); the outcome "red,
  naming the cause" holds. *[2026-11-10 (F9): with the measurements of § 0, the copy run outside the mount and the C#
  real-tree result.]*
- Q7 (A): all three jobs that run the unit suite install the mount's modules, with the `workflowMount` rule.
  *[2026-11-10 (G3, F5): and the flag that makes a guard-reading test fail there; `runner lifecycle · windows` is out by
  what it runs.]*
- Q8: the PR quotes both pairs (base 64/84 as sc. 1's RED; head 5/10 as the switch-on's RED).
- Q9 (A): a limit, stated in § 7 part 6, on the PR and as note N22.
- Q10 (A): the Windows leg is observed green on the PR head before the merge; it is not made required.
- Q11 (A): one todo line each, not built.
- Q12: built (S1.3), with its reason in the manifest; it carries out D7.

## 11. Differences from the plan, found by this brief

Each is in a question above: the C#-only findings (Q3, Q4); the wrapper allowance with no effect (Q2); E2.5-b's check
measured at 2, answered by renaming the two leaves so the check holds as written (Q5 (C)); sc. 6's de-initialised mount
(Q6); sc. 1's numbers (Q8); the harness folders read by neither guard (Q9); the Windows leg not required (Q10); the `.ts`
op (Q12); the #328 overlap and the place of the command lines (Q1). Plain facts, not questions: the stories' anchors moved
(`module_tests.md:146` → before `:125`; `architecture.md:366` → `:374`); `leftoversGuardFixtures.test.ts` holds only the
F30 plants, because E2.4 built the `docker.yml` facts in `dockerSmokeLeftovers.test.ts`; D7's expected markers for the
three helpers already exist, and two of D7's expected markers have no finding to clear (§ 6); the second helper folder
and the two path constants were done by E2.3 (its part 1, difference 1). **The janitor's command line (F14):** the stories
write `bash .claude/rules/shared/tools/janitor.sh --dry-run`; S3.2 writes `JANITOR_MIN_AGE_MINUTES=10 bash
<mount>/tools/janitor.sh --token creds --dry-run`, the form `deploy/acme-test/run.sh:119` already uses: `--token creds`
narrows the dry run to this repository's names (the janitor's header, `janitor.sh:49-52`), and the 10 minutes are the
age the start-of-run sweeps use. A person's command line, not a contract; flagged here so the coordinator sees it.

## 12. Risks, growth, commands, Definition of Done

**Risks.** (1) The C# guard walks the file system, not git: an untracked `.sh`, `.cs` or helper `.ts` in a person's
checkout is read, so a local run can be red where CI is green. The failure message names the file; a person moves the
file. (2) The repository guard now runs in the release jobs on six runners, among them `ubuntu-24.04-arm` and
`windows-11-arm`, where the classifier has not run through `node`: E2.5-R1 observes them before the merge (row 27).
(3) #328 and E2.5 touch the same files (Q1, S3.0); the G3 flag turns a missed rename in the guard-reading Node tests into
a failure.

**Growth.** None that stays. The empty-repository step's owned folder lives under `RUNNER_TEMP`, because the step hands
`owned.sh` that root as `TMPDIR` (F4), and the helper's trap removes it; the runner also empties `RUNNER_TEMP` at the end
of the job. `LeftoversGuardCredsTests`' trees are `OwnedScope` folders removed by the test; `leftoversGuardFixtures.test.ts`
scans text in memory. The renamed smoke leaves stay where they stayed before, in the caller's root.

```bash
npm ci --ignore-scripts --prefix .claude/rules/shared
node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"
node .claude/rules/shared/tools/sweeper-scan.mjs --root .
node .claude/rules/shared/tools/plan-lifecycle.mjs
node .github/scripts/public-hygiene.mjs
git grep -n -E 'creds-mcp-listen-smoke-|creds-version-smoke-' -- . ':!todo' ':!research'   # row 3: no output
bash .github/scripts/mcp-listen-smoke.test.sh; bash .github/scripts/version-smoke.test.sh
# C#: build the service-defaults test project by name (Release, -m:4, lowered), then
./src_service_defaults/tests/bin/Release/net10.0/CredsForDevs.ServiceDefaults.Tests --filter-namespace "CredsForDevs.Tests.Leftovers"
./src_cli/tests/bin/Release/net10.0/CredsCli.Tests          # the three markers of Q3 change only comments
cd src_vs_code && npm test && CREDS_GUARD_TESTS_REQUIRED=1 npm test
# hosted, by the coordinator, one at a time (S3.4)
gh workflow run release.yml --ref feat/test-leftovers-e2.5 -f target=cli
# gh workflow run release.yml --ref feat/test-leftovers-e2.5 -f target=extension   # NEVER: it publishes when the version is new (S3.4, 2026-11-10)
```

- [ ] Rows 1–28 of § 1 each have their evidence line on the PR (rows 24–26 the reviewer's readings).
- [ ] S1.1, S1.4, S2.1, S2.3, S2.4, S2.5, S2.6, S2.8: each RED seen once and quoted, then GREEN; S2.7 recorded.
- [ ] The Node guard on the head: `clean (<n> files).`; the empty-repository step green; `This_repository_passes_the_guard`
      green on ubuntu and macOS (required) and observed green on Windows; the guard-reading Node tests run, not skip, in
      the three jobs of row 13, and fail under the flag when the modules are missing.
- [ ] E2.5-R1 and E2.5-R2 (S3.4) quoted with their run URLs: the guard's test passed on each distinct release runner.
- [ ] S3.0 done by whichever of E2.5 and #328 merges second, with its checks on that PR.
- [ ] `sweeper-scan` `none found` on the head; `plan-lifecycle` and public hygiene green; actionlint green.
- [ ] `module_tests.md` § *Test leftovers*, `architecture.md:374` and the two command lines written and true at the head.
- [ ] The E2.5 build record, N22–N24, the merge-condition records of the five PRs, the status line and the README row.
- [ ] The plan gate on this brief said `proceed` before the first code commit (done); a `review_code` round and an Opus
      review per story before the merge.

## 13. The revision after the plan gate (2026-11-10): what changed, and why none of it is a change

The coai plan gate said `proceed`; the coordinator accepted three of its findings (G1–G3) and an independent Opus
review's findings (F1–F18). Each is applied above. Epoch 8 stays at entry 8.1. Where a fix could have been a change, the
form taken is the one that is not, for the reason given:

| Finding | Where | Why it is not a change |
|---|---|---|
| G1 — the order against #328, named, with checks | S3.0; Q1 | It makes Q1's answer (C) executable; no scope, step or condition of the stories moves |
| G2 — the guard's test on each release runner before the merge | row 27; S3.4 | The release jobs already run the test (§ 3); this is the observed result epoch 8 item 8.1 asks for an invocation the inventory lists. No publishing path is used for `target=cli` (2026-11-10: the same is NOT true of `target=extension`, see S3.4) |
| G3 — fail, not skip, where the modules are installed | row 28; S2.4 | Row 13 already asks that the guard-reading tests RUN in CI; a skip there would not satisfy it. A fix that only satisfies the plan as written |
| F1 — the detail text, the piece RED | § 0; S2.6 | The parent's E2.5-a asks for a RED; with class-only asserts there would be none |
| F2 — non-literal plants, markers, split docker words, a scans-clean case; NO sixth allowance | S1.1 | A sixth allowance would be the change; the form taken keeps the file inside the guard's normal reading |
| F3 — markers above the fixture plants | S2.6; § 6 | Row 1's "only the inventory's exemptions": the markers are in the inventory |
| F4 — `TMPDIR="$RUNNER_TEMP"` in the empty-repository step | § 5; Growth | A correction of how `owned.sh` is called; the step is the stories' own |
| F5 — the matcher narrowed; `runner lifecycle · windows` needs no install | S2.4; § 3 | Q7 (A) names the three jobs that run the unit suite; this keeps the rule to them |
| F6 — one mount-path constant; the G3 rule for the two E2.4 files | S2.4 | The same row 13; the files are E2.4's and already read the guard |
| F7 — #328's overlaps named | Q1 | Words |
| F9 — the de-initialised mount measured | § 0; Q6; row 17 | Q6's answer stands: "red, naming the cause" holds |
| F10 — a case that pins "no effect" | S1.5 | Q2 (B) builds the allowance as written; the case adds a check, not a step |
| F11–F18 | § 8; § 0; rows 14, 24–26; § 11; § 3; the goal line | Words, anchors, the stories' own goal text, and DoD lines mapped to rows |
| Q5 → (C) | S2.8; row 3; § 10 | The parent's check holds word for word; E2.4's given-root behaviour stays; two leaf names change, and nothing reads them (§ 0) |
