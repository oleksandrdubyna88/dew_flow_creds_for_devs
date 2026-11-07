# PLAN — Test leftovers, E2.4 brief: shell, the Docker smoke, acme (stories S2–S4)

> Status: **brief only, nothing built, 2026-11-07; no plan gate yet.** Scope: the build brief of stories E2.4.S2, S3 and
> S4 of [PLAN_test_leftovers_E2.md](PLAN_test_leftovers_E2.md) (§ *Epics* → E2.4, § S4, D5, D6). E2.4.S1 (`owned.sh`, a
> cornerstone) has its own spec by Fable, [PLAN_test_leftovers_E2.4_S1_spec.md](PLAN_test_leftovers_E2.4_S1_spec.md),
> written beside this brief. This brief uses `owned.sh`'s API as that spec's § 3 fixes it (the stories' § S4 block plus
> `owned_trap`). Branch
> `feat/test-leftovers-e2.4`, cut from `main` `0ae0211` (E2.1 #294, E2.2 #310, E2.3 #311 merged); the mount is release
> `37b9aa5`. Brief by Opus; code by a Sonnet coder; review by Opus. **Epoch 7 of the parent has used its one change
> (entry 7.1). The next accepted change is the seventh full stop.** § 6 marks each answer that would be a change.
> **One question has no answer that is clearly free (Q1, the Docker names against the released guard, measured).** The
> stories' own rule for that case is "stop and report — never resolve the difference in code" (D8, § *Order*); this
> brief reports it and recommends the answer that carries out D5's own decision.
>
> **Revised 2026-11-07 for the parent's epoch 8** (`dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md` § *Epoch 8*,
> approved by reviewers, `Narrowed: no`). The stop came (entry 7.2); epoch 8 is open with no change used. Its item 4 settles
> this brief's open questions: **Q1 is (B)** (item 4.2), with one correction — only the remover's names need unquoting, a
> `-v` argument is unquoted or quoted WHOLE (row E2.4-a); **Q3 as recommended** (item 4.3.1, row E2.4-e); **Q4: (A) is
> ruled out, acme's state goes into labelled NAMED volumes** (item 4.3.2, rows E2.4-f, E2.4-h); Q2, Q5–Q10 as recommended
> (item 4.3.3). The parent's judge cut § 3.2 item 2 and Q1's "the `-v` sources unquoted", and Q4's (A); they are fixed
> forward here by a new commit, never a rewrite. § 1 gains the rows the parent adds (rows 22–25 and the map under the
> table). The stories document's own lines are corrected on creds branch `docs/e2-epoch8` (`d32dcd5`, not yet merged);
> this brief cites it until `main` carries it.

**The stories' goal (E2.4, unchanged).** Every CI/test shell script, the image smoke and the acme probe name, claim and
remove their scratch in the owner form. A failed smoke stays failed and never publishes. Acme's project, labels, state
and teardown are one. **What stays open, said once:** a `kill -9` (or a power cut) runs no trap. What a killed script
leaves is claimed, and the next sweep judges it under rule §4's two keys; on Windows the Node sweep only lists it (F16),
and on an elevated Windows run nothing removes it (F31).

Sources, read for this brief: the stories document (§ *Revision* rows 5, 7, 8; § *Goal*; Facts *CI and the container
smoke*, *`deploy/acme-test/`*, *Shell*; D1–D9; § S4 whole, sc. 1–7; § *Epics* E2.4; the E2.1–E2.3 build records, the E2.3
record's hand-run guard list); the parent `dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md` at `origin/main`
`7d8ad89` (§ *Epoch 6* item 3, the E2 rows and E5's (p); § *Epoch 6* items 4.3 and 8; § *Epoch 7* whole; the ledger,
entry 7.1); the mounted rules `common/test-leftovers.md`, its detail (§3, §5, §7, the carve-out), the janitor's contract,
`planning-docs.md`, `plan-change-control.md`; the mounted tools `tools/janitor.sh`, `tools/lib/leftovers-docker.mjs`,
`tools/lib/leftovers-shell.mjs`, `tools/lib/leftovers-sweep.mjs`; the code at `0ae0211`. Every `file:line` below was read
at `0ae0211`. The cadence consult for this group of epics is `c4fb33b8` (Codex); its three points are settled in § 4.

*Instruction loading:* this repository has no `AGENTS.md` and no `.agents/PROJECT.md`, so the shared resolver answers
`INCOMPLETE — Missing instruction source`. The rules named above were read directly from the mount. Nothing was changed
but this brief and its `todo/README.md` row. Nothing was run but read-only commands: `git`, `find`, the shipped guard
and `sweeper-scan.mjs` from a scratch copy of the mount (with `yaml@2`), and the guard over a scratch repository.

## 1. The parent's table, filled

Each row is a merge condition of E2.4's pull request for S2–S4: the parent's E2 rows that apply (§ *Epoch 6* item 3:
E2 (c), E2 (d), the E2.4 row, the E2.5 N6 row), revision row 5, each scenario S2–S4 own (sc. 1, 2, 4–7), the E2.4
Done-when, each suite × OS cell, and the guard run. Sc. 3 is S1's. The last column is the one § *Epoch 7* item 8.1 adds.
A row with "—" in the implementation or check column is **unmapped**: an open design decision (§ 6).

| # | Condition | Implementation (file:line at HEAD) | Invocations covered | Executable acceptance check | What the check prepares or substitutes, and what real-run behaviour it does not prove |
|---|---|---|---|---|---|
| 1 | **E2 (c)** — the barrier is open on every machine that runs these scripts | `dew_flow_conventions · research/security/machines.md` (WSL: conventions #136; the owner's Windows machine: #124) | the WSL machine; hosted runners need no record | On the PR head: `node .claude/rules/shared/tools/sweeper-scan.mjs --root .` → `none found`. Measured by this brief at `0ae0211`: `none found (1606 file(s) read)` | The rescan reads this checkout only. `owned_remove`'s pattern (S1) is the one new prefix match; the scan must read it as owner-aware |
| 2 | **E2 (d)** — the hand clean-up of E2.4's old names, per machine | A person's record on the PR, in the shape of `[E2.1 byhand 4]`. Names: `creds-mcp-listen-smoke-*`, `creds-version-smoke-*`, `start-server-*.log`, `tmp.*` (bare `mktemp`), `deploy/acme-test/state/` in any checkout, the compose project `cred-vault-acme-test` (containers and network) | WSL: by hand. Hosted runners end with the job. The owner's Windows machine: "not cleaned, not needed" (it does not test creds, 2026-11-04) | `find <root> -mindepth 1 -maxdepth 1 -name '<pattern>'` over `/tmp`, `/var/tmp`, `/dev/shm`, `$XDG_RUNTIME_DIR`, before and after. Measured by this brief (2026-11-07 20:19, read-only): **0** of every name; no `state/` in the main checkout or this worktree; no `docker` binary on this machine, so no compose project can exist here | A search by name at one moment, not a proof. `tmp.*` is any program's name: it is listed, never removed by name |
| 3 | **Parent E2.4 row, first half** — `owned.sh` claims first; the kill-between test | E2.4.S1's spec, § 2 rows 1–15 | bash on three OSes | S1's (sc. 3, T1–T18). Not this brief's | § 7 I4 is a conflict inside S1's spec this brief reports (its Linux collection rows, Q3). *[Settled 2026-11-07, the parent's row E2.4-e: S1's spec § 3 writes `:<start>:<ns>` on Linux.]* |
| 4 | **Parent E2.4 row, second half, and revision row 5** — each script sets its trap before its first fallible step; RED is a stubbed failure before the old trap's position, premise asserted | § 3.1: `owned_dir` (claim → register the EXIT trap → create) replaces each `mktemp`, so no fallible step lies between the folder and its trap | `mcp-listen-smoke.test.sh`, `version-smoke.test.sh` (`ci-clients.yml:87`, `:91`, three OSes); `start-server-and-wait.test.sh` (`ci-server.yml:170`); `restore-archive-itest.sh` (`ci-server.yml:314`) | S2.1–S2.3, S2.6 (§ 3.1). The standing GREEN: each CI step runs its script with `TMPDIR` under `RUNNER_TEMP` and asserts that root empty after (Q6) | The stub (`chmod` exits 1) stands in for a real failure. `start-server-and-wait.test.sh` has NO RED: nothing fallible lies between `:28` and its trap at `:43` (I11), so it gets a positive check only (§ *Epoch 6* item 8.1) |
| 5 | **sc. 4, the off-CI branches** — the two smoke scripts and the server-start default leave nothing in the temp root | `mcp-listen-smoke.sh:35-37`, `version-smoke.sh:30`, `:64-65`, `start-server-and-wait.sh:107` (§ 3.1) | a person's run (no `RUNNER_TEMP`, no explicit root); CI and the release keep `RUNNER_TEMP` (unchanged) | S2.4, S2.5: new cases in the two smoke self-tests and in `start-server-and-wait.test.sh`, in a private `TMPDIR`, `RUNNER_TEMP` unset. RED today: the old-name leaf is left | A private `TMPDIR` stands in for the machine's root. The server-start log is KEPT on purpose (`OWNED_KEEP`): the check reads its claim, not its removal (Q8) |
| 6 | **sc. 4, nine worlds** — `restore-archive-itest.sh` leaves nothing | `restore-archive-itest.sh:44-65` (`world()`, `:45`), the nine calls `:138` … `:239`; the child's `TMPDIR` (Q7) | `ci-server.yml:314` (job `deployment`, ubuntu, NO mount); a person | S2.6: RED by hand once (9 entries in a private `TMPDIR`), then 0; standing in CI as row 4 | The docker binary is the harness's shim (`:67-125`); no container exists. `restore-archive.sh` (product) runs as the child |
| 7 | **sc. 4, the interrupt** — SIGINT mid-run leaves nothing | the EXIT trap `owned_dir` installs | `mcp-listen-smoke.test.sh` by hand, Linux | S2.7: SIGINT to the script's process group mid-run. RED on `main`: its `tmp.*` stays. GREEN: the private root is empty | A signal to the group, as a terminal sends it. A `kill -9` is not covered: row 8 |
| 8 | **Revision row 5: "a kill stays unsolved, and the brief says so"** | — (no trap sees SIGKILL) | every script | none, by design | A killed script leaves a CLAIMED owner-form folder. The next sweep removes it only if its record is judgeable: on Linux that needs `<start>:<ns>` in the record (I4, Q3; **decided 2026-11-07: `owned_owner` writes it on Linux, the parent's row E2.4-e**); on Windows the Node sweep lists `unverified:` and the janitor is a dry run until F9 |
| 9 | **E2.5 N6 row** — `${TMPDIR:-/tmp}` in `.sh` is unseen by the shipped guard | migrated: rows 5's two scripts use `owned_dir` off CI | `mcp-listen-smoke.sh:35`, `version-smoke.sh:30` | `git grep -n 'creds-mcp-listen-smoke-\|creds-version-smoke-'` → 0 after S2 | Mapped by migration, not by detection. `owned.sh` itself keeps a `${TMPDIR:-/tmp}` that no guard sees (N6, a conventions follow-up) |
| 10 | **sc. 1** — the remover runs on every path and never greens a failed smoke | `docker.yml`: the naming step and the remover of D5 (§ 3.2) | `docker.yml` `image` on `workflow_dispatch` (hosted `ubuntu-latest`; it never runs on a pull request, `:15-18`, `:38-42`) | S3.1: throwaway branch, never merged. RED on the old shape; GREEN twice (cv sabotaged; cv-refused sabotaged); the premise run (Q9). Run URLs on the PR | The `if:` of `Log in`/`Publish` is rewritten and `push: false` on the throwaway, so that branch proves `success()`, not the real `if:`. Hosted Docker only (§ 4, point 1) |
| 11 | **sc. 2** — the happy path on the real shape | the PR branch's `docker.yml` | one dispatch on the PR branch | S3.2: green; the listing empty; `Log in`/`Publish` skipped by their own `if:`; `actionlint` green (`ci-server.yml:337-375`) | Nothing is published from a branch; the publish path runs first after the merge, on `main` (risk 3). `Summary` (`:151-160`) writes "Image published" here though nothing was (I15) |
| 12 | **E2.4 Done-when: the guard shows only `commandParse.test.ts:40` and the product scripts** — so D5's names and carve-out must be read as such by the released guard | **—, unmapped** (Q1). Measured: D5's spelling `testsToDelete-${OWNER}-creds-cv-${SMOKE_ID}` is NOT an owner-form name to the guard at `37b9aa5` (`tools/lib/leftovers-shell.mjs:7` wants literal digits), and its quoted remover is not matched (`tools/lib/leftovers-docker.mjs:147-150`) (I2, I3). **[2026-11-07: mapped — Q1 is (B), the parent's item 4.2 and row E2.4-a: § 3.2]** | `.github/workflows/docker.yml` | After Q1: `leftovers-check.mjs --profile node` on the head → exactly 5 findings (row 20) | A text scan. It proves the spelling, not that the remover ran: rows 10, 11 do that |
| 13 | **D5's record** — the owner is the runner worker, `$PPID` of the step's shell | the naming step (§ 3.2); its `ps -o pid=,comm= -p "$PPID"` line | `docker.yml` | The first dispatch's log shows the worker process; the labels carry the record | No reader judges this label in CI: the hosted VM is the collector (D4's recorded deviation). Without `<start>:<ns>` a Linux reader would say `unknown` (I4) |
| 14 | **sc. 5** — acme leaves nothing after a green and after a failing run | `deploy/acme-test/run.sh`, `docker-compose.acme-test.yml` (§ 3.3) | one throwaway hosted `ubuntu-latest` job (Q2) | S4.1: RED on `main`'s `run.sh` (`state/` stays; the second run stops at `:54`, measured); GREEN on the branch: no `state/`, no acme folder or claim, no labelled container, no acme network | A hosted VM stands in for a person's Linux machine (the consultants' `867ea464`). Rootful Docker; ~~the bind mounts on the VM's own disk~~ **the state in named volumes of the project (the parent's item 4.3.2); S4.1 also finds no acme volume by the project's label** |
| 15 | **sc. 6** — acme killed mid-issuance is collected by the next run's janitor sweep; a live run's stack is not touched | `run.sh` step 2 (the janitor `--token creds`); the labels; the claim | the same job (Q2) | S4.2: `kill -9`, wait 11 minutes, run again: the project's containers, network **and named volumes** are gone, **filtered by the compose project's label**, the owned folder and its claim are gone, the run is green; **before the kill, each project volume carries the owner label**. A second run started beside a live first one leaves the first one's stack alone | ~~**The state folder may not be removable** by a non-root janitor on rootful Docker (Q4, I6), and nothing is removed at all unless the record carries `<start>:<ns>` (Q3).~~ **[2026-11-07, the parent's epoch 8: the state is in labelled named volumes, which the janitor removes whole with `docker volume rm` (`janitor.sh:458`, `:618` at `37b9aa5`, the parent's reading), whatever the owners of the files inside (item 4.3.2, row E2.4-f); the record carries `<start>:<ns>` on Linux (Q3 decided, row E2.4-e). To observe on the hosted throwaway BEFORE E2.4's plan gate.]** The second run is kept away by AGE (< 10 min) and by its exact-project teardown, not by the janitor's liveness read (I17) |
| 16 | **sc. 7** — an interrupt at any point cleans up | `run.sh`'s top-of-script traps (D6) | the same job | S4.3 (a)–(c) | Signals sent by the job's shell; no terminal |
| 17 | **Suite × OS: the Windows cells of sc. 5–7** | — | the owner's Windows machine (Git Bash + Docker Desktop) | **not run, stated**: the owner does not test creds on Windows (2026-11-04); the janitor there is a dry run until F9 arms it. The DoD allows "the other OS stated as not run" | The smoke self-tests DO run on `windows-latest` (row 4's standing check). Acme on Windows: nothing is proved |
| 18 | **CI shell checks** — `run.sh` is shellchecked (S1 adds `owned.sh`, `owned.test.sh`) | `ci-server.yml:296-305` (the stories cite `:257-262`, I1) | job `deployment` | the job green on the head | `source` of `owned.sh` needs `-x` or a `# shellcheck source=` line (SC1091), to be measured. The smoke scripts are not shellchecked today (I16) |
| 19 | **Docs** — `.gitignore`, `deploy/README.md`, `architecture.md:363` | `.gitignore:120-121` (the comment and the `state/` line go); `deploy/README.md:247-265` does not describe `state/` (no edit, I1); `research/architecture.md:363` | — | a reviewer reads them | Documentation proves nothing about behaviour |
| 20 | **The shipped Node guard's remaining findings, recorded** | `node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"` | the files the `node` profile reads | Measured by this brief at `0ae0211`: **16 findings** (9 `raw-temp` in shell, 6 in `docker.yml`, `commandParse.test.ts:40`). Expected after E2.4 with Q1's answer B: **5** (`install.sh:63`, `:76`, `restore-archive.sh:61`, `restore.sh:102`, `commandParse.test.ts:40`) | It proves nothing about `.cs` files or `deploy/acme-test/docker-compose.acme-test.yml` (not read) |
| 21 | **The invocation inventory** (§ *Epoch 6* 8.2) | § 2, copied to the PR | every workflow job, release job and person's command | `git grep -n -E "mcp-listen-smoke|version-smoke|start-server-and-wait|restore-archive-itest|acme-test|run\.sh" -- . ':!todo'`; a reviewer compares it with § 2 | A reviewer's reading |
| 22 | **Parent row E2.4-b** — every remover command runs on every path | `docker.yml`'s remover: `shell: bash` on the step (GitHub runs it as `bash --noprofile --norc -eo pipefail {0}`), `\|\| true` on each of the four removals, `if: always()`, `continue-on-error: true` (§ 3.2 item 3) | `docker.yml` `image` | S3.3 (a): a creds test beside `leftoversGuardFixtures.test.ts` reads the step from `docker.yml`, asserts `shell: bash`, and RUNS its body under that shell with a stub `docker` first on `PATH` whose first removal fails: all four removals are called. RED: one line without `\|\| true` | The guard does NOT check it. `continue-on-error` keeps only the job's verdict. Observed by the parent **[M]**: with the stub, 4 removals called, exit 0; without `\|\| true`, 1 removal called, exit 1; B with no `\|\| true`: 0 guard findings |
| 23 | **Parent row E2.4-k** — nothing of the smoke is left after the remover, or the job is red | a check step after the remover, `if: always()`, `shell: bash`, NO `continue-on-error`: `docker ps -a -q --filter "name=^<name>$"` for the two containers, `docker volume ls -q --filter "name=^<name>$"` for the two volumes, each name a literal; any answer → one line naming it, exit 1 (§ 3.2 item 3a) | `docker.yml` `image` | S3.3 (b): the same test runs the body with the stub: a stub that still lists `…-creds-cv-…` → exit 1, RED; nothing listed → exit 0. In S3.1 and S3.2, the step's result is quoted (row E2.4-d) | A stub stands in for Docker; the hosted runs observe the real answer. Observed 2026-11-07 for this brief: the whole `docker.yml` of `0ae0211` with § 3.2's text, scanned by `scanText` of the guard at `37b9aa5`: 0 findings; one check line as `docker inspect <name>`: 1 `docker-run`; the same reader through a loop variable: 0, so the names stay literal |
| 24 | **Parent row E2.4-c** — the owner segment is the runner's uid, checked before any resource exists | the naming step, before *Build*: its FIRST command `[ "$(id -u)" = 1001 ] \|\| exit 1` (§ 3.2 item 1) | `ubuntu-latest` | S3.3 (c): the naming step's first command is the uid check, and the step comes before *Build*. RED: the check removed, or the step moved after *Build*. The first dispatch prints the uid | The guard does not see it (the parent **[M]**: B without the check, 0 findings). **To observe** before the plan gate: uid `1001` in a hosted throwaway run (the parent's build order) |
| 25 | **Parent row E2.4-h** — acme's compose project is the owned folder's name, never a fixed one | `run.sh`: `PROJECT` from `$STATE`'s basename, lower-cased, and from nothing else (§ 3.3 step 3) | `run.sh` | S4.5: a creds test over `run.sh`: `PROJECT` is assigned from `$STATE`'s basename only. RED: `PROJECT=acme` | The guard cannot see it: the value is wholly an expansion. The parent **[M]**: `-p "$PROJECT"` no finding; `-p acme`: `docker-name` |

*[2026-11-07, the parent's epoch 8.]* Rows 22–25 are the parent's rows this table lacked. The other rows of the parent's
item 3 map so: **E2.4-a** → row 12 (now mapped: Q1 is (B)); **E2.4-d** → rows 10 and 11 (each run also quotes row 23's
step, not only "the remover ran"); **E2.4-e** → row 8 and S1's spec § 3; **E2.4-f** → row 15 (now: named volumes); **E2.4-g**
→ S1's T14; **E2.4-i** → row 3; **E2.4-j** → row 4; **E2-d** → row 2.

Unmapped: ~~row 12 (Q1); row 15's state folder and its Linux collection (Q3, Q4) are mapped only once S1 and Q4 answer;~~
**rows 12 and 15 are mapped now: Q1, Q3 and Q4 are decided by the parent's epoch 8 (item 4);** row 17 is "not run", which
the DoD allows.

## 2. The invocation inventory

Every place that starts a script E2.4.S2–S4 change, at `0ae0211`. "Root" is the temp root the script uses there.

| Script | Invocations (`file:line`) | Root there | Mount / Node in that job |
|---|---|---|---|
| `mcp-listen-smoke.test.sh` | `ci-clients.yml:87` (ubuntu, macOS, Windows); a person (header `:5`) | `mktemp -d` today → `owned_dir` | mount `:74-75`, Node `:78-82`, both before `:87` |
| `version-smoke.test.sh` | `ci-clients.yml:91`; a person | as above | as above |
| `mcp-listen-smoke.sh` | `ci-clients.yml:109`, `:225`; `release.yml:705` (`mcp-binaries`, six runners); its self-test with the explicit root `$work` (`:50`); a person | `RUNNER_TEMP` in every workflow; `$work` in the self-test; `${TMPDIR:-/tmp}` only for a person | release: mount `:642`, Node `:646` |
| `version-smoke.sh` | `ci-clients.yml:223-224`; `release.yml:430` (`cli-binaries`), `:712`; its self-test (`:53`, root `$work`); a person | as above | release: mount `:364`, Node `:368` |
| `start-server-and-wait.test.sh` | `ci-server.yml:170` (job `contract`); a person | `mktemp -d` → `owned_dir` | mount `:139`; Node `:152-154` |
| `start-server-and-wait.sh` | `ci-server.yml:215` (`START_SERVER_LOG` `:205`, read back by the stop step `:230-251`); its self-test (`START_SERVER_LOG` set at `:88`, `:174`, `:189`; case e `:156` stops at usage); `http/README.md:84` (a person, no `START_SERVER_LOG`) | CI: `RUNNER_TEMP`; a person: the default → `OWNED_KEEP=1 owned_dir` | — |
| `restore-archive-itest.sh` | `ci-server.yml:314` (job `deployment`); a person (`:4`; `research/module_tests.md:2154`) | `mktemp -d` ×9 → `owned_dir` ×9 | **no mount, no Node** in `deployment` (`:265-314`): `owned.sh` must work there on Linux without either (I8) |
| `deploy/acme-test/run.sh` | a person only (`deploy/README.md:252`; compose header `:3`); no workflow, not shellchecked | `./state` in the checkout → `owned_dir STATE acme` | a person's clone; the janitor needs the mount (`../../.claude/rules/shared/tools/janitor.sh`) |
| `docker.yml` `image` | `workflow_run` after `ci · server` on a push to `main`; `workflow_dispatch` | the hosted VM | — |

## 3. The stories

**What this brief takes from S1** (its spec's § 3–§ 5): `source .github/scripts/lib/owned.sh` (bash 3.2+, no `set -e`
of its own, works under `set -euo pipefail`); `owned_token`, `owned_owner`; `owned_trap <function>` — the ONE way a
caller with its own cleanup sets its EXIT trap (`'<function>; owned_cleanup'`), before its first `owned_dir` (S1's Q1);
`owned_dir <var> <what>` (claim, register, create; `printf -v` into the caller's variable; never in a subshell, `$( )`,
a pipeline or `&`; `OWNED_KEEP=1` → state `kept`); `owned_remove <dir>`; `owned_cleanup` (idempotent, by state). Each
caller writes ONE line: `owned_dir work smoke-test || exit 1`. On Linux and macOS the helper starts no child and needs no
mount; on Windows it needs Node and the mount once. ~~**One conflict inside S1's spec bears on S4: its record has no
`<start>:<ns>`, while its Linux collection cases expect both readers to collect (§ 7 I4, Q3).**~~ *[2026-11-07, the parent's
epoch 8, row E2.4-e: settled. S1's spec § 3 now writes `:<start>:<ns>` on Linux, and its T13, T15, T16 expect the Linux
collection with it.]*

**One pull request** with the stories as an ordered commit series, S1 → S2 → S3 → S4, each RED then GREEN, one plan gate,
one code gate, one Opus review per story's commit range (Q10, as E2.3's Q1).

### 3.1 E2.4.S2 — the shell scripts (Opus · Sonnet · Opus; owns sc. 4)

**Files.** `.github/scripts/mcp-listen-smoke.test.sh`, `version-smoke.test.sh`, `mcp-listen-smoke.sh`,
`version-smoke.sh`, `start-server-and-wait.sh`, `start-server-and-wait.test.sh`; `deploy/restore-archive-itest.sh`;
`.github/workflows/ci-clients.yml` (the two self-test steps `:86-91`), `ci-server.yml` (`:170`, `:314`).

**What changes.**

1. **The two smoke self-tests.** `mcp-listen-smoke.test.sh:19` and `version-smoke.test.sh:14`: `work="$(mktemp -d)"`
   → `source "$here/lib/owned.sh"` and `owned_dir work smoke-test || exit 1`. The `rm -rf "$work"` at `:72` and `:81`
   goes; `owned_cleanup` (the EXIT trap) removes the folder and its claim on every exit. The smokes keep `$work` as their
   explicit root (`:50`, `:53`), so their per-pid leaf lives inside an owned folder and needs no prefix (rule §1).
2. **The two smoke scripts, off CI.** `mcp-listen-smoke.sh:35-37` and `version-smoke.sh:30`, `:64-65`: an explicit root
   or `RUNNER_TEMP` → unchanged (no finding, R:258). Neither → `source` `owned.sh` THEN, on that branch only (so the
   release jobs gain no dependency), `owned_dir owned smoke || exit 1`, and `dir` is the `pwd -W` form of that folder
   (`$(cd "$owned" && (pwd -W 2>/dev/null || pwd))`, as `:36` does today: .NET on Windows needs the Windows path). The
   `creds-*-smoke-$$` leaf goes on that branch. In `version-smoke.sh` this happens inside the `cli)` branch (`:63-65`),
   in the same shell. Note for the header: a person who wants the log after a failed run passes a root.
3. **`start-server-and-wait.sh:107`.** `START_SERVER_LOG` set → unchanged. Unset → `OWNED_KEEP=1 owned_dir logdir
   server-log || exit 1`, `log="$logdir/server.log"` (claimed, created, never in the cleanup list), because the log is
   handed on (`:130-133`). Its claim names this script's shell, so a sweep collects it once that shell is gone and 10
   minutes have passed. The limit (Q8): the server outlives the script; a sweep after 10 minutes can remove the log of a
   server that still runs. The header (`:15-16`) and `http/README.md:84-90` say so in one sentence.
4. **`start-server-and-wait.test.sh`.** `trap cleanup EXIT` (`:43`) becomes `owned_trap cleanup` (S1's Q1), moved above
   the folder; `owned_dir work start-test || exit 1` replaces `:28`; `cleanup` (`:36-42`) keeps its `kill` loop and drops
   `rm -rf "$work"` (the trap's `owned_cleanup` removes the folder). The comment `:22-23` is rewritten. Every launching
   case already passes `START_SERVER_LOG` (I10).
5. **`restore-archive-itest.sh`.** After the `nice` re-exec (`:27-32`, which keeps the pid), `source
   "$HERE/../.github/scripts/lib/owned.sh"`; in `world()` `WORLD="$(mktemp -d)"` (`:45`) → `owned_dir WORLD world ||
   exit 1`. The first call installs the one EXIT trap; it removes all nine at the end (`:266`, `:269`). `run_restore`
   (`:127-130`) and the direct calls at `:139`, `:142` give the child `TMPDIR="$WORLD"` (rule §2: a child that makes temp
   paths gets an owned folder; `restore-archive.sh:61` does `mktemp -d`) (Q7). `TMPDIR` is never exported by `world()`:
   the next `owned_dir` would nest inside the old world.
6. **CI.** Each of the four CI steps (`ci-clients.yml:87`, `:91`; `ci-server.yml:170`, `:314`) runs its script with
   `TMPDIR="$RUNNER_TEMP/leftovers-<step>"` (made by `mkdir -p` first) and, after it, fails when that root is not empty,
   printing what is there. `RUNNER_TEMP` is job-scoped (R:258), so these lines need no exemption. On Windows the same
   bash step works (`TMPDIR` is honoured by Git Bash and by `owned_dir`).

**Tests, RED first.** Each RED is seen once and quoted on the PR with its premise.

- **S2.1 `mcp-listen-smoke.test.sh`, a failure before the old removal.** By hand: a stub folder whose `chmod` writes a
  marker and exits 1, first on `PATH`; `TMPDIR` a private empty folder. Premise: the marker exists and the script exited
  non-zero before its first case. RED on `main`: the private root holds one `tmp.*`. GREEN: it is empty. (`chmod` is the
  first fallible command after the folder, `:43`; S1's helper calls no `chmod`, its § 3, so the stub hits the script only.)
- **S2.2 `version-smoke.test.sh`**, the same, `chmod` at `:41`.
- **S2.3 `start-server-and-wait.test.sh`, positive only** (I11): one run with a private `TMPDIR` leaves it empty; and
  with `START_SERVER_CASES=g` (the TERM case) too.
- **S2.4 the smoke scripts off CI** — two new cases in EACH smoke self-test, run with `env -u RUNNER_TEMP
  TMPDIR="$work/root"` and no root argument. (a) A failure after the folder is made: in `mcp-listen-smoke.test.sh` a
  binary that is not executable (the check at `mcp-listen-smoke.sh:41` comes after the folder, `:37`), premise: exit 1
  and `not an executable`; in `version-smoke.test.sh` the `cli` kind with `FAKE_LOG=no` (the check at `:33` comes before
  the folder, so a non-executable binary makes nothing), premise: exit 1 and `wrote no log` (`:70`). Then `$work/root` is
  empty. RED today: `creds-mcp-listen-smoke-<pid>`, resp. `creds-version-smoke-<pid>`, is left. (b) A passing run leaves
  `$work/root` empty. On the Windows leg these cases need Node for the token (mount and Node are set up before `:87`).
- **S2.5 the server-start default** — a new case `j` in `start-server-and-wait.test.sh`: `env -u START_SERVER_LOG -u
  RUNNER_TEMP TMPDIR="$work/root"`, the `refused` stand-in. RED today: `$work/root` holds `start-server-*.log`. GREEN: it
  holds exactly one `testsToDelete-<owner>-creds-server-log-<8 hex>` folder and its `.owner` claim, the claim parses with
  the record grammar, and its pid is the script's own and no longer alive (the natural trace of § *Epoch 7* 8.1 through
  the record reader; the sweep's age floor keeps a sweep from reading it within the test).
- **S2.6 nine worlds.** By hand, `TMPDIR` a private folder: RED on `main` 9 `tmp.*` entries after one run (count
  before/after); GREEN 0. Standing: change 6's step on `ci-server.yml:314`.
- **S2.7 the interrupt (sc. 4).** By hand, Linux: `setsid bash .github/scripts/mcp-listen-smoke.test.sh &`, with a
  private `TMPDIR`; after the first `ok` line, `kill -INT -- -<pgid>`. Premise: the run ended before its summary line.
  RED on `main`: its `tmp.*` stays. GREEN: the root is empty (bash runs the EXIT trap on SIGINT; measured here, not
  assumed).
- shellcheck on every changed `.sh` (CI's `deployment` job, row 18; locally see § 9).

**Exit paths** (after S2): a normal end, `exit n`, a failure under `set -e`, SIGINT/SIGTERM/SIGHUP → the EXIT trap removes
every registered folder and claim; a removal that fails → one line, the folder stays prefixed and claimed (S1);
`kill -9` → the claimed folder stays (row 8). `start-server-and-wait.sh`'s kept log: never removed by the script; the next
sweep after its shell is gone.

### 3.2 E2.4.S3 — the Docker smoke carve-out (Opus · Sonnet · Opus; owns sc. 1, 2)

**Files.** `.github/workflows/docker.yml` only.

**What changes (D5, with Q1's answer B, decided by the parent's epoch 8, item 4.2).**

1. **A first step after checkout, *Name the smoke's resources*.** ~~It writes `SMOKE_ID=$(openssl rand -hex 4)` and the
   record `SMOKE_OWNER=u<uid>:<host>@linux:$PPID` to `$GITHUB_ENV`, prints `ps -o pid=,comm= -p "$PPID"`, and fails at once
   when `id -u` is not the uid the names spell (Q1 B: `1001` on `ubuntu-latest`, to be measured by the first dispatch;
   the step prints it).~~ **Its FIRST command is `[ "$(id -u)" = 1001 ] || exit 1`, before *Build* and before any image,
   container or volume (row 24, the parent's row E2.4-c). Then it prints `runner uid: $(id -u)`, writes
   `SMOKE_ID=$(openssl rand -hex 4)` and the record `SMOKE_OWNER=u1001:<host>@linux:$PPID` to `$GITHUB_ENV`, and prints
   `ps -o pid=,comm= -p "$PPID"`.** *[2026-11-07, the parent's epoch 8: the check's position is now fixed, and a creds test
   pins it (S3.3 (c)); uid `1001` is observed in a hosted throwaway run before the plan gate.]* The host normalisation is `sed -E 's/[@:[:space:]]+/-/g'`, not `tr -s '@: \t' '-'`, which also
   squeezes hyphen runs that are part of the host name (I19).
2. **The names** in every command of `:78-117`: `testsToDelete-u1001-creds-cv-${SMOKE_ID}`,
   `…-creds-refused-${SMOKE_ID}`, `…-creds-refused-data-${SMOKE_ID}`, `…-creds-refused-logs-${SMOKE_ID}` (≤ 53 characters).
   `docker run` (both) and both `docker volume create` gain `--label "testsToDelete.owner=$SMOKE_OWNER"`. ~~The `-v`
   sources are written unquoted, as the guard reads them (I3).~~ **A `-v` argument is written unquoted
   (`-v testsToDelete-u1001-creds-refused-data-${SMOKE_ID}:/data`) or quoted WHOLE
   (`-v "testsToDelete-u1001-creds-refused-data-${SMOKE_ID}:/data"`), never with the source alone in quotes
   (`-v "testsToDelete-u1001-creds-refused-data-${SMOKE_ID}":/data` is 1 `docker-run`).** *[2026-11-07, the parent's epoch 8,
   row E2.4-a: I3 was partly wrong. Only the remover's names must be unquoted; the `-v` sources need no other rule than
   this one. Both allowed forms measured: 0 findings.]* The inline removals go: `:92`, `:111`'s `docker rm -f`,
   `:116-117`.
3. **The remover**, after *Smoke-test a refused start* and before *Log in*: as § S4's block (`if: always()`,
   `continue-on-error: true`, **`shell: bash`**, `[ -n "${SMOKE_ID:-}" ] || exit 0`, each of the four removals `|| true`,
   the two listings at the end), with the names written unquoted after `docker rm -f -v` and `docker volume rm` (the
   guard compares that raw text, I3). If actionlint's shellcheck reports SC2086 on them, one `# shellcheck
   disable=SC2086` line in that block, with its reason (to be measured on the head). *[2026-11-07, the parent's epoch 8,
   row E2.4-b: `shell: bash` is written on the step, so the body runs under `bash --noprofile --norc -eo pipefail`; S3.3 (a)
   pins that every removal runs after a failed one.]*
3a. **The check step** *[added 2026-11-07, the parent's epoch 8, row E2.4-k]*, right after the remover: `if: always()`,
   `shell: bash`, NO `continue-on-error`. It can only turn the job red, never green: `Publish` (`success()`) is then
   skipped. Each name is a literal, so a reader verb added there is a guard finding (a loop variable would hide it):

   ```yaml
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

   Observed 2026-11-07 for this brief (`scanText` of the guard at `37b9aa5` on the whole `docker.yml` of `0ae0211` with
   items 1–3a): 0 findings. Counterexamples: the remover's names quoted, 2 `docker-run`; a `-v` source alone in quotes, 1;
   one check line written as `docker inspect <name>`, 1; the same reader through a loop variable, 0. Whether
   `docker volume ls --filter name=` anchors on `^…$` as `docker ps` does is observed by S3.1 (G2), where the two volumes
   must be gone and the check green.
4. `Log in`, `Publish`, `Summary` are untouched.

**Tests.** No local Docker on this machine (wslc only, never Docker): every run below is a hosted dispatch.

- **S3.0 the guard reads it** (before any dispatch): the shipped guard on the head reports no `docker-name` and no
  `docker-run` line for `docker.yml`. RED: the head before S3 (6 findings, row 20).
- **S3.1 sc. 1, on a throwaway branch `tmp/e24-smoke-red`, never merged** (`Log in`/`Publish` `if:` → `github.event_name
  == 'workflow_dispatch'`, `Publish` `push: false`). (P) **Premise run** (Q9): the smoke unsabotaged → `Publish` RUNS
  (not skipped). (R) **RED, old shape** plus one always-run `docker ps -a` step, `cv` sabotaged
  (`Vault__AllowedDomains=` empty): job FAILED, `cv` still listed. (G1) **new shape**, the same sabotage: FAILED, the
  remover RAN, its "left after removal" listing EMPTY, `Publish` **skipped**. (G2) **new shape**, `cv-refused`'s image
  replaced by one that exits 0: FAILED, remover ran, the two volumes gone, listing empty, `Publish` skipped. Each run's
  premise: the failing step's own line (`never became healthy`, resp. `exited 0, expected 78`). Start each with one
  plain `gh workflow run docker.yml --ref tmp/e24-smoke-red`; run URLs on the PR; the branch deleted after.
- **S3.2 sc. 2:** `gh workflow run docker.yml --ref feat/test-leftovers-e2.4`: green, the listing empty, `Log in` and
  `Publish` skipped by their own `if:`. actionlint green on the head.
- *[2026-11-07, the parent's row E2.4-d]* In S3.1 (G1, G2) and S3.2, the result of *Check that nothing of the smoke is
  left* is quoted from each run (green), not only "the remover ran".
- **S3.3 the stories' sc. 8, a creds test** *[added 2026-11-07, the parent's rows E2.4-b, E2.4-k, E2.4-c]* (in
  `src_vs_code/src/test/`, beside `leftoversGuardFixtures.test.ts`; it reads `.github/workflows/docker.yml`): (a) the
  remover step has `shell: bash`; its body RUNS under `bash --noprofile --norc -eo pipefail` with a stub `docker` first on
  `PATH` whose first removal fails → all four removals are called (the stub logs each call). RED: one removal without
  `|| true` → 1 call, exit 1. (b) The check step's body with the stub: still listing `…-creds-cv-…` → exit 1 and one line
  naming it, RED; nothing listed → exit 0. (c) The naming step's FIRST command is the `id -u` check, and the step comes
  before *Build*. RED: the check removed, or the step moved after *Build*. Each RED seen once by hand and quoted.

**Exit paths:** a failed smoke step → later smoke steps skipped, the remover runs (`always()`), `Publish` skipped by
`success()`; a cancelled job → `always()` steps still run; a dead runner → the hosted VM ends (D4's deviation); the
remover's own failure → `continue-on-error`, never the verdict; **a removal that fails and leaves its resource → the check
step fails the job (row 23); a runner whose uid is not `1001` → the naming step fails before anything is made (row 24)**.

### 3.3 E2.4.S4 — acme: project identity, labels, state and teardown together (Opus · Sonnet · Opus; owns sc. 5, 6, 7)

**Files.** `deploy/acme-test/run.sh`, `deploy/acme-test/docker-compose.acme-test.yml`, `.gitignore:120-121`,
`ci-server.yml:300-305` (shellcheck gains `.github/scripts/lib/owned.sh` and `deploy/acme-test/run.sh`),
`research/architecture.md:363` (the smoke line, per § *Epics*; it describes S3's change). `deploy/README.md`: no
edit — it does not describe `state/` (I1).

**What changes (D6, as the stories write it, with the parent's epoch 8 item 4.3.2).** Compose: `name:` (`:19`) goes; an
`x-owned: &owned` block with `labels: { testsToDelete.owner: "${TESTS_TO_DELETE_OWNER:?}" }` merged into each service
and set on `networks.edge`; ~~every `./state/…` source (`:47-48`, `:68-69`, `:97-98`) → `${ACME_STATE:?}/…`~~ **every
`./state/…` source → a NAMED volume of the project, declared under a top-level `volumes:` with the same labels
(`<<: *owned`): `./state/data` (`:47`) → `data`, `./state/logs` (`:48`) → `logs`, `./state/certs/conf` (`:68`, `:97`) →
`certs-conf`, `./state/certs/www` (`:69`, `:98`) → `certs-www`. Compose names them `<project>_<name>`, so each carries the
owned project's owner-form name and the owner label. No bind mount of the state.** *[2026-11-07, the parent's epoch 8,
item 4.3.2, rows E2.4-f, E2.4-h. The parent names the state `certs`, `data`, `logs`; `certs` today is two folders
mounted at two paths (`/etc/letsencrypt`, `/var/www/certbot`), so it becomes two volumes. The same project, the same
label, the same teardown: nothing of 4.3.2 changes.]* `run.sh`, in this order:

1. Right after `set -euo pipefail` and `cd` (`:19-20`): `source ../../.github/scripts/lib/owned.sh`; `export
   TESTS_TO_DELETE_OWNER="$(owned_owner)"`; `STATE=""`, `PROJECT=""`; `cleanup` (skips what is not made yet: `compose -p
   "$PROJECT" … down -v --remove-orphans || true` when `PROJECT` is set, **which removes the named volumes with the
   containers and the network**; ~~`docker run --rm -v "$STATE":/s alpine sh -c
   'rm -rf /s/certs /s/data /s/logs' || true` then~~ `owned_cleanup` when `STATE` is set); `owned_trap cleanup` (D6's `trap
   cleanup EXIT`, in S1's spelling, S1's Q1; ~~the container-side wipe must run BEFORE `owned_cleanup`, so~~ `cleanup` calls
   `owned_cleanup` itself — idempotent), `trap 'exit 130' INT`, `trap 'exit 143' TERM`. *[2026-11-07, the parent's item
   4.3.2: the container-side wipe goes; the state is in named volumes, and `$STATE` holds only files `run.sh` copied out.]*
2. `rc=0; JANITOR_MIN_AGE_MINUTES=10 bash ../../.claude/rules/shared/tools/janitor.sh --token creds || rc=$?`; 0 and 3
   fine; anything else one line (127 also names `git submodule update --init .claude/rules/shared`); the run goes on.
3. `owned_dir STATE acme || exit 1`; the id is the folder's own 8-hex suffix (I9); `PROJECT` is the folder's name with
   the prefix lower-cased through `tr` (bash 3.2 has no `${x,,}`): `teststodelete-<owner>-creds-acme-<id>`, **from
   `$STATE`'s basename and from nothing else: `PROJECT="$(printf '%s' "${STATE##*/}" | tr '[:upper:]' '[:lower:]')"`
   (row 25, the parent's row E2.4-h)**; `COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.acme-test.yml)`;
   ~~`export ACME_STATE="$STATE"`~~ *[2026-11-07: no bind mount reads it any more]*.

`:53` and `:54` go. ~~(`mkdir -p` the four subfolders under `$STATE`); `:56` mounts `$STATE`; `:83`, `:86` read `$STATE/…`.~~
**`:56`'s chown (the app runs as uid 10001) runs after `"${COMPOSE[@]}" create` has made the volumes and before the
first `up`: `docker run --rm -v "${PROJECT}_data:/d" -v "${PROJECT}_logs:/l" alpine chown -R 10001:10001 /d /l`. `:83`
and `:86` ask the `certs-conf` volume through a one-shot container: `docker run --rm -v "${PROJECT}_certs-conf:/s:ro"
alpine test -f /s/live/vaulthost/fullchain.pem`. A file `run.sh` needs to read is copied OUT through the container's
standard output (`docker run --rm -v "${PROJECT}_certs-conf:/s:ro" alpine cat /s/<file> > "$STATE/<file>"`), so every
file in `$STATE` is the user's own and `owned_remove` can delete it. `$STATE` is never mounted into a container: a
container writes root-owned files there (I6).** *[2026-11-07, the parent's epoch 8, item 4.3.2. Read-only check: these
lines and the `PROJECT` line through `scanText('deploy/acme-test/run.sh', …)` of the guard at `37b9aa5`: 0 findings;
`docker compose -p acme up -d`: `docker-name`. To observe on the throwaway of S4.2 (the parent's item 8.2 names both as
likely surprises): that `compose create` makes the four volumes with their labels and names, and that the chown before
`up` holds.]*

**Where it runs (Q2, the consult's point 2).** Producer and janitor must be the same OS user, on the same host and pid
namespace, against a daemon that mounts the same file system the janitor reads. The recommended place: **one throwaway
workflow on a throwaway branch `tmp/e24-acme`, hosted `ubuntu-latest`, one job, never merged.** There the job's user
(`runner`) runs `run.sh` and, from it, the janitor; both read `/tmp` (`TMPDIR` unset — printed); the daemon is the VM's
rootful `dockerd` ~~and bind-mounts the VM's own `/tmp`~~ **and holds the project's named volumes, which the janitor
lists and removes through the same daemon** *[2026-11-07, item 4.3.2]*. The job prints `id -u`, `hostname`, `${TMPDIR:-unset}`,
`readlink /proc/self/ns/pid` and `docker info --format '{{.SecurityOptions}}'` first, so the identities are read, not
assumed. The image: `:edge` from GHCR if it pulls, else built in the job (printed which). *[2026-11-07, the parent's
row E2.4-f and build order: S4.2's kill case on the named-volume shape runs on this throwaway BEFORE E2.4's plan gate;
so does one dispatch that prints the uid of row 24.]*

**Tests.**

- **S4.1 sc. 5.** RED with `main`'s `run.sh` (a second checkout of `0ae0211` in the job): after a green run
  `deploy/acme-test/state/` exists; a second run stops at `:54` (measured: the Facts' reasoning). GREEN with the branch:
  after a green run AND after a failing run (`VAULT_IMAGE=busybox`): no `state/`, no `testsToDelete-<owner>-creds-acme-*`
  folder or claim in `/tmp`, `docker ps -a --filter label=testsToDelete.owner` and `docker network ls --filter
  label=testsToDelete.owner` empty, **and `docker volume ls --filter label=com.docker.compose.project=<project>` empty
  (2026-11-07, item 4.3.2)**.
- **S4.2 sc. 6.** `run.sh` started in the background; at the first `-- 2. issuance` line, `kill -9 <pid>`. Premise: the
  project's containers, its network ~~and the state folder~~ **, its four named volumes and the owned folder** exist,
  labelled/claimed with that pid. **Before the kill, the run lists the project's volumes (`docker volume ls --filter
  label=com.docker.compose.project=<project>`) and asserts that each carries the `testsToDelete.owner` label: an
  unlabelled one would be kept by the janitor as `unmarked`.** `sleep 660`. Next `run.sh`: its janitor lines are quoted;
  ~~the containers and the network are gone~~ **`docker volume ls`, `docker ps -a` and `docker network ls`, each filtered by
  the killed run's compose PROJECT (`--filter label=com.docker.compose.project=<project>`, never by the owner label, which
  an unlabelled volume would not carry), are empty, and the owned folder and its claim are gone**; the run is green.
  ~~The state folder: what the janitor did with it is recorded as measured (Q4: on rootful Docker its root- and
  uid-10001-owned contents are expected to defeat a non-root `rm -rf`).~~ *[2026-11-07, the parent's epoch 8, row
  E2.4-f: "a person removes it" is not an outcome; observed before E2.4's plan gate, on this shape.]* **Concurrent:** a first run in the background; a second started while the
  first is up: the second fails at `compose up` (the fixed host ports `18081`/`18444`, compose `:56-57`) and its EXIT
  trap removes only its own project; the first run ends green. RED on `main`: the second run's `:53` tears the first
  one's stack down, and the first run fails.
- **S4.3 sc. 7.** RED on `main`: SIGINT during the first `compose up` leaves `deploy/acme-test/state/`. GREEN: SIGINT
  (a) during the janitor call → non-zero exit, nothing made, no error line from `cleanup`; (b) during `compose up` → the
  project, its network, **its volumes** and the ~~state~~ **owned** folder are gone; (c) SIGTERM, as (b).
- **S4.4** shellcheck green on `run.sh` (row 18).
- **S4.5 the stories' sc. 9, a creds test** *[added 2026-11-07, the parent's row E2.4-h]* over `deploy/acme-test/run.sh`
  (beside S3.3): `PROJECT` is assigned once, from `${STATE##*/}` lower-cased, and from nothing else. RED: `PROJECT=acme`
  (by hand once, quoted).

**Exit paths:** a normal end and every `exit` → `cleanup` (compose down **`-v`, which removes the named volumes**,
~~the container-side wipe,~~ `owned_cleanup`); INT/TERM → `exit 130`/`143` → `cleanup` once; a failed compose call under
`set -e` → `cleanup`; `kill -9` → the next run's janitor **removes the containers, the network and the named volumes by
name and label, and the owned folder by its claim** (row 15; Q3 and Q4 decided 2026-11-07).

## 4. The cadence consult `c4fb33b8` (Codex): its three points, settled

1. **The Docker carve-out and the throwaway-branch proof are right; hosted Docker supplies the evidence.** Taken as
   written: S3.1 and S3.2 are hosted dispatches; nothing runs Docker on this machine (it runs containers with `wslc`,
   and has no `docker` binary — checked). One thing the consult did not see: the released guard does not accept D5's
   spelling (I2, I3), so the carve-out needs Q1 before its PR can meet E2.4's Done-when. *[2026-11-07: Q1 decided (B) by
   the parent's epoch 8.]*
2. **Acme needs an execution decision.** Settled as Q2: the hosted `ubuntu-latest` job of § 3.3, where producer and
   janitor are one user, one host, one pid namespace and one file system that the daemon mounts. Not this machine: no
   `docker` binary (the janitor would list no container), `wslc` publishes ports on the Windows loopback only (the
   probe's `curl 127.0.0.1:18081` from the distribution cannot reach them), and a bind mount of a distribution path into
   `wslc`'s VM is not established. A `wslc` stand-in proves neither identity. Not the owner's Windows machine: he does not
   test creds on Windows now, and its janitor is a dry run until F9. D6's own choice (the janitor `--token creds`, never a
   copy of its liveness code) stays; Q3 and Q4 are what that choice makes true on Linux.
3. **A scenario that expects the Node sweep to remove on Windows is impossible.** None of sc. 1, 2, 4–7 expects it. Sc. 3
   (S1's) does: "the same root fed to the Node reference's `sweepLeftovers({ tmp })` … is empty afterwards". At `37b9aa5`
   the reference withholds every removal on Windows and lists `unverified: … (F16)` (`tools/lib/leftovers-sweep.mjs:29-30`,
   `:58`); and without `token: 'creds'` it reads a creds entry as another repository's (E2.3's F9). S1's spec settles it
   the way D3 and D4 make true (its § 10 point 4, T14; its Q5 on the sentence): the Node sweep lists `unverified:` and the
   claim remains; the janitor's dry run names it when the runner's `[ -O ]` says it is the caller's; the collector is the
   C# sweep (E2.3) or a person. The same holds for row 8 and for the kept server log of § 3.1 item 3 on Windows.

## 5. What is NOT in E2.4.S2–S4

- **E2.4.S1** — `owned.sh`, `owned.test.sh`, the *Self-test the shell helper* step, sc. 3 (its spec).
- **E2.5** — the guards' CI steps, the inline exemptions (the four product lines, `commandParse.test.ts:40`), the C#
  guard's `docker.yml` exclusion, `module_tests.md`.
- The product scripts' own temp handling (`install.sh:63`, `:76`; `restore.sh:102`; `restore-archive.sh:61`).
- A start-of-job container sweep in `docker.yml` (D4's recorded deviation).
- F16 (Node on Windows), F9 (arming the janitor on Windows), F31 (elevated Windows), N6 (a `${TMPDIR…}` detector): the
  conventions repository's.
- **Side findings, todos, not built here:** `Summary` claims a publish on a branch dispatch (I15); the smoke scripts are
  not shellchecked in CI (I16); `ci-server.yml`'s push path filter (`:11-32`) lacks `.github/scripts/lib/**` (I8).

## 6. Open questions, each with a recommended answer

Each goes to the coordinator before the plan gate. **A "yes" marked CHANGE would be entry 7.2 of the parent: the
seventh full stop.**

- **Q1 — D5's names against the released guard (row 12; I2, I3; measured).** Both texts: D5 — "names spelled with the
  literal prefix in every command (the guard compares the text), the owner segment from the runner's uid:
  `testsToDelete-${OWNER}-creds-cv-${SMOKE_ID}`"; § S4 — "the shipped guard's `docker-name` class accepts a literal whose
  expansions are `${OWNER}`/`${SMOKE_ID}` after the owner form's prefix; S5 sc. 2 pins that this exact text passes"; E2.4
  Done-when — "the guard evidence run shows only `commandParse.test.ts:40` and the product scripts". Measured with the
  guard of `37b9aa5` over a scratch repository holding D5's steps: 6 findings (4 `docker-name`, 2 `docker-run`); with a
  literal `u1001` owner, 2 `docker-run` (the quoted remover is not matched); with the remover's names and the `-v` sources
  unquoted, **clean**. The stories' rule for this case: stop and report, never resolve in code (D8; § *Order*).
  *Recommended: (B)* the literal owner segment of the runner's uid, asserted by the naming step, and the remover ~~and `-v`
  sources~~ unquoted **(a `-v` argument unquoted or quoted whole, never the source alone in quotes)** (§ 3.2). It carries out D5's decision (an owner segment from the runner's uid, a text the guard
  accepts); the example spelling and its claim are the impossible part. A move off the hosted runner already needs a
  `docker.yml` change by D4. This brief reads (B) as no change; plan-change-control says "in doubt, it is a change", so
  the coordinator decides, and if counted it is entry 7.2. Report the guard's limit to the parent either way.
  (A) a conventions follow-up — the guard reads `${NAME}` after the prefix as the owner when the same file assigns
  `NAME=u$(id -u)`, and matches a quoted remover — released and pinned before E2.4 merges: **CHANGE** (build order,
  merge conditions). (C) D5's spelling as written, the six findings recorded, E2.5 left to clear them: **CHANGE** (E2.4's
  Done-when). **[2026-11-07, decided by the parent's epoch 8, item 4.2: (B). Not a change — the re-review's baseline,
  `Narrowed: no`. Correction to this question's text, row E2.4-a: only the remover's names must be unquoted; a `-v`
  argument is unquoted or quoted WHOLE; the source alone in quotes is 1 `docker-run`. (A) and (C) are rejected (item 4.2,
  reasons 4 and 5).]**
- **Q2 — where acme runs (the consult's point 2).** *Recommended:* the throwaway hosted `ubuntu-latest` job of § 3.3 for
  sc. 5–7; the Windows cells "not run" (row 17). Not a change: the DoD asks for "at least one machine, the other OS
  stated as not run", and the consultants' `867ea464` let a recorded hosted run count as by hand.
- **Q3 — bash records on Linux carry no `<ns>` (I4).** Rule §3: "on a Linux reader, a record without `<ns>` … →
  `unknown`"; both shipped readers do so (`janitor.sh:233-236`, `:649`; `tools/lib/owned.mjs:564`), and `<ns>` rides only
  with `<start>` (`owned.mjs:392`). D3: start and namespace, "bash never"; S1's spec § 3 keeps that ("No start, no
  namespace"), yet its T13, T15, T16 (rows 9, 11, 12) expect the janitor and the Node sweep to empty the root on Linux.
  At `37b9aa5` those Linux halves cannot go green, and nothing `owned.sh` makes on Linux is ever collected (sc. 6's
  Linux collection included). macOS needs no `<ns>`. *Recommended:* the contract wins (§ *Order*): `owned_owner` writes
  `:<start>:<ns>` on Linux, the start from `/proc/$$/stat` and `/proc/stat` with ONE `getconf CLK_TCK` per script, the
  namespace with ONE `readlink /proc/self/ns/pid` per script (rule §3: "ONE child per script … to learn a constant of the
  host"). It goes into S1's spec; this brief reads it as no change by § *Order*; the coordinator confirms. The other
  answer — keep D3 and record T13/T15/T16 and sc. 6 on Linux as "listed `unknown`, a person removes it" — is **CHANGE**
  (sc. 3's and sc. 6's outcomes). D5's `SMOKE_OWNER` keeps no start and no namespace: no reader judges it in CI.
  **[2026-11-07, decided by the parent's epoch 8, item 4.3.1 and row E2.4-e: as recommended. The released contract wins
  (§ *Order*); not a change. S1's spec § 3 is revised with it.]**
- **Q4 — acme's state folder after a kill, on rootful Linux Docker (I6).** The Facts: "a non-root `rm -rf state` cannot
  delete those files" (root and uid 10001 own them); D6: the next run's janitor sweeps, "never a copy of the janitor's
  liveness code"; sc. 6: "the project, its network and the state folder gone". ~~*Recommended (A):* build D6 as written,
  measure in S4.2, and record what the janitor did (expected: `skipped: … failed removal`, exit 3, the run goes on), with
  the one command a person runs (`docker run --rm -v <path>:/s alpine rm -rf /s/certs /s/data /s/logs`, then the janitor
  again). This brief reads (A) as following D6 where sc. 6's text is impossible; the coordinator confirms.~~ (B) default
  ACLs (`setfacl -d`) on the state folders so the user can delete what the containers write: **CHANGE** (approach).
  (C) named, labelled volumes instead of bind mounts: **CHANGE** (D6). **[2026-11-07, decided by the parent's epoch 8,
  item 4.3.2: (C), labelled NAMED volumes of the owned compose project, no bind mount. (A) is ruled out: "a person
  removes it" is not an outcome of the plan. (C) is not a change: it is the baseline epoch 8 is approved on, and it keeps
  D6's one owned project, labels, state and teardown. § 3.3 carries it; S4.2 observes it on the hosted throwaway before
  the plan gate (rows 15, E2.4-f).]**
- **Q5 — the callers' spelling `owned_trap cleanup` (I7; S1's Q1).** The stories ask both "`trap -p EXIT` … not naming
  `owned_cleanup` → refuse" and, for acme and `start-server-and-wait.test.sh`, `trap cleanup EXIT`; `trap -p` prints only
  `cleanup`. *Recommended:* as S1's spec answers it: those two scripts call `owned_trap cleanup` (§ 3.1 item 4, § 3.3
  step 1). One answer serves both documents. Not a change in S1's reading; the coordinator decides it once.
- **Q6 — the RED of the two self-tests' own early failure (revision row 5).** A self-test cannot drive its own early
  failure. *Recommended:* by hand once, recorded with its premise (S2.1, S2.2), plus the standing "the root is empty"
  check in each CI step (§ 3.1 item 6). A committed driver would be a new file outside S4's list, which entry 7.1 counted
  as a change. Not a change as recommended.
- **Q7 — `restore-archive-itest.sh` hands its child an owned `TMPDIR`.** *Recommended:* yes (§ 3.1 item 5): rule §2 binds,
  and the stories review S4 against rule §2. Not a change.
- **Q8 — the kept server log's record names the script, not the server.** *Recommended:* as the stories write it, the
  limit in two sentences (§ 3.1 item 3). Naming the server is impossible claim-first (it starts after the claim); naming
  the caller's shell would add an option to S1's API: **CHANGE**.
- **Q9 — the premise run of sc. 1.** *Recommended:* yes, one unsabotaged dispatch of the throwaway shows `Publish` runs,
  so "skipped" in G1 and G2 is caused by the failure (N5's point). Not a change: a premise of the stories' own RED.
- **Q10 — one pull request.** *Recommended:* one PR for E2.4, S1 → S4 as an ordered commit series (D8, entry 1.6). Not a
  change; a split is **CHANGE**.

## 7. Integration findings

Each is a difference between the stories and the code, the mount or the tools at `0ae0211` / `37b9aa5`. **CHANGE**
marks one that would be a change if its alternative were taken; with § 6's recommended answers none is counted, but Q1,
Q3 and Q4 wait for the coordinator.

- **I1 — moved anchors.** `ci-clients.yml` self-tests `:86-87`, `:90-91` (stories `:75`, `:79`; S1's new step goes after
  `:91`); smokes `:109`, `:223-225` (stories `:97`, `:118-120`); `release.yml:430`, `:705`, `:712` (stories `:403`,
  `:624`, `:631`); `ci-server.yml:170`, `:205`, `:215`, `:230-251`, `:296-305`, `:314`, `:337-375` (stories `:127`,
  `:162`, `:158-173`, `:208`, `:257-262`, `:271`, `:294-332`). `deploy/README.md:247-265` does not describe `state/`.
- **I2 — D5's `${OWNER}` names are not owner-form to the guard** (`leftovers-shell.mjs:7`, `PREFIX_OK` wants
  `[uw][0-9]{1,10}`; a wholly dynamic name passes `docker-name` but then no carve-out is possible,
  `leftovers-docker.mjs:209-212`). Measured (Q1). **CHANGE** under (A) or (C).
- **I3 — the quoted remover is not matched** (`leftovers-docker.mjs:147-150` builds `docker rm -f -v <name>` from the
  run's unquoted token). Measured (Q1). *[2026-11-07, the parent's row E2.4-a: this binds the remover's names only. A `-v`
  argument may be unquoted or quoted whole; § 3.2 item 2's "the `-v` sources unquoted, as the guard reads them (I3)" read
  more into I3 than it says, and is corrected there.]*
- **I4 — no `<ns>` in bash records** → `unknown` on every Linux reader (rule §3; `janitor.sh:649`; `owned.mjs:564`).
  S1's spec keeps D3's "no start, no namespace" and also expects Linux collection (its T13, T15, T16): the two cannot
  both hold (Q3). Found by reading the two readers, not by a run. *[Settled 2026-11-07, the parent's row E2.4-e: the
  record carries `:<start>:<ns>` on Linux.]*
- **I5 — sc. 3's Windows Node half** (§ 4 point 3): settled in S1's spec (§ 10 point 4, T14).
- **I6 — acme's state after a kill** (Q4). The Facts reasoned it for the START wipe (`run.sh:54`); the same reasoning
  holds for the janitor's `rm -rf`. To be measured by S4.2. *[Settled 2026-11-07, the parent's item 4.3.2: the state is
  in named volumes, which the janitor removes whole; S4.2 observes it.]*
- **I7 — the trap check vs `trap cleanup EXIT`** (Q5): `start-server-and-wait.test.sh:43` and acme's `cleanup` reach
  `owned_cleanup` through a function, which `trap -p` does not show; S1's `owned_trap` settles it (its § 10 point 2).
- **I8 — the `deployment` job has no mount and no Node** (`ci-server.yml:265-314`), yet runs `restore-archive-itest.sh`:
  S1's helper needs neither on Linux (its § 3), so the job needs no new step. Also: the push path filter (`:11-32`) lacks
  `.github/scripts/lib/**` (pull requests run unconditionally, `:33-34`): a todo.
- **I9 — "`id` = its six-character suffix"** (§ S4, acme step 3) vs D2's bash id of 8 hex: the folder's own 8-hex id is
  used. Wording, not a change.
- **I10 — the start test already passes `START_SERVER_LOG`** in every launching case (`:88`, `:174`, `:189`; case e at
  `:156` stops at usage before `:107`). Nothing to add.
- **I11 — no RED for `start-server-and-wait.test.sh`**: between `:28` and `:43` nothing can fail (§ *Epoch 6* item 8.1).
- **I12 — the smokes' leaf sits inside the self-tests' `$work`** (`mcp-listen-smoke.test.sh:50`,
  `version-smoke.test.sh:53`); the off-CI branch is reached only by a person, so S2.4 adds the cases that reach it.
- **I13 — `restore-archive.sh:61` runs `mktemp -d` as the itest's child** (Q7).
- **I14 — no Docker here.** No `docker` binary (checked 2026-11-07); S4's `docker run … koalaman/shellcheck` cannot run
  locally (§ 9).
- **I15 — `docker.yml` `Summary`** (`:151-160`) has no `if:`: on a green branch dispatch it says "Image published". Todo.
- **I16 — the smoke scripts and their tests are not shellchecked in CI** (`ci-server.yml:300-305` lists
  `start-server-and-wait*` only). Todo.
- **I17 — sc. 6's concurrent run is kept apart by age and ports**, not by the janitor's liveness read: the first run is
  younger than 10 minutes, and the fixed host ports make the second fail at `compose up`.
- **I18 — macOS bash.** `#!/usr/bin/env bash` on `macos-latest`: which bash runs the scripts is to be measured (print
  `bash --version` once). S1's spec writes for bash 3.2; the callers must too: no `${x,,}` (§ 3.3 uses `tr`), and an
  empty array under `set -u` is an error before bash 4.4.
- **I19 — D5's host normalisation** `tr -s '@: \t' '-'` also squeezes `--` already in a host name; rule §3 changes only
  runs of `@`, `:`, whitespace. `sed -E 's/[@:[:space:]]+/-/g'`. A fix to the plan's text as written; not a change.

## 8. Risks

1. **Q1 can stop the plan.** S3 cannot meet D5's text and E2.4's Done-when together at `37b9aa5`. If the coordinator
   counts any answer, it is the seventh full stop, and no E2.4 code is written until the re-review. *[2026-11-07: it did
   (entry 7.2). The parent's epoch 8 decided (B); this risk is closed.]*
2. **Linux collection of bash-made leftovers depends on S1's record and on file ownership** (Q3, Q4). Without `<ns>`
   nothing is collected, and S1's T13/T15/T16 go red on Linux; with it, acme's state may still need a person. S4.2
   measures it; rows 8 and 15 say so. *[2026-11-07: both causes are settled by the parent's epoch 8 (row E2.4-e, item
   4.3.2). What stays (its item 8.2): a volume still in use when the janitor reaches it, and compose's volume naming; S4.2
   observes both on the throwaway before the plan gate.]*
3. **Hosted evidence only, for Docker and acme.** The smoke job never runs on a pull request; a mistake in `docker.yml`
   shows on a dispatch or after the merge, on `main`, where `Publish` moves `:edge`. The remover never decides the
   verdict, and S3.1's G1/G2 prove that a failed smoke skips `Publish`.

## 9. Commands, Definition of Done

```bash
# no Docker on this machine: the docker and acme runs are hosted dispatches (S3.1, S3.2, § 3.3)
bash .github/scripts/mcp-listen-smoke.test.sh; bash .github/scripts/version-smoke.test.sh
bash .github/scripts/start-server-and-wait.test.sh
bash deploy/restore-archive-itest.sh
# the RED/GREEN counts of S2.1, S2.2, S2.6, S2.7: TMPDIR is a private EMPTY folder outside the worktree, made by hand;
# its entries are counted before and after, and the folder is removed by hand after the count
TMPDIR="<private empty folder>" bash deploy/restore-archive-itest.sh; ls -A "<private empty folder>" | wc -l
# shellcheck: CI's `compose · scripts` job (ci-server.yml:296-305) is the check; locally the same image through wslc only
#   if its mount of this worktree works (to be measured), never Docker
node .claude/rules/shared/tools/sweeper-scan.mjs --root .
node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"
JANITOR_MIN_AGE_MINUTES=10 bash .claude/rules/shared/tools/janitor.sh --token creds --dry-run
gh workflow run docker.yml --ref tmp/e24-smoke-red          # one plain command per run (S3.1)
gh workflow run docker.yml --ref feat/test-leftovers-e2.4  # S3.2
```

- [ ] Rows 1–21 of § 1 each have their evidence line on the PR; the unmapped rows carry § 6's answers.
- [ ] S2.1–S2.7, S3.0–S3.3, S4.1–S4.5 (S3.3 and S4.5 added 2026-11-07): each RED seen once and quoted with its premise,
      then GREEN; the hosted run URLs on the PR; the throwaway branches deleted after.
- [ ] The four CI steps' "the root is empty" checks green on every leg they run (Linux, macOS, Windows for the smokes).
- [ ] The shipped Node guard on the head: exactly row 20's expected list; `sweeper-scan` `none found`.
- [ ] Acme: sc. 5–7 recorded on the hosted Linux job with the identities printed; Windows stated as not run; ~~Q4's state
      outcome recorded as measured~~ **the named volumes listed with their label before the kill, and empty by the
      project's label after the next run (row 15, 2026-11-07)**.
- [ ] `.gitignore`, `architecture.md:363`, the two script headers and `http/README.md` updated; shellcheck and actionlint
      green.
- [ ] ~~Q1, Q3, Q4 answered by the coordinator before the plan gate~~ **Q1, Q3, Q4 answered by the parent's epoch 8
      (2026-11-07); before the plan gate, the hosted throwaway observations of row 24 (uid `1001`) and row 15 (the kill on
      the named-volume shape)**; a `review_plan` round reached `proceed` before the
      first code commit; a `review_code` round and an Opus review before the merge.
