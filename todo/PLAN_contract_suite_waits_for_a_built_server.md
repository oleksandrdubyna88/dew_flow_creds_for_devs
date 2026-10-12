# PLAN — the contract suite waits for a BUILT server, and says so when there is none

> Status: **plan only, 2026-10-12.** Scope: `.github/workflows/ci-server.yml` (job `contract`), one new
> script `.github/scripts/start-server-and-wait.sh` and its self-test `start-server-and-wait.test.sh`,
> `http/README.md`, `research/module_tests.md`. No product code changes.
>
> Related docs: [module_tests.md](../research/module_tests.md), [http/README.md](../http/README.md).

## 1. Symptom (measured 2026-10-12)

The required check *http · contract suite* failed on PR #240, a test-only extension change — run
`38270198889`, attempt 1, job `114882281637`. The re-run (job `114888973674`) passed.

- The step `Run it` (`ci-server.yml:135-155`) starts the server with
  `dotnet run --project src_minimalapi_server/src -c Release &` (`ci-server.yml:145`). `dotnet run` BUILDS
  first, so the wait below covers a cold Release build plus the start.
- The wait is `for _ in $(seq 1 30); do curl … /api/health && break; sleep 2; done`
  (`ci-server.yml:146-149`): at most ~60 s, and **it never fails** — when the server has not answered, the
  loop simply ends and the step goes on.
- `http-run.mjs` then sent 185 requests and reported `370 check(s), 370 failed`, every one
  `connect ECONNREFUSED 127.0.0.1:5099`, followed by `backup-targets-live.cjs`.
- The server was not broken. Its own lines (`Now listening on: http://127.0.0.1:5099`) arrived at
  15:32:28.47, **67.3 s** after the step started (15:31:21.13) and seven seconds AFTER the suite had already
  failed (15:32:21). The real cause — a slow cold build — was hidden behind 370 misleading failures.

### How close every run was (measured from the job logs, step start → `Now listening`)

| runs | build + start (s) |
|---|---|
| 18 green runs of `ci-server.yml`, 2026-10-12 10:07–15:15 | 11.2, 17.7, 18.5, 19.2, 19.3, 19.8, 21.0, 21.4, 24.9, 26.0, 26.4, 27.3, 28.5, 31.9, 33.4, 41.1, 41.4, 48.6 |
| run 38270198889, re-run (passed) | 54.4 |
| run 38270198889, attempt 1 (failed) | **67.3** |

Median ≈ 26 s, max of the green ones 54.4 s. The build dominates: the server's first log line
(`runtime: .NET …`) to `Now listening` is 0.08–0.38 s in every one of those runs. A 60 s bound over a
build was always going to be crossed by a slow runner.

## 2. Cause

Two defects in one step, and the second is the one that cost the day:

1. **The bound covers the wrong thing.** `dotnet run` compiles before it starts, so the health wait is a
   wait on the compiler (10–67 s), not on the server (< 1 s after its first line).
2. **A missed bound is not a failure.** The loop ends silently; nothing checks that the server is up and
   nothing checks that it is still alive. A server that exits at once (a refused start exits **78** with a
   Fatal line since #232, `research/PLAN_server_startup_refusal_is_logged.md`) would read the same way: 370
   ECONNREFUSED and the reason buried above them in the interleaved log.

Sibling sites, checked: `docker.yml:76-90` (the image smoke) waits on Docker's health status and DOES fail
(`never became healthy` + `docker logs`), so it is honest; `http/README.md:63-79` is the local recipe of the
same start (by hand, `&`, no wait); `backup-targets-live.cjs:93-109` already exits 3 *environment* when
nothing answers — it is only the `.http` run that turns "no server" into 370 contract failures.

## 3. The change

### 3.1 `.github/scripts/start-server-and-wait.sh <health-url> <timeout-s> -- <command…>`

Same shape as `.github/scripts/mcp-listen-smoke.sh` (a script, so a developer can run the same thing, with
its own `*.test.sh`). It:

- starts `<command…>` in the background with stdin from `/dev/null` and stdout+stderr into a log file
  (`$START_SERVER_LOG`, else `${RUNNER_TEMP:-${TMPDIR:-/tmp}}/start-server-<pid>.log`), and records the pid
  of the process it started;
- polls `<health-url>` with `curl` (connect timeout 2 s, max 5 s per probe, every
  `${START_SERVER_POLL_SECONDS:-1}` s) until it answers **2xx** or `<timeout-s>` has passed;
- if the process **exits** first: fails at once with `the server exited with code N before it answered
  <url>` and the last 40 lines of its log;
- on the deadline: stops ONLY the pid it started (TERM, then KILL after 5 s) and fails with one sentence —
  `the server did not answer 2xx on <url> within N s (last answer: <code | no connection>)` — plus the log
  tail;
- on success: leaves the server running, prints its pid and log path, and writes `pid=` / `log=` to
  `$GITHUB_OUTPUT` when that is set, for the later stop step;
- exit codes: 0 up · 1 not up (exited or timed out) · 2 usage.

It never kills anything by name; the only pid it signals is `$!`.

### 3.2 `ci-server.yml`, job `contract`

1. **Self-test the start script** (`.github/scripts/start-server-and-wait.test.sh`) — before anything is
   built, as `ci-clients.yml:74-75` runs the listen-smoke self-test.
2. **Build the server** — `dotnet build src_minimalapi_server/src/CredVaultServer.csproj -c Release`, the
   flags the other CI builds use (`ci-server.yml:58`, `ci-clients.yml:89-92`; CI owns its runner, so no
   `-m`, and `Directory.Build.rsp` keeps `-nr:false`). Its time is now its own step's time, bounded only by
   the job's `timeout-minutes: 30`.
3. **Start the server** (`id: server`) — the same environment as today, through the script:
   `start-server-and-wait.sh http://127.0.0.1:5099/api/health 60 -- dotnet run --project
   src_minimalapi_server/src -c Release --no-build`. 60 s for a start that takes < 1 s after its first line
   and finished the build+start within 54.4 s on 19 of 20 measured runs: the deadline is a ceiling on a
   broken start, not a guess at a build.
4. **Run the suite** — `http-run.mjs`, then `backup-targets-live.cjs`, unchanged. It runs only when the
   start step succeeded (the default `success()`), so "no server" can no longer become 370 contract failures.
5. **Stop the server and show its log** (`if: always()`, when `steps.server.outputs.pid` is set) — TERM to
   that pid only, wait up to 15 s, then print the log. Its output used to be interleaved in the job log;
   now it is in a file, and this step puts it back where a reader of a failed run looks.

The push path filter gains `.github/scripts/start-server-and-wait*.sh`. The deployment job's pinned
shellcheck (`ci-server.yml:188-207`) gains the two new scripts, so they are linted by the same
`koalaman/shellcheck:v0.11.0` as the operator scripts — the actionlint job lints `run:` blocks only.

### 3.3 Docs

`http/README.md` §Running it: build first, start through the script, and `kill <pid>` at the end.
`research/module_tests.md`: a section for the start script and its self-test, and the contract-suite line
names the build/start split. `research/README.md` gains the promoted plan's row.

## 4. Build order

1. The self-test, first, against a stand-in that is the OLD inline loop (start in background, 30 × 2 s
   curl, exit 0) — RED on case (a).
2. The script — GREEN.
3. The fix removed (the deadline branch made to return 0 like the old loop) — RED again; restored.
4. Workflow steps, shellcheck lines, path filter.
5. Docs; plan promotion.

## 5. Test plan

`start-server-and-wait.test.sh` (bash, node and curl only; its scratch folder is `mktemp -d` and removed by
the test itself). The stand-ins are one node file with a mode argument, on a free random loopback port:

| case | stand-in | expected |
|---|---|---|
| a | never listens | exit 1 within deadline (3 s) + 6 s, `did not answer 2xx … within 3 s`, the stand-in's log line, the stand-in no longer running |
| b | prints a `FTL … exited: code 78, reason startupRefused` line and exits 78 at once | exit 1 in < 5 s although the deadline is 30 s, `exited with code 78`, the Fatal line in the output |
| c | starts listening (200) after 2 s | exit 0, `pid=` in `$GITHUB_OUTPUT`, that pid alive; the test then stops that pid |
| d | answers 500 from the start | exit 1, but only after the 4 s deadline (it kept waiting), `last answer: 500` |
| e | no `--` | exit 2, usage line |

Local: Git Bash on Windows (`node $LP bash .github/scripts/start-server-and-wait.test.sh`) — no WSL
runs, so nothing is deleted inside WSL. CI: ubuntu, in the `contract` job. Plus the real thing: the PR's own
contract job must pass through the new script, and its step times are recorded in the promotion.

Also shown, for the record: the OLD loop against stand-in (a) exits **0**.

Lint: shellcheck v0.11.0 (the pinned image) over both scripts; actionlint over the workflows with
shellcheck present; `node .github/scripts/public-hygiene.mjs` clean.

## 6. Definition of Done

- [ ] `start-server-and-wait.sh` + self-test; cases a–e pass locally and in CI.
- [ ] RED (old loop passes case a) → GREEN → RED with the fix removed, each observed.
- [ ] `contract` job: build step, start step through the script with a 60 s deadline, suite gated on it,
      stop step that signals only the recorded pid and prints the log.
- [ ] shellcheck (pinned) and actionlint (with shellcheck) clean; public-hygiene clean.
- [ ] `http/README.md`, `research/module_tests.md` updated; plan promoted with `IMPLEMENTED <date>`,
      `research/README.md` row, `plan-lifecycle.mjs` clean.
- [ ] The PR's contract job passes through the new script; build and start step times recorded.
