# PLAN — The path of a key file that an agent's call writes holds no id of an entry, E1: rule C, the name of a call file

> Status: **stories only, nothing built yet, 2026-11-12.** Stories of epic E1 of
> [PLAN_agent_refusal_key_file_path.md](PLAN_agent_refusal_key_file_path.md) (its §4.1 rows C1 to C5, §5, §6, §7, §9 and `## Epics` E1).
> Written 2026-11-12 by Opus. Each `file:line` below was read on `42d7340d` (branch `fix/agent-refusal-key-file-path`; its
> `src_vs_code` is the same as on `main` at `6dd96fe7`). E1.1 is the cornerstone; its buildable text is
> [PLAN_agent_refusal_key_file_path_E1_S1_spec.md](PLAN_agent_refusal_key_file_path_E1_S1_spec.md) (Fable, 2026-11-12).

**Committed together with this document:** its row in `todo/README.md` and the link in the parent's `## Epics`. The parent's
cornerstone ledger line does not change: it reads `Cornerstones: 1 of 1 — E1.1` since `42d7340d`. This document keeps no change
ledger: a change of it is an entry in the parent (`plan-change-control.md`). Paths are relative to `src_vs_code/src/` unless they
start with another folder. Row names (S1, S2, C1 to C5, K1 to K6, U1 to U3, G1 to G9) are the parent's; F, P and B names are the
spec's; D names are this document's.

## What E1 builds, in one paragraph

An agent's SSH call writes a borrowed stored key to a file whose name starts with the id of the key entry (`sshExecAuth.ts:162`).
The path reaches the agent in three ways: a failed write (a), a failed run (b), and what `ssh` prints (c). E1 gives that file a
random name, `call-<uuid>.key` (rule C of the parent's §2.2): one function makes the name (`callKeyName`), one writes the file
(`materializeCallKey`), one call site changes, a scan keeps other callers of `materializePrivateKey` out, and part C of the class
test proves the three ways on `creds_exec`, `creds_rotate` on an SSH entry and a linked `creds_run`. Then E1 corrects the comments
that the fix makes false (C4), writes the CHANGELOG entry and the module documents, writes or hands over the boundary rows of the
parent's §9, and runs the closing checks. No route, error code, status, body shape, sentence or tool description changes.

## Stories, and who writes what

| Story | Area | Scenarios and brief | Code and tests | Review | Gates |
|---|---|---|---|---|---|
| E1.1 **(cornerstone, `model: fable`)** | the scan S1/S2, the no-op step, the worlds, part C, K1 to K6, the fix C3, U1 to U3, G1 to G9, the six mutations | the spec (Fable) | Sonnet | Opus | the lead |
| E1.2 | the comments C4, the documents of §7, the boundary rows of §9, the closing checks | this document (Opus) | Sonnet | Opus | the lead: closing checks, `coai` code round, pull request |

Two stories, as the parent's `## Epics` and its question consultants said. A story for part C alone would end red, and every
commit is green, so the scan, part C, the RED rows and the fix are one story. E1.2 changes no code line, only comments and text.

## Binding constraints, for every story

- **No plan change.** Epoch 1 of the parent holds one change (1.1). A second accepted change of scope, goals, the Definition of
  Done, the build order, the tests or the approach stops the whole plan. Build what the parent, the spec and this document say. If a
  step cannot be done as written, or you find a new site, a new caller or a new world: stop and tell the lead. Do not repair the
  parent or the spec.
- **Every commit is green** (`git-workflow.md` rule 2; decided by the lead, spec §11). The RED states stay in the working tree;
  the first commit quotes them. Save each RED text in the scratchpad folder of the session as well (a restart empties it).
- **Node only.** No Python, also not for a helper. Write documents with the Edit or Write tool, never with a shell heredoc.
- **Lowered priority** for every build and test run (the parent's §5, `local-cpu-budget.md`): `npm test` lowers itself;
  `npm run compile`, `npm run typecheck` and `npm run lint` run as `node $LP npm run <script>`. One test executable at a time.
- **File limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): 800 lines a file, 50 code lines a function (120 in `src/test/`),
  complexity 4 (also in tests; ESLint 10.13 counts `??`, `?.` and default parameters). No new `eslint-disable`.
  `tsconfig.json:11-12`: `noUnusedLocals`, `noUnusedParameters`.
- **Stage by path, read `git diff --staged --stat` before each commit, commit only your own files.** Do not push; the lead pushes.
  The commit trailer names the model that wrote the change.
- **Files with no change in E1:** everything in `contract/`, `src_mcp`, `src_cli` and `src_broker_client`; `agentUseActions.ts`,
  `rotateAction.ts`, `commands/agentCommands.ts`, `sshSession.ts`, `transportFactory.ts`, `hostKeyTrust.ts`, `agentNaming.ts`,
  `mcpEntries.ts`, `test/agentNamesOnlyViewable.test.ts`, `todo/PLAN_remote_bridge_scoped.md`,
  `todo/PLAN_remote_bridge_scoped_E1_S3_spec.md`. `sshUseActions.ts` changes in one comment only (E1.2), with the same line count.

## Facts read on `42d7340d` that E1.2 uses

| # | Fact | Where |
|---|---|---|
| D1 | `git diff --stat 6dd96fe7 42d7340d` touches the parent, the spec and `todo/README.md` only: each `file:line` of the spec holds | git |
| D2 | `## [Unreleased]` is `:7` and is empty; the entry of 1.21.3 (`:9-52`) is released text and is not edited | `src_vs_code/CHANGELOG.md` |
| D3 | The rule A/B paragraph is `:6407-6452`; its *What rule B does not hide* (`:6447-6451`) names `<storageDir>/keys/<keyEntityId>-<uuid>.key` and calls it *not built*. The SSH-call paragraph is `:2472` | `research/module_extension.md` |
| D4 | The rule A/B section is `:2327-2418`; part A `:2333`, part B `:2372`; *What none of this proves* `:2407`, whose items `:2410` and `:2411` name the old file name and *Not built*. The next heading, `## What none of them covers`, is `:2420`. No section describes `keysDirPaths.test.ts` | `research/module_tests.md` |
| D5 | The two places that name the old shape are D3 and D4 only (`grep -rn "keyEntityId>-"` over `research/*.md`, plans apart, `README.md`, `src_vs_code/README.md`) | grep |
| D6 | The bridge plan and its S3 spec are edited today on `docs/remote-bridge-change-8-2` (`d0300cee`, worktree `wt/creds-bridge-8-2`; epoch 9 opened there); the S3 sentence of the owed row is `:1912` there, `:1902` here | git |
| D7 | `PLAN_ssh_exec_own_agent_forwarding.md`, `PLAN_ssh_exec_absolute_program.md`, `PLAN_askpass_answers_the_hop.md`: not started, no ledger, no branch or worktree touches them after `6dd96fe7` | git log, `git worktree list` |
| D8 | CI also runs `npm run ratchet` (`.github/workflows/ci-extension.yml:78`); its baseline lists `extension.ts` and `storageManager.ts` only, and E1 changes neither | `src_vs_code/.size-baseline.json` |

## Commands

In `src_vs_code`, with `LP=../.agents/conventions/tools/low-priority.mjs`. `node_modules` and `out` exist in this worktree
since 2026-11-12 16:18; run `npm ci` only if a step says a module is missing.

1. `node $LP npm run compile` — read its exit first; a test result after a failed `tsc` is the result of old files.
2. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
3. `node $LP npm run typecheck` · 4. `node $LP npm run lint` · 5. `npm test` (the full suite; it compiles and lowers itself)
6. `node $LP npm run contract`, then, from the repository root, `git diff --exit-code -- contract`
7. `node $LP npm run ratchet` (D8)

From the repository root: 8. `node .agents/conventions/tools/plan-lifecycle.mjs` · 9. `node .agents/conventions/tools/pin-check.mjs`
· 10. `git diff --stat 6dd96fe7 -- src_mcp src_cli src_broker_client contract` (empty).

## E1.1 — rule C at the source (CORNERSTONE, `model: fable`)

**The buildable text is the spec**, [PLAN_agent_refusal_key_file_path_E1_S1_spec.md](PLAN_agent_refusal_key_file_path_E1_S1_spec.md):
its §1 to §13 in the order of its §11 (state 1 to state 3, c1, c2). This section does not repeat it. It adds only what a coder
needs and the spec leaves out (the checks are under *Notes on the spec*):

1. **S2 in state 1 passes through the definition.** Before C2, `keyInstaller.ts` has no call of the writer; its one site with
   `call === true` is the definition `export function materializePrivateKey(` (`keyInstaller.ts:149`), because the spec's test
   for a call is "a `(` after the match". Do not change that test to skip a definition: S2 would then fail in state 1.
2. **Three functions land exactly on complexity 4.** K5's body (`?? ''` two times and `auth.keyPath?.startsWith`, spec §6);
   `e1Of` with `pinned` (three spreads with a ternary, `secondEntryWorld.ts:101-109`); the runner of `bridgeLinksWorld.ts` with
   `printsKeyPath` (`world.hold?.()` and two ternaries, `:104-110`). One branch more fails `npm run lint`: move the choice of
   `stderr` into a small helper, as the spec's §4.1 does for the other world.
3. **The `pinned` key.** Write `hostKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY'` as the spec says. It is
   `formatHostKey(KEY)` of `test/hostKeyTrust.test.ts:26` (`hostKeyPin.ts:101-103`), and `parseHostKey` accepts it
   (`hostKeyPin.ts:53`, `:56`, `:107-111`: 33 base64 characters, at least 32).
4. **Mutation 1 writes the index.** `git checkout 6dd96fe7 -- src_vs_code/src/sshExecAuth.ts` stages the old file. Stage nothing
   else while it stands, and restore with `git checkout HEAD -- src_vs_code/src/sshExecAuth.ts` (index and tree), as spec §10 says.
5. **The comment of `sshUseActions.ts:130-132` is false from c1 until c3** (spec §14). It is the same branch and pull request.
6. **The summary for the lead** (it goes into the pull request body): the first S1 failure and the 8 lines of the `grep` of spec
   F4 compared with the parent's §4.3; one RED text of each of K1 to K6 and the count 15; the "before" and "after" passes of G1
   to G9; the six mutations with their red tests; the line counts of the changed files; the models and counts of the launches.

## E1.2 — the comments, the documents, the boundary rows and the closing checks

**Depends on** E1.1 (c2). It changes comments and text only: `git diff` of each `.ts` file shows comment lines and nothing else.

### 1. The comments C4 (the parent's §4.1 row C4, §5 step 7)

Find each place by its text: E1.1 moves two of them by one line (the new import at `materializedKeys.ts:1`; `callKeyName` in the
import block `keyInstaller.ts:9-14`). Replace exactly the lines named, with the lines below; keep the indent of the `*` gutter.

| # | Where on `42d7340d` (after c1) | What is false |
|---|---|---|
| C4.1 | `sshUseActions.ts:130-132` (the same) | *the key file path holds the id of the key entry (an open owner question, N10 …)* |
| C4.2 | `materializedKeys.ts:67-68` (`:68-69`) | *the file name is also how the purge and the wipe find it again* (N12) |
| C4.3 | `keyInstaller.ts:146-147` (`:147-148`) | the name is said to be `<id>…` in each case |
| C4.4 | `keyInstaller.ts:157` (`:158`; `:160` after C4.3) | *The id comes from the vault* |

```text
C4.1 (three lines for three, so no line below moves):
 * it. The two sentences that carry a path or an argv (`Could not write the stored key`, `Could not run ssh`) are not covered: off a bridge
 * they pass unchanged. A key file path in them holds no id of an entry: the key file of a call has a random name, `call-<uuid>.key`
 * (`materializeCallKey`, rule C); the local folder stays in them, by decision. Those two files do not know which door asked, so the door is handled here, where every
C4.2:
 * digest of the ORIGINAL, and a name that needed no rewriting — the ordinary uuid, or a call name of
 * `callKeyName()` — is passed through untouched. No code finds a file again by its name: a remover is handed the whole
 * path, and the purge takes the whole folder of a window.</p>
C4.3:
 * <p>`entityId` is the first part of the name: the id of a key entry on the person's roads (`sshSession.ts`; `git-<id>` for the git
 * sync, `transportFactory.ts`), or a random call name from `materializeCallKey` (rule C: no id of an entry). `suffix` makes the
 * file THIS call's alone: `<id>-<suffix>.key`, so two sessions of one entry never share a path (E1.S3 `isolate`). A per-session
 * uuid, never vault data. Omitted, the name is `<id>.key`.</p>
C4.4:
  // A name built from an id comes from the vault, and import/restore write an envelope's ids verbatim; a call name is random (rule C).
```

No comment cites the parent's path: the plan moves to `research/` on promotion, and a cited path would then need a rewrite.

### 2. The documents of the parent's §7

**`src_vs_code/CHANGELOG.md`**, directly under `## [Unreleased]` (`:7`). Check each claim against the diff of c1 before c3:

```markdown
### Changed — security: the path of a key file that an agent's SSH call writes holds no id of an entry

An SSH entry can use the key of a second entry (*SSH key source*). For each SSH call of an agent the extension writes that key to a
file, and the name of the file started with the id of the key entry: `<storage folder>/keys/<pid>/<id of the key entry>-<uuid>.key`.
Three texts that an agent reads can show that path: the refusal when the key cannot be written (`Could not write the stored key to
disk: …`), the refusal when `ssh` cannot run (`Could not run ssh: …`), and what `ssh` itself prints about its key file (for example
`Load key "<path>": invalid format`). So an agent could read the id of a key entry that it may not view, and an id that came with an
import can look like a name (`deploy-key`). Now the key file of a call has a random name, `call-<uuid>.key`. The rule: the name of a
file that the extension writes for one call holds nothing of the vault, no id and no name of an entry.

- **Which calls.** `creds_exec`, `creds_rotate` on an SSH entry, and `creds_run` on a Terminal entry that runs over a linked SSH
  entry. The same on the alias door and on the token door (`creds exec` in a terminal), because an action does not know its door,
  and on a Remote Bridge.
- **What changes for an agent or a script.** One thing: in a text that shows the path of the key file of a call, the last part is
  `call-<uuid>.key`, and it was `<id of the key entry>-<uuid>.key`. No route, error code, status, body shape, sentence or tool
  description changes. `contract/broker-v1.json` and `contract/mcp-tools-v1.json` do not change, and `creds` and `creds-mcp` do not
  change.
- **Three of the person's own commands get the new name too**, because they use the same writer: the check of the bridge socket,
  *Install creds on host*, and the person's `ssh -R` bridge. Their output goes to the person, not to an agent.
- **What stays.** The local path: off a Remote Bridge the two refusals keep the text of the operating system, with the storage
  folder, and `ssh`'s own output shows the folder, also on a bridge. The names of the person's other key files (Connect, the git
  sync) keep the id. A key FILE that a key entry points to (not a stored key) is the person's own path, and `ssh` can still print
  it. A file that a closed window left is removed by the purge of the keys folder, as before; its name no longer tells which key
  entry it belongs to.
```

**`research/module_extension.md`** (D3). No diagram shows the keys folder (the parent's §7), so none is drawn again.

```text
(a) In *What rule B does not hide* (:6449-6451), replace from "and the path of a borrowed key, whose file name is" to
    "it is a question for the owner." with (keep "Pinned by part B of the same class test …" after it):
and the local path of the file of a borrowed key (a failed write, `Could not run ssh`, and the text of `ssh` on a call that
answers 200 can carry it; a bridge closes the first two), whose name holds no id since rule C, below.
(b) After that paragraph (after :6452), a new paragraph:
*Rule C: the name of a call file* ([PLAN_agent_refusal_key_file_path.md](../todo/PLAN_agent_refusal_key_file_path.md)). The name
of a file that the extension writes for one call of an agent holds nothing of the vault: `materializeCallKey` (`keyInstaller.ts`)
names the key file of a call `call-<uuid>.key` with `callKeyName()` (`materializedKeys.ts`), which takes no argument, and every
caller of `resolveExecAuth` uses it (the agent's calls and three commands of the person). So no text that shows the path of a call
file can tell the id of an entry, on any door and on a Remote Bridge, also for an imported id that reads like a name. Pinned by
part C of the class test, `agentKeyPath.test.ts`, and by the scan of `keysDirPaths.test.ts` (see `module_tests.md`).
(c) In the SSH-call paragraph (:2472), after "which refuses a PIN-locked or woven password; " insert:
a stored key is written to `keys/<pid>/call-<uuid>.key` by `materializeCallKey`, a random name, so that a text that shows the path
tells no id of an entry (rule C, in *A lookup and a refusal name only what the agent may view*);
```

**`research/module_tests.md`** (D4):

- **(a)** A new section directly above `## What none of them covers` (`:2420`), headed `## The path of a call file holds no id
  (2026-11-12, E1 of [PLAN_agent_refusal_key_file_path.md](../todo/PLAN_agent_refusal_key_file_path.md), rule C)`. It holds, from
  the build as it ran: where part C is (`agentKeyPath.test.ts` over `secondEntryWorld.ts` and its four options), the one-suite
  command, a table of flows (the fixture proof P1 to P7, K1, the nine cells K2 to K4 with assertion 1 first, G5, K5 in
  `sshExecAuth.test.ts`, K6 in `bridgeLinks.test.ts` with `printsKeyPath`, U1 to U3), **the scan** S1 and S2 in `keysDirPaths.test.ts`
  next to the older guard of the same file (nothing joins a name into `keys/<pid>/` by hand) with *what S1 does not find* (the
  parent's §6.3), *watched red* (the first S1 failure, the count 15 of state 3 and one failure text, the six mutations), and *What it
  does not prove*: the five items of the parent's §6.6.
- **(b)** and **(c)**, the two items of *What none of this proves* that c1 makes false:

```text
(b) In item :2410, replace "for a key that is written to disk, the path `<storageDir>/keys/<keyEntityId>-<uuid>.key`" with:
for a key that is written to disk, the path of the key file (since rule C `<storageDir>/keys/<pid>/call-<uuid>.key`, with no id:
part C, below)
(c) In item :2411, replace from "can carry the path, and so the id of the key entry." to the end of the item with:
can carry the path. Off a bridge those sentences reach the agent as they are (`bridgeLinks.test.ts` pins them); on a bridge they
are closed. Since rule C the name of the file holds no id: part C, below, proves it on the three doors.
```

**README and help** (the parent's §7). Checked on `42d7340d` with `grep -c -F 'keys/'` and `grep -c -F '.key'`: `README.md` 0 and 0,
`src_cli/README.md` 0 and 0, `src_mcp/README.md` 0 and 0, `helpEn.ts`, `helpDe.ts`, `helpEs.ts`, `helpRu.ts`, `helpUk.ts` 0 and 0
each. No change. Run it again in E1.2 and write the counts into the summary. (Outside the parent's list: `src_vs_code/README.md:643`
names the folder `keys/`, no file name: no change.)

`POST_DEPLOY.md`: no item (the parent's §7). `todo/README.md`: the status cells of the three rows of this plan, at c3.

### 3. The boundary rows of the parent's §9

| Neighbour | Its owner session | What E1.2 does |
|---|---|---|
| `research/PLAN_agent_refusal_names_unlisted_entry.md` (F7) | none needed | nothing is owed (the parent's §9) |
| `todo/PLAN_remote_bridge_scoped.md` | **active**: under change control (epoch 8, epoch 9 opening), open PR #354 of another session, branch `docs/remote-bridge-change-8-2` (D6) | **OWED, not written here.** The lead hands rows (1) to (4) of the parent's §9 to that session, with this plan's PR number; the file gets no change in this branch |
| `todo/PLAN_remote_bridge_scoped_E1_S3_spec.md` | **active**: the same session edits it (D6) | **OWED, not written here.** The same hand-over: the sentence of Amendment 3, C.6 (`:1912` on that branch) gets the name `call-<uuid>.key` and a pointer to this plan |
| `todo/PLAN_ssh_exec_own_agent_forwarding.md` | none (D7) | **written in c3**, row W1 |
| `todo/PLAN_ssh_exec_absolute_program.md` | none (D7) | **written in c3**, row W2 |
| `todo/PLAN_askpass_answers_the_hop.md` | none (D7) | **written in c3**, row W3 |

Each W row is a new paragraph after the last `**Boundary with …**` paragraph under the status block, before the first `##` heading,
in the shape of the rows there:

```text
W1 (PLAN_ssh_exec_own_agent_forwarding.md):
**Boundary with [PLAN_agent_refusal_key_file_path.md](PLAN_agent_refusal_key_file_path.md)** (N10, rule C, 2026-11-12): that plan
changes the VALUE of the word after `-i` of `ssh:exec` (the key file of a call is named `call-<uuid>.key` by `materializeCallKey`),
and so of the three clicks of `commands/agentCommands.ts`, which share `resolveExecAuth`. It changes no flag, no option and no
environment, so its lines are disjoint from this plan's; either may go first.
W2 (PLAN_ssh_exec_absolute_program.md):
**Boundary with [PLAN_agent_refusal_key_file_path.md](PLAN_agent_refusal_key_file_path.md)** (N10, rule C, 2026-11-12): that plan
changes the VALUE of the word after `-i` of `ssh:exec` (the key file of a call is named `call-<uuid>.key`), and the key path stays
absolute, so a `cwd` changes nothing for it. It changes no program and no spawn, so its lines are disjoint from this plan's. After
this plan an error of the start names an absolute program, which is not a path of the keys folder.
W3 (PLAN_askpass_answers_the_hop.md):
**Boundary with [PLAN_agent_refusal_key_file_path.md](PLAN_agent_refusal_key_file_path.md)** (N10, rule C, 2026-11-12): that plan
changes `byStoredKey` (`sshExecAuth.ts:156-167`) and one import of the same file; this plan changes `byPassword` (`:78-101`) and
`sshAskpass.ts`: disjoint lines, and the askpass script keeps its fixed name. If this plan writes a file for a hop on the agent's
road (a key of the hop, a per-call configuration), its name comes from `callKeyName()`: no id of an entry. Whichever merges second
reads `sshExecAuth.ts` again.
```

If, when E1.2 starts, a branch or a session has opened one of the three: do not write its row; tell the lead (the parent's §9).

### 4. The closing checks (the parent's §5 step 8, §12)

Commands 1, 3, 4, 5, 6, 7 of *Commands* in `src_vs_code`, then 8, 9 and 10 from the root, on the staged tree of c3. `tsc` exits 0
before any test result is read; `npm test` is green; `npm run contract` leaves `contract/` with no difference; command 10 is empty;
`plan-lifecycle.mjs` says clean; `pin-check.mjs` passes. Also: `git diff --stat 6dd96fe7 -- todo/PLAN_remote_bridge_scoped.md
todo/PLAN_remote_bridge_scoped_E1_S3_spec.md` is empty, and the `.ts` part of c3 is comment lines only.

**Commit c3:** `docs(agent): rule C — the comments, the changelog, the module documents and three boundary rows`.

### 5. Done when

- [ ] C4.1 to C4.4 are written; `grep -n "N10\|purge and the wipe" sshUseActions.ts materializedKeys.ts` gives 0 lines.
- [ ] The CHANGELOG entry agrees with the diff of c1 and carries the parent's §4.4 and the three commands of the person.
- [ ] The three places of `module_extension.md` and the three of `module_tests.md` are written; `grep -rn "keyEntityId>-"
      research/module_*.md` gives 0 lines; no sentence there describes something that does not run.
- [ ] The README and help counts were taken again and written into the summary.
- [ ] W1 to W3 are written; the two bridge files have no difference; the hand-over of the bridge rows is with the lead.
- [ ] The closing checks of §4 pass.

## The order of the commits, and what comes after E1.2

| # | Story | Commit |
|---|---|---|
| c0 | — | this document, its `todo/README.md` row and the link in the parent's `## Epics` (the lead commits) |
| c1 | E1.1 | `fix(agent): the key file of an agent's call has a random name, with no id of an entry (rule C)` — states 1 to 3 and the fix; the body quotes the RED record (spec §11) |
| c2 | E1.1 | `test(keys): unit rows of the call name and its writer (U1 to U3)` — with the "after" pass of G1 to G9 and the mutations |
| c3 | E1.2 | the comments, the documents, W1 to W3 |

**Before c1.** The lead's Opus review of this document and the spec. The parent's plan round reached `proceed` (session
`9f624efc`); the code round runs in that session if `status` shows it is of this repository and branch, otherwise the lead runs a
plan round here first. A finding that changes a planned step counts, when it is accepted, as a change of the parent: the second of
epoch 1, and the plan stops. A finding that this document can satisfy with no change of the parent is not such a change.

**After c3.** The lead runs the `coai` code round on the finished branch (three reviewers per provider; each finding resolved), the
Opus review of the whole diff, then opens the pull request. Its body has the parent's §4.4, the summary items of E1.1 point 6, the
README/help counts, which boundary rows were written (W1 to W3) and which were handed over (the two bridge rows, to whom), the
verdicts and the number of reviewers that answered. After the merge, the parent, the spec and this document are promoted together
(`planning-docs.md`): `IMPLEMENTED` with the deviations, `research/README.md`, and the three link cases, among them the links of W1
to W3 (`../research/`) and the two `../todo/` links of the module documents. **No release is part of this epic.** The extension
release that ships the fix needs the lead and the owner's word (the parent's §8, last item, and §12); until it ships, the defect is
live (the parent's §10, risk 8).

## Notes on the spec, as read on `42d7340d`

The spec was read against the code, line by line, for each `file:line` and each claim of its §1 to §13. Each fact F1 to F12 holds
on `42d7340d` (D1). The spec was not changed. These are the places where it is stale, inexact or tight:

1. **Stale: the ledger and the README row.** The status block says that the stories document *marks this story in the cornerstone
   ledger*, and note 5 says the ledger reads `0 of 1` and the row is owed. `42d7340d` did both: the parent's `:585` reads
   `Cornerstones: 1 of 1 — E1.1 (spec: …)`, and `todo/README.md:27` has the spec's row. This document changes neither.
2. **Stale: the parent's counts.** §3 says *the parent writes "11 sites in 9 files"*, and notes 1 and 2 ask for repairs. The parent
   now says `10 sites in 8 files` (its §4.1 row C5, §5 step 2) and `:7` and `:162` (§5 step 1, §6.3, §12). Nothing builds differently.
3. **Stale: F13.** `src_vs_code/node_modules` and `src_vs_code/out` exist now (made 2026-11-12 16:18). Command 1 of the spec is not
   needed; `npm run compile` first is still needed.
4. **Inexact: the `pinned` key.** §4.1 calls `'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY'` *the key of
   `test/hostKeyTrust.test.ts:26`*. That line holds the object `KEY: HostKey`, not a string; the string is `formatHostKey(KEY)`
   (`hostKeyPin.ts:101-103`), and `parseHostKey` accepts it (`hostKeyPin.ts:53`, `:56`, `:107-111`). Buildable as written.
5. **Tight: complexity.** Three functions land on 4, the limit: K5 (`??` two times, `?.` once), `e1Of` with `pinned`, and the runner
   of `bridgeLinksWorld.ts` with `printsKeyPath` (`world.hold?.()`, two ternaries). ESLint 10.13 counts `??` and `?.`
   (`node_modules/eslint/lib/rules/complexity.js:122`, `:144-153`). The spec gives the limit, but it names a helper only for the world
   of part C. Buildable; E1.1 point 2.
6. **Implicit: S2 in state 1.** S2's second assertion passes in `keyInstaller.ts` before C2 only through the definition at `:149`,
   because §2 counts any match followed by `(` as a call. Correct as written; a coder who makes the scan skip a definition makes S2
   red in state 1 (E1.1 point 1).
7. **Unverified by any test today: a 200 on the `rotate` and `run` doors with a borrowed key that works.** Part B answers 200 on
   `exec` only (`test/agentNamesOnlyViewable.test.ts:604-625`). By reading, the fixture proof holds on the two doors
   (`rotateAction.ts:187-190`, `:391`, `:478-484`; `agentUseActions.ts:425-448`); the spec already says that a P1 or P2 failure goes
   to the lead.
8. **Mutation 1 stages a file** (`git checkout <commit> -- <path>` writes the index). The spec's restore line restores both; E1.1
   point 4 says to stage nothing else meanwhile.

No `file:line` of the spec was found wrong, and no claim of its §2, §5 or §6 about what a test shows today was found false by
reading. Nothing was run for this check: no test, no compile.

## Notes for the lead

1. **The parent's §7 places the scan S1 *beside the keys-folder guard* in `module_tests.md`, and no such section exists there** (D4).
   E1.2 writes S1 into the new part C section and names the older guard of `keysDirPaths.test.ts` there. Judged: not a change (the
   place of a sentence in a document).
2. **E1.2 rewrites F7 text that c1 makes false**: `module_extension.md:6449-6451` and `module_tests.md:2410`, `:2411` (D3, D4). They
   are in the paragraph and the section that the parent's §7 names. Judged: not a change; without them the documents say *not built*
   about a thing that ships.
3. **Comments outside C4's list say the same false thing as N12** (*the file name is how the purge and the wipe find it again*):
   `test/materializedKeys.test.ts:76-77` and `test/keyInstaller.test.ts:331-332`. And `materializedKeys.ts:57-58`, `:102-103` and
   `test/keysDirPaths.test.ts:10-11` say that every name in the keys folder is built from vault data; that was not exact before E1
   (`askpass.sh`, `agent.sock`), and it errs on the safe side. E1.2 does not touch them. The lead decides whether C4 (*comments that
   are false, or become false*) covers the two test comments; in doubt, leave them.
4. **The three W rows are written in this branch** because no session owns those plans (D7). If the lead knows of a session that
   does, the row goes to it instead (the parent's §9).
5. **CI runs `npm run ratchet`** (D8), which the parent's §5 step 8 does not list. E1 changes neither file of its baseline; this
   document runs it in the closing checks. Judged: not a change.
6. **`node_modules` and `out` were made at 16:18 today in this worktree** with a clean tree. If that was not the lead, check that
   no second build of E1.1 runs in this worktree.
