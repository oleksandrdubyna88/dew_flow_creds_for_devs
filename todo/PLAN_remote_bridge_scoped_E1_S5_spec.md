# PLAN — E1.5 spec: the consent lifecycle — the place is the dialog's until a person's act

> Status: **spec, 2026-11-09, by Fable, written as a security spec (authorisation: what frees the one dialog place) before its code; not built.**
> Story E1.5 of [PLAN_remote_bridge_scoped_E1.md](PLAN_remote_bridge_scoped_E1.md) (parent [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md)
> §4.10 whole: its table, *What changes in the code (E1.5)*, the follow-up contract per action, the residuals, *Accepted / Not established*; §7
> *The consent contract* and *Local doors at partial E1*; §9; `## Epics` E1). The parent is approved at epoch 7 and is not edited here. Where this
> spec found §4.10 silent, inexact against the code, or naming a thing the code cannot produce, the contract is **not** changed: the point is
> written under §S5.10 *Questions for the plan (not decided here)* with its evidence, and the spec builds what §4.10 says wherever it can be built.
> Depends on E1.4 (merged to `main` as `455567a`, PR #312). Shape and exactness follow the E1.4 spec ([PLAN_remote_bridge_scoped_E1_S4_spec.md](PLAN_remote_bridge_scoped_E1_S4_spec.md)).
>
> Scope: `src_vs_code/src` — `brokerConsent.ts`, `aliasThrottle.ts`, `brokerMcpDoor.ts`, `brokerProtocol.ts`, `brokerRequests.ts`, `credsAgentServer.ts`
> (at most +4), `requestLife.ts`, `vpnRun.ts`, `dependencyRunHost.ts`, `bridgeConsentText.ts`; the tests named in §S5.5; `src/test/promptSiteLedger.ts`;
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
| H11 | `vpnAction.run` hands `ctx.signal` to `open` (`agentUseActions.ts:418`); a start that answers `false` for a gone request throws `notStarted()` (`:429-432`), which `brokerCall.failedOrAbandoned` journals as `ABANDONED` with no answer on the wire (`brokerCall.ts:222-236`). `VpnUseDeps` is `{ storage, open }` (`agentUseActions.ts:49-52`): no road to the journal. | A client that leaves during `up`'s follow-up ends the call with one `ABANDONED` line once the await is raced; a late click on that follow-up can leave **no** journal line from `vpnRun.ts` without a new seam (§S5.10 Q-C). |
| H12 | `CONSENT_TIMEOUT_MS = 5 * 60_000` (`agentConsent.ts:72`), mocked per test world through `consentMocks` (`test/brokerWorld.ts:289-291`, option `consentTimeoutMs` `:188`; `bridgeWallWorld.ts:273`); `holdDialogs` leaves every `showWarningMessage` open for the test (`brokerWorld.ts:180,226-233`, `w.openDialogs`); `showInformationMessage` is stubbed to `undefined` and records nothing (`:234`). `vpnWorld` holds dialogs by regex (`test/vpnWorld.ts:93,165-171`) and answers a modal by its first button, a toast by `notification` (`:227-232`, `isModal` `:245-247`); `HeldDialog` records `text`, `buttons`, `answer` (`:37-41`). | The worlds carry every scenario of §S5.5; the coder adds `w.notices` to `brokerWorld` and `modal` to `HeldDialog`. |
| H13 | The prompt-site ledger (`test/promptSiteLedger.ts`) has rows `brokerConsent.ts#ConsentGate.shown#showWarningMessage#1` (`:40`), `dependencyRunHost.ts#askToContinue#showInformationMessage#1` (`:114`, "not a modal"), `vpnRun.ts#openVpnConnect#showInformationMessage#1` (`:202`, "not a modal"), `toolEnsure.ts#confirmInstall#showWarningMessage#1` (`:191`); a site is a `show*Message` call with two or more arguments (`promptSites.test.ts:52-60`). | The three rows' reasons change with the code; a one-argument notice is no site; a renamed method renames its row in the same commit. |
| H14 | `credsAgentServer.ts` is **791** of 800 (`eslint.config.mjs:30`); `aliasThrottle.ts` 460, `brokerConsent.ts` 321, `brokerMcpDoor.ts` 522, `brokerProtocol.ts` 450, `brokerRequests.ts` 359, `requestLife.ts` 106, `vpnRun.ts` 269, `dependencyRunHost.ts` 347, `toolEnsure.ts` 63, `bridgeConsentText.ts` 77. Complexity 4, 50 code lines per function (120 in tests) (`eslint.config.mjs:31-32,60`). | The counts of §S5.4 are planned against these. |
| H15 | `src_vs_code/CHANGELOG.md` `[Unreleased]` is empty (`:8`); `[1.18.0]` (released 2026-11-08, `b6186c8`) carries partial E1's local effects, among them *the place taken until you click it or five minutes pass* (`:31-33`). `research/module_extension.md:3610-3612` says the place is freed by *the person's click, or the five-minute timeout*; `:3620-3622` lists *a timeout* among what frees the place at the dialog's close. | Both say what E1.5 ends, and both change in E1.5's commit, from the diff. |
| H16 | No production source contains `KEPT_PLACE_MS` (grepped `src/**/*.ts`); the string occurs in `todo/` only. `test/bridgeBoundary.test.ts:142-177` walks the sources by `readdirSync` and asserts a name's absence (R1's technique). | The grep test is written GREEN and stays as a guard against the superseded D.2. |

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
4. **A dismissal is not a timeout, and E1.5 must tell them apart**, or the new 504 sentence (*The question is still on the person's screen*) is false after an
   Escape. The gate therefore answers `'dismissed'`, a new `ConsentOutcome`, and the doors answer a dismissal **exactly as today** (504 `consent_timeout`, the
   door's old sentence). §4.10 does not speak of Escape's wire answer; keeping it is no change. Q-A asks the plan to say so.
5. **The timeout sentence per door is decided by whether the call was admitted on the place**, which is `doorOfDialog(bridgeId, via) !== undefined` (H4, H8), not by
   `via` alone: a bridged token call is counted and hears the place clause. `create` and `delete` are admitted on the MCP door (H8), so their timeout hears the
   place clause too; §4.10 names only `credsAgentServer.ts:625` (`main`'s line; `:664` here). Q-B asks the plan to confirm the two MCP sentences are covered.
6. **D.3 is E1.5's** (the E1 document's epoch 4 amendment, item 10) and is built as the S3 spec's Amendment 4 sketched it (`admitSilentPlace`), with one correction:
   the flag is read with the call's target (`asksAfter(action, target)`, H9), since `exec`'s flag is a function. On a bridge nothing changes (`exec` and `query`
   carry no flag; a forwarding entry is refused).
7. **D14 is built for `up`'s three awaits and no other**: the import question and `askToContinue` become modal on an agent call and both are raced against the
   gate; `executed()` is raced too. The install offer (`toolEnsure.ts:21`) is left as it is, because the parent's §7 `down` case asserts that a leaving client frees
   nothing of it and the click does. §4.10's "as the install offer already is (`vpnRun.ts:194`)" is inexact (H10): the offer reads the gate after its modal, it is not
   raced. Q-D records it.
8. **"A late click [on `up`'s follow-up] leaves the late-answer line" cannot be built from `vpnRun.ts`** (H11). What E1.5 builds: the client's leaving ends the call
   (one `ABANDONED` line, *as the action was starting — it was not launched*, today's words), frees the place, and a late click writes no profile and types nothing.
   The line a late click would leave needs a seam the plan does not name; Q-C.
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
type Answer = { kind: 'answered'; choice: string | undefined } | { kind: 'timer' };
private prompts = new SharedPrompts<ConsentOutcome>();          // was SharedPrompts<boolean>
private async ask(question, stillWanted): Promise<ConsentOutcome> {
  this.deps.prompted?.(question);
  const dialog = this.shown(question);                           // the modal's OWN promise: showWarningMessage(wording, { modal: true }, ...consentButtons(grant.bridge !== undefined)), wrapped so it never rejects
  const answer = await bounded(dialog, CONSENT_TIMEOUT_MS);      // withTimeout over `dialog.then(choice => ({ kind: 'answered', choice }))`, `undefined` read as { kind: 'timer' }; unref as today
  if (answer.kind === 'timer') {
    // The call is answered; the dialog stands, and the place is its until the person acts (§4.10, row 3). Read ONCE more, by this road only.
    void dialog.then((late) => this.lateAnswer(question, late));
    return 'timeout';
  }
  this.deps.dialogClosed?.(question, answer.choice === 'Allow' && followsUp(question));   // H9: the flag is read HERE, on an Allow, as change 6.1 built it
  if (!stillWanted()) { this.ignored(question, answer.choice); return 'timeout'; }      // every waiter left: read and applied to nothing (today's road); the value is read by nobody
  return this.apply(question, answer.choice);                    // 'allowed' | 'denied' | 'dismissed'
}
/** The standing dialog of a call that was answered `timeout`: its answer frees the place and decides nothing. Never `apply`. */
private lateAnswer(question, choice: string | undefined): void {
  this.deps.dialogClosed?.(question, false);                     // never kept: the call is gone
  this.ignored(question, choice);
}
/** Allow or Deny on a dialog whose call had ended: one line, the notice, nothing decided. A dismissal frees the place and says nothing (as today). */
private ignored(question, choice): void {
  if (choice === 'Allow' || choice === 'Deny') {
    this.line(question, 'ignored', `"${choice}" answered after its call had ended; nothing ran`);
    void vscode.window.showInformationMessage(LATE_ANSWER_NOTICE);    // ONE argument: a notice, not a prompt site (H13)
  }
}
private apply(question, choice): ConsentOutcome {
  if (choice !== 'Allow' && choice !== 'Deny') { return 'dismissed'; }
  this.deps.onUserPresent();
  return choice === 'Allow' ? this.allow(question) : this.deny(question);   // allow → 'allowed', deny → 'denied'
}
private after(grant, answered: ConsentOutcome | typeof ABANDONED, signal): ConsentOutcome {
  if (answered === ABANDONED || signal.aborted) { return 'abandoned'; }
  return this.known(grant) ?? answered;                          // `unsettled` is deleted
}
export const LATE_ANSWER_NOTICE = 'That request had already ended; nothing ran. The next one will ask again.';

// requestLife.ts (pure) — one race for the three awaits of D14, and nothing else
/** `promise`, or `undefined` the moment `startGate` fires, whichever is first. With no gate (the person's own click) it is `promise` itself. The promise is not cancelled: what resolves it later is read by nobody. */
export function untilGone<T>(promise: Thenable<T>, startGate: AbortSignal | undefined): Promise<T | undefined>;

// vpnRun.ts:212-217 openVpnConnect — on an agent call the question is modal and raced; the person's own Start keeps the toast
const open = await untilGone(vscode.window.showInformationMessage(IMPORT_QUESTION, { modal: ctx.startGate !== undefined }, 'Import profile'), ctx.startGate);
//   `open === undefined` → return false (the client left, or the person declined); `writeVpnConfig` (:217) still reads the request last, so a late click writes nothing.

// dependencyRunHost.ts
async function askToContinue(question: string, startGate: AbortSignal | undefined): Promise<boolean>;    // :339-342
//   const choice = await untilGone(vscode.window.showInformationMessage(question, { modal: startGate !== undefined }, 'Continue', 'Stop'), startGate); return choice === 'Continue';
//   callers :288 (runStep) and :304 (settle) pass their `startGate`
// runStep :290   return { next: await settle(stepVerdict(step.name, await untilGone(executed(terminal, integration, step.line), startGate)), startGate), typed: true };
//   a gate that fires during the step answers `undefined` to stepVerdict; `settle` then runs `typedAndStillWanted` FIRST (:300) and throws `endedAfter('a dependency step had been typed')`, today's words. The listeners of `executed` stay attached until the execution ends or the terminal closes (:319-333); a leak bounded by the terminal's life, said in a comment.
```

**The order of effects, stated once.** A call is admitted (the place is the call's) → `prompted` (the place is the dialog's) → the modal is shown with the
door's buttons → **either** the person acts (Allow, Deny, Escape): `dialogClosed(question, keep)` with `keep` read then, then `apply` or, if every waiter had
left, `ignored` → **or** the call's wait runs out: the call is answered `'timeout'` and nothing is told to the throttle; the route's `finally` releases the
slot, which frees nothing while the dialog is up (H4, `released`); when the dialog resolves, `lateAnswer` frees the place and `ignored` writes the line and
shows the notice for an Allow or a Deny. No path from `lateAnswer` reaches `apply`, `allow`, `deny`, `onUserPresent` or `remember`. A quiet call whose action
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
   (so a bridged line carries `bridge=<name>`, E1.4).
4. **The notice** (`LATE_ANSWER_NOTICE`): *That request had already ended; nothing ran. The next one will ask again.*
5. **Unchanged, byte for byte**: `GRANT_NOT_ALLOWED` on a Deny (403) and on a dismissal (504); `'The human did not allow this.'` / `'…this deletion.'` likewise; the
   `ABANDONED` details; the dialog's text (`wording`, E1.4's C11 literal stays green with no edit); the `too_many_requests` sentences other than `busy`.
6. **Buttons**: a bridged modal `['Deny', 'Allow']`; a local one `['Allow', 'Deny']`.

## S5.4 — Every file, what changes, and the line-count plan

| File | Now | Change | Planned | Against `455567a` |
|---|---|---|---|---|
| `brokerConsent.ts` | 321 | `ask` split (`shown` = the modal alone, `bounded`, `lateAnswer`), `ignored` reworded + notice, `apply`/`after` on outcomes, `unsettled` deleted, the buttons from `consentButtons`, `LATE_ANSWER_NOTICE`; doc comments at `:24-27`, `:43-46`, `:185-188` rewritten | ≤ 375 | `:138,149-182,189-233,319-321` |
| `aliasThrottle.ts` | 460 | `BUSY_PLACE`, `countedOnPlace`, `admit(…, followUp)`, `admitSilentPlace`; `describe` reads the constant; `OneInFlight.dialogClosed`'s comment loses "or the 5-minute timeout" | ≤ 485 | `:183-186,275-280,329-336,433-435` |
| `brokerMcpDoor.ts` | 522 | `ConsentOutcome` + `'dismissed'`; `BrokerDoor.admit` third parameter and `asksAfter`; `handleMcpUse` passes the flag; `consentNotGiven` through `consentRefusal` | ≤ 532 | `:49,136,145-158,210-214` |
| `brokerProtocol.ts` | 450 | the two timeout sentences and `consentTimedOut` | ≤ 468 | after `:101` |
| `brokerRequests.ts` | 359 | `consentRefusal` | ≤ 372 | beside `:30` |
| `credsAgentServer.ts` | **791** | `admitAliasCall` fourth parameter (in place); `doorFor`: `admit` in place, `asksAfter` +1; `notAllowed` −2 +2; imports in place (`countedOnPlace`, `consentRefusal`) | **≤ 795** | `:216-217,272,663-664` |
| `bridgeConsentText.ts` | 77 | `LOCAL_BUTTONS`, `BRIDGED_BUTTONS`, `consentButtons` | ≤ 90 | — |
| `requestLife.ts` | 106 | `untilGone` | ≤ 122 | after `:48` |
| `vpnRun.ts` | 269 | `openVpnConnect`: modal on an agent call, raced; the question's text as a constant | ≤ 276 | `:205-225` |
| `dependencyRunHost.ts` | 347 | `askToContinue(question, startGate)`, modal on an agent call, raced; `executed` raced in `runStep`; the file's docblock sentence *in a notification, not a modal* (`:15-18`) qualified | ≤ 358 | `:15-18,279-291,299-305,339-342` |
| `toolEnsure.ts`, `agentUseActions.ts`, `useActions.ts`, `rotateAction.ts`, `sshUseActions.ts`, `grantRegistry.ts`, `sharedPrompt.ts`, `withTimeout.ts`, `agentConsent.ts`, `extension.ts` (1003) | — | **untouched** | — | — |
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
| C1c | The local token door hears the sentence without the place clause and takes no place | a local token call, its dialog open; `consentTimeoutMs: 100` | wait for the reply | 504 `consent_timeout` with `CONSENT_TIMED_OUT` (no *keeps this window's shared dialog place*); the next local alias call is **asked** (`w.openDialogs.length === 2`), not `busy`; its Allow runs it | the sentence is `main`'s; the fact (no place) is green today and is pinned here beside the words, as the parent's §7 owes (*the absence of any place for the same call through the local token door*) |
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
| C11 | D14: the OpenVPN Connect question | an agent `up` on an `openvpn` entry with `resolveVpnLauncher → openvpn-connect` (the `vpnGoneRequest.test.ts:160-174` mocks), through `brokerWorld`, held by `/Import this profile/` | (i) a local alias call: `busy`; (ii) hang up; (iii) click `Import profile` | `held[0].modal === true`; after (ii) one `ABANDONED` line (*as the action was starting — it was not launched*) and the next call asked; after (iii) no file under the storage dir and no terminal (today's assertions `:171-172`); **no journal line for the late click** (Q-C) | today the question is a toast and the hang-up is read only when the person clicks |
| C11b | The person's own Start | the same with no `startGate` | the person clicks | `modal === false`; the profile is written and the import line typed, as today (`:186-193`) | green; a guard |
| C12 | A local `up` held in its follow-up longer than any former timer | `consentTimeoutMs: 100`; a local `down`/`up` with the install offer held for 400 ms after the Allow | alias and MCP calls at 150 ms and 350 ms | all `busy`; the place frees at the click on the offer, not before, not at a hang-up (the parent's §7 `down` case, as `consentFollowUps.test.ts:70` asserts) | green today (the timer never ran on a follow-up); kept beside C1 so the two rules are seen together |
| C13 | The overnight row | a bridged `exec` with `quiet` off; the agent sends ten calls over 2 s with `consentTimeoutMs: 100` | — | one 504, nine `busy`; `w.dialogs.length === 1` at the end; then one click clears it and the eleventh call is asked | today ten dialogs would be raised one after another (each timeout frees the place) |
| C14 | A late answer writes no stamp | the real consent hooks (`bridgeConsent.test.ts`'s `consenting('every12h', quiet on)`), C1 through bridge A, then a late Allow | — | the store has no new key; `w.consents` empty; the `ignored` line; the next call through A is asked | today no stamp either (`remember` runs after `perform`'s `allowed`), pinned here as the row demands (*a test asserts it*) |
| C15 | `create` and `delete` on the MCP door | an MCP `create` and an MCP `delete`, each timed out | — | 504 with `CONSENT_TIMED_OUT_ON_PLACE`; a dismissal of each: 504 with today's `'The human did not allow this.'` / `'…this deletion.'`; the next call `busy` after the timeout and asked after the dismissal | the sentences are today's for both |
| C16 | The two late cases share one road | unit, `brokerConsentPrompted.test.ts`'s `gateOver` with a spying `log` and a stubbed `showInformationMessage` | (a) timer, then Allow; (b) `stillWanted` false, then Allow | both: one `ignored` line with the new detail, one notice, `onUserPresent` not called, `grants.allow` not called; `closed` is `[]` until the click and `[false]` after it in (a) | K7 `:176-190` asserts `closed === [false]` at the timeout |
| C17 | The ledger stays exact | `promptSites.test.ts` | — | green with the three reasons rewritten and no new row; or, if the coder's shape added a call, the new row is present and classed | fails by itself on a new unclassed site |

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
7. D14: `{ modal: startGate !== undefined }` at both questions; both and `executed` are wrapped by `untilGone(…, startGate)`; `untilGone` with `undefined` returns the
   promise's own value; `settle`'s `typedAndStillWanted` still runs before any question; `toolEnsure.ts` is untouched.
8. The buttons come from `consentButtons(grant.bridge !== undefined)`, spread into the one `showWarningMessage`; `bridgeConsentText.ts` still imports no `vscode`.
9. The ledger: the `shown` row's reason no longer says the timer frees the place; the two "not a modal" reasons say *modal on an agent call, a toast on the
   person's own*; no new site, or its row.
10. `credsAgentServer.ts` ≤ 795 (or §S5.4's trigger was followed and said in §S5.12); `extension.ts` 1003, ratchet green; `npm run lint` green at complexity 4.
11. `CHANGELOG.md` `[Unreleased]` (§S5.11): every bullet matches a hunk a local door reaches; the button order is **not** in it.
12. The three `module_extension.md` sentences of H15 are corrected, and no sentence there still says a timeout frees the place.
13. The RED outputs for C1, C1b, C1c (sentence), C3, C4, C6, C8, C9, C10, C10c, C11, C13, C15, C16 and the 26 mutations are in the PR; the GREEN outputs beside them.
14. No real host name, login, address or key path in any test or document (`build-server` and the worlds' fakes only).

## S5.8 — Decisions closed

1. The timer answers the call and touches the throttle by nothing; the dialog's own resolution frees the place, through `lateAnswer`, with `keep` false.
2. A late Allow or Deny, after a timeout or after every waiter left, writes one `ignored` line with the words *answered after its call had ended; nothing ran*
   and shows `LATE_ANSWER_NOTICE`; a late Escape frees the place and writes and shows nothing.
3. A dismissal is a `ConsentOutcome` of its own and is answered on the wire exactly as today (Q-A asks the plan to record it).
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
- `untilGone` on `executed()`: the two listeners stay attached until the execution ends or the terminal closes; the bound is the terminal's life. Reasoned from
  `:319-333`, not measured against a real terminal.
- The line counts of §S5.4 are hand estimates; `wc -l` and `npm run lint` decide, and §S5.12 records them.

## S5.10 — Questions for the plan (not decided here)

The contract is built as written above; each point below is where §4.10 is silent, inexact against this tree, or names a thing the code cannot produce, with
the evidence. None is changed in this spec; the plan's owner decides, and the ledger's rule decides whether an answer counts.

- **Q-A — A dismissal (Escape) rides the timeout's road today, and §4.10 says what Escape does to the place but not what the agent hears.** `apply`
  (`brokerConsent.ts:206-209`) returns `false` for `undefined`, `unsettled` (`:319-321`) makes that `'timeout'`, and `notAllowed` (`credsAgentServer.ts:663-664`)
  answers 504 `consent_timeout` with `GRANT_NOT_ALLOWED`. With the new sentence an Escape would be told *the question is still on the person's screen*, which is
  false. The spec adds `'dismissed'` and keeps today's wire answer for it (504, the old sentence). The plan should say whether that is the answer it wants for Escape
  (an alternative would be a code of its own, which is a wire change and E1.5 does not own it).
- **Q-B — §4.10 names `main`'s `credsAgentServer.ts:625` as the one sentence E1.5 replaces; two more timeout sentences exist on the MCP door.** `consentNotGiven`
  (`brokerMcpDoor.ts:145-158`) answers a timed-out `create` with `'The human did not allow this.'` (`:486`) and `delete` with `'…this deletion.'` (`:315`). Both calls
  are admitted on the place (`:288,376`), so the row's *per door* sentence applies to them as this spec reads it (C15). The plan should confirm, since the second
  list of §4.10 and the CHANGELOG would otherwise describe the alias and `use` routes only.
- **Q-C — D14's "a late click writes no profile and leaves the late-answer line" cannot be produced from `vpnRun.ts`.** The import question is not the consent
  dialog; `VpnUseDeps` is `{ storage, open }` (`agentUseActions.ts:49-52`) and `runVpn` has no road to the broker's journal. What E1.5 produces: the client's leaving
  ends the call with one `ABANDONED` line (*as the action was starting — it was not launched*), the place is freed then, a late click writes no profile and types
  nothing (C11). A line for the late click itself needs a seam (`VpnUseDeps.note`, or a result the opener reports), which the plan does not name and this spec does
  not add. The plan should say whether the `ABANDONED` line satisfies the row or a seam is wanted (then an entry, `approach`).
- **Q-D — "as the install offer already is (`vpnRun.ts:194`)" is inexact.** `offerToInstall` (`toolEnsure.ts:17-26`) awaits its modal with no race and reads the gate
  after it; `vpnRun.ts:194` is `noCli`'s signature on this tree and `:201` the call. The parent's own §7 `down` case asserts the offer frees at the click and not at a
  hang-up, so the two awaits of D14 are raced and the offer is not (C11, C12). Only the comparison is wrong; nothing is built from it.
- **Q-E — The `busy` row says a `busy` answer "is never queued, so no wait runs for it"; the per-door sentence row says *every later asking call … `busy`*. Both hold;
  but the row's "Every later asking call, on every door of that window that is counted on the place" leaves the standing dialog's own token door unsaid:** a second
  call on the **same local token** after its timeout raises a second dialog beside the standing one (H3: the prompt was forgotten; H4: no place), so the person can
  see two dialogs for one token. That is the stated exception applied to one token, consistent with the row, and C1c pins it; the plan may want to say it in the
  row, since the overnight row's *at most one standing modal per window* is true of the counted doors only.
- **Q-F — `ignored`'s detail changes for the "client left" case too** (`brokerConsent.ts:231`: *answered after the request had gone — nothing decided*), because the
  late-answer row gives one sentence for *expired or left*. No test pins the old words; the change is listed as a local effect. If the plan meant the new words for the
  expired case only, C4 changes and the detail stays per case.

## S5.11 — What this changes for a local user; the CHANGELOG entry; the documents; the ledger

**Reachable by a local user (the parent's §4.10 second list, extended by E1.5; each with its case):** an unanswered local alias or MCP modal now answers `busy`
to the next asking alias or MCP call until a person clicks it, where 1.18.0 re-asked after five minutes with a second modal (C1b, C2r); the `busy` sentence is
`BUSY_PLACE` (C8); the timeout answer on the local alias and MCP doors is the place sentence and on the local token door the shorter one, replacing *The human did
not allow this grant.* (C1b, C1c; `create` and `delete`: C15, pending Q-B); a late Allow or Deny on a dialog whose call had timed out or whose client had left writes
*answered after its call had ended; nothing ran* and shows the notice (C3, C4); an Escape is answered as before (C5); a quiet local MCP call of `create`, `terminal`, `up`,
`down`, `rotate`, or `exec` on a forwarding entry with the agent up, holds the place while it runs (C9, C9b: D.3); an agent's `up` (through any local door) shows the
OpenVPN Connect question and the dependency chain's *Continue* question as modals, and a client that leaves during them or during a running dependency step ends the
call (C10, C10c, C11); the person's own Start is unchanged (C10d, C11b). **Not reachable** (no production door opens a bridge before E2; R1): the button order
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

*(Written by the coder when the story is built: the counts of every file in §S5.4 as measured, the RED and GREEN outputs by case, the mutation run with the
file hashes compared after each restore, what the §S5.4 trigger decided, the answers the plan gave to §S5.10 and what changed with them, and any gap filled that
neither the parent nor this spec had decided, for a reader to confirm first.)*
