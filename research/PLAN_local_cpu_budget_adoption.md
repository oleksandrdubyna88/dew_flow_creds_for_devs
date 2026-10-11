# PLAN — local test runs here take at most 8 workers, at lowered CPU priority

> Status: **IMPLEMENTED, 2026-10-11.** Scope: `src_vs_code/package.json` scripts, a new
> `src_vs_code/scripts/lower-priority.mjs`, one root `xunit.runner.json` copied into the five xUnit v3 test
> projects' output by `Directory.Build.props`, `deploy/restore-archive-itest.sh`, one new node test, and every
> doc that shows a local build or test command. Deviations: see *Changes after the plan round* — the docs
> scope widened to every README and module doc, `--disable-build-servers` on every documented build (a
> warm normal-priority compiler server did the compiling otherwise), `nice 10` under Git Bash (19 is the
> Windows Idle class there), and the pin requires an integer from 1 to 8. The exact 8 that RAISED a small CI
> runner was fixed the same day: see *Follow-up 2026-10-11: the caps never raise* (the conventions rule
> was corrected in its #60). Open tail: the two WSL harnesses' inner `dotnet build` (owed
> `nice -n 19 … -m:4 --disable-build-servers` once the branch rewriting them lands).
>
> Related docs: the shared rule [local-cpu-budget.md](../.claude/rules/shared/common/local-cpu-budget.md),
> its rollout plan `todo/PLAN_local_cpu_budget.md` in the conventions repository (the creds_for_devs row),
> [module_tests.md](module_tests.md).

## The symptom

The shared rules at the pinned `release` (791b25e8, conventions #59) add `common.local-cpu-budget`:
every local test or build run sets at most 8 workers and runs at lowered CPU priority, and CI is
exempt. Nothing here sets a pool size today:

- `src_vs_code/package.json:57` — `"test": "npm run compile && node --test \"out/test/*.test.js\""`.
  Node sizes its pool from the machine (`os.availableParallelism() - 1`, 23 on the 24-thread
  workstation), at normal priority. This is the exact run the rule's record measured.
- The five xUnit v3 test projects have no `xunit.runner.json`. Measured before this change, the
  ServiceDefaults runner prints `Starting: CredsForDevs.ServiceDefaults.Tests (parallel mode =
  collections [24 threads], …)` (`--xunit-diagnostics on --diagnostic`).
- `Directory.Build.props:1-13` sets no test-runner configuration; no test project has one of its own.
- No test pins the `test` script or any runner argument (searched `src_vs_code/src/test/*.ts` for
  `scripts`); so the rule's "a test that pins the runner's arguments pins this too" needs a new test.

## Inventory of local entry points, and the decision for each

| Entry point | Workers today | Change |
|---|---|---|
| `src_vs_code/package.json:57` `test` | 23 here | `npm run compile && node --import ./scripts/lower-priority.mjs --test --test-concurrency=8 "out/test/*.test.js"` (the plan's exact text) |
| `src_vs_code/package.json:58-61,69,72-76` the eleven `itest:*` | 1 (one node process driving real binaries) | each `node scripts/X.cjs` becomes `node --import ./scripts/lower-priority.mjs scripts/X.cjs` — lowered, and every binary it starts inherits |
| `src_vs_code/package.json:78` `itest:all` (`scripts/run-itests.mjs`, harnesses one after another) | 1 | the same preload, so the runner and every harness it spawns run lowered. `run-itests.mjs` itself is not edited (another branch is editing `scripts/*`) |
| `src_vs_code/scripts/lower-priority.mjs` | — | NEW: a verbatim copy of `tools/templates/lower-priority-preload.mjs`, with only `MOUNT` changed to `new URL("../../.claude/rules/shared/", import.meta.url)` |
| the five xUnit projects (`src_broker_client/tests/BrokerClient.Tests.csproj`, `src_cli/tests/CredsCli.Tests.csproj`, `src_mcp/tests/CredsMcp.Tests.csproj`, `src_minimalapi_server/tests/CredVaultServer.Tests.csproj`, `src_service_defaults/tests/CredsForDevs.ServiceDefaults.Tests.csproj`) | 24 threads | ONE root `xunit.runner.json` (`"maxParallelThreads": 8`), linked into every project with `IsTestProject == true` by an `ItemGroup` in `Directory.Build.props` (`None`, `Link="xunit.runner.json"`, `CopyToOutputDirectory="PreserveNewest"`). One file, so the five cannot drift apart. Item conditions are evaluated after every property, so `IsTestProject` set in the `.csproj` is seen |
| the test executables, run by hand | — | the documented commands (CLAUDE.md, README, module_tests) run them ONE AFTER ANOTHER through `node .claude/rules/shared/tools/low-priority.mjs <exe>` — the cap is per run |
| documented `dotnet build` (`CLAUDE.md:40`, `README.md:296`, `research/module_tests.md:1076`) | MSBuild default | `-m:4` (csharp/dotnet-build.md), and through `low-priority.mjs` |
| `deploy/restore-archive-itest.sh` (bash, a docker shim, runs in `ci · server` too) | 1 | a guarded re-exec under `nice -n 19` when `CI` is unset — the DoD's "nice -n 19 in a POSIX-only script"; CI is untouched by the guard |
| the `.http` suite (`http/README.md:74`, `research/module_tests.md:1089`) | 1 (httpyac, sequential) | the documented local command goes through `low-priority.mjs`; the stale `cd http && node http-run.mjs` line in module_tests is corrected to the shared tool |
| `compile`, `typecheck`, `lint`, `bundle`, `icon*`, `contract*`, `ratchet` | 1 process each (tsc, eslint without `--concurrency`, esbuild for ~1 s) | **not changed.** They start no worker pool; the rule's own example (`npm run compile && node --import … --test`) leaves the compile step unlowered. Decision recorded, see below |
| `deploy/acme-test/run.sh` | docker compose | **not changed**: its work runs inside containers the Docker daemon starts, which neither `nice` nor the tool can reach, and it starts no pool |
| WSL harnesses' inner `dotnet build` (`scripts/creds-mcp-wsl-itest.cjs:128`, `scripts/wsl-agent-relay-itest.cjs:106`) | MSBuild default, inside the WSL VM | **open tail, not this PR.** Those exact lines are being rewritten on another open branch (E5 of `PLAN_wsl_bridge_outlives_its_client.md`); a Windows-side BelowNormal does not reach processes in the WSL VM, so the fix is `nice -n 19 dotnet build -m:4 --disable-build-servers` in the new code, after that branch lands |

**CI stays as it is.** `ci-extension.yml:34` checks out without `submodules:`, so the mount is an empty
folder there and `CI` is set: the preload lowers nothing and says nothing (the template's own tests pin
that case). No workflow file changes.

**Recorded, not changed:** `--test-concurrency=8` and `"maxParallelThreads": 8` are exact values, not
`min(8, default)`. On a 4-vCPU hosted runner they RAISE CI's parallelism (node 3 → 8, xUnit 4 → 8);
the rule's §3 says "a no-op on a runner with 8 or fewer cores". This plan follows the rule's text (one
configuration everywhere) and CI must simply stay green; the inaccuracy goes back to the conventions
repository as feedback rather than as a CI-only branch here.

## Decisions the consultant could not settle

The question consultant answered `none_available` (no row switched on). Decided by the rule's text:

1. Scope is runners and test harnesses; single-process build steps are not wrapped (reason above).
2. Exact 8 everywhere, CI included (reason above).
3. The WSL inner builds are an open tail (reason above).

## Changes after the plan round

- **Wider docs scope (coordinator, from a CodeRabbit finding deferred on #217).** Every local build and
  test command that `CLAUDE.md`, a README or a module doc shows follows the rule: `-m:4` for builds,
  executables one after another, lowered through `low-priority.mjs` or the npm script that preloads it.
  Added: `src_cli/README.md`, `src_minimalapi_server/README.md`, `research/module_server.md`,
  `research/module_extension.md` (and the `tree-perf-bench.cjs` header it quotes), the one-file
  `node --test out/test/<file>.js` commands in `module_tests.md`, and the local server start in
  `http/README.md`.
- **Git Bash maps `nice 19` to the Windows Idle class** — measured: a child under `nice -n 19` reads
  priority class `Idle`, `os.getPriority` 19; `nice -n 10` reads 10 (BelowNormal). The rule forbids Idle,
  so the bash guard uses 10 under MSYS/Cygwin and 19 elsewhere.
- **A trap the owner's rollout measured:** a `xunit.runner.json` that is not copied to the output leaves
  the runner at its default. The pin test therefore asserts the copying item, and the proof reads the
  runner's effective value, not the file.

- **The cadence consultation (before the code round)** found three things; verified each:
  - a lowered `dotnet build` hands compiling to a warm `VBCSCompiler` — observed one at `Normal` while the
    lowered builds ran. Every documented build (and the `.http` suite's `dotnet run`) now carries
    `--disable-build-servers`; a lowered build with it is green (7 s for one test project);
  - the pin accepted `0` and `-1`, which xUnit reads as "one per CPU" and "unlimited". The pin now
    requires an integer from 1 to 8, for `--test-concurrency` too; watched red for `0`, `-1`, `8.5`,
    `"8"` and `--test-concurrency=0`, green for `8`;
  - it proposed running the template comparison in `docs.yml`, which checks the submodule out. Not done:
    this change must not touch CI (the coordinator's constraint); local runs with the mount catch drift.

## Build order

1. This plan → coai plan round → `proceed`.
2. RED: `src_vs_code/src/test/localCpuBudget.test.ts` against the current `package.json`.
3. `scripts/lower-priority.mjs` (template copy), `package.json` scripts → GREEN.
4. Break-it: drop `--test-concurrency=8` from the `test` script → RED again; restore.
5. `xunit.runner.json` + `Directory.Build.props`; build with `-m:4`; prove the runner reads it.
6. `deploy/restore-archive-itest.sh` guard; docs (`research/module_tests.md`, `CLAUDE.md`,
   `README.md`, `http/README.md`).
7. Full local runs, lowered: `npm test`, typecheck, lint; every test executable one after another;
   `plan-lifecycle.mjs`, `pin-check.mjs`.
8. Rebase onto `origin/main` once the pin-bump PR (#217) merges, code round, PR, CI, review threads,
   merge; promote this plan to `research/`.

## Test plan

- **`localCpuBudget.test.ts`** (node:test, `vscode`-free):
  - the `test` script runs `node --import ./scripts/lower-priority.mjs --test` with
    `--test-concurrency=N`, `N ≤ 8`, the preload BEFORE `--test`;
  - every `itest:*` script's node invocation carries the same preload;
  - `scripts/lower-priority.mjs` has exactly one `MOUNT` line, and it resolves to
    `<repo>/.claude/rules/shared/` — checked without the mount, so it holds in CI;
  - where the mount is present, the file equals `tools/templates/lower-priority-preload.mjs` with only
    the `MOUNT` line replaced (line endings normalised). Where it is absent (CI, an uninitialised
    clone) this one case SKIPS and says why — a pin bump that changes the template turns it red locally,
    which is the rule's "a change to the template ships to every copy";
  - the root `xunit.runner.json` says `maxParallelThreads` ≤ 8 and `Directory.Build.props` links it into
    test projects.
  - RED against today's `package.json` (message recorded), GREEN after, RED again with the cap removed.
- **The xUnit runner reads the file:** each of the five executables' `Starting:` line under
  `--xunit-diagnostics on` must say `[8 threads]` (it says `[24 threads]` before). Recorded in
  `module_tests.md`.
- **The preload lowers locally:** `npm test` prints no `NOT lowered` notice with the mount initialised;
  one `node --import ./scripts/lower-priority.mjs -e "…os.getPriority(0)"` prints 10 (BelowNormal).
- Full suites green: `npm test` (lowered), every xUnit executable one after another. A wall-clock
  deadline failure seen only lowered on a saturated machine is re-run at both priorities under the same
  load before anything is debugged (rule §2).

## Definition of Done

- [ ] Every local test entry point in the inventory sets ≤ 8 workers and runs lowered, or is recorded
      above with the reason it is not.
- [ ] The `test` script is the plan's exact text; the preload is the template with only `MOUNT` changed.
- [ ] The five xUnit runners print `[8 threads]`.
- [ ] `localCpuBudget.test.ts` watched RED, GREEN, RED.
- [ ] No workflow changed; CI green, the SonarCloud gate included.
- [ ] `module_tests.md`, `CLAUDE.md`, `README.md`, `http/README.md` state the lowered commands.
- [ ] `plan-lifecycle.mjs` and `pin-check.mjs` clean; this plan promoted with its deviations.

## Follow-up 2026-10-11: the caps never raise

The conventions rule was corrected (dew_flow_conventions #60, `release` 03428e2; the pin bump here is #222):
every worker-count switch is EXACT, so a bare 8 RAISES a runner whose own default is lower. `npm test` runs in
CI (`ci-extension.yml`, `release.yml`) on 4-vCPU runners, where node's default is 3 and xUnit's is 4; the
first version above gave both 8. Two changes:

- `npm test` → `npm run compile && node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/*.test.js"`.
  The new runner starts `node --test --test-concurrency=min(8, CPUs - 1)`, node's own default wherever that is
  at most 8, and leaves with the child's code, 128 + the signal number, or 1 when the spawn failed. The preload
  lowers the runner; the `node --test` child inherits the priority. The runner needs no mount, so CI runs it
  (the preload lowers nothing there). Its shape follows the conventions repository's own `tools/run-tests.mjs`.
- `Directory.Build.props`: the copy of the root `xunit.runner.json` carries `Condition="'$(CI)' != 'true'"`, so
  a CI build does not copy it and xUnit keeps its own default there. Locally nothing changed.

Already right, not changed: `deploy/restore-archive-itest.sh` uses `nice 10` under Git Bash, and every
documented lowered build carries `--disable-build-servers`.

`localCpuBudget.test.ts` was watched RED first, 4 failures, each naming the real symptom:

- the script: `the test script must preload the lowering module and start scripts/run-tests.mjs: node --import
  ./scripts/lower-priority.mjs --test --test-concurrency=8 "out/test/*.test.js"`;
- the two runner cases: `ERR_MODULE_NOT_FOUND: Cannot find module '…\src_vs_code\scripts\run-tests.mjs'`;
- the xUnit case: `the copy of xunit.runner.json must be skipped when CI=true, so CI keeps its own thread count`.

Then GREEN: 7 passed with the mount. Break-it on the product code, each restored afterwards:

- `threads` for `threads - 1` in the runner turned the cap case red.
- The `Condition` removed turned the xUnit case red.
- The runner's `CAP` set to 6 turned the cap case red. The pin ties the runner's `CAP` and the xUnit
  `maxParallelThreads` bound to one `MAX_WORKERS`, so lowering the budget needs both limits to follow (a code-round
  finding).

A timeout on the runner's `spawnSync` was proposed in the code round and not taken. The previous script had none
either, CI jobs have their own timeouts, and a fixed limit on a suite that takes 380-400 s on a loaded machine would
fail healthy runs.
