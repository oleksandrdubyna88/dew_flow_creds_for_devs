# PLAN — The list answers name no node that the agent may not view: the dependencies, the folder, the command and the parent (N1, N4, N5, N6)

> Status: **plan only, nothing implemented yet, 2026-11-27. Not approved yet.** Scope: the extension
> (`src_vs_code/src`: `mcpEntries.ts`, `mcpFolders.ts`, `secretRef.ts`, `agentNaming.ts`, `extension.ts`, one new pure
> module, the five `help*.ts` files, their tests), the tool descriptions of `creds-mcp` (`src_mcp/src`: `Tools.cs`,
> `FolderTools.cs`, `UseTools.cs`, their tests), the generated `contract/mcp-tools-v1.json`, one harness
> (`src_vs_code/scripts/creds-mcp-itest.cjs`), `src_vs_code/CHANGELOG.md`, `research/module_extension.md`,
> `research/module_tests.md`, `todo/README.md`. One epic, five stories (`## Epics`). Two artefacts change, and each
> has its own release: the extension (the values) and `creds-mcp` (the words that describe them).
>
> The owner answered the four questions of §2.6 of
> [PLAN_agent_refusal_names_unlisted_entry.md](../research/PLAN_agent_refusal_names_unlisted_entry.md) (F7) on
> 2026-11-27. This plan builds the four answers. Each `file:line` here was read on `dbb2166d` (extension 1.24.1,
> `creds-mcp` 0.11.0). The values of §1 were also observed on that commit, on 2026-11-27, with the compiled extension
> (§1.6). A prototype of §3.1 was run in a scratch copy, not in the repository, to find the existing tests that change
> (§6.8). No ledger yet: the first approval opens `## Plan changes` under this block
> (`.agents/conventions/common/plan-change-control.md`). Five facts are not what F7 wrote (§1.5), and §14 has the
> questions for the owner. Fable wrote this plan and the split.

## 1. The defect

An agent gets two lists: `creds_list` (the entries that a person opened to it) and `creds_folders` (the folders). The
product says that each other entry is invisible to the agent (`README.md:174-176`), and that an entry with a PIN of
its own *disappears from every agent-facing surface* (`README.md:139-140`). F7 made this true for a lookup and for a
refusal. Four fields of the two SUCCESSFUL list answers still name a node that the agent may not view, or give its
id. F7 wrote them down as N1, N4, N5 and N6, pinned each one by a test as it is, and asked the owner
(`research/module_extension.md:6871-6875`).

### 1.1 N1 — `creds_list` → `entries[].dependsOn`

`dependencyNames` (`mcpEntries.ts:527-532`) gives the NAME of each node that an id in `dependsOn` (`types.ts:282`)
points to. It asks only one thing: does the node exist. It does not ask if the agent may view it. Observed, for an
entry that the agent may view and that depends on six ids:

| The dependency | Today |
|---|---|
| an entry with no switch | its name |
| an entry with a PIN of its own | its name |
| an entry in the Trash | its name |
| an id that is a FOLDER with no switch | the folder's name |
| an entry that the agent may view | its name |
| an id that no node has | nothing (it is dropped, `:524-525`) |

### 1.2 N4 — `creds_list` → `entries[].folder`

`folderNameOf` (`mcpEntries.ts:302-305`) gives the name of `resolved.folder`. `resolveMcpInTree` sets that node
(`mcpAccess.ts:323`) through `answeringFolder` (`:358-360`): the folder that ANSWERED the switches when the entry took
them from a folder, and the entry's parent in each other case. Nothing asks if the agent may view that folder.
Observed:

| The entry | Today |
|---|---|
| has switches of its own, in a folder with no switch | that folder's name |
| has switches of its own, in a folder that a person closed (`mcp: {}`) under an open folder | that folder's name |
| has switches of its own, in a folder that takes `view` from the folder above it | that folder's name (the agent may view it) |
| takes its switches from a folder | the name of the folder that answered (the agent may view it) |
| is at the root, or its parent id points to no node | `''` |

So the leak is for an entry with switches of its own only. A folder that answered with `view` is always a folder that
the agent may view: it reads the same answer for itself.

### 1.3 N5 — `creds_list` → `entries[].command`

`visibleFields` (`mcpEntries.ts:173-183`, `:180`) gives the stored command text as it is. A person can write a
reference in it: `creds://<account>/<entity path>/<field>` (`secretRef.ts:1-3`). The account is its e-mail address,
the path is folder names and then the entry's name, and a reference can name the last part of the path only
(`samePath`, `secretRef.ts:114-123`). So one reference can name an account, one or more folders, and an entry.
Observed: each reference is in the answer as the person typed it, also when it names an entry with no switch, an
entry with a PIN, or a folder with no switch.

The list has no field for the arguments of a command, a script body or the variables of a script
(`mcpEntries.ts:173-183` names seven fields). Only `command` is in scope.

### 1.4 N6 — `creds_folders` → `folders[].parent`

`viewOf` (`mcpFolders.ts:91-105`) gives `node.parentId ?? null` (`:96`). Nothing asks if the agent may view the
parent. Observed, for a folder with switches of its own:

| The parent | Today |
|---|---|
| a folder with no switch | its id |
| a folder that a person closed (`mcp: {}`) | its id |
| an id that no node has | that id |
| a folder that the agent may view | its id |
| none (the root) | `null` |

### 1.5 What is not as F7 wrote

1. **N4.** F7 said: *the NAME of the folder that the entry is in*. For an entry that takes its switches from a folder,
   the field names the folder that ANSWERED, which can be a folder above the parent (§1.2, row 4; §13, F1).
2. **N1.** F7 said: *also of one that is closed or has a PIN*. An entry in the Trash and a FOLDER id are named too.
3. **N6.** An id that no node has is served too.
4. **N5.** F7 said: *names an account and an entry*. A reference can name folders too.
5. **The lines moved.** The test of N1 is at `test/mcpEntries.test.ts:238-250` (F7: `:233-245`). The filter of a
   Remote Bridge is at `bridgeScope.ts:152` (F7: `:150`), and it filters by NAME (§2.7).

### 1.6 How the facts were found (the method)

(1) Each site of §2.6 of F7 was read again on `dbb2166d`. (2) `grep -rn` over `src_vs_code/src` for each caller and
each reader of `visibleMcpEntries`, `visibleFolders`, `mcpEntryFor`, `McpEntry` and `FolderView`: three builders, one
cache (`mcpEntriesCache.ts`), two read routes (`brokerReadRoutes.ts:128-130`, `:140-142`), the Remote Bridge
(`bridgeScope.ts:144-166`, `:211`) and `creds-mcp`. (3) `grep -rn` over `src_mcp`, `src_cli`, `src_broker_client`,
`contract/`, the two READMEs of the root and of `src_vs_code`, `src_mcp/README.md`, `src_cli/README.md` and the five
`help*.ts` files for `dependsOn`, `` `folder` ``, `` `parent` ``, `` `command` ``, `creds_list` and `creds_folders`;
each hit was read (§3.3). (4) A scratch script built a vault with the cases of §1.1 to §1.4 and printed the two lists
from the compiled extension. (5) The change of §3.1 was written in a scratch copy of the tree, compiled, and the whole
extension suite was run on it (§6.8). NOT done: a run of the real `creds-mcp` binary; a run on Windows.

## 2. The decisions

### 2.1 Words: one visibility wall

**The agent may view a node** when the node is in the list that the agent gets. This plan adds no second definition
and no new predicate. It uses the two functions that the lists and the lookups use already:

| Node | The function | What it asks |
|---|---|---|
| an entry | `shown` (`mcpEntries.ts:285-287`); for one id in one account `agentMayView` (`:296-300`) | the node is an entry; `view` is on after the ladder and the folder walk (`resolveMcpInTree`, `mcpAccess.ts:299-327`; nothing in the Trash has `view`, `:304-317`); the entry has no PIN of its own (`hiddenFromAgents`, `mcpEntries.ts:111-113`). A missing node answers `false` |
| a folder | `isOpenFolder` (`mcpFolders.ts:84-89`) | the node is a folder; it is not the Trash; it is not in the Trash; `view` is on |

`isOpenFolder` is private today. This plan exports it and changes no line of its body. Each of the two functions reads
the tree, so each caller gives it a lookup that is bound to ONE account.

**The rule of this plan.** A field of a list answer names a node, or gives its id, only when the agent may view that
node. In each other case the field holds one fixed value, and that value is the same for a node that is hidden and
for an id that points to nothing (rule A of F7, §2.6 here).

### 2.2 N1 — a dependency that the agent may not view is listed without its name

The owner: *a dependency the agent may not view is listed WITHOUT its name*.

`dependsOn` holds the name of each dependency that is an entry that the agent may view (`shown`), in the stored
order. When one id or more is not such an entry, the list ends with ONE placeholder, `HIDDEN_DEPENDENCY`.

| The dependencies of an entry | `dependsOn` after |
|---|---|
| each one an entry that the agent may view | their names, as today |
| one that the agent may view, and three that it may not (no switch, a PIN, the Trash) | `['<the name>', HIDDEN_DEPENDENCY]` |
| a folder id, or an id that no node has | `[HIDDEN_DEPENDENCY]` |
| none | `[]`, as today |

- **D1. One placeholder, at the end, for any number.** The agent needs one fact: this entry needs a thing that is
  not open to it. A placeholder for each id would also give the count and the place of the hidden ones (Q2).
- **D2. An id that no node has gives the placeholder too.** Today it is dropped. If it stays dropped, an agent can
  tell a hidden dependency from a deleted one, and rule A says that it must not. `agentMayView` answers `false` for
  the two cases already, so one test covers them. The words are true for the two cases: nothing that an agent can
  view is behind that id (Q1).
- **D3. A folder id is not a dependency that an agent may view**, also when the folder is open. `shown` asks for an
  entry. The form offers entries only; a folder id comes from an import or a sync.

### 2.3 N4 — the folder's name only when the agent may view that folder

The owner: *the name only when the agent may view that folder; otherwise `''`*.

`folder` is the name of `resolved.folder`, as today, when `isOpenFolder` is true for that node. In each other case it
is `''`. A Remote Bridge gives `''` already (`bridgeScope.ts:146`). The rows of §1.2: rows 1 and 2 become `''`; rows
3, 4 and 5 do not change.

Which folder the field names does not change (F1 of §13). Two entries with one name in two folders that are not open
both have `folder: ''` then; their ids tell them apart.

### 2.4 N5 — the command text stays; a reference to a thing that is not open becomes a placeholder

The owner: *keep the text, but replace each `creds://` reference to an entry the agent may not view with a
placeholder*.

**The scan and the parser exist, and are reused.** `REF_PATTERN` (`secretRef.ts:48`) finds each token that looks like
a reference; `parseSecretRef` (`:69-83`) reads one; `locateRef` (`:167-176`) finds the one entry that it names and
gives no reason when it finds none. `locateRef` was made for *a caller that must not see its messages*, and a Remote
Bridge uses it (`bridgeScope.ts:286-293`). This plan adds no parser.

**The rule.** Each token of the command that `REF_PATTERN` matches, in any letter case of the scheme, is KEPT only
when the three conditions are true. Each other token becomes `HIDDEN_REFERENCE`. The text between the tokens stays.

1. `locateRef` finds exactly one entry for it, in the account whose e-mail address the token names, among ALL
   entries of that account.
2. The agent may view that entry (`agentMayView`, in the account that `locateRef` gave).
3. The agent may view each folder that the token names. A token with `k` path parts names the entry and the `k - 1`
   folders above it; each of them must be `isOpenFolder`.

| The token | After |
|---|---|
| names one entry that the agent may view, with no folder part or with open folders | kept, byte for byte |
| names an entry that the agent may not view (no switch, a PIN, the Trash) | `HIDDEN_REFERENCE` |
| names an entry that the agent may view, through a folder that is not open | `HIDDEN_REFERENCE` |
| names an account that is not signed in, or an entry that no account has | `HIDDEN_REFERENCE` |
| names two entries (the product refuses such a reference as ambiguous, `secretRef.ts:146-154`) | `HIDDEN_REFERENCE` |
| starts with `creds://` and is not a reference (no field, a field that is not known) | `HIDDEN_REFERENCE` |

- **D4. Fail closed.** A token is kept only when the product's own locator finds one entry and the wall says yes. So
  a hidden entry, a missing entry, an ambiguous name and a broken token read alike (rule A), and a later change of
  the grammar cannot open a hole here (Q4).
- **D5. The whole account is searched, not the visible part.** A name that is ambiguous for the person stays
  ambiguous for the agent. `scopedRefSource` gives the same reason (`bridgeScope.ts:377-379`). The agent does not
  see what the replaced token was, so it learns nothing from the placeholder.
- **D6. The scan ignores the letter case of the scheme.** `parseSecretRef` reads `CREDS://` as a reference (`:71`),
  and `REF_PATTERN` does not find it. The run does not resolve such a token; the list must not show it either.
- **D7. A kept reference keeps the account's e-mail address.** The owner said: keep the text. The address is the
  account of an entry that the agent may view (Q3).
- **D8. Where the locator's data comes from.** The window builds one `RefSource` over its storage
  (`extension.ts:818-832`). Its two members that hold no secret, `accounts` and `entities`, move without a change
  of their bodies into a function of a new pure module. `extension.ts` calls it, and the list calls it with its own
  `McpVaultSource`. So the list and the run find the same entry for a reference. `McpVaultSource.getAccounts`
  (`mcpEntries.ts:197`) gives `{ accountId; email? }`; the real storage gives the address already
  (`StoredAccount`, `types.ts:10-14`), and a source with no address keeps no reference.

The command of an agent's run does not change. The window runs the stored text by the entry's id, not the listed
text.

### 2.5 N6 — the parent's id only when the agent may view the parent

The owner: *the id only when the agent may view the parent; otherwise `null`*.

`parent` is `node.parentId` when that id points to a node and `isOpenFolder` is true for it. In each other case it is
`null`. The rows of §1.4: rows 1, 2 and 3 become `null`; rows 4 and 5 do not change.

`null` is the value of a folder at the root today, and the type is `string | null` already (`mcpFolders.ts:33-34`).
After this plan `null` means: no folder above this one is open to you. The tool description says so (W2).

**The readers of `parent` were checked.** An agent sends a `parent` id in `creds_create_folder` and in a move
(`creds_edit_folder`). The two lookups refuse an id of a folder that is not open with the answer of a missing id
since F7 (`findFolder`, `mcpFolders.ts:135-150`; `moveRefusal`, `:196-204`). So an agent could not use a hidden
parent's id before, and it loses no call now. No request moves a folder to the root (`FolderEdit.parent` is an id,
`mcpFolders.ts:54-58`), so `null` gives no new move.

### 2.6 A hidden node and a missing id, field by field

| Field | The node is hidden (no `view`, a PIN, the Trash) | The id points to nothing | Equal? |
|---|---|---|---|
| `dependsOn` | `HIDDEN_DEPENDENCY`, once | `HIDDEN_DEPENDENCY`, once (D2; today: nothing) | yes |
| `folder` | `''` | `''` (today too) | yes |
| `command` | `HIDDEN_REFERENCE` in the place of the token | `HIDDEN_REFERENCE` (D4) | yes |
| `parent` | `null` | `null` (today: the id) | yes |

The rows E1 to E4 of §6 compare the two whole list bodies in each case. The time of the two cases is the same class
and is not measured (F7 §2.4 has the residue).

### 2.7 A Remote Bridge: nothing that it serves is meant to change

A bridge builds its row from the local row, field by field (`narrowed`, `bridgeScope.ts:144-155`).

| Field on a bridge | Today | After |
|---|---|---|
| `folder` | `''` (`:146`) | the same |
| `hasCommand` | `row.command !== undefined` (`:149`) | the same: a replaced text is not blank, so the boolean does not change. A bridge gives a boolean and no text, as before |
| `dependsOn` | the names that are also names of rows in scope (`:152`, `:162-166`) | the same, with two cases at the edge (below) |
| the folders | `[]` (`:211`) | the same |

The filter of `dependsOn` is by NAME. Two cases follow from that, and they are said here:

1. A hidden dependency that has the same name as a row in scope is listed by a bridge today. After N1 the local row
   holds the placeholder and not that name, so the bridge lists nothing for it. Less is served.
2. If a person names an entry in scope exactly as `HIDDEN_DEPENDENCY`, the placeholder passes the filter. The
   bridge then says that a dependency exists that it does not list.

This plan edits no line of `bridgeScope.ts`. Case 2 is F2 of §13, for the plan of the bridge.

### 2.8 The two placeholders

One constant each, in English, in `agentNaming.ts`, the module that holds the fixed sentence of rule B and imports
nothing (`agentNaming.ts:10-13`):

| Constant | The words |
|---|---|
| `HIDDEN_DEPENDENCY` | `(a dependency that is not open to agents)` |
| `HIDDEN_REFERENCE` | `(a creds reference that is not open to agents)` |

- The words are the owner's example for N1, in round brackets. A name of an entry has no such form by habit, so an
  agent does not read the placeholder as a name. The brackets do not make it impossible (case 2 of §2.7).
- Each one is true for a hidden node and for a missing one.
- `HIDDEN_REFERENCE` does not hold `creds://`. `REF_PATTERN` does not match it, so a second pass over a changed text
  changes nothing (row RG4).
- Each one explains itself. An agent that talks through an older `creds-mcp` reads the placeholder and no new
  description (§3.4).

## 3. The sites

### 3.1 Sites that change

| # | Story | Site | Today | After |
|---|---|---|---|---|
| P1 | S1 | `agentNaming.ts` (new exports) | — | `HIDDEN_DEPENDENCY` and `HIDDEN_REFERENCE` of §2.8 |
| A1 | S1 | `mcpEntries.ts:527-532`, `dependencyNames` | the name of each node that exists | the names of the dependencies that are `shown`; `HIDDEN_DEPENDENCY` once at the end when one id or more is not (§2.2) |
| A2 | S1 | the comments at `mcpEntries.ts:59-60`, `:89-90`, `:518-526` | *The names this entry needs*; *dropped rather than named* | say the rule of §2.2 and D2 |
| B1 | S2 | `mcpFolders.ts:84`, `isOpenFolder` | private | exported; the body does not change |
| B2 | S2 | `mcpEntries.ts:302-305`, `folderNameOf`; its call at `:278` | `resolved.folder?.name ?? ''` | the name when `isOpenFolder(resolved.folder, byId)`; else `''` |
| B3 | S2 | the comments at `mcpEntries.ts:39-40`, `:302` and `mcpAccess.ts:351-356` | *an entry that decided for itself still tells an agent which folder it is in* | say that the name is given only for a folder that the agent may view |
| C1 | S3 | `secretRef.ts` (new export, beside `findSecretRefs`, `:86-94`) | — | `rewriteRefTokens(text, rewrite)`: gives each token that `REF_PATTERN` matches, in any letter case of the scheme, to `rewrite`, and returns the text with the answers in their places. `REF_PATTERN` and `findSecretRefs` do not change |
| C2 | S3 | a new pure module (no `vscode`), and `extension.ts:819-828` | `accounts` and `entities` of the window's `RefSource` are written in `extension.ts` | one function gives the two members over a source that has `getAccounts` and `getNodes`; `extension.ts` builds its `RefSource` from it and adds `fieldReading` (`:829-831`), as today |
| C3 | S3 | `mcpEntries.ts:197`, `McpVaultSource.getAccounts` | `readonly { accountId: string }[]` | `readonly { accountId: string; email?: string }[]` |
| C4 | S3 | `mcpEntries.ts:173-183` (`:180`), `:139-159`, `:78-91`, `:266-282` | `command: blankToUndefined(details.command)` | the text of §2.4. `McpEntryContext` gets one REQUIRED member, `keepsReference: (token: string) => boolean`, so a caller that forgets it does not compile; `entryIfVisible` gives the function of the three conditions, with the locator of C2 built once for a listing |
| C5 | S3 | the comment at `mcpEntries.ts:47-49` | *Not a secret: it is what the person typed* | adds: a reference to a thing that the agent may not view is shown as `HIDDEN_REFERENCE` |
| D1 | S4 | `mcpFolders.ts:96`, in `viewOf` | `node.parentId ?? null` | the id when the parent exists and `isOpenFolder`; else `null` |
| D2 | S4 | the comment at `mcpFolders.ts:33-34` | *`null` at the root* | *`null` when no folder above it is open to the agent, the root too* |
| W1 | S5 | `src_mcp/src/Tools.cs:133-151`, `ListDescription` | names `folder`; says nothing of `dependsOn` and `command` | Appendix B, text 1 |
| W2 | S5 | `src_mcp/src/FolderTools.cs:24-40` (`:29`), `ListDescription` | *Each carries `id`, `name`, `parent`, …* | Appendix B, text 2 |
| W3 | S5 | `src_mcp/src/UseTools.cs:84-90`, the description of `creds_run` | *its own `command` field tells you what it will do* | Appendix B, text 3 |
| W4 | S5 | `src_mcp/src/UseTools.cs:109-116`, the description of `creds_vpn_up` | *when an entry's `dependsOn` names a VPN* | Appendix B, text 4 |
| W5 | S5 | `contract/mcp-tools-v1.json:353`, `:408`, `:564`, `:610` | the four old descriptions | regenerated by `npm run contract:mcp` from the built binary; no hand edit (`:2`) |
| W6 | S5 | line 132 of `helpEn.ts`, `helpDe.ts`, `helpEs.ts`, `helpRu.ts`, `helpUk.ts` (`usage` of `agent-surface`) | the fields of the two lists | each of the two bullets gets one sentence (Appendix A) |
| W7 | S5 | `src_vs_code/scripts/creds-mcp-itest.cjs:192-210`, `:947`, `:952` | one stub row; no check of `command` or of a folder's `parent` | a second stub row and one stub folder with the new values; four checks (H1, §6.6) |

`McpVaultSource` gets no new member (C3 widens one). `BridgeWallSource`, the broker hooks, `SshUseDeps` and
`AgentUseDeps` get no new member. `mcpAccountVault.ts:15-26` hands the accounts on as they are, so it needs no edit.

`mcpEntries.ts` is 586 lines. The lint limits are 800 lines for a file, 50 lines and a complexity of 4 for a function
(`src_vs_code/eslint.config.mjs:30-32`). The check of the three conditions is more than one function. If
`mcpEntries.ts` would get near the limit, the coder puts the three field builders in a module of their own that takes
the two predicates as functions, as `agentRefusal` takes `mayView` (`agentNaming.ts:30-34`).

### 3.2 Sites that were checked and do not change

| Site | Why it stays |
|---|---|
| `shown`, `agentMayView` (`mcpEntries.ts:285-300`), the body of `isOpenFolder`, `resolveMcpInTree`, `answeringFolder` | they are the wall; this plan asks them and does not change them |
| `findUsableEntry`, `findFolder`, `moveRefusal`, `visibleConfigDetails` | lookups; rule A is there since F7 and since 1.24.1 |
| `bridgeScope.ts` (each line), `bridgeWallSource.ts:24`, `mcpAccountVault.ts` | §2.7. The wall lists through `visibleMcpEntries` with one account, so a reference to another account is not kept there; the bridge makes a boolean of the text |
| `mcpEntriesCache.ts`, `extension.ts:481-486` | the cache is forgotten on each change of the vault (`mutated`); a row that now depends on a second node is built again when that node changes |
| `brokerReadRoutes.ts:128-142`, `mcpFolderHooks.ts:30` | they hand the two lists on |
| `parseSecretRef`, `findSecretRefs`, `locateRef`, `locate`, `runPlan.ts`, `commands/runCommands.ts` | the grammar and the run do not change; the list reads them |
| `quickOpen.ts:58-68`, `folderPath` | the one walk for *where a node is*; C2 calls it as `extension.ts:824-827` does |
| `src_mcp/src/McpJsonContext.cs:50-68`, `:115-122` | the records carry the four fields already: `Folder` is a string (`:54`), `Command` a string (`:61`), `DependsOn` a string array (`:67`), `Parent` a string that can be null (`:118`). `creds-mcp` reads the window's answer into them and writes them out again (`Tools.cs:164-174`, `FolderTools.cs:106-115`) |
| `src_mcp/src/UseTools.cs:225-227` and `contract/mcp-tools-v1.json:47` (`creds_create`: *creds_list shows the folders entries live in*) | a new entry goes into a folder that has `create` (`creatableFolders`, `mcpCreate.ts:94-118`); such a folder has `view`, so its name stays in the list |
| `src_cli`, `src_broker_client` | no line reads `/v1/mcp/entries` or `/v1/mcp/folders` (checked: `grep -rln` for `mcp/entries`, `mcp/folders` and `dependsOn` finds one test of the route table in `src_broker_client/tests`) |
| `contract/broker-v1.json` | no route, code or status changes; it holds no name of a list field |
| `README.md`, `src_vs_code/README.md`, `src_mcp/README.md`, `src_cli/README.md` | no sentence names one of the four fields (checked, §1.6). `README.md:139-140` and `:174-176` get truer and need no edit; §8 has what stays |

### 3.3 What changes for an agent or a script (the contract, said explicitly)

Four values of two documented answers change. No route, status, error code, field name or field type changes:
`folder` is a string, `dependsOn` an array of strings, `command` a string or absent, `parent` a string or `null`,
before and after.

| # | The answer | Before | After |
|---|---|---|---|
| 1 | `creds_list` → `dependsOn` | the name of each dependency that exists | the names of the dependencies that the agent may view; then `(a dependency that is not open to agents)` once when there is one more. A deleted dependency, dropped before, counts as one more |
| 2 | `creds_list` → `folder` | the folder's name, also for a folder that is not open | `''` for a folder that is not open |
| 3 | `creds_list` → `command` | the stored text | the stored text; each `creds://` token that is not a reference to things that the agent may view reads `(a creds reference that is not open to agents)` |
| 4 | `creds_folders` → `parent` | the parent's id, also for a parent that is not open or that does not exist | `null` for such a parent |

**Each place that documents these fields, and what changes there.**

| Place | Changes? |
|---|---|
| `src_mcp/src/Tools.cs`, `FolderTools.cs`, `UseTools.cs` (the tool descriptions, in C#) | yes: W1 to W4 |
| `contract/mcp-tools-v1.json` (generated from the built `creds-mcp`) | yes: four descriptions, by regeneration (W5). No input schema changes; the file has no output schema |
| `contract/broker-v1.json` | no |
| `src_mcp/src/McpJsonContext.cs` (the records) | no (§3.2) |
| `src_cli` | no: it does not read the lists |
| the help, five languages | yes: W6 |
| the four READMEs | no (§3.2) |
| `src_vs_code/CHANGELOG.md` | yes: a `### Changed — security` entry with this table |
| `src_mcp/RELEASES.md` | written by release-please from the commit; not by hand |
| `research/module_extension.md`, `research/module_tests.md` | yes (§7) |

**`npm run contract` and the contract suite.** `npm run contract` writes `contract/broker-v1.json` from the compiled
extension (`src_vs_code/package.json:82`); it must leave no difference. `npm run contract:mcp`
(`package.json:83`) writes `contract/mcp-tools-v1.json` from the built `creds-mcp`; it must give the four new
descriptions and nothing more, and the script refuses a binary that is older than its sources
(`scripts/emit-mcp-tools.mjs:22-25`). The `.http` contract suite is the suite of the server (`http/`); the server
does not change and the suite is not touched.

### 3.4 `creds-mcp` needs a release too, and the two releases do not wait for each other

The values come from the window. The words come from the `creds-mcp` binary. So S1 to S4 ship with an extension
release, and S5's descriptions ship with a `mcp-v` release. The extension release goes first.

| The window | `creds-mcp` | What the agent reads |
|---|---|---|
| old | old | today's values and words |
| new | old | the new values; the old words. The placeholders explain themselves (§2.8). The old words do not say that `parent: null` can be a folder under a closed one |
| new | new | the new values and the new words |
| old | new | the old values; the new words say that a hidden thing is not named, and that window still names it. This is today's leak for a window that was not updated; no call fails |

One more case is the same as in F7: `creds-mcp` joins the lists of each open window and keeps the first row for an
id (`Tools.cs:187-202`). A window of an older extension that holds the same vault still gives the old row. The fix is
complete when each window runs the new extension.

## 4. Growth surfaces

None is created: no table, folder, cache, process or journal line. The list cache holds the same number of rows.

## 5. Build order

One epic, five stories, on `fix/agent-list-fields-hidden` (from `main` at `dbb2166d`), in a worktree of its own.

1. **Before the first test.** The lead puts the questions of §14 to the question consultants, and asks them what is
   important before the split is final. Then the `coai` plan round, with the lead's own Opus review at the same time.
   Its pass opens the ledger.
2. **S1 (N1).** P1 first (two constants). Rows D1 to D5 and E1 RED, each watched failing by its assertion on the
   unchanged code; the coder keeps the messages. Then A1 and A2. Guards DG1 and DG2. Mutations M1 to M3.
3. **S2 (N4).** Rows F1, F2 and E2 RED. Then B1 to B3. Guards FG1 to FG3. Mutations M4 and M5.
4. **S3 (N5).** Rows R1 to R7 and E3 RED. Then C1 to C5. Guards RG1 to RG4. Mutations M6 to M10.
5. **S4 (N6).** Rows P1 to P3 and E4 RED. Then D1 and D2. Guards PG1 and PG2. Mutations M11 and M12.
6. **The class test, after S4.** Row L1 replaces the list check of F7 (§6.5). The four existing tests of §6.8 change
   with the story that makes each one red.
7. **S5.** Rows T1 to T3 RED first. W1 to W4, then the build of the solution, the check H2, and `npm run contract:mcp` (W5).
   W6 and W7. The documents of §7.
8. `npm run typecheck`, `npm test`, `npm run lint` and `npm run ratchet` in `src_vs_code`, at lowered priority, with
   the exit of `tsc` read first. `npm run contract` leaves no difference in `contract/broker-v1.json`. The build of
   the solution has 0 warnings, and the test executable of `creds-mcp` is green.
9. The `coai` code round on the finished branch, with the Opus code review at the same time; then the pull request.
   Its body has §3.3, §3.4, the verdicts and the number of reviewers that answered.
10. After the merge: the extension release first, then the `mcp-v` release (§3.4). The lead and the owner decide
    when.

One file of the suite runs through the same runner: `npm run compile`, then
`node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`.

## 6. Test plan

Each RED row is a test of behaviour: it builds a vault, calls the product's own list function or the real read route,
and asserts the value that comes back. No row of S1 to S4 reads a source file. Each RED row has a mutation of §6.7
that turns it red. The rows of S5 are content rows: a tool description and a help sentence have no other behaviour.

### 6.1 The worlds

- **The new suite**, `src_vs_code/src/test/listFieldsHidden.test.ts`. `test/mcpEntries.test.ts` is 764 lines, so the
  rows do not go there. Each row builds its own small vault with the helpers of the suite (a folder, an entry, a
  source with one account or two, each account with an e-mail address).
- **The class test**, `test/agentNamesOnlyViewable.test.ts`, over `test/unlistedWorld.ts`. The fixture has the four
  cases already (`unlistedWorld.ts:72-77`, `:84-85`, `:109-111`). Its source gets an e-mail address for the account
  (`:116`), and `N5_COMMAND` (`:88-89`) names that address in place of the account id.
- **The pair worlds of rule A.** For each field, two vaults that differ in one thing: in the first the second node
  is hidden, in the second it is not there. Each E row asserts that the two list bodies are deep-equal.

### 6.2 S1 (N1) — `dependsOn`

| # | Kind | The entry depends on | Today (observed) | After |
|---|---|---|---|---|
| D1 | RED | one entry with no switch | `['<its name>']` | `[HIDDEN_DEPENDENCY]` |
| D2 | RED | one entry with a PIN and every switch on; one entry in the Trash with every switch on (two cases) | the name | `[HIDDEN_DEPENDENCY]` |
| D3 | RED | a folder id (a folder with no switch; an open folder) | the folder's name | `[HIDDEN_DEPENDENCY]` |
| D4 | RED | an entry that the agent may view, then three that it may not | four names | `['<the visible name>', HIDDEN_DEPENDENCY]`: one placeholder, at the end |
| D5 | RED | one id that no node has | `[]` | `[HIDDEN_DEPENDENCY]` |
| E1 | RED | the pair: a hidden entry; the same id with the node taken out | the bodies differ | the two bodies are deep-equal |
| DG1 | guard | two entries that the agent may view; none | their names in the stored order; `[]` | the same |
| DG2 | guard | an id that the entry's own account does not hold, and that a SECOND account holds as an entry that the agent may view | the name of that entry is not in the row (the row is `[]`: the lookup is bound to the entry's account) | the name is not in the row (the row is `[HIDDEN_DEPENDENCY]`): the wall is asked in the entry's own account only |

In each RED row the test also asserts that the body of the list holds no name and no id of the hidden node.

### 6.3 S2 (N4) — `folder`

| # | Kind | The entry | Today (observed) | After |
|---|---|---|---|---|
| F1 | RED | switches of its own, in a folder with no switch | the folder's name | `''` |
| F2 | RED | switches of its own, in a folder with `mcp: {}` under an open folder | the folder's name | `''` |
| E2 | RED | the pair: the folder with no switch; the same `parentId` with the folder taken out | the bodies differ | deep-equal |
| FG1 | guard | switches of its own, in a folder that takes `view` from the folder above it | the parent's name | the same |
| FG2 | guard | no switch of its own, under a silent folder, under an open folder | the name of the open folder (the one that answered) | the same |
| FG3 | guard | at the root | `''` | the same |

### 6.4 S3 (N5) — `command`

The account has the e-mail address `me@x.test`. `V` is an entry that the agent may view; `H` is one with no switch.

| # | Kind | The command holds | Today (observed) | After |
|---|---|---|---|---|
| R1 | RED | `creds://me@x.test/H/password` | as typed | `HIDDEN_REFERENCE` in its place; the text before and after it stays |
| R2 | RED | a reference to an entry with a PIN; to an entry in the Trash | as typed | `HIDDEN_REFERENCE` |
| R3 | RED | `creds://me@x.test/<a folder with no switch>/V2/password`, where `V2` has switches of its own in that folder | as typed | `HIDDEN_REFERENCE` (the folder is named) |
| R4 | RED | a reference to an account that is not there; to a name that no entry has | as typed | `HIDDEN_REFERENCE` |
| R5 | RED | a name that two entries have, one that the agent may view and one hidden | as typed | `HIDDEN_REFERENCE` |
| R6 | RED | `creds://me@x.test/H` (no field) and `creds://me@x.test/H/salary` (a field that is not known) | as typed | `HIDDEN_REFERENCE` |
| R7 | RED | `CREDS://me@x.test/H/password` | as typed | `HIDDEN_REFERENCE` |
| E3 | RED | the pair: R1; the same command with `H` taken out of the vault | the bodies are equal today too, and hold the name | deep-equal, and the name of `H` is in neither |
| RG1 | guard | `creds://me@x.test/V/password`; `creds://ME@X.TEST/v/totp`; `creds://me@x.test/<an open folder>/V/password` | as typed | the same, byte for byte |
| RG2 | guard | a reference to an entry of a SECOND account that the agent may view there | as typed | the same: the wall is asked in the account that the reference names |
| RG3 | guard | a command with no token (`tmux {name}`); a blank command | the text; no `command` key | the same (the test at `test/mcpEntries.test.ts:290` stays green with one added member, §6.8) |
| RG4 | guard | the answer of R1, given to the same function a second time | — | the same text: `HIDDEN_REFERENCE` is not a token (§2.8) |

E3 is RED by its second assertion. A source with no e-mail address keeps no reference; the row RG1 fails then, so the
suite cannot pass with a locator that finds nothing.

### 6.5 S4 (N6) — `parent`, and the class row

| # | Kind | The folder has switches of its own, and its parent is | Today (observed) | After |
|---|---|---|---|---|
| P1 | RED | a folder with no switch | the parent's id | `null` |
| P2 | RED | a folder with `mcp: {}` under an open folder | the parent's id | `null` |
| P3 | RED | an id that no node has | that id | `null` |
| E4 | RED | the pair: P1; the same `parentId` with the parent taken out | the bodies differ | deep-equal |
| PG1 | guard | a folder that the agent may view (its own switch; `view` from above) | the parent's id | the same |
| PG2 | guard | none (the root) | `null` | the same |

| # | Kind | What | Today | After |
|---|---|---|---|---|
| L1 | RED | the class test, through the real read routes of the real broker: the bodies of `GET /v1/mcp/entries` and `GET /v1/mcp/folders` over `unlistedWorld.ts` | the bodies hold the name of the hidden dependency, the name of the hidden folder, the reference with the hidden name, and the id of the hidden parent (`agentNamesOnlyViewable.test.ts:336-339`) | no hidden NAME and no hidden ID is in the two bodies, with no exception. The four rows hold the new values: `[HIDDEN_DEPENDENCY]`, `''`, `HIDDEN_REFERENCE`, `null`. The list `EXCEPTIONS` (`:312-317`) is removed |
| LG1 | guard | completeness 4 of the same file (`:360-369`): a node that the agent MAY view is named | green | green, with no change of a line |

### 6.6 S5 — the words, the bridge and the binary

| # | Kind | What | Today | After |
|---|---|---|---|---|
| T1 | RED, content | in a TypeScript test: the description of `creds_vpn_up` in `contract/mcp-tools-v1.json` holds the value of `HIDDEN_DEPENDENCY`; the description of `creds_run` and of `creds_list` holds the value of `HIDDEN_REFERENCE` | the words are not there | they are there. The row joins the constant of the extension and the text of the binary through the generated file |
| T2 | RED, content | in `src_mcp/tests/ToolsTests.cs`, beside `:112-113` and `:249-251`: `Tools.ListDescription` holds the sentence about `folder`; `FolderTools.ListDescription` holds the sentence about a `null` parent | not there | there |
| T3 | RED, content | for each language of `HELP_LANGUAGES`: `usage` of `bodyFor(helpArticle('agent-surface'), language)` holds the two sentences of Appendix A, and `fallback` is false | not there | there |
| H1 | guard | the harness (`creds-mcp-itest.cjs`), the real binary over a stub window: a row with `folder: ''`, `dependsOn` ending with the placeholder and a `command` with the placeholder; a folder with `parent: null` | not checked | the four values cross the binary as they are: `folder` is the empty string, `parent` is `null` and the key is present |
| H2 | check, watched | `node scripts/emit-mcp-tools.mjs --check` after W1 to W4 are built and before W5 | it passes on the unchanged code | it fails and names the command that rebuilds the file; after W5 it passes |
| BG1 | guard | on a Remote Bridge (`test/bridgeWallWorld.ts`), a row in scope that depends on a hidden entry, has switches of its own in a closed folder, and holds a reference to a hidden entry | `dependsOn` has no name of it; `folder` is `''`; `hasCommand` is `true`; the folders are `[]` | the same, and the served body holds neither placeholder |
| BG2 | guard, no edit | `test/bridgeReadShape.test.ts`: RS1, RS2 (`:117-130`), RS4, RS5, RS6; `test/bridgeScope.test.ts`; `test/bridgeScopeWalk.test.ts` | green | green, with no change of a line |
| G1 | guard | a vault in which the agent may view each node: the two list bodies | a literal that the coder takes from the unchanged code | equal to that literal: no other field changes |

### 6.7 Mutation checks (each one alone, restored after; each must turn its rows red)

| # | The mutation | Turns red |
|---|---|---|
| M1 | in A1, name each dependency that exists (take `shown` out) | D1, D2, D3, D4, E1, L1 |
| M2 | in A1, drop an id that no node has | D5, E1 |
| M3 | in A1, one placeholder for each hidden dependency, in its place | D4 |
| M4 | in B2, give the name with no test of the folder | F1, F2, E2, L1 |
| M5 | in B2, test the entry's parent in place of `resolved.folder` and give the parent's name | FG2 |
| M6 | in C4, keep each token that `locateRef` finds (take the test of the entry out) | R1, R2, L1 |
| M7 | in C4, take the test of the named folders out | R3 |
| M8 | in C4, replace only a token that is found and hidden; keep the others | R4, R5, R6 |
| M9 | in C1, scan with the letter case of `REF_PATTERN` | R7 |
| M10 | in C4, search the entries that the agent may view only | R5 |
| M11 | in D1, give `node.parentId ?? null` | P1, P2, P3, E4, L1 |
| M12 | in D1, test only that the parent exists | P1, P2 |
| M13 | in W4, put the old description back and regenerate | T1 |
| M14 | put the old `usage` back in ONE language (each of the five in turn) | T3, for that language |
| M15 | in `narrowed` (`bridgeScope.ts:152`), take the filter out | BG1 |

### 6.8 Existing tests that change, and why

Found by the prototype of §1.6. The whole extension suite ran on the prototype in a scratch copy: 8,602 tests, 8,552
passed, 44 were skipped and 6 failed. Four of the six failed by this change, and they are the rows of this table. The
two others are not of this change (§6.9).

| Test | Why it goes red | What changes |
|---|---|---|
| `test/agentNamesOnlyViewable.test.ts:331-346`, *the list check: the four exceptions …* | it pins the four values as they are today; F7 wrote it to go red when the owner closes an exception | it becomes row L1 |
| `test/mcpEntries.test.ts:88-109`, *an entry appears once its own switch is on …* | `:106` expects the name of a folder that has no switch | the folder of the fixture gets `view`; the row keeps its other assertions. F1 holds the case that it had |
| `test/mcpEntries.test.ts:238-250`, *dependencies are named, never given as ids* | the dependency of its fixture has no switch, and a second id points to nothing; it expects the name and a drop | the dependency gets `view` and the row expects the name and one placeholder for the missing id; its comment says the rule of §2.2 |
| `test/bridgeReadShape.test.ts:209-227`, RS3 | its control says that the MAIN port serves `deploy creds://acct@example.test/outside/db/password` whole (`:150`, `:223`); the world has no entry of that path (`bridgeWallWorld.ts:73`, `:95`), so the local list replaces it | the control of the command names an entry that the agent may view, and the world's accounts get their e-mail address (`bridgeWallWorld.ts:189`); what the test asserts about the BRIDGE does not change |

Three call sites give a context to `mcpEntryFor` by hand (`test/mcpEntries.test.ts:277`, `:295`, `:531`). Each one
gets the new required member of C4. It is a change of the type, not of an assertion.

### 6.9 What the tests do not prove

- A real window with a real `creds-mcp` and a real agent. H1 runs the real binary over a stub window; L1 runs the
  real broker over a test vault.
- The prototype is not the product code. It showed which tests go red; the coder's change is tested by the rows.
  Two more tests failed in the run on the scratch copy, and neither is of this change. C13 of
  `test/bridgeConsent.test.ts` (`:579`) timed out in the full run and passed alone on the same build. One test of
  `test/leftoversRunnerSweep.test.ts` failed because the scratch copy is not a git repository (`git worktree list`
  failed); it passed in the worktree. The full run of step 8 is the proof for the built branch.
- Free text. A command, a name or a host that a person typed can hold any word, also the name of another entry. The
  rule is about the tokens that start with `creds://` (§8).
- Windows. The extension suite runs on Ubuntu in CI; no row depends on the system.
- The four translations of Appendix A. T3 pins the text. A native reader of each language should read its two
  sentences before the merge.
- Time. The pair rows compare bodies, not durations.

## 7. Documents

- `src_vs_code/CHANGELOG.md`, under `## [Unreleased]`: a `### Changed — security` entry with the table of §3.3, the
  two placeholders, what a Remote Bridge serves (§2.7), and §3.4 (a window of an older extension, and `creds-mcp`
  before its own release).
- `research/module_extension.md`: the paragraph *A lookup and a refusal name only what the agent may view*
  (`:6852-6875` today) loses the sentence about the four fields that are not covered (`:6871-6875`) and gets the
  rule of §2.1 for the list answers, with the three functions that decide it and the table of §2.6; the bridge
  paragraph (`:3913` today) gets one clause about the placeholder and the filter by name. No diagram shows a list
  field, so none is drawn again.
- `research/module_tests.md`: the row of the list check (`:2356` today) becomes row L1; the suite
  `listFieldsHidden.test.ts` gets its rows, with §6.9 as its *what it does not prove*; the harness check H1.
- `todo/README.md`: this plan's row (it is there). On promotion: `research/README.md`, and the pointers of F7 change
  from `../todo/` to a sibling link.
- The READMEs: no edit (§3.2).
- `POST_DEPLOY.md`: no item. It is the list of the server.

## 8. What this plan does NOT do

- It does not change a lookup, a refusal, a route, an error code or a field type.
- It does not hide free text. A command can name anything in words that are not a `creds://` token. So
  `README.md:139-140` and `:174-176` are true for the names and ids that the product itself writes into a list, and
  not for words that a person typed into an entry that they opened.
- It does not hide the e-mail address of the account in a reference that is kept (D7, Q3).
- It does not change which folder `folder` names (F1).
- It does not change `connectionString`. The plan of the bridge records that the local list strips the password of
  one dialect of four, and gives that to a todo of its own
  ([PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md), §8 *Boundaries*).
- It does not change what a Remote Bridge serves, and it edits no line of `bridgeScope.ts` (§2.7, F2).
- It does not change the product code of `creds` (`src_cli`) or the records of `creds-mcp`.
- It does not make the time of a hidden node and of a missing id equal by a measure.
- It does not release. Two releases must follow the merge, in the order of §3.4.

## 9. Neighbour plans

| Plan | Touches | This plan's part | The row that the neighbour gets |
|---|---|---|---|
| [PLAN_agent_refusal_names_unlisted_entry.md](../research/PLAN_agent_refusal_names_unlisted_entry.md) (F7, implemented) | rule A and rule B; N1, N4, N5 and N6 of its §2.6 and §11 | this plan builds the owner's four answers and nothing more of F7. N3 and N7 stay there | written in this commit: its status block, its §2.6, its §11 and its §12 point here |
| [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) | the wall's rows (`narrowed`, its §4.2); its §8 says that the LOCAL list's `connectionString` and `command` go to *a new todo, E4 writes it* | this plan takes the `command` half of that row: a reference to a thing that the agent may not view. It edits no line of `bridgeScope.ts`; it changes one control and the accounts of the world in two test files of that plan (`bridgeReadShape.test.ts`, `bridgeWallWorld.ts`, §6.8) | OWED, in its §8 *Boundaries*: the `command` half of that row is this plan's; `connectionString` stays there; the local row can now hold two fixed placeholders, and the filter of `dependsOn` by name passes one when a row in scope has that name (F2). That plan is under change control (epoch 11), so its owner session writes the row |
| [PLAN_creds_cli_reachable_from_every_caller.md](PLAN_creds_cli_reachable_from_every_caller.md) | `src_mcp/src/Tools.cs:36` (another description), `Program.cs`, `creds-mcp-itest.cjs`; a `mcp-v` release of its own | none in behaviour. The two plans edit other constants of `Tools.cs`, and each one regenerates `contract/mcp-tools-v1.json` | under its story B2: the second one to merge regenerates the contract file again and reads the first one's descriptions |
| [PLAN_consent_coverage_per_door.md](PLAN_consent_coverage_per_door.md) | the consent stamps in `mcpEntries.ts` (`worthRemembering`, `:584-586` today) | none. Disjoint lines of the same file | no row: no shared function |

The order: this plan needs no other plan, and no other plan needs this one. Method: `grep -lE` over `todo/PLAN_*.md`
for `mcpEntries.ts`, `mcpFolders.ts`, `secretRef.ts`, `agentNaming`, `quickOpen`, `isOpenFolder`,
`visibleMcpEntries`, `dependsOn`, `McpJsonContext`, `mcp-tools-v1`, `Tools.cs`, `FolderTools.cs`, `UseTools.cs`,
`creds-mcp-itest`, `bridgeReadShape`, `bridgeWallWorld` and `agent-surface`. These also matched and share no line,
and get no row: `PLAN_tails_2.md` (it names the help article as its source, and edits no sentence of it),
`PLAN_test_leftovers_E2.md` and its brief (the temp folders of the harness), `PLAN_connect_in_a_remote_window.md`
and `PLAN_sync_says_what_already_happened.md` (other lines of `extension.ts`). Five other open plans name the help files
(`grep -lE` for `helpEn.ts`, `help*.ts` and `helpDe`), and none of them names the article `agent-surface`; a
branch that merges second reads line 132 again.

## 10. Risks

1. **An agent loses a name that it used.** `dependsOn` no longer names a VPN that is not open to the agent, so the
   agent cannot tell the person WHICH one. It can say that one is needed and not open; the person sees the
   dependencies on the entry's card. This is the owner's answer.
2. **D2 changes a silence into a placeholder.** An entry with a dependency that was deleted now lists the
   placeholder. If the owner says no to Q1, row D5 and mutation M2 change sides, E1 goes, and the table of §2.6
   gets one *no*.
3. **A reference to an entry that the agent may view is replaced** when the name is ambiguous, when the token is
   broken, or when no account of the source has an e-mail address. The direction is safe, and the person's run does
   not change. RG1 keeps the good case.
4. **The refactor of C2 is in `extension.ts`**, which no unit test loads. The bodies move with no change, and
   `tsc` checks the types. The alternative copies eight lines and can drift (Q5).
5. **`parent: null` reads as the root.** An agent that draws the tree puts such a folder at the top. W2 says what
   `null` means.
6. **An entry named as a placeholder.** §2.7, case 2. Not built (F2).
7. **Two releases.** Between them an agent reads the new values with the old words (§3.4).
8. **A text that the sweep of §1.6 missed.** The method is a `grep` for the field names. A sentence that describes
   a field in other words is not found.
9. **Size.** `mcpEntries.ts` (586 lines) and `test/agentNamesOnlyViewable.test.ts` (647) stay under 800;
   `test/mcpEntries.test.ts` (764) gets no row.

## 11. Definition of Done

- [ ] Each RED row of §6.2 to §6.5 was watched failing by its assertion on the unchanged code, then passes; the
      summary quotes one failure message of each story and the pass. No RED proof is a compile error.
- [ ] Rows E1 to E4: the two bodies of each pair are deep-equal.
- [ ] Row L1: the two list bodies of the class test hold 0 hidden names and 0 hidden ids, and `EXCEPTIONS` is gone.
- [ ] Each guard row was watched passing before and after; the tests named *no edit* have no changed line.
- [ ] Mutations M1 to M15 each turned its rows red and were restored.
- [ ] The four existing tests of §6.8 changed as that table says, and no other existing assertion changed.
- [ ] `npm run typecheck`, `npm test`, `npm run lint` and `npm run ratchet` are green in `src_vs_code` at lowered
      priority, with a clean `tsc` read first. `npm run contract` leaves `contract/broker-v1.json` unchanged.
      `npm run contract:mcp` changed four descriptions in `contract/mcp-tools-v1.json` and nothing more.
- [ ] The solution builds with 0 warnings; the test executable of `creds-mcp` is green; `npm run itest:mcp` is
      green with H1. `src_cli` and `McpJsonContext.cs` have no difference.
- [ ] `bridgeScope.ts` has no difference.
- [ ] The documents of §7 are written; the CHANGELOG entry and the pull request body carry §3.3 and §3.4.
- [ ] The owed row of §9 is with the session that owns the bridge plan; the summary says so.
- [ ] `coai`: a `review_plan` round passed before the first test; a `review_code` round ran on the finished branch;
      each finding has an accept or a reject with a reason; the summary has the verdicts and the number of
      reviewers that answered.
- [ ] `node .agents/conventions/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; a change of this plan after its
      approval is an entry of its ledger; the plan is promoted with its deviations.
- [ ] The summary names the models and the counts of the launches.
- [ ] The lead and the owner have heard that two releases must follow, in the order of §3.4, and have the questions
      of §14.

## 12. Deviations — what shipped differently from this plan

(Empty until the plan is promoted.)

## 13. Found along the way (not built here)

- **F1. `folder` names the folder that answered, not the folder that the entry is in.** For an entry with no switch
  of its own under a silent folder under an open folder, the field holds the name of the open folder
  (`answeringFolder`, `mcpAccess.ts:358-360`; observed). `creds_folders` lists the silent folder too, with its own
  name. The comment of the field says *the folder it lives in* (`mcpEntries.ts:39-40`). Nothing hidden is told. Not
  changed (Q6).
- **F2. The filter of `dependsOn` on a Remote Bridge is by name** (`bridgeScope.ts:152`, `:162-166`). The plan of
  the bridge looked at it and rejected a change (its §8, the row *reviewed and rejected by the re-review for epoch
  6*: a duplicate name discloses nothing). The new fact is the placeholder: when a row in scope is named exactly as
  `HIDDEN_DEPENDENCY`, the bridge passes the placeholder, and says that one more dependency exists. For the plan of
  the bridge; guard BG1 holds the usual case.
- **F3. `creds-mcp` drops `codeAccessEnabled`.** The window gives the field (`mcpEntries.ts:55-58`, `:155`), the
  instructions tell an agent to read it *on the list* (`src_mcp/src/Program.cs:784`, `Tools.cs:48`), and the record
  has no property for it (`McpJsonContext.cs:50-68`). The binary reads the answer into the record and writes the
  record out (`Tools.cs:173`), and its own remark says that a property that is not declared is dropped
  (`McpJsonContext.cs:128-130`). The row of a Remote Bridge has `hasCommand` and `hasConnectionString`
  (`bridgeScope.ts:134`), and the record has none of the two. Checked: the three files were read, and
  `grep -rn "codeAccess\|ExtensionData" src_mcp src_cli` finds the two sentences and one test of a description.
  NOT checked: a run of the binary. Not built here: its own small item.
- **F4. No CI job runs the check of the tool contract.** `emit-mcp-tools.mjs --check` exists (`:3-4`, `:148`).
  Checked: `grep -rn "emit-mcp-tools\|contract:mcp" .github/ src_vs_code/scripts/run-itests.mjs` finds no line. So a
  description can change in C# with the generated file left as it was. Row T1 reads the generated file, so it holds
  the four descriptions of this plan. Recorded.
- **F5. The description of `creds_edit_folder` still says that the Trash is not a destination**
  (`src_mcp/src/FolderTools.cs:75-76`). F7 removed that refusal: the Trash answers as a folder that is not there.
  The sentence is true and names a thing that the agent cannot address. Recorded.

## 14. Questions for the owner

The lead puts them to the question consultants first. The work does not wait: each question has the answer that this
plan is built on.

- **Q1 (N1, D2). A dependency that was DELETED gives the placeholder too.** Today it is dropped. *Built on: yes*, so
  a hidden dependency and a deleted one read alike. The other answer keeps the drop; an agent can then tell that a
  hidden dependency exists and was not deleted.
- **Q2 (N1, D1). One placeholder for any number of hidden dependencies, at the end of the list.** *Built on: one.*
  The other answer gives one in the place of each; the agent then reads how many there are.
- **Q3 (N5, D7). A reference that is kept still shows the e-mail address of its account.** *Built on: it stays*
  (the owner said: keep the text). The other answer replaces each reference, as a Remote Bridge gives a boolean.
- **Q4 (N5, D4). A token is replaced also when it is ambiguous, broken, in another letter case, or names an entry
  that the agent may view through a folder that it may not view.** *Built on: yes* (fail closed, and a hidden entry
  reads as a missing one). The other answer replaces only a reference that the locator finds and the wall refuses;
  rows R4 to R7 and E3 go then, and rule A does not hold for `command`.
- **Q5 (N5, D8). The two members of the window's reference source move out of `extension.ts` into a pure module.**
  *Built on: yes*, so the list and the run find the same entry by one function. The other answer writes them a
  second time in the list.
- **Q6 (N4, F1). `folder` names the folder that gave the switches, which is not always the folder that the entry is
  in.** *Built on: no change.* The other answer makes it the parent's name when the agent may view the parent; it
  is its own small item.
- **Q7 (the words). The two placeholders of §2.8, in round brackets.** *Built on: as written.* The owner can change
  the words in one place each; rows T1, D1 and R1 read the constants.
- **Q8 (S5). The tool descriptions and the help sentences are in this plan, with a `mcp-v` release after the
  extension release.** *Built on: yes.* The other answer cuts S5 to the harness check H1; the agent then reads the
  placeholders with no description of them.

## Appendix A — the two help sentences in the five languages

UI labels stay English in each language (rule 7 of `.agents/PROJECT.md`); these sentences have none. Sentence 1 goes
at the end of the `creds_list` bullet of `usage` of `agent-surface`, sentence 2 at the end of the `creds_folders`
bullet. A native reader can polish a word before the merge; the clauses stay, and row T3 is changed with the text.

| Language | Sentence 1 (`creds_list`) | Sentence 2 (`creds_folders`) |
|---|---|---|
| en | A folder, a dependency and a `creds://` reference in a command are named only when they are open to agents too. Otherwise the folder is empty, and the dependency and the reference are shown as fixed words that name nothing. | The parent is given only when it is open to agents too. |
| de | Ein Ordner, eine Abhängigkeit und ein `creds://`-Verweis in einem Befehl werden nur genannt, wenn sie ebenfalls für Agenten geöffnet sind. Sonst ist der Ordner leer, und die Abhängigkeit und der Verweis erscheinen als feste Worte, die nichts benennen. | Das Elternteil wird nur angegeben, wenn es ebenfalls für Agenten geöffnet ist. |
| es | Una carpeta, una dependencia y una referencia `creds://` en un comando sólo se nombran cuando también están abiertas a los agentes. Si no, la carpeta queda vacía, y la dependencia y la referencia se muestran como palabras fijas que no nombran nada. | El padre sólo se indica cuando también está abierto a los agentes. |
| ru | Папка, зависимость и ссылка `creds://` в команде называются, только если они тоже открыты агентам. Иначе папка пустая, а зависимость и ссылка показаны фиксированными словами, которые ничего не называют. | Родитель указан, только если он тоже открыт агентам. |
| uk | Папка, залежність і посилання `creds://` у команді називаються, лише якщо вони теж відкриті агентам. Інакше папка порожня, а залежність і посилання показані сталими словами, які нічого не називають. | Батько вказаний, лише якщо він теж відкритий агентам. |

## Appendix B — the four tool descriptions

Each text is added to the description that is there; no sentence of today is removed, so the tests that read them
stay green (`src_mcp/tests/ToolsTests.cs:112-113`, `:249-251`). The words in quotes are the values of the two
constants of §2.8; row T1 holds them equal.

1. **`creds_list`** (W1), a new paragraph after the first one: *`folder` is the name of the entry's folder when that
   folder is open to you too, and empty when it is not or when the entry is at the root. `dependsOn` names the
   entries this one needs that are open to you; when it needs one that is not, the list ends with "(a dependency
   that is not open to agents)". In `command`, a creds:// reference to something that is not open to you reads
   "(a creds reference that is not open to agents)".*
2. **`creds_folders`** (W2), after *Each carries `id`, `name`, `parent`, …*: *`parent` is the id of the folder above
   it when that folder is open to you too, and null when it is not — so a null parent does not say that the folder
   is at the top of the vault.*
3. **`creds_run`** (W3), after *its own `command` field tells you what it will do.*: *A creds:// reference in that
   text to something that is not open to you is shown as "(a creds reference that is not open to agents)".*
4. **`creds_vpn_up`** (W4), after *that dependency is the person saying "this needs that first".*: *A dependency
   that is not open to you is not named: `dependsOn` then ends with "(a dependency that is not open to agents)",
   and you cannot bring that one up — tell the person which entry needs it.*

Each of the four is true with a window of an older extension too, with one exception that §3.4 names: such a window
still names what a newer one hides.

## Epics

One epic, because the four fields are small, share one predicate and one release of the extension. Its stories are
here and not in a document of their own: the lead asked for it for a plan of this size, and the family has done it
before ([PLAN_agent_small_truths_n8_n9_n2.md](../research/PLAN_agent_small_truths_n8_n9_n2.md), `## Epics`). The
lead asked for four stories, one for each field. A fifth holds the words, because they are in another binary with a
release of its own. The rows and the mutations of §6 are the scenarios of each story. Fable wrote this plan and the
split, because each story is a judgement on authorisation (what an agent may see). The question consultants are NOT
asked yet: the lead asks them before the plan round, and the split is final after that. Sonnet codes each story from
its rows; Opus reviews each one; the security reading of S3 is Fable's, at review. One epic gives a cornerstone quota
of 1.

Cornerstones: 1 of 1 — S3

### E1 · The list answers name only what the agent may view, on `fix/agent-list-fields-hidden`

- **Goal.** No field of `creds_list` or of `creds_folders` names a node, or gives its id, when the agent may not
  view that node. A hidden node and a missing id give the same list body. The tool descriptions and the help say
  what the four fields hold.
- **Scope.** §2, §3.1, §6, the documents of §7, the owed row of §9.
- **Depends on.** Nothing. F7 is merged and released (extension 1.21.1 and 1.21.3), and N8 is released (1.24.1).
- **Done when.** §11 is ticked and the code round has run.
- **Pass criteria, each one a thing that can be counted.**
  1. L1: the two list bodies of the class test hold 0 hidden names and 0 hidden ids; the list of exceptions has 0
     rows.
  2. E1 to E4: in 4 of 4 pairs the two bodies are deep-equal.
  3. D1 to D5: `dependsOn` holds 0 names of a node that is not `shown`, and at most 1 placeholder.
  4. R1 to R7: 0 tokens that start with `creds://` are in a listed command, but the tokens of RG1 and RG2, which are
     byte-equal to the stored text.
  5. P1 to P3 and F1, F2: 3 parents are `null` and 2 folders are `''`.
  6. BG1 and BG2: the rows that a Remote Bridge serves have 0 changed bytes; `bridgeScope.ts` has 0 changed lines.
  7. G1: with each node visible, the two list bodies have 0 changed bytes.
  8. T3 holds for 5 of 5 languages; T1 for 3 descriptions; H1 for 4 values.
  9. Each of the 15 mutations turns at least 1 row red.
  10. `contract/broker-v1.json`, `src_cli` and `McpJsonContext.cs` have 0 differences; `contract/mcp-tools-v1.json`
      has 4 changed descriptions.
- **Cornerstone area.** The command field (S3): the scan, the locator and the three conditions. A mistake there is a
  name that leaves the vault inside a text that passes each other test, and the field is the only one of the four
  with a grammar.

**Stories.**

- **S1 · N1, the dependencies.** P1, then rows D1 to D5 and E1 RED first, with the failure messages kept. Then A1
  and A2. Guards DG1 and DG2. Mutations M1 to M3. The existing test of `test/mcpEntries.test.ts:238-250` changes
  here. Complete on its own.
- **S2 · N4, the folder.** Rows F1, F2 and E2 RED first. Then B1 to B3. Guards FG1 to FG3. Mutations M4 and M5. The
  existing test of `test/mcpEntries.test.ts:88-109` changes here. It shares no line with S1.
- **S3 · N5, the command (the cornerstone; this document is its specification, by Fable).** Rows R1 to R7 and E3 RED
  first. Then C1 to C5. Guards RG1 to RG4. Mutations M6 to M10. RS3 of `test/bridgeReadShape.test.ts` and the
  accounts of `test/bridgeWallWorld.ts` change here. It needs P1 of S1 and B1 of S2.
- **S4 · N6, the parent, and the class row.** Rows P1 to P3 and E4 RED first. Then D1 and D2. Guards PG1 and PG2.
  Mutations M11 and M12. Then row L1 in the class test, with the fixture's e-mail address; guard G1. It needs B1 of
  S2, and L1 needs S1 to S3.
- **S5 · The words, the binary and the record.** Rows T1 to T3 RED first. W1 to W4, the build, the check H2, W5. W6.
  W7 and H1. BG1 and BG2. Mutations M13 to M15. The CHANGELOG entry, the two documents of `research/`, the closing checks
  of §5, the code round and the pull request. It follows S1 to S4, because the documents record them as built.
