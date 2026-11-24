# PLAN — E1.S3 spec: the three roads name the pin file, and a refused host key is told (SECURITY)

> Status: **built 2026-11-18 (4dca4bd0 the product and the tests, 5dc8139e the documents) on `fix/g1-person-roads-pin`, merged (#379, `f3e9887d`), not released. Its condition of sentence C (the verification line anywhere in the stderr) is replaced in epoch 2 by the parent's §3.12, and is corrected by E2's pull request. Spec written 2026-11-17, by Fable.** A security spec, written before its code (the row *Security
> judgement* of `subagent-models.md`; not the cornerstone: E1.S2 holds it). Story E1.S3 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its §3.3, §3.4, sentence C of §3.5, §3.6, the tests 2,
> 3, 4, 9 and 11 of its §5 and the mutation checks of item 15 that name the four argv calls, one file per run, the bridge's pin
> file and sentence C) and of its stories document
> [PLAN_person_roads_pin_host_key_E1.md](PLAN_person_roads_pin_host_key_E1.md) (`## E1.S3`). It builds on the two specs before it:
> [PLAN_person_roads_pin_host_key_E1_S1_spec.md](PLAN_person_roads_pin_host_key_E1_S1_spec.md) (the words of a pinned call) and
> [PLAN_person_roads_pin_host_key_E1_S2_spec.md](PLAN_person_roads_pin_host_key_E1_S2_spec.md) (the pin of one call and the
> guards). The parent and the stories document do not link to this file yet: the lead adds those two links (*Notes for the
> lead*). This file is promoted together with the parent.
>
> Scope: `src_vs_code/src` — `hostKeyPin.ts` (two new exported functions), `commands/agentCommands.ts` (the four argv calls, one
> parameter of `sweepDeadSockets`, one parameter type, two branches, one new import line); tests: new
> `test/personRoadsHostKey.test.ts`, two comment lines of `test/personRoadsPin.test.ts`; and three documents (§6). No builder, no
> guard, no pin writer, no script (E1.S4). Branch `fix/g1-person-roads-pin`, after E1.S1 and E1.S2 on the same branch. Each
> `file:line` below was read on that branch at `3b5008d3`: both stories are built there, and `main` with PR #365 is merged in.
> Fable writes this spec, a Sonnet coder builds it, Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above; a section
named as §3.5 and so on is the parent's, and a section named as "§2 of this spec" is this document's. "N16" is
[PLAN_person_roads_forget_key.md](../research/PLAN_person_roads_forget_key.md). The names of the two specs before this one keep
their meaning (`hostKeyWords`, the six words, `valuesOf`; `CallAuth`, `ReadyCall`, `writePersonPin`, the world, Q0 to QS). This
document's own names: the facts L1 to L12, the scenarios H1 to H5 and T1 to T11, the mutations W1 to W19, the break-its Z1 to
Z14. "The five runs" are the `ssh` runs of the three roads: the tunnel of the bridge, the sweep and the mode check of the socket
check, the probe and the install run of the install. This document keeps no change ledger: a change of it is an entry in the
parent (`plan-change-control.md`), and the parent has one entry in its epoch, so a second one stops the whole plan.

## What E1.S3 builds, in one paragraph

After E1.S2 a pinned entry writes a pin file for each call of the three roads, and no `ssh` reads it: the four argv calls of
`commands/agentCommands.ts` name no `knownHostsFile`, so all five runs still say `accept-new`. E1.S3 hands the file to `ssh`. Each
of the four argv calls names the `knownHostsFile` of the ONE value that the guard handed its road, and the builders turn it into
the six words of E1.S1: strict checking, and that file as both known-hosts files. From this story on, a pinned entry connects
on these roads only to a host that presents the saved key; an entry with no pin runs as before. Then a refused host key becomes
an outcome that the person can read. `ssh` says it with one line on its stderr, `Host key verification failed.`. A new pure
function reads that line, and only for a pinned call. *Install creds on host* shows sentence C in place of "the host did not
answer the probe". The tunnel of a bridge has no stdio, so its socket check speaks for it: one error message, `The bridge to
"<name>" is not open: ` and sentence C. A host that is down, a host that does not answer and a refused login keep the
sentences of today: they are not told as a host with another key.

| File | Change | Where |
|---|---|---|
| `hostKeyPin.ts` | new `export function hostKeyRefused(pinFile: string \| undefined, stderr: string): boolean`, new `export function refusedHostKeySentence(name: string): string`, the constant `HOST_KEY_REFUSED_LINE`. 213 → 247 lines | §2 |
| `commands/agentCommands.ts` | one import line and one more name on another; `sweepDeadSockets` gets the parameter `knownHostsFile`; the four argv calls name `knownHostsFile`; `runRemote` takes a `ReadyCall`; one branch in the socket check (7 lines) and one in the install (4 lines). **784 → 797 lines** | §3 |
| `test/personRoadsHostKey.test.ts` (new) | 37 tests: H1 to H5, T1 (2), T2 (5), T2g, T3 (5), T3q, T4a to T4d, T9a, T9b, T9c (5), T9d (5), T9e, T11. 469 lines | §4 |
| `test/personRoadsPin.test.ts` | two lines of its header comment (they say "the argv does not name the file yet") | §4.3 |
| `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md` | the texts of §6 | §6 |

## Binding constraints

- **No plan change.** Build what the parent and this document say. If a step cannot be done as written, a code block here does
  not compile, or a test is not RED or GREEN as this document says: stop and tell the lead. Do not repair the parent, the stories
  document or this document. The parent has one recorded change in its epoch; a second one stops the whole plan.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first. Read the exit of `tsc` before any
  test result. This is why the tests of the two new functions (H1 to H5) read the exports through the module object: the test
  file compiles before the functions exist (L10 a).
- **Keep what the runner printed.** Save each RED text in the scratchpad folder of the session and quote it in the commit body.
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history. Never a bare `git stash`. Never commit `.claude/settings.json`.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): 800 lines per file, 50 code lines per function (120 in `src/test/`),
  complexity 4, also in tests. No new `eslint-disable`. `commands/agentCommands.ts` has **797 lines** after this story (§3.3).
  Do not break one of its lines in two and do not add a comment line that this document does not show: three lines are left.
- **The product change is §2 and §3 and nothing else.** `sshExecCommand.ts`, `sshBridge.ts`, `writtenKey.ts`, `personPin.ts`,
  `hostKeyTrust.ts`, `sshExecRunner.ts`, `remoteCliInstall.ts`, `sshBridgeManager.ts`, `bridgeSpawner.ts`, `extension.ts`,
  `sshUseActions.ts` and `remoteLaunch.ts` do not change. No test world changes: `test/personRoadsWorld.ts` and
  `test/pinnedArgv.ts` have what this story needs (L11).
- **The pin file of an argv is the `knownHostsFile` of the ONE value of that road, and nothing else.** No road writes a pin, no
  road keeps a path under another name, and the socket check never reads the bridge's file. On each road the word is
  `credential.knownHostsFile`; in `sweepDeadSockets` it is the parameter that the check filled from it.
- **No argv call of these roads names `bridged`, `configFile` or `pinned`** (the options of PR #365 for a bridged call, L7). The
  only option they name is `knownHostsFile`.
- **An unpinned call does not change by one word, and is shown no new sentence.** Its `knownHostsFile` is `undefined`, the
  builders then say `accept-new` (E1.S1), and `hostKeyRefused` answers `false` for it whatever `ssh` printed.
- **Sentence C is the parent's §3.5, character for character**, and it is written in ONE place, `refusedHostKeySentence`. The
  bridge's opening, `The bridge to "<name>" is not open: `, is written in one place too, the branch of the socket check.
- **Sentence C is shown for the first run whose answer each bounded road reads, and for no other run:** the probe of the install
  and the mode check of the socket check. The sweep's answer is read by nobody. The install's second run keeps the sentence of
  today (§3.5: "a key that changes between two runs seconds apart").
- **Every other sentence of these roads stays as it is**, for every run that is no refused host key of a pinned call.
- **Tests leave nothing outside an owned temp folder.** Every real file of the new tests is in a folder of `ownedDir`
  (`scripts/lib/leftovers.cjs`), registered in a `cleanupScope` that the file closes in `after`. No test starts a process.
- **Node only.** No Python, also not for a helper script. Write files with the Edit or Write tool, not with a shell heredoc.

## Facts read on `3b5008d3` and measured on 2026-11-17 that this spec uses

| # | Fact | Where |
|---|---|---|
| L1 | The branch at `3b5008d3` has E1.S1 (`91bd94a7`), E1.S2 (`7f061190` the import lines, `aad8b8ba` the product, `08d65f5d` the documents) and the merge of `main` with PR #365 (`3b5008d3`). The merge changed none of `commands/agentCommands.ts`, `hostKeyPin.ts`, `sshBridge.ts`, `writtenKey.ts`, `personPin.ts`, `test/personRoadsWorld.ts`, `test/pinnedArgv.ts`, `test/personRoadsPin.test.ts` (`git diff aad8b8ba 3b5008d3` of them is empty). `commands/agentCommands.ts` has 784 lines there, as the E1.S2 spec counted. Its four argv calls name no `knownHostsFile`: the sweep (`:172`, in `sweepDeadSockets`, `:165-181`), the mode check (`:198`), `runRemote` (`:329`, in `:323-341`), and `buildBridgeArgv` (`:427-431`) | the file |
| L2 | The ONE value a road reads is `CallAuth` (`writtenKey.ts`). After `if (!credential.ok)` has returned it is a `ReadyCall`: the ok credential and `knownHostsFile?: string`, which is there only when the entry is pinned and its pin file was written for THIS call. The three roads name the value `credential` (`:192`, `:264`, `:416`). `runRemote` still types its parameter as the ok half of the answer of the resolve (`:325`), which has no `knownHostsFile` | `writtenKey.ts`, the file |
| L3 | The socket check `verifyBridgeSocket` (`:183-237`): the refusal branch (`:193-196`); the argv of the mode check (`:198`); the call of the sweep (`:206`); the timer of 1.5 s (`:208`); the run of the mode check (`:209-213`); `interpretSocketProbe(outcome.stdout ?? '')` (`:214`), which reads an empty answer as `unreadable` (`sshBridge.ts:313-319`); a missing socket is logged and shown (`:215-223`); `unreadable` is logged only: "is there, but its mode could not be read on that host" (`:224-227`). The check reads `outcome.stdout` and nothing else of its run. `sweepDeadSockets` reads nothing of its run (`:177`). It is called once, detached, after the bridge's command has its bridge: `void verifyBridgeSocket(accountId, details, remote)` (`:455`) | the file |
| L4 | *Install creds on host* (`:251-320`): the probe (`:273`); a timeout shows a warning (`:274-279`); `blockerFor(interpretProbe(facts.stdout))` (`:280`) answers "the host did not answer the probe, so nothing is known about it yet." for an empty stdout (`remoteCliInstall.ts:84`), and the road shows the warning `Cannot install on "<name>": ` + that (`:282`); the question (`:288-296`); the install run (`:305`), read by `interpretInstall` (`:308`), whose failure is the error `Could not install on "<name>": ` + a reason (`:318`). `runRemote` returns the `stderr` of its run (`:337`), and nobody reads the probe's | the file |
| L5 | `runSshExec` answers `stdout` and `stderr` as two strings, each cut at a byte limit (`sshExecRunner.ts:57-65`, `:94-96`); the child's stdio is `['ignore', 'pipe', 'pipe']` (`:134`). So the `stderr` of a run holds what `ssh` itself printed AND what the remote command wrote to its own stderr | `sshExecRunner.ts` |
| L6 | The tunnel of a bridge is spawned with no stdio (`bridgeSpawner.ts:79`). Its end is one line of the diagnostic log, `<key> ended (<code>)` (`extension.ts:191`). The command shows *Bridge open to …* (`:462`) after it has started the check (`:455`), so that message is on the screen when the check speaks | read |
| L7 | Both builders take the option and hand it to `hostKeyWords` (E1.S1): `BridgeOptions.knownHostsFile` (`sshBridge.ts:83`, read at `:228`), and `SshExecOptions.knownHostsFile` (`sshExecCommand.ts:10`). After the merge of PR #365 `buildSshExecArgv` asks `execHostKeyWords` (`sshExecCommand.ts:143-148`, called at `:221`): a call with `bridged: true` gets one word from its `pinned` option and no file word; every other call gets `hostKeyWords(options.knownHostsFile)`. The three roads name neither `bridged` nor `configFile` nor `pinned`, so they are "off a bridge" in that sense and get the six words. `buildSshExecArgv` takes its options as the fifth argument, `buildBridgeArgv` as the second | read |
| L8 | `commands/agentCommands.ts` opens with a file-wide `eslint-disable complexity, max-lines-per-function` (`:1-3`), so a branch in a handler is allowed; `max-lines` (800) holds. The compiler refuses a parameter that is not read (`TS6133`): measured, when the sweep's argv call drops the option and the parameter stays (W1a) | the file; a scratch copy |
| L9 | **Measured by hand, the real `ssh` against a real `sshd`** (OpenSSH 10.2p1 on both ends, Ubuntu `1:10.2p1-2ubuntu3.8`, loopback, one user, an `sshd -D -e` unpacked without root; the client with `-F none` unless the row names a config, the six words of a pinned call, `ConnectTimeout=10`, G2's two options). **(a)** The pin file holds ANOTHER key: exit code 255, no stdout, 15 lines on stderr, the last two `Host key for [127.0.0.1]:<port> has changed and you have requested strict checking.` and `Host key verification failed.`. The same 15 lines with the words of a password call (`NumberOfPasswordPrompts=1` in place of `BatchMode=yes`). **(b) `ssh` ends its own lines with CR LF, also on Linux**; one of the 15 lines ends with LF alone ("The fingerprint for the ED25519 key sent by the remote host is"). **(c)** The pin file holds no key for the host (`/dev/null`, E1.S1's file for a path it cannot name): exit code 255, two lines, `No ED25519 host key is known for [127.0.0.1]:<port> and you have requested strict checking.` and the verification line. **(d)** The right pin, a login that the server refuses (a key it does not know; a wrong password through `SSH_ASKPASS`): exit code 255, ONE line, `<user>@<host>: Permission denied (publickey,password).`, and no verification line. **(e)** A port where nothing listens: exit code 255, `ssh: connect to host 127.0.0.1 port 1: Connection refused`. **(f)** An address that does not answer (`ConnectTimeout=3`): exit code 255, `ssh: connect to host <address> port 22: Connection timed out`. **(g)** A config with `LogLevel`, the pin file with another key: `QUIET` prints NOTHING (exit code 255, stderr empty); `FATAL` prints the verification line alone; `ERROR`, `INFO`, `VERBOSE` the 15 lines; `DEBUG` 34 lines, and the verification line is still a whole line with no prefix. **(h)** A config whose `ProxyJump` names a hop, the hop's key refused by the hop's own known-hosts file, the destination's pin right: exit code 255, the same 15 lines (printed by the nested `ssh`), and one more line after them, `Connection closed by UNKNOWN port 65535`. **(i)** The right pin and an accepted login whose remote command writes `Host key verification failed.` to its stderr and exits with 255: that one line (ending with LF alone), exit code 255. **(j)** The same with the words inside a longer line and exit code 0: the line as the command wrote it | by hand; the script and its folder are not kept |
| L10 | **Measured on a scratch copy of the repository at `3b5008d3`** (`git archive`, the shared rules and `node_modules` linked in). The copy was edited and compiled, not the repository; not kept. Node 26.12.1, Linux. Everything below was measured a first time before the merge, on `aad8b8ba`, and gave the same texts and the same red sets; the numbers here are those of `3b5008d3` (that run ended in the first hour of 2026-11-18). (a) The test file of §4 compiles on the product of `3b5008d3` (`tsc` exit 0). (b) There it has 37 tests: 24 fail with the texts of §5, 13 pass (the guards T2g, T4d, T9c, T9d, T9e). (c) After §2 and §3: 37 of 37 pass; `personRoadsPin` 28, `personPin` 10, `writtenKey` 18, `personRoadsForgetKey` 15, `bridgeKeyHandoff` 9, `hostKeyWords` 18, `hostKeyPin` 10, `launchRoadScan` 10, `sshExecCommand` 31, `sshBridge` 46, `promptSites` 16 pass, and `noConnectionSharing` 8 of 9 (1 skipped: the test that runs only where `CI=true`). (d) `wc -l` of `commands/agentCommands.ts`: 797. `npm run typecheck`, `npm run lint` and `npm run ratchet`: exit 0. (e) The whole suite: 8206 tests, 8161 pass, 44 skipped, 1 fail. That one is the copy's own: `leftoversRunnerSweep.test.js` asks `git worktree list` of the copy, which is no git repository (the same failure as in the two specs before this one). Before the merge, on `aad8b8ba` with this story: 8043 tests, 8004 pass, 38 skipped, the same 1 fail. (f) The mutations of §8, each on the product of §2 and §3 | a scratch copy |
| L11 | What the tests of this story use, and what exists: the world of E1.S2 (`test/personRoadsWorld.ts`: `hostKey`, `storageDir`, `realForget`, `bridgeArgvs`, `runs[i].knownHosts` read at the moment of the run, `knownHostsOf`, `pinFiles`, `passwordLogin`, `TIMED_OUT`, `ran(stdout, exitCode, stderr)`); `valuesOf(argv, name)` of `test/pinnedArgv.ts` (E1.S1). `knownHostsOf` reads the value of `UserKnownHostsFile` bare or in double quotes, the two forms that `hostKeyWords` writes for a pin file. Neither file changes | the tests |
| L12 | The scans that read `commands/agentCommands.ts` and stay green with §3 (L10 c): `launchRoadScan.test.ts` (the three calls of `buildSshExecArgv` there name no `ownAgent`: still so), `noConnectionSharing.test.ts` (the places that start an `ssh` and that call a builder: the same functions), QS of `personRoadsPin.test.ts` (the three lines that open the guards are not touched), `promptSites.test.ts` (the two new messages have no button) | the tests |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.** A test result after a failed `tsc` is the result of old files.
2. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
3. `node $LP npm run typecheck`
4. `node $LP npm run lint`
5. `node $LP npm run ratchet` (it compiles first; this story changes no file of its baseline).
6. `npm test` — the full suite (it compiles first and lowers itself).

## 1. How sentence C is chosen

**The rule.** A run is a refused host key when two things both hold:

1. **The call is pinned:** the `knownHostsFile` of its ONE value is there. That value is there only when the entry has a saved
   host key and the guard wrote its file for this call (L2).
2. **`ssh` printed the line `Host key verification failed.`** on the stderr of that run, as a whole line. The text is split at
   CR LF and at LF, because `ssh` ends its own lines with CR LF (L9 b).

Nothing else is asked: not the exit code, not the stdout, not whether the run timed out. One pure function answers it,
`hostKeyRefused(pinFile, stderr)` in `hostKeyPin.ts`, and two places call it.

| Road | The run that is asked | A refused host key of a pinned call | Every other run |
|---|---|---|---|
| *Install creds on host* | the probe, the first run (`:273`) | ONE error message: sentence C as it is. The road returns: no warning, no question, no second run | as today |
| *Install creds on host* | the install run (`:305`) is NOT asked | the sentence of today, `Could not install on "<name>": the installer produced no result and exited 255.` (§3.5) | as today |
| the socket check | the mode check, its second run (`:209`) | ONE error message, `The bridge to "<name>" is not open: ` + sentence C; the same text as one line of the log (area `bridge`). The check returns before it reads the stdout | as today |
| the socket check | the sweep is NOT asked: nobody reads its answer (L3) | nothing | as today |
| *Open Remote Bridge…* | cannot be asked: its `ssh` has no stdio (L6) | nothing of its own: its `ssh` ends (255), the row goes back to *Open Remote Bridge…*, and the socket check speaks | as today |

**Sentence C** (§3.5; `<name>` is the entry's name):

```text
"<name>" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.
```

**Why each part is as it is.**

- **"Pinned" is half of the condition, and it comes from the value, not from the entry.** An unpinned entry has no saved key
  to speak of, so it keeps the sentences of today whatever `ssh` printed (§3.5). The road does not read `hostKey` again: it asks
  about the file that its own `ssh` was given. A call whose pin was refused never gets here (E1.S2: no `ssh` starts).
- **A whole line, not the words anywhere.** The stderr of a run also holds what the remote command wrote (L5). A whole line
  keeps a remote text that only quotes the words from reading as a refusal (L9 j). It is the parent's wording: "holds OpenSSH's
  line".
- **CR LF.** Measured (L9 b). A match that splits at LF alone finds `Host key verification failed.\r` and never matches: W9
  turns four tests red. The fixtures of the tests are the measured text, with its CR LF.
- **No exit code in the condition.** The parent names the pin and the line. Exit code 255 is also what a refused login and a
  host that is down give (L9 d, e), so it adds nothing that the line does not say.
- **The check asks before it reads the stdout.** A refused host key has an empty stdout, which `interpretSocketProbe` reads as
  `unreadable`: today's log line "is there, but its mode could not be read" (the parent's F4). W16 puts the branch behind that
  reading and turns T9b red.
- **The install asks directly after the probe, before the timeout and the blocker.** The same reason: an empty stdout is the
  blocker "did not answer the probe". A run that the extension ended at its time limit has printed no such line; if it ever had,
  the line is still what `ssh` said.
- **The install shows sentence C as an ERROR message, with no opening.** The parent's table gives the bridge's form an opening
  and the install's none, and the sentence opens with the entry's name. An error, not the warning of the blocker it replaces:
  it is a refusal, as `Cannot reach "<name>": …` on the same road is (`:269`), and the bridge's form is an error too (P3).
- **The name.** The install says `node.name`, as every message of that handler does. The socket check has no row; it says
  `entity.name`, the name in the snapshot that the bridge handed it (`EntityMetadata.name` is a `string`).
- **What the match cannot tell apart, and what it misses** (measured, L9 g to i; accepted, each is in §12 and in *Notes for the
  lead*): a hop of the person's own `ProxyJump` whose key was refused, and a host that passed the check and prints the line
  itself, read as a refused key of the entry; `LogLevel QUIET` in the person's config hides the line, and the sentences of
  today are shown. In no case is a host said to be the saved one: sentence C says "did not connect", and a miss says what
  today says.

## 2. The product: `hostKeyPin.ts`

Directly above `export type PinVerdict` (`:190`), behind `oneFileWord`, this block, word for word, with one empty line before
it and one after:

```ts
/** The line that `ssh` ends with when the host's key did not pass its check. */
const HOST_KEY_REFUSED_LINE = 'Host key verification failed.';

/**
 * Whether one run of a PINNED call ended because `ssh` refused the host's key (G1, sentence C). Two things must both hold: the call
 * named a pin file, and `ssh` printed the line `Host key verification failed.` on its stderr, as a whole line.
 *
 * <p><b>Why "pinned" is half of it.</b> An unpinned call has no saved key to speak of: whatever its `ssh` printed, the person is
 * shown the sentences of before. A caller hands in the `knownHostsFile` of its call, which is there only for a pinned entry.</p>
 *
 * <p><b>Measured 2026-11-17</b>, OpenSSH 10.2p1 against a real `sshd` on the loopback, with the words of {@link hostKeyWords}. A
 * host with another key: exit code 255, 15 lines, the last one this line. A pin file that holds no key for the host: two lines, the
 * last one this line. `ssh` ends its own lines with CR LF, also on Linux, so the text is split at both. A host that is down
 * (`Connection refused`), a host that does not answer (`Connection timed out`) and a refused login (`Permission denied`) print no
 * such line. Windows' `ssh.exe` was not measured.</p>
 *
 * <p><b>What it cannot tell apart</b> (measured the same day): a hop of the person's own `ProxyJump` whose key `ssh` refused prints
 * the same line, and a host that passed the check can print it itself. Both read as a refused key of the entry. And it misses a
 * refusal when the person's config says `LogLevel QUIET`: `ssh` then prints nothing. A miss shows the sentences of before; it never
 * says that a host is the saved one.</p>
 */
export function hostKeyRefused(pinFile: string | undefined, stderr: string): boolean {
  return pinFile !== undefined && stderr.split(/\r?\n/).includes(HOST_KEY_REFUSED_LINE);
}

/**
 * Sentence C: `ssh` refused the host's key on a pinned entry. *Install creds on host* shows it as it is; the bridge socket check
 * opens it with `The bridge to "<name>" is not open: `. Its advice cannot end in an unchecked connection: with a saved key that
 * parses, Connect SSH keeps enforcing it, and asks before it replaces it.
 */
export function refusedHostKeySentence(name: string): string {
  return `"${name}" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.`;
}
```

**Why each part is as it is.**

- **In `hostKeyPin.ts`, beside `hostKeyWords`.** The stories document puts the match there; the module is pure and imports no
  `vscode`, so its truth table is a plain unit test (H1 to H5). The sentence stands beside the match so that
  `commands/agentCommands.ts` needs one import line for both, and E1.S4's smoke can read the sentence from the product.
- **`pinFile !== undefined` first.** For an unpinned call the text is not looked at.
- **`split(/\r?\n/).includes(…)`** is the whole-line test of §1. A line that is the words and a full stop, nothing more.
- **`refusedHostKeySentence(name)` builds sentence C and nothing else.** The opening of the bridge's form is the socket check's.
- **The docblock says what was measured and what is not told apart.** It claims nothing about Windows.

## 3. The product: `commands/agentCommands.ts`

### 3.1 The diff

Against the file of `3b5008d3` (784 lines; the same file as at `aad8b8ba`):

```diff
--- a/src_vs_code/src/commands/agentCommands.ts
+++ b/src_vs_code/src/commands/agentCommands.ts
@@ -22,8 +22,9 @@
 import { runSshExec } from '../sshExecRunner';
 import { describeError } from '../describeError';
 import { resolveExecAuth } from '../sshExecAuth';
-import { withWrittenKey, withWrittenKeyUntilExit } from '../writtenKey';
+import { ReadyCall, withWrittenKey, withWrittenKeyUntilExit } from '../writtenKey';
 import { writePersonPin } from '../personPin';
+import { hostKeyRefused, refusedHostKeySentence } from '../hostKeyPin';
 import { probeCommand, blockerFor, interpretProbe, confirmationFor, installCommand, interpretInstall } from '../remoteCliInstall';
 import { entityKey } from '../entityFlags';
 import { parseToken } from '../grantToken';
@@ -165,11 +166,12 @@
   async function sweepDeadSockets(
     entity: EntityMetadata,
     keyPath: string | undefined,
+    knownHostsFile: string | undefined,
     user: string,
     auth: SshExecAuth = 'key',
     sweepEnv: NodeJS.ProcessEnv = process.env,
   ): Promise<void> {
-    const argv = buildSshExecArgv(entity, keyPath, sweepCommand(user), auth);
+    const argv = buildSshExecArgv(entity, keyPath, sweepCommand(user), auth, { knownHostsFile });
     if (argv === undefined) {
       return;
     }
@@ -195,7 +197,7 @@
           return;
         }
         const keyPath = credential.keyPath;
-        const argv = buildSshExecArgv(entity, keyPath, modeCheckCommand(remote), credential.auth);
+        const argv = buildSshExecArgv(entity, keyPath, modeCheckCommand(remote), credential.auth, { knownHostsFile: credential.knownHostsFile });
         if (argv === undefined) {
           return;
         }
@@ -203,7 +205,7 @@
         // and nothing else does, so every dropped bridge leaves one behind. Swept here, AFTER the
         // new one is up: it is then live, and the sweep keeps anything still being listened on,
         // which is what stops it removing another window's working bridge.
-        await sweepDeadSockets(entity, keyPath, entity.user ?? '', credential.auth, credential.env);
+        await sweepDeadSockets(entity, keyPath, credential.knownHostsFile, entity.user ?? '', credential.auth, credential.env);
         // A moment for sshd to bind before asking about the file.
         await new Promise((resolve) => setTimeout(resolve, 1500));
         const outcome = await runSshExec(argv, {
@@ -211,6 +213,13 @@
           timeoutMs: 15_000,
           signal: agentServer.signal,
         });
+        if (hostKeyRefused(credential.knownHostsFile, outcome.stderr)) {
+          // The ssh of the bridge has no stdio, so this check is the one place that can say why the bridge is not open (G1, P3).
+          const text = `The bridge to "${entity.name}" is not open: ${refusedHostKeySentence(entity.name)}`;
+          log.info('bridge', text);
+          void vscode.window.showErrorMessage(text);
+          return;
+        }
         const probe = interpretSocketProbe(outcome.stdout ?? '');
         if (probe.kind === 'missing') {
           // The bridge is NOT up. This used to share a branch with "no stat on this host" and go
@@ -271,6 +280,10 @@
       }
 
       const facts = await runRemote(details, credential, probeCommand(), 20_000);
+      if (hostKeyRefused(credential.knownHostsFile, facts.stderr)) {
+        void vscode.window.showErrorMessage(refusedHostKeySentence(node.name));
+        return;
+      }
       if (facts.timedOut) {
         void vscode.window.showWarningMessage(
           `"${node.name}" did not answer within 20 seconds — the host may be unreachable.`,
@@ -322,11 +335,11 @@
   /** One non-interactive `ssh` with a resolved credential — the shape every caller here needs. */
   async function runRemote(
     entity: EntityMetadata,
-    credential: Extract<Awaited<ReturnType<typeof resolveExecAuth>>, { ok: true }>,
+    credential: ReadyCall,
     command: string,
     timeoutMs: number,
   ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
-    const argv = buildSshExecArgv(entity, credential.keyPath, command, credential.auth);
+    const argv = buildSshExecArgv(entity, credential.keyPath, command, credential.auth, { knownHostsFile: credential.knownHostsFile });
     if (argv === undefined) {
       return { stdout: '', stderr: 'its host is not a shape ssh can be given safely.', exitCode: -1, timedOut: false };
     }
@@ -426,7 +439,7 @@
       const remote = { path: remoteSocketPath(details.user ?? '', bridgeId(() => crypto.randomUUID())) };
       const argv = buildBridgeArgv(
         details,
-        { port: parsed.port, remote, keyPath, auth: credential.auth },
+        { port: parsed.port, remote, keyPath, auth: credential.auth, knownHostsFile: credential.knownHostsFile },
         isSafeSshTarget,
       );
       if (argv === undefined) {
```

### 3.2 In words

1. **The imports.** The line of `../writtenKey` gains the type `ReadyCall`. One new line behind the import of `writePersonPin`:
   the two functions of §2.
2. **`sweepDeadSockets`** gets the parameter `knownHostsFile: string | undefined`, directly behind `keyPath`: the two files of
   the call side by side. It is required, so the one caller cannot leave it out; an argument in the wrong place does not compile
   (`user` is a `string`). Its argv call names it: `{ knownHostsFile }`.
3. **The socket check.** The argv of the mode check names `{ knownHostsFile: credential.knownHostsFile }`, and the call of the
   sweep hands the same word on. So both runs read ONE file, the check's own. Behind the run of the mode check and before
   `interpretSocketProbe`, the branch: when `hostKeyRefused(credential.knownHostsFile, outcome.stderr)`, the text is built once,
   written to the log (`log.info('bridge', text)`) and shown (`showErrorMessage(text)`), and the check returns. The comment line
   says why this check speaks for the bridge.
4. **The install.** Directly behind the probe, the branch: when `hostKeyRefused(credential.knownHostsFile, facts.stderr)`, the
   road shows `refusedHostKeySentence(node.name)` as an error and returns.
5. **`runRemote`** takes a `ReadyCall` in place of the ok half of the answer of the resolve (the ready value has every field of
   it, and `knownHostsFile`), and its argv call names `{ knownHostsFile: credential.knownHostsFile }`. So the probe and the
   install run read ONE file, the install's own. Its two callers do not change: they hand it `credential`, which is a
   `ReadyCall` behind the `ok` test.
6. **The bridge.** The options of `buildBridgeArgv` gain `knownHostsFile: credential.knownHostsFile`. The socket check that
   follows gets no path from the bridge: it writes its own pin file from the same snapshot (E1.S2).

Nothing else changes in the file. The three lines that open the guards stay as E1.S2 wrote them (QS reads them).

### 3.3 The line count

| Step | Lines | How |
|---|---|---|
| `3b5008d3` (E1.S2 built, `main` merged in) | 784 | L1 |
| after this story | **797** | +1 the import of the two functions; +1 the parameter of `sweepDeadSockets`; +7 the branch of the socket check (the `if`, its comment, the text, the log, the message, the `return`, the brace); +4 the branch of the install. The four argv calls, the call of the sweep, the type of `runRemote` and the import of `ReadyCall` change lines that exist |

13 lines, where the parent's §3.6 counted "about 12" for the whole of E1. Three lines are left below lint's 800. Measured: `wc -l`
says 797 and `npm run lint` is clean (L10 d). The longest new line has 145 characters; lint has no line-length rule.

### 3.4 What a person sees on each road after this story

| The entry and the host | The install | The bridge and its socket check |
|---|---|---|
| unpinned, any host | as today; all runs say `accept-new` | as today |
| pinned, the host presents the pinned key | as today; both runs say the six words with the install's pin file | as today; the tunnel says the six words with its file, the two runs of the check with the check's file |
| pinned, the host presents ANOTHER key | the probe's `ssh` refuses; ONE error message, sentence C; no question; nothing is installed | the tunnel's `ssh` ends (255), the row goes back to *Open Remote Bridge…*; *Bridge open to …* was shown before; then ONE error message of the socket check, `The bridge to "<name>" is not open: ` + sentence C, and the same line in the log |
| pinned, the host is down, does not answer, or refuses the login | as today: `Cannot install on "<name>": the host did not answer the probe, …`, or the time-limit warning | as today: no message of the check; its log line about a mode that could not be read |
| pinned, the saved key cannot be used, or its file cannot be written | E1.S2: `Cannot reach "<name>": ` + sentence A or B; no `ssh` | E1.S2: `Cannot bridge to "<name>": ` + sentence A or B; no `ssh` |

## 4. Scenarios

Each row is one test, or one group of tests with one name. "RED" is the text of the first assertion that fails on the product
of `3b5008d3`. A guard is green before and after; a mutation of §8 proves it.

### 4.1 The rows

The real `registerAgentCommands` over the world of E1.S2. `materializeKnownHosts` and `forgetMaterializedKey` are the real ones
(`realForget`), in a real storage folder of `ownedDir`. Every login is a password login, so no key file is written and every
known-hosts file of the folder is a pin file. The texts that the stand-in of `ssh` answers are the measured ones of L9, with
`box.example` as the host and with their CR LF.

| Id | Setup and action | Expected | RED on `3b5008d3` |
|---|---|---|---|
| H1 | `hostKeyRefused` with a pin file, on five texts: another key (L9 a), no key for the host (L9 c), the line alone (L9 g, `FATAL`), the 15 lines with LF alone, the line with no line end | `true`, five times | `hostKeyPin.ts exports no hostKeyRefused` |
| H2 | the same function with NO pin file, on three of those texts | `false`, three times | the same |
| H3 | with a pin file, on six texts: a host that is down (L9 e), a refused login (L9 d), no answer (L9 f), no text, the words inside a longer line (L9 j), the words with no full stop | `false`, six times | the same |
| H4 | with a pin file: the text of a hop (L9 h), and the line as a remote command writes it (L9 i) | `true`, twice: what the match cannot tell apart, held as it is | the same |
| H5 | `refusedHostKeySentence('box')` | sentence C, word for word, as a literal | `hostKeyPin.ts exports no refusedHostKeySentence` |
| T1 (2 tests; the parent's Definition of Done, item 1) | a pinned entry; *Open Remote Bridge…*, its socket check to the end, then *Install creds on host* answered yes; once in a plain storage folder, once in a folder `Application Support` | five argvs; each says `StrictHostKeyChecking=yes` once, and ONE word as `UserKnownHostsFile` and as `GlobalKnownHostsFile`; the word is the path as it is, or in double quotes when the path holds a space; at each of the four runs the file was on the disk with the line of the entry; the two runs of the check name one file, the two of the install one file, three files in all; no error message | `T1: a run of a pinned entry does not check the host's key against the saved one` — `['accept-new']` is not `['yes']` (both) |
| T2 (5 tests; the parent's test 2) | a pinned entry; the bridge and its socket check; the runs answer `600`, `missing`, nothing, `644`, or throw | two runs; each names a pin file of ONE call (`known_hosts-e1-<uuid>` in the key folder of the window) that was on the disk with the line of the entry when the run started; both name the SAME file; it is not the file that the bridge's argv names; after the check exactly the bridge's file is left | `T2: the sweep does not check the host's key against the saved one` (all five) |
| T2g (guard; the parent's test 2, "no argv") | a pinned entry; `buildSshExecArgv` answers no argv | the bridge is started; no run; one pin file is left (the bridge's), none after its `ssh` has ended | green |
| T3 (5 tests; the parent's test 3) | a pinned entry; the install; a success, a failed install, a probe that times out, a host that cannot be installed to, the person says no | the runs that N16 lists for each way out (2, 2, 1, 1, 1); every run names a pin file of one call that was on the disk with the line of the entry; all runs of one install name the SAME file; no known-hosts file is left | `T3: the probe does not check the host's key against the saved one` (all five) |
| T3q (the parent's test 3, the question) | a pinned entry; the probe answers; the question throws | the same error reaches the caller; while the question was open, the folder held exactly the file that the probe's argv named; none is left | `T3q: the probe does not check the host's key against the saved one` |
| T4a (the parent's test 4) | a pinned entry; *Open*; *Close Remote Bridge*; then the test ends the process | the argv handed to the spawner names a pin file of one call, on the disk with the line of the entry after the command returned; it is the only known-hosts file; after *Close* the same file with the same text; after the end none | `T4a: the bridge does not check the host's key against the saved one` |
| T4b (the parent's test 4, a replacement) | two *Opens* of one pinned entry that overlap, as N16's B4 | two argvs, two different pin files; the end of the first process leaves exactly the second file, with its text; the end of the window leaves none | `T4b: the first bridge does not check the host's key against the saved one` |
| T4c (the parent's test 4, a throwing start) | a pinned entry; a spawner that records its argv and throws | the same error reaches the caller; the argv it was handed names a file that was on the disk with the line of the entry at that moment; no bridge; no file is left | `T4c: the bridge does not check the host's key against the saved one` |
| T4d (guard; the parent's test 4, "no argv" and "a throw while the argv is built") | a pinned entry; `buildBridgeArgv` answers no argv; in a second window it throws | the warning "cannot be bridged"; the same error; no bridge in either; no file is left | green |
| T9a (the parent's test 9, the install) | a pinned entry; the probe answers exit code 255 and the text of L9 (a); the question would be answered yes | the errors are exactly `[sentence C]`; no warning at all; one run; no question; no file is left | `T9a: the refused host key was not told to the person` — `[]` is not the one sentence |
| T9b (the parent's test 9, the bridge; P3) | a pinned entry; *Open Remote Bridge…*; the test ends the tunnel with 255, as a refused `ssh` ends; both runs of the check answer exit code 255 and the text of L9 (a) | two runs; the errors are exactly `[The bridge to "box" is not open: ` + sentence C`]`; the log holds that line once; no log line about a mode that could not be read; the bridge is not open; no file is left | `T9b: the refused host key of the bridge was not shown as ONE error message of the socket check` — `[]` is not the one sentence |
| T9c (guard, 5 tests; the parent's test 9, the guards) | the install; an UNPINNED entry with the text of L9 (a); a pinned entry with the texts of L9 (e), (d), (f), each with exit code 255; a pinned entry whose run the extension ended at its time limit | no error message; exactly one warning: "did not answer the probe" for the first four, "did not answer within 20 seconds" for the last | green |
| T9d (guard, 5 tests) | the socket check, the same five | two runs; no error message; the log line about a mode that could not be read | green |
| T9e (guard; §3.5, "the install's second run keeps today's sentence") | a pinned entry; the probe answers; the install run answers exit code 255 and the text of L9 (a) | the errors are exactly `[Could not install on "box": the installer produced no result and exited 255.]` | green |
| T11 (the parent's test 11, a scan that stays) | the syntax tree of `commands/agentCommands.ts` | the calls of the two builders are exactly four, `buildBridgeArgv in registerAgentCommands`, `buildSshExecArgv in runRemote`, `… in sweepDeadSockets`, `… in verifyBridgeSocket`; each has an object among its arguments that names `knownHostsFile` | `T11: an argv call of the three roads names no knownHostsFile, so its ssh would not read the pin of the entry` — the four sites are not `[]` |

T11 has two assertions. The first, "the four calls are found", keeps the scan from passing by matching nothing; it is green on
`3b5008d3`, and the second is red there. In every RED of T1 to T4 the road ran on the unchanged product as the row says (the
bridge started, the check ran twice, the install asked): what is missing is the pin in the argv.

**Why T2g and T4d are guards and not RED.** On a way out that builds no argv there is nothing for this story to change: that
the pin file is deleted there is the guard of E1.S2. They are here because the parent's tests 2 and 4 list these ways out, and
because this story edits the calls beside them.

### 4.2 New `test/personRoadsHostKey.test.ts`

The whole file, as measured (37 tests, 469 lines). Written FIRST, on the product of `3b5008d3`, and watched there (§5).

```ts
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test, TestContext } from 'node:test';
import * as ts from 'typescript';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import * as hostKeyPin from '../hostKeyPin';
import { materializedKeysDir } from '../materializedKeys';
import * as realBridge from '../sshBridge';
import type { SshExecOutcome } from '../sshExecRunner';
import { KEY, Parts, TIMED_OUT, World, click, knownHostsOf, passwordLogin, pinFiles, ran, settled, world } from './personRoadsWorld';
import { valuesOf } from './pinnedArgv';

/**
 * G1, E1.S3: the three roads of the person hand the pin file of their call to `ssh`, and a host key that `ssh` refused is told to
 * the person. The bridge socket check, *Install creds on host* and *Open Remote Bridge…* are driven as the extension registers
 * them, over the world of `personRoadsWorld.ts`.
 *
 * <p><b>Part 1</b> is the match and the sentence alone (`hostKeyPin.ts`). <b>Part 2</b> is what each of the five runs is SENT: strict
 * checking and ONE file of the call as both known-hosts files, the file on the disk with the line of the entry at the moment of the
 * run. <b>Part 3</b> is sentence C, and the runs that must NOT be told as a refused host key. <b>Part 4</b> is the list of the argv
 * calls.</p>
 *
 * <p>`materializeKnownHosts` and `forgetMaterializedKey` are the real ones, in a real storage folder that this file owns. The runner
 * and the spawner are stand-ins: no `ssh` starts. The texts that the stand-in answers were printed by a real `ssh` (OpenSSH 10.2p1,
 * against a real `sshd` on the loopback, 2026-11-17). That a real `ssh` refuses a host with another key is not shown by any test of
 * this file: the smoke of E1.S4 and E2 show it.</p>
 */

const scope = cleanupScope();
after(() => scope.close());

const HOST_KEY = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' };
const PIN = hostKeyPin.formatHostKey(HOST_KEY);
const PIN_LINE = hostKeyPin.knownHostsLine('box.example', undefined, HOST_KEY);
/** The name of a pin file of one call: the entry's id and a uuid. */
const CALL_PIN = /^known_hosts-e1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const PROBE_OK = 'creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n';
const INSTALLED = 'creds-install: installed /home/dev/.local/bin/creds\n';

const SENTENCE_C =
  '"box" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.';
const BRIDGE_NOT_OPEN = `The bridge to "box" is not open: ${SENTENCE_C}`;

/** The lines of a real `ssh` as it prints them: it ends its own lines with CR LF, also on Linux. */
const printed = (...lines: string[]): string => lines.map((line) => `${line}\r\n`).join('');

/** The host presents a key that is not the pinned one: 15 lines, exit code 255. The line of the fingerprint ends with LF alone. */
const REFUSED_KEY = printed(
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
  '@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @',
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
  'IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!',
  'Someone could be eavesdropping on you right now (man-in-the-middle attack)!',
  'It is also possible that a host key has just been changed.',
  'The fingerprint for the ED25519 key sent by the remote host is\nSHA256:LffarYzG0qeh+MC4Rg4fmMufJMJIjrjBIuqoQgUO2YE.',
  'Please contact your system administrator.',
  'Add correct host key in /storage/keys/4242/known_hosts-e1-0b6f3c1e to get rid of this message.',
  'Offending ED25519 key in /storage/keys/4242/known_hosts-e1-0b6f3c1e:1',
  '  remove with:',
  "  ssh-keygen -f '/storage/keys/4242/known_hosts-e1-0b6f3c1e' -R 'box.example'",
  'Host key for box.example has changed and you have requested strict checking.',
  'Host key verification failed.',
);
/** The pin file holds no key for the host (E1.S1's file for a path that cannot be named). */
const NO_KEY_KNOWN = printed('No ED25519 host key is known for box.example and you have requested strict checking.', 'Host key verification failed.');
/** A person's config says `LogLevel FATAL`: the one line is all that is printed. */
const ONLY_THE_LINE = printed('Host key verification failed.');
const HOST_DOWN = printed('ssh: connect to host box.example port 22: Connection refused');
const LOGIN_REFUSED = printed('dev@box.example: Permission denied (publickey,password).');
const NO_ANSWER = printed('ssh: connect to host box.example port 22: Connection timed out');
/** A hop of the person's own `ProxyJump` whose key `ssh` refused: the nested `ssh` prints the same line, the outer one a line more. */
const HOP_REFUSED = `${REFUSED_KEY}${printed('Connection closed by UNKNOWN port 65535')}`;

const yes = (_message: string, rest: readonly unknown[]): string | undefined => rest.find((one): one is string => typeof one === 'string');

/** A real storage folder of one test: owned, and removed when this file's tests end. */
const storage = (what: string): string => ownedDir(scope, what);

/** Open a bridge and let its socket check run to its end: the check waits 1.5 s on a timer between its two runs. */
async function bridged(t: TestContext, parts: Parts): Promise<World> {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = world(parts);
  await click(w, 'openRemoteBridge');
  await settled();
  t.mock.timers.tick(1500);
  await settled();
  return w;
}

/** A pinned entry with a password login, in a real storage folder: no key file, so every known-hosts file of the folder is a pin file. */
const pinned = (dir: string, parts: Parts = {}): Parts => ({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin(), passwordLogin()], checks: [passwordLogin()], ...parts });

/* --- part 1: the match and the sentence --- */

/** An export of `hostKeyPin.ts`, read through the module object: this file compiles before the export exists, so its absence is a failed assertion. */
function exported<T>(name: string): T {
  const found = (hostKeyPin as Record<string, unknown>)[name];
  assert.equal(typeof found, 'function', `hostKeyPin.ts exports no ${name}`);
  return found as T;
}

type Match = (pinFile: string | undefined, stderr: string) => boolean;

const A_PIN_FILE = '/storage/keys/4242/known_hosts-e1-0b6f3c1e';

test('H1: a refused host key is a PINNED call whose ssh printed the line "Host key verification failed."', () => {
  const hostKeyRefused = exported<Match>('hostKeyRefused');

  assert.equal(hostKeyRefused(A_PIN_FILE, REFUSED_KEY), true, 'the text of a host with another key');
  assert.equal(hostKeyRefused(A_PIN_FILE, NO_KEY_KNOWN), true, 'the text of a pin file that holds no key for the host');
  assert.equal(hostKeyRefused(A_PIN_FILE, ONLY_THE_LINE), true, 'the line alone');
  assert.equal(hostKeyRefused(A_PIN_FILE, REFUSED_KEY.replaceAll('\r\n', '\n')), true, 'lines that end with LF alone');
  assert.equal(hostKeyRefused(A_PIN_FILE, 'Host key verification failed.'), true, 'the line with no line end');
});

test('H2: an unpinned call is never a refused host key, whatever ssh printed', () => {
  const hostKeyRefused = exported<Match>('hostKeyRefused');

  for (const stderr of [REFUSED_KEY, NO_KEY_KNOWN, ONLY_THE_LINE]) {
    assert.equal(hostKeyRefused(undefined, stderr), false);
  }
});

test('H3: a host that is down, a refused login, a host that does not answer, no text, and the words inside another line are no refused host key', () => {
  const hostKeyRefused = exported<Match>('hostKeyRefused');

  for (const stderr of [HOST_DOWN, LOGIN_REFUSED, NO_ANSWER, '', printed('note: Host key verification failed. earlier'), printed('Host key verification failed')]) {
    assert.equal(hostKeyRefused(A_PIN_FILE, stderr), false, stderr);
  }
});

test('H4: what the match cannot tell from a refused host key of the entry: a hop of the person\'s own config, and a host that prints the line itself', () => {
  const hostKeyRefused = exported<Match>('hostKeyRefused');

  assert.equal(hostKeyRefused(A_PIN_FILE, HOP_REFUSED), true);
  assert.equal(hostKeyRefused(A_PIN_FILE, 'Host key verification failed.\n'), true);
});

test('H5: sentence C, word for word', () => {
  const refusedHostKeySentence = exported<(name: string) => string>('refusedHostKeySentence');

  assert.equal(refusedHostKeySentence('box'), SENTENCE_C);
});

/* --- part 2: what the five runs are sent --- */

/** The word that a pinned argv gives as its known-hosts file: strict checking, and ONE word in each of the two options, the same word. */
function pinWordOf(argv: readonly string[], what: string): string {
  assert.deepEqual(valuesOf(argv, 'StrictHostKeyChecking'), ['yes'], `${what} does not check the host's key against the saved one`);
  const words = [...valuesOf(argv, 'UserKnownHostsFile'), ...valuesOf(argv, 'GlobalKnownHostsFile')];
  assert.equal(words.length, 2, `${what} does not name one known-hosts file in each of the two options: ${words.join(' | ')}`);
  assert.equal(words[1], words[0], `${what} names two different known-hosts files`);
  return words[0];
}

/** The file that a pinned argv names, which must be a pin file of ONE call in this window's key folder of `dir`. */
function callPinOf(argv: readonly string[], dir: string, what: string): string {
  const file = pinWordOf(argv, what);
  assert.equal(path.dirname(file), materializedKeysDir(dir), `${what}: the pin file is not in the key folder of this window`);
  assert.match(path.basename(file), CALL_PIN, `${what}: the pin file is not a file of one call`);
  return file;
}

/** The pin file that an argv names, which must be on the disk NOW with the line of the entry. */
function pinFileOf(argv: readonly string[], dir: string, what: string): string {
  const file = callPinOf(argv, dir, what);
  assert.deepEqual(knownHostsOf(argv), { file, text: PIN_LINE }, `${what}: the pin file is not on the disk with the line of the entry`);
  return file;
}

/** The pin file of one run, which must have been on the disk with the line of the entry at the moment the run started. */
function pinFileOfRun(run: World['runs'][number], dir: string, what: string): string {
  const file = callPinOf(run.argv, dir, what);
  assert.deepEqual(run.knownHosts, { file, text: PIN_LINE }, `${what}: the pin file was not on the disk with the line of the entry when the run started`);
  return file;
}

for (const [label, folder] of [['a plain storage folder', undefined], ['a storage folder whose path holds a space', 'Application Support']] as const) {
  test(`T1: all five runs of a pinned entry, ${label}: strict checking, one pin file as both known-hosts files, and three files for the three calls`, async (t) => {
    const dir = path.join(storage('t1'), folder ?? '.');
    fs.mkdirSync(dir, { recursive: true });
    const answers = ['', '600', PROBE_OK, INSTALLED];
    const w = await bridged(t, pinned(dir, { answer: yes, run: (index) => ran(answers[index]) }));
    await click(w, 'installRemoteCli');

    const argvs = [...w.bridgeArgvs, ...w.runs.map((one) => one.argv)];
    assert.equal(argvs.length, 5, `the five runs did not all start (the bridge, the sweep, the mode check, the probe, the install): ${argvs.length}`);
    const words = argvs.map((argv) => pinWordOf(argv, 'T1: a run of a pinned entry'));
    const files = w.runs.map((one) => one.knownHosts);
    assert.deepEqual(words.slice(1), files.map((one) => (folder === undefined ? one?.file : `"${one?.file}"`)), 'T1: a path with a space is not ONE quoted word, or a path with none is not written as it is');
    assert.deepEqual(files.map((one) => one?.text), [PIN_LINE, PIN_LINE, PIN_LINE, PIN_LINE], 'T1: a run started before its pin file was on the disk with the line of the entry');
    assert.deepEqual([words[1] === words[2], words[3] === words[4], new Set(words).size], [true, true, 3], 'T1: the check and the install do not each keep ONE file, or two calls share a file');
    assert.deepEqual(w.errors, [], `T1: a pinned entry whose host answers was refused: ${w.errors.join(' | ')}`);
  });
}

const boom = (): never => {
  throw new Error('spawn ssh ENOENT');
};

/** The ways out of the socket check that run its two `ssh` (N16's list), by what the runs answer. */
const CHECK_ENDS: readonly { label: string; run: NonNullable<Parts['run']> }[] = [
  { label: 'a normal check', run: () => ran('600') },
  { label: 'a missing socket', run: () => ran('missing') },
  { label: 'a mode that cannot be read', run: () => ran('') },
  { label: 'a socket wider than 600', run: () => ran('644') },
  { label: 'runs that throw', run: boom },
];

for (const end of CHECK_ENDS) {
  test(`T2: the socket check of a pinned entry, ${end.label}: both runs name the SAME pin file of the check, and it is gone after the check`, async (t) => {
    const dir = storage('t2');
    const w = await bridged(t, pinned(dir, { run: end.run }));

    assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
    const sweep = pinFileOfRun(w.runs[0], dir, 'T2: the sweep');
    const modeCheck = pinFileOfRun(w.runs[1], dir, 'T2: the mode check');
    assert.equal(modeCheck, sweep, 'T2: the two runs of the check name two pin files');
    const ofBridge = pinFileOf(w.bridgeArgvs[0], dir, 'T2: the bridge');
    assert.notEqual(sweep, ofBridge, 'T2: the check reads the pin file of the bridge and not one of its own');
    assert.deepEqual(pinFiles(dir), [path.basename(ofBridge)], 'T2: the check left its pin file, or deleted the pin file of the bridge');
  });
}

test('T2g (guard): a socket check that gets no argv starts no ssh and leaves no pin file of its own', async (t) => {
  const dir = storage('t2g');
  const w = await bridged(t, pinned(dir, { noExecArgv: true }));

  assert.equal(w.children.length, 1, `no bridge was started: ${w.errors.join(' | ')}`);
  assert.equal(w.runs.length, 0, 'a run started with no argv');
  assert.equal(pinFiles(dir).length, 1, 'T2g: the check left its pin file, or deleted the pin file of the bridge');
  w.children[0].end(0);
  await settled();
  assert.deepEqual(pinFiles(dir), []);
});

/** The ways out of the install (N16's list), by what its runs and its question answer, and how many runs each has. */
const INSTALL_ENDS: readonly { label: string; runs: number; parts: Parts }[] = [
  { label: 'a success', runs: 2, parts: { answer: yes, run: (index) => ran(index === 0 ? PROBE_OK : INSTALLED) } },
  { label: 'a failed install', runs: 2, parts: { answer: yes, run: (index) => (index === 0 ? ran(PROBE_OK) : ran('', 22, 'curl: (22) The requested URL returned error: 404')) } },
  { label: 'a probe that times out', runs: 1, parts: { run: () => TIMED_OUT } },
  { label: 'a host that cannot be installed to', runs: 1, parts: { run: () => ran('creds=-\narch=x86_64\nos=Darwin\nget=/usr/bin/curl\n') } },
  { label: 'the person says no', runs: 1, parts: { run: () => ran(PROBE_OK) } },
];

for (const end of INSTALL_ENDS) {
  test(`T3: the install of a pinned entry, ${end.label}: every run names the SAME pin file of the install, and it is gone after`, async () => {
    const dir = storage('t3');
    const w = world(pinned(dir, end.parts));
    await click(w, 'installRemoteCli');

    assert.equal(w.runs.length, end.runs, `the install did not run ${end.runs} ssh: ${w.runs.length}`);
    const files = w.runs.map((run, i) => pinFileOfRun(run, dir, i === 0 ? 'T3: the probe' : 'T3: the install run'));
    assert.deepEqual(files, files.map(() => files[0]), 'T3: the probe and the install run name two pin files');
    assert.deepEqual(pinFiles(dir), [], 'T3: the install left its pin file');
  });
}

test('T3q: the pin file that the probe named is on the disk while the question is open; a question that throws deletes it, and the same error goes on', async () => {
  const dir = storage('t3q');
  const failure = new Error('the window is closing');
  const atQuestion: string[][] = [];
  const w = world(pinned(dir, { run: () => ran(PROBE_OK), answer: () => { atQuestion.push(pinFiles(dir)); throw failure; } }));

  await assert.rejects(click(w, 'installRemoteCli'), (error) => error === failure);

  assert.equal(w.runs.length, 1);
  const probe = pinFileOfRun(w.runs[0], dir, 'T3q: the probe');
  assert.deepEqual(atQuestion, [[path.basename(probe)]], 'T3q: the pin file of the probe was not the one on the disk while the question was open');
  assert.deepEqual(pinFiles(dir), [], 'T3q: the install left its pin file');
});

test('T4a: the argv of a pinned bridge names the pin file of the bridge; Close deletes nothing; the file goes when the ssh has ended', async () => {
  const dir = storage('t4a');
  const w = world(pinned(dir, { checks: [] }));
  await click(w, 'openRemoteBridge');
  await settled();

  assert.equal(w.bridgeArgvs.length, 1, `no bridge was started: ${w.errors.join(' | ')}`);
  const file = pinFileOf(w.bridgeArgvs[0], dir, 'T4a: the bridge');
  assert.deepEqual(pinFiles(dir), [path.basename(file)], 'T4a: the folder holds another known-hosts file than the one the bridge reads');

  await click(w, 'closeRemoteBridge');
  await settled();
  assert.deepEqual(knownHostsOf(w.bridgeArgvs[0]), { file, text: PIN_LINE }, 'T4a: Close deleted the pin file of an ssh that has not ended');

  w.children[0].end(null);
  await settled();
  assert.deepEqual(pinFiles(dir), [], 'T4a: the bridge ended and its pin file stays');
});

test('T4b: a bridge that REPLACES another: each argv names its own pin file; the first goes when the first ssh ends, the second stays with its bridge', async () => {
  const dir = storage('t4b');
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const w = world(pinned(dir, { checks: [], resolveGate: gate }));
  const both = [click(w, 'openRemoteBridge'), click(w, 'openRemoteBridge')];
  await settled();
  release();
  await Promise.all(both);
  await settled();

  assert.equal(w.bridgeArgvs.length, 2, 'the two Opens did not start two bridges');
  const first = pinFileOf(w.bridgeArgvs[0], dir, 'T4b: the first bridge');
  const second = pinFileOf(w.bridgeArgvs[1], dir, 'T4b: the second bridge');
  assert.notEqual(second, first, 'T4b: two bridges share one pin file');
  assert.equal(w.children[0].killed, 1, 'the second start did not replace the first');

  w.children[0].end(null);
  await settled();
  assert.deepEqual(pinFiles(dir), [path.basename(second)], 'T4b: the end of the replaced bridge did not delete exactly its own pin file');
  assert.deepEqual(knownHostsOf(w.bridgeArgvs[1]), { file: second, text: PIN_LINE });

  w.bridges.dispose();
  w.children[1].end(null);
  await settled();
  assert.deepEqual(pinFiles(dir), [], 'T4b: the window ended and the second pin file stays');
});

test('T4c: a start that throws was handed an argv that names the pin file; the file is deleted at once, and the same error goes on', async () => {
  const dir = storage('t4c');
  const failure = new Error('spawn EACCES');
  const handed: { argv: readonly string[]; pin: ReturnType<typeof knownHostsOf> }[] = [];
  const spawn = (_command: string, argv: readonly string[]): never => {
    handed.push({ argv, pin: knownHostsOf(argv) });
    throw failure;
  };
  const w = world(pinned(dir, { checks: [], spawn }));

  await assert.rejects(click(w, 'openRemoteBridge'), (error) => error === failure);

  assert.equal(handed.length, 1);
  const word = pinWordOf(handed[0].argv, 'T4c: the bridge');
  assert.deepEqual(handed[0].pin, { file: word, text: PIN_LINE }, 'T4c: the pin file was not on the disk with the line of the entry when the start was called');
  assert.equal(w.bridges.isOpen(KEY), false);
  assert.deepEqual(pinFiles(dir), [], 'T4c: the start failed and the pin file stays');
});

test('T4d (guard): a pinned bridge that gets no argv, or whose argv cannot be built, starts nothing and deletes its pin file at once', async () => {
  const dir = storage('t4d');
  const failure = new Error('the argv could not be built');
  const none = world(pinned(dir, { checks: [], mocks: { '../sshBridge': { ...realBridge, buildBridgeArgv: (): undefined => undefined } } }));
  const throwing = world(pinned(dir, { checks: [], mocks: { '../sshBridge': { ...realBridge, buildBridgeArgv: (): never => { throw failure; } } } }));

  await click(none, 'openRemoteBridge');
  await assert.rejects(click(throwing, 'openRemoteBridge'), (error) => error === failure);

  assert.match(none.warnings.at(-1) ?? '', /cannot be bridged/);
  assert.deepEqual([none.children.length, throwing.children.length], [0, 0]);
  assert.deepEqual(pinFiles(dir), [], 'T4d: no bridge was started and a pin file stays');
});

/* --- part 3: sentence C --- */

test('T9a: the install on a pinned entry whose host presents another key shows sentence C, and not that the host did not answer the probe', async () => {
  const dir = storage('t9a');
  const w = world(pinned(dir, { answer: yes, run: () => ran('', 255, REFUSED_KEY) }));
  await click(w, 'installRemoteCli');

  assert.deepEqual(w.errors, [SENTENCE_C], 'T9a: the refused host key was not told to the person');
  assert.deepEqual(w.warnings, [], `T9a: the refused host key was told as something else: ${w.warnings.join(' | ')}`);
  assert.equal(w.runs.length, 1, 'T9a: the install went on after a refused host key');
  assert.deepEqual(w.asked, [], 'T9a: the install asked its question after a refused host key');
  assert.deepEqual(pinFiles(dir), [], 'T9a: the install left its pin file');
});

test('T9b: Open Remote Bridge on a pinned entry whose host presents another key: the socket check shows ONE error message, the bridge is not open and why, and logs it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dir = storage('t9b');
  const w = world(pinned(dir, { run: () => ran('', 255, REFUSED_KEY) }));
  await click(w, 'openRemoteBridge');
  await settled();
  w.children[0].end(255); // the ssh of the bridge was refused too; it has no stdio, so it says nothing
  await settled();
  t.mock.timers.tick(1500);
  await settled();

  assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
  assert.deepEqual(w.errors, [BRIDGE_NOT_OPEN], 'T9b: the refused host key of the bridge was not shown as ONE error message of the socket check');
  assert.deepEqual(w.logs.filter((line) => line === BRIDGE_NOT_OPEN), [BRIDGE_NOT_OPEN], 'T9b: the refused host key of the bridge is not in the log once');
  assert.equal(w.logs.some((line) => line.includes('its mode could not be read')), false, 'T9b: the refused host key was logged as a socket that is there');
  assert.equal(w.bridges.isOpen(KEY), false);
  assert.deepEqual(pinFiles(dir), [], 'T9b: a pin file stays after the bridge and its check have ended');
});

/** Runs that are NOT a refused host key of a pinned entry, with the sentence of today that the install shows for each. */
const NOT_REFUSED: readonly { label: string; hostKey?: string; outcome: SshExecOutcome; install: RegExp }[] = [
  { label: 'an UNPINNED entry whose ssh printed the verification line', outcome: ran('', 255, REFUSED_KEY), install: /did not answer the probe/ },
  { label: 'a pinned entry whose host is down', hostKey: PIN, outcome: ran('', 255, HOST_DOWN), install: /did not answer the probe/ },
  { label: 'a pinned entry whose login was refused', hostKey: PIN, outcome: ran('', 255, LOGIN_REFUSED), install: /did not answer the probe/ },
  { label: 'a pinned entry whose host does not answer inside the time limit of ssh', hostKey: PIN, outcome: ran('', 255, NO_ANSWER), install: /did not answer the probe/ },
  { label: 'a pinned entry whose run was ended at the time limit of the extension', hostKey: PIN, outcome: TIMED_OUT, install: /did not answer within 20 seconds/ },
];

for (const row of NOT_REFUSED) {
  test(`T9c (guard): the install on ${row.label} shows the sentence of today and no sentence C`, async () => {
    const w = world(pinned(storage('t9c'), { hostKey: row.hostKey, run: () => row.outcome }));
    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [], `T9c: a run that is no refused host key of a pinned entry was told as one: ${w.errors.join(' | ')}`);
    assert.equal(w.warnings.length, 1, `the install did not show one warning: ${w.warnings.join(' | ')}`);
    assert.match(w.warnings[0], row.install);
  });

  test(`T9d (guard): the socket check on ${row.label} shows no message and logs the mode as not read`, async (t) => {
    const w = await bridged(t, pinned(storage('t9d'), { hostKey: row.hostKey, run: () => row.outcome }));

    assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
    assert.deepEqual(w.errors, [], `T9d: a run that is no refused host key of a pinned entry was told as one: ${w.errors.join(' | ')}`);
    assert.ok(w.logs.some((line) => line.includes('its mode could not be read')), `the unreadable mode was not logged: ${w.logs.join(' | ')}`);
  });
}

test('T9e (guard): a host key that is refused at the SECOND run of the install keeps the sentence of today', async () => {
  const w = world(pinned(storage('t9e'), { answer: yes, run: (index) => (index === 0 ? ran(PROBE_OK) : ran('', 255, REFUSED_KEY)) }));
  await click(w, 'installRemoteCli');

  assert.equal(w.runs.length, 2);
  assert.deepEqual(w.errors, ['Could not install on "box": the installer produced no result and exited 255.']);
});

/* --- part 4: the list of the argv calls --- */

const AGENT_COMMANDS = path.join(__dirname, '..', '..', 'src', 'commands', 'agentCommands.ts');
const BUILDERS = ['buildSshExecArgv', 'buildBridgeArgv'];

/** The named function that a node stands in. */
const withinOf = (node: ts.Node): string => ts.findAncestor(node, ts.isFunctionDeclaration)?.name?.text ?? '(no function)';

/** Whether an argument is an object that names `knownHostsFile`. */
const namesPinFile = (argument: ts.Expression): boolean =>
  ts.isObjectLiteralExpression(argument) && argument.properties.some((property) => property.name?.getText() === 'knownHostsFile');

/** Every call in the file, depth first. */
function callsOf(source: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

/** Each call of an argv builder in `commands/agentCommands.ts`: `<builder> in <function>`, and whether an object among its arguments names `knownHostsFile`. */
function builderCalls(): { site: string; names: boolean }[] {
  const source = ts.createSourceFile('agentCommands.ts', fs.readFileSync(AGENT_COMMANDS, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return callsOf(source)
    .filter((call) => BUILDERS.includes(call.expression.getText()))
    .map((call) => ({ site: `${call.expression.getText()} in ${withinOf(call)}`, names: call.arguments.some(namesPinFile) }))
    .sort((a, b) => a.site.localeCompare(b.site));
}

test('T11: every argv call of the three roads names knownHostsFile, and the scan finds the four calls', () => {
  const calls = builderCalls();

  assert.deepEqual(
    calls.map((call) => call.site),
    ['buildBridgeArgv in registerAgentCommands', 'buildSshExecArgv in runRemote', 'buildSshExecArgv in sweepDeadSockets', 'buildSshExecArgv in verifyBridgeSocket'],
    'the scan does not find the four argv calls of commands/agentCommands.ts: one was added, moved or renamed. Give the new call the pin file of its call, then edit this list',
  );
  assert.deepEqual(calls.filter((call) => !call.names).map((call) => call.site), [], 'T11: an argv call of the three roads names no knownHostsFile, so its ssh would not read the pin of the entry');
});
```

### 4.3 `test/personRoadsPin.test.ts`: two comment lines

Its header says that the argv does not name the file yet. After this story it does:

```diff
--- a/src_vs_code/src/test/personRoadsPin.test.ts
+++ b/src_vs_code/src/test/personRoadsPin.test.ts
@@ -12,8 +12,8 @@
 /**
  * G1, E1.S2: the saved host key of one call on the three roads of the person. A pin that is there and can be used is written to a
  * file of that call alone and deleted with the call, whether or not a key file was written; a pin that is there and cannot be
- * used, and a pin file that cannot be written, start no `ssh`; an entry with no pin runs as before. The argv does not name the
- * file yet: that is E1.S3.
+ * used, and a pin file that cannot be written, start no `ssh`; an entry with no pin runs as before. That each `ssh` is handed the
+ * file is `personRoadsHostKey.test.ts` (E1.S3).
  *
  * <p>`materializeKnownHosts` and `forgetMaterializedKey` are the real ones (`realForget`), in a real storage folder that this file
  * owns, so every pin file here is a real file. The one exception is Q7a to Q7c, which stand in for `./hostKeyTrust` to make the
```

No assertion of that file changes. All 28 of its tests pass before and after §2 and §3 (L10 c): none of them asserts that a
pinned argv names no file.

### 4.4 Existing tests do not change

`test/personRoadsForgetKey.test.ts` (15), `test/bridgeKeyHandoff.test.ts` (9), `test/personPin.test.ts` (10),
`test/writtenKey.test.ts` (18), `test/hostKeyWords.test.ts` (18), `test/launchRoadScan.test.ts` (10) and
`test/noConnectionSharing.test.ts` (9) run with no edit and pass (L10 c). N16's tests run on an entry with no `hostKey`: their
argvs do not change by one word. If an existing test turns red after §2 and §3, stop and tell the lead.

## 5. The RED texts (the product of `3b5008d3`, L10 b)

`node --test out/test/personRoadsHostKey.test.js` on the unchanged product: 37 tests, 13 pass, 24 fail. The first lines of each
failure, as the runner printed them; a group of tests with one name and one text is printed once:

```text
✖ H1: a refused host key is a PINNED call whose ssh printed the line "Host key verification failed."
✖ H2: an unpinned call is never a refused host key, whatever ssh printed
✖ H3: a host that is down, a refused login, a host that does not answer, no text, and the words inside another line are no refused host key
✖ H4: what the match cannot tell from a refused host key of the entry: a hop of the person's own config, and a host that prints the line itself
  AssertionError [ERR_ASSERTION]: hostKeyPin.ts exports no hostKeyRefused
  + 'undefined'
  - 'function'
✖ H5: sentence C, word for word
  AssertionError [ERR_ASSERTION]: hostKeyPin.ts exports no refusedHostKeySentence
  + 'undefined'
  - 'function'
✖ T1: all five runs of a pinned entry, a plain storage folder: strict checking, one pin file as both known-hosts files, and three files for the three calls
✖ T1: all five runs of a pinned entry, a storage folder whose path holds a space: strict checking, one pin file as both known-hosts files, and three files for the three calls
  AssertionError [ERR_ASSERTION]: T1: a run of a pinned entry does not check the host's key against the saved one
    [
  +   'accept-new'
  -   'yes'
    ]
✖ T2: the socket check of a pinned entry, a normal check: both runs name the SAME pin file of the check, and it is gone after the check
  (and the four others of T2: a missing socket, a mode that cannot be read, a socket wider than 600, runs that throw)
  AssertionError [ERR_ASSERTION]: T2: the sweep does not check the host's key against the saved one
    [
  +   'accept-new'
  -   'yes'
    ]
✖ T3: the install of a pinned entry, a success: every run names the SAME pin file of the install, and it is gone after
  (and the four others of T3: a failed install, a probe that times out, a host that cannot be installed to, the person says no)
  AssertionError [ERR_ASSERTION]: T3: the probe does not check the host's key against the saved one
    [
  +   'accept-new'
  -   'yes'
    ]
✖ T3q: the pin file that the probe named is on the disk while the question is open; a question that throws deletes it, and the same error goes on
  AssertionError [ERR_ASSERTION]: T3q: the probe does not check the host's key against the saved one
✖ T4a: the argv of a pinned bridge names the pin file of the bridge; Close deletes nothing; the file goes when the ssh has ended
  AssertionError [ERR_ASSERTION]: T4a: the bridge does not check the host's key against the saved one
✖ T4b: a bridge that REPLACES another: each argv names its own pin file; the first goes when the first ssh ends, the second stays with its bridge
  AssertionError [ERR_ASSERTION]: T4b: the first bridge does not check the host's key against the saved one
✖ T4c: a start that throws was handed an argv that names the pin file; the file is deleted at once, and the same error goes on
  AssertionError [ERR_ASSERTION]: T4c: the bridge does not check the host's key against the saved one
✖ T9a: the install on a pinned entry whose host presents another key shows sentence C, and not that the host did not answer the probe
  AssertionError [ERR_ASSERTION]: T9a: the refused host key was not told to the person
  + []
  - [
  -   '"box" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.'
  - ]
✖ T9b: Open Remote Bridge on a pinned entry whose host presents another key: the socket check shows ONE error message, the bridge is not open and why, and logs it
  AssertionError [ERR_ASSERTION]: T9b: the refused host key of the bridge was not shown as ONE error message of the socket check
  + []
  - [
  -   'The bridge to "box" is not open: "box" did not present its saved host key, so CredsForDevs did not connect. […]'
  - ]
✖ T11: every argv call of the three roads names knownHostsFile, and the scan finds the four calls
  AssertionError [ERR_ASSERTION]: T11: an argv call of the three roads names no knownHostsFile, so its ssh would not read the pin of the entry
  + [
  +   'buildBridgeArgv in registerAgentCommands',
  +   'buildSshExecArgv in runRemote',
  +   'buildSshExecArgv in sweepDeadSockets',
  +   'buildSshExecArgv in verifyBridgeSocket'
  + ]
  - []
```

Each is the right reason: the two functions do not exist; every run of a pinned entry still says `accept-new`; the install shows
no error for a refused host key (it shows the warning about the probe); the check shows nothing; no argv call names the option.
The coder's own RED run must show these 24 and no other. A different text, or a 25th failure, is a reason to stop.

## 6. The documents of this story

Three documents, in a commit of their own. The texts below are what each must say; fit the wording to the lines around it, and
keep every fact. E1.S1 and E1.S2 wrote into the same places before this story; if one of their texts is not there, stop and tell
the lead: the order of the stories was changed.

**6.1 `src_vs_code/CHANGELOG.md`, under `## [Unreleased]`,** in the entry that E1.S1 opened (`### Changed — security: a saved
host key is the only key a call without a terminal accepts`). It is the first half of the security entry of the parent's §6.
No version heading: the release writes it.

1. A new FIRST paragraph of the entry:

   ```markdown
   *Open Remote Bridge…*, the socket check that follows it, and *Install creds on host* now check an entry's saved host key.
   Before, these three started `ssh` with `StrictHostKeyChecking=accept-new` against your own `~/.ssh/known_hosts`, also for an
   entry with a saved host key. A machine at that address that `known_hosts` did not list yet was accepted on first contact: it
   got the forwarded socket of the bridge, it was the machine the installer was downloaded onto, and a password entry sent its
   password there. Now, for an entry with a saved host key, `ssh` connects only to a host that presents that key. A host that
   presents another key is refused, and a message says so. *Install creds on host* shows: `"<name>" did not present its saved
   host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and
   asks before it replaces the saved one. If it was not, do not connect.` After *Open Remote Bridge…* the socket check shows
   `The bridge to "<name>" is not open: ` and the same sentence, because the tunnel's own `ssh` has no output to show. A host
   that is down and a login that is refused are told as before. Not covered: if your own `ssh` config says `LogLevel QUIET`,
   `ssh` prints nothing about the refusal, the connection is still refused, and the message is the one of before.
   ```
2. In E1.S1's paragraph, the list of the calls without a terminal, "(an agent's `ssh:exec` and its run over SSH, *Run with
   Secrets* over SSH)", gains these three: "(the tunnel of *Open Remote Bridge…*, its socket check, *Install creds on host*, an
   agent's `ssh:exec` and its run over SSH, *Run with Secrets* over SSH)".

**6.2 `research/module_extension.md`.**

1. The paragraph **B10 — the host key**: behind E1.S1's paragraph "**The words of a pinned call (G1, E1.S1).**", one new
   paragraph:

   ```markdown
   **The three roads of the person (G1, E1.S3).** The bridge socket check, *Install creds on host* and *Open Remote Bridge…*
   (`commands/agentCommands.ts`) hand `ssh` the pin file of their call: each of their four argv calls names `knownHostsFile`,
   read from the ONE value that the guard hands the road (`CallAuth`, `writtenKey.ts`). An entry with no saved host key runs as
   on the agent's exec: `accept-new`, no file. An entry with one gets strict checking against a file of this call alone,
   `known_hosts-<entry id>-<uuid>`: both runs of the socket check read one file, the probe and the install run read one file,
   the tunnel reads its own until its `ssh` has ended. A host key that `ssh` refused is told to the person (sentence C,
   `refusedHostKeySentence`). The match is `hostKeyRefused` in `hostKeyPin.ts`: a pinned call whose `ssh` printed the whole line
   `Host key verification failed.`; `ssh` ends its lines with CR LF. The install shows the sentence for its probe, as an error
   in place of "the host did not answer the probe". The socket check shows it for the bridge, as an error message that opens
   with `The bridge to "<name>" is not open: `, and writes it to the log, because the tunnel's `ssh` has no stdio. A host that is
   down, a host that does not answer and a refused login keep the sentences of before. What the match cannot tell apart (a hop
   of the person's own `ProxyJump`, a host that prints the line itself) and what it misses (`LogLevel QUIET`) is in the docblock
   of the function, with the measurement. Windows' `ssh.exe` was not run.
   ```
2. In the paragraph **The bridge's `ssh` and its key file (N16)**, E1.S2's last sentence, "The argv of these roads does not name
   the file yet.", is replaced: "Each of the four argv calls of these roads names the file (E1.S3, the paragraph B10)."

**6.3 `research/module_tests.md`,** the section `## The three roads of the person and the saved host key (G1)` that E1.S2 began.

1. Its table gains one row. Read the count from the runner, not from this document:

   | File | Tests | What it holds |
   |---|---|---|
   | `personRoadsHostKey.test.ts` | 37 | H1 to H5: `hostKeyRefused` and sentence C alone, on the texts a real `ssh` printed (a pinned call and the whole line; an unpinned call never; a host that is down, a refused login, no answer never; and the two cases the match cannot tell apart, held as they are). T1 to T4: each of the five runs of a pinned entry is SENT strict checking and one pin file of its call as both known-hosts files, the file on the disk with the line of the entry when the run starts; the check's two runs share one file and the install's two runs one; on every way out of N16's list the file is gone. T9: the install shows sentence C for a refused host key at its probe; the socket check shows ONE error message for the bridge and logs it; an unpinned entry, a host that is down, a refused login, no answer and the install's second run keep the sentences of before. T11: the four argv calls of `commands/agentCommands.ts` name `knownHostsFile` |
2. Its paragraph **What none of them proves** loses the sentence that no argv names the file, and says: these tests show what each
   run is SENT and what the roads show for a text that `ssh` printed once, by hand. That a real `ssh` refuses a host with another
   key through these roads is shown by the smoke of E1.S4 (section 10 of `scripts/ssh-agent-itest.cjs`) and by E2. Windows by
   reading only. The texts of `ssh` are those of OpenSSH 10.2p1.

## 7. Order of work, and the commits

1. **The tests** (§4.2). Compile: exit 0. Run `personRoadsHostKey`: 13 green and 24 red with the texts of §5. Save the output.
2. **The product** (§2, §3) and the two comment lines (§4.3). Compile: exit 0. `personRoadsHostKey` 37 green; the suites of §4.4
   and `personRoadsPin` green with the counts of L10 (c). `wc -l src/commands/agentCommands.ts` says 797.
3. **The mutation checks** (§8), one at a time, each restored before the next. Save what each one printed.
4. Typecheck, lint, the ratchet, the whole suite: green. Commit c1:
   `fix(ssh): G1 E1.S3 — the three roads hand ssh the pin file of their call, and a refused host key is told`. Its body quotes
   the RED texts of step 1 and the result of each mutation, says 784 → 797, and says what is not measured (§12).
5. **The documents** (§6). `node .agents/conventions/tools/plan-lifecycle.mjs .` and `node .github/scripts/public-hygiene.mjs`
   from the repository root: clean. Commit c2: `docs(extension): G1 E1.S3 — the three roads check the saved host key, and
   sentence C`.

If a test of step 1 is red with another text, or a guard is red: stop and tell the lead. No commit holds a red test.

## 8. The mutation checks (each one must turn the named tests red; restore after each one)

Each mutation is a temporary edit of the PRODUCT, never of a test. Compile (read the exit), run `personRoadsHostKey`,
`personRoadsPin`, `personPin`, `writtenKey`, `personRoadsForgetKey`, `bridgeKeyHandoff`, `hostKeyWords`, `hostKeyPin`,
`launchRoadScan` and `noConnectionSharing` (164 tests), read what is red, restore, and compile again before the next one. "Red"
below is what was measured (L10 f). A mutation that turns red something else, or less, is a finding for the lead.

| # | The mutation | Red (of 164) |
|---|---|---|
| W1a | The sweep's argv names no pin file: in `sweepDeadSockets`, `{ knownHostsFile }` becomes `(void knownHostsFile, {})`. (With the argument simply dropped the compiler refuses the unread parameter, `TS6133`) | 8: T1 (both), T2 (all 5), T11 |
| W1b | The mode check's argv names no pin file: its fifth argument is dropped | 8: T1 (both), T2 (all 5), T11 |
| W1c | `runRemote`'s argv names no pin file: its fifth argument is dropped | 9: T1 (both), T3 (all 5), T3q, T11 |
| W1d | The bridge's argv names no pin file: `, knownHostsFile: credential.knownHostsFile` is dropped from the options | 11: T1 (both), T2 (all 5), T4a, T4b, T4c, T11 |
| W2 | The socket check hands the sweep no pin file: the third argument of its call becomes `undefined` | 7: T1 (both), T2 (all 5). T11 stays green: the scan reads the argv calls, not their callers |
| W3a | One file per run on the install: in `runRemote`, the option becomes `{ knownHostsFile: ((pin) => (pin.ok ? pin.knownHostsFile : undefined))(writePersonPin(storageDir ?? '', entity, credential.auth)) }` | 13: T1 (both), T3 (all 5), T3q, T9a; Q5 (all 3) and Q8a of `personRoadsPin` |
| W3b | One file per run on the socket check: the same expression as the option of the mode check's argv | 10: T1 (both), T2 (all 5), T2g, T9b; Q8b |
| W3c | The socket check reads the pin file of the BRIDGE: the bridge's function keeps `credential.knownHostsFile` in a variable of the handler, `verifyBridgeSocket` gets it as a fourth parameter, and both runs of the check name it in place of their own | 7: T1 (both), T2 (all 5) |
| W4a | The bridge's pin file is deleted at once: in `withWrittenKeyUntilExit` (`writtenKey.ts`), after `handed = true;` comes `forgetBoth({ ok: false, reason: 'internal', message: '' }, pinFile);` (N11 of the E1.S2 spec) | 14: T2 (all 5), T2g, T4a, T4b; Q5b, Q7c, Q8b; U14, U16, U17 |
| W4b | The pin file is not handed to the process, so only an end that the manager reports could delete it: the attach becomes `const onlyKey = (): void => forgetWrittenKey(credential); void started.process.exited.then(onlyKey, onlyKey);` (N10 of the E1.S2 spec) | 9: T2g, T4a, T4b, T9b; Q5b, Q8b; U14, U16, U17 |
| W5 | "Pinned" is dropped from the condition: `hostKeyRefused` returns `stderr.split(/\r?\n/).includes(HOST_KEY_REFUSED_LINE)` (with `void pinFile;`) | 3: H2, T9c (the unpinned entry), T9d (the unpinned entry) |
| W6 | The check's sentence C goes to the log only: its `void vscode.window.showErrorMessage(text);` is removed | 1: T9b |
| W7 | The check's sentence C is shown and not logged: its `log.info('bridge', text);` is removed | 1: T9b |
| W8 | Every pinned run that printed something is a refused host key: `hostKeyRefused` returns `pinFile !== undefined && stderr.length > 0` (with `void HOST_KEY_REFUSED_LINE;`) | 7: H3, T9c and T9d for the host that is down, the refused login and the host that does not answer |
| W9 | The text is split at LF alone: `stderr.split('\n')` | 4: H1, H4, T9a, T9b |
| W10 | The words anywhere in the text: `stderr.includes(HOST_KEY_REFUSED_LINE)` | 1: H3 |
| W11 | The install has no branch for a refused host key: its four lines are removed | 1: T9a |
| W12 | The install shows sentence C as a warning: `showWarningMessage` | 1: T9a |
| W13 | The check shows sentence C without its opening: `const text = refusedHostKeySentence(entity.name);` | 1: T9b |
| W14 | One word of sentence C changes: `did not connect.` becomes `did not go on.` | 3: H5, T9a, T9b |
| W15 | The install goes on after sentence C: the `return;` of its branch is removed | 1: T9a |
| W16 | The check asks about the host key only after it has read the answer: its branch moves behind the branch of `unreadable` | 1: T9b |
| W17 | The install's SECOND run shows sentence C too: before `return run.timedOut`, `if (hostKeyRefused(credential.knownHostsFile, run.stderr)) { return { kind: 'failed', reason: refusedHostKeySentence(node.name) } as const; }` | 1: T9e |
| W18 | The check asks the match with no pin: `hostKeyRefused(undefined, outcome.stderr)` | 1: T9b |
| W19 | The install asks the match about the stdout of the probe: `facts.stdout` | 1: T9a |

How these map to the parent's §5, item 15, as the stories document assigns it to this story: "drop `knownHostsFile` from each of
the four argv calls in turn → test 2, 3 or 4 and the scan are red" is W1a to W1d; "write one file per run → 'the same file' of
tests 2 and 3 is red" is W3a and W3b; "delete the bridge's pin at once, or from `onEnded` → test 4 is red" is W4a and W4b (W4b is
the second half as it can be built: a pin file that is not handed to the process is deleted by nothing when a bridge is closed
or replaced, because `onEnded` reports neither); "drop 'pinned' from the condition of sentence C → the guard of test 9 is red" is
W5; "show the check's sentence C in the log only → test 9 is red" is W6. W2, W3c and W7 to W19 are this spec's own.

## 9. Done when (each item can be counted)

- [ ] `test/personRoadsHostKey.test.ts` has 37 tests; 24 were watched red on the product of `3b5008d3` with the texts of §5 and
      pass after §2 and §3; the 13 guards were green at both.
- [ ] `hostKeyPin.ts` exports `hostKeyRefused` and `refusedHostKeySentence`; its diff is the block of §2 and nothing else.
- [ ] `commands/agentCommands.ts` has 797 lines; its diff is the diff of §3.1 and nothing else.
- [ ] The four argv calls each name `knownHostsFile` (T11), and `hostKeyRefused` is called in two places of that file.
- [ ] `test/personRoadsPin.test.ts` changes by two comment lines; `test/personRoadsWorld.ts`, `test/pinnedArgv.ts`,
      `test/personRoadsForgetKey.test.ts`, `test/bridgeKeyHandoff.test.ts`, `test/writtenKey.test.ts`, `test/personPin.test.ts` and
      `test/hostKeyWords.test.ts` have no diff, and pass.
- [ ] `sshExecCommand.ts`, `sshBridge.ts`, `writtenKey.ts`, `personPin.ts` and `hostKeyTrust.ts` have no diff in this story.
- [ ] W1a to W19 (25 runs) each turned red what §8 names, and the product was restored after each.
- [ ] The three documents of §6 are changed; `plan-lifecycle.mjs` and `public-hygiene.mjs` are clean.
- [ ] `npm run typecheck`, `npm run lint` (no new `eslint-disable`), `npm run ratchet` and `npm test` are green; the leftovers
      audit of `npm test` names no folder of this run.
- [ ] With this story the tests of the parent's §5 are all written and green, with lint and the build (the stories document, E1.S3,
      *Done when*; item 15 of §5 is the mutation checks of the three specs).

## 10. Break it — ways to make the tests pass while the defect stays, and the row that stops each one

| # | The way | What stops it |
|---|---|---|
| Z1 | The argv names a known-hosts file, and it is not the file that the guard wrote and deletes (`known_hosts-e1` of the agent's exec, or a file that the road wrote itself) | T1 to T4 ask for a file named `known_hosts-e1-<uuid>` in the key folder of the window, on the disk at the moment of the run, and for an empty folder afterwards; W3a, W3b |
| Z2 | The scan is satisfied by an object that names `knownHostsFile` with no value in it | T11 only reads the text; T1 to T4 read the argv of every one of the five runs |
| Z3 | Three of the four calls are changed; the sweep, whose answer nobody reads, is left out, or its caller hands it nothing | T2 reads the sweep's argv by itself (`T2: the sweep …`); T11 (W1a); W2 |
| Z4 | The socket check reuses the bridge's file: "the same file" is then true for its two runs | T2 asserts that the check's file is NOT the one of the bridge's argv, and that exactly the bridge's file is left; W3c |
| Z5 | The roads say `UserKnownHostsFile` and strict checking, and the system-wide file stays | The roads cannot say words: they hand a path to the builders, and E1.S1's tests hold the six words. `pinWordOf` still asks every argv for the same word in BOTH options |
| Z6 | Sentence C is shown for every failed run of a pinned entry: the test of sentence C passes | T9c and T9d: a host that is down, a refused login, no answer and a run ended at the time limit show no error; H3; W8 |
| Z7 | Sentence C is shown for an unpinned entry whose `ssh` printed the line | T9c and T9d, the first row; H2; W5 |
| Z8 | The bridge's refusal is written to the log, and the test looks for the text anywhere | T9b asserts that `errors` is exactly the one message; W6. And the other way round: W7 |
| Z9 | The fixtures are tidy text with LF, so a match that is blind to CR passes, and a real `ssh` is never matched | The fixtures are the measured text with CR LF (L9 b); H1, T9a, T9b; W9 |
| Z10 | The tests take the expected sentence from the product's own function, so both can be wrong together | `SENTENCE_C` and `BRIDGE_NOT_OPEN` are literals of the test; H5; W13, W14 |
| Z11 | Sentence C is shown, and the install still warns about the probe, asks, or runs its second `ssh` | T9a: no warning, no question, one run; W15 |
| Z12 | The check reads an empty answer first and logs "is there, but its mode could not be read" for a host with another key | T9b: no such log line, and the error; W16 |
| Z13 | The tests pass on a pretended file system | `materializeKnownHosts` and `forgetMaterializedKey` are the real ones; the world reads each named file at the moment of its run |
| Z14 | The scan passes because it finds nothing, or a fifth argv call is added with no pin | T11's first assertion is the exact list of the four sites |

## 11. Opus review checklist

1. `hostKeyPin.ts`: the diff is the block of §2. `hostKeyRefused` tests `pinFile !== undefined` first and then a whole line,
   split at `/\r?\n/`. No other condition. `refusedHostKeySentence` is the parent's §3.5, character for character (compare with
   §1 of this spec, not with the tests).
2. `commands/agentCommands.ts`: the diff is §3.1 and nothing else. 797 lines; no new `eslint-disable`.
3. Each of the four argv calls names `knownHostsFile`, and the word comes from the ONE value of its road:
   `credential.knownHostsFile` in the mode check, in `runRemote` and in the bridge; the parameter in `sweepDeadSockets`, which its
   one caller fills with `credential.knownHostsFile`. No road calls `writePersonPin` or `materializeKnownHosts` for an argv. The
   socket check gets no path from the bridge.
4. `hostKeyRefused` is called in two places: behind the probe of the install (with `facts.stderr`) and behind the run of the
   mode check (with `outcome.stderr`). Not for the sweep, not for the install run.
5. The install's branch shows `refusedHostKeySentence(node.name)` with `showErrorMessage` and returns; it stands before the
   timeout branch. The check's branch builds ONE text, logs it, shows it with `showErrorMessage` and returns; it stands before
   `interpretSocketProbe`.
6. No other sentence of these roads changed. An unpinned entry: no argv word and no message differs (T9c, T9d, and E1.S2's Q1).
7. The three lines that open the guards are as E1.S2 wrote them; QS is green.
8. `test/personRoadsHostKey.test.ts` is the text of §4.2. Its fixtures of `ssh`'s texts carry CR LF. Its expected sentences are
   literals. It writes only into folders of `ownedDir` under a `cleanupScope` closed in `after`, and starts no process.
9. The RED texts in the body of c1 are those of §5; each mutation in the body names what turned red, and it is what §8 says.
10. The documents say what is SENT and what is shown. No sentence says that a real `ssh` was seen refusing a host through these
    roads: that is E1.S4's to add.
11. Read §12 and *Notes for the lead*: does one of the three limits of the match (a hop, a host that prints the line, `LogLevel
    QUIET`) or the wording "is not open" need more than a note before E1 merges?

## 12. Not verified by this spec

- **A real `ssh` through the roads.** The runner and the spawner are stand-ins. What is proven is what each run is SENT, and what
  the roads show for a text. That `ssh` then refuses a host with another key was measured by hand on the words (L9; the E1.S1
  spec, K6), and through the registered commands it is E1.S4's smoke and E2 (M1, M2, M5).
- **Windows.** No `ssh.exe` was run for this spec. Whether Win32-OpenSSH prints the same line, and with which line ends, is
  candidate C6. A miss shows the sentences of today.
- **Another OpenSSH than 10.2p1.** The line is read as it is in that version. Not measured: an older client; a localised
  build (OpenSSH has none that is known here).
- **`LogLevel QUIET` in the person's config** (L9 g): the connection is refused and nothing is printed, so the match misses and
  the person reads "the host did not answer the probe", or nothing from the socket check. Not closed here: the roads honour the
  person's config, and an option that overrides it is a change of the builders.
- **A hop of the person's own `ProxyJump`** (L9 h): its refused key reads as a refused key of the entry, so sentence C names the
  wrong host. The three roads pass no jump of the entry (the parent's §4). H4 holds the behaviour as it is.
- **A host that passed the check and prints the line itself** (L9 i): sentence C is shown for a host that DID present its saved
  key. It can only raise this alarm about itself; a machine that is not the pinned one never gets to print anything.
- **A host that offers no key of the pinned type.** Not measured (the parent's §3.5 says so too). L9 (c) is the nearest case: a
  file with no key for the host ends with the same last line.
- **A pin file whose path cannot be named** (E1.S1: a double quote in the storage folder's path): the argv says `/dev/null`,
  `ssh` refuses every host with the text of L9 (c), and the roads show sentence C. It names the host's key and not the folder.
  Accepted by the E1.S1 spec; H1 holds that this text is matched.
- **"Is not open" when the tunnel IS open.** The check concludes from its own `ssh`. If the tunnel's `ssh` met a machine with the
  saved key and the check's `ssh`, 1.5 s later, met one with another key (a name that resolves to several machines; a key
  switched in between), the bridge is open while the message says it is not. The row in the tree tells which. Not tested.
- **The order of the messages** after *Open Remote Bridge…* on a host with another key (*Bridge open to …*, then the check's
  error): E2's M5 records it.
- **A stderr cut at the byte limit** of the runner (L5). `ssh`'s own text for a refused key is 15 lines; a remote command prints
  nothing, because none runs.
- **A window that is killed.** No `finally` runs; the purge of the next activation retires `keys/<pid>/` with both files.

## Notes for the lead

- **Measured budget (the parent's §3.6).** `commands/agentCommands.ts`: 784 lines at `3b5008d3` (E1.S2 built, `main` with PR #365
  merged in; the merge did not change the file), **797** after this story: 13 added. Three lines are left below 800. The parent's "sentence C is one branch of four lines on each of the two
  bounded roads" is four on the install and seven on the socket check (it builds the text once for the log and the message, and
  has one comment line; without the comment the count is 796). The parent's "about 12" is 13.
- **The links to this file.** The parent's status block and its `## Epics`, E1, *Stories*, and the stories document's status
  block and `## E1.S3`, name the specs of E1.S1 and E1.S2 and not this one. I do not edit them: the lead adds the links. This
  file links to both.
- **For the parent, §3.5, "Measured for this plan":** three facts measured for this spec that the paragraph does not have
  (L9). `ssh` ends its lines with CR LF, also on Linux. `LogLevel QUIET` in a config prints nothing for a refused key. A refused
  key of a `ProxyJump` hop prints the same line, followed by `Connection closed by UNKNOWN port 65535`. A repaired description,
  not a change; the lead's call.
- **Two candidates that a result of E2 could justify, not built here.** (1) *The match asks for the LAST line of the stderr.*
  Measured: for a refused key of the destination the verification line is the last line (L9 a, c, g); for a hop it is the last
  but one (L9 h). One changed line in `hostKeyRefused` and one changed expectation (H4) would stop sentence C from naming the
  wrong host. I did not build it: the parent says "holds OpenSSH's line", and a narrower rule is a change of the approach for
  the lead to decide, with the parent at one entry. (2) *A pinned call says its own `LogLevel`.* With `QUIET` in the person's
  config the refusal is silent (L9 g). One more word from `hostKeyWords` (`-o LogLevel=ERROR`) would bring the line back; it was
  not measured, and it is a change of the words of E1.S1. E2's M5 could add both as rows: a hop, and a quiet config.
- **The install's sentence C is an error message with no opening.** The parent's table says "sentence C" for the install and
  gives an opening only to the bridge's form; the stories document says the same. The spec of E1.S4 reads the install's message
  from the warnings and the errors together (its T25), so it holds either way.
- **For the spec of E1.S4.** The names are `refusedHostKeySentence(name)` and `hostKeyRefused(pinFile, stderr)`, both exported
  from `hostKeyPin.ts`. There is no function for the whole form of the bridge: the script joins `The bridge to "<name>" is not
  open: ` and the sentence, as its §2 allows. The socket check says `entity.name`, which is the row's name in the world.
- **"Is not open"** (§12). The parent fixed the opening of the bridge's form. It is true whenever the tunnel's `ssh` and the
  check's `ssh` meet the same machine. A form that does not conclude ("The socket check of the bridge to …") would be a change
  of §3.5; recorded, not proposed.
- **The parent's tests 2 and 4 list "no argv" and "a throw while the argv is built".** On a pinned entry these are guards in this
  story (T2g, T4d): green before and after, because the delete there is E1.S2's. Nothing to change; said so that the count of
  RED tests (24 of 37) is not read as a gap.
- **W1a.** The plain form of the parent's mutation "drop `knownHostsFile` from the sweep's argv call" does not compile
  (`TS6133`: the parameter is then unread). The compiler is a second guard there; the mutation is run with `void`.
- **Measured twice.** First on `aad8b8ba`, then again on the merge commit `3b5008d3`, as the lead asked: the same 24 RED texts,
  the same red set for each of the 25 mutation runs, 797 lines. The merge of PR #365 changed no file of this story. It changed
  the counts of two suites that this story does not edit (`hostKeyWords` 15 → 18, `sshExecCommand` 22 → 31), and `buildSshExecArgv`
  now gives a call with `bridged: true` its words from `pinned` (L7); the three roads are not such calls.
- **The docblock of `hostKeyWords` (E1.S1) says "no test of the suite asks a real `sshd`".** Still true after this story; E1.S4
  changes that sentence.
