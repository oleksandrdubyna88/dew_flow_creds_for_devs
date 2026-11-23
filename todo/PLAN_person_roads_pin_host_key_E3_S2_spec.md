# PLAN — E3.S2 spec: the launch instrument of the real `sshd` runs (W4; decision 16; test 33)

> Status: **spec, 2026-11-23, by Opus; not built.** Story E3.S2 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its decision 16; §3.7, *Added by epoch 3*; test 33 of its §5;
> §6, *E3.S2 (the instrument) updates*; the group *E3.S2* of its §8; `## Epics`, E3: the line of E3.S2, *The setup of every measurement*
> with *The stop of the listener alone*, *The launch instrument* and *The identities*, and row M3) and of its stories document
> [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md) (`## E3.S2`, its settled items 7, 8 and 9, and the lead's
> answers Q4 and Q5). The parent, the stories document and `todo/README.md` do not name this file yet: the lead adds the links and the
> row (*Notes for the lead*). This file is promoted together with the parent.
>
> Scope: `src_vs_code/scripts` and one new test file. New: `scripts/lib/sshdRun.cjs` (the one place of the executable and of every sshd
> config text), `scripts/itestServing.cjs` (the serving launcher, its listener-only stop and `endServer`, moved out of section 10),
> `scripts/itestListenerStop.cjs` (leg 0: a master outlives its listener), `scripts/itestIdentities.cjs` (the record of identities),
> `src/test/itestInstrument.test.ts` (test 33). Changed: `scripts/itestSshd.cjs`, `scripts/itestPinnedRoads.cjs`,
> `scripts/itestNoSharing.cjs` (one optional parameter and one export), `scripts/ssh-agent-itest.cjs` (a comment); and
> `research/module_tests.md`. No file of `src_vs_code/src` outside `src/test/`, no workflow, no product behaviour. **Every `file:line`
> below was read on `fix/g1-e3-release-gate` at `65a8cb3b`, on 2026-11-23.** While this spec was written the branch moved to
> `5b8078c8` (E3.S1's review: one line of `src_vs_code/CHANGELOG.md` and one of `src/hostKeyPin.ts`); `git diff 65a8cb3b 5b8078c8 --
> src_vs_code/scripts src_vs_code/src/test .github` is empty, so no reference here moved. Opus writes this spec, a Sonnet coder builds
> it, Opus reviews it.

"The parent" is the plan linked above; §3.7 and so on are the parent's sections, and "§2 of this spec" is this document's. "The
stories document" is the E3 document linked above. This document's own names: the facts F1 to F24, the rows of test 33 (33a to 33g),
leg 0 and its checks L0.1 to L0.9, the checks of the record R1 to R6, the mutations MU1 to MU12, the break-its BR1 to BR11.
"A counterpart" is an `sshd` that a run starts for itself. "The listener" is the first process of a serving `sshd -D -e`: the one that
listens on the port and forks a process for each connection. "The run's lines" are the extra config lines that a run hands as a
parameter; "the caller's lines" are the lines that one call of a starter adds (section 7's RSA line, a row's forced command). This
document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`), and the parent's epoch 3 has one
entry (3.1), so a second one stops the whole plan.

## What E3.S2 builds, in one paragraph

Before E3.S2 the path of the `sshd` is a constant (`scripts/itestSshd.cjs:13`), and two functions write an sshd config, each with its own
list of lines (`itestSshd.cjs:102-117`, `itestPinnedRoads.cjs:68-84`). A local run on an `sshd` that the user unpacked therefore needed
a scratch COPY of the repository with three edits (the stories document of E1, item 1), and decision 16 bars such a copy for a row.
E3.S2 makes the executable and the extra config lines two parameters of the run, two environment variables, read in ONE place,
`scripts/lib/sshdRun.cjs`, which also writes both config texts. With no parameter the executable is `/usr/sbin/sshd` and both texts
are, byte for byte, what they were, so CI starts what it started before. The serving launcher (`sshd -D -e`, every connection), which
every row uses, moves into a file of its own, `scripts/itestServing.cjs`, with the end of a leg (`endServer`, unchanged) and a NEW stop
of the listener alone, by its own pid. A new leg 0 of section 10 shows that a master connection outlives its listener and carries one
more command. At the end of section 10 a record of identities is written and printed: the commit, the answer of
`git status --porcelain --untracked-files=no` (empty, or the run fails), the pin of the shared rules, and the path, version and SHA-256
of every program that ran and the SHA-256 of every config text that the run handed out. Test 33 holds the one place by a scan of every
script and by what the module answers.

| File | Change | Lines (measured on a draft, F21) | Where |
|---|---|---|---|
| `scripts/lib/sshdRun.cjs` (new) | `sshdRunOf(env)`: the run's executable and lines, read from `CREDS_ITEST_SSHD` and `CREDS_ITEST_SSHD_CONFIG`, refused with the variable's name when they cannot be used; `oneConnectionConfig`, `servingConfig`: the two config texts | 128 | §2 |
| `scripts/itestSshd.cjs` | `RUN = sshdRunOf(process.env)`, `SSHD = RUN.executable`; `startSshd` writes `oneConnectionConfig(RUN, …)`; exports `RUN` too | 238 → 232 | §3 |
| `scripts/itestServing.cjs` (new) | the serving launcher (`startServingSshd`, now with the caller's lines), `programOf` (`/proc/<pid>/exe`), `stopListener` (new), and, moved byte for byte from section 10, `startOf`, `alive`, `below`, `descendantsOf`, `signalAll`, `noneAlive`, `descendantsOfListener`, `endServer` | 188 | §4 |
| `scripts/itestPinnedRoads.cjs` | the moved functions leave (`:67-212`); it imports them; `pinnedLegs` runs leg 0 and writes the record; its header comment | 683 → 545 | §5 |
| `scripts/itestNoSharing.cjs` | `runClient` takes the program as an optional last parameter (default `'ssh'`), and is exported | 443 → 443 | §6 |
| `scripts/itestListenerStop.cjs` (new) | leg 0: the listener-only stop with a master that outlives it and carries one more command | 95 | §7 |
| `scripts/itestIdentities.cjs` (new) | the record of identities: written into the section's folder and printed as one line; checks R1 to R6 | 131 | §8 |
| `src/test/itestInstrument.test.ts` (new) | test 33: 33a to 33g, 7 tests | 175 | §9 |
| `scripts/ssh-agent-itest.cjs` | the comment of section 10 names leg 0 and the record | 772 → 773 | §12 |
| `research/module_tests.md` | where the counterpart comes from, the exact command, the parameters, leg 0, the record, the story's run | — | §12 |

## Binding constraints

- **No plan change.** Build what the parent, the stories document and this document say. If a step cannot be done as written, a test
  is not RED or GREEN as this document says, or a leg of the story's run fails: stop and tell the lead. Do not repair the parent, the
  stories document or this document. The parent's epoch 3 has one recorded change (3.1); a second one stops the whole plan.
- **No tracked file is edited to hand a parameter.** The two variables are the only way in. A run that needs a change of a tracked
  file to start its `sshd` is a failure of this story, not a recipe.
- **With no parameter nothing that a counterpart is handed changes.** The executable is `/usr/sbin/sshd`, and every config text is
  byte for byte the text of `65a8cb3b` (33d holds it). Under `CI=true` a missing `sshd` still FAILS where it failed before
  (`ssh-agent-itest.cjs:500`, `:635`; `itestForwardAgent.cjs:200`; `itestNoSharing.cjs:413`; `itestPinnedRoads.cjs:663`;
  `bridged-ssh-itest.cjs:381`): those lines do not change.
- **The five scripts that import from `itestSshd.cjs` keep what they call** (the stories document, settled item 8): every name of its
  exports stays, `startSshd` keeps its signature, `runClient` keeps its behaviour for its four callers in section 9.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first: read its exit before any test result.
  The test file reaches `lib/sshdRun.cjs` at run time (`createRequire`), so it compiles before the module exists (F19).
- **Keep what the runner printed.** Save each RED text, each mutation's output and the whole output of the story's run. Quote them in
  the commit bodies (§14).
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes. No revert, no amend, no rewrite
  of history. Never a bare `git stash`. Never commit `.claude/settings.json`. Nothing of the unpacked `sshd`, its wrapper, its config
  file or a scratch path enters a committed file.
- **Limits.** Every script file at most 800 lines (the repository's rule; ESLint checks only `src/**/*.ts`, `eslint.config.mjs:23`). The
  test file: ESLint's limits for `src/test` (`max-lines-per-function` 120, complexity 4; `eslint.config.mjs:30-32`, `:58-60`). No new
  `eslint-disable`.
- **No script names an sshd by a path in quotes**, not even in a comment: the scan of 33a reads comments too. Name the default as
  `SSHD_DEFAULT`, never as the path in quotes or backticks (§9, *What the scan cannot see*).
- **Every process is ended by its pid and start time, never by name and never by a process group.** `stopListener` signals the
  listener's pid only (through `endChild`).
- **Tests leave nothing outside an owned folder.** The new test uses `ownedDir` under its own `cleanupScope`, closed in `after`. Every
  file of leg 0 and of the record is inside the section's owned `pin` folder.
- **Node only.** No Python, also not for a helper. Write files with the Edit or Write tool, not with a shell heredoc.
- **Every launch is exe + argv with a time limit** (`security.md`, *External processes*): `git` and `<program> -V` through `execFile`
  with a 10 s timeout; the clients through `launch` and `settledAfter`, as section 9 does.

## Facts read on `65a8cb3b` and measured on 2026-11-23 that this spec uses

| # | Fact | How |
|---|---|---|
| F1 | **The constant.** `scripts/itestSshd.cjs:13` is `const SSHD = '/usr/sbin/sshd';`. It is exported (`:238`, with `setChildTemp`, `launch`, `startSshd`, `endChild`, `lastLines`, `login`, `freePort`, `listeningFailure`, `checkedPinOf`). A search of `scripts/` for a quoted literal that ends with `/sshd` finds this line alone | read; the scan 33a on this tree (§10) |
| F2 | **The one-connection config.** `startSshd(scope, sshdDir, hostKeyPath, authorizedKeys, extraConfig = [], options = {})` (`:94`) writes `ListenAddress`, `options.first`, `HostKey`, `AuthorizedKeysFile`, `PidFile`, `UsePAM no`, `StrictModes no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `extraConfig`, and an empty last line (`:102-117`), and starts `launch(scope, SSHD, ['-d', '-e', '-f', config])` (`:118`). Its docblock says that `sshd` keeps the first value of a keyword (`:89-92`): the passwords legs of the bridged harness rely on it (`options.first`, `itestBridgedTrust.cjs:213`, `bridged-ssh-itest.cjs:82`, `:107`) and pass in CI | read |
| F3 | **The serving config and launcher.** `servingConfig(rig, dir, hostKey, port, penalties)` (`itestPinnedRoads.cjs:68-84`) writes `ListenAddress 127.0.0.1:<port>`, `HostKey`, `AuthorizedKeysFile`, `PidFile`, the four `no` lines, `LogLevel VERBOSE`, `PerSourcePenalties no` when `penalties`, and an empty last line. `startOnce` (`:87-95`) starts `launch(rig.scope, SSHD, ['-D', '-e', '-f', config])` (`:90`) and takes the listener's identity at once (`:92`). `startServingSshd(rig, name, hostKey, port)` (`:103-122`) makes the folder `rig.dir/<name>`, falls back without `PerSourcePenalties` and once more on `Address already in use`. It takes no lines of a caller | read |
| F4 | **The ends.** `startOf`, `alive` (`:125-136`), `below`, `descendantsOf` (`:139-161`, `ps -e -o pid=,ppid=` with a 5 s timeout), `signalAll`, `noneAlive` (`:164-174`), `descendantsOfListener` (`:181-188`), `endServer(server, clients, taken)` (`:198-212`). `endServer` lists what the listener forked, signals the clients, waits, TERMs and KILLs what is left by pid and start time, then `endChild(server.sshd)`. No function of section 10 ends the listener alone | read |
| F5 | **`endChild` signals one pid.** `endChild(result)` (`itestSshd.cjs:153-162`) calls `result.child.kill()` (SIGTERM to the child's pid), waits up to 5 s for `exit`, then SIGKILL and 5 s more. `launch` starts the child with Node's `spawn` and no `detached` (`:26-31`), so the child is in the harness's own process group: a signal to the GROUP would reach the harness | read |
| F6 | **The callers of `itestSshd.cjs`** (a search of `scripts/` for `require('./itestSshd.cjs')`): `ssh-agent-itest.cjs:51` (`SSHD`, `setChildTemp`, `startSshd`, `launch`, `endChild`, `lastLines`, `login`), `itestForwardAgent.cjs:23` (`SSHD`, `launch`, `startSshd`, `endChild`, `checkedPinOf`), `itestNoSharing.cjs:34` (the same five), `itestPinnedRoads.cjs:26` (`SSHD`, `launch`, `endChild`, `freePort`, `listeningFailure`), `bridged-ssh-itest.cjs:19` (`SSHD`, `launch`, `endChild`), `itestBridgedRig.cjs:15` (`launch`, `startSshd`, `endChild`), `itestBridgedTrust.cjs:11` (`endChild`, `launch`), `bridged-mysql-itest.cjs:35` and `lib/psqlRig.cjs:10` (`launch`, `endChild`). `src/test/harnessScope.test.ts:15` loads the file in a child too | read |
| F7 | **Who writes an sshd config.** A search of `scripts/` for a literal that opens with `ListenAddress `, `HostKey `, `AuthorizedKeysFile ` or `PidFile `: `itestSshd.cjs:105`, `:107-109` and `itestPinnedRoads.cjs:70-73`, nothing else. The callers' own lines: section 7's `PubkeyAcceptedAlgorithms +ssh-rsa`, the bridged rig's `AcceptEnv BRIDGE_TEST_*` (`bridged-ssh-itest.cjs:124`, `:132`, `:150`) and its `first` lines; no `Match` line anywhere | read; the scan 33c (§10) |
| F8 | **The precedent for a program named by a variable.** `CREDS_ITEST_GIT` (`git-transport-itest.cjs:36-44`, an empty value counts as not set), `BRIDGED_MYSQL_ORACLE` and `BRIDGED_MYSQL_MARIADB` (`bridged-mysql-itest.cjs:26`, `:438`, each with a default path) and `BRIDGED_PSQL` (`bridged-psql-itest.cjs:192`); CI sets the two mysql ones for a client that it unpacked (`ci-extension.yml:188-189`). No script reads a variable whose name holds `SSHD`; no file of the repository names `CREDS_ITEST_SSHD` | read; a search |
| F9 | **CI.** `ci · extension`, job `build-test` on `ubuntu-latest` (`ci-extension.yml:28`): `test -x /usr/sbin/sshd ||` an apt install of `openssh-server` (`:162-165`), then `npm run itest:ssh-agent` (`:168`), `itest:bridged-ssh` (`:174`), `itest:bridged-mysql` (`:194`), `itest:bridged-psql` (`:208`); the job `bridged-ssh-images` runs `itest:bridged-ssh` on `ubuntu-22.04` and `ubuntu-24.04` with the same install (`:240-279`). No step sets a variable of this story. The runner's client and `sshd` were 9.6p1 on 2026-11-18 (`research/module_tests.md:2572`, measured by E1's reviewer) | read |
| F10 | **Section 10's order** (`pinnedLegs`, `itestPinnedRoads.cjs:642-656`): keys, the client config, the shim (`real`, the real client by its real path), the client's answer, leg 1, leg 2 (only when leg 1 gave a port). `livePinnedRoads` (`:658-681`) skips off Linux, fails a missing `sshd` under `CI=true`, makes the owned `pin` folder under the short socket root (`:673`), and closes the section's scope in a `finally` | read |
| F11 | **Section 9's master.** `sharingConfig` (`itestNoSharing.cjs:115-121`) writes `ControlMaster auto`, a control path in the owned folder and `ControlPersist 60` ("finite on purpose", so a master that a killed run strands ends by itself). K-A ends a detached master with `ssh -O exit` and waits for its control socket to go (`:200-202`). `runClient(rig, config, argv, env = rig.env)` (`:172-182`) starts `'ssh'` by the `PATH` of `env`, with `-F config`, bounded 20 s; it is not exported (`:443`) | read |
| F12 | **The shim.** `installShim` (`itestPinnedRoads.cjs:270-285`) puts `-F <rig.clientConfig>` before the product's argv and records every start into `rig.records`. A client started through `rig.env`'s `PATH` by the name `ssh` goes through it | read |
| F13 | **`git status` here.** In this worktree `git status --porcelain --untracked-files=no` answered nothing and exit 0 (2026-11-23), with `node_modules` inside `.agents/conventions` (ignored by that repository's `.gitignore:2`). `git rev-parse HEAD:.agents/conventions` answered `c598a11b…`, the same as `git -C .agents/conventions rev-parse HEAD` | measured |
| F14 | **The machine has no `sshd`.** `command -v sshd`: nothing. `/usr/sbin/sshd`: no such file. `/usr/lib/openssh/` holds `ssh-keysign`, `ssh-pkcs11-helper`, `ssh-sk-helper` only. A search for a file `sshd`, `sshd-session` or `sshd-wrap.sh` under `/tmp` and `/home/jinx` (depth 8), and for `sshd`, `sshd-session` or an `openssh-server*.deb` on the root file system (`find / -xdev`), found nothing. The machine started at 2026-11-23 10:15 (`uptime -s`), and a restart empties `/tmp`, where the scratchpads of E1.S4 and E2.S4 held their unpacked `sshd` (E2.S4's spec §5.1: `$SP/g1s4-sshd`). `ssh -V`: `OpenSSH_10.2p1 Ubuntu-2ubuntu3.8, OpenSSL 3.5.5 27 Jan 2026` | measured |
| F15 | **The recipe of an unpacked `sshd`** (E2.S4's spec §5.1, from G2's S2 spec §2): `apt-get download openssh-server libwrap0` into a new empty folder, `dpkg-deb -x` into another, a wrapper `#!/bin/sh` / `LD_LIBRARY_PATH=<unpacked>/usr/lib/x86_64-linux-gnu exec <unpacked>/usr/sbin/sshd "$@"`, and the two lines `SshdSessionPath <unpacked>/usr/lib/openssh/sshd-session`, `SshdAuthPath <unpacked>/usr/lib/openssh/sshd-auth` in both configs. E2.S4 ran section 10 so: 48 ok, three runs (`research/module_tests.md:2574`) | read |
| F16 | **The guard tests that read the scripts.** `harnessSites.test.ts` scans every script for a raw temp call (`:24-35`) and requires known harness files; `itestCallers.test.ts` scans the callers of the argv builders. Neither names a script of this story | read |
| F17 | **`discoverSources(root, excluded, extensions)`** (`test/tempSiteScan.ts:62-76`) lists every file under a folder with one of the extensions, as relative paths with `/`, in code-unit order | read |
| F18 | **A test reaches a script module** through `import … from '../../scripts/lib/leftovers.cjs'` with a declaration file `leftovers.d.cts`, whose export list a test compares with the module (`leftoversWrapper.test.ts:35`). `tsconfig.json` has `rootDir: src` and compiles `src` only | read |
| F19 | **Test 33 compiles before the module exists**: it loads `scripts/lib/sshdRun.cjs` with `createRequire(__filename)` at run time and checks each name (`exported`, §9). `tsc -p ./` exit 0 on the tree of `5b8078c8` with the test file alone | measured (§10) |
| F20 | **The RED and the GREEN of test 33**, on a scratch worktree (`git worktree add --detach <scratchpad>/e3s2-scratch HEAD` at `5b8078c8`, `node_modules` and the shared rules linked in, never fetched; removed after): §10 | measured |
| F21 | **The draft of this spec, run on that scratch worktree without an `sshd`**: `tsc -p ./` exit 0; `itestInstrument` 7 of 7, `itestCallers` 2 of 2, `harnessSites` 3 of 3, `harnessScope` 15 of 15; `npx eslint src/test/itestInstrument.test.ts` exit 0; `node --check` of every changed script exit 0; `leftovers-check.mjs --profile node --token creds` "clean (685 files)" (it reads untracked files too: `ls-files --cached --others --exclude-standard`, `leftovers-check.mjs:332`); `node scripts/ssh-agent-itest.cjs` exit 0, 26 ok, five `skip … sshd not installed` lines, the last `all agent integration checks passed`; with `CREDS_ITEST_SSHD=relative/sshd` it ends at once with exit 1 and `TypeError: CREDS_ITEST_SSHD must be an absolute path; got "relative/sshd"`. The line counts of the table above are `wc -l` of that draft | measured |
| F22 | **The record builder without an `sshd`** (`identitiesOf` of the draft, on a hand-made folder): `commit` `5b8078c8…`, `conventions` `c598a11b…`, the real client `/usr/bin/ssh` with `OpenSSH_10.2p1 Ubuntu-2ubuntu3.8, OpenSSL 3.5.5 27 Jan 2026` and its SHA-256, the `sshd` as named with `real`, `version` and `sha256` all `null` (it does not exist here). `trackedChanges` was `null`: in the scratch worktree `git status` fails (`expected submodule path '.agents/conventions' not to be a symbolic link`, exit 128), and R1 then fails, as it must: an unread status is not a clean tree | measured |
| F23 | **The mutations MU1 to MU7** of §15, each on the draft and restored: each turned red what §15 names; after the last restore 7 of 7 pass | measured |
| F24 | **The parent's wording for the identities** (`## Epics`, E3, *The identities*): "the path, the version and the SHA-256 of every executable that a row ran (the client; the `sshd`, its wrapper and the helper programs that its config names; …), and the SHA-256 of every config text that the run handed to one of them. A result with no identity beside it is not a result of its row." §3.7: the record is "a few kB of text per run", and "the run's file goes with the run's owned folder" | read |

**Not measured for this spec, because this machine has no `sshd` (F14) and nothing may be fetched for it:** leg 0 on any `sshd`, the
record with a real counterpart, `sshd -V` of 10.2p1 and of 9.6p1, `/proc/<pid>/exe` of an `sshd` started through a wrapper, section 10
as a whole with a parameter, and the CI run. Each is in §19, and §13 says how the story's run measures them.

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.**
2. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
3. `node $LP npm run typecheck`, `node $LP npm run lint`, `node $LP npm run ratchet`
4. `npm test` — the whole suite (it compiles first and lowers itself).
5. A script's syntax: `node --check scripts/<file>.cjs`.
6. The harness: `npm run itest:ssh-agent` (it compiles first). With the parameters of the story's run: §13.
7. From the repository root: `node .agents/conventions/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"`.

## 1. The decisions

### 1.1 The parameters are two environment variables

| Variable | Value | With none |
|---|---|---|
| `CREDS_ITEST_SSHD` | the ABSOLUTE path of an executable regular file: an `sshd`, or a wrapper that sets its library path and `exec`s it | `/usr/sbin/sshd` (`SSHD_DEFAULT`) |
| `CREDS_ITEST_SSHD_CONFIG` | the ABSOLUTE path of a text file. Each of its lines, trimmed, is added to every sshd config the run writes; blank lines and lines that start with `#` are left out | no line |

**Why variables, not a file of the run.** (1) The repository's precedent names a program of a harness by a variable with a default
(F8), and CI already hands an unpacked client that way. (2) A file of the run needs a place that is known before the run, and that
place is a parameter itself: a path in the tree would be a tracked file or an ignored one that a run edits, and a path outside it would
need a variable anyway. (3) A variable is not in the tree, so a run with parameters is a run from a tree with no modified tracked file.
**Why the lines come in a FILE that the variable names,** not in the variable: a config line holds spaces, and the run needs several;
a text file holds them as they are written, and its SHA-256 goes into the record (§8). An empty value counts as not set, as for
`CREDS_ITEST_GIT`.

**Refused, with the variable's name, and never replaced by the default** (`coding-style.md`, *Input validation*): a relative path (an
`sshd` started by a relative path refuses to re-exec itself; and a value that is not absolute names nothing that the record can
hash); a path that is not an executable regular file; a config file that cannot be read; a config line that is a `Match` line (it would
take in the caller's lines that follow it). The refusal is a `TypeError` thrown when `itestSshd.cjs` is loaded, so the harness ends
before it starts anything (F21). Off CI, a NAMED executable that is missing is this refusal, not a skip: the person named it, and a
"skip, sshd not installed" would hide a wrong run. With no variable, a missing `/usr/sbin/sshd` is what it was: a skip off CI, a FAIL
under `CI=true` (*Binding constraints*).

**Where the run's lines stand.** After a starter's own lines and before the caller's lines. `sshd` keeps the first value of a keyword
(F2), so a line of the run cannot change a line of the starter. Before the caller's lines, so that a caller's `Match` block (none
today, F7) cannot take in the run's lines. With no line, the text is the text before this story (33d).

**The run's lines are for the run, the caller's lines for one counterpart.** The two lines that an unpacked `sshd` needs go into every
config, so they are the run's. A line that one row needs on one counterpart (a forced command of M5 g and h; the `PATH` of the
install's stand-in that E3.S3's probe 1 tries, the lead's answer Q4) is the caller's: `startServingSshd` gains the parameter `extra`
for it, as `startSshd` has `extraConfig`.

### 1.2 Where the serving launcher lives

In a NEW file, `scripts/itestServing.cjs`, beside `itestSshd.cjs`, not in section 10's file and not in `itestSshd.cjs`:

- Every row-story puts its legs in a file of its own and starts its counterparts through the serving launcher (the stories document,
  *Where the legs live*). Those files must reach the launcher, its listener-only stop and `endServer` without importing section 10.
- `endServer` needs `within` of `itestNoSharing.cjs` (`noneAlive`), and `itestNoSharing.cjs` imports `itestSshd.cjs`: in `itestSshd.cjs`
  it would be a cycle. In its own file there is none (`itestServing.cjs` → `itestSshd.cjs`, `itestNoSharing.cjs`, `lib/sshdRun.cjs`).
- `itestSshd.cjs` stays the file of the one-connection helpers, which five scripts of other plans import (F6); its exports only grow by
  `RUN`.

**The one place** of test 33 is `scripts/lib/sshdRun.cjs`: the default path, the reading of the two variables, and both config texts.
`itestSshd.cjs` reads the run ONCE (`RUN = sshdRunOf(process.env)`, `SSHD = RUN.executable`); `startSshd` writes
`oneConnectionConfig(RUN, …)`; `itestServing.cjs` imports `SSHD` and `RUN` from `itestSshd.cjs` and writes `servingConfig(RUN, …)`. So
the extra lines reach both starters from the same place, as test 33 asks. The module is pure (it reads no variable and no file when it
is loaded), so test 33 asks it directly with an environment of its own.

### 1.3 The stop of the listener alone

`stopListener(server)` of `itestServing.cjs`: (1) list what the listener forked, while it is still the same process
(`descendantsOfListener`: afterwards the session processes are below nothing that the run holds, F4); (2) `endChild(server.sshd)`:
SIGTERM to the listener's pid, SIGKILL after 5 s (F5); (3) answer `{ taken, stopped }`. It never signals a process group: Node's
`spawn` put the listener in the harness's own group (F5). The processes in `taken` stay alive on purpose; the leg ends them with
`endServer(server, clients, taken)` when it has read them, which is what the parent's §3.7 asks ("the leg ends them by their recorded
pids and start times"). `endServer` does not change and stays the end of a leg.

**How it is proven: leg 0 of section 10** (§7), on every `sshd` that section 10 runs on. Locally: the unpacked `sshd` of the story's run
(OpenSSH 10.2p1 of the distribution's package, if the recipe of F15 is used again; the record names it). In CI: `/usr/sbin/sshd` of
`ubuntu-latest` (9.6p1 on 2026-11-18, F9). M3 will run on both, so the stop is proven on both before M3 is built.

### 1.4 The record of identities

Written by `recordIdentities` of `scripts/itestIdentities.cjs` at the end of section 10, after leg 0 (§8). It is written as
`identities.json` into the section's owned `pin` folder (it goes with that folder, as the parent's §3.7 says) and printed to the
standard output as ONE line, `identities <json>`. That line is what the commit body and `research/module_tests.md` quote. Format: §8.2.

### 1.5 What stays the same

Legs 1 and 2 of section 10 run first and as before: the same calls, the same order, the same configs (33d), the same checks. Leg 0 and
the record come after leg 2, so that nothing of theirs can change a port, a record of the shim or a count of legs 1 and 2. Sections 5,
7, 8 and 9 and the bridged harnesses start what they started before. No product file changes.

## 2. `scripts/lib/sshdRun.cjs` (new)

```js
'use strict';
// The `sshd` of a real run, and the text of every sshd config of the real runs (G1, E3.S2; decision 16 of
// `todo/PLAN_person_roads_pin_host_key.md`): the instrument's ONE place. `scripts/itestSshd.cjs` reads the run once, with
// `sshdRunOf(process.env)`; its `startSshd` (`sshd -d`) and the serving launcher of `scripts/itestServing.cjs` (`sshd -D -e`) write
// their config with `oneConnectionConfig` and `servingConfig`, so the lines of the run reach both from here. `test/itestInstrument.test.ts`
// (test 33) holds that no other script names an sshd by a path or writes an sshd config.
//
// Two parameters of the run, as environment variables, so that no tracked file is edited to hand them:
//   CREDS_ITEST_SSHD         the absolute path of the executable: an sshd, or a wrapper that sets its library path and `exec`s it.
//   CREDS_ITEST_SSHD_CONFIG  the absolute path of a text file; each of its lines (blank lines and `#` lines left out) is added to every
//                            sshd config the run writes: an unpacked sshd needs `SshdSessionPath` and `SshdAuthPath`.
// With neither: `SSHD_DEFAULT` and no extra line, as CI runs it (`ci-extension.yml` installs that `sshd`). A variable set to an empty
// text counts as not set. A value that cannot be used is refused, naming its variable, and is never replaced by the default.
//
// The lines of the run come after a starter's own lines and before its caller's. `sshd` keeps the FIRST value of a keyword (the manual,
// `sshd_config(5)`; read, not measured here), so a line of the run cannot change a line a starter wrote. A `Match` line is refused: it would
// take in every line the caller writes after it. Nothing is read when this module is loaded.
const fs = require('node:fs');
const path = require('node:path');

/** The executable of a run that names none. */
const SSHD_DEFAULT = '/usr/sbin/sshd';
const EXECUTABLE_VARIABLE = 'CREDS_ITEST_SSHD';
const CONFIG_VARIABLE = 'CREDS_ITEST_SSHD_CONFIG';

/** `env[name]`, or `undefined` when it is not set or empty. */
const given = (env, name) => (env[name] === undefined || env[name] === '' ? undefined : env[name]);

/** The absolute path `value` of `name`, or a refusal that names the variable. */
function absolute(name, value) {
  if (!path.isAbsolute(value)) {
    throw new TypeError(`${name} must be an absolute path; got ${JSON.stringify(value)}`);
  }
  return value;
}

/** The executable of the run: the default, or the file the variable names, which must be an executable regular file. */
function executableOf(env) {
  const named = given(env, EXECUTABLE_VARIABLE);
  if (named === undefined) {
    return SSHD_DEFAULT;
  }
  const file = absolute(EXECUTABLE_VARIABLE, named);
  try {
    fs.accessSync(file, fs.constants.X_OK);
    if (!fs.statSync(file).isFile()) {
      throw new Error('not a file');
    }
  } catch {
    throw new TypeError(`${EXECUTABLE_VARIABLE} names ${file}, which is not an executable file`);
  }
  return file;
}

/** The lines of the run's config file, or none: blank lines and `#` lines are left out; a `Match` line is refused. */
function linesOf(env) {
  const named = given(env, CONFIG_VARIABLE);
  if (named === undefined) {
    return { configFile: undefined, lines: [] };
  }
  const file = absolute(CONFIG_VARIABLE, named);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new TypeError(`${CONFIG_VARIABLE} names ${file}, which cannot be read (${error.code ?? error.message})`);
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
  const match = lines.find((line) => /^match(\s|=|$)/i.test(line));
  if (match !== undefined) {
    throw new TypeError(`${CONFIG_VARIABLE}: a Match line would take in the lines a starter's caller writes after it; got ${JSON.stringify(match)}`);
  }
  return { configFile: file, lines };
}

/** The run, read from `env`: `{ executable, configFile, lines }`, frozen. Throws a `TypeError` naming the variable that cannot be used. */
function sshdRunOf(env) {
  const { configFile, lines } = linesOf(env);
  return Object.freeze({ executable: executableOf(env), configFile, lines: Object.freeze([...lines]) });
}

/**
 * The config of a one-connection `sshd -d` (`startSshd`): `first` before the defaults (sshd keeps the first value of a keyword), then the
 * defaults, the lines of the run, and the caller's `extra`. With a run of no lines it is, byte for byte, what `startSshd` wrote before E3.S2.
 */
function oneConnectionConfig(run, { address, port, first = [], hostKeyPath, authorizedKeys, pidFile, extra = [] }) {
  return [
    `ListenAddress ${address}:${port}`,
    ...first,
    `HostKey ${hostKeyPath}`,
    `AuthorizedKeysFile ${authorizedKeys}`,
    `PidFile ${pidFile}`,
    'UsePAM no',
    'StrictModes no',
    'PasswordAuthentication no',
    'KbdInteractiveAuthentication no',
    ...run.lines,
    ...extra,
    '',
  ].join('\n');
}

/**
 * The config of a serving `sshd -D -e` (the serving launcher). `penalties` false leaves `PerSourcePenalties no` out, for an sshd older than
 * 9.8, which has no penalties. With a run of no lines and no `extra` it is, byte for byte, what `servingConfig` of
 * `itestPinnedRoads.cjs` wrote before E3.S2.
 */
function servingConfig(run, { port, hostKey, authorizedKeys, pidFile, penalties, extra = [] }) {
  return [
    `ListenAddress 127.0.0.1:${port}`,
    `HostKey ${hostKey}`,
    `AuthorizedKeysFile ${authorizedKeys}`,
    `PidFile ${pidFile}`,
    'UsePAM no',
    'StrictModes no',
    'PasswordAuthentication no',
    'KbdInteractiveAuthentication no',
    // `Connection from …` is a VERBOSE line: it is how K2's log shows that leg 2 reached it (T37). `Accepted publickey` is there at any level.
    'LogLevel VERBOSE',
    // Measured on sshd 10.2 (2026-11-17): with the default, a run of refused host keys makes the listener refuse every next connection.
    ...(penalties ? ['PerSourcePenalties no'] : []),
    ...run.lines,
    ...extra,
    '',
  ].join('\n');
}

module.exports = { SSHD_DEFAULT, EXECUTABLE_VARIABLE, CONFIG_VARIABLE, sshdRunOf, oneConnectionConfig, servingConfig };
```

Exports: `SSHD_DEFAULT`, `EXECUTABLE_VARIABLE`, `CONFIG_VARIABLE`, `sshdRunOf`, `oneConnectionConfig`, `servingConfig`. The comment of
`servingConfig` carries the two comments of the old function (`itestPinnedRoads.cjs:78`, `:80`) word for word.

## 3. `scripts/itestSshd.cjs`

```diff
diff --git a/src_vs_code/scripts/itestSshd.cjs b/src_vs_code/scripts/itestSshd.cjs
index 026539de..2e1e9066 100644
--- a/src_vs_code/scripts/itestSshd.cjs
+++ b/src_vs_code/scripts/itestSshd.cjs
@@ -3,14 +3,22 @@
 // starts one on a fresh loopback port, `endChild` ends a child by its pid, and `launch` is the spawn both use. `login`
 // (section 7's, added with E3.4) is one real `ssh` against its own run, answered from the stub's globals. POSIX only —
 // the callers skip on Windows.
+//
+// The `sshd` of every start here is the run's (G1, E3.S2): `RUN`, read ONCE when this module loads, from the two parameters of
+// `lib/sshdRun.cjs` (`CREDS_ITEST_SSHD`, `CREDS_ITEST_SSHD_CONFIG`); with neither it is the system's sshd and no line is added. Both
+// starters of the real runs write their config with that module: `startSshd` here (`sshd -d`), and the serving launcher of
+// `itestServing.cjs` (`sshd -D -e`), which imports `RUN` from here. `test/itestInstrument.test.ts` (test 33) holds it.
 const fs = require('fs');
 const os = require('os');
 const path = require('path');
 const harnessScope = require('./lib/harnessScope.cjs');
 const net = require('node:net');
 const { spawn } = require('node:child_process');
+const { sshdRunOf, oneConnectionConfig } = require('./lib/sshdRun.cjs');
 
-const SSHD = '/usr/sbin/sshd';
+/** The run's sshd and the lines it adds to every config (`lib/sshdRun.cjs`). A parameter that cannot be used throws here, naming it. */
+const RUN = sshdRunOf(process.env);
+const SSHD = RUN.executable;
 
 /** The owned folder every child started here gets as its `TMPDIR`, `TEMP` and `TMP`; the harness sets it once, in `main`. */
 let childTemp;
@@ -88,8 +96,8 @@ function freePort() {
  *
  * <p>`options` (E1.6): `address` (default `127.0.0.1`; the bridged rig puts its destination on `127.0.0.2`, so two legs of one call have two hosts),
  * `port` (a fixed one, for a leg that starts a SECOND sshd on the address of the first), and `first`: config lines that go BEFORE the defaults,
- * because `sshd` keeps the first value of a keyword, so a rig that offers passwords says `PasswordAuthentication yes` there. `extraConfig` still
- * goes after them, as it always did. The known-hosts line names the address.</p>
+ * because `sshd` keeps the first value of a keyword, so a rig that offers passwords says `PasswordAuthentication yes` there. The lines of the
+ * run (`RUN.lines`, E3.S2) come after the defaults, and `extraConfig` after them, as it always did. The known-hosts line names the address.</p>
  */
 async function startSshd(scope, sshdDir, hostKeyPath, authorizedKeys, extraConfig = [], options = {}) {
   const address = options.address ?? '127.0.0.1';
@@ -98,23 +106,9 @@ async function startSshd(scope, sshdDir, hostKeyPath, authorizedKeys, extraConfi
   const hostPublic = fs.readFileSync(`${hostKeyPath}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
   fs.writeFileSync(knownHosts, `[${address}]:${port} ${hostPublic}\n`);
   const config = path.join(sshdDir, 'sshd_config');
-  // Absolute paths only: sshd refuses to start from a relative one.
-  fs.writeFileSync(
-    config,
-    [
-      `ListenAddress ${address}:${port}`,
-      ...(options.first ?? []),
-      `HostKey ${hostKeyPath}`,
-      `AuthorizedKeysFile ${authorizedKeys}`,
-      `PidFile ${path.join(sshdDir, 'sshd.pid')}`,
-      'UsePAM no',
-      'StrictModes no',
-      'PasswordAuthentication no',
-      'KbdInteractiveAuthentication no',
-      ...extraConfig,
-      '',
-    ].join('\n'),
-  );
+  // Absolute paths only: sshd refuses to start from a relative one. The text is `lib/sshdRun.cjs`'s, with the run's lines.
+  const given = { address, port, first: options.first ?? [], hostKeyPath, authorizedKeys, pidFile: path.join(sshdDir, 'sshd.pid'), extra: extraConfig };
+  fs.writeFileSync(config, oneConnectionConfig(RUN, given));
   const sshd = launch(scope, SSHD, ['-d', '-e', '-f', config]);
   const listening = new RegExp(`Server listening on ${regexpLiteral(address)} port ${port}`);
   const failure = await listeningFailure(sshd, listening, Date.now() + 10_000);
@@ -235,4 +229,4 @@ async function checkedPinOf(out, file) {
   return checked.pin;
 }
 
-module.exports = { SSHD, setChildTemp, launch, startSshd, endChild, lastLines, login, freePort, listeningFailure, checkedPinOf };
+module.exports = { SSHD, RUN, setChildTemp, launch, startSshd, endChild, lastLines, login, freePort, listeningFailure, checkedPinOf };
```

| Exports | |
|---|---|
| before (`:238`) | `SSHD, setChildTemp, launch, startSshd, endChild, lastLines, login, freePort, listeningFailure, checkedPinOf` |
| after | the same, and `RUN` |

`SSHD` is still a string, the path of the run's executable, so `fs.existsSync(SSHD)` of every caller (*Binding constraints*) reads what
it read before when no variable is set.

## 4. `scripts/itestServing.cjs` (new)

```js
// The serving launcher of the real runs (G1, E3.S2; decision 16 of `todo/PLAN_person_roads_pin_host_key.md`): the ONE starter of every
// counterpart of a row of E3, moved here from `itestPinnedRoads.cjs` (section 10) so that every row file reaches it and its stops.
//
// `startServingSshd` starts one `sshd -D -e`, which serves EVERY connection, with the run's executable and config lines (`RUN` of
// `itestSshd.cjs`, read from `lib/sshdRun.cjs`) and, after them, the caller's own lines. It records the program the listener runs
// (`/proc/<pid>/exe`: path and SHA-256) in `program.json` beside the config, for the record of identities (`itestIdentities.cjs`).
// Two ends: `stopListener` ends the LISTENER alone, by its own pid, and leaves alive what it forked for a session (a master connection
// outlives it: the instrument of M3); `endServer` ends a server and everything it forked, and stays the end of a leg.
//
// Linux only: the process identities read `/proc`. Every pid is signalled only while its start time is the recorded one.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('node:child_process');
const { SSHD, RUN, launch, endChild, freePort, listeningFailure } = require('./itestSshd.cjs');
const { within } = require('./itestNoSharing.cjs');
const { servingConfig } = require('./lib/sshdRun.cjs');

/** One start of the listener, waited for (10 s) by its "Server listening" line; once it listens, the program it runs is recorded. */
async function startOnce(rig, dir, hostKey, given) {
  const { port, penalties, extra } = given;
  const config = path.join(dir, 'sshd_config');
  fs.writeFileSync(config, servingConfig(RUN, { port, hostKey, authorizedKeys: rig.authorizedKeys, pidFile: path.join(dir, 'sshd.pid'), penalties, extra }));
  const sshd = launch(rig.scope, SSHD, ['-D', '-e', '-f', config]);
  // The listener's identity, taken at once: the pid and the start time it has from the fork on. Once `sshd.exited` its pid may be another process's.
  const identity = { pid: sshd.child.pid, start: startOf(sshd.child.pid) };
  const listening = new RegExp(String.raw`Server listening on 127\.0\.0\.1 port ${port}`);
  const failure = await listeningFailure(sshd, listening, Date.now() + 10_000);
  return { sshd, identity, port, failure, program: failure === undefined ? recordProgram(dir, identity) : undefined };
}

/**
 * The program a process runs, as the kernel answers it: the path of `/proc/<pid>/exe` and the SHA-256 of its bytes (read through that link, so
 * a wrapper that `exec`s sshd answers sshd). Only while `one` (`{ pid, start }`) is the same process, before the read and after it; else
 * `undefined`. Never throws.
 */
function programOf(one) {
  if (!alive(one)) {
    return undefined;
  }
  try {
    const exe = fs.readlinkSync(`/proc/${one.pid}/exe`);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(`/proc/${one.pid}/exe`)).digest('hex');
    return alive(one) ? { exe, sha256 } : undefined;
  } catch {
    return undefined;
  }
}

/** The listener's program, written as `program.json` beside its config (the record of identities reads it), and answered. */
function recordProgram(dir, identity) {
  const program = { pid: identity.pid, start: identity.start, ...(programOf(identity) ?? { exe: null, sha256: null }) };
  fs.writeFileSync(path.join(dir, 'program.json'), `${JSON.stringify(program)}\n`);
  return program;
}

/**
 * One `sshd -D -e` that serves EVERY connection to 127.0.0.1:`port` (a free port when none is given), in a folder `name` of its own: the
 * serving launcher, the one starter of every counterpart of a row (`startSshd` of `itestSshd.cjs` runs `sshd -d`, which serves one
 * connection). Its config is `servingConfig` of `lib/sshdRun.cjs`: the run's lines, then `extra`, the caller's own (a row's forced command).
 * Once more without `PerSourcePenalties no` when this sshd does not know the word, and once more after 300 ms when the port is still held
 * (K2 on K1's port: the same port; a free port taken here: a fresh one). `launch` registers the listener's end with the scope; `endServer` is
 * the leg's own, first.
 */
async function startServingSshd(rig, name, hostKey, port, extra = []) {
  const dir = path.join(rig.dir, name);
  fs.mkdirSync(dir);
  let given = { port: port ?? (await freePort()), penalties: true, extra };
  let started = await startOnce(rig, dir, hostKey, given);
  if (started.failure !== undefined && /PerSourcePenalties/.test(started.sshd.stderr)) {
    console.log(`info  ${name}: this sshd does not know PerSourcePenalties (before 9.8 it has none); started without the line`);
    await endChild(started.sshd);
    given = { ...given, penalties: false };
    started = await startOnce(rig, dir, hostKey, given);
  }
  if (started.failure !== undefined && /Address already in use/i.test(started.sshd.stderr)) {
    await endChild(started.sshd);
    await new Promise((resolve) => setTimeout(resolve, 300));
    given = { ...given, port: port ?? (await freePort()) };
    started = await startOnce(rig, dir, hostKey, given);
  }
  return started;
}

/** The start time of a running process (field 22 of `/proc/<pid>/stat`), or `undefined` when it does not run or is a zombie. */
function startOf(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' '); // fields[0] is field 3, the state
    return fields[0] === 'Z' ? undefined : fields[19];
  } catch {
    return undefined;
  }
}

/** Whether `one` (`{ pid, start }`) still runs as the SAME process: a reused pid has another start time. */
const alive = (one) => one.start !== undefined && startOf(one.pid) === one.start;

/** Every pid below `pid` in the table `children` (parent → its children), each once. */
function below(children, pid) {
  return (children.get(pid) ?? []).flatMap((child) => [child, ...below(children, child)]);
}

/**
 * Every process below `root` now, with its start time: `ps -e -o pid=,ppid=`, walked from `root`. Answers `{ list, error }`: a `ps` that
 * failed is an `error` (the list is then empty and proves nothing), never a quiet empty list.
 */
async function descendantsOf(root) {
  const table = await new Promise((resolve) => {
    // The PATH lookup is on purpose, as `tool` does: `ps` of the machine the run is on.
    execFile('ps', ['-e', '-o', 'pid=,ppid='], { timeout: 5_000 }, (error, stdout) => resolve(error ? { error: String(error) } : { text: String(stdout) })); // NOSONAR: a CI rig
  });
  if (table.error !== undefined) {
    return { list: [], error: `ps failed: ${table.error}` };
  }
  const children = new Map();
  for (const line of table.text.trim().split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  return { list: below(children, root).map((pid) => ({ pid, start: startOf(pid) })).filter((one) => one.start !== undefined), error: undefined };
}

/** A signal to every one of `list` that still runs as the same process. */
function signalAll(list, signal) {
  for (const one of list.filter(alive)) {
    try {
      process.kill(one.pid, signal);
    } catch {
      // it ended between the look and the signal
    }
  }
}

const noneAlive = (ms, list) => within(ms, () => !list.some(alive));

/**
 * What the listener of `server` forked, now, as `descendantsOf` answers: `{ list, error }`. Only while it is still the SAME listener: once its
 * `sshd` exited (its pid may be reused) nothing is listed, and a listener that was gone by the end of the `ps` snapshot (the table may then
 * be a foreign process's) gives an empty list too; the processes the leg recorded while it ran are the caller's `taken`.
 */
async function descendantsOfListener(server) {
  const same = () => !server.sshd.exited && alive(server.identity);
  if (!same()) {
    return { list: [], error: undefined };
  }
  const seen = await descendantsOf(server.identity.pid);
  return same() ? seen : { list: [], error: seen.error }; // a changed listener lists nothing, but a failed `ps` stays a failure
}

/**
 * Ends the LISTENER of a serving sshd ALONE, by its own pid (`endChild`: SIGTERM, then SIGKILL after 5 s), never by its process group, and
 * leaves alive what it forked for a session: the session of a master connection outlives it (the plan's *The stop of the listener alone*, M3).
 * What it forked is listed FIRST, while it is still its descendant: afterwards nothing this run holds has it below it. Answers
 * `{ taken, stopped }`: `taken` is that `{ list, error }`, which the leg hands to `endServer` when it has read what it needs; `stopped` is
 * true when the listener exited and its pid is no longer the same process. Never throws.
 */
async function stopListener(server) {
  const taken = await descendantsOfListener(server);
  await endChild(server.sshd);
  return { taken, stopped: server.sshd.exited && !alive(server.identity) };
}

/**
 * Ends a serving sshd and everything it forked, bounded: (a) its descendants are listed now (`descendantsOfListener`: never the descendants
 * of a pid that sshd no longer has), beside `taken` (a list made earlier, before a client was ended: afterwards a remote command is no
 * descendant any more); (b) the clients still running are ended by their recorded pids;
 * (c) at most 3 s for the rest to go with them; (d) TERM to what is left, at most 2 s, then KILL, at most 2 s, each only to a pid whose start
 * time is still the recorded one; (e) the listener, by `endChild`. `taken` is `{ list, error }` of an earlier `descendantsOf`. Answers
 * `{ list, error }`, for T21 and T39: an `error` of either listing makes the check fail. Never throws.
 */
async function endServer(server, clients, taken) {
  const now = await descendantsOfListener(server);
  const list = [...taken.list, ...now.list];
  const error = taken.error ?? now.error;
  signalAll(clients, 'SIGTERM');
  if (!(await noneAlive(3_000, list))) {
    signalAll(list, 'SIGTERM');
    if (!(await noneAlive(2_000, list))) {
      signalAll(list, 'SIGKILL');
      await noneAlive(2_000, list);
    }
  }
  await endChild(server.sshd);
  return { list, error };
}

module.exports = { startServingSshd, stopListener, endServer, startOf, alive, programOf, descendantsOfListener };
```

- **New:** the header; `startOnce(rig, dir, hostKey, given)` (it took `port, penalties` as two parameters; now one object with
  `extra`, and the program it records); `programOf`; `recordProgram`; `startServingSshd(rig, name, hostKey, port, extra = [])` (the
  same three starts as before, with `given` replaced and never changed in place); `stopListener`.
- **Moved byte for byte** from `itestPinnedRoads.cjs` (`:124-212`, docblocks included): `startOf`, `alive`, `below`, `descendantsOf`,
  `signalAll`, `noneAlive`, `descendantsOfListener`, `endServer`. `git diff --color-moved` shows them as moved.
- **Exports:** `startServingSshd`, `stopListener`, `endServer`, `startOf`, `alive`, `programOf`, `descendantsOfListener`.
- **`program.json`** beside each counterpart's `sshd_config`: `{ pid, start, exe, sha256 }`; `exe` and `sha256` are `null` when the
  link could not be read while the listener was the same process. Read through `/proc/<pid>/exe`, so the SHA-256 is of the bytes that
  run, even when the file at the path was replaced.

## 5. `scripts/itestPinnedRoads.cjs`

Delete `:67-212` and the empty line after them (`servingConfig` to `endServer`: §2 and §4 now hold them). Then:

```diff
diff --git a/src_vs_code/scripts/itestPinnedRoads.cjs b/src_vs_code/scripts/itestPinnedRoads.cjs
index b86df471..f5129e71 100644
--- a/src_vs_code/scripts/itestPinnedRoads.cjs
+++ b/src_vs_code/scripts/itestPinnedRoads.cjs
@@ -13,17 +13,22 @@
 //          the install shows sentence C and the bridge's check shows its message, the real client's `Offending` line names the pin file
 //          of the probe and of the mode check, and no sentence D is shown.
 // The control, by hand (`hostKeyWords` made to answer `accept-new`), turns leg 2 red: K2 then logs the logins.
+//   leg 0  (E3.S2, `itestListenerStop.cjs`) the stop of the listener alone: a master connection outlives it and carries one more command.
+// Then the record of identities (E3.S2, `itestIdentities.cjs`): the commit, a tree with no modified tracked file, and what ran, by SHA-256.
 //
-// Linux only: the end of a server reads `/proc`. Where `CI=true` a missing sshd FAILS. The world's stand-ins that stay: `vscode`, and
-// `resolveExecAuth`, which hands a key the run named by its path. Teardown, per leg: the bridges, then the server by the bounded recipe of
-// the stories document (its descendants listed while it lives, the clients, then the rest by pid and start time, then the listener), then the
-// forwarded socket by its exact path; the section's folder last.
+// Every server is started by the serving launcher of `itestServing.cjs`, with the run's sshd and config lines (`CREDS_ITEST_SSHD`,
+// `CREDS_ITEST_SSHD_CONFIG` of `lib/sshdRun.cjs`; with neither, the system's sshd, as CI runs it). Linux only: the end of a server reads
+// `/proc`. Where `CI=true` a missing sshd FAILS. The world's stand-ins that stay: `vscode`, and `resolveExecAuth`, which hands a key the run
+// named by its path. Teardown, per leg: the bridges, then the server by `endServer` (its descendants listed while it lives, the clients, then
+// the rest by pid and start time, then the listener), then the forwarded socket by its exact path; the section's folder last.
 const crypto = require('crypto');
 const fs = require('fs');
 const os = require('os');
 const path = require('path');
-const { execFile } = require('node:child_process');
-const { SSHD, launch, endChild, freePort, listeningFailure } = require('./itestSshd.cjs');
+const { SSHD, endChild } = require('./itestSshd.cjs');
+const { startServingSshd, endServer, alive, descendantsOfListener } = require('./itestServing.cjs');
+const { listenerStopLeg } = require('./itestListenerStop.cjs');
+const { recordIdentities } = require('./itestIdentities.cjs');
 const { tool, within, settledAfter } = require('./itestNoSharing.cjs');
 const { ownedDir, shortSocketRoot } = require('./lib/leftovers.cjs');
 const harnessScope = require('./lib/harnessScope.cjs');
@@ -64,153 +69,6 @@ function productOf(out) {
 const sentenceC = (product, name) => product.refusedHostKeySentence(name);
```

```diff
 /**
  * Removes the forwarded socket of a bridge by its EXACT path: `sshd` makes it where the product names it (`/tmp/creds-<user>-<id>.sock`,
  * outside the owned folder) and never unlinks it. Only a socket, and only one this user owns. Never throws.
@@ -653,6 +511,10 @@ async function pinnedLegs(check, rig) {
   if (port !== undefined) {
     await legTwo(check, pinned, port);
   }
+  if (real !== undefined) {
+    await listenerStopLeg(check, pinned, real);
+    await recordIdentities(check, pinned, real);
+  }
 }
 
 async function livePinnedRoads(check, out) {
```

Exports: `livePinnedRoads`, before and after. `crypto` stays (`knownHostsDigest`); `execFile`, `launch`, `freePort` and
`listeningFailure` leave its imports (nothing of the file uses them now). 683 → 545 lines.

## 6. `scripts/itestNoSharing.cjs`: `runClient` takes the program

```diff
diff --git a/src_vs_code/scripts/itestNoSharing.cjs b/src_vs_code/scripts/itestNoSharing.cjs
index baaafc9d..3eb8bf97 100644
--- a/src_vs_code/scripts/itestNoSharing.cjs
+++ b/src_vs_code/scripts/itestNoSharing.cjs
@@ -169,9 +169,9 @@ function settledAfter(promise, ms) {
   return Promise.race([promise, bound]).finally(() => clearTimeout(timer));
 }
 
-/** A real ssh with `argv` under `config`: its exit code, what it printed and what it said. Bounded: 20 s. */
-async function runClient(rig, config, argv, env = rig.env) {
-  const client = launch(rig.scope, 'ssh', ['-F', config, ...argv], { env });
+/** A real ssh with `argv` under `config`: its exit code, what it printed and what it said. Bounded: 20 s. `program`: the client by its path (G1 E3.S2's leg 0). */
+async function runClient(rig, config, argv, env = rig.env, program = 'ssh') {
+  const client = launch(rig.scope, program, ['-F', config, ...argv], { env });
   try {
     const code = await settledAfter(client.done, 20_000);
     await settledAfter(client.closed, 2000); // output that arrived between `exit` and `close`
@@ -440,4 +440,4 @@ async function liveNoSharing(check, out) {
   }
 }
 
-module.exports = { liveNoSharing, tool, within, settledAfter };
+module.exports = { liveNoSharing, tool, within, settledAfter, runClient };
```

Reuse, not a copy (`reuse-first.md`, move 1: widen the existing thing): leg 0 needs the same bounded client with the real client by its
path, never through the shim (F12). The four callers in section 9 pass no fifth argument and start `'ssh'` as before. 443 lines before
and after.

## 7. Leg 0: `scripts/itestListenerStop.cjs` (new)

```js
// Leg 0 of section 10 (G1, E3.S2): the stop of the listener ALONE, proven before M3 uses it (the plan's *The stop of the listener alone*).
//
// K1 is started by the serving launcher. A master connection to it comes up through a handed client config (`ControlMaster auto`, a
// control path in the owned folder, `ControlPersist 60`, as section 9's `sharingConfig`). Then `stopListener` ends K1's listener by its own
// pid. The leg shows: the listener is gone and nothing answers a new connection (`Connection refused`); what the listener forked for the
// master's session is still alive; the master still answers `ssh -O check`; and it carries one more command, which prints the run's nonce
// and ends with 0, with no second login. Then the master is ended (`ssh -O exit`, then its pid), and `endServer` ends the session by the
// pids taken before the stop. It also records the programs of that session (`session-programs.json`) for the record of identities.
//
// The client is the real one, started by its path (never the shim: these starts belong to no road). Linux only, as section 10.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { endChild } = require('./itestSshd.cjs');
const { within, runClient } = require('./itestNoSharing.cjs');
const { startServingSshd, stopListener, endServer, startOf, alive, programOf, descendantsOfListener } = require('./itestServing.cjs');

const me = os.userInfo().username;
const ACCEPTED = /Accepted publickey for /g;
/** The pid of a master, as `ssh -O check` answers it: `Master running (pid=<n>)`. */
const MASTER = /Master running \(pid=(\d+)\)/;

/** The handed config of the leg's client: K1's known-hosts file alone, the run's login key, and a master on `control`. */
function masterConfig(rig, dir, port, control) {
  const known = path.join(dir, 'known_hosts');
  fs.writeFileSync(known, `[127.0.0.1]:${port} ${fs.readFileSync(`${rig.k1}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ')}\n`);
  const lines = [
    'Host *', `  UserKnownHostsFile ${known}`, '  GlobalKnownHostsFile /dev/null', '  StrictHostKeyChecking yes', '  BatchMode yes',
    '  IdentitiesOnly yes', `  IdentityFile ${rig.userKey}`, '  ControlMaster auto', `  ControlPath ${control}`, '  ControlPersist 60', '',
  ];
  const config = path.join(dir, 'client_config');
  fs.writeFileSync(config, lines.join('\n'));
  return config;
}

/** The programs of what the listener forked for the master's session, by `/proc/<pid>/exe`, written beside its config. */
function recordSession(dir, taken) {
  const programs = taken.list.map(programOf).filter((one) => one !== undefined);
  const distinct = [...new Map(programs.map((one) => [one.sha256, one])).values()];
  fs.writeFileSync(path.join(dir, 'session-programs.json'), `${JSON.stringify({ programs: distinct })}\n`);
}

/** The master's checks after the stop; answers the master's identity. */
async function masterOutlives(check, rig, server, client) {
  const stop = await stopListener(server);
  check('leg 0: the listener alone was stopped, by its own pid: it exited, and its pid is no longer the same process', stop.stopped, JSON.stringify(server.identity));
  check('leg 0: what the listener forked for the master\'s session was listed before the stop and is alive after it, by pid and start time', stop.taken.error === undefined && stop.taken.list.some(alive), stop.taken.error ?? JSON.stringify(stop.taken.list));
  const checked = await client(['-O', 'check', `${me}@127.0.0.1`]);
  check('leg 0: the master outlived its listener: ssh -O check ends with 0', checked.code === 0, checked.stderr);
  const fresh = await client(['-o', 'ControlPath=none', `${me}@127.0.0.1`, 'true']);
  check('leg 0: nothing listens any more: a connection without the master ends with 255 and "Connection refused"', fresh.code === 255 && /Connection refused/.test(fresh.stderr), JSON.stringify(fresh));
  const nonce = crypto.randomUUID();
  const more = await client([`${me}@127.0.0.1`, `echo ${nonce}`]);
  check('leg 0: the master carried one more command after its listener had gone: it printed the nonce and ended with 0', more.code === 0 && more.stdout === nonce, JSON.stringify(more));
  const logins = server.sshd.stderr.match(ACCEPTED)?.length ?? 0;
  check('leg 0: K1 logged ONE accepted login, the master\'s: the command after the stop did not log in again', logins === 1, server.sshd.stderr.trim().split('\n').slice(-20).join('\n'));
  return stop.taken;
}

/** Leg 0: the listener-only stop, with a master that outlives it and carries one more command. */
async function listenerStopLeg(check, rig, real) {
  const server = await startServingSshd(rig, 'k0', rig.k1, undefined);
  check('leg 0: K1 listens, started by the serving launcher', server.failure === undefined, server.failure);
  if (server.failure !== undefined) {
    await endChild(server.sshd);
    return;
  }
  const dir = path.join(rig.dir, 'k0');
  const control = path.join(dir, 'cm');
  const config = masterConfig(rig, dir, server.port, control);
  const client = (argv) => runClient(rig, config, ['-p', String(server.port), ...argv], rig.env, real);
  let master;
  let taken = { list: [], error: undefined };
  try {
    const opened = await client(['-N', '-f', `${me}@127.0.0.1`]);
    const up = await within(10_000, async () => (await client(['-O', 'check', `${me}@127.0.0.1`])).code === 0);
    const said = await client(['-O', 'check', `${me}@127.0.0.1`]);
    const pid = Number(MASTER.exec(said.stderr)?.[1]);
    master = Number.isInteger(pid) ? { pid, start: startOf(pid) } : undefined;
    check('leg 0: a master connection to K1 is up: ssh -O check on its control path ends with 0 and names its pid', up && master?.start !== undefined, JSON.stringify({ opened, said }));
    taken = await descendantsOfListener(server);
    recordSession(dir, taken);
    if (up) {
      taken = await masterOutlives(check, rig, server, client);
    }
  } finally {
    await client(['-O', 'exit', `${me}@127.0.0.1`]);
    const { list, error } = await endServer(server, master === undefined ? [] : [master], taken);
    const gone = await within(5_000, () => !fs.existsSync(control));
    check('leg 0: the master, its session and K1 are gone, by pid and start time, and the control socket too', error === undefined && !list.some(alive) && (master === undefined || !alive(master)) && gone, error ?? JSON.stringify(list.filter(alive)));
  }
}

module.exports = { listenerStopLeg };
```

| # | Check (its name begins `leg 0:`) | What it shows |
|---|---|---|
| L0.1 | K1 listens, started by the serving launcher | the counterpart of the leg is the serving launcher's |
| L0.2 | a master connection to K1 is up: `ssh -O check` ends with 0 and names its pid | the master exists before the stop; its pid and start time are recorded from its own answer (`Master running (pid=<n>)`) |
| L0.3 | the listener alone was stopped, by its own pid | `stopped`: the listener exited and its pid is no longer the same process |
| L0.4 | what the listener forked for the master's session was listed before the stop and is alive after it | the stop leaves the session alive (the plan's *The stop of the listener alone*); a failed `ps` fails it |
| L0.5 | the master outlived its listener: `ssh -O check` ends with 0 | the master is still up after the stop |
| L0.6 | nothing listens any more: a connection without the master ends with 255 and `Connection refused` | the listener is really gone, so the next command can only ride the master |
| L0.7 | the master carried one more command: it printed the run's nonce and ended with 0 | the instrument of M3: a master that outlives its listener and carries one more command |
| L0.8 | K1 logged ONE accepted login, the master's | the command of L0.7 did not log in again (it rode the master) |
| L0.9 | the master, its session and K1 are gone, by pid and start time, and the control socket too | the leg leaves nothing (`-O exit`, then `endServer` with the master's identity and `taken`) |

**Why `ControlMaster auto` and `ControlPersist 60` in a handed config,** not a foreground `-M`: it is the shape that M3 uses ("through
the handed config (`ControlMaster`, `ControlPath`, `ControlPersist`)"), and it is section 9's (F11): a master that a killed run strands
ends by itself after 60 s with no client. The client is started by its real path with `-F <k0/client_config>`, so the shim records
none of its starts and adds no `-F` of its own (F12). The control socket is `<pin folder>/k0/cm`: the folder is under the short socket
root (F10), so the path stays short.

**Where leg 0 stands in the run:** after leg 2 (§1.5). It needs `real` (the real client) and `rig.k1`, `rig.userKey`,
`rig.authorizedKeys` of the rig, which `pinnedLegs` already made. If K1 does not start, leg 0 fails L0.1 and ends; if the master does
not come up, L0.2 fails and the leg goes to its end (L0.9) without the stop.

**`session-programs.json`** in `k0/`: the distinct programs (`/proc/<pid>/exe` and SHA-256) of what the listener forked for the master's
session, taken before the stop. On an `sshd` of 9.8 or newer this is expected to be `sshd-session`, on 9.6 `sshd` itself (re-executed);
neither is measured (§19). It is how the record names a helper program that the run did not name in a line (the compiled-in one of a
system `sshd`).

## 8. The record of identities: `scripts/itestIdentities.cjs` (new)

```js
// The record of identities of a real run (G1, E3.S2; decision 16 of `todo/PLAN_person_roads_pin_host_key.md`, its setup *The identities*
// and *The launch instrument*): what ran, by path, version and SHA-256, and every config text the run handed out, by SHA-256, beside the
// commit of the tree and the answer of `git status --porcelain --untracked-files=no`. A result with no identity beside it is not a result
// of its row, and a run from a tree with a modified tracked file is no run of its commit.
//
// The record is written as `identities.json` in the section's owned folder (it goes with that folder, as every file of the run) and
// printed as ONE line, `identities <json>`, which is what a commit body and `research/module_tests.md` quote. Two kinds of fact stay
// apart: what the run NAMED (the parameters, the helper programs its config lines name) and what the kernel ANSWERED (`/proc/<pid>/exe` of
// each listener and of each process it forked for the master's session). A value that could not be read is `null`, never `0` or `''`.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('node:child_process');
const { RUN } = require('./itestSshd.cjs');
const { EXECUTABLE_VARIABLE, CONFIG_VARIABLE } = require('./lib/sshdRun.cjs');

/** The repository root: `scripts/` is one folder below `src_vs_code`. */
const REPO = path.resolve(__dirname, '..', '..');
/** The config texts the run hands out, by file name: each counterpart's, and each client's. */
const CONFIG_NAMES = new Set(['sshd_config', 'client_config']);
/** The lines of the run that name a helper program of sshd. */
const HELPER = /^(SshdSessionPath|SshdAuthPath)\s+(\S+)$/i;

/** The SHA-256 of a file's bytes, or `null`. */
function sha256Of(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/** The real path of a file, or `null`. */
function realOf(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return null;
  }
}

/** What a program printed and its exit, bounded (10 s; the timeout ends it): `{ code, out, error }`. Never rejects. */
function answer(program, args) {
  return new Promise((resolve) => {
    // The PATH lookup of `git` is on purpose, as `ps` of the end of a server: the machine's own.
    execFile(program, args, { timeout: 10_000 }, (error, stdout, stderr) => { // NOSONAR: a CI rig
      resolve({ code: error ? (error.code ?? error.signal) : 0, out: `${stdout}${stderr}`, error: error ? String(error.message) : undefined });
    });
  });
}

/** `git -C <repo> <args>`, trimmed; `null` when git failed. `status` keeps its text whole: empty is the answer of a clean tree. */
async function git(args) {
  const said = await answer('git', ['-C', REPO, ...args]);
  return said.code === 0 ? said.out.replace(/\n$/, '') : null;
}

/** The first line that starts with `OpenSSH_` in what `<program> -V` printed (a version, or the head of a usage text), or `null`. */
async function versionOf(program) {
  const said = await answer(program, ['-V']);
  return said.out.split(/\r?\n/).find((line) => line.startsWith('OpenSSH_')) ?? null;
}

/** Every file under `dir` whose name is one of `names`, as `{ file, sha256 }`, `file` relative to `dir`. */
function filesNamed(dir, names) {
  const found = [];
  const walk = (relative) => {
    for (const entry of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (names.has(entry.name)) found.push({ file: child, sha256: sha256Of(path.join(dir, child)) });
    }
  };
  walk('');
  return found.sort((a, b) => (a.file < b.file ? -1 : 1));
}

/** The JSON files `name` under the folders of `dir`, parsed, with the folder: what each counterpart recorded of itself. */
function recorded(dir, name) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, name)))
    .map((entry) => ({ counterpart: entry.name, ...JSON.parse(fs.readFileSync(path.join(dir, entry.name, name), 'utf8')) }));
}

/** The executables of the run: the sshd as named, the helpers its lines name, the programs the kernel answered, the real client. */
async function executablesOf(rig, real) {
  const named = { role: 'sshd, as the run names it', path: RUN.executable, real: realOf(RUN.executable), version: await versionOf(RUN.executable), sha256: sha256Of(RUN.executable) };
  const helpers = RUN.lines.map((line) => HELPER.exec(line)).filter((found) => found !== null)
    .map((found) => ({ role: `${found[1]}, as a line of the run names it`, path: found[2], version: null, sha256: sha256Of(found[2]) }));
  const listeners = recorded(rig.dir, 'program.json').map((one) => ({ role: `the program the listener of ${one.counterpart} ran`, path: one.exe, sha256: one.sha256 }));
  const sessions = recorded(rig.dir, 'session-programs.json').flatMap((one) => one.programs.map((program) => ({ role: `a program the listener of ${one.counterpart} forked for a session`, path: program.exe, sha256: program.sha256 })));
  const client = { role: 'ssh, the real client', path: real, version: await versionOf(real), sha256: sha256Of(real) };
  return [named, ...helpers, ...listeners, ...sessions, client];
}

/** The record of this run: the tree, the parameters, the executables and the config texts. `real` is the real client's path. */
async function identitiesOf(rig, real) {
  const configs = filesNamed(rig.dir, CONFIG_NAMES);
  const handed = RUN.configFile === undefined ? [] : [{ file: RUN.configFile, sha256: sha256Of(RUN.configFile) }];
  return {
    record: 1,
    commit: await git(['rev-parse', 'HEAD']),
    trackedChanges: await git(['status', '--porcelain', '--untracked-files=no']),
    conventions: await git(['rev-parse', 'HEAD:.agents/conventions']),
    parameters: { [EXECUTABLE_VARIABLE]: process.env[EXECUTABLE_VARIABLE] || null, [CONFIG_VARIABLE]: process.env[CONFIG_VARIABLE] || null },
    executables: await executablesOf(rig, real),
    configs: [...configs, ...handed, { file: 'shim/ssh', sha256: sha256Of(path.join(rig.shimDir, 'ssh')) }],
  };
}

const HEX40 = /^[0-9a-f]{40}$/;
const whole = (one) => typeof one.sha256 === 'string' && typeof one.path === 'string';

/** Writes the record into the section's folder, prints it as one line, and checks it. */
async function recordIdentities(check, rig, real) {
  const record = await identitiesOf(rig, real);
  fs.writeFileSync(path.join(rig.dir, 'identities.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`identities ${JSON.stringify(record)}`);
  check('the run is a run of its commit: git status --porcelain --untracked-files=no answered, and it is empty', record.trackedChanges === '', JSON.stringify(record.trackedChanges));
  check('the record names the commit and the pin of the shared rules (git rev-parse HEAD and HEAD:.agents/conventions)', HEX40.test(record.commit ?? '') && HEX40.test(record.conventions ?? ''), JSON.stringify([record.commit, record.conventions]));
  const versions = record.executables.filter((one) => one.role.startsWith('sshd') || one.role.startsWith('ssh,'));
  const listeners = record.executables.filter((one) => one.role.startsWith('the program the listener'));
  check('the record of identities is whole: every executable has its path and SHA-256, the sshd and the client their version, and at least one listener was recorded', record.executables.every(whole) && versions.every((one) => one.version !== null) && listeners.length > 0, JSON.stringify(record.executables));
  check('every config text the run handed out has its SHA-256: each sshd_config, each client_config, the shim and the run\'s config file', record.configs.length >= 2 && record.configs.every((one) => typeof one.sha256 === 'string'), JSON.stringify(record.configs));
  check('every counterpart of the run ran one program: one SHA-256 of /proc/<pid>/exe', new Set(listeners.map((one) => one.sha256)).size === 1, JSON.stringify(listeners));
  // A wrapper that does not `exec` leaves the listener's pid to a shell: the listener-only stop would then end the shell and leave sshd.
  check('every listener ran an sshd itself (its /proc/<pid>/exe ends with /sshd): a wrapper hands over its pid by exec', listeners.length > 0 && listeners.every((one) => /\/sshd$/.test(one.path ?? '')), JSON.stringify(listeners));
  return record;
}

module.exports = { recordIdentities, identitiesOf };
```

### 8.1 The checks

| # | Check | Fails when |
|---|---|---|
| R1 | the run is a run of its commit: `git status --porcelain --untracked-files=no` answered, and it is empty | a tracked file is modified, or `git` did not answer (`null`, F22) |
| R2 | the record names the commit and the pin of the shared rules | either is not 40 hex digits |
| R3 | the record of identities is whole | an executable has no path or no SHA-256; the `sshd` as named or the client has no version; no listener was recorded |
| R4 | every config text the run handed out has its SHA-256 | a config file could not be read, or fewer than two were found |
| R5 | every counterpart of the run ran one program | two listeners ran programs with two SHA-256 |
| R6 | every listener ran an `sshd` itself (its `/proc/<pid>/exe` ends with `/sshd`) | a wrapper that does not `exec` gave the listener's pid to a shell: the listener-only stop would end the shell and leave `sshd` |

R1 is the parent's rule (*The launch instrument*: "the run records `git rev-parse HEAD` and the answer of
`git status --porcelain --untracked-files=no`, which is empty, or the run is no run of that commit"). So a run of section 10 from a
tree with an edit of a tracked file FAILS, also on a developer's machine. That is on purpose: every row's proving run and E3.S10's run
are runs of a commit.

### 8.2 The format

One JSON object, `record: 1`:

| Field | Value | Kind of fact |
|---|---|---|
| `commit` | `git rev-parse HEAD` of the repository root (`scripts/../..`) | answered by git |
| `trackedChanges` | `git status --porcelain --untracked-files=no`, whole; `''` for a clean tree, `null` when git failed | answered by git |
| `conventions` | `git rev-parse HEAD:.agents/conventions` (the lead's answer Q5) | answered by git |
| `parameters` | the two variables as the process got them, or `null` | named |
| `executables` | `{ role, path, real?, version?, sha256 }` each: the `sshd` as the run names it (with its real path and its `-V` line); each `SshdSessionPath` and `SshdAuthPath` that a line of the run names (`version: null`: a helper is not started alone); the program each listener ran (`program.json`); the programs that the listener of `k0` forked for the session (`session-programs.json`); the real client (its `-V` line) | named, or answered by the kernel; the `role` says which |
| `configs` | `{ file, sha256 }` each: every `sshd_config` and `client_config` under the section's folder (`k0/`, `k1/`, `k2/`, and `client_config`, the config that the shim hands the real client), the run's config file, and the shim (`shim/ssh`, a program that the run wrote) | the bytes that were handed |

A value that could not be read is `null`, never `0` or `''` (`coding-style.md`, *Absent is not zero*). The version is the first line
that starts with `OpenSSH_` of what `<program> -V` printed (F22 for the client); for an `sshd` that has no `-V` it is the head of its
usage text, which starts the same way (read, not measured: §19). Size: about 2 kB per run (three counterparts, about ten
executables, six config texts).

### 8.3 Where it is written

`<pin folder>/identities.json` (two-space JSON), and the line `identities <json>` on the standard output of the run. The folder is
removed when the section closes, pass or fail (F10), so the line in the run's saved output is the record that outlives the run. The
story's run saves its whole output outside the tree (§13), and the commit body and `research/module_tests.md` quote that line.

## 9. Test 33: `src/test/itestInstrument.test.ts` (new)

A file of its own, not more tests in `itestCallers.test.ts`: that file is about the pin that a script hands the argv builders (its
docblock), and test 33 is about the instrument. The parent's "as `itestCallers.test.ts` holds the scripts today" is the way: a scan of
the scripts in the suite, read whole, alive by its own companions.

```ts
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { discoverSources } from './tempSiteScan';

/**
 * G1, E3.S2: test 33 of `todo/PLAN_person_roads_pin_host_key.md` §5, the launch instrument of the real `sshd` runs (decision 16).
 *
 * <p><b>What this holds.</b> Every script starts its `sshd` with the executable of ONE place, `scripts/lib/sshdRun.cjs`, and every sshd
 * config of the real runs is written there: the one-connection config of `startSshd` and the config of the serving launcher. The
 * executable and the extra config lines are parameters of the run (`CREDS_ITEST_SSHD`, `CREDS_ITEST_SSHD_CONFIG`). With none, the
 * executable is `/usr/sbin/sshd` and both texts are, byte for byte, what the two starters wrote before E3.S2, so a run without
 * parameters (CI) starts what it started before. What a parameter DOES to a real `sshd` is not a unit test's to show: the story's own run
 * on an unpacked `sshd`, from a tree with no modified tracked file, shows it.</p>
 *
 * <p>The scan reads every script under `scripts/` whole, not line by line. It cannot pass by matching nothing: it must find the one
 * default, the two starts and the two config writers, each in the file where it belongs.</p>
 */

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
/** The instrument's one place: the executable of the run and the text of every sshd config of the real runs. */
const INSTRUMENT = 'lib/sshdRun.cjs';
/** The two files that START an sshd: `startSshd` (`sshd -d`) and the serving launcher (`sshd -D -e`). */
const STARTERS = ['itestServing.cjs', 'itestSshd.cjs'];
/** A script of ANOTHER plan that writes an sshd config of its own, with that plan as the reason. None does (read on 65a8cb3b). */
const OWN_CONFIGS = new Map<string, string>();

/** A string or template literal that names a program by a path that ends with `/sshd`. */
const SSHD_PATH = /(['"`])[^'"`\n]*\/sshd\1/g;
/** A start whose program has `sshd` in its name, in any case: `launch(<scope>, <program>,`, `spawn(`, `execFile(` and their Sync forms. */
const SSHD_START = /\b(?:launch\s*\(\s*[^,()]+,|spawn(?:Sync)?\s*\(|execFile(?:Sync)?\s*\()\s*[\w$.'"`/]*sshd[\w$.'"`/]*\s*,/gi;
/** The opening of an sshd config line that names the server's own address or files: only a writer of an sshd config holds one. */
const CONFIG_LINE = /(['"`])(?:ListenAddress|HostKey|AuthorizedKeysFile|PidFile) /g;
/** A definition of `SSHD` or of `RUN`, with its value. */
const DEFINITION = /\bconst\s+(?:SSHD|RUN)\s*=\s*[^;\n]+;/g;
/** A starter builds its text from the one place, with the run's lines: `oneConnectionConfig(RUN,` or `servingConfig(RUN,`. */
const TEXT_OF_THE_RUN = /\b(?:oneConnectionConfig|servingConfig)\(RUN,/g;

interface Place {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** Every match of `pattern` (global) in every script under `scripts/`, read whole. */
function places(pattern: RegExp): Place[] {
  return discoverSources(SCRIPTS, new Map(), ['.cjs', '.mjs', '.js']).flatMap((file) => {
    const text = fs.readFileSync(path.join(SCRIPTS, file), 'utf8');
    return [...text.matchAll(pattern)].map((found) => ({ file, line: text.slice(0, found.index).split('\n').length, text: found[0] }));
  });
}

const named = (list: Place[]): string[] => list.map((one) => `${one.file} ${one.text}`);

test('[33a] one place names the sshd: the default path stands once, in lib/sshdRun.cjs; no other script holds the path of an sshd', () => {
  const found = places(SSHD_PATH);
  assert.deepEqual(named(found), [`${INSTRUMENT} '/usr/sbin/sshd'`], JSON.stringify(found));
});

test('[33b] an sshd is started in the two starters only, once in each, with the SSHD of the one place', () => {
  const starts = places(SSHD_START);
  assert.deepEqual(starts.map((one) => one.file).sort(), STARTERS, JSON.stringify(starts));
  assert.ok(starts.every((one) => /,\s*SSHD\s*,$/.test(one.text)), JSON.stringify(starts));
  assert.deepEqual(named(places(DEFINITION)), ['itestSshd.cjs const RUN = sshdRunOf(process.env);', 'itestSshd.cjs const SSHD = RUN.executable;']);
});

test('[33c] every sshd config of the real runs is written in the one place, and both starters take their text and the run\'s lines from it', () => {
  const lines = places(CONFIG_LINE);
  const outside = lines.filter((one) => one.file !== INSTRUMENT && !OWN_CONFIGS.has(one.file));
  assert.deepEqual(outside.map((one) => `${one.file}:${one.line}: ${one.text}`), []);
  // Alive: the one place writes BOTH texts, so it holds two `ListenAddress` lines.
  assert.equal(lines.filter((one) => one.file === INSTRUMENT && one.text.includes('ListenAddress')).length, 2, JSON.stringify(lines));
  assert.deepEqual(places(TEXT_OF_THE_RUN).map((one) => one.file).sort(), STARTERS);
  for (const [file, reason] of OWN_CONFIGS) {
    assert.ok(fs.existsSync(path.join(SCRIPTS, file)), `the exception ${file} names no file: remove it`);
    assert.ok(reason.split(/\s+/).length >= 3, `the exception ${file} needs its plan as the reason`);
  }
});

/* --- the one place, by what it answers (it is loaded at run time, so this file compiles before it exists) --- */

/** What `sshdRunOf` of `scripts/lib/sshdRun.cjs` answers. Written here: the module is CommonJS with no `.d.cts`; `exported` checks each name. */
interface SshdRun {
  readonly executable: string;
  readonly configFile: string | undefined;
  readonly lines: readonly string[];
}
type RunOf = (env: Readonly<Record<string, string | undefined>>) => SshdRun;
type OneConnection = (run: SshdRun, given: { address: string; port: number; first?: string[]; hostKeyPath: string; authorizedKeys: string; pidFile: string; extra?: string[] }) => string;
type Serving = (run: SshdRun, given: { port: number; hostKey: string; authorizedKeys: string; pidFile: string; penalties: boolean; extra?: string[] }) => string;

const LIB = path.join(SCRIPTS, 'lib', 'sshdRun.cjs');

/** An export of the one place, checked at run time: the file exists and the name is a function. */
function exported<T>(name: string): T {
  assert.ok(fs.existsSync(LIB), `${LIB} does not exist`);
  const value: unknown = createRequire(__filename)(LIB)[name];
  assert.equal(typeof value, 'function', `${name} is not a function of ${INSTRUMENT}`);
  return value as T;
}

const scope = cleanupScope();
after(() => scope.close());

/** What `startSshd` wrote before E3.S2 (`scripts/itestSshd.cjs:102-117` on 65a8cb3b), for the values of `ONE`. */
const oneBefore = (first: string[], extra: string[]): string[] => [
  'ListenAddress 127.0.0.2:40022', ...first, 'HostKey /o/host_key', 'AuthorizedKeysFile /o/authorized_keys', 'PidFile /o/sshd.pid',
  'UsePAM no', 'StrictModes no', 'PasswordAuthentication no', 'KbdInteractiveAuthentication no', ...extra, '',
];
const ONE = { address: '127.0.0.2', port: 40022, hostKeyPath: '/o/host_key', authorizedKeys: '/o/authorized_keys', pidFile: '/o/sshd.pid' };
/** What `servingConfig` wrote before E3.S2 (`scripts/itestPinnedRoads.cjs:68-84` on 65a8cb3b), for the values of `SERVING`. */
const servingBefore = (penalties: boolean): string[] => [
  'ListenAddress 127.0.0.1:40023', 'HostKey /o/k1_key', 'AuthorizedKeysFile /o/authorized_keys', 'PidFile /o/k1/sshd.pid',
  'UsePAM no', 'StrictModes no', 'PasswordAuthentication no', 'KbdInteractiveAuthentication no', 'LogLevel VERBOSE', ...(penalties ? ['PerSourcePenalties no'] : []), '',
];
const SERVING = { port: 40023, hostKey: '/o/k1_key', authorizedKeys: '/o/authorized_keys', pidFile: '/o/k1/sshd.pid' };
const RSA = ['PubkeyAcceptedAlgorithms +ssh-rsa'];
const PASSWORDS = ['PasswordAuthentication yes', 'KbdInteractiveAuthentication no'];
const UNPACKED = ['SshdSessionPath /u/usr/lib/openssh/sshd-session', 'SshdAuthPath /u/usr/lib/openssh/sshd-auth'];

test('[33d] with no parameter the run is /usr/sbin/sshd with no extra line, and both texts are what the starters wrote before', () => {
  const runOf = exported<RunOf>('sshdRunOf');
  for (const env of [{}, { CREDS_ITEST_SSHD: '', CREDS_ITEST_SSHD_CONFIG: '' }]) {
    const run = runOf(env);
    assert.deepEqual({ ...run, lines: [...run.lines] }, { executable: '/usr/sbin/sshd', configFile: undefined, lines: [] });
    assert.ok(Object.isFrozen(run) && Object.isFrozen(run.lines), 'the run is never changed after it is read');
  }
  const run = runOf({});
  const one = exported<OneConnection>('oneConnectionConfig');
  assert.equal(one(run, ONE), oneBefore([], []).join('\n'));
  assert.equal(one(run, { ...ONE, first: PASSWORDS, extra: RSA }), oneBefore(PASSWORDS, RSA).join('\n'));
  const serving = exported<Serving>('servingConfig');
  assert.equal(serving(run, { ...SERVING, penalties: true }), servingBefore(true).join('\n'));
  assert.equal(serving(run, { ...SERVING, penalties: false }), servingBefore(false).join('\n'));
});

test('[33e] the lines of the run reach both texts, once each, after the starter\'s own lines and before the caller\'s', () => {
  const dir = ownedDir(scope, 'sshdrun');
  const file = path.join(dir, 'extra.conf');
  fs.writeFileSync(file, `# the unpacked sshd\n\n${UNPACKED.join('\n')}\n`);
  const run = exported<RunOf>('sshdRunOf')({ CREDS_ITEST_SSHD_CONFIG: file });
  assert.deepEqual([...run.lines], UNPACKED);
  assert.equal(run.configFile, file);
  const one = exported<OneConnection>('oneConnectionConfig')(run, { ...ONE, first: PASSWORDS, extra: RSA });
  assert.equal(one, oneBefore(PASSWORDS, [...UNPACKED, ...RSA]).join('\n'));
  const before = servingBefore(true);
  const serving = exported<Serving>('servingConfig')(run, { ...SERVING, penalties: true, extra: ['ForceCommand /o/forced'] });
  assert.equal(serving, [...before.slice(0, -1), ...UNPACKED, 'ForceCommand /o/forced', ''].join('\n'));
});

test('[33f] a parameter that cannot be used is refused, naming its variable, and an executable file is taken as it is named', () => {
  const runOf = exported<RunOf>('sshdRunOf');
  const dir = ownedDir(scope, 'sshdrun');
  const exe = path.join(dir, 'sshd-wrap.sh');
  fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  assert.equal(runOf({ CREDS_ITEST_SSHD: exe }).executable, exe);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD: 'sshd-wrap.sh' }), /CREDS_ITEST_SSHD .*absolute/);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD: path.join(dir, 'absent') }), /CREDS_ITEST_SSHD names .*absent/);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD: dir }), /CREDS_ITEST_SSHD names /);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD_CONFIG: 'extra.conf' }), /CREDS_ITEST_SSHD_CONFIG .*absolute/);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD_CONFIG: path.join(dir, 'absent.conf') }), /CREDS_ITEST_SSHD_CONFIG names .*absent\.conf/);
  const match = path.join(dir, 'match.conf');
  fs.writeFileSync(match, `${UNPACKED[0]}\nMatch User someone\n  PermitTTY no\n`);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD_CONFIG: match }), /CREDS_ITEST_SSHD_CONFIG: .*Match/);
});

test('[33g] a file that is not executable is refused as the sshd of a run', { skip: process.platform === 'win32' ? 'Windows has no execute bit' : false }, () => {
  const plain = path.join(ownedDir(scope, 'sshdrun'), 'not-executable');
  fs.writeFileSync(plain, '#!/bin/sh\n', { mode: 0o644 });
  const runOf = exported<RunOf>('sshdRunOf');
  assert.throws(() => runOf({ CREDS_ITEST_SSHD: plain }), /CREDS_ITEST_SSHD names .*not an executable file/);
});
```

| Row | What it asserts | Holds the parent's words |
|---|---|---|
| 33a | a quoted literal that ends with `/sshd` stands once in all of `scripts/`: `'/usr/sbin/sshd'` in `lib/sshdRun.cjs` | "No script under `scripts/` holds the path of an `sshd` of its own" |
| 33b | every start whose program has `sshd` in its name is in `itestServing.cjs` or `itestSshd.cjs`, once in each, with `SSHD`; `SSHD` and `RUN` are defined once, in `itestSshd.cjs`, as `RUN.executable` and `sshdRunOf(process.env)` | "each takes the executable from the instrument's one place" |
| 33c | no literal that opens an sshd config line (`ListenAddress `, `HostKey `, `AuthorizedKeysFile `, `PidFile `) stands outside `lib/sshdRun.cjs`, except in a file of `OWN_CONFIGS` (empty; each entry would need its plan as the reason); `lib/sshdRun.cjs` holds two `ListenAddress` lines; each of the two starters builds its text with `(oneConnectionConfig\|servingConfig)(RUN,` | "The two starters … take the extra lines of the server's config from the same place. A script of another plan that writes an `sshd` config of its own is named in the scan with its plan as the reason" |
| 33d | with no variable (and with both empty): `/usr/sbin/sshd`, no line, no config file, a frozen answer; both texts equal, line for line, the texts of `65a8cb3b` (copied into the test from `itestSshd.cjs:102-117` and `itestPinnedRoads.cjs:68-84`), with and without `first`, the caller's lines and the penalties line | "With no parameter the executable is `/usr/sbin/sshd` and there is no extra line, so a run without parameters starts what it started before" |
| 33e | a config file with a comment, blank lines and the two lines of an unpacked `sshd`: the run's lines are the two lines; both texts hold them once, after the starter's lines and before the caller's | the lines reach both starters |
| 33f | an executable file is taken as named; a relative path, a missing file, a folder, a relative or missing config file and a `Match` line are each refused, naming the variable | a parameter that cannot be used is no run |
| 33g | a file without the execute bit is refused (skipped on Windows, which has no such bit) | as 33f |

"The scan finds its places, so it cannot pass by matching nothing": 33a requires exactly one find, 33b exactly two starts, 33c two
`ListenAddress` lines and two text calls. **What the scan cannot see** (§17): a path built from pieces (`'/usr/sbin/' + name`), a start
whose program is a value with no `sshd` in its name, a config written from a template file. And it reads comments: a comment that
quotes the default path in quotes or backticks is a find of 33a, which is why the rule of *Binding constraints* says to name it as
`SSHD_DEFAULT`.

## 10. RED first: how it is watched, and what was seen

Watched on the scratch worktree of F20, the test file alone on the scripts of `5b8078c8` (the same as `65a8cb3b`): `tsc -p ./` exit 0,
then `itestInstrument.test.js`: **7 tests, 0 pass, 7 fail**, exit 1, each a failed assertion:

- 33a: `[{"file":"itestSshd.cjs","line":13,"text":"'/usr/sbin/sshd'"}]`; actual `[ "itestSshd.cjs '/usr/sbin/sshd'" ]`, expected
  `[ "lib/sshdRun.cjs '/usr/sbin/sshd'" ]`.
- 33b: `[{"file":"itestPinnedRoads.cjs","line":90,"text":"launch(rig.scope, SSHD,"},{"file":"itestSshd.cjs","line":118,"text":"launch(scope, SSHD,"}]`;
  actual `[ 'itestPinnedRoads.cjs', 'itestSshd.cjs' ]`, expected `[ 'itestServing.cjs', 'itestSshd.cjs' ]`.
- 33c: actual `[ 'itestPinnedRoads.cjs:70: `ListenAddress ', 'itestPinnedRoads.cjs:71: `HostKey ', 'itestPinnedRoads.cjs:72: `AuthorizedKeysFile ', 'itestPinnedRoads.cjs:73: `PidFile ', 'itestSshd.cjs:105: `ListenAddress ', 'itestSshd.cjs:107: `HostKey ', 'itestSshd.cjs:108: `AuthorizedKeysFile ', 'itestSshd.cjs:109: `PidFile ' ]`, expected `[]`.
- 33d, 33e, 33f, 33g: `…/scripts/lib/sshdRun.cjs does not exist` (actual `false`, expected `true`).

That is the parent's RED in its own words: "the path is a constant (`itestSshd.cjs:13`), and neither config reads a parameter
(`itestSshd.cjs:102-117`, `itestPinnedRoads.cjs:68-84`)". In the first draft 33g called `exported` inside `assert.throws`, so its RED
was the module's absence caught as the thrown error; the test of §9 loads the module first, so its RED is the same failed assertion as
33d to 33f. **GREEN** on the draft of §2 to §8: 7 of 7 (F21).

The coder watches the RED again on the story's own base before §2: the test file alone, compiled, run; the same seven, with these texts.
A different text is a stop.

## 11. What CI sees

- **No step and no variable changes.** `ci-extension.yml` is not touched; it sets neither variable (§16, a search). So `RUN` is
  `/usr/sbin/sshd` with no line, the apt step still installs it (`:164`), and every config text is the text of before (33d).
- **Sections 5, 7, 8, 9, the bridged harnesses** (`itest:ssh-agent`, `itest:bridged-ssh` in two jobs, `itest:bridged-mysql`,
  `itest:bridged-psql`): they start what they started before, through `startSshd` and `launch`, whose texts and signatures do not change.
  The CI run of the story's head sha is where the stories document asks to see them pass (its E3.S2, item 5).
- **Section 10 gains** leg 0 (L0.1 to L0.9) and the record (R1 to R6), after leg 2, and one `identities …` line in the log. Legs 1 and 2
  are as before. This is the instrument's own proof on the runner's `sshd`, the one that M3 will use there (see *Notes for the lead*).
- **R1 in CI** needs a checkout whose tracked files the job did not change before `itest:ssh-agent`. By reading, the steps before it
  write only ignored output (`npm ci`, `out/`, `node_modules` of the shared rules, the .NET `bin` and `obj`); not measured (§19). If R1
  fails there, it is a finding about a step of the job, and a stop: R1 is not weakened.
- **A missing `sshd` under `CI=true`** fails as before (the five lines of *Binding constraints* do not change).

## 12. The documents of this story

### 12.1 `research/module_tests.md`

In the section `## The three roads of the person and the saved host key (G1)` (`:2543`):

1. **The table** (`:2555-2570`): a row for `itestInstrument.test.ts` | 7 | "E3.S2, test 33: the launch instrument. 33a-33c, a scan of
   every script under `scripts/`, read whole: one quoted path of an `sshd` (`lib/sshdRun.cjs`), every start of an `sshd` in the two
   starters with `SSHD`, every sshd config text in `lib/sshdRun.cjs`, and both starters build it with `RUN`; it is alive by its own
   counts. 33d-33g, `lib/sshdRun.cjs` by what it answers: with no parameter the system's `sshd` and the texts of before, byte for byte;
   the run's lines in both texts after the starter's and before the caller's; every parameter that cannot be used refused with its
   variable's name." The row of `scripts/itestPinnedRoads.cjs` (`:2569`): its count of checks (read from the story's run), "three legs",
   and one sentence each for leg 0 and the record (§7, §8), and that every server is started by the serving launcher of
   `scripts/itestServing.cjs`.
2. **A new paragraph after the table, `**The counterpart of the real runs (E3.S2).**`**, which replaces the recipe of a scratch copy
   (the parent's §6, *E3.S2 (the instrument) updates*). It says:
   - where the counterpart comes from: in CI, `/usr/sbin/sshd`, which the step *Install sshd for the live OpenSSH login* installs, with
     no parameter; locally, any `sshd` named by `CREDS_ITEST_SSHD`, with its extra lines in the file named by
     `CREDS_ITEST_SSHD_CONFIG` (an unpacked `sshd` 10.x needs `SshdSessionPath` and `SshdAuthPath`), and a wrapper that sets its library
     path and `exec`s it; no tracked file is edited, and a value that cannot be used ends the harness with the variable's name;
   - the exact commands of §13, steps 1 to 4, with `<SP>` for the folder of the unpacked files;
   - that every sshd config text is written by `scripts/lib/sshdRun.cjs`, and the order of its lines (§1.1);
   - leg 0 and what it shows (one sentence per check group: L0.3-L0.4, L0.5-L0.7, L0.8);
   - the record: where it is written, its format (§8.2) and R1;
   - what it does not prove: a counterpart of another operating system; a root `sshd`; that `sshd` keeps the first value of a keyword
     (read in its manual and relied on since E1.6, not measured by this story); a helper's version (Q1).
3. **`**The instrument, seen when it was built (<date>).**`**: the story's run (§13): the client's and the `sshd`'s versions, the
   commit, the whole `identities` line, section 10's count of `ok` lines and time, the whole script's count, and the CI run of the
   head sha (the lead's, after the push) with the runner's versions as its record names them.
4. **The table of *Test leftovers*** (`:277`, the row of `ssh-agent-itest.cjs`): section 10's `pin` folder now also holds `k0/` (leg 0's
   config, known-hosts file and control socket), `program.json` per counterpart, `k0/session-programs.json` and `identities.json`; a
   master that a killed run strands ends by itself after 60 s with no client (`ControlPersist 60`).
5. ***How to run everything*** (`:2662`), after `npm run itest:all`: one comment line, "a local run of the real `sshd` sections on an
   `sshd` that is not `/usr/sbin/sshd`: `CREDS_ITEST_SSHD=<sshd or its wrapper> CREDS_ITEST_SSHD_CONFIG=<file of extra lines>
   npm run itest:ssh-agent` (the G1 section, *The counterpart of the real runs*)".

### 12.2 The launchers' comments

- `scripts/itestSshd.cjs`: the header paragraph and the docblock sentence of §3 (the run's lines between the defaults and
  `extraConfig`).
- `scripts/itestServing.cjs`: its header and the docblocks of `startServingSshd` and `stopListener` (§4).
- `scripts/lib/sshdRun.cjs`: its header (§2).
- `scripts/itestPinnedRoads.cjs`: the header (§5): leg 0, the record, the serving launcher, the parameters.
- `scripts/ssh-agent-itest.cjs:42-45`, the comment of section 10: after "…and the person is told so." add, on the same paragraph, "Leg 0
  (E3.S2) shows that a master connection outlives the stop of its listener and carries one more command, and the section ends with the
  record of identities of what ran." 772 → 773 lines.

## 13. The story's run (the parent's §8 *E3.S2*: section 10 on an unpacked `sshd`, from a tree with no modified tracked file)

This machine has no `sshd` (F14), and this spec fetched nothing. The run needs one: see **Q2**. With the lead's go, the recipe is F15's
with `e3s2-` folder names; `$SP` is the session's scratchpad. **Nothing of it is committed, and no `$SP` path enters a committed file.**

1. The `sshd`, unpacked as data, into new empty folders that hold no script:
   `mkdir "$SP/e3s2-deb" "$SP/e3s2-sshd" "$SP/e3s2-run"`; `(cd "$SP/e3s2-deb" && apt-get download openssh-server libwrap0)`;
   `for deb in "$SP"/e3s2-deb/*.deb; do dpkg-deb -x "$deb" "$SP/e3s2-sshd"; done`.
2. The wrapper `$SP/e3s2-run/sshd-wrap.sh` (`chmod 700`), with `$SP` written out, and `exec` (R6 checks it):
   `#!/bin/sh` / `LD_LIBRARY_PATH=$SP/e3s2-sshd/usr/lib/x86_64-linux-gnu exec $SP/e3s2-sshd/usr/sbin/sshd "$@"`.
3. The run's lines, `$SP/e3s2-run/sshd-extra.conf`:
   `SshdSessionPath $SP/e3s2-sshd/usr/lib/openssh/sshd-session` and `SshdAuthPath $SP/e3s2-sshd/usr/lib/openssh/sshd-auth`, `$SP`
   written out.
4. The commits of §14 are made (c1, c2). `git status --porcelain --untracked-files=no` answers nothing. Then, in `src_vs_code`:

   ```bash
   CREDS_ITEST_SSHD="$SP/e3s2-run/sshd-wrap.sh" CREDS_ITEST_SSHD_CONFIG="$SP/e3s2-run/sshd-extra.conf" \
     npm run itest:ssh-agent > "$SP/e3s2-run/run1.txt" 2>&1; echo "exit $?"
   ```

   The whole script, so sections 5, 7, 8 and 9 run on the same `sshd` without a copy. Twice more for section 10's three runs in a row
   (`run2.txt`, `run3.txt`).
5. Read in each output: exit 0, no `FAIL`, legs 1 and 2 as before (48 checks, F15), L0.1 to L0.9 and R1 to R6 `ok`, and the
   `identities` line: `commit` is c2's sha, `trackedChanges` is `""`, `parameters` name the two files, the `sshd` as named is the
   wrapper, the listeners' program is `$SP/e3s2-sshd/usr/sbin/sshd`, `session-programs` names `sshd-session` (or what it names: record
   it as seen), every `sha256` is set.
6. After each run (E2.S4's §5.5): `ls /tmp | grep -E "creds-pin|^creds-$(id -un)-"` and
   `ps -u "$(id -u)" -o pid,args | grep -E 'sshd|ssh -F' | grep -v grep` print nothing of this run. A process that is left is ended by
   its pid; a socket `creds-<user>-<id>.sock` by its exact name; and the lead is told.
7. **The control of leg 0, by hand** (MU12 of §15): in the worktree, make `stopListener` call `endServer(server, [], taken)` in place of
   `endChild(server.sshd)`, run section 10 once with the parameters, save the output, and restore the file (`git diff` empty). Expected:
   L0.4, L0.5 and L0.7 FAIL (the session, the master and the command went with the server). This is a hand check, recorded as such in
   the body of c3; it shows that leg 0 can fail.
8. **The control of R1, by hand**: add one space to the end of a comment line of `scripts/itestSshd.cjs`, run section 10 once, restore.
   Expected: R1 FAIL, with ` M src_vs_code/scripts/itestSshd.cjs` in its detail. Recorded in c3.
9. Remove the unpacked files and the wrapper when the lead has read the record: `rm -rf "$SP"/e3s2-deb "$SP"/e3s2-sshd "$SP"/e3s2-run`.

If a leg or a check fails on the real `sshd`: stop and tell the lead with the saved output. L0.4, L0.5, L0.6 or L0.7 red would mean that
the stop of the listener alone does not leave a master here, and M3 cannot be built as the parent writes it (decision 18's path).

## 14. Order of work, and the commits

1. Read `git status --short`. **The test** (§9) alone. Compile: exit 0. Run it: the seven REDs of §10. Save the output.
2. **The instrument** (§2, §3, §4, §5 without the two lines of leg 0 and the record in `pinnedLegs`). `node --check` each script.
   Compile. `itestInstrument` 7 of 7; `itestCallers`, `harnessSites`, `harnessScope` green. `wc -l` of the changed scripts.
   `node scripts/ssh-agent-itest.cjs` without parameters: on a machine without `sshd`, five skips and exit 0; with
   `CREDS_ITEST_SSHD=relative/sshd`: exit 1 and the `TypeError` of F21.
3. **The mutations** MU1 to MU7 (§15), one at a time, each restored. Save what each printed.
4. Typecheck, lint, ratchet, `npm test`: green. The leftovers guard (*Commands*, 7): clean.
   Commit **c1**: `feat(ssh): G1 E3.S2 — one place names the sshd of the real runs and writes every sshd config; the executable and the
   extra lines are parameters of the run (test 33)`. Files: `scripts/lib/sshdRun.cjs`, `scripts/itestSshd.cjs`,
   `scripts/itestServing.cjs`, `scripts/itestPinnedRoads.cjs`, `src/test/itestInstrument.test.ts`. Body: the RED texts of step 1, the
   mutations, the line counts, "no workflow and no product file changed", and what is not measured yet (§19).
5. **Leg 0 and the record** (§6, §7, §8, the two lines of §5's `pinnedLegs`, §12.2's comment of `ssh-agent-itest.cjs`).
   `node --check`; compile; the four test files of step 2 green; `node scripts/ssh-agent-itest.cjs` as in step 2. MU8 to MU11 (§15)
   where they need no `sshd`. Commit **c2**: `feat(ssh): G1 E3.S2 — leg 0: a master outlives the stop of its listener; the record of
   identities of a real run`. Files: `scripts/itestListenerStop.cjs`, `scripts/itestIdentities.cjs`, `scripts/itestNoSharing.cjs`,
   `scripts/itestPinnedRoads.cjs`, `scripts/ssh-agent-itest.cjs`.
6. **The story's run** (§13) on c2, from the tree of c2 with no modified tracked file; its two hand controls (§13, 7 and 8).
7. **The documents** (§12.1) with the numbers and the record of step 6. `node .agents/conventions/tools/plan-lifecycle.mjs` and
   `node .github/scripts/public-hygiene.mjs` from the root: clean. Commit **c3**: `docs(tests): G1 E3.S2 — where the counterpart of the
   real runs comes from, its parameters, leg 0 and the record of identities`. Body: the whole `identities` line of run 1, the counts of
   the three runs, the two hand controls (as hand checks, not results), and the after-run checks of §13, 6.

No commit holds a red test. The CI run of the head sha (the lead pushes) is the last item of §16.

## 15. Mutation checks (each must turn red what it names; restore after each)

| # | Mutation | Red | Needs an `sshd` |
|---|---|---|---|
| MU1 | `itestSshd.cjs`: `const SSHD = '/usr/sbin/sshd';` again | 33a, 33b | no (measured, F23) |
| MU2 | `oneConnectionConfig` without `...run.lines` | 33e | no (measured) |
| MU3 | `servingConfig` with `...extra` before `...run.lines` | 33e | no (measured) |
| MU4 | `itestServing.cjs`: `launch(rig.scope, '/usr/sbin/sshd', …)` | 33a, 33b | no (measured) |
| MU5 | `itestServing.cjs`: `servingConfig({ lines: [] }, …)` in place of `servingConfig(RUN, …)` | 33c | no (measured) |
| MU6 | `linesOf` without the `Match` refusal | 33f | no (measured) |
| MU7 | `executableOf` answers the default when the named file does not exist | 33f | no (measured) |
| MU8 | `recordIdentities`: R1 asks `record.trackedChanges !== null` (any answer passes) | the hand control of §13, 8: with the edited file R1 must FAIL, and under MU8 it passes, so the control finds MU8 | yes |
| MU9 | `recordIdentities`: R1 asks `!record.trackedChanges` (so `null` passes) | R1 on an unread status: call `recordIdentities` with a `check` that prints, in a worktree whose `git status` fails (the shape of F22), on a folder with one `k1/program.json`: R1 must print FAIL, and under MU9 it prints ok | no |
| MU10 | `executablesOf` without `listeners` | R3, R5, R6 | yes |
| MU11 | `stopListener` signals `-server.identity.pid` (a process group) | do NOT run: it would signal the harness's own group (F5). Reviewed by reading only | — |
| MU12 | `stopListener` calls `endServer` in place of `endChild` | L0.4, L0.5, L0.7 (§13, 7) | yes |

MU8 and MU10 run in the story's run (§13) when it is had; MU11 is a reading item of the review (§18).

## 16. Done when (each item can be counted)

- [ ] `src/test/itestInstrument.test.ts` has 7 tests; all 7 were watched red on the story's base with the texts of §10 and pass after
      c1.
- [ ] A search of `scripts/` for `/usr/sbin/sshd` finds one place, `lib/sshdRun.cjs` (33a); a search of `scripts/` for
      `CREDS_ITEST_SSHD` finds `lib/sshdRun.cjs` and comments only; a search of `.github/` for `CREDS_ITEST_SSHD` finds nothing.
- [ ] `itestSshd.cjs` exports what it exported and `RUN`; `startSshd` has its signature of `65a8cb3b`.
- [ ] `itestServing.cjs` holds the serving launcher, `stopListener` and `endServer`; the moved functions are byte for byte those of
      `itestPinnedRoads.cjs:124-212` (`git diff --color-moved`).
- [ ] Every changed or new script has at most 800 lines (`wc -l`; the draft's counts are in the table at the top).
- [ ] MU1 to MU7 each turned red what §15 names; MU8, MU10 and MU12 in the story's run.
- [ ] `npm run typecheck`, `npm run lint` (no new `eslint-disable`), `npm run ratchet`, `npm test` green; the leftovers guard clean.
- [ ] The story's run (§13): three runs of the whole script on an unpacked `sshd`, from the tree of c2 with no modified tracked file;
      exit 0; section 10 with L0.1-L0.9 and R1-R6 `ok`; the record names c2, an empty `trackedChanges` and every SHA-256; the after-run
      checks print nothing. Its `identities` line is in the body of c3 and in `research/module_tests.md`.
- [ ] The two hand controls of §13 (7, 8) turned red what they name, and the files were restored.
- [ ] The documents of §12 are written.
- [ ] In CI, on the head sha that the lead pushes: `itest:ssh-agent` (sections 5, 7, 8, 9, 10 with leg 0 and the record),
      `itest:bridged-ssh` (both jobs), `itest:bridged-mysql` and `itest:bridged-psql` green; the `identities` line of that run names
      `/usr/sbin/sshd` and the runner's versions. This box is the lead's.

## 17. Break it — ways to make the tests pass while the defect stays, and what stops each one

| # | The way | What stops it |
|---|---|---|
| BR1 | A script builds the path of an `sshd` from pieces (`path.join('/usr/sbin', 'ss' + 'hd')`) and starts it | not the scan (§9). R6 and R5 in the run (the program of every listener is recorded, and all must be one); the review (§18, 3) |
| BR2 | A row starts its counterpart with its own `launch(scope, exe, …)`, `exe` from a variable of its own | not the scan, when the name has no `sshd`. The stories document makes the serving launcher the one of every row; the review of each row-story; R5 |
| BR3 | A config is written from a template file, not from literals | not the scan. Every `sshd_config` of the section's folder is hashed (R4), and the review reads where it came from |
| BR4 | Leg 0's command does not ride the master but makes a new connection, because the listener was not really stopped | L0.3 (the pid is no longer the same process), L0.6 (`Connection refused`), L0.8 (one accepted login) |
| BR5 | The master dies with the listener, and `ControlMaster auto` makes the client of L0.7 a new master | it needs a listener: L0.6 shows none, so L0.7 fails |
| BR6 | The record hashes the wrapper only, and a different `sshd` runs behind it | the program of every listener, by `/proc/<pid>/exe` (R3, R5, R6) |
| BR7 | R1 passes on an unread status | R1 asks `=== ''`; `null` fails (F22, MU9) |
| BR8 | CI passes because section 10 skips | `CI=true` fails a missing `sshd` (`itestPinnedRoads.cjs:663-666`, unchanged) |
| BR9 | A workflow sets `CREDS_ITEST_SSHD`, and CI no longer runs the system's `sshd` | §16, the search of `.github/`; the `identities` line of the CI run names the `sshd` it ran |
| BR10 | The default is kept in the scan but `RUN` is built from a constant elsewhere | 33b: `RUN` and `SSHD` are defined once, with these values |
| BR11 | A wrapper that does not `exec`: the listener's pid is a shell, and the listener-only stop ends the shell | R6 (the listener's program must end with `/sshd`); L0.3 would see the shell gone while `sshd` listens, and L0.6 would fail |

## 18. Opus review checklist

1. `lib/sshdRun.cjs` is pure: no read of `process.env` and no file read at load. `sshdRunOf` answers a frozen object, and no caller
   changes it. An empty variable counts as not set; every refusal names its variable; no refusal falls back to the default.
2. Both config functions: with a run of no lines, compare by eye with `itestSshd.cjs:102-117` and `itestPinnedRoads.cjs:68-84` of
   `65a8cb3b`; the run's lines stand after the starter's lines and before `extra`; the two comments of the old `servingConfig` are kept.
3. Search `scripts/` for every start of an `sshd` (`-d`, `-D`, `sshd`, `SSHD`): only `startSshd` and `startOnce`. Search for a `-f` with
   a config path: only those two.
4. `itestServing.cjs`: the moved functions are byte for byte; `startServingSshd` never changes `given` in place; `programOf` asks `alive`
   before and after the read; `stopListener` lists BEFORE it ends, signals only through `endChild`, and never a group. Ask: can a listener
   that ignores SIGTERM stay? (`endChild` sends SIGKILL after 5 s.)
5. Leg 0: the client is started by its real path, never through the shim; the master's pid is taken from its own answer; every process
   it leaves is ended by pid and start time; the control socket is in the owned folder; `ControlPersist` is finite. Ask: if the master
   never comes up, does the leg end without a hang? (`within` 10 s; every client bounded 20 s.)
6. The record: every value that could not be read is `null`; `trackedChanges` keeps the text whole; the SHA-256 of a listener is of
   `/proc/<pid>/exe`; the record is printed as one line and written into the section's folder only.
7. R1 to R6 are checks, not prints; a missing record would leave R-checks unrun: confirm `pinnedLegs` calls `recordIdentities`
   whenever `real` was found, also after a failed leg.
8. Sections 5, 7, 8, 9 and the bridged harnesses: their calls are unchanged (`git diff` of those files: only `itestNoSharing.cjs`'s
   `runClient` and its export).
9. `itestInstrument.test.ts`: the scan reads every script; each row has its companion count; `OWN_CONFIGS` is empty and its loop would
   check a reason; the copied texts in 33d are those of `65a8cb3b`, not of the new module.
10. The documents: `research/module_tests.md` says where the counterpart comes from, the exact command with both variables, and what is
    not proven; no scratch path; the record of the story's run is quoted whole.
11. Read §19 and the *Questions for the lead*: is one of the open points more than a note before E3.S3 starts?

## 19. Not measured by this spec

- **Any run on a real `sshd`.** This machine has none (F14), and nothing was fetched. So: leg 0 (L0.1 to L0.9) on 10.2p1 and on 9.6p1;
  that SIGTERM to the listener of `sshd -D -e` leaves the processes of a session alive (expected from how `sshd` ends its listener, not
  read in its source here); that the log of a session still reaches the listener's stderr pipe after the listener exited (L0.8 counts
  one login either way); that a new counterpart can take the port after the stop (M3's switch needs it; leg 0 does not); `sshd -V` of
  10.2p1 and of 9.6p1 (for an `sshd` without `-V`, the head of its usage text is expected to start with `OpenSSH_`: read from memory of
  the OpenSSH sources, not checked); `/proc/<pid>/exe` of an `sshd` started through the wrapper (expected: the unpacked `sshd`, because
  the wrapper `exec`s); what `session-programs.json` names; the count of section 10's checks with leg 0 and the record; R1 in CI. The
  story's run (§13) and the CI run of its head sha measure them.
- **`sshd` keeps the first value of a keyword**: the manual's rule, relied on since E1.6 (F2); not run by this story.
- **The whole extension suite** on the draft: not run (the scratch worktree's linked submodule breaks `git status` there, F22). The
  four test files that read the scripts were run (F21).
- **A helper program's version** (Q1).
- **Windows and macOS**: section 10 is Linux only; 33g is skipped on Windows.

## What grows

| What | How much | Who retires it | When it is interrupted |
|---|---|---|---|
| `identities.json`, `program.json` per counterpart, `k0/session-programs.json` | about 3 kB per run of section 10 | the section's scope removes the `pin` folder, pass or fail | the janitor of test leftovers sweeps the owned folder (`research/module_tests.md`, *Test leftovers*) |
| leg 0's `k0/` folder: a config, a known-hosts file, the control socket | a few hundred bytes and one socket per run | as above | as above |
| leg 0's master connection (one `ssh` process) and its session on K1 | one each, for the seconds of leg 0 | the leg: `ssh -O exit`, then its pid and start time; `endServer` for the session | `ControlPersist 60`: a stranded master ends by itself after 60 s with no client, and its session ends with it. A SIGKILL of the harness also leaves K1's listener, as today (`research/module_tests.md:2590`) |
| the record's line in the run's output | about 2 kB per run | the person who saves the output | nothing to sweep |

Nothing grows in the product.

## Questions for the lead

**The lead's answers (2026-11-23):** Q1, the reading stands: each helper gets its path and SHA-256, and `version: null` with its role; the SHA-256 is the identity, and the version of the `sshd` beside it is in the record. Not a plan change. Q2 waits for the owner: a download of the distribution's packages (nothing installed into the system) is asked of the owner first; the code of this story is built meanwhile, and its local run (leg 0 and the record on an unpacked `sshd`) waits for that answer. Q3, the reading stands: "CI does not change" is about the `sshd` that CI starts and what it is handed; leg 0 and R1-R6 run in CI too, so that the instrument of M3 is proven on the runner's `sshd`. Not a plan change.

**Q1 · The version of a helper program of `sshd`.**
- *The parent* (`## Epics`, E3, *The identities*): "the path, the version and the SHA-256 of every executable that a row ran (… the
  `sshd`, its wrapper and the helper programs that its config names …)".
- *What is so.* A helper (`sshd-session`, `sshd-auth`) is started by `sshd` with its own descriptors; it is not a program that a person
  starts alone, and what it does with `-V` was not read or run (F14). The record (§8.2) gives each helper its path and SHA-256, and
  `version: null` with the role "as a line of the run names it". The SHA-256 identifies the bytes; the version of the `sshd` beside it
  is in the record.
- *My reading:* the SHA-256 is the identity, and `null` says that the version was not asked; not a plan change. If the lead wants a
  version for each helper, the cheapest honest one is the version of the package that the helper was unpacked from (the name of the
  `.deb` file of §13, step 1), written by the person into the run's notes, not by the harness. The lead decides.

**Q2 · The `sshd` of the story's run.**
- *The parent* (§8, *E3.S2*, and the stories document, E3.S2 *Done when*): "section 10 passes locally on an unpacked `sshd` from a tree
  with no modified tracked file".
- *What is so* (F14): this machine has no `sshd` now; the unpacked ones of E1.S4 and E2.S4 were in `/tmp` and went with the restart of
  2026-11-23 10:15. The recipe (F15, §13) fetches two packages with `apt-get download` into the scratchpad. This spec was told to fetch
  nothing, so it did not.
- *What the lead decides:* whether the coder may run §13, step 1 (a download of the distribution's packages into the scratchpad, nothing
  installed into the system, as E1.S4 and E2.S4 did), or where else the `sshd` of the run comes from. Not a plan change: it decides
  only where the run gets its counterpart.

**Q3 · Leg 0 and the record run in CI too.**
- *The parent* (§8, *E3.S2*): "with none it starts `/usr/sbin/sshd` as before, so CI does not change".
- *What this spec does* (§11): with no parameter every counterpart and every config text is what it was (33d), and legs 1 and 2 run as
  before. Section 10 gains leg 0 and R1-R6 after leg 2, in CI as well, because M3 will run on the runner's `sshd` and its instrument
  should be proven there first.
- *My reading:* "CI does not change" is about the `sshd` and what it is handed, and leg 0 is the proof that the parent asks for, on both
  `sshd`s that the rows use; not a plan change. If the lead reads it as "no new check in CI", leg 0 and the record run only with a
  parameter, and the proof on 9.6p1 waits for M3 — that would be a narrower proof, and I would not choose it.

## Notes for the lead

- **Links and rows.** The stories document (its status line and `## E3.S2`), the parent's `## Epics`, E3.S2, and `todo/README.md` do not
  name this file. They are the lead's, in the commit that adds this spec (a README row is committed with the file it links).
- **R1 everywhere.** After this story a run of section 10 from a tree with an edit of a tracked file FAILS (R1), also during the
  development of a row-story. That is the parent's rule; the coders of E3.S4 to E3.S9 should know it before their first local run.
- **What E3.S3 gets.** `startServingSshd(rig, name, hostKey, port, extra)` takes a row's own lines (the lead's answer Q4: the `PATH` of
  the install's stand-in goes there, not into the run's file); `stopListener` for M3; `recordIdentities` reads every counterpart folder
  that holds `program.json`, so a probe or a row that starts its counterparts through the serving launcher is in the record without a
  change of `itestIdentities.cjs`. A probe that runs outside section 10 calls `recordIdentities` itself.
- **The draft.** The code of §2 to §9 was run as a draft on a scratch worktree (F20, F21, F23) and removed. It is the spec's, not a
  commit; the coder builds it again in the story's worktree and watches the RED there.
