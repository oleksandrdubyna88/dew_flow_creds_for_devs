# PLAN — An agent's refusal never names an unlisted entry, E2: rule B, a second entry in a refusal

> Status: **IMPLEMENTED, 2026-11-11.** Written 2026-11-11 by Fable (a security judgement; no cornerstone). E2.1 and E2.2 were built on
> `fix/agent-refusal-names-second-entry`, merged as #353 (`b95282f1`) and released in extension 1.21.3 (release PR #355); promoted
> together with the parent and the E1 document. Deviations: the sixteen "Notes on the parent" at the end of this document, and the
> parent's §12. First: 27 string fields (5 + 22), not 25 (5 + 20); two existing tests of `bridgeLinks.test.ts` changed; part B
> runs over the real `StorageManager` in the new world `test/secondEntryWorld.ts`, not over `agentSshWorld.ts`; own rows X3 to X6
> and mutations M-b to M-d. Note 10 (the path of a borrowed key, N10) was NOT built here; it is now
> [PLAN_agent_refusal_key_file_path.md](../todo/PLAN_agent_refusal_key_file_path.md). Stories of epic E2 of
> [PLAN_agent_refusal_names_unlisted_entry.md](PLAN_agent_refusal_names_unlisted_entry.md) (its §1 D4 and D5, §2.2
> rule B, §2.3 row B, §2.5, §3.1 rows B1 to B6, §3.4 case 4, §4 steps 9 to 13, §5.2, §5.3 rows C-B and B1 to B7, §5.4
> rows G9 to G11, §5.6 mutations 4, 5 and 9, §5.8, §6, §10 and `## Epics` E2).
>
> Scope: `src_vs_code/src` (`sshCredential.ts`, `sshExecAuth.ts`, `sshOptions.ts`, `sshUseActions.ts`,
> `agentUseActions.ts`, one new module `agentNaming.ts`, their tests, one new test file, one new test world),
> `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md` and `todo/README.md`. Branch
> `fix/agent-refusal-names-second-entry`, from `main` at `b15a5410` (extension 1.21.2). Epic 1 is in that commit: it
> was merged in #347 and released in 1.21.1. The epic has one code round and one pull request. Each `file:line` below
> was read on `b15a5410`. The parent's lines were read on `360d45b7`; where a line moved, this document gives the new
> line (F1).

**Committed together with this document:** its row in `todo/README.md` under *Currently open*, the link in the
parent's E2 epic, the parent's status line and the status line of the E1 document. The parent's cornerstone ledger
line does not change: it reads `Cornerstones: 1 of 1 — E1.1`. This document keeps no change ledger: a change of it is
an entry in the parent (`plan-change-control.md`).

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan that this
document links above. A row name such as B1, C-B or G9 is the parent's (§3.1, §5.3, §5.4). A row name that starts
with X, a scenario name R1 to R6, and a mutation name that starts with M- are this document's own.

## What E2 builds, in one paragraph

An SSH entry can use the key of a second entry (`sshKeyEntityId`). It can also go through a second entry as a jump
host (`jumpHostEntityId`), and that entry through a third one. When such a second entry stops a call, the refusal
names it today. E2 changes what the agent reads. When the agent may not view the second entry, the agent reads one
fixed sentence, `SECOND_ENTRY_REFUSED`, which names the addressed entry only. The error code and the status stay.
The agent journal gets one line that names the second entry by its relation (a linked key, a jump host), never by
its name and never by its id. This is rule B of the parent (§2.2). It is applied in one chooser, `agentRefusal`, in
the new module `agentNaming.ts`. The two resolvers only say WHICH entry a refusal is about (the field `second`).
Nothing changes on a Remote Bridge. Nothing changes for a second entry that the agent may view. A hidden second
entry that works is used as today. Part B of the class test reads each reference field of `EntityMetadata` and
proves the rule at the actions. No route, no error code, no status, no body shape and no tool description changes
(the parent's §3.4).

## Stories, and who writes what

| Story | Area | Scenarios and brief | Code and tests | Review |
|---|---|---|---|---|
| E2.1 | Rule B at the chooser: part B of the class test and its world, the no-op types, rows C-B and B1 to B7, the fix B3 to B6, the decision of `agentRefusal`, guards G9 to G11, the mutation checks | this document (a Fable session: a security judgement) | Sonnet | Opus; the security judgement (authorisation: what an agent may see) is Fable's, at review, outside the quota |
| E2.2 | The documents of epic 2, the CHANGELOG entry, the closing checks, what the lead needs for the pull request | this document | Sonnet | Opus |

**No cornerstone in this epic.** The parent has one cornerstone area for the whole plan, and its quota is 1 of 1. It
is used by E1.1. The parent's E2 epic says *Cornerstone area: None*. So this document marks no story `model: fable`,
and the ledger line of the parent stays as it is.

**Who wrote this document.** A Fable session wrote it, because what an agent may see is an authorisation decision
(`subagent-models.md`, row *Security judgement*, outside any quota). That is not a cornerstone mark. The trailer of
the commit names the model.

**Why two stories and not three.** The parent's build order is binding. Part B is written before any fix (step 9).
The no-op types come next (step 10). The RED rows are watched before the fix (step 11). A commit must be green. So
part B, the RED rows and the fix can only be one green commit: a story for part B alone would end red. Epic 2 has no
harness work (the parent's §5.7 is epic 1's), so there is no story like E1.2. The documents and the closing checks
change no code and no test, so they are a story of their own.

## Binding constraints, for every story

- **No plan change.** Epoch 1 of the parent already has one change (entry 1.1). A second accepted change of scope,
  goals, Definition of Done, merge conditions, epics, stories, build order, a contract or the approach stops the
  whole plan. So: build what the parent says and what this document says, and nothing more. If a step cannot be done
  as written, if a reviewer asks for a thing that the parent does not hold, or if you find a new site: stop and tell
  the lead. The lead counts. Do not repair the parent.
- **Not built in E2:** the parent's N7, N8 and N9 (§11), and note 10 of the last section of this document (the path
  of a borrowed key: a disk-write failure, a run error, and the text of `ssh`; the parent's N10). Each one is a
  question for the owner. Note 10 is its own small item, with a priority above N8.
- **The order of work is the parent's §4, steps 9 to 13.** A story does not change that order.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first. A test that names a
  symbol that does not exist does not compile. So part B (step 9) uses no new symbol, and the new symbols are added
  as no-ops (step 10) before the rows that name them (step 11). Read the exit of `tsc` before any test result.
- **Keep what the runner printed.** For each RED row, save the failure text in the scratchpad folder of the session.
  Quote one failure and the pass in the commit body, and give the whole list to the lead.
- **A commit is green.** `npm run compile`, `npm run lint` and `npm test` pass on the staged tree before each commit.
  The RED states exist in the working tree only.
- **Stage by path, read `git diff --staged --stat`, commit only your own files.** Do not push; the lead pushes.
- **Size limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): a file has at most 800 lines (each line counts), a
  function at most 50 code lines (120 in `src/test/`), complexity at most 4 (also in tests). **No new
  `eslint-disable`.** Budget:

  | File | Lines on `b15a5410` | After, at most |
  |---|---|---|
  | `agentNaming.ts` (new) | — | 70 |
  | `sshCredential.ts` | 117 | 122 |
  | `sshExecAuth.ts` | 159 | 175 |
  | `sshOptions.ts` | 215 | 222 |
  | `sshUseActions.ts` | 453 | 475 |
  | `agentUseActions.ts` | 679 | 695 |
  | `test/secondEntryWorld.ts` (new) | — | 330 |
  | `test/agentSshWorld.ts` | 248 | 275 |
  | `test/agentNamesOnlyViewable.test.ts` | 384 | 700 |
  | `test/agentNaming.test.ts` (new) | — | 120 |
  | `test/sshUseActions.test.ts` | 501 | 600 |
  | `test/agentSshGate.test.ts` | 755 | 795 |
  | `test/sshOptions.test.ts` | 201 | 240 |
  | `test/sshExecAuth.test.ts` | 206 | 250 |
  | `test/sshCredential.test.ts` | 199 | 230 |
  | `test/bridgeLinks.test.ts` | 463 | 475 |

  A file that passes its budget moves code into a helper file with one job. It does not ask for more lines.
  `test/agentSshGate.test.ts` is the narrow one: its fixture of a chain goes into `test/agentSshWorld.ts`.
- **`tsconfig.json` has `noUnusedLocals` and `noUnusedParameters`** (`:11-12`). A helper or an import that loses its
  last reader is removed in the same edit. A parameter that a no-op does not read gets a name that starts with `_`
  (F4).
- **`agentNaming.ts` imports nothing.** It gets the question *may the agent view this id* as a function. So it stays
  pure, and a test imports it with no stub.
- **`agentNaming.ts` has three exports** (`SecondEntry`, `SECOND_ENTRY_REFUSED`, `agentRefusal`), as the parent's B2
  says. Do not add a fourth. `SshUseDeps` and `AgentUseDeps` get no new member.
- **Files with no change:** `mcpEntries.ts` (`agentMayView` is used as it is), `bridgeScope.ts`, `credsAgentServer.ts`,
  `brokerRequests.ts`, `pinGate.ts`, `secretOpener.ts`, `rotateAction.ts`, `extension.ts`, `remoteLaunch.ts`,
  `keyInstaller.ts`. Nothing in `contract/`, `src_mcp`, `src_cli` or `src_broker_client` changes. `npm run contract`
  leaves no difference.
- **Do not touch `sshUseActions.ts:270`** (the `runSshExec` line) **or `agentUseActions.ts:382`** (the `capturedRun`
  line). `test/launchRoadScan.test.ts:171-177` pins the text of the two lines.
- **Node only.** No Python, also not for a helper script.
- **A leak that the parent does not name.** If the first run of part B shows a failure that is not on the list of
  E2.1 §10 step 1: tell the lead before any fix. The parent's §4 (steps 1 and 9) says what follows: a leak with the
  shape of rule B gets a row as a recorded deviation; a leak of another shape stops the work. The lead decides which
  one it is.

## Facts read on `b15a5410` that the stories use

| # | Fact | Where |
|---|---|---|
| F1 | **Lines that moved since `360d45b7`.** Only `agentUseActions.ts` moved among the files of rule B: `remoteRefusal` is `:405-410` (the parent: `:398-403`); its `fail('no_credential', chain.reason)` is `:407` (`:400`); the chain of the linked run is resolved at `:433` (`:426`); `linkedCall` is `:264-273` (`:257-266`); `journalLine` is `:209-212` (not moved); the gate's note is `:313-321` (`:307-314`); `vpnAction` and `vpnOutcome` are `:642-679` (`:635-672`); `linkedRunRefused` is `:196-198` (not moved). `git diff 360d45b7 b15a5410` is empty for `sshUseActions.ts`, `sshExecAuth.ts`, `sshCredential.ts`, `sshOptions.ts`, `pinGate.ts`, `rotateAction.ts`, `extension.ts`, `types.ts`, `bridgeScope.ts` and `credsAgentServer.ts`: the parent's lines for them are correct | the parent's §1, §3.1, §5.2 |
| F2 | The refusal function of `bridgedRefusal` has three users, not two: `prepareAuth` (`:166`, `:181`), `execOverSsh` (`:257`, `:265`, `:274`) and `refusedBeforeSlot` → `unguardedBridge` (`:283`, `:401-403`). The third one calls it on a bridge only, with `NO_BRIDGED_SSH_CONFIG`. Its parameter type `(code, message) => UseActionResult` accepts a function with a third optional parameter, so it needs no edit | `sshUseActions.ts` |
| F3 | `refuseWalk` and `refuseHop` return the private type `Refusal` (`:112`), not `JumpChain` (`:104`). The two types get the field `second?` | `sshOptions.ts` |
| F4 | `noUnusedParameters` is on. A no-op `agentRefusal` that does not read `entityName` and `mayView` does not compile under those names | `src_vs_code/tsconfig.json:12` |
| F5 | Three test worlds REPLACE `resolveSshCredential`: `test/sshUseActions.test.ts:114-117`, `test/sshExecOver.test.ts:82`, `test/sshExecAuth.test.ts:40`. A row that needs a real key entry with a real PIN cannot use them. `test/bridgeLinksWorld.ts:79-151` keeps the resolver real, over the real `StorageManager` (`test/pinWorld.ts:214`, `:230`), with a sealed key (`:33`, `locked`) | the tests |
| F6 | The storage of `test/agentSshWorld.ts` answers `getAccounts`, `getNode` and `getDbConnection` only (`:30-48`). It serves the rows that read nodes only: the chain of a linked run, the `sshEntityId` row. The rows that open a stored value need `getPrivateKey`, `getPassword` and the rotation index that the automatic opener reads (`automaticRead.ts:23-34`) | `test/agentSshWorld.ts` |
| F7 | `EntityMetadata` (`types.ts:56-316`) has **27** fields of type `string` or `string[]`, not 25. Two of them share a line with other fields: `attachmentChangedBy` (`:231`) and `imageChangedBy` (`:233`). Each one holds the e-mail of the person who changed the file (`attachmentMeta.ts:120`); it is no reference. A scan that reads one field for each line finds 25 and misses the two | `types.ts` |
| F8 | Two existing tests assert, as a control, the sentence that the main port gives TODAY for a second entry that is not visible in their vault: `pinRefusalFor('deploy-key')` (`:86-87`) and `The jump host "jump" cannot be used: its address is not a valid host.` (`:126-127`). In that vault `k1` has a PIN and `j1` has no switch (`test/bridgeLinksWorld.ts:185-198`). The fix changes the two answers | `test/bridgeLinks.test.ts` |
| F9 | `creds_rotate` on an SSH entry hands on the refusal of the inner `ssh:exec` as it came: `underlying.run` (`:174`), `ranAndStored` (`:187-190`), `maskedAnswer` (`:212-214`). It is registered at `extension.ts:660` | `rotateAction.ts` |
| F10 | A linked `creds_run` on a Remote Bridge is refused before the link is read, with `BRIDGE_NOT_SERVED` and the code `not_supported` (`:269-271`). So `remoteRefusal` is never reached on a bridge | `agentUseActions.ts` |
| F11 | In a linked run the addressed entry is the Terminal entry: `ctx.entityName` is its name. The SSH entry is `call.ssh` (`agentUseActions.ts:418`; `sshUseActions.ts:258`). The gate let the SSH entry through, so the agent may view it. The owner of a stopped value is compared with `call.ssh`, not with the Terminal entry | the two files |
| F12 | `deps.note` writes one line to the agent journal (`credsAgentServer.ts:146-148`). The broker writes its own line for a call that has a grant; for an answer that is not 200 that line holds the status only (`brokerCall.ts:304`). It does not change | the two files |
| F13 | The sentences that name the OWNER of a stopped value: `pinRefusalFor(owner.name)` (`pinGate.ts:186-191`, through `secretOpener.ts:59-62`); `corruptReason(owner.name, why)` (`pinGate.ts:160-165`, through `secretOpener.ts:65-68`); and, for a value that a click stopped with no reason, `"<owner>" is protected with its own PIN, and it was not opened.` (`sshExecAuth.ts:126`) | — |
| F14 | An entry is hidden from agents when it has the mark `pinProtected` (`mcpEntries.ts:111-113`) or when `view` is not on (`:278-280`). A key entry whose value is sealed while its mark is lost is NOT hidden, but only when `view` is on (`:278-280`): then its refusal names it, and the agent may view it. With `view` off it is hidden, mark or no mark | `mcpEntries.ts` |
| F15 | The text of the two resolvers reaches an agent at three places only: `sshUseActions.ts:181`, `:265` and `agentUseActions.ts:407`. The other callers are the person's roads: `remoteLaunch.ts:411`, `connectionOptions.ts:54`, `sshSession.ts:280`, `commands/agentCommands.ts:217`, `:287`, `:437`; `agentUseActions.ts:281` builds the text of the consent dialog and drops a refused chain | `grep -rn "resolveExecAuth\|resolveJumpChain\|resolveSshCredential"` |
| F16 | A chain can have four hops (`MAX_JUMP_DEPTH`, `:22`), so a chain of three is inside the cap. The walk refuses at `hops.length >= 4` (`:134`): a 5th hop gets `"<starting entry>" chains more than 4 jump hosts, …` (`:137`), and the address of that hop is not read. `entity` is never re-bound in `resolveJumpChain`, so the sentence always names the starting entry (rows X5 and X6) | `sshOptions.ts` |
| F17 | An unsafe hop is one whose `host` is empty or not a safe host, or whose `user` is not a safe user (`isSafeSshTarget`, `:97-102`) | `sshCommand.ts` |
| F18 | The automatic opener is the default of `resolveSshCredential` (`:47`), and `prepareAuth` passes no opener (`sshUseActions.ts:171`) | `sshCredential.ts` |
| F19 | `SshUseDeps` has 9 members (`sshUseActions.ts:42-80`); `AgentUseDeps` has 8 (`agentUseActions.ts:59-83`) | the two files |

**How the sites were checked again (the method).** (1) `grep -n 'Name}\|\.name}'` over `sshUseActions.ts`,
`agentUseActions.ts`, `sshExecAuth.ts`, `sshCredential.ts`, `sshOptions.ts` and `rotateAction.ts`, each hit read. (2)
`grep -rn` for each caller of `resolveExecAuth`, `resolveJumpChain` and `resolveSshCredential` (F15). (3) Each
`describeError(` of the two SSH action roads read (`sshUseActions.ts:217`, `:274`; `sshExecAuth.ts:157`); this gave
note 10. (4) `grep -rn` over `src/test` and `scripts` for the two sentences that change; this gave F8. NOT done: a
run with a real `ssh`; a read of each error that an operating-system call can throw.

## Commands

The worktree has no `src_vs_code/node_modules`. Install once. The `npm` scripts lower their own priority.

In `src_vs_code`:

1. `npm ci`
2. `npm run compile` — read its exit first.
3. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
4. `npm run lint`
5. `npm run typecheck`
6. `npm test` — the full suite.
7. `npm run contract`, then `git diff --exit-code -- ../contract` (no difference).
8. `npm run ratchet`
9. `npm run itest:mcp` — where `creds-mcp` is built (the E1 document, *Commands*, gives the build line). E2 changes
   nothing that this harness reads; H1 to H6 stay green. If the binary is not built here, say so, and say who runs
   it before the release.

In the repository root:

10. `node .agents/conventions/tools/plan-lifecycle.mjs` and `node .agents/conventions/tools/pin-check.mjs`.

`npm test` needs the shared-rules mount. It is there in this worktree: the submodule `.agents/conventions` is at the
pinned commit and has its modules.

## E2.1 — rule B at the chooser

### 1. Files and functions

| File | Function or thing | Change |
|---|---|---|
| `test/secondEntryWorld.ts` (new, not a suite) | the vault of part B and the real actions over it | new |
| `test/agentSshWorld.ts` | one new export: a chain of three hidden hops | for B3 and for the world above |
| `test/agentNamesOnlyViewable.test.ts` | part B of the class test, after part A | new tests |
| `agentNaming.ts` (new) | `SecondEntry`, `SECOND_ENTRY_REFUSED`, `agentRefusal` | B2 |
| `sshCredential.ts:36-41`, `:80`, `:102` | `SshCredentialStopped` gets `ownerId` | B1 |
| `sshExecAuth.ts:40-45`, `:121`, `:124-128` | the failure of `ExecAuth` gets `second?`; `stoppedAuth` sets it | B3 |
| `sshOptions.ts:104`, `:112`, `:144-154` | the failure of `JumpChain` and `Refusal` get `second?`; `refuseHop` sets it at `:153` | B4 |
| `sshUseActions.ts:118-135`, `:166`, `:181`, `:265` | `bridgedRefusal`, the type of `refuse`, the two calls that pass `second` | B5 |
| `agentUseActions.ts:405-410` | `remoteRefusal` | B6 |
| `test/agentNaming.test.ts` (new) | B7 | new |
| `test/sshUseActions.test.ts`, `test/agentSshGate.test.ts`, `test/sshOptions.test.ts`, `test/sshExecAuth.test.ts`, `test/sshCredential.test.ts` | rows B1 to B6, X3, X4 | below |
| `test/bridgeLinks.test.ts:74-89`, `:115-129` | two controls change (F8); two guard assertions more (G9) | §8 |

### 2. The world of part B, `test/secondEntryWorld.ts`

Build it the way `test/bridgeLinksWorld.ts:79-151` builds its world (F5):

- `loadWithVscode('../sshUseActions', stub, mocks)`, with these I/O edges replaced and no other: `./keyInstaller` (it
  writes a REAL file in a folder that the world owns, `ownedDir`), `./hostKeyTrust`, `./sshExecRunner` (it records
  the argv and answers exit 0 with `ok`), `./sshConnect` (`connectEntity` answers `false`: the terminal does not
  open). **`./sshCredential` is NOT replaced.** The resolver, the opener, the chain and the argv are the product's.
- The storage is the real `StorageManager`: `memoryStorage(stub)` and `seedEntry` of `test/pinWorld.ts`, account
  `ACCOUNT` (`a1`). A node that needs switches or a folder is added with `storage.addNode`.
- `terminalRunAction` and `vpnAction` come from a plain import of `../agentUseActions` (as
  `test/agentSshGate.test.ts:5` does). The linked run gets `overSsh: execOverSsh(sshDeps)`: the REAL run over SSH,
  not a recorder.

Nodes that the agent MAY view (plain names, each with `mcp: { view: true, use: true }` in its details):

| Id | Node |
|---|---|
| `e1` | the SSH entry `prod`: `host`, `user`, a plain private key of its own (`seedEntry(storage, e1, { 'private key': KEY_BODY })`, the helper of `test/pinWorld.ts:230`, as `test/bridgeLinksWorld.ts:191` calls it), and the links that the options ask for |
| `t1` | the Terminal entry `deploy`: `command: 'echo linked'`, `sshEntityId: 'e1'` |
| `t2` | a Terminal entry linked to the hidden SSH entry (the `sshEntityId` row) |
| `v1` | a VPN entry with `vpnLauncherEntityId` and `dependsOn`, each one the id of a hidden entry |

Nodes that the agent may NOT view. Each one has the name `MARK-<id>` (`markerOf` of `test/unlistedWorld.ts:27`). Each
id has at least 10 characters and is no word of a sentence:

| Role | Node | Hidden because |
|---|---|---|
| the key entry | kind `sshkey`; its private key is plain, sealed with a PIN (`locked`, and the mark `pinProtected`), or damaged | no switch; with a PIN also the mark |
| hop 1 to hop 5 | SSH entries; `e1` → hop 1 → … → hop 5; one of hops 1 to 4 can have the unsafe address `bad host!`. A chain of 4 hops is inside the cap; the walk refuses at the 5th (`MAX_JUMP_DEPTH` is 4, `sshOptions.ts:22`; `refuseWalk` refuses at `hops.length >= 4`, `:134`). The 5th hop is read only for the depth-cap rows (X6) | no switch |
| the hidden SSH entry | the link target of `t2` | no switch |
| the launcher, the dependency | the two targets of `v1` | no switch |

**`e1` always has a credential of its own.** `execOverSsh` resolves the credential BEFORE it reads the jump chain
(`sshUseActions.ts:258-266`). A source of kind `none` is refused with `"prod" has no stored password or key any more.`
(`sshExecAuth.ts:132-133`). So an `e1` with no stored key would be refused before the chain is read, and each hop row
would pass for a wrong reason. Because of this, `e1` holds a plain private key of its own in each world. When `key` is
not `'none'`, `e1` also gets `sshKeyEntityId`, and the key entry's value wins over the key of `e1`
(`sshCredential.ts:69-75`: `keySourceOf` returns the referenced entry, and the stored key is read from it).

Options of the world (each default is the case with no second entry):

| Option | Values |
|---|---|
| `key` | `'none'` (default: no link; `e1` uses its own plain key), `'plain'`, `'sealed'`, `'damaged'` (each one: a key entry that `e1` links to with `sshKeyEntityId`) |
| `keyVisible` | the key entry gets `mcp: { view: true }` and no mark (for the positive control) |
| `hops` | `0` (default) to `5` |
| `unsafeAt` | `1`, `2`, `3` or `4`: the hop that has the unsafe address. Hop 5 cannot be the unsafe one: the depth cap refuses before the address of the 5th hop is read |
| `visibleHops` | the hops that get `mcp: { view: true }` |
| `noteThrows` | `deps.note` throws (X4) |

A damaged value is the stored text `{"v":1,"lock":{"wrap":` (a cut envelope, as in
`test/agentUseActions.test.ts:243`).

The world gives: the actions `exec` (`sshExecAction`), `terminal` (`sshTerminalAction`), `run` (`terminalRunAction`
over the real `execOverSsh`), `rotate` (`rotateAction(exec, 'command', deps)`, with the stub deps of
`test/rotateAction.test.ts:69-90`, `entity` answering `e1` and `current` answering a plain password; the body of a
rotate call is `{ command: <a line that holds NEW_SECRET_PLACEHOLDER one time> }`), `vpnUp` (`vpnAction` with an `open` that answers
`false`); `notes`; `runs`; the context of a call for an id; the list of hidden names and the list of hidden ids;
`cleanup()`. The context of a linked run goes through `asBroker` (`test/agentSshWorld.ts:91-93`). The trust store of
`run` holds the fingerprint of the trust line; the world computes it with the REAL `resolveJumpChain` and
`trustLineFor` and does not guess the chain value.

**The chain of hidden hops** is one new export of `test/agentSshWorld.ts`, used by this world and by row B3: up to
five `sshNode`s (`test/sshRoadWorld.ts:20`) with marker names and no switch, linked in a row, with the unsafe address
on the hop that the caller names (hops 1 to 4). Row B3 uses three hops; rows X5 and X6 use four and five.

**Proofs** (in one test at the top of part B; a fixture that the code declines for another reason proves nothing):

1. `agentMayView(storage, ACCOUNT, id)` is `false` for each hidden id. It is `true` for `e1`, `t1`, `t2`, `v1`, and
   for the key entry and a hop when the option makes them visible.
2. No hidden name and no hidden id is a part of a visible name, of a visible id, of another marker, of the path of
   the world's folder, or of the two answers that a row compares with.
3. `isSafeSshTarget` is `false` for the unsafe hop and `true` for each other hop.
4. The real `resolveSshCredential` on `e1` answers `stopped` for `key: 'sealed'`, with `pinRefusalFor(<the key
   entry's name>)`; and `stopped` for `key: 'damaged'`, with a sentence that starts with `"<the key entry's name>"
   holds a protected value that cannot be read:`. These two messages are the `m` of the positive controls (§3): a
   control compares the whole body with `errorBody('no_credential', m)`, and `m` is the message that the real
   `resolveExecAuth` gives on the same world. That message does not change.
5. With the default options (`key: 'none'`, `hops: 0`), `exec` on `e1` answers 200 and the spawn is reached one time.
   So `e1` passes the credential step by its own key. Without this proof a hop row could be refused at the credential
   step (`"prod" has no stored password or key any more.`, `sshExecAuth.ts:132-133`), before the chain is read, and
   the row would show no marker for a wrong reason.

### 3. Part B of the class test, in `test/agentNamesOnlyViewable.test.ts`

Part B is written at step 9, on the unchanged `src` code. It imports NO symbol of `agentNaming.ts`. Its assertion
for a refused call is: the status and the code are as today, and the answer holds no hidden name and no hidden id.
The exact new body is asserted by rows B1 to B3 (§5), after the no-op types exist.

**The scenario table: one row for each reference field** (the parent's §5.2). The table is a constant in the test;
its keys are the five field names and one row more for `ssh:terminal`.

| Row | Field (`types.ts`) | The action that reads it | Cases | Must be true | On the unchanged code |
|---|---|---|---|---|---|
| R1 | `sshKeyEntityId` `:76` | `ssh:exec`; `creds_rotate` over it (F9); the linked `creds_run` through the real `execOverSsh` → `prepareAuth` → `resolveExecAuth` → `resolveSshCredential` (`sshCredential.ts:43-61`) | (a) `exec`, `key: 'sealed'`; (b) `exec`, `key: 'damaged'`; (c) `rotate`, `key: 'sealed'`; (d) `run` of `t1`, `key: 'sealed'` | 409, `no_credential`; no hidden name and no hidden id in the answer; nothing was spawned | RED: the body holds the marker of the key entry |
| R2 | `jumpHostEntityId` `:84` | `ssh:exec` (the thunk at `sshUseActions.ts:326`, read at `:263-266`); `creds_rotate`; the linked `creds_run` (`agentUseActions.ts:433`, `:405-410`); each hop of the chain (`sshOptions.ts:168-186`) | `hops: 3`, the hops hidden, `unsafeAt` 1, 2 and 3, on `exec` (3 cases) and on `run` of `t1` (3 cases); `rotate` with `unsafeAt: 1` (1 case). In all 7 the credential is `e1`'s own plain key (`key: 'none'`), so the call reaches the chain (proof 5) | the same | RED: the body holds the marker of the unsafe hop |
| R3 | `sshEntityId` `:172` | the linked `creds_run`: `linkedCall` (`agentUseActions.ts:264-273`) | `run` of `t2` | 403, `denied`, `linkedRunRefused(<name of t2>)` (`:196-198`); no marker | green before and after |
| R4 | `vpnLauncherEntityId` `:115` | `creds_vpn_up`: `vpnAction` → `deps.open` (`agentUseActions.ts:642-665`) | `vpnUp` on `v1`; the start fails | `"<name of v1>" could not be started — see the notification.` (`:678`); no marker | green before and after |
| R5 | `dependsOn` `:282` | `creds_vpn_up` only (the chain runs in the window's start, behind `deps.open`) | the same call; the test asserts that `v1` holds the two fields | no marker | green before and after |
| R6 | the two SSH fields again | `ssh:terminal` (`sshUseActions.ts:340-380`) | `terminal` on `e1` with `key: 'sealed'`, `hops: 1`, `unsafeAt: 1`; the open fails | `Could not open an SSH terminal for "prod" — the window said why.` (`:391`); no marker. The world replaces `./sshConnect`, so on `ssh:terminal` the key and the chain are never read. R6 proves only the fixed sentence of `notOpened` (`:387-392`). That is safe: the sentence holds only `ctx.entityName`, so the code cannot leak a second entry there | green before and after |

A row collects each case that fails and fails one time, with the list. So the first run prints the list of leaks.

**The scan fails closed.** The test reads `types.ts` and collects each field of `EntityMetadata` whose type is
`string` or `string[]`.

- **It must find a field that shares its line with other fields** (F7). Take the text between `export interface
  EntityMetadata {` and the first `}` at the start of a line. Remove the comments. Split at `;`. Each piece that is
  not empty must be one field of the form "`name` or `name?`, then `: type`" (required fields exist: `id: string;`
  and `name: string;`, `types.ts:57-58`); a piece that is not such a field fails the test, with the piece. So a new shape cannot be passed over in silence.
- Each collected field must be in the scenario table (five: `sshKeyEntityId`, `jumpHostEntityId`,
  `vpnLauncherEntityId`, `sshEntityId`, `dependsOn`) or on the written list of fields that hold no reference to
  another entry. On `b15a5410` that list has 22 names: the twenty of the parent's §5.2 (`id`, `name`, `host`, `user`,
  `sshKeyPath`, `publicKey`, `hostKey`, `tags`, `vpnConfigFileName`, `scriptLanguage`, `script`, `configFileName`,
  `configKeyHash`, `command`, `commandNote`, `terminalOs`, `attachmentFileName`, `imageFileName`, `depColor`,
  `notes`) and the two of F7 (`attachmentChangedBy`, `imageChangedBy`).
- A field that is in neither fails the test, with the field's name. A name on a list that the scan does not find
  fails too (a list that went stale).
- The companion: the scan finds at least the five reference fields and `name`.
- The test asserts no total. The two lists are the truth; the lead ticks pass criterion 7 with the numbers that the
  run shows (note 1).

**Each row ran.** The last test of part B asserts that each of the six rows of the table ran at least one case.

**Row R: no agent action resolves `creds://` off a bridge.**

- (a) The source of `sshUseActions.ts`, `agentUseActions.ts` and `rotateAction.ts` has no import of `./secretRef`,
  `./entityFieldReading` or `./runPlan`. The companion: the same search finds the import of `./runPlan` in
  `remoteLaunch.ts` (`:7`).
- (b) The linked `creds_run` of a Terminal entry whose line is `echo creds://a1/<a hidden name>/password`, in the
  gate world of `test/agentSshWorld.ts` (its `overSsh` records and answers `OK_BODY`): the recorded `remoteCommand`
  holds the reference as text, and the answer holds no hidden marker. Use this road, with the recorder. A run that
  really prints its line would put the marker into its own output, and that is not what the row is about.

**Positive controls** (a file of negative assertions needs them; watched green before and after):

| Control | World | Must be true |
|---|---|---|
| a visible jump host | `hops: 1`, `unsafeAt: 1`, `visibleHops: [1]` | 409; the WHOLE body is deep-equal to `errorBody('no_credential', m)`, where `m` is `The jump host "<its name>" cannot be used: its address is not a valid host.`, taken from the real `resolveJumpChain` on the same world, not typed again; 0 notes |
| a visible key entry with a damaged value | `key: 'damaged'`, `keyVisible: true` | 409; the WHOLE body is deep-equal to `errorBody('no_credential', m)`, where `m` is the message that the real `resolveExecAuth` gives on the same world (it starts with `"<its name>" holds a protected value that cannot be read:`; it does not change); 0 notes |
| a visible unsafe hop behind a hidden good hop | `hops: 2`, `unsafeAt: 2`, `visibleHops: [2]` | the sentence names hop 2; the answer does not hold the marker of hop 1 |

The first two controls are the two cases of pass criterion 4. They compare the whole body, not a part of it, so a
changed key, a changed field or an added field of the body is red too. The parent's criterion 4 says *byte-equal*.

**G11: a hidden second entry that works stops nothing** (watched green before and after):

| Case | World | Must be true |
|---|---|---|
| a hidden jump host with a safe address | `hops: 1` (`e1` passes the credential step by its own key, proof 5) | 200; the spawn was reached one time; the argv holds `-J` with the hop's address; 0 notes |
| a hidden key entry with no PIN | `key: 'plain'` | 200; the spawn was reached one time; the key file is gone after the call; 0 notes |

### 4. The no-op types (the parent's step 10)

Add these with no reader. They change no behaviour.

- `agentNaming.ts`: the interface `SecondEntry`; `SECOND_ENTRY_REFUSED` with its real sentence (§6); `agentRefusal`
  with the real signature and a body that gives `{ message: said.message }`. Name the two parameters that the no-op
  does not read `_entityName` and `_mayView` (F4); the fix gives them their names.
- `sshExecAuth.ts:40-45`: `readonly second?: SecondEntry` on the failure of `ExecAuth`. Nobody sets it.
- `sshOptions.ts:104` and `:112`: `readonly second?: SecondEntry` on the failure of `JumpChain` and on `Refusal`
  (F3). Nobody sets it.
- `sshCredential.ts:36-41`: `readonly ownerId: string`. It is filled at its two sites: `ownerId: keySource.id` at
  `:80`, `ownerId: owner.id` at `:102`. The docblock at `:32-35` says what it is.

Then: `npm run typecheck` is clean, and `npm test` shows the failures of step 9 and no other.

### 5. RED rows (each one watched failing by its assertion, then passing)

| Row | File | Scenario | Fails with | After the fix |
|---|---|---|---|---|
| C-B | part B | R1 (4 cases) and R2 (7 cases) | the body holds a marker, for example `"MARK-<id>" is protected with its own PIN, so it cannot be used automatically. …` or `The jump host "MARK-<id>" cannot be used: its address is not a valid host.` | no hidden name, no hidden id |
| B1 | `test/sshUseActions.test.ts`, over the world of §2 (not over the file's own `world()`, F5) | `exec` on `e1`, `key: 'sealed'` | the message is `pinRefusalFor(<the key entry's name>)` | the body is deep-equal to `errorBody('no_credential', SECOND_ENTRY_REFUSED('prod'))`; status 409; nothing was spawned |
| B2 | the same file | `exec` on `e1`, `hops: 3`, `unsafeAt` 1, 2 and 3 | `The jump host "MARK-<id>" cannot be used: its address is not a valid host.` | the same body as B1, in the three cases |
| B3 | `test/agentSshGate.test.ts`, in `gateWorld` with the chain of `test/agentSshWorld.ts` (`acct1`: `usableSsh('s1', { jumpHostEntityId: <hop 1> })` and the three hops); `const action = terminalRunAction(w.deps)`, then `action.run(asBroker(action, w.ctx), {})` | the unsafe hop at depth 1, 2 and 3 | the same sentence as B2, through `agentUseActions.ts:407` | `errorBody('no_credential', SECOND_ENTRY_REFUSED('deploy'))`; status 409; `w.overSsh.calls` is empty; no slot was taken |
| B4 | the two files above | B1, B2, B3 | no note | exactly one note for each refused call (`notes` has length 1). For B1 it is `prod: its linked key entry did not open for an automatic use (a PIN of its own, or a damaged value) (the agent was told only that another entry stopped the call)`. For B2 it is `prod: a jump host in its chain has an address that is not a valid host (the agent was told only that another entry stopped the call)`. For B3 it is the same line with `deploy`. A search of the note for each hidden name and each hidden id finds nothing |
| B5 | `test/sshOptions.test.ts` | `resolveJumpChain` with an unsafe hop at depth 1 and at depth 3 | `second` is `undefined` | `{ id: <that hop's id>, relation: 'jump host' }`. The refusals of a circle (`:120`), of a missing hop (`:133`) and of the depth cap (`:152`) keep `second` `undefined` |
| B6 | `test/sshExecAuth.test.ts`, with `withCredential` (`:31-55`) | `resolveExecAuth` with the source `{ kind: 'stopped', reason: pinRefusalFor('deploy key'), ownerName: 'deploy key', ownerId: 'k7' }`; the same with `reason: ''`; the same with `ownerId` equal to the id of `ENTITY` | `second` is `undefined` in the first two cases | `{ id: 'k7', relation: 'linked key' }` in the first two cases; `undefined` when the owner is the entry itself. The message does not change in any case |
| B7 | `test/agentNaming.test.ts` (new; a plain import, no stub) | `agentRefusal({ message: 'M with MARK-x', second: { id: 'x-9', relation } }, 'prod', mayView)`: with a `mayView` that answers `false`, for each of the two relations; with one that answers `true`; with no `second` | the no-op gives `{ message: 'M with MARK-x' }` in the first case | first case: `{ message: SECOND_ENTRY_REFUSED('prod'), note: <the line of that relation, written out in the test> }`, and the note holds neither `x-9` nor `MARK-x`. The two other cases: deep-equal to `{ message: 'M with MARK-x' }` (no key `note`); with no `second`, `mayView` was not called |

In B7 the test holds the two lines in a constant of the type `Record<SecondEntry['relation'], string>`. So a third
relation does not compile before the test has its line. B7 also asserts the sentence of `SECOND_ENTRY_REFUSED('prod')`
as a literal (§6), and that the source of `agentNaming.ts` holds no `import` and no `require(`.

**The fixture is proved first, in the test** (the parent's §5.3): for B1, the same world with `key: 'plain'` gets
past the refused step (the spawn is reached). For B2, the same world with no unsafe hop gets past it. These are the
two cases of G11, or calls of the same shape.

**Rows of this document** (X3 and X6 are green with the no-op types and after the fix; X4 and X5 are red before the fix by their marker assertion, and green after it):

| Row | File | What it pins |
|---|---|---|
| X3 | `test/sshCredential.test.ts`, over `borrowedKeyWorld` (`:155-170`) and `fakeStorage` (`:30-41`) | `ownerId` is the id of the entry that OWNS the stopped value: the key entry's id for its stored key (`:80`); the key entry's id for its password, and the connection's own id for its own password (`:102`). Without this row a wrong id shows only in a positive control |
| X4 | `test/sshUseActions.test.ts`, the world of §2 with `noteThrows` | What happens when `deps.note` throws, at each of the three sites. The message is chosen before the line is written, so a journal that throws cannot bring the old sentence back. The row asserts these outcomes, and that no hidden name and no hidden id is in the answer or in the error. (a) `sshUseActions.ts:181` (a hidden key entry; B1's call): the refusal is called outside the `try` (`:258`), so the call REJECTS with the error of the journal, and the broker answers `INTERNAL_FAILURE` (`credsAgentServer.ts:686-687`; the broker is not part of the row). (b) `sshUseActions.ts:265` (a hidden unsafe hop; B2's call): the refusal is inside the `try`; the throw goes to the `catch` at `:273-274`, which calls `refuse` again with no `second`, so no second note is tried; the answer is 500, `internal`, with `Could not run ssh: <the error of the journal>`. (c) `agentUseActions.ts:407` (a hidden unsafe hop in a linked run; B3's call): the call REJECTS with the error of the journal. No leak in any of the three. (Red before the fix by its marker assertion; green after) |
| X5 | `test/sshUseActions.test.ts`, the world of §2 (`exec` and `run`) | The chain at depth 4. **Own row: it tests a site of §3.1 (`sshOptions.ts:153`) and adds no site.** `hops: 4`, `unsafeAt: 4`, the hops hidden; `e1` passes the credential step by its own key (proof 5). A chain of 4 hops is inside the cap, so the walk reaches the hop at depth 4 and refuses its address. On `exec` and on the linked `run` of `t1`: 409, and the body is deep-equal to `errorBody('no_credential', SECOND_ENTRY_REFUSED(<entry>))` (`prod` on `exec`, `deploy` on `run`); exactly 1 note, the line of the relation `jump host`; no hidden name and no hidden id in the body or in the note. (Red before the fix by its marker assertion: the body holds the marker of hop 4; green after) |
| X6 | `test/sshUseActions.test.ts`, the world of §2 (`exec` and `run`) | The depth cap. **Own row: it tests a site of §3.1 (`sshOptions.ts:137`) and adds no site.** `hops: 5`, all hops hidden and all with a safe address. The 5th hop is refused by `refuseWalk` (`sshOptions.ts:134`) before its address is read. On `exec` and on the linked `run` of `t1`: 409, `no_credential`, and the body is deep-equal to `errorBody('no_credential', '"prod" chains more than 4 jump hosts, which is a mistake rather than a network.')`. The sentence names the STARTING entry only: `entity` is never re-bound in `resolveJumpChain`, so on a linked run it names the SSH entry `prod`, not the Terminal entry. The answer holds no hidden marker and no hidden id. The refusal has no `second`, so there is 0 notes. (Green before and after)

### 6. The fix (the parent's step 12)

**B2, `agentNaming.ts`: the decision.**

- `export interface SecondEntry { readonly id: string; readonly relation: 'linked key' | 'jump host' }`
- `export function SECOND_ENTRY_REFUSED(entityName: string): string` gives exactly:
  `"<entityName>" could not be used: another entry that it needs (a linked key or a jump host) stopped the call, and that entry is not visible to agents. The reason is in the agent journal on this computer.`
- `export function agentRefusal(said: { readonly message: string; readonly second?: SecondEntry }, entityName: string, mayView: (entityId: string) => boolean): { readonly message: string; readonly note?: string }`
  - `said.second` absent, or `mayView(said.second.id)` is `true`: `{ message: said.message }`. No note.
  - Else: `{ message: SECOND_ENTRY_REFUSED(entityName), note }`.
- The note is `<entityName>: <relation line> (the agent was told only that another entry stopped the call)`. The
  relation line comes from a table in this module, keyed by the relation:

  | Relation | Relation line |
  |---|---|
  | `linked key` | `its linked key entry did not open for an automatic use (a PIN of its own, or a damaged value)` |
  | `jump host` | `a jump host in its chain has an address that is not a valid host` |

- No part of `said.message` and no part of `said.second.id` goes into the note. So a name cannot arrive there.
- The docblock says the rule: the question is about the SITE, not about the value. `second` is set whenever the
  owner or the hop is another entry, whatever the sentence says.

**B3, `sshExecAuth.ts`.** `stoppedAuth(source, entity)` takes the entry that was asked for (the call at `:121`
passes `entity`). It sets `second: { id: source.ownerId, relation: 'linked key' }` when `source.ownerId !==
entity.id`. The message does not change. `byPassword`, `byStoredKey`, `wovenRefusal` and `authFor` set nothing:
each of their sentences names the entry that was asked for (`:60`, `:84`, `:133`, `:149`), or is the write failure
of `:157` (note 10). The comment at `:124` says who the sentence names and what `second` is for.

**B4, `sshOptions.ts`.** `:153` gives `second: { id: hop.id, relation: 'jump host' }`, for a hop at any depth. `:132`,
`:137` and `:148` name the starting entry and set nothing.

**B5, `sshUseActions.ts`.**

- `bridgedRefusal` returns `(code: ErrorCode, message: string, second?: SecondEntry) => UseActionResult`. The
  `refuse` parameter of `prepareAuth` (`:166`) has the same type. The parameter of `unguardedBridge` (`:401`) is not
  edited (F2).
- On a bridge (`ctx.bridge !== undefined`): the two lines of today (`:132-133`), not one character changed.
- Off a bridge: `agentRefusal({ message, second }, ctx.entityName, (id) => agentMayView(deps.storage,
  ctx.accountId, id))`. A note goes to `deps.note`. The answer is `fail(code, <the message that came back>)`. Put the
  three steps into one small helper, so that each function keeps its complexity at 4 or less. The message is
  chosen first, then the note is written, then the answer is built (X4).
- `:181` passes `resolved.second`. `:265` passes `chain.second`. `:274` passes none.
- The docblock of `bridgedRefusal` (`:118-126`) says *the sentence as it always was off a bridge*. That becomes
  false. It says the two branches after the fix.

**B6, `agentUseActions.ts:405-410`.** In place of `fail('no_credential', chain.reason)` at `:407`: `agentRefusal({
message: chain.reason, second: chain.second }, ctx.entityName, (id) => agentMayView(deps.storage, ctx.accountId,
id))`, the note to `deps.note`, then `fail('no_credential', <the message that came back>)`. Use a small helper for
the same reason. `agentMayView` is added to the import of `./mcpEntries` at `:15`. `trustLineOf` (`:281`) is not
edited: it reads `chain.ok` only.

**What does not change, and must be seen not to change:** each sentence for a second entry that the agent may view;
each sentence that names the entry that was asked for; the answers and the notes on a Remote Bridge; the answer for
a jump host that is gone (`sshOptions.ts:148`); a call whose hidden second entry works.

### 7. Guard rows (watched passing before and after)

| Row | Where | What it guards |
|---|---|---|
| G9 | `test/bridgeLinks.test.ts:74-84` (a sealed key), `:91-97` (a key that cannot be written), `:115-124` (an unsafe jump host), `:131-137` (an `ssh` that cannot start): the bridged half of each test, not changed. **Two assertions more**, in the first and the third: the journal holds the exact line `prod: <the real sentence> (a Remote Bridge was told only that it could not be used)` (today the two tests ask only that a note holds the sentence). Watch the two green on the unchanged code first; if one is red there, tell the lead | on a Remote Bridge the body is `BRIDGE_USE_REFUSED('prod')` and the note is today's, byte for byte |
| G9, the linked run | `test/agentSshGate.test.ts:470`, `:740` (not changed) | a linked run on a bridge is refused with `BRIDGE_NOT_SERVED` before the link is read (F10) |
| G9, the reference test | `test/bridgeReferences.test.ts` (not changed; the parent's G9 names it). Watched green before and after | it tests `REFERENCE_REFUSED` (`:71`, `:371`) and the written-out sentences of the bridge wall (`:360-371`), not the function `bridgedRefusal`: it pins the bridge's fixed text, and it does not pin the branch that rule B changes |
| G10 | `test/sshUseActions.test.ts:225-233` (no credential), `test/sshExecAuth.test.ts:185-197` (a woven password), `test/sshExecOver.test.ts:181-190` (the SSH entry's own sealed password), `:192-202` (a circle) — not changed | a refusal that names the entry that was asked for does not change |
| G11 | part B, §3 | a hidden second entry that works stops no call |
| — | the positive controls of part B, §3 | a visible second entry is named as today, and no note is written |
| — | `test/sshConnect.test.ts:265` (not changed) | a `stopped` source that a test builds by hand with no `ownerId`: the Connect road does not read the field |

### 8. Existing tests that change, in the same commit as the fix

The parent's §5.5 lists the tests that change for epic 1 only. Epic 2 has two (F8, note 2):

| Test | Change |
|---|---|
| `test/bridgeLinks.test.ts:74-89`, its control at `:86-87` | on the main port the answer is `['no_credential', SECOND_ENTRY_REFUSED('prod')]`, and the body holds neither `k1` nor `deploy-key`. The bridged half does not change. The name of the test says that the main port reads the fixed sentence |
| `test/bridgeLinks.test.ts:115-129`, its control at `:126-127` | the same answer, for the jump host; the body does not hold `j1` and does not hold `The jump host "jump"`. Do NOT assert that the body does not hold the word `jump`: the fixed sentence holds the words *a jump host*. The name of the test changes in the same way |

The control at `:99-101` (a key that cannot be written) and the control at `:139` (an `ssh` that cannot start) do
not change (note 10).

### 9. Mutation checks (each one must turn the named tests red; restore after each one)

| # | Mutation | Must go red |
|---|---|---|
| 4 | make `agentMayView` answer `true` | L7 (epic 1's), B1, B2, B3, C-B |
| 5 | do not set `second` in `refuseHop` | B2, B5, X5 |
| 5 | do not set `second` in `stoppedAuth` | B1, B6 |
| 9 | take one name off the written list of fields that hold no reference | the scan, with that field |
| 9 | put the text of `said.message` into the note of the chooser; then, apart, put `said.second.id` into it | B4, B7 |
| M-b | `agentRefusal` gives the message back (the no-op of step 10) | B7, B1, B2, B3, C-B |
| M-c | fill `ownerId` with `''` at `sshCredential.ts:80` | X3; the positive control of the visible damaged key |
| M-d | pass no `second` at `sshUseActions.ts:181`; then at `:265`; then at `agentUseActions.ts:407` | B1; B2 and X5 (`exec`); B3 and X5 (`run`) |

### 10. Order of work, and the commits

1. **Step 9.** `test/secondEntryWorld.ts`, the chain in `test/agentSshWorld.ts`, part B. Run part B on the unchanged
   `src` code: it is RED. Save the list. It must be this list and no more: R1 (a), (b), (c), (d); R2 with its 7
   cases. R3 to R6, the scan, row R, the positive controls, G11 and the proofs (proof 5 too: `e1` answers 200 with its own key) are green. Without the own key of `e1` the 7 cases of R2 would be refused at the credential step and would be green by mistake; this list holds only because of proof 5. Compare each failure with
   the parent's §3.1: R1 is B3 with B5 (`sshExecAuth.ts:124-128` → `sshUseActions.ts:181`); R2 on `exec` and on
   `rotate` is B4 with B5 (`sshOptions.ts:153` → `sshUseActions.ts:265`); R2 on `run` is B4 with B6
   (`agentUseActions.ts:407`). A failure that is not on this list goes to the lead before any fix.
2. **Step 10.** The no-op types of §4. `npm run typecheck` is clean; `npm test` shows the failures of step 1 and no
   other.
3. **Step 11.** Rows B1 to B7 and X3 to X6. Watch each RED row fail by its assertion (B1 to B7, X4, X5; X3 and X6 are green with the no-op types). Save each text. The first run of the world also shows proof 5 green: `exec` on `e1` with the default options answers 200. If it does not, the hop rows are not valid, and the world is wrong, not the code.
4. **Step 12.** The fix of §6, the two changed tests of §8, the two assertions of G9, the comments that become
   false.
5. **Step 13, first part.** The mutation checks of §9.
6. `npm run compile`, `npm run lint`, `npm run typecheck`, the changed suites one by one, then `npm test`,
   `npm run contract` with no difference, `npm run ratchet`.

Commits:

- **c1 (optional, to make the work safe against a restart of the machine):** `test/secondEntryWorld.ts`, the chain
  in `test/agentSshWorld.ts`, the no-op types of §4, and X3. The two world files are not suites, the types have no
  reader, and X3 is green. Part B stays in the working tree. Message: `test(agent): the second-entry world and the
  no-op types of rule B`.
- **c2:** the rest of E2.1, one commit. Message: `fix(agent): a refusal names a linked key entry or a jump host only
  when the agent may view it`. Its body quotes one RED failure and the pass, the first failure list of part B, and
  the mutation results.

### 11. Done when

The ten pass criteria of the parent's E2 epic, each one with the place that proves it. The lead ticks each one with
the number that the run shows.

- [ ] **1.** In each of the six rows R1 to R6 the answer holds 0 hidden names and 0 hidden ids (part B).
- [ ] **2.** The 7 cases (B1; B2 at depth 1, 2 and 3; B3 at depth 1, 2 and 3): the body is deep-equal to
      `errorBody('no_credential', SECOND_ENTRY_REFUSED(<entry>))` and the status is 409.
- [ ] **3.** In the same 7 cases the action wrote exactly 1 note (F12); it is the relation line of §6; a search of
      the note for the second entry's name and for its id finds 0 (B4).
- [ ] **4.** The 2 cases with a visible second entry (a jump host; a key entry with a damaged value): the body is
      byte-equal to today's — the whole body is deep-equal to `errorBody('no_credential', m)`, where `m` is the
      message that the real resolver gives on the same world — and 0 notes (the positive controls, green before the
      fix and after it).
- [ ] **5.** On a Remote Bridge the bodies and the notes of the cases that a bridge serves are today's (G9, with
      its two assertions more).
- [ ] **6.** A hidden second entry that works stops 0 calls (G11: 2 cases).
- [ ] **7.** The scan puts each field in one of its two lists, and 0 fields are in neither. On `b15a5410` the
      numbers are 27 fields, 5 scenarios and 22 written names (the parent wrote 25 and 20: note 1). Row R is green.
- [ ] **8.** `agentNaming.ts` has 0 imports (B7). `SshUseDeps` has 9 members and `AgentUseDeps` has 8, as before
      (F19): `git diff b15a5410 -- src_vs_code/src/sshUseActions.ts src_vs_code/src/agentUseActions.ts` adds no line
      inside the two interfaces.
- [ ] **9.** Mutations 4, 5 and 9 each turned at least 1 test red, and the code was restored. M-b, M-c and M-d too.
- [ ] **10.** The *Both* items of the parent's §10 (E2.2 closes them).

And for this story:

- [ ] Part B was written and run before any fix; its first failure list is saved and is the list of §10 step 1, or
      each difference went to the lead.
- [ ] C-B and B1 to B7 were watched failing by their assertions, then pass. No RED proof is a compile error.
- [ ] G9, G10, G11 and the positive controls were watched passing before and after.
- [ ] `git diff --stat b15a5410 -- contract src_mcp src_cli src_broker_client` is empty. The files of *Files with no
      change* have no difference.
- [ ] The budgets of the size table hold; `npm run lint` is clean with no new `eslint-disable`; `npm test` is green.

## E2.2 — the documents and the closing checks

**Depends on** E2.1 (c2). It writes text only; it changes no code and no test.

### What is written

| File | What |
|---|---|
| `src_vs_code/CHANGELOG.md`, under `## [Unreleased]` (`:7`) | one `### Changed — security` entry: rule B, and case 4 of the parent's §3.4 with the old answer and the new one. It names the tools (`creds_exec`, `creds_rotate` on an SSH entry, a linked `creds_run`) and says that `creds exec` in a terminal reads the same sentence (the alias door and the token door). It says what stays: the code `no_credential` and the status 409; the sentence for a second entry that the agent may view; the answers on a Remote Bridge; a hidden key entry or jump host that works is used; a jump host that is gone keeps its own sentence. It says what the journal line holds. It is derived from the diff of c2. The entry of 1.21.1 (`:66-108`) is released text: it is not edited |
| `research/module_extension.md` | (a) in the paragraph *A lookup and a refusal name only what the agent may view* (`:6403-6421`): rule B after rule A — the field `second` on the two failures and who sets it (`stoppedAuth`, `refuseHop`), the chooser `agentRefusal` in `agentNaming.ts`, the two places that ask it (the branch off a bridge in `sshUseActions.ts`, `remoteRefusal` in `agentUseActions.ts`), the fixed sentence, the two relation lines and why the line names a relation and not a name, and what rule B does not hide (the parent's §7). The sentence there that says that such a refusal *is to ask* `agentMayView` gets the present tense. (b) in the paragraph *Agents do not see a protected entry* (`:1328-1336`): the owner of a borrowed key is not named in a refusal to an agent that may not view it. No diagram shows these sentences, so none is drawn again |
| `research/module_tests.md`, the section *A refusal names only what the agent may view* (`:2327`) | part B beside part A: where it is, the command, the six rows, the scan with its two lists (and that it reads a line that holds more than one field), row R, the positive controls, G11, the mutation results. The heading names E2 and rule B too; its first words stay, because `module_extension.md` cites them. The list *What none of this proves* (`:2371-2380`) is the parent's §5.8: the line about a real `ssh` (`:2374`) says that B1 to B3 refuse before anything is started; one line more for note 10 (the path of a borrowed key: a disk-write failure, a run error, and the text that `ssh` prints on a call that answers 200); the scan does not see `PortForward[]`, `CommandArg[]` and `Record<string, string>` |
| `todo/README.md` | the status cells of the parent's row, of the E1 row and of this document's row |

`README.md`, the help files and `POST_DEPLOY.md` get no change (the parent's §6). Checked on `b15a5410`: `grep -c -F`
for `jump host "` and for `cannot be used: its address` over `README.md`, `src_cli/README.md`, `src_mcp/README.md`,
`src_vs_code/README.md` and the `help*.ts` files gives 0 in each. Run it again and say the result.

### The neighbour plans (the parent's §7a)

**E2 writes no boundary row.** Epic 1 wrote one row into each of the six neighbours, and each row names epic 2's
part: the third argument of the refusal function (`PLAN_ssh_exec_own_agent_forwarding.md:10`,
`PLAN_ssh_exec_absolute_program.md:7`), the field `second` on the two failures (`PLAN_askpass_answers_the_hop.md:9`),
`remoteRefusal` (`PLAN_terminal_runs_followups.md:71`, `PLAN_query_refuses_client_commands.md:322`). The login-shell
plan wrote its own row (`PLAN_ssh_line_runs_in_login_shell.md:616`). The two rows of the bridge plan stay OWED (the
parent's entry 1.1); the two bridge files are not edited.

What this story does:

- Read the six rows again. If a row became false by what c2 built, do not repair it: tell the lead.
- Run the parent's method again: `grep -l` over `todo/PLAN_*.md` for `sshUseActions.ts`, `sshExecAuth.ts`,
  `sshOptions.ts`, `sshCredential.ts`, `agentUseActions.ts`, `bridgedRefusal`, `resolveJumpChain`, `stoppedAuth`,
  `refuseHop` and `agentNaming`. On `b15a5410` it gives the plans of the parent's table, the bridge family and the
  two plans that share no line (`PLAN_connect_in_a_remote_window.md`, `PLAN_weave_time_column_choice.md`), and no
  other. A plan that is new on that list goes to the lead.
- If a neighbour was promoted to `research/`, the lead decides what is written there.

### The closing checks (the parent's §4 step 7, again)

Commands 2, 4, 5, 6, 7, 8 and 9 of *Commands*, then command 10. Give the lead, for the pull request body and the
summary: the first failure list of part B against the parent's §3.1; one RED failure and its pass; the mutation
results; the ten pass criteria with their numbers; case 4 of the parent's §3.4; and the notes of the last section
of this document.

### Commit

**c3:** `docs(agent): rule B — the changelog and the module documents`.

### Done when

- [ ] The CHANGELOG entry carries case 4 of the parent's §3.4 and agrees with the diff of c2.
- [ ] The two places of `research/module_extension.md` and the section of `research/module_tests.md` are written;
      no sentence there describes something that does not run.
- [ ] The six neighbour rows were read again; the neighbour search was run again; the two bridge files have no
      difference (`git diff --stat b15a5410 -- todo/PLAN_remote_bridge_scoped.md
      todo/PLAN_remote_bridge_scoped_E1_S3_spec.md` is empty).
- [ ] `plan-lifecycle.mjs` is clean; `pin-check.mjs` passes; each link of the changed files resolves.
- [ ] `npm run typecheck`, `npm test` and `npm run lint` are green with a clean `tsc` read first; `npm run contract`
      leaves no difference; `npm run itest:mcp` is green with no `SKIP`, or the summary says why not and who runs it.

## The order of the commits, and what comes after E2.2

| # | Story | Commit |
|---|---|---|
| c0 | — | this document, with the parent's two lines, the E1 document's status line and the `todo/README.md` rows |
| c1 | E2.1 | the second-entry world and the no-op types (optional) |
| c2 | E2.1 | rule B at the chooser |
| c3 | E2.2 | the documents |

**Before c1: the plan round of this branch.** A `coai` session belongs to one repository and one branch, and its
code round refuses until a plan round of that session reached `proceed`. This branch is new. So the lead runs the
plan round here, with the parent and this document, before the build. A finding of that round that changes a planned
step counts, when it is accepted, as a change of the parent; it would be the second one of epoch 1, and the plan
stops. A finding that this document can satisfy with no change of the parent is not such a change.

After c3, the lead runs the `coai` code round on the finished branch and opens the pull request (the parent's §4
step 13). Its body has case 4 of the parent's §3.4, the verdicts and the number of reviewers that answered. The lead
writes the two pull request numbers (#347 and this one) into the parent's §7a for the two owed rows. Then the
parent, the E1 document and this document are promoted together, with their deviations, in the task that finishes
epic 2 (the parent's §10). No release is part of this epic; the lead and the owner hear that a release of the
extension must follow the merge, and they get the questions of the parent's §2.6 and §11 (N10 included) and note 10 below.

## Notes on the parent, as read on `b15a5410`

The stories above obey the parent as written. These notes are the places where this document had to be more exact
than the parent, or where the parent's text does not agree with the code or with itself. The parent's text was not
changed for them. Each note says how this document judges it; the lead decides, and *in doubt, it is a change*.

1. **The count of fields is 27, not 25** (F7). The parent's §1 (method 3), §5.2 and pass criterion 7 say 25 fields
   and a written list of twenty. Two more `string` fields share a line with other fields. This document makes the
   scan find them and puts them on the written list (22). The rule of the criterion stays: each field is in one of
   the two lists, and 0 are in neither. *Judged: not a change* — a count of a fact of the code that was read wrong;
   the scan becomes stricter, not weaker, and the parent's §10 asks for each criterion *with its observed number*.
   This is the note that the lead must look at first: if the lead counts it, it is the second change of epoch 1,
   and the stop comes before any code.
2. **Epic 2 changes two existing tests, and the parent's §5.5 lists epic 1 only** (F8). The two controls pin the
   very sentences that rows B1 and B2 replace. *Judged: not a change* — the tests follow the code that the plan
   orders.
3. **Part B cannot run each row over the storage of `test/agentSshWorld.ts`** (the parent's §5.2, first sentence;
   F6). The rows that open a stored value use the real `StorageManager`, the way `test/bridgeLinksWorld.ts` does;
   the gate world serves the rows that read nodes only. And B1 and B2 are in `test/sshUseActions.test.ts` as the
   parent says, but over the new world, because that file's own world replaces the resolver (F5). *Judged: not a
   change* — the wiring of a test; the scenarios are the parent's.
4. **The refusal function has a third user** that B5 does not list (F2). It is reached on a bridge only and needs
   no edit. *Judged: not a change* — a repaired reference.
5. **`sshOptions.ts:112`.** B4 names the type at `:104` only; the private type `Refusal` needs the field too (F3).
   *Judged: not a change* — wording.
6. **The no-op of step 10 and `noUnusedParameters`** (F4). The two parameters that the no-op does not read start
   with `_` until the fix. *Judged: not a change*.
7. **Lines that moved** (F1). Only `agentUseActions.ts`, by 7 lines. *Judged: not a change* — repaired references.
8. **G9 and the linked run.** G9 says that on a bridge *every refusal of B1-B3 is still `BRIDGE_USE_REFUSED`*. For
   B3 a bridge answers `BRIDGE_NOT_SERVED` before the link is read (F10). Pass criterion 5 says it right: *the cases
   that a bridge serves*. *Judged: not a change* — wording.
9. **The relation line in a linked run.** The line starts with the name of the addressed entry, which is the
   Terminal entry (F11): `deploy: a jump host in its chain …`. The chain and the key belong to the SSH entry that
   `deploy` runs over. The person opens the Terminal entry, then its SSH entry. This document builds the line as the
   parent's §2.5 writes it. *Judged: not a change.* Another line for a linked run would be a change of §2.5, and it
   would count.
10. **Sites that the parent does not list: the path of a borrowed key reaches the agent in three ways.** The file of a
    key that a call writes to disk is named `<storageDir>/keys/<keyEntityId>-<uuid>.key`
    (`sshExecAuth.ts:154`; `keyInstaller.ts:158-160`). `keyEntityId` is the id of the entry that owns the key. So,
    when the key is borrowed from an entry that the agent may not view, each path that shows the file name gives
    the agent the ID of that entry and a path of the person's computer.
    - **(a) A key that cannot be written.** The refusal is `Could not write the stored key to disk: <the error of
      the operating system>` (`sshExecAuth.ts:157`), with the code `internal`. The error holds the path. Off a
      bridge the sentence reaches the agent as it is (`sshUseActions.ts:180-181`); `test/bridgeLinks.test.ts:99-101`
      pins that the main port says it, with the path.
    - **(b) A run error.** `sshUseActions.ts:274` gives `Could not run ssh: ${describeError(error)}`. The argv of
      `ssh` holds `-i <storageDir>/keys/<keyEntityId>-<uuid>.key` (`sshExecCommand.ts:160`), and an error of the
      start can carry the argv and the path. The test at `test/bridgeLinks.test.ts:131` says so in its name. Off a
      bridge the sentence reaches the agent as it is (`:139` pins the start of it).
    - **(c) The text of `ssh` on a 200 answer.** The standard error of `ssh` comes back in the answer. It can show
      the path, for example `Load key "<path>": invalid format`. NOT checked with a real `ssh`.
    - **The id is not always an opaque id.** An imported vault can carry ids of its own shape. `SAFE_ID`
      (`idQuarantine.ts:41`) accepts, for example, `deploy-key`, and `safeFileComponent` keeps it. So a name-like id
      of a hidden key entry can reach the agent, and then it tells almost as much as a name.

    On a bridge (a) and (b) are closed already (`BRIDGE_USE_REFUSED`); (c) is not: a bridge gets the text of `ssh`
    as it is, by the decision that `test/bridgeLinks.test.ts:171` pins. **Not built here.** *Judged: nothing changes
    while it is not built. To build it in E2 is a counted change*: each one is a new site, and the journal line of
    §2.5 has no true relation line for a disk failure or a run error. It goes to the owner as its own small item,
    with a priority above N8 (the parent's N10): build it as its own item, or stop the plan and take it in. After
    epic 1 the id answers `not_found` to each call, and the parent's §7 says that rule B does not hide that a second
    entry exists.
11. **The branch.** The parent's status block says that the two epics are on
    `fix/agent-refusal-names-unlisted-entry`. That branch was merged with #347. Epic 2 is on
    `fix/agent-refusal-names-second-entry`, from `main` at `b15a5410`. *Judged: not a change* — the plan gives each
    epic its own pull request.
12. **"The journal has exactly 1 new note"** (pass criterion 3). It is counted on the lines that the ACTION writes
    (`deps.note`). The broker's own line for the call is there before and after, with the status only (F12).
    *Judged: not a change* — wording.
13. **Who writes.** The parent says that Opus writes each stories document. A Fable session wrote this one, as a
    security judgement, outside the quota, and it marks no cornerstone. *Judged: not a change* — it is the role
    table of `subagent-models.md`, and the E1 document was written the same way.
14. **The pull request number of the owed rows.** The parent's §7a says that the two owed bridge rows are *named
    with this plan's pull request number when it exists*. #347 exists, and §7a does not hold it. The lead writes
    it, with E2's number. *Judged: not a change* — a progress fact.
15. **Rows and checks of this document that the parent does not have:** X3, X4, X5, X6, M-b, M-c, M-d, the third
    positive control, the two assertions more of G9, and the cases (b), (c), (d) of R1 and the `rotate` case of R2.
    X5 (a hidden unsafe hop at depth 4) and X6 (a chain of 5 hops, the depth cap) are own rows: they test a site of
    the parent's §3.1 and add no site. Each of the others also tests a site of §3.1 and adds none. *Judged: not a
    change*.
16. **Reviews of these stories.** The lead's own Opus review and the `coai` plan round (session `dbe7d8d4`, verdict
    `proceed`, 2 of 2 reviewers, 5 findings rejected with reasons) and the cadence consultation (closed, solved) ran
    on `d4cee7e8`. The changes of this version of the document came from them: the own key of `e1` in the world, the
    whole-body positive controls, the depth 4 and 5 rows (X5, X6), the complete note 10, the wording of the scan, the
    line of G9 for `bridgeReferences.test.ts`, the words on R6 and on F14, and the exact outcomes of X4. *Judged: not
    a change* — each one is the wording or the wiring of a test; none adds a site.
