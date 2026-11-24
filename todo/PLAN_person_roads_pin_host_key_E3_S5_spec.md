# PLAN — E3.S5 spec: a saved key that cannot be used, and a pin write that fails, in both states of the asker (M4, M9)

> Status: **spec, 2026-11-24, by Opus; not built.** Story E3.S5 of [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md)
> (its decisions 15, 16 and 18; §3.1, §3.2, §3.5, §3.10; `## Epics`, E3: *The setup of every measurement* and the rows M4 and M9; the
> candidates C1, C9 and C14) and of its stories document [PLAN_person_roads_pin_host_key_E3.md](PLAN_person_roads_pin_host_key_E3.md)
> (`## The rows: built story by story, measured once`, `## E3.S5`). It builds on the common rig AS SPECIFIED in
> [PLAN_person_roads_pin_host_key_E3_S4_spec.md](PLAN_person_roads_pin_host_key_E3_S4_spec.md) (not yet built when this was written). The
> parent, the stories document and `todo/README.md` do not name this file yet: the lead adds the links and the row (*Notes for the lead*).
> This file is promoted together with the parent.
>
> Scope: `src_vs_code/scripts` (four new files, four changed), one new test file and one changed test helper in `src_vs_code/src/test`, and
> `research/module_tests.md`. No product file (`src_vs_code/src` outside `src/test/`), no workflow, no `package.json`. **Read on `152696ae`,
> 2026-11-24** (every `file:line` below is of that commit; the measurements of the facts table were made the same day in a scratch worktree
> of that commit, outside the story's tree, and removed after). Opus writes this spec, a Sonnet coder builds it, Opus reviews it.

"The parent" is the plan linked above; M4, M9, §3.5, decision 15 and so on are the parent's. "The stories document" is the E3 document.
"The E3.S4 spec" is the spec of the common rig; its names (`runLeg`, `openRoads`, `warm`, RR1-RR8, F1-F25 and so on) are written with the
prefix `S4.` where they could be read as this document's own. This document's own names: the facts G1 to G16, the dependencies D1 to D6,
the checks R4.x and R9.x, the tests RF1 to RF8, the mutations MV1 to MV9, the hand checks HC1 to HC8, the break-its BR1 to BR14, and the
questions Q1 and Q2. "A leg" is what the E3.S4 spec says: one scenario with its own folder, its own leg process, its own world and its own
counterpart(s). This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`). The parent's
epoch 3 has ONE entry (3.1), so the next entry is the SECOND, and it stops the whole plan.

## What E3.S5 decides, in one paragraph

M4 and M9 are 25 legs on the rig of E3.S4, each in its own leg process, with the REAL resolve, the REAL asker and the REAL pin writer.
A saved key that cannot be used is made by the entry's own data: a stored text that does not parse (b), or a parsed key on a host that
cannot form a known-hosts line (c). A pin write that fails (d) is made in the storage that the product writes to: the leg makes the
window's key folder `keys/<pid>/` readable and not writable, and the product's own `materializeKnownHosts` throws `EACCES` at its
`writeFileSync` (measured, G4). No product code is changed for a leg. Each refused case runs on each of the two roads that it can reach
(*Install creds on host*, *Open Remote Bridge…*), once cold and once warm, each in a world of its own; the socket check has no start of any
kind there, and the record shows it. A leg's numbers are the four counts of decision 15, from the shim and from the counterpart's log, and
the order of the question `ssh -V` and the sentence. After its counts each refused leg runs a liveness control: the control client logs in
to the same counterpart, so that "0 connections" cannot come from a counterpart that was down. M9 ends with Connect's repair: Connect's
options (the product's `connectionOptions`) with the real scan of K1 and *Trust and connect* answered only for K1's fingerprint, then the
runs of M1 on the entry that Connect wrote, in the same world, cold. **"The repair of sentence A" is that repair by the person, as sentence
A's key form advises it; it is no product change (§10).** A password entry gets the password form, the same numbers, and no password
attempt in the counterpart's log; for C1 the leg records what Connect's options name for it when the scan answers nothing.

| File | Change | Lines (budget) |
|---|---|---|
| `scripts/lib/refusedRecord.cjs` (new) | pure: the table of the 25 legs, the message that a refused leg expects, and the judge of a refused leg's counts | ≤ 200 |
| `scripts/itestRowRefused.cjs` (new) | the refused leg that M4 (b)-(d) and M9 share: open, cold or warm, make the case, click, count, check, the liveness control, the evidence | ≤ 380 |
| `scripts/itestRowM4.cjs` (new) | `rowM4(check, top)`, `legs`: the 15 legs of M4; (a) on the five runs | ≤ 260 |
| `scripts/itestRowM9.cjs` (new) | `rowM9(check, top)`, `legs`: the 10 legs of M9; Connect's repair and the C1 record | ≤ 320 |
| `src/test/itestRowsRefused.test.ts` (new) | RF1 to RF8 | ≤ 340 |
| `src/test/personRoadsWorld.ts` | D3: `World.replaceHost`, `World.said[].at`, `World.shares`, `World.connectOptions` with the host's `updateDetailsFields` | E3.S4's count + about 40 |
| `scripts/itestRowM1.cjs` | D2: M1's drive and M1's checks exported for a world that a row gives (no check changes) | E3.S4's count + about 15 |
| `scripts/itestIdentities.cjs` | D5: a program that a leg names in `tool.json` is an executable of the record (ssh-keyscan); check R8 | E3.S4's count + about 25 |
| `scripts/itestPinnedRoads.cjs` | `pinnedLegs` calls `rowM4` and `rowM9` after `rowM6` | E3.S4's count + 3 |
| `research/module_tests.md` | M4 and M9 "seen when they were built"; the world's additions; `tool.json` | — |

## Binding constraints

The binding constraints of the E3.S4 spec hold here, word for word (no plan change; only `vscode` is a stand-in on the rows' roads; through
the committed instrument only; a run of the commit; the four counts apart; the guards green; exe + argv with a time limit, every process
ended by pid and start time; the person's `~/.ssh` never read or written; Node only, no Python; at most 800 lines per script; no home path
and no user name in a committed text; lowered priority, leg processes one at a time). In addition:

- **No product code changes for a leg.** A saved key that cannot be used is made by the entry's data (`hostKey`, `host`); a pin write that
  fails is made by the mode of the storage folder. Never by a module stand-in, a patched function or a changed constant.
- **The new row files are inside the guards of the E3.S4 spec.** `scripts/itestRowRefused.cjs`, `itestRowM4.cjs` and `itestRowM9.cjs` match
  `scripts/itestRow*.cjs`, so S4.RR6 and S4.RR7 read them: none of them holds `startServingSshd(`, `stopListener(`, `endServer(`,
  `.world(` or `launch(`, and none holds the text `sshExecAuth` or `pinClient'`, comments included.
- **The mode of `keys/<pid>/` is put back** to `0700` in a `finally` of the leg that changed it, before the leg's end checks.
- **Connect's options never go on to a connection.** The legs call `connectionOptions` and read its answer; no leg starts Connect's
  terminal or session. A password entry's Connect, which would send the password with `accept-new` (§3.5), is never run past its options.

## Facts read on `152696ae` and measured on 2026-11-24 that this spec uses

| # | Fact | How |
|---|---|---|
| G1 | **The tree.** `fix/g1-e3-release-gate` at `152696ae` (the E3.S4 spec). In the story's worktree a coder is building E3.S4 now (`git status --short`: `M src_vs_code/src/test/personRoadsWorld.ts`, `?? src_vs_code/src/test/itestRowRig.test.ts`). This spec builds on E3.S4 as its spec says, not on a half-built file | read |
| G2 | **The order of the pin of one call.** `decidePinOfCall` (`pinOfCall.ts:51-62`): no saved key → nothing; the rule of the path (`:56`); the question (`await parts.ask(call)`, `:60`); then `written` (`:65-72`): a throw of `materializeKnownHosts` is `unwritten` (`:70`), `undefined` is `unusable` (`:72`). So sentences A and B come AFTER the question, as decision 15 says | read |
| G3 | **What makes a saved key unusable, and where the file is written.** `materializeKnownHosts` (`hostKeyTrust.ts:80-98`) answers `undefined` when `parseHostKey` (`hostKeyPin.ts:113`) finds no key, or when `knownHostsLine` (`hostKeyPin.ts:130`) refuses the host by `isSafeSshHost` (`sshCommand.ts:83-85`: `^[A-Za-z0-9._:\[\]-]+$`, no leading `-`); else it makes `keys/<pid>/` (`mkdirSync`, recursive, `0700`, `:94`) and writes the file (`writeFileSync`, `0600`, `:95`). `keys/<pid>` is `materializedKeysDir` (`materializedKeys.ts:51`), `<pid>` the process's pid | read |
| G4 | **The real writer, measured** (the compiled `personPin.writePersonPin` of `152696ae`, its asker a stand-in answering `knows`, an owned storage folder, uid 1000): a text that does not parse → sentence A, the key form for `auth: 'key'` and the password form for `auth: 'askpass'`, and `keys/<pid>/` was not even made; a parsed key on the host `not a host` → sentence A, key form, nothing made; **`keys/<pid>/` at mode `0500` → `Could not write the saved host key of "box" to disk: EACCES: permission denied, open '<storage>/keys/<pid>/known_hosts-e1-<uuid>'`, the folder empty after**; a plain write of a probe file into that folder threw `EACCES` too; `keys/<pid>` made a FILE → `EEXIST … mkdir`; an entry id of 300 characters → `ENAMETOOLONG … open`; a usable pin → `pinned`, one `known_hosts-e1-<uuid>` | measured, outside the tree, nothing kept |
| G5 | **Sentence B carries the error's own text**, the pin file's path included (G4). So a leg compares B by its opening (`pinWriteFailedSentence(name, new Error(MARK))` up to the mark, S4.§2 `sentencesOf`) and by the code `EACCES`, never by the whole text | measured |
| G6 | **The credential is decided first, and it writes into the same folder.** The guards call the pin writer only for an `ok` credential (`writtenKey.ts:76-86`). A stored key is written per call into `keys/<pid>/` (`byStoredKey`, `sshExecAuth.ts:165-175`, `materializeCallKey` `:171`); a password writes `keys/<pid>/askpass.sh` (S4.F10); a key named by its path writes nothing (`sshExecAuth.ts:150`). So with `keys/<pid>/` not writable a stored key or a password is refused by its OWN credential sentence before the pin writer runs; **(d) is built on a key named by its path** | read |
| G7 | **The two roads.** *Install creds on host*: the guard `agentCommands.ts:273`, the refusal `Cannot reach "<name>": <message>` `:278`. *Open Remote Bridge…*: the token is minted by `agentServer.share` `:415`, BEFORE the resolve and the guard `:429`; the refusal `Cannot bridge to "<name>": <message>` `:434`; the bridge `:455`; the socket check `void verifyBridgeSocket` `:468`, reached only after a bridge was started. The socket check's own guard is `:194` | read |
| G8 | **The asker.** `pinClientAsker` (`pinClient.ts:84-96`) keeps a `knows` answer under the program word, the folder and `PATH` (`keptUnder`, `:100`); `windowPinClient` `:116`. A password call's environment differs from a key call's by the askpass variables only, so a warming call with the leg's own credential warms the asker for the leg's click | read |
| G9 | **Connect's options, measured** (the compiled `connectionOptions` of `152696ae` under a recording `vscode` stand-in, against the unpacked `sshd` 10.2p1 with host key K1, the entry's `hostKey` `not a host key`). *Key entry, the scan answers:* one modal warning, `First connection to "box" (127.0.0.1).` with `ssh-ed25519` and K1's `SHA256:` fingerprint (the one `ssh-keygen -lf` prints) and the button `Trust and connect`; answered, the storage got ONE `updateDetailsFields` whose `hostKey` equals K1's `<algorithm> <base64>` exactly; the answer named `knownHostsFile` `keys/<pid>/known_hosts-e1` (no suffix), holding `[127.0.0.1]:<port> ssh-ed25519 …`; 48 ms. *Password entry, the scan given no answer* (a port where nothing listens): Connect's options answered a value (not `undefined`: the connection would go on), with NO `knownHostsFile`, no `pin`, no question and no update; 5 ms. Code: `connectionOptions.ts:46-72`, `persistPin` `:87-99` (`updateDetailsFields` `:96`), the scan `:135`; `scanHostKey` `hostKeyTrust.ts:32-55` (`runBounded('ssh-keyscan', …)` `:46`); `confirmHostKey` `:123`, `askFirstContact` `:139-148`; `pinVerdict` `hostKeyPin.ts:457-466` (a stored text that does not parse with a scanned key is `first-contact`, `:463`) | measured |
| G10 | **What one scan leaves in a VERBOSE log.** `ssh-keyscan -T 5 -p <port> -- 127.0.0.1` (the product's argv, `hostKeyTrust.ts:40-44`) against that `sshd` made 5 connections (`Connection from` ×5) and logged `Connection closed by 127.0.0.1 port <n> [preauth]` and `Unable to negotiate with 127.0.0.1 port <n>: no matching host key type found. …`; no line matches `AUTH_ATTEMPT` (`Accepted |Failed |Postponed |Invalid user|authenticating user`, `itestPinnedRoads.cjs:39`) | measured |
| G11 | **ssh-keyscan's identity.** `/usr/bin/ssh-keyscan` has no `-V` (`unknown option -- V`); `dpkg -S` names the package `openssh-client`, and `dpkg-query -W -f '${Version}' openssh-client` answers `1:10.2p1-2ubuntu3.8` here | measured |
| G12 | **Connect's module is in the world's graph.** After `world({})`, the require cache holds 170 modules of `out/`, `connectionOptions.js` and `hostKeyTrust.js` among them: `agentCommands` reaches them (`sshSession.ts:16`; `pinOfCall.ts:2`). Both are bound to the world's `vscode` stand-in and its mocks | measured |
| G13 | **The rig's observer of `./sshExecRunner` replaces the runner of `hostKeyTrust` too.** `hostKeyTrust.ts:4` imports `runBounded` from `'./sshExecRunner'`, the request that S4.§1.7's observer replaces in the graph (G12). A module stand-in without `runBounded` makes `scanHostKey` call `undefined`, and its `catch` (`hostKeyTrust.ts:52-55`) answers "nothing learned": Connect would then show no fingerprint and write nothing, silently (read, not run) | read |
| G14 | **The world, as `152696ae` has it.** `share` of the host's `agentServer` records nothing (`personRoadsWorld.ts:283`); the host's `storage` has no `updateDetailsFields` (`:294`); `dialog` records no time (`:179-190`); `ROW` `:161`. The E3.S4 spec adds `realResolve`, `vault`, `said`, `replaceHostKey` (S4.§4.4) | read |
| G15 | **The record of identities names no program but `sshd`, its helpers, its listeners and sessions, and the client** (`itestIdentities.cjs:86-94`); `versionOf` reads an `OpenSSH_` line of `-V` (`:59-62`) | read |
| G16 | **What the E3.S4 spec gives the rows** (S4.§3, S4.N3, S4.N4): `runLeg`, `rowsTop`, `legRig`, `counterpart` (with `passwords`), `endCounterpart`, `openRoads` (real resolve over a vault, `realClient`, the observer, the recording spawner, the sampler), `installAnswer`, `warm` (it marks the leg), `mark`, `countsOf` (per road and per counterpart; a road with no start is listed with 0), `pinFileOf`, `controlClient` (E1's words by default), `nothingLeft`, `noSentence`, `evidence`; the lib's `isQuestion`, `isConnectionStart`, `roadOf`, `logCounts`, `sentencesOf`, `saysASentence`; `World.said`, `World.replaceHostKey`. M1 uses `installStandIn` and `listingOf` (S4.§6) | read |

## Commands

As the E3.S4 spec's *Commands* (in `src_vs_code`, `LP=../.agents/conventions/tools/low-priority.mjs`): compile (read its exit first), one
suite through `scripts/run-tests.mjs`, typecheck, lint, ratchet, `npm test`, `node --check scripts/<file>.cjs`, the proving run
`CREDS_ITEST_SSHD="$HOME/.cache/creds-itest-sshd/sshd-wrap.sh" CREDS_ITEST_SSHD_CONFIG="$HOME/.cache/creds-itest-sshd/extra.conf" npm run itest:ssh-agent`,
and from the root the leftovers guard, `plan-lifecycle.mjs` and `public-hygiene.mjs`.

## 1. The decisions

### 1.1 What makes each case, through the product's own data

| Case (M4) | Credential | What the leg sets before its click | What the product then does (G2-G6) | The message (G7) |
|---|---|---|---|---|
| (a) absent | named key | `replaceHostKey(undefined)`, `''`, `'   '`: one leg each | unpinned: `accept-new`, no question | none of §3.5 |
| (b) a text that does not parse | stored key | `replaceHostKey('not a host key')` | the question, then `unusable` | `<prefix>` + sentence A in the login's form |
| (c) a parsed key on a host that cannot form a line | stored key | the entry keeps K1's text; `replaceHost('not a host')` (D3) | the question, then `unusable` (`isSafeSshHost` refuses the space) | `<prefix>` + sentence A in the login's form |
| (d) a pin write that fails | named key (G6) | the entry keeps K1's text; `keys/<pid>/` made (`0700`) and set to `0500` | the question, then `writeFileSync` throws `EACCES`: `unwritten` | `<prefix>` + sentence B, with `EACCES` |

`<prefix>` is `Cannot reach "box": ` on the install and `Cannot bridge to "box": ` on the bridge. The texts come from the product's
functions (`unusablePinSentence`, `pinWriteFailedSentence`, `personPin.ts:34`, `:42`), never from a text typed here (§3.5, *The words as E2
built them*). The world is opened as the E3.S4 spec opens it (the entry pinned to K1 at `127.0.0.1` and the counterpart's port), and the leg
changes the entry by `replaceHostKey` or `replaceHost` BEFORE its first click when cold, or AFTER `warm` when warm. A replaced snapshot is
read by the next click and asks nothing, so a cold leg stays cold (S4.§1.7; S4.RP1 proves the replaced snapshot is read).

**Why (d) is the folder's mode and not another fault.** It is the one fault that works the same in both states with the parts the E3.S4
spec gives: `warm` needs a pinned call that reaches K1's probe, so the fault must come AFTER the warming call, and the folder's mode can be
set then. A long entry id (`ENAMETOOLONG`, G4) would also fail a warming call; a file in place of `keys/<pid>` (`EEXIST`, G4) cannot be
made after the warming call has made the folder. **Its limit:** a process that runs as root writes into a `0500` folder. So the leg first
writes a probe file into it and must see `EACCES` (R4.d0); a runner where the write goes through fails the leg as "could not fail", and the
lead is told (it is then a row that cannot run as written: a plan change). The GitHub runner's user is not root (not checked here: the CI
proving run shows it).

**Why (b) and (c) use a stored key.** The call's own key file is then written (by the real resolve, before the pin writer) and must be gone
after the refusal: "0 files left in `keys/<pid>/`" has something to find. (d) cannot use it (G6).

### 1.2 The legs

M4, 15 legs; M9, 10 legs. Every leg is its own leg process (S4.`runLeg`), its own world and its own counterpart K1. The table is
`M4_LEGS` and `M9_LEGS` of `lib/refusedRecord.cjs` (RF1).

| Legs | Case | Road | State | Credential | K1 |
|---|---|---|---|---|---|
| `m4-a-none`, `m4-a-empty`, `m4-a-space` | (a) | both: the five runs | cold | named key | with the install's stand-in |
| `m4-b-install-cold`, `m4-b-install-warm`, `m4-b-bridge-cold`, `m4-b-bridge-warm` | (b) | the one named | as named | stored key | plain |
| `m4-c-…` (the same four) | (c) | as named | as named | stored key | plain |
| `m4-d-…` (the same four) | (d) | as named | as named | named key | plain |
| `m9-key-install-cold`, `m9-key-install-warm`, `m9-key-bridge-cold`, `m9-key-bridge-warm` | a pin that does not parse | as named | as named | stored key | plain |
| `m9-password-…` (the same four) | a pin that does not parse | as named | as named | password | `passwords: true` |
| `m9-key-repair` | the same state, then Connect's repair, then M1's runs | the five runs | cold | stored key | with the install's stand-in |
| `m9-password-connect` | the same state; Connect's options with the scan given no answer (C1) | none | cold | password | ended before Connect |

**One road per refused leg, one leg per state.** M4 says "each run TWICE on each road, in a world of their own". M9 says "the roads, once
cold and once warm, each in a world of its own", and asks "cold, exactly one per refused call": in one cold world the second refused call
finds the answer that the first one kept (G8) and starts nothing, so each road needs its own cold world. The M9 key legs are the same
scenario as M4 (b); they run as legs of their own, so that each row has its own evidence.

### 1.3 The refused leg (`refusedLeg(ctx, spec)`, `itestRowRefused.cjs`)

1. `k1 = counterpart(check, leg, 'k1', top.k1, { passwords: spec.credential === 'password' })`.
2. `roads = openRoads(leg, k1.port, { credential: spec.credential, answer: dismissAll })` (a new world: cold).
3. **Cold:** the case's change (§1.1), then `mark(leg, roads, [k1])`; check R.0: `<leg>: cold: 0 runs of ssh -V before the click`.
   **Warm:** `warm(check, leg, roads)` (one pinned install call to K1, its question dismissed; it checks ONE question and the probe, and
   marks the leg), then the case's change.
4. **(d) only:** make `keys/<pid>/` if it is not there (`mkdirSync`, `0700`), `chmodSync(dir, 0o500)`, then the write probe (R4.d0). The
   mode is put back in the `finally` of the leg body.
5. The click: `installRemoteCli` or `openRemoteBridge`, bounded (30 s; the question alone is bounded by the runner's 10 s). Then 3 s of
   settling, so that a start that a defect would add (a bridge and its check: the check waits 1.5 s, `agentCommands.ts:210`) is in the record.
6. `counts = countsOf(leg, roads, [k1], commands)`; the checks of §1.4.
7. **The liveness control:** `controlClient(leg, { port: k1.port, pinFile: await pinFileOf(leg, 'k1', k1.port, top.k1) })` (E1's words, the
   user key, a command `true`): exit 0, and K1's log after the counts holds ONE more accepted login. Its own start is the real client by its
   path, never the shim, so it is not in the leg's counts (S4.§3.12).
8. `nothingLeft(check, label, leg, roads, [])`, `endCounterpart`, `evidence(leg, roads, [k1], fields)` with `case`, `road`, `credential`,
   `writeProbe` (d), `minted` (C9), `leftByFailedWrite` (C14), `liveness` and the `-V` end and the sentence's time.

### 1.4 The checks of a refused leg (R4.x for M4, R9.x for M9: the same function, the row's prefix)

| # | Check (`M4 <leg>: …` / `M9 <leg>: …`) | The row's words it holds |
|---|---|---|
| R.1 | 0 connection starts on every road: `install` 0, `bridge` 0, `check` 0, each listed | "0 connection starts" |
| R.2 | the socket check: 0 starts of ANY kind are listed for it (`byRoad.check` with no start), and no run's argv names the sweep or the mode check | "the socket check … has no start of any kind and the record shows it" |
| R.3 | K1's log after the mark: 0 `Connection from` and 0 authentication attempts (`logCounts`) | "0 connections and 0 authentication attempts in the counterpart's log" |
| R.4 | no *bridged* row: the recording spawner spawned 0 bridges, and `w.bridges.isOpen(KEY)` is false | "no *bridged* row" |
| R.5 | the starts of the client: **cold**, exactly ONE start, its argv exactly `-V`, and that run (the observer's `startedAt + ms`) ended before the `at` of the refusal message (D3); **warm**, exactly 0 starts of any kind | "*cold*, exactly ONE per refused call, the question `ssh -V`, and it had ended before the sentence was shown; *warm*, exactly 0" |
| R.6 | exactly ONE error message after the mark, and it is `<prefix>` + the expected text (§1.1; RF3); no other entry of `World.said` after the mark holds a sentence of §3.5 | "sentence A in the login's form for (b) and (c), sentence B for (d)" / "showed the key form" / "was shown the password form" |
| R.7 | **M4 only:** after the leg's last end, `keys/<pid>/` holds no file (or is not there). A `known_hosts-*` name that a sample of the leg saw and that is still there after the end is NAMED (`info`) and is the one exception of M4 (C14), in (d) only | "0 files left in `keys/<pid>/` (except one case, candidate C14 …)" |
| R.8 | **M9 password legs only:** K1's log after the mark holds no `Failed password` and no `Accepted password` line (`logCounts(…).passwords`) | "the counterpart's log shows no password attempt" |
| R.9 | the liveness control (§1.3, 7) | (the leg's own evidence that its zeros are not a counterpart that was down) |
| R4.d0 | **(d):** the write of a probe file into `keys/<pid>/` threw `EACCES` (the probe is removed if it was written) | (the leg could fail: the fault is real) |

**Recorded, not judged:**
- **C9** (bridge legs): `info  <row> <leg>: C9: the bridge's command minted <n> token(s); the first before the refusal message: <yes|no>`, from
  `World.shares` (D3). Read on `152696ae`: `share` stands before the guard (`agentCommands.ts:415`), so the expected record is "1; yes".
- **C14** ((d) legs): `info  M4 <leg>: C14: pin files that the failed write left: none` or their names. With `EACCES` at the `open` (G4)
  nothing is begun, so "none" is the expected record; this leg cannot make a partly written file, and §14 says so.

### 1.5 M4 (a) on the five runs

Each of `m4-a-none`, `m4-a-empty`, `m4-a-space`: named key, K1 with `standIn = installStandIn(leg, nonce)` (`extra: standIn.extra`),
cold, the entry's `hostKey` replaced before the first click. Then the five runs as M1 drives them (D2: `driveFive`): *Install creds on
host* to its end (`installAnswer`, 200 s), *Open Remote Bridge…* (30 s), its check (40 s), *Close Remote Bridge* (5 s).

| # | Check (`M4 <leg>: …`) | M4 (a)'s words |
|---|---|---|
| A.1 | cold: 0 runs of `-V` before the first click | (the state that "cold, 0 starts … with `-V`" needs) |
| A.2 | the install ended with its install run at 0 and the product's message for an installed `creds`; the bridge opened, its socket existed, the sweep and the mode check ended with 0; *Close* ended the bridge | the five runs ran |
| A.3 | the shim recorded exactly 5 starts, all 5 connection starts (probe, install run, bridge, sweep, mode check), and 0 starts with `-V` | "the 5 connection starts …"; "cold, 0 starts of the client with `-V` (an unpinned call is not asked)" |
| A.4 | each of the 5 argvs holds `StrictHostKeyChecking=accept-new`, no `UserKnownHostsFile=` and no `GlobalKnownHostsFile=`, and none of `VerifyHostKeyDNS`, `KnownHostsCommand`, `LogLevel` | "carry `accept-new`, no known-hosts file and none of the pairs of E2" |
| A.5 | K1 logged exactly 5 accepted logins (4 with a `command` session, 1 with none), 5 client ports reached authentication | "5 accepted logins" |
| A.6 | no sample of `keys/<pid>/` during the leg and no listing after it holds a `known_hosts-` name, and no argv names a known-hosts file | "0 pin files written" |
| A.7 | `noSentence` | (no sentence of §3.5 for an absent pin) |
| A.8 | the stand-in's marker holds the nonce, and the listing of `/usr/local/bin/creds` and `/tmp/creds-install.*` is the same before and after (labelled "the stand-in", not M4's words: it keeps the run inside its owned folder, as in M1) | (the setup, *The install's stand-in*) |
| A.9 | `nothingLeft`; K1 and what it forked are gone | (the leg's own end) |

### 1.6 M9: Connect's repair, and the C1 record

**`m9-key-repair`** (stored key; K1 with the install's stand-in; cold):

1. The world opened; `replaceHostKey('not a host key')` (the state of the key legs); `mark`.
2. `opts = await roads.w.connectOptions()` (D3: the product's `connectionOptions`, from the world's own graph, with the current snapshot).
   The leg's `answer` gives `Trust and connect` ONLY to a question whose text holds K1's fingerprint (`hostKeyFingerprint` of K1's public key,
   the product's own function in `hostKeyPin.js`), and dismisses every other question: the key form's "go on only if it shows that
   fingerprint".
3. Checks:
   - R9.r1 `M9 m9-key-repair: Connect showed ONE question, and it holds K1's fingerprint and the button Trust and connect` (G9). Without it
     the scan answered nothing (G13: D1), and the leg fails here.
   - R9.r2 `… the storage got ONE update, and the stored pin is K1's line` (`World.updates`, D3): its `hostKey` equals K1's
     `<algorithm> <base64>` read from `<top.k1>.pub`, and the world's snapshot now holds it.
   - R9.r3 `… Connect's options named the file keys/<pid>/known_hosts-e1, holding K1's line for [127.0.0.1]:<port>`; the leg then removes
     that one file by its exact path (it is Connect's file, which Connect's session deletes, `sshSession.ts:605-616`) and lists it as removed.
   - R9.r4 `… Connect asked the client nothing: 0 runs of -V` (the observer), so the world is still cold for M1.
   - `info  M9 m9-key-repair: Connect's scan: <n> connections and <m> authentication attempts in K1's log` (G10: 5 and 0 expected).
4. **"Then the runs of M1"**: `m1Runs(ctx, { leg, roads, k1, standIn, label: 'M9 m9-key-repair: M1' })` (D2) in the SAME world, on the entry
   as Connect wrote it, cold. Every check M1.1 to M1.19 of the E3.S4 spec runs, with its words, under that label. "M1 passes on that entry"
   is those checks, all `ok`. See Q1.

**`m9-password-connect`** (password; cold): K1 is started and then ended by `endCounterpart` before Connect, so its port answers nothing
("the scan given no answer"). The entry is in the state of the password legs. `opts = await roads.w.connectOptions()`. Recorded for C1:
`info  M9 m9-password-connect: C1: Connect's options answered <go on|stop>, named <no pin file|<name>>, saved <no pin|…>, asked <0|n> questions`
(G9: "go on, no pin file, no pin, 0"). Check R9.c1: the record was taken (Connect's options answered within 20 s, each field known).
Nothing connects: the leg starts no `ssh` after the options (its shim records 0 starts, checked).

### 1.7 What M9's row needs beyond M4's checks, by leg

- `m9-key-*`: R.1 to R.6 and R.9; R.6 expects the key form.
- `m9-password-*`: R.1 to R.6, R.8 and R.9; R.6 expects the password form. "With the same numbers in both states": R.1 to R.5 are the same
  checks as for the key legs.
- `m9-key-repair`: §1.6. `m9-password-connect`: §1.6.

### 1.8 The identities of what M9 ran

The product's scan starts `ssh-keyscan` (G9), which is no client of the shim and is in no record today (G15). The two Connect legs write
`<leg>/tool.json` (`{ role: "ssh-keyscan, the scan of Connect's options", path }`, `path` found on the leg's own `PATH` as the runner finds
it: the first executable `ssh-keyscan` in the order of `PATH`; no launch from the row file). D5: the record reads every `tool.json` at any
depth and makes each an executable with its real path, its SHA-256, and its version: the version of the Debian package that holds the file
(`dpkg -S <real path>`, then `dpkg-query -W -f '${Version}' <package>`, both bounded; G11), with `versionSource: "dpkg"`, or `null` with
the reason. R8: `every tool that a leg named is in the record, with its path, SHA-256 and version`.

## 2. `scripts/lib/refusedRecord.cjs` (new, pure)

`'use strict'`, `node:path` only, reads nothing when loaded. Exports:

| Export | Behaviour |
|---|---|
| `M4_LEGS`, `M9_LEGS` | the two tables of §1.2, frozen: `{ name, row, case, road, state, credential, k1 }` |
| `UNUSABLE_TEXT`, `UNSAFE_HOST` | `'not a host key'`, `'not a host'` |
| `expectedMessage(product, spec, name)` | `{ prefix, text }`: the prefix of the road (§1.1); A of `product.unusablePinSentence(name, auth)` with `auth` `'askpass'` for a password and `'key'` otherwise; for (d) the opening of B (`product.pinWriteFailedSentence(name, new Error(MARK))` up to `MARK`) and the code `EACCES` |
| `messageMatches(text, expected)` | A: `text === prefix + text`; B: `text` starts with `prefix + opening` and holds `EACCES` |
| `refusedChecks(counts, spec, timing)` | the judge of R.1 to R.5: a list of `{ name, ok, detail }` from the counts of S4.§1.6, the leg's state, and `{ questionEnd, sentenceAt }`; a value that could not be read is `null` and fails its check, never `0` |

## 3. `scripts/itestRowRefused.cjs` (new)

Header: the refused leg of M4 (b)-(d) and M9, on the rig of E3.S4; what makes each case (§1.1); that no product code is changed. Imports
the rig (`scripts/itestRowRig.cjs`) and the lib only. Exports `refusedLeg(ctx, spec)` (§1.3, §1.4), `driveRefused(roads, road)` (the click,
bounded), `foldersWriteRefused(dir)` (the write probe of R4.d0: `{ refused, code }`), `liveness(ctx, leg, k1)` (§1.3, 7), `keyText(pubFile)`
(`<algorithm> <base64>` of a `.pub` file), `toolOnPath(env, name)` (§1.8). Each function under 50 lines.

## 4. `scripts/itestRowM4.cjs` and `scripts/itestRowM9.cjs` (new)

`rowM4(check, top)` calls `runLeg(check, top, 'M4', name)` for each leg of `M4_LEGS`, in the table's order; `legs` maps each name to
`refusedLeg` with its spec, and the three (a) legs to `absentLeg` (§1.5). `rowM9(check, top)` the same for `M9_LEGS`; `legs` maps the eight
road legs to `refusedLeg`, and `m9-key-repair` and `m9-password-connect` to §1.6. Neither file starts a counterpart, a world or a process
itself (S4.RR6).

## 5. Dependencies on the E3.S4 rig (and what E3.S5 adds itself)

| # | What E3.S5 needs | Given by the E3.S4 spec? | What E3.S5 does |
|---|---|---|---|
| D1 | The observer of `./sshExecRunner` (S4.§1.7) answers EVERY export of the real module, with `runSshExec` observed (`{ ...real, runSshExec }`), so that `hostKeyTrust`'s `runBounded` in the same graph is the real one (G12, G13) | not said | If the built rig answers only `runSshExec`, E3.S5 makes the observer spread the real module: one line of `itestRowRig.cjs`, in c1, named in its body. RF8 holds it. R9.r1 fails the leg if the scan answers nothing |
| D2 | M1's drive and M1's checks, callable on a world, a counterpart and a stand-in that a row gives: `driveFive(ctx, leg, roads, { answer })` (the clicks of S4.§6 in order, bounded; the outcomes) and `m1Runs(ctx, { leg, roads, k1, standIn, label })` (the drive and M1.1-M1.19) | no: S4.§6 exports `rowM1` and `legs` | E3.S5 extracts both from `itestRowM1.cjs`; M1's own leg calls `m1Runs` after it opens its world. No check of M1 changes, no check is added; the proving run shows the same `ok` names for the `m1` leg as before the extraction |
| D3 | The world: `World.replaceHost(host)` (a NEW snapshot with that `host`, as `replaceHostKey` does); `World.said[i].at` (`performance.now()` when the entry was pushed); `World.shares` (`{ at, saidBefore }` per call of the host's `agentServer.share`); `World.connectOptions()` and `World.updates`, with the host's `storage.updateDetailsFields(accountId, nodeId, updated)` replacing the snapshot by a new object | no (S4.§4.4 gives `said` and `replaceHostKey`) | E3.S5 adds them to `personRoadsWorld.ts`. `connectOptions` takes `../connectionOptions` from the require cache right after `loadWithVscode` (G12: the same graph, the same stand-in and mocks) and calls `connectionOptions(ROW.accountId, <current snapshot>, storage, storageDir, undefined)`. No existing suite changes |
| D4 | A bounded click of a road from a row file (`finishes` around the world's `click`), and `installStandIn`, `listingOf`, `tmpNames` from the rig | M1 uses them (S4.§6); the route a row file takes is the rig's | E3.S5 takes them the way M1 takes them |
| D5 | The record of identities names `ssh-keyscan` (§1.8) | no (G15) | E3.S5 widens `itestIdentities.cjs`: `tool.json` at any depth, R8 |
| D6 | `ctx.product` holds `personPin.js` (A, B), `hostKeyPin.js` (`hostKeyFingerprint`, `formatHostKey`) and `materializedKeys.js` (`materializedKeysDir`) | yes (S4.§3: `productOf` gains `personPin.js`; F3) | — |

If the built rig differs from its spec in a part that this table relies on, the coder STOPS and tells the lead (no silent change of the rig).

## 6. Changes to existing files

### 6.1 `src/test/personRoadsWorld.ts` (D3)

- `World.replaceHost(host: string): void` — docblock: why (M4 (c) warm: a host that cannot form a line, in the window that the warming call
  used). Same shape as `replaceHostKey`; the old snapshot is not changed.
- `World.said` entries gain `at: number`. The type grows; no reader changes.
- `World.shares: { at: number; saidBefore: number }[]`: the host's `agentServer.share` pushes one before it answers its token, as today.
- `World.updates: Record<string, unknown>[]` and `storage.updateDetailsFields(_accountId, _nodeId, updated)`: pushes `updated`, and the
  storage answers `{ ...updated }` from the next read on.
- `World.connectOptions(): Promise<unknown>`: as D3. Docblock: Connect's repair of M9; it never connects.

### 6.2 `scripts/itestRowM1.cjs` (D2), `scripts/itestIdentities.cjs` (D5), `scripts/itestPinnedRoads.cjs`

As the table of D2 and D5. `pinnedLegs`: `rowM4(check, top)` and `rowM9(check, top)` after `rowM6`, before `recordIdentities`.
`itestIdentities.cjs`: `toolsOf(dir)` (the walk; `tool.json` parsed), the executables of the record gain one entry per tool, and check R8.

## 7. The test: `src/test/itestRowsRefused.test.ts` (RED first)

Loads `scripts/lib/refusedRecord.cjs` with `createRequire` at run time (as S4.§8), so it compiles before the lib exists; world parts through
a cast, so it compiles before D3. The product's functions are imported from `../personPin` and `../hostKeyPin`.

| # | Asserts |
|---|---|
| RF1 | `M4_LEGS` has exactly the 15 names of §1.2: (a) three, cold; each of (b), (c), (d) once per road and state; `M9_LEGS` the 10 names; every name unique; every spec names a credential the rig knows (`stored`, `named`, `password`) |
| RF2 | `refusedChecks`: cold, one `-V` start that ended before the sentence, 0 connection starts, 0 attempts → all `ok`; each of these turns its check red: two `-V` starts cold; one `-V` start warm; a connection start on any road; a start of the check road; one authentication attempt; one `Connection from`; a question that ended AFTER the sentence; a `null` time |
| RF3 | `expectedMessage` and `messageMatches` with the product's functions: install and bridge prefixes; A's key form for `stored` and `named`, the password form for `password`, word for word; B: a text `Cannot reach "box": Could not write the saved host key of "box" to disk: EACCES: permission denied, open '/o/x'` matches, the same with `ENOSPC` does not, and A's text does not match B |
| RF4 | D3 `replaceHost` (in process: the world's stand-in runner and client `KNOWS`, `realForget`, an owned storage folder, the entry pinned with a test key): after `replaceHost('not a host')` one install click shows exactly `Cannot reach "box": ` + A (key form), the stand-in runner saw 0 runs; the snapshot object read before the replace still has its old host |
| RF5 | D3 `said[].at` and `shares`: an *Open Remote Bridge…* click on a pin that does not parse pushes one `shares` entry whose `saidBefore` is less than the index of the refusal in `said`; every `at` is a number and they do not go back |
| RF6 | D3 `connectOptions` (in process, hermetic: `mocks: { './sshExecRunner': { runBounded: <an outcome whose stdout is the keyscan line of a test key for [127.0.0.1]:2222>, runSshExec: <the world's stand-in> } }`, the entry's `hostKey` `not a host key`, `answer` = `Trust and connect` only for the test key's fingerprint): one question with that fingerprint; `World.updates` has one entry whose `hostKey` is the test key's text; the next install click is pinned (its argv names a `known_hosts-e1-<uuid>` holding that line) |
| RF7 | `toolOnPath` finds the first executable of a name on a `PATH` of two owned folders (the second's when the first has none; none when neither has one, and a file without the execute bit is passed over) |
| RF8 | the observer (D1): the module that the rig hands the world for `./sshExecRunner` has every function export of the compiled `out/sshExecRunner.js` (`runSshExec`, `runBounded`, …), by name. Alive: the list of the real module's functions is not empty |

**RED.** Before the lib, D1 and D3: compile (exit 0), run the file: RF1-RF3 and RF7 fail on `…/scripts/lib/refusedRecord.cjs does not exist`
(RF7 on `…/itestRowRefused.cjs`); RF4 on `replaceHost is not a function`; RF5 on `shares` being `undefined`; RF6 on `connectOptions is not
a function`; RF8 on its first missing export, or GREEN when the built rig already spreads the real module (then the body of c1 says so and
MV9 shows that RF8 can fail). Save the output; any other text is a stop.

## 8. The proving runs

The stories document: a proving run passes no row and goes into §10 never; its numbers are "seen when it was built".

1. **Local, three times in a row,** on the last code commit, from that tree (`git status --porcelain --untracked-files=no` empty), with the
   proving command, each output saved outside the tree. Read in each: exit 0, no `FAIL`; every leg of §1.2 ended with 0; per leg its
   `evidence` line; the C9 and C14 records; the C1 record; R9.r1-r4; the `m9-key-repair: M1` checks; R8 with `ssh-keyscan`'s path, SHA-256
   and version; the time of the script (projected: about three to four minutes more than E3.S4's run; not measured).
2. **After each run:** the after-run checks of S4.§9 (no `/tmp` name of the run, no process of the run). In addition: no folder under the
   run's owned folder is left at mode `0500` (the folder goes with the section).
3. **CI** (the lead's): `itest:ssh-agent` green on the head sha, on the runner's `/usr/sbin/sshd`. There R4.d0 shows for the first time that
   the runner's user cannot write a `0500` folder. A failure is read by the stories document's *What a proving run that fails asks for*.

## 9. Mutations and hand checks

**Mutations** (each restored, its output saved; MV8 and MV9 as noted):

| # | Mutation | Red | Needs an `sshd` |
|---|---|---|---|
| MV1 | `refusedChecks` allows two `-V` starts cold | RF2 | no |
| MV2 | `refusedChecks` does not compare the question's end with the sentence | RF2 | no |
| MV3 | `expectedMessage` gives the key form to a password | RF3 | no |
| MV4 | `messageMatches` takes B without `EACCES` | RF3 | no |
| MV5 | `replaceHost` changes the snapshot in place | RF4 | no |
| MV6 | `updateDetailsFields` records the update and keeps the old snapshot | RF6 (the next click is refused with A) | no |
| MV7 | `M4_LEGS` without `m4-d-bridge-warm` | RF1 | no |
| MV8 | `itestIdentities.cjs` reads no `tool.json` | R8 in a proving run | yes (scratch worktree) |
| MV9 | the observer answers `{ runSshExec }` alone | RF8; R9.r1 on the real `sshd` | RF8 no; R9.r1 yes (scratch worktree) |

**Hand checks** (the product made to do the wrong thing that a leg is about), each in a scratch worktree OUTSIDE the story's tree, as S4.§12
says (R1 fails there, as it must; recorded as hand checks in c2, never as results):

| # | The product made to | Expected red |
|---|---|---|
| HC1 | `pinAbsent` answers true only for `undefined` (`pinOfCall.ts:43-45`) | `m4-a-empty`, `m4-a-space`: A.2, A.3, A.5 (the entry is refused with A) |
| HC2 | `writePersonPin` answers `{ ok: true }` for `unusable` (`personPin.ts:65-71`) | (b) and the `m9-key-*` legs: R.1, R.3 (an unpinned connection, K1 logs it); `m9-password-*`: R.8 (`Failed password`); (c): R.6 (the argv's refusal of the host, not A) |
| HC3 | `written` answers `{ kind: 'none' }` for a throw (`pinOfCall.ts:69-70`) | (d): R.1, R.3, R.6 |
| HC4 | `decidePinOfCall` writes BEFORE it asks (`:60` after `:65-72`) | every cold refused leg: R.5 (0 starts, not one) |
| HC5 | `pinClientAsker` keeps no answer (`pinClient.ts:93` left out) | every warm refused leg: R.5 (one start, not 0) |
| HC6 | `unusablePinSentence` gives a password entry the key form (`personPin.ts:34-39`) | the `m9-password-*` legs: R.6 |
| HC7 | `persistPin` writes nothing (`connectionOptions.ts:96` left out) | `m9-key-repair`: R9.r2, then M1.3 (the install refused with A) |
| HC8 | `confirmHostKey` answers `{ proceed: true }` with no `pin` for a first contact (`hostKeyTrust.ts:135`) | `m9-key-repair`: R9.r1 (no question), R9.r2 |

HC1-HC8 need a run each (about seven minutes each, projected). Two hand checks may share one run only when their expected reds are in legs
that the other does not touch (for example HC5 with HC7); the record says which shared.

## 10. The repair of sentence A: what it is, and why it is no product change

**What it is.** The stories document's line for E3.S5 says "the repair of sentence A". The parent's M9 names it: "The advice of sentence A
repairs the pin (the key form), and no password entry is given it (P2)". Sentence A's key form says: get the fingerprint from the person who
runs the server, "Then use Connect SSH on this entry, and go on only if it shows that fingerprint: Trust and connect saves the key"
(`personPin.ts:38`; §3.5). The repair is that path, taken by the person: Connect's options, the first-contact question, *Trust and connect*,
the pin written over the stored text. The password form names no repair and says so (§3.5; C1).

**Why it is no product change.** The code that the advice sends the person to exists and is not changed by this plan (§3.5, *Why two
forms*; §7, *Out of scope*: "Connect's own road"): a stored text that does not parse with a scanned key is a first contact
(`hostKeyPin.ts:463`); the question shows the fingerprint with *Trust and connect* (`hostKeyTrust.ts:139-148`); the answer is written over
the stored text (`connectionOptions.ts:87-99`). Measured on `152696ae` (G9): Connect's options did exactly that for a key entry, and the
stored text was K1's line. Nothing in the parent asks the product to change here: M9 MEASURES the advice on the real counterpart, and M1's
runs then show that the three roads accept the repaired pin.

**If a proving run shows that the advice does not repair** (for example R9.r2 or M1 red with the product unchanged), that is the stories
document's *What a proving run that fails asks for*: a repair inside E3 only when it makes the code do what §3.5 already says, with its own
spec by Opus and a test watched RED first; the lead decides. This spec builds no such repair.

## 11. The documents

`research/module_tests.md`, the G1 section (after E3.S4's paragraphs):

1. **The table:** a row for `itestRowsRefused.test.ts` (RF1 to RF8, one sentence each); the row of `scripts/itestPinnedRoads.cjs`: its count
   of `ok` lines from the proving run and that section 10 runs M4 and M9 after M6; the row of `personRoadsWorld.ts`: `replaceHost`,
   `said[].at`, `shares`, `updates`, `connectOptions`.
2. **A paragraph `**M4 and M9 on the rig (E3.S5).**`**: what makes each case (§1.1) and why (d) is the folder's mode (with its limit as
   root); one road per refused leg and one leg per state (§1.2); the liveness control; Connect's repair and M1 on its entry (§1.6); C1, C9
   and C14 as records; `tool.json` and `ssh-keyscan`'s identity (§1.8); what it does not prove (§14).
3. **`**M4 and M9, seen when they were built (<date>, commit <sha>).**`** NOT §10 of the plan; it passes no row. Per leg: the four counts
   (from the evidence lines), the `-V` time and its end against the sentence's time, the records C1, C9, C14, the three runs' times, the
   hand checks as hand checks, the `identities` line's new tool entry (home folder as `~`, user as `<user>`), and the CI run (the lead's).
4. **The table of *Test leftovers*** (the row of `ssh-agent-itest.cjs`): the `pin` folder also holds one folder per leg of M4 and M9; a
   `keys/<pid>/` set to `0500` for a while in the (d) legs, put back by the leg's `finally`.

## 12. Order of work, and the commits

1. `git status --short`. **The test** (§7) alone. Compile: exit 0. Run it: the REDs of §7. Save the output.
2. **The world** (§6.1, D3). RF4-RF6 green; MV5, MV6.
3. **The lib** (§2). RF1-RF3 green; MV1-MV4, MV7.
4. **D1** if needed, RF8 green (MV9's unit half). **D2** (the extraction in `itestRowM1.cjs`). **The refused leg** (§3), RF7 green.
5. **M4 and M9** (§4), `pinnedLegs`, **D5**. `node --check` of every script; typecheck, lint, ratchet, `npm test`; `itestCallers`,
   `harnessSites`, `itestInstrument`, `itestRowRig` (S4.RR6 and S4.RR7 now read the three new row files); the leftovers guard. `wc -l` of
   every new and changed script. Commit **c1** (one commit: no commit holds a red test):
   `test(ssh): G1 E3.S5 — M4 and M9 on the rig: a saved key that cannot be used and a pin write that fails, cold and warm; Connect's repair (RF1-RF8)`.
   Files: `scripts/lib/refusedRecord.cjs`, `scripts/itestRowRefused.cjs`, `scripts/itestRowM4.cjs`, `scripts/itestRowM9.cjs`,
   `scripts/itestRowM1.cjs`, `scripts/itestIdentities.cjs`, `scripts/itestPinnedRoads.cjs`, `src/test/personRoadsWorld.ts`,
   `src/test/itestRowsRefused.test.ts` (and `scripts/itestRowRig.cjs` only for D1). Body: the RED texts, MV1-MV7 and MV9's unit half, the
   line counts, and that no product file, no workflow and no `package.json` changed.
6. **The proving runs** (§8, 1 and 2) on c1. **The hand checks** (§9) and MV8, MV9's `sshd` half in a scratch worktree. A harness fault that a
   proving run shows is repaired in a new commit (c1b, …), and the three runs are made again on the last one.
7. **The documents** (§11). `plan-lifecycle.mjs` and `public-hygiene.mjs` from the root: clean. Commit **c2**:
   `docs(tests): G1 E3.S5 — M4 and M9 as seen when they were built`. Body: what was OBSERVED in the three runs, the records, the hand checks
   as hand checks, the after-run checks.

Stage by path; read `git diff --staged --stat` before each commit; do not push (the lead pushes).

## 13. Break it — ways to pass while the defect stays, and what stops each

| # | The way | What stops it |
|---|---|---|
| BR1 | 0 connections because K1 was down or at another port | R.9: the control client logs in to the same K1 after the counts |
| BR2 | a cold leg is warm by accident | each leg its own process and world (S4.RR6); R.0; `state` in the evidence; R.5 asks exactly one start |
| BR3 | a warm leg is cold because `warm` did not keep the answer | `warm`'s own check (ONE question and the probe); R.5 asks exactly 0 |
| BR4 | (d) passes because the call was refused for another reason (the credential, the path rule) | the named key writes nothing (G6); R.6 asks B with `EACCES`; R4.d0 |
| BR5 | (d) passes on a root runner where nothing failed | R4.d0: the write probe must throw `EACCES`, or the leg fails |
| BR6 | the message check matches a substring of another message | R.6: exactly ONE error message, equal to prefix + text (A), or prefix + opening + `EACCES` (B); no other sentence of §3.5 |
| BR7 | the `-V` is counted from the observer, which a kept answer could fool | R.5 counts the shim's records; the observer gives the end time only |
| BR8 | "ended before the sentence" read from two clocks | both times are `performance.now()` of the one leg process (the observer and `said[].at`) |
| BR9 | the socket check's 0 comes from a shim that recorded nothing | the leg process checks its `PATH` (S4.§1.2); warm legs show the shim recording the warming call; A.3 records 5 starts |
| BR10 | Connect's scan answers nothing (G13) and the repair leg passes on no question | R9.r1 asks the question with K1's fingerprint; RF8 |
| BR11 | M1 passes on a pin that Connect did not write (the world opened with K1's pin) | the leg replaces the pin by the text that does not parse first; R9.r2 reads `World.updates` and the snapshot; M1 runs in the SAME world |
| BR12 | the password legs pass because K1 does not offer passwords | `passwords: true`; the warm password legs show, before their mark, K1's `Failed password` of the warming call |
| BR13 | the C1 leg connects with the password | the leg starts nothing after the options; its shim records 0 starts (checked) |
| BR14 | the (c) legs pass on the host of the argv's refusal and not on A | R.6 asks sentence A word for word; HC2 shows the other message |

## 14. What is NOT measured by E3.S5

- **No row passes.** These are proving runs; §10 is E3.S10's, on the final tree.
- **The socket check's own refusal on an unusable pin or a failed write.** It is never reached in these legs (§3.3); its unit tests hold it
  (M4's own words).
- **A partly written pin file (C14).** `EACCES` at the `open` writes nothing (G4); no instrument here makes a write that begins and then
  fails. The record names such a file only if one is found.
- **Whether a minted token can be used after the refusal (C9).** Only that it was minted, and when.
- **Connect's session after its options.** No leg connects through Connect; the password entry's Connect would send the password (C1, §3.5).
- **A key file that lives a few milliseconds.** Whether a sample of `keys/<pid>/` caught the stored key's call file during a refused call is
  not judged; that it is gone after is (R.7).
- **A root runner, another operating system, Windows.**
- **ssh-keyscan's version by its own answer.** It has none (G11); the record names the package's version.

## 15. Done when (each item can be counted)

- [ ] RF1 to RF8 were watched red with the texts of §7 and pass; MV1 to MV9 turned red what §9 names.
- [ ] Every leg of §1.2 is built, runs in its own leg process with the real resolve, through the committed instrument, and ran from a tree
      with no modified tracked file.
- [ ] Three local proving runs on c1 (or its last repair): exit 0, no `FAIL`, every check of §1.4-§1.6 `ok`, every leg process ended with 0,
      R1 to R8 `ok`; the after-run checks print nothing. The CI proving run on a head sha is green (the lead's box).
- [ ] HC1 to HC8 each turned red what §9 names (hand checks, in c2's body).
- [ ] typecheck, lint, ratchet, `npm test`, `itestCallers`, `harnessSites`, `itestInstrument`, `itestRowRig` and the leftovers guard green;
      every script at most 800 lines (`wc -l`).
- [ ] `research/module_tests.md` holds §11's items; no home path and no user name in a committed text.

## 16. Opus review checklist

1. Is each case made by the product's data or by the storage folder, never by a stand-in or a patch? Does (d) use a key named by its path, and
   is R4.d0 there and before the click? Is the mode put back in a `finally`?
2. One road per refused leg and one leg per state: are there 12 refused legs in M4 and 8 in M9, each its own process and world?
3. Are the four counts apart (S4.§1.6)? Does R.5 count the shim and take the observer's time only? Is "warm, exactly 0" any kind of start?
4. Does each check hold its row's words (§1.4-§1.6)? Is the message compared with the product's function, word for word for A?
5. The liveness control: after the counts, the real client by its path, one more accepted login in K1's log?
6. Connect: is the answer given only for K1's fingerprint? Is the persisted text compared with K1's `.pub`? Is Connect's `known_hosts-e1`
   removed by its exact path? Did M1's 19 checks run in the same world, with their own words? Does no leg go past Connect's options?
7. D1: does the observer answer `runBounded` (RF8)? D2: is M1's own leg unchanged in its checks?
8. The world: `replaceHost`, `said[].at`, `shares`, `updates`, `connectOptions`; no existing suite changed; snapshots replaced, never changed
   in place.
9. The identities: is `ssh-keyscan` in the record with path, SHA-256 and the package's version (R8)?
10. The guards: S4.RR6 and S4.RR7 read the three new row files and pass; no `sshExecAuth` or `pinClient'` text in them; every script ≤ 800.
11. The documents: "seen when it was built", not §10; C1, C9 and C14 as records; hand checks as hand checks; `~` and `<user>`.

## What grows

| What | How much (projected) | Who retires it | When it is interrupted |
|---|---|---|---|
| one folder per leg of M4 and M9 (25): as the E3.S4 spec's leg folder, plus `tool.json` in two | about 50 kB per leg, about 1.3 MB per run | the section's scope removes the `pin` folder, pass or fail | the janitor (token `creds`); a `0500` `keys/<pid>/` holds no file (R4.d0 removes its probe), so the removal of its parent works |
| one leg process per leg, one at a time | for the seconds of a leg | `runLeg`'s limit and the leg's scope | as the E3.S4 spec says |
| one counterpart per leg, the liveness control's login | for the seconds of a leg | `endCounterpart` | as the E3.S4 spec says |

Nothing grows in the product.

## Notes for the lead

- **Links and rows.** The stories document (its status line and `## E3.S5`), the parent's `## Epics`, E3, and `todo/README.md` do not name
  this file. They are the lead's, in the commit that adds this spec.
- **E3.S4's build and this spec.** D1 and D2 are about files that E3.S4 builds now. If the E3.S4 coder can build D1 (the observer spreads the
  real module) and export M1's drive and checks (D2) at no cost, E3.S5 then only uses them.
- **Time.** 25 legs, about three to four minutes more per run (projected, not measured), in CI too.
- **CI** is dispatched by the lead (§8, 3).

## Questions for the lead

**The lead's answers (2026-11-24):** Q1, the reading of §1.6 stands, not a plan change (consult 9d5c1fe5): the parent's setup says of the asker's state "A leg whose numbers depend on the state names it and makes it itself. No leg takes it over from the leg before" (`PLAN_person_roads_pin_host_key.md:1721-1723`); M9 needs the continuity of the ENTRY that Connect repaired through M1's runs, in the repair leg's own world, not of the asker. Q2, settled: the CI runner is not root (its owned folders are `testsToDelete-u1001-…`, CI run 45362452230), so the `0500` folder of M4 (d) fails a write there as here.

**Q1 · In M9, does "then Connect's options … then the runs of M1" allow the repair to start from the same state in a new world, or must it
follow the refused roads in their world?** (Not a plan change in my reading; confirm.)
- The parent, M9: "a key entry with a pin that does not parse: the roads, once *cold* and once *warm*, each in a world of its own; then
  Connect's options (`connectionOptions`) with the real scan of the counterpart (K1) and *Trust and connect* answered; then the runs of M1",
  and in the last column "M1 passes on that entry". M1's last column: "Since epoch 3: the run is cold, and beside the 5 connection starts the
  record holds exactly ONE question `ssh -V`".
- What is so (G8): a world whose roads have refused a pinned call has asked the client and keeps the answer. M1's runs in that world would
  start 0 questions, and M1's "exactly ONE question" would fail for a reason that is not about the repair.
- My reading (§1.6): the refused roads are the four key legs, each in a world of its own, as the row says; `m9-key-repair` starts from the
  SAME state (the same entry, the same text that does not parse) in a new world, runs Connect's options there (which ask the client nothing:
  R9.r4), and then M1's runs in that same world, cold, on the pin that Connect wrote. The order of the row is kept across its legs; no
  number of M1 or M9 changes. If the lead reads the row as one world for all three steps, M1's count of questions cannot hold there, and that
  would be a question of the row, not of this spec.

**Q2 · M4 (d) on a runner where the user is root.** (Not a plan change now; a risk.)
- What is so: (d) is made by a `0500` folder (§1.1); root writes into it. R4.d0 then fails the leg ("could not fail"), it does not pass it.
- Read for this spec: nothing; the CI runner's user is not checked here. The other faults that work as root (a file in place of
  `keys/<pid>`, a long entry id: G4) cannot be made after a warming call with the parts of the E3.S4 spec (§1.1).
- If the CI proving run shows root, M4 (d) cannot run there as built: a row that cannot run as written is a plan change (the stories
  document), and the lead decides. I propose no change now.
