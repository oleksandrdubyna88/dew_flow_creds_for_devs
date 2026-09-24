# PLAN — the agent consent dialog says when the request was made (issue #131)

> Status: **IMPLEMENTED, 2026-09-24.** Scope: `src_vs_code` — the consent modal `CredsAgentServer.ask`
> raises. Every broker door (token, alias, MCP use/create/delete, folder actions) may raise it when a
> call needs new consent; a grant already allowed or denied answers in `consent` without one. No
> broker contract, CLI, MCP or server change.
>
> Related docs: [module_extension.md](module_extension.md) §Consent, *When it was asked*;
> [architecture.md](architecture.md).

## What shipped differently — read this first

1. **Every broker door, not only a shared token's first use** — each may reach `consent → ask` when
   a call needs new consent, so the scope line above was widened to say what shipped.
2. **The joined dialog has its own test** (gate code round): the modal's answer is held open while a
   second call arrives, and there is still one dialog. Breaking the `consenting` reuse turns it red.
3. **The staleness claim was corrected** (own review): the plan spoke of a "twenty-minute-old
   request", but the broker stops waiting after five minutes and the call is already refused; a modal
   cannot be closed from code, so what the time actually tells the person is that the dialog is stale.
4. `utcOffset` became `formatUtcOffset`; the rest shipped as planned.

**The gate.** Plan round `proceed`, 3/3 reviewers; 2 of 8 accepted — the six that asked to thread an
arrival timestamp through all five doors were rejected (the gap is the body read and validation,
milliseconds, and the text is never re-rendered). Code round `proceed`, 12/12 reviewers; 6 of 18
accepted (the joined-dialog test, the promotion ×3, the rename ×2); rejected ones include a
"missing" regex period that is there and an epoch-shift "drift" whose own examples are correct. Own
reviewer: Opus (the dead-dialog wording, the SSH prompt question, the promotion).

**Open tail.** Closed: the owner decided the SSH agent's signing prompt carries the line too —
[PLAN_ssh_sign_prompt_time.md](PLAN_ssh_sign_prompt_time.md). Whether that prompt should also expire
is a separate question nobody has asked yet.

## 1. The goal

Issue #131: *"the message must show the date and time"*. The screenshot is the consent modal:
*An agent wants to run a command on "ionos server" using its stored credential.* — the command, the
caller disclaimer, what Allow covers, and Allow / Deny / Cancel. Nothing on it says WHEN the agent
asked, so a modal found on returning to the desk reads the same as one raised a second ago — and
a request whose dialog has already timed out looks exactly like a live one.

Decided with the owner on 2026-09-23: **local time with its UTC offset**, e.g.
`Requested 2026-09-23 14:05:12 (UTC+03:00).`

Facts the design rests on:

- The modal is built in one place: `credsAgentServer.ts:646-651` (`showWarningMessage(… { modal:
  true }, 'Allow', 'Deny')`), reached through `consent` (`:592-622`), which shares ONE pending
  dialog per grant (`this.consenting`), so a second call while the first is on screen shows no
  second modal — the time on it is the FIRST request's.
- The dialog waits up to `CONSENT_TIMEOUT_MS` unattended; that wait is why the time matters.
- `test/brokerConsentText.test.ts` drives the real broker under the vscode stub and reads
  `w.dialogs` — the pattern to follow. PR #139 (another session) is editing that file and
  `brokerCaller.ts`, so this change touches neither: a new pure module and a new test file.

## 2. What must be true when done

1. The modal carries `Requested YYYY-MM-DD HH:MM:SS (UTC±HH:MM).` in the machine's local time, on
   its own line right after the head sentence — the moment the broker raised the dialog for the
   request, which is that request's own arrival plus its body read and validation (milliseconds).
   The text is built once and never re-rendered, so a dialog left waiting keeps the time it was
   raised, and a second call joining the open dialog changes nothing on it (gate plan round).
2. The offset is exact for zones off the hour (`UTC+05:30`, `UTC-03:30`) and for UTC itself
   (`UTC+00:00`), and the date is the LOCAL date (23:30 UTC in UTC+03:00 is the next day).
3. The formatting is a pure function tested without depending on the test machine's time zone.
4. CHANGELOG and `module_extension.md` say so.

## 3. Design

- `src_vs_code/src/requestTime.ts` (pure): `requestTimeLine(epochMs, offsetMinutes)` →
  `Requested 2026-09-23 14:05:12 (UTC+03:00).`, and `localRequestTimeLine(date)` supplying the offset
  from `date.getTimezoneOffset()` (whose sign is the opposite of the offset's — the one trap here).
- `credsAgentServer.ask`: the line after the head sentence, from a `Date` taken as the dialog is
  built. No clock injection into the server: the broker test asserts the SHAPE, the pure test the
  arithmetic.

## 4. Build order

1. `requestTime.ts` + tests (red first). 2. The modal. 3. Docs.

## 5. Test plan

- `requestTime.test.ts`: a fixed epoch in UTC+03:00, UTC−05:00, UTC+05:30, UTC−03:30 and UTC+00:00;
  a date that rolls over to the next local day, and one that rolls BACK across a month and a year
  (00:30 UTC on 1 January in UTC−05:00 is 31 December); single-digit fields zero-padded; `localRequestTimeLine`
  uses the date's own offset with the right sign (checked against `getTimezoneOffset`).
- `brokerConsentTime.test.ts` (real broker under the stub): the dialog's second line matches the
  shape, and the time on it is within the test's own before/after bracket.

## 6. Risks

- A modal left open across a DST change shows the offset that was in force when it was raised —
  which is the correct reading of "when was this asked".

## 7. Definition of Done

- [x] The modal shows the request time in local time with its offset.
- [x] Tests above, red first; `npm test`, lint, typecheck, package green.
- [x] Docs updated; this plan promoted.
- [x] The `coai` gate: plan round and one code round; own review in parallel.
- [ ] PR merged, threads resolved.
