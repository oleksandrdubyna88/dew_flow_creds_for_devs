# PLAN — an output that cannot be masked is withheld, never sent raw

> Status: **IMPLEMENTED, 2026-09-11.** Scope as built: `brokerResponse.ts`, `credsAgentServer.ts`,
> `brokerProtocol.ts`, `maskEntries.ts`, `useActions.ts`, `rotateAction.ts`, `package.json`,
> `README.md`, and the tests `maskFailClosed.test.ts` (new), `brokerWorld.ts`, `helpCoverage.test.ts`.
> Audit finding **#1** of [REVIEW_product_audit_2026-09-09.md](../todo/REVIEW_product_audit_2026-09-09.md), plus
> the dead `maskAgentOutput` setting found in the 2026-09-10 re-verification (§Перепроверка).
>
> Related docs: [module_extension.md](module_extension.md) (the broker),
> [PLAN_ai_context_masking.md](PLAN_ai_context_masking.md) (why masking is one choke point).

## Symptom

The broker's promise is that an agent USES a credential and never sees it. Response bodies carry the
child's stdout (`agentUseActions.ts:143`, `:195`; `rotateAction.ts:282`), so the masker at
`credsAgentServer.ts:574` is the only thing between a command that prints its own password and the
agent that composed it. That masker **fails open**:

- `maskedBody` catches every error and returns the original body with `hits: 0`
  (`brokerResponse.ts:31-35`); `maskedReason` rides the same path (`:54-61`), so the journal line gets
  the raw driver message too.
- The table is five keychain reads under one `Promise.all` (`maskEntries.ts:52-58`): one rejection loses
  all five values. And no exception is needed — an entry deleted or renamed during the run makes
  `getNode` answer `undefined` (`:49`), the table comes back empty, and `hits: 0` is indistinguishable
  from "nothing to mask".
- The worst site is **rotation**: `commit` stores the new secret and then returns the far side's stdout
  (`rotateAction.ts:275-282`). A keychain write immediately precedes the keychain read the masker needs,
  so their failures are correlated — the storage hiccup that breaks the mask is the one that just
  happened — and what leaks is a freshly committed production credential.
- Nothing exercises the `catch`: `grep maskedBody src/test/` finds no test. The fail-open lives in a
  comment (`brokerResponse.ts:17-21`), which argues that failing closed *would trade a possible leak for
  a certain outage*. That argument holds for a completed action; it does not hold before the action
  runs, and it never held for the journal.

Audit reproduction: a synthetic action answering `synthetic-audit-password-ONLY`, a masker that throws —
the real HTTP broker answered `200` with the string; `maskedReason` returned it unredacted.

Separately, `credSshManager.maskAgentOutput` is declared (`package.json:222`, default `true`),
documented (`README.md:1068`) and covered by `helpCoverage.test.ts:148` — and read by no production code
(the twelve keys `getConfiguration('credSshManager').get(...)` reads do not include it). The switch lies
in the safe direction: masking is always on. It still lies.

## What must be true when this is done

1. An agent never receives an unmasked body. If the values cannot be known, the body is not sent.
2. A masking failure **before** the action refuses the call before any side effect.
3. A masking failure **after** the action withholds the output and says the action may have run, so an
   agent does not retry a side effect blindly.
4. The journal never carries a raw reason: unmaskable → *withheld*.
5. No user-facing setting claims to control masking unless it does.

## Design

### 1. Build the table before `run`, refresh it after, and never fall back past a rotation

In `perform` (`credsAgentServer.ts:563-587`):

```
table = await tableFor(grant)            // throws → respondError('internal', MASKING_UNAVAILABLE); nothing ran
reserve / touch
result = await useAction.run(...)
after  = await tableFor(grant).catch(() => undefined)
if (after === undefined && result.storedSecretChanged) → withhold      // see below
sent   = maskResponseBody(result.body, after === undefined ? table : union(table, after))
```

The PRE-RUN table is mandatory: the values the action is about to inject are exactly the values it
can print, and they are readable now or the action should not start. `tableFor` therefore **rejects
when the granted entity is not there at all** (gate round 1, codex) — today `getNode` answering
`undefined` yields an empty table that is indistinguishable from "this entry has no secrets", which
is precisely the silent path the audit describes. An entity that exists and holds no secrets still
gives a legitimately empty table.

**The post-run refresh may not fall back when the action changed a stored secret.** All three vendors
found this independently in round 1, and they were right about a hole in this plan rather than in the
code: a rotation stores its new value DURING the run, so the pre-run table cannot contain it — and
falling back to that table on a failed refresh would send the freshly committed production credential
out in the clear, which is the exact worst case this plan was written for.

The distinction is not guesswork, and it does not have to be paid by every ordinary call either.
`UseActionResult` gains `storedSecretChanged?: boolean`; `rotateAction.commit` is the one place that
sets it, because it is the one place that writes a secret mid-run. Then:

- refresh succeeded → mask with `union(table, after)`, which covers both the old value and the new;
- refresh failed **and** `storedSecretChanged` → **withhold** (below). The one value that matters is
  the one that cannot be in any table we hold;
- refresh failed and nothing changed → the pre-run table is complete BY CONSTRUCTION, and using it
  costs the agent nothing. Withholding here would be the "certain outage for a possible leak" trade
  the old comment warned about, taken in the one case where there is no possible leak.

Design choice recorded: the alternative — every action returning the values it injected — would be
the strongest possible table, and it would put the secret in an `UseActionResult` that travels
through the same function as the response body. Rejected for that reason; `storedSecretChanged` is a
boolean, not a secret.

### 2. Withholding says the action may have run

A withheld answer is `respondError('internal', OUTPUT_WITHHELD, …)` whose body carries
`actionRan: true` (gate round 1, all three vendors). An agent that cannot tell "it did not happen"
from "it happened and you cannot see the output" will retry a non-idempotent side effect — and the
action this fires for is a credential rotation, where a blind retry rotates twice. The audit line
records the outcome as `withheld`.

### 3. `maskedReason` follows

`maskedReason(table, reason)` takes the table already in hand; when there is none the detail is the
literal `[reason withheld: masking unavailable]`. The journal keeps the summary and the outcome.

### 4. `maskedBody` becomes explicit about failure

`brokerResponse.ts` stops catching. `maskedBody(entriesFor, where, body)` is replaced by
`tableFor(entriesFor, where): Promise<MaskTable>` (throws) and the pure `maskResponseBody`. The
comment that argued for failing open is rewritten to say what is true now: the table is read before
the action, so a read failure costs a refused call rather than a completed action's result.

### 5. Remove `maskAgentOutput`

`package.json`, `README.md`, `helpCoverage.test.ts`. A switch that turns OFF a security control is a
liability when it works and a lie when it does not; it never worked, so removing it changes no
behaviour. `CHANGELOG.md` says so in one sentence.

## Build order

1. RED: `credsAgentServer.test.ts` — `'when the masker fails before the action, nothing runs and the
   agent gets an error — both doors'` (harness gains `maskerFails: 'before' | 'after'`); today the
   action runs and the raw body is answered.
2. RED: `'when the masker fails after the action, the pre-run table still masks the answer'` — a
   secret printed by the run stub comes back as `<CREDS_MASKED:…>` even though the refresh threw.
3. RED: `'the journal never carries the raw reason when masking is unavailable'`.
4. RED: `brokerResponse.test.ts` (new) — `tableFor` throws through; `union` keeps both sides.
5. Implement 1–4 → GREEN.
6. RED: `'a rotation's new value is masked out of the rotation's own stdout'` — the run stub stores a new
   value into the harness's secrets during `run`; the pre-run table did not have it, the post-run one does.
7. Remove the setting; update `helpCoverage.test.ts`; `npm run typecheck`; full `npm test`;
   `node scripts/agent-broker-itest.cjs` (the real broker/CLI path).
8. `module_extension.md` (broker: "masking is read before the action"); `CHANGELOG.md`.

## Test plan

| Test | Proves |
|---|---|
| masker throws before run → error, `w.ran` empty, both doors | rule 2 |
| the granted ENTITY is gone before the call → error, `w.ran` empty | rule 2, the silent path |
| an entity that exists with no secrets → the call runs normally | an empty table is not a failure |
| masker throws after run, nothing changed → masked body from the pre-run table | rule 1 |
| masker throws after run, `storedSecretChanged` → **withheld**, `actionRan: true`, no body | rule 1, 3 |
| rotation: value stored during run is masked when the refresh works | refresh + union |
| journal detail when unmaskable; outcome `withheld` | rule 4 |
| `agent-broker-itest.cjs` all checks | the real path still answers |
| help coverage without the setting | rule 5 |

## Definition of Done

- [ ] All tests above; RED messages and the GREEN run reported.
- [ ] `npm run typecheck`, `npm test`, `agent-broker-itest.cjs` green.
- [ ] `maskAgentOutput` gone from `package.json`, `README.md`, the help test; `CHANGELOG.md` says it never
      had an effect.
- [ ] `module_extension.md` updated; `coai` plan → `proceed`, code round run, findings resolved.
- [ ] Promoted to `research/` with deviations recorded.


## What shipped differently

**The plan had the rotation case wrong, and all three review vendors found it independently.** Its
first draft fell back to the pre-run table whenever the post-run refresh failed. A rotation writes
its new secret DURING the run, so that table cannot contain it - the fallback would have masked the
OLD credential and sent the freshly committed one in the clear, which is precisely the worst case the
plan was written to close.

The fix is narrower than the reviewers proposed. They asked for *always withhold when the refresh
fails*; that pays an availability cost on every ordinary exec, where the pre-run table is complete by
construction and there is no possible leak. `UseActionResult.storedSecretChanged` - a boolean, never
the value - marks the one action that writes mid-run, and only that case withholds.

**A missing entity throws rather than answering an empty list.** Also from the gate. `maskEntriesFor`
used to return `[]` when `getNode` found nothing, and an empty table masks nothing while reporting
`hits: 0` - indistinguishable in the audit from a passwordless script entry. `MaskSourceUnavailable`
separates them. The other half of that test matters as much: an entity that EXISTS and holds no
secrets still runs normally, which is why the refusal cannot simply key on an empty list.

**A withheld answer carries `actionRan: true`.** All three vendors again: an agent that cannot tell
*it did not happen* from *it happened and you cannot see it* retries, and the only action that
reaches this rotates a credential.

**The answer sequence moved out of `credsAgentServer.ts` entirely.** Not planned, and not optional:
the file was at its 800-line ceiling, and the change added to it. Mask - log - respond - burn, or
withhold, is now `runAndDeliver` in `brokerResponse.ts`, which is already documented as owning what
happens to a call's answer; `perform` splits at the side-effect seam, so everything above the split
can refuse without a side effect and nothing below it can. The file is back to exactly 800 lines.

**Deviation from the plan's step 2.** The plan reserved an `OUTPUT_WITHHELD` branch for "a future
masker that can fail after the run" while asserting the case was unreachable. It is reachable, it is
the rotation case, and it is now the branch's only reason to exist.

## Open tail

None. The one thing deliberately not built is the plan's own rejected alternative: actions returning
the values they injected would give the strongest possible table, and it would put the secret into
the same object as the response body - which is the one place this design keeps it out of.
