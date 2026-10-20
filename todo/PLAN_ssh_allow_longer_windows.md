# PLAN — the SSH signing prompt offers longer windows, and a window can never outlive what it was given for

> Status: **plan only, nothing implemented yet, 2026-10-20.** Scope: `src_vs_code/src` — `agentConsent.ts`,
> `sshAgentManager.ts`, `sshAgentServer.ts`, `sshAgentProtocol.ts`, `vaultKeys.ts`, `requestTime.ts`,
> `treeRowText.ts`, `treeDataProvider.ts`, `commands/agentCommands.ts`, `agentDoors.ts`, the five `help*.ts`, three
> new pure modules (`allowWindows.ts`, `consentTurns.ts`, `durationText.ts`), two new `vscode` modules
> (`sshSignPrompt.ts`, `sshAgentWiring.ts`), `package.json`, `README.md`, `CHANGELOG.md`, the walkthrough page,
> `scripts/ssh-agent-itest.cjs`; one sentence in `src_cli/src/CommandLine.cs`. Extension only; no format, contract or
> server change.
>
> Issue: [#197](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/197) — *«добавить кнопки 1 ч 4 ч 8 ч
> 12 ч»* (add buttons 1 h, 4 h, 8 h, 12 h), with a screenshot of the signing prompt.
> Related: [PLAN_ssh_agent.md](../research/PLAN_ssh_agent.md),
> [PLAN_ssh_sign_prompt_timeout.md](../research/PLAN_ssh_sign_prompt_timeout.md),
> [PLAN_ssh_sign_prompt_time.md](../research/PLAN_ssh_sign_prompt_time.md),
> [PLAN_agent_consent_policy.md](../research/PLAN_agent_consent_policy.md),
> [PLAN_wsl_agent_relay.md](../research/PLAN_wsl_agent_relay.md),
> [module_extension.md](../research/module_extension.md) §*SSH agent*.

## 1. The request, and what the screenshot actually shows

The issue has a title and one screenshot. The title asks for four more answers on the SSH agent's signing prompt:
1 hour, 4 hours, 8 hours, 12 hours, beside today's **Allow once**, **Allow for 10 minutes** and **Deny**.

The screenshot says more than the title. Its prompt reads:

> Use the SSH key "server key" to sign **a signature whose purpose this build does not recognise**?

The owner was signing in to a server. The prompt could not say so. That is defect D6 (§3): the agent's classifier
knows only the `publickey` userauth method, and an OpenSSH client uses `publickey-hostbound-v00@openssh.com`
whenever the server advertises it — which every OpenSSH server since 8.9 does. So the request has two halves: *ask
less often* (the issue's title) and *say what is being signed* (the issue's own picture). This plan does both, and it
does the first one in a way that keeps the product's promise about the second.

## 2. What the code does today (verified 2026-10-20 on `origin/main` a7b3ecf2)

| Fact | Where |
|---|---|
| The prompt is one modal with three buttons; VS Code adds **Cancel** itself | `sshAgentManager.ts:298-322` (`askToSign`, buttons at `:307-309`) |
| The meaning of an answer is a pure module: `ALLOW_ONCE`, `ALLOW_WINDOW`, `DENY`, `ALLOW_WINDOW_MS = 10 min`; an unknown label allows once and remembers nothing | `agentConsent.ts:33-38`, `:64-77` |
| A window is one absolute deadline per entity id, in memory, fixed at the CLICK | `sshAgentManager.ts:77`, `:277`, `:281-283`; the click rule `:266-268`, test `sshAgentManager.test.ts:335-357` |
| A window covers **every** purpose: a login, a Git signature, an unrecognised request | `sshAgentManager.ts:270` (the check reads only the key and the clock) |
| A window is cleared only by **Remove from SSH Agent** (`unload`) and by window close/reload (`dispose`) | `sshAgentManager.ts:168`, `:354`; `unload` has one caller, `commands/agentCommands.ts:702` |
| One 5-minute bound on the prompt; a late click signs nothing | `agentConsent.ts:46`, `sshAgentManager.ts:317` |
| **A vault lock does not reach the agent.** `lock()` wipes the cached master keys and nothing else. There are three lock roads: the idle timer and *Lock Vaults* through `lockNow`, and corporate deactivation through `evictAndLock`, which calls `lock()` directly | `vaultKeys.ts:178-187`; `extension.ts:375-380`, `:384-393`; `commands/keyCommands.ts:409-413`; `corpBindingWiring.ts:151-158` wired at `extension.ts:299` |
| Signing inside a window is not presence and does not postpone the idle auto-lock (default 60 min, `0` = off) | `sshAgentManager.ts:270-272` (no `onUserPresent`); `lockState.ts:101-107`; `package.json` `autoLockMinutes` |
| Nothing shows an open window and nothing ends one early, except unloading the key | tree tokens `:agenton`/`:agentoff` come from the PERSISTED flag, `treeRowText.ts:144-149` |
| The server holds the `AgentKey` object across the awaited prompt and signs with it afterwards | `sshAgentServer.ts:144-147` |
| The product's existing longest consent window is the MCP door's *ask once every 12 hours*; its stamp refuses a start in the future (clock rollback) | `mcpConsentPolicy.ts:30-31`, `:138-141` |
| Who reaches the agent: every process of this OS user (Windows named pipe with the default DACL; POSIX socket in a `0700` directory), every integrated terminal (AI coding agents included), every WSL distribution through the relay, and through interop even without it, and a remote host when the extension's own Connect forwards the agent (`-A`) | `sshAgentServer.ts:62-66`, `sshAgentManager.ts:213-218`, `:228`; `research/PLAN_wsl_agent_relay.md:84-95`; `research/architecture.md:460`; `sshProgram.ts` / `sshOptions.ts` (`-A`) |

## 3. Defects found on the way

Each is read from the code and is shown RED before anything is changed (§10). D1–D3 exist today; a twelve-hour window
turns each from a ten-minute problem into a half-day one, which is why they are fixed **before** any longer answer is
offered.

| # | Defect | Evidence | Fixed in |
|---|---|---|---|
| **D1** | Loading a key over an entity id that is already loaded replaces the key bytes and **keeps the old window** — the new key signs silently under a grant given to the old one. Reachable: a sync or *Restore Version* flips the persisted `sshAgent` flag, the row offers *Add* again, the click loads the new bytes | `serve()` `sshAgentManager.ts:149-159` never touches `allowedUntil`; only `unload` does (`:168`) | E1 |
| **D2** | An answer that arrives after **Remove from SSH Agent** (a) still writes a window for that entity id, which a later re-load inherits, and (b) **still signs with the removed key**, because the server calls `key.sign` on the object it captured before the prompt. A re-load during the prompt does the same with the OLD material | `sshAgentManager.ts:281-283`; `sshAgentServer.ts:144-147` | E1 |
| **D3** | Two prompts for one key at once (a `git push` signs and authenticates) both pass the window check before either is answered; the last answer wins. Latent today (every window is the click + 10 min, so the later click is always the later deadline); live the moment two lengths exist — "1 hour" after "12 hours" would shorten the grant | `sshAgentManager.ts:270-283` | E1 (rule), E2 (one prompt per key), E3 (proved with two lengths) |
| **D5** | Texts that promise more than the product does: *"A dialog per signature is the feature"* (false since the 10-minute window), *"every single use opens a dialog"*, *"(confirm every use)"*, *"Every use asks first"* | `helpEn.ts:185`, `:189`, `:209`, `:212` and the same lines in `helpDe/Es/Ru/Uk.ts`; `package.json` command title *"Add to SSH Agent (confirm every use)"* and the `wslAgentRelay` description; `agentDoors.ts:103`; `extension.ts:584`; `commands/agentCommands.ts:679`; `README.md:41`, `:73`, `:285-291`, `:1114`, `:1208`; `media/walkthrough/use.md:4`; `src_cli/src/CommandLine.cs:208` | E1 (today's truth: *Allow once, or every use for 10 minutes*), E2 (the row and the button), E3 (the final wording) — each release's texts describe that release |
| **D6** | A login to any OpenSSH ≥ 8.9 server is described as *"a signature whose purpose this build does not recognise"*. The classifier requires the method to be exactly `publickey`; OpenSSH's `PROTOCOL` §3.1: *"Clients should prefer host-bound authentication when advertised by server"*, method `publickey-hostbound-v00@openssh.com`, with the server host key as one more field. The issue's screenshot is this defect | `sshAgentProtocol.ts:205-221` (`isPublicKeyLogin` at `:205-207`) | E1 |

**Found, and deliberately not in this plan** — each becomes its own GitHub issue (§13):

- **D4** — deleting or editing a key entry does not unload it from the agent; the old bytes stay served until *Remove*
  or a window reload. Touches the tree, edit and sync paths (owner, 2026-10-20: separate issue).
- **Corporate deactivation does not close open forms.** `evictAndLock` calls `lock()` directly and skips `lockNow`'s
  `formPanels.closeAll()`; `research/module_extension.md` claims that "a third lock path cannot forget a step". This
  plan's hook lives in `VaultKeys.lock()` precisely so the SSH half cannot have the same gap.
- **The *Forward the SSH agent (-A)* checkbox has no warning** although `PLAN_wsl_agent_relay.md:95` says the hop
  "keeps D1's existing warning" (`entityFormPage.ts:346`, `entityViewPage.ts:499`). With a window open, every process
  on the remote host signs silently.
- **A prompt budget** against a process that floods the agent with requests to train the person to click (the broker
  has one, `aliasThrottle.ts`: five prompts per sliding minute). E2's one-prompt-per-key removes the pile-up; the
  sequential fatigue is the follow-up.

## 4. Owner decisions (2026-10-20)

Asked in this order; the question consultant (coai `ask_consultants`, two of three rows answered both times) was asked
first, and the owner answered what the consultants could not settle or what is the owner's call.

| # | Decision | How it was reached |
|---|---|---|
| **O1** | **Two steps.** The modal is **Allow once · Allow for 10 minutes · Allow longer… · Deny** (+ VS Code's Cancel). *Allow longer…* authorises nothing by itself: it opens a list — 1 hour, 4 hours, 8 hours, 12 hours — each with its local end time. Escape on the list refuses this signature. One 5-minute bound covers both steps | Owner, on both consultants' advice: eight buttons in one modal clip in the `custom` dialog style (one `nowrap` row, `overflow: hidden`) and break VS Code's UX guide |
| **O2** | Long windows are offered for **every** loaded key; no per-entry opt-in. **12 hours** is the ceiling — the product's existing maximum (`ASK_WINDOW_MS`) | Owner (consultants split; the opt-in would add a synced field and UI) |
| **O3** | **Any lock ends every window** — idle auto-lock, *Lock Vaults*, corporate deactivation. While locked, a loaded key still signs through the per-use prompt, as today | Owner |
| **O4** | An open window is **visible** on the key's row (*"signs without asking until 18:40"*) with a row button **Ask for Every Use Again** that ends it and keeps the key loaded | Owner, consultants agreed |
| **O5** | **One prompt per key at a time**; a waiting request re-checks after the open prompt is answered. Overlapping grants of the same scope keep the **later** deadline. *Allow once* and *Deny* never shorten or end a window. *Allow once* stays the first (Enter) button; no remembered choice | Owner, consultants agreed |
| **O6** | The dialog says plainly that while a window is open ANY process that reaches the agent signs without asking, and what ends the window | Owner |
| **O7** | Fix D1, D2, D3, D5 (and D6, found later) in this plan, first; D4 is a separate issue | Owner |
| **O8** | **Clean structure**: the window rules move into a pure module, the prompt into its own module; not a patch of the `Map` | Owner, on the two architects' comparison (§6.6) |
| **O9** | A window longer than 10 minutes covers **SSH logins only**. Git and other SSHSIG signatures, and unrecognised requests, keep at most the 10-minute window. Reason: a silent Git signature is a permanent *Verified* commit in the person's name that survives every later revocation; a login is bounded by its session | Both consultants agreed; owner may overrule |
| **O10** | Long windows are **not offered when idle auto-lock is off** (`autoLockMinutes = 0`): no lock would ever end them. The prompt says so and names the setting. Checked again when a window is USED, so turning auto-lock off later cannot leave a long window silently usable | Both consultants agreed; owner may overrule |
| **O11** | The consequence of O3 is **said, not hidden**: silent signing is not activity, so with the default 60-minute auto-lock a long window usually ends after an hour in which no secret was touched. The list says *"signs until 18:40 — or until the vault locks (idle auto-lock: 60 min)"* | Owner |
| **O12** | Long windows are **not offered while the vault is locked**: a window granted while locked could not be ended by a lock. *Allow once* and *10 minutes* work as today | Owner |

## 5. Threat model and the invariants the code must keep

What a silent signature buys, by purpose: an **SSH login** is access for one session (it does not end the session or
undo what was done in it, but it opens no new one after the window); a **Git/SSHSIG signature** is a durable artefact —
a commit or tag that shows *Verified* under the person's name forever; an **unrecognised** request may be a
certificate (`ssh-keygen -s`) minting credentials for someone else. Who can ask is everything in the last row of §2.

The invariants below are the plan's contract. Every one has a test in §11.

| # | Invariant |
|---|---|
| **I1 Material** | A signature is produced only with the `AgentKey` object that is served for that key at the moment of signing. An unloaded, replaced or disposed key object refuses to sign, whoever holds it |
| **I2 Generation** | An answer opens a window only for the key generation it was asked about. A key re-loaded under the same entity id is a new generation and inherits nothing |
| **I3 Fence** | Every revocation — unload, re-load, lock, *Ask for Every Use Again*, dispose — moves a fence; an answer given across a fence opens no window. Across a lock it may still allow its ONE signature (the per-use prompt works while locked, O3); across unload/re-load it refuses |
| **I4 Origin** | A window exists only because a person picked a timed answer in this window's process. It is memory-only, per key, per scope, with `grantedAt ≤ now < until` and `until − grantedAt ≤ 12 h`. A clock moved backwards covers nothing granted "in the future" |
| **I5 Scope** | A 10-minute window covers every purpose (today's meaning, kept). A longer window covers only a request the classifier fully parses as an SSH login for **this** key (§6.1, C3) |
| **I6 Lock** | Any `VaultKeys.lock()` ends every window before it returns. No long window is granted while locked or while auto-lock is off, and none is honoured once auto-lock is off. Unlock re-arms nothing |
| **I7 Presence** | Silent signatures never count as presence and never postpone the auto-lock (already true; kept as a test) |
| **I8 Monotone** | *Allow once*, *Deny*, a dismissal never lengthen or shorten a window. Two timed grants of one scope keep the later deadline |
| **I9 One prompt** | At most one consent turn per key is open; a waiting request re-checks the window when its turn starts; *Allow once* authorises only its own signature |
| **I10 Record** | Every silent signature writes a log line naming the window that allowed it (scope, until when) |

## 6. Design

### 6.1 The window book — `allowWindows.ts` (new, pure, no `vscode`)

The bare `Map<string, number>` (`sshAgentManager.ts:77`) had three operations and no rules; D1, D2 and D3 are each a
rule it never had. It becomes an immutable value with pure functions, so "did anything change?" is a reference check
and the tree repaints only on a real change.

```ts
export type WindowScope = 'all' | 'login';                 // 10-minute window | a longer, login-only window
export interface KeyRef { readonly entityId: string; readonly generation: number }
export interface AskTicket extends KeyRef { readonly epoch: number }   // taken when a turn starts
export interface OpenWindow { readonly generation: number; readonly grantedAt: number; readonly until: number }
export interface AllowWindows {
  readonly epoch: number;                                   // the fence (I3)
  readonly open: ReadonlyMap<string, Readonly<Partial<Record<WindowScope, OpenWindow>>>>;
}
export const NO_WINDOWS: AllowWindows;
export const MAX_WINDOW_MS: Readonly<Record<WindowScope, number>> =
  { all: 10 * 60_000, login: 12 * 3_600_000 };              // per scope: an `all` window can never be longer than ten
                                                            // minutes, whatever it is handed. `login` is NOT imported
                                                            // from mcpConsentPolicy (that file imports this one); a
                                                            // test pins the two equal
export type GrantOutcome = 'opened' | 'kept-later' | 'fenced' | 'stale-key';
export function grantWindow(book, ticket, scope, currentGeneration: number | undefined, grantedAt, until):
  { book: AllowWindows; outcome: GrantOutcome };            // fenced: epoch moved · stale-key: generation moved ·
                                                            // until clamped to grantedAt + MAX_WINDOW_MS[scope] ·
                                                            // later deadline kept within the scope
export function windowCovers(book, key: KeyRef, scopes: readonly WindowScope[], now): OpenWindow | undefined;
export function windowsFor(book, key: KeyRef, now): Readonly<Partial<Record<WindowScope, OpenWindow>>>; // the row
export function endWindows(book, entityId): AllowWindows;  // the row button: epoch + 1
export function endAllWindows(book): AllowWindows;          // lock: epoch + 1, empty
export function forgetKey(book, entityId): AllowWindows;    // unload / re-load: epoch + 1
export function withoutExpired(book, now): AllowWindows;
export function nextExpiry(book, now): number | undefined;
```

`windowCovers` uses the existing `withinAllowWindow` (`agentConsent.ts:80-82`) plus `grantedAt <= now` (I4) — the same
guard `mcpConsentPolicy.ts:140` already has. `withinAllowWindow`'s signature does not change, so `mcpConsentPolicy.ts:123`
is untouched.

**Not the "third instance".** `agentConsent.ts:22-29` keeps the SSH deadline and the MCP stamp apart "until there is a
third instance to learn from". #197 widens the SAME instance — still a deadline fixed at the click, per key, in memory,
in one window. The MCP stamp keeps every property that made it different (persisted, read fresh, a START, fenced by a
timestamp because another window can write the store). The paragraph is updated to record that #197 was considered and
is not the third instance; `withinAllowWindow` stays the one shared piece.

### 6.2 The decision — `agentConsent.ts` (widened, not replaced)

Reuse-first move 1: the existing pure module grows the table.

```ts
export const ALLOW_LONGER = 'Allow longer…';
export const SIGNING_BUTTONS = [ALLOW_ONCE, ALLOW_WINDOW, ALLOW_LONGER, DENY] as const;   // dialog order; Once first
export const LONGER_WINDOWS_MS = [1, 4, 8, 12].map((h) => h * 3_600_000);                // shortest first
export type SigningAnswer =
  | { kind: 'unanswered' } | { kind: 'deny' } | { kind: 'once' }
  | { kind: 'window'; scope: WindowScope; ms: number } | { kind: 'declined-longer' };
export function answerFromModal(choice: string | undefined): SigningAnswer | 'pick-longer';  // unknown label → once
export function answerFromPick(ms: number | undefined): SigningAnswer;   // undefined → declined-longer; a value not
                                                                        // offered → once (the safe direction, as today)
export function decideSigning(answer: SigningAnswer, now: number): ConsentDecision;  // one switch: the table
export type LongerOffer = { offer: true } | { offer: false; why: string };
export function longerOffer(purposeIsLogin: boolean, locked: boolean, autoLockMinutes: number): LongerOffer;
```

| Answer | allow | present | window |
|---|---|---|---|
| dismissed modal, timeout | no | no | — |
| Deny | no | yes | — |
| Allow once (or an unrecognised label) | yes | yes | — |
| Allow for 10 minutes | yes | yes | `all`, click + 10 min |
| Allow longer… → pick N h | yes | yes | `login`, pick + N h |
| Allow longer… → Escape on the list | no | **yes** (a person clicked *Allow longer…* and then refused; same as Deny) | — |
| Allow longer… → the bound runs out on the list | no | no | — |

`consentFromChoice` has one caller (`sshAgentManager.ts:277`) and is replaced by `answerFromModal` + `decideSigning`.
`ALLOW_LONGER` reaching the old fallback would have meant "allow once" — the table maps it explicitly, so a label
mistake can never sign.

### 6.3 Who may be offered a long window — `sshAgentProtocol.ts` (D6 + strict login)

The classifier becomes an authorisation boundary (I5), so "login" must mean *a complete, well-formed userauth request
for this key*, not "starts like one":

- Recognise both methods, `publickey` and `publickey-hostbound-v00@openssh.com` (`PROTOCOL` §3.1).
- Parse the whole shape: session id, `50`, user, service, method, `has_signature = TRUE`, algorithm, public key blob,
  and for host-bound the server host key blob — **and nothing after it**. Anything else is `unknown`, as the file's own
  rule says: *"Anything else is reported as unrecognised rather than guessed at."*
- The request's public key blob must equal the signing key's blob; otherwise it is `unknown`. Today the server passes
  only `request.data` (`sshAgentServer.ts:145`); it passes `request.publicBlob` too, so
  `describeSignRequest(data, signingKeyBlob)`.
- The existing positive fixture stops after the method field (`test/sshAgentProtocol.test.ts:89-99`); under the strict
  rule it is a malformed request, so it is rewritten as a complete userauth, and a copy of the old short form becomes
  the *"a userauth cut short is unrecognised"* case.
- For host-bound, the purpose carries the server host key's `SHA256:` fingerprint, and the prompt names it: *an SSH
  login as "git" (ssh-connection) to the server with host key SHA256:…*. That is more than the prompt could ever say,
  and it is what the person needs to decide.

`SignPurpose`'s `ssh-login` variant gains `hostKey?: string`; `describePurpose` (`:250-262`) gains one branch.

### 6.4 One prompt per key — `consentTurns.ts` (new, pure)

```ts
export class ConsentTurns {
  constructor(boundMs: number);
  /** One turn per key at a time. The bound runs from ARRIVAL and covers waiting and both steps — the promise of
   *  CONSENT_TIMEOUT_MS is that an unanswered request does not stay live. `undefined` = the bound ran out.
   *  A turn whose signal aborted before it started never runs. */
  take<T>(key: string, work: (signal: AbortSignal) => Promise<T>): Promise<{ value: T } | undefined>;
  forget(key: string): void;
}
```

It reuses `SerialQueue` (`serialQueue.ts:20-29`) per key and `withTimeout` (`withTimeout.ts:20`); a turn races its work
against the abort so a modal nobody answers (VS Code cannot close a modal) cannot wedge the key's queue. `withTimeout`
only stops the WAITING, not the work, so the work itself is fenced: every step after an `await` in the prompt checks
`signal.aborted` before it opens anything, and the manager applies a turn's answer only when `take` returned it —
a late continuation can neither open the list nor write a window. The answer is
**not** shared between waiters the way the broker shares one (`credsAgentServer.ts:583-615`), because *Allow once* must
authorise only its own signature (I9): each waiter re-checks the window when its turn starts and asks only if nothing
covers it.

### 6.5 The prompt — `sshSignPrompt.ts` (new, uses `vscode`)

`askSigning({ key, purpose, asked, offer, signal }): Promise<SigningAnswer>` — the text and both steps move out of
`sshAgentManager.ts:298-328` (`askToSign`, `modalFailed`).

1. `showWarningMessage(text, { modal: true }, ...buttons)`, where `buttons` is `SIGNING_BUTTONS` without
   `ALLOW_LONGER` when `offer.offer === false`. A rejected modal is a dismissal (`modalFailed`, moved).
2. On *Allow longer…*: if `signal.aborted`, return `unanswered` — a late click opens nothing. Otherwise a
   `CancellationTokenSource` cancelled by `signal` (the shape of `agentCreatePin.ts:50-69`, whose comment says VS Code
   closes a box whose token is cancelled), then `showQuickPick(items, { title, placeHolder, ignoreFocusOut: true },
   token)`. The items are shortest first, so Enter on an untouched list picks 1 hour, the shortest.

The window still starts at the final click: `decideSigning` reads the clock after the await, as `:277` does today.

### 6.6 The manager — `sshAgentManager.ts`

- `LoadedKey` gains `generation`; `serve()` sets `++this.generations` and calls `forgetKey` (D1).
- `windows: AllowWindows = NO_WINDOWS` replaces `allowedUntil`; `turns = new ConsentTurns(consentTimeoutMs)`.
- `confirm` (`:263-285`, at the complexity limit today) splits into methods of complexity ≤ 4:
  `confirm` (read generation at arrival — the server's hand-off to `confirm` is synchronous, `sshAgentServer.ts:133-145`,
  so it is the generation of the object the server holds) → `turns.take` → `coveredOrAsk` (re-check with the current
  purpose's scopes; else ask) → `settle` (decision, presence, `openWindow`, the log line of I10) → `openWindow`
  (`grantWindow`; `fenced` across a lock → allow once, open nothing, one information message *"The vault locked while
  you were choosing — this signature was allowed once; no window was opened."*; `stale-key` → refuse).
- New public methods: `endWindows(entityId): boolean` (the row button), `endAllWindows(reason): void` (the lock),
  `windowsFor(entityId)` (the row).
- Settable hooks with no-op defaults, the `provider.isBridged` shape (`treeDataProvider.ts:188`), so no constructor
  call changes: `onWindowsChanged`, `lockedNow: () => boolean`, `autoLockMinutes: () => number`.
- One expiry timer at `nextExpiry`, `unref`'d (a 12-hour timer must not hold a `node:test` run open, the lesson in
  `withTimeout.ts:9-15`); it repaints the row. The gate itself reads the clock, so a timer that fires late after sleep
  can delay a repaint, never a refusal.
- `durationText` (`:362-370`) moves to `durationText.ts` and learns whole hours ("1 hour", "4 hours"); the bound
  sentence and the list labels use it.

**The two architects' comparison (owner chose clean):** minimal ≈ +170 production / +450 test lines, all inside the
manager, no one-prompt-per-key; clean ≈ +480 / +700. The size limits force the wiring module, the test split and the
line-neutral tree edit on BOTH, so the real difference is ~300 lines of rules made testable without `vscode`.

### 6.7 D2's other half — `sshAgentServer.ts`

After the `await` in `confirmAndSign` (`:144-147`): sign only if `this.options.keys().includes(key)`; otherwise log
`REFUSED … the key was removed while its prompt was open` and return `encodeFailure()`. Belt and braces with I2: the
server is the thing that owns the material path. `LoadedKey.sign` additionally refuses after `unload`/`dispose` through a
`revoked` flag, so a future caller that forgets the check still cannot sign (I1).

### 6.8 The lock reaches the agent — `vaultKeys.ts` + `sshAgentWiring.ts`

- `VaultKeys` gains a settable `onLocked: () => void = () => undefined`, called as the last statement of `lock()`
  (`:178-187`) — the precedent is the settable `loginKeys` hook (`:112-120`). All three lock roads pass through
  `lock()`; `lockNow` alone would miss corporate deactivation.
- `extension.ts` is frozen at 1025 lines by the size ratchet (`.size-baseline.json`, `sizeRatchet.ts`), so the SSH
  wiring at `extension.ts:566-587` moves to `sshAgentWiring.ts` (`wireSshAgent({...}): SshAgentManager`), which also
  sets `onWindowsChanged → provider.refresh()`, the lock link through ONE named function
  `connectAgentToLock(vaultKeys, sshAgent)` (`vaultKeys.onLocked → endAllWindows('the vaults were locked')`) — named
  so that a test can drive a real `VaultKeys.lock()` (loaded through `loadWithVscode`) into a real manager and prove the
  seam, rather than calling `endAllWindows` directly and proving nothing about the wiring;
  `lockedNow → vaultKeys.isLocked()`, `autoLockMinutes → the setting`, `provider.signWindows → windowsFor`, and the
  corrected startup notice (`:584`). The baseline is lowered to the new size in the same commit.

### 6.9 The row and the button

- `treeRowText.ts`: `entityContextValue` (`:119-128`) gains `signWindowOpen = false` → token `:signwindow` inside the
  `isSshKey` branch (`:144-149`); live state, like `:bridged`, not the persisted `:agenton`. `signWindowLabel(windows,
  now, offset)` → *"signs without asking until 18:40"*, or for a login window *"logins without asking until 18:40"*,
  both when both are open. `entityDescription(...)` takes over the join at `treeDataProvider.ts:651-658` with its
  comment.
- `treeDataProvider.ts` is at exactly 800 lines (the `max-lines` ceiling, `eslint.config.mjs:30`): the edit is
  **line-neutral** — one hook field (+2), one argument (+1), the description join collapsed to one call (−2), the
  `describeRemaining` import gone (−1).
- The row text is computed at render; the expiry timer (6.6) is the only reason to repaint, because an end time, unlike
  "N min left", is stable until it passes. Not part of the tree filter text (`treeRowText.ts:17-19`): it is live state,
  not a property of the record — said in the doc.
- `commands/agentCommands.ts` (772 lines — one handler fits) registers `credSshManager.askEveryUseAgain`: resolves the
  key row with `keyRowFor` (`:629-636`), `sshAgent.endWindows(id)`, *"\"prod\" asks for every use again — the key stays
  loaded."*
- `package.json`: the command *Ask for Every Use Again*; `view/item/context` with `viewItem =~ /:signwindow/`, group
  `2_actions@13`; a `commandPalette` entry `"when": "false"` (a row action with no target elsewhere, as
  `openSiteInBrowser`). `manifest.test.ts:37-110` is satisfied by the menu entry.

## 7. The exact texts

**The modal** (lines 1–3 and the fingerprint keep their shape; existing tests split on `\n`):

```
Use the SSH key "{name}" to sign {purpose}?
Requested {time} (UTC±HH:MM).

{fingerprint}

The key itself never leaves this window. Allow once; allow every use of this key for 10 minutes — long enough for a push
that signs and authenticates in one go; or allow SSH logins with this key for longer, up to 12 hours.

While a window is open, any process running as you that reaches this agent — an AI agent in a terminal, a script, WSL,
a host you forwarded the agent to — uses this key without asking. Locking the vault ends every window, and so does
"Ask for Every Use Again" on the key's row.

Unanswered, it is refused after {bound}.
```

When `longerOffer` says no, the second paragraph's last clause is replaced by its `why`, and the button is absent:
*"Longer windows cover SSH logins only."* · *"Longer windows need the vault unlocked — a lock ends them."* ·
*"Longer windows need idle auto-lock: credSshManager.autoLockMinutes is 0."*

**The list** — title *How long may "{name}" log in without asking?*, placeholder *Logins only. Escape refuses this
signature.*, items *1 hour — until 12:55, or until the vault locks (idle auto-lock: 60 min)* … *12 hours — until 23:55
…*. The end time is computed when the list opens; the window starts at the pick, so the real end can be later by at
most the time the list stayed open. The row and the log show the exact deadline.

**The row** — *signs without asking until 12:10* (10-minute window) · *logins without asking until 18:40* (long window).

**The log** — *allowed without asking: login window of "{name}" until 18:40 (granted 10:40)* (I10).

## 8. Growth budget

Nothing is persisted. The window book holds at most two entries per loaded key; ten loaded keys are twenty small
objects. Entries leave on expiry, unload, re-load, lock, the row button and dispose; a window reload drops everything,
which is the safe direction. `ConsentTurns` holds one queue per key with a waiting request, bounded by the 5-minute
bound per request; `forget` on unload drops it. One timer at a time.

## 9. Boundaries with other plans

All four are IMPLEMENTED records in `research/`; each gets a dated pointer line, not a rewrite.

| Item | Built by | The other plan's part |
|---|---|---|
| The window starts at the click | `PLAN_ssh_sign_prompt_time.md` (rule) | this plan keeps it for every length: the final click is the pick |
| One bound per prompt, late click signs nothing | `PLAN_ssh_sign_prompt_timeout.md` | this plan extends the bound over the list and the queue wait |
| The MCP 12-hour policy | `PLAN_agent_consent_policy.md` (D1: not the SSH dialog) | unchanged; this plan shares only `withinAllowWindow` and pins the 12-hour ceiling equal by test |
| "The worst a process inside WSL can do is *ask*" | `PLAN_wsl_agent_relay.md:91` | false once a window is open; rewritten by this plan (§12) |

Disjoint: nothing in `todo/` touches the SSH agent today (checked: `todo/README.md` table, 2026-10-20).

## 10. Build order — every story RED first

Story names are the guarantee. "RED today" is the observed failure on `origin/main`, recorded in the PR.

- **S0 — room to work (pure move).** Extract the world and helpers from `test/sshAgentManager.test.ts` (585 lines;
  `world` `:63-135`, `manager` `:137-182`, `storageDir` `:195`) into `test/sshAgentWorld.ts` (precedent
  `test/pinWorld.ts`), and rename its temp folder `testsToDelete-agent-…` (the test-leftovers rule). The stub records
  the modal's buttons, gains `showQuickPick(items, options, token)` (answers from a queue, matched against the REAL
  items, `undefined` when the token is cancelled), `CancellationTokenSource` (`StubCancellationTokenSource`,
  `vscodeStub.ts:181`) and `showInformationMessage`. Suite stays green.
- **S1 — D6.** RED: *a host-bound OpenSSH login is described as a login to that host key* (fixture built from the
  `PROTOCOL` §3.1 layout, placeholder user name). RED: *a userauth with trailing bytes, a different public key or no
  signature flag is unrecognised*. Fix: §6.3.
- **S2 — D1.** RED: *re-adding a key that is already loaded starts it with no window*. Pure: *a window granted to one
  generation of a key never covers the next*. Fix: `allowWindows.ts` (generation part), `LoadedKey.generation`.
- **S3 — D2.** RED (`sshAgentServer.test.ts`, real socket): *a key removed while its prompt is open does not sign,
  whatever the answer*. RED (manager): *an answer after unload opens no window for the key loaded next*; *a re-load
  during a prompt signs with neither the old nor the new material*. Fix: §6.7, the `revoked` flag, the generation.
- **S4 — the book's rules (pure).** *a shorter grant never shortens a longer one of the same scope* (D3's rule);
  *no grant reaches past twelve hours, whatever it is handed*; *an `all` window never reaches past ten minutes, whatever
  it is handed*; *a revocation fences an answer even when no window was open*; *a window granted in the future covers nothing*;
  *a clock moved forward ends a window early, never extends it*; *a login window never covers a Git signature or an
  unrecognised request*; *a 10-minute window still covers every purpose*.
- **S5 — the lock.** RED: *every lock ends the SSH windows* — a real `VaultKeys` and a real manager joined by
  `connectAgentToLock`, locked once by `lock()` and once by `evictAndLock(vaultKeys)(account)`; *after a lock the next
  signature asks*; *a prompt answered across a lock signs once and opens no
  window*; *unlocking re-arms nothing*. Fix: §6.8, the epoch.
- **S6 — one prompt per key.** Pure (`consentTurns.test`): *a second request for the same key waits*; *different keys
  do not wait*; *a request whose bound ran out while queued is never shown*; *an unanswered modal does not wedge the
  key*. Manager: *a window opened by the first prompt covers the waiting request without a prompt*; *Allow once
  authorises only its own signature — the waiting request still asks*. RED for D3 is possible only here, with two
  lengths: *"1 hour" answered after "12 hours" keeps twelve*.
- **S7 — the longer windows.** Pure: *Allow longer… authorises nothing by itself*; *each longer window arms exactly its
  duration*; *Escape on the list refuses and counts as presence*; *an unrecognised pick allows once and arms nothing*;
  *the end time reads local HH:MM and says tomorrow across midnight* (`requestTime.ts`, `clockUntil`); *twelve hours is
  the ceiling — equal to the MCP ask window*. Manager: *Allow longer… then 4 hours lets logins through for four hours
  from the pick*; *the five-minute bound covers both steps — an open list is closed at the bound and refuses*; *a late
  Allow longer… opens no list*; *Allow once is the first button*; *the list is not offered for a Git signature, while
  locked, or with auto-lock off — and the prompt says why*; *a long window granted, then auto-lock set to 0, covers
  nothing*; *a silent signature is not presence*. Fix: §6.2, §6.5, §6.6, `durationText.ts`.
- **S8 — the row and the button.** `treeRowText`: *a key row with an open window says until when it signs without
  asking*; *`:signwindow` only while a window is open*; *the menu offers Ask for Every Use Again exactly while a window
  is open* (the `when` regex read from `package.json`). Manager: *Ask for Every Use Again ends the window, keeps the key
  loaded, and beats an open prompt*; *the row is told to repaint on grant, expiry, lock, button and unload*
  (`t.mock.timers`, precedent `secretClipboard.test.ts:47`). `helpCoverage.test.ts` goes red when the command is added.
  Fix: §6.9, the wiring.
- **S9 — the words (D5).** RED: *the help names every answer the signing prompt offers* — loops over
  `SIGNING_BUTTONS` imported from the code, red today (no help names *Allow longer…*). RED: *the prompt says any
  process signs without asking while a window is open, and what ends it*. Fix: every text in D5's row, once, in the
  final wording; the CLI sentence at `CommandLine.cs:208` ships with the next `cli-v` release and says so.
- **S10 — the scenario and the docs.** `scripts/ssh-agent-itest.cjs` (stub gains `showQuickPick` +
  `CancellationTokenSource`, constructor unchanged; temp folder renamed `testsToDelete-agent-itest-…`): *one 1-hour
  pick, then two real host-bound-shaped login signatures with one prompt; after `endAllWindows` the next one prompts;
  a real `ssh-keygen -Y sign` inside the login window still prompts*. `research/module_tests.md` row. Docs per §12.

## 11. Test plan

| Guarantee (invariant) | Where | RED today? |
|---|---|---|
| A host-bound login is a login, named by host key (D6) | `sshAgentProtocol.test.ts` | yes — described as unrecognised |
| A malformed or foreign-key userauth is unrecognised (I5) | `sshAgentProtocol.test.ts` | yes — prefix-only parse |
| Re-adding a loaded key starts with no window (D1, I2) | `sshAgentManager.test.ts` | yes |
| A removed key does not sign, whatever the answer (D2, I1) | `sshAgentServer.test.ts` | yes — it signs |
| An answer across unload/re-load opens nothing (D2, I2, I3) | `sshAgentManager.test.ts` | yes |
| The later deadline wins within a scope (D3, I8) | `allowWindows.test.ts`, manager | latent; red with two lengths |
| Ceiling, future grant, clock forward (I4) | `allowWindows.test.ts` | new module |
| A login window never covers SSHSIG/unknown; a 10-minute window covers all (I5) | `allowWindows.test.ts`, manager | new behaviour |
| Every lock ends every window; across a lock: once, no window; unlock re-arms nothing (I6, I3) | `vaultKeysLock.test.ts`, manager | yes — lock does nothing |
| No long window while locked / auto-lock off; checked again at use (I6) | `agentConsent.test.ts`, manager | new behaviour |
| Silent signatures are not presence (I7) | manager | green — kept as a guard |
| One turn per key; Allow once only for its own signature; an unanswered modal never wedges (I9) | `consentTurns.test.ts`, manager | new |
| Both steps under one bound; a late click opens nothing | manager | new |
| The row shows the window, the button ends it, repaint on every change (O4) | `treeRowText.test.ts`, manager | new |
| Every silent signature names its window (I10) | manager | new |
| Help and prompt texts tell the truth (D5, O6) | help test, manager | yes |
| End to end with the real manager and `ssh-keygen` | `ssh-agent-itest.cjs` (CI `itest:ssh-agent`) | new scenario |

Thin wiring that cannot be unit-tested (`sshAgentWiring.ts` assignments) is covered by the scenario and said so in the
summary. **Measured before the PR is opened, by hand, once each:** M1 — a real login through the agent to an OpenSSH
≥ 8.9 server shows the host-bound prompt (before the fix: the log line `unrecognised signing request`); M2 — the
QuickPick with `ignoreFocusOut: true` survives a second modal raised over it; M3 — the four-button modal in
`window.dialogStyle: custom` at a normal window width shows every button. Results go into the PR and the promotion
record.

## 12. Documents to update

- `research/module_extension.md` — the SSH agent section and the table row at `:4841`; the new modules in its Mermaid
  diagram; the `onLocked` edge; the `:signwindow` token; the false "a third lock path cannot forget a step" sentence
  corrected as it is.
- `research/architecture.md:460` — "every signature still raises the consent dialog there".
- `research/PLAN_wsl_agent_relay.md:91` — the security argument, rewritten with the window, the scope and the lock.
- Pointer lines: `research/PLAN_ssh_agent.md`, `PLAN_ssh_sign_prompt_timeout.md`, `PLAN_ssh_sign_prompt_time.md`,
  `PLAN_agent_consent_policy.md` (§6 row 1, the "third instance").
- `research/module_tests.md` — the new suites and the scenario.
- `src_vs_code/README.md`, `CHANGELOG.md` `[Unreleased]` (`### Added — longer SSH windows for logins (#197)`,
  `### Fixed — D1, D2, D6`, `### Changed — a lock ends every window`), the five help files, the walkthrough page.
- `todo/README.md` row (same commit as this plan); on promotion, the `research/README.md` row.

## 13. Not doing, and why

| Not doing | Why | Where it goes |
|---|---|---|
| Eight buttons in one modal | clips in the `custom` dialog style; VS Code's UX guide | O1 |
| Long windows for Git signatures or unrecognised requests | a silent Git signature is permanent impersonation | O9 |
| A per-entry opt-in | owner chose every key; the scope rule (O9) bounds the risk instead | O2 |
| Refusing all signatures while locked | changes current behaviour; owner kept the per-use prompt | O3 |
| D4 (delete/edit does not unload) | touches tree, edit and sync paths | new issue |
| Corporate deactivation closing forms | a separate gap in `evictAndLock` | new issue |
| A warning on the `-A` checkbox | separate surface; the prompt names forwarded hosts meanwhile | new issue |
| A prompt budget against floods | single-flight removes the pile-up; fatigue is its own design | new issue |
| Unifying with the MCP stamp | not the third instance (§6.1) | — |
| Remembering the last chosen length | would make yesterday's exception today's Enter key | O5 |

## 14. Risks and what is not verified

- **A long window usually ends after an hour** with default settings (O11). Said in the list; the person who wants a
  real 8 hours raises `autoLockMinutes`. If people find that confusing, the cure is a sentence, not a weaker lock.
- **The stale modal**: when the bound runs out, the queue moves on but VS Code keeps the old modal on screen (it cannot
  close one). A click on it signs nothing — already true today and recorded in `PLAN_ssh_sign_prompt_timeout.md`'s open
  tail; with one-prompt-per-key a second modal may appear beside a stale one.
- **Unverified until M1–M3** (§11). The named-pipe default DACL is asserted by the repository's docs, not re-measured
  here.

## 15. Definition of Done

- [ ] Every story's RED was observed on unfixed code and is quoted in the PR beside its GREEN.
- [ ] `npm run typecheck`, `npm run lint`, `npm run ratchet` and `npm test` in `src_vs_code` are green; `.size-baseline.json`
      lowered for `extension.ts`; `treeDataProvider.ts` still ≤ 800 lines.
- [ ] `npm run itest:ssh-agent` green locally and in CI, with the new scenario.
- [ ] M1–M3 measured and recorded.
- [ ] Every invariant I1–I10 has its test (§11), named after the guarantee.
- [ ] Every text in D5's row tells the truth in all five help languages; `helpCoverage` green.
- [ ] Docs per §12; Mermaid diagrams render.
- [ ] The four follow-up issues of §13 are filed and linked here.
- [ ] Temp folders created by the touched tests carry `testsToDelete-`.
- [ ] coai gate: `review_plan` reached `proceed` before code; `review_code` ran on the finished branch; every finding
      resolved; verdicts and reviewer counts reported.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; on promotion the plan moves to
      `research/` with its deviations recorded.
- [ ] Extension release: the `CHANGELOG` section exists for the version release-please proposes (`feat` → minor);
      `package.json` and `package-lock.json` agree (`lockfileVersion.test.ts`).

## 16. Review record

*(filled after the plan gate)*

## Epics

Three epics, three extension releases, in this order. Each release ships a state that is true on its own, and the
texts of that release describe that state — nothing waits for the last epic to be corrected. Each epic's stories are one
document, `todo/PLAN_ssh_allow_longer_windows_E<n>.md`, written by Opus **when that epic starts**, not now; it links back
here, this section links to it, and it gets its own `todo/README.md` row. Release numbers below assume no other
extension release lands in between (the extension is at 1.14.1 today); release-please decides the real number.

The question consultant was asked 2026-10-20 (two models). Both said: ship the defect fixes first, with no new UI, before
any longer choice is reachable. Both named the same three areas as the ones where a mistake compounds silently. They
disagreed on where one-prompt-per-key goes; the decision and its reason are under E2.

### E1 — a window can never outlive what it was given for (fix release)

- **Goal.** D1, both halves of D2 and D6 are fixed, and today's 10-minute window obeys the book's rules. A removed or
  replaced key never signs; a re-loaded key inherits nothing; a login to an OpenSSH ≥ 8.9 server is named as a login,
  with its host key. No new button, no new answer, no new row text.
- **Scope.** S0, S1, S2, S3, S4. Design §6.1 (the whole book, `login` scope defined but no answer grants it yet), §6.3,
  §6.7, and from §6.6 only `generation`, `forgetKey` in `serve()`, `windows` replacing `allowedUntil`, the `confirm`
  split and the I10 log line. Invariants I1, I2, I3 (the unload / re-load / dispose fences), I4, I5 (the `all` rule, and
  the pure rule that a `login` window never covers SSHSIG or unknown), I8 (the book's rule), I10. Defects D1, D2, D6.
  Decisions O7, O8, O9 (as a rule in the book). Also the four follow-up issues of §13 are filed and linked in §3.
- **Depends on.** The plan gate (`review_plan` → `proceed`). Nothing else.
- **Done when.** Every story's RED is quoted beside its GREEN; the suite, typecheck, lint and ratchet are green; M1 is
  measured (a real host-bound login shows the new prompt). **Release:** `extension-v1.14.2` (`fix:` → patch). **Docs of
  this state:** `CHANGELOG` `### Fixed — D1, D2, D6` (plain words: *a key removed while its prompt was open no longer
  signs; re-adding a key starts it with no window; a login to a current OpenSSH server is named, with the server's host
  key*). The D5 sentences that are false **today** — *"every single use opens a dialog"*, *"(confirm every use)"*,
  *"every use asks first"* in the five help files, `package.json`, `agentDoors.ts`, `extension.ts:584`, `README.md`, the
  walkthrough — are corrected to today's truth: *Allow once, or every use for 10 minutes*. This deviates from §3's and
  S9's *"written once, in the final wording"*: a fix release must not ship a help text that lies about the release. S9's
  test (*the help names every answer the signing prompt offers*, looping over `SIGNING_BUTTONS`) is written here; it goes
  red again by itself in E3 when *Allow longer…* joins the list. `research/module_extension.md` (the book, the generation,
  the strict classifier, the diagram); `research/module_tests.md`; the pointer lines on the four `research/PLAN_ssh_*`
  records; `research/PLAN_wsl_agent_relay.md:91` rewritten for the window and the scope as they are after E1.
- **Cornerstone areas.** The window book's rules (`allowWindows.ts`): identity and generation, the fence that fences an
  answer even when no window is open, one maximum per scope (`all` ≤ 10 min), the later deadline within a scope, the
  future-grant guard. The boundary between the asynchronous prompt and the signing material: the server's post-await
  membership check, the `revoked` sign closure, and a replacement with identical public bytes revoking the old object.
  The strict userauth parser (§6.3) is an authorisation boundary too, but its contract is written down (OpenSSH
  `PROTOCOL` §3.1) and its tests are fixtures; it is **not** a cornerstone story — it gets Fable's security judgement at
  review, which the role table puts outside the quota.

### E2 — a window is visible, ends on any lock or from the row, and one prompt per key (feature release)

- **Goal.** Every `VaultKeys.lock()` ends every window; the key's row shows an open window and offers *Ask for Every
  Use Again*; at most one consent turn per key is open. Still only the 10-minute window — but everything that must exist
  before a longer one is offered.
- **Scope.** S5, S6, S8. Design §6.4, §6.8, §6.9, and from §6.6 `turns`, the public methods, the hooks, the expiry
  timer, the lock crossing (*fenced* → allow once, no window, the information message). Invariants I3 (the lock and the
  button fences), I6 (the lock half), I7 (kept as a guard), I9. Defect D3 (one prompt per key; the rule half shipped in
  E1). Decisions O3, O4, O5.
- **One-prompt-per-key is here, not in E1 — the reason.** (1) D3 cannot be shown RED before two lengths exist (§3, S6);
  E1 is the release in which every story is red on `origin/main`, and the rule half of D3 (I8, the later deadline) is
  pure and already in E1's S4. (2) `ConsentTurns` changes what a person sees: a second modal becomes a wait. That is a
  behaviour change, so it belongs in a minor release, not a patch. (3) Its abort fencing (§6.4) and the lock's epoch
  fencing are the two halves of one boundary — the row button must *beat an open prompt* (S8) — and E3's list step is
  what exercises the fencing in anger. Building the two fences together, in E2, keeps the boundary in one review.
- **Depends on.** E1 (the epoch, the book, `generation`).
- **Done when.** S5's evidence goes through the real seam: a real `VaultKeys` and a real manager joined by
  `connectAgentToLock`, locked once by `lock()` and once by `evictAndLock`, never a direct `endAllWindows` call. The
  `.size-baseline.json` is lowered for `extension.ts`; `treeDataProvider.ts` ≤ 800 lines; `helpCoverage` green for the
  new command. **Release:** `extension-v1.15.0` (`feat:` → minor). **Docs of this state:** `CHANGELOG`
  `### Changed — a lock ends every window`, `### Added — the row shows an open window; Ask for Every Use Again; one
  prompt per key`; the help files and `README.md` gain the row text and the command (10-minute wording only);
  `research/module_extension.md` (the `onLocked` edge, `sshAgentWiring.ts`, `consentTurns.ts`, the `:signwindow` token,
  the false *"a third lock path cannot forget a step"* sentence corrected as it is); `research/architecture.md:460`;
  `PLAN_wsl_agent_relay.md:91` gains the lock sentence.
- **Cornerstone areas.** The same material boundary as E1, on its asynchronous side: `ConsentTurns` must stop a late
  continuation (`withTimeout` only stops the waiting), and an answer across a lock allows once and opens nothing. Opus
  marks at most the quota across E1 and E2 — one story per area, both areas named in the ledger below.

### E3 — the longer windows for logins (#197) (feature release)

- **Goal.** The issue's request: *Allow longer…* opens the list of 1, 4, 8, 12 hours, login-only, with every guard of
  §4; the texts say what a window means; the end-to-end scenario runs in CI; the plan is promoted.
- **Scope.** S7, S9 (the longer-window sentences, the final wording, the CLI sentence), S10. Design §6.2, §6.5,
  `durationText.ts`, §7 in full. Invariants I5 (the `login` scope becomes reachable), I6 (no long window while locked or
  with auto-lock off; checked again at use), I8 at the manager with two lengths, I10 for login windows. Defects D3
  (proved with two lengths), D5 (final wording). Decisions O1, O2, O5, O6, O9, O10, O11, O12.
- **Depends on.** E2 (the row, the button, the lock, the turns). Nothing is offered before all three exist.
- **Done when.** M2 and M3 measured; `npm run itest:ssh-agent` green with the S10 scenario; every text in D5's row is
  true in all five languages; §15 fully ticked. **Release:** `extension-v1.16.0` (`feat:` → minor). The CLI sentence
  (`CommandLine.cs:208`) is edited here and ships only with the next `cli-v` release — `CHANGELOG` says so. **Docs of this
  state:** `CHANGELOG` `### Added — longer SSH windows for logins (#197)`; the modal, the list, the row and the log
  texts of §7; help, `README.md`, the walkthrough; `research/module_extension.md` (`sshSignPrompt.ts`, `durationText.ts`,
  the diagram), `module_tests.md`; the plan and its three stories documents promoted together with their deviations.
- **Cornerstone areas.** None new. The parser and the window rules are reused as shipped; E3's risk is in words and
  wiring, which Opus judges and the scenario proves.

Cornerstones: 0 of 2 — the window book's rules (`allowWindows.ts`), the boundary between the asynchronous prompt and the
signing material (`sshAgentServer.ts` post-await check and `revoked` closure, `consentTurns.ts` late continuations, the
lock crossing). Opus marks the concrete stories when E1's and E2's stories documents are written, and updates this line
in the same commit.
