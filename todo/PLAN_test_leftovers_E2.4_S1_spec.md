# PLAN — Test leftovers, E2.4.S1 spec: `owned.sh`, the claim-first bash helper, and its self-test

> Status: **spec only, nothing built, 2026-11-07; no plan gate yet.** Scope: the cornerstone story E2.4.S1 of
> [PLAN_test_leftovers_E2.md](PLAN_test_leftovers_E2.md) (§ *Epics* → E2.4.S1; § S4, the helper's block and sc. 3). Branch
> `feat/test-leftovers-e2.4`, cut from `main` `0ae0211`, where E2.1 (#294), E2.2 (#310) and E2.3 (#311) are merged; the mount
> is release `37b9aa5`. Spec by Fable; code by a Sonnet coder; review by Opus. The second consultation (codex, cadence
> `c4fb33b8`) precedes this epic; its four points are settled here (§ 10). **The parent's epoch 8 is open with no change
> used** (one accepted change would be its entry 8.1; the second stops the plan): this
> spec makes the stories document's own decisions true and changes none of them. Where the stories text cannot be made
> true, both texts are quoted and the document's own decision is followed (§ 10); what needs a new decision is an open
> question for the coordinator (§ 11) and is not decided here.
>
> **Revised 2026-11-07 for the parent's epoch 8** (`dew_flow_conventions · todo/PLAN_test_leftovers_rollout.md` § *Epoch 8*,
> approved by reviewers, `Narrowed: no`; epoch 8 is open with no change used). Its judge cut this spec's § 3 sentence "No
> start, no namespace" (`:86`); it is fixed forward here by a new commit, never a rewrite: **on Linux `owned_owner` writes
> `:<start>:<ns>`** (row E2.4-e, item 4.3.1: the released contract wins, the stories' § *Order*), and T2, T13, T15, T16
> are made consistent with it. § 11's questions are settled by its item 4.3: Q1, Q2, Q3, Q6, Q7 as recommended (4.3.3);
> Q4 — if bash 3.2 does not show the parent's trap inside `$( )`, the coder stops and reports, and the recommended shape
> is the trap text written to a file beside the claim and read back (4.3.4). Q5 is not named in item 4.3; its row E2.4-g reads sc. 3 on Windows as T14, which is Q5's
> recommended reading, and the coordinator confirms. The stories document's D3
> is corrected on creds branch `docs/e2-epoch8` (`d32dcd5`, not yet merged); this spec cites it until `main` carries it.
>
> **Revised 2026-11-09 after the E2.4 plan gate (coai `263fa36d`, `proceed`), the S1 risk consultation (`95b733c4`, codex,
> C1–C5) and an independent Opus review (items 2, 4–12), all accepted by the coordinator.** The gate: `owned_dir` reads
> `OWNED_TRAP_SET` only and never the caller's trap text (bash 3.2 clears traps in a subshell), so Q4 is closed and T7a
> becomes a check of the callers. C1: the window between a successful `mkdir` and the recorded state is closed by
> pending-signal handling (`owned_signal`, § 3, § 4), never by marking `created` early. C2: the EXIT chain runs
> `owned_cleanup` whatever the caller's function returns and keeps the original exit status. C3: `owned_remove` removes only
> a path this run created and registered. C4: T2 compares the record byte for byte with the reference's `formatOwner`.
> C5: the exclusive `mkdir` is measured on each leg. The Opus items: `owned_token` in the caller's shell (2), `set -u` with
> an empty array (4), `noclobber` is weaker than `O_EXCL` (5), T10 made consistent with § 3 (6), `TESTSTODELETE_OWNER`
> cleared for the node child (7), T14 ages its claim (8), the janitor's scope stated and bounded (9), field 22 after the
> last `)` (10), `$BASH_VERSION` on macOS (11), the epoch wording (12). Each fix makes the stories do what they decide; none
> is a plan change.

Sources, read for this spec: the stories document (§ *Revision* rows 5, 7, 8; § *Goal*; D1, D3; § S4; sc. 3; § *Plan-gate
round 2*; § *Epics* E2.4; § *Risk items*); the shared rule `common/test-leftovers.md` (§1–§4) and `test-leftovers-detail.md`
(§2 the order, §3 the record, §4 the two keys); the Node reference `tools/lib/owned.mjs` (`dirFor`, O:641-671: the states
`made.folder` / `made.claimed`; `writeOwner`, O:450-454; `removeClaimIfStill`, O:457-463) and `tools/lib/leftovers-sweep.mjs`
(the header lines 26-30 and `sweepLeftovers`, L:653-660: on `win32` `mutate` is false); `tools/janitor.sh` (`remove_marker`
`:779-784`, the Windows dry run `:133-134`, `win_token` `:138-142`); the Node wrapper `src_vs_code/scripts/lib/leftovers.cjs`;
`.github/workflows/ci-clients.yml` at `0ae0211`; the rules `planning-docs.md`, `plan-change-control.md`, `testing.md`.
`O:` is `owned.mjs`, `L:` is `leftovers-sweep.mjs`, `J:` is `janitor.sh`, `R:` is the detail rule, `S4:` is the stories
document's line.

*Instruction loading:* this repository has no `AGENTS.md`, so the shared resolver answers `INCOMPLETE — Missing instruction
source` (the same as the E2.3 brief recorded). The rules named above were read whole from the mount. Nothing was changed but
this spec and its `todo/README.md` row.

## 1. The goal

One sourced bash file, `.github/scripts/lib/owned.sh`, gives every CI and test shell script of this repository an owned
folder: named `testsToDelete-<owner>-creds-<what>-<id>`, claimed FIRST by an exclusive write of the owner record, registered
for cleanup as the next step, created exclusively, and removed on every exit path by its exact name. A kill between the two
steps leaves an orphan claim with a dead pid, which every sweep of rule §4 collects on POSIX and lists on Windows; it never
leaves an unclaimed folder. The helper is the only helper written from scratch here, in bash, so its self-test
(`.github/scripts/lib/owned.test.sh`) runs in real child processes on Linux, macOS (bash 3.2) and Git for Windows' bash, from
`ci-clients.yml`.

## 2. The parent's table — the rows S1 owns

Columns as in [PLAN_test_leftovers_E2.3_brief.md](PLAN_test_leftovers_E2.3_brief.md) § 1. Each row is a merge condition of
E2.4's pull request that S1 carries. `T<n>` is a case of § 6.

| # | Condition | Implementation (file:line at HEAD) | Invocations covered | Executable acceptance check | What the check prepares or substitutes, and what real-run behaviour it does not prove |
|---|---|---|---|---|---|
| 1 | **sc. 3, the name** — `owned_dir d x` names `^testsToDelete-[uw][0-9]{1,10}-creds-x-[0-9a-f]{8}$` under the root; its owner segment equals the mounted `thisOwnerToken()` on the same machine | NEW `owned.sh`: `owned_token`, `owned_dir` (§ 3) | the self-test step, three OSes | T1 | The one cross-helper check. A private root stands in for the machine's temp root. It does not prove the name under a real `TMPDIR` of a developer's machine |
| 2 | **sc. 3, the record** — `d.owner` is one line of the grammar `<owner>:<host>@<os>:<pid>[:<start>:<ns>]`, with `:<start>:<ns>` on Linux and on Linux only (2026-11-07, row E2.4-e); on Windows the pid is the Windows pid and `tasklist` lists it while the script runs | `owned_owner` (§ 3); D3 (`/proc/$$/winpid`; the Linux start and namespace, corrected 2026-11-07) | three OSes | T2, T3 | It proves the pid of a live child. It does not prove that a Node, C# or janitor reader judges the record (the owner vectors of the mount do that; the handoff on real records is row 10) |
| 3 | **sc. 3, the order** — the claim exists before the folder; an existing claim at the drawn name is kept and another name is drawn | `owned_dir` steps 1–3 (§ 4) | three OSes | T4, T5 | The seams `OWNED_HOOK_AFTER_CLAIM` and `OWNED_TEST_IDS` (§ 3) stand in for timing and chance. A race of two live scripts on one name is not run; the exclusive create of the OS is what the test exercises, once per OS |
| 4 | **sc. 3, the refusals** — a bad `what`; `owned_remove` of an empty path, an unregistered path, another run's live folder (process A passing B's, C3), an entry already released | `owned_dir`, `owned_remove` (§ 3) | three OSes | T6, T9, T10 | The refused paths are planted. It does not prove the refusal of every bad path a caller can build |
| 5 | **sc. 3, the trap** — a script with no trap gets `owned_cleanup` and the three signal traps on its first `owned_dir`; a script registered through `owned_trap` keeps its function, and `owned_cleanup` runs after it whatever it returns; no migrated caller sets a trap of its own | `owned_trap`, `owned_exit_chain`, the flag `OWNED_TRAP_SET` (§ 3; the plan gate `263fa36d`) | three OSes; T7a over the tree | T7a–T7d | `OWNED_TRAP_SET` cannot see a trap a caller sets later (T7d measures the replacement); the callers are checked by T7a's scan, which reads text, not behaviour. A caller's own INT/TERM/HUP trap would replace the helper's and re-open C1's window: the scan refuses those too |
| 6 | **sc. 3, the squatter** — a folder planted at the drawn name is never adopted, never removed, by the call or by the EXIT trap | the states `claimed` → `released` (§ 4) | three OSes | T8 | The squatter is planted through the seam, with a sentinel file. Checked AFTER the child exited. It does not prove a squatter planted by another user (one uid per runner) |
| 7 | **sc. 3, a removal that gives up** — `owned_remove` on a folder whose parent is read-only returns 0, one line, folder and claim remain | `owned_remove`, five tries 0.1 s apart (§ 3) | Linux, macOS | T11 | POSIX only; the premise (`id -u` is not 0, the parent is not writable) is asserted. A Windows held handle is not tried |
| 8 | **sc. 3, fail closed on Windows** — with no `node` on `PATH`, `owned_token` returns 1 with one line and nothing is made | `owned_token` (§ 3) | Windows | T12 | `PATH=/usr/bin` in a child stands in for a machine without Node. It does not prove the message on a machine where `node` exists but the mount is missing (row 13's fetch step is what the job relies on) |
| 9 | **sc. 3, the kill between the two steps (plan-gate round 2)** — after `kill -9` between claim and `mkdir` the root holds exactly ONE entry, the claim, and no folder; on Linux and macOS the janitor with `JANITOR_MIN_AGE_MINUTES=10` leaves the root EMPTY and the mounted Node sweep over a second such root leaves it empty too | `owned_dir` step order; `OWNED_HOOK_AFTER_CLAIM=die` | Linux, macOS | T13 | The claim's age is set by `touch -t` (POSIX), not by waiting. The pid is the dead child's real pid; its reuse within the test is improbable, not impossible (`unmatchable-pid.mjs`'s note), so the test asserts `kill -0` fails before the sweep. RED by hand on the swapped order (§ 6) |
| 10 | **sc. 3, the kill between the two steps on Windows** — the same kill leaves the one claim; the janitor runs as a dry run; the Node sweep lists `unverified:` and the claim remains | the same; § 10 point 4 | Windows | T14 | **The sc. 3 text expects the Node sweep to empty the root; the mounted reference withholds removal on Windows (F16).** The test asserts the reference's behaviour (§ 10 point 4). The janitor's dry-run line depends on the kernel owner: on the elevated `windows-latest` the claim may belong to `BUILTIN\Administrators` (F31) and is then kept as a stranger's; the test asserts the outcome the runner's own `[ -O ]` gives, as E2.3.S2 does |
| 11 | **sc. 3, a kill AFTER the `mkdir`** — folder and claim remain, with the dead pid; the janitor collects both on Linux and macOS | `owned_dir`; the record | Linux, macOS (Windows: listed, as row 10) | T15 | As row 9. On Windows the same limits as row 10 |
| 12 | **`OWNED_KEEP`** — a kept folder is claimed and created, left by the EXIT trap, and collected like row 11 once its shell is gone | `owned_dir` with `OWNED_KEEP=1` (§ 4) | Linux, macOS | T16 | The age is set by `touch -t`. It does not prove the hand-on of `start-server-and-wait.sh:107` (E2.4.S2's) |
| 13 | **The CI step** — *Self-test the shell helper* runs `owned.test.sh` on the three legs after the mount fetch and `setup-node` | `ci-clients.yml`, after `:91` (§ 7) | `clients · build · test (ubuntu, macos, windows)` | the three legs green on the head; the Windows leg read by hand (not required, F12) | The step proves the self-test; the self-test's limits are rows 1–12 |
| 14 | **shellcheck** — `owned.sh` and `owned.test.sh` are in the shellcheck run of `ci-server.yml` | `ci-server.yml` (S4 Files: the shellcheck line gains `owned.sh`; S1 adds its two files; `deploy/acme-test/run.sh` is E2.4.S4's) | `ci · server` | the step green; by hand once: `docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:v0.11.0 .github/scripts/lib/owned.sh .github/scripts/lib/owned.test.sh` | A lint, not a behaviour test |
| 15 | **The guard reads the helper clean** — `leftovers-check.mjs --profile node --token creds` on the head reports no finding in `.github/scripts/lib/`; the token constant `REPO_TOKEN="creds"` is found and equals `leftovers.cjs`'s | `owned.sh:` the one `REPO_TOKEN` line; the patterns built with `${OWNED_TOKEN}` after the prefix (§ 3) | the guard evidence run of E2.4 | T17 | A text scan (F30's spellings). It does not prove the helper's behaviour. The `owner-blind` class takes no exemption: a finding there is a rewrite, never a comment (§ 12 risk 2) |
| 16 | **C1 — the signal window** — a signal that arrives while `mkdir` runs never leaves a folder without its claim; a squatter's sentinel survives a failed `mkdir` under the same signal | `owned_signal`, `OWNED_BUSY`, `OWNED_PENDING` (§ 3, § 4) | three OSes | T20 | The stub `owned_create_dir` stands in for timing: the signal is sent by the stub itself, so the arrival is certain, not a race. By-hand RED: the pending handling removed |
| 17 | **C2 — the chain under `set -e`** — `cleanup() { false; }` under `set -euo pipefail` with `exit 3`: `owned_cleanup` ran, the status is 3 | `owned_exit_chain` (§ 3) | three OSes | T18 | Reproduced by the consultation on the first shape (`exit 3` became 1 and the cleanup was skipped); T18 is that reproduction, GREEN |
| 18 | **C4 — the record's bytes** — the claim equals the reference's `formatOwner` for the child's pid byte for byte, the LF included | `owned_owner` (§ 3) | three OSes (`:<start>:<ns>` on Linux) | T2 | Measured once on WSL by the Opus review: `u1000:jinx~Ubuntu@linux:563809:1794234376:4026532216`. `processProbe(pid).start` is read while the child lives |
| 19 | **C5 — the exclusive `mkdir`** — two plain `mkdir` racing on one absent path: exactly one succeeds; an existing sentinel folder is unchanged | the OS; `owned_create_dir` (§ 3) | three OSes (Git Bash on NTFS is measured for the first time) | T5 | A measurement of the OS, not of the helper; two children, one race per leg |
| 20 | **`set -u`** — the helper works under `set -u` with no entry registered (bash < 4.4: an empty array is unbound) | `OWNED_PATHS=()` declared at source time; every loop by index (§ 3) | three OSes (macOS bash 3.2 is the one that fails) | T19 | — |

Unmapped: none. Row 10 carries the one impossibility (§ 10 point 4) and a measured premise (F31) that may fail on the
Windows leg; what happens then is § 11 Q5.

## 3. The API of `owned.sh`

Sourced, never executed: `source "$here/lib/owned.sh"` (or `../../.github/scripts/lib/owned.sh` from `deploy/acme-test`).
bash 3.2 or later. No `set -e`, `set -u` or `set -o pipefail` of its own; every function works under a caller that has
them. No `declare -A`, `mapfile`, `local -n`, `${var,,}`, `&>>`, no `touch -d`, `stat`, `cmp`, `readlink -f`, `date -d`,
`date -v`, `sha256sum`; `[[ =~ ]]` only with the pattern in a variable (bash 3.2 quoting). The word `mktemp` appears
nowhere in the two files, not in a comment (the guard's `raw-temp` for `.sh` is `\bmktemp\b`). The one external program a
real run needs beyond coreutils is `hostname`; on Windows also `node` (once); **on Linux also `getconf` and `readlink`,
once each per script (2026-11-07, row E2.4-e)**. Every function returns, never `exit`s — except the two trap actions
`owned_exit_chain` and `owned_signal`, which end the script as the caller's own `exit` would, with the status the script
had (C2). Nothing here reads the caller's trap text: `trap -p` inside `$( )` shows nothing on bash 3.2 (the plan gate).

```bash
REPO_TOKEN="creds"      # rule §1 — the ONLY place the shell token is written (the guard's constant shape, S4:935)

owned_token             # prints the caller's owner token and caches it in OWNED_TOKEN. Linux, macOS (any uname not
                        #   MINGW*/MSYS*/CYGWIN*): u$(id -u), no child. Git for Windows: ONE node child per script (rule §3,
                        #   "ONE child per script or run to learn a constant of the host"): the mounted owned.mjs's
                        #   thisOwnerToken(), imported through a file URL (pathToFileURL of the Windows path of
                        #   .claude/rules/shared/tools/lib/owned.mjs, resolved from this file's own folder). Its answer must
                        #   match ^w[0-9]{1,10}$; no node on PATH, a non-zero exit, no mount, or a wrong shape → ONE stderr
                        #   line "owned: cannot learn the owner token (<why>) — nothing is made", return 1. The node child
                        #   runs with TESTSTODELETE_OWNER='' (an empty value is no value, O:104), so the override the
                        #   reference would read (O:103-106) is never read (Opus 7). owned_dir calls it in the CALLER's shell,
                        #   `owned_token >/dev/null || return 1`, and then uses $OWNED_TOKEN — never `$(owned_token)`, which
                        #   would lose the cache (one node child per draw) and let a failed token name `testsToDelete--creds-…`
                        #   (Opus 2).
owned_owner             # prints <token>:<host>@<os>:<pid>[:<start>:<ns>], cached in OWNED_OWNER (R:102). host: `hostname`, each run of
                        #   [@:[:space:]] → one '-'; under WSL (WSL_DISTRO_NAME set) '~' and the distro name, normalised alike.
                        #   os: linux | macos (Darwin) | windows (MINGW*/MSYS*/CYGWIN*); any other uname → one line, return 1.
                        #   pid: on Windows the content of /proc/$$/winpid (a `read` builtin, no child; D3); else $$.
                        #   ~~No start, no namespace: bash never writes them (D3).~~ On Linux ONLY, then :<start>:<ns> (R:102,
                        #   formatOwner's order: <ns> only together with <start>): <start> from /proc/$$/stat — the line read
                        #   whole, the part AFTER THE LAST `)` taken (`rest=${line##*)}`; a command name may hold spaces and
                        #   `)`, O:294-296), field 22 being the 20th word of that part — over the boot time `btime` of
                        #   /proc/stat, floor(btime + field22 / CLK_TCK) as the reference's startFromProcStat gives it, with
                        #   ONE `getconf CLK_TCK` per script; <ns> from ONE `readlink /proc/self/ns/pid` per
                        #   script, the number in its `pid:[<n>]` (rule §3: "ONE child per script … to learn a constant of
                        #   the host"). If either cannot be read, neither is written (the record stays judgeable as
                        #   `unknown`, never wrong). macOS and Windows write neither. One LF line, well under 512 bytes.
                        #   [2026-11-07, the parent's epoch 8, row E2.4-e: "No start, no namespace" is corrected. Without
                        #   <ns> every Linux reader answers `unknown` (rule §3; janitor.sh:649; owned.mjs:564), so T13, T15
                        #   and T16 could not go green on Linux. The stories' D3 is corrected with it (d32dcd5).]
owned_trap <function>   # the ONE way a caller sets its own traps: records <function> in OWNED_CALLER_FN, installs
                        #   `trap owned_exit_chain EXIT` and `trap 'owned_signal INT' INT`, the same for TERM and HUP, and
                        #   sets OWNED_TRAP_SET=1. <function> must be a defined function (`declare -F`), else one line,
                        #   return 1. Called BEFORE the first owned_dir. owned_cleanup is idempotent, so a <function> that
                        #   calls owned_cleanup itself (acme's `cleanup`, S4:1028) is fine.
owned_exit_chain        # the EXIT trap (C2): rc=$? first; `set +e` for its own body; runs $OWNED_CALLER_FN when set, whatever
                        #   it returns; owned_cleanup; then `exit "$rc"` — the status the script had, never the function's.
owned_signal <sig>      # the INT/TERM/HUP trap (C1): while OWNED_BUSY=1 (owned_dir is between the create and the recorded
                        #   state) it records OWNED_PENDING=<sig> and returns; otherwise `exit $((128 + <n>))` — 130, 143,
                        #   129 — so the EXIT chain runs once (what acme's `trap 'exit 130' INT` did by hand, S4:1024-1025).
owned_dir <var> <what>  # sets the caller's variable with `printf -v` — no command substitution, so it runs in the caller's
                        #   shell: the traps it installs are the caller's and $$ is the script. Never call it in a
                        #   subshell, `$( )`, a pipeline or `&`. Validates <var> (a name, ^[A-Za-z_][A-Za-z0-9_]*$) and <what>
                        #   (non-empty; no / \ or control character; no leading '-'; at most 22 characters, so the longest
                        #   owner w4294967295 still gives a 63-character name, R:50-53). `owned_token >/dev/null || return 1`.
                        #   Then up to three draws of dir="${TMPDIR:-/tmp}/testsToDelete-${OWNED_TOKEN}-${REPO_TOKEN}-<what>-<8 hex>"
                        #   in § 4's order. On its first call with OWNED_TRAP_SET unset it installs the same four traps as
                        #   owned_trap with no caller function (the one-line callers) — it reads no trap text (the gate).
                        #   The folder is made through the one internal function owned_create_dir (`mkdir -- "$1"`), between
                        #   OWNED_BUSY=1 and the recorded state; a signal that arrived meanwhile is re-raised after (§ 4, C1).
                        #   Return 0 with <var> set and the folder existing; else return 1 with <var> untouched.
owned_remove <dir>      # removes an entry THIS RUN created and registered (C3): <dir> must equal an OWNED_PATHS entry in
                        #   state created or kept whose claim still holds OWNED_TEXTS[i] (the bash read of § 4); anything
                        #   else — an empty path, an unregistered path, another run's folder, an entry already released —
                        #   is ONE line, return 1, nothing touched. The basename must also match
                        #   ^testsToDelete-${OWNED_TOKEN}-${REPO_TOKEN}- (a second guard, never a bare prefix). Then five
                        #   tries 0.1 s apart of `rm -rf -- "$dir"`; when the folder is gone, `rm -f -- "$dir.owner"` and the
                        #   state becomes released. On giving up: ONE stderr line naming the path, return 0; the folder stays
                        #   prefixed AND claimed (R:94-98). Never `exit`s, never trips `set -e`. A handed-on folder of ANOTHER
                        #   process (the stop step reading start-server-and-wait.sh's log) cannot use it: that is S2's `rm`.
owned_cleanup           # for every registered entry, last first (by index, `${#OWNED_PATHS[@]}` down to 0): state created or
                        #   kept-by-this-call → owned_remove; state claimed → remove the claim only while it still holds what
                        #   this run wrote (§ 4), never a folder; released, kept → nothing. Idempotent (each entry's state
                        #   becomes `released` after it is handled). Never `exit`s.
```

**Environment read.** `TMPDIR` (the root; a trailing `/` is stripped; unset → `/tmp`); `WSL_DISTRO_NAME`; `OWNED_KEEP`
(`1`: the folder is claimed and created and left out of the cleanup, state `kept`; for a handed-on resource, S4:971);
`PATH` (for `node` on Windows). **Test seams, unset in every real run** (S4:949): `OWNED_HOOK_AFTER_CLAIM` names a function
run between steps 1 and 2 with the drawn path as `$1`; `OWNED_TEST_IDS`, a space-separated list of ids drawn in order instead
of random ones (so a test can plant a claim or a folder at the name about to be drawn); `owned_create_dir` may be
redefined by a test after sourcing (T20). **Not read:** `TESTSTODELETE_RUN` and `TESTSTODELETE_OWNER` (Q3, settled by the
parent's epoch 8). On Windows the node child would read the override (O:103-106), so it is started with the variable empty;
the janitor reads it too (J:149-153), so the self-test runs with it unset and says so (a premise of T13–T16). **State the
file owns:** `OWNED_TOKEN`, `OWNED_OWNER`, `OWNED_TRAP_SET`, `OWNED_CALLER_FN`, `OWNED_BUSY`, `OWNED_PENDING`, and three
parallel indexed arrays `OWNED_PATHS`, `OWNED_STATES`, `OWNED_TEXTS` (bash 3.2 has no associative array), declared empty
(`=()`) when the file is sourced and walked by index only — `"${OWNED_PATHS[@]}"` of an empty array is "unbound variable"
under `set -u` on bash before 4.4 (Opus 4; T19).

**The callers' contract** (S4:961-963): one line, `owned_dir work smoke-test || exit 1`, after `set -euo pipefail` and after
`owned_trap cleanup` when the script has a cleanup of its own; never a `trap` of its own on EXIT, INT, TERM or HUP, before
or after the first `owned_dir` (`OWNED_TRAP_SET` cannot see a replacement, C2; T7a scans the migrated callers for one);
never `owned_dir` in a subshell. E2.4.S2 and S4 write the callers; this spec fixes only what the helper requires of them.

## 4. The state machine

Each entry of `owned_dir` moves through these states; the Node reference keeps the same two facts as `made.folder` and
`made.claimed` (O:653-667). A folder is removed by `owned_cleanup` ONLY in state `created`; a claim is removed ONLY in state
`claimed` or `created`. Nothing else is ever removed.

```
 (draw an id) ──1. CLAIM── exclusive write of owned_owner to <dir>.owner ──ok──▶ claimed
      ▲                      │ EEXIST: somebody's claim — draw again (≤ 3)         │
      │                      │ other error: one line, return 1 (nothing made)      │
      │                                                                            ▼
      │                                        2. REGISTER (OWNED_KEEP unset): first call → trap check (§ 3 owned_trap);
      │                                           refused → claim removed-if-unchanged → released, return 1
      │                                                                            │
      │                                        3. CREATE: OWNED_BUSY=1; owned_create_dir <dir>; the state recorded;
      │                                           OWNED_BUSY=0; a pending signal re-raised (C1)
      │     EEXIST (a squatter): one warning, claim removed-if-unchanged ◀──────────┤
      └──── released (draw again, ≤ 3 in all) ◀─────────────────────────           │ ok
                                                                                   ▼
                                                 created ──(OWNED_KEEP=1)──▶ kept   (both: folder + claim on disk)
                                                    │
                                        owned_cleanup / owned_remove ──▶ released (folder gone, then claim gone)
```

| From | Event | To | On disk afterwards |
|---|---|---|---|
| — | claim written: first `[ -e "$p" ] || [ -L "$p" ]` → taken, draw again; else `( set -o noclobber; printf '%s\n' "$OWNED_OWNER" > "$p" )`, the status read. On failure: `[ -e ] || [ -L ]` now → taken (that is how EEXIST is told), draw again; else another error (EACCES, no root), one line, return 1. On success: `[ -f "$p" ] && [ ! -L "$p" ]` and the text read back equals what was written — else it is not ours (a link to `/dev/null`, a device: `noclobber` refuses only an existing REGULAR file, Opus 5), never removed, draw again | `claimed` | the claim; the written text is kept in `OWNED_TEXTS[i]` |
| `claimed` | `mkdir` ok while a trapped signal arrived (bash runs the trap after the command; `owned_signal` only records it) | `created`, THEN the signal is re-raised: `exit $((128 + n))` → the EXIT chain | folder + claim, both removed by the chain (C1) |
| `claimed` | the trap check refuses | `released` | nothing of ours (the claim removed while it still holds `OWNED_TEXTS[i]`) |
| `claimed` | `mkdir` → EEXIST | `released` | the squatter's folder, untouched; our claim gone |
| `claimed` | `mkdir` → another error | `released` | nothing of ours; one line, return 1 |
| `claimed` | `mkdir` ok | `created` (or `kept` under `OWNED_KEEP=1`) | folder + claim |
| `claimed` | `owned_cleanup` (an exit before step 3 ended, impossible in one shell but kept for completeness) | `released` | nothing of ours |
| `created` | `owned_cleanup`, `owned_remove` | `released` | nothing; or, after five failed tries, folder + claim and one line |
| `kept` | any exit | `kept` | folder + claim, the claim naming this shell's pid → collected by a sweep once the pid is gone and 10 minutes passed |
| `claimed`, `created`, `kept` | `kill -9` | (no transition) | `claimed`: an orphan claim; `created`/`kept`: folder + claim; both collected by rule §4's sweeps on POSIX, listed on Windows (§ 10 point 4) |

"Removed while it still holds what this run wrote" is a bash read, no external tool: `IFS= read -r line < "$dir.owner"`,
then `[ "$line" = "$OWNED_TEXTS[i]" ]` and a second `read` that must fail (one line only); the file must be a regular file
(`-f`) and not a link (`! -L`). A claim that differs is another run's and stays (O:457-463). An entry is never deleted from
the arrays; its state is what counts, so `owned_cleanup` can run twice.

## 5. Every exit path

| Path | What the caller sees | What exists afterwards | Who collects |
|---|---|---|---|
| `owned_token` cannot be had (Windows, no `node` / no mount / wrong shape) | return 1, one line | nothing | — |
| `<var>` or `<what>` invalid | return 1, one line | nothing | — |
| three claims EEXIST, or three squatters | return 1, one line "no free name" | nothing of ours | — |
| the claim write fails (EACCES, no root) | return 1, one line | nothing | — |
| a trap the caller sets itself, before or after sourcing | not detected (the gate: the flag only); it replaces the helper's and the folder may stay; T7a's scan refuses such a caller in the tree, T7d measures the replacement | folder + claim with a live-then-dead pid | the next sweep |
| `mkdir` fails, not EEXIST | return 1, one line | nothing of ours | — |
| normal end, `exit N`, a `set -e` abort, an `|| exit 1`; the caller's function failing inside the chain | the script's own status, unchanged by the chain (C2: `exit "$rc"`) | nothing of ours (a kept folder stays) | — (kept: the next sweep after 10 min) |
| SIGINT / SIGTERM / SIGHUP, trapped by the helper | `owned_signal` → `exit 130 / 143 / 129` → the EXIT chain; a signal that lands while `mkdir` runs is held until the state is recorded (C1), then raised the same way | as the line above | as above |
| SIGKILL between claim and `mkdir` | no trap runs | ONE orphan claim, pid dead | janitor and Node sweep on POSIX (J:779-784; L:538-571); listed `unverified:` by Node on Windows; the janitor on Windows only when armed; otherwise the C# sweep of E2.3 or a person |
| SIGKILL after `mkdir` | no trap runs | folder + claim, pid dead | the same |
| `owned_remove` gives up (five tries) | return 0, one line | folder + claim, prefixed and claimed | the same, once the pid is gone |

## 6. Scenarios — RED-first

`owned.test.sh` is bash, runs on the three legs, and makes its own private root with the helper under test:
`owned_dir ROOT selftest` in the real root (the first assertion: it exists and matches the name pattern), then every case
runs with `TMPDIR="$ROOT"`. The test's own EXIT trap is `owned_trap` + a function that kills its children. Every case runs
the helper in a REAL child `bash` process (a script file written under `$ROOT`), waits for it with `wait`, and reads the root
afterwards — never inside the test's shell. The premise of each case is asserted before the assertion. **RED today:** no
`owned.sh` exists, so every case fails on the source line; that RED is trivial and is recorded once. The meaningful REDs are
the by-hand ones named in the table, each run once and quoted on the PR: the two steps swapped (T13), the `released` state
not set (T8), the pending-signal handling removed (T20), the chain as `'<fn>; owned_cleanup'` (T18). The test prints
`$BASH_VERSION`, `$BASH` and `uname -s` first (Opus 11) and runs with `TESTSTODELETE_OWNER` and `TESTSTODELETE_RUN` unset
(asserted). **The janitor's scope** (Opus 9): `janitor.sh --token creds` also reads this checkout's worktrees and branches
(J:466, J:501) and, where `docker` exists, the daemon's containers, volumes and networks (J:317), all under the caller's
owner and the `creds` token. Before every janitor run the test asserts that `git worktree list --porcelain`,
`git for-each-ref refs/heads` and (when `docker` answers) `docker ps -a`, `docker volume ls`, `docker network ls` show no
name of the owner form with the `creds` token — so the only entries the janitor can act on are in the private root.
The Node sweep is given `repo` as the checkout and reads the same worktree list; the same premise covers it.

| # | Assertion | Premise it checks | RED today / by hand |
|---|---|---|---|
| T1 | the folder's basename matches `^testsToDelete-[uw][0-9]{1,10}-creds-x-[0-9a-f]{8}$`; its owner segment equals `node -e` `thisOwnerToken()` of the mount (a file URL import) | `node --version` runs; the mount's `owned.mjs` exists | no helper |
| T2 | `d.owner` is ONE LF line, `^[uw][0-9]{1,10}:[^@:[:space:]]+@(linux|macos|windows):[1-9][0-9]*` followed, **on Linux only, by `:<start>:<ns>`** and then the end of the line (on macOS and Windows the line ends after the pid); its owner equals the name's; `@os` matches `uname -s`'s class; on Linux the host equals `hostname` normalised (and `~$WSL_DISTRO_NAME` when set). **On Linux (added 2026-11-07, row E2.4-e): the mounted `parseOwner()` through `node -e` reads `start` and `ns`; `ns` equals the mounted `readPidNamespace()` on the same machine; `start` is within `START_TOLERANCE_S` (2 s) of the mounted `startFromProcStat()` for the child's own `/proc/<pid>/stat`. **And byte for byte (C4):** while the child sleeps, `node -e` builds `formatOwner({ owner: thisOwnerToken(), host: thisOwner().host, pid, start: processProbe(pid).start, ns: readPidNamespace() })` for the CHILD's pid (on macOS and Windows no `start`, no `ns`; on Windows `pid` is the winpid of T3) and the claim file is exactly that text plus one LF: the line read with `read -r` equals it and `wc -c` of the file is its length plus one | the record was read as one line (a second `read` fails); on Linux, `/proc/self/ns/pid` is readable; the child is alive during the compare | no helper; **by hand, Linux: `owned_owner` without the two fields → the `parseOwner` half fails (quoted)**; the tolerance half alone would pass a record one second off — the byte half is what catches a wrong `CLK_TCK` or a wrong field |
| T3 | Windows only: the record's pid equals `/proc/$!/winpid` of the running child, and `tasklist //NH //FO CSV //FI "PID eq <pid>"` lists it while the child sleeps | the child is alive (`kill -0 $!`) | no helper |
| T4 | the claim is older than the folder: with `OWNED_HOOK_AFTER_CLAIM` set to a function that records `[ -e "$1.owner" ] && [ ! -e "$1" ]`, the record is true; informative only: `[ "$d.owner" -ot "$d" ] || [ ! "$d.owner" -nt "$d" ]` | the hook ran (its marker file exists) | by hand: steps 1 and 3 swapped → the record is false |
| T5 | with `OWNED_TEST_IDS="aaaaaaaa bbbbbbbb"` and a claim of foreign content planted at `…-x-aaaaaaaa.owner`: the folder is `…-x-bbbbbbbb`, the planted claim's bytes are unchanged, no `…-x-aaaaaaaa` folder exists. **And the OS measurement (C5), on each leg:** two background children each run one plain `mkdir -- "$ROOT/race"` on the absent path and the parent counts the statuses: exactly one 0 and one non-zero; a folder `$ROOT/taken` holding `sentinel` is given to `mkdir` → non-zero and `sentinel` unchanged (Git Bash on NTFS is the leg this was never measured on) | the planted claim exists before the call; `$ROOT/race` is absent before the race | no helper; proves the exclusive create of each OS in a real child |
| T6 | `owned_dir d 'a/b'`, `owned_dir d ''`, `owned_dir d -x`, `owned_dir d <23 chars>`, `owned_dir 'd e' x` → return 1, the root unchanged, `d` unset | the root listing before equals after | no helper |
| T7a | **the callers' scan (the gate: no trap text is read at run time):** for every tracked file that sources `lib/owned.sh` (`git grep -l 'lib/owned.sh'`, the two helper files excluded), no line matches `^[[:space:]]*trap[[:space:]].*(EXIT|INT|TERM|HUP)`; the companion assertion: the same pattern finds the planted line inside a fixture string of the test itself (a scan that matches nothing passes forever, `testing.md`) | the scan finds at least one caller once E2.4.S2 lands (until then: the fixture only, and the test says so) | no helper; RED by hand: a `trap cleanup EXIT` line added to a caller |
| T7b | a child with `owned_trap cleanup` then `owned_dir`: return 0; after the exit the folder and claim are gone AND `cleanup`'s marker exists; `kill -TERM` to the same shape while it sleeps after `owned_dir`: status 143, the same | `declare -F cleanup` in the child | no helper |
| T7c | a child with no trap: after `owned_dir`, `OWNED_TRAP_SET` is 1 and `trap -p EXIT` run IN the child's own shell (no subshell; written to a file under `$ROOT`) names `owned_exit_chain`; after the exit nothing remains | the child has no trap before the call | no helper |
| T7d | **the limit, measured:** a child that sets `trap cleanup EXIT` AFTER its `owned_dir` → at its exit `cleanup`'s marker exists, `owned_cleanup` did not run, the folder and claim REMAIN; the test cannot remove them through `owned_remove` (C3: not its own entry), so it removes both by their exact paths with `rm -rf`, the one clean-up a test does by hand, named in its output | the trap was set after the call | no helper; the case documents § 8's limit, and goes red the day the helper detects a replacement |
| T8 | **the squatter:** with `OWNED_TEST_IDS="cccccccc dddddddd"` and `OWNED_HOOK_AFTER_CLAIM` planting the folder `…-x-cccccccc` holding `sentinel` (on the first call only): the child's `owned_dir` returns 0 with `…-x-dddddddd`, one warning names `cccccccc`; the CHILD EXITS normally; afterwards `…-x-cccccccc/sentinel` exists, `…-x-cccccccc.owner` does not, `…-x-dddddddd` and its claim are gone; the root holds exactly one entry | the sentinel exists before the child exits | by hand: the `released` transition removed → the sentinel is gone (§ 10 point 1) |
| T9 | **C3:** `owned_remove ""`, `owned_remove "$ROOT/other"`, `owned_remove "$ROOT/testsToDelete-u0-creds-x-00000000"` (another owner; planted), `owned_remove "$d/"`, and — process A (a child) passing process B's LIVE owned folder (B is a second child that made `b` with `owned_dir`, printed its path and sleeps): return 1, one line each, every planted entry and B's folder and claim remain unchanged (B's claim bytes compared) | the planted entries exist; B is alive | no helper |
| T10 | `owned_remove "$d"` on a folder the same child made: folder and claim gone, return 0, the entry's state released; a second call returns 1 (an entry already released is refused — consistent with § 3's list, whatever `rm -rf` of a missing path returns; Opus 6) | `$d` existed | no helper |
| T11 | POSIX: `chmod a-w "$parent"`, `owned_remove` → return 0, ONE stderr line, folder and claim remain; `chmod u+w` restores | `id -u` ≠ 0 and `[ ! -w "$parent" ]` | no helper |
| T12 | Windows: `PATH=/usr/bin bash -c 'source owned.sh; owned_token'` → return 1, one line; and `… owned_dir d x` → return 1, `d` unset, NOTHING in the root (no `testsToDelete--creds-…`, Opus 2). **And (Opus 7):** `TESTSTODELETE_OWNER=u77 bash -c 'source owned.sh; owned_token'` prints `w<digits>`, never `u77` | `command -v node` fails in the first child | no helper |
| T13 | **the kill between the two steps:** a child sources `owned.sh` with `OWNED_HOOK_AFTER_CLAIM=die` (`die() { kill -9 $$; }`) and calls `owned_dir d x`; the child dies by signal 9 (`wait` returns 137); the root holds exactly ONE entry, `…-x-<id>.owner`, and no folder; `kill -0 <pid>` fails; the claim is aged by `touch -t 200001010000`; Linux and macOS: `JANITOR_MIN_AGE_MINUTES=10 bash .claude/rules/shared/tools/janitor.sh --token creds` with `TMPDIR="$ROOT2"` (a second private root holding only this claim) exits 0 or 3 and the root is EMPTY; a third root with the same shape fed to the mounted `sweepLeftovers({ tmp, token: "creds", repo })` through `node -e` is empty afterwards, `result.removed` names the claim | the child was killed between the steps (the hook's marker exists; the claim exists; the folder does not); **on Linux the claim's record ends in `:<start>:<ns>` (T2's check, asserted here before the sweep; 2026-11-07, row E2.4-e)** | **by hand, RED:** steps 1 and 3 swapped → an UNCLAIMED folder that both sweeps list (`unmarked:`) and keep |
| T14 | Windows, the same kill: ONE claim, no folder; **the claim aged by `touch -t 200001010000` first (Opus 8: a young claim is skipped in silence, J:675, L:553)**; the janitor (not armed) prints its dry-run line on stderr; when `[ -O "$claim" ]` is true its stdout holds `would run: rm -f -- <claim>`, when false the claim is listed as not the caller's and the test prints `F31: the claim belongs to another owner on this runner`; the mounted Node sweep lists `unverified: <claim> — the owner SID is not read on Windows (F16)`, `removed` is empty, the claim remains | `JANITOR_WINDOWS_E2E_GREEN` is unset; the claim's mtime is in 2000 | no helper (§ 10 point 4) |
| T15 | a kill AFTER the `mkdir` (`kill -9 $$` from a child of the script): folder AND claim remain with the dead pid; aged with `touch -t` (both); Linux and macOS: the janitor removes both (root empty); Windows: as T14 | the folder exists before the kill; **on Linux the claim's record ends in `:<start>:<ns>` (2026-11-07, row E2.4-e)** | no helper |
| T16 | `OWNED_KEEP=1 owned_dir d x` in a child: after the exit folder and claim remain; the claim names the child's pid; aged, the janitor collects both on Linux and macOS | the child exited 0; **on Linux the claim's record ends in `:<start>:<ns>` (2026-11-07, row E2.4-e)** | no helper; **by hand, Linux, once (2026-11-07): the same case with the record cut after the pid → the janitor keeps both (`unknown`), quoted — the counterexample of the parent's item 8.1** |
| T17 | by hand on the head: `node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"` lists no finding under `.github/scripts/lib/`; `git grep -n REPO_TOKEN -- .github/scripts/lib` is one line | the guard reads `.sh` files (the 9 `raw-temp` findings of E2.3's run are still present or are E2.4.S2's) | no helper |
| T18 | **C2:** a child under `set -euo pipefail` with `cleanup() { touch "$marker"; false; }`, `owned_trap cleanup`, `owned_dir d x`, `exit 3`: the parent sees status 3, the marker exists, the root is empty afterwards; the same child with no `owned_trap` and `exit 3`: status 3, root empty | the child's `set -o` shows errexit on | **by hand, RED:** the chain as `trap 'cleanup; owned_cleanup' EXIT` → status 1, folder and claim remain (the consultation's reproduction) |
| T19 | **`set -u` (Opus 4):** a child `set -u; source owned.sh; owned_trap f; exit 0` → status 0 and no "unbound variable" on stderr; the same with `owned_cleanup` called twice with nothing registered | the child's bash is the leg's (on macOS `3.2`) | no helper; RED by hand: a `"${OWNED_PATHS[@]}"` loop → macOS red |
| T20 | **C1, the signal window:** (a) a child under `owned_trap cleanup` redefines `owned_create_dir() { mkdir -- "$1"; kill -TERM $$; return 0; }` after sourcing and calls `owned_dir d x`: the child ends with 143, `cleanup`'s marker exists, and the root holds NO folder and NO claim (nothing survives, so nothing survives unclaimed); (b) the same stub returning 1 on a planted `…-x-<id>` holding `sentinel` (`OWNED_TEST_IDS` fixes the id; the stub sends the signal, then returns 1): the child ends with 143, `sentinel` exists, the planted folder has no `.owner`, nothing else remains | the stub ran (its own marker); the signal was sent before the stub returned | **by hand, RED:** `owned_signal` exiting at once (no `OWNED_BUSY` check) → (a) leaves the folder WITHOUT its claim |
| T21 | the test prints `$BASH_VERSION`, `$BASH`, `uname -s` on every leg; on Darwin it asserts `$BASH_VERSION` starts with `3.2` and `$BASH` is `/bin/bash` (Homebrew's bash 5 is first on the runner's `PATH`, so the step runs `/bin/bash` there, § 7) | — | no helper |

**The two kills are real.** `kill -9` on Linux and macOS; on Git Bash `kill -9` ends the MSYS process and Windows ends
the `bash.exe`; `wait` reports the signal. The dead pid in the claim is the Windows pid (T3), so a reader of the record
asks `tasklist` about a pid that is gone.

## 7. The self-test step in `ci-clients.yml`

After *Self-test the version smoke script* (`:90-91`), before the build; the mount (`:74-75`) and Node 22 (`:78-82`) are
already there. Three OSes through the job's matrix; `shell: bash` is the job default (`:59`).

```yaml
      # E2.4.S1: the bash helper of common/test-leftovers.md §2 (claim → register → create, no temp-path API) in real
      # child processes on this leg's bash: Linux, macOS 3.2 (/bin/bash — Homebrew's bash 5 is first on PATH there), Git
      # for Windows. The kill between the two steps leaves an orphan claim the janitor collects on Linux and macOS; on
      # Windows the Node sweep lists it `unverified:` (F16) and the janitor runs as a dry run (its contract). The janitor
      # also reads this checkout's worktrees and branches and the runner's Docker objects in the `creds` scope; the test
      # asserts first that none is prefixed, so its only removals are inside the private roots it made.
      - name: Self-test the shell helper
        run: |
          if [ "$RUNNER_OS" = macOS ]; then /bin/bash .github/scripts/lib/owned.test.sh; else bash .github/scripts/lib/owned.test.sh; fi
```

`ci-server.yml`'s shellcheck step gains `.github/scripts/lib/owned.sh` and `.github/scripts/lib/owned.test.sh`
(S4 Files, `ci-server.yml:257-262` at the stories' anchors; the coder re-reads the line at HEAD).

## 8. What this story does not prove

- A race of two LIVE scripts on one name; the exclusive create is exercised once per OS against a planted claim (T5).
- That a Node, C# or janitor reader judges a record this helper wrote on a machine other than the runner (T13–T16 run the
  shipped janitor and the mounted Node sweep on the runner itself; the C# sweep is not run here).
- Windows collection: the Node sweep lists (F16); the janitor removes nothing unless armed; on the elevated hosted runner the
  claim may read as a stranger's (F31) — T14 records which outcome the runner gave.
- The callers (E2.4.S2, S4): what `start-server-and-wait.sh`'s kept log, acme's `cleanup` or the nine worlds do is theirs.
- A `trap` a caller sets itself, on EXIT or on a signal, before or after its first `owned_dir`: it replaces the helper's;
  `OWNED_TRAP_SET` cannot see it (the gate: the flag only). T7a's scan refuses it in the tree, T7d measures what it does.
- A FIFO or a link planted at the drawn claim name between the `-e` pre-check and the write: the pre-check and the
  read-back close the link case; a FIFO planted in that window would block the write (bash has no `O_NONBLOCK`). Listed, not
  solved: the roots the callers use are the runner's or the user's own.
- Anything about the real temp root of a developer's machine: every case runs in a private root; the janitor's wider scope
  (worktrees, branches, Docker) is asserted empty, not exercised.

## 9. Build order and commands

1. `owned.sh` with the state arrays, `owned_trap`, the chain and the signal handling (§ 3, § 4); 2. `owned.test.sh` T1–T21,
RED seen on the source line once, then GREEN per leg; 3. the by-hand REDs (T4/T13 swapped order, T8 state, T20 pending
removed, T18 chain, T19 array loop, T7a a planted trap line), quoted; 4. the CI step and the shellcheck line; 5. T17 on the
head. One commit series on the epic's branch; the epic's plan gate (`263fa36d`) covered this spec with the E2.4 brief.

```bash
bash .github/scripts/lib/owned.test.sh                                   # WSL/Linux; and once under Git Bash where one is at hand
docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:v0.11.0 .github/scripts/lib/owned.sh .github/scripts/lib/owned.test.sh
node .claude/rules/shared/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"
JANITOR_MIN_AGE_MINUTES=10 bash .claude/rules/shared/tools/janitor.sh --token creds --dry-run   # the real root, read only
```

## 10. The consultation's four points, settled

**Point 1 — creation state, not a path list.** The S4 block (S4:944-948) registers `OWNED_MADE+=("$dir")` in step 2 and, on a
squatter, "the own claim removed … never the folder, draw again" — but never unregisters the path, so `owned_cleanup` at EXIT
would `rm -rf` the squatter's folder: the one outcome rule §2 forbids ("a resource already there under the claimed name is
… never removed", R:79-83). Settled by § 4: each entry carries a state, as the reference's `made = { folder, claimed }`
(O:653-667); the cleanup removes a folder only in `created`, a claim only in `claimed`/`created`. T8 plants the squatter with
a sentinel and checks it AFTER the child exited. This carries out the stories' own text; it changes no decision.

**Point 2 — the trap check.** The block says: "`trap -p EXIT` empty → `trap owned_cleanup EXIT`; not empty and not naming
`owned_cleanup` → one line, the own claim removed, return 1 (a script with its own trap calls `owned_cleanup` inside it and
sets it BEFORE its first `owned_dir`)" (S4:944-946), and acme: "`trap cleanup EXIT` … so the EXIT trap's body names
`owned_cleanup`, as `owned_dir` requires (its check)" (S4:1024-1029). `trap -p EXIT` prints `trap -- 'cleanup' EXIT`: the
BODY of `cleanup` is not in that text, so a string check rejects the plan's own caller. Settled by `owned_trap <fn>` (§ 3):
the caller registers its function through the helper, which installs `owned_exit_chain` (C2: the function, then
`owned_cleanup`, then `exit "$rc"`) and sets `OWNED_TRAP_SET=1`; `owned_dir` reads the flag and NOTHING else — the plan gate
(`263fa36d`) struck the one read of `trap -p EXIT` this spec had, because bash 3.2 clears traps in a subshell and the read
would have answered "no trap" for a caller that has one. So a trap a caller sets itself is not detected at run time; the
migrated callers are checked by T7a's scan, and T7d measures the replacement. The decision ("the trap is set before the
first `owned_dir`, its body runs `owned_cleanup`, `owned_dir` checks it") stands; the spelling of one line in acme and in
`start-server-and-wait.test.sh` becomes `owned_trap cleanup` (Q1, settled by the parent's epoch 8), and acme's two signal
lines are `owned_trap`'s now (§ 11 Q8).

**Point 3 — portability.** § 3 lists what the two files do not use. The age of a claim is set with `touch -t 200001010000`
(POSIX; age only selects, so any past date serves); comparing the claim is a bash `read`; the Windows pid is a `read` of
`/proc/$$/winpid`; `sleep 0.1` is accepted by GNU and BSD `sleep` and is proven by T11 on macOS. Every case runs in a real
child `bash` (§ 6), so bash 3.2's and MSYS's exclusive create (T5, with C5's `mkdir` race), kill (T13, T15), trap handling
(T7b–d, T18, T20), `set -u` arrays (T19) and pid (T3) are measured, not assumed. The one premise this spec first left
unmeasured — bash 3.2 and `trap -p` inside `$( )` — is gone with the read (the gate: bash 3.2 clears it); T21 prints and
asserts the macOS bash so a leg that silently ran bash 5 cannot pass as 3.2.

**Point 4 — sc. 3 on Windows.** Sc. 3 says: "on Windows (a dry run unless armed) the janitor's output names the claim as what
it would remove, and the same root fed to the Node reference's `sweepLeftovers({ tmp })` through `node -e` is empty
afterwards — measured, not assumed" (S4:1070-1072). The mounted reference says: "Windows lists and changes nothing (F16,
interim) … an orphan claim to delete — is reported in `result.listed` as `unverified: <path> — the owner SID is not read on
Windows (F16)`, and `removed` stays empty" (L:26-29); the stories' own D3/N19 say "the Node sweep only lists on Windows, the
C# one collects" (the parent's F16 (b), 2026-11-01), and S2 sc. 5–6 "assert the `unverified:` listing on Windows and removal
on POSIX" (E2.1 Done-when). The document's own decision is followed: T14 asserts the `unverified:` line and the claim
preserved. The janitor half: the sc. 3 text holds where the claim's kernel owner is the caller; on the elevated
`windows-latest` it may be `BUILTIN\Administrators` (§ *Goal*'s exception: "reads as a stranger's under rule §4's two keys.
No sweep removes it"), so T14 asserts the outcome the runner's own `[ -O ]` gives and says which (the E2.3.S2 pattern,
revision row 11). Whether the sc. 3 sentence is corrected in the stories document is § 11 Q5.

## 11. Open questions, each with a recommended answer

Each went to the coordinator before the plan gate; Q1, Q2, Q3, Q6, Q7 are settled as recommended by the parent's epoch 8
(item 4.3.3), Q4 is closed by the gate, Q5 by row E2.4-g; Q8 is new (2026-11-09). A "yes" marked CHANGE would be the
parent's entry 8.1 (epoch 8 is open with no change used; the second change stops the plan).

- **Q1 — `owned_trap` as the callers' spelling.** *Recommended:* yes; acme's `trap cleanup EXIT` (S4:1024) and
  `start-server-and-wait.test.sh:43`'s become `owned_trap cleanup`, written by E2.4.S4 and S2. Not a change in the author's
  reading: it makes the decided check possible and changes no behaviour the stories decide (§ 10 point 2). In doubt it
  counts: the coordinator says.
- **Q2 — the second seam `OWNED_TEST_IDS`.** *Recommended:* yes; a test-only seam of the same class as `OWNED_HOOK_AFTER_CLAIM`
  (S4:949, "unset in every real run"); without it T5 and T8 cannot plant at the name about to be drawn. Not a change: test
  infrastructure, no behaviour of a real run.
- **Q3 — `TESTSTODELETE_RUN` and `TESTSTODELETE_OWNER`.** *Recommended:* `owned.sh` reads neither in S1 and says so in its
  header: the S4 block lists no use of them; no S4 caller runs under a Node runner that exports a run record; honouring the
  override would need the grammar check and the fail-closed rule of R:35-37, and honouring the run record would need a
  liveness probe (rule §3, "naming a LIVE run of the caller"), both behaviour the block does not list. Reading them would be
  a CHANGE (contract). Recorded as a limit for the parent.
- **Q4 — closed by the plan gate (2026-11-09).** It asked what to do if bash 3.2 does not show the parent's trap inside
  `$( )`. The gate's answer: it does not, and the helper reads no trap text at all — `OWNED_TRAP_SET` only. The one-line
  callers keep their contract (the first `owned_dir` installs the traps); a caller's own trap is a contract breach that
  T7a's scan finds in the tree. No file beside the claim, no `declare -p`.
- **Q5 — the sc. 3 Windows sentence.** *Recommended:* leave the stories text, record in E2.4's PR and this spec that T14
  asserts the reference's F16 behaviour and the runner's F31 outcome (§ 10 point 4), as the E2.1 record did for sc. 8c
  (`[E2.1 win 8]`: "superseded by risk 2, which the coordinator accepted"). Editing the sentence is wording if the coordinator
  reads it so; in doubt it counts.
- **Q6 — where the kill cases run by hand.** *Recommended:* the three CI legs are the record; a Git Bash run on the owner's
  machine is welcome but not a merge condition (the owner said 2026-11-04 his machine does not test creds). Not a change.
- **Q7 — the id's randomness.** *Recommended:* two draws of bash's `$RANDOM` formatted as 8 hex characters; no external tool,
  no `/dev/urandom` read. The exclusive claim, not the id, is what prevents a shared name (rule §2), and a collision only
  draws again. Not a change (the block says `<8 hex>` and nothing more).
- **Q8 — acme's `trap 'exit 130' INT` / `trap 'exit 143' TERM` (S4:1024-1025) under C1.** `owned_trap` installs the INT,
  TERM and HUP traps itself (`owned_signal`): a caller's own signal trap would replace them and re-open the window C1
  closes. *Recommended:* E2.4.S4's `run.sh` writes `owned_trap cleanup` and NO signal trap of its own; the exit codes 130
  and 143 are the same as the stories' lines give. Not a change in the author's reading: the stories decide "an interrupt
  runs the EXIT trap once" (S4:1025), and `owned_signal` is that; the two lines move, their effect stays. In doubt it
  counts: the coordinator says, and the E2.4 brief's § 3.3 line for acme follows.
  *Coordinator, 2026-11-09: not a change.* The stories' decision is the effect ("an interrupt runs the EXIT trap once",
  S4:1025, exit codes 130 and 143); `run.sh` is E2.4.S4's own file, and routing its top-of-script trap through the helper
  is how that story is built, with the same outcome. The brief's § 3.3 writes `owned_trap cleanup` and no signal trap.

## 12. Risks (at most three)

1. **A removal in the wrong state.** The helper's one deletion is `rm -rf` on a path it computed. A wrong state transition
   (the squatter case) or a bare-prefix pattern turns a cleanup into a foreign removal. Hence § 4's states mirrored from the
   reference, `owned_remove`'s pattern with the caller's token, T8 checked after the child's exit, and the by-hand RED of the
   state removed. Cornerstone.
2. **The guard's reading of a new helper.** The shipped guard knows one helper folder; `owned.sh` is new text with the prefix
   in it. `${OWNED_TOKEN}` right after the prefix reads as an owner segment (`prefix-bindings.mjs:11,287`), and the `.sh`
   `raw-temp` detector is `\bmktemp\b` only; but `owner-blind` takes no exemption, so a finding is a rewrite before the
   epic's evidence run. T17 runs early, on the first draft.
3. **Three bashes, three behaviours.** bash 3.2's empty arrays under `set -u` and its trap handling (T19, T20), MSYS's
   exclusive create and `kill -9` (T5, T13), the elevated runner's file owner (F31, T14), and the timing of a trapped signal
   around `mkdir` (C1, T20 — certain in the test because the stub sends it, a race in real life). Each is a measured premise
   of one case, so a difference is a RED with a name, never a green that proves nothing.

## 13. Definition of Done

- [ ] Rows 1–20 of § 2 each have an evidence line on E2.4's PR (the three legs' run URLs; the by-hand REDs quoted).
- [ ] T1–T21 GREEN on the legs that own them; the trivial RED recorded once; the by-hand REDs quoted (T4/T13, T8, T20, T18,
      T19, T7a).
- [ ] T14's output on the Windows leg quoted: the `unverified:` line, and which `[ -O ]` outcome the runner gave; T2's
      byte-equal record quoted once per leg; T21's `$BASH_VERSION` line on macOS starts with `3.2`.
- [ ] shellcheck 0.11.0 clean on both files; T17 clean; the token constant found once.
- [ ] Q8 answered by the coordinator before the first code commit; a CHANGE answer stops the story until the parent's ledger
      says so.
- [ ] A `review_plan` round on the E2.4 brief with this spec reached `proceed` before the first code commit; an Opus review of
      the helper against rule §2–§3 and § 4 of this spec before the code gate.
