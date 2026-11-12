# PLAN — The path of a key file that an agent's call writes holds no id of an entry

> Status: **plan only, nothing implemented yet, 2026-11-11.** Scope: the extension only (`src_vs_code/src`: the name of
> the key file that an agent's SSH call writes, in `materializedKeys.ts`, `keyInstaller.ts` and `sshExecAuth.ts`; the
> comments of C4; their tests), `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md`,
> `todo/README.md`, and the boundary rows that are owed to the neighbour plans of §9. The owner said on 2026-11-11:
> build N10 as its own small plan after F7 epic 2 is released. N10 is item N10 of §11 of
> [PLAN_agent_refusal_names_unlisted_entry.md](../research/PLAN_agent_refusal_names_unlisted_entry.md) (F7), and note 10
> of [its E2 stories](../research/PLAN_agent_refusal_names_unlisted_entry_E2.md). One epic. A security fix for a defect
> that is live on `main`. All `file:line` references were read on `b95282f1` (F7 epic 2 merged, #353). No ledger yet:
> it opens at the first approval. The owner answered Q1 to Q3 of §14 on 2026-11-12 (yes to each; no section changes).

## 1. The defect

An agent can read the ID of an entry that it may not view. The id is in the path of a key file. An id that came with
an import can look like a name (`deploy-key`, `prod-root-key`). The same path also shows the storage folder of the
person's computer (the user name, the home folder).

### 1.1 The file and its name

An SSH entry can use the key of a second entry (`sshKeyEntityId`, `types.ts:76`). The credential resolver takes the
key from that second entry, and it says whose key it is: `keyEntityId: keySource.id` (`sshCredential.ts:66-78`,
`:86`). For each call of an agent the key is written to a file, and the name of the file starts with that id:
`` materializePrivateKey(storageDir, `${source.keyEntityId}-${crypto.randomUUID()}`, source.content) ``
(`sshExecAuth.ts:162`). The writer puts the file into the folder of this window and adds `.key`
(`keyInstaller.ts:155-161`; the folder is `materializedKeysDir`, `materializedKeys.ts:50-52`). So the path is:

`<storageDir>/keys/<pid>/<keyEntityId>-<uuid>.key`

(N10 wrote the path with no `<pid>`. The folder has it.)

Three calls of an agent write this file. All three go through `execOverSsh` (`sshUseActions.ts:272-296`), then
`prepareAuth` (`:179-202`), then `resolveExecAuth` (`sshExecAuth.ts:116-125`), which has one caller in the product
(`sshUseActions.ts:188`):

- `creds_exec` (`sshExecAction`, `sshUseActions.ts:303-355`);
- `creds_rotate` on an SSH entry (`rotateAction(sshExecAction(sshDeps), 'command', …)`, `extension.ts:660`);
- a linked `creds_run` (`agentUseActions.ts:425-435`; the call of `overSsh` at `:431`).

**The id is not always an opaque id.** An imported vault can carry ids of its own shape. `SAFE_ID`
(`idQuarantine.ts:41`) accepts each id of letters, digits, `.` and `-`, up to 128 characters. `safeFileComponent`
(`materializedKeys.ts:73-79`) passes such a name on with no change. An id with other characters is cut and gets a
digest; the first 60 characters stay readable.

### 1.2 The three ways to the agent

| Way | Where | What the agent reads | Off a Remote Bridge | On a Remote Bridge |
|---|---|---|---|---|
| (a) The key cannot be written | `sshExecAuth.ts:161-166`; the sentence at `:165` | `Could not write the stored key to disk: <the error of the operating system>`, code `internal` (500) | open: `prepareAuth` gives it to `refuse` (`sshUseActions.ts:196-198`); `bridgedRefusal` and `agentSaid` pass a sentence with no `second` as it is (`:135-152`) | closed: `BRIDGE_USE_REFUSED`, the real sentence in the journal (`:140-141`) |
| (b) The run fails | `sshUseActions.ts:290-291`, the `catch` of the `try` at `:279-294` | `Could not run ssh: <the error>`, code `internal` | open, by the same road | closed, by the same line |
| (c) `ssh` prints the path | `sshUseActions.ts:287-289`: the answer of `runSshExec` is the 200 body, with `stdout` and `stderr` (`sshExecRunner.ts:191-203`; `brokerProtocol.ts:169-177`) | the text of `ssh`, for example `Load key "<path>": invalid format` | open | open by decision: *`ssh`'s own stderr stays as returned* (`test/bridgeLinks.test.ts:180-188`) |

**(a), read and run.** `describeError` gives the `message` of the error and nothing more (`describeError.ts:10-12`).
The message of a failed `open` holds the whole path. Observed (Node 26.12.1, Linux, 2026-11-11):
`EACCES: permission denied, open '<folder>/deploy-key-uuid.key'`. Which call fails decides what shows: a failed
`mkdir` names the folder only (observed); a failed `open` or `chmod` names the file, with the id. The main port's
sentence is pinned today, with the path: `test/bridgeLinks.test.ts:103-107`. One cause that the id itself makes more
probable: a long imported id makes the path longer, and Windows has a limit for a path. NOT observed on Windows.

**(b), read and run. N10 is wider here than the code.** N10 said: the argv holds `-i <that path>`
(`sshExecCommand.ts:159-161`, true), and an error of the start can carry the argv. For an error of Node itself this
is not so. Observed: the message of a failed start is `spawn no-such-program ENOENT`; the argv is in the property
`spawnargs` of the error, and `describeError` does not read it. The test whose name says *the error may carry argv
and a path* (`test/bridgeLinks.test.ts:140-150`) gets its error from its test world, which writes the folder into the
text (`test/bridgeLinksWorld.ts:108`). What the `catch` can pass today, by reading each thing inside the `try`:

- an error of the file system from the writer of the host-key pin file (`execArgv`, `:246-259`, through `:219` to
  `hostKeyTrust.ts:80-98`). Its path is `<storageDir>/keys/<pid>/known_hosts-<id of the SSH entry of the call>`. The
  agent may view that entry (§4.3);
- an error of the start, with the name of the program and a code;
- an argument that holds a NUL byte: the message quotes that one argument (observed). The command of the agent is
  checked for it before (`sshExecCommand.ts:64-65`), and the key path cannot hold one.

So today (b) gives the local path, and it gives no id of an entry that the agent may not view. **This is safe by its
content, not by its construction**: the `catch` passes each text that a thing inside the `try` throws.

**(c), read; one message observed.** The broker masks the 200 body with a table of the stored values of the entry of
the grant (`brokerResponse.ts:247`; `maskEntries.ts:68-111`; for a linked run also the SSH entry, `:175-179`). The
table is read before the action starts (`credsAgentServer.ts:590`). A path is not a stored value, so it passes. A
`creds_rotate` gives `stderr` back when the statement fails (a status that is not 200, or an exit code that is not 0:
`rotateAction.ts:187-190`, `:478-484`); when it succeeds, it gives `stdout` only (`:391`).

What `ssh` prints about its key file:

- Observed with OpenSSH 10.2p1 on Linux: `Warning: Identity file <path> not accessible: No such file or directory.`
  It is printed before the connection, for a file that is not there.
- NOT observed, because the computer of this check has no SSH server: `Load key "<path>": <reason>` for a key that
  `ssh` cannot read (`ssh-keygen -y` of the same build prints `Load key "<path>": error in libcrypto`); the warning
  `Permissions … for '<path>' are too open`; the `debug1:` lines that name the identity file when the person's
  `~/.ssh/config` sets `LogLevel DEBUG` (off a bridge the person's configuration applies). These three are from the
  source of OpenSSH as the author knows it, not from a run.

**On a Remote Bridge.** (a) and (b) are closed. (c) is not, and the bridge plan says so in words
(`PLAN_remote_bridge_scoped.md` §4.2: *the laptop's key path and a linked key's id in the file name of a key `ssh`
could not load*). Today the product starts no bridged `ssh`: `unguardedBridge` (`sshUseActions.ts:418-420`) refuses
each bridged call while no writer of the per-call file exists, and `sshDepsFor` gives none (`:454-468`). So (c) on a
bridge opens with E1.6 of that plan. There the agent is on ANOTHER computer.

**Through `creds-mcp`** the message of a refusal is passed on as it is (`src_mcp/src/UseTools.cs:490-496`), and the
tool gives `stdout`, `stderr` and the exit code back (`UseTools.cs:59`).

### 1.3 How the sites were found (the method)

(1) `grep -n` over `src_vs_code/src/*.ts` (tests apart) for each writer into the keys folder: `materializePrivateKey`,
`materializedKeyPath`, `materializedKeysDir`, `materializeVpnConfig`, `writeAskpassScriptFile` and `writeFileSync`;
each hit read (§4.3). (2) The same for each reader and each remover of a file there: `forgetMaterializedKey`,
`removeKeyFile`, `purgeMaterializedKeys`, `readdirSync`, and the text `.key` (§4.2). (3) Each line inside the `try` of
`execOverSsh` read for what it can throw. (4) Two small runs for the shape of the messages: Node (a failed `open`, a
failed `mkdir`, a failed start, a NUL argument) and `ssh` to a closed port of the same computer. NOT done: a real
`ssh` against a server; a run on Windows; a scan of every sentence of the product.

## 2. The rule, decided

### 2.1 Words

The words of F7 §2.1 stay: *the agent may view* an entry (`agentMayView`, `mcpEntries.ts`), *the addressed entry*, *a
second entry*. One new word:

- **A call file** is a file that the extension writes for one call of an agent and removes when the call ends.

### 2.2 The rule

**Rule C, a file name. The name of a call file holds nothing of the vault: no id and no name of an entry. It is a
random name.** So no text that tells the path of a call file can tell the id of an entry: not a refusal, not the
output of a program, not a line of the journal.

How it stands to the rules of F7:

- **Rule A** says: an id that the agent may not view reads as an id that does not exist. A path that carries such an
  id tells the agent that the id exists. Rule C keeps the answer of rule A true.
- **Rule B** is for a SENTENCE that names a second entry; one chooser decides it, with `agentMayView`. Rule C is at
  the source: the id is never put into a text. It asks no question about the agent, because nobody needs the id in
  the name (§4.2: no code finds the file by its name). So the id goes for each key, also for the key of the entry
  itself. One rule, with no split into cases.
- **F7 §7 stays as it is.** Rule C does not hide that a second entry exists, and it does not hide an address. F7 §2.2
  says that its rule is not a promise about each field of a successful answer; rule C is not such a promise too. It
  takes away one thing that the extension itself put into the text. The address of a hop is the person's data, and
  `ssh` needs it. The id in a file name is the extension's own choice, and nothing needs it.

Not in the rule: the local path (§3, Q1), and the path of a key FILE that a person stored in an entry (§13, N11).

### 2.3 What the agent reads, exact

| # | Case | Today | After |
|---|---|---|---|
| (a) | the key cannot be written | `Could not write the stored key to disk: EACCES: permission denied, open '<storageDir>/keys/<pid>/<keyEntityId>-<uuid>.key'` | the same sentence, with `…/keys/<pid>/call-<uuid>.key` |
| (b) | the run fails | `Could not run ssh: <the error>` | the same sentence; a path of a key file in it has no id |
| (c) | `ssh` prints the path | for example `Load key "<storageDir>/keys/<pid>/<keyEntityId>-<uuid>.key": invalid format` | the same text of `ssh`, with `…/call-<uuid>.key` |

The status, the code and the shape of each answer stay. The sentences stay. Only the last part of the path changes.

### 2.4 What the person sees

Two lines of the journal can hold the path: the note of a refusal on a Remote Bridge (`sshUseActions.ts:140`) and
`ssh:exec — the key file could not be removed: …` (`:234`). After this plan the path in them has no id. So the person
cannot read from the path which key entry a left file belongs to. The purge takes the whole folder of the window when
the window starts and when it ends (`extension.ts:222-223`; `keyInstaller.ts:269-292`), so no person has to find the
file by hand.

## 3. The options, and the decision

| | O1: a random name for the file | O2: mask the path in the three outputs | O3: fixed sentences for (a) and (b) off a bridge |
|---|---|---|---|
| What it does | the name is `call-<uuid>.key`; no id goes into a path | the action replaces the path in the two refusals and in `stdout` and `stderr` | off a bridge the agent reads a fixed sentence, as on a bridge; the real one goes to the journal |
| The id in (a) | closed | closed for the exact text | closed |
| The id in (b) | closed | closed for the exact text | closed |
| The id in (c), off and on a bridge | **closed** | closed for the exact text | **not closed** |
| The local path | stays | hidden for the exact text | hidden in (a) and (b); stays in (c) |
| Guarantee | by construction: the id is not there | by content: only the forms that the mask knows | by construction, for two of the three ways |
| Change | one call site, two small functions, no sentence | a mask in the action for each road, and a second one for the refusals | two sentences on a shipped road, and their journal notes |
| What an agent loses | nothing | nothing, when the mask finds the text | the text of the operating system (disk full, no permission, no `ssh`), if the code is not kept |

**Can the mask that exists hold the path (O2)? No, not as it is.** (1) The broker's table is read before the action
starts (`credsAgentServer.ts:590`), from the stored values of the entry of the grant (`maskEntries.ts:68-111`). The
path does not exist then: its random part is drawn inside the action. Only the action can mask its own answer, as the
rotation does for its new value (`rotateAction.ts:212-214`). (2) `maskResponseBody` reads the text fields of the top
level only (`secretMasker.ts:137-140`, `:151-163`). The message of a refusal is one level down, at `error.message`
(`brokerProtocol.ts:78`), so (a) and (b) need a second call. (3) The mask finds exact text only, by design
(`secretMasker.ts:11-15`). A Windows `ssh` that prints the path with other slashes, or a path that the stream limit
cuts, is not found. This is a measure that is safe for the forms that somebody thought of.

**The decision: O1, alone.**

1. It is the only option that closes (c), and it closes it on a bridge too, where the agent is on another computer.
2. It closes the three ways at one place, the source. `security.md` asks for this: *put the measure on the single
   road in*, and *safe by construction, not safe by content*.
3. It is the smallest change, and no sentence, code or status of a shipped road changes.
4. Nothing reads the id from the name (§4.2), so nothing is lost.
5. It also covers a text that this plan did not find: each later output that shows the path shows no id.

O2 is rejected for reason (3) above. O3 is not built here. After O1 it would add two things: it hides the local path
in (a) and (b), and it makes (b) safe by construction. It costs the agent the text of the operating system. Off a
bridge the caller is a program on the person's own computer, and it can read that path itself. This is question Q1
for the owner; the plan is built on the answer *keep the sentences*.

**The residue of this decision.** (b) stays safe by its content (§1.2). Row K3 of §6.2 gives the `catch` the whole
argv, which holds each path that the things inside the `try` know today. A new thing that throws a text with a name
of an entry is found only when a row reaches it.

## 4. The sites

### 4.1 Sites that change

| # | Site | Today | New behaviour |
|---|---|---|---|
| C1 | `materializedKeys.ts` (new export; the module imports no `vscode`) | — | `export function callKeyName(): string`: `call-` and a random uuid (`crypto.randomUUID()`). It takes no argument, so no data of the vault can arrive in it |
| C2 | `keyInstaller.ts` (new export beside `materializePrivateKey`, `:149-166`) | — | `export function materializeCallKey(storageDir: string, content: string): string`: it calls `materializePrivateKey(storageDir, callKeyName(), content)`. The same folder, the same modes, the same `lockToOwner`. It has no parameter for an id |
| C3 | `sshExecAuth.ts:162`, and the imports at `:1` and `:7` | the name is `` `${source.keyEntityId}-${crypto.randomUUID()}` `` | `materializeCallKey(storageDir, source.content)`. The import of `node:crypto` goes: nothing more uses it there |
| C4 | comments that are false, or become false | `sshUseActions.ts:130-132` (*the key file path holds the id of the key entry (an open owner question, N10 …)*); `materializedKeys.ts:67-68` (*the file name is also how the purge and the wipe find it again*: no code does this today, §4.2); `keyInstaller.ts:146-147`, `:157` (they say that the name is the id) | each says what is true: a call file has a random name; the id stays in the names of the person's roads only |
| C5 | each test world that replaces `./keyInstaller` and loads `sshExecAuth.ts` (directly, or through `sshUseActions.ts`): `test/sshUseActions.test.ts:125-130`, `test/sshExecAuth.test.ts:43`, `:166`, `test/bridgeLinksWorld.ts:89-99`, `test/secondEntryWorld.ts:177-182`, `test/sshExecOver.test.ts:84`, `test/brokerAbandoned.test.ts:557`, `test/pinClickPaths.test.ts:256-258`, `test/pinReaders.test.ts:134-139` and `:400-406` (this one calls `resolveExecAuth` with a stored key, so it fails with no new member). Method: `grep -ln "'./keyInstaller'"` over `src_vs_code/src/test`, then the module that each loads. Not in the list: `test/sshConnectWorld.ts` (it loads `sshSession.ts`) and `test/transportFactory.test.ts` (it loads `transportFactory.ts`): their writer does not change | each gives `materializePrivateKey(dir, id, content)` (some give only a part of the module) | each also gives `materializeCallKey(dir, content)`, and takes the name from the REAL `callKeyName()` (never a name that the test made up). The no-op step (§5, 2) adds them; a world that the list misses fails in step 4 with a `TypeError`, and the coder adds it and says so |

`SshUseDeps` and `AgentUseDeps` get no new member. `sshUseActions.ts` changes in one comment only.

### 4.2 Each reader of the key file's name (checked; none changes)

| Reader | What it reads | Result |
|---|---|---|
| `removeKeyFile` (`sshUseActions.ts:227-239`, called at `:293`) | the whole path that the writer gave back (`prepared.materialized`) | does not read the name |
| `forgetMaterializedKey` (`keyInstaller.ts:251-257`) | a whole path | the same; it is on the person's roads only |
| `purgeMaterializedKeys` (`keyInstaller.ts:269-292`) and `deadPidSubdirs` (`keysPurge.ts:14-26`) | the folder of the window, whole; then the NAMES OF FOLDERS under `keys/` (a pid) | no file name is read |
| `lockToOwner` (`materializedKeys.ts:27-37`), the Windows ACL (`fileAcl.ts:15-31`: `icacls <path> /inheritance:r /grant:r <owner>:F`) | the whole path | each name is good; the new name is 45 characters; the name of today is 77 characters for an id that is a uuid, and more for a longer id |
| `safeFileComponent` (`materializedKeys.ts:73-79`) | the name | `call-<uuid>` has only letters, digits and `-`: it passes with no change (a unit row pins it) |
| `buildSshExecArgv` (`sshExecCommand.ts:159-161`) | the path, as the word after `-i` | does not read the name |
| `forgetOurPin` (`sshSession.ts:604-615`) | the pin file of the person's roads | not a key file |
| `readSshDirectory` (`hygieneScan.ts:45-52`) | `~/.ssh`, not the keys folder | not a reader |
| a search for `readdirSync` and for the text `.key` over `src_vs_code/src/*.ts` | — | no other reader; nothing finds a key file by an id |
| tests | `test/sshExecAuth.test.ts:80` pins `/store/k7-` (the id in the name) | changes (§6.4); the other tests read the path that the writer gave back |

### 4.3 The other files of the keys folder: does an id of a hidden entry get out through them? (checked)

| File | Name | Whose id | Can an agent read the path? | Result |
|---|---|---|---|---|
| the key of an agent's call | `<keyEntityId>-<uuid>.key` (`sshExecAuth.ts:162`) | the key entry, which can be hidden | yes: (a), (b), (c) | **the defect; C1 to C3** |
| the host-key pin of an agent's call | `known_hosts-<id>` (`hostKeyTrust.ts:66-68`, `:93`; written at `sshUseActions.ts:219`) | the SSH entry of the call: the addressed entry, or for a linked run the SSH entry that the gate let through (`agentUseActions.ts:240-241`: it is usable, so the agent may view it) | yes: a failed write in (b); `ssh` names the file when the host key does not match, in (c) (by the source of OpenSSH; not run) | no hidden id. Not changed. A guard row pins it (G5) |
| a pin or a key of a jump host | none: a chain is the text after `-J` (`sshOptions.ts:105-123`, `:172-190`); only the entry of the call gets a pin (`hostKeyTrust.ts:80-98`) | — | — | no file, so no id of a hop |
| the askpass script | `askpass.sh`, `askpass.bat` (`sshAskpass.ts:29`, `:33`; `keyInstaller.ts:200-207`) | none | `ssh` can name the script when it cannot start it | no id |
| a password file | none: the password is in the environment of `ssh` (`sshAskpass.ts:37-46`) | — | — | no file |
| the script of `creds_run` on a Script entry | `agent-script-<id><ext>` (`agentUseActions.ts:163-166`) | the addressed entry | yes: the script's own errors name the file | no hidden id. A failed write there is not told to the agent: it becomes the fixed failure of the broker (`brokerResponse.ts:212-222`) |
| the key of the person's Connect and of the person's roads | `<keyEntityId>.key`, `<keyEntityId>-<uuid>.key` (`sshSession.ts:472`, `:342`) | the key entry | no: the line is typed into the person's terminal, and a failure is a dialog (`sshSession.ts:475`). `sshRoad.ts:20-21`: only the person's roads prepare a session. `creds_open_terminal` answers `opened` or one fixed sentence (`sshUseActions.ts:404-409`) | not changed (§8) |
| the deploy key of the vault's git sync | `git-<keyEntityId>.key` (`transportFactory.ts:286`) | a key entry | no: none of the three action modules imports `transportFactory.ts` | not changed |
| a VPN configuration | from the NAME of the VPN entry (`vpnRun.ts:203`; `vpnLauncherRun.ts:216`, `:233-234`) | the addressed entry | no: `creds_vpn_up` answers one fixed sentence (F7 §3.3) | not changed |
| the socket of the extension's agent | `agent.sock` (`sshAgentKeys.ts:22`) | none | — | no id |

### 4.4 What changes for an agent or a script (the contract, said explicitly)

No route, no error code, no status, no body shape, no sentence and no tool description changes.
`contract/broker-v1.json` and `contract/mcp-tools-v1.json` do not change, and the product code of `src_mcp` and
`src_cli` does not change. One thing changes: in a text that shows the path of the key file of an agent's call, the
last part is `call-<uuid>.key`, and it was `<keyEntityId>-<uuid>.key`. This is true on the alias door and on the token
door too, because an action does not know its door, and it is true on a Remote Bridge. The CHANGELOG entry and the
pull request body say it.

## 5. Build order

One epic (§Epics). The plan round of `coai` comes first, with the lead's own Opus review at the same time; its pass
opens the ledger. Then Opus writes the stories document, and Fable writes the specification of the cornerstone story.
The work is in a worktree and a branch of its own, from `main` after the pull request that closes F7 is merged.

1. **The scan first** (S1 and S2 of §6.3), before any fix. Its first run gives the list of the callers of
   `materializePrivateKey`, and it fails on `sshExecAuth.ts:162`. Compare the list with §4.3. A caller that is not
   there stops the work: it is a plan change.
2. **The no-op step.** Add C1 and C2 with no caller, and C5 (the new member of the four test worlds).
   `npm run typecheck` is clean, and `npm test` shows the failure of step 1 and no other. The step exists so that no
   RED proof is a compile error (`npm test` runs `tsc` first).
3. **Part C of the class test and the RED rows** (§6.1, §6.2: K1 to K6). Watch each one fail on the unchanged call
   site, by its assertion. Keep the messages.
4. **The fix: C3.** K1 to K6 pass, S1 passes. Change the existing test of §6.4 in the same commit.
5. The unit rows of the new name (U1 to U3) and the guard rows (G1 to G9), each watched passing.
6. The mutation checks of §6.5.
7. C4 (the comments) and the documents of §7. The boundary rows of §9 are OWED; the lead gives them to the sessions
   that own the neighbour plans.
8. `npm run typecheck`, `npm test` and `npm run lint` in `src_vs_code`, at lowered priority. `npm run contract` leaves
   no difference in `contract/`.
9. The `coai` code round on the finished branch, then the pull request. Its body has §4.4, the verdicts and the number
   of reviewers that answered.

One file of the suite runs through the same runner: `npm run compile`, then
`node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`. Read the exit of `tsc`
before any result.

## 6. Test plan

### 6.1 Part C of the class test: the path of a call file (new)

A suite of its own, `src_vs_code/src/test/agentKeyPath.test.ts`, so that `agentNamesOnlyViewable.test.ts` (626 lines)
stays under the size limit. It runs the REAL actions over the world of part B, `test/secondEntryWorld.ts`: the SSH
entry `prod` borrows the key of a hidden entry whose id is name-like (`hid-key-8f3k2`, `secondEntryWorld.ts:43`), and
the key works (`key: 'plain'`). The world gets four options, each one a thing that the edge of the world does:

- `writeFails`: the writer throws what Node throws, `EACCES: permission denied, open '<the path that it was asked
  to write>'`;
- `startFails`: the runner rejects with an error whose text holds the WHOLE argv that it got. This is a stand-in for
  the worst case. Node's own message does not hold the argv (§1.2); the name of the row says so;
- `sshPrints`: the pretended `ssh` answers exit code 255 and a `stderr` that holds the word after `-i` of the argv that
  it got, in the two shapes of §1.2 (`Load key "<path>": invalid format` and `Warning: Identity file <path> not
  accessible: …`);
- `pinned`: the SSH entry gets a pinned host key, and the REAL `materializeKnownHosts` writes the pin file (the other
  rows keep the world's own, which writes none). The pretended `ssh` then also prints the value of
  `UserKnownHostsFile`. Row G5 uses it.

No row guesses a name. The path comes from the argv that the product built, or from the argument that the product gave
to the writer.

**The cells.** Three ways ((a), (b), (c)) on three doors (`exec`, `rotate`, `run` of a linked Terminal entry): nine
cells. In each cell the test asserts, in this order:

1. **The channel is live** (the one positive of a file of negative assertions): the answer holds the path of the file
   of this call, or for (a) the path that the writer was asked to write.
2. The status and the code are those of today (`internal` and 500 for (a) and (b); 200 for (c)), and for (a) and (b)
   the message starts with the sentence of today.
3. The answer holds no hidden name and no hidden id (`leaks` of the world).

**The fixture is proved first**, in the test: with no option the same three calls reach `ssh` once each and answer
200; the hidden key entry is hidden (`agentMayView` answers `false` for it); the world's list of hidden ids holds its
id; the id is a part of no other text of the world.

### 6.2 RED rows

Each row is watched FAILING on the code of `b95282f1` with the no-op step applied, by its assertion, then passing.
The coder records what the runner printed.

| # | File | Input | Today, so the row is RED | After |
|---|---|---|---|---|
| K1 | part C | the argv of the three doors, with a hidden key entry that works | a word of the argv holds `hid-key-8f3k2` (`…/hid-key-8f3k2-<uuid>.key` after `-i`) | no word holds a hidden id or a hidden name; the word after `-i` is the file that was written |
| K2 | part C | (a) on the three doors | the message holds `hid-key-8f3k2` | no hidden id; the message starts with `Could not write the stored key to disk: ` |
| K3 | part C | (b) on the three doors | the message holds `hid-key-8f3k2` | no hidden id; the message starts with `Could not run ssh: ` |
| K4 | part C | (c) on the three doors | `stderr` holds `hid-key-8f3k2` | no hidden id; `stderr` holds the path of the file that was written |
| K5 | `test/sshExecAuth.test.ts` (the test at `:70-82` changes) | `resolveExecAuth` with a stored key of a key entry whose id is `deploy-key` | the last part of `keyPath` is `deploy-key-<uuid>`: it holds `deploy-key` | the last part has the shape of a call name and holds nothing of the id |
| K6 | `test/bridgeLinks.test.ts`, beside L5 (`:180-188`) | the pretended `ssh` prints the word after `-i`; through the bridge and through the main port | the last part of the printed path starts with `k1-` (the id of the key entry of that world) | on the two doors the last part does not come from the id; `stderr` is passed on as it was returned (L5 stays) |

K6 asserts on the last part of the path only. The folder is the test world's own, and a short id (`k1`) can be a part
of a random folder name by chance.

### 6.3 New rows that are not RED, and the scan

The two functions are new, so their rows cannot fail on the code of today. Each is watched passing, and a mutation of
§6.5 shows that it can fail.

| # | File | What must be true |
|---|---|---|
| U1 | `test/materializedKeys.test.ts` | `callKeyName()` is `call-` and a uuid; two calls give two names; `safeFileComponent` gives the name back with no change |
| U2 | `test/keyInstaller.test.ts`, on the real file system | `materializeCallKey` writes the body with one end-of-line into `keys/<pid>/`, the file is `<a call name>.key`, its mode is 0600 where the system has modes, and `lockToOwner` leaves it readable by us |
| U3 | `test/keyInstaller.test.ts` | a purge takes the file with the folder of the window (the row beside `:202`) |
| S1 | `test/keysDirPaths.test.ts` (the structural guard of the keys folder) | each occurrence of the identifier `materializePrivateKey` in `src_vs_code/src`, tests and comments apart, is in a file of the written list: `keyInstaller.ts` (the writer itself and `materializeCallKey`), `sshSession.ts` (the person's Connect and roads), `transportFactory.ts` (the vault's git sync). Each has its reason in the test. An occurrence is a call, an import, an import with `as` (a new name), or a member of a namespace import; so a new name for the writer is found at its import. An occurrence in another file fails the test, with the file and the line. **What S1 does not find:** a name that is built at run time (`mod['materialize' + …]`), and a new call inside a file of the list. It is a narrow guard against a regression, not a proof; part C is the proof for the three doors |
| S2 | the same | the companion: the scan finds a call in each of the three files of the list, so a change of formatting cannot make it match nothing; and the list of the test is compared with these three names, so a fourth name fails |

S1 is written before the fix. On the code of today it fails with `sshExecAuth.ts:162`: this is the RED proof of the
scan.

### 6.4 Guard rows (watched passing before and after), and the test that changes

| # | What it guards |
|---|---|
| G1 | On a Remote Bridge (a) and (b) are still `BRIDGE_USE_REFUSED`, and the journal has the real error, byte for byte (`test/bridgeLinks.test.ts:96-102`, `:140-146`) |
| G2 | On the main port (a) keeps its sentence, with the text of the operating system and the folder (`:103-107`). O3 is not built |
| G3 | On the main port (b) keeps its sentence (`:147-149`) |
| G4 | `ssh`'s own `stderr` is passed on as it was returned, on the two doors (`:180-188`) |
| G5 | The pin file of an agent's call carries the id of the SSH entry of the call only: on `exec` the addressed entry, on a linked `run` the SSH entry that the gate let through. In the world of part C that id is not a hidden one (new, in part C; the pretended `ssh` prints the value of `UserKnownHostsFile`) |
| G6 | An entry with a key of its own works as before: the file is written once, it is the word after `-i`, and it is gone after the call (`test/sshUseActions.test.ts:323-336`) |
| G7 | Two calls get two different files (`test/sshUseActions.test.ts:340-349`; `test/sshExecAuth.test.ts:84-91`) |
| G8 | Parts A and B of the class test stay green with no change: rule A and rule B (`test/agentNamesOnlyViewable.test.ts`) |
| G9 | The person's roads keep their names: `<id>.key` and `<id>-<suffix>.key` (`test/keyInstaller.test.ts:88-99`, `:339`); a traversing id still cannot leave the folder (`:299`) |

**The one existing test that changes:** `test/sshExecAuth.test.ts:70-82` asserts `keyPath` starts with `/store/k7-`.
It pins the defect. It becomes row K5.

### 6.5 Mutation checks (each one must turn a test red)

1. Put `` `${source.keyEntityId}-…` `` back at `sshExecAuth.ts:162` → K1 to K6, S1.
2. Make `callKeyName()` give one fixed name → U1, G7.
3. Add `sshExecAuth.ts` to the written list of S1 → the comparison of S2.
4. Make the pretended `ssh` of `sshPrints` print a fixed text → assertion 1 of the (c) cells (the channel is not
   live).
5. Take the id of the key entry off the world's list of hidden ids → the proof of the fixture (§6.1). With no such
   proof the rows K1 to K4 would pass and prove nothing.
6. Add a product file that has `import { materializePrivateKey as writeKey } from './keyInstaller'` and calls
   `writeKey(…)` → S1, at the line of the import.

### 6.6 What the tests do not prove

- A real `ssh`. In K4 and K6 the `ssh` is pretended: it prints the word that it was given. What a real `ssh` prints
  was observed for one message (§1.2). The fix does not depend on it: no word of the argv holds the id (K1).
- Windows. The extension suite runs on Ubuntu only (`.github/workflows/ci-extension.yml`, job `build-test`; the
  Windows job runs other files). The ACL step and `ssh.exe` take each file name, by reading (§4.2). The first real
  `creds_exec` with a stored key on a Windows computer after the release shows it.
- A new thing that throws inside the `try` of `execOverSsh` (the residue of §3).
- The sentences of (a) and (b) off a bridge still hold the local path (G2, G3). This is the decision, and Q1.
- The person's roads. Their file names still hold the id of the key entry (§4.3). No test of this plan reads the
  person's terminal.

## 7. Documents

- `src_vs_code/CHANGELOG.md`, under `## [Unreleased]`: a `### Changed — security` entry with rule C and §4.4.
- `research/module_extension.md`: in the paragraph *A lookup and a refusal name only what the agent may view*
  (F7), rule C in two sentences; in the paragraph of the SSH call (`execOverSsh`, at `:2472` today), the name of the
  call file and why it is random. No diagram shows the keys folder, so none is re-rendered.
- `research/module_tests.md`: a section for part C beside parts A and B (at `:2333`, `:2372` today), with §6.6 as
  its *what it does not prove*; the scan S1 beside the keys-folder guard.
- `todo/README.md`: this plan's row (it is there), and a row for the stories document when it is written. On
  promotion: `research/README.md`.
- README and help: no change. No sentence there shows a path of the keys folder (the stories check it again with
  `grep` for `keys/` and `.key` over `README.md`, `src_cli/README.md`, `src_mcp/README.md` and the five `help*.ts`
  files, and record the counts).
- `POST_DEPLOY.md`: no item. It is the list of the server. The change is logic that a green local run shows; the one
  thing that a local run does not show is in §6.6 (Windows), and it is a normal first use.

## 8. What this plan does NOT do

- **It does not hide the local path.** Off a bridge, (a), (b) and (c) still show the storage folder (the user name,
  the home folder). Q1.
- **It does not change what a Remote Bridge passes.** `ssh`'s `stderr` stays as returned there; after this plan it
  shows the laptop's path with no id. The path itself is the bridge plan's standing decision (§9).
- **It does not hide the path of a key FILE that a person stored in a hidden key entry** (`sshKeyPath`). §13, N11.
- It does not hide that a second entry exists, or the address of a hop (F7 §7).
- It does not change a sentence, a code, a status, a route or a tool description.
- It does not change the names of the files of the person's roads (Connect, the arrow, a VPN's launcher, the git
  sync). An agent does not read their output.
- It does not change the name of the pin file or of the script file (§4.3).
- It does not make (b) safe by construction (the residue of §3).
- It does not release. A release of the extension must follow the merge; the lead and the owner decide when.

## 9. Neighbour plans

Each neighbour gets ONE boundary row for this plan (the both-sides rule of `planning-docs.md`). This document's author
edited none of those files: another session works in them now. So each row below is OWED. The lead gives it to the
session that owns the plan, or writes it in this plan's pull request where the plan has no owner session. A row that
makes a sentence of a neighbour false is judged by that plan's own change rule.

| Plan | Touches | This plan's part | The row that the neighbour gets, and where |
|---|---|---|---|
| [PLAN_agent_refusal_names_unlisted_entry.md](../research/PLAN_agent_refusal_names_unlisted_entry.md) (F7, implemented) | rule A, rule B; N10 of its §11 | this plan builds N10 and nothing more of F7. It changes no line of the chooser (`agentNaming.ts`) and no lookup | written already: its status block and its N10 point here. Nothing is owed |
| [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) | the bridged `ssh`: `sshUseActions.ts`, `sshExecAuth.ts`; E1.6 writes a key file for each hop and a per-call file (§4.9, §6) | the name of a call file, on a bridge too. No line of `bridgeScope.ts`; `bridgedRefusal` is not changed | OWED, in its §8 *Boundaries*: (1) after this plan the key file of a call has a random name, so the words *and a linked key's id in the file name* of its §4.2, and *a key path* of the Output row of §4.9, no longer tell an id; the laptop's path stays, as that plan decided. (2) The key files of the hops of E1.6 are written with `materializeCallKey`; a pin file for a hop, if E1.6 writes one, has no id of an entry in its name. The scan S1 of this plan fails on a call of `materializePrivateKey` in a new file. (3) Its §8 row on bodies that carry `describeError` text (*Could not run ssh*) stays open: this plan does not build it (Q1). (4) Whichever merges second re-reads `sshExecAuth.ts`. That plan is under change control (epoch 8): its owner session takes the row when it opens for E1.6, with the two rows that F7 owes it |
| [PLAN_remote_bridge_scoped_E1_S3_spec.md](PLAN_remote_bridge_scoped_E1_S3_spec.md) | Amendment 3, C.6: *a key left on disk … under `<keyEntityId>-<uuid>.key`* (at `:1902-1903` today) | that sentence becomes false: the name is `call-<uuid>.key` | OWED, beside that sentence: the name, with a pointer to this plan |
| [PLAN_ssh_exec_own_agent_forwarding.md](PLAN_ssh_exec_own_agent_forwarding.md) | the argv and the environment of `ssh:exec` (`ownAgentOnly`, `sshUseActions.ts:346-348`) | none: this plan changes the VALUE of the word after `-i` (a file name). No flag, no option, no environment. Disjoint lines | OWED, under its status block: that sentence |
| [PLAN_ssh_exec_absolute_program.md](PLAN_ssh_exec_absolute_program.md) | the program that `ssh:exec` starts on Windows, and maybe a `cwd` | none. Disjoint. The key path stays absolute, so a `cwd` changes nothing for it | OWED, under its status block: the same sentence; and: an error of the start then names an absolute program, which is not a path of the keys folder |
| [PLAN_askpass_answers_the_hop.md](PLAN_askpass_answers_the_hop.md) | a password connection with a jump host: `sshExecAuth.ts` (`byPassword`, `:78-101`), `sshAskpass.ts` | none in behaviour: this plan changes `byStoredKey` (`:156-167`) and one import of the same file. The askpass script has a fixed name (§4.3) | OWED, under its status block: disjoint lines of `sshExecAuth.ts`; if that plan writes a file for a hop on the agent's road (a key of the hop, a per-call configuration), the name comes from `callKeyName()`: no id of an entry |

The order: this plan needs none of them, and none of them needs this plan. The table is complete for the plans that
were open on 2026-11-11 and name a file or a function that this plan changes. Method: `grep -l` over `todo/PLAN_*.md`
for `sshExecAuth.ts`, `keyInstaller.ts`, `materializedKeys.ts`, `materializePrivateKey`, `resolveExecAuth`,
`execOverSsh`, `removeKeyFile`, `keys folder`, `Could not run ssh` and `Could not write the stored key`. Four more
plans matched and share no line, and get no row: `PLAN_remote_bridge_scoped_E1.md` (covered by its parent's row),
`PLAN_connect_in_a_remote_window.md` (the person's Connect, whose file names do not change),
`PLAN_weave_time_column_choice.md` (the woven-password sentence, `sshExecAuth.ts:58-67`) and
`PLAN_ssh_line_runs_in_login_shell.md` (the remote command, the last word of the argv).

## 10. Risks

1. **A person can no longer read the key entry from the name of a left file** (§2.4). The purge takes the file with
   its folder. The entry of the call is in the journal line of the call.
2. **A later writer puts an id back into a name** (E1.6's hop keys, a new road). S1 fails with the file and the line.
3. **(b) is safe by its content only** (§3). It is the same class as the bridge plan's open row on `describeError`
   text in a body. Q1 is the way to close it.
4. **The local path stays** in the three ways off a bridge, and in (c) on a bridge. Q1 and Q3.
5. **A test world replaces the writer**, so a world's own name could hide a wrong name of the product. C5 takes the
   name from the real `callKeyName()`, K1 reads the argv that the product built, and U2 runs the real writer on the
   real file system once.
6. **A merge with an open branch** of a neighbour (§9) can touch `sshExecAuth.ts`; the second one re-reads it.
7. **Size.** `sshExecAuth.ts` (167 lines), `keyInstaller.ts` (292), `materializedKeys.ts` (114) and
   `test/secondEntryWorld.ts` (288) stay far under 800. Part C is a file of its own.
8. **Until the release the defect is live.** It is live today; this plan does not make it worse, and F7 epic 2 did
   not.

## 11. Growth surfaces

None is created: no table, folder, cache or process. The call file exists today; only its name changes. Its bound
stays: one file for each running call, at most `MAX_CONCURRENT_EXECS` = 8 at a time (`brokerProtocol.ts:23`), removed
in the `finally` of the call (`sshUseActions.ts:293`). A file that a killed window left is taken by the purge of the
keys folder: the folder of the window when it starts and ends, and the folder of each dead window
(`keyInstaller.ts:269-292`).

## 12. Definition of Done

- [ ] The scan S1 was written before the fix; its first failure named `sshExecAuth.ts:162` and no other caller
      outside the written list; the summary has that list, compared with §4.3.
- [ ] Rows K1 to K6 were watched failing by their assertions on the code of `b95282f1` with the no-op step, then
      pass; the summary quotes one failure message and the pass. No RED proof is a compile error.
- [ ] In the nine cells of part C the answer holds 0 hidden ids and 0 hidden names, and in each cell the path of the
      call file was found in the answer first.
- [ ] Rows U1 to U3 and S2 pass; guard rows G1 to G9 were watched passing before and after; the assertions of G1 to G4
      are the same lines as on `b95282f1` (a body holds a random path, so two runs are never byte-equal; the assertion
      is what does not change).
- [ ] Mutations 1 to 6 of §6.5 each turned a test red.
- [ ] `materializePrivateKey` has callers in exactly three files (`keyInstaller.ts`, `sshSession.ts`,
      `transportFactory.ts`); `sshExecAuth.ts` has no parameter or text that puts an id into a file name.
- [ ] The comments of C4 are changed.
- [ ] `npm run typecheck`, `npm test` and `npm run lint` are green in `src_vs_code` at lowered priority, with a clean
      `tsc` read first. `npm run contract` leaves `contract/` unchanged. `src_mcp` and `src_cli` have no difference in
      their product code.
- [ ] The documents of §7 are written; the CHANGELOG entry and the pull request body carry §4.4.
- [ ] Each owed row of §9 is with the session that owns its plan, or written; the summary says which.
- [ ] `coai`: a `review_plan` round reached `proceed` before the first test; a `review_code` round ran on the finished
      branch; every finding has an accept or a reject with a reason; the summary has the verdicts and the number of
      reviewers that answered.
- [ ] `node .agents/conventions/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; a change of this plan after its
      approval is an entry of its ledger; this plan and its stories document are promoted together, with their
      deviations.
- [ ] The summary names the models and the counts of the launches.
- [ ] The lead and the owner have heard that a release must follow, and have the questions of §14.

## 13. Found along the way (not built here)

- **N11. The path of a key FILE of a hidden key entry can show in the output of `ssh`.** A key entry can hold a path
  to a file on the disk and no stored key (`sshKeyPath`, `types.ts:69`). Then the resolver gives that path
  (`sshCredential.ts:60`), and it is the word after `-i` (`sshExecAuth.ts:146-147`). So what `ssh` prints about its
  key file ((c) of §1.2) shows a field of an entry that the agent may not view, for example
  `C:\Users\me\.ssh\acme-prod-root`. Rule C cannot close it: the path is the person's data, and `ssh` needs the real
  one. It is the same class as the address of a hop (F7 §7). Read in the code; not run. A question for the owner
  (Q2).
- **N12. The comment of `safeFileComponent` says that the file name is how the purge and the wipe find the file**
  (`materializedKeys.ts:67-68`). No code does this today (§4.2). C4 corrects it.
- **N13. The name of a test of the bridge plan says more than Node does**: *the error may carry argv and a path*
  (`test/bridgeLinks.test.ts:140`). Its world writes the folder into the error (`test/bridgeLinksWorld.ts:108`);
  Node's own message of a failed start holds the program and the code (§1.2). The test and its assertions are that
  plan's and stay.
- **N14. The mask table of a call does not hold the value of a borrowed key.** It is read for the entry of the grant
  (`maskEntries.ts:68-111`), and the key is the second entry's. No output of `ssh` is known to print a key, so no
  leak is shown here. Read only; recorded so that it is not lost.
- **N15. At a debug log level `ssh` can print the comment and the fingerprint of the key that it offers.** Off a
  bridge the person's `~/.ssh/config` applies (§1.2, (c)), and `LogLevel DEBUG` makes `ssh` print a line for each
  key that it tries. The comment is inside the stored key (the person's data), so it can name something. Rule C
  cannot close it, for the reason of N11; the owner's answer to Q2 covers the class. Raised by a question
  consultant on 2026-11-12; read in no run.

## 14. Questions for the owner

The work does not wait for an answer. Each question has the answer that this plan is built on.

**Answered by the owner on 2026-11-12: yes to Q1, Q2 and Q3.** Each answer is the one that this plan is built on: (a)
and (b) off a bridge keep the text of the operating system (O3 is not built); N11 stays, as the address of a hop
stays; on a bridge `ssh`'s `stderr` keeps the laptop's path, and the bridge plan owns it. No section below changes.

- **Q1. Off a Remote Bridge, do the two refusals (a) and (b) keep the text of the operating system?** It holds the
  storage folder with the user name. *Built on: yes, they keep it.* The caller off a bridge is a program on the
  person's own computer, and the text helps it to say what is wrong (the disk is full, there is no `ssh`). The other
  answer is O3: a fixed sentence with the error code (`EACCES`, `ENOENT`), and the whole text in the journal. It
  would also close the residue of §3, and it is the open row of the bridge plan's §8.
- **Q2. N11: may the output of `ssh` show the path of a key file that a hidden key entry stores?** *Built on: it
  stays*, as the address of a hop stays by F7 §7.
- **Q3. On a Remote Bridge, `ssh`'s `stderr` still shows the laptop's storage folder** (with no id after this plan).
  *Built on: it stays*; it is the bridge plan's standing decision, and that plan owns it.

## Epics

One epic. The stories are one document, `todo/PLAN_agent_refusal_key_file_path_E1.md`, written when the epic starts;
it links back here and gets its own `todo/README.md` row. This file holds no story. Fable wrote this plan and the
split (a security judgement). The question consultants were asked on 2026-11-12, before the plan round (consult
`1b5b224b`; 2 of 2 rows answered, codex gpt-6-astra and gemini-4-argon-low). Both said: one epic with two stories,
E1.1 is the cornerstone, and the scan and part C stay in E1.1. The split is final. Taken from their answers, after a
check in the code: S1 finds an import with a new name (§6.3, mutation 6), the G1-G4 criterion says *the same
assertions*, not *the same bytes*, and N15 (§13). Opus writes the stories document; Fable writes the specification of the
cornerstone story; Sonnet codes; Opus reviews. One epic gives a cornerstone quota of 1.

Cornerstones: 0 of 1 — none marked yet (the stories document of E1 marks the story and updates this line)

### E1 · Rule C: the name of a call file

- **Goal.** No path of a key file that an agent's call writes holds an id or a name of an entry: in the refusal of a
  failed write (a), in the refusal of a failed run (b), and in what `ssh` prints (c), on `creds_exec`, on
  `creds_rotate` of an SSH entry and on a linked `creds_run`, off and on a Remote Bridge.
- **Scope.** §2; §4.1 rows C1 to C5; §6; the documents of §7; the owed rows of §9.
- **Depends on.** F7 epic 2 merged (#353): `agentMayView` and the world of part B (`test/secondEntryWorld.ts`).
- **Pass criteria, each one a thing that can be counted.**
  1. In the 9 cells of part C the answer holds 0 hidden ids and 0 hidden names, and in 9 of 9 the path of the call
     file was found in the answer first.
  2. On the 3 doors the argv holds 0 hidden ids and 0 hidden names (K1).
  3. On the 2 doors of K6 (the bridge, the main port) the last part of the printed path does not come from the id.
  4. `materializePrivateKey` is called in exactly 3 files, and 0 others (S1, S2).
  5. The assertions of G1 to G4 are the same lines as on `b95282f1`, and pass; G5 to G9 are green before and after.
  6. Each of the 6 mutations of §6.5 turns at least 1 test red.
  7. `contract/`, `src_mcp` and `src_cli` have 0 differences. `SshUseDeps` and `AgentUseDeps` have 0 new members.
  8. The items of §12 are ticked.
- **Cornerstone area (the one of this plan).** The name of the call file: the one function that makes it, the one
  call site, the scan that keeps other writers out, and part C of the class test. A mistake there is an id that
  leaves the vault inside a text that passes every other test, and nothing after it catches the mistake.
- **Stories (expected; the stories document decides).** E1.1 **(the cornerstone area)**: the scan, the no-op step,
  part C and rows K1 to K6, the fix C3, rows U1 to U3, the guards and the mutations. E1.2: the comments, the
  documents, the owed rows and the closing checks.
