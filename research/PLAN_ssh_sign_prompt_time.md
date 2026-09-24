# PLAN — the SSH agent's signing prompt says when it was asked (the #131 tail)

> Status: **IMPLEMENTED, 2026-09-24.** Scope: `src_vs_code` — the modal `SshAgentManager.confirm`
> raises before every signature. No agent protocol, CLI or server change.
>
> Related docs: [PLAN_consent_shows_request_time.md](PLAN_consent_shows_request_time.md) §Open tail;
> [module_extension.md](module_extension.md) §Consent, *When it was asked*.

## What shipped differently — read this first

1. **The manager takes a clock** (`clock: () => Date`, a trailing optional constructor argument,
   default `new Date()`) — the plan round held us to testing.md's rule that a test about time
   freezes the clock the code reads. The test asserts the exact line for a stopped instant instead
   of a before/after bracket.
2. **The time is taken first thing in `confirm`**, before the unknown-request log line.
3. **The ten-minute window still starts at the click.** Five code-round findings asked to anchor it
   at the request; rejected, because agentConsent.ts documents a deadline "fixed at the click" and the
   code already worked that way — a person answering a nine-minute-old prompt gets ten minutes for
   the push they are doing now, not one.

**The gate.** Plan round `proceed`, 3/3; 3 of 9 accepted (the clock argument, capture at entry, an
exact assertion). Code round `proceed`, 12/12; 6 of 18 accepted (the promotion ×4, capture before
the log line). Own reviewer: Opus.

**Open tail.** Whether the signing prompt should EXPIRE is a separate question nobody has asked.

## 1. The goal

#131 put `Requested 2026-09-23 14:05:12 (UTC+03:00).` on the broker's consent modal and left one
dialog out: the SSH agent's signing prompt (`sshAgentManager.ts:237-246`, *Use the SSH key "prod"
to sign …?*), raised by `git push`/`ssh` through `SSH_AUTH_SOCK`. The owner decided on 2026-09-24
that it carries the same line. It matters MORE here than on the broker: this prompt has no timeout,
so a request found an hour later is still live, and Allow signs.

## 2. What must be true when done

1. The prompt's second line is the request time, from the same `requestTime.localRequestTimeLine`
   (reuse, not a second formatter), under the question and before the fingerprint.
2. The time is fixed when the prompt is raised; a signature inside the ten-minute window raises no
   prompt and so carries no time.
3. CHANGELOG (the #131 entry, which says the SSH prompt is unchanged) and `module_extension.md` say so.

## 3. Design

- `confirm` (`sshAgentManager.ts:231`): insert `${localRequestTimeLine(new Date())}` after the first
  sentence. Complexity unchanged (a template argument).

## 4. Build order

1. Test first (red). 2. The line. 3. Docs.

## 5. Test plan

- `sshAgentManager.test.ts`: the dialog's second line matches the `Requested … (UTC±HH:MM).` shape
  and lies within the test's before/after bracket; the first line is still the question.

## 6. Risks

- None beyond #131's: the line is a label; nothing decides with it.

## 7. Definition of Done

- [x] The signing prompt shows the request time in local time with its offset.
- [x] Test red first; `npm test`, lint, typecheck, package green.
- [x] Docs updated; this plan promoted.
- [x] The `coai` gate: plan round and one code round; own review in parallel.
- [ ] PR merged, threads resolved.
