# PLAN — Three small truths of the agent surface: the config lookup, the journal reason of a linked run, the texts about the journal (N8, N9, N2)

> Status: **plan only, nothing implemented yet, 2026-11-27. Not approved yet.** Scope: the extension only
> (`src_vs_code/src`: `mcpEntries.ts`, `agentUseActions.ts`, the five `help*.ts` files, `mcpLogRows.ts`, `mcpLogPage.ts`,
> their tests), two README sentences, `src_vs_code/CHANGELOG.md`, `research/module_extension.md`,
> `research/module_tests.md`, `todo/README.md`. One epic, three stories (`## Epics`).
>
> The owner put three items next, in this order: N8, N9, N2. They are items of §11 of
> [PLAN_agent_refusal_names_unlisted_entry.md](../research/PLAN_agent_refusal_names_unlisted_entry.md) (F7), and that
> plan's §12 lists them as open. Each `file:line` here was read on `32cc729c` (extension 1.24.0). Three things were also
> observed on that commit, on 2026-11-27, with the compiled extension (§1.4). No ledger yet: the first approval opens
> `## Plan changes` under this block (`.agents/conventions/common/plan-change-control.md`).
> Two of the three items are not what F7 wrote: N9 does not happen in a vault that does not change (§1.2), and N2 is
> wider than one help sentence (§1.3). §14 has the questions for the owner. Fable wrote this plan and the split.

## 1. The three defects

### 1.1 N8 — the config lookup stops at the first account that holds the id

`creds_config_snippet` asks the window for ONE config entry by its id. The supplier is `visibleConfigDetails`
(`mcpEntries.ts:241-252`). It goes through the accounts and stops at the first account that holds a node with that id:
`if (node !== undefined) { return visibleConfigOf(…); }` (`:247-249`). `visibleConfigOf` (`:254-257`) answers `undefined`
when the agent may not view the node (`shown`, `:278-280`) and when the node is not a config.

So the answer for one id depends on a node that the agent may not view:

| Account 1 | Account 2 | The answer today | Observed |
|---|---|---|---|
| does not hold the id | a config that the agent may view | the config of account 2 | the route gives the catalog |
| holds a HIDDEN node with the id (no `view`, a PIN of its own, or the Trash) | the same config | `undefined` | `{"error":"no such config is open to agents",…}` |
| holds a node that the agent may view and that is not a config | the same config | `undefined` | the same error |

The agent sees the config of account 2 in `creds_list` (observed: the list has it, and no node of account 1). It asks
for the snippet and reads *no such config is open to agents*. From the two answers it can tell that an earlier account
holds a node with the same id. Rule A of F7 says: a node that the agent may not view answers as an id that does not
exist. The two other lookups keep the rule in this case since F7 epic 1:

- the entry lookup: `findUsableEntry` (`mcpEntries.ts:359-371`) asks each account (`lookedUp`, `:395-403`), and
  `verdictFor` answers `undefined` for a node that is not shown (`:440-444`), so the search goes on. Row X1,
  `test/mcpEntries.test.ts:412-421`;
- the folder lookup: `findFolder` (`mcpFolders.ts:135-150`) takes a node only when `isOpenFolder` is true (`:144-145`),
  and goes on for each other one. Row X2, `test/mcpFolders.test.ts:244-255`.

The same id in two accounts is possible: an imported or shared vault keeps its ids (`bridgeScope.ts:50-51`: *an envelope
may repeat an id across accounts*). Nothing is named and no value is given. Only the answer differs.

### 1.2 N9 — the journal reason of a linked run. What F7 wrote does not happen today

F7 wrote: *`whyUnusable` says "switch is off" for an SSH node in the Trash and for a link to a folder.* This is true of
the FUNCTION. It is not true of the PRODUCT on this commit.

`whyUnusable` (`agentUseActions.ts:232-239`) has three answers: the node is missing; the node has a PIN of its own; each
other node gets `the SSH entry's "Usable by agents" switch is off`. Its one caller is `usableGate` (`:241-247`), and
`usableGate` runs only after `linkGate` (`:250-256`) got `linked` from `sshLinkOf`. `sshLinkOf` refuses first, each with
its own reason, which is the journal's `why` (`:252-254`):

- a node that is not an entry, for example a folder (`isUsable`, `remoteLaunch.ts:56-58`; `linkTo`, `:92-99`);
- an SSH entry in the Trash (`trashRefusal`, `:60-62`), with the same `isInTrash` that the lookup uses
  (`mcpAccess.ts:304`; `trash.ts:47-57`).

Observed, in a vault that does not change during the call:

| The link points to | The journal line today (after `creds_run — "deploy": `) | From |
|---|---|---|
| an SSH entry in the Trash, its switch on | `"deploy" runs over the SSH connection "prod box", which is in the Trash. Restore it first.` | `sshLinkOf` |
| a folder | `"deploy" runs over an SSH connection that is no longer in this vault. Edit it and choose an SSH connection, or set "Runs over SSH" to "Do not use".` | `sshLinkOf` |
| an SSH entry with no switch, or with `view` only | `the SSH entry's "Usable by agents" switch is off` (true: no `view` means no `use`, `mcpAccess.ts:249-256`) | `whyUnusable` |
| an SSH entry with a PIN of its own | `the SSH entry is hidden from agents (PIN)` | `whyUnusable` |

`whyUnusable` gives the false reason only when its read of the node differs from the read of `sshLinkOf`. The gate reads
the node three times (`:251`, the lookup at `:242`, `:246`) with no `await` between the reads, and the real read is a
lookup in memory (`storageManager.ts:409-411`). So the real product cannot give the false reason today. A test can: the
existing row L6 does it for a node that is gone at the second read (`test/agentSshGate.test.ts:273-291`). Observed with
that shape: a node that is in the Trash, or is a folder, at the gate's read gets `… "Usable by agents" switch is off`.

**So N9 is a function that is wrong for two inputs, and its caller does not give it those inputs today.** It is safe by
its caller, not by its construction. A later change that moves a step of the gate, or puts an `await` into it, makes the
false line real, and no test fails. The existing test of the Trash in a stable vault pins the reason of `sshLinkOf`
(`test/agentSshGate.test.ts:314-341`). No test has a link to a folder.

### 1.3 N2 — the texts say that the journal holds every request. It does not

The help article *MCP logs — the agent journal* says in each of the five languages (`helpEn.ts:137`, `helpDe.ts:137`,
`helpEs.ts:137`, `helpRu.ts:137`, `helpUk.ts:137`; the field `whatItIs` of `mcp-logs`):

> A journal of everything AI agents did or asked through this extension: every list, every use, every refusal, and two
> counts worth watching — secrets that came FROM an agent, and requests we could not serve.

Two of the three words are false. Observed through the real broker:

| The request | Journal lines | Why |
|---|---|---|
| a list (`GET /v1/mcp/entries`, `/v1/mcp/folders`, `/v1/mcp/config-snippet`) | 0 | a read route is answered with no line (`credsAgentServer.ts:451-455`) |
| a use of an id that the window does not serve (`not_found`); an entry that the agent may not view answers the same (part A of the class test) | 0 | the lookup refuses before a grant exists (`brokerMcpDoor.ts:210-214`), and a refusal with no grant writes no line (`credsAgentServer.ts:734-746`) |
| a use of an entry whose switch is off (`denied`) | 0 | the same lines |
| a use with no `entry` field (`invalid_request`) | 0 | the same lines |
| a delete, for the same three cases | 0 | `brokerMcpDoor.ts:288-292` |
| a use that the person allowed | 1 row on the journal page: `exec → exit 0` | the grant is minted after the lookup and the throttle (`brokerMcpDoor.ts:223-230`) |
| a use that the person denied | 1 row: `exec → denied` | the same |
| a use that nobody answered | 1 row: `exec → consent_timeout` | the same |

The folder routes do the same (`brokerFolderDoor.ts:132-141`). A request over the rate limit writes one line for each
window and door, not one for each request (`aliasThrottle.ts:401-404`, `:512-518`; pinned at
`test/brokerMcpRoutes.test.ts:623-624`).

**The same false claim is in other texts.** Method: `grep -rn` over the repository for `every list`, `every refusal`,
`every ask`, `every call`, `everything an agent`, and their words in the four other languages.

| # | Text | Says | True? |
|---|---|---|---|
| T1 | the five help articles, `help*.ts:137` | *every list, every use, every refusal* | no |
| T2 | the journal page, `mcpLogPage.ts:63-65` | *Every call an AI agent made to this window* | no |
| T3 | the filter *Everything*, `mcpLogRows.ts:41` | *Every call an agent made through MCP.* | no |
| T4 | the filter *Refused*, `mcpLogRows.ts:45` | *… a switch that is off, a prompt you declined, a prompt nobody answered.* | the first example is false for the usual case: a use of an entry whose switch is off leaves no line |
| T5 | the empty journal, `mcpLogRows.ts:165` | *No agent has called this window yet.* | no: an agent can list and be refused many times and leave no line |
| T6 | the empty *Refused* filter, `mcpLogRows.ts:172` | *Nothing was refused — every call an agent made was allowed.* | no |
| T7 | `src_vs_code/README.md:823-825` | *the journal: every ask, every refusal* | no |
| T8 | `README.md:236-237` | *along with everything an agent asked for and did not get* | no |

Checked and true, so they stay: `README.md:209` and `src_vs_code/README.md:810` (*Every call is recorded either way*: it
is about a use that a consent policy answers, asked or not asked, and each such use that runs writes a line,
`test/brokerMcpRoutes.test.ts:473-474`); `src_vs_code/README.md:770` and `:1370` (a call with a token grant: a refusal
with a grant writes a line, `credsAgentServer.ts:736-745`); `helpEn.ts:132` (*The journal counts those lines
separately*); `research/module_extension.md:6864` (*A lookup refusal writes no journal line*, written by F7).

### 1.4 How the facts were found (the method)

(1) Each function was read at the lines above. (2) `grep -rn` over `src_vs_code/src` (each folder) for each caller of
`visibleConfigDetails` and of `whyUnusable`, and over the repository for the sentence of N2. (3) Three small scratch
runs over the compiled extension of this commit (`npm ci`, `tsc`): the config lookup and the real read route
(`readRouteBody`) over two accounts; the notes of `terminalRunAction(…).validate` in the gate world
(`test/agentSshWorld.ts`) for a stable vault and for a vault that changes between the reads; the journal lines of the
real broker (`test/brokerWorld.ts`) for each request of §1.3, and the rows that the page's reader `mcpRowsIn` gives.
The scripts are not committed. The rows of §6 repeat each observation as a test. NOT done: a run with a real
`creds-mcp`; a run in a real VS Code window; Windows.

## 2. The decisions

### 2.1 N8 — the search goes on for each account that has no visible config with the id

`visibleConfigDetails` asks each account and gives the first answer that is not `undefined`. An account stops the
search only when it holds an entry with that id that the agent may view AND that is a config.

**Decision D1: a node that the agent may view and that is not a config does not stop the search too.** F7 named the
hidden node only. Three reasons to treat the two alike:

1. The function has one answer for three causes on purpose: *Not-found, not-visible and not-a-config are one
   `undefined`, deliberately* (`mcpEntries.ts:238-239`). An account-level rule that splits them is a second rule.
2. Between WINDOWS the same search goes on already: `creds-mcp` takes the next window for each body that has `error`
   (`src_mcp/src/Tools.cs:56-61`, `:75-84`). Two accounts of one window then behave as two windows do.
3. The other choice has no use here. The entry lookup stops at the first node that the agent may view, because its
   `closed` verdict has a sentence that a person can act on (`mcpEntries.ts:332-336`). The config lookup has no such
   answer: it would say *no such config* for a config that `creds_list` shows, by the order of the accounts.

This is one difference from the entry lookup, and it is said here on purpose (Q5).

**The callers.**

| Caller | What it passes | Does its answer change? |
|---|---|---|
| `extension.ts:531`, the window's hook `visibleConfig` (read by `credsAgentServer.ts:428-436`, the read route at `:451`) | the whole storage | yes, in one case only: two accounts of this window hold the id, and an earlier one has no visible config with it |
| `bridgeWallSource.ts:25`, the Remote Bridge wall's `visibleConfigOf` (called at `bridgeScope.ts:210`; the comment at `bridgeScope.ts:54` describes it) | `accountOnlyVault(vault, accountId)`: `getAccounts` answers one row or none (`mcpAccountVault.ts:15-18`) | no. The loop has one pass. A bridge never reads another account, before and after. Guard row CG3 pins it |
| `test/agentNamesOnlyViewable.test.ts:92-95`, part A of the class test | one account | no |

### 2.2 N9 — the journal reason comes from the node, for each state that the lookup refuses

`whyUnusable` gets the tree lookup of the Terminal entry's account and chooses from five causes, in this order:

| # | The node that the gate reads | The journal reason (`why`) | Today |
|---|---|---|---|
| 1 | missing | `the SSH entry is not in this account` | the same |
| 2 | not an entry (a folder) | `the SSH link points to a folder, not to an entry` | `… switch is off` |
| 3 | in the Trash (`isInTrash`) | `the SSH entry is in the Trash` | `… switch is off`, or the PIN sentence when it has a PIN (observed) |
| 4 | a PIN of its own (`hiddenFromAgents`) | `the SSH entry is hidden from agents (PIN)` | the same |
| 5 | each other node | `the SSH entry's "Usable by agents" switch is off` | the same |

The order is the order in which the lookup refuses: `shown` asks for an entry first, and the Trash takes each switch
away before a PIN is read (`mcpEntries.ts:278-280`; `mcpAccess.ts:304-316`). Rows 4 and 5 keep their order of today.
No reason holds a name or an id of the SSH entry, as today.

**Journal only.** The agent's message stays `linkedRunRefused(name)` with the code `denied` for each cause
(`agentUseActions.ts:198-200`, `:246`). The lookup, the gate's order and `sshLinkOf` do not change. In a vault that does
not change, no journal line changes (§1.2): rows 2 and 3 are for a read that differs from the link's read.

The lint rule allows a complexity of 4 for a function (`src_vs_code/eslint.config.mjs:32`), and five causes in one `if`
chain are more. The coder writes the causes as one ordered table of `{ is, why }` and one lookup over it.

### 2.3 N2 — change the sentences, do not add a journal line

| | O1: the texts say what the journal holds | O2: a refusal at the lookup writes a line |
|---|---|---|
| Change | sentences: five help articles, five texts of the journal page, two README sentences | a new line of the journal on each door, for each lookup refusal |
| Is *every refusal* then true? | the claim is gone | **no**, see below |
| New contract | none | yes: a new line shape, its `via`, its place in the *Refused* filter |
| Growth | none | a line for each request, before the throttle |
| Rule A of F7 | not touched | a line for a hidden node is an effect that a made-up id does not have; a line for both writes each probe |

**The decision: O1.** O2 cannot make the sentence true. The lookup is before the throttle (`brokerMcpDoor.ts:210-223`),
so a line for each lookup refusal has no limit; the server gives this reason for an unknown token
(`credsAgentServer.ts:734-735`), and F7 §2.5 gave it for rule A. With a limit, the journal holds SOME refusals, and the
sentence is false again. A list has no line too, and O2 does not change that. So the sentence must change in each case,
and then O2 adds a contract and a growth surface for nothing that this plan needs. Whether a refusal for an entry that
the agent MAY view (a switch that is off) should get a line with a limit is a product question (Q4), and its own plan.

**The new sentence, in English (the source).** The four other languages are in Appendix A.

> A journal of what AI agents did through this extension: each action that ran for an agent and how it ended, each one
> that you declined or did not answer, and two counts worth watching — secrets that came FROM an agent, and requests we
> could not serve. It is not a record of every request. A listing leaves no line. A request that is refused before
> anybody is asked can leave none: for example an id that is not open to agents, a switch that is off, or a request
> that is not complete.

Each clause is a thing that a row of §6.3 observes. *can leave none* and *for example* are there on purpose: a refusal
of `validate` comes before the question and DOES leave a line (observed: `invalid_request  no command given`), and the
first request over the rate limit in a window leaves one.

## 3. The sites

### 3.1 Sites that change

| # | Story | Site | Today | After |
|---|---|---|---|---|
| A1 | S1 | `mcpEntries.ts:245-251`, the loop of `visibleConfigDetails` | returns the answer of the first account that holds the id | asks `visibleConfigOf` for the node of each account and returns the first answer that is not `undefined`; `undefined` when no account has one |
| A2 | S1 | the comment at `mcpEntries.ts:233-240` | says nothing of accounts | says that the search goes on for each account with no visible config, as the two other lookups do, and for a visible node that is not a config (D1) |
| B1 | S2 | `agentUseActions.ts:232-239`, `whyUnusable` | three causes | the five causes of §2.2, as one ordered table; it takes the node and a tree lookup |
| B2 | S2 | `agentUseActions.ts:246`, in `usableGate` | `whyUnusable(node)` | passes the lookup of the Terminal entry's account too |
| B3 | S2 | the comments at `:232` and `:240` | say *the SSH entry's NODE* | name the five causes and their order |
| T1 | S3 | `whatItIs` of `mcp-logs` in the five `help*.ts` files, line 137 | §1.3 | the sentence of §2.3 and Appendix A |
| T2 | S3 | `mcpLogPage.ts:63-65` | *Every call an AI agent made to this window, from the same record the broker writes to disk.* | *What AI agents did through this window, from the same record the broker writes to disk.* The next sentence stays |
| T3 | S3 | `mcpLogRows.ts:41` | *Every call an agent made through MCP.* | *Every line of the journal that came through MCP.* |
| T4 | S3 | `mcpLogRows.ts:45` | §1.3 | *What it asked for and did not get — a prompt you declined, a prompt nobody answered, a run that was refused. A request that is refused before anybody is asked can leave no line.* |
| T5 | S3 | `mcpLogRows.ts:165` | *No agent has called this window yet. Entries are invisible to agents until you turn on Agent access for one.* | *The journal holds no line yet. A listing leaves none, and a request that is refused before anybody is asked can leave none. Entries are invisible to agents until you turn on Agent access for one.* |
| T6 | S3 | `mcpLogRows.ts:172` | *Nothing was refused — every call an agent made was allowed.* | *No refusal is in the journal. A request that is refused before anybody is asked can leave no line.* |
| T7 | S3 | `src_vs_code/README.md:823-825` | *is the journal: every ask, every refusal, and the two costs worth counting — …* | *is the journal: each action that ran for an agent and how it ended, each one that you declined or did not answer, and the two costs worth counting — … It is not a record of every request: a listing leaves no line, and a request that is refused before anybody is asked can leave none.* |
| T8 | S3 | `README.md:236-237` | *counts those by name — along with everything an agent asked for and did not get.* | *counts those by name — along with the requests that you declined and the secrets that this window could not make.* |
| T9 | S3 | the comments at `mcpLogPanel.ts:8`, `mcpLogRows.ts:5` and `:9` | *everything an agent asked this window for* | what the journal holds, in the words of T1 |

`SshUseDeps`, `AgentUseDeps`, `McpVaultSource`, `BridgeWallSource` and the broker hooks get no new member.

### 3.2 Sites that were checked and do not change

| Site | Why it stays |
|---|---|
| `visibleConfigOf` (`mcpEntries.ts:254-257`), `shown` (`:278-280`) | the question of one node is right; only the loop over accounts was wrong |
| `findUsableEntry`, `findFolder`, `agentMayView` | they go on already (X1, X2) |
| `bridgeWallSource.ts:25`, `bridgeScope.ts:210`, `mcpAccountVault.ts:15-26` | one account by construction (§2.1) |
| `brokerReadRoutes.ts:109-116`, `mcpSnippetRoute.ts:79-87` | the route and its one refusal sentence stay |
| `src_mcp/src/Tools.cs:62-84` | no change in `creds-mcp`; an older `creds-mcp` gives the same result |
| `sshLinkOf` (`remoteLaunch.ts:106-112`), `linkGate`, `linkedCall`, `validateTarget` (`agentUseActions.ts:250-323`) | the gate's order and the link's reasons stay; F1 of §13 is not built |
| `linkedRunRefused`, `journalLine` (`agentUseActions.ts:198-214`) | the agent's sentence and the shape of the journal line stay |
| `respondError` (`credsAgentServer.ts:718-746`), the read routes (`:451-455`) | no new journal line (O1) |
| the sentences listed as true in §1.3 | true |

### 3.3 What changes for an agent or a script (the contract, said explicitly)

One answer changes. `GET /v1/mcp/config-snippet` (`creds_config_snippet`) for an id that two accounts of ONE window
hold: when an earlier account has no visible config with that id and a later account has one, the answer is the catalog
or the snippet of that config. Before, it was `{"error":"no such config is open to agents", …}`. No route, status, code,
body shape, sentence or tool description changes. `contract/broker-v1.json` and `contract/mcp-tools-v1.json` do not
change, and the product code of `src_mcp` and `src_cli` does not change. Nothing changes on a Remote Bridge. No answer
of `creds_run` changes; one journal reason can differ (§2.2). The journal gets no new line and loses none. The
CHANGELOG entry and the pull request body say this.

## 4. Growth surfaces

None is created: no table, folder, cache, process or journal line. O2 of §2.3 would create one, and it is not built.

## 5. Build order

One epic, three stories, on `fix/n8-n9-n2-small-truths` (from `main` at `32cc729c`), in a worktree of its own. The
stories are in the order that the owner gave.

1. **Before the first test.** The lead asks the question consultants what is important (the split is final after that)
   and puts the questions of §14 to them first. Then the `coai` plan round, with the lead's own Opus review at the same
   time. Its pass opens the ledger.
2. **S1 (N8).** Rows C1 to C3 first: each is watched FAILING by its assertion on the unchanged code, and the coder keeps
   the message. Then A1 and A2. C1 to C3 pass. Guard rows CG1 to CG4 are watched passing before and after. Mutations M1
   to M4.
3. **S2 (N9).** Rows W1 to W3 first, watched failing by their assertions (they call `validate`, so the new parameter
   of B1 gives no compile error in a test). Then B1 to B3. Guard rows WG1 to WG4. Mutations M5 to M8.
4. **S3 (N2).** First the behaviour rows J1 to J3, on the unchanged code: they pass, and mutations M9 to M11 show that
   each can fail. Then rows H1 and H2, watched failing. Then T1 to T9. Mutations M12 and M13.
5. The documents of §7.
6. `npm run typecheck`, `npm test`, `npm run lint` and `npm run ratchet` in `src_vs_code`, at lowered priority, with
   the exit of `tsc` read first. `npm run contract` leaves no difference in `contract/`.
7. The `coai` code round on the finished branch, with the Opus code review at the same time; then the pull request.
   Its body has §3.3, the verdicts and the number of reviewers that answered.

One file of the suite runs through the same runner: `npm run compile`, then
`node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`.

## 6. Test plan

Each RED row is a test of behaviour: it calls the product's function or route and asserts what comes back. No row
reads a source file. Each row has a mutation of §6.4 that turns it red.

### 6.1 S1 (N8) — in `test/mcpEntries.test.ts`, beside X1, and `test/bridgeWallSource.test.ts`

The source has two accounts, `a1` then `a2` (`twoAccounts`, `test/mcpEntries.test.ts:366-374`). `a2` holds a config
`c1` that the agent may view. The file is 690 lines; with these rows it stays under the limit of 800
(`src_vs_code/eslint.config.mjs:30`). If it would not, the rows go into a suite of their own and `twoAccounts` is exported.

| # | Kind | Input | Today | After |
|---|---|---|---|---|
| C1 | RED | `a1` holds a config `c1` that is hidden, one case for each reason: no `view`; a PIN of its own; in the Trash. `visibleConfigDetails(source, 'c1')` | `undefined` in the three cases | the details of the config of `a2`, and the same value as when `a1` does not hold `c1` |
| C2 | RED | the same two worlds (hidden in `a1`; missing in `a1`) through the real read route: `readRouteBody('/v1/mcp/config-snippet', { visibleConfig: (id) => visibleConfigDetails(source, id) }, …)` with `id=c1` and a language | the first body has `error` and no snippet; the second has the snippet | the two bodies are equal, have no `error`, and the snippet names the file of the config of `a2` |
| C3 | RED | `a1` holds an entry `c1` that the agent may view and that is not a config (D1) | `undefined` | the details of the config of `a2` |
| CG1 | guard | no account has a visible config with the id: hidden and hidden; hidden and missing; missing and missing; a visible entry that is not a config, and a hidden config | `undefined`, and the route says `no such config is open to agents` | the same |
| CG2 | guard | `a1` and `a2` each hold a visible config `c1` | the config of `a1`: the order of `getAccounts()` | the same |
| CG3 | guard, in `test/bridgeWallSource.test.ts` beside W1 (`:34-38`) | `wallSuppliersOf(vault, GATE).visibleConfigOf('a1', 'c1')`; hidden in `a1`, visible in `a2`; the vault records each `getNode` | `undefined`; no read of `a2`; `visibleConfigOf('a2', 'c1')` is the config of `a2` (the positive control) | the same |
| CG4 | guard, no edit | part A of the class test (`test/agentNamesOnlyViewable.test.ts`), X1, X2, `test/mcpSnippetRoute.test.ts`, W1 of `test/bridgeWallSource.test.ts` | green | green, with no change of a line |

The fixture is proved in the test first: `visibleMcpEntries(source)` lists the config of `a2` and lists no node of `a1`
in the hidden cases, so the agent may view what the row says it may view.

### 6.2 S2 (N9) — a new suite, `test/linkedRunWhy.test.ts`

`test/agentSshGate.test.ts` is 785 lines, so the rows get a suite of their own. They use the gate world
(`test/agentSshWorld.ts`) with a storage of the row's own, in the shape of row L6 (`test/agentSshGate.test.ts:276-285`):
the first read of `s1` answers a usable SSH entry (so `sshLinkOf` answers `linked`), and each later read of the account
answers the nodes of the case. Each row calls `terminalRunAction(w.deps).validate({}, w.ctx)` one time.

| # | Kind | The nodes at the gate's reads | The one note today | The one note after |
|---|---|---|---|---|
| W1 | RED | `s1` is under the Trash folder, its switch on | `journalLine('deploy', 'the SSH entry\'s "Usable by agents" switch is off')` | `journalLine('deploy', 'the SSH entry is in the Trash')` |
| W2 | RED | `s1` is a folder | the same switch line | `journalLine('deploy', 'the SSH link points to a folder, not to an entry')` |
| W3 | RED | `s1` is under the Trash folder AND has a PIN of its own | `journalLine('deploy', 'the SSH entry is hidden from agents (PIN)')` | the Trash line of W1 |
| WG1 | guard, asserted in W1 to W3 | — | the result is `{ ok: false, code: 'denied', message: linkedRunRefused('deploy') }`; nothing ran (`overSsh.calls`), no slot was taken, the trust store was not read | the same, byte for byte |
| WG2 | guard, asserted in W1 to W3 | — | the note holds no name of the SSH entry, no id and no host | the same |
| WG3 | guard, new | a stable vault whose link points to a folder | one note, `journalLine('deploy', <the reason that sshLinkOf gives>)`; it holds `no longer in this vault` (F1 of §13); the agent reads the one sentence | the same |
| WG4 | guard, no edit | `test/agentSshGate.test.ts`: the closed and the unmarked SSH entry (`:242-256`), the PIN (`:258-271`), L6 (`:273-291`), the four link refusals with the Trash in a stable vault (`:314-341`), `before_the_gate_passes_every_outcome_is_the_one_sentence` (`:580-599`) | green | green, with no change of a line |

### 6.3 S3 (N2) — a new suite, `test/journalHolds.test.ts`

The header of the suite says: these rows hold what the texts say; when a row of J changes, the texts of T1 to T8 change
in the same commit. J1 to J3 run the real broker of `test/brokerWorld.ts` (`world`, `share`, `call`) and read
`w.audit`. Their behaviour does not change in this plan, so they are not RED rows; a mutation shows that each can fail.

| # | Kind | Input | What must be true (today and after) |
|---|---|---|---|
| J1 | behaviour | `GET /v1/mcp/entries`, `/v1/mcp/folders`, `/v1/mcp/config-snippet?id=…` | each answers 200 and adds 0 lines to the journal |
| J2 | behaviour | on `/v1/mcp/use/exec` and `/v1/mcp/delete`: an id that is not served; an entry whose switch is off; a body with no `entry` | the code is `not_found`, `denied`, `invalid_request`; 0 lines; 0 dialogs |
| J3 | behaviour | a use that is allowed; one that is denied; one that nobody answers | read with the page's own reader `mcpRowsIn` (`mcpLogRows.ts:29-35`): one row each, with the outcome `exit 0`, `denied`, `consent_timeout`; `isRefusal` is true for the last two |

| # | Kind | Input | Today | After |
|---|---|---|---|---|
| H1 | RED | for each language of `HELP_LANGUAGES`: `bodyFor(helpArticle('mcp-logs'), language)` | `whatItIs` is the old sentence | `fallback` is false and `whatItIs` is the sentence of Appendix A for that language |
| H2 | RED | the journal page: the hints of the filters `all` and `refused` (`MCP_LOG_FILTERS`), `emptyMessage('all', 0)`, `emptyMessage('refused', 3)`, and `renderMcpLog([])` | the texts of §1.3 | the texts T2 to T6 of §3.1, exact; the page holds no `Every call an AI agent made` |

H1 and H2 read the text through the product's own functions, as each help row of this repository does
(`test/sshRoadHelp.test.ts:186-190`). They are content rows: a sentence has no other behaviour. The facts that the
sentence states are J1 to J3, in the same suite. T7 and T8 (the two README sentences) and T9 (comments) have no row;
the review reads them, and §11 has a `grep` for the old words.

**Two existing assertions change**, because they pin the sentence that T5 replaces: `test/mcpLogRows.test.ts:140`
(`renderMcpLog([])` includes *No agent has called this window yet*) and `:188` (`emptyMessage('all', 0)` matches it).
Each gets the first words of T5, *The journal holds no line yet*. No other existing test of the journal page or of the
help pins a text of T1 to T6 (method: `grep` over `src_vs_code/src/test` for the old words of §1.3).

### 6.4 Mutation checks (each one alone, restored after; each must turn its rows red)

| # | The mutation | Turns red |
|---|---|---|
| M1 | put `if (node !== undefined) { return visibleConfigOf(…); }` back in `visibleConfigDetails` | C1, C2, C3 |
| M2 | stop the search at the first node that the agent may view (return `undefined` for a shown node that is not a config) | C3, and no other row of S1 |
| M3 | take `shown` out of `visibleConfigOf` | C1 (the hidden config of `a1` is given), CG1, part A |
| M4 | make `accountOnlyVault` answer each account in `getAccounts` | CG3 |
| M5 | take the Trash cause out of the table of B1 | W1, W3 |
| M6 | take the folder cause out | W2 |
| M7 | put the PIN cause before the Trash cause | W3 |
| M8 | give `gate.why` to the agent as the message in `validateTarget` | WG1 |
| M9 | write a journal line in the read route (`credsAgentServer.ts:451-455`) | J1 |
| M10 | in `respondError` (`credsAgentServer.ts:734-746`), write a line also for a refusal that has no grant (the grant mark `—`) | J2 |
| M11 | in `respondError`, write no line for a refusal that has a grant | J3 (the denied use and the use that nobody answered) |
| M12 | put the old sentence back in ONE language (each of the five in turn) | H1, for that language |
| M13 | put the old hint of the filter *Refused* back | H2 |

### 6.5 What the tests do not prove

- A real `creds-mcp` and a real window. C2 runs the route function that the server calls, not the listener and not the
  binary. Part A of the class test runs the listener for one account (CG4).
- That two accounts of one real vault hold one id. The rows build it; §1.1 says how it can happen.
- That a real vault can change between the reads of the gate. It cannot today (§1.2). W1 to W3 test the function's
  answer for that case, as L6 does.
- The four translations. H1 pins the text that Appendix A has. Nobody measured how a native reader takes it; a native
  reader of each language should read its sentence before the merge.
- T7, T8 and T9: no row.
- Windows. The extension suite runs on Ubuntu (`.github/workflows/ci-extension.yml`); no row depends on the system.

## 7. Documents

- `src_vs_code/CHANGELOG.md`, under `## [Unreleased]`: a `### Fixed` entry with three parts: the snippet of a config
  whose id another account of the window also holds (§3.3); the journal reason of a linked run (§2.2, with the sentence
  that a stable vault writes the same lines as before); the texts about the journal, with what the journal does not
  hold.
- `research/module_extension.md`: in the paragraph *A lookup and a refusal name only what the agent may view*
  (`:6852-6870` today), `visibleConfigDetails` as the third lookup that goes on to the next account, and D1; in the
  paragraph of the agent's run over SSH (`:2475` today), the five causes in place of *one of three JOURNAL sentences*;
  in the row *Agents learn configs (T10)* (`:7372` today), one clause. No diagram shows these lookups, so none is
  drawn again.
- `research/module_tests.md`: the rows C1 to C3 and CG1 to CG3 beside part A (`:2342` today); the suite
  `linkedRunWhy.test.ts` beside the agent's gate (`:1480` today); the suite `journalHolds.test.ts`, with §6.5 as its
  *what it does not prove*.
- `README.md` and `src_vs_code/README.md`: T7 and T8.
- `todo/README.md`: this plan's row (it is there). On promotion: `research/README.md`, and the five pointers of F7
  (§9: its status block, N2, N8, N9 and its §12) change from `../todo/` to a sibling link.
- `POST_DEPLOY.md`: no item. It is the list of the server, and a green local run shows each change of this plan.

## 8. What this plan does NOT do

- It adds no journal line (Q4).
- It does not change `sshLinkOf`, so a link to a folder keeps the sentence *no longer in this vault*, in the journal
  and on the person's roads (F1, Q2).
- It does not change what an agent reads from `creds_run`, `creds_list` or `creds_folders`. The four list fields N1,
  N4, N5 and N6 of F7 stay questions for the owner in that plan.
- It does not change the entry lookup or the folder lookup. The entry lookup still stops at the first account whose
  node the agent may view (F3).
- It does not make the time of the two cases of N8 equal by a measure. They run the same loop; F7 §2.4 has the residue.
- It does not release. A release of the extension must follow the merge; the lead and the owner decide when.

## 9. Neighbour plans

| Plan | Touches | This plan's part | The row that the neighbour gets |
|---|---|---|---|
| [PLAN_agent_refusal_names_unlisted_entry.md](../research/PLAN_agent_refusal_names_unlisted_entry.md) (F7, implemented) | rule A; N8, N9 and N2 of its §11 | this plan builds those three items and nothing more of F7. N1, N4, N5, N6, N3 and N7 stay there | written in this commit: its status block, its N2, N8 and N9, and its §12 point here |
| [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) | the wall's per-account suppliers (`visibleConfigOf`, its §4.2 *Listings are per account*) | none in behaviour: a bridge's lookup has one account (§2.1, CG3). No line of `bridgeScope.ts`, `bridgeWallSource.ts` or `mcpAccountVault.ts` changes | OWED, in its §8 *Boundaries*: that sentence. That plan is under change control (epoch 11), so its owner session writes the row |

The order: this plan needs no other plan, and no other plan needs this one. Method: `grep -l` over `todo/PLAN_*.md` for
`mcpEntries.ts`, `visibleConfig`, `config-snippet`, `whyUnusable`, `usableGate`, `linkedCall`, `agentUseActions.ts`,
`mcp-logs`, `mcpLogRows` and the five help files. These also matched and share no line, and get no row:
`PLAN_consent_coverage_per_door.md` (`worthRemembering` and the consent stamps of `mcpEntries.ts`);
`PLAN_terminal_runs_followups.md` and `PLAN_query_refuses_client_commands.md` (their boundary sentence names
`whyUnusable` as F7's; their own sites are `vpnOutcome` and the `query` action); `PLAN_ssh_line_runs_in_login_shell.md`
(the remote command of a linked run); `PLAN_creds_cli_reachable_from_every_caller.md` (the CLI). Seven open plans name
the five help files; none names the article `mcp-logs`. A branch that merges second re-reads line 137.

## 10. Risks

1. **N8 gives an agent the snippet of a config that it could not get before.** Only for a config that the agent may
   view and that `creds_list` shows already. C1 and M3 pin that a hidden config is never the answer.
2. **D1 is a choice, not F7's text.** If the owner says no to Q5, row C3 and mutation M2 change sides and one line
   changes. It is said before the build.
3. **N9 builds a reason for a state that the product does not reach today.** The cost is one table and three rows. The
   other answer (Q1) keeps the guard row WG3 and closes N9 in F7 as *not a defect today*.
4. **The new sentence is longer than the old one**, in five languages. The translations are by the author of this plan
   and not by a native reader (§6.5).
5. **A text that the sweep of §1.3 missed.** The method is a `grep` for the phrases that §1.3 lists. A sentence that
   says the same in other words is not found.
6. **A merge with an open branch** that edits `help*.ts`, `agentUseActions.ts` or `mcpEntries.ts` (§9): the second one
   re-reads the lines.
7. **Size.** `agentUseActions.ts` (695 lines) and `mcpEntries.ts` (579) stay under 800. `test/agentSshGate.test.ts`
   (785) gets no row.

## 11. Definition of Done

- [ ] Rows C1 to C3, W1 to W3, H1 and H2 were watched failing by their assertions on the unchanged code, then pass; the
      summary quotes one failure message of each story and the pass. No RED proof is a compile error.
- [ ] Rows J1 to J3 pass before and after, and mutations M9 to M11 each turned one of them red.
- [ ] Guard rows CG1 to CG4 and WG1 to WG4 were watched passing before and after; the tests named *no edit* have no
      changed line.
- [ ] Mutations M1 to M13 each turned its rows red and were restored.
- [ ] In W1 to W3 the agent's answer is `linkedRunRefused('deploy')` with `denied`, byte-equal to the answer for a
      closed SSH entry.
- [ ] `grep -rn "every list\|every refusal\|every ask\|everything an agent asked"` over `README.md`,
      `src_vs_code/README.md` and `src_vs_code/src` (tests apart) finds no line about the journal.
- [ ] `npm run typecheck`, `npm test`, `npm run lint` and `npm run ratchet` are green in `src_vs_code` at lowered
      priority, with a clean `tsc` read first. `npm run contract` leaves `contract/` unchanged. `src_mcp` and `src_cli`
      have no difference in their product code.
- [ ] The documents of §7 are written; the CHANGELOG entry and the pull request body carry §3.3.
- [ ] The owed row of §9 is with the session that owns the bridge plan; the summary says so.
- [ ] `coai`: a `review_plan` round passed before the first test; a `review_code` round ran on the finished branch;
      each finding has an accept or a reject with a reason; the summary has the verdicts and the number of reviewers
      that answered.
- [ ] `node .agents/conventions/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; a change of this plan after its
      approval is an entry of its ledger; the plan is promoted with its deviations.
- [ ] The summary names the models and the counts of the launches.
- [ ] The lead and the owner have heard that a release must follow, and have the questions of §14.

## 12. Deviations — what shipped differently from this plan

(Empty until the plan is promoted.)

## 13. Found along the way (not built here)

- **F1. A link to a folder reads as *no longer in this vault*.** `sshLinkOf` has one sentence for a node that is
  missing, a node that is not an entry, and an entry with no details (`remoteLaunch.ts:56-58`, `:92-99`). For a folder
  the cause is another one. The journal of a linked run gets this sentence in a stable vault (observed), and the person
  reads it on each road that runs a linked entry. To change it changes a sentence of the person's roads, so it is not
  *journal only* and it is not built here (Q2).
- **F2. The journal line of a link refusal names the SSH entry.** The Trash reason holds its name
  (`remoteLaunch.ts:60-62`; observed: `"prod box"`), and `linkGate` writes that reason to the journal
  (`agentUseActions.ts:252-254`). F7 §2.5 says that the reason does not name the SSH entry; that is true of the reasons
  of `whyUnusable` only. The journal is a plain file on the person's computer (N3 of F7). Recorded; not changed.
- **F3. The entry lookup stops at the first account whose node the agent may view, also for `closed`.** A closed entry
  in the first account hides a usable entry with the same id in the second (`mcpEntries.ts:364-369`, `:449-451`). The
  agent may view the two, so nothing hidden is told. The linked run reads one account only, by design
  (`accountOnly`, `:378-386`). Recorded; not changed.
- **F4. The journal page does not show the consent lines.** `mcpRowsIn` keeps the lines with `via` `mcp`
  (`mcpLogRows.ts:29-35`); the lines `→ minted`, `→ ALLOWED` and `→ DENIED` have no `via` (observed). The page shows
  the outcome row of the call. The sentence of §2.3 is written for what the page shows.

## 14. Questions for the owner

The lead puts them to the question consultants first. The work does not wait: each question has the answer that this
plan is built on.

- **Q1 (N9). N9 does not happen in a vault that does not change (§1.2). Build the two causes as a safeguard?** *Built
  on: yes* (one table, three rows). The other answer: no code change; keep guard row WG3; F7's N9 gets the note *not a
  defect today*.
- **Q2 (N9, F1). For a link to a FOLDER the journal says *no longer in this vault*, from `sshLinkOf`.** *Built on: it
  stays.* The other answer gives `sshLinkOf` a sentence for a folder; the person's roads then change too, and it is
  its own small item.
- **Q3 (N2). The sentence fix covers the journal page's five texts and two README sentences, not only the five help
  articles (§1.3).** *Built on: yes.* The other answer cuts T2 to T9 and row H2.
- **Q4 (N2). Should a refusal for an entry that the agent MAY view (a switch that is off) write a journal line?** The
  *Refused* filter was made to count such things. *Built on: no line; the texts say so.* A yes is a new contract with
  a limit of its own, and its own plan.
- **Q5 (N8, D1). An account whose node the agent may view and that is not a config does not stop the config search.**
  *Built on: it does not stop it* (§2.1). The other answer stops there, as the entry lookup does for `closed`.

## Appendix A — the sentence of T1 in the five languages

UI labels stay English in each language (rule 7 of `.agents/PROJECT.md`); this sentence has none. A native reader can
polish a word before the merge; the clauses stay, and row H1 is changed with the text.

| Language | `whatItIs` of `mcp-logs` |
|---|---|
| en | A journal of what AI agents did through this extension: each action that ran for an agent and how it ended, each one that you declined or did not answer, and two counts worth watching — secrets that came FROM an agent, and requests we could not serve. It is not a record of every request. A listing leaves no line. A request that is refused before anybody is asked can leave none: for example an id that is not open to agents, a switch that is off, or a request that is not complete. |
| de | Ein Journal dessen, was KI-Agenten durch diese Erweiterung getan haben: jede Aktion, die für einen Agenten lief, und wie sie endete, jede, die Sie abgelehnt oder nicht beantwortet haben — und zwei Zahlen, die zu beobachten sich lohnt: Geheimnisse, die VON einem Agenten kamen, und Anfragen, die wir nicht bedienen konnten. Es ist kein Protokoll jeder Anfrage. Eine Auflistung hinterlässt keine Zeile. Eine Anfrage, die abgelehnt wird, bevor jemand gefragt wird, kann ebenfalls keine hinterlassen: zum Beispiel eine ID, die für Agenten nicht geöffnet ist, ein Schalter, der aus ist, oder eine unvollständige Anfrage. |
| es | Un diario de lo que los agentes de IA hicieron a través de esta extensión: cada acción que se ejecutó para un agente y cómo terminó, cada una que usted rechazó o no respondió — y dos cuentas que conviene vigilar: secretos que vinieron DESDE un agente, y peticiones que no pudimos atender. No es un registro de todas las peticiones. Un listado no deja ninguna línea. Una petición que se rechaza antes de preguntar a nadie puede no dejar ninguna: por ejemplo, un id que no está abierto a los agentes, un interruptor apagado o una petición incompleta. |
| ru | Журнал того, что ИИ-агенты сделали через расширение: каждое действие, выполненное для агента, и чем оно закончилось, каждое, которое вы отклонили или оставили без ответа, и два счётчика — секреты, пришедшие ОТ агента, и запросы, которые мы не смогли выполнить. Это не запись каждого запроса. Список не оставляет строки. Запрос, отклонённый до того, как кого-либо спросили, может не оставить строки: например, id, не открытый агентам, выключенный переключатель или неполный запрос. |
| uk | Журнал того, що AI-агенти зробили через це розширення: кожна дія, виконана для агента, і чим вона закінчилася, кожна, яку ви відхилили або залишили без відповіді, — і два лічильники, за якими варто стежити: секрети, що прийшли ВІД агента, і запити, які ми не змогли обслужити. Це не запис кожного запиту. Перелік не лишає рядка. Запит, відхилений до того, як когось запитали, може не лишити рядка: наприклад, id, не відкритий агентам, вимкнений перемикач або неповний запит. |

## Epics

One epic, because the three items are small and share one release. Its stories are here and not in a document of their
own: the lead asked for it for a plan of this size, and the family has done it before
([PLAN_query_refuses_client_commands.md](PLAN_query_refuses_client_commands.md), `## Epics`). The rows and the
mutations of §6 are the scenarios of each story. Fable wrote this plan and the split, because S1 is a judgement on
authorisation (what an agent may see). The question consultants are NOT asked yet: the lead asks them before the plan
round, and the split is final after that. Sonnet codes each story from its rows; Opus reviews each one; the security
reading of S1 is Fable's, at review. One epic gives a cornerstone quota of 1.

Cornerstones: 1 of 1 — S1

### E1 · Three small truths, on `fix/n8-n9-n2-small-truths`

- **Goal.** The config lookup answers alike for a hidden node and for a missing id, in each account. The journal
  reason of a linked run names the real cause for each state that the lookup refuses. No text says that the journal
  holds every request.
- **Scope.** §2, §3.1, §6, the documents of §7, the owed row of §9.
- **Depends on.** Nothing. F7 is merged and released (extension 1.21.1 and 1.21.3).
- **Done when.** §11 is ticked and the code round has run.
- **Pass criteria, each one a thing that can be counted.**
  1. In the 3 cases of C1 and in C3 the lookup gives the config of the second account; in C2 the 2 bodies are equal.
  2. In the 4 worlds of CG1 the answer is `undefined`; in CG3 the bridge's supplier read 0 nodes of another account.
  3. In W1 to W3 the journal has 1 note with the reason of §2.2, and the agent's answer has 0 changed bytes.
  4. J1: 0 lines for 3 list routes. J2: 0 lines for 6 refusals. J3: 3 rows with their 3 outcomes.
  5. H1 holds for 5 of 5 languages; H2 for the 5 texts of the journal page.
  6. Each of the 13 mutations turns at least 1 row red.
  7. `contract/`, `src_mcp` and `src_cli` have 0 differences. No interface gets a new member.
- **Cornerstone area.** The config lookup (S1): a mistake there gives an agent the config of a wrong account, or of a
  node that it may not view, in an answer that passes each other test.

**Stories.**

- **S1 · N8, the config lookup (the cornerstone; this document is its specification, by Fable).** Rows C1 to C3 RED
  first, with the failure messages kept. Then A1 and A2. Guards CG1 to CG4. Mutations M1 to M4. Complete on its own.
- **S2 · N9, the journal reason.** Rows W1 to W3 RED first. Then B1 to B3. Guards WG1 to WG4. Mutations M5 to M8.
  Complete on its own; it shares no line with S1.
- **S3 · N2, the texts, and the record.** Rows J1 to J3 with mutations M9 to M11 on the unchanged code. Rows H1 and H2
  RED. Then T1 to T9, mutations M12 and M13, the CHANGELOG entry, the two documents of `research/`, the closing checks
  of §5, the code round and the pull request. It follows S1 and S2, because the documents record them as built.
