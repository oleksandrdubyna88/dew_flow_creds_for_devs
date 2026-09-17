# PLAN — the agent consent policy, broken into epics and stories

> Status: **IMPLEMENTED, 2026-09-17** — all thirteen stories built, each one commit on its own
> branch, each through the `coai` gate twice. Two of the "asks on every call" claims were retired
> early, in S4.1, because a README coverage guard forced that story into the same paragraphs —
> recorded there rather than quietly re-scoped. Scope: the BUILD ORDER for
> [PLAN_agent_consent_policy.md](PLAN_agent_consent_policy.md) (issue #95) — 4 epics, 13 stories, each
> one commit with its own red-first tests, its own documentation duty and its own `review_code` round.
> It decides nothing the parent did not decide; where the two disagree the parent's `§` is the
> authority, except in §Deviations below, which names the **twelve** places the parent's §8 cannot be
> built as written and what is built instead. Eleven were known when this file was written; the
> twelfth (`release(prompts)` → the returned `Slot`) came out of S2.2's code round, which is the kind
> of thing a deviations list is for.
>
> **Every round, as the gate recorded it.** Plan rounds ran with 3 reviewers and code rounds with 12
> — 11 answering plus the un-prompted Role2 the server names in its own reply. The plan stage's round
> budget is one, so `good_enough` IS its pass. Every finding of every round has a recorded accept or
> a reasoned rejection; nothing was accepted to be agreeable and nothing was left unanswered.
>
> | story | branch | plan round | code round |
> |---|---|---|---|
> | the parent plan | `feat/agent-consent-policy` | `good_enough` · 14 | — |
> | S1.1 | `feat/agent-consent-policy` | *(the parent's round above)* | `proceed` · 13 |
> | S1.2 | `feat/consent-s1-2` | `good_enough` · 8 | `proceed` · 9 |
> | S1.3 | `feat/consent-s1-3` | `good_enough` · 8 | `proceed` · 12 |
> | S2.1 | `feat/consent-s2-1` | `good_enough` · 7 | `proceed` · 15 |
> | S2.2 | `feat/consent-s2-2` | `good_enough` · 11 | `proceed` · 15 |
> | S2.3 | `feat/consent-s2-3` | `good_enough` · 12 | `proceed` · 10 |
> | S2.4 | `feat/consent-s2-4` | `good_enough` · 8 | `proceed` · 12 |
> | S3.1 | `feat/consent-s3-1` | `good_enough` · 11 | `proceed` · 13 |
> | S3.2 | `feat/consent-s3-2` | `good_enough` · 9 | `good_enough` · 14 |
> | S3.3 | `feat/consent-s3-3` | `good_enough` · 8 | `proceed` · 15 |
> | S4.1 | `feat/consent-s4-1` | `good_enough` · 8 | `good_enough` · 14 |
> | S4.2 | `feat/consent-s4-2` | `good_enough` · 12 | `good_enough` · 18 |
> | S4.3 | `feat/consent-s4-3` | `good_enough` · 10 | `proceed` · 16 |
>
> The number after each verdict is the round's gating findings: **126** across the thirteen plan
> rounds and **176** across the thirteen code rounds. S1.1 was built on the parent plan's own branch
> before the per-story branches began, which is why it shares that session — a `coai` session is per
> repo **and** branch, so every later story needed one of its own.
>
> S4.3's own row was written from its round rather than before it, which the round itself insisted
> on: four reviewers in three roles said a promoted plan claiming thirteen completed code rounds
> while its last row held a placeholder lets a maintainer read an unrecorded review as a finished
> one. They were right, and the same round found three defects worth naming here — a compatibility
> note that promised something the code does not do, a claims guard watching the READMEs while the
> agent-facing copy of the same claim had no guard at all, and a contract check that answered *the
> surface has changed* after a rebase that changed nothing.
>
> Shape: `src_vs_code` plus prose in `src_mcp/src/Program.cs`, `README.md` and the regenerated
> `contract/mcp-tools-v1.json`. The server, the C# relay's logic and the HTTP contract are untouched.
>
> Related docs: [module_extension.md](module_extension.md),
> [module_tests.md](module_tests.md), the precedent this file is shaped on —
> [PLAN_payment_instruments_epics.md](PLAN_payment_instruments_epics.md).

## The story contract (the operator's rule, restated as checks)

Every story, at its end: `npm run typecheck`, `npm run lint`, `npm run ratchet`, `npm test` green — a RED test
lives only in the story that turns it GREEN, and that story's summary quotes the failure message beside the
pass. A reviewer holding the story's diff and the parent plan can say whether it did what it was for. Each
story carries its tests and its slice of `research/module_extension.md` / `research/module_tests.md`. A seam
may be unused by a later story; it may not be wrong.

Ceilings verified 2026-09-16 (`eslint.config.mjs:28-30`: max-lines 800, max-lines-per-function 50,
complexity 4; `src/test/**` gets 120 per function): `credsAgentServer.ts` **743**, `entityFormPage.ts`
**768**, `entityFormScript.ts` **799** (one line of room — its `mcpSwitchScript(...)` call changes in place
and it gains no import), `mcpAccess.ts` 379, `mcpEntries.ts` 427, `brokerMcpDoor.ts` 339,
`mcpSwitches.ts` 153, `mcpSwitchScript.ts` 104, `agentCommands.ts` 688. `.size-baseline.json` pins
`extension.ts` at **1052** and `size-ratchet.mjs` only tightens — no story grows `extension.ts`.

## The four epics

| # | epic | what is true when it is done | stories | model |
|---|---|---|---|---|
| 1 | **The model** — the field, the per-axis walk, the decision and the stamp | `ask` rides the vault record and survives every reader; inheritance walks the ladder and the policy separately so a policy-only folder cannot close a branch; `consentDue` and `ConsentStamps` exist as vscode-free code with every clock, rungs, concurrency and eviction guarantee pinned. **Nothing at the door has changed.** | 3 | Opus · Fable · Fable |
| 2 | **The door** — the silent path, its ceiling, its audit line, the wiring | a pre-consented use call runs with no modal, spends no modal slot, writes `allowed without a prompt` via `mcp`, never postpones auto-lock, cannot slide its window, is bounded at 60/min; delete and create still ask in two independent places; the real `globalState` is behind it | 4 | Opus · Fable · Fable · Opus |
| 3 | **The controls** — the four-option group on both forms, the effective policy shown, the footer | a person sets, inherits or takes back the policy on an entry or a folder, sees the RESOLVED answer with its source named, and the doors footer names a never-ask entry; ten switches stay ten | 3 | Opus ×3 |
| 4 | **Revocation, the binary, the record** | the Forget command revokes and is watched revoking; the real `creds-mcp` binary runs six quiet calls and one forced prompt; no text says every call asks and the README test bans the sentence; docs and promotion done | 3 | Opus ×3 |

**Is 2–4 epics the right shape?** Yes — four, and thirteen stories. The heuristic was computed from the
plan's size and it held: three epics would merge the two Fable-heavy areas (the permission walk and the
consent gate) into one seven-story lane and blur the boundary a reviewer most needs to see; two would put
the record format and the UI in one lane. If the operator wants twelve, **S3.3 folds into S3.2** (both Opus,
both the form); if eleven, **S2.4 folds into S2.3**. Nothing else should be merged — S1.2, S1.3, S2.2 and S2.3
each carry a distinct way of being expensively wrong, and each deserves the whole of a code round.

## Order and what each hands the next

```
S1.1 → S1.2 → S1.3 → S2.1 → S2.2 → S2.3 → S2.4 → S3.1 → S3.2 → S3.3 → S4.1 → S4.2 → S4.3
```

| story | the next story needs from it |
|---|---|
| S1.1 | `ask?` on `McpAccess`, `askPolicy()`, a half-aware `readMcpAccess`, `climb` carrying `ask` |
| S1.2 | `answersLadder`/`answersPolicy`, `access.ask` filled with the EFFECTIVE value, `askSource`/`askFolder` on the resolved shape |
| S1.3 | `consentDue`, `ConsentStamps`, `stampKey`, `ladderKey`, `ConsentStampStore` (the Memento subset) |
| S2.1 | `preConsented` on `McpUseLookup.usable` and on `readMcpUse`'s result; `rememberMcpConsent` in `BrokerHooks` |
| S2.2 | `admit(res, prompts)` routing in `admitAliasCall`, which S2.3 branches on — the paired `release(prompts)` became the `Slot` that `admit` returns (Deviations 12) |
| S2.3 | **the ceiling must exist before any control can write a policy** — S3.1 may not land before it |
| S2.4 | `mcpUseHooks(...)` and the memoized `consentStampsFor(state)` that S4.1's command reads |
| S3.1 | `MCP_ASK_CHOICES`, `mcpAskHtml`, the two-flag page script — S3.2 renders the same builder |
| S3.2 | `askResolved` on `EntityFormOptions` — S3.3 reads the same resolved value for the footer |
| S3.3 | nothing downstream; placed here so the help text in S4.1 describes a finished section |
| S4.1 | the command title in the EN help — S4.3's README sentence points at it |
| S4.2 | the itest check count for `module_tests.md`; independent of Epic 3 — may run right after S2.4 |
| S4.3 | closes #95 |

**Slack:** S3.3 may precede S3.2; S4.2 may follow S2.4 directly. Everything else is fixed.

---

## Epic 1 — The model

### S1.1 — Add the `ask` policy to the vault record and its readers

**Goal.** `McpAccess` carries `ask?: McpAskPolicy` and every reader and builder preserves it, so a record
with a policy survives Save, normalization and the viewer's words. Nothing decides anything with it yet —
the resolver reads it in S1.2, the door in S2.2.

**Files.**
- `src/mcpAccess.ts` — `export type McpAskPolicy = 'always' | 'every12h' | 'never'`; `ask?` on `McpAccess`
  (`:19-39`, doc: *absent = ask the folder*); `askPolicy(raw: unknown)` beside `deleteScope` (`:76-78`): null
  and undefined → `undefined`, the three words → themselves, **anything else → `'always'`** (parent §1.1: an
  unrecognised word is an answer and stops the climb); `readMcpAccess` (`:92-107`) becomes **half-aware** —
  the eight ladder keys are emitted iff the raw carries at least one of them, `ask` is emitted iff the raw
  carries a non-null `ask`, and an object carrying neither half returns `undefined` (it claims nothing);
  `climb` (`:121-142`) returns `ask: askPolicy(raw.ask)`; `describeAccess` (`:307-315`) appends
  `'asks once every 12 hours'` / `'never asks'` and nothing for `'always'`, only when the ladder part is
  non-empty (a closed entry still reads *not available to agents*).
- `src/typeGuards.ts` — **not changed**, and the story's summary says why (parent §1.3: a `false` there
  drops the node; `askPolicy()` supplies the safety). One test below pins that a record with an unknown word
  is still accepted.
- `src/test/mcpAccess.test.ts` — the tests.

**Tests** (`src/test/mcpAccess.test.ts`; the typeGuards one in `src/test/typeGuards.test.ts`):
- `a record with every field at a non-default value keeps the same key set through readMcpAccess and normalizeMcpAccess` — the only guard against the silent vanish of §1.3
- `an unrecognised policy word reads as ask-every-time, never as inherit`
- `a missing or null policy reads as no answer here`
- `a message carrying only a policy stores no ladder keys, and one carrying only a ladder stores no policy`
- `a message carrying neither half claims nothing` — `readMcpAccess({})` is `undefined`
- `an explicit all-off ladder is still a decision` — today's behaviour, pinned so S1.2 cannot lose it
- `the ladder never fills the policy in, and the policy never lights a rung`
- `the viewer says "never asks" and "asks once every 12 hours", and says nothing for ask-every-time` — every existing `viewerMcp.test.ts` assertion untouched
- `isMcpAccess accepts a record whose policy word this build has never seen`

**Docs.** `research/module_extension.md` — the *Where each piece lives* row for `mcpAccess.ts` (`:4092`)
gains *and the ask policy a record carries*; the `McpAccess` field list in *Data model* (grep
`folderDelete`) gains `ask`.

**DoD.** Typecheck, lint, ratchet, `npm test` green; the key-set test exists and is green;
`brokerMcpRoutes.test.ts` and `viewerMcp.test.ts` unchanged and green (no behaviour at the door or the card
changed).

**Model.** Opus — a clone of `deleteScope` whose semantics §1 already decided line by line; the fail-closed
direction is one comparison and the tests above are the spec.

**Commit.** `feat(mcp): the ask policy on the vault record, read half by half (#95)`

### S1.2 — Make inheritance per axis so a policy-only folder cannot close its branch

**Goal.** `resolveMcpInTree` walks the ladder and the policy as two separate climbs and merges once,
reporting both sources, with `'always'` applied at the end of the policy walk and nowhere else. A folder
given only *never ask* leaves the rights beneath it exactly as they were, and the three-argument
`resolveMcpAccess` — which has no production caller — is retired rather than left as a second resolver with
the old semantics.

**Files.**
- `src/mcpAccess.ts` — `answersLadder(mcp)`: **present and not policy-only**, where policy-only means *its
  only key is `ask`* — so `{}` still answers, as the resolver's own doc says it must (`:226-227`: *an
  explicit empty object is an answer*; parent §2's "any of the eight keys present" would silently re-open
  every folder closed with `mcp: {}` — see Deviations 7); `answersPolicy(mcp)`: `ask !== undefined`;
  `nearestAnswer` (`:233-245`) → `nearestWhere(from, byId, answers)` with the same `MAX_TREE_DEPTH` and the
  same cycle guard; `resolveMcpInTree` (`:182-202`) runs it twice, merges
  `{ ...normalizeMcpAccess(ladderNode?.mcp), ask: effective }` where effective is the policy node's
  `askPolicy(...)` or `'always'`; `ResolvedMcpAccess` gains `askSource: McpSource`; the tree result gains
  `askFolder: TreeNode | undefined`; **delete** `resolveMcpAccess` (`:161-171`) and `inheritedFrom`
  (`:249-255`). `grantsAnything` and `anyAgentAccess` unchanged (ladder-only by construction).
- `src/test/mcpAccess.test.ts` — migrate the three `resolveMcpAccess` tests (`:132`, `:144`, `:153`) to
  `resolveMcpInTree`; add the axis tests.
- `src/test/folderFormPage.test.ts` — its one `resolveMcpAccess` call migrates.
- Every other caller of `resolveMcpInTree` compiles unchanged — they read `.access` only:
  `mcpEntries.ts:387`, `mcpFolders.ts:78/82/142/209`, `mcpCreate.ts:104`, `providerSearch.ts:31`,
  `treeIcons.ts:69`, `viewerOptions.ts:271`, `entityEditCommands.ts:178`.

**Tests** (`src/test/mcpAccess.test.ts`):
- `a folder that only sets a policy does not close the branch its parent opened`
- `an entry with its own ladder still inherits the folder's policy`
- `a child's ask-every-time overrides a folder's never`
- `a child with no answer under a policy-set folder resolves to the folder's, and names that folder`
- `the two axes may come from two different folders, and both are named`
- `nothing anywhere answering the policy resolves to ask-every-time with source none`
- `a policy-only folder does not open the agent door` — `anyAgentAccess === false`
- `an empty object on a folder still closes the branch` — backward compatibility, pinned
- `a cycle in the parent chain cannot hang either walk`
- `the trash answers nothing on either axis`

**Docs.** `research/module_extension.md` — the `mcpAccess.ts` row becomes *the ladder, inheritance from a
folder per axis, and nothing at all inside the Trash*; wherever the doc says an answer stops the walk, it
now says each axis stops its own.

**DoD.** `resolveMcpAccess` is gone from `src/` and `src/test/`; `npm test` green; the ten `.access`
callers untouched.

**Model.** **Fable** — this is the permission walk. The failure mode (parent §2) is a permission regression
that looks like a broken switch, and the `{}`-still-closes compatibility is a judgement the parent's text
gets wrong.

**Commit.** `refactor(mcp): inheritance walks the ladder and the ask policy separately (#95)`

### S1.3 — Decide when consent is due, and keep the machine-local stamp

**Goal.** `mcpConsentPolicy.ts` answers `consentDue(policy, stamp, now)` with every clock-skew and staleness
guard pinned, and `ConsentStamps` keeps `{ at, rungs }` per `accountId:entityId` through a serialized
write-through over a `Memento` subset, evicting expired-first-then-oldest at 256. `ladderKey` names the
resolved ladder so a changed rung fails the comparison at the next call.

**Files.**
- `src/mcpConsentPolicy.ts` — **the only new source file; no `vscode` import.** `ASK_WINDOW_MS = 12 * 60 *
  60_000`; `interface ConsentStamp { at: number; rungs: string }`; `interface ConsentStampStore` (the
  `TrustStore` shape, `commandTrust.ts:30-33`, typed to `Record<string, ConsentStamp>`);
  `KEY = 'credSshManager.mcpConsentStamps'`; `MAX_STAMPS = 256` (mirrors `grantRegistry.ts:105`);
  `stampKey(accountId, entityId)`; `consentDue(policy, stamp, now)` — reuses `withinAllowWindow`
  (`agentConsent.ts:63-65`) on `stamp.at + ASK_WINDOW_MS`, refuses `at > now` and non-numeric `at`,
  compares `rungs` against the ladder resolved NOW (passed in); `class ConsentStamps { constructor(store,
  now) ; get(key) ; remember(key, rungs): Promise<void> ; forgetAll(): Promise<void> }` — one in-memory map
  as the write-through source of truth, every write through the repository's `SerialQueue` (`serialQueue.ts`),
  prune as two named steps (expired, then oldest) so each stays under complexity 4; updating an existing key
  evicts nothing.
- `src/mcpAccess.ts` — `ladderKey(access)`: all eight ladder keys in ladder order (stricter than `maskKey`'s
  five bits: a delete-scope or folder-rung change also invalidates a window — the safe direction).
- `src/agentConsent.ts` — one-line cross-reference (parent §6 row 1: two instances, shapes differ — deadline
  vs start).
- `src/test/mcpConsentPolicy.test.ts` (new), `src/test/mcpAccess.test.ts` (ladderKey).

**Tests** (`src/test/mcpConsentPolicy.test.ts`, parent §9.1 verbatim plus the store):
- `ask-every-time asks` · `never-ask never asks` · `an unrecognised word resolved upstream to always asks`
- `every-12h with no stamp asks` · `inside the window it does not` · `at exactly +12h it asks` (the boundary is `>`, inherited from `withinAllowWindow`)
- `a stamp from the future opens no window` · `a stamp still in the store after 13 hours asks` — expiry is arithmetic, not presence · `a non-numeric at asks` · `a clock set back asks`
- `a stamp whose rungs differ from the ladder resolved now asks`
- `two consents settling at once both survive` · `a read after a write sees it without awaiting the store`
- `the prune drops expired records before the cap drops the oldest` · `updating a key that is already there evicts nothing` · `the cap holds at 256`
- `forgetAll leaves the key empty`
- (`mcpAccess.test.ts`) `ladderKey changes when any rung or scope changes, and is stable across key order`

**Docs.** `research/module_extension.md` — a new *Where each piece lives* row: `mcpConsentPolicy.ts` — *when
a use call asks, and the machine-local stamp*; the growth-budget sentence from parent §7.

**DoD.** The new file imports no `vscode` (a `grep` in the summary); `npm test` green; both files under the
ceilings.

**Model.** **Fable** — the security core: clock skew in both directions, the rungs comparison, concurrent
writes and eviction order; every guard here is a place where being wrong silences a prompt.

**Commit.** `feat(mcp): the consent decision and the machine-local stamp store (#95)`

---

## Epic 2 — The door

### S2.1 — Carry the entry's resolved access and a pre-consent answer out of the lookup

**Goal.** `findUsableEntry`'s `usable` arm carries `access`, `McpUseLookup.usable` carries a **required**
`preConsented: boolean` computed by a pure `preConsentedFor` that answers `false` for delete and every
unknown verb, and `BrokerHooks` gains `rememberMcpConsent`. The door reads neither yet — a seam may be
unused but not wrong — and a `.cjs` stub that omits the field reads as `false`.

**Files.**
- `src/mcpEntries.ts` — `UsableEntry` usable arm (`:312`) += `access: McpAccess` (from `verdictFor`,
  `:387`, no second walk); `preConsentedFor(found, action, stamps, now): boolean` — **here, not in
  `mcpHooks.ts`**, because `mcpHooks.ts` imports `vscode` (`:17`) and this rule must be a unit test;
  `switchForAction(action) === 'delete'` → `false` (D2, and unknown verbs, `:365-370`), else
  `!consentDue(found.access.ask ?? 'always', stamps.get(stampKey(...)), ladderKey(found.access), now)`;
  `rungsFor(source, accountId, entityId)` — the ladder resolved NOW, for the writer.
- `src/brokerRequests.ts` — `McpUseLookup` usable arm (`:63`) += `preConsented: boolean`; `readMcpUse`'s ok
  result (`:103`) += `preConsented` derived as `found.preConsented === true` (fail-closed on `undefined`).
- `src/brokerHooks.ts` — `rememberMcpConsent?: (accountId: string, entityId: string) => void` beside
  `resolveMcpUse` (`:120`), and its name in the checked tuple (`:175`).
- `src/mcpHooks.ts` — `mcpUseLookup(storage, entryId, action, stamps?, now?)` sets `preConsented`
  (absent stamps → `false`); `rememberMcpConsent(storage, stamps, accountId, entityId)` writes
  `rungsFor(...)`. Wiring only.
- `src/test/brokerWorld.ts` — `mcpUseFor` sets `preConsented` from a new `mcpUse.preConsented?` option
  (default `false`).
- `src/test/mcpEntries.test.ts`; `src/test/brokerRequests.test.ts` (create if absent);
  `src/test/brokerHooks.test.ts` (the tuple check, wherever `checkedHooks` is tested today).

**Tests:**
- `a usable verdict carries the access it was decided from`
- `pre-consent is never computed for a delete` — D2, producer side
- `an unknown verb is treated as a delete and is never pre-consented`
- `a never-ask entry is pre-consented for use; an ask-every-time one is not`
- `an every-12h entry is pre-consented only with a live stamp whose rungs match the ladder resolved now`
- `readMcpUse carries the flag, and a lookup that omits it reads as not pre-consented` — the `.cjs` rule
- `a hook named rememberMcpConsent is known; a misspelled one is refused at construction` — the existing tuple test extended
- `rungsFor answers the ladder as it is at the moment of the call`

**Docs.** `research/module_extension.md` — the `mcpEntries.ts` row gains *and whether a use call is
pre-consented*; `brokerHooks.ts`'s hook list wherever the doc enumerates it.

**DoD.** `brokerMcpRoutes.test.ts` unchanged and green — the door still ignores the flag; the tuple test
green; `npm test` green.

**Model.** Opus — plumbing whose two decisions (delete never, undefined never) are one line each and pinned.

**Commit.** `feat(broker): the use lookup says whether the person already consented (#95)`

### S2.2 — Let a pre-consented use call through without a modal or a modal slot

**Goal.** `handleMcpUse` reads `prompts` from the lookup, takes a modal slot only when it will prompt,
pre-allows the grant so `consent()`'s existing short-circuit (`credsAgentServer.ts:545-547`) fires, writes
`allowed without a prompt` with `via: 'mcp'`, never calls `onUserPresent()` on the silent path, and
refreshes the stamp only when a modal was actually shown. **The throttle regression test is written first,
watched failing, and turned green in this same story** — parent §8 steps 1 and 8 are one story here, or the
tree is red for six commits (Deviations 1).

**Files.**
- `src/test/brokerMcpRoutes.test.ts` — **first**: the RED test (six calls on a `preConsented: true` entry
  all answer 200 with `dialogs.length === 0`); run it; record the failure — expected shape: *the sixth
  answers `too_many_requests` and six dialogs were raised*. Then the rest below.
- `src/brokerMcpDoor.ts` — `BrokerDoor.admit(res, prompts: boolean)` and `release(prompts: boolean)`
  **required** (`:34-36`, the `caller` doctrine at `:55-59`); `preConsent(grant: Grantish): void`;
  `note.via?: AuditDoor` (`:39-47`; `AuditEntry` already has it, `agentAuditLog.ts:32`); `handleMcpUse`
  (`:107-124`) reordered per parent §4.3; `handleMcpDelete` (`:156`, `:162`) and `handleMcpCreate` (`:241`,
  `:247`) pass `true`.
- `src/brokerFolderDoor.ts` — `:142`, `:148` pass `true`.
- `src/credsAgentServer.ts` — `admitAliasCall(res, prompts = true)` (`:216`; the default keeps `:306`
  byte-identical); `releaseAliasCall(prompts)`; door arrows (`:254-267`) gain `preConsent: (g) =>
  this.grants.allow((g as Grant).secret)`; in `perform` (`:464-500`) `const asked =
  this.grants.get(grant.secret)?.status !== 'allowed'` **before** the await, and after `'allowed'`: when
  `via === 'mcp' && !asked` → `this.log({ ..., outcome: 'allowed without a prompt', via })`, when
  `via === 'mcp' && asked` → `this.hooks.rememberMcpConsent?.(grant.accountId, grant.entityId)`;
  `onUserPresent()` stays where it is (`:609`, inside `ask()`) and so is never reached silently.
- `src/test/grantRegistry.test.ts` — `allow` after `deny` stays denied (the tombstone the plan's §9.3.7
  rests on — verify it is already asserted; add if not).

**Tests** (`src/test/brokerMcpRoutes.test.ts` unless noted; the harness's `options.hooks` rides through
unshaped, so a test may hand the world a real `ConsentStamps` over a `Map`-backed store and an injected clock,
and a `resolveMcpUse` built from `findUsableEntry` + `preConsentedFor` over an in-memory `McpVaultSource`):
- **RED → GREEN** `six pre-consented calls in a row all succeed and none raises a dialog` — D5
- `a silent call leaves presence at zero and writes 'allowed without a prompt' via mcp` — both fields asserted (parent §4.6)
- `delete on a pre-consented entry still raises a dialog, and so does create` — D2, consumer side, with the stub claiming `preConsented: true` for delete
- `a grant denied before the call is still denied on a never-ask entry` — `preConsent` cannot overturn a tombstone
- `a silent call inside the window does not move the stamp` — fake clock
- `consent under view+use, then edit turned on, then rotate inside the window — a dialog appears` — rungs against the ladder now
- `a token call never writes the mcp stamp` — `remember` is `via === 'mcp'` only
- `releasing a slot that was never taken frees nothing` — a prompting call and a silent call interleaved; the prompt's slot survives
- (`credsAgentServer.test.ts`) `the alias route is byte-identical: it still prompts and still spends a slot`

**Docs.** `research/module_extension.md` — the *The switch is not consent* paragraph (`:4118-4121`) rewritten:
the modal is raised per the entry's policy, every call still goes through the same masker and the same audit
file, delete and create always ask; the `brokerRequests.ts / brokerMcpDoor.ts` row. `research/module_tests.md` —
a new dated section with rows: quiet use (covered), forced-prompt delete and create (covered), the window does
not slide (covered), the escalation re-asks (covered).

**DoD.** The RED failure message quoted in the summary beside the GREEN; `npm test` green; `npm run itest:agent`
green (the token and alias doors are unchanged); `credsAgentServer.ts` ≤ 800 (expect ≈ 775). **Known gap
until S2.3:** silent calls are unbounded — acceptable only because nothing can write `ask` to a record before
Epic 3, and S2.3 lands first.

**Model.** **Fable** — the consent gate itself; every line here decides whether a human is asked.

**Commit.** `feat(broker): a pre-consented use call runs without a modal and spends no modal slot (#95)`

### S2.3 — Bound the silent path at sixty calls a minute

**Goal.** Silent MCP calls pass a separate sliding ceiling of 60 per minute with no in-flight serialization,
refused as the existing `too_many_requests` and audited, while the five-modals-a-minute budget is untouched.
`AliasThrottle` is **widened**, not copied (reuse-first move 1).

**Files.**
- `src/aliasThrottle.ts` — `constructor(max = MAX_PROMPTS, windowMs = WINDOW_MS, serialized = true)`;
  `admit` skips `busy` when not serialized; `release` is a no-op when not serialized; `describe` becomes
  instance-aware so the refusal names *silent calls* and *60*, not *prompt* and *5*;
  `export const SILENT_CEILING = 60`.
- `src/credsAgentServer.ts` — `silentCeiling = new AliasThrottle(SILENT_CEILING, WINDOW_MS, false)`;
  `admitAliasCall(res, prompts)` routes `!prompts` to it; `releaseAliasCall(prompts)` likewise. Verify that
  `respondError(res, code, message)` with no grant writes an audit line; if it does not, pass a `note`
  so the refusal is audited (parent §4.5: *audited like any other refusal*).
- `src/test/aliasThrottle.test.ts`, `src/test/brokerMcpRoutes.test.ts`.

**Tests:**
- (`aliasThrottle.test.ts`) `an unserialized throttle never answers busy, and refuses the (max+1)th inside the window` · `its refusal text names silent calls and the ceiling, not prompts`
- `the sixty-first silent call in a minute is refused as too_many_requests, and the refusal is audited`
- `sixty silent calls spend no modal slot: a prompting call afterwards still gets its five`
- `an entry that prompts is still refused at the sixth` — the modal defence intact (parent §9.3.3)
- `the wire contract is unchanged` — `npm run contract` leaves `contract/broker-v1.json` with an empty diff

**Docs.** `research/module_extension.md` — the alias-door sentences that say the rate of prompts is the
authorization (`:2367`, `:2399`, `:3420`) gain the silent ceiling; parent §10.3 carried over.
`research/module_tests.md` — row: the 61st refused (covered).

**DoD.** `npm test` green; `credsAgentServer.ts` ≤ 800; `contract/broker-v1.json` unchanged.

**Model.** **Fable** — the replacement rate limiter for a path whose old limiter was the prompt; wrong here
is an unbounded loop against a credential.

**Commit.** `feat(broker): silent MCP calls are bounded at sixty a minute, apart from the modal budget (#95)`

### S2.4 — Wire the stamp store and the clock into the window

**Goal.** The real window builds one `ConsentStamps` over `context.globalState` and hands the broker both
hooks through one factory in `mcpHooks.ts`, so the silent path runs against the real machine-local store.
`extension.ts` changes one line in place and does not grow (Deviations 3).

**Files.**
- `src/mcpHooks.ts` — `consentStampsFor(state: ConsentStampStore): ConsentStamps` — **memoized per
  `state`** (`WeakMap`) so S4.1's command reaches the same instance without a handle threaded through
  `extension.ts`; `mcpUseHooks(storage, state, now = Date.now): Pick<BrokerHooks, 'resolveMcpUse' |
  'rememberMcpConsent'>`.
- `src/extension.ts:548` — the `resolveMcpUse:` line becomes `...mcpUseHooks(storage, context.globalState),`
  (one line for one line; the `mcpUseLookup` import at `:100` becomes `mcpUseHooks`).
- `src/test/mcpHooks.test.ts` (new) — via `loadWithVscode('../mcpHooks', { window: {} })`.

**Tests:**
- `the factory hands the broker both hooks, and a consent remembered through one is what the other reads`
- `two calls for the same state share one stamp store, and a different state gets its own`
- `a remembered consent lands under the real key, credSshManager.mcpConsentStamps`

**Docs.** `research/module_extension.md` — a *Where each piece lives* row for `mcpHooks.ts` (it has none
today): *the vault's answers to the MCP door, and the one stamp store per window*.

**DoD.** `npm run ratchet` clean with `.size-baseline.json` **unchanged**; `npm test` green.

**Model.** Opus — DI wiring: one factory, one memo, three tests.

**Commit.** `feat(extension): the consent stamps live in globalState, wired through one factory (#95)`

---

## Epic 3 — The controls

### S3.1 — Offer the four-option ask group on the folder form, with a page script that emits the two halves apart

**Goal.** `MCP_ASK_CHOICES` + `mcpAskHtml` render a four-radio group with a `why` per option; the page
script tracks the ladder and the policy as **two** touched flags and `collectMcp` emits each half only when
it was touched or was already decided here; the folder form shows the group under the ten switches with the
inherited answer named. `MCP_SWITCHES.length` stays 10 and every count guard stays green because the policy is
not a switch (parent §5.1).

**Files.**
- `src/mcpSwitches.ts` — `McpAskChoice { id; value: McpAskPolicy | undefined; label; why }`;
  `MCP_ASK_CHOICES` — `mcpAskInherit` (*Inherit from the folder*), `mcpAskAlways` (*Ask every time*),
  `mcpAskEvery12h` (*Ask once every 12 hours*), `mcpAskNever` (*Never ask* — its `why` says in those words
  that the switches become the whole gate and that the call is still recorded);
  `mcpAskHtml(local: McpAskPolicy | undefined, inherited?: { ask: McpAskPolicy; from: string })` — radios
  `name="mcpAsk"`, exactly one `checked`, the group hint names the verbs it covers **and** says *creating
  and deleting always ask*, the Inherit label states the inherited value (*"— Projects says: never ask"* /
  *"— nothing above answers: ask every time"*).
- `src/mcpSwitchScript.ts` — signature becomes `mcpSwitchScript(mcp: McpAccess | undefined)` and computes
  `answersLadder(mcp)` / `answersPolicy(mcp)` itself (keeps both host files at zero growth); `MCP_ASK_IDS`;
  `mcpAskValue()` → `'always' | 'every12h' | 'never' | null` (`null` when Inherit is chosen **or when no
  radio exists on the page**); `ladderTouched` / `policyTouched` replace `mcpTouched` (`:79`);
  `collectMcp` (`:80-89`) emits the ladder half when `ladderTouched || ladderDecided`, `ask` when
  `policyTouched || policyDecided`, `undefined` when neither; **Inherit emits `ask: null`**, not
  `undefined` — JSON drops `undefined` and the reader must see the key to know the answer was taken back
  (Deviations 8); radios join the listener loop (`:91`).
- `src/folderFormPage.ts` — `FolderFormOptions` += `inheritedAsk?: { ask: McpAskPolicy; from: string }`
  (a separate field: the two axes may come from two folders); `accessFieldset` (`:157-175`) renders
  `mcpAskHtml` after the switches; `:99` becomes `mcpSwitchScript(options.mcp)`; the Trash branch stays
  radio-free.
- `src/entityEditCommands.ts` (`editFolder`, `:178-188`) — fills `inheritedAsk` from
  `resolved.askSource === 'folder'`.
- `src/entityFormScript.ts:130` — `mcpSwitchScript(d?.mcp)` in place, **no new import** (799 → 799); the
  entity form does not render the group until S3.2 and the script tolerates its absence.
- `src/test/mcpAskChoices.test.ts` (new), `src/test/mcpSwitchScript.test.ts` (new, executed under the
  repository's `miniDom` as `entityFormScript.test.ts` does), `src/test/folderFormPage.test.ts`,
  `src/test/folderFormPanel.test.ts`.

**Tests:**
- `four choices, each with a why, and never-ask says the switches become the whole gate and the call is still recorded`
- `exactly one radio is checked, and it is the local answer when there is one`
- `an inheriting folder shows Inherit checked with the folder above's answer named`
- `the group hint says creating and deleting always ask`
- `the radios are absent inside the Trash`
- `MCP_SWITCHES still has ten entries and five bar colours, and no ask id is a search predicate` — `searchPredicates.ts:62-69` throws at module load for an unknown switch id; this proves the policy never entered that list
- (executed) `touching only a radio on an inheriting record posts a policy and no ladder`
- (executed) `touching only a switch posts a ladder and no policy`
- (executed) `choosing Inherit posts ask: null and still counts as touched`
- (executed) `a form opened on a decided ladder keeps posting it when only the policy is touched`
- (executed) `nothing touched and nothing decided posts undefined`
- (executed) `a page with no radios never marks the policy touched`
- (panel, round trip) `a save posting only a policy leaves the folder's ladder absent, so its children still inherit rights from above` — the §2 regression, observed through `readMcpAccess`

**Docs.** `research/module_extension.md` — the Agent-access section paragraph (ten switches **and** the ask
group; two touched flags); the `mcpSwitches.ts` row.

**DoD.** `readmeClaims.test.ts` untouched and green; `npm test` green; `entityFormScript.ts` still 799.

**Model.** Opus — UI with the semantics decided; its one dangerous edge (a policy-only save closing a branch)
has a named, executed test.

**Commit.** `feat(form): the ask policy as a four-option group on the folder form, emitted apart from the ladder (#95)`

### S3.2 — Show the effective ask policy on the entity form and let it be set there

**Goal.** The entity form renders the same group with the **resolved** policy — Inherit selected when there
is no local answer, the inherited value and its source named beside it — and the hint says touching the
consent setting decides it here. The ten switches keep rendering the local value, as parent §5.2 decided.

**Files.**
- `src/entityFormShape.ts` — `EntityFormOptions` (`:27`) += `askResolved?: { ask: McpAskPolicy; source:
  McpSource; from?: string }`.
- `src/entityEditCommands.ts` (`editNode`, `:33-105`) — fills `askResolved` via `resolveMcpInTree`
  (already imported at `:9`).
- `src/entityFormPage.ts` (`:408-428`) — `mcpAskHtml(d?.mcp?.ask, inheritedFrom(options.askResolved))`
  after the tenth switch and **before** `agentDoorsHtml` (`:427`); the hint at `:419` gains *or the consent
  setting below*; the `mcpSet` sentence (`:416-418`) becomes per half (*Switches set here* / *Consent set
  here* / *follows its folder*).
- `src/entityFormPanel.ts` — verify `toValues` (`:488`) passes `mcp` through `readMcpAccess` unchanged; no
  edit expected.
- `src/test/entityFormPage.test.ts`, `src/test/entityFormPanel.test.ts`.

**Tests:**
- `an inheriting entry under a never-ask folder shows Inherit checked and names that folder's answer — never Ask every time` — the display-that-lies guard (parent §5.2)
- `an entry with its own answer shows it checked, and the Inherit option still names the folder's answer`
- `with nothing above, the Inherit option reads "ask every time"`
- `the group sits after the tenth switch and before the doors footer`
- `the hint names the consent setting as something that decides the entry here`
- `the Trash form offers no radios`
- (panel, round trip) `saving with only the policy touched updates ask and leaves the entry's ladder absent`

**Docs.** `research/module_extension.md` — the Agent-access section (entity form renders the resolved
policy; the switches do not, and why — parent §5.2 / §6 row 4).

**DoD.** `entityFormPage.ts` ≤ 800 (expect ≈ 778); `entityFormScript.ts` still 799; `npm test` green.

**Model.** Opus — a rendering story over a value S1.2 already computes.

**Commit.** `feat(form): the entity form shows the effective ask policy and lets it be set (#95)`

### S3.3 — Name a never-ask entry in the doors footer, and stop the footer lying about the alias route

**Goal.** `agentDoors.ts` gains `standingConsent` and a row — *No consent prompt — an agent may use this
entry without asking.* — with the command that changes it, and the false claim that CLI alias routes have
*no consent modal* (`agentDoors.ts:7-8`; refuted by `handleAlias` → `perform` → `consent`,
`credsAgentServer.ts:296-320`, and asserted by `brokerConsentText.test.ts`) is corrected in the same edit.

**Files.**
- `src/agentDoors.ts` — `AgentDoors.standingConsent: boolean`; a `DOORS` row placed **first** (the
  modal-free doors come first, `:35`), `command: 'credSshManager.editNode'` (the tree's Edit command,
  `package.json:589`); the module doc and the CLI row's `detail` (`:49`) corrected;
  `doorsOf(sources, accountId, entityId, details, ask: McpAskPolicy)` — one more argument, resolved by the
  caller.
- `src/extension.ts:212` — `doorsAt` passes `resolveMcpInTree(node, byId).access.ask` **in place** on the
  same line (net 0); `src/entityViewerCommands.ts:116` likewise.
- `src/test/agentDoors.test.ts`.

**Tests:**
- `a never-ask entry renders a standing-consent row first, naming the command that changes it`
- `an ask-every-time or every-12h entry renders no such row`
- `the CLI row no longer claims there is no consent modal`
- `the footer still says nothing when nothing is live`

**Docs.** `research/module_extension.md` — the doors-footer paragraph (T24b) gains the row; every sentence
that calls the alias route modal-free is corrected (`grep -n "no consent modal"`).

**DoD.** `npm test` green; `extension.ts` still 1052.

**Model.** Opus — a row in a table and a corrected sentence.

**Commit.** `feat(form): the doors footer names a never-ask entry, and stops calling the alias route modal-free (#95)`

---

## Epic 4 — Revocation, the binary, the record

### S4.1 — Add "Forget Agent Consents on This Machine", and the help that names it

**Goal.** One command clears `credSshManager.mcpConsentStamps` through the shared `ConsentStamps.forgetAll()`,
is contributed and registered, and a test invokes the registered handler, reads the real key back empty and
watches the next eligible call prompt. The `agents-mcp` help article describes the four answers, inheritance,
and that creating and deleting always ask — in all five languages, because `helpCoverage.test.ts` fails on
any contributed command whose title is not in the English corpus (Deviations 6).

**Files.**
- `package.json` — `credSshManager.forgetAgentConsents`, title *Forget Agent Consents on This Machine*,
  category CredsForDevs, palette only.
- `src/commands/agentCommands.ts` — `register('credSshManager.forgetAgentConsents', …)` (the `register(`
  spelling is what `commandsRegistered.test.ts:36` scans for) → `consentStampsFor(context.globalState)
  .forgetAll()` then an information message; the host gains nothing — the memo from S2.4 is the handle.
- `src/helpEn.ts`, `src/helpRu.ts`, `src/helpUk.ts`, `src/helpDe.ts`, `src/helpEs.ts` — the `agents-mcp`
  article (`:115-126` in each): `setup` names the ask group; `usage` names the four answers and the
  command verbatim; `whatCanGoWrong` keeps *the switch is permission to ASK* and adds *never ask makes the
  switches the whole gate; deleting and creating always ask; a folder's never reaches entries created in it
  later* (parent §10.2).
- `src/test/forgetAgentConsents.test.ts` (new) — `loadWithVscode` with a `commands.registerCommand` stub
  that captures the handler (the `cloneClaims.test.ts:53` shape).

**Tests:**
- `the registered command empties the real globalState key`
- `after forgetting, the next call on an every-12h entry inside its old window prompts again` — a broker world sharing the same `ConsentStamps`
- `forgetting writes exactly one key and nothing else` — machine-local, no sync
- (`helpCoverage.test.ts`, unchanged) `every command in the manifest is described in the help` stays green — with the new title in the corpus

**Docs.** `research/module_extension.md` — the command in the Agent-access section and the *Revocation*
sentence from parent §7. `research/module_tests.md` — row: the Forget command (covered: invoked and watched
revoking).

**DoD.** `commandsRegistered.test.ts`, `helpCoverage.test.ts`, `secondHelpCoverage.test.ts` green; all five
language files carry the paragraph (a `grep` per file in the summary — the coverage test enforces EN only);
`npm test` green.

**Model.** Opus — one command, one store call, one captured handler; the store's semantics were pinned in
S1.3.

**Commit.** `feat(mcp): forget agent consents on this machine, and the help that says how (#95)`

### S4.2 — Drive the quiet path through the real `creds-mcp` binary

**Goal.** `creds-mcp-itest.cjs` gains a quiet leg — six calls on a pre-consented entry raise zero prompts,
one delete on it prompts, and an unapproved local caller reaching a never-ask entry succeeds — and
`module_tests.md` records those flows, the finding-12 boundary, and what the harness does not prove.

**Files.**
- `scripts/creds-mcp-itest.cjs` — the hand-written `resolveMcpUse` stub (`:300-320`) gains `e-quiet`:
  `{ kind: 'usable', target, preConsented: true }` for **every** verb including `delete`, so the delete
  check proves the consumer-side D2 through the binary; the leg sits after level 2 (`:433-463`), spends
  **zero** prompts for its six calls and **one** for the delete — the budget comment at `:451-457` is
  extended to count it (five a minute; the levels below already spend that budget).
- `research/module_tests.md` — a new dated section: `| flow | covered | note |` rows for quiet use, the
  forced-prompt delete and create, the unattended-caller boundary, and the 60/min ceiling
  (**not covered here** — unit-covered in S2.3, and sixty calls would take the leg past the script's
  timeouts); *What this does not prove*: the caller is the script itself, not a real MCP client; the idle
  auto-lock is unchanged and a never-ask entry on an idle machine is usable by anything reaching the loopback
  port (parent §10.5) — recorded here because it is where a reader will look.

**Checks:**
- `six quiet calls succeed end to end, and the human was asked zero times`
- `deleting the quiet entry still asks`
- `a caller with no token, no approval and no session reaches a never-ask entry` — the boundary finding 12 asked to see rather than assume
- `the quiet leg spent no prompt: the next prompting check still gets its dialog`

**Docs.** As above; the harness table row for `creds-mcp-itest.cjs` (`module_tests.md:37`) gains *and the
quiet path*.

**DoD.** `npm run itest:mcp` green with the leg (report the check count: 83 → N); `npm run itest:agent`
unchanged and green.

**Model.** Opus — a fixture branch and four checks in an existing script.

**Commit.** `test(mcp): the quiet path through the real binary, and the boundary it does not close (#95)`

### S4.3 — Retire every "asks on every call" claim, and record the feature

**Goal.** No text in the product says every call asks — `README.md`, `Program.cs`'s instructions and tool
text, the regenerated contract, the CHANGELOG — and `readmeClaims.test.ts` bans the sentence so it cannot
come back; the module docs and the promoted plan carry the deviations. This story closes #95.

**Files.**
- `README.md:31` (*a prompt on every single call*) and `:196` (*every single call still asks you*) — reworded:
  a prompt as often as the entry's policy says, deleting and creating always ask.
- `src/test/readmeClaims.test.ts` — `BANNED` (`:97-105`) += `[/prompt on every (single )?call/i, …]` and
  `[/every (single )?call still asks/i, …]` — **written first, watched RED against the old README**, then the
  README edit turns it GREEN; the failure message quoted in the summary.
- `src_mcp/src/Program.cs:465` (*Every action asks the person first*) and `:527` (*by the person's approval,
  every call*) — prose only; then `dotnet build dew_flow_creds_for_devs.slnx` (0 warnings) and
  `./src_mcp/tests/bin/Debug/net10.0/CredsMcp.Tests.exe` — the instructions string may be pinned there.
- `contract/mcp-tools-v1.json` — **regenerated** by `npm run contract:mcp`, never hand-edited;
  `node scripts/emit-mcp-tools.mjs --check` green.
- `src_vs_code/CHANGELOG.md` — the next feature version's entry: the policy, the four answers, and the
  compatibility note from parent §1.4 (an older build that saves an entry drops its policy, back to
  inheriting). The version bump itself is the release commit, not this story.
- `research/module_extension.md` — the broker section's *Consent* paragraph (`:3090`), the Agent-access
  section, the *Where each piece lives* table (final pass), the growth budget (parent §7).
- `research/module_tests.md` — final pass: the three flows of parent §9.8 present with `covered` / `not
  covered with its reason`.
- `todo/PLAN_agent_consent_policy.md` → `research/` via `/promote-plan`, status `IMPLEMENTED <date>` with
  §Deviations of this file recorded as its deviations; **this file promoted in the same pass** (its status
  line gains the per-story verdict table the precedent carries); both README tables updated;
  `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` clean.

**Tests:**
- `neither README claims a prompt on every call` — RED first, then GREEN
- `the contract file and the binary agree` — `emit-mcp-tools.mjs --check`
- `PlanLifecycle` clean

**Docs.** This is the docs story.

**DoD.** Every box of the parent plan's *Definition of Done* ticked; the summary reports every story's
`review_code` verdict and how many reviewers answered.

**Model.** Opus — text, regeneration and promotion; nothing here decides a permission.

**Commit.** `docs(#95): no claim says every call asks; the plan promoted with its deviations`

---

## Deviations — where the parent's §8 cannot be built as written, and what is built instead

1. **Steps 1 and 8 straddle six steps** (RED at 1, GREEN at 8). A tree red for six commits fails the story
   contract. → RED and GREEN are one story, **S2.2**, and the RED failure is quoted in that story's summary.
2. **Step 6 puts `preConsentedFor` in `mcpHooks.ts`**, which imports `vscode` (`mcpHooks.ts:17`) and so cannot
   be unit-tested (repo rule: *every module that needs a unit test imports no `vscode`*). → the pure rule
   lives in `mcpEntries.ts`; `mcpHooks.ts` only wires (**S2.1**).
3. **Step 9 says the added lines "raise the baseline in the same commit."** `size-ratchet.mjs` only tightens;
   the baseline has been hand-raised four times (`git log -- .size-baseline.json`), but nothing here needs
   it: a factory in `mcpHooks.ts` and a memoized `consentStampsFor(state)` keep `extension.ts` at 1052
   (**S2.4**, **S3.3**, **S4.1**). The baseline is not touched.
4. **Step 7 lists `brokerHooks.ts` with the door.** Its interface and checked-name-tuple change belong to the
   lookup seam (**S2.1**), where the hook is declared, not where it is first called.
5. **Step 2 bundles the model, per-axis inheritance, `ladderKey` and `describeAccess`.** Per-axis inheritance
   is the one place a mistake is a silent permission regression → its own Fable story (**S1.2**); `ladderKey`
   goes with the stamp that carries it (**S1.3**).
6. **Steps 12 and 15 separate the Forget command from the help article.** `helpCoverage.test.ts:96-106` fails
   on any contributed command whose title is absent from the English corpus → the article moves into
   **S4.1**, all five languages, or the command cannot land green.
7. **Parent §2 defines `answersLadder` as "any of the eight ladder keys present."** A folder closed on purpose
   may be stored as `mcp: {}` — the resolver's own doc says *an explicit empty object is an answer*
   (`mcpAccess.ts:226-227`) — and that definition would silently re-open every such branch. → policy-only means
   *the only key is `ask`*; `{}` still answers, pinned by a test (**S1.2**).
8. **Parent §5.3 says Inherit emits `ask: undefined`.** JSON drops `undefined`; a policy-only Inherit would post
   `{}`, and the current reader turns `{}` into an all-off ladder, closing the entry. → the page emits
   `ask: null`, the reader drops a null policy, and an object with neither half reads as `undefined`
   (**S1.1**, **S3.1**).
9. **Step 14 treats `Program.cs` as prose only.** `src_mcp/tests` (40 tests) may pin the instructions string →
   **S4.3** runs the C# test executable after the edit.
10. **Parent §4.5 implies a new ceiling class.** `AliasThrottle` already holds the sliding window →
    widened with `(max, windowMs, serialized)` — reuse-first move 1 (**S2.3**).
11. **`resolveMcpAccess` (three arguments, `mcpAccess.ts:161-171`) is not in the plan** and has no production
    caller — only its tests and `inheritedFrom`. Left alone it would be a second resolver with the old
    single-axis semantics → retired in **S1.2**, its tests migrated to `resolveMcpInTree`.
12. **S2.2's `release(prompts)` is gone.** Naming the ceiling twice — once to be admitted, once to release —
    is two decisions that can disagree, and a slot released on the wrong one frees another call's. The code
    round raised it from three reviewers at once → `door.admit` hands back a `Slot`, a refusal hands back one
    that frees nothing, and `TokenlessCeilings.for` is private (**S2.3**). Every door reads
    `const slot = door.admit(res, …)` now, `brokerFolderDoor.ts` included.

Two more that are ordering, not correctness: the itest leg (step 13) does not depend on Epic 3 and may run
straight after S2.4; and S3.1 must **not** precede S2.3, because a control that can write `never` before the
ceiling exists is the unbounded path the gate's finding 9 rejected.

### Open tail — one stamp per key, rather than one map under one key

Raised by the S2.4 code round and **deliberately not done there**. Stamps live as one map under
`credSshManager.mcpConsentStamps`, so `globalState`'s last-writer-wins costs a stamp whenever two windows
remember different entries in the same moment. Per-entry keys would make those writes independent. It is a
storage-format change to a module that shipped in S1.3 — a migration for every record already stored, and
both `MAX_STAMPS` pruning and the Forget tombstone are defined over the single map — so it is a story of its
own, not a fix inside a wiring story. Meanwhile the cost is bounded and stated: one more dialog, never a
consent that should not have been granted, and a stale window cannot resurrect a forgotten stamp.

## Verified against the checkout, 2026-09-16 (branch `feat/agent-consent-policy`, HEAD `7f935e3`)

| claim | where |
|---|---|
| a fresh grant per MCP call, so `consent()`'s short-circuit never fires | `brokerMcpDoor.ts:119`, `:179`, `:199-210`; `credsAgentServer.ts:545-547` |
| the modal slot is taken before anything knows whether a modal is due | `brokerMcpDoor.ts:115`; `aliasThrottle.ts:53-64` (five a minute, one in flight) |
| `perform` and `consent` already carry `eslint-disable complexity`; `ask` carries `max-lines-per-function` | `credsAgentServer.ts:463`, `:542`, `:576` |
| `AuditEntry.via` already exists — `door.note.via` is a type-only widening | `agentAuditLog.ts:32`, `:54` |
| the harness stubs `resolveMcpUse` directly and lets `options.hooks` through unshaped | `brokerWorld.ts:190-204` |
| the itest's `resolveMcpUse` is a hand-written per-entry stub; its prompt budget note | `creds-mcp-itest.cjs:300-320`, `:451-457`, `:730-734` |
| `mcpHooks.ts` imports `vscode` | `mcpHooks.ts:17` |
| `readMcpAccess` synthesizes all eight ladder keys today | `mcpAccess.ts:97-106` |
| `resolveMcpAccess` has no caller outside `mcpAccess.ts` and two test files | `grep` over `src/`; `folderFormPage.test.ts`, `mcpAccess.test.ts` |
| `helpCoverage` needs the EN title verbatim; `commandsRegistered` scans for `register('…'` | `helpCoverage.test.ts:96-106`; `commandsRegistered.test.ts:36` |
| `miniDom` executes page scripts in tests | `src/test/miniDom.ts`, used by `entityFormScript.test.ts` |
| `loadWithVscode` accepts a `commands.registerCommand` stub | `vscodeStub.ts:16`; `cloneClaims.test.ts:53` |
| five help languages, the article is `agents-mcp` | `helpContent.ts:39-43`, `:59-63`; `helpEn.ts:115-126` |
| the claims to retire | `README.md:31`, `:196`; `Program.cs:465`, `:527`; `contract/mcp-tools-v1.json:5` (regenerated) |
| the README guard | `readmeClaims.test.ts:97-105` (`BANNED`), `:117-119` (ten switches) |
| `module_extension.md` targets | `:3090` (consent), `:3998` (the MCP section), `:4090-4099` (where each piece lives), `:4118-4121` (the switch is not consent) |
| `module_tests.md` convention | dated `##` section, `| flow | covered | note |` table, *What these do not prove* (`:427-446`) |
| `plan-lifecycle.mjs` indexes `todo/` against the README in both directions | `checkTodoIndex`, `:220-240` |
