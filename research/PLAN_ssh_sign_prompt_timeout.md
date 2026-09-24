# PLAN — the SSH agent's signing prompt expires after five minutes, like the broker's

> Status: **IMPLEMENTED, 2026-09-24.** Scope: `src_vs_code` — the modal `SshAgentManager.confirm`
> raises before every signature; the consent timeout constant; the SSH agent scenario harness. No
> agent protocol, CLI or server change.
>
> Related docs: [PLAN_ssh_sign_prompt_time.md](PLAN_ssh_sign_prompt_time.md) §Open tail;
> [module_extension.md](module_extension.md) §Consent, §SSH agent; [module_tests.md](module_tests.md).

## What shipped differently — read this first

1. **The timer is NOT unref'd**, against §3's "the same call the broker makes". `withTimeout.ts`
   records that an unref'd timer ends a test run with nothing else alive, and the extension host is
   terminated by VS Code after deactivate, so a held 5-minute timer delays nothing.
2. **`askToSign` + `durationText`**, not a bare log helper: the modal lives in its own method, and the
   bound is said as "N minutes" — or seconds under a minute, so a short bound never reads "0 minutes".
3. **A modal that REJECTS is a dismissal**, logged with its reason (`modalFailed`) — not in the plan;
   the gate round held us to `withTimeout`'s contract that it is never handed a rejecting promise.
4. **The scenario harness drives the real manager** (`ssh-agent-itest.cjs`, `unansweredPromptRefuses`):
   a stubbed `vscode` whose modal never answers, a 1.5 s bound, and the real `ssh-keygen -Y sign`,
   which must fail after the bound and before run()'s 15 s kill (plan round, finding 5). With the bound
   inflated it fails "exit 1 after 15022 ms" (observed).
5. The constant now lives at `agentConsent.ts` (`CONSENT_TIMEOUT_MS`); `credsAgentServer.ts:59` no
   longer holds it.

**The gate.** Plan round `proceed`, 3/3; 2 of 8 accepted (the scenario, a derived duration) — the rest
described late-click races `withTimeout` cannot have (it settles once). Code round `proceed`, 12/12; 7
of 19 accepted (the rejection handler, seconds under a minute, the fixture casts ×2, the harness's
`finally`, the promotion ×2). Rejected included three contradictory `unref` findings and a timer that
"starts before the modal". Own reviewer: Opus — the log for a rejected modal, a pre-caught rejection
in the fixture, a lower bound in the harness, the stale comment and docs.

**Open tail.** Parallel signing requests queue their modals; a second one can be SHOWN after its five
minutes ran out. The "Requested …" line keeps it honest, and the broker behaves the same.

## 1. The goal

The signing prompt (*Use the SSH key "prod" to sign …?*, `sshAgentManager.ts:237-262`) never expires:
`confirm` awaits `showWarningMessage` with no bound, so a prompt found an hour later still signs, and
the `ssh`/`git` that asked waits forever. The broker's consent modal has refused after five minutes
since it shipped (`credsAgentServer.ts:59`, `CONSENT_TIMEOUT_MS`, through `withTimeout`). The owner
decided on 2026-09-24 that the signing prompt gets the same bound.

## 2. What must be true when done

1. Unanswered for five minutes, the signature is refused: `confirm` answers `false`, the requester
   gets the agent's ordinary failure, and the SSH Agent output channel says it timed out.
2. A click after that changes nothing — a late *Allow once* signs nothing and a late *Allow for 10
   minutes* opens no window (VS Code cannot close a modal from code, so the dialog can still be
   clicked). A timeout is not presence: it does not postpone auto-lock.
3. The prompt says so in its own text, so the person knows the dialog has a deadline.
4. ONE constant for both dialogs: `CONSENT_TIMEOUT_MS` moves to the pure `agentConsent.ts` and both
   the broker and the agent import it (reuse-first; today it is private to `credsAgentServer.ts`).
5. README, CHANGELOG `[Unreleased]`, `module_extension.md` say so.

## 3. Design

- `agentConsent.ts`: `export const CONSENT_TIMEOUT_MS = 5 * 60_000;` — the broker imports it.
- `SshAgentManager`: a trailing optional `consentTimeoutMs = CONSENT_TIMEOUT_MS` (tests shorten it);
  `confirm` wraps the modal in `withTimeout(…, this.consentTimeoutMs, { unref: true })` — the same
  call the broker makes; `undefined` is already `consentFromChoice`'s dismissal (refuse, not present).
- A log line on the timeout, in its own helper to keep `confirm` within complexity 4.

## 4. Build order

1. Tests first (red). 2. Move the constant. 3. The bound and its sentence. 4. Docs.

## 5. Test plan

- `sshAgentManager.test.ts` (the answer is a promise that never resolves, the timeout 20 ms):
  `confirm` answers `false`; no presence; the output channel names the timeout.
- A late *Allow for 10 minutes* (resolved after the timeout) opens no window: the next signature asks.
- The prompt text states the five-minute limit.
- The broker still imports the same constant (compile) and its tests stay green.

## 6. Risks

- A person who reads slowly past five minutes has to repeat the `git push`. That is the broker's
  trade too, and the time on the prompt now says when it was asked.

## 7. Definition of Done

- [x] Unanswered for five minutes, a signature is refused; a late click changes nothing.
- [x] Tests red first; `npm test`, lint, typecheck, package green.
- [x] Docs updated; this plan promoted.
- [x] The `coai` gate: plan round and one code round; own review in parallel.
- [ ] PR merged, threads resolved.
