# PLAN — E1.5 spec: the consent lifecycle — the place is the dialog's until a person's act

> Status: **spec, 2026-11-09, by Fable, written as a security spec (authorisation: what frees the one dialog place) before its code; not built. Revised the same day after the coai plan gate:** the parent recorded change 7.1 (`bf7d2ff`: an Escape is its own outcome, `dismissed`, frees the place like a click and keeps today's wire answer), and the gate's accepted findings are designed and tested here — the late-answer line for a late click on `up`'s questions through a seam on the action context (Q-C, judged as satisfying the plan as written), a rejection-safe dialog promise, explicit timeout/answer arbitration with `keep` computed only for a live waiter, and listener hygiene in `untilGone` and `executed` (§S5.2, C11, C18-C21, M27-M33). Finding 5 (a guard against two dialogs on one local token) was rejected: it is §4.10's stated exception, and the visible outcome is M10's to measure.
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
4. **A dismissal is not a timeout, and E1.5 tells them apart** — now the parent's own contract (change 7.1, `bf7d2ff`, in the ledger and in §4.10's E1.5
   paragraph): an Escape is its own outcome, `dismissed`, frees the place as a click does, and keeps today's answer on the wire (504 `consent_timeout`,
   *The human did not allow this grant.*). Built as §S5.2 shows; Q-A is closed by it.
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
2. **The timeout answer**, 504 `consent_timeout`, per door (the parent's §4.10 row 3, byte for byte):
   - a call counted on the place (`CONSENT_TIMED_OUT_ON_PLACE`): *Nobody answered within five minutes. The question is still on the person's screen and keeps this
     window's shared dialog place until they answer it. This request did not run.*
   - a local token call (`CONSENT_TIMED_OUT`): *Nobody answered within five minutes. The question is still on the person's screen until they answer it. This request
     did not run.*
   *five minutes* is a literal; C2 asserts `CONSENT_TIMEOUT_MS === 300_000` beside it, and C2r proves the sentence on the real five-minute path.
3. **The late-answer line**: outcome `ignored`, detail `"Allow" answered after its call had ended; nothing ran` (or `"Deny"`). The grant field is `GrantRegistry.describe`'s
   (so a bridged line carries `bridge=<name>`, E1.4). The same shape for a late click on `up`'s questions, through `ctx.lateAnswer`: `"Import profile" answered after
   its call had ended; nothing ran`, and `"Continue"` / `"Stop"` for the chain's question, with the call's own `action` (`up`) and door.
4. **The notice** (`LATE_ANSWER_NOTICE`): *That request had already ended; nothing ran. The next one will ask again.*
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
| C3 | A late Allow on an expired dialog authorises nothing | C1 after the 504 | `openDialogs[0]('Allow')` | one `ignored` line whose detail is `"Allow" answered after its call had ended; nothing ran`; no `ALLOWED` line; `w.ran` empty; `w.consents` empty (an MCP `every12h` variant: the stamp store has no new key); `w.presence` unchanged; `w.notices` holds `LATE_ANSWER_NOTICE` once; then the next bridged alias call is **asked** and its Allow runs it | today the click lands on nobody's dialog and the place was already free; the detail and the notice do not exist |
| C3b | A late Deny tombstones nothing | C1 | `openDialogs[0]('Deny')` | one `ignored` line (`"Deny" …`), no `DENIED` line; the notice; the next call on the same token (token door variant) is asked, not refused 403 | the tombstone path (`deny`) is reachable from a late click today only through `apply`; here `lateAnswer` never reaches it (mutation M3 proves the test's teeth) |
| C3c | A late Escape frees and says nothing | C1 | `openDialogs[0](undefined)` | no `ignored` line, no notice; the next call is asked | — (the place: red today in the sense that it was already free; asserted as the end state) |
| C4 | A client that leaves during its dialog: the place stays until the click, and the click is told | a local alias call, hang up during its dialog (`sendAbortable`) | `ABANDONED` seen; a second local call: `busy`; then Allow | the `ignored` line with the new detail; the notice; `w.ran` empty; the next call asked | the detail is today's old sentence and there is no notice (`brokerAbandoned.test.ts:91-117` stays green through `/ ignored /` and is extended) |
| C4b | The same when the timer fires after the client left | C4, `consentTimeoutMs: 100`, wait past it before the click | a second call during the wait: `busy`; then Allow | as C4; exactly one `ABANDONED` line, one `ignored` line | today the timer frees the place at 100 ms |
| C5 | Escape is a person's act, answered as today | a local alias call | `openDialogs[0](undefined)` | 504 `consent_timeout`, `GRANT_NOT_ALLOWED` (byte for byte today's); the place free: the next call asked; no `ignored` line; `w.presence` unchanged | green today; **kept as a guard** so the new sentence never speaks for an Escape (mutation M4) |
| C6 | Buttons by door | a bridged alias call; a local alias call; a local token call | read the arguments `showWarningMessage` received | bridged: `['Deny', 'Allow']`; both local: `['Allow', 'Deny']`; the pure `consentButtons(true/false)` answers the same lists | today every door gets `'Allow', 'Deny'` |
| C7 | `KEPT_PLACE_MS` does not exist | the sources under `src/` except `src/test` | grep, as R1 walks (`bridgeBoundary.test.ts:142`) | zero hits | green; a guard against D.2 |
| C8 | The `busy` sentence, and the facts it states | (a) C1's standing dialog; (b) a local `down` with no VPN client, its install offer held after the Allow (the `consentFollowUps.test.ts:70` rig); (c) an agent `up` whose dependency step never ends (C10) | an alias call during each | `429` with `BUSY_PLACE` in all three; and in each the thing the help names is observed: (a) `w.dialogs.length === 1` and `openDialogs.length === 1`; (b) the install offer is held (`vw.held.length === 1`) and no second modal; (c) the chain terminal holds an execution that has not ended | the sentence is `main`'s |
| C9 | D.3: a quiet call that may prompt again holds the place for its length | the local MCP door pre-consented (`quietLocal`), the scripted action with `asksAfterConsent: true`, its run held (`w.hold`) | a bridged alias call and a local alias call during the run; then release the hold | both `busy` with `BUSY_PLACE` and no dialog (`w.dialogs.length === 0`); the quiet call's `allowed without a prompt` line is written as today; after the run ends the next call is asked; a quiet call of an action **without** the flag (today's `exec` script) holds nothing: a concurrent asking call is asked while it runs; through a bridge (`exec`, `query`) nothing changes: C21 of the E1.4 spec stays green | today the quiet call takes no place (`brokerMcpDoor.ts:210,214`) |
| C9b | D.3 with the per-entity flag | the real `sshExecAction` under `bridgeLinksWorld`, a forwarding entry with the socket up, the local MCP door quiet | as C9 | the place is held for the run; the same entry with the socket down holds nothing | new |
| C10 | D14: an agent's `up` whose dependency step never ends frees the place when the client leaves (the main `up` case of the parent's §7) | the real `vpnAction` over `agentVpnOpener` and the vpn world, inside `brokerWorld` (the `consentFollowUps.test.ts:70-80` rig); an entry with a `runDependencies` chain of one terminal step; the fake terminal's execution is never ended; the call is an MCP use through the main port, sent with `sendAbortable` | Allow; `until` the step is typed; (i) a local alias call: `busy` with `BUSY_PLACE`; (ii) hang up the client | after (ii): one `ABANDONED` line whose detail is `after a dependency step had been typed …` (today's words, `requestLife.ts:67-69`); the place free: the next local alias call is asked and runs; no VPN config file under the storage dir; no VPN terminal; the dialog count unchanged | today `executed()` is awaited unbounded: the hang-up changes nothing until the step ends; the next call stays `busy` for ever |
| C10b | The same through the launcher path | the entry names a launcher (`vpnLauncherEntityId`) whose chain has the never-ending step (`vpnLauncherRun.ts:89`) | as C10 | as C10 | as C10 |
| C10c | The `Continue` question is modal on an agent call and a client leaving ends it | a chain under a terminal with no shell integration (`integration: false`), so `askToContinue` is reached at `runStep` `:288`; held by regex `/Continue once it has finished/` | hang up; then click `Continue` | `held[0].modal === true`; the call ended on the hang-up (`ABANDONED`, *after a dependency step had been typed*), the place free before the click; the late `Continue` runs no second step and types nothing | today a toast; the hang-up changes nothing until the click |
| C10d | The person's own Start keeps the toast | the same chain with no `startGate` | the person clicks `Continue` | `held[0].modal === false`; the chain goes on as today | green; a guard |
| C11 | D14: the OpenVPN Connect question, and the late click's line | an agent `up` on an `openvpn` entry with `resolveVpnLauncher → openvpn-connect` (the `vpnGoneRequest.test.ts:160-174` mocks), through `brokerWorld` (so the real `performCall` builds `ctx.lateAnswer`), held by `/Import this profile/` | (i) a local alias call: `busy`; (ii) hang up; (iii) click `Import profile` | `held[0].modal === true`; after (ii) one `ABANDONED` line (*as the action was starting — it was not launched*) and the next call asked (the place freed before any click); after (iii) exactly one more journal line: outcome `ignored`, action `up`, the grant's describe, detail `"Import profile" answered after its call had ended; nothing ran`; no file under the storage dir, no terminal (today's assertions `:171-172`), `w.ran` unchanged; the chain's *Continue* question (C10c) gets the same line with `"Continue"` on a late click | today the question is a toast, the hang-up is read only when the person clicks, and no line exists |
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
3. A dismissal is a `ConsentOutcome` of its own, `dismissed`: it frees the place as a click does and is answered on the wire exactly as today, 504 `consent_timeout`
   with *The human did not allow this grant.* — **the parent's change 7.1 (`bf7d2ff`, 2026-11-09)**, binding; a modal that fails before the timer is read as a dismissal.
10. One rejection-safe dialog promise (`DialogEnd`); after the timer, every end of the dialog goes through `lateAnswer` with `keep = false`; no rejection escapes `ask`.
11. Arbitration is `withTimeout`'s single settlement, read as `end === undefined`; `keep` is computed only after `stillWanted()` says a waiter remains.
12. The late click on `up`'s import question and on the chain's *Continue* question writes the late-answer line through `ctx.lateAnswer`, a seam built by
    `performCall` from the broker's `log`; it writes no profile and types nothing (the gate's finding 0, judged as satisfying the plan as written).
13. `untilGone` removes its abort listener when either side settles; `executed` finishes on the gate and disposes its listeners, so abandoned runs on one terminal
    accumulate nothing and a stale execution reaches no follow-up.
4. The timeout sentence is chosen by `countedOnPlace`, not by `via`; `create` and `delete` hear the place clause (Q-B).
5. D.3 is built here, with the per-entity flag read through `asksAfter(action, target)`.
6. D14 races the import question, `askToContinue` and `executed()` against `ctx.startGate` on an agent call and makes the two questions modal there; the person's own
   path is byte for byte today's; the install offer is untouched.
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

**The `CHANGELOG.md` entry** goes under `[Unreleased]` (`src_vs_code/CHANGELOG.md:8`), is **derived from the diff at the commit** and checked bullet by bullet
against the file and line each names, never copied from here (the parent's *Observations*); it covers the first paragraph above and nothing of the second, says
in one clause that 1.18.0's *or five minutes pass* no longer holds, and names no behaviour behind a bridge door. `research/module_extension.md:3610-3612` and
`:3620-3622` are corrected in the same commit (the place is freed by the click, never the timer; the timeout answers the call only; the late line's words; D.3; D14),
and `:3597-3598` gains the timeout beside the leaving client.

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

## S5.12 — Questions for the coordinator

- **Q1. §S5.11's "a quiet local MCP call of `create`, …" is false for `create`.** A create is never quiet: `confirmAndCreate` admits with `door.admit(res, true)` (`brokerMcpDoor.ts:385`), and only `handleMcpUse` reads the flag (`:223`). The calls that hold the place quietly are `terminal`, `up`, `down`, `rotate`, and `exec` on a forwarding entry with the agent up (the five flags of H9). The CHANGELOG says so; the spec sentence was not changed.
- **Q2. §S5.4 does not list `bridgeLinks.test.ts:403`**, a test that pins today's "a quiet forwarding exec holds nothing" and turns red under D.3 by design. It was inverted into C9b (difference 6). Please confirm that is the intended owner of C9b.
- **Q3. The folder verbs hear the place clause on a timeout** (difference 8): `consentNotGiven`'s one `true` serves them, because they are admitted on the place. §S5.2 names only `create` and `delete`. Built as the chooser's rule says; say so if the parent wanted the folder's old sentence.
- **Q4. §S5.6 M26 "by review only"** is now caught by a test (C17's reasons check). It reads three words of three rows, so it proves the words and not their truth: the review checklist item 9 still stands.

**Answers (coordinator, 2026-11-09).** Q1: the code is right and §S5.11's sentence was wrong; `create` is struck from it above. The parent's D.3 row names no action, so this repairs the spec and is not a plan change. Q2: yes, `bridgeLinks.test.ts` owns C9b. Q3: the folder verbs hearing the place clause is the per-door rule of §4.10 applied to a door counted on the place, the same reading as Q-B, which two of two consultants judged not a change; it stays, and the CHANGELOG names the folder verbs. Q4: accepted; review item 9 stands.
