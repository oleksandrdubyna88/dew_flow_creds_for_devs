# PLAN — An agent's refusal never names an entry or a folder that the agent may not view

> Status: **plan only, nothing implemented yet, 2026-11-11.** The owner said yes on 2026-11-09 to fix this as its own
> item. Scope: the extension only (`src_vs_code/src`: the entry lookup, the folder lookup, the SSH refusals, their
> tests), `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md`, `todo/README.md`.
> One epic, one pull request, on `fix/agent-refusal-names-unlisted-entry` from `main` at `360d45b7` (extension 1.21.0).
> Found as F7: item 7 of §16 of
> [PLAN_terminal_command_over_ssh_E3_S2_security.md](../research/PLAN_terminal_command_over_ssh_E3_S2_security.md).
> Security fix for a defect that is live on `main` and in the released 1.21.0. This text is the spec: a Sonnet coder
> builds from it, an Opus reviewer reads the result against it. All `file:line` references were read on `360d45b7`.

## 1. The defect

An agent gets a list of the entries and folders that a person opened to it (`creds_list`, `creds_folders`). The
product promises that all other entries are invisible to the agent (`README.md:174-176`). That promise is broken in
five places. In each place an answer of the broker tells the agent the NAME of a node that was never in its list, or
tells it that such a node exists.

**D1, the finding F7.** A use call carries an entry id (`creds_exec`, `creds_query`, `creds_run`, `creds_rotate`,
`creds_vpn_up`, `creds_vpn_down`, `creds_open_terminal`, `creds_export_env`, `creds_delete`). The lookup is
`findUsableEntry` (`mcpEntries.ts:344-356`). Its verdict comes from `verdictFor` (`mcpEntries.ts:422-436`). That
function reads the rung of the action (`use`, `edit` or `delete`). It does not read `view`. So it answers `closed`,
with the node, for each entry that exists and is not usable. `mcpUseLookup` copies the node's name into the answer
(`mcpHooks.ts:161-163`). `refusalFor` puts the name into the sentence (`brokerRequests.ts:209-217`):
`"<entry name>" is not open to agents for that. Turn on "<switch>" in its Agent access section.` An id that does not
exist gets `No such entry, or this window does not serve it.` (`brokerRequests.ts:216`). So an agent that guesses an
id, or keeps an id from an older list, learns that the entry exists and learns its name. This is true for an entry
with no switch at all, for an entry that a person closed again, and for an entry in the Trash (the Trash gives no
access, `mcpAccess.ts:304-317`, so the verdict is `closed` there too). The sentence has been in the product since
0.70.0 (`src_vs_code/CHANGELOG.md:4089`).

**D2, the same defect for folders.** `findFolder` (`mcpFolders.ts:132-145`) answers `usable` or `closed` for every
folder id, also for the Trash and for a folder in the Trash. `closedAnswer` (`mcpFolderHooks.ts:111-117`, called at
`:92`) names the folder: `"<folder name>" is not open to agents for that. …`. This is on `creds_create_folder` (the
`parent` id), `creds_edit_folder` and `creds_delete_folder`. Folders are on the agent surface since 0.85.0
(`research/module_extension.md:6196`).

**D3, the destination of a move.** `moveRefusal` (`mcpFolders.ts:191-212`) answers `no_such_destination` for an id
that is not a folder. For a folder that the agent may not view it answers `destination_closed` or `into_the_trash`.
The sentences (`mcpFolders.ts:257-265`) do not name the destination. But the two answers are different, so the agent
learns that the folder exists, and that it is in the Trash.

**D4, a linked key.** An SSH entry can use the key of a second entry (`sshKeyEntityId`, `types.ts:76`). When the
second entry has a PIN of its own, the automatic opener refuses its value with a sentence that names the OWNER of the
value (`pinGate.ts:186-191`). `resolveSshCredential` keeps the owner's name (`sshCredential.ts:80`, `:102`), and
`stoppedAuth` passes the sentence on (`sshExecAuth.ts:125-128`). Off a Remote Bridge the sentence reaches the agent as
it is (`sshUseActions.ts:127-135`, `:181`). A PIN-protected entry is hidden from agents by design
(`mcpEntries.ts:111-113`; `README.md:139-140` says that it *disappears from every agent-facing surface*). So
`creds_exec` on a connection that borrows such a key tells the agent the name of a hidden entry.

**D5, a jump host.** An SSH entry can go through a second entry (`jumpHostEntityId`, `types.ts:84`). `refuseHop`
names the hop: `The jump host "<hop name>" cannot be used: its address is not a valid host.` (`sshOptions.ts:153`).
The sentence reaches the agent at `sshUseActions.ts:265` (`creds_exec`, and a linked `creds_run` through
`execOverSsh`) and at `agentUseActions.ts:400` (the linked `creds_run`, before the trust check).

On a Remote Bridge D4 and D5 are closed already: `bridgedRefusal` gives one sentence and writes the real one to the
journal (`sshUseActions.ts:118-135`). D1 is closed in part there: `closedIn` (`bridgeScope.ts:175-177`) drops a `closed`
answer for an id out of scope, but keeps it for an id in scope, also when that entry is no longer visible to agents.
This is the shape that `security.md` calls *a measure applied at SOME of its sites*.

**How the sites were found (the method).** (1) `grep -n "kind: 'closed'"` and `grep -n "kind === 'closed'"` over
`src_vs_code/src/*.ts`: two producers (`mcpEntries.ts:435`, `mcpFolders.ts:156`), one re-map (`mcpHooks.ts:162`), four
readers (`brokerRequests.ts:210`, `mcpHooks.ts:161`, `bridgeScope.ts:171`, `mcpFolderHooks.ts:91`). (2) `grep -n` for
every caller of `refusalFor`, `findUsableEntry`, `findFolder`, `moveRefusal`, `closedAnswer`, `describeMoveRefusal`.
(3) `grep -n 'EntityId?:\|dependsOn' types.ts`: five reference fields (`sshKeyEntityId` `:76`, `jumpHostEntityId`
`:84`, `vpnLauncherEntityId` `:115`, `sshEntityId` `:172`, `dependsOn` `:282`); for each one, every sentence that an
action can answer was read. (4) `grep -n 'Name}\|\.name}'` over the action modules (`useActions.ts`,
`agentUseActions.ts`, `sshUseActions.ts`, `sshExecAuth.ts`, `sshCredential.ts`, `sshOptions.ts`, `rotateAction.ts`,
`mcpCreate.ts`, `mcpSnippetRoute.ts`, `brokerFolderDoor.ts`, `brokerReadRoutes.ts`, `brokerMcpRoutes.ts`,
`brokerCall.ts`, `vpnRun.ts`), each hit read. NOT done: a scan of every sentence in the product (522 quoted-name
templates in 140 files, the help files not counted). §5.1 adds a test that does not depend on such a scan.

## 2. The rule, decided

### 2.1 Words

- **The agent may view a node** when the node is in the list that the agent gets. This plan adds no second
  definition. For an entry the function is `shown` (`mcpEntries.ts:278-280`): the node is an entry, `view` is on after
  the ladder and the folder walk (nothing in the Trash has `view`), and the entry has no PIN of its own. For a folder the function is `isOpenFolder`
  (`mcpFolders.ts:84-89`): the node is a folder, it is not the Trash, it is not in the Trash, and `view` is on.
- **The addressed node** is the node whose id the request carries (`entry`, `folder`, the `parent` of a new folder,
  the `parent` of a move).
- **A second entry** is an entry that a call reads through a reference field of the addressed entry.

### 2.2 The rule

**An answer of the broker names an entry or a folder, or says that it exists, only when the agent may view it.**

- **Rule A, the addressed node.** When the agent may not view the addressed node, the answer is the answer of an id
  that does not exist. This is true for every action and for every door.
- **Rule B, a second entry.** When a refusal would name a second entry that the agent may not view, the agent reads
  one fixed sentence that names the addressed entry only. The error code stays. The real sentence goes to the agent
  journal.

Each rule is applied at one place, not at each sentence. Rule A is in the two lookups, so a caller cannot get a node
that the agent may not view. Rule B is in one chooser that all such sentences pass.

Nothing changes for a node that the agent may view. An entry with `view` on and `use` off keeps the sentence that
names it and its switch. That sentence is the reason for the three-answer lookup (`brokerRequests.ts:85-96`), and it
stays.

**No usable verdict is lost.** Each rung turns on the rungs below it (`climb`, `mcpAccess.ts:244-268`), and
`resolveMcpInTree` gives the climbed access (`:299-327`). So an entry that is usable for an action always has `view`.
Guard row G3 of §5.3 pins this.

### 2.3 The answers, exact

| # | Case | HTTP | `error.code` | `error.message` |
|---|---|---|---|---|
| A-entry | An entry id that the agent may not view, on every use action and on delete | 404 | `not_found` | `No such entry, or this window does not serve it.` |
| A-folder | A folder id that the agent may not view (`folder`, or the `parent` of a new folder) | 404 | `not_found` | `No folder with id "<the id that was sent>" is open to you. Call creds_folders again.` |
| A-move | A move whose destination the agent may not view | 403 | `denied` | `"<the folder that was to move>" was not moved: there is no folder with that id.` |
| B | A refusal that would name a second entry that the agent may not view | the status of the code (today 409) | the code of the refusal that it replaces (today `no_credential`) | `"<the addressed entry>" could not be used: another entry that it needs (a linked key or a jump host) stopped the call, and that entry is not visible to agents. The reason is in the agent journal on this computer.` |

Rows A-entry, A-folder and A-move are not new sentences. Each one is the sentence that the same route gives today for
an id that does not exist (`brokerRequests.ts:216`, `mcpFolderHooks.ts:89`, `mcpFolders.ts:259`). Row B is new; its
name is `SECOND_ENTRY_REFUSED`.

**What the agent reads through `creds-mcp`.** `creds-mcp` reads `not_found` as *this window does not have the entry*
and asks the next window (`src_mcp/src/Windows.cs:141-161`). When no window answers otherwise, it says its own
sentence. So for A-entry the agent reads `No CredsForDevs window answered for that entry.` with the hint `The entry id
may be stale — call creds_list again. …` (`src_mcp/src/UseTools.cs:277-284`; for rotate `:413-418`). For A-folder it
reads `No CredsForDevs window answered.` with the hint `The folder id may be stale — call creds_folders again.`
(`src_mcp/src/FolderTools.cs:158-165`). A-move and B are passed on as they are, with the hint of their code
(`UseTools.cs:498-510`). `creds-mcp` does not change, and an older `creds-mcp` gives the same result.

### 2.4 What "the same answer" means, item by item

For rule A, a node that the agent may not view and an id that does not exist are compared on each thing that the
agent can observe.

| Item | Result | Why |
|---|---|---|
| HTTP status, error code, message, body length | equal, byte for byte | the lookup gives the same value, `undefined`, in the two cases; one expression builds the body from it |
| The hint of `creds-mcp` | equal | the hint comes from the code, or from the fall-through, and the two are equal |
| The walk over the windows | equal | `not_found` goes on to the next window in the two cases |
| The throttle | equal: no slot | the lookup refuses before `admit` (`brokerMcpDoor.ts:210-214`, `:288-292`; `brokerFolderDoor.ts:137-141`) |
| A grant, a consent dialog, a remembered consent | equal: none | a grant is minted after `admit` only |
| The journal | equal: no line | a refusal with no grant writes no line (`credsAgentServer.ts:734-747`) |
| On a Remote Bridge | equal to an id out of scope | the wall gets `undefined` from the real lookup and passes it on (`bridgeScope.ts:167-172`) |
| Time | the same class; NOT measured | see below |

**Time: what is true.** The two cases run the same synchronous code with no file read, no network, no `await`, no
dialog and no journal write. They are not equal to the instruction. For a node that exists, the lookup also walks the
folders above it (at most 64 steps in memory, `mcpAccess.ts:536`). This plan does not measure the difference and does
not remove it. It is recorded as a residue in §8.

### 2.5 What the person sees

- **Rule A.** The person sees what they see today. A lookup refusal writes no journal line today, for `closed` and
  for `not_found` (`credsAgentServer.ts:734-747`), and it writes none after this plan. The person reads the true
  state in the tree: the entry's Agent access section and its badge. This plan does NOT add a journal line for
  rule A, for three reasons. The lookup is before the throttle, so the number of lines would have no limit
  (`credsAgentServer.ts:223-227` gives this reason for unknown tokens). A line for a node that exists would be an
  effect that an id that does not exist does not have. And the journal is a file: the line would write the hidden
  name where a local process can read it.
- **The linked run's journal line stays exact.** The gate of a linked `creds_run` writes the real reason to the
  journal (`agentUseActions.ts:209-212`, `:307-314`). Its two sentences do not change (site A4).
- **Rule B.** The journal gets the real sentence, as on a Remote Bridge today:
  `<entry name>: <the real sentence> (the agent was told only that another entry stopped the call)`.

## 3. The sites

### 3.1 Sites that change

| # | Site | Today | New behaviour |
|---|---|---|---|
| A1 | `mcpEntries.ts:422-436` `verdictFor`, called by `lookedUp` (`:380-391`) | resolves the access, reads the rung of the action, answers `usable` or `closed` with the node | resolves the access once, then asks `shown(node, resolved)` (`:278-280`) before the rung; not shown → `undefined`. `lookedUp` keeps only the test for a missing node; the PIN test at `:387` is inside `shown` |
| A2 | `mcpFolders.ts:132-145` `findFolder` | each folder id → `verdictFor` → `usable` or `closed` | asks `isOpenFolder(node, byId)` (`:84-89`) first; not open → `undefined` |
| A3 | `mcpFolders.ts:191-212` `moveRefusal`, `firstRefusal`; the type `:172-176`; the sentences `:257-265`; `isTrashy` `:218-220` | a folder destination → `into_the_trash`, `into_itself` or `destination_closed`; not a folder → `no_such_destination` | not a folder, or not `isOpenFolder` → `no_such_destination`. `into_the_trash` cannot be reached then: the variant, its sentence and `isTrashy` are removed. The order that stays: `into_itself`, then `destination_closed` |
| A4 | `agentUseActions.ts:230-238` `whyUnusable`, `usableGate` | the JOURNAL reason is chosen by `found === undefined` (the PIN sentence) or `closed` (the switch sentence) | after A1, `undefined` also means *not visible*. `usableGate` reads the SSH entry's node once more, in the Terminal entry's account only, and `whyUnusable` gives the PIN sentence when the node is missing or `hiddenFromAgents(node)`, else the switch sentence. The two sentences do not change. Nothing that the agent reads changes |
| B1 | `sshCredential.ts:36-41` `SshCredentialStopped`; `:80`, `:102` | carries `reason` and `ownerName` | also carries `ownerId` (the id of `keySource` at `:80`, of `owner` at `:102`) |
| B2 | `sshExecAuth.ts:40-45` (the failure of `ExecAuth`), `:125-128` `stoppedAuth` | the message names the owner of the value | the failure gains `names?: string`: the owner's id, set when the owner is not the entry that was asked for |
| B3 | `sshOptions.ts:104` `JumpChain`; `:144-154` `refuseHop` | `:153` names the hop | the failure gains `names?: string`: the hop's id, at `:153` only. `:132`, `:137` and `:148` name the starting entry and set nothing |
| B4 | `sshUseActions.ts:127-135` `bridgedRefusal`; its callers `:181`, `:265`, `:274` | on a bridge: the bridge sentence and a note. Off a bridge: every sentence as it is | on a bridge: as today. Off a bridge: the chooser of B6. The callers at `:181` and `:265` pass `names` |
| B5 | `agentUseActions.ts:398-403` `remoteRefusal` | `fail('no_credential', chain.reason)` | the chooser of B6, and its note through `deps.note` |
| B6 | new module `agentNaming.ts` (no `vscode`); `mcpEntries.ts` exports `agentMayView(node, byId)` | — | `agentMayView` is `shown` over one resolve. The chooser takes the sentence, `names`, the addressed entry's name and a lookup. `names` absent, or that entry viewable → the sentence as it is. Else → `SECOND_ENTRY_REFUSED(name)` for the agent and the note of §2.5 for the journal |

Rule B asks about the SITE, not about the value. `names` is set whenever the owner or the hop is another entry,
whatever the sentence says. A new sentence at these sites is then covered with no new decision.

### 3.2 Sites that change by construction (no edit)

| Site | Today | After |
|---|---|---|
| `mcpHooks.ts:157-163` `mcpUseLookup` | copies `found.node.name` into a `closed` answer | gets `closed` only for an entry that the agent may view |
| `brokerRequests.ts:150-157` `usable`, `:209-217` `refusalFor` | names `found.entityName` | the text does not change; a name arrives only for an entry that the agent may view |
| `mcpFolderHooks.ts:87-93` `choose`, `:111-117` `closedAnswer` | names `found.node.name` | a folder that is not open takes the `not_found` branch at `:88-90` |
| `mcpFolderHooks.ts:134-137` | `describeMoveRefusal(refusal, node.name)` | the destination is decided in A3 |
| `bridgeScope.ts:167-177` `scopedLookup`, `closedIn` | keeps `closed` for an id in scope | an entry in scope that the agent may not view is `undefined`, as an id out of scope |

### 3.3 Sites that were checked and are safe

| Site | Why it is safe |
|---|---|
| `bridgeScope.ts:242-251` `outOfScopeAnswer` (`:244`, `:248`) | it calls `refusalFor(undefined)`; no name can arrive |
| `brokerRequests.ts:192-200` `aliasTarget` | one sentence for a name that is not enabled and for no registry; it repeats only the alias that the caller sent |
| `mcpEntries.ts:241-257` `visibleConfigDetails`; `mcpSnippetRoute.ts:85` | one `undefined` and one sentence for not found, not visible and not a config |
| `mcpCreate.ts:94-118` `creatableFolders`, `:134-204` `chooseTarget`, `describeChoice` | lists only folders that are open for creating (so `view` is on, and none is in the Trash); repeats only the folder name that the caller sent |
| `agentUseActions.ts:196-198` `linkedRunRefused`; `:235-247` | one sentence for every reason; it names the Terminal entry only |
| `brokerCall.ts:178-187` | the agent reads the granted entry's name; the second entry's name is in the journal detail only |
| `agentUseActions.ts:635-672` (VPN start and stop) | `"<entry>" could not be started — see the notification.`; the launcher (`vpnLauncherEntityId`) and the chain (`dependsOn`) are named to the person only |
| `rotateAction.ts:240-351`; `agentUseActions.ts:491-619` (export, query) | each sentence names `ctx.entityName` only |
| `sshOptions.ts:132`, `:137`, `:148`; `sshExecAuth.ts:55-64`, `:133` | each names the entry that was asked for |
| `bridgeScope.ts:262-282` (`REFERENCE_REFUSED`, `AGENT_FORWARD_REFUSED`, `BRIDGE_USE_REFUSED`) | each names the entry of a grant; a grant is minted for a usable entry only |

### 3.4 What changes for an agent or a script (the contract, said explicitly)

No route, no error code, no status, no body shape and no tool description changes. `contract/broker-v1.json` and
`contract/mcp-tools-v1.json` do not change, and `src_mcp` does not change. What changes is WHICH of two existing
answers one request gets, in these cases:

1. A use call or a delete on an entry that the agent may not view: `denied` (403) with the entry's name → `not_found`
   (404). Through `creds-mcp`: the *no window answered* sentence of §2.3.
2. A folder verb on a folder that the agent may not view: `denied` (403) with the folder's name → `not_found` (404).
3. A move to a destination that the agent may not view: the *closed* or the *Trash* sentence → the *no folder with
   that id* sentence. The code stays `denied`.
4. `creds_exec` and a linked `creds_run` whose key entry or jump host is not visible to agents and stops the call: the
   sentence that names that entry → `SECOND_ENTRY_REFUSED`. The code stays. This is true on the alias door and on the
   token door too (`creds exec` in a terminal), because an action does not know its door.
5. The sentence `the Trash is not a destination; deleting is its own call` is gone. An agent can name the Trash only
   by an id that was never in its list.

No documented answer of an MCP tool changes: no tool description says what a call on an unlisted id answers (checked:
`contract/mcp-tools-v1.json` was searched for `not open`, `switch`, `Trash`, `refus`, `stale`, `closed` and `no such`,
and each hit was read). By this
repository's own practice, a changed answer on a shipped road is named: the CHANGELOG entry and the pull request body
carry the five cases above.

## 4. Build order

1. **The class test first** (§5.1), before any fix. Its first failure is the list of leaks. Compare the list with
   §3.1. A leak that is not in §3.1 and has the shape of rule A or rule B gets a row here, as a recorded deviation. A
   leak of another shape stops the work: it is a plan change.
2. **RED rows of rule A** (§5.2, L1-L5). They need no new name, so they compile on `main`'s code. Watch each one fail
   by its assertion. Keep the messages.
3. **Fix A1, A2, A3.** Change the three existing tests of §5.4 in the same commit as the code that they follow.
4. **A4.** After A1 the guard row G5 is red (§5.3). Watch it. Then change `whyUnusable`. G5 and G6 are green.
5. **The no-op types of rule B**, with no reader: `names?` on the two failure types, `ownerId` filled at its two
   sites, the export of `agentMayView`, the constant `SECOND_ENTRY_REFUSED`. `npm run typecheck` is clean and
   `npm test` is green. This step exists because `npm test` runs `tsc` first: a test that names a missing symbol
   fails to compile, and a compile error is not a RED proof.
6. **RED rows of rule B** (§5.2, B1-B6). Watch each one fail by its assertion.
7. **Fix B2-B6.**
8. **The mutation checks** of §5.5.
9. **Documents** (§6).
10. `npm run typecheck`, `npm test`, `npm run lint`, in `src_vs_code`, at lowered priority. `npm run contract` leaves
    no difference in `contract/`. `npm run itest:mcp` where `creds-mcp` is built (§5.6).
11. The `coai` code round on the finished branch, then the pull request. Its body has the five cases of §3.4, the
    verdicts and the number of reviewers that answered.

One file of the suite runs through the same runner: `npm run compile`, then
`node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`. Read the exit of `tsc`
before any result.

## 5. Test plan

### 5.1 The class test: `src_vs_code/src/test/agentNamesOnlyViewable.test.ts` (new)

Its fixture is a vault in which each node has a marker name of its own (`MARK-<id>`), in a helper file that is not a
suite (`test/unlistedWorld.ts`). The nodes that the agent may not view, each for a different reason:

- entries: no switch anywhere; an explicit empty answer (`mcp: {}`) inside an open folder; in the Trash with all
  switches on; a PIN of its own with all switches on;
- folders: no switch; an explicit empty answer under an open folder; in the Trash; the Trash itself;
- second entries: a key entry with a PIN and a stored value that the automatic opener refuses; a jump host with no
  switch and an address that `isSafeSshTarget` refuses.

The nodes that the agent may view: an entry with `view` only; an entry with `use`; an entry with `delete: 'own'`
that a person made; a folder with `view` only; a folder with `folderEdit`.

**Part A, the addressed node, at the door.** The real broker (`world` of `test/brokerWorld.ts`) with the real
`mcpUseLookup` (`options.mcpResolve`) and the real `folderHooks` (`server.setFolderHooks`) over the fixture. The list
of routes is DERIVED from `BRIDGE_ROUTES` (`bridgeAllowList.ts:91-96`, built from the contract's vocabulary): each
`POST` route under `/v1/mcp/` and `GET /v1/mcp/config-snippet`. For each route and each hidden node, the test sends
the hidden id and a made-up id of the same shape. It asserts: the two answers are deep-equal (status and body, after
each value that the request itself sent is replaced by a placeholder); and no hidden marker is in the body. The two
list routes (`GET /v1/mcp/entries`, `GET /v1/mcp/folders`) are read once: no hidden marker in the body, with ONE
written exception, `entries[].dependsOn` (§11, N1), which carries its reason in the test.

**Part B, a second entry, at the action.** The list of reference fields is DERIVED: the test reads `types.ts` and
collects each `…EntityId?:` field and `dependsOn`. For each field it has a scenario that makes the real action refuse
because of the second entry, over the storage of `test/agentSshWorld.ts`, and it asserts that the answer holds no
hidden marker: `sshKeyEntityId` and `jumpHostEntityId` through `sshExecAction`; `jumpHostEntityId` and `sshEntityId`
through `terminalRunAction` (a linked run); `vpnLauncherEntityId` and `dependsOn` through `vpnAction` with a start
that fails.

**Completeness: the test must not become empty.** (1) A route of `BRIDGE_ROUTES` under `/v1/mcp/` that the test has no
request for fails the test, with the route's name. (2) A reference field that the scan finds and the test has no
scenario for fails the test, with the field's name. (3) The companion assertion: the scan finds at least the five
fields that are known today, so a change of formatting in `types.ts` cannot make it match nothing. (4) One positive
control per part, on the same fixture: a node that the agent may view IS named in its refusal (part A: the entry with
`view` only, on `exec`; part B: a jump host with `view` on). A file of negative assertions needs it.

**One row on a Remote Bridge** (the helpers of `test/bridgeWallWorld.ts`): an entry in scope that the agent may not
view gets the answer of an id out of scope, deep-equal.

### 5.2 RED rows

Each row is watched FAILING on the unchanged code, by its assertion, then passing. The failure texts below are what
the code on `360d45b7` must give; the coder records what the runner printed.

| # | File | Input | Today, so the row is RED | After |
|---|---|---|---|---|
| C-A | the class test, part A | each `POST /v1/mcp/…` route with each hidden id | 403 `denied`, e.g. `"MARK-e-none" is not open to agents for that. Turn on "Usable by agents" in its Agent access section.` against 404 `not_found` for the made-up id | deep-equal |
| C-B | the class test, part B | `sshKeyEntityId` and `jumpHostEntityId` scenarios | the body holds `MARK-key`, `MARK-jump` | no marker |
| L1 | `mcpEntries.test.ts` | `findUsableEntry` on each of the three hidden entries that have no PIN, for `exec`, `rotate`, `delete` and an unknown verb | `{ kind: 'closed', … }` is not `undefined` | `undefined` |
| L2 | `mcpHooks.test.ts` | `mcpUseLookup` on the same | `{ kind: 'closed', entityName: 'MARK-…', needed: 'use' }` | `undefined` |
| L3 | `mcpFolders.test.ts` | `findFolder` on the four hidden folders, for `create`, `edit`, `delete` and an unknown verb | `{ kind: 'closed', … }` | `undefined` |
| L4 | `mcpFolders.test.ts` | `moveRefusal` to a destination with no switch, and to one with `mcp: {}` | `'destination_closed'` is not `'no_such_destination'` | `'no_such_destination'` |
| L5 | `mcpFolders.test.ts` | `moveRefusal` to the Trash, and to a folder in the Trash | `'into_the_trash'` is not `'no_such_destination'` | `'no_such_destination'` |
| B1 | `sshUseActions.test.ts` | `ssh:exec` on a usable entry whose key entry has a PIN | the message holds the key entry's name (`"MARK-key" is protected with its own PIN, so it cannot be used automatically. …`) | `SECOND_ENTRY_REFUSED('<entry>')`, code `no_credential` |
| B2 | `sshUseActions.test.ts` | `ssh:exec` on a usable entry whose jump host is not visible and has an unsafe address | `The jump host "MARK-jump" cannot be used: its address is not a valid host.` | the same sentence as B1 |
| B3 | `agentSshGate.test.ts` | a linked `creds_run` whose SSH entry is usable and whose jump host is as in B2 | the same sentence as B2 today, through `agentUseActions.ts:400` | the same sentence as B1 |
| B4 | `sshUseActions.test.ts`, `agentSshGate.test.ts` | B1, B2, B3 | no journal note | the note holds the real sentence and the words of §2.5 |
| B5 | `sshOptions.test.ts` | `resolveJumpChain` with an unsafe hop | `names` is `undefined` | the hop's id; the cycle, the depth and the missing-hop refusals keep `names` `undefined` |
| B6 | `sshExecAuth.test.ts` | `resolveExecAuth` with a stopped value of a key entry, and of the entry itself | `names` is `undefined` | the key entry's id; `undefined` when the owner is the entry itself |

For B1 and B2 the fixture is proved first, in the test: the same entry with the PIN taken off the key entry (B1), or
with a safe address on the hop (B2), gets past the refused step. A fixture that the code declines for another reason
would make the row pass for the wrong reason.

### 5.3 Guard rows (watched passing before and after)

| # | What it guards |
|---|---|
| G1 | An entry with `view` on and `use` off keeps the `closed` verdict (`mcpEntries.test.ts:345-361`, `:519-526`), and its refusal keeps its name and `Usable by agents` (the positive control of part A) |
| G2 | The own-only delete scope: a person's entry under `delete: 'own'` stays `closed` and named (`mcpEntries.test.ts:324-334`) |
| G3 | No usable verdict is lost: for `use`, `edit`, `create`, `delete: 'any'` and `delete: 'own'` on an agent-made entry, each set alone, the verdict of its action stays `usable` (new, in `mcpEntries.test.ts`) |
| G4 | A folder with `folderEdit` on and no delete scope keeps `closed` for delete (`mcpFolders.test.ts:130-139`); a destination with `view` only keeps `destination_closed` (new) |
| G5 | The journal of the linked run names the switch for an SSH entry with no switch at all (`agentSshGate.test.ts:237-251`). Red after A1 alone, green after A4 |
| G6 | The journal of the linked run says the PIN sentence for a protected SSH entry (`agentSshGate.test.ts:253-266`); no read in another account (`:268-285`) |
| G7 | On a Remote Bridge every refusal of B1-B3 is still `BRIDGE_USE_REFUSED` with its own note (`bridgeLinks.test.ts`, `bridgeReferences.test.ts`) |
| G8 | A refusal that names the entry itself does not change: no credential (`sshUseActions.test.ts:225`), a woven password (`sshExecAuth.test.ts:185`) |
| G9 | A jump host that the agent may view is named as today (the positive control of part B) |
| G10 | An entry with a PIN of its own answers `undefined` to a direct lookup, as today (new, beside L1; the fourth hidden entry of the fixture) |

### 5.4 Existing tests that change, and why

| Test | Change |
|---|---|
| `mcpFolders.test.ts:155-168` *a move needs the grant at BOTH ends* | its closed destination gets `mcp: { view: true }`: visible, no `folderEdit`, so the answer stays `destination_closed` and the test keeps its meaning. The case with no switch is L4 |
| `mcpFolders.test.ts:170-178` *a move into the Trash is refused* | the answer is `'no_such_destination'`; the name of the test says that the Trash reads as no folder |
| `mcpFolders.test.ts:200-206` *every refusal has a sentence* | its list loses `'into_the_trash'` (the compiler forces this when the type gets smaller) |

### 5.5 Mutation checks (each one must turn a test red)

1. Remove the `shown` test from `verdictFor` → L1, L2, C-A.
2. Remove the `isOpenFolder` test from `findFolder` → L3, C-A.
3. Remove the `isOpenFolder` test from `moveRefusal` → L4, L5.
4. Make `agentMayView` answer `true` → B1, B2, B3, C-B.
5. Do not set `names` in `refuseHop` → B2, B5. Do not set it in `stoppedAuth` → B1, B6.
6. Put `found === undefined` back in `whyUnusable` → G5.
7. Remove one request from the class test's route map → its completeness assertion. Add a sixth name to the fields
   that the scan must find → its companion assertion.

### 5.6 The harness (the real binary against the real window code)

`src_vs_code/scripts/creds-mcp-itest.cjs` (`npm run itest:mcp`; it needs `creds-mcp` built) gets three checks. It
runs the real `creds-mcp` binary; its folder scenarios use the real `StorageManager` and the real `folderHooks`
(`:1281-1311`).

- H1: `creds_edit_folder` on `f-shut` (a folder that nobody opened) gives the same text as on a made-up id, and the
  text does not hold the folder's name.
- H2: the move of scenario 4 (`:1383-1396`, destination `f-shut`) gives the same text as a move to a made-up id.
- H3: a use call on an id for which the window's lookup answers nothing gives `No CredsForDevs window answered for
  that entry.` and the stale-id hint, and nobody is asked. This proves the second half of §2.3: the binary's
  fall-through on the window's `not_found`.

### 5.7 What the tests do not prove

- Time. No test measures it (§2.4, §8).
- The entry half through the real binary: the harness scripts the entry lookup (`creds-mcp-itest.cjs:836-856`), so
  H3 proves the binary's half, and the unit suite proves the window's half.
- A real `ssh` and a real server. B1-B3 refuse before anything is started.
- The VPN start itself. In the unit world the start is behind `deps.open`, which is a stub; part B proves the one
  sentence of the action (`agentUseActions.ts:665-672`). What `vpnRun.ts` and `dependencyRunHost.ts` say goes to the
  person's notifications, and no test of this plan reads it.
- Sentences outside the sites of §3. The class test covers every route and every reference field that exist today;
  a new sentence on an existing route that names a node by another road is covered only when the fixture reaches it.

## 6. Documents

- `src_vs_code/CHANGELOG.md`, under `## [Unreleased]`: a `### Changed — security` entry with the rule and the five
  cases of §3.4.
- `research/module_extension.md`: a paragraph *A refusal names only what the agent may view* after *The gate is per
  action, not per call* (`:6392`), with the two rules, the two functions that decide them and what the journal
  holds; the folder paragraph (`:6196-6204`) says that a folder that is not open is absent for every verb and for a
  move; the protected-entry paragraph (`:1328-1336`) says that a borrowed key's owner is no longer named; the
  linked-run paragraph (`:2460`) says how `whyUnusable` chooses its sentence. No diagram shows these lookups, so none
  is re-rendered.
- `research/module_tests.md`: a section for the class test and the three harness checks, with §5.7 as its *what it
  does not prove*.
- `todo/README.md`: this plan's row. On promotion: `research/README.md`.
- README and help: no change. No sentence there quotes one of the changed sentences (checked: `grep -c` for
  `not open to agents`, `No such entry`, `Trash is not a destination`, `is not open to you` and `jump host "` over
  `README.md`, `src_cli/README.md`, `src_mcp/README.md` and the five `help*.ts` language files gives 0 in each).
  `README.md:139-140` and `:174-176` become true; they do not change.
- `POST_DEPLOY.md`: no item. The change is logic that a green local run shows; nothing in it differs between the
  machine that builds and the machine that runs.

## 7. What this plan does NOT do

- It does not change `creds_list`. A visible entry's `dependsOn` still names each dependency (§11, N1).
- It does not add a journal line for a lookup refusal (§2.5).
- It does not protect a name against a process that reads the person's files (the journal, VS Code's storage). The
  rule is about the answers of the broker.
- It does not make the two cases of rule A equal in time (§2.4).
- It does not change `creds-mcp`, `creds`, a route, a code or a tool description.
- It does not change a sentence for a node that the agent may view.
- It does not change what a Remote Bridge answers for D4 and D5.
- It does not change the help in five languages (§11, N2).
- It does not release. A release of the extension must follow the merge; the lead and the owner decide when.

## 7a. Neighbour plans

| Plan | Touches | This plan's part |
|---|---|---|
| [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) and its E1 documents ([S3 spec](PLAN_remote_bridge_scoped_E1_S3_spec.md)) | the wall of a bridge: `closedIn`, `outOfScopeAnswer`, `bridgedRefusal`; E1.6 changes `sshUseActions.ts` and `sshExecAuth.ts` for the bridged legs | this plan edits no line of `bridgeScope.ts`. It changes `bridgedRefusal`'s branch OFF a bridge and leaves the branch ON a bridge as it is (G7). The S3 spec's row *`closed` (403 `denied`, the switch sentence)* stays true for an entry in scope that the agent may view; for one that it may not view the answer is that plan's own not-found answer. Whichever merges second re-reads `sshUseActions.ts` and `sshExecAuth.ts` after the merge |
| [PLAN_ssh_exec_own_agent_forwarding.md](PLAN_ssh_exec_own_agent_forwarding.md) | `ssh:exec`'s argv and environment in `execOverSsh` | none: this plan changes what `execOverSsh` SAYS when it refuses, not what it starts. Disjoint lines |
| [PLAN_ssh_exec_absolute_program.md](PLAN_ssh_exec_absolute_program.md) | the program that `ssh:exec` starts on Windows | none. Disjoint |
| [PLAN_askpass_answers_the_hop.md](PLAN_askpass_answers_the_hop.md) | a password connection with a jump host (`sshExecAuth.ts`, `sshAskpass.ts`) | none in behaviour: this plan adds one field to the failure of `ExecAuth` and reads no password path. That plan goes on from the type as it finds it |
| [PLAN_consent_coverage_per_door.md](PLAN_consent_coverage_per_door.md) | the stamp write in `credsAgentServer.ts`; it cites the 403 sentence for an own-only delete (`mayDelete`) | none: that case is an entry that the agent may view, so its sentence stays (G2). This plan edits no line of `credsAgentServer.ts` (795 of its 800 lines) |
| [PLAN_terminal_runs_followups.md](PLAN_terminal_runs_followups.md) item 6 | `vpnOutcome` in `agentUseActions.ts` | none. Disjoint lines of the same file |
| [PLAN_query_refuses_client_commands.md](PLAN_query_refuses_client_commands.md) | the `query` action in `agentUseActions.ts` and `dbCliLauncher.ts` | none. Disjoint |

The order: this plan needs none of them and none of them needs this plan. The table is complete for the plans that
were open on 2026-11-11 and name a file or a function that this plan changes. Method: `grep -l` over
`todo/PLAN_*.md` for `mcpEntries.ts`, `mcpFolders.ts`, `mcpFolderHooks.ts`, `brokerRequests.ts`, `mcpHooks.ts`,
`sshUseActions.ts`, `sshExecAuth.ts`, `sshOptions.ts`, `sshCredential.ts`, `agentUseActions.ts`, `bridgeScope.ts`,
`refusalFor`, `findUsableEntry`, `findFolder`, `bridgedRefusal` and `resolveJumpChain`. Two more plans matched and
share no line: `PLAN_connect_in_a_remote_window.md` (the route of Connect in a remote window, wired through
`sshUseActions.ts`) and `PLAN_weave_time_column_choice.md` (the woven-password sentence, G8). **The same rows are owed in the neighbour
plans** (the both-sides rule of `planning-docs.md`). They are not written by this commit: each neighbour is an
approved plan with its own ledger, and the lead decides how a boundary row is recorded there.

## 8. Risks

1. **An agent gets less help for an entry that it cannot see.** Today it can tell the person which switch to turn
   on. After this plan it says that the id is stale. This is the rule, not a side effect: the name was the leak. An
   entry with `view` on keeps the helpful sentence.
2. **Time is a residue** (§2.4). Not measured; a local process on the loopback could try to measure a walk of some
   steps in memory. If the owner wants it closed, that is a plan of its own.
3. **A person at the CLI reads the fixed sentence** in case 4 of §3.4, and must open the journal for the reason.
4. **The Trash sentence is gone** (case 5 of §3.4). An agent that tries to delete by a move gets *no folder with
   that id*.
5. **With two windows open**, a call on a hidden entry now goes on to the next window, as a call on an unknown id
   does: one more loopback request per window, and no dialog.
6. **A4 adds one storage read** in the gate of a linked run, in the Terminal entry's own account. The tests that
   compare the reads (`agentSshGate.test.ts:275`, `:284`, `:462`, `:676`) must stay green; `:462` shows that a bridge
   still reads nothing.
7. **Size.** `mcpEntries.ts` (563 lines), `agentUseActions.ts` (672) and `sshUseActions.ts` (453) stay under 800.
   The class test's fixture is a file of its own so that no test file passes the limit.
8. **A merge with an open branch** of a neighbour (§7a) can touch the same files; the second one re-reads them.

## 9. Growth surfaces

None is created: no table, file, folder, cache or process. Rule B writes one more kind of line into the agent
journal, at most one per refused call. Such a call has passed the throttle, and the journal file has its own
retention (`agentAuditFile.ts`). Rule A writes nothing.

## 10. Definition of Done

- [ ] The class test was written before the fix; its first failure list is in the summary, compared with §3.1.
- [ ] Every RED row of §5.2 was watched failing by its assertion on the unchanged code, then passes; the summary
      quotes one failure message and the pass for rule A and for rule B. No RED proof is a compile error.
- [ ] Every guard row of §5.3 was watched passing before and after; G5 was watched red between A1 and A4.
- [ ] Every mutation of §5.5 turned a test red.
- [ ] For an entry, a folder and a move destination that the agent may not view, the answer is deep-equal to the
      answer for an id that does not exist, on every route that the class test derives.
- [ ] No answer of §5.1 holds a marker of a node that the agent may not view, with the one written exception.
- [ ] `npm run typecheck`, `npm test` and `npm run lint` are green in `src_vs_code` at lowered priority, with a clean
      `tsc` read first. `npm run contract` leaves `contract/` unchanged. `src_mcp` has no difference.
- [ ] `npm run itest:mcp` ran with H1-H3 green, or the summary says that `creds-mcp` was not built here and who runs
      it before the release.
- [ ] The documents of §6 are written; the CHANGELOG entry and the pull request body carry the five cases of §3.4.
- [ ] `coai`: a `review_plan` round reached `proceed` before step 1; a `review_code` round ran on the finished
      branch; every finding has an accept or a reject with a reason; the summary has the verdicts and the number of
      reviewers that answered.
- [ ] `node .agents/conventions/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; this plan is promoted with its
      deviations in the task that finishes it.
- [ ] The lead and the owner have heard that a release must follow, and what §11 leaves open.

## 11. Found along the way (not built here)

- **N1. `creds_list` names dependencies that the agent may not view.** `dependencyNames` (`mcpEntries.ts:504-509`)
  gives the name of each `dependsOn` target of a visible entry, also of a target that is closed or has a PIN. This is
  not a refusal and not an oversight: `mcpEntries.test.ts:233-245` pins it, and the description of `creds_vpn_up`
  builds on it (`contract/mcp-tools-v1.json:610`). A Remote Bridge does filter it (`bridgeScope.ts:150`). To filter it
  on the local door changes a documented answer of an MCP tool and takes away something an agent uses to tell the
  person which VPN is missing. **It needs the owner.** The class test names it as its one exception.
- **N2. The help says that the journal holds every refusal** (`helpEn.ts:137`, and the four other languages). A
  lookup refusal writes no line (`credsAgentServer.ts:734-747`). This is true before and after this plan.
- **N3. The journal is a plain file.** A process of the same user can read the names in it. A boundary of the
  product, said in §7.

## Epics

One epic, because the change is one rule at two lookups and one chooser. Its stories are here and not in a document
of their own, as in [PLAN_query_refuses_client_commands.md](PLAN_query_refuses_client_commands.md) for a plan of this
size. Fable wrote this spec (a security judgement); Sonnet codes each story from it; Opus reviews each against it.
The question consultant and the `review_plan` round come before step 1 and are the lead's.

Cornerstones: 1 of 1 — S1

### E1 · The rule at its three places, on `fix/agent-refusal-names-unlisted-entry`

- **Goal.** No answer of the broker names an entry or a folder, or says that it exists, when the agent may not view
  it; and a later route or reference field cannot do so without a red test.
- **Scope.** §2, §3, §4, §5, §6.
- **Depends on.** Nothing.
- **Done when.** §10 is ticked.
- **Cornerstone area.** The lookups and the class test (S1). A mistake there is a name that leaves the vault through
  a call that passes every other test, and nothing after it catches the mistake.

**Stories.**

- **S1 · The addressed node** (cornerstone; its spec is §2.2-§2.5, §3.1 rows A1-A4, §5.1 part A, rows C-A and L1-L5,
  G1-G6). Steps 1 to 4 of §4. Complete alone: rule B's sentences are not touched, so their tests stay green.
- **S2 · A second entry.** §3.1 rows B1-B6, §5.1 part B, rows C-B and B1-B6, G7-G9. Steps 5 to 7 of §4. Follows S1,
  because `agentMayView` stands on the function that S1 puts in the lookup.
- **S3 · The record.** Steps 8 to 11 of §4: the mutation checks, the harness checks H1-H3, the documents, the code
  round and the pull request with the five cases of §3.4. Follows S2, because the documents describe what was built.
