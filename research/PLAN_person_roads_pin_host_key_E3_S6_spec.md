# PLAN — E3.S6 spec: another key is refused, whatever else would trust it (M2, M3, M8)

> Status: **IMPLEMENTED, 2026-11-27.** Story E3.S6 (spec) of G1: merged (#393, squash `fe9aee47`, and #394, `b152bf06`) and released in extension 1.24.0 on 2026-11-27 (release PR #395, squash `a63dee35`, tag `extension-v1.24.0` at `a63dee35`, published to the Marketplace the same day). The parent [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) records the release and the run on the release commit (§10.5).
>
> The status as it stood before the promotion, kept as it was written: **spec, 2026-11-24, by Opus; not built.** Story E3.S6 of [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md)
> (its decisions 15, 16 and 18; §3.5, §3.9, §3.10; `## Epics`, E3: *The setup of every measurement* and the rows M2, M3 and M8) and of its
> stories document [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md) (`## The rows: built story by story, measured
> once`, `## E3.S6`). It builds on the common rig as BUILT by E3.S4 and E3.S5 (`scripts/itestRowRig.cjs` and the files below), and on the
> instruments of E3.S2 (the stop of the listener alone) and E3.S3 (P1, the install's stand-in). The parent, the stories document and
> `todo/README.md` do not name this file yet: the lead adds the links and the row (*Notes for the lead*). This file is promoted together
> with the parent.
>
> Scope: `src_vs_code/scripts` (five new files, four changed), one new test file in `src_vs_code/src/test`, and `research/module_tests.md`.
> No product file (`src_vs_code/src` outside `src/test/`), no workflow, no `package.json`. **Read on `be47dd81`, 2026-11-24** (every
> `file:line` below is of that commit). Nothing was run for this spec: no `ssh`, no `sshd`. Opus writes this spec, a Sonnet coder builds it,
> Opus reviews it.

"The parent" is the plan linked above; M2, M3, M8, §3.9, decision 15 and so on are the parent's. "The stories document" is the E3 document.
Names of the E3.S4 spec and the E3.S5 spec have the prefix `S4.` and `S5.` (`S4.F23`, `S5.R.6b`). This document's own names: the facts H1 to
H22, the dependencies D1 to D14, the checks M2.x, M3.x and M8.x, the tests OT1 to OT8, the mutations MO1 to MO9, the hand checks HC1 to HC4,
the break-its BR1 to BR14, and the questions Q1 to Q3. "A leg" is what the E3.S4 spec says: one scenario with its own folder, its own leg
process, its own world and its own counterpart(s). This document keeps no change ledger: a change of it is an entry in the parent
(`plan-change-control.md`). The parent's epoch 3 has ONE entry (3.1), so the next entry is the SECOND, and it stops the whole plan.

## What E3.S6 decides, in one paragraph

M2, M3 and M8 are seven legs on the rig of E3.S4. In each leg the entry is pinned to one key and the host at the entry's address presents
ANOTHER key, which one more source of trust would accept: a known-hosts file that the client reads as the person's file or as the
system-wide one (M2), a live master connection that a call could ride (M3), or a `KnownHostsCommand` that prints the other key (M8). Each
source is made by the client config that the shim hands the real `ssh` (`-F`), never by the person's `~/.ssh`. The roads are the registered
commands with the REAL resolve, the real asker, the real runner and the real bridge spawner, as every row runs them. A leg judges the four
counts of decision 15 from the shim's record and the counterpart's log, the exit code and the verification line of EVERY run, the bridge's
included (its stderr is read through the shim, §1.4), and the absence of a forward (the bridge's remote socket, §1.5). Each leg also shows
that the source was really there and would have been taken: the control of its row where the row names one (M2 (b), M3 *the switch*, M8),
and a witness of the leg's own where it names none (M2 (a), M3 *the mismatch*). The controls and witnesses use words that this spec pins
from the plan (§3.9) or from the road's own recorded argv, never words read from the product's function under test.

| File | Change | Lines (budget) |
|---|---|---|
| `scripts/lib/otherKeyRecord.cjs` (new) | pure: the table of the seven legs; the words of E1 and of before E1; a known-hosts line from a `.pub`; the sessions of a log; the judge of the four runs; the recording command's text and the reading of its record | ≤ 200 |
| `scripts/itestRowOtherKey.cjs` (new) | what the three rows share: the handed config of a leg, `ssh -G` of it, the drive of the refused roads, the drive of the switch, the bridge's stderr, the forward's absence, the stand-in guard | ≤ 380 |
| `scripts/itestRowM2.cjs` (new) | `rowM2(check, top)`, `legs`: four legs | ≤ 220 |
| `scripts/itestRowM3.cjs` (new) | `rowM3(check, top)`, `legs`: two legs, with the master | ≤ 320 |
| `scripts/itestRowM8.cjs` (new) | `rowM8(check, top)`, `legs`: one leg, with the recording command | ≤ 180 |
| `src/test/itestRowsOtherKey.test.ts` (new) | OT1 to OT8 | ≤ 340 |
| `scripts/itestRowRig.cjs` | D1 `handConfig`; D3 the master (`masterOf`, `masterCheck`, its end); D6 `ROW_FILES` gains M2, M3, M8; D5 export `listeningNow` | 622 → ≤ 700 |
| `scripts/lib/rowRecord.cjs` | D1 `handedClientConfig(dir, options)`: an optional second parameter; with none, the five lines of today | 166 → ≤ 185 |
| `scripts/itestPinnedRoads.cjs` | D2 the shim keeps an IGNORED stderr in a file; `installShim(rig, real)` takes the real client as an optional parameter; `pinnedLegs` calls the three rows | 555 → ≤ 565 |
| `scripts/itestIdentities.cjs` | D13 `known_hosts_command` is a config text of the record; check R9 | 167 → ≤ 178 |
| `research/module_tests.md` | M2, M3 and M8 "seen when they were built"; the shim's stderr file; the master of a leg | — |

## Binding constraints

The binding constraints of the E3.S4 spec hold here, word for word (no plan change; only `vscode` is a stand-in on the rows' roads; through
the committed instrument only; a run of the commit; the four counts apart; the guards green; exe + argv with a time limit, every process
ended by pid and start time; the person's `~/.ssh` never read or written; Node only, no Python; at most 800 lines per script; no home path
and no user name in a committed text; lowered priority, leg processes one at a time). The constraints that the E3.S5 spec added hold too
(no product code changes for a leg; the new row files are inside the guards RR6 and RR7). In addition:

- **Every other source is made by the handed config, in the leg's own folder.** The file of M2 (a) lives in the leg's `home/.ssh/`, the file
  of M2 (b) in the leg's folder, the control path of M3 and the command of M8 in the leg's folder. No leg writes a path outside its folder.
- **A control or a witness never takes its words from `hostKeyWords`.** Its words are the literal words of §3.9 (E1's three pairs, or the two
  pairs of before E1) or the words that the road's own run sent, as the shim recorded them (§1.6). Its pin file is written by the lib from the
  key's `.pub` (`knownHostsLineOf`), not by the product. So a hand check of `hostKeyWords` cannot change a control (the lesson of `S5.R.6b`).
- **A control or a witness runs after the leg's counts, or before the leg's mark** (M8: "the control first"), so its login is never counted
  as a login of a road. It is the real client by its path, never the shim (`S4.§3.12`).
- **Every counterpart of these rows carries the install's stand-in** (`standIn.extra`). A defect that lets a call through would then run
  the stand-in installer, never the real one; the stand-in guard of every leg reads the marker and the listing (§1.8).
- **A check name holds no " — "** (the leg's `check` throws on one; `itestRowRig.cjs:587`).

## Facts read on `be47dd81` that this spec uses

| # | Fact | How |
|---|---|---|
| H1 | **The tree.** `fix/g1-e3-release-gate` at `be47dd81`, no modified tracked file. E3.S4 and E3.S5 are built and reviewed; their last proving run is 873 ok lines, 0 FAIL, 41 leg processes (`research/module_tests.md:2526`) | read |
| H2 | **The rows.** M2, M3 and M8, the rows of E3's table in `research/PLAN_person_roads_pin_host_key.md` (line numbers of the time of writing, 1728, 1729 and 1734, no longer hold); their last columns are quoted in §2 to §4 beside each check | read |
| H3 | **On a refused key four runs start** (the setup, change 1.1): the install returns after a refused probe (`agentCommands.ts:282-286`), so its install run does not start. The four are the probe, the bridge, the sweep and the mode check | read |
| H4 | **The bridge's `ssh` has no stdio.** `bridgeSpawner` spawns it with `stdio: 'ignore'` (`bridgeSpawner.ts:79`). The rig's recording spawner keeps its argv, its times and its exit code, not its stderr (`itestRowRig.cjs:261-272`). Section 10's leg 2 judges the bridge by "ended by itself" (`itestPinnedRoads.cjs:412`), M6.14 judges the runner's runs only (`itestRowM6.cjs:193`). So no built check has read the bridge's verification line | read |
| H5 | **What an ignored stdio is.** Node's `stdio: 'ignore'` opens `/dev/null` for that descriptor of the child (Node's `child_process` manual). So the shim, a `sh` script that the bridge's spawn starts, can tell an ignored stderr by `readlink /proc/$$/fd/2` = `/dev/null`. Read, not measured | read |
| H6 | **The shim** records the start (`set -C`, one `<records>/<pid>.argv` per start) and then becomes the real client by `exec <real> -F <client_config> "$@"` (`itestPinnedRoads.cjs:131-146`). Its pid IS the client's pid. `recordedStarts` reads only the files that end with `.argv` (`:158-163`) | read |
| H7 | **The first value wins.** `ssh` keeps the first value that it obtains for a keyword, the command line before the config (E1.S1's fact K9; the comment of `writeClientConfig`, `itestPinnedRoads.cjs:148-152`). So a line added after `UserKnownHostsFile /dev/null` in the handed config changes nothing: the rows' config (`rowRecord.cjs:130-136`) must be written with the leg's value IN PLACE of `/dev/null` | read |
| H8 | **`HOME` does not move the client's `~`** (S4.F23, measured): OpenSSH takes `~` from the password database. So the client's compiled-in default user file (`~/.ssh/known_hosts`) is in the person's real home, which no row may write. The only file that a leg can make the client read as the person's own is one that the handed config names as `UserKnownHostsFile` (Q1) | measured (S4) |
| H9 | **The holes, measured against a public `sshd`** (§3.9, 2026-11-17): a key that a file of `GlobalKnownHostsFile` lists is accepted with `StrictHostKeyChecking=yes` and `UserKnownHostsFile=<pin>` (row 1) and refused when `GlobalKnownHostsFile=<pin>` is added (row 2); a key that a config's `KnownHostsCommand` prints is accepted with the words of row 2 (row 3) and refused with `KnownHostsCommand=none` (row 4) | read |
| H10 | **G2.** `NO_CONNECTION_SHARING` is `-o ControlPath=none -o ControlMaster=no` (`sshExecCommand.ts:57`); every run carries it (`:228`), and the bridge too (`sshBridge.ts:181`). Its docblock (`sshExecCommand.ts:35-49`, measured 2026-11-17): with a master up, a call without the two options rides it, "and neither its own `-i` key nor its own pinned host key is used"; `ControlPath=none` alone is the protection | read |
| H11 | **The master and the listener-only stop**, proven by leg 0 (`itestListenerStop.cjs`; L0.1 to L0.9, `research/module_tests.md:2595`): a master through a handed config (`ControlMaster auto`, a control path in the owned folder, `ControlPersist 60`; `:25-37`), `stopListener` by its own pid (`itestServing.cjs:158-162`), the master answers `ssh -O check` (`MASTER`, `:22`), carries one more command, and K1 logs no second accepted login. **Not measured:** a log line that K1's session writes AFTER the listener-only stop. `launch` keeps appending the pipe's data to `stderr` (`itestSshd.cjs:45-47`) and `endChild` closes no stream (`:147-156`), and the session holds the pipe's write end; so the line should arrive (read, not run) | read |
| H12 | **A VERBOSE log** names a session as `Starting session: <kind> for <user> from 127.0.0.1 port <n> id <m>` (S4.F6) and names no remote socket forward (S4.F6; S4's note N2). A command through a master is a new session of the master's connection, so its line names the master's port and an `id` above 0 (expected from OpenSSH's `session.c`; not read here, not measured) | read |
| H13 | **`sshd` leaves the dead `-R` socket file** after the client of a bound bridge ends (`StreamLocalBindUnlink no`; measured in the proving runs of `0f8081b7`, the owner's answer A3 of the E3.S4 spec). The product names a fresh random path per bridge (`remoteSocketPath`, `sshBridge.ts:63-69`). So a bridge's path that does not exist after the bridge ended was never bound | measured (S4) |
| H14 | **The switch** is built and proven: `installAnswer(leg, { held: true })` (`itestRowRig.cjs:308-323`), `pressNow` (`:329-333`), `theSwitch(…, { stop: 'whole' \| 'listener' })` (`:392-405`), RP2 and RP3 (`itestRigProof.cjs:46-70`; seen `research/module_tests.md:2504`) | read |
| H15 | **The control client** (`controlClient`, `itestRowRig.cjs:418-423`) takes `words`; with none it reads E1's words from the product's `hostKeyWords` (`:420`). A hand check of `hostKeyWords` would then change the control, or make `e1Words` throw (`rowRecord.cjs:145-154`). So these rows hand it their own words | read |
| H16 | **The `KnownHostsCommand` path.** OpenSSH starts a subprocess after a `safe_path` check of its path unless its caller passes `SSH_SUBPROCESS_UNSAFE_PATH`; the owned folder is under `/tmp` (mode 1777), which `safe_path` refuses. That the `KnownHostsCommand` caller passes that flag is from memory of the OpenSSH source: not read here, not measured. The control of M8 shows it: a command that is refused prints `Unsafe KnownHostsCommand` on the control's stderr, and the control is then not accepted (§4.3) | not read, not measured |
| H17 | **The record of identities.** Config texts are the files named `sshd_config` and `client_config`, at every depth (`itestIdentities.cjs:20`, `:127`); a `tool.json` names a packaged program and R8 asks its `dpkg` version (`:160-163`), which a script of the run does not have | read |
| H18 | **The stand-in's `SetEnv PATH=<standin>/bin:…`** (`itestProbeInstall.cjs:39-58`) gives the stand-in `PATH` to a session of its own connection (P1, M1.16). For a second session of one connection (a session through a master) it is read in `sshd_config(5)` ("SetEnv … for sessions"), not measured. The witness and the control of M3 print the remote `PATH`, so the proving run measures it (§3.6) before HC4 runs | read |
| H19 | **The rows' handed config** is written once by `legRig` in section 10's process (`itestRowRig.cjs:58`), and the shim reads that file at each start (`-F`, H6). So a leg may write it again in its own process, before its world opens and before any start | read |
| H20 | **The guards read the new files.** RR6 and RR7 scan every `itestRow*.cjs` but the rig, and the proof (`itestRowRig.test.ts:220-222`) | read |
| H21 | **The person's `~/.ssh/known_hosts`** is compared before and after section 10 (`itestPinnedRoads.cjs`, `livePinnedRoads`, the closing check) | read |
| H22 | **Section 10's order** (`pinnedLegs`, `itestPinnedRoads.cjs:497-524`): legs 1, 2, 0, then `rowsTop`, the proof, M1, M6, M4, M9, then the record of identities | read |

## Commands

As the E3.S4 spec's *Commands* (in `src_vs_code`, `LP=../.agents/conventions/tools/low-priority.mjs`): compile (read its exit first), one
suite through `scripts/run-tests.mjs`, typecheck, lint, ratchet, `npm test`, `node --check scripts/<file>.cjs`, the proving run
`CREDS_ITEST_SSHD="$HOME/.cache/creds-itest-sshd/sshd-wrap.sh" CREDS_ITEST_SSHD_CONFIG="$HOME/.cache/creds-itest-sshd/extra.conf" npm run itest:ssh-agent`,
and from the root the leftovers guard, `plan-lifecycle.mjs` and `public-hygiene.mjs`.

## 1. The decisions

### 1.1 The legs

Seven legs, each its own leg process (`rig.runLeg`), its own world, its own counterpart(s), its own key copy and its own handed config. Each
is **cold**: a new world in a new process, so the first pinned call asks `ssh -V` once and the asker keeps the answer (decision 15; the
setup, *The state of the asker*). No row of E3.S6 counts the question, so no leg needs the warm state; the evidence says `cold` and records
the question. Each uses a key named by its path (`credential: 'named'`), as M1: the resolve writes no key file, and nothing of these rows is
about the credential. The table is `OTHER_KEY_LEGS` of `lib/otherKeyRecord.cjs` (OT1).

| Leg | Row | The entry is pinned to | The other source of trust | Counterparts, and how K2 is at the entry's address | Roads |
|---|---|---|---|---|---|
| `m2-mismatch-user` | M2 | K1 | (a) `.ssh/known_hosts` in the leg's HOME (`<leg>`, `home`) holds K2's line; the handed config names it `UserKnownHostsFile` | K2 alone, from the start, at a port of its own; the entry names that port | the three |
| `m2-mismatch-global` | M2 | K1 | (b) `<leg>/known_hosts_global` holds K2's line; the handed config names it `GlobalKnownHostsFile` | as above | the three |
| `m2-switch-user` | M2 | K1 | (a), as above | K1 at port P until the install's question is open; then K1 is ended WHOLE and K2 starts at P (`theSwitch`, `stop: 'whole'`) | the install |
| `m2-switch-global` | M2 | K1 | (b), as above | as above | the install |
| `m3-mismatch` | M3 | K2 (`replaceHostKey`, before the first click) | a master connection to K1 through the handed config | K1 alone, at its own port | the three |
| `m3-switch` | M3 | K1 | a master connection to K1 through the handed config | K1 at P; when the question is open, K1's LISTENER alone is ended (`stop: 'listener'`), its master's session stays, and K2 starts at P | the install |
| `m8` | M8 | K1 | the handed config names a `KnownHostsCommand` that prints K2's line and records its starts; `VerifyHostKeyDNS no` | K2 alone, at its own port | the three |

**How K2 takes K1's address in a switch.** `theSwitch` ends K1 (whole, or the listener alone) and then starts K2 through the rig's ONE call of
the serving launcher with `port: from.port` (`itestRowRig.cjs:402`); the launcher tries once more after 300 ms when the port is still held
(`itestServing.cjs:76-80`). K2 gets the same `extra` as K1 (the stand-in's line). **In a mismatch leg** "a second counterpart at the same
address" is the counterpart at the address that the entry names: K2 starts first and the world is opened with K2's port; the pin is K1's
saved text, so the pin file holds K1's line for that address. In `m3-mismatch` only K1 runs, and the entry's saved text is K2's.

**Why K2's line is written by the lib.** The other sources hold `[127.0.0.1]:<port> <type> <base64>`, made from the first two fields of K2's
`.pub` (`knownHostsLineOf`, as leg 0 writes K1's line, `itestListenerStop.cjs:27`). The product's `knownHostsLine` is not used for them: a
defect of it must not make a source that the client then refuses for another reason.

### 1.2 The handed config of a leg (D1)

`handedClientConfig(dir, options)` of the lib gains an optional second parameter `{ userKnownHosts, globalKnownHosts, lines }`. The two
values go IN PLACE of `/dev/null` (H7); `lines` are added inside the `Host *` block, after the five lines. With no options the text is
byte for byte the text of today (RR4 does not change). `handConfig(leg, options)` of the rig writes it to `leg.clientConfig` in the leg
process, before `openRoads` (H19), and answers the text's SHA-256 for the evidence. The record of identities hashes the file again at the
end of the run, at any depth (H17).

| Leg | `userKnownHosts` | `globalKnownHosts` | `lines` |
|---|---|---|---|
| `m2-*-user` | `.ssh/known_hosts` in the leg's HOME (`<leg>`, `home`) (folder `0700`, file `0600`) | `/dev/null` | none |
| `m2-*-global` | `/dev/null` | `<leg>/known_hosts_global` (`0600`) | none |
| `m3-*` | `/dev/null` | `/dev/null` | `ControlMaster auto`, `ControlPath <leg>/cm`, `ControlPersist 120` |
| `m8` | `/dev/null` | `/dev/null` | `KnownHostsCommand <leg>/khc/known_hosts_command`, `VerifyHostKeyDNS no` |

**The result says which file each is** (M2: "the result says which"). Before its first click an M2 leg asks the real client by its path
(never the shim): `ssh -F <leg config> -G -p <port> <user>@127.0.0.1`. Check M2.0 reads `userknownhostsfile` and `globalknownhostsfile` of
its answer and compares them with the leg's own paths of the table (not with anything the product says). The evidence names the role
(`user` or `global`), the path relative to the leg's folder, the file's SHA-256 and the value that `ssh -G` resolved. M8.0 does the same for
`knownhostscommand` and `verifyhostkeydns`. `ControlPersist 120`, not leg 0's 60: a switch leg holds a question, ends a listener and starts
K2 between the master's start and the control; the master ends with the leg's scope in any case (§1.7).

### 1.3 The words of the controls and the witnesses

All are literal or recorded, never read from `hostKeyWords` (H15). The lib answers them (OT3):

| Name | Words | Where they come from |
|---|---|---|
| `e1WordsFor(file)` | `-o StrictHostKeyChecking=yes -o UserKnownHostsFile=<file> -o GlobalKnownHostsFile=<file>` | §3.9 row 2; S4.F15 (E1's words as `f3e9887d` writes them) |
| `beforeE1WordsFor(file)` | `-o StrictHostKeyChecking=yes -o UserKnownHostsFile=<file>` | M2: "the two pairs of before E1 (no `GlobalKnownHostsFile`)"; §3.9 row 1 |
| `STRICT_ONLY` | `-o StrictHostKeyChecking=yes` | the witness of M2 (a): no known-hosts word, so the client reads its user file |
| `withFile(words, file)` | the recorded words of a road's run, with the value of `UserKnownHostsFile=` and of `GlobalKnownHostsFile=` replaced by `file`; it throws unless exactly one of each was replaced | M3: "the same pin words"; the road's own pin file is deleted at its call's end, so the control names a file of its own with the same line |
| `sharingWordsOf(argv)` | every `-o` word of `argv` that names `ControlPath` or `ControlMaster` | the check that a control or a witness has none of G2's two options |
| `G2_WORDS` | `ControlPath=none`, `ControlMaster=no` | literal, as `NEW_PAIRS` pins E2's values (`itestPinnedRoads.cjs:46`) |

The pin file of a control is `<leg>/pins/<name>` with the line of `knownHostsLineOf`. The leg folder holds no white space, so the words name
it bare; the lib checks that and throws on a path with white space or a quote.

### 1.4 The bridge's verification line: the shim keeps an ignored stderr (D2)

The rows ask "each of the four runs that start ends with exit code 255 and the verification line", and the bridge is one of the four (H3).
Its stderr goes nowhere (H4). The shim is the one place that stands between the product's spawn and the client, and it already records each
start (H6). One line is added before its `exec`:

```sh
if [ "$(readlink /proc/$$/fd/2)" = /dev/null ]; then exec 2>'<records>'/"$$".stderr; fi
```

- It acts only where the product gave the client NO stderr (H5). Every run of the runner has a pipe there and is not touched: the product
  reads the same stderr as before. The bridge's process, its argv, its environment and its exit code are what they were; only the bytes
  that went to `/dev/null` now go to a file of the run's owned folder. This is an instrument, as the shim's record is (Q2).
- `bridgeStderrOf(leg, start)` of the shared file reads `<records>/<pid>.stderr` for the bridge's recorded start (`kindOf` → `bridge`), or
  answers `null` when the file is not there. A `null` fails the judge (OT5); it is never read as "no line".
- `installShim(rig, real = realSsh(rig.shimDir))`: the real client becomes an optional parameter, so OT6 can install the shim over a
  stand-in client in an owned folder. Section 10 and the rig call it as today.

### 1.5 "0 forwards" and "no new forward": the bridge's socket (S4's note N2)

The counterpart's VERBOSE log names no remote socket forward (H12). The evidence is the bridge's remote socket path (`roads.bridges[i].remote`,
the recording spawner): after the bridge's `ssh` ended, the path does not exist (`isSocket`, `itestPinnedRoads.cjs:90`) and `ss -lx` lists
nothing at it (`listeningNow`, `itestRowRig.cjs:501`, exported by D5). A bound forward leaves its file (H13), and a forward that a master
holds is live while the master lives, so either way a forward that was made is seen. Where a master runs (M3), the socket is read while the
master is still up. A forward needs an accepted login, so the 0 authentication attempts of the same leg stand beside it; neither one is read
for the other.

### 1.6 The master of an M3 leg (D3)

- `masterOf(check, leg, port, pinFile)` (rig): the real client by its path, through `runClient` (`itestNoSharing.cjs:173`), with
  `e1WordsFor(pinFile)` (a file of K1's line for the port), `-i <leg's key copy> -o IdentitiesOnly=yes -o BatchMode=yes -N -f -p <port>
  <user>@127.0.0.1`, under the leg's config (§1.2, `m3-*`). Then `ssh -O check` until it ends with 0 (10 s), and its pid from
  `Master running (pid=<n>)` (leg 0's `MASTER`). Check: `<label>: a master connection to K1 is up: ssh -O check on the leg's control path
  ends with 0 and names its pid`. Its end is registered with the leg's scope at once, AFTER K1's counterpart, so it runs first: `ssh -O
  exit`, then the pid (only while its start time is the recorded one), then K1 and its session by `endCounterpart`.
- `masterCheck(leg)` (rig): one `ssh -O check` on the control path; answers `{ code, stderr }`.
- The master is no start of the shim and no road: it is in no count of the leg. The leg's mark is taken after it is up.

### 1.7 The order of a leg

**A mismatch leg** (`m2-mismatch-*`, `m3-mismatch`):
1. The stand-in (`standIn.installStandIn(leg, nonce)`), and the listing and the `/tmp` names before (`listingOf`, `tmpNames`).
2. The counterpart (K2 for M2, K1 for M3) with `extra: stand.extra`. The other source: M2 writes the file of (a) or (b) with K2's line for
   the counterpart's port; M3 writes nothing.
3. `handConfig` (§1.2). M2: M2.0. M3: `masterOf` with a pin file of K1 (M3.0).
4. `openRoads(leg, port, { credential: 'named', answer: installAnswer(leg) })`. M3: `w.replaceHostKey(<K2's saved text>)` (`keyText`,
   `itestRowRefused.cjs:26`). `mark(leg, roads, [server])`.
5. The drive of the refused roads (`driveRefusedRoads`): *Install creds on host* (30 s); *Open Remote Bridge…* (30 s); the bridge's `ssh`
   ended (15 s); the mode check ran (40 s). The install's question is ANSWERED when it is asked (`installAnswer`), so "no install run" can
   fail: a probe that passed would lead to the install run, through the stand-in.
6. The counts after the mark (`countsOf`), the bridge's stderr, the socket; the checks of the row.
7. After the counts: the control (M2 (b)) or the witness (M2 (a), M3).
8. The stand-in guard; `nothingLeft`; M3: the master's end; `endCounterpart`; `evidence` with the fields of §1.9.

**A switch leg** (`m2-switch-*`, `m3-switch`):
1. As above, with K1 and `extra: stand.extra`; M2 writes the file of (a) or (b) with K2's line for K1's port P; M3 starts the master.
2. `openRoads(leg, P, { credential: 'named', answer })` with `answer = installAnswer(leg, { held: true })`; `mark`.
3. `pressNow(install)`; the question is asked within 30 s and is held (check, as RP2).
4. `theSwitch(check, leg, k1, { name: 'k2', hostKey: leg.k2, extra: stand.extra, stop })`; a second mark of K1's and K2's logs (the switch
   mark). M3: `masterCheck` (M3.s2).
5. `answer.release()`; the click settles within 60 s. M3: `masterCheck` (M3.s4).
6. The counts, the checks; `World.said` after the release is recorded word for word.
7. After the counts: the control (M2 (b), M3) or the witness (M2 (a)), against what now listens at P.
8. As step 8 above, K2 ended before K1.

**M8:** K2 with the stand-in; the recording command (§4.1); `handConfig`; M8.0; THE CONTROL FIRST (§4.3); then `openRoads`, `mark` (the
command's record is counted from here); the drive of the refused roads; the counts and the checks; the stand-in guard; the end.

### 1.8 The stand-in guard (every leg)

`<label>: the stand-in: its marker was not written, and the listing of /usr/local/bin/creds and /tmp/creds-install.* is the same before and
after`. Labelled as the stand-in, not as a row's words (as S5's A.8), except in M2 *the switch*, whose row names the marker. A marker that was
written means a call got past the key check and ran the install through the stand-in: the leg fails there too, by its row's checks.

### 1.9 The evidence

`rig.evidence(leg, roads, servers, fields)` with these fields beside the rig's own (S4.§1.9): `scenario`, `source` (`{ role, path, sha256,
resolved }` for M2; `{ control: <path>, persist: 120, master: { pid, checks: [<code>…] } }` for M3; `{ command: <path>, sha256, records:
{ beforeMark, afterMark }, ppids }` for M8), `config` (the handed config's SHA-256), `bridgeStderr` (verbatim, or `null`), `socket` (`{ path,
existsAfter, listening }`), `control` or `witness` (`{ argv, code, stdout, stderr }`, the argv with no secret: it holds a path to the key
copy and no key), `installShown` (switch legs: `World.said` after the release), `switchMark` (switch legs). A value not read is `null`.

## 2. M2: `scripts/itestRowM2.cjs`

M2's last column: *"The mismatch,* for (a) and for (b): each of the four runs that start ends with exit code 255 and the verification line;
the record of the client's starts holds no install run; K2 logs 0 accepted logins, 0 authentication attempts and 0 forwards. *The switch,*
for (a) and for (b): K1 logged the probe as accepted; the install run starts once and ends with exit code 255 and the verification line; K2
logs 0 accepted logins and 0 authentication attempts; the stand-in's marker was not written; what the install shows is recorded word for
word. The control, in (b): the control client with the two pairs of before E1 (no `GlobalKnownHostsFile`) is accepted by K2."

### 2.1 The checks of every M2 leg

| # | Check (`M2 <leg>: …`) | The row's words it holds |
|---|---|---|
| M2.0 | `the client reads <path> as the person's known-hosts file (a)` or `… as the system-wide known-hosts file (b)`: `ssh -G` under the leg's config, with no word of a call, resolves `userknownhostsfile` and `globalknownhostsfile` to the two values of §1.2, and neither names a path outside the leg's folder or `/dev/null` | "(a) in the file that the client reads as the person's default one, (b) in the file that it reads as the system-wide one … the result says which" |

### 2.2 The mismatch (`m2-mismatch-user`, `m2-mismatch-global`)

| # | Check | The row's words it holds |
|---|---|---|
| M2.1 | `each of the four runs that start ended with exit code 255 and the verification line: exactly four connection starts (the probe, the bridge, the sweep, the mode check); the bridge's line read from its own stderr file` (`refusedRoads`, OT5) | "each of the four runs that start ends with exit code 255 and the verification line" |
| M2.2 | `the record of the client's starts holds no install run` (0 starts of the kind `install` after the mark) | "the record of the client's starts holds no install run" |
| M2.3 | `K2 logged a connection for each connection start, 0 accepted logins and 0 authentication attempts` (`logCounts` after the mark: `connections >= connectionStarts > 0`, `accepted.length === 0`, `authAttempts === 0`, no line matches `AUTH_ATTEMPT`) | "K2 logs 0 accepted logins, 0 authentication attempts" |
| M2.4 | `0 forwards: the bridge's remote socket was never made: after the bridge's ssh ended its path does not exist and nothing listens on it (ss -lx)` (§1.5) | "and 0 forwards" |
| M2.5 | the stand-in guard (§1.8) | (the setup, *The install's stand-in*) |
| M2.6 | **(b) only, the control** (after the counts): `the control client with the two pairs of before E1 (StrictHostKeyChecking=yes, UserKnownHostsFile=<a file of K1's line>, no GlobalKnownHostsFile) was accepted by K2: exit 0, and K2 logged one more accepted login, with a command session` | "The control, in (b): the control client with the two pairs of before E1 (no `GlobalKnownHostsFile`) is accepted by K2" |
| M2.7 | **(a) only, the witness** (after the counts; not M2's control): `the witness: the real client with StrictHostKeyChecking=yes and no known-hosts word was accepted by K2: exit 0, and K2 logged one more accepted login: the file of (a) is read and trusts K2` | (the leg could have failed: the source is there and taken) |

M2.6 also checks its own argv: the words before `-i` are exactly `beforeE1WordsFor(<file>)` (four words), and the argv names no
`GlobalKnownHostsFile`. M2.7: exactly `STRICT_ONLY`, and no `UserKnownHostsFile` and no `GlobalKnownHostsFile` word.

### 2.3 The switch (`m2-switch-user`, `m2-switch-global`)

| # | Check | The row's words it holds |
|---|---|---|
| M2.s1 | `the install reached its question, and it is held open` (and the rig's own check of the switch, `stop: whole`) | "K1 until the install's question is open, then K2 takes the address" |
| M2.s2 | `K1 logged the probe as accepted: exactly one accepted login, with a command session` (K1's whole log; the question `-V` is no connection) | "K1 logged the probe as accepted" |
| M2.s3 | `after the switch the install run started once and ended with exit code 255 and the verification line, and K2 logged a connection for it` | "the install run starts once and ends with exit code 255 and the verification line" |
| M2.s4 | `K2 logged 0 accepted logins and 0 authentication attempts` (K2's log up to the control's mark) | "K2 logs 0 accepted logins and 0 authentication attempts" |
| M2.s5 | `the stand-in's marker was not written` (and the listing, §1.8) | "the stand-in's marker was not written" |
| M2.s6 | `the install's click ended within 60 s after the answer, and what it showed was recorded word for word` (an `info` line with `World.said` after the release, as JSON; the evidence's `installShown`) | "what the install shows is recorded word for word" |
| M2.6 / M2.7 | as §2.2, against K2 at P, after the counts | the control in (b); the witness in (a) |

## 3. M3: `scripts/itestRowM3.cjs`

M3's last column: *"The mismatch:* each of the four runs that start ends with exit code 255 and the verification line; the record of the
client's starts holds no install run; after the master was set up, K1's log shows no new session, command or forward. *The switch:* the
master is alive directly before the question is answered and directly after the install run has ended (`ssh -O check` on the control path
ends with 0 both times); the install run starts once and ends with exit code 255 and the verification line; between the switch and the end
of that run K1's log shows no new session or command, and K2 logs 0 accepted logins. Then the control, AFTER the switch: the control client
with the same pin words and without G2's two options ends with 0, and K1's log shows one new command: the master was there to ride, and the
road did not ride it. Since epoch 3, said outright: if that control does not end with 0 through the master that survived, the row is NOT
passed."

**"A new session or command" in K1's log** is a `Starting session:` line of any kind (`command`, `shell`, `subsystem`, `forced-command`)
after the mark (`sessionsOf`, OT4), and "no new … login" beside it is 0 `Accepted` lines. A session through the master logs no `Accepted`
line (H11, H12), so the sessions are counted apart from the logins; one count never stands for the other.

### 3.1 The mismatch (`m3-mismatch`)

| # | Check (`M3 m3-mismatch: …`) | The row's words it holds |
|---|---|---|
| M3.0 | the master is up (§1.6) | "a master connection to the counterpart (K1) is alive through the handed config" |
| M3.1 | as M2.1 | "each of the four runs that start ends with exit code 255 and the verification line" |
| M3.2 | as M2.2 | "the record of the client's starts holds no install run" |
| M3.3 | `after the master was set up K1's log shows no new session or command: 0 Starting session lines and 0 accepted logins after the mark; and K1 logged a connection for each connection start, so no run rode the master` | "after the master was set up, K1's log shows no new session, command" |
| M3.4 | `no new forward: the bridge's remote socket does not exist and nothing listens on it, read while the master is still up` (§1.5) | "or forward" |
| M3.5 | `each connection start carries G2's two options, ControlPath=none and ControlMaster=no, each once` (values from `G2_WORDS`, never from the product) | "With G2 on `main`" |
| M3.6 | `the master is still up after the last run: ssh -O check ends with 0` | (the master was there for every run) |
| M3.7 | **the witness** (after the counts; not M3's control): `the witness: the real client with the probe's own pin words (pinned to K2, its file replaced by a file of K2's line) and without G2's two options rode the master: exit 0, it printed the nonce, and K1's log shows one new session and no new connection` | (the leg could have failed: a call without G2 is carried past the key check) |
| M3.8 | the stand-in guard, and `a session through the master gets the stand-in's PATH: the witness printed a PATH that starts with <standin>/bin` (H18) | (the setup, *The install's stand-in*) |

The witness's words are `withFile(<the probe's recorded hostKeyWordsOf and sourceWordsOf>, <a file of K2's line for the port>)`, then `-i
<key copy> -o IdentitiesOnly=yes -o BatchMode=yes -p <port> <user>@127.0.0.1 'echo <nonce> "$PATH"'`, through `controlClient` with
`words`. Its own checks: `sharingWordsOf(argv)` is empty, and the six options of E1 and E2 are there once each.

### 3.2 The switch (`m3-switch`)

| # | Check (`M3 m3-switch: …`) | The row's words it holds |
|---|---|---|
| M3.0 | the master is up (§1.6) | "a master connection to the counterpart (K1) is alive" |
| M3.s1 | the question is held; the rig's check of the switch with `stop: listener` | "when the install's question is open, K1's listener alone is ended, K2 takes the address" |
| M3.s2 | `the master is alive directly before the question is answered: ssh -O check ends with 0` | "the master is alive directly before the question is answered … (`ssh -O check` on the control path ends with 0" |
| M3.s3 | `the install run started once and ended with exit code 255 and the verification line; it carried G2's two options; K2 logged a connection for it` | "the install run starts once and ends with exit code 255 and the verification line" |
| M3.s4 | `the master is alive directly after the install run has ended: ssh -O check ends with 0` | "and directly after the install run has ended … both times)" |
| M3.s5 | `between the switch and the end of that run K1's log shows no new session or command: 0 Starting session lines and 0 accepted logins between the switch mark and the click's end` | "between the switch and the end of that run K1's log shows no new session or command" |
| M3.s6 | `K2 logged 0 accepted logins` (K2's whole log; its authentication attempts recorded as `info`) | "and K2 logs 0 accepted logins" |
| M3.s7 | **the control**, after M3.s6: `the control client with the same pin words (the install run's six pairs, its pin file replaced by a file of K1's line) and without G2's two options ended with 0 through the master that survived: it printed the nonce, K1's log shows one new command session and no new accepted login, and K2 logged no new connection` | "the control client with the same pin words and without G2's two options ends with 0, and K1's log shows one new command … if that control does not end with 0 through the master that survived, the row is NOT passed" |
| M3.s8 | the stand-in guard, and the control's PATH starts with `<standin>/bin` (H18) | (the setup) |

**Why "through the master" is proven and not assumed.** After the switch only K2 listens at P, and the control's pin is K1's. A control that
did not ride the master would reach K2 and be refused (255), and K2 would log a connection. So M3.s7 asks three things that only a ride of the
master gives: exit 0 with the nonce, ONE new `Starting session: command` line in K1's log with no new `Accepted` line, and no new `Connection
from` in K2's log. The control's words are `withFile(<the install run's recorded words>, <a file of K1's line for P>)`; its own checks are as
the witness's (§3.1).

## 4. M8: `scripts/itestRowM8.cjs`

M8's last column: "The control first: the control client with E1's words is accepted by K2, and the command's record holds at least one
start. Then the roads: each of the four runs that start ends with 255 and the verification line; each recorded argv holds
`KnownHostsCommand=none`; the command's record holds 0 starts for the roads' runs; K2 logs 0 accepted logins and 0 authentication attempts."

### 4.1 The recording command

`<leg>/khc/known_hosts_command` (mode `0700`; the lib's `khcScript(records, lineFile)`), with K2's line in `<leg>/khc/line`:

```sh
#!/bin/sh
set -C
{ printf '%s\0' "$$" "$PPID" "$(cut -d' ' -f22 /proc/$$/stat)" "$#"; printf '%s\0' "$@"; } > '<records>'/"$$".start || exit 97
cat '<lineFile>'
```

Each start leaves one record (pid, parent pid, start time, argc, argv). `khcStarts(dir)` of the lib reads them. The handed config names the
command with no argument. The parent pid is recorded as `info` beside each record, and judged nowhere: which process starts the command is
read from memory of OpenSSH, not measured (H16). The mark of M8 is the number of records when the roads' world opens.

### 4.2 The record of identities (D13)

The command is a text that the run hands the client by its config. `known_hosts_command` joins `CONFIG_NAMES` (`itestIdentities.cjs:20`),
so the record lists its SHA-256 at every depth. **R9** (new): `every known_hosts_command of the run is a config text of the record, with
its SHA-256`: an independent walk (`filesNamed`) counts the files of that name, and the record's configs with that base name must be as many,
and more than 0. It fails when the name leaves `CONFIG_NAMES` (MO9). The `sh` that runs it is not in the record, as for the stand-in's scripts
(§11).

### 4.3 The checks (`M8 m8: …`)

| # | Check | The row's words it holds |
|---|---|---|
| M8.0 | `the leg's config names the recording command and no DNS source: ssh -G resolves knownhostscommand <the command's path> and verifyhostkeydns false` | "the handed config names a `KnownHostsCommand` that prints K2's line …; no DNS source is on" |
| M8.c | **the control, first** (before the mark): `the control client with E1's words (a file of K1's line for K2's port as both known-hosts files) was accepted by K2: exit 0, K2 logged one accepted login with a command session, and the command's record holds at least one start`. Its words before `-i` are exactly `e1WordsFor(<file>)` | "The control first: the control client with E1's words is accepted by K2, and the command's record holds at least one start" |
| M8.1 | as M2.1 | "each of the four runs that start ends with 255 and the verification line" |
| M8.2 | `each recorded argv of a connection start holds KnownHostsCommand=none, once` (the value literal, as `NEW_PAIRS`) | "each recorded argv holds `KnownHostsCommand=none`" |
| M8.3 | `the command's record holds 0 starts after the mark: none for the roads' runs` | "the command's record holds 0 starts for the roads' runs" |
| M8.4 | `K2 logged a connection for each connection start, 0 accepted logins and 0 authentication attempts after the mark` | "K2 logs 0 accepted logins and 0 authentication attempts" |
| M8.5 | the stand-in guard (§1.8) | (the setup) |

**If M8.c is not accepted, M8 is not passed** (the setup: "A control that does not show what its row says fails the row"). The leg goes on
and records the roads, but the run is red. The control's stderr is in the evidence; if it holds `Unsafe KnownHostsCommand`, the instrument
does not work where the owned folder is (H16): STOP, the lead (§8, *If a proving run fails*).

## 5. The shared file and the lib

### 5.1 `scripts/lib/otherKeyRecord.cjs` (new, pure)

`'use strict'`, `node:path` only, reads nothing when it is loaded. Exports:

| Export | Behaviour |
|---|---|
| `OTHER_KEY_LEGS` | the table of §1.1, frozen: `{ name, row, scenario: 'mismatch' \| 'switch', source: 'user' \| 'global' \| 'master' \| 'command', pinnedTo: 'K1' \| 'K2', roads: 'three' \| 'install', stop }` |
| `knownHostsLineOf(port, pubText)` | `[127.0.0.1]:<port> <type> <base64>\n` from the first two fields of a `.pub` text; throws on a text with fewer than two fields |
| `e1WordsFor`, `beforeE1WordsFor`, `STRICT_ONLY`, `withFile`, `sharingWordsOf`, `G2_WORDS` | §1.3; each throws on a file path with white space or a quote |
| `sessionsOf(log, user)` | the `Starting session: <kind> … for <user> from 127.0.0.1 port <n> id <m>` lines, as `[{ kind, port, id }]` |
| `refusedRoads(counts, bridgeStderr)` | the judge of M2.1, M3.1, M8.1: `{ ok, detail }`; ok only when the starts after the mark hold exactly four connection starts, one each of `probe`, `bridge`, `sweep`, `mode`, and none of `install`; each runner run of these kinds ended with 255 and its stderr holds `Host key verification failed.` as a whole line (LF or CR LF); the bridge ended with 255 and `bridgeStderr` (not `null`) holds the line too. A value not read is a failure, never a pass |
| `khcScript(records, lineFile)`, `khcStarts(text list)` | §4.1 |

### 5.2 `scripts/itestRowOtherKey.cjs` (new)

Header: what the three rows share; that every source is made by the handed config in the leg's folder; that the controls take no word from
the product. Imports the rig and the two libs only. Exports `writeSource(leg, spec, port)`, `whichFiles(ctx, port)` (`ssh -G`, §1.2),
`driveRefusedRoads(ctx, roads)`, `driveSwitch(ctx, spec, k1, extra)`, `bridgeStderrOf(leg, counts)`, `socketChecks(ctx, label, roads)`,
`refusedRoadsChecks(ctx, label, roads, servers)` (M2.1 to M2.4 and their M3 and M8 forms, by the spec), `standInGuard(ctx, label, stand,
before)`, `acceptedAfter(server, from)`. Each function under 50 lines. Like every row file it holds none of `startServingSshd(`,
`stopListener(`, `endServer(`, `.world(`, `launch(`, `sshExecAuth`, `pinClient'` (RR6, RR7).

### 5.3 The three row files

`rowM2(check, top)` calls `rig.runLeg(check, top, 'M2', name)` for each `m2-*` leg of the table, in its order; `legs` maps each name to the
mismatch or the switch of §2 with its spec. `rowM3` and `rowM8` the same. `pinnedLegs` calls `rowM2`, `rowM3`, `rowM8` after `rowM9`, before
the record of identities. The rig's `ROW_FILES` gains `M2`, `M3`, `M8` (D6).

## 6. Dependencies on the built rig (and what E3.S6 adds itself)

| # | What E3.S6 needs | Built? (file:line on `be47dd81`) | What E3.S6 does |
|---|---|---|---|
| D1 | a handed config per leg with another known-hosts file, the master's lines or a command | no: `legRig` writes the five lines (`itestRowRig.cjs:58`, `rowRecord.cjs:130-136`), and an added line cannot replace `/dev/null` (H7) | the optional parameter of `handedClientConfig`; the rig's `handConfig` (§1.2) |
| D2 | the bridge's stderr | no (H4) | the shim's line (§1.4); `installShim`'s optional `real`; `bridgeStderrOf` |
| D3 | a master of a leg, its check and its end | no: leg 0 has it, inside its own file (`itestListenerStop.cjs:25-37`, `:62-93`) | `masterOf`, `masterCheck` and the end in the rig (§1.6); leg 0 is not changed |
| D4 | the sessions of a log | partly: `logCounts` pairs a session with an accepted login (`rowRecord.cjs:53-69`); a session through a master has no `Accepted` line | `sessionsOf` (§5.1) |
| D5 | `ss -lx` | built, not exported (`itestRowRig.cjs:501-504`) | export `listeningNow` |
| D6 | the leg process loads the row file | `ROW_FILES` has M1, M4, M6, M9 and `rig` (`itestRowRig.cjs:569`) | add M2, M3, M8 |
| D7 | the switch, the held answer, a click not waited for | built: `theSwitch` `:392-405`, `installAnswer` `:308-323`, `pressNow` `:329-333`; RP2, RP3 | — |
| D8 | the control client with words of the row | built: `controlClient` `:418-423` takes `words` | the rows pass their own (§1.3) |
| D9 | counterparts, their end, the four counts, the mark | built: `counterpart` `:142-154`, `endCounterpart` `:163-167`, `mark` `:336-343`, `countsOf` `:370-389` (with each start's pid, each run's stderr, each bridge's exit code and remote path) | — |
| D10 | the stand-in | built: `installStandIn`, `listingOf`, `tmpNames` (`itestProbeInstall.cjs:209`, re-exported as `rig.standIn`) | — |
| D11 | the entry pinned to K2 | built: `World.replaceHostKey` (`personRoadsWorld.ts:386`); `keyText` (`itestRowRefused.cjs:26`, exported `:204`) | — |
| D12 | what is left, the evidence | built: `nothingLeft` `:514-540`, `evidence` `:551-564` | — |
| D13 | the recording command in the record | no (H17) | `CONFIG_NAMES` and R9 (§4.2) |
| D14 | the recorded words of a run | built: `product.argv.hostKeyWordsOf`, `sourceWordsOf`, `valuesOf` (`test/pinnedArgv.ts:78-103`) | — |

If the built rig differs from this table in a part that a leg relies on, the coder STOPS and tells the lead (no silent change of the rig).

## 7. The test: `src/test/itestRowsOtherKey.test.ts` (RED first)

Loads `scripts/lib/otherKeyRecord.cjs` and `scripts/lib/rowRecord.cjs` with `createRequire` at run time (as `itestRowsRefused.test.ts`), so it
compiles before the lib exists; owned folders through `ownedDir` of `scripts/lib/leftovers.cjs` (as RR8).

| # | Asserts |
|---|---|
| OT1 | `OTHER_KEY_LEGS` holds exactly the seven names of §1.1, each once: M2 four (each of `user`, `global` once per scenario), M3 two, M8 one; `m3-mismatch` is pinned to K2 and every other to K1; the two M3 legs have the source `master`, the switch of M2 stops `whole` and that of M3 `listener` |
| OT2 | `handedClientConfig('/o/leg')` is still the five lines of today (byte for byte); with `{ userKnownHosts: '/o/leg/home/.ssh/known_hosts' }` the text has ONE `UserKnownHostsFile` line, with that value, and the `GlobalKnownHostsFile /dev/null` line; the same for the global value; `lines` stand inside the `Host *` block after the five. **OT2b**, skipped where no `ssh` is on `PATH` (as RR4b): `ssh -G -F <file> -p 1 x` resolves `userknownhostsfile`, `globalknownhostsfile`, `controlmaster auto`, `controlpath`, `knownhostscommand` and `verifyhostkeydns false` as the options say, for each row of the table of §1.2 |
| OT3 | the words of §1.3: `e1WordsFor('/o/k')` is the six words, `beforeE1WordsFor` the four, `STRICT_ONLY` the two; `withFile` of the words that the product's `hostKeyWords(checkedPin('/o/keys/known_hosts-e1-x', knows))` writes, with `/o/pins/k1`, answers the same twelve words with the new file in both places, and throws for words without `GlobalKnownHostsFile`; `sharingWordsOf` finds both words of `NO_CONNECTION_SHARING` (imported from `../sshExecCommand`) and none in the twelve; a path with a space throws |
| OT4 | `sessionsOf` of the nine lines of S4.F6: one `command` session, port and id read; with a second line `Starting session: command for someone from 127.0.0.1 port <the same port> id 1` (a session through a master): two, and no second `Accepted` line is needed for it; `forced-command`, `subsystem` and `shell` are read; a log with no such line: none |
| OT5 | `refusedRoads`: four connection starts of the four kinds, each 255 with the line (one with CR LF), the bridge's stderr with the line → ok; each of these turns it red: a run with 0; a run with 255 and no line; the line inside a longer line; the bridge's stderr `null`; the bridge's exit 0; an `install` start; three connection starts; five |
| OT6 | the shim (`installShim(rig, <a stand-in client>)` in an owned folder; the stand-in client is a `sh` script that writes `Host key verification failed.` to its stderr and ends with 255): started with `stdio: 'ignore'`, the shim's `<records>/<pid>.stderr` holds the line and `<pid>.argv` holds the argv as before; started with stderr as a pipe, the pipe gets the line and no `.stderr` file is made. The exit code is 255 both times |
| OT7 | `khcScript` written into an owned folder with a line file, started twice with no argument: each start prints the line file's text and leaves one record; `khcStarts` reads two records, each with a pid, a parent pid and argc 0 |
| OT8 | `knownHostsLineOf(2222, 'ssh-ed25519 AAAA… comment')` is `[127.0.0.1]:2222 ssh-ed25519 AAAA…\n`; it equals the product's `knownHostsLine('127.0.0.1', 2222, parseHostKey(<the same text>))` for a test key (the product pins the format; the lib does not read it); a text of one field throws |

**RED.** Before the libs and D1, D2: compile (exit 0), run the file: OT1, OT3 to OT5, OT7 and OT8 fail on `…/scripts/lib/otherKeyRecord.cjs
does not exist`; OT2 on the second `UserKnownHostsFile` line (the parameter is passed over) and OT2b likewise; OT6 on `no <pid>.stderr file`
(the shim of today sends the stand-in's stderr to `/dev/null`). Save the output; any other text is a stop.

## 8. The proving runs

The stories document: a proving run passes no row and goes into §10 never; its numbers are "seen when it was built".

1. **Local, three times in a row,** on the last code commit, from that tree (`git status --porcelain --untracked-files=no` empty), with the
   proving command, each output saved outside the tree. Read in each: exit 0, no `FAIL`; every leg of §1.1 ended with 0; per leg its
   `evidence` line; M2.0 and M8.0 with their paths; every control and witness with exit 0; R1 to R9; the time of the script (projected:
   about one minute more than E3.S5's run, seven legs; not measured).
2. **After each run:** the after-run checks of S4.§9 (no `/tmp` name of the run, no process of the run). In addition: no master is alive
   (`ps` by the recorded pids), no control socket `cm` is left, no `/tmp/creds-*.sock` of these legs is left.
3. **CI** (the lead's): `itest:ssh-agent` green on the head sha, on the runner's `/usr/sbin/sshd`.

**If a proving run fails** (the stories document, *What a proving run that fails asks for*). Four places are named here before the first
run, because they rest on facts that are read and not measured:

- M3.s7 or M3.7 is red only because K1's log has no `Starting session` line after the listener-only stop, while the control printed its
  nonce (H11): the instrument does not show "K1's log shows one new command". STOP, the lead: a row that cannot run as written (decision 18).
- M8.c is red and the control's stderr holds `Unsafe KnownHostsCommand` (H16): the command cannot live in the owned folder. STOP, the lead.
- M3.8 or M3.s8 shows a PATH through the master that does not start with the stand-in's folder (H18): HC4 is NOT run (a call that rode the
  master could reach the real installer). STOP, the lead.
- M2.1, M3.1 or M8.1 is red only because the bridge's stderr file is missing (H5): the shim's test of an ignored stderr does not hold on
  that machine. Repair the instrument (a harness fault); if no repair reads it, STOP, the lead (Q2).

## 9. Mutations and hand checks

**Mutations** (each restored, its output saved):

| # | Mutation | Red | Needs an `sshd` |
|---|---|---|---|
| MO1 | `beforeE1WordsFor` keeps the `GlobalKnownHostsFile` pair | OT3 | no |
| MO2 | `handedClientConfig` adds the user value after the `/dev/null` line, not in its place | OT2 (and OT2b) | no |
| MO3 | `sessionsOf` reads only `command` sessions | OT4 | no |
| MO4 | `refusedRoads` passes a bridge whose stderr is `null` | OT5 | no |
| MO5 | `refusedRoads` counts the starts, not their kinds (an `install` start among four passes) | OT5 | no |
| MO6 | the shim keeps EVERY stderr in the file (the test of `/dev/null` dropped) | OT6 (the pipe gets nothing) | no |
| MO7 | `khcScript` records nothing | OT7 | no |
| MO8 | `OTHER_KEY_LEGS` without `m2-switch-global` | OT1 | no |
| MO9 | `CONFIG_NAMES` without `known_hosts_command` | R9 in a proving run | yes (scratch worktree) |

**Hand checks** (the product made to do the wrong thing that a leg is about), each in a scratch worktree OUTSIDE the story's tree, as S4.§12
says (R1 fails there, as it must; recorded as hand checks in c2, never as results). The prediction is EXACT for the legs of E3.S6: the checks
named red turn red, and every other check of the seven legs stays green. Outside these legs a hand check also turns red checks of earlier
rows that read the same words (for example M1.10); those are listed in the record as seen and are no part of the prediction.

| # | The product made to | Red in the legs of E3.S6 | Green in the legs of E3.S6 |
|---|---|---|---|
| HC1 | `hostKeyWords` writes no `UserKnownHostsFile` pair (`hostKeyPin.ts:274`) | `m2-mismatch-user`: M2.1, M2.2, M2.3, M2.4, M2.5 (the probe reads the file of (a), K2 is accepted, the question is answered and the install runs the stand-in). `m2-switch-user`: M2.s3, M2.s4, M2.s5 | M2.0 and M2.7 of both `-user` legs (no product word); M2.s1, M2.s2, M2.s6; every check of the `-global` legs, of M3 and of M8 (their user file is `/dev/null`) |
| HC2 | `hostKeyWords` writes no `GlobalKnownHostsFile` pair (`hostKeyPin.ts:274`) | `m2-mismatch-global`: M2.1 to M2.5. `m2-switch-global`: M2.s3, M2.s4, M2.s5 | M2.0 and M2.6 of both `-global` legs; M2.s1, M2.s2, M2.s6; every check of the `-user` legs, of M3 and of M8 |
| HC3 | `hostKeyWords` writes no `KnownHostsCommand=none` (`hostKeyPin.ts:272` answers `[]`) | `m8`: M8.1, M8.2, M8.3, M8.4, M8.5 | M8.0 and M8.c (before the mark, own words); every check of M2 and M3 (their config names no command) |
| HC4 | the runs and the bridge carry no G2 words (`sshExecCommand.ts:228`: `[]` in place of `NO_CONNECTION_SHARING`; `sshBridge.ts:181`: the spread left out) | `m3-mismatch`: M3.1, M3.2, M3.3, M3.4, M3.5, M3.8 (the probe, the install run, the sweep and the mode check ride the master to K1; the install runs the stand-in). `m3-switch`: M3.s3 (a ride of the master: exit 0, no connection to K2), M3.s5, M3.s8 | M3.0, M3.6, M3.7 of `m3-mismatch`; M3.0, M3.s1, M3.s2, M3.s4, M3.s6, M3.s7 of `m3-switch`; every check of M2 and M8 that the G2 words do not reach. **Not predicted:** the exit code of the bridge that rides a master (H10 measured a bridge that became a master, not one that joins a running one); M3.1 is red by the probe already |

HC4 runs only after a proving run showed M3.8 and M3.s8 green (H18). Two hand checks may share one run when their legs do not overlap: HC1
with HC3, and HC2 with HC4. The record says which shared.

## 10. Break it: ways to pass while the defect stays, and what stops each

| # | The way | What stops it |
|---|---|---|
| BR1 | K2 logs 0 attempts because K2 was never reached | M2.3, M8.4: a connection per connection start; M2.s3, M3.s3: a connection for the install run |
| BR2 | the file of (a) or (b) is never read by the client, so no leg could have failed | M2.0 (`ssh -G` resolves it); M2.6 (the control is accepted through (b)); M2.7 (the witness through (a)); HC1, HC2 |
| BR3 | a line of the handed config follows `/dev/null` and is passed over (H7) | the lib writes the value in place; OT2, OT2b, MO2; M2.0 |
| BR4 | the bridge passes on its exit code alone | `refusedRoads` asks its line from its own stderr file; `null` fails (OT5, MO4) |
| BR5 | the control takes its words from the product, so a hand check changes the control too | §1.3: literal or recorded words; OT3 |
| BR6 | the M3 control reaches K2 and is refused, and that is read as "the road did not ride it" | M3.s7 asks exit 0, the nonce, a new session in K1's log and no new connection in K2's |
| BR7 | the master was down, so 0 sessions mean nothing | M3.0, M3.6, M3.s2, M3.s4 (`ssh -O check`); the witness M3.7 and the control M3.s7 ride it |
| BR8 | "no new session" is read from the accepted logins, which a session through a master never adds | `sessionsOf` counts the `Starting session` lines apart (OT4, MO3) |
| BR9 | "0 forwards" is read from a log that never names a forward | §1.5: the socket's path and `ss -lx`, beside 0 attempts |
| BR10 | the install's question is dismissed, so "no install run" cannot fail | `installAnswer` answers it; HC1, HC2, HC4 then show an install run |
| BR11 | the command of M8 is refused by the client (H16) and the roads pass for that reason | M8.c first: the control must be accepted with at least one start of the command |
| BR12 | the command's starts of the control are counted as the roads' | the mark after the control; M8.3 counts after it |
| BR13 | a leg reads or writes the person's `~/.ssh` | the handed config names only the leg's paths; M2.0 refuses a path outside the leg; section 10's closing check of `~/.ssh/known_hosts` (H21) |
| BR14 | a defect lets the install run reach the real installer | every counterpart carries the stand-in; the guard of §1.8; HC4 waits for M3.8 and M3.s8 |

## 11. What is NOT measured by E3.S6

- **No row passes.** These are proving runs; §10 is E3.S10's, on the final tree.
- **The client's compiled-in default user file.** It is in the person's real home (H8); the leg's file is the one that the handed config names
  (Q1).
- **A forward in the counterpart's log.** VERBOSE names none (H12); the socket stands for it (§1.5).
- **Which command an accepted login ran,** beyond the session's kind (as S4.§14).
- **The bridge's exit code when it rides a master** (HC4, not predicted).
- **Which process starts the `KnownHostsCommand`:** its parent pid is recorded, not judged.
- **The version of `sh`** that runs the recording command and the stand-in's scripts: not in the record of identities.
- **A system-wide file at `/etc/ssh/ssh_known_hosts`.** M2 (b) names an owned file, as the row says; the real file of the machine is never
  written.
- **The warm state of the asker.** No row of E3.S6 counts the question; every leg is cold and says so.
- **A root runner, another operating system, Windows.**

## 12. The documents

`research/module_tests.md`, the G1 section (after E3.S5's paragraphs):

1. **The table:** a row for `itestRowsOtherKey.test.ts` (OT1 to OT8, one sentence each); the row of `scripts/itestPinnedRoads.cjs`: its count
   of `ok` lines from the proving run, that section 10 runs M2, M3 and M8 after M9, and the shim's `.stderr` file of an ignored stderr.
2. **A paragraph `**M2, M3 and M8 on the rig (E3.S6).**`**: the seven legs (§1.1); each source made by the handed config in the leg's folder
   (§1.2) and why (a) is a file that the config names (H8); the words of the controls and the witnesses (§1.3); the bridge's line (§1.4); the
   forward by the socket (§1.5); the master of a leg (§1.6); the recording command and R9 (§4); what it does not prove (§11).
3. **`**M2, M3 and M8, seen when they were built (<date>, commit <sha>).**`** NOT §10 of the plan; it passes no row. Per leg: the four counts
   (from the evidence lines), the bridge's stderr, the socket, every control and witness with its exit code, the paths that M2.0 and M8.0
   resolved (the leg folder as `<leg>`), the three runs' times, the hand checks as hand checks (with the reds outside E3.S6 as seen), and the
   CI run (the lead's). Home folder as `~`, user as `<user>`.
4. **The table of *Test leftovers*** (the row of `ssh-agent-itest.cjs`): the `pin` folder also holds one folder per leg of M2, M3 and M8, a
   master's control socket in the M3 legs (ended with the leg), and the records of the command in `m8`.

## 13. Order of work, and the commits

1. `git status --short`. **The test** (§7) alone. Compile: exit 0. Run it: the REDs of §7. Save the output.
2. **The libs** (§5.1, D1 in `rowRecord.cjs`). OT1 to OT5, OT7, OT8 green; MO1 to MO5, MO7, MO8.
3. **D2** (the shim, `installShim`'s parameter). OT6 green; MO6.
4. **The rig** (D1 `handConfig`, D3, D5, D6), **the shared file** (§5.2), **the three rows** (§2 to §4), `pinnedLegs`, **D13**. `node --check`
   of every script; typecheck, lint, ratchet, `npm test`; `itestCallers`, `harnessSites`, `itestInstrument`, `itestRowRig` (RR6 and RR7 now
   read four more row files); the leftovers guard. `wc -l` of every new and changed script. Commit **c1** (one commit: no commit holds a red
   test): `test(ssh): G1 E3.S6 — M2, M3 and M8 on the rig: another key is refused whatever else would trust it (OT1-OT8)`. Files:
   `scripts/lib/otherKeyRecord.cjs`, `scripts/itestRowOtherKey.cjs`, `scripts/itestRowM2.cjs`, `scripts/itestRowM3.cjs`,
   `scripts/itestRowM8.cjs`, `scripts/itestRowRig.cjs`, `scripts/lib/rowRecord.cjs`, `scripts/itestPinnedRoads.cjs`,
   `scripts/itestIdentities.cjs`, `src/test/itestRowsOtherKey.test.ts`. Body: the RED texts, MO1 to MO8, the line counts, and that no product
   file, no workflow and no `package.json` changed.
5. **The proving runs** (§8, 1 and 2) on c1. **MO9 and the hand checks** (§9) in a scratch worktree, HC4 last. A harness fault that a run
   shows is repaired in a new commit (c1b, …), and the three runs are made again on the last one.
6. **The documents** (§12). `plan-lifecycle.mjs` and `public-hygiene.mjs` from the root: clean. Commit **c2**:
   `docs(tests): G1 E3.S6 — M2, M3 and M8 as seen when they were built`. Body: what was OBSERVED in the three runs, the hand checks as hand
   checks, the after-run checks.

Stage by path; read `git diff --staged --stat` before each commit; do not push (the lead pushes).

## 14. Done when (each item can be counted)

- [ ] OT1 to OT8 were watched red with the texts of §7 and pass; MO1 to MO9 turned red what §9 names.
- [ ] Every leg of §1.1 is built, runs in its own leg process with the real resolve, through the committed instrument, and ran from a tree
      with no modified tracked file.
- [ ] Three local proving runs on c1 (or its last repair): exit 0, no `FAIL`, every check of §2 to §4 `ok`, every control and witness
      accepted, every leg process ended with 0, R1 to R9 `ok`; the after-run checks print nothing. The CI proving run on a head sha is green
      (the lead's box).
- [ ] HC1 to HC4 each turned red exactly what §9 names in the legs of E3.S6, and left green what it names (hand checks, in c2's body).
- [ ] typecheck, lint, ratchet, `npm test`, `itestCallers`, `harnessSites`, `itestInstrument`, `itestRowRig` and the leftovers guard green;
      every script at most 800 lines (`wc -l`), each new file inside its budget.
- [ ] `research/module_tests.md` holds §12's items; no home path and no user name in a committed text.

## 15. Opus review checklist

1. Is every other source made by the handed config in the leg's folder, with the value IN PLACE of `/dev/null`? Does M2.0 compare with the
   leg's own paths, and M8.0 with the command's path?
2. Does every leg have its own process, world, counterpart(s), key copy and handed config? Is each leg cold, and does its evidence say so?
3. Are the four counts apart? Are sessions (`sessionsOf`) counted apart from accepted logins? Is a value not read a failure?
4. Is the bridge one of the four runs, judged by its exit code AND its line from its own stderr file? Does the shim touch only an ignored
   stderr?
5. Are the controls and witnesses after the counts (M8: before the mark), by the real client's path, with words that are literal or recorded,
   never from `hostKeyWords`? Does each check its own argv (the four words of before E1; no G2 word in M3's)?
6. M3: is the master up before the mark and alive at M3.s2 and M3.s4? Does M3.s7 prove the ride (exit 0, the nonce, a session in K1's log,
   no connection in K2's)? Is the master ended first, by `-O exit` and its pid?
7. "0 forwards" and "no new forward": the socket's path and `ss -lx`, read while the master is up in M3?
8. M8: the control first, the mark after it, the command's records counted after the mark; R9?
9. Does every counterpart carry the stand-in, and does every leg read its marker and listing?
10. The guards: RR6 and RR7 read the new row files and pass; every script ≤ 800 and inside its budget.
11. The documents: "seen when it was built", not §10; hand checks as hand checks; `~`, `<user>` and `<leg>`.

## What grows

| What | How much (projected) | Who retires it | When it is interrupted |
|---|---|---|---|
| one folder per leg (7): as the E3.S4 spec's leg folder, plus the source file, `pins/`, the command and its records (`m8`) | about 60 kB per leg, under 0.5 MB per run | the section's scope removes the `pin` folder, pass or fail | the janitor (token `creds`) sweeps the owned folder |
| the shim's `<pid>.stderr` files, one per bridge start of a row or of section 10 (about 15 per run) | a few hundred bytes each | with the leg's or the section's folder | as above |
| one master per M3 leg, its control socket `<leg>/cm` | for the seconds of a leg | the leg's scope: `-O exit`, then the pid by its start time; `ControlPersist 120` ends an orphan within 2 minutes | a SIGKILL of the harness leaves the master for at most 120 s; its socket goes with the folder |
| a bridge socket `/tmp/creds-<user>-<id>.sock` per bridge leg (five legs) | none is expected (no forward is made); one per leg if a defect makes one | `removeSocket` by its exact path at the spawn (the rig) and by `runLeg` from the evidence | as S4.*What grows* |

Nothing grows in the product.

## Notes for the lead

- **Links and rows.** The stories document (its status line and `## E3.S6`), the parent's `## Epics`, E3, and `todo/README.md` do not name
  this file. They are the lead's, in the commit that adds this spec.
- **Time.** Seven legs, about one minute more per run (projected, not measured), in CI too.
- **CI** is dispatched by the lead (§8, 3).
- **The shim of section 10 changes for every leg** (D2): a bridge's stderr now lands in a file of the run where it went to `/dev/null`. No
  check of section 10, M1, M4, M6 or M9 reads it; their proving runs show the same `ok` names.

## Notes for the row stories

- **E3.S7 (M7, M14)** runs "the runs of M2 (b), both legs" (M7) and uses "the handed config of M2 (b)" and "of M8" (M14). The shared file
  exports the source writers, `handConfig`'s options and the drives with a spec, so E3.S7 can call the M2 (b) legs on a storage folder of its
  own and the configs of `m2-*-global` and `m8` without a copy.
- **E3.S9 (M11 b)** runs M2 (b), the mismatch, on the older client: the words of the controls are literal (§1.3), and the older client has
  no `KnownHostsCommand`, so `m8`'s config is not for it.

## Questions for the lead

**Q1 · M2 (a): "the file that the client reads as the person's default one" is, here, a file that the handed config names.** (Not a plan
change in my reading; confirm.)
- The parent, M2: "K2 is listed (a) in the file that the client reads as the person's default one". The setup: "The person's own `~/.ssh` is
  never read by a row and never written." The brief of this story: the user file "in the leg's own HOME, never the person's real ~/.ssh".
- What is so (H8): OpenSSH takes `~` from the password database, not from `HOME` (measured, S4.F23). So the client's compiled-in default,
  `~/.ssh/known_hosts`, is always in the person's real home. A leg cannot put a file there.
- My reading (§1.2): the leg's file `.ssh/known_hosts` in the leg's HOME (`<leg>`, `home`), which the handed config names as `UserKnownHostsFile`: the file that this
  client reads as the person's own when a call names none. M2.0 shows it by `ssh -G`. If the lead reads "default" as the compiled-in default,
  (a) cannot run as written without the person's `~/.ssh`, and that is decision 18 (a row that cannot run as written: a plan change).

**Q2 · The bridge's verification line is read through the shim.** (Not a plan change in my reading; confirm.)
- The parent, M2, M3 and M8: "each of the four runs that start ends with exit code 255 and the verification line"; the four include the
  bridge (H3).
- What is so (H4): the product spawns the bridge with `stdio: 'ignore'` (`bridgeSpawner.ts:79`); no built check has read its line.
- My reading (§1.4): the shim sends only an IGNORED stderr to a file of the run; the product's spawn, the client's argv, environment and exit
  code are unchanged. It is an instrument like the shim's record. If the lead does not accept it, the bridge's part of "the verification line"
  cannot be read, and the three rows cannot run as written for the bridge (decision 18).

**Q3 · M3's control: "the same pin words" with a pin file of its own.** (Not a plan change in my reading; confirm.)
- The parent, M3: "the control client with the same pin words and without G2's two options ends with 0".
- What is so: the road's pin file is deleted at the end of its call (`writtenKey.ts:52-64`), before the control runs.
- My reading (§1.3, §3.2): the control takes the install run's recorded words (its six pairs) and replaces only the path of the two
  known-hosts options by a file of its own that holds the same line (K1's, for P). Every other word is the road's own.

## The answers (2026-11-24)

- **A1 (Q1), the owner:** a faithful reading, not a plan change. M2 (a) is the user-file slot: the leg's own file
  `.ssh/known_hosts` in the leg's HOME (`<leg>`, `home`), which the leg's handed config names as `UserKnownHostsFile`; M2.0 shows it by `ssh -G`. The person's real
  `~/.ssh` is never read and never written. (The consultants could not be asked: coai refused every call, its data folder was not found.)
- **A2 (Q2), the lead:** accepted, not a plan change. The shim sends only a stderr that the product IGNORES to a file of the run; the
  product's spawn, the client's argv, its environment and its exit code stay as they are. It is an instrument like the shim's record, and
  the unit tests and a hand check must show that a stderr the product reads is never taken.
- **A3 (Q3), the lead:** accepted, not a plan change. The control of M3 takes the install run's recorded words and replaces only the path
  of the two known-hosts options by a file of its own that holds the same line; every other word is the road's own, and the evidence line
  shows both argvs.
