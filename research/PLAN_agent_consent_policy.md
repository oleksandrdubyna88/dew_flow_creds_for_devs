# PLAN — how often a person is asked before an agent uses an entry

> Status: **IMPLEMENTED, 2026-09-17.** Built as thirteen stories on thirteen branches, each one
> commit with its own red-first tests and its own `coai` code round — the build order, the per-story
> verdicts and the **twelve places this plan's §8 could not be built as written** are in
> [PLAN_agent_consent_policy_stories.md](PLAN_agent_consent_policy_stories.md), which is this plan's
> record of deviations and is promoted with it.
>
> **What shipped differently from this document**, in one place, for a reader who will not open the
> other file: the pure consent rule lives in `mcpEntries.ts`, not in `mcpHooks.ts`, because
> `mcpHooks.ts` imports `vscode` and could not be unit-tested (§8 step 6); `answersLadder` means
> *the only key is `ask`* rather than "any ladder key present", because `mcp: {}` is an answer and
> the plan's definition would have silently re-opened every branch closed that way (§2); Inherit
> emits `ask: null` rather than `undefined`, which JSON drops (§5.3); the §4.5 ceiling widened the
> existing `AliasThrottle` instead of adding a class; `release(prompts)` became a `Slot` the door
> hands back, because naming the ceiling twice is two decisions that can disagree; and
> `resolveMcpAccess`, which this plan never mentions, was retired rather than left behind as a
> second resolver with the old single-axis semantics. Nothing in §1–§7 was reversed.
>
> Scope: the extension's MCP use door —
> `mcpAccess.ts`, `mcpEntries.ts`, `mcpHooks.ts`, `brokerRequests.ts`, `brokerMcpDoor.ts`,
> `credsAgentServer.ts`, the two forms, and one new pure module. The server, the C# relay's logic and
> the HTTP contract are untouched (`src_mcp` changes prose only).
>
> Issue: [#95](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/95).
> Related docs: [module_extension.md](module_extension.md),
> [module_tests.md](module_tests.md),
> [PLAN_agent_folder_ops.md](PLAN_agent_folder_ops.md) (the last time this section grew),
> [PLAN_caller_identity_in_consent.md](PLAN_caller_identity_in_consent.md) (the last change
> to this modal).
>
> **Revised 2026-09-16 after the `coai` plan round** — verdict `good_enough`, all three reviewers
> answered, 19 findings, 16 accepted and 3 rejected with reasons. §12 records what changed and why; the
> two reversals of my own earlier text are in §1.1 and §5.1, and both were right.

## The symptom

Every MCP call raises a modal. Not the first per session, not the first per entry — every single one.
The cause is structural rather than a setting: consent is recorded on a **grant**
(`grantRegistry.ts:18-33`, in memory), and the MCP door **mints a fresh grant per call**
(`brokerMcpDoor.ts:119`, `:179`, `:199-210`), so `consent()`'s "already allowed" short-circuit at
`credsAgentServer.ts:551` can never fire for it. The token door does not behave this way: one Allow
covers every later call on that token, bounded by `agentGrantIdleMinutes` (default 60) and
`agentGrantMaxCalls` (`grantLimits.ts:15-20`).

So the person using an agent against a database they opened to it on purpose answers the same dialog
forty times an hour. That is consent fatigue, and `aliasThrottle.ts:9-13` already names it as the
documented way a gate like this is defeated — *"the twentieth identical dialog is the one somebody
clicks through to make it stop."* An unconfigurable prompt is not a stronger gate than a configurable
one; it is the same gate with the person trained to click past it.

## The goal

One answer per entry — or per folder, through the inheritance the switches already have — in the Agent
access section beside the switches that decide what an agent may do:

| answer | meaning |
|---|---|
| **Inherit from the folder** | no local answer; the nearest folder that has one decides. The state everything starts in. |
| **Ask every time** | today's behaviour, and what applies when nothing anywhere answers |
| **Ask once every 12 hours** | the first call asks; the rest of the window goes through |
| **Never ask** | calls run with no dialog; the switches become the whole gate |

## Decisions the owner took before this plan was written (2026-09-16)

| # | Decision |
|---|---|
| **D1** | The policy governs the **MCP use door only** — `/v1/mcp/use/*`. Not the SSH signature dialog (`sshAgentManager.ts:231-257`), not the Share-with-Claude-Code token door, not the alias route. |
| **D2** | **Deleting always asks**, whatever the policy says. Creating likewise — it has no entry to carry a policy. |
| **D3** | The policy VALUE lives on `McpAccess` (`mcpAccess.ts:19-39`): inside the vault, inherited from folders, and already stripped from shares by `shareFormat.ts:535-536`. |
| **D4** | The "last consented at" STAMP is **machine-local** — `globalState`, never synced, exactly like `commandTrust.ts:30-35`. Consenting on the laptop does not silence the desktop. |
| **D5** | A call that raises **no** prompt must **not** spend an `AliasThrottle` slot. |

D5 is a defect being fixed, not a concession. `brokerMcpDoor.ts:115` takes the slot *before* anything
knows whether a modal is due, while `aliasThrottle.ts:27-37` is a budget of **five modals a minute**.
Left alone, five silent calls would refuse the sixth for a dialog nobody was ever going to see.

**D5 is about the PROMPT budget and nothing else** (gate finding 9, accepted). Not spending a modal slot
is not the same as having no ceiling, and a credential manager must not offer an unbounded one: §4.5
adds a separate, far higher request ceiling for silent calls. The owner is asked to veto that in review
if they meant otherwise; it is recorded here rather than done quietly.

---

## 1. The model

### 1.1 The field — four answers, and absence means INHERIT

```ts
export type McpAskPolicy = 'always' | 'every12h' | 'never';
/** How often the window asks before an agent USES this entry. Absent = ask the folder. */
ask?: McpAskPolicy;
```

**This reverses the first draft, and the gate was right.** That draft made `'always'` unrepresentable —
absence *was* "ask every time" — on the model of `delete?: McpDeleteScope`, where a value is present only
when it grants more than the default. Two reviewers found the same hole independently (findings 11 and
13): with folder inheritance in play, absence has to mean *inherit*, or a child under a folder set to
`never` **cannot say "ask me anyway"** — it would emit no value, which the resolver would read as "ask
the folder", which says never. The radio group has the mirror of it: once a person picks an answer there
is no way back to inheriting.

So the policy needs a real presence bit like the ladder has, and the strict answer needs a name. The
safe default is preserved where it belongs — at the **end of the walk**: when nothing at any level
answers, the effective policy is `'always'`.

An unrecognised word from a newer build reads as **`'always'` and stops the climb**. It is an answer,
merely not one this build understands, and treating it as absence would let it inherit a folder's
`never` — the one direction that must not happen by accident.

### 1.2 The reader — a clone of `deleteScope` (`mcpAccess.ts:76-78`)

```ts
function askPolicy(raw: unknown): McpAskPolicy | undefined {
  if (raw === undefined || raw === null) { return undefined; }          // no answer here
  return raw === 'never' || raw === 'every12h' || raw === 'always' ? raw : 'always';
}
```

Takes `unknown` for `deleteScope`'s stated reason: both callers get their word from outside this
program — a synced record, or a webview message.

### 1.3 Both closed-world builders, or it vanishes silently

`ask: askPolicy(...)` is added to the returned literal of **`readMcpAccess` (`:97-106`)** and of
**`climb` (`:132-141`)**. Missing the first loses the policy on every Save; missing the second loses
it on every resolve. TypeScript reports neither, because the field is optional — §9 has the key-set
round-trip test that does.

**`isMcpAccess` (`typeGuards.ts:123`) is deliberately NOT changed.** A `false` there rejects the whole
node (`typeGuards.ts:272`, `:410`) — the entry disappears from the vault. Its own doc says a record from
a newer build is accepted rather than rejected, and the four folder rungs are unchecked there for that
reason. `askPolicy()` supplies the safety.

### 1.4 Compatibility

| situation | result | direction |
|---|---|---|
| older build **reads** `ask: 'never'` | ignores it, prompts every call | safe |
| older build **saves** the entry | `readMcpAccess` rebuilds without `ask` → policy lost, back to inheriting, and with nothing above, to asking | safe; goes in the CHANGELOG |
| older build **syncs** the node | `isMcpAccess` accepts; the field rides through | lossless |
| this build reads a word from a later one | `'always'`, and the climb stops there | fail-closed |
| share / accept share | whole `mcp` object dropped (`shareFormat.ts:535`) | already correct |

---

## 2. Inheritance becomes per-axis — and this is not gold-plating

`nearestAnswer` (`mcpAccess.ts:233-245`) climbs until a node has `mcp !== undefined`, and **an answer
stops the walk** — that is how a sub-folder closes a branch its parent opened (`:224-227`).

Setting a policy on a folder writes an `mcp` object. Under the obvious implementation that object stops
the walk, so **a folder given only "never ask" silently closes to agents every entry beneath it that
used to inherit its rights from higher up.** A fatigue setting would cause a permission regression, and
it would look like the feature simply broke the switches.

The same root cause has a milder twin on the entry side: an entry that ticks only *Visible* takes its own
object whole (`:190-193`, no per-field merge) and so discards the folder's policy. That one fails safe —
the fallback is asking — but is unexplainable at the UI.

**One presence bit cannot serve two axes.** A permission ladder is monotone and safe-by-absence; a
consent policy grants nothing and climbs nothing. So:

- `answersLadder(mcp)` — true when any of the eight ladder keys is present.
  `answersPolicy(mcp)` — true when `ask !== undefined`. Both are real questions because the page script
  emits the two halves independently (§5.3), so `{ ask: 'never' }` with no rung keys is a stored value.
- `nearestAnswer` widens into `nearestWhere(from, byId, answers)` — one function, two predicates
  (reuse-first widening move 1, not a copy). Same `MAX_TREE_DEPTH` cap and the same cycle guard, which
  exist because `parentId` comes off a synced record (`:229-231`).
- `resolveMcpInTree` (`:182-202`) runs it twice and **merges once, in the resolver**, so every one of
  its callers still makes one call and gets one coherent `McpAccess`. The two axes may legitimately be
  inherited from two different folders, and the resolver reports both sources so the forms can say so.
- **Nothing answering the policy resolves to `'always'`** — the safe default, applied once, at the end.

`grantsAnything` (`:145-147`) and `anyAgentAccess` stay **ladder-only**, so a policy-only folder does not
start a broker listener (`commands/agentCommands.ts:674-688`). That claim gets its own test.

---

## 3. The decision, and where the stamp lives

### 3.1 New file — `src_vs_code/src/mcpConsentPolicy.ts`

The only new source file. No `vscode` import (CLAUDE.md repo rule 3), clock injected, and it **reuses**
`withinAllowWindow` (`agentConsent.ts:63-65`) rather than restating the comparison:

```ts
export const ASK_WINDOW_MS = 12 * 60 * 60_000;
export function consentDue(policy: McpAskPolicy, lastConsented: ConsentStamp | undefined, now: number): boolean;
```

- `'always'` (including everything that resolved to it) → **asks**;
- `'never'` → never asks;
- `'every12h'` → asks unless `now` is inside `stamp.at + ASK_WINDOW_MS` **and** `stamp.rungs` equals the
  ladder resolved *right now*.

**Expiry is arithmetic, never presence** (finding 0, accepted). A stamp that is still in the store after
thirteen hours grants nothing, because the decision is a window comparison and not "is there a record".
Pruning (§3.2) is housekeeping — it bounds the store, it does not bound the permission — so there is no
startup sweep and none is needed. Stated here because the reviewer asked for exactly this sentence or a
sweep, and a test asserts it: a thirteen-hour-old stamp left in the store still asks.

**A stamp from the future opens no window** (`at <= now`, or it is discarded), and that one guard covers
both directions of clock skew (finding 1, accepted):

| the machine clock | what happens | direction |
|---|---|---|
| jumps **forward** | stamps age early and expire early | asks more — safe |
| is set **back** | every existing stamp is now in the future and is discarded | asks more — safe |
| holds a non-numeric `at` | `NaN` is not `<=` anything | asks — safe |

All three are tested, not argued.

### 3.2 The stamp store — same file, shaped on `commandTrust.ts:29-54`

```ts
export interface ConsentStampStore {                     // the Memento subset, as TrustStore
  get(key: string): Record<string, ConsentStamp> | undefined;
  update(key: string, value: Record<string, ConsentStamp>): Thenable<void>;
}
const KEY = 'credSshManager.mcpConsentStamps';
interface ConsentStamp { at: number; rungs: string; }
```

Keyed `accountId:entityId` — an id is unique to a vault and a window holds several (`mcpEntries.ts:310`).

**Why the stamp also carries the ladder.** The modal grants every verb of the entry's kind
(`credsAgentServer.ts:587-601`), so a window keyed on the entry alone would let a `rotate` rung turned on
an hour later ride in on a consent given for `use`. `rungs` is compared against the ladder resolved **at
the moment of the call**, not the one stored beside it (finding 3, accepted, and its test is §9.5). This
is `commandTrust.ts:20-25`'s argument — *"keying the record to the exact line means a changed command
asks again"* — and a permission is not a weaker case than a command line.

**Writes are serialized** (findings 8 and 15, accepted — raised independently by two vendors, which is
what made it obvious). `globalState.update(KEY, wholeMap)` is a read-modify-write of one map, so two
consents settling at once lose one of them and that entry prompts again inside its own window. Every
write goes through the repository's existing `serialQueue.ts` and through **one in-memory map that is
the write-through source of truth**, so a read never races a write either. No new queue is written.

**Eviction, in one order** (findings 4 and 10, accepted): on write, after the new stamp is placed —
first every **expired** record, then, only if still over **256**, the oldest. Updating a key that is
already there never evicts anything, and an unexpired window is never dropped while an expired record
remains. 256 mirrors `MAX_GRANTS` (`grantRegistry.ts:105`).

---

## 4. The call order

### 4.1 The answer is produced where both halves are held

`verdictFor` (`mcpEntries.ts:387-396`) already resolves the access and throws it away. Its `usable` arm
(`:312-315`) gains `access: McpAccess` — no second tree walk.

`mcpUseLookup` (`mcpHooks.ts:108-125`) gains the store and the clock and answers a **sibling** of the
target:

```ts
function preConsentedFor(found, action, stamps, now): boolean {
  if (switchForAction(action) === 'delete') { return false; }   // D2, and unknown verbs too
  return !consentDue(found.access.ask ?? 'always', stampFor(...), now);
}
```

`switchForAction` (`mcpEntries.ts:369-373`) answers `'delete'` for `delete` **and for every verb it does
not know** — so a verb added to the broker and forgotten there fails closed here as well.

### 4.2 Why the flag rides beside the target and not on it

`McpUseTarget` (`brokerRequests.ts:85-90`) flows through the shared `minted()` helper
(`brokerMcpDoor.ts:199-210`) into `handleMcpDelete` and `handleMcpCreate`. A pre-consent field on it
would be one refactor away from a silent deletion. As a sibling on `McpUseLookup` (`:62-65`) and on
`readMcpUse`'s result (`:100-121`) only the handler that asks for it can read it — and
`handleMcpDelete:147` calls the same `readMcpUse` and simply never reads it. **D2 then holds in two
independent places**, producer and consumer, which is the belt-and-braces `mcpEntries.ts:101-106`
already applies to `hiddenFromAgents`.

### 4.3 `handleMcpUse` — before and after

```
BEFORE (brokerMcpDoor.ts:107-124)          AFTER
  read = readMcpUse(...)                     read = readMcpUse(...)
  if (!read.ok) refuse                       if (!read.ok) refuse
  if (!door.admit(res)) return;   <- always  prompts = !read.preConsented
  grant = minted(...)                        if (!door.admit(res, prompts)) return;
  door.perform(...)                          grant = minted(...)
  finally door.release()                     preConsented(door, grant, ..., prompts)
                                             door.perform(...)
                                             finally door.release(prompts)
```

`admit(res, prompts)` and `release(prompts)` become **required** parameters on `BrokerDoor`
(`brokerMcpDoor.ts:34-36`), so a door added next year is a compile error until it states whether it
prompts — the doctrine `caller` already established at `:55-59`. The three other call sites
(`:156`, `:241`, `brokerFolderDoor.ts:142`) pass `true`, which there is a statement of fact.

### 4.4 `credsAgentServer.ts` — four small edits, and `consent()`/`ask()` are not touched

`consent()` already returns `'allowed'` when the grant is allowed (`:551-553`). `door.preConsent(grant)`
sets exactly that, so the modal is skipped by machinery that already exists.

- `admitAliasCall(res, prompts = true)` (`:216`) — takes no **modal** slot when `prompts` is false; the
  default keeps the alias route at `:306` byte-identical.
- a `releaseAliasCall(prompts)` twin — releasing a slot that was never taken would free **another**
  call's in-flight slot and stack two modals.
- three arrows in the door object (`:254-267`), including `preConsent`.
- in `perform` (`:464-503`), `const asked = <grant not already allowed>` read **before** the await, and
  `this.remember(via, grant, asked)` after it.

`remember` writes the stamp only when `via === 'mcp' && asked`:

- **`via === 'mcp'` means a use call**, because `perform` is reached from exactly one door
  (`brokerMcpDoor.ts:121`) — delete and create call `door.consent` directly and never come through
  here. So a person who allowed a *token* call cannot silence the *MCP* door on the same entry; the two
  dialogs say different things.
- **`asked` closes the sliding window.** Refreshing the stamp on a call that raised no modal turns
  "once every twelve hours" into "once, ever". This gets a test with a fake clock, not a comment.
- `onUserPresent()` (`:618`) is **not** called on the silent path. It means "a person is provably
  present" and postpones the idle auto-lock; a call nobody saw proves the opposite.

### 4.5 A silent call is still bounded (finding 9, accepted)

The modal budget and the request ceiling stop being the same number. `AliasThrottle` keeps its five
modals a minute untouched for every call that prompts; silent MCP calls pass a **separate sliding
ceiling of 60 a minute**, with no in-flight serialisation, because there is no human to protect from a
pile-up. Legitimate agent use is nowhere near one call a second sustained; a runaway loop or a
compromised local process is bounded instead of unbounded, which is what the reviewer was asking for and
what D5 did not, on its own, provide. Refusals answer the existing `too_many_requests` code, so the wire
contract is unchanged, and they are audited like any other refusal.

### 4.6 Every call still writes its audit line

The silent path writes `outcome: 'allowed without a prompt'` with `via: 'mcp'` through the one funnel
(`credsAgentServer.ts:692`). `door.note` gains `via?: AuditDoor` so the line reaches the MCP-logs page,
which filters on it. Both fields are asserted, not assumed (finding 7, accepted). Without that line a
reviewer cannot answer *"which calls ran with nobody watching"*, which is the first question anyone will
ask of this feature.

---

## 5. The UI

### 5.1 Not a switch — a four-option radio group

`MCP_SWITCHES` entries are `on(access): boolean` (`mcpSwitches.ts:21-22`) and the list is consumed by
both forms, `searchPredicates.ts:63-71` (throws at module load for an unknown id), `brokerRequests.ts`'s
refusal wording, `mcpBar.test.ts` and `readmeClaims.test.ts` (`length === 10`, README says *"Ten
switches on two ladders"*). A tri-state cannot be an `on()`, and mutually exclusive checkboxes are
exactly the unrepresentable state the ladder doc exists to prevent (`mcpAccess.ts:11-14`).

So: a **second builder in the same module**, `MCP_ASK_CHOICES` + `mcpAskHtml(...)`, rendered as a radio
group. `MCP_SWITCHES.length` stays 10, `MCP_BAR_COLORS` stays 5, `accessMask` stays 5, the glyph set
stays 32, and every one of those guards stays green **because it still counts what it claims to
count** — the policy genuinely is not a switch.

**Four options, not three** (findings 11 and 13, accepted): *Inherit from the folder* · *Ask every time*
· *Ask once every 12 hours* · *Never ask*. Without the first there is no way back to inheriting once an
answer is given; without the second a child under a folder set to `never` cannot ask to be asked. The
folder form shows the same four, where *Inherit* means the folder above it.

Each option carries its own `why`, per the section's own convention (`mcpSwitches.ts:12-13`). *Never
ask* says in those words that the switches become the whole gate and that the call is still recorded.
The group's hint names the verbs it covers **and** says *creating and deleting always ask*.

Placed after the ten switches and before `agentDoorsHtml(...)` (`entityFormPage.ts:428`), because the
doors footer is the "nothing agent-reachable is invisible" sentence and a never-ask entry is a new door
in it.

### 5.2 The entity form shows the EFFECTIVE policy (findings 2 and 14, accepted)

`entityFormPage.ts:412` renders `normalizeMcpAccess(d?.mcp)`, so an entry that inherits shows every
control clear. For a switch that is a mild annoyance; for this it is a lie in the one place it matters —
the form would say *Ask every time* while calls ran silently under a folder's `never`. So the entity
form is given what the folder form already has: the **resolved** policy, its source named, and the
*Inherit* option selected when there is no local answer, with the inherited value stated beside it
(*"Inherit from the folder — Projects says: never ask"*).

This does **not** extend to the ten switches in this task. Widening the whole section to render resolved
values touches every control and every one of that section's tests; it stays the follow-up it already
was, now with its reason recorded here rather than in a sentence that read as an excuse.

### 5.3 The page script

`mcpSwitchScript.ts` gains `MCP_ASK_IDS`, `mcpAskValue()` and `ask:` in `collectMcp` (`:80-89`).

**Two touched flags, not one.** `mcpTouched` (`:79`) decides whether the ladder half is emitted at all;
without a second flag, changing only the policy on an inheriting entry would post a full all-false
ladder and close it. `collectMcp` emits the ladder half when the ladder was touched, the policy key when
the policy was touched, and `undefined` when neither — which is what makes §2's two predicates real
questions rather than formalities. The two host booleans replace the single `decidedHere` (`:19`).

Choosing *Inherit from the folder* emits `ask: undefined` while still marking the policy touched, which
is how an answer is taken back — the case finding 11 named.

Radio ids join the listener loop at `:91`, so touching a radio also decides the entry — the rule at
`:77-81`.

### 5.4 The footer learns about it

`agentDoors.ts` gains `standingConsent` and a row: *"No consent prompt — an agent may use this entry
without asking."* with the command that changes it. `agentDoors.ts:7-8` currently claims the CLI alias
route has *"no consent modal"*, which is false — `handleAlias` mints and calls `perform` → `consent`
(`credsAgentServer.ts:296-320`), and `test/brokerConsentText.test.ts` asserts the dialog. The sentence is
corrected in the same task, since the change edits that footer anyway.

### 5.5 Wording elsewhere

- `entityFormPage.ts:419` — *"…Touching any switch **or the consent setting below** decides it here."*
- `describeAccess` (`mcpAccess.ts:307-315`) appends a clause, returning `''` for a resolved `'always'`
  so existing viewer tests stay green. A card that hid "never ask" would be the display-that-lies this
  repo condemns elsewhere.

---

## 6. What this plan deliberately does NOT do

| not done | why, and where it belongs |
|---|---|
| Unify with `agentConsent.ts` | Two instances, and the shapes differ where it matters: the SSH dialog stores an absolute deadline fixed at the click; a policy must store a **start**, because the current policy is read fresh at every call. Unifying would make the one path the owner excluded hostage to this module. Both files get a one-line cross-reference instead. |
| Tell the agent which entries are quiet | `McpEntry.can` (`mcpEntries.ts:112-115`, `:159-169`) must not grow the policy. The listing route is unauthenticated; a "you will not be prompted here" field is a free map of the unattended credentials, and that hand-written allow-list exists for exactly this kind of decision. |
| A second authentication gate on the MCP use door | Gate finding 12, rejected with reasons. That gate exists — it is the token door — and adding a second would re-implement it and contradict D1/the owner's decision. What the finding was right about is done instead: the §4.5 ceiling, the §5.4 footer row, the §4.6 audit line, and an integration test that shows an unapproved local caller succeeding against a never-ask entry, recorded in `research/module_tests.md` under *what it does not prove*. |
| Resolved rendering for the ten switches | §5.2 — the policy gets it because the policy is the thing that can act silently. The switches stay as they are in this task. |
| A sixth icon bit or a new badge stripe | Every bit doubles the generated glyph set (`mcpAccess.ts:283-287`), and a stripe is a ladder position. The disclosure goes to the form, the viewer card, the doors footer and the log. |
| A grants / consents revocation **screen** | [PLAN_product_improvements.md](../todo/PLAN_product_improvements.md) — see §11. |
| A policy on the create and folder doors | D2. The seam is in place; it is a one-line change when asked for. |
| A confirmation when a person *chooses* "never ask" | Proposed and **not** built: the option's `why` says what it gives up, and a modal to confirm a setting that exists to remove modals needs the owner's word. Carried to the end of the summary as an open question. |

---

## 7. Growth budget

| surface | size | who retires it | interrupted? |
|---|---|---|---|
| `credSshManager.mcpConsentStamps` in `globalState` | one record per entry consented under `every12h`: a short key plus `{at, rungs}` ≈ **120 B**. Ten open entries ≈ 1.2 KB. | **Expired first, then oldest, on write** (§3.2). Expiry alone bounds it to "entries consented in the last 12 hours"; the 256 cap makes the worst case ≈ **30 KB, always**. | Nothing is in flight. The stamp is written after an Allow; a crash mid-call leaves no half state and needs no startup sweep — §3.1 says why presence grants nothing. |
| `ask` on the vault record | one short string per entry that sets one; rides the existing sync and the existing share strip | the entry's own deletion | n/a |

A deleted entry's stamp is unreachable (the Trash short-circuits resolution, `mcpAccess.ts:186-189`), a
changed ladder fails the `rungs` comparison, and a changed policy is read fresh — so nothing needs an
eager sweep, which would be a second road that can only get out of step.

**Revocation:** one command, `CredsForDevs: Forget agent consents on this machine`, clearing the key.
Machine-local, instant, no sync. It gets a test that invokes the **registered command**, reads the real
`globalState` key back, and then observes the next eligible call prompting (finding 18, accepted) — a
revocation nobody has watched revoke is a menu entry, not a control. There is no per-entry Forget:
choosing *Ask every time* is already that, because the policy is read at every call.

---

## 8. Build order — each regression test lands BEFORE the code it pins

Findings 17, accepted: a test written after the change it covers cannot be watched failing for the right
reason. So the order is per behaviour, not per layer. Every step marked **RED** is run and its failure
message recorded before the step after it is written.

| # | step | file |
|---|---|---|
| 1 | **RED** — the throttle test: six silent calls, the sixth refused today | `test/brokerMcpRoutes.test.ts` |
| 2 | the model: `McpAskPolicy`, `ask?`, `askPolicy()`, both closed-world builders, `answersLadder`/`answersPolicy`, `nearestWhere`, per-axis `resolveMcpInTree`, `ladderKey`, `describeAccess` | `src/mcpAccess.ts` |
| 3 | its tests: key-set round trip, both inheritance axes, the policy-only folder that must not close its branch | `test/mcpAccess.test.ts` |
| 4 | the decision and the store: `consentDue`, `ASK_WINDOW_MS`, `ConsentStampStore`, serialized write-through, prune-then-cap | `src/mcpConsentPolicy.ts` |
| 5 | its tests, including both clock-skew directions, the stale-but-present stamp, the concurrent two-entry write, the `rungs` mismatch | `test/mcpConsentPolicy.test.ts` |
| 6 | the lookup seam: `UsableEntry.access`, `preConsented` never computed for a delete, `rememberMcpConsent` | `src/mcpEntries.ts`, `src/mcpHooks.ts`, `src/brokerRequests.ts` |
| 7 | the door: `admit(res, prompts)`, `release(prompts)`, `preConsent`, `note.via`, `handleMcpUse` reordered, the §4.5 ceiling | `src/brokerMcpDoor.ts`, `src/brokerFolderDoor.ts`, `src/credsAgentServer.ts`, `src/brokerHooks.ts` |
| 8 | **GREEN** — step 1 passes; the rest of the broker suite (D2, the escalation, the tombstone, the non-sliding window, the audit line) | `test/brokerMcpRoutes.test.ts` |
| 9 | wiring | `src/extension.ts` |
| 10 | the controls: `MCP_ASK_CHOICES`, `mcpAskHtml`, the page script's second flag, both forms, the resolved rendering of §5.2 | `src/mcpSwitches.ts`, `src/mcpSwitchScript.ts`, `src/entityFormPage.ts`, `src/folderFormPage.ts` |
| 11 | their tests, and the doors footer with its corrected sentence | `test/…`, `src/agentDoors.ts` |
| 12 | the Forget command, and the test that watches it revoke | `src/commands/`, `package.json` |
| 13 | the itest leg | `scripts/creds-mcp-itest.cjs` |
| 14 | the claims that stop being true, regenerated contract | `README.md`, `src_mcp/src/Program.cs`, `contract/mcp-tools-v1.json` |
| 15 | the record | `CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md`, the help article in **all five** languages |

`credsAgentServer.ts` is **744** lines against an 800 ceiling (`eslint.config.mjs:28`); this adds ≈30, so
nothing needs extracting. `.size-baseline.json` ratchets `src/extension.ts` at 1052 and only ratchets
down — the added lines raise the baseline in the same commit, with the reason in the message.

## 9. Test plan

Every claim is **observed**, never asserted about configuration. The harness already exposes what is
needed: `dialogs`, `ran`, `audit`, `presence` (`test/brokerWorld.ts:130-176`).

**9.1 Pure — `test/mcpConsentPolicy.test.ts`**
`'always'` asks · `'never'` never asks · an unrecognised word resolves to `'always'` and asks ·
`'every12h'` with no stamp asks, inside the window does not, **at exactly `+12h` asks** (the boundary is
`>`, inherited from `withinAllowWindow`) · **a stamp from the future asks** · **a stamp still in the
store after 13 h asks** — expiry is arithmetic, not presence · a non-numeric `at` asks · a clock set
back asks · **two consents settling concurrently both survive** · the prune drops expired before the cap
drops oldest, and an update to an existing key evicts nothing · the cap holds at 256.

**9.2 Pure — `test/mcpAccess.test.ts`**
Round-trip **key-set** completeness: an access with every field at a non-default value survives
`readMcpAccess` → `normalizeMcpAccess` with an equal key set. This is the only protection against the
silent-vanish of §1.3, since TypeScript will not flag a forgotten optional. Plus both axes: a
policy-only folder **does not close the branch below it**; an entry with its own ladder still inherits
the folder's policy; a child's `'always'` **overrides** a folder's `'never'`; `Inherit` on a child with
a policy-set folder resolves to the folder's; nothing anywhere resolves to `'always'`; a policy-only
folder gives `anyAgentAccess === false`.

**9.3 Through the real broker — `test/brokerMcpRoutes.test.ts`**
1. a silent call runs with `dialogs.length === 0`, leaves `presence === 0`, and writes an audit line
   whose `outcome` is `allowed without a prompt` and whose `via` is `mcp`;
2. **D5, the RED test of step 1**: six silent calls in a row all return 200 — the sixth is
   `too_many_requests` before the change;
3. its mirror: an entry that prompts is still refused at the sixth, so the modal defence is intact;
4. **§4.5**: the 61st silent call in a minute IS refused — the ceiling exists and is observed;
5. **D2**: `/v1/mcp/delete` on that same entry still raises a dialog, and so does `/v1/mcp/create`;
6. the escalation: consent under `{view,use}`, turn on `edit`, call `rotate` inside the window — **a
   dialog appears**, because `rungs` is compared against the ladder resolved now;
7. a denied grant plus a never-ask entry is still denied — a tombstone outranks a policy;
8. the window does not slide: a silent call inside it does not move the stamp (fake clock).

**9.4 Forms** — exactly one radio checked; the checked one matches the **resolved** policy; an
inheriting entry shows *Inherit* with the folder's answer named; choosing *Inherit* posts
`ask: undefined` and still counts as touched; the radios are absent inside the Trash; a policy-only save
posts no ladder half.

**9.5 The Forget command** — invoked as the registered command, the real `globalState` key read back
empty, and the next eligible call observed prompting.

**9.6 `readmeClaims.test.ts`** — `MCP_SWITCHES.length === 10` and the "Ten switches" sentence stay green
untouched. Deliberately made red: the README's *"a prompt on every single call"* claims join `BANNED`,
so they cannot quietly come back.

**9.7 `scripts/creds-mcp-itest.cjs`** — one leg, and it is the safe kind: a pre-consent leg raises
**zero** prompts, so it spends none of the five-per-minute budget and cannot starve a later level. That
trap is recorded at `:452-457` and cost three unrelated failures once. Six quiet calls succeeding end to
end is D5 through the real binary; one delete on the same entry is D2; and **one unapproved local caller
reaching a never-ask entry succeeds**, which is the boundary finding 12 asked to see rather than assume.
`scripts/agent-broker-itest.cjs` needs no leg — it drives the token and alias doors, which D1 excludes.

**9.8 `research/module_tests.md`** (finding 16, accepted) — the flow catalogue gains quiet use,
forced-prompt delete/create, and the unattended-caller boundary, each `covered` or `not covered with its
reason`, plus what the harness does **not** prove.

## 10. Security notes for the review

1. **"Never ask" makes the switches the whole gate.** Per entry, never global, never a VS Code setting;
   the `why` says it in those words. The remaining controls are the ladder, the §4.5 ceiling and the log.
2. **On a folder it reaches entries that do not exist yet** — a folder set to `never` pre-consents every
   credential created in it afterwards. The folder form already says its blast radius out loud; that
   sentence must now cover this too.
3. **The prompt was also the rate limiter** (`aliasThrottle.ts:1-25`). §4.5 replaces it for silent calls
   with a ceiling that bounds a runaway loop without refusing a dialog nobody would see.
4. **`globalState` is writable by anything running as this user**, so a window could be extended by
   writing a future timestamp — which is what §3.1's `at <= now` guard refuses.
5. **The idle auto-lock is unchanged**, and that is itself the finding: agent traffic already does not
   postpone it, and a never-ask entry on an idle machine is usable by anything that reaches the loopback
   port. §9.7 makes that a test rather than a sentence, and §9.8 records it where a reader will find it.

## 11. Boundaries with other open plans

**[PLAN_product_improvements.md](../todo/PLAN_product_improvements.md)** (the shared screen of active grants and
code-access keys with revocation): this plan owns the stored policy, the machine-local stamp store and
its retirement, the form control, the doors-footer row and the Forget command. That plan owns the
cross-cutting screen; when built it lists live consent windows as a **third row type** beside grants and
code-access keys, reading them from this module rather than re-deriving them, and it does not own the
policy control. This plan adds no list view and touches nothing about code-access keys. The same
paragraph is in that plan.

**[PLAN_tails_2.md](../todo/PLAN_tails_2.md)** §1.1 proposes an **eleventh** switch, reasoning that the form is
built from `MCP_SWITCHES` so the cost is one catalog entry. The two collide only at the guards: this plan
leaves `MCP_SWITCHES` at ten and adds a second, separately-guarded builder, so that plan still only adds
a row — and must not reuse the ask-choices catalog for a permission. The same paragraph is in that plan.

## 12. What the gate changed (round 1, 2026-09-16)

`good_enough`, all three reviewers answered, 19 findings, 16 accepted.

| accepted | what it changed here |
|---|---|
| 11, 13 — no way back to inheriting; no entry-level override of a folder's `never` | §1.1 gains `'always'` and absence becomes *inherit*; §5.1 becomes four options. **A reversal of the first draft, and the right one.** |
| 2, 14 — the form shows the wrong effective policy | §5.2: the entity form renders the resolved policy and its source |
| 8, 15 — concurrent `globalState` writes lose a stamp | §3.2: serialized write-through over `serialQueue.ts` |
| 9 — silent calls were left with no ceiling at all | §4.5: a separate 60-a-minute request ceiling, decoupled from the modal budget |
| 4, 10 — eviction could drop a live window | §3.2: expired first, then oldest, on write; an update never evicts |
| 0, 1 — stale stamps, clock skew | §3.1: expiry is arithmetic, both skew directions tabled and tested |
| 3 | §3.2: `rungs` compared against the ladder resolved NOW, with §9.3.6 to prove it |
| 7 | §4.6/§9.3.1: the audit line's `outcome` and `via` are asserted |
| 16 | §9.8: `research/module_tests.md` joins the Definition of Done |
| 17 | §8: the throttle test is step 1, watched failing before the code that fixes it |
| 18 | §7/§9.5: the Forget command is invoked and watched revoking |

Rejected, with reasons recorded at the gate: **5** (no transition to define — the policy is read fresh
every call and the stamp is only consulted under `every12h`), **6** (already built: each option carries
permanent `why` text, which outlives a tooltip), **12** (a second authentication gate on the MCP door
would re-implement the token door and contradict D1 — the evidence half of that finding is built
instead, see §6 and §9.7).

## Definition of Done

- [ ] `npm run typecheck`, `npm run lint`, `npm run ratchet` clean; `npm test` green with the new suites.
- [ ] `npm run itest:mcp` green **including** the new quiet leg; `npm run itest:agent` unchanged and green.
- [ ] The step-1 throttle test was watched **failing first** against unmodified code, and its failure
      message is reported beside the pass.
- [ ] `dotnet build dew_flow_creds_for_devs.slnx` — 0 warnings.
- [ ] No claim anywhere says every call asks: README, `src_mcp/src/Program.cs`, the regenerated
      `contract/mcp-tools-v1.json`, and the help article in all five languages.
- [ ] `research/module_extension.md` updated (the consent paragraph, the Agent-access section, the
      "where each piece lives" table) and `research/module_tests.md` carries the three new flows.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass; this plan promoted
      with its deviations recorded.
- [ ] The `coai` gate: the plan round is recorded above; a `review_code` round ran on every story, every
      finding resolved with `accept` or a reasoned `reject`, and the summary reports the verdicts **and**
      how many reviewers answered.
