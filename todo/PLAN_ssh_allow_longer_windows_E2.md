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
| E2.2 | An open window is on the key's row, and *Ask for Every Use Again* ends it | `model: sonnet` | S8; I3 (the key fence); O4 | 5 (+11 new-function tests) |
| E2.3 | One prompt per key, and an answer that comes late or across a fence opens nothing | **cornerstone — `model: fable`** (spec); Sonnet codes | S6; I3 (the crossings, through the queue), I9; D3 (one prompt per key); O5 | 16 (+2 new modules) |

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
- **One modal on screen per key — the prompt SLOT** (gate G0 + G3). VS Code cannot close a modal, so a key's slot stays
  held until its modal actually SETTLES (a click, Escape, the window closing) or `dispose()` — not until its turn ends.
  A turn that ends first (timed out, client gone) leaves an ORPHANED modal: its request is refused at once, every
  request already waiting for that key is refused at that moment, and every new request for it is refused AT ONCE
  (FAILURE, no prompt, no wait), with one log line and ONE non-modal notice per orphaned modal: *"A signing prompt for
  "prod" is still open from an earlier request — answer or close it."* When the orphaned modal settles, nothing is
  signed for it (the stale click, below) and the slot frees; the next request prompts.
- **The stale click** (R1). The prompt's own continuation awaits the modal to the end — it is the watcher; only
  `ConsentTurns` races, and only for the turn's OUTCOME. When a label comes back after the turn ended, nothing is
  signed or opened and one information message says *"That signing request had already been refused — it waited
  longer than {bound}, or its program had gone. Nothing was signed."* Never after `dispose()`; not presence.
- **The order: an answer is APPLIED inside the turn** (R4). After the modal resolves, the same synchronous continuation
  checks `!turn.aborted` and, if live, applies the answer (decision, presence, `openWindow`) before it returns; the slot
  frees only when that continuation settles. So the next turn's re-check always sees the window — by construction,
  not by counting promise hops. No macrotask (a timer, a socket `close`) can run between the check and the apply.
- **The time left.** *"Unanswered, it is refused after {left}."*, `{left}` = `durationText(leftMs)` from the turn — the
  full bound for a request that did not wait, so today's assertions (*5 minutes*, *1 second*) stay true.
- **The floor** (R5). A request that WAITED and has less than `promptFloor(bound) = min(MIN_PROMPT_MS, bound / 20)` left
  at its turn start is refused there without a prompt (`MIN_PROMPT_MS = 15_000`; 15 s in production, where the bound
  is 5 min; it scales with a test's short bound). A request that did not wait always has the full bound.
- **The cap** (R6). The open turn does not count: 1 open + at most **three** waiting per key; the FIFTH request is
  `full` at once and never shown later. One log line per open turn however many are refused.
- **Per-socket reply order.** Frames are still DISPATCHED at once (`sshAgentServer.test.ts:362` needs two prompts on one
  socket open together); the REPLIES are written in arrival order, each reply's promise caught AT DISPATCH (R7), so a
  rejection behind a held reply is never unhandled. Serial handling per socket is rejected: it deadlocks that test.
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
- **`entityItem` (`treeDataProvider.ts:622-671`) already scores 3**: an optional hook called with `?.` and `??` makes 5
  (R2). The row hook is a non-optional field with a default, called plainly.
- **Docs anchors.** The relay bullet is `research/PLAN_wsl_agent_relay.md:89-92`; `architecture.md:458-460` was
  corrected by E1.4 (E2 adds the lock clause); the false sentence is `module_extension.md:4615-4617`; the E1.2 row
  `:4844` ends *"the lock and the row button … are still to come"*; the book row `:4845` says *"So today a vault lock
  does NOT end a window, and there is no row button"*.
- **S10.1 is E3's in the parent**; its lock leg (E2's seam) ships in E2.1 with the 10-minute window. Deviation.

**The constraints that bite (C1–C11), in every brief below.** C1 `complexity ≤ 4` counts defaulted parameters, `?.`
and `??`. C2 `max-lines` 800 holds for tests — new suites, not longer old ones (`sshAgentManager.test.ts` 576,
`sshAgentServer.test.ts` 513). C3 `extension.ts` frozen at 1025 (`.size-baseline.json`); lower it in the commit that
shrinks the file. C4 `treeDataProvider.ts` is at exactly 800. C5 `noUnusedParameters`: an interim unused parameter is
`_name`, or the compile breaks — not a RED. C6 never a literal bidi/format character; escapes (Sonar S6389). C7 a
visible assertion in every test body (S2699). C8 no dynamic call on a requester-keyed lookup (CodeQL): `Map.get`. C9
`node:` imports, `String.raw`, `.includes`. C10 manager tests pass plain `{ entityId, name, fingerprint }`; identity is
the manager's generation. C11 `testsToDelete-…` temp names; a test monotonic clock never starts at 0. C12 every new
suite that loads a key ends with the key-material guard (`keyMaterialLogged()`, `sshAgentWorld.ts`), as
`sshAgentManager.test.ts:573` does.

## 4. E2.1 — every lock ends every window, through the one event every lock fires

**RED tests** (new `test/vaultKeysLock.test.ts`; a real `VaultKeys` and the manager `wireSshAgent` builds, in ONE
module graph — the tests drive `wireSshAgent(deps)` itself, R3, so the wiring is under test, not only the helper):

| Test (the guarantee) | RED says |
|---|---|
| every lock ends the SSH windows: *Lock Vaults* and the idle timer, through `VaultKeys.lock()` | `dialogs.length` 1, expected 2 |
| corporate deactivation ends them too: `evictAndLock(vaultKeys)(account)` | `dialogs.length` 1, expected 2 |
| a second lock listener does not displace the agent's | `dialogs.length` 1, expected 2; the other listener heard 0, expected 1 |
| a lock ends windows and never unloads or revokes a key: the next signature asks, the key stays loaded, and the captured `LoadedKey.sign` still returns a Buffer (R8) | `dialogs.length` 1, expected 2 |
| an answer given across a lock signs once and opens no window (`fenced-lock`, decided in §2) | the next request: `dialogs.length` 1, expected 2 |
| scenario: a real `VaultKeys.lock()` through `wireSshAgent`'s seam ends the window (itest section 6) | the third `ssh-keygen -Y sign` signs with no dialog |

Guards, green before and after: *unlocking re-arms nothing*; *a silent signature is not presence* (I7, `w.presence`).
New function, with its break-it: *`wireSshAgent` puts the manager and the lock subscription into
`context.subscriptions`* (drop the push). The REDs are observed on the **interface step** (step 1): on `main` the tests
cannot compile, because the seam does not exist yet — the E1 rule.

**Brief.**

1. **Interface step, suite green — the wiring moves, the lock does not fire yet.** `vaultKeys.ts`: a private
   `vscode.EventEmitter<void>` and `readonly onDidLock` beside `loginKeys` (`:112-120`), not fired.
   `SshAgentManager.endAllWindows(_reason: string): void {}` (C5). New `src/sshAgentWiring.ts`:
   `connectAgentToLock(vaultKeys, sshAgent): vscode.Disposable` = `vaultKeys.onDidLock(() => sshAgent.endAllWindows('the
   vaults were locked'))`, and `wireSshAgent(deps): SshAgentManager`, which takes the block `extension.ts:566-587`
   verbatim (the constructor call, `context.subscriptions.push(sshAgent)`, the `loadMarked` notice) plus
   `context.subscriptions.push(connectAgentToLock(vaultKeys, sshAgent))`. Its `deps`: `context`, `storage`,
   `storageDir`, `envCollection`, `vaultKeys`, `onAddress` (the lambda of `:575-578`). **The `onAddress` hazard is
   `wslRelay`**: `followAgentWithRelay` (`:632`) is a hoisted declaration, but it reads `wslRelay`, a `const` declared
   later (`:592`) — it is safe only because no address is published during construction: `load()` awaits the vault read
   before `ensureStarted` (`sshAgentManager.ts:180-189`). Said in a comment at the call. `extension.ts` calls
   `wireSshAgent` in ≤ 4 lines; `.size-baseline.json` drops to the new `wc -l`; `sshAgentHelp.test.ts:179-180` gains
   the two entries for `sshAgentWiring.ts`. `vaultKeysTamper.test.ts`'s stub gains `EventEmitter`. The world
   (`sshAgentWorld.ts:58-139`) gains `also?: string[]`, loaded with `../sshAgentManager` through `loadEachWithVscode`
   (`vscodeStub.ts:40`) into ONE graph; its stub gains `StubEventEmitter`; `w.modules` holds them. `servedKey` and
   `SIGNED_BYTES` (`sshAgentManager.test.ts:527-532`) move to the world for every suite (reuse move 2).
2. **The tests, red.** Load `['../vaultKeys', '../sshAgentWiring', '../corpBindingWiring']`; a real `VaultKeys` over a
   Map `SecretStorage`; `wireSshAgent({ context: { subscriptions: [] }, storage stub, … , vaultKeys })`; the world's
   `server()` is the gate. Answers `[ALLOW_WINDOW, ALLOW_ONCE]`: load, confirm, lock, confirm → two dialogs; the
   no-revoke test then asserts `servedKey(w).sign(SIGNED_BYTES, 0)` is a Buffer (the shape of
   `sshAgentManager.test.ts:546`). The crossing test holds `unanswered()` (`sshAgentWorld.ts:227-243`), locks, then
   `clickLate(ALLOW_WINDOW)`. *Unlocking re-arms nothing* uses the silent stored-PIN route; `vaultKeysTamper.test.ts`'s
   private `secretStorage`/`keysHolding` (`:36-78`) move to `test/vaultKeysWorld.ts` for both suites (reuse move 2).
   The suite ends with the key-material guard (C12).
3. **The fix.** `lock()` (`:178-187`) fires `this.locked.fire()` as its LAST statement — every road (`lockNow`
   `extension.ts:375-380` for the idle timer `:384-394` and *Lock Vaults* `commands/keyCommands.ts:409-413`, and
   `evictAndLock` `corpBindingWiring.ts:151-159`) goes through it. `endAllWindows(reason)`: `this.windows =
   endAllWindows(this.windows)` and one log line `every signing window ended: ${reason}`. It never calls `revoke` and
   never touches `this.keys` (E1.2's judgement: one method per meaning — only `serve`/`unload`/`dispose` revoke).
4. **The scenario** — `scripts/ssh-agent-itest.cjs` section 6, after section 5 inside `withVscodeStub` (`:263-287`), on
   every platform (`ssh-keygen`, no `sshd`). The stub gains `EventEmitter` and a recording `showInformationMessage`;
   `__AGENT_ANSWER__` may be an array, answered in order. A real `VaultKeys` (`out/vaultKeys.js`, a Map
   `SecretStorage`), `connectAgentToLock`, a manager over `path.join(dir, 'w')` (the socket stays under 104 bytes —
   reuse section 5's assert). Answers `[ALLOW_WINDOW, ALLOW_ONCE]`, three real `ssh-keygen -Y sign`: one dialog; none
   new; `lock()`; a second dialog, the log line, and the third `ssh-keygen` **exits 0** (the key was not revoked, R8).
   A `vscode` the graph needs grows the stub; `VaultKeys` is never mocked.

**Docs.** `CHANGELOG` `[Unreleased]` opens `### Changed — a lock ends every window`: *locking the vaults — by hand, by
the idle timer or by a corporate deactivation — ends every SSH signing window; the key stays loaded and asks again.*
Help (`ssh-agent`, `wsl-relay`; five languages) and `README.md` (`:41`, `:73`, `:289`): *locking the vault ends the
window*. `module_extension.md`: `onDidLock` and `sshAgentWiring.ts` in the diagram (`:42-47`); `:4844` loses *"the
lock … still to come"*; `:4845` loses *"a vault lock does NOT end a window"*; `:4615-4617` as it is: *the idle timer and Lock Vaults go through `lockNow`; corporate
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
| *Ask for Every Use Again* ends the window and keeps the key loaded — the captured `sign` still returns a Buffer (R8) | new `test/sshAgentManagerRow.test.ts` | after the interface step: `dialogs.length` 1, expected 2 |
| an answer given across *Ask for Every Use Again* signs once and opens no window | same | `dialogs.length` 1, expected 2 |
| the row is told to repaint on grant, expiry, lock, button and unload — through `wireSshAgent`'s stub `provider.refresh` (R3) | `test/vaultKeysLock.test.ts` | no `refresh` after any of the five |
| the prompt says what ends a window (§2) | `test/sshAgentManager.test.ts` (+10 lines) | no match for *Locking the vault ends the window* |

**New functions — cannot be red; each with its break-it** (run once, quoted): *a key row with an open window says
until when it signs without asking* (`treeRowText.test.ts`; break-it: return ''); *`:signwindow` only while a window
is open* (always add it); *the menu offers Ask for Every Use Again exactly while a window is open* — the `when` regex
READ from `package.json` against `entityContextValue` (`:agenton` in the `when`); *the end time says "tomorrow" across
midnight* (`clockUntil`, an offset number, local-noon fixtures; drop the day check); *the expiry timer is never armed
for more than five minutes, and re-arms* (`t.mock.timers`, `secretClipboard.test.ts:47`; arm for the full deadline);
*the row never shows a window the gate would not honour* — wall 1 min, monotonic 11 min (read `book.open` raw — E1.3's
judgement 3); *a fence alone is not an open window* — a re-load, then `endWindows` is `false` (`keyFences.has` —
judgement 2); *a row in another account never shows this key's window* (ignore `accountId`); *the row's label reaches
the tree through `wireSshAgent`* — a grant, then the stub provider's `signWindowLabel` says *signs without asking*
(leave the assignment out); and, through the `addKeyToAgentReference.test.ts` harness (R9, its `world()` at `:47`),
*Ask for Every Use Again on a CONNECTION row ends the windows of the key it points at* (`keyRowFor`; break-it: pass the
connection's own id) and *it says which of the two sentences is true* (`had` true → *asks for every use again*, false →
*had no open window*; break-it: one sentence for both).

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
   `treeDataProvider.ts:651-658`. Its doc says the label is live state and NOT filter text (`treeRowText.ts:17-19`).
   `requestTime.ts` gains `clockUntil(epochMs, nowMs, offsetMinutes)` → `18:40`, or `00:05 tomorrow`.
4. **`treeDataProvider.ts` stays at 800 lines** (C4, measured with `wc -l`) **and `entityItem` stays at complexity 3**
   (R2 — it scores 3 today, `:622-671`; `?.` + `??` would make 5). +1 a NON-optional field with a default, on one line:
   `signWindowLabel: (accountId: string, nodeId: string) => string = () => '';`; +1 a local `const signWindow =
   this.signWindowLabel(accountId, node.id);` — no `?.`, no `??`; +1 the argument `signWindow !== ''` (`:636-642`); −2
   the join `:656-658` becomes one `entityDescription(...)` line; −1 the `describeRemaining` import (`:25`).
5. **Wiring** (`sshAgentWiring.ts`): `deps` gain `provider` (`{ refresh(): void; signWindowLabel: … }`);
   `provider.signWindowLabel = (a, id) => signWindowLabel(sshAgent.windowsFor(a, id), Date.now(),
   -new Date().getTimezoneOffset())` and `sshAgent.onWindowsChanged = () => provider.refresh()`. Both are driven by the
   `wireSshAgent` tests above (R3) — no scenario claim.
6. **The command** (`commands/agentCommands.ts`, 772 lines): `credSshManager.askEveryUseAgain` after `removeKeyFromAgent`
   (`:687-706`) — `noteUserActivity`, `asElement`, `keyRowFor` (`:629-636`), `sshAgent.endWindows(id)`, then *"\"prod\"
   asks for every use again — the key stays loaded."* or §2's no-window sentence; no `mutated()`. The harness of
   `addKeyToAgentReference.test.ts` gains `endWindows` on its `sshAgent` fake. `package.json`: the command beside
   `:759-763`, with `"icon": "$(circle-slash)"` (a codicon); **two** `view/item/context` entries on
   `viewItem =~ /:signwindow/` — a ROW BUTTON, group `inline@2` (key rows hold *Install Key* at `inline@1`, `:1434`),
   and the context-menu item, group `2_actions@13` (beside `:1486-1490`); `commandPalette` `"when": "false"` (as
   `openSiteInBrowser`, `:1224-1225`), which `manifest.test.ts:99-111` accepts. The menu test reads both `when`s.

**Docs.** `CHANGELOG` `### Added — the row shows an open window; Ask for Every Use Again; one prompt per key`, first
two bullets: *a key whose window is open says so on its row — "signs without asking until 12:10"*; *Ask for Every Use
Again on that row ends the window; the key stays loaded*. Help `ssh-agent` *usage* in five languages (the command name
stays English, as `:187` does) and `README.md:289` gain the row text and the command — 10-minute wording only.
`research/module_extension.md`: the `:signwindow` token beside `:agenton`/`:bridged` (`:2152`), the row, the button,
the timer, `setWindows`; `:4844` loses *"the row button … still to come"*, `:4845` *"there is no row button"*.
`module_tests.md`: the new suite and the harness's new cases.

**Done when.** The 5 REDs and the 11 break-its quoted; `treeDataProvider.ts` exactly ≤ 800; `helpCoverage`,
`manifest`, `readmeClaims` green; the four translations read sentence by sentence against the English by the Opus
review, its verdict quoted in the PR. Constraints C1–C11, especially C1, C4, C7.

## 6. E2.3 — one prompt per key, and an answer that comes late or across a fence opens nothing (cornerstone, `model: fable`)

**RED tests:**

| Test (the guarantee) | File | RED on `main` says |
|---|---|---|
| a pipelined identities request behind a held sign request is answered in order | `test/sshAgentServer.test.ts` | first reply type `12` (IDENTITIES_ANSWER), expected the sign reply |
| a closed client connection aborts its request's signal | same | after the interface step: not aborted within 2 s |
| a confirm that throws behind a held prompt is answered FAILURE, in order, with no unhandled rejection (R7) | same | no reply within 5 s (the rejection escapes `void this.handle`) |
| a second request for the same key waits for the open prompt | new `test/sshAgentManagerTurns.test.ts` | `dialogs.length` 2, expected 1 |
| a window opened by the first prompt covers the waiting request without a prompt (R4: no hop counting — the test awaits only the two `confirm` promises) | same | `dialogs.length` 2 |
| a request whose key was removed while it waited is refused without a prompt (E1.2's judgement 1) | same | `dialogs.length` 2 |
| a request whose client has gone leaves the queue and is never shown | same | `dialogs.length` 2 |
| the fifth request (1 open + 3 waiting) is refused at once and never shown later (R6) | same | 5 dialogs; it waited for an answer |
| a burst of refusals at the cap writes one log line (low) | same | no such line |
| a request that waited says the time it really has left | same | the dialog says the full bound |
| a waiter left with less than the floor is refused at its turn, never shown a modal it cannot answer (R5: bound 5 min on fake time, it waits 4 min 54 s) | same | `dialogs.length` 2; the second says *refused after 5 minutes* |
| **while an orphaned modal holds the key, a new request is refused at once; answering the orphan signs nothing, says so, and frees the key** (G0/G3) — leave modal 1 unanswered, let its request time out; request 2 → `false` at once, `dialogs.length` 1, the notice once (request 3 adds no second notice); answer modal 1 → nothing signed, the stale message; request 4 → prompts | same | request 2 prompts: `dialogs.length` 2 |
| a click on a prompt whose turn ended signs nothing, and says so (R1: the label comes back after the outcome was decided) | same | no information message |
| an answer given across a lock: once, no window, and the message says the vault locked | same | no message (on `main` the lock reaches nothing; on E2.2's head the crossing is silent) |
| an answer given across *Ask for Every Use Again*: once, no window, and the message says so | same | no message |
| a lock while a request waits does not fence the answer given after its turn starts (§2) | same | RED on E2.2's head: the next request prompts (`fenced-lock`); `main` cannot show it |

Guards, green before and after: *different keys do not wait for each other*; *Allow once authorises only its own
signature — the waiting request still asks* (pins that the answer is never SHARED the broker's way,
`brokerConsent.ts:63`); *after `dispose()` no message, no log line, and every slot is free*
(`sshAgentManagerLog.test.ts:42-65`); `sshAgentManager.test.ts:322-337` stays green (its late click now also shows the
stale message — `w.infos` must exist first). **New modules — cannot be red:** `consentTurns.test.ts`,
`keyedQueue.test.ts`, each guarantee with its break-it; among them (G2) *the per-key bookkeeping is empty again after
every outcome* — answered, timed-out, gone, full, orphaned, work rejected — read through `pending(): number` (for tests,
deciding nothing, as `SharedPrompts.isOpen`, `sharedPrompt.ts:87-90`).

**The frame Fable's spec starts from** (where the spec differs, the spec wins and closes this list).

1. **`keyedQueue.ts`** — the keyed-tail half of `OneUseLane.run` (`oneUseLane.ts:70-84`), moved: `run<T>(key, work)`
   chains per key, advances when `work` SETTLES, on failure as on success (`.then(next, next)`), and deletes a key
   whose tail is its own. `OneUseLane` keeps `afterTheQueue` (`:86-91`) and calls the queue (reuse move 2);
   `oneUseAndCap.test.ts` and `burnOnUse.test.ts` stay green on it. Its "advance when work settles" IS the prompt slot.
2. **`consentTurns.ts`** (pure, no `vscode`): `new ConsentTurns(boundMs, now: () => number, maxWaiting = 3)` (C1: two
   branches) and `take(key, request: AbortSignal, work: (turn: AbortSignal, leftMs: number) => Promise<T>):
   Promise<TurnOutcome<T>>`, outcomes `answered | timed-out | gone | full | orphaned | too-late`.
   - The bound runs from ARRIVAL over the wait and the turn. `request` already aborted → `gone`; three already waiting
     (the open turn not counted) → `full`; the key's slot held by an orphaned modal → `orphaned` — all at once,
     without joining the queue.
   - **The slot** (G0): a turn holds the key from its start until its `work` SETTLES. The turn's signal fires on the
     bound OR the request's signal; then `take` resolves `timed-out`/`gone` at once, the slot stays held (ORPHANED),
     and every waiter of that key resolves `orphaned` at that moment. When `work` settles, the slot frees.
   - A waiter's own bound cannot run out behind a LIVE turn: that turn arrived earlier with the same bound, so it times
     out first and orphans the slot. A waiter therefore leaves by its signal (`gone`) or by the orphan (`orphaned`),
     resolves at once, and its turn never runs `work`. At turn start a
     request that waited with `leftMs < promptFloor(boundMs)` resolves `too-late` without running `work` (R5).
   - The outcome is the FIRST of `work`'s value and the turn's abort; nothing is applied outside `work` (R4).
   - **G2:** `catch` and `finally` are attached to `work` on EVERY outcome; a late value is dropped, a rejection is
     caught; every per-key map entry (waiting count, orphan flag, queue tail) is deleted when it returns to empty;
     `pending()` reads it for tests. `now` is the manager's monotonic clock; `leftMs` = deadline − `now()`.
3. **`sshAgentServer.ts`.** Interface step first: `confirm(key, purpose, data, signal: AbortSignal)`
   (`:56`), the server passing a never-aborted signal, the world's `FakeServer` filling defaults (§3) — suite green.
   Then `serve` (`:100-116`): one `AbortController` per connection, aborted on `close` (`:104`); `handle` (`:118-130`)
   RETURNS its reply instead of writing it. The frame loop (`:112-114`) catches each reply AT DISPATCH and chains only
   the writes (R7): `const answer = this.handle(frame, signal).catch((error) => this.failed(error))` (log +
   `encodeFailure()`), then `replies = replies.then(() => answer).then((reply) => this.write(socket, reply))`. The
   post-await check (`:152`) stays.
4. **`sshAgentManager.ts`.** `turns = new ConsentTurns(this.consentTimeoutMs, this.monotonic)` in the constructor body.
   `confirm(key, purpose, data, signal)` keeps its arrival reads and its covered check BEFORE any `await` (`:350-365`),
   then `take(key.entityId, signal, (turn, leftMs) => this.turnStarted(...))`. Every outcome but `answered` → `false`,
   one reason line each (`timed-out` keeps `no answer in ${bound} — refused …`, `:452`, which the itest and
   `sshAgentManager.test.ts:307` read; `full` once per open turn; `orphaned` one line and ONE notice per orphaned modal,
   §2). `turnStarted` is the whole turn: **the membership check after the queue wait** — `generationOf(id) !==
   arrived.generation` → `false` without a prompt (E1.2's judgement 1); the window re-check (covered → `logCovered`,
   `true`); the ticket (`askTicket`, NOW — §2); then `askToSign`, which loses `withTimeout` (`:450`) and awaits the
   modal to the end (it is R1's watcher; a rejecting modal is `modalFailed`, which also settles the slot). After that
   `await`, synchronously: `turn.aborted` → the stale message when a label came back, `false`; else `settle` and
   `openWindow`, in the same continuation (R4). The bound sentence uses `leftMs`. The crossings `fenced-lock` /
   `fenced-key` → `true`, nothing opened, §2's messages, all through one `tell(text)` that is silent after `dispose()`.
   `dispose()` frees every slot (a new `ConsentTurns`, or its own `clear()`).
5. **Tests** use the world's `unanswered()` modals, a fake monotonic clock that starts at `M = 50_000` (C11), short real
   bounds or `t.mock.timers` — never a wait on a real five-minute timer. `w.infos` records the information messages.
   Every new suite ends with the key-material guard (C12).

**The traps the spec must pin, each with a test:** the slot freed when the turn's signal fires, so a second modal
appears beside an orphan (the G0 test); waiters left queued behind an orphan (the G0 test); the ticket taken at arrival
(*a lock while a request waits…*); the answer applied AFTER the outcome, outside the turn, so the next turn can start
first (R4's test) or a late continuation writes a window (*a click on a prompt whose turn ended…*,
`sshAgentManager.test.ts:322`); the stale message lost because a race dropped the modal (R1's test); the membership
check only before the wait (*…removed while it waited…*); a gone waiter still counted toward the cap; the open turn
counted toward it (R6); the answer shared between waiters; `leftMs` from the wall clock; a late rejection unhandled
(the run's `unhandledRejection` fails it — G2, R7); per-socket order bought with serial handling (`:362` hangs).

**Docs.** `CHANGELOG`, the same `### Added`, third bullet: *one prompt per key at a time — a second request waits, at
most three wait, a request whose program has gone leaves the queue; while an earlier prompt for a key is still on
screen, a new request for that key is refused and you are told; a click on a prompt already refused says so.*
`module_extension.md`: both modules in the diagram, the turn as a sequence diagram (arrival → covered? → take →
membership → covered? → ticket → prompt → answered → settle → openWindow), the reply order, the crossing messages.
`module_tests.md`: the three suites. The `oneUseLane.ts` doc names `keyedQueue.ts`.

**Done when.** The 16 REDs quoted beside their GREENs and every break-it of the two new modules run once; every
function in the touched files ≤ 4 complexity and ≤ 50 lines; Opus review and Fable's security judgement passed.
Constraints C1–C11, especially C1, C2, C7, C8, C10, C11.

#### E2.3 spec (Fable)

Anchors are `origin/main` fd4a8e33 (the local `main`, 8d93997e, is stale). E2.1 is landing in the same tree and has
already moved the world's lines (`world` :57→:63, `unanswered` :231→:265) — re-find every anchor by its quoted text.
Where this spec and the frame above differ, this spec wins (the list closes here).

##### 1. The contract

**`src/keyedQueue.ts`** (pure) — the keyed-tail half of `OneUseLane.run` (`oneUseLane.ts:70-84`), moved verbatim:
`class KeyedQueue { run<T>(key: string, work: () => Promise<T>): Promise<T>; size(): number }`. `run` chains `work`
after every earlier job of `key` has SETTLED (`.then(() => work(), () => work())` — failure advances like success),
resolves/rejects as `work` does, and deletes a key whose tail is its own (the `try { return await ours } finally`);
`size()` counts keys with a job in flight, for tests. `OneUseLane` keeps everything else; `tails` becomes `private
readonly queue = new KeyedQueue()` and `run` is `return this.queue.run(entityId, () => this.afterTheQueue(entityId,
work));`. Its only suite is `oneUseAndCap.test.ts` (via the broker; `burnOnUse.test.ts` tests `burnIfOneUse`, not the lane).

**`src/consentTurns.ts`** (pure, no `vscode`):

```ts
export const MIN_PROMPT_MS = 15_000;
export function promptFloor(boundMs: number): number;            // Math.min(MIN_PROMPT_MS, boundMs / 20)
export type RefusalKind = 'timed-out' | 'gone' | 'full' | 'orphaned' | 'too-late';
/** `first`: the first refusal of this kind since the key's slot was last free — `full` and `orphaned` repeat, the rest are always first. */
export interface Refusal { readonly kind: RefusalKind; readonly first: boolean }
export type TurnOutcome<T> = { readonly kind: 'answered'; readonly value: T } | Refusal;
export class ConsentTurns {
  constructor(boundMs: number, now: () => number, maxWaiting = 3);     // `now` is the manager's monotonic clock (C1: 2)
  take<T>(key: string, request: AbortSignal, work: (turn: AbortSignal, leftMs: number) => Promise<T>): Promise<TurnOutcome<T>>;
  pending(): number;   // keys holding ANY state (an open turn, waiters, an orphaned slot) — for tests, deciding nothing
  clear(): void;       // dispose: every open turn and waiter resolves `gone`, every slot frees, a fresh queue
}
```

- **Arrival, synchronous, before the queue:** `request.aborted` → `gone`; the slot orphaned → `orphaned` (`first` =
  this orphan's first refusal); `waiting >= maxWaiting` → `full` (`first` = the first since the slot was last free).
  Else `deadline = now() + boundMs`, `waiting += 1`, and a `job` joins `KeyedQueue.run(key, job)`.
- **A waiter** leaves by its own signal (`gone`) or by the orphaning of the open turn (`orphaned`) — at once, `waiting
  -= 1`, its `job` later a no-op (a `done` flag). No timer while waiting: the open turn arrived earlier with the same
  bound, so its deadline comes first and orphans the slot. One timer per key at most, armed at turn start.
- **The turn** (`job` runs — every earlier job settled): `waiting -= 1`; `leftMs = deadline − now()`; under
  `promptFloor(boundMs)` → `too-late`, `work` never called (a request that did not wait is microseconds short of the
  bound — never under the floor; `durationText` rounds it to today's *5 minutes* / *1 second*). Else `turn = new
  AbortController()`, `setTimeout(end('timed-out'), leftMs)` — NOT unref'd (`withTimeout.ts:9-15`) — the request's
  abort → `end('gone')`, then `await work(turn.signal, leftMs)`.
- **`end(kind)`** decides the outcome while `work` still runs: `turn.abort()`, resolve `{ kind, first: true }`, the slot
  is ORPHANED, every waiter of the key resolves `orphaned` NOW (the first with `first: true`). **The outcome is decided
  once** — `work`'s value (`answered`) or `end`, whichever is first; a value after it is dropped, a rejection after it
  swallowed, a rejection BEFORE it rejects `take` (the caller's bug surfaces; the server's dispatch catch makes it FAILURE).
- **The slot frees when `work` SETTLES** (`finally`): timer cleared, listener removed, `orphan = false`, the `first`
  counters reset, the key's entry deleted when `waiting === 0` — guarded by `keys.get(key) === state`. The key's next
  job runs after this `finally`, so it sees everything `work` wrote (R4).
- **`clear()`**: every open turn aborted and resolved `gone`, every waiter resolved `gone`, then `keys = new Map()`,
  `queue = new KeyedQueue()` — an old job's `finally` finds a foreign state and touches nothing. ≤ 4 each: `take` →
  `refusedAtArrival` (3 branches) → `enqueue` → `turn` → `end` / `freed`; a tiny `Waiter` (`done`, `resolve`,
  `reject`, `leave(kind)`) keeps every listener a one-liner.

**`src/sshAgentServer.ts`.** `confirm(key, purpose, data, signal: AbortSignal)` on `SshAgentServerOptions` (the line
`confirm(key: AgentKey, purpose: SignPurpose, data: Buffer): Promise<boolean>;`). `serve`: `const client = new
AbortController()`, `let replies: Promise<void> = Promise.resolve()`; the `'close'` handler also `client.abort()`. The
loop `for (const frame of frames) { void this.handle(frame, socket); }` becomes `const answer = this.handle(frame,
client.signal).catch((error: unknown) => this.failed(error)); replies = replies.then(() => answer).then((reply) =>
this.write(socket, reply));` — dispatched at once, caught at dispatch (R7), written in arrival order. `handle(frame,
signal): Promise<Buffer>` RETURNS its reply; `answerSign` and `confirmAndSign` take `signal` through to
`this.options.confirm(key, …, request.data, signal)`; the post-await `keys().includes(key)` check stays. `failed(error)`:
log `the agent could not answer a request: ${describeError(error)}` (`describeError.ts` imports nothing), return
`encodeFailure()`. The manager's `ensureStarted` lambda: `confirm: (key, purpose, data, signal) => this.confirm(key, purpose, data, signal)`.

**`src/sshAgentManager.ts`.** `private readonly turns: ConsentTurns`, set in the constructor body after
`this.monotonic = monotonicSource(monotonic);` as `new ConsentTurns(this.consentTimeoutMs, this.monotonic)`.

- `confirm(key, purpose, data, signal)`: the arrival reads, `noteUnknown`, the not-loaded refusal, `arrived`, the
  covered check — as today, before any `await`; then `const outcome = await this.turns.take(key.entityId, signal,
  (turn, leftMs) => this.turnStarted(key, purpose, asked, arrived, turn, leftMs)); return this.outcomeOf(key,
  purpose, outcome);`. The line `const ticket = askTicket(this.windows, arrived);` and the `askToSign` await LEAVE it.
- `turnStarted(key, purpose, asked, arrived, turn, leftMs): Promise<boolean>` — the whole turn, complexity 4:
  (1) `this.generationOf(key.entityId) !== arrived.generation` → log `"${name}": the key was removed or re-added
  while the request waited — refused`, `false` (the membership check AFTER the wait); (2) the covered re-check with
  fresh `this.clock().getTime()` / `this.monotonic()` → `logCovered`, `true`; (3) `const ticket = askTicket(this.windows,
  arrived);` — NOW, after the wait (§2); (4) `const choice = await this.askToSign(key, purpose, asked, leftMs);` and in
  the SAME continuation, no `await` between: `if (turn.aborted) { return this.stale(key, choice); } return
  this.settle(key, ticket, choice);`.
- `stale(key, choice): false` — `choice !== undefined` → `tell(…)`: *"That signing request had already been refused — it
  waited longer than {bound}, or its program had gone. Nothing was signed."*, `{bound} =
  durationText(this.consentTimeoutMs)`. Never `settle`, never presence.
- `askToSign(key, purpose, asked, leftMs)`: the text as today with `Unanswered, it is refused after
  ${durationText(leftMs)}.`; returns `Promise.resolve(modal).then((choice) => choice, (error: unknown) =>
  this.modalFailed(error))` — no `withTimeout` (drop the import), no `no answer` line here; `modalFailed` returns
  `undefined`, its log line stays. It awaits the modal to the END: it is R1's watcher.
- `outcomeOf(key, purpose, outcome): boolean` — `answered` → `outcome.value`; `!outcome.first` → `false` silently;
  else `this.log(REFUSAL.get(outcome.kind)(key, purpose, bound))`, and `orphaned` → `tell(*"A signing prompt for
  "{name}" is still open from an earlier request — answer or close it."*)`; `false`. `REFUSAL` is a module-level
  `Map<RefusalKind, (key, purpose, bound) => string>` (C8; a lookup is no branch): `timed-out` → `no answer in
  ${bound} — refused ${describePurposeForLog(purpose)}` (the itest `:317` and *an unanswered signing prompt* read
  `/no answer .*refused/`); `gone` → `"${name}": the program that asked has gone — refused`; `full` → `"${name}": too
  many requests are waiting for an answer — refused (one line for this burst)`; `orphaned` → `"${name}": a signing
  prompt is still open from an earlier request — new requests are refused until it is answered or closed`; `too-late`
  → `"${name}": the request waited too long behind another prompt — refused without a prompt`.
- `openWindow`: `stale-key` as today; then `const notice = CROSSING_NOTICE.get(outcome); if (notice !== undefined) {
  this.tell(notice); } return true;` — `CROSSING_NOTICE = new Map([['fenced-key', …], ['fenced-lock', …]])`, §2's two
  sentences. Complexity 3. (E2.2 routes `this.windows = book` through `setWindows`; keep whichever is there.)
- `tell(text)`: `if (!this.disposed) { void vscode.window.showInformationMessage(text); }` — the one door for every
  information message (names through `displayText(key.name, MAX_DISPLAY)`). `dispose()`: `this.turns.clear()` after
  `this.disposed = true`.

**The world** (`sshAgentWorld.ts`): `FakeServer.confirm(key, purpose, data?: Buffer, signal?: AbortSignal)`; the
`StubAgentServer` fills the defaults so no call site changes — `(key, purpose, data = Buffer.alloc(0), signal = new
AbortController().signal) => o.confirm(key, purpose, data, signal)` (C1: 3); `infos: string[]` on `World`, and
`showInformationMessage: (m: string): Promise<undefined> => { w.infos.push(m); return Promise.resolve(undefined); }`.

##### 2. The scenarios

Constants: `MIN = 60_000`, `M = 50_000` (monotonic — never 0), `KEY = { entityId: KEY_ID, name: 'prod', fingerprint:
'SHA256:abc' }`, `AUTH = { kind: 'auth' }`. Helpers: `ask(signal?)` = `(w.server() as FakeServer).confirm(KEY, AUTH,
undefined, signal)`; `tick()` = `await new Promise((r) => setImmediate(r))`; `atOnce(p)` = `Promise.race([p, new
Promise((r) => setTimeout(r, 500, 'slow'))])` — a request queued behind a held modal answers `'slow'`. `m1 =
unanswered()` is always the FIRST modal; answers are `[m1.answer, ALLOW_ONCE]` and the bound the default unless said;
every test loads `KEY_ID` first; `r1 = ask()` is issued before `r2`, and so on.

**`src/test/sshAgentManagerTurns.test.ts`** (new; the world):

- T1 *a second request for the same key waits for the open prompt* — r1, r2, `tick()` → `dialogs.length === 1`;
  `m1.clickLate(ALLOW_ONCE)`; `await r1 === true`, `await r2 === true`, `dialogs.length === 2`, `presence === 2` —
  *Allow once* authorised only its own signature (never shared the broker's way, `brokerConsent.ts:63`). **RED on
  `main`:** `2 !== 1`.
- T2 *a window opened by the first prompt covers the waiting request without a prompt* (R4) — `[m1.answer]`; r1, r2;
  `m1.clickLate(ALLOW_WINDOW)`; `await Promise.all([r1, r2])` → `[true, true]`; `dialogs.length === 1`. Awaits only
  the two promises — no hop counting. **RED:** `2 !== 1`.
- T3 *different keys do not wait for each other* (guard, green before and after) — m1 held on `key-1`; `confirm` for
  `key-2` → `true` through `atOnce`, `dialogs.length === 2`.
- T4 *a request whose key was re-added while it waited is refused without a prompt* — r1, r2; `await
  instance.load('a1', keyEntity(KEY_ID, 'prod'))` (a new generation); `m1.clickLate(ALLOW_ONCE)`; `await r2 === false`,
  `dialogs.length === 1`, a log `/removed or re-added while the request waited/`. **RED:** `2 !== 1`.
- T5 *a request whose client has gone leaves the queue and is never shown* — r1; `ac = new AbortController()`, `r2 =
  ask(ac.signal)`, `ac.abort()`; `await atOnce(r2) === false`; `m1.clickLate(ALLOW_ONCE)`; `await ask() === true`;
  `dialogs.length === 2`. **RED:** `3 !== 2` (on `main` r2 prompts at arrival and takes the answer).
- T6 *the fifth request (1 open + 3 waiting) is refused at once and never shown later* (R6) — `[m1.answer, ALLOW_ONCE
  ×3]`; r1–r4; `await atOnce(r5) === false`, `dialogs.length === 1`; `m1.clickLate(ALLOW_ONCE)`; r1–r4 all `true`;
  `dialogs.length === 4`. **RED:** `5 !== 1`.
- T7 *a burst of refusals at the cap writes one log line* — T6 with r5 and r6; `logs.filter(/too many requests are
  waiting/).length === 1`; after r2–r4 drain, `r7 = ask()` prompts (`dialogs.length === 5`): the cap is per open
  turn, not sticky. **RED:** no such line.
- T8 *a request that waited says the time it really has left* — `mono = M`, `monotonic: () => mono`; r1, r2; `mono +=
  4 * MIN`; `m1.clickLate(ALLOW_ONCE)`; `await r2`; `dialogs[0]` `/after 5 minutes\./`, `dialogs[1]` `/after 1
  minute\./`. **RED:** `dialogs[1]` says *5 minutes*.
- T9 *a waiter left with less than the floor is refused at its turn, never shown a modal it cannot answer* (R5) — T8
  with `mono += 4 * MIN + 54_000`; `await r2 === false`; `dialogs.length === 1`; log `/waited too long behind another
  prompt/`. **RED:** `2 !== 1`.
- T10 *the time left is read from the monotonic clock, not the wall clock* (new) — T9 moving ONLY the wall clock
  (`clock: () => new Date(now)`, `now += 4 * MIN + 54_000`, `mono` still) → r2 prompts, `dialogs[1]` `/after 5
  minutes\./`. Break-it: `leftMs` from `Date.now()` → no second dialog.
- T11 *while an orphaned modal holds the key, a new request is refused at once; answering the orphan signs nothing,
  says so, and frees the key* (G0/G3) — `consentTimeoutMs: 20`; `await r1 === false` (log `/no answer in 1 second —
  refused/`); `await atOnce(r2) === false`, `dialogs.length === 1`, `infos` = one `/still open from an earlier
  request/`; `await r3 === false`, `infos.length === 1` still; `m1.clickLate(ALLOW_WINDOW)`, `tick()`: `presence ===
  0`, `infos[1]` `/had already been refused/`; `await r4 === true`, `dialogs.length === 2`. **RED:** r2 prompts, `2 !== 1`.
- T12 *a click on a prompt whose turn ended signs nothing, and says so* (R1) — bound 20; `await r1 === false`;
  `m1.clickLate(ALLOW_WINDOW)`, `tick()`; `infos.length === 1`, `/waited longer than 1 second, or its program had
  gone/`; `presence === 0`; `await r2 === true`, `dialogs.length === 2`. **RED:** `0 !== 1`.
- T13 *an answer given across a lock: once, no window, and the message says the vault locked* — r1;
  `instance.endAllWindows('the vaults were locked')`; `m1.clickLate(ALLOW_WINDOW)`; `await r1 === true`; `infos[0]`
  `/vault locked while you were choosing/`; `await r2 === true`, `dialogs.length === 2`. **RED on E2.2's head:** `0 !==
  1` (`main` has no `endAllWindows`: the suite first compiles on E2.1's step 1).
- T14 *an answer given across Ask for Every Use Again: once, no window, and the message says so* — T13 with
  `instance.endWindows(KEY_ID)`; `/Ask for Every Use Again was used while you were choosing/`. **RED on E2.2's head:** `0 !== 1`.
- T15 *a lock while a request waits does not fence the answer given after its turn starts* (§2) — `[m1.answer,
  ALLOW_WINDOW]`; r1, r2; `instance.endAllWindows('lock')`; `m1.clickLate(ALLOW_ONCE)`; `await r2 === true`; `await r3
  === true` with `dialogs.length === 2` (covered) and `infos.length === 0`. **RED on E2.2's head:** the ticket taken
  at arrival → `fenced-lock` → r3 prompts, `3 !== 2`.
- T16 *disposing during a queue refuses everything, shows nothing and logs nothing afterwards* — bound 20;
  `[m1.answer]`; r1–r3; `instance.dispose()`; `n = logs.length`; `await Promise.all([r1, r2, r3])` → all `false`;
  `m1.clickLate(ALLOW_WINDOW)`, `tick()`; `logs.length === n`, `infos.length === 0`, `dialogs.length === 1`. **RED:** `3 !== 1`.

**`src/test/sshAgentServer.test.ts`** (+3 after *every prompt open for a removed key*; the harness's `confirm` becomes
`(key, purpose, signal: AbortSignal) => Promise<boolean>`, passed as `(key, purpose, _data, signal) => confirm(key, purpose, signal)`):

- S1 *a pipelined identities request behind a held sign request is answered in order* — `heldPrompt()`;
  `askOnOneSocket(path, [signRequestFor(…), Buffer.from([SSH_AGENTC_REQUEST_IDENTITIES])])`; `await prompt.asked`;
  `prompt.answer(true)`; the replies' first bytes `[SSH_AGENT_SIGN_RESPONSE, SSH_AGENT_IDENTITIES_ANSWER]`. **RED on
  `main`:** `[12, 14]` — the identities answer was written first.
- S2 *a closed client connection aborts its request's signal* — a confirm that captures `signal` and returns `new
  Promise(() => {})`; a raw `net.createConnection` (the shape of `askOnOneSocket`) writes one sign frame; after the
  capture, `socket.destroy()`; `await Promise.race([once(signal, 'abort'), 2 s])` → `signal.aborted === true`. **RED
  after the interface step** (a never-aborted signal): *not aborted within 2 s*; on `main` the suite does not compile.
- S3 *a confirm that throws behind a held prompt is answered FAILURE, in order, with no unhandled rejection* (R7) —
  confirm #1 returns the held click, #2 `throw new Error('the gate broke')`; `askOnOneSocket(path, [sign, sign])`;
  release #1; replies `[SSH_AGENT_SIGN_RESPONSE, SSH_AGENT_FAILURE]`, log `/could not answer a request: the gate
  broke/`. **RED on `main`:** the escaped rejection kills the test child (Node's default `--unhandled-rejections=throw`;
  `run-tests.mjs` sets nothing else) — the file reports the error, not the table's 5-second wait.

**`src/test/keyedQueue.test.ts`** (new — cannot be red; the break-it in brackets): K1 *jobs of one key run one at a
time, in arrival order* (call `work()` outside the chain); K2 *a job that rejects fails only its own caller — the job
behind it still runs* (`.then(next)` without the second `next`); K3 *two keys never wait for each other* (one tail);
K4 *a key whose last job settled holds nothing — `size() === 0` after a resolve and after a reject* (never delete);
K5 *`run` answers the job's value and its rejection*. Plus `oneUseAndCap.test.ts` green on the extracted lane.

**`src/test/consentTurns.test.ts`** (new — cannot be red; `mono = M`, `now = () => mono`; `t.mock.timers.enable({ apis:
['setTimeout'] })` and a `tick(ms)` moving BOTH clocks, as `secretClipboard.test.ts`'s `advance` does; `work` returns a
deferred the test settles; `signal()` = `new AbortController()`):

C1 *the first request's work starts at once with the full bound* — `leftMs === bound`, `pending() === 1` (start on a
timer). C2 *a second request waits, and its turn starts when the first work SETTLES, not when its outcome is decided*
(start the next on `take`'s resolution). C3 *an already-aborted request is `gone` at once and never joins* —
`pending() === 0`, work never called. C4 *a waiter whose signal fires leaves at once; its work never runs; the next
waiter takes the slot*. C5 *the cap counts waiters only: the fifth request is `full` (`first: true`), the sixth `full`
(`first: false`), the fourth is not; after everything settles a new burst's refusal is `first: true` again* (count the
open turn; never reset). C6 *a gone waiter frees its place at the cap* (never decrement). C7 *the bound ends the open
turn and orphans the slot: `turn.signal.aborted`, `timed-out` resolves at once, every waiter resolves `orphaned` now
(the first `first: true`), a new request is `orphaned` (`first: false`), `pending()` stays 1 until the work settles,
then 0 and the next request's work runs* — `tick(bound)` (free the slot in `end` → the next work runs beside the
orphan). C8 *the request's signal during the turn is `gone` and orphans the same way*. C9 *the floor: a waiter with
less than `promptFloor` left is `too-late` without `work`; with exactly the floor it runs* — bound `300_000`; settle
work 1 at `mono += 285_000` → work 2 runs, `leftMs === 15_000`; at `+ 285_001` → `too-late`; `promptFloor(300_000)
=== 15_000`, `promptFloor(20) === 1`, `promptFloor(1_000_000) === 15_000` (`<=`; `MIN_PROMPT_MS` alone). C10 *the time
left is measured from arrival* — waited 100 of a 1000 bound → `leftMs === 900`. C11 *a value after the outcome is
dropped and a rejection after it is swallowed* — `tick(bound)`, then settle the deferred; the outcome stays
`timed-out`; a `process.once('unhandledRejection')` spy counts 0 (no `catch` on work). C12 *a rejection before the
outcome rejects `take` and frees the slot* — `assert.rejects(…, /boom/)`, `pending() === 0`, the next request's work
runs (never free on rejection). C13 *an answered turn leaves no timer behind* — real timers, bound `60_000`:
`process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length` equal before `take` and after the outcome
(clear the timer only in `end`). C14 *`clear()` resolves the open turn and every waiter `gone`, aborts the turn's
signal, leaves nothing pending, and the old work settling afterwards touches nothing* — after `clear()` a `take` for the
same key runs its work at once (keep the old queue). C15 *different keys are independent* — two open turns at once (one
slot for all keys). C16 *the per-key bookkeeping is empty after every outcome* (G2) — a table over `answered`, `gone`
at arrival, `gone` while waiting, `full`, `too-late`, `timed-out` + settled, `orphaned` + settled, rejected, cleared →
`pending() === 0`.

##### 3. The brief — in this order

1. `keyedQueue.ts` + K1–K5; `OneUseLane` on it; `oneUseAndCap.test.ts` green. 2. `consentTurns.ts` + C1–C16 (pure —
   complete here). 3. **Server interface step, green:** the fourth `confirm` parameter, `serve` passing `new
   AbortController().signal` (never aborted), the world's defaults, the harness pass-through, the manager's
   `_signal: AbortSignal` (C5). 4. S1–S3 red, quoted. 5. The server fix (§1). 6. **Manager interface step, green:**
   `w.infos` + `showInformationMessage` in the world, nothing else. 7. T1–T16 red, quoted (T13/T15 need E2.1's
   `endAllWindows`, T14 E2.2's `endWindows` — both land before this story). 8. The manager fix (§1); the `withTimeout`
   import dropped; *a click AFTER the timeout* stays green and now also records the stale message. 9. Docs: the story's
   paragraph above; `oneUseLane.ts`'s header names `keyedQueue.ts`; the itest's stub (`withVscodeStub`) must carry
   `showInformationMessage` — E2.1 adds it; add it here if absent. **Sizes:** `sshAgentManager.ts` ≈ 680 after
   E2.1/E2.2 and this (+~90), `sshAgentServer.ts` ≈ 235, the world ≈ 340, `sshAgentServer.test.ts` ≈ 610 — all under 800.

**Not to change:** `allowWindows.ts`, `agentConsent.ts`, `sharedPrompt.ts` / `brokerConsent.ts` (the broker keeps
sharing its answer — a different promise), `withTimeout.ts` (still `credsAgentServer`'s and the locked-vault offer's),
`OneUseLane`'s public surface and `afterTheQueue`, `extension.ts`, `sshAgentWiring.ts`, `vaultKeys.ts`, the frame
loop's "dispatch at once", the post-await `keys().includes(key)` check, the `no answer in … — refused` wording.

##### 4. The traps, each with the test that pins it

1. **An `await` between `turn.aborted` and the window write** (presence through an awaited call, a logged `await`): a
   macrotask — the bound timer, a socket `close` — runs in the gap. T2, T11; C7 holds the slot through `work`, not the outcome.
2. **The slot freed on the signal (`end`) instead of on `work`'s settle** — a second modal beside the orphan. C7, T11.
3. **The ticket taken at arrival or before the wait** — T15; **the covered re-check skipped at turn start** — T2; **the
   membership check only before the wait** — T4; **`leftMs` from the wall clock** — T10, C10; **the floor with `<=` or
   `MIN_PROMPT_MS` alone** — C9.
4. **The reply chain**: `replies.then(() => answer)` without the dispatch catch lets one rejection stop every later reply
   of that socket; a catch returning `undefined` makes `encodeFrame(undefined)` throw in `write` — S3. Serial handling
   per socket (an `await` in the frame loop) deadlocks *every prompt open for a removed key*.
5. **OneUseLane changed by the extraction** — advancing only on success (K2), deleting a key another job owns (K4), the
   lane keyed by the queue's key instead of `laneKeyFor` (`oneUseAndCap.test.ts` *two DOORS*).
6. **A timer that holds `node:test` open** — the bound timer not cleared on an answered turn (five minutes idle at the
   default bound) — C13; unref'd — a bare run of *an unanswered signing prompt* exits with no answer (`withTimeout.ts:9-15`).
7. **`tell` after `dispose()`** — T16, `sshAgentManagerLog.test.ts` *an answer that arrives after the window closed*;
   **the stale message on Escape** (`choice === undefined` is not a click) — T11 counts `infos` exactly.
8. **A gone waiter still counted toward the cap** — C6; **the open turn counted** — C5; **waiters left queued behind an
   orphan** — C7's `pending()`, T11's `atOnce(r2)`; **`first` never reset** — C5's third assertion, T7's r7; **the
   answer shared between waiters** — T1's `presence === 2`; **a late rejection unhandled** — C11, S3.

## 7. Epic Definition of Done

- [ ] Every story's RED was observed on the code before its fix (the interface step where §4–§6 say so) and is
      quoted in the PR beside its GREEN — 27 REDs; every break-it of the new functions and modules quoted once.
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

## 8. Review record

- **coai plan gate on `43abba8c`** (this document's first version): verdict **`proceed`**, **2 of 3 reviewers
  answered** (kimi returned empty), 5 findings. Accepted: **0 + 3** (one modal per key against a modal VS Code cannot
  close — the prompt slot held until the modal settles, orphaned-slot refusal with one notice, §2 and E2.3); **2**
  (no leak, no unhandled rejection — `catch`/`finally` on every outcome, bookkeeping empty, a test per outcome).
  Rejected: **1** (refuse instead of "once" across a lock or the row button) — owner decision O3 and the parent's I3:
  an explicit *Allow* clicked on the modal is consent for that one signature; only the WINDOW is fenced, and *Deny* is
  on the same modal. **4** (`package-lock.json` drift) — release-please bumps `package.json` and `package-lock.json`
  together, shown on #247.
- **Own review (Opus), same commit:** 9 findings and the lows, all folded in — R1 the stale message from the prompt's
  own continuation, not a race that drops the modal; R2 a non-optional row hook (`entityItem` at 3); R3 `wireSshAgent`
  driven by tests, `provider` in its deps, the false scenario claim removed; R4 the answer applied inside the turn
  before the slot frees; R5 the `promptFloor`; R6 the cap counts waiters only, the fifth request is `full`; R7 replies
  caught at dispatch; R8 lock and button never revoke (a Buffer from the captured `sign`, `ssh-keygen` exit 0); R9 the
  command through the `addKeyToAgentReference.test.ts` harness. Lows: the cap's one log line tested; anchors
  corrected (`agentCommands.ts:687-706`, `manifest.test.ts:99-111`, `sshAgentWorld.ts:227-243`,
  `treeDataProvider.ts:651-658`); `module_extension.md:4844` in the docs; the `onAddress` hazard named (`wslRelay`,
  `extension.ts:592`); the row button is an inline icon action as well as a menu item; every new suite ends with the
  key-material guard (C12).
