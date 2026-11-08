# PLAN — The consent dialog says, per door, what an Allow covers

> Status: **stopped for re-review, 2026-11-08: change 1.2 is epoch 1's second change.** **built on `fix/consent-coverage-per-door`, 2026-11-08 (epoch 1 open, 0 changes); the `coai` code round, the PR and the owner's look at one real dialog per tail are still to do.** The `coai` plan round on `c655038` answered
> `proceed`, 2 of 2 reviewers. The four accepted findings are folded into the text below as the approved baseline; the
> one rejected finding (*Deleting still asks* to go) is recorded at the gate with its reason — `mayBeQuiet` excludes a
> delete under every policy, and C4 asserts it. On `fix/consent-coverage-per-door` from `main` `f8a42f9`. Scope:
> `src_vs_code/src/brokerConsent.ts`, `brokerRequests.ts`, `brokerMcpDoor.ts`, `mcpHooks.ts`, `mcpEntries.ts`,
> `credsAgentServer.ts` (a parameter, one field, and — since the re-review — one gate on the stamp write), one new test
> file, `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `todo/README.md`. Extension only. Words, plus the
> one write gate §2.3 names: no admission, grant, policy or stamp-reading behaviour changes. Security fix for a false
> statement in a consent dialog, live on `main` and in every release
> since the alias route (0.61.0) and the MCP door (0.69.0) shipped. This text is the spec: a Sonnet coder builds from it alone,
> an Opus reviewer reads the result against it.
> **Revised whole for the re-review on 2026-11-08 (step 4 of the full stop), against the build `a98c98c`..`d02d050`, the
> Opus review behind 1.2 and 1.3, and a consultant:** the `every12h` sentence is rewritten (it names MCP use calls, says
> *may skip asking* and *only while*, because a stamp is suspended, not ended, by a policy or switch change — F4, F2); the
> stamp write is gated on the sentence that was shown (the reverse race, 1.2); the store-less lookup no longer says it
> remembers (F5a); the seam, the greps and the mutation targets are written as built (1.3, F6); C4c, C9 and C10 are
> added; the CHANGELOG loses *the next call asks again* (F3); the module document's early-ends sentence is corrected
> (F6). Items marked **(code)** in §3 are built only after epoch 2 opens. Nothing is narrowed.

## Plan changes

> Epoch 1 · approved 2026-11-08 · by reviewers · state: stopped

  (The approving round was one round: `review_plan` on `c655038` reached `proceed` with 2 of 2 reviewers. Its four
  accepted findings — the `never` row and C5 made explicit, the `every12h` tail made conditional with a race case,
  the hours derived from `ASK_WINDOW_MS`, the module document cited by heading — are the baseline this epoch is
  approved on, so the epoch opens with no entries.)
- 1.1 · 2026-11-08 · agent · approach — the plan's verification sketch was written from reading: M1 cannot turn C5 red (its dialogs are delete dialogs, whose coverage is a literal `call` at `credsAgentServer.ts:293`, so M1b was added), M4 cannot turn C3 red (the real lookup always sets `remembers`), and C4 and C5 need `delete: 'any'` on the test folder (`mcpAccess.ts:539-541`); recorded in §7 by the coder, behaviour as §2 states
  (The first change of epoch 1; the plan goes on.)
- 1.2 · 2026-11-08 · reviewer · approach — the Opus review of `e769bc0`: the reverse race makes the `call` sentence false in the unsafe direction: a dialog shown under `always` or no policy says *covers this call only*, the policy turns to `every12h` while it is open (a sync or another window), and the Allow writes a stamp that quiets later calls; the write must refuse unless the dialog showed the window sentence (`remember` given `remembers`, `asked && remembers === true`), a behaviour change
  (This second change stopped the plan. No merge until epoch 2 opens.)
- 1.3 · 2026-11-08 · reviewer · contract — the same review: §2.3's seam was built as `remembers?: boolean` read as `=== true` where the plan wrote `remembers = false`, and §6's greps count three lines where the plan wrote two; recorded in §7 only, and a spec line built otherwise counts
  (An independent cause, so its own entry.)

## 1. The defect

The local agent-consent modal — the Allow/Deny dialog the broker raises before an agent uses a credential — ended, on
`main` `f8a42f9`, with one fixed sentence (`src_vs_code/src/brokerConsent.ts:153-155` there):

> Allowing covers every later call on this token, not just this one: with it the agent can run a command, or open a
> terminal on "prod" until it goes unused for 60 minutes, and never past this window closing. Each call is logged in
> the "CredsForDevs: Agent Access" output panel.

`wording()` is the only text builder, and `ConsentGate.consent` is the only gate, so the sentence was shown on every
door that asks: the token route (`/v1/use/<action>`), the alias route (`/v1/alias/<action>`), the MCP use route
(`/v1/mcp/use/<action>`) and the MCP delete, create and folder routes. The docblock above it said why: *"Consent is per
GRANT, so one Allow authorises every action of this kind"*. That is true of the grant. It is true of the person's
situation on one door only:

| Door | The grant an Allow is written to | What the next call does | Was the sentence true? |
|---|---|---|---|
| token `/v1/use/*` | the token itself: `share` mints once (`credsAgentServer.ts:172`), scope `'token'` by default (`grantRegistry.ts:132-139`), and every request carrying that Authorization header finds the same grant | `known()` reads `allowed` and skips the modal (`brokerConsent.ts`, `ConsentGate.consent` and `known`) | yes — `credsAgentServer.test.ts:68-84` observes it |
| alias `/v1/alias/*` | a fresh `'call'` grant per request (`credsAgentServer.ts:343-344`); its secret is in no response, so nothing can present it again (`grantRegistry.ts:33-52`) | mints another pending grant and asks again | **no** — the Allow covers this call only |
| MCP use `/v1/mcp/use/*` | a fresh `'call'` grant per request (`credsAgentServer.ts:284-286`) | depends on the entry's policy (§2.1): under `always` it asks again; under `every12h` the Allow writes a stamp and later MCP use calls on this machine can go quiet for twelve hours; under `never` a use call never reached a dialog | **no** — and the true answer varies |
| MCP delete / create / folder | a `'call'` grant through the same `mint` (`brokerMcpDoor.ts:305`, `:474`; `brokerFolderDoor.ts:173`); `consent` is called directly, never `perform`, so nothing is remembered (`brokerConsentMemory.ts:37-39`) | asks again | **no** — this call only |

So on every door but one the person was told an Allow grants more than it does. It overstates rather than understates,
and nothing was granted that the person did not see. It is still a false sentence in the one dialog whose job is to be
exact about what it authorises, and the repository's own test for this dialog has that as its first line
(`brokerConsentText.test.ts:13`). The two tests that asserted the sentence (`credsAgentServer.test.ts:95`,
`brokerConsentText.test.ts:64`) both drive the TOKEN door, where it is true — which is how a false claim on the other
doors stayed green: an exact-string test on one door preserves a sentence that is false on the others.

**What the build and its review added (epoch 1, `a98c98c`..`d02d050`, reviewed by Opus and a consultant).** The
build chose the tail per door and the review found the chosen words false in three places, one of them in the unsafe
direction:

- **The reverse race (ledger 1.2).** A dialog shown under `always`, or with no policy, says *covers this call only*. If
  the policy turns to `every12h` while the dialog is open (a sync, or another window of the same profile), the Allow
  writes a stamp: `worthRemembering` re-reads the policy at the click (`mcpEntries.ts:541-543`), and the `ask` policy
  is not in `LADDER_KEYS` (`mcpAccess.ts:74-83`), so the rungs check sees no change. Later MCP use calls then go quiet
  after a dialog that said nothing later is covered. That is a stamp the person was not told about: the one direction
  this plan exists to close. Verified by reading those lines.
- **The window sentence promised continuity the code does not track (F4).** *while this entry stays set to … and its
  agent switches are not changed* read as "a change ends the window". It does not: `consentDue` reads the current
  policy and `covers` compares the current fingerprint with the stamp's (`mcpConsentPolicy.ts:96-109`, `:112-120`);
  nothing clears a stamp when the policy or a switch changes. `every12h` → `always` → `every12h` inside twelve hours
  is quiet again; ladder A → B → A gives due values false, true, false. The stamp is suspended, not ended.
- **The window quiets MCP use calls only (F2).** A stamp is read by the MCP lookup alone (`preConsentedFor`); the alias
  route always prompts (`credsAgentServer.ts:338`) and the token door reads its own grant. *every later call on "prod"*
  was wider than the fact (probe P2 of the review). Verified by reading.
- **The store-less lookup said it remembers (F5a, five gate reviewers and Opus).** `mcpUseLookup(source, id, action)`
  with no `stamps` reports `remembers: true` under `every12h` while it reads and writes nothing (`mcpHooks.ts:177`, §7).
  Production always passes a store (`mcpUseHooks`; `mcpHooks.test.ts:244-251` scans `extension.ts` for it), so no
  released dialog says it; a caller of the store-less form would show the window sentence for an Allow that opens none.

## 2. The rules, decided

### 2.1 What an Allow covers, door by door — the facts the words must match

**Token.** One Allow sets the token's grant `allowed`; every later call on the token skips the modal until the grant
expires idle (`grantLimits.ts:15-19`, default 60 minutes), hits its call cap, or the window closes. The sentence stays
byte for byte, and C1 pins it (built).

**Alias.** One Allow sets a grant `allowed` that no later request can name. `recordConsent` returns at once for
`via !== 'mcp'` (`brokerConsentMemory.ts:37-39`), so nothing is written anywhere, and an `every12h` stamp written by
the MCP door does not quiet this route either (F2). The next alias call mints a new grant and asks
(`credsAgentServer.ts:338-344`: the route always admits with `prompts = true`). The Allow covers this call only.

**MCP use.** If the dialog is showing, the lookup said `preConsented: false` — `handleMcpUse` asks only then
(`brokerMcpDoor.ts:205-211`; a pre-consented call is settled by `quietly`, `:229-252`, and never reaches the gate).
After an Allow, `perform` calls `remember` (`credsAgentServer.ts:535`), which reaches `rememberMcpConsent`
(`mcpHooks.ts:199-200` → `mcpEntries.ts:517-529`). What that writes is decided by `worthRemembering`
(`mcpEntries.ts:541-543`) from the policy **as read at the click**, and — from epoch 2 — by the gate of §2.3, which
refuses the write unless the dialog that was answered said the window sentence:

| Policy (`mcpAccess.ts:154`; absent reads as `always`, `:172`) | What the Allow writes | What later calls see |
|---|---|---|
| `always` | nothing: `remembersConsent('always')` is false (`mcpConsentPolicy.ts:323-325`); from epoch 2 also nothing when the policy turned to `every12h` while the dialog was open, because the dialog said *this call only* (§2.3) | `consentDue` is true (`mcpConsentPolicy.ts:105-107`) → the next MCP use call asks again |
| `every12h` | a stamp `{ at: now, rungs }` under `stampKey(account, entry)` in this machine's `globalState` (`mcpConsentPolicy.ts:186-193`; local by design, `:9-18`), if at the click the policy is still `every12h` and the ladder still reads as it did when shown; otherwise nothing | for up to twelve hours (`ASK_WINDOW_MS`, `:31`) an MCP USE call on this entry is pre-consented **whenever**, at that call, the policy is `every12h` and the ladder equals the stamp's (`mcpEntries.ts:435-441`): no dialog, one journal line *allowed without a prompt* (`brokerMcpDoor.ts:245-251`). A policy or switch change suspends that and a change back resumes it (F4). The Forget command (`commands/agentCommands.ts:502`) and a clock set back end it. Deleting still asks (`mayBeQuiet`, `mcpEntries.ts:443-445`). Alias and token calls on the same entry still ask (F2) |
| `never` | nothing — there is no Allow: **a USE call under `never` never shows a dialog** (`consentDue` is false, `:102-104`, so `preConsented` is true and `quietly` settles the grant). The dialog shows under `never` only on the delete, create and folder routes, which always ask, and in a window with no stamp store (`mcpEntries.ts:436-438`), which asks every call; those write nothing | after a delete, create or folder dialog: that route asks again; after a use call: nothing was asked and nothing changes |

So an Allow on the MCP door covers this call only — except when the dialog said the window sentence, where it also
writes the stamp that lets later MCP use calls skip asking. The dialog can say which: the lookup that decides
`preConsented` holds the policy and the store (`mcpHooks.ts:160-178`). `coverage` is computed only for an ask that
can occur: a use call under `never` reaches no dialog, so no sentence is chosen for it, and C5 asserts exactly that.

**MCP delete, create, folder.** `'call'` grants, `consent` direct, nothing remembered. This call only.

### 2.2 The three tails

The modal's last paragraph is one of three, chosen by a `coverage` the asking door states. Everything before it (who,
when, the summary, the caller disclaimer) and the logging sentence after it are unchanged.

| `coverage` | Text (exact; `${name}` is `grant.entityName`, `${h}` is `ASK_WINDOW_MS / 3_600_000`) | True because |
|---|---|---|
| `token` | `Allowing covers every later call on this token, not just this one: with it the agent can ${everything} "${name}" ${describeLimits(grantLimits())}. ` — `main`'s bytes (built, `tokenTail`) | §2.1 token |
| `call` | `Allowing covers this call only, not any later one. ` (built, `CALL_TAIL`) | the grant is one request's; nothing is written (§2.1 alias, MCP `always`, MCP `never`, delete/create/folder) — and from epoch 2 nothing is written even if the policy turned to `every12h` meanwhile (§2.3). It deliberately does not promise *the next call asks again*: under `never` the next USE call is quiet by policy, not by this Allow |
| `every12h` | **(code, epoch 2)** `Allowing covers this call. For up to ${h} hours on this machine, later MCP use calls on "${name}" may also skip asking — only while this entry is set to "Ask once every ${h} hours" and its agent switches are as they are now. Deleting still asks. ` | §2.1 `every12h`. *MCP use calls*: the stamp is read by that door alone (F2). *May*: the write can still refuse at the click (§2.3's forward race), and a refused write means the calls ask — asking more than announced is the safe direction. *Only while*: quiet implies the policy is `every12h` and the ladder equals the one in force now; it says nothing about permanence, so a suspended-then-resumed window (F4) is covered. *Up to*: never longer than `ASK_WINDOW_MS`, and Forget or a clock set back make it shorter. *On this machine*: the stamp's locality. *Deleting still asks*: `mayBeQuiet` (gate finding to drop it rejected, reason recorded) |

What the epoch-1 sentence got wrong, said once: *while this entry stays set to … and its agent switches are not
changed* claimed that a change ends the window, and *every later call on "prod"* claimed alias and token calls. Both
are false by `consentDue` and `preConsentedFor` (§1). The new sentence makes the weaker claims the code supports: a
later MCP use call *may* skip asking, and *only while* the conditions hold at that call.

Rejected: a fourth tail for `never` (a use call under `never` reaches no dialog, §2.1, and on the routes that do ask
the Allow covers this call only); naming the next call's behaviour in the `call` tail (false under `never` for a use
call that follows a delete dialog); dropping *Deleting still asks* (gate finding, rejected: `mayBeQuiet` excludes a
delete under every policy, C4 asserts it); promising that a changed policy or switch ENDS the window (F4: it does not —
permanent invalidation is a follow-up, §5.1, not built here).

### 2.3 Where the coverage is decided — one function, every call site explicit, and the write gated on it

As built (`a98c98c`, `a215142`), with the two epoch-2 changes marked:

- `brokerConsent.ts` exports `type ConsentCoverage = 'token' | 'call' | 'every12h'` and
  `coverageOf(scope: GrantScope, remembers: boolean): ConsentCoverage` — `'token'` when `scope === 'token'`
  (a token grant never remembers; the flag cannot widen it), else `remembers ? 'every12h' : 'call'`.
- `ConsentQuestion` carries `readonly coverage: ConsentCoverage` — REQUIRED, like `caller`, so a door added later
  does not compile until it says what its Allow covers.
- The hours in the `every12h` tail are derived: `brokerConsent.ts` imports `ASK_WINDOW_MS` from `mcpConsentPolicy.ts`
  (pure, `vscode`-free) as `WINDOW_HOURS = ASK_WINDOW_MS / 3_600_000`, used in both places the number appears. The
  switch label it quotes (`mcpSwitches.ts:179`, `MCP_ASK_CHOICES`) carries the literal twelve, so C8 pins the two.
- `remembers` comes from the lookup, beside `preConsented`: the usable arm of `McpUseLookup` has `remembers?: boolean`
  (`brokerRequests.ts`); `UseRead`'s ok arm has `remembers: boolean`, read as `found.remembers === true` in
  `usableRead` — the same fail-closed reading as `preConsented`: a resolver that does not know the field (the five
  `.cjs` harnesses, the stubbed `mcpUseFor` of `brokerWorld.ts`) gets the `call` sentence, the narrower one.
- `mcpHooks.ts:160-178` sets `remembers` on the usable result from `remembersFor(found.access)`, a one-line export of
  `mcpEntries.ts:536-538` (`remembersConsent(access.ask ?? 'always')`) that `worthRemembering` (`:541-543`) reads
  too, so the side that WRITES a stamp and the side that SAYS one will be written read one expression.
  **(code, epoch 2 — F5a)** it becomes `remembers: stamps !== undefined && remembersFor(found.access)`: a lookup with no
  store reads nothing and writes nothing, so its dialog must say `call`. C9 asserts it. The write side needs no
  change: `rememberMcpConsent` takes the store as a parameter and the store-less form has no write hook at all.
- `BrokerDoor.perform` (`brokerMcpDoor.ts`) takes `remembers?: boolean` after `rungs`; `handleMcpUse` passes
  `read.remembers`. The `consent` hook is unchanged.
- `credsAgentServer.ts`: `perform` takes `remembers?: boolean` after `rungs` — **not** a `= false` default: a default
  parameter is a branch for the complexity rule and `perform` is at four (§7) — and builds the question with
  `coverage: coverageOf(grant.scope, remembers === true)` (`:527`). `doorFor`'s `perform` passes the argument through;
  its `consent` states `coverage: 'call'` (`:293`), because every grant that door mints is `'call'` (`:286`) and the
  delete, create and folder routes remember nothing. The alias route reaches `perform` with no `rungs` and no
  `remembers` → `'call'`; the token route → `'token'` from the grant's own scope. The file is at 783 of 800 lines.
- **(code, epoch 2 — the reverse race, 1.2.)** The stamp write is gated on the sentence that was shown. The
  consultant's smallest fix is at `credsAgentServer.ts:535`: `this.remember(who.via, grant, asked && question.coverage
  === 'every12h', rungs)` — no new parameter, the policy and ladder re-checks at the click stay. Built as a pure helper
  so `perform` gains no branch: `brokerConsent.ts` exports `opensWindow(question: ConsentQuestion, asked: boolean):
  boolean`, returning `asked && question.coverage === 'every12h'`, and `:535` reads
  `await this.remember(who.via, grant, opensWindow(question, asked), rungs)`. The effect, exactly: a dialog that said
  *this call only* writes nothing whatever the policy says at the click; a dialog that said the window sentence
  writes a stamp when the policy and ladder still agree (as before); a call that raised no dialog writes nothing (as
  before, `asked` false). `recordConsent` sees `asked === false` and returns silently — no *not remembered* journal
  line, which is right: nothing was promised. This is the one behaviour change of the plan; the CHANGELOG says so
  (§4.4). C4c drives it, C4 and C4b stay green through it, M8 shows the gate is what makes C4c pass.

### 2.4 The docblock

`brokerConsent.ts`'s coverage docblock says a token grant lives for the token's life, a call grant for one request,
and on the MCP door the entry's policy may remember the answer — so the tail is chosen per door by `coverage`, and the
three tails are tested beside the fact each one states. **(code, epoch 2)** add: the write is gated on `coverage` too
(`opensWindow`), so the stamp can never be wider than the sentence; and the window sentence says *may* and *only while*
because a stamp is suspended by a policy or switch change, not ended.

## 3. Build order

Steps 1–6 are built (epoch 1): `a98c98c` the seam, `a215142` the three tails and the required field, `f9f4dfb`
C4b's clause-first assertion, `d02d050` the record. The re-review's work, after epoch 2 opens, in this order:

7. **(code)** `mcpHooks.ts`: `remembers: stamps !== undefined && remembersFor(found.access)` (F5a). C9 RED first.
8. **(code)** `brokerConsent.ts`: `opensWindow`; `credsAgentServer.ts:535` reads it (1.2). C4c RED first — its
   failure message must show the stamp that was written after a *this call only* dialog.
9. **(code)** `brokerConsent.ts`: the `every12h` sentence of §2.2 (F2, F4); the docblock of §2.4. The test literals
   `WINDOW_TAIL` and `WINDOW_CONDITION` follow; C4, C4b, C8 RED until the words match.
10. **(code)** C10, the two stores. M8 and M9 run and reverted.
11. `npm run lint` (complexity ≤ 4, no file over 800 lines, `eslint.config.mjs:30-32`), `npm run ratchet`
    (`extension.ts` is not touched), `npm test`.
12. The two documents corrected (§4.4), §7 of this plan, the README row's status; then the `coai` code round on the
    finished branch (`review_code` with this revised plan as `planText`, `again: true` if its last round closed — the
    interim path of `plan-change-control.md`) and the PR.

## 4. Test plan

One file, `src_vs_code/src/test/consentCoverage.test.ts` (built, 293 lines), over the real broker under
`brokerWorld.ts` with production's `mcpUseHooks` for the MCP cases (`mcpWorld`: a two-node tree, folder `f1` with the
policy and `delete: 'any'` where a delete is driven, entity `e1` "prod"; a `Map`-backed memento; the stamp read back
through `ConsentStamps`). The rule of the file: **every assertion on a tail stands beside an assertion on the fact the
tail states.** An exact-string test alone is how the false sentence survived (§1).

Constants, as literals so a changed word is a red and not a drift (the dialog derives its number; C8 keeps the two
equal): `TOKEN_TAIL`, `CALL_TAIL` as built; **(code)** `WINDOW_TAIL = 'Allowing covers this call. For up to 12 hours on
this machine, later MCP use calls on "prod" may also skip asking — only while this entry is set to "Ask once every 12
hours" and its agent switches are as they are now. Deleting still asks.'`, `WINDOW_CONDITION = 'only while this entry is
set to "Ask once every 12 hours" and its agent switches are as they are now'`.

### 4.1 Cases

| # | Door, policy | Drive | Fact asserted | Words asserted | State |
|---|---|---|---|---|---|
| C1 | token | two `/v1/use/exec` on one token, `answers: ['Allow']` | `ran.length === 2`, `dialogs.length === 1` | `TOKEN_TAIL`, the limits regex, not `CALL_TAIL` | built |
| C2 | alias | two `/v1/alias/exec`, `answers: ['Allow', 'Allow']` | `ran.length === 2`, `dialogs.length === 2`, `w.consents` empty | both dialogs `CALL_TAIL`; neither `every later call` | built |
| C3 | MCP use, `always` and `ask` absent | real hooks; two `/v1/mcp/use/exec` | `dialogs.length === 2`, `ran.length === 2`, the store holds no key | both dialogs `CALL_TAIL`; neither `12 hours` | built |
| C4 | MCP use, `every12h` | real hooks; use, use, delete | stamp present with the lookup's `rungs`; call 2 quiet (`dialogs.length` 1, `ran.length` 2, *allowed without a prompt* in the audit); the delete asks and trashes | `dialogs[0]` `WINDOW_TAIL`; `dialogs[1]` `CALL_TAIL` | built; literals change in step 9 |
| C4b | MCP use, `every12h`, the forward race, two runs | real hooks over a mutable `nodes`, `holdDialogs: true`; the dialog open; run (a) `mcp.ask` → `'always'`, run (b) `mcp.edit` → `true`; Allow | status 200, `ran.length === 1`; stamp `undefined`, store empty; the second use call asks | `dialogs[0]` includes `WINDOW_CONDITION` (asserted first, so a tail that loses the clause names it) and `WINDOW_TAIL` — the sentence said *may* and *only while*, and at the click the condition did not hold, so nothing may skip | built; literals change in step 9 |
| C4c | **(code)** MCP use, `always`, the reverse race | real hooks, `holdDialogs: true`; `/v1/mcp/use/exec` in flight, the dialog open; set `nodes[0].mcp = { use: true, ask: 'every12h' }`; Allow; then a second `/v1/mcp/use/exec` | status 200, `ran.length === 1`; **stamp `undefined` and the store empty** (the gate refused what the policy would now allow); the second call raises a dialog (`dialogs.length === 2`), and that second dialog's lookup now says `every12h` | `dialogs[0]` includes `CALL_TAIL` and not `12 hours` — the sentence that was answered; `dialogs[1]` includes `WINDOW_TAIL` — the policy is read fresh per call | step 8 |
| C5 | MCP, `never` | real hooks; use, delete, delete | the use shows no dialog, ran, *allowed without a prompt*; the store empty throughout; each delete asks | no sentence for the use call; both delete dialogs `CALL_TAIL` | built |
| C6 | every door but token, stubbed lookup | the five `OTHER_DOORS` rows | status 200, `dialogs.length === 1` | `CALL_TAIL`, not `every later call` — a stubbed lookup carries no `remembers` and reads as `call` | built |
| C7 | `coverageOf`, pure | the four pairs | — | `'token'`, `'token'`, `'call'`, `'every12h'` | built |
| C7b | **(code)** `opensWindow`, pure | `(every12h, asked)`, `(every12h, not asked)`, `(call, asked)`, `(token, asked)` | — | `true`, `false`, `false`, `false` | step 8 |
| C8 | the number, structural | `ASK_WINDOW_MS`, the `every12h` choice's label from `MCP_ASK_CHOICES`, this file's literals | `ASK_WINDOW_MS / 3_600_000 === 12`; the label contains `12 hours`; `WINDOW_TAIL` and `WINDOW_CONDITION` contain the same number | the message names the three places | built; literals change in step 9 |
| C9 | **(code)** MCP use, `every12h`, **no stamp store** (F5a) | `world({ mcpResolve: (id, action) => hooks.mcpUseLookup(source, id, action) })` — the store-less form, no `stamps`; two `/v1/mcp/use/exec` | both calls ask (`dialogs.length === 2`), both run | both dialogs `CALL_TAIL`, neither `12 hours`: a lookup that reads nothing says nothing is remembered | step 7 |
| C10 | **(code)** MCP use, `every12h`, **two stores** | two `mcpUseHooks` over two mementos A and B (two machines) on the same tree; world A: use, Allow; world B: use | A's stamp present; **B's store empty before its call, and B's call raises a dialog**; after B's Allow, B holds its own stamp and A's is unchanged | B's dialog `WINDOW_TAIL`: its own Allow will write to its own store | step 10 |

The existing assertions stay: `credsAgentServer.test.ts:95` and `brokerConsentText.test.ts:64` drive the token door,
where the sentence is unchanged. Nothing in `brokerMcpRoutes.test.ts` asserts the tail.

### 4.2 RED first, and the mutation checks (each must turn a case red) — targets as measured in the build

The build watched C2–C6 and C4b red on `main`'s wording and kept the messages (§7, the PR). The mutations, with the
targets corrected to what the build measured (ledger 1.1, §7):

- M1 `coverageOf` returns `'token'` for everything → C2, C3, C4, C4b, C6 (alias and mcp use rows), C7 red; **not**
  C5 — its dialogs are delete dialogs whose coverage is the literal at `credsAgentServer.ts:293`.
- M1b the literal `coverage: 'call'` in `doorFor`'s `consent` set to `'token'` → C4 (the delete dialog), C5, C6
  (delete, create, folder verb) red.
- M2 `coverageOf` returns `'call'` for everything → C1, C4, C4b, C7 red.
- M3 `handleMcpUse` stops passing `read.remembers` → C4's words red while its stamp assertion stays green.
- M4 `usableRead` reads `remembers` as `!== false` → C6 (mcp use) red alone: the real lookup always sets the field,
  so only the stubbed one reaches the fail-closed reading.
- M5 `remembersFor` returns `true` for `always` → C3 red on words; `mcpHooks.test.ts:212-221` red on the fact,
  because `worthRemembering` reads the same function.
- M6 `ASK_WINDOW_MS` set to eleven hours → C8, C4, C4b red; `mcpConsentPolicy.test.ts:73-76` red too.
- M7 the `every12h` tail loses its `only while` clause → C4b red on `WINDOW_CONDITION` (asserted first) while its
  stamp assertion stays green.
- **(code)** M8 `:535` reads `asked` again instead of `opensWindow(question, asked)` → C4c red (a stamp after a *this
  call only* dialog), C7b red; C4 and C4b stay green — the gate is only visible in the reverse race.
- **(code)** M9 `mcpHooks.ts` drops `stamps !== undefined &&` → C9 red; nothing else moves, because every other MCP
  case has a store.
- **(code)** M10 `opensWindow` ignores `asked` → C4's quiet second call stays quiet, but `brokerMcpRoutes.test.ts`'s
  *a call the person ANSWERED is remembered; a quiet one is not* goes red: a quiet call would slide the window.

### 4.3 What the tests prove and what they do not

They prove, on the compiled broker over loopback, that on each door the dialog's last paragraph matches what the next
call did and what the stamp store holds — in both races, with and without a store, and across two stores. They do not
prove the sentence reads well in a 48-character-wide modal, or that a person understands *only while* — that is the
owner's look at one real dialog per tail after the build, recorded in §7. They do not run the `.cjs` harnesses, which
show no dialog text. They cannot reproduce a host that passes `resolveMcpUse` without `rememberMcpConsent`: the test
world always wires its own recorder (`brokerWorld.ts:264-269`). What covers that host: `recordConsent` treats an absent
hook as written (`brokerConsentMemory.ts:99-105`, `remember?.()`), so such a host's dialog would say the window and
nothing would be stored; the only production host builds BOTH hooks from one factory over one store
(`mcpUseHooks`, `mcpHooks.ts:194-203`), and `mcpHooks.test.ts:244-251` scans `extension.ts` for exactly that call and
for the absence of either hook on its own. `checkedHooks` (`brokerHooks.ts`, `HOOK_KINDS`) checks kinds, not pairing;
a startup pairing check is a follow-up (§5.1), not built here.

### 4.4 The record — corrected

- `src_vs_code/CHANGELOG.md`, the `## [Unreleased]` entry *Fixed — security — the consent dialog no longer claims an
  Allow covers more than it does* (built in `d02d050`). **(code, step 12)** Remove *and the next call asks again*
  (F3: false under `never` and `every12h`). Say *later MCP use calls* where it says *every later call on that entry*
  (F2). Quote the new window sentence's claims: *may skip asking*, *only while* the setting and switches are as at
  the call (F4). Replace *Nothing about what an Allow DOES changed* with the truth: one thing did — an Allow on a
  dialog that said *this call only* no longer writes a stamp, even when the entry's policy turned to *Ask once every 12
  hours* while the dialog was open; the grants, the stamp's reading and the policies are as they were.
- `research/module_extension.md`, section *The agent broker — using a credential without handing it over*, the
  paragraph that opens **The dialog's last paragraph is chosen per door, because an Allow does not reach as far on every
  door** (built). **(code, step 12)** Quote the new `every12h` sentence; say the stamp quiets MCP use calls only; say
  the write is gated by `opensWindow` on the sentence that was shown; correct the early-ends sentence — the clause does
  **not** cover the Forget command or a clock set back, *up to* does, and a policy or switch change suspends the window
  rather than ending it (F4, F6); keep the sentence in the **The entry's ask policy does not reach this door** paragraph
  that the alias dialog says *this call only*. By heading and opening phrase, never by line number. The help articles
  are not changed: none of the five quotes the sentence (grep over `helpEn.ts`, `helpDe.ts`, `helpEs.ts`, `helpRu.ts`,
  `helpUk.ts` for *covers every*, *later call*, *not just this one*: no hit).
- `todo/README.md`: this plan's row, kept with the plan.

## 5. Out of scope, said once

- **One behaviour change, and only that one.** Admission, throttling, minting, the stamp's shape, locality and
  reading, the policies and their defaults, the one-use burn, the journal: all as they are. The one change is the
  gate of §2.3 on the stamp WRITE — a stamp is never written after a dialog that did not announce it. A reviewer who
  finds any other line that changes what an Allow does has found a defect in the build.
- **The `everything` list** stays on the token tail and only there.
- **No setting**, no new text constant module, no change to `agentConsent.ts` or the SSH agent's dialogs.
- **The remote bridge.** `feat/remote-bridge-e14` carries a test (C11) that pins the old local text byte for byte. A
  later merge of `main` into that branch will update it; nothing on that branch is changed here.
- **The `.cjs` harnesses and the `creds` / `creds-mcp` binaries**: no dialog text passes through them.
- **`extension.ts`**: untouched; its size-ratchet baseline does not move.

### 5.1 Follow-ups recorded here, not built here

- **Permanent invalidation of a stamp.** Today a policy or switch change suspends a stamp and a change back resumes it
  inside the window (F4, `consentDue` and `covers` read current values). Clearing the stamp when the entry's policy
  leaves `every12h` or its ladder changes would let the dialog say *while … not changed* truthfully. It is a stamp
  behaviour change with its own questions (who clears it — the write site, the lookup, or a sync hook; what two windows
  do) and belongs in its own plan when picked up. The window sentence of §2.2 is true without it.
- **A pairing check for the two MCP hooks.** `checkedHooks` could refuse a `resolveMcpUse` without a
  `rememberMcpConsent` (or the reverse). A startup throw is a behaviour change; the production host is covered by the
  scan of §4.3 today.

## 6. Definition of Done

- [x] C1–C8 in `consentCoverage.test.ts`, C4b in both runs; C2–C6 and C4b watched red on `main`'s wording with the
      messages in the build record; M1–M7 each turned the named case red (targets as §4.2 now reads) and were reverted.
- [ ] **(epoch 2)** C4c, C7b, C9, C10 added and watched red first; M8–M10 each turned the named case red and were
      reverted; C4, C4b, C8 green against the new literals.
- [x] `coverage` is a required field of `ConsentQuestion`; `grep -n "coverage" src_vs_code/src/credsAgentServer.ts`
      finds three lines — the `import` of `coverageOf` and the two question sites (as found, 1.3).
- [ ] **(epoch 2)** `grep -n "opensWindow" src_vs_code/src/credsAgentServer.ts` finds two lines — the import and
      `:535`; `grep -n "stamps !== undefined" src_vs_code/src/mcpHooks.ts` finds the `remembers` line.
- [x] The token tail is byte-identical to `main`'s (`tokenTail`; C1 pins it).
- [x] The `every12h` tail's hours come from `ASK_WINDOW_MS`: `grep -n "12" src_vs_code/src/brokerConsent.ts` finds no
      numeric twelve — only the identifier `every12h` and a doc comment (as found, 1.3).
- [ ] `npm run typecheck`, `npm run lint`, `npm run ratchet`, `npm test` green at lowered priority
      (`common/local-cpu-budget.md`) on the finished branch; no file over 800 lines; `extension.ts` baseline unchanged.
- [ ] **(epoch 2)** CHANGELOG, `module_extension.md` and the README row corrected as §4.4; the CHANGELOG names the one
      behaviour change.
- [x] No real host name, login or key path in any test or document (the fixtures are `prod`, `a1`, `e1`, `f1`).
- [ ] `coai`: a `review_plan` round reached `proceed` before the build (done, epoch 1); the re-review re-approved epoch
      2; a `review_code` round ran on the finished branch with this revised plan; every finding resolved; the summary
      reports the verdicts and how many reviewers answered.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` clean; the ledger carries one entry per accepted change of
      epoch 2, and the re-review record above epoch 2's line holds the Opus judge's sorting of `a98c98c`..`d02d050`.
- [ ] The owner has seen one real dialog per tail (token, alias, MCP under `every12h`) in a VS Code window and the
      wording stands or §7 records what changed and why.

## 7. Found along the way (filled by the coder; opened here)

- **C4 and C5 need `delete: 'any'` on folder `f1`.** §4's fixture `mcp: { use: true, ask }` makes `/v1/mcp/delete` answer
  403 *not open to agents for that* (`mcpAccess.ts:539-541`, `mayDelete`), so the delete the two cases drive never reaches
  a dialog. The test's folder is `{ use: true, delete: 'any', ask }` in C4 and C5; the claim is unchanged.
- **M1 does not turn C5 red, and M4 does not turn C3 red, as §4.2 says they would.** C5's dialogs are delete dialogs,
  which `doorFor`'s `consent` states as the literal `'call'` (`credsAgentServer.ts:293`), so `coverageOf` is not on their
  path; M1 turns C2, C3, C6 (alias, mcp use), C4, C4b and C7 red. C3 runs through the real lookup, which always sets
  `remembers` (false under `always`), so the `usableRead` fail-closed reading of a missing field is reached only by the
  stubbed lookup: M4 turns C6 (mcp use) red alone. The mutation that does reach C5 and the other three C6 rows is the
  literal itself: M1b, `coverage: 'call'` set to `'token'` in `doorFor`'s `consent` → C4, C5 and C6 (delete, create,
  folder verb) red. Kept in the build record. (Folded into §4.2 by the re-review.)
- **`perform` takes `remembers?: boolean`, read as `remembers === true`, not `remembers = false`** (§2.3). A default
  parameter is a branch for the complexity rule, and `perform` was at four. (§2.3 now says so.)
- **The §6 greps read slightly wider than written.** `grep -n "coverage" credsAgentServer.ts` finds three lines: the two
  question sites and the `import` of `coverageOf`. `grep -n "12" brokerConsent.ts` finds no numeric twelve; it finds the
  identifier `every12h` and the word in a doc comment. (§6 now says so.)
- **A lookup built without a stamp store says `remembers` under `every12h`.** `mcpUseLookup(source, id, action)` with no
  `stamps` (the store-less call, `mcpHooks.ts:154`) reports `remembers: true` from the policy alone, while nothing it
  reads or writes is remembered. Production always passes a store (`mcpUseHooks`, wired by `extension.ts`; `mcpHooks.test.ts:251`
  guards that), so no dialog can say it today; a future caller of the store-less form would show the window tail for an
  Allow that opens none. Not changed here: §2.3 says `remembers` is `remembersFor(found.access)`. (Taken up by the
  re-review as F5a: §2.3 step 7, C9.)

## Epics

One epic, because the change is one sentence chosen in one function, the seam that carries one boolean to it, and
now one gate that reads the same boolean back; its stories are here rather than in a document of their own, by the
shape the gate accepted for [PLAN_query_refuses_client_commands.md](PLAN_query_refuses_client_commands.md). Fable
wrote this spec and its revision (the security judgement is which sentence is true where, and that the stamp may never
be wider than the sentence); Sonnet codes each story from it; Opus reviews each against it.

Cornerstones: 2 of 2 — S1 (built), S3

### E1 · The three tails, the seam and the write gate, on `fix/consent-coverage-per-door`

- **Goal.** On every door, the consent dialog's last paragraph states exactly what the Allow being asked for covers;
  a stamp is never written after a dialog that did not announce it; and a test on each door observes the fact beside
  the words, in both races, with and without a store, across two stores.
- **Scope.** §2 whole, §3, §4; the two documents and the README row of §4.4.
- **Depends on.** Epoch 2 opening: the re-review's record and the owner's or reviewers' go.
- **Done when.** §6 is ticked and the code round has run.
- **Cornerstone areas.** The choice of coverage (S1, built): a wrong `coverage` is the same defect as today in a new
  place. The write gate (S3): a stamp wider than the sentence is the unsafe direction, and C4c is the only thing that
  catches it.

**Stories.**

- **S1 · The words and the seam** (cornerstone, built — `a98c98c`, `a215142`, `f9f4dfb`). Steps 1–4 of the original
  build order; C1–C8 RED first with the messages kept; M1–M7 run and reverted with the targets §7 records.
- **S2 · The record** (built — `d02d050`, to be corrected by S3's step 12). The CHANGELOG entry, the
  `module_extension.md` paragraph and sentence, §7 and the README row.
- **S3 · The gate, the store-less lookup, the true window sentence, and the corrected record** (cornerstone,
  `model: fable` for the spec, which is §2.2's `every12h` row, §2.3's two marked items and §4.1's C4c, C9, C10 as
  written). Steps 7–12 of §3: F5a, `opensWindow` at `:535`, the new sentence and literals, C4c/C7b/C9/C10 RED first,
  M8–M10, lint and ratchet, the two documents corrected (F2, F3, F4, F6) and the CHANGELOG naming the one behaviour
  change; then the code round and the PR. Complete on its own: S1's cases stay green throughout except where their
  literals follow the sentence, and that red is the words catching up.
