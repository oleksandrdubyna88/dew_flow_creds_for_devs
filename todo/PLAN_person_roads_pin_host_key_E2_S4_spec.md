# PLAN — E2.S4 spec: the CHANGELOG entry claims only what holds, and E1's smoke runs on the changed words (R5, test 27)

> Status: **spec, 2026-11-18, by Opus; built (805aed3b, d0ae4b3c), unmerged; section 10 shows 48 ok locally on OpenSSH 10.2p1, and CI is the second run.** Story E2.S4 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (repair R5 of its `## Epics`, E2; its §6, decision 11, and
> test 27 of its §5) and of its stories document [PLAN_person_roads_pin_host_key_E2.md](PLAN_person_roads_pin_host_key_E2.md)
> (`## E2.S4`). A test harness and a reading of the entry against the tests, not a security judgement: Opus writes this spec, a
> Sonnet coder builds it, Opus reviews it. It is built LAST on E2's branch `fix/g1-e2-measurements`, after E2.S1, E2.S2 and E2.S3
> are committed ([E2.S1](PLAN_person_roads_pin_host_key_E2_S1_spec.md), [E2.S2](PLAN_person_roads_pin_host_key_E2_S2_spec.md),
> [E2.S3](PLAN_person_roads_pin_host_key_E2_S3_spec.md)). The parent and the stories document do not link to this file yet: the
> lead adds those links and the `todo/README.md` row. This file is promoted together with the parent.
>
> Scope: `src_vs_code/CHANGELOG.md` (the `[Unreleased]` entry, whole); `src_vs_code/scripts/itestPinnedRoads.cjs` (section 10 of
> `ssh-agent-itest.cjs`: assertions and the world's `realClient`, no new product behaviour); two words of the header comment of
> `src_vs_code/scripts/ssh-agent-itest.cjs`; `research/module_tests.md` (the smoke's row and one dated paragraph). No file of
> `src_vs_code/src` changes. `scripts/itestSshd.cjs` is not edited (PR #380 edits it). Each `file:line` below was read on
> `fix/g1-e2-measurements` at `70676a95` (E2.S1 and E2.S2 committed), with E2.S3 being built in the same worktree, uncommitted:
> where this spec names a function of E2.S3 (`hostKeyTold`, `unnamedHostKeySentence`), it names it from E2.S3's spec and from the
> working file as it stood on 2026-11-18, late evening.

Paths are relative to `src_vs_code/` unless they start with another folder. "The parent" is the plan linked above; a section named
§3.12 and so on is the parent's; "§2 of this spec" is this document's. "The smoke" is section 10 of `scripts/ssh-agent-itest.cjs`,
the file `scripts/itestPinnedRoads.cjs`. "The question" is the `ssh -V` that a pinned call asks before it starts (E2.S1, `pinClient.ts`).
"A connection" is every other start of the client. This document's own names: the claims CL1 to CL32, the facts F1 to F12, the
checks N1 to N8 (new or changed in the smoke), the mutations MA to MD and the control MC1, the review items R1 to R16. This document
keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`), and the parent's epoch 2 has one entry
(2.1), so a second one stops the whole plan.

## What E2.S4 builds, in one paragraph

E2.S2 and E2.S3 each replaced the sentences of the CHANGELOG entry that their own code made untrue. The entry as a whole still
claims more than `main` will hold: its heading says that a saved host key is the only key a call without a terminal accepts, and
its third paragraph says that two of those calls read a saved key that cannot be used as no key at all (C3). This story writes the
final entry (§1): its heading and its opening carry that limit, every other limit is said in one place, and every sentence that
claims a behaviour is listed with the test, the smoke check or the measurement by hand that holds it (§2, the claim table, which also
goes into the commit body for E3's §10). And it runs E1's smoke again on the changed words (§3): the smoke now lets the real product
ask the real client for its version, records that question as a start of its own kind, asserts E2's three new pairs on every
connection, and in leg 2 asks for the real client's evidence (`Offending … key in <the pin file of this call>`) behind sentence C. No
behaviour of the product changes. If leg 2 shows `could not be checked`, that is a finding against E2.S3, not a repair of the script.

| File | Change | Where |
|---|---|---|
| `CHANGELOG.md` | the `### Changed — security: …` block under `## [Unreleased]`, from its heading to "An entry with no saved host key connects as before.", replaced whole by §1 | §1 |
| `scripts/itestPinnedRoads.cjs` | `productOf` loads `pinClient.js`; one constant, three helpers; `openLeg` passes `realClient: true`; one precondition check; `kindOf` knows the question; `startsHoldThePin` counts questions and connections apart and checks the three new pairs; the login count reads connections; leg 2 asks for the `Offending` line and for no sentence D; the header comment. 40 checks become 48. About 629 → 680 lines | §3 |
| `scripts/ssh-agent-itest.cjs` | the section-10 paragraph of the header comment (`:42-45`): "every start" becomes "every connection", twice. 772 lines before and after | §3.10 |
| `research/module_tests.md` | the row of `scripts/itestPinnedRoads.cjs` (`:2568`) and one new dated paragraph after "The smoke, seen when it was built" (`:2570`), which stays | §6 |

## Binding constraints

- **No plan change, and no change of the product.** Build what the parent, the stories document and this document say. No file of
  `src_vs_code/src` is edited by this story (the test world `test/personRoadsWorld.ts` already has `realClient`: F3). If a step cannot
  be done as written, a check is not RED or GREEN as §4 says, or leg 2 shows sentence D: stop and tell the lead, with the output. Do not
  repair the parent, the stories document, another spec or this document, and do not loosen a check to make it pass.
- **Leg 2 is the first real proof of E2.S3's rule of evidence.** If it shows `The bridge to "box" could not be checked: ` or sentence D
  where §3 expects sentence C, record the probe's and the mode check's stderr as printed (N6, N7 print them) and stop: it is a finding
  against E2.S3 for the lead, not a fault of the smoke.
- **A RED proof is a failed check, never a crash or a compile error.** Read the exit of `tsc` before the smoke's result; a section that
  throws is not RED.
- **Nothing local is committed.** The unpacked `sshd`, the wrapper, the scratch copy and its edits (§5) stay in the scratchpad; no
  scratch path enters a committed file.
- **No Python.** Never bare `git stash`. Stage by path, and by hunk in a file another session also edits (`CHANGELOG.md`,
  `research/module_tests.md`: `git-workflow.md`, rule 4). Never commit `.claude/settings.json`.
- **Both scripts stay at most 800 lines**, and lint stays clean (`npm run lint` lints `scripts` too).

## Facts read for this spec

| # | Fact | Where |
|---|---|---|
| F1 | The smoke drives the world with the real runner and spawner, and leaves `./pinClient` as the world's stand-in, which answers `KNOWS` and starts no `ssh -V`: `openLeg` passes no `realClient` (`scripts/itestPinnedRoads.cjs:316-333`). So on E2.S2's product the smoke passes as it is, and sees neither the question nor the three new pairs: it proves nothing about E2's words | read |
| F2 | The world's loader keys its stand-ins by the request string a module writes (`test/vscodeStub.ts:20-25`, `:60`). The smoke's `'../sshExecRunner'` (the recording runner) is the string of `commands/agentCommands.ts`; `pinClient.ts` writes `'./sshExecRunner'`, so with `realClient` the question goes through the REAL `runSshExec`, unrecorded by `recordingRunner`, and through the shim, which records it | read |
| F3 | `realClient: true` leaves out the world's `'./pinClient'` stand-in (`test/personRoadsWorld.ts:109-110`, `:256`); `clientAsks` then stays empty | read |
| F4 | The pin writer of the three roads asks with the program `ssh`, no folder, and the credential's environment (`personPin.ts:66`, `PERSON_SSH_PROGRAM` `:28`); the guards hand it `credential.env` (`writtenKey.ts:80`). The smoke's credential carries `rig.env`, whose `PATH` starts with the shim's folder (`itestPinnedRoads.cjs:296`, `:579-581`). `pinClientAsker` hands the child the lookup names of that environment (`bridgedSshEnv`: `PATH`, `HOME`), so the bare word finds the shim | read |
| F5 | The asker keeps a `knows` answer per program, folder and `PATH` for its life, and never an `older` or `unreadable` one (`pinClient.ts:84-100`). `windowPinClient` is one per loaded module (`:115`), and `world()` evicts every module of `out/` (`itestPinnedRoads.cjs:39`): one asker per leg. The three roads ask with one key (F4). So per leg, with a client of 8.5 or newer, exactly ONE question starts (the install's, the first pinned call of the leg), and the bridge and the socket check take the kept answer | read; held by `pinClient.test.ts` A3, A5 and `personRoadsPinRefusals.test.ts` A2 |
| F6 | The shim records `"$@"`, the product's argv, and execs the real client with `-F <client config>` before it (`itestPinnedRoads.cjs:261-276`). The question's record is the one word `-V`. `ssh -F <file> -V` prints the version on stderr and exits 0 | measured 2026-11-18, OpenSSH 10.2p1: `ssh -F /dev/null -V` → `OpenSSH_10.2p1 Ubuntu-2ubuntu3.8, OpenSSL 3.5.5 27 Jan 2026`, exit 0 |
| F7 | `kindOf` reads a start as `bridge` (`-N`), as one of three commands by its last word, or as `other` (`:371-376`); `startsHoldThePin` requires exactly the four kinds `bridge,mode,probe,sweep` (`:393`) and four pins (`:395`), and leg 1 requires 4 accepted logins for 4 starts (`:480`). A question would be `other`, and all three checks would fail for the wrong reason | read |
| F8 | `pinOf` takes the pin file from `UserKnownHostsFile` and `GlobalKnownHostsFile` and strips one pair of double quotes (`:379-385`); `valuesOf` of `test/pinnedArgv.ts` answers the raw value, quotes kept. So a quoted path, as E2.S2 writes it, is read; `pinnedArgv.ts` needs no change. The rig's storage folder holds no space or apostrophe (`ownedDir` under `shortSocketRoot()`), so the smoke writes the bare word: a quoted path through the roads is E3's M7 | read |
| F9 | `test/pinnedArgv.ts` exports `PIN_SOURCE_OPTIONS` (`VerifyHostKeyDNS`, `KnownHostsCommand`, `LogLevel`) and `sourceWordsOf`; `pinClient.ts` exports `pinClientOf(exitCode, stderr)`. Both exist at `c20be822` too | read at `70676a95` and at `c20be822` (`git show`) |
| F10 | `hostKeyWords` writes, for a pin file, `StrictHostKeyChecking=yes`, the file as both lists, `VerifyHostKeyDNS=no`, `KnownHostsCommand=none` only for `knows`, `LogLevel=ERROR` (`hostKeyPin.ts:257-266`). E2.S3 (being built): `hostKeyTold`, `refusedHostKeySentence` keeps its words (`hostKeyPin.ts:389-391`), `unnamedHostKeySentence(name)` is sentence D, and the bridge's form of D opens with `The bridge to "<name>" could not be checked: ` | read, the working file of 2026-11-18 |
| F11 | `c20be822` is E2.S2's first commit: its tests and the world's `realClient`, on the product of E2.S1 (`pinClient.ts` there, asked by no road: `personPin.ts` has no `windowPinClient`; `hostKeyWords` has no `VerifyHostKeyDNS=no`). `git diff c20be822 70676a95 -- src_vs_code/scripts` is empty | `git show`, `grep -c` per commit |
| F12 | CI runs the smoke in the job `ci · extension` on `ubuntu-latest` (`.github/workflows/ci-extension.yml:28`), step *Integration test (SSH agent against a real ssh-add)*, `npm run itest:ssh-agent` (`:167-168`), after the step that installs `openssh-server` (`:162-165`). On that runner the client and `sshd` are OpenSSH 9.6p1 (`research/module_tests.md:2570`, measured by E1's reviewer): 8.5 or newer, so `knows`; its `sshd` has no `PerSourcePenalties` (the starter's fallback, `:100-105`) and needs no `SshdSessionPath` | read |

## 1. The CHANGELOG entry, final text

Replace, under `## [Unreleased]` of `CHANGELOG.md`, the whole block that starts at the line
`### Changed — security: a saved host key is the only key a call without a terminal accepts` and ends at the line
`An entry with no saved host key connects as before.` (after E2.S3's commit it holds E2.S3's paragraph about sentence D; read the
file first and replace the block as it then stands). The new block is the text below, byte for byte, with no version heading (the
release writes it). The lines around it (`## [Unreleased]` and `## [1.22.3] — …`) do not change. §2 maps each
sentence to its row.

```markdown
### Changed — security: a saved host key that can be used is the only key a call without a terminal accepts

An SSH entry can hold a saved host key (you confirmed its fingerprint with *Trust and connect*). Every call that the extension
starts for such an entry without a terminal now checks the host against that key and nothing else: the tunnel of *Open Remote
Bridge…*, the socket check that follows it, *Install creds on host*, an agent's `ssh:exec` and its run over SSH, and *Run with
Secrets* over SSH. This holds for a saved host key that can be used. One that cannot be used (a stored text that is no host key, or
a host that cannot be written as a known_hosts line) is refused by *Open Remote Bridge…* and *Install creds on host*, as below; the
agent's `ssh:exec` and *Run with Secrets* over SSH still read it as no saved key, and run with `StrictHostKeyChecking=accept-new`
against your own `~/.ssh/known_hosts`, as before. *Connect via SSH* does not change (the last paragraph says what it still does).
An entry with no saved host key connects as before, on every call.

Before, *Open Remote Bridge…*, its socket check and *Install creds on host* did not check a saved host key at all. They started
`ssh` with `StrictHostKeyChecking=accept-new` against your own `~/.ssh/known_hosts`, so a machine at that address that
`known_hosts` did not list yet was accepted on first contact: it got the forwarded socket of the bridge, it was the machine the
installer was downloaded onto, and a password entry sent its password there. Now these three give `ssh`
`StrictHostKeyChecking=yes` and one file that holds the saved key alone, written for the call and deleted when the call has ended,
and a host that presents another key is refused before any login. Measured against a real `sshd` on the loopback (OpenSSH 10.2p1
here, and the OpenSSH of the CI runner): with the key of that `sshd` saved, the install reaches its question and the bridge's
socket check reads the socket; with another key at the same address, every call ends with `Host key verification failed` and the
server logs no login.

A refused host key is told. When `ssh` names the saved key of this entry as the key that does not fit, *Install creds on host*
shows: `"<name>" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH
on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.` After *Open Remote
Bridge…* the socket check shows `The bridge to "<name>" is not open: ` and the same sentence, because the tunnel's own `ssh` has no
output to show. When `ssh` ends with `Host key verification failed` and does not name that key (a jump host of your own
`ProxyJump` whose key your own known_hosts file refuses, a remote command that prints that line, or your own `ssh` config that
gives this host another name or port), the message is another one: `The connection to "<name>" ended with "Host key verification
failed", and ssh did not name the saved host key of this entry as the reason. It can be the key of a jump host in your own ssh
config, which your own known_hosts file checks, or your ssh config gives this host another name or port than this entry does. Do
not replace a saved key because of this message. Connect SSH on this entry checks this host's key again and asks before it changes
anything.` After *Open Remote Bridge…* the socket check opens it with `The bridge to "<name>" could not be checked: `, because the
bridge itself can be up. A host that is down, a host that does not answer and a login that is refused are told as before. These
calls state their own log level (`LogLevel=ERROR`), so `ssh` prints a refused host key under a quiet config (`LogLevel QUIET`) too
(measured by hand). What that may cost: on these calls `ssh` may no longer print what it prints only at its `INFO` level, for
example a server's banner before the login (read in the manual, not measured).

The saved key is the only source of trust of these calls. Before, `ssh` got it as your own known-hosts file and still read the
system-wide ones (`/etc/ssh/ssh_known_hosts`): a key that such a file listed for the host was accepted beside the saved one.
Measured by hand (OpenSSH 10.2p1 on both ends, loopback): with another key saved and the host's real key in a system-wide file, the
login was accepted before and now ends with `Host key verification failed`. Two more sources can be switched on by your own `ssh`
config (the manual, `ssh_config(5)`): with `VerifyHostKeyDNS yes`, `ssh` also trusts a key that matches a secure SSHFP record in
DNS, which may not be the saved key; and a `KnownHostsCommand` is asked in addition to the files. These calls now say
`VerifyHostKeyDNS=no`, and `KnownHostsCommand=none` when the `ssh` program on this computer is OpenSSH 8.5 or newer, the first
version with that option. An older `ssh` gets no such word: it has no such option, so no config can switch that source on there
(read, not run: no `ssh` older than 8.5 was tried). `ssh -G` resolves both sources to off under a config that switches them on.
Measured by hand against a public `sshd`: a host key that only a `KnownHostsCommand` listed passed the check with the words of
before and fails with `KnownHostsCommand=none`. Not measured: a login against a signed DNS zone. To know which words to send, the
extension asks the `ssh` program for its version (`ssh -V`) before such a call. When the version cannot be read, the call is not
started, and the message says so: `CredsForDevs could not read the version of the ssh program on this computer (exit code <n>), so
it did not start a connection that has to check the saved host key of "<name>". Nothing was sent to that host. The reason is the ssh
program here, not the host.` When `ssh -V` did not start or did not end in time, the parenthesis says that in place of an exit
code.

A storage folder whose path holds a space no longer breaks these calls. `ssh` read such a path as two file names, found the saved
key in neither, and refused the host. This is the usual place of the editor's storage on macOS (`Application Support`). A path with
an apostrophe works too. A folder whose path holds a control character, a double quote, two backslashes in a row (a network path),
a backslash before an apostrophe, a backslash at its end, a percent sign, the characters `${` or a tilde at its start is refused
before anything connects, and nothing is sent: `ssh` would read another file, two files or none from such a path. The message says
that the folder where the editor keeps the files of CredsForDevs has a path with that character, and that this is about this
computer, not about the host or the saved key.

*Open Remote Bridge…* and *Install creds on host* now refuse an entry whose saved host key cannot be used: a stored text that is
no host key, or a host that cannot be written as a known_hosts line. No `ssh` starts, nothing is sent to that host, and the
message says what to do. An entry that signs in with a key is sent to *Connect SSH*, which shows the host's fingerprint and saves
the key when you confirm it. An entry that signs in with a password is told that there is no safe repair yet: Connect SSH would
send the password without a check of the host when it cannot read the host's key first. If the file of the saved host key cannot
be written to disk, the message says that, and nothing is sent either.

An agent's `ssh:exec` and *Run with Secrets* over SSH, with a saved host key that can be used, get the same words, and the same two
refusals: of a storage folder of the kinds above, and of an `ssh` whose version cannot be read. Nothing starts then, and the
refusal says which of the two it is and holds no path.

Not covered, in one place. *Connect via SSH* (your own terminal) does not change: it still reads the system-wide known-hosts files
beside the saved key, and still asks a `KnownHostsCommand` or `VerifyHostKeyDNS` of your own `ssh` config. The agent's `ssh:exec`
and *Run with Secrets* over SSH read a saved host key that cannot be used as no saved key (above). When your own `ssh` config gives
the entry's host another name or port (`HostName`, `Port`), `ssh` looks for the saved key under that name, does not find it, and
every such call is refused with the second message above (measured by hand, OpenSSH 10.2p1). A jump host whose key is refused under
a config that says `LogLevel QUIET` is told with the messages of before, not as a host key: the jump host's own `ssh` prints
nothing, and `LogLevel=ERROR` does not reach it (measured by hand). On Windows no login was measured; the Windows `ssh` was asked
only how it reads such a path (`ssh -G`).
```

**Why these words, where they differ from the entry of `70676a95`** (each is a wording inside R5, none a change of the plan):

- The heading is §6's baseline, word for word, and the C3 limit stands in the first paragraph (decision 11).
- "Measured against a real `sshd` … the OpenSSH of the CI runner" names no version for CI: that run is the head sha's (§5.6), and a
  version there moves (`knowledge-base.md`). The claim holds when the head sha's step is green; the commit body names the run.
- "(candidate C3 of the plan)" goes: a reader of the CHANGELOG cannot act on a candidate number. §2 carries every candidate number.
- The sentence on the quiet config said "is printed under a quiet config too"; it now says who prints it (`ssh`) and that it was
  measured by hand. That a ROAD then tells it is E3's M5 (e), not yet measured; the sentence does not claim it.
- Sentence F's form for a client that did not start or did not end in time (`pinClientSentence`, `hostKeyPin.ts:281-284`) was
  missing; one sentence says it, without quoting the second form.
- The agent's two refusals (E, F on the agent's exec and *Run with Secrets*) were not in the entry; one paragraph says them.
- The config that renames the host (C18) and the hop under a quiet config move from E2.S3's paragraph into *Not covered*, so the
  limits stand in one place (§6: "What stays not covered is said in one place").

## 2. The claim table

One row per sentence of §1 that claims a behaviour or a measurement. *The suite* is a test of `npm test` (file · its id or name); *the
smoke* is a check of section 10 after this story (§3.9 names them N1 to N8 and keeps E1's labels for the rest); *by hand* is a
measurement recorded in a spec (where), never in a test; *read* is a reading of code or a manual, measured by nothing. The last
column is the row of E3 that measures it on the roads before the release; "none" means no row holds it, and the claim stands on the
other columns. This table goes into the commit body of the CHANGELOG commit (§7), as the stories document asks, and E3 reads it when
it writes §10's table.

| # | The claim (the entry's words, shortened) | The suite | The smoke | By hand / read | E3 |
|---|---|---|---|---|---|
| CL1 | every call without a terminal for a saved key checks the host against that key: the tunnel, its socket check, the install | `personRoadsHostKey.test.ts` T1 (all five runs), T2, T3, T4a | leg 1 (the 4 connections carry the words), leg 2 (refused) | — | M1, M2 |
| CL2 | … and an agent's `ssh:exec` and its run over SSH | `sshExecOver.test.ts` `the_argv_is_buildSshExecArgv_with_the_snapshots_jump_and_pin`, `g1_a_pinned_call_asks_the_program_it_will_start_once_before_the_pin_file_is_written`; `agentKeyPath.test.ts` G5 (both doors); `pinWords.test.ts` W6 (one function, both builders) | — | read: one call for both doors (`sshUseActions.ts:322`) | M14 (exec only) |
| CL3 | … and *Run with Secrets* over SSH | `secretsLaunch.test.ts` `a_pinned_host_is_enforced`, `G1: a pinned session gets the six pairs …` | — | — | none (M14 says it does not take it: it needs a terminal's launch) |
| CL4 | this holds for a saved key that can be used; one that cannot is refused by the bridge and the install | `personRoadsPin.test.ts` Q6 (both roads, both logins, both kinds of unusable pin) | — | — | M4 (b), (c) |
| CL5 | the agent's `ssh:exec` and *Run with Secrets* read an unusable key as no saved key and run with `accept-new` (C3) | none: no test holds the fail-open as a behaviour (`hostKeyTrust.test.ts` "no pin, or no host, means no file" holds the file half) | — | read: `localPin` answers no pin for `unusable` (`sshUseActions.ts:260-268`), its docblock names C3; `materializeKnownHosts` answers `undefined` (`hostKeyTrust.ts:85-92`) | none |
| CL6 | *Connect via SSH* does not change | `hostKeyWords.test.ts` "the known-hosts options and strict checking are spelled in one function, and at the reviewed places of Connect's line …"; `pinWords.test.ts` S3 (the three new options are spelled in `hostKeyPin.ts` alone, so Connect's line has none) | — | read: `sshCommand.ts:312-329` (C4) | M9 records Connect's options |
| CL7 | an entry with no saved key connects as before, on every call | `personRoadsPin.test.ts` Q1; `personRoadsPinRefusals.test.ts` A3; `pinWords.test.ts` W3; `secretsLaunch.test.ts` "an unpinned session is not asked …" | — | — | M4 (a) |
| CL8 | before: the three ran with `accept-new` against the person's `known_hosts`, a first contact was accepted | — (the state of before) | — | read: the parent's §1, at `ca99cd91` | none |
| CL9 | now: `StrictHostKeyChecking=yes` and one file with the saved key alone, written for the call, deleted when the call has ended | `personRoadsHostKey.test.ts` T1-T4d; `personRoadsPin.test.ts` Q5, Q5b, Q8a, Q8b | leg 1: one pin file as both lists, 3 distinct files, no pin file and no client left | — | M1, M6 |
| CL10 | a host that presents another key is refused before any login | — | leg 2: every connection ends with 255 and the verification line; K2 logs no login and no authentication attempt | by hand: E1.S1 spec K6 | M2, M5 (a) |
| CL11 | measured on a real `sshd`, here and on the CI runner: the install reaches its question, the check reads the socket; another key: every call refused, no login | — | the smoke itself, both legs: locally (§5) and the head sha's CI step (§5.6) | — | M1, M5 (a) |
| CL12 | the install shows sentence C when `ssh` names the saved key of this entry | `hostKeyTold.test.ts` S1, X1; `personRoadsHostKey.test.ts` T9a | leg 2: "the install showed sentence C once …", and N6 (the real client's `Offending` line names the probe's pin file) | by hand: E2.S3 spec J4, J5 | M5 (a), M7 |
| CL13 | the socket check shows `The bridge to "<name>" is not open: ` and sentence C | `hostKeyTold.test.ts` X5; `personRoadsHostKey.test.ts` T9b | leg 2: "exactly one error, … is not open …", and N7 (the mode check's pin file) | — | M5 (a) |
| CL14 | the verification line without that evidence shows sentence D, word for word | `hostKeyTold.test.ts` S2, S5, S6, X2 | N8 (leg 2 shows NO sentence D: the other half) | — | M5 (f), (g) |
| CL15 | … for a jump host whose key the person's known_hosts file refuses | `hostKeyTold.test.ts` S2 (the hop's texts), X4 | — | by hand: E2.S3 spec J11; E1.S3 spec L9 h | M5 (f) |
| CL16 | … for a remote command that prints the line | `hostKeyTold.test.ts` S2 (the remote texts), X3 | — | by hand: E1.S3 spec L9 i | M5 (g) |
| CL17 | … for a config that gives the host another name or port (C18) | none | — | by hand only: E2.S3 spec J10 | none (C18: no row) |
| CL18 | the socket check opens sentence D with `The bridge to "<name>" could not be checked: ` | `hostKeyTold.test.ts` X3, X4, X6 | — | — | M5 (f), (g) |
| CL19 | a host that is down, one that does not answer, a refused login: told as before | `hostKeyTold.test.ts` S3, X7; `personRoadsHostKey.test.ts` T9c, T9d | — | by hand: E1.S3 spec L9 d, e | M5 (b), (c), (d) |
| CL20 | these calls state `LogLevel=ERROR`, so `ssh` prints a refused key under `LogLevel QUIET` too | `pinWords.test.ts` W1, G1 (`ssh -G` resolves `loglevel ERROR` under a quiet config); `personRoadsPinRefusals.test.ts` W1 | N5 (every connection says it) | by hand: the parent's §3.12 part 1 (a public `sshd`, 15 lines again); E2.S3 spec J13 | M5 (e) |
| CL21 | may cost lines printed only at `INFO`, a banner (not measured) | — | — | read: `ssh_config(5)`; E2.S2 spec K13 | none (said as not measured) |
| CL22 | a key in a system-wide file is no longer accepted beside the saved one | `hostKeyWords.test.ts` "under a config that names other known-hosts files, the real ssh resolves every pinned argv to the pin file alone" | — | by hand: E1.S1 spec K6 (loopback); the parent's §3.9 rows 1, 2 (a public `sshd`) | M2 (b) |
| CL23 | these calls say `VerifyHostKeyDNS=no`; `ssh -G` resolves it to off | `pinWords.test.ts` W1, W2, G1, G2 (the control) | N5 | read: `ssh_config(5)`; a login: not measured (said so) | M10 |
| CL24 | `KnownHostsCommand=none` for OpenSSH 8.5 or newer; a command-listed key fails the check | `pinWords.test.ts` W1, G1, G3; `pinClient.test.ts` V1, V2; `personRoadsPinRefusals.test.ts` W1 | N5 (`none`, the client being 8.5 or newer: N1) | by hand: the parent's §3.9 rows 3, 4 (a public `sshd`) | M8 |
| CL25 | an older `ssh` gets no such word, and no config can switch the source on there | `pinWords.test.ts` W2, G3; `pinClient.test.ts` V2, A3; `sshExecOver.test.ts` `g1_an_older_client_runs_without_the_knownhostscommand_word`; `secretsLaunch.test.ts` "… no KnownHostsCommand word for an older one" | — | read, not run: OpenSSH's release notes and the parent's §3.10 table | M11 |
| CL26 | the extension asks `ssh -V` before such a call; a version that cannot be read starts nothing and shows sentence F (both forms) | `pinClient.test.ts` V4, V5, A1, A4, A6, R1; `personRoadsPinRefusals.test.ts` F1-F4, A1; `pinWords.test.ts` P5 (the words) | N2, N3 (the question is one start of its own, before the first connection) | — | M11 (a) |
| CL27 | a space in the storage path no longer breaks these calls; an apostrophe works too | `personRoadsPinRefusals.test.ts` W2; `pinWords.test.ts` P1, P2, G4; `hostKeyWords.test.ts` "the real ssh reads a pin file whose path holds white space as ONE file" and its control | — | by hand: E1.S1 spec K6 (a space, a login on the loopback); E2.S3 spec J5 (a quoted path read as one file at a real key exchange); macOS's folder: read (`research/PLAN_mcp_server.md:207`), not run | M7 |
| CL28 | a folder of the eight kinds is refused before anything connects, the message names the kind and no path | `pinWords.test.ts` P1, P3, P4, P5, G5; `personRoadsPinRefusals.test.ts` E1, E2 | — | by hand: the parent's §3.11 rows a-k (`ssh -G`) | M12, M13 |
| CL29 | sentence A in two forms, sentence B; nothing is sent | `personRoadsPin.test.ts` Q6, Q7a, Q7b, Q7c | — | — | M4 (b)-(d), M9 |
| CL30 | the agent's exec and *Run with Secrets* get the same words and the two refusals, which hold no path | `sshExecOver.test.ts` `g1_a_client_that_cannot_be_read_is_refused_with_sentence_f_…`, `g1_a_pin_path_that_ssh_would_not_read_as_one_file_is_refused_with_sentence_e_…`, `g1_a_written_path_of_a_refused_kind_…`; `secretsLaunch.test.ts` the three `G1:` refusals | — | — | M14 (d) (exec only) |
| CL31 | not covered: the hop under `LogLevel QUIET` is told with the messages of before | none | — | by hand only: E2.S3 spec J12 | none (M5 has (e) and (f), no row with both) |
| CL32 | not covered: on Windows no login; the Windows `ssh` asked only how it reads a path | — | — | by hand: E1.S1 spec K7, K8 (`ssh.exe -G` of 9.5p2) | M13 (the client alone) |

**What the table shows, for the lead and for E3.** Every claim of §1 has a column behind it. Four stand on a measurement by hand or a
reading alone, with no test and no row of E3: CL5 (C3, read), CL17 (C18, by hand), CL21 (said as not measured) and CL31 (the quiet
hop, by hand). The entry says "measured by hand", "read" or "not measured" at each of them, so none is wider than what holds. CL3 and
the *Run with Secrets* half of CL30 stand on the suite alone (M14 leaves them out). Everything else that is about what `ssh` does is
measured by hand today and by a row of E3 before the release.

## 3. The smoke on the changed words (`scripts/itestPinnedRoads.cjs`)

Every change below is an assertion or a part of the rig. The roads, the runner, the spawner, the pin writer and the deletes stay the
real ones, and the product is not edited. Where this section gives code, write it as given; where it gives a shape, keep the file's
style (`reuse-first.md`, the closest neighbour is the function being edited).

### 3.1 `productOf` (`:40-52`)

One line more, beside `hostKeyPin.js`:

```js
    ...load('pinClient.js'), // pinClientOf: how the product reads `ssh -V` (E2.S1)
```

`hostKeyPin.js` already gives `refusedHostKeySentence`, and after E2.S3 `unnamedHostKeySentence`. Update the comment of that line to
name both.

### 3.2 The constant and the helpers, after `occurrences` (`:37`)

```js
/** The pairs that E2 adds to every pinned connection, with the value for a client that knows `KnownHostsCommand` (the plan's §3.10, §3.12 part 1). */
const NEW_PAIRS = { VerifyHostKeyDNS: 'no', KnownHostsCommand: 'none', LogLevel: 'ERROR' };

/** Whether `stderr` holds the real client's evidence for sentence C: the whole line `Offending <type> key in <file>:<n>`, `file` being the pin file of that run. */
const namesPinFile = (stderr, file) => file !== undefined && new RegExp(String.raw`^Offending \S+ key in ${literal(file)}:\d+\r?$`, 'm').test(stderr);
```

The value of each pair is written here as the contract says it, not read from `hostKeyWords`: reading it from the function under test
would make the check agree with any word the function writes. The NAMES are compared with `product.argv.PIN_SOURCE_OPTIONS` in N5, so
a fourth option that E2's tests learn and this smoke does not fails the smoke (`testing.md`, *a test that repeats a list …*).

### 3.3 `openLeg` (`:316-333`): the real client

Add `realClient: true` to the parts handed to `product.world.world`, beside `realForget: true`, in both legs (one function). The
question then goes through the real `pinClient.ts` and the real runner to the shim (F2-F4). Without it the world's stand-in answers
`KNOWS`, no `ssh -V` starts, and the smoke cannot see the question (mutation MA, §4.2).

### 3.4 The precondition: what the real client says of itself

A new function, before `pinnedLegs`, and one check in `pinnedLegs` after the shim's check (`:596`). The check is the rig's, not the
product's: it reads the real client by its real path (so the shim does not record it) with the product's own reader.

```js
/** What the real client says of itself, read by the product's reader (E2.S1). The words this smoke expects are those of a client that knows `KnownHostsCommand`. */
function clientAnswer(product, real) {
  return new Promise((resolve) => {
    execFile(real, ['-V'], { timeout: 5_000 }, (error, _stdout, stderr) => { // NOSONAR: a CI rig, the real client by its real path
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null;
      resolve(product.pinClientOf(code, String(stderr)));
    });
  });
}
```

In `pinnedLegs`, keep the answer of `installShim` (today it is only tested): `const real = installShim(rig);`, the shim's check on
`real !== undefined`, then:

```js
  const client = real === undefined ? { kind: 'unreadable', exitCode: null } : await clientAnswer(rig.product, real);
  check('the real ssh knows KnownHostsCommand (OpenSSH 8.5 or newer), read as the product reads ssh -V: the words this smoke expects are that client\'s', client.kind === 'knows', JSON.stringify(client));
```

This is **N1**. The legs run whatever it answers: a client below 8.5 then fails N5 too, and both details say why. This smoke does not
adapt its expectations to an older client; a client below 8.5 is E3's M11.

### 3.5 `kindOf` (`:371-376`): the question is a kind of its own

First branch, before `-N`:

```js
  if (argv.length === 1 && argv[0] === '-V') {
    return 'question';
  }
```

Update its docblock: "by `-V` alone for the question, by `-N` for the bridge, by its remote command for the three runs".

### 3.6 `startsHoldThePin` (`:387-403`): questions and connections, and the three new pairs

Its starts are split by kind: `questions` (kind `question`) and `connections` (every other). Every existing check reads `connections`
where it read `starts`, and the function returns `connections`. Its checks, in this order (labels word for word; `${label}` is
`leg 1` or `leg 2`):

1. **N2**, in place of E1's first check (`:393`):
   `` `${label}: the shim recorded 5 starts of ssh, each whole: ONE question ssh -V (the window keeps the answer of a client that knows the option) and 4 connections, the probe, the bridge, the sweep and the mode check` ``.
   Passes when every start is whole, `questions.length === 1`, and the sorted kinds of `connections` are `bridge,mode,probe,sweep`.
   Detail: `JSON.stringify({ questions: questions.length, connections: <their sorted kinds> })`.
2. **N3**, new:
   `` `${label}: the question did not start after the first connection (the start times the shim recorded)` ``.
   Passes when `questions.length === 1`, `connections.length > 0` and `Number(questions[0].start) <= Math.min(...connections.map((one) => Number(one.start)))`.
   `<=`, because the start time counts clock ticks and two starts can share one. Detail: every start's kind and start time.
3. E1's second check (`:395`), over `connections`: strict checking and one file as both lists, 4 pins.
4. **N5**, new (N4 is the login count, §3.7):
   `` `${label}: every connection says VerifyHostKeyDNS=no, KnownHostsCommand=none and LogLevel=ERROR, each once (the names those of pinnedArgv's PIN_SOURCE_OPTIONS)` ``.
   Passes when `connections.length === 4`, the names `Object.keys(NEW_PAIRS)` equal `product.argv.PIN_SOURCE_OPTIONS` in order, and for
   every connection and every name `product.argv.valuesOf(argv, name)` is exactly `[NEW_PAIRS[name]]`. Detail: whether the names agree,
   and for each connection that fails its kind and `product.argv.sourceWordsOf(argv)`. Put the per-connection test in a helper
   (`lacksNewPairs(product, argv)`, answering a boolean) so the function stays within lint's limits.
5. E1's third and fourth checks (`:398`, `:401`), over `connections`, unchanged.

So the function has 6 checks per leg where it had 4.

### 3.7 The login count of leg 1 (`:477-480`)

`const starts = await startsHoldThePin(…)` now holds the connections (§3.6). The check becomes **N4**:
`'leg 1: K1 logged one accepted login per connection: 4'`, with the same condition (`accepted === 4 && starts.length === 4`). The
question makes no connection, so K1's count stays 4. In leg 2 the label of the `Connection from` check (`:551`) says "per connection"
for "per start"; its condition does not change.

### 3.8 Leg 2: the real client's evidence, and no sentence D

- **N6**, in `installRefused` (`:491-503`), after the probe's check (`:498`):

  ```js
  const probeFile = pinOf(product, probe?.argv ?? []);
  check('leg 2: the real client named the pin file of the probe: its stderr holds "Offending <type> key in <that file>:<n>", the evidence of sentence C', namesPinFile(probe?.outcome?.stderr ?? '', probeFile), JSON.stringify({ file: probeFile, stderr: probe?.outcome?.stderr }));
  ```

  `probe.argv` is the argv the recording runner saw, the product's own; its pin file is the file the call wrote. The check is about
  the real client, not the product: it shows that the evidence E2.S3 asks for is printed through the roads. It passes on the old
  product too (§4.1), and the control MC1 turns it red.
- **N7**, in `bridgeRefused` (`:506-530`), after the socket check's check (`:525`), the same for the mode check:
  `'leg 2: the real client named the pin file of the mode check: "Offending <type> key in <that file>:<n>"'`, with
  `pinOf(product, mode()?.argv ?? [])` and `mode()?.outcome?.stderr`.
- **N8**, in `legTwo`, after `bridgeRefused` and before the descendants are taken (`:545-546`):

  ```js
  const unnamed = typeof rig.product.unnamedHostKeySentence === 'function' ? rig.product.unnamedHostKeySentence(rig.product.world.ROW.node.name) : undefined;
  const saidD = [...leg.w.infos, ...leg.w.warnings, ...leg.w.errors, ...leg.w.logs].filter((text) => text.includes('could not be checked') || (unnamed !== undefined && text.includes(unnamed)));
  check('leg 2: no message and no log line said sentence D or "could not be checked": where it does, E2.S3\'s rule of evidence missed on the real client (a finding against E2.S3, not a repair of this script)', saidD.length === 0, JSON.stringify(saidD));
  ```

  Sentence D is read back from the product where the product has it (`unnamedHostKeySentence`, E2.S3), never typed; the words
  `could not be checked` are the bridge's opening, built by this file as `bridgeForm` builds the opening of sentence C (`:56`). The
  `typeof` guard is for the RED tree of §4.1, which has no sentence D. The world of a leg is that leg's alone, so its arrays hold that
  leg's messages only.

E1's checks of sentence C in leg 2 (`:502`, `:528`) stay as they are: `withC.length === 1` and `errors[0] === expected` already fail
when sentence D is shown in its place.

### 3.9 The checks after this story, in the order they are printed

48 checks, where E1.S4 had 40 (its labels T1 to T40 are E1.S4's spec's; the new ones are N1 to N8, and N2 replaces a check of E1):

| Part | Checks | Count |
|---|---|---|
| the keys, the shim, N1 | the throwaway keys; the shim resolved the real ssh; **N1** the client knows the option | 3 |
| leg 1 | K1 listens; the saved key is K1's; the install's 3; the bridge's 5; Close; `startsHoldThePin`'s 6 (**N2**, **N3**, strict and one file, **N5**, named files, 3 distinct files); `nothingLeft`'s 2; **N4** 4 accepted logins per connection; K1 and its processes gone | 21 |
| leg 2 | K2 listens; the install's 3 and **N6**; the bridge's 5 and **N7**; **N8**; `startsHoldThePin`'s 6; `nothingLeft`'s 2; K2 reached per connection; K2 no login; K2 and its processes gone | 23 |
| the end | the person's `~/.ssh/known_hosts` is unchanged | 1 |

### 3.10 The comments

- The header of `scripts/itestPinnedRoads.cjs` (`:9-13`): leg 1 "every start carries the pin words" becomes "the question `ssh -V` of
  the real product starts once, before the connections, and every connection carries the pin words and E2's three pairs"; leg 2 gains
  "and the real client's `Offending` line names the pin file of the probe and of the mode check, and no sentence D is shown". The
  control line (`:13`) stays.
- `scripts/ssh-agent-itest.cjs:42-45`: "every start carries the pin words and logs in" → "every connection carries the pin words and
  logs in"; "every start is refused" → "every connection is refused". No line is added or removed (772 lines).

## 4. RED first, the mutations and the control

All in the scratch copy of §5, never in the worktree. Each run is section 10 alone (`run10.cjs`, §5.4), its output saved. After each
mutation the copy is restored and compiled again before the next.

### 4.1 RED: the new checks against E2.S2's product without its words (`c20be822`)

`c20be822` holds E2.S1's `pinClient.ts`, E2.S2's tests and the world's `realClient`, and no road asks the client and `hostKeyWords`
writes none of the three pairs (F11). In the copy, with this story's script in place:

```bash
rm -rf "$SP/g1s4-copy/src_vs_code/src" "$SP/g1s4-copy/src_vs_code/out"
git -C "$WT" archive c20be822 src_vs_code/src | tar -x -C "$SP/g1s4-copy"
# compile (§5.4), read the exit of tsc (0), run section 10, save the output
```

**Expected: exactly 6 FAIL, 42 ok, exit 1.** The six are N2, N3 and N5 of each leg: N2 with `"questions":0` (no road asks), N3 with no
question, N5 with every connection's `sourceWordsOf` empty. Every other check is ok: N1 (the machine's client), N4 (4 logins), N6 and
N7 (the real client prints the `Offending` line at its default level as well), N8 (that product has no sentence D), and all of E1's
checks. A different set is not RED for the stated reason: stop and tell the lead with the output.

Then restore: `rm -rf` the copy's `src_vs_code/src` and `out`, `git -C "$WT" archive HEAD src_vs_code/src | tar -x -C "$SP/g1s4-copy"`,
`cp` every file of `src_vs_code/src` that is not committed yet, compile, and run: **48 ok, exit 0** (the GREEN of §4.3).

### 4.2 The mutations (each alone, on the final product, then restored)

| # | The mutation, in the copy | Expected | What it proves |
|---|---|---|---|
| MA | the script's `openLeg` without `realClient: true` | exactly 4 FAIL: N2 and N3 of each leg (`"questions":0`); N5 ok (the stand-in answers `KNOWS`) | the question is seen only through the real client: `realClient` is needed |
| MB | `hostKeyTold` (E2.S3) never finds the evidence: its compare of the printed name with the path of the call answers false | exactly 3 FAIL: leg 2's "the install showed sentence C once …", "exactly one error, … is not open …", and **N8** (the texts shown hold `could not be checked` and sentence D); N6 and N7 stay ok | the smoke catches a rule of evidence that misses on the real client while the client printed the evidence: the shape of the finding the constraints name |
| MC | `hostKeyWords` without the pair `-o LogLevel=ERROR` | exactly 2 FAIL: N5 of each leg, its detail naming the missing `LogLevel` word | N5 checks each pair, not "any of them" |
| MD | `NEW_PAIRS` of the script with a fourth name (`HostKeyAlias: 'x'`) | exactly 2 FAIL: N5 of each leg, its detail saying the names do not agree with `PIN_SOURCE_OPTIONS` | the list of names is tied to the tests' own list |

### 4.3 GREEN, and the control MC1

- **GREEN**, on the final product (E2.S1-E2.S3 committed): 48 ok, exit 0, three runs of section 10 in a row, then the whole script once.
- **MC1**, as E1.S4's (the header, `:13`): `hostKeyWords` made to answer `['-o', 'StrictHostKeyChecking=accept-new']` for every pin.
  Expected, at least: leg 2's "K2 logged no accepted login and no authentication attempt" FAIL with the `Accepted publickey` lines; N6
  and N7 FAIL (the client was accepted and printed no `Offending` line); the install's and the bridge's sentence C FAIL; N5 and E1's
  pin-file checks FAIL in both legs. N1, N2, N3 and N8 stay ok (the product still asks the client, and shows no sentence D). Record
  every FAIL line as printed.

The outputs of 4.1 to 4.3 (the FAIL lines with their details, the counts, the exit codes) go into the commit body of the test commit
(§7), as E1.S4's did.

## 5. The runs: here, on an unprivileged `sshd`, and in CI

This machine has no `sshd` (`which sshd` answers nothing; the parent's §5, checked 2026-11-18), and nothing may be installed into the
system. The recipe is G2's (`research/PLAN_bridge_no_connection_sharing_S2_spec.md` §2) as E1.S4 used it (its §8.2), with `g1s4-` for
the folder names. `$SP` is the session's scratchpad folder, `$WT` the worktree (`git rev-parse --show-toplevel`). **Nothing of this is
committed, and no scratch path enters a committed file.**

### 5.1 The `sshd`, unpacked as data

Three NEW, EMPTY folders; the packages are unpacked into a folder that holds no script:

```bash
mkdir "$SP/g1s4-deb" "$SP/g1s4-sshd" "$SP/g1s4-run"
(cd "$SP/g1s4-deb" && apt-get download openssh-server libwrap0)
for deb in "$SP"/g1s4-deb/*.deb; do dpkg-deb -x "$deb" "$SP/g1s4-sshd"; done
```

Then one wrapper, `$SP/g1s4-run/sshd-wrap.sh`, `chmod +x`, with `$SP` written out (the library path is set for `sshd` and its children
alone; `exec` keeps the pid, and `sshd` must be started by an absolute path):

```sh
#!/bin/sh
LD_LIBRARY_PATH=$SP/g1s4-sshd/usr/lib/x86_64-linux-gnu exec $SP/g1s4-sshd/usr/sbin/sshd "$@"
```

Check the version it answers (`"$SP/g1s4-run/sshd-wrap.sh" -V`, its stderr): the record of §6 names it.

### 5.2 The copy, the whole repository

```bash
mkdir "$SP/g1s4-copy" && git -C "$WT" archive HEAD | tar -x -C "$SP/g1s4-copy"
rmdir "$SP/g1s4-copy/.agents/conventions"
ln -s "$WT/.agents/conventions" "$SP/g1s4-copy/.agents/conventions"
ln -s "$WT/src_vs_code/node_modules" "$SP/g1s4-copy/src_vs_code/node_modules"
```

`git archive HEAD` holds what is committed: `cp` every changed file that is not committed yet (this story's script, and E2.S3's files
if they are not committed when you run) into the copy before you compile it.

### 5.3 The edits, in the COPY only

- `scripts/itestSshd.cjs`, line 13: `const SSHD = '<$SP>/g1s4-run/sshd-wrap.sh';`, and in `startSshd`'s config, after
  `'KbdInteractiveAuthentication no',`, the two lines below (sections 5, 7 and 9 need them in the whole-script run).
- `scripts/itestPinnedRoads.cjs`, in `servingConfig`, after `'KbdInteractiveAuthentication no',`, the same two lines (an `sshd` 10.x
  that was not installed needs them):

```js
      'SshdSessionPath <$SP>/g1s4-sshd/usr/lib/openssh/sshd-session',
      'SshdAuthPath <$SP>/g1s4-sshd/usr/lib/openssh/sshd-auth',
```

### 5.4 Compile and run, in `$SP/g1s4-copy/src_vs_code`

`rm -rf out`, then `node ../.agents/conventions/tools/low-priority.mjs node node_modules/typescript/bin/tsc -p ./`; read its exit (0).
Section 10 alone: `node "$SP/g1s4-run/run10.cjs" "$SP/g1s4-copy/src_vs_code"`, with this runner (G2's `run9.cjs`, for section 10):

```js
// Runs section 10 alone, the way `ssh-agent-itest.cjs` would call it: node run10.cjs <scratch copy>/src_vs_code
const path = require('path');
const ROOT = process.argv[2];
const harnessScope = require(path.join(ROOT, 'scripts', 'lib', 'harnessScope.cjs'));
const { livePinnedRoads } = require(path.join(ROOT, 'scripts', 'itestPinnedRoads.cjs'));
let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
}
harnessScope.run(async () => {
  const t0 = Date.now();
  await livePinnedRoads(check, path.join(ROOT, 'out'));
  console.log(`\n${failures} check(s) failed; ${Date.now() - t0} ms`);
  return failures === 0 ? 0 : 1;
});
```

The whole script, once, on the final product: `node --import ./scripts/lower-priority.mjs scripts/ssh-agent-itest.cjs`.

### 5.5 After every run

```bash
ls /tmp | grep -E "creds-pin|^creds-$(id -un)-"                              # expected: nothing (the owned folder, a forwarded socket)
ps -u "$(id -u)" -o pid,args | grep -E 'sshd|ssh -F' | grep -v grep          # expected: nothing of this rig
```

If the short socket root of `scripts/lib/leftovers.cjs` is not under `/tmp`, look there. A process that is left is ended by its pid; a
socket `creds-<user>-<id>.sock` that a run left is removed by its exact name. At the end of the story the four `g1s4-` folders of `$SP`
are removed.

### 5.6 CI, the second run

The head sha's `ci · extension` run, job on `ubuntu-latest`, step *Integration test (SSH agent against a real ssh-add)* (F12), is the
second run: a client and an `sshd` of another version (9.6p1, read), installed by the job, `CI=true` (a missing `sshd` fails). It must
print the 48 checks `ok`. N1 holds there (9.6 is 8.5 or newer); the starter's fallback without `PerSourcePenalties` is exercised there
and not here. The lead reads that step's log after the push (this story does not push): the claim CL11 holds only when it is green on
the head sha, and the PR description names the run.

## 6. `research/module_tests.md`

- **The row of `scripts/itestPinnedRoads.cjs`** (`:2568`): "40 checks, two legs" → "48 checks, two legs (40 in E1.S4)". To its
  description add: the world's real asker of the client (`realClient`), so the real product asks the real client `ssh -V` through the
  shim, once per leg, before the connections; the shim records it as a question, apart from the 4 connections; leg 1 checks on every
  connection E2's three pairs (`VerifyHostKeyDNS=no`, `KnownHostsCommand=none`, `LogLevel=ERROR`) beside the pin words, after a
  precondition that the real client is 8.5 or newer; leg 2 checks that the real client's `Offending` line names the pin file of the
  probe and of the mode check, and that no message and no log line says sentence D. Keep every fact of E1's description that stays true;
  "4 accepted logins for 4 starts" becomes "for 4 connections".
- **A new paragraph after "The smoke, seen when it was built (2026-11-18)."** (`:2570`), which stays as it is (the record of E1's run
  is not rewritten): `**The smoke on the changed words, seen when E2.S4 built it (<date>).**` with the versions of the client and the
  `sshd`, section 10 alone three runs in a row (n ok each, the time), the whole script (n ok lines), the RED on `c20be822` (its 6 FAIL),
  MA to MD and MC1 (their FAIL counts), and "the CI run of the head sha is the runner's own". The numbers are the runner's, read from the
  output, never typed from this spec.
- **"What none of them proves"** (`:2572`): it already names "E2.S4's test 27" for the `Offending` line through the roads; add that the
  smoke does not prove a quoted path, a quiet config, a hop, a remote text, a client below 8.5, DNS or a `KnownHostsCommand` on the
  roads: E3's M5, M7, M8, M10 and M11.

## 7. Order of work, and the commits

1. Wait until E2.S3 is committed on the branch (its `hostKeyTold`, sentence D and its CHANGELOG paragraph). Read the CHANGELOG block
   as it then stands.
2. The script (§3) and the comment of `ssh-agent-itest.cjs` (§3.10), in the worktree. `npm run typecheck` and `npm run lint` (lint
   reads `scripts`): exit 0. `wc -l` of both scripts: at most 800.
3. The copy (§5.1-§5.3). RED on `c20be822` (§4.1), then GREEN (§4.3): three runs of section 10, then the whole script; after each run,
   §5.5.
4. MA to MD and MC1 (§4.2, §4.3), each restored.
5. In the worktree, at lowered priority and one after another: `npm test` (the whole suite: no test file changes in this story, so the
   counts are E2.S3's), the leftovers guard (`node .agents/conventions/tools/leftovers-check.mjs --repo . --profile node --token creds
   --identity "the developer-credentials server and extension"`, from the repository root) and `out/test/harnessSites.test.js`: green
   and clean. `node .agents/conventions/tools/plan-lifecycle.mjs`: no new finding.
6. `research/module_tests.md` (§6), with the numbers of steps 3 and 4.
7. **Commit 1**, by path (and by hunk in `research/module_tests.md` if another session has uncommitted lines in it):
   `src_vs_code/scripts/itestPinnedRoads.cjs`, `src_vs_code/scripts/ssh-agent-itest.cjs`, `research/module_tests.md`.

   ```text
   test(itest): G1 E2.S4 c1 - section 10 on the changed words: the real client's question, E2's three pairs, the evidence of sentence C

   <section 10 alone, three runs, 48 ok each, the time; the whole script, n ok; the client and sshd versions>
   <RED on c20be822: the 6 FAIL lines with their details>
   <MA, MB, MC, MD: the FAIL lines of each; MC1: its FAIL lines>
   <the line counts of both scripts; npm test's numbers; the leftovers guard and harnessSites>
   <not exercised here: the starter's fallback without PerSourcePenalties; the runner's sshd (the CI run of the head sha)>

   Co-Authored-By: <the trailer the lead's brief names>
   ```

8. **Commit 2**, `src_vs_code/CHANGELOG.md` alone, by hunk if another session has uncommitted lines in it: the block of §1. Its body is
   the claim table of §2 (as it is here, or with a row corrected where a run of steps 3-4 showed otherwise: then stop and tell the lead
   first). Subject: `docs(changelog): G1 E2.S4 c2 - the entry claims only what holds (R5): the C3 limit in its opening, the limits in one place`.
9. Do not push. Report to the lead: both shas, the outputs, and anything §1 or §2 could not keep.

## 8. Done when (each item can be counted)

1. Section 10 alone printed 48 `ok` in three runs in a row locally (the unpacked `sshd`), and the whole `ssh-agent-itest.cjs` passed
   once in the copy.
2. RED on `c20be822` printed exactly the 6 FAIL of §4.1; MA, MB, MC and MD printed exactly their FAIL; MC1 printed at least its list;
   all recorded in commit 1's body.
3. Leg 2 showed sentence C on both roads with the real client's `Offending` line (N6, N7) and no sentence D (N8). If not: stopped, and
   the lead was told (the constraints).
4. In CI, the head sha's step *Integration test (SSH agent against a real ssh-add)* printed the 48 checks `ok` (the lead reads it).
5. The CHANGELOG's `[Unreleased]` block is §1's text, and commit 2's body holds §2's table.
6. No file of `src_vs_code/src` changed (`git diff --stat` of both commits names none); `scripts/itestSshd.cjs` is unchanged.
7. Both scripts at most 800 lines; typecheck, lint and the whole `npm test` green; the leftovers guard clean; `harnessSites.test.js`
   green.
8. After each local run, §5.5 showed no folder, process or socket of the rig; the `g1s4-` folders are removed at the end.
9. `research/module_tests.md` carries §6, with the runner's numbers.

## 9. Opus review checklist

For the Opus reviewer of this story (and the lead's R5 reading of the entry). Each item is checked against the diff and the outputs,
not against this spec's intention.

- [ ] **R1 — The heading and the opening.** The heading is §6's baseline word for word; the first paragraph names the C3 limit (an
      unusable key on the agent's `ssh:exec` and *Run with Secrets* runs with `accept-new`) before any other paragraph claims a guarantee.
- [ ] **R2 — Every claim has its row.** For each sentence of the new block that claims a behaviour, §2 has a row, and that row's tests
      exist under those names in `src_vs_code/src/test` (grep each). A sentence with no row, or a row whose test does not exist, is a
      finding.
- [ ] **R3 — No claim wider than its column.** A sentence whose row says "by hand" or "read" says "measured by hand", "read" or "not
      measured" in the entry (CL17, CL20, CL21, CL22, CL24, CL25, CL27, CL31, CL32). Nothing says "told" through a road where only `ssh` was
      measured (CL20).
- [ ] **R4 — The limits in one place.** *Not covered* names Connect (C4, and C1 in the unusable-key paragraph), C3, the config that
      renames the host or port (C18), the quiet hop, Windows (C6). No limit is said only in a middle paragraph.
- [ ] **R5 — The sentences are the product's.** Sentences C, D and F in the entry are byte for byte `refusedHostKeySentence`,
      `unnamedHostKeySentence` and `pinClientSentence` with an exit code (`hostKeyPin.ts`), with `<name>` and `<n>` for the values.
- [ ] **R6 — The older client.** The entry says that an `ssh` older than 8.5 gets no `KnownHostsCommand` word and that this was read,
      not run.
- [ ] **R7 — The block replaced whole.** The CHANGELOG diff touches only the block under `## [Unreleased]`; the release slicer still
      finds `## [Unreleased]` and `## [1.22.3]` (`git-workflow.md`, rule 11: run the slicer by hand if a heading moved).
- [ ] **R8 — `realClient` and the question.** `openLeg` passes `realClient: true`; the question is recorded as kind `question` from an
      argv of exactly `['-V']`; N2 expects exactly one per leg, and the reason (the kept `knows` answer, one asker per leg) is in a comment.
- [ ] **R9 — The pairs are literals, the names are tied.** `NEW_PAIRS` holds the values as the contract says them, not read from
      `hostKeyWords`; N5 compares its names with `PIN_SOURCE_OPTIONS` (MD's output shows it).
- [ ] **R10 — The evidence is the whole line of the call's own file.** `namesPinFile` matches a whole line, the path escaped by
      `literal`, and the file is the pin file of THAT run (`pinOf` of its own argv), not of the bridge and not the folder.
- [ ] **R11 — The finding stays a finding.** No check of leg 2 was loosened to accept sentence D or `could not be checked`; MB's output
      shows N8 red.
- [ ] **R12 — RED for the stated reason.** The RED output on `c20be822` shows exactly N2, N3, N5 of both legs FAIL, with the details
      §4.1 names, and `tsc` exited 0 before it.
- [ ] **R13 — No product change.** Neither commit touches `src_vs_code/src` or `scripts/itestSshd.cjs`; the world is used, not edited.
- [ ] **R14 — The rig stays the rig's.** The precondition's `execFile` starts the real client by its real path, with a time limit and no
      shell; nothing new reads or writes the person's `~/.ssh`; the known_hosts check at the end still passes.
- [ ] **R15 — Nothing of the scratch copy is committed.** No `SshdSessionPath`, no wrapper path, no `$SP` path in either commit.
- [ ] **R16 — The record is appended.** `research/module_tests.md` keeps E1's dated paragraph and adds E2.S4's; its numbers match the
      outputs in commit 1's body; the CI run is named by the lead, not assumed.

## 10. Not verified by this spec

- **The new checks were not run.** No line of §3 was executed while this spec was written: E2.S3 is not committed, and the smoke needs
  the unpacked `sshd` of §5. The expected FAIL sets of §4 are derived by reading (F1-F11), not observed. A different set is a stop.
- **That exactly one question starts per leg** rests on F5 (the kept `knows` answer and one asker per world). If N2 sees more, the
  asker did not keep the answer between roads; that is a question for the lead about E2.S1/E2.S2, not a count to change here.
- **The `Offending` line under `LogLevel=ERROR` through the roads** is measured by hand for the client alone (the parent's §3.12 part 1;
  E2.S3's J4, J13), not yet through these roads: N6 and N7 are its first measurement.
- **The CI runner's versions** (9.6p1) are read from `research/module_tests.md:2570`, not measured by this spec.

## Notes for the lead

- **The README row** (for `todo/README.md`, after the row of the E2.S3 spec), and the links in the parent's status block, its
  `## Epics` E2 *Stories*, and the stories document's status block and `## E2.S4` are yours: this spec edits neither file.
- **No plan change is proposed.** Every change of §1 is wording inside R5 (§6 of the parent); every change of §3 is inside test 27 and
  the stories document's scope for E2.S4 (the question's kind, the new pairs, the `Offending` line of leg 2). The precondition N1 and
  the no-D check N8 are assertions, not new behaviour.
- **CL5 (C3) is held by reading alone.** The limit that decision 11 puts into the heading has no test: if C3 is built later, nothing
  turns red to say the entry's opening is stale. A guard test (the agent's exec on an unusable pin runs with `accept-new`) would hold
  it; it is outside this story (no test file of the suite changes here). The lead's call, for C3's own plan.
- **CL17 (C18) and CL31 (the quiet hop) stand on one measurement by hand each** (E2.S3's J10, J12), with no test and no row of E3.
  The parent's working copy now carries C18 with its disposition (the coder of E2.S3 is writing it); the quiet hop is in §3.12's
  *What stays open*. If E3 should hold either, that is a row E3 does not have: a plan change, not this story's.
- **CL3 and the *Run with Secrets* half of CL30** stand on the suite alone: M14 leaves *Run with Secrets* out. The entry claims them as
  behaviour (the words, the refusals), which the suite holds; no real run does.
- **The entry drops "(candidate C3 of the plan)"** from the text a user reads; §2 carries the candidate numbers. If you want the
  number in the CHANGELOG, it is one parenthesis in the first paragraph.
- **If leg 2 shows sentence D** on the real client, the evidence E2.S3 reads is not printed as it measured, or its read-back misses: N6
  and N7 then say which (the line is there or not). That decides whether the finding is the client's text or E2.S3's match.
