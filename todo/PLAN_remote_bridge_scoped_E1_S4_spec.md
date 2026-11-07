# PLAN — E1.4 spec: per-server consent, the modal line, the audit line

> Status: **plan only, nothing implemented yet, 2026-11-04 — security spec by Fable (authorisation: what silences a prompt), written before its code.**
> Story E1.4 of [PLAN_remote_bridge_scoped_E1.md](PLAN_remote_bridge_scoped_E1.md) (parent [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) §4.2
> *"Never ask" and "every 12 hours"*, *Modal and journal*). Shorter on purpose: the E1 document settles the `stampKey` tag, the four
> sentences, `bridgeAuditName`, and scenarios C1–C15; this file carries what E1 left open, the exact interplay with E1.3's
> `BridgeGrant`, and what it overturns. Depends on E1.3 ([PLAN_remote_bridge_scoped_E1_S3_spec.md](PLAN_remote_bridge_scoped_E1_S3_spec.md)).
>
> Scope: `src_vs_code/src` — `mcpConsentPolicy.ts`, `mcpEntries.ts`, `mcpHooks.ts`, `brokerHooks.ts`, `brokerConsentMemory.ts`,
> `bridgeScope.ts` (the quiet switch), new `bridgeConsentText.ts`, `brokerConsent.ts`, `grantRegistry.ts`, `bridgeContext.ts`,
> `credsAgentServer.ts` (+1). No `extension.ts` line (`:541` stays), no UI. Nothing here touches E1.1's files
> (`agentUseActions.ts`, `envApplyNotice.ts`, `envCollectionRef.ts`, `useActions.ts:90`, `brokerProtocol.ts:95`).

Every path is relative to `src_vs_code/src/`; every `file:line` was opened on commit `fe86db8`.

## S4.0 — Facts this spec rests on

| # | Fact (verified) | Consequence |
|---|---|---|
| H1 | E1.3's `BridgeGrant` is `{ readonly context: BridgeContext; readonly quiet: boolean }` (its spec §S3.2.1), nested, not intersected; `view.grantFor()` snapshots `quiet` from a fresh `Scope`; `view.resolveUse` forces `preConsented: false, rungs: ''` on every bridged lookup. | Every E1.4 read is `grant.bridge?.context.<field>` and `grant.bridge?.quiet`; the forcing becomes the switch. |
| H2 | `answeredHere(via, asked, rungs)` requires `via === 'mcp'`, `asked`, and a non-empty `rungs` (`brokerConsentMemory.ts:37-39`); `recordConsent` runs only after an `allowed` consent (`credsAgentServer.ts:525-531`). | With quiet off, `rungs: ''` writes no stamp; a Deny or a timeout writes none on any setting. |
| H3 | `stampKey(accountId, entityId)` is `` `${accountId.length}:${accountId}:${entityId}` `` (`mcpConsentPolicy.ts:84-86`), so every local key starts with a digit; `ConsentStamps.get/remember/forgetAll` treat the key as opaque (`:178-207`); `MAX_STAMPS` bounds the one map (`:40`). | A key starting with `s` can never equal a local key; server stamps live in the same bounded map and are cleared by Forget. |
| H4 | `preConsentedFor(found, stamps, now)` and `rememberMcpConsent(…, expected, now)` are the only production callers of `stampKey` (`mcpEntries.ts:439,529`); `mcpUseLookup` (`mcpHooks.ts:145-176`) and `mcpUseHooks` (`:191-202`) call them. E1.3 gives `mcpUseLookup` a sixth parameter `server?: { accountId; serverEntityId }`. | The server id reaches both halves through parameters that already exist on the path. |
| H5 | `ConsentGate.wording` (`brokerConsent.ts:142-157`) builds the modal from `grant`, `verb`, `summary`, `caller`; the tail at `:153-154` says `Allowing covers every later call on this token…`; `brokerConsentText.test.ts:64` and `credsAgentServer.test.ts:95` match that tail off a bridge. | The bridged text is a branch on `grant.bridge`; the unbridged text is byte-identical. |
| H6 | `formatAuditLine` writes `(${entry.grant})` and `LINE` reads it as `\(([^)]*)\)` (`agentAuditLog.ts:79-83,135-136`); `GrantRegistry.describe` is the one producer of that field for a grant (`grantRegistry.ts:316-318`); the `too_many_requests` line writes `grant: '—'` (`credsAgentServer.ts:236`). | `bridge=<name>` rides inside the parentheses with no `)` in the name; the one grant-less line takes the mark from `admitAliasCall`. |
| H7 | `cleanCallerField` (`brokerCaller.ts:114-120`) is pure: one line, no control characters, 80 code points. | The server name in the modal goes through it. |
| H8 | The alias route and the token route never read a consent policy (`agentDoors.ts:85-88`; `credsAgentServer.ts:344,468`); on a bridge the token path mints per call (E1.3 §S3.2.10). | `quiet` can only ever speak through `view.resolveUse`, the MCP door's lookup. |

## S4.1 — The E1 document's choices, judged

1. **The leading `s` on a server key — upheld**; H3 is the proof. Added: `stampKey` throws on an empty third argument, so a context
   with no server id (impossible after E1.2's `freezeBridgeContext`, S2 §S2.2) cannot make a server key that is nearly a local one.
2. **`rungs: ''` as what stops a stamp with quiet off — upheld**, because it is the one road `recordConsent` takes (H2) and is pinned by
   C4 asserting the store has no new key. Not a second guard: a second guard would be a second place to drift.
3. **Quiet speaks only for the MCP door — upheld** (H8); C9 pins it.
4. **The coverage line replaces the token sentence on a bridged grant — upheld.** On a per-call grant the token sentence is false.
5. **`bridge=<name>` through `describe` — upheld**; H6 is why no formatter or reader changes. `bridgeAuditName` also replaces `→`,
   which the grant group would tolerate but the formatter's own rule forbids in a field.
6. **`grant.bridge?.serverEntityId` (E1 §E1.4 items 4, 8) — overturned by E1.3's shape:** `grant.bridge?.context.serverEntityId`,
   `grant.bridge?.context.serverName`, `grant.bridge?.quiet`.
7. **A stamp written while quiet was on, then quiet turned off and on again inside its window — a gap E1 did not name.** With quiet
   off the view forces `preConsented: false`, so the stamp is inert; turned on again within twelve hours it speaks again. Upheld as
   behaviour: the answer was given through this very server with quiet on, and C7's promise ("an answer given while it was off cannot
   reach forward") is a different promise. Pinned by C16 so it is a decision, not an accident.
8. **E1 lists `mcpEntries.ts` as untouched until E1.4** — this story touches `preConsentedFor` and `rememberMcpConsent` only (H4).

## S4.2 — Types and signatures, and the interplay with `BridgeGrant`

```ts
// mcpConsentPolicy.ts:84-86
export function stampKey(accountId: string, entityId: string, serverEntityId?: string): string;
//   undefined → `${accountId.length}:${accountId}:${entityId}` (today's string, byte for byte)
//   ''        → throws Error('A server stamp needs a server entity id.')
//   s         → `s${accountId.length}:${accountId}:${entityId.length}:${entityId}:${serverEntityId}`

// mcpEntries.ts:435, :517
export function preConsentedFor(found: UsableEntry, stamps: ConsentStamps | undefined, now: number, serverEntityId?: string): boolean;
export function rememberMcpConsent(source, stamps, accountId, entityId, expected, now, serverEntityId?: string): Promise<void>;

// mcpHooks.ts:145-176 — the sixth parameter is E1.3's; this story hands `server?.serverEntityId` to preConsentedFor (:174)
// mcpHooks.ts:191-202 — rememberMcpConsent: (accountId, entityId, rungs, serverEntityId) => rememberMcpConsent(storage, stamps, accountId, entityId, rungs, now(), serverEntityId)

// brokerHooks.ts:138
readonly rememberMcpConsent?: (accountId: string, entityId: string, rungs: string, serverEntityId?: string) => Promise<void>;

// brokerConsentMemory.ts:42-55
export interface ConsentRecord { remember?: (accountId, entityId, rungs, serverEntityId?: string) => Promise<void>; /* … */ serverEntityId?: string; }
//   attempt (:101): record.remember?.(record.accountId, record.entityId, rungs, record.serverEntityId)

// credsAgentServer.ts:635-646 remember(): one added field
//   serverEntityId: grant.bridge?.context.serverEntityId,

// bridgeScope.ts, view.resolveUse on a bridge (E1.3 §S3.2.5) — the forcing becomes the switch:
//   scope().quiet === false → { ...found, preConsented: false, rungs: '' }
//   scope().quiet === true  → found   (preConsented was computed by the real lookup under the SERVER key, rungs real)

// bridgeContext.ts
/** Whitespace runs, `(`, `)` and `→` become `_`; at most 40 code points; an empty result is `_`. */
export function bridgeAuditName(serverName: string): string;
/** `'—'` off a bridge; `'— bridge=<bridgeAuditName>'` on one. The grant field of the one line written without a grant. */
export function auditGrantMark(serverName: string | undefined): string;

// grantRegistry.ts:316-318
static describe(grant: Grant): string;
//   grant.bridge === undefined ? describeSecret(grant.secret) : `${describeSecret(grant.secret)} bridge=${bridgeAuditName(grant.bridge.context.serverName)}`

// bridgeConsentText.ts (pure)
export type RunSite = 'laptop' | 'server';
/** E1: `exec` and `query` both start on this computer. E3.1 replaces this with `decideRunSite`. */
export function bridgeRunSite(): RunSite;                 // 'laptop'
export function bridgeModalLine(bridge: BridgeContext, site: RunSite): string;   // E1 §E1.4 item 6's two sentences; <serverName> through cleanCallerField
export function bridgeCoverageLine(bridge: BridgeGrant): string;                 // quiet off / quiet on, E1 §E1.4 item 6, verbatim

// brokerConsent.ts:142-157 wording(question)
//   after `${localRequestTimeLine(new Date())}`: grant.bridge === undefined ? '' : `\n${bridgeModalLine(grant.bridge.context, bridgeRunSite())}`
//   the tail `Allowing covers every later call … ${describeLimits(grantLimits())}. ` becomes
//     grant.bridge === undefined ? <today's tail, byte for byte> : `${bridgeCoverageLine(grant.bridge)} `
//   `Each call is logged in the "CredsForDevs: Agent Access" output panel.` stays on both.
//   A helper `coverageTail(grant, everything)` keeps `wording` under the function ceiling and at complexity ≤ 4.

// credsAgentServer.ts:224 admitAliasCall(res, prompts, bridgeName?: string)
//   :236  grant: auditGrantMark(bridgeName)
//   :279  admit: (res, prompts) => this.admitAliasCall(res, prompts, view.bridge?.serverName)
//   :338  this.admitAliasCall(res, true, view.bridge?.serverName)
```

**What `quiet` may and may not do, stated once.** `quiet` is read from a fresh `Scope` at the lookup (`view.resolveUse`) and snapshotted
onto the grant at mint (`view.grantFor()`) for the modal's coverage line. Nothing in a request body, header or query can set it. It is
consulted on `POST /v1/mcp/use/*` only; `/v1/alias/*` and `/v1/use/*` (token) mint per call and ask every time. With quiet off no
stamp is written and none is read. With quiet on the entry's own policy decides, against a stamp under the server key only: a local
stamp never silences the bridge, a bridge stamp never silences local use or another server. A Deny or a timeout writes nothing.
`forgetAll` clears local and server stamps together.

## S4.3 — Sentences (exact)

The four modal sentences and the key note are the E1 document's (§E1.4 item 6), verbatim; `<serverName>` is `cleanCallerField(context.serverName)`.
The audit mark is ` bridge=<bridgeAuditName(serverName)>` appended inside the grant's parentheses; the grant-less line's field is
`— bridge=<name>`. No new error sentence: this story refuses nothing new.

## S4.4 — Every file, and what changes

| File | Change | Against `fe86db8` |
|---|---|---|
| `mcpConsentPolicy.ts` | `stampKey` third parameter and the throw | `:84-86` |
| `mcpEntries.ts` | `preConsentedFor` and `rememberMcpConsent` pass the fourth/seventh argument to `stampKey` | `:435-441`, `:517-530` |
| `mcpHooks.ts` | `mcpUseLookup` hands `server?.serverEntityId` to `preConsentedFor`; `mcpUseHooks.rememberMcpConsent` takes and passes it | `:174`, `:199-200` |
| `brokerHooks.ts` | `rememberMcpConsent` fourth parameter | `:138` |
| `brokerConsentMemory.ts` | `ConsentRecord.serverEntityId?`, passed in `attempt` | `:42-55`, `:101` |
| `bridgeScope.ts` (E1.3's) | `view.resolveUse`: the forcing becomes `quiet ? found : forced` | — |
| `bridgeContext.ts` | `bridgeAuditName`, `auditGrantMark` | — |
| `grantRegistry.ts` | `describe` appends the mark | `:316-318` |
| `bridgeConsentText.ts` (new, pure) | `RunSite`, `bridgeRunSite`, `bridgeModalLine`, `bridgeCoverageLine` | — |
| `brokerConsent.ts` | `wording`: the modal line and the coverage tail on a bridged grant | `:142-157` |
| `credsAgentServer.ts` | `remember`: `serverEntityId: grant.bridge?.context.serverEntityId,` (+1); `admitAliasCall` third parameter and `:236`; `:279`, `:338` pass `view.bridge?.serverName` | `:224-240`, `:279`, `:338`, `:635-646` |

**Untouched:** `consentDue`, `covers`, `windowEnd`, `remembersConsent`, `readStamps`, `prune`, `ConsentStamps` (`mcpConsentPolicy.ts`);
`SharedPrompts`; `formatAuditLine`, `parseAuditLine`, `LINE`, `AuditDoor`; `commands/agentCommands.ts:495-509`; `callerLine`,
`CALLER_DISCLAIMER`; `extension.ts`; `brokerMcpDoor.ts`. `credsAgentServer.ts` ends at 794 at most (E1.3's spec §S3.6).

## S4.5 — Scenarios

C1–C15 of the E1 document, as written, with every `grant.bridge?.serverEntityId` read as `grant.bridge?.context.serverEntityId`
(`test/bridgeConsent.test.ts`, `test/mcpConsentPolicy.test.ts`, `test/brokerConsentText.test.ts`, `test/agentAuditLog.test.ts`). Added:

| # | Scenario | Expected | RED first, because |
|---|---|---|---|
| C16 | A stamp given with quiet on survives quiet off, inert | Quiet on, `every12h`, Allow through A (stamp written). Quiet off: the next call asks and writes nothing. Quiet on again inside the window: no dialog. Past the window: asks | pins S4.1 item 7 as a decision |
| C17 | Deny and timeout write nothing | Quiet on, `every12h`: Deny through A → 403 `GRANT_NOT_ALLOWED`, the store has no new key; a timed-out dialog (`CONSENT_TIMEOUT_MS` forced short) → 504, no key | at step A of E1.3's order a Deny on an `allowed` policy path is unreachable; here the RED is a `remember` that runs before the consent check |
| C18 | An empty server id cannot make a key | `stampKey('a', 'e', '')` throws; `stampKey('a', 'e')` and `stampKey('a', 'e', undefined)` are today's string | pure, new |
| C19 | `quiet` is not the request's to set | A body `{ entry, quiet: true }`, a header `X-Creds-Quiet: 1`, a query `?quiet=1` on a bridge with quiet off and an entry at `never`: a dialog every time | written before the switch exists |
| C20 | The grant-less line | Six calls at once through the bridge: the `too_many_requests` line's grant field is `— bridge=<name>`; the same six off a bridge: `—` | at RED the line reads `—` through the bridge |

Commands: E1's common block with `<name>` = `bridgeConsent`, `mcpConsentPolicy`, `mcpHooks`, `forgetAgentConsents`, `brokerConsentText`,
`brokerConsentMemory`, `agentAuditLog`, `mcpLogRows`, `grantRegistry`; then E1's pre-PR block.

## S4.6 — Break-its on silenced prompts (mutate, watch the named case fail, restore; both outputs in the PR)

| # | Attack | Mutation | Red case | Symptom |
|---|---|---|---|---|
| Q1 | A bridge answer silences local use | `remember` omits `serverEntityId`, so the stamp lands under the local key | C6 | the local MCP door goes quiet after an Allow through A |
| Q2 | A local answer silences the bridge | `preConsentedFor` ignores its fourth argument | C6 (reverse) | no dialog through A after a local Allow |
| Q3 | Quiet off still reads the stamp | `view.resolveUse` returns `found` whatever `quiet` says | C4, C19 | no dialog with quiet off and a fresh stamp |
| Q4 | A crafted id | `stampKey` drops the leading `s` | C3 | a local entry with id `1:e:s` collides with a server key |
| Q5 | Quiet speaks on another door | `bridgedTokenCall` or `handleAlias` calls `door.preConsent` when the scope is quiet | C9 | `/v1/alias/exec` silent with quiet on |
| Q6 | A claimed server | `bridgeModalLine` reads `body.serverName` or `caller`; or the audit mark reads the body | C10, C15 | the dialog or the line names `evil` |
| Q7 | A name that breaks the reader | `bridgeAuditName` keeps `)` | C14 | `parseAuditLine` returns `undefined` or a wrong `grant` |
| Q8 | The token sentence on a bridge | `wording` keeps the tail on a bridged grant | C11 | `Allowing covers every later call` in a bridged dialog |
| Q9 | A mark off a bridge | `describe` appends `bridge=` when `grant.bridge` is undefined | C13 (no line off a bridge has it), existing `agentAuditLog` tests | every local line carries `bridge=undefined` |
| Q10 | A stamp without a dialog | `view.resolveUse` with quiet on forces `preConsented: true` | C4, C5 (`always` asks every time) | no dialog on `always` |
| Q11 | Forget leaves server stamps | `forgetAll` filters keys starting with a digit | C8 | A stays quiet after Forget |
| Q12 | An empty server key | `stampKey('a','e','')` returns a key | C18 | a server key that no server owns |

## S4.7 — Opus review checklist for the code

- `stampKey`'s two-argument answer is byte-identical to today (C1); the server form starts with `s`, length-prefixes account and entity,
  and throws on `''`; no other `mcpConsentPolicy.ts` function changed.
- The server id reaches `preConsentedFor` from the lookup's `server` argument and `rememberMcpConsent` from `grant.bridge?.context.serverEntityId`,
  and nowhere from a request.
- `view.resolveUse` on a bridge: quiet off → `preConsented: false, rungs: ''`; quiet on → the real answer; `quiet` read from a fresh `Scope`.
- `wording` off a bridge is byte-identical (C11, `brokerConsentText.test.ts` and `credsAgentServer.test.ts:95` green with no edit); on a
  bridge the modal line follows the request-time line and the coverage line replaces the token tail; `serverName` through `cleanCallerField`.
- `describe` appends the mark only when `grant.bridge` is set; `bridgeAuditName` has no whitespace, `(`, `)` or `→`, ≤ 40 code points;
  `LINE`, `formatAuditLine`, `parseAuditLine` unchanged; C14 round-trips.
- `admitAliasCall`'s third argument is the context's `serverName` from the view at both call sites; the grant-less line is `auditGrantMark`.
- `bridgeConsentText.ts` and `bridgeContext.ts` import no `vscode`; `brokerConsent.ts` imports `bridgeConsentText.ts`, not the reverse.
- `credsAgentServer.ts` gains exactly one line; `extension.ts:541` unchanged; `npm run ratchet` green; no edit in E1.1's hunks.
- The quiet switch cannot be set by a body, header or query (C19); it is consulted on the MCP door alone (C9).

## S4.8 — Decisions closed

1. `BridgeGrant` is E1.3's `{ context, quiet }`; every E1.4 read is through it.
2. Server stamps share the local map and `MAX_STAMPS`; Forget clears both; a two-segment key on disk is read as today.
3. A stamp given with quiet on is inert while quiet is off and speaks again when quiet is turned on inside its window (C16).
4. A Deny or a timeout through a bridge writes no stamp and does not tombstone a token (E1.3 §S3.1 item 4).
5. `bridgeRunSite()` answers `'laptop'` in E1; E3.1 replaces the call with `decideRunSite` and keeps both sentences.

## S4.9 — Not verified by this spec

- The `(.*?) \(([^)]*)\)` pair's backtracking with an entity name containing parentheses and a grant field containing a space
  (`tok…f2 bridge=x`) is reasoned from the regex, not run; C14 is the check.
- `wording`'s line count after the branch is a hand estimate; `npm run lint` decides whether the helper is needed.

## S4.10 — Amendment, epoch 3 (Fable, 2026-11-05)

E1.4 is coded after E1.3's fix-forward (the S3 spec's §S3.13), on the tree that commit leaves. Three things above change;
nothing is deleted, and where this section differs from §S4.2, §S4.4, §S4.7 and C20, this section wins.

1. **The third parameter of `admitAliasCall` is the context, not a name.** The fix-forward makes it
   `admitAliasCall(res, prompts, bridge?: BridgeContext)` and keys the prompt windows by `bridge.bridgeId` (§S3.13 A.3.5). E1.4 reads
   the same parameter for the grant-less line: `:240` becomes `grant: auditGrantMark(bridge?.serverName)`. The call sites (`:284` in
   `doorFor`, `:344` in `handleAlias`) already pass `view.bridge` after the fix-forward, so E1.4 adds no line there. §S4.2's three
   `admitAliasCall` lines and §S4.4's row read accordingly; §S4.7's bullet becomes: *the grant-less line's mark comes from the context
   `admitAliasCall` was handed, the same one that keys its window*.
2. **Quiet and the per-door silent ceiling.** With quiet on, a call the entry's policy settles takes no modal and is admitted on the
   bridge's own silent window (sixty a minute per bridge), not the laptop's; the `allowed without a prompt` line (C5) is written
   as built. A quiet bridge's sixty-first silent call inside a minute answers the bridge's silent sentence of §S3.13 A.3.5. Added
   scenario **C21**: quiet on, `never`, sixty-one calls through A inside a minute: the last is `too_many_requests` with that sentence; a
   silent call through B at the same moment is served; a local quiet MCP call is served.
3. **C20 revised.** Six calls at once through bridge A: the second to sixth are `busy` while the first's dialog is open, and the
   `too_many_requests` lines' grant field reads `— bridge=<A's name>`; six through B at the same moment behave the same with B's name;
   six off a bridge read `—`. Five dialogs answered on A then a sixth: `too_many_requests` with the bridge sentence and `— bridge=<A>`.

Budget: the fix-forward leaves `credsAgentServer.ts` at 787; E1.4 adds one line (`remember`'s `serverEntityId`) → 788. `extension.ts`
stays at 1003. Nothing else in §S4.2–§S4.8 moves. Break-it added: **Q13** — `auditGrantMark` reads the body's `serverName` or the caller
label instead of the context (C15, C20).

4. **(Added 2026-11-05, after `c58842e`'s review; the S3 spec's §S3.13 Amendment 2 item B.7.) A stamp is written before the gate.**
   `perform` (`credsAgentServer.ts:538-539`) runs `await this.remember(…)` and then `prepared`, whose `stopped` asks the launch gate
   (`:570-573`). With quiet on and real `rungs`, an Allow given while the scope was being narrowed would persist a stamp for an entry the
   gate then refuses — inert today only because a bridged lookup forces `rungs: ''`. E1.4 moves the write behind the gate:
   `perform` passes `() => this.remember(who.via, grant, asked, rungs)` as a third argument of `prepared` (the `await this.remember` line
   becomes that argument: −1 +0), and `prepared` runs `await remember();` immediately after `stopped` answers false and before
   `releaseWaiting` (+1). Off a bridge the gate answers `undefined` and the order of effects a person sees is unchanged: the stamp is still
   written before the rotation release and the mask read. **C22**: quiet on, `every12h`, `holdDialogs`; narrow to `[]`; Allow: the call
   answers the route's OUT sentence, `w.consents` is empty and the store has no new key; the same without the narrow writes one stamp.
   RED once quiet is on (today the forced `rungs: ''` hides it; the test is written against the E1.4 switch). Break-it **Q14**: `remember`
   left before `stopped` → C22. Budget: with Amendment 2's +2, E1.4's two lines bring `credsAgentServer.ts` to 791.

5. **(Added 2026-11-05, after `5bfedf8`'s review; the S3 spec's Amendment 3.) What Amendment 3 changes for E1.4: little, and nothing in
   §S4.2.** E1.4 is coded on the tree Amendment 3 leaves. (a) `credsAgentServer.ts` is still 789 after Amendment 3 (its edits move lines
   and change three in place), so E1.4's two lines still bring it to 791. (b) The consent question carries `followUp` (Amendment 3, C.3);
   a quiet call is pre-allowed and raises no dialog, so the quiet path neither sets nor reads it — the invariant E1.4 relies on (admit first,
   no `await` before the dialog, a silent admission raises nothing) is unchanged. (c) C21's sixty-one quiet calls cannot reach the registry's
   cap (256 mints); the quiet loop that evicted a live dialog's grant is Amendment 3's Q1, on the local MCP door, and C21 need not repeat it —
   but C21 may add one cheap assertion: a dialog held open on bridge B before the loop still decides its call afterwards. (d) The
   `bridgedTokenCall` admission moved inside its `try` (C.5); `admitAliasCall(res, prompts, bridge)` and its call sites are untouched, so item 1
   above stands as written.

## S4.11 — Note, epoch 4 (Fable, 2026-11-05)

The parent stopped a second time (change 3.2) and was revised whole. E1.4's code as it stood is saved on `wip/remote-bridge-e14-before-stop`
(`c4b7add`), unfinished: its *As built* is unwritten and the ratchet, the itests, the .NET build and `plan-lifecycle` did not run on that tree. The
sort of the done work marks it; if it fits, it is finished on the tree the partial-E1 merge leaves (the E1 document's epoch 4 amendment, item 3) and
goes as its own PR. Nothing in §S4.0-§S4.10 changes. Three things are **not** E1.4's and must not be coded here: Amendment 4's `KEPT_PLACE_MS`
(superseded, never built), the button order of a bridged modal (`Deny`, `Allow`; parent §4.10, Q5) and the 504 sentence of an expired call — all
E1.5's. C17's "a timed-out dialog → 504, no key" stands as written: the stamp is still not written on a timeout; what E1.5 changes is that the timeout
no longer frees the place, which C17 does not assert.

## S4.12 — As built (Sonnet, 2026-11-07)

E1.4 finished on the partial-E1 tree (`a7af39d`, the head of PR #307). The saved work `c4b7add` (`wip/remote-bridge-e14-before-stop`) was merged in as its own
commit; its As built draft (§S4.11 of the saved branch: differences 1-8) still describes what it built and is not repeated. This section records what was
done after the merge. It states what was built; it makes no decision the plan or this spec had not made, except the three gaps named under *Gaps filled*,
which a reader should look at first.

**Merge.** Conflicts in `bridgeWallWorld.ts` (the saved `flavourOf` now carries the closing commit's `emptyVault` and `fullVault`; `nodesOf`'s folder policy moved to
`agentsFolderPolicy` to stay at complexity 4), `grantRegistry.test.ts` (both tests kept) and `research/module_extension.md` (both paragraphs kept). The tree's
later work won wherever it contradicted the saved work.

**Built after the merge.**

1. **The modal line is true per action** (the E1 document's epoch 4 amendment, item 9; parent §4.2's *Modal and journal*). `bridgeRunSite(action)` answers
   `destination` for `exec`, `laptop` for `query`, `undefined` for any other word; `bridgeModalLine(bridge, site, entryName)` says, for `exec`,
   *The connection starts on this computer; the command runs on "<entry>", and its output goes back to that server.*, for `query` *It runs on this computer, and
   only its output goes to that server.*, for E3's `server` *It runs on that server.* `wording` hands it the question's own `action` (set by the route, never read from a body)
   and the grant's entry name; both names pass `cleanCallerField`.
2. **`auditGrantMark` on `unanswered`'s line.** `unanswered(res, error, route, bridge, respondError, log)` takes the context `handle` was handed (the one the door set) and writes
   `grant: auditGrantMark(bridge)` beside §4.1's classification, which does not move. The call site passes `bridge` in place (0 lines).
3. **The gate is asked again after `await remember()`** (`stamped`, `credsAgentServer.ts`): gate, stamp, gate; both checks read `after consent`, the stage `main`'s one check
   read after its own write, so a local client leaving during the write is written as it always was. A client that leaves, a scope narrowed or a token gone while the write is
   pending promotes no waiting rotation and runs nothing (C23, C24).
4. **C11's split of the token sentence** was already in the saved work (`coverageTail`). It now has a test that spells the local dialog out as a literal and the bridged one as
   its two differences (the bridge line, the coverage line), so the two texts are told apart by an exact comparison, not by a substring.
5. `remember`'s record moved to `brokerConsentMemory.consentRecordOf` (the file's own docblock: *everything here is about the RECORD of a consent*). The server key is
   read from the grant's context only, and absent, not `undefined`, off a bridge.
6. `research/module_extension.md`: the modal sentence rewritten per action, the gate re-check, and `unanswered`'s mark.

**Tests, RED first, then GREEN, then broken on purpose.** New or changed: `bridgeConsentText.test.ts` (C10 per action, C12, the entry-name sanitiser, the no-site case),
`bridgeConsent.test.ts` (C10 through the MCP, alias and token doors for `exec` and `query`; C11 exact; C23; C24), `brokerUnanswered.test.ts` (the mark; every call updated to the new
signature), `bridgeKeptPlace.test.ts` (the journal line through a bridge and through the main port), `brokerConsentMemory.test.ts` (`consentRecordOf`). RED seen before each change:
C10 (the saved sentence on an `exec` dialog), C23 (`no waiting rotation was promoted for an entry the gate now refuses`), the bridged `unanswered` line (`and the line says which bridge it came in by`);
`brokerUnanswered.test.ts` went red for every test at once, because its calls take a new argument. C24 was written against the final code and watched RED by the mutation N4 below.
The mutation run: every saved mutation of Q1-Q15 and G1-G24 (G23 removed with `bridgeRunSite()`'s old constant; Q1, G5, G7, G8, G10, Q6 and Q8 re-aimed at the moved code) and ten new ones, 51 in
all, each caught by the case named, the file restored and its hash compared:

| # | Mutation | First red case |
|---|---|---|
| N1 | `exec` is said to run on this computer (the saved sentence) | C10 |
| N2 | `query` is said to start a connection and run on the entry | C10 (every door) |
| N3 | `unanswered` writes a plain dash | C.7 (`bridgeKeptPlace`), Q13 |
| N4 | no second gate check after the stamp | C23, C24 |
| N5 | the modal line reads `'exec'` for every call | C10 (every door) |
| N6 | the entry's name in the exec line is not sanitised | C10 (entry name) |
| N7 | an action with no site is guessed to run on this computer | C10 (no site) |
| N8 | a bridged dialog keeps the local token sentence | C9, C11 |
| N9 | the local token sentence is edited by one word | C11 (exact local text) |
| N10 | a local answer carries a server key | C4 |
| Q1-Q15, G1-G22, G24 | as in the saved list | the case that list names (Q11, the Forget case, is now caught by `forgetAgentConsents.test.ts`) |

**Gaps filled (not in the plan or the spec; for a reader to confirm).** (a) An action that has no site (nothing but `exec` and `query` reaches a bridge's dialog) names the bridge and claims
no place, rather than guessing or throwing: a throw inside `wording` would leave the place taken. (b) The exec sentence names the entry (`grant.entityName`), which is what the E1 document's
item 9 writes as `"<entry>"`. (c) The server-key record is built by a function in `brokerConsentMemory.ts` so that `credsAgentServer.ts` ends below the ceiling.

**Not edited, by the stop rule.** The S4 spec's C10, C12 and §S4.10 item 5, and the E1 document's §E1.4 item 6, still quote the saved `laptop` sentence; item 9 of the epoch 4 amendment says
they change in E1.4's finishing commit. They are left as written, and this section is the record of the sentences as built.

**What this changes for a local user, from the diff (parent §9).** Nothing observable off a bridge: the local dialog is byte for byte what it was (C11 spells it out), a local stamp has the key
it always had, the local journal lines are the ones they were (`—` in the grant field of `unanswered`'s line), and the second gate check restores `main`'s own order of effects around the write.
Every other change is behind a bridge door that no production code opens before E2 (R1, R4). So E1.4 owes no `CHANGELOG.md` bullet.

**Counts.** `credsAgentServer.ts` 786 lines (the saved work was 790; the plan's ceiling is 800, the brief's 789); `extension.ts` 1003, unchanged; no file over 800.
