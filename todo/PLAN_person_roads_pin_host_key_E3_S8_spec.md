# PLAN — E3.S8 spec: what the person is told, as the call saw it (M5)

> Status: **spec, 2026-11-24, by Opus; not built.** Story E3.S8 of [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md)
> (its decisions 15, 16 and 18; §3.5, *The words as E2 built them*; §3.12 with part 4 (C19); C7; `## Epics`, E3: *The setup of every
> measurement*, the row M5 and *Info for M5 (a)*) and of its stories document [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md)
> (`## The rows: built story by story, measured once`, `## E3.S8`). It builds on the common rig as BUILT by E3.S4 to E3.S7
> (`scripts/itestRowRig.cjs` and the files below), on the serving launcher of E3.S2, and on the probes P4 and P6 of E3.S3. The parent, the
> stories document and `todo/README.md` do not name this file yet: the lead adds the links and the row (*Notes for the lead*). This file is
> promoted together with the parent.
>
> Scope: `src_vs_code/scripts` (three new files, two changed), one new test file in `src_vs_code/src/test`, and `research/module_tests.md`.
> No product file (`src_vs_code/src` outside `src/test/`), no workflow, no `package.json`. **Read on `8cf4b6ea`, 2026-11-24** (every
> `file:line` below is of that commit). Nothing was run for this spec: no `ssh`, no `sshd`. Opus writes this spec, a Sonnet coder builds it,
> Opus reviews it.

"The parent" is the plan linked above; M5, §3.5, §3.12, C7, C19, decision 15 and so on are the parent's. Names of earlier specs have a
prefix (`S4.`, `S5.`, `S6.`, `S7.`, `S3.P4`). This document's own names: the facts T1 to T22, the dependencies D1 to D10, the checks
M5.x (x is the leg's letter and a number), the tests TT1 to TT9, the mutations MT1 to MT8, the hand checks HC1 to HC6, the break-its BR1 to
BR14, and the questions Q1 to Q4. "A leg" is what the E3.S4 spec says: one scenario with its own folder, its own leg process, its own world,
its own key copy and its own counterpart(s). This document keeps no change ledger: a change of it is an entry in the parent
(`plan-change-control.md`). The parent's epoch 3 has ONE entry (3.1), so the next entry is the SECOND, and it stops the whole plan.

## What E3.S8 decides, in one paragraph

M5 is eleven legs on the rig: one per case (a) to (h), and for (b), (c) and (d) one more leg each, the same case on an UNPINNED entry,
because the row compares the text that a pinned entry shows with "the same text that the same case shows on an unpinned entry in the same
run". Each leg makes its case with the instruments that the stories document names: the serving launcher (a refused key: K2; a stopped
counterpart; a refused login), a handed client config (`LogLevel QUIET`; a jump host), a second `sshd` as the jump host (S3.P4), the
`sshd`'s forced command (S3.P6: a script that writes the verification line and then ends with 255, or runs the asked command to 0), and a
loopback listener of the leg process that never answers (d). Every leg is cold. What the person is shown is read from the world's `said`
(messages and log lines, in order), and compared with what the product's functions answer (`refusedHostKeySentence`,
`unnamedHostKeySentence`), and, beside that, with words and prefixes pinned in this spec that the function cannot satisfy if it is wrong
(the lesson of `S5.R.6b`). The two comparisons that span two legs (the unpinned twins of (b), (c), (d), and the control of (h), which is (g)
of the same run) run in section 10's process after the legs, from each leg's `evidence.json`.

| File | Change | Lines (budget) |
|---|---|---|
| `scripts/lib/toldRecord.cjs` (new) | pure: the table of the eleven legs; the pinned words and prefixes; the judge of what was told; the forced scripts' text; the jump config's text; the shown messages; the comparison of two legs; the control of (h); the lines that name a file | ≤ 200 |
| `scripts/itestRowTold.cjs` (new) | what the legs share: the leg's forced script, the silent listener, the jump config, the drive of the roads, the reading of the screen, the told checks, the leaving | ≤ 330 |
| `scripts/itestRowM5.cjs` (new) | `rowM5(check, top)`, `legs` (11 legs), and the two comparisons across legs | ≤ 380 |
| `src/test/itestRowsTold.test.ts` (new) | TT1 to TT9 | ≤ 320 |
| `scripts/itestRowRig.cjs` | D1: `ROW_FILES` gains M5 | 711 → ≤ 713 |
| `scripts/itestPinnedRoads.cjs` | D2: `pinnedLegs` calls `rowM5` after `rowM14` and before `devNullScan` | 568 → ≤ 571 |
| `research/module_tests.md` | M5 "seen when it was built" | — |

## Binding constraints

The binding constraints of the E3.S4 to E3.S7 specs hold here, word for word (no plan change; only `vscode` is a stand-in on the rows' roads;
through the committed instrument only; a run of the commit; the four counts apart; the guards green; exe + argv with a time limit, every
process ended by pid and start time; the person's `~/.ssh` never read or written; Node only, no Python; at most 800 lines per script; no
home path and no user name in a committed text; lowered priority, leg processes one at a time; no product code changes for a leg; every
source of trust or config made in the leg's folder; a control or a witness never takes its words from `hostKeyWords`). In addition:

- **The text is compared twice.** Where the stories document says to compare with the product's function, the check ALSO holds a pinned
  part: the words that only that sentence holds (`C_WORDS`, `D_WORDS`, §5.1), the bridge's two prefixes as literals of §3.5 and §3.12, and
  the absence of the words that only the OTHER sentence holds. So a product whose C and D were swapped, or whose sentence lost its point,
  is red although the shown text equals the function's answer.
- **A failed witness or control is a named FAIL, and the leg goes on to its end** (the leaving checks and the evidence line). A value not
  read is `null` in the evidence and fails its check; it is never read as "nothing was shown".
- **Each leg its own folder, key copy, world, process and counterpart(s).** No leg reuses a counterpart, a listener or a config of another.
  The comparisons across legs read only the evidence files, in section 10's process, after both legs ended.
- **The forced scripts and the jump config are written by the leg** into its own folder, from the pure lib's texts, before the counterpart
  starts. They go into the counterpart through `extra` of the serving launcher (the lead's answer Q4 of the stories document) and into the
  client through the handed config. No line opens with `ListenAddress `, `HostKey `, `AuthorizedKeysFile ` or `PidFile ` (test 33).
- **A check name holds no " — "** (`itestRowRig.cjs:676-678`).

## Facts read on `8cf4b6ea` that this spec uses

| # | Fact | How |
|---|---|---|
| T1 | **The tree.** `fix/g1-e3-release-gate` at `8cf4b6ea` (the review fixes of E3.S7), no modified tracked file. E3.S4 to E3.S7 are built; the last proving run of E3.S7: 1553 ok, 0 FAIL, 82 leg processes (`research/module_tests.md`, *M7, M12 and M14, seen when they were built*) | read |
| T2 | **The row.** M5, `todo/PLAN_person_roads_pin_host_key.md:1731`; its last column is quoted beside each check (§2 to §5). *Info for M5 (a)*: `:1779-1780` | read |
| T3 | **The two callers of `hostKeyTold`.** The install's probe, `agentCommands.ts:282-286` (`runRemote` answers `-1` where the runner has none, `:350`); the socket check's mode check, `:211-221`, which shows `told.bridge` as an error AND writes it as a log line. Both hand their run's exit code (C19, built by E3.S1) | read |
| T4 | **`hostKeyTold`** (`hostKeyPin.ts:397-402`): no pin or exit code 0, nothing; else `toldByText` (`:405-413`): no whole verification line, nothing; a line that names the call's pin file (`namesFile`, `:345`), C with the prefix `The bridge to "<name>" is not open: `; else D with `The bridge to "<name>" could not be checked: ` | read |
| T5 | **The sentences.** C: `refusedHostKeySentence`, `hostKeyPin.ts:427-429`; D: `unnamedHostKeySentence`, `:443-445`. C holds `did not present its saved host key, so CredsForDevs did not connect`; D holds `and ssh did not name the saved host key of this entry as the reason`; neither holds the other's words | read |
| T6 | **What the install shows without a sentence:** a run that timed out, `"<name>" did not answer within 20 seconds …` (warning, `agentCommands.ts:287-291`); a probe with no answer, `Cannot install on "<name>": the host did not answer the probe, so nothing is known about it yet.` (warning, `:293-296`; `remoteCliInstall.ts:84`) | read |
| T7 | **The bridge.** `bridges.start` (`agentCommands.ts:455`), then `void verifyBridgeSocket` (`:468`), then the info `Bridge open to "<name>". Open an SSH session there, …` with the button `Copy the setup block` (`:474-477`; the world
records a message with a button in `asked` too, `personRoadsWorld.ts:237-240`). The check first runs the sweep (`:208`, 15 s), waits 1.5 s (`:210`), then the mode check (15 s, `:211-215`). The bridge's `ssh` has no stdio (`bridgeSpawner.ts:79`) | read |
| T8 | **C7's line.** An empty answer of the mode check is `unreadable` (`sshBridge.ts:314-320`) and is a log line only: `<socket path> is there, but its mode could not be read on that host` (`agentCommands.ts:233-235`) | read |
| T9 | **The time limits of a run.** The probe 20 s (`agentCommands.ts:282`), the sweep and the mode check 15 s each; every argv says `ConnectTimeout=10` (`sshExecCommand.ts:222`, `sshBridge.ts:180`). Whether `ConnectTimeout` also bounds the wait for the server's first line on OpenSSH 10.2p1 is read (OpenSSH's `sshconnect.c` hands it to the banner exchange), not run | read |
| T10 | **The world's record.** `said` holds every message and every log line in the order shown, with `kind` (`info`, `warning`, `error`, `pick`, `log`) and `at` (`personRoadsWorld.ts:37-39`, `:236`, `:395`); `asked` every question with buttons (`:239`); `ended` every bridge that ended by itself (`:225`); the entry's name is `box`, its key `a1:e1` (`:212-213`). `replaceHostKey(undefined)` makes the entry unpinned from the next read (`:172`; M4 (a) uses it, `itestRowM4.cjs:81`) | read |
| T11 | **The rig.** `counterpart` `itestRowRig.cjs:143`, `endCounterpart` `:164`, `openRoads` `:296`, `press` `:361`, `pressNow` `:364`, `mark` `:371`, `markOf` `:380`, `countsOf` `:405`, `pinFileOf` `:443`, `handConfig` `:453`, `viaReal` `:460`, `controlClient` `:503`, `callsOf` `:511`, `listeningNow` `:586`, `nothingLeft` `:599`, `evidence` `:636`, `ROW_FILES` `:654-658`; exports `:697-701` (with `tool`, `within`, `alive`, `me`, `sec`, `standIn`) | read |
| T12 | **The leg's own files.** `legRig` writes the leg's `authorized_keys` (the person's key copy and the stored key, `itestRowRig.cjs:60`) and its handed config (`:59`); the serving launcher reads `rig.authorizedKeys` (`itestServing.cjs:23`), and `sshd` reads that file at each login | read |
| T13 | **The shared helpers of E3.S6.** `itestRowOtherKey.cjs`: `writePin` `:28`, `logsArrived` `:111`, `connectionStarts` `:117`, `bridgeStderrOf` `:104`, `standInGuard` `:144`, `login` `:155`, `wordsOf` `:164`, `stderrFilesCheck` `:176`, `sha256` `:19`, `standing` `:22`. `lib/otherKeyRecord.cjs`: `VERIFY_FAILED` `:20`, `knownHostsLineOf` `:34`, `e1WordsFor` `:43` (the three pairs, literal), `hasLine` `:95`, `refusedRoads` `:103` | read |
| T14 | **The shared helpers of E3.S5 and E3.S7.** `dismissAll` (`itestRowRefused.cjs:23`); `printedBySsh` and `offendingNames` (`lib/pathRecord.cjs:72`, `:83`: a whole line `Offending <type> key in <name as ssh prints it>:<n>`) | read |
| T15 | **The serving config.** `servingConfig` (`lib/sshdRun.cjs:108-126`): `LogLevel VERBOSE` (so `Connection from …` is logged), then the run's lines, then `extra`. `logCounts` (`lib/rowRecord.cjs:74-89`) reads `connections`, `authAttempts`, `accepted` with the session kind (`none` for a `-N` login) | read |
| T16 | **The handed config.** `handedClientConfig(dir, { lines })` (`lib/rowRecord.cjs:131-138`) writes ONE `Host *` block; `lines` stand inside it after its five lines. The shim hands it with `-F` (`itestPinnedRoads.cjs:135-153`) | read |
| T17 | **S3.P4 (worked).** A jump config as `itestProbeJump.cjs:24-47`: `Host jump` (HostName, Port, User, IdentityFile, `IdentitiesOnly yes`, `BatchMode yes`, `StrictHostKeyChecking yes`, `UserKnownHostsFile <jump file>`, `GlobalKnownHostsFile /dev/null`), then `Host 127.0.0.1` with `ProxyJump jump`, then `Host *`. The nested client read the handed config and refused J by the jump file (P4.1); with J's own line it passed (P4.2) | read |
| T18 | **The nested client is not a start of the shim.** OpenSSH starts the nested client of a `ProxyJump` by its own absolute path, not through `PATH` (S3, *Notes for the row stories*, P4.3's cause). It passes `-F <path>` UNQUOTED into the command it builds (`bridged-ssh-itest.cjs:84`), so the handed config's path must hold no white space | read |
| T19 | **S3.P6 (worked).** `ForceCommand <script>` through `extra`; `zero.sh` = the line to stderr, then `exec "$SHELL" -c "$SSH_ORIGINAL_COMMAND"`: exit 0 and the asked command ran whole; `fail.sh` = the line, then `exit 255` (`itestProbeForced.cjs:17-27`). A `-N` login opens no session, so the forced command does not run for the bridge, and its forward is made | read |
| T20 | **The stand-in of the install** (S3.P1): `installStandIn(rig, nonce)` answers `extra` = `SetEnv PATH=<standin>/bin:…` (`itestProbeInstall.cjs:39-57`) | read |
| T21 | **The guards.** RR6 forbids `startServingSshd(`, `stopListener(`, `endServer(`, `.world(`, `launch(` in a file named `itestRow*.cjs` (not the rig); RR7 forbids `sshExecAuth` and `pinClient'` (`src/test/itestRowRig.test.ts:227-247`). A `net.createServer` is used by other scripts (`itestNoSharing.cjs:400`) | read |
| T22 | **Section 10's order** (`pinnedLegs`, `itestPinnedRoads.cjs:501-537`): legs 1, 2, 0, `rowsTop`, the proof, M1, M6, M4, M9, M2, M3, M8, M7, M12, M14, `devNullScan`, the record of identities | read |

## Commands

As the E3.S4 spec's *Commands* (in `src_vs_code`, `LP=../.agents/conventions/tools/low-priority.mjs`): compile (read its exit first), one
suite through `scripts/run-tests.mjs`, typecheck, lint, ratchet, `npm test`, `node --check scripts/<file>.cjs`, the proving run
`CREDS_ITEST_SSHD="$HOME/.cache/creds-itest-sshd/sshd-wrap.sh" CREDS_ITEST_SSHD_CONFIG="$HOME/.cache/creds-itest-sshd/extra.conf" npm run itest:ssh-agent`,
and from the root the leftovers guard, `plan-lifecycle.mjs` and `public-hygiene.mjs`.

## 1. The decisions

### 1.1 The eleven legs

Every leg is **cold** (a new world in a new process, decision 15) and uses `credential: 'named'` (the person's key copy, named by its path).
Every leg's world gets `answer: dismissAll`: no question is answered, so no install run starts in any leg. The table is `M5_LEGS` of the
lib (TT1), in the order that section 10 runs them.

| Leg | Pinned | The entry's port points at | The case is made by |
|---|---|---|---|
| `m5-a` | K1 | K2 | the serving launcher: K2's host key |
| `m5-e` | K1 | K2 | as (a), and the handed config's `lines: ['LogLevel QUIET']` (`rig.handConfig`) |
| `m5-f` | K1 | D (K1) through J | a second counterpart J with a host key KJ that the leg makes; the jump config (§1.4); the jump file holds K2's line for J's port |
| `m5-g` | K1 | K1 | `extra`: `ForceCommand <leg>/forced/fail.sh` and the stand-in's line |
| `m5-h` | K1 | K1 | `extra`: `ForceCommand <leg>/forced/zero.sh` and the stand-in's line |
| `m5-b` | K1 | a stopped K1 | the counterpart is started and ended BEFORE the world opens; its port stays |
| `m5-b-unpinned` | none | a stopped K1 | as `m5-b`, the entry unpinned (`replaceHostKey(undefined)` after `openRoads`) |
| `m5-c` | K1 | K1 | the leg's `authorized_keys` is written again BEFORE the counterpart starts, with the stored key's `.pub` alone: the call's key is refused |
| `m5-c-unpinned` | none | K1 | as `m5-c`, unpinned |
| `m5-d` | K1 | the silent listener | §1.3 |
| `m5-d-unpinned` | none | the silent listener | as `m5-d`, unpinned |

In (g) and (h) the two scripts differ in their last line only (TT4), and the two counterparts' `extra` differ in the script's name only, so
(g) is the control of (h) with one thing changed: the exit code. The stand-in's line is there so that a run of the install command, if a
defect started one, cannot reach the real installer through `zero.sh`.

### 1.2 What the screen shows, read twice

`toldOf(said, words)` of the lib (TT3) reads the world's `said` after the mark and answers, per sentence, how often it stands as the INSTALL's
message (a message of any kind, not a log line, whose text equals the sentence), as the BRIDGE's message (an `error` whose text equals the
prefix and the sentence), as a log line, and how often any message or log line holds the sentence's pinned words or a bridge prefix
(`C_WORDS`, `D_WORDS`, `NOT_OPEN`, `NOT_CHECKED`, §5.1). `words` is `{ c, d }`, read in the leg from `refusedHostKeySentence('box')` and
`unnamedHostKeySentence('box')`. A check that asks "sentence C once" asks ALL of: the count of the product's text is 1, that text holds
`C_WORDS`, and nothing after the mark holds `D_WORDS`. A check that asks "0 times" asks that nothing after the mark (message or log)
equals or holds the product's text, the pinned words, or the prefix. `shownOf(said, from)` is the messages after the mark (`kind` and
`text`, in order, log lines left out); `logsOf` the log lines.

### 1.3 The silent listener (d)

`silentListener(leg)` of the shared file: a `net.createServer` of the leg process on `127.0.0.1`, port 0 (the system's free port). For each
connection it records `{ at, remotePort, bytesIn }`, writes NOTHING, and keeps the socket open; it never ends a socket itself. Its close
(every socket destroyed, then the server closed) is registered with `leg.scope.after` at once. The entry's port is the listener's. So the
TCP connection is made, and no SSH answer comes: each run ends by the client's `ConnectTimeout` (T9) or by the runner's limit, whichever
is first; the leg records which (§2.6), and its checks do not depend on it. Only the loopback is used. See Q1.

### 1.4 The jump config (f)

`jumpConfig(dir, { jumpPort, user, identityFile, jumpKnownHosts })` of the lib (TT5) is S3.P4's text (T17): `Host jump` with its nine lines,
`Host 127.0.0.1` with `ProxyJump jump`, and then `handedClientConfig(dir)` (the rows' own `Host *` block, unchanged). It throws on white space
in `dir` or in a path it writes (T18). The leg writes it to `leg.clientConfig` before its world opens and before any start (as
`handConfig`), and the jump file `<leg>/jump_known_hosts` (mode 0600) with K2's line for `[127.0.0.1]:<J's port>` (`knownHostsLineOf`).
KJ is made by the leg with `rig.tool('ssh-keygen', …)` into `<leg>/kj_key`. J is `rig.counterpart(check, leg, 'j', <leg>/kj_key)`; D is
`rig.counterpart(check, leg, 'd', leg.k1)`. J signs nobody in during the roads: it is refused before authentication.

### 1.5 The drive

`driveTold(ctx, roads, { bridgeEnds })` (shared file): *Install creds on host* (`press`, 45 s), then *Open Remote Bridge…* (`press`, 30 s);
then, when `bridgeEnds`, a wait for the bridge's `ssh` to end (`roads.w.ended` holds the entry and it is not open; 20 s); then a wait for the
mode check's run to have an outcome (`sec.runOf(roads, modeCheckCommand({ path: <the bridge's remote> }))`, 50 s); then 2 s for the
messages and the logs. It answers `{ install, bridge, bridgeAt, bridgeEnded, modeRan, times }`, `bridgeAt` being the time (`performance.now()`,
the clock of `said`) when the bridge's click started, and `times` each run's start and end (the outcomes'
`startedAt`, `endedAt`) and the bridge's `spawnedAt` and `exitedAt`. `bridgeEnds` is true in (a), (e), (f), (b), (c), (d) and false in (g)
and (h), where the tunnel stays up. The limits are longer than E3.S6's (`driveRefusedRoads`) because in (d) a run can take up to 20 s.

### 1.6 The comparisons across two legs (section 10's process)

`rowM5(check, top)` runs the eleven legs with `rig.runLeg`, in the table's order, then reads `<top.dir>/<leg>/evidence.json` of the legs it
needs (a file that is not there, or does not parse, is `null`) and makes three checks of the row: M5.b9, M5.c9 and M5.d9 (§2.6) with
`sameShown(pinned.shown, unpinned.shown)` of the lib, and M5.hc (§2.5) with `controlOfH(g, h)` of the lib. Each runs whatever the legs
answered; a `null` fails it with the name of the missing file.

### 1.7 The evidence

`rig.evidence(leg, roads, servers, fields)`; the fields beside the rig's own: `case` (the letter), `pinned`, `shown` (`shownOf`, every
message after the mark, word for word), `logs` (`logsOf`; a socket path written `<socket>`), `told` (`toldOf`'s answer), `order` (`[{ kind,
at }]` of every message after the mark), `runs` (per run: kind, exit code, `timedOut`, the stderr cut at 4 kB), `bridge` (`{ exitCode,
ended, open, alive, socket, listening }` at the end of the drive), `forced` (`{ script, sha256, line }`), `jump` (`{ port, jumpFileSha256 }`),
`silent` (`{ accepted, bytesIn, bytesOut: 0 }`), `control` or `witness` (`{ argv, code, stdout, stderr }`), `c7` (the C7 lines). A value not
read is `null`.

## 2. The legs: `scripts/itestRowM5.cjs`

Each check is named `M5 m5-<x>: <words> (M5.<x><n>)`; the words hold the row's words that the check holds. Every pinned leg starts with
**M5.x0c** `cold: 0 runs of ssh -V and 0 starts of the client before the first click` (as M1.2). Every leg ends with the leaving checks
(§2.7).

### 2.1 (a) and (e): another key (`refusedKey(ctx, { quiet })`)

M5's words: "(a): the install shows sentence C once and not "did not answer the probe"; after *Open Remote Bridge…* no *bridged* row is left,
and exactly one error MESSAGE holds `The bridge to "<name>" is not open: ` and sentence C (a log line alone does not pass); the stderr of the
probe and of the mode check holds the `Offending` line with the pin file of that call; the order of the messages is recorded." "(e): as (a),
every item; the control: the control client with E1's words under the same config ends with 255 and an empty stderr." *Info for M5 (a)*:
"E3's reading of the screen counts both lines."

| # | Check | The row's words it holds |
|---|---|---|
| M5.e0 | (e) only, before the world opens: `ssh -G under the leg's config, with no word of a call, resolves loglevel QUIET` (`viaReal`, `-G -p <K2's port> <user>@127.0.0.1`) | "the handed config says `LogLevel QUIET`" |
| M5.a1 / e1 | `the four runs that start each ended with 255 and the verification line: the probe, the bridge (its line from its own stderr file), the sweep and the mode check; no install run` (`ok.refusedRoads`) | (the case: a refused key) |
| M5.a2 / e2 | `the install showed sentence C once: one message equals the product's sentence C and holds its pinned words; no message holds D's words; no message holds "did not answer the probe"` | "the install shows sentence C once and not "did not answer the probe"" |
| M5.a3 / e3 | `after Open Remote Bridge… no bridged row is left: the bridge's ssh ended by itself and the manager holds no open bridge of the entry` | "no *bridged* row is left" |
| M5.a4 / e4 | `exactly one error message is "The bridge to "box" is not open: " and the product's sentence C, with C's pinned words; no message holds "could not be checked: "` (the log line of the same text is recorded, not counted) | "exactly one error MESSAGE holds … (a log line alone does not pass)" |
| M5.a5 / e5 | `the stderr of the probe and of the mode check each holds the Offending line of ssh with the pin file of its own call, as ssh prints it` (`offendingNames`; the file from that run's recorded argv with `valuesOf`, never from the product's match) | "the stderr of the probe and of the mode check holds the `Offending` line with the pin file of that call" |
| M5.a6 / e6 | `the screen showed "Bridge open to "box"." once after the bridge's click, beside the check's error` (an `info` that starts with the literal `Bridge open to "box".`) | *Info for M5 (a)*: "counts both lines" |
| M5.a7 / e7 | `K2 logged a connection for each connection start, 0 accepted logins and 0 authentication attempts` | (the case) |
| M5.ec | (e) only, after the counts: `the control: E1's words (literal, a file of K1's line for K2's port) under the same config ended with 255 and an empty stderr, and its words before -i are exactly those words` (`shared.login` with `ok.e1WordsFor(shared.writePin(…))`) | "the control client with E1's words under the same config ends with 255 and an empty stderr" |

An `info` line records the order: every message after the mark as `<kind> <the first 60 characters>` with its time (the row: "the order of
the messages is recorded"). The order is evidence, not a condition. **If M5.ec does not show an empty stderr, M5 (e) is not passed**: the
config was not quiet, so the leg could not have failed (the setup).

### 2.2 (f): a jump host whose key the jump file refuses (`hop(ctx)`)

M5's words: "(f): each run that starts ends with 255; the destination logs 0 connections; sentence C is shown 0 times; the install shows
sentence D once; exactly one error message holds `The bridge to "<name>" could not be checked: ` and sentence D; no *bridged* row is left; no
stderr holds a line with the pin file of its call."

| # | Check | The row's words it holds |
|---|---|---|
| M5.f0 | before the world opens: `under the leg's config ssh -G resolves proxyjump jump for <user>@127.0.0.1, and for jump: userknownhostsfile <leg>/jump_known_hosts and stricthostkeychecking true` | "the handed config sends the connection through a jump host of the run" |
| M5.f1 | `each run that starts ended with 255: exactly four connection starts (the probe, the bridge, the sweep, the mode check), each runner run and the bridge with 255; no install run` | "each run that starts ends with 255" (Q4) |
| M5.f2 | `the destination D logged 0 connections after the mark, and J logged a connection for each connection start and 0 authentication attempts` | "the destination logs 0 connections" |
| M5.f3 | `sentence C was shown 0 times: no message and no log line equals or holds the product's sentence C, C's pinned words or "is not open: "` | "sentence C is shown 0 times" |
| M5.f4 | `the install showed sentence D once: one message equals the product's sentence D and holds D's pinned words, and none holds C's` | "the install shows sentence D once" |
| M5.f5 | `exactly one error message is "The bridge to "box" could not be checked: " and the product's sentence D, with D's pinned words` | "exactly one error message holds … and sentence D" |
| M5.f6 | `no bridged row is left` (as M5.a3) | "no *bridged* row is left" |
| M5.f7 | `no stderr holds a line with the pin file of its call: the probe's, the sweep's and the mode check's (the runner's outcome) and the bridge's (its stderr file), the file as written and as ssh prints it; and the probe's stderr holds the Offending line of <leg>/jump_known_hosts` (`pinLines`; `offendingNames`) | "no stderr holds a line with the pin file of its call" |
| M5.fw | after the counts, **the route witness**: `with J's own line in the jump file, the control client (E1's literal words of a file of K1's line for D's port) through the same config ended with 0, and D and J each logged one more accepted login` | (the route works, so "0 connections" at D comes from the refusal of J's key) |

The second half of M5.f7 is the harness's own reading (BR5): if the destination's key had been refused, the `Offending` line would name the
pin file, and the first half is red; if no hop was refused, the second half is red.

### 2.3 (g): the remote side writes the line and ends with 255 (`forced(ctx, 'fail')`)

M5's words: "(g): K1 logs the logins as accepted; the probe and the mode check each ended with 255 (recorded); sentence C is shown 0 times;
the install shows sentence D once; exactly one error message holds `The bridge to "<name>" could not be checked: ` and sentence D, and the
*bridged* row stays (the tunnel is up)."

| # | Check | The row's words it holds |
|---|---|---|
| M5.g0 | `K1's config holds ForceCommand <leg>/forced/fail.sh, and the script's SHA-256 is that of the lib's text` | "(here: the `sshd`'s forced command)" |
| M5.g1 | `K1 logged the logins as accepted: exactly 4 accepted logins after the mark, one per connection start (the probe, the bridge, the sweep, the mode check), 3 with a session and 1 with none; no install run` | "K1 logs the logins as accepted" |
| M5.g2 | `the probe, the sweep and the mode check each ended with 255, and the stderr of each holds the verification line as a whole line and no Offending line` (the codes and the texts recorded) | "the probe and the mode check each ended with 255 (recorded)" |
| M5.g3 | `sentence C was shown 0 times` (as M5.f3) | "sentence C is shown 0 times" |
| M5.g4 | `the install showed sentence D once` (as M5.f4) | "the install shows sentence D once" |
| M5.g5 | `exactly one error message is "The bridge to "box" could not be checked: " and sentence D` (as M5.f5) | "exactly one error message holds …" |
| M5.g6 | `the bridged row stays: after that message the manager holds the entry's bridge open, its ssh is alive by its recorded pid and start time, and its forwarded socket exists and something listens on it (ss -lx)` | "the *bridged* row stays (the tunnel is up)" |
| M5.g7 | `Close Remote Bridge ended the bridge's ssh within 5 s, by its recorded pid and start time` | (the leg leaves nothing) |
| M5.g8 | the stand-in guard (`shared.standInGuard`) | (the setup) |

### 2.4 (h): the remote side writes the line and runs the asked command to 0 (`forced(ctx, 'zero')`)

M5's words: "(h): K1 logs the logins as accepted; the probe and the mode check each ended with 0, and the stderr of each holds the
verification line (without that the leg could not have failed, and it is not passed); sentences C and D are shown 0 times on both roads; the
install reaches its question, the one that `confirmationFor` builds from the probe's answer; the socket check shows no error message and
reads the socket's mode, and the *bridged* row stays."

| # | Check | The row's words it holds |
|---|---|---|
| M5.h0 | as M5.g0, with `zero.sh` | "a forced command that writes the line and hands over to the original command" |
| M5.h1 | as M5.g1 | "K1 logs the logins as accepted" |
| M5.h2 | `the probe and the mode check each ended with 0, and the stderr of each holds the verification line as a whole line` (a missing line FAILs here, by name) | "each ended with 0, and the stderr of each holds the verification line (without that … it is not passed)" |
| M5.h3i | `the install road showed sentence C 0 times and sentence D 0 times: no message equals or holds either, their pinned words, or a bridge prefix` (messages of the install's click: before the bridge's click) | "sentences C and D are shown 0 times on both roads" |
| M5.h3b | `the bridge road and its socket check showed sentence C 0 times and sentence D 0 times, in a message or a log line` (after the bridge's click) | as above |
| M5.h4 | `the install reached its question: exactly one question was asked before the bridge's click, and it is the one that confirmationFor builds from the probe's answer; interpretProbe read an answer and blockerFor found nothing; no install run started (dismissed)` (the world records *Bridge open to …* as a question too, because it has a button, T7: so the questions are counted before `bridgeAt`) | "the install reaches its question, the one that `confirmationFor` builds from the probe's answer" |
| M5.h5 | `the socket check showed no error message, and the mode check's stdout, read by interpretSocketProbe, is a mode, owner only` | "the socket check shows no error message and reads the socket's mode" (Q3) |
| M5.h6 | as M5.g6 | "and the *bridged* row stays" |
| M5.h7, M5.h8 | as M5.g7, M5.g8 | (the leg leaves nothing; the setup) |

### 2.5 The control of (h): M5.hc (section 10's process)

M5's words: "The control of (h) is (g) of the same run: the same text with exit code 255 shows sentence D, so the text was read and the exit
code alone decided." **M5.hc** `the control of (h) is (g) of the same run: (g)'s probe and mode check ended with 255, (h)'s with 0; the
forced line of both is the same text; (g) showed sentence D on the install and in the bridge's form, (h) showed neither`
(`controlOfH(g, h)`, from the two evidence files; the line is `forced.line` of both, the codes from `runs`, the sentences from `told`). If
(g)'s evidence is missing or (g) showed no D, M5 (h) is not passed: the control did not show what the row says.

### 2.6 (b), (c) and (d): no key check is made, or the login is refused (`notReached(ctx, spec)`)

M5's words: "(b), (c), (d): sentences C and D are shown 0 times on both roads; what is shown is recorded word for word and is the same text
that the same case shows on an unpinned entry in the same run." The stories document: "Recorded for C7: the socket check's log line in (b)
and (c)."

| # | Check (in each of the six legs, `x` = b, c or d) | The row's words it holds |
|---|---|---|
| M5.x0 | (b) `before the first click nothing listens at the port: a connection to 127.0.0.1:<port> is refused`; (c) `K1's authorized_keys holds no key that the call offers`; (d) `the silent listener listens at 127.0.0.1:<port>` | (the case) |
| M5.x1 | pinned: `every connection start names ONE pin file in both known-hosts options and says StrictHostKeyChecking=yes`; unpinned: `every connection start says StrictHostKeyChecking=accept-new and names no known-hosts file, and no start is ssh -V` | (the two legs differ in the pin alone) |
| M5.x2 | `sentences C and D were shown 0 times on both roads: no message and no log line equals or holds either, their pinned words, or a bridge prefix` | "sentences C and D are shown 0 times on both roads" |
| M5.x3 | `what was shown is recorded word for word: at least one message after the mark, each in the evidence with its kind and text, in order` | "what is shown is recorded word for word" |
| M5.x4 | (b) `each connection start's run ended with 255 (the bridge too), and nothing answered`; (c) `K1 logged an authentication attempt for each connection start and 0 accepted logins: the key check passed and the login was refused`; (d) `the silent listener accepted a connection for each connection start and wrote 0 bytes; each run ended with 255 or by the runner's limit` | (the case is what the row names) |
| M5.x9 | **in section 10's process**, once per letter: `what the pinned leg showed is the same text that the unpinned leg showed: the same messages, kinds and order` (`sameShown`, from both evidence files) | "is the same text that the same case shows on an unpinned entry in the same run" (Q2) |

An `info` line per leg records the C7 lines (b), (c), and, as seen, (d) (`logsOf`, the socket path written `<socket>`), and in (d) for each
run whether it ended by itself and after how many ms. These are records, not conditions.

### 2.7 The leaving checks (every leg)

`shared.stderrFilesCheck` (A2); the bridge, if open, closed (`roads.w.bridges.dispose()`), so a defect that left it open does not redden a
check that is not about it; `rig.nothingLeft` (the closed list; no client alive; 0 files of these calls); each counterpart ended with
`rig.endCounterpart`; the silent listener closed and checked: `the silent listener is closed and holds no socket`; the evidence line.

## 3. The lib: `scripts/lib/toldRecord.cjs` (new, pure)

`'use strict'`, `node:path` and `node:crypto` only, reads nothing when it is loaded, imports `rowRecord.cjs` (for `handedClientConfig`) and
`otherKeyRecord.cjs` (for `VERIFY_FAILED`), and no module of the product.

| Export | Behaviour |
|---|---|
| `M5_LEGS` | the table of §1.1, frozen: `{ name, letter, pinned, target: 'k2' \| 'hop' \| 'forced' \| 'stopped' \| 'refusedLogin' \| 'silent', quiet?, script? }` |
| `C_WORDS`, `D_WORDS` | `did not present its saved host key, so CredsForDevs did not connect`; `and ssh did not name the saved host key of this entry as the reason` (literals of §3.5 and §3.12 as E2 built them, T5) |
| `NOT_OPEN(name)`, `NOT_CHECKED(name)` | `The bridge to "<name>" is not open: `; `The bridge to "<name>" could not be checked: ` (literals) |
| `toldOf(said, from, words, name)` | §1.2: `{ c: { install, bridge, log }, d: { … }, holds: { cWords, dWords, notOpen, notChecked } }`, counts over `said.slice(from)` |
| `shownOf(said, from)`, `logsOf(said, from, sockets)` | §1.2; `logsOf` writes each path of `sockets` as `<socket>` |
| `sameShown(a, b)` | `{ ok, diff }`: ok only when both are arrays, both are not empty, and each item's `kind` and `text` are equal in order |
| `forcedScript(kind)` | `zero` or `fail` (T19): `#!/bin/sh`, `printf '%s\n' 'Host key verification failed.' >&2`, then `exec "$SHELL" -c "$SSH_ORIGINAL_COMMAND"` or `exit 255`; any other kind throws |
| `jumpConfig(dir, parts)` | §1.4; throws on white space in a path |
| `pinLines(stderr, file)` | the lines of `stderr` (LF or CR LF) that hold `file` or its printed form (each `\` as `\\`) |
| `controlOfH(g, h)` | §2.5 over two evidence records: `{ ok, problems }`; a `null` record is a problem |

## 4. The shared file: `scripts/itestRowTold.cjs` (new)

Header: what the eleven legs share; that the shown text is compared with the product's functions AND with pinned words; that a failed
witness or control is a named FAIL. Imports the rig, the libs of E3.S4, E3.S6, E3.S7 and this story, `itestRowOtherKey.cjs` and
`itestRowRefused.cjs` (for `dismissAll`). Exports: `writeForced(leg, kind)` (writes `<leg>/forced/<kind>.sh` at mode 0700, answers
`{ file, sha256, extra }`), `silentListener(leg)` (§1.3; answers `{ port, connections, close }`), `writeJump(leg, jumpPort)` (§1.4; answers
`{ jumpFile, config, sha256 }`), `driveTold` (§1.5), `screenOf(ctx, roads)` (`toldOf`, `shownOf`, `logsOf` with the leg's words), the told
checks shared by several legs (`toldOnce(ctx, label, screen, which, id)`, `toldNever(ctx, label, screen, which, id, part)`,
`bridgeForm(ctx, label, screen, which, id)`), `bridgeStays(ctx, label, roads, id)` (M5.g6, M5.h6), `refusedPort(port)` (a `net.connect`
that answers `ECONNREFUSED` or not, 3 s), and `leave(ctx, roads, servers, fields, extras)` (§2.7). Each function under 50 lines. Like every
row file it holds none of the needles of RR6 and RR7 (T21).

## 5. Dependencies on the built rig (and what E3.S8 adds itself)

| # | What E3.S8 needs | Built? (file:line on `8cf4b6ea`) | What E3.S8 does |
|---|---|---|---|
| D1 | the leg process loads the row file | `ROW_FILES` has M1, M2, M3, M4, M6, M7, M8, M9, M12, M14, `rig` (`itestRowRig.cjs:654-658`) | add `M5` |
| D2 | section 10 runs the row | `pinnedLegs` (`itestPinnedRoads.cjs:501-537`) | `rowM5` after `rowM14`, before `devNullScan` (so the scan reads M5's argvs too) |
| D3 | counterparts with `extra`, the end of each | built: `counterpart` `:143`, `endCounterpart` `:164` | — |
| D4 | a world per leg, cold, its own answer of questions | built: `openRoads(leg, port, { credential, answer })` `:296`; `dismissAll` (T14) | — |
| D5 | an unpinned entry | built: `replaceHostKey(undefined)` (T10) | — |
| D6 | a handed config: `LogLevel QUIET`; a config with blocks before `Host *` | partly: `handConfig` `:453` writes one `Host *` block (T16) | (e) uses `handConfig`; (f) writes `jumpConfig`'s text to `leg.clientConfig` itself (§1.4) |
| D7 | the marks, the counts, the evidence, the closed list | built: `mark` `:371`, `countsOf` `:405`, `nothingLeft` `:599`, `evidence` `:636` | — |
| D8 | the judge of four refused runs, the bridge's stderr, the logins of a control, the stand-in guard, A2 | built: T13 | — |
| D9 | the `Offending` line as ssh prints it | built: T14 | — |
| D10 | the control client by its path under the leg's config | built: `viaReal` `:460`, `shared.login` (T13) | — |

If the built rig differs from this table in a part that a leg relies on, the coder STOPS and tells the lead (no silent change of the rig).

## 6. The test: `src/test/itestRowsTold.test.ts` (RED first)

Loads `scripts/lib/toldRecord.cjs` with `createRequire` at run time (as `itestRowsPaths.test.ts`), so it compiles before the lib exists;
owned folders through `ownedDir` of `scripts/lib/leftovers.cjs`.

| # | Asserts |
|---|---|
| TT1 | `M5_LEGS` holds exactly the eleven names of §1.1, each once, in that order; `pinned` is false for the three `-unpinned` legs alone; each unpinned leg comes right after its pinned twin and has its letter and target; `script` is `fail` for (g) and `zero` for (h) alone; `quiet` for (e) alone |
| TT2 | **The product agrees with the pins** (the test, not the leg, may read the product): `refusedHostKeySentence('box')` holds `C_WORDS` and not `D_WORDS`; `unnamedHostKeySentence('box')` holds `D_WORDS` and not `C_WORDS`; `hostKeyTold` with a pin, a stderr of the verification line and an `Offending` line of the pin's file, exit 255, answers a `bridge` that starts with `NOT_OPEN('box')`; with the line alone, `NOT_CHECKED('box')`; with exit 0, nothing |
| TT3 | `toldOf` on made `said` lists: C as one error counts `c.install` 1 and not `c.bridge`; `NOT_OPEN` + C as an error counts `c.bridge` 1; the same text as a log line counts `c.log` 1 and `c.bridge` 0 (a log line alone does not pass); a text with `C_WORDS` and another tail counts `holds.cWords` 1 and `c.install` 0; items before `from` are not counted |
| TT4 | `forcedScript('zero')` and `('fail')`: four lines each, the first three equal (`#!/bin/sh`, the `printf` of `VERIFY_FAILED` to stderr), the last `exec "$SHELL" -c "$SSH_ORIGINAL_COMMAND"` and `exit 255`; an unknown kind throws |
| TT5 | `jumpConfig`: `Host jump` first with its nine lines (the given port, user, key file and jump file), then `Host 127.0.0.1` with `ProxyJump jump`, then exactly `handedClientConfig(dir)`; a `dir` or a path with a space throws |
| TT6 | `shownOf` leaves out the log lines and keeps kinds and order; `sameShown`: equal lists ok; one word changed, one kind changed, the order changed, one list empty, or a `null`: not ok, with the first difference in `diff` |
| TT7 | `pinLines`: finds a line that holds the file, a CR LF line, and a line with the file's backslash doubled; finds none for another file or a file that is a prefix of a longer name |
| TT8 | `controlOfH`: ok for a made pair as §2.5; not ok, each with its problem, for a `null` g, g's mode check with 0, g without D on the install, h that showed D, h's probe with 255, two different forced lines |
| TT9 | skipped where no `ssh` is on `PATH` (as PT9): in an owned folder, `ssh -G -F <jumpConfig file> -p 1 <user>@127.0.0.1` resolves `proxyjump jump`; `ssh -G -F <file> jump` resolves `userknownhostsfile <the jump file>` and `stricthostkeychecking true`; `ssh -G -F <handedClientConfig with LogLevel QUIET>` resolves `loglevel QUIET` |

**RED.** Before the lib: compile (exit 0), run the file: TT1 to TT8 fail on `…/scripts/lib/toldRecord.cjs does not exist`, and TT9 the same
(or skips where no `ssh` is on `PATH`). Save the output; any other text is a stop.

## 7. The proving runs

The stories document: a proving run passes no row and goes into §10 never; its numbers are "seen when it was built".

1. **Local, three times in a row,** on the last code commit, from that tree (`git status --porcelain --untracked-files=no` empty), with the
   proving command, each output saved outside the tree. Read in each: exit 0, no `FAIL`; every leg of §1.1 ended with 0; per leg its
   `evidence` line; M5.ec, M5.fw, M5.hc and M5.b9, M5.c9, M5.d9 as their checks say; M12.z with `n > 0` (it now reads M5's argvs too); R1 to
   R9. The time of the script: projected about four minutes more than E3.S7's run (eleven legs; (d) and its twin up to about one minute
   each; not measured).
2. **After each run:** the after-run checks of S4.§9 (no `/tmp` name of the run, no process of the run, no socket of a bridge that is live).
3. **CI** (the lead's): `itest:ssh-agent` green on the head sha, on the runner's `/usr/sbin/sshd`.

**If a proving run fails.** Five places are named here before the first run, because they rest on facts that are read and not measured:

- M5.f0 or M5.fw is red: the jump config does not route through J on the roads (S3.P4 ran it with one client, not through a road). A
  harness fault if the config's text or path is at fault (T18); otherwise STOP, the lead (decision 18: (f) cannot run as written).
- M5.f7's second half is red while M5.f1 is green: the outer client did not pass the nested client's lines on. STOP, the lead.
- M5.h2 is red because the stderr holds no line: `sshd` did not run `zero.sh` for a road's run as it did for S3.P6. STOP, the lead.
- M5.ec is red: the client prints something under `LogLevel QUIET` with E1's words. That is what the parent says (e)'s control must not
  do: STOP, the lead (decision 18).
- (d): a run that the runner's limit ended (no `ConnectTimeout` at the banner, T9) is no fault; the checks hold either way. A bridge that
  does not end by itself in (d) is a fault of this spec (`bridgeEnds` is true there): the leg records it, closes the bridge, and the coder
  tells the lead before a repair.

## 8. Mutations and hand checks

**Mutations** (each restored, its output saved):

| # | Mutation | Red | Needs an `sshd` |
|---|---|---|---|
| MT1 | `M5_LEGS` without `m5-d-unpinned` | TT1 | no |
| MT2 | `C_WORDS` is D's words | TT2 | no |
| MT3 | `toldOf` counts a log line as the bridge's message | TT3 | no |
| MT4 | `forcedScript('zero')` ends with `exit 0` in place of the `exec` | TT4 | no |
| MT5 | `jumpConfig` puts `handedClientConfig` first | TT5 (and TT9 where `ssh` is there) | no |
| MT6 | `sameShown` compares only the first item | TT6 | no |
| MT7 | `controlOfH` does not read h's sentences | TT8 | no |
| MT8 | the silent listener writes one line (`SSH-2.0-x`) to each connection | M5.d4 in `m5-d` and `m5-d-unpinned` (0 bytes written), in a proving run; the rest of (d) is not predicted and is recorded as seen | yes (scratch worktree) |

**Hand checks** (the product made to do the wrong thing that a leg is about), each in a scratch worktree OUTSIDE the story's tree, as S4.§12
says (R1 fails there, as it must; recorded as hand checks in c2, never as results). The prediction is EXACT for the eleven legs and M5's
three row checks: the checks named red turn red, and every other check of them stays green. Outside M5 the table names every red that this
spec reads in the checks that share the changed code; any other red that is seen is listed in the record as a wrong prediction.

| # | The product made to | Red in M5 | Green in M5 | Red outside M5 |
|---|---|---|---|---|
| HC1 | ignore the exit code (`hostKeyPin.ts:398`: `if (pin === undefined) {`) | `m5-h`: M5.h3i, M5.h3b, M5.h4, M5.h5; M5.hc | every other check of `m5-h` (M5.h2 reads the run, M5.h6 the bridge, which stays) and of the other ten legs; M5.b9, M5.c9, M5.d9 | none (every other row's pinned runs that hold the line end with 255) |
| HC2 | tell C for every verification line (`hostKeyPin.ts:409`: `if (true) {`) | `m5-f`: M5.f3, M5.f4, M5.f5; `m5-g`: M5.g3, M5.g4, M5.g5; M5.hc ((g) showed C) | M5.f1, f2, f6, f7, fw; M5.g1, g2, g6 to g8; every check of (a), (e), (h), (b), (c), (d) | none (every other refused key holds its `Offending` line) |
| HC3 | never tell C (`hostKeyPin.ts:409`: `if (false) {`) | `m5-a`: M5.a2, M5.a4; `m5-e`: M5.e2, M5.e4 | M5.a1, a3, a5 to a7, M5.e0, e1, e3, e5 to e7, M5.ec (the harness's own reading of the `Offending` line, BR5); every other leg; the three row checks | section 10 leg 2: its check `the install showed sentence C once …`, `the bridge's check showed its message …` and `no message and no log line said sentence D …`; the rig's proof RP1: `the second call, after the pin was replaced: …`; M7.c1 and M7.c2 in `m7-{a,b,c,d,e}-m2-mismatch` |
| HC4 | the install's caller hands `-1` (`agentCommands.ts:283`: `facts.exitCode` → `-1`) | `m5-h`: M5.h3i, M5.h4; M5.hc | M5.h3b, M5.h5 (the socket check hands its own code); every other check of M5 | none |
| HC5 | the socket check's caller hands `null` (`agentCommands.ts:216`: `outcome.exitCode` → `null`) | `m5-h`: M5.h3b, M5.h5; M5.hc | M5.h3i, M5.h4; every other check of M5 | none |
| HC6 | tell D for a pinned run with no verification line (`hostKeyPin.ts:406-408`: the first `if` answers `{ install: unnamedHostKeySentence(name), bridge: NOT_CHECKED + D }`) | `m5-b`, `m5-c`, `m5-d`: M5.b2, M5.c2, M5.d2; M5.b9, M5.c9, M5.d9 | M5.x0, x1, x3, x4 of the six legs; every check of the three unpinned legs (no pin, nothing told); every check of (a), (e), (f), (g), (h) | `m6-password-installs`: M6.12 (the probe's refused password login is told D in place of the `Cannot install` warning) |

HC4 and HC5 may share one run (their reds in M5 do not overlap, and M5.hc is named in both: the record says which shared); HC2 and HC3
likewise. HC1 and HC6 each alone.

## 9. Break it: ways to pass while the defect stays, and what stops each

| # | The way | What stops it |
|---|---|---|
| BR1 | C and D swapped in the product: the shown text still equals "the product's sentence C" | the pinned `C_WORDS` and `D_WORDS` beside the product's text (§1.2); TT2 holds the product to the pins |
| BR2 | a log line of the right text passes as the bridge's message | `toldOf` counts `error` messages for the bridge and log lines apart (TT3, MT3); M5.a4 |
| BR3 | the bridge's form with the wrong opening | the prefixes are literals of the lib, not read from `hostKeyTold` (TT2 holds the product to them) |
| BR4 | "0 times" passes because the text was cut or reworded | "0 times" also asks the pinned words and both prefixes in every message and log line |
| BR5 | the product's match decides what the leg expects | M5.a5 and M5.f7 read the `Offending` lines with the harness's own printing, from the run's own argv |
| BR6 | (b)-(d) compare a leg with itself, or two empty lists | `sameShown` needs two non-empty lists from two files; M5.x1 shows that one leg was pinned and the other was not; M5.x3 |
| BR7 | (c) refused before the key check, so the pin was never asked | M5.c4: K1 logged an authentication attempt for each connection start |
| BR8 | (d) an address that answers | M5.d4: 0 bytes written; MT8 |
| BR9 | (f) 0 connections at D because the route never worked | M5.fw, after the counts; M5.f0 |
| BR10 | (f) the destination's key refused, not the hop's | M5.f7: no line with the pin file, and the `Offending` line names the jump file |
| BR11 | (h) passes without the line in the stderr | M5.h2 FAILs by name; M5.hc |
| BR12 | (h)'s control is from another run or another script | M5.hc reads (g) of this run, and the two forced lines must be one text (TT4: the scripts differ in the last line alone) |
| BR13 | (e) quiet passes because the config was never read | M5.e0 (`ssh -G` says `QUIET`) and M5.ec (an empty stderr with E1's words) |
| BR14 | the bridged row "stays" because the manager was never told | M5.g6 and M5.h6 also ask the live process and a listening socket |

## 10. What is NOT measured by E3.S8

- **No row passes.** These are proving runs; §10 is E3.S10's, on the final tree.
- **That the socket check READ the mode** in (h) is seen as no error and a mode in the run's stdout; a product that reads an owner-only
  mode says nothing (Q3).
- **A hop under a quiet config** (the parent, §3.12: no row with both).
- **A client that does not keep the word `LogLevel=ERROR`** (§3.12, *What stays open*); a client older than 8.5 (E3.S9).
- **Which limit ends a run in (d)** is recorded, not judged (T9).
- **The install run** in any leg: every question is dismissed; what the install's second run shows is M2's.
- **A login on Windows**, a root runner, another operating system.

## 11. The documents

`research/module_tests.md`, the G1 section (after E3.S7's paragraphs):

1. **The table:** a row for `itestRowsTold.test.ts` (TT1 to TT9, one sentence each); the row of `scripts/itestPinnedRoads.cjs`: its count
   of `ok` lines from the proving run, and that section 10 runs M5 after M14 and before the `/dev/null` scan.
2. **A paragraph `**M5 on the rig (E3.S8).**`**: the eleven legs (§1.1); the twofold reading of the screen (§1.2); the silent listener
   (§1.3); the jump config (§1.4); the forced scripts; the comparisons across legs (§1.6); what it does not prove (§10).
3. **`**M5, seen when it was built (<date>, commit <sha>).**`** NOT §10 of the plan; it passes no row. Per leg: the four counts (from the
   evidence lines), the messages word for word and in order, the told counts, the C7 lines, every control and witness with its exit code,
   in (d) which limit ended each run, the three runs' times, the hand checks as hand checks, and the CI run (the lead's). Home folder as `~`,
   user as `<user>`, the leg's folder as `<leg>`.
4. **The table of *Test leftovers*** (the row of `ssh-agent-itest.cjs`): the `pin` folder also holds one folder per leg of M5, with
   `forced/`, `kj_key`, `jump_known_hosts` and the counterparts `j` and `d` where the leg has them; the silent listener is a socket of the
   leg process and ends with it.

## 12. Order of work, and the commits

1. `git status --short`. **The test** (§6) alone. Compile: exit 0. Run it: the REDs of §6. Save the output.
2. **The lib** (§3). TT1 to TT9 green; MT1 to MT7.
3. **The shared file** (§4), **the row file** (§2), D1, D2. `node --check` of every script; typecheck, lint, ratchet, `npm test`;
   `itestCallers`, `harnessSites`, `itestInstrument`, `itestRowRig` (RR6 and RR7 now read two more row files); the leftovers guard.
   `wc -l` of every new and changed file. Commit **c1** (one commit: no commit holds a red test): `test(ssh): G1 E3.S8: M5 on the rig, what
   the person is told as the call saw it (TT1-TT9)`. Body: the RED texts, MT1 to MT7, the line counts, and that no product file, no
   workflow and no `package.json` changed.
4. **The proving runs** (§7, 1 and 2) on c1. **MT8 and the hand checks** (§8) in a scratch worktree. A harness fault that a run shows is
   repaired in a new commit (c1b, …), and the three runs are made again on the last one.
5. **The documents** (§11). `plan-lifecycle.mjs` and `public-hygiene.mjs` from the root: clean. Commit **c2**:
   `docs(tests): G1 E3.S8: M5 as seen when it was built`. Body: what was OBSERVED in the three runs, the hand checks as hand checks, the
   after-run checks.

Stage by path; read `git diff --staged --stat` before each commit; do not push (the lead pushes).

## 13. Done when (each item can be counted)

- [ ] TT1 to TT9 were watched red with the texts of §6 and pass; MT1 to MT8 turned red what §8 names.
- [ ] Every leg of §1.1 is built, runs in its own leg process with the real resolve and the real asker, through the committed instrument,
      and ran from a tree with no modified tracked file.
- [ ] Three local proving runs on c1 (or its last repair): exit 0, no `FAIL`, every check of §2 `ok`, M5.ec, M5.fw, M5.hc, M5.b9, M5.c9 and
      M5.d9 as their checks say, every leg process ended with 0, R1 to R9 `ok`; the after-run checks print nothing. The CI proving run on a
      head sha is green (the lead's box).
- [ ] HC1 to HC6 each turned red exactly what §8 names and left green what it names (hand checks, in c2's body); a wrong prediction is said
      plainly, as E3.S7's record does.
- [ ] typecheck, lint, ratchet, `npm test`, `itestCallers`, `harnessSites`, `itestInstrument`, `itestRowRig` and the leftovers guard green;
      every script at most 800 lines (`wc -l`), each new or grown file inside its budget.
- [ ] `research/module_tests.md` holds §11's items; no home path and no user name in a committed text.

## 14. Opus review checklist

1. Is every shown text compared with the product's function AND with the pinned words, with the other sentence's words absent?
2. Does a log line never pass for the bridge's message (M5.a4, TT3)? Are both prefixes literals?
3. (a), (e): sentence C once, not "did not answer the probe", no bridged row, the `Offending` lines by the harness's own reading,
   *Bridge open to …* counted, the order recorded? (e): `ssh -G` says `QUIET`, and the control with E1's literal words ends with 255 and an
   empty stderr?
4. (f): four outer starts with 255, D at 0 connections, J reached and not authenticated, D once, the D form of the bridge, no pin file in
   any stderr, the jump file's `Offending` line, and the route witness after the counts?
5. (g), (h): the forced scripts from the lib, one line apart; the logins accepted; (g) 255 and D; (h) 0 with the line (a missing line a
   named FAIL), no C and no D on either road, the question that `confirmationFor` builds, no error and a mode; the bridge alive in both?
   M5.hc from both evidence files?
6. (b), (c), (d): one leg pinned and its twin unpinned (M5.x1); 0 C and 0 D in messages and log lines; the shown text recorded and compared
   across the two files, non-empty; (c) authentication attempts at K1; (d) 0 bytes from the listener; C7 recorded?
7. Every leg in its own process, world, counterpart(s), key copy and folder? Each failed control or witness a named FAIL, the leg to its end?
8. The guards: RR6 and RR7 read the new row files and pass; every script ≤ 800 and inside its budget.
9. The documents: "seen when it was built", not §10; hand checks as hand checks; `~`, `<user>` and `<leg>`.

## What grows

| What | How much (projected) | Who retires it | When it is interrupted |
|---|---|---|---|
| one folder per leg (11): as the E3.S4 spec's leg folder, plus `forced/` (g, h), `kj_key`, `jump_known_hosts` and two counterpart folders (f) | about 60 kB per leg, under 1 MB per run | the section's scope removes the `pin` folder, pass or fail | the janitor (token `creds`) sweeps the owned folder |
| the silent listener and its sockets (d, two legs) | one server, a few sockets, in the leg process | the leg's scope; the end of the leg process | they end with the leg process (the rig's limit ends it by pid and start time) |
| the forwarded sockets of (g) and (h) | one each, at `/tmp/creds-<user>-<id>.sock` | the rig removes each by its exact path (`removeSocketsOf`) | as for every bridge of the rows |
| leg processes | 11 more per run, one at a time | `runLeg` waits for each; the limit ends it by pid and start time | as S4.*What grows* |

Nothing grows in the product.

## Notes for the lead

- **Links and rows.** The stories document (its status line and `## E3.S8`), the parent's `## Epics`, E3, and `todo/README.md` do not name
  this file. They are the lead's, in the commit that adds this spec.
- **Time.** Eleven legs, about four minutes more per run (projected, not measured), in CI too.
- **CI** is dispatched by the lead (§7, 3).
- **Changed files of earlier stories:** `itestRowRig.cjs` (one name in `ROW_FILES`) and `itestPinnedRoads.cjs` (one call). Neither changes
  what those stories measured. M12.z now also reads the argvs of M5's legs.
- **E3.S10** reads M5's results from the eleven evidence lines and the three row checks.

## Questions for the lead

**Q1 · M5 (d): "an address that does not answer inside the run's time limit".** (Not a plan change in my reading; confirm.)
- The parent, M5 (d); the stories document: "an address on the loopback that does not answer inside the run's time limit (the spec says how;
  no address outside this machine)".
- What is so: on the loopback a port with no listener answers at once (that is (b)). To drop the connection itself needs a firewall rule
  (root) or a socket that never accepts, and no instrument of this rig has either.
- My reading (§1.3): a listener of the leg process on `127.0.0.1` that accepts and never sends a byte: no SSH answer comes inside the run's
  limit. The client's `ConnectTimeout=10` (or the runner's limit) ends each run, and the leg records which. If the lead reads "does not
  answer" as "the TCP connection is never made", the instrument is not built and not known to work: decision 18.

**Q2 · M5 (b)-(d): "the same text that the same case shows on an unpinned entry in the same run".** (Not a plan change in my reading; confirm.)
- What is so: each leg has its own world, and a world's entry is pinned or not from its open. "The same run" can only be the same run of the
  script.
- My reading (§1.1, §1.6): one unpinned twin leg per letter, run right after the pinned leg, its own counterpart (or listener) in the same
  case; the comparison is of the MESSAGES shown (kind, text, order), not of the log lines: C7's line names the socket path of its own call,
  which differs by design. C7's lines are recorded in both legs.

**Q3 · M5 (h): "the socket check shows no error message and reads the socket's mode".** (Not a plan change in my reading; confirm.)
- What is so: for an owner-only mode the check says nothing (`agentCommands.ts:237-242`), so "reads the mode" has no sign of its own. A
  sign would need a mode that is not owner-only (the `sshd`'s `StreamLocalBindMask`), which makes a socket into this machine's broker that
  every local user can open; I did not take it.
- My reading (M5.h5): no error message, and the mode check's stdout is a mode, owner only. HC1 and HC5 show that M5.h5 turns red when the
  check stops at the line.

**Q4 · M5 (f): "each run that starts ends with 255".** (Not a plan change in my reading; confirm.)
- What is so (T18): the nested client of a `ProxyJump` is started by an absolute path, so the shim does not record it; decision 15 counts the
  shim's starts.
- My reading (M5.f1): the runs that start are the four connection starts that the shim records; that the nested client ran is seen in J's
  log (M5.f2) and in the jump file's `Offending` line (M5.f7).

## The answers (2026-11-24, the lead; none a plan change)

The consultants could not be asked: coai refused every call (its data folder was not found).

- **A1 (Q1):** accepted. (d) is a listener of the leg process on `127.0.0.1` that accepts and never sends a byte, so no SSH answer comes
  inside the run's limit. The leg records which limit ended each run (`ConnectTimeout` or the runner's) and the client's own stderr line,
  word for word, so the record shows what "does not answer" was here. No address outside this machine.
- **A2 (Q2):** accepted. "The same run" is the same run of the script: one unpinned twin leg per letter, in the same case, compared by the
  MESSAGES shown (kind, text, order). C7's log lines are recorded in both legs and not compared, because each names its own socket.
- **A3 (Q3):** accepted. Never widen `StreamLocalBindMask`. M5.h5 is: no error message, and the mode check's stdout is an owner-only mode;
  HC1 and HC5 must show that M5.h5 turns red when the check stops at the verification line.
- **A4 (Q4):** accepted. The runs that start are the four connection starts that the shim records (decision 15); the nested client is seen
  in J's log (M5.f2) and in the jump file's `Offending` line (M5.f7), as P4.3 found.
