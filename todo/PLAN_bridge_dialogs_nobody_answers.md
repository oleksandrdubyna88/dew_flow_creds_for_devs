# PLAN — A door nobody answers stops asking: unanswered consent dialogs back off instead of stacking

> Status: **plan only, nothing implemented yet, 2026-11-05.** Scope: `src_vs_code` (`aliasThrottle.ts`, `brokerConsent.ts`,
> `credsAgentServer.ts`). Written out of E1.3's Amendment 3 (C.11) of
> [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md), where it would have been the second approach change of epoch 3 and stopped
> that plan. To be reviewed as a plan when E1 is merged, or when the owner first sees the stack.

## The symptom

An agent on a server runs unattended, overnight, and a Remote Bridge survives a reboot (parent plan §4.7). Every call through a bridge
with `quiet` off asks a person. With nobody at the screen each dialog times out after five minutes (`CONSENT_TIMEOUT_MS`), the throttle
frees the one place (`OneInFlight.dialogClosed`, Amendment 2 B.2), and the agent's next call raises the next modal, which VS Code cannot
take down for the one that timed out. One dead modal every five minutes: about a hundred by morning. A click on a dead one writes nothing
and decides nothing (`withTimeout` has settled; the late answer is read by nobody). The harm is not the hundred clicks; it is that clearing
a hundred dead modals with Allow trains the reflex the consent modal exists to defeat, and the hundred-and-first may be live.

The prompt windows (five dialogs a minute per door, sixty asking calls a minute) bound the rate, not the duration: one dialog per five
minutes is far below either ceiling.

## The sketch (not yet decided; the plan review decides)

- **Count consecutive timeouts per door** (the bridge's `bridgeId`, or `LOCAL_DOOR`), in `TokenlessCeilings`'s `DoorCounts`. A dialog a person
  answers — Allow or Deny, on ANY door — resets every door's count: a person is at the screen.
- **After N consecutive timeouts (N = 3) the door refuses asking calls** with a backoff: 15 minutes, doubling to a cap of 4 hours. The refusal
  is `too_many_requests` with a sentence that names when the door asks again and what to do:
  `Nobody has answered the last 3 requests from this Remote Bridge. It asks again at <local time>; ask the person to look at their VS Code
  window, or set this entry to a quieter consent policy there.` One journal line per backoff, not per refused call (the `firstThisWindow`
  rule).
- **Recovery with no click:** when the backoff expires, one asking call is admitted and its dialog raised (the probe). Answered: everything
  resets. Timed out: the count stays, the backoff doubles. So a bridge whose person is away for a weekend raises one dialog every four hours
  instead of one every five minutes — about twelve dead modals over a weekend instead of six hundred.
- **Silent calls are untouched:** a `quiet` bridge whose entries have a `never` or `every12h` policy never raises a dialog and is never backed
  off; this is a reason a person may choose quiet for a server that runs overnight, and the help should say so.
- **A person's own actions are untouched:** the back-off is a door's state; the main port's token dialogs are not throttled and not counted.

Open questions for the review: whether N and the first backoff should be settings (the parent plan's doctrine prefers one number with a
reason); whether the probe should be the OLDEST waiting call or the next one (the calls that were refused are gone; a probe is simply the next
call admitted); whether a `Close Remote Bridge` or a reload resets the count (a reload does, because the state is in memory; the question is
whether it should).

## Decided already, so it is not re-asked

- **The `busy` sentence stays.** It tells server A that a request from another door is waiting for the person. The status itself tells the same
  bit (admitted or `busy`), and the moment the place frees is what an attacker would time against, so a vaguer sentence changes nothing an
  agent can do and takes words from an honest agent's operator. Judged in Amendment 3, C.11.
- **A key file left behind** when its removal fails (Amendment 3, C.6: a Windows lock, the note names the failure, the slot comes back) stays in
  the materialised-keys folder (0700, the file 0600, locked to the owner, `<keyEntityId>-<uuid>.key`, one per call) until the person deletes it;
  no sweep of that folder was found. E4 decides whether a sweep at activation is wanted; it belongs with the leftovers rules of the shared
  conventions, not here.

## Definition of Done (for the plan that builds this)

- [ ] N consecutive timeouts on one door back it off; an answered dialog on any door resets; the probe after the backoff is one dialog.
- [ ] The sentence names the time and the remedy and nothing out of scope; one journal line per backoff.
- [ ] Silent calls, the main port's token dialogs and the human path are byte for byte unchanged.
- [ ] Watched RED first through the broker test world with `consentTimeoutMs` lowered; a break-it for each rule above.
