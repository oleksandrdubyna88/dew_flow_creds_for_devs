# PLAN — the agent consent dialog says when the request was made (issue #131)

> Status: **plan only, nothing implemented yet, 2026-09-24.** Scope: `src_vs_code` — the modal
> `CredsAgentServer.ask` raises on an agent's first use of a shared token. No broker contract, CLI,
> MCP or server change.
>
> Related docs: [module_extension.md](../research/module_extension.md) §Share with Claude Code;
> [architecture.md](../research/architecture.md).

## 1. The goal

Issue #131: *"the message must show the date and time"*. The screenshot is the consent modal:
*An agent wants to run a command on "ionos server" using its stored credential.* — the command, the
caller disclaimer, what Allow covers, and Allow / Deny / Cancel. Nothing on it says WHEN the agent
asked, so a modal found on returning to the desk reads the same as one raised a second ago — and
an agent's request from twenty minutes ago is exactly the one a person should look at twice.

Decided with the owner on 2026-09-23: **local time with its UTC offset**, e.g.
`Requested 2026-09-23 14:05:12 (UTC+03:00).`

Facts the design rests on:

- The modal is built in one place: `credsAgentServer.ts:646-651` (`showWarningMessage(… { modal:
  true }, 'Allow', 'Deny')`), reached through `consent` (`:596-622`), which shares ONE pending
  dialog per grant (`this.consenting`), so a second call while the first is on screen shows no
  second modal — the time on it is the FIRST request's.
- The dialog waits up to `CONSENT_TIMEOUT_MS` unattended; that wait is why the time matters.
- `test/brokerConsentText.test.ts` drives the real broker under the vscode stub and reads
  `w.dialogs` — the pattern to follow. PR #139 (another session) is editing that file and
  `brokerCaller.ts`, so this change touches neither: a new pure module and a new test file.

## 2. What must be true when done

1. The modal carries `Requested YYYY-MM-DD HH:MM:SS (UTC±HH:MM).` in the machine's local time, on
   its own line right after the head sentence — the moment the request that raised the dialog
   arrived.
2. The offset is exact for zones off the hour (`UTC+05:30`, `UTC-03:30`) and for UTC itself
   (`UTC+00:00`), and the date is the LOCAL date (23:30 UTC in UTC+03:00 is the next day).
3. The formatting is a pure function tested without depending on the test machine's time zone.
4. CHANGELOG and `module_extension.md` say so.

## 3. Design

- `src_vs_code/src/requestTime.ts` (pure): `requestTimeLine(epochMs, offsetMinutes)` →
  `Requested 2026-09-23 14:05:12 (UTC+03:00).`, and `localRequestTime(date)` supplying the offset
  from `date.getTimezoneOffset()` (whose sign is the opposite of the offset's — the one trap here).
- `credsAgentServer.ask`: the line after the head sentence, from a `Date` taken as the dialog is
  built. No clock injection into the server: the broker test asserts the SHAPE, the pure test the
  arithmetic.

## 4. Build order

1. `requestTime.ts` + tests (red first). 2. The modal. 3. Docs.

## 5. Test plan

- `requestTime.test.ts`: a fixed epoch in UTC+03:00, UTC−05:00, UTC+05:30, UTC−03:30 and UTC+00:00;
  a date that rolls over to the next local day; single-digit fields zero-padded; `localRequestTime`
  uses the date's own offset with the right sign (checked against `getTimezoneOffset`).
- `brokerConsentTime.test.ts` (real broker under the stub): the dialog's second line matches the
  shape, and the time on it is within the test's own before/after bracket.

## 6. Risks

- A modal left open across a DST change shows the offset that was in force when it was raised —
  which is the correct reading of "when was this asked".

## 7. Definition of Done

- [ ] The modal shows the request time in local time with its offset.
- [ ] Tests above, red first; `npm test`, lint, typecheck, package green.
- [ ] Docs updated; this plan promoted.
- [ ] The `coai` gate: plan round and one code round; own review in parallel.
- [ ] PR merged, threads resolved.
