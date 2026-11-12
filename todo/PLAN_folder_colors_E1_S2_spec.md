# PLAN — folder colours, E1.S2 spec: the allocator (cornerstone)

> Status: **spec, not built, 2026-11-12, by Fable.** Scenarios and brief of the cornerstone story E1.S2.
> Parent: [PLAN_folder_colors.md](PLAN_folder_colors.md) (§3.2 as rewritten by ledger entry 1.1, §6.1, `## Epics`).
> Stories document: [PLAN_folder_colors_E1.md](PLAN_folder_colors_E1.md) (section *E1.S2*, decision D2 of S3).
> Code and tests: Sonnet. Review: Opus. Scope: `src_vs_code/src/folderColors.ts` (one function and its helpers) and
> three test files. No caller is wired here (that is S3).

Paths are relative to `src_vs_code/src/` unless they say otherwise. Each `file:line` was opened on commit `1db4c344`.
Where this spec and the stories document differ, the difference is listed in §1 for the lead.

## 1. Findings against the parent

The parent is not edited here. The lead decides each finding.

**Verdict first: nothing stops the story.** The mechanism of entry 1.1 works as written. It was run, not only read
(§1.1). Three sentences of the parent say more than what was measured (P1, P2, P3).

### 1.1 What was checked, and how

A read-only probe drove the real `StorageManager` (compiled `out/` of the main checkout, built 2026-11-09; its
`storageManager.ts` and `leasedQueue.ts` are byte-identical to this worktree). The allocator in the probe was a
function patch as §3.2 describes. Not checked: two real VS Code windows.

| # | Question | Result |
|---|---|---|
| M1 | What does a function patch that returns `{}` do? | The patch is called. The folder gets a new `updatedAt` and a new `v` (`stampVector`, `storageManager.ts:471-479`). Three memento writes: the device sequence, the whole node list, the horizon. No other field changes. |
| M2 | Does `getNodes` inside the patch see earlier writes of the same window? | Yes. It returns the list as it is before this write (`:528`). Two calls started together for two folders gave `depColor1` and `depColor2`. |
| M3 | The same, with the tally taken before the call? | Both folders got `depColor1`. So the tally must be inside the patch. |
| M4 | Two `StorageManager` instances, one shared memento object, one real lock directory? | Tally inside: two different keys (about 260 ms, one poll of `leasedQueue.ts:28`). Tally outside: the same key twice. |
| M5 | Two calls together for ONE folder, one window? | One patch returned the key, the other `{}`. The folder's `v` moved twice (2 → 4). |
| M6 | A patch for an id that is not there? | The patch is NOT called. The node list and the horizon are still written. Nothing is invented (`test/nodeWriteRace.test.ts:143-151` says the same). |
| M7 | A MODEL, not VS Code: each window has its own memento copy, and a foreign write arrives 400 ms late. | Both windows picked `depColor1`. Each window's whole-list write also dropped the other's. |

### 1.2 The findings

- **P1 — "in one window or in two" has a condition the parent does not state.** The lease excludes two windows from
  the critical section (`windowLock.ts:23-25`, an atomic `mkdir`). It does not make window B's memento fresh.
  `getNodes` inside the patch reads this window's copy of `globalState` (`storageManager.ts:385-402`). The
  repository's own text says a foreign write arrives "by broadcast with no ordering against a local read"
  (`windowLock.ts:17-21`; `research/PLAN_cross_window_write_coordination.md:103-107`). So if window B takes the lease
  before A's write has arrived in B, B tallies an old list: two folders can get one colour (M7). Every leased writer
  of this product has the same condition; this story does not add it and cannot remove it (the store has no
  compare-and-swap). The window is narrow: a contended B waits at least 250 ms before it takes the lock. The cost
  here is cosmetic, and E2's form repairs it. **Asked of the lead:** accept it as a named residual. This spec puts it
  in the doc comment of `ensureFolderColor` (§3.4) and asks S3 to say it in the module document. The two-window test
  (R4) proves the lease, not the broadcast (§7).
- **P2 — the empty stamp costs more, and happens more often, than §3.2 says.** §3.2: "a call that loses that race
  (two windows, same folder, same moment) stamps the folder once with no change". Measured (M1, M5): the loser also
  exists in ONE window, when two calls for one uncoloured folder start together. Each loss is three memento writes
  and a changed profile token, so the next sync cycle uploads once. Still rare and harmless: S3's folder run awaits
  its calls one after another (stories document, D5), so it never loses. Accepted by the plan; said honestly here.
- **P3 — the first open from an uncoloured folder now waits for the lease.** `LeasedQueue.run` waits without a limit,
  by design (`leasedQueue.ts:61-63`), with a status-bar notice. Before this feature, building a terminal key took no
  lease. Now the first terminal of an uncoloured folder waits while the same window applies a sync, or while another
  window imports. Its ceiling is the lease's own pair: a dead holder is broken after 15 s (`windowLock.ts:67`), a
  live one is waited for. S3's `.catch(() => undefined)` (D2) covers a failure, not a wait. S2 adds no timer of its
  own. **Asked of the lead:** accept, and say it in the module document; or decide a bound in S3.
- **P4 — a folder deleted between the check and the lease.** By M6 the patch never runs, and the list is written once
  with no change. `ensureFolderColor` then returns `undefined` (§3.3 step 6). No parent text is wrong; the case was
  not named.
- **P5 — information only: the empty stamp can be avoided, and this spec does not do it.** `storage.writes.run` is
  public for a re-check-then-write (`storageManager.ts:104-106`; used at `entityPin.ts:104`, `entryWriter.ts:162`).
  Inside it, the allocator could call `updateNodeFields` only when a colour is needed: no empty stamp, no write for a
  deleted folder. That is another mechanism than entry 1.1 and a fourth storage member. It would be the second change
  of epoch 1. Not proposed.
- **P6 — three readings this spec makes; each may count as plan text.** (a) *The trash at any depth:* §3.2 says "the
  trash"; this spec also writes nothing for a folder that sits inside the trash (§3.2 S2-D1). (b) *A parent that is
  not a folder* (data from sync): no write (S2-D2). (c) *The test file:* §6.1 names `folderColors.test.ts`; S2's
  tests go to their own file (§4.1). Note for S1, not changed here: `folderColorUsage` counts a coloured folder that
  sits inside the trash.
- **P7 — for the stories document.** Its S3 item 11 says S3 makes "one new shared fake, `test/folderColorStorage.ts`".
  S2 needs that fake first and makes it (§4.2). S3 uses it and makes no second one.

## 2. The contract

```ts
/** The storage the allocator uses: three methods and nothing else. `StorageManager` satisfies it as it is. */
export interface FolderColorStorage {
  getNode(accountId: string, id: string): TreeNode | undefined;
  getNodes(accountId: string): readonly TreeNode[];
  updateNodeFields(accountId: string, id: string, patch: (node: TreeNode) => Partial<TreeNode>): Promise<void>;
}

export async function ensureFolderColor(
  storage: FolderColorStorage,
  accountId: string,
  entryId: string,
): Promise<DepColorKey | undefined>
```

- In `folderColors.ts`. No `vscode` import (repository rule 3).
- `updateNodeFields` is declared with the FUNCTION form only, on purpose: an object patch cannot be passed.
  Checked with `tsc --strict`: `StorageManager` is assignable to this interface (`storageManager.ts:521` takes the
  union).
- It **resolves** with the colour the entry's direct parent folder wears after the call: the key it wrote, the key
  it found, or `undefined` (no folder to colour, or a stored value this build does not know).
- It **rejects** when `updateNodeFields` rejects, with that same error. It catches nothing. (S3's D2 catches.)
- It keeps nothing in memory between calls. It starts no timer. It reads and writes `accountId` only.

## 3. The algorithm

### 3.1 One predicate, used twice

`needsColour(storage, accountId, folder)` is true when ALL of these hold:

1. `folder.type === 'folder'`;
2. `typeof folder.folderColor !== 'string'` — ANY string blocks, known key or not, the empty string too;
3. `!isInTrash(folder, (id) => storage.getNode(accountId, id))` (`trash.ts:47-57`) — false for the trash itself and
   for a folder below it at any depth.

The same function is the check outside the lease and the re-check inside it. Two copies would drift.

### 3.2 Decisions of this spec

| # | Decision | Why |
|---|---|---|
| S2-D1 | Nothing is written for a folder inside the trash, at any depth. | A deleted folder is moved whole, so its entries sit one level under the trash (`trash.ts:40-42`). A check of the direct parent alone would colour deleted folders. |
| S2-D2 | Nothing is written when the parent node is not a folder. | `parentId` arrives by sync and import. `folderColor` is a folder field. |
| S2-D3 | The return value has one rule: the key the patch wrote, else `folderColorKeyOf` of a fresh read. | One rule covers "found", "lost the race", "unknown key", "folder gone". |
| S2-D4 | The entry's own type is not checked. | Callers pass entry ids (S3). For a folder id the function would colour that folder's parent; harmless. |

### 3.3 The steps

**Outside the lease** (synchronous; no `await` before step 4):

1. `entry = storage.getNode(accountId, entryId)`. No entry → return `undefined`.
2. `folder = parentFolderOf(storage, accountId, entry)` (`moveGate.ts:130-138`). Root or dangling parent → return
   `undefined`.
3. `needsColour(storage, accountId, folder)` is false → return `folderColorKeyOf(folder)`. **`updateNodeFields` is
   not called.** This is the check that saves the stamp: a known key gives the key; `depColor99`, `''`, the trash and
   a non-folder give `undefined`, and the node is untouched.

**Inside the lease:**

4. `await storage.updateNodeFields(accountId, folder.id, patch)`. `StorageManager` runs `patch` inside its write
   queue and the cross-window lease, on the folder as it is then (`storageManager.ts:525-531`).
5. The patch, given the folder `now`:
   - `needsColour(storage, accountId, now)` is false → return `{}`. This is the lost race. It changes no field and
     costs one stamp (P2).
   - else `key = pickFolderColor(storage.getNodes(accountId))` — read HERE, not before step 4 — then record `key`
     in a local variable of this call and return `{ folderColor: key }`.

**After the await:**

6. If the patch recorded a key, return it. Otherwise return
   `folderColorKeyOf(storage.getNode(accountId, folder.id))`: the winner's key when the race was lost; `undefined`
   when the stored value is unknown, when the folder went to the trash, or when the folder is gone (P4).

How the function knows what it wrote: only through that local variable, set inside the patch. The patch is called
at most once per call (`storageManager.ts:528`). If `updateNodeFields` rejects, step 6 is not reached.

### 3.4 Shape and limits

- eslint: complexity 4, 50 lines per function (`eslint.config.mjs:31-32`). No `eslint-disable`. The steps fit as
  three small functions: the entry's folder (steps 1-2), `needsColour`, and `ensureFolderColor` with the patch as an
  arrow inside it.
- New imports in `folderColors.ts`: `parentFolderOf` (`moveGate.ts`), `isInTrash` (`trash.ts`). Both are free of
  `vscode` (`terminalTitles.ts:1` already imports the first).
- **The doc comment of `ensureFolderColor` states**, in the code, where a caller reads it: the atomic operation it
  rests on (the lease's `mkdir`, `windowLock.ts`); that the tally is inside the patch and why; the cost of a lost race
  (one stamp, no field); and the residual of P1 (two windows, a late broadcast: two folders can get one colour).
- **Line budget.** `folderColors.ts` whole, S1 and S2 together: at most 140 lines. S2's part (the interface, the
  function, its helpers, comments): at most 85. S1's three functions (`folderColorKeyOf`, `folderColorUsage`,
  `pickFolderColor`) are specified in the stories document, not here; S2 calls them and does not change them.

## 4. Test files and fakes

### 4.1 Files

| File | New? | Holds | Budget |
|---|---|---|---|
| `test/folderColorAllocator.test.ts` | new | Every scenario of §5 | 450 lines |
| `test/folderColorStorage.ts` | new | The fake storage (§4.2); S3 reuses it | 110 lines |
| `test/twoWindowsWorld.ts` | new, by a move | `sharedMemento`, `sharedSecrets`, `twoWindows` | 120 lines |
| `test/crossWindowWrites.test.ts` | edited | Imports the three helpers it used to define (`:46-130`); its four tests do not change | — |

**Why a separate test file and not `folderColors.test.ts`.** S1's file is pure and instant. The allocator's tests
load the real `StorageManager` through `loadWithVscode`, make a real lock directory, and wait one 250 ms lock poll.
The runner bounds each file on its own. And the cornerstone's tests are then one file for the reviewer.

**Why the move.** R4 needs two managers on one memento. That builder exists only inside
`crossWindowWrites.test.ts`. A second copy would drift (reuse-first). `twoWindows` becomes generic over the storage
interface the test names. The four existing tests staying green is the proof of the move.

### 4.2 The fake — `folderColorStorage(seed, options?)`

`seed` maps an account id to its nodes. It returns the three methods of §2 plus the test controls:

- `updateNodeFields(accountId, id, patch)` accepts an object or a function (S3 needs both). One call is one **turn**:
  1. wait one macrotask (`setImmediate`);
  2. run the one-shot `beforePatch` hook, if one is set;
  3. read the account's list as it is now; find the node; `change` = the patch's result for it (`undefined` when the
     id is not there — the patch is then NOT called, as M6);
  4. push `{ accountId, id, byFunction, change }` to `written`;
  5. wait one macrotask;
  6. if `failNextWrite(error)` is pending: clear it and throw `error`;
  7. store a new frozen list: the node replaced by `{ ...node, ...change }`, every other node the same object.
- **Turns run one at a time through the real `SerialQueue`** (`serialQueue.ts:24-28`) — the lease-like serialization.
  With `options.serial === false` the turns overlap. That mode exists for the control R3 only.
- `touched`: the account id of every `getNode`, `getNodes` and `updateNodeFields` call, for I1.
- `beforePatch(run)`, `failNextWrite(error)`, and `put(accountId, node)` (a direct fixture edit, not recorded).
- **It does not stamp.** So on the fake, "nothing was written" is `written.length`, never node equality alone.

Both waits matter. Without the first, a tally taken outside the lease would look correct. Without the queue, a
correct allocator could not pass.

### 4.3 The real storage, one window and two

- **One window:** `new StorageManager(memento, secrets)` through `loadWithVscode`, as `test/nodeWriteRace.test.ts:25-75`.
  Its queue is then a plain `SerialQueue` (`leasedWrites.ts:28-31`). The memento also lists every `update` key, so a
  test can say "zero writes". Seeded with `addNode`.
- **Two windows:** `twoWindows(lockDirectory())` — two `StorageManager` instances, ONE memento object, ONE real lock
  directory (`ownedDir(scope, 'window-lock')` with `cleanupScope()` and `after(() => scope.close())`, exactly as
  `test/crossWindowWrites.test.ts:5-9` and `:133-135`). Real `mkdir`, real timers, no timing assertion.

So the two-folder race is tested three ways: through the fake's serialization (R2), through one real manager (R2),
and once through two real managers that share one fake `globalState` (R4).

### 4.4 Rules for every scenario

- **RED first.** The first body of `ensureFolderColor` is `return Promise.resolve(undefined);`. Every scenario of §5
  except V1 and V2 must fail against it with an assertion message, not a compile error. That is why each "nothing is
  written" scenario ends with the **positive tail**: in the same world, a call for entry `e-live` in the uncoloured
  folder `f-live` returns a key and records one write. A file of negatives alone would pass against a fake that
  records nothing.
- **GREEN**, then **teeth**: apply the scenario's *Revert* to the production code, see the scenario red, restore.
  Report the three observations per scenario, with the failure message.
- **Assert the Given.** Before the *When*, read the fixture back through the storage under test
  (`getNode(...)?.folderColor`). A node the guard drops would turn "unknown key" into "dangling parent", in green.
- Every `TreeNode` fixture passes `isTreeNode` (one assertion in the fixture helper). Keys come from `DEP_COLOR_KEYS`
  by index; the twelve names are never typed. `'depColor99'` is asserted once to fail `isDepColorKey`.
- **[both]** means: the same test body runs over the fake and over one real `StorageManager` (a loop over two world
  builders). The fake is a second implementation of the storage contract; [both] and V2 are its live check.
- "Started together" means: both calls are made in the same synchronous block, then awaited with `Promise.all`.
- Test names are the names below. Run one file from `src_vs_code`:
  `npm run compile && node ../.agents/conventions/tools/low-priority.mjs node --test out/test/folderColorAllocator.test.js`.
  Read the exit status of `tsc`: it writes `out/` even with type errors.

## 5. Scenarios

`K[n]` is `DEP_COLOR_KEYS[n]`. Account `A` unless said. "No call" means `updateNodeFields` was not called.

### 5.1 It assigns, once

- **A1** `the_first_call_colours_the_folder_once_and_returns_the_key` [both]. **Given** folder `f1` with no colour,
  entry `e1` in it, no coloured folder. **When** `ensureFolderColor(storage, A, 'e1')`, then again. **Then** the
  first returns `K[0]`; `f1` holds `K[0]`; exactly one write, on `f1`, made with a function patch; the second
  returns `K[0]` with no call. *Revert:* return `{}` from the patch.
- **A2** `a_known_colour_is_returned_and_nothing_is_written` [both]. **Given** for each key of `DEP_COLOR_KEYS`, a
  folder wearing it with one entry. **When** the call, per entry. **Then** it returns that key; no call; on the real
  storage zero memento writes. *Revert:* remove step 3's early return.
- **A3** `an_unknown_stored_value_is_kept_as_it_is_and_gives_no_key` [both]. **Given** `f1` with
  `folderColor: 'depColor99'` and `f2` with `folderColor: ''`, an entry in each. **When** the two calls. **Then**
  both return `undefined`; no call; `JSON.stringify` of each node is the same before and after (on the fake also
  the same object; on the real storage `v` and `updatedAt` included, and zero memento writes). Positive tail.
  *Revert:* test `isDepColorKey(folder.folderColor)` in place of `typeof … === 'string'`.
- **A4** `nothing_is_written_at_the_root_for_a_dangling_parent_or_a_missing_entry`. **Given** entries with
  `parentId` `null`, `undefined` and `'gone'`, and the id `'no-such-entry'`. **Then** each call returns `undefined`;
  no call; the node list is the same object. Positive tail. *Revert:* remove the `undefined` guards of steps 1-2
  (the calls then throw).
- **A5** `nothing_is_written_in_the_trash_at_any_depth`. **Given** the trash; `e1` directly in it; folder `f-del` in
  the trash with `e2`; folder `f-deep` in `f-del` with `e3`; folder `f-kept` in the trash wearing `K[3]` with `e4`.
  **Then** `e1`, `e2`, `e3` → `undefined`, no call; `e4` → `K[3]`, no call. Positive tail. *Revert:* replace
  `isInTrash` by `isTrashFolder(folder)` (the `e2` and `e3` cases go red); remove the trash clause (all three).
- **A6** `a_parent_that_is_not_a_folder_is_left_alone`. **Given** entry `e1` whose `parentId` names an entity.
  **Then** `undefined`, no call. Positive tail. *Revert:* remove clause 1 of `needsColour`.
- **A7** `the_pick_is_the_least_used_among_this_accounts_folders_only`. **Given** in `A`: one folder for every key
  except `K[5]`; the trash wearing `K[5]`; a folder wearing `'depColor99'`; three entities with
  `details.depColor: K[5]`; uncoloured `f1` with `e1`. In account `B`: four folders wearing `K[5]`. **When** the call
  for `e1`. **Then** it returns `K[5]`. (Counting any one of the three distractors gives `K[0]`.) *Revert:* tally
  with an own loop that counts `node.folderColor` of every node; then one that adds `details.depColor`.
- **A8** `only_the_direct_parent_folder_is_coloured`. **Given** `outer` containing `inner` containing `e1`, both
  uncoloured. **Then** one write, on `inner`; `outer` has no colour. *Revert:* walk up to the top folder.

### 5.2 Races

- **R1** `two_calls_for_one_uncoloured_folder_change_it_once_and_agree` [both]. **Given** `f0` wearing `K[0]`;
  uncoloured `f1` with `e1` and `e2`. **When** the two calls are started together. **Then** both return `K[1]`; `f1`
  holds `K[1]`; exactly one recorded change carries `folderColor`, and every other change is `{}` (on the real
  storage: `f1.folderColor` is `K[1]`). *Revert:* drop the re-check inside the patch.
- **R2** `two_calls_for_two_uncoloured_folders_get_two_keys` [both]. **Given** uncoloured `f1` with `e1` and `f2`
  with `e2`. **When** started together. **Then** the two returns are different, and as a set they are
  `{K[0], K[1]}`; each folder holds the key its call returned. *Revert:* take the tally before step 4 and return it
  from the patch.
- **R3** `without_a_lease_two_folders_would_get_one_key_and_that_is_the_point`. The control. **Given** R2's world on
  the fake with `serial: false`. **When** started together. **Then** both calls return `K[0]`. It shows that the
  fake can interleave, so R2 passes because of the serialization and not by luck. *Teeth:* make the non-serial mode
  serial; R3 goes red.
- **R4** `two_windows_with_the_lock_give_two_folders_two_keys_and_one_folder_one_key`. **Given** `twoWindows` with a
  real lock directory; `f1` with `e1` and `e1b`; `f2` with `e2`. **When** `ensureFolderColor(a, A, 'e1')` and
  `ensureFolderColor(b, A, 'e2')` are started together. **Then** two different keys, the set `{K[0], K[1]}` (either
  window may win). **When** next `a` for `e1` and `b` for `e1b` on a fresh world. **Then** both return the same key.
  *Revert:* as R2.
- **R4b** `a_stale_window_copy_may_repeat_a_colour_and_loses_nothing` (E1 plan round 1, the P1 outcome specified).
  **Given** two windows whose `globalState` copies are NOT shared (window `b` keeps the snapshot from before `a`'s
  write; model the late broadcast as the fake not copying `a`'s write into `b`'s copy). **When** `a` colours `f1`,
  then `b` colours `f2`. **Then** `b` returns a palette key (it may equal `f1`'s); `f1` keeps its key in `a`'s copy;
  `b` wrote only `f2`; no call rejects. The test states in its name and comment that a repeat is the accepted outcome,
  so nobody later reads it as a guarantee of two keys. *Teeth:* make `b`'s patch also write `f1`; the test goes red.
- **R5** `the_folder_is_checked_again_inside_the_lease` — four tests on the fake, each with a `beforePatch` hook that
  changes the world between the outside check and the patch:

  | Test | The hook does | Then |
  |---|---|---|
  | R5a `…_a_colour_saved_meanwhile_wins` | `f1` gets `K[7]` | the change is `{}`; `f1` holds `K[7]`; the call returns `K[7]` |
  | R5b `…_an_unknown_value_saved_meanwhile_is_kept` | `f1` gets `'depColor99'` | the change is `{}`; the value is kept; returns `undefined` |
  | R5c `…_a_folder_trashed_meanwhile_is_left_alone` | `f1` moves into the trash | the change is `{}`; returns `undefined` |
  | R5d `…_a_folder_deleted_meanwhile_invents_nothing` | `f1` is removed | the recorded change is `undefined` (no patch call); returns `undefined`; no node `f1` |

  *Revert:* drop the re-check (R5a-c red); return the outside pick when nothing was recorded (R5d red).
- **R6** `the_tally_is_taken_inside_the_lease`. **Given** uncoloured `f1` with `e1` and uncoloured `f2`. The hook
  gives `f2` the key `K[0]`. **Then** `f1` gets `K[1]` and the call returns `K[1]`. *Revert:* as R2.

### 5.3 A failed write

- **F1** `a_failed_write_rejects_that_call_and_the_next_call_assigns`. **Given** uncoloured `f1` with `e1`;
  `failNextWrite(boom)`. **When** the call. **Then** it rejects with `boom` (the same object); `f1` has no colour.
  **When** the call again. **Then** it returns `K[0]` and `f1` holds it. *Revert:* wrap step 4 in a `catch` that
  returns `undefined`.
- **F2** `a_failed_write_does_not_stop_a_call_started_with_it`. **Given** `f1` with `e1`, `f2` with `e2`;
  `failNextWrite(boom)`. **When** started together and awaited with `Promise.allSettled`. **Then** the first is
  rejected with `boom`; the second is fulfilled with `K[0]`; `f2` holds it; `f1` has none. *Revert:* route the calls
  through a module-level promise chain that does not swallow the failure.

### 5.4 Accounts

- **I1** `a_call_for_one_account_never_touches_another`. **Given** accounts `A` and `B` with the SAME ids: folder
  `f1` and entry `e1` in each, uncoloured; `B` also has a folder wearing `K[0]`. **When** the call for `A`.
  **Then** it returns `K[0]`; `touched` holds only `A`; `B`'s list is the same object as before; no write names `B`.
  **When** next the call for `B`. **Then** it returns `K[1]`; since the first call `touched` gained only `B`; `A`'s
  list is the same object as after the first call. *Revert:* keep the last usage map in a module variable (the
  second call then returns `K[0]`).

### 5.5 Structure

- **V1** `the_module_imports_no_vscode`, with its companion `the_scan_still_finds_a_vscode_import_where_there_is_one`
  (the same pattern over `leasedWrites.ts`, which has one at `:1`). Shape of `test/terminalTitles.test.ts:85-89`.
  Green at once. *Teeth:* add the import.
- **V2** `the_fake_and_the_real_storage_agree_on_a_function_patch`. The same three steps on the fake and on one real
  `StorageManager`: (i) a function patch sees a field written just before it; (ii) a patch returning `{}` changes no
  field other than `updatedAt` and `v`; (iii) a patch for a missing id is not called and no node appears. Green at
  once. *Teeth:* make the fake evaluate the patch before its first wait; (i) goes red.

## 6. Break-it mutations for the reviewer

The reviewer applies each one by hand to the finished code, runs the allocator file, and sees the named tests red.
Then restores. A mutation that stays green is a blocking finding. B1, B2 and B7 were tried while this spec was
written, on a sketch of the algorithm over a sketch of the fake: exactly the tests named in their rows went red.

| # | Mutation | Must go red |
|---|---|---|
| B1 | The tally before the call: `const key = pickFolderColor(getNodes(…))` outside, the patch returns it | R2 (fake and real), R4, R6 |
| B2 | No re-check inside: the patch always returns `{ folderColor }` | R1, R5a, R5b, R5c |
| B3 | No check outside: always call `updateNodeFields` | A1 (second call), A2, A3 |
| B4 | Count the trash's own colour in the tally | A7 |
| B5 | Count `details.depColor` in the tally | A7 |
| B6 | A tally kept between calls, or not keyed by account | I1 |
| B7 | Overwrite an unknown key: block only when `isDepColorKey(folder.folderColor)` | A3, R5b |
| B8 | Colour inside the trash: `isTrashFolder` in place of `isInTrash`, or no trash clause | A5 |
| B9 | Swallow the failed write and return `undefined` | F1 |
| B10 | An in-memory chain in the module (the design entry 1.1 replaced) that a failure poisons | F1, F2 |
| B11 | After a lost race, return the key picked outside and not the stored one | R5a, R5d |
| B12 | Colour the top folder, not the direct parent | A8 |
| B13 | In the fake: `serial` forced to `true` | R3 |

## 7. What these tests do not prove

- **Two real VS Code windows.** R4's two managers read ONE memento object, so a write is visible to the other at
  once. A real window gets it by broadcast (P1). R4 proves the lease's serialization only.
- **The lock's own residual:** a host frozen longer than the TTL can be broken while it works
  (`windowLock.ts:29-38`). Not this story's.
- **The sealed store.** The real-storage worlds do not call `init()`, so the list is stored unsealed
  (`storageManager.ts:1005-1014`). Sealing does not change the patch path.
- **The callers.** S3 wires them and tests them (its C3, C5, C7, C10).

## 8. Build order

1. Move the three helpers to `test/twoWindowsWorld.ts`; run `crossWindowWrites.test.js`; four tests green.
2. `test/folderColorStorage.ts`, then V2. Green.
3. `folderColors.ts`: the interface and `ensureFolderColor` with the body `return Promise.resolve(undefined);`.
4. Every scenario of §5. Run. RED for all but V1 and V2; keep the messages.
5. The real body (§3). GREEN.
6. The *Revert* of each scenario, one at a time: red, restore, green.
7. `npm run typecheck`, `npm run lint`, the whole `npm test`.

## 9. Opus review checklist

- [ ] The signature and the interface are §2's, character for character. No `vscode` import. No fourth storage member.
- [ ] One `needsColour`, called outside and inside. No second copy of its clauses.
- [ ] There is no `await` between the outside check and the `updateNodeFields` call.
- [ ] `getNodes` and `pickFolderColor` are called only inside the patch. The patch uses its argument, not the folder
      read outside.
- [ ] The block is `typeof … === 'string'`. `isDepColorKey` appears only through `folderColorKeyOf`.
- [ ] No `try`, no `catch`, no module-level variable, no timer in S2's code. No `details.depColor`.
- [ ] The return is §3.3 step 6: the recorded key, else `folderColorKeyOf` of a fresh read.
- [ ] The doc comment of `ensureFolderColor` names the lease, the cost of a lost race, and the residual of P1.
- [ ] Complexity 4 and 50 lines hold with no `eslint-disable`. `folderColors.ts` is within 140 lines.
- [ ] The summary gives, per scenario, the RED message, the GREEN, and the red of its *Revert*. V1 and V2 are named
      as green at once, with their teeth.
- [ ] B1, B2 and B7 were applied by the reviewer, not taken from the coder's report. The others at least sampled.
- [ ] The fake waits twice, serializes through the real `SerialQueue`, does not call the patch for a missing id, and
      does not stamp. R3 is present and passes for the stated reason.
- [ ] Each "nothing is written" scenario has its positive tail and asserts its Given through the storage.
- [ ] No key name is typed where `DEP_COLOR_KEYS` gives it. `'depColor99'` is checked against `isDepColorKey` once.
- [ ] R4 uses a real lock directory from `ownedDir` with the cleanup scope, and asserts the keys as a set.
- [ ] `crossWindowWrites.test.ts` changed only by the import of the moved helpers; its four tests are green.
- [ ] No caller of `ensureFolderColor` outside tests yet. The whole suite, typecheck and lint are green.

## 10. Done when

- Every scenario of §5 was seen RED, GREEN, and red again under its *Revert*; both messages are in the summary.
- Every mutation of §6 was seen red by the reviewer or sampled as the checklist says.
- `npm run typecheck`, `npm run lint` and the whole `npm test` are green, at lowered priority.
- What S3 relies on holds: the name and signature of §2; a rejection on a failed write; and after the call resolves,
  a fresh read of the folder carries the colour.
