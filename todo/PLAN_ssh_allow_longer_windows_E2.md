# PLAN — E2 of #197: a window is visible, ends on any lock or from the row, and one prompt per key (feature release)

> Status: **plan only, nothing implemented yet, 2026-10-21.** Scope: `src_vs_code` — `vaultKeys.ts` (`onDidLock`), a
> new `sshAgentWiring.ts` (the SSH wiring moves out of `extension.ts`), `sshAgentManager.ts`, `sshAgentServer.ts`, two
> new pure modules `consentTurns.ts` and `keyedQueue.ts` (`oneUseLane.ts` reuses the second), `treeRowText.ts`,
> `treeDataProvider.ts` (line-neutral), `requestTime.ts` (`clockUntil`), `commands/agentCommands.ts`, `package.json`,
> `.size-baseline.json`, the five `help*.ts`, `README.md`, `CHANGELOG.md`, `scripts/ssh-agent-itest.cjs`; tests and
> test helpers; research docs. Release: `extension-v1.15.0` (`feat:` → minor; the owner approved E1–E3 on 2026-10-20).
>
> Parent: [PLAN_ssh_allow_longer_windows.md](PLAN_ssh_allow_longer_windows.md) § Epics → E2 — the authority on the
> design (§6) and the invariants (§5); this is E2's build order, deciding only §2 and the deviations of §3. Before it:
> [PLAN_ssh_allow_longer_windows_E1.md](PLAN_ssh_allow_longer_windows_E1.md) (shipped in 1.14.2).

## 1. The three stories, in order

One branch, `feat/197-e2-lock-row-and-one-prompt`. Each story is one commit with its own RED tests and its own docs.
Per story: this brief (Opus; Fable writes the cornerstone's spec) → Sonnet codes → Opus reviews → Sonnet fixes.

| # | Story — the guarantee | Model | Parent stories / invariants | RED tests |
|---|---|---|---|---|
| E2.1 | Every lock ends every window, through the one event every lock fires | `model: sonnet`; Fable security judgement at review (outside the quota) | S5, S10.1 (the lock leg); I3 (the lock fence), I6 (the lock half), I7 (guard); O3 | 6 (5 unit + 1 scenario) |
| E2.2 | An open window is on the key's row, and *Ask for Every Use Again* ends it | `model: sonnet` | S8; I3 (the key fence); O4 | 5 (+8 new-function tests) |
| E2.3 | One prompt per key, and an answer that comes late or across a fence opens nothing | **cornerstone — `model: fable`** (spec); Sonnet codes | S6; I3 (the crossings, through the queue), I9; D3 (one prompt per key); O5 | 13 (+2 new modules) |

**The cornerstone: E2.3, the plan's second and last** (quota ⌈2·3/5⌉ = 2, one per area; E1.3 took the window book).
The material boundary's synchronous half (E1.2) shipped with tests that are loud on a real socket. What is left is
concurrency, where a mistake is silent: a continuation after its turn ended, a client that is gone, a queue wait that
ends with the key gone, an answer across a lock or the row button. All four meet in `ConsentTurns` and the manager's
turn handler — one story, one spec. E2.1 and E2.2 come first, so E2.3 crosses the REAL lock seam and button method.

## 2. What this document decides (the parent left it to E2)

- **A lock while a prompt is open.** The prompt stays (VS Code cannot close a modal). A timed answer after the lock is
  `fenced-lock`: this one signature is allowed, no window opens, and one information message says *"The vault locked
  while you were choosing — this signature was allowed once; no window was opened."* *Allow once* and *Deny* behave as
  always. I3 and O3 on purpose (the per-use prompt works while locked); E2.1 pins the outcome, E2.3 adds the message.
- **The row button while a prompt is open.** `fenced-key`, the same shape: *"Ask for Every Use Again was used while you
  were choosing — this signature was allowed once; no window was opened."* Reachable from a row the timer has not
  repainted yet (at most five minutes) and, from E3, beside a Git prompt. E2.2 pins the outcome, E2.3 the message.
- **The ticket is taken when a turn STARTS**, not at arrival: a fence guards the time the prompt is on screen. A lock
  while a request still waits does not fence the answer given after it is shown (O3: a 10-minute window may be
  granted while locked; the next lock ends it).
- **The stale click.** An answer that resolves after its turn ended signs and opens nothing; when a label was clicked
  (not Escape), one information message: *"That signing request had already been refused — it waited longer than
  {bound}, or its program had gone. Nothing was signed."* Never after `dispose()`; not presence (unchanged).
- **The time left.** *"Unanswered, it is refused after {left}."*, `{left}` = `durationText(leftMs)` from the turn — the
  full bound for a request that did not wait, so today's assertions (*5 minutes*, *1 second*) stay true.
- **The cap.** One open turn and at most **three** waiting per key; a fourth is refused at once, never shown later;
  one log line per open turn however many are refused.
- **Per-socket reply order.** Frames are still DISPATCHED at once (`sshAgentServer.test.ts:362` needs two prompts on one
  socket open together); the REPLIES are written in arrival order. Serial handling per socket is rejected: it would
  deadlock that test and add nothing the per-key queue does not do.
- **The modal says what ends a window** (E2.2): *"Locking the vault ends the window, and so does "Ask for Every Use
  Again" on the key's row."* The O6 sentence (*any process signs*) stays E3's. On a row with no open window the
  button says *"\"prod\" had no open window — every use already asks."*

## 3. Verified on `main` fd4a8e33 — and where the parent differs

Every anchor below was re-read on fd4a8e33 (the branch adds only docs). They match the parent except these:

- **E1 moved the manager.** `confirm` is `sshAgentManager.ts:347-369` (parent `:263-285`), `settle` `:383-394`,
  `openWindow` `:404-412`, `askToSign` `:432-455` (bound `:433`, `withTimeout` `:450`, timeout log `:452`), `dispose`
  `:501-511`, `durationText` `:531-538` (parent `:362-370`). `openWindow` already returns `true` for both fences and
  `grantWindow` returns the SAME book on a crossing: once a fence moves, "once, no window" already holds; E2 adds the
  reachability, the pins and the messages. The constructor (`:117-144`) is at complexity 4: E2 adds no parameter.
- **Hooks.** The parent puts `lockedNow`, `autoLockMinutes`, `endLoginWindows` and the config listener in E2; none has a
  user before a `login` window exists, so they move to E3 with `scopesFor`. In E2 the gate and the row read one named
  constant, `ALL_ONLY`; E3 switches both in one commit. Only `onWindowsChanged` ships here. Deviation.
- **Parent S6's *"a request a window covers never waits behind an open prompt"* cannot be built in E2**: with only
  `all`, no window for a key can open while that key's prompt is open. The check stays before any `await`
  (`:361-365`, so before `take`); its test moves to E3 (a login window beside a Git prompt). Deviation.
- **D3's one-prompt half IS red on `main`** (two requests, two dialogs); "cannot be red" is the shortening rule only.
  **OneUseLane has no suite of its own**; the broker drives it (`oneUseAndCap.test.ts`, `burnOnUse.test.ts`).
- **`vaultKeysTamper.test.ts:59` builds a real `VaultKeys` under a stub with no `EventEmitter`** — a field
  `new vscode.EventEmitter()` throws there. Its stub gains `StubEventEmitter` (`vscodeStub.ts:144`).
- **The world** (`sshAgentWorld.ts`): `FakeServer.confirm(key, purpose)` (`:28`) has no `data` and no signal, the stub
  no `EventEmitter` and no `showInformationMessage`. E2.1 adds the emitter; E2.3 widens `confirm` with defaults inside
  the world (an empty buffer, a never-aborted signal — no call site changes) and records messages (`w.infos`).
- **The row asks per (account, node)** (`isBridged`, `treeDataProvider.ts:188`, `:639`); the manager keys by the bare
  entity id (`:103`). `windowsFor(accountId, entityId)` answers `{}` for a key loaded under another account.
- **No HH:MM formatter exists** (`wallTime`, `requestTime.ts:23-27`, prints the date). The parent's `clockUntil` (S7)
  is born in E2.2 for the row; E3's list reuses it. Deviation.
- **The startup notice** (`extension.ts:584`) was corrected by E1.4 and only moves; `sshAgentHelp.test.ts:179-180`
  pins the old strings absent from `extension.ts` and gains the same entries for `sshAgentWiring.ts`.
- **Docs anchors.** The relay bullet is `research/PLAN_wsl_agent_relay.md:89-92`; `architecture.md:458-460` was
  corrected by E1.4 (E2 adds the lock clause); the false sentence is `module_extension.md:4615-4617`; the book row
  `:4845` says *"So today a vault lock does NOT end a window, and there is no row button"*.
- **S10.1 is E3's in the parent**; its lock leg (E2's seam) ships in E2.1 with the 10-minute window. Deviation.

**The constraints that bite (C1–C11), in every brief below.** C1 `complexity ≤ 4` counts defaulted parameters, `?.`
and `??`. C2 `max-lines` 800 holds for tests — new suites, not longer old ones (`sshAgentManager.test.ts` 576,
`sshAgentServer.test.ts` 513). C3 `extension.ts` frozen at 1025 (`.size-baseline.json`); lower it in the commit that
shrinks the file. C4 `treeDataProvider.ts` is at exactly 800. C5 `noUnusedParameters`: an interim unused parameter is
`_name`, or the compile breaks — not a RED. C6 never a literal bidi/format character; escapes (Sonar S6389). C7 a
visible assertion in every test body (S2699). C8 no dynamic call on a requester-keyed lookup (CodeQL): `Map.get`. C9
`node:` imports, `String.raw`, `.includes`. C10 manager tests pass plain `{ entityId, name, fingerprint }`; identity is
the manager's generation. C11 `testsToDelete-…` temp names; a test monotonic clock never starts at 0.

## 4. E2.1 — every lock ends every window, through the one event every lock fires

**RED tests** (new `test/vaultKeysLock.test.ts`; a real `VaultKeys` and a real manager in ONE module graph):

| Test (the guarantee) | RED says |
|---|---|
| every lock ends the SSH windows: *Lock Vaults* and the idle timer, through `VaultKeys.lock()` | `dialogs.length` 1, expected 2 |
| corporate deactivation ends them too: `evictAndLock(vaultKeys)(account)` | `dialogs.length` 1, expected 2 |
| a second lock listener does not displace the agent's | `dialogs.length` 1, expected 2; the other listener heard 0, expected 1 |
| a lock ends windows and never unloads a key: the next signature asks, the key stays loaded, *Allow once* signs | `dialogs.length` 1, expected 2 |
| an answer given across a lock signs once and opens no window (`fenced-lock`, decided in §2) | the next request: `dialogs.length` 1, expected 2 |
| scenario: a real `VaultKeys.lock()` through `connectAgentToLock` ends the window (itest section 6) | the third `ssh-keygen -Y sign` signs with no dialog |

Guards, green before and after: *unlocking re-arms nothing*; *a silent signature is not presence* (I7, `w.presence`).
The REDs are observed on the **interface step** (step 1): on `main` the tests cannot compile, because the seam does not
exist yet — the E1 rule.

**Brief.**

1. **Interface step, suite green.** `vaultKeys.ts`: a private `vscode.EventEmitter<void>` and `readonly onDidLock`
   beside `loginKeys` (`:112-120`), not fired yet. New `src/sshAgentWiring.ts`: `connectAgentToLock(vaultKeys,
   sshAgent): vscode.Disposable` = `vaultKeys.onDidLock(() => sshAgent.endAllWindows('the vaults were locked'))`;
   `SshAgentManager.endAllWindows(_reason: string): void {}` (C5). `vaultKeysTamper.test.ts`'s stub gains `EventEmitter`.
   The world (`sshAgentWorld.ts:58-139`) gains `also?: string[]`, loaded with `../sshAgentManager` through
   `loadEachWithVscode` (`vscodeStub.ts:40`) into ONE graph, its stub gains `StubEventEmitter`, `w.modules` holds them.
2. **The tests, red.** Load `['../vaultKeys', '../sshAgentWiring', '../corpBindingWiring']`; a real `VaultKeys` over a
   Map `SecretStorage`; `connectAgentToLock(vaultKeys, manager)`; answers `[ALLOW_WINDOW, ALLOW_ONCE]`: load, confirm,
   lock, confirm → two dialogs. The crossing test holds `unanswered()` (`sshAgentWorld.ts:229-241`), locks, then
   `clickLate(ALLOW_WINDOW)`. *Unlocking re-arms nothing* uses the silent stored-PIN route; `vaultKeysTamper.test.ts`'s
   private `secretStorage`/`keysHolding` (`:36-78`) move to `test/vaultKeysWorld.ts` for both suites (reuse move 2).
3. **The fix.** `lock()` (`:178-187`) fires `this.locked.fire()` as its LAST statement — every road (`lockNow`
   `extension.ts:375-380` for the idle timer `:384-394` and *Lock Vaults* `commands/keyCommands.ts:409-413`, and
   `evictAndLock` `corpBindingWiring.ts:151-159`) goes through it. `endAllWindows(reason)`: `this.windows =
   endAllWindows(this.windows)` and one log line `every signing window ended: ${reason}`. It never calls `revoke` and
   never touches `this.keys` (E1.2's judgement: one method per meaning — only `serve`/`unload`/`dispose` revoke).
4. **The wiring moves.** `wireSshAgent(deps): SshAgentManager` takes the block `extension.ts:566-587` verbatim — the
   constructor call, `context.subscriptions.push(sshAgent)`, the `loadMarked` notice — plus
   `context.subscriptions.push(connectAgentToLock(vaultKeys, sshAgent))`. Its `deps`: `context`, `storage`,
   `storageDir`, `envCollection`, `vaultKeys`, `onAddress` (the lambda of `:575-578`; `followAgentWithRelay` is a
   hoisted declaration at `:632`, so passing it is safe). `extension.ts` calls it in ≤ 4 lines; `.size-baseline.json`
   drops to the new `wc -l`. `sshAgentHelp.test.ts:179-180` gains the two entries for `sshAgentWiring.ts`.
5. **The scenario** — `scripts/ssh-agent-itest.cjs` section 6, after section 5 inside `withVscodeStub` (`:263-287`), on
   every platform (`ssh-keygen`, no `sshd`). The stub gains `EventEmitter` and a recording `showInformationMessage`;
   `__AGENT_ANSWER__` may be an array, answered in order. A real `VaultKeys` (`out/vaultKeys.js`, a Map
   `SecretStorage`), `connectAgentToLock`, a manager over `path.join(dir, 'w')` (the socket stays under 104 bytes —
   reuse section 5's assert). Answers `[ALLOW_WINDOW, ALLOW_ONCE]`, three real `ssh-keygen -Y sign`: one dialog; none
   new; `lock()`; a second dialog and the log line. A `vscode` the graph needs grows the stub; `VaultKeys` is never mocked.

**Docs.** `CHANGELOG` `[Unreleased]` opens `### Changed — a lock ends every window`: *locking the vaults — by hand, by
the idle timer or by a corporate deactivation — ends every SSH signing window; the key stays loaded and asks again.*
Help (`ssh-agent`, `wsl-relay`; five languages) and `README.md` (`:41`, `:73`, `:289`): *locking the vault ends the
window*. `module_extension.md`: `onDidLock` and `sshAgentWiring.ts` in the diagram (`:42-47`); `:4845` loses *"a vault
lock does NOT end a window"*; `:4615-4617` as it is: *the idle timer and Lock Vaults go through `lockNow`; corporate
deactivation calls `lock()` directly and skips `formPanels.closeAll()` (#258); the SSH windows end inside `lock()`,
through `onDidLock`, so no road skips them.* `architecture.md:460`, `PLAN_wsl_agent_relay.md:89-92`: *…and any lock
of the vault ends the window.* `module_tests.md`: the suite, `vaultKeysWorld.ts` if made, the itest row (`:41`).

**Done when.** The 6 REDs quoted beside their GREENs; `extension.ts` below 1025 and the baseline lowered; suite,
typecheck, lint, ratchet green; Fable's security judgement at review passed. Constraints C1–C11, especially C3 and C5.

## 5. E2.2 — an open window is on the key's row, and *Ask for Every Use Again* ends it

**RED tests:**

| Test (the guarantee) | File | RED says |
|---|---|---|
| every command in the manifest is described in the help (existing) | `test/helpCoverage.test.ts` | with the command added first: `credSshManager.askEveryUseAgain — "Ask for Every Use Again"` |
| *Ask for Every Use Again* ends the window and keeps the key loaded | new `test/sshAgentManagerRow.test.ts` | after the interface step: `dialogs.length` 1, expected 2 |
| an answer given across *Ask for Every Use Again* signs once and opens no window | same | `dialogs.length` 1, expected 2 |
| the row is told to repaint on grant, expiry, lock, button and unload | same | no repaint after any of the five |
| the prompt says what ends a window (§2) | `test/sshAgentManager.test.ts` (+10 lines) | no match for *Locking the vault ends the window* |

**New functions — cannot be red; each with its break-it** (run once, quoted): *a key row with an open window says
until when it signs without asking* (`treeRowText.test.ts`; break-it: return ''); *`:signwindow` only while a window
is open* (always add it); *the menu offers Ask for Every Use Again exactly while a window is open* — the `when` regex
READ from `package.json` against `entityContextValue` (`:agenton` in the `when`); *the end time says "tomorrow" across
midnight* (`clockUntil`, an offset number, local-noon fixtures; drop the day check); *the expiry timer is never armed
for more than five minutes, and re-arms* (`t.mock.timers`, `secretClipboard.test.ts:47`; arm for the full deadline);
*the row never shows a window the gate would not honour* — wall 1 min, monotonic 11 min (read `book.open` raw — E1.3's
judgement 3); *a fence alone is not an open window* — a re-load, then `endWindows` is `false` (`keyFences.has` —
judgement 2); *a row in another account never shows this key's window* (ignore `accountId`).

**Brief.**

1. **Interface step, suite green.** Manager: `endWindows(_entityId: string): boolean { return false; }`,
   `windowsFor(_accountId, _entityId): ScopeWindows { return {}; }`, `onWindowsChanged: () => void = () => undefined`
   (a field, not a parameter — C1). Then the tests, red; then the fix.
2. **`sshAgentManager.ts`.** Every `this.windows = …` (`:198`, `:247`, `:406`, `endAllWindows`, `:504`) goes through one
   private `setWindows(next)`: a new reference → `onWindowsChanged()` and re-arm. `endWindows(id)`: `had` = a non-empty
   `windowsFor`, then `setWindows(endWindows(book, id))` (the fence always moves — I3), log, return `had`.
   `windowsFor(accountId, entityId)`: the loaded key with that `accountId`, else `{}`; then the book's `windowsFor(…,
   ALL_ONLY, now, nowMono)` — never `open`, never `keyFences`. **Timer**: `arm()` clears the old one; `nextExpiry(book,
   now, nowMono)` (`allowWindows.ts:264`) → `setTimeout(min(next − now, 5 min))`, unref'd through one helper
   (`withTimeout.ts:27-29`, C1); on fire `setWindows(withoutExpired(…))` and `arm()` again. `dispose` clears it. The
   prompt text (`:438-440`) gains §2's sentence.
3. **`treeRowText.ts`** (234 lines). `entityContextValue` (`:119`) gains a last `signWindowOpen: boolean = false` →
   `:signwindow` inside the `isSshKey` branch (`:144-149`), live state like `:bridged`. `signWindowLabel(windows:
   ScopeWindows, now: number, offsetMinutes: number): string` → `''`, *signs without asking until 12:10* (`all`),
   *logins without asking until 18:40* (`login`, pure text now, reachable in E3), both joined with `  ·  `.
   `entityDescription(node, now, waitingDescription, signWindow)` takes the join and its comment from
   `treeDataProvider.ts:648-658`. Its doc says the label is live state and NOT filter text (`treeRowText.ts:17-19`).
   `requestTime.ts` gains `clockUntil(epochMs, nowMs, offsetMinutes)` → `18:40`, or `00:05 tomorrow`.
4. **`treeDataProvider.ts` stays at 800 lines** (C4, measured with `wc -l`): +1 the field with its comment on the same
   line (`signWindowLabel: ((accountId: string, nodeId: string) => string) | undefined; // sshAgentWiring.ts`); +1 a local
   `signWindow = this.signWindowLabel?.(accountId, node.id) ?? ''`; +1 the argument `signWindow !== ''` (`:636-642`);
   −2 the join `:656-658` becomes one `entityDescription(...)` line; −1 the `describeRemaining` import (`:25`).
5. **Wiring** (`sshAgentWiring.ts`): `provider.signWindowLabel = (a, id) => signWindowLabel(sshAgent.windowsFor(a, id),
   Date.now(), -new Date().getTimezoneOffset())` and `sshAgent.onWindowsChanged = () => provider.refresh()` — thin,
   covered by E2.1's scenario, said so in the summary.
6. **The command** (`commands/agentCommands.ts`, 772 lines): `credSshManager.askEveryUseAgain` after `removeKeyFromAgent`
   (`:682-700`) — `noteUserActivity`, `asElement`, `keyRowFor` (`:629-636`), `sshAgent.endWindows(id)`, then *"\"prod\"
   asks for every use again — the key stays loaded."* or §2's no-window sentence; no `mutated()`. `package.json`: the
   command beside `:759-763`; `view/item/context` `viewItem =~ /:signwindow/`, group `2_actions@13` (beside
   `:1486-1490`); `commandPalette` `"when": "false"` (as `openSiteInBrowser`, `:1224-1225`), which `manifest.test.ts:102-115` accepts.

**Docs.** `CHANGELOG` `### Added — the row shows an open window; Ask for Every Use Again; one prompt per key`, first
two bullets: *a key whose window is open says so on its row — "signs without asking until 12:10"*; *Ask for Every Use
Again on that row ends the window; the key stays loaded*. Help `ssh-agent` *usage* in five languages (the command name
stays English, as `:187` does) and `README.md:289` gain the row text and the command — 10-minute wording only.
`research/module_extension.md`: the `:signwindow` token beside `:agenton`/`:bridged` (`:2152`), the row, the button,
the timer, `setWindows`; the book row (`:4845`) loses *"there is no row button"*. `module_tests.md`: the new suite.

**Done when.** The 5 REDs and the 8 break-its quoted; `treeDataProvider.ts` exactly ≤ 800; `helpCoverage`,
`manifest`, `readmeClaims` green; the four translations read sentence by sentence against the English by the Opus
review, its verdict quoted in the PR. Constraints C1–C11, especially C1, C4, C7.

## 6. E2.3 — one prompt per key, and an answer that comes late or across a fence opens nothing (cornerstone, `model: fable`)

**RED tests:**

| Test (the guarantee) | File | RED on `main` says |
|---|---|---|
| a pipelined identities request behind a held sign request is answered in order | `test/sshAgentServer.test.ts` | first reply type `12` (IDENTITIES_ANSWER), expected the sign reply |
| a closed client connection aborts its request's signal | same | after the interface step: not aborted within 2 s |
| a second request for the same key waits for the open prompt | new `test/sshAgentManagerTurns.test.ts` | `dialogs.length` 2, expected 1 |
| a window opened by the first prompt covers the waiting request without a prompt | same | `dialogs.length` 2 |
| a request whose key was removed while it waited is refused without a prompt (E1.2's judgement 1) | same | `dialogs.length` 2 |
| a request whose client has gone leaves the queue and is never shown | same | `dialogs.length` 2 |
| a fourth waiting request is refused at once and never shown later | same | 5 dialogs; it waited for an answer |
| a request whose bound ran out while it waited is never shown | same | `dialogs.length` 2 |
| a request that waited says the time it really has left | same | the dialog says the full bound |
| a click on a prompt whose turn ended signs nothing, and says so | same | no information message |
| an answer given across a lock: once, no window, and the message says the vault locked | same | no message (on `main` the lock reaches nothing; on E2.2's head the crossing is silent) |
| an answer given across *Ask for Every Use Again*: once, no window, and the message says so | same | no message |
| a lock while a request waits does not fence the answer given after its turn starts (§2) | same | RED on E2.2's head: the next request prompts (`fenced-lock`); `main` cannot show it |

Guards, green before and after: *different keys do not wait for each other*; *Allow once authorises only its own
signature — the waiting request still asks* (pins that the answer is never SHARED the broker's way,
`brokerConsent.ts:63`); *an unanswered prompt does not wedge the key*; *after `dispose()` no message and no log line*
(`sshAgentManagerLog.test.ts:42-65`); `sshAgentManager.test.ts:322-337` stays green. **New modules — cannot be red:**
`consentTurns.test.ts`, `keyedQueue.test.ts`, each guarantee with its break-it.

**The frame Fable's spec starts from** (where the spec differs, the spec wins and closes this list).

1. **`keyedQueue.ts`** — the keyed-tail half of `OneUseLane.run` (`oneUseLane.ts:70-84`), moved: `run<T>(key, work)`
   chains per key, advances on failure as on success (`.then(next, next)`), deletes a key whose tail is its own.
   `OneUseLane` keeps `afterTheQueue` (`:86-91`) and calls the queue (reuse move 2); `oneUseAndCap.test.ts` and
   `burnOnUse.test.ts` stay green on it.
2. **`consentTurns.ts`** (pure, no `vscode`): `new ConsentTurns(boundMs, now: () => number, maxWaiting = 3)` (C1: two
   branches) and `take(key, request: AbortSignal, work: (turn: AbortSignal, leftMs: number) => Promise<T>):
   Promise<TurnOutcome<T>>` per parent §6.4. The bound runs from ARRIVAL over the wait and the turn. `request` already
   aborted → `gone`; more than `maxWaiting` already waiting → `full`, at once. A waiter that leaves (its signal, or its
   bound) resolves at once and its turn never runs `work`. The turn's signal fires on the bound OR the request's
   signal; **the queue advances when the turn's signal fires, not when `work` settles** — a modal that never settles
   must not wedge the key. A late `work` result is dropped and its rejection caught. The waiting count per key is
   deleted at zero (parent §8). `now` is the manager's monotonic clock; `leftMs` = deadline − `now()` at turn start.
3. **`sshAgentServer.ts`.** Interface step first: `confirm(key, purpose, data, signal: AbortSignal)`
   (`:56`), the server passing a never-aborted signal, the world's `FakeServer` filling defaults (§3) — suite green.
   Then `serve` (`:100-116`): one `AbortController` per connection, aborted on `close` (`:104`); `handle` (`:118-130`)
   RETURNS its reply instead of writing it, and the frame loop (`:112-114`) chains the writes in arrival order:
   `replies = replies.then(() => answer).then((reply) => this.write(socket, reply))`, a rejection answered with
   `encodeFailure()` and logged. The post-await check (`:152`) stays.
4. **`sshAgentManager.ts`.** `turns = new ConsentTurns(this.consentTimeoutMs, this.monotonic)` in the constructor body.
   `confirm(key, purpose, data, signal)` keeps its arrival reads and its covered check BEFORE any `await` (`:350-365`),
   then `take(key.entityId, signal, (turn, leftMs) => this.turnStarted(...))`. `full` / `gone` / `timed-out` → `false`,
   one reason line each (`timed-out` keeps `no answer in ${bound} — refused …`, `:452`, which the itest and
   `sshAgentManager.test.ts:307` read; `full` once per open turn). `turnStarted`: **the membership check after the
   queue wait** — `generationOf(id) !== arrived.generation` → `false` without a prompt (E1.2's judgement 1); then the
   window re-check (covered → `logCovered`, `true`); then the ticket (`askTicket`, NOW — §2) and the prompt. It returns
   the raw answer and the ticket; **`settle` runs only on an `answered` outcome**, never inside the turn. `askToSign`
   loses `withTimeout` (`:450`) and races the modal against the turn's signal; after its `await`, a fired signal →
   the stale-click message (§2) when a label came back, and nothing else. The bound sentence uses `leftMs`.
   `openWindow`'s crossings: `fenced-lock` / `fenced-key` → `true`, nothing opened, the two messages of §2 through one
   `tell(text)` that says nothing after `dispose()`.
5. **Tests** use the world's `unanswered()` modals, a fake monotonic clock that starts at `M = 50_000` (C11), short real
   bounds or `t.mock.timers` — never a wait on a real five-minute timer. `w.infos` records the information messages.

**The traps the spec must pin, each with a test:** the queue advanced on `work` settling (*an unanswered prompt does
not wedge the key*); the ticket taken at arrival (*a lock while a request waits…*); `settle` inside the turn, so a late
continuation writes a window (*a click on a prompt whose turn ended…* and `sshAgentManager.test.ts:322`); the
membership check only before the wait (*…removed while it waited…*); a gone waiter still counted toward the cap; the
answer shared between waiters; `leftMs` read from the wall clock; a late rejection unhandled (the suite's
`unhandledRejection` fails the run); per-socket order bought with serial handling (`sshAgentServer.test.ts:362` hangs).

**Docs.** `CHANGELOG`, the same `### Added`, third bullet: *one prompt per key at a time — a second request waits, at
most three wait, a request whose program has gone leaves the queue; a click on a prompt already refused says so.*
`module_extension.md`: both modules in the diagram, the turn as a sequence diagram (arrival → covered? → take →
membership → covered? → ticket → prompt → answered → settle → openWindow), the reply order, the crossing messages.
`module_tests.md`: the three suites. The `oneUseLane.ts` doc names `keyedQueue.ts`.

**Done when.** The 13 REDs quoted beside their GREENs and every break-it of the two new modules run once; every
function in the touched files ≤ 4 complexity and ≤ 50 lines; Opus review and Fable's security judgement passed.
Constraints C1–C11, especially C1, C2, C7, C8, C10, C11.

## 7. Epic Definition of Done

- [ ] Every story's RED was observed on the code before its fix (the interface step where §4–§6 say so) and is
      quoted in the PR beside its GREEN — 24 REDs; every break-it of the new functions and modules quoted once.
- [ ] In `src_vs_code`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run ratchet` green; `.size-baseline.json`
      lowered for `extension.ts`; `treeDataProvider.ts` ≤ 800; `helpCoverage` and `manifest` green for the new command.
- [ ] `npm run itest:ssh-agent` green locally (Windows runs sections 1–4 and 6) **and in a Linux container**
      (`docker run --rm --name testsToDelete-ait-e2-<id>`, a non-root user, `openssh-server` + `openssh-client`, the
      worktree copied in), so sections 5 and 6 both RUN — output quoted; green in CI (`ci-extension.yml:150`).
- [ ] Seen once in the Extension Development Host: grant → the row says *signs without asking until …* → *Ask for
      Every Use Again* clears it; grant again → *Lock Vaults* clears it. Recorded in the PR.
- [ ] Temp folders carry `testsToDelete-`; docs landed with each story; Mermaid renders; `plan-lifecycle.mjs` and
      `pin-check.mjs` pass.
- [ ] coai `review_code` with `plan: todo/PLAN_ssh_allow_longer_windows.md`, `epic: 2/3`; every finding resolved;
      verdicts and reviewer counts reported.
- [ ] PR opened; CodeRabbit answered; Sonar (quality gate) and CodeQL green; merged on green checks only.
- [ ] Release through release-please: dispatch → the changelog PR → merge the release PR → dispatch again for
      `extension-v1.15.0`; the Marketplace shows 1.15.0 (verified, not assumed); this status line records it.
