# PLAN — a manual Sync says what background sync already did, and a click is never lost

> Status: **plan only, nothing implemented yet, 2026-09-26.** Plan gate passed (`good_enough`, 3 of 3 reviewers, one
> round — §12). Scope: `src_vs_code/src` — `syncManager.ts`, `syncIdle.ts`, a new pure `syncSummary.ts`,
> `requestTime.ts` (widened), `lockStatus.ts` / `statusBar.ts`, the wiring in `extension.ts`, the account-removal path,
> and their tests. Issue #160. No server, contract or vault-format change.
>
> Related docs: [module_extension.md](../research/module_extension.md), [module_tests.md](../research/module_tests.md),
> [PLAN_agent_consent_policy.md](../research/PLAN_agent_consent_policy.md) (D3/D4 — what is synced and what is
> machine-local), [PLAN_consent_shows_request_time.md](../research/PLAN_consent_shows_request_time.md) (the
> time formatter reused here), [PLAN_cross_window_write_coordination.md](../research/PLAN_cross_window_write_coordination.md)
> (one `globalState` shared by every window of a profile).

## 1. The symptom (issue #160, owner, 2026-09-26)

An entry was open to agents. Edit → untick the switch → Save. The tree icon changed and the entry was no
longer visible over MCP. **Sync Now** then answered:

> Sync finished: pulled changes for 0 profile(s), pushed the vault for 0 profile(s).

The owner's reading, and the reasonable one: *something changed, so something should have been synced.*

## 2. What the code actually does — verified, not assumed

**The change was recorded, and it IS synced.** This is not a data-loss bug.

| Step | Where | What happens |
|---|---|---|
| The ladder is vault data | `mcpAccess.ts:494-496`; D3 of `PLAN_agent_consent_policy.md` | `details.mcp` lives on the `TreeNode`, which is `ProfileSnapshot.nodes` — inside the encrypted vault. Only the consent *stamp* is machine-local (D4, `mcpConsentPolicy.ts`). |
| Save writes it | `entityFormPanel.ts:589`, `entityEditCommands.ts:134-142` | `readMcpAccess(data.mcp)` → `updateNodeFields(…, { details: carryThroughDetails(…) })`; nothing drops `mcp`. |
| Save stamps it | `storageManager.ts:520-531` → `stampVector` `:471-479`, `saveNodes` `:1013-1022` → `touch` `:236-238` | Every patched node gets a fresh version-vector component and `updatedAt`; the per-account mutation counter behind `changeToken` (`:224-233`) moves. |
| The merge sees it | `syncMerge.ts:150-182` | The fingerprint serialises the whole node, `details.mcp` included — no field is special-cased. |
| **A background sync pushes it, silently** | `extension.ts:496-505` (`mutated` → `sync.notifyChange()`), `syncManager.ts:172-180`, `DEBOUNCE_MS = 5_000` at `:46` | With `credSshManager.autoSync` on, every save arms a 5-second timer that runs `syncAll(false)` — a full cycle that pushes, **non-verbose**, so no toast. |
| **…and nothing shows that it ran** | `extension.ts:476` | The status bar is rendered with `syncing` hard-coded to `false`. The spinner state `lockStatus.ts:12-13` exists and is never drawn. |
| The manual click finds nothing left | `syncManager.ts:538-543` (idle skip, `syncIdle.ts`), `:419-426` (summary) | The mark left by the background push matches, the cycle is idle, and the summary prints two zeros. |

**The owner's machine has `"credSshManager.autoSync": true`** (user `settings.json`, read 2026-09-26). So
the sequence was: Save → ~5 s later a silent push → Sync Now → a correct "nothing to do", worded as if
nothing had happened.

## 3. Four defects found on the way

None is in the issue. All four are real, and all sit in the same hundred lines of `syncManager.ts`.

**3.1 A manual Sync pressed during a running cycle is lost.** `syncAll` (`syncManager.ts:352-368`): when a
cycle is running, the call sets `rerunWanted = true` and **returns**. The rerun is `syncAll(false)` — quiet, and
for **all** accounts even when the click asked for one (`syncNow(onlyAccountId)`, `:183-185`). A person who
clicks while the 5-second debounce cycle runs gets no answer at all.

**3.2 `await sync.syncNow()` can return before its own cycle has run.** The same early return resolves the
promise immediately, and three callers depend on it having finished:

- `commands/keyCommands.ts:298-299` and `:363-366` — *"Again after the sync, because whether a security key is
  registered is something only a completed cycle knows"*, then `refreshReadiness()` against a cycle that has not
  happened yet;
- `commands/accountCommands.ts:81-85` — reports the team rescan's refusals after a sync that may not have run.

**3.3 The summary can say "finished" when every profile failed.** `syncAllOnce` counts only successes
(`:398-400`); a failure is a separate toast (`:401-410`), after which the verbose summary still reads *"Sync
finished: pulled changes for 0 … pushed … 0"* — the same misleading pair of zeros, now after an error.

**3.4 `pushAccount` runs a cycle beside the guard, not through it** (found by the own review, §12). It calls
`syncProfile` directly (`syncManager.ts:193-199`), never through `syncAll`'s one-cycle-at-a-time rule. Its caller is
`projectFolderWiring.ts:88-93`, reached from `corpPolicyWiring.ts:50-51` whenever `refreshOrgPolicy` succeeds inside
`refreshReadiness()` (`extension.ts:452-478`). That runs on activation, after every unlock and lock, and at the top
of Sync Now (`accountCommands.ts:57`). None of these is coordinated with the startup, interval or debounce
`syncAll(false)` (`syncManager.ts:338`, `:337`, `:179`). So on an ordinary activation with a corporate account and
auto-sync on, two `syncProfile` runs for **one account** can overlap:
- they share `decryptedByHash`, `converged` and `securityKeyAccounts`;
- each reads the remote and then writes it, so the second `writeVault` silently discards the first.

This is the clobber the fail-closed comments at `syncManager.ts:547-558` exist to prevent, arriving by another door.

## 4. Owner decisions (2026-09-26)

| # | Decision |
|---|---|
| O1 | A manual Sync that finds nothing to do **says what already happened**: when this vault was last pushed, how long ago, and by which kind of trigger. |
| O2 | A click during a running cycle is **not lost**: it waits for that cycle, runs its own, and shows its result — keeping the account it asked for. |
| O3 | A **quiet status-bar line** shows that a background sync happened, with no toast. |

## 5. Design

### 5.1 Remember the last push — `syncManager.ts`, `extension.ts`

- **Every request carries its trigger explicitly, never inferred from `verbose`** (gate finding, §12):

  | Trigger | Entry points | Said as |
  |---|---|---|
  | `manual` | the Sync Now command (`accountCommands.ts:81`), and the per-account Sync Now in `keyCommands.ts:298` / `:363` | `by Sync Now` |
  | `command` | `pullAccount` (account added), `pushAccount` (folder-removal ack), `setPin`'s re-key write (`:317`) **and** the `syncAll` it starts afterwards (`:258-259`) | `while <what it was doing>` — e.g. `while changing the Sync PIN` |
  | `background` | debounce (`:179`), interval (`:337`), startup (`:338`), the `rerunWanted` successor | `by background sync` |

  `setPin` has no background caller. Its three callers are the Set Sync PIN command (`accountCommands.ts:111`), the
  unlock-with-recovery-code flow (`keyCommands.ts:296`) and the locked-vault offer a person clicks
  (`lockedVaultPrompt.ts:100` via `syncManager.ts:763`).
- **Record after `transport.writeVault` succeeds**: `{ accountId, at: Date.now(), trigger, label? }`. There are two
  write sites: the cycle (`syncManager.ts:586`) and `setPin` (`:317`).
- **Stored in `globalState`** under `syncReminder.lastPush.<accountId>`, beside `syncReminder.lastOk.*`
  (`extension.ts:291`) and wired the same way, so the manager never touches the memento. It is a **settable field**
  (`recordPush`, `lastPushOf`), the pattern `resolveEscrow` uses (`syncManager.ts:111-120`), so no positional
  constructor argument is renumbered.
- **Shared by every window — already a shipped assumption, confirmed once more rather than discovered.**
  - `PLAN_cross_window_write_coordination.md` (implemented 2026-09-03) and its `crossWindowWrites.test.ts` rely on
    *"every window of the same profile shares one `globalState`"*, with a second window's write seen on the very next
    read. `storageManager.ts:215-223` relies on it for `changeToken`.
  - M1 re-measures it for this key.
  - **Fallback if M1 says otherwise:** the sentence names the window, as in `by background sync in this window`, and
    never claims a cross-window fact it cannot back.
  - **Not in scope:** separate editor builds (Code vs Insiders) have separate `globalState`. Each reports only its own
    pushes, and the sentence's "this vault was last pushed" is then "…by this editor". Stated in the help text.

### 5.2 One pure sentence — new `syncSummary.ts` (no `vscode`)

`syncSummary({ applied, pushed, failed, scope, lastPush, now, offsetMinutes }) → string`. The cases, in this order:

| Case | Sentence (English; the shape, not final wording) |
|---|---|
| every profile in scope failed | nothing — the failure toasts already spoke; **no "finished" line** (fixes 3.3) |
| some failed, some did work | `Sync finished with errors: pulled changes for 1 profile(s), pushed the vault for 0 profile(s); 1 profile(s) failed — see above.` |
| work was done | today's sentence, unchanged — it names its units, and `syncManager.test.ts:736-750` guards that |
| nothing to do, a push is recorded | `Already in sync — nothing to pull or push. This vault was last pushed 2026-09-26 17:15:02 (UTC+03:00), 40 s ago, by background sync.` |
| nothing to do, several accounts | the most recent push, naming its account's e-mail; the count of accounts checked |
| nothing to do, no push recorded | `Already in sync — nothing to pull or push.` |

- **Time:** widen `requestTime.ts` rather than write a second formatter (reuse-first, move 1). Split out
  `wallClock(epochMs, offsetMinutes)` → `2026-09-26 17:15:02 (UTC+03:00)`; `requestTimeLine` becomes
  `Requested ${wallClock(…)}.` with byte-identical output (its tests stay green, unchanged).
- **Age:** a tiny pure `ageOf(ms)` → `40 s` / `12 min` / `3 h` / `2 days`. No such helper exists in the extension
  (searched 2026-09-26); it lives in `syncSummary.ts` until a second caller appears.
- A clock skew (a `lastPush.at` in the future) reads `just now`, never a negative age.
- `syncAllOnce` calls it at `:419-426`; the string literal leaves `syncManager.ts`, so the source-grepping
  assertion in `syncManager.test.ts:743-747` is replaced by one that calls `syncSummary` directly (the test's
  guarantee — *both numbers name their unit* — is kept, and becomes a behavioural test instead of a text match).

### 5.3 One gate for every cycle — `syncManager.ts:193-199`, `:352-368`

**The state machine**, written out because two reviewers found the first draft's handoff underspecified (§12):

```ts
interface CycleRequest {
  accounts: Set<string> | 'all';   // union when folded; any 'all' widens to 'all'
  verbose: boolean;                // OR when folded
  trigger: 'manual' | 'command' | 'background';  // strongest wins: manual > command > background
  waiters: Array<(outcome: CycleOutcome) => void>;
}
// Exactly two slots, both owned by one driver:
private current: CycleRequest | undefined;   // the cycle that is running
private next: CycleRequest | undefined;      // everything that arrived while it ran
```

- **One entry for everyone.** `syncNow`, `pullAccount`, the debounce, the interval, startup **and `pushAccount`**
  (fixes 3.4) all call `request(…)`. `syncProfile` has no other caller.
- **`request` never starts a second cycle.**
  - If `current` is empty, it becomes `current` and the driver starts.
  - Otherwise it folds into `next` through a pure `foldRequest(next, incoming)` in `syncIdle.ts`, and returns a
    promise.
- **The driver is one `async` loop:**

  ```ts
  while (current) {
    try { run(current); }
    finally { resolve(current's waiters); current = next; next = undefined; }
  }
  ```

  The handoff from one cycle to the next is **synchronous**, inside the same loop, so no call can observe "nothing
  running" between two cycles and start a parallel one (gate finding 7). A request arriving while cycle 2 runs folds
  into a fresh `next` (finding 6). Waiters are resolved in the `finally` of **their own** cycle, never dropped and
  never resolved early.
- **What a waiter receives:** `CycleOutcome = { ran: true, perAccount: Map<id, 'ok' | Error> } | { ran: false, stillRunning: true }`.
  - `syncNow` awaits it, so `await syncNow()` means what its callers already believe (fixes 3.2).
  - `pushAccount` awaits it and **throws** when its account's entry is an `Error`. This keeps its contract,
    *"reported rather than warned"* (`syncManager.ts:186-192`); the epic-3 ack must not follow a failed push.
- **A bounded wait, not a bounded cycle** (gate finding 3). A transport can hang today (an unreachable NAS share),
  and a caller that used to return at once must not now hang with it.
  - A waiter stops waiting after `QUEUED_WAIT_MS = 120_000` and receives `{ ran: false, stillRunning: true }`.
  - The cycle itself is **not** cancelled: *a wait only stops waiting*, and a cancelled write is worse than a slow one.
  - `pushAccount` treats `stillRunning` as a failure and throws (no ack).
  - `syncNow` says `Sync is still running — its result will appear when it ends`, and its verbose summary is still
    shown when the cycle does end.
- **A verbose request that had to queue says so at once:** `Sync is already running — yours will follow it.` One
  information toast, only for `manual`, only when it actually queued.
- **Many debounce ticks during one cycle still fold into ONE rerun.** That is today's `rerunWanted` guarantee, kept.
- **Complexity:** the fold, the trigger precedence and the outcome mapping are pure functions in `syncIdle.ts` (the
  module of pure cycle decisions), each with unit tests; `request` and the loop stay under the ceiling.

### 5.4 The status bar tells the truth — `lockStatus.ts`, `statusBar.ts`, `extension.ts:476`

- **Draw the spinner that exists.** The manager reports `onCycleState(running: boolean)` (a settable field, as in
  5.1). `extension.ts` keeps the last value and passes it to `statusBar.render(…)` instead of `false`.
- **The quiet line (O3), with the lock state kept first** (gate findings 1 and 8):

  | State | Text |
  |---|---|
  | locked | `$(lock) Vault locked` — **unchanged**, warning colour; the one state a person can act on |
  | open, no push recorded yet | `$(unlock) Vault open` — unchanged |
  | open, a push recorded | `$(unlock) Vault open · pushed 17:15` |
  | a cycle running | `$(sync~spin) CredsForDevs` — the existing state, finally drawn |

  It says **pushed**, not "synced", because it names an event, not a claim that the two sides are equal right now.
  The idle time never updates the line, so it does not become a clock.
- **Tooltip:** the full line, `Last pushed 2026-09-26 17:15:02 (UTC+03:00) by background sync.`, per account, at
  most five, then `and N more`.
- Wording stays in `lockStatus.ts` (no `vscode`, tested), for that module's own reason for existing.

## 6. What must be measured first

| # | Question | How | Why it matters |
|---|---|---|---|
| M1 | Confirm, for `syncReminder.lastPush.<id>`, what `PLAN_cross_window_write_coordination.md` already relies on: window B reads window A's write without a restart | Two windows of one profile, write in one, read in the other; on 1.93 (the `engines` floor) and current stable | Decides between the design and the §5.1 fallback wording |
| M2 | Does the 5-second debounce cycle really finish before a human reaches Sync Now? | Log timestamps (`log.info('sync', …)`) of save, debounce start/end and manual start, on the owner's NAS path | Confirms §2's reconstruction on the real transport rather than by reasoning |
| M3 | How long does a cycle against an unreachable NAS share take to fail, today? | Disconnect the share, time one `pushAccount` | Sets `QUEUED_WAIT_MS` from a measurement. **120 s is the owner-confirmed placeholder** (2026-09-26): it stays unless M3 shows a normal failure takes longer |

## 7. Growth budget

- **One `globalState` key per account** (`syncReminder.lastPush.<accountId>`, ~60 bytes), overwritten in place and
  bounded by the number of accounts.
- **Who retires it.** Today nothing clears **any** `syncReminder.*` key when an account is removed (checked
  2026-09-26: the only writers and readers are `extension.ts:291` and `:333-345`). The account-removal path now
  deletes all four keys for that account: `lastPush`, `lastOk`, `firstSeen` and `lastReminded` (gate finding 0,
  accepted). That fixes a live leak beside the new one rather than adding a fourth key to it.
  `orgPolicy.lastOk.<accountId>` (`policyHeartbeatKey`, `corpPolicy.ts:155-158`) has the same shape and the same
  leak. **Owner decision 2026-09-26: clear it in the same place.** One cleanup removes the five per-account keys,
  and it builds the corporate one through `policyHeartbeatKey`, never by retyping the string.
- **The queue** is at most two request objects, `current` and `next`. Waiters are bounded by the callers alive at
  once, and each is released by its cycle's `finally` or by `QUEUED_WAIT_MS`.

## 8. Build order

1. **RED — the reported symptom, end to end** (`syncManager.test.ts`, the `world()`/`manager()` harness at
   `:137`/`:173`): a background cycle pushes an `mcp`-only change; the following `syncNow()` shows a summary that
   names the earlier push — fails today with the two zeros.
2. **RED — 3.1 and 3.2**: a transport whose `readVault` waits on a deferred; start `pullAccount()`, call
   `syncNow('A')` while it is blocked, assert that the returned promise is **still pending**, release, then assert:
   two cycles ran, the second was verbose, only account A was in it, and a summary toast appeared. Fails today — the
   promise resolves at once and no toast appears.
3. **RED — 3.4**: an instrumented transport counts concurrent `readVault`/`writeVault` calls per account; start a
   background cycle, call `pushAccount(A)` while it is blocked; assert the maximum concurrency for A is 1. Fails today
   with 2.
4. **RED — 3.3**: every account's transport throws; assert there is no "Sync finished" line.
5. `requestTime.ts` split (`wallClock`), keeping `requestTime.test.ts` byte-identical and green.
6. `syncSummary.ts` + `syncSummary.test.ts` (every row of §5.2, fixed `offsetMinutes`, clock-skew case).
7. `foldRequest`, trigger precedence and outcome mapping in `syncIdle.ts` + tests; the `request` / driver rework;
   `pushAccount` through it. Steps 1–4 go GREEN.
8. `recordPush` / `lastPushOf` / `onCycleState` fields, explicit triggers at every entry point, `extension.ts`
   wiring, the five-key cleanup on account removal (§7).
9. `lockStatus.ts` wording + `statusBar.test.ts`; `statusBar.render` gets the real `syncing` value.
10. **The mcp-only coverage gap** (no test connects an `mcp` edit to a push today): `syncMerge.test.ts` — a local
    node whose only difference is `details.mcp`, with a dominating vector, yields `remoteChanged: true` and a merged
    node carrying the new ladder.
11. **Scenario** (gate findings 10 and 12): through the repository's scenario harness
    (`research/PLAN_scenario_harness_catalogue.md`), with the real `SyncManager`, a folder transport and the real
    `extension.ts` wiring where the harness reaches it, run save → debounce push → Sync Now. Assert the summary names
    the push, and that the status-bar model shows `pushed HH:MM`. Catalogued in `research/module_tests.md`; any part
    the harness cannot drive (the painted status-bar item itself) is listed there as not covered, with the reason.
12. Docs: `research/module_extension.md` (the one-gate cycle, triggers, the last-push record, the status bar), the
    `sync-vs-snapshots` help topic (`helpEn.ts:55`), or a new "what the status bar says" entry if that is the wrong
    home. English and Russian complete (Russian is enforced by `helpContent.test.ts:114`); uk/de/es translated or
    visibly falling back (`:60-87`). Plus `src_vs_code/CHANGELOG.md`.

## 9. Test plan

| Guarantee | Test | Red today? |
|---|---|---|
| A no-op manual Sync names the earlier background push | `syncManager.test.ts` (step 1) | yes |
| `await syncNow()` resolves only after its own cycle | `syncManager.test.ts` (step 2) | yes |
| A click during a cycle keeps its account and its toast | `syncManager.test.ts` (step 2) | yes |
| `pushAccount` never overlaps another cycle for its account | `syncManager.test.ts` (step 3) | **yes** |
| `pushAccount` still throws when its push failed or is still running | `syncManager.test.ts` | new |
| A request arriving during cycle 2 runs in cycle 3, and every waiter resolves exactly once | `syncManager.test.ts` + `syncIdle.test.ts` | new |
| A hung transport releases waiters after `QUEUED_WAIT_MS` (fake clock) and does not cancel the cycle | `syncManager.test.ts` | new |
| Five debounce ticks during one cycle cause ONE rerun | `syncManager.test.ts` + `syncIdle.test.ts` (`foldRequest`) | no — regression guard |
| Trigger precedence manual > command > background | `syncIdle.test.ts` | new |
| An all-failed Sync prints no "finished" | `syncManager.test.ts` (step 4) | yes |
| Every §5.2 row, including skew and several accounts | `syncSummary.test.ts` | new |
| `requestTimeLine` output unchanged | `requestTime.test.ts`, untouched | no |
| An `mcp`-only edit is a remote change | `syncMerge.test.ts` (step 10) | no — closes the coverage gap |
| Every §5.4 row; locked untouched | `statusBar.test.ts` (the suite that covers `lockStatus.ts`) | yes (the text) |
| Removing an account removes its four `syncReminder.*` keys and its `orgPolicy.lastOk` key | account-removal test | yes |
| Save → background push → Sync Now, end to end | scenario (step 11) | yes |

**Break-it checks:**
- For step 2: revert only the waiter resolution to the old early return and confirm the test goes red naming the
  pending promise; then restore.
- For step 3: route `pushAccount` back to `syncProfile` directly and confirm the concurrency assertion fails.

## 10. Not doing, and why

- **No toast after a background push.** The owner chose the quiet status-bar line (O3); a toast every five
  seconds of editing would be noise.
- **No change to what is synced.** D3/D4 of the consent-policy plan stand: the ladder syncs, the consent stamp
  does not.
- **No change to the debounce interval.** Five seconds is not the defect; being invisible is.
- **No cycle timeout.** Bounding the WAIT (§5.3) is enough to keep callers from hanging. Cancelling a transport
  mid-write is a separate design with its own failure modes.

## 11. Definition of Done

- [ ] Steps 1–4 were watched failing first; the summary reports each failure message and the pass; both break-it
      checks were run.
- [ ] `npm run typecheck` and `npm test` in `src_vs_code` are green; the scenario is catalogued in `module_tests.md`.
- [ ] M1–M3 measured and recorded here; the wording follows M1, and `QUEUED_WAIT_MS` follows M3.
- [ ] `module_extension.md`, the help files (en + ru complete) and `CHANGELOG` updated.
- [ ] The `coai` gate: a `review_code` round ran on `fix/160-sync-says-what-happened`; every finding resolved; the
      verdicts and how many reviewers answered are reported.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; this plan is promoted with
      its deviations when it ships.

## 12. Review record

**Plan gate, 2026-09-26** — session `ed708fa7`, branch `fix/160-sync-says-what-happened`, one round, verdict
`good_enough`, **all 3 reviewers answered** (codex, gemini, local). 13 findings: **10 accepted, 3 rejected.**

| # | Finding (reviewer) | Decision |
|---|---|---|
| 0 | `syncReminder.*` keys never cleared on account removal (local) | accepted — §7 clears all four |
| 1 | `Synced HH:MM` reads as a state, not an event (local) | accepted — §5.4 `Vault open · pushed HH:MM` |
| 2 | cross-window `globalState` assumption (local) | rejected — duplicate of 9, and its fix text was unrelated |
| 3 | a hung cycle would now hang awaiting callers (local) | accepted — §5.3 bounded wait |
| 4 | `setPin` trigger could be background (local) | rejected — it has no background caller (§5.1) |
| 5 | no "syncing" indicator (local) | rejected — already §5.4's spinner |
| 6 | a third request's waiters could be dropped (gemini) | accepted — §5.3 two slots, waiters resolved per cycle |
| 7 | a race between one cycle ending and the next starting (gemini) | accepted — §5.3 synchronous handoff in one loop |
| 8 | "Vault open" must stay the primary label (gemini) | accepted — §5.4 |
| 9 | cross-window fallback undefined (gemini) | accepted — §5.1 fallback wording and scope |
| 10 | `module_tests.md` missing (gemini) | accepted — step 11 |
| 11 | trigger inferred from `verbose` mislabels `pushAccount` / `pullAccount` (codex) | accepted — §5.1 explicit triggers |
| 12 | no scenario test (codex) | accepted — step 11 |

**Own review, 2026-09-26** (a separate code-reviewer pass over the same text, against the code):

- **High:** `pushAccount` bypasses the one-cycle guard → §3.4 and §5.3.
- **Medium:** M1 is already a shipped assumption → cited in §5.1.
- **Low:** `setPin`'s follow-up `syncAll` would have been labelled background → it is `command` in §5.1.
