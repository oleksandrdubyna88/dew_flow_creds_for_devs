# PLAN — Test leftovers, E2.5 brief: repository-wide enforcement (stories S1–S3)

> Status: **brief only, nothing built, 2026-11-10; no plan gate yet.** Scope: the build brief of epic E2.5 of
> [PLAN_test_leftovers_E2.md](PLAN_test_leftovers_E2.md) (§ *Epics* → E2.5, § S5, D7, D8, D9; § *Revision for the
> rollout's epochs 6 and 7* rows 1, 2, 6, 7; § *Revision for the rollout's epoch 8* rows E2.5-a, b, c). Base: `main`
> `6e08071`, where E2.1 (#294), E2.2 (#310), E2.3 (#311) and E2.4 (#329) are merged; the mount is release `37b9aa5`.
> Branch for the build: `feat/test-leftovers-e2.5` from that commit. Brief by Opus; code by a Sonnet coder; review by
> Opus. **The parent's epoch 8 has used its one change (entry 8.1). The next accepted change is the eighth full stop.**
> So every difference from the plan that this brief found is an open question in § 10, never built in. With the
> recommended answers, this brief reads **no** change; § 10 marks each answer that would be one.
> **One open pull request touches the same files: creds #328 (draft, `chore/rules-layout-migration`, `8f31013`) moves
> the mount from `.claude/rules/shared` to `.agents/conventions` and the project text from `CLAUDE.md` to
> `.agents/PROJECT.md`** (Q1). Below, `<mount>` means `.claude/rules/shared` on `6e08071`.

**The epic's goal (E2.5, unchanged).** Both whole-tree guards are on and green: the shipped Node guard in the required
`docs.yml` job, the copied C# guard on the clients legs. Every remaining finding is a real exemption with a reason. The
barrier rescan is clean. The docs and the records are complete.

Sources, read for this brief: the stories document (header; § *Revision* for epochs 6/7, rows 1, 2, 6, 7, 8; § *Revision*
for epoch 8; D7, D8, D9; § *Order* and its table; § S5; § *Test plan*; § *Definition of Done*; § *Epics* E2.5; the E2.3
build record parts 1, 3, 3b, 5; the E2.4 build record parts 1–4 and 2b–2h; the notes N1–N21); the E2.4 brief (§ 1, § 5,
§ 7) and the E2.3 brief (§ 3.1, Q4) as models of form; the parent `dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md`
at `origin/main` `d89a32f` (read only: the ledger to entry 8.1; § *Re-review for epoch 8*; § *Epoch 8* items 1, 2, 3, 3.2,
5, 8; § *Epoch 3* item 4; the DoD; § *Epics* E2); conventions `todo/PLAN_F30_folding_reader.md` D2 at the pin `37b9aa5`;
the mounted `common/test-leftovers-detail.md` § 7, `common/planning-docs.md`, `common/plan-change-control.md`; the mounted
`tools/leftovers-check.mjs`, `tools/lib/leftovers-cli.mjs`, `tools/janitor.sh`; the template's
`dew_flow_mcp · tests/Mcp.Tests/Leftovers/LeftoversRepositoryGuardTests.cs` at `197cc76`; creds #328's diff. Every
`file:line` below was read at `6e08071`.

*Instruction loading:* this repository has no `AGENTS.md` and no `.agents/PROJECT.md` on `main`, so the shared resolver
answers `rules check: INCOMPLETE — Missing instruction source: …/AGENTS.md`. The rules named above were read directly
from the mount. Nothing was changed but this brief and its `todo/README.md` row. The mount's `node_modules` were
installed inside the mount only (`npm ci --ignore-scripts --prefix .claude/rules/shared`, git-ignored there). The C#
guard was run by hand from a scratch test file in a separate detached worktree, never committed and deleted after
(as E2.3's part 5 did); the plants of § 0 lived in a scratch folder outside every temp root, also deleted.

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
(372 files): **10 findings**. Five of them are not the Node guard's:

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

**Other reads.** `sweeper-scan.mjs --root .`: `none found (1678 file(s) read) — the barrier is open for this scope`.
Token checks: the Node guard none; the C# `RegisteredTokenFindings` 0 and `ConstantFindings` 0. The Node guard over an
empty `git init` folder and over a missing folder: exit 2, `leftovers-check: scanned nothing under <dir> — discovery
broke; the repository is not clean`. The C# guard over an empty folder: `FilesScanned` 0.

**Plants** (Node: `scanText(<path>, <text>)` of the mounted guard, which ignores discovery; C#: `Scan(<plant root>,
<repo>)`, which applies discovery; "—" = not discovered by that guard):

| Plant (path, text) | Node guard | C# guard |
|---|---|---|
| `src_vs_code/scripts/x.cjs`, `fs.mkdtempSync(path.join(os.tmpdir(), 'x'))` | `raw-temp` (but the `node` profile does not discover the folder) | 1 `raw-temp` |
| `src_vs_code/src/test/xWorld.ts`, the same | `raw-temp` (not discovered: not `*.test.ts`) | **— (0 files)**: no `.ts` kind (S1.3) |
| `src_vs_code/src/test/x.test.ts`, the same | 1 `raw-temp` (discovered) | — (0 files) |
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
| the 55 `src_vs_code/src/test/*.ts` helpers that are not `*.test.ts`, each read as a script under `src_vs_code/scripts/` | — | 0 findings |
| `install.sh` with the marker of § 6 above `:63` | `:63` gone, `:76` stays | `:63` gone, `:76` stays |
| the same marker with the reason `needed`, or `product script` (two words) | `exemption` + the finding stays | (not run) |
| the same marker with another class (`docker-run`) | the finding stays, no `exemption` finding | (not run) |
| `commandParse.test.ts` with the marker of § 6 above `:40` | 0 | — |
| an `owner-blind` line with an `owner-blind` marker above | `exemption` + `owner-blind` | (not run) |

**Break-it, tokens** (scratch, reverted): `REPO_TOKEN = 'cred'` in `leftovers.cjs` → 2 `token` findings: `token constants
differ: creds in .github/scripts/lib/owned.sh:37, creds in …/OwnedToken.cs:9, cred in src_vs_code/scripts/lib/leftovers.cjs:20 —
every helper of a repository holds the same token (§2)` and `the token cred is not a row of the ## Tokens table of
common/test-leftovers-detail.md`.

## 1. The parent's table, filled

Each row is a merge condition of E2.5's pull request: the parent's rows E2.5-a, b, c and the E2 rows that apply to every
PR (E2 (c), E2-d); revision rows 6 and 7; S5 sc. 1–6; the E2.5 items E2.4 deferred (its brief § 5); D7; the DoD's E2.5
lines. A row with "—" in the implementation or check column is **unmapped**: an open question (§ 10).

| # | Condition | Implementation (file:line at `6e08071`) | Invocations covered | Executable check | Prepares / does not prove | Observed at `6e08071`, with the counterexample that must be red |
|---|---|---|---|---|---|---|
| 1 | **E2.5-a** — the Node guard leaves only the inventory's exemptions | the five markers of § 6; the guard step in `docs.yml` (§ 5) | `docs.yml` `lifecycle` (required); a person | the step on the PR head prints `leftovers-check: clean (<n> files).`, exit 0 | A text scan of the 622 files the `node` profile reads. It does not read `.cs`, `src_vs_code/scripts/`, `src_minimalapi_server/scripts/` or the `.ts` helpers (rows 8–11 carry those) | 5 findings (§ 0); with the markers: clean (622 files). Red: a marker whose reason is `needed` → `exemption` and the finding stays |
| 2 | **E2.5-a, F30 plants** — the `.cjs` and `.sh` plants are findings; the PR pins each as a positive test, RED by hand once against a copy of the guard with the plant's line removed (the parent's words) | `src_vs_code/src/test/leftoversGuardFixtures.test.ts` (new, S2.6) | `npm test` (`ci-extension.yml:74-75`), with row 13 | `scanText` of the mounted guard: each plant → exactly one `legacy-name` on its line | `scanText` reads the spelling, not discovery: a plant path the profile does not discover proves the reader only (Q9) | § 0: `.cjs` split, `.sh` split (two spellings), whole literals: 1 `legacy-name` each. RED: S2.6's mutant guard |
| 3 | **E2.5-b** — the `.sh` temp paths the guard cannot see were migrated by E2.4 | `mcp-listen-smoke.sh:44-55`, `version-smoke.sh:72-82` (`owned_dir` when no root is given) | a person; CI and release pass `RUNNER_TEMP` | the parent's: `git grep` for the old leaf names → 0. **Measured: 2** (Q5) | No detector (N6). `owned.sh:293` keeps `${TMPDIR:-/tmp}` as the helper's root | `mcp-listen-smoke.sh:46`, `version-smoke.sh:73`: the leaf inside a GIVEN root (`$2`/`$4` or `RUNNER_TEMP`), kept by E2.4 brief § 3.1 item 2 |
| 4 | **E2.5-c** — the C# guard folds `.cs` | the copied `LeftoversGuardLiterals.cs` (E2.3) | the five xUnit executables | `LeftoversGuardCredsTests` plant: `"testsTo" + "Delete-agent-x"` in `src_cli/tests/Y.cs` → 1 `owner-blind` | The Node guard does not read `.cs` | § 0: 1 `owner-blind` (`testsToDelete-ag`). Red: the same plant with `LeftoversGuardLiterals` reverted to a whole-literal read (by hand, S1.1) |
| 5 | **Revision row 6** — the guard step says what its zero means; F30 shipped or re-decided before E2.5 merges | the step's comment in `docs.yml` (§ 5), the sentence of § 8 | `docs.yml` | a reviewer reads the comment against D2 at the pin | Words, not behaviour | F30 is in `37b9aa5` (`acb693c` is its ancestor, checked), pinned by #306. Met |
| 6 | **E2 (c), S0 acceptance 2** — the barrier rescan on the PR head | none (a read) | the checkout | `node <mount>/tools/sweeper-scan.mjs --root .` → `none found`, quoted on the PR | The scan reads this checkout only | `none found (1678 file(s) read)` |
| 7 | **E2-d** — the hand clean-up of old names, per machine | E2.5 makes no resource and has no old name | — | the PR says "none of E2.5's own"; S3.3 collects the four earlier PRs' records into one list | A record, not a proof | — (nothing to clean) |
| 8 | **S5 sc. 1** — this repository passes both guards | Node: row 1. C#: `LeftoversRepositoryGuardTests.cs` (copied, S1.4) | Node: `docs.yml`. C#: `ci-clients.yml:177-178` on ubuntu, macOS (required) and Windows (not required, Q10), `:165-167` (macOS), `sonarcloud.yml:157`, `release.yml:393`, `:666` (on a tag, six runners) | `This_repository_passes_the_guard` green; the docs step green | The C# guard walks the FILE SYSTEM, not git: an untracked script in a person's checkout is read (§ 12, risk 1) | C#: 10 findings (§ 0); after § 6 and Q4 (A): 2, both `docker.yml` (row 10). RED history: `a52fde1` Node 64, C# 84 (Q8) |
| 9 | **S5 sc. 2, C# half** — every class fires once; a valid marker silences it | `LeftoversGuardCredsTests.cs` (new, creds' own, S1.1) | the five executables' `ServiceDefaults.Tests` | the plant table of S1.1 | Plants in an owned scratch root, not the real tree | § 0's C# column; the `xWorld.ts` plant is 0 today (row 11) |
| 10 | **D7, N18** — the C# guard excludes `docker.yml` from its docker classes by name, ONE pinned entry; the Node guard's green is the proof that the exclusion hides nothing | `LeftoversGuard.cs:199-205` (`HitsOutsideSource`) and a new constant beside `:45`, as manifest ops (S1.2) | the same | a test pins the list `[".github/workflows/docker.yml"]`; the real `docker.yml` → 0 docker findings; the SAME text as `.github/workflows/other.yml` → 2 `docker-run` | The exclusion is by name; a renamed workflow loses it (the counterexample) | today 2 `docker-run` (`:98`, `:125`) |
| 11 | **D7** — the C# guard reads the `src_vs_code/src/test/` helpers that are not `*.test.ts` | `LeftoversGuardFiles.cs:22` (`HasBlockComments`), `:30-31`, `:72-73` (`IsScript`), as manifest ops (S1.3; Q12) | the same | plant `xWorld.ts` → 1 `raw-temp`; plant `x.test.ts` → not discovered (the Node guard's) | — | **0 files today** (RED). The 55 real helpers, read as scripts: 0 findings |
| 12 | **S5 sc. 2, Node half** — the `docker.yml` facts through the shipped guard | already built by E2.4 in `dockerSmokeLeftovers.test.ts` (part 3, RED list item 4) | `npm test` | they RUN in CI, not skip (row 13) | — | they skip in CI today (row 13) |
| 13 | **E2.4 brief § 5, part 2b item 4** — the mount's `node_modules` where the guard-reading tests run | `npm ci --ignore-scripts --prefix <mount>` in each job that runs the unit suite (Q7) | `ci-extension.yml` `typecheck · test · package`, `sonarcloud.yml` extension coverage, `release.yml` extension job | `workflowMount.test.ts` gains a rule: every job that runs the unit suite installs the mount's modules before it (S2.4); the CI log of `npm test` shows no `cannot load its yaml module` skip | — | E2.4 part 2b: without the modules `42 tests, 39 pass, 3 skipped`; CI today skips |
| 14 | **S5 sc. 3** — a scan of nothing is red | Node: a `docs.yml` step (§ 5, `[E2.1 plan gate 2]`). C#: the copied `A_scan_of_nothing_says_so_instead_of_reporting_clean` | `docs.yml`; the executables | exit 2 and the sentence; `FilesScanned == 0` | An empty repository stands in for a broken discovery | both measured (§ 0). Red: the same step pointed at the real tree → exit 1, not 2 |
| 15 | **S5 sc. 4** — the tokens | the three constants; the copied `GuardTokens` tests | both guards | Node: no `token` finding on the head; the break-it of § 0 by hand. C#: the copied token tests | — | none / 0 / 0; break-it: 2 `token` findings naming the three places |
| 16 | **S5 sc. 5** — the exclusion lists are pinned | `LeftoversGuard.cs:45` (`ExcludedFiles = []`), row 10's constant; the Node guard's `EXCLUDED_FILES` (`<mount>/tools/leftovers-check.mjs:137`) | — | the copied `No_file_is_excluded_and_the_guards_own_tests_are_scanned_clean` (`LeftoversGuardTests.cs:657`); row 10's pin; the Node guard's own test | — | C# `[]`; Node: its two test files |
| 17 | **S5 sc. 6** — break-it on the real tree, by hand, recorded, reverted | none | — | each red, naming its line (S2.7) | By hand, once | the de-initialised mount cannot give the Node `token` finding the stories expect (Q6) |
| 18 | **The C#-only findings** | `AgentRelayTests.cs:38`, `:39`, `:278`; `ci-server.yml:375` | `CredsCli.Tests`; job `compose · scripts` | row 8 green | — | **—, unmapped** until Q3 and Q4 are answered |
| 19 | **Docs** | `research/module_tests.md` (a section before `:125`, § 7); `research/architecture.md:374`; `CLAUDE.md:36-74` (Q1) | — | a reviewer reads them against the code | Words | — |
| 20 | **Completion records** | the stories' status line and `todo/README.md:38`; `plan-lifecycle.mjs` | `docs.yml` | `plan-lifecycle` green | The parent's E2 entry is in conventions: the coordinator's PR, not this one | — |
| 21 | **§ Epoch 3 item 4** — the invocation inventory | § 3, copied to the PR | every job that runs a guard | a reviewer compares § 3 with `git grep -n -E "leftovers-check|ServiceDefaults.Tests|npm test" -- .github` | E2.5 drops no prefix; the inventory is of the GUARDS | § 3 |
| 22 | **The DoD's F3 line** — F3 released and pinned before the first Node compliance declaration | `<mount>/tools/leftovers-check.mjs:308` (`isPackageManifest`: the `node` profile reads `package.json` scripts) | — | none needed | E5's #945 declared first | met at `37b9aa5` |
| 23 | **D8** — one plan gate, one code gate, an Opus review per story; the cadence consult of this group | — | — | the PR names the rounds and the reviewers that answered | — | the group's consult is `c4fb33b8` (E2.4 brief § 4); no new one is due |

Unmapped: row 18 (Q3, Q4). Row 3's check text (Q5) and row 17's last case (Q6) need the coordinator's reading.

## 2. What E2.5 changes, by file and line

| File (at `6e08071`) | Change | Story |
|---|---|---|
| `src_service_defaults/tests/Support/Leftovers/LeftoversGuard.cs:45-46`, `:199-205` | a constant `DockerJudgedByNodeGuard = [".github/workflows/docker.yml"]` and the two docker classes skipped for it; manifest ops with a reason | S1.2 |
| `src_service_defaults/tests/Support/Leftovers/LeftoversGuardFiles.cs:22`, `:30-31`, `:72-73` | `.ts` in `HasBlockComments`; the `src_vs_code/src/test/` `.ts` files that are not `*.test.ts` read as `Script`; manifest ops | S1.3 (Q12) |
| `src_service_defaults/tests/Support/Leftovers/LeftoversGuard.cs:60-66` and `LeftoversGuardTests.cs:647-655` | the wrapper as a fifth folding allowance, with its op on the pin — only if Q2 is (B) | S1.5 |
| `src_service_defaults/tests/Leftovers/LeftoversRepositoryGuardTests.cs` (new) | the template's file at `197cc76`, namespace op only | S1.4 |
| `src_service_defaults/tests/Leftovers/LeftoversGuardCredsTests.cs` (new, creds' own) | the plants of S1.1 | S1.1 |
| `src_service_defaults/tests/Support/Leftovers/template-manifest.json` | entry 53 (`LeftoversRepositoryGuardTests.cs`) and the ops of S1.2, S1.3 (S1.5) | S1 |
| `src_service_defaults/tests/Leftovers/TheAdaptedCopyTests.cs:27`, `:80`, `:37-47` | `TemplateEntries` 52 → 53 and its message; `LeftoversGuardCredsTests.cs` on `CredsOwn` | S1 |
| `.gitattributes`; `.github/workflows/sonarcloud.yml:128` | one `-text` line and one `sonar.exclusions` entry for the copied file | S1.4 |
| `install.sh:63`, `:76`; `deploy/restore.sh:102`; `deploy/restore-archive.sh:61`; `src_vs_code/src/test/commandParse.test.ts:40` | one marker line above each (§ 6) | S2.1 |
| `src_cli/tests/AgentRelayTests.cs:38`, `:39`, `:278` | one marker line above each (Q3) | S2.2 |
| `.github/workflows/ci-server.yml:375` | `work="$RUNNER_TEMP/nginx-config-test"; mkdir -p "$work"` (Q4) | S2.2 |
| `src_service_defaults/tests/Leftovers/ClientSitesScanTests.cs:9-11`, `:32-44`, `:94` | `Expected` becomes empty; the summary and the reason say "no unmarked temp site" | S2.3 |
| `.github/workflows/docs.yml` after `:61` | `setup-node` 22, the mount's `npm ci`, the guard step, the empty-repository step (§ 5) | S2.5 |
| `.github/workflows/ci-extension.yml:52-53`; `sonarcloud.yml:163-169`; `release.yml:856-872` | `npm ci --ignore-scripts --prefix <mount>` before the unit suite (Q7) | S2.4 |
| `src_vs_code/src/test/workflowMount.test.ts` | the install rule of row 13 | S2.4 |
| `src_vs_code/src/test/leftoversGuardFixtures.test.ts` (new) | the F30 plants (row 2) | S2.6 |
| `research/module_tests.md` before `:125` | the section *Test leftovers* (§ 7) | S3.2 |
| `research/architecture.md:374` | `docs · plans  plan-lifecycle.mjs + pin-check.mjs + leftovers-check.mjs (--profile node) from the shared submodule` | S3.2 |
| `CLAUDE.md:36-74` (or `.agents/PROJECT.md`, Q1) | two lines: the janitor; the two guards and how to run each | S3.2 |
| `todo/PLAN_test_leftovers_E2.md` | the E2.5 build record; notes N22–N24 (§ 9); the status line `E2 shipped, <date>; promotes with its parent` | S3.3 |
| `todo/README.md:38` | the same status | S3.3 |

Not changed: the copied helper's ownership, liveness and deletion code; the Node reference; the mount.

## 3. The invocation inventory (§ *Epoch 3* item 4)

E2.5 drops no prefix and makes no resource. The inventory lists every place that runs a guard or a test that reads a
guard, at `6e08071`.

| Invocation (`file:line`) | What it runs after E2.5 | Mount, its modules, Node | Required check |
|---|---|---|---|
| `docs.yml` `lifecycle` (ubuntu), after `:61` | the Node guard; the empty-repository step | mount `:35-36`; modules and Node 22: new | yes (`plan lifecycle · submodule pin`) |
| `ci-clients.yml` `build-test` (ubuntu, macOS, Windows), `:177-178`; macOS also `:165-167` | `LeftoversRepositoryGuardTests`, `LeftoversGuardCredsTests` (in `ServiceDefaults.Tests`) | mount `:74-75`; Node 22 `:76-80`; the classifier needs no `yaml` (`sweeper-scan.mjs` imports none) | ubuntu and macOS yes; **Windows no** (Q10) |
| `sonarcloud.yml` `sonar`, `:157` (C#), `:163-184` (the unit suite under c8) | both | mount `:35-36`; Node 22; modules: new (Q7) | yes (`SonarCloud Scan`) |
| `release.yml` `cli-binaries` `:393`, `mcp-binaries` `:666` (a tag; win-x64, win-arm64, osx-arm64, osx-x64, linux-x64, linux-arm64) | `ServiceDefaults.Tests`, so the repository guard | mount `:364`, `:642`; Node 22 | a release job |
| `release.yml` extension job `:856-872` (a tag) | `npm test` | mount `:860`; modules: new (Q7) | a release job |
| `ci-extension.yml` `typecheck · test · package` `:74-75` | `npm test`: `dockerSmokeLeftovers`, `acmeRunLeftovers`, `leftoversGuardFixtures` read the guard | mount `:42-44`; Node 22; modules: new | yes |
| `ci-extension.yml` `runner lifecycle · windows` `:193-220` | named files only; none reads the guard | mount `:204-206` | no |
| a person | `node <mount>/tools/leftovers-check.mjs …` after `npm ci --ignore-scripts --prefix <mount>`; `./src_service_defaults/tests/bin/Debug/net10.0/CredsForDevs.ServiceDefaults.Tests --filter-class "*LeftoversRepositoryGuardTests"`; `npm test` | the person's mount | — |

## 4. The stories

**One pull request**, S1 → S2 → S3 as an ordered commit series, each RED then GREEN (D8, as E2.3 and E2.4). One plan
gate on this brief, one code gate, one Opus review per story's commit range. The repository test of S1.4 is committed
RED in S1 and goes green in S2.

### 4.1 E2.5.S1 — the C# guard's creds discovery and its tests (Opus · Sonnet · Opus; owns sc. 2, 3, 5)

Every op on a copied file is a manifest op with a `reason` (revision row 3, the parent's § *Epoch 4* item 4); the diff
check of `TheAdaptedCopyTests` stays green. No op touches ownership, liveness or deletion code.

- **S1.1 — `LeftoversGuardCredsTests.cs` (RED first).** Creds' own file in `src_service_defaults/tests/Leftovers/`, on
  `CredsOwn`. Each case writes its tree into an `OwnedScope` folder (as `LeftoversGuardTests` does), runs
  `LeftoversGuard.Scan(root, RepositoryRoot.Path)` and asserts the exact list of `file:line:class`. The fixture text is
  spelled in pieces, because the guard scans this file too. Cases (expected after S1; observed today in § 0):
  `src_vs_code/scripts/x.cjs` `fs.mkdtempSync(` → 1 `raw-temp`; `src_vs_code/src/test/xWorld.ts` the same → 1 `raw-temp`
  (**RED today: 0 files**); `src_vs_code/src/test/x.test.ts` → not discovered (that is the Node guard's); `src_cli/tests/X.cs`
  `Path.GetTempPath()` → 1 `raw-temp`; a split `"testsTo" + "Delete-…"` in a `.cs` → 1 `owner-blind` (row 4);
  `Owned.Prefix` in `src_mcp/tests/X.cs` → 1 `owner-blind` (D9 #14); `deploy/acme-test/run.sh` with
  `-p cred-vault-acme-test` → 1 `docker-name`, with `-p "$PROJECT"` → 0, with a literal owner-form project → 0; the real
  `docker.yml` copied in → 0 docker findings (**RED today: 2 `docker-run`**), and the same text as
  `.github/workflows/other.yml` → 2 `docker-run`; each case again with a valid marker above the line → 0. By hand once,
  recorded: `LeftoversGuardLiterals.Fold` replaced by a whole-literal read → the split `.cs` case goes red (the stories'
  § *Test plan* row for split spellings).
- **S1.2 — the `docker.yml` exclusion.** A constant beside `ExcludedFiles` (`LeftoversGuard.cs:45`) with exactly one
  entry; `HitsOutsideSource` (`:199-205`) skips `docker-run` and `docker-name` for it, and nothing else (`raw-temp` and the
  others still read the file). A test pins the list and that the file exists. The comment says why: the §5 carve-out
  is read by the shipped Node guard, which is green on the file (row 1). GREEN: S1.1's two `docker.yml` cases.
- **S1.3 — the `.ts` helpers (D7; Q12).** `LeftoversGuardFiles.cs`: a `.ts` file under `src_vs_code/src/test/` whose name
  does not end in `.test.ts` is a `Script`; `.ts` joins `HasBlockComments` (`:22`). GREEN: S1.1's `xWorld.ts` case; the
  copied `Discovery_reads_the_tests_the_source_the_workflows_and_every_script` (`LeftoversGuardTests.cs:275`) stays green.
  Measured: the 55 real helpers add no finding.
- **S1.4 — `LeftoversRepositoryGuardTests.cs`.** The template's file at `197cc76` (one `[Fact]`,
  `This_repository_passes_the_guard`: `FilesScanned > 0` and no finding, the message `report.Describe(root)`), manifest
  entry 53 with the namespace op only; `TemplateEntries` 53 (`TheAdaptedCopyTests.cs:27`) and the message at `:80`; a
  `-text` line in `.gitattributes`; the path in `sonar.exclusions`. **RED in this story**: the test fails on the branch
  with the 10 findings of § 0 minus S1.2's two, quoted in the commit. GREEN after S2.1–S2.2.
- **S1.5 — the wrapper's folding allowance (Q2).** Only if Q2 is (B).
- **Check:** `./src_service_defaults/tests/bin/Release/net10.0/CredsForDevs.ServiceDefaults.Tests --filter-namespace
  "CredsForDevs.Tests.Leftovers"` on Linux; the three CI legs.

### 4.2 E2.5.S2 — the exemptions, the guards in CI, the tokens, the break-its (Opus · Sonnet · Opus; owns sc. 1, 3, 4, 6)

- **S2.1 — the five Node findings (§ 6).** One marker line above each. RED: the Node guard on the branch before the
  commit, 5 findings, exit 1 (§ 0). GREEN: `clean (<n> files).`, exit 0; the C# guard loses the four product lines too.
- **S2.2 — the C#-only findings (Q3, Q4).** As the coordinator answers. With the recommended answers: three markers in
  `AgentRelayTests.cs` and the `RUNNER_TEMP` line in `ci-server.yml:375`. GREEN: S1.4's test is green (measured on a
  scratch copy: 2 left before S1.2, 0 after).
- **S2.3 — `ClientSitesScanTests`.** Its `Expected` (`:38-43`) becomes empty, its summary (`:9-11`) and reason (`:94`)
  say "no unmarked temp site". RED (measured on the scratch copy, the exact text): `Expected Named(RawTempFindings(Scratch(sources)))
  to be equal to {… three AgentRelayTests lines …} because every temp site is a helper call or carries a marker; the three
  literals that create nothing stay for E2.5's guard, but found empty collection.`
- **S2.4 — the mount's modules where the guard-reading tests run (Q7).** `npm ci --ignore-scripts --prefix <mount>`
  before the unit suite in `ci-extension.yml` (after `:44`), `sonarcloud.yml` (before `:169`) and the `release.yml`
  extension job (before `:872`). `workflowMount.test.ts` gains: every job that runs the unit suite installs the mount's
  modules before that step. RED: the rule names those three jobs today. The CI log of `npm test` then shows the guard
  tests run (`dockerSmokeLeftovers`: no skip line).
- **S2.5 — `docs.yml` (§ 5).** RED of the guard step: the step on the commit before S2.1 is red with the five lines (run it
  by hand with the step's exact command; quote it). RED of the empty-repository step: its assertion pointed at the real
  tree fails (exit 1, not 2), by hand once.
- **S2.6 — `leftoversGuardFixtures.test.ts`.** Loads the mounted guard's `scanText` the way `dockerSmokeLeftovers.test.ts:652-668`
  does (and skips with its reason when `yaml` cannot load). Cases: `'testsTo' + 'Delete-agent-x'` in a `.cjs`;
  `"testsTo""Delete-agent-x"` and `"testsTo"+"Delete-agent-x"` in a `.sh`; a whole legacy literal in a `.cjs` and in a
  `.sh` → each exactly one `legacy-name` on its line. No case asserts that a spelling is NOT found (revision row 2). RED, by
  hand once (the parent's E2.5-a words): a scratch copy of the mount's `tools/` with the fold reader's join for the plant's
  kind removed (in `tools/lib/leftovers-fold.mjs` or `leftovers-fold-shell.mjs`), the test pointed at it by a seam, red;
  recorded and thrown away.
- **S2.7 — break-it on the real tree (sc. 6, by hand, recorded, reverted).** One raw `fs.mkdtempSync` in a unit test (Node
  guard red at its line); one in a harness under `src_vs_code/scripts/` (C# guard red); one `Path.GetTempPath()` in a C#
  test (C# red); `continue-on-error` deleted from the remover step of `docker.yml` (Node guard: 2 `docker-run`, the parent's
  E2.4-a counterexample); one token constant changed (§ 0's two `token` findings); the mount de-initialised (Q6).
- **Check:** the guard command of § 5; `npm test` in `src_vs_code`; the executable of S1.

### 4.3 E2.5.S3 — the final rescan, the docs, the completion records (Opus · Sonnet · Opus)

- **S3.1 — the barrier rescan** on the PR head: `node <mount>/tools/sweeper-scan.mjs --root .`, the line quoted on the PR
  (row 6). A sweeper that appeared is a stop.
- **S3.2 — the docs.** `module_tests.md` § *Test leftovers* (§ 7); `architecture.md:374`; the two command lines (Q1):
  `JANITOR_MIN_AGE_MINUTES=10 bash <mount>/tools/janitor.sh --token creds --dry-run` (from Git for Windows' bash on
  Windows, where it removes nothing until F9; bash 4 or newer on macOS, N20) and the two guards as § 5 and § 3 run them.
- **S3.3 — the records.** The E2.5 build record in the stories document; the merge conditions (a)–(d) of D8 collected
  from #294, #310, #311, #329 and this PR into one list; notes N22–N24 (§ 9) in *Notes for the parent*; the stories'
  status line and `todo/README.md:38` `E2 shipped, <date>; promotes with its parent` (never *implemented* while in
  `todo/`). The parent's E2 entry gets the same sentence in a conventions PR (the coordinator's). After the merge the
  parent's row F runs: `mcp__coai__review_feature` over E2's stories from creds, `baseRef` `a52fde1`.
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
      - name: The leftovers guard refuses a scan of nothing
        shell: bash
        run: |
          source .github/scripts/lib/owned.sh || exit 1
          owned_dir scratch guard-empty || exit 1
          git init -q "$scratch/repo"
          if node .claude/rules/shared/tools/leftovers-check.mjs --repo "$scratch/repo" --profile node --token creds \
              --identity "the developer-credentials server and extension" 2> "$scratch/stderr"; then code=0; else code=$?; fi
          [ "$code" = 2 ] || { echo "expected exit 2 for a scan of nothing, got $code"; exit 1; }
          grep -F "scanned nothing under $scratch/repo — discovery broke; the repository is not clean" "$scratch/stderr" \
            || { echo "the sentence is missing:"; cat "$scratch/stderr"; exit 1; }
```

Notes for the coder. Under Actions `owned.sh` takes `RUNNER_TEMP` as its root and needs no Node on Linux. The exit code is
read through `if … then … else code=$?`, not through a command substitution (entry 8.1: `bash -e` does not stop on a failed
substitution inside another command). The stderr file is inside the owned folder, beside the repository, never in it.
After #328 (Q1) the paths read `.agents/conventions`, and #328's own step already installs the mount's modules and Node 22,
so the first two steps above are not added again. The step's ShellCheck runs through actionlint (`workflows · actionlint`).

**The C# guard** has no step of its own: it is a test of `ServiceDefaults.Tests`, run where § 3 lists. **The unit-suite
jobs** get the one install line of S2.4.

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

`#` comments in the shell files, `//` in `.ts` and `.cs`. The reasons say only what is true: they do not say the product
removes its scratch on every path, because two of them do not (§ 9, side findings).

**D7's list, against the measurement.** Already in the tree (E2.1, E2.3): `Owned.cs:119`, `OwnedCreds.cs:17`,
`leftovers.cjs:46`. No finding, so no marker: `owned.sh`'s root (`:293`, N6) and the `docker compose` calls of
`restore-archive-itest.sh` (the shim). Not in D7's list but found: `AgentRelayTests.cs` ×3 (E2.3 left them "for E2.5's
guard") and `ci-server.yml:375` (#326, after the plan): Q3, Q4. Today the tree holds 20 markers outside `todo/` and
`research/` (`git grep -n testsToDelete-exempt`); after E2.5, 28 with Q3 (A).

## 7. `module_tests.md` § *Test leftovers* — the content plan

A new section before `## What the unit suite leaves behind` (`:125`), after the harness catalogue (the stories said
"after `:146`", the same place in the older file). It is the map; each story's own paragraph stays where E2.1–E2.4 put it
(parent entry 8.1's note). Its parts, each a few lines or one table:

1. **The rule and the name.** The contract (`<mount>/common/test-leftovers.md` and its detail), the token `creds`,
   `testsToDelete-<owner>-creds-<what>-<id>`, the claim in `<folder>.owner` beside the folder.
2. **The three helpers** (one table): Node `src_vs_code/scripts/lib/leftovers.cjs` (+ `harnessScope.cjs`), a wrapper over
   the mounted reference; C# `src_service_defaults/tests/Support/Leftovers/`, an adapted copy of `dew_flow_mcp` `197cc76`
   with its manifest, linked into the five executables; bash `.github/scripts/lib/owned.sh`. Per row: who makes the
   folder, who sweeps at start (both roots), who audits at the end, what it does on Windows. Links to the paragraphs.
3. **Containers:** the `docker.yml` carve-out and acme, one line each with links.
4. **Who collects what a killed run left** (one table, per OS): Linux and macOS — the next `npm test`, `itest:all` or
   xUnit executable, or the janitor; Windows — the C# sweep (both keys), the Node sweep only lists (F16), the janitor is a
   dry run until F9, and what new files of `BUILTIN\Administrators` hold waits for a person (F31, by its true condition).
5. **The two guards** (one table): what each reads (Node: `*.test.*`, `.sh`/`.ps1` everywhere, `.github/scripts/*.{mjs,js,sh}`,
   workflows, `package.json` scripts; C#: `.cs` of the five test and source roots, `.sh`/`.ps1`/`.py` everywhere, JS in the
   script folders, the `src_vs_code/src/test/` helpers, workflows, `owner-blind` in scripts through the mounted classifier);
   where each runs (§ 3); the local commands; § 8's sentence; the `docker.yml` exclusion and why.
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
`:77`). The sentence for the `docs.yml` comment, § 7 and the PR, written from D2 at the pin:

> The shipped Node guard (conventions `37b9aa5`) reads one line's spellings, as table D2 of conventions
> `todo/PLAN_F30_folding_reader.md` lists them by file kind. In `.mjs .cjs .js .ts` it joins `+`, `.concat('a', 'b')`
> and `['a', 'b'].join(<literal>)` (spaces around the operator; a literal in its own parentheses) and decodes `\uXXXX`,
> `\u{…}`, `\xXX` and a one-character class `[T]`. In `.sh` and workflow files it joins a word's touching pieces and
> decodes `\xXX`, `\uXXXX` and octal inside `$'…'`. In `.ps1` it joins `+` and a binary `-join`. It does not join a
> template nested in a hole, a literal in an expression hole, a unary `-join` or a comment between operands, and it does
> not read an unquoted `.sh` or yaml word with no quote in it, an extensionless script, any other file kind, or a name built
> through a variable, across lines or at run time. So this repository's zero for `legacy-name` and `owner-blind` is zero
> for the guard's listed spellings, in the files its `node` profile reads; the `.cs` files, the harness folders and the
> test helpers are the C# guard's, which folds `.cs` only.

## 9. What is NOT in E2.5

- The product scripts' own temp handling. **Side findings, todos, not built:** `install.sh:63` keeps its temp file when
  `fetch` fails (`die` exits before `:66`'s `rm -f`); `deploy/restore.sh:102` keeps its staging folder when a step between
  `:103` and `:117` fails (its EXIT trap is `rollback`, which does not remove it). `restore-archive.sh:61` is clean (its
  `rollback` calls `cleanup`).
- I16, the ShellCheck of the two smoke scripts and their tests in CI: a todo.
- N20 (the janitor and bash 3.2), N21 (the flaky Windows dry run): conventions follow-ups.
- The template's raw-string reading (`CallerIdentityTests.cs:196`, E2.3 part 3b): a note for E3 (N24), not an op here.
- A `raw-temp` reading of `${TMPDIR…}` (N6), a `mktemp` reading in workflows for the Node guard (N23), the split spellings
  in the harness folders (N22, Q9): the conventions repository's or the template's.
- F16, F9, F31; the branch protection of the Windows clients leg (Q10).
- The feature review of E2 (the parent's row F): after the merge.
- New notes for the stories' *Notes for the parent*, written by S3.3: **N22** — a split legacy spelling in
  `src_vs_code/scripts/*.cjs` or `src_minimalapi_server/scripts/*.cjs` is read by neither guard (the `node` profile does
  not discover those folders; the C# copy folds `.cs` only; measured). **N23** — the shipped Node guard reads `mktemp` in
  `.sh` only (`leftovers-check.mjs:376`), so a workflow `run:` block with `mktemp` is no finding; the C# template reads it
  (`ci-server.yml:375`, measured). **N24** — the template's raw-string limit, carried from E2.3.

## 10. Open questions, each with options and a recommendation

Each goes to the coordinator before the plan gate. **Epoch 8 has used entry 8.1: an answer marked CHANGE would be entry
8.2 and the eighth full stop.** "In doubt, it is a change" (`common/plan-change-control.md`), so the coordinator decides
each "reads as no change" below.

- **Q1 — the order against creds #328, and where the two command lines go.** #328 (draft) renames `<mount>` to
  `.agents/conventions`, cuts `CLAUDE.md` to an adapter and moves its text into `.agents/PROJECT.md`, adds Node 22 and the
  mount's `npm ci` to `docs.yml`, and edits `LeftoversGuardFiles.cs`, `LeftoversGuardScripts.cs`, `LeftoversGuardTokens.cs`
  and `template-manifest.json` — files S1 also changes. It is based on `9916836`, before #329, so it must merge `main`
  anyway. (A) #328 first: E2.5 merges `main` after it, uses `.agents/conventions`, drops its own Node and `npm ci` steps in
  `docs.yml`, and puts its two lines in `.agents/PROJECT.md`. (B) E2.5 first: #328 carries E2.5's new paths when it merges
  `main`. (C) build both now, and the second to merge renames. *Recommended:* (C), with the paths behind `<mount>` so the
  rename is mechanical, and the two lines in the file that holds the project's *Commands* at merge time. Reads as no
  change: the stories name `CLAUDE.md` because it held the commands; #328 moves the same text by its own approved plan.
- **Q2 — the wrapper's folding allowance (E2.5.S1's list, D7).** Measured: `leftovers.cjs` spells the word nowhere but
  its exempt marker, and the copy folds `.cs` only (`IsFolded`, `LeftoversGuard.cs`), so the allowance changes no
  answer. (A) not built, said on the PR and in N22's note: in doubt **CHANGE** (an item of a story dropped). (B) built as
  written, a fifth entry with its op on the pin (`LeftoversGuardTests.cs:647-655`) and a comment that it has no effect at
  the pin: no change. *Recommended:* (B), to keep epoch 8 open; the coordinator may prefer (A) and count it.
- **Q3 — `AgentRelayTests.cs:38`, `:39`, `:278`** (C#-only `raw-temp`: `/tmp` literals that create nothing; E2.3 left
  them "for E2.5's guard"). (A) a marker above each (§ 6) and `ClientSitesScanTests` emptied (S2.3). (B) rewrite the
  asserts so no `/tmp` literal is in the test: it hides the product's real default from the reader. *Recommended:* (A).
  Reads as no change: D7 names "the expected ones", E2.3's record assigns these three to E2.5, and sc. 1 needs zero.
- **Q4 — `ci-server.yml:375`, `work="$(mktemp -d)"` in the nginx config step** (C#-only; came with #326 after the plan).
  (A) `work="$RUNNER_TEMP/nginx-config-test"; mkdir -p "$work"` (job-scoped by the detail's § 7, no finding in either
  guard, the trap stays). (B) a marker. (C) `owned_dir`. *Recommended:* (A). Reads as no change by E2.4's precedent for
  `entrypoint.test.sh` (its part 2d: a site of the planned kind that arrived after the inventory).
- **Q5 — row E2.5-b's check.** The parent's check is "`git grep` for the old leaf names → 0". Measured: 2
  (`mcp-listen-smoke.sh:46`, `version-smoke.sh:73`), both in the GIVEN-root branch that E2.4's approved brief (§ 3.1
  item 2) keeps; E2.4's part 2 (difference 2) recorded it. (A) the check reads: no leaf under the machine's temp root
  (`git grep -n 'TMPDIR:-/tmp' -- '*.sh'` → only `owned.sh:293`), and the two names only in their given-root branch.
  (B) the two lines change too: **CHANGE** (E2.4's kept design). *Recommended:* (A); reads as no change (the condition
  holds; the check's text predates E2.4's brief). Report it to the parent.
- **Q6 — sc. 6's last break-it.** The stories expect "`.claude/rules/shared` de-initialised — the shipped guard's `token`
  finding naming the mount". The shipped guard lives in the mount, so it cannot start: `node <missing file>` ends with
  exit 1 (`Cannot find module`), and the `docs.yml` step is red at the start, not with a `token` finding. The C# half
  holds (the copied `A_missing_rule_file_is_a_finding_because_an_uninitialised_submodule_registers_nothing` and
  `Without_the_mounted_classifier_the_script_half_is_a_finding_naming_the_cause`). *Recommended:* record what happens;
  reads as no change (the outcome "red, naming the cause" holds).
- **Q7 — which jobs install the mount's modules.** (A) all three that run the unit suite (`ci-extension.yml`,
  `sonarcloud.yml`, the `release.yml` extension job), with the `workflowMount` rule. (B) only the required
  `ci-extension.yml` job; the guard tests keep skipping under coverage and on a tag. *Recommended:* (A). Not a change
  (E2.4 brief § 5 gives the install to E2.5).
- **Q8 — sc. 1's RED.** The stories: "the shipped guard's 62 findings … re-run on the branch's base". Measured with the
  pinned guards on `a52fde1`: Node 64, C# 84; on `6e08071`: 5 and 10. *Recommended:* the PR quotes both pairs, the base
  pair as sc. 1's RED and the HEAD pair as the RED of the switch-on. Not a change (a re-measurement at the pin, as epoch
  8's rule asks).
- **Q9 — split spellings in the harness folders.** Measured: neither guard reads `'testsTo' + 'Delete-…'` in
  `src_vs_code/scripts/x.cjs`. (A) state it as a limit (§ 7 part 6, the PR, N22). (B) the C# copy folds JavaScript in the
  script folders: an op beyond the permitted kinds and the template's code, **CHANGE**. (C) a wider `node` profile in
  conventions: **CHANGE** (N14 asked for none). *Recommended:* (A).
- **Q10 — the Windows clients leg is not a required check** (`.github/branch-protection.json`), while sc. 1 says "green on
  the three OS legs". (A) the PR head's Windows leg is observed green before the merge, as for E2.3 and E2.4.
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
- Q2 (B): the fifth allowance entry is built as written, with its op on the pin and a comment that it has no effect at
  the pin (the copy folds `.cs` only). Building what the story lists satisfies the plan as written; dropping it would be
  the change.
- Q3 (A): a marker above each of the three lines, and `ClientSitesScanTests`' expected list emptied.
- Q4 (A): `work="$RUNNER_TEMP/nginx-config-test"; mkdir -p "$work"`, the trap kept. A site of the planned kind that
  arrived after the inventory, as E2.4's part 2d did for `entrypoint.test.sh`.
- Q5 (A): the check is restated as measured (no leaf under the machine's temp root; the two names only in their
  given-root branch). Reported to the parent with the E2.5 entry.
- Q6: what really happens is recorded (the step is red at the start, naming the missing module); the outcome "red,
  naming the cause" holds.
- Q7 (A): all three jobs that run the unit suite install the mount's modules, with the `workflowMount` rule.
- Q8: the PR quotes both pairs (base 64/84 as sc. 1's RED; head 5/10 as the switch-on's RED).
- Q9 (A): a limit, stated in § 7 part 6, on the PR and as note N22.
- Q10 (A): the Windows leg is observed green on the PR head before the merge; it is not made required.
- Q11 (A): one todo line each, not built.
- Q12: built (S1.3), with its reason in the manifest; it carries out D7.

## 11. Differences from the plan, found by this brief

Each is in a question above: the C#-only findings (Q3, Q4); the wrapper allowance with no effect (Q2); E2.5-b's check
(Q5); sc. 6's de-initialised mount (Q6); sc. 1's numbers (Q8); the harness folders read by neither guard (Q9); the
Windows leg not required (Q10); the `.ts` op (Q12); the #328 overlap and the place of the command lines (Q1). Plain
facts, not questions: the stories' anchors moved (`module_tests.md:146` → before `:125`; `architecture.md:366` → `:374`);
`leftoversGuardFixtures.test.ts` holds only the F30 plants, because E2.4 built the `docker.yml` facts in
`dockerSmokeLeftovers.test.ts`; D7's expected markers for the three helpers already exist, and two of D7's expected
markers have no finding to clear (§ 6); the second helper folder and the two path constants were done by E2.3 (its
part 1, difference 1).

## 12. Risks, growth, commands, Definition of Done

**Risks.** (1) The C# guard walks the file system, not git: an untracked `.sh`, `.cs` or helper `.ts` in a person's
checkout is read, so a local run can be red where CI is green. The failure message names the file; a person moves the
file. (2) The repository guard now runs in the release jobs on six runners, `windows-11-arm` among them, on the next
`cli-v*` or `mcp-v*` tag; the classifier through `node` has not run there. (3) #328 and E2.5 touch the same files (Q1).

**Growth.** None that stays. The empty-repository step's owned folder lives under `RUNNER_TEMP` and its trap removes it;
`LeftoversGuardCredsTests`' trees are `OwnedScope` folders removed by the test; `leftoversGuardFixtures.test.ts` scans text
in memory.

```bash
npm ci --ignore-scripts --prefix .claude/rules/shared
node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"
node .claude/rules/shared/tools/sweeper-scan.mjs --root .
node .claude/rules/shared/tools/plan-lifecycle.mjs
node .github/scripts/public-hygiene.mjs
# C#: build the service-defaults test project by name (Release, -m:4, lowered), then
./src_service_defaults/tests/bin/Release/net10.0/CredsForDevs.ServiceDefaults.Tests --filter-namespace "CredsForDevs.Tests.Leftovers"
./src_cli/tests/bin/Release/net10.0/CredsCli.Tests          # the three markers of Q3 change only comments
cd src_vs_code && npm test
```

- [ ] Rows 1–23 of § 1 each have their evidence line on the PR; Q1–Q12 answered by the coordinator before the plan gate.
- [ ] S1.1, S1.4, S2.1, S2.3, S2.4, S2.5, S2.6: each RED seen once and quoted, then GREEN; S2.7 recorded.
- [ ] The Node guard on the head: `clean (<n> files).`; the empty-repository step green; `This_repository_passes_the_guard`
      green on ubuntu and macOS (required) and observed green on Windows; the guard-reading Node tests run, not skip.
- [ ] `sweeper-scan` `none found` on the head; `plan-lifecycle` and public hygiene green; actionlint green.
- [ ] `module_tests.md` § *Test leftovers*, `architecture.md:374` and the two command lines written and true at the head.
- [ ] The E2.5 build record, N22–N24, the merge-condition records of the five PRs, the status line and the README row.
- [ ] A `review_plan` round on this brief reached `proceed` before the first code commit; a `review_code` round and an
      Opus review per story before the merge.
