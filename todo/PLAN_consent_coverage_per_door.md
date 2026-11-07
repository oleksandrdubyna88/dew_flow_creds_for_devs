# PLAN — The consent dialog says, per door, what an Allow covers

> Status: **plan only, nothing implemented yet, 2026-11-08.** On `fix/consent-coverage-per-door` from `main` `f8a42f9`. Scope:
> `src_vs_code/src/brokerConsent.ts`, `brokerRequests.ts`, `brokerMcpDoor.ts`, `mcpHooks.ts`, `mcpEntries.ts`,
> `credsAgentServer.ts` (a parameter and one field, no behaviour), one new test file, `src_vs_code/CHANGELOG.md`,
> `research/module_extension.md`, `todo/README.md`. Extension only. Words only: no admission, grant, stamp or policy
> behaviour changes. Security fix for a false statement in a consent dialog, live on `main` and in every release
> since the alias route (0.61.0) and the MCP door (0.69.0) shipped. This text is the spec: a Sonnet coder builds from it alone,
> an Opus reviewer reads the result against it. The change ledger (`## Plan changes`) opens with the first approving
> round, under this block.

## 1. The defect

The local agent-consent modal — the Allow/Deny dialog the broker raises before an agent uses a credential — ends with
one fixed sentence (`src_vs_code/src/brokerConsent.ts:153-155`):

> Allowing covers every later call on this token, not just this one: with it the agent can run a command, or open a
> terminal on "prod" until it goes unused for 60 minutes, and never past this window closing. Each call is logged in
> the "CredsForDevs: Agent Access" output panel.

`wording()` (`brokerConsent.ts:142-157`) is the only text builder, and `ConsentGate.consent` is the only gate, so the
sentence is shown on every door that asks: the token route (`/v1/use/<action>`), the alias route
(`/v1/alias/<action>`), the MCP use route (`/v1/mcp/use/<action>`) and the MCP delete, create and folder routes. The
docblock above it says why: *"Consent is per GRANT, so one Allow authorises every action of this kind"*
(`brokerConsent.ts:135-136`). That is true of the grant. It is true of the person's situation on one door only:

| Door | The grant an Allow is written to | What the next call does | Is the sentence true? |
|---|---|---|---|
| token `/v1/use/*` | the token itself: `share` mints once (`credsAgentServer.ts:172`), scope `'token'` by default (`grantRegistry.ts:132-139`), and every request carrying that Authorization header finds the same grant | `known()` reads `allowed` and skips the modal (`brokerConsent.ts:59-62`, `:75-79`) | yes — `credsAgentServer.test.ts:68-84` observes it |
| alias `/v1/alias/*` | a fresh `'call'` grant per request (`credsAgentServer.ts:343-344`); its secret is in no response, so nothing can present it again (`grantRegistry.ts:33-52`) | mints another pending grant and asks again | **no** — the Allow covers this call only |
| MCP use `/v1/mcp/use/*` | a fresh `'call'` grant per request (`credsAgentServer.ts:284-286`) | depends on the entry's policy (§2.1): under `always` it asks again; under `every12h` the Allow writes a stamp and later calls on this machine go quiet for twelve hours; under `never` a use call never reached a dialog | **no** — and the true answer varies |
| MCP delete / create / folder | a `'call'` grant through the same `mint` (`brokerMcpDoor.ts:305`, `:474`; `brokerFolderDoor.ts:173`); `consent` is called directly, never `perform`, so nothing is remembered (`brokerConsentMemory.ts:37-39`) | asks again | **no** — this call only |

So on every door but one the person is told an Allow grants more than it does. It overstates rather than understates,
and nothing is granted that the person did not see. It is still a false sentence in the one dialog whose job is to be
exact about what it authorises, and the repository's own test for this dialog has that as its first line
(`brokerConsentText.test.ts:13`). Verified on 2026-11-08 by reading `main`'s code at the lines above; the behaviour was
run by an Opus judge on the remote-bridge branch, whose local doors are the same code. The two tests that assert the
sentence today (`credsAgentServer.test.ts:95`, `brokerConsentText.test.ts:64`) both drive the TOKEN door, where it is
true — which is how a false claim on the other doors stayed green: an exact-string test on one door preserves a
sentence that is false on the others.

## 2. The rules, decided

### 2.1 What an Allow covers, door by door — the facts the words must match

**Token.** One Allow sets the token's grant `allowed` (`brokerConsent.ts:108-112`); every later call on the token
skips the modal until the grant expires idle (`grantLimits.ts:15-19`, default 60 minutes), hits its call cap, or the
window closes. Today's sentence is exactly this, so it stays byte for byte.

**Alias.** One Allow sets a grant `allowed` that no later request can name. `recordConsent` returns at once for
`via !== 'mcp'` (`brokerConsentMemory.ts:37-39`), so nothing is written anywhere. The next alias call mints a new
grant and asks (`credsAgentServer.ts:338-344`: the route always admits with `prompts = true`). The Allow covers this
call only.

**MCP use.** If the dialog is showing, the lookup said `preConsented: false` — `handleMcpUse` asks only then
(`brokerMcpDoor.ts:205-211`; a pre-consented call is settled by `quietly`, `:229-252`, and never reaches the gate).
After an Allow, `perform` calls `remember` with `asked === true` and the ladder fingerprint (`credsAgentServer.ts:523`,
`:531`), which reaches `rememberMcpConsent` (`mcpHooks.ts:199-200` → `mcpEntries.ts:517-530`). What that writes is
decided by `worthRemembering` (`mcpEntries.ts:533-535`) from the policy read at that moment:

| Policy (`mcpAccess.ts:154`; absent reads as `always`, `:172`) | What the Allow writes | What the next call sees |
|---|---|---|
| `always` | nothing: `remembersConsent('always')` is false (`mcpConsentPolicy.ts:323-325`) | `consentDue` is true (`mcpConsentPolicy.ts:105-107`) → asks again |
| `every12h` | a stamp `{ at: now, rungs }` under `stampKey(account, entry)` in this machine's `globalState` (`mcpConsentPolicy.ts:186-193`; local by design, `:9-18`), if the ladder still reads as it did when shown | for twelve hours (`ASK_WINDOW_MS`, `:31`), a use call on this entry with the same ladder is pre-consented (`mcpEntries.ts:435-441`): no dialog, one journal line *allowed without a prompt* (`brokerMcpDoor.ts:245-251`). Deleting still asks (`mayBeQuiet`, `mcpEntries.ts:443-445`). A changed switch, the Forget command (`commands/agentCommands.ts:502`) or a clock set back ends it early, never later |
| `never` | nothing | a use call never asked in the first place (`consentDue` false, `:102-104`); the dialog shows under `never` only on the delete, create and folder routes, which always ask, and in a window with no stamp store (`mcpEntries.ts:436-438`), which asks every call. In all of those the next such call asks again |

So an Allow on the MCP door covers this call only — except under `every12h`, where it also opens the twelve-hour
window. The dialog must say which, and it can: the lookup that decides `preConsented` holds the policy
(`mcpHooks.ts:160-175`).

**MCP delete, create, folder.** `'call'` grants, `consent` direct, nothing remembered. This call only.

### 2.2 The three tails

The modal's last paragraph becomes one of three, chosen by a `coverage` the asking door states. Everything before it
(who, when, the summary, the caller disclaimer) and the logging sentence after it are unchanged.

| `coverage` | Text (exact; `${name}` is `grant.entityName`) | True because |
|---|---|---|
| `token` | `Allowing covers every later call on this token, not just this one: with it the agent can ${everything} "${name}" ${describeLimits(grantLimits())}. ` — today's bytes (`brokerConsent.ts:153-154`) | §2.1 token |
| `call` | `Allowing covers this call only, not any later one. ` | the grant is one request's; nothing is written (§2.1 alias, MCP `always`, MCP `never`, delete/create/folder). It deliberately does not promise *the next call asks again*: under `never` the next USE call is quiet by policy, not by this Allow |
| `every12h` | `Allowing covers this call and, for the next 12 hours on this machine, every later call on "${name}" without asking — this entry is set to "Ask once every 12 hours". Deleting still asks. ` | §2.1 `every12h`. "12 hours" is `ASK_WINDOW_MS`, pinned to twelve by `mcpConsentPolicy.test.ts:73-76`; "Ask once every 12 hours" is the switch's own label (`mcpSwitches.ts:179`), so the person can find the setting; "on this machine" is the stamp's locality; "Deleting still asks" is `mayBeQuiet` |

The window can end earlier than twelve hours (a switch turned on, Forget, a clock set back) — the sentence names the
longest it can be, never a longer one. A policy changed between the dialog and the click is re-read at the write
(`mcpEntries.ts:527`): a flip to `always` or `never` in that instant writes nothing, so the `every12h` sentence would
have said more than happened — the same residue as a token sentence when the vault locks a second later, and not a
grant of anything.

Rejected: computing the hours from `ASK_WINDOW_MS` in the sentence (one more import into the gate for a number a test
already pins); a fourth tail for `never` (the Allow itself covers this call only, and the policy is not this dialog's
to explain); naming the next call's behaviour in the `call` tail (false under `never`, see above).

### 2.3 Where the coverage is decided — one function, every call site explicit

- `brokerConsent.ts` exports `type ConsentCoverage = 'token' | 'call' | 'every12h'` and
  `coverageOf(scope: GrantScope, remembers: boolean): ConsentCoverage` — `'token'` when `scope === 'token'`
  (a token grant never remembers; the flag cannot widen it), else `remembers ? 'every12h' : 'call'`.
- `ConsentQuestion` gains `readonly coverage: ConsentCoverage` — REQUIRED, like `caller` (`brokerConsent.ts:43`),
  so a door added later does not compile until it says what its Allow covers.
- `remembers` comes from the lookup, beside `preConsented`: the usable arm of `McpUseLookup` gains
  `remembers?: boolean` (`brokerRequests.ts:63-66`); `UseRead`'s ok arm gains `remembers: boolean` (`:116-118`), read
  as `found.remembers === true` in `usableRead` (`:137-145`) — the same fail-closed reading as `preConsented`: a
  resolver that does not know the field (the five `.cjs` harnesses) gets the `call` sentence, which is the narrower
  one and, for those harnesses, the true one, since none of them writes a stamp.
- `mcpHooks.ts:160-175` sets `remembers: remembersFor(found.access)`, where `remembersFor(access: McpAccess)` is a
  one-line export of `mcpEntries.ts` — `remembersConsent(access.ask ?? 'always')` — used by `worthRemembering`
  (`mcpEntries.ts:534`) too, so the side that WRITES a stamp and the side that SAYS one will be written read one
  expression.
- `BrokerDoor.perform` (`brokerMcpDoor.ts:78-85`) gains `remembers?: boolean` after `rungs`; `handleMcpUse` passes
  `read.remembers` (`:217`). The `consent` hook (`:90-96`) is unchanged.
- `credsAgentServer.ts`: `perform` (`:499-514`) gains `remembers = false` after `rungs`; the question at `:524` adds
  `coverage: coverageOf(grant.scope, remembers)`. `doorFor`'s `perform` (`:288-289`) passes the new argument through;
  its `consent` (`:291-292`) adds `coverage: 'call'`, because every grant that door mints is `'call'` (`:286`) and the
  delete, create and folder routes remember nothing. The alias route reaches `perform` with no `rungs` and no
  `remembers` → `'call'`; the token route → `'token'` from the grant's own scope. The file is at 779 of 800 lines;
  this adds about four. If it does not fit, the question object moves to a one-line helper in `brokerConsent.ts`,
  never into a new behaviour.

### 2.4 The docblock

`brokerConsent.ts:135-140` says consent is per grant and the dialog must say so in the actions' own words. Keep that,
and add: a token grant lives for the token's life, a call grant for one request, and on the MCP door the entry's
policy may remember the answer — so the tail is chosen per door by `coverage`, and the three tails are tested beside
the fact each one states, not as strings alone (§4).

## 3. Build order

1. `mcpEntries.ts`: export `remembersFor`; `worthRemembering` calls it. `mcpHooks.ts`: `remembers` on the usable
   result. `brokerRequests.ts`: the two type fields and `usableRead`. Typecheck: green, nothing reads them yet.
2. `brokerConsent.ts`: `ConsentCoverage`, `coverageOf`, the required field, `coverageTail(question)` as a record
   lookup `{ token, call, every12h }[question.coverage]` (complexity 1; the token builder keeps `everything` and
   `describeLimits(grantLimits())` exactly as at `:144-154`); `wording()` ends with the chosen tail plus the logging
   sentence. The docblock of §2.4. Typecheck now fails at the two call sites — that is the field doing its job.
3. `brokerMcpDoor.ts` and `credsAgentServer.ts` as §2.3. Typecheck green.
4. The tests of §4, RED first on `main`'s wording (step 2 may be written after the tests; the order of 2 and 4 is the
   coder's, the record of the red is not optional).
5. `npm run lint` (complexity ≤ 4, no file over 800 lines, `eslint.config.mjs:30-32`), `npm run ratchet`
   (`extension.ts` is not touched; its baseline must not move), `npm test`.
6. The two documents and the README row (§4.4), then the `coai` code round and the PR.

## 4. Test plan

One new file, `src_vs_code/src/test/consentCoverage.test.ts`, over the real broker under `brokerWorld.ts` — the
same world `brokerConsentText.test.ts` and `brokerMcpRoutes.test.ts` use. The rule of this file: **every assertion on
a tail stands beside an assertion on the fact the tail states.** An exact-string test alone is how the false sentence
survived (§1).

Constants (the three tails of §2.2, as literals, so a changed word is a red and not a drift):
`TOKEN_TAIL = 'Allowing covers every later call on this token, not just this one: with it the agent can '`,
`CALL_TAIL = 'Allowing covers this call only, not any later one.'`,
`WINDOW_TAIL = 'Allowing covers this call and, for the next 12 hours on this machine, every later call on "prod" without asking — this entry is set to "Ask once every 12 hours". Deleting still asks.'`.

The MCP cases build production's own lookup and write — `mcpUseHooks(source, state, () => FROZEN_NOW)` over a
two-node tree (folder `f1` with `mcp: { use: true, ask }`, entity `e1` "prod") and a `Map`-backed memento — exactly
as `brokerMcpRoutes.test.ts:738-775` does, passed as `mcpResolve` and `mcpRemember` (`brokerWorld.ts:114-132`). The
stamp is read back with `new ConsentStamps(state).get(stampKey('a1', 'e1'), FROZEN_NOW)`, and "nothing written" is
`state` holding no key.

### 4.1 Cases

| # | Door, policy | Drive | Fact asserted | Words asserted |
|---|---|---|---|---|
| C1 | token | `share`, two `/v1/use/exec` on the token, `answers: ['Allow']` | `ran.length === 2`, `dialogs.length === 1` (the second call did not ask) | `dialogs[0]` includes `TOKEN_TAIL` and matches `/"prod" until it goes unused for \d+ minutes, and never past this window closing\. Each call is logged/`; does not include `CALL_TAIL` |
| C2 | alias | world with `alias: { … entityName: 'prod', kind: 'ssh' }`, two `/v1/alias/exec`, `answers: ['Allow', 'Allow']` | `ran.length === 2`, `dialogs.length === 2` (asked again), `w.consents` empty (nothing remembered) | both dialogs include `CALL_TAIL`; neither contains `every later call` |
| C3 | MCP use, `always` — and once more with `ask` absent | real hooks; two `/v1/mcp/use/exec`, `answers: ['Allow', 'Allow']` | `dialogs.length === 2`, `ran.length === 2`, `state` holds no key after both | both dialogs include `CALL_TAIL`; neither says `12 hours` |
| C4 | MCP use, `every12h` | real hooks; `/v1/mcp/use/exec`, then again, then `/v1/mcp/delete` (`trash: true`), `answers: ['Allow', 'Allow']` | after call 1 the stamp is present and its `rungs` equals the lookup's `rungs` for `e1`; call 2: `dialogs.length` still 1, `ran.length === 2`, an audit line contains `allowed without a prompt`; the delete: `dialogs.length === 2`, `trashed` is `['e1']` | `dialogs[0]` includes `WINDOW_TAIL`; `dialogs[1]` (the delete) includes `CALL_TAIL` |
| C5 | MCP, `never` | real hooks; `/v1/mcp/use/exec`, then `/v1/mcp/delete` twice, `answers: ['Allow', 'Allow']` | the use: `dialogs.length === 0`, ran; after it `state` holds no key; each delete asks: `dialogs.length` 1 then 2; `state` still empty | both delete dialogs include `CALL_TAIL` |
| C6 | every door but token, stubbed | the `DOORS` table of `brokerConsentText.test.ts:91-118` without its token row (alias; `mcpUse: 'usable'`; delete; create; folder verb) | status 200, `dialogs.length === 1` | the dialog includes `CALL_TAIL` and not `every later call` — a stubbed lookup carries no `remembers`, and that must read as `call` |
| C7 | `coverageOf`, pure | `('token', true)`, `('token', false)`, `('call', false)`, `('call', true)` | — | `'token'`, `'token'`, `'call'`, `'every12h'` |

The existing assertions stay as they are: `credsAgentServer.test.ts:95` and `brokerConsentText.test.ts:64` drive the
token door, where the sentence is unchanged; the comment at `credsAgentServer.test.ts:69-70` is true of that door.
Nothing in `brokerMcpRoutes.test.ts` asserts the tail.

### 4.2 RED first, and the mutation checks (each must turn a case red)

On `main`'s wording C1 and C7's first two rows pass (the guard); C2–C6 fail, with the failure message quoting the
old tail — keep those messages in the build record. Then, on the finished tree:

- M1 `coverageOf` returns `'token'` for everything → C2, C3, C5, C6 red (and C1 stays green: the guard).
- M2 `coverageOf` returns `'call'` for everything → C1, C4 red.
- M3 `handleMcpUse` stops passing `read.remembers` → C4's words red while C4's stamp assertion stays green — the two
  halves of C4 are there so this mutation is seen as a words defect and not a behaviour one.
- M4 `usableRead` reads `remembers` as `!== false` → C3 (absent `ask`) and C6 (stubbed lookup) red.
- M5 `remembersFor` returns `true` for `always` → C3 red on words; and `mcpHooks.test.ts:212-221` red on the fact,
  because `worthRemembering` reads the same function.

### 4.3 What the tests prove and what they do not

They prove, on the compiled broker over loopback, that on each door the dialog's last paragraph matches what the next
call did and what the stamp store holds. They do not prove the sentence reads well in a 48-character-wide modal, or
that a person understands "on this machine" — that is the owner's look at one real dialog per tail after the build,
recorded in §7. They do not run the `.cjs` harnesses, which show no dialog text.

### 4.4 The record

- `src_vs_code/CHANGELOG.md`, under `## [Unreleased]` (`:7`), after the existing Fixed block (`:9-36`), a second
  heading in the file's titled style: `### Fixed — security — the consent dialog no longer claims an Allow covers
  more than it does`. One bullet, in the voice of the existing entries: the sentence *Allowing covers every later
  call on this token* was shown on every door; it is true only on the token door; on the alias route and the MCP
  routes each call is its own grant, so the dialog now says *this call only*, and under *Ask once every 12 hours* it
  says the twelve-hour window it opens on this machine and that deleting still asks; nothing about what an Allow DOES
  changed. Every release since the alias route and the MCP door carries the old sentence; update to the release that
  follows.
- `research/module_extension.md`, § *The agent broker* (`:4039`): after the sentence *Allow covers every later call
  on that token; Deny is sticky for its life* (`:4345`), one paragraph: the dialog's last paragraph is chosen per door
  by `coverage` (the three tails of §2.2, quoted), computed by `coverageOf(grant.scope, remembers)` where `remembers`
  rides beside `preConsented` from the lookup; and in the policy paragraph (`:4362-4372`) one sentence that the alias
  dialog now says *this call only*. The help articles are not changed: none of the five quotes the sentence (grep over
  `helpEn.ts`, `helpDe.ts`, `helpEs.ts`, `helpRu.ts`, `helpUk.ts` for *covers every*, *later call*, *not just this one*:
  no hit).
- `todo/README.md`: this plan's row, committed with the plan.

## 5. Out of scope, said once

- **No behaviour.** Admission, throttling, minting, consent recording, the stamp's shape and locality, the policies
  and their defaults, the one-use burn, the journal: all as they are. A reviewer who finds a line that changes what an
  Allow does, rather than what it says, has found a defect in the build.
- **The `everything` list** (`brokerConsent.ts:144-147`) stays on the token tail and only there. On a call grant the
  head of the dialog already names the one verb.
- **No setting**, no new text constant module, no change to `agentConsent.ts` or the SSH agent's dialogs, which are
  different prompts with their own words.
- **The remote bridge.** `feat/remote-bridge-e14` carries a test (C11) that pins today's local text byte for byte. A
  later merge of `main` into that branch will update it; nothing on that branch is changed here, and this plan does
  not wait for it.
- **The `.cjs` harnesses and the `creds` / `creds-mcp` binaries**: no dialog text passes through them.
- **`extension.ts`**: untouched; its size-ratchet baseline does not move.

## 6. Definition of Done

- [ ] C1–C7 in `consentCoverage.test.ts`; C2–C6 were watched red on `main`'s wording and the failure messages are in
      the summary; M1–M5 each turned the named case red on the finished tree and were reverted.
- [ ] `coverage` is a required field of `ConsentQuestion`; both call sites in `credsAgentServer.ts` state it; `grep -n
      "coverage" src_vs_code/src/credsAgentServer.ts` shows exactly the two.
- [ ] The token tail is byte-identical to `main`'s (`git diff main -- src_vs_code/src/brokerConsent.ts` shows the old
      template string moved, not edited; C1 pins it).
- [ ] `npm run typecheck`, `npm run lint`, `npm run ratchet`, `npm test` green at lowered priority
      (`common/local-cpu-budget.md`); no file over 800 lines; `extension.ts` baseline unchanged.
- [ ] CHANGELOG entry, `module_extension.md` paragraph and sentence, README row — as §4.4.
- [ ] No real host name, login or key path in any test or document (the fixtures are `prod`, `a1`, `e1`, `f1`).
- [ ] `coai`: a `review_plan` round reached `proceed` before step 2; a `review_code` round ran on the finished branch;
      every finding resolved; the summary reports the verdicts and how many reviewers answered.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` clean; this plan's ledger opened at approval, one entry per
      accepted change.
- [ ] The owner has seen one real dialog per tail (token, alias, MCP under `every12h`) in a VS Code window and the
      wording stands or §7 records what changed and why.

## 7. Found along the way (filled by the coder; opened here)

- (nothing yet)

## Epics

One epic, because the change is one sentence chosen in one function and the seam that carries one boolean to it; its
stories are here rather than in a document of their own, by the shape the gate accepted for
[PLAN_query_refuses_client_commands.md](PLAN_query_refuses_client_commands.md). Fable wrote this spec (the security
judgement is which sentence is true where); Sonnet codes each story from it; Opus reviews each against it.

Cornerstones: 1 of 1 — S1

### E1 · The three tails and the seam, on `fix/consent-coverage-per-door`

- **Goal.** On every door, the consent dialog's last paragraph states exactly what the Allow being asked for covers,
  and a test on each door observes the fact beside the words.
- **Scope.** §2 whole, §3, §4; the two documents and the README row of §4.4.
- **Depends on.** Nothing; the plan round comes first.
- **Done when.** §6 is ticked and the code round has run.
- **Cornerstone area.** The choice of coverage (S1): a wrong `coverage` is the same defect as today in a new place,
  and the tests of §4.1 are the only thing that catches it.

**Stories.**

- **S1 · The words and the seam** (cornerstone, `model: fable` for the spec, which is §2 and §4.1–4.2 as written).
  Steps 1–3 of §3; `consentCoverage.test.ts` C1–C7 RED first with the messages kept; M1–M5 run and reverted. Complete
  on its own: the two existing token-door assertions stay green throughout.
- **S2 · The record.** The CHANGELOG entry, the `module_extension.md` paragraph and sentence, this plan's §7 and the
  `todo/README.md` row's status; then the code round and the PR. Follows S1, because the paragraph records S1's tails
  as built.
