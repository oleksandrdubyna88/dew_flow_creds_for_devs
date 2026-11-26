# PLAN — E3.S7 spec: the pin file's path, and the agent's exec (M7, M12, M14)

> Status: **spec, 2026-11-24, by Opus; not built.** Story E3.S7 of [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md)
> (its decisions 15, 16 and 18; §3.5, §3.9, §3.11; `## Epics`, E3: *The setup of every measurement* and the rows M7, M12 and M14) and of its
> stories document [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md) (`## The rows: built story by story, measured
> once`, `## E3.S7`, the lead's answers Q1 and Q3). It builds on the common rig as BUILT by E3.S4, E3.S5 and E3.S6 (`scripts/itestRowRig.cjs`
> and the files below), and on the instruments of E3.S2 (the serving launcher) and E3.S3 (P1, the install's stand-in). The parent, the
> stories document and `todo/README.md` do not name this file yet: the lead adds the links and the row (*Notes for the lead*). This file is
> promoted together with the parent.
>
> Scope: `src_vs_code/scripts` (five new files, four changed), one new test file and one changed helper in `src_vs_code/src/test`, and
> `research/module_tests.md`. No product file (`src_vs_code/src` outside `src/test/`), no workflow, no `package.json`. **Read on `62251613`,
> 2026-11-24** (every `file:line` below is of that commit). Nothing was run for this spec: no `ssh`, no `sshd`. Opus writes this spec, a
> Sonnet coder builds it, Opus reviews it.

"The parent" is the plan linked above; M7, M12, M14, §3.11, decision 15 and so on are the parent's. Names of earlier specs have the prefix
`S4.`, `S5.`, `S6.` (`S6.H7`, `S5.R.9`). This document's own names: the facts J1 to J20, the dependencies D1 to D12, the checks M7.x,
M12.x and M14.x, the tests PT1 to PT10, the mutations MP1 to MP9, the hand checks HC1 to HC4, the break-its BR1 to BR14, and the questions
Q1 to Q3. "A leg" is what the E3.S4 spec says: one scenario with its own folder, its own leg process, its own world and its own
counterpart(s). This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`). The parent's
epoch 3 has ONE entry (3.1), so the next entry is the SECOND, and it stops the whole plan.

## What E3.S7 decides, in one paragraph

M7, M12 and M14 are 34 legs on the rig. What makes each case is the **storage folder** of the leg's window: a folder inside the leg's own
folder whose name holds the characters that the row names, handed to the world as its `storageDir`, so the product makes the pin file's
complete pathname itself (`knownHostsPath`, `hostKeyTrust.ts:66-68`: the folder, `keys/<pid>/`, `known_hosts-<id>-<uuid>`). M7 runs the runs
of M1 and of M2 (b), both legs, on five folders whose paths need double quotes or keep one backslash inside, and *the collision* of (c). M12
reads the kinds from the product, asks the product's rule for each leg's complete pathname, drives each of the six reachable kinds on each of
the two roads that can be driven (cold, a leg per road), asks the rule and the client alone for the two kinds that no folder can give, and
scans every recorded argv of the run for `/dev/null` as a known-hosts file. M14 drives the agent's `ssh:exec` through the action's own
`run`, off a bridge, in a new exec world whose deps the product's own `sshDepsFor` assembles. Every expected word, sentence opening, kind and
path is pinned in this spec or computed from what the leg made, never read only from the function under test (the lesson of `S5.R.6b`).

| File | Change | Lines (budget) |
|---|---|---|
| `scripts/lib/pathRecord.cjs` (new) | pure: the tables of the legs of M7 and M12; the coverage judge; the expected word; how `ssh` prints a path; the bare word's twin; E1's words with a path as it is; the `/dev/null` scan; the no-path judge; the listing of a folder | ≤ 220 |
| `scripts/itestRowPaths.cjs` (new) | what the three rows share: the storage folder of a leg, the rule's question, the word check, sentence C on both roads, the twin writer of the collision, the listing before and after | ≤ 300 |
| `scripts/itestRowM7.cjs` (new) | `rowM7(check, top)`, `legs`: 17 legs | ≤ 320 |
| `scripts/itestRowM12.cjs` (new) | `rowM12(check, top)`, `legs`: 13 legs; `devNullScan(check, top)` | ≤ 320 |
| `scripts/itestRowM14.cjs` (new) | `rowM14(check, top)`, `legs`: 4 legs | ≤ 300 |
| `src/test/itestRowsPaths.test.ts` (new) | PT1 to PT10 | ≤ 340 |
| `scripts/itestRowRig.cjs` | D1 `openRoads`' option `onPin`; D2 `openExec`; D3 `ROW_FILES` gains M7, M12, M14 | 676 → ≤ 745 |
| `scripts/itestRowM2.cjs` | D4 `mismatch` and `switchLeg` exported, with an optional third parameter `more` | 144 → ≤ 165 |
| `scripts/itestPinnedRoads.cjs` | D5 `productOf` adds `knownHostsPath`, `PIN_PATH_KINDS` is read through it; `pinnedLegs` calls M7, M12, M14 and the scan | 561 → ≤ 575 |
| `src/test/personRoadsWorld.ts` | D6 `execWorld(parts)`: the agent's exec over the same host as the roads | 434 → ≤ 505 |
| `research/module_tests.md` | M7, M12 and M14 "seen when they were built" | — |

## Binding constraints

The binding constraints of the E3.S4, E3.S5 and E3.S6 specs hold here, word for word (no plan change; only `vscode` is a stand-in on the rows'
roads; through the committed instrument only; a run of the commit; the four counts apart; the guards green; exe + argv with a time limit,
every process ended by pid and start time; the person's `~/.ssh` never read or written; Node only, no Python; at most 800 lines per script;
no home path and no user name in a committed text; lowered priority, leg processes one at a time; no product code changes for a leg; every
other source of trust made by the handed config in the leg's folder; a control or a witness never takes its words from `hostKeyWords`). In
addition:

- **The case is made by the storage folder and by nothing else.** The leg makes `<leg>/st/<name>` and sets `leg.storage` to it BEFORE its
  world opens. No product function is patched, no path is handed to a builder by the harness. The person's key is a key named by its path
  (`credential: 'named'`, the leg's key copy in `<leg>`, OUTSIDE the storage folder), so the pin file is the only file a call writes there.
- **Every expected value is pinned here, or computed from what the leg made.** The expected word (quoted or bare) is the table's (§1.1), not
  `checkedPin`'s; the expected path is `path.join(<the leg's storage>, 'keys', String(process.pid))` plus the recorded name; a kind is the
  table's literal; sentence E's kind words are the plan's (§3.11, `:899-900`), and its prefix is §3.5's. Where a check also reads a product
  function (a sentence's whole text), it holds a pinned part beside it.
- **A failed witness, control or rule question is a named FAIL, and the leg goes on to its end** (the evidence line), except where the row
  says a road is NOT driven (M7 (e) refused by the rule; M12 (g), (h)).
- **The exec world is opened by the rig** (`openExec`), as every world (RR6), with the real resolve and the real asker by default (RR7: the
  rig keeps ONE `realResolve: true`, and no script of the rows names `sshExecAuth` or `pinClient'`).
- **A check name holds no " — "** (`itestRowRig.cjs:641-643`).

## Facts read on `62251613` that this spec uses

| # | Fact | How |
|---|---|---|
| J1 | **The tree.** `fix/g1-e3-release-gate` at `62251613`, no modified tracked file. E3.S4 to E3.S6 are built and reviewed; the last proving run: 991 ok, 0 FAIL, 48 leg processes (`research/module_tests.md:2530`, `:2532`) | read |
| J2 | **The rows.** M7 `todo/PLAN_person_roads_pin_host_key.md:1733`, M12 `:1738`, M14 `:1740`; their last columns are quoted beside each check (§2 to §4) | read |
| J3 | **The storage folder of a leg** is `path.join(dir, 'storage')` (`itestRowRig.cjs:629`); the world takes `storageDir: rig.storage` (`itestPinnedRoads.cjs:201`), the sampler `materializedKeysDir(leg.storage)` when `openRoads` runs (`itestRowRig.cjs:249`), and M1.11 compares each pin file's folder with `materializedKeysDir(leg.storage)` (`itestRowM1.cjs:108-113`). So a leg that sets `leg.storage` before `openRoads` moves every one of them | read |
| J4 | **The pid of `keys/<pid>/`** is the process's own (`materializedKeys.ts:51-53`): the leg process, where the product runs | read |
| J5 | **The rule.** `PIN_PATH_KINDS` (`hostKeyPin.ts:143-152`): `control`, `quote`, `doubleBackslash`, `backslashApostrophe`, `lastBackslash`, `percent`, `variable`, `tilde`; `REFUSED_PIN_PATHS` asks them in that order (`:157-166`); `pinPathRefusal` `:185`. `checkedPin` quotes a path with white space, an apostrophe or `=` (`:226`) | read |
| J6 | **The order of a pinned call** (`decidePinOfCall`, `pinOfCall.ts:51-62`): no saved key, nothing; then the rule of the WHOLE pathname (`knownHostsPath(storageDir, entity.id, suffix)`), then the asker, then the write. So a refused path starts no `ssh -V` (decision 15) | read |
| J7 | **How `ssh` prints a path in its `Offending` line:** a backslash as two (`hostKeyPin.ts:330-343`, `unprinted`; measured 2026-11-18, OpenSSH 10.2p1). The product matches the WHOLE name after `unprinted` (`namesFile`, `:345-348`) | read |
| J8 | **Sentence C on the roads.** The install shows `told.install` (sentence C alone) as an error (`agentCommands.ts:283-285`); the socket check shows `told.bridge` (`The bridge to "<name>" is not open: ` + C) as an error AND writes it as a log line (`:216-220`). The bridge's own `ssh` has no stdio (`bridgeSpawner.ts:79`) | read |
| J9 | **Sentence E on the roads:** `Cannot reach "<name>": ` + E on the install (`agentCommands.ts:278`), `Cannot bridge to "<name>": ` + E on the bridge (`:434`); E names the kind and echoes no path (`pinPathSentence`, `hostKeyPin.ts:285-287`) | read |
| J10 | **The socket check starts only after a bridge started** (`agentCommands.ts:468`; §3.3). A refused bridge keeps it from starting: it has no start of any kind (the lead's answer Q3 of the stories document) | read |
| J11 | **The agent's exec off a bridge.** `sshExecAction(deps).run(ctx, body)` (`sshUseActions.ts:413-465`) → `execOverSsh` (`:390`) → `localLaunch` (`:320-328`) → `localPin` (`:260-270`), which calls `decidePinOfCall` with NO suffix: the pin file is the entry's own, `known_hosts-<id>`, and nothing deletes it (`:256-259`). A refusal answers `refuse('no_credential', <sentence E>)` (`:325-326`); off a bridge that is `agentSaid` (`:159-163`), the body `errorBody(code, message)` (`brokerProtocol.ts:66`). A run answers `{ status: 200, body: ExecResponseBody }` (`:368-369`; `brokerProtocol.ts:169-177`: `exitCode`, `stdout`, `stderr`, …) | read |
| J12 | **Production's deps of the exec** are `sshDepsFor(parts)` (`sshUseActions.ts:565-596`): the asker is `windowPinClient` (`:593`); `relays` is read only on the terminal's road (`:548`) | read |
| J13 | **The exec's runner request** is `./sshExecRunner` (`sshUseActions.ts:24`), the same request string as the asker's: the rig's observer is keyed so (`itestRowRig.cjs:291`) | read |
| J14 | **The unit world of the exec** loads `../sshUseActions` under a `vscode` stub of two window functions (`sshUseActions.test.ts:96-106`): the module loads with no other `vscode` member | read |
| J15 | **Section 9 builds the exec's argv** with `buildSshExecArgv` and runs it with `runClient` (`itestNoSharing.cjs:139-143`, `:173-182`); it does not call the action (Q1) | read |
| J16 | **The gate and the spawner of the rig** see each call's pin file before the client starts: the gate at the call's FIRST run, before `runner.runSshExec` (`itestRowRig.cjs:206-231`); the recording spawner before `spawner(…)` (`:262-273`) | read |
| J17 | **`pinOf` strips one pair of double quotes** from the recorded value (`itestPinnedRoads.cjs:250-256`); `valuesOf` reads `-o Name=value` and `-oName=value`, the name in any case (`test/pinnedArgv.ts:76-96`) | read |
| J18 | **E1's words of the lib throw on a path with white space or a quote** (`bare`, `lib/otherKeyRecord.cjs:26-31`), so the collision's control, whose path holds apostrophes, needs words of its own (§1.4) | read |
| J19 | **The guards.** RR6 forbids `startServingSshd(`, `stopListener(`, `endServer(`, `.world(`, `launch(` in a row file; RR7 forbids `sshExecAuth` and `pinClient'`, and counts ONE `realResolve: true` in the rig (`itestRowRig.test.ts:227-247`) | read |
| J20 | **Section 10's order** (`pinnedLegs`, `itestPinnedRoads.cjs:499-530`): legs 1, 2, 0, `rowsTop`, the proof, M1, M6, M4, M9, M2, M3, M8, then the record of identities | read |

## Commands

As the E3.S4 spec's *Commands* (in `src_vs_code`, `LP=../.agents/conventions/tools/low-priority.mjs`): compile (read its exit first), one
suite through `scripts/run-tests.mjs`, typecheck, lint, ratchet, `npm test`, `node --check scripts/<file>.cjs`, the proving run
`CREDS_ITEST_SSHD="$HOME/.cache/creds-itest-sshd/sshd-wrap.sh" CREDS_ITEST_SSHD_CONFIG="$HOME/.cache/creds-itest-sshd/extra.conf" npm run itest:ssh-agent`,
and from the root the leftovers guard, `plan-lifecycle.mjs` and `public-hygiene.mjs`.

## 1. The decisions

### 1.1 The legs and their storage folders

Every leg is **cold** (a new world in a new process; decision 15). Each uses `credential: 'named'`. The tables are `M7_LEGS` and `M12_LEGS`
of `lib/pathRecord.cjs` (PT1, PT2); `\t` is ONE tab character, `\` one backslash.

**M7** (17 legs). The folder `<leg>/st/<name>`; "word" is how both known-hosts options must name the pin file.

| Shape | Folder name | Word | Legs |
|---|---|---|---|
| (a) a space | `with space` | in double quotes | `m7-a-m1`, `m7-a-m2-mismatch`, `m7-a-m2-switch` |
| (b) one apostrophe | `it's` | in double quotes | `m7-b-m1`, `m7-b-m2-mismatch`, `m7-b-m2-switch` |
| (c) a pair of apostrophes | `x'y'z` | in double quotes | `m7-c-m1`, `m7-c-m2-mismatch`, `m7-c-m2-switch`; *the collision:* `m7-c-collision-k1`, `m7-c-collision-k2` |
| (d) a space and an apostrophe | `it's here` | in double quotes | `m7-d-m1`, `m7-d-m2-mismatch`, `m7-d-m2-switch` |
| (e) a backslash as the folder's last character | `end\` | bare: the pathname holds ONE backslash, followed by `/` | `m7-e-m1`, `m7-e-m2-mismatch`, `m7-e-m2-switch` |

`-m1` runs M1's runs and every M1 check (`m1Runs`, `itestRowM1.cjs:150-162`) on that folder. `-m2-mismatch` and `-m2-switch` run M2's two
legs of (b) (`m2-mismatch-global`, `m2-switch-global`: the global file `<leg>/known_hosts_global` with K2's line, named by the handed config)
with every M2 check, through D4. The collision legs are §1.4.

**M12** (13 legs). `kind` is the expected answer of the rule, a literal of this table, never read from the product.

| Leg | Folder name, or the pathname asked | Kind | Roads |
|---|---|---|---|
| (a) | `q"uote` | `quote` | `m12-a-install`, `m12-a-bridge` |
| (b) | `\\unc` (two backslashes, then `unc`) | `doubleBackslash` | `m12-b-install`, `m12-b-bridge` |
| (c) | `pct%h` | `percent` | `m12-c-install`, `m12-c-bridge` |
| (d) | `var${HOME}` | `variable` | `m12-d-install`, `m12-d-bridge` |
| (e) | `it\'s` (a backslash, then an apostrophe) | `backslashApostrophe` | `m12-e-install`, `m12-e-bridge` |
| (f) | `tab\tname` | `control` | `m12-f-install`, `m12-f-bridge` |
| (g) | the pathname `<leg>/rule/known_hosts-e1-<uuid>\` (it ENDS with a backslash) | `lastBackslash` | none: `m12-rule` |
| (h) | the pathname `~/known_hosts-e1-<uuid>` | `tilde` | none: `m12-rule` |

`m12-rule` runs FIRST: the coverage, then (g) and (h). One road per refused leg, as E3.S5: a defect that asks `ssh -V` on one road would
leave the asker warm, and the next road of the same world would then start nothing and hide its own defect (`S5`, *One road per refused
leg*). The socket check is never reached (J10); its judge reads 0 starts of any kind, and the record shows it.

**M14** (4 legs): `m14-a` (K1), `m14-b` (K2, the handed config of M2 (b)), `m14-c` (K2, the handed config of M8), `m14-d` (K1, the folder of
M12 (a), `q"uote`). (a)-(c) use the leg's plain storage folder (`<leg>/storage`).

### 1.2 The storage folder of a leg (shared file)

`storageAt(ctx, name)`: makes `<leg>/st/<name>` (mode `0700`), sets `ctx.rig.storage` to it, and answers it. It throws unless the leg's
folder itself (`<leg>`) holds none of the characters `\s`, `'`, `"`, `\`, `%`, `$`, `~` and no control character, so the folder's own name is
the only cause of a kind or a quote. It is called before `openRoads` (J3), before the stand-in and before any counterpart. The evidence names
the folder relative to the leg (`st/<name>`, as JSON: a tab is `\t`).

`ruleOf(ctx)`: the complete pathname as the product makes it, `product.knownHostsPath(<storage>, 'e1', <a fresh uuid>)` (D5), the answer
of `product.pinPathRefusal(<that pathname>)`, and the answer for `<leg>/x` (the leg's folder alone: `undefined`, or the leg fails).
`listing(dir)`: every entry under `dir`, recursive, `{ rel, type, sha256 }` (files with their SHA-256, folders and others by type).

### 1.3 The word (M7)

`wordCheck(ctx, label, roads, shape)` (M7.w): every connection start after the mark names ONE pin file in both options, and its value is
exactly `expectedWord(path, shape.word)`: `"<path>"` for `quoted`, `<path>` for `bare`, where `<path>` is
`<storage>/keys/<pid>/known_hosts-e1-<uuid>` (the storage the leg made, `process.pid` of the leg, the uuid read from the recorded name and
matched by `/^known_hosts-e1-[0-9a-f-]{36}$/`). For (e) also: the path holds exactly one backslash and does not end with one. The value is
read from the recorded argv with `valuesOf` (J17), never through `pinOf`'s stripping.

### 1.4 The collision (M7 (c))

M7: "a file at the path that the bare word resolves to (the apostrophes taken out) holds K2's line, the pin file holds K1's; once the
counterpart is K1, once K2". The bare word's path holds the call's uuid, which exists only when the call has written its pin file. So:

- **The twin writer (D1, Q3).** `openRoads(leg, port, { …, onPin })`: the rig calls `onPin(pinFile)` synchronously at each call's FIRST
  run in the gate, BEFORE `runner.runSshExec`, and in the recording spawner BEFORE `spawner(…)` (J16), once per distinct pin file. It
  changes no argv, no environment and no outcome; with no `onPin` the rig is as today. The leg's `onPin` writes
  `resolvedBare(pinFile)` (the path with every `'` taken out: `<leg>/st/xyz/keys/<pid>/known_hosts-e1-<uuid>`) with K2's line for the
  counterpart's port (`knownHostsLineOf`, the lib of E3.S6), folders `0700`, file `0600`, and records `{ pin, twin, at: performance.now() }`.
- **`m7-c-collision-k1`:** K1 at its port with the stand-in; `driveFive` (`itestRowM1.cjs:65-71`); the install's question answered.
- **`m7-c-collision-k2`:** K2 at its port with the stand-in; `driveRefusedRoads` (`itestRowOtherKey.cjs`); the question answered when asked.
- **The control** (`m7-c-collision-k2`, after the counts): the real client by its path, with `e1WordsRaw(<file>)` (the three pairs, the path
  BARE and as it is, no quote; J18), where `<file>` is `<leg>/st/x'y'z/control/known_hosts-control` with K1's line and its twin
  `<leg>/st/xyz/control/known_hosts-control` with K2's line, both written by the lib. It must be ACCEPTED by K2: it read the twin.
- **The witness** (`m7-c-collision-k1`, after the counts; not the row's control): the same bare words against K1 end with 255 and the
  verification line, and K1 logs no new accepted login: there too the bare word reads the twin, so the leg could have failed.

### 1.5 The exec world (D2, D6; Q1)

`execWorld(parts)` of `personRoadsWorld.ts`: the SAME host as `world()` (`detailsOf`, `storageOf`, `vaultOf`: the entry, its saved key, its
vault), and the agent's exec in place of the registered commands: `loadWithVscode('../sshUseActions', <the window stub of `world()`>,
<parts.mocks>)`, deps from the loaded module's own `sshDepsFor` (J12) with `agentServer` `{ signal: new AbortController().signal,
acquireExecSlot: () => () => undefined, note }`, `sshAgent` `{ socketPath: undefined, servesKeyForEntity: () => false }`, `relays` absent,
`log` a recording writer, `onMutated` nothing. It answers `{ run(command), notes, said, replaceHostKey }`; `run` calls
`mod.sshExecAction(deps).run({ accountId: 'a1', entityId: 'e1', entityName: 'box', signal }, { command })` (no `bridge`: off a bridge).
No stand-in of `../sshExecAuth` or `./pinClient`: the resolve and the asker are the product's.

`openExec(leg, port)` of the rig (D2): `execWorld` with the entry pinned to `leg.pin` at `127.0.0.1:<port>`, `storageDir: leg.storage`,
`vault: vaultOf(leg, 'named')`, and `mocks: { './sshExecRunner': <the observer of the `-V` runs over the recording runner> }` (J13), so
the question is timed and every other run's argv, outcome and times are kept. It answers a `roads`-shaped object (`w: { said, asked: [] }`,
`outcomes`, `bridges: []`, `questions`, `marks`, `sampler`, `state: 'cold'`, `credential: 'named'`, `port`, `run`) so `mark`, `countsOf` and
`evidence` take it as they are.

### 1.6 The order of a leg

**`-m1`, `-m2-*` (M7):** `storageAt`; for (e) the rule's question first (M7.e0): a refusal FAILs the leg and NO road is driven (the leg
prints its evidence line with `drove: false`); then M1's leg body or M2's, with M7's checks in `more` (D4) or after `m1Runs`.

**`m12-<k>-<road>`:** `storageAt`; `ruleOf` (M12.k); the listing before; K1 with no stand-in needed (no call may reach it; it gets the stand-in
all the same, so a defect cannot run the real installer); `openRoads` (`answer: dismissAll`); `mark`; the cold check; ONE click (30 s), then
3 s; the counts; the checks; the liveness control (`liveness`, `itestRowRefused.cjs:131-138`); the listing after; the end; the evidence.

**`m14-*`:** the counterpart; the source of (b) or (c) and its `ssh -G` check; (c) the witness first; `openExec`; `mark`; ONE `run`
(60 s); the counts; the checks; (b) the witness after the counts; (d) the liveness control; the end; the evidence.

### 1.7 The evidence

`rig.evidence(leg, roads, servers, fields)`, the fields beside the rig's own: `shape` or `kind`, `folder` (`st/<name>`), `word` (`quoted`,
`bare`), `rule` (`{ pathname: <relative to the leg>, answer, legFolderAnswer }`), `listing` (`{ before, after }`), `twins` (the collision:
`[{ pin, twin, at, firstRunAt }]`), `control` or `witness` (`{ argv, code, stdout, stderr }`), `answer` (M14: the action's status and
body, the body's `stdout` and `stderr` cut at 2 kB), `drove` (`false` only for a leg that the rule stopped). A home folder in a value is
written `~` (M12 (h)). A value not read is `null`.

## 2. M7: `scripts/itestRowM7.cjs`

M7's last column: "(a)-(e): as M1 and as M2 (b), both legs; in the mismatch leg both roads show sentence C (the `Offending` line names the pin
file of a quoted word, and for (e) of a bare word with a backslash, which `ssh` prints as two). Before (e) drives a road, the run asks the
product's rule for the complete pathname of its folder and gets no refusal: if the rule refuses it, the leg is not passed, it has become a
case of M12. *The collision:* with the counterpart K1, 5 accepted logins; with K2, each of the four runs that start ends with 255 and the
verification line, and K2 logs 0 accepted logins and 0 authentication attempts. The control: the control client with E1's words (the path
bare) is ACCEPTED by K2: it read the other file."

### 2.1 Every leg of (a)-(e)

| # | Check (`M7 <leg>: …`) | The row's words it holds |
|---|---|---|
| M7.e0 | (e) only, before any counterpart: `the product's rule, asked with the complete pathname of the folder (<storage>/keys/<pid>/known_hosts-e1-<uuid>), answers no refusal` | "Before (e) drives a road, the run asks the product's rule … and gets no refusal" |
| M7.w | `every connection start names the pin file in both known-hosts options as <the word of the table>: <storage>/keys/<pid>/known_hosts-e1-<uuid>` (§1.3); (e) also `with one backslash inside and none at its end` | "the pin file is read as the one intended file where its path needs double quotes" |
| (M1) | `-m1`: every check of M1 (M1.2 to M1.18, the closed list, `noSentence`) under the label `M7 m7-<x>-m1` | "as M1" |
| (M2) | `-m2-*`: every check of M2 (b) (M2.0 to M2.6, M2.s1 to M2.s6, A2, the closed list) under the label `M7 m7-<x>-m2-…` | "as M2 (b), both legs" |

### 2.2 The mismatch legs: sentence C on both roads (`more`, after M2.5, before M2.6)

| # | Check | The row's words it holds |
|---|---|---|
| M7.c1 | `the install showed sentence C: exactly one error message after the mark, and it is the product's sentence C; no error holds sentence D` | "in the mismatch leg both roads show sentence C" |
| M7.c2 | `the bridge's socket check showed sentence C: exactly one error message that is "The bridge to "box" is not open: " and sentence C` (the prefix literal, §3.5; the log line of J8 is recorded, not counted) | as above |
| M7.c3 | `the stderr of the probe and of the mode check each holds the Offending line of ssh with the pin file of its own call, as ssh prints it` (`offendingNames(stderr, file)`: a whole line `Offending <type> key in <printed>:<n>`, CR LF allowed, `<printed>` = `printedBySsh(file)`: each backslash as two; `file` from that run's recorded argv) | "the `Offending` line names the pin file of a quoted word, and for (e) of a bare word with a backslash, which `ssh` prints as two" |

M7.c1 and M7.c2 read the sentence's text from `refusedHostKeySentence` and `unnamedHostKeySentence` (to tell C from D). M7.c3 does not
read the product: it is the independent half (BR11, HC4).

### 2.3 The collision

| # | Check (`M7 m7-c-collision-<k>: …`) | The row's words it holds |
|---|---|---|
| M7.x0 | `each pin file of the leg got its twin (the apostrophes taken out, K2's line) before its first run started: <n> pin files, <n> twins` (twin `at` < the run's `startedAt` or the bridge's `spawnedAt`; the probe's, the bridge's and the check's: 3 in k1, 3 in k2) | "a file at the path that the bare word resolves to (the apostrophes taken out) holds K2's line" |
| M7.w | as §2.1, quoted | the pin file is the intended one |
| M7.x1 | k1: `K1 logged exactly 5 accepted logins, one per run: 4 with a command session and 1 with none; the 4 runs of the runner ended with 0` | "with the counterpart K1, 5 accepted logins" |
| M7.x2 | k1, the witness (after the counts): `the witness: E1's words with the path bare, against K1, ended with 255 and the verification line, and K1 logged no new accepted login: the bare word reads the twin` | (the leg could have failed) |
| M7.y1 | k2: as M2.1 (`refusedRoads` of the lib, the bridge's line from its stderr file) | "with K2, each of the four runs that start ends with 255 and the verification line" |
| M7.y2 | k2: as M2.3 | "K2 logs 0 accepted logins and 0 authentication attempts" |
| M7.y3 | k2, **the control** (after the counts): `the control client with E1's words (the path bare: <leg>/st/x'y'z/control/known_hosts-control, K1's line; its twin K2's) was accepted by K2: exit 0, and K2 logged one more accepted login with a command session: it read the other file` | "The control: the control client with E1's words (the path bare) is ACCEPTED by K2: it read the other file" |
| M7.y4 | k2: the stand-in guard (as M2.5) | (the setup) |

M7.x2 and M7.y3 also check their own argv: the words before `-i` are exactly `e1WordsRaw(<file>)`, and the two values hold two apostrophes
and no double quote. **If M7.y3 is not accepted, M7 is not passed** (the setup: a control that does not show what its row says).

## 3. M12: `scripts/itestRowM12.cjs`

M12's last column: "Coverage first: the run reads the kinds from the product (`PIN_PATH_KINDS`, `hostKeyPin.ts:143`) and fails when one of
them is neither a leg (a)-(f) nor (g) or (h); and for each of (a)-(f) it asks the product's rule for the complete pathname of that leg's
folder and gets the kind of the leg, before a road is driven. (a)-(f), on each road: 0 starts of the client of ANY kind, the question
`ssh -V` included (the rule stands before the question); 0 connections in the counterpart's log; no file written into the storage folder;
no *bridged* row; sentence E with the kind of that path. (g), (h): the product's rule, asked with such a pathname, refuses it with its
kind; no road is driven for them, and the result says so; the control, the client alone: `ssh -G` with that word as both known-hosts options
does not resolve both lists to the one pathname ((g) in double quotes: `invalid quotes`; (h): expanded in the person's list and not in the
system-wide one), so the refusal has its reason on the client of this run. No recorded argv of the whole run of E3 names `/dev/null` as a
known-hosts file."

### 3.1 `m12-rule` (first)

| # | Check (`M12 m12-rule: …`) | The row's words it holds |
|---|---|---|
| M12.cov | `coverage: every kind of the product's PIN_PATH_KINDS is a leg of this row ((a)-(f) on the roads, (g) and (h) alone), and every leg's kind is a kind of the product: <8> kinds` (`coverage(Object.keys(product.PIN_PATH_KINDS), M12_LEGS)`; both directions) | "fails when one of them is neither a leg (a)-(f) nor (g) or (h)" |
| M12.g | `(g): the product's rule refuses <leg>/rule/known_hosts-e1-<uuid>\ with lastBackslash` | "(g), (h): the product's rule, asked with such a pathname, refuses it with its kind" |
| M12.h | `(h): the product's rule refuses ~/known_hosts-e1-<uuid> with tilde` | as above |
| M12.gc | `(g), the control, the client alone: ssh -G -F /dev/null with the pathname in double quotes as both known-hosts options ends with 255 and says invalid quotes` | "(g) in double quotes: `invalid quotes`" |
| M12.hc | `(h), the control, the client alone: ssh -G -F /dev/null with ~/known_hosts-e1-<uuid> as both options resolves userknownhostsfile to a path that does not start with ~ and globalknownhostsfile to ~/known_hosts-e1-<uuid>: not the one pathname` | "(h): expanded in the person's list and not in the system-wide one" |

`ssh -G` runs as the real client by its path with `-F /dev/null` (no config read; the person's files are not read by `-G`), `-p 1` and
`<user>@127.0.0.1`; it connects to nothing. An `info` line says `(g), (h): no road is driven for them: the rule and the client alone`. The
(h) value is written with the home as `~`.

### 3.2 `m12-<k>-<road>` (12 legs)

| # | Check (`M12 m12-<k>-<road>: …`) | The row's words it holds |
|---|---|---|
| M12.k | `the product's rule, asked with the complete pathname of the leg's folder (<storage>/keys/<pid>/known_hosts-e1-<uuid>), answers <kind>; the leg's folder alone answers no refusal` | "for each of (a)-(f) it asks the product's rule for the complete pathname of that leg's folder and gets the kind of the leg, before a road is driven" |
| M12.0 | `cold: 0 runs of ssh -V and 0 starts of the client before the click` | "each leg is cold" |
| M12.1 | `0 starts of the client of any kind after the mark, the question ssh -V included; the observer timed 0 runs of ssh -V` (bridge legs add: `the socket check has no start: it is never reached`) | "0 starts of the client of ANY kind, the question `ssh -V` included" |
| M12.2 | `K1 logged 0 connections and 0 authentication attempts after the mark` | "0 connections in the counterpart's log" |
| M12.3 | `no file was written into the storage folder: no sample of keys/<pid>/ held a file, and the folder holds the same files after as before (none)` (the sampler's samples, and `listing` before and after; folders recorded as `info`) | "no file written into the storage folder" |
| M12.4 | `no bridged row: the bridge manager holds no open bridge of the entry, and the bridge spawner was called 0 times` | "no *bridged* row" |
| M12.5 | `exactly ONE error message after the mark: "<prefix>" and sentence E with <kind words>; it holds no path` (prefix `Cannot reach "box": ` or `Cannot bridge to "box": `, literal; the text equals the prefix and `pinPathSentence('box', <kind>)`, AND holds the kind's words pinned from the plan's §3.11 (`KIND_WORDS` of the lib), AND `noPathIn(text, [<storage>, <folder name>, <leg>])`) | "sentence E with the kind of that path" |
| M12.6 | the liveness control (R.9 of E3.S5): `the control client signed in to the same K1 (exit 0) and K1 logged ONE more accepted login` | "the counterpart is K1, so only the refusal can stop the call" |
| M12.7 | `the click ended within 30 s` | (the leg ran) |

### 3.3 The scan (`devNullScan(check, top)`, in section 10's process, after the last row)

`M12.z`: `no recorded argv of this run names /dev/null as a known-hosts file: <n> argvs read in <m> records folders`. It reads every
`<pid>.argv` under every `records` folder at depth 1 and 2 of the section's folder (section 10's own and every leg's), with
`recordedStarts`' parser, and asks `devNullIn(argv)` (lib): a `UserKnownHostsFile` or `GlobalKnownHostsFile` value (`-o X=v` or `-oX=v`, the
name in any case, before `--`) that is `/dev/null` or `"/dev/null"`. It FAILs when `n` is 0 (it could not fail) or any argv names one; the
detail lists `{ folder, pid, option }`. E3.S10 runs the same function over the whole run of E3 (the stories document).

## 4. M14: `scripts/itestRowM14.cjs`

M14's last column: "(a): one accepted login; the recorded argv holds the six pairs of M1. (b), (c): exit code 255 and the verification line;
K2 logs 0 accepted logins and 0 authentication attempts. (d): 0 starts of the client of any kind, the question `ssh -V` included (cold), and
the agent's answer names the field and holds no path."

| # | Check (`M14 m14-<x>: …`) | The row's words it holds |
|---|---|---|
| M14.0 | every leg: `cold: 0 runs of ssh -V and 0 starts of the client before the call` | (the setup) |
| M14.a1 | `the agent's ssh:exec, through its own call off a bridge, answered status 200, exit code 0 and the nonce on stdout` | "the agent's `ssh:exec` through its own call, off a bridge" |
| M14.a2 | `the shim recorded 2 starts, each whole: the question ssh -V, which ended before the connection started, and ONE connection start` | (decision 15: the four counts) |
| M14.a3 | `the recorded argv holds the six pairs of M1, each once: StrictHostKeyChecking=yes, UserKnownHostsFile and GlobalKnownHostsFile = <storage>/keys/<pid>/known_hosts-e1, VerifyHostKeyDNS=no, KnownHostsCommand=none, LogLevel=ERROR` (values literal; the path pinned from J11) | "the recorded argv holds the six pairs of M1" |
| M14.a4 | `K1 logged exactly one accepted login, with a command session` | "(a): one accepted login" |
| M14.b0 | as M2.0 (b): `ssh -G` resolves the global file to `<leg>/known_hosts_global` | "the handed config of M2 (b)" |
| M14.c0 | as M8.0 | "the handed config of M8" |
| M14.cw | (c), the witness FIRST, before the mark: as M8.c (E1's words of a file of K1's line, accepted by K2, the command started at least once) | (the source is there and would be taken) |
| M14.b1 / M14.c1 | `the call answered exit code 255, its run's stderr holds the verification line as a whole line, and it was ONE connection start` (the recorded outcome AND the answer's body) | "(b), (c): exit code 255 and the verification line" |
| M14.b2 / M14.c2 | `K2 logged a connection for the start, 0 accepted logins and 0 authentication attempts` | "K2 logs 0 accepted logins and 0 authentication attempts" |
| M14.c3 | `the argv holds KnownHostsCommand=none once, and the command's record holds 0 starts after the mark` | (M8's words, for the exec) |
| M14.bw | (b), the witness after the counts: as M2.6 (the two pairs of before E1, accepted by K2) | (the leg could have failed) |
| M14.d0 | `the product's rule, asked with <storage>/keys/<pid>/known_hosts-e1 (the exec's own file), answers quote` | (the case is M12 (a)'s) |
| M14.d1 | `0 starts of the client of any kind after the mark, the question ssh -V included; the observer timed 0 runs` | "(d): 0 starts of the client of any kind, the question `ssh -V` included (cold)" |
| M14.d2 | `the agent's answer is a refusal no_credential whose message is sentence E with a double quote and names the place: The folder where this editor keeps the files of CredsForDevs` (code literal; the message equals `pinPathSentence('box', 'quote')` AND holds the two pinned parts) | "the agent's answer names the field" (Q2) |
| M14.d3 | `the agent's answer holds no path: neither the storage folder, nor its name, nor the leg's folder, nor a slash` (over `JSON.stringify(body)`) | "and holds no path" |
| M14.d4 | `no file was written into the storage folder` (as M12.3) and `K1 logged 0 connections`; then the liveness control (as M12.6) | (the call started nothing) |

## 5. The lib and the shared file

### 5.1 `scripts/lib/pathRecord.cjs` (new, pure)

`'use strict'`, `node:path` and `node:crypto` only, reads nothing when it is loaded, imports no module of the product. Exports:

| Export | Behaviour |
|---|---|
| `M7_LEGS`, `M12_LEGS` | the tables of §1.1, frozen: M7 `{ name, shape, folder, word: 'quoted' \| 'bare', run: 'm1' \| 'mismatch' \| 'switch' \| 'collision-k1' \| 'collision-k2' }`; M12 `{ name, letter, folder \| pathname, kind, road: 'install' \| 'bridge' \| null }` |
| `KIND_WORDS` | per kind the words of sentence E as the plan's §3.11 lists them (`a double quote`, `two backslashes in a row (a network path)`, `a percent sign`, `the characters ${`, `a backslash before an apostrophe`, `a control character`), for the six kinds of the roads |
| `coverage(productKinds, legs)` | `{ ok, missing, extra }`: `missing` the product's kinds that no leg has, `extra` the legs' kinds that the product lacks; ok only when both are empty and `productKinds` is not empty |
| `expectedWord(file, word)` | `"<file>"` or `<file>` |
| `printedBySsh(file)` | each `\` as `\\` (J7; no byte outside printable ASCII is in any folder of this story: it throws on one) |
| `offendingNames(stderr, file)` | whether a whole line of `stderr` (split at LF, CR LF allowed) is `Offending <type> key in <printedBySsh(file)>:<n>` |
| `resolvedBare(file)` | the file with every `'` taken out |
| `e1WordsRaw(file)` | `-o StrictHostKeyChecking=yes -o UserKnownHostsFile=<file> -o GlobalKnownHostsFile=<file>`, the path as it is; throws on a path with white space or a double quote |
| `devNullIn(argv)` | the known-hosts options before `--` whose value is `/dev/null` or `"/dev/null"`, as `[{ option, value }]` |
| `noPathIn(text, parts)` | `{ ok, found }`: ok when `text` holds none of `parts` and no `/` |
| `listingOf(dir)` | §1.2's `listing`, sorted by `rel`; `[]` for a folder that is not there |

### 5.2 `scripts/itestRowPaths.cjs` (new)

Header: what the three rows share; that the case is made by the storage folder alone; that the expected values are pinned. Imports the rig,
the libs of E3.S4, E3.S6 and this story, and `itestRowOtherKey.cjs`. Exports `storageAt`, `ruleOf` (§1.2), `wordCheck` (§1.3),
`sentenceCChecks(ctx, label, roads, counts)` (M7.c1 to M7.c3), `twinWriter(ctx, port, keyFile)` (§1.4: answers `{ onPin, twins }`),
`controlBare(ctx, server, folder)` (M7.y3 and M7.x2: writes the two files, runs `shared.login` with `e1WordsRaw`), `storageUnchanged(ctx,
label, roads, before, id)` (M12.3, M14.d4), `sentenceE(ctx, label, roads, leg, prefix)` (M12.5). Each function under 50 lines. Like every row
file it holds none of the needles of RR6 and RR7 (J19).

### 5.3 The three row files

`rowM7(check, top)` calls `rig.runLeg(check, top, 'M7', name)` for each leg of `M7_LEGS`, in its order; `rowM12` the same for `M12_LEGS`
(`m12-rule` first); `rowM14` for its four legs. `pinnedLegs` calls `rowM7`, `rowM12`, `rowM14` after `rowM8`, then `devNullScan`, then the
record of identities (J20).

## 6. Dependencies on the built rig (and what E3.S7 adds itself)

| # | What E3.S7 needs | Built? (file:line on `62251613`) | What E3.S7 does |
|---|---|---|---|
| D1 | a hook at each call's first run and at each bridge spawn, before the client starts | no: the gate takes a sample and may hold (`itestRowRig.cjs:206-231`), the spawner records (`:262-273`) | `openRoads`' option `onPin`, passed to `makeGate` and `recordingSpawner` (§1.4) |
| D2 | the agent's exec opened by the rig | no | `openExec` (§1.5), ≤ 45 lines |
| D3 | the leg process loads the row file | `ROW_FILES` has M1, M2, M3, M4, M6, M8, M9, `rig` (`:620-623`) | add M7, M12, M14 |
| D4 | M2's two legs of (b) on another storage folder, with M7's checks inside them | partly: the legs read `leg.storage` through the rig (J3), but `mismatch` and `switchLeg` are not exported and print the evidence inside (`itestRowM2.cjs:77-136`, `:61-68`) | export both; an optional third parameter `more(ctx, roads, counts, servers)` called after M2.5 (mismatch) or M2.s6 (switch), whose answer joins the evidence fields; with none, as today |
| D5 | `knownHostsPath` and `PIN_PATH_KINDS` of the product | partly: `productOf` spreads `hostKeyPin.js` (so `PIN_PATH_KINDS`, `pinPathRefusal`, `pinPathSentence` are there), not `hostKeyTrust.js` (`itestPinnedRoads.cjs:52-71`) | load `../hostKeyTrust` under the stub beside `../personPin` and add `knownHostsPath` |
| D6 | an exec world over the roads' host | no: `world()` registers the agent commands only (`personRoadsWorld.ts:383-418`) | `execWorld` (§1.5), reusing `detailsOf`, `storageOf`, `vaultOf`, `vscodeStub` |
| D7 | M1's runs and checks on a world that the leg opened | built: `m1Runs`, `standing`, `driveFive`, `acceptedOf` (`itestRowM1.cjs:178`) | — |
| D8 | the refused drive, the judge, the stand-in guard, the login of a control, `ssh -G` of a leg | built: `itestRowOtherKey.cjs` (`driveRefusedRoads`, `refusedChecks`, `standInGuard`, `login`, `whichFiles`, `writeSource`, `optionsOf`, `writePin`); M8's command writer is inside `itestRowM8.cjs:16-27`, not exported | export `writeCommand` from `itestRowM8.cjs` (one line) |
| D9 | the liveness control, `dismissAll` | built: `itestRowRefused.cjs:131-138`, `:204` | — |
| D10 | counterparts, mark, counts, evidence, closed list, sentences | built: `counterpart` `:143-155`, `mark` `:337-344`, `countsOf` `:371-390`, `nothingLeft` `:565-591`, `noSentence` `:594-599`, `evidence` `:602-615` | — |
| D11 | the recorded starts and the real client | built: `recordedStarts` (`itestPinnedRoads.cjs:160-166`), `viaReal` and `controlClient` (`itestRowRig.cjs:426`, `:469-474`) | — |
| D12 | the shim's `.stderr` file of the bridge | built (E3.S6, `itestPinnedRoads.cjs:141`) | — |

If the built rig differs from this table in a part that a leg relies on, the coder STOPS and tells the lead (no silent change of the rig).

## 7. The test: `src/test/itestRowsPaths.test.ts` (RED first)

Loads `scripts/lib/pathRecord.cjs` with `createRequire` at run time (as `itestRowsOtherKey.test.ts`), so it compiles before the lib exists;
owned folders through `ownedDir` of `scripts/lib/leftovers.cjs`.

| # | Asserts |
|---|---|
| PT1 | `M7_LEGS` holds exactly the 17 names of §1.1, each once; per shape one `m1`, one `mismatch`, one `switch`; the two collision legs on (c) only; each folder holds its shape's characters (a: a space; b: one `'`; c: two `'`; d: a space and a `'`; e: ends with `\`); `word` is `bare` for (e) alone |
| PT2 | `M12_LEGS` holds the 13 names, `m12-rule` first; the kinds are the eight literals of §1.1, each once; `coverage(Object.keys(PIN_PATH_KINDS), M12_LEGS)` (imported from `../hostKeyPin`) is ok; with one more kind `newKind` in the product's list it answers `missing: ['newKind']`; with a leg's kind `gone` it answers `extra`; with an empty list it is not ok. **The product agrees with the table** (the test, not the leg, may read the product): for each road leg, `pinPathRefusal('/o/leg/st/<folder>/keys/1/known_hosts-e1-<uuid>')` is the leg's kind; for (g) and (h) the pathname's; for each M7 folder it is `undefined`, and `checkedPin`'s word is quoted for (a)-(d) and bare for (e) |
| PT3 | `printedBySsh('/a/end\\/k')` doubles the backslash, a path with none is unchanged, a byte outside printable ASCII throws; `offendingNames` of a line with the printed name and `:1` (also CR LF) is true; with the name as is (one backslash): false; inside a longer line: false; `resolvedBare("/a/x'y'z/k")` is `/a/xyz/k` |
| PT4 | `devNullIn`: finds `-o UserKnownHostsFile=/dev/null`, `-oGlobalKnownHostsFile="/dev/null"` and `-o userknownhostsfile=/dev/null`; finds none in the argv that `hostKeyWords(checkedPin('/o/k', knows))` writes, in an `accept-new` argv, in `-F /dev/null`, and in a `/dev/null` after `--` |
| PT5 | `e1WordsRaw("/a/x'y'z/k")` is the six words with the path as it is in both; a path with a space or a `"` throws |
| PT6 | `noPathIn`: a text with the storage path, with the folder's name alone, or with a `/` is not ok and names what it found; sentence E of `pinPathSentence('box', 'quote')` against `['/o/st/q"uote', 'q"uote', '/o']` is ok |
| PT7 | `listingOf` in an owned folder: a file, a folder and a nested file are listed by relative path with their type, the file with its SHA-256; a folder that is not there is `[]` |
| PT8 | `KIND_WORDS` holds the six kinds of the road legs, and each words are inside the product's `pinPathSentence('box', <kind>)` (the plan and the product agree) |
| PT9 | skipped where no `ssh` is on `PATH` (as RR4b): for each M7 folder in an owned folder, `ssh -G -F /dev/null` with `expectedWord` as both options resolves both lists to the path; for (c) with the bare path both lists resolve to `resolvedBare(path)` (the collision's premise); for (b) bare the client ends with `invalid quotes` |
| PT10 | the exec world (`execWorld` of the compiled `personRoadsWorld.js`) with a storage folder `q"uote` in an owned folder, a saved key and no runner answer: `run('true')` answers `no_credential`, its message is `pinPathSentence('box', 'quote')`, and no run and no file was made (the runner mock records nothing; `listingOf` is `[]`) |

**RED.** Before the lib and D6: compile (exit 0), run the file: PT1 to PT9 fail on `…/scripts/lib/pathRecord.cjs does not exist` (PT9
skips where no `ssh` is on `PATH`); PT10 on `execWorld is not a function`. Save the output; any other text is a stop.

## 8. The proving runs

The stories document: a proving run passes no row and goes into §10 never; its numbers are "seen when it was built".

1. **Local, three times in a row,** on the last code commit, from that tree (`git status --porcelain --untracked-files=no` empty), with the
   proving command, each output saved outside the tree. Read in each: exit 0, no `FAIL`; every leg of §1.1 ended with 0; per leg its
   `evidence` line; M7.y3, M7.x2, M12.gc, M12.hc, M14.bw and M14.cw as their checks say; M12.z with `n > 0`; R1 to R9. The time of the script:
   projected about three minutes more than E3.S6's run (34 legs; not measured).
2. **After each run:** the after-run checks of S4.§9 (no `/tmp` name of the run, no process of the run), and no folder `st` outside a leg.
3. **CI** (the lead's): `itest:ssh-agent` green on the head sha, on the runner's `/usr/sbin/sshd`.

**If a proving run fails.** Five places are named here before the first run, because they rest on facts that are read and not measured:

- M7.e0 FAILs: the rule refuses the folder of (e). The row says the leg is then not passed; STOP, the lead (decision 18: the shape that M7
  (e) names cannot be made here).
- PT9 or M7.y3 shows that the bare word of (c) does NOT resolve to the twin (the control is refused by K2): the collision cannot run as
  written. STOP, the lead.
- M14.a2 shows 0 starts while M14.a1 is green: the exec's `ssh` did not go through the shim (J12: `sshSpawnLaunch` names the program). A
  harness fault if the leg process's `PATH` is at fault; otherwise STOP, the lead.
- The exec world does not load, or `sshDepsFor` reads a part that the world does not give (J12, J14): repair the world (data of the host
  only, no stand-in of a product module); if that is not enough, STOP, the lead.
- M12.3 or M14.d4 is red only because the product made a FOLDER (no file) in the storage folder: the check judges files alone (the row's
  "no file written") and records folders; if a file is there, it is red as it must be.

## 9. Mutations and hand checks

**Mutations** (each restored, its output saved):

| # | Mutation | Red | Needs an `sshd` |
|---|---|---|---|
| MP1 | `M7_LEGS` without `m7-e-m2-switch` | PT1 | no |
| MP2 | `coverage` reads only the legs' kinds (the product's list is not compared) | PT2 (`missing` is empty for `newKind`) | no |
| MP3 | `printedBySsh` leaves a backslash single | PT3 | no |
| MP4 | `resolvedBare` keeps the apostrophes | PT3 (and PT9 where `ssh` is there) | no |
| MP5 | `devNullIn` reads only `UserKnownHostsFile` | PT4 | no |
| MP6 | `devNullIn` drops the quoted value | PT4 | no |
| MP7 | `noPathIn` does not look for a `/` | PT6 | no |
| MP8 | the rig calls `onPin` AFTER `runner.runSshExec` returned (the gate) | M7.x0 in both collision legs, in a proving run | yes (scratch worktree) |
| MP9 | `devNullScan` reads no folder (`n` is 0) | M12.z, in a proving run | yes (scratch worktree) |

**Hand checks** (the product made to do the wrong thing that a leg is about), each in a scratch worktree OUTSIDE the story's tree, as S4.§12
says (R1 fails there, as it must; recorded as hand checks in c2, never as results). The prediction is EXACT for the legs of E3.S7: the checks
named red turn red, and every other check of the 34 legs stays green. A check whose result rests on what the real client prints for a word
it cannot read is named "not predicted" and recorded as seen. Outside these legs no red is expected (no earlier leg has a path that needs
quotes, a refused kind or an exec); any that is seen is listed in the record and is no part of the prediction.

| # | The product made to | Red in the legs of E3.S7 | Green in the legs of E3.S7 |
|---|---|---|---|
| HC1 | write every pin path bare (`hostKeyPin.ts:226`: `const word = file;`) | `m7-{a,b,c,d}-m1`: M1.3, M1.4, M1.5, M1.6, M1.8, M1.10, M1.11, M1.12, M1.14 to M1.17, M7.w; `noSentence` in (a) and (c) (sentence D: the client reads no file and prints the verification line). `m7-{a,c}-m2-mismatch`: M7.w, M7.c1, M7.c2, M7.c3. `m7-{b,d}-m2-mismatch`: M7.w, M7.c1, M7.c2, M7.c3, M2.1, M2.3 (`invalid quotes`: no verification line, no connection). `m7-{a,b,c,d}-m2-switch`: M7.w, M2.s1, M2.s2, M2.s3, M2.s6. `m7-c-collision-k1`: M7.w, M7.x1. `m7-c-collision-k2`: M7.w, M7.y1, M7.y2, M7.y4 (K2 is accepted through the twin; the install runs the stand-in) | every check of the (e) legs, of M12 and of M14; M1.2, M1.7, M1.9, M1.18, the closed list; M2.0, M2.2, M2.4 to M2.6, M2.s4, M2.s5; M7.x0, M7.x2, M7.y3. **Not predicted:** `noSentence` in (b) and (d) (what the install shows when the client ends before it connects) |
| HC2 | refuse no path (`pinPathRefusal`, `hostKeyPin.ts:185-187`, answers `undefined`) | every `m12-<k>-<road>`: M12.k, M12.1, M12.3, M12.5; M12.4 in the six bridge legs; M12.2 in (b) to (f) (the call connects with a word that names another file). `m12-rule`: M12.g, M12.h. `m14-d`: M14.d0, M14.d1, M14.d2, M14.d4 (the exec's own pin file is written and never deleted, J11) | M12.cov, M12.gc, M12.hc, M12.0, M12.6, M12.7; M12.2 in (a) (`invalid quotes`: no connection); every check of M7 (M7.e0 answers no refusal either way) and of `m14-a` to `m14-c`. **Not predicted:** M14.d3 (what the answer's stderr holds of `invalid quotes`) |
| HC3 | let the agent's exec run with no pin (`localPin`, `sshUseActions.ts:260-270`, answers `{ ok: true }`) | `m14-a`: M14.a2, M14.a3 (no question; `accept-new`). `m14-b`: M14.b1, M14.b2 (the global file trusts K2). `m14-c`: M14.c1, M14.c2, M14.c3. `m14-d`: M14.d1, M14.d2, M14.d4 (K1 logs a connection) | M14.0, M14.a1, M14.a4, M14.b0, M14.bw, M14.c0, M14.cw, M14.d0, M14.d3; every check of M7 and M12 |
| HC4 | read the `Offending` line without undoing ssh's printing (`unprinted`, `hostKeyPin.ts:340`, answers the name as printed) | `m7-e-m2-mismatch`: M7.c1, M7.c2 (sentence D: the doubled backslash is not the pin file) | M7.c3 of the same leg (the harness's own reading); every other check of the 34 legs |

HC2 and HC4 may share one run (their reds do not overlap); HC1 and HC3 likewise. The record says which shared.

## 10. Break it: ways to pass while the defect stays, and what stops each

| # | The way | What stops it |
|---|---|---|
| BR1 | the leg's storage folder never reaches the product, so the folder's characters are in no pin path | M7.w and M1.11 compare the recorded path with the leg's own `st/<name>`; M12.k asks the rule with that folder |
| BR2 | the expected word is read from `checkedPin`, so a defect of the quoting is expected | the table's `word` (§1.1); PT2 holds the product to the table, not the other way |
| BR3 | the twin never existed, or held K1's line, so the collision could not fail | M7.x0; the control M7.y3 (accepted by K2 through the twin) and the witness M7.x2 |
| BR4 | the twin is written after the client read its files | M7.x0 compares the times; MP8 |
| BR5 | sentence C is read from the product alone, so a wrong match reads as C | M7.c3 reads the `Offending` line with the harness's own printing; HC4 |
| BR6 | a refused road shows 0 starts because the shim was bypassed | the leg process's `PATH` check (`itestRowRig.cjs:647-651`); M14.a2 shows the shim's starts where a start is due |
| BR7 | 0 connections because the counterpart was down | M12.6 and M14.d4's liveness control |
| BR8 | coverage reads the spec's table, so a new kind of the product passes | `coverage` takes `Object.keys(product.PIN_PATH_KINDS)` read in the leg; PT2, MP2 |
| BR9 | sentence E's kind words are the product's, so a wrong kind word passes | `KIND_WORDS` pinned from the plan; PT8 |
| BR10 | the answer or the message echoes a path | M12.5 and M14.d3 (`noPathIn`); PT6, MP7 |
| BR11 | a pin file is written and deleted between two listings | M12.3 reads every sample of `keys/<pid>/` too (HC2) |
| BR12 | the `/dev/null` scan reads nothing | M12.z needs `n > 0`; PT4; MP9 |
| BR13 | M14 drives the builder, not the agent's call | `execWorld` runs `sshExecAction(deps).run` with `sshDepsFor`'s deps; the question `ssh -V` that only the call's asker starts (M14.a2); HC3 |
| BR14 | the exec runs bridged, so its argv names no pin file | the context has no `bridge`; M14.a3 asks the six pairs in the argv |

## 11. What is NOT measured by E3.S7

- **No row passes.** These are proving runs; §10 is E3.S10's, on the final tree.
- **The equals sign** (the lead's answer Q1 of the stories document): no leg; §10's CHANGELOG table says how the claim is backed.
- **A folder that is a real network path** (M12 (b) stands for it with a folder of that name on Linux, as the row says).
- **The warm state of the asker.** Every leg is cold; the refusal of a path stands before the question (J6).
- **Run with Secrets over SSH** (M14: not in this row), the agent's linked run, a bridged exec.
- **The broker's HTTP layer and consent** around the agent's call (Q1).
- **What the install shows** when the client ends before it connects (HC1, not predicted).
- **A root runner, another operating system, Windows, a client older than 8.5** (M11 (b) runs M7 there: E3.S9).

## 12. The documents

`research/module_tests.md`, the G1 section (after E3.S6's paragraphs):

1. **The table:** a row for `itestRowsPaths.test.ts` (PT1 to PT10, one sentence each); the row of `scripts/itestPinnedRoads.cjs`: its count
   of `ok` lines from the proving run, that section 10 runs M7, M12 and M14 after M8 and then the `/dev/null` scan.
2. **A paragraph `**M7, M12 and M14 on the rig (E3.S7).**`**: the 34 legs (§1.1); the case made by the storage folder alone (§1.2); the word
   and its pinned expectation (§1.3); the collision and the twin writer (§1.4); the exec world (§1.5); the scan (§3.3); what it does not
   prove (§11).
3. **`**M7, M12 and M14, seen when they were built (<date>, commit <sha>).**`** NOT §10 of the plan; it passes no row. Per leg: the four counts
   (from the evidence lines), the word, the rule's answers, the shown sentences, every control and witness with its exit code, the twins'
   times, M12.z's `n`, the three runs' times, the hand checks as hand checks, and the CI run (the lead's). Home folder as `~`, user as
   `<user>`, the leg's folder as `<leg>`.
4. **The table of *Test leftovers*** (the row of `ssh-agent-itest.cjs`): the `pin` folder also holds one folder per leg of M7, M12 and M14,
   each with `st/<name>` (names with a space, quotes, backslashes, `%`, `$` or a tab), and the twins of the collision.

## 13. Order of work, and the commits

1. `git status --short`. **The test** (§7) alone. Compile: exit 0. Run it: the REDs of §7. Save the output.
2. **The lib** (§5.1). PT1 to PT9 green; MP1 to MP7.
3. **D6** (`execWorld`). PT10 green.
4. **The rig** (D1, D2, D3), **D4**, **D5**, D8's export, **the shared file** (§5.2), **the three rows** (§2 to §4), `pinnedLegs` and the
   scan. `node --check` of every script; typecheck, lint, ratchet, `npm test`; `itestCallers`, `harnessSites`, `itestInstrument`,
   `itestRowRig` (RR6 and RR7 now read four more row files); the leftovers guard. `wc -l` of every new and changed file. Commit **c1** (one
   commit: no commit holds a red test): `test(ssh): G1 E3.S7: M7, M12 and M14 on the rig, the pin file's path and the agent's exec
   (PT1-PT10)`. Body: the RED texts, MP1 to MP7, the line counts, and that no product file, no workflow and no `package.json` changed.
5. **The proving runs** (§8, 1 and 2) on c1. **MP8, MP9 and the hand checks** (§9) in a scratch worktree. A harness fault that a run shows
   is repaired in a new commit (c1b, …), and the three runs are made again on the last one.
6. **The documents** (§12). `plan-lifecycle.mjs` and `public-hygiene.mjs` from the root: clean. Commit **c2**:
   `docs(tests): G1 E3.S7: M7, M12 and M14 as seen when they were built`. Body: what was OBSERVED in the three runs, the hand checks as hand
   checks, the after-run checks.

Stage by path; read `git diff --staged --stat` before each commit; do not push (the lead pushes).

## 14. Done when (each item can be counted)

- [ ] PT1 to PT10 were watched red with the texts of §7 and pass; MP1 to MP9 turned red what §9 names.
- [ ] Every leg of §1.1 is built, runs in its own leg process with the real resolve and the real asker, through the committed instrument,
      and ran from a tree with no modified tracked file.
- [ ] Three local proving runs on c1 (or its last repair): exit 0, no `FAIL`, every check of §2 to §4 `ok`, every control and witness as
      its check says, M12.z with `n > 0`, every leg process ended with 0, R1 to R9 `ok`; the after-run checks print nothing. The CI proving
      run on a head sha is green (the lead's box).
- [ ] HC1 to HC4 each turned red exactly what §9 names in the legs of E3.S7 and left green what it names (hand checks, in c2's body).
- [ ] typecheck, lint, ratchet, `npm test`, `itestCallers`, `harnessSites`, `itestInstrument`, `itestRowRig` and the leftovers guard green;
      every script at most 800 lines (`wc -l`), each new or grown file inside its budget.
- [ ] `research/module_tests.md` holds §12's items; no home path and no user name in a committed text.

## 15. Opus review checklist

1. Is each case made by the storage folder alone, set before the world opens, with the leg's own folder free of every character of §1.2?
2. Is every expected word, kind, prefix, kind word and path pinned here or computed from what the leg made? Where a product sentence is
   read, does a pinned part stand beside it?
3. M7: are M1's and M2 (b)'s checks all there under the M7 label? Does M7.c3 read the `Offending` line with the harness's own printing?
   Does (e) ask the rule first and drive nothing on a refusal?
4. The collision: are the twins written before each client starts (M7.x0)? Is the control accepted by K2 through the twin, with the bare
   words and its own argv checked? Is the witness in the K1 leg?
5. M12: coverage both ways, from the product's keys? One road per leg, cold? Files of the storage folder by the samples AND the listings?
   Sentence E with the pinned kind words and no path? The liveness control? (g) and (h) by the rule and `ssh -G` alone, with no road?
6. The scan: every records folder of the section, `n > 0`, both options, the quoted form?
7. M14: the action's own `run` with `sshDepsFor`'s deps, no bridge, the real resolve and asker? The six pairs literal, the path the entry's
   own file? The witnesses of (b) and (c)? (d): 0 starts, the refusal's code and message, no path?
8. Every leg in its own process, world, counterpart, key copy and folder? Each failed control or witness a named FAIL, the leg to its end?
9. The guards: RR6 and RR7 read the new row files and pass; every script ≤ 800 and inside its budget.
10. The documents: "seen when it was built", not §10; hand checks as hand checks; `~`, `<user>` and `<leg>`.

## What grows

| What | How much (projected) | Who retires it | When it is interrupted |
|---|---|---|---|
| one folder per leg (34): as the E3.S4 spec's leg folder, plus `st/<name>`, the twins (collision) and the command's records (`m14-c`) | about 60 kB per leg, about 2 MB per run | the section's scope removes the `pin` folder, pass or fail | the janitor (token `creds`) sweeps the owned folder; the odd names are nested inside it, so one removal of the top takes them |
| the exec's own pin file `known_hosts-e1` in `m14-a` to `m14-c` (J11: nothing deletes it) | one line each | with the leg's folder | as above |
| leg processes | 34 more per run, one at a time | `runLeg` waits for each; the limit ends it by pid and start time | as S4.*What grows* |

Nothing grows in the product.

## Notes for the lead

- **Links and rows.** The stories document (its status line and `## E3.S7`), the parent's `## Epics`, E3, and `todo/README.md` do not name
  this file. They are the lead's, in the commit that adds this spec.
- **Time.** 34 legs, about three minutes more per run (projected, not measured), in CI too.
- **CI** is dispatched by the lead (§8, 3).
- **Changed files of earlier stories:** `itestRowM2.cjs` (exports and `more`; with none the legs are as before), `itestRowM8.cjs` (one
  export), `itestPinnedRoads.cjs` (`productOf` gains `knownHostsPath`), `personRoadsWorld.ts` (`execWorld`; `world()` unchanged). None
  changes what those stories measured.

## Notes for the row stories

- **E3.S9 (M11 b)** runs "M7 (a)-(e) with its collision" on the older client: the tables, `wordCheck`, the twin writer and `controlBare`
  are in the shared file and the lib; the older client has no `KnownHostsCommand`, so M7's M1 legs there take M11's replaced assertion.
- **E3.S10** runs `devNullScan`'s function (`devNullIn` over every recorded argv) over the records of M10, M11 and M13 too.
- **E3.S8 (M5)** can read sentence C on both roads with `sentenceCChecks` (§5.2).

## Questions for the lead

**Q1 · M14: "the agent's `ssh:exec` through its own call, off a bridge, as section 9 … drives an exec".** (Not a plan change in my reading;
confirm.)
- The parent, M14 (its run column). What is so (J15): section 9 builds the argv with `buildSshExecArgv` and runs it itself
  (`itestNoSharing.cjs:139-143`); it never calls the agent's action.
- My reading (§1.5): "its own call" is the action's own `run` (`sshExecAction(deps).run`, `sshUseActions.ts:413`), with the deps that
  production assembles (`sshDepsFor`, `:565`), off a bridge, against the real `sshd`; "as section 9" names the real-`sshd`, off-bridge setting.
  The broker's HTTP layer and its consent stand above `run` and add no word to the argv; they are not in the path (§11). If the lead reads
  "its own call" as the broker's request, the instrument (a running broker with a grant) is not built and not known to work: decision 18.

**Q2 · M14 (d): "the agent's answer names the field".** (Not a plan change in my reading; confirm.)
- The parent, §3.11 (`:893`): "To the agent the answer names the field and no value"; test 22 (`:1162-1163`). What is so (J11): the answer is
  `errorBody('no_credential', <sentence E>)`, and `errorBody` has no field of its own for it (`brokerProtocol.ts:66`).
- My reading (M14.d2): the field is the place that sentence E names, "The folder where this editor keeps the files of CredsForDevs", with
  the kind (`a double quote`); M14.d2 holds both words, pinned; M14.d3 holds that no value (path) is there.

**Q3 · M7 (c): the collision's twin is written when the call's pin file is known, before its client starts.** (Not a plan change in my
reading; confirm.)
- The parent, M7: "a file at the path that the bare word resolves to (the apostrophes taken out) holds K2's line". What is so (J11, §1.4): that
  path holds the call's uuid, made by the call itself; no file can be put there before the call.
- My reading (§1.4): the rig's gate and recording spawner, which already see each call's pin file before its client starts (J16), call
  `onPin`, and the leg writes the twin there. The product's spawn, argv, environment and outcome are unchanged (as the lead's A2 of E3.S6 for
  the shim). M7.x0 shows the order; the control M7.y3 shows that the twin is what a bare word reads. If the lead does not accept it, the
  collision cannot run as written (decision 18).

## The answers (2026-11-24, the lead; none a plan change)

The consultants could not be asked: coai refused every call (its data folder was not found).

- **A1 (Q1):** accepted. "Its own call" is the action's own `run` (`sshExecAction(deps).run`) with the deps that production assembles
  (`sshDepsFor`), off a bridge, against the real `sshd`. The parent's words "as section 9 … drives an exec" name that setting, and section 9
  drives no broker either. The broker's HTTP layer and its consent add no word to the argv; §11 says they are not proven here.
- **A2 (Q2):** accepted. The field is the place that sentence E names, with the kind; M14.d2 pins both words as literals (not read from the
  product), and M14.d3 holds that no path is in the answer.
- **A3 (Q3):** accepted, as A2 of E3.S6 for the shim. The twin is written by the rig at the moment the call's pin file is known and before its
  client starts; the product's spawn, argv, environment and outcome stay as they are. M7.x0 must be able to fail (a twin written after the
  client started is red), and the control M7.y3 shows that a bare word reads the twin.
