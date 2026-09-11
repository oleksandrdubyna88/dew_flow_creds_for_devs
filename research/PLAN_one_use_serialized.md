# PLAN — a one-use entry is used once, and a call cap is a cap

> Status: **IMPLEMENTED, 2026-09-11.** Scope as built: `grantRegistry.ts` (`reserve`, and `touch`
> removed), the new `oneUseLane.ts` and `brokerCall.ts`, `credsAgentServer.ts`, `entityExpiry.ts`,
> `burnOnUse.ts`, `extension.ts`, `.size-baseline.json`, `scripts/creds-cli-itest.cjs`, the new
> `test/oneUseAndCap.test.ts`, `test/grantTtl.test.ts`, `test/brokerWorld.ts`.
> Audit finding **#3** of [REVIEW_product_audit_2026-09-09.md](../todo/REVIEW_product_audit_2026-09-09.md), with the
> two halves re-ranked in the 2026-09-10 re-verification (§Перепроверка).
>
> Related docs: [module_extension.md](module_extension.md) (grants, consent, the burn),
> [PLAN_ephemeral_secrets.md](PLAN_ephemeral_secrets.md) (where `oneUse` came from).

## Symptom

Two check-then-act gaps across `await` boundaries, in one function:

- **The call cap.** `lookup` applies `maxUses` at `credsAgentServer.ts:497`; then `await readBody`
  (`:512`), then `await consent` (`:554`), and only then `touch` increments `uses` (`:563`). Concurrent
  first calls **deliberately** share one consent dialog (`:622`), so two requests under `cap=1` both pass
  `lookup` at `uses=0`, both wait for the same Allow, both `touch`, both run. Audit reproduction on the
  real broker: `configuredMaxCalls=1; executed=2; dialogs=1; statuses=[200,200]`.
- **The one-use entry.** `burnIfSpent` runs after the answer is on the wire (`:587`, and the comment says
  why — a storage failure while burning must not cost the agent its result). Two concurrent calls on a
  `oneUse` entry both run before either burns. The MCP door mints a grant per call, so even two different
  tokens reach the same entry; `acquireExecSlot` (`:203`) bounds total concurrency, not per-entity.

Re-ranked against the audit: `agentGrantMaxCalls` defaults to `0` — no cap (`grantLimits.ts:18`,
`package.json:218`) — so the cap half bites only somebody who turned it on. `oneUse` is an option in the
entry form (`entityExpiry.ts:50`, *"Until an agent uses it once"*): a promise the UI makes to everyone.
The one-use half is the P1; the audit called it *an additional risk nearby*.

## What must be true when this is done

1. Under `cap=N`, at most N calls on a token ever reach `run`, however they interleave.
2. A one-use entry reaches `run` once. The second concurrent call is refused with the same answer a
   burnt entry gives a late call today (`not_found`), not a second run.
3. What a use costs is decided and written down: a refused or timed-out consent costs nothing (unchanged);
   a reserved call costs one use whether the action then succeeds, fails or throws — the action may have
   had its effect.

## Design

### 1. `GrantRegistry.reserve` — check and count in one synchronous step

```ts
/** Re-check expiry and the cap, and spend one use — atomically, no await between. */
reserve(secret: string, now: number, limits: GrantLimits): GrantLookup
```

Replaces `touch` at `credsAgentServer.ts:563`. Node is single-threaded: a check-and-increment with no
`await` inside is atomic with respect to every other request. On `expired` the call answers
`unauthorized` with `expiredMessage` — the message the token would have got had it arrived a moment
later. `touch` stays for its other callers, if any; otherwise it goes.

### 2. A lane per one-use entity

The broker does not know `burnPolicy` and should not (`credsAgentServer.ts:106-114` explains why the
burn DECISION lives outside). So it asks the same side of the wall one more question:

```ts
private readonly isOneUse?: (accountId: string, entityId: string) => boolean
```

wired in `extension.ts:523-531` from `entityExpiry.ts:77` (`isOneUse(node)`). In `perform`, when the
window can burn and the entity is one-use, the call joins a lane keyed by `entityId`:

```ts
private readonly lanes = new Map<string, Promise<void>>();
```

Each call chains on the previous promise for that entity and runs `run → mask → respond → burn` inside
the chain; the lane entry is deleted when its last promise settles, so the map never outgrows the set of
in-flight one-use entities. The second call reaches `run` after the first has burnt, and the action's own
`entityFor` answers `not_found` (`agentUseActions.ts` — every action begins with it). Nothing else is
serialised: two parallel queries against a normal `prod-db` entry keep running in parallel.

Rejected: serialising every call per entity (costs legitimate parallelism); moving the burn before the
response (re-opens the "a storage failure costs the result" defect the comment at `:585-586` records).

### 3. The cost of a use

Reservation happens after consent and before `run`. Consent refused or timed out → nothing reserved
(today's guarantee, kept). Reserved and then `run` throws → the use is spent; the journal line already
says `internal` for that call, and the audit's own remark applies: the action may have executed.

## Build order

1. RED: `grantRegistry.test.ts` — `'reserve spends a use and refuses the next call at the cap, with no
   await between the check and the count'`.
2. `reserve` → GREEN.
3. RED: `credsAgentServer.test.ts` — `'two concurrent calls on a cap-1 grant run once, share one dialog,
   and the second is told the cap was reached'` (harness: `world({ maxCalls: 1 })` through the config
   stub at `brokerWorld.ts:98`). Today: both run.
4. Wire `reserve` → GREEN.
5. RED: `'two concurrent calls on a one-use entry: one runs, one is refused, the entry burns once — both
   doors'` (harness gains `oneUse: true`; the run stub answers `not_found` once `w.burned` names the id).
6. `isOneUse` dep, the lane, `extension.ts` wiring → GREEN.
7. `npm run typecheck`; full `npm test`; `node scripts/agent-broker-itest.cjs`.
8. `module_extension.md` (grant lifecycle: reserve; one-use lane); `CHANGELOG.md`.

## Test plan

| Test | Proves |
|---|---|
| `reserve` at cap | rule 1, pure |
| concurrent cap-1 calls over real HTTP | rule 1, both doors |
| concurrent one-use calls, token door | rule 2 |
| concurrent one-use calls, MCP door (two grants, one entry) | rule 2 across grants |
| run throws after reserve → use spent, next call at cap refused | rule 3 |
| consent denied → no use spent (existing test) | rule 3 unchanged |
| a normal entry: two concurrent calls both run | nothing else serialised |

## Definition of Done

- [ ] All tests above; RED and GREEN reported with numbers.
- [ ] `npm run typecheck`, `npm test`, `agent-broker-itest.cjs` green.
- [ ] `module_extension.md` and `CHANGELOG.md` updated; the cost-of-a-use decision written in the module doc.
- [ ] `coai` plan → `proceed`, code round run, findings resolved.
- [ ] Promoted to `research/` with deviations recorded.


## What shipped differently

**The lane is keyed by the ENTITY, not by the token, and that was not an implementation detail.**
The plan said "a lane per one-use entity" and the first implementation keyed ordinary entries by
`entityId#secret` so they would not queue — which looked right and was not: every call from one
agent reuses one token, so that key is the same key, and two parallel queries against an ordinary
entry serialised. The test that caught it is the one that asserts OVERLAP rather than call count;
the first version of that test counted `ran` and passed against the broken code, because a queue
that runs both in turn leaves exactly the same two entries. Ordinary entries now skip the lane
entirely rather than getting a private key in it.

**The second caller is refused BEFORE the action runs**, which the plan left to the action's own
"no longer exists" lookup. A reviewer pointed out that reaching that lookup is still an invocation,
and a handler that does anything ahead of it would do it twice.

**The queue advances on a rejection as well as a success** — `.then(next, next)`, not `.then(next)`.
Also a reviewer's: one call's failure would otherwise fail every call behind it with somebody
else's error.

**`GrantRegistry.touch` is gone rather than kept.** `reserve` replaced its only production caller,
and a second way to spend a use is the thing that would drift back into a check-then-act gap. The
TTL tests were moved onto `reserve`, which is also what the broker does.

**`extension.ts` did not get two more inline callbacks.** It would have crossed the size ratchet,
so `oneUseIn` went to `entityExpiry.ts` and `burnOneUseIn` to `burnOnUse.ts`, beside the predicates
they are made of — and the baseline came DOWN from 1068 to 1066 rather than up.

**The CLI integration suite caught a positional-argument mistake that no type could.** `isOneUse`
was inserted into the middle of `CredsAgentServer`'s constructor parameter list, and
`creds-cli-itest.cjs` constructs the server positionally — so `listAliases` silently landed in the
`isOneUse` slot and `creds ls` went blank. Fixed there, and worth naming: that constructor has
thirteen parameters.

## Open tail

- **`CredsAgentServer` takes thirteen positional constructor parameters**, and this change showed
  what that costs: inserting one in the middle hands the next one to the wrong slot, in a caller a
  compiler cannot check because it is `.cjs`. An options object would make the next insertion free.
  Not done here — it touches every construction site and belongs in its own change.
- **The lane's `spent` set is never pruned.** It is bounded by the number of one-use entries a
  window actually uses, and it must outlive the entries themselves — it is the memory that refuses
  the second call — so it lives exactly as long as the window a grant can live in.
- **A grant lives in one window's memory, by design.** Several reviewers asked for a durable or
  cross-process claim; that would be a different product. The window closing is the revocation
  story, and a claim that outlived it would outlive the revocation.
