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
| **D3** | Two prompts for one key at once (a `git push` signs and authenticates) both pass the window check before either is answered; the last answer wins. Latent today (every window is the click + 10 min, so the later click is always the later deadline); live the moment two lengths exist — "1 hour" after "12 hours" would shorten the grant | `sshAgentManager.ts:270-283` | E1 (the rule, in the pure book — it cannot be shown red on `origin/main`), E2 (one prompt per key), E3 (the two-length behaviour, a new test) |
| **D5** | Texts that promise more than the product does: *"A dialog per signature is the feature"* (false since the 10-minute window), *"every single use opens a dialog"*, *"(confirm every use)"*, *"Every use asks first"* | `helpEn.ts:184` (the title *"The SSH agent that asks every time"*), `:185`, `:189`, `:209`, `:212`, `:300` (names *"Add to SSH Agent (confirm every use)"*) and the same lines in `helpDe/Es/Ru/Uk.ts`; `package.json` command title *"Add to SSH Agent (confirm every use)"* and the `wslAgentRelay` description; `agentDoors.ts:103`; `extension.ts:584`; `commands/agentCommands.ts:679`; `README.md:41`, `:73`, `:285-291`, `:1114`, `:1208`; `media/walkthrough/use.md:4`; `src_cli/src/CommandLine.cs:208` | E1 (today's truth: *Allow once, or every use for 10 minutes*), E2 (the row and the button), E3 (the final wording) — each release's texts describe that release |
| **D6** | A login to any OpenSSH ≥ 8.9 server is described as *"a signature whose purpose this build does not recognise"*. The classifier requires the method to be exactly `publickey`; OpenSSH's `PROTOCOL` §3.1: *"Clients should prefer host-bound authentication when advertised by server"*, method `publickey-hostbound-v00@openssh.com`, with the server host key as one more field. The issue's screenshot is this defect | `sshAgentProtocol.ts:207-223` (`isPublicKeyLogin` at `:207-209`) | E1 |

**Found, and deliberately not in this plan** — each becomes its own GitHub issue (§13):

- **D4** ([#257](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/257)) — deleting or editing a key entry does not unload it from the agent; the old bytes stay served until *Remove*
  or a window reload. Touches the tree, edit and sync paths (owner, 2026-10-20: separate issue).
- **Corporate deactivation does not close open forms** ([#258](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/258)). `evictAndLock` calls `lock()` directly and skips `lockNow`'s
  `formPanels.closeAll()`; `research/module_extension.md` claims that "a third lock path cannot forget a step". This
  plan's hook lives in `VaultKeys.lock()` precisely so the SSH half cannot have the same gap.
- **The *Forward the SSH agent (-A)* checkbox has no warning** ([#259](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/259)) although `PLAN_wsl_agent_relay.md:95` says the hop
  "keeps D1's existing warning" (`entityFormPage.ts:346`, `entityViewPage.ts:499`). With a window open, every process
  on the remote host signs silently.
- **A prompt budget** ([#260](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/260)) against a process that floods the agent with requests to train the person to click (the broker
  has one, `aliasThrottle.ts`: five prompts per sliding minute). E2's one-prompt-per-key with at most three waiting
  requests removes the pile-up and bounds the queue; the SEQUENTIAL fatigue (prompt after prompt, each answered) is the
  follow-up.

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
undo what was done in it, but it opens no new one after the window) — and *access* includes everything that rides on an
SSH login: `git push`, `git fetch`, deleting a branch on every remote the key reaches, a shell on every server; a
**Git/SSHSIG signature** is a durable artefact —
a commit or tag that shows *Verified* under the person's name forever; an **unrecognised** request may be a
certificate (`ssh-keygen -s`) minting credentials for someone else. Who can ask is everything in the last row of §2.

The invariants below are the plan's contract. Every one has a test in §11.

| # | Invariant |
|---|---|
| **I1 Material** | A signature is produced only with the `AgentKey` object that is served for that key at the moment of signing. An unloaded, replaced (`serve()` over a loaded id — even with identical public bytes) or disposed key object refuses to sign, whoever holds it |
| **I2 Generation** | An answer opens a window only for the key generation it was asked about. A key re-loaded under the same entity id is a new generation and inherits nothing |
| **I3 Fence** | Every revocation moves a fence, and an answer given across a fence opens no window. The fences are **per key** (unload, re-load, *Ask for Every Use Again*) and **one lock epoch** (any lock) — a revocation on key A never touches an answer for key B. What crosses a fence, checked in this order: unload/re-load (`stale-key`) → **refuse**; the row button (`fenced-key`) → this ONE signature is allowed (the person's own explicit answer to it), no window, *"Ask for Every Use Again was used while you were choosing — this signature was allowed once; no window was opened."*; a lock (`fenced-lock`) → the same, saying the vault locked (the per-use prompt works while locked, O3) |
| **I4 Origin** | A window exists only because a person picked a timed answer in this window's process. It is memory-only, per key, per scope, with `grantedAt ≤ now < until` and `until − grantedAt ≤ 12 h`. A clock moved backwards covers nothing granted "in the future". **Two clocks, and both must permit:** the wall clock (`grantedAt ≤ now < until`) AND a monotonic clock (`0 ≤ nowMono − grantedAtMono < until − grantedAt`, from an injected source, `performance.now()` in production), so a wall clock set back after the grant cannot stretch a window. Where the monotonic clock pauses in sleep, the wall clock still ends the window |
| **I5 Scope** | A 10-minute window covers every purpose (today's meaning, kept). A longer window covers only a request the classifier fully parses as an SSH login for **this** key (§6.1, C3) |
| **I6 Lock** | Any `VaultKeys.lock()` ends every window before it returns. No long window is granted while locked or while auto-lock is off. Setting auto-lock to 0 ends every `login` window at once (the row says so), and the gate checks again at use as a backstop — one function, `scopesFor`, answers both. Unlock re-arms nothing |
| **I7 Presence** | Silent signatures never count as presence and never postpone the auto-lock (already true; kept as a test) |
| **I8 Monotone** | *Allow once*, *Deny*, a dismissal never lengthen or shorten a window. Two timed grants of one scope keep the later deadline |
| **I9 One prompt** | At most one consent turn per key is open, and at most three requests wait behind it — a fourth is refused at once and never prompts later. A request a window already covers never joins the queue; a waiting request re-checks the window when its turn starts; a request whose client has gone (socket closed) leaves the queue and is never shown; *Allow once* authorises only its own signature. The prompt states the time a waiting request really has left |
| **I10 Record** | Every silent signature writes a log line naming the window that allowed it (scope, until when) |

## 6. Design

### 6.1 The window book — `allowWindows.ts` (new, pure, no `vscode`)

The bare `Map<string, number>` (`sshAgentManager.ts:77`) had three operations and no rules; D1, D2 and D3 are each a
rule it never had. It becomes an immutable value with pure functions, so "did anything change?" is a reference check
and the tree repaints only on a real change.

```ts
export type WindowScope = 'all' | 'login';                 // 10-minute window | a longer, login-only window
export interface KeyRef { readonly entityId: string; readonly generation: number }
export interface AskTicket extends KeyRef { readonly keyFence: number; readonly lockEpoch: number } // when a turn starts
export interface OpenWindow { readonly generation: number; readonly grantedAt: number; readonly grantedAtMono: number; readonly until: number }
export interface AllowWindows {
  readonly lockEpoch: number;                               // moved by any lock (I3)
  readonly keyFences: ReadonlyMap<string, number>;          // moved per key by unload, re-load, the row button (I3)
  readonly open: ReadonlyMap<string, Readonly<Partial<Record<WindowScope, OpenWindow>>>>;
}
export const NO_WINDOWS: AllowWindows;
export const MAX_WINDOW_MS: Readonly<Record<WindowScope, number>> =
  { all: 10 * 60_000, login: 12 * 3_600_000 };              // per scope: an `all` window can never be longer than ten
                                                            // minutes, whatever it is handed. `login` is deliberately
                                                            // NOT `ASK_WINDOW_MS`: the two 12-hour figures are two
                                                            // decisions; a test pins them equal so changing one is a
                                                            // conscious change to both
export type GrantOutcome = 'opened' | 'kept-later' | 'stale-key' | 'fenced-key' | 'fenced-lock';
export function grantWindow(book, ticket, scope, currentGeneration: number | undefined, grantedAt, grantedAtMono, until):
  { book: AllowWindows; outcome: GrantOutcome };            // checked in I3's order: stale-key (generation moved) →
                                                            // fenced-key → fenced-lock · until clamped to grantedAt +
                                                            // MAX_WINDOW_MS[scope] · later deadline kept within scope
export function scopesFor(purposeIsLogin: boolean, autoLockMinutes: number): readonly WindowScope[];
                                                            // ['all','login'] | ['all'] — the ONE answer to "which windows
                                                            // may cover this request", used by the gate AND the row (I6)
export function windowCovers(book, key: KeyRef, scopes: readonly WindowScope[], now, nowMono): OpenWindow | undefined;
                                                            // both clocks must permit (I4)
export function windowsFor(book, key: KeyRef, scopes: readonly WindowScope[], now, nowMono): Readonly<Partial<Record<WindowScope, OpenWindow>>>;
export function endWindows(book, entityId): AllowWindows;  // the row button: that key's fence + 1
export function endLoginWindows(book): AllowWindows;        // auto-lock set to 0: every `login` window ends
export function endAllWindows(book): AllowWindows;          // any lock: lockEpoch + 1, empty
export function forgetKey(book, entityId): AllowWindows;    // unload / re-load: that key's fence + 1
export function withoutExpired(book, now, nowMono): AllowWindows;
export function nextExpiry(book, now): number | undefined;
```

`windowCovers` uses the existing `withinAllowWindow` (`agentConsent.ts:80-82`) plus `grantedAt <= now` (I4) — the same
guard `mcpConsentPolicy.ts:140` already has — and, as a second and independent check, the monotonic elapsed time
`nowMono − grantedAtMono` against the window's length `until − grantedAt` (I4; coai gate finding G0 on the E1 stories). `withinAllowWindow`'s signature does not change, so `mcpConsentPolicy.ts:123`
is untouched. `allowWindows.ts` imports `withinAllowWindow` from `agentConsent.ts`, and `agentConsent.ts` needs only the
TYPE `WindowScope` back — an `import type`, so there is no runtime cycle.

**Not the "third instance".** `agentConsent.ts:22-29` keeps the SSH deadline and the MCP stamp apart "until there is a
third instance to learn from". #197 widens the SAME instance — still a deadline fixed at the click, per key, in memory,
in one window. The MCP stamp keeps every property that made it different (persisted, read fresh, a START, fenced by a
timestamp because another window can write the store). The paragraph is updated to record that #197 was considered and
is not the third instance; `withinAllowWindow` stays the one shared piece.

### 6.2 The decision — `agentConsent.ts` (widened, not replaced)

Reuse-first move 1: the existing pure module grows the table.

```ts
export const ALLOW_LONGER = 'Allow longer…';
export const SIGNING_BUTTONS = [ALLOW_ONCE, ALLOW_WINDOW, ALLOW_LONGER, DENY] as const;   // dialog order; Once first.
                                         // E1 introduces it with today's three labels (the help test of S9 loops over
                                         // it); E3 inserts ALLOW_LONGER, and that test goes red again by itself
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
| Allow longer… → pick N h, but `longerOffer` says no at the pick | yes | yes | — (allowed once, told) |
| Allow longer… → Escape on the list | no | **yes** (a person clicked *Allow longer…* and then refused; same as Deny) | — |
| Allow longer… → the bound runs out on the list | no | no | — |

**Eligibility is checked twice.** `longerOffer` (login purpose, unlocked, auto-lock on) is asked when the list is
offered AND again when the pick is applied: the vault can lock, or auto-lock can be set to 0, while the list is open.
If the pick is no longer eligible, this signature is allowed once and no window opens, with one information message
in the shape of the fence messages (I3): *"{why} — this signature was allowed once; no window was opened."*

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
- For host-bound, the purpose carries the server host key's `SHA256:` fingerprint, and the prompt names it on its own
  line: *This login is for the server whose host key is ED25519 SHA256:…*. The agent does not verify it — sshd does:
  it compares the host key in the packet with its own and signs over its own (`auth2-pubkey.c`,
  `"packet contained wrong host key"`), so a signature over host key H is accepted only by the server holding H. That
  is more than the prompt could ever say, and it is what the person needs to decide.

`SignPurpose`'s `ssh-login` variant gains `hostKey?: string`; `describePurpose` (`:250-262`) gains one branch.

### 6.4 One prompt per key — `consentTurns.ts` (new, pure)

```ts
export type TurnOutcome<T> = { kind: 'answered'; value: T } | { kind: 'timed-out' } | { kind: 'gone' } | { kind: 'full' };
export class ConsentTurns {
  constructor(boundMs: number, maxWaiting = 3);
  /** One turn per key at a time. The bound runs from ARRIVAL and covers waiting and both steps — the promise of
   *  CONSENT_TIMEOUT_MS is that an unanswered request does not stay live. `request` is the request's own signal,
   *  aborted when its client's socket closes: a gone request leaves the queue and its turn never runs. More than
   *  `maxWaiting` requests already waiting → `full` at once, never shown later. The work receives the turn's signal
   *  (bound OR client gone) and the time left on the bound. */
  take<T>(key: string, request: AbortSignal, work: (turn: AbortSignal, leftMs: number) => Promise<T>): Promise<TurnOutcome<T>>;
}
```

**Reuse, not a third queue.** `OneUseLane.run` (`oneUseLane.ts:70-84`) is already a per-key queue that advances on
failure as well as success and deletes a key whose queue is empty; its keyed-tail half is extracted into
`keyedQueue.ts` and used by both (reuse-first move 2 — `OneUseLane` keeps its own `afterTheQueue`). That also answers
growth: an idle key holds nothing. A request that leaves when its client goes follows `sharedPrompt.ts:1-16`'s rule
(*"each waiter joins with its own request's signal and detaches the moment it fires"*), which is the broker's lesson
from `PLAN_wsl_bridge_outlives_its_client.md` §5.7. `withTimeout` (`withTimeout.ts:20`) bounds the wait.

`withTimeout` only stops the WAITING, not the work, so the work itself is fenced: every step after an `await` in the
prompt checks the turn's signal before it opens anything, and the manager applies an answer only from an
`answered` outcome — a late continuation can neither open the list nor write a window. The answer is **not** shared
between waiters the way the broker shares one (`brokerConsent.ts:63` with `sharedPrompt.ts:36-106`), because *Allow
once* must authorise only its own signature (I9).

**A covered request never queues.** The manager checks the book BEFORE `take` (as `sshAgentManager.ts:270` does
today) and again when the turn starts. Without the first check, a login that an open window covers would wait behind
an unrelated Git-signature prompt for the same key, and could even time out while covered.

**The server's half.** `sshAgentServer.ts` has no per-request signal today (`:113` is `void this.handle(...)`; a closed
socket only skips the write). Each connection gets an `AbortController` aborted on the socket's `close`, and
`confirm(key, purpose, data, signal)` carries it.

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

The bound sentence states the time this request really has left (`leftMs` from the turn), not the constant: a request
that waited four minutes behind another prompt says *"Unanswered, it is refused after 1 minute."*

**A click on a stale modal is told.** VS Code cannot close a modal, so after the bound the old modal stays and can
still be clicked. When a modal (or the list) resolves after its turn ended, nothing is signed and nothing is opened —
as today — and the person now sees one information message: *"That signing request had already been refused — it
waited longer than {bound}, or its program had gone. Nothing was signed."* Today the click is silently ignored.

### 6.6 The manager — `sshAgentManager.ts`

- `LoadedKey` gains `generation` and a `revoked` flag. `serve()` over an id that is already loaded first **revokes the
  earlier `LoadedKey`** (its `sign` refuses from then on — I1, and the only way S3's re-load test can pass, because the
  manager tests run against a stub server), then sets `++this.generations` and calls `forgetKey` (D1). Revocation is by
  object, so a replacement with identical public bytes revokes the old object too.
- `windows: AllowWindows = NO_WINDOWS` replaces `allowedUntil`; `turns = new ConsentTurns(consentTimeoutMs)`.
- `confirm` (`:263-285`, at the complexity limit today) splits into methods of complexity ≤ 4:
  `confirm` (read generation at arrival — the server's hand-off to `confirm` is synchronous, `sshAgentServer.ts:133-145`,
  so it is the generation of the object the server holds; check the book with `scopesFor(...)` — covered → allow,
  no queue) → `turns.take` (`full` / `gone` / `timed-out` → refuse, one log line each, a burst of `full` coalesced to
  one line) → `coveredOrAsk` (re-check; else ask) → `settle` (decision, presence, `longerOffer` re-checked for a `login` pick — not eligible → once, no window, told — then
  `openWindow`, the log line of I10) →
  `openWindow` (`grantWindow`, outcomes in I3's order: `stale-key` → refuse; `fenced-key` / `fenced-lock` → allow this
  signature once, open nothing, one information message naming which fence).
- In E1 the only fences that exist are unload and re-load, so the only crossing outcome E1 can produce is
  `stale-key` → refuse; `fenced-key` arrives with the row button (E2) and `fenced-lock` with the lock (E2).
- New public methods: `endWindows(entityId): boolean` (the row button), `endAllWindows(reason): void` (the lock),
  `endLoginWindows(reason): void` (auto-lock set to 0), `windowsFor(entityId)` (the row, through `scopesFor`, so a
  login window the gate would not honour is never shown as open).
- Settable hooks with no-op defaults, the `provider.isBridged` shape (`treeDataProvider.ts:188`), so no constructor
  call changes: `onWindowsChanged`, `lockedNow: () => boolean`, `autoLockMinutes: () => number`.
- The expiry timer is armed for `min(nextExpiry, 5 minutes)` and re-armed each time it fires: a timer that a sleeping
  machine delayed leaves the row stale for at most five minutes after wake. The gate itself reads the clock, so a late
  timer can delay a repaint, never a refusal. It is `unref`'d — `withTimeout.ts:9-15` says to do that only when
  something else keeps the process alive on purpose, and the extension host does; the tests drive it with
  `t.mock.timers` (`secretClipboard.test.ts:47`) and never wait on a real one.
- `durationText` (`:362-370`) moves to `durationText.ts` and learns whole hours ("1 hour", "4 hours"); the bound
  sentence and the list labels use it.

**The two architects' comparison (owner chose clean):** minimal ≈ +170 production / +450 test lines, all inside the
manager, no one-prompt-per-key; clean ≈ +480 / +700. The size limits force the wiring module, the test split and the
line-neutral tree edit on BOTH, so the real difference is ~300 lines of rules made testable without `vscode`.

### 6.7 D2's other half — `sshAgentServer.ts`

After the `await` in `confirmAndSign` (`:144-147`): sign only if `this.options.keys().includes(key)`; otherwise log
`REFUSED … the key was removed while its prompt was open` and return `encodeFailure()`. Belt and braces with I2: the
server is the thing that owns the material path. `LoadedKey.sign` additionally refuses after `unload`, replacement or
`dispose` through the `revoked` flag (§6.6), so a future caller that forgets the check still cannot sign (I1). The
per-connection `AbortSignal` of §6.4 is created here.

### 6.8 The lock reaches the agent — `vaultKeys.ts` + `sshAgentWiring.ts`

- `VaultKeys` gains a **multicast** event, `onDidLock: vscode.Event<void>` from a `vscode.EventEmitter<void>`, fired as
  the last statement of `lock()` (`:178-187`). Not a settable single callback like `loginKeys` (`:112-120`): a second
  subsystem assigning it later would silently replace the SSH agent's handler and leave windows open after a lock —
  the one failure this hook exists to prevent. The test stub already has a working `EventEmitter`
  (`vscodeStub.ts:137-144`). All three lock roads pass through `lock()`; `lockNow` alone would miss corporate
  deactivation.
- `extension.ts` is frozen at 1025 lines by the size ratchet (`.size-baseline.json`, `sizeRatchet.ts`), so the SSH
  wiring at `extension.ts:566-587` moves to `sshAgentWiring.ts` (`wireSshAgent({...}): SshAgentManager`), which also
  sets `onWindowsChanged → provider.refresh()`, the lock link through ONE named function
  `connectAgentToLock(vaultKeys, sshAgent): vscode.Disposable` (`vaultKeys.onDidLock → endAllWindows('the vaults were
  locked')`, the subscription pushed into `context.subscriptions`), and a `workspace.onDidChangeConfiguration` listener
  that calls `endLoginWindows` when `credSshManager.autoLockMinutes` becomes 0 (the precedent listener is
  `extension.ts:134`) — named
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
that signs and authenticates in one go; or allow SSH logins with this key for longer, up to 12 hours — logins include
git push and fetch over SSH.

While a window is open, any process running as you that reaches this agent — an AI agent in a terminal, a script, WSL,
a host you forwarded the agent to — uses this key without asking. Locking the vault ends every window, and so does
"Ask for Every Use Again" on the key's row.

Unanswered, it is refused after {left}.
```

`{left}` is the time this request really has left (§6.5) — `durationText(leftMs)`; for a request that did not wait it
is the full bound, so the existing assertion *"Unanswered, it is refused after 5 minutes."* stays true.

When `longerOffer` says no, the second paragraph's last clause is replaced by its `why`, and the button is absent:
*"Longer windows cover SSH logins only."* · *"Longer windows need the vault unlocked — a lock ends them."* ·
*"Longer windows need idle auto-lock: credSshManager.autoLockMinutes is 0."*

**The list** — title *How long may "{name}" log in without asking?*, placeholder *SSH logins only, git push and fetch
included. Escape refuses this signature.*, items *1 hour — until 12:55, or until the vault locks (idle auto-lock: 60 min)* … *12 hours — until 23:55
…*. The end time is computed when the list opens; the window starts at the pick, so the real end can be later by at
most the time the list stayed open. The row and the log show the exact deadline.

**The row** — *signs without asking until 12:10* (10-minute window) · *logins without asking until 18:40* (long window).

**The log** — *allowed without asking: login window of "{name}" until 18:40 (granted 10:40)* (I10).

**The information messages** — across a fence (I3): *"The vault locked while you were choosing — this signature was
allowed once; no window was opened."* / *"Ask for Every Use Again was used while you were choosing — this signature was
allowed once; no window was opened."* · a stale modal (§6.5): *"That signing request had already been refused — it
waited longer than {bound}, or its program had gone. Nothing was signed."* · auto-lock set to 0 with a login window
open: *"Idle auto-lock is off, so the login windows of {n} key(s) were ended — a long window needs a lock to end it."*

## 8. Growth budget

Nothing is persisted. The window book holds at most two entries per loaded key; ten loaded keys are twenty small
objects. Entries leave on expiry, unload, re-load, lock, the row button and dispose; a window reload drops everything,
which is the safe direction. `keyFences` holds one number per key ever loaded in this window's life (a few dozen at
most; dropped on dispose). `ConsentTurns` holds, per key, at most one open turn and **three** waiting requests — a
fourth is refused at once — so ten loaded keys hold at most forty pending requests, each gone within the 5-minute
bound or when its client closes; a key whose queue is empty holds nothing (`keyedQueue.ts`, the `OneUseLane` rule).
One timer at a time, never longer than five minutes.

## 9. Boundaries with other plans

All four are IMPLEMENTED records in `research/`; each gets a dated pointer line, not a rewrite.

| Item | Built by | The other plan's part |
|---|---|---|
| The window starts at the click | `PLAN_ssh_sign_prompt_time.md` (rule) | this plan keeps it for every length: the final click is the pick |
| One bound per prompt, late click signs nothing | `PLAN_ssh_sign_prompt_timeout.md` | this plan extends the bound over the list and the queue wait |
| The MCP 12-hour policy | `PLAN_agent_consent_policy.md` (D1: not the SSH dialog) | unchanged; this plan shares only `withinAllowWindow` and pins the 12-hour ceiling equal by test |
| "The worst a process inside WSL can do is *ask*" | `PLAN_wsl_agent_relay.md:91` | false once a window is open; rewritten by this plan (§12) |

Disjoint: no other plan in `todo/` touches the SSH agent today (checked: `todo/README.md` table, 2026-10-20).

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
  whatever the answer*; *a key re-loaded while its prompt is open signs with neither the old nor the new material*
  (the server half). RED (manager, through the CAPTURED `LoadedKey.sign`, because the manager tests run a stub server,
  `sshAgentManager.test.ts:81-108`): *an answer after unload opens no window for the key loaded next*; *a replaced key
  object refuses to sign, even with identical public bytes*. Fix: §6.7, revoke-on-replace and the `revoked` flag
  (§6.6), the generation. Also introduces `SIGNING_BUTTONS` with today's three labels (§6.2) for S9's test.
- **S4 — the book's rules (pure).** *a shorter grant never shortens a longer one of the same scope* (D3's rule —
  shown here, in the pure module; on `origin/main` it cannot be red, §3); *a revocation on one key never fences an
  answer for another*; *unload/re-load wins over every other fence (stale-key first)*;
  *no grant reaches past twelve hours, whatever it is handed*; *an `all` window never reaches past ten minutes, whatever
  it is handed*; *a revocation fences an answer even when no window was open*; *a window granted in the future covers nothing*;
  *a clock moved forward ends a window early, never extends it*; *a login window never covers a Git signature or an
  unrecognised request*; *a 10-minute window still covers every purpose*.
- **S5 — the lock.** RED: *every lock ends the SSH windows* — a real `VaultKeys` and a real manager joined by
  `connectAgentToLock`, locked once by `lock()` and once by `evictAndLock(vaultKeys)(account)`; *a second lock listener
  does not displace the agent's*; *after a lock the next signature asks*; *a prompt answered across a lock signs once
  and opens no window, and says the vault locked*; *unlocking re-arms nothing*. Fix: §6.8, the lock epoch.
- **S6 — one prompt per key.** Pure (`consentTurns.test`, `keyedQueue.test`): *a second request for the same key
  waits*; *different keys do not wait*; *a request whose bound ran out while queued is never shown*; *an unanswered
  modal does not wedge the key*; *a fourth waiting request is refused at once and never shown later*; *a request whose
  client has gone leaves the queue and is never shown*; *an idle key holds nothing* (and `OneUseLane`'s own suite stays
  green on the extracted queue). Manager: *a request a window covers never waits behind an open prompt*; *a window
  opened by the first prompt covers the waiting request without a prompt*; *Allow once authorises only its own
  signature — the waiting request still asks*; *a request that waited says the time it really has left*; *a click on a
  modal whose turn ended signs nothing and says so*. Server: *a closed client connection aborts its request's signal*.
- **S7 — the longer windows.** Pure: *Allow longer… authorises nothing by itself*; *each longer window arms exactly its
  duration*; *Escape on the list refuses and counts as presence*; *an unrecognised pick allows once and arms nothing*;
  *the end time reads local HH:MM and says tomorrow across midnight* (`requestTime.ts`, `clockUntil`); *twelve hours is
  the ceiling — equal to the MCP ask window*. Manager: *Allow longer… then 4 hours lets logins through for four hours
  from the pick*; *the five-minute bound covers both steps — an open list is closed at the bound and refuses*; *a late
  Allow longer… opens no list*; *Allow once is the first button*; *the list is not offered for a Git signature, while
  locked, or with auto-lock off — and the prompt says why*; *setting auto-lock to 0 ends every login window, and the
  row stops showing it*; *the gate and the row answer "which windows count" through the same `scopesFor`*; *"1 hour"
  answered after "12 hours" keeps twelve* (D3 with two lengths — new behaviour, not a RED); *a silent signature is not
  presence*. Fix: §6.2, §6.5, §6.6, `durationText.ts`.
- **S8 — the row and the button.** `treeRowText`: *a key row with an open window says until when it signs without
  asking*; *`:signwindow` only while a window is open*; *the menu offers Ask for Every Use Again exactly while a window
  is open* (the `when` regex read from `package.json`). Manager: *Ask for Every Use Again ends the window and keeps the
  key loaded*; *an answer given across Ask for Every Use Again signs once and opens no window*; *the row is told to
  repaint on grant, expiry, lock, button and unload*; *the expiry timer is never armed for more than five minutes*
  (`t.mock.timers`, precedent `secretClipboard.test.ts:47`). `helpCoverage.test.ts` goes red when the command is added.
  Fix: §6.9, the wiring.
- **S9 — the words (D5).** RED: *the help names every answer the signing prompt offers* — loops over
  `SIGNING_BUTTONS` imported from the code. Written in E1, where it is red because no help file names *Allow once* or
  *Allow for 10 minutes* (`helpEn.ts` names neither); it goes red again by itself in E3 when *Allow longer…* joins the
  list. RED: *the prompt says any process signs without asking while a window is open, and what ends it*. Fix: every
  text in D5's row, in the wording true for each release (E1, E2, E3); the CLI sentence at `CommandLine.cs:208` ships
  with the next `cli-v` release and says so.
- **S10 — the scenario and the docs.** `scripts/ssh-agent-itest.cjs` (stub gains `showQuickPick` +
  `CancellationTokenSource`, constructor unchanged; temp folder renamed `testsToDelete-agent-itest-…`):
  1. *one 1-hour pick, then two real host-bound-shaped login signatures with one prompt; after a real
     `VaultKeys.lock()` through `connectAgentToLock` the next one prompts; a real `ssh-keygen -Y sign` inside the login
     window still prompts*;
  2. **a live OpenSSH login** (POSIX): a user-mode `sshd` on `127.0.0.1` and a free port, with a fresh host key and an
     `authorized_keys` holding the agent key, in a `testsToDelete-sshd-<id>` folder; `ssh -o IdentityAgent=<agent socket>`
     through the REAL manager; the prompt the stub receives names *an SSH login* and *the server whose host key is* the fingerprint equal to
     that fresh host key's fingerprint. This is the CI evidence for D6 that a hand-built fixture cannot give — the bytes
     come from the real OpenSSH client. Where `sshd` is missing the section says so and skips **locally**; in CI
     (`CI=true`) a missing `sshd` fails the job, because a check that skips on the runner proves nothing. The sshd
     process is killed by its own pid in `finally`.

  `research/module_tests.md` row. Docs per §12.

## 11. Test plan

| Guarantee (invariant) | Where | RED today? |
|---|---|---|
| A host-bound login is a login, named by host key (D6) | `sshAgentProtocol.test.ts` | yes — described as unrecognised |
| A malformed or foreign-key userauth is unrecognised (I5) | `sshAgentProtocol.test.ts` | yes — prefix-only parse |
| Re-adding a loaded key starts with no window (D1, I2) | `sshAgentManager.test.ts` | yes |
| A removed key does not sign, whatever the answer (D2, I1) | `sshAgentServer.test.ts` | yes — it signs |
| A replaced key object refuses to sign, identical bytes included (D2, I1) | `sshAgentServer.test.ts`, manager (captured `sign`) | yes — the old object signs |
| An answer across unload/re-load opens nothing (D2, I2, I3) | `sshAgentManager.test.ts` | yes |
| Fences are per key; stale-key wins; row button and lock allow once, open nothing (I3) | `allowWindows.test.ts`, manager | new |
| The later deadline wins within a scope (D3, I8) | `allowWindows.test.ts` (E1); manager with two lengths (E3) | cannot be red on `origin/main` (§3) — new module, then new behaviour |
| Ceiling, future grant, clock forward (I4) | `allowWindows.test.ts` | new module |
| A login window never covers SSHSIG/unknown; a 10-minute window covers all (I5) | `allowWindows.test.ts`, manager | new behaviour |
| Every lock ends every window, through the real `onDidLock` seam; a second listener does not displace it; across a lock: once, no window; unlock re-arms nothing (I6, I3) | `vaultKeysLock.test.ts`, manager | yes — lock does nothing |
| No long window while locked / auto-lock off; auto-lock → 0 ends login windows; gate and row share `scopesFor` (I6) | `agentConsent.test.ts`, `allowWindows.test.ts`, manager | new behaviour |
| Silent signatures are not presence (I7) | manager | green — kept as a guard |
| One turn per key; ≤ 3 waiting; covered requests never wait; gone clients leave; Allow once only for its own signature; an unanswered modal never wedges (I9) | `consentTurns.test.ts`, `keyedQueue.test.ts`, manager, server | new |
| Both steps under one bound; the bound sentence states the time left; a late click opens nothing and is told | manager | new |
| The row shows the window, the button ends it, repaint on every change, timer ≤ 5 min (O4) | `treeRowText.test.ts`, manager | new |
| Every silent signature names its window (I10) | manager | new |
| Help and prompt texts tell the truth (D5, O6) | help test, manager | yes |
| End to end with the real manager, `ssh-keygen` and a real `VaultKeys` lock | `ssh-agent-itest.cjs` (CI `itest:ssh-agent`) | new scenario |
| A live OpenSSH login through the agent is named as a host-bound login (D6) | `ssh-agent-itest.cjs`, POSIX, fails in CI if `sshd` is missing | yes — the prompt says *unrecognised* |

Thin wiring that cannot be unit-tested (`sshAgentWiring.ts` assignments beyond `connectAgentToLock`) is covered by the
scenario and said so in the summary. **Measured before the PR is opened, by hand, once each:** M1 — a real login
through the agent **from Windows** to an OpenSSH ≥ 8.9 server shows the host-bound prompt (the CI scenario covers
POSIX; before the fix: the log line `unrecognised signing request`); M2 — the
QuickPick with `ignoreFocusOut: true` survives a second modal raised over it; M3 — the four-button modal in
`window.dialogStyle: custom` at a normal window width shows every button. Results go into the PR and the promotion
record.

## 12. Documents to update

- `research/module_extension.md` — the SSH agent section and the table row at `:4841`; the new modules in its Mermaid
  diagram; the `onDidLock` edge; the `:signwindow` token; the false "a third lock path cannot forget a step" sentence
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
| D4 (delete/edit does not unload) | touches tree, edit and sync paths | #257 |
| Corporate deactivation closing forms | a separate gap in `evictAndLock` | #258 |
| A warning on the `-A` checkbox | separate surface; the prompt names forwarded hosts meanwhile | #259 |
| A prompt budget against sequential floods | the queue is capped here (three waiting); a per-minute budget for prompts that are each answered is its own design | #260 |
| Unifying with the MCP stamp | not the third instance (§6.1) | — |
| Remembering the last chosen length | would make yesterday's exception today's Enter key | O5 |
| Inspecting the packaged VSIX for a marker | `vsce package` always runs `vscode:prepublish` = `npm run bundle` from source, and the release builds from a clean CI checkout (`release.yml:783`); a stale artefact cannot reach users on that road | gate finding rejected (§16) |

## 14. Risks and what is not verified

- **A long window usually ends after an hour** with default settings (O11). Said in the list; the person who wants a
  real 8 hours raises `autoLockMinutes`. If people find that confusing, the cure is a sentence, not a weaker lock.
- **The stale modal**: when the bound runs out, the queue moves on but VS Code keeps the old modal on screen (it cannot
  close one). A click on it signs nothing — already true today and recorded in `PLAN_ssh_sign_prompt_timeout.md`'s open
  tail — and from E2 the person is told so (§6.5); with one-prompt-per-key a second modal may still appear beside a
  stale one.
- **A user-mode `sshd` on the CI runner** (S10.2) is new to this repository's CI; if the runner image lacks it the job
  installs `openssh-server` first, and the step names that cost.
- **Unverified until M1–M3** (§11). The named-pipe default DACL is asserted by the repository's docs, not re-measured
  here.

## 15. Definition of Done

- [ ] Every story's RED was observed on unfixed code and is quoted in the PR beside its GREEN.
- [ ] `npm run typecheck`, `npm run lint`, `npm run ratchet` and `npm test` in `src_vs_code` are green; `.size-baseline.json`
      lowered for `extension.ts`; `treeDataProvider.ts` still ≤ 800 lines.
- [ ] `npm run itest:ssh-agent` green locally and in CI, with the new scenario — the live OpenSSH login section RUN
      (not skipped) in CI.
- [ ] M1–M3 measured and recorded.
- [ ] Every invariant I1–I10 has its test (§11), named after the guarantee.
- [ ] Every text in D5's row tells the truth in all five help languages; `helpCoverage` green.
- [ ] Docs per §12; Mermaid diagrams render.
- [x] The four follow-up issues of §13 are filed and linked here (#257, #258, #259, #260 — 2026-10-20, owner-approved).
- [ ] Temp folders created by the touched tests carry `testsToDelete-`.
- [ ] coai gate: `review_plan` reached `proceed` before code; `review_code` ran on the finished branch; every finding
      resolved; verdicts and reviewer counts reported.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; on promotion the plan moves to
      `research/` with its deviations recorded.
- [ ] Extension release: the `CHANGELOG` section exists for the version release-please proposes (`feat` → minor);
      `package.json` and `package-lock.json` agree (`lockfileVersion.test.ts`).

## 16. Review record

**Plan gate (coai `review_plan`, 2026-10-20, round 1 on `ce408e77`).** Verdict **`proceed`**; **all 3 reviewers
answered** (codex, kimi, and a third chat provider; kimi ran on 2.2.0, a version coai has not measured — coai warned
and ran it anyway). 11 findings, 5 gating (threshold 6). Resolved: **10 accepted, 1 rejected.**

| # | Finding | Decision |
|---|---|---|
| 0 | DoD does not inspect the packaged VSIX | **rejected** — `vsce package` always runs `vscode:prepublish` (`npm run bundle`, from source) and the release builds from a clean checkout (`release.yml:783`); §13 |
| 1, 4 | The per-key queue is unbounded in count | accepted — at most three waiting, a fourth refused at once (§6.4, §8, I9) |
| 2 | D6 rests on hand-built fixtures and a manual measurement | accepted — a live OpenSSH login in the CI scenario, failing the job if `sshd` is missing (S10.2) |
| 3 | The outcome of an answer across *Ask for Every Use Again* is undefined | accepted — `fenced-key`: once, no window, told (I3) |
| 5 | E1's help test needs `SIGNING_BUTTONS`, defined in E3's scope | accepted — E1 introduces it with today's three labels (§6.2, S3) |
| 6 | The modal promises five minutes to a request that already waited | accepted — the sentence states the time left (§6.5, §7) |
| 7 | The row would show a login window the gate no longer honours | accepted — auto-lock → 0 ends login windows; gate and row share `scopesFor` (I6) |
| 8 | A settable single `onLocked` callback can be silently overwritten | accepted — a multicast `onDidLock` event (§6.8) |
| 9 | A click on a stale modal fails without a word | accepted — one information message (§6.5) |
| 10 | A 12-hour timer fires late after sleep | accepted — the timer is never armed for more than five minutes (§6.6) |

**Own review (Opus, run at the same time on `ce408e77`).** Verdict *ready after fixes*; all twelve findings verified in
the code and folded in: one global epoch would have fenced unrelated keys and told the person the vault locked when it
had not — fences are now per key plus one lock epoch, with an order (I3, §6.1); a replaced key object was never revoked,
so S3's re-load test could not pass against the stub server — `serve()` revokes the earlier object (§6.6); the D3 RED
could only fail for the wrong reason — D3 is shown in the pure book and then as new behaviour (§3, S4, S7); a covered
request would have waited behind an unrelated prompt — the book is checked before the queue (§6.4); a gone client would
still be prompted — a per-connection signal, following `sharedPrompt.ts` (§6.4); the auto-lock check at use had no
place — `scopesFor` (§6.1); four wrong citations corrected (`brokerConsent.ts:63` + `sharedPrompt.ts:36-106`,
`sshAgentProtocol.ts:207-209`, the meaning of `withTimeout.ts:9-15`, the import cycle); the D5 list gained
`helpEn.ts:184` and `:300`; the queue reuses `OneUseLane`'s keyed tail instead of a third queue; the ledger slot after
the dash is left for stories; "logins include git push and fetch" is said in the texts.

**Operator commands applied** (from the gate's reply): epics of three to four stories — E1's S0 is folded into its
first story when E1's stories document is written; the epic split by Fable after the question consultant was asked
what matters (§Epics); from here on, every `review_plan` / `review_code` call names `plan:
todo/PLAN_ssh_allow_longer_windows.md` and `epic: k/3`; questions after `proceed` go to the consultants first.

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
- **Scope.** S0–S4 (S0 folds into the first story — the gate's limit is four stories per epic), plus S10.2, the live
  OpenSSH login in the CI scenario, because it is the CI evidence for D6, which E1 ships. Design §6.1 (the whole book,
  `login` scope defined but no answer grants it yet), §6.3, §6.7, `SIGNING_BUTTONS` with today's three labels (§6.2),
  and from §6.6 only `generation`, revoke-on-replace and the `revoked` flag, `forgetKey` in `serve()`, `windows`
  replacing `allowedUntil`, the `confirm` split and the I10 log line. Invariants I1, I2, I3 (unload / re-load / dispose
  — in E1 the only crossing outcome is `stale-key` → refuse), I4, I5 (the `all` rule, and the pure rule that a `login`
  window never covers SSHSIG or unknown), I8 (the book's rule), I10. Defects D1, D2, D6. Decisions O7, O8, O9 (as a
  rule in the book). The four follow-up issues of §13 are already filed (#257–#260, owner-approved 2026-10-20).
- **Depends on.** The plan gate (`review_plan` → `proceed`). Nothing else.
- **Done when.** Every story's RED is quoted beside its GREEN; the suite, typecheck, lint and ratchet are green; the
  live OpenSSH section of `itest:ssh-agent` runs (not skips) in CI; M1 is measured from Windows (a real host-bound login
  shows the new prompt). **Release:** `extension-v1.14.2` (`fix:` → patch). **Docs of
  this state:** `CHANGELOG` `### Fixed — D1, D2, D6` (plain words: *a key removed while its prompt was open no longer
  signs; re-adding a key starts it with no window; a login to a current OpenSSH server is named, with the server's host
  key*). The D5 sentences that are false **today** — *"every single use opens a dialog"*, *"(confirm every use)"*,
  *"every use asks first"* in the five help files, `package.json`, `agentDoors.ts`, `extension.ts:584`, `README.md`, the
  walkthrough, and the help article's title at `helpEn.ts:184` — are corrected to today's truth: *Allow once, or every
  use for 10 minutes*; a fix release must not ship a help text that lies about the release. S9's test (*the help names every answer the signing prompt offers*, looping over `SIGNING_BUTTONS`) is written here; it goes
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
- **Stories.** [PLAN_ssh_allow_longer_windows_E1.md](PLAN_ssh_allow_longer_windows_E1.md) — E1.1–E1.4.

### E2 — a window is visible, ends on any lock or from the row, and one prompt per key (feature release)

- **Goal.** Every `VaultKeys.lock()` ends every window; the key's row shows an open window and offers *Ask for Every
  Use Again*; at most one consent turn per key is open. Still only the 10-minute window — but everything that must exist
  before a longer one is offered.
- **Scope.** S5, S6, S8. Design §6.4 (the capped queue on `keyedQueue.ts`, the per-connection signal in the server,
  covered requests never queue), §6.5's stale-click message and time-left sentence, §6.8 (the multicast `onDidLock`),
  §6.9, and from §6.6 `turns`, the public methods, the hooks, the five-minute expiry timer, the crossing outcomes
  `fenced-key` and `fenced-lock` (allow once, no window, the information message naming the fence). Invariants I3 (the
  lock and the button fences), I6 (the lock half), I7 (kept as a guard), I9. Defect D3 (one prompt per key; the rule
  half shipped in E1). Decisions O3, O4, O5.
- **One-prompt-per-key is here, not in E1 — the reason.** (1) D3 cannot be shown RED on `origin/main` at all (§3); E1
  is the release in which every story is red on `origin/main`, and the rule half of D3 (I8, the later deadline) is
  pure and already in E1's S4. (2) `ConsentTurns` changes what a person sees: a second modal becomes a wait. That is a
  behaviour change, so it belongs in a minor release, not a patch. (3) Its abort fencing (§6.4) and the lock's epoch
  fencing are the two halves of one boundary — the row button must *beat an open prompt* (S8) — and E3's list step is
  what exercises the fencing in anger. Building the two fences together, in E2, keeps the boundary in one review.
- **What E1.2's security judgement left for E2** (Fable, 2026-10-20). (1) The membership check stays after EVERY
  await, the queue wait included: when a waiting request's turn starts it checks that its key object is still served
  and refuses WITHOUT prompting if not — a prompt for a dead object whose *Allow for 10 minutes* writes a window is
  the D2 window half again. (2) One method per meaning: the row button and the lock end WINDOWS and never revoke a
  key (it stays loaded, O3); only `serve`/`unload`/`dispose` revoke. (3) Frames on one socket are answered in
  completion order today (`void this.handle` per frame, `sshAgentServer.ts:112-114`); once requests can wait in a
  queue, a client that pipelines `REQUEST_IDENTITIES` behind a held `SIGN_REQUEST` would read the wrong reply — the
  queue answers each socket in request order. Test: *a pipelined identities request behind a held sign request is
  answered in order*. (OpenSSH does not pipeline; other clients may.)
- **Depends on.** E1 (the book with its fences, `generation`, revoke-on-replace).
- **Done when.** S5's evidence goes through the real seam: a real `VaultKeys` and a real manager joined by
  `connectAgentToLock`, locked once by `lock()` and once by `evictAndLock`, never a direct `endAllWindows` call. The
  `.size-baseline.json` is lowered for `extension.ts`; `treeDataProvider.ts` ≤ 800 lines; `helpCoverage` green for the
  new command. **Release:** `extension-v1.15.0` (`feat:` → minor). **Docs of this state:** `CHANGELOG`
  `### Changed — a lock ends every window`, `### Added — the row shows an open window; Ask for Every Use Again; one
  prompt per key`; the help files and `README.md` gain the row text and the command (10-minute wording only);
  `research/module_extension.md` (the `onDidLock` edge, `sshAgentWiring.ts`, `consentTurns.ts`, `keyedQueue.ts`, the `:signwindow` token,
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
  with auto-lock off; auto-lock → 0 ends login windows; `scopesFor` shared by gate and row), I8 at the manager with two
  lengths (new behaviour, not a RED), I10 for login windows. Defect D5 (final wording); D3's two-length behaviour. Decisions O1, O2, O5, O6, O9, O10, O11, O12.
  Eligibility at the pick (§6.2): `longerOffer` is checked when the list opens and again when the pick is applied. Test
  (manager): *a pick that is no longer eligible allows once and opens no window* — open the list with auto-lock on →
  set `autoLockMinutes` to 0 → pick 12 hours → this signature is allowed, no window opens, the message says why;
  restore auto-lock → the next login prompts.
  **SHA-1 RSA is never covered by a long window** (Fable's security judgement of E1.1, 2026-10-20). The classifier
  never sees the request's `flags`, and with no `SSH_AGENT_RSA_SHA2_*` flag an RSA key signs with SHA-1
  (`sshAgentSign.ts:43-45`). A SHA-1 chosen-prefix collision is practical, and a login-shaped message has free bytes to
  carry one, so a `login` window covers an RSA request only when it carries a SHA-2 flag; flags 0 on an RSA key asks.
  `scopesFor` takes the flags (or the caller excludes it — one place). Test (manager): *an RSA login with flags 0 is
  not covered by a login window*. Dropping SHA-1 signing entirely is the stronger fix and an owner decision (the
  comment at `sshAgentSign.ts:43-44` chose compatibility) — asked, not assumed.
  **Certificate logins** (an OpenSSH `…-cert-v01` certificate blob in the userauth, the plain key in the agent) are classified
  unknown since E1.1 — the safe direction, pinned by a test — so they never get a long window. Accepting them
  (compare only the certificate's embedded key fields to the signing key, exact end) is a follow-up story, not E3.
- **Depends on.** E2 (the row, the button, the lock, the turns). Nothing is offered before all three exist.
- **Done when.** M2 and M3 measured; `npm run itest:ssh-agent` green with the S10.1 scenario; every text in D5's row is
  true in all five languages; §15 fully ticked. **Release:** `extension-v1.16.0` (`feat:` → minor). The CLI sentence
  (`CommandLine.cs:208`) is edited here and ships only with the next `cli-v` release — `CHANGELOG` says so. **Docs of this
  state:** `CHANGELOG` `### Added — longer SSH windows for logins (#197)`; the modal, the list, the row and the log
  texts of §7; help, `README.md`, the walkthrough; `research/module_extension.md` (`sshSignPrompt.ts`, `durationText.ts`,
  the diagram), `module_tests.md`; the plan and its three stories documents promoted together with their deviations.
- **Cornerstone areas.** None new. The parser and the window rules are reused as shipped; E3's risk is in words and
  wiring, which Opus judges and the scenario proves.

The two cornerstone AREAS (named under E1 and E2): the window book's rules (`allowWindows.ts`), and the boundary
between the asynchronous prompt and the signing material (`sshAgentServer.ts` post-await check, revoke-on-replace and
the `revoked` closure, `consentTurns.ts` late continuations, the fence crossings). Opus marks one concrete story per area
when E1's and E2's stories documents are written, and fills the ledger's story slots in the same commit.

Cornerstones: 1 of 2 — E1.3 a window belongs to one generation of one key (the window book, `allowWindows.ts`)
