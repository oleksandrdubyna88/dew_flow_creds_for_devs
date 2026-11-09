# PLAN — E1.5 spec: the consent lifecycle — the place is the dialog's until a person's act

> Status: **built on PR #323 (§S5.12 *As built*); amended for epoch 8 on 2026-11-09 (§ *Amendment for epoch 8*, at the end): the parent's fix-forward F1-F8 is specified there and is built (§S5.12, epoch 8, with change 8.1 and the review fixes); every section it supersedes is marked in place with a pointer, and its old text stays.** What follows is the status before that amendment: **spec, 2026-11-09, by Fable, written as a security spec (authorisation: what frees the one dialog place) before its code; not built. Revised the same day after the coai plan gate:** the parent recorded change 7.1 (`bf7d2ff`: an Escape is its own outcome, `dismissed`, frees the place like a click and keeps today's wire answer), and the gate's accepted findings are designed and tested here — the late-answer line for a late click on `up`'s questions through a seam on the action context (Q-C, judged as satisfying the plan as written), a rejection-safe dialog promise, explicit timeout/answer arbitration with `keep` computed only for a live waiter, and listener hygiene in `untilGone` and `executed` (§S5.2, C11, C18-C21, M27-M33). Finding 5 (a guard against two dialogs on one local token) was rejected: it is §4.10's stated exception, and the visible outcome is M10's to measure.
> Story E1.5 of [PLAN_remote_bridge_scoped_E1.md](PLAN_remote_bridge_scoped_E1.md) (parent [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md)
> §4.10 whole: its table, *What changes in the code (E1.5)*, the follow-up contract per action, the residuals, *Accepted / Not established*; §7
> *The consent contract* and *Local doors at partial E1*; §9; `## Epics` E1). The parent is approved at epoch 7 and is not edited here. Where this
> spec found §4.10 silent, inexact against the code, or naming a thing the code cannot produce, the contract is **not** changed: the point is
> written under §S5.10 *Questions for the plan (not decided here)* with its evidence, and the spec builds what §4.10 says wherever it can be built.
> Depends on E1.4 (merged to `main` as `455567a`, PR #312). Shape and exactness follow the E1.4 spec ([PLAN_remote_bridge_scoped_E1_S4_spec.md](PLAN_remote_bridge_scoped_E1_S4_spec.md)).
>
> Scope: `src_vs_code/src` — `brokerConsent.ts`, `aliasThrottle.ts`, `brokerMcpDoor.ts`, `brokerProtocol.ts`, `brokerRequests.ts`, `credsAgentServer.ts`
> (at most +4), `requestLife.ts`, `vpnRun.ts`, `vpnLauncherRun.ts` (one field), `dependencyRunHost.ts`, `bridgeConsentText.ts`, `useActions.ts` (one optional
> field), `brokerCall.ts` (one line), `agentUseActions.ts` (one argument); the tests named in §S5.5; `src/test/promptSiteLedger.ts`;
> `src_vs_code/CHANGELOG.md` `[Unreleased]`; `research/module_extension.md`. No UI, no `package.json` command, no `extension.ts` line, no help article
> (no article names the `busy` sentence or the timeout sentence: grepped), no client (`src_cli`, `src_mcp`, `src_broker_client` have an empty diff).

Every path is relative to `src_vs_code/src/`; every `file:line` was opened on `main` at commit `455567a` (the tree this story starts from), on 2026-11-09.
Line numbers quoted by the parent were taken at older commits and are re-cited here against this tree.

## S5.0 — Facts this spec rests on

| # | Fact (verified on `455567a`) | Consequence |
|---|---|---|
| H1 | `ConsentGate.shown` (`brokerConsent.ts:189-203`) awaits `withTimeout(showWarningMessage(…, { modal: true }, 'Allow', 'Deny'), CONSENT_TIMEOUT_MS, { unref: true })` (`:192-197`) and calls `deps.dialogClosed(question, choice === 'Allow' && followsUp(question))` in a `finally` (`:199-202`). `withTimeout` (`withTimeout.ts:20-35`) resolves `undefined` when the timer wins and never rejects. | D11 is this `finally`: the timer frees the place. E1.5 moves `dialogClosed` out of the timer's path and onto the dialog's own resolution. |
| H2 | `ask` (`:172-182`) reads `stillWanted()` after `shown` and routes a dialog whose every waiter left to `ignored` (`:229-233`, one line `"<choice>" answered after the request had gone — nothing decided`, nothing for a dismissal) and everything else to `apply` (`:206-214`), which calls `onUserPresent` and `allow`/`deny` (`:216-226`). `unsettled` (`:319-321`) maps a non-Allow answer to `'timeout'`, **a dismissal (Escape) included**. | The late-answer road exists (`ignored`); E1.5 widens it to the timed-out dialog and gives it the notice. A dismissal is today answered as a timeout (504 `consent_timeout`, `GRANT_NOT_ALLOWED`); see §S5.10 Q-A. |
| H3 | `SharedPrompts.join` (`sharedPrompt.ts:45-72`): the `ask` promise "must settle by itself (a timeout included)" (`:27`); a settled prompt is forgotten (`raise`, `:99-104`) and a prompt with no live waiter takes no new ones (`listening`, `:82-85`). | After the timer settles the call, the next call on the same token raises its own dialog; the standing one is nobody's and its click decides nothing. |
| H4 | `OneInFlight` (`aliasThrottle.ts:150-205`): `prompted` makes the place the dialog's (`:176-180`); `dialogClosed(held, keep)` frees it unless `keep` and the call has not ended (`:187-194`); `released` frees it only with no dialog up and remembers `endedId` (`:197-204`). `TokenlessCeilings.prompted`/`dialogClosed` (`:368-390`) skip a dialog whose door is `undefined`: `doorOfDialog` (`:275-280`) answers `undefined` for `via === 'token'` with no bridge. | The place machinery already does what §4.10 wants once no timer calls `dialogClosed`; the local token exception is `doorOfDialog`, which E1.5 exports (as `countedOnPlace`) for the timeout sentence's per-door choice. |
| H5 | `admit` (`:329-332`): asking → `admitAsking` (holds the place, `:338-349`); silent → `admitSilent` (no place, `:334-336`). `handleMcpUse` admits with `prompts = !read.preConsented` (`brokerMcpDoor.ts:210,214`); `BrokerDoor.admit(res, prompts)` (`:49`). | D.3 (a quiet call that may prompt again) is not built: a pre-consented local `up` opens its follow-up with the place free. E1.5 builds it (E1 document, epoch 4 amendment item 10). |
| H6 | The `busy` sentence is `aliasThrottle.ts:435`, *Another request is already waiting for the person to answer. Try again once they have.*; pinned by literal in `bridgeKeptPlace.test.ts:15`, `bridgePrompts.test.ts:17`, `consentFollowUps.test.ts:29`, `bridgeLinks.test.ts:303`, `aliasThrottle.test.ts:162`, and by `/already waiting/` at `aliasThrottle.test.ts:664`, `bridgeTransitive.test.ts:380`. | Each of those turns red when the sentence changes and is updated to import the new constant; none of them pins a fact the sentence states, so the words alone are the test there (§S5.5 C8 pins the facts). |
| H7 | The timeout answer: `notAllowed` (`credsAgentServer.ts:653-665`) maps `'timeout'` to `consent_timeout` (504, `brokerProtocol.ts:50`) with `GRANT_NOT_ALLOWED` (`brokerRequests.ts:30`, *The human did not allow this grant.*) for every door; `consentNotGiven` (`brokerMcpDoor.ts:145-158`) does the same with `'The human did not allow this.'` for `create` (`:486`) and `'The human did not allow this deletion.'` for `delete` (`:315`). Pinned at `bridgePrompts.test.ts:467,503` (local timeout, `main`'s words). | The sentence is chosen in two places; E1.5 gives both one chooser (`consentRefusal`). |
| H8 | The local token path runs `perform` with no `admit` (`credsAgentServer.ts:495-496`); a bridged token call is admitted (`brokerBridgeToken.ts:60`, `door.admit(res, true)`); `create` and `delete` are admitted on the MCP door (`brokerMcpDoor.ts:288,376`). | Which calls hear the place clause: every call that was admitted asking; the local token call alone was not. |
| H9 | `asksAfterConsent` is `FollowUp = boolean \| ((target: CallTarget) => boolean)` (`useActions.ts:17-26,110-119`), set `true` for `up`/`down` (`agentUseActions.ts:405`), `terminal` (`sshUseActions.ts:301`), `rotate` (`rotateAction.ts:103`), and per entity for `exec` (`sshUseActions.ts:228`, `agentForward && agentSocket() !== undefined`); `ConsentQuestion.followUp` is a function read at the close on an Allow (`brokerConsent.ts:99,105-111`, `credsAgentServer.ts:534`); tests `brokerConsentPrompted.test.ts:153-174` (K7, change 6.1) and `bridgeLinks.test.ts:303-`. | **Change 6.1 is on `main` as built.** E1.5 keeps the evaluation where it is (at the close, on an Allow, with the dialog's own answer) and touches none of the flags. |
| H10 | `up` on an agent call: `openVpnConnect` asks with a toast (`vpnRun.ts:212-215`, no options) and writes the profile only on `'Import profile'` and only if the request is still there (`:217`, `writeVpnConfig` reads it last); `askToContinue` is a toast (`dependencyRunHost.ts:339-342`), called from `runStep` (`:288`) and `settle` (`:304`); `executed()` (`:312-336`) is awaited unbounded at `:290`, and `settle` reads the gate only after it (`:299-300`, `typedAndStillWanted` throws `endedAfter`, `requestLife.ts:67-69`). `runDependenciesFirst` is reached from `vpnRun.ts:127` (`runBuiltIn`) and `vpnLauncherRun.ts:89` (the launcher path); both carry `startGate` (`vpnLauncherRun.ts:47`). The install offer awaits its modal with **no race** and reads the gate after it (`toolEnsure.ts:17-26`). | D14's three holds are these three awaits. The install offer is a different row (`down`; §7: *frees at the click, not when the client leaves*) and is untouched. |
| H11 | `vpnAction.run` hands `ctx.signal` to `open` (`agentUseActions.ts:418`); a start that answers `false` for a gone request throws `notStarted()` (`:429-432`), which `brokerCall.failedOrAbandoned` journals as `ABANDONED` with no answer on the wire (`brokerCall.ts:222-236`). `VpnUseDeps` is `{ storage, open }` (`agentUseActions.ts:49-52`): no road to the journal. | A client that leaves during `up`'s follow-up ends the call with one `ABANDONED` line once the await is raced; the late-answer line for a late click on that follow-up needs a seam, which E1.5 builds on the action's context (H18; the gate's finding 0). |
| H12 | `CONSENT_TIMEOUT_MS = 5 * 60_000` (`agentConsent.ts:72`), mocked per test world through `consentMocks` (`test/brokerWorld.ts:289-291`, option `consentTimeoutMs` `:188`; `bridgeWallWorld.ts:273`); `holdDialogs` leaves every `showWarningMessage` open for the test (`brokerWorld.ts:180,226-233`, `w.openDialogs`); `showInformationMessage` is stubbed to `undefined` and records nothing (`:234`). `vpnWorld` holds dialogs by regex (`test/vpnWorld.ts:93,165-171`) and answers a modal by its first button, a toast by `notification` (`:227-232`, `isModal` `:245-247`); `HeldDialog` records `text`, `buttons`, `answer` (`:37-41`). | The worlds carry every scenario of §S5.5; the coder adds `w.notices` to `brokerWorld` and `modal` to `HeldDialog`. |
| H13 | The prompt-site ledger (`test/promptSiteLedger.ts`) has rows `brokerConsent.ts#ConsentGate.shown#showWarningMessage#1` (`:40`), `dependencyRunHost.ts#askToContinue#showInformationMessage#1` (`:114`, "not a modal"), `vpnRun.ts#openVpnConnect#showInformationMessage#1` (`:202`, "not a modal"), `toolEnsure.ts#confirmInstall#showWarningMessage#1` (`:191`); a site is a `show*Message` call with two or more arguments (`promptSites.test.ts:52-60`). | The three rows' reasons change with the code; a one-argument notice is no site; a renamed method renames its row in the same commit. |
| H14 | `credsAgentServer.ts` is **791** of 800 (`eslint.config.mjs:30`); `aliasThrottle.ts` 460, `brokerConsent.ts` 321, `brokerMcpDoor.ts` 522, `brokerProtocol.ts` 450, `brokerRequests.ts` 359, `requestLife.ts` 106, `vpnRun.ts` 269, `dependencyRunHost.ts` 347, `toolEnsure.ts` 63, `bridgeConsentText.ts` 77. Complexity 4, 50 code lines per function (120 in tests) (`eslint.config.mjs:31-32,60`). | The counts of §S5.4 are planned against these. |
| H15 | `src_vs_code/CHANGELOG.md` `[Unreleased]` is empty (`:8`); `[1.18.0]` (released 2026-11-08, `b6186c8`) carries partial E1's local effects, among them *the place taken until you click it or five minutes pass* (`:31-33`). `research/module_extension.md:3610-3612` says the place is freed by *the person's click, or the five-minute timeout*; `:3620-3622` lists *a timeout* among what frees the place at the dialog's close. | Both say what E1.5 ends, and both change in E1.5's commit, from the diff. |
| H16 | No production source contains `KEPT_PLACE_MS` (grepped `src/**/*.ts`); the string occurs in `todo/` only. `test/bridgeBoundary.test.ts:142-177` walks the sources by `readdirSync` and asserts a name's absence (R1's technique). | The grep test is written GREEN and stays as a guard against the superseded D.2. |
| H17 | `shown` hands `withTimeout` a `Promise.resolve(showWarningMessage(…))` (`brokerConsent.ts:193`); `withTimeout` catches nothing and its docblock requires a promise that never rejects (`withTimeout.ts:14-15`). A modal that rejects (the window shutting down under it, or any other road) is today an unhandled rejection with the place left held. | E1.5 makes the one dialog promise rejection-safe (`DialogEnd`), before and after the timeout (C19). |
| H18 | `performCall` builds the action's context in one literal (`brokerCall.ts:201`: `{ accountId, entityId, entityName, signal, bridge }`) and holds `deps.log` (`:29`, wired from `credsAgentServer.ts:681`); `UseActionContext` (`useActions.ts:29-56`) is what every action receives; `vpnAction.run` hands `ctx.signal` to `deps.open` (`agentUseActions.ts:418`); `agentVpnOpener` (`vpnRun.ts:37-42`) builds `runVpn`'s arguments; `VpnRunContext` carries `startGate` (`vpnLauncherRun.ts:30-42`) and `vpnDependencies` copies it into the chain's request (`:47`). `extension.ts:642-643` registers `vpnAction(agentDeps, …)` and may not gain a line. | The late-answer line for a late click on `up`'s questions rides the context (`ctx.lateAnswer`), built by `performCall` from `deps.log`: `extension.ts` is untouched and the journal line carries the grant. |
| H19 | `executed` (`dependencyRunHost.ts:312-336`) attaches two listeners and disposes both in `finish`; nothing disposes them while the execution runs. `vpnWorld` keeps the listeners in arrays (`test/vpnWorld.ts:111-117`, `subscribe`), so a test can count them. `node:events` exports `getEventListeners(target, name)`, which reads an `AbortSignal`'s listeners. | The listener counts of C18 and C20 are observable in the worlds and on the signal. |

## S5.1 — The plan's choices, judged against the code

1. **"The place is the dialog's until a person's act; never a timer" — built as the dialog's own promise resolving.** `withTimeout` keeps bounding the
   *call's* wait; the modal's promise is awaited a second time, by a continuation that frees the place and handles the answer. Upheld: VS Code cannot take a
   modal down (`sharedPrompt.ts:13-15`), so the promise does resolve on the click, and nothing else observes the click.
2. **"The late answer goes to `ignored`, never to `apply`" — upheld, and the timed-out dialog's answer is read by nobody but that road.** After the timer, the
   shared prompt is forgotten (H3), so no later waiter can attach to the standing dialog; the continuation receives the click and `apply` is not on its path.
3. **One sentence for both late cases.** §4.10's late-answer row covers *a dialog whose call expired or left* with one journal line, *answered after its call had
   ended; nothing ran*, and one notice. The existing `ignored` detail (*answered after the request had gone — nothing decided*) is therefore reworded to the
   row's words, and the notice is shown in both cases. No test pins the old detail (`brokerAbandoned.test.ts:89` matches `/ ignored /`; `bridgeKeptPlace.test.ts:159`
   `includes('ignored')`).
   *[Superseded in its words by the Amendment for epoch 8, F2: the line's detail ends with *the answer changed nothing*, not *nothing ran*, and the
   notice is F2's. The one road for both late cases stands.]*
4. **A dismissal is not a timeout, and E1.5 tells them apart** — now the parent's own contract (change 7.1, `bf7d2ff`, in the ledger and in §4.10's E1.5
   paragraph): an Escape is its own outcome, `dismissed`, frees the place as a click does, and keeps today's answer on the wire (504 `consent_timeout`,
   *The human did not allow this grant.* (on `create` and the folder verbs *The human did not allow this.*, on `delete` *The human did not allow this deletion.*: each door's own dismissal sentence)). Built as §S5.2 shows; Q-A is closed by it.
5. **The timeout sentence per door is decided by whether the call was admitted on the place**, which is `doorOfDialog(bridgeId, via) !== undefined` (H4, H8), not by
   `via` alone: a bridged token call is counted and hears the place clause. `create` and `delete` are admitted on the MCP door (H8), so their timeout hears the
   place clause too; §4.10 names only `credsAgentServer.ts:625` (`main`'s line; `:664` here). Q-B, settled by the gate as satisfying the plan as written.
6. **D.3 is E1.5's** (the E1 document's epoch 4 amendment, item 10) and is built as the S3 spec's Amendment 4 sketched it (`admitSilentPlace`), with one correction:
   the flag is read with the call's target (`asksAfter(action, target)`, H9), since `exec`'s flag is a function. On a bridge nothing changes (`exec` and `query`
   carry no flag; a forwarding entry is refused).
7. **D14 is built for `up`'s three awaits and no other**: the import question and `askToContinue` become modal on an agent call and both are raced against the
   gate; `executed()` is raced too. The install offer (`toolEnsure.ts:21`) is left as it is, because the parent's §7 `down` case asserts that a leaving client frees
   nothing of it and the click does. §4.10's "as the install offer already is (`vpnRun.ts:194`)" is inexact (H10): the offer reads the gate after its modal, it is not
   raced. Q-D records it as a repaired reference.
   *[Superseded in part by the Amendment for epoch 8, F1: the races stand, but a client that leaves frees the place only when no question of the
   call stands. A standing import question or *Continue* question keeps the place until a person settles it; the request still ends at once.]*
8. **"A late click [on `up`'s follow-up] leaves the late-answer line" needs a seam, and the seam is the action's context** (H11, H18; the gate's finding 0, judged
   as satisfying the plan as written). `performCall` gives every action `ctx.lateAnswer?(what)`, a closure over `deps.log` that writes the late-answer line with the
   grant (`ignored`, `"<what>" answered after its call had ended; nothing ran`); `vpnAction` hands it to `open`, `agentVpnOpener` to `runVpn`, `VpnRunContext`
   carries it beside `startGate`, and `vpnDependencies` copies it into the chain's request beside the gate. When the gate wins the race against the import question
   or the *Continue* question, the question's own promise is awaited once more by that road only: a late click writes the line, writes no profile, types nothing.
   Chosen over a `VpnUseDeps.note` because the line must carry the grant and the door, which only the broker's `log` knows, and because `extension.ts` may not gain a line.
   The person's own Start carries no `lateAnswer` and no gate, so nothing of this runs for it.
11. **One rejection-safe dialog promise, and explicit arbitration** (the gate's findings 3 and 4). The modal's promise is wrapped once into a `DialogEnd` that never
    rejects; `withTimeout` settles the call once, and `end === undefined` is the one fact that says the timer won (a `DialogEnd` is never `undefined`); after that, any
    resolution or rejection of the dialog takes `lateAnswer`, which releases with `keep = false` and applies nothing. On an answer before the timer, the waiter is
    checked **first** and `keep` is computed only when one remains: an Allow with no live waiter never keeps the place.
12. **Listener hygiene** (the gate's findings 1 and 6). `untilGone` removes its abort listener in a `finally`; `executed` takes the gate as a third way to finish and
    disposes its two terminal listeners and the gate's listener in `finish`, so abandoned runs on one still-open terminal leave nothing behind and a stale execution
    ending later reaches no follow-up (C18, C20).
9. **`consentPlace.ts` is not created, and this spec says why** (the parent's *Sketches* rule): `aliasThrottle.ts` ends near 480 and `credsAgentServer.ts` at most
   795 (§S5.4); neither is squeezed. The trigger that would create it is written in §S5.4, so the decision is the count's, not a guess.
10. **The button order is pure data** (`bridgeConsentText.ts`, no `vscode`), spread into the one `showWarningMessage`, so a unit test reads the lists and the world
    test reads the dialog's buttons, and the ledger row keeps its id.

## S5.2 — Types, signatures and the order of effects

```ts
// brokerMcpDoor.ts:136 — one outcome added; `abandoned` and the rest unchanged
export type ConsentOutcome = 'allowed' | 'denied' | 'timeout' | 'dismissed' | 'abandoned';
//   timeout   — the CALL's wait ran out (CONSENT_TIMEOUT_MS); the dialog stands and keeps the place
//   dismissed — the dialog resolved `undefined` (Escape, or VS Code closed it): a person's act; the place is freed

// brokerMcpDoor.ts:49 — D.3
admit(res: http.ServerResponse, prompts: boolean, followUp?: boolean): Slot | undefined;
/** Whether this action may prompt after its Allow for THIS target (`asksAfter`), read before admission so a quiet call can take the place. */
asksAfter(kind: string, action: string, target: CallTarget): boolean;
// handleMcpUse :214   const slot = door.admit(res, prompts, door.asksAfter(read.target.kind, action, read.target));

// aliasThrottle.ts
/** Whether a dialog raised for this call is counted on the place: its bridge's door, or the local door; none for a local token call. */
export function countedOnPlace(bridgeId: string | undefined, via: AuditDoor): boolean;   // doorOfDialog(bridgeId, via) !== undefined; doorOfDialog stays private
/** The `busy` answer, with the help a caller can act on. Exported: tests import it, never retype it. */
export const BUSY_PLACE: string;                                                            // §S5.3 (1)
admit(prompts: boolean, nowMs: number, door: string = LOCAL_DOOR, followUp: boolean = false): Admission;
//   prompts → admitAsking (as today); !prompts && followUp → admitSilentPlace; else admitSilent (as today)
private admitSilentPlace(counts, door, nowMs): Admission;
//   hold() first (undefined → refused('busy')); then counts.silent.admit (full → released(held), refused('silent')); else holding(held)
//   — the mirror of admitAsking on the quiet path (S3 spec, Amendment 4, D.3). No modal stamp, no asking stamp: the call raises no dialog.

// credsAgentServer.ts
private admitAliasCall(res, prompts: boolean, bridge?: BridgeContext, followUp?: boolean): Slot | undefined;   // :216-217, in place: ceilings.admit(prompts, Date.now(), bridge?.bridgeId, followUp)
// doorFor :272     admit: (res, prompts, followUp) => this.admitAliasCall(res, prompts, view.bridge, followUp),                      (in place)
//        +1        asksAfter: (kind, action, target) => { const a = this.actions.resolve(kind, action); return a !== undefined && asksAfter(a, target); },
// notAllowed :663-664 become:
//        const refusal = consentRefusal(consent, GRANT_NOT_ALLOWED, countedOnPlace(where.grant.bridge?.context.bridgeId, who.via));
//        this.respondError(res, refusal.code, refusal.message, where.grant, where.action, where.summary, who.via, who.caller);        (−2 +2)
// nothing else in credsAgentServer.ts changes; the gate's deps (:118) keep `prompted` and `dialogClosed` as they are.

// brokerRequests.ts (pure) — the one chooser for a consent that was not given, on every door
export function consentRefusal(consent: 'denied' | 'timeout' | 'dismissed', deniedMessage: string, onPlace: boolean): { code: ErrorCode; message: string };
//   denied    → { code: 'denied',          message: deniedMessage }
//   dismissed → { code: 'consent_timeout', message: deniedMessage }          // today's answer, byte for byte (H2; Q-A)
//   timeout   → { code: 'consent_timeout', message: consentTimedOut(onPlace) }

// brokerProtocol.ts (the wire's vocabulary) — §S5.3 (2)
export const CONSENT_TIMED_OUT_ON_PLACE: string;   // with the place clause
export const CONSENT_TIMED_OUT: string;            // without it: the local token door
export function consentTimedOut(onPlace: boolean): string;

// brokerMcpDoor.ts:145-158 consentNotGiven — `create` and `delete` are admitted on the MCP door (H8), so `onPlace` is true:
//   const refusal = consentRefusal(consent, message, true); door.refuse(res, refusal.code, refusal.message, …)

// bridgeConsentText.ts (pure)
/** The consent modal's buttons, in the order VS Code shows them. A bridged modal puts Deny first (Q5), so a stray Enter lands on Deny; a local modal is unchanged. */
export const LOCAL_BUTTONS: readonly ['Allow', 'Deny'];
export const BRIDGED_BUTTONS: readonly ['Deny', 'Allow'];
export function consentButtons(bridged: boolean): readonly string[];

// brokerConsent.ts — the gate
/** How the modal ended. NEVER `undefined` and NEVER a rejection: `undefined` is reserved for the timer (below), and a rejected modal (the window going down under it) is an end like any other. */
type DialogEnd = { kind: 'answered'; choice: string | undefined } | { kind: 'failed'; error: unknown };
private prompts = new SharedPrompts<ConsentOutcome>();          // was SharedPrompts<boolean>
/** The one dialog promise: the modal, with the door's buttons, wrapped once so it settles with a DialogEnd on every road. The method keeps its name so the ledger row keeps its id (H13). */
private shown(question): Promise<DialogEnd> {
  return Promise.resolve(vscode.window.showWarningMessage(this.wording(question), { modal: true }, ...consentButtons(question.grant.bridge !== undefined)))
    .then((choice) => ({ kind: 'answered', choice }), (error: unknown) => ({ kind: 'failed', error }));
}
private async ask(question, stillWanted): Promise<ConsentOutcome> {
  this.deps.prompted?.(question);
  const dialog = this.shown(question);
  // ARBITRATION, stated once: `withTimeout` settles exactly once (withTimeout.ts:20-35). `end === undefined` ⇔ the timer settled the call; a DialogEnd is
  // never `undefined`, so there is no third reading. Whatever the dialog does after the timer settled the call — resolve a click, resolve a dismissal, or
  // reject — is read by `lateAnswer` and by nothing else; `apply` is unreachable from there.
  const end = await withTimeout(dialog, CONSENT_TIMEOUT_MS, { unref: true });
  if (end === undefined) {
    void dialog.then((late) => this.lateAnswer(question, late));   // attached AFTER the timer won, so an answer that lands in the same tick still takes this road
    return 'timeout';                                              // the call is answered; the dialog stands and the place is its until the person acts (§4.10 row 3)
  }
  // The waiter FIRST, the flag after: an Allow nobody waits for never keeps the place (the gate's finding 4).
  if (!stillWanted()) {
    this.deps.dialogClosed?.(question, false);
    this.ignored(question, end);
    return 'timeout';                                              // read by nobody: every waiter left
  }
  this.deps.dialogClosed?.(question, end.kind === 'answered' && end.choice === 'Allow' && followsUp(question));   // H9: the flag is read HERE, on an Allow, as change 6.1 built it
  return this.apply(question, end);                                // 'allowed' | 'denied' | 'dismissed'
}
/** The standing dialog of a call that was answered `timeout`: whatever ends it frees the place (keep = false) and decides nothing. Never `apply`. */
private lateAnswer(question, end: DialogEnd): void {
  this.deps.dialogClosed?.(question, false);
  this.ignored(question, end);                                     // a click: the line and the notice; a dismissal or a failure: nothing more
}
/** Allow or Deny on a dialog whose call had ended: one line, the notice, nothing decided. A dismissal, or a modal that failed, frees the place and says nothing. */
private ignored(question, end: DialogEnd): void {
  const choice = end.kind === 'answered' ? end.choice : undefined;
  if (choice === 'Allow' || choice === 'Deny') {
    this.line(question, 'ignored', `"${choice}" answered after its call had ended; nothing ran`);
    void vscode.window.showInformationMessage(LATE_ANSWER_NOTICE);    // ONE argument: a notice, not a prompt site (H13)
  }
}
/** A failed modal before the timer is a dismissal: a one-off refusal that is not recorded (change 7.1's `dismissed`), its error in the journal as a classification (§4.1's shape), never its message. */
private apply(question, end: DialogEnd): ConsentOutcome {
  const choice = end.kind === 'answered' ? end.choice : undefined;
  if (choice !== 'Allow' && choice !== 'Deny') { return 'dismissed'; }
  this.deps.onUserPresent();
  return choice === 'Allow' ? this.allow(question) : this.deny(question);   // allow → 'allowed', deny → 'denied'
}
private after(grant, answered: ConsentOutcome | typeof ABANDONED, signal): ConsentOutcome {
  if (answered === ABANDONED || signal.aborted) { return 'abandoned'; }
  return this.known(grant) ?? answered;                          // `unsettled` is deleted
}
export const LATE_ANSWER_NOTICE = 'That request had already ended; nothing ran. The next one will ask again.';

// requestLife.ts (pure) — one race for the two QUESTIONS of D14 (the step's wait has its own, below), and nothing else
/**
 * `promise`'s value, or `undefined` the moment `startGate` fires, whichever is first. With no gate (the person's own click) it is `promise`'s value.
 * The abort listener is removed in a `finally` when either side settles (the gate's finding 1), so a thousand settled races leave the signal clean.
 * The promise is not cancelled: `onLate`, when given, receives what resolves it after the gate won, and nothing else reads it.
 */
export function untilGone<T>(promise: Thenable<T>, startGate: AbortSignal | undefined, onLate?: (value: T) => void): Promise<T | undefined>;
//   one `settledByGate` flag: the gate's listener sets it and resolves `undefined`; the promise's `then` calls `onLate(value)` when the flag is set, else resolves `value`;
//   a rejection resolves `undefined`; a `finally` on the promise removes the gate's listener. No `{ once: true }` alone: a listener on a signal that never fires is a leak.

// useActions.ts — the seam for the late-answer line (H18; the gate's finding 0)
export interface UseActionContext {
  /* …today's fields… */
  /** Set by the broker: a prompt of this action's own was answered after the call had ended (the client left while it stood). Writes the late-answer line with the grant; decides nothing. Absent for a start that serves no request. */
  readonly lateAnswer?: (what: string) => void;
}
// brokerCall.ts:201 (+1, in the literal): lateAnswer: (what) => deps.log({ where: { grant: GrantRegistry.describe(grant), entityName: grant.entityName, action, via, summary, caller }, outcome: 'ignored', detail: `"${what}" answered after its call had ended; nothing ran` })
//   — the same `where` shape `:216` builds; the coder reuses it. One line per late click, the grant field as E1.4 writes it.
// agentUseActions.ts:51 VpnUseDeps.open(accountId, entityId, action, startGate, lateAnswer?: (what: string) => void)
// agentUseActions.ts:418   deps.open(ctx.accountId, ctx.entityId, action === 'up' ? 'start' : 'stop', ctx.signal, ctx.lateAnswer)
// vpnRun.ts:37-42 agentVpnOpener → runVpn(…, startGate, lateAnswer); runVpn (:73-81) takes it as its eighth parameter and puts it on the context
// vpnLauncherRun.ts:30-42 VpnRunContext: readonly lateAnswer?: (what: string) => void;   vpnDependencies (:47) copies it into the request beside startGate
// dependencyRunHost.ts:24-42 DependencyRunRequest: readonly lateAnswer?: (what: string) => void;

// vpnRun.ts:212-217 openVpnConnect — on an agent call the question is modal and raced; a late click writes the line and no profile; the person's own Start keeps the toast
const open = await untilGone(vscode.window.showInformationMessage(IMPORT_QUESTION, { modal: ctx.startGate !== undefined }, 'Import profile'), ctx.startGate, (late) => late === undefined ? undefined : ctx.lateAnswer?.(late));
//   `open === undefined` → return false (the client left, or the person declined); `writeVpnConfig` (:217) is never reached for a late click: the one road that reads the late value is `onLate`, which journals and writes nothing.

// dependencyRunHost.ts
async function askToContinue(question: string, request: Pick<DependencyRunRequest, 'startGate' | 'lateAnswer'>): Promise<boolean>;    // :339-342
//   const choice = await untilGone(vscode.window.showInformationMessage(question, { modal: request.startGate !== undefined }, 'Continue', 'Stop'), request.startGate, (late) => late === undefined ? undefined : request.lateAnswer?.(late));
//   return choice === 'Continue';   — callers :288 (runStep) and :304 (settle) hand the request's two fields down with the gate they already carry
// executed(terminal, integration, line, startGate) :312-336 — the gate is a THIRD way to finish, inside the function, so `finish` disposes everything (the gate's finding 6):
//   const gone = () => finish('gone'); startGate?.addEventListener('abort', gone, { once: true });
//   finish = (value) => { ended.dispose(); closed.dispose(); startGate?.removeEventListener('abort', gone); resolve(value); }
//   — resolves `number | undefined | 'closed' | 'gone'`; `runStep` :290 maps `'gone'` to `undefined` for `stepVerdict`, and `settle` runs `typedAndStillWanted` FIRST (:300), which throws
//   `endedAfter('a dependency step had been typed')`, today's words. A stale execution that ends later finds no listener and reaches no question and no next step.
```

*[Epoch 8: in the block above, the words of `LATE_ANSWER_NOTICE` and of both `ignored` details (`brokerConsent` and `brokerCall.ts:201`) are superseded
by the Amendment for epoch 8, F2; the clause *so a stray Enter lands on Deny* of the `consentButtons` comment by F6; `shown`'s `Promise.resolve(…)`
around the call by F3; the `openVpnConnect` and `askToContinue` sketches gain F1's `standingPrompt`; `untilGone`'s `onLate` and the late
continuation gain F8's guards; `executed`'s order of type and gate by F8.]*

**The order of effects, stated once.** A call is admitted (the place is the call's) → `prompted` (the place is the dialog's) → the modal is shown with the
door's buttons, wrapped once into a `DialogEnd` → **either** the dialog ends first (Allow, Deny, Escape, or a failure): if every waiter had left, `dialogClosed(keep
= false)` then `ignored`; otherwise `dialogClosed(question, keep)` with `keep` read then, for an Allow only, then `apply` (`allowed` / `denied` / `dismissed`, the
last for Escape and for a failure) → **or** the call's wait runs out first: the call is answered `'timeout'` and nothing is told to the throttle; the route's
`finally` releases the slot, which frees nothing while the dialog is up (H4, `released`); whatever ends the dialog afterwards reaches `lateAnswer`, which frees
the place with `keep = false` and, for an Allow or a Deny, writes the line and shows the notice. No path from `lateAnswer` reaches `apply`, `allow`, `deny`,
`onUserPresent` or `remember`, and no rejection escapes `ask` on any road. A quiet call whose action
may prompt again holds the place from `admit` to `slot.release()` with no dialog (D.3). A local token call is admitted on no door and raises its dialog beside
whatever stands (the stated exception; nothing here changes it).

## S5.3 — Sentences (exact)

1. **`busy`** (`BUSY_PLACE`, `aliasThrottle.ts`; replaces `:435`): *Another request holds this window's dialog place. A consent dialog may be standing
   unanswered, a prompt that followed an Allow may be open (a PIN box, an install offer, a trust modal), or a dependency step may still be running in a
   terminal, in the VS Code window that owns the place. Answer or finish it there; the next request is then asked.* The first sentence is the parent's, byte for
   byte; the help names the four things §4.10 names (the standing dialog, a follow-up prompt, a running dependency step, the window that owns the place). The
   help's wording for the local-token exception is **not** written here: it waits for M10 (the parent's §7 M10 row).
   *[Superseded by the Amendment for epoch 8, F4: the help names the quiet holder too, and its last sentence no longer says what the next request
   does. The new sentence is F4's, byte for byte.]*
2. **The timeout answer**, 504 `consent_timeout`, per door (the parent's §4.10 row 3, byte for byte):
   - a call counted on the place (`CONSENT_TIMED_OUT_ON_PLACE`): *Nobody answered within five minutes. The question is still on the person's screen and keeps this
     window's shared dialog place until they answer it. This request did not run.*
   - a local token call (`CONSENT_TIMED_OUT`): *Nobody answered within five minutes. The question is still on the person's screen until they answer it. This request
     did not run.*
   *five minutes* is a literal; C2 asserts `CONSENT_TIMEOUT_MS === 300_000` beside it, and C2r proves the sentence on the real five-minute path.
3. **The late-answer line**: outcome `ignored`, detail `"Allow" answered after its call had ended; nothing ran` (or `"Deny"`). The grant field is `GrantRegistry.describe`'s
   (so a bridged line carries `bridge=<name>`, E1.4). The same shape for a late click on `up`'s questions, through `ctx.lateAnswer`: `"Import profile" answered after
   its call had ended; nothing ran`, and `"Continue"` / `"Stop"` for the chain's question, with the call's own `action` (`up`) and door.
   *[Superseded in its words by the Amendment for epoch 8, F2: `"<button>" answered after its call had ended; the answer changed nothing`.]*
4. **The notice** (`LATE_ANSWER_NOTICE`): *That request had already ended; nothing ran. The next one will ask again.*
   *[Superseded by the Amendment for epoch 8, F2: *That request had already ended, so this answer changed nothing.*]*
5. **Unchanged, byte for byte**: `GRANT_NOT_ALLOWED` on a Deny (403) and on a dismissal (504); `'The human did not allow this.'` / `'…this deletion.'` likewise; the
   `ABANDONED` details; the dialog's text (`wording`, E1.4's C11 literal stays green with no edit); the `too_many_requests` sentences other than `busy`.
6. **Buttons**: a bridged modal `['Deny', 'Allow']`; a local one `['Allow', 'Deny']`.

## S5.4 — Every file, what changes, and the line-count plan

| File | Now | Change | Planned | Against `455567a` |
|---|---|---|---|---|
| `brokerConsent.ts` | 321 | `ask` split (`shown` = the one rejection-safe `DialogEnd` promise, the arbitration, `lateAnswer`), `ignored` reworded + notice, `apply`/`after` on outcomes, `unsettled` deleted, the buttons from `consentButtons`, `LATE_ANSWER_NOTICE`; doc comments at `:24-27`, `:43-46`, `:185-188` rewritten | ≤ 385 | `:138,149-182,189-233,319-321` |
| `aliasThrottle.ts` | 460 | `BUSY_PLACE`, `countedOnPlace`, `admit(…, followUp)`, `admitSilentPlace`; `describe` reads the constant; `OneInFlight.dialogClosed`'s comment loses "or the 5-minute timeout" | ≤ 485 | `:183-186,275-280,329-336,433-435` |
| `brokerMcpDoor.ts` | 522 | `ConsentOutcome` + `'dismissed'`; `BrokerDoor.admit` third parameter and `asksAfter`; `handleMcpUse` passes the flag; `consentNotGiven` through `consentRefusal` | ≤ 532 | `:49,136,145-158,210-214` |
| `brokerProtocol.ts` | 450 | the two timeout sentences and `consentTimedOut` | ≤ 468 | after `:101` |
| `brokerRequests.ts` | 359 | `consentRefusal` | ≤ 372 | beside `:30` |
| `credsAgentServer.ts` | **791** | `admitAliasCall` fourth parameter (in place); `doorFor`: `admit` in place, `asksAfter` +1; `notAllowed` −2 +2; imports in place (`countedOnPlace`, `consentRefusal`) | **≤ 795** | `:216-217,272,663-664` |
| `bridgeConsentText.ts` | 77 | `LOCAL_BUTTONS`, `BRIDGED_BUTTONS`, `consentButtons` | ≤ 90 | — |
| `requestLife.ts` | 106 | `untilGone` with its `finally` and `onLate` | ≤ 128 | after `:48` |
| `vpnRun.ts` | 269 | `openVpnConnect`: modal on an agent call, raced, the late click journalled through `ctx.lateAnswer`; `runVpn`'s eighth parameter; `agentVpnOpener` passes it; the question's text as a constant | ≤ 280 | `:37-42,73-91,205-225` |
| `vpnLauncherRun.ts` | 176 | `VpnRunContext.lateAnswer?`; `vpnDependencies` copies it | ≤ 180 | `:30-42,47` |
| `dependencyRunHost.ts` | 347 | `DependencyRunRequest.lateAnswer?`; `askToContinue(question, request)`, modal on an agent call, raced, the late click journalled; `executed(…, startGate)` finishing on the gate and disposing all three listeners; `runStep` maps `'gone'`; the file's docblock sentence *in a notification, not a modal* (`:15-18`) qualified | ≤ 365 | `:15-18,24-42,279-291,299-305,312-342` |
| `useActions.ts` | 166 | `UseActionContext.lateAnswer?` | ≤ 172 | `:29-56` |
| `brokerCall.ts` | 240 | the context literal gains `lateAnswer` | ≤ 243 | `:201,216` |
| `agentUseActions.ts` | 436 | `VpnUseDeps.open`'s fifth parameter; `vpnAction.run` passes `ctx.lateAnswer` | ≤ 439 | `:49-52,418` |
| `toolEnsure.ts`, `rotateAction.ts`, `sshUseActions.ts`, `grantRegistry.ts`, `sharedPrompt.ts`, `withTimeout.ts`, `agentConsent.ts`, `extension.ts` (1003) | — | **untouched** | — | — |
| `src_cli`, `src_mcp`, `src_broker_client`, `install.sh`, `scripts/creds-cli-itest.cjs`, `contract/broker-v1.json` | — | **empty diff** (no client matches the sentences: grepped) | — | — |

**The trigger for `consentPlace.ts`.** It is created only if, after the coder's edits, `credsAgentServer.ts` passes **796** or `aliasThrottle.ts` passes **700**; in the
first case `notAllowed` (`:653-665`) moves whole into `brokerRequests.ts` first (a function taking `respondError` and `abandoned` as callbacks; −13 +2), and only if
that is not enough does `OneInFlight` with `countedOnPlace` and `BUSY_PLACE` move to `consentPlace.ts` (pure, no `vscode`; `aliasThrottle.ts` imports it). The counts
are re-taken by the coder and written in §S5.12; the ceiling is a size, and the review judges the ownership (the E1 document's epoch 4 amendment, item 7).

**Tests touched (each named in §S5.5):** new `test/consentContract.test.ts` (the E1 document's item 10 names it; E2.2's commit asserts it exists); if it would pass
800 lines, the D14 cases go to `test/consentContractVpn.test.ts` and the first file stays. Updated: `bridgeKeptPlace.test.ts` (`:15` imports `BUSY_PLACE`; K3 `:91-104`
inverted; K6 asserts the detail and the notice), `brokerConsentPrompted.test.ts` (K7 `:176-190` inverted: `closed` is `[]` at the timeout and `[false]` after the late
click), `bridgePrompts.test.ts` (`:17`; P3 `:557-577`, P3 main `:463-475` and P3 real `:486-510` inverted: the next call is `busy`, the sentence is the new one),
`bridgeConsent.test.ts` C17 (`:261-285`: adds the sentence and that the place is still held), `consentFollowUps.test.ts:29`, `bridgeLinks.test.ts:303`,
`aliasThrottle.test.ts:162,664`, `bridgeTransitive.test.ts:380`, `brokerAbandoned.test.ts` (`:88-89`: the detail and the notice), `vpnGoneRequest.test.ts:160-174`
(asserts the question was modal). Test worlds: `brokerWorld.ts` records `showInformationMessage` texts in `w.notices` (`:234`); `vpnWorld.ts` `HeldDialog.modal`.
`promptSiteLedger.ts`: the three reasons of H13.

## S5.5 — Scenarios

All through the broker test world (`brokerWorld` / `bridgeWallWorld`) with `holdDialogs` and `consentTimeoutMs` lowered (100-300 ms) unless a case says
otherwise; every status is read from the reply, every fact from an observation the world offers (`w.dialogs.length`, `w.openDialogs`, `w.ran`, `w.audit`,
`w.consents`, `w.notices`, `w.presence`, the vpn world's `held[].modal`, `terminals`, `filesUnder(dir)`), never from the words alone. "RED first" names what
today's code does instead. Doors: `viaMain` (alias and MCP), `viaMain` with a token (the local token door), `viaBridge` (every bridged door, token included).

| # | Scenario | Start | Transition | Expected | RED first, because |
|---|---|---|---|---|---|
| C1 | The timer answers the call and frees nothing | a bridged alias call, its dialog open; `consentTimeoutMs: 100` | wait for the reply | 504 `consent_timeout` with `CONSENT_TIMED_OUT_ON_PLACE`; `w.dialogs.length === 1`; then an alias call through the bridge, an alias call and an MCP call through the main port, and a token call through the bridge are each `429` `BUSY_PLACE` at once; `w.dialogs.length` still 1 | today the next call is asked (P3 `:557`) and the sentence is `main`'s |
| C1b | The same through each local door | a local alias call; a local MCP call (`every12h`, not pre-consented) | as C1 | the place clause; the next local alias and MCP calls `busy`; the sentence identical to C1's | P3 main `:463` asserts the opposite |
| C1c | The local token door hears the sentence without the place clause and takes no place | a local token call, its dialog open; `consentTimeoutMs: 100` | wait for the reply | 504 `consent_timeout` with `CONSENT_TIMED_OUT` (no *keeps this window's shared dialog place*); the next local alias call is **asked** (`w.openDialogs.length === 2`), not `busy`; its Allow runs it; a second call on the **same local token** after its timeout is asked too (a second dialog promise beside the standing one: §4.10's stated exception, observed and not guarded — the gate rejected a token-local guard; whether the two are shown together or queued is M10's to measure, and nothing here asserts the screen) | the sentence is `main`'s; the fact (no place) is green today and is pinned here beside the words, as the parent's §7 owes (*the absence of any place for the same call through the local token door*) |
| C1d | A bridged token call is counted | the same as C1c through `viaBridge` with a token | as C1c | the place clause; the next bridged call `busy` | the sentence |
| C2 | The words say what the constant is | pure | — | `CONSENT_TIMED_OUT_ON_PLACE` and `CONSENT_TIMED_OUT` both contain `within five minutes`, and `CONSENT_TIMEOUT_MS === 5 * 60_000` | new |
| C2r | The real five-minute path, no `consentTimeoutMs` (rewrites P3 real, `bridgePrompts.test.ts:486`) | a local alias call under `mock.timers`; its dialog open | tick 299 s: nobody answered; tick 1.1 s | 504 with the place sentence; a second local alias call is `busy` (no second modal, `w.dialogs.length === 1`); the first dialog Allowed: `ignored` line, no `ALLOWED`, `w.ran` empty; then the second call is asked and runs | today a second modal opens (`:505-508`) |
| C3 | A late Allow on an expired dialog authorises nothing | C1 after the 504 | `openDialogs[0]('Allow')` | one `ignored` line whose detail is `"Allow" answered after its call had ended; nothing ran`; no `ALLOWED` line; `w.ran` empty; `w.consents` empty (an MCP `every12h` variant: the stamp store has no new key); `w.presence` unchanged; `w.notices` holds `LATE_ANSWER_NOTICE` once; then the next bridged alias call is **asked** and its Allow runs it | today the click lands on nobody's dialog and the place was already free; the detail and the notice do not exist. *[Epoch 8: the words of the detail and the notice superseded by F2 (F2a); the facts stand]* |
| C3b | A late Deny tombstones nothing | C1 | `openDialogs[0]('Deny')` | one `ignored` line (`"Deny" …`), no `DENIED` line; the notice; the next call on the same token (token door variant) is asked, not refused 403 | the tombstone path (`deny`) is reachable from a late click today only through `apply`; here `lateAnswer` never reaches it (mutation M3 proves the test's teeth) |
| C3c | A late Escape frees and says nothing | C1 | `openDialogs[0](undefined)` | no `ignored` line, no notice; the next call is asked | — (the place: red today in the sense that it was already free; asserted as the end state) |
| C4 | A client that leaves during its dialog: the place stays until the click, and the click is told | a local alias call, hang up during its dialog (`sendAbortable`) | `ABANDONED` seen; a second local call: `busy`; then Allow | the `ignored` line with the new detail; the notice; `w.ran` empty; the next call asked | the detail is today's old sentence and there is no notice (`brokerAbandoned.test.ts:91-117` stays green through `/ ignored /` and is extended). *[Epoch 8: the words superseded by F2 (F2a); the facts stand]* |
| C4b | The same when the timer fires after the client left | C4, `consentTimeoutMs: 100`, wait past it before the click | a second call during the wait: `busy`; then Allow | as C4; exactly one `ABANDONED` line, one `ignored` line | today the timer frees the place at 100 ms |
| C5 | Escape is a person's act, answered as today | a local alias call | `openDialogs[0](undefined)` | 504 `consent_timeout`, `GRANT_NOT_ALLOWED` (byte for byte today's); the place free: the next call asked; no `ignored` line; `w.presence` unchanged | green today; **kept as a guard** so the new sentence never speaks for an Escape (mutation M4) |
| C6 | Buttons by door | a bridged alias call; a local alias call; a local token call | read the arguments `showWarningMessage` received | bridged: `['Deny', 'Allow']`; both local: `['Allow', 'Deny']`; the pure `consentButtons(true/false)` answers the same lists | today every door gets `'Allow', 'Deny'` |
| C7 | `KEPT_PLACE_MS` does not exist | the sources under `src/` except `src/test` | grep, as R1 walks (`bridgeBoundary.test.ts:142`) | zero hits | green; a guard against D.2 |
| C8 | The `busy` sentence, and the facts it states | (a) C1's standing dialog; (b) a local `down` with no VPN client, its install offer held after the Allow (the `consentFollowUps.test.ts:70` rig); (c) an agent `up` whose dependency step never ends (C10) | an alias call during each | `429` with `BUSY_PLACE` in all three; and in each the thing the help names is observed: (a) `w.dialogs.length === 1` and `openDialogs.length === 1`; (b) the install offer is held (`vw.held.length === 1`) and no second modal; (c) the chain terminal holds an execution that has not ended | the sentence is `main`'s. *[Epoch 8: the words superseded by F4; (d), a quiet holder, added by F4b]* |
| C9 | D.3: a quiet call that may prompt again holds the place for its length | the local MCP door pre-consented (`quietLocal`), the scripted action with `asksAfterConsent: true`, its run held (`w.hold`) | a bridged alias call and a local alias call during the run; then release the hold | both `busy` with `BUSY_PLACE` and no dialog (`w.dialogs.length === 0`); the quiet call's `allowed without a prompt` line is written as today; after the run ends the next call is asked; a quiet call of an action **without** the flag (today's `exec` script) holds nothing: a concurrent asking call is asked while it runs; through a bridge (`exec`, `query`) nothing changes: C21 of the E1.4 spec stays green | today the quiet call takes no place (`brokerMcpDoor.ts:210,214`) |
| C9b | D.3 with the per-entity flag | the real `sshExecAction` under `bridgeLinksWorld`, a forwarding entry with the socket up, the local MCP door quiet | as C9 | the place is held for the run; the same entry with the socket down holds nothing | new |
| C10 | D14: an agent's `up` whose dependency step never ends frees the place when the client leaves (the main `up` case of the parent's §7) | the real `vpnAction` over `agentVpnOpener` and the vpn world, inside `brokerWorld` (the `consentFollowUps.test.ts:70-80` rig); an entry with a `runDependencies` chain of one terminal step; the fake terminal's execution is never ended; the call is an MCP use through the main port, sent with `sendAbortable` | Allow; `until` the step is typed; (i) a local alias call: `busy` with `BUSY_PLACE`; (ii) hang up the client | after (ii): one `ABANDONED` line whose detail is `after a dependency step had been typed …` (today's words, `requestLife.ts:67-69`); the place free: the next local alias call is asked and runs; no VPN config file under the storage dir; no VPN terminal; the dialog count unchanged | today `executed()` is awaited unbounded: the hang-up changes nothing until the step ends; the next call stays `busy` for ever |
| C10b | The same through the launcher path | the entry names a launcher (`vpnLauncherEntityId`) whose chain has the never-ending step (`vpnLauncherRun.ts:89`) | as C10 | as C10 | as C10 |
| C10c | The `Continue` question is modal on an agent call and a client leaving ends it | a chain under a terminal with no shell integration (`integration: false`), so `askToContinue` is reached at `runStep` `:288`; held by regex `/Continue once it has finished/` | hang up; then click `Continue` | `held[0].modal === true`; the call ended on the hang-up (`ABANDONED`, *after a dependency step had been typed*), the place free before the click; the late `Continue` runs no second step and types nothing | today a toast; the hang-up changes nothing until the click. *[Superseded as written by the Amendment for epoch 8, F1: "the place free before the click" is the defect of change 7.3; the case is rewritten as F1a]* |
| C10d | The person's own Start keeps the toast | the same chain with no `startGate` | the person clicks `Continue` | `held[0].modal === false`; the chain goes on as today | green; a guard |
| C11 | D14: the OpenVPN Connect question, and the late click's line | an agent `up` on an `openvpn` entry with `resolveVpnLauncher → openvpn-connect` (the `vpnGoneRequest.test.ts:160-174` mocks), through `brokerWorld` (so the real `performCall` builds `ctx.lateAnswer`), held by `/Import this profile/` | (i) a local alias call: `busy`; (ii) hang up; (iii) click `Import profile` | `held[0].modal === true`; after (ii) one `ABANDONED` line (*as the action was starting — it was not launched*) and the next call asked (the place freed before any click); after (iii) exactly one more journal line: outcome `ignored`, action `up`, the grant's describe, detail `"Import profile" answered after its call had ended; nothing ran`; no file under the storage dir, no terminal (today's assertions `:171-172`), `w.ran` unchanged; the chain's *Continue* question (C10c) gets the same line with `"Continue"` on a late click | today the question is a toast, the hang-up is read only when the person clicks, and no line exists. *[Superseded as written by the Amendment for epoch 8, F1 and F2: "the next call asked (the place freed before any click)" is the defect of change 7.3 and the detail's words are 7.2's; the case is rewritten as F1b]* |
| C11b | The person's own Start | the same with no `startGate` | the person clicks | `modal === false`; the profile is written and the import line typed, as today (`:186-193`) | green; a guard |
| C12 | A local `up` held in its follow-up longer than any former timer | `consentTimeoutMs: 100`; a local `down`/`up` with the install offer held for 400 ms after the Allow | alias and MCP calls at 150 ms and 350 ms | all `busy`; the place frees at the click on the offer, not before, not at a hang-up (the parent's §7 `down` case, as `consentFollowUps.test.ts:70` asserts) | green today (the timer never ran on a follow-up); kept beside C1 so the two rules are seen together |
| C13 | The overnight row | a bridged `exec` with `quiet` off; the agent sends ten calls over 2 s with `consentTimeoutMs: 100` | — | one 504, nine `busy`; `w.dialogs.length === 1` at the end; then one click clears it and the eleventh call is asked | today ten dialogs would be raised one after another (each timeout frees the place) |
| C14 | A late answer writes no stamp | the real consent hooks (`bridgeConsent.test.ts`'s `consenting('every12h', quiet on)`), C1 through bridge A, then a late Allow | — | the store has no new key; `w.consents` empty; the `ignored` line; the next call through A is asked | today no stamp either (`remember` runs after `perform`'s `allowed`), pinned here as the row demands (*a test asserts it*) |
| C15 | `create` and `delete` on the MCP door | an MCP `create` and an MCP `delete`, each timed out | — | 504 with `CONSENT_TIMED_OUT_ON_PLACE`; a dismissal of each: 504 with today's `'The human did not allow this.'` / `'…this deletion.'`; the next call `busy` after the timeout and asked after the dismissal | the sentences are today's for both |
| C16 | The two late cases share one road | unit, `brokerConsentPrompted.test.ts`'s `gateOver` with a spying `log` and a stubbed `showInformationMessage` | (a) timer, then Allow; (b) `stillWanted` false, then Allow | both: one `ignored` line with the new detail, one notice, `onUserPresent` not called, `grants.allow` not called; `closed` is `[]` until the click and `[false]` after it in (a) | K7 `:176-190` asserts `closed === [false]` at the timeout |
| C17 | The ledger stays exact | `promptSites.test.ts` | — | green with the three reasons rewritten and no new row; or, if the coder's shape added a call, the new row is present and classed | fails by itself on a new unclassed site |
| C18 | `untilGone` leaves the gate clean | unit, `requestLife`: one `AbortController`, its signal | 1 000 races: 500 settled by the promise on the shared signal, 500 by a never-resolving promise and the gate (a fresh controller each), plus 200 whose promise rejects | `getEventListeners(signal, 'abort').length === 0` after each settled race (the shared signal reads 0 at the end, not 500); a rejected promise resolves `undefined` and leaves none; with no gate the value comes through; `onLate` fires only when the gate won, and only once | the listener stays until the signal fires (a `{ once: true }` listener on a signal that never fires is a leak) |
| C19 | A rejected dialog is an end like any other | (a) C1's standing dialog after its 504, the world's `showWarningMessage` stub made to **reject** on demand (`w.openDialogs[0]` given a `fail(error)` twin); (b) the same before the timer | reject with `new Error('<sentinel>')` | (a) the place is freed (the next alias call is asked), no `ALLOWED`/`DENIED`/`ignored` line, no notice, `w.presence` unchanged; (b) the call is answered 504 `consent_timeout` with `GRANT_NOT_ALLOWED` (`dismissed`), the place freed, nothing applied; in both a `process.on('unhandledRejection')` spy installed for the test records **nothing**, and the sentinel appears in no journal line and no body | today (b) is an unhandled rejection with the place held; (a) has no late road at all |
| C20 | Abandoned runs on one open terminal leave nothing behind | the C10 rig with one preopened chain terminal reused across runs (`vpnWorld`'s `preopened` and `live`); five agent `up` calls in turn, each Allowed, each hung up while its step runs, each step never ended | after the five | the world's `ended` and `closed` listener arrays are at their pre-run length after each run (`subscribe`'s arrays, `vpnWorld.ts:111-117`); each gate signal reads `getEventListeners(…, 'abort').length === 0`; then end the five stale executions with exit code 0: no *Continue* question is raised, no second step is typed, no config file appears, `w.audit` gains no line; the place is free after each hang-up | today the two listeners of each run stay attached, and a stale execution ending runs `settle` for a dead request |
| C21 | Arbitration, both orders | unit, `brokerConsentPrompted.test.ts`'s `gateOver` under `mock.timers` with `CONSENT_TIMEOUT_MS: 30`, `followUp: true`, a spying `log` | (a) answer `Allow` at 29 ms; (b) tick to 30 ms, then answer `Allow` in the next microtask; (c) the waiter's signal fires at 29 ms, then `Allow` at 29.5 ms; (d) resolve `Allow` and tick to 30 ms in the same macrotask, the tick first | (a) `'allowed'`, `closed === [true]` (kept: the flag read at the close); (b) `'timeout'` first, then `closed === [false]`, one `ignored` line, no `ALLOWED`; (c) `'abandoned'` to the waiter, `closed === [false]`, never `[true]`: no live waiter, so `keep` was never computed; (d) as (b): the late road, because `withTimeout` had settled | (b) and (d): today the `finally` frees at the timer and a same-tick answer reaches `apply`; (c): today `keep` is computed from the flag alone (`:201`) and the place is kept until `endedId` catches it |

Commands: the E1 document's common block with `<name>` = `consentContract`, `consentContractVpn` (if split), `bridgeKeptPlace`, `brokerConsentPrompted`,
`bridgePrompts`, `bridgeConsent`, `consentFollowUps`, `bridgeLinks`, `aliasThrottle`, `bridgeTransitive`, `brokerAbandoned`, `vpnGoneRequest`, `promptSites`,
`brokerConsentText`, `bridgeBoundary`; then E1's pre-PR block. Every RED is watched before its change and both outputs go in the PR (CLAUDE.md, Definition of Done).

## S5.6 — Mutations (mutate, watch the named case fail, restore; both outputs in the PR)

| # | Mutation | First red case | Symptom |
|---|---|---|---|
| M1 | `ask` calls `dialogClosed` when the timer wins (D11 restored) | C1, C1b, C2r, C13 | the next call is asked over a standing dialog |
| M2 | `lateAnswer` calls `apply` | C3, C3b, C16 | an `ALLOWED` line, `w.ran` not empty, `presence` grows, or a 403 on the next token call |
| M3 | `lateAnswer` reaches `deny` for a late Deny | C3b | the next call on the token is refused 403 |
| M4 | `apply` answers `'timeout'` for a dismissal (today's `unsettled`) | C5, C15 | the place sentence after an Escape |
| M5 | `consentRefusal` ignores `onPlace` | C1c | the local token call hears the place clause |
| M6 | `countedOnPlace` answers `true` for a local token call | C1c | the next local alias call `busy` beside a token dialog |
| M7 | `countedOnPlace` answers `false` for a bridged token call | C1d | no place clause through the bridge |
| M8 | the sentence says *within 5 minutes* | C2 | the literal differs |
| M9 | the `busy` constant loses one of the four named things | C8 | the help no longer names it |
| M10 | `admit` ignores `followUp` (D.3 off) | C9, C9b | a concurrent asking call is asked while the quiet `up` runs |
| M11 | `admitSilentPlace` stamps the asking window | the E1.4 spec's C21 / `aliasThrottle.test.ts` B.1 | sixty quiet calls refused as asking |
| M12 | `asksAfter` in `doorFor` ignores the target (reads `=== true`) | C9b | a non-forwarding entry holds the place; a forwarding one with the socket up does not |
| M13 | `consentButtons(true)` answers `['Allow', 'Deny']` | C6 | Deny is not first on a bridged modal |
| M14 | `consentButtons(false)` answers `['Deny', 'Allow']` | C6 | a local modal changed |
| M15 | `openVpnConnect` passes `{ modal: true }` for the person's own Start | C11b | a modal on the person's click |
| M16 | `openVpnConnect` is not raced | C11 | the `ABANDONED` line waits for the click |
| M17 | `askToContinue` is not raced | C10c | the chain waits for the click |
| M18 | `executed` is not raced | C10, C10b | the place stays `busy` after the hang-up |
| M19 | `untilGone` resolves `undefined` with no gate | C10d, C11b, and the person's-own chain tests | the person's `Continue` is lost |
| M20 | the `ignored` detail keeps the old words | C3, C4 | the detail differs |
| M21 | `ignored` shows no notice | C3, C4, C16 | `w.notices` empty |
| M22 | `ignored` shows the notice for a dismissal | C3c | a notice with no click |
| M23 | `lateAnswer` passes `keep = followsUp(question)` | C1 with `asksAfterConsent: true` (a variant of C3): the late Allow leaves the place held | the next call `busy` for ever |
| M24 | `consentNotGiven` keeps its own `consent === 'timeout' ? …` without `consentRefusal` | C15 | `create`'s timeout keeps today's sentence |
| M25 | a `KEPT_PLACE_MS` constant is added to `aliasThrottle.ts` | C7 | the grep finds it |
| M26 | the `shown` row's reason is left as it was | C17 by review only (the ledger test cannot read a reason's truth); the review checklist item 9 | — |
| M27 | `untilGone` drops its `finally` (the abort listener stays) | C18 | 500 listeners on the shared signal |
| M28 | `shown` returns the raw modal promise (no rejection handler) | C19 (a) and (b) | the unhandled-rejection spy fires; the place stays held |
| M29 | `keep` is computed before `stillWanted()` (today's order) | C21 (c) | `closed === [true]` for a waiter that had left |
| M30 | the late continuation is attached before `withTimeout` settles, or `apply` is reached when the dialog resolves in the timer's tick | C21 (b), (d) | an `ALLOWED` line after a `'timeout'` |
| M31 | `executed` does not finish on the gate, or `finish` does not remove the gate's listener | C20, C10 | listener arrays grow by two per run; a stale execution raises a question |
| M32 | `openVpnConnect` reads the late click through a bare `.then` instead of `onLate`, or `lateAnswer` is not passed down | C11 | no `ignored` line for the late click, or a profile written |
| M33 | `performCall` builds `lateAnswer` without the grant (`'—'`) | C11 | the line's grant field is `—` |

## S5.7 — Opus review checklist for the code

1. No call of `dialogClosed` sits on the timer's path: `withTimeout`'s `undefined` leads to `return 'timeout'` and to `dialog.then(lateAnswer)` and nowhere else;
   `lateAnswer` passes `keep = false` always.
2. `apply`, `allow`, `deny`, `onUserPresent`, `remember` are unreachable from `lateAnswer` (read the call graph, then M2/M3).
3. `after` is `known(grant) ?? answered`; `unsettled` is gone; a dismissal is `'dismissed'` end to end and answers 504 with the door's old sentence (C5, C15).
4. `consentRefusal` is the one chooser: `credsAgentServer.notAllowed` and `brokerMcpDoor.consentNotGiven` both call it; no other `consent_timeout` producer exists
   (`grep -n consent_timeout src/*.ts` shows `brokerProtocol.ts` and the chooser only).
5. `countedOnPlace` wraps the private `doorOfDialog`; the two cannot disagree (one calls the other).
6. D.3: `admitSilentPlace` holds the place before the silent window and releases it if the window refuses; it stamps neither `modal` nor `asking`; `quietly` still
   writes the `allowed without a prompt` line; the flag is read with `asksAfter(action, target)`.
7. D14: `{ modal: startGate !== undefined }` at both questions; both are wrapped by `untilGone(…, startGate, onLate)` and `executed` finishes on the gate inside
   itself; `untilGone` with `undefined` returns the promise's own value and removes its listener in a `finally`; `executed`'s `finish` disposes all three listeners;
   `settle`'s `typedAndStillWanted` still runs before any question; `toolEnsure.ts` is untouched.
7a. The seam: `ctx.lateAnswer` is built in `performCall`'s one literal from `deps.log` with the grant's describe, the action and the door; it is passed down and read by
   nothing but `onLate`; `extension.ts` is unchanged; the person's own Start (`startGate` undefined) never carries it.
7b. `shown` is the one place the modal's promise is wrapped; `DialogEnd` is never `undefined`; `ask`'s `end === undefined` is the only test for the timer; the late
   continuation is attached inside that branch; `stillWanted()` is read before `followsUp`; no handler-less `then` on the modal remains anywhere in the file.
8. The buttons come from `consentButtons(grant.bridge !== undefined)`, spread into the one `showWarningMessage`; `bridgeConsentText.ts` still imports no `vscode`.
9. The ledger: the `shown` row's reason no longer says the timer frees the place; the two "not a modal" reasons say *modal on an agent call, a toast on the
   person's own*; no new site, or its row.
10. `credsAgentServer.ts` ≤ 795 (or §S5.4's trigger was followed and said in §S5.12); `extension.ts` 1003, ratchet green; `npm run lint` green at complexity 4.
11. `CHANGELOG.md` `[Unreleased]` (§S5.11): every bullet matches a hunk a local door reaches; the button order is **not** in it.
12. The three `module_extension.md` sentences of H15 are corrected, and no sentence there still says a timeout frees the place.
13. The RED outputs for C1, C1b, C1c (sentence), C3, C4, C6, C8, C9, C10, C10c, C11, C13, C15, C16, C18, C19, C20, C21 and the 33 mutations are in the PR; the GREEN
    outputs beside them.
14. No real host name, login, address or key path in any test or document (`build-server` and the worlds' fakes only).

## S5.8 — Decisions closed

1. The timer answers the call and touches the throttle by nothing; the dialog's own resolution frees the place, through `lateAnswer`, with `keep` false.
2. A late Allow or Deny, after a timeout or after every waiter left, writes one `ignored` line with the words *answered after its call had ended; nothing ran*
   and shows `LATE_ANSWER_NOTICE`; a late Escape frees the place and writes and shows nothing.
   *[Superseded in its words by the Amendment for epoch 8, F2; the rule stands.]*
3. A dismissal is a `ConsentOutcome` of its own, `dismissed`: it frees the place as a click does and is answered on the wire exactly as today, 504 `consent_timeout`
   with *The human did not allow this grant.* (on `create` and the folder verbs *The human did not allow this.*, on `delete` *The human did not allow this deletion.*: each door's own dismissal sentence) — **the parent's change 7.1 (`bf7d2ff`, 2026-11-09)**, binding; a modal that fails before the timer is read as a dismissal.
10. One rejection-safe dialog promise (`DialogEnd`); after the timer, every end of the dialog goes through `lateAnswer` with `keep = false`; no rejection escapes `ask`.
11. Arbitration is `withTimeout`'s single settlement, read as `end === undefined`; `keep` is computed only after `stillWanted()` says a waiter remains.
12. The late click on `up`'s import question and on the chain's *Continue* question writes the late-answer line through `ctx.lateAnswer`, a seam built by
    `performCall` from the broker's `log`; it writes no profile and types nothing (the gate's finding 0, judged as satisfying the plan as written).
    *[Superseded in its words by the Amendment for epoch 8, F2; and by F1: that late click is also what frees the place.]*
13. `untilGone` removes its abort listener when either side settles; `executed` finishes on the gate and disposes its listeners, so abandoned runs on one terminal
    accumulate nothing and a stale execution reaches no follow-up.
4. The timeout sentence is chosen by `countedOnPlace`, not by `via`; `create` and `delete` hear the place clause (Q-B).
5. D.3 is built here, with the per-entity flag read through `asksAfter(action, target)`.
6. D14 races the import question, `askToContinue` and `executed()` against `ctx.startGate` on an agent call and makes the two questions modal there; the person's own
   path is byte for byte today's; the install offer is untouched.
   *[Superseded in part by the Amendment for epoch 8, F1: the races stand; a standing question keeps the place after its client leaves, until a
   person settles it.]*
7. `consentPlace.ts` is not created unless §S5.4's trigger fires.
8. The bridged modal's buttons are `['Deny', 'Allow']`; local `['Allow', 'Deny']`; both pure data.
9. M10 is recorded with this story and does not block its merge (the parent's §7); the help's wording for the local-token exception is written after M10, not here.

## S5.9 — Not verified by this spec

- That VS Code resolves a modal's promise on Escape and on a window-driven dismissal (the parent's *Not established*); if it does not, the place stays held
  until a reload, which `BUSY_PLACE` names as the window that owns the place. M10 measures a modal left for an hour.
- Whether a second modal raised beside a standing one (the local token exception, C1c) is shown or queued (M10); C1c asserts two open dialog promises and
  nothing about the screen.
- That `getEventListeners` from `node:events` reads an `AbortSignal`'s `abort` listeners on the Node that runs the suite (documented for `EventTarget` since Node 16);
  if it does not, C18 and C20 count through a wrapped signal the test builds, and say so.
- That VS Code's `integration.executeCommand` for a stale execution does nothing harmful once no listener is attached (C20 asserts the extension's side only).
- The line counts of §S5.4 are hand estimates; `wc -l` and `npm run lint` decide, and §S5.12 records them.

## S5.10 — Questions for the plan (not decided here)

The contract is built as written above; each point below is where §4.10 was silent, inexact against this tree, or named a thing the code could not produce, with
the evidence, and what the coai plan gate (2026-11-09, two of two consultants) and the parent's ledger made of it. Nothing here was changed in this spec; the parent
decided Q-A (change 7.1) and the others were judged to satisfy the plan as written.

- **Q-A — closed by change 7.1 (`bf7d2ff`).** A dismissal (Escape) rode the timeout's road (`brokerConsent.ts:206-209,319-321`; `credsAgentServer.ts:663-664`), so the
  new 504 sentence would have been false after it, and §4.10 said nothing of Escape's wire answer. The parent now says: an Escape is its own outcome, `dismissed`,
  frees the place as a click does, and keeps today's answer (504 `consent_timeout`, *The human did not allow this grant.*). Binding here as §S5.8 item 3; built in
  §S5.2; C5, C15, C19 (b) pin it. Counted as one change by the consultants.
- **Q-B — settled: satisfies the plan as written (consultants, 2026-11-09).** §4.10 names `main`'s `credsAgentServer.ts:625` as the sentence E1.5 replaces; two more
  timeout sentences exist on the MCP door: `consentNotGiven` (`brokerMcpDoor.ts:145-158`) answers a timed-out `create` with `'The human did not allow this.'` (`:486`)
  and `delete` with `'…this deletion.'` (`:315`). Both calls are admitted on the place (`:288,376`), so the row's *per door* sentence applies to them (C15), and the
  CHANGELOG names them.
- **Q-C — settled: satisfies the plan as written (consultants, 2026-11-09), and built.** D14's "a late click writes no profile and leaves the late-answer line" could not
  be produced from `vpnRun.ts` as it stands (`VpnUseDeps` is `{ storage, open }`, `agentUseActions.ts:49-52`, no road to the journal). The gate accepted that the line
  is required and that a seam satisfies the plan: `ctx.lateAnswer`, built by `performCall` (§S5.1 item 8, §S5.2, C11, M32-M33). The `ABANDONED` line of the hang-up
  stands beside it.
- **Q-D — settled: a repaired reference (consultants, 2026-11-09).** "as the install offer already is (`vpnRun.ts:194`)" is inexact: `offerToInstall` (`toolEnsure.ts:17-26`)
  awaits its modal with no race and reads the gate after it; `vpnRun.ts:194` is `noCli`'s signature on this tree and `:201` the call. The parent's own §7 `down` case
  asserts the offer frees at the click and not at a hang-up, so the two questions of D14 are raced and the offer is not (C11, C12). Only the comparison was wrong;
  nothing is built from it, and the parent's text is the owner's to touch.
- **Q-E — settled: satisfies the plan as written (consultants, 2026-11-09).** A second call on the **same local token** after its timeout raises a second dialog beside
  the standing one (H3: the prompt was forgotten; H4: no place): §4.10's stated exception applied to one token. The gate rejected a token-local guard against it
  (finding 5); C1c observes the exception and asserts nothing about the screen, which is M10's to measure. The overnight row's *at most one standing modal per
  window* is true of the counted doors.
- **Q-F — settled: satisfies the plan as written (consultants, 2026-11-09).** `ignored`'s detail changes for the "client left" case too (`brokerConsent.ts:231`:
  *answered after the request had gone — nothing decided*), because the late-answer row gives one sentence for *expired or left*. No test pins the old words; the
  change is listed as a local effect (C4).

## S5.11 — What this changes for a local user; the CHANGELOG entry; the documents; the ledger

**Reachable by a local user (the parent's §4.10 second list, extended by E1.5; each with its case):** an unanswered local alias or MCP modal now answers `busy`
to the next asking alias or MCP call until a person clicks it, where 1.18.0 re-asked after five minutes with a second modal (C1b, C2r); the `busy` sentence is
`BUSY_PLACE` (C8); the timeout answer on the local alias and MCP doors is the place sentence and on the local token door the shorter one, replacing *The human did
not allow this grant.* (C1b, C1c; `create` and `delete`: C15); a late Allow or Deny on a dialog whose call had timed out or whose client had left writes
*answered after its call had ended; nothing ran* and shows the notice (C3, C4); an Escape frees the place and is answered as before (C5; a modal that fails is read the
same way, C19); a quiet local MCP call of `terminal`, `up`, `down`, `rotate`, or `exec` on a forwarding entry with the agent up, holds the place while it runs
(C9, C9b: D.3); an agent's `up` (through any local door) shows the OpenVPN Connect question and the dependency chain's *Continue* question as modals, a client that
leaves during them or during a running dependency step ends the call, and a late click on either question leaves the late-answer line and does nothing (C10, C10c,
C11); the person's own Start is unchanged (C10d, C11b). **Not reachable** (no production door opens a bridge before E2; R1): the button order
(C6), the place clause through a bridged token call (C1d), the bridged journal mark on the late line. Their release notes go in E4.1's flip entry.
*[Superseded in part by the Amendment for epoch 8: the late line's words and the notice by F2; "a client that leaves during them … ends the call" stands
for the request, but a standing question keeps the place until it is settled (F1); the `busy` sentence is F4's; the quiet calls that now hear `busy`
themselves are F5's D.3 bullet.]*

**The `CHANGELOG.md` entry** goes under `[Unreleased]` (`src_vs_code/CHANGELOG.md:8`), is **derived from the diff at the commit** and checked bullet by bullet
against the file and line each names, never copied from here (the parent's *Observations*); it covers the first paragraph above and nothing of the second, says
in one clause that 1.18.0's *or five minutes pass* no longer holds, and names no behaviour behind a bridge door. `research/module_extension.md:3610-3612` and
`:3620-3622` are corrected in the same commit (the place is freed by the click, never the timer; the timeout answers the call only; the late line's words; D.3; D14),
and `:3597-3598` gains the timeout beside the leaving client.
*[Superseded by the Amendment for epoch 8, F5 and F9: the entry is re-derived from the diff at the fixed commit, bullet by bullet, and the
`module_extension.md` paragraphs follow F1-F5.]*

**The prompt-site ledger** (`test/promptSiteLedger.ts`) changes three reasons (H13) and gains a row only if the coder's shape adds a site; `promptSites.test.ts` is the
proof either way (C17). The notice is one argument and is no site.

**M10** is recorded with this story's PR or in the parent's §7 M10 row by whoever runs it on a Windows machine, and does not block the merge: which button Enter
takes with `['Deny', 'Allow']`, whether Escape resolves the promise, whether a modal left an hour still resolves, whether a second modal stacks or queues.

**The `todo/README.md` row** for this spec is added in the commit that creates it (the E1 document's epoch 4 amendment, item 1).

## S5.12 — As built

*(Written by the coder, 2026-11-09. Commits on `feat/remote-bridge-e15`: `9c2a10e` (consent lifecycle, D.3, sentences, buttons, gate), `81e3f2f` (D14), `acdc0a8` (CHANGELOG, `module_extension.md`, C8b/C12), `c46b2ab` (listener fix, ledger-reasons test), and the commit that holds this section.)*

**What was built.** Every change of §S5.2 with the §S5.3 sentences copied byte for byte (`consentContract.test.ts` pins all four sentences as literals), the gate (`DialogEnd`, `ask`/`timedOut`/`answered`/`lateAnswer`/`ignored`/`apply`, `LATE_ANSWER_NOTICE`), `consentRefusal` and `countedOnPlace` as the one chooser, `BUSY_PLACE`, D.3 (`admit(…, followUp)`, `admitSilentPlace`, `BrokerDoor.asksAfter`), the buttons as data, D14 (`untilGone`, `executed` finishing on the gate, the two questions modal and raced on an agent call, `ctx.lateAnswer` from `performCall` down to `openVpnConnect` and `askToContinue`). `extension.ts` is unchanged (1003); `src_cli`, `src_mcp`, `src_broker_client`, `install.sh`, `creds-cli-itest.cjs` have an empty diff; `toolEnsure.ts`, `rotateAction.ts`, `sshUseActions.ts`, `grantRegistry.ts`, `sharedPrompt.ts`, `withTimeout.ts`, `agentConsent.ts` are untouched. `consentPlace.ts` was not created: the §S5.4 trigger did not fire (`credsAgentServer.ts` 792 ≤ 795; `aliasThrottle.ts` 491 < 700).

**Scenarios.** All 21 are built (C1, C1b-d, C2, C2r, C3, C3b, C3c, C4, C4b, C5, C6, C7, C8 a/b/c, C9, C9b, C10, C10b-d, C11, C11b, C12, C13, C14, C15, C16, C17, C18, C19 a/b, C20, C21) in `consentContract.test.ts` (34 tests: pure, gate-world, C18), `consentContractVpn.test.ts` (10 tests: D14, C8b/C12), `brokerConsentPrompted.test.ts` (C16, C21, K7 inverted), `bridgeLinks.test.ts` (C9b, see D6 below). RED was watched first against the stated reason for: C1, C1b, C1d, C2r, C3, C3b, C4, C4b, C5, C6, C13, C14, C15, C19 a/b (wrong sentence, a second dialog asked, no `ignored` detail or notice, buttons `[Allow, Deny]`, the `[SENTINEL]` unhandled rejection, the modal-ceiling `too_many_requests` in C13) and for C10, C10b, C10c, C11, C20, C18 (D14 and `untilGone` were not yet built: the abandoned line never came, `modal` was `false`, `untilGone` was not a function). Exceptions, said plainly: C1c's sentence and C9/C9b were written after the part of the code they test; C1c's sentence was green on the wiring of group 1 and is held by M5/M6, C9/C9b were watched RED by applying M10, and C16/C21/K3/K6/K7/`brokerAbandoned` were watched RED afterwards against `git show 4b81e78:…/brokerConsent.ts`. C7, C3c, C8a, C10d, C11b were green when written, as the spec says (guards).

**Mutations: 33 of 33 caught** (each applied to the file, the named test files compiled and run, restored; the file's sha-256 equal before and after in every row; the first red case of the table is among those listed; the harness is `mutate.py` in the session scratchpad, not committed). M26 is caught by an extra test, C17's reasons check, that §S5.6 did not plan (it said "by review only"); M30 was first written as "a `Promise.race` against an already-resolved `undefined`", which no test saw (the dialog's wrapper settles a microtask later), and was re-written as the same race against a `setImmediate`, which C21 (d) catches.

| # | Mutation | Red cases | Restored |
|---|---|---|---|
| M1 | `ask`/`timedOut` calls `dialogClosed` when the timer wins | C1, C1b, C1d, C2r, C4b | yes |
| M2 | `lateAnswer` calls `apply` | C2r, C3, C3b, C14, C16 | yes |
| M3 | `lateAnswer` reaches `deny` for a late Deny | C3b | yes |
| M4 | `apply` answers `timeout` for a dismissal | C5, C15, C19 (b) | yes |
| M5 | `consentRefusal` ignores `onPlace` | consentRefusal: a Deny is 403 `denied` with t, C1c, C3b | yes |
| M6 | `countedOnPlace` true for a local token call | countedOnPlace: a bridge's dialog, every door, C1c, C3b | yes |
| M7 | `countedOnPlace` false for a bridged token call | countedOnPlace: a bridge's dialog, every door, C1d | yes |
| M8 | sentence says *within 5 minutes* | C2, S5.3: the sentences of the contract, byte for | yes |
| M9 | `BUSY_PLACE` loses "a dependency step" | S5.3: the sentences of the contract, byte for, C8 (the words) | yes |
| M10 | `admit` ignores `followUp` | D, C9, C9b (D.3) | yes |
| M11 | `admitSilentPlace` stamps the asking window | D | yes |
| M12 | `asksAfter` in `doorFor` reads `=== true` | C9b (D.3) | yes |
| M13 | `consentButtons(true)` answers `[Allow, Deny]` | C6 (pure), C6 | yes |
| M14 | `consentButtons(false)` answers `[Deny, Allow]` | C6 (pure), C6 | yes |
| M15 | `{ modal: true }` for the person's own import question | C11b | yes |
| M16 | `openVpnConnect` not raced | C11 | yes |
| M17 | `askToContinue` not raced | C10c (runStep), C10c (settle) | yes |
| M18 | `executed` not raced (no gate listener, no gone check) | C10, C10b | yes |
| M19 | `untilGone` resolves `undefined` with no gate | C18, C10d, C11b, Co | yes |
| M20 | `ignored` detail keeps the old words | C3, C3b, C4, a client that leaves while the modal is open:, K6 | yes |
| M21 | `ignored` shows no notice | C3, C3b, C4, C16 | yes |
| M22 | notice shown for a dismissal too | C3c, C19 (a) | yes |
| M23 | `lateAnswer` passes `keep = followsUp` | C16, C21 | yes |
| M24 | `consentNotGiven` keeps its own timeout choice | C15 | yes |
| M25 | `KEPT_PLACE_MS` added | C7 | yes |
| M26 | the `shown` ledger reason left as it was | C17 | yes |
| M27 | `untilGone` never removes its listener | C18 | yes |
| M28 | `shown` has no rejection handler | C19 (a), C19 (b) | yes |
| M29 | `keep` computed before `stillWanted()` | C16, C21 | yes |
| M30 | `apply` reached when the dialog resolves in the timer's tick | C21 | yes |
| M31 | `executed`'s `finish` does not remove the gate listener | C20 | yes |
| M32 | `lateAnswer` not passed to `runVpn` | C10c (runStep), C10c (settle), C11 | yes |
| M33 | `performCall` builds `lateAnswer` with grant `—` | C11 | yes |

**Tests.** Full suite on the default Node (v26.12.1): 7035 tests, 7027 pass, 0 fail, 8 skipped. Node 22 (v22.23.4, through `npx -y node@22`): 7035 tests, 7027 pass, 0 fail, 8 skipped. Lint (complexity 4), typecheck, ratchet (`extension.ts` 1003, at baseline), `public-hygiene` (and its selftest) and `plan-lifecycle` are clean. The shared-rules submodule was initialised in the worktree (the tests need it; the pointer is unchanged and was never staged), so `plan-lifecycle` printed no `link` lines.

**Line counts (against §S5.4's plan).** `credsAgentServer.ts` 792 (≤ 795), `brokerConsent.ts` 372 (≤ 385), `aliasThrottle.ts` 491 (plan 485), `brokerMcpDoor.ts` 531 (≤ 532), `brokerProtocol.ts` 466 (≤ 468), `brokerRequests.ts` 373 (plan 372), `bridgeConsentText.ts` 88 (≤ 90), `requestLife.ts` 141 (plan 128), `vpnRun.ts` 280 (≤ 280), `vpnLauncherRun.ts` 178 (≤ 180), `dependencyRunHost.ts` 373 (plan 365), `useActions.ts` 172 (≤ 172), `brokerCall.ts` 247 (plan 243), `agentUseActions.ts` 436 (≤ 439), `extension.ts` 1003. Five files are over their hand estimate by 1 to 13 lines (§S5.9 says the estimate yields to `wc -l` and lint); no file is near 800. Tests: `consentContract.test.ts` 735, `consentContractVpn.test.ts` 376 (the D14 file is separate from the start: the cases would have passed 800 together), `brokerWorld.ts` 654, `vpnWorld.ts` 426.

**Where the code differs from the spec, and why.**

1. `ask` is `ask` + `timedOut` + `answered`, with `choiceOf` and `keepsPlace`; `admit` calls `admitQuiet`. The spec's shapes breach complexity 4 (`ask` 8, `apply` 5, `admit` 5). The order of effects and the arbitration are as written.
2. `untilGone` removes its listener in both settle handlers, not in a `finally`: a `finally` runs one microtask after the resolve, and C18 reads the listener count right after the `await`. It also handles a gate that has already fired (leave at once, no listener left).
3. `runStep` calls a small `ran(…)` that maps `'gone'` to `undefined` (the spec says `runStep` does); `runAll`, `runStep`, `settle` and `askToContinue` take the request (`startGate` and `lateAnswer`) instead of the bare gate, so both callers of `askToContinue` hand the field down.
4. `showWarningMessage` in the broker world is a helper (`shown`) so `world` stays under 120 lines; `brokerWorld` gained `buttons`, `notices`, `failDialogs`; `vpnWorld` gained `HeldDialog.modal`, `executions` with the option `holdExecutions`, the option `integration: 'absent'`, and `listenerCounts()`.
5. C10c: the rig of the spec (`integration: false`) makes `vpnWorld` close the terminal at once, so `askToContinue` at `runStep` is not reachable there. It is built with the new `integration: 'absent'` and `mock.timers` over the 10 s activation budget (the `runStep` caller), and a second case through a failed step (`settle`, the other caller). The modal check, the hang-up, the free place and the late `Continue` are as written.
6. C9b is in `bridgeLinks.test.ts` (its rig is there), and it **replaces** the test "a quiet (pre-consented) forwarding exec holds nothing", which asserted the opposite of D.3 and which §S5.4's list of touched tests did not name. The socket-down half is beside it.
7. The old "P3 through the main port, the REAL path" is deleted from `bridgePrompts.test.ts` and is C2r in `consentContract.test.ts`.
8. The §S5.11 CHANGELOG entry omits `create` from the quiet calls (see the question below) and names the folder verbs with `create`/`delete`: `consentNotGiven` serves `brokerFolderDoor.ts` too, and that door is admitted on the place (`:142`). No test of its own for the folder timeout.
9. `brokerConsent.ts`'s doc comments at the file head and on `ConsentGateDeps.dialogClosed` were rewritten; `aliasThrottle.ts`'s two comments naming "the 5-minute timeout"/"timed out" too; `module_extension.md`'s three places named in H15 and two new paragraphs (D.3, D14) are written from the diff.

### S5.12 (epoch 8) — the fix-forward as built

*(Written by the coder, 2026-11-09. Commits: `385c324` (F2, F3, F4, F6, F7, F8b, F8c and their test infrastructure), `b9afa3c` (F1, F8a), `9c2d60a` (the ledger site kept in `openVpnConnect`), `20dff43` (F5, F9: the CHANGELOG entry and `module_extension.md`), and the commit that holds this section.)*

**What was built.** F1: `TokenlessCeilings.followUpStands` (marks the holder's dialog as on screen and closes it with `keep = true` when the question's promise settles, by any road; nothing for a local token call), the seam `CallDeps.standing` / `UseActionContext.standingPrompt` (one line in `credsAgentServer.ts`), threaded exactly as `lateAnswer` is (`VpnUseDeps.open`'s sixth parameter, `agentVpnOpener`, `runVpn`'s ninth, `VpnRunContext`, `vpnDependencies`, `DependencyRunRequest`), and called before the race at both question sites; `executed` (the running step) calls nothing. F2: the two sentences of §4.10, byte for byte, pinned as literals in three test files. F3: `shown` wraps the call in the promise executor. F4: `BUSY_PLACE` as A8.2 writes it. F5: the CHANGELOG entry re-derived from the diff `455567a..HEAD -- src_vs_code/src`, each bullet citing the file and line it names (checked with `grep -n` at the last source commit), nothing bridged named. F6: the Enter comment. F7: F7a, a guard. F8: `executed` reads the gate before it types and answers `'untyped'`, `ran` ends the step as `runStep`'s own check does; `timedOut`'s continuation and `untilGone`'s `onLate` drop a throw. F9: the `module_extension.md` paragraphs (the place, the late answer, `busy`, D.3, D14). `extension.ts` is unchanged (1003); the clients, `brokerFolderDoor.ts`, `toolEnsure.ts` and `consentTurns.ts` are untouched.

**Scenarios.** F1a (both callers, and `Stop`), F1b, F1c, F1e, F1f (i)-(iv), F2a (C3, C4, K6, `brokerAbandoned` updated), F2b (inside F1a (iii)), F2c, F2d, F3a, F4a (C8's words), F4b (C9, C9b with their facts), F7a, F8a, F8b, F8c. RED was watched before the code for F1a, F1b, F1c (the exec and the MCP `up` were let in over the question), F1f (`followUpStands is not a function`), F2c and F2d (the old words), F3a, F8a (the chain threw `after a dependency step had been typed`), F8b and F8c (an unhandled rejection). F2a (C3, C4, K6, `brokerAbandoned`) and F4a were updated together with the code and were watched red through M41, M43, M45 and M46. Guards, green when written, with their mutations' red outputs: F1d (C10, C10b: M52), F1e (M36), F7a (M47).

**Mutations: M34-M52, 19 of 19 caught** (each applied, the named test files compiled and run, restored; the file's sha-256 equal before and after in every row; the harness is `mutate8.cjs` in the session scratchpad, not committed). M52 makes the unsettled question keep the test process alive; the run was ended by hand after C10 and C10b had printed red.

| # | Mutation | Red cases | Restored |
|---|---|---|---|
| M34 | `openVpnConnect` does not call `standingPrompt` | F1b | yes |
| M35 | `askToContinue` does not call `standingPrompt` | F1a (runStep), F1a (settle), F1c | yes |
| M36 | `followUpStands` closes with `keep = false` | F1e, F1f (iv) | yes |
| M37 | `followUpStands` attaches no close | F1a (runStep), F1a (settle), F1c, F1b, F1e, F1f (i), F1f (iii), F1f (iv) | yes |
| M38 | `followUpStands` skips the `doorOfDialog` check | F1f (ii) | yes |
| M39 | the close is attached for fulfilment only | F1f (iii) | yes |
| M40 | `credsAgentServer.ts` omits `standing` from the literal | F1a (runStep), F1a (settle), F1c, F1b | yes |
| M41 | `brokerConsent.ts`'s detail keeps *nothing ran* | C3, C3b, C4, F2c, F2d, a client that leaves while the modal is open: a la | yes |
| M42 | `brokerCall.ts`'s detail keeps *nothing ran* | F1a (runStep), F1a (settle), F1b | yes |
| M43 | `LATE_ANSWER_NOTICE` keeps the old words | C3, C3b, C4, F2c, F2d | yes |
| M44 | `shown` evaluates `showWarningMessage` outside the promise | F3a | yes |
| M45 | `BUSY_PLACE` loses the quiet clause | S5, C8 (the words) | yes |
| M46 | `BUSY_PLACE` ends with *the next request is then asked.* | S5, C8 (the words) | yes |
| M47 | `consentNotGiven` passes `onPlace = false` | C15, F7a | yes |
| M48 | `executed` types before it reads the gate | F8a | yes |
| M49 | `ran` maps `'untyped'` like `'gone'` | F8a | yes |
| M50 | `timedOut`'s continuation without its guard | F8b | yes |
| M51 | `untilGone`'s `onLate` without its guard | F8c | yes |
| M52 | `executed` (the running step) calls `standingPrompt` | C10, C10b | yes |

**Tests.** Full suite on the default Node (v26.12.1): 7049 tests, 7041 pass, 0 fail, 8 skipped. Node 22 (v22.23.4, through `npx -y node@22`): 7049 tests, 7041 pass, 0 fail, 8 skipped. Lint (complexity 4, 800 lines), typecheck, ratchet (`extension.ts` 1003, at baseline), `public-hygiene` and its selftest, and `plan-lifecycle` are clean.

**Line counts (against A8.5).** `credsAgentServer.ts` 793 (plan 793, ≤ 795), `aliasThrottle.ts` 506 (≤ 510), `brokerConsent.ts` 374 (≤ 378), `brokerCall.ts` 249 (≤ 252), `useActions.ts` 176 (≤ 178), `requestLife.ts` 150 (≤ 150), `vpnRun.ts` 284 (≤ 288), `vpnLauncherRun.ts` 180 (≤ 182), `dependencyRunHost.ts` 384 (≤ 388), `agentUseActions.ts` 436 (≤ 442), `bridgeConsentText.ts` 88, `extension.ts` 1003. Tests: `consentContractVpn.test.ts` 477 (≤ 650), `consentContractEpoch8.test.ts` 269 (≤ 450), `consentContract.test.ts` 737 (≤ 760), `brokerWorld.ts` 663 (≤ 670). No file over 800; `consentPlace.ts` not created.

**Where the code or the tests differ from A8, and why.**

1. `openVpnConnect` calls a small `untilSettled(ctx, question)` for the standing-prompt call and the race, and asks the question itself inline: the first shape (a helper that also asked) changed the prompt-site ledger id, and `promptSites.test.ts` caught it. The call is made before the race, with the question's own promise, as A8.2 says; the ledger ids are unchanged.
2. `ran` is now the helper that returns a `StepEnd` (A8.2 says `ran` "holds the new branch"); `runStep` returns `ran(…)`.
3. F1f and F8c are in `consentContractEpoch8.test.ts`, not `consentContract.test.ts`: with them that file passed the 800-line lint ceiling (830). F8b is in `brokerConsentPrompted.test.ts`, not the new file: `gateOver` lives there and is not exported.
4. F4b asserts the facts (`w.dialogs.length === 0`, the quiet call still held) beside the constant, through the imported `BUSY_PLACE`, so it is not red under M45; the words are F4a's (C8's words and the S5.3 literal), which M45 and M46 turn red.
5. F3a runs through the wall world, which gained the option `throwDialogs` (passed to `brokerWorld`'s).
6. F1c's never-ask rig is `rig(…, quiet = true)` (`mcpPreConsented`), and the shared helpers (`answeredNow`, `leaveAndSettleLate`) use the event loop's immediates because the *Continue* roads need a mocked `setTimeout`.

**Reading Q8-1 as A8.6 does:** "one dialog on screen" is `r.vw.held.length === 1` with `r.bw.openDialogs.length` and `r.bw.buttons.length` unchanged; no scenario needed the broker world's `dialogs` for it.

### S5.12 (epoch 8, review fixes) — change 8.1, the CHANGELOG against 1.18.0, the call's own holding

*(Written by the coder, 2026-11-09, after the Opus review and the coai code round of the fix-forward.)*

**1. Change 8.1 and the reload remedy.** `BUSY_PLACE` is now, byte for byte (one static sentence, its help naming every possible holder):

> Another request holds this window's dialog place. A consent dialog may be standing unanswered, a prompt the request raised after its consent, asked or not, may be open (a PIN box, an install offer, a trust modal, a VPN question), a dependency step may still be running in a terminal, or a request that may prompt again may still be running with nothing on screen yet, in the VS Code window that owns the place. Answer or finish it there, or wait for the running request to end; then try again. If nothing is on screen there, reloading that window frees the place.

The last sentence is the remedy §4.10's *Not established* paragraph says the help names. It is true: the place is `TokenlessCeilings.flight`, one in-memory object per broker (`credsAgentServer.ts:67`), and `aliasThrottle.ts` persists nothing; a reloaded window builds a fresh broker. A test pins this (`consentContractEpoch8.test.ts`, "the reload remedy is true": a fresh `TokenlessCeilings` is free while the held one stays busy, `aliasThrottle.ts` has no file or state store, one `TokenlessCeilings` per broker); a real window reload cannot be run in this rig, so that is as far as it goes. C8 and F4a (the S5.3 literal, the words test) carry both changes; F1c (the never-ask road) asserts that the fifth caller hears *a prompt the request raised after its consent, asked or not* and *a VPN question*. The CHANGELOG busy bullet and `module_extension.md` repeat the help.

**2. The CHANGELOG against `extension-v1.18.0`.** The Escape bullet's "before" was false against 1.18.0. There `shown` was an async method with a `try`/`finally` (`brokerConsent.ts:189-201` at the tag), so a dialog that threw before it opened freed the place and the call was answered 500 `internal` with `UNANSWERED_FAILURE` (observed by running the tag's `brokerConsent.ts` under F3a: `500 internal`, *The request failed inside this window…*); a dialog whose promise rejected after it opened was an unhandled rejection (`withTimeout` has no rejection handler) and kept the place until the five-minute timer answered the call as a timeout (observed under C19 (b): the sentinel error unhandled). The bullet now says exactly that, and gives the per-verb dismissal sentences, each verified in code and by a test: *The human did not allow this grant.* (`GRANT_NOT_ALLOWED`, `brokerRequests.ts:30`; C5), *…did not allow this.* for `create` and the folder verbs (`brokerMcpDoor.ts:495`, `brokerFolderDoor.ts:176`; C15, F7a), *…this deletion.* for `delete` (`brokerMcpDoor.ts:324`; C15). Every other bullet's "before" was checked against the tag, not against this PR's history: the busy sentence (`aliasThrottle.ts:435` at the tag), the timeout sentences (`credsAgentServer.ts:650-651`, `brokerMcpDoor.ts:155`), the late line's old words (`brokerConsent.ts` `ignored`), the quiet call taking no place (`brokerMcpDoor.ts:213`, `door.admit(res, prompts)`), and the questions being toasts awaited with no race (`vpnRun.ts`, `dependencyRunHost.ts`); all hold. The line citations were re-taken after the edits.

**3. The call's own holding (coai finding 0).** `followUpStands(owner, grant, via, prompt)` no longer marks `flight.holder()`, the global holder. `TokenlessCeilings.admit` takes the call's response object as `owner` (the one argument added to the call in `credsAgentServer.admitAliasCall`, in place) and records the holding that admission took (`Admission.held`, set by `holding`; a quiet call that takes no place has none) in a `WeakMap`; the seam marks that holding, and `OneInFlight.prompted` and `dialogClosed` already ignore a holding that no longer owns the place. So a call that holds nothing, or whose holding was given back, can mark nothing of another call's. F1g (two tests, RED first: the other call's release left the place busy until the stranger's question settled; and a stale call marked the next holder's place) pins both; F1f is updated to the new signature. M55 and M56 are its mutations.

**Mutations, re-run at the final code.** M34-M52 were all applied again (the strings of M38 and M40 follow the new code): 19 of 19 caught, hashes restored. New rows, 4 of 4 caught:

| # | Mutation | Red cases | Restored |
|---|---|---|---|
| M53 | `BUSY_PLACE` goes back to *a prompt that followed an Allow* | S5, C8 (the words), F1c | yes |
| M54 | `BUSY_PLACE` loses the reload remedy | S5, C8 (the words) | yes |
| M55 | `followUpStands` marks the global holder (`this.flight.holder()`) | F1g | yes |
| M56 | the throttle never records which holding a call owns | F1f (i), F1f (iii), F1a (runStep), F1a (settle), F1c, F1b | yes |

Counts: `aliasThrottle.ts` 519 (A8.5 planned ≤ 510: over by 9 for `owned`, `claimed` and `held`; the trigger of §S5.4 is 700), `credsAgentServer.ts` 793, `consentContractEpoch8.test.ts` 318. The suite totals are in the report of this round.

## S5.13 — Questions for the coordinator

- **Q1. §S5.11's "a quiet local MCP call of `create`, …" is false for `create`.** A create is never quiet: `confirmAndCreate` admits with `door.admit(res, true)` (`brokerMcpDoor.ts:385`), and only `handleMcpUse` reads the flag (`:223`). The calls that hold the place quietly are `terminal`, `up`, `down`, `rotate`, and `exec` on a forwarding entry with the agent up (the five flags of H9). The CHANGELOG says so; the spec sentence was not changed.
- **Q2. §S5.4 does not list `bridgeLinks.test.ts:403`**, a test that pins today's "a quiet forwarding exec holds nothing" and turns red under D.3 by design. It was inverted into C9b (difference 6). Please confirm that is the intended owner of C9b.
- **Q3. The folder verbs hear the place clause on a timeout** (difference 8): `consentNotGiven`'s one `true` serves them, because they are admitted on the place. §S5.2 names only `create` and `delete`. Built as the chooser's rule says; say so if the parent wanted the folder's old sentence.
- **Q4. §S5.6 M26 "by review only"** is now caught by a test (C17's reasons check). It reads three words of three rows, so it proves the words and not their truth: the review checklist item 9 still stands.

**Epoch 8, from the fix-forward's build.** No question changes the contract. Three things for the coordinator's eye, all in *Where the code or the tests differ from A8* above: the place of F1f, F8b and F8c in the test files (difference 3), F4b observing facts through the imported constant (4), and the helper `untilSettled` that keeps the import question's ledger site where it was (1). M52 leaves the unsettled question holding the test process; it was ended by hand after the two named cases printed red.

**Answers (coordinator, 2026-11-09).** Q1: the code is right and §S5.11's sentence was wrong; `create` is struck from it above. The parent's D.3 row names no action, so this repairs the spec and is not a plan change. Q2: yes, `bridgeLinks.test.ts` owns C9b. Q3: the folder verbs hearing the place clause is the per-door rule of §4.10 applied to a door counted on the place, the same reading as Q-B, which two of two consultants judged not a change; it stays, and the CHANGELOG names the folder verbs. Q4: accepted; review item 9 stands.

## Amendment for epoch 8 (2026-11-09)

*(Written for the spec's writer by the coordinator's stand-in, after the parent's sort (`### Re-review for epoch 8`, its `cut` rows) and the
opening of epoch 8 (`2fa03e0`). The contract is the parent's §4.10 at that commit: the head's place rule, *The lifecycle, three facts apart*
(`todo/PLAN_remote_bridge_scoped.md:576-596`), the list *E1.5 after the stop: the fix-forward* (`:600-610`), §7's consent-contract case (`:725`)
and §9's dialog-place line (`:793`). Nothing in the contract is changed here; where it could not be built as written, the point is under
*Questions for the plan (epoch 8)* below. Every `file:line` here was opened on `feat/remote-bridge-e15` at `6e4cccd` (PR #323's head with `main`
merged in) on 2026-11-09; paths are relative to `src_vs_code/src/` unless they say otherwise. None of this is new scope.)*

### A8.1 — What F1-F5 supersede, and what replaces it

The old text stays where it is, marked *[Superseded …]* with a pointer to this section.

| Section of this spec | Superseded by | What replaces it |
|---|---|---|
| §S5.1 item 3 (the words *nothing ran* of the one late sentence) | F2 | the detail `"<button>" answered after its call had ended; the answer changed nothing` and F2's notice; one road for both late cases stands |
| §S5.1 item 7 (D14's races, read as freeing the place when the client leaves) | F1 | the races stand; the request ends at once, but a standing import or *Continue* question keeps the place until a person settles it |
| §S5.2's code block: the late words, `shown`'s wrap, the Enter clause, `onLate`, `executed`'s order | F2, F3, F6, F8, F1 | A8.2's items; the marker under the block lists them |
| §S5.3 item 1 (`BUSY_PLACE`) | F4 | F4's sentence below, byte for byte |
| §S5.3 items 3 and 4 (the line's words, the notice) | F2 | F2's two sentences below, byte for byte |
| §S5.8 item 2 (the late line's words) | F2 | the same rule, F2's words |
| §S5.8 item 6 (D14 frees on the client's leaving) | F1 | the place is a standing question's until it settles |
| §S5.8 item 12 (the late click's line words) | F2 (and F1: that click frees the place) | F2's words |
| Scenarios C3, C4 (the words of the detail and the notice) | F2 | F2a; their facts stand |
| Scenario C8 (the words of `BUSY_PLACE`) | F4 | F4a, and F4b adds the quiet holder |
| Scenario C10c (both test cases) as written | F1 | F1a; "the place free before the click" is change 7.3's defect |
| Scenario C11 as written | F1, F2 | F1b |
| §S5.11's two paragraphs (what a local user reaches; the `CHANGELOG.md` entry and `module_extension.md`) | F5, F9 | A8.2 F5: the entry re-derived from the diff at the fixed commit; the module text follows F1-F5 |

Not superseded, and kept as built: everything else of §S5.0-§S5.12, the 21 scenarios' facts, M1-M33, C10 and C10b (the running step with no question
up still frees the place at the call's end, the plan's lifecycle row *The client leaves while a dependency step runs and no question is up*).

### A8.2 — F1-F8, buildable

Each item: the change, the exact sentences, the files, the scenarios (Start / Transition / Expected, RED first, the fact observed beside any words).
Doors and worlds as §S5.5. The D14 rig is `test/consentContractVpn.test.ts`'s `rig` (`:48-63`): `r.bw` is the broker world (consent modals in
`r.bw.dialogs` / `r.bw.openDialogs`, their buttons in `r.bw.buttons`), `r.vw` the VPN world (the follow-up questions in `r.vw.held`, each with `modal`).
**Reading of the plan's observation:** where §4.10's F1 says `w.dialogs.length === 1` for a follow-up question, this rig observes it as
`r.vw.held.length === 1` (one question on screen) beside `r.bw.openDialogs.length` unchanged (no new consent modal); see question Q8-1.

#### F1 — the place outlives the request on the D14 roads (change 7.3)

**The change (the sketch is decided here: a `standingPrompt` seam beside `lateAnswer`).** When an agent call's follow-up question is on
screen, the throttle is told that a dialog of the call's own holding stands; when the question's promise settles, by any road, the dialog is
closed with `keep = true`. `OneInFlight` already does the rest (`aliasThrottle.ts:187-204`): while the dialog stands, `released` frees nothing
and remembers `endedId`; at the settlement, `dialogClosed(held, true)` keeps the place for a call still running (the flag's kept place, as
today) and frees it for a call that has ended. So the request ends at once when its client leaves (its `ABANDONED` line, nothing more typed or
written), and the place frees at the person's click, with no timer. The precedent is `consentTurns.ts` (a turn holds its key until its work settles).

1. `aliasThrottle.ts`, `TokenlessCeilings`, a new public method beside `prompted` / `dialogClosed` (`:399-421`):
   ```ts
   /**
    * A follow-up prompt of the holder's own call is on screen (F1): the place is that prompt's until it settles, whatever the call does meanwhile,
    * and then the call's until its release. Nothing for a local token call, which is counted on no door. Every road that reaches a follow-up
    * question holds the place as the call's: an asking call by its flag's kept place, a quiet one by D.3.
    */
   followUpStands(grant: { bridge?: { context: { bridgeId: string } } }, via: AuditDoor, prompt: PromiseLike<unknown>): void
   //   const held = doorOfDialog(grant.bridge?.context.bridgeId, via) === undefined ? undefined : this.flight.holder();
   //   if (held === undefined) { return; }
   //   this.flight.prompted(held);
   //   const settled = (): void => this.flight.dialogClosed(held, true);
   //   void Promise.resolve(prompt).then(settled, settled);      // a rejection settles it too; `settled` cannot throw
   ```
   No modal stamp: the follow-up question is not a consent dialog and is not counted in the modal window (as today).
2. `brokerCall.ts`: `CallDeps` gains `standing?(prompt: PromiseLike<unknown>): void;` with a doc line; `startNow`'s context literal (`:201`) gains
   `standingPrompt: deps.standing`. `credsAgentServer.ts`, `runAndDeliver`'s literal (`:677-690`), **one line**:
   `standing: (prompt) => this.ceilings.followUpStands(grant, via, prompt),`.
3. `useActions.ts`, `UseActionContext` (`:54-59`): `readonly standingPrompt?: (prompt: PromiseLike<unknown>) => void;`, doc: *Set by the broker: a
   prompt of this action's own is on screen; the one dialog place is that prompt's until it settles. Absent for a start that serves no request.*
4. Threaded exactly as `lateAnswer` is, beside it: `VpnUseDeps.open` (`agentUseActions.ts:51`) a sixth parameter `standingPrompt?`;
   `vpnAction.run` (`:418`) passes `ctx.standingPrompt`; `agentVpnOpener` (`vpnRun.ts:38-40`) passes it on; `runVpn` (`:77-86`) a ninth parameter,
   put on the context (`:95`); `VpnRunContext` (`vpnLauncherRun.ts:44`) the field; `vpnDependencies` (`:49`) copies it; `DependencyRunRequest`
   (`dependencyRunHost.ts:47`) the field; the `Pick<…, 'startGate' | 'lateAnswer'>` of `runAll`, `runStep`, `settle`, `askToContinue`
   (`:234,286,312,360`) gains `'standingPrompt'`.
5. The two question sites call it **before** the race, with the question's own promise:
   - `openVpnConnect` (`vpnRun.ts:222-226`): `const question = vscode.window.showInformationMessage(IMPORT_QUESTION, { modal: ctx.startGate !== undefined }, IMPORT_BUTTON);`
     `ctx.standingPrompt?.(question);` then `untilGone(question, ctx.startGate, …)` as built.
   - `askToContinue` (`dependencyRunHost.ts:360-368`): the same shape with its question.
   The call stays in the same function, first of its kind, so both prompt-site ledger ids are unchanged and C17 stays green.
   `executed` (the running step) calls nothing: no question is up, and the place frees at the call's end (C10 stays as built).
6. Texts that become false with F1 and are corrected in the same commit: the comment `vpnRun.ts:220-221` (*a client that leaves frees the place
   at once*) → *a client that leaves ends the request at once; the question keeps the place until a person settles it, and a click that lands
   later is journalled and does nothing*; the file docblock `dependencyRunHost.ts:20-22` (*the call ends when its client leaves and frees the one
   dialog place*) → *the call ends when its client leaves; a standing question keeps the one dialog place until it is settled, a running step
   with no question up does not*; the header `test/consentContractVpn.test.ts:16-18` (*A client that leaves frees the place*) the same; the
   titles of C10c and C11 (`:170`, `:198`, `:251`) are replaced by F1a / F1b's.
7. The rig's `open` (`test/consentContractVpn.test.ts:58-61`) forwards the sixth argument.

**Files:** `aliasThrottle.ts`, `brokerCall.ts`, `credsAgentServer.ts` (+1), `useActions.ts`, `agentUseActions.ts`, `vpnRun.ts`,
`vpnLauncherRun.ts`, `dependencyRunHost.ts`; tests `consentContractVpn.test.ts`, `consentContract.test.ts` (F1f).

**Scenarios** (through the MCP door of the main port unless said; `execAsk` is the local alias door; `assertBusy` / `assertPlaceFree` as `:84-99`):

| # | Scenario | Start | Transition | Expected | RED first, because |
|---|---|---|---|---|---|
| F1a | *Continue* keeps the place after its client leaves (replaces C10c, both callers: `runStep` with `integration: 'absent'`, and `settle` after a failed step) | C10c's rig and timers; an agent `up` Allowed; the *Continue* question held | (i) hang up; (ii) an alias `exec` and an MCP `up`; (iii) click `Continue` late; (iv) an alias `exec` | after (i): one `ABANDONED` line with *after a dependency step had been typed*; after (ii): both `429` with `BUSY_PLACE` at once, `r.vw.held.length === 1`, `r.bw.openDialogs.length` unchanged and `r.bw.buttons` has no new `['Allow', 'Deny']` entry (no Allow-first modal opened over the question); after (iii): one `ignored` line whose detail is `"Continue" answered after its call had ended; the answer changed nothing` and which does not contain `nothing ran`, beside the same call's `ABANDONED` line, which says a step was typed; the chain terminal's `sent` is `['a-step']`; after (iv): the call is asked and runs (`assertPlaceFree`). A variant clicks `Stop` late: the same, and the place frees | as built the place is freed at (i): (ii) is asked and a consent modal opens over the question |
| F1b | The OpenVPN Connect question keeps the place (replaces C11) | C11's rig (`CONNECT` mocks), an agent `up` Allowed, held by `/Import this profile/` | (i) hang up; (ii) an alias `exec`; (iii) click `Import profile` late; (iv) an alias `exec` | after (i): one `ABANDONED` line (*as the action was starting — it was not launched*); (ii): `429` `BUSY_PLACE`, `r.vw.held.length === 1`, no new consent modal; (iii): one `ignored` line, action `up`, the grant's describe, detail `"Import profile" answered after its call had ended; the answer changed nothing`; no file under the storage dir, no VPN terminal, `r.bw.ran` unchanged; (iv): asked and runs | as built (ii) is asked |
| F1c | Five never-ask `up`s, each hung up at its question: one question, four `busy` (the Fable finding) | the D14 rig with `mcpPreConsented: true` (no consent modal: D.3 holds the place for the quiet `up`); `integration: 'absent'` | send `up` #1, wait for its question, hang up; then send `up` #2-#5, hanging each up if it reaches a question | `up` #2-#5 are each `429` `BUSY_PLACE` at once; at the end `r.vw.held.length === 1` (one modal), `r.bw.dialogs.length === 0`, exactly one `ABANDONED` line, `r.gates.length === 1` (only one `up` reached its action); then a late `Stop` on the one question frees the place: a sixth `up` reaches its own question | as built each `up` is admitted after the previous hang-up: five questions, no `busy` |
| F1d | The running step with no question is unchanged | C10 and C10b as built | — | as built: the place frees at the call's end | guards; they go red under M52 |
| F1e | A question answered while the client is still there keeps the call's place, as today | the F1a rig, chain `a`, `b`; the `b` step's execution held | click `Continue` in time; during step `b` an alias `exec`; then end step `b` | the alias `exec` is `429` `BUSY_PLACE` while `b` runs (the kept place, by the flag); after the `up` answers, an alias `exec` is asked and runs | green as built; a guard against M36 (a close with `keep = false` frees the place while the call still runs) |
| F1f | The seam, by unit (`TokenlessCeilings`) | a holder admitted asking on the local door | (i) `followUpStands({}, 'mcp', p)`, then release the holder, then settle `p`; (ii) the same with `via: 'token'` and no bridge while another holding holds the place, then release that holder; (iii) as (i) with `p` rejecting; (iv) settle `p` before the release | (i) `admit(true)` is `busy` after the release and admitted after the settlement; (ii) the place is free at the release: `followUpStands` marked nothing; (iii) as (i): a rejection frees too, no unhandled rejection; (iv) `busy` until the release, admitted after it | new method; RED as a missing method |

**Mutations (A8.3):** M34-M40, M52.

#### F2 — the late-answer words (change 7.2)

**The sentences, byte for byte from §4.10 (the late-click row, `:565`, its line and its notice; F2 at `:603`):**
- journal detail, outcome `ignored`: `"<button>" answered after its call had ended; the answer changed nothing` (the button's own word: `Allow`,
  `Deny`, `Continue`, `Stop`, `Import profile`);
- notice (`LATE_ANSWER_NOTICE`): `That request had already ended, so this answer changed nothing.`

**Roads and what the speaker knows.** The gate's late road (`brokerConsent.ts:282-288`, `ignored`) knows that the call had ended and that this
answer decided nothing (`lateAnswer` never reaches `apply`); `performCall`'s seam (`brokerCall.ts:206-210`) knows the same for `up`'s questions.
Neither knows what ran before the call ended (the same call's `ABANDONED` line says that) nor what the next call will do, so neither says it.

**The change.** `brokerConsent.ts:160` (the notice) and `:286` (the detail); `brokerCall.ts:208` (the detail). Doc comments that quote the old
words follow. No other file names them in `src` (grepped: `nothing ran` appears elsewhere only in `dependencyRunHost.ts:181,185` and
`oneUseLane.ts:36`, which are other sentences and stay).

**Scenarios** (a new file, `test/consentContractEpoch8.test.ts`, for F2-F4, F7, F8b; `consentContract.test.ts` is 735 lines and would pass 800):

| # | Scenario | Start | Transition | Expected | RED first, because |
|---|---|---|---|---|---|
| F2a | The words on the gate's road (C3, C3b, C4, K6 and `brokerAbandoned.test.ts:88-89` updated to import the constant and the new detail) | C3 / C4 as written | as written | their facts as written (no `ALLOWED`, `w.ran` empty, no stamp, the next call asked), and the detail and `w.notices` are F2's; no `ignored` detail contains `nothing ran` | the old words |
| F2b | The typed-step road | F1a | — | asserted in F1a (iii): the late line beside the same call's `ABANDONED` line *after a dependency step had been typed*, and the late line does not deny it | the old words claimed *nothing ran* |
| F2c | Two dialogs on one local token: the notice still true when the next call is not asked | a local token call, `consentTimeoutMs: 100`; after its 504, a second call on the same token raises the second dialog (C1c) | Allow the newer (`openDialogs[1]`); then Deny the older (`openDialogs[0]`); then a third call on the same token | the second call is `200` and runs; the late Deny writes one `ignored` line `"Deny" answered after its call had ended; the answer changed nothing`, no `DENIED` line, and the notice is F2's; the third call is `200` with **no** new dialog (`w.dialogs.length` unchanged) and runs: the next call was not asked, and the notice promised nothing about it | the old notice (*The next one will ask again*) is false here |
| F2d | A policy turned to never-ask while the dialog stands | a local MCP call of an action with no follow-up flag, its lookup a `mcpResolve` closure whose `preConsented` reads a mutable `policy` (`brokerWorld.ts:333`), `policy = 'every12h'`, `consentTimeoutMs: 100` | wait for the 504; set `policy = 'never'`; Allow the standing dialog late; then a second MCP call | the late Allow: one `ignored` line, F2's notice, no `ALLOWED`; the second call is `200` with no new dialog and an `allowed without a prompt` line | the old notice is false here |

**Mutations:** M41-M43.

#### F3 — a prompt that cannot open frees the place

**The change.** `shown` (`brokerConsent.ts:236-241`) wraps the call itself:
`return new Promise<string | undefined>((resolve) => resolve(vscode.window.showWarningMessage(…))).then(answered, failed)` — the executor runs
synchronously, so a synchronous throw becomes the rejection that the existing handler turns into `{ kind: 'failed' }`. Before the timer, that end
is `answered` → `stillWanted()` → `dialogClosed(question, false)` → `apply` → `dismissed`: 504 `consent_timeout` with *The human did not allow this
grant.* (`GRANT_NOT_ALLOWED`, unchanged), no notice, no line, `onUserPresent` not called. Nothing else changes; the method keeps its name (ledger id).

**Files:** `brokerConsent.ts`; `test/brokerWorld.ts` gains the option `throwDialogs: number` (the first *n* `showWarningMessage` calls throw
synchronously and record nothing in `w.dialogs`).

| # | Scenario | Start | Transition | Expected | RED first, because |
|---|---|---|---|---|---|
| F3a | A modal that throws synchronously | `throwDialogs: 1`, a `process.on('unhandledRejection')` spy for the test | a local alias call; then a second local alias call | the first is 504 `consent_timeout` with `GRANT_NOT_ALLOWED`; `w.dialogs.length === 0`; no `ignored` line, no notice, `w.presence` unchanged; the second call is **asked** (`w.dialogs.length === 1`), Allowed, runs; the spy recorded nothing | as built the throw escapes `shown` with the place held (`prompted` at `:205`) and nothing on screen: the second call is `busy` |

**Mutation:** M44. Supersedes nothing in the spec (§S5.1 item 11 meant it).

#### F4 — `BUSY_PLACE` names the quiet holder

**The sentence (one static sentence, one static help; `aliasThrottle.ts:278-279`), byte for byte:**

> Another request holds this window's dialog place. A consent dialog may be standing unanswered, a prompt that followed an Allow may be open (a PIN box, an install offer, a trust modal), a dependency step may still be running in a terminal, or a request that may prompt again may still be running with nothing on screen yet, in the VS Code window that owns the place. Answer or finish it there, or wait for the running request to end; then try again.

The first sentence is §4.10's (the row *The dialog is on screen*, `:563`). The clause *a request that may prompt again may still be running with nothing on screen yet* is
F4's (`:605`); an orphaned follow-up question is *a prompt that followed an Allow*. **The last sentence is rewritten, and the rule is why:** the
built tail *Answer or finish it there; the next request is then asked.* claims what the next call will do, which the `busy` speaker does not know:
the quiet D.3 caller hears `busy` (`brokerMcpDoor.ts:223`, admitted with `prompts` false) and is never asked afterwards, and a call on a grant
allowed meanwhile is not asked either. The new tail says only what the person can do. Every clause is a *may*, so the help is true whichever
holder stands. **Roads:** every asking call on a counted door while the place is held, and a quiet call with the follow-up flag; never a local
token call (`doorOfDialog`).

**Files:** `aliasThrottle.ts` (the constant and its doc, which says "the four things" → "the things"); tests import the constant.

| # | Scenario | Start | Transition | Expected | RED first, because |
|---|---|---|---|---|---|
| F4a | The words (C8 (the words), `consentContract.test.ts:49`) | pure | — | `BUSY_PLACE` equals the sentence above; it contains `nothing on screen yet` and does not contain `is then asked` | the built sentence |
| F4b | The quiet holder, observed beside the words (C9b, `bridgeLinks.test.ts:403`, and C9, `consentContract.test.ts:629`, extended) | a quiet forwarding `exec` with the agent socket up, its run held | an asking alias call | `429` with `BUSY_PLACE` **and** `w.dialogs.length === 0` **and** the quiet call still running (its hold not released) | the words lack the clause (the facts are green as built) |

**Mutations:** M45, M46.

#### F5 — the `CHANGELOG.md` entry, re-derived from the diff at the fixed commit

Not words to copy (the parent's *Observations* rule): after F1-F4 and F6-F8 are built, the coder reads `src_vs_code/CHANGELOG.md:9-41` against
the diff `455567a..HEAD -- src_vs_code/src` bullet by bullet. What each bullet must state, with the case that observes it:
- the D.3 bullet (`:32-36`): a quiet `terminal`, `up`, `down`, `rotate`, or `exec` on an entry forwarding the agent while it runs, is itself
  refused *busy* while the place is held, where before no quiet call heard *busy*; other quiet calls are unchanged (C9, C9b: a second quiet call `busy`);
- the D14 bullet (`:37-41`): the request ends when its client leaves; a standing import or *Continue* question keeps the place until you
  answer it; a running step with no question up gives the place back when the call ends (F1a-F1c, C10);
- the late-answer bullet (`:25-28`): F2's line and notice; no *nothing ran* (F2a-F2d);
- the `busy` bullet (`:15-18`): F4's sentence, the quiet request included (F4a);
- the Escape bullet (`:29-31`): a modal that cannot open at all is read as a dismissal too (F3a);
- nothing bridged is named (R1): not the button order, not a bridged door.
The `research/module_extension.md` paragraphs (`:3610-3628`, `:3637-3640`, `:3642-3648`) follow F1-F5 from the same diff (F9).

#### F6 — the Enter comment

`bridgeConsentText.ts:82`: `/** A bridged modal puts Deny first (parent Q5), so a stray Enter lands on Deny. */` →
`/** A bridged modal puts Deny first (parent Q5), intended to put Deny under a stray Enter; M10 measures which button Enter takes. */`
No test asserts where Enter lands (§4.10 row *Enter*); no scenario, no mutation. Review checklist item A8.4 (3).

#### F7 — the folder verbs' timeout sentence has a test

The code is as built (`brokerFolderDoor.ts:142` admits on the place; `:176` answers through `consentNotGiven`, whose one `onPlace = true` serves it).

| # | Scenario | Start | Transition | Expected | RED first, because |
|---|---|---|---|---|---|
| F7a | A folder verb's timeout through the MCP door | the broker world with `w.server.setFolderHooks(FOLDER_HOOKS)` (the rig of `brokerConsentText.test.ts:70-115`), `holdDialogs`, `consentTimeoutMs: 100` | `POST /v1/mcp/folder/create`; wait for the reply; then a local alias call and a second folder call. Variant: a fresh world, a folder call whose dialog gets Escape before the timer, then a local alias call | 504 `consent_timeout` with `CONSENT_TIMED_OUT_ON_PLACE`; `w.dialogs.length === 1`; both later calls `429` `BUSY_PLACE`; the dismissal variant: 504 with *The human did not allow this.* and the next call asked | written after the code (as-built difference 8): no RED against the code; its teeth are M47, watched red |

#### F8 — the coai code round's three items (code only)

1. **`executed` reads the gate before it types** (`dependencyRunHost.ts:352-355`). Move the check above `integration.executeCommand(line)`; when
   the gate has fired, finish with a fourth value, `'untyped'`, and type nothing. `runStep`'s integration road (`:296`, through `ran`, `:300-303`)
   answers `{ next: false, typed: false }` for `'untyped'` — the same end as its own check at `:287` — so the journal says *not launched* or, after
   an earlier step, *after a dependency step had been typed*, and never claims a step that was not typed. (Mapping `'untyped'` like `'gone'` would
   send it to `settle`, whose `typedAndStillWanted` (`:274-277`) throws *after a dependency step had been typed*: false on that road.) Keep
   `runStep` at complexity 4: `ran` becomes the helper that holds the new branch.
2. **Rejection guards.** `timedOut`'s continuation (`brokerConsent.ts:213`): `void dialog.then(…).catch(() => undefined)` with a comment that the late
   road decides nothing and a throwing journal must not become an unhandled rejection. `untilGone`'s `onLate` (`requestLife.ts:75`): called
   through a small helper that catches and drops a throw (complexity 4). F1's `settled` cannot throw and needs none.
3. **The `as never` cast:** nothing to remove (§4.10 F8, `:609`); none added by F1-F8.

| # | Scenario | Start | Transition | Expected | RED first, because |
|---|---|---|---|---|---|
| F8a | A gate that fires between `runStep`'s check and the type | `runDependenciesFirst` loaded with the VPN world's `vscode` (`vpnWorld`'s `preopened` chain terminal), a request with the test's own `AbortController` as `startGate`; the preopened terminal's `exitStatus` is a getter that calls `controller.abort()` and answers `undefined` | run the chain | it resolves `{ ready: false, typed: false }` and throws nothing; `r.vw.executions.length === 0` and the terminal's `sent` is empty | as built the step is typed (`executions.length === 1`) before the gate is read, and the chain throws `endedAfter` |
| F8b | A throwing journal on the late road | `brokerConsentPrompted.test.ts`'s `gateOver` under `mock.timers` (C21's), its `log` and `dialogClosed` throwing; an `unhandledRejection` spy | tick past the timer; answer `Allow` | the call was answered `'timeout'`; the spy records nothing | as built the throw from `lateAnswer` rejects the continuation, unhandled |
| F8c | A throwing `onLate` | unit, `untilGone` with a gate that fires first and an `onLate` that throws; the spy | resolve the promise after the gate | `untilGone` resolved `undefined`; the spy records nothing | as built the `.then` handler's throw is an unhandled rejection |

**Mutations:** M48-M51.

### A8.3 — Mutations for the new scenarios (mutate, watch the named case fail, restore; both outputs in the PR)

| # | Mutation | First red case | Symptom |
|---|---|---|---|
| M34 | `openVpnConnect` does not call `standingPrompt` | F1b | the next call is asked after the hang-up |
| M35 | `askToContinue` does not call `standingPrompt` | F1a, F1c | the next call is asked; five questions in F1c |
| M36 | `followUpStands`' close passes `keep = false` | F1e, F1f (iv) | the place frees while the call still runs |
| M37 | `followUpStands` attaches no close | F1a (iv), F1f (i) | `busy` after the late click, for ever |
| M38 | `followUpStands` skips the `doorOfDialog` check | F1f (ii) | a local token call's question holds another call's place |
| M39 | the close is attached for fulfilment only | F1f (iii) | a rejected question leaves the place held |
| M40 | `credsAgentServer.ts` omits `standing` from the literal (or `startNow` omits `standingPrompt`) | F1a, F1b, F1c | the next call is asked after the hang-up |
| M41 | `brokerConsent.ts`'s detail keeps *nothing ran* | F2a, F2c | the detail differs |
| M42 | `brokerCall.ts`'s detail keeps *nothing ran* | F1a (iii), F1b (iii) | the detail differs |
| M43 | `LATE_ANSWER_NOTICE` keeps *The next one will ask again.* | F2a, F2c, F2d | the notice differs |
| M44 | `shown` evaluates `showWarningMessage` outside the promise (as built) | F3a | the second call is `busy` |
| M45 | `BUSY_PLACE` loses the quiet clause | F4a, F4b | the words lack it |
| M46 | `BUSY_PLACE` ends with *the next request is then asked.* | F4a | the tail differs |
| M47 | `consentNotGiven` passes `onPlace = false` | F7a, C15 | the folder's and `create`'s timeout lose the place clause |
| M48 | `executed` types before it reads the gate (as built) | F8a | `executions.length === 1` |
| M49 | `ran` maps `'untyped'` like `'gone'` | F8a | the chain throws *after a dependency step had been typed* |
| M50 | `timedOut`'s continuation without its guard | F8b | an unhandled rejection |
| M51 | `untilGone`'s `onLate` without its guard | F8c | an unhandled rejection |
| M52 | `executed` (the running step) calls `standingPrompt` | C10, C10b | the place stays `busy` after the hang-up with no question up |

### A8.4 — Review checklist for the fix-forward (in addition to §S5.7)

1. `followUpStands` is the only new writer of `OneInFlight.prompted` / `dialogClosed`; it stamps no window; a local token call marks nothing.
2. No sentence in `src`, `CHANGELOG.md` or `module_extension.md` still says *nothing ran* for a late answer, *The next one will ask again*, *the next
   request is then asked*, *frees the place at once* for a standing question, or *a stray Enter lands on Deny* (grep each).
3. F6's comment says *intended*; no test asserts where Enter lands.
4. The RED outputs of F1a, F1b, F1c, F2a, F2c, F2d, F3a, F4a, F8a, F8b, F8c and the 19 mutations M34-M52 are in the PR, with the GREEN beside them;
   F1e, F1d and F7a are named as guards with their mutations' red outputs.
5. The `CHANGELOG.md` entry was re-read against the diff at the fixed commit (F5), and its bullets name the files and lines they describe.

### A8.5 — Line-count plan after F1-F8

| File | At `6e4cccd` | Change | Planned |
|---|---|---|---|
| `credsAgentServer.ts` | 792 | `standing` in `runAndDeliver`'s literal | **793 (≤ 795)** |
| `aliasThrottle.ts` | 491 | `followUpStands`; `BUSY_PLACE` (same two lines) | ≤ 510 |
| `brokerConsent.ts` | 372 | F2's two strings (same lines); F3's wrap; F8's guard | ≤ 378 |
| `brokerCall.ts` | 247 | `CallDeps.standing`; the literal's field; F2's detail | ≤ 252 |
| `useActions.ts` | 172 | `standingPrompt?` with its doc | ≤ 178 |
| `requestLife.ts` | 141 | the `onLate` guard helper | ≤ 150 |
| `vpnRun.ts` | 280 | the parameter, the question site, the comment | ≤ 288 |
| `vpnLauncherRun.ts` | 178 | the field and its copy | ≤ 182 |
| `dependencyRunHost.ts` | 373 | the field; the question site; `'untyped'`; the docblock | ≤ 388 |
| `agentUseActions.ts` | 436 | `open`'s sixth parameter; the call | ≤ 442 |
| `bridgeConsentText.ts` | 88 | the comment (same line) | 88 |
| `extension.ts` | 1003 | **unchanged** | 1003 |
| `brokerFolderDoor.ts`, `toolEnsure.ts`, `consentTurns.ts`, `src_cli`, `src_mcp`, `src_broker_client` | — | **untouched** | — |

Tests: `consentContractVpn.test.ts` 376 → ≤ 650; new `consentContractEpoch8.test.ts` ≤ 450; `consentContract.test.ts` 735 → ≤ 760 (F1f, C8's
words); `brokerWorld.ts` 654 → ≤ 670; `bridgeLinks.test.ts` +≤ 6. **No file over 800.** If `consentContractVpn.test.ts` would pass 800, F1c goes to
`consentContractEpoch8.test.ts` with a copy of the rig's helpers it needs.

**`consentPlace.ts` is not created.** The trigger of §S5.4 (`credsAgentServer.ts` past 795, or `aliasThrottle.ts` past 700) does not fire at 793
and ≤ 510; F1's one new method belongs with `OneInFlight`, which it drives. The coder re-takes the counts with `wc -l` and writes them in the PR;
if a count crosses the trigger, §S5.4's order is followed and said there.

### A8.6 — Questions for the plan (epoch 8)

None of these changes the contract; each is how this amendment reads it, with the evidence.

- **Q8-1 — the observation `w.dialogs.length === 1` for a follow-up question.** §4.10 F1 (`todo/PLAN_remote_bridge_scoped.md:602`) writes the
  five-`up` case and the *Continue* case as `w.dialogs.length === 1`. In the only rig that runs the real `up` (`test/consentContractVpn.test.ts:48-63`),
  `w.dialogs` is the broker world's consent-modal record (`test/brokerWorld.ts:298`, `showWarningMessage` only), while the follow-up question is
  `showInformationMessage` held by the VPN world (`r.vw.held`). Under a never-ask policy no consent modal opens at all, so `r.bw.dialogs.length`
  is 0 there. This amendment observes "one dialog on screen" as `r.vw.held.length === 1` with no new consent modal (F1a, F1c). If the plan meant
  the broker world's record, the words need a correction there; the fact observed is the same.
- **Q8-2 — F8's first item, read with the journal's words.** §4.10 F8 (`:609`) says *a client gone before the type gets nothing typed*. Built
  literally (the gate read first, then the existing `'gone'`), the untyped road would reach `settle`, whose `typedAndStillWanted`
  (`dependencyRunHost.ts:274-277`, called at `:313`) writes *after a dependency step had been typed* for a step that was not typed. F8 here
  answers `'untyped'` and ends the step as `runStep`'s own check does (`:287-289`). Today the road is reachable only when the gate fires
  synchronously between `:287` and `:352`, with no `await` between them; F8a reaches it with a getter. No contract change: the item is satisfied
  and the line stays true.
- **Q8-3 — `BUSY_PLACE`'s last sentence (for the record).** §4.10 prescribes the first sentence and the holders, not the tail; the built tail
  (*the next request is then asked*, `aliasThrottle.ts:279`) claimed the next call's behaviour, false for the D.3 quiet caller
  (`brokerMcpDoor.ts:223`). F4 rewrites it here under *Reading this plan*'s rule; nothing in the plan changes.
- **Q8-4 — one more text that becomes false with F1.** §4.10 F1 names `vpnRun.ts:220` and the test header; the file docblock
  `dependencyRunHost.ts:20-22` says the same (*frees the one dialog place*) and is corrected in F1 item 6. A repaired reference, not a change.
