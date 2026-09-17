# PLAN — a per-call grant lives exactly as long as its call, and #95 ships

> Status: **plan only, 2026-09-17.** Scope: `grantRegistry.ts`, the two doors that mint per call
> (`brokerMcpDoor.ts`, `credsAgentServer.ts`), one test seam, and the release of issue #95.
>
> Issue: [#95](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/95), pull request
> [#106](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/pull/106).
> Related docs: [module_extension.md](../research/module_extension.md),
> [module_tests.md](../research/module_tests.md),
> [PLAN_agent_consent_policy.md](../research/PLAN_agent_consent_policy.md) (the feature this closes
> the tail of), [PLAN_agent_consent_policy_stories.md](../research/PLAN_agent_consent_policy_stories.md).
>
> **Gate record.** This plan IS the gate's plan round on branch `review/consent-s4-3-followups`
> (session `454051e9`): verdict `good_enough`, 12 findings, all 3 reviewers answered, 7 accepted and
> 5 rejected with reasons. Every accepted finding below names the reviewer that raised it.

## The symptom

`GrantRegistry`'s 256-entry cap (`grantRegistry.ts:124`) was written when grants accumulated **one
per share**. Its own docblock says so: *"Far above any real session's share count, so in practice
only the denied-grant sweep below ever fires; the cap is the backstop."*

Issue #95 broke that premise without anybody noticing. The MCP door mints **one grant per call**
(`brokerMcpDoor.ts:154`) and a pre-consented call marks it `allowed` immediately
(`brokerMcpDoor.ts:181`), at up to sixty calls a minute. So the map fills with **allowed** grants in
about four minutes of unattended agent work, `oldestEvictable` runs out of pending victims, and the
oldest allowed grant is a token an integration is still holding — because map order is insertion
order and *using* a token does not move it. A live capability revoked by a rate nobody was watching,
with no event anywhere.

Reported by CodeRabbit on PR #106 as a high merge risk, with no mechanism attached; verified here,
and the mechanism is the one above.

## What is already fixed on the branch — do not re-do it

Commit `515bae6`. `Grant.scope` (`grantRegistry.ts:48`, `GrantScope` at `:52`): a **token** is
handed out and looked up again; a **call** grant is one request's capability whose secret appears in
no response body. `oldestEvictable` (`grantRegistry.ts:284`) evicts in three tiers — oldest
non-allowed, then oldest allowed CALL, then oldest allowed token. The two per-call doors declare
themselves (`credsAgentServer.ts:275` and `:329`). Watched red before the fix: `+ undefined
- 'allowed'`.

**That fix is necessary and not sufficient**, which is what this plan is for.

## The two holes the gate found in it

| # | raised by | the hole |
|---|---|---|
| 5 | gemini | **Dead call grants linger.** Nothing retires a call grant when its call ends, so 200 completed calls hold 200 of the 256 slots indefinitely. The cap's headroom for real shares is consumed by garbage, and the map only ever shrinks by crossing the cap. |
| 8 | codex | **An in-flight call grant can be evicted.** The tier order prefers call grants, so with more than 256 calls in flight the oldest one loses its grant mid-`await` and an already-started request fails as unauthorized. |

Both have the same answer, and it is better than the tiering alone: **a call grant should exist
exactly while its call is in flight.**

## The goal

After this plan, the registry holds only things that are alive: pending grants awaiting consent,
call grants whose request has not returned, tokens, and the bounded denial tombstones. The cap
becomes the backstop its docblock always claimed it was, and reaching a call grant at all requires
256 genuinely concurrent calls.

---

## Build order

Each step is one commit. A RED test lives in the step that turns it GREEN.

### 1. `retire()` on the registry, and the doors that call it

- `grantRegistry.ts` — `retire(secret: string): void`, beside `allow` (`:212`) and `deny`. Its
  docblock must say why it is **not** `deny`: a denial is a tombstone that has to keep answering
  `403` so an agent does not ask for a fresh token and re-open a dialog the person refused
  (`module_extension.md`, *Refusals are remembered*). A retired per-call grant has no such duty —
  its secret was never handed out, so `401 unknown` is the only honest answer and the right one.
- `brokerMcpDoor.ts` — `retire(grant: Grantish): void` on `BrokerDoor` (`:24-95`), called in the
  same `finally` that already releases the slot on all three routes: use (`:159`), delete (`:229`),
  create (`:315`). All three mint per call via `minted(...)` (`:266`).
- `credsAgentServer.ts` — wire it (`:264-284`), and call it in `handleAlias`'s existing `finally`
  (`:343`), which mints per call at `:329`.

**RED first**: a registry test that a retired grant is gone and reads as unknown rather than denied;
and a broker test that a completed MCP use call leaves no grant behind — watched red against today's
code, where it does.

**Budget risk, stated rather than discovered:** `credsAgentServer.ts` is at **792 of its 800-line
ceiling**. One hook line fits. If it does not, the extraction to make is the `door` getter
(`:264-284`) into `brokerDoorWiring.ts` — a real seam, not a place to put spare lines — and that is
its own commit **before** this one.

### 2. `scope` becomes a required parameter (gate finding 1, local)

`mint` (`grantRegistry.ts:132`) currently defaults `scope` to `'token'`, so a new door that forgets
to declare itself silently gets the protected kind. Reorder to
`mint(accountId, entityId, entityName, kind, scope, now = Date.now())` and drop the default, so the
compiler asks every future door the question.

This is the repository's own idiom, not a new one: `consent()` and `perform()` take `caller` as a
REQUIRED parameter — *"`undefined` must be written, never omitted — so every door that reaches the
funnel says who is asking or does not compile"* (`module_extension.md`, the broker's *Consent*
paragraph). Three production call sites and the test helpers change.

### 3. Prove it through the LIVE door (gate finding 9, codex)

> *"A registry test can pass with manually assigned scope while the production door still omits or
> miswires that scope."*

Correct, and it is this repository's recurring shape of dead test — *a picker is not an
enforcement*. The test must drive the real door.

**The obstacle, measured:** the silent path has its own ceiling of sixty calls a minute
(`aliasThrottle.ts:224`), and `admitAliasCall` asks it with a hard-wired `Date.now()`
(`credsAgentServer.ts:218`). So more than sixty silent calls through the real HTTP door are refused,
and the test finding 9 asks for cannot be written today.

**The seam to add:** an optional `now?: () => number` on the server's options, defaulting to
`Date.now`, used at `:218`. It is the pattern the feature already uses elsewhere —
`mcpUseHooks(storage, state, now = Date.now)` — and a clock a test can move is the difference
between a guarantee that is checked and one that is asserted.

**Then the test**, in `brokerMcpRoutes.test.ts` over `brokerWorld.ts`: `share(w)` for a real token,
advance the clock a window at a time while making more than `MAX_GRANTS` silent calls through the
real door, then use the original token and assert it still answers `200`. Catalogued in
`module_tests.md`.

**Fallback if the seam is refused:** drive `mcpDoor`'s exported handler directly with a stub `admit`
that always admits, keeping the real `minted(...)` path — weaker, because it stubs the ceiling, and
it must say so in the catalogue rather than claim coverage it does not have.

### 4. The eviction tiers, documented as the policy they are (gate finding 4, local)

Number them in `oldestEvictable`'s docblock — 1. oldest non-allowed, 2. oldest allowed CALL,
3. oldest allowed token — and state the residual trade-off out loud: with step 1 in place, reaching
tier 2 needs 256 *concurrent in-flight* calls, and at that point losing one in-flight request is the
lesser evil against silently killing an integration's token. That is a decision, and a reader must
be able to see it was one.

### 5. Documentation

- `research/module_extension.md` — the grant-cap paragraph (already rewritten in `515bae6`) gains
  retirement, so the section describes the shipped lifecycle rather than an intermediate one.
- `research/module_tests.md` — rows for the retirement tests and the live-door test.

### 6. The gate, then the merge

`review_code` on `review/consent-s4-3-followups` (session `454051e9`, now at `CodeReview`) with
`baseRef` `297431e`, resolve every finding, then merge PR #106 by **rebase**.

### 7. The release

`[Unreleased]` in `src_vs_code/CHANGELOG.md` becomes a dated version. Tags are what release here
(`release.yml:13-20`): `extension-v*`, `mcp-v*`, `cli-v*`, `server-v*`.

- **Extension 1.8.1 → 1.9.0** — a feature, so a minor bump.
- **MCP relay 0.6.0 → 0.6.1** — `src_mcp/src/Program.cs`'s `instructions` changed, and that text is
  the first thing a model is told about this vault. Shipping the extension without it leaves every
  agent reading the old consent model.

**Push tags ONE AT A TIME and confirm each workflow run started.** More than three tags in a single
push creates no workflow events at all, silently.

---

## Test plan

| what | where | how it is watched fail |
|---|---|---|
| a retired grant is gone, and reads unknown rather than denied | `grantRegistry.test.ts` | red before `retire()` exists |
| a completed MCP use call leaves no grant behind | `brokerMcpRoutes.test.ts` | red against today's code, which leaves one per call |
| a completed alias call leaves no grant behind | `brokerMcpRoutes.test.ts` | same |
| a delete and a create retire theirs too | `brokerMcpRoutes.test.ts` | the two routes that are easy to forget |
| a shared token survives >256 silent calls **through the real door** | `brokerMcpRoutes.test.ts` | red with the door's `'call'` argument removed |
| `scope` cannot be omitted | the compiler | a call site without it does not build |
| the whole suite, both harnesses, both .NET suites | as always | — |

## Definition of Done

- [ ] Every step above committed, each with its red-first test and its documentation slice.
- [ ] `npm test`, `npm run itest:mcp`, `npm run itest:agent`, `dotnet build dew_flow_creds_for_devs.slnx`
      (0 warnings), both .NET test executables, `emit-mcp-tools.mjs --check`, `typecheck`, `lint`,
      `ratchet`, `plan-lifecycle.mjs`, `pin-check.mjs` — all green, with the observed numbers reported.
- [ ] `review_code` on `review/consent-s4-3-followups` resolved: every finding accepted or rejected
      with a reason.
- [ ] PR #106 merged by rebase, its CodeRabbit and SonarCloud comments read and answered.
- [ ] The release tags pushed one at a time, each run confirmed started and finished.
- [ ] This plan promoted to `research/` with `IMPLEMENTED <date>` and its deviations, and its row
      removed from [todo/README.md](README.md).

## Risks

1. **`credsAgentServer.ts` is at 792/800.** Step 1 fits; step 3's clock seam may not. The extraction
   named in step 1 is the answer, and it is a commit of its own rather than a squeeze.
2. **The clock seam is production code added for a test.** It is a seam the feature already uses, and
   the alternative is a guarantee nobody can check — but it is a judgement, and step 3 names the
   fallback if the owner would rather not have it.
3. **The release ships an agent-facing text change.** The relay's `instructions` are truncated by
   clients at about 2 KiB, so the consent paragraph's position in that string matters; it is third,
   well inside the budget, and should be confirmed against a real client after release.
