# PLAN — E3 of #197: the longer windows for SSH logins (feature release)

> Status: **plan only, nothing implemented yet, 2026-10-21** (revised the same day after the coai plan gate, the risk
> consultation, Opus's own review and the owner's four answers — §10). Scope: `src_vs_code` — a pure extraction out of
> `sshAgentManager.ts` into a new `sshAgentWindows.ts` (the window holder, `vscode`-free) and a new `sshSignPrompt.ts`
> (the prompt, both steps); `agentConsent.ts` (`ALLOW_LONGER`, the answers, `longWindowClaim`, `longerOffer`),
> `allowWindows.ts` (`coveringWindow`), `sshAgentProtocol.ts` (a login's algorithm must fit the key), `sshAgentSign.ts`
> (`signsWithSha1`), `sshAgentTexts.ts` (hours, the list, the notices, three user-facing sentences as constants),
> `sshAgentServer.ts` (the request's flags reach the gate), a new `autoLockSetting.ts` (one reader of
> `autoLockMinutes`, used by `extension.ts`, `commands/keyCommands.ts` and the wiring), `sshAgentWiring.ts` (the lock
> state, the overdue auto-lock, the setting's listener), the five `help*.ts`, `package.json` (texts; `autoLockMinutes`
> becomes application-scoped), `agentDoors.ts`, `commands/agentCommands.ts` (one sentence), `README.md`, the
> walkthrough, `CHANGELOG.md`, `scripts/ssh-agent-itest.cjs`; tests and test helpers; research docs. **No `src_cli`
> change** — the CLI sentence is its own `fix(cli)` PR (§1, owner 2026-10-21). Release: `extension-v1.16.0` (`feat:` →
> minor; the owner approved E1–E3 on 2026-10-20).
>
> Parent: [PLAN_ssh_allow_longer_windows.md](PLAN_ssh_allow_longer_windows.md) § Epics → E3 — the authority on the
> design (§6), the texts (§7) and the invariants (§5); this is E3's build order, deciding only §2 and the deviations
> of §3. Before it: [PLAN_ssh_allow_longer_windows_E1.md](PLAN_ssh_allow_longer_windows_E1.md) (shipped in 1.14.2) and
> [PLAN_ssh_allow_longer_windows_E2.md](PLAN_ssh_allow_longer_windows_E2.md) (merged as #267, releasing as 1.15.0).

## 1. The four stories, in order — and one piece beside them

One branch, `feat/197-e3-longer-windows`, from `origin/main` 2997a558. Each story is one commit with its own RED tests
and its own docs. Per story: this brief (Opus) → Sonnet codes → Opus reviews → Sonnet fixes.

| # | Story — the guarantee | Model | Parent stories / invariants | RED tests |
|---|---|---|---|---|
| E3.1 | Room to work: the window holder and the prompt leave the manager, and nothing a person sees changes | `model: sonnet` | — (readiness finding 1: `sshAgentManager.ts` is at 770 of 800) | 0 — a pure move; 2 break-its prove the suites still reach the moved code |
| E3.2 | What an answer means, what may be offered, what SHA-1 RSA is never given, and what counts as a login of THIS key's type — decided in pure code | `model: sonnet`; Fable security judgement at review (the classifier change, outside the quota) | S7 (the pure half); I5, I6 (the offer), I8 (the table); O1, O9, O10, O12; the owner's SHA-1 decision | 3 (+14 new-function tests, each with its break-it) |
| E3.3 | *Allow longer…* lets SSH logins through for 1, 4, 8 or 12 hours — never a Git signature, never SHA-1 RSA, never while locked, overdue for auto-lock or with auto-lock off | `model: sonnet`; Fable security judgement at review (outside the quota) | S7 (the manager), S6's moved test, S9 (the `ssh-agent` article); I3, I5, I6, I8, I9, I10; D3 (two lengths); O1, O2, O5, O6, O9–O12 | 24 (+9 guards with break-its) |
| E3.4 | Every user-facing text of 1.16.0 says what the prompt offers, a live OpenSSH login proves the window, and the release ships | `model: sonnet` | S9 (the rest of D5), S10; D5 (final wording) | 4 (3 unit + 1 live scenario) |

**Beside the epic, built and released on its own: the CLI sentence** (owner, 2026-10-21, Q1). A separate PR from
`main`, `fix(cli): the relay help says a window can cover a signature (#197)`, changes `src_cli/src/CommandLine.cs:208`
and `src_cli/README.md:143-145` to a version-independent sentence — *"a signature asks there, unless a window you
opened in that prompt covers it"* — true for 1.14.2, 1.15.0 and 1.16.0 alike, so it may go before E3. Released as
`cli-v0.4.4` (release approved): release-please dispatch → its cli release PR → merge → dispatch again; the GitHub
release carries the binaries. `dotnet build` 0 warnings; the CLI's tests run green. E3 itself has no `src_cli` change,
so its squash commit gives release-please no reason to propose a cli release.

**No cornerstone in E3.** The quota is ⌈2·3/5⌉ = 2 and both are spent (E1.3 the window book, E2.3 the asynchronous
side of the material boundary). E3 would need a third only if it opened a new area where a mistake is silent, and it
does not: the book gains one additive read (`coveringWindow`) and loses no rule; the turn gains one more `await`
inside the SAME turn, under the SAME slot, bound and fences — `consentTurns.ts` is not changed — and the R4 rule that
guards it is E2.3's, repeated on the new path with its own macrotask break-it and three race orders (E3.3, L17, L20).
The new authorisation decisions — the algorithm-fits-the-key rule, `longWindowClaim` (SHA-1 RSA), `longerOffer` and the
gate's `login`-scope condition — are pure functions or one-line conditions whose every branch is a test, and E3.2 and
E3.3 get Fable's security judgement at review, outside the quota. The ledger line in the parent stays
`Cornerstones: 2 of 2`.

## 2. What this document decides (the parent left it to E3)

- **E3.1 moves three things, all behaviour-free.** (a) The window holder — `setWindows`, `arm`, `timerFor`, `expired`,
  `moment`, the book itself, `liveWindows`, the expiry timer, `EXPIRY_LOOK_MS`, `Moment` (`sshAgentManager.ts:53`,
  `:69-72`, `:144-146`, `:347-400`) — into a class `SigningWindows` in a new `sshAgentWindows.ts`, **`vscode`-free**
  (the book, the two clocks, `unrefTimer`, a change callback), built in the constructor BODY after `this.monotonic` is
  set, as `this.turns` is (`:189-190`). The manager keeps its public methods (`endAllWindows`, `endWindows`,
  `windowsFor`) as thin delegations. (b) The modal — `askToSign`, `modalFailed`, `serverParagraph` (`:683-702`,
  `:767-770`) and the modal's text — into a new `sshSignPrompt.ts` (`vscode`), the parent's §6.5 module, so E3.3's list,
  `pickLength`, the `why`s and the notices land there and in `sshAgentTexts.ts`, not in the manager (review M2). (c)
  `CROSSED_LINE` (`:62-66`) into `sshAgentTexts.ts`, and one `Arrival` record (`key`, `purpose`, `asked`, `arrived`)
  that `turnStarted` / `beforePrompt` take instead of four parameters, so E3.3 adds the request's `claim` without a
  seventh. The real `wc -l` is measured and written into E3.1's done-when (the reviewer counts about 665 for (a)+(b)
  alone); E3.3 must leave the manager ≤ 760 — §3 C14.
- **SHA-1 RSA — the owner's decision of 2026-10-21** (recorded in the parent, Epics → E3). SHA-1 signing stays
  (`rsaVariant`, `sshAgentSign.ts:36-46`, not touched). A request a key would sign with SHA-1 — an `ssh-rsa` key and no
  `SSH_AGENT_RSA_SHA2_*` flag — is never covered by a 1/4/8/12-hour window and is never offered one: the prompt has no
  *Allow longer…* and says why. **A 10-minute window covers it as today.** One road in: `signsWithSha1(keyType, flags)`
  in `sshAgentSign.ts` asks the signer's own rule, so the exclusion cannot drift from what is actually signed;
  `longWindowClaim(purpose, sha1)` in `agentConsent.ts` turns it and the purpose into `'login' | 'sha1-login' |
  'not-login'`; the gate and the offer both read that one claim.
- **A login's algorithm must fit the signing key** (risk consultation C-b). `namesThisKey`
  (`sshAgentProtocol.ts:283-288`) checks only that an algorithm is present. From E3.2 a userauth is a login only when
  its algorithm equals the signing key's type — and for an `ssh-rsa` key, also `rsa-sha2-256` or `rsa-sha2-512` (RFC
  8332). A `login` is now an authorisation input for hours, not minutes, so a malformed or mismatched algorithm is
  `unknown`, as the classifier's own rule says (*"Anything else is reported as unrecognised rather than guessed at"*).
- **The flags reach the gate as a fifth `confirm` argument.** `SshAgentServerOptions.confirm(key, purpose, data, signal,
  flags)` (`sshAgentServer.ts:61`), the server passing `request.flags` (`:230`), **and the manager's own forwarding
  lambda passing it on** (`sshAgentManager.ts:448`, `confirm: (key, purpose, data, signal) => this.confirm(…)` today —
  C-c: a parameter added everywhere but there is a flag that never arrives). The classifier stays blind to flags; its
  doc paragraph *"What it does NOT see: the request's flags"* (above `:385`) is rewritten to name `signsWithSha1`. **The
  key type is read from the manager's own loaded key at arrival** (`keyTypeOf(this.keys.get(id).identity.publicBlob)`),
  never from the `AgentKey` argument — the manager tests pass plain `{ entityId, name, fingerprint }` objects (C10).
- **Which windows count — the gate and the row, through one `scopesFor`.** Let `loginLive()` = `!this.lockedNow() &&
  !this.autoLockOverdue()` (review M1: the idle timer ticks every 60 s, `extension.ts:376-388`, so a laptop waking with
  an overdue auto-lock would otherwise sign silently for up to a minute before the lock lands). The gate (`confirm`
  `:508`, `coveredAfterWaiting` `:573`) asks `scopesFor(claim === 'login' && loginLive(), this.autoLockMinutes())`,
  reading the hooks at EVERY check (arrival and after a wait — I6's backstop). The row and `endWindows`' `had`
  (`liveWindows` `:349`) ask `scopesFor(loginLive(), this.autoLockMinutes())`: the widest set the gate would honour for
  any request now. **Never `scopesFor(false, …)` and never `ALL_ONLY` there** — both are `['all']`, and the row would
  never show a login window (readiness finding 2). With auto-lock on, unlocked and not overdue this is `['all',
  'login']`; otherwise `['all']`, so the row cannot show a login window the gate would refuse. `ALL_ONLY` keeps its
  export (the book's tests use it) and loses its last production caller. The offer (`longerOffer`) reads `lockedNow()`
  and `autoLockMinutes()` only — the click that answers it is itself activity, which ends the overdue state.
- **The hooks fail closed.** `lockedNow: () => boolean = () => true`, `autoLockOverdue: () => boolean = () => true`,
  `autoLockMinutes: () => number = () => 0` — fields with defaults, the `onWindowsChanged` shape (`:161`), not
  constructor parameters (the constructor is at complexity 4). A manager nobody wired offers no longer window and
  honours none. The parent said "no-op defaults"; for an authorisation input the safe default is the refusing one.
  Deviation. What still changes in the E1/E2 suites: the buttons assertion `sshAgentManager.test.ts:149-152` (a login
  prompt now has four), the *what ends a window* regex `:384`, and the `consentFromChoice` tests in
  `agentConsent.test.ts`, removed in E3.3 with the function — `decideSigning`'s cases (E3.2) carry their guarantees.
- **The wiring.** `sshAgentWiring.ts` gains `connectAgentToSettings(vaultKeys, sshAgent): vscode.Disposable` — sets
  `lockedNow = () => vaultKeys.isLocked()` (`vaultKeys.ts:206-208`), `autoLockOverdue = () =>
  vaultKeys.dueForAutoLock(Date.now(), autoLockMinutesSetting())` and `autoLockMinutes = autoLockMinutesSetting`, and
  returns the `workspace.onDidChangeConfiguration` subscription (precedent `extension.ts:134-140`) that calls
  `sshAgent.endLoginWindows('idle auto-lock was turned off')` when `credSshManager.autoLockMinutes` changes to `<= 0`
  (a negative value reads as off, as `scopesFor` does). `wireSshAgent` pushes it into `context.subscriptions` beside
  the lock link. **One reader of the setting**: a new small module `autoLockSetting.ts` exports
  `autoLockMinutesSetting()` (default 60), used by `extension.ts:379-381`, `commands/keyCommands.ts:376` and the wiring —
  three sites, one default (reuse move 2); `extension.ts` shrinks and its `.size-baseline.json` entry is lowered.
- **`credSshManager.autoLockMinutes` becomes application-scoped** (owner, 2026-10-21, Q-D): `"scope": "application"`
  in `package.json:174-179`, so a repository's `.vscode/settings.json` cannot raise it — it is what bounds a long
  window. In E3.3, beside the reader. A workspace or folder value is no longer applied; the CHANGELOG says so under
  *Changed*, and the README / help settings texts say it is machine-wide.
- **Auto-lock set to 0 while login windows are open.** `endLoginWindows(reason): number` ends every `login` window (the
  10-minute ones and every fence stay — `allowWindows.ts:247-249`), writes one log line when a key is loaded, and —
  when it ended at least one live login window — tells the person once: *"Idle auto-lock is off, so the login windows of
  {n} key(s) were ended — a long window needs a lock to end it."* Silent when there were none. It never revokes and
  never unloads (E1.2's judgement: one method per meaning).
- **A lock ends the windows of THIS VS Code window** (owner, 2026-10-21, Q-B). `VaultKeys` and the agent are per
  window; a lock in a second VS Code window does not reach this one's agent. The modal, the five help languages and the
  README say *"locking the vault in this VS Code window"*. A cross-window broadcast is a follow-up GitHub issue (the
  coordinator files it).
- **Forwarded-agent requests** (owner, 2026-10-21, Q-C): E3 does nothing about OpenSSH's `session-bind`
  `is_forwarding`; a long window that never covers a forwarded request is a follow-up GitHub issue next to #259 (the
  coordinator files it). `longWindowClaim` stays the one place such an input would join.
- **The two steps, inside ONE turn** (O1; readiness finding 4). The modal offers `SIGNING_BUTTONS` without
  `ALLOW_LONGER` when `longerOffer` says no. When it returns *Allow longer…*: `turn.aborted` → the stale message (E2's),
  no list; else eligibility is asked AGAIN (the middle check, below) — not eligible → allowed once, no window, told, no
  list; else the list: `showQuickPick(items, { title, placeHolder, ignoreFocusOut: true }, token)`. The title names the
  key through `displayText(name, MAX_DISPLAY)` (review M6). The `CancellationTokenSource` is made for this list and
  cancelled only by THIS turn's signal; an already-aborted signal opens no list; the abort listener is removed and the
  source disposed in `finally` (C-e; the shape of `agentCreatePin.ts:50-67`). A **rejected** `showQuickPick` (the
  window closing under it) is a dismissal, like `modalFailed`: logged, refused, no presence (M6).
- **The list, the bound and the slot — what really happens** (review H1, option b). The turn's bound and the prompt
  slot cover both dialogs: the bound is the turn's one timer, and the slot is held until `work` settles, which now
  includes the list. When the bound (or a gone client) ends the turn while the list is up, `ConsentTurns.end()`
  (`consentTurns.ts:229-236`) decides the outcome and calls `slot.orphaned()` BEFORE `controller.abort()`: so, exactly
  as for a modal, every request already waiting for that key is refused `orphaned` at that moment and the orphan notice
  (*"A signing prompt for "prod" is still open from an earlier request — answer or close it."*) is shown once — even
  though the list then closes itself through the token, `work` settles and the slot frees a moment later. E3 does NOT
  change `consentTurns.ts`; L5 pins this behaviour, and a closable turn (an `end()` that does not orphan while a
  closable dialog is up) is a recorded follow-up (§9).
- **After the last `await` — the order** (risk consultation C-a; the R4 rule). After the list resolves, in the same
  synchronous continuation and with no `await` between: (1) `turn.aborted` → stale (a label → the message; `undefined`
  → silent); (2) the pick is `undefined` (Escape, or VS Code closed the list for another one or Ctrl+P — M6) → refused,
  presence counted (a person clicked *Allow longer…* and then declined — Deny), nothing signed, silent; (3) only an
  affirmative duration reaches the eligibility re-check — not eligible → allowed once, no window, told; (4) `settle` →
  `decideSigning` → `openWindow(scope 'login')`. The window starts at the pick (`settle` reads the clock there, once).
  One presence per turn.
- **Eligibility is asked three times**: when the modal is built (is the button there?), when *Allow longer…* comes back
  (the middle check — open the list?), and at an affirmative pick (grant?). The parent's §6.2 named the first and last.
  The middle check answers **allowed once** — consistent with I3's `fenced-lock` — although O1 says *Allow longer…*
  authorises nothing by itself: the person clicked an *Allow*, and the list it would have opened can no longer grant
  anything. Deviation from O1 (review M3), in the table below.
- **The list says the time left** — its placeholder ends *"Unanswered, it is refused after {left}."*, `{left}` =
  `timeLeftText` of the turn's deadline on the monotonic clock when the list opens (I9). The parent's §7 list text has
  no such line. Deviation.

**The answer table** (the parent's §6.2, with E3's rows):

| Answer | allow | present | window | told / logged |
|---|---|---|---|---|
| modal dismissed, bound runs out, client gone | no | no | — | the refusal line; a late label → the stale message |
| Deny | no | yes | — | — |
| Allow once, or an unrecognised label | yes | yes | — | — |
| Allow for 10 minutes | yes | yes | `all`, click + 10 min | — |
| Allow longer… → pick N h, still eligible | yes | yes | `login`, pick + N h | — |
| Allow longer…, not eligible any more (middle check) — **deviation from O1** | yes | yes | — | notice *"{why} — this signature was allowed once; no window was opened."*; log `"prod": answered "Allow longer…" but {why} — allowed once, no list was opened` |
| Allow longer… → pick N h, not eligible at the pick | yes | yes | — | the same notice; log `"prod": picked {N hours} but {why} — allowed once, no window was opened` |
| Allow longer… → Escape, or VS Code closed the list (another list, Ctrl+P) — eligible or not | no | yes | — | silent |
| Allow longer… → the bound or a gone client while the list is up | no | no | — | the refusal line; waiters `orphaned` and the orphan notice once (H1) |
| Allow longer… → the list rejects (the window closing) | no | no | — | log, like `modalFailed` |
| any timed answer across a lock or *Ask for Every Use Again* | yes | yes | — | `CROSSING_NOTICE`; the log names the answer (`crossedLine`) |

- **The texts** are the parent's §7, with the O6 paragraph in the modal and *"in this VS Code window"* (Q-B). The
  `why`s, no trailing period (the modal appends one, the notices append the dash clause), in this order: *"Longer
  windows cover SSH logins only"* · *"Longer windows need a SHA-2 signature: this RSA login asked for SHA-1"* (new) ·
  *"Longer windows need the vault unlocked — a lock ends them"* · *"Longer windows need idle auto-lock:
  credSshManager.autoLockMinutes is off"* (the parent says *"is 0"*; a negative value is off too — deviation). The I10
  line names the scope: *"allowed without asking: login window of "prod" until 18:40 (granted 10:40) for …"*
  (`logCovered`, `:617-622`, says "10-minute window" for every window today — readiness finding 3). The crossing log
  line names the answer given: `answered "Allow longer…" (4 hours) after the vaults were locked — allowed once, no
  window was opened` (`CROSSED_LINE` quotes `ALLOW_WINDOW` for every crossing today, `:64-65`).
- **D3 with two lengths at the manager is unreachable — what was checked, and the test that replaces it.** For a second
  `login` grant to meet a live first one, a login request for that key must be NOT covered while the first window is
  live. Checked, each on the code: (1) one prompt per key — the slot is held until `work` settles (`consentTurns.ts`,
  E2.3); (2) a covered request never prompts — the arrival check (`:508`) and `beforePrompt` after a wait (`:553-564`);
  (3) every login request of that generation with a SHA-2 (or non-RSA) signature is covered while the login scope is
  live; (4) the requests a login window does not cover — a Git signature, an unrecognised one, SHA-1 RSA, anything while
  locked, overdue or with auto-lock off — are never offered *Allow longer…* or never reach a grant; (5) every road that
  ends the window (lock, button, unload, re-load, auto-lock 0, expiry) removes it before the next grant. So *"1 hour
  answered after 12 hours"* cannot be produced through the prompt. The rule stays proven where it lives
  (`src_vs_code/src/test/allowWindows.test.ts`, E1.3 test 7); the manager test is the reachable form: **a 10-minute
  answer for a Git signature, given while a 12-hour login window is open, never shortens the login window** (L12).
  Deviation from the parent's S7 wording.
- **S6's moved test** (E2 §3 deviation): *a request a login window covers never waits behind an open Git prompt* (L11).
- **`durationText` learns whole hours** where it lives since E2.3, `sshAgentTexts.ts:66-69` — not a new
  `durationText.ts` (parent §6.6). A whole number of hours ≥ 1 reads *"1 hour"*, *"12 hours"*; everything else as today.
- **The help's `ssh-agent` article gets its final wording in E3.3**, with the button: inserting `ALLOW_LONGER` into
  `SIGNING_BUTTONS` turns *the help names every answer* red by itself (`sshAgentHelp.test.ts:43`), and a story ends
  green. Everything else of D5 is E3.4's.

## 3. Verified on `main` 2997a558 — and where the parent differs

Every anchor below was re-read on 2997a558 (the branch adds only documents). E2 moved most of the parent's.

- **The manager** (770 lines): imports `:23` (`agentConsent`), `:24-43` (`allowWindows`); `EXPIRY_LOOK_MS` `:53`;
  `CROSSED_LINE` `:62-66`; `Moment` `:69-72`; `windows` `:144`, `expiry` `:146`, `onWindowsChanged` `:161`; constructor
  `:163-191` (complexity 4; `monotonic` and `turns` set in the body `:189-190`); `serve` `:241-256`; `unload` `:287-300`;
  `endAllWindows` `:307-314`; `endWindows` `:322-327`; `windowsFor` `:338-344`; `liveWindows` `:347-350` (`ALL_ONLY`
  `:349`); `setWindows` `:360-367`; `arm`/`timerFor`/`expired` `:379-400`; the server's forwarding lambda `:448`;
  `confirm` `:494-521` (`ALL_ONLY` `:508`, `take` `:513-519`); `turnStarted` `:533-544` (R4: `turn.aborted ?
  this.stale(choice) : this.settle(…)` `:543`); `beforePrompt` `:553-564`; `coveredAfterWaiting` `:572-574`
  (`ALL_ONLY` `:573`); `stale` `:599-607`; `tell` `:610-614`; `logCovered` `:617-622` (*"10-minute window"* `:619`);
  `settle` `:628-639` (`consentFromChoice` `:631`); `openWindow` `:653-665` (scope `'all'` hardcoded `:654`);
  `askToSign` `:683-697` (*"ten minutes"* `:689`, buttons `:693`); `modalFailed` `:699-702`; `dispose` `:742-753`;
  `serverParagraph` `:767-770`.
- **`consentTurns.ts`**: `end()` `:229-236` — `slot.finish(…)`, `close()`, `slot.orphaned()`, then
  `controller.abort()`: a turn ended by its bound or its client orphans the slot whatever dialog is up (§2, H1).
- **`agentConsent.ts`** (94): labels `:38-40`; `SIGNING_BUTTONS` `:47` (its comment `:42-46` says E3 inserts
  `ALLOW_LONGER`); `ALLOW_WINDOW_MS` `:50`; `ConsentDecision` `:60-73`; `consentFromChoice` `:76-89` (one caller,
  `sshAgentManager.ts:631`); the header `:9-20` says *"Allow for 10 minutes is the only answer that remembers
  anything"* — reworded in E3.2.
- **`allowWindows.ts`** (275): `MAX_WINDOW_MS` `:77-80`; `ALL_ONLY` `:83`; `scopesFor` `:161-163`; `windowsFor`
  `:187-190`; `windowCovers` `:193-196` (returns the window, not its scope — hence `coveringWindow`); `endAllWindows`
  `:225-227` (clears every scope — W4 pins it through the seam); `endLoginWindows` `:247-249`. **Hooks** (readiness
  finding 5): `scopesFor` and `endLoginWindows` exist, tested and unwired; `lockedNow`, `autoLockMinutes`, the manager's
  `endLoginWindows` and the config listener do not exist (E2 §3 *Hooks*).
- **`sshAgentServer.ts`** (278): `confirm` option `:61`; `confirmAndSign` `:229-241` — `describeSignRequest(request.data,
  request.publicBlob)` `:230`, `request.flags` reaches only `signed` `:240`. **`sshAgentSign.ts`**: `rsaVariant`
  `:36-46`, the SHA-1 comment `:43-44`; `signForAgent` `:96-106` writes the algorithm name at the head of the blob it
  returns. **`sshAgentProtocol.ts`**: `SSH_AGENT_RSA_SHA2_256/512` `:33-34`; `keyTypeOf` `:188-190`; `SignPurpose`
  `:211-214`; `namesThisKey` `:283-288` (`algorithm !== undefined` is all it asks of the algorithm);
  `describeSignRequest` `:385`. The shared fixture `src_vs_code/src/test/sshUserauth.ts` defaults the algorithm to the
  blob's own type, so every existing positive fixture stays a login under the new rule.
- **`sshAgentTexts.ts`** (80): `CROSSING_NOTICE` `:18-27`; `durationText` `:66-69`; `timeLeftText` `:75-80`.
  **`requestTime.ts`**: `clockUntil` `:64` (E2.2) — the list reuses it. **`treeRowText.ts`**: `WINDOW_PHRASE`
  `:59-62` already holds *"logins without asking until"*; `signWindowLabel` `:72-80` joins both scopes — the row label
  needs no change, only the scopes the manager answers with.
- **`sshAgentWiring.ts`** (86): `deps.vaultKeys` is `Pick<VaultKeys, 'noteUserActivity' | 'onDidLock'>` `:24` (gains
  `isLocked`, `dueForAutoLock`); `connectAgentToLock` `:44-49`; `wireSshAgent` `:70-77` (`onUserPresent` →
  `noteUserActivity` `:72`); the startup notice `:83` (D5). **`vaultKeys.ts`**: `onDidLock` `:112`, `lock` `:188`,
  `isLocked` `:206-208`, `dueForAutoLock` `:211-213`, `noteUserActivity` `:352-354`. **`lockState.ts`**:
  `dueForAutoLock` `:101` is false while `lastActivity` is undefined — a vault never unlocked would never auto-lock,
  **except** that the click on the prompt is activity (`:72` above). E3.3 pins that with a guard (W3).
- **The auto-lock setting** is read in two places today — `extension.ts:379-381` (the idle timer, `:376-388`) and
  `commands/keyCommands.ts:376` — each with its own default 60; it has no `scope` in `package.json:174-179`, so a
  workspace value applies.
- **D5's user-facing sites now** (readiness finding 8; `extension.ts:584` moved to the wiring in E2.1):
  `helpEn.ts:184` (title), `:185`, `:188`, `:189` (`ssh-agent`, `:183`), `:209`, `:212` (`wsl-relay`, `:207`) — the
  same lines in `helpDe/Es/Ru/Uk.ts`; the `protection` article `:23-30` (auto-lock); `package.json:110`
  (`wslAgentRelay`), `:178` (`autoLockMinutes`); `agentDoors.ts:103`; `sshAgentWiring.ts:83`;
  `commands/agentCommands.ts:688`; `src_vs_code/README.md:41`, `:73`, `:285-291`, `:905` (auto-lock), `:1114`;
  `media/walkthrough/use.md:4`; `research/architecture.md:460`; `research/PLAN_wsl_agent_relay.md:90-93`. The root
  `README.md:123` (*"serve from an agent that asks before it signs"*) stays true and is not touched. Code comments that
  say the same thing (edited, never scanned — gate finding 3): `sshAgentServer.ts:20-21`, `sshAgentManager.ts:85-89`,
  `agentConsent.ts:9-20`.
- **Tests.** The world (`src_vs_code/src/test/sshAgentWorld.ts`, 358): `FakeServer.confirm(key, purpose, data?,
  signal?)` `:33-38`; `showWarningMessage` `:147-151` returns `w.answers.shift()` whatever the buttons were, and records
  them; no `showQuickPick`, no `CancellationTokenSource`, no settings; `realPrivateKey()` is Ed25519 only (`:64-71`);
  `manager()` `:184-216`; `world()` ALWAYS replaces `./sshAgentServer` with `StubAgentServer`, so no world test crosses
  the real server→manager lambda today. `vscodeStub.ts:196` has a working `StubCancellationTokenSource` (`disposed`
  recorded). The R4 macrotask test is `src_vs_code/src/test/sshAgentManagerTurns.test.ts:409-438`. The buttons test
  `sshAgentManager.test.ts:141-153` (written-out list `:152`); the *what ends a window* assertion `:384`. The
  clock-read-count test `sshAgentManagerWindows.test.ts:170` passes a **login** purpose — it stays green because the
  fail-closed hooks keep *Allow longer…* (and the list's clock read) off that path. The server harness
  `sshAgentServer.test.ts:64-79` drops everything after `signal`; `signRequestFor(blob, data, flags)` `:125` already
  takes flags. `sshKeySign.test.ts:18` builds RSA keys.
- **The scenario** (`scripts/ssh-agent-itest.cjs`, 677): `withVscodeStub` `:270-306` (no `showQuickPick`, no
  `CancellationTokenSource`, no `workspace`); section 6 `lockEndsTheWindow` `:364-424`; the live sshd helpers `:426-550`
  (`launch`, `freePort`, `startSshd` `:479`, `endChild`); section 5 `liveHostBoundLogin` `:563-670`. `sshd -d` serves
  exactly ONE connection, so every login needs its own sshd run. CI installs sshd at `ci-extension.yml:144-147` and runs
  the script at `:150`.
- **Sizes** (C2, C13, C14): `sshAgentManager.ts` 770, `commands/agentCommands.ts` 798, `treeDataProvider.ts` 797 (no
  edit planned), `extension.ts` 1004 = its baseline, `sshAgentServer.test.ts` 750, `sshAgentManager.test.ts` 580,
  `sshAgentManagerTurns.test.ts` 441, `vaultKeysLock.test.ts` 335, `sshAgentHelp.test.ts` 256, the itest 677.
- **The release mechanics.** release-please opens one PR per component (`release-please-config.json`,
  `separate-pull-requests`), runs on dispatch only (`release-please.yml`, `workflow_dispatch`), and a squash commit that
  touches `src_cli/` gives the cli component a release with that commit's type (E1's squash touched
  `src_cli/README.md` and produced `cli-v0.4.3`, `git show --stat 77afb10`) — which is why the CLI sentence is its own
  PR. `CHANGELOG.md` `[Unreleased]` holds E2's sections until 1.15.0's changelog PR moves them.

**Deviations from the parent** (each also in §2 where it is decided): four stories with a pure extraction first;
`sshSignPrompt.ts` arrives by a move in E3.1; the SHA-1 exclusion is `signsWithSha1` + `longWindowClaim`, the flags reach
the gate as a fifth `confirm` argument, and `scopesFor` keeps its signature (the parent allowed either); `longerOffer`
takes the claim, so it can say the SHA-1 reason; a login's algorithm must fit the key (new); the row reads
`scopesFor(loginLive(), autoLock)`; the gate also refuses `login` while locked or overdue for auto-lock (new, M1); the
hooks fail closed; eligibility is asked three times and the middle check allows once (against O1's letter); the list
says the time left; the bound on an open list orphans the slot like a modal's (H1, stated rather than hidden); D3 with
two lengths at the manager is replaced by its reachable cross-scope form; `durationText` stays in `sshAgentTexts.ts`;
`coveringWindow` is added to the book; `CROSSED_LINE` names the answer; the last `why` says *"is off"*;
`consentFromChoice` is deleted in E3.3; `autoLockMinutes` becomes application-scoped (owner); the texts say *"in this VS
Code window"* (owner); the CLI sentence leaves the epic for its own `fix(cli)` PR (owner; the parent edited it in E3);
the `protection` help article names both window answers; M1 shipped with E1, so E3 measures M2 and M3; the
certificate-login follow-up is extracted at promotion.

**The constraints that bite (C1–C17), in every brief below.** C1 `complexity ≤ 4` counts defaulted parameters, `?.`
and `??` — `answerFromModal` and `decideSigning` are a `Map` of small functions, not a `switch`. C2 `max-lines` 800
holds for tests — new suites, not longer old ones; `sshAgentServer.test.ts` (750) takes ONE more test. C3
`extension.ts` frozen at 1004 (`.size-baseline.json`); lower it in the commit that shrinks the file. C4
`treeDataProvider.ts` at 797 — not edited. C5 `noUnusedParameters`: an interim unused parameter is `_name`. C6 never a
literal bidi/format character; escapes (Sonar S6389). C7 a visible assertion in every test body (S2699). C8 no dynamic
call on a requester-keyed lookup (CodeQL): a closed `switch` or `Map.get`. C9 `node:` imports, `String.raw`,
`.includes`. C10 manager tests pass plain `{ entityId, name, fingerprint }`; identity, generation and key type are read
from the manager's own map. C11 `testsToDelete-…` temp names; a test monotonic clock never starts at 0 (`M = 50_000`).
C12 every new suite that loads a key ends with the key-material guard (`keyMaterialLogged()`). **C13**
`commands/agentCommands.ts` is at 798: its edit shrinks or keeps it. **C14** `sshAgentManager.ts`: E3.1 measures and
records the real `wc -l`; E3.3 leaves it ≤ 760 — the list, `pickLength`, the modal text, the `why`s and the notices
live in `sshSignPrompt.ts` / `sshAgentTexts.ts`. **C15** `ALLOW_LONGER` ends in U+2026 `…`, one character: every help
language, README and test carries the same character, never three ASCII dots — a guard scans for `Allow longer...`.
**C16** the hooks fail closed (`() => true`, `() => true`, `() => 0`). **C17** R4: no `await` between the last
`turn.aborted` check and the grant — after the modal AND after the list.

## 4. E3.1 — room to work: the window holder and the prompt leave the manager

**Tests.** None new, and no assertion changes: a move is proven by the suite staying green with the same test count
(`npm test` before and after, both counts quoted). Two break-its, run once each and quoted, show the suites still reach
the moved code: delete `this.arm(at)` from the moved `set` → *the expiry timer re-arms*
(`src_vs_code/src/test/sshAgentManagerRow.test.ts:257`) goes red; drop `...SIGNING_BUTTONS` from the moved modal → *the
dialog offers exactly the signing buttons* (`src_vs_code/src/test/sshAgentManager.test.ts:141`) goes red.
`sshAgentHelp.test.ts`'s `REPLACED_IN_CODE` gains an entry for `sshSignPrompt.ts` (the old *"The dialog in front of
every signature."*), so the scan follows the prompt to its new file.

**Brief.**

1. **`src/sshAgentWindows.ts`** (new, no `vscode`): `export class SigningWindows` holding `private book: AllowWindows =
   NO_WINDOWS` and the expiry timer; constructor `(clock: () => Date, monotonic: () => number, changed: () => void)`.
   Methods moved verbatim with their comments: `set(next, at?)` (was `setWindows`), `moment()`, `arm`, `timerFor`,
   `expired`, `live(key: KeyRef, scopes, at)` (was `liveWindows`, the scopes now an argument — the manager still passes
   `ALL_ONLY`), `get current(): AllowWindows`, and `dispose()` (clears the timer). `Moment` and `EXPIRY_LOOK_MS` move
   with it. The manager builds it in the constructor BODY, after `this.monotonic` (as `this.turns`, `:189-190`); the
   `disposed` check stays in the manager's `changed` closure, so the field the wiring assigns is still the manager's.
2. **`src/sshSignPrompt.ts`** (new, `vscode`): `askSigning(key, purpose, asked, leftMs, log): Promise<string |
   undefined>` — `askToSign` and `modalFailed` verbatim; the modal's text in a function of its own beside it;
   `serverParagraph` with them. The text does not change by one character.
3. **`sshAgentTexts.ts`** gains `CROSSED_LINE` (moved, still keyed by outcome, still quoting `ALLOW_WINDOW`).
4. **The manager.** Every `this.windows` read becomes `this.windows.current`, every write `this.windows.set(…)`;
   `endAllWindows`, `endWindows`, `windowsFor`, `nameOf` stay; `dispose` calls `this.windows.set(NO_WINDOWS)` then
   `this.windows.dispose()`. An `interface Arrival { key; purpose; asked; arrived }` built once in `confirm` and handed
   to `turnStarted(arrival, turn, leftMs)` and `beforePrompt(arrival, waited)`.

**Docs.** `research/module_extension.md`: the two new modules in the `SshAgent` subgraph (`:42-52`), the row *"A window
belongs to one generation of one key"* (`:4856`) names `SigningWindows` as the holder, the sentence under the section
title (`:4845-4847`) names `sshSignPrompt.ts` as the modal's home. `research/module_tests.md`: one line — no suite
changed; the two break-its.

**Done when.** Suite green with the same count, typecheck, lint, ratchet green; the manager's real `wc -l` measured and
written here (expected ≈ 665 or below — if E3.3's budget to 760 does not fit, move more before E3.3, never during) —
**measured in E3.1: 662, from 770** (`sshAgentWindows.ts` 100, `sshSignPrompt.ts` 61); both
break-its quoted; no test file edited except the `REPLACED_IN_CODE` entry.

## 5. E3.2 — what an answer means, what may be offered, what SHA-1 RSA is never given, what a login is (pure)

**RED tests:**

| Test (the guarantee) | File | RED on `main` says |
|---|---|---|
| a whole number of hours reads in hours: *1 hour*, *4 hours*, *12 hours* | `src_vs_code/src/test/sshAgentTexts.test.ts` | `'60 minutes' !== '1 hour'` |
| a userauth whose algorithm is empty is not a login (an RSA signing key) | `src_vs_code/src/test/sshAgentProtocol.test.ts` | actual `{ kind: 'ssh-login', … }`, expected `{ kind: 'unknown' }` |
| a userauth whose algorithm belongs to another key type is not a login — `ssh-ed25519` on an RSA key, `ssh-rsa` on an Ed25519 key | same | actual `ssh-login` |

Guards, green before and after: *a bound under an hour still reads in minutes or seconds* (5 min, 1 s, 90 min — not a
whole hour, stays *90 minutes*); *an RSA login says `ssh-rsa`, `rsa-sha2-256` or `rsa-sha2-512` and is a login; an
Ed25519 and an ECDSA login say their own type* (the positive a file of negatives needs; break-it for the rule: accept
any non-empty algorithm → the two REDs go red again).

**New functions — cannot be red; each with its break-it** (run once, quoted):

- `src_vs_code/src/test/agentConsent.test.ts`: *Allow longer… authorises nothing by itself* —
  `answerFromModal(ALLOW_LONGER) === 'pick-longer'`, never a `SigningAnswer` (break-it: map it to a 1-hour window);
  *each label means what the table says* — once, deny, the 10-minute `all` window, `undefined` → unanswered (break-it:
  `ALLOW_WINDOW` → `login`); *an unrecognised label allows once and arms nothing* (the old `consentFromChoice`
  guarantee, carried over; break-it: → window); *each offered length arms exactly its duration, from the pick* —
  `answerFromPick(4 h)` then `decideSigning(…, now)` → `login`, `until === now + 4 h` (break-it: `+ 1 h`); *Escape on
  the list refuses and counts as presence; the bound running out does not* — `declined-longer` → `{ allow: false,
  present: true }`, `unanswered` → `present: false` (break-it: declined not present); *a length the list never offered
  allows once and arms nothing* — `answerFromPick(2 h)` (break-it: accept any number); *the lengths are 1, 4, 8 and 12
  hours, shortest first, none past the login ceiling* — `LONGER_WINDOWS_MS` against `MAX_WINDOW_MS.login` imported
  (break-it: 13 h); `longWindowClaim`: *a login with a SHA-2 or non-RSA signature may have a long window, SHA-1 RSA and
  every other purpose may not* (break-it: ignore `sha1`); `longerOffer`: *offered only for a login, never for SHA-1,
  never while locked, never with auto-lock 0 or negative — and says which, in the §2 order* (break-its: `!== 0`;
  locked checked first, which makes the SHA-1 case read the lock reason).
- `src_vs_code/src/test/sshKeySign.test.ts`: *SHA-1 is decided by what the signer really writes* — for every `flags`
  0–7 and an RSA key, `signsWithSha1('ssh-rsa', f)` is true exactly when the blob `signForAgent(rsaKey, data, f)`
  returns names `ssh-rsa` at its head (read back with the protocol's string reader, never a typed list — testing.md);
  `false` for Ed25519 and ECDSA at flags 0 (break-it: `flags === 0` alone, wrong for flags `1`).
- `src_vs_code/src/test/allowWindows.test.ts` (+1): *`coveringWindow` names the scope that covers, first in the order
  asked, and `windowCovers` is its window* (break-it: the last scope).
- `src_vs_code/src/test/sshAgentTexts.test.ts`: *the list offers four items with their end times and the auto-lock
  sentence* — `longerItems(now, offset, 60)`: labels *1 hour* … *12 hours*, descriptions *until 12:55, or until the vault
  locks (idle auto-lock: 60 min)*, *00:55 tomorrow* across midnight (local-noon fixtures, an offset number, `clockUntil`
  reused; break-it: drop the day); *the crossing line names the answer that was given* — `crossedLine('fenced-lock',
  'Allow longer…', 4 h)`, and for `ALLOW_WINDOW` today's line exactly (break-it: always `ALLOW_WINDOW`); *the notices
  read as the plan says* — `pickRefusedNotice(why)`, `loginWindowsEndedNotice(1)` and `(2)` (break-it: drop `{n}`).

**Brief.**

1. `sshAgentTexts.ts`: `durationText` gains one branch — a whole number of hours → `plural(h, 'hour')` (C1: a helper if
   it would pass 4). Then `longerItems(now, offsetMinutes, autoLockMinutes)` over `LONGER_WINDOWS_MS`;
   `crossedLine(outcome, answer, ms?)` replacing the `CROSSED_LINE` table (its one call site passes `ALLOW_WINDOW` until
   E3.3 — no behaviour change); `pickRefusedNotice(why)`; `loginWindowsEndedNotice(n)`; the two log-line builders of
   the answer table.
2. `sshAgentProtocol.ts`: `namesThisKey` asks `algorithmFits(algorithm, signingKeyBlob)` — `keyTypeOf(blob) ===
   algorithm`, or for `ssh-rsa` one of the two RFC 8332 names; a closed set, compared by `Set.has`, never a lookup keyed
   by the requester's text (C8). The doc of `describeSignRequest` (`:345-384`) states the rule.
3. `sshAgentSign.ts`: `export function signsWithSha1(keyType: string | undefined, flags: number): boolean`.
4. `agentConsent.ts` (widened, reuse move 1): `ALLOW_LONGER = 'Allow longer…'` (NOT yet in `SIGNING_BUTTONS` — the help
   test would go red with nothing to fix it in this story); `LONGER_WINDOWS_MS`; `SigningAnswer` (parent §6.2);
   `answerFromModal`, `answerFromPick`, `decideSigning(answer, now): { allow; present; window?: { scope; until } }` —
   both as a module-level `Map` of small functions (C1); `LongWindowClaim`, `longWindowClaim(purpose, sha1)` (`import
   type { SignPurpose }`); `LongerOffer`, `longerOffer(claim, locked, autoLockMinutes)` — the four `why`s of §2 as an
   ordered list, the first that applies wins. `import type { WindowScope } from './allowWindows'` — type-only, no
   runtime cycle (`allowWindows.ts:1` imports this module). The header `:9-20` is rewritten for four answers.
   `consentFromChoice` stays until E3.3.
5. `allowWindows.ts`: `coveringWindow(book, key, scopes, now, nowMono): { scope; window } | undefined`; `windowCovers`
   becomes `coveringWindow(…)?.window` — behaviour identical, its tests untouched.

**Docs.** `research/module_extension.md`: the row *"The dialog names what is being signed"* (`:4853`) gains the
algorithm rule; the row *"Allow once / Allow for 10 minutes / Deny"* (`:4854`) the answer table and the SHA-1 rule (the
owner's decision of 2026-10-21); the book row (`:4856`) names `coveringWindow`. `research/module_tests.md`: the new
cases and their break-its.

**Done when.** The 3 REDs quoted beside their GREENs; every break-it quoted once; no production caller changed except
the one `crossedLine` call; suite, typecheck, lint green; Fable's security judgement on the algorithm rule passed.

## 6. E3.3 — *Allow longer…* lets SSH logins through for 1, 4, 8 or 12 hours, and nothing else

**Where each RED is observed.** On `main` none of the tests below compiles except S1's harness change, H1, L18 and W6
(`ALLOW_LONGER` is E3.2's; the hooks, the world's list and `endLoginWindows` do not exist). Two observation points,
both honest — a RED that fails in its setup proves nothing (testing.md), so a test whose guarantee is a RESTRICTION is
observed where the window exists and only that restriction is missing:

- **(I) the interface step** (brief step 1): the prompt still offers three buttons and `settle` still reads
  `consentFromChoice`, so an answer of *Allow longer…* (which the world's stub returns whatever the buttons were) is an
  unrecognised label → allowed once, no window, no list. The feature's REDs are here.
- **(P) the head just before the fix sub-step** that a restriction test pins (brief step 3, sub-steps (a)–(j)).

| Test (the guarantee) | File | RED says |
|---|---|---|
| S1 the server hands the request's flags to the gate | `src_vs_code/src/test/sshAgentServer.test.ts` (+1; the harness passes `flags` through) | (I) `0 !== 2` — the server passes a constant |
| H1 the help names every answer the signing prompt offers, in every language (existing, `:43`) | `src_vs_code/src/test/sshAgentHelp.test.ts` | after sub-step (a) inserts `ALLOW_LONGER`: `ssh-agent (en) does not name "Allow longer…"`, and the four others |
| L1 a login prompt offers *Allow longer…* third, before *Deny*; a Git signature's prompt does not (replaces the single written-out list `sshAgentManager.test.ts:152`) | new `src_vs_code/src/test/sshAgentManagerLonger.test.ts` | (I) `buttons[0]` is `['Allow once', 'Allow for 10 minutes', 'Deny']` |
| L2 *Allow longer…* then 4 hours lets logins through for four hours from the PICK — the prompt sat 3 minutes first; at pick + 4 h − 1 min silent, at pick + 4 h prompts; `presence === 1` | same | (I) `dialogs.length` 2, expected 1 (`picks.length` 0) |
| L3 the list offers 1, 4, 8 and 12 hours, shortest first, each with its end time and *or until the vault locks (idle auto-lock: 60 min)*; the title names the key through `displayText` (a name with a line break shows `?`) | same | (I) `picks.length` 0, expected 1 |
| L4 Escape on the list refuses this signature and counts as presence, and says nothing | same | (I) `true !== false` (allowed once) |
| L4b Escape after the offer became ineligible still refuses — list open → `lockedNow` true → Escape → `false`, no window, no notice; the same with auto-lock → 0 (C-a) | same | (I) `true !== false`; break-it: the eligibility re-check before the `undefined` check → `true !== false` with a notice |
| L5 the bound covers both steps: a list still open at the bound is closed and the request refused (*no answer in … — refused*); a login queued behind the list is refused `orphaned` at that moment with the orphan notice once (H1, the true behaviour); nothing is signed for either; once the list has settled the next request prompts | same | (I) `picks.length` 0, expected 1 |
| L7 a pick that is no longer eligible allows once, opens no window and says why — the list opened with auto-lock 60, the hook set to 0, 12 hours picked; auto-lock back on, the next login prompts | same | (I) `infos.length` 0, expected 1 |
| L8 the vault locked while the list was open: the pick allows once, opens no window, says the vault is locked | same | (I) `infos.length` 0, expected 1 |
| L8b the vault locked while the MODAL was up: *Allow longer…* opens no list, allows once and says why, once (the middle check, M3) | same | (I) `infos.length` 0; break-it: drop the middle check → `picks.length` 1 |
| L9 the list is not offered for a Git signature, while locked, with auto-lock 0, or for SHA-1 RSA — and the prompt says which | same | (I) no dialog contains *"Longer windows"* |
| L10 through the REAL server and the manager's own forwarding lambda (C-c): an RSA key's login window covers logins with flags 2, 4 and 6; flags 0 and 1 prompt, offer no *Allow longer…* and say the SHA-1 reason; answered *Allow for 10 minutes*, the next flags-0 login is covered by that 10-minute window (owner: as today) | new `src_vs_code/src/test/sshAgentManagerFlags.test.ts` (the world with `realServer: true`, a real socket, `sshUserauth.ts`, `signRequestFor`) | (I) the flags-2 login prompts: `dialogs.length` 2, expected 1 |
| L11 a request a login window covers never waits behind an open Git prompt (parent S6, moved from E2) | `…/sshAgentManagerLonger.test.ts` | (I) `atOnce(r2)` is `'slow'` |
| L12 a 10-minute answer for a Git signature never shortens a 12-hour login window — the row shows both, the login one still ending at pick + 12 h (D3 with two lengths, reachable form, §2) | same | (I) `windowsFor` has no `login` |
| L13 a login window opened by the first prompt covers the waiting login without a prompt (E2.3 T2 for `login`; `beforePrompt` reads the claim) | same | (I) `dialogs.length` 2, expected 1 |
| L15 every silent login names its window: *allowed without asking: login window of "prod" until … (granted …)*, both stamps through `localWallTime` | same | (I) no line matches `/login window of/` |
| L16 an answer of *Allow longer…* given across a lock or *Ask for Every Use Again* names the answer it was in the log, and the message says so | same | (I) no crossing line at all — no window is ever asked for, so nothing crosses |
| L18 the prompt says any process running as you that reaches the agent signs without asking while a window is open, and that locking the vault in this VS Code window ends every window (O6, Q-B; rewrites the regex of `sshAgentManager.test.ts:384`) | `src_vs_code/src/test/sshAgentManager.test.ts` | **on `main`**: no match for `/any process running as you that reaches this agent/` |
| L19 the list says the time the request has left — a request that waited 4 minutes reads *refused after 60 seconds* on the list too | `…/sshAgentManagerLonger.test.ts` | (I) `picks.length` 0 |
| L21 an auto-lock that is overdue leaves no login window honoured: the login prompts and the row hides the window (M1) | same | (P) before sub-step (d): `dialogs.length` 1, expected 2 — the window still covered |
| W1 setting idle auto-lock to 0 ends every login window, keeps the 10-minute ones, tells the person once and repaints the row — a real settings change through `wireSshAgent`'s listener | `src_vs_code/src/test/vaultKeysLock.test.ts` | (P) on a head with (a)–(i) and no (j): `infos.length` 0, expected 1; the row still says *logins without asking* |
| W2 `wireSshAgent` tells the manager whether the vault is locked, whether auto-lock is overdue and what it is set to — through the wiring, a login prompt offers *Allow longer…* | same | (P) on a head with (a)–(i) and no (j): the buttons have no *Allow longer…* (the fail-closed defaults) |
| W6 `credSshManager.autoLockMinutes` is application-scoped, so a workspace cannot raise it (owner, Q-D) — read from the manifest | `src_vs_code/src/test/autoLockSetting.test.ts` (new) | **on `main`**: `scope` is `undefined`, expected `'application'` (break-it: drop it) |

**Guards — green before and after, each with a break-it** (run once, quoted): L6 *a late Allow longer… opens no list
and says the request had already been refused* (break-it: open the list before checking `turn.aborted`). L14 *the gate
and the row answer "which windows count" through the same `scopesFor`* — two legs: a waiter queued when the hook goes to
0, and an IMMEDIATE arrival after the hook goes to 0 with no listener firing (C-d): neither is covered, the row hides the
window (break-its: the row reads `['all', 'login']` as a constant; the gate reads `autoLockMinutes` fixed at 60). L17
**the R4 rule on the pick path** — the three macrotask timings of `sshAgentManagerTurns.test.ts:409-438`, the client
going away right after the PICK: signed ⇔ a login window open, and a refusal tells exactly once (break-it: an `await new
Promise((r) => setImmediate(r))` between the check and the grant). L20 **the pick races** (C-e): abort → an item; abort →
`undefined`; `undefined` → abort, all before the continuation runs: none signs, none grants, `presence === 0` for the
two aborted ones; an already-aborted turn opens no list; the list's `StubCancellationTokenSource` is `disposed` and its
abort listener removed afterwards (break-its: check `undefined` before `turn.aborted` → `presence` 1; no `finally` →
`disposed` false). L22 *a list that REJECTS is a dismissal* — refused, no presence, one log line (break-it: no `.catch` →
an unhandled rejection fails the run). W3 *a login window granted on a vault never unlocked still has an auto-lock to end
it* — a real `VaultKeys`; after the pick `vaultKeys.dueForAutoLock(now + 60 min, 60) === true` (break-it: the wiring's
`onUserPresent` not noting activity). W4 *a lock through the real seam ends a login window too* (gate finding 2: the
book's `endAllWindows` clears every scope, `allowWindows.ts:225-227`; break-it: end only `all`). W5 *a manager nobody
wired offers no longer window and honours none* (break-it: default `autoLockMinutes = () => 60`). W7 *the reader: unset
→ 60, 0 → 0, −5 → −5, and the listener ends login windows at −5 as at 0* (`autoLockSetting.test.ts`; break-it: the
listener's `<= 0` as `=== 0`). And the whole of `sshAgentManagerWindows.test.ts`, `sshAgentManagerTurns.test.ts` and
`sshAgentManagerRow.test.ts` unchanged.

**Brief.**

1. **Interface step, suite green.** The world: `showQuickPick(items, options, token)` recording `{ items, options }` in
   `w.picks` and answering from `w.pickAnswers` by LABEL against the real items (a label not among them throws — a test
   cannot pick what the list never offered; `undefined` = Escape), resolving `undefined` when the token is cancelled;
   `unansweredPick()` (the shape of `unanswered()`, `:288`), and a `rejectedPick()`; `CancellationTokenSource:
   StubCancellationTokenSource`; `workspace` with a settable `w.settings` map behind `getConfiguration` and an
   `onDidChangeConfiguration` emitter; `realPrivateKey(type: 'ed25519' | 'rsa' = 'ed25519')`; `manager()` options
   `autoLockMinutes?`, `locked?`, `overdue?`, which set the hooks; `world({ realServer: true })` keeps the real
   `SshAgentServer` (no module override) for L10; `FakeServer.confirm(…, flags?: number)` defaulting to `0` (C1: the
   stub's lambda reaches 4). The server's option type gains `flags: number` and the server passes `0`; the manager's
   `confirm(…, _flags)` (C5). The manager gains the three fail-closed hooks and `endLoginWindows(_reason: string):
   number { return 0; }`. Suite green.
2. **The tests, red** — every row of the table at its observation point, quoted. S1 extends the harness's pass-through to
   `(key, purpose, _data, signal, flags) => confirm(key, purpose, signal, flags)`.
3. **The fix, in this order** (each sub-step is the (P) head for the tests named against it):
   (a) `SIGNING_BUTTONS = [ALLOW_ONCE, ALLOW_WINDOW, ALLOW_LONGER, DENY]` — H1 goes red — and the help `ssh-agent` article
   in all five languages (§7 E3.4 gives the wording; button names English, CLAUDE.md rule 7). (b) The server passes
   `request.flags` (`:230`) AND the manager's forwarding lambda (`:448`) passes it on. (c) `confirm` computes, at arrival
   and before any `await`, `claim = longWindowClaim(purpose, signsWithSha1(keyTypeOf(loaded.identity.publicBlob),
   flags))` from the manager's OWN loaded key (C10), into the `Arrival`; the gate asks `scopesFor(claim === 'login' &&
   !lockedNow(), autoLockMinutes())` through `coveringWindow`; the row and `had` ask `scopesFor(!lockedNow(),
   autoLockMinutes())`; `logCovered` names the scope. (d) `loginLive()` gains `!autoLockOverdue()` (M1). (e)
   `turnStarted`: the ticket now; `offer = longerOffer(claim, lockedNow(), autoLockMinutes())`; `askSigning({ …, offer
   })` in `sshSignPrompt.ts`; on *Allow longer…*: `turn.aborted` → stale; the middle check → `pickRefused`; else
   `pickLength(…)` in `sshSignPrompt.ts` opens the list; then, **with no `await`** (C17), in §2's order: stale →
   `undefined` → the pick re-check → `settle(arrival, ticket, answer)` → `decideSigning` → `openWindow(…, scope)` with
   `crossedLine(outcome, label, ms)`. `consentFromChoice`, its import and its tests are deleted. (f)
   `endLoginWindows(reason)`: count the keys with a live login window, `set(endLoginWindows(book))`, log when keys are
   loaded, `tell(loginWindowsEndedNotice(n))` when `n > 0`, return `n`. (g) The modal text of parent §7 with the O6
   paragraph, *"in this VS Code window"* and `offer.why` when there is no button; the list texts of §2 — all in
   `sshSignPrompt.ts` / `sshAgentTexts.ts`. (h) `autoLockSetting.ts` (`autoLockMinutesSetting()`), read by
   `extension.ts:379-381` and `commands/keyCommands.ts:376`; the baseline lowered; `"scope": "application"` on
   `credSshManager.autoLockMinutes` (`package.json:174-179`). (i) The `sshAgentProtocol.ts` flags paragraph names
   `signsWithSha1`. (j) `sshAgentWiring.ts`: `connectAgentToSettings` (§2), `deps.vaultKeys` gains `isLocked` and
   `dueForAutoLock`.
4. **Sizes.** The manager ≤ 760 (C14); `sshSignPrompt.ts` ≈ 170; the Longer suite ≈ 650 (split before 800); the Flags
   suite ≈ 200; `vaultKeysLock.test.ts` 335 + ~110; the world 358 + ~80.

**The traps, each with the test that pins it.** The key type read from the `AgentKey` argument (L10 never sees RSA). The
flag added to the server but not to the manager's forwarding lambda (L10 through the real server). The row or `had`
through `scopesFor(false, …)` or `ALL_ONLY` (L12, W1). The hooks read once at arrival only (L14's waiter leg). An `await`
between the last `turn.aborted` and the grant (L17). Escape after ineligibility degraded to "allowed once" (L4b). The
list opened without the middle check (L8b). The list's token cancelled by anything but this turn, never disposed, or
raised for an already-aborted turn (L20). The bound on the list assumed to free the slot without orphaning (L5). A pick
answered by index instead of by label (L2 asserts the end time). The stale message on Escape (L4 counts `infos`). The
clock read twice at the pick (L2's stepped clock). Presence counted twice for modal + list (L2, L4).

**Docs.** `CHANGELOG` `[Unreleased]` (on top of 1.15.0's section, which the 1.15.0 changelog PR will have moved):
`### Added — longer SSH windows for logins (#197)`: *a login prompt offers **Allow longer…**: 1, 4, 8 or 12 hours of SSH
logins with that key without asking — git push and fetch over SSH included, a Git signature or anything else still
asks; offered only while the vault is unlocked and idle auto-lock is on, and every lock in this VS Code window ends it,
so with the default 60-minute auto-lock a long window usually ends after an hour unless you use the vault; the key's
row says *logins without asking until 18:40*; an RSA login that asks for the old SHA-1 signature is never covered by
one; setting idle auto-lock to 0 ends every login window*. `### Changed`: *`credSshManager.autoLockMinutes` is now a
machine-wide (application) setting: a workspace or folder value is no longer applied*. `research/module_extension.md`:
the `SshAgent` subgraph gains the edge wiring → settings; the turn sequence diagram (`:4868-4913`) gains the list step,
the middle check, the post-list order and the orphan on the list; the rows `:4854`, `:4856`, `:4857` (a lock ends login
windows too, in this VS Code window), `:4858` (the row reads `scopesFor(loginLive(), …)`), `:4859` (the slot covers the
list; the bound orphans it like a modal's), `:4862` (four answers). `research/module_tests.md`: the suites, the REDs,
the break-its.

**Done when.** The 24 REDs quoted at their observation points beside their GREENs and the 9 break-its run once; every
function the story added or changed ≤ 4 complexity and ≤ 50 lines; the manager ≤ 760 lines; Opus review and Fable's
security judgement passed — the judgement reads `longWindowClaim`, `loginLive`, the three eligibility questions, the
post-list order and the pick path's R4 by name.

## 7. E3.4 — every user-facing text of 1.16.0 says what the prompt offers, a live login proves the window, the release ships

**What the words tests read** (gate finding 3): USER-FACING strings only — the help articles through `helpContent`
(per field), `README.md` and markdown (per paragraph), `package.json` fields (per field), and exported constants — never
code comments. The three sentences that live inside code today become exported constants in `sshAgentTexts.ts`, so the
test reads strings rather than source text: `KEYS_SERVED_NOTICE(count)` (`sshAgentWiring.ts:83`), `AGENT_SERVED_NOTE`
(`commands/agentCommands.ts:688`, which then shrinks — C13), `RELAY_ROW_DETAIL` (`agentDoors.ts:103`).

**RED tests** (new `src_vs_code/src/test/sshAgentWords.test.ts`; `sshAgentHelp.test.ts` stays as it is):

| Test (the guarantee) | RED on `main` says |
|---|---|
| R-a: in every help language, a field of the `ssh-agent`, `wsl-relay` or `protection` article that names `ALLOW_WINDOW` also names `ALLOW_LONGER` (the labels are English everywhere — rule 7) | `wsl-relay (en) whatItIs names "Allow for 10 minutes" and not "Allow longer…"` (and de, es, ru, uk) |
| R-a+: the `protection` article names both window answers — a lock ends a window opened with either — in every language | `protection (en) names neither "Allow for 10 minutes" nor "Allow longer…"` |
| R-b: an English user-facing unit (a README paragraph, a walkthrough line, the `wslAgentRelay` and `autoLockMinutes` descriptions, the three constants) that names the 10-minute window (`/\b10 minutes\b/`) also names the longer one (`/Allow longer…\|12 hours/`) | `src_vs_code/README.md paragraph 1 names the 10-minute window and not the longer one` (`:41`) |
| scenario, section 7 (POSIX, brief step 2) | the fix landed in E3.3, so the teeth are shown by revert (testing.md): with the gate's scopes reverted to `ALL_ONLY`, *login 2 raised no dialog* fails — `2 dialogs` |

Companions (a scan that matches nothing proves nothing): *R-b's pattern matches the old sentences it was written for* —
`README.md:41`'s and `package.json:110`'s old text, quoted, match the 10-minute pattern and not the longer one, and the
new `package.json:110` and `protection` wording match BOTH (review M4: neither can pass vacuously); *R-a reads something*
— every scanned field count is non-zero. Guard (C15): *"Allow longer..." with three ASCII dots appears nowhere* — the
five help files, both READMEs, the walkthrough, `package.json`, `src/**/*.ts` (break-it: plant one in a help file).

**Brief.**

1. **The tests, red.** Then the texts, true for 1.16.0, button and command names in English in every language (CLAUDE.md
   rule 7), the English the source:
   - help `ssh-agent` (E3.3 wrote it; re-read here): title *"The SSH agent that asks: once, for 10 minutes, or longer
     for logins"*; the four answers; the list, the row's *logins without asking until 18:40*, what ends it — *locking
     the vault in this VS Code window* —, why it usually ends after an hour, the SHA-1 sentence, auto-lock 0, and that
     auto-lock is a machine-wide setting.
   - help `wsl-relay` `:209`, `:212`: the four answers; *while a window is open, any process in WSL signs with that key
     without asking — for a login window, any SSH login with it; locking the vault in this VS Code window ends every
     window*.
   - help `protection` (`:23-30`): *a lock — by hand or idle auto-lock — also ends every SSH window opened with **Allow
     for 10 minutes** or **Allow longer…** in this VS Code window; with auto-lock off, **Allow longer…** is not
     offered; auto-lock is a machine-wide setting, which a workspace cannot change.*
   - `package.json:110` (`wslAgentRelay`): *while a window is open — 10 minutes for any signature, up to 12 hours for SSH
     logins — any process in that distribution signs …*; `:178` (`autoLockMinutes`): *locking also ends every SSH
     signing window; at `0` no window longer than 10 minutes is offered (a login window lasts up to 12 hours), and
     setting it to `0` ends every open login window. A machine-wide setting: a workspace or folder value is not
     applied.*
   - `RELAY_ROW_DETAIL`: *(once, for 10 minutes, or for SSH logins up to 12 hours)*; `KEYS_SERVED_NOTICE`: *the answer
     covers it once, every use for 10 minutes, or SSH logins for up to 12 hours*; `AGENT_SERVED_NOTE`: *a signature
     asks first — once, for 10 minutes, or logins for up to 12 hours.*
   - `src_vs_code/README.md:41`, `:73`, `:285-291` (*Four answers* — and the long window's paragraph, *in this VS Code
     window*), `:905` (auto-lock: ends the windows; machine-wide), `:1114`; `media/walkthrough/use.md:4`.
   - Code comments that say the same thing, edited by reading (not scanned): `sshAgentServer.ts:20-21`,
     `sshAgentManager.ts:85-89`.
2. **The scenario, section 7** — `liveLoginWindow(pem, publicPath, dir)`, POSIX only; skipped on Windows with *"skip
   live login window — POSIX only; the Extension Development Host check covers Windows"*; with `CI=true` a missing
   sshd FAILS, as section 5 does. The stub (`withVscodeStub`) gains `showQuickPick` reading `global.__AGENT_PICK__` (an
   array of labels, matched against the real items), `CancellationTokenSource` and a `workspace` stub. A real
   `VaultKeys` (a Map `SecretStorage`), `connectAgentToLock` AND `connectAgentToSettings` with auto-lock 60, a manager
   over `path.join(dir, 'w2')` (the socket stays under 104 bytes — reuse the assert). One `sshd -d` run per login,
   reusing `startSshd`/`endChild`/the free-port retry:
   - **Ed25519 leg.** Login 1 → one dialog with four buttons, one list → *1 hour*; login 2 → no new dialog, the log has
     *login window of "itest key"*; `ssh-keygen -Y sign` → a dialog without *Allow longer…*; `vaultKeys.lock()` → login
     3 → a dialog that offers no *Allow longer…* (locked).
   - **RSA leg.** An RSA key; its sshd config adds `PubkeyAcceptedAlgorithms +ssh-rsa`. Login 1 (SHA-2, the client's
     default) → *1 hour*; login 2 (SHA-2) → no dialog; login 3 with `-o PubkeyAcceptedAlgorithms=ssh-rsa` (SHA-1, flags
     0) → a dialog without *Allow longer…*, naming the SHA-1 reason.
   `finally` in section 5's order (client, sshd by its pid, await exit, then the folder). **CI cost**: six sshd runs of
   about one second each plus the clients — estimated under 20 s on `ubuntu-latest`; the first CI run's time is
   measured and quoted. If the script would pass 800 lines, the sshd helpers (`:426-550`) move to
   `scripts/itestSshd.cjs` first, a pure move.
3. **Measured by hand, once each, recorded in the PR** — on the minimum supported VS Code (`package.json` `engines`
   `^1.93.0`, so 1.93) AND the current stable:
   - **M2** — the list with `ignoreFocusOut: true` survives a second modal raised over it (a second key's prompt), and a
     second quick pick or Ctrl+P closing it resolves as Escape (refused, presence); and (C-f) highlight an item, let the
     bound run → the list disappears, the request is refused, nothing is signed, and the next request for that key
     prompts (the slot freed).
   - **M3** — the four-button modal at a 1280-pixel-wide window in `window.dialogStyle` `native` AND `custom`: **pass**
     when all four buttons and *Cancel* are visible with unclipped labels and *Allow once* is the default (Enter);
     **fail** otherwise, with a screenshot, and the plan stops for a decision.
   - **The Extension Development Host check on Windows**: load a key; `ssh` to a throwaway OpenSSH ≥ 8.9 container (as
     E1's M1) → four buttons → *Allow longer…* → the list's four items with end times and the auto-lock sentence → *1
     hour* → the row says *logins without asking until …* → a second `ssh` logs in silently → `git commit -S` asks,
     without *Allow longer…* → *Lock Vaults* → the row clears → the next `ssh` asks, without *Allow longer…* while
     locked; then auto-lock 0 → the prompt says why and offers no list, and with a login window open the information
     message appears; a `.vscode/settings.json` with `"credSshManager.autoLockMinutes": 600` changes nothing
     (application scope). Screenshots in the PR.
4. **The Linux container run** (E2's recipe): `docker run --rm --name testsToDelete-ait-e3-<id>`, a non-root user,
   `openssh-server` + `openssh-client`, the worktree copied in; sections 5, 6 and 7 all RUN — output quoted.

**Docs.** `CHANGELOG` `[Unreleased]` `### Changed — the texts say what the prompt offers`: *the help (five languages),
the README, the walkthrough and the settings say the prompt offers once, 10 minutes, or 1–12 hours for SSH logins, and
that a lock ends them in this VS Code window*. `research/architecture.md:460` and
`research/PLAN_wsl_agent_relay.md:90-93`: the login window, its scope and what ends it, dated *(2026-…, #197 E3)*.
`research/module_extension.md`: `:4862` four answers and the words tests. `research/module_tests.md`: the itest row
(`:41`) and the live-section row (`:1257`) gain section 7 and what it does not prove (a Windows login — the EDH check);
the leftovers row (`:137`) the folder `w2`; the words suite.

**Done when.** The 4 REDs quoted (the scenario's by revert, then restored and green); the four translations read
sentence by sentence against the English by the Opus review, its verdict quoted in the PR; M2, M3 (both VS Code
versions) and the EDH check recorded; section 7 green in the Linux container and RUN in CI, its time quoted.

## 8. Epic Definition of Done

- [ ] Every story's RED was observed at the point §5–§7 name and is quoted in the PR beside its GREEN — 31 REDs (3 + 24
      + 4); every break-it quoted once.
- [ ] In `src_vs_code`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run ratchet` green; `.size-baseline.json`
      lowered for `extension.ts`; `sshAgentManager.ts` ≤ 760; `commands/agentCommands.ts` ≤ 800; `treeDataProvider.ts`
      untouched; `helpCoverage`, `manifest`, `readmeClaims` green.
- [ ] `npm run itest:ssh-agent` green locally (Windows: sections 1–4 and 6) **and in a Linux container** (sections 5,
      6, 7 RUN), and green in CI (`ci-extension.yml:150`) with section 7 RUN, not skipped.
- [ ] M2, M3 and the Extension Development Host check recorded in the PR, on VS Code 1.93 and the current stable.
- [ ] Every user-facing text in D5's row true for 1.16.0 in all five help languages; no `src_cli` change in the PR (the
      CLI sentence is its own `fix(cli)` PR, §1).
- [ ] Temp folders carry `testsToDelete-`; docs landed with each story; Mermaid renders; `plan-lifecycle.mjs`,
      `pin-check.mjs` and `.github/scripts/public-hygiene.mjs` pass.
- [ ] coai `review_code` with `plan: todo/PLAN_ssh_allow_longer_windows.md`, `epic: 3/3`; every finding resolved;
      verdicts and reviewer counts reported.
- [ ] **Order.** The PR is merged only after `extension-v1.15.0` is tagged, its changelog PR is merged and the Marketplace
      shows 1.15.0 — otherwise release-please folds E2 and E3 into one release. The branch is rebased onto that `main`
      before the code gate, and after the rebase `CHANGELOG.md` is checked for a duplicated section (E2's bullets under
      `[Unreleased]` AND `[1.15.0]`).
- [ ] PR opened; CodeRabbit answered; Sonar (quality gate) and CodeQL green; merged on green checks only.
- [ ] Release through release-please: dispatch → the changelog PR (`[Unreleased]` → `## [1.16.0]`) → merge the release
      PR → dispatch again for `extension-v1.16.0`; the Marketplace shows 1.16.0 (verified, not assumed).
- [ ] **The promotion — its own docs PR, after the Marketplace shows 1.16.0.** `/promote-plan` for all four documents
      together (the parent and E1–E3): each status `IMPLEMENTED, <date>` with its deviations; edits first, `git mv`
      LAST; the inbound grep RE-RUN at that moment (`git grep -l PLAN_ssh_allow_longer_windows` — on 2026-10-21 it found
      `research/PLAN_agent_consent_policy.md`, `PLAN_ssh_agent.md`, `PLAN_ssh_sign_prompt_time.md`,
      `PLAN_ssh_sign_prompt_timeout.md`, `module_extension.md`, `module_tests.md`, `todo/README.md`), each losing
      `../todo/`; the four move together, so their links to each other stay siblings and every `../research/` prefix in
      them drops; the four rows leave `todo/README.md`'s open table and join its *Promoted* table; `research/README.md`
      mentions all four; the open tail — **certificate logins** (`…-cert-v01`, unrecognised since E1.1) — goes to a
      fresh `todo/` plan AND a GitHub issue that links it; `plan-lifecycle.mjs` clean.

## 9. Decided by the owner, and the follow-ups

**Owner decisions, 2026-10-21** (asked by the coordinator; each made a small, isolated change here):

| # | Question | Decision | Where in E3 |
|---|---|---|---|
| Q1 | Where does the CLI sentence ship? | A separate `fix(cli)` PR with a version-independent sentence (*"a signature asks there, unless a window you opened in that prompt covers it"*), released as `cli-v0.4.4` (approved); out of E3 entirely | §1, beside the epic |
| Q2 | Does a 10-minute window still cover SHA-1 RSA? | Yes — SHA-1 is not removed; E3 only keeps it out of every long window (recorded in the parent, Epics → E3) | §2; L10's last leg |
| Q-B | A lock in one VS Code window and the other windows' agents | The texts say *"in this VS Code window"*; a cross-window broadcast is a follow-up issue | §2; L18, E3.4 texts |
| Q-C | A forwarded agent (`session-bind` `is_forwarding`) | E3 does nothing; a follow-up issue next to #259 | §2 |
| Q-D | Should a repository be able to raise `autoLockMinutes`? | No: the setting becomes `"scope": "application"` | §2; E3.3 (h), W6, CHANGELOG *Changed* |

No owner question is open.

**Follow-ups, recorded here and filed as issues** (the coordinator files Q-B's and Q-C's): a cross-window lock
broadcast (Q-B); a long window never covering a forwarded request (Q-C, next to #259); **a closable turn** — an
`end()` that does not orphan the slot while a dialog that CAN be closed (the list) is up, so waiters are not refused for
a dialog that is about to close itself (review H1; `consentTurns.ts:229-236`); certificate logins (at promotion).

## 10. Review record

**coai plan gate on `de704d4c`** (this document's first version, `epic: 3/3`): verdict **`proceed`**, **2 of 2
reviewers answered**, 4 findings. Accepted: **3** — the E3.4 words tests read USER-FACING strings only (help fields,
README/markdown paragraphs, `package.json` fields, exported constants), never code comments; the three in-code
sentences became constants (§7). Rejected: **0** — Escape, the bound and a gone client are already told apart:
`turn.aborted` separates the last two from an answer, and *"no answer in … — refused"* is a log line, not a message to
the person; **1** — an *Allow* given across a lock allows that one signature and opens nothing: O3 and I3 on purpose
(E2's decision, the per-use prompt works while locked); **2** — a lock already ends the `login` scope: `endAllWindows`
clears every scope (`allowWindows.ts:225-227`, verified), and W4 pins it through the real seam.

**Risk consultation** (gpt-6-astra, each point verified by the coordinator), all folded in: **C-a** the post-list order
— an Escape after ineligibility fell into "allowed once"; now stale → `undefined` → re-check → settle (§2, L4b); **C-b**
a login's algorithm must fit the signing key (§2, E3.2's two REDs); **C-c** the manager's forwarding lambda
`sshAgentManager.ts:448` passes the flags, and L10 runs through the real server (§2, E3.3 (b)); **C-d** L14's
immediate-arrival leg; **C-e** the pick races, the token cancelled only by its turn, an already-aborted turn, disposal
(L20); **C-f** M2 gains the bound-while-highlighted check, on VS Code 1.93 and current.

**Own review (Opus)**, all accepted: **H1** (option b) — the bound on an open list orphans the slot like a modal's
(`consentTurns.ts:229-236`); the false *"no orphaned list, no orphan notice"* is replaced by the true behaviour, L5
pins it with a waiter, and a closable turn is a follow-up — `consentTurns.ts` unchanged; **M1** — the gate honours
`login` only while not locked and not overdue for auto-lock (`autoLockOverdue`, fail-closed; L21); **M2** — real sizes:
E3.1 measures and records, more moves to `sshSignPrompt.ts` / `sshAgentTexts.ts`, `SigningWindows` built in the
constructor body, the manager ≤ 760 after E3.3; **M3** — the middle check allows once, a recorded deviation from O1, in
the answer table, with its notice, presence and log line (L8b); **M4** — the words tests per field/paragraph, rule
`ALLOW_WINDOW` ⇒ `ALLOW_LONGER` over three articles in five languages, the two checks that could never fail fixed, the
three-dots guard; **M5** — *"in this VS Code window"* (became the owner's Q-B); **M6** — a list closed by VS Code is
Escape, a rejected list is a dismissal, the title through `displayText`, M2 covers a second list and Ctrl+P. Lows: W1/W2
observed on the head without the wiring; L16's RED corrected (no crossing line at all on the interface step); L14's gate
break-it; `signsWithSha1` compared with the blob `signForAgent` really writes; the changing E1/E2 assertions named;
`answerFromModal` / `decideSigning` as a `Map`; the `why`s aligned with parent §7 (*"is off"* the one listed
difference); `autoLockSetting.ts` with W7; section 7's RSA leg, its locked login 3, and its CI cost; M3's pass/fail;
the CHANGELOG duplicate check; promotion as its own PR with a re-run grep and an issue for certificate logins; Q2
closed. Wrong anchors corrected: `package.json:178`, `research/PLAN_wsl_agent_relay.md:90-93`,
`sshAgentManagerTurns.test.ts:409-438`; test paths written as `src_vs_code/src/test/…`.

**Owner answers, 2026-10-21** (§9): Q1, Q-B, Q-C, Q-D folded in — the CLI out of E3, *"in this VS Code window"*, two
follow-up issues, `autoLockMinutes` application-scoped in E3.3 with W6.
