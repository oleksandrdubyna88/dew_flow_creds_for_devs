# PLAN — The consent dialog says, per door, what an Allow covers

> Status: **stopped for re-review, 2026-11-08: change 1.2 is epoch 1's second change.** **built on `fix/consent-coverage-per-door`, 2026-11-08 (epoch 1 open, 0 changes); the `coai` code round, the PR and the owner's look at one real dialog per tail are still to do.** The `coai` plan round on `c655038` answered
> `proceed`, 2 of 2 reviewers. The four accepted findings are folded into the text below as the approved baseline; the
> one rejected finding (*Deleting still asks* to go) is recorded at the gate with its reason — `mayBeQuiet` excludes a
> delete under every policy, and C4 asserts it. On `fix/consent-coverage-per-door` from `main` `f8a42f9`. Scope:
> `src_vs_code/src/brokerConsent.ts`, `brokerRequests.ts`, `brokerMcpDoor.ts`, `mcpHooks.ts`, `mcpEntries.ts`,
> `credsAgentServer.ts` (a parameter and one field, no behaviour), one new test file, `src_vs_code/CHANGELOG.md`,
> `research/module_extension.md`, `todo/README.md`. Extension only. Words only: no admission, grant, stamp or policy
> behaviour changes. Security fix for a false statement in a consent dialog, live on `main` and in every release
> since the alias route (0.61.0) and the MCP door (0.69.0) shipped. This text is the spec: a Sonnet coder builds from it alone,
> an Opus reviewer reads the result against it.

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
| `never` | nothing — there is no Allow: **a USE call under `never` never shows a dialog** (`consentDue` is false, `:102-104`, so `preConsented` is true and `quietly` settles the grant). The dialog shows under `never` only on the delete, create and folder routes, which always ask, and in a window with no stamp store (`mcpEntries.ts:436-438`), which asks every call; those write nothing | after a delete, create or folder dialog: that route asks again; after a use call: nothing was asked and nothing changes |

So an Allow on the MCP door covers this call only — except under `every12h`, where it also opens the twelve-hour
window. The dialog must say which, and it can: the lookup that decides `preConsented` holds the policy
(`mcpHooks.ts:160-175`). `coverage` is computed only for an ask that can occur: a use call under `never` reaches no
dialog, so no sentence is chosen for it, and C5 asserts exactly that — no dialog for the use call, a dialog with the
`call` tail for each delete.

**MCP delete, create, folder.** `'call'` grants, `consent` direct, nothing remembered. This call only.

### 2.2 The three tails

The modal's last paragraph becomes one of three, chosen by a `coverage` the asking door states. Everything before it
(who, when, the summary, the caller disclaimer) and the logging sentence after it are unchanged.

| `coverage` | Text (exact; `${name}` is `grant.entityName`) | True because |
|---|---|---|
| `token` | `Allowing covers every later call on this token, not just this one: with it the agent can ${everything} "${name}" ${describeLimits(grantLimits())}. ` — today's bytes (`brokerConsent.ts:153-154`) | §2.1 token |
| `call` | `Allowing covers this call only, not any later one. ` | the grant is one request's; nothing is written (§2.1 alias, MCP `always`, MCP `never`, delete/create/folder). It deliberately does not promise *the next call asks again*: under `never` the next USE call is quiet by policy, not by this Allow |
| `every12h` | `Allowing covers this call and, for up to ${hours} hours on this machine, every later call on "${name}" without asking — while this entry stays set to "Ask once every ${hours} hours" and its agent switches are not changed. Deleting still asks. ` | §2.1 `every12h`. `${hours}` is `ASK_WINDOW_MS / 3_600_000` (§2.3), never a literal; "Ask once every 12 hours" is the switch's own label (`mcpSwitches.ts:179`), so the person can find the setting; "on this machine" is the stamp's locality; "up to" and "while … not changed" are the window's bounds below; "Deleting still asks" is `mayBeQuiet` |

**The tail is conditional because the dialog's text cannot change after it is shown, and the write can still refuse.**
`rememberMcpConsent` re-reads the entry at the click (`mcpEntries.ts:527`) and writes nothing when the policy is no
longer `every12h` or the ladder no longer reads as it did when the dialog was raised (`worthRemembering`,
`:533-535`). So a policy flipped, or a switch turned on, while the modal is open means no window opens — and the
sentence said *while this entry stays set to … and its agent switches are not changed*, which is the condition that
failed. The same clause covers the window's early ends after it opened: a switch turned on (the stamp's `rungs` no
longer match), the Forget command, a clock set back. "Up to" says the window is never longer than
`ASK_WINDOW_MS` and may be shorter. C4b drives the race and asserts both halves.

Rejected: a fourth tail for `never` (a use call under `never` reaches no dialog, §2.1, and on the routes that do ask
the Allow covers this call only); naming the next call's behaviour in the `call` tail (false under `never` for a use
call that follows a delete dialog); dropping *Deleting still asks* (gate finding, rejected: `mayBeQuiet` excludes a
delete under every policy, C4 asserts it).

### 2.3 Where the coverage is decided — one function, every call site explicit

- `brokerConsent.ts` exports `type ConsentCoverage = 'token' | 'call' | 'every12h'` and
  `coverageOf(scope: GrantScope, remembers: boolean): ConsentCoverage` — `'token'` when `scope === 'token'`
  (a token grant never remembers; the flag cannot widen it), else `remembers ? 'every12h' : 'call'`.
- The hours in the `every12h` tail are derived, not typed: `brokerConsent.ts` imports `ASK_WINDOW_MS` from
  `mcpConsentPolicy.ts` (pure, `vscode`-free, `:27`) and the tail reads `${ASK_WINDOW_MS / 3_600_000}` in both
  places the number appears. The switch label it quotes (`mcpSwitches.ts:179`) still carries the literal twelve, so
  C8 pins the two to one another: if the constant moves, the dialog follows and the test names the label that did not.
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
   `describeLimits(grantLimits())` exactly as at `:144-154`; the `every12h` builder reads its hours from
   `ASK_WINDOW_MS`); `wording()` ends with the chosen tail plus the logging sentence. The docblock of §2.4. Typecheck now fails at the two call sites — that is the field doing its job.
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
`WINDOW_TAIL = 'Allowing covers this call and, for up to 12 hours on this machine, every later call on "prod" without asking — while this entry stays set to "Ask once every 12 hours" and its agent switches are not changed. Deleting still asks.'`,
`WINDOW_CONDITION = 'while this entry stays set to "Ask once every 12 hours" and its agent switches are not changed'`.
The test's literals say twelve on purpose — the dialog derives its number, and C8 is what keeps the two equal.

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
| C4b | MCP use, `every12h`, the race of §2.2 — two runs | real hooks over a mutable `nodes` array, `holdDialogs: true` (`brokerWorld.ts:158-159`); `/v1/mcp/use/exec` in flight; `until(() => w.openDialogs.length === 1)` (as `brokerAbandoned.test.ts:96`); then run (a) the folder's `mcp.ask` set to `'always'`, run (b) the folder's `mcp.edit` set to `true` (the ladder widens); then `w.openDialogs.shift()?.('Allow')` and await the call | status 200 and `ran.length === 1` (the person's Allow still runs THIS call); the stamp is `undefined` and `state` holds no key (the write refused); a second `/v1/mcp/use/exec` raises a dialog (`dialogs.length === 2`): no window opened | `dialogs[0]` includes `WINDOW_TAIL` — the sentence shown before the change — and includes `WINDOW_CONDITION`, the clause that failed: in run (a) the entry no longer *stays set to "Ask once every 12 hours"*; in run (b) its *agent switches* were *changed*. The test names which half in its message |
| C5 | MCP, `never` | real hooks; `/v1/mcp/use/exec`, then `/v1/mcp/delete` twice, `answers: ['Allow', 'Allow']` | **the use call shows no dialog at all**: `dialogs.length === 0`, `ran.length === 1`, an audit line contains `allowed without a prompt`; after it `state` holds no key; each delete asks: `dialogs.length` 1 then 2; `state` still empty | no sentence exists for the use call (none was shown, §2.1); both delete dialogs include `CALL_TAIL` |
| C6 | every door but token, stubbed | the `DOORS` table of `brokerConsentText.test.ts:91-118` without its token row (alias; `mcpUse: 'usable'`; delete; create; folder verb) | status 200, `dialogs.length === 1` | the dialog includes `CALL_TAIL` and not `every later call` — a stubbed lookup carries no `remembers`, and that must read as `call` |
| C7 | `coverageOf`, pure | `('token', true)`, `('token', false)`, `('call', false)`, `('call', true)` | — | `'token'`, `'token'`, `'call'`, `'every12h'` |
| C8 | the number, structural | read `ASK_WINDOW_MS`; read the `every12h` switch label (`mcpSwitches.ts:179`) | `ASK_WINDOW_MS / 3_600_000 === 12` — the hours `WINDOW_TAIL` and `WINDOW_CONDITION` state; and the label `Ask once every 12 hours` contains that same number | the message names the three places that must agree: the constant, the switch label, this file's literals |

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
- M6 `ASK_WINDOW_MS` set to eleven hours → C8 red (the constant left the label), C4 and C4b red (the dialog now says
  eleven and the test's literal says twelve); `mcpConsentPolicy.test.ts:73-76` red too. The build keeps twelve; M6
  only shows the number is derived, not typed.
- M7 the `every12h` tail loses its condition clause → C4b red on `WINDOW_CONDITION` while its stamp assertion stays
  green, which is the words-versus-fact split C4b exists for.

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
- `research/module_extension.md`, section *The agent broker — using a credential without handing it over*: in the
  paragraph that opens **Whose session registry, and the rule the code round added**, after its sentence *Allow
  covers every later call on that token; Deny is sticky for its life*, one paragraph: the dialog's last paragraph is
  chosen per door by `coverage` (the three tails of §2.2, quoted, the hours from `ASK_WINDOW_MS`), computed by
  `coverageOf(grant.scope, remembers)` where `remembers` rides beside `preConsented` from the lookup, and why the
  `every12h` tail is conditional; and in the paragraph that opens **The entry's ask policy does not reach this door,
  and that is a decision**, one sentence that the alias dialog now says *this call only*. Found by heading and by
  those opening phrases, never by line number: the file is 7,352 lines and moves. The help articles are not changed: none of the five quotes the sentence (grep over
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

- [ ] C1–C8 in `consentCoverage.test.ts`, C4b in both runs; C2–C6 and C4b were watched red on `main`'s wording and
      the failure messages are in the summary; M1–M7 each turned the named case red on the finished tree and were
      reverted.
- [ ] The `every12h` tail's hours come from `ASK_WINDOW_MS`: `grep -n "12" src_vs_code/src/brokerConsent.ts` finds no
      literal twelve.
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

- **C4 and C5 need `delete: 'any'` on folder `f1`.** §4's fixture `mcp: { use: true, ask }` makes `/v1/mcp/delete` answer
  403 *not open to agents for that* (`mcpAccess.ts:539-541`, `mayDelete`), so the delete the two cases drive never reaches
  a dialog. The test's folder is `{ use: true, delete: 'any', ask }` in C4 and C5; the claim is unchanged.
- **M1 does not turn C5 red, and M4 does not turn C3 red, as §4.2 says they would.** C5's dialogs are delete dialogs,
  which `doorFor`'s `consent` states as the literal `'call'` (`credsAgentServer.ts:293`), so `coverageOf` is not on their
  path; M1 turns C2, C3, C6 (alias, mcp use), C4, C4b and C7 red. C3 runs through the real lookup, which always sets
  `remembers` (false under `always`), so the `usableRead` fail-closed reading of a missing field is reached only by the
  stubbed lookup: M4 turns C6 (mcp use) red alone. The mutation that does reach C5 and the other three C6 rows is the
  literal itself: M1b, `coverage: 'call'` set to `'token'` in `doorFor`'s `consent` → C4, C5 and C6 (delete, create,
  folder verb) red. Kept in the build record.
- **`perform` takes `remembers?: boolean`, read as `remembers === true`, not `remembers = false`** (§2.3). A default
  parameter is a branch for the complexity rule, and `perform` was at four.
- **The §6 greps read slightly wider than written.** `grep -n "coverage" credsAgentServer.ts` finds three lines: the two
  question sites and the `import` of `coverageOf`. `grep -n "12" brokerConsent.ts` finds no numeric twelve; it finds the
  identifier `every12h` and the word in a doc comment.
- **A lookup built without a stamp store says `remembers` under `every12h`.** `mcpUseLookup(source, id, action)` with no
  `stamps` (the store-less call, `mcpHooks.ts:154`) reports `remembers: true` from the policy alone, while nothing it
  reads or writes is remembered. Production always passes a store (`mcpUseHooks`, wired by `extension.ts`; `mcpHooks.test.ts:251`
  guards that), so no dialog can say it today; a future caller of the store-less form would show the window tail for an
  Allow that opens none. Not changed here: §2.3 says `remembers` is `remembersFor(found.access)`.

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
