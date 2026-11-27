# PLAN — The list answers name no node that the agent may not view: the dependencies, the folder, the command and the parent (N1, N4, N5, N6)

> Status: **IMPLEMENTED, 2026-11-27.** N1, N4, N5 and N6 (one epic, six stories S1 to S6) are built, merged and released
> in two artefacts. Merged as #401 (squash `57fa6288`). Extension 1.24.2: release PR #403 (`83a43f9d`), tag
> `extension-v1.24.2`; the `release.yml` run 46068886151 ended "Published remsoftdev.creds-for-devs v1.24.2"; the GitHub
> release holds the vsix. `creds-mcp` 0.11.1 (the words of the four tool descriptions): release PR #402 (`0dae1c9f`),
> tag `mcp-v0.11.1`, `release.yml` run 46073024214.
>
> success: six platforms with their sha256 files, the two Windows builds signed, the GitHub release not a draft
>
> Deviations: §12. Ledger at promotion: epoch 1 closed with entries 1.1 and 1.2 and the stop; epoch 2 approved by
> reviewers, 0 changes (left as it stood, append only). The owner's words on 2026-11-27: the four answers (hide or mask
> each field), «делай по плану» (the pull request over the cap, the merge, both releases, the promotion) and «идем по
> полному» (no split of N5). The consultants answered Q4 (fail closed) and the owner's «keep the text» answered Q3; the
> record read for this promotion holds no owner answer to the other questions of §14, so the plan shipped on their
> default answers. Proof: the extension suite ran 8657 tests, 8613 pass, 0 fail, 44 skipped; `itest:mcp` 141 checks;
> `CredsMcp.Tests` 174 pass, 3 skipped, 2 fail locally (the two `ParentWatchProcessTests`: `creds-mcp.exe` cannot start
> under WSL; CI is green). Not done, and open (§13, §12): F6, F8 and F9; the bridge drops a real in-scope dependency that
> is named exactly as the placeholder (fail closed, documented); a vault that changes during one listing (§6.5); the
> clause of the `creds_run` description about the run-time resolution; the boundary row owed to the Remote Bridge plan
> (§9); the translations, which no native reader checked. The body below was written before the build and is kept as
> it was: where it says that S6 is "not built", the sentence is the state at the re-review, and the `file:line` are those
> of `dbb2166d` and `599ef537`, not of the merge. Scope: unchanged from the status below.
>
> The status as it stood before the promotion, kept as it was written: **re-reviewed 2026-11-27: the plan stopped at entry 1.2 and was revised as a whole; epoch 2 is open.
> S1 to S6 are on the branch `fix/agent-list-fields-hidden` (PR #401, not merged, not released; S6:
> `ae0c559e`, `538c9e7b`, `d56a56eb`, and row KG7 `1c1fa834`). The Opus review of S6 said ship and the `coai` code
> round passed (`proceed`, 4 of 4).** What remains: the merge; the extension release and then the `mcp-v` release;
> the promotion. The round of the re-review ran on `43b12661` (the lead
> reported it: the interim document round, `proceed`, 2 of 2 reviewers, 2 findings, both accepted), and an Opus
> judge checked the table of the record; their points are in this text. The lead set the epoch line to `by reviewers`
> after the round passed.
>
> Scope: the extension (`src_vs_code/src`: `mcpEntries.ts`, `mcpFolders.ts`, `mcpAccess.ts` (one comment),
> `secretRef.ts`, `agentNaming.ts`, `extension.ts`, one filter of `bridgeScope.ts`, two new pure modules,
> `agentCommandText.ts` and `vaultRefLocator.ts`, the five `help*.ts` files, their tests), the tool descriptions of
> `creds-mcp` (`src_mcp/src`: `Tools.cs`, `FolderTools.cs`, `UseTools.cs`, their tests), the generated
> `contract/mcp-tools-v1.json`, one harness (`src_vs_code/scripts/creds-mcp-itest.cjs`),
> `src_vs_code/.size-baseline.json`, `src_vs_code/CHANGELOG.md`, `research/module_extension.md`,
> `research/module_tests.md`, `todo/README.md`. One epic, six stories (`## Epics`). Two artefacts change, and each
> has its own release: the extension (the values) and `creds-mcp` (the words that describe them). S6 changes the
> extension only.
>
> The owner answered the four questions of §2.6 of
> [PLAN_agent_refusal_names_unlisted_entry.md](PLAN_agent_refusal_names_unlisted_entry.md) (F7) on
> 2026-11-27. This plan builds the four answers. **Two commits are the base of the `file:line` here.** §1.1 to §1.6,
> §2.1 to §2.3, §2.5 to §2.8, §3.1 to §3.4, §6.1 to §6.9 and the rows and mutations of epoch 1 describe the code
> BEFORE the build and were read on `dbb2166d` (extension 1.24.1, `creds-mcp` 0.11.0). §1.7, §2.4, §3.5, §6.10, the
> mutations M20 to M30, F8 and F9 of §13 and the record below were read on `599ef537`, the head of the branch at the
> stop. The things that were observed with the compiled extension are in §1.6 (on `dbb2166d`) and §1.7 (on
> `599ef537`). Each prototype was run in a scratch copy, not in the repository. Five facts are not what F7 wrote
> (§1.5), and §14 has the questions for the owner. Fable wrote this plan, the split and this revision.
>
> **The plan round of epoch 1.** The `coai` plan round ran on `634f9aa7` on 2026-11-27 (session `7edf23d2`):
> `proceed`, 1 of 1 reviewers, 3 findings, and the lead accepted the 3 (`a6265576`): the bridge filter X1 with row
> BG3; row L1 first; the words about `folder` with row T4. The question consultants were asked on Q4 only
> (consultation `e3ac9aef`).
>
> **The re-review.** It had one consultation (`coai` cons `89487899`, the lead's; it gave the shape of the fix,
> way C of §2.4, and the lead and this revision each checked it against the code) and the revision of the whole
> plan (this commit). The revision found four facts that the consultation did not have: the same defect at a depth
> of two folders (row K2); way C costs about 11 times more for a token that names a folder unless the candidates
> are remembered for the listing (D9, measured, §1.7); no test of the branch goes red by way C (§6.8); and an
> agent's own `creds_run` resolves no reference today, so the question of a reference that is ambiguous at the run
> is the person's run (F8). The epics did not change, so there is no new split: one story is added.
>
> **The round of the re-review and the judge (in the commit after `43b12661`; no entry of the ledger).** The
> document round: mutation M7 is defined against the filter of site K1, and the gate of §11 about existing
> assertions names the checks that S6 changes. The judge: the marks of `ce023726`, `6d43a9ae`, `20d1be96` and
> `19ea5abd` in the record; a row three folders deep (KD1, mutation M30); the swap of M27; the lines of Q1; site K3
> keeps the two signatures that row RG7 reads; and ONE MORE ORACLE, which is older than S6: with two accounts that
> have one e-mail address, the first account decided a token (§1.7; site K5, rows KA1 to KA3, mutation M29).

## Plan changes

> Epoch 1 · approved 2026-11-27 · by reviewers · state: closed

- 1.1 · 2026-11-27 · reviewer · approach, dod — the list locates a `creds://` token among the entries that the agent may
  view, so a hidden entry with the same name as a visible one does not make the token ambiguous; R5 "mixed" flips and
  an E-pair holds it; the texts say that the placeholder also covers a broken or ambiguous reference
  (Found by the lead's Opus review of the built branch: `agentCommandText.ts:30` located over ALL entries (D5), so a hidden
  twin turned a kept reference into the placeholder, an oracle for a hidden name. The coai code round asked for the text.)
- 1.2 · 2026-11-27 · reviewer · approach, dod — a viewable entry under a folder that the agent may not view still counts
  as a match of a token, so two viewable `db` entries under `Open/Team` and `Closed/Team` make `…/Team/db/password`
  the placeholder, and the token is kept when the closed `Team` is not there: the placeholder tells the name of a
  folder that the agent may not view
  (Found by CodeRabbit on #401, `listFieldsHidden.test.ts:360`; D4 and D5 count each viewable entry and check the
  folders only after one match is found. This second change stopped the plan.)

### Re-review for epoch 2

Narrowed: no — the revision adds one story (S6: one filter, one memory for a listing, rows, mutations, five tighter checks, texts); nothing left the scope, the Definition of Done, the merge conditions or the two releases

| Work | Where | Verdict | Action |
|---|---|---|---|
| The draft of the plan and its todo row, `db49e45b` and `634f9aa7` | pushed, unmerged | fits | kept: the record of the plan |
| The findings of the plan round and the consultants' answer on Q4, `a6265576` | pushed, unmerged | fits | kept |
| The approval of epoch 1, the ledger and the pointers of F7, `37b82b48` | pushed, unmerged | fits | kept |
| Row L1 first, and the fixture's e-mail address, `a6ee45ac` | pushed, unmerged | fits | kept; S6 makes its scan wider (Q3 of §3.5): the whole body, not the fields of the rows |
| S1 (N1): A1, A2, the bridge filter X1, rows D1 to D5, E1, DG1, DG2, BG1 and BG3, `2d519981` | pushed, unmerged | fits | kept; S6 makes DG2 exact (Q4 of §3.5) |
| S2 (N4): B1 to B3, rows F1, F2, E2 and FG1 to FG3, `f042f3c5` | pushed, unmerged | fits | kept: the revision changes nothing of N4 |
| S3 (N5), the part that fits: the scan in any letter case (C1), the pure locator (C2), C3, C4 (the command is shown through `keepsReference`, a required member of `McpEntryContext`; `listedCommand`, `foldersOpen` and its walk in the module `agentCommandText.ts`), C5, the placeholder, rows R1 to R4, R6, R7, RG1 to RG6 and pairs (1) to (3) of E3, `ce023726` | pushed, unmerged | fits | kept |
| S3 (N5), the decision of a token: it located over ALL entries of the account (D5 of the first text), and row R5 held that for a hidden twin, `ce023726` | pushed, unmerged | cut | corrected already by a fix forward, `20d1be96` (entry 1.1); no revert commit |
| S3 (N5), the order of the conditions: `keepsReference` asks the folders that a token names AFTER `locateRef` found one entry, and the comments that name *the three conditions* (`agentCommandText.ts:14`, `:24-25`; `mcpEntries.ts:307`, `:310`), `ce023726` | pushed, unmerged | cut | the order of the conditions and the comment at `mcpEntries.ts:307`, `:310`: a fix forward in S6 (K1, K2, K4); no revert commit. The order originates here, not in `20d1be96` |
| S3 (N5), the account of a token: the list asks `locateRef`, which takes the FIRST account with the address (`secretRef.ts:158`), so an account with no viewable entry decides a token of the next account with the same address (§1.7), `ce023726` | pushed, unmerged | cut | a fix forward in S6 (K5); no revert commit |
| S4 (N6): D1, D2, rows P1 to P3, E4, PG1, PG2 and G1; the list check with no exception left, `84535ccc` | pushed, unmerged | fits | kept: the revision changes nothing of N6 |
| S5: the four tool descriptions, the regenerated contract file, the help in five languages, the harness check H1, rows T1 to T4, `f9f1edda` | pushed, unmerged | fits | kept: each sentence is true under the rule of epoch 2 (read again: Appendix A, Appendix B); S6 makes T3 and H1 tighter (Q1, Q2 and Q5 of §3.5) |
| The CHANGELOG entry and the two documents of `research/`, `6d43a9ae` | pushed, unmerged | fits | kept; its cells about the command were written again by `fdf56f28`, and the cut row of that commit carries them |
| The size baseline of `extension.ts`, `46086e25` | pushed, unmerged | fits | kept |
| Entry 1.1 in the plan, `05832bf3` | pushed, unmerged | fits | kept: the record of the change |
| Entry 1.1, the part that fits: the list locates among the entries that the agent may view, the index of a listing, row R5 flipped, pair (4) of E3, row RG7, `20d1be96` | pushed, unmerged | fits | kept: way C filters the same candidates once more |
| Entry 1.1 kept the order of `ce023726` (`agentCommandText.ts:29-32` as it stands) and wrote it into its comments: `agentCommandText.ts:26-27` and `:34`, `mcpEntries.ts:308-309`, `vaultRefLocator.ts:43-49`, `20d1be96` | pushed, unmerged | cut | a fix forward in S6 (K1, K2 and K4 of §3.5); no revert commit |
| Entry 1.1, the texts, the part that fits: the placeholder also stands for a missing, a broken and an ambiguous reference (the descriptions of `creds_list` and `creds_run`, row T1b, the CHANGELOG, `research/module_tests.md`), `fdf56f28` | pushed, unmerged | fits | kept |
| Entry 1.1, the texts, the sentence that states the order of the three conditions: `research/module_extension.md:6883`, and the words *a hidden folder that the token names* at `src_vs_code/CHANGELOG.md:19`, `fdf56f28` | pushed, unmerged | cut | a fix forward in S6 (the documents of §7): the sentences say the one rule of §2.4 |
| The index appends for each name, its key is the locator's own (`segmentKey`), and the dependencies ask the wall of the account, `19ea5abd` | pushed, unmerged | fits | kept: S6 filters the bucket that this index gives |
| The sentence *the answer is the one of the whole list* at `vaultRefLocator.ts:48`, `19ea5abd` | pushed, unmerged | cut | it stops being true after K1: a fix forward in S6 (K4 writes it again); no revert commit |
| Entry 1.2 and the stop, `599ef537` | pushed, unmerged | fits | kept: the record of the stop |
| The revision of the whole plan for epoch 2, `43b12661` | pushed, unmerged | fits | kept: the record of the re-review; the commit after it holds the points of its round and of the judge |

  (The reviser, Fable, wrote the first marks in `43b12661`. The rule gives the marks to an Opus judge. The judge read
  each row on 2026-11-27, confirmed that each site of S6 exists and that nothing is narrowed, and changed these marks:
  the row *fits* of `ce023726` kept `agentCommandText.ts` whole, so that commit now has four rows, one *fits* and three
  *cut* (the locator over all entries; the order of the conditions, which starts there; the first account with the
  address, which the judge found); the row of `6d43a9ae` no longer says that S6 corrects it; the cut row of `20d1be96`
  names each comment that says the order; `19ea5abd` has a second row for one sentence. The record has six *cut*
  rows, each a fix forward. Nothing is merged, so nothing is reverted on `main`. The consultation of the re-review is
  `coai` cons `89487899`.)
  (The epoch line below was written before the round of the re-review as `by nobody`. The round ran on `43b12661`:
  `proceed`, 2 of 2 reviewers; the lead set the line to `by reviewers`.)

> Epoch 2 · approved 2026-11-27 · by reviewers · state: open

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
extension suite was run on it (§6.8). (6) After the plan round the same prototype was asked three more things, with a
scratch script: the letter case of a reference, a shorter reference that leaves a hidden folder out (§2.4), and a
Remote Bridge whose scope holds an entry that is named exactly as the placeholder of `dependsOn` (§2.7). NOT done: a
run of the real `creds-mcp` binary; a run on Windows.

### 1.7 N5 after the build — two things that the reviews found (entries 1.1 and 1.2)

S3 built the rule of the first text: the locator was asked over ALL entries of the account, then the wall was asked
about the one entry that it found, then about the folders that the token names. Each of the two reviews found a way
in which a node that the agent may not view decided what a token reads.

**Entry 1.1 (built, `20d1be96`).** A HIDDEN entry with the name of a viewable one made a token to the viewable one
ambiguous, so the token read the placeholder; with no hidden twin it was kept. The list now gives the locator only
the entries that the agent may view (`viewableLocatorForOneListing`, `vaultRefLocator.ts:51-63`).

**Entry 1.2 (not built).** The folders are still asked AFTER the locator (`keepsReference`,
`agentCommandText.ts:29-32`). So a viewable entry under a folder that the agent may not view is a candidate for a
token that NAMES that folder, and the name of that folder decides if the token is ambiguous. Observed on
`599ef537`, with a scratch script that compares the complete body of `creds_list` (the account is `me@x.test`):

| The vault | The token | W1: the closed folder has the name | W2: it has another name | W3: it is not there |
|---|---|---|---|---|
| two viewable `db`: one in an open folder `Team`; one, with switches of its own, in a folder `Team` that has no switch | `Team/db` | the placeholder | kept | kept |
| the same | `TEAM/DB` | the placeholder | kept | kept |
| the same, two folders deep: `Mid/Inner/db` twice, one `Mid` open, one `Mid` closed by a person (`mcp: {}`), each `Inner` open | `Mid/Inner/db` | the placeholder | kept | kept |

The three bodies of a row are not equal. An agent that reads the placeholder for `Team/db`, and sees one `db` under
an open `Team` in its list, learns that a second folder with the name `Team` exists and that it may not view it.

**The cases that are right already on `599ef537`** (observed; they are the guards of §6.10): a token with one path
part (`db`) reads the placeholder in W1, W2 and W3, because the two entries are viewable; one viewable `db` under a
closed `Team` and the same entry with a parent id that points to nothing read alike (`db` kept, `Team/db` the
placeholder); a closed folder between two open ones and the same folder taken out read alike.

**The same prototype, with way C of §2.4.** The three bodies are equal in each row above, and `Team/db`, `TEAM/DB`
and `Mid/Inner/db` are kept in each world. The 221 tests of the seven suites that read the list are green with no
edit (§6.8).

**One more oracle, older than S6: two accounts with one e-mail address (found by the Opus judge of the re-review).**
Two signed-in accounts can have the same address: the same e-mail under two providers
(`backupManager.ts:141-142`). `locate` takes the FIRST account with the address (`secretRef.ts:158`), and a row of
the list carries no account. So the first account decides a token, also when the agent may view nothing in it.
Observed on `599ef537`, complete bodies; `a0` comes first, and `a1` holds a viewable `db` and the command:

| The first account `a0` (same address) | The token | On `599ef537` | With the prototype of S6 |
|---|---|---|---|
| holds only a HIDDEN `db`; holds no node; has the address in another letter case | `db` | the placeholder | kept |
| is not there | `db` | kept | kept |
| holds a viewable `db` too | `db` | kept (the `db` of `a0`) | the placeholder: two candidates that the agent may view |
| holds a viewable `db` in an open folder `Other`; the `db` of `a1` is in an open folder `Team` | `Team/db`; `db` | the placeholder; kept | kept; the placeholder |

The first two rows are an oracle: the token tells that an account with the same address stands before this one. S6
takes the candidates from EACH account with the address (site K5).
**What way C costs (measured on the prototype, one run each, a source whose `getNode` is a map lookup; not a
benchmark).** The vault has N entries with one name, each in a folder of its own, half of the folders open; ONE
command holds T tokens.

| N, T, the tokens | `599ef537` | way C, no memory | way C, the wall's answer for a folder remembered | way C, the candidates remembered (D9) |
|---|---|---|---|---|
| 2,000, 1,000, each names a folder | 124 ms | 1,339 ms | 746 ms | 100 ms |
| 8,000, 4,000, each names a folder | 1,466 ms | not run | 12,144 ms | 1,039 ms |
| 8,000, 4,000, one path part | 4,219 ms | not run | not run | 5,514 ms |
| the same as row 2, with the candidates of each account with the address (K5); the prototype builds that list again for each token | 1,466 ms | — | — | 1,918 ms (173 ms for 2,000 and 1,000) |

So the filter, asked again for each token, makes the worst case of a token that names a folder about 11 times
slower, and the plan does not build it that way (D9). The worst case of a token with one path part is not made
better or worse by this plan (F9). The last row says that D9 must hold the list of K5 itself (the candidates of the
address), not only the bucket of one account.

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
a reference; `parseSecretRef` (`:69-83`) reads one; `locateRef` finds the one entry that it names and gives no
reason when it finds none. `locateRef` was made for *a caller that must not see its messages*, and a Remote Bridge
uses it. This plan adds no parser.

**How the product reads a reference (read on `599ef537`).** The list uses these rules and adds none of its own.

| Part | The rule | Code |
|---|---|---|
| the scheme | any letter case for the parser: `CREDS://` is a reference. The scan of a RUN finds the lower-case scheme only; the scan of the list (`rewriteRefTokens`) finds each letter case | `secretRef.ts:71`; `:48`; `:101-109` |
| the account | the FIRST signed-in account whose e-mail address is the one of the token, with the letter case ignored. Two accounts can have one address | `locate`, `secretRef.ts:158`; `backupManager.ts:141-142` |
| each part of the path | percent-decoded, then trimmed; compared with the letter case ignored (`segmentKey`). The reference names the LAST parts of the path, so it can leave folders out | `:50-56`, `:74`, `:80`; `:133-146` |
| the field | one of seven words, in its exact letter case | `:25-33`, `:59-66` |
| the result | exactly one entry, or nothing. No account, no entry and more than one entry are all *nothing* for `locateRef` | `:190-208` |

**The rule. It is ONE rule since epoch 2; it takes the place of the three conditions, of D4 and of D5 of epoch 1.**
Each token that the scan of the list finds gets one decision, the same for each letter case of the scheme.

1. The parser reads the token. It gives an account, a path of `k` parts and a field. A token that the parser does
   not read becomes `HIDDEN_REFERENCE`.
2. **The candidates of the token** are the entries of EACH signed-in account that has the e-mail address of the
   token (the letter case ignored), for which each of these is true:
   - the agent may view the entry (`agentMayView`, in the entry's own account);
   - the entry's own name is the last part of the path, with the letter case ignored;
   - the `k - 1` folders directly above the entry exist, and the agent may view each of them (`isOpenFolder`). A
     token with one path part names no folder, so no folder is asked.
3. The product's locator (`locateRef`) gets the candidates and no other entry. It compares the parts of the path
   with the names. The token is KEPT, as the person typed it, when the locator finds exactly ONE candidate. In each
   other case it becomes `HIDDEN_REFERENCE`. The text between the tokens stays. The locator gets the candidates as
   ONE list, so that it counts over the accounts, and no first account wins.

**Why the rule is safe.** Each thing that decides a token is a thing that the agent may view: an entry of its list,
a folder of its list, and their names. A row of the list has no account, so the candidates are not sorted by
account: an account in which the agent may view nothing gives no candidate and decides nothing. A node that the
agent may not view is never a candidate and never a folder that a candidate is under by name. So it decides nothing: with that node there, with another name, or not there,
the token reads the same (rule A). The rows K1 to KG5 of §6.10 compare the complete bodies.

| The token | After | Seen on the prototype |
|---|---|---|
| names one entry that the agent may view, with no folder part or with open folders | kept, byte for byte | yes |
| differs from the stored names in letter case only (the scheme, the address, a path part), and there is one candidate | kept as typed: it is a clean match for the product's own locator | yes |
| names one entry that the agent may view by a shorter path that leaves out a folder that is not open | kept: it names no folder that is not open | yes |
| names an entry that the agent may not view (no switch, a PIN, the Trash), in any letter case | `HIDDEN_REFERENCE`: no candidate | yes |
| names an entry that the agent may view, and NAMES a folder above it that is not open | `HIDDEN_REFERENCE`: the entry is no candidate of that token | yes |
| names an account that is not signed in, or an entry that no account has | `HIDDEN_REFERENCE` | yes |
| two entries that the agent may view have the name, and the token names no folder, or names folders that are open for the two and have the same names | `HIDDEN_REFERENCE`: two candidates (the product refuses such a reference as ambiguous too) | yes |
| one entry that the agent may view has the name, and a HIDDEN entry has it too (entry 1.1) | kept: a hidden twin is no candidate | yes |
| two entries that the agent may view have the name; the token names a folder; that folder is open for one of them and not open for the other one (entry 1.2) | kept: the second entry is no candidate of that token, whatever the name of its folder is | yes |
| two accounts have the address; the agent may view one entry with the name, in the SECOND account | kept, as it is when the first account is not there | yes |
| two accounts have the address, and the agent may view an entry with the name in each of them | `HIDDEN_REFERENCE`: two candidates. On `599ef537` the token is kept; this value changes | yes |
| starts with the scheme and is not a reference for the parser: no field, a field that is not known, the field in another letter case (`Password`), a mark at the end that the scan takes in (`…/password.`) | `HIDDEN_REFERENCE` | yes |

- **D4. One rule, and it fails closed (D5 is a part of it since epoch 2).** A token is kept only when the product's
  own locator finds one entry among candidates that the agent may view whole: the entry and each folder that the
  token names. So a hidden entry, a missing entry, an ambiguous name and a broken token read alike (rule A), and a
  later change of the grammar cannot open a hole here. The record of how the rule came to this form:
  - *The first text* searched the whole account, so that a name that is ambiguous for the person stayed ambiguous
    for the agent. A hidden twin was then an oracle (entry 1.1).
  - *Entry 1.1* gave the locator the entries that the agent may view, and asked the folders after it. A folder that
    is not open was then an oracle for its own name (entry 1.2, §1.7).
  - *Epoch 2* asks the folders BEFORE the locator, as a part of what a candidate is. This is way C of the
    consultation of the re-review (`coai` cons `89487899`); this revision checked it against `samePath`, `locateRef`,
    `keepsReference`, `foldersOpen` and the index, and ran it (§1.7).
  - *The accounts.* The Opus judge of the re-review found that the first account with the address decided a
    token (§1.7). The candidates now come from each account with the address. `locateRef` takes one account and
    its entries (`secretRef.ts:158-162`), so the list gives it the candidates of all those accounts as the entries
    of one. Two accounts can hold the same id (`bridgeScope.ts:51-52`), so each candidate has an id of its own in
    that list, and the entry that the locator finds is read back with its own account.
  - *Two other ways were read and not chosen.* Way A compares only the part of a path that the agent may view. It
    takes a folder out of the middle of a path, so two folders that are not next to each other look as if they
    were: with `Outer/Hidden/Inner/db`, the token `Outer/Inner/db` would be kept when `Hidden` is closed and
    replaced when `Hidden` is not there (mutation M23). Way B drops each candidate that has a folder above it that
    is not open. A token with one path part would then read differently for a closed parent and for a parent id
    that points to nothing (mutation M22), and the shorter reference of limit (c) would not stay.
  - *The limits of the question consultants on Q4 hold* (consultation `e3ac9aef`: fail closed, with three limits):
    (a) a reference that differs from the stored names in letter case only, and that has one candidate, is a clean
    match and stays as typed; (b) the scan of the list reads the scheme in any letter case and decides alike; (c) a
    shorter reference that names one visible entry and leaves a hidden folder out stays, because a folder that the
    token does not name is not asked.
- **D5. (A part of D4 since epoch 2.)** The list locates among the candidates of D4. The run keeps its own locator:
  the first account with the address, and each entry of it. The run is not touched (F8). `scopedRefSource` (`bridgeScope.ts`) is the bridge's own and does
  not change.
- **D6. The scan reads the scheme in any letter case.** `parseSecretRef` reads `CREDS://` as a reference, and
  `REF_PATTERN` does not find it. So a run does not resolve such a token: it stays text for the run. The list must
  not show it when it names a hidden thing (R7), and keeps it as typed when it is a clean match (RG6). The scan of
  a run does not change.
- **D7. A kept reference keeps the account's e-mail address.** The owner said: keep the text. The address is the
  account of an entry that the agent may view (Q3).
- **D8. Where the locator's data comes from (built).** The window built one `RefSource` over its storage in
  `extension.ts`. Its two members that hold no secret, `accounts` and `entities`, are now `vaultRefLocator`
  (`vaultRefLocator.ts:18-31`), a pure module; `extension.ts` calls it, and the list calls it with its own
  `McpVaultSource`. So the list and the run read the same paths, by the same case rules.
  `McpVaultSource.getAccounts` gives `{ accountId; email? }`; the real storage gives the address already
  (`StoredAccount`, `types.ts:10-14`), and a source with no address keeps no reference.
- **D9. The candidates are found once for a listing, for each name and each number of named folders.** The index of
  entry 1.1 holds, for a listing, the viewable entries of an account by their own name (`indexByName`,
  `vaultRefLocator.ts:66-75`). Way C asks `k - 1` folders for each entry of that bucket. Asked again for each
  token, that is about 11 times the time of today for a vault with many entries of one name (§1.7). So the filtered
  list of candidates is held for the listing, by the address, the key of the name (`segmentKey`) and `k - 1`. A token with one
  path part takes the bucket as it is and reads no node. The memory lives as long as the index does: one listing.
  The cache of the list is forgotten on each change of the vault (`mcpEntriesCache.ts`), and a build that a change
  overtakes is not stored.

The command of an agent's run does not change. The window runs the stored text by the entry's id, not the listed
text.

### 2.5 N6 — the parent's id only when the agent may view the parent

The owner: *the id only when the agent may view the parent; otherwise `null`*.

`parent` is `node.parentId` when that id points to a node and `isOpenFolder` is true for it. In each other case it is
`null`. The rows of §1.4: rows 1, 2 and 3 become `null`; rows 4 and 5 do not change.

`null` is the value of a folder at the root today, and the type is `string | null` already (`mcpFolders.ts:33-34`).
After this plan `null` means: the agent may not view the parent (or the id points to no node), or the folder is at the
root; a folder under a closed folder under an open one gets `null` too (row P2). The tool description says so (W2).

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
| `command` | `HIDDEN_REFERENCE` in the place of a token that names the hidden node; a token that names only things that the agent may view is kept, whatever hidden node has the same name or is above a second entry (D4) | the same value for each token (D4) | yes: since entry 1.1 for a hidden twin, and after S6 for a folder that is not open (§1.7; not on `599ef537`) |
| `parent` | `null` | `null` (today: the id) | yes |

The rows E1 to E4 of §6 compare the two whole list bodies in each case. The time of the two cases is the same class
and is not measured (F7 §2.4 has the residue).

### 2.7 A Remote Bridge: one filter changes, so that a bridge never serves the placeholder

A bridge builds its row from the local row, field by field (`narrowed`, `bridgeScope.ts:144-155`).

| Field on a bridge | Today | After |
|---|---|---|
| `folder` | `''` (`:146`) | the same |
| `hasCommand` | `row.command !== undefined` (`:149`) | the same: a replaced text is not blank, so the boolean does not change. A bridge gives a boolean and no text, as before |
| `dependsOn` | the names that are also names of rows in scope (`:152`, `:162-166`) | the same names, and never `HIDDEN_DEPENDENCY` (X1, below) |
| the folders | `[]` (`:211`) | the same |

**The defect that N1 would make on a bridge (finding 1 of the plan round).** The filter of `dependsOn` is by NAME:
a name of the local row is kept when a row in scope has that name. After N1 the local row can hold the placeholder.
When a person names an entry in scope exactly as `HIDDEN_DEPENDENCY`, the placeholder passes the filter, for a
hidden dependency and for a missing one. The bridge then shows a dependency that its scoped list leaves out. Observed
on the prototype: with such an entry in scope, the bridge served `dependsOn: ["(a dependency that is not open to
agents)"]` for a row that depends on one entry with no switch and on one id that no node has.

**The fix, in this plan (X1).** The placeholder is not the identity of a dependency. `narrowed` drops it before it
filters: a name is kept when it is not `HIDDEN_DEPENDENCY` AND a row in scope has that name. So a bridge never serves
the placeholder, and a hidden dependency, a missing one and no dependency give the same served row.

Two other ways were read and not chosen. To filter by ID, the local row must carry the ids of its dependencies; the
row has names only (`McpEntry.dependsOn`, `mcpEntries.ts:59-60`), so that is a new field of a shipped answer or a
second list beside it, and the re-review for epoch 6 of the plan of the bridge rejected a change of the name filter.
To make the placeholder a value that no name can have, the product would need a rule for names; it has none.

Three cases stay at the edge, and they are said here:

1. A hidden dependency that has the same name as a row in scope is listed by a bridge today. After N1 the local row
   holds the placeholder and not that name, so the bridge lists nothing for it. Less is served.
2. A REAL dependency in scope whose name is exactly `HIDDEN_DEPENDENCY` is listed by a bridge today. After X1 the
   bridge does not list it. Less is served, for a name that nobody has a reason to choose; the direction is safe.
3. On the LOCAL list an entry that the agent may view and that has that name reads like the placeholder. The local
   agent may view that entry, so nothing hidden is told.

X1 is the one edit of `bridgeScope.ts`. It needs one import of `agentNaming.ts`, which imports nothing, so the walk
of `test/bridgeBoundary.test.ts:188-209` (no `vscode` behind `bridgeScope`) stays green. That file is the wall of
[PLAN_remote_bridge_scoped.md](../todo/PLAN_remote_bridge_scoped.md); §9 has the row that is owed to that plan.

### 2.8 The two placeholders

One constant each, in English, in `agentNaming.ts`, the module that holds the fixed sentence of rule B and imports
nothing (`agentNaming.ts:10-13`):

| Constant | The words |
|---|---|
| `HIDDEN_DEPENDENCY` | `(a dependency that is not open to agents)` |
| `HIDDEN_REFERENCE` | `(a creds reference that is not open to agents)` |

- The words are the owner's example for N1, in round brackets. A name of an entry has no such form by habit, so an
  agent does not read the placeholder as a name. The brackets do not make it impossible, so a Remote Bridge drops the
  placeholder by its value (X1, §2.7).
- Each one is true for a hidden node and for a missing one.
- `HIDDEN_REFERENCE` does not hold `creds://`. `REF_PATTERN` does not match it, so a second pass over a changed text
  changes nothing (row RG4).
- Each one explains itself. An agent that talks through an older `creds-mcp` reads the placeholder and no new
  description (§3.4).

## 3. The sites

### 3.1 Sites that change (S1 to S5: built)

The table is the plan of epoch 1, with the lines of `dbb2166d`. It is built. Three things were built in another
place than the table says: the three conditions of a token are in a module of their own, `agentCommandText.ts`
(the table allowed it, below); the pure locator of C2 is `vaultRefLocator.ts`; and entry 1.1 added
`viewableLocatorForOneListing` there and `segmentKey` in `secretRef.ts`. The sites of S6 are in §3.5.

| # | Story | Site | Today | After |
|---|---|---|---|---|
| P1 | S1 | `agentNaming.ts` (new exports) | — | `HIDDEN_DEPENDENCY` and `HIDDEN_REFERENCE` of §2.8 |
| A1 | S1 | `mcpEntries.ts:527-532`, `dependencyNames` | the name of each node that exists | the names of the dependencies that are `shown`; `HIDDEN_DEPENDENCY` once at the end when one id or more is not (§2.2) |
| X1 | S1 | `bridgeScope.ts:152`, in `narrowed`; one import; the comment at `:143` | `row.dependsOn.filter((name) => kept.has(name))` | a name is kept when it is not `HIDDEN_DEPENDENCY` and `kept` has it (§2.7); the comment says that the placeholder of the local row is never served |
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
| D2 | S4 | the comment at `mcpFolders.ts:33-34` | *`null` at the root* | *`null` when the agent may not view the parent (or the id points to no node), and at the root* |
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
| `bridgeScope.ts` (each line but the filter of X1), `bridgeWallSource.ts:24`, `mcpAccountVault.ts` | §2.7. The wall lists through `visibleMcpEntries` with one account, so a reference to another account is not kept there; the bridge makes a boolean of the text |
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

On a Remote Bridge no documented value changes. The bridge gets one edit so that this stays true (X1), and §2.7 has
the three cases at its edge.

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

### 3.5 The sites of S6 (not built; the lines are those of `599ef537`)

| # | Site | On `599ef537` | After S6 |
|---|---|---|---|
| K1 | `agentCommandText.ts:45-47`, `candidatesOf`; its call at `:41` | gives `locateRef` each viewable entry of the account whose own name is the last part of the path | gives it the CANDIDATES of §2.4: those entries whose `k - 1` folders above exist and are each `isOpenFolder` (`foldersOpen`, `:50-54`, with no change of its body). For `k = 1` the bucket as it is, and no node is read |
| K2 | `agentCommandText.ts:29-32`, `keepsReference` | one entry found, then `mayViewEntry`, then `foldersOpen` | the check of the folders after the locator goes: it is in K1, in ONE place. The check of the entry after the locator stays as it is, as the second lock that it is since entry 1.1 (M6 is run with M10) |
| K3 | `vaultRefLocator.ts:36-63`, `ListingLocator` and `viewableLocatorForOneListing` | `candidates(accountId, lastName)`: the bucket of a name | `viewableLocatorForOneListing(locator, mayView)` and `candidates(accountId, lastName)` keep their signatures and their answers, so row RG7 has no edit. What S6 needs comes in as a NEW member of `ListingLocator`, or as an optional parameter: the candidates of §2.4, held for the listing by the address, `segmentKey(lastName)` and `k - 1` (D9). The module stays pure and takes the wall as a function, as it takes `mayView` today |
| K5 | `agentCommandText.ts:40-47`, `locatedBy` and `candidatesOf`; `secretRef.ts:158` is read and not changed in what it does | `locateRef` picks the first account with the address and gets the bucket of THAT account | the candidates of each account with the address go to `locateRef` as ONE list, as the entries of one account; each has an id of its own in that list; the entry that the locator finds is read back with its own account, and the second lock (`mayViewEntry`) asks in that account. The comparison of the address is the locator's own (if the list needs it by name, it gets a name in `secretRef.ts`, as `segmentKey` did in `19ea5abd`, with no change of what `locate` answers) |
| K4 | the comments at `agentCommandText.ts:14-28` and `:34`, `vaultRefLocator.ts:42-50`, `mcpEntries.ts:307-311` | *the three conditions*; *a folder that is named and is not open* as a check after the match | say the one rule of §2.4: what a candidate is, and that the locator sees candidates only |
| Q1 | `scripts/creds-mcp-itest.cjs:949-975` (review point 1) | `entries.find(…)` on what `JSON.parse` gave. When `creds_list` answers an OBJECT (its failure shape, `{ error, hint }`: `NoWindow` and `ToolFailure`, `src_mcp/src/Tools.cs:228-237`), `find` is not a function and the scenario THROWS in place of a failed check | the check of the shape stays (`:956`); the rows `e-1` and `e-2` are searched in an array of their own that is empty when the answer is not an array, so each later check fails with its own sentence |
| Q2 | `scripts/creds-mcp-itest.cjs:974` (review point 2) | H1 reads the LAST element of `dependsOn` only | H1 compares the whole array with `['office vpn', HIDDEN_DEPENDENCY]` (the stub's value, `:223`): the name is kept, the order is kept, nothing is added |
| Q3 | `test/agentNamesOnlyViewable.test.ts:310-346`, `listOf`, `rowLeaks` and row L1 (review point 3) | L1 reads the VALUES of the fields of the rows of `entries` and of `folders` | L1 searches the raw text of the two WHOLE response bodies for each hidden name and id: each key, each value, and each thing beside the two arrays. The two arrays are used apart, for the four exact values of `FIELDS` (`:332-337`) |
| Q4 | `test/listFieldsHidden.test.ts:151-157`, row DG2 (review point 4) | asserts that the name of the other account's entry is NOT in `dependsOn` | asserts `dependsOn` exactly: `[HIDDEN_DEPENDENCY]` |
| Q5 | `test/listFieldsHidden.test.ts:639-650`, row T3 (review point 5) | `usage.includes(sentence + '\n')`, over the whole text | finds the bullet of the tool by its name (`- creds_list —`, `- creds_folders —`) and asserts that THIS bullet ends with the sentence of that tool |

Each of the five review points was read against the code and is kept; none is dropped. Point 6 of the review (the
status of the plan must say what is built) is this revision's status block and the todo row.

The sites K1 to K5 are SITES. The rows of §6.10 that have the names K1 and K2 are ROWS; the text says *site* or *row*
where the two could be mixed up.

No interface of the product gets a new member but `ListingLocator` (K3). `McpVaultSource`, `McpEntryContext`,
`BridgeWallSource` and the broker hooks do not change. `agentCommandText.ts` is 73 lines and `vaultRefLocator.ts`
is 75. No tool description, no help sentence and no line of `src_mcp` changes in S6: each of their sentences is true
under the rule of epoch 2 (Appendix A and Appendix B were read again).

## 4. Growth surfaces

None is created: no table, folder, cache, process or journal line. The list cache holds the same number of rows. The
index of a listing (entry 1.1) and the candidates that D9 holds live for ONE build of the list and are dropped with
it. Their size is at most one reference to each viewable entry for each number of named folders that the commands
of the vault use.

## 5. Build order

One epic, six stories, on `fix/agent-list-fields-hidden` (from `main` at `dbb2166d`), in a worktree of its own.

**Done in epoch 1 (the record; each step is on the branch).**

1. The `coai` plan round on `634f9aa7` passed; its 3 findings are in the text (`a6265576`); the ledger opened
   (`37b82b48`).
2. Row L1 first, before S1: written with no exception, watched failing on the unchanged code, then committed green
   with the open exceptions (`a6ee45ac`).
3. S1 (N1), with row BG3 and the bridge filter X1 (`2d519981`).
4. S2 (N4) (`f042f3c5`).
5. S3 (N5) (`ce023726`).
6. S4 (N6), and L1 with no exception left (`84535ccc`).
7. S5: the words, the contract file, the help, the harness (`f9f1edda`); the documents (`6d43a9ae`); the size
   baseline (`46086e25`).
8. The reviews of the built branch: the lead's Opus review gave entry 1.1 (`05832bf3`, `20d1be96`, `fdf56f28`); the
   `coai` code round gave `19ea5abd`; CodeRabbit on #401 gave entry 1.2 and the stop (`599ef537`).

**What remains (epoch 2).**

9. **The round of the re-review (done, but for the epoch line).** The plan round of this branch had passed, so the
   rule gives the interim path (`.agents/conventions/common/plan-change-control.md`, *Reviewing the revised plan*):
   `review_document` on this file ran on `43b12661`. The lead reported `proceed`, 2 of 2 reviewers, 2 findings, both
   accepted. An Opus judge checked the table of the record. Their points are in the commit after `43b12661`. The
   lead writes who approved epoch 2.
10. **S6, the candidates.** Rows K1, K2, KD1 and KA1 to KA3 first, in a new suite: each is watched FAILING by its assertion on
    `599ef537`, and the coder keeps the message (§1.7 has what the scratch script saw). Guards KG1 to KG5 are watched
    passing on `599ef537`. Then the sites K1 to K5 of §3.5. The six RED rows pass. Guard KG6 (the count of the node reads). The rows
    of epoch 1 that are named *no edit* in §6.10 stay green with no changed line. Mutations M20 to M25, M29 and M30,
    and M7 as §6.7 defines it now.
11. **S6, the five tighter checks.** Q4 (DG2), Q5 (T3) and Q3 (L1), each with its mutation (M26 to M28); Q1 and Q2
    in the harness, each watched once as §6.10 says.
12. **S6, the documents** of §7.
13. `npm run typecheck`, `npm test`, `npm run lint` and `npm run ratchet` in `src_vs_code`, at lowered priority, with
    the exit of `tsc` read first. `npm run contract` leaves no difference in `contract/`. `npm run itest:mcp` is
    green with H1 as Q1 and Q2 leave it. `src_mcp` has no difference to `599ef537`.
14. The `coai` code round on the finished branch: `review_code` with this revised plan as `planText` and
    `again: true`, with the Opus code review at the same time. Then the pull request #401 is brought up to date;
    its body has §3.3, §3.4, the verdicts and the number of reviewers that answered.
15. After the merge: the extension release first, then the `mcp-v` release (§3.4). The lead and the owner decide
    when.

One file of the suite runs through the same runner: `npm run compile`, then
`node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`.

## 6. Test plan

Each RED row is a test of behaviour: it builds a vault, calls the product's own list function or the real read route,
and asserts the value that comes back. No row of S1 to S4 reads a source file. Each RED row has a mutation of §6.7
that turns it red. Row L1 is the first test that is written, before S1 (§5, step 2). §6.1 to §6.9 are the test plan
of epoch 1 and are built; §6.10 is the test plan of S6. The rows of S5 are content rows: a tool description and a help sentence have no other behaviour.

### 6.1 The worlds

- **The new suite**, `src_vs_code/src/test/listFieldsHidden.test.ts`. `test/mcpEntries.test.ts` is 764 lines, so the
  rows do not go there. Each row builds its own small vault with the helpers of the suite (a folder, an entry, a
  source with one account or two, each account with an e-mail address).
- **The class test**, `test/agentNamesOnlyViewable.test.ts`, over `test/unlistedWorld.ts`. The fixture has the four
  cases already (`unlistedWorld.ts:72-77`, `:84-85`, `:109-111`). Its source gets an e-mail address for the account
  (`:116`), and `N5_COMMAND` (`:88-89`) names that address in place of the account id. With the address, the
  locator FINDS the hidden entry and the wall refuses it; without it, the token would be replaced only because no
  account is found. Row L1 is written and watched failing before S1 (§5, step 2).
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

The account has the e-mail address `me@x.test`. `V` is an entry that the agent may view; `H` is one with no switch;
`V2` has switches of its own in a folder `HF` that has no switch.

| # | Kind | The command holds | Today (observed) | After |
|---|---|---|---|---|
| R1 | RED | `creds://me@x.test/H/password` | as typed | `HIDDEN_REFERENCE` in its place; the text before and after it stays |
| R2 | RED | a reference to an entry with a PIN; to an entry in the Trash | as typed | `HIDDEN_REFERENCE` |
| R3 | RED | `creds://me@x.test/HF/V2/password` | as typed | `HIDDEN_REFERENCE` (the folder is named) |
| R4 | RED | a reference to an account that is not there; to a name that no entry has | as typed | `HIDDEN_REFERENCE` |
| R5 | RED | a name that two entries that the agent may view have; and, flipped by change 1.1, a name that one entry that the agent may view and one hidden entry have | as typed | `HIDDEN_REFERENCE` for the two viewable entries (the locator finds no ONE entry); the token KEPT as typed for the viewable one with a hidden twin |
| R6 | RED | tokens that the parser does not read: `creds://me@x.test/V` (no field); `…/V/salary` (a field that is not known); `…/V/Password` (the field in another letter case); `…/V/password.` (a mark at the end) | as typed | `HIDDEN_REFERENCE`, also when the entry is one that the agent may view |
| R7 | RED | `CREDS://me@x.test/H/password`; `Creds://ME@X.TEST/h/password` | as typed | `HIDDEN_REFERENCE`: the scan reads the scheme in any letter case, and the decision is the one of R1 |
| E3 | RED | three pairs. (1) R1; the same command with `H` taken out of the vault. (2) R3; the same with `HF` taken out, so that the `parentId` of `V2` points to nothing. (3) the reference of RG5 in the same two worlds as (2). (4) change 1.1: a reference to a viewable entry that has a hidden twin of the same name; the same with the twin taken out | (1) and (2): the bodies are equal today too, and hold the hidden name | in each pair the two bodies are deep-equal; in (1) and (2) the name of `H` and of `HF` is in neither; in (3) and (4) the reference is kept in the two, and the two bodies of (4) are deep-equal (RED on the code of the first build: the placeholder with the twin, the token without) |
| RG1 | guard | `creds://me@x.test/V/password`; `creds://me@x.test/<an open folder>/V/password` | as typed | the same, byte for byte |
| RG2 | guard | a reference to an entry of a SECOND account that the agent may view there | as typed | the same: the wall is asked in the account that the reference names |
| RG3 | guard | a command with no token (`tmux {name}`); a blank command | the text; no `command` key | the same (the test at `test/mcpEntries.test.ts:290` stays green with one added member, §6.8) |
| RG4 | guard | the answer of R1, given to the same function a second time | — | the same text: `HIDDEN_REFERENCE` is not a token (§2.8) |
| RG5 | guard | `creds://me@x.test/V2/password`: the shorter reference, which leaves `HF` out and names one entry | as typed | the same, byte for byte (limit (c) of D4) |
| RG6 | guard | a clean match in another letter case: `creds://ME@X.TEST/v/totp`; `CREDS://me@x.test/V/password`; a path part with `%20` for a name with a space, in upper case | as typed | the same, byte for byte, in the letter case that the person typed (limits (a) and (b) of D4) |

E3 is RED by its second assertion in pairs (1) and (2); pair (3) is a guard inside it. A source with no e-mail address
keeps no reference; the rows RG1, RG5 and RG6 fail then, so the suite cannot pass with a locator that finds nothing.

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
| L1 | RED, written and watched failing BEFORE S1 (§5, step 2); run again after S4 | the class test, through the real read routes of the real broker: the bodies of `GET /v1/mcp/entries` and `GET /v1/mcp/folders` over `unlistedWorld.ts` | the bodies hold the name of the hidden dependency, the name of the hidden folder, the reference with the hidden name, and the id of the hidden parent (`agentNamesOnlyViewable.test.ts:336-339`) | no hidden NAME and no hidden ID is in the two bodies, with no exception. The four rows hold the new values: `[HIDDEN_DEPENDENCY]`, `''`, `HIDDEN_REFERENCE`, `null`. The list `EXCEPTIONS` (`:312-317`) is removed |
| LG1 | guard | completeness 4 of the same file (`:360-369`): a node that the agent MAY view is named | green | green, with no change of a line |

### 6.6 S5 — the words, the bridge and the binary

| # | Kind | What | Today | After |
|---|---|---|---|---|
| T1 | RED, content | in a TypeScript test: the description of `creds_vpn_up` in `contract/mcp-tools-v1.json` holds the value of `HIDDEN_DEPENDENCY`; the description of `creds_run` and of `creds_list` holds the value of `HIDDEN_REFERENCE` | the words are not there | they are there. The row joins the constant of the extension and the text of the binary through the generated file |
| T2 | RED, content | in `src_mcp/tests/ToolsTests.cs`, beside `:112-113` and `:249-251`: `Tools.ListDescription` holds the sentence about `folder`; `FolderTools.ListDescription` holds the sentence about a `null` parent | not there | there |
| T3 | RED, content | for each language of `HELP_LANGUAGES`: `usage` of `bodyFor(helpArticle('agent-surface'), language)` holds the two sentences of Appendix A, and `fallback` is false | not there | there |
| T4 | RED, content | in the TypeScript test of T1, beside guard FG2 of §6.3 (the fact): the description of `creds_list` in `contract/mcp-tools-v1.json` holds the clause of Appendix B about the folder that gave the entry its access switches, with the words that it can be a folder above the entry's own | not there | there |
| H1 | guard | the harness (`creds-mcp-itest.cjs`), the real binary over a stub window: a row with `folder: ''`, `dependsOn` ending with the placeholder and a `command` with the placeholder; a folder with `parent: null` | not checked | the four values cross the binary as they are: `folder` is the empty string, `parent` is `null` and the key is present |
| H2 | check, watched | `node scripts/emit-mcp-tools.mjs --check` after W1 to W4 are built and before W5 | it passes on the unchanged code | it fails and names the command that rebuilds the file; after W5 it passes |
| BG1 | guard | on a Remote Bridge, a row in scope that depends on a hidden entry and on an id that no node has, has switches of its own in a closed folder, and holds a reference to a hidden entry | `dependsOn` has no name of it; `folder` is `''`; `hasCommand` is `true`; the folders are `[]` | the same, and the served body holds neither placeholder |
| BG3 | RED between A1 and X1 (§5, step 3) | through the wall's own view (`doorView`), as RS5 does (`test/bridgeReadShape.test.ts:246-262`), over the rows that `visibleMcpEntries` gives for a small vault. The scope holds an entry that is NAMED exactly `HIDDEN_DEPENDENCY`, and a row. Three worlds: (a) the row depends on an entry with no switch; (b) on an id that no node has; (c) on the entry with that name itself | on the unchanged code: (a) and (b) `[]`, (c) the name. With A1 and no X1 (observed on the prototype): (a) and (b) `[HIDDEN_DEPENDENCY]` | `[]` in the three worlds; the served body of (a) and of (b) is deep-equal to the served body when the row has no dependency; no served body holds `HIDDEN_DEPENDENCY` as a value of `dependsOn` |
| BG2 | guard, no edit | `test/bridgeReadShape.test.ts`: RS1, RS2 (`:117-130`, the filter by name for a dependency out of scope), RS4, RS5, RS6; `test/bridgeScope.test.ts`; `test/bridgeScopeWalk.test.ts` | green | green, with no change of a line |
| G1 | guard | a vault in which the agent may view each node: the two list bodies | a literal that the coder takes from the unchanged code | equal to that literal: no other field changes |

### 6.7 Mutation checks (each one alone, restored after; each must turn its rows red)

| # | The mutation | Turns red |
|---|---|---|
| M1 | in A1, name each dependency that exists (take `shown` out) | D1, D2, D3, D4, E1, L1 |
| M2 | in A1, drop an id that no node has | D5, E1 |
| M3 | in A1, one placeholder for each hidden dependency, in its place | D4 |
| M4 | in B2, give the name with no test of the folder | F1, F2, E2, L1 |
| M5 | in B2, test the entry's parent in place of `resolved.folder` and give the parent's name | FG2 |
| M6 | in C4, keep each token that `locateRef` finds (take the test of the entry out; change 1.1: with the filter of D5 the test is a second line of defence, so M6 is run together with M10) | R1, R2, L1 |
| M7 | epoch 1: in C4, take the test of the named folders out (it was a check after the locator). Since S6 the test is the filter of site K1, before the locator, so M7 is: in site K1, give the locator the bucket of the name with NO filter, and ask no folder after it | R3 must fail (the token that names a folder that is not open, for one viewable entry, is kept); row K1 fails too |
| M8 | in C4, replace only a token that is found and hidden; keep the others | R4, R5, R6, and pair (2) of E3 |
| M9 | in C1, scan with the letter case of `REF_PATTERN` (the lower-case scheme only) | R7 |
| M10 | in C4, locate over ALL entries of the account again (take the filter by `agentMayView` out; change 1.1) | R5, pair (4) of E3 |
| M11 | in D1, give `node.parentId ?? null` | P1, P2, P3, E4, L1 |
| M12 | in D1, test only that the parent exists | P1, P2 |
| M13 | in W4, put the old description back and regenerate | T1 |
| M14 | put the old `usage` back in ONE language (each of the five in turn) | T3, for that language |
| M15 | in `narrowed` (`bridgeScope.ts:152`), take the whole filter out | BG1, BG3 |
| M16 | in X1, take the test of the placeholder out and keep the filter by name | BG3, worlds (a), (b) and (c) |
| M17 | in C4, ask `isOpenFolder` of each folder above the entry up to the root, not only of the folders that the token names | RG5, and pair (3) of E3 |
| M18 | in C1, change the token to lower case before the decision and write that back | RG6 (the kept text is not the typed text) |
| M19 | in W1, take the clause about the folder that gave the switches out and regenerate | T4 |

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

**S6 (epoch 2).** No existing test goes red by the product change of S6 (observed on the prototype, §6.10). S6
changes these existing checks on purpose, and no other one: row DG2 (Q4), row T3 (Q5), the scan of row L1 (Q3), and
in the harness the check H1 of `dependsOn` (Q2) and the way the scenario of `creds_list` reads its rows (Q1).
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
- For the command, the rows of epoch 1 do not prove that a folder that the agent may not view decides nothing. They
  did not have two viewable entries with one name under two folders with one name (entry 1.2). §6.10 has those rows.

### 6.10 S6 — the candidates of a token, and the five tighter checks (epoch 2; not built)

A new suite, `src_vs_code/src/test/listReferenceCandidates.test.ts`, with small helpers of its own:
`test/listFieldsHidden.test.ts` is 675 lines. Each row builds two or three vaults that differ in ONE thing that the
agent may not view, calls `visibleMcpEntries`, and compares the COMPLETE bodies of the list with `deepEqual`. The
account is `me@x.test`; each token is `creds://me@x.test/<the path>/password`.

**The three worlds of a row.** W1: the node that the agent may not view is there. W2: the same node has another
name. W3: the node is taken out, so that a `parentId` points to nothing.

| # | Kind | The vault | The tokens | On `599ef537` (observed) | After S6 |
|---|---|---|---|---|---|
| K1 | RED | two viewable `db`: one in an OPEN folder `Team`; one, with switches of its own, in a folder `Team` that has no switch. W2 gives the closed folder another name; W3 takes it out | `Team/db`; `TEAM/DB` | W1: the placeholder twice. W2 and W3: kept twice. The bodies differ | kept as typed in the three worlds; the three bodies are deep-equal |
| K2 | RED | two folders deep: a viewable `db` in `Inner` in an open `Mid`; a second viewable `db` in a second `Inner` (switches of its own) in a `Mid` that a person closed (`mcp: {}`). W2 gives the closed `Mid` another name; W3 takes it out | `Mid/Inner/db` | W1: the placeholder. W2 and W3: kept. The bodies differ | kept in the three worlds; the three bodies are deep-equal |
| KG1 | guard | the three worlds of K1 | `db` | the placeholder in the three: the two entries are viewable, and a token with one part asks no folder | the same; deep-equal |
| KG2 | guard | ONE viewable `db` with switches of its own. W1: its parent is a folder `Team` with no switch. W3: its parent id points to nothing | `db`; `Team/db` | `db` kept in both; `Team/db` the placeholder in both | the same; deep-equal |
| KG3 | guard | one viewable `db` in `Inner` (open, switches of its own) in `Hidden` in `Outer` (open). W1: `Hidden` is closed (`mcp: {}`). W3: `Hidden` is taken out | `Inner/db`; `Outer/Inner/db`; `Hidden/Inner/db`; `Outer/Hidden/Inner/db` | the first kept, the three others the placeholder, in both | the same; deep-equal; the word `Hidden` is in neither body |
| KG4 | guard | two viewable `db`, each directly in a different OPEN folder with the name `Team` | `Team/db`; `db` | the placeholder twice | the same: two candidates that the agent may view whole are ambiguous |
| KG5 | guard | the three worlds of K2 | `Inner/db`; `db` | the placeholder twice in the three (each `Inner` is open) | the same; deep-equal |
| KD1 | RED | three folders deep: a viewable `db` in `Inner` in `Mid` in an open `Top`; a second viewable `db` in a second `Inner` in a second `Mid` (switches of its own) in a `Top` that a person closed (`mcp: {}`). W2 gives the closed `Top` another name; W3 takes it out | `Top/Mid/Inner/db`; `Mid/Inner/db` | the first token: W1 the placeholder, W2 and W3 kept. The second: the placeholder in the three. The bodies differ | the first kept in the three, the second the placeholder in the three (two candidates with open folders); deep-equal |
| KA1 | RED | two accounts with ONE address; the second holds a viewable `db` and the command. W1: the first account holds only a hidden `db`. W1b: it holds no node. W1c: its address is in another letter case. W1d: it holds a hidden entry with the SAME ID as the viewable one. W3: the first account is not there | `db` | the placeholder in W1, W1b, W1c and W1d; kept in W3. The bodies differ | kept in each world; the bodies are deep-equal |
| KA2 | RED | two accounts with one address; EACH holds a viewable `db` | `db` | kept (the `db` of the first account) | the placeholder: two candidates that the agent may view, in a list with no account |
| KA3 | RED | two accounts with one address; the first holds a viewable `db` in an open folder `Other`, the second a viewable `db` in an open folder `Team` | `Team/db`; `db` | the placeholder; kept | kept (one candidate, in the second account); the placeholder |
| KG6 | guard, new behaviour | ten viewable `db` in ten open folders; the source counts its `getNode` calls. Listing A: the command holds ONE token `X1/db`. Listing B: it holds fifty tokens `X1/db` to `X50/db`. No folder has such a name | — (K1 is not built) | the two listings read the SAME number of nodes, and each token reads the placeholder: the candidates of an address, a name and a number of named folders are found once for a listing (D9) |

**The rows of epoch 1 that S6 must not change, with no edit of a line:** R1 to R7, E3 with its four pairs, RG1 to
RG7 (RG2: a second account with ANOTHER address), BG1 and the four values of L1. Observed on the prototype of way C,
with the accounts of K5: the 221 tests of
`listFieldsHidden.test.ts`, `agentNamesOnlyViewable.test.ts`, `mcpEntries.test.ts`, `bridgeReadShape.test.ts`,
`bridgeScope.test.ts`, `secretRef.test.ts` and `bridgeReferences.test.ts` pass. Row R3 (a token that names a folder
that is not open, for one viewable entry) keeps its value: the entry is no candidate of that token.

**The five tighter checks.** They change an assertion and no product line.

| # | The check | What it holds after S6 | How it is shown to have teeth |
|---|---|---|---|
| Q4 | DG2 | `dependsOn` of the row is exactly `[HIDDEN_DEPENDENCY]` when the id is not in the entry's own account and a second account holds it as a viewable entry | mutation M26 |
| Q5 | T3 | for each of the five languages: the bullet of `creds_list` ends with sentence 1 of Appendix A, and the bullet of `creds_folders` ends with sentence 2 | mutation M27 |
| Q3 | L1 | no hidden name and no hidden id is anywhere in the raw text of the two response bodies; the four fields hold the four values | mutation M28 |
| Q2 | H1 | `dependsOn` of `e-2` after the real binary is exactly `['office vpn', HIDDEN_DEPENDENCY]` | no product mutation can reach it: the window of the harness is a stub. Watched once: with the two values of the stub in the other order, H1 fails; the stub is restored |
| Q1 | the harness scenario of `creds_list` | an answer that is not an array gives failed checks with their sentences, and no exception | watched once: with the stub window not started, `creds_list` answers its failure object (`NoWindow`, `Tools.cs:228-237`), the scenario reports its checks as failed, and the run goes on to the next scenario |

**The mutations of epoch 2** (each one alone, restored after; each must turn its rows red).

| # | The mutation | Turns red |
|---|---|---|
| M20 | take the filter of K1 out and ask the folders after the locator again (the order of `20d1be96`) | K1, K2 |
| M21 | in K1, ask only the ONE folder directly above the entry, for any number of named folders | K2 |
| M22 | way B: drop each candidate that has a folder above it that is not open, also for a token with one path part | KG1 and KG2 (a closed parent and a missing one read differently), RG5 |
| M23 | way A: take the folders that are not open out of the path of a candidate before the locator compares it | KG3 (`Outer/Inner/db` is kept with `Hidden` closed and replaced with `Hidden` taken out) |
| M24 | when more than one candidate is left, keep the token | KG4, KG1, KG5, R5 |
| M25 | take the memory of D9 out, so that the bucket is filtered again for each token | KG6 |
| M26 | in A1, drop an id that the entry's account does not hold (M2 again) | DG2 as Q4 leaves it (and D5 and E1, as before) |
| M27 | in ONE language, SWAP the two sentences of Appendix A: sentence 2 ends the bullet of `creds_list`, and sentence 1 ends the bullet of `creds_folders` | T3 as Q5 leaves it, for that language. The `includes` of epoch 1 stays green, because each sentence still ends a bullet; a sentence that is only moved would make the epoch 1 check red too, and would show nothing |
| M28 | in the read route of `/v1/mcp/entries`, add a key beside `entries` that holds the name of a hidden node | L1 as Q3 leaves it (the scan of epoch 1 stays green) |
| M29 | in site K5, take the candidates of the FIRST account with the address only | KA1, KA2, KA3 |
| M30 | in site K1, ask at most TWO folders above the entry (`min(k - 1, 2)`) | KD1 (K1 and K2 stay green: they name one and two folders) |

**What these rows do not prove.** The time: KG6 counts node reads for one shape, and §1.7 has one run of a scratch
script. A path of more than three named folders: KD1 is the deepest row, and a walk that stops at three is not
caught. More than two accounts with one address. A vault that changes while a listing is built. The real binary for K1 and K2: they are rows of the list
function, and H1 carries a placeholder through the binary. A folder that is hidden because it is in the Trash is
covered by the wall (`isOpenFolder`) and has no row of its own here.

## 7. Documents

- `src_vs_code/CHANGELOG.md`, under `## [Unreleased]`: a `### Changed — security` entry with the table of §3.3, the
  two placeholders, what a Remote Bridge serves and the three cases at its edge (§2.7), and §3.4 (a window of an older extension, and `creds-mcp`
  before its own release).
- `research/module_extension.md`: the paragraph *A lookup and a refusal name only what the agent may view*
  (`:6852-6875` today) loses the sentence about the four fields that are not covered (`:6871-6875`) and gets the
  rule of §2.1 for the list answers, with the three functions that decide it and the table of §2.6; the bridge
  paragraph (`:3913` today) gets one clause: the filter of `dependsOn` drops the placeholder of the local row before it
  filters by name (X1). No diagram shows a list
  field, so none is drawn again.
- `research/module_tests.md`: the row of the list check (`:2356` today) becomes row L1; the suite
  `listFieldsHidden.test.ts` gets its rows, with §6.9 as its *what it does not prove*; the harness check H1.
- **S6.** `src_vs_code/CHANGELOG.md:19`, in the entry under `## [Unreleased]`: the cell of `command` says the one
  rule (a token is kept when it names exactly one entry that the agent may view, by folders that the agent may view,
  counted over each account with the address; a folder that is not open, an entry under it, and an account in which
  the agent may view nothing decide nothing). `research/module_extension.md:6883`: the same
  cell, with what a candidate is, that the folders are asked BEFORE the locator and why (entry 1.2), and D9.
  `research/module_tests.md` (`:2346` today): the rows of §6.10 (K1, K2, KD1, KA1 to KA3, KG1 to KG6), the five tighter checks, the record of M20 to M30 and of
  M7 in its form of S6,
  and the last paragraph of §6.10 as *what it does not prove*. No sentence of a tool description or of the help
  changes.
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
  ([PLAN_remote_bridge_scoped.md](../todo/PLAN_remote_bridge_scoped.md), §8 *Boundaries*).
- It does not change what a Remote Bridge serves, but for the edge cases of §2.7, and it edits one expression of
  `bridgeScope.ts` (X1). The filter of `dependsOn` stays a filter by name (F2).
- It does not change the product code of `creds` (`src_cli`) or the records of `creds-mcp`.
- It does not make the time of a hidden node and of a missing id equal by a measure.
- It does not change the locator of a RUN. The person's run resolves a reference in the first account with the
  address, over the whole of that account. So a token that the list keeps can be ambiguous or not found at the run,
  and a token that the run resolves can read the placeholder in the list (F8).
- It does not make the worst case of many entries with one name and many tokens with one path part faster (F9).
- It does not change what a cut token leaves behind as text (F6).
- It does not release. Two releases must follow the merge, in the order of §3.4.

## 9. Neighbour plans

| Plan | Touches | This plan's part | The row that the neighbour gets |
|---|---|---|---|
| [PLAN_agent_refusal_names_unlisted_entry.md](PLAN_agent_refusal_names_unlisted_entry.md) (F7, implemented) | rule A and rule B; N1, N4, N5 and N6 of its §2.6 and §11 | this plan builds the owner's four answers and nothing more of F7. N3 and N7 stay there | WRITTEN with the commit that opens the ledger: its status block, its §2.6, its §11 and its §12 point to this plan |
| [PLAN_remote_bridge_scoped.md](../todo/PLAN_remote_bridge_scoped.md) | the wall's rows (`narrowed`, its §4.2); its §8 says that the LOCAL list's `connectionString` and `command` go to *a new todo, E4 writes it* | this plan takes the `command` half of that row: a reference to a thing that the agent may not view. It edits ONE expression of `bridgeScope.ts`, the filter of `dependsOn` in `narrowed` (`:152`, X1), and adds one import there. It adds row BG3 to `bridgeReadShape.test.ts`, and changes one control and the accounts of the world in two test files of that plan (`bridgeReadShape.test.ts`, `bridgeWallWorld.ts`, §6.8) | OWED, in its §8 *Boundaries* (the table that its line 998 and line 1004 are rows of), as one new row: (1) the `command` half of the row *The local MCP door's listing serves `connectionString` … and `command`* is this plan's, and `connectionString` stays there; (2) the local row can hold two fixed placeholders, and `narrowed` drops the placeholder of `dependsOn` before it filters by name, so the sentence of its §4.2, *`dependsOn` (names in the scope only)*, stays true; (3) this is a new fact for the row *reviewed and rejected by the re-review for epoch 6* (`dependsOn` filtered by name): the filter by name stays, and one fixed value is never a name for it. That plan is under change control (epoch 11) and belongs to another session, so its owner session writes the row; this plan does not edit that file |
| [PLAN_creds_cli_reachable_from_every_caller.md](../todo/PLAN_creds_cli_reachable_from_every_caller.md) | `src_mcp/src/Tools.cs:36` (another description), `Program.cs`, `creds-mcp-itest.cjs`; a `mcp-v` release of its own | none in behaviour. The two plans edit other constants of `Tools.cs`, and each one regenerates `contract/mcp-tools-v1.json` | under its story B2: the second one to merge regenerates the contract file again and reads the first one's descriptions |
| [PLAN_consent_coverage_per_door.md](../todo/PLAN_consent_coverage_per_door.md) | the consent stamps in `mcpEntries.ts` (`worthRemembering`, `:584-586` today) | none. Disjoint lines of the same file | no row: no shared function |

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
   not change. RG1, RG5 and RG6 keep the good cases.
4. **The refactor of C2 is in `extension.ts`**, which no unit test loads. The bodies move with no change, and
   `tsc` checks the types. The alternative copies eight lines and can drift (Q5).
5. **`parent: null` reads as the root.** An agent that draws the tree puts such a folder at the top. W2 says what
   `null` means.
6. **An entry named as a placeholder.** On a bridge it is closed by X1 (row BG3, mutation M16). On the local list
   such an entry reads like the placeholder (§2.7, case 3); the agent may view that entry.
   **And X1 is an edit of a file of another plan.** It is one expression. If the session of the bridge plan says no
   to it, N1 cannot ship as written: the placeholder would cross a bridge.
7. **Two releases.** Between them an agent reads the new values with the old words (§3.4).
8. **A text that the sweep of §1.6 missed.** The method is a `grep` for the field names. A sentence that describes
   a field in other words is not found.
9. **Size.** On `599ef537`: `mcpEntries.ts` is 635 lines, `test/agentNamesOnlyViewable.test.ts` 649,
   `test/listFieldsHidden.test.ts` 675. S6 puts its rows in a suite of its own, so each stays under 800.
10. **The command rule was wrong two times.** Each time a review found a node that the agent may not view that
    decided a token (entries 1.1 and 1.2). The rule of epoch 2 is stated by what MAY decide (candidates that the
    agent may view whole), and no longer by a list of what must not. The rows compare complete bodies in three
    worlds, at one and at two folders deep. A third way can still exist; the code round and the Fable reading of S6
    look for it.
11. **The time of way C.** Without D9 the worst case of a token that names a folder is about 11 times slower
    (§1.7). KG6 holds D9 by a count, not by a clock.
12. **A token that the list keeps can fail at the person's run** as ambiguous, when a hidden entry has the same
    name (F8). The list then shows a reference that the person's own run refuses. This is so since entry 1.1.
13. **A value changes for two accounts with one address** (row KA2): a token that is kept on `599ef537` reads the
    placeholder when each of the two accounts holds a viewable entry with the name. The run still resolves it, in
    the first account. The direction is safe, and the case needs the same e-mail under two providers (Q11).

## 11. Definition of Done

- [x] Row L1 was written with no exception and watched failing by its assertion on the unchanged code BEFORE S1; the
      summary quotes that message. It was run again after S4 and passes.
- [x] Each RED row of §6.2 to §6.5 was watched failing by its assertion on the unchanged code, then passes; the
      summary quotes one failure message of each story and the pass. No RED proof is a compile error.
- [ ] Row BG3 was watched failing with A1 built and X1 not built, then passes.
- [x] Rows E1 to E4: the two bodies of each pair are deep-equal.
- [x] Row L1, after S4: the two list bodies of the class test hold 0 hidden names and 0 hidden ids, and `EXCEPTIONS`
      is gone.
- [ ] Each guard row was watched passing before and after; the tests named *no edit* have no changed line.
- [x] Mutations M1 to M19 each turned its rows red and were restored.
- [ ] The four existing tests of §6.8 changed as that table says, and no other existing assertion changed in S1 to
      S5. In S6 exactly the checks that §6.8 names for S6 change (DG2, T3, the scan of L1, H1 and the harness
      scenario of `creds_list`: Q1 to Q5 of §3.5), and no other existing assertion changes.
- [x] `npm run typecheck`, `npm test`, `npm run lint` and `npm run ratchet` are green in `src_vs_code` at lowered
      priority, with a clean `tsc` read first. `npm run contract` leaves `contract/broker-v1.json` unchanged.
      `npm run contract:mcp` changed four descriptions in `contract/mcp-tools-v1.json` and nothing more.
- [x] The solution builds with 0 warnings; the test executable of `creds-mcp` is green; `npm run itest:mcp` is
      green with H1. `src_cli` and `McpJsonContext.cs` have no difference.
- [x] `bridgeScope.ts` differs in the filter of `narrowed`, one import and one comment, and in nothing more (X1).
- [x] The pointers of F7 (§9) are written.
- [x] The documents of §7 are written; the CHANGELOG entry and the pull request body carry §3.3 and §3.4.
- [ ] The owed row of §9 is with the session that owns the bridge plan, and that session has heard of X1 before the
      merge; the summary says so.
- [x] `coai`: a `review_plan` round passed before the first test; a `review_code` round ran on the finished branch;
      each finding has an accept or a reject with a reason; the summary has the verdicts and the number of
      reviewers that answered.
- [x] `node .agents/conventions/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; a change of this plan after its
      approval is an entry of its ledger; the plan is promoted with its deviations.
- [ ] The summary names the models and the counts of the launches.
- [ ] The lead and the owner have heard that two releases must follow, in the order of §3.4, and have the questions
      of §14.

**The state of the boxes at the re-review.** The boxes above are the Definition of Done of S1 to S5. They are not
ticked one by one here: the record of what ran is in the commits of §5 and in `research/module_tests.md`, and the
lead ticks them at the merge. The boxes below are S6.

**The state of the boxes at the promotion (2026-11-27).** Each box that is ticked was read against the record: the pull
request body of #401 (the proof, the gates and the follow-ups), `research/module_tests.md`, the merged diff of
`57fa6288` and, for S6, the diff from `599ef537` to it. Two checks were run again for the promotion:
`git diff 599ef537 57fa6288` over `src_mcp`, `contract`, the five `help*.ts` files and `bridgeScope.ts` is empty, and row
RG7 has no changed line there; the merged diff of `bridgeScope.ts` is one import, one comment and the one filter of X1.
A box that asks for a quoted failure message is ticked on the record that the row was watched failing; the messages
themselves were in the summaries of the sessions and are not in this repository. Six boxes of S1 to S5 stay open, each for
a reason that §12 item 8 gives: BG3 in its order, the guard rows and the "no edit" tests, the four existing tests of §6.8,
the owed row of §9, the summary of the models, and the questions of §14.

- [x] The round of the re-review ran on this text; an Opus judge checked the table of the record; the epoch line says
      who approved; the summary says so, or says that the revision was NOT reviewed.
- [x] Rows K1, K2, KD1 and KA1 to KA3 were watched failing by their assertions on `599ef537`, then pass; the summary
      quotes one failure message and the pass. In K1, K2, KD1 and KA1 the complete bodies of the worlds are
      deep-equal.
- [x] Guards KG1 to KG5 were watched passing on `599ef537` and after; KG6 passes; the rows of epoch 1 that §6.10
      names have no changed line and are green.
- [x] Mutations M20 to M30, and M7 as it is defined since S6, each turned its rows red and were restored.
- [x] The five tighter checks Q1 to Q5 are built; Q1 and Q2 were watched once as §6.10 says.
- [x] `agentCommandText.ts` asks the folders of a token in ONE place, before the locator, and takes the candidates
      from each account with the address. `viewableLocatorForOneListing(locator, mayView)` and `candidates(accountId,
      lastName)` have the signatures of `599ef537`, and row RG7 has no changed line. `src_mcp`, `contract/`,
      the five `help*.ts` files and `bridgeScope.ts` have no difference to `599ef537`.
- [x] The documents of S6 (§7) are written.
- [x] The `coai` code round ran again on the finished branch with this revised plan; each finding has an accept or a
      reject with a reason.
- [x] `node .agents/conventions/tools/plan-lifecycle.mjs` is clean; the summary names the epoch (2), the count of its
      changes and what was cut (the six *cut* rows of the record, each a fix forward).

## 12. Deviations — what shipped differently from this plan (promoted 2026-11-27)

1. **Five stories became six, and the plan stopped once.** Epoch 1 had S1 (N1), S2 (N4), S3 (N5, the cornerstone), S4 (N6)
   and S5 (the words, the binary and the record). Two changes were counted in it. **1.1:** the list locates a `creds://`
   token among the entries that the agent may view, so a hidden entry with the name of a viewable one no longer makes the
   token ambiguous (the first build located over ALL entries, so a hidden twin turned a kept reference into the
   placeholder, an oracle for a hidden name); found by the lead's Opus review of the built branch (*fix first*; the code
   round had asked for the text too); row R5 flipped, pair (4) of E3 and row RG7 were added, and the texts say that the
   placeholder also stands for a missing, a broken and an ambiguous reference (row T1b). The Opus recheck said *ship*.
   **1.2:** a viewable entry under a folder that the agent may not view still counted as a match, so two viewable `db`
   entries under `Open/Team` and `Closed/Team` made `…/Team/db/password` the placeholder and the token was kept when the closed
   `Team` was not there, which tells the name of a folder that the agent may not view; found by CodeRabbit on #401. The second
   change stopped the plan.
2. **The re-review, and S6.** One consultation (`coai` cons `89487899`; option C: filter the candidates by the folders that
   the token names BEFORE the locator); the whole plan was revised (`43b12661`); the interim document round on the
   revision ended `proceed` (2 of 2 reviewers; 2 findings, both accepted); an Opus judge checked the table of the record,
   confirmed *Narrowed: no*, changed marks (six *cut* rows, each a fix forward, no revert, nothing was merged) and found a
   NEW oracle older than S6: with two accounts that have one e-mail address, the first account decided a token. Epoch 2
   was approved `by reviewers` with 0 changes (the line was written `by nobody` before the round and changed after it
   passed). The epics did not change; one story was added. **S6** (sites K1 to K5; rows K1, K2, KD1, KA1 to KA3, KG1 to KG6;
   mutations M20 to M30 and M7 in its new form): the folders that a token names are a part of what a candidate is and are
   asked in ONE place before the locator; the candidates come from each account that has the address (K5); the locator
   sees candidates only; they are held for one listing (D9); and five tighter checks (Q1 to Q5: the scan of L1 reads the
   whole body, DG2 asserts the exact row, T3 finds the bullet of each tool, and two in the harness). Rows beyond the first
   plan: T1b, RG7, pair (4) of E3, KD1 (three folders deep, from the judge) and **KG7**. KG7 is from the Opus review of S6:
   its fuzz (300 random vaults, 12,516 hidden-node pairs) found 0 differences in `command` and one low finding, a NUL in
   the cache key of the memory of D9 that could make two keys collide; fixed in `1c1fa834`.
3. **The gates, as run.** Plan round: `proceed`, 1 of 1 reviewers, 3 findings accepted (the bridge filter X1 with row BG3,
   row L1 first, the words about `folder` with row T4); consultants on Q4 (fail closed, with three limits: case, scheme
   and a short reference). Code round 1: `proceed`, 4 of 4; 1 accepted, 1 rejected. Opus review: *fix first* (entry 1.1);
   Opus recheck: *ship*. Code round 2: `proceed`, 4 of 4; 3 accepted (the index appends for each name, one segment key
   shared with the locator, the dependencies through the account-aware wall), 3 rejected. CodeRabbit on #401: the
   closed-folder oracle (entry 1.2, the stop), then 2 minor findings in the documents (`0f3c133f`); on the last head
   CodeRabbit was skipped (its limit; the owner had said to skip it then). Opus review of S6: *ship*. Code round 3:
   `proceed`, 4 of 4; 5 findings rejected with reasons.
4. **The owner's words, 2026-11-27.** The four answers of §2.6 of F7 (hide or mask each field); «делай по плану» (the
   pull request over the cap, the merge, both releases, the promotion); «идем по полному» (the full way: N5 was not split
   out). Q3 was answered «keep the text» and Q4 by the consultants. The record read for this promotion holds no owner
   answer to Q1, Q2, Q5 to Q11; the plan was built, merged and released on their default answers, and §14 says what each
   *no* removes.
5. **Proof at the merge.** The extension suite: 8657 tests, 8613 pass, 0 fail, 44 skipped. `itest:mcp`: 141 checks. `tsc`,
   `eslint`, `ratchet` and `contract` clean; `contract/mcp-tools-v1.json` changed four descriptions and nothing more;
   `contract/broker-v1.json`, `src_cli` and `McpJsonContext.cs` have no difference. `CredsMcp.Tests`: 174 pass, 3 skipped,
   2 fail on the lead's machine (the two `ParentWatchProcessTests`: `creds-mcp.exe` cannot start under WSL; CI is green).
   Mutations M1 to M19 and the 1.1 mutation of epoch 1, and M20 to M30 and M7 of epoch 2, each turned its rows red (the
   record is in `research/module_tests.md`). The Opus fuzz after S6 is in item 2.
6. **Where the code is not where the plan said.** Rows BG1 and BG3 are in `listFieldsHidden.test.ts`, not in
   `bridgeReadShape.test.ts` (§9 says the second); the control of RS3 was fixed in `bridgeWallWorld.ts` (a folder and an
   entry named `outside`, and an e-mail address for each account), and the merged diff has no change in
   `bridgeReadShape.test.ts`. The existing checks that S6 changed are the five that §6.8 names, and no other.
   `bridgeScope.ts` has one import, one comment and the one filter of X1. The pull request is #401 (33 files); the two
   releases carry this change only.
7. **Not built here** (by the plan's own decision, §13 and §14): **F6** (a `{name}` token reads the placeholder, and the
   rest of a token that is cut at a space or at a `)` stays as typed); **F8** (a person's *Run with secrets* resolves
   over the first account with the address, so a reference that the list keeps can still resolve differently or be
   ambiguous at the run; an agent's own run resolves no `creds://` off a bridge); **F9** (the worst case, 8,000 entries
   with one name and 4,000 bare references to it: about 3.8 s for one listing, the figure at the merge; the 4 to 5 s of
   §13 were measured on `599ef537`, and the body of #401 says about 5 s). Also open: the bridge drops a real in-scope dependency that is named exactly as the
   placeholder (fail closed, documented in the CHANGELOG); a vault that changes during one listing (§6.5); the clause of
   the `creds_run` description about the run-time resolution; F1 to F5 (recorded only).
8. **Boxes of §11 not ticked, and why.** (a) *Row BG3 was watched failing with A1 built and X1 not built*: the record
   says that each RED row was watched failing and that mutations M15 and M16 turn BG3 red; the order of A1 before X1 is
   not recorded. (b) *Each guard row was watched passing before and after; the tests named no edit have no changed line*:
   KG1 to KG6 were checked (the box of S6 is ticked), the guards of S1 to S5 and the "no edit" tests are in no record
   that this promotion read. (c) *The four existing tests of §6.8 changed as that table says*: RS3 changed through
   `bridgeWallWorld.ts` and not through its own file (item 6), so the box does not read true as written. (d) *The owed row
   of §9 is with the session that owns the bridge plan*: not written; `todo/PLAN_remote_bridge_scoped.md` belongs to
   another session, and this promotion did not edit it. (e) *The summary names the models and the counts of the
   launches*: the record read for this promotion has no such summary. (f) *The lead and the owner have heard that two
   releases must follow, and have the questions of §14*: the releases are done after the owner's «делай по плану»; the
   answers to the questions of §14 are in item 4.
9. **Not checked by a native reader:** the four translations (de, es, ru, uk) of the sentence of Appendix A. Row T3 pins
   the text; nobody measured how a native reader takes it.
10. **Process notes.** The plan's order was S1, S2, S3, S4, S5, then the stop, then S6. The `file:line` of §1.1 to §1.6,
    §2.1 to §2.3, §2.5 to §2.8, §3.1 to §3.4, §6.1 to §6.9 are those of `dbb2166d`, and those of §1.7, §2.4, §3.5 and §6.10
    are those of `599ef537`; none was read again on the merge commit. The pull request was over the cap on the owner's
    word. `creds-mcp` 0.11.1 has no CHANGELOG of its own: its notes are the generated `src_mcp/RELEASES.md`.

## 13. Found along the way (not built here)

- **F1. `folder` names the folder that answered, not the folder that the entry is in.** For an entry with no switch
  of its own under a silent folder under an open folder, the field holds the name of the open folder
  (`answeringFolder`, `mcpAccess.ts:358-360`; observed). `creds_folders` lists the silent folder too, with its own
  name. The comment of the field says *the folder it lives in* (`mcpEntries.ts:39-40`). Nothing hidden is told. The
  VALUE is not changed (Q6). The WORDS are: the description of `creds_list` says which folder the field names
  (Appendix B, row T4; finding 3 of the plan round), and B3 repairs the comment.
- **F2. The filter of `dependsOn` on a Remote Bridge is by name** (`bridgeScope.ts:152`, `:162-166`). The plan of
  the bridge looked at it and rejected a change (its §8, the row *reviewed and rejected by the re-review for epoch
  6*: a duplicate name discloses nothing). The placeholder was a new fact, and the plan round asked for a fix here:
  X1 drops the placeholder before the filter (§2.7). What stays, and is not built: the filter is by name, so a hidden
  dependency with the name of a row in scope cannot be told from that row. After N1 the local row does not hold
  such a name, so this case is gone for a hidden dependency; for a dependency that the agent may view locally and
  that is out of scope, it is as that plan left it.
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
- **F6. A `{name}` token, and a token that is cut (finding F4 of the Opus review, entry 1.1).** A `creds://` token that holds `{name}` (for
  example `creds://me@x.test/{name}/password`) always becomes the placeholder: `REF_PATTERN` stops at `}`, so the token is
  cut there and the parser does not read it. When a token is cut at a space or at a `)`, the rest stays as the person
  typed it. That rest is the person's own text and is not checked against the vault; it is no break of rule A, because
  the list shows a word that the person typed and does not read the vault for it. A name with a space that is typed
  with no `%20` is such a case: the scan cuts the token at the space, the rest stays, and the run does not resolve
  the token either. Recorded, not built.

There is no F7 in this list: F7 is the short name of the neighbour plan. F8 and F9 are from the re-review, on
`599ef537`.

- **F8. A reference that the list keeps can be ambiguous at the run.** The list locates among the candidates of
  §2.4. A run locates over the WHOLE account: the person's *Run with secrets* resolves with the window's own source
  (`commands/runCommands.ts:411`; `extension.ts:818-826`), and `locate` refuses a name that two entries have and
  names the two paths to the person (`secretRef.ts:153-180`). So when a viewable entry has a hidden twin, the list
  shows the token as typed and the person's run refuses it. The lead's note says this of `creds_run`. Read on
  `599ef537`: an agent's own action resolves no `creds://` reference off a Remote Bridge (row R of the class test,
  `test/agentNamesOnlyViewable.test.ts:567`), and `scopedRefSource` (`bridgeScope.ts`) has no caller in the product
  yet (checked: `grep -rn scopedRefSource src_vs_code/src` finds its definition, one comment and tests). So today
  the case is the person's run only. When a bridged run or an agent's run resolves references (E3 of the plan of
  the bridge), its refusal for an ambiguous name must not tell an agent that a hidden twin exists; the bridge has
  one fixed sentence for it (`REFERENCE_REFUSED`). The same gap is there for two accounts with one address: the
  run takes the first account (`secretRef.ts:158`), and the list counts over the two (K5), so the two can differ in
  each direction (rows KA1 to KA3). Recorded, not built.
- **F9. The time of the worst case.** Measured on `599ef537`, one run, a scratch script (§1.7): 8,000 viewable
  entries with one name and ONE command with 4,000 tokens of one path part take about 4 to 5 seconds for one build
  of the list, because the locator reads the whole bucket for each token. The list is built once for each change of
  the vault (`mcpEntriesCache.ts`), and the vault is the person's own. Two cheap cuts exist and are not built: a
  token that was decided is remembered for the listing; and for a token with one path part, a bucket of more than
  one entry is ambiguous with no call of the locator. S6 builds only the memory that way C needs (D9).

## 14. Questions for the owner

The question consultants were asked on Q4 only (consultation `e3ac9aef`, 2026-11-27). They were not asked the other
questions: Q1 to Q3 and Q5 to Q8 keep the answers that this plan is built on, and the owner can change each one. Q9
and Q10 are from the re-review; its consultation (`coai` cons `89487899`) answered Q9. The work does not wait.

- **Q1 (N1, D2). A dependency that was DELETED gives the placeholder too.** Today it is dropped. *Built on: yes*, so
  a hidden dependency and a deleted one read alike. The other answer keeps the drop; an agent can then tell that a
  hidden dependency exists and was not deleted.
- **Q2 (N1, D1). One placeholder for any number of hidden dependencies, at the end of the list.** *Built on: one.*
  The other answer gives one in the place of each; the agent then reads how many there are.
- **Q3 (N5, D7). A reference that is kept still shows the e-mail address of its account.** *Built on: it stays*
  (the owner said: keep the text). The other answer replaces each reference, as a Remote Bridge gives a boolean.
- **Q4 (N5, D4). A token is replaced also when it is ambiguous, broken, or names an entry that the agent may view
  through a folder that it may not view.** *Built on: yes* (fail closed, and a hidden entry reads as a missing one).
  **The consultants answered (consultation `e3ac9aef`, 2026-11-27, the two rows of their answer): fail closed.** They
  set three limits, and the plan is written to them (§2.4, D4): (a) a reference that differs from the stored names
  in letter case only, and that the locator resolves to ONE entry that the agent may view, is a clean match and stays
  as typed (row RG6); (b) the scan of the list reads the scheme in any letter case and applies the same decision
  (rows R7 and RG6, mutations M9 and M18); (c) a shorter reference that names one visible entry and leaves a hidden
  folder out can stay (row RG5, pair (3) of E3, mutation M17). The first draft of this plan put *another letter case*
  in the list of the replaced tokens; that was wrong for a clean match, and it is corrected. The owner can still say
  no: the other answer replaces only a reference that the locator finds and the wall refuses; rows R4 to R6 and pairs
  (1) and (2) of E3 go then, and rule A does not hold for `command`.
- **Q5 (N5, D8). The two members of the window's reference source move out of `extension.ts` into a pure module.**
  *Built on: yes*, so the list and the run find the same entry by one function. The other answer writes them a
  second time in the list.
- **Q6 (N4, F1). `folder` names the folder that gave the switches, which is not always the folder that the entry is
  in.** *Built on: no change of the value; the tool description says it (Appendix B, row T4).* The other answer makes it the parent's name when the agent may view the parent; it
  is its own small item.
- **Q7 (the words). The two placeholders of §2.8, in round brackets.** *Built on: as written.* The owner can change
  the words in one place each; rows T1, D1, R1 and BG3 read the constants.
- **Q8 (S5). The tool descriptions and the help sentences are in this plan, with a `mcp-v` release after the
  extension release.** *Built on: yes.* The other answer cuts S5 to the harness check H1; the agent then reads the
  placeholders with no description of them.

- **Q9 (N5, entry 1.2). Two entries that the agent may view have one name, and a token names a folder that is open
  for one of them and not open for the other one. The token is KEPT: it names the first one.** *Built on: yes* (way C
  of §2.4; the consultation of the re-review gave it, and §1.7 has the run). The other answer makes such a token the
  placeholder in each case, by making each viewable entry with the name a match whatever is above it; the token
  `Team/db` then reads differently when the closed folder has the name `Team` and when it has another name, and the
  defect of entry 1.2 stays. A third answer replaces EACH token that names a folder; limit (a) of Q4 and row RG1 go
  then.
- **Q10 (N5, D9). The candidates of a name and a number of named folders are remembered for one listing.** *Built
  on: yes* (one map; without it way C is about 11 times slower for a vault with many entries of one name). The
  other answer leaves the memory out and takes F9 and this cost into one follow-up.

- **Q11 (N5, K5). Two accounts with one e-mail address: the list takes the candidates of the two, and a name that
  the agent may view in each of them is ambiguous.** *Built on: yes* (the Opus judge of the re-review found the
  oracle; a row of the list has no account, so the agent cannot tell which `db` a token names). The other answer
  lets the first account that has a candidate win: it is safe for rule A too, row KA2 then stays *kept*, and the
  list is nearer to the run; it needs a rule for a first account whose candidates are ambiguous.
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

1. **`creds_list`** (W1), a new paragraph after the first one: *`folder` is the name of ONE folder above the entry,
   and only when that folder is open to you too. When the entry takes its access switches from a folder, it is the
   folder that gave them, which can be a folder above the entry's own folder. When the entry has switches of its own,
   it is the entry's own folder. It is empty when that folder is not open to you, and when the entry is at the top of
   the vault. `dependsOn` names the entries this one needs that are open to you; when it needs one that is not, the
   list ends with "(a dependency that is not open to agents)". In `command`, "(a creds reference that is not open to
   agents)" stands in the place of a creds:// reference that is not open to you, or that is missing, broken or
   ambiguous.* Row T4 holds the clause about the
   folder that gave the switches; guard FG2 holds the fact.
2. **`creds_folders`** (W2), after *Each carries `id`, `name`, `parent`, …*: *`parent` is the id of the folder above
   it when that folder is open to you too, and null when it is not — so a null parent does not say that the folder
   is at the top of the vault.*
3. **`creds_run`** (W3), after *its own `command` field tells you what it will do.*: *In that text
   "(a creds reference that is not open to agents)" stands in the place of a creds:// reference that is not open to you,
   or that is missing, broken or ambiguous.*
4. **`creds_vpn_up`** (W4), after *that dependency is the person saying "this needs that first".*: *A dependency
   that is not open to you is not named: `dependsOn` then ends with "(a dependency that is not open to agents)",
   and you cannot bring that one up — tell the person which entry needs it.*

Each of the four is true with a window of an older extension too, with one exception that §3.4 names: such a window
still names what a newer one hides.

## Epics

One epic, because the four fields are small, share one predicate and one release of the extension. Its stories are
here and not in a document of their own: the lead asked for it for a plan of this size, and the family has done it
before ([PLAN_agent_small_truths_n8_n9_n2.md](PLAN_agent_small_truths_n8_n9_n2.md), `## Epics`). The
lead asked for four stories, one for each field. A fifth holds the words, because they are in another binary with a
release of its own. A sixth, S6, is from the re-review for epoch 2: the epic did not change, so the split was not made
again, and one story was added. The rows and the mutations of §6 are the scenarios of each story. Fable wrote this plan and the
split, because each story is a judgement on authorisation (what an agent may see). The question consultants were asked
on Q4 only (consultation `e3ac9aef`); this text has no record that they were asked what is important for the split, so
the lead says if that question is still owed before the split is final. Sonnet codes each story from
its rows; Opus reviews each one; the security reading of S3 and of S6 is Fable's, at review. One epic gives a
cornerstone quota of 1, and S3 has it. The rows of S6 are in the same area; Fable wrote them as a security judgement
(what an agent may see), which is outside the quota, and S6 is not marked as a second cornerstone.

Cornerstones: 1 of 1 — S3

### E1 · The list answers name only what the agent may view, on `fix/agent-list-fields-hidden`

- **Goal.** No field of `creds_list` or of `creds_folders` names a node, or gives its id, when the agent may not
  view that node. A hidden node and a missing id give the same list body. The tool descriptions and the help say
  what the four fields hold.
- **Scope.** §2, §3.1, §3.5, §6, the documents of §7, the owed row of §9.
- **Depends on.** Nothing. F7 is merged and released (extension 1.21.1 and 1.21.3), and N8 is released (1.24.1).
- **Done when.** §11 is ticked, with the boxes of S6, and the code round has run again on the branch with S6.
- **Pass criteria, each one a thing that can be counted.**
  1. L1: the two list bodies of the class test hold 0 hidden names and 0 hidden ids; the list of exceptions has 0
     rows.
  2. E1 to E4: in 4 of 4 pairs the two bodies are deep-equal.
  3. D1 to D5: `dependsOn` holds 0 names of a node that is not `shown`, and at most 1 placeholder.
  4. R1 to R7: 0 tokens that start with the scheme are in a listed command, but the tokens of RG1, RG2, RG5 and RG6, which are
     byte-equal to the stored text.
  5. P1 to P3 and F1, F2: 3 parents are `null` and 2 folders are `''`.
  6. BG1 and BG2: the rows that a Remote Bridge serves in those worlds have 0 changed bytes. BG3: in 3 of 3 worlds a
     bridge serves 0 placeholders. `bridgeScope.ts` has 1 changed expression (the filter of `narrowed`), 1 new import
     and 1 changed comment.
  7. G1: with each node visible, the two list bodies have 0 changed bytes.
  8. T3 holds for 5 of 5 languages; T1 for 3 descriptions; T4 for 1 clause; H1 for 4 values.
  9. Each of the 19 mutations turns at least 1 row red.
  10. `contract/broker-v1.json`, `src_cli` and `McpJsonContext.cs` have 0 differences; `contract/mcp-tools-v1.json`
      has 4 changed descriptions.
  11. L1 failed 1 time on the unchanged code before S1, and passes after S4.
  12. (S6) K1, K2 and KD1: in 3 of 3 rows the 3 complete bodies are deep-equal, and the token that names the open
      branch is kept in each world. KA1: in 5 of 5 worlds the token is kept and the bodies are deep-equal. KA2: 1
      placeholder. KA3: 1 token kept and 1 placeholder.
  13. (S6) KG1 to KG5: 0 values differ from those of `599ef537`. KG6: the two listings read the same number of nodes.
  14. (S6) Each of the 11 mutations M20 to M30 turns at least 1 row red, and M7 in its form of S6 turns R3 red: 30
      mutations in all.
  15. (S6) `src_mcp`, `contract/`, the five `help*.ts` files and `bridgeScope.ts` have 0 differences to `599ef537`.
      The folders of a token are asked in 1 place. Row RG7 has 0 changed lines.
- **Cornerstone area.** The command field (S3, and S6 in the same area): the scan, the locator and what a candidate
  is. Two reviews found a mistake there after the build (entries 1.1 and 1.2). A mistake there is a
  name that leaves the vault inside a text that passes each other test, and the field is the only one of the four
  with a grammar.

**Stories.**

- **S1 · N1, the dependencies, with row L1 first and the bridge filter.** Before a line of product code: the fixture's
  e-mail address, and row L1 with no exception, watched failing on the unchanged code, with the message kept (§5,
  step 2). Then P1, and rows D1 to D5 and E1 RED first, with the failure messages kept. Then A1 and A2. Then row BG3
  RED, and X1. Guards DG1, DG2, BG1 and BG2. Mutations M1 to M3, M15 and M16. The existing test of
  `test/mcpEntries.test.ts:238-250` changes here, and the exception N1 goes out of the list check. A1 and X1 are one
  story on purpose: A1 alone lets the placeholder cross a bridge.
- **S2 · N4, the folder.** Rows F1, F2 and E2 RED first. Then B1 to B3. Guards FG1 to FG3. Mutations M4 and M5. The
  existing test of `test/mcpEntries.test.ts:88-109` changes here, and the exception N4 goes out. It shares no line
  with S1.
- **S3 · N5, the command (the cornerstone; this document is its specification, by Fable).** Rows R1 to R7 and E3 RED
  first. Then C1 to C5. Guards RG1 to RG6. Mutations M6 to M10, M17 and M18. RS3 of `test/bridgeReadShape.test.ts`
  and the accounts of `test/bridgeWallWorld.ts` change here, and the exception N5 goes out. It needs P1 of S1 and B1
  of S2.
- **S4 · N6, the parent, and row L1 again.** Rows P1 to P3 and E4 RED first. Then D1 and D2. Guards PG1 and PG2.
  Mutations M11 and M12. The exception N6 goes out: the list of exceptions is empty and is removed, and the test is
  row L1 as S1 wrote it. L1 is run again and passes; the summary quotes its failure message of S1 and this pass.
  Guard G1. It needs B1 of S2, and the pass of L1 needs S1 to S3.
- **S5 · The words, the binary and the record.** Rows T1 to T4 RED first. W1 to W4, the build, the check H2, W5. W6.
  W7 and H1. Mutations M13, M14 and M19. The CHANGELOG entry, the two documents of `research/`, the closing checks
  of §5, the code round and the pull request. It follows S1 to S4, because the documents record them as built.
- **S6 · N5 again: the candidates of a token, and the five tighter checks (epoch 2; not built; this document is its
  specification, by Fable).** Rows K1, K2, KD1 and KA1 to KA3 RED first on `599ef537`, with the failure messages kept; guards KG1 to
  KG5 watched passing there. Then the sites K1 to K5 of §3.5: the folders that a token names are a part of what a
  candidate is, the candidates come from each account with the address, the locator sees candidates only, and they
  are held for the listing (D9). Guard KG6. Mutations M20 to M25, M29, M30 and M7. Then the tighter checks Q4, Q5
  and Q3 with mutations M26 to M28, and Q1 and Q2 in the harness. Then the
  documents of S6, the closing checks of §5 and the code round. It needs S3 and entry 1.1, which are built. The
  stories S1 to S5 above are the record of what was built; S6 is the one story that remains.
