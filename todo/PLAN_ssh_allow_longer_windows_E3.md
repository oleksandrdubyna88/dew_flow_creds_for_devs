# PLAN — E3 of #197: the longer windows for SSH logins (feature release)

> Status: **plan only, nothing implemented yet, 2026-10-21.** Scope: `src_vs_code` — a pure extraction out of
> `sshAgentManager.ts` into a new `sshAgentWindows.ts` (the window holder, `vscode`-free) and a new `sshSignPrompt.ts`
> (the prompt, both steps); `agentConsent.ts` (`ALLOW_LONGER`, the answers, `longWindowClaim`, `longerOffer`),
> `allowWindows.ts` (`coveringWindow`), `sshAgentSign.ts` (`signsWithSha1`), `sshAgentTexts.ts` (hours, the list, the
> notices), `sshAgentServer.ts` (the request's flags reach the gate), `sshAgentWiring.ts` (the lock state, the auto-lock
> setting and its listener), one reader of `autoLockMinutes` for `extension.ts` and `commands/keyCommands.ts`, the five
> `help*.ts`, `package.json`, `agentDoors.ts`, `commands/agentCommands.ts` (one sentence, line-neutral), `README.md`,
> the walkthrough, `CHANGELOG.md`, `scripts/ssh-agent-itest.cjs`; tests and test helpers; research docs. **One separate,
> droppable commit** in `src_cli` (`CommandLine.cs:208`, `src_cli/README.md:143-145`) — owner question Q1. Release:
> `extension-v1.16.0` (`feat:` → minor; the owner approved E1–E3 on 2026-10-20).
>
> Parent: [PLAN_ssh_allow_longer_windows.md](PLAN_ssh_allow_longer_windows.md) § Epics → E3 — the authority on the
> design (§6), the texts (§7) and the invariants (§5); this is E3's build order, deciding only §2 and the deviations
> of §3. Before it: [PLAN_ssh_allow_longer_windows_E1.md](PLAN_ssh_allow_longer_windows_E1.md) (shipped in 1.14.2) and
> [PLAN_ssh_allow_longer_windows_E2.md](PLAN_ssh_allow_longer_windows_E2.md) (merged as #267, ships as 1.15.0).

## 1. The four stories, in order

One branch, `feat/197-e3-longer-windows`, from `origin/main` 2997a558. Each story is one commit with its own RED tests
and its own docs (E3.4 is two commits: the words, then the CLI sentence on its own so it can be dropped). Per story:
this brief (Opus) → Sonnet codes → Opus reviews → Sonnet fixes.

| # | Story — the guarantee | Model | Parent stories / invariants | RED tests |
|---|---|---|---|---|
| E3.1 | Room to work: the window holder and the prompt leave the manager, and nothing a person sees changes | `model: sonnet` | — (readiness finding 1: `sshAgentManager.ts` is at 770 of 800) | 0 — a pure move; 2 break-its prove the suites still reach the moved code |
| E3.2 | What an answer means, what may be offered, and what SHA-1 RSA is never given — decided in pure code | `model: sonnet` | S7 (the pure half); I5, I6 (the offer), I8 (the table); O1, O9, O10, O12; the owner's SHA-1 decision | 1 (+14 new-function tests, each with its break-it) |
| E3.3 | *Allow longer…* lets SSH logins through for 1, 4, 8 or 12 hours — never a Git signature, never SHA-1 RSA, never while locked or with auto-lock off | `model: sonnet`; Fable security judgement at review (outside the quota) | S7 (the manager), S6's moved test, S9 (the `ssh-agent` article); I3, I5, I6, I8, I9, I10; D3 (two lengths); O1, O2, O5, O6, O9–O12 | 21 (+5 guards with break-its) |
| E3.4 | Every text of 1.16.0 says what the prompt really offers, a live OpenSSH login proves the window, and the release ships | `model: sonnet` | S9 (the rest of D5, the CLI sentence), S10; D5 (final wording) | 2 (1 unit + 1 live scenario) |

**No cornerstone in E3.** The quota is ⌈2·3/5⌉ = 2 and both are spent (E1.3 the window book, E2.3 the asynchronous
side of the material boundary). E3 would need a third only if it opened a new area where a mistake is silent, and it
does not: the book gains one additive read (`coveringWindow`, §3) and loses no rule; the turn gains one more `await`
inside the SAME turn, under the SAME slot, bound and fences, and the R4 rule that guards it is E2.3's, repeated on the
new path with its own macrotask break-it (E3.3, L17). The new authorisation decisions — `longWindowClaim` (SHA-1 RSA)
and `longerOffer` (login, unlocked, auto-lock on) — are pure functions whose every branch is a test, and E3.3 gets
Fable's security judgement at review, which the role table puts outside the quota. The ledger line in the parent stays
`Cornerstones: 2 of 2`.

## 2. What this document decides (the parent left it to E3)

- **E3.1 moves two things, both behaviour-free.** (a) The window holder — `setWindows`, `arm`, `timerFor`, `expired`,
  `moment`, the book itself, `liveWindows`, the expiry timer, `EXPIRY_LOOK_MS`, `Moment` (`sshAgentManager.ts:53`,
  `:69-72`, `:144-146`, `:347-400`) — into a class `SigningWindows` in a new `sshAgentWindows.ts`, **`vscode`-free**
  (it needs only the book, the two clocks, `unrefTimer` and a change callback), so the manager keeps its public methods
  (`endAllWindows`, `endWindows`, `windowsFor`) as thin delegations and every existing test stays untouched. (b) The
  modal — `askToSign`, `modalFailed`, `serverParagraph` (`:683-702`, `:767-770`) — into a new `sshSignPrompt.ts`
  (`vscode`), the parent's §6.5 module, arriving empty-handed so E3.3's diff there is the second step only. Plus
  `CROSSED_LINE` (`:62-66`) into `sshAgentTexts.ts`, and one `Arrival` record (`key`, `purpose`, `asked`, `arrived`)
  that `turnStarted` / `beforePrompt` take instead of four parameters, so E3.3 can add the request's `claim` without a
  seventh. Expected: the manager 770 → about 630 lines.
- **SHA-1 RSA — the owner's decision of 2026-10-21, as this plan reads it.** SHA-1 signing stays (`rsaVariant`,
  `sshAgentSign.ts:36-46`, not touched). A request a key would sign with SHA-1 — an `ssh-rsa` key and no
  `SSH_AGENT_RSA_SHA2_*` flag — is never covered by a 1/4/8/12-hour window and is never offered one: the prompt has no
  *Allow longer…* and says why. **A 10-minute window still covers it, as today** — "stays as it is"; the plan reads
  "always asks" as "a long window never covers it" (Q2, not blocking: one guard test flips if the owner meant more).
  One road in: `signsWithSha1(keyType, flags)` in `sshAgentSign.ts` is the signer's own rule (`rsaVariant(flags).digest
  === 'sha1'` for an `ssh-rsa` key), so the exclusion cannot drift from what is actually signed; `longWindowClaim(purpose,
  sha1)` in `agentConsent.ts` turns it and the purpose into `'login' | 'sha1-login' | 'not-login'`; the gate and the
  offer both read that one claim.
- **The flags reach the gate as a fifth `confirm` argument.** `SshAgentServerOptions.confirm(key, purpose, data, signal,
  flags)` (`sshAgentServer.ts:61`), the server passing `request.flags` (`:230`). The classifier stays blind to flags,
  as its own doc says (`sshAgentProtocol.ts`, the paragraph *"What it does NOT see: the request's flags"* above `:385`),
  and that paragraph is rewritten to name `signsWithSha1`. **The key type is read from the manager's own loaded key at
  arrival** (`keyTypeOf(this.keys.get(id).identity.publicBlob)`), never from the `AgentKey` argument — the manager
  tests pass plain `{ entityId, name, fingerprint }` objects (C10), the same trap E1.3 named for the generation.
- **Which windows count — the gate and the row, through one `scopesFor`.** The gate (`confirm` `:508`,
  `coveredAfterWaiting` `:573`) asks `scopesFor(claim === 'login', this.autoLockMinutes())`, reading the setting at
  EVERY check (arrival and after a wait — I6's backstop). The row and `endWindows`' `had` (`liveWindows` `:349`) ask
  `scopesFor(true, this.autoLockMinutes())`: the widest set the gate would honour for any request now. **Never
  `scopesFor(false, …)` and never `ALL_ONLY` there** — both are `['all']`, and the row would never show a login window
  (readiness finding 2). With auto-lock on this is `['all', 'login']`, every scope; with auto-lock off it is `['all']`,
  so the row cannot show a login window the gate would refuse even if the listener below were ever skipped. `ALL_ONLY`
  keeps its export (the book's tests use it) and loses its last production caller; its comment is reworded.
- **The hooks fail closed.** `lockedNow: () => boolean = () => true` and `autoLockMinutes: () => number = () => 0` —
  fields with defaults, the `onWindowsChanged` shape (`:161`), not constructor parameters (the constructor is at
  complexity 4). A manager nobody wired offers no longer window; every E1/E2 suite that builds a manager directly keeps
  its three buttons and passes unchanged, and the scenario script sets both hooks explicitly. The parent said "no-op
  defaults"; for an authorisation input the safe default is the refusing one. Deviation.
- **The wiring.** `sshAgentWiring.ts` gains `connectAgentToSettings(vaultKeys, sshAgent): vscode.Disposable` — sets
  `lockedNow = () => vaultKeys.isLocked()` (`vaultKeys.ts:206-208`) and `autoLockMinutes = autoLockMinutesSetting`,
  and returns the `workspace.onDidChangeConfiguration` subscription (the precedent listener is `extension.ts:134-140`)
  that calls `sshAgent.endLoginWindows('idle auto-lock was turned off')` when `credSshManager.autoLockMinutes` changes
  to `<= 0` (a negative value reads as off, as `scopesFor` does). `wireSshAgent` pushes it into
  `context.subscriptions` beside the lock link. **One reader of the setting**: `autoLockMinutesSetting()` (default 60)
  is extracted and used by `extension.ts:379-381` and `commands/keyCommands.ts:376` as well — three sites, one
  default (reuse move 2); `extension.ts` shrinks and its `.size-baseline.json` entry is lowered.
- **Auto-lock set to 0 while login windows are open.** `endLoginWindows(reason): number` ends every `login` window (the
  10-minute ones and every fence stay — `endLoginWindows` in the book, `allowWindows.ts:247-249`), writes one log line
  when a key is loaded, and — when it ended at least one live login window — tells the person once: *"Idle auto-lock is
  off, so the login windows of {n} key(s) were ended — a long window needs a lock to end it."* Silent when there were
  none. It never revokes and never unloads (E1.2's judgement: one method per meaning).
- **The two steps, inside ONE turn** (O1; readiness finding 4). The modal (`showWarningMessage`, as today) offers
  `SIGNING_BUTTONS` without `ALLOW_LONGER` when `longerOffer` says no. When it returns *Allow longer…*: `turn.aborted` →
  the stale message (E2's, unchanged), no list; else eligibility is asked AGAIN (the vault may have locked while the
  modal was up) — not eligible → this signature is allowed once, no window, told; else the list:
  `showQuickPick(items, { title, placeHolder, ignoreFocusOut: true }, token)` with a `CancellationTokenSource`
  cancelled by the turn's signal (the shape of `agentCreatePin.ts:50-67`, whose comment says VS Code closes a box whose
  token is cancelled). The turn's bound and the prompt slot cover both dialogs: the bound is the turn's one timer, and
  the slot is held until `work` settles, which now includes the list. **Unlike the modal, the list can be closed**:
  when the bound or the client ends the turn, the token closes it, `work` settles at once and the slot frees — no
  orphaned list, no orphan notice.
- **After the last `await` — the R4 rule on the new path.** After the list resolves, in the same synchronous
  continuation and with no `await` between: `turn.aborted` → stale (a label → the message; Escape or a cancelled list
  → silent); else `longerOffer` once more (the pick re-check, parent §6.2) → not eligible: allowed once, no window,
  *"{why} — this signature was allowed once; no window was opened."*; else `settle` → `openWindow(scope 'login')`. The
  window starts at the pick (`settle` reads the clock there, once). One presence per turn.
- **Eligibility is therefore asked three times**, not twice: when the modal is built (is the button there?), when
  *Allow longer…* comes back (open the list?), and at the pick (grant?). The parent's §6.2 named the first and last;
  the middle one is what stops a list opening for a vault that locked while the modal was up. Deviation.
- **Escape on the list** refuses this signature and counts as presence (the parent's table: a person clicked *Allow
  longer…* and then refused — Deny). The bound running out on the list refuses and is not presence.
- **The list says the time left** — its placeholder ends *"Unanswered, it is refused after {left}."*, `{left}` =
  `timeLeftText` of the turn's deadline read on the monotonic clock when the list opens. I9 promises the prompt states
  the time a request really has left, and the list is part of the prompt; a list that closes itself with no warning
  would look like a fault. The parent's §7 list text has no such line. Deviation.
- **The texts** are the parent's §7, with the O6 paragraph in the modal, and these exact `why`s (no trailing period;
  the modal appends one, the pick notice appends the dash clause): *"Longer windows cover SSH logins only"* · *"Longer
  windows need a SHA-2 signature, and this RSA login asked for SHA-1"* · *"Longer windows need the vault unlocked,
  because a lock is what ends them"* · *"Longer windows need idle auto-lock, and credSshManager.autoLockMinutes is 0"* —
  checked in that order. The I10 line names the scope: *"allowed without asking: login window of "prod" until 18:40
  (granted 10:40) for …"* (`logCovered`, `:617-622`, says "10-minute window" for every window today — readiness finding
  3). The crossing log line names the answer actually given: `answered "Allow longer…" (4 hours) after the vaults were
  locked — allowed once, no window was opened` (`CROSSED_LINE` quotes `ALLOW_WINDOW` for every crossing today,
  `:64-65`).
- **D3 with two lengths at the manager is unreachable — what was checked, and the test that replaces it.** For a
  second `login` grant to meet a live first one, a login request for that key must be NOT covered while the first
  window is live. Checked, each on the code: (1) one prompt per key — the slot is held until `work` settles
  (`consentTurns.ts`, E2.3); (2) a covered request never prompts — the arrival check (`:508`) and `beforePrompt` after
  a wait (`:553-564`); (3) every login request of that generation with a SHA-2 (or non-RSA) signature is covered while
  auto-lock is on (`scopesFor`); (4) the requests a login window does not cover — a Git signature, an unrecognised
  one, SHA-1 RSA, anything with auto-lock off — are never offered *Allow longer…* (`longerOffer`); (5) every road that
  ends the window (lock, button, unload, re-load, auto-lock 0, expiry) removes it before the next grant. So *"1 hour
  answered after 12 hours"* cannot be produced through the prompt. The rule stays proven where it lives, in the book
  (`allowWindows.test.ts`, E1.3 test 7, *a shorter grant never shortens a longer one of the same scope*); the manager
  test is the reachable form of the same promise: **a 10-minute answer for a Git signature, given while a 12-hour
  login window is open, never shortens the login window** — both scopes on the row afterwards, the login one still
  ending at +12 h (L12). Deviation from the parent's S7 wording.
- **S6's moved test** (E2 §3 deviation): *a request a login window covers never waits behind an open Git prompt* — a
  12-hour login window; a Git signature prompts and is held; a login for the same key arrives and answers at once
  (`atOnce`, the E2.3 helper), with one dialog on screen (L11).
- **`durationText` learns whole hours** where it lives since E2.3, `sshAgentTexts.ts:66-69` — not a new
  `durationText.ts` (parent §6.6). A whole number of hours ≥ 1 reads *"1 hour"*, *"12 hours"*; everything else as
  today, so every existing bound sentence is unchanged.
- **The help's `ssh-agent` article gets its final wording in E3.3**, with the button: inserting `ALLOW_LONGER` into
  `SIGNING_BUTTONS` turns *the help names every answer* red by itself (`sshAgentHelp.test.ts:43`), and a story ends
  green. Everything else of D5 is E3.4's.

## 3. Verified on `main` 2997a558 — and where the parent differs

Every anchor below was re-read on 2997a558 (the branch adds only this document). E2 moved most of the parent's.

- **The manager** (770 lines): imports `:23` (`agentConsent`), `:24-43` (`allowWindows`); `EXPIRY_LOOK_MS` `:53`;
  `CROSSED_LINE` `:62-66`; `Moment` `:69-72`; `windows` `:144`, `expiry` `:146`, `onWindowsChanged` `:161`; constructor
  `:163-191` (complexity 4, five parameters after the hooks); `serve` `:241-256`; `unload` `:287-300`; `endAllWindows`
  `:307-314`; `endWindows` `:322-327`; `windowsFor` `:338-344`; `liveWindows` `:347-350` (`ALL_ONLY` `:349`);
  `setWindows` `:360-367`; `arm`/`timerFor`/`expired` `:379-400`; `confirm` `:494-521` (`ALL_ONLY` `:508`, `take`
  `:513-519`); `turnStarted` `:533-544` (R4: `turn.aborted ? this.stale(choice) : this.settle(…)` `:543`);
  `beforePrompt` `:553-564`; `coveredAfterWaiting` `:572-574` (`ALL_ONLY` `:573`); `stale` `:599-607`; `tell`
  `:610-614`; `logCovered` `:617-622` (*"10-minute window"* `:619`); `settle` `:628-639` (`consentFromChoice` `:631`);
  `openWindow` `:653-665` (scope `'all'` hardcoded `:654`); `askToSign` `:683-697` (*"ten minutes"* `:689`, buttons
  `:693`); `modalFailed` `:699-702`; `dispose` `:742-753`; `serverParagraph` `:767-770`.
- **`agentConsent.ts`** (94): labels `:38-40`; `SIGNING_BUTTONS` `:47` (its comment `:42-46` says E3 inserts
  `ALLOW_LONGER`); `ALLOW_WINDOW_MS` `:50`; `ConsentDecision` `:60-73`; `consentFromChoice` `:76-89` (one caller,
  `sshAgentManager.ts:631`); the header `:9-20` says *"Allow for 10 minutes is the only answer that remembers
  anything"* — reworded in E3.2.
- **`allowWindows.ts`** (275): `MAX_WINDOW_MS` `:77-80`; `ALL_ONLY` `:83`; `scopesFor` `:161-163`; `windowsFor`
  `:187-190`; `windowCovers` `:193-196` (returns the window, not its scope — hence `coveringWindow`); `endLoginWindows`
  `:247-249`. **Hooks** (readiness finding 5): `scopesFor` and `endLoginWindows` exist, tested
  (`allowWindows.test.ts:185-198`, test 19) and unwired; `lockedNow`, `autoLockMinutes`, the manager's
  `endLoginWindows` and the config listener do not exist (E2 §3 *Hooks*).
- **`sshAgentServer.ts`** (278): `confirm` option `:61`; `confirmAndSign` `:229-241` — `describeSignRequest(request.data,
  request.publicBlob)` `:230`, `request.flags` reaches only `signed` `:240`. **`sshAgentSign.ts`**: `rsaVariant`
  `:36-46`, the SHA-1 comment `:43-44`. **`sshAgentProtocol.ts`**: `SSH_AGENT_RSA_SHA2_256/512` `:33-34`; `keyTypeOf`
  `:188-190`; `SignPurpose` `:211-214`; `describeSignRequest` `:385`.
- **`sshAgentTexts.ts`** (80): `CROSSING_NOTICE` `:18-27`; `durationText` `:66-69`; `timeLeftText` `:75-80`.
  **`requestTime.ts`**: `clockUntil` `:64` (E2.2) — the list reuses it. **`treeRowText.ts`**: `WINDOW_PHRASE`
  `:59-62` already holds *"logins without asking until"*; `signWindowLabel` `:72-80` already joins both scopes — the
  row label needs no change, only the scopes the manager answers with.
- **`sshAgentWiring.ts`** (86): `deps.vaultKeys` is `Pick<VaultKeys, 'noteUserActivity' | 'onDidLock'>` `:24` (gains
  `isLocked`); `connectAgentToLock` `:44-49`; `wireSshAgent` `:70-77`; the startup notice `:83` (D5). **`vaultKeys.ts`**:
  `onDidLock` `:112`, `lock` `:188`, `isLocked` `:206-208`, `noteUserActivity` `:352-354`. **`lockState.ts`**:
  `dueForAutoLock` `:101` is false while `lastActivity` is undefined — so a vault never unlocked would never auto-lock,
  **except** that the click on the prompt is activity (`wireSshAgent` passes `() => vaultKeys.noteUserActivity()` as
  `onUserPresent`, `:72`). A long window granted before any unlock therefore still has an auto-lock to end it; E3.3
  pins that with a guard (W3).
- **The auto-lock setting is read in two places today** — `extension.ts:379-381` (the idle timer) and
  `commands/keyCommands.ts:376` — each with its own default 60; E3.3 would be the third, so it extracts the reader.
- **D5's sites now** (readiness finding 8; `extension.ts:584` moved to the wiring in E2.1): `helpEn.ts:184` (title),
  `:185`, `:188`, `:189` (`ssh-agent`, `:183`), `:209`, `:212` (`wsl-relay`, `:207`) — the same lines in `helpDe/Es/Ru/
  Uk.ts`, whose articles start at the same lines; the `protection` article `:23-30` (auto-lock) gains one sentence;
  `package.json:110` (`wslAgentRelay`), `:177` (`autoLockMinutes`); `agentDoors.ts:103`; `sshAgentWiring.ts:83`;
  `commands/agentCommands.ts:688`; `src_vs_code/README.md:41`, `:73`, `:285-291`, `:905` (auto-lock), `:1114`;
  `media/walkthrough/use.md:4`; `src_cli/src/CommandLine.cs:208` and `src_cli/README.md:143-145` (the CLI commit);
  `research/architecture.md:460`; `research/PLAN_wsl_agent_relay.md:89-93`. The root `README.md:123` (*"serve from
  an agent that asks before it signs"*) stays true and is not touched. Code comments that say the same thing:
  `sshAgentServer.ts:20-21`, `sshAgentManager.ts:85-89`, `agentConsent.ts:9-20`.
- **Tests.** The world (`sshAgentWorld.ts`, 358): `FakeServer.confirm(key, purpose, data?, signal?)` `:33-38`;
  `showWarningMessage` `:147-151` returns `w.answers.shift()` whatever the buttons were, and records them (`w.buttons`);
  no `showQuickPick`, no `CancellationTokenSource`, no settings, `realPrivateKey()` is Ed25519 only (`:64-71`);
  `manager()` `:184-216`. `vscodeStub.ts:196` has a working `StubCancellationTokenSource`. The R4 macrotask test is
  `sshAgentManagerTurns.test.ts:408-437`. The buttons test is `sshAgentManager.test.ts:141-153`; the *what ends a
  window* assertion `:384`. The clock-read-count test `sshAgentManagerWindows.test.ts:170` passes a **login** purpose
  — it stays green only because the fail-closed hooks keep *Allow longer…* (and the list's clock read) off that path.
  The server harness `sshAgentServer.test.ts:64-79` drops everything after `signal`; `signRequestFor(blob, data,
  flags)` `:125` already takes flags. `sshKeySign.test.ts:18` builds RSA keys.
- **The scenario** (`scripts/ssh-agent-itest.cjs`, 677): `withVscodeStub` `:270-306` (no `showQuickPick`, no
  `CancellationTokenSource`, no `workspace`); section 6 `lockEndsTheWindow` `:364-424` (real `VaultKeys`,
  `connectAgentToLock`); the live sshd helpers `:426-550` (`launch`, `freePort`, `startSshd` `:479`, `endChild`);
  section 5 `liveHostBoundLogin` `:563-670`. `sshd -d` serves exactly ONE connection, so two logins need two sshd
  runs. CI installs sshd at `ci-extension.yml:144-147` and runs the script at `:150`.
- **Sizes** (C2, C13, C14): `sshAgentManager.ts` 770, `commands/agentCommands.ts` 798, `treeDataProvider.ts` 797 (no
  edit planned), `extension.ts` 1004 = its baseline, `sshAgentServer.test.ts` 750, `sshAgentManager.test.ts` 580,
  `sshAgentManagerTurns.test.ts` 441, `vaultKeysLock.test.ts` 335, `sshAgentHelp.test.ts` 256, the itest 677.
- **The release mechanics.** release-please opens one PR per component (`release-please-config.json`,
  `separate-pull-requests`), runs on dispatch only (`release-please.yml`, `workflow_dispatch`), and a squash commit
  that touches `src_cli/` gives the cli component a release with that commit's type — E1's squash touched
  `src_cli/README.md` and produced `cli-v0.4.3` (`git show --stat 77afb10`). `CHANGELOG.md` `[Unreleased]` holds E2's
  sections until 1.15.0's changelog PR moves them.

**Deviations from the parent** (each also in §2 where it is decided): four stories with a pure extraction first;
`sshSignPrompt.ts` arrives by a move in E3.1; the SHA-1 exclusion is `signsWithSha1` + `longWindowClaim`, the flags
reach the gate as a fifth `confirm` argument, and `scopesFor` keeps its signature (the parent allowed either);
`longerOffer` takes the claim, not `purposeIsLogin`, so it can say the SHA-1 reason; the row reads `scopesFor(true,
autoLock)`; the hooks fail closed; eligibility is asked three times; the list says the time left; D3-with-two-lengths
at the manager is replaced by its reachable cross-scope form; `durationText` stays in `sshAgentTexts.ts`;
`coveringWindow` is added to the book; `CROSSED_LINE` names the answer; `consentFromChoice` is deleted in E3.3 after
E3.2 adds its replacements beside it; the `protection` help article gains a sentence; M1 shipped with E1, so E3
measures M2 and M3; the certificate-login follow-up is extracted at promotion.

**The constraints that bite (C1–C17), in every brief below.** C1 `complexity ≤ 4` counts defaulted parameters, `?.`
and `??`. C2 `max-lines` 800 holds for tests — new suites, not longer old ones; `sshAgentServer.test.ts` (750) takes
ONE more test. C3 `extension.ts` frozen at 1004 (`.size-baseline.json`); lower it in the commit that shrinks the
file. C4 `treeDataProvider.ts` at 797 — not edited. C5 `noUnusedParameters`: an interim unused parameter is `_name`.
C6 never a literal bidi/format character; escapes (Sonar S6389). C7 a visible assertion in every test body (S2699).
C8 no dynamic call on a requester-keyed lookup (CodeQL): a closed `switch` or `Map.get`. C9 `node:` imports,
`String.raw`, `.includes`. C10 manager tests pass plain `{ entityId, name, fingerprint }`; identity, generation and
key type are read from the manager's own map. C11 `testsToDelete-…` temp names; a test monotonic clock never starts
at 0 (`M = 50_000`). C12 every new suite that loads a key ends with the key-material guard (`keyMaterialLogged()`).
**C13** `commands/agentCommands.ts` is at 798: its edit is line-neutral. **C14** `sshAgentManager.ts` ≤ 800 — about
630 after E3.1, a budget of +120 for E3.3. **C15** `ALLOW_LONGER` ends in U+2026 `…`, one character: every help
language, README and test must carry the same character, never three dots. **C16** the hooks fail closed (`() =>
true`, `() => 0`). **C17** R4: no `await` between the last `turn.aborted` check and the grant — after the modal AND
after the list.

## 4. E3.1 — room to work: the window holder and the prompt leave the manager

**Tests.** None new, and no assertion changes: a move is proven by the suite staying green with the same test count
(`npm test` before and after, both counts quoted). Two break-its, run once each and quoted, show the suites still
reach the moved code: delete `this.arm(at)` from the moved `set` → *the expiry timer re-arms* (`sshAgentManagerRow
.test.ts:257`) goes red; drop `...SIGNING_BUTTONS` from the moved modal → *the dialog offers exactly the signing
buttons* (`sshAgentManager.test.ts:141`) goes red. `sshAgentHelp.test.ts`'s `REPLACED_IN_CODE` gains an entry for
`sshSignPrompt.ts` (the old *"The dialog in front of every signature."*), so the scan follows the prompt to its new
file instead of passing on a file the prompt left.

**Brief.**

1. **`src/sshAgentWindows.ts`** (new, no `vscode`): `export class SigningWindows` holding `private book: AllowWindows =
   NO_WINDOWS` and the expiry timer; constructor `(clock: () => Date, monotonic: () => number, changed: () => void)`.
   Methods moved verbatim with their comments: `set(next, at?)` (was `setWindows`), `moment()`, `arm`, `timerFor`,
   `expired`, `live(key: KeyRef, scopes, at)` (was `liveWindows`, the scopes now an argument — the manager still passes
   `ALL_ONLY`), plus `get current(): AllowWindows` for the gate's reads and `dispose()` (clears the timer). `Moment` and
   `EXPIRY_LOOK_MS` move with it. The `disposed` check stays in the manager's `changed` closure (`() => { if
   (!this.disposed) { this.onWindowsChanged(); } }`), so the field the wiring assigns is still the manager's.
2. **`src/sshSignPrompt.ts`** (new, `vscode`): `askSigning(key, purpose, asked, leftMs, log): Promise<string |
   undefined>` — `askToSign` and `modalFailed` verbatim, `serverParagraph` with them. The text does not change by one
   character.
3. **`sshAgentTexts.ts`** gains `CROSSED_LINE` (moved, still keyed by outcome, still quoting `ALLOW_WINDOW`).
4. **The manager.** Every `this.windows` read becomes `this.windows.current`, every write `this.windows.set(…)`;
   `endAllWindows`, `endWindows`, `windowsFor`, `nameOf` stay (public surface unchanged); `dispose` calls
   `this.windows.set(NO_WINDOWS)` then `this.windows.dispose()`. An `interface Arrival { key; purpose; asked; arrived }`
   built once in `confirm` and handed to `turnStarted(arrival, turn, leftMs)` and `beforePrompt(arrival, waited)`.
   `wc -l` ≈ 630.

**Docs.** `research/module_extension.md`: the two new modules in the `SshAgent` subgraph (`:42-52`), the row
*"A window belongs to one generation of one key"* (`:4856`) names `SigningWindows` as the holder, and the sentence
under the section title (`:4845-4847`) names `sshSignPrompt.ts` as the modal's home. `research/module_tests.md`: one
line — no suite changed; the two break-its.

**Done when.** Suite green with the same count, typecheck, lint, ratchet green; the manager ≤ 640 lines; both
break-its quoted; no test file edited except the `REPLACED_IN_CODE` entry.

## 5. E3.2 — what an answer means, what may be offered, and what SHA-1 RSA is never given (pure)

**RED tests:**

| Test (the guarantee) | File | RED on `main` says |
|---|---|---|
| a whole number of hours reads in hours: *1 hour*, *4 hours*, *12 hours* | `test/sshAgentTexts.test.ts` | `'60 minutes' !== '1 hour'` |

Guard, green before and after: *a bound under an hour still reads in minutes or seconds* (5 min, 1 s, 90 min — the
last is not a whole hour and stays *90 minutes*).

**New functions — cannot be red; each with its break-it** (run once, quoted):

- `agentConsent.test.ts`: *Allow longer… authorises nothing by itself* — `answerFromModal(ALLOW_LONGER) === 'pick-longer'`,
  never a `SigningAnswer` (break-it: map it to a 1-hour window); *each label means what the table says* — once, deny,
  the 10-minute `all` window, `undefined` → unanswered (break-it: `ALLOW_WINDOW` → `login`); *an unrecognised label
  allows once and arms nothing* (the guarantee of the old `consentFromChoice` test, carried over; break-it: → window);
  *each offered length arms exactly its duration, from the pick* — `answerFromPick(4 h)` then `decideSigning(…, now)` →
  `login`, `until === now + 4 h` (break-it: `+ 1 h`); *Escape on the list refuses and counts as presence; the bound
  running out does not* — `declined-longer` → `{ allow: false, present: true }`, `unanswered` → `present: false`
  (break-it: declined not present); *a length the list never offered allows once and arms nothing* — `answerFromPick(2
  h)` (break-it: accept any number); *the lengths are 1, 4, 8 and 12 hours, shortest first, and none passes the login
  ceiling* — `LONGER_WINDOWS_MS`, against `MAX_WINDOW_MS.login` imported, never retyped (break-it: 13 h);
  `longWindowClaim`: *a login with a SHA-2 or non-RSA signature may have a long window, SHA-1 RSA and every other
  purpose may not* — `'login'`, `'sha1-login'`, `'not-login'` for a login, an SSHSIG, an unknown (break-it: ignore
  `sha1`); `longerOffer`: *a long window is offered only for a login, never for SHA-1, never while locked, never with
  auto-lock 0 or negative — and says which, in that order* (break-its: `!== 0` for the auto-lock test; locked checked
  first, which makes the SHA-1 case read the lock reason).
- `sshKeySign.test.ts`: *SHA-1 is decided by the signer's own rule* — for every `flags` 0–7 and an `ssh-rsa` key,
  `signsWithSha1('ssh-rsa', f) === (rsaVariant(f).digest === 'sha1')`; `false` for `ssh-ed25519` and ECDSA at flags 0
  (derived from `rsaVariant`, never a typed list — testing.md; break-it: `flags === 0` alone, which is wrong for flags
  `1`).
- `allowWindows.test.ts` (+1): *`coveringWindow` names the scope that covers, first in the order asked, and
  `windowCovers` is its window* — a `login` and an `all` window; `['all', 'login']` → `all`, `['login', 'all']` →
  `login`, `['all']` after the `all` one ends → `undefined` (break-it: the last scope).
- `sshAgentTexts.test.ts`: *the list offers four items with their end times and the auto-lock sentence* —
  `longerItems(now, offset, 60)`: labels *1 hour* … *12 hours*, descriptions *until 12:55, or until the vault locks (idle
  auto-lock: 60 min)*, and *00:55 tomorrow* across midnight (local-noon fixtures, an offset number, `clockUntil`
  reused; break-it: drop the day); *the crossing line names the answer that was given* — `crossedLine('fenced-lock',
  'Allow longer…', 4 h)` → *answered "Allow longer…" (4 hours) after the vaults were locked — allowed once, no window
  was opened*, and for `ALLOW_WINDOW` today's line exactly (break-it: always `ALLOW_WINDOW`); *the notices read as the
  plan says* — `pickRefusedNotice(why)`, `loginWindowsEndedNotice(1)` and `(2)` (break-it: drop `{n}`).

**Brief.**

1. `sshAgentTexts.ts`: `durationText` gains one branch — `ms >= 3_600_000 && ms % 3_600_000 === 0` →
   `plural(ms / 3_600_000, 'hour')` (C1: a helper if the function would pass 4). Then `longerItems(now, offsetMinutes,
   autoLockMinutes): Array<{ label: string; description: string; ms: number }>` over `LONGER_WINDOWS_MS`;
   `crossedLine(outcome, answer: string, ms?: number)` replacing the `CROSSED_LINE` table (one call site, the manager,
   passes `ALLOW_WINDOW` until E3.3 — no behaviour change); `pickRefusedNotice(why)`; `loginWindowsEndedNotice(n)`.
2. `sshAgentSign.ts`: `export function signsWithSha1(keyType: string | undefined, flags: number): boolean`.
3. `agentConsent.ts` (widened, reuse move 1): `ALLOW_LONGER = 'Allow longer…'` (NOT yet in `SIGNING_BUTTONS` — the
   help test would go red with nothing to fix it in this story); `LONGER_WINDOWS_MS`; `SigningAnswer` (parent §6.2);
   `answerFromModal`, `answerFromPick`, `decideSigning(answer, now): { allow; present; window?: { scope: WindowScope;
   until: number } }` (one `switch`, C1 — a lookup table of small functions if it would pass 4);
   `LongWindowClaim`, `longWindowClaim(purpose, sha1)` (`import type { SignPurpose }` — no runtime import of the
   protocol); `LongerOffer`, `longerOffer(claim, locked, autoLockMinutes)` — the four `why`s of §2 as a module-level
   ordered list, the first that applies wins. `import type { WindowScope } from './allowWindows'` — a type-only import,
   so no runtime cycle (`allowWindows.ts:1` imports this module). The header `:9-20` is rewritten for four answers.
   `consentFromChoice` stays until E3.3.
4. `allowWindows.ts`: `coveringWindow(book, key, scopes, now, nowMono): { scope: WindowScope; window: OpenWindow } |
   undefined`, and `windowCovers` becomes `coveringWindow(…)?.window` — behaviour identical, its tests untouched.

**Docs.** `research/module_extension.md`: the row *"Allow once / Allow for 10 minutes / Deny"* (`:4854`) gains the
answer table and the SHA-1 rule (named as the owner's decision of 2026-10-21); the book row (`:4856`) names
`coveringWindow`. `research/module_tests.md`: the new cases and their break-its.

**Done when.** The RED quoted beside its GREEN; every break-it quoted once; no production caller changed except the
one `crossedLine` call; suite, typecheck, lint green.

## 6. E3.3 — *Allow longer…* lets SSH logins through for 1, 4, 8 or 12 hours, and nothing else

**On `main` none of the tests below compiles** (`ALLOW_LONGER`, the hooks, the world's list, `endLoginWindows` do not
exist) **except S1's harness change and H1**; the REDs are observed on the **interface step** (brief step 1) — the
E1/E2 rule. There, the prompt still offers three buttons and `settle` still reads `consentFromChoice`, so an answer of
*Allow longer…* (which the world's stub returns whatever the buttons were) is an unrecognised label → allowed once,
no window, no list.

| Test (the guarantee) | File | RED on the interface step says |
|---|---|---|
| S1 the server hands the request's flags to the gate | `test/sshAgentServer.test.ts` (+1; the harness passes `flags` through) | `0 !== 2` — the server passes a constant |
| H1 the help names every answer the signing prompt offers, in every language (existing, `:43`) | `test/sshAgentHelp.test.ts` | after `ALLOW_LONGER` joins `SIGNING_BUTTONS` (fix step 1): `ssh-agent (en) does not name "Allow longer…"`, and the four others |
| L1 a login prompt offers *Allow longer…* third, before *Deny*; a Git signature's prompt does not (replaces `sshAgentManager.test.ts:141-153`'s single list) | new `test/sshAgentManagerLonger.test.ts` | `buttons[0]` is `['Allow once', 'Allow for 10 minutes', 'Deny']` |
| L2 *Allow longer…* then 4 hours lets logins through for four hours from the PICK — the prompt sat 3 minutes first; at pick + 4 h − 1 min silent, at pick + 4 h prompts | same | `dialogs.length` 2, expected 1 (and `picks.length` 0) |
| L3 the list offers 1, 4, 8 and 12 hours, shortest first, each with its end time and *or until the vault locks (idle auto-lock: 60 min)*, under the title naming the key | same | `picks.length` 0, expected 1 |
| L4 Escape on the list refuses this signature and counts as presence | same | `true !== false` (allowed once) |
| L5 the bound covers both steps: a list still open at the bound is closed, the request refused (*no answer in … — refused*), and the next request prompts at once — no orphan notice | same | `picks.length` 0, expected 1 |
| L7 a pick that is no longer eligible allows once, opens no window and says why — the list opened with auto-lock 60, the hook set to 0, 12 hours picked; auto-lock back on, the next login prompts | same | `infos.length` 0, expected 1 |
| L8 the vault locked while the list was open: the pick allows once, opens no window and says the vault is locked | same | `infos.length` 0, expected 1 |
| L9 the list is not offered for a Git signature, while locked, with auto-lock 0, or for SHA-1 RSA — and the prompt says which | same | no dialog contains *"Longer windows"* |
| L10 an RSA login with a SHA-2 flag is covered by a login window; the same login with flags 0 prompts, its prompt offers no *Allow longer…* and says the SHA-1 reason; answered *Allow for 10 minutes*, the next flags-0 login is covered by that 10-minute window, as today (Q2) | same (an RSA key: `realPrivateKey('rsa')`) | the SHA-2 login prompts: `dialogs.length` 2, expected 1 |
| L11 a request a login window covers never waits behind an open Git prompt (parent S6, moved from E2) | same | `atOnce(r2)` is `'slow'` |
| L12 a 10-minute answer for a Git signature never shortens a 12-hour login window — the row shows both, the login one still ending at pick + 12 h (D3 with two lengths, reachable form, §2) | same | `windowsFor` has no `login` |
| L13 a login window opened by the first prompt covers the waiting login without a prompt (E2.3 T2 for `login`; `beforePrompt` reads the claim) | same | `dialogs.length` 2, expected 1 |
| L15 every silent login names its window: *allowed without asking: login window of "prod" until … (granted …)*, both stamps read through `localWallTime` | same | no line matches `/login window of/` |
| L16 an answer of *Allow longer…* given across a lock or *Ask for Every Use Again* names the answer it was in the log, and says so in the message | same | the line quotes *"Allow for 10 minutes"*; no list |
| L18 the prompt says any process running as you that reaches the agent signs without asking while a window is open, and that locking the vault ends every window (O6; rewrites the regex of `sshAgentManager.test.ts:384`) | `test/sshAgentManager.test.ts` | **RED on `main`**: no match for `/any process running as you that reaches this agent/` |
| L19 the list says the time the request has left (§2) — a request that waited 4 minutes reads *refused after 60 seconds* on the list too | `test/sshAgentManagerLonger.test.ts` | `picks.length` 0 |
| W1 setting idle auto-lock to 0 ends every login window, keeps the 10-minute ones, tells the person once and repaints the row — a real settings change through `wireSshAgent`'s listener | `test/vaultKeysLock.test.ts` | its first assertion: `windowsFor` has no `login` (no login window can open on the interface step); past it, on a head without the listener: `infos.length` 0, expected 1 |
| W2 `wireSshAgent` tells the manager whether the vault is locked and what auto-lock is set to — through the wiring, a login prompt offers *Allow longer…* | same | the buttons have no *Allow longer…* (the fail-closed defaults) |
| W4 a lock through the real seam ends a login window too, and the next login asks | same | `windowsFor` has no `login` before the lock |

**Guards — green before and after, each with a break-it** (run once, quoted): L6 *a late Allow longer… opens no list
and says the request had already been refused* (E2's stale message; break-it: open the list before checking
`turn.aborted`). L14 *the gate and the row answer "which windows count" through the same `scopesFor`: with auto-lock
set to 0 by the hook alone — no listener — a login window neither covers a login nor shows on the row* (break-it: the
row reads `['all', 'login']` as a constant). L17 **the R4 rule on the pick path** — the three macrotask timings of
`sshAgentManagerTurns.test.ts:408-437` (`setImmediate`, `setImmediate` twice, `setTimeout 0`), the client going away
right after the PICK: signed ⇔ a login window open, and a refusal tells exactly once (break-it: an `await new
Promise((r) => setImmediate(r))` between the check and the grant). W3 *a login window granted on a vault never
unlocked still has an auto-lock to end it* — a real `VaultKeys`, never unlocked; after the pick
`vaultKeys.dueForAutoLock(now + 60 min, 60) === true` (break-it: the wiring's `onUserPresent` not noting activity). W5
*a manager nobody wired offers no longer window* (break-it: default `autoLockMinutes = () => 60`). And the whole of
`sshAgentManagerWindows.test.ts`, `sshAgentManagerTurns.test.ts` and `sshAgentManagerRow.test.ts` unchanged.

**Brief.**

1. **Interface step, suite green.** The world: `showQuickPick(items, options, token)` recording `{ items, options }`
   in `w.picks` and answering from `w.pickAnswers` by LABEL against the real items (a label that is not among them
   throws — a test cannot pick what the list never offered; `undefined` = Escape), resolving `undefined` when the
   token is cancelled; `unansweredPick()` (the shape of `unanswered()`, `:288`); `CancellationTokenSource:
   StubCancellationTokenSource`; `workspace` with a settable `w.settings` map behind `getConfiguration` and an
   `onDidChangeConfiguration` emitter; `realPrivateKey(type: 'ed25519' | 'rsa' = 'ed25519')`; `manager()` options
   `autoLockMinutes?: number` and `locked?: () => boolean`, which set the hooks; `FakeServer.confirm(…, flags?: number)`
   defaulting to `0` (C1: the stub's lambda reaches 4). The server's option type gains `flags: number` and the server
   passes `0`; the manager's `confirm(key, purpose, data, signal, _flags)` (C5). The manager gains `lockedNow = () =>
   true`, `autoLockMinutes = () => 0`, `endLoginWindows(_reason: string): number { return 0; }`. Suite green.
2. **The tests, red** — every row of the table, quoted. S1 extends the harness's pass-through to `(key, purpose, _data,
   signal, flags) => confirm(key, purpose, signal, flags)`.
3. **The fix, in this order.** (a) `SIGNING_BUTTONS = [ALLOW_ONCE, ALLOW_WINDOW, ALLOW_LONGER, DENY]` — H1 goes red —
   and the help `ssh-agent` article in all five languages (§7 E3.4 gives the wording; the button names stay English,
   CLAUDE.md rule 7). (b) The server passes `request.flags` (`:230`). (c) `confirm` computes, at arrival and before
   any `await`, `claim = longWindowClaim(purpose, signsWithSha1(keyTypeOf(loaded.identity.publicBlob), flags))` from
   the manager's OWN loaded key (C10), into the `Arrival`; the gate (`:508`, `coveredAfterWaiting`) asks
   `scopesFor(arrival.claim === 'login', this.autoLockMinutes())` through `coveringWindow`, and `logCovered` names the
   scope. (d) `liveWindows` / `windowsFor` / `had` ask `scopesFor(true, this.autoLockMinutes())`. (e) `turnStarted`:
   the ticket now; `offer = longerOffer(claim, this.lockedNow(), this.autoLockMinutes())`; `askSigning({ …, offer })`
   in `sshSignPrompt.ts` returns the modal's label; on *Allow longer…* with the turn live and the offer asked again
   and still yes, `pickLength(…)` opens the list (token cancelled by `turn`, the time left from the turn's monotonic
   deadline); then, **with no `await`** (C17), `turn.aborted` → `stale`; the pick re-check → `pickRefused(why)`;
   `settle(arrival, ticket, answer)` → `decideSigning` → `openWindow(…, scope)` with `crossedLine(outcome, label,
   ms)`. `consentFromChoice` and its import are deleted. (f) `endLoginWindows(reason)`: count the keys with a live login
   window, `set(endLoginWindows(book))`, log when keys are loaded, `tell(loginWindowsEndedNotice(n))` when `n > 0`,
   return `n`. (g) The modal text of parent §7 with the O6 paragraph and `offer.why` when there is no button; the list
   texts of §2. (h) `sshAgentWiring.ts`: `connectAgentToSettings` (§2), `deps.vaultKeys` gains `isLocked`;
   `autoLockMinutesSetting()` extracted — `extension.ts:379-381` and `commands/keyCommands.ts:376` read it; the
   baseline lowered. (i) The `sshAgentProtocol.ts` flags paragraph names `signsWithSha1`.
4. **Sizes.** The manager ≈ 630 + 110 (≤ 750); `sshSignPrompt.ts` ≈ 140; the new suite ≈ 600 (split into two files
   before 800); `vaultKeysLock.test.ts` 335 + ~110; the world 358 + ~60.

**The traps, each with the test that pins it.** The key type read from the `AgentKey` argument (every manager test
passes a plain object: L10 then never sees RSA). The row or `had` through `scopesFor(false, …)` or `ALL_ONLY` (L12,
W1 — a login window that never shows). `autoLockMinutes()` read once at arrival only, so a waiter keeps a long window
after auto-lock went to 0 (L14). An `await` — a logged call, an awaited `tell` — between the last `turn.aborted` and
the grant (L17). The list opened without asking again, after a lock while the modal was up (L8's variant: lock before
the modal returns). The list's token never cancelled, so a list outlives its turn and the slot stays held (L5). A pick
answered by index instead of by label, so a reordered list grants the wrong length (L2 asserts the end time). The
stale message on Escape from the list (L4 counts `infos` exactly). The clock read twice at the pick (L2's stepped
clock; `sshAgentManagerWindows.test.ts:170` for the modal path). Presence counted twice for modal + list (L4, L2
count `presence`).

**Docs.** `CHANGELOG` `[Unreleased]` (on top of 1.15.0's section, which the 1.15.0 changelog PR will have moved):
`### Added — longer SSH windows for logins (#197)`: *a login prompt offers **Allow longer…**: 1, 4, 8 or 12 hours of
SSH logins with that key without asking — git push and fetch over SSH included, a Git signature or anything else
still asks; offered only while the vault is unlocked and idle auto-lock is on, and every lock ends it, so with the
default 60-minute auto-lock a long window usually ends after an hour unless you use the vault; the key's row says
*logins without asking until 18:40*; an RSA login that asks for the old SHA-1 signature is never covered by one;
setting idle auto-lock to 0 ends every login window*. `research/module_extension.md`: the `SshAgent` subgraph gains
the edge wiring → settings; the turn sequence diagram (`:4868-4913`) gains the list step, the second eligibility
question and the pick re-check; the rows `:4854`, `:4856`, `:4857` (a lock ends login windows too), `:4858` (the row
reads `scopesFor(true, …)`), `:4859` (the slot covers the list; the list closes, the modal cannot), `:4862` (four
answers). `research/module_tests.md`: the suites, the REDs, the break-its.

**Done when.** The 21 REDs quoted beside their GREENs and the 5 break-its run once; every function the story added or
changed ≤ 4 complexity and ≤ 50 lines; the manager ≤ 750 lines; Opus review and Fable's security judgement passed —
the judgement reads `longWindowClaim`, the three eligibility questions and the pick path's R4 by name.

## 7. E3.4 — every text of 1.16.0 says what the prompt offers, a live login proves the window, the release ships

**RED tests:**

| Test (the guarantee) | File | RED says |
|---|---|---|
| every shipped text that lists the prompt's answers lists the longer one too — a text naming the 10-minute answer (`/Allow for 10 minutes\|for 10 minutes/`) also names *Allow longer…* or *up to 12 hours*; over the English `ssh-agent` and `wsl-relay` articles, the `protection` article's auto-lock sentence, `package.json`, `src_vs_code/README.md`, the walkthrough, `agentDoors.ts`, `sshAgentWiring.ts`, `commands/agentCommands.ts` | `test/sshAgentHelp.test.ts` (+2; whitespace collapsed, as `:106` does) | **RED on `main`**: `src_vs_code/README.md names the 10-minute answer and not the longer one` (`:41`) |
| scenario, section 7 (POSIX): one *Allow longer…* → *1 hour* on a real `ssh` login to a user-mode `sshd -d`; a second real login signs with NO dialog; a real `ssh-keygen -Y sign` inside the login window still asks; after a real `VaultKeys.lock()` a third login asks | `scripts/ssh-agent-itest.cjs` | the fix has landed (E3.3), so the teeth are shown by revert (testing.md): with `scopesFor` at the gate reverted to `ALL_ONLY`, *the second login raised no dialog* fails — `2 dialogs` |

Companion (a scan that matches nothing proves nothing): *the scan finds the README sentence it was written for* — the
old `:41` sentence, quoted in the test, matches the 10-minute pattern and not the longer one. A text that names
neither (the root `README.md:123`) is out of scope by construction and said so in the test's doc comment.

**Brief.**

1. **The test, red.** Then the texts, true for 1.16.0, button and command names in English in every language (CLAUDE.md
   rule 7), the English the source:
   - help `ssh-agent` (E3.3 wrote it; read again here): title *"The SSH agent that asks: once, for 10 minutes, or
     longer for logins"*; the answers *Allow once*, *Allow for 10 minutes*, *Allow longer…* (SSH logins only, 1 to 12
     hours), *Deny*; the list, the row's *logins without asking until 18:40*, what ends it, why it usually ends after an
     hour, the SHA-1 sentence, auto-lock 0.
   - help `wsl-relay` `:209`, `:212`: the four answers; *while a window is open, any process in WSL signs with that key
     without asking — for a login window, any SSH login with it; locking the vault ends every window*.
   - help `protection` (`:23-30`): *a lock — by hand or idle auto-lock — also ends every SSH signing window; with
     auto-lock at 0 the agent offers no window longer than 10 minutes.*
   - `package.json:110` (`wslAgentRelay`): *while a window is open (10 minutes for any signature, up to 12 hours for
     SSH logins) …*; `:177` (`autoLockMinutes`): *locking also ends every SSH signing window; at `0` no window longer
     than 10 minutes is offered, and setting it to `0` ends every open login window.*
   - `agentDoors.ts:103`: *(once, for 10 minutes, or for SSH logins up to 12 hours)*. `sshAgentWiring.ts:83`: *the
     answer covers it once, every use for 10 minutes, or SSH logins for up to 12 hours*. `commands/agentCommands.ts:688`
     (line-neutral, C13): *a signature asks first — once, for 10 minutes, or logins for up to 12 hours.*
   - `src_vs_code/README.md:41`, `:73`, `:285-291` (*Four answers* — and the long window's paragraph), `:905`
     (auto-lock), `:1114`; `media/walkthrough/use.md:4`.
   - Code comments that say the same thing (line-neutral): `sshAgentServer.ts:20-21`, `sshAgentManager.ts:85-89`.
2. **The CLI sentence — its own commit, `docs(cli): the relay help says what the SSH prompt offers (#197 E3)`**, so it
   can be dropped (Q1): `CommandLine.cs:208` *"The key stays in the VS Code window on Windows and a signature asks there
   — once, for 10 minutes, or for SSH logins up to 12 hours."* and `src_cli/README.md:143-145` the same; the words test
   gains the two files in THIS commit, so dropping the commit drops their check with them. `dotnet build` 0 warnings.
   The CHANGELOG line *the `creds relay` help text ships with the next `cli-v` release* sits in this commit too.
3. **The scenario, section 7** — `liveLoginWindow(pem, publicPath, dir)`, POSIX only and skipped on Windows with
   *"skip  live login window — POSIX only; the Extension Development Host check covers Windows"*; with `CI=true` a
   missing sshd FAILS, as section 5 does. The stub (`withVscodeStub`) gains `showQuickPick` reading
   `global.__AGENT_PICK__` (an array of labels, matched against the real items), `CancellationTokenSource`, and a
   `workspace` stub. A real `VaultKeys` (a Map `SecretStorage`), `connectAgentToLock` AND `connectAgentToSettings`
   with auto-lock 60, a manager over `path.join(dir, 'w2')` (the socket stays under 104 bytes — reuse the assert).
   Answers `[ALLOW_LONGER, ALLOW_ONCE, ALLOW_ONCE]`, picks `['1 hour']`; three `sshd -d` runs (each serves one
   connection), reusing `startSshd`/`endChild`/the free-port retry: login 1 → one dialog with four buttons, one list;
   login 2 → no new dialog, the log has *login window of "itest key"*; `ssh-keygen -Y sign` → a dialog without *Allow
   longer…*; `vaultKeys.lock()` → login 3 → a dialog. `finally` in section 5's order (client, sshd by its pid, await
   exit, then the folder). If the script would pass 800 lines, the sshd helpers (`:426-550`) move to
   `scripts/itestSshd.cjs` first, a pure move.
4. **Measured by hand, once each, recorded in the PR:** **M2** — the list with `ignoreFocusOut: true` survives a second
   modal raised over it (a second key's prompt); **M3** — the four-button modal in `window.dialogStyle: custom` at a
   normal window width shows every button. **The Extension Development Host check on Windows**: load a key; `ssh` to a
   throwaway OpenSSH ≥ 8.9 container (as E1's M1) → four buttons → *Allow longer…* → the list's four items with end
   times and the auto-lock sentence → *1 hour* → the row says *logins without asking until …* → a second `ssh` logs in
   silently → `git commit -S` asks, without *Allow longer…* → *Lock Vaults* → the row clears → the next `ssh` asks;
   then auto-lock 0 → the prompt says why and offers no list, and with a login window open the information message
   appears. Screenshots in the PR.
5. **The Linux container run** (E2's recipe): `docker run --rm --name testsToDelete-ait-e3-<id>`, a non-root user,
   `openssh-server` + `openssh-client`, the worktree copied in; sections 5, 6 and 7 all RUN — output quoted.

**Docs.** `CHANGELOG` `[Unreleased]` `### Changed — the texts say what the prompt offers`: *the help (five
languages), the README, the walkthrough and the settings say the prompt offers once, 10 minutes, or 1–12 hours for SSH
logins*. `research/architecture.md:460` and `research/PLAN_wsl_agent_relay.md:89-93`: the login window, its scope and
what ends it, dated *(2026-…, #197 E3)*. `research/module_extension.md`: `:4862` four answers and the words test.
`research/module_tests.md`: the itest row (`:41`) and the live-section row (`:1257`) gain section 7 and what it does
not prove (a Windows login — the EDH check); the leftovers row (`:137`) the folder `w2`.

**Done when.** Both REDs quoted (the scenario's by revert, then restored and green); the four translations read
sentence by sentence against the English by the Opus review, its verdict quoted in the PR; M2, M3 and the EDH check
recorded; section 7 green locally (Linux container) and RUN in CI.

## 8. Epic Definition of Done

- [ ] Every story's RED was observed on the code before its fix (the interface step where §6 says so; the scenario by
      revert) and is quoted in the PR beside its GREEN — 24 REDs; every break-it quoted once.
- [ ] In `src_vs_code`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run ratchet` green; `.size-baseline.json`
      lowered for `extension.ts`; `sshAgentManager.ts` ≤ 750; `commands/agentCommands.ts` ≤ 800; `treeDataProvider.ts`
      untouched; `helpCoverage`, `manifest`, `readmeClaims` green.
- [ ] `npm run itest:ssh-agent` green locally (Windows: sections 1–4 and 6) **and in a Linux container** (sections 5,
      6, 7 RUN), and green in CI (`ci-extension.yml:150`) with section 7 RUN, not skipped.
- [ ] M2, M3 and the Extension Development Host check recorded in the PR.
- [ ] Every text in D5's row true for 1.16.0 in all five help languages; the CLI sentence's fate decided (Q1).
- [ ] Temp folders carry `testsToDelete-`; docs landed with each story; Mermaid renders; `plan-lifecycle.mjs` and
      `pin-check.mjs` pass.
- [ ] coai `review_code` with `plan: todo/PLAN_ssh_allow_longer_windows.md`, `epic: 3/3`; every finding resolved;
      verdicts and reviewer counts reported.
- [ ] **Order.** The PR is merged only after `extension-v1.15.0` is tagged, its changelog PR is merged and the
      Marketplace shows 1.15.0 — otherwise release-please folds E2 and E3 into one release and `[Unreleased]` mixes
      two versions. The branch is rebased onto that `main` before the code gate.
- [ ] PR opened; CodeRabbit answered; Sonar (quality gate) and CodeQL green; merged on green checks only.
- [ ] Release through release-please: dispatch → the changelog PR (`[Unreleased]` → `## [1.16.0]`) → merge the release
      PR → dispatch again for `extension-v1.16.0`; the Marketplace shows 1.16.0 (verified, not assumed). If the CLI
      commit was kept (Q1), the cli release PR release-please opens is the owner's to merge or close.
- [ ] **The promotion, once 1.16.0 is verified on the Marketplace** — `/promote-plan` for all four documents together
      (the parent and E1–E3): each status `IMPLEMENTED, <date>` with its deviations; edits first, `git mv` LAST (the
      rule's order); links — the four move together, so their links to each other stay siblings, and every
      `../research/` prefix in them drops; inbound links in `research/PLAN_agent_consent_policy.md`,
      `PLAN_ssh_agent.md`, `PLAN_ssh_sign_prompt_time.md`, `PLAN_ssh_sign_prompt_timeout.md`,
      `module_extension.md`, `module_tests.md` lose `../todo/`; the four rows leave `todo/README.md`'s open table and
      join its *Promoted* table; `research/README.md` mentions all four; the open tail — **certificate logins**
      (`…-cert-v01`, unrecognised since E1.1, parent Epics → E3) — is extracted into a fresh `todo/` plan;
      `plan-lifecycle.mjs` clean.

## 9. Open owner questions (routed by the caller; none blocks E3.1–E3.3)

- **Q1 — the CLI sentence** (`CommandLine.cs:208`, `src_cli/README.md:143-145`). It ships only with a `cli-v` release.
  If its commit stays in E3's PR, the squash commit touches `src_cli/` and release-please proposes a **cli** release
  with the PR's type — `feat` → `cli-v0.5.0` for one sentence (E1's squash produced `cli-v0.4.3` the same way). The
  alternatives: drop the commit and ship it as its own `fix(cli)` PR (→ `cli-v0.4.4`), now or with the next CLI
  change; or keep it and decline the cli release PR until then (the source then says something the published binary
  does not). The commit is built droppable either way. **Blocks only that commit.**
- **Q2 — SHA-1 RSA and the 10-minute window.** The plan reads the decision as *never covered by, and never offered, a
  long window* — a 10-minute window still covers a SHA-1 request, as today. If "always asks" was meant to include the
  10-minute window, L10's last leg and the gate's `all` check change. Not blocking.

## 10. Review record

Not reviewed yet. Before E3.1 starts: the coai plan gate (`review_plan`, `plan: todo/PLAN_ssh_allow_longer_windows.md`,
`epic: 3/3`) and Opus's own review, run at the same time on this document's first commit; each finding is recorded here
with its decision, rejections with their reasons.
