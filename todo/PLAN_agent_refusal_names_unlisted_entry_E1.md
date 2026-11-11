# PLAN — An agent's refusal never names an unlisted entry, E1: rule A, the addressed node

> Status: **stories written 2026-11-11; nothing built yet.** Stories of epic E1 of
> [PLAN_agent_refusal_names_unlisted_entry.md](PLAN_agent_refusal_names_unlisted_entry.md) (its §2.2 to §2.6, §3.1 rows
> A1 to A6, §3.2, §3.4, §4 steps 1 to 8, §5.1, §5.3 to §5.8, §6, §7a, §10 and `## Epics` E1).
>
> Scope: `src_vs_code/src` (`mcpEntries.ts`, `mcpFolders.ts`, `agentUseActions.ts`, three comments in
> `brokerRequests.ts`, their tests, two new test files, two test worlds), `src_vs_code/scripts` (the `creds-mcp`
> harness), `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md`, `todo/README.md`,
> and one boundary row in six neighbour plans. Branch `fix/agent-refusal-names-unlisted-entry`. The epic has one code
> round and one pull request. Each `file:line` below was read on `bf39ea05`.

**Committed together with this document:** its row in `todo/README.md` under *Currently open*, the link in the
parent's E1 epic, and the parent's ledger line, which now reads `Cornerstones: 1 of 1 — E1.1`. This document keeps
no change ledger: a change of it is an entry in the parent (`plan-change-control.md`).

Paths are relative to `src_vs_code/src/` unless they start with another folder. A path that starts with `scripts/`
is in `src_vs_code/`. "The parent" is the plan that this
document links above. A row name such as L1, G5, C-A, H3 or A4 is the parent's (§3.1, §5.3, §5.4, §5.7). A row name
that starts with X is this document's own.

## What E1 builds, in one paragraph

An agent sends an id. When the agent may not view the node of that id, the window answers as it answers for an id
that does not exist. This is rule A of the parent (§2.2). It is applied in the two lookups (`findUsableEntry`,
`findFolder`) and in the destination test of a move (`moveRefusal`), and nowhere else. E1 also adds the shared
question `agentMayView`, which epic 2 uses. A class test (part A) reads every route of the broker contract and
proves the rule at the door. Six harness checks prove it through the real `creds-mcp` binary with one window and
with two windows. No route, no error code, no status, no body shape and no tool description changes
(parent §3.4).

## Stories, and who writes what

| Story | Area | Scenarios and brief | Code and tests | Review |
|---|---|---|---|---|
| **E1.1 — cornerstone, `model: fable` on its spec** | Rule A at the two lookups: the fixture, part A of the class test, `agentMayView`, the entry lookup, the folder lookup, the move destination, the journal reason of a linked run, the comments that become false | Fable: the E1.1 section of this document | Sonnet | Opus; the security judgement (authorisation: what an agent may see) is Fable's, at review, outside the quota |
| E1.2 | The harness: H1 to H6 with the real `creds-mcp`, and guard G8 | this document | Sonnet | Opus |
| E1.3 | The documents, the six neighbour rows, the CHANGELOG entry, the closing checks | this document | Sonnet | Opus |

**Why E1.1 is the one cornerstone.** The parent names one area for the whole plan: the two lookups, the shared
predicate and part A of the class test. A mistake there is a name that leaves the vault through a call that passes
every other test. E1.1 holds that area complete, so one mark covers it, and the quota of 1 is used.

**Who wrote this document.** A Fable session wrote it (the trailer of its commit names the model). So the E1.1
section below is the cornerstone's spec, and no second spec file is necessary. If the lead orders a separate spec
file, its name is `todo/PLAN_agent_refusal_names_unlisted_entry_E1_S1_spec.md`, and it gets its own
`todo/README.md` row in the commit that makes it.

**Why three stories and not four.** The parent's build order is binding: part A is written before any fix (step 1),
the RED rows are watched before the fix (step 2), and G5 is red between A1 and A4 (step 4). A commit must be green
(`git-workflow.md`, rule 2). So part A, the three lookup fixes and A4 can only be one green commit. To cut that
commit into an entry story and a folder story would leave part A's folder rows red at the end of the first one.

## Binding constraints, for every story

- **The order of work is the parent's §4, steps 1 to 8.** A story does not change that order. If a step cannot be
  done as written, stop and tell the lead: a changed order is a plan change, and the lead counts it.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first. A test that names a
  symbol that does not exist does not compile. So a new symbol is added first as a no-op, and then its test is
  written and watched failing. Read the exit of `tsc` before any test result.
- **Keep what the runner printed.** For each RED row, save the failure text in the scratchpad folder of the session.
  Quote one failure and the pass in the commit body, and give the whole list to the lead.
- **A commit is green.** `npm run compile`, `npm run lint` and `npm test` pass on the staged tree before each commit.
  The RED states exist in the working tree only.
- **Stage by path, read `git diff --staged --stat`, commit only your own files.** A plan file of a neighbour can be
  open in another session: stage that file by hunk (`git add -p`), never whole. Do not push; the lead pushes.
- **Size limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): a file has at most 800 lines (each line counts), a
  function at most 50 code lines (120 in `src/test/`), complexity at most 4 (also in tests). **No new
  `eslint-disable`.** An unused disable is an error. Budget:

  | File | Lines on `bf39ea05` | After, at most |
  |---|---|---|
  | `mcpEntries.ts` | 563 | 585 |
  | `mcpFolders.ts` | 299 | 299 |
  | `agentUseActions.ts` | 672 | 680 |
  | `test/mcpEntries.test.ts` | 617 | 740 |
  | `test/agentSshGate.test.ts` | 734 | 770 |
  | `test/mcpFolders.test.ts` | 223 | 300 |
  | `test/mcpHooks.test.ts` | 321 | 350 |
  | `test/brokerWorld.ts` | 672 | 690 |
  | `test/bridgeWallWorld.ts` | 588 | 600 |
  | `test/unlistedWorld.ts` (new) | — | 400 |
  | `test/agentNamesOnlyViewable.test.ts` (new) | — | 700 |

  A file that passes its budget moves code into a new helper file with one job. It does not ask for more lines.
  `credsAgentServer.ts` (795 of 800), `extension.ts` and `storageManager.ts` (the two files of
  `.size-baseline.json`) are not touched.
- **`tsconfig.json` has `noUnusedLocals`.** A helper or an import that loses its last reader is removed in the same
  edit (`isFolder` and `isTrashy` in `mcpFolders.ts`; the `UsableEntry` import in `agentUseActions.ts`).
- **Pure modules import no `vscode`.** `mcpEntries.ts` and `mcpFolders.ts` stay pure. A test loads `mcpHooks.ts` and
  `mcpFolderHooks.ts` through `loadWithVscode` (`test/vscodeStub.ts:16`), because they import `storageManager.ts`.
- **Nothing in `contract/`, `src_mcp`, `src_cli` or `src_broker_client` changes.** `npm run contract` leaves no
  difference.
- **Node only.** No Python, also not for a helper script.
- **A leak that the parent does not name.** If part A's first run shows a leak that is not in the parent's §3.1 and
  has the shape of rule A, give it a row and record it as a deviation. A leak of another shape stops the work (the
  parent's §4, step 1).

## Facts read on `bf39ea05` that the stories use

The parent's references to the code are correct, with one line that is off by one (the last row). These are the
facts that the parent does not give and that a coder needs.

| # | Fact | Where |
|---|---|---|
| F1 | A helper already lists every route of the contract: `contractRoutes(contract)` (35 routes today, `health` included), `strayRoutes`, `unnamedRoutes`. Part A uses it. It does not write a second list | `test/contractRoutes.ts:33-68`; its user is `test/bridgeAllowList.test.ts:14` |
| F2 | `hooksFor` writes `mcpCreate: createFor(...)` after it spreads `options.hooks`. So a real create hook that a test passes in `hooks` is replaced. The world needs one new option | `test/brokerWorld.ts:336-354`, `:348`; the same reason is written for `mcpResolve` at `:146-153` |
| F3 | The world's list of entries is a fixed array. A test gives it `await visibleMcpEntries(source)`, as the wall world does | `test/brokerWorld.ts:344`, `:472-476`; `test/bridgeWallWorld.ts:379` |
| F4 | `folderHooks(storage, onMutated)` and `chooseCreateTarget(storage, body)` take a `StorageManager`. For a refusal they read only `getAccounts`, `getNodes` and `getNode` | `mcpFolderHooks.ts:24-31`; `mcpHooks.ts:98-104` |
| F5 | `chooseTarget` reads the sent folder name only when a folder is open for creating. With no such folder it answers one sentence before it reads the name | `mcpCreate.ts:139-150`, `:181-204` |
| F6 | The answer for a folder id that is not found repeats the id that was sent | `mcpFolderHooks.ts:89` |
| F7 | A lookup refusal comes before the throttle; a refused creation writes a journal line only for `noGenerator` | `brokerMcpDoor.ts:210-214`, `:288-292`, `:379-384`, `:404-421`; `brokerFolderDoor.ts:137-141` |
| F8 | `sshLinkOf` reads the SSH node one time, then the gate's lookup reads it again. `validate` of `terminalRunAction` runs the gate one time and writes the note | `remoteLaunch.ts:89-97`; `agentUseActions.ts:235-238`, `:307-314`, `:465` |
| F9 | `findUsableEntry` and `findFolder` go on to the next account when one account answers nothing | `mcpEntries.ts:349-355`; `mcpFolders.ts:138-144` |
| F10 | `climb` turns on `view` for each entry rung and for each folder rung. So a usable node always has `view` | `mcpAccess.ts:249-256` |
| F11 | `creds-mcp` reads `window-*.json`, newest `startedAt` first, and does not join two files of one process id. A window writes `window-<pid>.json` | `src_broker_client/src/Endpoints.cs:90`, `:149`; `cliEndpoint.ts:51-53` |
| F12 | The harness prints `SKIP` and exits 0 when the binary is not built. CI builds the binary and runs the harness | `scripts/creds-mcp-itest.cjs:759-763`; `.github/workflows/ci-extension.yml:132-136` |
| F13 | The test that the parent's A6 and §5.5 give as `mcpFolders.test.ts:193` starts at line 194 | `test/mcpFolders.test.ts:194-198` |

## Commands

The worktree has no `src_vs_code/node_modules`. Install once. Run each command through the project's lowered
priority (the `npm` scripts do it themselves; for `dotnet`, use the wrapper).

In `src_vs_code`:

1. `npm ci`
2. `npm run compile` — read its exit first.
3. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
4. `npm run lint`
5. `npm run typecheck`
6. `npm test` — the full suite.
7. `npm run contract`, then `git diff --exit-code -- ../contract` (no difference).
8. `npm run ratchet`
9. `npm run itest:mcp` — after the binary is built (below).

In the repository root (`LP=.agents/conventions/tools/low-priority.mjs`):

10. `node $LP dotnet build src_mcp/src/CredsMcp.csproj -c Debug -m:4 --disable-build-servers` — the harness reads
    `src_mcp/src/bin/Debug/net10.0/creds-mcp` (`scripts/mcpBinary.cjs:21-34`).
11. `node $LP dotnet build src_mcp/tests/CredsMcp.Tests.csproj -c Debug -m:4 --disable-build-servers`, then
    `node $LP ./src_mcp/tests/bin/Debug/net10.0/CredsMcp.Tests --filter-class "*WindowsTests"` (guard G8).
12. `node .agents/conventions/tools/plan-lifecycle.mjs` and `node .agents/conventions/tools/pin-check.mjs`.
13. The leftovers guard, for a new file under `scripts/`:
    `node .agents/conventions/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"`

`npm test` needs the shared-rules mount. It is there in this worktree: the submodule `.agents/conventions` is at the
pinned commit and has its modules.

**Can `creds-mcp` be built here?** Checked on 2026-11-11: `dotnet` 10.0.114 is on this machine and `global.json`
accepts it; the main checkout holds a built `creds-mcp` at the same path. The build was NOT run for this document.
If the build fails in the worktree, E1.2 says so and names who runs the harness before the release (the parent's
§10).

## E1.1 — rule A at the two lookups (cornerstone, `model: fable`)

### 1. Files and functions

| File | Function or thing | Change |
|---|---|---|
| `test/unlistedWorld.ts` (new, not a suite) | the fixture vault, the lists of hidden names and hidden ids | new |
| `test/agentNamesOnlyViewable.test.ts` (new) | part A of the class test | new |
| `test/brokerWorld.ts:182-183`, `:348` | one new option `mcpCreateReal?: McpCreateHooks`, read before `create` | F2 |
| `test/bridgeWallWorld.ts:153-155`, `:237`, `:317` | `x` gets a fourth value, `'unseen'`: the entry `x` in a folder that has no switch | for the bridge row |
| `mcpEntries.ts:380-391` | `lookedUp` | A1 |
| `mcpEntries.ts:422-436` | `verdictFor` | A1 |
| `mcpEntries.ts` (new export, after `shown` at `:278-280`) | `agentMayView` | A5 |
| `mcpFolders.ts:132-145` | `findFolder` | A2 |
| `mcpFolders.ts:172-176`, `:191-220`, `:257-265` | `MoveRefusal`, `moveRefusal`, `firstRefusal`, `isFolder`, `isTrashy`, `describeMoveRefusal` | A3 |
| `agentUseActions.ts:230-238` | `whyUnusable`, `usableGate` | A4 |
| `brokerRequests.ts:85-92`, `:186-190`, `:203-208`; `mcpEntries.ts:316-325`, `:373-379`; `test/mcpFolders.test.ts:194`; `test/agentSshGate.test.ts:676` | comments, one test name, one assertion message | A6 |
| `test/mcpEntries.test.ts`, `test/mcpHooks.test.ts`, `test/mcpFolders.test.ts`, `test/agentSshGate.test.ts` | rows L1 to L7, G3, G4, G7, X1, X2, and the four changed tests | below |

### 2. The fixture, `test/unlistedWorld.ts`

One account, `a1`, as a plain `McpVaultSource` (the shape of `vaultOf`, `test/bridgeWallWorld.ts:171-181`). Each
node has an id of its own and the name `MARK-<id>`. The file exports the source, the list of hidden names, the
list of hidden ids, and the ids by role. The hooks that are typed `StorageManager` get the source through one cast
(F4), with a comment that says why, as `test/agentSshWorld.ts:226-228` does.

Nodes that the agent may NOT view (the parent's §5):

| Role | Node |
|---|---|
| entry, no switch | in a folder that has no switch |
| entry, explicit empty answer | `mcp: {}`, in a folder with `view` on |
| entry, in the Trash | each switch on |
| entry, PIN | `pinProtected: true`, each switch on |
| entry, config | `isConfig: true`, no switch |
| folder, no switch | at the root |
| folder, explicit empty answer | `mcp: {}`, under a folder with `view` on |
| folder, in the Trash | each switch on |
| folder, the Trash | `isTrash: true` |

Nodes that the agent may view:

| Role | Node |
|---|---|
| entry, `view` only | takes `view` from its folder (the positive control) |
| entry, `use` | `mcp: { use: true }`, kind `ssh`, so that the world's scripted `exec` serves it |
| entry, own-only delete | `mcp: { delete: 'own' }`, made by a person |
| folder, `view` only | `mcp: { view: true }` |
| folder, `folderEdit` | `mcp: { folderEdit: true }`, with one child folder that moves in the move rows |
| folder, `create` | `mcp: { create: true }`. **This node is not in the parent's list.** Without it the create row stops before it reads the name (F5) |
| N1 | a visible entry whose `dependsOn` holds the id of the hidden entry with no switch |
| N4 | a visible entry with `mcp: { view: true }` of its own, in the hidden folder with no switch |
| N5 | a visible Terminal entry whose `command` holds `creds://<account>/<the name of the hidden entry with no switch>/password` |
| N6 | a visible folder with `mcp: { view: true }` of its own, under the hidden folder with no switch |

**Proofs at load** (a fixture that the code declines for another reason proves nothing):

1. `visibleMcpEntries` gives exactly the visible entries; `visibleFolders` gives exactly the visible folders.
2. No hidden name and no hidden id is a part of a visible name, of a visible id or of another marker.
3. `madeUp(id)` gives an id of the same length that is not in the vault (the last character changed).

### 3. Part A of the class test, `test/agentNamesOnlyViewable.test.ts`

**The world.** `world` of `test/brokerWorld.ts` with:

- `mcpResolve`: the real `mcpUseLookup` over the fixture, in a wrapper that only counts its calls;
- `server.setFolderHooks(...)`: the real `folderHooks` over the fixture; its `choose` in a wrapper that only counts;
- `mcpCreateReal`: the real `mcpCreateHooks` over the fixture (only `choose` is reached);
- `visibleConfig`: `(id) => visibleConfigDetails(source, id)`, in a wrapper that only counts;
- `mcpEntries`: `await visibleMcpEntries(source)`.

**The route table.** One row for each route that `contractRoutes(contract)` gives (F1), and two rows more.

| Row | Request | What is compared |
|---|---|---|
| `POST /v1/mcp/use/<action>`, each of the eight `mcpActions` | body `{ entry: <id>, command: 'id' }` | each hidden entry against its made-up id |
| `POST /v1/mcp/use/frobnicate` (a row more: a verb that is not in the list) | the same | the same |
| `POST /v1/mcp/delete` | body `{ entry: <id> }` | the same |
| `POST /v1/mcp/folder/create` | body `{ parent: <id>, name: 'x' }` | each hidden folder against its made-up id |
| `POST /v1/mcp/folder/edit` | body `{ folder: <id>, name: 'x' }` | the same |
| `POST /v1/mcp/folder/edit`, a move (a row more on the same route) | body `{ folder: <the child of the folderEdit folder>, parent: <id> }` | each hidden folder as destination against its made-up id, and against the id of an entry |
| `POST /v1/mcp/folder/delete` | body `{ folder: <id> }` | each hidden folder against its made-up id |
| `POST /v1/mcp/create` | body `{ name: 'x', kind: 'ssh', folder: <NAME> }` | the name of each hidden folder against a made-up name of the same length |
| `GET /v1/mcp/config-snippet?id=<id>&language=shell` | — | the hidden config entry against its made-up id |
| `GET /v1/mcp/entries`, `GET /v1/mcp/folders` | — | the list check |
| the 19 other routes of the contract (`/v1/health`, `/v1/aliases`, `/v1/mcp/kinds`, `/v1/mcp/kind-help`, `/v1/config/read`, seven `/v1/use/<action>`, seven `/v1/alias/<action>`) | — | on the written list *takes no node id*, each with its reason (a kind, an alias name, a config key, a grant token, nothing) |

**What "the same answer" means in the test**, for each pair (the parent's §2.4):

1. The status is equal.
2. The body is deep-equal after the value that the request sent (the id or the name) is replaced by `<SENT>` (F6).
3. The two raw bodies have the same length in bytes.
4. The body holds no hidden name and no hidden id, after the same replacement.
5. No dialog was raised (`w.dialogs` did not grow).
6. The journal lines that the two calls added (`w.audit`) are equal after the same replacement. For a lookup route
   there is none (F7).

A row collects each pair that fails and fails one time, with the list. So the first run prints the list of leaks.

**The exact answers after the fix** (the parent's §2.3; none is a new sentence):

| Case | Status | `error.code` | `error.message` |
|---|---|---|---|
| A-entry | 404 | `not_found` | `No such entry, or this window does not serve it.` |
| A-folder | 404 | `not_found` | `No folder with id "<the id that was sent>" is open to you. Call creds_folders again.` |
| A-move | 403 | `denied` | `"<name of the folder that was to move>" was not moved: there is no folder with that id.` |
| create, a folder name that is not open | 403 | `denied` | `"<the name that was sent>" is not open to agents for creating entries. The ones that are: "<name of the create folder>".` |
| config snippet (this route answers 200 always, `brokerReadRoutes.ts:105-116`) | 200 | — | body `{ error: 'no such config is open to agents', envVar, languages: [] }` |

The body of a refusal is `{ error: { code, message } }` (`brokerProtocol.ts:66-79`).

**The list check.** The two list answers are read one time. A constant holds the four exceptions, each with its
number and its reason (the parent's §2.6):

| # | List | Field | The value that is there today |
|---|---|---|---|
| N1 | entries | `dependsOn` of the N1 entry | the hidden dependency's NAME |
| N4 | entries | `folder` of the N4 entry | the hidden folder's NAME |
| N5 | entries | `command` of the N5 entry | the reference text, with the hidden entry's NAME in it |
| N6 | folders | `parent` of the N6 folder | the hidden parent's ID |

The test (a) asserts that the constant names exactly these four `list.field` pairs, by a literal list; (b) asserts
each value as it is today; (c) removes exactly those four values; (d) asserts that no hidden name and no hidden id
is left in the two bodies.

**Completeness** (the test must not become empty):

1. `unnamedRoutes(contract, <the paths of the table>)` is empty; `strayRoutes(contract)` is empty. A route with no
   row fails, with the route.
2. Each of the five lookups was reached: the count of the `mcpResolve` wrapper, of the `choose` wrapper and of the
   `visibleConfig` wrapper is above 0 after their rows; `moveRefusal` is proved by control (b) below; `chooseTarget`
   is proved by the create row's sentence, which only `describeChoice` makes.
3. The `/v1/mcp/` paths of `contractRoutes(contract)` are the same set as the `/v1/mcp/` paths of `BRIDGE_ROUTES`
   (`bridgeAllowList.ts:91-96`): 18 today.
4. Positive controls, on the same fixture:
   (a) `exec` on the entry with `view` only answers 403 `denied`, and the message holds its name and
   `Usable by agents`;
   (b) a move to the folder with `view` only answers 403 with `that destination is not open to agents`;
   (c) after each row above has run, `exec` on the entry with `use` raises one dialog and answers 200. This shows
   that the refused lookups took no throttle slot (a window gives five prompts in a minute).

**One row on a Remote Bridge** (`wallWorld({ x: 'unseen', scope: ['e1', 'x'] })`, through `viaBridge`): `POST
/v1/mcp/use/exec` for `x` (in scope, not visible) is deep-equal, after `normalised`, to the same call for `e2` (it
exists and is out of scope) and for a made-up id. No dialog; `ww.w.ran` is empty.

### 4. RED rows (each one watched failing by its assertion on the unchanged code, then passing)

| Row | File | Scenario | Fails today with | After |
|---|---|---|---|---|
| C-A | part A | the entry rows (10) with the four hidden entries that have no PIN; the three folder rows with the four hidden folders; the move row with the four hidden folders; the bridge row | 403 `denied` with a marker, for example `"MARK-<id>" is not open to agents for that. Turn on "Usable by agents" in its Agent access section.`, against 404 `not_found`; for a move, `that destination is not open to agents…` or `the Trash is not a destination…` against `there is no folder with that id` | each pair equal |
| L1 | `mcpEntries.test.ts` | `findUsableEntry(source, id, action)` for the four hidden entries with no PIN, for `exec`, `rotate`, `delete` and `frobnicate` | `{ kind: 'closed', … }` is not `undefined` | `undefined` |
| L2 | `mcpHooks.test.ts` | `mcpUseLookup` (loaded with `loadWithVscode`) on the same | `{ kind: 'closed', entityName: 'MARK-…', needed: … }` | `undefined` |
| L3 | `mcpFolders.test.ts` | `findFolder` on the four hidden folders, for `create`, `edit`, `delete` and `rename` | `{ kind: 'closed', … }` | `undefined` |
| L4 | `mcpFolders.test.ts` | `moveRefusal` to the folder with no switch, and to the folder with `mcp: {}` | `'destination_closed'` | `'no_such_destination'` |
| L5 | `mcpFolders.test.ts` | `moveRefusal` to the Trash, and to the folder in the Trash | `'into_the_trash'` | `'no_such_destination'` |
| L6 | `agentSshGate.test.ts` | `gateWorld({ storage })` with a storage that holds the Terminal entry `e1` as usual, and answers the SSH node `s1` at its first read and nothing at each later read of `s1` (F8); `terminalRunAction(w.deps).validate({}, w.ctx)` one time | the one note is `journalLine('deploy', 'the SSH entry is hidden from agents (PIN) or is not in this account')` | the one note is `journalLine('deploy', 'the SSH entry is not in this account')`; it does not hold `PIN`; the agent's message is `linkedRunRefused('deploy')`, code `denied` |
| L7 | `mcpEntries.test.ts` | `agentMayView(source, 'a1', id)` for an entry with no switch of its own: in a folder with `view` on; in a folder with no switch; with a PIN; in the Trash; and with the id of an entry that only another account holds | the no-op answers `false` for the first case | `true` for the first case, `false` for the four others |
| X1 | `mcpEntries.test.ts` | two accounts hold the same id: the first hides it (no switch), the second has `use` on. `findUsableEntry(source, id, 'exec')` | `closed`, with the node of the first account | `usable`, with the `accountId` of the second account (F9) |
| X2 | `mcpFolders.test.ts` | the same for `findFolder` with `edit`: the first account hides the folder, the second has `folderEdit` on | `closed` | `usable`, second account |

X1 and X2 are the twins, inside one window, of the harness check H6. They pin what F9 gives: a hidden node in one
account does not stop the search in the next account, as an id that the first account does not hold does not stop
it. The parent's risk 5 names this for two windows only.

For L7, add the export first as a no-op: the real signature, with a body that returns `false`. `npm run typecheck`
is clean. Then write L7 and watch it fail.

### 5. The fix

**A5, `mcpEntries.ts`.**
`export function agentMayView(source: Pick<McpVaultSource, 'getNode'>, accountId: string, entityId: string): boolean`.
It reads the node in THAT account only. It resolves the tree with a lookup that is bound to that account
(`(id) => source.getNode(accountId, id)`). It answers `shown(node, resolved)`. A missing node answers `false`. It has
no reader in E1; epic 2 is its first reader. Its docblock says so, and says that it is the list's own question.

**A1, `mcpEntries.ts`.** `verdictFor` resolves one time (`resolveMcpInTree(node, byId)`), then asks
`shown(node, resolved)` before the rung. Not shown: `undefined`. Shown: as today, with `resolved.access` in the
usable arm. `lookedUp` keeps only the test for a missing node; the entity test and the PIN test of `:387` are inside
`shown` now. No sentence changes: `refusalFor` (`brokerRequests.ts:209-217`) and `mcpUseLookup` (`mcpHooks.ts:157-163`)
are not edited.

**A2, `mcpFolders.ts`.** In `findFolder`, a node is taken only when `isOpenFolder(node, <the lookup of that
account>)` is true; then `verdictFor` as today. Else the loop goes on, and the end is `undefined`.
`mcpFolderHooks.ts` is not edited: a folder that is not open takes the `not_found` branch at `:88-90`.

**A3, `mcpFolders.ts`.** In `moveRefusal`, a destination that is missing, is not a folder, or is not
`isOpenFolder` gives `'no_such_destination'`. `firstRefusal` keeps two checks, in this order: `into_itself`, then
`destination_closed`. The variant `'into_the_trash'` leaves the type `MoveRefusal`; its sentence leaves
`describeMoveRefusal`; `isTrashy` and `isFolder` are removed. `isOpenFolder` stays private.

**A4, `agentUseActions.ts`.** First watch G5 red with A1 alone (the note for `unmarkedSsh()` then says
`hidden from agents (PIN) or is not in this account`, and the test asks for `Usable by agents`). Then:
`whyUnusable` takes the SSH entry's NODE, not the verdict. `usableGate` reads that node one more time, with
`deps.storage.getNode(target.accountId, link.ssh.id)`, and only when the lookup did not answer `usable`. Three
causes, three sentences:

| The node | The journal reason (`why`) |
|---|---|
| missing | `the SSH entry is not in this account` |
| `hiddenFromAgents(node)` | `the SSH entry is hidden from agents (PIN)` |
| any other | `the SSH entry's "Usable by agents" switch is off` (not changed) |

Nothing that the agent reads changes: the code stays `denied`, the message stays `linkedRunRefused(<Terminal
entry>)`. The read is in the Terminal entry's account only.

**A6, comments and names that become false** (the same commit as the code that makes them false):

| Where | Says today | Must say |
|---|---|---|
| `brokerRequests.ts:85-92` | *present but closed … collapsing it into "not found"* | `closed` is for an entry that the agent may view; a node that it may not view and an id that does not exist get one answer |
| `brokerRequests.ts:203-208` | *an entry id is a uuid nobody enumerates* | the switch is named only for an entry that is in the agent's list |
| `brokerRequests.ts:186-190` (the docblock of `aliasTarget`; not in the parent's A6, the same claim) | *the distinction `refusalFor` makes the other way for an entry id … nobody chooses a uuid* | the same rule |
| `mcpEntries.ts:316-325` | *an entry that exists and is closed* | an entry that the agent may view and may not use |
| `mcpEntries.ts:373-379` (the docblock of `lookedUp`; not in the parent's A6) | *a protected entry answers `undefined` … rather than `closed`* | each entry that is not shown answers `undefined`; the test is `shown`, in `verdictFor` |
| `test/mcpFolders.test.ts:194` (F13) | *a destination that is not a folder is told apart from one that is closed* | a missing destination and one that is not open get one answer; a visible closed one gets another |
| `test/agentSshGate.test.ts:676` | the message *no read of S beyond the gate's two* | no number in the message (a refusal now reads S three times); the assertion stays |

### 6. Guard rows (watched passing before and after)

| Row | File | What it guards |
|---|---|---|
| G1 | `mcpEntries.test.ts:345-361`, `:519-526` (not changed); positive control (a) | `view` on and `use` off keeps `closed` and the named refusal |
| G2 | `mcpEntries.test.ts:324-334` (not changed) | a person's entry under `delete: 'own'` stays `closed` |
| G3 | `mcpEntries.test.ts` (new) | each of `use`, `edit`, `create`, `delete: 'any'`, and `delete: 'own'` on an entry that an agent made, set alone: `use` → `exec` usable; `edit` → `rotate` usable; `create` → `exec` and `rotate` usable; the two delete cases → `delete` usable |
| G4 | `mcpFolders.test.ts:130-139` (not changed); the changed test of `:155-168` | `folderEdit` with no delete scope keeps `closed` for delete; a destination with `view` only keeps `destination_closed` |
| G5 | `agentSshGate.test.ts:237-251` (not changed) | the journal names the switch for an SSH entry with no switch. **Red after A1 alone, green after A4: watch both** |
| G6 | `agentSshGate.test.ts:253-266`, `:268-285` (not changed) | the journal says `hidden from agents (PIN)`; no read in another account |
| G7 | `mcpEntries.test.ts` (new, beside L1) | the hidden entry with a PIN answers `undefined` for the four actions, as today |
| — | `agentSshGate.test.ts:275`, `:284`, `:462`, `:676` (the parent's risk 6) | the read comparisons stay green; `:462` shows that a bridge still reads nothing |
| — | `bridgeScopeWalk.test.ts:228-247`; `bridgeScope.test.ts:314-358` | the `closed` entry of the wall world is in a folder with `view` on (`bridgeWallWorld.ts:128`, `:154`), so it stays `closed`; the second file uses scripted verdicts and reads no tree |

### 7. Existing tests that change (the parent's §5.5), in the same commit as the code

| Test | Change |
|---|---|
| `mcpFolders.test.ts:155-168` *a move needs the grant at BOTH ends* | the folder `closed` gets `mcp: { view: true }`; the answer stays `'destination_closed'` |
| `mcpFolders.test.ts:170-178` *a move into the Trash is refused* | the answer is `'no_such_destination'`; the name says that the Trash reads as no folder |
| `mcpFolders.test.ts:194-198` | the name changes (A6); the assertion stays |
| `mcpFolders.test.ts:200-206` *every refusal has a sentence* | its list loses `'into_the_trash'` (the compiler forces it) |

### 8. Mutation checks (each one must turn the named tests red; restore after each one)

| # | Mutation | Must go red |
|---|---|---|
| 1 | remove the `shown` test from `verdictFor` | L1, L2, X1, C-A |
| 2 | remove the `isOpenFolder` test from `findFolder` | L3, X2, C-A |
| 3 | remove the `isOpenFolder` test from `moveRefusal` | L4, L5, C-A |
| 6 | put `found === undefined` back in `whyUnusable` | G5, L6 |
| 7 | remove one row from part A's route table | completeness 1 |
| 8 | add a fifth pair to the constant of the list check | the list check's assertion (a) |
| M-a (this document's; it is the parent's mutation 4, whose other rows are epic 2's) | make `agentMayView` answer `true` | L7 |

### 9. Order of work, and the commits

1. The fixture, the two world options, part A. Run part A on the unchanged `src` code: it is RED. Save the list of
   leaks. Compare it with the row C-A above: 40 entry pairs (10 rows × 4 entries), 12 folder pairs, 4 move pairs, 1
   bridge row. The create row, the snippet row, the list check and the completeness tests are green today. A
   failure that is not in this list goes to the lead before any fix.
2. The no-op `agentMayView`. Then L1 to L7, X1, X2, G3, G7. Watch each RED row fail by its assertion.
3. A1, A2, A3, A5, the changed tests of §7, A6. G5 is red now: save its text.
4. A4. G5, G6 and L6 are green.
5. The mutation checks of §8.
6. `npm run compile`, `npm run lint`, `npm run typecheck`, the changed suites one by one, then `npm test`,
   `npm run contract` with no difference, `npm run ratchet`.

Commits:

- **c1 (optional, to make the work safe against a restart of the machine):** `test/unlistedWorld.ts`, the option in
  `test/brokerWorld.ts`, the value in `test/bridgeWallWorld.ts`. These files are not suites and change no behaviour,
  so the suite is green. Message: `test(agent): the unlisted-world fixture for rule A`.
- **c2:** the rest of E1.1, one commit. Message: `fix(agent): a lookup answers "not found" for an entry or a folder
  that the agent may not view`. Its body quotes one RED failure and the pass, the count of part A's first leak list,
  G5's red text, and the mutation results.

### 10. Done when

- [ ] Part A was written and run before any fix; its first failure list is saved and agrees with §9 step 1, or each
      difference went to the lead.
- [ ] C-A, L1 to L7, X1 and X2 were watched failing by their assertions, then pass. No RED proof is a compile error.
- [ ] G1 to G7 were watched passing before and after; G5 was watched red between A1 and A4.
- [ ] For an entry, a folder, a move destination and a config id that the agent may not view, the six items of
      §3 are equal to those of an id that does not exist, on each route that reads that id; the bridge row is green.
- [ ] The list check allows exactly the four pairs, asserts each value as it is today, and finds no other hidden
      name or hidden id.
- [ ] Mutations 1, 2, 3, 6, 7, 8 and M-a each turned their tests red, and the code was restored.
- [ ] The comments, the test name and the message of A6 are changed.
- [ ] `git diff --stat bf39ea05 -- contract src_mcp src_cli src_broker_client` is empty; `mcpHooks.ts`,
      `mcpFolderHooks.ts`, `brokerRequests.ts` (code), `bridgeScope.ts` and `credsAgentServer.ts` have no code change.
- [ ] The budgets of the size table hold; `npm run lint` is clean with no new `eslint-disable`; `npm test` is green.

## E1.2 — the harness: one window and two windows, through the real `creds-mcp`

**Depends on** E1.1 (c2).

### Files

| File | Change |
|---|---|
| `src_vs_code/scripts/creds-mcp-itest.cjs` (1516 lines) | H1 and H2 in its folder level (`:1273-1402`); one `require` and one call for the new leg, beside `quietLeg()` (`:1506-1509`). At most 45 lines more |
| `src_vs_code/scripts/lib/mcpTwoWindowsLeg.cjs` (new) | the leg of H3 to H6, as a function that gets what it needs from the caller (`speak`, `check`, `HANDSHAKE`, `consent`, `brokerDir`, `plainDir`, `memento`, `secretStore`, and the loaded `CredsAgentServer`, `UseActionRegistry`, `StorageManager`, `mcpUseHooks`). It makes no folder by itself |

The big script is over the family's 800 lines from before; so the new leg goes into a file of its own, and the big
script grows by the two small checks and the call only.

### H1 and H2 (one window; the real `StorageManager` and the real `folderHooks`, `:1283-1311`)

- **H1.** `creds_edit_folder` with `{ folder: 'f-shut', name: 'x' }` gives the same text as with
  `{ folder: 'f-nope', name: 'x' }`. The text is `No CredsForDevs window answered.` with the hint `The folder id may
  be stale — call creds_folders again.` (`src_mcp/src/FolderTools.cs:158-165`). The text does not hold `Private` (the
  name of `f-shut`). Nobody was asked.
- **H2.** The move of scenario 4 (`:1383-1402`, `parent: 'f-shut'`) gives the same text as the same move with
  `parent: 'f-nope'`: `"staging" was not moved: there is no folder with that id.` with the hint of `denied`. The
  three checks of scenario 4 stay as they are. Nothing moved; nobody was asked.

### H3 to H6 (two windows; the new leg)

**Setup.** Two `CredsAgentServer` windows, each with its own broker folder, its own real `StorageManager`, and
`resolveMcpUse` from the real `mcpUseHooks` over its own tree (the pattern of `quietLeg`, `:430-486`), in a wrapper
that only counts its calls. Each window registers a `db` `query` stub whose output says which window ran it.

| Tree | Holds |
|---|---|
| the NEWER window | `e-x` (no switch); `e-view` in a folder with `view` on and `use` off; `e-both` (no switch), with a marker name |
| the OLDER window | `e-both` in a folder with `view` and `use` on, with another name; it does not hold `e-x` or `e-view` |

**Two discovery files (F11).** The two windows are in one process, so each one writes `window-<the same pid>.json`
in its own folder. The leg makes a third folder (`plainDir`), and copies the two announcements into it as
`window-new.json` and `window-old.json`, with `startedAt` of the newer one later than that of the older one. The
binary gets that folder as `CREDS_ENDPOINT_DIR`. **Before H3 the leg asserts** that the folder holds two files with
two different ports, and that each port answers `GET /v1/health` with the service name.

| Check | Call | Must be true |
|---|---|---|
| H3, hidden and missing | `creds_query` on `e-x` | the text is `No CredsForDevs window answered for that entry.` with `The entry id may be stale — call creds_list again.` (`src_mcp/src/UseTools.cs:277-284`); each window's lookup was called one time; nobody was asked |
| H4, missing in both | `creds_query` on `e-nope` | the same text as H3, byte for byte; the same two counts |
| H5, a visible denial | `creds_query` on `e-view` | the text holds the entry's name and `Usable by agents`; the newer window's lookup was called one time; the older window's lookup was NOT called |
| H6, the walk goes on | `creds_query` on `e-both`, with one `Allow` ready | the answer is the OLDER window's output; each lookup was called one time; one dialog was raised, and it names the older window's entry; the answer and the dialog hold nothing of the newer window (not its marker name) |

The counts are set to 0 before each check. The leg ends with the assertion that it contributed each check that it
owns (the pattern of `EXPECTED_QUIET_CHECKS`, `:404`, `:580-583`), and it disposes the two windows in a `finally`.

### RED proof, by mutation (the fix is committed before this story)

| Mutation in `src`, then `npm run itest:mcp` | Must fail |
|---|---|
| 2 (no `isOpenFolder` test in `findFolder`) | H1 |
| 3 (no `isOpenFolder` test in `moveRefusal`) | H2 |
| 1 (no `shown` test in `verdictFor`) | H3 (the text names `e-x`'s entry) and H6 (the newer window's `denied` stops the walk; the older lookup count is 0) |

H4 and H5 are guards: green with and without each mutation. Restore the code after each run, and run the harness
green one more time.

### Guard G8

`CredsMcp.Tests --filter-class "*WindowsTests"` is green (command 11): `not_found` goes on, `denied` stops
(`src_mcp/tests/WindowsTests.cs:27-58`, not changed).

### Commit

**c3:** `test(itest): a hidden entry or folder reads as a missing one through creds-mcp, with one window and with
two`. The body gives the count of checks before and after, and the three mutation results.

### Done when

- [ ] `npm run itest:mcp` printed no `SKIP` line (F12) and ended with `all checks passed`; the count of checks rose
      by the number of new checks; H1 to H6 are green.
- [ ] The three mutation runs failed on the named checks, and the code was restored.
- [ ] G8 ran green.
- [ ] The leftovers guard is clean for the new file (command 13).
- [ ] If the binary could not be built here: the story says so, with the error, and names who runs the harness
      before the release. CI runs it on each push (F12).

## E1.3 — the documents, the neighbour rows, the closing checks

**Depends on** E1.1 and E1.2. It writes text only; it changes no code and no test.

### What is written

| File | What |
|---|---|
| `src_vs_code/CHANGELOG.md`, under `## [Unreleased]` (`:7`) | one `### Changed — security` entry: rule A, and the cases 1, 2, 3 and 5 of the parent's §3.4, each with the old answer and the new one. It is derived from the diff of c2. It says that case 4 (a linked key or a jump host) is not in this change |
| `research/module_extension.md` | (a) after *The gate is per action, not per call* (`:6392`): a paragraph *A lookup and a refusal name only what the agent may view*, with rule A, the two functions that decide it (`shown`, `isOpenFolder`), `agentMayView`, the four exceptions N1, N4, N5, N6, and why a lookup refusal writes no journal line; (b) in the folder paragraph (from `:6196`): a folder that is not open is absent for each verb and for a move, and the Trash sentence is gone; (c) in the linked-run paragraph (`:2460`): how `whyUnusable` chooses one of three sentences from the node. No diagram shows these lookups, so none is drawn again |
| `research/module_tests.md` | one section for part A of the class test and the six harness checks: where they are, the command, what they prove, and the parent's §5.8 as *what it does not prove*; the harness rows at `:37` and `:272` get the new leg and its folders |
| six neighbour plans | one boundary row each, below |
| `todo/README.md` | the status cell of the parent's row and of this document's row |

`README.md`, the help files and `POST_DEPLOY.md` get no change (the parent's §6 gives the reasons).

### The six neighbour rows (the parent's §7a)

Each row is the neighbour's part, said from its side, with a link to the parent
(`[PLAN_agent_refusal_names_unlisted_entry.md](PLAN_agent_refusal_names_unlisted_entry.md)`). Take the text from
the last column of the parent's §7a table.

| Neighbour | Where the row goes |
|---|---|
| `PLAN_ssh_exec_own_agent_forwarding.md` | under its status block |
| `PLAN_ssh_exec_absolute_program.md` | under its status block |
| `PLAN_askpass_answers_the_hop.md` | under its status block |
| `PLAN_consent_coverage_per_door.md` | in its §5 *Out of scope, said once* (`:362`) |
| `PLAN_terminal_runs_followups.md` | under its item 6 (`:63`) |
| `PLAN_query_refuses_client_commands.md` | in its §5 *Out of scope, said once* (`:308`) |

**Not edited: `PLAN_remote_bridge_scoped.md` and `PLAN_remote_bridge_scoped_E1_S3_spec.md`.** Their two rows are
OWED (the parent's entry 1.1). They are written in the parent's §7a only.

Rules for these edits:

- Read each neighbour again at the time of the edit. If it was promoted to `research/`, the row goes into the file
  there, and its link to the parent is `../todo/PLAN_agent_refusal_names_unlisted_entry.md`.
- A row changes none of the neighbour's scope, goals, Definition of Done, merge conditions, epics, stories, build
  order, contract or approach. So it is not an entry of that plan's ledger, and no ledger line is written.
- If a row makes a sentence of a neighbour false, do not repair that sentence: tell the lead. That plan's own
  change rule judges the repair.
- Stage each neighbour file by hunk.

### The closing checks (the parent's §4 step 7)

Commands 2, 4, 5, 6, 7, 8 and 9 of *Commands*, then command 12. Give the lead, for the pull request body and the
summary: part A's first leak list against the parent's §3.1; one RED failure and its pass; G5's red text; the
mutation results of E1.1 and E1.2; the harness's count of checks; the cases 1, 2, 3 and 5 of §3.4; and the notes of
the last section of this document.

### Commit

**c4:** `docs(agent): rule A — the changelog, the module documents, the neighbour rows`.

### Done when

- [ ] The CHANGELOG entry carries the cases 1, 2, 3 and 5, and agrees with the diff of c2.
- [ ] The three places of `research/module_extension.md` and the section of `research/module_tests.md` are written;
      no sentence there describes something that does not run.
- [ ] Each of the six neighbours has its row; the two bridge files have no difference
      (`git diff --stat bf39ea05 -- todo/PLAN_remote_bridge_scoped.md todo/PLAN_remote_bridge_scoped_E1_S3_spec.md`
      is empty).
- [ ] `plan-lifecycle.mjs` is clean; `pin-check.mjs` passes; each link of the changed files resolves.
- [ ] `npm run typecheck`, `npm test`, `npm run lint` are green; `npm run contract` leaves no difference;
      `npm run itest:mcp` is green with no `SKIP`, or the summary says why not and who runs it.

## The order of the commits, and what comes after E1.3

| # | Story | Commit |
|---|---|---|
| c0 | — | this document, with the parent's two lines and the `todo/README.md` row |
| c1 | E1.1 | the fixture and the two world options (optional) |
| c2 | E1.1 | rule A at the two lookups |
| c3 | E1.2 | the harness |
| c4 | E1.3 | the documents and the neighbour rows |

After c4, the lead runs the `coai` code round on the finished branch and opens the pull request (the parent's §4
step 8). The lead then writes the pull request number into the parent's §7a for the two owed rows. This document
and the parent are promoted together with the E2 stories document, in the task that finishes epic 2. No release is
part of this epic; the lead and the owner hear that a release must follow the merge.

## Notes on the parent, as read on `bf39ea05`

The stories above obey the parent as written. These notes are the places where this document had to be more exact
than the parent, or where the parent's text does not agree with the code or with itself. The parent's text was not
changed for them; the lead decides if one of them is a change of the plan.

1. **The count of harness checks.** §5.7 says *five checks* and lists six; §4 step 5 says *H1 to H5*; §5.8 says
   *H3 to H5*; §6 says *the five harness checks*. §10 says H1 to H6. This document builds H1 to H6.
2. **A6 is not complete.** Two more comments carry the claim that A1 makes false: `brokerRequests.ts:186-190` and
   `mcpEntries.ts:373-379`. The message at `test/agentSshGate.test.ts:676` counts *the gate's two* reads, and A4
   makes them three on a refusal. E1.1 repairs the three.
3. **A line that is off by one.** The test of A6 and §5.5 is at `test/mcpFolders.test.ts:194-198`, not `:193` (F13).
4. **The routes.** §5.1 lists the contract keys to derive from and leaves out `health`, but its table has
   `GET /v1/health`. The helper `test/contractRoutes.ts` reads `health` too. Part A uses the helper (F1).
5. **The fixture needs one more visible folder**, with `create` on. With the parent's list, no folder is open for
   creating, and the create row stops before `chooseTarget` reads the name (F5).
6. **"Deep-equal status and body" for a folder id.** The A-folder sentence repeats the id that was sent (F6). So the
   bodies are equal after that value is replaced, and equal in length when the made-up id has the same length.
7. **The real create hook needs a world option** (F2). The parent names the real `chooseCreateTarget` and not the
   way to wire it.
8. **Two accounts in one window.** §8 risk 5 names two windows. The same thing is true between two accounts of one
   window (F9): a hidden node in the first account no longer stops the search in the second. X1 and X2 pin it.
9. **A RED proof for the harness.** §5.7 gives none. E1.2 proves H1, H2, H3 and H6 by mutation.
