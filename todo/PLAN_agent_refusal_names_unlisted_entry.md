# PLAN — An agent's refusal never names an entry or a folder that the agent may not view

> Status: **approved 2026-11-11 (epoch 1, by reviewers); epic 1 is built on the branch and not merged; epic 2 is not started.** The owner said yes on 2026-11-09
> to fix this as its own item. Scope: the extension only (`src_vs_code/src`: the entry lookup, the folder lookup, the
> SSH refusals, their tests), one harness (`src_vs_code/scripts/creds-mcp-itest.cjs`), `src_vs_code/CHANGELOG.md`,
> `research/module_extension.md`, `research/module_tests.md`, `todo/README.md`, and one boundary row in each neighbour
> plan of §7a. Two epics, in order, each with its own code round and its own pull request, on
> `fix/agent-refusal-names-unlisted-entry` from `main` at `360d45b7` (extension 1.21.0). Found as F7: item 7 of §16 of
> [PLAN_terminal_command_over_ssh_E3_S2_security.md](../research/PLAN_terminal_command_over_ssh_E3_S2_security.md).
> Security fix for a defect that is live on `main` and in the released 1.21.0. All `file:line` references were read on
> `360d45b7`.

## Plan changes

> Epoch 1 · approved 2026-11-11 · by reviewers · state: open

  (The approving round: the `coai` plan round 1 answered `proceed`, 2 of 2 reviewers, and the lead accepted its 7
  findings. The lead's own Opus review ran at the same time; its findings M1, M2 and m1 to m7 are accepted too. The
  split into two epics is the operator's command of that round, made after the two question consultants were asked
  (coai afd0c0dd; they advised rule A as epic 1 with the shared predicate, rule B as epic 2). All of this is folded
  into the text below as the approved baseline. Nothing was built before it, so the epoch opens with no entry.)
- 1.1 · 2026-11-11 · agent · dod — the bridge plan's owner session (dew-flow-conventions-a0) refused the boundary rows in PLAN_remote_bridge_scoped.md and its E1 S3 spec: for that plan they would be its change 8.2 and a full stop; the two rows are written on this plan's side only, as owed, and that plan takes them (and N7) into its ledger when it opens for E1.6
  (Counted in doubt: the Definition of Done said every neighbour of §7a gets its row in epic 1's pull request. The H6 harness case of the same night is not a change: §2.4 and H3 already say a hidden id falls through the window walk like a missing one; H6 only tests it with the older window holding the entry.)

## 1. The defect

An agent gets a list of the entries and folders that a person opened to it (`creds_list`, `creds_folders`). The
product promises that all other entries are invisible to the agent (`README.md:174-176`). Five answers of the broker
break that promise. Each one tells the agent the NAME of a node that was never in its list, or tells it that such a
node exists.

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
value (`pinGate.ts:186-191`; a damaged value is refused with the owner's name too, `pinGate.ts:160`).
`resolveSshCredential` keeps the owner's name (`sshCredential.ts:80`, `:102`), and `stoppedAuth` passes the sentence
on (`sshExecAuth.ts:125-128`). Off a Remote Bridge the sentence reaches the agent as it is
(`sshUseActions.ts:127-135`, `:181`). A PIN-protected entry is hidden from agents by design (`mcpEntries.ts:111-113`;
`README.md:139-140` says that it *disappears from every agent-facing surface*). So `creds_exec` on a connection that
borrows such a key tells the agent the name of a hidden entry.

**D5, a jump host.** An SSH entry can go through a second entry (`jumpHostEntityId`, `types.ts:84`), and that entry
through a third one: a chain (`sshOptions.ts:168-186`). `refuseHop` names the hop:
`The jump host "<hop name>" cannot be used: its address is not a valid host.` (`sshOptions.ts:153`). The sentence
reaches the agent at `sshUseActions.ts:265` (`creds_exec`, and a linked `creds_run` through `execOverSsh`) and at
`agentUseActions.ts:400` (the linked `creds_run`, before the trust check).

On a Remote Bridge D4 and D5 are closed already: `bridgedRefusal` gives one sentence and writes the real one to the
journal (`sshUseActions.ts:118-135`). D1 is closed in part there: `closedIn` (`bridgeScope.ts:175-177`) drops a
`closed` answer for an id out of scope, but keeps it for an id in scope, also when that entry is no longer visible to
agents. This is the shape that `security.md` calls *a measure applied at SOME of its sites*.

**How the sites were found (the method).** (1) `grep -n "kind: 'closed'"` and `grep -n "kind === 'closed'"` over
`src_vs_code/src/*.ts`: two producers (`mcpEntries.ts:435`, `mcpFolders.ts:156`), one re-map (`mcpHooks.ts:162`), four
readers (`brokerRequests.ts:210`, `mcpHooks.ts:161`, `bridgeScope.ts:171`, `mcpFolderHooks.ts:91`). (2) `grep -n` for
every caller of `refusalFor`, `findUsableEntry`, `findFolder`, `moveRefusal`, `closedAnswer`, `describeMoveRefusal`.
(3) The fields of `EntityMetadata` (`types.ts:56-316`) of type `string` or `string[]`: 25 fields, of which five hold
the id of another entry (`sshKeyEntityId` `:76`, `jumpHostEntityId` `:84`, `vpnLauncherEntityId` `:115`, `sshEntityId`
`:172`, `dependsOn` `:282`); for each of the five, every sentence that an action can answer was read. (4)
`grep -n 'Name}\|\.name}'` over the action modules (`useActions.ts`, `agentUseActions.ts`, `sshUseActions.ts`,
`sshExecAuth.ts`, `sshCredential.ts`, `sshOptions.ts`, `rotateAction.ts`, `mcpCreate.ts`, `mcpSnippetRoute.ts`,
`brokerFolderDoor.ts`, `brokerReadRoutes.ts`, `brokerMcpRoutes.ts`, `brokerCall.ts`, `vpnRun.ts`), each hit read. (5)
The fields of the two list answers (`McpEntry`, `mcpEntries.ts:35-63`; `FolderView`, `mcpFolders.ts:30-45`), each read
for a name or an id of another node; this gave the exceptions of §2.6. NOT done: a scan of every sentence in the
product (522 quoted-name templates in 140 files, the help files not counted). §5 adds tests that do not depend on such
a scan.

## 2. The rule, decided

### 2.1 Words

- **The agent may view a node** when the node is in the list that the agent gets. This plan adds no second
  definition. For an entry the function is `shown` (`mcpEntries.ts:278-280`): the node is an entry, `view` is on after
  the ladder and the folder walk (nothing in the Trash has `view`), and the entry has no PIN of its own. For a folder
  the function is `isOpenFolder` (`mcpFolders.ts:84-89`): the node is a folder, it is not the Trash, it is not in the
  Trash, and `view` is on. The two functions read the folder tree, so each caller gives them a tree lookup.
- **The addressed node** is the node whose id the request carries (`entry`, `folder`, the `parent` of a new folder,
  the `parent` of a move, the `id` of a config snippet).
- **A second entry** is an entry that a call reads through a reference field of the addressed entry.

### 2.2 The rule

**The lookup of an addressed id, and each refusal, names an entry or a folder, or says that it exists, only when the
agent may view it.**

- **Rule A, the addressed node.** When the agent may not view the addressed node, the answer is the answer of an id
  that does not exist. This is true for every action and for every door.
- **Rule B, a second entry in a refusal.** When a refusal would name a second entry that the agent may not view, the
  agent reads one fixed sentence that names the addressed entry only. The error code stays.

**What the rule does NOT cover.** It is not a promise about each field of a successful answer. Four fields of the two
list answers can still hold the name or the id of a node that the agent may not view: `dependsOn`, `folder` and
`command` of `creds_list`, and `parent` of `creds_folders`. They are the four exceptions of §2.6. Each one is
written down, has its reason, is pinned by a test, and is a question for the owner. Rule B also does not hide that a
second entry exists, or its address (§7).

Each rule is applied at one place, not at each sentence. Rule A is in the two lookups, so a caller cannot get a node
that the agent may not view. Rule B is in one chooser that all such sentences pass.

Nothing changes for a node that the agent may view. An entry with `view` on and `use` off keeps the sentence that
names it and its switch. That sentence is the reason for the three-answer lookup (`brokerRequests.ts:85-96`), and it
stays.

**No usable verdict is lost.** Each rung turns on the rungs below it (`climb`, `mcpAccess.ts:244-268`), and
`resolveMcpInTree` gives the climbed access (`:299-327`). So an entry that is usable for an action always has `view`.
Guard row G3 of §5.4 pins this.

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
(`UseTools.cs:498-510`). The product code of `creds-mcp` does not change, and an older `creds-mcp` gives the same
result.

### 2.4 What "the same answer" means, item by item

For rule A, a node that the agent may not view and an id that does not exist are compared on each thing that the
agent can observe.

| Item | Result | Why |
|---|---|---|
| HTTP status, error code, message, body length | equal, byte for byte | the lookup gives the same value, `undefined`, in the two cases; one expression builds the body from it |
| The hint of `creds-mcp` | equal | the hint comes from the code, or from the fall-through, and the two are equal |
| The walk over the windows | equal | `not_found` goes on to the next window in the two cases; a `denied` for a node that the agent may view stops the walk, as today |
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
  effect that an id that does not exist does not have. And the journal is a plain file: the line would write the
  hidden name where a local process can read it.
- **The linked run's journal line.** The gate of a linked `creds_run` writes its reason to the journal
  (`agentUseActions.ts:209-212`, `:307-314`). The reason does not name the SSH entry today, and it does not after
  this plan. Site A4 keeps it exact: one sentence for each of three causes.
- **Rule B.** The journal gets one line for the refused call. For the same third reason as above, the line names the
  second entry by its RELATION to the addressed entry, never by its name and never by its id. The person knows the
  addressed entry, opens it, and finds the key or the chain there. The two lines:
  - `<entry name>: its linked key entry did not open for an automatic use (a PIN of its own, or a damaged value)
    (the agent was told only that another entry stopped the call)`
  - `<entry name>: a jump host in its chain has an address that is not a valid host (the agent was told only that
    another entry stopped the call)`

  The text after the colon comes from a table in the chooser, keyed by the relation. No text of a resolver goes into
  the line, so a name cannot arrive there.

### 2.6 The four exceptions: fields of the list answers that the rule does not cover

Each row is a field of a SUCCESSFUL answer, not a refusal and not a lookup. Each one is documented behaviour of an
MCP tool today. To change one changes a documented MCP answer, so **each one is a question for the owner**, and this
plan changes none. The class test pins each one (§5.1): its fixture has the case, the test asserts the value that is
there today, and the list check allows these four fields and nothing more.

| # | Field | What it can hold | Why it is there today | Code |
|---|---|---|---|---|
| N1 | `creds_list` → `entries[].dependsOn` | the NAME of each dependency, also of one that is closed or has a PIN | the agent can tell the person which VPN is missing; `creds_vpn_up`'s description builds on it (`contract/mcp-tools-v1.json:610`); a test pins it (`mcpEntries.test.ts:233-245`). A Remote Bridge filters it (`bridgeScope.ts:150`) | `mcpEntries.ts:504-509` |
| N4 | `creds_list` → `entries[].folder` | the NAME of the folder that the entry is in, also when nobody opened that folder (an entry with switches of its own) | *so an agent can tell two entries with one name apart* (`mcpEntries.ts:38-39`). A Remote Bridge gives `''` (`bridgeScope.ts:124-130`) | `mcpAccess.ts:358-360`, `mcpEntries.ts:282-284`, `:148` |
| N5 | `creds_list` → `entries[].command` | the stored command text; a `creds://<account>/<entry>/<field>` reference in it names an account and an entry | *Not a secret: it is what the person typed* (`mcpEntries.ts:47-48`). A Remote Bridge gives a boolean (`bridgeScope.ts:124-127`) | `mcpEntries.ts:180` |
| N6 | `creds_folders` → `folders[].parent` | the ID of the parent folder, also when that parent is not open (a folder with switches of its own) | the shape of the tree (`mcpFolders.ts:33-34`) | `mcpFolders.ts:95` |

## 3. The sites

### 3.1 Sites that change

| # | Site | Today | New behaviour |
|---|---|---|---|
| A1 | `mcpEntries.ts:422-436` `verdictFor`, called by `lookedUp` (`:380-391`) | resolves the access, reads the rung of the action, answers `usable` or `closed` with the node | resolves the access once, then asks `shown(node, resolved)` (`:278-280`) before the rung; not shown → `undefined`. `lookedUp` keeps only the test for a missing node; the PIN test at `:387` is inside `shown` |
| A2 | `mcpFolders.ts:132-145` `findFolder`; `:84-89` `isOpenFolder` | each folder id → `verdictFor` → `usable` or `closed` | asks `isOpenFolder(node, byId)` first; not open → `undefined` |
| A3 | `mcpFolders.ts:191-212` `moveRefusal`, `firstRefusal`; the type `:172-176`; the sentences `:257-265`; `isTrashy` `:218-220` | a folder destination → `into_the_trash`, `into_itself` or `destination_closed`; not a folder → `no_such_destination` | missing, not a folder, or not `isOpenFolder` → `no_such_destination`: one answer for the three. `into_the_trash` cannot be reached then: the variant, its sentence and `isTrashy` are removed. The order that stays: `into_itself`, then `destination_closed` |
| A4 | `agentUseActions.ts:230-238` `whyUnusable`, `usableGate` | the JOURNAL reason is chosen by `found === undefined` (`the SSH entry is hidden from agents (PIN) or is not in this account`) or `closed` (the switch sentence) | after A1, `undefined` also means *not visible*. `usableGate` reads the SSH entry's node once more, in the Terminal entry's account only. Three causes, three sentences: node missing → `the SSH entry is not in this account`; `hiddenFromAgents(node)` → `the SSH entry is hidden from agents (PIN)`; else → `the SSH entry's "Usable by agents" switch is off` (unchanged). Nothing that the agent reads changes |
| A5 | `mcpEntries.ts` (new export) | `shown` is private; the lookup and the list each resolve the tree | `export function agentMayView(source: Pick<McpVaultSource, 'getNode'>, accountId: string, entityId: string): boolean`. It reads the node in THAT account only, resolves the tree with a lookup bound to that account, and answers `shown`. A missing node answers `false`. `isOpenFolder` is used by A2 and A3 inside its own module and needs no export |
| A6 | comments and one test name that become false | `brokerRequests.ts:85-96` (*present but closed … collapsing it into "not found"*); `brokerRequests.ts:204-208` (*an entry id is a uuid nobody enumerates*); `mcpEntries.ts:318-325` (*an entry that exists and is closed*); the test name at `mcpFolders.test.ts:194-198` (*told apart from one that is closed*) | each says the rule: `closed` is for an entry that the agent may view; a node that it may not view and an id that does not exist get one answer. The test name says that a missing destination and one that is not open get one answer, and a visible closed one another |
| B1 | `sshCredential.ts:36-41` `SshCredentialStopped`; `:80`, `:102` | carries `reason` and `ownerName` | also carries `readonly ownerId: string` (the id of `keySource` at `:80`, of `owner` at `:102`) |
| B2 | new module `agentNaming.ts` (imports no `vscode`) | — | `export interface SecondEntry { readonly id: string; readonly relation: 'linked key' \| 'jump host' }`; `export function SECOND_ENTRY_REFUSED(entityName: string): string`; `export function agentRefusal(said: { readonly message: string; readonly second?: SecondEntry }, entityName: string, mayView: (entityId: string) => boolean): { readonly message: string; readonly note?: string }`. `second` absent, or `mayView(second.id)` → the message as it is, no note. Else → `SECOND_ENTRY_REFUSED(entityName)` and the note of §2.5 for that relation |
| B3 | `sshExecAuth.ts:40-45` (the failure of `ExecAuth`), `:125-128` `stoppedAuth`, its call at `:121` | the message names the owner of the value | the failure gains `readonly second?: SecondEntry`. `stoppedAuth(source, entity)` takes the entry that was asked for and sets `second: { id: source.ownerId, relation: 'linked key' }` when `source.ownerId !== entity.id` |
| B4 | `sshOptions.ts:104` `JumpChain`; `:144-154` `refuseHop` | `:153` names the hop | the failure gains `readonly second?: SecondEntry`. `:153` sets `second: { id: hop.id, relation: 'jump host' }`, for a hop at any depth of the chain. `:132`, `:137` and `:148` name the starting entry and set nothing |
| B5 | `sshUseActions.ts:127-135` `bridgedRefusal`; `prepareAuth` `:162-185` (`:181`); `execOverSsh` `:255-281` (`:265`, `:274`) | on a bridge: the bridge sentence and a note. Off a bridge: every sentence as it is | the function returns `(code: ErrorCode, message: string, second?: SecondEntry) => UseActionResult`, and `prepareAuth`'s `refuse` parameter has the same type. On a bridge: as today. Off a bridge: `agentRefusal({ message, second }, ctx.entityName, (id) => agentMayView(deps.storage, ctx.accountId, id))`; a note goes to `deps.note`. `:181` passes `resolved.second`; `:265` passes `chain.second`; `:274` passes none. `SshUseDeps` gets no new member |
| B6 | `agentUseActions.ts:398-403` `remoteRefusal` | `fail('no_credential', chain.reason)` | `agentRefusal({ message: chain.reason, second: chain.second }, ctx.entityName, (id) => agentMayView(deps.storage, ctx.accountId, id))`, the note to `deps.note`. `AgentUseDeps` gets no new member |

Rule B asks about the SITE, not about the value. `second` is set whenever the owner or the hop is another entry,
whatever the sentence says. A new sentence at these sites is then covered with no new decision. The lookup that
`agentMayView` gets is bound to the account of the call, and it reads the tree: a jump host that takes its switches
from a folder is judged by that folder, as in the list.

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
| `mcpEntries.ts:241-257` `visibleConfigDetails`; `mcpSnippetRoute.ts:85` | one `undefined` and one sentence for not found, not visible and not a config — in ONE account; across two accounts see N8 in §11 |
| `mcpCreate.ts:94-118` `creatableFolders`, `:134-204` `chooseTarget`, `describeChoice` | lists only folders that are open for creating (so `view` is on, and none is in the Trash); repeats only the folder name that the caller sent |
| `agentUseActions.ts:196-198` `linkedRunRefused`; `:235-247` | one sentence for every reason; it names the Terminal entry only |
| `brokerCall.ts:178-187` | the agent reads the granted entry's name; the second entry's name is in the journal detail only, and that entry is usable (so the agent may view it) |
| `agentUseActions.ts:635-672` (VPN start and stop) | `"<entry>" could not be started — see the notification.`; the launcher (`vpnLauncherEntityId`) and the chain (`dependsOn`) are named to the person only |
| `sshUseActions.ts:340-392` (`creds_open_terminal`) | `Could not open an SSH terminal for "<entry>" — the window said why.`; the key and the chain are named to the person only |
| `rotateAction.ts:240-351`; `agentUseActions.ts:491-619` (export, query) | each sentence names `ctx.entityName` only |
| `sshOptions.ts:132`, `:137`, `:148`; `sshExecAuth.ts:55-64`, `:133` | each names the entry that was asked for |
| `bridgeScope.ts:262-282` (`REFERENCE_REFUSED`, `AGENT_FORWARD_REFUSED`, `BRIDGE_USE_REFUSED`) | each names the entry of a grant; a grant is minted for a usable entry only |
| The three action modules (`sshUseActions.ts`, `agentUseActions.ts`, `rotateAction.ts`; registered at `extension.ts:624-660`) | none resolves a `creds://` reference: none imports `secretRef.ts`, `entityFieldReading.ts` or `runPlan.ts`. A reference in a stored line stays text for an agent's run. Row R of §5.2 pins it |

### 3.4 What changes for an agent or a script (the contract, said explicitly)

No route, no error code, no status, no body shape and no tool description changes. `contract/broker-v1.json` and
`contract/mcp-tools-v1.json` do not change, and the product code of `src_mcp` does not change. What changes is WHICH
of two existing answers one request gets, in these cases:

1. A use call or a delete on an entry that the agent may not view: `denied` (403) with the entry's name → `not_found`
   (404). Through `creds-mcp`: the *no window answered* sentence of §2.3.
2. A folder verb on a folder that the agent may not view: `denied` (403) with the folder's name → `not_found` (404).
3. A move to a destination that the agent may not view: the *closed* or the *Trash* sentence → the *no folder with
   that id* sentence. The code stays `denied`.
4. `creds_exec`, `creds_rotate` on an SSH entry, and a linked `creds_run`, when a key entry or a jump host that is not
   visible to agents stops the call: the sentence that names that entry → `SECOND_ENTRY_REFUSED`. The code stays.
   This is true on the alias door and on the token door too (`creds exec` in a terminal), because an action does not
   know its door.
5. The sentence `the Trash is not a destination; deleting is its own call` is gone. An agent can name the Trash only
   by an id that was never in its list.

No documented answer of an MCP tool changes: no tool description says what a call on an unlisted id answers (checked:
`contract/mcp-tools-v1.json` was searched for `not open`, `switch`, `Trash`, `refus`, `stale`, `closed` and `no such`,
and each hit was read). By this repository's own practice, a changed answer on a shipped road is named: the CHANGELOG
entries and the pull request bodies carry these cases (1, 2, 3 and 5 with epic 1; 4 with epic 2).

## 4. Build order

The two epics are built in order. Each one starts with its stories document (§Epics), and each one ends with its own
code round and pull request. Epic 2 starts after epic 1 is merged.

**Epic 1 (rule A).**

1. **Part A of the class test first** (§5.1), before any fix. Its first failure is the list of leaks. Compare the
   list with §3.1. A leak that is not in §3.1 and has the shape of rule A gets a row, as a recorded deviation. A leak
   of another shape stops the work: it is a plan change.
2. **RED rows of rule A** (§5.3, L1-L7). L1 to L6 need no new name, so they compile on `main`'s code. L7 needs the
   export of A5: add it first as a function that answers `false` for every id (a no-op), then write L7. Watch each
   row fail by its assertion, never by a compile error (`npm test` runs `tsc` first). Keep the messages.
3. **Fix A1, A2, A3, A5, A6.** Change the existing tests of §5.5 in the same commit as the code that they follow.
4. **A4.** After A1 the guard row G5 is red (§5.4). Watch it. Then change `whyUnusable`. G5, G6 and L6 are green.
5. The mutation checks 1, 2, 3 and 6 to 8 of §5.6; the harness checks H1 to H6 (§5.7).
6. The documents of epic 1 (§6), and **the boundary row in each neighbour plan** (§7a).
7. `npm run typecheck`, `npm test`, `npm run lint`, in `src_vs_code`, at lowered priority. `npm run contract` leaves
   no difference in `contract/`. `npm run itest:mcp` where `creds-mcp` is built.
8. The `coai` code round on the finished branch, then the pull request. Its body has cases 1, 2, 3 and 5 of §3.4,
   the verdicts and the number of reviewers that answered.

**Epic 2 (rule B).**

9. **Part B of the class test** (§5.2), written now and not before, and before any fix of rule B. Its first failure
   is compared with §3.1 in the same way.
10. **The no-op types of rule B**, with no reader: `second?` on the two failure types, `ownerId` filled at its two
    sites, the module `agentNaming.ts` with its three exports (`agentRefusal` gives the message back as it is).
    `npm run typecheck` is clean, and `npm test` shows the failures of step 9 and no other. This step exists for the
    reason of step 2: a test that names a missing symbol fails to compile, and a compile error is not a RED proof.
11. **RED rows of rule B** (§5.3, B1-B7). Watch each one fail by its assertion.
12. **Fix B3-B6**, and give `agentRefusal` its decision.
13. The mutation checks 4, 5 and 9 of §5.6; the documents of epic 2 (§6); step 7 again; the code round and the pull
    request with case 4 of §3.4.

One file of the suite runs through the same runner: `npm run compile`, then
`node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`. Read the exit of `tsc`
before any result.

## 5. Test plan

The class test is `src_vs_code/src/test/agentNamesOnlyViewable.test.ts` (new). Its fixture is a vault in which each
node has a marker name of its own (`MARK-<id>`) and an id of its own, in a helper file that is not a suite
(`test/unlistedWorld.ts`). The fixture holds the list of hidden names AND the list of hidden ids. The nodes that the
agent may not view, each for a different reason:

- entries: no switch anywhere; an explicit empty answer (`mcp: {}`) inside an open folder; in the Trash with all
  switches on; a PIN of its own with all switches on; a config entry with no switch;
- folders: no switch; an explicit empty answer under an open folder; in the Trash; the Trash itself.

The nodes that the agent may view: an entry with `view` only; an entry with `use`; an entry with `delete: 'own'`
that a person made; a folder with `view` only; a folder with `folderEdit`. And the four cases of §2.6: a visible entry
that depends on a hidden entry (N1); a visible entry with switches of its own in a folder with no switch (N4); a
visible Terminal entry whose command holds `creds://<account>/<a hidden entry's name>/password` (N5); a visible folder
with switches of its own under a parent with no switch (N6).

### 5.1 Part A of the class test: the addressed node, at the door (epic 1)

The real broker (`world` of `test/brokerWorld.ts`) with the real `mcpUseLookup` (`options.mcpResolve`), the real
`folderHooks` (`server.setFolderHooks`), the real `chooseCreateTarget` and the real snippet supplier over the fixture.

**The routes are DERIVED from the broker contract**, `contract/broker-v1.json`: `mcpUsePrefix` with each of
`mcpActions`, `mcpDeleteRoute`, `mcpCreateRoute`, `mcpFolderPrefix` with each of `mcpFolderActions`, `reads`,
`routes`, `aliasPrefix` and `configRead`. The test has one row for each derived route. A row says which input of the
request carries a node, and which lookup reads it:

| Route (from the contract) | The input that carries the node | The lookup | What the test compares |
|---|---|---|---|
| `POST /v1/mcp/use/<action>`, for each of the eight `mcpActions`, and for ONE verb that is not in the list | body `entry`, an id | `findUsableEntry` through `mcpUseLookup` | the hidden id against a made-up id: deep-equal status and body |
| `POST /v1/mcp/delete` | body `entry`, an id | the same, for `delete` | the same |
| `POST /v1/mcp/folder/create` | body `parent`, an id | `findFolder`, verb `create` | the same |
| `POST /v1/mcp/folder/edit` | body `folder`, an id | `findFolder`, verb `edit` | the same |
| `POST /v1/mcp/folder/edit`, a move | body `parent`, the id of the destination, with a `folder` that the agent may edit | `moveRefusal` | a hidden destination against a made-up destination, and against the id of an entry (not a folder) |
| `POST /v1/mcp/folder/delete` | body `folder`, an id | `findFolder`, verb `delete` | the same as edit |
| `POST /v1/mcp/create` | body `folder`, a NAME and not an id | `creatableFolders`, `chooseTarget` | the name of a hidden folder against a made-up name of the same length: equal after the sent name is replaced by a placeholder |
| `GET /v1/mcp/config-snippet` | query `id` | `visibleConfigDetails` | the id of the hidden config entry against a made-up id |
| `GET /v1/mcp/entries`, `GET /v1/mcp/folders` | none | the two lists | the list check below |
| `GET /v1/mcp/kinds`, `GET /v1/mcp/kind-help`, `GET /v1/aliases`, `GET /v1/health`, `POST /v1/config/read`, `/v1/alias/<action>`, `/v1/use/<action>` | none that is a node id (a kind, an alias name, a config key, a grant token) | — | on the written list *takes no node id*, each with its reason |

A hidden id is compared with a made-up id only on a route that reads that id. For each such pair the test also
asserts that no hidden name and no hidden id is in the body, after each value that the request itself sent is
replaced by a placeholder.

**The list check.** The two list answers are read once. The test first asserts the four exceptions as they are today:
`dependsOn` of the N1 entry holds the hidden dependency's name; `folder` of the N4 entry holds the hidden folder's
name; `command` of the N5 entry holds the reference text; `parent` of the N6 folder holds the hidden parent's id.
Then it removes exactly those four values and asserts that no hidden NAME and no hidden ID is left in the two bodies.
Each exception carries its reason and its number of §2.6 in the test. When the owner closes one, its assertion goes
red and the row goes.

**Completeness: the test must not become empty.** (1) A route that the contract gives and the test has no row for
fails the test, with the route. (2) Each of the five lookups of the table (`findUsableEntry`, `findFolder`,
`moveRefusal`, `chooseTarget`, `visibleConfigDetails`) has at least one row that reaches it; the test asserts it. (3)
The cross-check: the `/v1/mcp/` routes that the contract gives are the same set as the `/v1/mcp/` rows of
`BRIDGE_ROUTES` (`bridgeAllowList.ts:91-96`). (4) One positive control on the same fixture: the entry with `view` only
IS named in its refusal on `exec`, with `Usable by agents`. A file of negative assertions needs it.

**One row on a Remote Bridge** (the helpers of `test/bridgeWallWorld.ts`): an entry in scope that the agent may not
view gets the answer of an id out of scope, deep-equal.

### 5.2 Part B of the class test: a second entry, at the action (epic 2)

It is written when epic 2 starts. Its scenarios run the real actions over the storage of `test/agentSshWorld.ts`.

**One scenario table, a row for each reference field.** A row names the production action that reads the field and
the refusal that can expose its target.

| Field (`types.ts`) | The production action that reads it | The refusal that can expose its target | Scenario, and what must be true |
|---|---|---|---|
| `sshKeyEntityId` `:76` | `ssh:exec` (`creds_exec`; also under `creds_rotate`, `extension.ts:660`) and the linked `creds_run`, all through `execOverSsh` → `prepareAuth` → `resolveExecAuth` → `resolveSshCredential` (`sshCredential.ts:43-61`) | the opener's sentence with the owner's name (`sshExecAuth.ts:125-128`) | the key entry has a PIN and a value that the opener refuses → the body is `SECOND_ENTRY_REFUSED`; RED today |
| `jumpHostEntityId` `:84` | `ssh:exec` (the thunk at `sshUseActions.ts:326`, read at `:263-266`) and the linked `creds_run` (`agentUseActions.ts:426`, `:398-403`); every hop of the chain (`sshOptions.ts:168-186`) | `sshOptions.ts:153` | a hidden hop with an unsafe address at depth 1, at depth 2 and at depth 3 of a chain → the same body each time; RED today |
| `sshEntityId` `:172` | the linked `creds_run`: `linkedCall` (`agentUseActions.ts:257-266`) | none: `linkedRunRefused` names the Terminal entry only | the SSH entry is hidden → the one sentence, no marker; green before and after |
| `vpnLauncherEntityId` `:115` | `creds_vpn_up`: `vpnAction` → `deps.open` (`agentUseActions.ts:635-672`) | none: `vpnOutcome` names the VPN entry only | the launcher is hidden and the start fails → no marker; green before and after |
| `dependsOn` `:282` | `creds_vpn_up` only (the chain runs in the window's start, behind `deps.open`); no other agent action reads it | none in a refusal (the list answer is exception N1) | a dependency is hidden and the start fails → no marker; green before and after |
| the same two SSH fields | `ssh:terminal` (`creds_open_terminal`, `sshUseActions.ts:340-392`) | none: `notOpened` names the entry only | the open fails → no marker; green before and after |

For each row the test asserts that the answer holds no hidden name and no hidden id.

**The scan fails closed.** The test reads `types.ts` and collects every field of `EntityMetadata` whose type is
`string` or `string[]` (25 today). Each field must be in the scenario table above (five) or on a written list of
fields that hold no reference to another entry (twenty today: `id`, `name`, `host`, `user`, `sshKeyPath`, `publicKey`,
`hostKey`, `tags`, `vpnConfigFileName`, `scriptLanguage`, `script`, `configFileName`, `configKeyHash`, `command`,
`commandNote`, `terminalOs`, `attachmentFileName`, `imageFileName`, `depColor`, `notes`). A field that is in neither
fails the test, with the field's name. So a new reference field cannot arrive with no decision. The companion
assertion: the scan finds at least the five reference fields and `name`, so a change of formatting in `types.ts`
cannot make it match nothing.

**Row R: no agent action resolves `creds://` off a bridge.** Text fields (`command`, `script`) can hold a
`creds://` reference, which names an entry by text and not by id. One row pins what is true today: (a) the three
action modules (`sshUseActions.ts`, `agentUseActions.ts`, `rotateAction.ts`) import none of `secretRef.ts`,
`entityFieldReading.ts` and `runPlan.ts`, with the companion that the scan finds a known importer
(`remoteLaunch.ts`); (b) an agent's `creds_run` on a Terminal entry whose line holds a reference to a hidden entry
gives its line to the run with the reference as text, and its answer holds no hidden marker. If an action starts to
resolve references, this row is red and rule B must get that site.

**Positive control.** A jump host that the agent may view is named as today, and so is a key entry that the agent may
view and whose value is damaged.

### 5.3 RED rows

Each row is watched FAILING on the unchanged code, by its assertion, then passing. The failure texts below are what
the code on `360d45b7` must give; the coder records what the runner printed.

| # | Epic | File | Input | Today, so the row is RED | After |
|---|---|---|---|---|---|
| C-A | 1 | the class test, part A | each row of §5.1 that reads an id, with each hidden node | 403 `denied`, e.g. `"MARK-e-none" is not open to agents for that. Turn on "Usable by agents" in its Agent access section.` against 404 `not_found` for the made-up id | deep-equal |
| L1 | 1 | `mcpEntries.test.ts` | `findUsableEntry` on each of the hidden entries that have no PIN, for `exec`, `rotate`, `delete` and an unknown verb | `{ kind: 'closed', … }` is not `undefined` | `undefined` |
| L2 | 1 | `mcpHooks.test.ts` | `mcpUseLookup` on the same | `{ kind: 'closed', entityName: 'MARK-…', needed: 'use' }` | `undefined` |
| L3 | 1 | `mcpFolders.test.ts` | `findFolder` on the four hidden folders, for `create`, `edit`, `delete` and an unknown verb | `{ kind: 'closed', … }` | `undefined` |
| L4 | 1 | `mcpFolders.test.ts` | `moveRefusal` to a destination with no switch, and to one with `mcp: {}` | `'destination_closed'` is not `'no_such_destination'` | `'no_such_destination'` |
| L5 | 1 | `mcpFolders.test.ts` | `moveRefusal` to the Trash, and to a folder in the Trash | `'into_the_trash'` is not `'no_such_destination'` | `'no_such_destination'` |
| L6 | 1 | `agentSshGate.test.ts` | the gate of a linked run with a storage that gives the SSH node to the link's read and nothing to the reads after it | the note says `hidden from agents (PIN) or is not in this account` | the note says `the SSH entry is not in this account` and does not say `PIN` |
| L7 | 1 | `mcpEntries.test.ts` | `agentMayView` for an entry that has no switch of its own: in a folder with `view` on; in a folder with no switch; with a PIN; in the Trash; asked with the id of an entry of another account | the no-op of step 2 answers `false` where `true` is expected (the open folder) | `true` in the open folder; `false` in the four other cases |
| C-B | 2 | the class test, part B | the `sshKeyEntityId` and `jumpHostEntityId` rows of §5.2 | the body holds `MARK-key`, `MARK-jump` | no hidden name, no hidden id |
| B1 | 2 | `sshUseActions.test.ts` | `ssh:exec` on a usable entry whose key entry has a PIN | the message holds the key entry's name (`"MARK-key" is protected with its own PIN, so it cannot be used automatically. …`) | the body is `errorBody('no_credential', SECOND_ENTRY_REFUSED('<entry>'))`, status 409 |
| B2 | 2 | `sshUseActions.test.ts` | `ssh:exec` on a usable entry with a chain of three hops; the hidden hop with the unsafe address is at depth 1, 2 or 3 | `The jump host "MARK-jump" cannot be used: its address is not a valid host.` | the same body as B1, in the three cases |
| B3 | 2 | `agentSshGate.test.ts` | a linked `creds_run` whose SSH entry is usable and whose chain is as in B2 | the same sentence as B2 today, through `agentUseActions.ts:400` | the same body as B1 |
| B4 | 2 | `sshUseActions.test.ts`, `agentSshGate.test.ts` | B1, B2, B3 | no journal note | exactly one note for each refused call; it holds the relation line of §2.5; it holds neither the name nor the id of the second entry |
| B5 | 2 | `sshOptions.test.ts` | `resolveJumpChain` with an unsafe hop at depth 1 and at depth 3 | `second` is `undefined` | `{ id: <that hop's id>, relation: 'jump host' }`; the cycle, the depth and the missing-hop refusals keep `second` `undefined` |
| B6 | 2 | `sshExecAuth.test.ts` | `resolveExecAuth` with a stopped value of a key entry, and of the entry itself | `second` is `undefined` | `{ id: <the key entry's id>, relation: 'linked key' }`; `undefined` when the owner is the entry itself |
| B7 | 2 | `agentNaming.test.ts` (new) | `agentRefusal` with a `second` for which the lookup answers `false`, for each of the two relations; with one for which it answers `true`; with no `second` | the no-op of step 10 gives the message back in the first case | the fixed sentence and the relation note in the first case; the message and no note in the two others |

For B1 and B2 the fixture is proved first, in the test: the same entry with the PIN taken off the key entry (B1), or
with a safe address on the hop (B2), gets past the refused step. A fixture that the code declines for another reason
would make the row pass for the wrong reason.

### 5.4 Guard rows (watched passing before and after)

| # | Epic | What it guards |
|---|---|---|
| G1 | 1 | An entry with `view` on and `use` off keeps the `closed` verdict (`mcpEntries.test.ts:345-361`, `:519-526`), and its refusal keeps its name and `Usable by agents` (the positive control of part A) |
| G2 | 1 | The own-only delete scope: a person's entry under `delete: 'own'` stays `closed` and named (`mcpEntries.test.ts:324-334`) |
| G3 | 1 | No usable verdict is lost: for `use`, `edit`, `create`, `delete: 'any'` and `delete: 'own'` on an agent-made entry, each set alone, the verdict of its action stays `usable` (new, in `mcpEntries.test.ts`) |
| G4 | 1 | A folder with `folderEdit` on and no delete scope keeps `closed` for delete (`mcpFolders.test.ts:130-139`); a destination with `view` only keeps `destination_closed` (new) |
| G5 | 1 | The journal of the linked run names the switch for an SSH entry with no switch at all (`agentSshGate.test.ts:237-251`). Red after A1 alone, green after A4 |
| G6 | 1 | The journal of the linked run says `hidden from agents (PIN)` for a protected SSH entry (`agentSshGate.test.ts:253-266`); no read in another account (`:268-285`) |
| G7 | 1 | An entry with a PIN of its own answers `undefined` to a direct lookup, as today (new, beside L1) |
| G8 | 1 | The decision of `creds-mcp`'s walk: `not_found` goes on, `denied` stops (`src_mcp/tests/WindowsTests.cs:30-57`, not changed) |
| G9 | 2 | On a Remote Bridge every refusal of B1-B3 is still `BRIDGE_USE_REFUSED` with its own note, byte for byte (`bridgeLinks.test.ts`, `bridgeReferences.test.ts`) |
| G10 | 2 | A refusal that names the entry itself does not change: no credential (`sshUseActions.test.ts:225`), a woven password (`sshExecAuth.test.ts:185`) |
| G11 | 2 | A hidden jump host with a SAFE address, and a hidden key entry with no PIN, stop nothing: the call goes on and `overSsh` or the spawn is reached once. Rule B changes a sentence; it does not close a road |

### 5.5 Existing tests that change, and why (epic 1)

| Test | Change |
|---|---|
| `mcpFolders.test.ts:155-168` *a move needs the grant at BOTH ends* | its closed destination gets `mcp: { view: true }`: visible, no `folderEdit`, so the answer stays `destination_closed` and the test keeps its meaning. The case with no switch is L4 |
| `mcpFolders.test.ts:170-178` *a move into the Trash is refused* | the answer is `'no_such_destination'`; the name of the test says that the Trash reads as no folder |
| `mcpFolders.test.ts:194-198` *a destination that is not a folder is told apart from one that is closed* | the name changes (A6); the assertion stays |
| `mcpFolders.test.ts:200-206` *every refusal has a sentence* | its list loses `'into_the_trash'` (the compiler forces this when the type gets smaller) |

### 5.6 Mutation checks (each one must turn a test red)

1. Remove the `shown` test from `verdictFor` → L1, L2, C-A.
2. Remove the `isOpenFolder` test from `findFolder` → L3, C-A.
3. Remove the `isOpenFolder` test from `moveRefusal` → L4, L5, C-A.
4. Make `agentMayView` answer `true` → L7, B1, B2, B3, C-B.
5. Do not set `second` in `refuseHop` → B2, B5. Do not set it in `stoppedAuth` → B1, B6.
6. Put `found === undefined` back in `whyUnusable` → G5, L6.
7. Remove one row from part A's route table → its completeness assertion (1).
8. Add a fifth allowed field to the list check → its assertion (the check compares the set of allowed fields with
   the four of §2.6).
9. Take one name off the list of twenty of §5.2 → the scan fails with that field. Put the name of the second entry
   into a relation line of the chooser → B4.

### 5.7 The harness (the real binary against the real window code; epic 1)

`src_vs_code/scripts/creds-mcp-itest.cjs` (`npm run itest:mcp`; it needs `creds-mcp` built) gets six checks, H1 to H6. It
runs the real `creds-mcp` binary against real `CredsAgentServer` windows; its folder scenarios use the real
`StorageManager` and the real `folderHooks` (`:1281-1311`).

- H1: `creds_edit_folder` on `f-shut` (a folder that nobody opened) gives the same text as on a made-up id, and the
  text does not hold the folder's name.
- H2: the move of scenario 4 (`:1383-1396`, destination `f-shut`) gives the same text as a move to a made-up id.
- H3, two windows, hidden and missing: a new level with two windows at the same time. Each window's entry lookup is
  the real `mcpUseLookup` over its own tree, wrapped only to count its calls. The newer window holds the entry with
  no switch; the older window does not hold the id. A use call gives `No CredsForDevs window answered for that
  entry.` and the stale-id hint; each window's lookup was called once; nobody was asked.
- H4, the same two windows, missing in both: the same text as H3, and the same two counts.
- H5, the same two windows, a visible denial: the newer window holds the entry with `view` on and `use` off. The
  agent reads the sentence with the entry's name and `Usable by agents`; the older window's lookup was NOT called.
- H6, the same two windows, the walk goes on: the newer window HIDES the entry (no switch) and the older window holds
  the same id with `use` on. Before this plan the newer window's `denied` stopped the walk; after it the call falls
  through, and the OLDER window answers under its own switches and consent policy (its dialog or its 12-hour allow).
  The test asserts that the older window decides, and that the answer carries nothing of the newer window (risk 5).
  (The cadence consultation fbd8b366 named it. The harness needs two discovery files: separate broker folders whose
  announcements are copied under distinct `window-*.json` names with distinct `startedAt`, and an assertion that two
  ports are discovered before H3.)

### 5.8 What the tests do not prove

- Time. No test measures it (§2.4, §8).
- A real `ssh` and a real server. B1-B3 refuse before anything is started.
- The VPN start itself. In the unit world the start is behind `deps.open`, which is a stub; part B proves the one
  sentence of the action (`agentUseActions.ts:665-672`). What `vpnRun.ts` and `dependencyRunHost.ts` say goes to the
  person's notifications, and no test of this plan reads it. The same is true for the terminal that
  `creds_open_terminal` opens.
- A reference in a field that is not a `string` or a `string[]`. The scan of §5.2 does not see an object or an array
  of objects. Today `EntityMetadata` has two `CommandArg[]` fields and one `Record<string, string>` field that hold
  text; they hold no id of an entry (read on `360d45b7`).
- Sentences outside the sites of §3. The class test covers every route of the contract and every reference field
  that exist today; a new sentence on an existing route that names a node by another road is covered only when the
  fixture reaches it.
- H1 to H6 run only where `creds-mcp` is built. The unit suite proves the window's half (part A) and the binary's
  decision (G8) apart; the harness is the one check of the two together.

## 6. Documents

- `src_vs_code/CHANGELOG.md`, under `## [Unreleased]`: a `### Changed — security` entry for each epic, with the rule
  and its cases of §3.4.
- `research/module_extension.md`. Epic 1: a paragraph *A lookup and a refusal name only what the agent may view*
  after *The gate is per action, not per call* (`:6392`), with rule A, the two functions that decide it, the four
  exceptions of §2.6 and why a lookup refusal writes no journal line; the folder paragraph (from `:6196`) says that a
  folder that is not open is absent for every verb and for a move; the linked-run paragraph (`:2460`) says how
  `whyUnusable` chooses one of three sentences. Epic 2: rule B in the same paragraph, the chooser, the relation
  lines; the protected-entry paragraph (`:1328-1336`) says that the owner of a borrowed key is no longer named in a
  refusal. No diagram shows these lookups, so none is re-rendered.
- `research/module_tests.md`: a section for the class test (part A with epic 1, part B with epic 2) and the six
  harness checks, with §5.8 as its *what it does not prove*.
- `todo/README.md`: this plan's row, and a row for each stories document when it is written. On promotion:
  `research/README.md`.
- The neighbour plans: one boundary row each (§7a), with epic 1.
- README and help: no change. No sentence there quotes one of the changed sentences (checked: `grep -c` for
  `not open to agents`, `No such entry`, `Trash is not a destination`, `is not open to you` and `jump host "` over
  `README.md`, `src_cli/README.md`, `src_mcp/README.md` and the five `help*.ts` language files gives 0 in each).
  **`README.md:139-140` and `:174-176` do NOT become wholly true by this plan.** They are true for a lookup and for
  a refusal after it. They stay not wholly true for the list answers, because of the four exceptions of §2.6. To
  change the README, or to close an exception, is part of the owner's answer to §2.6.
- `POST_DEPLOY.md`: no item. The change is logic that a green local run shows; nothing in it differs between the
  machine that builds and the machine that runs.

## 7. What this plan does NOT do

- It does not change a list answer. The four fields of §2.6 stay as they are.
- **It does not hide that a second entry exists, or its address.** A refusal for a missing jump host
  (`sshOptions.ts:148`, *the jump host … no longer exists in this vault*) is different from the fixed sentence of
  rule B and from a success, so an agent can tell a missing hop from a refused one. A hidden key entry or jump host
  that works IS used for the call: they are part of using the entry (G11). And the output of `ssh` on a call that
  answers 200 can show the address of a hop and its errors; the mask covers stored secret values, not addresses.
- It does not add a journal line for a lookup refusal (§2.5).
- It does not protect a name against a process that reads the person's files (the journal, VS Code's storage). The
  rule is about the answers of the broker.
- It does not make the two cases of rule A equal in time (§2.4).
- It does not change the product code of `creds-mcp` or `creds`, a route, a code or a tool description.
- It does not change a sentence for a node that the agent may view.
- It does not change what a Remote Bridge answers for D4 and D5, or the note that it writes (§11, N7).
- It does not change the help in five languages (§11, N2).
- It does not release. A release of the extension must follow each merge; the lead and the owner decide when.

## 7a. Neighbour plans

Each neighbour gets ONE boundary row for this plan, written in epic 1's pull request (the both-sides rule of
`planning-docs.md`), except the bridge plan and its E1 S3 spec: their owner session asked that their files not be
edited now (it would be that plan's change 8.2 and a stop), so their two rows below are OWED — written here, named
with this plan's pull request number when it exists, and taken into that plan's ledger when it opens for E1.6
(entry 1.1). N7 (the bridged refusal note at `sshUseActions.ts:132` names the key entry or jump host) goes with them. The row is the neighbour's part, said from its side. It goes into the section that the last
column names. A row of this kind changes none of the neighbour's scope, goals, Definition of Done, merge conditions,
epics, stories, build order, contract or approach, so it is not an entry of that plan's ledger. If a row makes a
sentence of a neighbour false, the repair of that sentence is judged by that plan's own change rule.

| Plan | Touches | This plan's part | The row that the neighbour gets, and where |
|---|---|---|---|
| [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) | the wall of a bridge: `closedIn`, `outOfScopeAnswer`, `bridgedRefusal`; E1.6 changes `sshUseActions.ts` and `sshExecAuth.ts` for the bridged legs | this plan edits no line of `bridgeScope.ts`. Epic 2 changes `bridgedRefusal`'s branch OFF a bridge and leaves the branch ON a bridge as it is (G9) | in its §8 *Boundaries*: the real lookup answers `closed` only for an entry that the agent may view, so an in-scope entry that is not visible reads as out of scope; the off-bridge sentences that name a second entry are this plan's (rule B); the bridged sentences and notes do not change; whichever merges second re-reads `sshUseActions.ts` and `sshExecAuth.ts` |
| [PLAN_remote_bridge_scoped_E1_S3_spec.md](PLAN_remote_bridge_scoped_E1_S3_spec.md) | the route table: `<r>` → `closed` (403 `denied`, the switch sentence) | that row stays true for an entry in scope that the agent may view; for one that it may not view the answer is the spec's own not-found answer | beside its route table (its row 7): the same sentence, with a pointer to this plan |
| [PLAN_ssh_exec_own_agent_forwarding.md](PLAN_ssh_exec_own_agent_forwarding.md) | `ssh:exec`'s argv and environment in `execOverSsh` | none: this plan changes what `execOverSsh` SAYS when it refuses, not what it starts. Disjoint lines | under its status block: this plan's epic 2 changes the third argument of the refusal function in `sshUseActions.ts`; no argv, no environment |
| [PLAN_ssh_exec_absolute_program.md](PLAN_ssh_exec_absolute_program.md) | the program that `ssh:exec` starts on Windows | none. Disjoint | under its status block: the same sentence |
| [PLAN_askpass_answers_the_hop.md](PLAN_askpass_answers_the_hop.md) | a password connection with a jump host (`sshExecAuth.ts`, `sshAskpass.ts`) | none in behaviour: epic 2 adds one field to the failure of `ExecAuth` and to the failure of `JumpChain`, and reads no password path | under its status block: the two failure types carry `second`; a new refusal on its paths that names a hop sets it |
| [PLAN_consent_coverage_per_door.md](PLAN_consent_coverage_per_door.md) | the stamp write in `credsAgentServer.ts`; it cites the 403 sentence for an own-only delete (`mayDelete`) | none: that case is an entry that the agent may view, so its sentence stays (G2). This plan edits no line of `credsAgentServer.ts` (795 of its 800 lines) | in its §5 *Out of scope*: the 403 that it cites stays for a visible entry; an entry that is not visible answers `not_found` before any stamp is read |
| [PLAN_terminal_runs_followups.md](PLAN_terminal_runs_followups.md) item 6 | `vpnOutcome` in `agentUseActions.ts` | none. Disjoint lines of the same file | under its item 6: a new failure code or sentence there names the VPN entry only, or it goes through this plan's chooser |
| [PLAN_query_refuses_client_commands.md](PLAN_query_refuses_client_commands.md) | the `query` action in `agentUseActions.ts` and `dbCliLauncher.ts` | none. Disjoint | in its §5 *Out of scope*: disjoint lines of `agentUseActions.ts` |
| [PLAN_ssh_line_runs_in_login_shell.md](PLAN_ssh_line_runs_in_login_shell.md) (added 2026-11-11, by that plan) | the VALUE of `plan.remoteCommand` that `agentUseActions.ts:418` hands to `execOverSsh` (`exec ${SHELL:-sh} -l -c '<line>'`); `remoteLaunch.ts` | none: that plan changes no line of `sshUseActions.ts` or `agentUseActions.ts` and no refusal. Both edit `CHANGELOG.md`, `module_extension.md`, `module_tests.md` and the help in other sections; the second to merge re-reads them | written in that plan's §9 |

The order: this plan needs none of them and none of them needs this plan. The table is complete for the plans that
were open on 2026-11-11 and name a file or a function that this plan changes. Method: `grep -l` over
`todo/PLAN_*.md` for `mcpEntries.ts`, `mcpFolders.ts`, `mcpFolderHooks.ts`, `brokerRequests.ts`, `mcpHooks.ts`,
`sshUseActions.ts`, `sshExecAuth.ts`, `sshOptions.ts`, `sshCredential.ts`, `agentUseActions.ts`, `bridgeScope.ts`,
`refusalFor`, `findUsableEntry`, `findFolder`, `bridgedRefusal` and `resolveJumpChain`. Two more plans matched and
share no line, and get no row: `PLAN_connect_in_a_remote_window.md` (the route of Connect in a remote window, wired
through `sshUseActions.ts`) and `PLAN_weave_time_column_choice.md` (the woven-password sentence, G10). The other E1
documents of the bridge plan (its E1 stories and the S2, S4 and S5 specs) are covered by the parent's row.

## 8. Risks

1. **An agent gets less help for an entry that it cannot see.** Today it can tell the person which switch to turn
   on. After this plan it says that the id is stale. This is the rule, not a side effect: the name was the leak. An
   entry with `view` on keeps the helpful sentence.
2. **Time is a residue** (§2.4). Not measured; a local process on the loopback could try to measure a walk of some
   steps in memory. If the owner wants it closed, that is a plan of its own.
3. **A person at the CLI reads the fixed sentence** in case 4 of §3.4, and the journal names the relation, not the
   entry. The person finds the key or the chain in the entry itself.
4. **The Trash sentence is gone** (case 5 of §3.4). An agent that tries to delete by a move gets *no folder with
   that id*.
5. **With two windows open**, a call on a hidden entry now goes on to the next window, as a call on an unknown id
   does: one more loopback request per window, and no dialog (H3). H6 tests it with the older window holding the entry with `use` on (cadence consultation fbd8b366): the
   older window decides under its own switches and consent, as for an id the newer window does not hold.
   The same fall-through happens between two accounts of one window (rows X1, X2): a hidden node in the first account lets the
   search go on to the second account. A quiet-run case follows from it: when the person turns off view, or trashes the entry, in the
   newer window, and an older window still holds the entry with use on and ask = never or a valid 12-hour stamp, the older window
   runs it with no dialog. This is a residue of rule A, for the owner (fix idea: a fresh tree per lookup, or consent only in the
   window that wrote it).
6. **A4 adds one storage read** in the gate of a linked run, in the Terminal entry's own account. The tests that
   compare the reads (`agentSshGate.test.ts:275`, `:284`, `:462`, `:676`) must stay green; `:462` shows that a bridge
   still reads nothing.
7. **Size.** `mcpEntries.ts` (563 lines), `agentUseActions.ts` (672) and `sshUseActions.ts` (453) stay under 800.
   The class test's fixture is a file of its own so that no test file passes the limit.
8. **A merge with an open branch** of a neighbour (§7a) can touch the same files; the second one re-reads them.
9. **Between the two epics** rule A is merged and rule B is not: D4 and D5 stay open in that time. They are open
   today; epic 1 does not make them worse.

## 9. Growth surfaces

None is created: no table, file, folder, cache or process. Rule B writes one more kind of line into the agent
journal, at most one for each refused call. Such a call has passed the throttle, and the journal file has its own
retention (`agentAuditFile.ts`). Rule A writes nothing.

## 10. Definition of Done

Epic 1:

- [ ] Part A of the class test was written before the fix; its first failure list is in the summary, compared with
      §3.1.
- [ ] Rows C-A and L1-L7 were watched failing by their assertions on the unchanged code, then pass; the summary quotes
      one failure message and the pass. No RED proof is a compile error.
- [ ] Guard rows G1-G8 were watched passing before and after; G5 was watched red between A1 and A4.
- [ ] For an entry, a folder, a move destination and a config id that the agent may not view, the answer is
      deep-equal to the answer for an id that does not exist, on every route of the contract that reads that id.
- [ ] The list check allows exactly the four fields of §2.6, asserts each one as it is today, and finds no other
      hidden name or hidden id in the two list answers.
- [ ] Mutations 1, 2, 3, 6, 7 and 8 of §5.6 each turned a test red.
- [ ] `npm run itest:mcp` ran with H1-H6 green, or the summary says that `creds-mcp` was not built here and who runs
      it before the release.
- [ ] Each neighbour plan of §7a has its boundary row, except PLAN_remote_bridge_scoped.md and its E1 S3 spec: their
      rows are OWED (entry 1.1) and written on this plan's side in §7a, naming this plan's pull request, for that
      plan's owner to take into its ledger at E1.6; `plan-lifecycle.mjs` is clean.
- [ ] The stale comments and the test name of A6 are changed.

Epic 2: the pass criteria of §Epics, E2, each one ticked with its observed number.

Both:

- [ ] `npm run typecheck`, `npm test` and `npm run lint` are green in `src_vs_code` at lowered priority, with a clean
      `tsc` read first. `npm run contract` leaves `contract/` unchanged. `src_mcp` has no difference in its product
      code.
- [ ] The documents of §6 for the epic are written; its CHANGELOG entry and its pull request body carry its cases of
      §3.4.
- [ ] `coai`: a `review_code` round ran on the finished branch of the epic; every finding has an accept or a reject
      with a reason; the summary has the verdicts and the number of reviewers that answered.
- [ ] `node .agents/conventions/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; a change of this plan after its
      approval is an entry of its ledger; this plan and its two stories documents are promoted together, with their
      deviations, in the task that finishes epic 2.
- [ ] The lead and the owner have heard that a release must follow, and have the questions of §2.6 and §11.

## 11. Found along the way (not built here)

- **N1, N4, N5, N6: the four fields of the list answers.** They are in §2.6, each one a question for the owner.
- **N2. The help says that the journal holds every refusal** (`helpEn.ts:137`, and the four other languages). A
  lookup refusal writes no line (`credsAgentServer.ts:734-747`). This is true before and after this plan.
- **N3. The journal is a plain file.** A process of the same user can read the names in it. A boundary of the
  product, said in §7.
- **N7. The note of a Remote Bridge refusal holds the real sentence**, with the name of the key entry or the jump
  host (`sshUseActions.ts:132`). The journal is on the computer that holds the vault, and the agent of a bridge is on
  another computer. Rule B's own note names a relation only (§2.5). The two notes are then not alike; to make the
  bridge's note name a relation too is a change of the bridge plan's text, and is not made here.
- **N8. The config-snippet lookup stops at the first account that holds the id** (`visibleConfigDetails`,
  `mcpEntries.ts:241-252`: `if (node !== undefined) return …`). After epic 1 the entry and folder lookups go on to the
  next account for a hidden node (rows X1, X2); this one does not. A config hidden in the first account and an id
  missing there then answer differently when a second account holds a visible config with the same id. Nothing is
  named and no value is given; only the answer differs. Found by the lead's Opus review of the E1 stories
  (2026-11-11). Not built here: to build it is a counted change (a new site and a new row), so it is a question for
  the owner — build it in epic 2, or as its own small item.
- **N9. `whyUnusable` says "switch is off" for an SSH node in the Trash and for a link to a folder.** The cause is another one.
  This reaches the agent journal only; the agent sees nothing of it. Known, not built.

## Epics

Two epics, by the operator's command of the plan round, after the question consultants were asked. Each epic's
stories are one document, `todo/PLAN_agent_refusal_names_unlisted_entry_E<n>.md`, written when that epic starts; it
links back here and gets its own `todo/README.md` row. This file holds no story. Fable wrote this plan and the split
(a security judgement); Opus writes each stories document; Sonnet codes; Opus reviews. Two epics give a cornerstone
quota of 1.

Cornerstones: 1 of 1 — E1.1 ([PLAN_agent_refusal_names_unlisted_entry_E1.md](PLAN_agent_refusal_names_unlisted_entry_E1.md))

### E1 · Rule A: the addressed node

- **Goal.** A lookup of an id that the agent may not view gives the answer of an id that does not exist: for an entry
  (D1), for a folder (D2) and for the destination of a move (D3, with a missing destination, one that is not a
  folder and one that is not open as one answer), on every route and through `creds-mcp` with more than one window.
- **Scope.** §2.2 to §2.6; §3.1 rows A1 to A6; §3.2; §5.1; rows C-A, L1 to L7, G1 to G8; §5.5; §5.7; mutations 1, 2,
  3, 6, 7 and 8; the documents and the neighbour rows of epic 1. It includes the shared predicate `agentMayView`
  (A5): reads the tree, is bound to one account, is tested here (L7) and is first used by epic 2.
- **Depends on.** Nothing.
- **Done when.** The *Epic 1* and *Both* items of §10 are ticked.
- **Cornerstone area (the one of this plan).** The two lookups, the shared predicate and part A of the class test. A
  mistake there is a name that leaves the vault through a call that passes every other test, and nothing after it
  catches the mistake. Epic 2 stands on the same predicate.
- **Stories.** [PLAN_agent_refusal_names_unlisted_entry_E1.md](PLAN_agent_refusal_names_unlisted_entry_E1.md),
  written 2026-11-11: E1.1 **(cornerstone)** rule A at the two lookups, with part A of the class test, `agentMayView`
  and the journal reason of a linked run; E1.2 the harness checks H1 to H6; E1.3 the documents, the neighbour rows
  and the closing checks.

### E2 · Rule B: a second entry in a refusal

- **Goal.** A refusal of `creds_exec`, of `creds_rotate` on an SSH entry and of a linked `creds_run` does not name a
  linked key entry (D4) or a jump host at any depth of the chain (D5) that the agent may not view.
- **Scope.** §3.1 rows B1 to B6, with the predicate of E1 given to the SSH actions as a lookup that is bound to the
  account of the call; §5.2; rows C-B, B1 to B7, G9 to G11; mutations 4, 5 and 9; the documents of epic 2.
- **Depends on.** E1 merged (`agentMayView`, and `shown` in the lookup).
- **Pass criteria, each one a thing that can be counted.**
  1. In each of the six rows of the scenario table of §5.2, the answer holds 0 hidden names and 0 hidden ids.
  2. For a hidden key entry that stops the call, and for a hidden unsafe hop at depth 1, 2 and 3: 4 cases on
     `ssh:exec` and 3 on the linked run (the three depths). In all 7 the body is deep-equal to
     `errorBody('no_credential', SECOND_ENTRY_REFUSED(<entry>))` and the status is 409.
  3. In the same 7 cases the journal has exactly 1 new note; it holds the relation line of §2.5; a search of the note
     for the second entry's name and for its id finds 0.
  4. With the second entry visible (2 cases: a jump host, a key entry with a damaged value) the body is byte-equal to
     the body that `360d45b7` gives, and the journal has 0 new notes.
  5. On a Remote Bridge the bodies and the notes of the cases that a bridge serves are byte-equal to those of
     `360d45b7` (G9).
  6. A hidden second entry that works stops 0 calls (G11: 2 cases).
  7. The scan of §5.2 puts each of the 25 fields in one of its two lists: 5 scenarios, 20 written non-references, 0
     in neither. Row R is green.
  8. `agentNaming.ts` has 0 imports of `vscode`. `SshUseDeps` and `AgentUseDeps` have 0 new members.
  9. Each of the mutations 4, 5 and 9 turns at least 1 test red.
  10. The *Both* items of §10 are ticked.
- **Cornerstone area.** None: the plan's one area is in E1.
- **Stories.** In `todo/PLAN_agent_refusal_names_unlisted_entry_E2.md`, written when the epic starts.
