# PLAN — E2.S2 spec: the complete words of one pinned call, and the two refusals that stand before them (SECURITY, CORNERSTONE)

> Status: **spec, 2026-11-18, by Fable; built (c20be822, 581d96c0, 70676a95), unmerged; the Opus judge of the re-review for epoch 3 found nothing of its code cut; the docblock of `localLaunch` ("no `ssh` starts" for sentence F) is corrected forward in E3 with W7 of the parent.** The cornerstone spec of epic E2 of the G1 plan, and a security
> spec, written before its code (the rows *Cornerstone spec* and *Security judgement* of `subagent-models.md`; the ledger line of
> the parent's `## Epics` names E2.S2). Story E2.S2 of [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its
> §3.10, §3.11, part 1 of §3.12, §3.6, the repairs R1, R2 and R3, and the tests 17, 18, the road half of 19, and 20 to 23 of its §5)
> and of its stories document [PLAN_person_roads_pin_host_key_E2.md](PLAN_person_roads_pin_host_key_E2.md) (`## E2.S2`). It is built
> after [PLAN_person_roads_pin_host_key_E2_S1_spec.md](PLAN_person_roads_pin_host_key_E2_S1_spec.md), on the same branch. This
> file is promoted together with the parent.
>
> Scope: `src_vs_code/src`: `hostKeyPin.ts` (the rule of the path, the checked value, the words, sentences E and F); new
> `pinOfCall.ts` (the decision of one call); `personPin.ts`, `writtenKey.ts` (the pin writer and the two guards turn
> asynchronous); `hostKeyTrust.ts` (one export); `sshExecCommand.ts`, `sshBridge.ts` (the type of one option);
> `commands/agentCommands.ts` (5 lines changed, 0 added: 797 lines before and after); `sshUseActions.ts` (the agent's exec);
> `remoteLaunch.ts`, `sshRoad.ts`, `commands/runCommands.ts` (*Run with Secrets* over SSH); the tests of §6; the documents of §7.
> Each `file:line` below was read on `cbeae5b8` (the code of `main` at `f3e9887d`). Fable writes this spec, a Sonnet coder builds
> it, Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above; a section
named §3.10 and so on is the parent's, and "§2 of this spec" is this document's. "The S1 spec" is the spec of E2.S1 linked above;
its names keep their meaning (`PinClient`, `ReadablePinClient`, `pinClientAsker`, `windowPinClient`, D1 to D8). "N16" is
[PLAN_person_roads_forget_key.md](../research/PLAN_person_roads_forget_key.md). This document's own names: the decisions L1 to L5
(the lead's) and S1 to S12 (this spec's), the facts K1 to K14, the tests named in §6, the mutations N1 to N22, the break-its Y1 to
Y10. This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`).

## What E2.S2 builds, in one paragraph

Every `ssh` that the extension starts for a pinned entry with no terminal, off a bridge, gets its host-key words from one function,
`hostKeyWords` (E1). This story makes those words complete, and puts two refusals before them. **The words:** beside the three
pairs of E1 (strict checking, and the pin file as both known-hosts files) a pinned call says `VerifyHostKeyDNS=no`,
`KnownHostsCommand=none` when its client knows that option, and `LogLevel=ERROR`. **The rule of the path:** the pin file's path is
written as it is, or in double quotes (white space, an apostrophe), or it is REFUSED with its kind, because `ssh` would read
another file, two files or no file from it; no file without a key stands in any more. **The client:** a pinned call whose `ssh`
program cannot be asked for its version is REFUSED (the S1 spec gives the three answers). Both refusals are decided where the pin
of the call is decided, before a pin file is written and before any `ssh` starts, and both arrive in the refused value that a road
already reads, so no road gains a branch. The words can only be written from ONE checked value, which only the rule and a read
client can make: a raw path, a refused path and an unread client cannot reach `hostKeyWords`, and such code does not compile. The
three roads of the person, the agent's exec and *Run with Secrets* over SSH all go through it. An entry with no saved host key is
asked nothing and gets today's argv, byte for byte.

| File | Change | Where |
|---|---|---|
| `hostKeyPin.ts` | `oneFileWord` and `NO_KEY_FILE` go. New: `PIN_PATH_KINDS`, `PinPathKind`, `pinPathRefusal`, `CheckedPin`, `PinCheck`, `checkedPin`, `PinRefusalField`, `ExistingPin`, `checkExistingPin`, `pinPathSentence` (E), `pinClientSentence` (F). `hostKeyWords` takes a `CheckedPin`; `hostKeyRefused` takes one too (its body is E2.S3's) | §2 |
| `pinOfCall.ts` (new) | `PinDecision`, `PinOfCallParts`, `pinAbsent`, `decidePinOfCall` | §3 |
| `hostKeyTrust.ts` | `knownHostsPath` is exported: one word. `materializeKnownHosts` is not touched | §3.3 |
| `personPin.ts` | `writePersonPin(parts, auth, env)` is asynchronous and asks `decidePinOfCall`; new `personPinWriter`, `PERSON_SSH_PROGRAM`, `PersonPinParts` | §4.1 |
| `writtenKey.ts` | `PinWriter` answers a promise and gets the credential's environment; `PinOfCall` and `ReadyCall` hold a `CheckedPin`; both guards await the decision, before `run` and before `start` | §4.2 |
| `sshExecCommand.ts`, `sshBridge.ts` | `knownHostsFile?: CheckedPin` in `SshExecOptions` and `BridgeOptions` | §2.4 |
| `commands/agentCommands.ts` | the import of the writer, the type of one parameter, the three writers, and one `await` on the line of the third: 5 lines changed, 0 added | §4.3 |
| `sshUseActions.ts` | the agent's exec decides its pin before the file is written: `localPin`, `localLaunch` asynchronous, `SshUseDeps.pinClient` | §5.1 |
| `remoteLaunch.ts`, `sshRoad.ts`, `commands/runCommands.ts` | *Run with Secrets*: `secretsLaunch` gets the client's answer and checks the pin file that exists; `SshRoad.pinClient`; `launchesOf` asynchronous | §5.2 |
| tests | new `test/pinWords.test.ts` (19), new `test/personRoadsPinRefusals.test.ts` (28); more tests in five files; the changed expectations of E1's tests, each named | §6 |
| documents | the CHANGELOG parts of this story, `research/module_extension.md` (B10), `research/module_tests.md` | §7 |

## Decisions settled before this spec, and the ones this spec makes

**The lead's, 2026-11-18** (binding; the source of each is the lead's brief for this spec, after the question consultants,
consult `133736fc`):

- **L1. The pin writer and the guards turn asynchronous where they must, and nowhere else.** `ssh -V` is a spawn. The `await`
  stands only BEFORE `start` and before `run`. The bridge's one synchronous handoff (the continuation attached, and `handed` set
  by the next statement) stays synchronous (§4.2).
- **L2. *Run with Secrets*: the refusal stands in `secretsLaunch`, after the pin file exists.** Its pin file is made by Connect's
  options before `secretsLaunch` (`remoteLaunch.ts:273`, read at `:518`), and Connect's road must not change. So **"before any
  pin file" holds for the three roads of the person and for the agent's exec. It does NOT hold for *Run with Secrets*:** there the
  file exists when the call is refused, no `ssh` starts, and the cleanup that deletes the file today deletes it (§5.2). The
  parent's test 22 asks "no pin file" of the three roads only.
- **L3. The rule is asked of the WHOLE path of the pin file before the write, with no second copy of the name's builder**, and
  `materializeKnownHosts` does not change (§3.3).
- **L4. E1's run counts stay right.** The question about the client is a recorded kind of its own, counted apart from the runs
  (§6.2).
- **L5. The three answers about the client** are the S1 spec's (its D1 to D4): `knows`, `older`, `unreadable`.

**This spec's** (each is in *Notes for the lead*; a coder does not change one):

- **S1. `knownHostsPath` of `hostKeyTrust.ts` is exported**, and the pin writer asks the rule of what it answers. The other way,
  `materializedKeyPath(storageDir, 'known_hosts-<id>-<uuid>')`, would write the name's template a second time, which L3 forbids.
  One keyword is added; the function, its callers and `materializeKnownHosts` are as they were.
- **S2. The value for the words is made from the path that was WRITTEN**, by a second call of the rule after the write
  (`checkedOf`, §3.1). The first call, on the planned path, is what keeps a refused call from writing. Both paths come from
  `knownHostsPath`, so the second refusal is reached only if they ever differ; then the call's own file is deleted and the call is
  refused. So what `ssh` reads never depends on the two paths staying equal.
- **S3. The order of one decision:** no saved host key → nothing is asked; the rule of the path; the client; the write. A
  consequence: an entry whose saved host key cannot be used (sentence A) and whose `ssh` cannot be read gets sentence F first, and
  sentence A when the client can be read. Both refuse, and nothing is sent either way. The other order would need a second copy of
  the parse (§3.1 of the parent: "there is no second copy of the parse to drift").
- **S4. On the agent's exec the two questions are asked when a saved host key is THERE** (not absent), before
  `materializeKnownHosts` says whether it can be used. When both pass, an unusable saved key is read as no pin and the call runs
  with `accept-new`, as today (the parent's C3 stays). **The one difference from today:** such an entry, in a storage folder that
  the rule refuses or with an `ssh` that cannot be read, is now refused where it ran unchecked. That is stricter, it fails closed,
  and it is said here because the parent says that the agent's reading of an unusable pin does not change.
- **S5. One sentence for every door.** Sentences E and F are the same words on the three roads, to the agent and in *Run with
  Secrets*. They echo no path and no part of the program's output but the exit code, so the agent's answer "names the field and no
  value" (§3.11) with the person's own sentence. On the agent's exec the code is `no_credential`, as the bridged road answers for
  its storage folder (`bridgedSshRefusals.ts:159-162`).
- **S6. Two more refused kinds than the parent's table names:** a tilde at the start of the path (measured: expanded in the
  person's list only, so the two words name two files) and a backslash at its end (measured: `invalid quotes` in double quotes).
  §3.11 lets a spec move a kind to "refused" at any time. Neither can come from a storage folder that an editor hands out (an
  absolute path that ends in the file's name); the rule is asked of any text, so it answers for these too.
- **S7. Sentences E and F live in `hostKeyPin.ts`,** not in `pinClient.ts`: the world of the road tests stands in for the whole
  module `./pinClient`, and a sentence that lived there would be the stand-in's.
- **S8. Who holds the asker.** The three roads: `personPinWriter` binds `windowPinClient`. The agent's exec:
  `SshUseDeps.pinClient`; production's is `windowPinClient` (`sshDepsFor`). The field is optional, as `bridgedSshConfig` and
  `bridgedClient` are, and it fails closed the same way: deps that name no asker refuse every PINNED call as one whose client
  cannot be read (`NO_PIN_CLIENT`, sentence F). So the fifteen test worlds that build these deps need no edit unless their entry
  is pinned, and none of them can start a real `ssh -V` by leaving the field out. *Run with Secrets*: a new member of `SshRoad`,
  `pinClient`, required.
- **S9. The question is asked of the call's own program, folder and environment** (the S1 spec, K5 and K6): the three roads ask
  the bare word `ssh` with the credential's environment and no folder; the agent's exec asks the program and the environment of
  its launch; *Run with Secrets* asks the program and the folder of `spawnLaunch`, with `process.env`.
- **S10. `hostKeyRefused` takes the checked pin** in place of a path (its body, the match, is as it was: E2.S3 replaces the
  function). So the two branches of `agentCommands.ts` (`:216`, `:283`) compile unchanged.
- **S11. What the tests of E1 lose and keep** is §6.5: two tests of `hostKeyWords.test.ts` go (the double quote that named
  `/dev/null`), and each changed expectation is named.
- **S12. The smoke of section 10 is not edited here** (it is E2.S4's). With the world's default it sees no `-V` start, so its
  count of four starts holds after this story; §6.2 says what E2.S4 turns on.

## Binding constraints

- **No plan change.** Build what the parent, the stories document and this document say. If a step cannot be done as written, a
  code block here does not compile, a test is not RED or GREEN as this document says, or `commands/agentCommands.ts` does not have
  797 lines after §4.3: stop and tell the lead. Do not repair the parent, the stories document or this document.
- **A RED proof is a failed assertion, never a compile error** (as in the spec of E1.S1). The new tests read the new exports
  through the module object, and a pin goes through `testPin` (§6.1), so the files of commit c1 compile on the product as E2.S1
  left it. `npm test` runs `tsc` first: read the exit of `tsc` before any test result.
- **Keep what the runner printed.** Save each RED text and quote it in the commit body.
- **`materializeKnownHosts` is not touched**, and no function of `hostKeyTrust.ts` changes its body. `bridgedSshClient.ts`,
  `bridgedSshConfig.ts`, `sshCommand.ts` (Connect's line), `connectionOptions.ts` and `scripts/` are not touched.
- **No new branch on a road.** `commands/agentCommands.ts` changes on 5 lines that exist (§4.3). `wc -l` of it is 797 before and
  after. Reserve C10 (the parent's §3.6) is NOT built: it is not needed.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): 800 lines per file, 50 code lines per function (120 in `src/test/`),
  complexity 4. The code blocks here were linted as they stand (K14).
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history. Never a bare `git stash`. Never commit `.claude/settings.json`. No Python.
- **Local runs** follow `common/local-cpu-budget.md`: through the lowered runner of §*Commands*, one run at a time.
- **Test leftovers.** A real folder of a test is made with `ownedDir` or `ownedFile` of `scripts/lib/leftovers.cjs`. A refused
  folder of §6.4 is a path that is never made.

## Facts that this spec uses

| # | Fact | How it is known |
|---|---|---|
| K1 | The three places that write host-key words on a command line are `hostKeyPin.ts` (`hostKeyWords`, `:162-168`), called by `sshBridge.ts:228` and `sshExecCommand.ts:147`; `sshCommand.ts` (Connect's line, not changed: C4); and the one word of a bridged exec (`sshExecCommand.ts:145`). A bridged call is never given a pin file (`valuesTaken`, `:159-161`), so it gets none of this story | read; the scan of E1 (`hostKeyWords.test.ts`, its part 3) holds the list |
| K2 | **The callers that hand a builder a known-hosts file,** found by the compiler when the option's type changes: `commands/agentCommands.ts:174`, `:200`, `:342`, `:442` (and the two calls of `hostKeyRefused`, `:216`, `:283`); `sshUseActions.ts:271` (through `connectionArgvOptions`, `:229-237`); `remoteLaunch.ts:518`. No other shipped file | measured: `tsc` on a scratch copy with the new type listed these and no other |
| K3 | **Measured 2026-11-18, OpenSSH 10.2p1, `ssh -G`, the client alone.** Under a config that says `KnownHostsCommand /bin/echo x`, `VerifyHostKeyDNS yes` and `LogLevel QUIET` the client resolves `verifyhostkeydns true`, `knownhostscommand /bin/echo x` and `loglevel SILENT` (its name for QUIET). With `-o VerifyHostKeyDNS=no -o KnownHostsCommand=none -o LogLevel=ERROR` on the command line: `verifyhostkeydns false`, `loglevel ERROR`, and NO `knownhostscommand` line. A second `-o` for each of the three, later on the command line, changes nothing (the first value wins). With the first and the third word only, the `knownhostscommand /bin/echo x` line stays | measured; test G1, G2 and G3 of `pinWords.test.ts` ask it again on every run |
| K4 | **The same measurement for a path, as BOTH options, under `-F /dev/null`.** Written as it is: a plain path; a path with `#`, `=`, `,`, `;`, `&`, brackets, `~` inside, `$` without `{`; a single backslash inside (`C:\Users\me\keys`). In double quotes, and resolved to itself in both lists: a space; a pair of apostrophes; one apostrophe; a space and an apostrophe; ` #`; a no-break space; `C:\Users\me\App Data\keys\k`. Bare, the pair of apostrophes resolves the path WITHOUT them in both lists (another file), and one apostrophe ends the client (`invalid quotes`) | measured; tests G4 and G5 |
| K5 | **The refused kinds, measured the same way.** A double quote, bare and in double quotes: `invalid quotes`. Two backslashes: read as one, bare and in double quotes. A backslash before an apostrophe: the backslash is dropped, bare and in double quotes. A backslash at the end: kept bare, `invalid quotes` in double quotes. `%h`: expanded in the person's list, kept in the system-wide one; `%Z`: `unknown key %Z`, the client ends. `${HOME}`: expanded in the person's list only. A tilde at the start: expanded in the person's list only. A tab: splits a bare word; kept in double quotes. DEL: kept, bare and in double quotes. An empty word, bare or as `""`: the client ends | measured |
| K6 | So a control character is refused by the parent's table and by the bridged file's rule (`unsafeSshConfigValue`, `bridgedSshConfig.ts:88-90`), not because this client misreads every one of them: a tab in double quotes and DEL are read as themselves by 10.2p1. E1 wrote a tab in double quotes; E2 refuses it. §3.11 allows the move, and a client older than 8.7 reads such a value with another tokenizer (read, not measured) | K5; the parent's §3.11 |
| K7 | The path of a pin file is `path.join(materializedKeysDir(storageDir), safeFileComponent(name))` (`materializedKeys.ts:124-126`); `safeFileComponent` answers only `[A-Za-z0-9._-]` (`:75-81`). So the kind of a refusal can only come from the storage folder. `knownHostsPath` (`hostKeyTrust.ts:66-68`) is the one builder of the name; `materializeKnownHosts` calls it (`:93`) | read |
| K8 | `materializeKnownHosts` answers `undefined`, and writes nothing, when the text does not parse, the entry has no host, or the host forms no line (`hostKeyTrust.ts:85-92`); it may throw from `mkdirSync` and `writeFileSync` (`:94-95`) | read |
| K9 | **The programs** (the stories document, settled item 4): the three roads start the bare word (`sshExecRunner.ts:95`; `agentCommands.ts:455`); the agent's exec starts `sshSpawnLaunch`'s program with the environment of `agentAwareLaunch` (`sshUseActions.ts:116-130`, `:284-288`, `:339-342`); *Run with Secrets* starts `spawnLaunch`'s program in its `cwd` (`sshRoad.ts:79-88`, `commands/runCommands.ts:587-600`) | read |
| K10 | **The file of the agent's exec is the entry's own**, `known_hosts-<id>` with no suffix (`sshUseActions.ts:236`), and a Connect terminal uses the same name. No call deletes it; the purge of the window removes it (the parent's §3.7). So nothing of this story may delete it either | read |
| K11 | `secretsLaunch` is pure and synchronous (`remoteLaunch.ts:501-507`), has one caller (`commands/runCommands.ts#launchesOf`, which `test/noConnectionSharing.test.ts:150` holds), and `remoteLaunch.ts` imports no `vscode`. `hostKeyTrust.ts` and `keyInstaller.ts` import `vscode`. So what `secretsLaunch` asks must live in a module that imports neither: `hostKeyPin.ts` | read |
| K12 | **What each road reads from the stderr of a pinned run, and what `LogLevel=ERROR` takes away** (§3.12 part 1, *Not measured*). The socket check and the install's probe read one thing: the line `Host key verification failed.` (`hostKeyRefused`); E2.S3 adds the `Offending` line. The client prints both at a level that `ERROR` keeps: measured for the parent on 2026-11-18, the 15 lines of a refused key come back under `LogLevel QUIET` with `-o LogLevel=ERROR`. The install's second run reads lines that start with `creds-install:` or `curl:` (`remoteCliInstall.ts:141-155`): they are the REMOTE command's output, which `ssh` hands on whatever its level. The sweep reads nothing. The bridge's `ssh` has no stdio (`bridgeSpawner.ts:79`). The agent's exec and *Run with Secrets* hand the whole stderr on to their reader | read; the measurement is the parent's |
| K13 | **What a reader of the agent's exec and of *Run with Secrets* no longer sees on a pinned call:** the lines that the client itself prints at `INFO`. By the manual (`ssh_config(5)`, `LogLevel`) and what is known of the client these are the server's banner before the login and notes such as `Warning: Permanently added …` (which a pinned call with strict checking does not print for its host). The remote command's own output is not affected. An unpinned call keeps the person's level | read in the manual, NOT measured: E3's M5 compares the sentences of a pinned and an unpinned entry |
| K14 | The code of this spec as it stands here: `tsc` exit 0; `eslint` clean on every file it changes or adds; `commands/agentCommands.ts` 797 lines; the counts of §6.6 | measured on a scratch copy of `cbeae5b8` with the S1 spec applied, Node 26, Linux, OpenSSH 10.2p1 |

**The enumeration of §3.10, repeated** (`ssh_config(5)` of OpenSSH 10.2p1, read 2026-11-18, by the keywords that name a source of
host keys): `UserKnownHostsFile` and `GlobalKnownHostsFile` (both the pin file since E1); `KnownHostsCommand` (off for a client
that knows it; a client that does not know it has none); `VerifyHostKeyDNS` (off). `UpdateHostKeys` is no source: it adds keys to
the person's file after the host was authenticated, and that file is the pin file of one call. `StrictHostKeyChecking=yes` is what
makes the lists binding. `CheckHostIP` (off by default since 8.5) adds a check and no trust. How it was done: a search of the
manual page for `host key` and `known_hosts`; the coder repeats it (`man ssh_config | grep -n -i 'known_hosts\|host key'`) and says
in the commit body whether another keyword names a source.

**Not measured by this spec:** a login for any row (E3: M7, M8, M10, M12); a client older than 8.7, and one older than 8.5
(E3: M11); Windows' `ssh.exe` (E3: M13); that a login is refused with `VerifyHostKeyDNS yes` in a config and a signed record in a
zone (E3: M10); K13.

## Commands

```bash
cd src_vs_code
LP=../.agents/conventions/tools/low-priority.mjs
node $LP npx tsc -p ./ --noEmit
node $LP npx tsc -p ./
node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/pinWords.test.js"          # one file; any other the same way
node $LP npx eslint src
wc -l src/commands/agentCommands.ts                                                                    # 797
npm test                                                                                               # the whole suite, before each commit of product code
```

## 1. The states of one call

| The saved host key of the entry | The path the pin file would have | The `ssh` program | The call |
|---|---|---|---|
| absent (`undefined`, empty, white space) | not asked | not asked | unpinned: `accept-new`, today's argv, nothing written |
| there | a refused kind | not asked | REFUSED, sentence E; nothing written, nothing started |
| there | can be written | `unreadable` | REFUSED, sentence F; nothing written, nothing started |
| there, and it can be used | can be written | `knows` | pinned: the six pairs |
| there, and it can be used | can be written | `older` | pinned: the six pairs without `KnownHostsCommand=none` |
| there, and it cannot be used | can be written | `knows` or `older` | the three roads: REFUSED, sentence A. The agent's exec: unpinned, as today (C3). Nothing written |
| there | can be written | read | the write throws: the three roads: REFUSED, sentence B. The agent's exec: the error goes on, as today |

*Run with Secrets* holds a pin file that exists already: no file is "unpinned"; a file is asked the rule and then the client, and
is pinned or refused (§5.2).

**Sentence E** (`pinPathSentence(name, kind)`), final words:

```text
The saved host key of "<name>" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with <kind>, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key. To go on, move the storage (user data) folder of the editor to a path without it, or point the editor at another user-data folder.
```

`<kind>` is one of: `a control character`, `a double quote`, `two backslashes in a row (a network path)`, `a backslash before an
apostrophe`, `a backslash at its end`, `a percent sign`, `the characters ${`, `a tilde at its start`.

Against the baseline of §3.11: "ssh would read another file in its place" is not true for every kind (a double quote and `%Z` end
the client; `%h` names two files), so the sentence says what holds for all of them. The last sentence carries the contract's "not
the host and not the saved key". It echoes no path.

**Sentence F** (`pinClientSentence(name, exitCode)`), final words, with a number and with none:

```text
CredsForDevs could not read the version of the ssh program on this computer (exit code <n>), so it did not start a connection that has to check the saved host key of "<name>". Nothing was sent to that host. The reason is the ssh program here, not the host. Check which ssh program is first on your PATH and that it prints its version when run with -V.
CredsForDevs could not read the version of the ssh program on this computer (it did not start, or did not end in time), so it did not start a connection that has to check the saved host key of "<name>". Nothing was sent to that host. The reason is the ssh program here, not the host. Check which ssh program is first on your PATH and that it prints its version when run with -V.
```

It holds the exit code and no other part of the program's output (an exit code of 0 with no version at the start of stderr reads
`exit code 0`). "this computer" is the word of the shipped sentences of the bridged road (`bridgedSshSentences.ts`).

On the three roads both sentences stand behind the opening that a road already writes for a refused value:
`Cannot reach "<name>": ` (the install, `agentCommands.ts:278`), `Cannot bridge to "<name>": ` (the bridge, `:434`), and in the log
`socket check did not run: ` (the check, `:196`). The agent's exec and *Run with Secrets* say them as they are.

## 2. `hostKeyPin.ts`

### 2.1 The change

`NO_KEY_FILE` and `oneFileWord` go, with their docblocks. In their place, from the line where `NO_KEY_FILE` stood to the line
before `HOST_KEY_REFUSED_LINE`: the kinds, the rule, the checked value, the words, the check of a pin file that exists, and the two
sentences. One import is added. `hostKeyRefused` changes its parameter and nothing else. Everything above `knownHostsLine` and
below `hostKeyRefused` is as it was. The file has 373 lines after.

```diff
--- a/src_vs_code/src/hostKeyPin.ts
+++ b/src_vs_code/src/hostKeyPin.ts
@@ -1,3 +1,4 @@
 import { keyFingerprintOf } from './sshKeyParse';
+import type { PinClient, ReadablePinClient } from './pinClient';
 import { DEFAULT_SSH_PORT, isSafeSshHost } from './sshCommand';
 
@@ -135,6 +136,90 @@
 }
 
-/** A known-hosts file that holds no key. It stands in for a pin file whose path cannot be written as one word: see {@link oneFileWord}. */
-const NO_KEY_FILE = '/dev/null';
+/**
+ * Why the path of a pin file cannot be written as the value of the two known-hosts options: the name of each kind, and the words that
+ * sentence E says for it. `ssh` reads the value of both options as a line of a config file, and each of these makes it read another
+ * file, two files, or no file at all.
+ */
+export const PIN_PATH_KINDS = {
+  control: 'a control character',
+  quote: 'a double quote',
+  doubleBackslash: 'two backslashes in a row (a network path)',
+  backslashApostrophe: 'a backslash before an apostrophe',
+  lastBackslash: 'a backslash at its end',
+  percent: 'a percent sign',
+  variable: 'the characters ${',
+  tilde: 'a tilde at its start',
+} as const;
+
+export type PinPathKind = keyof typeof PIN_PATH_KINDS;
+
+/** The refused kinds, in the order they are asked: the first that holds is the answer. */
+const REFUSED_PIN_PATHS: readonly (readonly [PinPathKind, (file: string) => boolean])[] = [
+  ['control', (file) => /[\u0000-\u001f\u007f]/.test(file)],
+  ['quote', (file) => file.includes('"')],
+  ['doubleBackslash', (file) => file.includes('\\\\')],
+  ['backslashApostrophe', (file) => file.includes("\\'")],
+  ['lastBackslash', (file) => file.endsWith('\\')],
+  ['percent', (file) => file.includes('%')],
+  ['variable', (file) => file.includes('${')],
+  ['tilde', (file) => file.startsWith('~')],
+];
+
+/**
+ * The rule of the path of a pin file (G1, §3.11), its refusing half: the kind of the first thing in `file` that keeps `ssh` from
+ * reading it as the one file it is, or `undefined` when the path can be written. It is asked BEFORE a pin file is written, of the
+ * whole path.
+ *
+ * <p><b>Measured 2026-11-18</b>, OpenSSH 10.2p1, `ssh -G -F /dev/null` with the word as both options, the client alone (no login).
+ * A double quote, bare or inside double quotes: `invalid quotes`, the client ends. Two backslashes are read as one, bare and in
+ * double quotes, so a network path names another path. A backslash before an apostrophe is dropped, bare and in double quotes. A
+ * backslash at the end of a word in double quotes: `invalid quotes`. `%h` and `${HOME}` are expanded in the person's list and not in
+ * the system-wide one, so the two words name two files, and `%Z` ends the client. A tilde at the start is expanded in the person's
+ * list only. A tab splits a bare word in two; every control character is refused, as the rule of the bridged file does
+ * (`unsafeSshConfigValue`). No spelling was found that every client reads as the one file in BOTH words, so such a path gets no
+ * word.</p>
+ *
+ * <p>Not measured: a login; a client older than 8.7, which reads such a value with another tokenizer; Windows' `ssh.exe` beyond the
+ * rows of the spec of E1.S1 (K8).</p>
+ */
+export function pinPathRefusal(file: string): PinPathKind | undefined {
+  return REFUSED_PIN_PATHS.find(([, holds]) => holds(file))?.[0];
+}
+
+declare const checkedPinBrand: unique symbol;
+
+/**
+ * The pin file of one call, CHECKED: the only thing the words of a pinned call are written from. Only {@link checkedPin} makes one
+ * (the brand is not exported), so a raw path cannot reach {@link hostKeyWords}, and a path that the rule refuses has no value to give.
+ */
+export interface CheckedPin {
+  readonly [checkedPinBrand]: true;
+  /** The path of the file as it was written to the disk: for the delete, and for the match of `ssh`'s own lines. Never a word of an argv. */
+  readonly file: string;
+  /** The path as the value of both known-hosts options: as it is, or in double quotes. */
+  readonly word: string;
+  /** Whether the client of this call knows `KnownHostsCommand` (OpenSSH 8.5 or newer). */
+  readonly knowsKnownHostsCommand: boolean;
+}
+
+export type PinCheck = { readonly ok: true; readonly pin: CheckedPin } | { readonly ok: false; readonly kind: PinPathKind };
+
+/**
+ * The rule of the path and the client's answer, made into the one value that the words take. A path that the rule refuses answers its
+ * kind and no value. A path with white space or an apostrophe goes in double quotes; every other path is written as it is, byte for
+ * byte. `client` is a version that was READ: a client that cannot be read is no argument of this function, so its call gets no words.
+ *
+ * <p><b>Measured 2026-11-18</b> as in {@link pinPathRefusal}. A pair of apostrophes, bare, resolves ANOTHER path in both lists (the
+ * apostrophes are dropped), and one apostrophe, bare, ends the client (`invalid quotes`). In double quotes both resolve to themselves,
+ * as do a path with a space, one with ` #`, and one with a space and an apostrophe together.</p>
+ */
+export function checkedPin(file: string, client: ReadablePinClient): PinCheck {
+  const kind = pinPathRefusal(file);
+  if (kind !== undefined) {
+    return { ok: false, kind };
+  }
+  const word = /[\s']/.test(file) ? `"${file}"` : file;
+  return { ok: true, pin: { file, word, knowsKnownHostsCommand: client.kind === 'knows' } as CheckedPin };
+}
 
 /**
@@ -144,49 +229,87 @@
  * says `GlobalKnownHostsFile none` (`bridgedSshConfig.ts`), and its argv carries the one word of strictness (`execHostKeyWords`).
  *
- * <p><b>No pin file:</b> `accept-new`, as before. <b>A pin file:</b> strict checking, and that file as the person's known-hosts
- * file AND as the system-wide one. The second is the point (G1, P1). `UserKnownHostsFile` replaces only the person's own files:
- * `ssh` still reads the system-wide ones (`/etc/ssh/ssh_known_hosts`), so a key that such a file lists for the host passed the
- * check beside the pin. The same path twice needs no second name for "no file", which differs between the platforms.</p>
- *
- * <p><b>Measured 2026-11-17</b>, OpenSSH 10.2p1 against a real `sshd` on the loopback, by hand. The pin file held ANOTHER key and
- * a config named a system-wide file with the host's real key: with the first two options the login was accepted; with all three,
- * `Host key verification failed.`, exit code 255. What a client resolves from these words is asked of the PATH's `ssh -G` in
- * `hostKeyWords.test.ts`; no test of the suite asks a real `sshd`.</p>
- *
- * <p><b>What these words do NOT switch off:</b> the sources that only an `ssh` config turns on, `KnownHostsCommand` and
- * `VerifyHostKeyDNS` (candidate C2 of the plan). And the line of a Connect terminal (`sshCommand.ts`) writes its own words, the
- * pin as the person's file only (candidate C4).</p>
+ * <p><b>No pin:</b> `accept-new`, as before, and no other word. <b>A checked pin:</b> the call ASKS `ssh` to take the pin file as its
+ * only source of host keys, and to print a refusal:</p>
  *
- * <p>It always answers words, and with a pin file always strict ones: there is no answer that a caller could read as "no pin".</p>
+ * <ul>
+ * <li>strict checking, and the pin file as the person's known-hosts file AND as the system-wide one (G1, P1): `UserKnownHostsFile`
+ *     alone leaves `/etc/ssh/ssh_known_hosts` read beside it;</li>
+ * <li>`VerifyHostKeyDNS=no`: with `yes` in a config, a key that matches a signed DNS record is trusted;</li>
+ * <li>`KnownHostsCommand=none`, for a client that knows the option (8.5 or newer): a config's command prints more keys. An older
+ *     client has no such option and ends at the word, so it gets none (`pinClient.ts`);</li>
+ * <li>`LogLevel=ERROR`: under a config's `LogLevel QUIET` a refused key prints nothing, and no caller could tell it from a host that
+ *     is down.</li>
+ * </ul>
+ *
+ * <p><b>Measured.</b> 2026-11-17, OpenSSH 10.2p1 against a real `sshd` on the loopback, by hand: the pin file held ANOTHER key and a
+ * config named a system-wide file with the host's real key; with the first two options the login was accepted, with all three it
+ * ended with `Host key verification failed.`, exit code 255. 2026-11-18, `ssh -G` of the same client, under a config that says
+ * `KnownHostsCommand /bin/echo x`, `VerifyHostKeyDNS yes` and `LogLevel QUIET`: with these words it resolves `verifyhostkeydns false`,
+ * `loglevel ERROR` and no `knownhostscommand` line; without the `KnownHostsCommand` word that line stays. What a client resolves is
+ * asked of the PATH's `ssh -G` in the tests. No test of the suite asks a real `sshd`, and that a login is refused with DNS on was not
+ * measured (the plan's E3).</p>
+ *
+ * <p><b>What these words do NOT reach:</b> the nested `ssh` of a jump host, which gets none of them; and the line of a Connect
+ * terminal (`sshCommand.ts`), which writes its own words, the pin as the person's file only (candidate C4 of the plan).</p>
+ *
+ * <p>It always answers words, and with a pin always strict ones: there is no answer that a caller could read as "no pin".</p>
  */
-export function hostKeyWords(pinFile: string | undefined): string[] {
-  if (pinFile === undefined) {
+export function hostKeyWords(pin: CheckedPin | undefined): string[] {
+  if (pin === undefined) {
     return ['-o', 'StrictHostKeyChecking=accept-new'];
   }
-  const file = oneFileWord(pinFile);
-  return ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${file}`, '-o', `GlobalKnownHostsFile=${file}`];
+  const command = pin.knowsKnownHostsCommand ? ['-o', 'KnownHostsCommand=none'] : [];
+  return [
+    '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${pin.word}`, '-o', `GlobalKnownHostsFile=${pin.word}`,
+    '-o', 'VerifyHostKeyDNS=no', ...command, '-o', 'LogLevel=ERROR',
+  ];
 }
 
 /**
- * A path as the value of an option that takes a LIST of files, so that `ssh` reads one file.
- *
- * <p>`ssh` splits the value of both known-hosts options at white space. Measured 2026-11-17 against a real `sshd` (OpenSSH
- * 10.2p1, loopback): a pin file at a bare path with a space is two names, neither is the file, and the call ends with `Host key
- * verification failed.`; in double quotes it is one file and the login is accepted. `ssh -G` of OpenSSH_for_Windows 9.5p2
- * resolves the quoted word to one file too (the client alone; no login was made on Windows).</p>
- *
- * <p>A path with no white space is written as it is, byte for byte.</p>
- *
- * <p>A path that holds a double quote is not written at all. The quote would end the quoted word, two of them can split the path
- * in two, and an `ssh` older than 8.7 knows no escape for it (read, not measured). The answer is {@link NO_KEY_FILE}: with strict
- * checking and no key in either list `ssh` refuses every host (measured as above: `No ED25519 host key is known`, exit code
- * 255, also under a config that trusts the host's key). The call fails; it never trusts a file the pin did not name. Windows
- * allows no double quote in a path, so this is a POSIX case.</p>
+ * Sentence E: the path of the pin file cannot be written for `ssh`, so the call did not start. It names the kind and echoes no path.
+ * The three roads of the person open it with `Cannot reach "<name>": ` or `Cannot bridge to "<name>": `; the agent's exec and Run
+ * with Secrets say it as it is.
  */
-function oneFileWord(file: string): string {
-  if (file.includes('"')) {
-    return NO_KEY_FILE;
+export function pinPathSentence(name: string, kind: PinPathKind): string {
+  return `The saved host key of "${name}" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with ${PIN_PATH_KINDS[kind]}, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key.`;
+}
+
+/**
+ * Sentence F: the `ssh` program could not be asked for its version, so the pinned call did not start. It holds the exit code and no
+ * other part of the program's output.
+ */
+export function pinClientSentence(name: string, exitCode: number | null): string {
+  const how = exitCode === null ? 'it did not start, or did not end in time' : `exit code ${exitCode}`;
+  return `CredsForDevs could not read the version of the ssh program on this computer (${how}), so it did not start a connection that has to check the saved host key of "${name}". Nothing was sent to that host. The reason is the ssh program here, not the host.`;
+}
+
+/** Which thing a refusal of sentence E or F is about: the path of the pin file, or the `ssh` program of this computer. Never a value. */
+export type PinRefusalField = 'known-hosts-file' | 'ssh-program';
+
+/** The pin of a call whose file was written BEFORE (Run with Secrets: Connect's options made it): the checked value, or sentence E or F. */
+export type ExistingPin = { readonly ok: true; readonly pin?: CheckedPin } | { readonly ok: false; readonly field: PinRefusalField; readonly message: string };
+
+/** A pinned call whose client was not asked is refused as one that cannot be read. */
+const NOT_ASKED: PinClient = { kind: 'unreadable', exitCode: null };
+
+/**
+ * Check a pin file that exists already. No file: the call is unpinned, and `client` is not read. A file: the rule of its path first,
+ * then the client's answer (`undefined`, not asked, is refused as unreadable). Pure: it writes and deletes nothing; the caller's own
+ * cleanup deletes the file, as before.
+ */
+export function checkExistingPin(name: string, file: string | undefined, client: PinClient | undefined): ExistingPin {
+  if (file === undefined) {
+    return { ok: true };
+  }
+  const kind = pinPathRefusal(file);
+  return kind === undefined ? withClient(name, file, client ?? NOT_ASKED) : { ok: false, field: 'known-hosts-file', message: pinPathSentence(name, kind) };
+}
+
+function withClient(name: string, file: string, client: PinClient): ExistingPin {
+  if (client.kind === 'unreadable') {
+    return { ok: false, field: 'ssh-program', message: pinClientSentence(name, client.exitCode) };
   }
-  return /\s/.test(file) ? `"${file}"` : file;
+  const checked = checkedPin(file, client);
+  return checked.ok ? { ok: true, pin: checked.pin } : { ok: false, field: 'known-hosts-file', message: pinPathSentence(name, checked.kind) };
 }
 
@@ -212,6 +335,6 @@
  * says that a host is the saved one.</p>
  */
-export function hostKeyRefused(pinFile: string | undefined, stderr: string): boolean {
-  return pinFile !== undefined && stderr.split(/\r?\n/).includes(HOST_KEY_REFUSED_LINE);
+export function hostKeyRefused(pin: CheckedPin | undefined, stderr: string): boolean {
+  return pin !== undefined && stderr.split(/\r?\n/).includes(HOST_KEY_REFUSED_LINE);
 }
 
```

### 2.2 The rule, as a table (test P1 of `pinWords.test.ts` holds one row per line of it)

| The path holds | The answer | The measurement (K4, K5) |
|---|---|---|
| a control character (below 0x20, or 0x7F) | REFUSED `control` | a tab splits a bare word; the parent's table and the bridged rule refuse them all (K6) |
| a double quote | REFUSED `quote` | `invalid quotes`, bare and quoted |
| two backslashes in a row | REFUSED `doubleBackslash` | read as one: another path (a storage folder on a network path) |
| a backslash before an apostrophe | REFUSED `backslashApostrophe` | the backslash is dropped: another path |
| a backslash at its end | REFUSED `lastBackslash` | `invalid quotes` in double quotes (S6) |
| a percent sign | REFUSED `percent` | two files, or the client ends |
| the two characters `${` | REFUSED `variable` | two files |
| a tilde at its start | REFUSED `tilde` | two files (S6) |
| none of these, and white space or an apostrophe | the path in double quotes, in both words | resolved to itself in both lists |
| none of these | the path as it is, byte for byte | as today |

The refused kinds are asked in this order, and the first that holds is the answer (a path with a tab and a double quote is
`control`). White space is `\s` of JavaScript, which is wider than what `ssh` splits at; double quotes keep each of them (a
no-break space was measured).

### 2.3 Why the type is as it is

- **`CheckedPin` carries a brand that is not exported** (`declare const checkedPinBrand: unique symbol`). An object literal in
  another module cannot have that property, so `{ file, word, knowsKnownHostsCommand }` written anywhere else does not compile as a
  `CheckedPin`. The one cast stands in `checkedPin`; test S2 of `pinWords.test.ts` holds that no other shipped file casts to the
  type.
- **`checkedPin` takes a `ReadablePinClient`.** `{ kind: 'unreadable' }` is no argument of it: a caller must first tell the
  unreadable client apart, and that branch is the refusal. So "a builder that names a pin file without the client's answer does
  not compile" (§3.10) holds through the type of the option (§2.4).
- **`file` and `word` are two fields.** `word` goes into the argv. `file` is the path on the disk: the guards delete it, and
  E2.S3 matches `ssh`'s own `Offending` line against it. `hostKeyWords` reads `word` and `knowsKnownHostsCommand` only.
- **`checkExistingPin`** is the pure check of *Run with Secrets* (L2, K11). A pinned call whose client was NOT asked (`undefined`)
  is refused as one that cannot be read: the absent answer never reads as "older".

### 2.4 The two builders

```diff
--- a/src_vs_code/src/sshExecCommand.ts
+++ b/src_vs_code/src/sshExecCommand.ts
@@ -1,3 +1,3 @@
-import { hostKeyWords } from './hostKeyPin';
+import { CheckedPin, hostKeyWords } from './hostKeyPin';
 import { EntityMetadata } from './types';
 import { DEFAULT_SSH_PORT, isSafeSshTarget } from './sshCommand';
@@ -8,5 +8,6 @@
 export interface SshExecOptions {
   jump?: string;
-  knownHostsFile?: string;
+  /** The pin file of the call, CHECKED (`checkedPin`, G1 §3.10-§3.11): absent for an unpinned call. A raw path is not taken. */
+  knownHostsFile?: CheckedPin;
   /** A bridged call: ONE fresh connection that carries the command and nothing else, whatever the entry or a config file says (Amendment 3, C.1-C.2). */
   bridged?: boolean;
--- a/src_vs_code/src/sshBridge.ts
+++ b/src_vs_code/src/sshBridge.ts
@@ -1,3 +1,3 @@
-import { hostKeyWords } from './hostKeyPin';
+import { CheckedPin, hostKeyWords } from './hostKeyPin';
 import { NO_CONNECTION_SHARING, SshExecAuth } from './sshExecCommand';
 import { EntityMetadata } from './types';
@@ -81,5 +81,6 @@
   /** Materialized private key, when the entity authenticates with one. */
   readonly keyPath?: string;
-  readonly knownHostsFile?: string;
+  /** The pin file of the bridge, CHECKED (`checkedPin`, G1 §3.10-§3.11): absent for an unpinned entry. A raw path is not taken. */
+  readonly knownHostsFile?: CheckedPin;
   /**
    * How this entity authenticates — the same two modes an agent exec has.
```

`execHostKeyWords` and `buildBridgeArgv` call `hostKeyWords(options.knownHostsFile)` as before; nothing else of the two files
changes. The words stand where they stood, before every word of the entry and of a caller's `extra` (`sshBridge.ts:226-228`), so
a caller's own word for one of the six options comes second, and `ssh` takes the first (K3; test W5).

## 3. `pinOfCall.ts` (new): the decision of one call

### 3.1 The file

```ts
import { CheckedPin, PinPathKind, PinRefusalField, checkedPin, pinClientSentence, pinPathRefusal, pinPathSentence } from './hostKeyPin';
import { knownHostsPath, materializeKnownHosts } from './hostKeyTrust';
import { forgetMaterializedKey } from './keyInstaller';
import type { PinClientAsk, PinClientCall, ReadablePinClient } from './pinClient';
import type { EntityMetadata } from './types';

/**
 * The pin of ONE call that the extension starts with no terminal, off a bridge (G1, E2: the plan's §3.10 and §3.11): decided before
 * anything is written or started. Every such road asks here: the three roads of the person (`personPin.ts`), the agent's exec
 * (`sshUseActions.ts`). Run with Secrets over SSH holds a pin file that Connect's options wrote before, and asks `checkExistingPin`
 * (`hostKeyPin.ts`) in its place.
 *
 * <p>The order of {@link decidePinOfCall} is the contract. (1) An entry with no saved host key is asked nothing and gets nothing.
 * (2) The rule of the path is asked of the WHOLE path the pin file would have, before a file is written. (3) The `ssh` program the
 * call will start is asked for its version. (4) Only then is the file written, by `materializeKnownHosts`, unchanged. The value for
 * the words is made from the path that was written.</p>
 *
 * <p>Sentences E and F are written here for every road, so that the roads cannot say two things for one refusal.</p>
 */

export type PinDecision =
  /** The entry has no saved host key: the call is unpinned, as before. */
  | { readonly kind: 'none' }
  /** The pin file was written, and its path and the client are checked. */
  | { readonly kind: 'pinned'; readonly pin: CheckedPin }
  /** The saved host key is there and cannot be used (`materializeKnownHosts` answered none). Nothing was written. */
  | { readonly kind: 'unusable' }
  /** The write threw. */
  | { readonly kind: 'unwritten'; readonly error: unknown }
  /** Sentence E or F: nothing may start. */
  | { readonly kind: 'refused'; readonly field: PinRefusalField; readonly message: string };

export interface PinOfCallParts {
  readonly storageDir: string;
  /** The snapshot of the entry that the call holds. */
  readonly entity: EntityMetadata;
  readonly ask: PinClientAsk;
  /** What makes the file this call's alone (a uuid, never vault data). Absent: the entry's own file, `known_hosts-<id>`, which other calls share. */
  readonly suffix?: string;
}

/** Absent is not unusable: the same trim that `parseHostKey` does. */
export function pinAbsent(hostKey: string | undefined): boolean {
  return (hostKey ?? '').trim() === '';
}

const refusedPath = (name: string, kind: PinPathKind): PinDecision => ({ kind: 'refused', field: 'known-hosts-file', message: pinPathSentence(name, kind) });
const refusedClient = (name: string, exitCode: number | null): PinDecision => ({ kind: 'refused', field: 'ssh-program', message: pinClientSentence(name, exitCode) });

/** Decide the pin of one call. `call` says how the call's `ssh` will be started: its program word, its folder, its environment. It never throws. */
export async function decidePinOfCall(parts: PinOfCallParts, call: PinClientCall): Promise<PinDecision> {
  const { storageDir, entity, suffix } = parts;
  if (pinAbsent(entity.hostKey)) {
    return { kind: 'none' };
  }
  const kind = pinPathRefusal(knownHostsPath(storageDir, entity.id, suffix));
  if (kind !== undefined) {
    return refusedPath(entity.name, kind);
  }
  const client = await parts.ask(call);
  return client.kind === 'unreadable' ? refusedClient(entity.name, client.exitCode) : written(parts, client);
}

/** The write. `undefined` from it: the saved key is there and cannot be used. */
function written(parts: PinOfCallParts, client: ReadablePinClient): PinDecision {
  let file: string | undefined;
  try {
    file = materializeKnownHosts(parts.storageDir, parts.entity, parts.suffix);
  } catch (error) {
    return { kind: 'unwritten', error };
  }
  return file === undefined ? { kind: 'unusable' } : checkedOf(parts, file, client);
}

/**
 * The value for the words, from the path that was WRITTEN. The rule passed for the path that was planned, and both come from
 * `knownHostsPath`, so the refusal here is reached only if the two ever differ: then a file that is this call's alone is deleted, and
 * the call is refused. The entry's own file (no suffix) is never deleted here: other calls read it.
 */
function checkedOf(parts: PinOfCallParts, file: string, client: ReadablePinClient): PinDecision {
  const checked = checkedPin(file, client);
  if (checked.ok) {
    return { kind: 'pinned', pin: checked.pin };
  }
  if (parts.suffix !== undefined) {
    forgetMaterializedKey(file);
  }
  return refusedPath(parts.entity.name, checked.kind);
}
```

### 3.2 Every way out of `decidePinOfCall`

| # | What holds | The answer | Asked | Written | Deleted |
|---|---|---|---|---|---|
| 1 | no saved host key | `none` | nothing | nothing | nothing |
| 2 | the planned path is of a refused kind | `refused`, `known-hosts-file`, sentence E | the rule | nothing | nothing |
| 3 | the client is `unreadable` | `refused`, `ssh-program`, sentence F | the rule, the client | nothing | nothing |
| 4 | `materializeKnownHosts` throws | `unwritten`, with the error | the rule, the client | maybe a part of a file (C14 of the parent, as before) | nothing |
| 5 | `materializeKnownHosts` answers none | `unusable` | the rule, the client | nothing | nothing |
| 6 | the written path passes the rule | `pinned`, with the checked pin | the rule twice, the client | the pin file | nothing here: the caller owns the file |
| 7 | the written path is refused (it differs from the planned one: S2) | `refused`, `known-hosts-file`, sentence E | the rule twice, the client | the pin file | the pin file, when it is this call's alone (`suffix`); the entry's own file never (K10) |

It never throws while the asker keeps its contract (the S1 spec, §2.3: it never throws).

### 3.3 `hostKeyTrust.ts`: one export

```diff
--- a/src_vs_code/src/hostKeyTrust.ts
+++ b/src_vs_code/src/hostKeyTrust.ts
@@ -64,5 +64,5 @@
  * trusts — outside the directory the purge can reach. See `safeFileComponent`.</p>
  */
-function knownHostsPath(storageDir: string, entityId: string, suffix?: string): string {
+export function knownHostsPath(storageDir: string, entityId: string, suffix?: string): string {
   return materializedKeyPath(storageDir, `known_hosts-${entityId}${suffix === undefined ? '' : `-${suffix}`}`);
 }
```

Its docblock stays. No test of `keysDirPaths.test.ts` changes: the function still builds the path through `materializedKeyPath`.

## 4. The three roads of the person

### 4.1 `personPin.ts` (the whole file)

```ts
import { randomUUID } from 'node:crypto';
import { describeError } from './describeError';
import { PinClientAsk, windowPinClient } from './pinClient';
import { PinDecision, decidePinOfCall } from './pinOfCall';
import type { SshExecAuth } from './sshExecCommand';
import type { EntityMetadata } from './types';
import type { PinOfCall, PinWriter } from './writtenKey';

/**
 * The saved host key of ONE call on the three roads of the person (G1): the bridge socket check, *Install creds on host* and
 * *Open Remote Bridge…*. One of three answers, and never a throw:
 *
 * <ul>
 * <li>the entry has no saved host key (`hostKey` is absent, empty or only white space): unpinned, nothing is asked and nothing is
 *     written;</li>
 * <li>the saved host key can be used: it is written to a file of this call alone, `known_hosts-<entry id>-<uuid>`, and the answer
 *     holds the CHECKED pin (`hostKeyPin.ts`: its path by the rule, its client by its version);</li>
 * <li>refused, with the sentence for the person: the saved host key is there and cannot be used (A), its file cannot be written (B),
 *     the path of its file cannot be handed to `ssh` (E), or the `ssh` program cannot be asked for its version (F). E and F are
 *     decided BEFORE a file is written.</li>
 * </ul>
 *
 * <p>It is called by the guards of `writtenKey.ts` and by nothing else: they keep the path and delete the file. The decision, its
 * order and the write are `decidePinOfCall` (`pinOfCall.ts`), which the agent's exec asks too; `materializeKnownHosts` is unchanged.</p>
 */

/** The program that the three roads start: the bare word, found on `PATH` (`runSshExec`'s default, and the bridge's own `'ssh'`). */
export const PERSON_SSH_PROGRAM = 'ssh';

/**
 * Sentence A: the saved host key is there and cannot be used. The login of the call chooses the form: a password entry is never
 * sent to Connect SSH, because Connect sends the password without a check of the host when its key scan answers nothing.
 */
export function unusablePinSentence(name: string, auth: SshExecAuth): string {
  const opening = `The saved host key of "${name}" cannot be used, so nothing was sent to that host. `;
  return auth === 'askpass'
    ? `${opening}Do not use Connect SSH to save it again: this entry signs in with a password, and when Connect SSH cannot read the host's key first, it sends the password without checking the host. There is no safe repair for such an entry yet; the bridge and the install stay refused for it.`
    : `${opening}Get the host's key fingerprint from the person who runs the server. Then use Connect SSH on this entry, and go on only if it shows that fingerprint: Trust and connect saves the key.`;
}

/** Sentence B: the file of the saved host key could not be written. */
export function pinWriteFailedSentence(name: string, error: unknown): string {
  return `Could not write the saved host key of "${name}" to disk: ${describeError(error)}`;
}

/** What a pin writer of the person is built from: the window's storage folder, the call's snapshot of the entry, and the asker of the client. */
export interface PersonPinParts {
  readonly storageDir: string;
  readonly entity: EntityMetadata;
  readonly ask: PinClientAsk;
}

/** The sentence of a decision that starts nothing: E or F as they were written, A by the login, B with the cause. */
function refusalOf(name: string, auth: SshExecAuth, decided: Exclude<PinDecision, { kind: 'none' | 'pinned' }>): string {
  if (decided.kind === 'refused') {
    return decided.message;
  }
  return decided.kind === 'unusable' ? unusablePinSentence(name, auth) : pinWriteFailedSentence(name, decided.error);
}

/**
 * Decide the pin of one call, and write its file when there is one to write. `auth` only chooses the form of sentence A; `env` is the
 * environment the call's `ssh` will be started with, so the question about the client finds the program that the call will find.
 */
export async function writePersonPin(parts: PersonPinParts, auth: SshExecAuth, env: NodeJS.ProcessEnv): Promise<PinOfCall> {
  const decided = await decidePinOfCall({ ...parts, suffix: randomUUID() }, { program: PERSON_SSH_PROGRAM, env });
  if (decided.kind === 'none') {
    return { ok: true };
  }
  return decided.kind === 'pinned' ? { ok: true, knownHostsFile: decided.pin } : { ok: false, message: refusalOf(parts.entity.name, auth, decided) };
}

/** The pin writer of one call of a road, with this window's asker: what a road hands its guard. */
export function personPinWriter(storageDir: string, entity: EntityMetadata): PinWriter {
  return (auth, env) => writePersonPin({ storageDir, entity, ask: windowPinClient }, auth, env);
}
```

`isAbsent` moved to `pinOfCall.ts` as `pinAbsent`. Sentences A and B keep their words. The writer is asynchronous, takes its three
parts as one object (a test names its own asker), and gets the environment of the credential (S9).

### 4.2 `writtenKey.ts`: the guards

```diff
--- a/src_vs_code/src/writtenKey.ts
+++ b/src_vs_code/src/writtenKey.ts
@@ -1,2 +1,3 @@
+import type { CheckedPin } from './hostKeyPin';
 import { forgetMaterializedKey } from './keyInstaller';
 import type { ExecAuth } from './sshExecAuth';
@@ -20,14 +21,21 @@
  */
 
-/** What the pin writer of one call answers: no pin, a pin file written now, or a refusal with its sentence. It never throws. */
+/**
+ * What the pin writer of one call answers: no pin, a pin file written now and CHECKED (its path by the rule, its client by its version:
+ * `checkedPin`), or a refusal with its sentence. It never throws.
+ */
 export type PinOfCall =
-  | { readonly ok: true; readonly knownHostsFile?: string }
+  | { readonly ok: true; readonly knownHostsFile?: CheckedPin }
   | { readonly ok: false; readonly message: string };
 
-/** The pin writer of one call, bound to the call's storage folder and to its snapshot of the entry. `auth` is the login of the credential. */
-export type PinWriter = (auth: SshExecAuth) => PinOfCall;
+/**
+ * The pin writer of one call, bound to the call's storage folder and to its snapshot of the entry. `auth` is the login of the credential
+ * and `env` the environment its `ssh` will be started with. It is asynchronous since E2: before it writes, it asks the `ssh` program for
+ * its version, and that is a spawn.
+ */
+export type PinWriter = (auth: SshExecAuth, env: NodeJS.ProcessEnv) => Promise<PinOfCall>;
 
 /** The call may start `ssh`: the credential, and `knownHostsFile` when the entry is pinned. */
-export type ReadyCall = Extract<ExecAuth, { ok: true }> & { readonly knownHostsFile?: string };
+export type ReadyCall = Extract<ExecAuth, { ok: true }> & { readonly knownHostsFile?: CheckedPin };
 
 /** The call starts nothing: the refusal of the credential as it is, or the refusal of the pin in the same shape. */
@@ -66,14 +74,14 @@
  * credential goes on as it is; a refused pin goes on as a refusal with the pin's sentence and the credential's warning.
  */
-function decide(credential: ExecAuth, writePin: PinWriter): Decided {
+async function decide(credential: ExecAuth, writePin: PinWriter): Promise<Decided> {
   if (!credential.ok) {
     return { call: credential };
   }
-  const pin = writePin(credential.auth);
+  const pin = await writePin(credential.auth, credential.env);
   if (!pin.ok) {
     return { call: { ok: false, message: pin.message, warning: credential.warning } };
   }
-  const pinFile = pin.knownHostsFile;
-  return pinFile === undefined ? { call: credential } : { call: { ...credential, knownHostsFile: pinFile }, pinFile };
+  const checked = pin.knownHostsFile;
+  return checked === undefined ? { call: credential } : { call: { ...credential, knownHostsFile: checked }, pinFile: checked.file };
 }
 
@@ -87,5 +95,5 @@
   let pinFile: string | undefined;
   try {
-    const decided = decide(credential, writePin);
+    const decided = await decide(credential, writePin);
     pinFile = decided.pinFile;
     return await run(decided.call);
@@ -115,15 +123,19 @@
  * exactly one of the two deletes runs, on every path, and it deletes both files. `start` is synchronous on purpose: no `await`
  * stands between the start and the attach.</p>
+ *
+ * <p><b>The one `await` of this guard</b> (E2) is the decision, BEFORE `start`: the pin writer asks the `ssh` program for its version.
+ * It stands inside the `try`, so while it waits both files are this guard's: a decision that rejects, and a window that goes away
+ * while it waits, end in the `finally`, which deletes what was written. From `start` to the flag the guard is synchronous, as before.</p>
  */
-export function withWrittenKeyUntilExit<T extends Started>(
+export async function withWrittenKeyUntilExit<T extends Started>(
   credential: ExecAuth,
   writePin: PinWriter,
   start: (call: CallAuth) => T | undefined,
-): T | undefined {
+): Promise<T | undefined> {
   let pinFile: string | undefined;
   let handed = false;
   const forget = (): void => forgetBoth(credential, pinFile);
   try {
-    const decided = decide(credential, writePin);
+    const decided = await decide(credential, writePin);
     pinFile = decided.pinFile;
     const started = start(decided.call);
```

**Every way out of `withWrittenKeyUntilExit` after the change** (the first column is where the guard is when it happens):

| # | Where | What happens | The key file | The pin file | The caller gets |
|---|---|---|---|---|---|
| 1 | before the decision | the credential is not `ok` | none to delete | none written | `start(refused)`'s answer (the roads answer `undefined`) |
| 2 | at the `await` | the writer answers a refusal (A, B, E, F) | deleted by the `finally`, after `start` answered `undefined` | none written (E, F, A), or a part of one (B: C14) | `undefined` |
| 3 | at the `await` | the writer rejects or throws (it must not) | deleted by the `finally` | not known to the guard | the same error, as a rejection |
| 4 | at the `await` | the window goes away while the decision waits | when the writer settles: as rows 2 or 3 if it refused or failed; otherwise the guard goes on to `start`, and the already disposed manager spawns NOTHING and answers `undefined`, so both files are deleted at once, as row 5 (changed by the code gate on G1 Epic 2: the manager used to spawn and kill at once, and an `ssh` killed right after its spawn could still connect in between; the check now stands before the spawn. Corrected 2026-11-18 after the Opus review: the `finally` does not run for the window's sake). The runner's time limit bounds the wait (10 s) | as rows 2, 3 or 5 | as those rows |
| 5 | after the `await`, in `start` | `start` answers `undefined` (no argv, a refused value) | deleted at once | deleted at once | `undefined` |
| 6 | in `start` | `start` throws | deleted at once | deleted at once | the same error, as a rejection |
| 7 | after `start` | the attach throws (a process with no `exited`) | deleted at once (`handed` is false) | deleted at once | the same error |
| 8 | after `start` | the attach worked, `handed = true` | deleted once, when the process has ended | deleted once, with it | the started thing |

**What becomes of N16's proof** ("exactly one of the two deletes runs, on every path, and it deletes both files"). The proof reads
the statements from `start(...)` to `handed = true`. They are the same statements in the same order, and no `await` stands among
them: test U21 reads the source and fails when one does. The one `await` stands before them, inside the `try`. While it waits,
`handed` is false, so a rejection there runs the `finally`'s delete and no continuation exists yet: rows 3 and 4. After it,
`pinFile` is set by the next statement, which cannot throw. So on every path either the `finally` deletes (rows 1 to 7) or the one
continuation does (row 8), never both and never neither. What is new is only that the caller gets a promise: a synchronous throw
of `start` now reaches the caller as a rejection of that promise, and the one caller awaits it (§4.3).

`withWrittenKey` was asynchronous already; it gains the same `await` before `run`, inside its `try`.

### 4.3 `commands/agentCommands.ts`: five lines change, none is added

```diff
--- a/src_vs_code/src/commands/agentCommands.ts
+++ b/src_vs_code/src/commands/agentCommands.ts
@@ -24,5 +24,5 @@
 import { resolveExecAuth } from '../sshExecAuth';
 import { ReadyCall, withWrittenKey, withWrittenKeyUntilExit } from '../writtenKey';
-import { writePersonPin } from '../personPin';
+import { personPinWriter } from '../personPin';
 import { hostKeyRefused, refusedHostKeySentence } from '../hostKeyPin';
 import { probeCommand, blockerFor, interpretProbe, confirmationFor, installCommand, interpretInstall } from '../remoteCliInstall';
@@ -167,5 +167,5 @@
     entity: EntityMetadata,
     keyPath: string | undefined,
-    knownHostsFile: string | undefined,
+    knownHostsFile: ReadyCall['knownHostsFile'],
     user: string,
     auth: SshExecAuth = 'key',
@@ -192,5 +192,5 @@
         return;
       }
-      await withWrittenKey(await resolveExecAuth(storage, accountId, entity, storageDir), (auth) => writePersonPin(storageDir, entity, auth), async (credential) => {
+      await withWrittenKey(await resolveExecAuth(storage, accountId, entity, storageDir), personPinWriter(storageDir, entity), async (credential) => {
         if (!credential.ok) {
           log.info('bridge', `socket check did not run: ${credential.message}`);
@@ -271,5 +271,5 @@
     }
 
-    await withWrittenKey(await resolveExecAuth(storage, accountId, details, storageDir, clickOpener(storage, accountId, 'connect')), (auth) => writePersonPin(storageDir, details, auth), async (credential) => {
+    await withWrittenKey(await resolveExecAuth(storage, accountId, details, storageDir, clickOpener(storage, accountId, 'connect')), personPinWriter(storageDir, details), async (credential) => {
       if (credential.warning !== undefined) {
         void vscode.window.showWarningMessage(credential.warning);
@@ -427,5 +427,5 @@
     }
     // N16, G1: the key file and the pin file of this call are this command's to delete until the bridge's ssh holds them; then that ssh's end deletes them.
-    const bridge = withWrittenKeyUntilExit(await resolveExecAuth(storage, accountId, details, storageDir, clickOpener(storage, accountId, 'connect')), (auth) => writePersonPin(storageDir, details, auth), (credential) => {
+    const bridge = await withWrittenKeyUntilExit(await resolveExecAuth(storage, accountId, details, storageDir, clickOpener(storage, accountId, 'connect')), personPinWriter(storageDir, details), (credential) => {
       if (credential.warning !== undefined) {
         void vscode.window.showWarningMessage(credential.warning);
```

- The import names `personPinWriter` (`:26`). The request string `../personPin` does not change.
- `sweepDeadSockets` takes `ReadyCall['knownHostsFile']` (`:169`): the type of the checked pin, with no new import.
- The three writers are `personPinWriter(storageDir, entity)` (`:194`) and `personPinWriter(storageDir, details)` (`:273`, `:429`).
- The bridge's guard is awaited (`:429`): `const bridge = await withWrittenKeyUntilExit(await resolveExecAuth(…), …)`. The
  handler is `async` already. Nothing stands between the resolve and the guard, as N16 asks: the inner `await` is an argument of
  the call.
- The four argv calls (`:174`, `:200`, `:342`, `:442`) and the two calls of `hostKeyRefused` (`:216`, `:283`) do not change a
  character: `credential.knownHostsFile` is now a `CheckedPin`, and the builders and the function take one.

**The line count, measured:** 797 before, 797 after (`wc -l`). Three lines stay under the limit of 800. The parent's §3.6 allowed
at most 3 added lines for this story; it adds none, so reserve C10 is not built. E2.S3 states its own count.

### 4.4 What a person sees on each road, as far as this story changes it

| Road | A refused path (E) | A client that cannot be read (F) | Otherwise |
|---|---|---|---|
| *Install creds on host* | one error message, `Cannot reach "<name>": ` and sentence E | the same with sentence F | as before |
| *Open Remote Bridge…* | one error message, `Cannot bridge to "<name>": ` and sentence E; no bridge, no *bridged* row, no `Bridge open` message, no socket check | the same with sentence F | as before |
| the socket check | cannot be reached with E: the bridge's own command reads the same folder and was refused first | a log line, `socket check did not run: ` and sentence F, when the client could be read for the bridge and not for the check (test F3); C15 of the parent stays: it is a log line | as before |

A pinned entry on a client below 8.5 sees no message: its call runs with five pairs.

## 5. The two other roads through the same builder

### 5.1 The agent's exec (`sshUseActions.ts`)

Today `connectionArgvOptions` (`:229-237`) writes the pin file itself, when the argv is built. After this story the pin is decided
first, by `decidePinOfCall` with no suffix (the entry's own file, K10), and the argv gets the checked pin. The program and the
environment of the launch are decided before the pin, because the question about the client is asked of that program (S9).

```diff
--- a/src_vs_code/src/sshUseActions.ts
+++ b/src_vs_code/src/sshUseActions.ts
@@ -19,5 +19,7 @@
 import { BridgedClientCheck, bridgedSshClientCheck } from './bridgedSshClient';
 import { BridgedFiles, Launch, bridgedLaunch, isResult } from './bridgedSshRoad';
-import { materializeKnownHosts } from './hostKeyTrust';
+import type { CheckedPin } from './hostKeyPin';
+import { PinClientAsk, windowPinClient } from './pinClient';
+import { decidePinOfCall } from './pinOfCall';
 import { runSshExec } from './sshExecRunner';
 import { notStarted } from './requestLife';
@@ -94,4 +96,10 @@
    */
   bridgedClient?: BridgedClientCheck;
+  /**
+   * The asker of a PINNED call off a bridge (G1, §3.10): what the `ssh` the call will start says of its version. Production's is `windowPinClient`
+   * (`sshDepsFor`). Optional for the reason `bridgedSshConfig` is: a pinned call with no asker is refused as one whose client cannot be read
+   * (`NO_PIN_CLIENT`), so no pinned `ssh` runs unasked and no test world starts a real `ssh -V` by leaving it out. An unpinned call is never asked.
+   */
+  pinClient?: PinClientAsk;
 }
 
@@ -228,11 +236,35 @@
  */
 function connectionArgvOptions(
-  deps: SshUseDeps,
-  entity: EntityMetadata,
+  pin: CheckedPin | undefined,
   jump: string | undefined,
   bridged: boolean,
-): { jump?: string; knownHostsFile?: string; bridged: boolean } {
+): { jump?: string; knownHostsFile?: CheckedPin; bridged: boolean } {
   // On a bridge the pin is written into the per-call file (`bridgedSshCall.ts`), and no word of the argv names a known-hosts file.
-  return { jump, knownHostsFile: bridged ? undefined : materializeKnownHosts(deps.storageDir, entity), bridged };
+  return { jump, knownHostsFile: bridged ? undefined : pin, bridged };
+}
+
+/** The pin of a call off a bridge, decided before its file is written, or the refusal of sentence E or F (`pinOfCall.ts`). */
+type LocalPin = { readonly ok: true; readonly pin?: CheckedPin } | { readonly ok: false; readonly message: string };
+
+/** What stands in for an asker that the deps do not name: the client was not asked, so it cannot be read, and a pinned call is refused (sentence F). */
+const NO_PIN_CLIENT: PinClientAsk = () => Promise.resolve({ kind: 'unreadable', exitCode: null });
+
+/** The asker of the client: the one the deps name. */
+const askerOf = (deps: SshUseDeps): PinClientAsk => deps.pinClient ?? NO_PIN_CLIENT;
+
+/**
+ * Decide the pin of a call off a bridge. `launch` is how the call's `ssh` will be started, so the client that is asked is the one that will run.
+ * An entry with no saved host key, and one whose saved key cannot be used, run with no pin, as before (the plan's C3 stays as it is). A write
+ * that failed goes on as its error, as before. The file is the entry's own, `known_hosts-<id>`: other calls read it, so nothing here deletes it.
+ */
+async function localPin(deps: SshUseDeps, entity: EntityMetadata, launch: { program: string; env: NodeJS.ProcessEnv }): Promise<LocalPin> {
+  const decided = await decidePinOfCall({ storageDir: deps.storageDir, entity, ask: askerOf(deps) }, { program: launch.program, env: launch.env });
+  if (decided.kind === 'unwritten') {
+    throw decided.error;
+  }
+  if (decided.kind === 'refused') {
+    return { ok: false, message: decided.message };
+  }
+  return decided.kind === 'pinned' ? { ok: true, pin: decided.pin } : { ok: true };
 }
 
@@ -262,5 +294,4 @@
  */
 function execArgv(
-  deps: SshUseDeps,
   ctx: UseActionContext,
   call: OverSshCall,
@@ -268,7 +299,8 @@
   jump: string | undefined,
   socket: string | undefined,
+  pin: CheckedPin | undefined,
 ): string[] {
   return buildSshExecArgv(call.ssh, prepared.keyPath, call.remoteCommand, prepared.auth, {
-    ...connectionArgvOptions(deps, call.ssh, jump, ctx.bridge !== undefined),
+    ...connectionArgvOptions(pin, jump, ctx.bridge !== undefined),
     ownAgent: call.ownAgentOnly ? hasAgentSocket(socket) : undefined,
     noTty: call.noTty,
@@ -281,9 +313,16 @@
 }
 
-/** The launch of a call off a bridge: the lines this road has always run. */
-function localLaunch(deps: SshUseDeps, ctx: UseActionContext, call: OverSshCall, prepared: { keyPath?: string; env: NodeJS.ProcessEnv; auth: SshExecAuth }, jump: string | undefined): Launch {
+/**
+ * The launch of a call off a bridge, or the refusal of its pin (sentence E or F: nothing is written and no `ssh` starts). The program and the
+ * environment are decided first, because the pin's question about the client is asked of that program.
+ */
+async function localLaunch(deps: SshUseDeps, ctx: UseActionContext, call: OverSshCall, prepared: { keyPath?: string; env: NodeJS.ProcessEnv; auth: SshExecAuth }, jump: string | undefined, refuse: Refuse): Promise<Launch | UseActionResult> {
   const socket = deps.agentSocket(); // read ONCE: the argv and the environment below are decided from this one answer
-  const argv = execArgv(deps, ctx, call, prepared, jump, socket);
-  return { argv, ...agentAwareLaunch(deps, call.ssh, socket, childEnv(call, prepared.env)) };
+  const launch = agentAwareLaunch(deps, call.ssh, socket, childEnv(call, prepared.env));
+  const pin = await localPin(deps, call.ssh, launch);
+  if (!pin.ok) {
+    return refuse('no_credential', pin.message);
+  }
+  return { argv: execArgv(ctx, call, prepared, jump, socket, pin.pin), ...launch };
 }
 
@@ -322,5 +361,5 @@
     return refuse('no_credential', chain.reason, chain.second);
   }
-  const launch = ctx.bridge === undefined ? localLaunch(deps, ctx, call, prepared, chain.value) : await bridgedLaunch({ ...bridgedParts(deps, ctx), ctx, call, prepared, chain, refuse }, held);
+  const launch = ctx.bridge === undefined ? await localLaunch(deps, ctx, call, prepared, chain.value, refuse) : await bridgedLaunch({ ...bridgedParts(deps, ctx), ctx, call, prepared, chain, refuse }, held);
   if (isResult(launch)) {
     return launch;
@@ -554,4 +593,6 @@
     // The client check of a bridged call (§S6.14 Y3): one per window, so a good answer is asked once for the window's life.
     bridgedClient: bridgedSshClientCheck({ storageDir: parts.storageDir, note: parts.agentServer.note }),
+    // The asker of a pinned call off a bridge (G1, §3.10): the window's one, so a version that was read is asked once.
+    pinClient: windowPinClient,
   };
   return { ...deps, overSsh: execOverSsh(deps) };
```

**Every way out of `localLaunch`:**

| # | The decision | What the agent gets | Written | Started |
|---|---|---|---|---|
| 1 | `none` (no saved host key) | the run's answer; `accept-new`, today's argv | nothing | `ssh`, as today |
| 2 | `refused`, the path | `409`, `no_credential`, sentence E (through `refuse`, so rule B and a journal line apply as for every refusal of this road) | nothing | nothing |
| 3 | `refused`, the client | `409`, `no_credential`, sentence F | nothing | nothing (but `ssh -V`) |
| 4 | `unusable` | the run's answer; `accept-new`, as today (C3; S4) | nothing | `ssh` |
| 5 | `unwritten` | the error is thrown on; `runCall`'s caller answers `Could not run ssh: …`, as today for a write that fails | maybe a part of a file | nothing |
| 6 | `pinned` | the run's answer; the six pairs, or five for an older client | `known_hosts-<id>`, as today | `ssh` |

Deps that name no asker (`pinClient` absent: only a test world, S8) are row 3 without any `ssh -V`: the stand-in `NO_PIN_CLIENT`
answers `unreadable` with no exit code, and the sentence says `it did not start, or did not end in time`.

In every row the key file of the call is removed by `finishCall`, as today (`:305-309`, `:362-364`). A bridged call does not come
here (`runCall`, `:324`): it is not asked, and its file and its client check are the bridged road's.

`execArgv` loses its first parameter (`deps`): nothing in it reads the deps any more, and an unused parameter does not compile
(`noUnusedParameters`). The call of `buildSshExecArgv` stays in `execArgv`, with its `ownAgent` key on the same line, so the scan
of `test/launchRoadScan.test.ts` finds it as before (measured: that file is green, §6.6).

### 5.2 *Run with Secrets* over SSH (`remoteLaunch.ts`, `sshRoad.ts`, `commands/runCommands.ts`)

The pin file of this road is written by Connect's options, when the session is prepared, before `secretsLaunch` is asked (L2).
So this road cannot refuse "before any pin file". It refuses before any `ssh`: `launchesOf` asks the client of the spawn for a
pinned session, and `secretsLaunch` checks the file that exists and answers `{ kind: 'refused', reason }`, which `launchesOf`
shows as a warning, as it shows every refusal of that function. Nobody was asked for trust and no value was read at that point
(`trustedThenSpawned`, `commands/runCommands.ts:556-565`). The session stays on the owner's list, and the owner's `cleanAll`
deletes its key file and its pin file, as for every refusal there.

```diff
--- a/src_vs_code/src/remoteLaunch.ts
+++ b/src_vs_code/src/remoteLaunch.ts
@@ -3,5 +3,7 @@
 import { commandRefusal, resolveCommand } from './commandLine';
 import { resolveKind } from './entityKind';
+import { CheckedPin, checkExistingPin } from './hostKeyPin';
 import { HostShell, asOsName, isWindowsPowerShell51, quoteFor } from './hostShell';
+import type { PinClient } from './pinClient';
 import { buildSshExecArgv } from './sshExecCommand';
 import { RefPlan, rewriteRefs } from './runPlan';
@@ -499,9 +501,14 @@
  * snapshot): the trust line, this argv, the spawn program's folder and the banner's target all come from the same `ready`.</p>
  */
-export function secretsLaunch(plan: RemotePlan, prepared: PreparedForSpawn, ownAgent: boolean, nonce: string): SecretsLaunch {
+export function secretsLaunch(plan: RemotePlan, prepared: PreparedForSpawn, ownAgent: boolean, nonce: string, client: PinClient | undefined): SecretsLaunch {
   if (composedForAnotherShell(prepared)) {
     return { kind: 'refused', reason: secretsLocalOnly(plan.entryName) };
   }
-  const argv = secretsArgv(prepared, ownAgent, nonce);
+  const pin = checkExistingPin(plan.sshName, prepared.options.knownHostsFile, client);
+  return pin.ok ? launchWith(plan, prepared, ownAgent, nonce, pin.pin) : { kind: 'refused', reason: pin.message };
+}
+
+function launchWith(plan: RemotePlan, prepared: PreparedForSpawn, ownAgent: boolean, nonce: string, pin: CheckedPin | undefined): SecretsLaunch {
+  const argv = secretsArgv(prepared, ownAgent, nonce, pin);
   return argv === undefined || prepared.target === undefined ? { kind: 'refused', reason: noHostSentence(plan.sshName) } : { kind: 'spawn', argv, target: prepared.target };
 }
@@ -512,9 +519,9 @@
 }
 
-function secretsArgv(prepared: PreparedForSpawn, ownAgent: boolean, nonce: string): string[] | undefined {
+function secretsArgv(prepared: PreparedForSpawn, ownAgent: boolean, nonce: string, pin: CheckedPin | undefined): string[] | undefined {
   const auth = prepared.env === undefined ? 'key' : 'askpass';
   return buildSshExecArgv(prepared.entity, prepared.entity.sshKeyPath, secretsRemoteCommand(nonce), auth, {
     jump: prepared.jump,
-    knownHostsFile: prepared.options.knownHostsFile,
+    knownHostsFile: pin,
     ownAgent,
     noTty: true,
--- a/src_vs_code/src/sshRoad.ts
+++ b/src_vs_code/src/sshRoad.ts
@@ -5,4 +5,5 @@
 import { offerTheFix } from './sshConnect';
 import { remedyRunner, remoteWindowDeps } from './remoteConnectHost';
+import { PinClientAsk, windowPinClient } from './pinClient';
 import { sshReaderShell } from './pinnedTerminal';
 import { AGENT_SOCKET_ENV, E3_INHERITED_DROP, type EnvDrop, NO_SSH_TO_SPAWN, spawnableSshProgram, sshSpawnLaunch } from './sshProgram';
@@ -46,4 +47,9 @@
   spawnLaunch(ssh: EntityMetadata, env: Readonly<Record<string, string>> | undefined): SpawnLaunch;
   /**
+   * What the `ssh` program of a spawn says of its version (G1, §3.10): asked by Run with Secrets for a PINNED session only, of the program
+   * and the folder `spawnLaunch` answered. Production's is `windowPinClient`; a test's fake answers what the test says.
+   */
+  pinClient: PinClientAsk;
+  /**
    * SSH Connect's own refusal modal, with its remedy button and NO retry: the person runs the entry again (parent §4.3).
    * Nothing is prepared again.
@@ -74,4 +80,5 @@
     },
     spawnLaunch: (ssh, env) => spawnLaunchOf(deps, ssh, env),
+    pinClient: windowPinClient,
   };
 }
--- a/src_vs_code/src/commands/runCommands.ts
+++ b/src_vs_code/src/commands/runCommands.ts
@@ -555,5 +555,5 @@
  */
 async function trustedThenSpawned(run: SecretsOverSsh, sessions: OwnedSessions): Promise<void> {
-  const launches = launchesOf(run);
+  const launches = await launchesOf(run);
   if (launches === undefined || !(await trustedOnItsLine(run))) {
     return;
@@ -565,6 +565,9 @@
 }
 
-/** `spawnLaunch` first (its `ownAgent` goes into the argv) and `secretsLaunch`, or `undefined` having said why: nothing is read and nobody is asked yet. A warning of the launch is the banner's. */
-function launchesOf(run: SecretsOverSsh): SshLaunches | undefined {
+/**
+ * `spawnLaunch` first (its `ownAgent` goes into the argv) and `secretsLaunch`, or `undefined` having said why: nothing is read and nobody is asked yet. A warning of the launch is the banner's.
+ * A PINNED session asks the program of the spawn for its version first (G1, §3.10), started as the run will be: the same program, the same folder, this process's `PATH`.
+ */
+async function launchesOf(run: SecretsOverSsh): Promise<SshLaunches | undefined> {
   const spawn = run.host.sshRoad.spawnLaunch(run.ready.snapshot, run.ready.env);
   if (spawn.kind === 'refused') {
@@ -572,5 +575,7 @@
   }
   const nonce = newSecretsNonce();
-  const launch = secretsLaunch(run.plan, run.ready, spawn.ownAgent, nonce);
+  const pinned = run.ready.options.knownHostsFile !== undefined;
+  const client = pinned ? await run.host.sshRoad.pinClient({ program: spawn.program, cwd: spawn.cwd, env: process.env }) : undefined;
+  const launch = secretsLaunch(run.plan, run.ready, spawn.ownAgent, nonce, client);
   return launch.kind === 'refused' ? void warn(launch.reason) : { launch, spawn, nonce };
 }
```

**Every way out of `secretsLaunch`:**

| # | What holds | The answer |
|---|---|---|
| 1 | the session was composed for another shell | refused, `secretsLocalOnly` (as today) |
| 2 | no pin file | the argv with `accept-new` (as today); `client` is not read |
| 3 | a pin file whose path is of a refused kind | refused, sentence E |
| 4 | a pin file, and the client is `unreadable` or was not asked (`undefined`) | refused, sentence F (with `it did not start, or did not end in time` for "not asked") |
| 5 | a pin file, a read client | the argv with the six pairs, or five for an older client |
| 6 | no argv, or no target | refused, `noHostSentence` (as today) |

The name in sentences E and F is `plan.sshName`, the SSH entry, as in `noHostSentence`. The program that is asked is
`spawn.program`, in `spawn.cwd`, with `process.env`: the masked run starts that program in that folder, and inherits this
process's `PATH` (`sshRoad.ts:36-44`).

## 6. Scenarios

Three commits (§8). **c1** holds the test support and the NEW tests: it compiles on the product as E2.S1 left it, and its new
tests are RED by failed assertions (§6.7). **c2** holds the product (§2 to §5) and the changed tests of E1 and of the two other
roads (§6.5): GREEN. **c3** holds the documents.

### 6.1 `test/pinnedArgv.ts`: the pin of a test, and the three new options

```diff
--- a/src_vs_code/src/test/pinnedArgv.ts
+++ b/src_vs_code/src/test/pinnedArgv.ts
@@ -1,2 +1,4 @@
+import * as hostKeyPin from '../hostKeyPin';
+
 /**
  * What the tests of G1 ask of an `ssh` argv about the host's key (`PLAN_person_roads_pin_host_key.md` §3.9 and §5, test 13): which
@@ -10,4 +12,29 @@
  */
 
+/** The pairs that E2 adds to a pinned call (the plan's §3.10 and §3.12, part 1), in the order the words say them. */
+export const PIN_SOURCE_OPTIONS: readonly string[] = ['VerifyHostKeyDNS', 'KnownHostsCommand', 'LogLevel'];
+
+/**
+ * The pin of a test, as the two builders take it: `checkedPin`'s value for a client that knows `KnownHostsCommand`, or for an older
+ * one. `undefined` stays `undefined`. A path that the rule refuses throws here, so no test builds words that the product would not.
+ *
+ * <p>The function is read through the module object, and the answer is typed `never`, so a test file compiles BEFORE `checkedPin`
+ * exists (E2.S2's RED run): there the pin is the raw path, as E1's builders took it.</p>
+ */
+export function testPin(file: string | undefined, client: 'knows' | 'older' = 'knows'): never {
+  const make = (hostKeyPin as unknown as Record<string, MakePin | undefined>).checkedPin;
+  return (file === undefined || make === undefined ? file : madeBy(make, file, client)) as never;
+}
+
+type MakePin = (path: string, read: unknown) => { ok: boolean; pin?: unknown; kind?: string };
+
+function madeBy(make: MakePin, file: string, client: string): unknown {
+  const checked = make(file, { kind: client, token: 'OpenSSH_test' });
+  if (!checked.ok) {
+    throw new Error(`the rule of the path refuses this pin file: ${String(checked.kind)}`);
+  }
+  return checked.pin;
+}
+
 /** The three options of a host-key check, in the order a pinned call says them. */
 export const HOST_KEY_OPTIONS: readonly string[] = ['StrictHostKeyChecking', 'UserKnownHostsFile', 'GlobalKnownHostsFile'];
@@ -54,2 +81,12 @@
   return argv.filter((_, i) => !gone.has(i));
 }
+
+/** The argv with every word of E2's three options taken out: what a builder sent before E2. */
+export function withoutSources(argv: readonly string[]): string[] {
+  const gone = new Set(optionWords(argv).filter((option) => PIN_SOURCE_OPTIONS.some((name) => names(option.text, name))).flatMap((option) => option.words.map((_, i) => option.at + i)));
+  return argv.filter((_, i) => !gone.has(i));
+}
+
+/** The words of the argv that name one of E2's three options, in the order of the argv. */
+export const sourceWordsOf = (argv: readonly string[]): string[] =>
+  optionWords(argv).filter((option) => PIN_SOURCE_OPTIONS.some((name) => names(option.text, name))).flatMap((option) => [...option.words]);
```

`testPin` is how every test hands a builder a pin. Before `checkedPin` exists it answers the raw path, which is what E1's builders
take; after, it answers the checked value. So one test file compiles and runs on both products, and the difference is a failed
assertion.

### 6.2 `test/personRoadsWorld.ts`: the question about the client is a kind of its own

```diff
--- a/src_vs_code/src/test/personRoadsWorld.ts
+++ b/src_vs_code/src/test/personRoadsWorld.ts
@@ -3,4 +3,5 @@
 import { materializedKeysDir } from '../materializedKeys';
 import { BridgeProcess, BridgeSpawner, SshBridgeManager } from '../sshBridgeManager';
+import type { PinClient, PinClientCall } from '../pinClient';
 import type { ExecAuth } from '../sshExecAuth';
 import type { SshExecOutcome } from '../sshExecRunner';
@@ -14,5 +15,10 @@
  * <p>Stand-ins, by the request string that `commands/agentCommands.ts` (or the module it imports) writes: `../sshExecAuth` (what a
  * resolve answers), `../sshExecRunner` (no real `ssh`), `./keyInstaller` (the recorder of `forgetMaterializedKey`; left out with
- * `realForget`), and with `noExecArgv` `../sshExecCommand`.</p>
+ * `realForget`), `./pinClient` (the asker of the client of a pinned call; left out with `realClient`), and with `noExecArgv`
+ * `../sshExecCommand`.</p>
+ *
+ * <p>The question about the client (G1, E2: `ssh -V`, the plan's §3.10) is a kind of its own: it is recorded in `clientAsks` and never in
+ * `runs`, so every count of `runs` is a count of connections. `client` says what the client answers; the default is one that knows
+ * `KnownHostsCommand`. The question goes through `./pinClient`, not through `../sshExecRunner`, so the stand-in runner never sees it.</p>
  *
  * <p>The saved host key of the entry (G1): `hostKey` puts one on the entry, and `storageDir` is the window's storage folder. A pin
@@ -99,4 +105,8 @@
   /** `buildSshExecArgv` answers no argv. */
   noExecArgv?: boolean;
+  /** What the `ssh` program answers about its version: one answer for every question, or the answer of the n-th question (0-based) of the window. Default: {@link KNOWS}. */
+  client?: PinClient | ((index: number) => PinClient);
+  /** The real `./pinClient` asks (a real `ssh -V` through the real runner); `clientAsks` stays empty. */
+  realClient?: boolean;
   /** More stand-ins, by request string. */
   mocks?: Record<string, unknown>;
@@ -113,4 +123,6 @@
   /** Every `ssh` run: its argv, how many paths were forgotten when it started, and the known-hosts file its argv names, read at that moment. */
   runs: { argv: readonly string[]; forgottenBefore: number; knownHosts: NamedKnownHosts | undefined }[];
+  /** Every question about the client of a pinned call, in order: what it was asked of, and how many pin files were on the disk and how many runs had started then. */
+  clientAsks: { call: PinClientCall; pinFilesBefore: number; runsBefore: number }[];
   /** Every modal question and quick pick: its text and how many paths were forgotten when it was shown. */
   asked: { message: string; forgottenBefore: number }[];
@@ -161,5 +173,5 @@
   };
   const bridges = new SshBridgeManager(parts.spawn ?? held, (key) => void ended.push(key));
-  return { handlers: new Map(), bridges, children, bridgeArgvs, forgotten: [], runs: [], asked: [], ended, infos: [], warnings: [], errors: [], logs: [] };
+  return { handlers: new Map(), bridges, children, bridgeArgvs, forgotten: [], runs: [], clientAsks: [], asked: [], ended, infos: [], warnings: [], errors: [], logs: [] };
 }
 
@@ -217,4 +229,22 @@
 }
 
+/** The answer of a client that knows `KnownHostsCommand` (OpenSSH 8.5 or newer). */
+export const KNOWS: PinClient = { kind: 'knows', token: 'OpenSSH_10.2' };
+/** The answer of a client below 8.5: a success of its own. */
+export const OLDER: PinClient = { kind: 'older', token: 'OpenSSH_8.4' };
+/** The answer of a client whose version could not be read. */
+export const unreadable = (exitCode: number | null): PinClient => ({ kind: 'unreadable', exitCode });
+
+/** The stand-in of `./pinClient`: no `ssh -V` starts; each question is recorded, apart from the runs, and answered on a promise callback. */
+function clientOf(w: World, parts: Parts): Record<string, unknown> {
+  return {
+    windowPinClient: (call: PinClientCall): Promise<PinClient> => {
+      w.clientAsks.push({ call, pinFilesBefore: pinFiles(parts.storageDir ?? '/storage').length, runsBefore: w.runs.length });
+      const index = w.clientAsks.length - 1;
+      return Promise.resolve().then(() => (typeof parts.client === 'function' ? parts.client(index) : (parts.client ?? KNOWS)));
+    },
+  };
+}
+
 function mocksOf(w: World, parts: Parts): Record<string, unknown> {
   const recorder = { './keyInstaller': { forgetMaterializedKey: (keyPath: string): void => void w.forgotten.push(keyPath) } };
@@ -224,4 +254,5 @@
     '../sshExecRunner': runnerOf(w, parts),
     ...(parts.realForget === true ? {} : recorder),
+    ...(parts.realClient === true ? {} : { './pinClient': clientOf(w, parts) }),
     ...(parts.noExecArgv === true ? noArgv : {}),
     ...parts.mocks,
```

- **Why E1's counts hold (L4).** `runs` is filled by the stand-in of `../sshExecRunner`, the request string that
  `commands/agentCommands.ts` writes. The question goes through `./pinClient`, the request string that `personPin.ts` writes, and
  the world stands in for that module by default: no `ssh -V` starts, and `clientAsks` records each question apart. So
  `w.runs.length` is a count of connections, before and after. E1's road tests (the parent's tests 2 to 4 and 6 to 9:
  `personRoadsPin.test.ts`, `personRoadsHostKey.test.ts`) pass with no change of a count: measured, §6.6.
- **Without the stand-in, a pinned road test would start the real `ssh -V`** of the machine: `pinClient.ts` imports the runner
  as `./sshExecRunner`, which the world's stand-in of `../sshExecRunner` does not replace. That is why the stand-in is the
  default, and `realClient` is a choice a caller makes.
- **The smoke of section 10** (`scripts/itestPinnedRoads.cjs`) loads this world with its own mocks and is not edited here. With
  the default stand-in its shim records the same four starts as before, so `startsHoldThePin` (`:387-393`) keeps its count of 4
  after this story; its checks of the three file options read a quoted or bare word as before. E2.S4 decides whether the smoke
  turns on `realClient: true`. If it does, two things follow, and both are E2.S4's: the shim then records a fifth kind of start
  (`-V`), which `startsHoldThePin` must count apart; and the question's `PATH` comes from the credential's environment (S9), so
  the `-V` start goes through the shim exactly when the runs do.

### 6.3 New `test/pinWords.test.ts`: the parent's tests 17, 18, 20, 21 and 23

```ts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestContext, test } from 'node:test';
import { ownedFile } from '../../scripts/lib/leftovers.cjs';
import { unsafeBridgedFileValue } from '../bridgedSshConfig';
import * as hostKeyPin from '../hostKeyPin';
import { buildBridgeArgv } from '../sshBridge';
import { SshExecAuth, buildSshExecArgv } from '../sshExecCommand';
import type { EntityMetadata } from '../types';
import { discoverSources } from './tempSiteScan';
import { fakePath } from './fakePaths';
import { PIN_SOURCE_OPTIONS, hostKeyWordsOf, sourceWordsOf, testPin, valuesOf, withoutGlobal, withoutSources } from './pinnedArgv';

/**
 * G1, E2.S2: the complete words of one pinned call, and the rule of the path that stands before them (the plan's §3.10, §3.11, §3.12
 * part 1; its tests 17, 18, 20, 21 and 23). The three file options of E1 are `hostKeyWords.test.ts`.
 *
 * <p>Part 1 says what is SENT. Part 2 asks the PATH's `ssh -G` what a client resolves from it: `-G` connects to nothing, and that a
 * host with another key is then refused is not shown by any test here (the plan's E3). Part 3 is the rule of the path. Part 4 is the
 * scan that stays.</p>
 *
 * <p>The new exports are read through the module object, and a pin goes through `testPin`, so this file compiles before they exist:
 * a missing export is a failed assertion.</p>
 */

const PIN = fakePath('keys/4242/known_hosts-e1-0b6f3c1e');
const KEY = fakePath('k.key');
const HOST: EntityMetadata = { id: 'e1', name: 'build box', host: 'build.example.com', user: 'dev', isSshEnabled: true };
/** The destination word of `HOST`, and a jump host: put together here, so no line of this file reads as an address of a person. */
const TARGET = [HOST.user, HOST.host].join('@');
const JUMP = ['hop', 'jump.example.com'].join('@');
const BUSY: EntityMetadata = { ...HOST, port: 2222, agentForward: true, portForwards: [{ kind: 'local', bindPort: 8080, host: 'localhost', hostPort: 80 }] };

type Client = 'knows' | 'older';
type Argv = string[];

const exec = (pin: string | undefined, client: Client, auth: SshExecAuth, entity: EntityMetadata, options: Record<string, unknown>): Argv =>
  buildSshExecArgv(entity, KEY, 'id', auth, { ...options, knownHostsFile: testPin(pin, client) }) ?? [];

const run = (pin: string | undefined, client: Client): Argv => exec(pin, client, 'key', HOST, {});

const tunnel = (pin: string | undefined, client: Client, auth: SshExecAuth = 'key', extra: readonly string[] = []): Argv =>
  buildBridgeArgv(HOST, { port: 51234, remote: { path: '/tmp/creds-dev-abc.sock' }, auth, extra, keyPath: KEY, knownHostsFile: testPin(pin, client) }, () => true) ?? [];

/** Every kind of argv that carries the words of a pinned call off a bridge. */
const everyKind = (pin: string | undefined, client: Client): readonly (readonly [string, Argv])[] => [
  ['the tunnel of a bridge, a key', tunnel(pin, client)],
  ['the tunnel of a bridge, a password', tunnel(pin, client, 'askpass')],
  ['a run off a bridge, a key', run(pin, client)],
  ['a run off a bridge, a password', exec(pin, client, 'askpass', HOST, {})],
  ['a run off a bridge: a jump host, no pty, the agent taken away, a forward, a port', exec(pin, client, 'key', BUSY, { jump: JUMP, noTty: true, ownAgent: false })],
];

const FILES = (word: string): string[] => ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${word}`, '-o', `GlobalKnownHostsFile=${word}`];
const KNOWS_WORDS = (word: string): string[] => [...FILES(word), '-o', 'VerifyHostKeyDNS=no', '-o', 'KnownHostsCommand=none', '-o', 'LogLevel=ERROR'];
const OLDER_WORDS = (word: string): string[] => [...FILES(word), '-o', 'VerifyHostKeyDNS=no', '-o', 'LogLevel=ERROR'];
const UNPINNED = ['-o', 'StrictHostKeyChecking=accept-new'];

/** An export of `hostKeyPin.ts`, read through the module object: its absence is a failed assertion, not a compile error. */
function exported<T>(name: string): T {
  const found = (hostKeyPin as Record<string, unknown>)[name];
  assert.notEqual(found, undefined, `hostKeyPin.ts exports no ${name}`);
  return found as T;
}

/* --- part 1: what is sent (test 17) --- */

test('W1: for a client that knows the option, a pinned argv says the six pairs side by side, in this order, and no other word names one of the six options', () => {
  for (const [name, argv] of everyKind(PIN, 'knows')) {
    const at = argv.indexOf('StrictHostKeyChecking=yes') - 1;
    assert.deepEqual(argv.slice(at, at + 12), KNOWS_WORDS(PIN), `${name}: the six pairs do not stand side by side`);
    assert.deepEqual([...hostKeyWordsOf(argv), ...sourceWordsOf(argv)], KNOWS_WORDS(PIN), name);
  }
});

test('W2: for a client below 8.5 the same without the KnownHostsCommand pair: no word of the argv names that option', () => {
  for (const [name, argv] of everyKind(PIN, 'older')) {
    const at = argv.indexOf('StrictHostKeyChecking=yes') - 1;
    assert.deepEqual(argv.slice(at, at + 10), OLDER_WORDS(PIN), `${name}: the five pairs do not stand side by side`);
    assert.deepEqual(valuesOf(argv, 'KnownHostsCommand'), [], `${name}: an older client ends at this word`);
    assert.deepEqual(valuesOf(argv, 'VerifyHostKeyDNS'), ['no'], name);
    assert.deepEqual(valuesOf(argv, 'LogLevel'), ['ERROR'], name);
  }
});

test('W3: an unpinned argv is today\'s, byte for byte: accept-new, and no word of the three new options', () => {
  for (const [name, argv] of everyKind(undefined, 'knows')) {
    assert.deepEqual(hostKeyWordsOf(argv), UNPINNED, name);
    assert.deepEqual(sourceWordsOf(argv), [], name);
  }
  assert.deepEqual(run(undefined, 'knows'), ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10', '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-i', KEY, '--', TARGET, 'id']);
  assert.deepEqual(tunnel(undefined, 'knows'), [
    '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=10',
    '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-o', 'StrictHostKeyChecking=accept-new', '-N', '-R', '/tmp/creds-dev-abc.sock:127.0.0.1:51234', '-i', KEY, '--', TARGET,
  ]);
});

test('W4: a pinned argv with the three new pairs and the third file option taken out is the argv of before G1, so nothing else moved', () => {
  for (const client of ['knows', 'older'] as const) {
    assert.deepEqual(withoutSources(withoutGlobal(run(PIN, client))), [
      '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${PIN}`, '-o', 'ConnectTimeout=10',
      '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-i', KEY, '--', TARGET, 'id',
    ]);
  }
});

/** What a caller could put into `extra` to turn the three back on. `ssh` takes the FIRST value of an option, and the builder's stand first. */
const HOSTILE_EXTRA = ['-o', 'VerifyHostKeyDNS=yes', '-o', 'KnownHostsCommand=/bin/echo x', '-o', 'LogLevel=QUIET'];

test('W5: the new pairs stand before every word that the entry or a caller adds, and a caller\'s own words for the three options come second', () => {
  const later = ['-J', '-A', '-L', '-N', '-R', '-i', '-p', '--'];
  for (const [name, argv] of everyKind(PIN, 'knows')) {
    const last = argv.lastIndexOf('LogLevel=ERROR');
    const first = Math.min(...later.map((word) => argv.indexOf(word)).filter((at) => at >= 0));
    assert.ok(last >= 0 && last < first, `${name}: a word of the entry stands before the last pair`);
  }
  const hostile = tunnel(PIN, 'knows', 'key', HOSTILE_EXTRA);
  assert.deepEqual(valuesOf(hostile, 'VerifyHostKeyDNS'), ['no', 'yes']);
  assert.deepEqual(valuesOf(hostile, 'KnownHostsCommand'), ['none', '/bin/echo x']);
  assert.deepEqual(valuesOf(hostile, 'LogLevel'), ['ERROR', 'QUIET']);
});

test('W6: one function writes them, and both builders say exactly what it answers for each client', () => {
  const hostKeyWords = exported<(pin: unknown) => string[]>('hostKeyWords');
  assert.deepEqual(hostKeyWords(undefined), UNPINNED);
  assert.deepEqual(hostKeyWords(testPin(PIN, 'knows')), KNOWS_WORDS(PIN));
  assert.deepEqual(hostKeyWords(testPin(PIN, 'older')), OLDER_WORDS(PIN));
  for (const client of ['knows', 'older'] as const) {
    for (const [name, argv] of everyKind(PIN, client)) {
      assert.deepEqual([...hostKeyWordsOf(argv), ...sourceWordsOf(argv)], hostKeyWords(testPin(PIN, client)), `${name}, ${client}`);
    }
  }
  assert.deepEqual([...PIN_SOURCE_OPTIONS], ['VerifyHostKeyDNS', 'KnownHostsCommand', 'LogLevel']);
});

/* --- part 2: what the real client resolves (tests 18 and 21) --- */

const ssh = (args: readonly string[]) => spawnSync('ssh', [...args], { encoding: 'utf8', timeout: 15_000 }); // NOSONAR: the PATH's ssh is the subject
const HAS_SSH = ssh(['-V']).error === undefined;
/** Skipped only where there is no `ssh` and no CI: under `CI=true` a missing client fails. */
const NEEDS_SSH = { skip: HAS_SSH || process.env.CI === 'true' ? false : 'no ssh on the PATH' };

/** A config that turns on the two other sources of host keys, and silences the client. */
const OTHER_SOURCES_CONFIG = 'Host *\n  KnownHostsCommand /bin/echo x\n  VerifyHostKeyDNS yes\n  LogLevel QUIET\n';

/** What `ssh -G` answers for `argv` under a config file of this test that holds `config`. */
function asked(t: TestContext, config: string, argv: readonly string[]): ReturnType<typeof ssh> {
  const file = ownedFile(t, 'pw', 'ssh_config');
  fs.writeFileSync(file, config);
  return ssh(['-G', '-F', file, ...argv]);
}

/** The lines `ssh -G` prints for the three options, sorted; an option the client has turned off prints no line. */
function sources(t: TestContext, argv: readonly string[]): string[] {
  const answer = asked(t, OTHER_SOURCES_CONFIG, argv);
  assert.equal(answer.status, 0, `ssh -G did not resolve the argv: ${answer.error ?? answer.stderr}`);
  return answer.stdout.split(/\r?\n/).filter((line) => /^(verifyhostkeydns|knownhostscommand|loglevel) /.test(line)).sort();
}

test('G1: under a config that says KnownHostsCommand, VerifyHostKeyDNS yes and LogLevel QUIET, the real ssh resolves every pinned argv to none of them', NEEDS_SSH, (t) => {
  for (const [name, argv] of [...everyKind(PIN, 'knows'), ['the tunnel with a caller\'s hostile extra', tunnel(PIN, 'knows', 'key', HOSTILE_EXTRA)] as const]) {
    assert.deepEqual(sources(t, argv), ['loglevel ERROR', 'verifyhostkeydns false'], name);
  }
});

test('G2: the control: the same config with an UNPINNED argv keeps all three on, so the test above can show the fault', NEEDS_SSH, (t) => {
  const kept = sources(t, run(undefined, 'knows'));
  assert.equal(kept.includes('knownhostscommand /bin/echo x'), true, kept.join(' | '));
  assert.equal(kept.includes('verifyhostkeydns true'), true, kept.join(' | '));
  assert.equal(kept.some((line) => line === 'loglevel ERROR'), false, kept.join(' | '));
});

test('G3: the words of an OLDER client leave a config\'s KnownHostsCommand on in a client that knows the option: so the answer about the client decides', NEEDS_SSH, (t) => {
  assert.deepEqual(sources(t, run(PIN, 'older')), ['knownhostscommand /bin/echo x', 'loglevel ERROR', 'verifyhostkeydns false']);
});

/** The two lists `ssh -G` resolves for `argv`, under no config: the files of the person's list, and of the system-wide one. */
function lists(t: TestContext, argv: readonly string[]): { user: string | undefined; system: string | undefined; stderr: string } {
  const answer = asked(t, '', argv);
  const of = (name: string): string | undefined => answer.stdout.split(/\r?\n/).find((line) => line.startsWith(`${name} `))?.slice(name.length + 1);
  return { user: of('userknownhostsfile'), system: of('globalknownhostsfile'), stderr: answer.stderr };
}

/* --- part 3: the rule of the path (tests 20 and 21) --- */

type Kind = string;
/** One row of the rule: a path, and what the rule answers for it: the word, or the refused kind. */
type Row = readonly [what: string, file: string, answer: { word: string } | { kind: Kind }];

const bare = (file: string): { word: string } => ({ word: file });
const quoted = (file: string): { word: string } => ({ word: `"${file}"` });
const refused = (kind: Kind): { kind: Kind } => ({ kind });

const ROWS: readonly Row[] = [
  ['a plain POSIX path', '/home/me/.config/Code/keys/42/known_hosts-e1-0b6f', bare('/home/me/.config/Code/keys/42/known_hosts-e1-0b6f')],
  ['a plain Windows path: single backslashes, a drive letter', 'C:\\Users\\me\\AppData\\keys\\42\\known_hosts-e1', bare('C:\\Users\\me\\AppData\\keys\\42\\known_hosts-e1')],
  ['characters that ssh keeps in a bare word', '/tmp/a#b=c,d;e&f(g)[h]{i}~j$k/kh', bare('/tmp/a#b=c,d;e&f(g)[h]{i}~j$k/kh')],
  ['a space (macOS: Application Support)', '/Users/me/Library/Application Support/Code/keys/42/kh', quoted('/Users/me/Library/Application Support/Code/keys/42/kh')],
  ['a space on Windows', 'C:\\Users\\me\\App Data\\keys\\42\\kh', quoted('C:\\Users\\me\\App Data\\keys\\42\\kh')],
  ['a pair of apostrophes (row a: bare, ssh reads ANOTHER path)', "/tmp/creds-a'b'/kh", quoted("/tmp/creds-a'b'/kh")],
  ['one apostrophe (row c: bare, invalid quotes)', "/tmp/creds-a'b/kh", quoted("/tmp/creds-a'b/kh")],
  ['a space and an apostrophe together (row k)', "/tmp/it's here/kh", quoted("/tmp/it's here/kh")],
  ['a space and then a hash', '/tmp/q #r/kh', quoted('/tmp/q #r/kh')],
  ['a no-break space', '/tmp/nb\u00a0sp/kh', quoted('/tmp/nb\u00a0sp/kh')],
  ['a double quote (row e)', '/tmp/a"b/kh', refused('quote')],
  ['two double quotes around a space', '/tmp/a"b c"d/kh', refused('quote')],
  ['two backslashes in a row: a network path (row f)', '\\\\srv\\share\\keys\\kh', refused('doubleBackslash')],
  ['two backslashes inside a path', 'C:\\keys\\\\42\\kh', refused('doubleBackslash')],
  ['a backslash before an apostrophe', "/tmp/a\\'b/kh", refused('backslashApostrophe')],
  ['a backslash at the end', 'C:\\keys\\', refused('lastBackslash')],
  ['a percent sign: %h (row g)', '/tmp/creds-%h-x/kh', refused('percent')],
  ['a percent sign: %% (row h)', '/tmp/creds-%%h-x/kh', refused('percent')],
  ['a percent sign: %Z (row j)', '/tmp/creds-%Z-x/kh', refused('percent')],
  ['the characters ${ (row i)', '/tmp/creds-${HOME}-x/kh', refused('variable')],
  ['a tilde at the start', '~/keys/kh', refused('tilde')],
  ['a tab', '/tmp/a\tb/kh', refused('control')],
  ['a line feed', '/tmp/a\nb/kh', refused('control')],
  ['a carriage return', '/tmp/a\rb/kh', refused('control')],
  ['DEL', '/tmp/a\u007fb/kh', refused('control')],
  ['a NUL', '/tmp/a\u0000b/kh', refused('control')],
  ['a control character wins over a double quote: the first kind in the order of the rule', '/tmp/a\t"b/kh', refused('control')],
];

type Check = { ok: true; pin: { file: string; word: string; knowsKnownHostsCommand: boolean } } | { ok: false; kind: Kind };
const READ = { knows: { kind: 'knows', token: 'OpenSSH_10.2' }, older: { kind: 'older', token: 'OpenSSH_8.4' } } as const;

test('P1: the rule of the path, row by row: as it is, in double quotes, or refused with its kind; the refusing half answers the same kind', () => {
  const checkedPin = exported<(file: string, client: unknown) => Check>('checkedPin');
  const pinPathRefusal = exported<(file: string) => Kind | undefined>('pinPathRefusal');
  for (const [what, file, answer] of ROWS) {
    const checked = checkedPin(file, READ.knows);
    if ('word' in answer) {
      assert.deepEqual(checked, { ok: true, pin: { file, word: answer.word, knowsKnownHostsCommand: true } }, what);
      assert.equal(pinPathRefusal(file), undefined, what);
    } else {
      assert.deepEqual(checked, { ok: false, kind: answer.kind }, what);
      assert.equal(pinPathRefusal(file), answer.kind, what);
    }
  }
});

test('P2: both words carry the same spelling, the file of the value is the path as it was given, and the client\'s answer is the value\'s', () => {
  const checkedPin = exported<(file: string, client: unknown) => Check>('checkedPin');
  const hostKeyWords = exported<(pin: unknown) => string[]>('hostKeyWords');
  for (const [what, file, answer] of ROWS.filter((row) => 'word' in row[2])) {
    const word = (answer as { word: string }).word;
    for (const client of ['knows', 'older'] as const) {
      const checked = checkedPin(file, READ[client]);
      assert.ok(checked.ok, what);
      assert.equal(checked.pin.file, file, what);
      assert.equal(checked.pin.knowsKnownHostsCommand, client === 'knows', what);
      assert.deepEqual(hostKeyWords(checked.pin), client === 'knows' ? KNOWS_WORDS(word) : OLDER_WORDS(word), what);
    }
  }
});

test('P3: every kind has its words for sentence E, and the kinds are these eight, in the order the rule asks them', () => {
  const kinds = exported<Record<string, string>>('PIN_PATH_KINDS');
  assert.deepEqual(kinds, {
    control: 'a control character',
    quote: 'a double quote',
    doubleBackslash: 'two backslashes in a row (a network path)',
    backslashApostrophe: 'a backslash before an apostrophe',
    lastBackslash: 'a backslash at its end',
    percent: 'a percent sign',
    variable: 'the characters ${',
    tilde: 'a tilde at its start',
  });
  const met = new Set(ROWS.flatMap(([, , answer]) => ('kind' in answer ? [answer.kind] : [])));
  assert.deepEqual([...met].sort(), Object.keys(kinds).sort(), 'a kind has no row in ROWS, or a row names a kind that is none');
});

test('P4: every path that the rule of the bridged file refuses, this rule refuses too (it may refuse more, never less)', () => {
  const pinPathRefusal = exported<(file: string) => Kind | undefined>('pinPathRefusal');
  const bridgedRefuses = ROWS.map(([, file]) => file).filter((file) => unsafeBridgedFileValue(file));
  assert.ok(bridgedRefuses.length >= 10, `the bridged rule refuses ${bridgedRefuses.length} of the rows: the comparison has lost its subject`);
  for (const file of bridgedRefuses) {
    assert.notEqual(pinPathRefusal(file), undefined, JSON.stringify(file));
  }
});

test('P5: sentences E and F, word for word: no path, no part of the program\'s output but the exit code', () => {
  const pinPathSentence = exported<(name: string, kind: Kind) => string>('pinPathSentence');
  const pinClientSentence = exported<(name: string, exitCode: number | null) => string>('pinClientSentence');
  assert.equal(
    pinPathSentence('box', 'percent'),
    'The saved host key of "box" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with a percent sign, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key.',
  );
  assert.equal(
    pinClientSentence('box', 255),
    'CredsForDevs could not read the version of the ssh program on this computer (exit code 255), so it did not start a connection that has to check the saved host key of "box". Nothing was sent to that host. The reason is the ssh program here, not the host.',
  );
  assert.equal(
    pinClientSentence('box', null),
    'CredsForDevs could not read the version of the ssh program on this computer (it did not start, or did not end in time), so it did not start a connection that has to check the saved host key of "box". Nothing was sent to that host. The reason is the ssh program here, not the host.',
  );
  assert.match(pinClientSentence('box', 0), /\(exit code 0\)/);
});

test('G4: every path that the rule writes, the real ssh resolves to exactly that path in BOTH lists', NEEDS_SSH, (t) => {
  // The rows a POSIX client can be asked: a Windows path is a relative name to it, and it is written as it is all the same.
  for (const [what, file] of ROWS.filter((row) => 'word' in row[2])) {
    const resolved = lists(t, run(file, 'knows'));
    assert.deepEqual({ user: resolved.user, system: resolved.system }, { user: file, system: file }, `${what}: ${resolved.stderr}`);
  }
});

/** Whether the real client reads `word`, as both options, as the one file `file` in BOTH lists. */
function readAsOne(t: TestContext, word: string, file: string): boolean {
  const resolved = lists(t, ['-o', `UserKnownHostsFile=${word}`, '-o', `GlobalKnownHostsFile=${word}`, '--', TARGET]);
  return resolved.user === file && resolved.system === file;
}

test('G5: the control: the bare pair of apostrophes resolves ANOTHER path, and no refused row is read as the one file in BOTH spellings', NEEDS_SSH, (t) => {
  const pair = "/tmp/creds-a'b'/kh";
  assert.equal(readAsOne(t, pair, pair), false, 'the pair of apostrophes, bare, was read as itself: G4 could not show the fault');
  assert.equal(readAsOne(t, pair, '/tmp/creds-ab/kh'), true, 'the pair of apostrophes, bare, is read as the path without them');
  // A control character is refused as the rule of the bridged file refuses it (P4), whatever this client reads: a tab splits a bare word and is kept
  // in double quotes, and DEL is kept in both (measured 2026-11-18, OpenSSH 10.2p1). Every other kind is refused because of what was measured.
  for (const [what, file] of ROWS.filter((row) => 'kind' in row[2] && row[2].kind !== 'control')) {
    const both = readAsOne(t, file, file) && readAsOne(t, `"${file}"`, file);
    assert.equal(both, false, `${what}: ssh reads it as the one file bare AND in double quotes, so the rule refuses a path that it could always write`);
  }
});

/* --- part 4: the scan that stays (test 23) --- */

const SRC = path.resolve(__dirname, '..', '..', 'src');
const SOURCES = discoverSources(SRC, new Map([['test', 'the tests are not shipped']]));
const read = (file: string): string => fs.readFileSync(path.join(SRC, file), 'utf8');

test('S1: no shipped file names /dev/null, NUL or "none" as a known-hosts file on a command line: a pin file has no stand-in', () => {
  const standIn = /KnownHostsFile=(?:\/dev\/null|NUL\b|none\b)|NO_KEY_FILE/;
  assert.deepEqual(SOURCES.filter((file) => standIn.test(read(file))), []);
  // The scan is alive: it finds the stand-in in the text that E1 shipped.
  assert.equal(standIn.test("const NO_KEY_FILE = '/dev/null';"), true);
  assert.equal(standIn.test('`UserKnownHostsFile=/dev/null`'), true);
});

test('S2: a checked pin is made in one place: no shipped file casts to CheckedPin but checkedPin itself, and the brand is not exported', () => {
  const cast = /\bas\s+(?:unknown\s+as\s+)?CheckedPin\b/;
  assert.deepEqual(SOURCES.filter((file) => cast.test(read(file))), ['hostKeyPin.ts']);
  const pinFile = read('hostKeyPin.ts');
  assert.equal((pinFile.match(new RegExp(cast.source, 'g')) ?? []).length, 1, 'hostKeyPin.ts casts to CheckedPin in more than one place');
  assert.match(pinFile, /^declare const checkedPinBrand: unique symbol;$/m);
  assert.equal(/export\s+(?:declare\s+)?const\s+checkedPinBrand/.test(pinFile), false);
});

test('S3: the three new options are spelled in hostKeyPin.ts and in no other shipped file', () => {
  const spelled = /\b(?:VerifyHostKeyDNS|KnownHostsCommand|LogLevel)=/;
  assert.deepEqual(SOURCES.filter((file) => spelled.test(read(file))), ['hostKeyPin.ts']);
});
```

### 6.4 New `test/personRoadsPinRefusals.test.ts`: the parent's test 19 (the road half) and test 22 (the three roads)

```ts
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test, TestContext } from 'node:test';
import { cleanupScope, ownedDir, ownedFile } from '../../scripts/lib/leftovers.cjs';
import { formatHostKey } from '../hostKeyPin';
import type { PinClient } from '../pinClient';
import { KEY, KNOWS, OLDER, Parts, World, click, pinFiles, ran, settled, unreadable, world, writtenKey } from './personRoadsWorld';
import { sourceWordsOf, valuesOf } from './pinnedArgv';

/**
 * G1, E2.S2: the two refusals that stand before the words of a pinned call, on the three roads of the person (the plan's §3.10 and
 * §3.11; its test 19, the road half, and its test 22). A path of the pin file that `ssh` would not read as the one file, and an `ssh`
 * program whose version cannot be read, start nothing: no `ssh` run, no pin file, the sentence for the person, the key file of the call
 * deleted. An entry with no saved host key is asked nothing.
 *
 * <p>The question about the client is the world's stand-in of `./pinClient` (`clientAsks`), a kind of its own: `runs` counts
 * connections only, so the counts of E1's road tests stay as they are. `materializeKnownHosts` is the real one.</p>
 */

const scope = cleanupScope();
after(() => scope.close());

const PIN = formatHostKey({ algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' });
const KEY_FILE = '/nonexistent/creds-test/call.key';
const PROBE_OK = 'creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n';
const INSTALLED = 'creds-install: installed /home/dev/.local/bin/creds\n';
const yes = (_message: string, rest: readonly unknown[]): string | undefined => rest.find((one): one is string => typeof one === 'string');

const sentenceE = (kind: string): string =>
  `The saved host key of "box" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with ${kind}, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key.`;
const sentenceF = (how: string): string =>
  `CredsForDevs could not read the version of the ssh program on this computer (${how}), so it did not start a connection that has to check the saved host key of "box". Nothing was sent to that host. The reason is the ssh program here, not the host.`;

/**
 * A FILE of this test. A storage folder "inside" it can never be made, by any user and on any platform: so a product that does not
 * refuse (the one before E2.S2, in the RED run) fails at its write and leaves nothing behind, in no folder.
 */
const NOT_A_FOLDER = ownedFile(scope, 'blocked', 'not-a-folder');
fs.writeFileSync(NOT_A_FOLDER, '');
const under = (name: string): string => path.join(NOT_A_FOLDER, name);

/**
 * Two backslashes in a row. Windows' `path.join` folds them into one inside a path and keeps them only at the start of a network
 * path, so there the folder is one (a reserved name: nothing answers it, and this product never asks).
 */
const NETWORK_FOLDER = process.platform === 'win32' ? '\\\\creds-test.invalid\\share\\creds' : under('a\\\\b');

/**
 * A storage folder whose path makes the pin file's path one of the refused kinds, and the words sentence E says for it. None is ever
 * made. Two kinds have no row, and the pure rule holds them (P1 of `pinWords.test.ts`): a backslash at the end cannot come from a
 * folder (the file's name ends the path), and a tilde at the start would be a folder relative to where the tests run.
 */
const REFUSED_FOLDERS: readonly (readonly [kind: string, storageDir: string])[] = [
  ['a control character', under('a\tb')],
  ['a double quote', under('a"b')],
  ['two backslashes in a row (a network path)', NETWORK_FOLDER],
  ['a backslash before an apostrophe', under("a\\'b")],
  ['a percent sign', under('100%')],
  ['the characters ${', under('a${b}')],
];

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

/** Nothing was started and nothing was written for a refused call, and its key file is deleted once. */
function startedNothing(w: World, dir: string, what: string): void {
  assert.deepEqual(w.runs.map((one) => one.argv), [], `${what}: an ssh run started`);
  assert.equal(w.children.length, 0, `${what}: a bridge was started`);
  assert.equal(w.bridges.remotePathFor(KEY), undefined, `${what}: the row is bridged`);
  assert.deepEqual(pinFiles(dir), [], `${what}: a pin file was written`);
  assert.deepEqual(w.forgotten, [KEY_FILE], `${what}: the key file of the call was not deleted once`);
}

for (const [kind, storageDir] of REFUSED_FOLDERS) {
  test(`E1: a storage folder with ${kind} in its path starts no install: sentence E, no question to the client, no run, no pin file, the key file deleted`, async () => {
    const w = world({ storageDir, hostKey: PIN, clicks: [writtenKey(KEY_FILE)], answer: yes });

    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [`Cannot reach "box": ${sentenceE(kind)}`]);
    assert.equal(w.errors[0].includes(storageDir), false, 'the sentence echoes the path');
    assert.deepEqual(w.clientAsks, [], 'the rule of the path is asked before the client');
    startedNothing(w, storageDir, kind);
  });

  test(`E2: a storage folder with ${kind} in its path opens no bridge: sentence E, no run, no pin file, the key file deleted, no socket check`, async (t) => {
    const w = await bridged(t, { storageDir, hostKey: PIN, clicks: [writtenKey(KEY_FILE)], checks: [writtenKey('/nonexistent/creds-test/check.key')] });

    assert.deepEqual(w.errors, [`Cannot bridge to "box": ${sentenceE(kind)}`]);
    assert.deepEqual(w.infos.filter((text) => text.startsWith('Bridge open')), [], 'the person was told the bridge is open');
    assert.deepEqual(w.clientAsks, []);
    startedNothing(w, storageDir, kind);
  });
}

for (const [how, client] of [['exit code 1', unreadable(1)], ['exit code 0', unreadable(0)], ['it did not start, or did not end in time', unreadable(null)]] as const) {
  test(`F1: an ssh program whose version cannot be read (${how}) starts no install: sentence F, no run, no pin file, the key file deleted`, async () => {
    const dir = ownedDir(scope, 'f1');
    const w = world({ storageDir: dir, hostKey: PIN, client, clicks: [writtenKey(KEY_FILE)], answer: yes });

    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [`Cannot reach "box": ${sentenceF(how)}`]);
    assert.equal(w.clientAsks.length, 1);
    startedNothing(w, dir, how);
    assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'nothing was made in the storage folder');
  });

  test(`F2: an ssh program whose version cannot be read (${how}) opens no bridge: sentence F, no run, no pin file, the key file deleted, no socket check`, async (t) => {
    const dir = ownedDir(scope, 'f2');
    const w = await bridged(t, { storageDir: dir, hostKey: PIN, client, clicks: [writtenKey(KEY_FILE)], checks: [writtenKey('/nonexistent/creds-test/check.key')] });

    assert.deepEqual(w.errors, [`Cannot bridge to "box": ${sentenceF(how)}`]);
    assert.deepEqual(w.infos.filter((text) => text.startsWith('Bridge open')), []);
    assert.equal(w.clientAsks.length, 1, 'the socket check never ran, so it never asked');
    startedNothing(w, dir, how);
  });
}

test('F3: the socket check whose own question finds no version does not run: the log says sentence F, no run of the check starts, its pin file is not written', async (t) => {
  const dir = ownedDir(scope, 'f3');
  const answers: PinClient[] = [KNOWS, unreadable(255)];
  const w = await bridged(t, { storageDir: dir, hostKey: PIN, client: (index) => answers[index], clicks: [writtenKey(KEY_FILE)], checks: [writtenKey('/nonexistent/creds-test/check.key')] });

  assert.equal(w.children.length, 1, 'the bridge itself opened: its own question was answered');
  assert.equal(w.clientAsks.length, 2, 'the bridge asked, and the check asked');
  assert.deepEqual(w.runs.map((one) => one.argv), [], 'a run of the check started');
  assert.deepEqual(w.logs.filter((line) => line.startsWith('socket check did not run: ')), [`socket check did not run: ${sentenceF('exit code 255')}`]);
  assert.equal(pinFiles(dir).length, 1, 'only the pin file of the bridge is on the disk');
  assert.deepEqual(w.errors, []);
});

test('F4: "cannot be read" is asked again: a second click asks the client a second time, and connects when it then answers', async () => {
  const dir = ownedDir(scope, 'f4');
  const answers: PinClient[] = [unreadable(1), KNOWS];
  const w = world({ storageDir: dir, hostKey: PIN, client: (index) => answers[index], clicks: [writtenKey(KEY_FILE), writtenKey(KEY_FILE)], answer: yes, run: (index) => ran([PROBE_OK, INSTALLED][index]) });

  await click(w, 'installRemoteCli');
  assert.equal(w.runs.length, 0);
  await click(w, 'installRemoteCli');

  assert.equal(w.clientAsks.length, 2);
  assert.equal(w.runs.length, 2, 'the probe and the install of the second click');
  assert.deepEqual(w.errors, [`Cannot reach "box": ${sentenceF('exit code 1')}`]);
});

test('A1: a pinned call asks the client ONCE per call, before any pin file is written and before any run: of the bare word ssh, in no folder, with the environment of the credential', async () => {
  const dir = ownedDir(scope, 'a1');
  const env = { PATH: '/opt/bin:/usr/bin', CREDS_SSH_PASSWORD: 'a-secret' };
  const w = world({ storageDir: dir, hostKey: PIN, clicks: [{ ok: true, env, auth: 'askpass' }], answer: yes, run: (index) => ran([PROBE_OK, INSTALLED][index]) });

  await click(w, 'installRemoteCli');

  assert.equal(w.runs.length, 2, 'the probe and the install: the question is not among the runs');
  assert.equal(w.clientAsks.length, 1);
  const [asked] = w.clientAsks;
  assert.deepEqual({ pinFilesBefore: asked.pinFilesBefore, runsBefore: asked.runsBefore }, { pinFilesBefore: 0, runsBefore: 0 });
  assert.equal(asked.call.program, 'ssh');
  assert.equal('cwd' in asked.call, false);
  assert.equal(asked.call.env, env, 'the environment that the runs of this call get');
  assert.equal(w.runs.every((one) => one.argv.every((word) => word !== '-V')), true);
});

test('A2: a bridge and its socket check ask once each; the three connections are the bridge, the sweep and the mode check, as before', async (t) => {
  const dir = ownedDir(scope, 'a2');
  const w = await bridged(t, { storageDir: dir, hostKey: PIN, clicks: [writtenKey(KEY_FILE)], checks: [writtenKey('/nonexistent/creds-test/check.key')] });

  assert.equal(w.bridgeArgvs.length, 1);
  assert.equal(w.runs.length, 2, 'the sweep and the mode check');
  assert.equal(w.clientAsks.length, 2);
  assert.deepEqual(w.clientAsks.map((one) => one.call.program), ['ssh', 'ssh']);
});

for (const [label, hostKey] of [['no saved host key', undefined], ['an empty saved host key', ''], ['a saved host key of white space', ' \n\t ']] as const) {
  test(`A3: an entry with ${label} is asked nothing, also in a folder that the rule refuses and with a client that cannot be read: its five runs start as before`, async (t) => {
    const answers = ['', '600', PROBE_OK, INSTALLED];
    const w = await bridged(t, {
      storageDir: under('100%'), hostKey, client: unreadable(1), answer: yes, run: (index) => ran(answers[index]),
      clicks: [writtenKey(KEY_FILE), writtenKey(KEY_FILE)], checks: [writtenKey(KEY_FILE)],
    });
    await click(w, 'installRemoteCli');

    const argvs = [...w.bridgeArgvs, ...w.runs.map((one) => one.argv)];
    assert.equal(argvs.length, 5, `the five runs did not all start: ${argvs.length}`);
    assert.deepEqual(w.clientAsks, []);
    assert.deepEqual(w.errors, []);
    for (const argv of argvs) {
      assert.ok(argv.includes('StrictHostKeyChecking=accept-new'), argv.join(' '));
      assert.deepEqual(sourceWordsOf(argv), [], 'an unpinned run carries a word of a pinned call');
    }
  });
}

for (const [label, client, command] of [['a client that knows the option', KNOWS, ['none']], ['a client below 8.5', OLDER, []]] as const) {
  test(`W1: with ${label}, each of the five runs of a pinned entry says VerifyHostKeyDNS=no and LogLevel=ERROR, and KnownHostsCommand ${command.length === 1 ? '=none' : 'in no word'}`, async (t) => {
    const dir = ownedDir(scope, 'w1');
    const answers = ['', '600', PROBE_OK, INSTALLED];
    const w = await bridged(t, {
      storageDir: dir, hostKey: PIN, client, answer: yes, run: (index) => ran(answers[index]),
      clicks: [writtenKey(KEY_FILE), writtenKey(KEY_FILE)], checks: [writtenKey(KEY_FILE)],
    });
    await click(w, 'installRemoteCli');

    const argvs = [...w.bridgeArgvs, ...w.runs.map((one) => one.argv)];
    assert.equal(argvs.length, 5, `the five runs did not all start: ${argvs.length}; errors: ${w.errors.join(' | ')}`);
    for (const argv of argvs) {
      assert.deepEqual(valuesOf(argv, 'StrictHostKeyChecking'), ['yes']);
      assert.deepEqual(valuesOf(argv, 'VerifyHostKeyDNS'), ['no']);
      assert.deepEqual(valuesOf(argv, 'LogLevel'), ['ERROR']);
      assert.deepEqual(valuesOf(argv, 'KnownHostsCommand'), command);
    }
    assert.deepEqual(w.errors, []);
  });
}

test('W2: a storage folder with a space and an apostrophe works: the pin file is written, each run names it in double quotes as BOTH files, and it holds the pin while the run starts', async () => {
  const dir = path.join(ownedDir(scope, 'w2'), "it's here");
  fs.mkdirSync(dir);
  const w = world({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [{ ok: true, env: {}, auth: 'askpass' }], answer: yes, run: (index) => ran([PROBE_OK, INSTALLED][index]) });

  await click(w, 'installRemoteCli');

  assert.equal(w.runs.length, 2, w.errors.join(' | '));
  for (const one of w.runs) {
    const [user] = valuesOf(one.argv, 'UserKnownHostsFile');
    assert.match(user, /^".*it's here.*known_hosts-e1-[0-9a-f-]{36}"$/);
    assert.deepEqual(valuesOf(one.argv, 'GlobalKnownHostsFile'), [user]);
    assert.equal(one.knownHosts?.text, `box.example ${PIN}\n`, 'the file that the word names held the pin when the run started');
  }
  assert.deepEqual(pinFiles(dir), [], 'the pin file went with the call');
});
```

The socket check cannot be reached with sentence E through the roads (§4.4); the writer that the check uses is the same
`personPinWriter`, and P10 of `personPin.test.ts` holds its refusal.

**Why the refused folders stand "inside" a file.** In the RED run the product does not refuse yet: it tries to make the storage
folder. A relative folder (`~creds`, or a network path on POSIX) was then made in the folder the tests run from (measured on the
scratch copy: two stray folders in `src_vs_code/`). A folder under a FILE can never be made, so the RED run fails at its write and
leaves nothing. That is also why a tilde at the start has no row on the roads: such a path is relative by its nature.

### 6.5 The tests that exist and change, each named (commit c2 names them in its body)

**E1's tests whose expectation E2 changes** (the parent's §5: "the commit that changes it names it"):

| File | Test | What changes, and why |
|---|---|---|
| `hostKeyWords.test.ts` | `G1: a pin file whose path holds white space is ONE quoted word…` | the tab leaves its fixtures: a tab is a control character, refused (K6). The space stays |
| `hostKeyWords.test.ts` | `G1: a pin file whose path holds a double quote is not named at all…` | REMOVED: no file stands in any more (V3 of the parent). Its place is P1 of `pinWords.test.ts` and E1, E2 of `personRoadsPinRefusals.test.ts` |
| `hostKeyWords.test.ts` | `G1: for a pin file whose path holds a double quote the real ssh resolves…` | REMOVED, for the same reason. Its place is G5 of `pinWords.test.ts` |
| `hostKeyWords.test.ts` | `G1: one function writes the words: its four answers` | three answers (the name says so), each with the three new pairs behind the six words |
| `hostKeyWords.test.ts` | `G1: and the tunnel and an exec call off a bridge say exactly what it answers` | the builders' words are compared with the function's whole answer, the new pairs included |
| `hostKeyWords.test.ts` | `a pin file whose path holds no white space is the word of before G1, byte for byte…` | the argv is compared after the new pairs are taken out too (`withoutSources`) |
| `sshExecCommand.test.ts` | `A6: off a bridge a configFile or a pinned flag changes nothing…` | the first 16 words of a pinned argv, in place of the first 10 |
| `personRoadsPin.test.ts` | `QS: on the three roads the answer of the resolve has no name…` | the scan reads `personPinWriter(storageDir, …)` where it read the arrow function of E1; it still finds three |

`hostKeyWords.test.ts` has 16 tests after (18 before). Every other test of the three files keeps its assertions; a pin goes
through `testPin`.

In the diffs of this section a jump-host word of the tests that exist (a user, an at sign and a host under `example`) is written
`<jump>`: the line keeps the word it has. Every diff here is against `cbeae5b8`, with two lines of context.

```diff
--- a/src_vs_code/src/test/hostKeyWords.test.ts
+++ b/src_vs_code/src/test/hostKeyWords.test.ts
@@ -12,5 +12,5 @@
 import { fakePath } from './fakePaths';
 import { importedUses } from './funnelScan';
-import { hostKeyWordsOf, lastHostKeyWordAt, valuesOf, withoutGlobal } from './pinnedArgv';
+import { hostKeyWordsOf, lastHostKeyWordAt, sourceWordsOf, testPin, valuesOf, withoutGlobal, withoutSources } from './pinnedArgv';
 import { discoverSources } from './tempSiteScan';
 
@@ -34,7 +34,4 @@
 /** As on macOS, where the editor's storage folder is under `Application Support`. */
 const SPACED = fakePath('Application Support/Code/keys/4242/known_hosts-e1-0b6f3c1e');
-const TABBED = fakePath('a\tb/known_hosts-e1');
-const QUOTED_TWICE = fakePath('a"b c"d/known_hosts-e1');
-const QUOTED_ONCE = fakePath('a"b/known_hosts-e1');
 const KEY = fakePath('k.key');
 const CONFIG_FILE = fakePath('bridges/call-1.ssh_config');
@@ -50,8 +47,8 @@
 
 const run = (pin: string | undefined, auth: SshExecAuth, options: SshExecOptions = {}, entity: EntityMetadata = HOST): Argv =>
-  buildSshExecArgv(entity, KEY, 'id', auth, { ...options, knownHostsFile: pin });
+  buildSshExecArgv(entity, KEY, 'id', auth, { ...options, knownHostsFile: testPin(pin) });
 
 const tunnel = (pin: string | undefined, auth: SshExecAuth, extra: readonly string[] = []): Argv =>
-  buildBridgeArgv(HOST, { port: 51234, remote: { path: '/tmp/creds-dev-abc.sock' }, auth, extra, keyPath: KEY, knownHostsFile: pin }, () => true);
+  buildBridgeArgv(HOST, { port: 51234, remote: { path: '/tmp/creds-dev-abc.sock' }, auth, extra, keyPath: KEY, knownHostsFile: testPin(pin) }, () => true);
 
 /** Every kind of argv that carries G1's words, for one pin file (or none): the tunnel and the exec calls OFF a bridge. No kind has a caller's `extra`. */
@@ -84,6 +81,6 @@
 const UNPINNED = ['-o', 'StrictHostKeyChecking=accept-new'];
 
-/** What stands in for a pin file that cannot be named: it holds no key, so `ssh` refuses every host. */
-const NO_KEY_FILE = '/dev/null';
+/** The pairs that E2 adds for a client that knows `KnownHostsCommand` (the plan's §3.10, §3.12): the tests of them are `pinWords.test.ts`. */
+const PIN_SOURCES = ['-o', 'VerifyHostKeyDNS=no', '-o', 'KnownHostsCommand=none', '-o', 'LogLevel=ERROR'];
 
 /* --- part 1: what is sent --- */
@@ -98,16 +95,6 @@
 
 test('G1: a pin file whose path holds white space is ONE quoted word, the same in both options', () => {
-  for (const file of [SPACED, TABBED]) {
-    for (const [name, argv] of argvs(file)) {
-      assert.deepEqual(hostKeyWordsOf(argv), pinned(`"${file}"`), `${name}: ssh would read this path as two files`);
-    }
-  }
-});
-
-test('G1: a pin file whose path holds a double quote is not named at all: both options name a file that holds no key, and the check stays strict', () => {
-  for (const file of [QUOTED_TWICE, QUOTED_ONCE]) {
-    for (const [name, argv] of argvs(file)) {
-      assert.deepEqual(hostKeyWordsOf(argv), pinned(NO_KEY_FILE), `${name}: ${file} reached ssh`);
-    }
+  for (const [name, argv] of argvs(SPACED)) {
+    assert.deepEqual(hostKeyWordsOf(argv), pinned(`"${SPACED}"`), `${name}: ssh would read this path as two files`);
   }
 });
@@ -121,23 +108,25 @@
 
 /** The function, read through the module object: this file compiles before the function exists, so its absence is a failed assertion. */
-function theFunction(): (pinFile: string | undefined) => string[] {
+function theFunction(): (pin: ReturnType<typeof testPin> | undefined) => string[] {
   const found = (hostKeyPin as Record<string, unknown>).hostKeyWords;
   assert.equal(typeof found, 'function', 'hostKeyPin.ts exports no hostKeyWords');
-  return found as (pinFile: string | undefined) => string[];
+  return found as (pin: ReturnType<typeof testPin> | undefined) => string[];
 }
 
-test('G1: one function writes the words: its four answers', () => {
+test('G1: one function writes the words: its three answers', () => {
   const hostKeyWords = theFunction();
   assert.deepEqual(hostKeyWords(undefined), UNPINNED);
-  assert.deepEqual(hostKeyWords(PIN), pinned(PIN));
-  assert.deepEqual(hostKeyWords(SPACED), pinned(`"${SPACED}"`));
-  assert.deepEqual(hostKeyWords(QUOTED_TWICE), pinned(NO_KEY_FILE));
+  assert.deepEqual(hostKeyWords(testPin(PIN)), [...pinned(PIN), ...PIN_SOURCES]);
+  assert.deepEqual(hostKeyWords(testPin(SPACED)), [...pinned(`"${SPACED}"`), ...PIN_SOURCES]);
 });
 
 test('G1: and the tunnel and an exec call off a bridge say exactly what it answers', () => {
   const hostKeyWords = theFunction();
-  for (const file of [undefined, PIN, SPACED, QUOTED_TWICE]) {
+  for (const file of [undefined, PIN, SPACED]) {
+    const words = hostKeyWords(testPin(file));
     for (const [name, argv] of argvs(file)) {
-      assert.deepEqual(hostKeyWordsOf(argv), hostKeyWords(file), `${name}, ${file ?? 'no pin'}`);
+      const at = argv.indexOf(words[1]) - 1;
+      assert.deepEqual(argv.slice(at, at + words.length), words, `${name}, ${String(file)}`);
+      assert.deepEqual([...hostKeyWordsOf(argv), ...sourceWordsOf(argv)], words, `${name}, ${String(file)}: another word names one of the six options`);
     }
   }
@@ -158,5 +147,5 @@
   }
   assert.deepEqual(hostKeyWordsOf(bridgedRun(false, 'key')), ['-o', 'StrictHostKeyChecking=accept-new']);
-  assert.deepEqual(hostKeyWordsOf(buildSshExecArgv(HOST, KEY, 'id', 'key', { bridged: true, configFile: CONFIG_FILE, pinned: true, knownHostsFile: PIN }) ?? []), [], 'a known-hosts file on a bridged call is refused: no argv');
+  assert.deepEqual(hostKeyWordsOf(buildSshExecArgv(HOST, KEY, 'id', 'key', { bridged: true, configFile: CONFIG_FILE, pinned: true, knownHostsFile: testPin(PIN) }) ?? []), [], 'a known-hosts file on a bridged call is refused: no argv');
 });
 
@@ -172,7 +161,7 @@
 ];
 
-test('a pin file whose path holds no white space is the word of before G1, byte for byte: only the third option is new', () => {
-  assert.deepEqual(withoutGlobal(run(PIN, 'key') ?? []), RUN_BEFORE_G1);
-  assert.deepEqual(withoutGlobal(tunnel(PIN, 'key') ?? []), TUNNEL_BEFORE_G1);
+test('a pin file whose path holds no white space is the word of before G1, byte for byte: only the third option and E2\'s three pairs are new', () => {
+  assert.deepEqual(withoutSources(withoutGlobal(run(PIN, 'key') ?? [])), RUN_BEFORE_G1);
+  assert.deepEqual(withoutSources(withoutGlobal(tunnel(PIN, 'key') ?? [])), TUNNEL_BEFORE_G1);
 });
 
@@ -235,10 +224,4 @@
   }
 });
-
-test('G1: for a pin file whose path holds a double quote the real ssh resolves a strict check against the file that holds no key', NEEDS_SSH, (t) => {
-  for (const [name, argv] of argvs(QUOTED_TWICE)) {
-    assert.deepEqual(resolved(t, argv), onlyFile(NO_KEY_FILE), name);
-  }
-});
 
 test('the control: the same path as a bare word is read as two files, so the test above can show the fault', NEEDS_SSH, (t) => {
--- a/src_vs_code/src/test/sshExecCommand.test.ts
+++ b/src_vs_code/src/test/sshExecCommand.test.ts
@@ -1,3 +1,4 @@
 import assert from 'node:assert/strict';
+import { testPin } from './pinnedArgv';
 import { test } from 'node:test';
 import * as execCommand from '../sshExecCommand';
@@ -258,5 +259,5 @@
 
 test('A4: a bridged call that is given a known-hosts file is refused', () => {
-  assert.equal(buildSshExecArgv(entity(), KEY_FILE, 'id', 'key', { ...BRIDGED, knownHostsFile: '/p/known_hosts' }), undefined);
+  assert.equal(buildSshExecArgv(entity(), KEY_FILE, 'id', 'key', { ...BRIDGED, knownHostsFile: testPin('/p/known_hosts') }), undefined);
 });
 
@@ -272,10 +273,12 @@
 
 test('A6: off a bridge a configFile or a pinned flag changes nothing: today\'s argv', () => {
-  const plain = argvWith(entity(), { jump: '<jump>', knownHostsFile: '/p/known_hosts' }, 'key', KEY_FILE);
+  const plain = argvWith(entity(), { jump: '<jump>', knownHostsFile: testPin('/p/known_hosts') }, 'key', KEY_FILE);
 
-  assert.deepEqual(argvWith(entity(), { jump: '<jump>', knownHostsFile: '/p/known_hosts', configFile: 'c.conf', pinned: false }, 'key', KEY_FILE), plain);
+  assert.deepEqual(argvWith(entity(), { jump: '<jump>', knownHostsFile: testPin('/p/known_hosts'), configFile: 'c.conf', pinned: false }, 'key', KEY_FILE), plain);
   // G1 (§3.9) changes today's pinned off-bridge argv on purpose: the pin file is ALSO the system-wide known-hosts file, so no
   // `/etc/ssh/ssh_known_hosts` entry passes beside it. The six words are `hostKeyWords`'s; the test of that rule is `hostKeyWords.test.ts`.
-  assert.deepEqual(plain.slice(0, 10), ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/p/known_hosts', '-o', 'GlobalKnownHostsFile=/p/known_hosts', '-o', 'ConnectTimeout=10']);
+  // E2 (§3.10, §3.12) adds three pairs behind them, for a client that knows `KnownHostsCommand`: the test of that rule is `pinWords.test.ts`.
+  assert.deepEqual(plain.slice(0, 16), ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/p/known_hosts', '-o', 'GlobalKnownHostsFile=/p/known_hosts',
+    '-o', 'VerifyHostKeyDNS=no', '-o', 'KnownHostsCommand=none', '-o', 'LogLevel=ERROR', '-o', 'ConnectTimeout=10']);
   assert.ok(!plain.includes('-F'));
 });
@@ -349,5 +352,5 @@
   };
   // A bridged call (E1.6) names its per-call file and carries its pin in it, so it takes no known-hosts file: `pinned` says which check it asks for.
-  const placed: SshExecOptions = c.bridged ? { configFile: 'c.conf', pinned: c.pin !== undefined } : { knownHostsFile: c.pin };
+  const placed: SshExecOptions = c.bridged ? { configFile: 'c.conf', pinned: c.pin !== undefined } : { knownHostsFile: testPin(c.pin) };
   const options: SshExecOptions = { bridged: c.bridged, noTty: c.noTty, ownAgent: c.ownAgent, jump: c.jump, ...placed };
   const argv = buildSshExecArgv({ ...c.entry, port: c.port }, c.key, 'id', c.auth, options);
--- a/src_vs_code/src/test/sshBridge.test.ts
+++ b/src_vs_code/src/test/sshBridge.test.ts
@@ -1,3 +1,4 @@
 import assert from 'node:assert/strict';
+import { testPin } from './pinnedArgv';
 import { test } from 'node:test';
 import { EntityMetadata } from '../types';
@@ -136,5 +137,5 @@
 
 test('a pinned host key is enforced when one exists, and accept-new only when none does', () => {
-  const pinned = argv({ knownHostsFile: '/keys/known_hosts' });
+  const pinned = argv({ knownHostsFile: testPin('/keys/known_hosts') });
   assert.ok(pinned.includes('StrictHostKeyChecking=yes'));
   assert.ok(pinned.includes('UserKnownHostsFile=/keys/known_hosts'));
@@ -516,5 +517,5 @@
       extra: parts.extra,
       keyPath: parts.key ? '/keys/id_ed25519' : undefined,
-      knownHostsFile: parts.pin ? '/keys/known_hosts' : undefined,
+      knownHostsFile: testPin(parts.pin ? '/keys/known_hosts' : undefined),
     },
     SAFE,
--- a/src_vs_code/src/test/personRoadsPin.test.ts
+++ b/src_vs_code/src/test/personRoadsPin.test.ts
@@ -354,8 +354,8 @@
 });
 
-test('QS: on the three roads the answer of the resolve has no name: each resolveExecAuth( of agentCommands.ts is the first argument of a guard that is given writePersonPin', () => {
+test('QS: on the three roads the answer of the resolve has no name: each resolveExecAuth( of agentCommands.ts is the first argument of a guard that is given personPinWriter', () => {
   const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'commands', 'agentCommands.ts'), 'utf8');
   const resolves = source.match(/\bresolveExecAuth\s*\(/g) ?? [];
-  const guarded = source.match(/\bwithWrittenKey(?:UntilExit)?\(await resolveExecAuth\([^\n]*?\), \(auth\) => writePersonPin\(storageDir, (?:entity|details), auth\), /g) ?? [];
+  const guarded = source.match(/\bwithWrittenKey(?:UntilExit)?\(await resolveExecAuth\([^\n]*?\), personPinWriter\(storageDir, (?:entity|details)\), /g) ?? [];
 
   assert.equal(resolves.length, 3, `the scan does not find the three resolves of the three roads: ${resolves.length}`);
```

**`personPin.test.ts`** (10 tests before, 17 after): P1 to P9 and P2b take the writer's new shape through one helper (`write`),
with every assertion kept; where a stand-in of `./hostKeyTrust` is given, it also answers `knownHostsPath`. P10 to P16 are new.

```diff
--- a/src_vs_code/src/test/personPin.test.ts
+++ b/src_vs_code/src/test/personPin.test.ts
@@ -6,5 +6,7 @@
 import { formatHostKey, knownHostsLine, parseHostKey } from '../hostKeyPin';
 import { materializedKeysDir } from '../materializedKeys';
+import type { PinClient, PinClientAsk, PinClientCall } from '../pinClient';
 import type { EntityMetadata } from '../types';
+import type { PinOfCall } from '../writtenKey';
 import { loadWithVscode } from './vscodeStub';
 
@@ -36,4 +38,23 @@
 const pinModule = (mocks: Record<string, unknown> = {}): PersonPin => loadWithVscode<PersonPin>('../personPin', {}, mocks);
 
+const ENV: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: '/home/someone' };
+const KNOWS: PinClient = { kind: 'knows', token: 'OpenSSH_10.2' };
+
+/** An asker that records each question and answers what the test says. */
+function asker(answer: PinClient = KNOWS): { ask: PinClientAsk; asked: PinClientCall[] } {
+  const asked: PinClientCall[] = [];
+  return { ask: (call) => (asked.push(call), Promise.resolve(answer)), asked };
+}
+
+/** One call of the writer, with a client that knows the option unless the test names another asker. */
+const write = (mod: PersonPin, dir: string, snapshot: EntityMetadata, auth: 'key' | 'askpass', ask: PinClientAsk = asker().ask): Promise<PinOfCall> =>
+  mod.writePersonPin({ storageDir: dir, entity: snapshot, ask }, auth, ENV);
+
+/** The path of the pin file that an answer holds. */
+const fileOf = (answer: PinOfCall): string | undefined => (answer.ok ? answer.knownHostsFile?.file : undefined);
+
+/** The stand-in of `knownHostsPath` beside a stand-in of the write: a path that the rule takes. */
+const PLANNED = (dir: string, id: string, suffix?: string): string => `${dir}/keys/1/known_hosts-${id}-${String(suffix)}`;
+
 /** What is in this window's key folder of `dir`; none when the folder was never made. */
 function written(dir: string): string[] {
@@ -42,23 +63,23 @@
 }
 
-test('P1: no saved host key, an empty one and one of white space are unpinned: the answer holds no file and nothing is written', () => {
+test('P1: no saved host key, an empty one and one of white space are unpinned: the answer holds no file and nothing is written', async () => {
   const dir = ownedDir(scope, 'p1');
   const mod = pinModule();
 
   for (const hostKey of [undefined, '', '   ', ' \n\t ']) {
-    assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey }), 'key'), { ok: true });
-    assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey }), 'askpass'), { ok: true });
+    assert.deepEqual(await write(mod, dir, entity({ hostKey }), 'key'), { ok: true });
+    assert.deepEqual(await write(mod, dir, entity({ hostKey }), 'askpass'), { ok: true });
   }
   assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P1: an unpinned entry wrote into the key folder');
 });
 
-test('P2: a saved host key that can be used is written to a file of this call: known_hosts-<id>-<uuid> in the key folder, the line of the entry', () => {
+test('P2: a saved host key that can be used is written to a file of this call: known_hosts-<id>-<uuid> in the key folder, the line of the entry', async () => {
   const dir = ownedDir(scope, 'p2');
   assert.deepEqual(parseHostKey(PIN), HOST_KEY, 'the fixture is not a pin that the real parser reads');
 
-  const answer = pinModule().writePersonPin(dir, entity({ hostKey: PIN, port: 2222 }), 'askpass');
+  const answer = await write(pinModule(), dir, entity({ hostKey: PIN, port: 2222 }), 'askpass');
 
   assert.equal(answer.ok, true);
-  const file = answer.ok ? answer.knownHostsFile : undefined;
+  const file = fileOf(answer);
   assert.ok(file !== undefined, 'P2: a pinned entry got no pin file');
   assert.equal(path.dirname(file), materializedKeysDir(dir));
@@ -68,10 +89,10 @@
 });
 
-test('P2b: on POSIX the pin file is the owner\'s alone, in a folder that is the owner\'s alone', { skip: process.platform === 'win32' }, () => {
+test('P2b: on POSIX the pin file is the owner\'s alone, in a folder that is the owner\'s alone', { skip: process.platform === 'win32' }, async () => {
   const dir = ownedDir(scope, 'p2b');
 
-  const answer = pinModule().writePersonPin(dir, entity({ hostKey: PIN }), 'key');
+  const answer = await write(pinModule(), dir, entity({ hostKey: PIN }), 'key');
 
-  const file = answer.ok ? answer.knownHostsFile : undefined;
+  const file = fileOf(answer);
   assert.ok(file !== undefined);
   assert.equal(fs.statSync(file).mode & 0o777, 0o600);
@@ -79,5 +100,5 @@
 });
 
-test('P3: two calls of one entry write two distinct files, and neither writes or replaces known_hosts-<id>', () => {
+test('P3: two calls of one entry write two distinct files, and neither writes or replaces known_hosts-<id>', async () => {
   const dir = ownedDir(scope, 'p3');
   const older = path.join(materializedKeysDir(dir), 'known_hosts-e1');
@@ -86,8 +107,8 @@
   const mod = pinModule();
 
-  const first = mod.writePersonPin(dir, entity({ hostKey: PIN }), 'key');
-  const second = mod.writePersonPin(dir, entity({ hostKey: PIN }), 'key');
+  const first = await write(mod, dir, entity({ hostKey: PIN }), 'key');
+  const second = await write(mod, dir, entity({ hostKey: PIN }), 'key');
 
-  const files = [first, second].map((answer) => (answer.ok ? answer.knownHostsFile : undefined));
+  const files = [first, second].map((answer) => (fileOf(answer)));
   assert.ok(files[0] !== undefined && files[1] !== undefined);
   assert.notEqual(files[0], files[1], 'P3: two calls share one pin file');
@@ -96,5 +117,5 @@
 });
 
-test('P4: a saved host key that does not parse is refused with sentence A, the key form for a key login, word for word; nothing is written', () => {
+test('P4: a saved host key that does not parse is refused with sentence A, the key form for a key login, word for word; nothing is written', async () => {
   const dir = ownedDir(scope, 'p4');
   const mod = pinModule();
@@ -102,13 +123,13 @@
   for (const hostKey of ['not a host key', 'ssh-ed25519', 'ssh-ed25519 short', 'ssh-dss AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY']) {
     assert.equal(parseHostKey(hostKey), undefined, `the fixture ${hostKey} is a pin that the real parser reads`);
-    assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey }), 'key'), { ok: false, message: KEY_FORM });
+    assert.deepEqual(await write(mod, dir, entity({ hostKey }), 'key'), { ok: false, message: KEY_FORM });
   }
   assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P4: a refused pin wrote into the key folder');
 });
 
-test('P5: the same pin on a password login is refused with the password form, word for word, which never sends the person to Connect SSH to save it', () => {
+test('P5: the same pin on a password login is refused with the password form, word for word, which never sends the person to Connect SSH to save it', async () => {
   const dir = ownedDir(scope, 'p5');
 
-  const answer = pinModule().writePersonPin(dir, entity({ hostKey: 'not a host key' }), 'askpass');
+  const answer = await write(pinModule(), dir, entity({ hostKey: 'not a host key' }), 'askpass');
 
   assert.deepEqual(answer, { ok: false, message: PASSWORD_FORM });
@@ -118,22 +139,22 @@
 });
 
-test('P6: a pin that parses on a host that cannot form a known_hosts line, or on no host, is refused with sentence A too; nothing is written', () => {
+test('P6: a pin that parses on a host that cannot form a known_hosts line, or on no host, is refused with sentence A too; nothing is written', async () => {
   const dir = ownedDir(scope, 'p6');
   const mod = pinModule();
 
   assert.equal(knownHostsLine('-oProxyCommand=evil', undefined, HOST_KEY), undefined, 'the fixture host forms a line');
-  assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey: PIN, host: '-oProxyCommand=evil' }), 'key'), { ok: false, message: KEY_FORM });
-  assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey: PIN, host: undefined }), 'askpass'), { ok: false, message: PASSWORD_FORM });
+  assert.deepEqual(await write(mod, dir, entity({ hostKey: PIN, host: '-oProxyCommand=evil' }), 'key'), { ok: false, message: KEY_FORM });
+  assert.deepEqual(await write(mod, dir, entity({ hostKey: PIN, host: undefined }), 'askpass'), { ok: false, message: PASSWORD_FORM });
   assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P6: a refused pin wrote into the key folder');
 });
 
-test('P7: a write that throws is refused with sentence B and the text of the error, for an Error and for a thrown string; it does not throw', () => {
-  const throwing = (thrown: unknown): PersonPin => pinModule({ './hostKeyTrust': { materializeKnownHosts: (): never => { throw thrown; } } });
+test('P7: a write that throws is refused with sentence B and the text of the error, for an Error and for a thrown string; it does not throw', async () => {
+  const throwing = (thrown: unknown): PersonPin => pinModule({ './hostKeyTrust': { knownHostsPath: PLANNED, materializeKnownHosts: (): never => { throw thrown; } } });
 
-  assert.deepEqual(throwing(new Error('ENOSPC: no space left on device')).writePersonPin('/storage', entity({ hostKey: PIN }), 'key'), {
+  assert.deepEqual(await write(throwing(new Error('ENOSPC: no space left on device')), '/storage', entity({ hostKey: PIN }), 'key'), {
     ok: false,
     message: 'Could not write the saved host key of "box" to disk: ENOSPC: no space left on device',
   });
-  assert.deepEqual(throwing('the disk is gone').writePersonPin('/storage', entity({ hostKey: PIN }), 'askpass'), {
+  assert.deepEqual(await write(throwing('the disk is gone'), '/storage', entity({ hostKey: PIN }), 'askpass'), {
     ok: false,
     message: 'Could not write the saved host key of "box" to disk: the disk is gone',
@@ -141,9 +162,9 @@
 });
 
-test('P8: a REAL folder that cannot be written is refused with sentence B, and the real error is in it', () => {
+test('P8: a REAL folder that cannot be written is refused with sentence B, and the real error is in it', async () => {
   const dir = ownedDir(scope, 'p8');
   fs.writeFileSync(path.join(dir, 'keys'), 'a file where the key folder would be');
 
-  const answer = pinModule().writePersonPin(dir, entity({ hostKey: PIN }), 'key');
+  const answer = await write(pinModule(), dir, entity({ hostKey: PIN }), 'key');
 
   assert.equal(answer.ok, false);
@@ -151,12 +172,12 @@
 });
 
-test('P9: the writer hands materializeKnownHosts the storage folder, the snapshot as it is, and a new uuid per call', () => {
+test('P9: the writer hands materializeKnownHosts the storage folder, the snapshot as it is, and a new uuid per call', async () => {
   const calls: unknown[][] = [];
-  const recording = { './hostKeyTrust': { materializeKnownHosts: (...args: unknown[]): string => (calls.push(args), `/storage/pin-${calls.length}`) } };
+  const recording = { './hostKeyTrust': { knownHostsPath: PLANNED, materializeKnownHosts: (...args: unknown[]): string => (calls.push(args), `/storage/pin-${calls.length}`) } };
   const mod = pinModule(recording);
   const snapshot = entity({ hostKey: PIN });
 
-  assert.deepEqual(mod.writePersonPin('/storage', snapshot, 'key'), { ok: true, knownHostsFile: '/storage/pin-1' });
-  assert.deepEqual(mod.writePersonPin('/storage', snapshot, 'key'), { ok: true, knownHostsFile: '/storage/pin-2' });
+  assert.equal(fileOf(await write(mod, '/storage', snapshot, 'key')), '/storage/pin-1');
+  assert.equal(fileOf(await write(mod, '/storage', snapshot, 'key')), '/storage/pin-2');
 
   assert.equal(calls.length, 2);
@@ -166,2 +187,96 @@
   assert.notEqual(calls[0][2], calls[1][2], 'P9: two calls got one suffix');
 });
+
+/* --- E2.S2: the two refusals that stand before the write (the plan's §3.10, §3.11), and the checked value --- */
+
+const SENTENCE_E = 'The saved host key of "box" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with a percent sign, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key.';
+const SENTENCE_F = 'CredsForDevs could not read the version of the ssh program on this computer (exit code 255), so it did not start a connection that has to check the saved host key of "box". Nothing was sent to that host. The reason is the ssh program here, not the host.';
+
+test('P10: a path that ssh would not read as one file is refused with sentence E before the client is asked and before anything is written', async () => {
+  const dir = path.join(ownedDir(scope, 'p10'), '100%');
+  const { ask, asked } = asker();
+
+  const answer = await write(pinModule(), dir, entity({ hostKey: PIN }), 'key', ask);
+
+  assert.deepEqual(answer, { ok: false, message: SENTENCE_E });
+  assert.deepEqual(asked, []);
+  assert.equal(fs.existsSync(dir), false, 'P10: a refused path wrote into the storage folder');
+});
+
+test('P11: a client that cannot be read is refused with sentence F and nothing is written; it was asked once, of the bare word ssh, in no folder, with the call\'s environment', async () => {
+  const dir = ownedDir(scope, 'p11');
+  const { ask, asked } = asker({ kind: 'unreadable', exitCode: 255 });
+
+  const answer = await write(pinModule(), dir, entity({ hostKey: PIN }), 'askpass', ask);
+
+  assert.deepEqual(answer, { ok: false, message: SENTENCE_F });
+  assert.deepEqual(asked, [{ program: 'ssh', env: ENV }]);
+  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P11: a refused client wrote into the key folder');
+});
+
+test('P12: the client is asked BEFORE the pin file is written, and an entry with no saved host key is not asked at all', async () => {
+  const dir = ownedDir(scope, 'p12');
+  const seen: string[][] = [];
+  const ask: PinClientAsk = () => (seen.push(written(dir)), Promise.resolve(KNOWS));
+  const mod = pinModule();
+
+  const answer = await write(mod, dir, entity({ hostKey: PIN }), 'key', ask);
+  await write(mod, dir, entity({ hostKey: '  ' }), 'key', ask);
+  await write(mod, dir, entity(), 'key', ask);
+
+  assert.deepEqual(seen, [[]], 'asked once, with nothing on the disk');
+  assert.equal(written(dir).length, 1);
+  assert.equal(answer.ok, true);
+});
+
+test('P13: the answer holds the CHECKED pin: the path as it was written, its word (in double quotes for a folder with a space and an apostrophe), and the client\'s answer', async () => {
+  const dir = path.join(ownedDir(scope, 'p13'), "it's here");
+  fs.mkdirSync(dir);
+  const mod = pinModule();
+
+  const knows = await write(mod, dir, entity({ hostKey: PIN }), 'key');
+  const older = await write(mod, dir, entity({ hostKey: PIN }), 'key', asker({ kind: 'older', token: 'OpenSSH_8.4' }).ask);
+
+  assert.ok(knows.ok && knows.knownHostsFile !== undefined && older.ok && older.knownHostsFile !== undefined);
+  assert.equal(path.dirname(knows.knownHostsFile.file), materializedKeysDir(dir));
+  assert.equal(knows.knownHostsFile.word, `"${knows.knownHostsFile.file}"`);
+  assert.equal(knows.knownHostsFile.knowsKnownHostsCommand, true);
+  assert.equal(older.knownHostsFile.knowsKnownHostsCommand, false);
+  assert.equal(fs.readFileSync(knows.knownHostsFile.file, 'utf8'), knownHostsLine('box.example', undefined, HOST_KEY));
+});
+
+test('P14: the value is made from the path that was WRITTEN: a write that answers another path than the planned one, of a refused kind, is deleted and refused with sentence E', async () => {
+  const forgotten: string[] = [];
+  const mod = pinModule({
+    './hostKeyTrust': { knownHostsPath: PLANNED, materializeKnownHosts: (): string => '/storage/100%/pin-1' },
+    './keyInstaller': { forgetMaterializedKey: (file: string): void => void forgotten.push(file) },
+  });
+
+  assert.deepEqual(await write(mod, '/storage', entity({ hostKey: PIN }), 'key'), { ok: false, message: SENTENCE_E });
+  assert.deepEqual(forgotten, ['/storage/100%/pin-1']);
+});
+
+test('P15: a saved host key that cannot be used is told with sentence A after the client answered; with a client that cannot be read the person reads sentence F first', async () => {
+  const dir = ownedDir(scope, 'p15');
+  const read = asker();
+  const unread = asker({ kind: 'unreadable', exitCode: 255 });
+  const mod = pinModule();
+
+  assert.deepEqual(await write(mod, dir, entity({ hostKey: 'not a host key' }), 'key', read.ask), { ok: false, message: KEY_FORM });
+  assert.deepEqual(await write(mod, dir, entity({ hostKey: 'not a host key' }), 'key', unread.ask), { ok: false, message: SENTENCE_F });
+  assert.equal(read.asked.length, 1);
+  assert.equal(fs.existsSync(path.join(dir, 'keys')), false);
+});
+
+test('P16: personPinWriter binds the storage folder, the snapshot and this window\'s asker, and hands on the login and the environment of the credential', async () => {
+  const asked: PinClientCall[] = [];
+  const mod = pinModule({ './pinClient': { windowPinClient: (call: PinClientCall): Promise<PinClient> => (asked.push(call), Promise.resolve({ kind: 'unreadable', exitCode: 255 })) } });
+  const env = { PATH: '/opt/bin' };
+
+  const answer = await mod.personPinWriter(ownedDir(scope, 'p16'), entity({ hostKey: PIN }))('key', env);
+
+  assert.deepEqual(answer, { ok: false, message: SENTENCE_F });
+  assert.deepEqual(asked, [{ program: mod.PERSON_SSH_PROGRAM, env }]);
+  assert.equal(asked[0].env, env);
+  assert.equal(mod.PERSON_SSH_PROGRAM, 'ssh');
+});
```

**`writtenKey.test.ts`** (18 before, 22 after): the pin writers answer promises, every call of `withWrittenKeyUntilExit` is
awaited, and `assert.throws(() => …)` around it becomes `await assert.rejects(() => …)`; every assertion of U1 to U17 is kept.
U18 to U21 are new.

```diff
--- a/src_vs_code/src/test/writtenKey.test.ts
+++ b/src_vs_code/src/test/writtenKey.test.ts
@@ -1,3 +1,6 @@
 import assert from 'node:assert/strict';
+import * as fs from 'node:fs';
+import * as path from 'node:path';
+import { testPin } from './pinnedArgv';
 import { test } from 'node:test';
 import type { ExecAuth } from '../sshExecAuth';
@@ -22,9 +25,9 @@
 const PIN_FILE = '/storage/keys/1/known_hosts-e1-unit';
 /** The pin writer of an unpinned entry: nothing is written. */
-const NO_PIN: PinWriter = () => ({ ok: true });
+const NO_PIN: PinWriter = () => Promise.resolve({ ok: true });
 /** The pin writer of a pinned entry: the path of the file it wrote. */
-const PINNED: PinWriter = () => ({ ok: true, knownHostsFile: PIN_FILE });
+const PINNED: PinWriter = () => Promise.resolve({ ok: true, knownHostsFile: testPin(PIN_FILE) });
 /** The pin writer of an entry whose saved host key cannot be used. */
-const BAD_PIN: PinWriter = () => ({ ok: false, message: 'the saved host key cannot be used' });
+const BAD_PIN: PinWriter = () => Promise.resolve({ ok: false, message: 'the saved host key cannot be used' });
 
 function guards(): { mod: Guards; forgotten: string[] } {
@@ -94,5 +97,5 @@
   const started = { process: { exited: exited.promise } };
 
-  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => started), started, 'the started thing was not handed back');
+  assert.equal(await mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => started), started, 'the started thing was not handed back');
   await turn();
   assert.deepEqual(forgotten, [], 'the key file was deleted while its process runs');
@@ -103,21 +106,21 @@
 });
 
-test('U5: withWrittenKeyUntilExit deletes at once when nothing was started, and when the start throws (the same error)', () => {
+test('U5: withWrittenKeyUntilExit deletes at once when nothing was started, and when the start throws (the same error)', async () => {
   const { mod, forgotten } = guards();
   const failure = new Error('spawn EACCES');
 
-  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => undefined), undefined);
+  assert.equal(await mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => undefined), undefined);
   assert.deepEqual(forgotten, [KEY_FILE]);
 
-  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => { throw failure; }), (error) => error === failure);
+  await assert.rejects(() => mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => { throw failure; }), (error) => error === failure);
   assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
 });
 
-test('U6: a continuation that cannot be attached deletes the key file once, at once, and the error goes on', () => {
+test('U6: a continuation that cannot be attached deletes the key file once, at once, and the error goes on', async () => {
   const { mod, forgotten } = guards();
   // What a broken spawner could hand back: a process with no `exited`. The attach throws; the finally is then the one delete.
   const broken = { process: { get exited(): Promise<unknown> { throw new TypeError('no exited'); } } };
 
-  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => broken), TypeError);
+  await assert.rejects(() => mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => broken), TypeError);
   assert.deepEqual(forgotten, [KEY_FILE]);
 });
@@ -130,5 +133,5 @@
   process.on('unhandledRejection', note);
   try {
-    mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => ({ process: { exited: exited.promise } }));
+    await mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => ({ process: { exited: exited.promise } }));
     exited.reject(new Error('the wait failed'));
     await turn();
@@ -145,8 +148,8 @@
   const { mod, forgotten } = guards();
 
-  mod.withWrittenKeyUntilExit(OWN_FILE, NO_PIN, () => ({ process: { exited: Promise.resolve(0) } }));
-  mod.withWrittenKeyUntilExit(OWN_FILE, NO_PIN, () => undefined);
-  mod.withWrittenKeyUntilExit(REFUSED, NO_PIN, () => undefined);
-  mod.withWrittenKeyUntilExit(PASSWORD, NO_PIN, () => ({ process: { exited: Promise.resolve(0) } }));
+  await mod.withWrittenKeyUntilExit(OWN_FILE, NO_PIN, () => ({ process: { exited: Promise.resolve(0) } }));
+  await mod.withWrittenKeyUntilExit(OWN_FILE, NO_PIN, () => undefined);
+  await mod.withWrittenKeyUntilExit(REFUSED, NO_PIN, () => undefined);
+  await mod.withWrittenKeyUntilExit(PASSWORD, NO_PIN, () => ({ process: { exited: Promise.resolve(0) } }));
   await turn();
 
@@ -158,5 +161,5 @@
   const order: string[] = [];
   const run = held<string>();
-  const writer: PinWriter = (auth) => (order.push(`pin:${auth}`), { ok: true, knownHostsFile: PIN_FILE });
+  const writer: PinWriter = (auth) => (order.push(`pin:${auth}`), Promise.resolve({ ok: true, knownHostsFile: testPin(PIN_FILE) }));
   let got: CallAuth | undefined;
 
@@ -164,5 +167,5 @@
   await turn();
   assert.deepEqual(order, ['pin:key', 'run']);
-  assert.deepEqual(got, { ...WRITTEN, knownHostsFile: PIN_FILE });
+  assert.deepEqual(got, { ...WRITTEN, knownHostsFile: testPin(PIN_FILE) });
   assert.deepEqual(forgotten, [], 'a file of the call was deleted while the run was going');
 
@@ -176,9 +179,9 @@
   const got: CallAuth[] = [];
   let written = 0;
-  const counting: PinWriter = () => ((written += 1), { ok: true, knownHostsFile: PIN_FILE });
+  const counting: PinWriter = () => ((written += 1), Promise.resolve({ ok: true, knownHostsFile: testPin(PIN_FILE) }));
 
   await mod.withWrittenKey(PASSWORD, NO_PIN, (call) => (got.push(call), Promise.resolve()));
   await mod.withWrittenKey(REFUSED, counting, (call) => (got.push(call), Promise.resolve()));
-  mod.withWrittenKeyUntilExit(REFUSED, counting, (call) => (got.push(call), undefined));
+  await mod.withWrittenKeyUntilExit(REFUSED, counting, (call) => (got.push(call), undefined));
 
   assert.equal(got[0], PASSWORD, 'the run of an unpinned call did not get the credential itself');
@@ -195,5 +198,5 @@
 
   await mod.withWrittenKey(warned, BAD_PIN, (call) => (got.push(call), Promise.resolve()));
-  mod.withWrittenKeyUntilExit(warned, BAD_PIN, (call) => (got.push(call), undefined));
+  await mod.withWrittenKeyUntilExit(warned, BAD_PIN, (call) => (got.push(call), undefined));
 
   const refusal = { ok: false, message: 'the saved host key cannot be used', warning: 'this key is old' };
@@ -220,5 +223,5 @@
 
   await assert.rejects(mod.withWrittenKey(WRITTEN, throwing, () => ((ran += 1), Promise.resolve())), (error) => error === failure);
-  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, throwing, () => ((ran += 1), undefined)), (error) => error === failure);
+  await assert.rejects(() => mod.withWrittenKeyUntilExit(WRITTEN, throwing, () => ((ran += 1), undefined)), (error) => error === failure);
 
   assert.equal(ran, 0, 'the run or the start was called after the pin writer threw');
@@ -231,11 +234,11 @@
   const started = { process: { exited: exited.promise } };
   const order: string[] = [];
-  const writer: PinWriter = (auth) => (order.push(`pin:${auth}`), { ok: true, knownHostsFile: PIN_FILE });
+  const writer: PinWriter = (auth) => (order.push(`pin:${auth}`), Promise.resolve({ ok: true, knownHostsFile: testPin(PIN_FILE) }));
   let got: CallAuth | undefined;
 
-  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, writer, (call) => (order.push('start'), (got = call), started)), started);
+  assert.equal(await mod.withWrittenKeyUntilExit(WRITTEN, writer, (call) => (order.push('start'), (got = call), started)), started);
   await turn();
   assert.deepEqual(order, ['pin:key', 'start']);
-  assert.deepEqual(got, { ...WRITTEN, knownHostsFile: PIN_FILE });
+  assert.deepEqual(got, { ...WRITTEN, knownHostsFile: testPin(PIN_FILE) });
   assert.deepEqual(forgotten, [], 'a file of the call was deleted while its process runs');
 
@@ -245,16 +248,16 @@
 });
 
-test('U15: withWrittenKeyUntilExit deletes both files at once when nothing was started, when the start throws, and when the continuation cannot be attached', () => {
+test('U15: withWrittenKeyUntilExit deletes both files at once when nothing was started, when the start throws, and when the continuation cannot be attached', async () => {
   const { mod, forgotten } = guards();
   const failure = new Error('spawn EACCES');
   const broken = { process: { get exited(): Promise<unknown> { throw new TypeError('no exited'); } } };
 
-  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => undefined), undefined);
+  assert.equal(await mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => undefined), undefined);
   assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE]);
 
-  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => { throw failure; }), (error) => error === failure);
+  await assert.rejects(() => mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => { throw failure; }), (error) => error === failure);
   assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE, KEY_FILE, PIN_FILE]);
 
-  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => broken), TypeError);
+  await assert.rejects(() => mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => broken), TypeError);
   assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE, KEY_FILE, PIN_FILE, KEY_FILE, PIN_FILE]);
 });
@@ -267,5 +270,5 @@
   process.on('unhandledRejection', note);
   try {
-    mod.withWrittenKeyUntilExit(PASSWORD, PINNED, () => ({ process: { exited: exited.promise } }));
+    await mod.withWrittenKeyUntilExit(PASSWORD, PINNED, () => ({ process: { exited: exited.promise } }));
     exited.reject(new Error('the wait failed'));
     await turn();
@@ -285,6 +288,6 @@
   const other = '/storage/keys/1/known_hosts-e1-other';
 
-  mod.withWrittenKeyUntilExit(PASSWORD, PINNED, () => ({ process: { exited: first.promise } }));
-  mod.withWrittenKeyUntilExit(PASSWORD, () => ({ ok: true, knownHostsFile: other }), () => ({ process: { exited: second.promise } }));
+  await mod.withWrittenKeyUntilExit(PASSWORD, PINNED, () => ({ process: { exited: first.promise } }));
+  await mod.withWrittenKeyUntilExit(PASSWORD, () => Promise.resolve({ ok: true, knownHostsFile: testPin(other) }), () => ({ process: { exited: second.promise } }));
 
   second.resolve(0);
@@ -296,2 +299,64 @@
   assert.deepEqual(forgotten, [other, PIN_FILE]);
 });
+
+/* --- E2.S2: the pin writer is asynchronous; the one await of each guard stands before the run or the start --- */
+
+test('U18: both guards hand the pin writer the login AND the environment of the credential', async () => {
+  const { mod } = guards();
+  const env = { PATH: '/opt/bin', CREDS_SSH_PASSWORD: 'a-secret' };
+  const credential: ExecAuth = { ok: true, env, auth: 'askpass' };
+  const got: unknown[][] = [];
+  const writer: PinWriter = (...args) => (got.push(args), Promise.resolve({ ok: true }));
+
+  await mod.withWrittenKey(credential, writer, () => Promise.resolve());
+  await mod.withWrittenKeyUntilExit(credential, writer, () => undefined);
+
+  assert.deepEqual(got, [['askpass', env], ['askpass', env]]);
+  assert.equal(got[0][1], env);
+});
+
+test('U19: withWrittenKeyUntilExit starts nothing and deletes nothing while the pin writer has not answered; when it answers, the start gets the decided call', async () => {
+  const { mod, forgotten } = guards();
+  const answer = held<{ ok: true; knownHostsFile: ReturnType<typeof testPin> }>();
+  const exited = held<number | null>();
+  const order: string[] = [];
+
+  const result = mod.withWrittenKeyUntilExit(WRITTEN, () => answer.promise, (call) => (order.push(call.ok ? 'start:ready' : 'start:refused'), { process: { exited: exited.promise } }));
+  await turn();
+  assert.deepEqual(order, [], 'the start ran before the pin was decided');
+  assert.deepEqual(forgotten, [], 'a file was deleted while the decision waited');
+
+  answer.resolve({ ok: true, knownHostsFile: testPin(PIN_FILE) });
+  await result;
+  assert.deepEqual(order, ['start:ready']);
+  assert.deepEqual(forgotten, [], 'the files are the process\'s now');
+  exited.resolve(0);
+  await turn();
+  assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE]);
+});
+
+test('U20: a pin writer whose promise REJECTS (it must not) is inside the guarded span of both guards: the key file is deleted, the same error goes on, nothing is run or started', async () => {
+  const { mod, forgotten } = guards();
+  const failure = new Error('the asker broke');
+  const rejecting: PinWriter = () => Promise.reject(failure);
+  let ran = 0;
+
+  await assert.rejects(mod.withWrittenKey(WRITTEN, rejecting, () => ((ran += 1), Promise.resolve())), (error) => error === failure);
+  await assert.rejects(mod.withWrittenKeyUntilExit(WRITTEN, rejecting, () => ((ran += 1), undefined)), (error) => error === failure);
+
+  assert.equal(ran, 0);
+  assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
+});
+
+test('U21: in the source of withWrittenKeyUntilExit the one await is the decision, before the start; from the start to the flag no await stands', () => {
+  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'writtenKey.ts'), 'utf8');
+  const body = source.slice(source.indexOf('export async function withWrittenKeyUntilExit'));
+  const start = body.indexOf('const started = start(decided.call);');
+  const flag = body.indexOf('handed = true;');
+
+  assert.ok(start > 0 && flag > start, 'the scan does not find the start and the flag of the guard');
+  assert.deepEqual(body.match(/\bawait\b/g), ['await'], 'the guard has more than one await, or none');
+  assert.ok(body.indexOf('await decide(credential, writePin)') > 0 && body.indexOf('await decide(credential, writePin)') < start);
+  assert.equal(/\bawait\b/.test(body.slice(start, flag)), false, 'an await stands between the start and the flag');
+  assert.match(body.slice(start, flag), /void started\.process\.exited\.then\(forget, forget\);/);
+});
```

**The agent's exec, `sshExecOver.test.ts`** (11 before, 19 after). Its entry gets a saved host key: before, the stand-in of the
write answered a path for any entry; now an entry with no saved host key is not asked at all. The world's stand-in of
`./hostKeyTrust` also answers `knownHostsPath`, and the deps name an asker. Eight tests are new (the last eight of the file).

```diff
--- a/src_vs_code/src/test/sshExecOver.test.ts
+++ b/src_vs_code/src/test/sshExecOver.test.ts
@@ -1,3 +1,5 @@
 import * as assert from 'node:assert/strict';
+import type { PinClient } from '../pinClient';
+import { testPin } from './pinnedArgv';
 import * as fs from 'node:fs';
 import * as path from 'node:path';
@@ -52,4 +54,8 @@
   /** How many times `deps.agentSocket()` was read. */
   readonly socketReads: () => number;
+  /** Every question about the client of a pinned call (G1, §3.10): the program it was asked of. */
+  readonly pinAsks: string[];
+  /** How many times `materializeKnownHosts` was called. */
+  readonly pinWrites: () => number;
 }
 
@@ -61,5 +67,6 @@
 }
 
-const SSH = sshEntity();
+/** A saved host key: the world's stand-in of `./hostKeyTrust` answers the pin file for it, and an entry with none is not asked (G1, §3.10). */
+const SSH = sshEntity({ hostKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' });
 
 const KEY = { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE KEY BODY' };
@@ -72,4 +79,14 @@
   /** The answers of the first, second, … read of `deps.agentSocket()`; a read past the list answers nothing (an agent that went away between two reads). */
   readonly agentSocketReads?: readonly (string | undefined)[];
+  /** What the `ssh` program answers about its version. Default: a client that knows `KnownHostsCommand`. */
+  readonly client?: PinClient;
+  /** The path `knownHostsPath` plans for the pin file. Default: the path the write answers. */
+  readonly plannedPin?: string;
+  /** `materializeKnownHosts` answers none: the saved host key is there and cannot be used. */
+  readonly unusablePin?: boolean;
+  /** The deps name no asker at all. */
+  readonly noAsker?: boolean;
+  /** The path the write answers, when it is not the one the test reads back as `knownHosts`. */
+  readonly writtenPin?: string;
 }
 
@@ -80,4 +97,6 @@
   const notes: string[] = [];
   const knownHosts = path.join(storageDir, 'known_hosts-s1');
+  const pinAsks: string[] = [];
+  let pinWrites = 0;
   const stub = { window: { showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined), showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined) } };
   const writeKey = (dir: string, id: string, content: string): string => {
@@ -94,5 +113,8 @@
       writeAskpassScriptFile: (): string => path.join(storageDir, 'askpass.sh'),
     },
-    './hostKeyTrust': { materializeKnownHosts: (): string => knownHosts },
+    './hostKeyTrust': {
+      knownHostsPath: (): string => parts.plannedPin ?? knownHosts,
+      materializeKnownHosts: (): string | undefined => ((pinWrites += 1), parts.unusablePin === true ? undefined : (parts.writtenPin ?? knownHosts)),
+    },
     './sshExecRunner': {
       runSshExec: (argv: string[], o: { env: NodeJS.ProcessEnv; timeoutMs: number; program?: string }): Promise<unknown> => {
@@ -125,4 +147,5 @@
       notes.push(message);
     },
+    pinClient: (call) => (pinAsks.push(call.program), Promise.resolve(parts.client ?? { kind: 'knows', token: 'OpenSSH_test' })),
     agentSocket: (): string | undefined => {
       socketReads += 1;
@@ -130,5 +153,6 @@
     },
   };
-  return { mod, deps, runs, materialised, notes, slots, knownHosts, socketReads: () => socketReads };
+  const wired: SshUseDeps = parts.noAsker === true ? { ...deps, pinClient: undefined } : deps;
+  return { mod, deps: wired, runs, materialised, notes, slots, knownHosts, socketReads: () => socketReads, pinAsks, pinWrites: () => pinWrites };
 }
 
@@ -148,5 +172,5 @@
   assert.equal(answer.status, 200);
   assert.equal(w.materialised.length, 1, 'the stored key was written once, for this call');
-  const expected = buildSshExecArgv(SSH, w.materialised[0], 'echo linked', 'key', { jump: '<jump>', knownHostsFile: w.knownHosts, bridged: false, ownAgent: false });
+  const expected = buildSshExecArgv(SSH, w.materialised[0], 'echo linked', 'key', { jump: '<jump>', knownHostsFile: testPin(w.knownHosts), bridged: false, ownAgent: false });
   assert.deepEqual(w.runs[0].argv, expected);
   assert.equal(w.runs[0].program, sshSpawnLaunch(SSH, undefined, process.platform).program);
@@ -254,5 +278,5 @@
   assert.equal(linked.runs[0].argv[0], '-T', linked.runs[0].argv.join(' '));
   assert.equal(linked.runs[0].argv.filter((arg) => arg === '-T').length, 1, 'exactly one -T');
-  const without = buildSshExecArgv(SSH, linked.materialised[0], 'echo linked', 'key', { jump: undefined, knownHostsFile: linked.knownHosts, bridged: false, ownAgent: false });
+  const without = buildSshExecArgv(SSH, linked.materialised[0], 'echo linked', 'key', { jump: undefined, knownHostsFile: testPin(linked.knownHosts), bridged: false, ownAgent: false });
   assert.deepEqual(linked.runs[0].argv.slice(1), without, 'the option adds one word and moves nothing: the rest is the same call without noTty');
 
@@ -339,2 +363,100 @@
   assert.ok(empty.notes.some((note) => note.includes(NO_AGENT_TO_FORWARD)), empty.notes.join(' | '));
 });
+
+/* --- G1, E2.S2: the pin of a call off a bridge is decided before its file is written (the plan's §3.10, §3.11; test 22) --- */
+
+const SENTENCE_F = 'CredsForDevs could not read the version of the ssh program on this computer (exit code 1), so it did not start a connection that has to check the saved host key of "prod box". Nothing was sent to that host. The reason is the ssh program here, not the host.';
+const SENTENCE_E = 'The saved host key of "prod box" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with a percent sign, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key.';
+
+test('g1_a_pinned_call_asks_the_program_it_will_start_once_before_the_pin_file_is_written', async () => {
+  const w = await world({ source: KEY });
+
+  const answer = (await w.mod.execOverSsh(w.deps)(CTX, callOf())) as Answer;
+
+  assert.equal(answer.status, 200);
+  assert.deepEqual(w.pinAsks, [sshSpawnLaunch(SSH, undefined, process.platform).program]);
+  assert.equal(w.pinWrites(), 1);
+  assert.equal(w.runs[0].program, w.pinAsks[0], 'the program that was asked is the program that ran');
+  assert.ok(w.runs[0].argv.includes('KnownHostsCommand=none') && w.runs[0].argv.includes('VerifyHostKeyDNS=no') && w.runs[0].argv.includes('LogLevel=ERROR'));
+});
+
+test('g1_an_older_client_runs_without_the_knownhostscommand_word', async () => {
+  const w = await world({ source: KEY, client: { kind: 'older', token: 'OpenSSH_8.4' } });
+
+  const answer = (await w.mod.execOverSsh(w.deps)(CTX, callOf())) as Answer;
+
+  assert.equal(answer.status, 200);
+  assert.equal(w.runs[0].argv.some((word) => word.startsWith('KnownHostsCommand')), false);
+  assert.ok(w.runs[0].argv.includes('StrictHostKeyChecking=yes') && w.runs[0].argv.includes('VerifyHostKeyDNS=no') && w.runs[0].argv.includes('LogLevel=ERROR'));
+});
+
+test('g1_a_client_that_cannot_be_read_is_refused_with_sentence_f_before_any_pin_file_and_nothing_is_spawned', async () => {
+  const w = await world({ source: KEY, client: { kind: 'unreadable', exitCode: 1 } });
+
+  const answer = (await w.mod.execOverSsh(w.deps)(CTX, callOf())) as Answer;
+
+  assert.equal(answer.status, 409);
+  assert.deepEqual(answer.body, { error: { code: 'no_credential', message: SENTENCE_F } });
+  assert.equal(w.pinWrites(), 0, 'the pin file was written for a refused call');
+  assert.equal(w.runs.length, 0);
+  assert.equal(fs.existsSync(w.materialised[0]), false, 'the key file of the call was removed');
+});
+
+test('g1_a_pin_path_that_ssh_would_not_read_as_one_file_is_refused_with_sentence_e_before_the_client_is_asked', async () => {
+  const w = await world({ source: KEY, plannedPin: '/storage/100%/keys/1/known_hosts-s1' });
+
+  const answer = (await w.mod.execOverSsh(w.deps)(CTX, callOf())) as Answer;
+
+  assert.equal(answer.status, 409);
+  assert.deepEqual(answer.body, { error: { code: 'no_credential', message: SENTENCE_E } });
+  assert.equal(JSON.stringify(answer.body).includes('/storage'), false, 'the answer echoes the path');
+  assert.deepEqual(w.pinAsks, []);
+  assert.equal(w.pinWrites(), 0);
+  assert.equal(w.runs.length, 0);
+});
+
+test('g1_an_entry_with_no_saved_host_key_is_asked_nothing_and_runs_with_accept_new', async () => {
+  const w = await world({ source: KEY, client: { kind: 'unreadable', exitCode: 1 }, plannedPin: '/storage/100%/known_hosts-s1' });
+
+  const answer = (await w.mod.execOverSsh(w.deps)(CTX, callOf({ ssh: sshEntity() }))) as Answer;
+
+  assert.equal(answer.status, 200);
+  assert.deepEqual(w.pinAsks, []);
+  assert.equal(w.pinWrites(), 0);
+  assert.ok(w.runs[0].argv.includes('StrictHostKeyChecking=accept-new'));
+  assert.equal(w.runs[0].argv.some((word) => /^(VerifyHostKeyDNS|KnownHostsCommand|LogLevel|UserKnownHostsFile)=/.test(word)), false);
+});
+
+test('g1_a_saved_host_key_that_cannot_be_used_still_runs_with_accept_new_as_before_c3', async () => {
+  const w = await world({ source: KEY, unusablePin: true });
+
+  const answer = (await w.mod.execOverSsh(w.deps)(CTX, callOf())) as Answer;
+
+  assert.equal(answer.status, 200);
+  assert.equal(w.pinWrites(), 1, 'the usable-or-not question is materializeKnownHosts\'s, unchanged');
+  assert.ok(w.runs[0].argv.includes('StrictHostKeyChecking=accept-new'));
+  assert.equal(w.runs[0].argv.some((word) => /^(VerifyHostKeyDNS|KnownHostsCommand|LogLevel)=/.test(word)), false);
+});
+
+test('g1_deps_that_name_no_asker_refuse_a_pinned_call_and_start_no_ssh_at_all_not_even_for_its_version', async () => {
+  const w = await world({ source: KEY, noAsker: true });
+
+  const answer = (await w.mod.execOverSsh(w.deps)(CTX, callOf())) as Answer;
+
+  assert.equal(answer.status, 409);
+  assert.deepEqual(answer.body, { error: { code: 'no_credential', message: SENTENCE_F.replace('exit code 1', 'it did not start, or did not end in time') } });
+  assert.equal(w.runs.length, 0, 'the stand-in runner saw a start: the real asker ran');
+  assert.equal(w.pinWrites(), 0);
+});
+
+test('g1_a_written_path_of_a_refused_kind_is_refused_with_sentence_e_and_the_entrys_own_file_is_not_deleted', async () => {
+  // The planned path passes the rule and the write answers another one: the value is made from the written path, and this
+  // file is the entry's own (no suffix), which other calls read. The world gives `./keyInstaller` no `forgetMaterializedKey`: a delete would throw.
+  const w = await world({ source: KEY, writtenPin: '/storage/100%/known_hosts-s1' });
+
+  const answer = (await w.mod.execOverSsh(w.deps)(CTX, callOf())) as Answer;
+
+  assert.equal(answer.status, 409);
+  assert.deepEqual(answer.body, { error: { code: 'no_credential', message: SENTENCE_E } });
+  assert.equal(w.runs.length, 0);
+});
```

**`secondEntryWorld.ts`** names an asker. Without it the two tests `G5, exec` and `G5, run` of `agentKeyPath.test.ts`, whose
entry is pinned, are refused with sentence F (measured: they were the only two tests of the whole suite that this story turned
red outside the files above). No other world of the fifteen that build these deps has a pinned entry.

```diff
--- a/src_vs_code/src/test/secondEntryWorld.ts
+++ b/src_vs_code/src/test/secondEntryWorld.ts
@@ -285,4 +285,6 @@
     },
     agentSocket: () => undefined,
+    // The asker of a pinned call (G1, §3.10): a client that knows `KnownHostsCommand`. With none named, a pinned call of this world is refused.
+    pinClient: () => Promise.resolve({ kind: 'knows', token: 'OpenSSH_test' }),
   };
   const agentDeps: AgentUseDeps & { onPath: () => boolean; overSsh: OverSsh } = {
```

***Run with Secrets*:** `sshRoadWorld.ts` (the fake road answers and records the question; every fake session is pinned, so the
default answer is a client that knows the option), `secretsLaunch.test.ts` (10 before, 14 after), `sshRoadSecrets.test.ts`
(31 before, 33 after), `maskedTerminal.test.ts` (one call gets the fifth argument).

```diff
--- a/src_vs_code/src/test/sshRoadWorld.ts
+++ b/src_vs_code/src/test/sshRoadWorld.ts
@@ -1,3 +1,4 @@
 import assert from 'node:assert/strict';
+import type { PinClient } from '../pinClient';
 import { isLinkTarget } from '../remoteLaunch';
 import { resolveJumpChain } from '../sshOptions';
@@ -31,4 +32,7 @@
 export type RoadScript = (ssh: EntityMetadata, n: number) => RoadAnswer;
 
+/** The answer of a client that knows `KnownHostsCommand` (OpenSSH 8.5 or newer): the default of every fake road. */
+export const KNOWS: PinClient = { kind: 'knows', token: 'OpenSSH_test' };
+
 export interface FakeRoad extends SshRoad {
   /** Each `prepare`, with the SSH entry exactly as the road handed it, and the entry's own count from 1. */
@@ -46,4 +50,8 @@
   /** Every answer of `spawnLaunch`, in order. */
   readonly launches: SpawnLaunch[];
+  /** Every question about the client of a pinned session (G1, §3.10), in order: the program and the folder it was asked of. */
+  readonly clientAsks: { readonly program: string; readonly cwd: string | undefined }[];
+  /** What the client answers. A test sets it; the default knows `KnownHostsCommand`. */
+  client: PinClient;
   /** One `'<sshId>#<n>'` per call of a ready's `cleanup`, repeats INCLUDED (`cleaned` keeps only the call that did something). */
   readonly cleanupCalls: string[];
@@ -102,4 +110,6 @@
     uses: [],
     launches: [],
+    clientAsks: [],
+    client: KNOWS,
     cleanupCalls: [],
     prepare: (_accountId, ssh, use): Promise<PreparedSsh> => {
@@ -115,4 +125,8 @@
       return Promise.resolve();
     },
+    pinClient: (call): Promise<PinClient> => {
+      road.clientAsks.push({ program: call.program, cwd: call.cwd });
+      return Promise.resolve(road.client);
+    },
     spawnLaunch: (ssh, env): SpawnLaunch => {
       const launch = launchAnswer(ssh, env, spawnWarning, spawnRefused);
--- a/src_vs_code/src/test/secretsLaunch.test.ts
+++ b/src_vs_code/src/test/secretsLaunch.test.ts
@@ -1,3 +1,4 @@
 import assert from 'node:assert/strict';
+import { testPin } from './pinnedArgv';
 import { test } from 'node:test';
 import { planRefs } from '../runPlan';
@@ -21,4 +22,5 @@
 import { EntityMetadata, PortForward } from '../types';
 import { NONCE } from './remoteShellHarness';
+import { KNOWS } from './sshRoadWorld';
 import { fakeRoad, sshNode } from './sshRoadWorld';
 
@@ -64,5 +66,5 @@
 
 function spawnArgv(plan: RemotePlan, prepared: PreparedForSpawn, ownAgent = false): readonly string[] {
-  const launch = secretsLaunch(plan, prepared, ownAgent, NONCE);
+  const launch = secretsLaunch(plan, prepared, ownAgent, NONCE, KNOWS);
   assert.equal(launch.kind, 'spawn', launch.kind === 'refused' ? launch.reason : '');
   return launch.kind === 'spawn' ? launch.argv : [];
@@ -75,5 +77,5 @@
   const prepared: PreparedForSpawn = { ...ready, entity: { ...ready.entity, sshKeyPath: '/keys/s1.key' }, env: undefined };
   const plan = planOf();
-  const launch = secretsLaunch(plan, prepared, false, NONCE);
+  const launch = secretsLaunch(plan, prepared, false, NONCE, KNOWS);
   assert.equal(launch.kind, 'spawn');
   if (launch.kind !== 'spawn') {
@@ -81,5 +83,5 @@
   }
   assert.equal(launch.argv[0], '-T', 'ssh is asked for no remote pty, first and by name (T1; also with RequestTTY force in the person\'s config)');
-  const expected = buildSshExecArgv(prepared.entity, '/keys/s1.key', secretsRemoteCommand(NONCE), 'key', { jump: prepared.jump, knownHostsFile: prepared.options.knownHostsFile, ownAgent: false, noTty: true });
+  const expected = buildSshExecArgv(prepared.entity, '/keys/s1.key', secretsRemoteCommand(NONCE), 'key', { jump: prepared.jump, knownHostsFile: testPin(prepared.options.knownHostsFile), ownAgent: false, noTty: true });
   assert.ok(expected !== undefined, 'the entity passes the host check');
   assert.deepEqual(launch.argv, expected);
@@ -139,11 +141,11 @@
   const expected = { kind: 'refused', reason: secretsLocalOnly('deploy') };
   assert.notEqual(expected.reason, '', 'the sentence exists');
-  assert.deepEqual(secretsLaunch(planOf(), { ...ready, prefix: "env SSH_AUTH_SOCK='/run/x.sock' " }, false, NONCE), expected);
-  assert.deepEqual(secretsLaunch(planOf(), { ...ready, options: { ...ready.options, program: '/mnt/c/Windows/System32/OpenSSH/ssh.exe' } as PreparedForSpawn['options'] }, false, NONCE), expected);
+  assert.deepEqual(secretsLaunch(planOf(), { ...ready, prefix: "env SSH_AUTH_SOCK='/run/x.sock' " }, false, NONCE, KNOWS), expected);
+  assert.deepEqual(secretsLaunch(planOf(), { ...ready, options: { ...ready.options, program: '/mnt/c/Windows/System32/OpenSSH/ssh.exe' } as PreparedForSpawn['options'] }, false, NONCE, KNOWS), expected);
 });
 
 test('an_entity_with_no_safe_host_is_refused_with_the_no_host_sentence', async () => {
   const ready = await readyOf();
-  const launch = secretsLaunch(planOf(), { ...ready, entity: { ...ready.entity, host: '-oProxyCommand=x' } }, false, NONCE);
+  const launch = secretsLaunch(planOf(), { ...ready, entity: { ...ready.entity, host: '-oProxyCommand=x' } }, false, NONCE, KNOWS);
   assert.deepEqual(launch, { kind: 'refused', reason: noHostSentence('prod box') });
 });
@@ -179,2 +181,41 @@
   assert.ok(!plain.includes('Note:'));
 });
+
+/* --- G1, E2.S2: the pin file that Connect's options wrote is checked before the argv is built (the plan's §3.10, §3.11; test 22) --- */
+
+const pinnedAt = (ready: PreparedForSpawn, file: string | undefined): PreparedForSpawn => ({ ...ready, options: { ...ready.options, knownHostsFile: file } });
+const sourcesOf = (argv: readonly string[]): string[] => argv.filter((word) => /^(VerifyHostKeyDNS|KnownHostsCommand|LogLevel)=/.test(word));
+
+test('G1: a pinned session gets the six pairs for a client that knows the option, and no KnownHostsCommand word for an older one; an unpinned one gets none', async () => {
+  const ready = await readyOf();
+  const older = secretsLaunch(planOf(), pinnedAt(ready, '/keys/kh-s1'), false, NONCE, { kind: 'older', token: 'OpenSSH_8.4' });
+  assert.deepEqual(sourcesOf(spawnArgv(planOf(), pinnedAt(ready, '/keys/kh-s1'))), ['VerifyHostKeyDNS=no', 'KnownHostsCommand=none', 'LogLevel=ERROR']);
+  assert.deepEqual(sourcesOf(older.kind === 'spawn' ? older.argv : ['refused']), ['VerifyHostKeyDNS=no', 'LogLevel=ERROR']);
+  assert.deepEqual(sourcesOf(spawnArgv(planOf(), pinnedAt(ready, undefined))), []);
+});
+
+test('G1: a pinned session whose ssh cannot be read, or was not asked, is refused with sentence F and gets no argv', async () => {
+  const ready = await readyOf();
+  const plan = planOf();
+  const NAME = plan.sshName;
+  assert.deepEqual(secretsLaunch(plan, pinnedAt(ready, '/keys/kh-s1'), false, NONCE, { kind: 'unreadable', exitCode: 255 }), { kind: 'refused', reason: `CredsForDevs could not read the version of the ssh program on this computer (exit code 255), so it did not start a connection that has to check the saved host key of "${NAME}". Nothing was sent to that host. The reason is the ssh program here, not the host.` });
+  assert.deepEqual(secretsLaunch(plan, pinnedAt(ready, '/keys/kh-s1'), false, NONCE, undefined), { kind: 'refused', reason: `CredsForDevs could not read the version of the ssh program on this computer (it did not start, or did not end in time), so it did not start a connection that has to check the saved host key of "${NAME}". Nothing was sent to that host. The reason is the ssh program here, not the host.` });
+});
+
+test('G1: a pinned session whose pin file has a path that ssh would not read as one file is refused with sentence E, which echoes no path; the path is asked before the client', async () => {
+  const ready = await readyOf();
+  const plan = planOf();
+  const NAME = plan.sshName;
+  const launch = secretsLaunch(plan, pinnedAt(ready, '/keys/100%/kh-s1'), false, NONCE, { kind: 'unreadable', exitCode: 1 });
+  assert.deepEqual(launch, { kind: 'refused', reason: `The saved host key of "${NAME}" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with a percent sign, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key.` });
+  assert.equal(launch.kind === 'refused' && launch.reason.includes('/keys'), false);
+  const quoted = spawnArgv(plan, pinnedAt(ready, "/keys/it's here/kh-s1"));
+  assert.ok(quoted.includes(`UserKnownHostsFile="/keys/it's here/kh-s1"`) && quoted.includes(`GlobalKnownHostsFile="/keys/it's here/kh-s1"`));
+});
+
+test('G1: an unpinned session is not asked: with no answer about the client it is spawned as before, with accept-new', async () => {
+  const ready = await readyOf();
+  const launch = secretsLaunch(planOf(), pinnedAt(ready, undefined), false, NONCE, undefined);
+  assert.equal(launch.kind, 'spawn');
+  assert.ok(launch.kind === 'spawn' && launch.argv.includes('StrictHostKeyChecking=accept-new'));
+});
--- a/src_vs_code/src/test/sshRoadSecrets.test.ts
+++ b/src_vs_code/src/test/sshRoadSecrets.test.ts
@@ -8,5 +8,5 @@
 import { ArrowOptions, ArrowWorld, MaskedRecord, arrowWorld, runCommandsModule, vaultOf } from './arrowWorld';
 import { OUR_SOCKET } from './fakePaths';
-import { FakeRoad, RoadScript, fakeRoad, recordDialogs, sshNode } from './sshRoadWorld';
+import { FakeRoad, KNOWS, RoadScript, fakeRoad, recordDialogs, sshNode } from './sshRoadWorld';
 import { hostOs, until } from './vpnWorld';
 import { cleanupScope } from '../../scripts/lib/leftovers.cjs';
@@ -153,5 +153,5 @@
   const run = theRun(aw);
   const spawn = only(road.launches);
-  const launch = secretsLaunch(PLAN, r1, spawn.kind === 'spawn' && spawn.ownAgent, nonceOf(run));
+  const launch = secretsLaunch(PLAN, r1, spawn.kind === 'spawn' && spawn.ownAgent, nonceOf(run), KNOWS);
   assert.equal(launch.kind, 'spawn');
   assert.deepEqual(run.argv, ['ssh', ...(launch.kind === 'spawn' ? launch.argv : [])]);
@@ -494,2 +494,23 @@
   assert.deepEqual(road.calls, []);
 });
+
+/* --- G1, E2.S2: the road asks the program of the spawn, for a pinned session, and a refusal starts nothing (the plan's §3.10; test 22) --- */
+
+test('g1_a_pinned_session_asks_the_program_and_the_folder_of_the_spawn_once_before_the_trust_question', async () => {
+  const { aw, road } = setup({ trusted: [['e1', BARE]] });
+  await aw.runWithSecrets(LINKED);
+  const spawn = only(road.launches);
+  assert.ok(spawn.kind === 'spawn');
+  assert.deepEqual(road.clientAsks, [{ program: spawn.program, cwd: spawn.cwd }]);
+  assert.equal(aw.masked.length, 1);
+});
+
+test('g1_a_client_that_cannot_be_read_spawns_nothing_says_sentence_f_and_cleans_the_session', async () => {
+  const { aw, road, vault } = setup({ trusted: [['e1', BARE]] });
+  road.client = { kind: 'unreadable', exitCode: 1 };
+  await aw.runWithSecrets(LINKED);
+  assert.deepEqual(aw.warnings, ['CredsForDevs could not read the version of the ssh program on this computer (exit code 1), so it did not start a connection that has to check the saved host key of "' + PLAN.sshName + '". Nothing was sent to that host. The reason is the ssh program here, not the host.']);
+  assert.deepEqual(aw.masked, [], 'no masked run was made');
+  assert.deepEqual(vault.calls, [], 'nobody was asked and no value was read');
+  assert.deepEqual(road.cleanupCalls, ['s1#1'], 'the session, and with it the pin file that Connect\'s options wrote, is cleaned by its owner');
+});
--- a/src_vs_code/src/test/maskedTerminal.test.ts
+++ b/src_vs_code/src/test/maskedTerminal.test.ts
@@ -10,5 +10,5 @@
 import { EntityMetadata } from '../types';
 import { NONCE, writeFakeSsh } from './remoteShellHarness';
-import { fakeRoad, sshNode } from './sshRoadWorld';
+import { KNOWS, fakeRoad, sshNode } from './sshRoadWorld';
 import { StubEventEmitter, loadWithVscode } from './vscodeStub';
 import { ownedDir } from '../../scripts/lib/leftovers.cjs';
@@ -524,5 +524,5 @@
   const plan = planLaunch(LINKED, sshLinkOf(LINKED, (id) => (id === 's1' ? S1 : undefined)), { stayOpen: false });
   assert.equal(plan.kind, 'remote');
-  const launch = secretsLaunch(plan as RemotePlan, road.readies[0], false, NONCE);
+  const launch = secretsLaunch(plan as RemotePlan, road.readies[0], false, NONCE, KNOWS);
   assert.equal(launch.kind, 'spawn');
   return launch.kind === 'spawn' ? launch.argv : [];
```

### 6.6 The counts after c2 (measured on the scratch copy; the coder reads them from the runner)

| File | Tests | Was |
|---|---|---|
| `pinWords.test.ts` | 19 | new |
| `personRoadsPinRefusals.test.ts` | 28 | new |
| `hostKeyWords.test.ts` | 16 | 18 |
| `personPin.test.ts` | 17 | 10 |
| `writtenKey.test.ts` | 22 | 18 |
| `sshExecOver.test.ts` | 19 | 11 |
| `agentKeyPath.test.ts` | 17 | 17 |
| `secretsLaunch.test.ts` | 14 | 10 |
| `sshRoadSecrets.test.ts` | 33 | 31 |
| `personRoadsPin.test.ts` | 28 | 28 |
| `personRoadsHostKey.test.ts` | 37 | 37 |
| `personRoadsForgetKey.test.ts` | 15 | 15 |
| `sshExecCommand.test.ts` | 31 | 31 |
| `sshBridge.test.ts` | 46 | 46 |
| `maskedTerminal.test.ts` | 31 | 31 |

The files with no change of a count that were run because they scan or share what this story touches: `noConnectionSharing.test.ts`
(9: 8 pass, 1 skipped), `launchRoadScan.test.ts` (10), `keysDirPaths.test.ts` (4), `bridgedSshClient.test.ts` (19),
`pinClient.test.ts` (16): green.

**The whole suite on the scratch copy** (643 test files; the copy has no repository around it, so the tests that read the
repository's own README, contract and workflows fail there with and without this story: 63 tests, the same names on an unchanged
copy). Beyond those, the whole run with the code of E2.S1 and E2.S2 had four red tests: the two lists of
`noConnectionSharing.test.ts`, which are the S1 spec's (its §3.4), and `G5, exec` and `G5, run` of `agentKeyPath.test.ts`, which
`secondEntryWorld.ts` repairs (§6.5). After both repairs those two files are green. The whole suite was not run again after
them; the coder runs it in the real checkout, which has the repository around it.

### 6.7 The RED texts (commit c1 on the product as E2.S1 left it)

`node --test out/test/pinWords.test.js out/test/personRoadsPinRefusals.test.js` on the scratch copy with commit c1 on the product
of E2.S1: `tsc` exit 0; 47 tests, 8 pass, 39 fail, each by a failed assertion. Measured 2026-11-18. E1's own files stay green in
that state: `personRoadsPin` 28, `personRoadsHostKey` 37, `personRoadsForgetKey` 15, `hostKeyWords` 18.

The 8 that pass on the old product are the guards and the controls: A3 (3: an entry with no saved host key), W2 of the roads (E1
already quotes a path with a space), W3 and W4 of `pinWords` (an unpinned argv, and "nothing else moved"), G2 and G5 of `pinWords`
(the two controls).

The first lines of each failure, as the runner printed them (`<pid>` is the process id in the key folder's name, `<a file of the
test>` the owned file of §6.4; long lines are cut with `…`). The folder was never made: the old product fails at `mkdir` with
`ENOTDIR` and shows sentence B, where the new one shows sentence E before it writes.

```text
✖ E1: a storage folder with a control character in its path starts no install: sentence E, no question to the client, no run, no pin file, the key fi…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   `Cannot reach "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir '<a file of the test>/a\tb/keys/<pid>'`
✖ E2: a storage folder with a control character in its path opens no bridge: sentence E, no run, no pin file, the key file deleted, no socket check
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   `Cannot bridge to "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir '<a file of the test>/a\tb/keys/<pid>'`
✖ E1: a storage folder with a double quote in its path starts no install: sentence E, no question to the client, no run, no pin file, the key file de…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   `Cannot reach "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir '<a file of the test>/a"b/keys/<pid>'`
✖ E2: a storage folder with a double quote in its path opens no bridge: sentence E, no run, no pin file, the key file deleted, no socket check
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   `Cannot bridge to "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir '<a file of the test>/a"b/keys/<pid>'`
✖ E1: a storage folder with two backslashes in a row (a network path) in its path starts no install: sentence E, no question to the client, no run, n…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   `Cannot reach "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir '<a file of the test>/a\\\\b/keys/<pid>'`
✖ E2: a storage folder with two backslashes in a row (a network path) in its path opens no bridge: sentence E, no run, no pin file, the key file dele…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   `Cannot bridge to "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir '<a file of the test>/a\\\\b/keys/<pid>'`
✖ E1: a storage folder with a backslash before an apostrophe in its path starts no install: sentence E, no question to the client, no run, no pin fil…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   `Cannot reach "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir '<a file of the test>/a\\'b/keys/<pid>'`
✖ E2: a storage folder with a backslash before an apostrophe in its path opens no bridge: sentence E, no run, no pin file, the key file deleted, no s…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   `Cannot bridge to "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir '<a file of the test>/a\\'b/keys/<pid>'`
✖ E1: a storage folder with a percent sign in its path starts no install: sentence E, no question to the client, no run, no pin file, the key file de…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   `Cannot reach "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir '<a file of the test>/100%/keys/<pid>'`
✖ E2: a storage folder with a percent sign in its path opens no bridge: sentence E, no run, no pin file, the key file deleted, no socket check
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   `Cannot bridge to "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir '<a file of the test>/100%/keys/<pid>'`
✖ E1: a storage folder with the characters ${ in its path starts no install: sentence E, no question to the client, no run, no pin file, the key file…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   'Cannot reach "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir \'<a file of the test>/a${b}/keys/<pid>\''
✖ E2: a storage folder with the characters ${ in its path opens no bridge: sentence E, no run, no pin file, the key file deleted, no socket check
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   'Cannot bridge to "box": Could not write the saved host key of "box" to disk: ENOTDIR: not a directory, mkdir \'<a file of the test>/a${b}/keys/<pid>\''
✖ F1: an ssh program whose version cannot be read (exit code 1) starts no install: sentence F, no run, no pin file, the key file deleted
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      -   'Cannot reach "box": CredsForDevs could not read the version of the ssh program on this computer (exit code 1), so it did not start a connection that has to check the saved host key of "box". Not…
✖ F2: an ssh program whose version cannot be read (exit code 1) opens no bridge: sentence F, no run, no pin file, the key file deleted, no socket che…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      -   'Cannot bridge to "box": CredsForDevs could not read the version of the ssh program on this computer (exit code 1), so it did not start a connection that has to check the saved host key of "box".…
✖ F1: an ssh program whose version cannot be read (exit code 0) starts no install: sentence F, no run, no pin file, the key file deleted
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      -   'Cannot reach "box": CredsForDevs could not read the version of the ssh program on this computer (exit code 0), so it did not start a connection that has to check the saved host key of "box". Not…
✖ F2: an ssh program whose version cannot be read (exit code 0) opens no bridge: sentence F, no run, no pin file, the key file deleted, no socket che…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      -   'Cannot bridge to "box": CredsForDevs could not read the version of the ssh program on this computer (exit code 0), so it did not start a connection that has to check the saved host key of "box".…
✖ F1: an ssh program whose version cannot be read (it did not start, or did not end in time) starts no install: sentence F, no run, no pin file, the …
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      -   'Cannot reach "box": CredsForDevs could not read the version of the ssh program on this computer (it did not start, or did not end in time), so it did not start a connection that has to check the…
✖ F2: an ssh program whose version cannot be read (it did not start, or did not end in time) opens no bridge: sentence F, no run, no pin file, the ke…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      -   'Cannot bridge to "box": CredsForDevs could not read the version of the ssh program on this computer (it did not start, or did not end in time), so it did not start a connection that has to check…
✖ F3: the socket check whose own question finds no version does not run: the log says sentence F, no run of the check starts, its pin file is not wri…
  AssertionError [ERR_ASSERTION]: the bridge asked, and the check asked
      0 !== 2
✖ F4: "cannot be read" is asked again: a second click asks the client a second time, and connects when it then answers
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
      2 !== 0
✖ A1: a pinned call asks the client ONCE per call, before any pin file is written and before any run: of the bare word ssh, in no folder, with the en…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
      0 !== 1
✖ A2: a bridge and its socket check ask once each; the three connections are the bridge, the sweep and the mode check, as before
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
      0 !== 2
✖ W1: with a client that knows the option, each of the five runs of a pinned entry says VerifyHostKeyDNS=no and LogLevel=ERROR, and KnownHostsCommand…
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      -   'no'
✖ W1: with a client below 8.5, each of the five runs of a pinned entry says VerifyHostKeyDNS=no and LogLevel=ERROR, and KnownHostsCommand in no word
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      -   'no'
✖ W1: for a client that knows the option, a pinned argv says the six pairs side by side, in this order, and no other word names one of the six options
  AssertionError [ERR_ASSERTION]: the tunnel of a bridge, a key: the six pairs do not stand side by side
      +   '-N',
✖ W2: for a client below 8.5 the same without the KnownHostsCommand pair: no word of the argv names that option
  AssertionError [ERR_ASSERTION]: the tunnel of a bridge, a key: the five pairs do not stand side by side
      +   '-N',
✖ W5: the new pairs stand before every word that the entry or a caller adds, and a caller's own words for the three options come second
  AssertionError [ERR_ASSERTION]: the tunnel of a bridge, a key: a word of the entry stands before the last pair
✖ W6: one function writes them, and both builders say exactly what it answers for each client
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      -   '-o',
✖ G1: under a config that says KnownHostsCommand, VerifyHostKeyDNS yes and LogLevel QUIET, the real ssh resolves every pinned argv to none of them
  AssertionError [ERR_ASSERTION]: the tunnel of a bridge, a key
      +   'knownhostscommand /bin/echo x',
✖ G3: the words of an OLDER client leave a config's KnownHostsCommand on in a client that knows the option: so the answer about the client decides
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   'loglevel SILENT',
✖ P1: the rule of the path, row by row: as it is, in double quotes, or refused with its kind; the refusing half answers the same kind
  AssertionError [ERR_ASSERTION]: hostKeyPin.ts exports no checkedPin
✖ P2: both words carry the same spelling, the file of the value is the path as it was given, and the client's answer is the value's
  AssertionError [ERR_ASSERTION]: hostKeyPin.ts exports no checkedPin
✖ P3: every kind has its words for sentence E, and the kinds are these eight, in the order the rule asks them
  AssertionError [ERR_ASSERTION]: hostKeyPin.ts exports no PIN_PATH_KINDS
✖ P4: every path that the rule of the bridged file refuses, this rule refuses too (it may refuse more, never less)
  AssertionError [ERR_ASSERTION]: hostKeyPin.ts exports no pinPathRefusal
✖ P5: sentences E and F, word for word: no path, no part of the program's output but the exit code
  AssertionError [ERR_ASSERTION]: hostKeyPin.ts exports no pinPathSentence
✖ G4: every path that the rule writes, the real ssh resolves to exactly that path in BOTH lists
  AssertionError [ERR_ASSERTION]: a pair of apostrophes (row a: bare, ssh reads ANOTHER path): Warning: Identity file /nonexistent/creds-test/k.key not accessible: No such file or directory.
      +   system: '/tmp/creds-ab/kh',
✖ S1: no shipped file names /dev/null, NUL or "none" as a known-hosts file on a command line: a pin file has no stand-in
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      +   'hostKeyPin.ts'
✖ S2: a checked pin is made in one place: no shipped file casts to CheckedPin but checkedPin itself, and the brand is not exported
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      -   'hostKeyPin.ts'
✖ S3: the three new options are spelled in hostKeyPin.ts and in no other shipped file
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      -   'hostKeyPin.ts'
```

## 7. Documents (commit c3)

Each text below is the contract of what the document must say; the coder writes it in the document's own style and reads the
counts from the runner.

1. **`src_vs_code/CHANGELOG.md`, `[Unreleased]`, the entry of G1.** Only the parts that this story makes untrue (the stories
   document; the whole entry is E2.S4's):
   - In the first paragraph, the "two exceptions" with "Neither is off on these calls yet", and in the second "a
     `KnownHostsCommand` or `VerifyHostKeyDNS` in your own `ssh` config is still asked", are replaced by: a call without a terminal
     for an entry with a saved host key now says `VerifyHostKeyDNS=no`, and `KnownHostsCommand=none` when the `ssh` program on this
     computer is OpenSSH 8.5 or newer; an older `ssh` has no such option and gets no such word; when the version of the `ssh`
     program cannot be read, such a call is not started, and the message says so (sentence F, quoted).
   - "Not covered: if your own `ssh` config says `LogLevel QUIET`…" is replaced by: such a call states its own log level
     (`LogLevel=ERROR`), so a refused host key is printed under a quiet config too. One sentence says what that costs: on these
     calls `ssh` no longer prints what it prints only at its `INFO` level, for example a server's banner before the login (K13:
     read, not measured; the sentence says "may").
   - The paragraph on the storage folder says: a folder whose path holds a space or an apostrophe works; a folder whose path
     holds one of the refused kinds (the eight of §1, in the words of sentence E) is refused with a message before anything
     connects.
   - No sentence claims that a login was measured. No version heading.
2. **`research/module_extension.md`, B10** (`:5318`): the words of a pinned call after E2 (six pairs, five for a client below
   8.5), with K3 as the measurement and "asked, not observed against a server" for the rest; the client's three answers and where
   the question is asked from (S9); the rule of the path as the table of §2.2; sentences E and F word for word; the order of one
   decision (S3) and where it stands on each of the five roads, with L2's sentence for *Run with Secrets* in plain words; that
   the agent's exec still reads an unusable saved key as none (C3) and the one corner of S4; that Connect's terminal line has none
   of it (C4). The sentences of B10 about `/dev/null` and about `oneFileWord` go.
3. **The docblocks**: those of `hostKeyPin.ts` are in §2.1 as they must stand. The module docblock of `hostKeyPin.ts` (`:18-21`)
   keeps its sentence about "built from it alone"; nothing in it names `/dev/null`. `writtenKey.ts` and `personPin.ts`: as in §4.
4. **`research/module_tests.md`, the G1 section** (`:2543`): rows for `pinWords.test.ts` and `personRoadsPinRefusals.test.ts`;
   the changed counts and one sentence each for `hostKeyWords.test.ts`, `personPin.test.ts`, `writtenKey.test.ts`; in the row of
   `pinnedArgv.ts`: `testPin`, `PIN_SOURCE_OPTIONS`, `sourceWordsOf`, `withoutSources`; in the row of `personRoadsWorld.ts`:
   `client`, `realClient`, `clientAsks`, and that the question is counted apart from the runs. Where the agent's exec and *Run
   with Secrets* have their rows (`sshExecOver.test.ts`, `secretsLaunch.test.ts`, `sshRoadSecrets.test.ts`): the new counts and
   one sentence. And what none of these tests proves: that a server with another key is refused, that no other source is asked
   in a login, that a client older than 8.5 or 8.7 reads the words as measured here, anything on Windows beyond what `tsc` and
   the pure tests show: that is E3's.

## 8. Order of work, and the commits

1. Read `git status --short`. E2.S1 is built and committed (`pinClient.ts` exists; `versionTokenOf` is exported).
2. **c1, the tests first.** §6.1, §6.2, §6.3, §6.4 only: `test/pinnedArgv.ts`, `test/personRoadsWorld.ts`,
   `test/pinWords.test.ts`, `test/personRoadsPinRefusals.test.ts`. `tsc` exit 0. Run the two new files and E1's road tests: the RED
   texts of §6.7, and E1's files green as before. Save the output. Commit, staged by path, with the RED texts in the body.
3. **c2, the product and the changed tests**, in this order, with the typecheck after each step (the compiler lists what is
   left, K2): §2 and §2.4; §3 and §3.3; §4.1, §4.2, §4.3; §5.1; §5.2; then §6.5. `wc -l src/commands/agentCommands.ts`: 797.
   Lint. Run every file of §6.6: the counts there. Then the mutations of §9, one at a time, each restored. Then `npm test`.
   Commit, staged by path; the body names each test of §6.5's first table, the counts, the line count, each mutation with what it
   turned red, the result of the manual search of §*Facts*, and the numbers of the whole suite.
4. **c3, the documents** of §7. Run `node .agents/conventions/tools/plan-lifecycle.mjs` from the repository root and
   `node .github/scripts/public-hygiene.mjs`. Commit.

## 9. The mutation checks (each must turn the named tests red; restore after each one)

Measured 2026-11-18 on the scratch copy, each alone, over the eleven test files of §6.6 that hold a pin (N1 to N18 on the compiled
module, N19 to N22 on the source, which those four tests read). The coder repeats each on the source and records it in the commit
body. A test is named by its file's letter and number; "exec" is `sshExecOver.test.ts`, "secrets" is `secretsLaunch.test.ts`,
"road" is `personRoadsPinRefusals.test.ts`.

| # | The mutation | Red |
|---|---|---|
| N1 | `hostKeyWords` drops `VerifyHostKeyDNS=no` | `pinWords` W1, W2, W5, W6, P2, G1, G3; `hostKeyWords` "one function writes the words"; road W1 (2); exec (2); secrets "six pairs" |
| N2 | it drops `LogLevel=ERROR` | the same thirteen |
| N3 | it never says `KnownHostsCommand=none` | `pinWords` W1, W5, W6, P2, G1; `hostKeyWords` "one function…"; road W1 (knows); exec "asks the program…"; secrets "six pairs" |
| N4 | it says `KnownHostsCommand=none` to every client (the parent's test 26) | `pinWords` W2, W6, P2, G3; road W1 (below 8.5); exec "an older client…"; secrets "six pairs" |
| N5 | `decidePinOfCall` reads `unreadable` as a read client (the parent's test 26: "cannot be read" as "below 8.5") | road F1 (3), F2 (3), F3, F4; `personPin` P11, P15, P16; exec "a client that cannot be read…", "deps that name no asker…" |
| N6 | `checkExistingPin` does the same | secrets "cannot be read, or was not asked"; `sshRoadSecrets` "a client that cannot be read spawns nothing…" |
| N7 | a pinned session that was not asked is read as a client that knows | secrets "cannot be read, or was not asked" |
| N8 | double quotes on white space only (the parent's test 26) | `pinWords` P1, P2, G4 |
| N9 | `checkedPin` answers `/dev/null` for a refused path (the parent's test 26) | `pinWords` P1; `personPin` P14; exec "a written path of a refused kind…". On the source, S1 of `pinWords` too (N20) |
| N10 | the rule is not asked before the write (the parent's test 26: "write the pin file before the rule is asked") | road E1 (6), E2 (6); `personPin` P10; exec "a pin path that ssh would not read as one file…" |
| N11 | an entry with no saved host key is asked like any other | road A3 (3); `personPin` P1, P12; exec "no saved host key…"; E1's Q1 (3) and T9c, T9d; nine tests of `agentKeyPath.test.ts` (their entries have no saved host key) |
| N12 | the value for the words is made from the planned path | `personPin` P9, P14; exec "a written path of a refused kind…" |
| N13 | a refused written path deletes the entry's own file too | exec "a written path of a refused kind…" |
| N14 | deps that name no asker ask the window's own | exec "deps that name no asker…" |
| N15 | the client is asked after the write | road A1, F1 (3), F2 (3), F3; `personPin` P7, P8, P9, P11, P12; E1's Q7a (2), Q7b, Q7c; exec (4) |
| N16 | the guards hand the writer an empty environment | `writtenKey` U18; road A1 |
| N17 | the person's writer asks another program than the roads start | road A1, A2; `personPin` P11, P16 |
| N18 | `launchesOf` does not ask for a pinned session | `sshRoadSecrets`: 23 tests, the two new ones among them (every fake session is pinned, so each is refused) |
| N19 | an `await` between `start` and the attach in `withWrittenKeyUntilExit` | `writtenKey` U21 |
| N20 | a shipped file names `NO_KEY_FILE = '/dev/null'` again | `pinWords` S1 |
| N21 | a second shipped file casts to `CheckedPin` | `pinWords` S2 |
| N22 | a second shipped file spells `LogLevel=` | `pinWords` S3 |

Not measured as a mutation: "delete the `await` of the decision" (it does not compile: `start` would get a promise).

## 10. Done when (each item can be counted)

1. c1 was watched RED with the texts of §6.7, by failed assertions; `tsc` passed for c1.
2. After c2 every file of §6.6 has the count of that table, all pass, and the whole suite, lint (`max-lines` included) and the
   build are green.
3. `commands/agentCommands.ts` has 797 lines; its diff is the five lines of §4.3.
4. `git diff` of `hostKeyTrust.ts` is one word; of `bridgedSshClient.ts`, `bridgedSshConfig.ts`, `sshCommand.ts`,
   `connectionOptions.ts` and `scripts/` it is empty for this story.
5. An unpinned call is byte for byte as before on every road: W3 and W4 of `pinWords.test.ts`, A3 of
   `personRoadsPinRefusals.test.ts`, `g1_an_entry_with_no_saved_host_key…` of `sshExecOver.test.ts`, and the unpinned test of
   `secretsLaunch.test.ts`; E1's Q1 (3 tests) is green unchanged.
6. Each mutation N1 to N22 turned red what §9 names and was restored.
7. No shipped file names `/dev/null` as a known-hosts file, casts to `CheckedPin` outside `checkedPin`, or spells one of the
   three new options outside `hostKeyPin.ts` (S1 to S3 of `pinWords.test.ts`); the scan of E1 (the parent's test 14) is green.
8. The documents of §7 are written; `plan-lifecycle.mjs` and the public-hygiene check are clean.

## 11. Break it: ways to make the tests pass while the defect stays, and the row that stops each one

| # | The shortcut | What stops it |
|---|---|---|
| Y1 | make `knownHostsFile` a plain `string` again "for the tests", and check inside `hostKeyWords` | S2 of `pinWords.test.ts` (the cast scan) holds only with the brand; P1 asks the rule of the exported functions; the review reads the option's type (checklist 1) |
| Y2 | keep `/dev/null` for a refused path, so the builders "always have a word" | S1; E1 and E2 of `personRoadsPinRefusals.test.ts` (no run starts); N9, N20 |
| Y3 | ask the rule AFTER the write and delete the file | E1/E2's `pinFiles` is empty either way for a folder that is never made, so the stop is P10 (`fs.existsSync(dir)` is false: nothing was made) and N10 |
| Y4 | read `unreadable` as `older` on a road "so that old machines keep working" | F1, F2, P11, the two secrets tests, `g1_a_client_that_cannot_be_read…`, `g1_deps_that_name_no_asker…`; N5, N6, N7 |
| Y5 | send `KnownHostsCommand=none` always | W2; `g1_an_older_client…`; N4 |
| Y6 | route the question through the roads' runner, and raise E1's run counts | A1, A2 (`runs` holds connections only); L4 |
| Y7 | make the guard synchronous again by caching the answer at activation | U19 (the start waits for the writer); the S1 spec's A4 (an `unreadable` answer must be asked again per call) |
| Y8 | put an `await` after `start` "to be safe" | U21; N19 |
| Y9 | on *Run with Secrets*, delete Connect's pin file in `secretsLaunch` | `secretsLaunch` is pure (K11): `remoteLaunch.ts` imports no `fs`; the road test holds that the owner's cleanup runs once |
| Y10 | quote every path "to be simple" | P1's bare rows; W4 (a plain path is byte for byte as before); N8 for the other direction |

## 12. Opus review checklist

1. `SshExecOptions.knownHostsFile` and `BridgeOptions.knownHostsFile` are `CheckedPin`. A search of `src/` outside `src/test/`
   for `knownHostsFile:` finds no place that hands a builder a string.
2. `checkedPin` is the only maker of a `CheckedPin`: one cast, in that function; the brand is declared and not exported.
3. `hostKeyWords`: the order of the pairs is §2.1's; `KnownHostsCommand=none` stands only under `knowsKnownHostsCommand`; an
   unpinned call gets the one word of before.
4. The rule: the eight kinds, their order, the two quoted kinds; no kind was moved from "refused" to "written".
5. `decidePinOfCall`: the order of S3; nothing is written before the client answered; the value comes from the written path
   (S2); the entry's own file is never deleted (K10).
6. The three roads: `agentCommands.ts` is 797 lines and its diff is five lines; no branch was added; the guard of the bridge is
   awaited.
7. `writtenKey.ts`: one `await` in each guard, inside the `try`, before `run`/`start`; from `start` to `handed = true` the
   statements are N16's (U21). Read §4.2's table against the code, row by row.
8. The agent's exec: rows 1 to 6 of §5.1; the refusal goes through `refuse`; C3 holds (row 4); S4's corner is in the documents.
9. *Run with Secrets*: `secretsLaunch` is pure; a pinned session with no answer is refused; the name is the SSH entry's; L2's
   sentence stands in B10.
10. Sentences E and F are the words of §1, in `hostKeyPin.ts`; neither echoes a path or any output but the exit code.
11. E1's changed expectations are exactly the eight of §6.5 and are named in the commit body; no other assertion of E1 was
    weakened. E1's road tests kept their run counts.
12. The CHANGELOG parts claim nothing that was not measured; K13's sentence says "may".
13. The twenty-two mutations are in the commit body.

## 13. Not verified by this spec

- **A login.** Every statement about what `ssh` does with the words comes from `ssh -G` of one client (OpenSSH 10.2p1, Linux),
  the client alone, or from the parent's hand measurements. That a server with another key is refused under the six pairs, that
  a config's command is not run, and that no DNS record is trusted: E3 (M7, M8, M10).
- **Clients other than 10.2p1.** Below 8.7 the value of an option is read by another tokenizer (read): the quoted spellings of
  K4 are not measured there. Below 8.5 the five pairs are not measured (M11). Windows' `ssh.exe`: not run (M13).
- **K13:** what a pinned call no longer prints under `LogLevel=ERROR` was read, not measured.
- **A `HostKeyAlias` or `CheckHostIP yes` in the person's config** changes which NAME is looked up in the pin file, not which
  files are read. A pinned call then finds no key for that name and is refused. Read in the manual; not measured; not changed.
- **The window between the question and the call:** an `ssh` that is replaced in between is not seen (the S1 spec, §10).
- **A storage folder path with a character that only an older client or Windows misreads.** The rule holds what was measured
  on one client and what the parent's table names.
- **macOS:** the folder under `Application Support` is the reason for the quoted spelling; no test ran there.

## Notes for the lead

**For the parent plan** (none of these is applied here; the lead decides which is wording and which is a plan change):

1. **§3.8** says that every function of `hostKeyTrust.ts` stays. S1 exports `knownHostsPath` (one keyword, no body changes).
   The sentence could read: "`materializeKnownHosts` and every other function of `hostKeyTrust.ts` keep their bodies;
   `knownHostsPath` is exported".
2. **§3.11, the list of `<kind>`** has six kinds; this spec has eight (S6: a tilde at the start, a backslash at the end), and
   its words for "two backslashes" and the others are §1's. The section allows the move; the list there could name them.
3. **§3.11, sentence E** and **§3.10, sentence F**: the final words are §1's. E's baseline said "ssh would read another file in
   its place", which is not true for the kinds that end the client or name two files.
4. **§3.11, "a control character"**: K6. On 10.2p1 a tab in double quotes and DEL are read as themselves; they are refused by
   the table and by the bridged precedent, not by this measurement. E1 wrote a tab in double quotes. If E3's M7 measures them on
   every client that the release names, §3.11's own rule would allow moving them back; this spec does not.
5. **§3.10, "Where the refusal stands … before a pin file is written"**: holds for the three roads and the agent's exec, not
   for *Run with Secrets* (L2). The section's last sentence says "by the precedent of §3.11"; a plain sentence there would help
   a reader of test 22.
6. **§3.8, "the agent's reading of an unusable pin (C3)" is not changed**: true when both questions pass. S4's corner (a refused
   folder or an unreadable client, with an unusable saved key) is stricter than today. If the lead wants C3 byte for byte in that
   corner too, `decidePinOfCall` needs to know "usable" before it asks, which means a second copy of the three conditions of
   `materializeKnownHosts` (K8) or a change of that function. Not chosen.
7. **§3.6, the budget:** this story adds 0 lines to `commands/agentCommands.ts` (797). C10 is not needed by E2.S1 or E2.S2.
8. **§3.12 part 1, *Not measured*:** K12 lists what each road reads from stderr; K13 is what stays read and not measured (the
   banner). E3's M5 could add one row: the stderr of a pinned and of an unpinned agent exec against a server with a banner.
9. **§5, test 20** says "one case per row … a-k"; rows g, h, j are three percent rows here, and row f is one kind for bare and
   quoted. Test 22 says "for each refused kind": six kinds have a row on the roads (§6.4); a tilde at the start and a backslash
   at the end are held by the pure test only, and §6.4 says why.

**For the stories document:**

10. `## E2.S2`, *The rule of the path*: "REFUSED with its kind (a double quote; …; a control character)": plus the two of S6.
11. *One checked value*: the type is `CheckedPin`, made by `checkedPin(file, client)`; `hostKeyRefused` takes it too (S10), so
    E2.S3's function gets `credential.knownHostsFile` as a `CheckedPin | undefined` and reads `.file` for the match of the
    `Offending` line. **E2.S3's spec is being written now and must use this type.**
12. *Where the refusals stand, the three roads*: "`writePersonPin` … asks the client and the rule": it asks the rule first,
    then the client (S3), through `decidePinOfCall` of the new `pinOfCall.ts`.
13. *`commands/agentCommands.ts`*: "the bridge's guard is awaited on its own line (`:429`)": it is awaited on the line that
    exists; 0 lines are added.
14. *The tests of the roads see a new run*: the first option was taken (the asker is a part that the world stands in for).
    No count of E1 changes. The eight changed expectations are §6.5's.
15. `## E2.S4`: the smoke sees a `-V` start only if it turns on `realClient: true` in its world (§6.2); with the default it
    keeps four starts. The helper `test/pinnedArgv.ts` gains `testPin`, `sourceWordsOf` and `withoutSources` here.
16. `## E2.S3`: `test/personRoadsHostKey.test.ts` passes unchanged after this story (37 tests), because the world's default
    client knows the option and `hostKeyRefused` kept its body.

**Decisions of this spec that the lead may want to overrule before the build:** S1 (the export), S3 (F before A), S4 (the
corner on the agent's exec), S5 (`no_credential`, one sentence for every door), S6 (two more kinds), S8 (an optional
`pinClient` on `SshUseDeps` that refuses a pinned call when it is absent, in place of a required field and fifteen edited worlds).
