# PLAN — E3.S4 spec: the common rig of the real-road rows; a pinned call that works (M1), and calls that own their files (M6)

> Status: **IMPLEMENTED, 2026-11-27.** Story E3.S4 (spec) of G1: merged (#393, squash `fe9aee47`, and #394, `b152bf06`) and released in extension 1.24.0 on 2026-11-27 (release PR #395, squash `a63dee35`, tag `extension-v1.24.0` at `a63dee35`, published to the Marketplace the same day). The parent [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) records the release and the run on the release commit (§10.5).
>
> The status as it stood before the promotion, kept as it was written: **spec, 2026-11-24, by Opus; revised the same day after the lead's answers to Q1 and Q2 (the rows run the REAL resolve); not
> built.** Story E3.S4 of [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its decisions 15, 16 and 18; `## Epics`,
> E3: *The setup of every measurement* and the rows M1 and M6; candidate C20) and of its stories document
> [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md) (`## The rows: built story by story, measured once`,
> `## E3.S4`, its settled items 7 and 9, the lead's answers). The parent, the stories document and `todo/README.md` do not name this file
> yet: the lead adds the links and the row (*Notes for the lead*). This file is promoted together with the parent.
>
> Scope: `src_vs_code/scripts` (five new files, three changed), one new test file and one changed test helper in `src_vs_code/src/test`,
> and `research/module_tests.md`. No product file (`src_vs_code/src` outside `src/test/`), no workflow, no `package.json`. **Every
> `file:line` below was read on `fix/g1-e3-release-gate` at `a07e4cac`, on 2026-11-24.** Opus writes this spec, a Sonnet coder builds
> it, Opus reviews it.

"The parent" is the plan linked above; M1, §3.5, decision 15 and so on are the parent's. "The stories document" is the E3 document linked
above. This document's own names: the facts F1 to F25, the rig's parts (§3), the rig's own proof RP (§5), the checks M1.1 to M1.19 and
M6.1 to M6.14, the tests RR1 to RR8, the mutations MU1 to MU8, the hand checks HC1 to HC6, the break-its BR1 to BR15, and the lead's
answers A1 and A2. "A leg" is one scenario with its own folder, its own leg process, its own world and its own counterpart(s). "The leg
process" is the child Node process in which a leg runs (§1.2). "A call" is one span of `withWrittenKey` or `withWrittenKeyUntilExit` of
the product: one click of *Install creds on host*, one bridge, one socket check. This document keeps no change ledger: a change of it is an
entry in the parent (`plan-change-control.md`). The parent's epoch 3 has ONE entry (3.1), so the next entry is the SECOND, and it stops the
whole plan.

## What E3.S4 decides, in one paragraph

Every later row-story drives the roads through ONE file, `scripts/itestRowRig.cjs`. A leg gets its own folder (shim, records, storage,
handed client config, a home folder), and runs in its OWN child process, whose environment is the leg's: the shim first on `PATH`, `HOME`
the leg's own folder. There the registered commands call the product's REAL `resolveExecAuth`, which reads a disposable vault that the
world's host now holds (a stored key, a key named by its path, or a password) and hands `ssh` the process's own environment, so every
`ssh` of the roads goes through the shim and the handed config (measured, F22). In its process the leg names its counterparts and starts
them through the serving launcher of E3.S2, opens a NEW world (so the asker is cold) or warms the asker by one pinned call in the same
world, and at its end prints one `evidence <json>` line: the four counts of decision 15 per counterpart and per road, the question's time,
every run's exit code and stderr, the messages in order, and the files of `keys/<pid>/` while the calls lived. Section 10 starts the leg
processes one after another and counts each check that a leg prints as its own. The rules that count are pure functions in
`scripts/lib/rowRecord.cjs`. A new unit test holds them, and holds the world's real resolve (watched RED first). The rig proves its own
parts once (warm, *the switch*, the control client with E1's words) in `scripts/itestRigProof.cjs`. Then M1 (`scripts/itestRowM1.cjs`) and
M6 (`scripts/itestRowM6.cjs`) are built on it. One run of `npm run itest:ssh-agent` runs them all, locally on the unpacked `sshd` and in CI
on `/usr/sbin/sshd`. The runs are proving runs: "seen when it was built", never §10.

| File | Change | Lines (budget) |
|---|---|---|
| `scripts/lib/rowRecord.cjs` (new) | the pure rules of the record: kinds of a start, the counts of a counterpart's log, the sentences of §3.5, the handed client config's text, the password lines, the relay of a leg process's lines | ≤ 220 |
| `scripts/itestRowRig.cjs` (new) | THE common rig: the leg process (its start from section 10, and its entry), leg folders, counterparts, worlds with the real resolve and the vault, the runner's observer (the timer of the question, the gate), warm, the switch, the control client, the sampler of `keys/<pid>/`, the calls of a leg, the evidence | ≤ 760 |
| `scripts/itestRigProof.cjs` (new) | the rig's own proof RP (not a row) | ≤ 250 |
| `scripts/itestRowM1.cjs` (new) | M1 | ≤ 300 |
| `scripts/itestRowM6.cjs` (new) | M6 | ≤ 450 |
| `src/test/itestRowRig.test.ts` (new) | RR1 to RR8 | ≤ 340 |
| `scripts/itestPinnedRoads.cjs` | exports widened; `openLeg` merges `mocks` and takes `runnerOf`; `rigOf` takes an optional `product`; `AUTH_ATTEMPT` and `kindOf` move to the lib; `pinnedLegs` calls the three new files | 546 → about 560 |
| `scripts/itestProbeInstall.cjs` | exports widened (no behaviour change) | 209 → 209 |
| `scripts/itestIdentities.cjs` | `recorded` and the shims walk every depth; check R7 | 131 → about 145 |
| `src/test/personRoadsWorld.ts` | `Parts.realResolve` and `Parts.vault` (the real resolve over a disposable vault); `World.said` (every message and log line, in order); `World.replaceHostKey` | 315 → about 350 |
| `research/module_tests.md` | the rig, the rows' legs, "seen when it was built" | — |

## Binding constraints

- **No plan change.** Build what the parent, the stories document and this spec say. No pass criterion is rewritten or made weaker: each
  check of §6 and §7 cites the words of M1's and M6's last column. If a leg cannot be built as written, a test is not RED or GREEN as said,
  or a proving run fails in a way that *What a proving run that fails asks for* (the stories document) does not cover: STOP and tell the
  lead. Never write a ledger entry: the lead records a plan change, and the next one stops the plan.
- **Only the `vscode` module is a stand-in on the rows' roads** (the parent's setup, *The roads*; the lead's answer A1). The rows run the
  REAL `resolveExecAuth`, the real asker of the client, the real runner, the real bridge spawner, the real pin writer and the real deletes.
  What the rig adds around them only OBSERVES: the recording runner and the observer of `./sshExecRunner` call the real runner and pass its
  answer on unchanged; the gate only delays the START of a run (§1.8); the vault is data that the world's host answers (the host is not a
  module; it is a hand-made record in every test of this repository). No script of the rows names the request `../sshExecAuth` or
  `./pinClient` (RR7). Section 10's own legs keep the world's stand-in resolve: that was E1.S4's smoke, not a row.
- **Through the committed instrument only** (decision 16). Every counterpart is `startServingSshd(rig, name, hostKey, port, extra)`
  (`itestServing.cjs:65`), called in ONE place, the rig's `counterpart` (RR6). Every extra `sshd` line goes in through `extra`. The local
  `sshd` is handed by `CREDS_ITEST_SSHD` and `CREDS_ITEST_SSHD_CONFIG`, never by an edit of a tracked file.
- **A run of the commit.** A proving run starts from a tree with no modified tracked file (R1, `itestIdentities.cjs:119`). An untracked
  file does not count for R1 (`--untracked-files=no`). Hand checks run in a scratch worktree (§12), never in the story's tree.
- **The four counts stay apart** (decision 15): a start of the client (the shim's record, the question `ssh -V` included), a connection
  start (a start whose argv names a destination), an authentication attempt and an accepted login (the counterpart's log). No check puts
  one for another.
- **The guards stay green.** Test 33 (`itestInstrument.test.ts:32-36`): no quoted path that ends with `/sshd`, no start of an `sshd`, no
  quoted literal that opens with `ListenAddress `, `HostKey `, `AuthorizedKeysFile ` or `PidFile `, in any script, comments included.
  `harnessSites.test.ts:33`: no `os.tmpdir()` and no `mkdtemp`; every folder is the section's owned `pin` folder or below it.
  `itestCallers.test.ts:20`, `:68-69`: a script whose TEXT (comments included) holds `buildSshExecArgv(` or `buildBridgeArgv(` is scanned
  for `knownHostsFile`; the new scripts never write either name. The leftovers guard (`leftovers-check.mjs --profile node --token creds`).
- **Every launch is exe + argv with a time limit; every process is ended by its pid and start time**, never by name, never by a process
  group (`security.md`, *External processes*). Every click is bounded by `finishes` (`itestPinnedRoads.cjs:231`); every leg process by
  `runLeg`'s limit (§3.0).
- **The person's `~/.ssh` is never read and never written by a leg** (the parent's setup, *The client's config*). F7 and F23 show why the
  rows' handed config needs one more line than section 10's, and why `HOME` alone does not do it.
- **Node only.** No Python, also not for a helper. Write files with the Edit or Write tool, never with a shell heredoc.
- **Limits.** Every script at most 800 lines; the test file under ESLint's limits for `src/test` (`max-lines-per-function` 120,
  complexity 4), no new `eslint-disable`. Stage by path; read `git diff --staged --stat` before each commit. Do not push; the lead pushes.
  No revert, no amend, no rewrite of history, never a bare `git stash`, never commit `.claude/settings.json`. No commit holds a red test.
- **No home path of a real user and no user name in a committed text.** Quote a home folder as `~/…` and the run's user in a log line as
  `<user>` (the public-hygiene check).
- **CPU.** Every local run at lowered priority (`npm run itest:ssh-agent` lowers itself and its children; a suite through
  `scripts/run-tests.mjs`). Leg processes run ONE at a time.

## Facts read on `a07e4cac` and measured on 2026-11-24 that this spec uses

| # | Fact | How |
|---|---|---|
| F1 | **The tree.** `fix/g1-e3-release-gate` at `a07e4cac`, `git status --short` empty. E3.S1, E3.S2 and E3.S3 are built and reviewed (the stories document's status line; E3.S3's *Notes for the row stories*) | read |
| F2 | **The tools.** Here: the client `/usr/bin/ssh`, `OpenSSH_10.2p1 Ubuntu-2ubuntu3.8, OpenSSL 3.5.5 27 Jan 2026`; the counterpart through `CREDS_ITEST_SSHD=~/.cache/creds-itest-sshd/sshd-wrap.sh` and `CREDS_ITEST_SSHD_CONFIG=~/.cache/creds-itest-sshd/extra.conf` (the unpacked `openssh-server` `1:10.2p1-2ubuntu3.8`; `research/module_tests.md:2579`, `:2587`). CI: `/usr/sbin/sshd` of the runner, the step `npm run itest:ssh-agent` (`ci-extension.yml:167-168`); `ci · extension` runs on a pull request, a push to `main` and a dispatch (`:8-16`) | read |
| F3 | **Section 10's helpers.** `itestPinnedRoads.cjs`: `AUTH_ATTEMPT` `:39`, `NEW_PAIRS` `:47`, `namesPinFile` `:50`, `productOf` `:53-66`, `removeSocket` `:76`, `isSocket` `:87`, `remoteOf` `:96`, `realSsh` `:115`, `installShim` `:128-143`, `writeClientConfig` `:150-152`, `recordedStarts` `:155-160`, `credentialOf` `:163`, `recordingRunner` `:166-180`, `openLeg` `:183-203` (its `parts` are spread AFTER its own keys, `:200`, so a `mocks` of `parts` replaces its `'../sshExecRunner'`), `startsOf` `:206`, `endLegWithScope` `:216-225`, `finishes` `:231-232`, `runOf` `:235`, `kindOf` `:241-249`, `pinOf` `:252-258`, `lacksNewPairs` `:261-264`, `makeKeys` `:463-471`, `rigOf` `:480-491` (it calls `productOf(out)` itself, `:485`; `rig.env` is the harness's environment without `SSH_AUTH_SOCK`, the shim first on `PATH`, the temp variables on the folder, `:481-483`), `pinnedLegs` `:501-519`, `livePinnedRoads` `:521-544` (the owned `pin` folder, `:536`), exports `:546`. 546 lines | read |
| F4 | **The serving config writes its own lines first.** `servingConfig` (`lib/sshdRun.cjs:108-126`) writes `PasswordAuthentication no` (`:116`) and `LogLevel VERBOSE` (`:119`), then the run's lines (`:122`), then the caller's `extra` (`:123`). `sshd` keeps the first value of a keyword (the module's header; `sshd_config(5)`), so a caller's plain `PasswordAuthentication yes` would not turn password logins on. A `Match` line is refused only in the run's file (`:69-72`) | read |
| F5 | **A `Match all` block turns password logins on, and a counterpart run by the user cannot check a password.** Measured by hand on the unpacked `sshd` 10.2p1 with a config that holds the lines of `servingConfig` and, as its LAST lines, `Match all` and `PasswordAuthentication yes` (`sshd -t` exit 0): a client with `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE=force` and `NumberOfPasswordPrompts=1` was offered `publickey,password`, ended with 255 and `Permission denied (publickey,password).`; the `sshd` log held `Could not get shadow information for <user>`, `Failed password for <user> from 127.0.0.1 port <n> ssh2` and `Connection closed by authenticating user <user> 127.0.0.1 port <n> [preauth]`. A key login to the same counterpart ended with 0. The same config without the `Match` block was not run (F4 is the manual's rule) | measured, outside the tree, nothing kept |
| F6 | **What a VERBOSE log says of a login.** Measured as F5: a key login with a command logs `Connection from 127.0.0.1 port <n> on 127.0.0.1 port <p> rdomain ""`, `Accepted key ED25519 SHA256:… found at <file>:1` (twice; no port), `Postponed publickey for <user> from 127.0.0.1 port <n> ssh2 [preauth]`, `Accepted publickey for <user> from 127.0.0.1 port <n> ssh2: ED25519 SHA256:…`, `User child is on pid <m>`, `Starting session: command for <user> from 127.0.0.1 port <n> id 0`, `Received disconnect …`, `Disconnected from user <user> 127.0.0.1 port <n>`. A `-N` login logs the same without `Starting session`. A `-N -R <socket>:127.0.0.1:<port>` login (the bridge's shape) logs NO line that names the forward. The log does not name the command that ran | measured |
| F7 | **Section 10's handed config lets a call without `-i` look for default identity files.** `ssh -G` under the two lines of `writeClientConfig` (`itestPinnedRoads.cjs:151`) resolves `identityfile ~/.ssh/id_rsa`, `~/.ssh/id_ecdsa`, `~/.ssh/id_ecdsa_sk`, `~/.ssh/id_ed25519`, `~/.ssh/id_ed25519_sk`. With `IdentityFile <an absent file in the owned folder>` and `IdentityAgent none` added it resolves that one file and `identityagent none`; with `-i <key>` as well, the key and that file. Under that config a password login ended with 255 and `Failed password` and printed no warning at `LogLevel=ERROR`; a key login with `-i` ended with 0. A pinned call of a password entry has no `-i` (`sshExecCommand.ts:229-231`) | measured |
| F8 | **The world.** `personRoadsWorld.ts`: `Parts.answer` `:102` (a promise holds a question open); the stand-in of `../sshExecAuth` `:205-217`, installed unconditionally (`:253`) and REPLACING the whole module; `parts.mocks` comes LAST (`:249-260`); the dialogs push into four separate arrays (`:179-188`), so the order across info, warning and error is lost; the entry is ONE snapshot for the world's life (`detailsOf` `:269-271`); the host's `storage` has `getAccounts`, `getNodes` and `getNode` only (`:294`); `pinFiles` lists every `known_hosts-*` of `keys/<pid>/` (`:156-159`), `known_hosts-e1` included | read |
| F9 | **The real resolve hands the process's own environment, and reads a vault.** `resolveExecAuth` (`sshExecAuth.ts:115-125`) asks `resolveSshCredential` (`sshCredential.ts`), which reads `storage.getPrivateKey(accountId, id)`, the entry's `sshKeyPath`, and `storage.getPassword(accountId, id)`, each opened by the click's opener (`clickOpener`, `pinClick.ts:57-66`: `needsDoor` reads `isWaiting`, `rotationQuarantine.ts:611-613`, which reads `storage.heldRotations.listed()`) or the check's (`automaticOpenerFor`, `automaticRead.ts:23-25`). A stored value is a plain string (`storedSecret.ts`), opened as it is when it is no envelope (`openStored`, `pinGate.ts:80-89`). It answers `env: { ...process.env }` for a key file (`sshExecAuth.ts:151`) and a stored key (`:172`, with `materialized: keyPath`), and `{ ...process.env, ...askpassEnv(…) }` for a password (`:91-98`). So in the harness's own process the roads' `ssh` would start without the shim and without the handed config; in a process whose `process.env` is the leg's, it starts through both | read |
| F10 | **The files of a call.** A stored key is written per call under a name of its own (`materializeCallKey`, `keyInstaller.ts:193`); a password call writes `keys/<pid>/askpass.sh` (`writeAskpassScriptFile`, `:229-236`; the name, `sshAskpass.ts:33`), the SAME name for every password call, holding no secret (`printf %s "$CREDS_SSH_PASSWORD"`). A call deletes only its `materialized` key and its pin (`writtenKey.ts:52-64`); the rest goes with the purge on activate and deactivate (`keyInstaller.ts:298`) | read |
| F11 | **The asker.** `pinClientAsker` (`pinClient.ts:84`) runs `-V` through `runSshExec` of `./sshExecRunner` (`:3`, `:85`) and keeps a `knows` answer by program word, folder and `PATH` (`:93`); `windowPinClient = pinClientAsker()` (`:116`) is what `personPinWriter` asks (`personPin.ts:74-75`). A new world evicts the modules of `out/`, so its `windowPinClient` is new: cold. Two calls at once on a cold asker each start `ssh -V` (the answer is read after the `await`; read, not run) | read |
| F12 | **The roads.** *Install creds on host*: the resolve and the pin `agentCommands.ts:273`, the probe `:282-283`, the question `:302`, the install run `:318`. *Open Remote Bridge…*: `isOpen` `:394`, before its first `await` (`:415`); the bridge `:455`; its check `void verifyBridgeSocket` `:468`. The check: its resolve and pin `:194`, the sweep `:208`, 1.5 s `:210`, the mode run and `hostKeyTold` `:213-216`. `SshBridgeManager.start` replaces an open bridge of the same key (`sshBridgeManager.ts:78-94`) | read |
| F13 | **The install's stand-in, as P1 proved it.** `installStandIn(rig, nonce)` (`itestProbeInstall.cjs:39-58`) answers `{ extra, bin, records, marker, env, files }`, `extra` being `SetEnv PATH=<standin>/bin:/usr/local/bin:/usr/bin:/bin`; `listingOf` `:71-74`; `tmpNames`, `startsIn`, `exactly`, `curlArgv`, `shArgv` `:77-88` are private; P1's button `:111`; exports `:209` (209 lines). P1 worked with that line on 10.2p1 (`research/module_tests.md:2592`) | read |
| F14 | **The record of identities reads one level.** `recorded(dir, name)` reads `program.json` and `session-programs.json` only in the folders directly under the section's folder (`itestIdentities.cjs:79-83`); the shim is the fixed entry `shim/ssh` (`:107`); `filesNamed` walks every depth (`:65-76`) | read |
| F15 | **E1's words.** At `f3e9887d`, `hostKeyWords` of a pin wrote `StrictHostKeyChecking=yes`, `UserKnownHostsFile=<file>`, `GlobalKnownHostsFile=<file>` (`hostKeyPin.ts:162-168` there). Now: `withoutSources` (`test/pinnedArgv.ts:96`) takes E2's three options (`PIN_SOURCE_OPTIONS`, `:26`) out of an argv; `HOST_KEY_OPTIONS` `:51` | read |
| F16 | **The sentences of §3.5.** A: `unusablePinSentence(name, auth)` (`personPin.ts:34`), two forms; B: `pinWriteFailedSentence(name, error)` (`:42`); C: `refusedHostKeySentence` (`hostKeyPin.ts:427`); D: `unnamedHostKeySentence` (`:443`); E: `pinPathSentence(name, kind)` (`:285`) for the eight kinds of `PIN_PATH_KINDS` (`:143`); F: `pinClientSentence(name, exitCode)` (`:293`). `personPin.ts` imports no `vscode` | read |
| F17 | **The guards.** As *Binding constraints* | read |
| F18 | **Section 10's run today.** 63 `ok` lines of section 10 and 182 of the whole script, three runs, about 38 s each (`research/module_tests.md:2579`) | read |
| F19 | **`pinFor` cannot be imported.** `itestFeasibility.cjs:236` runs its `main` when the file is loaded; its `pinFor` is `:134-141` | read |
| F20 | **`ssh-agent-itest.cjs` has 773 lines**; it calls `livePinnedRoads` (`:235`) and does not change here | read |
| F21 | **The C20 wait of a cold question, seen by P7:** the program that never answered was ended at 10.0 s (`research/module_tests.md:2589`). M1 adds the other number: the wait of a normal run | read |
| F22 | **The real resolve works in a leg process.** Measured on the unpacked `sshd` 10.2p1 in a scratch worktree of `a07e4cac` (removed after; the world there widened by hand with a real-resolve switch and a vault in the host, as §4.4 says): a child Node process started with the rig's environment and `HOME` an owned folder, the world loaded with the real resolve, `realForget` and `realClient`, one counterpart taking passwords. *Stored key:* the install's probe and the bridge with its check each named a key file `keys/<pid>/call-<uuid>.key` of their own (the probe one, the check one for its two runs), all of them exit 0; while the bridge was open the folder held its key file and its pin file only; after *Close* the folder was EMPTY. *Named key:* the probe named `-i <the user key>`, exit 0, nothing written. *Password:* the probe ended with 255 `Permission denied (publickey,password).`, the product warned "Cannot install on "box": the host did not answer the probe, …", and the folder held `askpass.sh` only. The shim recorded, per leg, the question `-V` first and then each connection start (stored: `-V`, the probe, the bridge, the sweep, the mode check). The counterpart logged 5 `Accepted publickey` and 1 `Failed password`. In the child `process.env.PATH` began with the shim's folder | measured |
| F23 | **`HOME` does not move the client's `~`.** In the same run, the real client started with `-v` and `HOME=<the owned folder>` looked for `<the real home>/.ssh/id_rsa` … `id_ed25519_sk` (`debug1: identity file … type -1`, `Will attempt key`, `Trying private key`): OpenSSH takes `~` from the password database, not from `HOME`. So the leg's `HOME` keeps the Node side (`os.homedir()`) in the owned folder, and the handed config's `IdentityFile` line (F7) is what keeps the client off the person's keys | measured |
| F24 | **The real resolve's `materialized` is what deletes a stored key.** The same scratch run with `materialized: keyPath` taken out of the compiled `sshExecAuth.js` (`:172` of the source): after the install the folder held one `call-<uuid>.key`, and after the bridge leg three; with it, none. The world's stand-in replaces that whole module (F8), so the same fault stays green under it | measured |
| F25 | **CI now.** The CI run 45362452230 (a dispatch on this branch at `a07e4cac`, read by the lead) passed leg 0 and R1-R6; the runner's client and `sshd` are `OpenSSH_10.2p1 Ubuntu-2ubuntu3.8` now, not 9.6p1 | the lead |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs`.

1. `node $LP npm run compile` — **read its exit first.**
2. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`.
3. `node $LP npm run typecheck`, `node $LP npm run lint`, `node $LP npm run ratchet`; `npm test` (the whole suite).
4. A script's syntax: `node --check scripts/<file>.cjs`.
5. The proving run (§9): `CREDS_ITEST_SSHD="$HOME/.cache/creds-itest-sshd/sshd-wrap.sh" CREDS_ITEST_SSHD_CONFIG="$HOME/.cache/creds-itest-sshd/extra.conf" npm run itest:ssh-agent`.
6. From the repository root: `node .agents/conventions/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"`; `node .agents/conventions/tools/plan-lifecycle.mjs`; `node .github/scripts/public-hygiene.mjs`.

## 1. The decisions

### 1.1 The rig is one file; its pure rules are a lib beside it

A row-story imports `scripts/itestRowRig.cjs` and nothing else of E3.S4. The rig re-exports what a leg needs of the lib. The pure rules
(how a start, a connection start, an authentication attempt and an accepted login are counted; the sentences of §3.5; the handed config's
text; how a leg process's output lines are read) live in `scripts/lib/rowRecord.cjs`, which reads no variable, no file and no process when
it is loaded, as `lib/sshdRun.cjs` does for the instrument. Why: the rules are what decision 15 is about, and a unit test must hold them
without loading the harness. The rig's budget is 760 lines; if it would pass 790, STOP and tell the lead (the brief names one file).

### 1.2 Each leg in a process of its own, in a folder of its own

- **Why a process.** The real resolve hands `ssh` the PROCESS's environment (F9). The harness's own `process.env` has no shim on `PATH`,
  and changing it for a leg would change it for the whole harness (other sections, the end of a server, the record). A child process whose
  environment IS the leg's gives the real resolve the leg's environment with no change of the product and no global change of the harness
  (F22).
- **Its environment** (built by the parent): `rig.env` of the leg (F3: the harness's variables without `SSH_AUTH_SOCK`, the shim first on
  `PATH`, the temp variables on the leg's folder, `CREDS_ITEST_SSHD`, `CREDS_ITEST_SSHD_CONFIG` and `CI` as the harness has them), and
  `HOME` = `<leg>/home` (an owned, empty folder: the Node side reads no file of the person; F23 says it does not move the client's `~`).
  At its start the leg process checks it: `the leg process: PATH starts with the leg's shim folder, and HOME is the leg's home folder`.
- **Its folder.** `legRig(top, name)` (parent side) makes `<pin>/<name>/` and calls `rigOf(top.scope, dir, top.out, top.product)`
  (widened, §4.1): `shim/`, `records/`, `storage/`, `home/`, its handed config, its `authorized_keys`, and `given.json` (mode 0600: the
  paths of `top`'s keys, the pin, the real client's path, the run's password, the row and the leg). So each leg has its own `keys/<pid>/`
  (its files are its own, M6), its own record of starts (its counts are its own), and its own handed config. Its counterparts are started
  by the leg process in its folder (`<pin>/<name>/<counterpart>/`), so the record of identities walks every depth (§4.3).
- **How section 10 sees it.** `runLeg(check, top, row, leg)` starts `process.execPath` with `[<rig file>, '--leg', <leg folder>]`, the
  argv as separate arguments, stdin closed, bounded (a limit per leg, 300 s; then SIGTERM to its pid, SIGKILL 10 s later, each only while
  its start time is the recorded one). It reads the child's standard output line by line: `ok  <name>` and `FAIL <name> — <detail>` become
  calls of section 10's own `check` (so each check of a leg is a check of the section's run), `info  …`, `evidence …` and anything else are
  printed as they are. Then it checks `<leg>: the leg process ended with 0 within <limit>` and removes every bridge socket that the leg's
  `evidence.json` names (a SIGKILL of the child cannot strand one). Legs run one after another.
- **The leg process's own end.** It is the rig file run as `node itestRowRig.cjs --leg <folder>`: `harnessScope.run(main)` with one
  `sectionScope` that owns no folder (the folder is the parent's); its counterparts, clients, bridges, held runs and the sampler are
  registered with that scope at the moment they are made. It loads `productOf(out)` once, then the row file's leg (`require` of
  `itestRowM1.cjs`, `itestRowM6.cjs` or `itestRigProof.cjs`, each exporting `legs: { <name>: async (ctx) => … }`), and runs it with a `ctx`
  (its `check`, its leg rig, `product`, `real`, `password`).

### 1.3 The roads run the REAL resolve over a disposable vault (the lead's answer A1)

The world gets the real `resolveExecAuth` (`Parts.realResolve`, §4.4: the stand-in of `../sshExecAuth` is then NOT installed) and a vault
(`Parts.vault`) that the host's `storage` answers. Each leg chooses the entry's credential by the vault alone; everything after that is
the product's:

| Credential | The vault | What the real resolve then does (F9, F22) |
|---|---|---|
| `stored` | `{ privateKey: <the text of top.storedKey> }` → `storage.getPrivateKey` | `byStoredKey`: `materializeCallKey` writes `keys/<pid>/call-<uuid>.key` per call, answered with `materialized` |
| `named` | `{ keyPath: top.userKey }` → the entry's `sshKeyPath` | the key file branch: `-i <that path>`, nothing written |
| `password` | `{ password: top.password }` → `storage.getPassword` | `byPassword`: `writeAskpassScriptFile`, the askpass environment |

The host's `storage` also answers `heldRotations.listed()` with no entry, so the openers find nothing waiting (`rotationQuarantine.ts:611`).
The entry carries no `pinProtected` and the values are plain text, so no PIN is asked (`pinClick.ts:57-66`, `pinGate.ts:80-89`).
`top.password` is `not-a-password-<uuid>`, a random value of the run; it reaches only the run's own counterpart, which cannot check it
(F5); it stands in `given.json` (mode 0600, in the owned folder) and is never printed. The stored key is a throwaway key of the run.

### 1.4 The rows' handed client config

`handedClientConfig(dir)` of the lib, written to `leg.clientConfig` (the shim's `-F`): `Host *`, `UserKnownHostsFile /dev/null`,
`GlobalKnownHostsFile /dev/null` (section 10's two lines, so a call without the pin words is a first contact that writes nothing),
`IdentityFile <dir>/no-default-identity` (a file that is never made) and `IdentityAgent none`. F7 and F23: without the last two, a password
call looks for the person's `~/.ssh/id_*`, whatever `HOME` says. The person's `~/.ssh/config` is not read because the shim hands `-F`.
Section 10's own legs keep `writeClientConfig` (they always pass `-i`).

### 1.5 A counterpart that takes passwords

`counterpart(…, { passwords: true })` appends `PASSWORD_LINES` = `Match all`, `PasswordAuthentication yes` as the LAST lines of `extra`
(F5; a `Match` line takes in every line after it, so nothing may follow). `lib/sshdRun.cjs` refuses a `Match` line only in the run's file
(F4), and E3.S2's header expects a caller's `Match` block. The key legs' counterparts do not take passwords.

### 1.6 The four counts, as the lib counts them (decision 15)

| Count | Source | Rule |
|---|---|---|
| a START of the client | the leg's shim records (`recordedStarts`), after the leg's mark | every record; the QUESTION is a record whose argv is exactly `-V` |
| a CONNECTION START | the same | a record whose argv holds `--` followed by one more word (the destination: `sshExecCommand.ts:239`; the bridge writes the same, `sshBridge.ts:239`). By road: the probe and the install run → *install*; `-N` → *bridge*; the sweep and the mode check → *check* (section 10's `kindOf`, moved to the lib) |
| an AUTHENTICATION ATTEMPT | the counterpart's log after the leg's mark | the number of distinct client ports named by the lines that match `AUTH_ATTEMPT` (moved, unchanged), and at least 1 when any line matches (`Accepted key … found at` names no port); 0 only when no line matches at all |
| an ACCEPTED LOGIN | the same | each `Accepted <method> for <user> from 127.0.0.1 port <n>` line, with its port, its method, and its SESSION: `command` (or `forced-command`, `shell`, `subsystem`) when a `Starting session: <kind> for <user> from 127.0.0.1 port <n>` line names the same port, else `none` (a `-N` login, F6) |

Beside them, per counterpart: `connections` (`Connection from` lines) and `passwords` (`{ failed, accepted }` of `Failed password for` and
`Accepted password for` lines). "With the command that ran and the exit code": the log names the KIND of session per port, not the
command (F6); the evidence lists the logins with their session kinds AND the leg's runs with their command and exit code (§3.9), and a
check pairs them by kind and count. That is the most the log gives; §14 says so. A road with no start in the leg is listed with 0 starts.

### 1.7 Cold and warm, made by the leg

- **Cold:** a leg opens a NEW world in its own process; the world evicts the modules of `out/`, so the product's `windowPinClient` is new
  and has asked nothing (F11). The world runs with `realClient` (the product's own asker). The rig's observer of `./sshExecRunner` (the
  request that `pinClient.ts:3` writes) calls the real runner and records each run whose argv is exactly `-V`: when it started, how long
  it took, and its exit code. The evidence says `state: "cold"` and shows 0 such runs before the leg's first click. That observer is the
  timer of the question (C20); it changes nothing of what the asker gets.
- **Warm:** `warm(check, leg, roads)` makes one pinned call to K1 in the SAME world (a click of *Install creds on host*, its question
  dismissed), checks that it started exactly one question and that the probe ran, and then MARKS the leg: the leg's counts start after the
  mark (starts, `-V` runs, outcomes, every counterpart's log length). A leg that needs another pin then calls
  `roads.w.replaceHostKey(text)` (§4.4). The evidence says `state: "warm"`. No leg takes a state over from another: every leg is its own
  process and opens its own world.

### 1.8 The gate, the sampler and the calls of a leg (the instruments of M6)

- **The gate** (`openRoads(…, { gate: true })`): around section 10's recording runner, it holds the FIRST run of each call (a run whose
  argv names a pin file not seen before; `pinOf`, `itestPinnedRoads.cjs:252`) before the real runner is called, until the leg releases that
  pin file. It changes no argv, no environment and no outcome; the time limit of a run starts inside the real runner, so a held run cannot
  time out. `gate.held()`, `gate.waitHeld(n, ms)`, `gate.release(pinFile)`, `gate.releaseAll()` (registered with the leg process's scope at
  once, so a failed leg never leaves a click waiting).
- **The sampler:** every 50 ms while the leg runs, and once more at each named point of the leg, it reads `<storage>/keys/<pid>/` (the
  leg process's pid): each name with its SHA-256. `samples()` answers them with their times.
- **The calls of a leg** (`callsOf`): one call per DISTINCT pin file in the leg's argvs (the runner's runs and the bridges' spawns): its
  road, its pin file, its key file (a `-i` path inside `keys/<pid>/`: a stored key only), `from` (its first held run, its first run, or its
  spawn) and `to` (its end: the click that settled for an install, the last run's outcome for a check, the `exited` of its process for a
  bridge). A recording spawner around the product's `bridgeSpawner` records each bridge's argv, spawn time, `exited` time and exit code,
  and keeps `kill` working. Section 10's runner records each run's start time too.

### 1.9 The evidence

At its end every leg prints ONE line `evidence <json>` and writes `<leg>/evidence.json` (the folder goes with the section). Fields:
`record: 1`, `row` (`M1`, `M6`, `rig`), `leg`, `state`, `credential`, `pid` (the leg process); `counterparts[]` (`name`, `key` `K1`/`K2`,
`port`, `extra`, the counts of §1.6, the matching log lines verbatim); `starts` (`total`, `questions`, `connectionStarts`, `byRoad`, the
list with pid, start time, kind, road); `question[]` (each `-V` run: `startedAt`, `ms`, `exitCode`); `runs[]` (road, kind, exit code,
`timedOut`, stderr verbatim); `bridges[]` (pid, remote socket, spawn and end times, exit code); `said[]` (`World.said`, in order);
`calls[]` (pin file, key file, road, `from`, `to`, how many samples fell in its life); `keysFolder` (the last sample); `sockets[]` (path,
left or not). No environment, no password, no key text. A value that could not be read is `null`, never `0` (`coding-style.md`, *Absent is
not zero*).

### 1.10 The identities

The rows run inside section 10's run, so section 10's one record (`recordIdentities`, after the rows) covers them, once `recorded` and the
shims walk every depth (§4.3). The leg processes run the same `node` and the same real client as the section; R7 is added as the walk's
companion.

## 2. `scripts/lib/rowRecord.cjs` (new)

`'use strict'`, a header that names decision 15 and this spec, `node:path` only. Exports and behaviour:

| Export | Behaviour |
|---|---|
| `AUTH_ATTEMPT` | moved from `itestPinnedRoads.cjs:39`, byte for byte, with its comment |
| `kindOf(argv, commands)` | moved from `:241-249`, byte for byte |
| `isQuestion(argv)` | `argv.length === 1 && argv[0] === '-V'` |
| `isConnectionStart(argv)` | `argv` holds `--` and at least one word after it |
| `roadOf(kind)` | `probe`, `install` → `install`; `bridge` → `bridge`; `sweep`, `mode` → `check`; else `undefined` |
| `logCounts(log, user)` | `{ connections, authAttempts, attemptPorts, accepted: [{ method, port, session }], passwords: { failed, accepted }, lines }` by §1.6; `user` is matched literally |
| `sentencesOf(parts, name)` | the texts of §3.5 for `name`: both forms of A, the opening of B (`pinWriteFailedSentence(name, new Error(MARK))` up to `MARK`), C, D, E for EVERY key of `parts.PIN_PATH_KINDS`, F for `null`, and the opening of F with an exit code (cut at a mark number). `parts` holds the six functions and `PIN_PATH_KINDS` (the product's; the lib imports none) |
| `saysASentence(text, sentences)` | whether `text` holds one of them |
| `handedClientConfig(dir)` | the text of §1.4, lines ended by `\n` |
| `PASSWORD_LINES` | `['Match all', 'PasswordAuthentication yes']` |
| `e1Words(words, withoutSources, hostKeyOptions)` | `withoutSources(words)`; it throws unless the result names exactly the three options of `hostKeyOptions`, each once (E1's words, F15) |
| `legLine(line)` | one output line of a leg process, read: `{ kind: 'check', ok, name, detail }` for `ok  …` and `FAIL … — …`, else `{ kind: 'print', text }` |

`itestPinnedRoads.cjs` imports `AUTH_ATTEMPT` and `kindOf` from it; nothing else of section 10 changes for that.

## 3. `scripts/itestRowRig.cjs` (new): the common rig

Header: what the rig is (the parent's setup, built once; decisions 15 and 16), that every row-story drives the roads through it, that the
roads run the real resolve in a leg process (§1.2, §1.3), and that only `vscode` is a stand-in there. Imports: section 10's widened exports
(§4.1), `startServingSshd`, `stopListener`, `endServer`, `alive`, `startOf`, `descendantsOfListener` (`itestServing.cjs`), `endChild`,
`checkedPinOf` (`itestSshd.cjs`), `within`, `runClient`, `tool` (`itestNoSharing.cjs`), `installStandIn`, `listingOf`, `tmpNames`,
`startsIn`, `exactly`, `curlArgv`, `shArgv` (`itestProbeInstall.cjs`), `harnessScope`, and the lib. Every function below is exported;
3.0 and 3.1 run in section 10's process, the rest in the leg process.

| # | Function | What it does |
|---|---|---|
| 3.0 | `runLeg(check, top, row, leg)` and the entry `--leg` | §1.2: `legRig`, `given.json`, the bounded leg process, the relay of its lines (`legLine`), the check of its end, the removal of the sockets its evidence names. The entry (`require.main === module`) reads `given.json`, checks its environment (§1.2), and runs the leg |
| 3.1 | `rowsTop(check, pinned)` | once per section: generates `stored_key` in `pinned.dir` with `tool('ssh-keygen', …)` as `makeKeys` does, makes `password`; answers `{ ...pinned, storedKey, password }` (a new object). Check: `the rows' stored key was generated` |
| 3.2 | `legRig(top, name)` | §1.2: the folder, `rigOf(top.scope, dir, top.out, top.product)` with `k1`, `k2`, `userKey`, `storedKey`, `pin` (K1's) of `top`; its own `authorized_keys` (the user key and the stored key, one line each); `home/`; `handedClientConfig` written to its `clientConfig`; `installShim`. `known_hosts-e1` is NOT made here (M6 makes it). In the leg process the same object is rebuilt from `given.json` with the process's own scope |
| 3.3 | `counterpart(check, leg, name, hostKey, { port, extra = [], passwords = false })` | the ONE call of `startServingSshd` in the scripts of the rows (RR6): `extra` then `PASSWORD_LINES` when `passwords`; the check `<leg>: <name> listens …`; its end registered with the scope at once (what it forked listed first, then `endServer` with the leg's recorded starts, as `itestFeasibility.cjs:119-122`); answers the server, or `undefined` |
| 3.4 | `endCounterpart(check, leg, server, name)` | `descendantsOfListener`, then `endServer(server, <the leg's starts>, taken)`; the check `<leg>: <name> and every process it forked are gone` |
| 3.5 | `openRoads(leg, port, { credential, answer, gate = false })` | a NEW world through `openLeg(leg, port, parts)` (widened, §4.1) with `realResolve: true`, `vault` (§1.3), `realClient: true`, `realForget: true`, `mocks` = `'./sshExecRunner'` (the observer of §1.7, calling the real runner), `runnerOf` = the gate (§1.8) when asked, `spawn` = the recording spawner, `answer`. Registers with the scope: `gate.releaseAll`, `bridges.dispose`, and `removeSocket` of every bridge's remote path at its spawn. Starts the sampler. Answers `roads` `{ w, outcomes, bridges, questions, gate, sampler, marks }` |
| 3.6 | `installAnswer(leg, roads)` | the `answer` of the install's question: the button that `confirmationFor(interpretProbe(<the probe's stdout>), ROW.node.name)` names, only for the message that `confirmationFor` builds; any other question is dismissed (P1's `button`, `itestProbeInstall.cjs:111`, made exact). A `held` form answers only when the leg releases it (the switch) |
| 3.7 | `warm(check, leg, roads)` | §1.7. Check: `<leg>: warm: the warming call started ONE question ssh -V and its probe ran` |
| 3.8 | `mark(leg, roads, servers)` | the leg's mark: records, `-V` runs, outcomes, bridges, `World.said` and each server's log length |
| 3.9 | `countsOf(leg, roads, servers, commands)` | the four counts after the mark (§1.6), per road and per counterpart; the runs (`road`, `kind`, `exitCode`, `timedOut`, `stderr`) and the bridges' exits |
| 3.10 | `theSwitch(check, leg, from, { name, hostKey, extra, passwords, stop })` | the parent's *the switch*, while the install's question is held open: `stop: 'whole'` ends `from` by `endCounterpart`; `stop: 'listener'` by `stopListener` (its `taken` kept for the leg's end); then `counterpart(…, { port: from.port })`. Check: `<leg>: the switch: <from> stopped (<stop>) and <name> listens at its port` |
| 3.11 | `pinFileOf(leg, name, port, keyFile)` | a file in the leg's folder that holds the host key's line for `[127.0.0.1]:<port>` (`knownHostsLine`), and `await checkedPinOf(out, file)` of it. A near copy of `pinFor` (F19): `itestFeasibility.cjs` cannot be imported |
| 3.12 | `controlClient(leg, { port, pinFile, words, command = 'true' })` | the parent's *control client*: the REAL client by its path (never the shim), `runClient(leg, leg.clientConfig, [...words, '-i', leg.userKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-p', port, '<user>@127.0.0.1', command], leg.env, real)`; `words` defaults to E1's words of a checked pin (`e1Words`). Answers `{ argv, code, stdout, stderr }` |
| 3.13 | `callsOf(leg, roads, product)` | §1.8 |
| 3.14 | `callFilesHold(check, label, leg, roads, calls, expected)` | the M6 file checks over the samples (§7.3) |
| 3.15 | `nothingLeft(check, label, leg, roads, calls)` | after the last end (5 s): no pin file and no key file of these calls in `keys/<pid>/`; no client of the leg alive (shim pids and start times); no bridge's socket left; what else the folder holds is listed by name and SHA-256 |
| 3.16 | `noSentence(check, label, leg, roads)` | no entry of `World.said` after the mark holds a sentence of §3.5 (`sentencesOf` with the product's functions, F16) |
| 3.17 | `evidence(leg, roads, servers, fields)` | §1.9 |

`productOf` gains `personPin.js` (for A and B): it imports no `vscode` (F16). A row file calls only these functions and `ctx.check`; it
never calls `startServingSshd`, `world`, `stopListener` or `endServer` itself (RR6), and never names `sshExecAuth` or `pinClient` (RR7).

## 4. Changes to existing files

### 4.1 `scripts/itestPinnedRoads.cjs`

- `AUTH_ATTEMPT` and `kindOf` come from `lib/rowRecord.cjs` (§2); the two definitions leave this file.
- `recordingRunner` pushes `{ argv, startedAt, outcome }` (`startedAt` is `performance.now()` at the call), nothing else changes.
- `openLeg(rig, port, parts = {})`: `const { mocks = {}, runnerOf = (runner) => runner, ...rest } = parts;` and the world gets
  `mocks: { '../sshExecRunner': runnerOf(recordingRunner(product.runner, outcomes)), ...mocks }`, then `...rest`. With no `mocks` and no
  `runnerOf` (section 10, P1, P2) it is what it was. The `clicks` and `checks` it passes are not read when `realResolve` is on.
- `rigOf(section, dir, out, product = productOf(out))`.
- `pinnedLegs` (`:515-518`): after `listenerStopLeg`, `const top = await rowsTop(check, pinned);` then `rigProof`, `rowM1`, `rowM6`, each
  `(check, top)` (each calls `runLeg` per leg), then `recordIdentities`. The header names the three files and the leg processes.
- Exports (`:546`) add: `pinOf`, `remoteOf`, `removeSocket`, `isSocket`, `lacksNewPairs`, `NEW_PAIRS`, `namesPinFile`, `runOf`, `since`,
  `VERIFY_FAILED`, `literal`, `occurrences`, `recordingRunner`.

### 4.2 `scripts/itestProbeInstall.cjs`

Exports (`:209`) add `tmpNames`, `startsIn`, `exactly`, `curlArgv`, `shArgv`. No other line changes; P1 is not run again.

### 4.3 `scripts/itestIdentities.cjs`

- `recorded(dir, name)` walks every depth (as `filesNamed`) and names each counterpart by its folder relative to the section (`m1/k1`).
- The shims: every file `ssh` in a folder named `shim`, at any depth, is a config entry `{ file, sha256 }`; the fixed `shim/ssh` entry
  (`:107`) goes (the walk finds it).
- **R7** (new check): `every program.json under the section's folder is a listener of the record` — the count of `program.json` files
  by `filesNamed` equals the count of listener entries. It fails when `recorded` misses a depth (MU7).

### 4.4 `src/test/personRoadsWorld.ts`

- `Parts.realResolve?: boolean`: the stand-in of `../sshExecAuth` (`:253`) is NOT installed, so the registered commands call the
  product's `resolveExecAuth`. Docblock: why (E3's rows: only `vscode` is a stand-in; the stand-in replaces the whole module, so a fault of
  the real one stays green under it, F24).
- `Parts.vault?: { privateKey?: string; keyPath?: string; password?: string }`: the host's `storage` (`:294`) gains
  `getPrivateKey: () => Promise.resolve(vault.privateKey)`, `getPassword: () => Promise.resolve(vault.password)` and
  `heldRotations: { listed: () => Promise.resolve([]) }`; `keyPath` becomes the entry's `sshKeyPath`. Without `vault` the host is what it
  was. (Shape measured in F22.)
- `World.said: { kind: 'info' | 'warning' | 'error' | 'pick' | 'log'; text: string }[]`: `dialog` pushes `{ kind, text }` as it pushes
  into its array, and the `log` of the host pushes `{ kind: 'log', text }`. The four arrays stay.
- `World.replaceHostKey(hostKey: string | undefined): void`: from the next read on, the storage answers a NEW snapshot with that `hostKey`
  (field left out for `undefined`); the old snapshot is not changed. Docblock: why (a warm leg of M4 and M9 changes the pin in the same
  window).
- No existing suite changes; `npm test` shows it.

## 5. The rig's own proof: `scripts/itestRigProof.cjs` (`rigProof(check, top)`, `legs`)

Not a row: it shows that the parts that no row of E3.S4 uses work, before E3.S5 and E3.S6 use them. Its numbers are "seen when it was
built". Each part is a leg of its own (`rig-…`), in its own leg process, with its evidence line, with the real resolve.

| # | Leg | Shows |
|---|---|---|
| RP1 | `rig-warm`, named key, K1 | cold: the first click of *Install creds on host* (question dismissed) started ONE question and one connection start; `warm` marked the leg; `w.replaceHostKey(<K2's pin>)`; a second click started 0 questions and one connection start, ended 255 with the verification line, showed sentence C once; K1's accepted logins did not grow. So the state is made by the leg and the replaced snapshot is read |
| RP2 | `rig-switch-whole`, named key, K1 with the stand-in | the install's question held; `theSwitch(…, { stop: 'whole' })` puts K2 (with the same `extra`) at K1's port; the question answered: the install run starts once, ends 255 with `Host key verification failed.`; K2 logs 0 authentication attempts; the stand-in's marker was not written |
| RP3 | `rig-switch-listener`, the same with `stop: 'listener'` | the same, and K2 took the port after the listener-only stop (E3.S2 §19 left that unmeasured); K1's sessions are ended at the leg's end |
| RP4 | `rig-control`, K1 and K2 | the control client with E1's words (three pairs, F15) and a pin file of K1: against K1 exit 0 and one accepted login; against K2 at another port, with the pin of K1 for that port: exit 255 and the verification line, K2 0 authentication attempts |
| RP5 | `rig-resolve`, each credential once, K1 taking passwords | the real resolve in the leg process: the shim recorded the question and the probe of each click (so the roads' `ssh` went through the shim); the stored key's probe named a `keys/<pid>/call-<uuid>.key` that is gone after the click; the named key's probe named `-i <top.userKey>` and wrote nothing; the password's probe ended with 255 and K1 logged `Failed password` (F22) |

## 6. M1: `scripts/itestRowM1.cjs` (`rowM1(check, top)`, `legs`)

**The leg** `m1`: the entry pinned to K1, a key named by its path (`vault.keyPath`), cold, the real resolve. K1 is `counterpart(…, 'k1',
top.k1, { extra: standIn.extra })` with `standIn = installStandIn(leg, nonce)`. Before the first click: `listingOf()`, `tmpNames()`. Then
*Install creds on host* (`installAnswer`, within 200 s), *Open Remote Bridge…* (30 s), the socket check (40 s), *Close Remote Bridge*
(5 s), as section 10's leg 1 does (`installAsks`, `bridgeIsChecked`, `closeEnds` are its shape; the install now runs to its end).

| # | Check (`M1: …`) | M1's words it holds |
|---|---|---|
| M1.1 | K1 listens (from `counterpart`) | the counterpart K1 |
| M1.2 | the leg is cold: a new world in a new process, and 0 runs of `-V` before the first click | "the run is cold" |
| M1.3 | *Install creds on host* ended within 200 s; the probe ended with 0 and no blocker; ONE question, the one `confirmationFor` builds; its button was given | "the install to its end" |
| M1.4 | the install run ended with 0; `interpretInstall` answered `installed` with `<standin>/bin/creds`; the world showed the product's message for it | "the install to its end through the stand-in" |
| M1.5 | *Open Remote Bridge…* ended within 30 s and the bridge is open; the forwarded socket exists while it is open (5 s) | "the forwarded socket exists while the bridge is open" |
| M1.6 | the check ran within 40 s: the sweep and the mode check each ended with 0; the mode is owner-only | "the check reads its mode" |
| M1.7 | *Close Remote Bridge* ended the bridge's `ssh` within 5 s | the bridge's run ends |
| M1.8 | the shim recorded 6 starts, each whole: ONE question `ssh -V` and 5 connection starts: the probe, the install run, the bridge, the sweep, the mode check | "beside the 5 connection starts the record holds exactly ONE question" |
| M1.9 | the question started before the first connection start (the shim's start times); `info  M1: the question ssh -V took <n> ms (C20, the wait of a normal run)`, from the observer's one `-V` run | "started before the first connection; how long it took is recorded" |
| M1.10 | each of the 5 connection argvs says `StrictHostKeyChecking=yes`, ONE path as both known-hosts files, `VerifyHostKeyDNS=no`, `KnownHostsCommand=none` and `LogLevel=ERROR`, each once (`pinOf`, `lacksNewPairs`) | "each of the 5 recorded argvs holds …" |
| M1.11 | the probe and the install run name one path, the sweep and the mode check one path, the bridge its own: 3 distinct paths, each `keys/<pid>/known_hosts-e1-<uuid>` | "3 distinct paths" |
| M1.12 | K1 logged exactly 5 accepted logins: 4 with a `command` session and 1 with none; 5 client ports reached authentication; the 4 runs of the runner ended with 0 | "exactly 5 accepted logins, one per run" |
| M1.13 | no message and no log line of the leg holds a sentence of §3.5 (`noSentence`) | "no sentence of §3.5 is shown" |
| M1.14 | the stand-in's marker holds the run's nonce | "the stand-in's marker holds the run's nonce" |
| M1.15 | condition (1): the install run passed the real authentication (one of the 5, a `command` session) and its command ran to its end (M1.4) | the four conditions, each by its own evidence |
| M1.16 | condition (2): the stand-in's `env` says `PATH=<standin>/bin:…`, and `command -v curl` and `command -v sh` answer the stand-ins | as above |
| M1.17 | condition (3): the stand-in `curl` recorded ONE start with `-fsSL`, `INSTALLER_URL`, `-o`, `/tmp/creds-install.<n>.sh`; the stand-in `sh` ONE start with that script (`exactly`, `curlArgv`, `shArgv`) | as above |
| M1.18 | condition (4): the listing of `/usr/local/bin/creds` and every `/tmp/creds-install.*` is the same before and after; no new name in `/tmp` is `creds-*` or an owned name (each new name printed as `info`) | as above |
| M1.19 | nothing left (`nothingLeft`), and K1 and what it forked are gone (`endCounterpart`) | (the leg's own end) |

The evidence line ends the leg. M1 has no control client; the hand checks HC1, HC2 and HC4 (§12) show that it can fail.

## 7. M6: `scripts/itestRowM6.cjs` (`rowM6(check, top)`, `legs`)

### 7.1 The legs

Ten legs, each cold, each its own process, world and counterpart(s), each with the real resolve over its vault (§1.3). Each leg writes
`<storage>/keys/<pid>/known_hosts-e1` (the name `knownHostsPath` gives an entry with no suffix, `hostKeyTrust.ts:66-68`; `<pid>` is the leg
process's) with K1's line for `[127.0.0.1]:<port>` BEFORE its first click, and reads the SHA-256 of `top.userKey` before.

| Leg | Credential | Counterpart | Scenario |
|---|---|---|---|
| `m6-stored-installs`, `m6-named-installs`, `m6-password-installs` | each | K1 with the stand-in; `passwords` for the password leg | two installs that overlap (7.2 a) |
| `m6-stored-bridge`, `m6-named-bridge`, `m6-password-bridge` | each | K1; `passwords` for the password leg | a bridge with its check (7.2 b) |
| `m6-stored-replaced`, `m6-named-replaced`, `m6-password-replaced` | each | K1; `passwords` for the password leg | a bridge replaced by a second (7.2 c) |
| `m6-password-k2` | password | K2 with `passwords`, at its own port; the entry pinned to K1 for that port | the three roads once (7.2 d) |

### 7.2 The scenarios (the gate is on in a, b and c)

- **(a) Two installs that overlap.** Click A and click B in the same tick. `gate.waitHeld(2, 30 s)`: both calls wrote their files and are
  held at their probe → point O1. Release the first held pin; wait (200 s) until one click settles → O2. Release the second; wait until the
  other click settles → O3. A key leg answers each question with `installAnswer` (both installs run to their end); a password leg ends each
  install at its probe (F5, F22: `Permission denied`, the product's "Cannot install" warning), which is the end of that install.
- **(b) A bridge with its check.** Click *Open Remote Bridge…* (30 s). `gate.waitHeld(1, 40 s)`: the check is held at its sweep → O1. A key
  leg: the bridge is alive and its socket is there (5 s). Release; wait for the mode check's outcome (40 s) → O2. Click *Close Remote
  Bridge*; wait until the bridge's process ended (5 s) → O3. A password leg: the bridge's `ssh` ends by itself at its refused password; the
  leg records whether it ended before O1 (then the two calls did not overlap, and the record says so).
- **(c) A bridge replaced by a second.** Click *Open Remote Bridge…* twice in the same tick (both pass `isOpen` before an `await`, F12);
  both clicks settle (30 s). Two bridges were spawned; the first spawned one ended within 5 s, by its recorded pid, with no *Close* (the
  manager replaced it); one bridge is open (key legs). `gate.waitHeld(2, 40 s)`: both checks held → O1. Release the first held check; its
  mode outcome → O2. Release the second → O3. *Close Remote Bridge*; the second bridge ended → O4. Which bridge spawned first, and that the
  first one's check reads a socket that is not there, are recorded as seen, not judged.
- **(d) The password entry against K2.** No gate. *Install creds on host* (30 s; its probe is refused), *Open Remote Bridge…* (30 s; the
  bridge ends by itself), the check's mode outcome (40 s).

### 7.3 The checks (`M6 <leg>: …`)

| # | Check | M6's words it holds |
|---|---|---|
| M6.1 | the leg's counterpart(s) listen | the run |
| M6.2 | the leg's calls are as many as the scenario makes (a: 2; b: 2; c: 4; d: 3) and their pin paths are DISTINCT (`callsOf`) | "the pin paths of calls that overlap are distinct, as many as the calls" |
| M6.3 | the calls overlapped as the scenario says: in (a) both pin files were on the disk at O1; in (c) the second bridge's and both checks' at O1; in (b) of a key leg the bridge's and the check's at O1. A password leg of (b) and (c) records the overlap it saw | "calls that overlap" |
| M6.4 | for each call, every sample from its `from` to its `to` holds its pin file with the SAME bytes, and those bytes hold K1's line for the entry's address; a stored-key call's key file the same, with the stored key's text, and inside `keys/<pid>/`, distinct per call; at least one sample fell in each call's life | "every other call's file is there with its bytes" |
| M6.5 | for each call, a sample within 5 s after its `to` holds neither its pin file nor its key file, and no later sample holds them | "at each call's end its own file is gone" |
| M6.6 | at each point O2, O3 (and O4): the call that ended has no file, and every call that has not ended has its files with their bytes (an explicit sample) | "at each call's end … every other call's file is there" |
| M6.7 | `known_hosts-e1` has its bytes in every sample and after the leg | "`known_hosts-<id>` … the same bytes after" |
| M6.8 | `top.userKey` has the same SHA-256 after the leg (the person's own key file; the named-key legs hand it to every call) | "the person's own key file the same bytes after" |
| M6.9 | after the last end: 0 pin files and 0 key files of these calls in `keys/<pid>/`; what else is there is listed by name and SHA-256 (`askpass.sh` in a password leg, the window's helper: the lead's answer A2) | "0 files of these calls in `keys/<pid>/`" |
| M6.10 | after the last end: 0 clients of the leg alive, by the shim's pids and start times | "0 client processes alive (by the recorded pids, not by name)" |
| M6.11 | after the last end: no bridge's socket is LIVE, nothing listens on it (`ss -lx`; the owner's answer A3); the dead file is an info line | "no forwarded socket left" |
| M6.12 | (a), key legs: both install runs ended with 0 and showed the product's message for an installed `creds` | "two installs" |
| M6.13 | password legs with K1: K1's log holds at least one password line for the run's user, and each password line is `Failed password` or `Accepted password`; `info  M6 <leg>: the counterpart logged <f> Failed password and <a> Accepted password (<c> connection starts)` — the result says which (expected: `Failed password`, F5, F22) | "with K1 the counterpart's log shows that the password attempt arrived (accepted, or `Failed password` …; the result says which)" |
| M6.14 | (d): K2 logged a `Connection from` for each connection start of the leg, and 0 authentication attempts (no line matches `AUTH_ATTEMPT`); each run that started ended with 255 and the verification line | "with K2 it shows 0 authentication attempts" |

Each leg ends with `nothingLeft`, `endCounterpart` and its evidence line. M6 has no control client; the hand checks HC1, HC3, HC4, HC5 and
HC6 show that it can fail.

## 8. The test of the rig: `src/test/itestRowRig.test.ts` (RED first)

It loads `scripts/lib/rowRecord.cjs` at run time with `createRequire` (as `itestInstrument.test.ts` does), so it compiles before the
module exists; an `exported(name)` helper asserts that the file exists and the name is a function. RR8 builds its world parts through a
cast (`as Parameters<typeof world>[0]`), so it compiles before the world has `realResolve` and `vault`. It is the rig's own test, not a test
of the parent's §5, and adds no test number. Log lines are built from F5 and F6 with the user `someone` and port numbers of the test.

| # | Asserts |
|---|---|
| RR1 | `isQuestion(['-V'])`; `isConnectionStart` of a probe argv (`…, '--', 'someone@127.0.0.1', '<command>'`) and of a bridge argv (`-N`, `--`, the destination) is true; of `['-V']`, of `['-G', …]` and of `['-O', 'check', …]` false; `roadOf` maps the five kinds to the three roads |
| RR2 | `logCounts`: a key login with a command (the nine lines of F6) is 1 connection, 1 authentication attempt (two `Accepted key … found at` lines with no port and `Postponed` add none), 1 accepted login `{ method: 'publickey', session: 'command' }`; a `-N` login: session `none`; two logins on two ports, one with a session line: each gets its own; a refused password (F5's three lines): 1 attempt, 0 accepted, `passwords.failed` 1; a connection with no authentication line: 0 attempts; a log with no line at all: 0 |
| RR3 | `sentencesOf` with the product's functions (imported from `../personPin` and `../hostKeyPin`): it holds both forms of A, B's opening, C, D, F for `null` and F's opening, and one E per kind, as many as `Object.keys(PIN_PATH_KINDS)`; `saysASentence` finds each of them inside a longer text, and finds none in `Bridge open to "box". …`, in the install's question, and in the product's message for an installed `creds` |
| RR4 | `handedClientConfig('/o/leg')` is exactly the five lines of §1.4; RR4b, skipped when no `ssh` is on `PATH` (as the `-G` tests of E1.S1 skip): `ssh -G -F <that file> -p 1 x` resolves one `identityfile`, `/o/leg/no-default-identity`, and `identityagent none`. And `legLine`: `ok  a b` → a passed check `a b`; `FAIL a — b` → a failed check `a` with detail `b`; `evidence {…}` → a print |
| RR5 | `e1Words` of the product's `hostKeyWords` of a checked pin (`checkedPin('/o/keys/known_hosts-e1-x', { kind: 'knows', … })` of `../hostKeyPin`) is six words naming `StrictHostKeyChecking`, `UserKnownHostsFile`, `GlobalKnownHostsFile` once each; it throws for words that lack one |
| RR6 | the scan, every `scripts/itestRow*.cjs` and `scripts/itestRigProof.cjs` read whole: none holds `startServingSshd(`, `stopListener(`, `endServer(`, `.world(` or `launch(`; `scripts/itestRowRig.cjs` holds exactly ONE `startServingSshd(`. Alive: it finds at least the two row files and the proof |
| RR7 | the real resolve is the rows' only resolve: none of `scripts/itestRowRig.cjs`, `scripts/itestRigProof.cjs`, `scripts/itestRow*.cjs` holds `sshExecAuth` or `pinClient'` (a stand-in of either module); `scripts/itestRowRig.cjs` holds `realResolve: true` exactly once, and `realClient: true`. Alive: it reads the same files as RR6 |
| RR8 | the world's real resolve, in process, with the world's stand-in runner (no `ssh`), an owned storage folder, `realForget`, no `hostKey`: **stored** (`vault.privateKey` = a test key text): one click of *Install creds on host* runs one probe whose argv holds `-i <keys/<pid>/call-<uuid>.key>`, that file holds the key text while the probe runs (the runner stand-in reads it), and after the click no `call-*.key` is in the folder; **named** (`vault.keyPath` = an owned file): `-i <that file>`, nothing written, the file is still there; **password** (`vault.password`): the argv holds `NumberOfPasswordPrompts=1` and no `-i`, and `askpass.sh` is in the folder. Without `realResolve` (the default) the same parts give the stand-in's "no credential": the switch decides |

**RED.** Before any script of §2 or §3 and before §4.4: compile (exit 0), run the file: RR1 to RR5 fail on `…/scripts/lib/rowRecord.cjs
does not exist`; RR6 and RR7 fail on their companions (no row file found); RR8 fails on its first assertion (the world ignores
`realResolve`, the stand-in answers no credential, and no probe runs). Save the output; a different text is a stop.

## 9. The proving runs

The stories document: a proving run passes no row and goes into §10 never; its numbers are "seen when it was built".

1. **Local, three times in a row,** on the last code commit (c1, §11), from that tree (`git status --porcelain --untracked-files=no`
   empty), with command 5 of *Commands*, each output saved outside the tree. Read in each: exit 0, no `FAIL`; section 10's count of `ok`
   lines (63 before, F18, plus the leg processes' checks and their end checks); the time of the script; every leg's `evidence` line; M1's
   C20 time; M6.13's answer (expected `Failed password`, F5); the `identities` line with R7, the rows' counterparts as listeners (`m1/k1`,
   …) and every leg's `shim/ssh` and `client_config`.
2. **After each run:** `ls /tmp | grep -E "creds-pin|^creds-$(id -un)-"` and `ps -u "$(id -u)" -o pid,args | grep -E 'sshd|ssh -F|itestRowRig' |
   grep -v grep` print nothing of the run. A process left is ended by its pid; a socket by its exact name; the lead is told.
3. **CI** (the lead's): after the lead pushes, `gh workflow run ci-extension.yml --ref fix/g1-e3-release-gate`; the `itest:ssh-agent` step
   on the head sha is green, with the rows on the runner's `/usr/sbin/sshd` (`OpenSSH_10.2p1 Ubuntu-2ubuntu3.8` in run 45362452230, F25).
   There the install's button is the one `confirmationFor` reads for that runner (no `/usr/local/bin/creds` is expected), `SetEnv` and the
   `Match all` block are shown on the runner for the first time, the leg processes run as the runner's user, and M1.18 lists `absent` twice.
   A failure there is read by the stories document's *What a proving run that fails asks for*.

## 10. The documents

`research/module_tests.md`, the G1 section (`:2543`):

1. **The table:** a row for `itestRowRig.test.ts` (RR1 to RR8, one sentence each); the row of `scripts/itestPinnedRoads.cjs`: its count of
   `ok` lines from the proving run, and that section 10 runs the rig's proof, M1 and M6 after leg 0, each leg in a process of its own; the
   row of `personRoadsWorld.ts` (`research/module_tests.md`, the N16 section): `realResolve`, `vault`, `said`, `replaceHostKey`.
2. **A paragraph `**The common rig of the real-road rows (E3.S4).**`** after E3.S3's paragraph: the files and what each holds (§1.1); the
   leg process and why (F9, F22); the real resolve and the vault (§1.3), and that only `vscode` is a stand-in on the rows' roads; the
   handed config and why (F7, F23); the password counterpart (F5); the four counts and their sources (§1.6); cold and warm (§1.7); the gate,
   the sampler and the calls (§1.8); the evidence line (§1.9); the identities' walk and R7; what it does not prove (§14).
3. **`**M1 and M6, seen when they were built (<date>, commit <sha>).**`** NOT §10 of the plan; it passes no row. Per row: the legs, the
   counts (from the evidence lines), M1's C20 time in each of the three runs, M6.13's answer, the hand checks as hand checks, the runs'
   times, the `identities` line of run 1 whole (home folder as `~`, user as `<user>`), and the CI run of the head sha (the lead's).
4. **The table of *Test leftovers*** (`:277`, the row of `ssh-agent-itest.cjs`): the `pin` folder now also holds one folder per leg of the
   rows (shim, records, storage, home, configs, `given.json`, counterparts, `evidence.json`), a leg process per leg (ended by its pid at its
   limit), and a bridge's socket per bridge leg in `/tmp`, removed by its exact path.

## 11. Order of work, and the commits

1. `git status --short`. **The test** (§8) alone. Compile: exit 0. Run it: the REDs of §8. Save the output.
2. **The world** (§4.4). RR8 green; MU8 (§12), restored.
3. **The lib** (§2), the moves of §4.1 (`AUTH_ATTEMPT`, `kindOf`). RR1 to RR5 green; MU1 to MU5, each restored.
4. **The rig** (§3), §4.1 to §4.3, **the proof** (§5), `pinnedLegs` calling `rigProof` only. `node --check` of every script; compile;
   `itestRowRig` (RR6 and RR7 still red until the row files exist: do not commit yet), `itestInstrument`, `itestCallers`, `harnessSites`,
   `harnessScope`, `personRoads*` suites.
5. **M1 and M6** (§6, §7), and `pinnedLegs` calling them. RR6 and RR7 green; MU6. Typecheck, lint, ratchet, `npm test`: green. The
   leftovers guard: clean. `wc -l` of every new and changed script.
   Commit **c1** (ONE commit, because RR6 and RR7 are red until the row files exist, and no commit holds a red test):
   `test(ssh): G1 E3.S4 — the common rig of the real-road rows (the real resolve in a leg process), its own proof, M1 and M6 (RR1-RR8)`.
   Files: `scripts/lib/rowRecord.cjs`, `scripts/itestRowRig.cjs`, `scripts/itestRigProof.cjs`, `scripts/itestRowM1.cjs`,
   `scripts/itestRowM6.cjs`, `scripts/itestPinnedRoads.cjs`, `scripts/itestProbeInstall.cjs`, `scripts/itestIdentities.cjs`,
   `src/test/personRoadsWorld.ts`, `src/test/itestRowRig.test.ts`. Body: the RED texts, MU1 to MU6 and MU8, the line counts.
6. **The proving runs** (§9, 1 and 2) on c1. **The hand checks** (§12) and MU7 in a scratch worktree. A harness fault that a proving run
   shows is repaired in a new commit (c1b, …), and the three runs are made again on the last one.
7. **The documents** (§10). `plan-lifecycle.mjs` and `public-hygiene.mjs` from the root: clean.
   Commit **c2**: `docs(tests): G1 E3.S4 — the common rig, and M1 and M6 as seen when they were built`. Body: the RED texts, the
   mutations, the three runs' counts and times, M1's C20 times, M6.13's answer, the evidence lines that the body has room for, the
   `identities` line of run 1 (home as `~`, user as `<user>`), the hand checks as hand checks, the after-run checks.

Every commit body says what was OBSERVED (`git-workflow.md`) and that no product file, no workflow and no `package.json` changed.

## 12. Mutation checks and hand checks

**Mutations** (each restored, its output saved):

| # | Mutation | Red | Needs an `sshd` |
|---|---|---|---|
| MU1 | `isConnectionStart` answers true for `['-V']` | RR1 | no |
| MU2 | `logCounts` counts `AUTH_ATTEMPT` LINES, not client ports | RR2 (the key login gives 5) | no |
| MU3 | `logCounts` gives every accepted login the session of the first `Starting session` line | RR2 (two logins) | no |
| MU4 | `sentencesOf` gives E for the first kind only | RR3 | no |
| MU5 | `handedClientConfig` without the `IdentityFile` line | RR4 (and RR4b where `ssh` is) | no |
| MU6 | `itestRowM1.cjs` calls `startServingSshd` itself; then, separately, `itestRowRig.cjs` opens its world with `mocks: { '../sshExecAuth': … }` | RR6; RR7 | no |
| MU7 | `recorded` of `itestIdentities.cjs` reads one level again | R7 in a proving run | yes (scratch worktree) |
| MU8 | the real resolver's `materialized` dropped: `sshExecAuth.ts:172` answers no `materialized: keyPath` (a product file: in the story's tree only for the unit run, restored at once, `git diff` empty after) | RR8 (the `call-*.key` stays after the click); on the real `sshd` it is HC6 | no |

**Hand checks** (the product made to do the wrong thing a leg is about), each in a scratch worktree OUTSIDE the story's tree
(`git -C <worktree> worktree add --detach <scratch>/e3s4-hand <c1>`, `npm ci` in its `src_vs_code`, the edit, one run of command 5,
then `git worktree remove --force`). R1 FAILS there, as it must (a modified tracked file): each is a hand check, recorded as such in c2,
never a result.

| # | The product made to | Expected red |
|---|---|---|
| HC1 | `hostKeyWords` answers `-o StrictHostKeyChecking=accept-new` for a pin (`hostKeyPin.ts:268`) | M1.10, M1.11; M6.14 (K2 logs `Failed password`: the password was sent to the other host); RP1 and RP4's K2 half |
| HC2 | `pinClientAsker` keeps no answer (`pinClient.ts:93` left out) | M1.8 (three questions); RP1 (the warm call asks) |
| HC3 | `personPin` writes every pin at ONE name (`known_hosts-<id>`, its suffix dropped) | M6.2, M6.4 to M6.7 (the first end deletes the other's file, and `known_hosts-e1` is overwritten); M1.11 |
| HC4 | `forgetBoth` skips the pin delete (`writtenKey.ts:59-64`) | M6.5, M6.9; M1.19 |
| HC5 | `forgetWrittenKey` deletes a credential with no `materialized` too (`writtenKey.ts:52-56`) | M6.8 (the named-key legs: the person's key file is gone) |
| HC6 | `byStoredKey` answers no `materialized` (`sshExecAuth.ts:172`; MU8 on the real `sshd`) | M6.5 and M6.9 of the stored-key legs (measured in a scratch run: one `call-<uuid>.key` left after the install, three after the bridge leg, F24); RP5 |

## 13. Break it — ways to pass while the defect stays, and what stops each

| # | The way | What stops it |
|---|---|---|
| BR1 | M1's one question is read from a timer that a kept answer makes look like one call | M1.8 counts the SHIM's `-V` records; the observer only times them |
| BR2 | a leg is warm by accident (a world or an asker shared with the leg before) | every leg is its own process and world (M1.2; RR6: no row file calls `.world(`); `state` in the evidence |
| BR3 | the gate keeps the second install from ever starting, so nothing overlapped | M6.3: both pin files on the disk at O1 |
| BR4 | the samples miss a short call, and M6.4 passes on no sample | M6.4 asks at least one sample per call, and O1 to O4 take explicit samples |
| BR5 | `known_hosts-e1` is counted as a pin file of a call (it matches `pinFiles`) | the calls come from the argvs' pin paths, never from the folder's names; M6.7 reads it apart |
| BR6 | the password leg passes because the counterpart never offered password (`Permission denied (publickey)`) | M6.13 asks a password line in K1's log |
| BR7 | K2's 0 attempts because K2 was never reached | M6.14 asks a `Connection from` per connection start |
| BR8 | the stored key is the named file, so no file is written per call | `stored` calls must name a key file inside `keys/<pid>/`, distinct per call (M6.4, M6.5) |
| BR9 | M1 passes with the install stopped at its question | M1.4 and M1.12 ask the install run's 0 and 5 logins |
| BR10 | the stand-in installer passes while the real `curl` ran | M1.16 (`command -v curl` is the stand-in), M1.17, M1.18 |
| BR11 | CI passes the rows by a skip | `CI=true` fails a missing `sshd` (`itestPinnedRoads.cjs:526-528`, unchanged), and the leg process gets `CI` |
| BR12 | a leg starts its own `sshd` with another config | RR6; test 33; R5, R6 and R7 (every listener of the run is one program and is in the record) |
| BR13 | a row runs the world's stand-in resolve after all, and a fault of the real one (F24) stays green | RR7 (no script of the rows names `sshExecAuth`; the rig opens its world with `realResolve: true`), RR8, MU8, HC6, RP5 |
| BR14 | the leg process inherits the harness's `PATH` (no shim), so the real resolve's `ssh` is not recorded and reads no handed config | the leg process's own check of its environment (§1.2); M1.8 and RP5 (the shim's records) |
| BR15 | a leg process hangs, or its failure is lost | `runLeg`'s limit and its end check (`ended with 0`); its checks are relayed one by one into section 10's count |

## 14. What is NOT measured by E3.S4

- **No row passes.** These are proving runs; §10 is E3.S10's, on the final tree.
- **Which command an accepted login ran.** The VERBOSE log names the session's kind and the port, not the command (F6); the pairing with
  the runs is by kind and count.
- **A forward in the counterpart's log.** VERBOSE writes no line for a remote socket forward (F6). M1 shows the forward by the socket.
- **A password accepted by the counterpart.** A counterpart run by the user cannot read the shadow file (F5). The password entry's install
  ends at its probe, and its bridge ends by itself.
- **The vault's own code** (the keychain, the envelope, the PIN door): the vault is a host record of plain values; the opener and the
  resolve that read it are the product's.
- **A root `sshd`, another operating system, Windows, macOS.** Section 10 is Linux only.
- **`SetEnv` and `Match all` on the runner** until the CI proving run; the C20 time on another machine.
- **Two cold questions at once** (F11) are recorded in M6's evidence, not judged: no criterion of M1 or M6 counts them.

## 15. Done when (each item can be counted)

- [ ] RR1 to RR8 were watched red with the texts of §8 and pass; MU1 to MU8 turned red what §12 names.
- [ ] Every leg of M1 and M6 is built, runs in its own leg process with the real resolve, through the committed instrument (every
      counterpart by the rig's one `startServingSshd`), and ran from a tree with no modified tracked file (R1 in each run).
- [ ] Three local proving runs on c1 (or its last repair): exit 0, no `FAIL`, every check of §5, §6 and §7 `ok`, every leg process ended
      with 0, R1 to R7 `ok`; the after-run checks print nothing. The CI proving run on a head sha is green (the lead's box).
- [ ] HC1 to HC6 each turned red what §12 names (hand checks, in c2's body).
- [ ] typecheck, lint, ratchet, `npm test`, `itestCallers`, `harnessSites`, `itestInstrument` and the leftovers guard green; every script
      at most 800 lines (`wc -l`).
- [ ] `research/module_tests.md` holds §10's items; no home path and no user name in a committed text.

## 16. Opus review checklist

1. Does every leg run in its own process, with the leg's `PATH` and `HOME`, and open its own world? Does the evidence say `cold` or `warm`
   as the leg made it? Is `warm`'s call outside the leg's counts (the mark)?
2. The real resolve: is the world opened with `realResolve: true` and a vault, and is NO module of the roads but `vscode` a stand-in
   (the observers call the real runner and pass its answer on)? Does a stored-key call's key file come from the product's
   `materializeCallKey` and go by its `materialized`?
3. Are the four counts kept apart, each from its own source (§1.6)? Is an authentication attempt counted by port, and 0 only when no line
   matches?
4. Does each check of §6 and §7 hold its row's words, no fewer (the table's third column)? Is anything read as "passed" from an exit code
   alone?
5. The gate: can a held run time out, or a failed leg leave a click waiting (`releaseAll` registered at once)? Does the gate change any
   argv, environment or outcome?
6. The leg process: is it bounded and ended by its pid and start time; are its checks relayed one by one; can a check be lost when it
   fails (the end check)? Is `given.json` mode 0600 and the password never printed?
7. The handed config: does every row leg use it (F7, F23), and section 10's legs keep theirs?
8. The world: `realResolve`, `vault`, `said` and `replaceHostKey`; no existing suite changed; the snapshot is replaced, never changed in
   place.
9. The identities: `recorded` walks every depth; R7 compares with an independent walk; the shims of every leg are hashed.
10. Teardown: every counterpart, bridge, socket, held run and leg process is registered with a scope at the moment it is made; every
    process ended by pid and start time.
11. The guards: no row file starts a counterpart or a world itself (RR6), or names `sshExecAuth` (RR7); no script holds
    `buildSshExecArgv(` or `buildBridgeArgv(`; test 33's patterns; no raw temp call; every script ≤ 800 lines.
12. The documents: "seen when it was built", not §10; hand checks as hand checks; `~` and `<user>`.

## What grows

| What | How much (projected) | Who retires it | When it is interrupted |
|---|---|---|---|
| one folder per leg of the rows (15 legs: RP1-RP5, M1, M6's ten): shim, records, storage, home, configs, `given.json`, a stand-in, `evidence.json` | about 50 kB per leg, under 1 MB per run | the section's scope removes the `pin` folder, pass or fail | the janitor (token `creds`) sweeps the owned folder |
| one leg process per leg, one at a time | for the seconds of a leg | its own `harnessScope`; `runLeg` ends it by its pid at its limit | a SIGKILL of the harness leaves a running leg process and what it started, as a SIGKILL leaves a listener today |
| the counterparts (one or two per leg), their sessions, the clients and bridges | for the seconds of a leg | `endCounterpart` and the leg process's scope (`endServer` by pid and start time) | as above |
| a bridge's socket `/tmp/creds-<user>-<id>.sock` per bridge leg (about nine) | one per bridge | `removeSocket` by its exact path, in the leg process at the spawn, and by `runLeg` from the evidence | left by a SIGKILL of both, as today |
| the evidence lines in the run's output | about 5-20 kB per leg | the person who saves the output | nothing to sweep |

Nothing grows in the product.

## Notes for the row stories

- **N1 (E3.S5, E3.S6, E3.S7).** A line that `servingConfig` already writes (`LogLevel`, `PasswordAuthentication`, `PerSourcePenalties`)
  is changed only inside a `Match all` block at the end of `extra` (F4, F5). E3.S3's note L5 (`LogLevel DEBUG1` for M11) must go there;
  measured for `PasswordAuthentication`, not for `LogLevel`.
- **N2 (E3.S6, M2).** VERBOSE writes no line for a remote socket forward (F6), so "K2 logs … 0 forwards" needs evidence that E3.S6 names
  (a log level inside `Match all`, or the socket's absence). The rig's evidence gives `forwards: null` until a row adds it.
- **N3 (E3.S5, M4 and M9).** `warm` then `replaceHostKey(<the unusable text>)` is the warm leg in the same window; RP1 proves both. The
  vault (§1.3) is how M9's key entry and password entry get their credentials.
- **N4 (all).** A password call writes `keys/<pid>/askpass.sh` and no call deletes it (F10); by the lead's answer A2 it is the window's
  helper, listed and not counted among a call's files.

## Notes for the lead

- **Links and rows.** The stories document (its status line and `## E3.S4`), the parent's `## Epics`, E3, and `todo/README.md` do not name
  this file. They are the lead's, in the commit that adds this spec.
- **The proof runs every time.** RP1 to RP5, M1 and M6 run in every `npm run itest:ssh-agent`, locally and in CI, each leg in its own
  process: about one to two minutes more (projected, not measured).
- **Changed files of earlier stories:** `itestIdentities.cjs` (E3.S2: the walk and R7), `itestProbeInstall.cjs` (E3.S3: exports only),
  `personRoadsWorld.ts` (E2's world: four additions, the real resolve among them). None changes what those stories measured.
- **CI** is dispatched by the lead (§9, 3).

## The lead's answers (2026-11-24)

**A1 · The rows use the REAL resolve** (consult `da8604ac`). The parent's "Only the `vscode` module is the suite's stand-in" (E3, *The
roads*) gives E3 no exception; E1.S4's was for its smoke. The world's stand-in replaces the whole `../sshExecAuth` module
(`personRoadsWorld.ts:253`), so a fault of the real `byStoredKey` (no `materialized`, so the stored key file is never deleted) would stay
green under it (measured, F24), and keeping it would make the gate smaller. Built as §1.2 and §1.3: each leg in a process whose
environment is the leg's, the world's host holding a disposable vault, the registered commands calling the production resolver (measured,
F22). Not a plan change.

**A2 · `askpass.sh` is the window's helper, not a file of a call** (consult `a185f2e1`; the parent's §3.2, `:375` "gives the helper no key
file to delete", `:396` "owns both files of a call", and §3.7, `:626` "each deletes only its own"). "Files of these calls" are the files a
call owns: its key file and its pin file (M6.9). The leg lists `askpass.sh` by name and SHA-256. Deleting it at the end of each call would
be NEW behaviour, and it could break the overlap of two calls: one password call's end would take the script that another call, still
running, hands to its `ssh` as `SSH_ASKPASS`. Not a plan change.

**A3 · M6.11 means no LIVE forward (the owner, 2026-11-24).** The proving runs of `0f8081b7` showed that `sshd` leaves the dead `-R` socket file after the client ends (`StreamLocalBindUnlink no`, measured also apart from the harness), which the product documents and the next bridge sweeps (`sshBridge.ts:356-372`, `agentCommands.ts:204-208`). The consultants could not be asked (the coai server refused every tool: its data folder was missing), so the lead asked the owner, who chose the reading "no LIVE socket": M6.11 passes when nothing listens on any bridge socket of the leg after the last end (`ss -lx`, the product's own liveness test; a missing `ss` fails it), and the dead file is recorded as an info line. Not a plan change (the owner's ruling on the reading). Built in `1ad5736b`; a hand control showed that `ss -lx` lists a live unix socket by its full path and does not list it after close. In the same story the rig's end check judges the socket only where a row asks (M6), not in M1, whose criterion has no such clause (`0f8081b7`).

## Questions for the lead

None open.
