# PLAN — E3.S9 spec: the rows off the rig (M10, M11, M13), and the control of test 21 per parser (test 34)

> Status: **IMPLEMENTED, 2026-11-27.** Story E3.S9 (spec) of G1: merged (#393, squash `fe9aee47`, and #394, `b152bf06`) and released in extension 1.24.0 on 2026-11-27 (release PR #395, squash `a63dee35`, tag `extension-v1.24.0` at `a63dee35`, published to the Marketplace the same day). The parent [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) records the release and the run on the release commit (§10.5).
>
> The status as it stood before the promotion, kept as it was written: **spec, 2026-11-25, by Opus; not built. It replaces the spec of 2026-11-24, which the re-review for epoch 4 cut** (the parent's
> `### Re-review for epoch 4`, the row of the E3.S9 spec: its M11 (b) built M7's collision legs on the older client). Story E3.S9 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its decisions 15, 16, 18 and 19-22; §1.3; §3.10; §3.11, *Two
> parsers*; §5, tests 21 and 34; §6, *The release evidence says its limits*; C20, C21; `## Epics`, E3: *The setup of every measurement*,
> *The parser of the client*, the rows M10, M11 and M13, *How the rows are read*) and of its stories document
> [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md) (*Settled by the re-review for epoch 4*; `## The rows: built
> story by story, measured once`; `## E3.S9`; the lead's answer Q3). It uses the instruments that E3.S3 probed (P2, P3 with P3.4 and P3.5,
> P5, P7) and the notes L2-L5 of the E3.S3 spec. It builds on the common rig as built by E3.S4 to E3.S8. This file is promoted together with
> the parent.
>
> Scope: `src_vs_code/scripts` (seven new files, sixteen changed), one new test file and two changed test files in `src_vs_code/src/test`,
> and `research/module_tests.md`. No product file (`src_vs_code/src` outside `src/test/`), no workflow, no `package.json`, no change of the
> `Containerfile`. **Read on `0e54081f`, 2026-11-25** (every `file:line` below is of that commit; `src_vs_code` there is the tree of
> `ab375f29`). Nothing was run for this spec: no `ssh`, no `sshd`, no container. Opus writes this spec, a Sonnet coder builds it, Opus
> reviews it.

"The parent" is the plan linked above; M10, §3.11, C20, decision 19 and so on are the parent's. Names of earlier specs have a prefix
(`S3.P2`, `S3.L4`, `S4.`, `S7.`). This document's own names: the facts F1 to F28, the dependencies D1 to D21, the checks `M10.x`, `M11.x`,
`M13.x`, the tests TX1 to TX13, the mutations MX1 to MX14, the hand checks HC1 to HC9, the break-its BR1 to BR20, and the questions Q3 to
Q10 (Q1 and Q2 of the cut spec are settled: below). "A leg" is what the E3.S4 spec says: one scenario with its own folder, leg process,
world, key copy and counterpart(s). This document keeps no change ledger: a change of it is an entry in the parent
(`plan-change-control.md`). **Epoch 4 is open with 0 changes.** A row or an instrument that cannot run as written is decision 18: it is a
plan change, the FIRST of epoch 4, and the lead records it. This spec never makes such a row weaker; it writes it as a question.

**From the cut spec.** Kept, read again: M10, M11 (a), (c), (d), M13, D1 to D17, L2 to L5, Q3 to Q7. Gone: the legs
`m11-m7-c-collision-k1` and `-k2` with M7's expectation on the older client (and the old MX1). New: the twin of (c) and the equals-sign
pair (§3.3), each leg's parser (§1.3), test 34 (§5), D18 to D21, the words of the result (decision 22). Q1 is settled by the re-review,
Q2 by the stories document (*Settled by the re-review for epoch 4*, item 2: yes).

## What E3.S9 decides, in one paragraph

The three rows do not run in section 10, and CI does not run them. They run through ONE new entry, `scripts/itestOffRig.cjs`, with the
names `m10`, `m11` and `m13`, and a fourth name, `unit-older`, which runs the unit file of test 34 with the older client first on `PATH`.
**M10** runs inside the `wslc` container of S3.P2, as the cut spec said. **M11** runs on this machine with the unpacked OpenSSH 8.4p1 of
S3.P3 first on `PATH`: (a) two legs of the client alone; (b) the legs of M1, M2 (b) the mismatch and M7's fifteen legs of the shapes
(a)-(e) (never its two collision legs), each with the expectation of an older client; then **the twin of (c)**, two legs whose
expectations are the older parser's constants (K1 accepts the witness with the bare word, K2 refuses the control with the bare word and
logs 0 authentication attempts); then **the equals-sign pair**, two legs on the older client (K2 ACCEPTS the control with E1's bare words
through the twin at the first name of the split, and refuses the roads) and the same two legs on the newer client of the rig (no
collision: K2 refuses the bare control, K1 accepts it); (c) and (d) one leg per road with a program that answers `-V` at once with no
version at the start, or never. Each leg reads the version of ITS client and takes the expectation of that version's parser; it never
takes an expectation from an outcome. **M13** is the client alone: `ssh.exe -G` of the owner's Windows, from WSL, as S3.P5 did. **Test 34**
gives the `-G` tests of `test/pinWords.test.ts` a fixed expectation per parser (boundary 8.7, one constant of the tests): G5 as it stands
is watched RED with the older client first, then the file is GREEN with each client first.

| File | Change | Lines (budget) |
|---|---|---|
| `scripts/lib/offRigRecord.cjs` (new) | pure: the leg tables; the parser of a version and the boundary 8.7; the bare-word expectations per parser; the split of a bare path at `=`; the questions and words per parser; the two programs; sentence F's words; the times of (d); the reader of `-G`; K7's twin; the UNC words; `versionSeen` | ≤ 280 |
| `scripts/itestOffRig.cjs` (new) | the entry: `m10` (host part, `--inside`), `m11`, `m13`, `unit-older`; `--legs`; the record; the last line | ≤ 320 |
| `scripts/itestRowM10.cjs` (new) | the leg `m10` | ≤ 220 |
| `scripts/itestRowM11.cjs` (new) | `rowM11`, the (a) legs, the (b) wrappers, `legs` (with those of the next two files) | ≤ 300 |
| `scripts/itestRowM11Bare.cjs` (new) | the twin of (c) and the equals-sign pair: six legs | ≤ 320 |
| `scripts/itestRowM11Never.cjs` (new) | the (c) and (d) legs | ≤ 260 |
| `scripts/itestRowM13.cjs` (new) | M13, the client alone (no leg process) | ≤ 300 |
| `src/test/itestRowsOff.test.ts` (new) | TX1 to TX13 | ≤ 440 |
| `src/test/pinWords.test.ts`, `src/test/pinnedArgv.ts` | test 34 (§5) | 362 → ≤ 430; 103 → ≤ 125 |
| the changed scripts | §6, D1 to D21 | each in §6's budget |
| `research/module_tests.md` | M10, M11, M13 and test 34 "seen when they were built" | — |

## Binding constraints

The binding constraints of the E3.S4 to E3.S8 specs hold here, word for word (no plan change; only `vscode` is a stand-in on the rows'
roads; through the committed instrument only; a run of the commit; the four counts apart; the guards green; exe + argv with a time limit,
every process ended by pid and start time; the person's `~/.ssh` never read or written; Node only, no Python; at most 800 lines per script;
no home path and no user name in a committed text; lowered priority, leg processes one at a time; no product code changes for a leg; every
source of trust or config made in the leg's folder; a control or a witness never takes its words from `hostKeyWords`; a text is compared
with the product's function AND with pinned words). In addition:

- **A fixed expectation per parser (decision 19).** Every check about a bare word takes its expectation from the version that its own
  client printed for `-V`, read with the product's `versionTokenOf`, and from the lib's constant `PARSER_SINCE` (8.7). A version that
  cannot be read gives NO expectation: the check is a named FAIL. No code path chooses an expectation from what the client did.
- **Each check can fail for its own reason.** A check that holds two facts is two checks; a witness, a control and the count beside them
  are separate checks with their own ids. A failed control or witness is a named FAIL, and the leg goes on to its end (its leaving checks
  and its evidence line). A value not read is `null` and fails its check. Each leg makes its own state (cold, its counterparts, its twin);
  none takes over the state of the leg before.
- **Decision 15's four counts are in every evidence line**: starts of the client, connection starts, authentication attempts, accepted
  logins with their command and exit code.
- **Containers only through `wslc`, never Docker.** The image is built only from the committed `Containerfile`, from a tree with no
  modified tracked file, and only after the owner's word on its downloads (§1.2, Q6). The container has `--rm`, the owner-form name and
  the owner label, and the run removes it by its exact name in a `finally` and in the scope's `after`.
- **The older client is the unpacked 8.4p1 of S3.P3**, from `CREDS_ITEST_OLD_SSH_DEBS` (`~/.cache/creds-itest-oldssh/deb`), checked
  against its `SHA256SUMS` and unpacked into the run's owned folder at each run. Nothing is downloaded or installed by this story, except
  the image rebuild of §1.2 after the owner's word.
- **M13 starts `ssh.exe` with `-V` and `-G` only.** No login, no network, no file written on Windows.
- **A check name holds no " — "** (`itestRowRig.cjs:676-678`). The new entry's `check` throws on one too.
- **Decision 18.** A leg that cannot run as written, or an instrument that does not show what its row needs, is NOT made weaker: the coder
  STOPS and tells the lead. §8 names the places that rest on facts that are read and not run.

## Facts read on `0e54081f` that this spec uses

| # | Fact | How |
|---|---|---|
| F1 | **The rows.** M10, M11, M13 and *How the rows are read*: the parent's `## Epics`, E3 (the row M11 is revised for epoch 4: entry 3.2, decisions 19, 20). Decisions 18-22: the parent's §2. Test 34: the parent's §5. C20, C21: *The remaining candidates* | read |
| F2 | **The stories document.** `## E3.S9` as revised: the twin of (c) and the equals-sign pair with their expectations as "constants of the older parser in the story's own code"; the equals-sign twin "does not hold the uuid of a call, so the leg writes the twin once, before its world opens"; a login of the pair that does not come out as the row says: "the coder stops and tells the lead"; test 34 RED first, GREEN twice; Q3 of the lead ("each road"); the margin of M11 (d) is 5 s | read |
| F3 | **S3.P2 (worked, `e6cb6532`).** `itestProbeResolver.cjs`: `IMAGE_TAG` the constant `creds-itest-e3-resolver:20261124` (`:26`); `hostPart` `:102`; the inside part `:237-309`; `NAME` `:31`, `CONTROL` `:29`; exports only `probeResolver` (`:315`). The container runs ONE fixed command (`containers/e3-resolver-init.sh:21`); the script is mounted, not built in | read |
| F4 | **The image.** `e3-resolver.Containerfile`: `FROM node:22-bookworm-slim` (a tag, no digest), `openssh-client openssh-server procps`. S3.P2's image: OpenSSH 9.2p1 `deb12u10`, no `git`; it was built before its file was committed (S3.L4) | read (`module_tests.md`, P2) |
| F5 | **The resolver** answers `A` and `SSHFP` from `zone.json`, SETS the AD bit on a positive answer (`FLAG_AD`, `itestResolverServer.cjs:25`, `:78`), records each question | read |
| F6 | **S3.P3 (worked, `cd5088d9`).** `itestProbeOlderClient.cjs`: `DEBS_VARIABLE` `:17`, `debsFolderOf` `:32`, `checkedDebs` `:47`, `unpack` `:76`, `librariesOf` `:97`; exports only `probeOlderClient` and `DEBS_VARIABLE` (`:183`). The wrapper printed `OpenSSH_8.4p1 Debian-5+deb11u3, OpenSSL 1.1.1w`; the asker answered `older`; a login with the product's five pairs ended with 0 | read |
| F7 | **P3.4 and P3.5 (8.4p1, `-G` only).** The path `<dir>/data=prod/keys/known_hosts-e1` in double quotes resolves to itself, whole, the sole value of each option; BARE it resolves to `<dir>/data prod/keys/known_hosts-e1` in both lists: two names, the second RELATIVE | read |
| F8 | **The bare pair on 8.4p1 (entry 3.2).** `-o "UserKnownHostsFile=/tmp/kh/x'y'z"` resolves to `/tmp/kh/x'y'z` on 8.4p1 and `/tmp/kh/xyz` on 10.2p1; in double quotes, itself on both. The user list only; no login | read (`module_tests.md`) |
| F9 | **S3.P7 (worked).** The program records its start as the shim does, then `exec sleep infinity`; a cold asker answered `unreadable`, `exitCode: null`; `t1 - t0 = 10.01 s`, `t2 - t0 = 10.04 s` | read |
| F10 | **S3.P5 (worked).** `itestProbeWindows.cjs`: `SSH_EXE` `/mnt/c/Windows/System32/OpenSSH/ssh.exe` (`:14`); the user folder joined at run time; `-G -F none <words> -p 22 probe-host`; exports only `probeWindowsClient` (`:97`). `OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2` | read |
| F11 | **K7 and K8 of the E1.S1 spec.** `-G` joins the files of a list with a space; K7's control is a path with ` ~` after a space (quoted: 0 and the path whole; bare: 255 and `tilde_expand`). K8 (a): one apostrophe bare is `invalid quotes` (10.2p1). K8 (c): `\\` is read as one `\` on Windows | read |
| F12 | **The rig.** `rowsTop` `itestRowRig.cjs:41`; `legRig` `:50` calls `sec.installShim(rig)` with no `real` (`:61`); `runLeg` `:124`; `counterpart` `:143`; `openRoads` `:296`; `viaReal` `:460`; `controlClient` `:503` (destination `127.0.0.1`); `nothingLeft` `:599`; `evidence` `:636`; `ROW_FILES` `:654-658`; `legMain` `:670`. `installShim(rig, real = realSsh(…))` already takes a `real` (`itestPinnedRoads.cjs:135`) | read |
| F13 | **The world.** `w.replaceHost(host)` changes the entry's host from the next read; `said` has `at` (`performance.now()` of the leg process) | read (cut spec F13) |
| F14 | **The serving config and the counts.** `servingConfig` (`lib/sshdRun.cjs:108`) writes `LogLevel VERBOSE` at `:119`, then the run's lines, then `extra`; `sshd` keeps the FIRST value of a keyword (S4 N1). `logCounts` (`lib/rowRecord.cjs:74`) reads every line of the log | read |
| F15 | **M1's checks that name the newer client.** `recordChecks` (`itestRowM1.cjs:89`): M1.8 asks ONE question (`:95`), M1.9 that it ended before the first connection (`:101`), M1.10 the six pairs with `KnownHostsCommand=none` (`:105`; `NEW_PAIRS` `itestPinnedRoads.cjs:46`). `m1Runs` `:150` | read |
| F16 | **M7's collision legs** (`collisionK1` `itestRowM7.cjs:107`, `collisionK2` `:135`) hold the NEWER parser's two outcomes: M7.x2 (`:128`, the witness against K1 refused) and M7.y3 (`:160`, the control accepted by K2). `twinsCheck` `:88`, `coldCheck` `:99`, `begin` `:26`, `recordOf` `:104` are not exported (`:178`) | read |
| F17 | **The twin and the bare control.** `twinWriter` (`itestRowPaths.cjs:87`) writes `pr.resolvedBare(pin)` at each pin file's first run; `controlBare` (`:103`) writes its own file and `resolvedBare` of it, then E1's words with the path bare; its docblock says the twin is "the apostrophes taken out". `resolvedBare` (`lib/pathRecord.cjs:88-89`): "ssh drops them" | read |
| F18 | **`e1WordsRaw`** (`pathRecord.cjs:92`) throws on white space or a double quote, not on `=`. The leg's own folder must hold none of `MADE_OF` (`itestRowPaths.cjs:18`); `=` is not in it | read |
| F19 | **`login`** (`itestRowOtherKey.cjs:155`) answers `before` and `after` with `accepted`, `connections` and `sessions`; it has no count of authentication attempts | read |
| F20 | **The pin words for an older client.** `checkedPin` quotes a path with white space, an apostrophe or `=` (`hostKeyPin.ts:226`) for every client; `hostKeyWords` leaves `KnownHostsCommand=none` out when `knowsKnownHostsCommand` is false (`:272`); `VerifyHostKeyDNS=no` `:275` | read |
| F21 | **The asker.** `pinClientAsker` (`pinClient.ts:84`) keeps an answer only when `read.kind === 'knows'` (`:92`); the limit is `CLIENT_CHECK_TIMEOUT_MS` (10 s); `decidePinOfCall` refuses `unreadable` with sentence F (`pinOfCall.ts:61`) | read |
| F22 | **Sentence F.** `pinClientSentence(name, exitCode)` (`hostKeyPin.ts:293`): `(exit code <n>)` or `(it did not start, or did not end in time)`; the install's prefix `Cannot reach "<name>": `, the bridge's `Cannot bridge to "<name>": ` | read |
| F23 | **The record of identities.** `recordIdentities(check, rig, real)` (`itestIdentities.cjs:144`) FAILS R8 when no leg wrote a `tool.json` (`:160`) and R9 when no `known_hosts_command` exists (`:164`) | read |
| F24 | **The rig's checked pin.** `checkedPinOf(out, file)` (`itestSshd.cjs:218`) asks `ssh` of `process.env.PATH` | read |
| F25 | **`productOf`** (`itestPinnedRoads.cjs:52`) loads `personPin` and `hostKeyTrust` under the `vscode` stub; not `pinOfCall`, not `bridgedSshClient` | read |
| F26 | **G4 and G5** (`pinWords.test.ts:310-333`): G4 asks every written row with `ssh` of `PATH`, words of `knows` or `older` by `KNOWS_COMMAND`; G5 asserts the NEWER parser's control and that no refused row is read as the one file in both spellings. `VERSION_ANSWER` `:141`; `sshKnowsKnownHostsCommand` (`pinnedArgv.ts:20`) counts a version that cannot be read as knowing | read |
| F27 | **The unit runner.** `scripts/run-tests.mjs "<glob>"` runs `node --test` inside the leftovers lifecycle: a sweep of what a KILLED earlier run left, the run's record, an audit of the run's own folders (`run-tests.mjs:1-30`) | read |
| F28 | **The guards that read every script.** Test 33 (`itestInstrument.test.ts`); RR6 and RR7 read every `itestRow*.cjs` (`itestRowRig.test.ts`); `harnessSites.test.ts`; `itestCallers.test.ts` (every builder call takes `await checkedPinOf(`); the leftovers guard | read |

## Commands

As the E3.S4 spec's *Commands* (in `src_vs_code`, `LP=../.agents/conventions/tools/low-priority.mjs`): compile (read its exit first), one
suite through `scripts/run-tests.mjs`, typecheck, lint, ratchet, `npm test`, `node --check scripts/<file>.cjs`; from the root the
leftovers guard, `plan-lifecycle.mjs` and `public-hygiene.mjs`. The proving commands, in `src_vs_code`:

```text
node --import ./scripts/lower-priority.mjs scripts/itestOffRig.cjs m10
CREDS_ITEST_OLD_SSH_DEBS="$HOME/.cache/creds-itest-oldssh/deb" CREDS_ITEST_SSHD="$HOME/.cache/creds-itest-sshd/sshd-wrap.sh" \
  CREDS_ITEST_SSHD_CONFIG="$HOME/.cache/creds-itest-sshd/extra.conf" node --import ./scripts/lower-priority.mjs scripts/itestOffRig.cjs m11
CREDS_ITEST_OLD_SSH_DEBS="$HOME/.cache/creds-itest-oldssh/deb" node --import ./scripts/lower-priority.mjs scripts/itestOffRig.cjs unit-older
node --import ./scripts/lower-priority.mjs scripts/itestOffRig.cjs m13
```

## 1. The decisions

### 1.1 The entry: `scripts/itestOffRig.cjs`

`node … itestOffRig.cjs <name> [--inside] [--legs <a,b,…>]`, `<name>` one of `m10`, `m11`, `m13`, `unit-older`. An unknown name, a second
name, `--inside` with another name than `m10`, `--legs` with `m13` or `unit-older`, or a `--legs` name that the row does not have: exit 2
at once, naming the legal values. `--legs` is for the hand checks only (§9); a proving run never passes it, and the run prints
`info  --legs given: this run is no proving run` when it is given.

Per run: `harnessScope.run(main)`; one `sectionScope`; one `ownedDir(section, 'off', { parent: shortSocketRoot() })`; a `check(name, ok,
detail)` as `itestRowRig.cjs:676-680`; at the end ONE line `off-rig <name>: <n> ok, <m> FAIL`; exit 0 only when no check failed. The
person's `~/.ssh/known_hosts` digest before and after (`knownHostsDigest`, `itestPinnedRoads.cjs:474`).

**`m10` and `m11` build the rows' top as section 10 does** (`pinnedLegs`, `itestPinnedRoads.cjs:501-512`): `rigOf`, `makeKeys`,
`writeClientConfig`, `installShim`, the pin of K1, `rowsTop`. They do NOT run section 10's check "the real ssh knows KnownHostsCommand"
(`:509`). Then the row's legs with `rig.runLeg`, then `devNullScan(check, top)` of `itestRowM12.cjs:106`, then the record (§1.6).

**`unit-older`** unpacks the older client as `m11` does (§1.3), then starts ONE child, `node --import ./scripts/lower-priority.mjs
scripts/run-tests.mjs out/test/pinWords.test.js`, with `PATH` = `<off>/oldssh/bin` + the run's `PATH`, a time limit of 10 minutes, ended
by pid and start time. It relays each line as `unit | <line>`, prints the child's exit code and the counts of the `node --test` summary
(`tests`, `pass`, `fail`, `skipped`) as `info`, and exits with the child's code. Check **U.0**: the wrapper `-V` printed `OpenSSH_8.4p1`
and the lib's parser reads it as `older`. It is the run of test 34 with the older client; see Q8.

### 1.2 M10: where it runs, and the image (S3.L4)

As the cut spec's §1.2, unchanged: the image is rebuilt ONCE from the committed `Containerfile`, after c1, from a tree with no modified
tracked file, after the owner's word (Q6); its tag names the file, `creds-itest-e3-resolver:<b>` with `<b>` the first 12 hex digits of
`git rev-parse HEAD:src_vs_code/scripts/containers/e3-resolver.Containerfile` (`imageTag()`, D13); c2's body records the build command, its
output, the image id, the file's SHA-256 and blob, the base image's digest and `dpkg-query -W openssh-client openssh-server procps`. The
host part is S3.P2's, made a function (`runInContainer(ctx, insideArgs)`, D13); `e3-resolver-init.sh` runs the harness with the
arguments it is given (D14), so P2 passes `scripts/itestFeasibility.cjs resolver --inside` and M10 passes `scripts/itestOffRig.cjs m10
--inside`. Inside, the entry builds the top with the image's `sshd` and `ssh` (9.2p1), runs the leg `m10`, and prints R1 and R2 as
`info` (the host answers them from the same commit).

### 1.3 M11: the clients, their parsers, and what each leg expects

- **Two clients.** Before it changes `PATH`, the entry resolves the rig's client as section 10 does (`realSsh`) and keeps it as
  `top.newer`. Then it unpacks the older client as S3.P3 does (`debsFolderOf`, `checkedDebs`, `unpack`, exported by D15) into
  `<off>/oldssh`, puts `<off>/oldssh/bin` FIRST on `process.env.PATH`, and only then builds the top, so every leg's shim takes the wrapper
  as its real client unless the leg names another (D1). `top.older` is the wrapper.
- **Check M11.0** (the entry, before the legs): `the wrapper -V ended with 0 and printed OpenSSH_8.4p1; the product's pinClientOf reads it
  as older; the lib reads its parser as older (below 8.7)`; and **M11.0n**: `the rig's client -V printed a version that the lib reads as
  newer (8.7 or later)`. The version lines go into the record of identities and into every evidence line.
- **Check M11.p** (the first check of every leg that starts a client): `this leg's client printed <version> for -V; its parser is <older
  or newer>, which is the parser this leg is written for`. The leg reads `-V` of its own real client by its path, with the product's
  `versionTokenOf` (D12), and the lib's `parserOf`. A version that cannot be read, or another parser, is a named FAIL, and the leg goes on
  (see Q9). The parent: "before the legs of M11 (b) the run reads that client's version, checks that it is below 8.7, and fails the legs
  when it is not or when it cannot be read".
- **The expectation of an older client** (`EXPECT.older` of the lib) is handed to the existing row code as `ctx.expect` (D7): M1.8 then
  asks 3 questions and 5 connection starts; M1.9 one question before the connections of EACH pinned call, ended before that call's first
  run (`questionsOk`, the calls by their pin files, `rig.callsOf`); M1.10 no `KnownHostsCommand` pair, and `StrictHostKeyChecking=yes`, one
  path as both known-hosts files, `VerifyHostKeyDNS=no`, `LogLevel=ERROR`, each once (`wordsOk`). With no `ctx.expect`, M1's checks are
  what they were (BR14). `EXPECT.newer` is M1's checks as they are, for the newer legs of the equals-sign pair.
- **L5 lands here.** Each counterpart of a leg in which a client connects ((a2), every (b) leg) logs at `DEBUG1`: the leg sets
  `leg.logLevel = 'DEBUG1'` before its first counterpart, and `counterpart` hands it to the serving launcher's new `logLevel` option (D3,
  D4), which writes `LogLevel DEBUG1` IN PLACE of `LogLevel VERBOSE`, not inside `Match all` (Q3). `logCounts` drops every line that starts
  with `debug1: `, `debug2: ` or `debug3: ` (D5), so the four counts read the same lines as at `VERBOSE`. Check **M11.v** in each such leg,
  after its counts: `<name>'s log names remote software version <the version of M11.p> for at least one connection after the mark`.
- **The bare-word expectations are constants of the lib, per parser** (`BARE`, TX12), never M7's expectations with a switch:

| The bare word | `BARE.older` (before 8.7) | `BARE.newer` (from 8.7 on) |
|---|---|---|
| a pair of apostrophes (the folder of M7 (c)) | itself: the intended file; no collision | the path without them: the twin; a collision (M7's) |
| one equals sign (the folder `data=prod`) | two names, the first the path up to the sign: the twin; a collision | itself, whole; no collision |

### 1.4 M11 (c) and (d): the programs

As the cut spec's §1.4, unchanged. Each leg writes its program before `runLeg`, at `<top.dir>/programs/<leg>/ssh` (mode 0700), and
`runLeg` takes it as the leg's real client (D1). The program (`answersAtOnce(records, passthrough)`, `neverAnswers(records, passthrough)`,
TX4) records its start as the shim does; when its argv is `-V` alone, (c) prints `not a version: OpenSSH_10.2p1` to stderr and exits 0
(Q7), (d) does `exec sleep infinity` (S3.P7's branch, byte for byte); any other argv does `exec <passthrough> "$@"`, the older wrapper, so a
defect that goes on to a connection makes a REAL connection that the counterpart's log can show (BR7). The counterpart K1 (pinned K1,
`VERBOSE`) is there so that "0 connections in the counterpart's log" can fail. Every leg is cold, in a world of its own, and drives ONE
road: `m11-c-install`, `m11-c-bridge`, `m11-d-install`, `m11-d-bridge` (Q3 of the stories document: the socket check is never reached;
the record shows it with no start of any kind). Every question is dismissed (`dismissAll`).

### 1.5 M13: where it runs, and the words

As the cut spec's §1.5, unchanged. On the owner's machine, from its WSL, through S3.P5's instrument: Node's `execFile` starts `ssh.exe` of
the owner's Windows with the argv as separate arguments (Q4). The storage folders are joined at run time from parts (no user name in the
source): `windowsStorage(kind)` answers `C:\Users\<you>\AppData\Roaming\Code\User\globalStorage\x.creds` with a made-up user folder in place
of `<you>`, the words `pin` and `probe` joined by `' '` for (a), by `"'"` for (b) and by `" o'"` for (c). The pin path is
`path.win32.join(<storage>, 'keys', <pid>, 'known_hosts-e1-<uuid>')` (check M13.p: its last three segments are those that the product's
`knownHostsPath` makes for the same storage string). The words are the product's: `buildSshExecArgv` and `buildBridgeArgv`, each with
`knownHostsFile: await checkedPinOf(out, <pin path>, SSH_EXE)` (D11). The UNC folder `\\server.example\share\creds` is asked of the
product only: `pinPathRefusal` and `decidePinOfCall` (D12) with a counting asker over `ssh.exe`; the working folder is the run's owned
folder during that step.

### 1.6 The record of identities

`recordIdentities(check, rig, real, { tools: false, commands })` (D9): R8 is not asked (no `tool.json`); R9 only in M11 (its (a) legs
write a `known_hosts_command`); an item not asked prints `info  R8 not asked: …`. `identities.json` gains `offRig`: the unpacked `ssh`,
its two libraries and the two `.deb` files, `top.newer` with its `-V` line, each program of (c) and (d) (M11); the image id, the
`Containerfile`'s SHA-256 and blob, the resolver, `zone.json`, `/etc/resolv.conf` inside (M10); `ssh.exe` by path, `-V` line and SHA-256,
the `where.exe ssh` answer (M13). A value not read is `null`.

## 2. M10: `scripts/itestRowM10.cjs`, the leg `m10`

Unchanged from the cut spec. M10's words: "where the run owns the resolver: the counterpart has a name, and the resolver answers a SECURE
SSHFP record of K2 for it and records each question. The entry is pinned to K1, the counterpart is K2, the handed config says
`VerifyHostKeyDNS yes`; no `KnownHostsCommand` is named" | "The control first: the control client with E1's words is accepted by K2, and
the resolver's record holds the SSHFP question. Then the roads: each of the four runs that start ends with 255 and the verification line;
each recorded argv holds `VerifyHostKeyDNS=no`; the resolver's record holds 0 SSHFP questions for the roads' runs; K2 logs 0 accepted
logins and 0 authentication attempts. If the control is not accepted, the row is NOT passed: it showed no bypass".

The order: `shared.standing`; K2 = `rig.counterpart(…, leg.k2, { extra: stand.extra })`; K2's SSHFP records (`sshfpOf`, by
`rig.tool('ssh-keygen', ['-r', NAME, …])`) into `<CONTROL>/zone.json` with `secure: true`; the handed config with `VerifyHostKeyDNS yes`;
the control; then `openRoads`, `roads.w.replaceHost(NAME)` before the first click, the mark (with the resolver's question count),
`shared.driveRefusedRoads`, the counts.

| # | Check | The row's words it holds |
|---|---|---|
| M10.0 | `the leg's config resolves verifyhostkeydns yes for <NAME> and names no knownhostscommand; getent hosts <NAME> answers 127.0.0.1 and the resolver recorded that A question` | "the handed config says `VerifyHostKeyDNS yes`; no `KnownHostsCommand` is named"; "the counterpart has a name" |
| M10.c | **the control, first (before the mark)**: `the control client with E1's words, exactly the three pairs of a file of K1's line for [<NAME>]:<port>, to <user>@<NAME>, was accepted by K2: exit 0, one more accepted login with a command session` | "the control client with E1's words is accepted by K2"; S3.L2 (exactly E1's six words, no `KnownHostsCommand=none`) |
| M10.cq | `the resolver recorded the SSHFP question for <NAME> during the control` | "the resolver's record holds the SSHFP question" |
| M10.0c | `cold: 0 runs of ssh -V and 0 starts of the client before the first click` | (the setup) |
| M10.1 | `each of the four runs that start ended with 255 and the verification line: probe, bridge (its own stderr file), sweep, mode check; no install run` | "each of the four runs that start ends with 255 and the verification line" |
| M10.2 | `each connection start names <NAME> as its destination and holds VerifyHostKeyDNS=no, once` | "each recorded argv holds `VerifyHostKeyDNS=no`" |
| M10.3 | `the resolver's record holds 0 SSHFP questions after the mark` | "0 SSHFP questions for the roads' runs" |
| M10.3a | `the resolver's record holds at least one A question for <NAME> after the mark: the roads asked this resolver` | (M10.3 could not fail without it: BR1) |
| M10.4 | `K2 logged a connection for each connection start, 0 accepted logins and 0 authentication attempts after the mark` | "K2 logs 0 accepted logins and 0 authentication attempts" |
| M10.5 | the stand-in guard (`shared.standInGuard`) | (the setup) |

**S3.L3, a record that decides nothing:** after the counts, `zone.json` gets `secure: false` (D16: the resolver then clears the AD bit) and
the same control runs once more: `info  M10.ad: the control with the AD bit off ended with <code>; stderr <the DNS lines>` (expected 255).
The leaving checks: `shared.stderrFilesCheck`, the bridge closed, `rig.nothingLeft`, `rig.endCounterpart`, the evidence with the four
counts and `resolver: { before, afterMark, control, ad }`. **If M10.c fails, M10 is not passed**; the leg goes on, and the record says so.

## 3. M11: `itestRowM11.cjs`, `itestRowM11Bare.cjs`, `itestRowM11Never.cjs`

The legs (`M11_LEGS` of the lib, TX1), in this order, 29 legs:

| Part | Legs | Client |
|---|---|---|
| (a) | `m11-a-unknown`, `m11-a-ignored` | older |
| (b), the runs | `m11-m1`, `m11-m2-mismatch-global`, then `m11-` + each name of `pr.M7_LEGS` whose `run` is `m1`, `mismatch` or `switch`, in its order (15) | older |
| (b), the twin of (c) | `m11-c-twin-k1`, `m11-c-twin-k2` | older |
| (b), the equals-sign pair | `m11-eq-older-k1`, `m11-eq-older-k2`, `m11-eq-newer-k1`, `m11-eq-newer-k2` | older, older, newer, newer |
| (c), (d) | `m11-c-install`, `m11-c-bridge`, `m11-d-install`, `m11-d-bridge` | a program of the leg |

No name holds `collision`: M7's two collision legs are not M11's (the stories document, E3.S9, *What goes*). MX1 puts one back.

### 3.1 (a): the client alone

Unchanged from the cut spec. M11's words: "(a) The client alone: a config line `KnownHostsCommand …` and no `IgnoreUnknown`; then the same
with the config's own `IgnoreUnknown` for it, pinned to K1 against the counterpart K2 with the command printing K2's line" | "(a): without
`IgnoreUnknown` the client ends with `Bad configuration option` and 255 before it connects; with it the login is refused with the
verification line and K2 logs 0 accepted logins". Each leg: K2 (`DEBUG1` in `m11-a-ignored` only); the recording command of M8
(`writeCommand`, `itestRowM8.cjs:17`); the handed config with `KnownHostsCommand <command>` (unknown) or `IgnoreUnknown KnownHostsCommand`
and then that line (ignored); a pin file of K1's line for K2's port; the product's words for this client, `hostKeyWords(await
checkedPinOf(out, <pin>))` (Q5); the real client by its path, `rig.viaReal`, `-i`, `BatchMode=yes`, `-p <K2's port>`, `<user>@127.0.0.1
true`.

| # | Check | The row's words it holds |
|---|---|---|
| M11.p | §1.3 | (the client of the row) |
| M11.a0 | `the product's words for this client hold no KnownHostsCommand pair` (literal names) | "(that line is (a)'s alone)" |
| M11.a1 | unknown: `ended with 255 and a stderr line that holds "Bad configuration option" and "knownhostscommand"` | "ends with `Bad configuration option` and 255" |
| M11.a1c | unknown: `K2 logged 0 connections after the mark` | "before it connects" |
| M11.a1w | unknown, after: `the witness, the same client with E1's literal words of a file of K2's line and the config without the KnownHostsCommand line, ended with 0 and K2 logged one more accepted login` | (K2 was up: M11.a1c could fail; BR15) |
| M11.a2 | ignored: `ended with 255 and the verification line as a whole line` | "the login is refused with the verification line" |
| M11.a2c | ignored: `K2 logged 0 accepted logins and 0 authentication attempts after the mark` | "K2 logs 0 accepted logins" |
| M11.aw | ignored, after: `the witness (E1's literal words of a file of K2's line, the same config) ended with 0 and K2 logged one more accepted login` | (the refusal is the pin's, not a dead K2) |
| M11.v | ignored: §1.3 | "The result names the client's version" |

`info  M11.ak: the recording command was started <n> times` in each leg (expected 0: 8.4 does not know the option).

### 3.2 (b): the runs of M1, M2 (b) the mismatch and M7 (a)-(e)

M11's words: "(b) The roads, under a config of their own that names no `KnownHostsCommand` …: the runs of M1, of M2 (b) the mismatch, and of
M7 (a)-(e), each shape as M7 has it, with the runs of M1 and both legs of M2 (b)" | "(b): as M1 and M7 with their `KnownHostsCommand`
assertion replaced by its opposite …; as M2 (b), the mismatch; as M7 (a)-(e), for each shape the runs of M1 and both legs of M2 (b), with
every check of the product's own word as M7 has it …; and … one question `ssh -V` before the connections of EACH pinned call (three …)".

- The config of their own is the rows' handed config (`handedClientConfig`): it names no `KnownHostsCommand`. `m8`'s config is not used.
- Each leg is a wrapper (`withParser('older', fn)`): it sets `ctx.expect = EXPECT.older` and `leg.logLevel = 'DEBUG1'`, runs M11.p, calls the
  existing leg function (`m1.legs.m1`, `m2.legs['m2-mismatch-global']`, `m7.legs[<name>]`) with EVERY one of its checks, then the older
  checks that the row function does not hold:
  - **M11.q** (each leg that does not run `m1Runs`): `one question ssh -V before the connections of each pinned call: <n> calls, <n>
    questions, each ended before its call's first run` (`questionsOk('older', …)`; 3 calls in the mismatch legs, 1 in the switch legs);
  - **M11.w** (the same legs): `each connection start holds no KnownHostsCommand pair, and StrictHostKeyChecking=yes, one path as both
    known-hosts files, VerifyHostKeyDNS=no and LogLevel=ERROR, each once` (`wordsOk('older', …)`);
  - **M11.v** (every leg).
- In the six legs that run `m1Runs` (`m11-m1`, `m11-m7-{a..e}-m1`), M1.8, M1.9 and M1.10 take `EXPECT.older` (§1.3): they ARE M11's
  replaced assertions there. The labels are `M11 <leg>`; the check ids of the row code stay (`M1.8`, `M2.1`, `M7.w`, `M7.c3` …).

### 3.3 (b): the twin of (c), and the equals-sign pair (`itestRowM11Bare.cjs`)

Six legs of their own. They reuse the rig and M7's parts (D18: `begin`, `coldCheck`, `twinsCheck`, `recordOf` exported; `twinWriter`,
`controlBare`, `wordCheck`, `k2Counts`; `shared.refusedChecks`, `standInGuard`, `driveRefusedRoads`, `login`), and hold their own
expectations, from `BARE[<parser>]` of the lib. Each leg is cold, logs at `DEBUG1`, and starts with M11.p. Its `ssh -G` checks ask the
leg's own client by its path with `-G -F /dev/null -o UserKnownHostsFile=<word> -o GlobalKnownHostsFile=<word> -p 1 127.0.0.1` (through
`viaReal`, whose handed config the last `-F` overrides: S7's deviation 1), with a pathname of the leg's storage folder and a made uuid.

**The twin of (c), on the older client** (`m11-c-twin-k1`, `m11-c-twin-k2`). M11's words: "the same two files as in M7's collision,
where the pin file of the call (the intended file) holds K1's line and the twin (the path with the apostrophes taken out) holds K2's line;
once the counterpart is K1, once K2" | the pass words quoted beside each check. The storage folder of M7 (c), `x'y'z` (`begin` with M7 (c)'s
spec). The twin of each call's pin file is written by `twinWriter` at the moment the call's pin file is known and before its client
starts, as E3.S7 built it for M7.

| # | Check | The row's words it holds |
|---|---|---|
| M11.tG1 | `ssh -G of this client, the bare word of (c) as both known-hosts options: it resolves to itself in both lists, the apostrophes kept` | "the bare word of (c) … resolves to itself in both lists, the apostrophes kept" |
| M11.tG2 | `the same word in double quotes resolves to itself in both lists` | "and for the same word in double quotes" |
| M7.c0 | cold (reused) | (the setup) |
| M7.x0 | each pin file got its twin before its first run (reused) | "In each leg the twin holds K2's line before a client that could read it starts" |
| M7.w | the product's word, in double quotes (reused) | "with every check of the product's own word as M7 has it" |
| M11.q, M11.w | as §3.2 (3 calls) | "the words for an older client"; "one question … before … EACH pinned call" |
| M11.t1 | K1: `K1 logged exactly 5 accepted logins, one per run: 4 with a command session and 1 with none; the 4 runs of the runner ended with 0` | "the roads log 5 accepted logins, as in M7" |
| M11.t2 | K1: `the witness, the control client with E1's words (the path bare), ended with 0` | "the witness … ends with 0" |
| M11.t2c | K1: `K1 logged one more accepted login with a command session for the witness: on this parser the bare word read the intended file` | "and K1 logs one more accepted login with its command" |
| M11.t3 | K2: `each of the four runs that start ended with 255 and the verification line; no install run` (`refusedChecks`, ids `M11.t3.1`, `M11.t3.2`) | "each of the four runs that start ends with 255 and the verification line" |
| M11.t4 | K2: `K2 logged a connection for each connection start, 0 accepted logins and 0 authentication attempts` (`k2Counts`) | "K2 logs 0 accepted logins and 0 authentication attempts, as in M7" |
| M11.t5 | K2: `the control, the control client with E1's words (the path bare), ended with 255 and the verification line` | "the control … ends with 255 and the verification line" |
| M11.t5c | K2: `K2 logged 0 authentication attempts and 0 accepted logins for the control: the twin held K2's line, and the client did not read it` (D19) | "K2 logs 0 authentication attempts and 0 accepted logins for it" |
| M11.tc | `the control's twin held K2's line and its own file K1's line before the control started` | "the twin holds K2's line before a client that could read it starts" |
| M11.v | §1.3 | "The result names the client's version" |

Plus `bareWordsOk` of each control (as M7), the stand-in guard in K2, `stderrFilesCheck`, `nothingLeft`, the counterpart ended, the
evidence. "The two legs decide together: the K1 leg rules out that the client found neither file, and the K2 leg that it found the twin."
A bare-word outcome the other way round (M11.t2 255, or M11.t5 0) is a named FAIL of the row, never a reason to read the client as newer.

**The equals-sign pair** (`m11-eq-older-k1`, `m11-eq-older-k2` on the older client; `m11-eq-newer-k1`, `m11-eq-newer-k2` on the rig's client).
The storage folder is `<leg>/st/data=prod`: one equals sign, none of the characters of M7 or M12. The twin is `<leg>/st/data`, the first name
of the split of the bare path at the sign (`splitAtEquals` of the lib), a FILE that holds K2's line (folders 0700, file 0600). It does not hold
the uuid of a call, so the leg writes it ONCE, before its world opens, and records the time. The pin file of each call holds K1's line, as
the product writes it. The two newer legs run with `real` = `top.newer` (D1) and `ctx.expect` = `EXPECT.newer`.

| # | Check (`o`: the older legs; `n`: the newer legs; else both) | The row's words it holds |
|---|---|---|
| M11.e0 | `the leg's own folder holds no equals sign; the product's rule answers no refusal for the complete pathname of the storage folder, and checkedPin's word for it is the path in double quotes` | "The storage folder's path holds one equals sign, so the product writes the pin file's path in double quotes" |
| M11.eT | `the twin <leg>/st/data holds K2's line, written before the world opened` | "The twin … holds K2's line" |
| M11.eG1 o | `ssh -G of this client, the bare path as both options: two names in both lists, and the first is the twin's path` | "The bare path resolves to two names, and the first is the path of the twin" |
| M11.eG1 n | `ssh -G of this client, the bare path as both options: itself, whole, in both lists` | "the bare path resolves to itself, whole, in both lists" |
| M11.eG2 | `the path in double quotes resolves to itself, whole, in both lists` | "the path in double quotes resolves to itself, whole, in both lists" |
| M11.e1 | K1: `K1 logged exactly 5 accepted logins, one per run: 4 with a command session and 1 with none; the 4 runs of the runner ended with 0` | "the roads of the product, with the logins as in M1: 5 accepted logins" |
| M7.w | K1 and K2: the path in double quotes in every connection start (`wordCheck` with the word `quoted`) | "the path in double quotes in every connection start" |
| M11.e2 | K1: `no error message after the mark: no sentence of §3.5` | "and no sentence of §3.5" |
| M11.q, M11.w | `questionsOk` and `wordsOk` with the leg's parser | "The words and the count of the question are those of an older client" (the stories document); the newer legs as M1 |
| M11.e3 | K2: the four runs refused (`refusedChecks`, `M11.e3.1`, `M11.e3.2`) | "each of the four runs of the roads that start ends with 255 and the verification line" |
| M11.e4 | K2: `k2Counts` | "K2 logs 0 accepted logins and 0 authentication attempts" |
| M11.e5 o | K2: `the control client with E1's words (the path BARE) ended with 0` | "the control … is ACCEPTED by K2: it ends with 0" |
| M11.e5c o | K2: `K2 logged one more accepted login with a command session for the control: it read the twin` | "and K2 logs one more accepted login with its command. It read the twin" |
| M11.e5r o | K2: `the second name of the split, read from the control's working folder, names no file`, so the twin is the only file that the control could read (F7: the second name is relative) | (M11.e5c could pass through another file without it: BR19) |
| M11.e6 n | K2: `the control with E1's bare words ended with 255 and the verification line` | "The control with E1's bare words against K2 ends with 255 and the verification line" |
| M11.e6c n | K2: `K2 logged 0 authentication attempts and 0 accepted logins for the control` | "and K2 logs 0 authentication attempts and 0 accepted logins for it" |
| M11.e7 n | K1: `the same bare words against K1 ended with 0, and K1 logged one more accepted login with a command session: the client found the intended file` | "in the K1 leg the same bare words end with 0 and K1 logs one more accepted login" |
| M11.v | §1.3 | "The result names the client's version" |

The control of the pair is `controlBare(ctx, server, 'data=prod', { twinOf: twinOfEquals })` (D20): its own file
`<leg>/st/data=prod/control/known_hosts-control` holds K1's line, and its twin is the SAME file `<leg>/st/data` (the first name of the
split of the control's own path), whose line the leg checks before the control starts. "If K2 does not accept it, the row is NOT passed:
it showed no hole" (M11.e5 or M11.e5c red). **Only `ssh -G` was measured for this pair** (F7). A login of it that does not come out as the
row says is no harness fault to repair: the coder STOPS and tells the lead (decision 18), and the legs are not made weaker.

**What the result says in words** (decision 22; `info  M11.words`, printed by the entry and put into the evidence, from the versions that
the legs read): on `<older version>` the row does not show the collision of a pair of apostrophes, which that client does not have (M7
shows it on a client from 8.7 on); it shows the collision of a bare equals sign and its repair by the double quotes; on `<newer version>`
the same pair shows no collision of that kind; no row ran a client of 8.5 or 8.6 (C21).

### 3.4 (c) and (d): a program that answers at once, or never (`itestRowM11Never.cjs`)

Unchanged from the cut spec. M11's words for (c) and (d), and their last column, as the parent writes them. The drive of a leg: K1
(`VERBOSE`); `openRoads(…, { answer: dismissAll })`; the mark; `t0` = `pressNow(…)`'s `startedAt`; the leg waits up to 30 s for sentence F
in `said` (`tF` = its `at`); the program's pid and start time from its own record; `tGone` = the first 50 ms poll at which `alive({ pid,
start })` is false (at most 30 s); then 2 s, the counts. A program still alive at the leg's leave is ended by its recorded pid and start
time, and the check that asked it gone has already failed.

| # | Check ((c) and (d), on the leg's road) | The row's words it holds |
|---|---|---|
| M11.x0 | `cold: 0 runs of ssh -V and 0 starts before the click` | "cold" |
| M11.x1 | `the record holds exactly ONE start, argv -V alone, and 0 connection starts` | (c) "the `-V` starts alone, one per refused call"; (d) "exactly ONE start, the `-V`; 0 connection starts" |
| M11.x1p | `the program recorded one start with the same pid as the shim` | (the start is the program's) |
| M11.x2 | `K1 logged 0 connections and 0 authentication attempts after the mark` | "0 connections and 0 authentication attempts in the counterpart's log" |
| M11.x3 | `no sample of keys/<pid>/ from the click to the end held a known_hosts-e1-<uuid> file, and the folder holds none after` | "0 pin files written, during the wait and after it" |
| M11.x4 | `exactly one error message is the road's prefix and the product's sentence F for <code>; it holds F's pinned words and <how>` | "sentence F with the exit code"; "sentence F in its form without an exit code" |
| M11.x5 | install: `no question was asked and no run started`; bridge: `no bridge was spawned, the manager holds no open bridge of the entry, and the socket check has no start of any kind` | "no *bridged* row"; Q3 of the stories document |
| M11.c6 | (c): `the program is gone by its recorded pid and start time within 5 s of the click` | (the leg leaves nothing) |
| M11.d6 | (d): `from the start of the command to sentence F: <s> s, and to the end of the program: <s> s; each between 10 s and 15 s` | "each lies between the runner's limit … and that limit plus a margin" |
| M11.d7 | (d): `the program is gone by its recorded pid and start time, never by name, no later than 5 s after sentence F` | "gone … no later than the margin after sentence F" |

`info  M11 <leg>: shown while waiting: <every said item with t0 < at < tF>` and the two times go into the evidence (`c20: { toSentenceMs,
toGoneMs, shownWhileWaiting }`): "recorded for C20".

## 4. M13: `scripts/itestRowM13.cjs` (the client alone)

Unchanged from the cut spec. M13's words: "`ssh.exe -G` of the Windows that the owner's machine has, … (a) with a space, (b) with an
apostrophe, (c) with both; and the rule asked for a UNC folder" | "(a)-(c): the client resolves strict checking, `verifyhostkeydns false`,
no `knownhostscommand`, `loglevel ERROR`, and both known-hosts lists as the one intended path; one file is told from two by the control of
K7. The UNC folder: the rule refuses it, and no `ssh.exe` is started for it; the control: `ssh.exe -G` with the bare and the quoted UNC word
resolves another path (K8 c). The result names the client's version. NOT in this row: a login on Windows (C6)". Every `ssh.exe` start goes
through ONE function that records its argv and answer (`execFile`, 10 s). No leg process, no counterpart, no world.

| # | Check | The row's words it holds |
|---|---|---|
| M13.0 | `ssh.exe is there as WSL sees it; -V printed OpenSSH_for_Windows_<v>; the product's asker answered knows` | "The result names the client's version" |
| M13.p | §1.5 | (the words are for the product's pathname) |
| M13.x1 | `the product's rule answers no refusal for the pathname of (x)` | (the case reaches the words) |
| M13.x2 | `ssh.exe -G with the exec argv ended with 0: stricthostkeychecking true, verifyhostkeydns false, no knownhostscommand line, loglevel ERROR, both lists the intended path, whole` (CR removed) | "(a)-(c): the client resolves …" |
| M13.x3 | the same with the bridge argv | as above |
| M13.x4 | (a): `K7's control: under the twin folder (" ~" after the space) the product's word ended with 0 and the path whole, the bare word ended with 255 and a tilde_expand line`; (b), (c): `the bare word ended with 255 and invalid quotes` (entry 4.1 of the parent: (c)'s apostrophe is refused before any tilde on `ssh.exe` 9.5p2, so K7's twin cannot show two files there) | "for (a) one file is told from two by the control of K7; for (b) and (c) the bare word is refused" |
| M13.u1 | `the product's rule refuses the pathname under \\server.example\share\creds with doubleBackslash` | "the rule refuses it" |
| M13.u2 | `decidePinOfCall answered refused with the product's sentence E for doubleBackslash, and its asker started ssh.exe 0 times` | "no `ssh.exe` is started for it" |
| M13.u3 | `no file was written for it: the owned folder holds no keys folder after the step` | (the refusal stands before the write) |
| M13.uc | `the control: ssh.exe -G with the bare and with the quoted UNC word each ended with 0 and resolved \server.example\share\…, not the intended path` | "the control: … resolves another path (K8 c)" |
| M13.z | `no argv of the run names /dev/null as a known-hosts file` | (S7's note for E3.S10) |

## 5. Test 34: the control of test 21 per parser (`test/pinWords.test.ts`, `test/pinnedArgv.ts`)

The parent's test 34, as it lists it. Test code only.

- **`pinnedArgv.ts`** gains `TOKENISER_SINCE = [8, 7]` (the one constant of the tests, beside the product's 8.5) and
  `sshParserOf(stderr): 'older' | 'newer' | undefined`, read with `versionTokenOf`. Unlike `sshKnowsKnownHostsCommand`, a version that cannot
  be read is `undefined`, never a parser.
- **`pinWords.test.ts`**: `PARSER = sshParserOf(VERSION_ANSWER.stderr)`. A helper `parserOrFail()` makes every `-G` test fail with
  `the version of this ssh cannot be read: no parser, no expectation` when `PARSER` is `undefined` (decision 19; it does not skip).
  - **P6 (pure, new):** `sshParserOf` answers `older` for `OpenSSH_8.4p1 …` and `OpenSSH_8.6p1 …`, `newer` for `OpenSSH_8.7p1 …` and
    `OpenSSH_10.2p1 …`, `undefined` for `''`, for `not a version: OpenSSH_10.2p1` and for an `OpenSSH_for_Windows_9.5p2` that is not at
    the start.
  - **G4 (both parsers):** as it is, after `parserOrFail()`. A written path that a client resolves to another one is a defect of the rule on
    that client: the coder does not repair it in this story (the kind would move to "refused", a product change with its own spec and its
    test RED first); the coder STOPS and tells the lead.
  - **G5 (the control of this client's parser):** after `parserOrFail()`, ONE branch by `PARSER`. `newer`: the bare pair
    `/tmp/creds-a'b'/kh` is not read as itself and is read as `/tmp/creds-ab/kh` (as today); the bare `/tmp/data=prod/keys/known_hosts-e1`
    IS read as itself, whole, in both lists. `older`: the bare pair IS read as itself, and NOT as `/tmp/creds-ab/kh`; the bare equals-sign
    path is NOT read as itself, and the first name of each list is `/tmp/data`. Each assertion has its own message.
  - **G6 (the refused rows, split from G5):** `newer`: the assertion of G5 as E2 built it (no refused row is read as the one file in both
    spellings). `older`: for each refused row, `t.diagnostic` records what the client resolves bare and in double quotes; nothing is
    asserted (the parent's re-review record, its SEVENTH place).
- **RED first, watched.** Before `pinWords.test.ts` changes, compile and run `itestOffRig.cjs unit-older` (after step 4 of §12): G5 as it
  stands fails at its first assertion, `the pair of apostrophes, bare, was read as itself: G4 could not show the fault` (inferred from entry
  3.2, never run). Save the output; record G4's result on that client too. Any other first failure is a stop.
- **GREEN twice:** `npm test` (the newer client first on `PATH`, as CI runs it), and `unit-older`. Record the counts of each (tests, pass,
  fail, skipped: G1-G3 skip on 8.4, `NEEDS_SSH_85`). The result of `unit-older` goes into `research/module_tests.md`; E3.S10 runs it again
  for §10 (the parent: "It is no row").

## 6. Dependencies on the built rig (and what E3.S9 adds itself)

| # | What E3.S9 needs | Built? (`0e54081f`) | What E3.S9 does (budget) |
|---|---|---|---|
| D1 | a leg whose real client is named | half: `installShim(rig, real)` takes one (F12); `legRig` `:61` passes none | `runLeg(…, label, { real })` → `legRig` → `installShim(rig, real)`; the default is as before (`itestRowRig.cjs` 711 → ≤ 724, with D2, D3, D6) |
| D2 | the rows' legs load in a leg process | `ROW_FILES` `:654-658` | add `M10` and `M11` (`M11`'s `legs` holds those of the two other M11 files) |
| D3 | a counterpart that logs at `DEBUG1` | no | `counterpart` hands `leg.logLevel` to the launcher |
| D4 | the launcher's log level | no: `sshdRun.cjs:119` | `servingConfig(…, { logLevel = 'VERBOSE' })`, one of `VERBOSE`, `DEBUG1` (else throws); `startServingSshd(…, extra, { logLevel })` (`sshdRun.cjs` 128 → ≤ 132; `itestServing.cjs` 188 → ≤ 192); with no option the text is byte for byte as before (TX9) |
| D5 | counts that a `DEBUG1` log does not change | no: `rowRecord.cjs:74` | drop lines that start `debug1: `, `debug2: `, `debug3: ` before counting (168 → ≤ 172) |
| D6 | a control to a name | no | `controlClient(…, { host = '127.0.0.1' })`, `login(…, { host })`, `knownHostsLineOf(port, pub, host = '127.0.0.1')` (`otherKeyRecord.cjs` 156 → ≤ 158) |
| D7 | M1's checks for each parser | no: F15 | `recordChecks` reads `ctx.expect` (default the newer client's: as now) (178 → ≤ 200) |
| D8 | M2 (b), M7 legs on the older client | built: their checks read no version | — (the wrappers of §3.2) |
| D9 | a record without section 10's R8, R9 | no: F23 | `recordIdentities(check, rig, real, { tools = true, commands = true } = {})` (171 → ≤ 180); section 10's call unchanged |
| D10 | the record inside the container | built: `insideAware` `itestFeasibility.cjs:156` | the entry does the same |
| D11 | a checked pin asked of `ssh.exe` | no: F24 | `checkedPinOf(out, file, program = 'ssh')` (232 → ≤ 234) |
| D12 | `decidePinOfCall` and `versionTokenOf` in the harness | no: F25 | `productOf` also loads `../pinOfCall` and `../bridgedSshClient` under the stub (570 → ≤ 574) |
| D13 | the host part as a function; the tag of the file | no: F3 | `runInContainer(ctx, insideArgs)`, `imageTag()`, exports `NAME`, `CONTROL`, `questions`, `sshfpOf` (315 → ≤ 345) |
| D14 | the container runs the harness it is given | no: F3 | `e3-resolver-init.sh` runs `node --import ./scripts/lower-priority.mjs "$@"` as the user; no argument: exit 93 (25 → ≤ 30) |
| D15 | the older client unpacked by the entry | no: F6 | export `debsFolderOf`, `checkedDebs`, `unpack`, `librariesOf`; `unpack` takes `{ run, check }` (183 → ≤ 190) |
| D16 | an answer without the AD bit (S3.L3) | no: F5 | `zone.secure === false` → no `FLAG_AD` (127 → ≤ 130) |
| D17 | the Windows client's parts | no: F10 | export `SSH_EXE`, `storageOf`, `pinPathIn` (97 → ≤ 99) |
| D18 | M7's parts for the twin legs | no: F16 | export `begin`, `coldCheck`, `twinsCheck`, `recordOf` (178 → ≤ 180); no behaviour changes |
| D19 | a control's count of authentication attempts | no: F19 | `login`'s `before` and `after` gain `authAttempts` from `logCounts` (190 → ≤ 192) |
| D20 | the docblocks name the parser; a control with another twin | no: F17 | `resolvedBare`'s docblock: "how a client FROM 8.7 ON reads a bare word with a pair of apostrophes; a client before 8.7 keeps them, and the file at this path is then a file that the bare word does not name" (the parent's judge, row E3.S7); `controlBare`'s and `twinWriter`'s docblocks the same; `controlBare(ctx, server, folder, { twinOf = pr.resolvedBare } = {})`, the default as before |
| D21 | `MADE_OF` for the equals-sign legs | F18 | none: `M11.e0` checks the leg's own folder for `=` itself; `MADE_OF` is not changed (M7 and M12 keep their check as built) |

If the built rig differs from this table in a part that a leg relies on, the coder STOPS and tells the lead.

## 7. The test: `src/test/itestRowsOff.test.ts` (RED first)

Loads `scripts/lib/offRigRecord.cjs`, `lib/rowRecord.cjs`, `lib/sshdRun.cjs`, `lib/otherKeyRecord.cjs` and `lib/pathRecord.cjs` with
`createRequire` at run time, so it compiles before the lib exists; owned folders through `ownedDir`.

| # | Asserts |
|---|---|
| TX1 | `M10_LEGS` is `['m10']`; `M11_LEGS` holds the 29 names of §3, each once, in that order; its (b) runs are `m1`, `m2-mismatch-global` and every name of `pr.M7_LEGS` whose `run` is not a collision, in its order; no name holds `collision`; each leg has its `parser` (`older`, or `newer` for the two `m11-eq-newer-*`; `null` for (c), (d)); `M13_CASES` is a, b, c with the three separators of §1.5 |
| TX2 | `questionsOk(parser, calls, questions)`: older: ok for three calls each after one question that ended before its first run; not ok for one question and three calls, two questions before one call, a question that ended after its call's first run, an empty list. newer: ok for ONE question before the first of three calls; not ok for three |
| TX3 | `wordsOk(parser, argv)`: older: ok for the five pairs (made literals); not ok with `KnownHostsCommand=none`, without `LogLevel=ERROR`, with `VerifyHostKeyDNS=no` twice, with two known-hosts paths. newer: the six pairs, and not ok without `KnownHostsCommand=none` |
| TX4 | `answersAtOnce`, `neverAnswers`: the record lines equal the shim's; the `-V` branch prints the literal of §1.4 and exits 0, or is `exec sleep infinity`; the other branch is `exec <passthrough> "$@"`, shell-quoted. The product agrees: `pinClientOf(0, <the (c) stderr>)` is `{ kind: 'unreadable', exitCode: 0 }` |
| TX5 | `F_WORDS` and the two `how` literals against `pinClientSentence('box', null)` and `('box', 0)`; `toldF(said, from, prefix, sentence)` counts an error message equal to prefix + sentence, not a log line, not a warning, not another prefix |
| TX6 | `timesOk({ t0, tF, tGone })`: 10.0 s and 10.04 s ok; 9.99 s not; 15.01 s not; gone 5.01 s after F not; gone before F ok; a `null` not |
| TX7 | `resolvedOf(stdout)` reads CR LF and answers each list as its NAMES (split at white space); `oneIntended`; `k7Twin(folder)`; `UNC_WORDS`; `versionSeen(log, 'OpenSSH_8.4p1')` finds `remote software version OpenSSH_8.4p1` in a `debug1:` line and not in a line of another version |
| TX8 | `logCounts` of a made `DEBUG1` log equals that of the same log without its `debug` lines; a `debug1:` line with `Failed` or `authenticating user` is not counted |
| TX9 | `servingConfig(RUN, parts)` with no `logLevel` is byte for byte the text of `0e54081f` (a literal of the test); with `DEBUG1` one `LogLevel` line at the same place; `TRACE` throws |
| TX10 | `knownHostsLineOf(port, pub)` as before; with a host, `[<host>]:<port> <type> <base64>` |
| TX11 | `parserOf([major, minor])`: `older` for 8.4 and 8.6, `newer` for 8.7 and 10.2, `null` for `undefined`; `PARSER_SINCE` of the lib equals `TOKENISER_SINCE` of `pinnedArgv.ts` (one boundary in two places, held equal) |
| TX12 | `BARE` is the table of §1.3, frozen: `BARE.older.pair` `itself`, `BARE.newer.pair` `stripped`, `BARE.older.equals` `split`, `BARE.newer.equals` `itself`; `collisionOf(parser, kind)` is true only for (`newer`, `pair`) and (`older`, `equals`); no function of the lib takes an outcome to choose a parser (the exports are listed) |
| TX13 | `splitAtEquals('/a/b/data=prod/keys/k')` is `['/a/b/data', 'prod/keys/k']`; it throws for a path with no `=`, with two, or with white space; `twinOfEquals` answers the first name; `pr.resolvedBare` answers as before |

**RED.** Before the lib and the changes: compile (exit 0), run the file: TX1 to TX7 and TX11 to TX13 fail on `…/scripts/lib/offRigRecord.cjs
does not exist`, TX8 on the counted `debug1:` line, TX9 on `TRACE` not throwing, TX10 on the host not in the line. Save the output; any
other text is a stop.

## 8. The proving runs

The stories document: a proving run passes no row and never goes into §10; its numbers are "seen when it was built". CI runs none of
them (it runs test 34 on its own client, the newer parser).

1. **Local, three times each,** on the last code commit, from that tree (`git status --porcelain --untracked-files=no` empty): `m10`
   (after the image of §1.2), `m11`, `unit-older`, and `m13` (with the owner's word, §10). Each output is saved outside the tree. Read in
   each: exit 0; the last line with 0 FAIL; every leg process ended with 0; each `evidence` line with the four counts; the record's R1 and
   R2. Projected (not measured): `m10` about 2 minutes; `m11` about 15 minutes (29 legs; (d) at least 10 s each); `unit-older` about 1
   minute; `m13` under 1 minute.
2. **After each run:** no `/tmp` name of the run, no process of the run, `wslc list -a --no-trunc` holds no container of the run.

**If a proving run fails.** These places rest on facts that are read and not run, and are named before the first run:

- M10.c or M10.cq red (a harness fault if the zone, the name or the config is at fault), M10.3a red, or M11.v red in every leg (a fault
  of the launcher's option first; Q3): otherwise STOP, the lead (decision 18).
- M11.t2 or M11.t5 is red (the twin of (c) the other way round): the `-G` measurement of entry 3.2 does not hold for a login. STOP, the
  lead: the row cannot pass as written.
- Any check of the equals-sign pair is red where `-G` (M11.eG1, M11.eG2) was green, M11.e5 and M11.e5c above all: only `-G` was measured
  for this pair. STOP, the lead (the parent: "a leg of it that cannot run as written is told to the lead").
- Any other (b) check is red where its row passed on 10.2p1 (for example M7.c3's `Offending` line on 8.4): STOP, the lead, with the stderr.
- M11.d6 is red by time alone (F and the end were there): STOP, the lead. Do not change the margin or the limit.
- G4 is red on the older client for a written row (§5), or G5's older branch is red: STOP, the lead.
- M13.x4's bare half is not 255 on `ssh.exe`: K7's control does not show what it did in E1.S1. STOP, the lead.

## 9. Mutations and hand checks

**Mutations** (each alone, restored byte for byte, `git diff` empty after; none committed):

| # | Mutation | Red |
|---|---|---|
| MX1 | `M11_LEGS` gains `m11-m7-c-collision-k2` | TX1 |
| MX2 | `questionsOk` counts the older questions over the whole leg, not per call | TX2 |
| MX3 | `wordsOk('older')` accepts `KnownHostsCommand=none` | TX3 |
| MX4 | `answersAtOnce`'s `-V` branch prints `OpenSSH_10.2p1` at the start | TX4 (the product reads `knows`) |
| MX5 | `toldF` counts a log line | TX5 |
| MX6 | `timesOk` reads the margin as 15 s after F | TX6 |
| MX7 | `resolvedOf` keeps the CR | TX7 |
| MX8 | `logCounts` without the `debug` filter | TX8 |
| MX9 | `servingConfig` writes `LogLevel DEBUG1` after `LogLevel VERBOSE` | TX9 |
| MX10 | `knownHostsLineOf` ignores the host | TX10 |
| MX11 | `PARSER_SINCE` is `[8, 5]` | TX11 |
| MX12 | `BARE.older.pair` is `stripped` | TX12 |
| MX13 | `splitAtEquals` splits at the last `=` | TX13 |
| MX14 | `TOKENISER_SINCE` is `[8, 4]` (test 34) | P6; and with `unit-older`, G5 red (the newer branch runs on 8.4p1) |

**Hand checks** (the product made to do the wrong thing that a leg is about), each in a scratch worktree OUTSIDE the story's tree (`git
worktree add --detach <owned folder> <c1>`, `npm ci` and compile there; M10's container then mounts that worktree); R1 fails there, as it
must; recorded as hand checks in c2, never as results. The prediction is EXACT for the legs that the hand check runs (`--legs` where named):
the checks named red turn red, and every other check of those legs stays green. A wrong prediction is said plainly. Two hand checks share
mutated code with no leg (HC5 and HC8 both change `hostKeyPin.ts:226`): each is run alone, and its prediction names only its own legs.

| # | The product made to | Runs | Red | Green |
|---|---|---|---|---|
| HC1 | drop `VerifyHostKeyDNS=no` (`hostKeyPin.ts:275`) | `m10` | M10.1, M10.2, M10.3, M10.4, M10.5 (K2 is taken from DNS: the probe passes, the install runs through the stand-in on K2) | M10.0, M10.c, M10.cq, M10.0c, M10.3a, the leaving checks |
| HC2 | keep an `older` answer (`pinClient.ts:92`: `read.kind !== 'unreadable'`) | `m11 --legs` every older (b) leg | M1.8 and M1.9 in the six `m1Runs` legs; M11.q in `m11-m2-mismatch-global`, the five `m11-m7-*-m2-mismatch`, both twin legs and both `m11-eq-older-*` | the five switch legs whole (one call); M1.10, M11.w, M11.v everywhere; every other check |
| HC3 | treat `unreadable` as `older` (`pinOfCall.ts:61`) | `m11 --legs` the four (c), (d) legs | install legs: M11.x1, x2, x3, x4 (and M11.d6, d7 in `m11-d-install`); bridge legs: M11.x1, x2, x3, x4, x5 (and M11.d6, d7 in `m11-d-bridge`) | M11.x0, M11.x1p, M11.c6, the leaving checks |
| HC4 | the asker's limit is 120 s (`pinClient.ts:85`) | `m11 --legs` the two (d) legs | M11.x4, M11.d6, M11.d7 | M11.x0, x1, x1p, x2, x3, x5; the leaving checks |
| HC5 | a space is not quoted (`hostKeyPin.ts:226`: `/['=]/`) | `m13` | M13.a4's product-word half only (F11) | every other M13 check |
| HC6 | the rule does not refuse two backslashes (`doubleBackslash` → `() => false`) | `m13` | M13.u1, M13.u2, M13.u3 | M13.uc and every check of (a)-(c) |
| HC7 | write `KnownHostsCommand=none` for every client (`hostKeyPin.ts:272`: `true`) | `m11 --legs m11-a-unknown,m11-a-ignored` | M11.a0, M11.a2, M11.a2c, M11.v (`m11-a-ignored`: the client stops at the option and does not connect) | M11.p, M11.a1, M11.a1c, M11.a1w, M11.aw (their words are literal) |
| HC8 | an equals sign is not quoted (`hostKeyPin.ts:226`: `/[\s']/`) | `m11 --legs` the four `m11-eq-*` | M11.e0 (the word is bare) and M7.w in all four; `m11-eq-older-k1`: M11.e1, M11.e2 (the roads read the twin and the relative name, not the pin file); `m11-eq-older-k2`: M11.e3.1, M11.e3.2, M11.e4 and the stand-in guard (the roads read the twin, so K2 accepts them and the install runs to its end on K2) | M11.p, M11.eT, M11.eG1, M11.eG2, M11.q, M11.w, M11.v in all four; M11.e5, M11.e5c, M11.e5r; every check of the two newer legs but M11.e0 and M7.w (the newer parser reads the bare path whole) |
| HC9 | an apostrophe is not quoted (`hostKeyPin.ts:226`: `/[\s=]/`) | `m11 --legs m11-c-twin-k1,m11-c-twin-k2` | M7.w in both legs only: on this parser the bare pair names the pin file, so the hole is absent and no other check moves | every other check of both legs |

HC9 is the hand check that shows what the twin legs prove on the older parser: the absence of the hole, not a repair that closes it (the
parent's re-review record, its FIRST place). HC8's red for `m11-eq-older-k1` rests on F7 (`-G` only); a wrong prediction there is said
plainly and is no harness fault.

## 10. What needs the owner, and how M13's result comes back

- **The image rebuild (M10).** It downloads the base image by its tag and the Debian packages again; they can differ from S3.P2's
  (`deb12u10`). The lead asks the owner before the build (Q6).
- **M13.** It runs from WSL on the owner's machine (the only probed way, Q4). The owner gives the word that the run may start `ssh.exe -V`,
  `ssh.exe -G` and `where.exe ssh` of their Windows (no login, no network, nothing written there), and is logged on there while it runs
  (WSL's interop needs the session). It records every argv and answer of `ssh.exe`, the `-V` line, the `where.exe` answer, its SHA-256, R1
  and R2. The lead saves the output outside the tree; c2 carries the result, the user folder written as `C:\Users\<you>`.
- **Nothing else.** M11 and `unit-older` need no owner: the older client's packages are already in `~/.cache` (S3, D1, D2).

## 11. Break it: ways to pass while the defect stays, and what stops each

| # | The way | What stops it |
|---|---|---|
| BR1 | M10's roads ask no SSHFP because they never asked this resolver | M10.3a; M10.0's `getent` |
| BR2 | M10's control is accepted by K1's line, not by DNS | its pin holds K1's line and K2 answers; M10.ad (AD off: 255) |
| BR3 | M10's control carries a word that hides the hole | M10.c holds the argv to E1's six literal words (S3.L2) |
| BR4 | the image is not the committed file's | the tag names the file's blob; c2 records the build |
| BR5 | M11 (b) runs on the newer client by mistake | M11.0, M11.p and M11.v in every leg (the counterpart's log names the version), M1.8 and M11.q expect 3 questions |
| BR6 | three questions counted, but two in one call | `questionsOk` per call (TX2, MX2); HC2 |
| BR7 | (c), (d): "0 connections" because the program cannot connect | the passthrough to the real client; HC3 |
| BR8 | (d): the times read from the asker, not the command | `t0` is the click's `startedAt` |
| BR9 | (d): the program "gone" by name | pid and start time from its own record (M11.d7) |
| BR10 | sentence F equal to a wrong product text | F's pinned words and `how` literals (TX5) |
| BR11 | M13: two files read as one | K7's twin (M13.x4); HC5 |
| BR12 | M13: "no `ssh.exe`" judged by the script's own flow | `decidePinOfCall` with a counting asker (M13.u2); HC6 |
| BR13 | M13's words are not the product's | both builders with `await checkedPinOf(…, SSH_EXE)` |
| BR14 | `DEBUG1` or `ctx.expect` changes the rig's rows | TX8, TX9; section 10 passes as before (§12, step 3) |
| BR15 | (a1) "before it connects" because K2 was down | M11.a1w |
| BR16 | an expectation chosen by what the client did | `BARE` and `EXPECT` are constants by the version (TX11, TX12, MX11, MX12); M11.p reads `-V`, never an outcome |
| BR17 | the twin legs pass on the older client because the client found NEITHER file | the K1 leg's witness (M11.t2, M11.t2c): with the bare word K1 accepts |
| BR18 | the twin legs pass because the twin was written late or empty | M7.x0 per pin file; M11.tc for the control's twin |
| BR19 | the older equals control is accepted through a file at the relative second name | M11.e5r; the control's twin is checked before it starts |
| BR20 | test 34 passes on the older client by skipping | `parserOrFail()` fails an unread version; `unit-older` prints the pass and skip counts, and G5 and G6 are no skip |

## 12. Order of work, and the commits

1. `git status --short`. **The test** (§7) alone. Compile: exit 0. Run it: the REDs of §7. Save the output.
2. **The lib** (§1, §3), D4, D5, D6's lib part. TX1 to TX13 green; MX1 to MX13.
3. **D1 to D21, the row files, the entry.** `node --check` of every script; typecheck, lint, ratchet, `npm test`, `itestCallers`,
   `harnessSites`, `itestInstrument`, `itestRowRig` (RR6, RR7 read the new row files); the leftovers guard. **Section 10 runs as before**:
   `npm run itest:ssh-agent` with the two variables, the same count of `ok` lines as E3.S8's last run (1733) and 0 FAIL. `wc -l`.
4. **Test 34's RED** (§5): `unit-older` with `pinWords.test.ts` as it stands. Save the output.
5. **Test 34** (§5): `pinnedArgv.ts`, `pinWords.test.ts`. GREEN: `npm test`, then `unit-older`. MX14. Commit **c1**: `test(ssh): G1 E3.S9:
   M10, M11 and M13 off the rig, and test 34 (TX1-TX13)`. Body: the RED texts (§7 and §5), MX1 to MX14, the line counts, the counts of
   both unit runs, that no product file, no workflow, no `package.json` and no `Containerfile` changed, and section 10's count.
6. **The image** (§1.2), after the owner's word. **The proving runs** (§8) on c1; M13 with the owner's word. **The hand checks** (§9). A
   harness fault is repaired in a new commit (c1b, …), and the runs are made again on the last one.
7. **The documents** (§13). `plan-lifecycle.mjs` and `public-hygiene.mjs` from the root: clean. Commit **c2**: `docs(tests): G1 E3.S9:
   M10, M11, M13 and test 34 as seen when they were built`.

Stage by path; read `git diff --staged --stat` before each commit; do not push (the lead pushes).

## 13. The documents

`research/module_tests.md`, the G1 section (after E3.S8's paragraphs): (1) the table's rows for `itestRowsOff.test.ts` and for test 34
(P6, G4, G5, G6); (2) **The rows off the rig (E3.S9)**: the entry, where each row runs, the image and its tag, the two clients and their
parsers, the table of §1.3, `DEBUG1`, the programs, M13's way, `unit-older`; (3) **M10, M11, M13 and test 34, seen when they were built
(<date>, commit <sha>)**: NOT §10; per leg the four counts, each control and witness with its exit code, each leg's version line,
`info  M11.words`, (d)'s two times and what was shown, M13's `-G` lines, test 34's RED text, its counts on both clients and G6's records,
the identities, the hand checks as hand checks; home as `~`, the Windows user as `C:\Users\<you>`; (4) *Test leftovers*: the `off`
folder, the container, the image under its new tag.

## 14. Done when (each item can be counted)

- [ ] TX1 to TX13 were watched red with the texts of §7 and pass; MX1 to MX14 turned red what §9 names.
- [ ] G5 as E2 built it was watched RED with the older client first on `PATH`, with the text of §5; test 34 is GREEN with the newer client
      (`npm test`) and with the older one (`unit-older`); on both, G4 held every written row.
- [ ] Every leg of §2 and §3 and every check of §4 is built and runs through the committed instrument, from a tree with no modified tracked
      file; no M11 leg is a collision leg of M7.
- [ ] Three local proving runs of each of `m10`, `m11`, `unit-older`, `m13` on c1 (or its last repair): exit 0, no `FAIL`, every control
      and witness as its check says, every leg process ended with 0; the after-run checks print nothing. Or a STOP of §8, sent to the lead.
- [ ] Section 10 passes as before on c1 (no `expect`, no `logLevel`, no `real`).
- [ ] HC1 to HC9 each turned red exactly what §9 names (hand checks, in c2's body); a wrong prediction is said plainly.
- [ ] typecheck, lint, ratchet, `npm test`, the guards and the leftovers guard green; every script at most 800 lines, each inside its
      budget; no file of `src_vs_code/src` outside `src/test/` changed.
- [ ] `research/module_tests.md` holds §13's items; no home path, no user name, no private address in a committed text.

## 15. Opus review checklist

1. M10: the control first, with E1's three literal pairs only; accepted by K2 with the SSHFP question; the roads to a NAME; 0 SSHFP and at
   least one A after the mark; the image's tag tied to the committed file; the container removed by name on every path?
2. M11 (a): both configs; `Bad configuration option` before a connection; the refusal with the line; witnesses with literal words?
3. M11 (b) runs: every leg of M1, M2 (b) mismatch and M7's fifteen shape legs with ALL of its own checks, plus the older ones; the question
   per call; no `KnownHostsCommand` pair; `DEBUG1` does not change a count; no collision leg of M7?
4. The twin of (c): `-G` first, both spellings itself; the twin before each client; K1 accepts the bare witness, K2 refuses the bare control
   with 0 authentication attempts; the expectations constants of the older parser, not M7's with a switch?
5. The equals-sign pair: the twin written once before the world; `-G` per parser; on the older client K2 ACCEPTS the bare control and
   refuses the roads, and the relative second name names no file; on the newer client no collision, K1 accepts the bare words; the words of
   the result (decision 22)?
6. Each leg reads ITS client's version and takes that parser; an unread version is a FAIL, never a choice by outcome?
7. M11 (c), (d): one road per leg, cold; one `-V` start; 0 connections with a passthrough that could connect; sentence F compared twice;
   the two times from the click; the program gone by pid and start time?
8. M13: the product's builders and checked pin; the K7 twin; the UNC decision by `decidePinOfCall` with a counting asker; no `/dev/null`?
9. Test 34: one boundary (8.7) in the tests, held equal to the lib's; one branch by the version; G4 on both; the refused rows asserted on
   the newer parser and recorded on the older; RED watched with `unit-older`; no product file?
10. Each leg its own process, world, counterpart(s), key copy, folder and state; four counts in every evidence line; nothing left; section
    10 unchanged in behaviour (its count); the docblocks of `resolvedBare`, `controlBare` and `twinWriter` name the parser?

## What grows

| What | How much (projected) | Who retires it | When it is interrupted |
|---|---|---|---|
| the image `creds-itest-e3-resolver:<b>` | about 250 MB | the lead, `wslc rmi`, after E3's merge, with the old `:20261124` | not swept by the janitor (S3, F6) |
| the container of an `m10` run | none after the run | the host part, by exact name, `finally` and scope | `--rm`; a killed run: the lead removes it by its owned name |
| the `off` folder per run: 29 M11 leg folders, `oldssh` (about 6 MB), `programs` | under 25 MB | the section's scope | the janitor (token `creds`) |
| the `off` folder of `unit-older` (`oldssh`) and the child run's own folders | about 6 MB | the section's scope; the child's runner audits its own | the janitor (token `creds`) |
| (d)'s `sleep infinity` | one process per (d) leg, about 10 s | the runner's limit; the leg by pid and start time | the leg's scope ends it by pid and start time |

Nothing grows in the product.

## Notes for the lead

- **Links and rows.** The stories document already names this path (*Settled by the re-review for epoch 4*, item 8); its status line and
  `## E3.S9`, the parent's `## Epics`, E3, and `todo/README.md` are the lead's, in the commit that adds this spec.
- **Where L2 to L5 land.** L2: M10.c (§2). L3: M10.ad, a record (§2, D16). L4: §1.2. L5: M11.v in (a2) and every (b) leg (§1.3, D4), not
  `Match all` (Q3).
- **The judge's follow-ups for E3.S9** (the parent's re-review record): G5 and test 34 (§5); the docblocks of `resolvedBare` and
  `controlBare` (D20, with `twinWriter`); the equals-sign pair (§3.3).
- **Changed files of earlier stories:** those of D1 to D20 (§6). Each keeps its default behaviour; section 10's count shows it.
- **E3.S10** runs `itestOffRig.cjs` `m10`, `m11`, `m13` and `unit-older` on the same commit as the rig's run, from its fresh checkout, and
  reads M10, M11, M13 and test 34's older run from these outputs, with `info  M11.words` for the limits of decision 22.

## Questions for the lead

Q1 and Q2 of the cut spec are settled (above). Q3 to Q7 are the cut spec's, read again against the revised plan; Q8 to Q10 are new.

**Q3 · S3.L5's `DEBUG1`: the launcher's option, not `Match all`.** (Not a plan change in my reading; confirm.)
- S4's N1: a line that `servingConfig` writes changes only inside `Match all`. Read in `sshd` (not run): a `Match` block is applied when the
  user is known, after the banner exchange that logs `remote software version`, so `DEBUG1` there would not log the line.
- My reading: D4 (`LogLevel DEBUG1` IN PLACE of `VERBOSE`, the default byte for byte) and D5 (the counts drop `debug` lines).

**Q4 · M13 on the owner's Windows: from WSL, by S3.P5's way.** (Not a plan change in my reading; confirm.)
- Windows has no Node here, and the product's words need the compiled product. S3.P5 started the owner's `ssh.exe` from WSL; it worked.
- Not measured that way: the command line that Node on Windows builds from the argv; WSL's interop builds its own.
- My reading: M13 runs from WSL (§1.5). A native run would be a new instrument, not probed: decision 18.

**Q5 · M11 (a): "pinned to K1" with the product's words for this client.** (Not a plan change in my reading; confirm.)
- My reading: the subject is the product's answer for an older client, so its words are `hostKeyWords(await checkedPinOf(…))`; the
  witnesses use literal E1 words. M11.a0 pins that the words hold no `KnownHostsCommand`.

**Q6 · The image rebuild downloads again.** (Needs the owner; not a plan change in my reading.)
- S3.L4: rebuild from the committed file. The base tag is not a digest, and the packages can be newer than `deb12u10`.
- My reading: the owner's word before the build; the tag names the file's blob; c2 records the versions.

**Q7 · M11 (c): "no version at the start of its stderr".** (Not a plan change in my reading; confirm.)
- My reading: `not a version: OpenSSH_10.2p1` with exit 0: a version that is not at the start (F21), so the product reads `unreadable`
  with exit code 0, and sentence F says `exit code 0`.

**Q8 · Test 34 on the older client: a child run of the unit runner, started by `itestOffRig.cjs unit-older`.** (Not a plan change in my
reading; confirm.)
- The client lives in a folder that a run owns, so one entry unpacks it, puts it first on `PATH`, and runs `run-tests.mjs
  out/test/pinWords.test.js` as its child (§1.1). Read, not run: the child's sweep takes only folders of a KILLED run (F27). If the child
  touches the parent's `off` folder, the coder stops and tells the lead.

**Q9 · M11 (b), "fails the legs when it is not [below 8.7] or when it cannot be read".** (Not a plan change in my reading; confirm.)
- My reading: each leg's M11.p is a named FAIL and the leg goes on to its end (the lesson of E3.S7 and E3.S8: a failed check names itself,
  and its leg's evidence is still written); the entry's M11.0 fails the run too. No leg is skipped, so no leg passes in silence.

**Q10 · The newer legs of the equals-sign pair run in the `m11` entry, with the rig's client as their real client.** (Not a plan change
in my reading; confirm.)
- The row: "The same two legs run a second time with the newer client of the rig". My reading: in the local `m11` entry (CI does not run
  it), with `top.newer`, whose version M11.0n and M11.p read; E3.S10 reads both parsers from that one output.

## The answers (2026-11-25; none a plan change)

- **A3 (Q3), the lead:** accepted. `LogLevel DEBUG1` comes in through the launcher's option, in place of `VERBOSE`, and the counts drop
  `debug` lines; `Match all` is not used for it.
- **A4 (Q4), the lead after the question consultants (consult `689b4486`, solved):** accepted. M13 runs from the owner's WSL by S3.P5's
  way, with the product's own argv (`buildSshExecArgv`, `buildBridgeArgv`, M13.p) and K7's control. E3.S10 adds to the release-evidence
  limits of decision 22: "WSL interop built the Windows command line; native Windows Node (libuv) argument quoting is not measured".
- **A5 (Q5), the lead:** accepted. The leg under test uses the product's words for the older client; the witnesses use literal E1 words;
  M11.a0 pins that the words hold no `KnownHostsCommand`.
- **A6 (Q6):** the image rebuild downloads again, so the coder does not start it: the lead asks the owner first and tells the coder.
- **A7 (Q7), the lead:** accepted. The (c) program prints `not a version: OpenSSH_10.2p1` and ends with 0.
- **A8 (Q8), the lead:** accepted, with the stop as written: before test 34's child run, the coder checks by reading `run-tests.mjs` that
  its sweep takes only folders of a killed run, and after the run that the parent's `off` folder is whole; if not, STOP and tell the lead.
- **A9 (Q9), the lead:** accepted. M11.p is a named FAIL per leg, the leg runs to its end, and M11.0 fails the run too; no leg is skipped.
- **A10 (Q10), the lead:** accepted. The newer legs of the equals-sign pair run in the local `m11` entry with `top.newer`, and M11.0n and
  M11.p read its version.
