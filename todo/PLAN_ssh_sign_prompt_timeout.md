# PLAN — the SSH agent's signing prompt expires after five minutes, like the broker's

> Status: **plan only, nothing implemented yet, 2026-09-24.** Scope: `src_vs_code` — the modal
> `SshAgentManager.confirm` raises before every signature; the consent timeout constant. No agent
> protocol, CLI or server change.
>
> Related docs: [PLAN_ssh_sign_prompt_time.md](../research/PLAN_ssh_sign_prompt_time.md) §Open tail;
> [module_extension.md](../research/module_extension.md) §Consent, §SSH agent.

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

- [ ] Unanswered for five minutes, a signature is refused; a late click changes nothing.
- [ ] Tests red first; `npm test`, lint, typecheck, package green.
- [ ] Docs updated; this plan promoted.
- [ ] The `coai` gate: plan round and one code round; own review in parallel.
- [ ] PR merged, threads resolved.
