# PLAN — Test leftovers, E2.2 brief: the Node harness lifecycle

> Status: **brief only, nothing built yet, 2026-11-07; the coordinator's answers to Q1–Q9 are in § 6.** Scope: the build brief of epic E2.2 of
> [PLAN_test_leftovers_E2.md](PLAN_test_leftovers_E2.md) (§ *Epics* → E2.2, § S2's harness half). Branch
> `feat/test-leftovers-e2.2`, cut from `main` `ccf2e9f`; E2.1 is merged as #294 at `834c91b`; the mount is release
> `37b9aa5`. Brief by Opus; code by a Sonnet coder; review by Opus. This brief changes no decision of the stories
> document. Where the code at HEAD disagrees with it, § *Integration findings* records the difference for the parent.

**The epic's goal (E2.2, unchanged).** `npm run itest:all` and every harness, the server's included, make only owned
folders and stubs. Each harness removes them on every exit path. The `itest:all` runner sweeps both roots at start and
propagates the run's record. There is NO harness-wide end audit, because a harness's children may still be ending (D4).

Sources, read for this brief: the stories document (§ *Revision* rows 7–9, § *Goal*, D1–D9, S2, § *Test plan*, § *DoD*,
§ *E2.1 build record* parts 1–9, § *Epics* E2.2); the parent `dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md`
at `origin/main` `e444c1b` (§ *Epoch 3* item 4, § *Epoch 6* items 3 and 8, § *Epoch 7* items 1, 3 and 8); the mounted
rule `.claude/rules/shared/common/test-leftovers.md` and its detail; the code at `ccf2e9f`. Every `file:line` below was
read at `ccf2e9f`.

## 1. The parent's table, filled

Each row is a merge condition of E2.2's pull request: the parent's E2 rows that apply (§ *Epoch 6* item 3), each
Done-when item of E2.2, each suite × OS cell E2.2 touches, and the guard evidence run. The last column is the one
§ *Epoch 7* item 8.1 adds. A row with "—" in the implementation or check column is **unmapped**: it is an open design
decision (§ 6), raised before the plan gate.

| # | Condition | Implementation (file:line at HEAD) | Invocations covered | Executable acceptance check | What the check prepares or substitutes, and what real-run behaviour it does not prove |
|---|---|---|---|---|---|
| 1 | **E2 (c)** — the barrier is open on every machine that runs these tests | `dew_flow_conventions · research/security/machines.md`: the WSL machine, the owner's scan (conventions #136: none found, 266 files read); the owner's Windows machine, the owner's statement (#124) | the operator's WSL machine; hosted runners need no record | Met, nothing more for E2.2. On the PR head: `node .claude/rules/shared/tools/sweeper-scan.mjs --root .` → `none found`. Measured by this brief at `ccf2e9f`: `none found (1536 file(s) read)` | The rescan reads this checkout only. It does not prove that no sweeper appeared elsewhere on the machine after the owner's scan. It does not cover a machine that is not recorded |
| 2 | **E2 (d)** — the one-time hand clean-up of the old names E2.2 migrates, recorded per machine | A person's record on the PR, in the shape of `[E2.1 byhand 4]`. Names: `testsToDelete-ait-*`, `testsToDelete-sshd-*` (`ssh-agent-itest.cjs:76`, `:483`, `:595`); `creds-itest-*`, `creds-cli-itest-*`, `creds-mcp-gone-*`, `creds-mcp-itest-*`, `creds-git-itest-*`, `cvbk-itest-*`; the stub files `creds-*-vscode-stub*.cjs`, `cred-ssh-vscode-stub.cjs` | the WSL machine (harnesses run there by hand); the owner's Windows machine does not test creds (owner, 2026-11-04) and is recorded as "not cleaned, not needed"; CI VMs end with the job | `find <root> -mindepth 1 -maxdepth 1 -name '<pattern>'` over `/tmp`, `/var/tmp`, `/dev/shm`, `$XDG_RUNTIME_DIR`, once per pattern, before and after; each path removed by its exact name only on the rule of `[E2.1 byhand 4]`, or kept with a reason. A search by this brief's author (2026-11-07 11:21, read-only): **0** entries of these names in the four roots | A search by name at one moment. It is a search, not a proof (§ *Epoch 6* item 8.1). It does not see a root that a different `TMPDIR` named, or the WSL harnesses' run folders (out of scope, row 13) |
| 3 | **Done-when 1** — the harness half of sc. 10, RED first: the old-name entries one run leaves, then zero after | By hand, per harness (§ 3.4). Automated beside it: a syntax-tree scan of the harness files (row 9) | each harness alias; `itest:all`; `tree-perf-bench` direct | Before the migration: each harness run with `TMPDIR`, `TEMP` and `TMP` set to a private SHORT folder; count new entries there and in `/tmp` (the socket root). After: 0 old-name entries and 0 `testsToDelete-<owner>-creds-*` entries. Expected RED, from reading (§ 3.4): **to be measured by the coder's RED** | A private `TMPDIR` substitutes for the machine's temp root, as E2.1 did. It does not prove a run in the real root, where other runs write at the same time. A by-hand count is a search. Linux only (rows 11, 12) |
| 4 | **Done-when 2** — every CI harness step is green with the mount fetched first | `ci-extension.yml:42-44` (fetched by E2.1) before the steps `:90`, `:97`, `:114`, `:126`, `:158`, `:164`; NEW: the same step in `ci-server.yml` job `build-test` (`:41-81`) before `:81`; recommended: `actions/setup-node` 22.x there too (Q5) | `typecheck · test · package` (required); `build · test` (required) | `workflowMount.test.ts`, extended: a job that runs a harness (`itest:`, `run-itests.mjs`, `-itest.cjs`, `tree-perf-bench`) fetches the mount first. RED today: `ci-server.yml:build-test`. Then both required checks green on the PR head | The workflow test reads text; it proves the step's place, not that the job ran. CI runs each harness by its alias: no runner, no sweep and no `TESTSTODELETE_RUN`, so CI does not exercise the `itest:all` record or sweep. Linux only |
| 5 | **Done-when 3** — the guard evidence run recorded | the shipped guard: `node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"` | the files the `node` profile reads | Run on the PR head; quote the list on the PR. Measured by this brief at `ccf2e9f`: **16 findings, exit 1** (9 `raw-temp` in shell, 6 in `docker.yml`, `commandParse.test.ts:40`). Expected after E2.2: the same 16 | **This run proves nothing about E2.2's sites.** The `node` profile does not read `src_vs_code/scripts/*.cjs` or `src_minimalapi_server/scripts/` (measured: 0 findings there, although `ssh-agent-itest.cjs:76` holds a legacy literal today). Rows 9 and 10 are the checks of the harness files; E2.5's C# guard is the whole-tree one |
| 6 | **E2.2.S1** — `itest:all` sweeps both roots at start, never with its exit code | `run-itests.mjs` (new code before the compile at `:165`); reuse `rootsOf` (`run-tests.mjs:113-115`, exported) and the sweep wiring `sweepFor`/`sweepAll`/`loadReferenceSweep` (`run-tests.mjs:121-141`, `:345-354`, not exported today, Q4) | `npm run itest:all` (`package.json:78`) only | A runner test with a `sweep` seam: one call per canonical root, before the first harness; a thrown sweep is one line and the harnesses' exit code. A second test with the REAL sweep in private roots (the shape of `leftoversRunnerSweep.test.ts`): a dead, old `creds` folder collected on POSIX; a live one kept; on Windows `unverified:` and nothing removed | The real-sweep test prepares its folders with a probe seam that calls a pid dead and a clock 11 minutes on. **Ownership trace (§ *Epoch 7* 8.1):** one folder made the natural way — a `node -e` child loads the wrapper under the runner's exported record and calls `ownedDir` — is read by the real sweep with the real probe and the real `isMine` while the record's process lives: `live`, kept. On Linux the natural owner is the caller's uid, so `isMine` holds. On Windows the Node sweep decides nothing (F16): it lists `unverified:`; a killed Windows run's folders wait for E2.3's C# sweep or a person (elevated: a person only, § *Goal*) |
| 7 | **E2.2.S1** — the run's record is exported once to every harness | `run-itests.mjs:114-118` (the `spawn` options gain `env: { ...process.env, TESTSTODELETE_RUN: record }`, the record held once as a string) | `itest:all` | A runner test with a `spawn` seam: every harness child's environment holds `TESTSTODELETE_RUN` equal to the held string; an ambient `TESTSTODELETE_RUN` is not passed on (E2.1 deviation 7). RED today: the key is absent | A seam stands in for the child. A real child's claim is traced in row 6 |
| 8 | **E2.2.S1** — the timeout ends the harness's WHOLE tree | `run-itests.mjs:130-133` (`child.kill()` ends the direct child only) → `processTree.mjs` `startInOwnTree` (`:90-94`), `killWholeTree` (`:102-105`), `endTree` (`:401-412`), plus signal forwarding (`run-tests.mjs:306-319`, Q4) | `itest:all` | A fixture harness starts a grandchild (`node -e 'setInterval(() => {}, 1000)'`, `stdio: 'ignore'`), prints its pid and hangs; a 2 s timeout seam; after the runner returns, the grandchild is dead and the summary says `killed`. RED today on Linux: the grandchild is alive | POSIX: the group and the survivor scan, as E2.1 proved. **Windows: unmapped for "the same job"** — the job supervisor does not fit the runner's streamed, parsed output (finding F4, Q1). macOS: the scan answers `no-scan`; the runner can only say so in one line. The fixture's grandchild stands in for a real `sshd -d` or `creds-mcp` child |
| 9 | **E2.2.S2, S3** — no harness makes a temp path of its own | the ten harness files and `backup-archive-itest.cjs` (§ 3); the one exempt site is the wrapper (`leftovers.cjs:46-47`) | every invocation of every harness (§ 2) | Extend `tempSiteScan.ts` (`discoverSources`, `:62-74`, reads `.ts` only) to `.cjs`, and add a test over `src_vs_code/scripts/` and `src_minimalapi_server/scripts/` with `lib/leftovers.cjs` excluded by reason: zero raw temp calls. RED today: **23 call lines** by `git grep` (§ 3.4); the scan's own count is the coder's RED | The scan reads the syntax tree. It does not prove removal on any path. It does not see a temp path a child process makes (row 12) |
| 10 | **E2.2.S3** — no harness names a folder in a legacy form | `ssh-agent-itest.cjs:76` (`ait`), `:483`, `:595` (`sshd`) | `itest:ssh-agent`, CI `:158`, `itest:all` on Windows | A test in the shape of `leftoversSites.test.ts:90-99` over the scripts folders: no `testsTo`+`Delete-ait-` and no `…-sshd-` (the needle split, with its exemption line). RED today: 3 | A text search for two spellings. It does not prove the new names are owner-form; row 9 and the wrapper do |
| 11 | **E2.2.S2, S3** — every exit path removes what the harness made | § 3.2, § 3.3 per harness; the exit pattern of § 3.1 | every invocation (§ 2) | Success and natural failure: by hand in sc. 10. Paths with a natural trigger, by hand RED first (§ 3.4: a missing binary, no `git` on `PATH`, no server, `BENCH_OUT` at an empty folder). `.catch`, an in-`main` `process.exit`, a signal: **—** unless the exit pattern is one shared, tested module (Q2) | **Partly unmapped.** Without Q2's module, the `.catch` paths of `agent-broker`, `git-transport`, `masked-run`, `tree-perf-bench`, `ssh-agent` (`:89`, `:757-760`) and the signal paths of all harnesses have no executable check. SIGKILL is never handled: the folder stays claimed, and the next sweep collects it on POSIX after 10 minutes |
| 12 | **E2.2.S2** — a child that makes temp paths gets the owned folder as `TMPDIR`, `TEMP`, `TMP` | the spawns: `agent-broker-itest.cjs:143`, `creds-cli-itest.cjs:75-81`, `creds-mcp-itest.cjs:220`, `:361`, `git-transport-itest.cjs:56-58`, `ssh-agent-itest.cjs:65-71` and `itestSshd.cjs:16`, `backup-archive-itest.cjs:71` | every invocation | sc. 10 with a private `TMPDIR`: no new entry from a child. Which children make temp paths: **to be measured by the coder's RED** | A private `TMPDIR` reaches only a child that reads it. A child that uses a fixed path, or `GetTempPath` on Windows without `TEMP`/`TMP`, is not seen. Linux only |
| 13 | **Invocation inventory** (§ *Epoch 3* item 4; § *Epoch 6* 8.2 names the two WSL harnesses) | § 2 of this brief, copied to the PR | every workflow job, `package.json` script, runner and documented command | `git grep -nE "itest|backup-archive-itest|tree-perf-bench|run-itests" -- .github package.json '*.md'` and the `package.json` scripts list; a reviewer compares them with § 2 | A reviewer's reading. No site here drops a prefix because a run folder contains it: every site gets its own owner-form folder. So the inventory's containment question does not apply. The WSL run folders stay out of scope (§ 5) |
| 14 | **Suite × OS: Linux** | `ci-extension.yml` `build-test` (`ubuntu-latest`, `:28`): six harnesses; `ci-server.yml` `build-test` (`:43`): the backup harness | the six aliases; `node src_minimalapi_server/scripts/backup-archive-itest.cjs` | Both required jobs green on the PR head | A green job proves the success path on Ubuntu. It does not prove `itest:all`, a kill, or another OS |
| 15 | **Suite × OS: macOS** | — (no CI job runs a harness on macOS) | by hand only | **—, unmapped** (Q7) | `creds-cli-itest.cjs:211-213` asserts a broker socket that `socketPathFor` refuses past 100 bytes (`brokerListeners.ts:33`, `:55`). An owner-form folder under macOS's `TMPDIR` would pass that limit (finding F5). Nothing runs this on macOS today |
| 16 | **Suite × OS: Windows** | — (no CI job runs a harness on Windows; `itest:all` runs `ssh-agent`, `mcp-wsl`, `wsl-relay` only there, `run-itests.mjs:55-57`, `:179-181`) | by hand only; the owner said on 2026-11-04 "temporarily we do not test on Windows" | **—, unmapped** (Q7) | No Windows harness run happens during E2.2. Node collects nothing on Windows (F16). The Windows tree kill of row 8 is unproven |
| 17 | **DoD** — `research/module_tests.md` says what each harness leaves after a kill now | the table `module_tests.md:190-200` and § *Running them all at once* `:208-240` (the stories cite `:130-146`, now moved, F1) | — | a reviewer reads it | Documentation. It proves nothing about behaviour |

## 2. The invocation inventory

Each harness, every invocation that reaches it, the root it gets, and who gives the owner, the cleanup and the sweep.
"Record" is the claim's owner record: the runner's `TESTSTODELETE_RUN` when one is set and live (`owned.mjs:438-447`),
else the harness's own pid. The temp root is `tempRoot()` (the reference's, `os.tmpdir()`); the socket root is
`shortSocketRoot()` (`leftovers.cjs:45-48`: `/tmp` on Linux and macOS, the temp root on Windows).

| Harness · site | Invocations (`file:line`) | Root it gets | Owner · cleanup · sweep |
|---|---|---|---|
| `agent-broker-itest.cjs` · stub `:21`, `storageDir` `:78` | `itest:agent` (`package.json:59`); CI `ci-extension.yml:90`; `itest:all` (`run-itests.mjs:41`); direct (header `:4`) | temp root; `storageDir` holds a broker socket (`credsAgentServer.ts:405-409`) → socket root | record · the harness scope · `itest:all`, `npm test`, xUnit (E2.3), janitor |
| `git-transport-itest.cjs` · stub `:23`, `root` `:48` | `itest:git` (`:69`); CI `:97`; `itest:all` (`:42`) | temp root | the same |
| `creds-cli-itest.cjs` · stub `:25`, `storageDir` `:89` | `itest:cli` (`:72`); CI `:114`; `itest:all` (`:43`) | socket root (the socket check `:211-213`) | the same |
| `creds-mcp-itest.cjs` · stub `:44`; folders `:301`, `:452`, `:600`, `:716`, `:743`, `:935`, `:1286` | `itest:mcp` (`:73`); CI `:126`; `itest:all` (`:44`) | socket root for the five broker `storageDir`s (`:301`, `:452`, `:600`, `:743`, `:1286`); temp root for `:716`, `:935` (an endpoint folder, no listener) | the same |
| `masked-run-itest.cjs` · stub `:19` (per pid); `cwd` `:79` | `itest:masked-run` (`:61`); CI `:164`; `itest:all` (`:45`) | temp root | the same |
| `server-transport-itest.cjs` · stub `:22` | `itest:server` (`:58`); `itest:all -- --with-server` (`:58-68`) | temp root | the same |
| `tree-perf-bench.cjs` · stub `:25` | direct only (header `:4-5`, with or without `BENCH_OUT`); no alias, no runner, no CI | temp root | own pid · the scope · the next `npm test` or `itest:all` |
| `creds-mcp-wsl-itest.cjs` · stub `:39` | `itest:mcp-wsl` (`:74`); `itest:all` on Windows (`:56`) | temp root (Windows) | record · the scope, closed in `finish` (`:493-499`) · Node lists only on Windows (F16) |
| `ssh-agent-itest.cjs` · `dir` `:76` (sockets, stub `:279`), `sshdDir` `:483`, `:595` | `itest:ssh-agent` (`:60`); CI `:158`; `itest:all` on Windows only (`run-itests.mjs:55`, `:179-181`) | `dir` → socket root; `sshdDir` → temp root | record or own pid · the scope · as above |
| `backup-archive-itest.cjs` · `tempDir()` `:38-42`, called `:109`, `:112`, `:187` | `itest:backup-archive` (`:76`); CI `ci-server.yml:81`; `itest:all` (`:46-54`); direct (header `:3-4`) | temp root | the same |
| `wsl-agent-relay-itest.cjs` · no temp-root site | `itest:wsl-relay` (`:75`); `itest:all` on Windows (`:57`) | its run folders: `%LOCALAPPDATA%\creds-itest\creds-itest-<run>` (`wslRun.cjs:48-53`, `:110-114`), removed by exact name in `finishRun` (`:206-214`); `~/.cache/creds-itest/<run>`, never deleted by design (`:18-22`) | out of scope (stories, § *Out of scope*); no change |
| `creds-mcp-wsl-itest.cjs` · run folders | as its row above | the same `wslRun.cjs` folders | out of scope; no change |

A direct start (`node scripts/<harness>.cjs`) makes and removes its own scratch through the scope. It does not sweep.
The next runner run or the janitor does (D4, *Where the collection guarantee holds*). No other script under
`src_vs_code/scripts/` or `src_minimalapi_server/scripts/` makes a temp path (`git grep` at `ccf2e9f`: `backup-targets-live.cjs`,
`endpoint-probe-timing.cjs`, `wsl-mcp-client.cjs`, `mcpBinary.cjs`, `wslRun.cjs`, `wslStrays.cjs` hold none).

## 3. The stories

### 3.1 The exit pattern every harness uses

A harness is a script, not a node:test file. So its scope is one module-level `cleanupScope()` (D1, S2), made as the
script's first statement after the `require`s of `node:` modules and of the wrapper. Three facts of the code bind the
pattern:

- `process.exit()` ends the process at once. A `finally` around code that calls it never runs. In-`main` exits exist
  at `agent-broker-itest.cjs:345`, `git-transport-itest.cjs:39`, `:129`, `ssh-agent-itest.cjs:89`, `:253`,
  `masked-run-itest.cjs:154`, `server-transport-itest.cjs:149`.
- `cleanupScope().close()` is async (`owned.mjs:238-246`). It runs the LAST registered callback before its first
  `await`; the others run later. An un-awaited `close()` before `process.exit` removes one folder and leaves the rest.
- No harness handles a signal (`git grep "process.on("` finds none). A SIGINT, SIGTERM or SIGHUP leaves everything.

So the pattern is: `main()` returns its exit code and never calls `process.exit`; one `finish(code)` does
`await scope.close()` and then `process.exit(code)`; `main().then(finish, (error) => { console.error(error); return finish(1); })`;
SIGINT, SIGTERM and SIGHUP call `finish(128 + n)` once (Q3). Anything made at module load moves after the scope:
the stub through `writeStub(scope, '<what>', text)`, and the `require`s of `out/` after it, because `Module._resolveFilename`
must point at the stub first. A throw at load (an `out/` that was not compiled) then happens inside `main`, not before
it. Whether the pattern is one shared module or written in each file is Q2.

### 3.2 E2.2.S1 — `run-itests.mjs`: record, both-root sweep, tree kill, no audit

**Files.** `src_vs_code/scripts/run-itests.mjs`; `scripts/run-tests.mjs` (exports only, Q4);
`.github/workflows/ci-server.yml` (the mount step before `:81`; Q5, Q6); `src_vs_code/src/test/workflowMount.test.ts`;
a new runner test file (`itestRunner.test.ts`, name the coder's) and a fixture harness under `src/test/`.

**What changes.**

1. The script's body (`:71-204`, top-level `await` and `exit()`) becomes an exported `runHarnesses(args, seams)` with an
   `invokedDirectly` guard, as `run-tests.mjs:384-394` does, so a test can drive it. Seams: `spawn`, `sweep`, `roots`,
   `record`, `timeoutMs`, `write`, `confirm`.
2. After the unknown-name refusal (`:76-82`) and before the compile (`:165`): load the wrapper fail-closed (no mount →
   one line naming `git submodule update --init .claude/rules/shared`, no harness started, exit 1); then the start-of-run
   sweep of both roots through the SAME wiring as `run-tests.mjs` (one report line only when something was found; a
   thrown sweep is one line; never the exit code; `token` after the caller's options).
3. The record: `formatOwner(thisOwner())`, held once; every harness spawn (`:114-118`) gets
   `env: { ...process.env, TESTSTODELETE_RUN: record }`.
4. The tree: each harness starts in a tree of its own. On the timeout (`:130-133`) the runner ends the whole tree and
   asks `endTree` whether it ended. A tree not confirmed ended adds one line to that harness's FAIL detail; nothing is
   removed, because there is no audit. POSIX forwards SIGINT, SIGTERM and SIGHUP to the group, as `run-tests.mjs:306-319`.
   Windows: Q1.
5. **No audit (D4, D9 row 1).** Why, in one sentence: a harness's children may still be ending when it exits, and a
   removal by the run's record would remove a folder in use. The header says so.
6. The header (`:1-18`) gains the scope sentence of D4 (a single `itest:*` alias does not sweep) and the Windows sentence
   (Node collects nothing on Windows until F16 closes).

**RED-first tests.** Each fails against today's runner first; the premise is asserted in the test.

| # | Assertion | Premise it checks | RED today |
|---|---|---|---|
| S1.1 | every harness child's `env.TESTSTODELETE_RUN` equals the runner's held record string | the ambient `TESTSTODELETE_RUN` is cleared before the run, so equality cannot come from the parent | the key is absent |
| S1.2 | the `sweep` seam is called once per canonical root (`rootsOf`), and all calls come before the first harness spawn | the two roots differ in the test (a private pair), so "once per root" is two calls | no call |
| S1.3 | a sweep that throws gives one line `run-itests: leftovers sweep failed (…)` and the exit code of the harnesses | the harness fixture exits 0, so a changed code is visible | no line |
| S1.4 | with the REAL sweep in a private root: a dead (probe seam), 11-minute-old `creds` folder is gone on POSIX; a live one and a `conventions` one stay; on Windows the line `unverified:` and both stay | each folder exists before the run (asserted) | nothing is swept |
| S1.5 | the ownership trace of row 6: a natural `ownedDir` from a real `node -e` child under the exported record, read by the real sweep while the record's process lives → kept, reported `live` | the claim text equals the record, and `isMine(claim)` is true on this OS (asserted) | nothing is swept |
| S1.6 | a fixture harness that leaves a grandchild and hangs: after the timeout, the grandchild's pid is not alive, and the summary line says `killed` | the grandchild was alive before the timeout (asserted by its printed pid) | the grandchild is alive (Linux) |
| S1.7 | a fixture harness that leaves a folder claimed with the exported record and exits 0: the runner exits 0, and the folder and its claim still exist | the claim text equals the record | — a pin, not a RED: no audit exists today. Written as a pin, so an audit added later goes red (§ *Epoch 6* 8.1) |
| S1.8 | with the mount absent (a `loadHelpers` seam that throws): one line, no spawn, exit 1 | the spawn seam counts calls | the harnesses run |
| S1.9 | `workflowMount.test.ts`: a job that runs a harness fetches the mount before it | the companion still finds the known jobs (`ci-extension.yml:build-test`, `ci-server.yml:build-test`) | `ci-server.yml:build-test` fails |

**Exit paths of the runner.** Success and failure (`:196-204`); an unknown name (`:76-82`, exit 2, before the sweep);
a failed compile (`:168-171`, exit 1, after the sweep); a harness that cannot spawn (`:137-140`); the timeout
(`:130-133`); a signal to the runner (forwarded on POSIX). None of these removes a folder: the runner owns none.

### 3.3 E2.2.S2 — the extension harnesses' folders and stubs

**Files.** `agent-broker-itest.cjs`, `creds-cli-itest.cjs`, `creds-mcp-itest.cjs`, `creds-mcp-wsl-itest.cjs`,
`git-transport-itest.cjs`, `masked-run-itest.cjs`, `server-transport-itest.cjs`, `tree-perf-bench.cjs` (all in
`src_vs_code/scripts/`); `src/test/tempSiteScan.ts` (discovery of `.cjs`) and a new scan test over the scripts folders.

**What changes, per file.** `<what>` is the old prefix without `creds-` and the trailing `-` (D2); at most five
characters where the folder holds a socket.

| File | Sites today | Change |
|---|---|---|
| `agent-broker-itest.cjs` | stub `:21-41` and `storageDir` `:78` at module load; removed `:343` before `process.exit` `:345`; `.catch` `:346-349` exits without removal | scope first; `writeStub(scope, 'agent-stub', …)`; `storageDir = ownedDir(scope, 'agent', { parent: shortSocketRoot() })` inside `main`; `:343` goes; § 3.1's exit |
| `creds-cli-itest.cjs` | stub `:25`, `storageDir` `:89` at load; never removed; SKIP `return` `:109-113` | the same; `storageDir` under `shortSocketRoot()` with `<what>` `cli`, because `:211-213` asserts its socket (F5) |
| `creds-mcp-itest.cjs` | stub `:44`; leaks `:301` (gone leg; its `finally` `:323-327` disposes the server only), `:743`, `:935`, `:1286`; safe `:452`/`:553`, `:600`/`:613`, `:716`/`:732`; `:1027` removes `title-home` inside `:743`; SKIP `return` `:737-741`; `.catch` `:1493-1500` | every folder through `ownedDir(scope, …)`; the five broker `storageDir`s (`:301`, `:452`, `:600`, `:743`, `:1286`) under `shortSocketRoot()` (`<what>` ≤ 5, e.g. `mcp`); the `rmSync` of the safe sites goes (the scope removes); `:1027` may stay (inside an owned folder) |
| `creds-mcp-wsl-itest.cjs` | stub `:39-56` at load; the exit is `wslStrays.cjs:225` inside `runAndSweep` | scope first; stub through `writeStub`; `finish` (`:497`) awaits `finishRun(dirs)` and then `scope.close()`; `wslStrays.cjs` does not change |
| `git-transport-itest.cjs` | stub `:23`; SKIP `process.exit(0)` `:39` at load; `root` `:48` and `git init --bare` `:50` at load; removed `:127` before `process.exit` `:129`; `.catch` `:130-133` | scope first; the SKIP and `root` move into `main`; `root = ownedDir(scope, 'git')`; `:127` goes; § 3.1's exit; `git`'s environment gets `TMPDIR`/`TEMP`/`TMP` = `root` (`:56-58` passes `options.env`) |
| `masked-run-itest.cjs` | per-pid stub `:19`, removed `:149` on success only; `cwd: os.tmpdir()` `:79` makes nothing | stub through `writeStub`; `cwd` = the stub's owned folder (the child shell then writes nowhere else); `:146-150` goes |
| `server-transport-itest.cjs` | stub `:22` at load; IIFE `:64-150` with NO `.catch` (an unhandled rejection exits 1); `process.exit` `:149` | scope first; stub through `writeStub`; § 3.1's exit, so a rejection also closes the scope |
| `tree-perf-bench.cjs` | stub `:25` at load; `main` `:171` ends by itself; `.catch` `:304-307` | scope first; stub through `writeStub`; § 3.1's exit |

Every child process the harness starts gets `TMPDIR`, `TEMP` and `TMP` set to one of the harness's owned folders (R:89-92).
`writeStub` names the file `stub.js` (`leftovers.cjs:63`); today's stubs are `.cjs` (F10).

**RED-first tests.**

| # | Assertion | Premise it checks | RED today |
|---|---|---|---|
| S2.1 | the scan over `src_vs_code/scripts/` and `src_minimalapi_server/scripts/` finds no raw temp call outside `lib/leftovers.cjs` | the discovery finds the known harness files and more than ten files (a companion, as `leftoversSites.test.ts:38-55`) | 23 call lines by `git grep` (§ 3.4) |
| S2.2 | if Q2 is yes: the shared exit module, driven by fixture scripts, removes the owned folder and its claim after a return, a returned failure code, a throw, a SIGTERM, and a throw at load after the scope exists; after SIGKILL the folder and its claim remain (a pin) | the folder exists before the exit (asserted); the claim names the fixture's record | the pattern does not exist; against an inline `finally` around a `process.exit`, the throw case keeps the folder |
| S2.3 | by hand, RED first, each natural trigger (§ 3.4): the old-name entry appears before, and no entry after | `TMPDIR` is a private, empty, short folder (listed before the run) | the counts of § 3.4 |

**Exit paths each harness must cover** (found in the code above): success; a returned failure count; the SKIP
(`creds-cli:109-113`, `creds-mcp:737-741`, `git:35-40`); `.catch` (`agent:346`, `cli:255`, `mcp:1493`, `git:130`,
`masked:157`, `bench:304`); an unhandled rejection (`server-transport:64-150`); an in-`main` `process.exit` (listed in
§ 3.1); a throw at load (`out/` not compiled; `BENCH_OUT` at an empty folder for the bench); SIGINT, SIGTERM, SIGHUP
(Q3); SIGKILL (left to the sweep).

### 3.4 E2.2.S3 — `ssh-agent-itest`, the server's backup harness, and the proofs

**Files.** `src_vs_code/scripts/ssh-agent-itest.cjs`; `src_minimalapi_server/scripts/backup-archive-itest.cjs`;
the legacy-name scan test; `research/module_tests.md` (`:185-200`, `:208-240`).

**What changes.**

- `ssh-agent-itest.cjs`: `dir` (`:76`) becomes `ownedDir(scope, 'ait', { parent: shortSocketRoot() })` — it holds the
  agent sockets `<dir>/<m|l>/keys/<pid>/agent.sock` (`:74-79`); the longest such path with owner `w4294967295` and a
  ten-digit pid is about 76 bytes, under 103. The stub stays inside `dir` (`:279`). `:89` returns 1 instead of exiting.
  `:245-249` goes (the scope removes). The two `sshdDir` sites (`:483`, `:595`) become `ownedDir(scope, 'sshd')`; the
  order of their `finally` blocks stays (client, then `sshd` by pid, then the folder), but the folder's removal moves to
  a per-section scope closed in that same `finally`, so `sshd` has exited before the removal. § 3.1's exit for `main`.
- `backup-archive-itest.cjs`: `tempDir(tag)` (`:38-42`) becomes `ownedDir(scope, \`backup-${tag}\`)`, required from
  `../../src_vs_code/scripts/lib/leftovers.cjs` (D1); the scope is closed after `:198` and in the `.catch` (`:199-202`);
  the server child (`:71`) gets `TMPDIR`/`TEMP`/`TMP` = the `work` folder. The SKIP (`:100-106`) comes before any folder.
- `module_tests.md`: the table's *Leaves behind if killed* column says "nothing the next sweep does not collect" with the
  sweep's limits (POSIX only; 10 minutes; Windows lists only); § *Running them all at once* names the sweep, the record,
  the tree kill and why there is no audit; the scope sentence of D4.

**RED-first tests.**

| # | Assertion | Premise it checks | RED today |
|---|---|---|---|
| S3.1 | no file under the two scripts folders holds `testsTo`+`Delete-ait-` or `testsTo`+`Delete-sshd-` | the scan reads more than ten files | 3 (`:76`, `:483`, `:595`) |
| S3.2 | by hand: one `itest:backup-archive` run leaves 0 entries in the private `TMPDIR` | the server is built (the run is not a SKIP) | 3 `cvbk-itest-*` folders, by reading (`:109`, `:112`, `:187`, no removal) |
| S3.3 | by hand: an `itest:ssh-agent` run that FAILS leaves nothing | a failure is forced without editing the file (for example `PATH` without `ssh-add`); the failure is in the output | by reading, `dir` is removed at `:247` on a counted failure; a RED exists only for `:89` and `.catch`, which have no natural trigger: **to be found by the coder, else covered only by S2.2** |

**Exit paths.** `ssh-agent`: success and counted failure (`:253`); the parse failure (`:89`); `.catch` (`:757-760`);
each `sshd` section's skip (`:471-482`, `:592-594` with `:606-620`), throw and `finally`; a signal. `backup-archive`: the SKIP; success
and failure (`:198`, natural end); `.catch` (`:199-202`); a signal.

**The harness half of sc. 10, expected from reading** (the coder measures; these are not records). Linux,
`itest:all` default set (`agent`, `git`, `cli`, `mcp`, `masked-run`, `backup-archive`; `ssh-agent`, `mcp-wsl`,
`wsl-relay` are Windows-only there, `server` is opt-in) on a green run: stubs `agent`, `git`, `cli`, `mcp` (4); folders
`creds-cli` 1, `creds-mcp` 4 (`:301`, `:743`, `:935`, `:1286`), backup 3 — **12 entries**. Then, each by its alias:
`server-transport` with no server leaves its stub (1); `tree-perf-bench` its stub (1); `masked-run` 0 on success;
`ssh-agent` 0 on a counted failure. Natural RED triggers for the other paths: `creds-cli` with the CLI not built (SKIP
after `:89`: folder and stub), `git-transport` with no `git` on `PATH` (stub), `BENCH_OUT=<empty folder>` for the bench
(throw at load: stub). The raw temp call lines (`git grep -nE "tmpdir\(|mkdtemp"` over the two scripts folders, without
`lib/leftovers.cjs`): `backup` 1, `agent` 2, `cli` 2, `mcp` 8, `mcp-wsl` 1, `git` 2, `masked` 2, `server` 1, `ssh-agent` 3,
`bench` 1 = **23**.

**The proofs to record on the PR.** sc. 10's harness half (before and after, per invocation); the bench run once; the
guard evidence run (row 5); the barrier rescan (row 1); the hand clean-up (row 2).

## 4. The audit order (§ *Revision* row 9)

E2.2 has no run folder. No harness makes a folder that holds the others, and no fixture disposes anything before an
audit, because `run-itests.mjs` has no audit at all (D4). Each harness folder is its own owned folder, removed by the
harness's scope. The WSL harnesses' run directories (`wslRun.cjs:110-114`) are not owner-form folders, and no audit
reads them. So E5's 4.4 question does not arise in E2.2. If a later change gives a harness a run folder, its brief
plants an orphan claim inside it and shows the RED, as row 9 says.

## 5. What is NOT in E2.2

- **E2.3** — the C# helper and the five xUnit executables; the Windows handoff proof (a Node folder collected by the C#
  sweep); F31 and F29. The `HostProcess` adapter. Nothing in C# changes here.
- **E2.4** — `owned.sh`, the shell scripts, `restore-archive-itest.sh` (`ci-server.yml:271`), the Docker smoke, acme.
- **E2.5** — the two guards switched on, the `docs.yml` step, the exemptions, the C# guard's discovery of
  `src_vs_code/scripts/`.
- The WSL harnesses' run folders (`%LOCALAPPDATA%\creds-itest\…`, `~/.cache/creds-itest/…`): out of scope by the stories
  document; no deletion inside WSL.
- **Side findings, todos, not built here:** `run-itests.mjs:156` reads a skip only as `SKIP — `, but `creds-cli:110`,
  `creds-mcp:738`, `git:38` print `SKIP  ` and `backup:101` prints `SKIP:`, so those skips count as passes; `ssh-agent`
  carries `windows: true` (`run-itests.mjs:55`) although CI runs it on Ubuntu; `server-transport` has no `.catch`.

## 6. Open questions, each with a recommended answer

Each goes to the coordinator before the plan gate. A "yes" that changes the stories document's approach is a plan
change for the parent's ledger; in doubt it counts.

- **Q1 — the Windows tree of `run-itests` (F4).** E2.2.S1 says "the same group / job". On Windows `startInOwnTree` is
  `startInJob`, which inherits stdout or buffers it (`processTree.mjs:70-74`; `proc.mjs:40-58`), while the runner streams
  and parses each harness's output (`run-itests.mjs:121-128`, `:155-161`). *Recommended:* POSIX uses the group and
  `endTree`; Windows keeps the piped `spawn` and ends the tree on the timeout with the reference's `killTree`
  (`taskkill /T /F` from the still-live harness, `proc.mjs:17-31`), with one line that the end is not confirmed
  (`no-handle`). This is a deviation from "the same job"; the coordinator decides whether it is a change.
- **Q2 — one shared exit module or ten copies.** *Recommended:* one small module beside the wrapper (for example
  `scripts/lib/harnessScope.cjs`: scope, `finish`, the signal handlers), tested once by S2.2, used by all eleven files.
  It is a new file outside S2's list, and D1 forbids growing the wrapper itself. Without it, row 11 stays partly unmapped.
- **Q3 — signals.** *Recommended:* yes: SIGINT, SIGTERM and SIGHUP close the scope and exit `128 + n`; SIGKILL is left
  to the sweep. "Every exit path" in the goal reads as this; the stories document does not name signals.
- **Q4 — reuse of the runner's sweep wiring.** *Recommended:* export `sweepFor`, `sweepAll` and `forwardSignals` from
  `run-tests.mjs` (it is safe to import: `:384-394`), and import them in `run-itests.mjs`. No copy, no new file; E2.1's
  tests stay green unchanged.
- **Q5 — Node in `ci-server.yml` `build-test`.** The job has no `setup-node` (`:41-81`); the wrapper `require`s ESM,
  which needs Node 20.19+ or 22.12+. The image's Node is not measured here. *Recommended:* add `actions/setup-node` with
  22.x (the pin `ci-extension.yml:46` uses) and print `node --version` once in the PR's first run.
- **Q6 — `ci-server.yml`'s push filter (`:9-28`).** After E2.2 the backup harness depends on
  `src_vs_code/scripts/lib/leftovers.cjs` and the mount. *Recommended:* add both paths, so a change to either re-runs
  the job on `main`.
- **Q7 — macOS and Windows evidence (rows 15, 16).** *Recommended:* one recorded hosted run on a throwaway branch, in the
  shape of `[E2.1 byhand 6-8]` (the consultants' decision `867ea464` lets it count as by hand): `macos-latest` runs
  `itest:all`'s portable set and prints the longest socket path (the `creds-cli` socket is the length risk); the Windows
  cell stays recorded as not run, with the owner's statement, and the WSL harnesses as not proven.
- **Q8 — sc. 10's RED set.** The stories expect "8 leaking folders + 7 stubs + backup's three + the `ait`/`sshd`
  folders"; `itest:all` on Linux reaches 4 stubs and 8 folders (§ 3.4). *Recommended:* record the RED per invocation
  (the table of § 3.4), not as one `itest:all` number.
- **Q9 — folder mode.** `mkdtempSync` made `0700`; `ownedDir` uses `fs.mkdirSync` (`owned.mjs:659`), so a folder is
  `0755` under umask 022. The test keys in them are random. *Recommended:* accept, as E2.1 did; say so in the PR.

### The coordinator's answers (2026-11-07)

- **Q1 — the same job, with the output read at the end; no deviation.** The reference's `run` (`.claude/rules/shared/tools/lib/proc.mjs`)
  with `containTree: true` and no `stdout` option runs the command under the Windows job AND captures its output; it returns
  `{ code, out, err, timedOut, overflow }`, and its timeout closes the job, so the whole tree ends. On Windows the runner starts
  each harness through it, with the runner's timeout as `timeoutMs`, and parses `out` + `err` after the harness ends, with the
  same `verdictOf`. What changes on Windows only: the output appears when the harness ends, not as it runs, and a harness that
  writes more than the output budget (4 MiB by default) has its tree ended and counts as FAIL with that reason. POSIX keeps the
  piped spawn in its own group and `endTree`. So E2.2.S1's "the same group / job" holds as written, and this is not a plan change.
  A runner test with a `run` seam checks the Windows branch: the timeout reaches the seam as `timeoutMs`, the verdict is read
  from `out`, an overflow is a FAIL line. No Windows run happens in E2.2 (row 16).
- **Q2 — yes**, one shared module beside the wrapper (`scripts/lib/harnessScope.cjs`), tested once by S2.2. It is a new file
  that serves E2.2's own goal; the wrapper itself does not grow (D1).
- **Q3 — yes**: SIGINT, SIGTERM and SIGHUP close the scope and exit `128 + n`; SIGKILL is left to the sweep.
- **Q4 — yes**: export `sweepFor`, `sweepAll` and `forwardSignals` from `run-tests.mjs`; no copy.
- **Q5, Q6 — yes**, as recommended.
- **Q7 — yes**, one recorded hosted macOS run on a throwaway branch; the Windows cell is recorded as not run, with the owner's
  statement of 2026-11-04.
- **Q8 — yes**: sc. 10's RED is recorded per invocation. The stories' "8 + 7 + 3" is the October count; the measured one is the record.
- **Q9 — yes**: accepted, and said in the PR.

With these answers, row 8's Windows cell is mapped (the `run` seam test), and row 11 is mapped by S2.2. Rows 15 and 16 stay
unmapped by design: by hand only, Q7.

## 7. Integration findings

Each is a difference between the stories document and the code at `ccf2e9f`. None is resolved here.

- **F1 — moved anchors.** The CI harness steps are `ci-extension.yml:90`, `:97`, `:114`, `:126`, `:158`, `:164`
  (the stories: `:82`, `:89`, `:106`, `:118`, `:150`, `:156`; E2.1's mount step added eight lines). The harness table of
  `module_tests.md` is `:190-200` under `:185` (the stories: `:130-146`, now E2.1's unit section `:125-183`).
- **F2 — the `sshd` folders are removed in a `finally`.** `ssh-agent-itest.cjs:562-577` and `:600-602` (through
  `removeFolder`, `:623-629`) remove `sshdDir` after the client and `sshd` end, on a throw too. The stories call them
  "last-statement removals" (fragile). At HEAD they are lost only on a kill. The migration does not change: their names
  are legacy.
- **F3 — the stories' harness pattern needs two more things to hold.** "Closed in a `finally` around `main()` AND in the
  `.catch` before `process.exit`" removes nothing on the in-`main` exits of § 3.1, and an un-awaited `close()` removes
  one folder only (`owned.mjs:238-246`). § 3.1 states the fit.
- **F4 — the Windows job does not fit the streaming runner.** See Q1.
- **F5 — `creds-cli`'s folder holds a socket.** `creds-cli-itest.cjs:211-213` asserts the broker socket in `storageDir`;
  `socketPathFor` returns `undefined` past 100 characters (`brokerListeners.ts:33`, `:55`). The stories' facts name
  `ssh-agent`'s `dir` as the harness socket folder, not this one. On macOS, an owner-form `storageDir` under `TMPDIR`
  (about 49 characters) would pass 100, and the check would fail. D2's "≤ 5 characters, under the short root" covers it
  once applied; the other broker `storageDir`s (`agent-broker`, `creds-mcp`) bind a socket with no check, so a long path
  would silently drop it.
- **F6 — `itest:all` never runs `ssh-agent` on Linux** (`run-itests.mjs:55`, `:179-181`), while CI runs it on Ubuntu by
  its alias (`ci-extension.yml:158`). The sweep and record of `itest:all` therefore never reach the `ait`/`sshd` folders
  on Linux. sc. 10's `ait`/`sshd` RED needs the alias (Q8).
- **F7 — the guard evidence run cannot see a harness.** Measured (row 5). The Done-when item stands, but it proves
  nothing about E2.2's sites; rows 9 and 10 carry that proof.
- **F8 — `ci-server.yml` `build-test` has no `setup-node`.** See Q5.
- **F9 — the parent's 8.2 line for E2.2** asks for an invocation line for each WSL harness. § 2 has them; they need no
  change, because no site of theirs is in the temp root.
- **F10 — the stub's file kind.** `writeStub` writes `stub.js` (`leftovers.cjs:63`), not `.cjs`. A `.js` file's module
  kind comes from the nearest `package.json` above the owned folder. The first green run on each OS shows it holds;
  the coder notes it.

## 8. Risks

1. **The Windows tree kill (Q1).** A wrong choice either hides each harness's SKIP line or leaves a harness's
   descendants alive after the timeout. No CI leg observes `run-itests` on Windows.
2. **A missed exit path.** One un-awaited `close()` or one `process.exit` left inside `main` leaks silently. The scan
   (S2.1) does not see it; only S2.2 (with Q2) and the by-hand counts do.
3. **Socket folders on macOS (F5, Q7).** No CI job runs a harness on macOS. A broker folder left under `TMPDIR` fails
   `creds-cli`'s socket check or drops the socket in the others, and nothing catches it before a person runs it there.

## 9. Commands, Definition of Done

```bash
cd src_vs_code && npm run typecheck && npm run lint && npm test
node --import ./scripts/lower-priority.mjs --test out/test/<the new runner test>.test.js
npm run itest:all                                   # Linux default set
npm run itest:ssh-agent; npm run itest:server        # the aliases itest:all does not reach on Linux
node --import ./scripts/lower-priority.mjs scripts/tree-perf-bench.cjs
node ../src_minimalapi_server/scripts/backup-archive-itest.cjs   # the server built
node ../.claude/rules/shared/tools/sweeper-scan.mjs --root ..
node ../.claude/rules/shared/tools/leftovers-check.mjs --repo .. --profile node --token creds --identity "the developer-credentials server and extension"
```

- [ ] Rows 1–17 of § 1 each have their evidence line on the PR; the unmapped rows (11 in part, 15, 16) carry the
      coordinator's answer to Q2 and Q7.
- [ ] S1.1–S1.9, S2.1–S2.3, S3.1–S3.3 RED then GREEN (S1.7 a pin), each RED seen once with the code stashed.
- [ ] sc. 10's harness half recorded per invocation, before and after; the bench run once.
- [ ] Both required CI checks green on the head with the mount; `npm test` green.
- [ ] `module_tests.md` updated (§ 3.4); `run-itests.mjs`'s header carries D4's two sentences.
- [ ] The guard evidence run and the barrier rescan quoted; the hand clean-up recorded per machine.
- [ ] A `review_plan` round on this brief reached `proceed` before the first code commit; a `review_code` round and an
      Opus review before the merge.
