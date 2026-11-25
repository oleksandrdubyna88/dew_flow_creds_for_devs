# PLAN — E3.S9 spec: the rows off the rig (M10, M11, M13)

> Status: **spec, 2026-11-24, by Opus; not built.** Story E3.S9 of [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md)
> (its decisions 15, 16 and 18; §3.5; §3.10; C20; `## Epics`, E3: *The setup of every measurement* and the rows M10, M11 and M13) and of its
> stories document [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md) (`## The rows: built story by story,
> measured once`, `## E3.S9`, the lead's answer Q3). It uses the instruments that E3.S3 probed (P2, P3, P5, P7) and applies the notes L2 to L5
> of the E3.S3 spec (*Notes for the row stories*). It builds on the common rig as built by E3.S4 to E3.S8. The parent, the stories document
> and `todo/README.md` do not name this file yet: the lead adds the links and the row (*Notes for the lead*). This file is promoted together
> with the parent.
>
> Scope: `src_vs_code/scripts` (six new files, fourteen changed), one new test file in `src_vs_code/src/test`, and
> `research/module_tests.md`. No product file (`src_vs_code/src` outside `src/test/`), no workflow, no `package.json`, no change of the
> `Containerfile`. **Read on `97752998`, 2026-11-24** (every `file:line` below is of that commit). E3.S8 is being built in the same tree now:
> it changes `itestRowRig.cjs` (`ROW_FILES`) and `itestPinnedRoads.cjs` (one call), so those line numbers move by two or three lines.
> E3.S9 starts after E3.S8's commits. Nothing was run for this spec: no `ssh`, no `sshd`, no container. Opus writes this spec, a Sonnet coder
> builds it, Opus reviews it.

"The parent" is the plan linked above; M10, §3.5, C20, decision 15 and so on are the parent's. Names of earlier specs have a prefix (`S3.P2`,
`S3.L4`, `S4.`, `S7.`). This document's own names: the facts F1 to F26, the dependencies D1 to D17, the checks `M10.x`, `M11.x`, `M13.x`,
the tests TX1 to TX10, the mutations MX1 to MX10, the hand checks HC1 to HC7, the break-its BR1 to BR15, and the questions Q1 to Q7. "A leg"
is what the E3.S4 spec says: one scenario with its own folder, its own leg process, its own world, its own key copy and its own
counterpart(s). This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`). The parent's epoch
3 has ONE entry (3.1), so the next entry is the SECOND, and it stops the whole plan.

## What E3.S9 decides, in one paragraph

The three rows do not run in section 10, and CI does not run them. They run through ONE new entry, `scripts/itestOffRig.cjs`, with the
names `m10`, `m11` and `m13`. **M10** runs inside the `wslc` container of S3.P2: the host part rebuilds nothing at run time, finds the image
by a tag that names the committed `Containerfile`'s blob (S3.L4), starts the container, and the part inside builds the rows' top and runs ONE
leg, `m10`, through the common rig: the control first with E1's three pairs (S3.L2), then the three roads under a handed config that says
`VerifyHostKeyDNS yes`, with the entry's host set to the resolver's name. **M11** runs on this machine with the unpacked OpenSSH 8.4p1 of
S3.P3 first on `PATH`: (a) two legs of the client alone; (b) the legs of M1, M2 (b) the mismatch and all seventeen legs of M7, each run by
the existing row code with an expectation for an older client (no `KnownHostsCommand`, one question per pinned call); (c) and (d) one leg
per road with a program of the leg that answers `-V` at once with no version at the start, or never; the counterparts that the older client
reaches log at `DEBUG1`, so their log names the client's version (S3.L5). **M13** is the client alone: `ssh.exe -G` of the owner's Windows,
started from WSL on the owner's machine by S3.P5's instrument, with the argvs that the product's two builders write for three storage folders
and K7's control, and the product's own decision for a UNC folder.

| File | Change | Lines (budget) |
|---|---|---|
| `scripts/lib/offRigRecord.cjs` (new) | pure: the leg tables; the older client's expectation (questions per call, the words); the two programs' texts; sentence F's pinned words and its judge; the times of (d); the reader of `-G`; K7's twin; the UNC words | ≤ 240 |
| `scripts/itestOffRig.cjs` (new) | the entry: `m10` (host part, `--inside`), `m11`, `m13`; `--legs` for hand checks; the record; the last line | ≤ 300 |
| `scripts/itestRowM10.cjs` (new) | the leg `m10` | ≤ 220 |
| `scripts/itestRowM11.cjs` (new) | `rowM11`, the (a) legs, the (b) wrappers, `legs` (with those of the next file) | ≤ 300 |
| `scripts/itestRowM11Never.cjs` (new) | the (c) and (d) legs | ≤ 260 |
| `scripts/itestRowM13.cjs` (new) | M13, the client alone (no leg process) | ≤ 300 |
| `src/test/itestRowsOff.test.ts` (new) | TX1 to TX10 | ≤ 380 |
| the changed files | §5, D1 to D17 | each in §5's budget |
| `research/module_tests.md` | M10, M11, M13 "seen when they were built" | — |

## Binding constraints

The binding constraints of the E3.S4 to E3.S8 specs hold here, word for word (no plan change; only `vscode` is a stand-in on the rows'
roads; through the committed instrument only; a run of the commit; the four counts apart; the guards green; exe + argv with a time limit,
every process ended by pid and start time; the person's `~/.ssh` never read or written; Node only, no Python; at most 800 lines per script;
no home path and no user name in a committed text; lowered priority, leg processes one at a time; no product code changes for a leg; every
source of trust or config made in the leg's folder; a control or a witness never takes its words from `hostKeyWords`; the text is compared
with the product's function AND with pinned words). In addition:

- **Containers only through `wslc`, never Docker.** The image is built only from the committed `Containerfile`, from a tree with no modified
  tracked file, and only after the owner's word on its downloads (§1.2, Q6). The container has `--rm`, the owner-form name and the owner
  label, and the run removes it by its exact name in a `finally` and in the scope's `after` (S3, the lead's answer QA).
- **A failed control or witness is a named FAIL, and the leg goes on to its end.** A value not read is `null` and fails its check. M10's
  control and M11's controls decide their row: a control that does not show what its row says fails the row (the setup).
- **The older client is the unpacked 8.4p1 of S3.P3**, from `CREDS_ITEST_OLD_SSH_DEBS` (`~/.cache/creds-itest-oldssh/deb`), checked against
  its `SHA256SUMS` and unpacked into the run's owned folder at each run. Nothing is downloaded or installed by this story, except the image
  rebuild of §1.2 after the owner's word.
- **M13 starts `ssh.exe` with `-V` and `-G` only.** No login, no network, no file written on Windows.
- **A check name holds no " — "** (`itestRowRig.cjs:676-678`). The new entry's `check` throws on one too.
- **Decision 18.** A leg that cannot run as written, or an instrument that does not show what its row needs, is NOT made weaker: the coder
  STOPS and tells the lead. §7 names the places that rest on facts that are read and not run.

## Facts read on `97752998` that this spec uses

| # | Fact | How |
|---|---|---|
| F1 | **The rows.** M10, M11, M13: `todo/PLAN_person_roads_pin_host_key.md:1736`, `:1737`, `:1739`; their last columns are quoted beside each check (§2 to §4). C20: `:1850-1859`. Decision 18: `:301-303` | read |
| F2 | **The stories document.** `## E3.S9` (`PLAN_person_roads_pin_host_key_E3.md:349-364`): CI does not run these rows, their proving runs are local and, for M13, on the owner's Windows; Q3: "each road" in M11 (c), (d) means the roads that the leg can drive, and the socket check after a refused bridge has no start; the margin of M11 (d) is 5 s (`## E3.S3`) | read |
| F3 | **S3.P2 (worked, `e6cb6532`).** `itestProbeResolver.cjs`: the host part (`hostPart`, `:102-150`: R1 and R2 on the host, `wslc run --pull never --rm --name <owned> --label … -v <wslpath -w>:/work:ro --dns 127.0.0.1 --dns-option trust-ad --dns-option edns0 -e CREDS_ITEST_E3_IMAGE_ID=… <image id> sh /work/src_vs_code/scripts/containers/e3-resolver-init.sh`, `:121-122`; the removal by name, `:59-63`, `:123`, `:141`); the inside part (`:237-309`); `IMAGE_TAG` is the constant `creds-itest-e3-resolver:20261124` (`:26`); `NAME` `k2.e3-probe.test` (`:31`); `CONTROL` `/run/e3-resolver` (`:29`); `questions()` `:155`; `sshfpOf` `:164`; exports only `probeResolver` (`:315`) | read |
| F4 | **The container's start.** `containers/e3-resolver-init.sh:21` runs ONE fixed command: `itestFeasibility.cjs resolver --inside`. The script is mounted from the tree, not built into the image | read |
| F5 | **The image.** `containers/e3-resolver.Containerfile:6-10`: `FROM node:22-bookworm-slim` (a tag, no digest), `openssh-client openssh-server procps`. S3.P2's image: id `sha256:2e760f27…2c77`, OpenSSH 9.2p1 `deb12u10`; it has no `curl`, `wget`, `git` or `ss`. It was built before its `Containerfile` was committed (S3.L4) | read (`module_tests.md`, P2) |
| F6 | **The resolver.** `itestResolverServer.cjs` answers `A` and `SSHFP` for the zone's name from `zone.json`, NODATA for other types of that name, and SETS the AD bit (`FLAG_AD`, `:25`) on every positive answer; it records each question in `queries.jsonl` | read |
| F7 | **S3.P2's control** kept `KnownHostsCommand=none` (`controlWords`, `itestProbeResolver.cjs:182-191`): S3.L2 | read |
| F8 | **S3.P3 (worked, `cd5088d9`).** `itestProbeOlderClient.cjs`: `DEBS_VARIABLE` `:17`, `debsFolderOf` `:32`, `checkedDebs` `:47`, `unpack` `:76`, `librariesOf` `:97`; `<dir>/oldssh/bin` goes first on `process.env.PATH` before `rigOf` and `installShim` (`:138-141`); exports only `probeOlderClient` and `DEBS_VARIABLE` (`:183`). The wrapper printed `OpenSSH_8.4p1 Debian-5+deb11u3, OpenSSL 1.1.1w`; the product's asker answered `older` `OpenSSH_8.4`; a login with the product's five pairs ended with 0 | read |
| F9 | **S3.P7 (worked).** `itestProbeNeverAnswers.cjs`: the program records its start as the shim does, then `exec sleep infinity` (`writeProgram`, `:18-31`); a cold asker answered `unreadable` with `exitCode: null`; the program was gone by pid and start time; `t1 - t0 = 10.01 s`, `t2 - t0 = 10.04 s` | read |
| F10 | **S3.P5 (worked).** `itestProbeWindows.cjs`: `SSH_EXE` `/mnt/c/Windows/System32/OpenSSH/ssh.exe` (`:14`); a made-up user folder joined at run time (`:22-23`); `pinPathIn` with `path.win32.join` (`:29`); `resolve` = `-G -F none <words> -p 22 probe-host` (`:35`); exports only `probeWindowsClient` (`:97`). `ssh.exe -V`: `OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2` | read |
| F11 | **K7 and K8 of the E1.S1 spec.** `-G` joins the files of a list with a space, so one file and two look the same; K7's control is a path with ` ~` after a space (quoted: 0 and the path whole; bare: 255 and `tilde_expand`). K8 (a): one apostrophe bare is `invalid quotes`, 255. K8 (c): `\\` in a path is read as one `\`, bare and quoted, on Windows | read |
| F12 | **The rig.** `runLeg` `itestRowRig.cjs:124` (builds `legRig` `:50`, whose `sec.installShim(rig)` takes the real client from `process.env.PATH`, `:62`); `counterpart` `:143` (calls `startServingSshd(leg, name, hostKey, port, lines)`); `openRoads` `:296` (passes no `host`); `controlClient` `:503` (destination `${me}@127.0.0.1`); `nothingLeft` `:599`; `evidence` `:636`; `ROW_FILES` `:654-658`; `legMain` `:670` | read |
| F13 | **The world.** `w.replaceHost(host)` changes the entry's host from the next read (`personRoadsWorld.ts:389`; E3.S5 uses it); `said` has `at` (`performance.now()` of the leg process); `ended`, `bridges.isOpen(KEY)` (`:163-164`) | read |
| F14 | **The serving config.** `servingConfig` (`lib/sshdRun.cjs:108-126`) writes `LogLevel VERBOSE` at `:119`, then the run's lines, then `extra`. `sshd` keeps the FIRST value of a keyword (S4 N1, F5), so a plain extra `LogLevel DEBUG1` line changes nothing. `startServingSshd(rig, name, hostKey, port, extra)` `itestServing.cjs:65`, `startOnce` `:20-23` | read |
| F15 | **The counts.** `logCounts` (`lib/rowRecord.cjs:74-89`) reads every line of the log: `Connection from`, `AUTH_ATTEMPT`, `Accepted …`, `Starting session`. A `DEBUG1` log has more lines, each starting `debug1: ` | read |
| F16 | **M1's checks that name the newer client.** `recordChecks` (`itestRowM1.cjs:89-118`): M1.8 asks 6 starts with ONE question (`:95`); M1.9 asks that the one question ended before the first connection (`:101`); M1.10 asks `KnownHostsCommand=none` through `sec.lacksNewPairs` (`:104-105`; `NEW_PAIRS` `itestPinnedRoads.cjs:46`). `m1Runs` `:150` is used by M1, M7 (`-m1` legs) and M9 | read |
| F17 | **M2 (b) and M7 count no question.** `mismatch` (`itestRowM2.cjs:80`), `switchLeg` (`:105`), `collisionK1` and `collisionK2` (`itestRowM7.cjs:107`, `:135`) judge connection starts only (`refusedRoads`, `otherKeyRecord.cjs:103`); M7's legs are built from `pr.M7_LEGS` (`itestRowM7.cjs:168-169`) | read |
| F18 | **M7's collision on 10.2p1.** The bare word of (c) (`x'y'z`) is read with the apostrophes taken out (a shell-like tokeniser), so it names the twin (`m7-c-collision-*`, M7.x2 and M7.y3, seen when built) | read |
| F19 | **The pin words for an older client.** `checkedPin` quotes a path with white space, an apostrophe or `=` (`hostKeyPin.ts:226`) for every client; `hostKeyWords` leaves `KnownHostsCommand=none` out when `knowsKnownHostsCommand` is false (`:272`) | read |
| F20 | **The asker.** `pinClientAsker` (`pinClient.ts:84-96`) keeps only `knows` (`:92`); `pinClientOf` reads a token only at the very start of the stderr after exit 0 (`:47-53`); the limit is `CLIENT_CHECK_TIMEOUT_MS`, 10 s (`bridgedSshClient.ts:81`); SIGKILL 2 s after SIGTERM (`KILL_GRACE_MS`, `sshExecRunner.ts:23`) | read |
| F21 | **The order of one pinned call.** `decidePinOfCall` (`pinOfCall.ts:51-62`): absent pin; the path rule; the question (`parts.ask`); `unreadable` is refused with sentence F (`:61`); else the write | read |
| F22 | **Sentence F and its prefixes.** `pinClientSentence(name, exitCode)` (`hostKeyPin.ts:293-296`): "CredsForDevs could not read the version of the ssh program on this computer (<how>) …", `<how>` = `it did not start, or did not end in time` or `exit code <n>`. The install shows `Cannot reach "<name>": ` + it (`agentCommands.ts:278`), the bridge `Cannot bridge to "<name>": ` + it (`:434`) | read |
| F23 | **The record of identities.** `recordIdentities(check, rig, real)` (`itestIdentities.cjs:144-169`) FAILS R8 when no leg wrote a `tool.json` (`:160-163`) and R9 when no `known_hosts_command` exists (`:164-167`): both are true of section 10 only. `identitiesOf` `:126`. Inside the container R1 and R2 need `git`, which the image lacks (`insideAware`, `itestFeasibility.cjs:156`) | read |
| F24 | **The rig's checked pin.** `checkedPinOf(out, file)` (`itestSshd.cjs:218`) asks `ssh` of `process.env.PATH`; `itestCallers.test.ts` requires `await checkedPinOf(` as the value of `knownHostsFile` in every script that calls a builder | read |
| F25 | **`productOf`** (`itestPinnedRoads.cjs:52-75`) loads `personPin` and `hostKeyTrust` under the `vscode` stub; it does not load `pinOfCall` | read |
| F26 | **The guards that read every script.** Test 33 (`itestInstrument.test.ts:32-40`); RR6 and RR7 read every `itestRow*.cjs` (`itestRowRig.test.ts:227-247`); `harnessSites.test.ts`; `itestCallers.test.ts`; the leftovers guard | read |

## Commands

As the E3.S4 spec's *Commands* (in `src_vs_code`, `LP=../.agents/conventions/tools/low-priority.mjs`): compile (read its exit first), one
suite through `scripts/run-tests.mjs`, typecheck, lint, ratchet, `npm test`, `node --check scripts/<file>.cjs`; from the root the leftovers
guard, `plan-lifecycle.mjs` and `public-hygiene.mjs`. The proving commands, in `src_vs_code`:

```text
node --import ./scripts/lower-priority.mjs scripts/itestOffRig.cjs m10
CREDS_ITEST_OLD_SSH_DEBS="$HOME/.cache/creds-itest-oldssh/deb" CREDS_ITEST_SSHD="$HOME/.cache/creds-itest-sshd/sshd-wrap.sh" \
  CREDS_ITEST_SSHD_CONFIG="$HOME/.cache/creds-itest-sshd/extra.conf" node --import ./scripts/lower-priority.mjs scripts/itestOffRig.cjs m11
node --import ./scripts/lower-priority.mjs scripts/itestOffRig.cjs m13
```

## 1. The decisions

### 1.1 The entry: `scripts/itestOffRig.cjs`

`node … itestOffRig.cjs <name> [--inside] [--legs <a,b,…>]`, `<name>` one of `m10`, `m11`, `m13`. An unknown name, a second name, `--inside`
with another name than `m10`, or a `--legs` name that the row does not have: exit 2 at once, naming the legal values. `--legs` is for the hand
checks only (§8); a proving run never passes it, and the run prints `info  --legs given: this run is no proving run` when it is given.

Per run: `harnessScope.run(main)`; one `sectionScope`; one `ownedDir(section, 'off', { parent: shortSocketRoot() })`; a `check(name, ok,
detail)` as `itestRowRig.cjs:676-680` (it throws on " — "); at the end ONE line `off-rig <name>: <n> ok, <m> FAIL`; exit 0 only when no check
failed. The person's `~/.ssh/known_hosts` digest before and after, as `livePinnedRoads` does (`knownHostsDigest`).

**`m10` and `m11` build the rows' top as section 10 does** (`pinnedLegs`, `itestPinnedRoads.cjs:501-512`): `rigOf`, `makeKeys`,
`writeClientConfig`, `installShim`, the pin of K1, `rowsTop`. They do NOT run section 10's check "the real ssh knows KnownHostsCommand"
(`:509`): M11's client does not. Then the row's legs with `rig.runLeg`, then `devNullScan(check, top)` of `itestRowM12.cjs` (S7's note for
E3.S10: no recorded argv names `/dev/null` as a known-hosts file), then the record (§1.6).

### 1.2 M10: where it runs, and the image (S3.L4)

- **The image is rebuilt from the committed `Containerfile` for this story's runs.** Its tag names the file: `creds-itest-e3-resolver:<b>`,
  `<b>` the first 12 hex digits of `git rev-parse HEAD:src_vs_code/scripts/containers/e3-resolver.Containerfile`. `IMAGE_TAG` of
  `itestProbeResolver.cjs:26` becomes `imageTag()` that answers that name (D13). The lead builds it ONCE, after c1, from a tree with no
  modified tracked file, after the owner's word (Q6):
  `wslc build -f scripts/containers/e3-resolver.Containerfile -t creds-itest-e3-resolver:<b> scripts/containers`. c2's body records the
  command, its output, the image id, the `Containerfile`'s SHA-256 and blob, the base image's digest and `dpkg-query -W openssh-client
  openssh-server procps`. A changed `Containerfile` has another blob, so a run cannot find an image of the old file (M10.h2).
- **The host part** is S3.P2's, made a function (D13): `runInContainer(ctx, insideArgs)` starts the container with the same flags and
  `sh /work/src_vs_code/scripts/containers/e3-resolver-init.sh <insideArgs…>`, relays each inside line as `inside | <line>`, and removes the
  container by its exact name on every path. `e3-resolver-init.sh` runs the harness with the arguments that it is given, in place of its
  one fixed command (D14); S3.P2 passes `scripts/itestFeasibility.cjs resolver --inside`, so P2 runs as before. M10 passes
  `scripts/itestOffRig.cjs m10 --inside`.
- **Inside**, the entry builds the top (§1.1) with the image's `sshd` (no `CREDS_ITEST_SSHD`) and the image's `ssh` (9.2p1), runs the leg
  `m10`, and prints R1 and R2 as `info` (the host answers them from the same commit, as `insideAware`).

### 1.3 M11: the older client, and what each leg expects of it

- The entry unpacks the older client as S3.P3 does (`debsFolderOf`, `checkedDebs`, `unpack`, exported by D15) into `<off>/oldssh`, puts
  `<off>/oldssh/bin` FIRST on `process.env.PATH`, and only then builds the top. So every leg's shim takes the wrapper as the real client
  (F12), and `top.real` is the wrapper. Check **M11.0**: `the wrapper -V ended with 0 and printed OpenSSH_8.4p1, and the product's
  pinClientOf reads it as older OpenSSH_8.4` (the version line, also in the evidence of every leg: "The result names the client's version").
- **The expectation** `OLDER` of the lib (§3.1) is handed to the existing row code as `ctx.expect` (D7): M1.8 then asks 3 questions and 5
  connection starts; M1.9 asks one question before the connections of EACH pinned call, which ended before that call's first run
  (`olderQuestions`, the calls by their pin files, `rig.callsOf`); M1.10 asks no `KnownHostsCommand` pair and `StrictHostKeyChecking=yes`,
  one path as both known-hosts files, `VerifyHostKeyDNS=no` and `LogLevel=ERROR`, each once (`olderWords`). With no `ctx.expect`, M1's
  checks are what they were (BR14).
- **L5 (S3.L5) lands here.** Each counterpart of a leg in which the older client connects ((a2) and every (b) leg) logs at `DEBUG1`: the leg
  sets `leg.logLevel = 'DEBUG1'` before its first counterpart, and the rig's `counterpart` hands it to the serving launcher's new `logLevel`
  option (D3, D4), which writes `LogLevel DEBUG1` IN PLACE of `LogLevel VERBOSE`. Not inside `Match all` (S4 N1): see Q3. `logCounts` drops
  every line that starts with `debug1: `, `debug2: ` or `debug3: ` (D5), so the four counts read the same lines as at `VERBOSE`. Check
  **M11.v** in each such leg, after its counts: `<name>'s log names remote software version OpenSSH_8.4p1 for at least one connection after
  the mark` (`versionSeen` of the lib).

### 1.4 M11 (c) and (d): the programs

Each leg writes its program in the section's process, BEFORE `runLeg`, at `<top.dir>/programs/<leg>/ssh` (mode 0700), and `runLeg` takes it
as the leg's real client (D1: `runLeg(…, { real })` hands it to `installShim`). The program (the lib's `answersAtOnce(records, passthrough)`
and `neverAnswers(records, passthrough)`, TX4):

- records its start as the shim does (pid, start time, argc, each word NUL-ended) into `<top.dir>/programs/<leg>/records/`;
- when its argv is `-V` alone: (c) prints `not a version: OpenSSH_10.2p1` to stderr and exits 0 (a version, but not at the start: F20);
  (d) `exec sleep infinity` (S3.P7's branch, byte for byte);
- any other argv: `exec <passthrough> "$@"`, the older wrapper. So a defect that went on to a connection makes a REAL connection, and the
  counterpart's log can show it (BR7).

The counterpart K1 (pinned K1, `VERBOSE`) is there so that "0 connections in the counterpart's log" can fail. Every leg is cold, in a world
of its own, and drives ONE road: `m11-c-install`, `m11-c-bridge`, `m11-d-install`, `m11-d-bridge` (Q3 of the stories document: the socket check
is never reached; the record shows it with no start of any kind). Every question is dismissed (`dismissAll`).

### 1.5 M13: where it runs, and the words

- **Where.** On the owner's machine, from its WSL, through S3.P5's instrument: Node's `execFile` starts `ssh.exe` of the owner's Windows with
  the argv as separate arguments. It is the only way that was probed (decision 18). The lead runs it with the owner's word (§9).
- **The storage folders**, joined at run time from parts, as S3.P5 does (no user name in the source). The lib's `windowsStorage(kind)`
  answers `C:\Users\<you>\AppData\Roaming\Code\User\globalStorage\x.creds` with a made-up user folder in place of `<you>`: the words `pin`
  and `probe` joined by `' '` for (a), by `"'"` for (b) and by `" o'"` for (c). No apostrophe stands after a backslash (that is the kind
  `backslashApostrophe`, M12 (e)).
- **The pin path** is `path.win32.join(<storage>, 'keys', <pid>, 'known_hosts-e1-<uuid>')`. Check **M13.p**: `the Windows pathname has the
  segments that the product's knownHostsPath makes` (the product's posix answer for the same storage string, split at `/`, ends with the same
  three segments `keys`, `<pid>`, `known_hosts-e1-<uuid>`): an independent pin of the shape, not a copy of the function.
- **The words** are the product's: `buildSshExecArgv` and `buildBridgeArgv` (as `itestNoSharing.cjs:133-142` call them), each with
  `knownHostsFile: await checkedPinOf(out, <pin path>, SSH_EXE)` (D11: `checkedPinOf` asks the program it is given, so the client is
  `ssh.exe`'s own answer, `knows`). `ssh.exe` gets `['-G', '-F', 'none', ...argv]`.
- **The UNC folder** `\\server.example\share\creds`: asked of the product only. `pinPathRefusal(<its pathname>)` and `decidePinOfCall` (D12)
  with that storage, a parsed K1 entry, and `ask` = the product's `pinClientAsker` whose `run` counts each start (`program: SSH_EXE`). The
  process's working folder is the run's owned folder during this step, so a defect that writes a pin file writes it there (M13.u3).

### 1.6 The record of identities

`recordIdentities(check, rig, real, { tools: false, commands })` (D9): R8 is asked only where a leg wrote a `tool.json` (none here); R9 only
where `commands` is true (M11, whose (a) legs write a `known_hosts_command`). An item not asked prints `info  R8 not asked: …`. Beside the
record, `identities.json` gains `offRig: { executables: […], configs: […] }`: the unpacked `usr/bin/ssh`, its `libcrypto.so.1.1` and
`libssl.so.1.1`, the two `.deb` files (M11); each program of (c) and (d) (its SHA-256 holds the owned folder's name, so it differs per run);
the image id, the `Containerfile`'s SHA-256 and blob, the resolver's file, `zone.json` and `/etc/resolv.conf` inside (M10); `ssh.exe` by
path, `-V` line and SHA-256, and the `where.exe ssh` answer (M13). A value not read is `null`.

## 2. M10: `scripts/itestRowM10.cjs`, the leg `m10`

M10's words: "where the run owns the resolver: the counterpart has a name, and the resolver answers a SECURE SSHFP record of K2 for it and
records each question. The entry is pinned to K1, the counterpart is K2, the handed config says `VerifyHostKeyDNS yes`; no `KnownHostsCommand`
is named" | "The control first: the control client with E1's words is accepted by K2, and the resolver's record holds the SSHFP question.
Then the roads: each of the four runs that start ends with 255 and the verification line; each recorded argv holds `VerifyHostKeyDNS=no`; the
resolver's record holds 0 SSHFP questions for the roads' runs; K2 logs 0 accepted logins and 0 authentication attempts. If the control is not
accepted, the row is NOT passed: it showed no bypass".

The order: `shared.standing` (the stand-in, so a defect's install run cannot reach a real installer); K2 = `rig.counterpart(…, leg.k2, {
extra: stand.extra })`; K2's SSHFP records (`sshfpOf`, by `rig.tool('ssh-keygen', ['-r', NAME, …])`) into `<CONTROL>/zone.json` with
`secure: true`; the handed config `rig.handConfig(leg, { lines: ['VerifyHostKeyDNS yes'] })`; the control; then `openRoads`,
`roads.w.replaceHost(NAME)` before the first click, the mark (with the resolver's question count), `shared.driveRefusedRoads`, the counts.

| # | Check | The row's words it holds |
|---|---|---|
| M10.0 | `the leg's config resolves verifyhostkeydns yes for <NAME> and names no knownhostscommand but none; getent hosts <NAME> answers 127.0.0.1 and the resolver recorded that A question` (`viaReal` `-G`) | "the handed config says `VerifyHostKeyDNS yes`; no `KnownHostsCommand` is named"; "the counterpart has a name" |
| M10.c | **the control, first (before the mark)**: `the control client with E1's words, exactly the three pairs of a file of K1's line for [<NAME>]:<port>, to <user>@<NAME>, was accepted by K2: exit 0, one more accepted login with a command session; the resolver recorded the SSHFP question for <NAME> during it` (`ok.e1WordsFor` with the file of `ok.knownHostsLineOf(port, k1Pub, NAME)`; `shared.login(…, { host: NAME })`; `wordsOf(argv)` equals those six words) | "The control first: the control client with E1's words is accepted by K2, and the resolver's record holds the SSHFP question"; S3.L2 |
| M10.0c | `cold: 0 runs of ssh -V and 0 starts of the client before the first click` | (the setup) |
| M10.1 | `each of the four runs that start ended with 255 and the verification line: probe, bridge (its own stderr file), sweep, mode check; no install run` (`shared.refusedChecks`) | "each of the four runs that start ends with 255 and the verification line" |
| M10.2 | `each connection start names <NAME> as its destination and holds VerifyHostKeyDNS=no, once` (`product.argv.valuesOf`) | "each recorded argv holds `VerifyHostKeyDNS=no`" |
| M10.3 | `the resolver's record holds 0 SSHFP questions after the mark` | "the resolver's record holds 0 SSHFP questions for the roads' runs" |
| M10.3a | `the resolver's record holds at least one A question for <NAME> after the mark: the roads asked this resolver` | (M10.3 could not have failed without it: BR1) |
| M10.4 | `K2 logged a connection for each connection start, 0 accepted logins and 0 authentication attempts after the mark` | "K2 logs 0 accepted logins and 0 authentication attempts" |
| M10.5 | the stand-in guard (`shared.standInGuard`) | (the setup) |

**S3.L3 lands here, as a record (optional in S3, decides nothing):** after the counts, `zone.json` gets `secure: false` (D16: the resolver
then clears the AD bit) and the same control runs once more; `info  M10.ad: the control with the AD bit off ended with <code>; stderr
<the DNS lines>`. Expected 255: it shows that the control's acceptance came from the SECURE record.

The leaving checks: `shared.stderrFilesCheck`, the bridge closed, `rig.nothingLeft`, `rig.endCounterpart`, the evidence with `resolver: {
before, afterMark: [{ type, name, answer }], control: […], ad: … }`, `control`, `zoneSha256`. **If M10.c fails, M10 is not passed** (the
row's own words); the leg goes on, and the record says so.

## 3. M11: `scripts/itestRowM11.cjs` and `scripts/itestRowM11Never.cjs`

The legs (`M11_LEGS` of the lib, TX1), in this order: `m11-a-unknown`, `m11-a-ignored`; `m11-m1`, `m11-m2-mismatch-global`, then
`m11-` + each name of `pr.M7_LEGS` in its order (17); `m11-c-install`, `m11-c-bridge`, `m11-d-install`, `m11-d-bridge`. 25 legs.

### 3.1 (a): the client alone

M11's words: "(a) The client alone: a config line `KnownHostsCommand …` and no `IgnoreUnknown`; then the same with the config's own
`IgnoreUnknown` for it, pinned to K1 against the counterpart K2 with the command printing K2's line" | "(a): without `IgnoreUnknown` the
client ends with `Bad configuration option` and 255 before it connects; with it the login is refused with the verification line and K2 logs
0 accepted logins".

Each leg: K2 (`DEBUG1` in `m11-a-ignored` only); the recording command of M8 (`writeCommand`, `itestRowM8.cjs:17`, which prints K2's line);
the handed config with `lines: ['KnownHostsCommand <command>']` (unknown) or `['IgnoreUnknown KnownHostsCommand', 'KnownHostsCommand
<command>']` (ignored); a pin file of K1's line for K2's port; the words of the product for this client, `hostKeyWords(await
checkedPinOf(out, <pin>))` (the asker asks the wrapper: `older`; see Q5); the real client by its path, `rig.viaReal`, `-i`, `BatchMode=yes`,
`-p <K2's port>`, `<user>@127.0.0.1 true`.

| # | Check | The row's words it holds |
|---|---|---|
| M11.a0 | `the product's words for this client hold no KnownHostsCommand pair` (literal names, not `NEW_PAIRS`) | "(that line is (a)'s alone)" |
| M11.a1 | unknown: `ended with 255 and a stderr line that holds "Bad configuration option" and "knownhostscommand"; K2 logged 0 connections after the mark` | "without `IgnoreUnknown` the client ends with `Bad configuration option` and 255 before it connects" |
| M11.a1w | unknown, after: `the witness, the same client with E1's literal words of a file of K2's line and the leg's config without the KnownHostsCommand line, ended with 0 and K2 logged one more accepted login` | (K2 was up: "before it connects" could fail) |
| M11.a2 | ignored: `ended with 255 and the verification line as a whole line; K2 logged 0 accepted logins and 0 authentication attempts after the mark` | "with it the login is refused with the verification line and K2 logs 0 accepted logins" |
| M11.aw | ignored, after: `the witness (E1's literal words of a file of K2's line, the same config) ended with 0 and K2 logged one more accepted login` | (the refusal is the pin's, not a dead K2) |
| M11.v | ignored: as §1.3 | "The result names the client's version" |

`info  M11.ak: the recording command was started <n> times` in each leg (expected 0: 8.4 does not know the option).

### 3.2 (b): the roads under a config of their own

M11's words: "(b) The roads, under a config of their own that names no `KnownHostsCommand` …: the runs of M1, of M2 (b) the mismatch, and of
M7 (a)-(e), M7's control showing acceptance through the colliding file with E1's words" | "(b): as M1 and M7 with their `KnownHostsCommand`
assertion replaced by its opposite: NO `KnownHostsCommand` pair in the 5 argvs and with `VerifyHostKeyDNS=no` and `LogLevel=ERROR` in each;
as M2 (b), the mismatch; as M7 (a)-(e) with its collision; and, since epoch 3, M1's one question replaced by its count for an older client:
one question `ssh -V` before the connections of EACH pinned call (three: the install, the bridge, its socket check), because an older answer
is not kept".

- The config of their own is the rows' handed config (`handedClientConfig`): it names no `KnownHostsCommand`. M2 (b)'s legs add their
  global file to it as before. `m8`'s config is not used (S6's note for E3.S9).
- Each (b) leg is a wrapper (`withOlder(fn)`): it sets `ctx.expect = OLDER` and `leg.logLevel = 'DEBUG1'`, calls the existing leg function
  (`m1.legs.m1`, `m2.legs['m2-mismatch-global']`, `m7.legs[<name>]`) with every one of its checks, then runs the older checks that the row
  function does not hold:
  - **M11.q** (in every (b) leg that does not run `m1Runs`): `one question ssh -V before the connections of each pinned call: <n> calls,
    <n> questions, each ended before its call's first run` (`olderQuestions`; the expected `n`: 3 in the mismatch and collision legs, 1 in
    the switch legs);
  - **M11.w** (the same legs): `each connection start holds no KnownHostsCommand pair, and StrictHostKeyChecking=yes, one path as both
    known-hosts files, VerifyHostKeyDNS=no and LogLevel=ERROR, each once` (`olderWords`);
  - **M11.v** (every (b) leg): §1.3.
- In the six legs that run `m1Runs` (`m11-m1`, `m11-m7-{a..e}-m1`), M1.8, M1.9 and M1.10 take `OLDER` (§1.3), so they ARE M11's replaced
  assertions there.
- The labels are `M11 <leg>`; the check ids of the row code stay (`M1.8`, `M2.1`, `M7.y3` …), so a reader can put each beside its row.

**The collision on 8.4 (Q1).** M7's collision legs ask that the bare word names the twin (M7.x2, M7.y3). OpenSSH 8.4 reads a config value
with a tokeniser that knows double quotes only; single quotes came with the shell-like tokeniser of 8.7 (read in the release notes and in
`misc.c` of `V_8_4_P1`, not run). So I predict that on 8.4 the bare word `x'y'z` names the pin file itself: M7.x2 (`-k1`, the witness)
ends with 0 and M7.y3 (`-k2`, the control) ends with 255. The legs are built as written. If the proving run shows it, the two checks FAIL by
name, the legs go on, and the coder STOPS and tells the lead: the control does not show what the row says, so the row cannot pass as
written (decision 18).

### 3.3 (c) and (d): a program that answers at once, or never

M11's words: "(c) A program that answers `-V` AT ONCE, with no version at the start of its stderr. (d) … cold, a program that records its
start with `-V`, answers nothing and does not end by itself" | "(c): on each road 0 connection starts (the record holds the `-V` starts
alone, one per refused call), 0 connections and 0 authentication attempts in the counterpart's log, 0 pin files written, sentence F with the
exit code, no *bridged* row. (d): on each road the record holds exactly ONE start, the `-V`; 0 connection starts; 0 connections and 0
authentication attempts in the counterpart's log; 0 pin files written, during the wait and after it; sentence F in its form without an exit
code …; no *bridged* row; the program that never answers is gone, by its recorded pid and start time and never by name, no later than the
margin after sentence F; two times are recorded per road, from the start of the command to sentence F and to the end of that program, and
each lies between the runner's limit (10 s …) and that limit plus a margin …; recorded for C20: both times, and what the person was shown
while waiting".

The drive of a leg: K1 (`VERBOSE`); `openRoads(…, { answer: dismissAll })`; the mark; `t0` = `pressNow(…)`'s `startedAt` (the start of the
command); the leg waits up to 30 s for sentence F in `said` (`tF` = its `at`); the program's pid and start time from its own record; `tGone`
= the first 50 ms poll at which `alive({ pid, start })` is false (at most 30 s); then 2 s, the counts. A program still alive at the leg's
leave is ended by its recorded pid and start time (SIGTERM, then SIGKILL), and the check that asked it gone has already failed.

| # | Check ((c) and (d), on the leg's road) | The row's words it holds |
|---|---|---|
| M11.x0 | `cold: 0 runs of ssh -V and 0 starts before the click` | "cold" |
| M11.x1 | `the record holds exactly ONE start, argv -V alone, and 0 connection starts; the program recorded the same pid` | (c) "the `-V` starts alone, one per refused call"; (d) "exactly ONE start, the `-V`; 0 connection starts" |
| M11.x2 | `K1 logged 0 connections and 0 authentication attempts after the mark` | "0 connections and 0 authentication attempts in the counterpart's log" |
| M11.x3 | `no sample of keys/<pid>/ from the click to the end held a known_hosts-e1-<uuid> file, and the folder holds none after` (the sampler, every 50 ms) | "0 pin files written, during the wait and after it" |
| M11.x4 | `exactly one error message is the road's prefix and the product's sentence F for <code>; it holds F's pinned words and <how>` (`Cannot reach "box": ` or `Cannot bridge to "box": `; `pinClientSentence('box', 0)` in (c), `('box', null)` in (d); `F_WORDS`, and `exit code 0` or `it did not start, or did not end in time`, literals of the lib) | "sentence F with the exit code"; "sentence F in its form without an exit code" |
| M11.x5 | install leg: `no question was asked and no run started`; bridge leg: `no bridge was spawned, the manager holds no open bridge of the entry, and the socket check has no start of any kind` | "no *bridged* row"; Q3 |
| M11.c6 | (c): `the program is gone by its recorded pid and start time within 5 s of the click` | (the leg leaves nothing) |
| M11.d6 | (d): `from the start of the command to sentence F: <s> s, and to the end of the program: <s> s; each between 10 s and 15 s` (`timesOk`, the lib's `LIMIT_MS` 10 000 and `MARGIN_MS` 5 000) | "each lies between the runner's limit … and that limit plus a margin" |
| M11.d7 | (d): `the program is gone by its recorded pid and start time, never by name, no later than 5 s after sentence F` | "gone … no later than the margin after sentence F" |

`info  M11 <leg>: shown while waiting: <every said item with t0 < at < tF, kind and text>` and the two times go into the evidence (`c20: {
toSentenceMs, toGoneMs, shownWhileWaiting }`): "recorded for C20". The leaving checks of every leg: A2, `rig.nothingLeft`, the counterpart
ended, the evidence.

## 4. M13: `scripts/itestRowM13.cjs` (the client alone)

M13's words: "`ssh.exe -G` of the Windows that the owner's machine has, started with the argv as separate arguments, with the words that the
final code writes for a pin file under a storage folder (a) with a space, (b) with an apostrophe, (c) with both; and the rule asked for a UNC
folder (`\\server\share\…`)" | "(a)-(c): the client resolves strict checking, `verifyhostkeydns false`, no `knownhostscommand`, `loglevel
ERROR`, and both known-hosts lists as the one intended path; one file is told from two by the control of K7. The UNC folder: the rule refuses
it, and no `ssh.exe` is started for it; the control: `ssh.exe -G` with the bare and the quoted UNC word resolves another path (K8 c). The result
names the client's version. NOT in this row: a login on Windows (C6)".

Every `ssh.exe` start goes through ONE function of the file that records its argv and answer (`execFile`, 10 s). No leg process: M13 starts
no counterpart and no world.

| # | Check | The row's words it holds |
|---|---|---|
| M13.0 | `ssh.exe is there as WSL sees it; -V printed OpenSSH_for_Windows_<v>; the product's asker answered knows` (`info` the `where.exe ssh` answer) | "The result names the client's version" |
| M13.p | §1.5 | (the words are for the product's pathname) |
| M13.x1 | `the product's rule answers no refusal for the pathname of (x)` | (the case reaches the words) |
| M13.x2 | `ssh.exe -G with the exec argv ended with 0: stricthostkeychecking true, verifyhostkeydns false, no knownhostscommand line, loglevel ERROR, userknownhostsfile and globalknownhostsfile each the intended path, whole` (`resolvedOf`, CR removed) | "(a)-(c): the client resolves strict checking, …, and both known-hosts lists as the one intended path" |
| M13.x3 | the same with the bridge argv | as above |
| M13.x4 | (a), (c): `K7's control: under the twin folder (" ~" after the space) the product's word ended with 0 and the path whole, the bare word (literal) ended with 255 and a tilde_expand line`; (b): `the bare word (literal) ended with 255 and invalid quotes` (K8 a) | "one file is told from two by the control of K7" |
| M13.u1 | `the product's rule refuses the pathname under \\server.example\share\creds with doubleBackslash` | "the rule refuses it" |
| M13.u2 | `decidePinOfCall answered refused with the product's sentence E for doubleBackslash, and its asker started ssh.exe 0 times` | "no `ssh.exe` is started for it" |
| M13.u3 | `no file was written for it: the owned folder holds no keys folder after the step` | (the refusal stands before the write) |
| M13.uc | `the control: ssh.exe -G with the bare and with the quoted UNC word (literal) each ended with 0 and resolved \server.example\share\…, not the intended path` | "the control: … resolves another path (K8 c)" |
| M13.z | `no argv of the run names /dev/null as a known-hosts file` (`pr.devNullIn`) | (S7's note for E3.S10) |

The record: §1.6 (R1, R2 and `offRig`; no listener, so R3 to R9 are not asked, as S3.P5).

## 5. Dependencies on the built rig (and what E3.S9 adds itself)

| # | What E3.S9 needs | Built? (file:line on `97752998`) | What E3.S9 does (budget) |
|---|---|---|---|
| D1 | a leg whose real client is a program of the leg | no: `runLeg` `itestRowRig.cjs:124`, `legRig` `:50`, `installShim` `:62` | `runLeg(…, label, { real })` → `legRig` → `installShim(rig, real)`; the default is as before |
| D2 | the rows' legs load in a leg process | `ROW_FILES` `:654-658` | add `M10` and `M11` |
| D3 | a counterpart that logs at `DEBUG1` | no | `counterpart` hands `leg.logLevel` to the launcher (`itestRowRig.cjs` 713 after E3.S8 → ≤ 722, with D1, D2, D6) |
| D4 | the launcher's log level | no: `LogLevel VERBOSE` `lib/sshdRun.cjs:119` | `servingConfig(…, { logLevel = 'VERBOSE' })`, one of `VERBOSE`, `DEBUG1` (else throws); `startServingSshd(…, extra, { logLevel })` (`sshdRun.cjs` 128 → ≤ 132; `itestServing.cjs` 188 → ≤ 192). With no option the text is byte for byte as before (TX9) |
| D5 | counts that a `DEBUG1` log does not change | no: `logCounts` `rowRecord.cjs:74` | drop lines that start `debug1: `, `debug2: `, `debug3: ` before counting (168 → ≤ 172) |
| D6 | a control to a name | no: `controlClient` `:503`; `login` `itestRowOtherKey.cjs:155`; `knownHostsLineOf` `otherKeyRecord.cjs:34` | `controlClient(…, { host = '127.0.0.1' })`, `login(ctx, server, words, command, { host })`, `knownHostsLineOf(port, pub, host = '127.0.0.1')` (190 → ≤ 194; 156 → ≤ 158) |
| D7 | M1's checks for an older client | no: F16 | `recordChecks` reads `ctx.expect` (default the newer client's: as now); M1.8, M1.9, M1.10 use `expect.questions` and `expect.words` (178 → ≤ 200) |
| D8 | M2 (b), M7 legs on the older client | built: F17 | — (the wrappers of §3.2) |
| D9 | a record without section 10's R8, R9 | no: F23 | `recordIdentities(check, rig, real, { tools = true, commands = true } = {})` (171 → ≤ 180); section 10's call unchanged |
| D10 | the record inside the container | built: `insideAware` `itestFeasibility.cjs:156` | the entry does the same (R1, R2 as `info` inside) |
| D11 | a checked pin asked of `ssh.exe` | no: F24 | `checkedPinOf(out, file, program = 'ssh')` (232 → ≤ 234) |
| D12 | `decidePinOfCall` in the harness | no: F25 | `productOf` loads `../pinOfCall` with the other two under the stub, and answers `decidePinOfCall` (571 after E3.S8 → ≤ 574) |
| D13 | the host part as a function; the tag of the file | no: F3 | `runInContainer(ctx, insideArgs)`, `imageTag()`, and exports `NAME`, `CONTROL`, `questions`, `sshfpOf` (315 → ≤ 345). P2 calls `runInContainer` with its own arguments |
| D14 | the container runs the harness it is given | no: F4 | `e3-resolver-init.sh` runs `node --import ./scripts/lower-priority.mjs "$@"` as the user; no argument: exit 93 (25 → ≤ 30). The image needs no rebuild for it (it is mounted) |
| D15 | the older client unpacked by the entry | no: F8 | export `debsFolderOf`, `checkedDebs`, `unpack`, `librariesOf`; `unpack` takes `{ run, check }` (183 → ≤ 190) |
| D16 | an answer without the AD bit (S3.L3) | no: F6 | `zone.secure === false` → no `FLAG_AD` (127 → ≤ 130) |
| D17 | the Windows client's parts | no: F10 | export `SSH_EXE`, `storageOf`, `pinPathIn` (97 → ≤ 99) |

If the built rig differs from this table in a part that a leg relies on, the coder STOPS and tells the lead (no silent change of the rig).

## 6. The test: `src/test/itestRowsOff.test.ts` (RED first)

Loads `scripts/lib/offRigRecord.cjs`, `lib/rowRecord.cjs`, `lib/sshdRun.cjs` and `lib/otherKeyRecord.cjs` with `createRequire` at run time
(as `itestRowsTold.test.ts`), so it compiles before the lib exists; owned folders through `ownedDir`.

| # | Asserts |
|---|---|
| TX1 | `M10_LEGS` is `['m10']`; `M11_LEGS` holds the 25 names of §3, each once, in that order, and its (b) part is `m11-` + `m11-m1`'s twin `m1`, `m2-mismatch-global` and every name of `pr.M7_LEGS` in its order; `M13_CASES` is a, b, c with the three separators of §1.5 |
| TX2 | `olderQuestions(calls, questions)`: ok for three calls each after one question that ended before its first run; not ok for one question and three calls, for two questions before one call, for a question that ended after its call's first run, and for an empty list |
| TX3 | `olderWords(argv)`: ok for the five pairs (made literals); not ok with `KnownHostsCommand=none`, without `LogLevel=ERROR`, with `VerifyHostKeyDNS=no` twice, with two different known-hosts paths |
| TX4 | `answersAtOnce` and `neverAnswers`: the record lines equal the shim's (`installShim`'s two record lines); the `-V` branch prints the literal of §1.4 and exits 0, or is `exec sleep infinity`; the other branch is `exec <passthrough> "$@"`; a passthrough with a quote is shell-quoted. **The product agrees** (the test may read the product): `pinClientOf(0, <the (c) stderr>)` is `{ kind: 'unreadable', exitCode: 0 }` |
| TX5 | `F_WORDS` and the two `how` literals: `pinClientSentence('box', null)` holds `F_WORDS` and `it did not start, or did not end in time`; with 0, `exit code 0`; `toldF(said, from, prefix, sentence)` counts an error message equal to prefix + sentence, not a log line, not a warning, not another prefix |
| TX6 | `timesOk({ t0, tF, tGone })`: 10.0 s and 10.04 s ok; 9.99 s not; 15.01 s not; gone 5.01 s after F not; gone before F ok; a `null` not |
| TX7 | `resolvedOf(stdout)` reads CR LF; `oneIntended(resolved, path)` ok only when both lists equal the path; `k7Twin(folder)` puts `~` after the first space and throws on a folder with no space; `UNC_WORDS(path)` are literal (bare and in double quotes); `versionSeen(log, 'OpenSSH_8.4p1')` finds `remote software version OpenSSH_8.4p1` in a `debug1:` line |
| TX8 | `logCounts` of a made `DEBUG1` log equals `logCounts` of the same log without its `debug` lines (connections, attempts, accepted, sessions), and a `debug1:` line with `Failed` or `authenticating user` is not counted |
| TX9 | `servingConfig(RUN, parts)` with no `logLevel` is byte for byte the text of `97752998` (a literal of the test for a made `parts`); with `DEBUG1` one `LogLevel` line, at the same place; `TRACE` throws |
| TX10 | `knownHostsLineOf(port, pub)` is as before; with a host, `[<host>]:<port> <type> <base64>` |

**RED.** Before the lib and the changes: compile (exit 0), run the file: TX1 to TX7 fail on `…/scripts/lib/offRigRecord.cjs does not exist`,
TX8 fails on the counted `debug1:` line, TX9 on `TRACE` not throwing, TX10 on the host not in the line. Save the output; any other text
is a stop.

## 7. The proving runs

The stories document: a proving run passes no row and goes into §10 never; its numbers are "seen when it was built". CI runs none of them.

1. **Local, three times each,** on the last code commit, from that tree (`git status --porcelain --untracked-files=no` empty): `m10` (after
   the image of §1.2), `m11`, and `m13` (with the owner's word, §9). Each output is saved outside the tree. Read in each: exit 0; the last
   line with 0 FAIL; every leg process ended with 0; each `evidence` line; the record's R1 and R2 (inside M10: as `info`, and the host's).
   Projected (not measured): `m10` about 2 minutes with the container's start; `m11` about 12 minutes (25 legs; (d) at least 10 s each);
   `m13` under 1 minute.
2. **After each run:** no `/tmp` name of the run, no process of the run, `wslc list -a --no-trunc` holds no container of the run.

**If a proving run fails.** These places rest on facts that are read and not run, and are named before the first run:

- M10.c is red: the client did not take K2's record inside the leg as S3.P2 did by hand. A harness fault if the zone, the name or the
  config is at fault; otherwise STOP, the lead (decision 18: M10 cannot run as written).
- M10.3a is red: the roads did not ask this resolver. STOP, the lead.
- M11.v is red in every leg: `DEBUG1` from the launcher does not log the line on 10.2p1. A harness fault first (the option, the line's
  form); otherwise STOP, the lead (Q3).
- M7.x2 or M7.y3 is red in `m11-m7-c-collision-*`: §3.2, Q1. STOP, the lead.
- Any other (b) check is red where its row passed on 10.2p1 (for example M7.c3's `Offending` line on 8.4): STOP, the lead, with the stderr.
- M11.d6 is red by time alone (F and the end were there): the instrument worked and the row does not pass as written; STOP, the lead. Do
  not change the margin or the limit.
- M13.x4's bare half is not 255 on `ssh.exe`: K7's control does not show what it did in E1.S1. STOP, the lead.

## 8. Mutations and hand checks

**Mutations** (each alone, restored byte for byte, `git diff` empty after; none committed):

| # | Mutation | Red |
|---|---|---|
| MX1 | `M11_LEGS` without `m11-m7-c-collision-k2` | TX1 |
| MX2 | `olderQuestions` counts questions over the whole leg, not per call | TX2 |
| MX3 | `olderWords` accepts `KnownHostsCommand=none` | TX3 |
| MX4 | `answersAtOnce`'s `-V` branch prints `OpenSSH_10.2p1` at the start | TX4 (the product reads `knows`) |
| MX5 | `toldF` counts a log line | TX5 |
| MX6 | `timesOk` reads the margin as 15 s after F | TX6 |
| MX7 | `resolvedOf` keeps the CR | TX7 |
| MX8 | `logCounts` without the `debug` filter | TX8 |
| MX9 | `servingConfig` writes `LogLevel DEBUG1` after `LogLevel VERBOSE` | TX9 |
| MX10 | `knownHostsLineOf` ignores the host | TX10 |

**Hand checks** (the product made to do the wrong thing that a leg is about), each in a scratch worktree OUTSIDE the story's tree (`git
worktree add --detach <owned folder> <c1>`, `npm ci` and compile there; M10's container then mounts that worktree), as S4.§12 says (R1
fails there, as it must; recorded as hand checks in c2, never as results). The prediction is EXACT for the legs that the hand check runs (with
`--legs` where named): the checks named red turn red, and every other check of those legs stays green. A wrong prediction is said plainly.

| # | The product made to | Runs | Red | Green |
|---|---|---|---|---|
| HC1 | drop `VerifyHostKeyDNS=no` (`hostKeyPin.ts:275`) | `m10` | M10.1, M10.2, M10.3, M10.4, M10.5 (K2 is taken from DNS: the probe passes, the install runs through the stand-in on K2) | M10.0, M10.c, M10.0c, M10.3a, the leaving checks |
| HC2 | keep an `older` answer (`pinClient.ts:92`: `read.kind !== 'unreadable'`) | `m11 --legs` every (b) leg | M1.8 and M1.9 in the six `m1Runs` legs; M11.q in `m11-m2-mismatch-global`, the five `m11-m7-*-m2-mismatch` and both collision legs | the five switch legs whole (one call); M1.10, M11.w, M11.v everywhere; every other check |
| HC3 | treat `unreadable` as `older` (`pinOfCall.ts:61`: `written(parts, { kind: 'older', token: 'OpenSSH_8.4' })`) | `m11 --legs` the four (c), (d) legs | install legs: M11.x1, x2, x3, x4 (and M11.d6, d7 in `m11-d-install`); bridge legs: M11.x1, x2, x3, x4, x5 (and M11.d6, d7 in `m11-d-bridge`) | M11.x0, M11.c6, the leaving checks |
| HC4 | the asker's limit is 120 s (`pinClient.ts:85`) | `m11 --legs` the two (d) legs | M11.x4, M11.d6, M11.d7 | M11.x0, x1, x2, x3, x5; the leaving checks (the leg ends the program by pid and start time) |
| HC5 | a space is not quoted (`hostKeyPin.ts:226`: `/['=]/`) | `m13` | M13.a4's product-word half only (the `-G` line of (a) looks the same for one file and two: F11) | every other M13 check, (c) included (its apostrophe still quotes it) |
| HC6 | the rule does not refuse two backslashes (`hostKeyPin.ts`, `REFUSED_PIN_PATHS`, `doubleBackslash` → `() => false`) | `m13` | M13.u1, M13.u2, M13.u3 | M13.uc and every check of (a)-(c) |
| HC7 | write `KnownHostsCommand=none` for every client (`hostKeyPin.ts:272`: `true`) | `m11 --legs m11-a-unknown,m11-a-ignored` | M11.a0, M11.a2, M11.v (`m11-a-ignored`: the client stops at the option and does not connect) | M11.a1, M11.a1w, M11.aw (their words are literal) |

## 9. What needs the owner, and how M13's result comes back

- **The image rebuild (M10).** It downloads the base image by its tag and the Debian packages again; they can differ from S3.P2's
  (`deb12u10`). The lead asks the owner before the build, as for D3 and D4 of S3 (Q6).
- **M13.** It runs from WSL on the owner's machine (the only probed way, §1.5). The owner: (1) gives the word that the run may start
  `ssh.exe -V`, `ssh.exe -G` and `where.exe ssh` of their Windows (no login, no network, nothing written there); (2) is logged on to that
  Windows while it runs (WSL's interop needs the session). What the script needs: `/mnt/c/Windows/System32/OpenSSH/ssh.exe`,
  `/mnt/c/Windows/System32/where.exe`, the compiled `out/` of the commit. What it records: every argv and answer of `ssh.exe`, the `-V`
  line, the `where.exe` answer, the SHA-256 of `ssh.exe`, R1 and R2. How it comes back: the lead saves the whole output outside the tree,
  and c2 puts the checks, the version and the identities into its body and into `research/module_tests.md`, with the user folder written as
  `C:\Users\<you>` and the home as `~`.
- **Nothing else.** M10 and M11 need no owner beyond the image: the older client's packages are already in `~/.cache` (S3, D1, D2).

## 10. Break it: ways to pass while the defect stays, and what stops each

| # | The way | What stops it |
|---|---|---|
| BR1 | M10's roads ask no SSHFP because they never asked this resolver | M10.3a; M10.0's `getent` |
| BR2 | M10's control is accepted by K1's line, not by DNS | its pin holds K1's line and K2 answers; S3.P2.4 and M10.ad (AD off: 255) |
| BR3 | M10's control carries a word that hides the hole | M10.c holds `wordsOf(argv)` to E1's six literal words (S3.L2) |
| BR4 | the image is not the committed file's | the tag names the file's blob (§1.2); c2 records the build |
| BR5 | M11 (b) runs on the newer client by mistake | M11.0, M11.v in every leg (the counterpart sees 8.4), M1.8 and M11.q expect 3 questions |
| BR6 | three questions counted, but two in one call | `olderQuestions` per call (TX2, MX2); HC2 |
| BR7 | (c), (d): "0 connections" because the program cannot connect | the passthrough to the real client (§1.4); HC3 |
| BR8 | (d): the times read from the asker, not the command | `t0` is the click's `startedAt` |
| BR9 | (d): the program "gone" by name | pid and start time from its own record (M11.d7) |
| BR10 | sentence F equal to a wrong product text | F's pinned words and `how` literals (TX5) |
| BR11 | M13: two files read as one | K7's twin (M13.x4); HC5 |
| BR12 | M13: "no `ssh.exe`" judged by the script's own flow | `decidePinOfCall` with a counting asker (M13.u2); HC6 |
| BR13 | M13's words are not the product's | both builders with `await checkedPinOf(…, SSH_EXE)` |
| BR14 | `DEBUG1` or `ctx.expect` changes the rig's rows | TX8, TX9; section 10 passes as before with no `expect` and no `logLevel` (§11, step 3) |
| BR15 | (a1) "before it connects" because K2 was down | M11.a1w after it |

## 11. Order of work, and the commits

1. `git status --short`. **The test** (§6) alone. Compile: exit 0. Run it: the REDs of §6. Save the output.
2. **The lib** (§3 and §1), D4, D5, D6's lib part. TX1 to TX10 green; MX1 to MX10.
3. **D1 to D17, the row files, the entry.** `node --check` of every script; typecheck, lint, ratchet, `npm test`, `itestCallers`,
   `harnessSites`, `itestInstrument`, `itestRowRig` (RR6, RR7 read the new row files); the leftovers guard. **Section 10 runs as before**:
   `npm run itest:ssh-agent` with the two variables, the same count of `ok` lines as E3.S8's last run and 0 FAIL. `wc -l`. Commit **c1**:
   `test(ssh): G1 E3.S9: M10, M11 and M13 off the rig (TX1-TX10)`. Body: the RED texts, MX1 to MX10, the line counts, that no product
   file, no workflow, no `package.json` and no `Containerfile` changed, and section 10's count.
4. **The image** (§1.2), after the owner's word. **The proving runs** (§7) on c1; M13 with the owner's word. **The hand checks** (§8). A
   harness fault is repaired in a new commit (c1b, …), and the runs are made again on the last one.
5. **The documents** (§12). `plan-lifecycle.mjs` and `public-hygiene.mjs` from the root: clean. Commit **c2**: `docs(tests): G1 E3.S9: M10,
   M11 and M13 as seen when they were built`.

Stage by path; read `git diff --staged --stat` before each commit; do not push (the lead pushes).

## 12. The documents

`research/module_tests.md`, the G1 section (after E3.S8's paragraphs): (1) the table's row for `itestRowsOff.test.ts` (TX1 to TX10);
(2) **The rows off the rig (E3.S9)**: the entry, where each row runs, the image and its tag, the older client's expectation, `DEBUG1` and
the filter, the programs, M13's way; (3) **M10, M11 and M13, seen when they were built (<date>, commit <sha>)**: NOT §10; per leg the four
counts, the controls and witnesses with their exit codes, M10's questions, M11's version lines, (d)'s two times and what was shown while
waiting, M13's `-G` lines and version, the identities, the hand checks as hand checks; home as `~`, the Windows user as `C:\Users\<you>`;
(4) the table of *Test leftovers*: the `off` folder (its legs, `oldssh`, `programs`), the container, the image under its new tag.

## 13. Done when (each item can be counted)

- [ ] TX1 to TX10 were watched red with the texts of §6 and pass; MX1 to MX10 turned red what §8 names.
- [ ] Every leg of §2 and §3 and every check of §4 is built and runs through the committed instrument, from a tree with no modified tracked file.
- [ ] Three local proving runs of each of `m10`, `m11`, `m13` on c1 (or its last repair): exit 0, no `FAIL`, every control and witness as
      its check says, every leg process ended with 0; the after-run checks print nothing. Or a STOP of §7, sent to the lead.
- [ ] Section 10 passes as before on c1 (no `expect`, no `logLevel`).
- [ ] HC1 to HC7 each turned red exactly what §8 names (hand checks, in c2's body); a wrong prediction is said plainly.
- [ ] typecheck, lint, ratchet, `npm test`, the guards and the leftovers guard green; every script at most 800 lines, each inside its budget.
- [ ] `research/module_tests.md` holds §12's items; no home path, no user name, no private address in a committed text.

## 14. Opus review checklist

1. M10: the control first, with E1's three literal pairs only; accepted by K2 with the SSHFP question; the roads to a NAME; 0 SSHFP and at
   least one A after the mark; the image's tag tied to the committed file; the container removed by name on every path?
2. M11 (a): both configs; `Bad configuration option` before a connection; the refusal with the line; witnesses with literal words?
3. M11 (b): every leg of M1, M2 (b) mismatch and M7 runs with ALL of its own checks, plus the older ones; the question per call; no
   `KnownHostsCommand` pair; `DEBUG1` does not change a count; the collision's result read as §3.2 says?
4. M11 (c), (d): one road per leg, cold; one `-V` start; 0 connections with a passthrough that could connect; sentence F twice-compared;
   the two times from the click; the program gone by pid and start time; what was shown while waiting recorded?
5. M13: the product's builders and checked pin; the K7 twin; the UNC decision by `decidePinOfCall` with a counting asker; no `/dev/null`?
6. Each leg its own process, world, counterpart(s), key copy and folder; a failed control a named FAIL; nothing left after the run?
7. Section 10 unchanged in behaviour (its count); the guards; the budgets; the documents as "seen when it was built".

## What grows

| What | How much (projected) | Who retires it | When it is interrupted |
|---|---|---|---|
| the image `creds-itest-e3-resolver:<b>` | about 250 MB | the lead, `wslc rmi`, after E3's merge, with the old `:20261124` | not swept by the janitor (S3, F6) |
| the container of an `m10` run | none after the run | the host part, by exact name, `finally` and scope | `--rm`; a killed run: the lead removes it by its owned name |
| the `off` folder per run: 25 M11 leg folders, `oldssh` (about 6 MB), `programs` | under 20 MB | the section's scope | the janitor (token `creds`) |
| (d)'s `sleep infinity` | one process per (d) leg, about 10 s | the runner's limit; the leg by pid and start time | the leg's scope ends it by pid and start time |

Nothing grows in the product.

## Notes for the lead

- **Links and rows.** The stories document (its status line and `## E3.S9`), the parent's `## Epics`, E3, and `todo/README.md` do not
  name this file. They are the lead's, in the commit that adds this spec.
- **Where L2 to L5 land.** L2: M10.c (§2). L3: M10.ad, a record (§2, D16). L4: §1.2 (the rebuild and the tag of the file). L5: M11.v in
  (a2) and every (b) leg, through the launcher's `logLevel` (§1.3, D4), not `Match all` (Q3).
- **Changed files of earlier stories:** the rig (D1 to D3, D6), `itestRowM1.cjs` (D7), the launcher (D4), `rowRecord.cjs` (D5),
  `itestIdentities.cjs` (D9), `itestSshd.cjs` (D11), `itestPinnedRoads.cjs` (D12), the probes P2, P3, P5 and the resolver (D13 to D17).
  Each keeps its default behaviour; section 10's count shows it.
- **E3.S10** runs `itestOffRig.cjs` `m10`, `m11`, `m13` on the same commit as the rig's run, from its fresh checkout (the container mounts
  that checkout), and reads the three rows from these outputs.

## Questions for the lead

**Q1 · M11 (b), M7 (c)'s collision on 8.4: the control is predicted not to be accepted.** (Decision 18 if the run shows it.)
- The parent, M11 (b): "M7's control showing acceptance through the colliding file with E1's words".
- What is so (read, not run): 8.4 reads a value with `strdelim`, which knows double quotes only; single quotes came with the tokeniser of
  8.7. So the bare `x'y'z` names the pin file on 8.4, not the twin.
- My reading: build the legs as written; if M7.y3 and M7.x2 fail on 8.4, the row cannot pass as written: a plan change (the second of epoch 3),
  and the owner if it makes the gate smaller. Do you want the question consultants asked now, before the build?

**Q2 · "as M7 (a)-(e)" in M11 (b): the switch legs too?** (Not a plan change in my reading; confirm.)
- My reading: yes, all seventeen legs of M7, because M7 (a)-(e) are defined with both legs of M2 (b); "the mismatch" narrows M2 (b) alone.

**Q3 · S3.L5's `DEBUG1`: the launcher's option, not `Match all`.** (Not a plan change in my reading; confirm.)
- S4's N1 says a line that `servingConfig` writes changes only inside `Match all`. Read in `sshd` (not run): a `Match` block is applied when
  the user is known, after the banner exchange that logs `remote software version`. So `DEBUG1` there would not log the line.
- My reading: D4 (`LogLevel DEBUG1` IN PLACE of `VERBOSE`, the default byte for byte) and D5 (the counts drop `debug` lines).

**Q4 · M13 on the owner's Windows: from WSL, by S3.P5's way.** (Not a plan change in my reading; confirm.)
- Your brief: a script that the owner runs there. Windows has no Node (agent-models note), and the product's words need the compiled product.
  S3.P5 starts the owner's `ssh.exe` from WSL on the same machine; it worked.
- What is not measured that way: the command line that Node on Windows (libuv) builds from the argv; WSL's interop builds its own.
- My reading: M13 runs from WSL (§1.5). A native run (VS Code's own Electron as Node) would be a new instrument, not probed: decision 18.

**Q5 · M11 (a): "pinned to K1" with the product's words for this client.** (Not a plan change in my reading; confirm.)
- My reading: the leg under test is the product's answer for an older client, so its words are `hostKeyWords(await checkedPinOf(…))`; the
  witnesses use literal E1 words. M11.a0 pins that the words hold no `KnownHostsCommand`.

**Q6 · The image rebuild downloads again.** (Not a plan change in my reading; confirm.)
- S3.L4: rebuild from the committed file. The tag of the base is not a digest, and the packages can be newer than `deb12u10`.
- My reading: the owner's word before the build, as for S3's D3 and D4; the tag names the file's blob; c2 records the versions.

**Q7 · M11 (c): "no version at the start of its stderr".** (Not a plan change in my reading; confirm.)
- My reading: `not a version: OpenSSH_10.2p1` with exit 0: a version that is not at the start (F20), so the product reads `unreadable` with
  exit code 0, and sentence F says `exit code 0`.

## State at the stop (2026-11-25, the lead)

Not answered and not built. Q1 was measured by the lead (`research/module_tests.md`, *The apostrophes of a bare word on an older client*):
OpenSSH 8.4p1 keeps the apostrophes of a bare word, so M11 (b)'s collision cannot be shown on an older client. That is plan change 3.2 in
the parent, its second change of epoch 3: the plan is stopped for re-review. This spec is rewritten against the revised plan before any build.
