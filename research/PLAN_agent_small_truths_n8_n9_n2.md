# PLAN — Three small truths of the agent surface: the config lookup, the journal reason of a linked run, the texts about the journal (N8, N9, N2)

> Status: **IMPLEMENTED, 2026-11-27.** N8, N9 and N2 (one epic, four stories S1 to S4) are built, merged and released.
> Merged as #397 (squash `147fc0da`) and released in extension 1.24.1 (release PR #398, `3764a566`, tag
> `extension-v1.24.1`; the `release.yml` run 45969687480 published `remsoftdev.creds-for-devs` v1.24.1 on 2026-11-27 at
> 09:08Z; the GitHub release holds the vsix and is not a draft). Deviations: §12. Ledger at promotion: epoch 1 closed with
> entries 1.1 and 1.2 and the stop; epoch 2 approved by reviewers, 0 changes (left as it stood, append only). The owner
> answered Q1 on 2026-11-27: keep the N9 table. Q2 and Q7 to Q10 were not answered; the plan is built on their default
> answers, and shipped so. Not done, and open: the two nits of the Opus review of S4 (N1, N2 of §12), the check of the
> four translations by a native reader, and the items Q4, F6 and F10 (§13), which were not built here. Scope: unchanged
> from the status below.
>
> The status as it stood before the promotion, kept as it was written: **re-reviewed 2026-11-27: epoch 2 is open (`by reviewers`); S1 to S4 are on the branch, not merged (S4:
> `2aef3f1b`, `9d85af48`, `eeb52651`); the code round of epoch 2 passed (`proceed`, 4 of 4 reviewers); not released;
> the pull request waits for the owner.** The plan stopped at entry 1.2 on 2026-11-27 and was revised as a whole on
> the same day (the record is in `## Plan changes`). Built on the branch `fix/n8-n9-n2-small-truths`: S1 `d12df88a`,
> S2 `fe2c4ddd`, S3 `8515c1e9`, and two review fixes, `19b04992` and `56610bf0`. **S4, the journal page shows the lines
> that it counts** (§1.5, §2.4, §3.4, the rows of epoch 2 in §6.3). Next: the pull request, the merge,
> the release and the promotion. Scope: the extension only (`src_vs_code/src`: `mcpEntries.ts`,
> `agentUseActions.ts`, the five `help*.ts` files, `mcpLogRows.ts`, `mcpLogPage.ts`; for S4 also `brokerMcpDoor.ts`,
> `brokerFolderDoor.ts`, `brokerCall.ts`, `rotateAction.ts`, `secretKinds.ts`, two comments; their tests), two README
> sentences, `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md`,
> `todo/README.md`. One epic, four stories (`## Epics`).
>
> **The re-review, and what the epoch line says.** The re-review had one consultation (`coai`, `d7510da7`; the lead
> checked its answer against the code) and the revision of the whole plan (`345b2ed7`). The interim document round
> of the rule (`review_document` on this file) ran on that revision: its verdict was `proceed`, with 4 findings, and
> the lead accepted the 4. An Opus judge checked the marks in the table of the record and confirmed *Narrowed: no*;
> the judge changed the marks of one commit and named two gaps. The 4 findings and the judge's points are applied in
> the commit after `345b2ed7`; they are part of the re-review and are no entry of the ledger. The round and the
> judge read `345b2ed7`, not the text with these fixes. The epoch line was written before the round as
> `by nobody`; the lead changed it to `by reviewers` after the round passed (`proceed`, 2 of 2 reviewers). The revision found five facts that the lead's decisions did not have: a fourth line with no
> `via` (the folder door), a rotation whose statement failed is noted as `rotated`, the empty messages of the count
> filters are shown by no page, the counts and the rows of a filter can differ (§1.5), and the line of a handler
> that threw has no `via` (F10; not built, Q10).
>
> The owner put three items next, in this order: N8, N9, N2. They are items of §11 of
> [PLAN_agent_refusal_names_unlisted_entry.md](PLAN_agent_refusal_names_unlisted_entry.md) (F7), and that
> plan's §12 lists them as open. **Two commits are the base of the `file:line` here.** §1.1 to §1.4, §2.1 to §2.3,
> §3.1, §3.2, §6.1, §6.2 and the rows and mutations of epoch 1 describe the code BEFORE the build and were read on
> `32cc729c` (extension 1.24.0). S1 to S3 moved lines in `mcpEntries.ts`, `agentUseActions.ts`, `mcpLogRows.ts` (one
> line down, from its line 6) and in the test files that got rows; no other product file changed, so each other
> `file:line` is the same on the two commits. §1.5, §2.4, §3.3 to §3.5, the rows and mutations of epoch 2, F4 to F10
> of §13 and the record below were read on `aa70258c`, the head of the branch. The things that were observed with
> the compiled extension are in §1.4 (on `32cc729c`) and §1.5 (on `aa70258c`).
> Epoch 1 was approved by the `coai` plan round on 2026-11-27 (`proceed`, 1 of 1 reviewers, session `70487363`; its
> one finding was accepted and fixed in the round, `2a5831ba`: the second count of §2.3, row J4, mutation M14). The
> question consultants answered Q3, Q4 and Q5 of §14 as this plan is built; Q1 was split and is the owner's.
> Two of the three items are not what F7 wrote: N9 does not happen in a vault that does not change (§1.2), and N2 is
> wider than one help sentence (§1.3) and wider than the texts (§1.5). §14 has the questions for the owner. Fable
> wrote this plan, the split and this revision.

## Plan changes

> Epoch 1 · approved 2026-11-27 · by reviewers · state: closed

- 1.1 · 2026-11-27 · agent · dod, stories — J4 and M14 hold the journal LINE of a secret that could not be made, not the
  page's filter *Could not generate*; the dead filter is F5 and Q6, not built
  (Found by the coder of S3: `refuseCreation` notes the line with no `via` (`brokerMcpDoor.ts:412-420`), and
  `mcpRowsIn` keeps only `via` `mcp` (`mcpLogRows.ts:34`), so the page never shows it. A rotation that cannot draw a
  secret is noted as `404` (`brokerCall.ts:304`). The J4 of `2a5831ba` could not pass on unchanged code.)
- 1.2 · 2026-11-27 · reviewer · scope, dod — the create, delete and no-generator lines carry no `via`, so the journal
  page shows no row of a create or a delete; the texts of S3 are false on the page; a fix needs new sites
  (Found by the lead's Opus review of the built branch: `brokerMcpDoor.ts:331`, `:413`, `:520`. This second change
  stopped the plan.)

### Re-review for epoch 2

Narrowed: no — the revision adds sites, rows, mutations and texts (story S4); nothing left the scope, the Definition of Done, the merge conditions or the release

| Work | Where | Verdict | Action |
|---|---|---|---|
| The plan as written and as fixed in its plan round, `b2ca179b` and `2a5831ba` | pushed, unmerged | fits | kept: the record of the plan |
| The approval of epoch 1 and the consultants' answers, `96505c4e` | pushed, unmerged | fits | kept |
| S1 (N8): the config lookup goes on to the next account, rows C1 to C3 and CG1 to CG3, `d12df88a` | pushed, unmerged | fits | kept: the revision changes nothing of N8 |
| S2 (N9): the five causes of `whyUnusable`, rows W1 to W3 and WG3, `fe2c4ddd` | pushed, unmerged | fits | kept: Q1 is not answered and the plan stays built on yes; a no is one revert |
| S3 (N2), the part that fits: the decision O1 of §2.3; rows J1 to J4 and the harness of the suite; the texts T2, T4 and T8; the comments T9 at `mcpLogPanel.ts:8` and `mcpLogRows.ts:5-6`; parts 1 and 2 of the CHANGELOG entry (N8, N9); the N8 and N9 text of `research/module_extension.md`; the rows of `research/module_tests.md`, apart from the point that the next row names, `8515c1e9` | pushed, unmerged | fits | kept; S4 adds one sentence to T2 and to T4 (and to the literal of T4 at `test/journalHolds.test.ts:147-150`), rows J5 to J13, and its points of §7 |
| S3 (N2), words that S4 corrects: T1 in the five `help*.ts:137` and T7 at `src_vs_code/README.md:823-826` (*through this extension* becomes *over MCP*); the expectations `WHAT_IT_IS` of H1 at `test/journalHolds.test.ts:118-129`; the heading and the third part of the CHANGELOG entry (*The texts now say what the journal holds* is false of the page, §1.5); the point of `research/module_tests.md:2468-2470` about the count *Could not generate*, which §7 takes out; the comment line `mcpLogRows.ts:10`, which T12 writes again, `8515c1e9` | pushed, unmerged | cut | a fix forward in S4 (T1, T7, H1, T12 and the points of §7); no revert commit, because the commit also holds the work of the row above |
| S3 (N2), words that S4 replaces: T3, T5 and T6 (the hint of *Everything* and the two empty messages), and the assertions that pin those words, `test/mcpLogRows.test.ts:140` and `:188` and `test/journalHolds.test.ts:146` and `:151-155`, `8515c1e9` | pushed, unmerged | cut | a fix forward in S4: the words of §3.4 take their place and the assertions get them; no revert commit, for the same reason |
| Entry 1.1: J4 and M14 hold the journal line, F5 and Q6, `f82140ea` | pushed, unmerged | fits | kept; J4 and M14 stay, and row J7 now holds the page's filter (Q6 is answered) |
| The fix of the code round of S1 to S3: the CG3 fixture of S1 is a typed `EntityMetadata`, and the status, `19b04992` | pushed, unmerged | fits | kept |
| The fix of the Opus review: `whyUnusable` of S2 has no cast, and the record of M14 in `research/module_tests.md`, `56610bf0` | pushed, unmerged | fits | kept; S4 adds M15 to M27 to that record |
| Entry 1.2 and the stop, `aa70258c` | pushed, unmerged | fits | kept: the record of the stop |

  (The reviser, Fable, wrote the first marks in `345b2ed7`. The rule gives the marks to an Opus judge. The judge read
  each row on 2026-11-27, confirmed that each site exists and that nothing is narrowed, and changed the marks of
  `8515c1e9`: its one row *fits* held words that S4 corrects, so the commit now has three rows, one *fits* and two
  *cut*. The other marks stand. Nothing is merged, so nothing is reverted on `main`.)

> Epoch 2 · approved 2026-11-27 · by reviewers · state: open

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
**Corrected by the re-review:** `helpEn.ts:132` is true of the journal FILE and false of the journal page, which shows
no line of a create (§1.5). V3 of §3.4 makes it true of the page.

### 1.4 How the facts were found (the method)

(1) Each function was read at the lines above. (2) `grep -rn` over `src_vs_code/src` (each folder) for each caller of
`visibleConfigDetails` and of `whyUnusable`, and over the repository for the sentence of N2. (3) Three small scratch
runs over the compiled extension of this commit (`npm ci`, `tsc`): the config lookup and the real read route
(`readRouteBody`) over two accounts; the notes of `terminalRunAction(…).validate` in the gate world
(`test/agentSshWorld.ts`) for a stable vault and for a vault that changes between the reads; the journal lines of the
real broker (`test/brokerWorld.ts`) for each request of §1.3, and the rows that the page's reader `mcpRowsIn` gives.
The scripts are not committed. The rows of §6 repeat each observation as a test. NOT done: a run with a real
`creds-mcp`; a run in a real VS Code window; Windows.

### 1.5 N2 on the page — the page does not show the lines that its texts and its counts are about (found after S3 was built)

The article `mcp-logs` and the texts T2 to T6 are about the PAGE *MCP logs*. The page does not show the journal
files. It shows the lines of those files that carry the mark `via mcp` (`mcpRowsIn`, `mcpLogRows.ts:30-36`; the
filter is at `:34`), and of those the newest 2000 (`MAX_ROWS_SHOWN` and `rowsToShow`, `mcpLogRows.ts:141-155`;
`mcpLogPage.ts:32`). The count on each of its five buttons is made from those rows (`mcpLogPage.ts:68`).

The line that says how a call ended gets the mark when the broker writes it: the tail of a use
(`brokerCall.ts:301`, `brokerResponse.ts:249`) and a refusal that has a grant (`credsAgentServer.ts:270-271`,
`:736-745`). Four handlers write their last line themselves, through `door.note`, and give it no `via`. Observed on
`aa70258c`, through the real broker, read with `mcpRowsIn`:

| The request (the person allows it) | Its last journal line | Site | Rows on the page |
|---|---|---|---|
| a create with a secret from the agent | `create app-03 (…) → created with agent secret  app-03 (ssh) in "Servers"` | `brokerMcpDoor.ts:520-529` | 0 |
| a create with no secret | `create no-secret-yet (…) → created  …` | the same | 0 |
| a delete | `delete prod (…) → moved to Trash  prod` | `brokerMcpDoor.ts:331-338` | 0 |
| a create that asks for a secret that this window cannot make (nobody is asked) | `create cert-01 (—) → no generator  …` | `brokerMcpDoor.ts:413-420` | 0 |
| a folder change (`/v1/mcp/folder/create`) | `folder-create Servers (…) → done  staging in "Servers"` | `brokerFolderDoor.ts:183-190` | 0 |
| the same folder change, and the person declines | `folder-create Servers (…) via mcp → denied  …` | `door.refuse`, with the grant | 1 |

The two lines before the last one (`→ minted`, `→ ALLOWED`) have no `via` too, on purpose (F4). So a create, a delete
and a folder change that RAN leave no row, and the same request that is DECLINED leaves one. The counts *Secrets from
the agent* and *Could not generate* are 0 for each create. The fourth site, the folder door, was not in entry 1.2.

**A rotation is on the page, with a false outcome and under a false count.** Observed, with the real `rotateAction`
behind the real broker:

| The rotation | The agent's answer | Its row on the page | Counted under |
|---|---|---|---|
| it ran and the new value is stored | `200 {"rotated":true,…}` | `rotate → rotated` | *Secrets replaced* (right) |
| the window cannot make the kind (`secretKind` `x509`) | `404`, `not_supported`, `"noGenerator":true` | `rotate → 404` | *Secrets replaced* 1, *Could not generate* 0 |
| its statement ran and failed (exit code 1); nothing is stored | `200 {"exitCode":1,"stderr":"denied"}` | `rotate → rotated` | *Secrets replaced* 1 |
| the action refuses it in its run (the entry is gone) | `400`, `invalid_request` | `rotate → 400` | *Secrets replaced* 1, *Refused* 0 |

Three causes:

1. The broker asks the action for its outcome word only when the answer is 200 (`brokerCall.ts:304`). So the word
   `no generator` of the rotation (`describeRotation`, `rotateAction.ts:120-127`) is never written; the line has `404`.
2. `describeRotation` gives `rotated` for each 200 answer (`rotateAction.ts:121-122`). A statement that failed is
   handed back as it came, with the status 200 and no change of the vault (`ranAndStored`, `rotateAction.ts:187-190`;
   pinned by `test/rotateAction.test.ts:130-140`). Its line says `rotated`.
3. `isRotation` is `row.action === 'rotate' && !isRefusal(row)` (`mcpLogRows.ts:92-94`). Each outcome that is not one
   of the eleven codes of `REFUSALS` (`:73-85`) is a replaced secret for it: `404`, `400`, `no generator`, and also
   `ignored`, `ABANDONED` and `withheld`.

**A count and the rows of its filter can differ.** The count of a button is `applyFilter` (`mcpLogRows.ts:121-124`),
each matcher alone. The filter that shows a row is the FIRST matcher of `KINDS` that fits (`mcpLogPage.ts:131-134`,
`:144-149`). A row `rotate → no generator` fits two matchers: it is counted on two buttons and shown under one. The
existing fixture has such a row (`test/mcpLogRows.test.ts:195-203`); `applyFilter(rows, 'rotations')` gives 1 there.

**What this makes false, on the page:**

| Text | The clause | Why it is false |
|---|---|---|
| T1 as built (`help*.ts:137`), T7 (`src_vs_code/README.md:823-826`) | *each action that ran for an agent and how it ended* | a create, a delete and a folder change that ran have no row; a failed rotation ends as `rotated` |
| T1, T7, T8 (`README.md:236-237`), `helpEn.ts:132` | the two counts | *Secrets from the agent* is 0 for each create; *Could not generate* is 0 for each request |
| the hint of *Secrets replaced* (`mcpLogRows.ts:51`) | *Every secret an agent rotated* | the count holds rotations that replaced nothing |
| T1, T7 | *what AI agents did through this extension* | the page shows the MCP door only; a call through a CLI alias or a token is in the files and not on the page (`AuditDoor`, `agentAuditLog.ts:54`). T2 does not have this fault: it says itself that the page is *filtered to the calls that arrived through MCP* |
| T2 (`mcpLogPage.ts:63-65`) | *it is the audit file, filtered to the calls that arrived through MCP* | its words are right for a line with the mark. They do not say that a create, a delete and a folder change that arrived through MCP have no mark: today each one, and after V1 to V4 the ones of an older version. So T2 keeps its words and gets one sentence more (§3.4) |
| T3 (`mcpLogRows.ts:42`), T5 (`:166`), T6 (`:173`) | *Every line of the journal that came through MCP*; *The journal holds no line yet*; *No refusal is in the journal* | a line with no mark is not shown; the page shows the newest 2000 rows; so *no line* and *every line* are claims about the files that the page cannot make |
| the comment at `mcpLogRows.ts:8-9`, `research/module_extension.md:7050-7052`, the comment at `agentAuditLog.ts:4` | *one line per call* | observed: a create that ran writes three lines, a listing none, a refused lookup none |

**The empty messages of the filters are shown by no page.** `emptyMessage` has a sentence for each filter (`EMPTY`,
`mcpLogRows.ts:172-178`, and the default at `:168`). The product calls it in one place, with `('all', 0)`
(`mcpLogPage.ts:71`). When a filter fits no row of a page that has rows, the page shows its own fixed sentence,
`Nothing matches that filter.` (`mcpLogPage.ts:102`, shown by the script at `:85-87`). So T6 of S3 and the two
sentences of the count filters (`mcpLogRows.ts:174-177`) are read by tests only (`test/mcpLogRows.test.ts:186-188`,
`:221-223`; `test/journalHolds.test.ts:155`). They mislead no person today. They are false sentences in the code, and
a later change that shows them would show them as they are (F8).

**Lines of an older version stay without the mark.** The journal files are kept for 14 days
(`AUDIT_RETAIN_DAYS`, `agentAuditFile.ts:84`). After the fix, a create, a delete or a folder change that ran under an
older version is still in a file and still not on the page, until its file is swept.

**The method.** Four scratch runs over the compiled extension of `aa70258c` (`out/`, built by `tsc`; no source file
is newer than it), with `test/brokerWorld.ts` (`world`, `share`, `call`): a create with and with no secret, a delete,
a create with no generator, a folder create that is allowed and one that is declined; the real `rotateAction` (as
the world's `realActions.rotate`) for the four rotations of the table; a create whose `make` throws (F10);
`formatAuditLine` and `parseAuditLine` for each outcome word. Each run printed the journal lines, the rows of
`mcpRowsIn` and the five counts of `applyFilter`. `grep -rn` over `src_vs_code/src` for each reader of `via`, each
caller of `door.note`, of the funnel `log`, of `emptyMessage`, of `parseAuditLine` and of `describeOutcome`, and over
the repository for *one line per call*. The scripts are not committed. The rows of epoch
2 in §6.3 repeat each observation as a test. NOT done: a real VS Code window with the page open (the script of the
page did not run); a real `creds-mcp`; Windows.

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

**The new sentence, in English (the source).** The four other languages are in Appendix A. S3 built it without the
words *over MCP* and without its two last sentences; S4 adds the three (§2.4, D5).

> A journal of what AI agents did over MCP through this extension: each action that ran for an agent and how it ended,
> each one that you declined or did not answer, and two counts worth watching — secrets that came FROM an agent, and
> secrets that this window was asked to make and could not. It is not a record of every request. A listing leaves no
> line. A request that is refused before anybody is asked can leave none: for example an id that is not open to
> agents, a switch that is off, or a request that is not complete. A request that fails inside this window can leave
> no row on the page. A create, a delete or a folder change that ran under an older version of the extension is absent
> from the page while its journal file is kept; the files are swept after 14 days.

Each clause is a thing that a row of §6.3 observes. *can leave none* and *for example* are there on purpose: a refusal
of `validate` comes before the question and DOES leave a line (observed: `invalid_request  no command given`), and the
first request over the rate limit in a window leaves one. The clauses *each action that ran … and how it ended* and
*two counts* are true of the page only after S4 (§1.5). The sentence *A request that fails inside this window can
leave no row* is the limit of the first clause: it does not promise a row for a request whose handler threw (F10,
guard JG4). *can* is there on purpose: an action that throws in the broker's tail does leave a row, `internal`.

**The second count is not a count of refusals.** The old text called it *requests we could not serve*. It is the journal
line `→ no generator` (`NO_GENERATOR_OUTCOME`), which the filter *Could not generate* of the journal page was made to
count (`mcpLogRows.ts:57-61`, `isNoGenerator` at `:116-118`): the secrets that an agent asked this window to make and
that the window could not make. A refused lookup or a switch that is off is not in it. The new sentence names it so, in
the five languages (found by the `coai` plan round, 2026-11-27). Row J4 holds the line. The page did not show that line
when S3 was built (F5, entry 1.1); S4 makes the page show it, and rows J7 and J8 hold the count.

### 2.4 N2 on the page — the page shows the lines that it counts (the re-review; S4)

The base is the consultation `d7510da7` and the lead's check of it. Five decisions.

**D2: the mark is given where the line is written, at four sites.** Two ways were weighed.

| | (a) the writer gives the mark | (b) the reader takes lines with no mark |
|---|---|---|
| Change | `via: 'mcp'` at the four `door.note` calls of §1.5 | `mcpRowsIn` takes a line with no `via` when its action is a create, a delete or a folder change |
| The rule of the page | stays one: a line with the mark is a row | a second rule: a list of action words in the reader, which a new action can miss |
| Lines of an older version | stay invisible, for the 14 days that a file is kept | become visible |
| The consent line of the same request (`create Servers (…) → ALLOWED`: the same action word, no mark; observed) | stays out | must be told apart by its outcome word: a second list |

**The decision: (a).** One rule, and the writer knows its door. The cost is the last row but one: a sentence says so
(D5). Only the line that ENDS the request gets the mark, so a request that ran gives one row more, not three. One
line that ends a request stays with no mark, and this plan does not change it: the line of a handler that threw
(`request → failed`, F10). The texts say so (D5), and no text of this plan says that EACH line that ends a request
has the mark.

*Who reads `via`, and what changes.* Method: `grep -rn` over `src_vs_code/src` for `via`.

| Reader | What it reads | Does it change? |
|---|---|---|
| `formatAuditLine` (`agentAuditLog.ts:80-85`; the mark at `:82`) | the `via` of the entry | yes: the four lines get ` via mcp` between the grant and ` → `, 8 characters |
| the one funnel `log` (`credsAgentServer.ts:754-762`) | gives the entry to the formatter, then to the output channel and the file | the same four lines; no other |
| `parseAuditLine` (`agentAuditLog.ts:110-127`, `LINE` at `:135-136`) and `mcpRowsIn` (`mcpLogRows.ts:34`), the page's one reader | the mark of a line | yes: the four lines become rows |
| the rate limits and the counts of a door (`aliasThrottle.ts:284-294`, `:401-404`; called at `credsAgentServer.ts:118`, `:228`) | the door of the CALL (the `via` of `doorFor`, `credsAgentServer.ts:268`) or of the ceiling; never an entry of `note` | no |
| the consent memory (`answeredHere`, `brokerConsentMemory.ts:38-40`) and the consent question (`credsAgentServer.ts:287`) | the door of the call | no |
| the refusal of a Remote Bridge (`outOfScopeAnswer`, `bridgeScope.ts:244-249`) | the door of the call | no; and a bridge serves none of these routes (`bridgeAllowList.ts:85-87`, `:94`) |
| the route tests that match a part of a line (`test/brokerMcpRoutes.test.ts:377-378`) | `created with agent secret`, `→ created ` | no: the mark stands before ` → ` |
| `creds-mcp` and `creds` | they do not read the journal | no |

*Left alone, on purpose.* The line `→ minted` (`brokerMcpDoor.ts:343-354`, `brokerFolderDoor.ts:195-206`,
`brokerBridgeToken.ts:72`), the consent lines `→ ALLOWED` and `→ DENIED` (F4), and the shared callback
`note: (entry) => this.log(entry)` (`credsAgentServer.ts:282`). A mark there gives two or three rows for one
request and makes *Everything* count each request more than one time. Guard JG2 and mutation M22 hold it.

*The mark is the literal `'mcp'`*, as the quiet line has it (`quietly`, `brokerMcpDoor.ts:263`). The four handlers are
reached from the MCP routes only (`brokerMcpRoutes.ts:54-74`, `:96-100`), through the door of
`credsAgentServer.ts:244`, whose `via` is `'mcp'` (`:268`). The one door with another `via`, the token door of a
bridge (`:497`), runs `bridgedTokenCall` and none of the four.

**D3: the line of a rotation says how the rotation ended.** Two sites, three changes (R1 to R3).

| The answer of the action's run | The agent reads | The journal word today | The word after |
|---|---|---|---|
| 200 with `rotated: true`, stored | `200 {"rotated":true,…}` | `rotated` | the same |
| 200 with `rotated: true`, `stored: false` | the same, with the message | `rotated, not stored` | the same |
| 200 with `rotated: true`, `stored: 'quarantined'` | the same, with the message | `rotated, quarantined` | the same |
| 200 with no `rotated` (the statement ran and failed; nothing is stored) | the statement's own answer | `rotated` | `statement failed` |
| 404 with `noGenerator: true` | `404`, `not_supported` | `404` | `no generator` |
| 400 (the action refuses in its run: the entry is gone, one-use, woven, a PIN) | `400`, `invalid_request` | `400` | the same (F6) |
| an error answer of the STATEMENT action, handed back as it came: 404 (`not_found`, `not_supported`; no `noGenerator`), 409 (`no_credential`), 412 (`tool_missing`), 429 (`too_many_requests`), 500 (`internal`) | the same status and body | the status number | the same; the 404 of the statement stays `404` and is NOT `no generator` |
| a status that is not 200 with a body that is no object (`null`, a text) | as it came (observed: `502 null`) | the status number | the same |

The error answers of the statement are the ones that its two actions can give off a bridge: the query of a database
entry and the command of an SSH entry (`extension.ts:653-654`; `fail`, `agentUseActions.ts:88-90`, used at `:601-648`,
and `sshUseActions.ts:140-142`, used at `:439-447` and through `refuse`, `:401`; the status of each code,
`brokerProtocol.ts:41-54`). A rotation is not served on a bridge (`bridgeAllowList.ts:94`), so the 403 of a bridge
does not come. Each such answer was observed through the real broker on `aa70258c` (404, 409, 429, 500; 412 is the
same function with another code): the status and the body go to the agent as they came, the line has the status
number, and the store is not called.

- **R1.** The broker asks the action for its word also when the action is `rotate` (`brokerCall.ts:304`). Each other
  action keeps the status number for an answer that is not 200: their `describeOutcome` reads a 200 body
  (`execOutcome`, `agentUseActions.ts:97-100`). `describeRotation` reads a body that is not 200 already
  (`rotateAction.ts:124-126`), so the word `no generator` is there and waits. **R1 sends EACH status of a rotation to
  `describeRotation`, not only 404.** So the rows J11 and J12 hold each answer of the table and its word, before and
  after.
- **R2.** `describeRotation` gives a `rotated` word only for an answer that carries `rotated: true`
  (`rotateAction.ts:391-393` is the one place that sets it). A 200 answer with no `rotated` gets `statement failed`.
  The word says what is known: the statement ran and did not succeed, and nothing was stored. It does not say that the
  far side did not change (`rotateAction.ts:183-185` says why that is not known). Q8.
- **R3 (the judge's gap 2). `describeRotation` reads a field of the body only when the body is an object that is not
  `null`.** Today the function reads `noGenerator` from the body of an answer that is not 200 with no test
  (`rotateAction.ts:124`). Observed on `aa70258c`: for `{ status: 502, body: null }` it throws a `TypeError`. Today
  that cannot happen in a call, because the broker does not ask for the word of such an answer. After R1 it can, and
  the place is bad: the broker asks for the word outside its `try` (`brokerResponse.ts:197`; the `try` is `:191-196`),
  so the throw leaves `runAndDeliver`, the handler fails, and the agent reads `500`, `internal` where it read `502`
  before. Each body that the product makes today is an object (the two tables above), so the case needs a statement
  action that answers so. The guard is in `describeRotation`, for each status: a body that is no object, or is
  `null`, gets the status number as its word, as today. Row J13 feeds such a body and holds the answer; mutation M27
  takes the guard out.

**The answer to the agent does not change by a byte.** The word goes to the journal line only: `answered` writes the
line with it and sends `result.status` and the masked body, which do not read it (`brokerResponse.ts:247-250`). Rows
J8 and J10 assert the status and the whole body FIRST, with the values that the unchanged code gives, and the journal
word after. So the failure of each row on the unchanged code names the journal word, and that proves that the
assertions of the answer passed before the change.

**D4: *Secrets replaced* counts the words that say a secret was replaced.** `isRotation` is true for the action
`rotate` with one of the three words `rotated`, `rotated, not stored` and `rotated, quarantined`. The three words are
written in ONE place and exported, beside `NO_GENERATOR_OUTCOME` (`secretKinds.ts:122-128`, which says why one string
serves the writer and the filter); `describeRotation` and its `JOURNAL_WORDS` (`rotateAction.ts:466-469`) and
`isRotation` read them. *Rotated, not stored* is a replaced secret: the far side has the new value, and the person was
handed it. After D3 and D4 no row fits two of the four matchers, so the count of a button is the number of rows that
its filter shows (row P3).

The counts of a rotation that cannot draw its secret, after S4: *Could not generate* 1, *Secrets replaced* 0,
*Refused* 0 (row J8).

**D5: each text says what the page shows.** Each text of §1.5 was read again against the page after D2 to D4.

| Text | After D2 to D4, is it true? | The change |
|---|---|---|
| T1 and T7, *each action that ran … how it ended*; the two counts | not for each request: a handler that THREW leaves a line with no mark and no row, and the agent reads `500` (F10; not built, Q10) | one sentence more, in T1 (five languages) and in T7: *A request that fails inside this window can leave no row on the page.* Guard JG4 holds the fact. (Finding 1 of the document round) |
| T1 and T7, *through this extension* | no: the page is the MCP door | *over MCP* |
| T1, T2 and T7, for a line of an older version | no, while its journal file is kept | one sentence more, which names the limit: *absent from the page while its journal file is kept; the files are swept after 14 days.* (Finding 3 of the document round) |
| T3, *Every line of the journal that came through MCP* | no: the cap, and the lines of an older version | *Every line that this page shows.* |
| T4, the hint of *Refused* | it does not say where a refused rotation with the outcome `400` is (F6) | one sentence more |
| T5, *The journal holds no line yet* | no: the files can hold lines that the page does not show | *No line to show yet.* |
| T6 and the three other empty messages of a filter (shown by no page) | no: *nothing was ever …* is a claim about the files | *No line shown here is …* |
| the hint of *Secrets replaced*, *Every secret an agent rotated* | no: a rotation that threw after it wrote, or whose answer was withheld, can have replaced a secret (F9) | *Each rotation that the journal records as done.* |
| T8; `helpEn.ts:132`; the hints of *Secrets from the agent* and *Could not generate* (`mcpLogRows.ts:56`, `:61`) | yes | none |
| *one line per call* (three places) | no | what the journal holds; and T13 and T12 do not say that EACH line that ends a request records its door: they name the line of a handler that threw as the one that does not (Finding 1) |

T1 does not name the cap of 2000 rows: the page says the cap itself when it cuts (`mcpLogPage.ts:72`), and no clause
of T1 says *for all time*. **The 14 days.** `AUDIT_RETAIN_DAYS` is 14 (`agentAuditFile.ts:84`). The sweep runs when a
window opens its journal file (`brokerAuditWriter.ts:46-54`, `:75-89`), and it keeps the newest file at each age
(`agentAuditFile.ts:57-60`). So a file can stay for more than 14 days when no window starts. The exact clause of the
sentence is *while its journal file is kept*; *swept after 14 days* is the rule of the sweep. The exact words are in
§3.4 and Appendix A.

## 3. The sites

### 3.1 Sites that change (S1 to S3: built)

*Today* is the code of `32cc729c`, before the build. S4 changes T1 to T7 again; their words after S4 are in §3.4.

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
| the sentences listed as true in §1.3 | true, with the one correction that §1.3 has now |

### 3.3 What changes for an agent or a script (the contract, said explicitly)

**One answer changes (S1).** `GET /v1/mcp/config-snippet` (`creds_config_snippet`) for an id that two accounts of ONE
window hold: when an earlier account has no visible config with that id and a later account has one, the answer is the
catalog or the snippet of that config. Before, it was `{"error":"no such config is open to agents", …}`.

**No other answer changes, and S4 changes none.** The status, the code and the body of a create, a delete, a folder
change and a rotation are the same bytes as before (rows J5 to J13 assert each answer, each status of a rotation
that is not 200 among them). No route, status, code, body
shape, sentence or tool description changes. `contract/broker-v1.json` and `contract/mcp-tools-v1.json` do not
change, and the product code of `src_mcp` and `src_cli` does not change. Nothing changes on a Remote Bridge: a bridge
has one account for N8 (§2.1), and it serves no create, delete, folder change or rotation
(`bridgeAllowList.ts:85-87`, `:94`). No answer of `creds_run` changes.

**The journal files: no line is added and none is removed. These lines change.**

| The line | Before | After | Story |
|---|---|---|---|
| the reason of a linked run that the gate refuses | §2.2, for a read that differs from the link's read | §2.2 | S2 |
| a create that ran; a delete that ran; a create with no generator; a folder change that ran (four lines) | no mark of the door | ` via mcp` before ` → `, 8 characters | S4 |
| a rotation that cannot draw its secret, through each door | `→ 404` | `→ no generator` | S4 |
| a rotation whose statement ran and failed, through each door | `→ rotated` | `→ statement failed` | S4 |

The line format of the journal is not a contract for another program: *the format is not a wire contract anybody
else implements, it is a shape this product prints and then shows in a filtered view* (`agentAuditLog.ts:101-103`).
Its one reader is the page (`parseAuditLine` is called at `mcpLogRows.ts:33` and in tests). A person who searches the
files for `) → created` must now search for `→ created`.

**The page *MCP logs* (S4).** A create, a delete and a folder change that ran have a row. The counts *Secrets from the
agent* and *Could not generate* count. *Secrets replaced* no longer counts a rotation that replaced nothing. A line
that an older version wrote with no mark stays out of the page while its file is kept. A request whose handler
threw has no row, as before (F10).

The CHANGELOG entry and the pull request body say this.

### 3.4 The sites of S4 (not built)

*Today* is the code of `aa70258c`.

| # | Site | Today | After |
|---|---|---|---|
| V1 | `brokerMcpDoor.ts:331-338`, the line of a delete that ran (`moved to Trash`, `gone already`) | no `via` | `via: 'mcp'` |
| V2 | `brokerMcpDoor.ts:413-420`, the line of a create with no generator | no `via` | `via: 'mcp'` |
| V3 | `brokerMcpDoor.ts:520-529`, the line of a create that ran (`created`, `created with agent secret`) | no `via` | `via: 'mcp'` |
| V4 | `brokerFolderDoor.ts:183-190`, the line of a folder change that ran (`done`) | no `via` | `via: 'mcp'` (Q7) |
| V5 | the comment of `via` in `BrokerDoor.note` (`brokerMcpDoor.ts:72-78`) | names the quiet line only | says the rule: a handler that writes the line that ends its request gives the mark; `minted` does not, and why. It names the one line that ends a request with no mark, the line of a handler that threw (`brokerRequests.ts:371`) |
| R1 | `brokerCall.ts:304` | `result.status === 200 ? useAction.describeOutcome(result) : String(result.status)` | the action's word also when `action === 'rotate'` (the `action` of `:291`); each other action as today |
| R2 | `describeRotation`, `rotateAction.ts:120-127`, and its comment at `:114-119` | each 200 answer is `rotated` or a `JOURNAL_WORDS` word | a 200 answer with `rotated: true` as today; a 200 answer with no `rotated` is `statement failed` (Q8) |
| R3 | the same function, where it reads the body (`rotateAction.ts:122`, `:124`) | reads `stored` and `noGenerator` from the body with no test; a body that is `null` throws a `TypeError` (observed) | reads a field only when the body is an object that is not `null`; each other body gets the status number as its word, as today (§2.4, R3) |
| L1 | `isRotation`, `mcpLogRows.ts:91-94`; the three words at `rotateAction.ts:122` and `:466-469` | `row.action === 'rotate' && !isRefusal(row)`; the words are literals of `rotateAction.ts` | the action `rotate` and one of the three words; the words are exported one time from `secretKinds.ts`, beside `NO_GENERATOR_OUTCOME` (`:128`), and the two files read them |
| T1 | `whatItIs` of `mcp-logs` in the five `help*.ts` files, line 137 | the sentence of S3 | Appendix A: *over MCP*, and two sentences at its end: a request that fails inside the window, and the lines of an older version with the 14 days |
| T2 | the lede, `mcpLogPage.ts:63-65` | *What AI agents did through this window, … Nothing here is a second copy: it is the audit file, filtered to the calls that arrived through MCP.* | the same, and one sentence more: *A create, a delete or a folder change that ran under an older version of the extension is absent while its journal file is kept; the files are swept after 14 days.* |
| T3 | the hint of *Everything*, `mcpLogRows.ts:42` | *Every line of the journal that came through MCP.* | *Every line that this page shows.* |
| T4 | the hint of *Refused*, `mcpLogRows.ts:46` | the sentence of S3 | the same, and one sentence more: *A call that ended with an error status is under Everything.* |
| T5 | the empty page, `mcpLogRows.ts:166` | *The journal holds no line yet. A listing leaves none, …* | *No line to show yet. A listing leaves none, and a request that is refused before anybody is asked can leave none. Entries are invisible to agents until you turn on Agent access for one.* |
| T6 | the empty message of *Refused*, `mcpLogRows.ts:173` (shown by no page) | *No refusal is in the journal. A request that is refused before anybody is asked can leave no line.* | *No line shown here is a refusal. A request that is refused before anybody is asked can leave no line.* |
| T7 | `src_vs_code/README.md:823-826` | the sentence of S3 | *each action that ran for an agent over MCP and how it ended*; and after *can leave none.*: *A request that fails inside the window can leave no row, and a create, a delete or a folder change that ran under an older version is absent while its journal file is kept (the files are swept after 14 days).* |
| T10 | the hint of *Secrets replaced*, `mcpLogRows.ts:51` | *Every secret an agent rotated. The value passed through this window and never through the agent.* | *Each rotation that the journal records as done. The value passed through this window and never through the agent.* |
| T11 | the three other empty messages of a filter (shown by no page): the default at `mcpLogRows.ts:168`, `agentSecrets` at `:174-175`, `noGenerator` at `:176-177` | *No secrets have been replaced by an agent.*; *No secret has reached the vault from an agent. Every value an agent used was held by this window.*; *Nothing was asked for that this window could not make. The generators have covered everything an agent has wanted.* | *No line shown here is a rotation that the journal records as done.*; *No line shown here is a secret that came from an agent.*; *No line shown here is a secret that this window could not make.* |
| T12 | three comments: `mcpLogRows.ts:8-13`; `agentAuditLog.ts:4-6`; `isRotation`, `mcpLogRows.ts:91` | *one line per call*; *One line per agent call*; *A rotation that actually happened* | what the journal holds, in the words of T1: a line when a grant is minted, a line for the answer to a consent question, a line that says how the request ended; a listing writes none, and a request that is refused before a grant exists writes none. The comment of `mcpLogRows.ts` says which lines have the mark of the door: the line that a handler writes at the end of its request, and not `minted`, not a consent line, and not the line of a handler that threw. For `isRotation`: the three words |
| T13 | `research/module_extension.md:7050-7052` | *The broker already writes one line per call … and every line now records which door the call came through* | the same words as T12; *the line that a handler writes at the end of its request records which door it came through; the line of a handler that threw (`request → failed`) names the route and no door, and the page does not show it* |

T8 (`README.md:236-237`) and T9 (the comments of S3) stay as S3 built them. No interface gets a new member:
`BrokerDoor.note` has the field `via` already (`brokerMcpDoor.ts:79`).

**The limits of the lint rule.** A function has a complexity of 4 at most and a file 800 lines
(`src_vs_code/eslint.config.mjs:30-32`). R1 adds one `||` to an arrow function that has one `?:`. R2 and R3 add two
tests to `describeRotation`, which has an `if` and a `?:`; the coder moves the 200 case and the read of the body into
functions of their own.
`brokerMcpDoor.ts` has 531 lines, `brokerFolderDoor.ts` 206, `rotateAction.ts` 507, `mcpLogRows.ts` 178,
`test/journalHolds.test.ts` 159, `test/mcpLogRows.test.ts` 319 and `test/rotateAction.test.ts` 366.

### 3.5 Sites of S4 that were checked and do not change

| Site | Why it stays |
|---|---|
| `minted`, `brokerMcpDoor.ts:343-354` and `brokerFolderDoor.ts:195-206`; the token line of a bridge, `brokerBridgeToken.ts:72` | not the end of a request; a mark gives a second row (D2, M22) |
| the shared callback `note: (entry) => this.log(entry)`, `credsAgentServer.ts:282`; `log`, `:754-762` | a mark there marks `minted` too |
| the consent lines `→ ALLOWED` and `→ DENIED` | F4: the page shows the row of the call |
| `quietly`, `brokerMcpDoor.ts:246-266` | it has the mark |
| `respondError`, `credsAgentServer.ts:718-748`; `door.refuse` at `brokerMcpDoor.ts:411` and `:516`, `consentNotGiven` (`:153-167`) | a refusal with a grant has the mark; a refusal with no grant writes no line (J2, Q4) |
| `mcpRowsIn`, `mcpLogRows.ts:30-36`; `LINE`, `agentAuditLog.ts:135-136` | the rule of the page stays one: a line with the mark is a row (D2). Each outcome word of §2.4 was read back through the two functions (observed) |
| `REFUSALS` and `isRefusal`, `mcpLogRows.ts:73-89` | an outcome that is a status number is not a refusal for the page (F6, Q9); T4 says where such a row is |
| `isAgentSecret`, `isNoGenerator`, `applyFilter`, `MATCHERS` (`mcpLogRows.ts:104-131`); `KINDS`, `kindsOf` (`mcpLogPage.ts:131-149`) | right, when their rows arrive; after L1 no row fits two matchers |
| `emptyMessage` and where the page calls it (`mcpLogRows.ts:164-169`, `mcpLogPage.ts:71`, `:102`) | the page keeps its fixed sentence for a filter with no row; the sentences of a filter are not shown (F8) |
| `rowsToShow` and the sentence of the cap (`mcpLogRows.ts:141-155`, `mcpLogPage.ts:72`) | the page says the cap itself |
| `answered`, `brokerResponse.ts:232-254`; `refuseNoGenerator` and `refuse`, `rotateAction.ts:491-504`; `ranAndStored`, `:187-190` | the answer to the agent does not change |
| `runAndDeliver`, `brokerResponse.ts:185-198`: the word is asked outside the `try` (`:197`) | it stays there. Inside the `try`, a throw of `describeOutcome` would go to `failed` and the agent would read `500` too. R3 makes the function of the rotation safe for each body in place of that (J13, M27) |
| the rate limits, the consent memory, the bridge's refusal (the table of D2) | they read the door of the call |
| the hints of *Secrets from the agent* and *Could not generate* (`mcpLogRows.ts:56`, `:61`); T8; `helpEn.ts:132`, `:125`; `README.md:209`; `src_vs_code/README.md:810` | true of the page after V1 to V4 and R1 |
| the dialog sentence *Each call is logged in the "CredsForDevs: Agent Access" output panel.* (`brokerConsent.ts:325`) | true: a call that raises a dialog has a grant, and its mint writes a line to that panel |
| `src_mcp/src/UseTools.cs:233-234` (*the person's journal records that the secret came from you*) | true of the file before, and of the page after V3; no change in `creds-mcp` |

## 4. Growth surfaces

None is created: no table, folder, cache, process or journal line. O2 of §2.3 would create one, and it is not built.
S4 adds no line to the journal: four lines get 8 characters each. The page gets one row more for a create, a delete
and a folder change that ran; its cap of 2000 rows stays (`mcpLogRows.ts:141`), and the files are swept after 14 days
as before (`agentAuditFile.ts:84`).

## 5. Build order

One epic, four stories, on `fix/n8-n9-n2-small-truths` (from `main` at `32cc729c`), in a worktree of its own. The
first three stories are in the order that the owner gave. S4 follows them, because it corrects the texts of S3 and
needs its suite.

1. **Before the first test. DONE.** The lead asked the question consultants and put the questions of §14 to them
   (§14). The `coai` plan round passed (`96505c4e`) and opened the ledger.
2. **S1 (N8). DONE, `d12df88a`; the fix of the code round, `19b04992` (the fixture of CG3).** Rows C1 to C3 first:
   each was watched FAILING by its assertion on the unchanged code. Then A1 and A2. Guard rows CG1 to CG4 before and
   after. Mutations M1 to M4.
3. **S2 (N9). DONE, `fe2c4ddd`; the fix of the Opus review, `56610bf0`.** Rows W1 to W3 first, watched failing by
   their assertions (they call `validate`, so the new parameter of B1 gives no compile error in a test). Then B1 to
   B3. Guard rows WG1 to WG4. Mutations M5 to M8.
4. **S3 (N2). DONE, `8515c1e9`.** The behaviour rows J1 to J4 on the unchanged code, with mutations M9 to M11 and
   M14. Rows H1 and H2, watched failing. Then T1 to T9. Mutations M12 and M13. A `coai` code round ran on S1 to S3.
5. **The re-review. DONE for the revision `345b2ed7`.** The lead ran the interim document round on this file
   (`review_document`; verdict `proceed`; 4 findings, each one accepted), and an Opus judge checked the marks of the
   record. The commit after `345b2ed7` applies the 4 findings and the judge's points (the rows of `8515c1e9`, the
   list of pinned assertions in §6.3, R3). A finding that is accepted after that commit and that changes a planned
   step is entry 2.1. The lead decides what the epoch line says and when S4 starts.
6. **S4, the lines.** The rows J5 to J13 and P1 to P5 are written first, and each is watched FAILING on the code of
   `aa70258c`; the coder keeps each message. For J5 to J10 the message is about the journal (the assertions about the
   answer stand first and pass). For J11 to J13 the answer and the journal word pass, and the message is about the
   count `rotations`. For P4 the message is about the WORD: a statement that failed gives `rotated`. Guards JG1, JG2
   and JG4 are watched passing. Then V1 to V5, and R3 with R1 and R2 in one change (R1 with no R3 breaks the answer
   of J13; M27 shows it). After this step J5, J6, J7, J9 and P5 pass. J8 and J10 have their new word. J8, J10 and J11 to
   J13 stay red in one assertion, the count `rotations`, until L1.
7. **S4, the page.** P1 to P3 are still red as in step 6. **P4 is watched red a second time, with another message:**
   the word is now `statement failed`, and the old matcher counts it as a rotation. So P4 has two red observations,
   one for the writer (on `aa70258c`) and one for the reader (on the code of step 6), and the summary quotes the two.
   Then L1. P1 to P4, J8 and J10 to J13 pass. Then the mutations M15 to M23 and M25 to M27, each one alone on the code
   of this step.
8. **S4, the texts.** Rows H1 and H2 get the words of §3.4 and Appendix A and row H3 is added; the three are watched
   failing. Then T1 to T7 and T10 to T13, and the existing assertions that §6.3 names. Mutations M12, M13 and M24.
9. The documents of §7.
10. `npm run typecheck`, `npm test`, `npm run lint` and `npm run ratchet` in `src_vs_code`, at lowered priority, with
    the exit of `tsc` read first. `npm run contract` leaves no difference in `contract/`.
11. The `coai` code round on the finished branch, with this revised plan as its plan text (`again: true` when the
    earlier code round of the branch has closed), and the Opus code review at the same time; then the pull request.
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

### 6.3 S3 and S4 (N2) — a new suite, `test/journalHolds.test.ts`; for S4 also `test/mcpLogRows.test.ts`

First the rows of S3, which are built. The rows of S4 follow them, under their own heading in bold.

The header of the suite says: these rows hold what the texts say; when a row of J changes, the texts of T1 to T8 change
in the same commit. J1 to J4 run the real broker of `test/brokerWorld.ts` (`world`, `share`, `call`) and read
`w.audit`. Their behaviour does not change in this plan, so they are not RED rows; a mutation shows that each can fail.

| # | Kind | Input | What must be true (today and after) |
|---|---|---|---|
| J1 | behaviour | `GET /v1/mcp/entries`, `/v1/mcp/folders`, `/v1/mcp/config-snippet?id=…` | each answers 200 and adds 0 lines to the journal |
| J2 | behaviour | on `/v1/mcp/use/exec` and `/v1/mcp/delete`: an id that is not served; an entry whose switch is off; a body with no `entry` | the code is `not_found`, `denied`, `invalid_request`; 0 lines; 0 dialogs |
| J3 | behaviour | a use that is allowed; one that is denied; one that nobody answers | read with the page's own reader `mcpRowsIn` (`mcpLogRows.ts:29-35`): one row each, with the outcome `exit 0`, `denied`, `consent_timeout`; `isRefusal` is true for the last two |
| J4 | behaviour | a create that asks for a secret that this window cannot generate; then an id that is not served, on `/v1/mcp/use/exec` | the create writes one journal line, action `create`, outcome `NO_GENERATOR_OUTCOME`; the refused lookup adds no line (entry 1.1) |

| # | Kind | Input | Today | After |
|---|---|---|---|---|
| H1 | RED | for each language of `HELP_LANGUAGES`: `bodyFor(helpArticle('mcp-logs'), language)` | `whatItIs` is the old sentence | `fallback` is false and `whatItIs` is the sentence of Appendix A for that language |
| H2 | RED | the journal page: the hints of the filters `all` and `refused` (`MCP_LOG_FILTERS`), `emptyMessage('all', 0)`, `emptyMessage('refused', 3)`, and `renderMcpLog([])` | the texts of §1.3 | the texts T2 to T6 of §3.1, exact; the page holds no `Every call an AI agent made` |

H1 and H2 read the text through the product's own functions, as each help row of this repository does
(`test/sshRoadHelp.test.ts:186-190`). They are content rows: a sentence has no other behaviour. The facts that the
sentence states are J1 to J4, in the same suite. T7 and T8 (the two README sentences) and T9 (comments) have no row;
the review reads them, and §11 has a `grep` for the old words.

**Two existing assertions change**, because they pin the sentence that T5 replaces: `test/mcpLogRows.test.ts:140`
(`renderMcpLog([])` includes *No agent has called this window yet*) and `:188` (`emptyMessage('all', 0)` matches it).
Each gets the first words of T5, *The journal holds no line yet*. No other existing test of the journal page or of the
help pins a text of T1 to T6 (method: `grep` over `src_vs_code/src/test` for the old words of §1.3).

**The rows of S4 (epoch 2; not built).** The rows J5 to J13 are in the same suite, `test/journalHolds.test.ts`. They
run the real broker (`world`, `share`, `call` of `test/brokerWorld.ts`), and read the journal with the page's own
reader: `rowsOf(w)` is `mcpRowsIn` over `w.audit` (`test/journalHolds.test.ts:21`). *The four counts* are
`applyFilter(rows, f).length` for `refused`, `rotations`, `agentSecrets` and `noGenerator`. In each row the person
allows the request, when one is asked. Each row asserts the answer FIRST and the journal after (§2.4, D3). The header
of the suite then says: when a row of J changes, the texts T1 to T8 and T10 to T13 change in the same commit.

| # | Kind | Input | On `aa70258c` | After |
|---|---|---|---|---|
| J5 | RED | `world({ create: 'open' })`; `POST /v1/mcp/create` with a `secret` | the answer is `200 {created: true, id, name}`; 0 rows | the same answer; ONE row, `create → created with agent secret`; `agentSecrets` 1, the three other counts 0 |
| J6 | RED | `world({ mcpUse: 'usable', trash: true })`; `POST /v1/mcp/delete` | `200 {deleted: true, entity, restorable: true}`; 0 rows | the same answer; ONE row, `delete → moved to Trash`; the four counts 0 |
| J7 | RED | the world and the request of J4 (a create that asks for a secret that this window cannot make) | `404`, `not_supported`; 0 rows | the same answer; ONE row, `create → no generator`; `noGenerator` 1, `refused` 0 |
| J8 | RED | the real `rotateAction` as the world's `realActions.rotate`, over a scripted statement action; its generator answers `ok: false` for the kind; `POST /v1/mcp/use/rotate` with that `secretKind` | status 404 and the body `{ error: { code: 'not_supported', message }, noGenerator: true }`; ONE row, `rotate → 404`; `rotations` 1, `noGenerator` 0 | the same status and the same body, compared whole; ONE row, `rotate → no generator`; `noGenerator` 1, `rotations` 0, `refused` 0 |
| J9 | RED | `w.server.setFolderHooks(…)` (the shape of `test/consentContractEpoch8.test.ts:125-131`); `POST /v1/mcp/folder/create` | `200 {folder, created: true, id, name}`; 0 rows | the same answer; ONE row, `folder-create → done`; the four counts 0 |
| J10 | RED | the real `rotateAction`; the statement answers `{ status: 200, body: { exitCode: 1, stderr: 'denied' } }` | status 200 and that body; ONE row, `rotate → rotated`; `rotations` 1 | the same status and body; ONE row, `rotate → statement failed`; `rotations` 0, `refused` 0; the store was not called |
| JG1 | guard | the real `rotateAction`; the statement succeeds and the value is stored | `200 {rotated: true, …}`; ONE row, `rotate → rotated`; `rotations` 1 | the same |
| J11 | RED in its count; the answer and the word are a guard | the real `rotateAction`; the action refuses in its run, because the entry is gone | status 400 and the body `{ error: { code: 'invalid_request', message } }`, compared whole; ONE row, `rotate → 400`; `rotations` 1 | the same status and the same body; ONE row, `rotate → 400`; the four counts 0 |
| J12 | RED in its count; the answer and the word are a guard | the real `rotateAction`; the statement action answers an error, one case for each answer that it can give (§2.4, D3): 404 `not_found`, 409 `no_credential`, 412 `tool_missing`, 429 `too_many_requests`, 500 `internal`, each with the body of `errorBody` | in each case the status and the body that the statement gave, compared whole; ONE row with the status number as its outcome (`404`, `409`, `412`, `429`, `500`); `rotations` 1; the store was not called | the same status and the same body; the same outcome, and for the 404 it is `404` and not `no generator`; the four counts 0; the store was not called |
| J13 | RED in its count; the answer and the word are a guard (R3) | the real `rotateAction`; the statement action answers `{ status: 502, body: null }`, and in a second case `{ status: 502, body: 'bad gateway' }` | the answer is `502` with the body `null`, and `502` with the text; ONE row, `rotate → 502`; `rotations` 1 | the same status and the same body in the two cases (not `500`); ONE row, `rotate → 502`; the four counts 0 |
| JG2 | guard, asserted in J5, J6 and J9 | — | `w.audit` holds the lines `→ minted` and `→ ALLOWED` of the request, and `rowsOf` gives a row for neither | the same |
| JG4 | guard: it holds the sentence of T1 and T7 about a request that fails (F10) | a create that the person allows and whose `make` throws | the answer is `500`, `internal`, with the sentence `UNANSWERED_FAILURE`; the journal has the line `request → failed` with the route and no mark; `rowsOf` gives 0 rows for the request | the same. When Q10 is answered with yes, this row and the sentence change in one commit |
| JG3 | guard, no edit | J1 to J4; `test/brokerMcpRoutes.test.ts:367-382`; `test/rotateAction.test.ts:130-140` and `:283-289`; `test/rotationNoLoss.test.ts:326` | green | green, with no change of a line |

The rows P1 to P5 are pure. P1 to P3 are in `test/mcpLogRows.test.ts`, beside the rows of the filters (`:108-132`,
`:191-216`). P4 and P5 call the real `rotateAction` and are in `test/rotateAction.test.ts`, beside the row of the
word `no generator` (`:283-289`); P4 reads `isRotation` there too.

| # | Kind | Input | On `aa70258c` | After |
|---|---|---|---|---|
| P1 | RED | `isRotation` for a row with the action `rotate` and each outcome that the product can write for it: the three `rotated` words; `no generator`; `statement failed`; `404`; `400`; `ignored`; `ABANDONED`; `withheld` | true for each | true for the three `rotated` words, false for each other |
| P2 | RED | the existing fixture (`:195-203`), which has a row `rotate → no generator`: `applyFilter(rows, 'rotations').length` | 1 | 0; `noGenerator` is 2 and `refused` is 1, as today |
| P3 | RED | one row for each outcome word of §2.4 and of J5 to J13 | the row `rotate → no generator` fits two matchers | each row fits one matcher at most; `renderMcpLog` gives the row the `data-kind` of that matcher; so each count is the number of rows that its filter shows |
| P4 | RED, two times (§5, steps 6 and 7) | for each answer of the table of D3: FIRST the word that the real `rotateAction(…).describeOutcome` gives, THEN `isRotation` for a row with that word | on `aa70258c` the first assertion fails: the word for a statement that failed is `rotated`, where the row asks for `statement failed`. On the code after R1 to R3 and before L1 the word is right and the second assertion fails: the old matcher says that `statement failed` and `no generator` are rotations | the words are those of D3; the three answers with `rotated: true` are rotations; each other answer is not. The row of D3 with a body that is no object is not in P4: it is P5 |
| P5 | RED (R3) | `rotateAction(…).describeOutcome` for `{ status: 502, body: null }`, for `{ status: 502, body: 'bad gateway' }` and for `{ status: 200, body: null }`, inside `assert.doesNotThrow` | the first case throws a `TypeError` (observed); the row fails by its assertion | no case throws; the words are `502`, `502` and `statement failed` |

The content rows. H1 and H2 change with the texts; H3 is new.

| # | Kind | Input | On `aa70258c` | After |
|---|---|---|---|---|
| H1 | RED again | as before | the sentence of S3 | the sentence of Appendix A for that language |
| H2 | RED again | as before, and the lede of `renderMcpLog([])` | T2 to T6 as S3 built them | T2 to T6 of §3.4, exact |
| H3 | RED | the hint of the filter `rotations`; `emptyMessage` with rows for `rotations`, `agentSecrets` and `noGenerator` | the old texts | T10 and T11 of §3.4, exact |

T7, T12 and T13 have no row; the review reads them, and §11 has a `grep`.

**Existing assertions that S4 changes**, because they pin a text of §3.4. This is the whole list.

| The assertion | The text that it pins | What S4 does |
|---|---|---|
| `test/mcpLogRows.test.ts:140` and `:188` | T5, its first words (*The journal holds no line yet*) | the first words of the new T5 |
| `test/mcpLogRows.test.ts:186` | T11, `agentSecrets` (*No secret has reached the vault from an agent*) | the new words |
| `test/mcpLogRows.test.ts:187` | T11, the default (*No secrets have been replaced*) | the new words |
| `test/mcpLogRows.test.ts:221` and `:223` | each empty message is longer than 20 characters; `noGenerator` has *could not make* | no edit: the words of T11 keep them green |
| `test/journalHolds.test.ts:118-129` (`WHAT_IT_IS`, read at `:136`) | T1, the five sentences | the sentences of Appendix A |
| `test/journalHolds.test.ts:146` | T3, the hint of *Everything* | the new words |
| `test/journalHolds.test.ts:147-150` | T4, the hint of *Refused* | the same literal with the sentence that T4 gets |
| `test/journalHolds.test.ts:151-154` | T5, whole | the new T5 |
| `test/journalHolds.test.ts:155` | T6 | the new T6 |
| `test/journalHolds.test.ts:157` | T2, its first sentence | no edit of this line: the first sentence stays; H2 gets one assertion more for the sentence that T2 gets |

No existing test pins T7, T10, T12 or T13, and no existing test pins a journal line that S4 changes. Method: `grep`
over `src_vs_code/src/test` for a part of each text of §3.4 as it is today, for `MCP_LOG_FILTERS`, `.hint`,
`emptyMessage`, `whatItIs` and `mcp-logs`, and for `moved to Trash`, `created`, `→ done`, `folder-`, `no generator`,
`via mcp`, `→ rotated` and a status number as an outcome. `test/helpCatalog.test.ts` and `test/helpContent.test.ts`
read the article `mcp-logs` and pin no sentence of it.

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
| M14 | in `refuseCreation` (`brokerMcpDoor.ts:412-420`), write the outcome `denied` in place of `NO_GENERATOR_OUTCOME` (entry 1.1) | J4 |

The mutations of S4 (epoch 2). M12 and M13 are done again on the new texts.

| # | The mutation | Turns red |
|---|---|---|
| M15 | take the `via` out at V3 (`brokerMcpDoor.ts:520-529`) | J5 |
| M16 | take the `via` out at V1 (`brokerMcpDoor.ts:331-338`) | J6 |
| M17 | take the `via` out at V2 (`brokerMcpDoor.ts:413-420`) | J7, and not J4 |
| M18 | take the `via` out at V4 (`brokerFolderDoor.ts:183-190`) | J9 |
| M19 | put the condition `result.status === 200` back alone at `brokerCall.ts:304` | J8, and not J11 to J13 (their word is the status number on each side) |
| M20 | put the old `isRotation` back (`row.action === 'rotate' && !isRefusal(row)`) | P1, P2, P3, the second assertion of P4, and J8 and J10 to J13 (their count `rotations`) |
| M21 | in `describeRotation`, give a `rotated` word for each 200 answer | J10, P4 |
| M22 | give `via: 'mcp'` to `minted` (`brokerMcpDoor.ts:345`); then, as a second mutation, give it in the shared callback (`credsAgentServer.ts:282`) | J5 and J6 (more rows than one), JG2 |
| M23 | take `rotated, quarantined` out of the three words of L1 | P1, P4 |
| M24 | put the old hint of *Secrets replaced* back; then, as a second mutation, one old empty message of T11 | H3 |
| M25 | in `describeRotation`, give `no generator` for each 404 (take the test of `noGenerator` out) | J12, its 404 case |
| M26 | in `describeRotation`, give the code of the body's `error` as the word of an answer that is not 200 | J11 and J12 (the word) |
| M27 | take the guard of R3 out, with R1 in place | P5, and J13 in its `null` case: the agent's answer is `500`, `internal`, where it must be `502` with the body `null` |

### 6.5 What the tests do not prove

- A real `creds-mcp` and a real window. C2 runs the route function that the server calls, not the listener and not the
  binary. Part A of the class test runs the listener for one account (CG4).
- That two accounts of one real vault hold one id. The rows build it; §1.1 says how it can happen.
- That a real vault can change between the reads of the gate. It cannot today (§1.2). W1 to W3 test the function's
  answer for that case, as L6 does.
- The four translations. H1 pins the text that Appendix A has. Nobody measured how a native reader takes it; a native
  reader of each language should read its sentence before the merge.
- T7, T8 and T9: no row. T12 and T13 (comments and a document) have none.
- Windows. The extension suite runs on Ubuntu (`.github/workflows/ci-extension.yml`); no row depends on the system.
- The page in a real VS Code window (S4). The rows read `mcpRowsIn`, `applyFilter` and the markup of `renderMcpLog`.
  The script of the page that hides rows (`mcpLogPage.ts:76-88`) does not run in a row; P3 holds what it reads, the
  `data-kind` of each row.
- That the far side did not change when the line says `statement failed` (§2.4, R2). The word says that the statement
  did not succeed.
- A rotation that threw after it wrote, or whose answer was withheld (F9). It has the outcome `internal` or
  `withheld`, and *Secrets replaced* does not count it; no row holds this case.
- The lines of an older version. No row writes a file of an older version; J5, J6, J7 and J9 show on `aa70258c` that a
  line with no mark gives no row, and that rule of the page does not change.
- A rotation through the alias door or a token. R1 and R2 are in the code that each door shares (`brokerCall.ts`,
  `rotateAction.ts`); the rows use the MCP door.
- A handler that threw (F10). Guard JG4 makes the `make` of a create throw and holds that the page has no row for
  it, before and after S4. No row makes a delete or a folder change throw.
- The status 412 of a statement was not observed in a scratch run; J12 has its case. A 403 of a statement comes on a
  bridge only, and a bridge serves no rotation; no row has it.
- A statement action that answers a body that is no object does not exist in the product today. J13 builds one.

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

The points above are written (S3, `8515c1e9`). **S4 adds these:**

- `src_vs_code/CHANGELOG.md`, the same `### Fixed` entry under `## [Unreleased]`: its heading names the page; its
  third part gets the words *over MCP*, the request that fails inside the window and the lines of an older version
  with the 14 days; a fourth part, *The journal page shows the
  lines that it counts*, says what a person sees (a row for a create, a delete and a folder change that ran; the two
  counts that were 0; *Secrets replaced* without the rotations that replaced nothing) and the table of the journal
  lines of §3.3. The sentence *No journal line is added or removed* stays, and the lines that change follow it.
- `research/module_extension.md`: T13 (`:7050-7052`); in the same paragraph, the rule of the mark (D2: the line that
  ends a request carries it, `minted` and the consent lines do not) and the three `rotated` words with `statement
  failed` and `no generator` (D3, D4). The sentence at `:1716-1717` (*the journal counts it as every prepare refusal*)
  gets the word of the line, `400`, and that the page counts it under no filter (F6).
- `research/module_tests.md`, the section of this plan (`:2449-2476` today): the rows J5 to J13, JG1, JG2, JG4, P1 to
  P4 and H3; the mutations M15 to M27; the point of *What none of this proves* about the count *Could not generate*
  (`:2468-2470`) goes, because J7 and J8 hold it now, and the new points of §6.5 come.
- `src_vs_code/README.md`: T7. `README.md`: no change (T8 stays).

## 8. What this plan does NOT do

- It adds no journal line (Q4). A listing and a request that is refused before a grant exists still write none.
- It does not show the lines `→ minted`, `→ ALLOWED` and `→ DENIED` on the page (F4), and it does not show a line that
  an older version wrote with no mark.
- It does not count a row whose outcome is a status number under *Refused* (F6, Q9).
- It does not give the mark to the line of a handler that threw (F10, Q10). The texts say that such a request can
  leave no row on the page.
- It does not make the page show the empty message of a filter; the page keeps `Nothing matches that filter.` (F8).
- It does not change an answer to the agent in S4: no status, code or body.
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
| [PLAN_agent_refusal_names_unlisted_entry.md](PLAN_agent_refusal_names_unlisted_entry.md) (F7, implemented) | rule A; N8, N9 and N2 of its §11 | this plan builds those three items and nothing more of F7. N1, N4, N5, N6, N3 and N7 stay there | written in this commit: its status block, its N2, N8 and N9, and its §12 point here |
| [PLAN_remote_bridge_scoped.md](../todo/PLAN_remote_bridge_scoped.md) | the wall's per-account suppliers (`visibleConfigOf`, its §4.2 *Listings are per account*) | none in behaviour: a bridge's lookup has one account (§2.1, CG3). No line of `bridgeScope.ts`, `bridgeWallSource.ts` or `mcpAccountVault.ts` changes | OWED, in its §8 *Boundaries*: that sentence. That plan is under change control (epoch 11), so its owner session writes the row |

The order: this plan needs no other plan, and no other plan needs this one. Method: `grep -l` over `todo/PLAN_*.md` for
`mcpEntries.ts`, `visibleConfig`, `config-snippet`, `whyUnusable`, `usableGate`, `linkedCall`, `agentUseActions.ts`,
`mcp-logs`, `mcpLogRows` and the five help files. These also matched and share no line, and get no row:
`PLAN_consent_coverage_per_door.md` (`worthRemembering` and the consent stamps of `mcpEntries.ts`);
`PLAN_terminal_runs_followups.md` and `PLAN_query_refuses_client_commands.md` (their boundary sentence names
`whyUnusable` as F7's; their own sites are `vpnOutcome` and the `query` action); `PLAN_ssh_line_runs_in_login_shell.md`
(the remote command of a linked run); `PLAN_creds_cli_reachable_from_every_caller.md` (the CLI). Seven open plans name
the five help files; none names the article `mcp-logs`. A branch that merges second re-reads line 137.

**For the sites of S4** (the re-review, on `aa70258c`): `grep -l` over `todo/PLAN_*.md` for `brokerMcpDoor`,
`brokerFolderDoor`, `brokerCall.ts`, `rotateAction`, `describeOutcome`, `mcpLogRows`, `mcpLogPage`, `isRotation` and
`agentAuditLog`. Three open plans matched. They share a file and no line with S4, and get no row:
`PLAN_consent_coverage_per_door.md` (other lines of `brokerMcpDoor.ts` and `brokerFolderDoor.ts`: the lookup, the
quiet line and the consent step; and `rotateAction.ts:102`; its code items are built);
`PLAN_grant_lifecycle_and_95_release.md` (the mint of `brokerMcpDoor.ts`; plan only); `PLAN_remote_bridge_scoped.md`
(the launch checks of `brokerCall.ts` before line 212, the admission of `brokerFolderDoor.ts`). The owed row of the bridge plan above gets one sentence more
for its owner session: S4 changes nothing on a bridge, because a bridge serves no create, delete, folder change or
rotation (`bridgeAllowList.ts:85-87`, `:94`). No open plan names the journal page.

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
8. **(S4) A second place can write a line that ends a request with no mark.** The rule of D2 is a rule for a person:
   a new handler that writes its own last line through `door.note` must give the mark. J5 to J7 and J9 hold the four
   handlers of today; no row finds a fifth. V5 writes the rule at the field.
9. **(S4) The word `statement failed` is new in the journal**, and R1 changes the word of one more line. A person who
   reads old and new files sees two words for the same case. §3.3 and the CHANGELOG entry say it.
10. **(S4) The lines of an older version.** For 14 days the page can show 0 for a create that an older version made.
    T1, T2 and T7 say it. The other way, (b) of D2, was weighed and not taken.
11. **(S4) The plan was wrong two times about the page.** Entry 1.1 and entry 1.2 each found a line that the page does
    not show, and this revision found a fourth site and three more facts (§1.5). The method of §1.5 read each
    `door.note` call, each call of the funnel `log` and each reader of `via`, and ran each kind of request. One more
    line that ends a request with no mark was found that way and is NOT built: the line of a handler that threw
    (F10, Q10). A writer that goes round the funnel was not looked for.
12. **(S4) R1 sends each status of a rotation to `describeRotation`, and a throw there changes the agent's answer.**
    The function is asked outside the broker's `try`. R3 guards the read of the body, J11 to J13 hold each answer that
    is not 200 with its whole body, and M27 shows the failure. A NEW answer shape of a statement action that R3 does
    not expect is held by J13 only for a body that is no object.
13. **(S4) Three things are more than the lead's decisions** (V4, R2 and the texts T3, T5, T10): Q7 and Q8 say what a
    *no* removes.

## 11. Definition of Done

The promotion ticked the boxes on 2026-11-27, from the record: the commits of #397, the rows and the mutations in
`research/module_tests.md`, the pull request body, the gates, and the greps that were run again on the tree of the
promotion. Two boxes are NOT ticked, because the record has no proof for them (§12, point 9). S1 to S3 did the first five
for their rows; S4 did each one again for its rows.

- [x] Rows C1 to C3, W1 to W3, H1 and H2 were watched failing by their assertions on the unchanged code, then pass; the
      summary quotes one failure message of each story and the pass. No RED proof is a compile error.
- [x] Rows J1 to J4 pass before and after, and mutations M9 to M11 and M14 each turned one of them red.
- [x] Guard rows CG1 to CG4 and WG1 to WG4 were watched passing before and after; the tests named *no edit* have no
      changed line.
- [x] Mutations M1 to M14 each turned its rows red and were restored.
- [x] In W1 to W3 the agent's answer is `linkedRunRefused('deploy')` with `denied`, byte-equal to the answer for a
      closed SSH entry.
- [x] (S4) Rows J5 to J13, P1 to P5 and H3, and H1 and H2 with their new words, were watched failing on the code of
      `aa70258c` by their assertions, then pass; the summary quotes the failure message of J5, J8, J10, J12 and P1 and
      the pass. For J5 to J10 the message names the journal, not the answer; for J11 to J13 it names the count
      `rotations`, not the answer and not the word.
- [x] (S4) P4 was watched red two times, as step 6 and step 7 of §5 say: on the code of `aa70258c` (the word of a
      statement that failed is `rotated`), and on the code after R1 to R3 and before L1 (the word is `statement
      failed`, and the old matcher counts it). The summary quotes the two messages.
- [x] (S4) Guards JG1, JG2 and JG4 were watched passing before and after; the tests of JG3 have no changed line.
- [x] (S4) Mutations M15 to M27, and M12 and M13 on the new words, each turned its rows red and were restored. For
      M27 the summary quotes the status that the agent read.
- [x] (S4) The answer to the agent is the same in J5 to J13 before and after: the status and the whole body, for
      each status of a rotation that is not 200 (400, 404 with and with no `noGenerator`, 409, 412, 429, 500, and 502
      with a body that is no object).
- [x] (S4) Through `mcpRowsIn`, a create that ran, a delete that ran, a folder change that ran and a create with no
      generator each give ONE row. A rotation with no generator counts 1 under *Could not generate*, 0 under *Secrets
      replaced* and 0 under *Refused*. No row of P3 fits two matchers.
- [x] `grep -rn "every list\|every refusal\|every ask\|everything an agent asked"` over `README.md`,
      `src_vs_code/README.md` and `src_vs_code/src` (tests apart) finds no line about the journal.
- [x] (S4) `grep -rn "one line per call\|One line per agent call\|Every secret an agent rotated\|holds no line yet\|No refusal is in the journal\|No secret has reached the vault\|Nothing was asked for that"`
      over `src_vs_code/src` (tests apart) and `research/module_extension.md` finds two lines only, which are not
      about what the journal holds: `aliasThrottle.ts:506` (a rate limit) and `research/module_extension.md:6154` (the
      log of the SSH agent).
- [x] `npm run typecheck`, `npm test`, `npm run lint` and `npm run ratchet` are green in `src_vs_code` at lowered
      priority, with a clean `tsc` read first. `npm run contract` leaves `contract/` unchanged. `src_mcp` and `src_cli`
      have no difference in their product code.
- [x] The documents of §7 are written, with the points of S4; the CHANGELOG entry and the pull request body carry §3.3.
- [ ] The owed row of §9 is with the session that owns the bridge plan; the summary says so.
- [x] `coai`: a `review_plan` round passed before the first test (epoch 1). The re-review: an Opus judge checked the
      marks of the record; the interim document round ran on the revised plan, or the summary says that it did not
      and that epoch 2 is `by nobody`. A `review_code` round ran on the finished branch with the revised plan; each
      finding has an accept or a reject with a reason; the summary has the verdicts and the number of reviewers that
      answered.
- [x] `node .agents/conventions/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; a change of this plan after an
      approval is an entry of its ledger; the summary names the epoch, the count of its entries and what was cut; the
      plan is promoted with its deviations.
- [ ] The summary names the models and the counts of the launches.
- [x] The lead and the owner have heard that a release must follow, and have the questions of §14.

**The merge conditions.** Epoch 1 named none apart from this Definition of Done and the code round of §5. They stay,
with the rows of S4 added. The family's rule for a merge holds as always: the checks of the pull request are present
and green. Nothing left the merge conditions, and the release is as §8 says: it must follow the merge.

## 12. Deviations — what shipped differently from this plan (promoted 2026-11-27)

1. **Three stories became four, and the plan stopped once.** The plan had S1 (N8), S2 (N9) and S3 (N2, the texts). Two
   changes were counted in epoch 1: 1.1 (J4 and M14 hold the journal LINE of a secret that could not be made, not the
   page's filter *Could not generate*; found by the coder of S3) and 1.2 (the create, delete and no-generator lines carry no
   `via`, so the journal page shows no row of a create or a delete and the texts of S3 were false on the page; found by the
   lead's Opus review of the built branch). The second change stopped the plan. Epoch 2 added S4, *the journal page shows
   the lines that it counts*. N2 therefore shipped as texts AND page marks, not as texts only: epoch 1 said that no journal
   line is added or removed; S4 changed the shape of three kinds of line (`via mcp` on four lines that end a request; a
   rotation that cannot draw its secret is `no generator`, not `404`; a rotation whose statement failed is
   `statement failed`, not `rotated`) and the CHANGELOG lists them. Q6 (the filter *Could not generate*, F5) was
   answered by the re-review: built, as V2, R1 and rows J7 and J8. No answer to an agent changed by a byte (rows J5 to J13
   compare the whole status and body).
2. **The re-review.** One consultation (`coai`, `d7510da7`, solved); the whole plan was revised; the interim document round
   on the revision ended `proceed` (2 of 2 reviewers; 4 findings, all 4 accepted); an Opus judge checked the table of the
   record and confirmed *Narrowed: no*. The judge changed the marks of one commit: `8515c1e9` has three rows, one *fits* and
   two *cut*; the cut words were corrected by a fix forward in S4, with no revert commit. Epoch 2 was approved `by
   reviewers` with 0 changes: the ledger has no entry in epoch 2. The epoch line was written `by nobody` before the round
   and changed to `by reviewers` after it passed. The ledger is left as it stood; the rule has no closing line for a
   current epoch.
3. **The gates, as run.** Plan round of epoch 1: `proceed`, 1 of 1 reviewers, 1 finding accepted (the second count of §2.3,
   row J4, mutation M14). Question consultants on Q3, Q4 and Q5 (Q1 was split and went to the owner). Code round of epoch 1:
   `proceed`, 4 of 4; 2 findings accepted, 3 rejected with reasons. Opus review of the built branch: *fix first*, which gave
   change 1.2 and the stop. Opus review of S4: *ship*, with 3 nits (point 6). Code round of epoch 2: `proceed`, 4 of 4; 2
   accepted, 2 rejected: an old failed-rotation line (`rotated`) in a file younger than 14 days still counts as a replaced
   secret, and the empty message of the page has no clause about a handler failure (F10 is not built). CodeRabbit on #397: 2 minor findings in the documents,
   fixed in `d773b186`.
4. **The owner's answers, 2026-11-27.** Q1: keep the N9 table (S2 as built). The owner gave the word for the pull request,
   the merge and the release. Q2 (a link to a folder reads *no longer in this vault*) and Q7 to Q10 (the mark of a folder
   change, the word `statement failed`, an error status under *Refused*, the line of a handler that threw) were not
   answered by the owner; the plan was built, merged and released on their default answers. §14 says what a *no* to each of them removes.
5. **Proof at the merge.** Full extension suite at S4: 8602 tests, 8558 pass, 0 fail, 44 skipped. `tsc`, `eslint`,
   `ratchet`, `contract`, `plan-lifecycle` and `public-hygiene` were clean; `contract/`, `src_mcp` and `src_cli` have no
   difference. Mutations M1 to M27 each turned their rows red (the record is in `research/module_tests.md`).
6. **Not done: the Opus nits.** N1: the sentence *Every call is recorded either way, in **⋯ → MCP logs**.* at
   `README.md:209` and `src_vs_code/README.md:810` still reads as if each call leaves a line; the journal holds what the
   texts of T1 say, and a listing leaves none. N2: the comment at `src_vs_code/src/mcpLogRows.ts:5` has no caveat that a
   request whose handler failed can leave no row (the longer comment below it names that line). The third nit (N3, a test
   helper named `stderr` that builds an error body) was fixed before the merge: it is `statementError` (`8b4cd617`).
7. **Not checked by a native reader:** the four translations (de, es, ru, uk) of the sentence of Appendix A. H1 pins the
   text; nobody measured how a native reader takes it. The texts of the plan stay as the five rows of Appendix A.
8. **Not built here** (by the plan's own decision, §13 and §14): Q4 (a refusal for an entry that the agent may view writes no
   journal line; a *yes* is its own plan), F6 (a row whose outcome is an error status is under *Everything* and under no
   count), F10 (the line of a handler that threw has no mark and no row; guard JG4 holds the fact), F1, F2, F3, F8 and F9
   (recorded only).
9. **Boxes of §11 not ticked.** (a) *The owed row of §9 is with the session that owns the bridge plan.* Checked at the
   promotion: `grep` over `todo/*.md` for the name of this plan finds only `todo/README.md`; the bridge plan
   (`todo/PLAN_remote_bridge_scoped.md`) has no sentence about it. The sentence stays owed to that plan's owner session. The
   bridge's lookup has one account, so nothing in behaviour changed there (CG3). (b) *The summary names the models and the
   counts of the launches.* The record read for this promotion has no such summary.
10. **Process notes.** The code was built in the plan's order, S1, S2, S3, then S4 after the stop; the `file:line` of §1.5 and
    §2.4 were read on `aa70258c`, the head of the branch at the stop. The pull request is #397 (30 files); the release
    1.24.1 carries this change only.

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
  (`mcpLogRows.ts:30-36`); the lines `→ minted`, `→ ALLOWED` and `→ DENIED` have no `via` (observed, and written at
  `brokerMcpDoor.ts:345-352` and `brokerConsent.ts:293-296`). The page shows the row that ends the call. The sentence
  of §2.3 is written for what the page shows. Kept so on purpose by D2 of §2.4.
- **F5. The filter *Could not generate* of the journal page never shows a real line (entry 1.1).** The create door
  notes `→ no generator` with no `via` (`brokerMcpDoor.ts:412-420`), so `mcpRowsIn` drops it (`mcpLogRows.ts:34`). A
  rotation that cannot draw a secret is noted with its status, `404`, because `describeOutcome` runs for a 200 only
  (`brokerCall.ts:304`). The journal FILE holds the create line (row J4). Found by the coder of S3. **Built now, by
  the re-review: V2 and R1 of §3.4, rows J7 and J8.**

There is no F7 in this list: F7 is the short name of the neighbour plan. F6 and F8 to F10 are from the re-review,
on `aa70258c`.

- **F6. An action that answers with an error status gets the status number as its journal word, and the page does not
  count it under *Refused*.** The broker writes `String(result.status)` for an answer that is not 200
  (`brokerCall.ts:304`), and `REFUSALS` holds the eleven codes and no number (`mcpLogRows.ts:73-85`). Observed: a
  rotation that the action refuses in its run is `rotate → 400`, and the agent reads `invalid_request`. An SSH action
  can answer 409 or 500 from its run in the same way (`test/sshUseActions.test.ts:530`, `:588` pin such answers). Before S4 such a rotation is counted under *Secrets replaced*;
  after L1 it is under no count, and it is a row of *Everything*. The comment of the page says that a rotation that
  an agent did not get is under *Refused* (`mcpLogPage.ts:126-129`); that is true for a refusal with a code. T4 says
  where such a row is. Not built (Q9).
- **F8. The page shows no empty message of a filter.** §1.5 has the facts. S4 makes the four sentences true (T6, T11)
  and does not make the page show them. Recorded.
- **F9. A rotation that failed after it wrote can have replaced a secret, and no count holds it.** A rotation that
  threw after its write is `rotate → internal`, and the agent is told `actionRan` (`brokerResponse.ts:212-222`); a
  rotation whose values could not be read again is `rotate → withheld` (`brokerResponse.ts:238-246`). The first is
  under *Refused*; the second is under no count after L1 (before L1 it was under *Secrets replaced*, by the same
  mistake that counted `404`). T10 says *each rotation that the journal records as done* for this reason. Recorded.
- **F10. The line of a handler that threw has no mark.** When a handler throws outside the broker's tail (the `make`
  of a create, the `remove` of a delete, the run of a folder change), the agent reads `500`, `internal`, and the
  journal gets `request → failed` with the route and no `via` (`unanswered`, `brokerRequests.ts:358-375`; called at
  `credsAgentServer.ts:703`). The page has no row for it (observed with a create whose `make` throws: the line is
  `request  (—) → failed  a handler failed: Error on POST /v1/mcp/create; headers not sent`). The handler does not
  know its door there; the route names it. The texts do not promise a row for it: T1 and T7 say that a request that
  fails inside the window can leave no row, T12 and T13 name this line as the one with no door, and guard JG4 holds
  the fact (finding 1 of the document round). It is the same kind of line as V1 to V4, for a failure and not for an action that ended. Not built (Q10).

## 14. Questions for the owner

The lead puts them to the question consultants first. The work does not wait: each question has the answer that this
plan is built on.

**The consultants, 2026-11-27** (two rows each, `coai` `consask`): Q5 — both A, *go on* (`00b66665`; the lead checked
the precedent: `findFolder` goes on past a node that is not an open folder, `mcpFolders.ts:141-145`). Q1 — split
(`7b5e3cd1`): one says leave the code, because WG3 and the Trash row of `test/agentSshGate.test.ts:313` already guard
the gate order and a table is a second place that decides the reason; the other says build the table. It stays the
owner's; S2 is built as its own commit, so a *no* removes it with a revert. Q3 — both *all 12 texts* (`18acb7fc`).
Q4 — both *no line here; B is its own plan* (`cdb56619`). Q2 was not asked: its answer changes nothing in this plan.

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
- **Q6 (F5). The filter *Could not generate* shows nothing, because its lines carry no `via`.** Fix it as its own small
  item (the create line gets `via` `mcp`; a rotation with no generator is noted as `no generator`)? *Built on: not here*
  — a new site and a new row would be a second change of this plan, and a second change stops it.
  **Answered by the re-review, 2026-11-27: it is built here.** The second change came (entry 1.2) and the plan
  stopped. V2 and R1 of §3.4 are the fix, and rows J7 and J8 hold it.

**The re-review, 2026-11-27.** Q1 is not answered by the owner; the plan stays built on yes. Q2 stays. The
consultation `d7510da7` and the lead's check gave the decisions D2 to D5 of §2.4. Four questions are new, for the
lead first and then for the owner. The answer to each one can change the plan, and each has the answer that this
revision is built on.

- **Q7 (V4). The line of a folder change that ran has no mark, as the three lines of entry 1.2.** The lead's decision
  named three sites; the folder door is a fourth (§1.5, observed). *Built on: it gets the mark.* A *no* removes V4,
  row J9 and mutation M18, and then T1 must say that a folder change that ran has no row, in five languages.
- **Q8 (R2). A rotation whose statement ran and failed is noted as `rotated` (§1.5, observed).** An exact list of the
  `rotated` words in `isRotation` does not help for it: the word is the same. *Built on: the line says `statement
  failed`.* A *no* removes R2, row J10 and mutation M21; then *Secrets replaced* counts such a rotation, and T10 cannot
  say *records as done* truthfully for it.
- **Q9 (F6). Should a row whose outcome is an error status (`400`, `409`, `500`) count under *Refused*?** *Built on:
  not here; T4 says that such a row is under Everything.* A *yes* is one more test in `isRefusal` (a number from 400
  to 599), one row and one mutation, and T4 then loses its last sentence.
- **Q10 (F10). Should the line of a handler that threw carry the mark when its route is an MCP route?** *Built on: not
  here.* A *yes* is one site (`brokerRequests.ts:371`, with the door taken from the route), one row and one mutation.
  Without it, a create or a delete whose handler threw has no row on the page, and the agent read `500`; T1 and T7
  say so. With a *yes*, guard JG4 and that sentence of T1 and T7 change in the same commit.

## Appendix A — the sentence of T1 in the five languages

UI labels stay English in each language (rule 7 of `.agents/PROJECT.md`); this sentence has none. A native reader can
polish a word before the merge; the clauses stay, and row H1 is changed with the text.

These are the sentences after S4. Each one is the sentence that S3 built (`help*.ts:137` on `aa70258c`), with three
changes and no other: the words for *over MCP* near its start, and two sentences at its end (§2.4, D5). The first
says that a request that fails inside the window can leave no row on the page (F10; finding 1 of the document
round). The second says that a create, a delete or a folder change of an older version is absent from the page while
its journal file is kept, with the 14 days of the sweep (finding 3).

| Language | `whatItIs` of `mcp-logs` |
|---|---|
| en | A journal of what AI agents did over MCP through this extension: each action that ran for an agent and how it ended, each one that you declined or did not answer, and two counts worth watching — secrets that came FROM an agent, and secrets that this window was asked to make and could not. It is not a record of every request. A listing leaves no line. A request that is refused before anybody is asked can leave none: for example an id that is not open to agents, a switch that is off, or a request that is not complete. A request that fails inside this window can leave no row on the page. A create, a delete or a folder change that ran under an older version of the extension is absent from the page while its journal file is kept; the files are swept after 14 days. |
| de | Ein Journal dessen, was KI-Agenten über MCP durch diese Erweiterung getan haben: jede Aktion, die für einen Agenten lief, und wie sie endete, jede, die Sie abgelehnt oder nicht beantwortet haben — und zwei Zahlen, die zu beobachten sich lohnt: Geheimnisse, die VON einem Agenten kamen, und Geheimnisse, die dieses Fenster erzeugen sollte und nicht erzeugen konnte. Es ist kein Protokoll jeder Anfrage. Eine Auflistung hinterlässt keine Zeile. Eine Anfrage, die abgelehnt wird, bevor jemand gefragt wird, kann ebenfalls keine hinterlassen: zum Beispiel eine ID, die für Agenten nicht geöffnet ist, ein Schalter, der aus ist, oder eine unvollständige Anfrage. Eine Anfrage, die innerhalb dieses Fensters fehlschlägt, kann auf der Seite keine Zeile hinterlassen. Ein Erstellen, ein Löschen oder eine Ordneränderung, die unter einer älteren Version der Erweiterung lief, fehlt auf der Seite, solange die zugehörige Journaldatei aufbewahrt wird; die Dateien werden nach 14 Tagen entfernt. |
| es | Un diario de lo que los agentes de IA hicieron por MCP a través de esta extensión: cada acción que se ejecutó para un agente y cómo terminó, cada una que usted rechazó o no respondió — y dos cuentas que conviene vigilar: secretos que vinieron DESDE un agente, y secretos que se pidió generar a esta ventana y no pudo. No es un registro de todas las peticiones. Un listado no deja ninguna línea. Una petición que se rechaza antes de preguntar a nadie puede no dejar ninguna: por ejemplo, un id que no está abierto a los agentes, un interruptor apagado o una petición incompleta. Una petición que falla dentro de esta ventana puede no dejar ninguna línea en la página. Una creación, un borrado o un cambio de carpeta que se ejecutó con una versión anterior de la extensión no aparece en la página mientras se conserva su archivo del diario; los archivos se eliminan a los 14 días. |
| ru | Журнал того, что ИИ-агенты сделали по MCP через расширение: каждое действие, выполненное для агента, и чем оно закончилось, каждое, которое вы отклонили или оставили без ответа, и два счётчика — секреты, пришедшие ОТ агента, и секреты, которые это окно попросили создать, а оно не смогло. Это не запись каждого запроса. Список не оставляет строки. Запрос, отклонённый до того, как кого-либо спросили, может не оставить строки: например, id, не открытый агентам, выключенный переключатель или неполный запрос. Запрос, завершившийся сбоем внутри этого окна, может не оставить строки на странице. Создание, удаление или изменение папки, выполненные в более старой версии расширения, отсутствуют на странице, пока хранится их файл журнала; файлы удаляются через 14 дней. |
| uk | Журнал того, що AI-агенти зробили через MCP у цьому розширенні: кожна дія, виконана для агента, і чим вона закінчилася, кожна, яку ви відхилили або залишили без відповіді, — і два лічильники, за якими варто стежити: секрети, що прийшли ВІД агента, і секрети, які це вікно попросили створити, а воно не змогло. Це не запис кожного запиту. Перелік не лишає рядка. Запит, відхилений до того, як когось запитали, може не лишити рядка: наприклад, id, не відкритий агентам, вимкнений перемикач або неповний запит. Запит, що завершився збоєм усередині цього вікна, може не лишити рядка на сторінці. Створення, видалення або зміна папки, виконані у старішій версії розширення, відсутні на сторінці, доки зберігається їхній файл журналу; файли видаляються через 14 днів. |

## Epics

One epic, because the three items are small and share one release. Its stories are here and not in a document of their
own: the lead asked for it for a plan of this size, and the family has done it before
([PLAN_query_refuses_client_commands.md](../todo/PLAN_query_refuses_client_commands.md), `## Epics`). The rows and the
mutations of §6 are the scenarios of each story. Fable wrote this plan and the split, because S1 is a judgement on
authorisation (what an agent may see). The question consultants were asked before the plan round of epoch 1 (§14).
Sonnet codes each story from its rows; Opus reviews each one; the security reading of S1 is Fable's, at review. One
epic gives a cornerstone quota of 1.

**The re-review (epoch 2).** The epic did not change: it is one epic with the same goal, and its third clause is now
held on the page too. One story is added, S4. So there is no new split, and the question consultants were not asked
again; the consultation of the re-review is `d7510da7`. The cornerstone ledger was counted again: S1 stays the one
cornerstone. S4 writes no rule of what an agent may see: it marks four lines, changes two words of the journal and
one matcher of a page, and no answer to an agent changes. Fable wrote the revision; Sonnet codes S4 from its rows and
Opus reviews it.

Cornerstones: 1 of 1 — S1

### E1 · Three small truths, on `fix/n8-n9-n2-small-truths`

- **Goal.** The config lookup answers alike for a hidden node and for a missing id, in each account. The journal
  reason of a linked run names the real cause for each state that the lookup refuses. No text says that the journal
  holds every request, and each text about the journal is true of the page that shows it: the page shows the lines
  that it counts.
- **Scope.** §2, §3.1, §3.4, §6, the documents of §7, the owed row of §9.
- **Depends on.** Nothing. F7 is merged and released (extension 1.21.1 and 1.21.3).
- **Done when.** §11 is ticked and the code round has run.
- **Pass criteria, each one a thing that can be counted.**
  1. In the 3 cases of C1 and in C3 the lookup gives the config of the second account; in C2 the 2 bodies are equal.
  2. In the 4 worlds of CG1 the answer is `undefined`; in CG3 the bridge's supplier read 0 nodes of another account.
  3. In W1 to W3 the journal has 1 note with the reason of §2.2, and the agent's answer has 0 changed bytes.
  4. J1: 0 lines for 3 list routes. J2: 0 lines for 6 refusals. J3: 3 rows with their 3 outcomes.
  5. H1 holds for 5 of 5 languages; H2 for the 5 texts of the journal page; H3 for the 4 texts of T10 and T11.
  6. Each of the 27 mutations turns at least 1 row red.
  7. `contract/`, `src_mcp` and `src_cli` have 0 differences. No interface gets a new member.
  8. (S4) J5, J6, J7 and J9: 1 row each, where `aa70258c` gives 0. J8: *Could not generate* 1, *Secrets replaced* 0,
     *Refused* 0. J10: *Secrets replaced* 0. J11 to J13: 8 answers of a rotation that are not 200, each with its
     status number as the word. In J5 to J13 the answer to the agent has 0 changed bytes.
  9. (S4) P1: 3 outcome words of 10 are a rotation. P3: 0 rows fit two matchers. P5: 0 of 3 bodies throw.
- **Cornerstone area.** The config lookup (S1): a mistake there gives an agent the config of a wrong account, or of a
  node that it may not view, in an answer that passes each other test.

**Stories.**

- **S1 · N8, the config lookup (the cornerstone; this document is its specification, by Fable). BUILT, `d12df88a`
  and `19b04992`.** Rows C1 to C3 RED first, with the failure messages kept. Then A1 and A2. Guards CG1 to CG4.
  Mutations M1 to M4. Complete on its own.
- **S2 · N9, the journal reason. BUILT, `fe2c4ddd` and `56610bf0`.** Rows W1 to W3 RED first. Then B1 to B3. Guards
  WG1 to WG4. Mutations M5 to M8. Complete on its own; it shares no line with S1.
- **S3 · N2, the texts, and the record. BUILT, `8515c1e9`; a code round ran on S1 to S3; the pull request moved to
  S4.** Rows J1 to J4 with mutations M9 to M11 and M14 on the unchanged code. Rows H1 and H2 RED. Then T1 to T9,
  mutations M12 and M13, the CHANGELOG entry and the two documents of `research/`. It follows S1 and S2, because the
  documents record them as built.
- **S4 · N2 on the page: the page shows the lines that it counts. NOT BUILT.** Steps 6 to 11 of §5. Rows J5 to J13
  and P1 to P5 RED first, with guards JG1 to JG4; then V1 to V5 and R1 to R3; P4 red a second time; then L1. Rows H1 and H2 with their
  new words and row H3 RED; then T1 to T7 and T10 to T13. Mutations M15 to M27, and M12 and M13 again. Then the
  points of S4 in the documents of §7, the closing checks, the code round with the revised plan and the pull request.
  It follows S3, because it corrects the texts of S3 and adds to its suite.
